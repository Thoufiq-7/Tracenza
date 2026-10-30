"""Compliance rules: AICTE Approval Process Handbook (APH) checklist, versioned edits, and deterministic per-application evaluation."""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.compliance_rule import ComplianceRule, RuleCategory
from app.models.document import Document
from app.models.validation_result import Severity
from app.schemas.compliance import ComplianceEvaluationResponse, ComplianceCheckItem
from app.services import rule_engine
from app.services.records_service import records_service

SCHEMA_VERSION = 7
ALL_EXISTING = ["eoa", "change_intake", "closure", "other"]

# Exact AICTE Approval Process Handbook (APH 2026-27) Statutory Rules
DEFAULT_RULES: list[dict[str, Any]] = [
    {
        "rule_code": "COMP-FIRE-01",
        "title": "Valid Fire Safety NOC",
        "category": RuleCategory.SAFETY,
        "severity": Severity.WARNING,
        "description": "Fire Safety NOC issued by the State Fire Services, valid on the assessment date.",
        "handbook_reference": "APH 2026-27, Appendix 6, Clause 6.1",
        "conditions": {
            "requires_doc": "fire_safety",
            "check": {"fact": "docs.fire_safety.valid_until_iso", "op": "valid_on", "label": "Fire NOC validity"},
            "clause": "The institution shall hold a valid Fire Safety Certificate / NOC issued by the competent authority for all buildings used for academic purposes.",
            "fix_hint": "Upload the current Fire Safety Certificate / NOC issued by the State Fire Services.",
        },
    },
    {
        "rule_code": "COMP-LAND-02",
        "title": "Minimum Land Area (Title Deed)",
        "category": RuleCategory.INFRASTRUCTURE,
        "severity": Severity.CRITICAL,
        "description": "Contiguous registered land in the Trust/Society's name meeting the minimum area for the category/location.",
        "handbook_reference": "APH 2026-27, Appendix 4, Clause 4.1",
        "conditions": {
            "requires_doc": "land_document",
            "check": {"fact": "docs.land_document.land_area_acres", "op": ">=", "value": 2.5, "unit": "acres", "label": "Land area"},
            "clause": "Minimum land requirement for Technical Institutions: 2.5 acres (Mega/Metro/Urban) to 7.5 acres (Rural) contiguous land in the lawful possession of the applicant Trust/Society.",
            "fix_hint": "Upload the registered title deed or government allotment order showing the full contiguous land area.",
        },
    },
    {
        "rule_code": "COMP-FAC-03",
        "title": "Student : Faculty Ratio 1:20",
        "category": RuleCategory.ACADEMIC,
        "severity": Severity.CRITICAL,
        "description": "Sanctioned intake faculty norm: regular faculty ≥ total students / 20.",
        "handbook_reference": "APH 2026-27, Appendix 7, Clause 7.1",
        "conditions": {
            "requires_doc": "faculty_list",
            "check": {
                "fact": "docs.faculty_list.total_faculty",
                "op": ">=",
                "value": {"expr": "ceil(app.requested_intake * computed.program_years / 20)"},
                "label": "Regular faculty",
            },
            "clause": "Faculty : Student ratio of 1:20 for UG engineering programmes, computed on the total sanctioned intake across all years of the programme.",
            "fix_hint": "Declare regular faculty so that faculty ≥ (intake × programme years) / 20, and upload the authenticated faculty roster.",
        },
    },
    {
        "rule_code": "COMP-CADRE-12",
        "title": "Faculty Cadre Ratio 1:2:6 (Professors)",
        "category": RuleCategory.ACADEMIC,
        "severity": Severity.CRITICAL,
        "description": "Professors ≥ one-ninth of the required faculty (Cadre ratio Professor : Associate : Assistant = 1 : 2 : 6).",
        "handbook_reference": "APH 2026-27, Appendix 7, Clause 7.2",
        "conditions": {
            "requires_doc": "faculty_list",
            "check": {
                "fact": "docs.faculty_list.professors_count",
                "op": ">=",
                "value": {"expr": "ceil(ceil(app.requested_intake * computed.program_years / 20) / 9)"},
                "label": "Professors",
            },
            "clause": "Cadre ratio of Professor : Associate Professor : Assistant Professor = 1 : 2 : 6 across approved departments.",
            "fix_hint": "Appoint or declare Professors in line with the 1:2:6 cadre ratio specified in APH Appendix 7.",
        },
    },
    {
        "rule_code": "COMP-FIN-04",
        "title": "Audited Financials with ICAI UDIN",
        "category": RuleCategory.FINANCIAL,
        "severity": Severity.WARNING,
        "description": "Audited statements certified by a practising Chartered Accountant bearing an authentic 18-character UDIN.",
        "handbook_reference": "APH 2026-27, Chapter I, Clause 1.3",
        "conditions": {
            "requires_doc": "audit_report",
            "check": {"fact": "docs.audit_report.udin", "op": "exists", "label": "ICAI UDIN"},
            "clause": "Audited statement of accounts certified by a Chartered Accountant, bearing a UDIN generated on the ICAI portal.",
            "fix_hint": "Upload the audited statement of accounts carrying the Chartered Accountant's valid 18-character UDIN.",
        },
    },
    {
        "rule_code": "COMP-STAT-05",
        "title": "Notarised Affidavit on e-Stamp Paper",
        "category": RuleCategory.STATUTORY,
        "severity": Severity.WARNING,
        "description": "Affidavit on non-judicial / e-stamp paper affirming adherence to AICTE norms.",
        "handbook_reference": "APH 2026-27, Appendix 1, Format 1",
        "conditions": {
            "requires_doc": "affidavit",
            "check": {"fact": "docs.affidavit.stamp_certificate_no", "op": "exists", "label": "e-Stamp certificate number"},
            "clause": "An affidavit in the prescribed format on non-judicial stamp paper or e-stamp, duly notarised.",
            "fix_hint": "Upload the notarised affidavit on e-stamp paper with a legible certificate number.",
        },
    },
    {
        "rule_code": "COMP-NOC-06",
        "title": "Valid NOC from Affiliating University",
        "category": RuleCategory.STATUTORY,
        "severity": Severity.WARNING,
        "description": "NOC / affiliation consent valid for the applied academic year.",
        "handbook_reference": "APH 2026-27, Chapter I, Clause 1.4",
        "conditions": {
            "requires_doc": "noc",
            "check": {"fact": "docs.noc.valid_until_iso", "op": "valid_on", "label": "University NOC validity"},
            "clause": "NOC / consent of affiliation from the affiliating University valid for the academic year applied for.",
            "fix_hint": "Upload the current NOC / affiliation certificate from the affiliating university.",
        },
    },
    {
        "rule_code": "COMP-BLD-07",
        "title": "Classroom Carpet Area ≥ 66 m²",
        "category": RuleCategory.INFRASTRUCTURE,
        "severity": Severity.CRITICAL,
        "description": "Sanctioned building plan; the smallest classroom must be at least 66 m² carpet area.",
        "handbook_reference": "APH 2026-27, Appendix 4, Clause 4.2",
        "conditions": {
            "requires_doc": "building_plan",
            "check": {
                "fact": "docs.building_plan.min_classroom_area_sqm",
                "op": ">=",
                "value": 66,
                "unit": "sqm",
                "label": "Smallest classroom",
            },
            "clause": "Minimum carpet area of each classroom shall be 66 m² (instructional area norms per APH Appendix 4).",
            "fix_hint": "Upload the sanctioned building plan with room-wise carpet areas; classrooms must meet the 66 m² minimum.",
        },
    },
    {
        "rule_code": "COMP-LAB-08",
        "title": "Computing Facilities & Workstations",
        "category": RuleCategory.INFRASTRUCTURE,
        "severity": Severity.CRITICAL,
        "description": "Photo/video evidence of the computer lab showing the required workstations.",
        "handbook_reference": "APH 2026-27, Appendix 5, Clause 5.1",
        "conditions": {
            "requires_doc": "lab_photo",
            "check": {"fact": "infra.computer", "op": ">=", "value": 15, "unit": "count", "label": "Computer workstations visible"},
            "clause": "Computing facilities as prescribed for the approved intake (terminals per student ratio); workstations must be installed and operational.",
            "fix_hint": "Upload clear wide-angle photos or a walkthrough video of each operational computer lab.",
        },
    },
    {
        "rule_code": "COMP-TER-09",
        "title": "TER Fee Paid for Academic Year",
        "category": RuleCategory.FINANCIAL,
        "severity": Severity.WARNING,
        "applies_to": ALL_EXISTING,
        "description": "TER / processing fee recorded as paid in AICTE records.",
        "handbook_reference": "APH 2026-27, Chapter I, Clause 1.2",
        "conditions": {
            "check": {"fact": "records.ter_payment_current", "op": "==", "value": "paid", "label": "TER payment status"},
            "fail_rag": "amber",
            "clause": "Processing / TER fee for the academic year shall be remitted through the AICTE portal.",
            "fix_hint": "Pay the TER fee on the AICTE portal; payment is not yet reflected in AICTE records.",
        },
    },
    {
        "rule_code": "COMP-DEF-10",
        "title": "Closure of Previous Cycle Deficiencies",
        "category": RuleCategory.STATUTORY,
        "severity": Severity.WARNING,
        "applies_to": ALL_EXISTING,
        "description": "Deficiencies recorded in the previous approval cycle are closed and confirmed.",
        "handbook_reference": "APH 2026-27, Chapter II, Clause 2.3",
        "conditions": {
            "check": {"fact": "records.open_deficiency_count", "op": "==", "value": 0, "unit": "count", "label": "Open deficiencies on record"},
            "fail_rag": "amber",
            "clause": "Compliance to deficiencies pointed out in the previous approval cycle shall be submitted and verified before renewal.",
            "fix_hint": "Submit compliance evidence for deficiencies raised in the previous cycle.",
        },
    },
    {
        "rule_code": "COMP-INT-11",
        "title": "Intake Within Sanctioned Limits",
        "category": RuleCategory.ACADEMIC,
        "severity": Severity.CRITICAL,
        "applies_to": ["eoa"],
        "description": "An EoA application cannot exceed sanctioned intake without an approved Change-in-Intake request.",
        "handbook_reference": "APH 2026-27, Chapter II, Clause 2.1",
        "conditions": {
            "check": {"fact": "app.requested_intake", "op": "<=", "value": {"fact": "records.approved_intake"}, "unit": "count", "label": "Requested intake"},
            "on_missing_fact": "skip",
            "clause": "Extension of Approval is for the existing approved intake; any increase requires a separate Change-in-Intake application.",
            "fix_hint": "Apply for the approved intake, or file a formal Change-in-Intake application.",
        },
    },
    {
        "rule_code": "COMP-GEO-13",
        "title": "Campus Geodesic Boundary vs Title Deed (±5%)",
        "category": RuleCategory.INFRASTRUCTURE,
        "severity": Severity.CRITICAL,
        "description": "Geodesic area of the submitted campus boundary within 5% of the land area on the title deed.",
        "handbook_reference": "APH 2026-27, Appendix 4, Clause 4.3",
        "conditions": {
            "requires_doc": "campus_boundary",
            "check": {
                "expr": "abs(spatial.boundary_area_acres - docs.land_document.land_area_acres) / docs.land_document.land_area_acres * 100",
                "op": "<=",
                "value": 5,
                "label": "Boundary vs deed area deviation (%)",
            },
            "on_missing_fact": "skip",
            "clause": "Contiguous land boundary shall correspond to the registered title deed; the surveyed polygon is compared against the deed acreage.",
            "fix_hint": "Upload the campus boundary (GeoJSON/KML from a licensed surveyor) matching the land area in the title deed.",
        },
    },
    {
        "rule_code": "COMP-GEO-14",
        "title": "Sanctioned Master Plan Footprint vs Observed Buildings (±15%)",
        "category": RuleCategory.INFRASTRUCTURE,
        "severity": Severity.CRITICAL,
        "description": "Built-up area in the sanctioned plan consistent with the buildings existing on campus (±15%).",
        "handbook_reference": "APH 2026-27, Appendix 4, Clause 4.4",
        "conditions": {
            "requires_doc": "campus_boundary",
            "check": {"fact": "spatial.footprint_vs_plan_deviation_pct", "op": "<=", "value": 15, "label": "Footprint vs plan deviation (%)"},
            "clause": "Built-up area claimed in the sanctioned plan shall be consistent with the physical structures on the campus.",
            "fix_hint": "Ensure the building plan's built-up area reflects constructed buildings; upload the completion certificate if recently constructed.",
        },
    },
    {
        "rule_code": "COMP-ASSET-15",
        "title": "Laboratory Equipment Asset Register",
        "category": RuleCategory.INFRASTRUCTURE,
        "severity": Severity.WARNING,
        "description": "Stock register of laboratory equipment with make, model and serial number of each item.",
        "handbook_reference": "APH 2026-27, Appendix 5, Clause 5.2",
        "conditions": {
            "requires_doc": "asset_register",
            "check": {"fact": "docs.asset_register.equipment_count", "op": ">=", "value": 1, "unit": "count", "label": "Equipment listed"},
            "clause": "Laboratory equipment as prescribed by the curriculum shall be entered in the central asset register.",
            "fix_hint": "Upload the certified equipment stock register listing make, model and serial numbers.",
        },
    },
]


class ComplianceService:
    def seed_default_rules(self, db: Session) -> None:
        """Insert missing default rules and upgrade rules in place to current APH schema."""
        changed = False
        for spec in DEFAULT_RULES:
            existing = db.query(ComplianceRule).filter(ComplianceRule.rule_code == spec["rule_code"]).first()
            conditions = {**spec["conditions"], "schema": SCHEMA_VERSION}
            ref = spec.get("handbook_reference", "AICTE APH 2026-27")
            if existing is None:
                db.add(ComplianceRule(
                    rule_code=spec["rule_code"],
                    title=spec["title"],
                    category=spec["category"],
                    description=spec["description"],
                    conditions=conditions,
                    severity=spec["severity"],
                    applies_to=spec.get("applies_to", []),
                    version=1,
                    is_active=True,
                    handbook_reference=ref,
                ))
                changed = True
            elif (existing.conditions or {}).get("schema") != SCHEMA_VERSION:
                existing.title, existing.description = spec["title"], spec["description"]
                existing.conditions, existing.severity = conditions, spec["severity"]
                existing.applies_to = spec.get("applies_to", [])
                existing.handbook_reference = ref
                existing.version = (existing.version or 1) + 1
                changed = True
        if changed:
            db.commit()

    def active_rules(self, db: Session) -> list[ComplianceRule]:
        return db.query(ComplianceRule).filter(ComplianceRule.is_active.is_(True)).order_by(ComplianceRule.rule_code).all()

    def checklist(self, db: Session, app: Application) -> list[dict[str, Any]]:
        """Documents required for this application's category (drives the institution upload checklist)."""
        out, seen = [], set()
        for r in self.active_rules(db):
            req = (r.conditions or {}).get("requires_doc")
            if req and req not in seen and rule_engine.rule_applies(r, app):
                seen.add(req)
                out.append({
                    "doc_type": req,
                    "rule_code": r.rule_code,
                    "title": r.title,
                    "description": r.description,
                    "fix_hint": (r.conditions or {}).get("fix_hint"),
                    "handbook_reference": r.handbook_reference,
                })
        return out

    def evaluate(
        self,
        db: Session,
        app: Application,
        docs: list[Document] | None = None,
        records: dict[str, Any] | None = None,
        records_status: str | None = None,
    ) -> list[dict[str, Any]]:
        if docs is None:
            docs = [d for d in app.documents if d.is_current]
        if records_status is None:
            records, records_status = records_service.fetch(app)
        facts = rule_engine.build_facts(app, docs, records, records_status)
        return [rule_engine.evaluate_rule(r, facts) for r in self.active_rules(db) if rule_engine.rule_applies(r, app)]

    def evaluate_compliance(self, db: Session, application_id: uuid.UUID) -> ComplianceEvaluationResponse:
        app = db.query(Application).filter(Application.id == application_id).first()
        if not app:
            raise ValueError("Application not found")
        outcomes = self.evaluate(db, app)
        items = [
            ComplianceCheckItem(
                rule_code=o["rule_code"],
                title=o["title"],
                category=RuleCategory(o["category"]),
                rag=o["rag"],
                status={"green": "compliant", "red": "non_compliant", "amber": "warning"}.get(o["rag"], "not_applicable"),
                message=o["message"],
                evidence=o.get("evidence"),
                rule_version=o["rule_version"],
                expected=o.get("expected"),
                actual=o.get("actual"),
                fix_hint=o.get("fix_hint"),
                clause=o.get("clause"),
                handbook_reference=o.get("handbook_reference"),
                trace=o.get("trace") or [],
            )
            for o in outcomes
        ]
        counts = {k: sum(1 for i in items if i.rag == k) for k in ("green", "amber", "red")}
        evaluated = sum(counts.values())
        return ComplianceEvaluationResponse(
            application_id=app.id,
            total_rules_evaluated=evaluated,
            compliant_count=counts["green"],
            deficiency_count=counts["red"],
            amber_count=counts["amber"],
            compliance_score=round(counts["green"] / evaluated * 100.0, 1) if evaluated else 100.0,
            results=items,
        )


compliance_service = ComplianceService()
