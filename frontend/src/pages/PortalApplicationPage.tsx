import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Lock } from 'lucide-react';
import { errorMessage, notificationsApi, portalApi } from '../api/client';
import type { NotificationItem, PortalApplication } from '../types';
import { Button, Empty, Pill, Spinner, fmtDay } from '../components/ui';
import { UploadSlots } from '../components/UploadSlots';
import { SecureNoticeCard } from './NoticesPage';

export const PORTAL_STATUS: Record<PortalApplication['status'], { label: string; tone: string }> = {
  draft: { label: 'Draft Prepared', tone: 'slate' },
  received: { label: 'Received by AICTE (Document Received & Secured)', tone: 'indigo' },
  under_review: { label: 'Under Formal Scrutiny', tone: 'sky' },
  clarification_requested: { label: 'Clarification Requisitioned', tone: 'amber' },
  approved: { label: 'Statutory Approval Granted', tone: 'emerald' },
  rejected: { label: 'Not Approved (SAC Window Open)', tone: 'rose' },
};

/**
 * Institution view of an application: what was submitted and received.
 * Strictly blind: never exposes internal AI detectors, risk scores, or committee deliberation notes.
 */
export const PortalApplicationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<PortalApplication | null>(null);
  const [notices, setNotices] = useState<NotificationItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const [a, n] = await Promise.all([portalApi.get(id), notificationsApi.list(id)]);
    setApp(a);
    setNotices(n);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(errorMessage(e)));
  }, [load]);

  if (error && !app) return <Empty title="Could not load application" hint={error} />;
  if (!app) return <div className="flex justify-center p-16"><Spinner /></div>;

  const editable = app.status === 'draft' || app.status === 'clarification_requested';
  const status = PORTAL_STATUS[app.status];
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await portalApi.submit(app.id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to My Applications
      </Link>

      {/* Header Banner */}
      <div className="glass-panel rounded-2xl p-6 bg-white border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-blue-700 px-3 py-1 rounded-lg bg-blue-50 border border-blue-200">
              {app.application_number}
            </span>
            <Pill tone={status.tone}>{status.label}</Pill>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-semibold flex items-center gap-1">
              <Lock className="w-3 h-3 text-slate-400" /> 256-Bit Encrypted Session
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{app.institution_name}</h1>
          <p className="text-xs text-slate-500">
            AICTE PID: <span className="font-mono font-medium text-slate-700">{app.permanent_id || '1-94820194'}</span> • Category: <span className="font-medium capitalize text-slate-700">{app.category.replace('_', ' ')}</span> • Intake: {app.requested_intake ?? '—'} Seats • AY {app.academic_year}
            {app.rectification_due && app.status === 'clarification_requested' && (
              <span className="text-amber-700 font-semibold block mt-1">
                ⚠️ Scrutiny Clarification Action Deadline: {fmtDay(app.rectification_due)}
              </span>
            )}
          </p>
        </div>

        {editable && (
          <Button variant="primary" onClick={submit} busy={busy} className="py-2.5 px-4 shadow-xs">
            <Send className="w-3.5 h-3.5" />
            {app.status === 'draft' ? 'Transmit Application to AICTE' : 'Resubmit Rectified Dossier'}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-rose-600 font-medium" role="alert">{error}</p>}

      {/* Encrypted Clarification Notices Drawer */}
      {notices.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-blue-700" /> Pending Clarification Requisitions ({notices.length})
          </h2>
          <div className="space-y-3">
            {notices.map((n) => (
              <SecureNoticeCard
                key={n.id}
                n={n}
                onAck={async (x) => {
                  await notificationsApi.acknowledge(x.id);
                  load();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upload slots */}
      <div>
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
          Certified Statutory Annexures &amp; Documents
        </h2>
        <UploadSlots app={app} editable={editable} onChanged={load} />
      </div>
    </div>
  );
};
