import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ArrowRight, ShieldAlert, CheckCircle2, AlertTriangle, Compass } from 'lucide-react';
import { applicationsApi, triageApi } from '../api/client';
import type { Application, TriageQueueItem } from '../types';
import { Spinner } from '../components/ui';

// Deterministic AICTE stage mapping based on recommendation and status
const getStageLabel = (app: Application) => {
  if (app.status === 'approved') return { label: 'Approval Granted (EoA)', tone: 'emerald' };
  if (app.status === 'rejected') return { label: 'Hearing Closed / SAC', tone: 'rose' };
  if (app.status === 'deficiency_found') return { label: 'Hearing & Grievance Scrutiny', tone: 'amber' };
  if (app.ai_recommendation === 'physical_inspection_suggested') return { label: 'Expert Visiting Committee (EVC)', tone: 'indigo' };
  if (app.category === 'new_institution') return { label: 'Land & Building Scrutiny', tone: 'sky' };
  return { label: 'Scrutiny Committee (Level 2)', tone: 'blue' };
};

const getComplianceBadge = (item?: TriageQueueItem, riskScore: number = 0) => {
  if (!item) {
    if (riskScore >= 60) return { label: 'Deficient (High Risk)', tone: 'rose', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (riskScore >= 25) return { label: 'Minor Deficiencies', tone: 'amber', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: 'Healthy (Compliant)', tone: 'emerald', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (item.red > 0) {
    return {
      label: `Critical (${item.red_unreviewed} unreviewed red)`,
      tone: 'rose',
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }
  if (item.amber > 0) {
    return {
      label: `Minor (${item.amber} amber pending)`,
      tone: 'amber',
      bg: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }
  return {
    label: 'Healthy (100% compliant)',
    tone: 'emerald',
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
};

export const ApplicationsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [apps, setApps] = useState<Application[]>([]);
  const [rag, setRag] = useState<Record<string, TriageQueueItem>>({});
  const [loading, setLoading] = useState(true);
  const search = params.get('search') || '';
  const status = params.get('status') || '';

  useEffect(() => {
    setLoading(true);
    Promise.all([applicationsApi.list({ search: search || undefined, status: status || undefined }), triageApi.queue()])
      .then(([list, queue]) => {
        const byId = Object.fromEntries(queue.map((q) => [q.application.id, q]));
        // Priority order: unreviewed red items first, then overall risk
        setApps(
          [...list].sort(
            (a, b) =>
              (byId[b.id]?.red_unreviewed || 0) - (byId[a.id]?.red_unreviewed || 0) ||
              b.risk_score - a.risk_score
          )
        );
        setRag(byId);
      })
      .finally(() => setLoading(false));
  }, [search, status]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    v ? next.set(k, v) : next.delete(k);
    setParams(next);
  };

  return (
    <div className="space-y-6">
      {/* Header with official explanation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 font-mono">
              Statutory Triage Workspace
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Application Triage Queue</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            AICTE Scrutiny Officers only. Prioritized by unreviewed red infractions and SLA ageing.
          </p>
        </div>
      </div>

      {/* Filter and search toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            defaultValue={search}
            onKeyDown={(e) => e.key === 'Enter' && set('search', (e.target as HTMLInputElement).value)}
            placeholder="Search by AICTE PID, College Code, or Institution Name (Enter)…"
            aria-label="Search"
            className="input pl-9 text-xs"
          />
        </div>
        <select
          value={status}
          onChange={(e) => set('status', e.target.value)}
          aria-label="Filter by statutory phase"
          className="input w-56 text-xs"
        >
          <option value="">All Statutory Phases</option>
          <option value="under_review">Scrutiny Under Review</option>
          <option value="submitted">Submitted Awaiting Review</option>
          <option value="deficiency_found">Deficiency Notice Dispatched</option>
          <option value="approved">Approved &amp; Certified</option>
          <option value="rejected">Rejected / SAC Appeal</option>
        </select>
      </div>

      {/* Main Triage Queue Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="flex justify-center p-12"><Spinner /></div>
        ) : apps.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">No applications match current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] uppercase tracking-wider text-slate-500 select-none">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Institution Name &amp; Code</th>
                  <th className="px-5 py-3.5 font-bold">Application Type</th>
                  <th className="px-5 py-3.5 font-bold">Current Stage</th>
                  <th className="px-5 py-3.5 font-bold">Compliance Health</th>
                  <th className="px-5 py-3.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {apps.map((a) => {
                  const stage = getStageLabel(a);
                  const health = getComplianceBadge(rag[a.id], a.risk_score);
                  return (
                    <tr key={a.id} className="hover:bg-blue-50/30 transition-colors group">
                      {/* Column 1: Institution Name & PID */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <Link
                            to={`/applications/${a.id}`}
                            className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors text-xs sm:text-sm line-clamp-1"
                          >
                            {a.institution_name}
                          </Link>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-mono">
                            <span className="font-bold text-blue-700">{a.application_number}</span>
                            <span>•</span>
                            <span>PID: {a.permanent_id || '1-94820194'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Application Type */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800 text-xs capitalize">
                            {a.category.replace('_', ' ')} (AY {a.academic_year})
                          </span>
                          <span className="text-[11px] text-slate-500 mt-0.5">
                            Intake: {a.requested_intake ? `${a.requested_intake} seats` : 'UG Tech Core'}
                          </span>
                        </div>
                      </td>

                      {/* Column 3: Current Stage */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            stage.tone === 'emerald'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : stage.tone === 'rose'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : stage.tone === 'amber'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              stage.tone === 'emerald'
                                ? 'bg-emerald-600'
                                : stage.tone === 'rose'
                                ? 'bg-rose-600'
                                : stage.tone === 'amber'
                                ? 'bg-amber-600'
                                : 'bg-blue-600'
                            }`}
                          />
                          {stage.label}
                        </span>
                      </td>

                      {/* Column 4: Compliance Health (Green/Amber/Red) */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${health.bg}`}>
                            {health.tone === 'emerald' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            {health.tone === 'amber' && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                            {health.tone === 'rose' && <ShieldAlert className="w-3 h-3 text-rose-600" />}
                            {health.label}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                            <span>Risk Index: {a.risk_score}/100</span>
                            {rag[a.id] && (
                              <span>
                                • R:{rag[a.id].red} A:{rag[a.id].amber}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 5: Action buttons */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={`/applications/${a.id}?tab=radar`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                            title="Open Dependency Radar"
                          >
                            <Compass className="w-3.5 h-3.5 text-blue-700" />
                            <span className="hidden sm:inline">Radar</span>
                          </Link>
                          <Link
                            to={`/applications/${a.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-colors"
                          >
                            <span>Open Review</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
