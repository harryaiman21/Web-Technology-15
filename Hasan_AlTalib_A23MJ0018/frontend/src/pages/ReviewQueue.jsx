import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Pencil,
  Sparkles,
  XCircle,
  Zap,
  ShieldCheck,
  Clock,
  LayoutList,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Layout from '../components/Layout';
import LoadingSkeleton from '../components/LoadingSkeleton';
import StatusBadge from '../components/StatusBadge';
import {
  batchReviewIncidents,
  draftResolutionMessage,
  getPendingIncidents,
  reviewIncident,
} from '../lib/api';

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */

function formatRelativeTime(value) {
  if (!value) return 'Unknown age';
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return 'Unknown age';
  const minutes = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isAiReady(incident) {
  const confidence = Number(incident.confidence) || 0;
  return (
    confidence >= 0.8 &&
    Boolean(incident.type) &&
    incident.recoveryMessage?.status !== 'hitl_required'
  );
}

function buildFallbackDraft(incidentId) {
  const ref = `INC-${String(incidentId).slice(-6).toUpperCase()}`;
  return `Dear customer, your DHL case ${ref} has been resolved. Please contact us at 1300-888-DHL if you need assistance.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Format the AI-drafted recovery email for human readability:
     - Replace raw 24-char Mongo ObjectIds with friendly INC-XXXXXX refs
     - Insert paragraph breaks before greeting / closing patterns
     - Bold the case reference (returned as a JSX fragment)
   Pure presentation — does NOT alter the underlying draft text that gets
   sent to the customer when the reviewer clicks Approve.
───────────────────────────────────────────────────────────────────────────── */
function formatDraftForReading(text) {
  if (typeof text !== 'string' || !text.trim()) return text;

  // 1. Replace any 24-char hex ObjectId with INC-<last-6-uppercase>
  const friendly = text.replace(/\b([a-f0-9]{24})\b/gi, (_, hex) => `INC-${hex.slice(-6).toUpperCase()}`);

  // 2. Add paragraph breaks before common transition cues if the model didn't.
  //    Keeps existing newlines untouched.
  const broken = friendly
    .replace(/\.\s+(We sincerely apologize|We apologise|Our team|If you need|For urgent|Please contact|Warm regards|Sincerely|Yours truly)/g, '.\n\n$1')
    .replace(/^(Hi|Hello|Dear|Yang Dihormati)([^\n]*?,)\s+/g, '$1$2\n\n');

  // 3. Highlight the INC-XXXXXX ref by splitting and rendering it bold.
  const parts = broken.split(/(\bINC-[A-Z0-9]{6,}\b)/g);
  return parts.map((part, i) => {
    if (/^INC-[A-Z0-9]{6,}$/.test(part)) {
      return (
        <span
          key={i}
          className="rounded-[3px] px-1.5 py-0.5 font-mono text-[12px] font-semibold"
          style={{ background: 'rgba(96,165,250,0.12)', color: '#93c5fd' }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   Skeleton
───────────────────────────────────────────────────────────────────────────── */

function PendingSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl p-5 animate-pulse"
          style={{
            background: 'var(--nexus-surface-2)',
            border: '1px solid var(--nexus-border)',
            animationDelay: `${i * 120}ms`,
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div
              className="h-3 w-20 rounded"
              style={{ background: 'var(--nexus-border-bright)' }}
            />
            <div className="flex gap-2">
              <div
                className="h-5 w-16 rounded-full"
                style={{ background: 'var(--nexus-border-bright)' }}
              />
              <div
                className="h-5 w-12 rounded-full"
                style={{ background: 'var(--nexus-border-bright)' }}
              />
            </div>
          </div>
          <div
            className="mt-3 h-4 w-2/3 rounded"
            style={{ background: 'var(--nexus-border-bright)' }}
          />
          <div
            className="mt-2 h-3 w-1/3 rounded"
            style={{ background: 'var(--nexus-border)' }}
          />
          <div
            className="mt-4 h-1.5 w-full rounded-full"
            style={{ background: 'var(--nexus-border)' }}
          />
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Confidence Arc (SVG mini arc gauge)
───────────────────────────────────────────────────────────────────────────── */

function ConfidenceArc({ pct }) {
  const r = 22;
  const circ = Math.PI * r; // half circle
  const filled = (pct / 100) * circ;
  const color = pct >= 85 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="56" height="32" viewBox="0 0 56 32" fill="none" aria-hidden="true">
      <path
        d={`M 5 28 A ${r} ${r} 0 0 1 51 28`}
        stroke="rgba(128,128,128,0.2)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d={`M 5 28 A ${r} ${r} 0 0 1 51 28`}
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)' }}
      />
      <text x="28" y="26" textAnchor="middle" fontSize="9" fontWeight="700" fill={color} fontFamily="monospace">
        {pct}%
      </text>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────────────────────── */

export default function ReviewQueue() {
  const messageEditorRef = useRef(null);

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeReview, setActiveReview] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [messageCard, setMessageCard] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [selected, setSelected] = useState(new Set());
  const [aiReadyFilter, setAiReadyFilter] = useState(false);
  const [expandedDrafts, setExpandedDrafts] = useState(new Set());
  const [draftCache, setDraftCache] = useState({});
  const [draftFetching, setDraftFetching] = useState(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  useEffect(() => {
    let active = true;
    async function loadQueue() {
      try {
        const response = await getPendingIncidents();
        if (active) {
          setIncidents(Array.isArray(response) ? response : []);
          setError('');
          setLoading(false);
        }
      } catch (fetchError) {
        if (active) {
          setError(fetchError.message || 'Failed to load pending incidents.');
          setLoading(false);
        }
      }
    }
    loadQueue();
    const intervalId = setInterval(loadQueue, 30000);
    return () => { active = false; clearInterval(intervalId); };
  }, []);

  const title = useMemo(() => `Review Queue (${incidents.length})`, [incidents.length]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    const ids = new Set(incidents.map((i) => i._id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [incidents]);

  const filteredIncidents = useMemo(
    () => (aiReadyFilter ? incidents.filter(isAiReady) : incidents),
    [incidents, aiReadyFilter],
  );
  const aiReadyCount = useMemo(() => incidents.filter(isAiReady).length, [incidents]);

  async function handleCopyDraft() {
    if (!messageCard?.draft) return;
    try {
      await navigator.clipboard.writeText(messageCard.draft);
      setCopied(true);
    } catch {
      setError('Failed to copy the resolution message.');
    }
  }

  async function submitReview(incidentId, action) {
    setSubmitting(true);
    setError('');
    try {
      await reviewIncident(incidentId, { action, note });
      setIncidents((current) => current.filter((incident) => incident._id !== incidentId));
      setActiveReview(null);
      setNote('');
      if (action === 'approve') {
        setDraftLoading(true);
        try {
          const draftResponse = await draftResolutionMessage(incidentId);
          setMessageCard({ incidentId, draft: draftResponse?.draft || buildFallbackDraft(incidentId) });
        } catch {
          setMessageCard({ incidentId, draft: buildFallbackDraft(incidentId) });
        } finally {
          setDraftLoading(false);
        }
      }
    } catch (reviewError) {
      setError(reviewError.message || 'Failed to submit review decision.');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(filteredIncidents.map((i) => i._id))); }
  function clearSelection() { setSelected(new Set()); }

  const toggleDraft = useCallback(async (incidentId) => {
    setExpandedDrafts((prev) => {
      const next = new Set(prev);
      next.has(incidentId) ? next.delete(incidentId) : next.add(incidentId);
      return next;
    });
    if (!draftCache[incidentId] && !draftFetching.has(incidentId)) {
      setDraftFetching((prev) => new Set([...prev, incidentId]));
      try {
        const res = await draftResolutionMessage(incidentId);
        setDraftCache((prev) => ({ ...prev, [incidentId]: res?.draft || buildFallbackDraft(incidentId) }));
      } catch {
        setDraftCache((prev) => ({ ...prev, [incidentId]: buildFallbackDraft(incidentId) }));
      } finally {
        setDraftFetching((prev) => { const next = new Set(prev); next.delete(incidentId); return next; });
      }
    }
  }, [draftCache, draftFetching]);

  async function handleBatchAction(action) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBatchBusy(true);
    setError('');
    setBatchResult(null);
    try {
      const result = await batchReviewIncidents(ids, action, '');
      setIncidents((current) => current.filter((inc) => !ids.includes(inc._id)));
      clearSelection();
      setBatchResult(result);
    } catch (err) {
      setError(err.message || `Batch ${action} failed.`);
    } finally {
      setBatchBusy(false);
    }
  }

  const timeSaved = Math.round(selected.size * 9);

  /* ── render ── */
  return (
    <Layout title={title}>
      {/* Page wrapper */}
      <div
        className="min-h-screen"
        style={{
          background: 'var(--nexus-bg)',
          fontFamily: "'Inter', system-ui, sans-serif",
          color: 'var(--nexus-text-1)',
        }}
      >
        <div className="px-6 py-6 pb-36 space-y-6">

          {/* ── PAGE HEADER ── */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', boxShadow: '0 0 20px rgba(37,99,235,0.35)' }}
                >
                  <LayoutList size={15} className="text-white" />
                </div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--nexus-text-1)' }}>
                    Review Queue
                  </h1>
                  {!loading && (
                    <span
                      className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                      style={{ background: 'rgba(37,99,235,0.18)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.3)' }}
                    >
                      {incidents.length}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--nexus-text-3)' }}>
                HITL-gated incidents pending reviewer sign-off before pipeline continuation.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Live pulse indicator */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px]" style={{ background: 'var(--nexus-surface-2)', border: '1px solid var(--nexus-border)', color: 'var(--nexus-text-3)' }}>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#10b981' }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#10b981' }} />
                </span>
                Live
              </div>

              {/* AI Ready filter chip */}
              {aiReadyCount > 0 && (
                <button
                  onClick={() => setAiReadyFilter((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200"
                  style={
                    aiReadyFilter
                      ? { background: 'rgba(37,99,235,0.18)', border: '1px solid rgba(37,99,235,0.4)', color: '#60a5fa', boxShadow: '0 0 12px rgba(37,99,235,0.2)' }
                      : { background: 'var(--nexus-surface-2)', border: '1px solid var(--nexus-border-bright)', color: 'var(--nexus-text-3)' }
                  }
                >
                  <Sparkles size={11} />
                  AI Ready
                  <span className="ml-0.5 tabular-nums">{aiReadyCount}</span>
                </button>
              )}
            </div>
          </div>

          {/* ── BATCH RESULT BANNER ── */}
          {batchResult && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} style={{ color: '#10b981' }} />
                <span>
                  <span className="font-semibold" style={{ color: '#10b981' }}>{batchResult.approved ?? 0} approved</span>
                  {batchResult.rejected > 0 && (
                    <span className="ml-2 font-semibold" style={{ color: '#f87171' }}>· {batchResult.rejected} rejected</span>
                  )}
                  {batchResult.skipped > 0 && (
                    <span className="ml-2" style={{ color: 'var(--nexus-text-3)' }}>· {batchResult.skipped} already processed</span>
                  )}
                </span>
              </div>
              <button onClick={() => setBatchResult(null)} className="ml-4 rounded-md p-1 transition-colors hover:bg-white/10" style={{ color: 'var(--nexus-text-3)' }}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* ── APPROVED / DRAFT CARD ── */}
          {(draftLoading || messageCard) && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              {/* card top stripe */}
              <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #10b981 0%, rgba(16,185,129,0) 100%)' }} />
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className="flex items-center justify-center w-7 h-7 rounded-lg"
                    style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
                  >
                    <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--nexus-text-1)' }}>Incident Approved</span>
                  <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
                    Resolution drafted
                  </span>
                </div>

                {draftLoading ? (
                  <div className="flex items-center gap-3 text-sm py-2" style={{ color: 'var(--nexus-text-3)' }}>
                    <Loader2 className="animate-spin" size={15} />
                    <span>Generating AI resolution message...</span>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--nexus-text-3)' }}>AI-drafted customer message</p>
                      <Textarea
                        ref={messageEditorRef}
                        value={messageCard?.draft || ''}
                        onChange={(e) => setMessageCard((cur) => cur ? { ...cur, draft: e.target.value } : cur)}
                        className="min-h-[120px] text-sm resize-none rounded-lg"
                        style={{
                          background: 'var(--nexus-surface-2)',
                          border: '1px solid var(--nexus-border)',
                          color: 'var(--nexus-text-2)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton icon={<Pencil size={13} />} label="Edit" onClick={() => messageEditorRef.current?.focus()} variant="ghost" />
                      <ActionButton
                        icon={<Copy size={13} />}
                        label={copied ? 'Copied!' : 'Copy'}
                        onClick={handleCopyDraft}
                        variant={copied ? 'success' : 'primary'}
                      />
                      <ActionButton icon={<X size={13} />} label="Dismiss" onClick={() => { setMessageCard(null); setCopied(false); }} variant="ghost" />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── ERROR ── */}
          {error && (
            <div
              className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}
            >
              <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: '#ef4444' }} />
              <span>{error}</span>
            </div>
          )}

          {/* ── SELECT-ALL BAR ── */}
          {!loading && filteredIncidents.length > 0 && (
            <div className="flex items-center gap-4 text-[12px]">
              <button
                onClick={selected.size === filteredIncidents.length ? clearSelection : selectAll}
                className="font-medium transition-colors"
                style={{ color: selected.size === filteredIncidents.length ? '#60a5fa' : 'var(--nexus-text-3)' }}
              >
                {selected.size === filteredIncidents.length && filteredIncidents.length > 0
                  ? 'Deselect all'
                  : `Select all (${filteredIncidents.length})`}
              </button>
              <span style={{ color: 'var(--nexus-text-3)' }}>|</span>
              <span style={{ color: 'var(--nexus-text-3)' }}>{filteredIncidents.length} incident{filteredIncidents.length !== 1 ? 's' : ''}</span>
              {aiReadyFilter && (
                <span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5"
                  style={{ background: 'rgba(37,99,235,0.1)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.2)' }}
                >
                  <Sparkles size={9} />
                  Filtered: AI-ready only
                </span>
              )}
            </div>
          )}

          {/* ── MAIN LIST ── */}
          {loading ? (
            <PendingSkeleton />
          ) : filteredIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl py-20 text-center" style={{ border: '1px dashed var(--nexus-border)', background: 'var(--nexus-surface-1)' }}>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--nexus-surface-2)', border: '1px solid var(--nexus-border)' }}>
                <ShieldCheck size={22} style={{ color: 'var(--nexus-text-3)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--nexus-text-1)' }}>
                {aiReadyFilter ? 'No AI-ready incidents' : 'Queue is clear'}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--nexus-text-3)' }}>
                {aiReadyFilter ? 'Toggle off the AI Ready filter to see all.' : 'No incidents are currently pending review.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIncidents.map((incident) => {
                const incidentLocation =
                  incident.location ||
                  incident.agentResults?.intake?.fields?.location?.value ||
                  'Unknown location';
                const isActive = activeReview?.incidentId === incident._id;
                const isSelected = selected.has(incident._id);
                const aiReady = isAiReady(incident);
                const draftOpen = expandedDrafts.has(incident._id);
                const draftText = draftCache[incident._id];
                const draftPending = draftFetching.has(incident._id);
                const conf = Number(incident.confidence) || 0;
                const confPct = Math.round(conf * 100);
                const confColor = conf >= 0.85 ? '#10b981' : conf >= 0.70 ? '#f59e0b' : '#ef4444';

                const hitlChips = [
                  conf < 0.75 && { label: 'Low Confidence', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' },
                  (['Critical', 'High'].includes(incident.severity) && conf < 0.85) && { label: 'High Stakes', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
                  incident.holdForReview && { label: 'Manual Hold', color: '#60a5fa', bg: 'rgba(37,99,235,0.1)', border: 'rgba(37,99,235,0.25)' },
                  incident.source === 'manual' && { label: 'Manual Entry', color: 'var(--nexus-text-3)', bg: 'var(--nexus-surface-2)', border: 'var(--nexus-border)' },
                ].filter(Boolean);

                return (
                  <div
                    key={incident._id}
                    className="rounded-xl overflow-hidden transition-all duration-200"
                    style={{
                      background: isSelected
                        ? 'linear-gradient(135deg, rgba(37,99,235,0.07) 0%, var(--nexus-surface-2) 100%)'
                        : 'var(--nexus-surface-2)',
                      border: isSelected
                        ? '1px solid rgba(37,99,235,0.35)'
                        : '1px solid var(--nexus-border)',
                      boxShadow: isSelected ? '0 0 0 1px rgba(37,99,235,0.1) inset' : 'none',
                    }}
                  >
                    {/* left accent stripe */}
                    <div
                      className="flex"
                      style={{
                        borderLeft: `3px solid ${aiReady ? '#2563eb' : confColor}`,
                      }}
                    >
                      <div className="flex-1 p-5 space-y-4">

                        {/* ── TOP ROW ── */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                          {/* Checkbox + Title */}
                          <div className="flex items-start gap-3 min-w-0">
                            <button
                              onClick={(e) => toggleSelect(incident._id, e)}
                              aria-label={isSelected ? 'Deselect' : 'Select'}
                              className="mt-0.5 shrink-0 flex h-4 w-4 items-center justify-center rounded transition-all duration-150"
                              style={{
                                background: isSelected ? '#2563eb' : 'var(--nexus-surface-2)',
                                border: isSelected ? '1px solid #2563eb' : '1px solid var(--nexus-border-bright)',
                                boxShadow: isSelected ? '0 0 8px rgba(37,99,235,0.4)' : 'none',
                              }}
                            >
                              {isSelected && (
                                <svg viewBox="0 0 10 8" fill="none" className="h-2.5 w-2.5" stroke="white" strokeWidth="1.8">
                                  <path d="M1 4l2.5 2.5L9 1" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>

                            <div className="min-w-0">
                              <p className="text-[14px] font-medium leading-snug" style={{ color: 'var(--nexus-text-1)' }}>
                                {incident.title || incident.description || 'Untitled incident'}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--nexus-text-3)' }}>
                                  <Clock size={11} />
                                  {incidentLocation} · {formatRelativeTime(incident.createdAt)}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); window.open(`/incidents/${incident._id}`, '_blank'); }}
                                  className="flex items-center gap-1 text-[11px] transition-colors hover:opacity-100"
                                  style={{ color: 'var(--nexus-text-3)' }}
                                >
                                  <ExternalLink size={10} />
                                  View incident
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                            {aiReady && (
                              <span
                                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                                style={{ background: 'rgba(37,99,235,0.15)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.3)', boxShadow: '0 0 8px rgba(37,99,235,0.15)' }}
                              >
                                <Sparkles size={9} />
                                AI Ready
                              </span>
                            )}
                            <Badge variant="type" value={incident.type || 'other'} />
                            <Badge variant="severity" value={incident.severity || 'Low'} />
                            <StatusBadge status={incident.status} />
                            {incident.recoveryMessage?.status === 'hitl_required' && (
                              <a
                                href={`/incidents/${incident._id}#recovery`}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                                style={{ background: 'rgba(212,5,17,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
                                title="Recovery message requires approval - click to review"
                              >
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                                </span>
                                Recovery Pending
                              </a>
                            )}
                          </div>
                        </div>

                        {/* ── HITL REASON BOX ── */}
                        <div
                          className="rounded-lg px-4 py-3 space-y-3"
                          style={{ background: 'var(--nexus-surface-1)', border: '1px solid var(--nexus-border)' }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--nexus-text-3)' }}>HITL Reason</p>
                              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--nexus-text-2)' }}>
                                {incident.hitlReason || 'Held for reviewer validation'}
                              </p>
                            </div>
                            {/* Arc gauge */}
                            <div className="shrink-0">
                              <ConfidenceArc pct={confPct} />
                            </div>
                          </div>

                          {/* Thin confidence bar */}
                          <div>
                            <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'var(--nexus-border)' }}>
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${confPct}%`, background: `linear-gradient(90deg, ${confColor}aa, ${confColor})` }}
                              />
                            </div>
                          </div>

                          {/* HITL chips */}
                          {hitlChips.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {hitlChips.slice(0, 3).map((chip) => (
                                <span
                                  key={chip.label}
                                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                  style={{ color: chip.color, background: chip.bg, border: `1px solid ${chip.border}` }}
                                >
                                  {chip.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* ── AI DRAFT PREVIEW ── */}
                        {aiReady && (
                          <div>
                            <button
                              onClick={() => toggleDraft(incident._id)}
                              className="flex items-center gap-1.5 text-[12px] font-medium transition-colors"
                              style={{ color: draftOpen ? '#60a5fa' : 'var(--nexus-text-3)' }}
                            >
                              {draftOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              {draftOpen ? 'Collapse draft' : 'Preview AI draft'}
                            </button>
                            {draftOpen && (
                              <div
                                className="mt-2.5 overflow-hidden rounded-lg"
                                style={{
                                  background: 'rgba(255,255,255,0.02)',
                                  border: '1px solid rgba(96,165,250,0.18)',
                                  borderLeft: '3px solid #60a5fa',
                                }}
                              >
                                {/* Header strip — clarifies "this is a draft" */}
                                <div
                                  className="flex items-center gap-1.5 border-b px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                                  style={{
                                    borderColor: 'rgba(96,165,250,0.15)',
                                    color: '#60a5fa',
                                    background: 'rgba(96,165,250,0.04)',
                                  }}
                                >
                                  <Mail size={10} aria-hidden="true" />
                                  Recovery email · AI draft
                                </div>
                                {/* Body — readable text, generous line-height, contrast lifted */}
                                <div
                                  className="px-4 py-3.5 text-[13.5px] leading-[1.7] whitespace-pre-line"
                                  style={{ color: 'var(--nexus-text-1)' }}
                                >
                                  {draftPending || !draftText ? (
                                    <span className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--nexus-text-3)' }}>
                                      <Loader2 size={12} className="animate-spin" />
                                      Generating draft...
                                    </span>
                                  ) : (
                                    formatDraftForReading(draftText)
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── ACTION BUTTONS ── */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => { setActiveReview({ incidentId: incident._id, action: 'approve' }); setNote(''); }}
                            className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150"
                            style={{
                              background: isActive && activeReview?.action === 'approve'
                                ? 'rgba(16,185,129,0.2)'
                                : 'rgba(16,185,129,0.1)',
                              border: '1px solid rgba(16,185,129,0.25)',
                              color: '#34d399',
                              boxShadow: isActive && activeReview?.action === 'approve' ? '0 0 12px rgba(16,185,129,0.2)' : 'none',
                            }}
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </button>
                          <button
                            onClick={() => { setActiveReview({ incidentId: incident._id, action: 'reject' }); setNote(''); }}
                            className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150"
                            style={{
                              background: isActive && activeReview?.action === 'reject'
                                ? 'rgba(239,68,68,0.15)'
                                : 'rgba(239,68,68,0.08)',
                              border: '1px solid rgba(239,68,68,0.2)',
                              color: '#f87171',
                              boxShadow: isActive && activeReview?.action === 'reject' ? '0 0 12px rgba(239,68,68,0.15)' : 'none',
                            }}
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>

                        {/* ── INLINE CONFIRM PANEL ── */}
                        {isActive && (
                          <div
                            className="rounded-xl p-4 space-y-3 transition-all duration-200"
                            style={{ background: 'var(--nexus-surface-1)', border: '1px solid var(--nexus-border-bright)' }}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ background: activeReview.action === 'approve' ? '#10b981' : '#ef4444' }}
                              />
                              <p className="text-[13px] font-semibold" style={{ color: 'var(--nexus-text-1)' }}>
                                Confirm {activeReview.action === 'approve' ? 'approval' : 'rejection'}
                              </p>
                            </div>
                            <input
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Optional reviewer note..."
                              className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
                              style={{
                                background: 'var(--nexus-surface-2)',
                                border: '1px solid var(--nexus-border)',
                                color: 'var(--nexus-text-2)',
                              }}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => submitReview(incident._id, activeReview.action)}
                                disabled={submitting}
                                className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all disabled:opacity-50"
                                style={
                                  activeReview.action === 'approve'
                                    ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }
                                    : { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }
                                }
                              >
                                {submitting ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : activeReview.action === 'approve' ? (
                                  <CheckCircle2 size={13} />
                                ) : (
                                  <XCircle size={13} />
                                )}
                                Confirm
                              </button>
                              <button
                                onClick={() => { setActiveReview(null); setNote(''); }}
                                disabled={submitting}
                                className="rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50"
                                style={{ background: 'var(--nexus-surface-2)', border: '1px solid var(--nexus-border-bright)', color: 'var(--nexus-text-3)' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── STICKY BATCH COMMAND BAR ── */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{
            background: 'var(--nexus-panel-solid)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderTop: '1px solid var(--nexus-border)',
            boxShadow: '0 -4px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* top highlight line */}
          <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.5), transparent)' }} />

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center h-7 w-7 rounded-lg text-[12px] font-bold tabular-nums"
                style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.35)', color: '#60a5fa' }}
              >
                {selected.size}
              </div>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--nexus-text-1)' }}>
                selected
              </span>
              {timeSaved > 0 && (
                <span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)', color: '#fbbf24' }}
                >
                  <Zap size={10} />
                  ~{timeSaved} min saved
                </span>
              )}
              <button
                onClick={clearSelection}
                className="text-[11px] transition-colors"
                style={{ color: 'var(--nexus-text-3)' }}
              >
                Clear
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBatchAction('reject')}
                disabled={batchBusy}
                className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
              >
                {batchBusy ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Reject All
              </button>
              <button
                onClick={() => handleBatchAction('approve')}
                disabled={batchBusy}
                className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.12))',
                  border: '1px solid rgba(16,185,129,0.35)',
                  color: '#34d399',
                  boxShadow: '0 0 16px rgba(16,185,129,0.15)',
                }}
              >
                {batchBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Approve All
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Micro ActionButton helper (for the draft card only)
───────────────────────────────────────────────────────────────────────────── */
function ActionButton({ icon, label, onClick, variant = 'ghost' }) {
  const styles = {
    ghost: { background: 'var(--nexus-surface-2)', border: '1px solid var(--nexus-border)', color: 'var(--nexus-text-3)' },
    primary: { background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa' },
    success: { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' },
  };
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-80"
      style={styles[variant]}
    >
      {icon}
      {label}
    </button>
  );
}
