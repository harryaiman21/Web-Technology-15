import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, Bot, Brain, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Copy, FileCode2, Lightbulb, Loader2, Mail, MessageSquare,
  Pencil, Phone, Send, Shield, TrendingDown, TrendingUp, User,
  X, XCircle, Zap,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';

import AIReasoningDrawer from '../components/AIReasoningDrawer';
import AuditTimeline from '../components/AuditTimeline';
import Badge from '../components/Badge';
import CaseMemoryPanel from '../components/CaseMemoryPanel';
import ConfidenceBar from '../components/ConfidenceBar';
import DistressPredictor from '../components/DistressPredictor';
import EmptyState from '../components/EmptyState';
import IncidentAttachments from '../components/IncidentAttachments';
import Layout from '../components/Layout';
import LoadingSkeleton from '../components/LoadingSkeleton';
import OutcomeValidationCard from '../components/OutcomeValidationCard';
import SlaCountdown from '../components/SlaCountdown';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import {
  approveRecovery, generateCallBrief, generateHandoverNote,
  getAuditLog, getCustomerProfile, getIncident, getIncidentExplanation,
  getIncidents, patchIncident, rejectRecovery, sendAgentReply,
} from '../lib/api';

const TYPE_OPTIONS = ['late_delivery', 'damaged_parcel', 'missing_parcel', 'address_error', 'system_error', 'wrong_item', 'other'];
const SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const DEPARTMENT_OPTIONS = ['Operations', 'Customer Service', 'Logistics', 'IT', 'Finance'];

function reference(id) {
  if (!id) return 'INC-UNSET';
  return `INC-${String(id).slice(-6).toUpperCase()}`;
}
function formatDateTime(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (isNaN(d)) return 'N/A';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(value) {
  if (!value) return '';
  const s = Math.round((Date.now() - new Date(value)) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ── Design constants ──────────────────────────────────────────────────────────
const KIND_DOT = {
  system:   'bg-[var(--surface-3)] border border-[var(--border)]',
  bot:      'bg-[rgb(59,130,246,0.2)] border border-[rgb(59,130,246,0.5)]',
  success:  'bg-[rgb(16,185,129,0.2)] border border-[rgb(16,185,129,0.5)]',
  human:    'bg-[rgb(245,158,11,0.2)] border border-[rgb(245,158,11,0.5)]',
  decision: 'bg-[rgb(34,211,238,0.12)] border border-[rgb(34,211,238,0.4)]',
  error:    'bg-[rgb(239,68,68,0.15)] border border-[rgb(239,68,68,0.5)]',
};
const KIND_ICON_COLOR = {
  system: 'text-[var(--text-3)]', bot: 'text-[#3B82F6]', success: 'text-[#10b981]',
  human: 'text-[#F59E0B]', decision: 'text-[#FFCC00]', error: 'text-[#ef4444]',
};
const KIND_LABEL = {
  system: 'text-[var(--text-2)]', bot: 'text-[var(--text-1)]', success: 'text-[#10b981]',
  human: 'text-[#F59E0B]', decision: 'text-[#FFCC00] font-semibold', error: 'text-[#ef4444]',
};

// ── Build timeline ────────────────────────────────────────────────────────────
function buildTimeline(incident) {
  const events = [];
  events.push({
    kind: 'system', icon: Mail,
    label: incident.source === 'rpa' ? 'Email Received via RPA' : 'Incident Submitted',
    detail: incident.customerEmail ? `From: ${incident.customerEmail}` : null,
    ts: incident.createdAt,
    modal: 'email',
    modalLabel: 'View Email',
  });

  if (incident.source === 'rpa' || incident.awbNumber || incident.sentimentScore !== undefined) {
    const chips = [
      incident.awbNumber && `AWB: ${incident.awbNumber}`,
      incident.detectedLanguage === 'ms' && 'Language: Bahasa Melayu',
      incident.sentimentLabel && `Sentiment: ${incident.sentimentLabel.replace(/_/g, ' ')}`,
      incident.isRepeatCustomer && `Repeat customer · ${incident.customerHistoryCount} prior cases`,
    ].filter(Boolean);
    events.push({
      kind: 'bot', icon: Bot,
      label: 'RPA Enrichment',
      detail: chips.length ? chips.join(' · ') : 'Customer DNA extracted',
      ts: null,
      modal: 'dna',
      modalLabel: 'Customer DNA',
    });
  }

  if (incident.type) {
    events.push({
      kind: 'bot', icon: Brain,
      label: 'AI Classification',
      detail: `${String(incident.type).replace(/_/g, ' ')} · ${Math.round((incident.confidence || 0) * 100)}% confidence · ${incident.severity || 'Low'}`,
      ts: null,
      modal: 'ai',
      modalLabel: 'View Reasoning',
    });
  }

  const resolution = incident.agentResults?.resolution || incident.agentResults?.resolution_suggestion;
  if (resolution?.steps?.length || resolution?.sopCode) {
    events.push({
      kind: 'success', icon: Lightbulb,
      label: 'SOP Matched',
      detail: resolution.sopCode ? `SOP-${resolution.sopCode} · ${resolution.steps?.length || 0} steps` : `${resolution.steps.length} resolution steps generated`,
      ts: null,
    });
  }

  const rm = incident.recoveryMessage;
  if (rm?.generatedAt) {
    if (rm.status === 'hitl_required') {
      events.push({ kind: 'decision', icon: MessageSquare, label: 'Recovery Draft — Awaiting Human Approval', detail: 'AI-drafted message ready · Review and approve before sending', ts: rm.generatedAt, isCurrent: true });
    } else if (['approved', 'auto_sent'].includes(rm.status)) {
      events.push({ kind: 'success', icon: CheckCircle2, label: 'Recovery Message Sent to Customer', detail: rm.approvedBy ? `Approved by ${rm.approvedBy}` : 'Auto-sent by AI', ts: rm.approvedAt || rm.generatedAt });
    } else if (rm.status === 'rejected') {
      events.push({ kind: 'error', icon: XCircle, label: 'Recovery Message Rejected', detail: 'Manual intervention required', ts: null });
    }
  }

  const threadReplies = (incident.conversationThread || []).filter(m => m.role === 'agent');
  if (threadReplies.length > 0) {
    events.push({
      kind: 'human', icon: User,
      label: `Agent Replied (${threadReplies.length} message${threadReplies.length > 1 ? 's' : ''})`,
      detail: threadReplies[threadReplies.length - 1].text.slice(0, 80) + (threadReplies[threadReplies.length - 1].text.length > 80 ? '…' : ''),
      ts: threadReplies[threadReplies.length - 1].ts,
    });
  }

  const terminalMap = {
    RESOLVED:       { kind: 'success', icon: CheckCircle2, label: 'Resolved' },
    CLOSED:         { kind: 'success', icon: CheckCircle2, label: 'Closed' },
    BREACHED:       { kind: 'error',   icon: AlertTriangle, label: 'SLA Breached — Escalation Required' },
    UNDER_REVIEW:   { kind: 'human',   icon: Shield, label: 'Under Review by Agent', isCurrent: true },
    PENDING_REVIEW: { kind: 'decision', icon: Shield, label: 'Pending Review — Action Required', isCurrent: true },
    DRAFT:          { kind: 'error',   icon: XCircle, label: 'Draft / Rejected' },
  };
  const terminal = terminalMap[incident.status];
  const skipTerminal = rm?.generatedAt && rm.status === 'hitl_required';
  if (terminal && !skipTerminal) {
    events.push({ ...terminal, detail: null, ts: incident.updatedAt });
  }

  return events;
}

function getPrimaryCTA(incident, canReview) {
  const rm = incident.recoveryMessage;
  // textColor is paired with bg color for WCAG-passing contrast.
  // DHL yellow (#FFCC00) requires dark text — white-on-yellow fails AA badly.
  if (rm?.status === 'hitl_required' && canReview)
    return { label: 'Approve & Send Recovery', action: 'approve_recovery', color: '#FFCC00', textColor: '#1A1A1A' };
  if (incident.status === 'PENDING_REVIEW' && canReview)
    return { label: 'Start Review', action: 'under_review', color: '#3B82F6', textColor: '#FFFFFF' };
  if (incident.status === 'UNDER_REVIEW' && canReview)
    return { label: 'Mark Resolved', action: 'resolved', color: '#10b981', textColor: '#FFFFFF' };
  if (incident.status === 'BREACHED' && canReview)
    return { label: 'Mark Resolved & Close', action: 'resolved', color: '#10b981', textColor: '#FFFFFF' };
  if (incident.status === 'BREACHED')
    return { label: 'Escalate Now', action: 'escalate', color: '#D40511', textColor: '#FFFFFF' };
  return null;
}

// ── Helper components ─────────────────────────────────────────────────────────
function MetaRow({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">{label}</p>
      <p className={`mt-0.5 text-sm text-[var(--text-1)] ${mono ? 'font-mono' : ''}`}>{value || 'N/A'}</p>
    </div>
  );
}
function SopStepsList({ steps }) {
  const [expanded, setExpanded] = useState(false);
  const showCount = expanded ? steps.length : Math.min(3, steps.length);
  const remaining = steps.length - 3;
  return (
    <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">SOP Steps</p>
      <ol className="space-y-1 pl-4 text-[12px] text-[var(--text-2)]">
        {steps.slice(0, showCount).map((step, i) => (
          <li key={i} className="list-decimal">{typeof step === 'string' ? step : (step?.text || JSON.stringify(step))}</li>
        ))}
      </ol>
      {steps.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-4 mt-1 text-[10px] font-semibold text-[var(--accent-blue)] hover:underline"
        >
          {expanded ? '— Show fewer' : `+ ${remaining} more step${remaining === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

function ResolutionSummaryPanel({ incident }) {
  const rm = incident.recoveryMessage;
  const resolutionSteps = incident.agentResults?.resolution?.steps || [];
  const sopCode = incident.agentResults?.resolution?.sopCode;
  const matchedSop = incident.agentResults?.resolution?.matchedSop;
  const wasAutonomous = rm?.status === 'auto_sent' || (incident.status === 'RESOLVED' && !rm);
  const recoveryStatus = rm?.status;
  const ts = incident.resolvedAt || incident.updatedAt;
  const minutes = ts && incident.createdAt
    ? Math.max(0, Math.round((new Date(ts).getTime() - new Date(incident.createdAt).getTime()) / 60000))
    : null;

  const recoveryLabel = (() => {
    if (recoveryStatus === 'auto_sent') return { tag: 'AUTO-SENT', tone: '#10b981', desc: 'Recovery email sent autonomously to the customer' };
    if (recoveryStatus === 'approved') return { tag: 'APPROVED + SENT', tone: '#10b981', desc: 'Reviewer approved the draft. Email sent to the customer.' };
    if (recoveryStatus === 'rejected') return { tag: 'REJECTED', tone: '#ef4444', desc: 'Reviewer rejected the draft. No customer email sent.' };
    if (recoveryStatus === 'hitl_required') return { tag: 'HUMAN REVIEW', tone: '#f59e0b', desc: 'Draft held for human review before send.' };
    return { tag: 'NO RECOVERY NEEDED', tone: '#64748b', desc: 'Severity below threshold. Customer not contacted; case closed.' };
  })();

  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(16,185,129,0.12)]">
          <CheckCircle2 size={14} className="text-[#10b981]" />
        </div>
        <h3 className="text-[13px] font-semibold text-[var(--text-1)]">What NEXUS Did</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-3)]">
          {minutes != null ? `${minutes} min open → close` : 'Resolution Summary'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-[var(--text-3)]">Classified</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-1)]">
            {(incident.type || 'unknown').replace(/_/g, ' ')} · {incident.severity || 'unspecified'}
          </p>
          <p className="text-[10px] text-[var(--text-3)]">
            {Math.round((incident.confidence || 0) * 100)}% confidence
          </p>
        </div>
        <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-[var(--text-3)]">SOP Applied</p>
          <p className="mt-1 truncate text-sm font-medium text-[var(--text-1)]">
            {sopCode || matchedSop || 'No SOP matched'}
          </p>
          <p className="text-[10px] text-[var(--text-3)]">
            {resolutionSteps.length} resolution step{resolutionSteps.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="rounded-[6px] border px-3 py-2 mb-3" style={{
        borderColor: `${recoveryLabel.tone}33`,
        background: `${recoveryLabel.tone}10`,
      }}>
        <div className="flex items-center gap-2">
          <span className="rounded-[2px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{
            background: `${recoveryLabel.tone}22`,
            color: recoveryLabel.tone,
          }}>
            {recoveryLabel.tag}
          </span>
          <span className="text-[11px] text-[var(--text-2)]">{recoveryLabel.desc}</span>
        </div>
        {rm?.text && (
          <p className="mt-2 text-[11px] italic leading-relaxed text-[var(--text-2)] line-clamp-3">
            "{rm.text.slice(0, 280)}{rm.text.length > 280 ? '…' : ''}"
          </p>
        )}
      </div>

      {resolutionSteps.length > 0 && (
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-wider text-[var(--text-3)]">Resolution steps executed</p>
          <ol className="space-y-1">
            {resolutionSteps.slice(0, 5).map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-[var(--text-2)]">
                <span className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[9px] font-bold text-[var(--text-3)]">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{typeof step === 'string' ? step : (step?.text || JSON.stringify(step))}</span>
              </li>
            ))}
            {resolutionSteps.length > 5 && (
              <li className="text-[10px] text-[var(--text-3)] pl-6">+ {resolutionSteps.length - 5} more steps</li>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}

function ErrorBar({ message, onRetry }) {
  return (
    <div className="rounded-[6px] border-l-[3px] border-[var(--accent-red)] bg-[rgb(239,68,68,0.1)] px-4 py-3 text-sm text-[var(--text-1)]">
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
      </div>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nexus-modal-backdrop)] p-4 backdrop-blur-sm">
      <div
        className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-solid)] shadow-2xl backdrop-blur-xl ${wide ? 'max-w-3xl' : 'max-w-2xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-1)]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-[var(--text-3)]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
          >
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ── Email Modal ───────────────────────────────────────────────────────────────
function EmailModal({ incident, onClose }) {
  const sentLabel = {
    ms: { flag: '🇲🇾', name: 'Bahasa Melayu' },
    en: { flag: '🇬🇧', name: 'English' },
  }[incident.detectedLanguage || 'en'];

  return (
    <Modal title="Customer Email" subtitle={`Received via RPA · ${formatDateTime(incident.createdAt)}`} onClose={onClose}>
      <div className="p-6 space-y-5">
        {/* Email header strip */}
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-[#FFCC00] to-transparent" />
          <div className="px-5 py-4 space-y-2.5">
            {[
              ['From', incident.customerEmail || 'Unknown sender'],
              ['To',   'DHL Support <noreply@dhl.com>'],
              ['Subject', incident.title || String(incident.type || 'Support Request').replace(/_/g, ' ')],
              ['Date', formatDateTime(incident.createdAt)],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 text-sm">
                <span className="w-16 shrink-0 text-[var(--text-3)]">{k}</span>
                <span className="text-[var(--text-1)] font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Detected signals */}
        <div className="flex flex-wrap gap-2">
          {incident.awbNumber && (
            <span className="flex items-center gap-1.5 rounded-[4px] border border-[var(--accent-amber)]/30 bg-[rgb(245,158,11,0.08)] px-3 py-1.5 text-[11px] font-medium text-[var(--accent-amber)]">
              📦 AWB: {incident.awbNumber}
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1.5 text-[11px] text-[var(--text-2)]">
            {sentLabel.flag} {sentLabel.name}
          </span>
          {incident.sentimentLabel && (
            <span className={`flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-[11px] font-semibold ${
              ['frustrated', 'very_frustrated'].includes(incident.sentimentLabel)
                ? 'border-[rgb(212,5,17,0.4)] bg-[rgb(212,5,17,0.08)] text-[#D40511]'
                : 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-2)]'
            }`}>
              Sentiment: {incident.sentimentLabel.replace(/_/g, ' ')}
            </span>
          )}
          {incident.source === 'rpa' && (
            <span className="flex items-center gap-1.5 rounded-[4px] border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-400">
              <Bot size={11} /> RPA Ingested
            </span>
          )}
        </div>

        {/* Email body */}
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            Email Body
          </div>
          <div className="px-5 py-5 text-sm leading-7 text-[var(--text-2)] whitespace-pre-wrap">
            {incident.rawInput || incident.description || 'No message body recorded.'}
          </div>
        </div>

        {/* RPA extraction note */}
        <div className="flex items-start gap-3 rounded-[6px] border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-[12px] text-[var(--text-3)]">
          <Bot size={14} className="text-blue-400 shrink-0 mt-0.5" />
          <span>This email was automatically ingested by the UiPath RPA bot, which extracted the AWB number, detected the language, and scored customer sentiment before creating this incident.</span>
        </div>
      </div>
    </Modal>
  );
}

// ── Sentiment Sparkline (mini SVG) ───────────────────────────────────────────
function SentimentSparkline({ history }) {
  if (!history || history.length < 2) return null;
  const pts = history.slice(-12);
  const w = 200;
  const h = 40;
  const pad = 2;
  const step = (w - pad * 2) / (pts.length - 1);
  const points = pts.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - (p.score * (h - pad * 2));
    return `${x},${y}`;
  }).join(' ');

  const lastScore = pts[pts.length - 1].score;
  const dotColor = lastScore >= 0.6 ? '#10b981' : lastScore >= 0.35 ? '#F59E0B' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={dotColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={dotColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${points} ${pad + (pts.length - 1) * step},${h - pad}`}
        fill="url(#spark-grad)"
      />
      <polyline points={points} fill="none" stroke={dotColor} strokeWidth="1.5" strokeLinejoin="round" />
      <circle
        cx={pad + (pts.length - 1) * step}
        cy={h - pad - (lastScore * (h - pad * 2))}
        r="3"
        fill={dotColor}
      />
    </svg>
  );
}

// ── Customer DNA Modal ────────────────────────────────────────────────────────
function CustomerDNAModal({ incident, priorCases, customerProfile, onClose }) {
  const p = customerProfile;

  const sentCfg = {
    very_frustrated: { color: '#D40511', bar: 'bg-[#D40511]', label: 'Very Frustrated' },
    frustrated:      { color: '#ef4444', bar: 'bg-[#ef4444]', label: 'Frustrated' },
    neutral:         { color: '#F59E0B', bar: 'bg-[#F59E0B]', label: 'Neutral' },
    positive:        { color: '#10b981', bar: 'bg-[#10b981]', label: 'Positive' },
  }[incident.sentimentLabel || 'neutral'] || { color: '#F59E0B', bar: 'bg-[#F59E0B]', label: 'Neutral' };

  const typeFreq = {};
  priorCases.forEach(c => {
    const t = c.type || 'other';
    typeFreq[t] = (typeFreq[t] || 0) + 1;
  });
  const topType = Object.entries(typeFreq).sort((a, b) => b[1] - a[1])[0];

  const trendCfg = {
    improving: { icon: TrendingUp, color: '#10b981', label: 'Improving' },
    worsening: { icon: TrendingDown, color: '#ef4444', label: 'Worsening' },
    stable:    { icon: null, color: '#F59E0B', label: 'Stable' },
  };
  const trend = trendCfg[p?.frustrationTrend] || trendCfg.stable;

  const TAG_STYLE = {
    repeat:           'bg-[rgb(59,130,246,0.15)] text-[#3B82F6] border-[rgb(59,130,246,0.3)]',
    'high-risk':      'bg-[rgb(239,68,68,0.15)] text-[#ef4444] border-[rgb(239,68,68,0.3)]',
    'escalation-prone': 'bg-[rgb(245,158,11,0.15)] text-[#F59E0B] border-[rgb(245,158,11,0.3)]',
    loyal:            'bg-[rgb(16,185,129,0.15)] text-[#10b981] border-[rgb(16,185,129,0.3)]',
  };
  const defaultTag = 'bg-[var(--surface)] text-[var(--text-2)] border-[var(--border)]';

  const OUTCOME_DOT = {
    satisfied:   'bg-[#10b981]',
    escalated:   'bg-[#ef4444]',
    no_response: 'bg-[var(--text-3)]',
    pending:     'bg-[#F59E0B]',
  };

  return (
    <Modal title="Customer Intelligence" subtitle={p?.name || incident.customerEmail || 'Unknown customer'} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
        {/* Left: profile + analytics */}
        <div className="p-6 space-y-5">
          {/* Avatar + identity */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(34,211,238,0.12)] text-xl font-bold text-[#FFCC00]">
              {(incident.customerEmail?.[0] || 'C').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text-1)] truncate">{p?.name || incident.customerEmail || 'Unknown'}</p>
              {p?.name && <p className="text-[11px] text-[var(--text-3)] truncate">{incident.customerEmail}</p>}
              <p className="text-[12px] text-[var(--text-3)]">
                {(p?.totalCases || 0) >= 2
                  ? `Repeat customer - ${p.totalCases} total cases`
                  : 'First contact'}
              </p>
              {p?.firstSeenAt && (
                <p className="text-[10px] text-[var(--text-3)]">
                  Customer since {new Date(p.firstSeenAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* Behavioral tags */}
          {p?.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.tags.map((tag) => (
                <span key={tag} className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TAG_STYLE[tag] || defaultTag}`}>
                  {tag.replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          )}

          {/* Sentiment sparkline */}
          {p?.sentimentHistory?.length >= 2 && (
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Sentiment Over Time</p>
                <div className="flex items-center gap-1.5">
                  {trend.icon && <trend.icon size={12} style={{ color: trend.color }} />}
                  <span className="text-[10px] font-semibold" style={{ color: trend.color }}>{trend.label}</span>
                </div>
              </div>
              <SentimentSparkline history={p.sentimentHistory} />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-[var(--text-3)]">{p.sentimentHistory.length} data points</span>
                <span className="font-mono text-[10px] text-[var(--text-3)]">avg {Math.round((p.averageSentiment || 0) * 100)}%</span>
              </div>
            </div>
          )}

          {/* Current sentiment bar */}
          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-3)] mb-3">Current Sentiment</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold" style={{ color: sentCfg.color }}>{sentCfg.label}</span>
              {incident.sentimentScore !== undefined && (
                <span className="font-mono text-[11px] text-[var(--text-3)]">{Math.round(incident.sentimentScore * 100)}% positive</span>
              )}
            </div>
            {incident.sentimentScore !== undefined && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                <div className={`h-full rounded-full ${sentCfg.bar} transition-all duration-700`} style={{ width: `${Math.round(incident.sentimentScore * 100)}%` }} />
              </div>
            )}
          </div>

          {/* Stats row */}
          {p && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Satisfied', value: p.totalSatisfied || 0, color: '#10b981' },
                { label: 'Escalated', value: p.totalEscalations || 0, color: '#ef4444' },
                { label: 'Chat Msgs', value: p.chatBehavior?.totalMessages || 0, color: '#3B82F6' },
              ].map((s) => (
                <div key={s.label} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-3 text-center">
                  <p className="font-mono text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-3)]">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Language + AWB row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-3">
              <p className="text-[9px] uppercase tracking-wider text-[var(--text-3)]">Language</p>
              <p className="text-sm font-medium text-[var(--text-1)] mt-1">
                {(p?.preferredLanguage || incident.detectedLanguage) === 'ms' ? 'Bahasa Melayu' : 'English'}
              </p>
            </div>
            {incident.awbNumber && (
              <div className="rounded-[8px] border border-[var(--accent-amber)]/30 bg-[rgb(245,158,11,0.06)] p-3">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-3)]">AWB</p>
                <p className="mt-1 font-mono text-sm font-bold text-[var(--accent-amber)]">{incident.awbNumber}</p>
              </div>
            )}
          </div>

          {/* Pattern insight */}
          {topType && (
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Pattern Detected</p>
              <p className="text-sm text-[var(--text-1)]">
                <span className="font-semibold">{topType[1]} of {priorCases.length}</span> prior cases were{' '}
                <span className="font-semibold text-[var(--accent-amber)]">{topType[0].replace(/_/g, ' ')}</span>
              </p>
            </div>
          )}
        </div>

        {/* Right: case history with outcomes */}
        <div className="p-6 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Case History {(p?.totalCases || priorCases.length) > 0 ? `- ${p?.totalCases || priorCases.length} total` : ''}
          </p>

          {/* Current case */}
          <div className="rounded-[6px] border border-[rgba(34,211,238,0.3)] bg-[rgba(34,211,238,0.06)] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-[#FFCC00]">Current Case</span>
              <span className="font-mono text-[10px] text-[var(--text-3)]">{reference(incident._id)}</span>
            </div>
            <p className="mt-1 text-[12px] text-[var(--text-2)]">{String(incident.type || 'unclassified').replace(/_/g, ' ')} - {incident.severity}</p>
            <p className="text-[10px] text-[var(--text-3)]">{timeAgo(incident.createdAt)}</p>
          </div>

          {/* Profile cases with outcomes */}
          {p?.cases?.length > 1 ? (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {p.cases
                .filter((c) => c.incidentId !== incident._id)
                .slice(0, 8)
                .map((c) => (
                  <Link
                    key={c.incidentId || c._id}
                    to={`/incidents/${c.incidentId}`}
                    onClick={onClose}
                    className="flex items-start justify-between gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2.5 transition-colors hover:bg-[var(--surface)]"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <div className={`h-2 w-2 shrink-0 rounded-full ${OUTCOME_DOT[c.outcome] || OUTCOME_DOT.pending}`} />
                      <div>
                        <p className="text-[12px] font-medium text-[var(--text-1)] truncate capitalize">
                          {String(c.type || 'unclassified').replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-[var(--text-3)]">
                          {c.outcome || 'pending'}{c.resolvedAt ? ` - ${timeAgo(c.resolvedAt)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                        c.severity === 'Critical' ? 'bg-[#D40511] text-white' : c.severity === 'High' ? 'bg-[#F59E0B] text-black' : 'bg-[var(--surface)] text-[var(--text-2)]'
                      }`}>{c.severity || 'Low'}</span>
                      <ChevronRight size={12} className="text-[var(--text-3)]" />
                    </div>
                  </Link>
                ))}
            </div>
          ) : priorCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-[var(--text-3)]">
              <User size={28} className="mb-2 opacity-30" />
              <p className="text-sm">No prior cases found</p>
              <p className="text-[11px]">First contact for this customer</p>
            </div>
          ) : (
            <div className="space-y-2">
              {priorCases.map((c) => (
                <Link
                  key={c._id}
                  to={`/incidents/${c._id}`}
                  onClick={onClose}
                  className="flex items-start justify-between gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2.5 transition-colors hover:bg-[var(--surface)]"
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[var(--text-1)] truncate capitalize">
                      {String(c.type || 'unclassified').replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] text-[var(--text-3)]">{c.status} - {timeAgo(c.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      c.severity === 'Critical' ? 'bg-[#D40511] text-white' : c.severity === 'High' ? 'bg-[#F59E0B] text-black' : 'bg-[var(--surface)] text-[var(--text-2)]'
                    }`}>{c.severity || 'Low'}</span>
                    <ChevronRight size={12} className="text-[var(--text-3)]" />
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Outcome legend */}
          {p?.cases?.length > 1 && (
            <div className="flex items-center gap-4 pt-2 border-t border-[var(--border)]">
              {[
                { label: 'Satisfied', dot: 'bg-[#10b981]' },
                { label: 'Escalated', dot: 'bg-[#ef4444]' },
                { label: 'Pending', dot: 'bg-[#F59E0B]' },
                { label: 'No response', dot: 'bg-[var(--text-3)]' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
                  <span className="text-[9px] text-[var(--text-3)]">{l.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Chat behavior stats */}
          {p?.chatBehavior?.totalMessages > 0 && (
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Chat Behavior</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-[var(--text-3)]">Avg Tone</p>
                  <p className="font-mono font-semibold text-[var(--text-1)]">
                    {Math.round((p.chatBehavior.averageResponseTone || 0.5) * 100)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-3)]">Escalations</p>
                  <p className="font-mono font-semibold" style={{ color: (p.chatBehavior.escalationCount || 0) > 0 ? '#ef4444' : 'var(--text-1)' }}>
                    {p.chatBehavior.escalationCount || 0}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── AI Classification Modal ───────────────────────────────────────────────────
function AIClassificationModal({ incident, explanation, explanationLoading, onClose }) {
  const [view, setView] = useState('plain');
  const resolution = incident.agentResults?.resolution || incident.agentResults?.resolution_suggestion;
  const classification = incident.agentResults?.classification;
  const mlService = incident.agentResults?.mlService;
  const intake = incident.agentResults?.intake;

  const confPct = Math.round((incident.confidence || 0) * 100);
  const confColor = confPct >= 80 ? '#10b981' : confPct >= 60 ? '#F59E0B' : '#ef4444';

  // Parse the actual multi-step reasoning the AI wrote
  const reasoningSteps = useMemo(() => {
    const raw = classification?.reasoning || '';
    if (!raw) return [];
    const labels = ['Signal Detection', 'ML Arbitration', 'Severity Assessment'];
    const parts = raw.split(/Step\s+\d+:/i).filter(Boolean).map((s) => s.trim());
    return parts.slice(0, 3).map((text, i) => ({ label: labels[i] || `Step ${i + 1}`, text }));
  }, [classification]);

  // Probability distribution from LightGBM
  const probabilities = mlService?.probabilities || mlService?.class_probabilities;
  const probEntries = probabilities
    ? Object.entries(probabilities).sort((a, b) => b[1] - a[1])
    : [];

  // Per-field confidence from classifier
  const fieldConfs = useMemo(() => {
    const f = classification?.fields || {};
    return [
      { key: 'Type', value: String(f.type?.value || incident.type || '—').replace(/_/g, ' '), conf: Math.round((f.type?.confidence || incident.confidence || 0) * 100) },
      { key: 'Severity', value: f.severity?.value || incident.severity || 'Low', conf: Math.round((f.severity?.confidence || 0.8) * 100) },
      { key: 'Department', value: f.department?.value || incident.department || 'Operations', conf: Math.round((f.department?.confidence || 0.8) * 100) },
    ];
  }, [classification, incident]);

  // Signals extracted by intake agent
  const signals = useMemo(() => {
    const fields = intake?.fields || {};
    const labelMap = { awbNumber: 'AWB', location: 'Location', customerName: 'Customer', type: 'Type Hint', urgency: 'Urgency' };
    return Object.entries(fields)
      .map(([key, val]) => {
        const v = typeof val === 'object' ? val?.value : val;
        if (!v || typeof v !== 'string' || ['unknown', 'n/a', 'none'].includes(v.toLowerCase())) return null;
        return { key: labelMap[key] || key.replace(/([A-Z])/g, ' $1').trim(), value: v, confidence: val?.confidence };
      })
      .filter(Boolean)
      .slice(0, 10);
  }, [intake]);

  const mlAgreement = classification?.mlAgreement;
  const mlConfidence = mlService?.confidence || mlService?.probability;

  return (
    <Modal title="AI Classification Reasoning" subtitle={`${String(incident.type || 'unclassified').replace(/_/g, ' ')} · ${confPct}% confidence`} onClose={onClose} wide>
      <div className="p-6 space-y-5">

        {/* Tab toggle */}
        <div className="flex items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-1 w-fit">
          {[['plain', 'AI Reasoning'], ['technical', 'Technical']].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-[6px] px-4 py-1.5 text-[12px] font-medium transition-all ${
                view === v ? 'bg-[var(--surface-2)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Confidence strip with per-field sub-bars */}
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-3)]">Classification Confidence</p>
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: confColor }}>{confPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${confPct}%`, background: `linear-gradient(90deg, ${confColor}88, ${confColor})` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {fieldConfs.map(({ key, value, conf }) => (
              <div key={key} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <p className="text-[9px] uppercase tracking-wider text-[var(--text-3)]">{key}</p>
                <p className="text-[12px] font-semibold capitalize text-[var(--text-1)] mt-0.5 truncate">{value}</p>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div className="h-full rounded-full" style={{ width: `${conf}%`, backgroundColor: confColor }} />
                </div>
                <p className="mt-0.5 font-mono text-[9px] text-[var(--text-3)]">{conf}%</p>
              </div>
            ))}
          </div>
        </div>

        {/* ML agreement badge */}
        {mlAgreement !== undefined && (
          <div className={`flex items-center gap-2.5 rounded-[6px] border px-4 py-2.5 text-[12px] ${
            mlAgreement
              ? 'border-[#10b981]/25 bg-[rgb(16,185,129,0.07)] text-[#10b981]'
              : 'border-[#F59E0B]/25 bg-[rgb(245,158,11,0.07)] text-[#F59E0B]'
          }`}>
            {mlAgreement ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span className="font-semibold">
              {mlAgreement ? 'Claude confirmed LightGBM ML prediction' : 'Claude overrode LightGBM ML prediction'}
            </span>
            {mlConfidence != null && (
              <span className="ml-auto font-mono opacity-60">ML: {Math.round(mlConfidence * 100)}%</span>
            )}
          </div>
        )}

        {/* ── AI REASONING VIEW ── */}
        {view === 'plain' && (
          <div className="space-y-4">

            {/* Actual step-by-step reasoning from the classifier agent */}
            {reasoningSteps.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">How the AI Decided</p>
                {reasoningSteps.map((step, i) => {
                  const colors = ['#FFCC00', '#10b981', '#FF8C00'];
                  const bgs   = ['rgba(255,204,0,0.06)', 'rgba(16,185,129,0.06)', 'rgba(255,140,0,0.06)'];
                  const borders = ['rgba(255,204,0,0.22)', 'rgba(16,185,129,0.22)', 'rgba(255,140,0,0.22)'];
                  return (
                    <div key={i} className="rounded-[8px] border p-4" style={{ borderColor: borders[i], background: bgs[i] }}>
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{ background: colors[i], color: '#030712' }}
                        >
                          {i + 1}
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors[i] }}>
                          {step.label}
                        </p>
                      </div>
                      <p className="text-[13px] leading-[1.65] text-[var(--text-2)]">{step.text}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-3">What the AI understood</p>
                <p className="text-[13px] leading-6 text-[var(--text-2)]">
                  Classified as <strong className="text-[var(--text-1)]">{String(incident.type || 'unknown').replace(/_/g, ' ')}</strong> with{' '}
                  <strong style={{ color: confColor }}>{confPct}%</strong> confidence.{' '}
                  {incident.severity === 'Critical' || incident.severity === 'High'
                    ? `Flagged ${incident.severity} severity due to urgency signals detected in the message.`
                    : `Assessed as ${incident.severity || 'Low'} severity based on reported impact.`}
                </p>
              </div>
            )}

            {/* Probability sweep across all 7 types */}
            {probEntries.length > 0 && (
              <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                  Probability Evaluated Across All Incident Types
                </p>
                <div className="space-y-2">
                  {probEntries.map(([type, prob]) => {
                    const isWinner = type === (classification?.decision || incident.type);
                    const pct = Math.round(prob * 100);
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <p className={`w-32 shrink-0 text-[11px] capitalize ${isWinner ? 'font-semibold text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>
                          {type.replace(/_/g, ' ')}
                        </p>
                        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: isWinner ? '#FFCC00' : 'rgba(107,114,128,0.35)' }}
                          />
                        </div>
                        <p className={`w-9 text-right font-mono text-[11px] tabular-nums ${isWinner ? 'font-bold text-[#FFCC00]' : 'text-[var(--text-3)]'}`}>
                          {pct}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Signals extracted by intake agent */}
            {signals.length > 0 && (
              <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-3">
                  {signals.length} Signals Extracted by Intake Agent
                </p>
                <div className="flex flex-wrap gap-2">
                  {signals.map((s) => (
                    <div key={s.key} className="rounded-[5px] border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1.5">
                      <p className="text-[9px] uppercase tracking-wider text-[var(--text-3)]">{s.key}</p>
                      <p className="text-[12px] font-medium text-[var(--text-1)] mt-0.5">{s.value}</p>
                      {s.confidence != null && (
                        <p className="font-mono text-[9px] text-[var(--text-3)]">{Math.round(s.confidence * 100)}%</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resolution steps as action cards */}
            {resolution?.steps?.length > 0 && (
              <div className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-3)] px-4 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                    Recommended Resolution Steps
                  </p>
                  {resolution.sopCode && (
                    <span className="rounded-[3px] border border-[#FFCC00]/30 bg-[rgba(255,204,0,0.08)] px-2 py-0.5 text-[10px] font-bold text-[#FFCC00]">
                      SOP-{resolution.sopCode}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {resolution.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-3)]">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(255,204,0,0.12)] text-[10px] font-bold text-[#FFCC00]">
                        {i + 1}
                      </div>
                      <p className="text-[13px] leading-5 text-[var(--text-2)]">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-[6px] border border-[rgba(255,204,0,0.18)] bg-[rgba(255,204,0,0.04)] px-4 py-3 text-[12px] text-[var(--text-3)]">
              <Brain size={14} className="mt-0.5 shrink-0 text-[#FFCC00]" />
              <span>
                8-agent pipeline: <strong className="text-[var(--text-2)]">intake</strong> → <strong className="text-[var(--text-2)]">classifier</strong> → <strong className="text-[var(--text-2)]">dedup</strong> → <strong className="text-[var(--text-2)]">SOP curator</strong> → <strong className="text-[var(--text-2)]">resolver</strong> → <strong className="text-[var(--text-2)]">recovery composer</strong> → <strong className="text-[var(--text-2)]">email dispatcher</strong> → <strong className="text-[var(--text-2)]">auditor</strong>. Each specialist independently contributes to the final verdict.
              </span>
            </div>
          </div>
        )}

        {/* ── TECHNICAL VIEW ── */}
        {view === 'technical' && (
          <div className="space-y-4">

            {/* Probability bars with raw values */}
            {probEntries.length > 0 && (
              <div className="overflow-hidden rounded-[8px] border border-[var(--border)]">
                <div className="border-b border-[var(--border)] bg-[var(--surface-3)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                  LightGBM Probability Distribution
                </div>
                <div className="space-y-2 p-4">
                  {probEntries.map(([type, prob]) => {
                    const isWinner = type === (classification?.decision || incident.type);
                    const pct = Math.round(prob * 100);
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <p className={`w-32 shrink-0 font-mono text-[11px] capitalize ${isWinner ? 'font-bold text-[#FFCC00]' : 'text-[var(--text-3)]'}`}>
                          {type.replace(/_/g, ' ')}
                        </p>
                        <div className="flex-1 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: isWinner ? '#FFCC00' : 'rgba(107,114,128,0.4)' }}
                          />
                        </div>
                        <p className={`w-14 text-right font-mono text-[11px] tabular-nums ${isWinner ? 'font-bold text-[#FFCC00]' : 'text-[var(--text-3)]'}`}>
                          {prob.toFixed(4)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Agent chain */}
            {Object.entries(incident.agentResults || {}).length > 0 && (
              <div className="overflow-hidden rounded-[8px] border border-[var(--border)]">
                <div className="border-b border-[var(--border)] bg-[var(--surface-3)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                  Agent Chain Results
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {Object.entries(incident.agentResults).map(([agentId, result]) => (
                    <div key={agentId} className="px-4 py-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[12px] font-semibold capitalize text-[var(--text-1)]">{agentId.replace(/_/g, ' ')}</span>
                        <span className="font-mono text-[11px] text-[var(--text-3)]">
                          conf: {(Number(result?.confidence) || 0).toFixed(3)}
                        </span>
                      </div>
                      <p className="line-clamp-3 text-[11px] leading-5 text-[var(--text-3)]">
                        {result?.reasoning || result?.decision || result?.classification || ({
                          request: 'Captured sender, subject, timestamps and headers — no LLM call required at this stage.',
                          mlService: 'LightGBM classifier returned class probabilities — see Top Types panel.',
                          uncertainty: 'Uncertainty score computed from classifier disagreement and severity escalation flags.',
                          shap: 'SHAP feature importance computed from LightGBM — see waterfall chart above.',
                          recovery: 'Recovery not triggered for this incident — risk threshold not met.',
                        }[agentId] || 'Numeric stage — no text reasoning produced.')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ML explanation / SHAP */}
            {explanationLoading ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-3)]">
                <Loader2 size={14} className="animate-spin" />
                Loading feature evidence from ML service…
              </div>
            ) : explanation ? (
              <div className="overflow-hidden rounded-[8px] border border-[var(--border)]">
                <div className="border-b border-[var(--border)] bg-[var(--surface-3)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                  ML Feature Importance
                </div>
                <div className="p-4">
                  <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-5 text-[var(--text-2)]">
                    {JSON.stringify(explanation, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}

            {/* Calibration */}
            {(incident.agentResults?.mlService?.calibrated || incident.agentResults?.mlService?.calibration_applied) && (
              <div className="flex items-center gap-2 rounded-[6px] border border-[#10b981]/25 bg-[rgb(16,185,129,0.07)] px-4 py-2.5 text-[12px] text-[#10b981]">
                <CheckCircle2 size={13} />
                Probability calibration applied — scores adjusted for real-world accuracy
              </div>
            )}
          </div>
        )}

      </div>
    </Modal>
  );
}

// ── Agent Chat Panel ──────────────────────────────────────────────────────────
function AgentChatPanel({ incident, onClose, onMessageSent }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentNotice, setSentNotice] = useState('');
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const thread = [
    // Seed with original customer email as first message
    {
      role: 'customer',
      text: incident.rawInput || incident.description || '',
      ts: incident.createdAt,
      sentBy: incident.customerEmail || 'Customer',
    },
    // AI recovery message as the "ai" role if it exists
    ...(incident.recoveryMessage?.text
      ? [{
          role: 'ai',
          text: incident.recoveryMessage.text,
          ts: incident.recoveryMessage.generatedAt,
          sentBy: 'NEXUS AI Draft',
          status: incident.recoveryMessage.status,
        }]
      : []),
    // Existing agent replies
    ...(incident.conversationThread || []),
  ].filter(m => m.text);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    setError('');
    setSentNotice('');
    try {
      await sendAgentReply(incident._id, message.trim());
      setMessage('');
      setSentNotice(incident.customerEmail
        ? `Message queued for delivery to ${incident.customerEmail} via RPA`
        : 'Message saved — no customer email on file');
      setTimeout(() => setSentNotice(''), 4000);
      onMessageSent?.();
    } catch (e) {
      setError(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend();
  }

  const bubbleCfg = {
    customer: { bg: 'bg-[var(--surface-3)]', text: 'text-[var(--text-1)]', align: 'mr-auto', maxW: 'max-w-[85%]', label: 'text-[var(--text-3)]' },
    ai:       { bg: 'bg-[rgba(34,211,238,0.06)] border border-[rgba(34,211,238,0.15)]', text: 'text-[var(--text-2)] italic', align: 'mr-auto', maxW: 'max-w-[85%]', label: 'text-[#FFCC00]' },
    agent:    { bg: 'bg-[rgb(59,130,246,0.12)] border border-[rgb(59,130,246,0.25)]', text: 'text-[var(--text-1)]', align: 'ml-auto', maxW: 'max-w-[85%]', label: 'text-[#3B82F6] text-right' },
  };

  return createPortal(
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-[var(--nexus-border)] bg-[var(--nexus-panel-solid)] shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(34,211,238,0.12)]">
          <MessageSquare size={14} className="text-[#FFCC00]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-1)]">Message Customer</p>
          <p className="text-[11px] text-[var(--text-3)] truncate">
            {incident.customerEmail || 'No email on file'} · via RPA email delivery
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Channel info */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-3)] px-5 py-2.5 text-[11px] text-[var(--text-3)]">
        <Mail size={11} />
        <span>Messages are queued for delivery via RPA Outlook integration</span>
        {incident.detectedLanguage === 'ms' && (
          <span className="ml-auto rounded-[2px] border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400">BM</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {thread.map((msg, i) => {
          const cfg = bubbleCfg[msg.role] || bubbleCfg.customer;
          return (
            <div key={i} className={`flex flex-col gap-1 ${cfg.align}`} style={{ maxWidth: cfg.maxW }}>
              <div className={`flex items-center gap-2 ${msg.role === 'agent' ? 'flex-row-reverse' : ''}`}>
                <span className={`text-[10px] font-medium ${cfg.label}`}>{msg.sentBy || msg.role}</span>
                <span className="text-[10px] text-[var(--text-3)]">{timeAgo(msg.ts)}</span>
                {msg.status === 'hitl_required' && (
                  <span className="rounded-[2px] border border-[rgb(245,158,11,0.4)] bg-[rgb(245,158,11,0.08)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--accent-amber)]">Draft</span>
                )}
                {['approved', 'auto_sent'].includes(msg.status) && (
                  <span className="text-[10px] text-[#10b981]">✓ Sent</span>
                )}
              </div>
              <div className={`rounded-[8px] px-3.5 py-2.5 text-[13px] leading-6 ${cfg.bg} ${cfg.text}`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        {thread.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-[var(--text-3)]">
            <MessageSquare size={24} className="mb-2 opacity-30" />
            <p className="text-sm">No messages yet</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="border-t border-[var(--border)] p-4 space-y-2">
        {error && <p className="text-[11px] text-[var(--accent-red)]">{error}</p>}
        {sentNotice && (
          <div className="flex items-center gap-2 rounded-[4px] border border-[#10b981]/25 bg-[rgb(16,185,129,0.07)] px-3 py-2 text-[11px] text-[#10b981]">
            <CheckCircle2 size={12} />
            {sentNotice}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder={`Write a message to ${incident.customerEmail || 'customer'}…`}
          className="w-full resize-none rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-1 focus:ring-[#FFCC00]"
        />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-[var(--text-3)]">Ctrl+Enter to send</p>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="flex items-center gap-2 rounded-[6px] bg-[#FFCC00] px-4 py-2 text-sm font-semibold text-[#030712] transition-all hover:bg-[#FFCC00] disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Inline HITL conversation panel ───────────────────────────────────────────
function ConversationPanel({ incident, canReview, recoveryBusy, onApprove, onReject, recoveryActionError }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[8px] border border-[rgb(212,5,17,0.3)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-3)] text-[10px] font-bold text-[var(--text-2)]">
            {(incident.customerEmail?.[0] || 'C').toUpperCase()}
          </div>
          <span className="text-[11px] font-medium text-[var(--text-2)]">{incident.customerEmail || 'Customer'}</span>
          <span className="ml-auto text-[10px] text-[var(--text-3)]">{timeAgo(incident.createdAt)}</span>
        </div>
        <div className="rounded-[6px] bg-[var(--surface-3)] p-3 text-sm leading-relaxed text-[var(--text-1)]">
          {incident.rawInput || incident.description || 'No message content.'}
        </div>
        {(incident.sentimentLabel || incident.awbNumber || incident.isRepeatCustomer) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {incident.isRepeatCustomer && (
              <span className="rounded-[2px] border border-[rgb(239,68,68,0.4)] bg-[rgb(239,68,68,0.08)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-red)]">Repeat ×{incident.customerHistoryCount || '?'}</span>
            )}
            {['frustrated', 'very_frustrated'].includes(incident.sentimentLabel) && (
              <span className="rounded-[2px] border border-[rgb(212,5,17,0.4)] bg-[rgb(212,5,17,0.08)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#D40511]">
                {incident.sentimentLabel === 'very_frustrated' ? 'Very Frustrated' : 'Frustrated'}
              </span>
            )}
            {incident.awbNumber && (
              <span className="rounded-[2px] border border-[var(--border)] bg-[var(--surface-3)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent-amber)]">{incident.awbNumber}</span>
            )}
          </div>
        )}
      </div>

      {incident.recoveryMessage?.text && (
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgb(212,5,17,0.15)]">
              <Bot size={12} className="text-[#FFCC00]" />
            </div>
            <span className="text-[11px] font-medium text-[var(--text-2)]">NEXUS AI Draft</span>
            <span className={`ml-1 rounded-[2px] border px-1.5 py-0.5 text-[9px] font-bold uppercase ${incident.recoveryMessage.language === 'ms' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-3)]'}`}>
              {incident.recoveryMessage.language === 'ms' ? 'BM' : 'EN'}
            </span>
            <span className="ml-auto rounded-[2px] border border-[rgb(245,158,11,0.4)] bg-[rgb(245,158,11,0.08)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--accent-amber)]">Draft · Pending</span>
          </div>
          <div className="rounded-[6px] border border-[rgb(212,5,17,0.2)] bg-[rgb(212,5,17,0.04)] p-3 text-sm italic leading-relaxed text-[var(--text-2)]">
            {incident.recoveryMessage.text}
          </div>
          {canReview && (
            <div
              data-tour="decision"
              style={{
                marginTop: 16,
                borderRadius: 10,
                border: '1px solid rgba(212,5,17,0.35)',
                background: 'rgba(212,5,17,0.04)',
                overflow: 'hidden',
              }}
            >
              {/* Decision header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderBottom: '1px solid rgba(212,5,17,0.2)',
                background: 'rgba(212,5,17,0.06)',
              }}>
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#D40511',
                  boxShadow: '0 0 8px rgba(212,5,17,0.8)',
                  flexShrink: 0,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#D40511',
                }}>
                  Human-in-the-Loop · Decision Required
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  color: 'var(--text-3)',
                }}>
                  This action is audited
                </span>
              </div>

              {/* Error */}
              {recoveryActionError && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.08)' }}>
                  {recoveryActionError}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, padding: '14px' }}>
                <button
                  type="button"
                  disabled={recoveryBusy}
                  onClick={onApprove}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    height: 44,
                    background: recoveryBusy ? 'rgba(16,185,129,0.4)' : '#10B981',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#ffffff',
                    cursor: recoveryBusy ? 'not-allowed' : 'pointer',
                    boxShadow: recoveryBusy ? 'none' : '0 4px 16px rgba(16,185,129,0.35)',
                    transition: 'all 150ms',
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={(e) => { if (!recoveryBusy) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
                >
                  {recoveryBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Approve & Send to Customer
                </button>
                <button
                  type="button"
                  disabled={recoveryBusy}
                  onClick={onReject}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    height: 44,
                    padding: '0 18px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-2)',
                    cursor: recoveryBusy ? 'not-allowed' : 'pointer',
                    transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => {
                    if (!recoveryBusy) {
                      e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
                      e.currentTarget.style.color = '#ef4444';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--text-2)';
                  }}
                >
                  <XCircle size={14} />
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Detail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [incident, setIncident] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('timeline');
  const [dataSection, setDataSection] = useState('raw');
  const [actionError, setActionError] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [overrideDraft, setOverrideDraft] = useState({ type: '', severity: '', department: '' });
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(true);
  const [explanationError, setExplanationError] = useState('');

  const [callBrief, setCallBrief] = useState(null);
  const [callBriefLoading, setCallBriefLoading] = useState(false);
  const [showCallBriefModal, setShowCallBriefModal] = useState(false);
  const [handoverNote, setHandoverNote] = useState(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showReasoningDrawer, setShowReasoningDrawer] = useState(false);

  const [priorCases, setPriorCases] = useState([]);
  const [priorCasesLoaded, setPriorCasesLoaded] = useState(false);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryActionError, setRecoveryActionError] = useState('');

  // Modal state
  const [activeModal, setActiveModal] = useState(null); // 'email' | 'dna' | 'ai'
  const [showChat, setShowChat] = useState(false);

  const canReview = ['reviewer', 'admin'].includes(user?.role);
  const canApprove = canReview && incident?.status === 'PENDING_REVIEW';
  const canReopen = user?.role === 'admin' && incident?.status === 'RESOLVED';

  function handleCopy(field, text) {
    navigator.clipboard.writeText(text || '').catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 2000);
  }

  async function fetchData({ silent } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [incidentData, auditData] = await Promise.all([getIncident(id), getAuditLog(id)]);
      setIncident(incidentData);
      setAuditLog(auditData);
      setOverrideDraft({ type: incidentData.type || '', severity: incidentData.severity || '', department: incidentData.department || '' });
    } catch (e) {
      setError(e.message || 'Failed to load incident.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [id]);

  useEffect(() => {
    if (!incident?.customerEmail || priorCasesLoaded) return;
    let active = true;
    Promise.all([
      getIncidents({ reporterEmail: incident.customerEmail, limit: 6 }),
      getCustomerProfile(incident._id),
    ])
      .then(([data, profile]) => {
        if (!active) return;
        const others = (data?.incidents || []).filter((c) => c._id !== incident._id);
        setPriorCases(others.slice(0, 5));
        setCustomerProfile(profile);
        setPriorCasesLoaded(true);
      })
      .catch(() => { if (active) setPriorCasesLoaded(true); });
    return () => { active = false; };
  }, [incident?.customerEmail, incident?._id, priorCasesLoaded]);

  useEffect(() => {
    let active = true;
    async function fetchExplanation() {
      setExplanationLoading(true);
      try {
        const data = await getIncidentExplanation(id);
        if (active) setExplanation(data);
      } catch (e) {
        if (active) setExplanationError(e.message);
      } finally {
        if (active) setExplanationLoading(false);
      }
    }
    fetchExplanation();
    return () => { active = false; };
  }, [id]);

  const processingTime = useMemo(() => {
    const completedAt = auditLog.find((e) => e.action === 'resolution_suggestion')?.timestamp;
    if (!incident?.createdAt || !completedAt) return 'N/A';
    const mins = Math.round((new Date(completedAt) - new Date(incident.createdAt)) / 60000);
    return `${mins} min`;
  }, [auditLog, incident]);

  async function handleStatus(status) {
    setStatusBusy(true);
    setActionError('');
    try {
      await patchIncident(id, status === 'DRAFT' ? { status, rejectionReason } : { status });
      navigate('/board');
    } catch (e) {
      setActionError(e.message || 'Failed to update status.');
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleApproveRecovery() {
    setRecoveryBusy(true);
    setRecoveryActionError('');
    try {
      const result = await approveRecovery(incident._id);
      await fetchData();
      if (result?.toEmail === null) setRecoveryActionError('Approved. No customer email on file — RPA will handle delivery.');
    } catch (e) {
      setRecoveryActionError(e.message || 'Approve failed.');
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function handleRejectRecovery() {
    setRecoveryBusy(true);
    setRecoveryActionError('');
    try {
      await rejectRecovery(incident._id);
      await fetchData();
    } catch (e) {
      setRecoveryActionError(e.message || 'Reject failed.');
    } finally {
      setRecoveryBusy(false);
    }
  }

  const handleCallBrief = async () => {
    setCallBriefLoading(true);
    setShowCallBriefModal(true);
    try {
      const data = await generateCallBrief(incident._id);
      setCallBrief(data.brief);
    } catch { setCallBrief('Unable to generate call brief.'); }
    finally { setCallBriefLoading(false); }
  };

  const handleHandover = async () => {
    setHandoverLoading(true);
    setShowHandoverModal(true);
    try {
      const data = await generateHandoverNote(incident._id);
      setHandoverNote(data.note);
    } catch { setHandoverNote('Unable to generate handover note.'); }
    finally { setHandoverLoading(false); }
  };

  async function saveOverrides() {
    setSavingOverrides(true);
    setActionError('');
    try {
      await patchIncident(id, { fieldOverrides: overrideDraft });
      await fetchData();
    } catch (e) {
      setActionError(e.message || 'Failed to save.');
    } finally {
      setSavingOverrides(false);
    }
  }

  if (loading) {
    return (
      <Layout title="Incident Detail">
        <div className="space-y-4">
          <LoadingSkeleton height={16} width="200px" />
          <LoadingSkeleton height={64} width="100%" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_340px]">
            <LoadingSkeleton height={500} width="100%" />
            <LoadingSkeleton height={500} width="100%" />
          </div>
        </div>
      </Layout>
    );
  }
  if (!incident) {
    return (
      <Layout title="Incident Detail">
        {error ? <ErrorBar message={error} onRetry={fetchData} /> : <EmptyState title="Incident not found" subtitle="The selected incident could not be loaded." />}
      </Layout>
    );
  }

  const timeline = buildTimeline(incident);
  const primaryCTA = getPrimaryCTA(incident, canReview);
  const resolution = incident.agentResults?.resolution || incident.agentResults?.resolution_suggestion;
  const isHITL = incident.recoveryMessage?.status === 'hitl_required';
  const sevBadge = {
    Critical: 'bg-[rgb(212,5,17,0.12)] border-[rgb(212,5,17,0.5)] text-[#D40511]',
    High:     'bg-[rgb(245,158,11,0.1)] border-[rgb(245,158,11,0.4)] text-[#F59E0B]',
    Medium:   'bg-[rgb(59,130,246,0.1)] border-[rgb(59,130,246,0.4)] text-[#3B82F6]',
    Low:      'bg-[rgb(16,185,129,0.1)] border-[rgb(16,185,129,0.4)] text-[#10b981]',
  }[incident.severity || 'Low'];

  return (
    <Layout title="Incident Detail">
      {/* Chat panel overlay */}
      {showChat && (
        <AgentChatPanel
          incident={incident}
          onClose={() => setShowChat(false)}
          onMessageSent={() => fetchData({ silent: true })}
        />
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-bg)] backdrop-blur-xl">
        <div className="h-0.5 w-full bg-gradient-to-r from-[#FFCC00] via-[#FFCC00]/60 to-transparent" />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <Link to="/board" className="flex items-center gap-1.5 text-xs text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors shrink-0">
            <ArrowLeft size={12} />Board
          </Link>
          <span className="text-[var(--text-3)]">/</span>
          <span className="font-mono text-xs text-[var(--text-3)]">{reference(incident._id)}</span>
          <div className="mx-2 h-4 w-px bg-[var(--border)]" />
          <h1 className="flex-1 truncate text-[15px] font-semibold tracking-tight text-[var(--text-1)] min-w-0">
            {incident.title || incident.description || reference(incident._id)}
          </h1>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className={`rounded-[4px] border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${sevBadge}`}>{incident.severity || 'Low'}</span>
            <StatusBadge status={incident.status} />
            <SlaCountdown slaDeadline={incident.slaDeadline} status={incident.status} />
          </div>
          {/* Primary CTA — paired bg + textColor for WCAG-AA contrast on every variant. */}
          {primaryCTA && (
            <button
              type="button"
              disabled={statusBusy || recoveryBusy}
              onClick={async () => {
                if (primaryCTA.action === 'approve_recovery') await handleApproveRecovery();
                else if (primaryCTA.action === 'under_review') await handleStatus('UNDER_REVIEW');
                else if (primaryCTA.action === 'resolved') await handleStatus('RESOLVED');
                else if (primaryCTA.action === 'escalate') await handleStatus('UNDER_REVIEW');
              }}
              className="group flex shrink-0 items-center gap-2 rounded-[6px] px-4 py-2 text-sm font-semibold shadow-[0_1px_0_rgba(0,0,0,0.18)_inset,0_1px_2px_rgba(0,0,0,0.12)] transition-[filter,transform] hover:brightness-[1.05] active:brightness-[0.95] active:translate-y-px disabled:opacity-50 disabled:hover:brightness-100"
              style={{ backgroundColor: primaryCTA.color, color: primaryCTA.textColor }}
            >
              {(statusBusy || recoveryBusy) ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {primaryCTA.label}
            </button>
          )}
          {/* Message Customer */}
          <button
            type="button"
            onClick={() => setShowChat((v) => !v)}
            className={`flex shrink-0 items-center gap-2 rounded-[6px] border px-3 py-2 text-[12px] font-medium transition-all ${
              showChat
                ? 'border-[#D40511]/50 bg-[rgb(212,5,17,0.1)] text-[#D40511]'
                : 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text-1)]'
            }`}
          >
            <MessageSquare size={13} />
            {showChat ? 'Close Chat' : 'Message Customer'}
          </button>
          {/* AI Reasoning — with inline trust-risk dot when uncertainty signal present */}
          {(() => {
            const u = incident.agentResults?.uncertainty;
            const dotColor = u
              ? (u.level === 'high' ? '#ef4444' : u.level === 'medium' ? '#f59e0b' : '#10b981')
              : null;
            const trustTitle = u
              ? `Trust risk: ${(u.score * 100).toFixed(0)}% (${u.level}) — click for details`
              : 'AI reasoning details';
            return (
              <button
                type="button"
                onClick={() => setShowReasoningDrawer(true)}
                title={trustTitle}
                className="flex shrink-0 items-center gap-1.5 rounded-[6px] border border-[rgb(59,130,246,0.4)] bg-[rgb(59,130,246,0.08)] px-3 py-2 text-[11px] font-semibold text-[#3B82F6] hover:bg-[rgb(59,130,246,0.14)] transition-colors"
              >
                <Brain size={13} />
                <span>AI Reasoning</span>
                {dotColor && (
                  <span
                    className="h-1.5 w-1.5 rounded-full ring-2 ring-[var(--nexus-panel-bg)]"
                    style={{ backgroundColor: dotColor }}
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })()}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border)] px-5 py-2.5 text-[11px] text-[var(--text-3)]">
          <span className="uppercase tracking-wide text-[var(--text-2)]">{String(incident.type || 'unclassified').replace(/_/g, ' ')}</span>
          {incident.department && (
            <>
              <span className="text-[var(--text-3)]/50">·</span>
              <span>{incident.department}</span>
            </>
          )}
          <span className="text-[var(--text-3)]/50">·</span>
          <span>Processing {processingTime}</span>
          {incident.source && (
            <>
              <span className="text-[var(--text-3)]/50">·</span>
              <Badge variant="source" value={incident.source} />
            </>
          )}
          {incident.awbNumber && (
            <>
              <span className="text-[var(--text-3)]/50">·</span>
              <span className="font-mono text-[10.5px]">AWB {incident.awbNumber}</span>
            </>
          )}
        </div>
      </div>

      {error && <ErrorBar message={error} onRetry={fetchData} />}
      {actionError && <div className="mb-4"><ErrorBar message={actionError} /></div>}

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_340px]">

        {/* LEFT */}
        <section className="space-y-4 min-w-0">
          <div className="flex items-center gap-1 border-b border-[var(--border)] pb-0">
            {[['timeline', 'Resolution Timeline'], ['data', 'Raw Data']].map(([tab, label]) => (
              <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${activeTab === tab ? 'border-[#FFCC00] text-[var(--text-1)]' : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)]'}`}
              >{label}</button>
            ))}
          </div>

          {/* TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {/* Attachments — Vision-extracted evidence (parcel labels, damage photos) */}
              <IncidentAttachments incidentId={incident._id} />

              <div className="space-y-0">
              {timeline.map((event, idx) => {
                const Icon = event.icon;
                const isLast = idx === timeline.length - 1;
                const showConversation = event.isCurrent && isHITL && event.kind === 'decision';
                return (
                  <div key={idx} className="flex gap-4">
                    <div className="flex w-8 flex-col items-center shrink-0">
                      <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${KIND_DOT[event.kind]} ${event.isCurrent ? 'ring-2 ring-offset-2 ring-offset-[var(--surface)] ring-[#FFCC00]' : ''}`}>
                        <Icon size={14} className={KIND_ICON_COLOR[event.kind]} />
                        {event.isCurrent && <span className="absolute -inset-1 animate-ping rounded-full bg-[rgb(212,5,17,0.3)] motion-reduce:animate-none" />}
                      </div>
                      {!isLast && <div className={`mt-1 w-px flex-1 ${event.isCurrent ? 'bg-[rgb(212,5,17,0.3)]' : 'bg-[var(--border)]'}`} style={{ minHeight: '20px' }} />}
                    </div>
                    <div className={`${isLast ? 'pb-0' : 'pb-5'} min-w-0 flex-1`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[13px] leading-7 ${KIND_LABEL[event.kind]}`}>{event.label}</span>
                        {event.ts && <span className="text-[10px] text-[var(--text-3)]">{timeAgo(event.ts)}</span>}
                        {/* View Details button */}
                        {event.modal && (
                          <button
                            type="button"
                            onClick={() => setActiveModal(event.modal)}
                            className="flex items-center gap-1 rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--text-3)] hover:text-[var(--text-1)]"
                          >
                            {event.modalLabel}
                            <ChevronRight size={10} />
                          </button>
                        )}
                      </div>
                      {event.detail && <p className="mt-0.5 text-[12px] leading-5 text-[var(--text-3)]">{event.detail}</p>}
                      {showConversation && (
                        <ConversationPanel
                          incident={incident}
                          canReview={canReview}
                          recoveryBusy={recoveryBusy}
                          onApprove={handleApproveRecovery}
                          onReject={handleRejectRecovery}
                          recoveryActionError={recoveryActionError}
                        />
                      )}
                      {event.kind === 'success' && event.label.includes('Recovery') && (
                        <div className="mt-2 flex items-center gap-2 rounded-[4px] border border-[#10b981]/25 bg-[rgb(16,185,129,0.07)] px-3 py-2 text-xs text-[#10b981]">
                          <CheckCircle2 size={12} />Customer Contacted ✓ · Email queued via RPA
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>

              {['RESOLVED', 'CLOSED'].includes(incident.status) && (
                <ResolutionSummaryPanel incident={incident} />
              )}

              <div className="pt-2">
                <DistressPredictor incident={incident} />
              </div>
              <OutcomeValidationCard incidentId={incident._id} status={incident.status} />
              <CaseMemoryPanel incidentId={id} />
            </div>
          )}

          {/* DATA TAB */}
          {activeTab === 'data' && (
            <div className="space-y-3">
              <div className="flex gap-1">
                {[['raw', 'Raw Input'], ['agents', 'Agent Results'], ['audit', 'Audit Trail']].map(([s, label]) => (
                  <button key={s} type="button" onClick={() => setDataSection(s)}
                    className={`rounded-[4px] px-3 py-1.5 text-[11px] font-medium transition-colors ${dataSection === s ? 'bg-[var(--surface-3)] text-[var(--text-1)]' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'}`}
                  >{label}</button>
                ))}
              </div>
              {dataSection === 'raw' && (
                <div className="overflow-hidden rounded-[6px] border border-[var(--border)]">
                  <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-3)] px-4 py-2">
                    <span className="text-[11px] font-medium text-[var(--text-2)]">Raw Input</span>
                    <button type="button" onClick={() => handleCopy('raw', incident.rawInput || '')} className="flex items-center gap-1 text-[10px] text-[var(--text-3)] hover:text-[var(--text-1)]">
                      {copiedField === 'raw' ? <><CheckCircle2 size={11} className="text-[var(--accent-green)]" /> Copied</> : <><Copy size={11} /> Copy</>}
                    </button>
                  </div>
                  <div className="max-h-[420px] overflow-auto p-4 font-mono text-xs leading-6 text-[var(--text-2)]">{incident.rawInput || 'No raw input stored.'}</div>
                </div>
              )}
              {dataSection === 'agents' && (
                <div className="space-y-3">
                  {Object.entries(incident.agentResults || {}).map(([agentId, result]) => (
                    <div key={agentId} className="overflow-hidden rounded-[6px] border border-[var(--border)]">
                      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-3)] px-4 py-2">
                        <span className="text-[11px] font-semibold capitalize text-[var(--text-1)]">{agentId}</span>
                        <span className="font-mono text-[10px] text-[var(--text-3)]">{(Number(result?.confidence) || 0).toFixed(2)}</span>
                      </div>
                      <div className="p-4 space-y-3">
                        <p className="text-sm text-[var(--text-2)]">{result?.reasoning || result?.decision || ({
                          request: 'Captured sender, subject, timestamps and headers — no LLM call required at this stage.',
                          mlService: 'LightGBM classifier returned class probabilities — see Top Types panel.',
                          uncertainty: 'Uncertainty score computed from classifier disagreement and severity escalation flags.',
                          shap: 'SHAP feature importance computed from LightGBM — see waterfall chart above.',
                          recovery: 'Recovery not triggered for this incident — risk threshold not met.',
                        }[agentId] || 'Numeric stage — no text reasoning produced.')}</p>
                        {result?.fields && (
                          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                            <tbody className="divide-y divide-[var(--border)]">
                              {Object.entries(result.fields).map(([field, data]) => (
                                <tr key={field}>
                                  <td className="py-2 pr-4 text-[10px] uppercase tracking-wide text-[var(--text-3)]">{field}</td>
                                  <td className="py-2 text-[var(--text-1)]">{data?.value || 'N/A'}</td>
                                  <td className="py-2 text-right font-mono text-[10px] text-[var(--text-3)]">{Number(data?.confidence || 0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  ))}
                  {Object.keys(incident.agentResults || {}).length === 0 && <EmptyState title="No agent results" subtitle="Agents have not returned results yet." />}
                </div>
              )}
              {dataSection === 'audit' && <AuditTimeline auditLog={auditLog} />}
            </div>
          )}
        </section>

        {/* RIGHT SIDEBAR */}
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">

          {/* Tools — secondary actions only. Primary CTA lives in the hero. */}
          {(() => {
            const showReject   = canApprove;
            const showReopen   = canReopen;
            const showCallBrief = ['High', 'Critical'].includes(incident?.severity);
            const showHandover = !['RESOLVED', 'CLOSED'].includes(incident?.status);
            const hasAny = showReject || showReopen || showCallBrief || showHandover || showRejectBox;
            if (!hasAny) return null;
            return (
              <div className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Tools</p>
                  <StatusBadge status={incident.status} />
                </div>
                <div className="space-y-2 p-4">
                  {/* Tool grid (2-col on desktop) for Call Brief + Handover Note */}
                  {(showCallBrief || showHandover) && (
                    <div className={`grid gap-2 ${showCallBrief && showHandover ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {showCallBrief && (
                        <button type="button" onClick={handleCallBrief}
                          className="flex items-center justify-center gap-1.5 rounded-[6px] border border-[rgb(245,158,11,0.25)] bg-[rgb(245,158,11,0.08)] px-3 py-2 text-[12px] font-medium text-[#F59E0B] hover:bg-[rgb(245,158,11,0.14)] transition-colors">
                          <Phone size={12} aria-hidden="true" />Call Brief
                        </button>
                      )}
                      {showHandover && (
                        <button type="button" onClick={handleHandover}
                          className="flex items-center justify-center gap-1.5 rounded-[6px] border border-[rgb(59,130,246,0.25)] bg-[rgb(59,130,246,0.08)] px-3 py-2 text-[12px] font-medium text-[#3B82F6] hover:bg-[rgb(59,130,246,0.14)] transition-colors">
                          <FileCode2 size={12} aria-hidden="true" />Handover
                        </button>
                      )}
                    </div>
                  )}
                  {/* Reopen — admin only, when resolved */}
                  {showReopen && (
                    <button type="button" onClick={() => handleStatus('PENDING_REVIEW')} disabled={statusBusy}
                      className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-[12px] font-medium text-[var(--text-2)] hover:text-[var(--text-1)] disabled:opacity-50 transition-colors">
                      <FileCode2 size={12} aria-hidden="true" />Reopen Incident
                    </button>
                  )}
                  {/* Reject — only when reviewer can approve. Subtle, doesn't compete with hero CTA. */}
                  {showReject && (
                    <button type="button" onClick={() => setShowRejectBox((v) => !v)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-[6px] px-3 py-2 text-[11px] font-medium text-[var(--text-3)] hover:text-[#D40511] hover:bg-[rgb(212,5,17,0.06)] transition-colors">
                      <XCircle size={11} aria-hidden="true" />
                      {showRejectBox ? 'Cancel reject' : 'Reject this draft'}
                    </button>
                  )}
                  {showRejectBox && (
                    <div className="space-y-2 border-t border-[var(--border)] pt-3">
                      <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3}
                        placeholder="Reason for rejection…"
                        className="w-full rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] p-2.5 text-[12px] text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[#D40511]" />
                      <button type="button" onClick={() => handleStatus('DRAFT')} disabled={statusBusy}
                        className="flex w-full items-center justify-center gap-1.5 rounded-[6px] bg-[#D40511] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#b30410] disabled:opacity-50">
                        {statusBusy ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Confirm rejection
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Auto-Embed Badge */}
          {['RESOLVED', 'CLOSED'].includes(incident.status) && (
            <div className="flex items-center gap-2.5 rounded-[8px] border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                <Zap size={13} className="text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-emerald-400">Embedded into Learning Corpus</p>
                <p className="text-[10px] text-[var(--text-3)]">This resolution was auto-embedded for future RAG retrieval and model retraining</p>
              </div>
            </div>
          )}

          {/* AI Classification */}
          <div className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
              <Brain size={13} className="text-[#3B82F6]" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">AI Classification</p>
              <span className="ml-auto rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2 py-0.5 text-[9px] font-medium text-[var(--text-3)]">NEXUS AI</span>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <MetaRow label="Type" value={String(incident.type || 'unclassified').replace(/_/g, ' ')} />
                <MetaRow label="Severity" value={incident.severity || 'Low'} />
                <MetaRow label="Department" value={incident.department || 'Unassigned'} />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Confidence</p>
                  <div className="mt-1.5"><ConfidenceBar value={incident.confidence || 0} showLabel /></div>
                </div>
              </div>
              {resolution?.steps?.length > 0 && (
                <SopStepsList steps={resolution.steps} />
              )}
            </div>
          </div>

          {/* SLA compact */}
          {incident.sla?.deadlineAt && (() => {
            const sla = incident.sla;
            const pct = sla.breachProbability != null ? Math.round(sla.breachProbability * 100) : null;
            const isBreached = incident.status === 'BREACHED' || Boolean(sla.breachedAt);
            const barColor = isBreached || pct >= 80 ? 'bg-[#D40511]' : pct >= 60 ? 'bg-orange-500' : pct >= 30 ? 'bg-[#F59E0B]' : 'bg-[#10b981]';
            const textColor = isBreached || pct >= 80 ? 'text-[#D40511]' : pct >= 60 ? 'text-orange-400' : pct >= 30 ? 'text-[#F59E0B]' : 'text-[#10b981]';
            return (
              <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">SLA Risk</p>
                    <div className={`mt-1 text-2xl font-bold tabular-nums ${textColor} ${isBreached || pct >= 80 ? 'animate-pulse motion-reduce:animate-none' : ''}`}>{pct != null ? `${pct}%` : '–'}</div>
                    <p className="text-[11px] text-[var(--text-3)]">{isBreached ? 'SLA breached' : sla.hoursRemaining != null ? `${sla.hoursRemaining.toFixed(1)}h remaining` : 'calculating…'}</p>
                  </div>
                  <SlaCountdown slaDeadline={incident.slaDeadline} status={incident.status} />
                </div>
                {pct != null && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Customer history — promoted above secondary panels (most useful context) */}
          {incident.customerEmail && priorCasesLoaded && (
            <div className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <User size={13} className="text-[#FFCC00]" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Customer History</p>
                  <p className="text-[10px] text-[var(--text-3)] truncate max-w-[220px]">{incident.customerEmail}</p>
                </div>
              </div>
              <div className="p-3">
                {priorCases.length === 0 ? (
                  <p className="text-[12px] text-[var(--text-3)]">First contact — no prior cases.</p>
                ) : (
                  <div className="space-y-1.5">
                    {priorCases.map((c) => (
                      <Link key={c._id} to={`/incidents/${c._id}`}
                        className="flex items-start justify-between gap-2 rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-[11px] transition-colors hover:bg-[var(--surface)]">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--text-1)]">{String(c.type || 'unclassified').replace(/_/g, ' ')}</p>
                          <p className="text-[10px] text-[var(--text-3)]">{c.status}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${c.severity === 'Critical' ? 'bg-[#D40511] text-white' : c.severity === 'High' ? 'bg-[#F59E0B] text-black' : 'bg-[var(--surface-3)] text-[var(--text-2)]'}`}>{c.severity || 'Low'}</span>
                      </Link>
                    ))}
                    <p className="pt-1 text-center text-[10px] text-[var(--text-3)]">
                      {incident.customerHistoryCount > priorCases.length ? `+${incident.customerHistoryCount - priorCases.length} more in history` : `${priorCases.length} prior case${priorCases.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── More info — collapsible. Houses Override Classification + Metadata.
              Keeps the sidebar focused on the high-frequency surfaces above and
              hides advanced/rarely-used controls behind a toggle. ──────────── */}
          <div className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]">
            <button
              type="button"
              onClick={() => setShowMoreInfo((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-3)]"
              aria-expanded={showMoreInfo}
            >
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)]">More Info</p>
                <span className="text-[10px] text-[var(--text-3)]/70">
                  {canReview ? 'Override · Metadata' : 'Metadata'}
                </span>
              </div>
              <ChevronDown
                size={14}
                className={`shrink-0 text-[var(--text-3)] transition-transform ${showMoreInfo ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {showMoreInfo && (
              <div className="space-y-4 border-t border-[var(--border)] p-4">
                {/* Override Classification (reviewer/admin only) */}
                {canReview && (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Pencil size={11} className="text-[var(--text-3)]" />
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Override Classification</p>
                    </div>
                    <div className="space-y-2">
                      {[['type', TYPE_OPTIONS], ['severity', SEVERITY_OPTIONS], ['department', DEPARTMENT_OPTIONS]].map(([field, options]) => (
                        <select key={field} value={overrideDraft[field]} onChange={(e) => setOverrideDraft((c) => ({ ...c, [field]: e.target.value }))}
                          className="h-9 w-full rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] px-3 text-[12px] text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[#FFCC00] capitalize">
                          {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                        </select>
                      ))}
                      <button type="button" onClick={saveOverrides} disabled={savingOverrides}
                        className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-[12px] font-medium text-[var(--text-1)] hover:bg-[var(--surface)] disabled:opacity-50 transition-colors">
                        {savingOverrides ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
                        Save Overrides
                      </button>
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className={canReview ? 'border-t border-[var(--border)] pt-4' : ''}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Metadata</p>
                  <div className="grid grid-cols-2 gap-3">
                    <MetaRow label="Incident ID" value={reference(incident._id)} mono />
                    <MetaRow label="Source" value={incident.source || 'manual'} />
                    <MetaRow label="Created" value={formatDateTime(incident.createdAt)} />
                    <MetaRow label="Updated" value={formatDateTime(incident.updatedAt)} />
                    {incident.createdBy?.name && <MetaRow label="Created By" value={incident.createdBy.name} />}
                    <MetaRow label="Processing" value={processingTime} />
                    {incident.awbNumber && <MetaRow label="AWB" value={incident.awbNumber} mono />}
                  </div>
                  {(incident.mlFallback || incident.holdForReview) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {incident.mlFallback && (
                        <span className="rounded-[2px] border border-[rgb(59,130,246,0.3)] bg-[rgb(59,130,246,0.1)] px-2 py-0.5 text-[10px] font-medium uppercase text-[#3B82F6]">ML Fallback</span>
                      )}
                      {incident.holdForReview && (
                        <span className="rounded-[2px] border border-[rgb(245,158,11,0.3)] bg-[rgb(245,158,11,0.1)] px-2 py-0.5 text-[10px] font-medium uppercase text-[#F59E0B]">Hold For Review</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {activeModal === 'email' && (
        <EmailModal incident={incident} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'dna' && (
        <CustomerDNAModal incident={incident} priorCases={priorCases} customerProfile={customerProfile} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'ai' && (
        <AIClassificationModal
          incident={incident}
          explanation={explanation}
          explanationLoading={explanationLoading}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* ── Call Brief Modal ──────────────────────────────────────────────── */}
      {showCallBriefModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nexus-modal-backdrop)] p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl max-h-[80vh] flex-col rounded-[12px] border border-[var(--border)] bg-[var(--nexus-panel-solid)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
              <div><h2 className="font-bold text-[var(--text-1)]">Call Brief</h2><p className="text-sm text-[var(--text-3)]">{incident?.title || reference(incident?._id)}</p></div>
              <button type="button" onClick={() => { setShowCallBriefModal(false); setCallBrief(null); }} className="text-[var(--text-3)] hover:text-[var(--text-1)] text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {callBriefLoading ? (
                <div className="flex items-center gap-3 text-[var(--text-3)]"><div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />Generating call brief…</div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-[var(--text-2)]">{callBrief}</pre>
              )}
            </div>
            {!callBriefLoading && callBrief && (
              <div className="flex gap-2 border-t border-[var(--border)] p-5">
                <button type="button" onClick={() => handleCopy('callBrief', callBrief)} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)]">{copiedField === 'callBrief' ? '✓ Copied' : 'Copy'}</button>
                <button type="button" onClick={() => { setShowCallBriefModal(false); setCallBrief(null); }} className="ml-auto rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)]">Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Handover Note Modal ───────────────────────────────────────────── */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nexus-modal-backdrop)] p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-2xl max-h-[80vh] flex-col rounded-[12px] border border-[var(--border)] bg-[var(--nexus-panel-solid)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
              <div><h2 className="font-bold text-[var(--text-1)]">Shift Handover Note</h2><p className="text-sm text-[var(--text-3)]">{incident?.title || reference(incident?._id)}</p></div>
              <button type="button" onClick={() => { setShowHandoverModal(false); setHandoverNote(null); }} className="text-[var(--text-3)] hover:text-[var(--text-1)] text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {handoverLoading ? (
                <div className="flex items-center gap-3 text-[var(--text-3)]"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />Generating handover note…</div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-[var(--text-2)]">{handoverNote}</pre>
              )}
            </div>
            {!handoverLoading && handoverNote && (
              <div className="flex gap-2 border-t border-[var(--border)] p-5">
                <button type="button" onClick={() => handleCopy('handover', handoverNote)} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)]">{copiedField === 'handover' ? '✓ Copied' : 'Copy'}</button>
                <button type="button" onClick={() => { const s = encodeURIComponent(`NEXUS Handover — ${incident?._id}`); const b = encodeURIComponent(handoverNote); window.location.href = `mailto:?subject=${s}&body=${b}`; }} className="rounded-[6px] bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Send via Email</button>
                <button type="button" onClick={() => { setShowHandoverModal(false); setHandoverNote(null); }} className="ml-auto rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-4 py-2 text-sm text-[var(--text-2)] hover:text-[var(--text-1)]">Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI Reasoning Drawer ───────────────────────────────────────────── */}
      <AIReasoningDrawer
        isOpen={showReasoningDrawer}
        onClose={() => setShowReasoningDrawer(false)}
        incident={incident}
        explanation={explanation}
        explanationLoading={explanationLoading}
        explanationError={explanationError}
      />
    </Layout>
  );
}
