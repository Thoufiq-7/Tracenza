import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Lock,
  CheckCircle2,
  KeyRound,
  FileText,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { notificationsApi } from '../api/client';
import type { ClarificationPayload, NotificationItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { decryptNotice } from '../lib/secureInbox';
import { Button, DOC_LABELS, Empty, Pill, Spinner, fmtDate, fmtDay } from '../components/ui';

/** A clarification request, decrypted in this browser with the institution's private key. */
export const SecureNoticeCard: React.FC<{
  n: NotificationItem;
  onAck?: (n: NotificationItem) => void;
  showLink?: boolean;
}> = ({ n, onAck, showLink }) => {
  const { user } = useAuth();
  const [payload, setPayload] = useState<ClarificationPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !n.encrypted_payload) return;
    decryptNotice<ClarificationPayload>(user.id, n.encrypted_payload)
      .then(setPayload)
      .catch(() =>
        setError(
          'This request was encrypted with a key bound to a different browser session. Open this portal on that device, or ask AICTE to re-dispatch the clarification key.'
        )
      );
  }, [user, n]);

  const isSent = n.status === 'sent';

  return (
    <div className="glass-panel rounded-2xl p-6 bg-white border border-slate-200/90 shadow-xs space-y-4 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono">
              AICTE Scrutiny Cell • Clarification Notice
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200 uppercase font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Amber Clarification
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-700 shrink-0" />
            {n.subject}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={n.status === 'resolved' ? 'emerald' : n.status === 'acknowledged' ? 'sky' : 'amber'}>
            {n.status.replace(/_/g, ' ')}
          </Pill>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" /> Issued: {fmtDate(n.created_at)}
        </span>
        <span className="flex items-center gap-1.5 font-medium text-amber-800">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Action Required By: {fmtDay(n.due_date)}
        </span>
        <span className="text-[11px] font-mono text-slate-400">
          256-bit End-to-End Encrypted (RSA-OAEP-2048)
        </span>
      </div>

      {!n.encrypted_payload ? (
        <p className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200 leading-relaxed">
          {n.body}
        </p>
      ) : error ? (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
          <KeyRound className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : !payload ? (
        <div className="flex justify-center p-6"><Spinner /></div>
      ) : (
        <div className="space-y-3">
          {payload.note && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed">
              <span className="font-semibold text-slate-900 block mb-0.5">Scrutiny Officer Instruction:</span>
              {payload.note}
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
              Missing / Expired Documents Required for Resubmission:
            </p>
            <ol className="space-y-2">
              {payload.items.map((it, i) => (
                <li key={i} className="p-3.5 rounded-xl bg-amber-50/40 border border-amber-200/80 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-700" />
                      {it.doc_type ? (DOC_LABELS[it.doc_type] || it.doc_type) : `Item #${i + 1}`}
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full uppercase">
                      Re-Upload Mandated
                    </span>
                  </div>
                  <p className="text-slate-700">{it.request}</p>
                  <p className="text-slate-600 pt-1 border-t border-amber-200/50">
                    <span className="font-semibold text-blue-800">Rectification Guidance:</span> {it.what_to_do}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <span className="text-[11px] text-slate-400">
          No forensic reasons are transmitted. Strictly provides document replacement instructions.
        </span>
        <div className="flex items-center gap-2">
          {showLink && (
            <Link
              to={`/applications/${n.application_id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <span>Go to Document Uploads</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
          {onAck && isSent && (
            <Button variant="secondary" onClick={() => onAck(n)}>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Acknowledge Receipt
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export const NoticesPage: React.FC = () => {
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  useEffect(() => {
    notificationsApi.list().then(setItems);
  }, []);

  const ack = async (n: NotificationItem) => {
    const updated = await notificationsApi.acknowledge(n.id);
    setItems((prev) => prev?.map((x) => (x.id === n.id ? updated : x)) || null);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-pulse"></span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 font-mono">
            Institution Secure Clarification Inbox
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Encrypted Clarification Requisitions</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Requests from AICTE Scrutiny Officers are end-to-end encrypted to this browser. Furnish certified supplementary annexures to clear amber flags.
        </p>
      </div>

      {items === null ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : items.length === 0 ? (
        <Empty
          title="No pending clarification requests"
          hint="Your submissions currently satisfy all baseline handbook requirements."
        />
      ) : (
        <div className="space-y-4">
          {items.map((n) => (
            <SecureNoticeCard key={n.id} n={n} onAck={ack} showLink />
          ))}
        </div>
      )}
    </div>
  );
};
