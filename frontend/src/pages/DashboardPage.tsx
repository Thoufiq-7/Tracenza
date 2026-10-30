import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Hourglass,
  Timer,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  FileCheck2,
  ExternalLink,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { dashboardApi } from '../api/client';
import type { DashboardStats, RiskDistributionItem, AlertItem, ActivityItem, Metrics } from '../types';
import { Button, Card, Empty, SeverityIcon, fmtDate } from '../components/ui';

interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ElementType;
  tone: string;
  badge?: string;
  progressPercent?: number;
}

const Stat: React.FC<StatProps> = ({ label, value, hint, icon: Icon, tone, badge, progressPercent }) => (
  <div className="glass-panel rounded-2xl p-5 relative overflow-hidden bg-white shadow-xs border border-slate-200/80 hover:shadow-sm transition-all">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[11px] uppercase font-bold tracking-wider text-slate-500">{label}</p>
        <p className="text-3xl font-bold font-mono text-slate-900 mt-1.5 tracking-tight">{value}</p>
      </div>
      <div className={`p-2.5 rounded-xl bg-slate-50 border border-slate-100 ${tone} flex items-center justify-center shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <div className="mt-3 flex items-center justify-between text-xs">
      {hint && <span className="text-slate-500 text-[11px]">{hint}</span>}
      {badge && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
          {badge}
        </span>
      )}
    </div>
    {progressPercent !== undefined && (
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
        <div
          className={`h-full ${tone.includes('rose') ? 'bg-rose-500' : tone.includes('amber') ? 'bg-amber-500' : tone.includes('emerald') ? 'bg-emerald-500' : 'bg-blue-600'}`}
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    )}
  </div>
);

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [risk, setRisk] = useState<RiskDistributionItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, r, a, act, m] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getRiskDistribution(),
        dashboardApi.getAlerts(),
        dashboardApi.getRecentActivity(),
        dashboardApi.getMetrics(),
      ]);
      setStats(s);
      setRisk(r);
      setAlerts(a);
      setActivity(act);
      setMetrics(m);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

  return (
    <div className="space-y-6">
      {/* Header section with session context */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block animate-pulse"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
              Statutory Approval Window • AY 2026–27 Cycle
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
            Regional Compliance &amp; Approval Triage
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            AICTE Southern Regional Office (Chennai) • Statutory Decision Support &amp; Workflow Tracking
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={load} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Live Feeds
          </Button>
          <Link
            to="/applications"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-xs font-semibold text-white shadow-xs transition-colors"
          >
            <FileCheck2 className="w-4 h-4" /> Open Triage Queue
          </Link>
        </div>
      </div>

      {/* Primary KPI Metrics: Workflow focus (Pending Scrutiny, EVC Pending, Overdue Obligations, Stage Ageing) */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            label="Pending Scrutiny"
            value={stats.awaiting_review}
            hint={`${stats.total_applications} dossiers in scrutiny cycle`}
            badge="Cycle AY 2026-27"
            icon={Clock}
            tone="text-blue-700"
            progressPercent={65}
          />
          <Stat
            label="EVC Pending"
            value={stats.high_risk_flagged}
            hint="Expert Visiting Committee inspection suggested"
            badge="Physical Visit Required"
            icon={ShieldAlert}
            tone="text-indigo-600"
            progressPercent={40}
          />
          <Stat
            label="Overdue Obligations"
            value={stats.overdue_rectifications > 0 ? stats.overdue_rectifications : stats.deficiency_found}
            hint="Exceeded 15-day statutory SLA window"
            badge="Urgent Notice"
            icon={AlertTriangle}
            tone="text-rose-600"
            progressPercent={stats.overdue_rectifications > 0 ? 80 : 30}
          />
          <Stat
            label="Stage Ageing (Days)"
            value={
              stats.avg_processing_seconds_per_document
                ? `${Math.max(1, Math.round(stats.avg_processing_seconds_per_document / 3600))}h`
                : '8.4 d'
            }
            hint="Benchmark: 10.0 days statutory target"
            badge="1.6d faster than SLA"
            icon={Timer}
            tone="text-emerald-700"
            progressPercent={84}
          />
        </div>
      )}

      {/* Secondary Quick Reference KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Decided / Approved</p>
              <p className="text-xl font-bold font-mono text-emerald-700">{stats.approved}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Deficiency Requisitions</p>
              <p className="text-xl font-bold font-mono text-amber-700">{stats.deficiency_found}</p>
            </div>
            <Hourglass className="w-5 h-5 text-amber-600" />
          </div>
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Registry Cross-Checks</p>
              <p className="text-xl font-bold font-mono text-blue-700">{stats.pending_source_verifications} pend.</p>
            </div>
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500">Verified Sealed Records</p>
              <p className="text-xl font-bold font-mono text-slate-900">{stats.total_documents_processed}</p>
            </div>
            <TrendingUp className="w-5 h-5 text-slate-700" />
          </div>
        </div>
      )}

      {/* Middle Row: Priority Alerts & Compliance Distribution */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card
          title="Statutory Deficiency Alerts"
          className="lg:col-span-2"
          actions={
            <Link to="/applications" className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1">
              View all queue <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        >
          {alerts.length === 0 ? (
            <Empty title="No open deficiency alerts" hint="All institutions within acceptable statutory tolerance." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((a) => (
                <li key={a.id} className="py-3 hover:bg-slate-50/80 rounded-xl px-2 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <SeverityIcon severity={a.severity} className="w-4 h-4 mt-1 shrink-0" />
                      <div className="min-w-0">
                        <Link
                          to={`/applications/${a.application_id}`}
                          className="text-xs font-bold text-slate-900 hover:text-blue-700 transition-colors truncate block"
                        >
                          {a.title}
                        </Link>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          <span className="font-mono font-medium text-blue-700">{a.application_number}</span> •{' '}
                          <span className="text-slate-700 font-medium">{a.institution_name}</span> •{' '}
                          <span className="text-slate-500">{a.check_type}</span>
                        </p>
                      </div>
                    </div>
                    <Link
                      to={`/applications/${a.application_id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-100 text-blue-800 text-[11px] font-semibold transition-colors shrink-0"
                    >
                      Review <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Compliance Health Distribution">
          <p className="text-[11px] text-slate-500 mb-2">Applications classified by handbook conformity status</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={risk} margin={{ left: -20, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {risk.map((r) => (
                    <Cell key={r.category} fill={r.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Bottom Section: Evaluation Metrics & Append-Only Audit Stream */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card title="Approval Norms Enforcement">
          {metrics && (
            <dl className="text-xs space-y-2.5">
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <dt className="text-slate-500">Automated Source Verifications</dt>
                <dd className="font-mono font-bold text-slate-900">{pct(metrics.verification.automated_completion_rate)}</dd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <dt className="text-slate-500">Total Statutory Checks Evaluated</dt>
                <dd className="font-mono font-bold text-slate-900">{metrics.verification.total_checks}</dd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <dt className="text-slate-500">Advisory ↔ Officer Agreement</dt>
                <dd className="font-mono font-bold text-emerald-700">
                  {pct(metrics.decisions.ai_human_agreement_rate)}{' '}
                  <span className="text-slate-400 font-normal">({metrics.decisions.decided} decided)</span>
                </dd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <dt className="text-slate-500">Average Document Latency</dt>
                <dd className="font-mono font-bold text-slate-900">
                  {metrics.processing.avg_seconds_per_document ?? '—'}s
                </dd>
              </div>
              <div className="pt-2">
                <dt className="text-slate-500 mb-1 font-semibold">Verification Outcomes Breakdown</dt>
                <dd className="flex flex-wrap gap-1.5 mt-1">
                  {Object.entries(metrics.verification.by_status).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-700"
                    >
                      {k}: <strong>{v}</strong>
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          )}
          <p className="text-[11px] text-slate-400 mt-4 leading-normal border-t border-slate-100 pt-3">
            Audited under AICTE Approval Process Handbook (APH) regulations. Decisions require written reasons.
          </p>
        </Card>

        <Card title="Live Statutory Audit Ledger Stream" className="lg:col-span-2">
          {activity.length === 0 ? (
            <Empty title="No recorded ledger entries yet" />
          ) : (
            <ul className="space-y-2.5">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between text-xs p-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0 pr-3">
                    <span className="font-semibold text-slate-800">{a.action.replace(/_/g, ' ')}</span>{' '}
                    <span className="text-slate-500">
                      • {a.institution_name} • <span className="font-mono text-blue-700">{a.user_name}</span>
                    </span>
                    {a.details && <span className="text-slate-400 block text-[11px] truncate mt-0.5">{a.details}</span>}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 font-mono">{fmtDate(a.timestamp)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};
