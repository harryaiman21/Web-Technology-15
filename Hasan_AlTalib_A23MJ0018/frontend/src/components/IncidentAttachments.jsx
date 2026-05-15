import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, FileText, Image as ImageIcon, Loader2, Sparkles, X } from 'lucide-react';

import { getAttachmentFileUrl, getIncidentAttachments } from '../lib/api';

// ── Field chip — small pill showing one extracted field ─────────────────────
function FieldChip({ label, value, accent }) {
  if (!value) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        borderColor: accent || 'var(--border)',
        color: 'var(--text-2)',
        backgroundColor: 'var(--surface-3)',
      }}
    >
      <span className="text-[9px] uppercase tracking-wider text-[var(--text-3)]">{label}</span>
      <span className="font-mono text-[var(--text-1)]">{value}</span>
    </span>
  );
}

// ── Lightbox — full-size image viewer ──────────────────────────────────────
function Lightbox({ attachment, onClose }) {
  if (!attachment) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/85 p-6 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-[var(--surface-3)]/80 p-2 text-[var(--text-2)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
        aria-label="Close image preview"
      >
        <X size={18} />
      </button>
      <img
        src={getAttachmentFileUrl(attachment.id)}
        alt={attachment.originalName}
        className="max-h-[90vh] max-w-[90vw] rounded-[6px] object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

// ── Single attachment card ─────────────────────────────────────────────────
function AttachmentCard({ attachment, onPreview }) {
  const isImage = attachment.mimetype?.startsWith('image/');
  const fields = attachment.extractedFields || {};

  return (
    <div className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {isImage ? (
            <ImageIcon size={13} className="shrink-0 text-[#FFCC00]" aria-hidden="true" />
          ) : (
            <FileText size={13} className="shrink-0 text-[var(--text-3)]" aria-hidden="true" />
          )}
          <span
            className="truncate text-[12px] font-medium text-[var(--text-1)]"
            title={attachment.originalName}
          >
            {attachment.originalName || attachment.filename}
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-[var(--text-3)]">
          {(attachment.size / 1024).toFixed(0)} KB
        </span>
      </div>

      {/* Body — image preview + extracted fields */}
      <div className="grid grid-cols-[120px,1fr] gap-3 p-3">
        {isImage ? (
          <button
            type="button"
            onClick={() => onPreview(attachment)}
            className="group relative h-[90px] w-[120px] overflow-hidden rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)]"
            aria-label={`Preview ${attachment.originalName}`}
          >
            <img
              src={getAttachmentFileUrl(attachment.id)}
              alt={attachment.originalName}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
              <Eye size={14} className="text-white" />
            </span>
          </button>
        ) : (
          <div className="flex h-[90px] w-[120px] items-center justify-center rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)]">
            <FileText size={28} className="text-[var(--text-3)]" />
          </div>
        )}

        <div className="min-w-0">
          {/* Vision model badge */}
          {attachment.visionModel && (
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles size={10} className="text-[#FFCC00]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-3)]">
                Vision AI · {attachment.visionModel.split(':').pop()}
              </span>
            </div>
          )}

          {/* Extracted fields as chips */}
          {(fields.awb || fields.recipient || fields.hub || fields.weight ||
            fields.declaredValue || fields.serviceType || fields.damageVisible) ? (
            <div className="flex flex-wrap gap-1.5">
              <FieldChip label="AWB"          value={fields.awb}             accent="rgb(255,204,0,0.4)" />
              <FieldChip label="Recipient"    value={fields.recipient} />
              <FieldChip label="Hub"          value={fields.hub}             accent="rgb(59,130,246,0.4)" />
              <FieldChip label="Weight"       value={fields.weight} />
              <FieldChip label="Value"        value={fields.declaredValue} />
              <FieldChip label="Service"      value={fields.serviceType} />
              <FieldChip label="Damage"       value={fields.damageVisible}   accent="rgb(239,68,68,0.4)" />
            </div>
          ) : attachment.extractedText ? (
            <p className="line-clamp-3 text-[11px] leading-relaxed text-[var(--text-3)]">
              {attachment.extractedText}
            </p>
          ) : isImage ? (
            <p className="text-[11px] italic text-[var(--text-3)]">
              Vision OCR unavailable for this image.
            </p>
          ) : (
            <p className="text-[11px] italic text-[var(--text-3)]">
              Document attachment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function IncidentAttachments({ incidentId }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewing, setPreviewing] = useState(null);

  useEffect(() => {
    if (!incidentId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getIncidentAttachments(incidentId);
        if (!cancelled) setAttachments(data || []);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load attachments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [incidentId]);

  const imageCount = useMemo(
    () => attachments.filter((a) => a.mimetype?.startsWith('image/')).length,
    [attachments],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <Loader2 size={13} className="animate-spin text-[var(--text-3)]" />
        <span className="text-[12px] text-[var(--text-3)]">Loading evidence…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[8px] border border-[rgb(239,68,68,0.3)] bg-[rgb(239,68,68,0.06)] px-4 py-3 text-[12px] text-[#ef4444]">
        {error}
      </div>
    );
  }

  if (!attachments.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <ImageIcon size={12} className="text-[#FFCC00]" />
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-3)]">
          Evidence · {attachments.length} file{attachments.length !== 1 ? 's' : ''}
          {imageCount > 0 && ` · Vision-extracted`}
        </p>
      </div>
      <div className="space-y-2">
        {attachments.map((att) => (
          <AttachmentCard key={att.id} attachment={att} onPreview={setPreviewing} />
        ))}
      </div>
      <Lightbox attachment={previewing} onClose={() => setPreviewing(null)} />
    </div>
  );
}
