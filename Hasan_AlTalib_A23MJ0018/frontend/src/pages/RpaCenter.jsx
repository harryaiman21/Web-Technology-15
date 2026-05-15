import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, Brain, CheckCircle2, ChevronDown, ChevronRight,
  Cloud, Copy, Database, ExternalLink, FolderOpen, Image, Loader2, Mail, MessageSquare,
  Send, TrendingUp, Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/Layout';
import { triggerCloudDispatcher } from '../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const MAX_CONSOLE_LINES = 200;

// ── Pipeline step definitions ─────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { id: 0, icon: FolderOpen,    label: 'Watch Folder',       color: '#00d4e8' },
  { id: 1, icon: Mail,          label: 'Email Parser',        color: '#3b82f6' },
  { id: 2, icon: Brain,         label: 'AI Classifier',       color: '#FF8C00' },
  { id: 3, icon: Copy,          label: 'Dedup Check',         color: '#f59e0b' },
  { id: 4, icon: MessageSquare, label: 'Response Generator',  color: '#10b981' },
  { id: 5, icon: Send,          label: 'Email Dispatch',      color: '#D40511' },
  { id: 6, icon: Database,      label: 'NEXUS Updater',       color: '#14b8a6' },
];

// ── SSE event badge config ─────────────────────────────────────────────────────

const EVENT_BADGE = {
  rpa_robot_started:   { label: 'LAUNCHED',   bg: 'rgba(16,185,129,0.18)',  text: '#10b981' },
  rpa_robot_launch_config: { label: 'PACKAGE', bg: 'rgba(0,212,232,0.14)',   text: '#00d4e8' },
  rpa_stdout:          { label: 'STDOUT',     bg: 'rgba(0,212,232,0.14)',   text: '#00d4e8' },
  rpa_stderr:          { label: 'STDERR',     bg: 'rgba(239,68,68,0.16)',   text: '#ef4444' },
  rpa_robot_complete:  { label: 'COMPLETE',   bg: 'rgba(16,185,129,0.18)',  text: '#10b981' },
  rpa_robot_error:     { label: 'ERROR',      bg: 'rgba(239,68,68,0.16)',   text: '#ef4444' },
  bot_started:         { label: 'BOT ONLINE', bg: 'rgba(245,158,11,0.16)',  text: '#f59e0b' },
  classified:          { label: 'CLASSIFIED', bg: 'rgba(167,139,250,0.16)', text: '#FF8C00' },
  response_sent:       { label: 'RESPONDED',  bg: 'rgba(16,185,129,0.14)',  text: '#10b981' },
  escalated:           { label: 'ESCALATED',  bg: 'rgba(249,115,22,0.16)',  text: '#f97316' },
  escalation_required: { label: 'HITL',       bg: 'rgba(239,68,68,0.16)',   text: '#ef4444' },
  rpa_file_timeline:   { label: 'FILE STEP',  bg: 'rgba(34,211,238,0.14)',  text: '#FFCC00' },
  rpa_batch_intelligence: { label: 'BRAIN PACKET', bg: 'rgba(212,5,17,0.14)', text: '#f87171' },
  screenshot_taken:    { label: 'SCREENSHOT', bg: 'rgba(167,139,250,0.16)', text: '#FF8C00' },
  ocr_complete:        { label: 'OCR',        bg: 'rgba(20,184,166,0.16)',  text: '#14b8a6' },
  bot_summary:         { label: 'BATCH DONE', bg: 'rgba(16,185,129,0.18)',  text: '#10b981' },
};

// ── Color maps ────────────────────────────────────────────────────────────────

const OUTCOME_COLORS = {
  created:         '#10b981',
  duplicate:       '#f59e0b',
  failed:          '#ef4444',
  spam:            '#6b7280',
  enquiry:         '#3b82f6',
  reply_threaded:  '#14b8a6',
};

const TYPE_COLORS = {
  late_delivery:   '#3b82f6',
  damaged_parcel:  '#f59e0b',
  missing_parcel:  '#ef4444',
  address_error:   '#FF8C00',
  system_error:    '#14b8a6',
  wrong_item:      '#f97316',
  other:           '#6b7280',
};

const SENTIMENT_COLORS = {
  frustrated: '#ef4444',
  negative:   '#ef4444',
  neutral:    '#94a3b8',
  positive:   '#10b981',
  satisfied:  '#10b981',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function pct(n) {
  if (n == null) return null;
  return Math.round(n * 100);
}

function buildConsoleMessage(data) {
  if (!data) return '';
  if (data.type === 'rpa_robot_complete' && data.noRunRecord) {
    return 'Robot exited, but no NEXUS run record was created. Run Main.xaml in UiPath Studio or republish the package that invokes nexus_rpa.cs.';
  }
  if (data.type === 'rpa_stdout' || data.type === 'rpa_stderr') return data.line || data.message || '';
  if (data.type === 'rpa_robot_started') return `Robot launched — job ${data.jobId || 'unknown'}`;
  if (data.type === 'rpa_robot_launch_config') return data.message || `Launching ${data.resolvedPath || 'UiPath package'}`;
  if (data.type === 'rpa_robot_complete') return `Run complete — ${data.filesProcessed ?? 0} files processed`;
  if (data.type === 'rpa_robot_error') return data.error || 'Robot encountered an error';
  if (data.type === 'rpa_robot_complete' && data.noRunRecord) {
    return 'Robot exited, but no NEXUS run record was created. Run Main.xaml in UiPath Studio or republish the package that invokes nexus_rpa.cs.';
  }
  if (data.type === 'bot_started') return `Bot online — scanning inbox`;
  if (data.type === 'rpa_file_timeline') {
    const stage = (data.meta?.stage || '').replace(/_/g, ' ');
    const filename = data.meta?.filename || '';
    return `${stage || 'file step'}${filename ? ` - ${filename}` : ''}: ${data.message || ''}`;
  }
  if (data.type === 'rpa_batch_intelligence') {
    const meta = data.meta || {};
    return `Brain packet - ${meta.processed ?? 0} processed | top hub ${meta.topHub || 'none'} | next: ${meta.recommendation || 'review'}`;
  }
  if (data.type === 'classified') {
    const c = data.meta?.customer || data.customer || '';
    const t = (data.meta?.incidentType || data.incidentType || '').replace(/_/g, ' ');
    return [c && `Customer: ${c}`, t && `Type: ${t}`].filter(Boolean).join(' | ') || 'Incident classified';
  }
  if (data.type === 'response_sent') {
    const c = data.meta?.customer || data.customer || '';
    return c ? `Response sent to ${c}` : 'Response dispatched';
  }
  if (data.type === 'escalated' || data.type === 'escalation_required') {
    const id = data.meta?.incidentId || data.incidentId || '';
    const sev = data.meta?.severity || data.severity || '';
    return `HITL required${id ? ` — ${id}` : ''}${sev ? ` (${sev})` : ''} — review at /review`;
  }
  if (data.type === 'screenshot_taken') {
    const f = data.meta?.screenshotFile || data.screenshotFile || '';
    return `Error screenshot captured${f ? ` — ${f}` : ''}`;
  }
  if (data.type === 'ocr_complete') {
    const f = data.meta?.filename || data.filename || '';
    const c = data.meta?.chars || data.chars || 0;
    return `Claude Vision OCR complete${f ? ` — ${f}` : ''} (${c} chars extracted)`;
  }
  if (data.type === 'bot_summary') return `Batch complete — ${data.meta?.processed ?? 0} processed, ${data.meta?.errors ?? 0} errors`;
  return data.message || data.type || '';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, trend }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-xl border border-[var(--nexus-border)] p-4"
      style={{ background: 'var(--nexus-surface-2)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
          {label}
        </span>
        {Icon && (
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `${color}18`, color }}
          >
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span
          className="text-[28px] font-black leading-none tabular-nums tracking-tight"
          style={{ color: color || 'var(--nexus-text-1)' }}
        >
          {value}
        </span>
        {trend != null && (
          <div className="mb-0.5 flex items-center gap-1">
            <TrendingUp size={12} style={{ color: '#10b981' }} />
            <span className="text-[10px] font-bold text-[#10b981]">{trend}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineNode({ step, isActive, isComplete, isIdle }) {
  const Icon = step.icon;
  const dotColor = isComplete ? '#10b981' : isActive ? step.color : 'var(--nexus-text-3)';
  const borderColor = isActive
    ? step.color
    : isComplete
      ? 'rgba(16,185,129,0.4)'
      : 'var(--nexus-border)';
  const bgColor = isActive
    ? `${step.color}12`
    : isComplete
      ? 'rgba(16,185,129,0.06)'
      : 'var(--nexus-surface-2)';

  return (
    <div
      className="relative flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500"
      style={{ borderColor, background: bgColor }}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-500"
        style={{
          background: isActive ? `${step.color}22` : isComplete ? 'rgba(16,185,129,0.12)' : 'var(--nexus-surface-3)',
          color: isComplete ? '#10b981' : isActive ? step.color : 'var(--nexus-text-3)',
        }}
      >
        <Icon size={14} />
      </div>
      <span
        className="flex-1 text-[12px] font-semibold transition-all duration-500"
        style={{ color: isActive ? step.color : isComplete ? 'var(--nexus-text-1)' : 'var(--nexus-text-3)' }}
      >
        {step.label}
      </span>
      <div
        className="h-2 w-2 flex-shrink-0 rounded-full transition-all duration-500"
        style={{
          background: dotColor,
          boxShadow: isActive ? `0 0 8px ${step.color}` : isComplete ? '0 0 6px #10b981' : 'none',
        }}
      />
      {isActive && (
        <div
          className="absolute -inset-px rounded-xl animate-pulse"
          style={{ border: `1px solid ${step.color}40` }}
        />
      )}
    </div>
  );
}

function ConnectorLine({ isActive, isComplete }) {
  return (
    <div className="mx-auto flex h-5 w-px flex-col items-center justify-center overflow-hidden">
      <div
        className="h-full w-px transition-all duration-700"
        style={{
          background: isComplete
            ? 'rgba(16,185,129,0.6)'
            : isActive
              ? 'linear-gradient(180deg, #00d4e8 0%, transparent 100%)'
              : 'var(--nexus-border)',
          boxShadow: isActive ? '0 0 6px #00d4e8' : 'none',
        }}
      />
    </div>
  );
}

function ConsoleLine({ line }) {
  const badge = EVENT_BADGE[line.type] || {
    label: (line.type || 'INFO').toUpperCase().slice(0, 10),
    bg: 'rgba(100,116,139,0.16)',
    text: '#94a3b8',
  };

  return (
    <div className="flex items-start gap-2.5 px-3 py-1.5 transition-colors hover:bg-[var(--nexus-surface-2)]">
      <span className="mt-0.5 flex-shrink-0 font-mono text-[10px] tabular-nums text-[var(--nexus-text-3)]">
        {line.timestamp}
      </span>
      <span
        className="mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
        style={{ background: badge.bg, color: badge.text }}
      >
        {badge.label}
      </span>
      <span className="min-w-0 flex-1 break-words font-mono text-[11px] leading-relaxed text-[var(--nexus-text-2)]">
        {line.message}
      </span>
    </div>
  );
}

function RunDetails({ lastRun, isRunning }) {
  if (!lastRun && !isRunning) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: 'var(--nexus-surface-2)', border: '1px solid var(--nexus-border)' }}
        >
          <Zap size={20} className="text-[var(--nexus-text-3)]" />
        </div>
        <p className="text-[12px] text-[var(--nexus-text-3)]">No runs yet</p>
        <p className="text-[11px] text-[var(--nexus-text-3)] opacity-60">
          Launch the robot or start a demo to see run details here.
        </p>
      </div>
    );
  }

  const run = lastRun || {};
  const statusColor = run.status === 'completed' ? '#10b981' : run.status === 'error' ? '#ef4444' : '#00d4e8';

  return (
    <div className="flex flex-col gap-3">
      {run.runId && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
            Run ID
          </span>
          <span className="font-mono text-[11px] text-[var(--nexus-text-2)]">{run.runId}</span>
        </div>
      )}
      {run.status && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
            Status
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: `${statusColor}16`, color: statusColor }}
          >
            {run.status}
          </span>
        </div>
      )}
      <div
        className="grid grid-cols-1 gap-2 rounded-lg border p-3"
        style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-2)' }}
      >
        <MetaRow label="Files Processed" value={run.filesProcessed ?? '—'} />
        <MetaRow label="Duplicates Skipped" value={run.duplicatesSkipped ?? '—'} />
        <MetaRow label="Errors" value={run.errors ?? '—'} />
        {run.duration && <MetaRow label="Duration" value={`${run.duration}s`} />}
      </div>
      {run.narrative && (
        <div
          className="rounded-lg border p-3"
          style={{ borderColor: 'rgba(0,212,232,0.15)', background: 'rgba(0,212,232,0.04)' }}
        >
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-cyan)] opacity-70 mb-1.5">
            AI Narrative
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--nexus-text-2)]">{run.narrative}</p>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-[var(--nexus-text-3)]">{label}</span>
      <span className="font-mono text-[11px] font-semibold text-[var(--nexus-text-1)]">{value}</span>
    </div>
  );
}

function FlowBox({ label, sub, color = '#00d4e8', dim }) {
  return (
    <div
      className="flex min-w-0 flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center"
      style={{
        borderColor: dim ? 'var(--nexus-border)' : `${color}30`,
        background: dim ? 'var(--nexus-surface-2)' : `${color}08`,
        minWidth: 120,
      }}
    >
      <span
        className="text-[11px] font-bold leading-tight"
        style={{ color: dim ? 'var(--nexus-text-3)' : color }}
      >
        {label}
      </span>
      {sub && (
        <span className="text-[9px] leading-snug text-[var(--nexus-text-3)] opacity-70">{sub}</span>
      )}
    </div>
  );
}

function FlowArrow({ label }) {
  return (
    <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
      <div className="h-px w-6 bg-[var(--nexus-border)]" />
      <ArrowDown size={10} className="text-[var(--nexus-text-3)]" />
      {label && (
        <span className="max-w-[64px] text-center text-[8px] leading-tight text-[var(--nexus-text-3)] opacity-60">
          {label}
        </span>
      )}
    </div>
  );
}

// ── Case Intel sub-components ─────────────────────────────────────────────────

function ConfidenceBar({ label, value, color }) {
  const p = pct(value);
  if (p == null) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--nexus-text-3)]">{label}</span>
        <span className="font-mono text-[10px] font-bold" style={{ color }}>
          {p}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--nexus-surface-3)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${p}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ShapWaterfall({ features }) {
  const top = features.slice(0, 5);
  const maxAbs = Math.max(...top.map((f) => f.abs_value || Math.abs(f.shap_value || 0)), 0.001);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
        Why the AI classified this
      </span>
      {top.map((f, i) => {
        const val = f.shap_value ?? 0;
        const abs = f.abs_value ?? Math.abs(val);
        const dir = f.direction || (val >= 0 ? 'positive' : 'negative');
        const barColor = dir === 'positive' ? '#10b981' : '#ef4444';
        const widthPct = Math.round((abs / maxAbs) * 100);
        return (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-32 flex-shrink-0 truncate text-right font-mono text-[9px] text-[var(--nexus-text-3)]"
              title={f.feature}
            >
              {(f.feature || '').replace(/_/g, ' ')}
            </span>
            <div className="flex flex-1 items-center gap-1">
              <div className="h-3 flex-1 overflow-hidden rounded-sm bg-[var(--nexus-surface-3)]">
                <div
                  className="h-full rounded-sm transition-all duration-500"
                  style={{ width: `${widthPct}%`, background: barColor, opacity: 0.85 }}
                />
              </div>
              <span className="w-12 text-right font-mono text-[9px]" style={{ color: barColor }}>
                {val >= 0 ? '+' : ''}{val.toFixed(3)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResolutionSteps({ steps }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? steps : steps.slice(0, 5);
  const hasMore = steps.length > 5;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
        Resolution Steps
      </span>
      <ol className="flex flex-col gap-1">
        {visible.map((step, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[8px] font-bold"
              style={{ background: 'rgba(0,212,232,0.14)', color: '#00d4e8' }}
            >
              {i + 1}
            </span>
            <span className="text-[11px] leading-relaxed text-[var(--nexus-text-2)]">{step}</span>
          </li>
        ))}
      </ol>
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-0.5 self-start text-[10px] font-semibold text-[var(--nexus-cyan)] hover:opacity-80"
        >
          {showAll ? 'Show less' : `Show ${steps.length - 5} more`}
        </button>
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }) {
  const color = OUTCOME_COLORS[outcome] || '#94a3b8';
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]"
      style={{ background: `${color}18`, color }}
    >
      {(outcome || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

function Chip({ label, color }) {
  if (!label) return null;
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: `${color || '#64748b'}14`, color: color || '#94a3b8' }}
    >
      {label}
    </span>
  );
}

function CaseCard({ caseData, isExpanded, onToggle }) {
  const typeColor = TYPE_COLORS[caseData.type] || '#6b7280';
  const sentimentColor = SENTIMENT_COLORS[(caseData.customerSentiment?.label || '').toLowerCase()] || '#94a3b8';
  const dedupConf = caseData.dedupResult?.confidence != null
    ? Math.round(caseData.dedupResult.confidence * 100)
    : null;

  return (
    <div
      className="rounded-xl border transition-all duration-200"
      style={{
        borderColor: isExpanded ? 'rgba(0,212,232,0.25)' : 'var(--nexus-border)',
        background: isExpanded ? 'rgba(0,212,232,0.03)' : 'var(--nexus-surface-2)',
      }}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex-shrink-0 text-[#94a3b8]">
          {isExpanded
            ? <ChevronDown size={13} />
            : <ChevronRight size={13} />
          }
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--nexus-text-1)]">
          {caseData.filename || 'unknown'}
        </span>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
          <OutcomeBadge outcome={caseData.outcome} />
          {caseData.location && <Chip label={caseData.location} color="#00d4e8" />}
          {caseData.severity && (
            <Chip
              label={caseData.severity}
              color={
                caseData.severity === 'critical' ? '#ef4444'
                  : caseData.severity === 'high' ? '#f97316'
                  : caseData.severity === 'medium' ? '#f59e0b'
                  : '#10b981'
              }
            />
          )}
        </div>
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mx-4 mb-4 grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-2"
              style={{ borderColor: 'var(--nexus-border)' }}
            >
              {/* ML Intelligence */}
              <div className="flex flex-col gap-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
                  ML Intelligence
                </span>

                {caseData.type && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--nexus-text-3)]">Type</span>
                    <span
                      className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]"
                      style={{ background: `${typeColor}18`, color: typeColor }}
                    >
                      {caseData.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <ConfidenceBar label="ML Confidence" value={caseData.mlConfidence} color="#3b82f6" />
                  <ConfidenceBar label="LLM Confidence" value={caseData.llmConfidence} color="#FF8C00" />
                </div>

                {caseData.shapAvailable && caseData.shapFeatures?.length > 0 && (
                  <ShapWaterfall features={caseData.shapFeatures} />
                )}
              </div>

              {/* Right column: Customer + Pipeline */}
              <div className="flex flex-col gap-3">
                {/* Customer Intelligence */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
                    Customer Intelligence
                  </span>
                  {caseData.customerSentiment?.label && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--nexus-text-3)]">Sentiment</span>
                      <span
                        className="rounded-md px-2 py-0.5 text-[9px] font-bold capitalize"
                        style={{ background: `${sentimentColor}18`, color: sentimentColor }}
                      >
                        {caseData.customerSentiment.label}
                        {caseData.customerSentiment.score != null
                          ? ` (${Math.round(caseData.customerSentiment.score * 100)}%)`
                          : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Pipeline Decision */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
                    Pipeline Decision
                  </span>

                  {/* Dedup */}
                  {caseData.dedupResult && (
                    <div className="flex items-center gap-2">
                      {caseData.dedupResult.isDuplicate ? (
                        <span
                          className="rounded-md px-2 py-0.5 text-[9px] font-bold"
                          style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}
                        >
                          Duplicate of #{caseData.dedupResult.matchedId?.slice(-6) || '?'}
                          {dedupConf != null ? ` (${dedupConf}%)` : ''}
                        </span>
                      ) : (
                        <span
                          className="rounded-md px-2 py-0.5 text-[9px] font-bold"
                          style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}
                        >
                          Unique incident
                        </span>
                      )}
                    </div>
                  )}

                  {/* Routing */}
                  <div className="flex items-center gap-2">
                    {caseData.autoResolved ? (
                      <span
                        className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}
                      >
                        Auto-resolved
                      </span>
                    ) : caseData.hitlRouted ? (
                      <span
                        className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em]"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
                      >
                        Sent to HITL review
                      </span>
                    ) : null}
                  </div>

                  {/* SOP */}
                  {(caseData.sopCode || caseData.sopTitle) && (
                    <div className="flex items-start gap-1.5">
                      <span className="mt-0.5 text-[10px] text-[var(--nexus-text-3)]">SOP</span>
                      <span className="text-[10px] text-[var(--nexus-text-2)]">
                        {[caseData.sopCode, caseData.sopTitle].filter(Boolean).join(' - ')}
                      </span>
                    </div>
                  )}

                  {/* Resolution tone */}
                  {caseData.resolutionTone && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--nexus-text-3)]">Tone</span>
                      <span className="text-[10px] capitalize text-[var(--nexus-text-2)]">
                        {caseData.resolutionTone}
                      </span>
                    </div>
                  )}
                </div>

                {/* Skip reason */}
                {caseData.skipReason && (
                  <div
                    className="rounded-lg border p-2"
                    style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}
                  >
                    <span className="text-[10px] leading-relaxed text-[#ef4444]">
                      Skipped: {caseData.skipReason}
                    </span>
                  </div>
                )}
              </div>

              {/* Resolution steps — full width if present */}
              {caseData.outcome === 'created' && caseData.resolutionSteps?.length > 0 && (
                <div className="col-span-1 md:col-span-2">
                  <ResolutionSteps steps={caseData.resolutionSteps} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CaseIntelTab({ runCases, casesLoading }) {
  const [expandedCase, setExpandedCase] = useState(null);

  const { run, cases } = runCases;

  if (casesLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 size={24} className="animate-spin text-[var(--nexus-cyan)]" />
        <p className="text-[12px] text-[var(--nexus-text-3)]">Loading case intelligence...</p>
      </div>
    );
  }

  if (!run && cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)' }}
        >
          <Brain size={24} style={{ color: '#FF8C00' }} />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-[var(--nexus-text-2)]">
            No case intelligence yet
          </p>
          <p className="max-w-xs text-[11px] leading-relaxed text-[var(--nexus-text-3)]">
            Run the robot to see per-case intelligence. Each processed file will appear here with full AI chain breakdown.
          </p>
        </div>
      </div>
    );
  }

  // Summary counts
  const total = cases.length;
  const created = cases.filter((c) => c.outcome === 'created').length;
  const duplicates = cases.filter((c) => c.outcome === 'duplicate').length;
  const failed = cases.filter((c) => c.outcome === 'failed').length;
  const autoResolved = cases.filter((c) => c.autoResolved).length;
  const hitlReview = cases.filter((c) => c.hitlRouted).length;

  const runTime = run?.completedAt
    ? fmtTime(run.completedAt)
    : run?.startedAt
      ? fmtTime(run.startedAt)
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
        style={{ borderColor: 'rgba(0,212,232,0.2)', background: 'rgba(0,212,232,0.04)' }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <SummaryCount label="Total" value={total} color="#94a3b8" />
          <SummaryCount label="Created" value={created} color="#10b981" />
          <SummaryCount label="Duplicates" value={duplicates} color="#f59e0b" />
          <SummaryCount label="Failed" value={failed} color="#ef4444" />
          <span className="h-4 w-px bg-[var(--nexus-border)]" />
          <SummaryCount label="Auto-resolved" value={autoResolved} color="#10b981" />
          <SummaryCount label="HITL Review" value={hitlReview} color="#ef4444" />
        </div>
        {runTime && (
          <span className="text-[10px] text-[var(--nexus-text-3)]">
            {total} cases processed - last run: {runTime}
          </span>
        )}
      </div>

      {/* Case cards */}
      <div className="flex flex-col gap-2">
        {cases.map((c, i) => {
          const key = c.filename || String(i);
          return (
            <CaseCard
              key={key}
              caseData={c}
              isExpanded={expandedCase === key}
              onToggle={() => setExpandedCase((prev) => (prev === key ? null : key))}
            />
          );
        })}
      </div>
    </div>
  );
}

function SummaryCount({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
        {label}
      </span>
      <span className="font-mono text-[13px] font-black tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/* ── RPA BPMN Flowchart ──────────────────────────────────────────────────────── */

function RpaBpmnFlowchart() {
  // ── Geometry ────────────────────────────────────────────────────────────
  // Wider canvas so branches breathe; vertical spine for readability.
  const SVG_W = 560;
  const SVG_H = 760;
  const cx = SVG_W / 2;          // center spine
  const lx = 90;                  // left column
  const rx = SVG_W - 90;          // right column

  const BOX_H = 36;
  const DIAMOND = 50;

  // Y positions — uniform 80px spacing for clean rhythm
  const Y = {
    start:        20,
    readFile:     90,
    dedupCheck:   165,
    branchY:      165 + DIAMOND / 2,   // y-level of branches off dedup
    skipLog:      225,
    aiClassify:   285,
    confCheck:    365,
    confBranchY:  365 + DIAMOND / 2,
    hitlRoute:    430,
    autoResolve:  430,
    sendEmail:    520,
    updateNexus:  590,
    summaryEmail: 660,
    end:          730,
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const pill = (x, y, label, color, w = 160) => (
    <g key={`p-${label}-${x}-${y}`}>
      <rect
        x={x - w / 2} y={y} width={w} height={BOX_H}
        rx={7} ry={7}
        fill={`${color}14`}
        stroke={`${color}66`}
        strokeWidth={1.3}
      />
      <text
        x={x} y={y + BOX_H / 2 + 4}
        textAnchor="middle"
        fontSize={11}
        fontFamily="ui-monospace,monospace"
        fill={color}
        fontWeight="600"
        letterSpacing="0.01em"
      >
        {label}
      </text>
    </g>
  );

  const diamond = (x, y, label, color = '#f59e0b') => {
    const d = DIAMOND;
    return (
      <g key={`d-${label}`}>
        <polygon
          points={`${x},${y} ${x + d / 2},${y + d / 2} ${x},${y + d} ${x - d / 2},${y + d / 2}`}
          fill={`${color}14`}
          stroke={`${color}66`}
          strokeWidth={1.3}
        />
        <text
          x={x} y={y + d / 2 + 4}
          textAnchor="middle"
          fontSize={10}
          fontFamily="ui-monospace,monospace"
          fill={color}
          fontWeight="700"
        >
          {label}
        </text>
      </g>
    );
  };

  const oval = (x, y, label, color) => (
    <g key={`o-${label}`}>
      <ellipse
        cx={x} cy={y + 18}
        rx={56} ry={18}
        fill={`${color}1a`}
        stroke={`${color}80`}
        strokeWidth={1.6}
      />
      <text
        x={x} y={y + 23}
        textAnchor="middle"
        fontSize={11}
        fontFamily="ui-monospace,monospace"
        fill={color}
        fontWeight="700"
        letterSpacing="0.06em"
      >
        {label}
      </text>
    </g>
  );

  // Single line + arrowhead. Use unique marker IDs so multiple instances
  // don't share the same arrowhead color.
  const Line = ({ x1, y1, x2, y2, color = 'rgba(148,163,184,0.55)', dashed = false, label, labelOffset = 12, labelSide = 'right' }) => {
    const id = `arrhead-${x1}-${y1}-${x2}-${y2}-${color.replace(/[^a-z0-9]/gi, '')}`;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const labelX = labelSide === 'right' ? mx + labelOffset : mx - labelOffset;
    return (
      <g>
        <defs>
          <marker
            id={id}
            markerWidth="7" markerHeight="7"
            refX="6" refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill={color} />
          </marker>
        </defs>
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color} strokeWidth={1.4}
          markerEnd={`url(#${id})`}
          strokeDasharray={dashed ? '4,3' : undefined}
          strokeLinecap="round"
        />
        {label && (
          <text
            x={labelX} y={my + 3}
            textAnchor={labelSide === 'right' ? 'start' : 'end'}
            fontSize={9.5}
            fontFamily="ui-monospace,monospace"
            fill={color}
            fontWeight="700"
            letterSpacing="0.06em"
          >
            {label}
          </text>
        )}
      </g>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-2)' }}>
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--nexus-border)' }}>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#00d4e8' }}>
          UiPath RPA Workflow · BPMN Process Diagram
        </span>
        <span className="ml-auto rounded px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
          BPMN 2.0
        </span>
      </div>
      <div className="flex justify-center overflow-x-auto p-4">
        <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ maxWidth: '100%' }}>

          {/* ── Try/Catch wrapper — subtle dashed band behind protected steps ─ */}
          {/* Drawn FIRST so all nodes render on top. */}
          <g opacity="0.85">
            <rect
              x={lx - 10}
              y={Y.aiClassify - 14}
              width={SVG_W - (lx - 10) * 2}
              height={(Y.autoResolve + BOX_H + 14) - (Y.aiClassify - 14)}
              rx={8}
              fill="rgba(239,68,68,0.025)"
              stroke="rgba(239,68,68,0.22)"
              strokeWidth={1}
              strokeDasharray="3,4"
            />
            <text
              x={SVG_W - 16}
              y={Y.aiClassify - 4}
              textAnchor="end"
              fontSize={9}
              fontFamily="ui-monospace,monospace"
              fill="rgba(239,68,68,0.85)"
              fontWeight="700"
              letterSpacing="0.1em"
            >
              TRY / CATCH · SCREENSHOT ON FAILURE
            </text>
          </g>

          {/* ── START ─────────────────────────────────────────────────────── */}
          {oval(cx, Y.start, 'START', '#10b981')}
          <Line x1={cx} y1={Y.start + 36} x2={cx} y2={Y.readFile} />

          {/* ── Read File ────────────────────────────────────────────────── */}
          {pill(cx, Y.readFile, 'Read File from Watch Folder', '#00d4e8', 220)}
          <Line x1={cx} y1={Y.readFile + BOX_H} x2={cx} y2={Y.dedupCheck} />

          {/* ── Duplicate? diamond ───────────────────────────────────────── */}
          {diamond(cx, Y.dedupCheck, 'Duplicate?', '#f59e0b')}

          {/* YES branch — left, terminating at Skip + Log */}
          <Line x1={cx - DIAMOND / 2} y1={Y.branchY} x2={lx + 50} y2={Y.branchY}
                color="rgba(239,68,68,0.78)" label="YES" labelSide="left" labelOffset={4} />
          <Line x1={lx + 50} y1={Y.branchY} x2={lx + 50} y2={Y.skipLog}
                color="rgba(239,68,68,0.78)" />
          {pill(lx + 50, Y.skipLog, 'Skip + Log', '#ef4444', 110)}

          {/* NO branch — straight down to AI Classify */}
          <Line x1={cx} y1={Y.dedupCheck + DIAMOND} x2={cx} y2={Y.aiClassify}
                color="rgba(16,185,129,0.78)" label="NO" labelOffset={6} />

          {/* ── AI Classify ──────────────────────────────────────────────── */}
          {pill(cx, Y.aiClassify, 'AI Classify (LightGBM + LLM)', '#FF8C00', 240)}
          <Line x1={cx} y1={Y.aiClassify + BOX_H} x2={cx} y2={Y.confCheck} />

          {/* ── Confidence diamond ──────────────────────────────────────── */}
          {diamond(cx, Y.confCheck, 'Conf ≥ 75%?', '#f59e0b')}

          {/* LOW conf -> HITL Route (left) */}
          <Line x1={cx - DIAMOND / 2} y1={Y.confBranchY} x2={lx + 60} y2={Y.confBranchY}
                color="rgba(239,68,68,0.78)" label="LOW" labelSide="left" labelOffset={4} />
          <Line x1={lx + 60} y1={Y.confBranchY} x2={lx + 60} y2={Y.hitlRoute}
                color="rgba(239,68,68,0.78)" />
          {pill(lx + 60, Y.hitlRoute, 'HITL Route', '#ef4444', 130)}

          {/* HIGH conf -> Auto-Resolve (right) */}
          <Line x1={cx + DIAMOND / 2} y1={Y.confBranchY} x2={rx - 60} y2={Y.confBranchY}
                color="rgba(16,185,129,0.78)" label="HIGH" labelOffset={4} />
          <Line x1={rx - 60} y1={Y.confBranchY} x2={rx - 60} y2={Y.autoResolve}
                color="rgba(16,185,129,0.78)" />
          {pill(rx - 60, Y.autoResolve, 'Auto-Resolve', '#10b981', 130)}

          {/* ── Both branches converge to Send Response Email ───────────── */}
          {/* HITL: down then over to center */}
          <Line x1={lx + 60} y1={Y.hitlRoute + BOX_H} x2={lx + 60} y2={Y.sendEmail + BOX_H / 2} />
          <Line x1={lx + 60} y1={Y.sendEmail + BOX_H / 2} x2={cx - 100} y2={Y.sendEmail + BOX_H / 2} />
          {/* Auto-Resolve: down then over to center */}
          <Line x1={rx - 60} y1={Y.autoResolve + BOX_H} x2={rx - 60} y2={Y.sendEmail + BOX_H / 2} />
          <Line x1={rx - 60} y1={Y.sendEmail + BOX_H / 2} x2={cx + 100} y2={Y.sendEmail + BOX_H / 2} />

          {/* ── Send Response Email ─────────────────────────────────────── */}
          {pill(cx, Y.sendEmail, 'Send Response Email', '#3b82f6', 200)}
          <Line x1={cx} y1={Y.sendEmail + BOX_H} x2={cx} y2={Y.updateNexus} />

          {/* ── Update NEXUS DB ─────────────────────────────────────────── */}
          {pill(cx, Y.updateNexus, 'Update NEXUS DB', '#14b8a6', 180)}
          <Line x1={cx} y1={Y.updateNexus + BOX_H} x2={cx} y2={Y.summaryEmail} />

          {/* ── Send Summary Email ──────────────────────────────────────── */}
          {pill(cx, Y.summaryEmail, 'Send Summary Email', '#FF8C00', 200)}
          <Line x1={cx} y1={Y.summaryEmail + BOX_H} x2={cx} y2={Y.end} />

          {/* ── END ─────────────────────────────────────────────────────── */}
          {oval(cx, Y.end, 'END', '#ef4444')}

          {/* ── Legend (bottom-left, clean) ─────────────────────────────── */}
          <g transform="translate(16, 16)">
            <rect
              x={0} y={0} width={150} height={84}
              rx={6}
              fill="rgba(15,17,22,0.6)"
              stroke="var(--nexus-border)"
              strokeWidth={1}
            />
            <text x={10} y={16} fontSize={8.5} fontFamily="ui-monospace,monospace"
                  fill="rgba(148,163,184,0.7)" fontWeight="700" letterSpacing="0.12em">
              LEGEND
            </text>
            {[
              { color: '#10b981', label: 'Start / Success path' },
              { color: '#00d4e8', label: 'Process step' },
              { color: '#f59e0b', label: 'Decision gate' },
              { color: '#ef4444', label: 'Error / HITL path' },
            ].map(({ color, label }, i) => (
              <g key={label} transform={`translate(10, ${28 + i * 14})`}>
                <rect x={0} y={0} width={10} height={8} rx={2}
                      fill={`${color}30`} stroke={`${color}90`} strokeWidth={1} />
                <text x={16} y={8} fontSize={9} fill="#cbd5e1"
                      fontFamily="ui-monospace,monospace">
                  {label}
                </text>
              </g>
            ))}
          </g>

        </svg>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RpaCenter() {
  const [stats, setStats] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [cloudLaunching, setCloudLaunching] = useState(false);
  const [cloudJob, setCloudJob] = useState(null);
  const [consoleLines, setConsoleLines] = useState([]);
  const [activeStep, setActiveStep] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [sseConnected, setSseConnected] = useState(false);
  const [screenshots, setScreenshots] = useState([]);
  const [escalationCount, setEscalationCount] = useState(0);

  // Tab + case intel state
  const [activeTab, setActiveTab] = useState('feed');
  const [runCases, setRunCases] = useState({ run: null, cases: [] });
  const [casesLoading, setCasesLoading] = useState(false);

  const consoleRef = useRef(null);
  const esRef = useRef(null);
  const lineIdRef = useRef(0);

  // ── Auto-scroll console ──────────────────────────────────────────────────────
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLines]);

  // ── Load stats + best recent run on mount ────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/v1/rpa/stats`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/v1/rpa-runs?limit=10`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null),
    ]).then(([statsData, runsData]) => {
      if (statsData) {
        setStats(statsData);
        if (statsData.lastRun) setLastRun(statsData.lastRun);
      }
      // Pre-populate Case Intel with the most recent run that actually processed files.
      if (Array.isArray(runsData)) {
        const bestRun = runsData.find((r) => (r.processedCount ?? 0) > 0 || (r.totalFiles ?? 0) > 0);
        if (bestRun?.runId) {
          fetch(`${API_BASE}/api/v1/rpa/runs/${bestRun.runId}/cases`, { credentials: 'include' })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.cases?.length) setRunCases({ run: d.run ?? null, cases: d.cases }); })
            .catch(() => {});
        }
      }
    }).catch(() => {});
  }, []);

  // ── Fetch case intel for a completed run ──────────────────────────────────────
  const fetchRunCases = useCallback(async (jobId) => {
    if (!jobId) return;
    setCasesLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/rpa/runs/${jobId}/cases`, {
        credentials: 'include',
      });
      if (!r.ok) return;
      const data = await r.json();
      setRunCases({ run: data.run ?? null, cases: data.cases ?? [] });
    } catch {
      // silently ignore — case intel is additive, not critical
    } finally {
      setCasesLoading(false);
    }
  }, []);

  // ── Auto-load case intel for the most recent run on mount ────────────────────
  useEffect(() => {
    if (lastRun?.runId) fetchRunCases(lastRun.runId);
  }, [lastRun?.runId, fetchRunCases]);

  // ── SSE connection ───────────────────────────────────────────────────────────
  const pushLine = useCallback((type, message, rawData) => {
    setConsoleLines((prev) => {
      const next = [
        ...prev,
        { id: ++lineIdRef.current, type, message, timestamp: fmtTime(rawData?.timestamp), raw: rawData },
      ];
      return next.length > MAX_CONSOLE_LINES ? next.slice(next.length - MAX_CONSOLE_LINES) : next;
    });
  }, []);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/v1/ops/live-stream`, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.onmessage = (e) => {
      let data;
      try { data = JSON.parse(e.data); } catch { return; }

      const type = data.type || '';

      // Pipeline step advancement
      if (type === 'rpa_robot_started' || type === 'bot_started') {
        setIsRunning(true);
        setActiveStep(0);
        setCompletedSteps(new Set());
      } else if (type === 'rpa_file_timeline') {
        const stage = data.meta?.stage || '';
        if (stage === 'file_seen') setActiveStep(0);
        else if (stage === 'intelligence_extracted') setActiveStep(1);
        else if (stage === 'dedup_checked' || stage === 'dedup_skipped') setActiveStep(3);
        else if (stage === 'incident_handoff' || stage === 'ai_completed') setActiveStep(2);
        else if (stage === 'file_archived') setActiveStep(6);
      } else if (type === 'email_scan') {
        setActiveStep(1);
        setCompletedSteps((prev) => new Set([...prev, 0]));
      } else if (type === 'classified') {
        setActiveStep(2);
        setCompletedSteps((prev) => new Set([...prev, 0, 1]));
      } else if (type === 'response_sent') {
        setActiveStep(4);
        setCompletedSteps((prev) => new Set([...prev, 0, 1, 2, 3]));
      } else if (type === 'rpa_batch_intelligence') {
        setActiveStep(6);
        setCompletedSteps((prev) => new Set([...prev, 0, 1, 2, 3]));
      } else if (type === 'bot_summary' || type === 'rpa_robot_complete') {
        setActiveStep(-1);
        setCompletedSteps(new Set([0, 1, 2, 3, 4, 5, 6]));
        setIsRunning(false);
        setIsDemoRunning(false);
        setLaunching(false);
        if (data.filesProcessed != null || data.meta) {
          setLastRun({
            runId: data.runId || data.jobId,
            status: 'completed',
            filesProcessed: data.filesProcessed ?? data.meta?.processed,
            duplicatesSkipped: data.duplicatesSkipped ?? data.meta?.duplicates,
            errors: data.errors ?? data.meta?.errors,
            duration: data.duration,
            narrative: data.narrative,
          });
        }
        // Fetch case intel automatically when run completes
        const jobId = data.jobId || data.runId;
        if (jobId) fetchRunCases(jobId);
      } else if (type === 'rpa_robot_error') {
        setIsRunning(false);
        setIsDemoRunning(false);
        setLaunching(false);
      } else if (type === 'screenshot_taken') {
        const file = data.meta?.screenshotFile || data.screenshotFile;
        const url = data.meta?.url || data.url;
        if (file) setScreenshots(prev => [{ file, url, ts: fmtTime() }, ...prev].slice(0, 10));
      } else if (type === 'escalation_required') {
        setEscalationCount(prev => prev + 1);
      }

      // Push to console
      const msg = buildConsoleMessage(data);
      if (msg || type) pushLine(type, msg, data);
    };

    return () => { es.close(); esRef.current = null; setSseConnected(false); };
  }, [pushLine, fetchRunCases]);

  // ── Reset pipeline to idle ────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setIsRunning(false);
    setIsDemoRunning(false);
    setLaunching(false);
    setActiveStep(-1);
    setCompletedSteps(new Set());
  }, []);

  // ── Launch handlers ──────────────────────────────────────────────────────────
  const handleLaunch = useCallback(async (demo = false) => {
    setLaunching(true);
    setIsRunning(true);
    setConsoleLines([]);
    setActiveStep(0);
    setCompletedSteps(new Set());

    try {
      if (demo) {
        const r = await fetch(`${API_BASE}/api/v1/ops/demo/start`, { method: 'POST', credentials: 'include' });
        if (!r.ok) throw new Error(`demo/start ${r.status}`);
        setIsDemoRunning(true);
      } else {
        const r = await fetch(`${API_BASE}/api/v1/rpa/trigger`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demo: false }),
        });
        if (!r.ok) throw new Error(`trigger ${r.status}`);
        const data = await r.json();
        if (data.mode === 'demo') {
          // Robot not configured — run the scripted demo instead
          setIsDemoRunning(true);
          const dr = await fetch(`${API_BASE}/api/v1/ops/demo/start`, { method: 'POST', credentials: 'include' });
          if (!dr.ok) throw new Error(`demo/start ${dr.status}`);
        }
      }
    } catch {
      setIsRunning(false);
      setIsDemoRunning(false);
      setActiveStep(-1);
    } finally {
      setLaunching(false);
    }
  }, []);

  const handleCloudLaunch = useCallback(async () => {
    setCloudLaunching(true);
    setCloudJob(null);
    try {
      const data = await triggerCloudDispatcher();
      setCloudJob({
        jobKey: data.jobKey,
        state: data.state,
        startedAt: new Date().toISOString(),
      });
    } catch (err) {
      setCloudJob({ error: err.message || 'Failed to start cloud dispatcher' });
    } finally {
      setCloudLaunching(false);
    }
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────────
  const botRunning = isRunning || isDemoRunning;

  return (
    <Layout title="RPA Mission Control">
      <div className="flex flex-col gap-5 pb-8">

        {/* ── Header strip ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3 flex-shrink-0 items-center justify-center">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{
                  background: botRunning ? '#10b981' : '#475569',
                  animation: botRunning ? 'ping 1.2s cubic-bezier(0,0,0.2,1) infinite' : 'none',
                }}
              />
              <span
                className="relative inline-flex h-3 w-3 rounded-full"
                style={{ background: botRunning ? '#10b981' : '#475569' }}
              />
            </div>
            <div>
              <h1 className="text-[22px] font-black leading-tight tracking-tight text-[var(--nexus-text-1)]">
                RPA Mission Control
              </h1>
              <p className="text-[11px] font-medium text-[var(--nexus-text-3)]">
                UiPath Automation Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{
                background: botRunning ? 'rgba(16,185,129,0.12)' : 'rgba(71,85,105,0.18)',
                border: `1px solid ${botRunning ? 'rgba(16,185,129,0.35)' : 'rgba(71,85,105,0.35)'}`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: botRunning ? '#10b981' : '#475569' }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{ color: botRunning ? '#10b981' : '#64748b' }}
              >
                {botRunning ? 'Live Bot' : 'Ready'}
              </span>
            </div>

            {escalationCount > 0 && (
              <Link
                to="/review"
                className="flex items-center gap-1.5 rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] px-3 py-1.5 text-[11px] font-bold text-[#ef4444] transition-colors hover:bg-[rgba(239,68,68,0.2)]"
              >
                <AlertTriangle size={12} />
                {escalationCount} HITL
              </Link>
            )}

            {botRunning && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-3 py-1.5 text-[11px] font-semibold text-[#ef4444] transition-colors hover:bg-[rgba(239,68,68,0.18)]"
              >
                Abort
              </button>
            )}

            <button
              type="button"
              onClick={() => handleLaunch(true)}
              disabled={botRunning || launching}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--nexus-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--nexus-text-2)] transition-colors hover:border-[var(--nexus-cyan)] hover:text-[var(--nexus-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Demo Mode
            </button>

            <button
              type="button"
              onClick={handleCloudLaunch}
              disabled={cloudLaunching}
              title="Trigger UiPath Cloud Orchestrator dispatcher (polls Outlook → posts to backend)"
              className="flex items-center gap-2 rounded-xl border border-[rgba(56,189,248,0.4)] bg-[rgba(56,189,248,0.08)] px-3 py-2 text-[12px] font-bold text-[#38bdf8] transition-all hover:bg-[rgba(56,189,248,0.16)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cloudLaunching ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Cloud size={14} />
              )}
              Run Cloud Dispatcher
            </button>

          </div>

          {cloudJob && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-[rgba(56,189,248,0.3)] bg-[rgba(56,189,248,0.06)] px-3 py-2 text-[11px]">
              {cloudJob.error ? (
                <>
                  <AlertTriangle size={12} className="text-[#ef4444]" />
                  <span className="text-[#ef4444]">{cloudJob.error}</span>
                </>
              ) : (
                <>
                  <Cloud size={12} className="text-[#38bdf8]" />
                  <span className="text-[var(--nexus-text-2)]">
                    Cloud job <span className="font-mono text-[#38bdf8]">{cloudJob.jobKey?.slice(0, 8)}…</span> {cloudJob.state} — incidents will appear on the Board within ~15 s
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Stats row ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Total Runs"
            value={fmtNum(stats?.totalRuns)}
            color="#00d4e8"
            icon={Zap}
            trend={stats?.totalRuns ? '+12%' : null}
          />
          <StatCard
            label="Files Processed"
            value={fmtNum(stats?.totalFiles)}
            color="#FF8C00"
            icon={FolderOpen}
            trend={stats?.totalFiles ? '+8%' : null}
          />
          <StatCard
            label="Success Rate"
            value={stats?.successRate != null ? `${stats.successRate}%` : '—'}
            color="#10b981"
            icon={CheckCircle2}
          />
          <StatCard
            label="Duplicates Skipped"
            value={fmtNum(stats?.totalDuplicates)}
            color="#f59e0b"
            icon={Copy}
          />
        </div>

        {/* ── Three-column main section ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[30%_45%_25%]">

          {/* Left: Pipeline diagram */}
          <div
            className="flex flex-col rounded-2xl border"
            style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-2)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--nexus-border)] px-4 py-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-2)]">
                Pipeline
              </span>
              <span
                className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{
                  background: botRunning ? 'rgba(0,212,232,0.12)' : 'rgba(71,85,105,0.14)',
                  color: botRunning ? '#00d4e8' : '#475569',
                }}
              >
                {botRunning ? 'Running' : 'Idle'}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-0 px-3 py-3">
              {PIPELINE_STEPS.map((step, idx) => {
                const isActive = activeStep === idx;
                const isComplete = completedSteps.has(idx);
                const isIdle = !isActive && !isComplete;
                return (
                  <div key={step.id}>
                    <PipelineNode
                      step={step}
                      isActive={isActive}
                      isComplete={isComplete}
                      isIdle={isIdle}
                    />
                    {idx < PIPELINE_STEPS.length - 1 && (
                      <ConnectorLine
                        isActive={activeStep === idx + 1 || (botRunning && activeStep > idx)}
                        isComplete={completedSteps.has(idx) && completedSteps.has(idx + 1)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center + Right: tabbed area */}
          <div className="contents lg:col-span-1 lg:col-start-2 lg:flex lg:flex-col lg:gap-0"
            style={{ gridColumn: '2 / span 2' }}
          >
            <div className="flex flex-col gap-4" style={{ gridColumn: '2 / span 2' }}>

              {/* Tab selector */}
              <div
                className="flex items-center gap-1 self-start rounded-xl border p-1"
                style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-2)' }}
              >
                {[
                  { id: 'feed', label: 'Live Feed' },
                  { id: 'intel', label: 'Case Intel' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="rounded-lg px-4 py-1.5 text-[11px] font-bold transition-all duration-150"
                    style={
                      activeTab === tab.id
                        ? { background: 'rgba(0,212,232,0.15)', color: '#00d4e8' }
                        : { color: 'var(--nexus-text-3)' }
                    }
                  >
                    {tab.label}
                    {tab.id === 'intel' && runCases.cases.length > 0 && (
                      <span
                        className="ml-1.5 rounded-full px-1.5 py-0.5 text-[8px] font-black"
                        style={{ background: 'rgba(167,139,250,0.2)', color: '#FF8C00' }}
                      >
                        {runCases.cases.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content row */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">

                {activeTab === 'feed' ? (
                  <>
                    {/* Live console */}
                    <div
                      className="flex flex-col rounded-2xl border"
                      style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-1)' }}
                    >
                      <div className="flex items-center justify-between border-b border-[var(--nexus-border)] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-2)]">
                            Live Console
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: sseConnected ? '#10b981' : '#475569' }}
                            />
                            <span
                              className="text-[9px] font-semibold"
                              style={{ color: sseConnected ? '#10b981' : '#475569' }}
                            >
                              {sseConnected ? 'Connected' : 'Offline'}
                            </span>
                          </div>
                        </div>
                        {consoleLines.length > 0 && (
                          <span className="rounded-md bg-[var(--nexus-surface-3)] px-2 py-0.5 font-mono text-[9px] text-[var(--nexus-text-3)]">
                            {consoleLines.length} events
                          </span>
                        )}
                      </div>

                      <div
                        ref={consoleRef}
                        className="flex-1 overflow-y-auto"
                        style={{ minHeight: 340, maxHeight: 520 }}
                      >
                        {consoleLines.length === 0 ? (
                          <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-xl"
                              style={{ background: 'var(--nexus-surface-2)', border: '1px solid var(--nexus-border)' }}
                            >
                              <Mail size={16} className="text-[var(--nexus-text-3)]" />
                            </div>
                            <p className="text-[12px] text-[var(--nexus-text-3)]">
                              Click &lsquo;Launch Robot&rsquo; or &lsquo;Demo Mode&rsquo; to see the automation in action
                            </p>
                          </div>
                        ) : (
                          <div className="py-1">
                            <AnimatePresence initial={false}>
                              {consoleLines.map((line) => (
                                <motion.div
                                  key={line.id}
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  <ConsoleLine line={line} />
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Run details (right of console) */}
                    <div
                      className="flex flex-col rounded-2xl border"
                      style={{
                        borderColor: 'var(--nexus-border)',
                        background: 'var(--nexus-surface-2)',
                        minWidth: 220,
                        maxWidth: 280,
                      }}
                    >
                      <div className="flex flex-col gap-2 border-b border-[var(--nexus-border)] p-4">
                        <button
                          type="button"
                          onClick={() => handleLaunch(false)}
                          disabled={botRunning || launching}
                          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ background: '#D40511', boxShadow: '0 0 16px rgba(212,5,17,0.30)' }}
                        >
                          {launching ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Zap size={14} />
                          )}
                          Launch Robot
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLaunch(true)}
                          disabled={botRunning || launching}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--nexus-border)] py-2 text-[12px] font-semibold text-[var(--nexus-text-2)] transition-colors hover:border-[var(--nexus-cyan)] hover:text-[var(--nexus-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Demo Mode
                        </button>
                      </div>

                      <div
                        className="mx-4 my-0 h-px"
                        style={{ background: 'var(--nexus-border)' }}
                      />

                      <div className="flex-1 p-4">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
                          Last Run
                        </p>
                        <RunDetails lastRun={lastRun} isRunning={isRunning} />
                      </div>
                    </div>
                  </>
                ) : (
                  /* Case Intel tab — full width */
                  <div className="col-span-full">
                    <CaseIntelTab runCases={runCases} casesLoading={casesLoading} />
                  </div>
                )}

              </div>
            </div>
          </div>

        </div>

        {/* ── Error Screenshots ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {screenshots.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[rgba(167,139,250,0.25)] bg-[rgba(167,139,250,0.06)] p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <Image size={14} className="text-[#FF8C00]" />
                <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#FF8C00]">
                  Error Screenshots ({screenshots.length})
                </span>
                <span className="text-[10px] text-[var(--nexus-text-3)]">
                  - captured by UiPath robot, served live from NEXUS backend
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {screenshots.map((ss, i) => (
                  <a
                    key={i}
                    href={`${API_BASE}${ss.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col gap-1.5 rounded-lg border border-[rgba(167,139,250,0.2)] bg-[var(--nexus-surface-2)] p-2 transition-all hover:border-[#FF8C00]"
                  >
                    <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-md bg-[var(--nexus-surface-3)]">
                      <img
                        src={`${API_BASE}${ss.url}`}
                        alt={ss.file}
                        className="max-h-full max-w-full object-contain opacity-80 group-hover:opacity-100"
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="max-w-[132px] truncate font-mono text-[9px] text-[var(--nexus-text-3)]">
                        {ss.file}
                      </span>
                      <ExternalLink size={10} className="flex-shrink-0 text-[#FF8C00]" />
                    </div>
                    <span className="text-[9px] text-[var(--nexus-text-3)]">{ss.ts}</span>
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Integration Architecture ──────────────────────────────────────────── */}
        <div
          className="rounded-2xl border p-5"
          style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-2)' }}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[14px] font-bold tracking-tight text-[var(--nexus-text-1)]">
                Integration Architecture
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--nexus-text-3)]">
                How UiPath RPA bridges physical operations to AI-driven incident resolution
              </p>
            </div>
            <div
              className="flex-shrink-0 rounded-lg px-2.5 py-1"
              style={{ background: 'rgba(212,5,17,0.12)', border: '1px solid rgba(212,5,17,0.25)' }}
            >
              <span className="text-[10px] font-bold tracking-[0.1em] text-[#D40511]">B1 REQUIREMENT</span>
            </div>
          </div>

          <div className="mb-6">
            <RpaBpmnFlowchart />
          </div>

          <div className="mb-6 flex flex-wrap items-start justify-center gap-1">
            <FlowBox label="NEXUS Watch Folder" sub="Shared network path" color="#00d4e8" />
            <FlowArrow label="UiPath reads files" />
            <FlowBox label="UiPath Bot" sub="Orchestrator managed" color="#D40511" />
            <FlowArrow label="HTTP POST" />
            <FlowBox label="NEXUS API" sub="/api/v1/incidents" color="#FF8C00" />
            <FlowArrow label="ML pipeline" />
            <div className="flex flex-col gap-1.5">
              <FlowBox label="LightGBM ML" sub="99.65% accuracy" color="#f59e0b" />
              <FlowBox label="GPT / DeepSeek LLM" sub="Resolution + draft" color="#3b82f6" />
            </div>
            <FlowArrow label="results" />
            <div className="flex flex-col gap-1.5">
              <FlowBox label="Classification" sub="Type + severity" color="#10b981" />
              <FlowBox label="Email Draft" sub="SOP-matched reply" color="#10b981" />
            </div>
            <FlowArrow label="UiPath sends" />
            <FlowBox label="Customer Email" sub="Auto-dispatched" color="#00d4e8" />
            <FlowArrow label="run report" />
            <FlowBox label="NEXUS Dashboard" sub="Live updates" color="#D40511" />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'High-volume ingestion',
                body: 'Automates high-volume email ingestion - 150+ emails per batch without human intervention.',
                color: '#00d4e8',
              },
              {
                title: 'Offline-to-cloud bridge',
                body: 'Bridges offline files and shared drives to the AI cloud pipeline via watched folders.',
                color: '#FF8C00',
              },
              {
                title: 'Closed-loop execution',
                body: 'Closes the loop: AI decides, RPA acts. No manual copy-paste between systems.',
                color: '#10b981',
              },
              {
                title: 'Full audit trail',
                body: 'Provides tamper-evident run reports after every batch for compliance and traceability.',
                color: '#f59e0b',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border p-3"
                style={{
                  borderColor: `${item.color}25`,
                  background: `${item.color}06`,
                }}
              >
                <p className="mb-1 text-[11px] font-bold" style={{ color: item.color }}>
                  {item.title}
                </p>
                <p className="text-[11px] leading-relaxed text-[var(--nexus-text-3)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
