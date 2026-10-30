"""Unit tests for Tracenza AICTE APH Rule Engine, Pipeline Stages, Obligations, and Ledger."""

from decimal import Decimal
import uuid
import pytest
from app.core.database import SessionLocal
from app.models.application import Application, ApplicationCategory, ApplicationStatus, WorkflowStage
from app.models.compliance_rule import ComplianceRule, RuleCategory
from app.models.user import User, UserRole
from app.models.validation_result import Severity
from app.services import rule_engine
from app.services.audit_service import audit_service
from app.services.obligation_service import obligation_service
from app.services.pipeline import pipeline_service


@pytest.fixture
def db(client):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_rule_engine_exact_decimal_arithmetic():
    """Verify deterministic Decimal evaluation of APH faculty, cadre, and area formulas."""
    app = Application(
        id=uuid.uuid4(),
        application_number="AICTE-2026-TEST01",
        institution_id=uuid.uuid4(),
        institution_name="Test Engineering College",
        category=ApplicationCategory.EOA,
        academic_year="2026-2027",
        status=ApplicationStatus.SUBMITTED,
        requested_intake=240,
    )

    facts = rule_engine.build_facts(app, docs=[], records=None, program_years=4)

    # Sanctioned intake: 240 * 4 = 960 total students
    assert facts["computed.total_students"] == 960

    # 1:15 norm: ceil(960 / 15) = 64 faculty
    assert facts["computed.faculty_required_1_15"] == 64

    # 1:20 norm: ceil(960 / 20) = 48 faculty
    assert facts["computed.faculty_required_1_20"] == 48

    # Cadre norm (1:2:6): Professors = ceil(faculty / 9)
    # For 64 faculty -> ceil(64 / 9) = 8 professors
    assert facts["computed.professors_required_1_15"] == 8

    # Classroom minimum norm: 66 sqm
    assert facts["computed.min_classroom_norm_sqm"] == Decimal("66.0")

    # Evaluate expression with trace
    trace = []
    result = rule_engine.evaluate_expr("ceil(computed.total_students / 15)", facts, trace)
    assert result == Decimal(64)
    assert len(trace) >= 1
    assert "960" in trace[0] and "64" in trace[0]


def test_rule_evaluation_handbook_citations():
    """Verify rule evaluation carries explicit APH clause references and RAG labels."""
    rule = ComplianceRule(
        rule_code="COMP-FAC-03",
        title="Student : Faculty Ratio 1:20",
        category=RuleCategory.ACADEMIC,
        severity=Severity.CRITICAL,
        description="Faculty ratio check per APH Appendix 7",
        handbook_reference="APH 2026-27, Appendix 7, Clause 7.1",
        conditions={
            "check": {
                "fact": "computed.total_students",
                "op": ">=",
                "value": 100,
                "label": "Total enrolled students",
            },
            "clause": "Faculty : Student ratio of 1:20 for UG engineering programmes.",
        },
    )

    facts = {"computed.total_students": 240}
    res = rule_engine.evaluate_rule(rule, facts)

    assert res["rag"] == "green"
    assert res["handbook_reference"] == "APH 2026-27, Appendix 7, Clause 7.1"
    assert "Clause 7.1" in res["handbook_reference"]
    assert len(res["trace"]) > 0


def test_obligation_tracking_and_multichannel_dispatch(db):
    """Verify uniform obligation extraction and multi-channel alert dispatch."""
    inst_user = User(
        email=f"director_{uuid.uuid4().hex[:6]}@test-engg.edu.in",
        hashed_password="hash",
        full_name="Dr. Director",
        role=UserRole.INSTITUTION,
        institution_name="Test Institute of Tech",
    )
    db.add(inst_user)
    db.commit()

    app = Application(
        application_number=f"AICTE-2026-{uuid.uuid4().hex[:6].upper()}",
        institution_id=inst_user.id,
        institution_name=inst_user.institution_name,
        category=ApplicationCategory.EOA,
        status=ApplicationStatus.SUBMITTED,
        stage=WorkflowStage.SCRUTINY.value,
    )
    db.add(app)
    db.commit()

    obs = obligation_service.extract_obligations_for_application(db, app)
    assert isinstance(obs, list)
    # Mandatory undertakings should be extracted
    assert any(o["obligation_type"] == "mandatory_undertaking" for o in obs)

    # Test multi-channel alert dispatch formatting
    ob = obs[0]
    dispatch = obligation_service.dispatch_multichannel_alert(ob)
    assert "email" in dispatch["channels"]
    assert "sms" in dispatch["channels"]
    assert "whatsapp" in dispatch["channels"]
    assert dispatch["channels"]["sms"]["sent"] is True
    assert dispatch["channels"]["whatsapp"]["sent"] is True


def test_pipeline_stage_routing_and_officer_audit(db):
    """Verify officer-driven stage routing with mandatory audit justifications."""
    officer = User(
        email=f"officer_{uuid.uuid4().hex[:6]}@aicte-india.org",
        hashed_password="hash",
        full_name="Sri P. Sharma",
        role=UserRole.SCRUTINY,
    )
    inst_user = User(
        email=f"head_{uuid.uuid4().hex[:6]}@polytechnic.edu.in",
        hashed_password="hash",
        full_name="Prof. Verma",
        role=UserRole.INSTITUTION,
    )
    db.add_all([officer, inst_user])
    db.commit()

    app = Application(
        application_number=f"AICTE-2026-{uuid.uuid4().hex[:6].upper()}",
        institution_id=inst_user.id,
        institution_name="Govt Polytechnic",
        category=ApplicationCategory.EOA,
        status=ApplicationStatus.SUBMITTED,
        stage=WorkflowStage.SCRUTINY.value,
    )
    db.add(app)
    db.commit()

    # Attempt transition without adequate reason (< 10 chars) should fail
    with pytest.raises(ValueError, match="at least 10 characters"):
        pipeline_service.transition_stage(
            db=db,
            app=app,
            to_stage=WorkflowStage.EVC,
            officer=officer,
            reason="short",
        )

    # Valid transition with written justification
    valid_reason = "Physical verification needed for computer center terminal ratio."
    updated = pipeline_service.transition_stage(
        db=db,
        app=app,
        to_stage=WorkflowStage.EVC,
        officer=officer,
        reason=valid_reason,
        committee_notes="Schedule inspection within 15-day window",
    )
    assert updated.stage == WorkflowStage.EVC.value

    # Verify cryptographic audit entry was appended to ledger
    logs = audit_service.get_application_logs(db, app.id)
    assert len(logs) >= 1
    latest_log = logs[0]
    assert latest_log.action == "STAGE_TRANSITION"
    assert latest_log.details["to_stage"] == "EVC"
    assert latest_log.details["reason"] == valid_reason
    assert latest_log.entry_hash is not None


def test_audit_ledger_chain_integrity(db):
    """Verify hash chain verification confirms ledger integrity."""
    audit_service.log_event(
        db=db,
        action="TEST_ACTION_01",
        details={"note": "first entry"},
    )
    audit_service.log_event(
        db=db,
        action="TEST_ACTION_02",
        details={"note": "second entry"},
    )

    result = audit_service.verify_chain(db)
    assert result["valid"] is True
    assert result["entries_checked"] >= 2
    assert len(result["problems"]) == 0
