import React, { useRef, useState } from 'react';
import { Upload, CheckCircle2, RefreshCw, Loader2, ShieldCheck, Lock, FileText } from 'lucide-react';
import { documentsApi, errorMessage } from '../api/client';
import type { DocumentType, PortalApplication, PortalDocument } from '../types';
import { DOC_LABELS, Pill, cx, fmtDate } from './ui';

type Item = PortalApplication['checklist'][number];

/**
 * Institution upload slot. Deliberately "blind": after upload it only ever shows
 * the static confirmation receipt ("Document Received & Secured").
 * No progress, stages, flags, risk gauges, or AI analysis are exposed to institutions.
 */
const Slot: React.FC<{ app: PortalApplication; item: Item; doc?: PortalDocument; editable: boolean; onChanged: () => void }> = ({
  app,
  item,
  doc,
  editable,
  onChanged,
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const onFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setSending(true);
    try {
      if (doc) await documentsApi.replace(doc.id, file);
      else await documentsApi.upload(app.id, file, item.doc_type);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
      if (input.current) input.current.value = '';
    }
  };

  const accept =
    item.doc_type === 'lab_photo'
      ? 'image/jpeg,image/png,video/mp4'
      : item.doc_type === 'campus_boundary'
      ? '.geojson,application/geo+json,application/json'
      : 'application/pdf,image/jpeg,image/png';

  const receiptId = doc
    ? `TRC-2026-${(app.permanent_id || 'APX').replace(/[^a-zA-Z0-9]/g, '')}-${doc.id.slice(0, 6).toUpperCase()}`
    : null;

  return (
    <div
      className={cx(
        'p-5 rounded-2xl border transition-all text-left bg-white',
        doc ? 'border-slate-300 shadow-xs' : 'border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 tracking-tight">
            {DOC_LABELS[item.doc_type] || item.title}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{item.description}</p>
        </div>
        {!doc ? (
          <Pill tone="amber">Required</Pill>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Sealed
          </span>
        )}
      </div>

      {/* STRICT REGULATORY BLIND RECEIPT STATE */}
      {doc && (
        <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-slate-800">
              Status: Document Received &amp; Secured
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-200/70">
            <div>
              <span className="text-slate-400 block font-sans text-[9px] uppercase tracking-wider">Receipt Tracking ID</span>
              <span className="font-semibold text-slate-700">{receiptId}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-sans text-[9px] uppercase tracking-wider">Ledger Timestamp</span>
              <span className="text-slate-700">{fmtDate(doc.uploaded_at)}</span>
            </div>
          </div>

          <div className="pt-1 text-[10px] text-slate-500 flex items-center justify-between">
            <span className="truncate max-w-[180px] font-sans font-medium text-slate-700 flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-400 shrink-0" />
              {doc.original_filename}
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold font-sans">
              <ShieldCheck className="w-3 h-3" /> Awaiting Scrutiny
            </span>
          </div>
        </div>
      )}

      {sending && (
        <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
          <span>Hashing file, affixing watermark &amp; transmitting to repository…</span>
        </div>
      )}

      {error && <p className="text-[11px] text-rose-600 mt-2 font-medium" role="alert">{error}</p>}

      {editable && !sending && (
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
          <input
            ref={input}
            type="file"
            className="hidden"
            accept={accept}
            onChange={(e) => onFile(e.target.files?.[0])}
            aria-label={`Upload ${DOC_LABELS[item.doc_type]}`}
          />
          <button
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer transition-colors"
          >
            {doc ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" /> Replace certified document
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" /> Upload certified PDF / file
              </>
            )}
          </button>
          <span className="text-[10px] text-slate-400 font-mono">Max 25MB • e-Sign Mandated</span>
        </div>
      )}
    </div>
  );
};

export const UploadSlots: React.FC<{ app: PortalApplication; editable: boolean; onChanged: () => void }> = ({
  app,
  editable,
  onChanged,
}) => {
  const docs = app.documents.filter((d) => d.is_current);
  const covered = new Set(app.checklist.map((c) => c.doc_type));
  const extras = docs.filter((d) => !covered.has(d.doc_type as DocumentType));

  return (
    <div className="space-y-4">
      {/* Impartial Regulatory Acknowledgment Banner */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Statutory Submission Protocol • Strict Impartiality
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              Every document uploaded is cryptographically sealed with a chain-of-custody watermark upon arrival. Internal review metrics, detector risk scores, and committee deliberations are strictly shielded during active scrutiny.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
            NIC &amp; MeitY Level 3 Assured
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {app.checklist.map((item) => (
          <Slot
            key={item.doc_type}
            app={app}
            item={item}
            doc={docs.find((d) => d.doc_type === item.doc_type)}
            editable={editable}
            onChanged={onChanged}
          />
        ))}
      </div>

      {extras.length > 0 && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <span className="font-semibold">Additional uploads:</span> {extras.map((d) => d.original_filename).join(', ')}
        </div>
      )}

      <div className="text-center p-3 text-[11px] text-slate-400">
        Certified under Section 10 of the AICTE Act 1987. Files are timestamped to the National Informatics Centre immutable ledger.
      </div>
    </div>
  );
};
