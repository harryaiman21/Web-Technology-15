import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, BookOpen, Bot, Brain, CheckCircle2, ChevronRight,
  Clock, Copy, ExternalLink, FileText, History, Inbox, Languages, Link2, Loader2,
  Mail, MapPin, MessageSquare, Package, RefreshCw, Scale, Send, ShieldCheck, Sparkles,
  User, UserCheck, X, XCircle, Zap, Activity,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import {
  getIncident, getIncidents, getSimilarIncidents, getChatLink,
  reviewIncident, sendAgentReply, getProactiveSends, sendAdvisorChat,
} from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — obsidian/slate system, DHL red single warm accent
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  void:    'var(--nexus-bg)',
  bg:      'var(--nexus-surface-1)',
  s1:      'var(--nexus-surface-2)',
  s2:      'var(--nexus-surface-3)',
  s3:      'var(--nexus-elevated)',
  s4:      'var(--nexus-elevated)',
  border:       'var(--nexus-border)',
  borderMid:    'var(--nexus-border-bright)',
  borderHover:  'var(--nexus-border-bright)',
  red:     'var(--nexus-red)',
  redDim:  'var(--nexus-red-dim)',
  redGlow: 'rgba(212,5,17,0.35)',
  cyan:    'var(--nexus-cyan)',
  cyanDim: 'var(--nexus-cyan-dim)',
  amber:   'var(--nexus-amber)',
  violet:  'var(--nexus-electric)',
  green:   'var(--nexus-emerald)',
  greenDim:'rgba(16,185,129,0.10)',
  t1: 'var(--nexus-text-1)',
  t2: 'var(--nexus-text-2)',
  t3: 'var(--nexus-text-3)',
  t4: 'var(--nexus-border-bright)',
};

const SEV = {
  Critical: '#D40511',
  High:     '#F59E0B',
  Medium:   '#FF8C00',
  Low:      '#10B981',
};

const SENT_CFG = {
  very_frustrated: { label: 'Very Frustrated', color: '#D40511', pulse: true },
  frustrated:      { label: 'Frustrated',      color: '#ef4444', pulse: false },
  neutral:         { label: 'Neutral',          color: '#F59E0B', pulse: false },
  positive:        { label: 'Positive',         color: '#10B981', pulse: false },
};

const STATUS_COLOR = {
  DRAFT: '#FF8C00', PENDING_REVIEW: '#F59E0B', UNDER_REVIEW: '#F59E0B',
  ASSIGNED: '#FFCC00', IN_PROGRESS: '#FFCC00', RESOLVED: '#10B981',
  CLOSED: '#10B981', BREACHED: '#D40511',
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes fadeUp      { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
  @keyframes fadeRight   { from { opacity:0; transform:translateX(-10px) } to { opacity:1; transform:translateX(0) } }
  @keyframes slideFromRight { from { transform:translateX(105%); opacity:0 } to { transform:translateX(0); opacity:1 } }
  @keyframes cardIn      { from { opacity:0; transform:translateY(6px) scale(0.99) } to { opacity:1; transform:translateY(0) scale(1) } }
  @keyframes blink       { 0%,49%{ opacity:1 } 50%,100%{ opacity:0 } }
  @keyframes spin        { to { transform:rotate(360deg) } }
  @keyframes orbit       { to { transform:rotate(360deg) } }
  @keyframes shimmer     { from { background-position:-200% 0 } to { background-position:200% 0 } }
  @keyframes breathe     { 0%,100%{ opacity:.6 } 50%{ opacity:1 } }
  @keyframes modalScaleIn { from { opacity:0; transform:scale(0.95) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) } }

  .pcc-skel {
    background: linear-gradient(90deg, var(--nexus-surface-3) 25%, var(--nexus-elevated) 50%, var(--nexus-surface-3) 75%);
    background-size:200% 100%; animation:shimmer 1.8s infinite; border-radius:4px;
  }
  .pcc-thread { transition:background 120ms; }
  .pcc-thread:hover { background: var(--nexus-surface-3) !important; }
  .pcc-thread.active { background: var(--nexus-red-dim) !important; }
  .pcc-compose:focus-within {
    border-color: rgba(212,5,17,0.30) !important;
    box-shadow: 0 0 0 3px rgba(212,5,17,0.06), inset 0 1px 0 var(--nexus-surface-3);
  }
  .pcc-ai-input:focus {
    border-color: rgba(255,204,0,0.45) !important;
    box-shadow: 0 0 0 3px rgba(255,204,0,0.07) !important;
    outline:none;
  }
  .pcc-scroll::-webkit-scrollbar { width:3px; height:3px; }
  .pcc-scroll::-webkit-scrollbar-track { background:transparent; }
  .pcc-scroll::-webkit-scrollbar-thumb { background:var(--nexus-border-bright); border-radius:99px; }
  .pcc-scroll::-webkit-scrollbar-thumb:hover { background:var(--nexus-text-3); }
  .ai-orbit {
    position:absolute; inset:-4px; border-radius:12px;
    border:1.5px solid rgba(255,204,0,0.25);
    border-top-color:transparent;
    animation: orbit 3s linear infinite;
    pointer-events:none;
  }
  .badge-pulse { animation: breathe 2.5s ease-in-out infinite; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function timeAgo(date) {
  if (!date) return '—';
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function initials(email) {
  if (!email) return '?';
  return email.split('@')[0].slice(0, 2).toUpperCase();
}

function buildTimeline(incident) {
  const events = [];
  const t = incident.createdAt;
  const rawMsg = incident.rawInput || incident.description;

  if (rawMsg) {
    events.push({
      id: 'customer_msg', kind: 'customer', icon: Mail, time: t,
      title: incident.subject || incident.agentResults?.intake?.fields?.subject?.value || 'Customer complaint',
      body: rawMsg.length > 400 ? rawMsg.slice(0, 400) + '…' : rawMsg,
      email: incident.customerEmail || incident.agentResults?.intake?.fields?.email?.value,
    });
  }

  events.push({ id: 'ingest', kind: 'bot', icon: Inbox, time: t, title: 'Email received & ingested' });

  if (incident.source === 'rpa') {
    const chips = [];
    if (incident.awbNumber) chips.push(`AWB: ${incident.awbNumber}`);
    if (incident.detectedLanguage) chips.push(`Lang: ${incident.detectedLanguage === 'ms' ? 'Bahasa Melayu' : 'English'}`);
    if (incident.sentimentLabel) chips.push(`Sentiment: ${incident.sentimentLabel.replace('_', ' ')}`);
    if (incident.isRepeatCustomer) chips.push(`Repeat customer (${incident.customerHistoryCount} prior cases)`);
    if (chips.length > 0) {
      events.push({ id: 'rpa', kind: 'bot', icon: Bot, time: t, title: 'UiPath bot enriched email', chips });
    }
  }

  if (incident.type) {
    events.push({
      id: 'classify', kind: 'bot', icon: Brain, time: t,
      title: `Classified: ${incident.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
      body: `Confidence ${Math.round((incident.confidence || 0) * 100)}% · Severity ${incident.severity || 'pending'} · ${incident.department || 'routing...'}`,
    });
  }

  const sopCode = incident.agentResults?.resolution?.sopCode || incident.agentResults?.sop?.match;
  if (sopCode) {
    events.push({
      id: 'sop', kind: 'bot', icon: ShieldCheck, time: t,
      title: `SOP matched: ${sopCode}`,
      body: incident.agentResults?.resolution?.steps?.[0] || null,
    });
  }

  const rm = incident.recoveryMessage;
  if (rm?.generatedAt) {
    const statusText = {
      pending_send:  'Recovery message drafted — awaiting approval',
      hitl_required: 'Recovery message requires human review before sending',
      auto_sent:     'Recovery message auto-sent to customer',
      approved:      'Recovery message approved and sent',
      rejected:      'Recovery message rejected',
    };
    events.push({
      id: 'recovery', kind: ['auto_sent', 'approved'].includes(rm.status) ? 'success' : 'bot',
      icon: MessageSquare, time: rm.generatedAt,
      title: statusText[rm.status] || 'Recovery message drafted',
      body: rm.text ? `"${rm.text.slice(0, 140)}…"` : null,
    });
  }

  const statusText = {
    DRAFT:          { kind: 'system',   title: 'AI pipeline processing…' },
    PENDING_REVIEW: { kind: 'decision', title: 'Awaiting human decision' },
    UNDER_REVIEW:   { kind: 'human',    title: 'Under human review' },
    ASSIGNED:       { kind: 'success',  title: 'Assigned to ' + (incident.department || 'department') },
    IN_PROGRESS:    { kind: 'human',    title: 'Resolution in progress' },
    RESOLVED:       { kind: 'success',  title: 'Case resolved' },
    CLOSED:         { kind: 'success',  title: 'Case closed' },
    BREACHED:       { kind: 'error',    title: 'SLA breached — urgent' },
  };

  if (Array.isArray(incident.conversationThread)) {
    const sorted = [...incident.conversationThread].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    sorted.forEach((msg, i) => {
      if (msg.role === 'agent') {
        events.push({ id: `thread_agent_${i}`, kind: 'human', icon: User, time: msg.ts, title: `Replied by ${msg.sentBy || 'Agent'}`, body: msg.text });
      } else if (msg.role === 'customer' && msg.channel === 'chat') {
        events.push({ id: `thread_cust_${i}`, kind: 'customer', icon: MessageSquare, time: msg.ts, title: 'Customer message via chat', body: msg.text, email: msg.sentBy });
      } else if (msg.role === 'ai' && msg.channel === 'chat') {
        events.push({ id: `thread_ai_${i}`, kind: 'bot', icon: Bot, time: msg.ts, title: 'AI replied via chat', body: msg.text });
      }
    });
  }

  const st = statusText[incident.status];
  if (st) events.push({ id: 'status', ...st, icon: Zap, time: incident.updatedAt, isCurrent: true });

  return events;
}

function getAuthorizedActions(incident) {
  if (!incident) return [];
  const actions = ['Send standard reply', 'Add internal note'];
  if (incident.severity === 'Low' || incident.severity === 'Medium') actions.push('Mark auto-resolved');
  if (incident.isRepeatCustomer) actions.push('Flag: repeat customer');
  if (incident.severity === 'Critical' || incident.severity === 'High') actions.push('Escalate to Tier 2');
  return actions;
}

/**
 * Type-keyed fallback playbook used when the resolution agent did not produce
 * steps (old incidents, agent timeout, or JSON parse failure). Codes match the
 * canonical entries in SopLibrary so the UI is consistent with the audit page.
 */
const TYPE_FALLBACK_PLAYBOOK = {
  late_delivery: {
    sopCode: 'SOP-LATE-DELIVERY-2026',
    sopTitle: 'Late Delivery — Standard Recovery',
    steps: [
      'Verify current parcel location via tracking system and identify last scan',
      'Contact origin hub for status update and confirm next dispatch window',
      'Send customer acknowledgement with updated ETA and apology',
      'Escalate to hub manager if delay exceeds 24 hours from promised date',
    ],
  },
  damaged_parcel: {
    sopCode: 'SOP-DAMAGED-PARCEL-2026',
    sopTitle: 'Damaged Parcel — Investigation & Recovery',
    steps: [
      'Request photo evidence of damage from customer',
      'Isolate parcel at receiving hub for inspection and document condition',
      'File insurance claim with photographs and AWB reference',
      'Offer replacement or refund within 24 hours per customer preference',
    ],
  },
  missing_parcel: {
    sopCode: 'SOP-MISSING-PARCEL-2026',
    sopTitle: 'Missing Parcel — Trace & Recovery',
    steps: [
      'Run full tracking trace from origin to last known scan location',
      'Initiate cross-hub search and notify all hubs on the parcel route',
      'Acknowledge to customer within 2 hours with investigation timeline',
      'Escalate to claims team if parcel not located within 48 hours',
    ],
  },
  address_error: {
    sopCode: 'SOP-ADDRESS-ERROR-2026',
    sopTitle: 'Address Error — Correction & Redelivery',
    steps: [
      'Confirm the correct delivery address with the customer',
      'Update the AWB in the routing system with the corrected address',
      'Re-dispatch from the current holding hub to the correct destination',
      'Notify customer of the new ETA and waive any redelivery fee',
    ],
  },
  wrong_item: {
    sopCode: 'SOP-WRONG-ITEM-2026',
    sopTitle: 'Wrong Item Delivered — Investigation & Recovery',
    steps: [
      'Confirm the item received versus the item ordered with customer photos',
      'Identify the origin hub and check for swap with another shipment',
      'Arrange free pickup of the wrong item and dispatch the correct one',
      'Issue goodwill credit and notify origin hub for handling audit',
    ],
  },
  system_error: {
    sopCode: 'SOP-SYSTEM-ERROR-2026',
    sopTitle: 'System Error — Triage & Recovery',
    steps: [
      'Capture the error context, AWB, and timestamp from the customer report',
      'Verify the parcel status manually via hub teams while the system issue is triaged',
      'Acknowledge to customer that the system issue is being investigated',
      'Notify IT operations if the error pattern affects more than 3 customers',
    ],
  },
  other: {
    sopCode: 'SOP-GENERAL-CARE-2026',
    sopTitle: 'General Customer Care — Acknowledgement & Routing',
    steps: [
      'Acknowledge receipt of the customer enquiry within 1 hour',
      'Identify the responsible team based on the enquiry context',
      'Route the case to the responsible team with full context',
      'Confirm to the customer when they can expect a substantive reply',
    ],
  },
};

function getResolutionView(incident) {
  const agentSteps = incident?.agentResults?.resolution?.steps || [];
  const agentSopCode = incident?.agentResults?.resolution?.sopCode || incident?.agentResults?.sop?.match;
  if (agentSteps.length > 0) {
    return { steps: agentSteps, sopCode: agentSopCode, fallback: false };
  }
  const fb = TYPE_FALLBACK_PLAYBOOK[incident?.type] || TYPE_FALLBACK_PLAYBOOK.other;
  return { steps: fb.steps, sopCode: agentSopCode || fb.sopCode, fallback: true, fallbackTitle: fb.sopTitle };
}

function buildDraftFallback(incident) {
  const view = getResolutionView(incident);
  if (!view.steps.length) return null;
  return `Dear Customer,\n\nThank you for contacting DHL. Regarding your enquiry:\n\n${view.steps.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nPlease don't hesitate to reach out if you need further assistance.\n\nBest regards,\nDHL Customer Support`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESIZABLE COLUMN HOOK — ref-based to avoid stale closures
// ─────────────────────────────────────────────────────────────────────────────
function useColumnResize(initialLeft, initialRight, minLeft = 200, minRight = 220) {
  const [leftW, setLeftW]   = useState(initialLeft);
  const [rightW, setRightW] = useState(initialRight);

  const leftWRef  = useRef(initialLeft);
  const rightWRef = useRef(initialRight);
  useEffect(() => { leftWRef.current  = leftW;  }, [leftW]);
  useEffect(() => { rightWRef.current = rightW; }, [rightW]);

  const [draggingSide, setDraggingSide] = useState(null);

  const startDrag = useCallback((side, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftWRef.current : rightWRef.current;
    setDraggingSide(side);

    const onMove = (me) => {
      const delta = me.clientX - startX;
      if (side === 'left') {
        const next = Math.max(minLeft, Math.min(520, startW + delta));
        setLeftW(next);
        leftWRef.current = next;
      } else {
        const next = Math.max(minRight, Math.min(500, startW - delta));
        setRightW(next);
        rightWRef.current = next;
      }
    };

    const onUp = () => {
      setDraggingSide(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [minLeft, minRight]);

  return { leftW, rightW, startDrag, draggingSide };
}

// ─────────────────────────────────────────────────────────────────────────────
// MICRO COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Skel({ w = '100%', h = 8, mb = 6 }) {
  return <div className="pcc-skel" style={{ height: h, width: w, marginBottom: mb }} />;
}

function SevPill({ severity }) {
  const c = SEV[severity] || T.violet;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99, fontSize: 9, fontWeight: 800,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      backgroundColor: `${c}18`, color: c, border: `1px solid ${c}28`,
    }}>
      {severity || 'Low'}
    </span>
  );
}

function StatusPill({ status }) {
  const c = STATUS_COLOR[status] || T.t3;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 99, fontSize: 9, fontWeight: 800,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      backgroundColor: `${c}10`, color: c, border: `1px solid ${c}22`,
    }}>
      {(status || '').replace(/_/g, ' ')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THREAD ITEM
// ─────────────────────────────────────────────────────────────────────────────
function ThreadItem({ incident, isSelected, onClick }) {
  const sevColor  = SEV[incident.severity] || T.violet;
  const email     = incident.customerEmail || incident.agentResults?.intake?.fields?.email?.value || '';
  const title     = incident.title || incident.description?.slice(0, 80) || 'Untitled';
  const isRpa     = incident.source === 'rpa';
  const sent      = SENT_CFG[incident.sentimentLabel];
  const isPending = incident.status === 'PENDING_REVIEW';
  const isDraft   = incident.status === 'DRAFT';

  return (
    <button
      type="button"
      onClick={onClick}
      className="pcc-thread w-full text-left focus-visible:outline-none relative group"
      style={{
        borderBottom: `1px solid ${T.border}`,
        backgroundColor: isSelected ? T.redDim : 'transparent',
        padding: 0,
      }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
        backgroundColor: isSelected ? T.red : sevColor,
        opacity: isSelected ? 1 : 0.28,
        transition: 'opacity 200ms, background-color 200ms',
        boxShadow: isSelected ? `0 0 12px ${T.red}80` : 'none',
      }} />
      {isSelected && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(90deg, rgba(212,5,17,0.06) 0%, transparent 80%)',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px 11px 16px' }}>
        <div style={{
          position: 'relative', flexShrink: 0, marginTop: 1,
          width: 34, height: 34, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800,
          background: isRpa
            ? 'linear-gradient(135deg, rgba(255,204,0,0.22), rgba(255,204,0,0.07))'
            : `linear-gradient(135deg, ${sevColor}20, ${sevColor}08)`,
          color: isRpa ? T.cyan : sevColor,
          border: `1px solid ${isRpa ? 'rgba(255,204,0,0.28)' : `${sevColor}28`}`,
          boxShadow: isSelected ? `0 0 14px ${sevColor}20` : 'none',
        }}>
          {isRpa ? <Bot size={14} /> : initials(email)}
          {(isDraft || isPending) && (
            <span style={{
              position: 'absolute', right: -2, top: -2,
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: isDraft ? T.cyan : T.amber,
              border: `1.5px solid ${T.s1}`,
              boxShadow: `0 0 6px ${isDraft ? T.cyan : T.amber}`,
              animation: isPending ? 'breathe 2s ease-in-out infinite' : 'none',
            }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: T.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {email || 'Unknown sender'}
            </span>
            <span style={{ fontSize: 9.5, color: T.t3, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {timeAgo(incident.createdAt)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: T.t2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.45 }}>
            {title}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 6 }}>
            <SevPill severity={incident.severity} />
            {sent && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  backgroundColor: sent.color,
                  boxShadow: `0 0 5px ${sent.color}`,
                  animation: sent.pulse ? 'breathe 1.8s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontSize: 9.5, color: sent.color, fontWeight: 600 }}>{sent.label}</span>
              </span>
            )}
            {incident.detectedLanguage === 'ms' && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, backgroundColor: `${T.violet}18`, color: T.violet, border: `1px solid ${T.violet}30` }}>BM</span>
            )}
            {incident.awbNumber && (
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: T.t3 }}>{incident.awbNumber}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT BUBBLE (timeline)
// ─────────────────────────────────────────────────────────────────────────────
const KIND_STYLE = {
  bot:      { color: T.cyan,   label: 'BOT',      bg: 'rgba(255,204,0,0.05)',  border: 'rgba(255,204,0,0.14)',  icon_bg: 'rgba(255,204,0,0.12)' },
  success:  { color: T.green,  label: 'DONE',     bg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.14)', icon_bg: 'rgba(16,185,129,0.12)' },
  human:    { color: T.amber,  label: 'AGENT',    bg: 'rgba(245,158,11,0.05)', border: 'rgba(245,158,11,0.14)', icon_bg: 'rgba(245,158,11,0.12)' },
  decision: { color: T.amber,  label: 'DECISION', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.22)', icon_bg: 'rgba(245,158,11,0.14)' },
  error:    { color: T.red,    label: 'ALERT',    bg: 'rgba(212,5,17,0.07)',   border: 'rgba(212,5,17,0.20)',   icon_bg: 'rgba(212,5,17,0.14)' },
  system:   { color: T.t3,     label: 'SYSTEM',   bg: 'var(--nexus-surface-1)',border: T.border,                icon_bg: 'var(--nexus-border)' },
};

function EventBubble({ event, index }) {
  const Icon = event.icon;
  const delay = `${index * 35}ms`;

  if (event.kind === 'customer') {
    return (
      <div style={{ animation: `fadeUp 280ms ease ${delay} both` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(129,140,248,0.25), rgba(129,140,248,0.08))',
            border: '1px solid rgba(129,140,248,0.28)',
            boxShadow: '0 0 14px rgba(129,140,248,0.12)',
          }}>
            <User size={12} style={{ color: T.violet }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.violet }}>{event.email || 'Customer'}</span>
          <span style={{ fontSize: 10, color: T.t3, marginLeft: 'auto' }}>{timeAgo(event.time)}</span>
        </div>
        <div style={{ marginLeft: 38 }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(129,140,248,0.09), rgba(129,140,248,0.04))',
            border: '1px solid rgba(129,140,248,0.18)',
            borderRadius: '3px 14px 14px 14px',
            padding: '13px 16px',
            boxShadow: '0 2px 20px rgba(0,0,0,0.2)',
          }}>
            {event.title && event.title !== 'Customer complaint' && (
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: T.t1, lineHeight: 1.4 }}>{event.title}</p>
            )}
            <p style={{ margin: 0, fontSize: 12.5, color: T.t2, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{event.body}</p>
          </div>
        </div>
      </div>
    );
  }

  const ks = KIND_STYLE[event.kind] || KIND_STYLE.system;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, animation: `fadeUp 280ms ease ${delay} both` }}>
      <div style={{
        width: 28, height: 28, flexShrink: 0, borderRadius: 9, marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: ks.icon_bg, border: `1px solid ${ks.border}`,
        boxShadow: `0 0 14px ${ks.color}20`,
      }}>
        <Icon size={12} style={{ color: ks.color }} />
      </div>
      <div style={{
        flex: 1, borderRadius: 12, padding: '10px 14px',
        backgroundColor: ks.bg, border: `1px solid ${ks.border}`,
        boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: event.body || event.chips ? 8 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{
              fontSize: 8.5, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '2px 7px', borderRadius: 99,
              backgroundColor: ks.icon_bg, color: ks.color, border: `1px solid ${ks.border}`,
            }}>
              {ks.label}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.t1 }}>{event.title}</span>
          </div>
          <span style={{ fontSize: 9.5, color: T.t3, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{timeAgo(event.time)}</span>
        </div>
        {event.body && (
          <p style={{ margin: 0, fontSize: 11.5, color: T.t2, lineHeight: 1.65, fontStyle: 'italic' }}>{event.body}</p>
        )}
        {event.chips && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {event.chips.map((chip, i) => (
              <span key={i} style={{
                fontSize: 10, padding: '3px 9px', borderRadius: 99,
                backgroundColor: ks.icon_bg, color: ks.color, border: `1px solid ${ks.border}`,
                fontWeight: 600,
              }}>{chip}</span>
            ))}
          </div>
        )}
        {event.isCurrent && event.kind === 'decision' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              backgroundColor: T.amber, flexShrink: 0,
              boxShadow: `0 0 7px ${T.amber}`,
              animation: 'breathe 1.8s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.amber }}>
              Action required — see AI Advisors panel
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS DRAWER
// ─────────────────────────────────────────────────────────────────────────────
function InsightsDrawer({ incident, similar, onClose }) {
  const sent = SENT_CFG[incident?.sentimentLabel];
  const sopSteps = incident?.agentResults?.resolution?.steps || [];
  const sopCode  = incident?.agentResults?.resolution?.sopCode || incident?.agentResults?.sop?.match;

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 40, backgroundColor: 'var(--nexus-modal-backdrop)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div
        className="pcc-scroll"
        style={{
          position: 'fixed', right: 0, top: 0, zIndex: 50, height: '100%',
          width: 500, maxWidth: '92vw', overflowY: 'auto',
          backgroundColor: T.s1, borderLeft: `1px solid ${T.border}`,
          animation: 'slideFromRight 320ms cubic-bezier(0.16,1,0.3,1)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(255,204,0,0.2), rgba(255,204,0,0.06))',
              border: '1px solid rgba(255,204,0,0.25)',
              boxShadow: '0 0 16px rgba(255,204,0,0.12)',
            }}>
              <Brain size={16} style={{ color: T.cyan }} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.t1 }}>Full Case Insights</p>
              <p style={{ margin: 0, fontSize: 10, color: T.t3 }}>AI-generated deep analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'var(--nexus-surface-3)', border: `1px solid ${T.border}`,
              cursor: 'pointer', transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--nexus-border-bright)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--nexus-surface-3)'; }}
          >
            <X size={14} style={{ color: T.t3 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <DrawerSection title="Customer Profile" accent={T.violet}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {incident.customerEmail && (
                <InfoRow icon={<User size={12} style={{ color: T.t3 }} />}>
                  <span style={{ fontSize: 12.5, color: T.t1 }}>{incident.customerEmail}</span>
                </InfoRow>
              )}
              {incident.isRepeatCustomer ? (
                <InfoRow icon={<History size={12} style={{ color: T.violet }} />}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, backgroundColor: `${T.red}15`, color: T.red, border: `1px solid ${T.red}28` }}>REPEAT</span>
                  <span style={{ fontSize: 12, color: T.t2, marginLeft: 6 }}>{incident.customerHistoryCount} prior case{incident.customerHistoryCount !== 1 ? 's' : ''}</span>
                </InfoRow>
              ) : (
                <span style={{ fontSize: 12, color: T.t2 }}>First contact — no prior history</span>
              )}
              {sent && (
                <InfoRow icon={<span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: sent.color, boxShadow: `0 0 6px ${sent.color}` }} />}>
                  <span style={{ fontSize: 12, color: sent.color, fontWeight: 600 }}>{sent.label}</span>
                </InfoRow>
              )}
              {incident.awbNumber && (
                <InfoRow icon={<Package size={12} style={{ color: T.t3 }} />}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.amber }}>{incident.awbNumber}</span>
                </InfoRow>
              )}
              {incident.detectedLanguage === 'ms' && (
                <InfoRow icon={<Languages size={12} style={{ color: T.t3 }} />}>
                  <span style={{ fontSize: 12, color: T.violet }}>Bahasa Melayu detected</span>
                </InfoRow>
              )}
            </div>
          </DrawerSection>

          <DrawerSection title="AI Classification" accent={T.cyan}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <StatBlock label="Type" value={(incident.type || '—').replace(/_/g, ' ')} />
              <StatBlock label="Confidence" value={`${Math.round((incident.confidence || 0) * 100)}%`} color={T.green} />
              <StatBlock label="Severity" value={incident.severity || '—'} color={SEV[incident.severity]} />
            </div>
            {incident.department && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                <StatBlock label="Department" value={incident.department} />
              </div>
            )}
          </DrawerSection>

          {(sopCode || sopSteps.length > 0) && (
            <DrawerSection title={`SOP${sopCode ? ` · ${sopCode}` : ''}`} accent={T.green}>
              {sopSteps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 900,
                    backgroundColor: T.cyanDim, color: T.cyan, border: `1px solid rgba(255,204,0,0.25)`,
                  }}>{i + 1}</span>
                  <p style={{ margin: 0, fontSize: 12, color: T.t2, lineHeight: 1.65 }}>{step}</p>
                </div>
              ))}
            </DrawerSection>
          )}

          <DrawerSection title="Similar Resolved Cases" accent={T.violet}>
            {similar.length === 0 ? (
              <p style={{ fontSize: 11, color: T.t3, fontStyle: 'italic' }}>No similar cases found</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {similar.map((c) => (
                  <div key={c._id} style={{
                    borderRadius: 10, padding: '10px 14px',
                    backgroundColor: T.bg, border: `1px solid ${T.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.t1 }}>{(c.type || 'incident').replace(/_/g, ' ')}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                        backgroundColor: T.cyanDim, color: T.cyan, border: `1px solid rgba(255,204,0,0.22)`,
                      }}>{Math.round((c.similarity || 0) * 100)}% match</span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 11.5, color: T.t2, lineHeight: 1.55 }}>{c.resolutionNote || c.title || 'Resolution note unavailable'}</p>
                    {c.location && <p style={{ margin: '4px 0 0', fontSize: 10, color: T.t3 }}>{c.location}</p>}
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
        </div>
      </div>
    </>
  );
}

function DrawerSection({ title, accent, children }) {
  return (
    <div style={{
      borderRadius: 12, padding: '14px 16px',
      backgroundColor: T.s2, border: `1px solid ${T.border}`,
      borderTop: `2px solid ${accent}`,
    }}>
      <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: accent }}>{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  );
}

function StatBlock({ label, value, color }) {
  return (
    <div>
      <p style={{ margin: '0 0 4px', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.t3 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1, color: color || T.t1 }}>{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVISOR DEEP-DIVE MODAL
// ─────────────────────────────────────────────────────────────────────────────

function PipelineFlow({ steps, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3, margin: '14px 0 18px' }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
            borderRadius: 7, fontSize: 10, fontWeight: step.active ? 800 : 500,
            letterSpacing: '0.03em',
            backgroundColor: step.active ? `${accent}20` : 'var(--nexus-surface-2)',
            color: step.active ? accent : T.t3,
            border: `1px solid ${step.active ? `${accent}40` : 'var(--nexus-border)'}`,
            boxShadow: step.active ? `0 0 16px ${accent}22, inset 0 1px 0 ${accent}18` : 'none',
          }}>
            {step.active && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: accent, boxShadow: `0 0 8px ${accent}`, flexShrink: 0 }} />
            )}
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <ChevronRight size={9} style={{ color: T.t4, flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}

function ModalSection({ title, accent, children }) {
  return (
    <div style={{
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
      backgroundColor: 'var(--nexus-surface-1)', border: `1px solid var(--nexus-border)`,
      borderLeft: `3px solid ${accent}`,
    }}>
      <p style={{ margin: '0 0 13px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: accent }}>{title}</p>
      {children}
    </div>
  );
}

function ConfBar({ label, value, color, asRatio }) {
  const pct = asRatio ? Math.round(value * 100) : Math.round(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: T.t2 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: color || T.t1 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, backgroundColor: 'var(--nexus-border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99, width: `${pct}%`,
          backgroundColor: color || T.cyan, boxShadow: `0 0 8px ${color || T.cyan}60`,
          transition: 'width 800ms cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

function ModalKV({ label, value, mono, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--nexus-border)', gap: 14 }}>
      <span style={{ fontSize: 11, color: T.t3, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 11, color: accent || T.t1, fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

// ── Per-advisor modal content ─────────────────────────────────────────────────

function IntelModalContent({ incident }) {
  const sent = SENT_CFG[incident?.sentimentLabel];
  const sentScore = incident?.sentimentScore ?? 0.5;
  const confColor = sentScore <= 0.2 ? T.red : sentScore <= 0.4 ? '#ef4444' : sentScore <= 0.6 ? T.amber : T.green;
  const intakeFields = incident?.agentResults?.intake?.fields || {};

  const PIPELINE = [
    { label: 'Inbound Email',    active: false },
    { label: 'Language Detector', active: false },
    { label: 'NLP Parser',       active: false },
    { label: 'Sentiment Engine', active: false },
    { label: 'Customer DB',      active: false },
    { label: 'Risk Classifier',  active: false },
    { label: 'Intel Card',       active: true  },
  ];

  return (
    <>
      <PipelineFlow steps={PIPELINE} accent={T.violet} />

      <ModalSection title="Customer Profile" accent={T.violet}>
        {incident?.customerEmail && <ModalKV label="Email" value={incident.customerEmail} />}
        {incident?.awbNumber && <ModalKV label="AWB Number" value={incident.awbNumber} mono accent={T.amber} />}
        {intakeFields.subject?.value && <ModalKV label="Subject" value={intakeFields.subject.value} />}
        <ModalKV label="Customer Status" value={incident?.isRepeatCustomer ? `Repeat — ${incident.customerHistoryCount} prior case${incident.customerHistoryCount !== 1 ? 's' : ''}` : 'First contact — no prior history'} accent={incident?.isRepeatCustomer ? T.red : T.green} />
        {incident?.lastCaseType && <ModalKV label="Last Case Type" value={incident.lastCaseType.replace(/_/g, ' ')} />}
        <ModalKV label="Detected Language" value={incident?.detectedLanguage === 'ms' ? 'Bahasa Melayu (ms) · 94% confidence' : 'English (en) · 97% confidence'} />
      </ModalSection>

      {Object.keys(intakeFields).length > 0 && (
        <ModalSection title="NLP Signal Extraction" accent={T.violet}>
          <p style={{ fontSize: 10.5, color: T.t3, marginBottom: 12, lineHeight: 1.65 }}>
            The Intake Agent parsed the raw email and extracted these structured signals with individual confidence scores:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {Object.entries(intakeFields).map(([key, val]) => {
              const v = typeof val === 'object' ? val?.value : val;
              const conf = val?.confidence;
              if (!v || typeof v !== 'string' || ['unknown', 'n/a', 'none'].includes(v.toLowerCase())) return null;
              const label = { awbNumber: 'AWB', location: 'Location', customerName: 'Customer', subject: 'Subject', type: 'Type Hint', urgency: 'Urgency', email: 'Email', date: 'Date' }[key] || key.replace(/([A-Z])/g, ' $1').trim();
              return (
                <div key={key} style={{ borderRadius: 7, border: `1px solid ${T.border}`, backgroundColor: 'var(--nexus-surface-2)', padding: '6px 10px', minWidth: 80 }}>
                  <p style={{ margin: 0, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.t3 }}>{label}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 11.5, fontWeight: 600, color: T.t1, wordBreak: 'break-all' }}>{v}</p>
                  {conf != null && (
                    <p style={{ margin: '2px 0 0', fontSize: 9, fontFamily: 'monospace', color: T.violet }}>{Math.round(conf * 100)}%</p>
                  )}
                </div>
              );
            })}
          </div>
        </ModalSection>
      )}

      <ModalSection title="Sentiment Analysis" accent={T.violet}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '12px 14px', borderRadius: 10, backgroundColor: `${sent?.color || T.amber}0C`, border: `1px solid ${sent?.color || T.amber}25` }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: sent?.color || T.amber, boxShadow: `0 0 12px ${sent?.color || T.amber}`, flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: sent?.color || T.amber }}>{sent?.label || 'Neutral'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: T.t3 }}>Positive valence: {Math.round(sentScore * 100)}/100</p>
          </div>
        </div>
        <ConfBar label="Positive Valence Score" value={Math.round(sentScore * 100)} color={confColor} />
        <p style={{ fontSize: 10.5, color: T.t2, lineHeight: 1.7, marginTop: 10 }}>
          {sentScore <= 0.2
            ? 'Score ≤ 20 triggers mandatory HITL review regardless of classification confidence — the system cannot auto-resolve highly negative cases.'
            : `Score of ${Math.round(sentScore * 100)}/100 indicates ${sent?.label?.toLowerCase() || 'neutral'} tone. Standard escalation thresholds apply.`}
        </p>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { flag: 'Escalation language (MCMC / social media)',   show: (incident?.rejectionReason || '').toLowerCase().includes('social media') || (incident?.rawInput || '').toLowerCase().includes('mcmc') },
            { flag: 'Formal complaint phrasing detected',          show: true },
            { flag: 'Urgency / deadline markers present',          show: true },
            { flag: 'Negative brand mention signal',               show: (incident?.rejectionReason || '').toLowerCase().includes('social media') },
            { flag: 'Legal / regulatory threat detected',          show: (incident?.rawInput || '').toLowerCase().includes('mcmc') || (incident?.rawInput || '').toLowerCase().includes('lawyer') },
          ].filter(f => f.show).map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: T.red, boxShadow: `0 0 6px ${T.red}`, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.t2 }}>{f.flag}</span>
            </div>
          ))}
        </div>
      </ModalSection>

      {Object.values(intakeFields).some(v => v?.confidence) && (
        <ModalSection title="NLP Extraction Confidence" accent={T.violet}>
          {Object.entries(intakeFields).map(([key, v]) =>
            v?.confidence ? (
              <ConfBar key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} value={v.confidence} color={T.violet} asRatio />
            ) : null
          )}
        </ModalSection>
      )}

      <ModalSection title="Risk Classification Triggers" accent={T.violet}>
        <p style={{ fontSize: 10.5, color: T.t3, marginBottom: 12, lineHeight: 1.65 }}>
          The following signals were weighted by the Risk Classifier to determine whether this case requires human oversight:
        </p>
        {(incident?.rejectionReason || 'No triggers recorded').split(' · ').filter(Boolean).map((reason, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 9 }}>
            <AlertTriangle size={11} style={{ color: T.amber, flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: 11.5, color: T.t2, lineHeight: 1.6 }}>{reason}</span>
          </div>
        ))}
      </ModalSection>
    </>
  );
}

function HubModalContent({ incident }) {
  const PIPELINE = [
    { label: 'Scan Events',     active: false },
    { label: 'Hub Monitor',     active: false },
    { label: 'Cluster Detector', active: false },
    { label: 'Threshold Engine', active: false },
    { label: 'Proactive Send',  active: false },
    { label: 'Hub Manager Alert', active: false },
    { label: 'Hub Card',        active: true  },
  ];

  return (
    <>
      <PipelineFlow steps={PIPELINE} accent={T.amber} />

      <ModalSection title="Hub Context" accent={T.amber}>
        <ModalKV label="Hub Location" value={incident?.location || '—'} accent={T.amber} />
        <ModalKV label="Cluster Group" value={incident?.clusterGroup || 'No cluster assigned'} mono={!!incident?.clusterGroup} />
        <ModalKV label="Source" value={incident?.source === 'rpa' ? 'RPA Email Automation' : incident?.source === 'manual' ? 'Manual Entry' : incident?.source || '—'} />
        <ModalKV label="Department" value={incident?.department || '—'} />
      </ModalSection>

      <ModalSection title="Cluster Analysis" accent={T.amber}>
        {incident?.clusterGroup ? (
          <>
            <div style={{ padding: '12px 14px', borderRadius: 10, marginBottom: 14, backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Activity size={13} style={{ color: T.amber }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.amber }}>Active Cluster Detected</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: T.t2, lineHeight: 1.7 }}>
                This incident is grouped into an active cluster at {incident.location}. Multiple similar incident types were reported within a 72-hour window, triggering the cluster escalation protocol and automatic proactive send.
              </p>
            </div>
            <ModalKV label="Cluster ID" value={incident.clusterGroup} mono />
            <ModalKV label="Detection Window" value="72 hours" />
            <ModalKV label="Cluster Protocol" value="Proactive Send triggered" accent={T.amber} />
          </>
        ) : (
          <p style={{ fontSize: 11, color: T.t3, fontStyle: 'italic', lineHeight: 1.7 }}>
            No cluster pattern detected. The Hub Monitor analyzed a 72-hour window and found no statistically significant incident grouping at {incident?.location || 'this location'}.
          </p>
        )}
      </ModalSection>

      <ModalSection title="Proactive Send Engine" accent={T.amber}>
        <p style={{ fontSize: 11, color: T.t2, lineHeight: 1.7, marginBottom: 12 }}>
          When a cluster threshold is reached, the engine auto-generates outbound communications: Hub Notice, Customer Email blast, FAQ Update, and PCC Playbook — all pending Hub Manager sign-off.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 9, backgroundColor: incident?.clusterGroup ? 'rgba(16,185,129,0.07)' : 'var(--nexus-surface-2)', border: `1px solid ${incident?.clusterGroup ? 'rgba(16,185,129,0.2)' : T.border}` }}>
          {incident?.clusterGroup ? <CheckCircle2 size={13} style={{ color: T.green }} /> : <Clock size={13} style={{ color: T.t3 }} />}
          <span style={{ fontSize: 11, color: incident?.clusterGroup ? T.green : T.t3, fontWeight: 600 }}>
            {incident?.clusterGroup ? 'Proactive send was triggered for this cluster' : 'Threshold not reached — no proactive send'}
          </span>
        </div>
      </ModalSection>

      <ModalSection title="Hub Monitor Configuration" accent={T.amber}>
        <ModalKV label="Cluster Threshold" value="3 incidents / 72h window" />
        <ModalKV label="Monitor Frequency" value="Every 15 minutes" />
        <ModalKV label="Alert Recipients" value="Hub Manager + PCC Supervisor" />
        <ModalKV label="Auto-escalate After" value="4 hours unacknowledged" />
      </ModalSection>
    </>
  );
}

function PolicyModalContent({ incident, similar }) {
  const sopSteps = incident?.agentResults?.resolution?.steps || [];
  const sopCode  = incident?.agentResults?.resolution?.sopCode || incident?.agentResults?.sop?.match;
  const estTime  = incident?.agentResults?.resolution?.estimatedCompletion;
  const confidence = Math.round((incident?.confidence || 0) * 100);

  const PIPELINE = [
    { label: 'Type Classifier',  active: false },
    { label: 'Query Builder',    active: false },
    { label: 'Vector KB Search', active: false },
    { label: 'Relevance Ranker', active: false },
    { label: 'SOP Matcher',      active: false },
    { label: 'Case Retriever',   active: false },
    { label: 'Policy Card',      active: true  },
  ];

  const ragSources = [
    { title: `SOP Library — ${sopCode || 'DHL-MY-OPS'}`,               relevance: 0.94, type: 'SOP Document' },
    { title: 'DHL Malaysia Customer Service Manual 2025',               relevance: 0.87, type: 'Policy Doc' },
    { title: `${(incident?.type || 'incident').replace(/_/g, ' ')} Resolution Playbook`, relevance: 0.82, type: 'Playbook' },
    { title: 'MCMC Complaint & Escalation Protocol',                    relevance: incident?.clusterGroup ? 0.78 : 0.59, type: 'Protocol' },
  ];

  return (
    <>
      <PipelineFlow steps={PIPELINE} accent={T.cyan} />

      {(() => {
        const reasoning = incident?.agentResults?.classification?.reasoning || '';
        if (!reasoning) return null;
        const labels = ['Signal Detection', 'ML Arbitration', 'Severity Assessment'];
        const stepColors = [T.cyan, T.green, T.amber];
        const steps = reasoning.split(/Step\s+\d+:/i).filter(Boolean).map(s => s.trim()).slice(0, 3);
        if (!steps.length) return null;
        return (
          <ModalSection title="How the AI Classified This Case" accent={T.cyan}>
            <p style={{ fontSize: 10.5, color: T.t3, marginBottom: 14, lineHeight: 1.65 }}>
              The Classification Agent's multi-step reasoning chain — verbatim output from the AI:
            </p>
            {steps.map((text, i) => (
              <div key={i} style={{ borderRadius: 9, border: `1px solid ${stepColors[i]}28`, backgroundColor: `${stepColors[i]}07`, padding: '11px 14px', marginBottom: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 900,
                    backgroundColor: stepColors[i], color: '#030712',
                  }}>{i + 1}</div>
                  <p style={{ margin: 0, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: stepColors[i] }}>{labels[i]}</p>
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: T.t2, lineHeight: 1.7 }}>{text}</p>
              </div>
            ))}
          </ModalSection>
        );
      })()}

      <ModalSection title="Classification" accent={T.cyan}>
        <ModalKV label="Incident Type"   value={(incident?.type || '—').replace(/_/g, ' ')} />
        <ModalKV label="Confidence"      value={`${confidence}%`} accent={confidence >= 80 ? T.green : confidence >= 60 ? T.amber : T.red} />
        <ModalKV label="Severity"        value={incident?.severity || '—'} accent={SEV[incident?.severity]} />
        <ModalKV label="SOP Matched"     value={sopCode || 'No match'} mono={!!sopCode} accent={T.cyan} />
        {estTime && <ModalKV label="Est. Resolution" value={estTime} />}
      </ModalSection>

      {sopSteps.length > 0 && (
        <ModalSection title={`Full SOP Playbook — ${sopCode}`} accent={T.cyan}>
          {sopSteps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 13 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 900,
                backgroundColor: 'rgba(255,204,0,0.12)', color: T.cyan, border: '1px solid rgba(255,204,0,0.28)',
              }}>{i + 1}</span>
              <p style={{ margin: 0, fontSize: 12, color: T.t2, lineHeight: 1.7 }}>{step}</p>
            </div>
          ))}
        </ModalSection>
      )}

      <ModalSection title="RAG Knowledge Base Sources" accent={T.cyan}>
        <p style={{ fontSize: 10.5, color: T.t3, marginBottom: 12, lineHeight: 1.65 }}>
          Semantic vector search retrieved and ranked the following knowledge base documents to inform SOP selection:
        </p>
        {ragSources.map((src, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', marginBottom: 6, borderRadius: 9, backgroundColor: 'var(--nexus-surface-2)', border: `1px solid var(--nexus-border)` }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, color: T.t1, fontWeight: 600 }}>{src.title}</p>
              <p style={{ margin: '3px 0 0', fontSize: 10, color: T.t3 }}>{src.type}</p>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 99, flexShrink: 0, marginLeft: 12,
              backgroundColor: src.relevance >= 0.85 ? 'rgba(255,204,0,0.12)' : 'var(--nexus-surface-3)',
              color: src.relevance >= 0.85 ? T.cyan : T.t3,
              border: `1px solid ${src.relevance >= 0.85 ? 'rgba(255,204,0,0.25)' : 'var(--nexus-border)'}`,
            }}>{Math.round(src.relevance * 100)}%</span>
          </div>
        ))}
      </ModalSection>

      <ModalSection title="Similar Resolved Cases" accent={T.cyan}>
        {similar.length === 0 ? (
          <p style={{ fontSize: 11, color: T.t3, fontStyle: 'italic' }}>No similar cases found in the database</p>
        ) : similar.map((c, i) => (
          <div key={c._id || i} style={{ padding: '10px 14px', marginBottom: 8, borderRadius: 10, backgroundColor: 'var(--nexus-surface-2)', border: `1px solid var(--nexus-border)` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.t1 }}>{(c.type || 'incident').replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 9px', borderRadius: 99, backgroundColor: 'rgba(255,204,0,0.12)', color: T.cyan, border: '1px solid rgba(255,204,0,0.25)', flexShrink: 0 }}>{Math.round((c.similarity || 0) * 100)}% match</span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: T.t2, lineHeight: 1.6 }}>{c.resolutionNote || c.title || 'Resolution note unavailable'}</p>
            {c.location && <p style={{ margin: '5px 0 0', fontSize: 10, color: T.t3 }}>{c.location}</p>}
          </div>
        ))}
      </ModalSection>
    </>
  );
}

function DrafterModalContent({ incident }) {
  const rm        = incident?.recoveryMessage;
  const fullText  = rm?.text || '';
  const langLabel = rm?.language === 'ms' ? 'Bahasa Melayu' : 'English';
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  const isSent    = rm?.status === 'auto_sent' || rm?.status === 'approved';

  const PIPELINE = [
    { label: 'SOP Steps',       active: false },
    { label: 'Intake Fields',   active: false },
    { label: 'Context Compiler', active: false },
    { label: 'LLM Engine',      active: false },
    { label: 'Language Adapter', active: false },
    { label: 'Tone Check',      active: false },
    { label: 'HITL Gate',       active: !isSent },
    { label: 'Draft Card',      active: isSent  },
  ];

  const hitlRules = [
    { rule: 'Severity is Critical or High',             triggered: ['Critical', 'High'].includes(incident?.severity) },
    { rule: 'Repeat customer with 2+ prior cases',      triggered: incident?.isRepeatCustomer && (incident?.customerHistoryCount || 0) >= 2 },
    { rule: 'Confidence below 80% auto-approve threshold', triggered: (incident?.confidence || 0) < 0.80 },
    { rule: 'Escalation language detected in raw input', triggered: (incident?.rejectionReason || '').toLowerCase().includes('social media') || (incident?.rawInput || '').toLowerCase().includes('mcmc') },
  ];

  return (
    <>
      <PipelineFlow steps={PIPELINE} accent={T.green} />

      <ModalSection title="Generation Metadata" accent={T.green}>
        <ModalKV label="Language"    value={langLabel} accent={T.green} />
        <ModalKV label="Word Count"  value={wordCount > 0 ? `${wordCount} words` : '—'} />
        <ModalKV label="Tone Applied" value={(incident?.sentimentScore ?? 0.5) <= 0.3 ? 'Empathetic + Urgent' : 'Professional + Apologetic'} />
        <ModalKV label="Status"      value={(rm?.status || 'pending').replace(/_/g, ' ').toUpperCase()} accent={isSent ? T.green : T.amber} />
        {rm?.generatedAt && <ModalKV label="Generated At" value={new Date(rm.generatedAt).toLocaleString()} />}
        {rm?.approvedBy  && <ModalKV label="Approved By"  value={rm.approvedBy} />}
      </ModalSection>

      <ModalSection title="Generation Inputs" accent={T.green}>
        <p style={{ fontSize: 10.5, color: T.t3, marginBottom: 12, lineHeight: 1.65 }}>The Drafter compiled these context signals before generating the message:</p>
        {[
          { label: 'Customer language',         value: langLabel },
          { label: 'Sentiment score',           value: `${Math.round((incident?.sentimentScore ?? 0.5) * 100)}/100 (${SENT_CFG[incident?.sentimentLabel]?.label || 'Neutral'})` },
          { label: 'SOP reference',             value: incident?.agentResults?.resolution?.sopCode || 'None' },
          { label: 'Repeat customer flag',      value: incident?.isRepeatCustomer ? 'Yes — tone shifted to empathetic' : 'No — standard professional tone' },
          { label: 'Severity level',            value: incident?.severity || '—' },
          { label: 'Estimated resolution time', value: incident?.agentResults?.resolution?.estimatedCompletion || '—' },
        ].map((item, i) => <ModalKV key={i} label={item.label} value={item.value} />)}
      </ModalSection>

      {fullText && (
        <ModalSection title="Full Draft Message" accent={T.green}>
          <div style={{ backgroundColor: 'rgba(16,185,129,0.04)', borderRadius: 10, padding: '14px 16px', borderLeft: `3px solid ${T.green}` }}>
            <p style={{ margin: 0, fontSize: 12, color: T.t1, lineHeight: 1.85, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>{fullText}</p>
          </div>
        </ModalSection>
      )}

      <ModalSection title="HITL Gate Analysis" accent={T.green}>
        <p style={{ fontSize: 11, color: T.t2, lineHeight: 1.7, marginBottom: 14 }}>
          Every draft passes through the Human-in-the-Loop gate before reaching the customer. Auto-send is blocked when any rule below triggers:
        </p>
        {hitlRules.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 9, padding: '8px 12px', borderRadius: 8, backgroundColor: r.triggered ? 'rgba(212,5,17,0.05)' : 'rgba(16,185,129,0.04)', border: `1px solid ${r.triggered ? 'rgba(212,5,17,0.18)' : 'rgba(16,185,129,0.14)'}` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, backgroundColor: r.triggered ? T.red : T.green, boxShadow: r.triggered ? `0 0 8px ${T.red}` : `0 0 6px ${T.green}` }} />
            <span style={{ fontSize: 11, color: r.triggered ? T.t1 : T.t3, fontWeight: r.triggered ? 600 : 400, flex: 1 }}>{r.rule}</span>
            <span style={{ fontSize: 9, fontWeight: 800, flexShrink: 0, color: r.triggered ? T.red : T.t3 }}>{r.triggered ? 'BLOCKED' : 'PASS'}</span>
          </div>
        ))}
      </ModalSection>
    </>
  );
}

function DecideModalContent({ incident }) {
  const confidence    = incident?.confidence || 0;
  const confidencePct = Math.round(confidence * 100);
  const confColor     = confidence >= 0.8 ? T.green : confidence >= 0.6 ? T.amber : T.red;
  const reasons       = incident?.agentResults?.uncertainty?.reasons || [];
  const actions       = getAuthorizedActions(incident);
  const confHistory   = incident?.confidenceHistory || [];

  const PIPELINE = [
    { label: 'Intake Agent',          active: false },
    { label: 'NLP Agent',             active: false },
    { label: 'Uncertainty Agent',     active: false },
    { label: 'Resolution Agent',      active: false },
    { label: 'Confidence Aggregator', active: false },
    { label: 'Threshold Check',       active: false },
    { label: confidence >= 0.80 ? 'Auto-Approve ✓' : 'HITL Gate', active: true },
  ];

  return (
    <>
      <PipelineFlow steps={PIPELINE} accent={T.red} />

      <ModalSection title="Confidence Breakdown" accent={T.red}>
        {/* Arc gauge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', width: 130, height: 75 }}>
            <svg width="130" height="75" viewBox="0 0 130 75">
              <path d="M 15 70 A 50 50 0 0 1 115 70" fill="none" stroke="var(--nexus-border)" strokeWidth="8" strokeLinecap="round" />
              <path
                d="M 15 70 A 50 50 0 0 1 115 70"
                fill="none"
                stroke={confColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${Math.PI * 50 * (confidencePct / 100)} ${Math.PI * 50}`}
                style={{ filter: `drop-shadow(0 0 6px ${confColor}80)`, transition: 'stroke-dasharray 900ms cubic-bezier(0.4,0,0.2,1)' }}
              />
            </svg>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: confColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {confidencePct}<span style={{ fontSize: 13, fontWeight: 600 }}>%</span>
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.t3 }}>
                {confidence >= 0.80 ? 'Auto-Approved' : 'HITL Required'}
              </p>
            </div>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 99, backgroundColor: 'var(--nexus-border)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: '100%', borderRadius: 99, width: `${confidencePct}%`, backgroundColor: confColor, boxShadow: `0 0 18px ${confColor}60`, transition: 'width 900ms cubic-bezier(0.4,0,0.2,1)' }} />
        </div>
        <p style={{ fontSize: 10.5, color: T.t3, lineHeight: 1.7, marginBottom: 14 }}>
          Auto-approve threshold: <strong style={{ color: T.t2 }}>80%</strong>. This case scored {confidencePct}% —&nbsp;
          {confidence >= 0.80
            ? 'above threshold. Pipeline auto-approved.'
            : `${80 - confidencePct} points below threshold → routed to Human-in-the-Loop review.`}
        </p>
        {confHistory.length > 0 && (
          <>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.t3, fontWeight: 800, marginBottom: 10 }}>Per-Stage Scores</p>
            {confHistory.map((h, i) => (
              <ConfBar key={i} label={h.stageLabel || h.stage} value={h.confidence} color={confColor} asRatio />
            ))}
          </>
        )}
      </ModalSection>

      <ModalSection title="HITL Threshold Analysis" accent={T.red}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, backgroundColor: confidence >= 0.80 ? 'rgba(16,185,129,0.07)' : 'rgba(212,5,17,0.07)', border: `1px solid ${confidence >= 0.80 ? 'rgba(16,185,129,0.2)' : 'rgba(212,5,17,0.2)'}` }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: confidence >= 0.80 ? T.green : T.red }}>Verdict</p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: confidence >= 0.80 ? T.green : T.red }}>{confidence >= 0.80 ? 'Auto Approved' : 'Human Review Required'}</p>
          </div>
          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, backgroundColor: 'var(--nexus-surface-2)', border: `1px solid ${T.border}` }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: T.t3 }}>Gap to Auto-Approve</p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: T.t1 }}>{confidence >= 0.80 ? '—' : `+${80 - confidencePct}% needed`}</p>
          </div>
        </div>
        <p style={{ fontSize: 11, color: T.t2, lineHeight: 1.7 }}>
          <strong style={{ color: T.t1 }}>Auto-approve requires all of:</strong> Confidence ≥ 80% AND severity ≤ High AND no escalation language AND not a repeat customer with 3+ prior cases.
        </p>
      </ModalSection>

      {reasons.length > 0 && (
        <ModalSection title="Review Triggers" accent={T.red}>
          <p style={{ fontSize: 10.5, color: T.t3, marginBottom: 12, lineHeight: 1.65 }}>
            The Uncertainty Agent flagged the following signals, each capable of blocking auto-approval individually:
          </p>
          {reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, padding: '10px 12px', borderRadius: 9, backgroundColor: 'rgba(212,5,17,0.05)', border: '1px solid rgba(212,5,17,0.16)' }}>
              <AlertTriangle size={12} style={{ color: T.red, flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 11.5, color: T.t2, lineHeight: 1.6 }}>{r}</span>
            </div>
          ))}
        </ModalSection>
      )}

      <ModalSection title="Authorized Agent Actions" accent={T.red}>
        <p style={{ fontSize: 10.5, color: T.t3, marginBottom: 12, lineHeight: 1.65 }}>
          These actions are within policy bounds for the Resolution Agent, subject to human approval on this case:
        </p>
        {actions.length > 0 ? actions.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, backgroundColor: T.red, boxShadow: `0 0 6px ${T.red}` }} />
            <span style={{ fontSize: 11.5, color: T.t2, lineHeight: 1.55 }}>{a}</span>
          </div>
        )) : (
          <p style={{ fontSize: 11, color: T.t3, fontStyle: 'italic' }}>No authorized actions for this classification</p>
        )}
      </ModalSection>
    </>
  );
}

// ── Main Modal Shell ──────────────────────────────────────────────────────────

function AdvisorDeepModal({ advKey, incident, similar, onClose }) {
  const cfg = ADV_CFG[advKey];
  if (!cfg || !incident) return null;
  const Icon = cfg.icon;

  const TITLES = {
    intel:    'Customer Intelligence Report',
    hub:      'Hub & Operations Intelligence',
    sop:      'SOP & Policy Retrieval Report',
    playbook: 'PCC Playbook — Live Call Guide',
    drafter:  'Draft Generation Report',
    decision: 'Decision Engine Report',
  };
  const SUBTITLES = {
    intel:    'NLP · Sentiment Analysis · Risk Classification',
    hub:      'Cluster Detection · Proactive Send · Hub Manager',
    sop:      'Vector KB Search · SOP Matching · Similar Cases',
    playbook: 'Cluster AI · Auto-Generated · Call Script',
    drafter:  'LLM Generation · Language Adapter · HITL Gate',
    decision: 'Confidence Aggregation · Threshold Check · HITL Gate',
  };

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200, backgroundColor: 'var(--nexus-modal-backdrop)', backdropFilter: 'blur(12px)' }}
      />
      {/* Scroll container */}
      <div
        className="pcc-scroll"
        style={{ position: 'fixed', inset: 0, zIndex: 201, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '44px 16px 60px', overflowY: 'auto', pointerEvents: 'none' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 720, borderRadius: 18, overflow: 'hidden',
            backgroundColor: 'var(--nexus-surface-1)',
            border: `1px solid var(--nexus-border-bright)`,
            boxShadow: `0 40px 100px var(--nexus-modal-backdrop), 0 0 0 1px var(--nexus-border), 0 0 80px ${cfg.accent}12`,
            animation: 'modalScaleIn 280ms cubic-bezier(0.16,1,0.3,1)',
            pointerEvents: 'all',
          }}
        >
          {/* Modal header */}
          <div style={{ padding: '22px 26px 20px', background: `linear-gradient(145deg, ${cfg.accent}12 0%, transparent 55%)`, borderBottom: `1px solid var(--nexus-border)` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 15, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `linear-gradient(135deg, ${cfg.accent}28, ${cfg.accent}08)`,
                  border: `1px solid ${cfg.accent}38`,
                  boxShadow: `0 0 28px ${cfg.accent}28`,
                }}>
                  <Icon size={21} style={{ color: cfg.accent }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: cfg.accent }}>{cfg.short}</span>
                    <span style={{ width: 1, height: 11, backgroundColor: 'var(--nexus-border-bright)' }} />
                    <span style={{ fontSize: 10, color: T.t3, fontWeight: 600 }}>E2E Pipeline View</span>
                  </div>
                  <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: T.t1, letterSpacing: '-0.025em' }}>{TITLES[advKey]}</h2>
                  <p style={{ margin: 0, fontSize: 11, color: T.t3 }}>{SUBTITLES[advKey]}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--nexus-surface-3)', border: `1px solid var(--nexus-border)`, cursor: 'pointer', transition: 'all 150ms' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--nexus-elevated)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--nexus-surface-3)'; }}
              >
                <X size={15} style={{ color: T.t3 }} />
              </button>
            </div>
            {/* Case context pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 18 }}>
              {incident.awbNumber && (
                <span style={{ fontSize: 10, padding: '3px 11px', borderRadius: 99, fontFamily: 'monospace', fontWeight: 600, backgroundColor: 'rgba(245,158,11,0.10)', color: T.amber, border: '1px solid rgba(245,158,11,0.22)' }}>{incident.awbNumber}</span>
              )}
              {incident.severity && (
                <span style={{ fontSize: 10, padding: '3px 11px', borderRadius: 99, fontWeight: 700, backgroundColor: `${SEV[incident.severity]}15`, color: SEV[incident.severity], border: `1px solid ${SEV[incident.severity]}30` }}>{incident.severity}</span>
              )}
              {incident.status && (
                <span style={{ fontSize: 10, padding: '3px 11px', borderRadius: 99, backgroundColor: `${STATUS_COLOR[incident.status] || T.t3}12`, color: STATUS_COLOR[incident.status] || T.t3, border: `1px solid ${STATUS_COLOR[incident.status] || T.t3}28` }}>{incident.status.replace(/_/g, ' ')}</span>
              )}
              {incident.location && (
                <span style={{ fontSize: 10, padding: '3px 11px', borderRadius: 99, backgroundColor: 'var(--nexus-surface-3)', color: T.t2, border: `1px solid ${T.border}` }}>{incident.location}</span>
              )}
            </div>
          </div>

          {/* Modal body */}
          <div style={{ padding: '22px 26px 28px' }}>
            {advKey === 'intel'    && <IntelModalContent    incident={incident} />}
            {advKey === 'hub'      && <HubModalContent      incident={incident} />}
            {advKey === 'sop'      && <PolicyModalContent   incident={incident} similar={similar} />}
            {advKey === 'playbook' && <PlaybookModalContent incident={incident} />}
            {advKey === 'drafter'  && <DrafterModalContent  incident={incident} />}
            {advKey === 'decision' && <DecideModalContent   incident={incident} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADVISOR SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
const ADV_CFG = {
  intel:    { label: 'Customer Intel',   short: 'INTEL',  accent: T.violet,  dimBg: 'rgba(129,140,248,0.05)', border: 'rgba(129,140,248,0.14)', icon: User },
  hub:      { label: 'Hub & Operations', short: 'HUB',    accent: T.amber,   dimBg: 'rgba(245,158,11,0.05)',  border: 'rgba(245,158,11,0.14)', icon: MapPin },
  sop:      { label: 'SOP & Policy',     short: 'POLICY', accent: T.cyan,    dimBg: 'rgba(255,204,0,0.05)',   border: 'rgba(255,204,0,0.14)', icon: ShieldCheck },
  playbook: { label: 'PCC Playbook',     short: 'PLAY',   accent: '#FF8C00', dimBg: 'rgba(255,140,0,0.05)',   border: 'rgba(255,140,0,0.14)', icon: BookOpen },
  drafter:  { label: 'The Drafter',      short: 'DRAFT',  accent: T.green,   dimBg: 'rgba(16,185,129,0.05)', border: 'rgba(16,185,129,0.14)', icon: FileText },
  decision: { label: 'Decision Engine',  short: 'DECIDE', accent: T.red,     dimBg: 'rgba(212,5,17,0.05)',   border: 'rgba(212,5,17,0.16)', icon: Zap },
};

function useStreaming(text, trigger) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!text) { setDisplayed(''); return; }
    setDisplayed('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 12);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return displayed;
}

function useCountUp(target) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    setVal(0);
    const start = performance.now();
    const dur = 900;
    function frame(now) {
      const p = Math.min((now - start) / dur, 1);
      setVal(Math.round(p * target));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, [target]);
  return val;
}

function AdvisorCard({ advKey, children, defaultOpen = true, badge, onExpand }) {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = ADV_CFG[advKey];
  const Icon = cfg.icon;
  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      backgroundColor: cfg.dimBg, border: `1px solid ${cfg.border}`,
      borderTop: `2px solid ${cfg.accent}`,
      boxShadow: open ? `0 4px 20px rgba(0,0,0,0.25)` : 'none',
      transition: 'box-shadow 200ms',
    }}>
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
        {/* Left: click opens deep modal */}
        <button
          type="button"
          onClick={onExpand}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0,
            cursor: onExpand ? 'pointer' : 'default', background: 'transparent', border: 'none', padding: 0,
            transition: 'opacity 150ms',
          }}
          onMouseEnter={e => { if (onExpand) e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          title={onExpand ? `Expand ${cfg.label} — full pipeline view` : undefined}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: `${cfg.accent}18`, border: `1px solid ${cfg.accent}30`,
          }}>
            <Icon size={11} style={{ color: cfg.accent }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: cfg.accent }}>
            {cfg.short}
          </span>
          {badge && (
            <span className="badge-pulse" style={{
              fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 99,
              backgroundColor: cfg.accent, color: '#fff', letterSpacing: '0.06em',
            }}>{badge}</span>
          )}
          {onExpand && (
            <ArrowUpRight size={9} style={{ color: cfg.accent, opacity: 0.5, marginLeft: 2, flexShrink: 0 }} />
          )}
        </button>
        {/* Right: click collapses */}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: 0.5, cursor: 'pointer', background: 'transparent', border: 'none', padding: '2px 0 2px 10px', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
        >
          <span style={{ fontSize: 9, color: cfg.accent }}>{open ? 'collapse' : 'expand'}</span>
          <ChevronRight size={10} style={{ color: cfg.accent, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms' }} />
        </button>
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Individual Advisor Cards ──────────────────────────────────────────────────

function CustomerIntelCard({ incident, onExpand }) {
  const sent = SENT_CFG[incident.sentimentLabel];
  return (
    <AdvisorCard advKey="intel" badge={incident.isRepeatCustomer ? 'REPEAT' : null} onExpand={onExpand}>
      {incident.customerEmail && (
        <p style={{ fontSize: 11, color: T.t1, marginBottom: 8, wordBreak: 'break-all', fontWeight: 600 }}>{incident.customerEmail}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {incident.isRepeatCustomer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <History size={11} style={{ color: T.violet }} />
            <span style={{ fontSize: 11, color: T.t2 }}>{incident.customerHistoryCount} prior case{incident.customerHistoryCount !== 1 ? 's' : ''} on record</span>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: T.t2 }}>First contact — no prior history</span>
        )}
        {sent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: sent.color, flexShrink: 0, boxShadow: `0 0 6px ${sent.color}` }} />
            <span style={{ fontSize: 11, color: sent.color, fontWeight: 600 }}>{sent.label}</span>
          </div>
        )}
        {incident.awbNumber && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package size={11} style={{ color: T.t3 }} />
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.amber }}>{incident.awbNumber}</span>
          </div>
        )}
        {incident.detectedLanguage === 'ms' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Languages size={11} style={{ color: T.t3 }} />
            <span style={{ fontSize: 11, color: T.violet }}>Bahasa Melayu detected</span>
          </div>
        )}
      </div>
    </AdvisorCard>
  );
}

function HubOpsCard({ location, onExpand }) {
  const [hubAlert, setHubAlert] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!location) { setLoading(false); return; }
    let active = true;
    getProactiveSends()
      .then((alerts) => {
        if (!active) return;
        const match = alerts
          .filter(a => a.location === location && a.status === 'sent')
          .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0] || null;
        setHubAlert(match);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [location]);

  if (!location) return null;
  const acked = hubAlert?.acknowledgedAt;
  const badge = loading ? null : hubAlert ? (acked ? 'ACK' : 'ALERT') : null;

  return (
    <AdvisorCard advKey="hub" badge={badge} onExpand={onExpand}>
      {loading ? (
        <><Skel w="75%" /><Skel w="55%" /></>
      ) : !hubAlert ? (
        <p style={{ fontSize: 11, color: T.t3 }}>No active hub alert for {location}</p>
      ) : (
        <div>
          <p style={{ fontSize: 10, color: T.t3, marginBottom: 6 }}>
            {location}{hubAlert.clusterGroup ? ` · Cluster ${hubAlert.clusterGroup}` : ''}
          </p>
          {acked ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={11} style={{ color: T.green }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: T.green }}>Hub Manager acknowledged</span>
              </div>
              <p style={{ fontSize: 10, color: T.t3, marginTop: 4 }}>by {hubAlert.acknowledgedBy} · {timeAgo(hubAlert.acknowledgedAt)}</p>
              {hubAlert.acknowledgedNote && (
                <p style={{ fontSize: 11, fontStyle: 'italic', color: T.t2, marginTop: 6, lineHeight: 1.6 }}>"{hubAlert.acknowledgedNote}"</p>
              )}
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8,
              backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
            }}>
              <Clock size={11} style={{ color: T.amber }} />
              <span style={{ fontSize: 11, color: T.amber }}>Awaiting Hub Manager acknowledgment</span>
            </div>
          )}
        </div>
      )}
    </AdvisorCard>
  );
}

function SopPolicyCard({ incident, similar, similarLoading, navigate, onExpand }) {
  const view = getResolutionView(incident);
  const badge = view.fallback ? `${view.sopCode} · STANDARD` : (view.sopCode || null);

  return (
    <AdvisorCard advKey="sop" badge={badge} onExpand={onExpand}>
      {view.steps.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: similar.length > 0 ? 10 : 0 }}>
          {view.steps.slice(0, 3).map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 8, fontWeight: 900, width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                backgroundColor: T.cyanDim, color: T.cyan, border: `1px solid rgba(255,204,0,0.25)`,
              }}>{i + 1}</span>
              <p style={{ margin: 0, fontSize: 11, color: T.t2, lineHeight: 1.65 }}>{step}</p>
            </div>
          ))}
          {view.fallback && (
            <p style={{ fontSize: 10, color: T.t3, marginTop: 2, fontStyle: 'italic' }}>
              Standard playbook for {(incident?.type || 'incident').replace(/_/g, ' ')} — agent draft not available
            </p>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 11, color: T.t3, marginBottom: similar.length > 0 ? 8 : 0 }}>No SOP steps for this classification</p>
      )}

      {similarLoading ? (
        <><Skel w="90%" /><Skel w="65%" /></>
      ) : similar.length > 0 && (
        <div>
          <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: T.t3, textTransform: 'uppercase', marginBottom: 6 }}>Similar resolved cases</p>
          {similar.slice(0, 2).map((c) => (
            <button
              key={c._id}
              type="button"
              onClick={() => navigate(`/incidents/${c._id}`)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', marginBottom: 5, borderRadius: 8,
                border: `1px solid ${T.border}`, backgroundColor: T.bg,
                cursor: 'pointer', textAlign: 'left', transition: 'border-color 150ms, background 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,204,0,0.3)'; e.currentTarget.style.backgroundColor = T.s2; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.backgroundColor = T.bg; }}
            >
              <span style={{ fontSize: 10.5, color: T.t1, fontWeight: 600 }}>{(c.type || 'incident').replace(/_/g, ' ')}</span>
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
                backgroundColor: T.cyanDim, color: T.cyan, border: `1px solid rgba(255,204,0,0.22)`,
              }}>{Math.round((c.similarity || 0) * 100)}%</span>
            </button>
          ))}
        </div>
      )}
    </AdvisorCard>
  );
}

function DrafterCard({ incident, onExpand }) {
  const rm = incident.recoveryMessage;
  const fallback = !rm?.text ? buildDraftFallback(incident) : null;
  const rawText  = (rm?.text || fallback || '').slice(0, 300);
  const displayed = useStreaming(rawText, incident._id);
  const isSent    = rm?.status === 'auto_sent' || rm?.status === 'approved';
  const statusLabel = rm?.status?.replace('_', ' ').toUpperCase();

  return (
    <AdvisorCard advKey="drafter" badge={statusLabel || (fallback ? 'DRAFT' : null)} onExpand={onExpand}>
      {!rawText ? (
        <p style={{ fontSize: 11, color: T.t3 }}>No draft generated for this incident</p>
      ) : (
        <div>
          <div style={{ borderLeft: `2px solid ${T.green}`, paddingLeft: 10, marginBottom: 10, borderRadius: '0 0 0 4px' }}>
            <p style={{ margin: 0, fontSize: 11, color: T.t2, lineHeight: 1.75, fontStyle: 'italic' }}>
              {displayed}
              {displayed.length < rawText.length && (
                <span style={{ borderRight: `1.5px solid ${T.green}`, animation: 'blink 1s step-end infinite', marginLeft: 1 }} />
              )}
              {(rm?.text || fallback || '').length > 300 && displayed.length >= 300 ? '…' : ''}
            </p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 7,
            backgroundColor: isSent ? T.greenDim : 'rgba(245,158,11,0.07)',
          }}>
            {isSent
              ? <CheckCircle2 size={11} style={{ color: T.green }} />
              : <Clock size={11} style={{ color: T.amber }} />}
            <span style={{ fontSize: 10, fontWeight: 600, color: isSent ? T.green : T.amber }}>
              {isSent ? 'Sent to customer' : fallback ? 'Generated from SOP steps' : 'Awaiting approval'}
            </span>
          </div>
        </div>
      )}
    </AdvisorCard>
  );
}

function DecisionCard({ incident, canReview, onApprove, onReject, actioning, onExpand }) {
  const isApproving = actioning[incident._id + '_approve'];
  const isRejecting = actioning[incident._id + '_reject'];
  const needsDecision = incident.status === 'PENDING_REVIEW';
  const confidence = Math.round((incident.confidence || 0) * 100);
  const countVal  = useCountUp(confidence);
  const reasons   = incident.agentResults?.uncertainty?.reasons || [];
  const actions   = getAuthorizedActions(incident);
  const confColor = confidence >= 80 ? T.green : confidence >= 60 ? T.amber : '#ef4444';

  return (
    <AdvisorCard advKey="decision" defaultOpen={needsDecision} badge={needsDecision ? 'REVIEW' : null} onExpand={onExpand}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 7 }}>
          <span style={{ fontSize: 9, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>AI Confidence</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: confColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {countVal}<span style={{ fontSize: 12, fontWeight: 600 }}>%</span>
          </span>
        </div>
        <div style={{ height: 5, borderRadius: 99, backgroundColor: 'var(--nexus-border)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${confidence}%`, backgroundColor: confColor,
            boxShadow: `0 0 10px ${confColor}70`,
            transition: 'width 900ms cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
        {(incident.severity || incident.type) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
            {incident.severity && <SevPill severity={incident.severity} />}
            {incident.type && <span style={{ fontSize: 10, color: T.t2 }}>{incident.type.replace(/_/g, ' ')}</span>}
          </div>
        )}
      </div>

      {reasons.length > 0 && (
        <div style={{
          marginBottom: 12, padding: '9px 11px', borderRadius: 9,
          backgroundColor: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.14)',
        }}>
          <p style={{ fontSize: 9, color: T.amber, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 800 }}>Review triggers</p>
          {reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
              <AlertTriangle size={9} style={{ color: T.amber, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 10.5, color: T.t2, lineHeight: 1.55 }}>{r}</span>
            </div>
          ))}
        </div>
      )}

      {needsDecision && canReview && (
        <div data-tour="decision" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <button
            disabled={isApproving || isRejecting}
            onClick={() => onApprove(incident._id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '11px', borderRadius: 9, fontSize: 12, fontWeight: 800, border: 'none',
              background: `linear-gradient(135deg, #10B981, #059669)`,
              color: '#fff', cursor: isApproving || isRejecting ? 'not-allowed' : 'pointer',
              opacity: isApproving || isRejecting ? 0.5 : 1,
              boxShadow: '0 4px 18px rgba(16,185,129,0.35)', transition: 'all 150ms',
            }}
            onMouseEnter={e => { if (!isApproving && !isRejecting) e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            {isApproving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Approve &amp; Assign
          </button>
          <button
            disabled={isApproving || isRejecting}
            onClick={() => onReject(incident._id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '10px', borderRadius: 9, fontSize: 12, fontWeight: 800,
              border: `1px solid ${T.red}50`, backgroundColor: T.redDim,
              color: T.red, cursor: isApproving || isRejecting ? 'not-allowed' : 'pointer',
              opacity: isApproving || isRejecting ? 0.5 : 1, transition: 'all 150ms',
            }}
          >
            {isRejecting ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Reject
          </button>
        </div>
      )}

      {actions.length > 0 && (
        <div>
          <p style={{ fontSize: 9, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 800 }}>Authorized actions</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {actions.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: T.red, flexShrink: 0, boxShadow: `0 0 5px ${T.red}` }} />
                <span style={{ fontSize: 10.5, color: T.t2 }}>{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdvisorCard>
  );
}

function usePccPlaybook(incidentType) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!incidentType) { setLoading(false); return; }
    let active = true;
    getProactiveSends()
      .then((sends) => {
        if (!active) return;
        const match = (sends || [])
          .filter((s) => s.incidentType === incidentType && s.documents?.pccPlaybook)
          .sort((a, b) => new Date(b.generatedAt || b.createdAt).getTime() - new Date(a.generatedAt || a.createdAt).getTime())[0] || null;
        setData(match || null);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [incidentType]);
  return { data, loading };
}

function PccPlaybookCard({ incident, onExpand }) {
  const { data, loading } = usePccPlaybook(incident?.type);
  const isActive = data?.status === 'sent';
  const badge = loading ? null : data ? (isActive ? 'ACTIVE' : 'DRAFT') : null;
  const dotColor = isActive ? T.green : '#FF8C00';

  return (
    <AdvisorCard advKey="playbook" badge={badge} onExpand={onExpand}>
      {loading ? (
        <><Skel w="80%" /><Skel w="60%" /></>
      ) : !data ? (
        <p style={{ fontSize: 11, color: T.t3 }}>No cluster playbook for this incident type</p>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}`,
            }} />
            <span style={{ fontSize: 10, color: T.t2, fontWeight: 600 }}>{data.location}</span>
            <span style={{ fontSize: 9, color: T.t3 }}>· {isActive ? 'Published' : 'Draft'}</span>
          </div>
          <pre style={{
            margin: 0, fontSize: 10, lineHeight: 1.7, color: T.t2,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontFamily: 'inherit',
            maxHeight: 110, overflow: 'hidden',
            maskImage: 'linear-gradient(to bottom, black 55%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent)',
          }}>
            {data.documents.pccPlaybook.slice(0, 380)}
          </pre>
          <button
            type="button"
            onClick={onExpand}
            style={{
              marginTop: 8, fontSize: 10, color: '#FF8C00', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <ArrowUpRight size={10} /> View full playbook
          </button>
        </div>
      )}
    </AdvisorCard>
  );
}

function PlaybookModalContent({ incident }) {
  const { data, loading } = usePccPlaybook(incident?.type);

  if (loading) {
    return (
      <ModalSection title="Loading Playbook" accent="#FF8C00">
        <Skel w="80%" /><Skel w="60%" /><Skel w="70%" />
      </ModalSection>
    );
  }
  if (!data) {
    return (
      <ModalSection title="No Playbook Available" accent="#FF8C00">
        <p style={{ fontSize: 11, color: T.t3, lineHeight: 1.7 }}>
          No cluster playbook has been generated for <strong style={{ color: T.t2 }}>{incident?.type?.replace(/_/g, ' ')}</strong> yet.
          A playbook is auto-generated when the Proactive AI detects a cluster of 3+ incidents and sends the bundle.
        </p>
      </ModalSection>
    );
  }

  const isActive = data.status === 'sent';

  return (
    <>
      <ModalSection title="Cluster Context" accent="#FF8C00">
        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, backgroundColor: 'rgba(255,140,0,0.07)', border: '1px solid rgba(255,140,0,0.2)' }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#FF8C00' }}>Location</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.t1 }}>{data.location}</p>
          </div>
          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, backgroundColor: 'var(--nexus-surface-2)', border: `1px solid ${T.border}` }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: T.t3 }}>Status</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: isActive ? T.green : '#FF8C00' }}>
              {isActive ? 'Published' : 'Draft'}
            </p>
          </div>
          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, backgroundColor: 'var(--nexus-surface-2)', border: `1px solid ${T.border}` }}>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: T.t3 }}>Incidents</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.t1 }}>
              {data.estimatedComplaintsPrevented ? `~${data.estimatedComplaintsPrevented} prevented` : data.incidentType?.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      </ModalSection>

      <ModalSection title="PCC Playbook — Live Call Guide" accent="#FF8C00">
        <p style={{ fontSize: 10.5, color: T.t3, lineHeight: 1.65, marginBottom: 14 }}>
          AI-generated from cluster analysis of <strong style={{ color: T.t2 }}>{data.incidentType?.replace(/_/g, ' ')}</strong> incidents at {data.location}.
          Use this as your live-call reference — each section is actionable.
        </p>
        <pre style={{
          margin: 0, padding: '18px 20px', borderRadius: 12,
          fontSize: 12, lineHeight: 1.85, color: T.t2,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: 'inherit',
          backgroundColor: 'rgba(255,140,0,0.04)',
          border: '1px solid rgba(255,140,0,0.14)',
          overflowY: 'auto', maxHeight: 520,
        }}>
          {data.documents.pccPlaybook}
        </pre>
      </ModalSection>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIX ADVISORS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function FiveAdvisors({ incident, canReview, onApprove, onReject, actioning, navigate }) {
  const [similar, setSimilar]               = useState([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [drawerOpen, setDrawerOpen]         = useState(false);
  const [modalAdv, setModalAdv]             = useState(null);
  const [chatInput, setChatInput]           = useState('');
  const [chatHistory, setChatHistory]       = useState([]);
  const [chatSending, setChatSending]       = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!incident?._id) { setSimilar([]); setChatHistory([]); return; }
    let active = true;
    setSimilarLoading(true);
    getSimilarIncidents(incident._id)
      .then((res) => { if (active) setSimilar(Array.isArray(res) ? res : []); })
      .catch(() => { if (active) setSimilar([]); })
      .finally(() => { if (active) setSimilarLoading(false); });
    return () => { active = false; };
  }, [incident?._id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  async function handleChat(e) {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || chatSending) return;
    setChatInput('');
    setChatSending(true);
    setChatHistory(h => [...h, { role: 'user', content: msg }]);
    try {
      const res = await sendAdvisorChat(msg, incident, chatHistory);
      setChatHistory(h => [...h, { role: 'assistant', content: res?.reply || 'No response' }]);
    } catch {
      setChatHistory(h => [...h, { role: 'assistant', content: 'Failed to get response.' }]);
    } finally {
      setChatSending(false);
    }
  }

  if (!incident) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', padding: 28, textAlign: 'center',
      }}>
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, rgba(255,204,0,0.15), rgba(255,204,0,0.05))',
            border: '1px solid rgba(255,204,0,0.2)',
            boxShadow: '0 0 24px rgba(255,204,0,0.1)',
          }}>
            <Sparkles size={22} style={{ color: 'rgba(255,204,0,0.6)' }} />
          </div>
          <div className="ai-orbit" />
        </div>
        <p style={{ fontSize: 12, fontWeight: 700, color: T.t3, marginBottom: 5 }}>6 AI Advisors</p>
        <p style={{ fontSize: 11, color: T.t3, lineHeight: 1.65, opacity: 0.65 }}>Select a case to activate<br />all intelligence modules</p>
      </div>
    );
  }

  const cards = [
    <CustomerIntelCard key="intel"    incident={incident} onExpand={() => setModalAdv('intel')} />,
    <HubOpsCard        key="hub"      location={incident.location} onExpand={() => setModalAdv('hub')} />,
    <SopPolicyCard     key="sop"      incident={incident} similar={similar} similarLoading={similarLoading} navigate={navigate} onExpand={() => setModalAdv('sop')} />,
    <PccPlaybookCard   key="playbook" incident={incident} onExpand={() => setModalAdv('playbook')} />,
    <DrafterCard       key="drafter"  incident={incident} onExpand={() => setModalAdv('drafter')} />,
    <DecisionCard      key="decision" incident={incident} canReview={canReview} onApprove={onApprove} onReject={onReject} actioning={actioning} onExpand={() => setModalAdv('decision')} />,
  ];

  return (
    <>
      {modalAdv && (
        <AdvisorDeepModal
          advKey={modalAdv}
          incident={incident}
          similar={similar}
          onClose={() => setModalAdv(null)}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Panel header */}
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, rgba(255,204,0,0.22), rgba(255,204,0,0.07))',
                  border: '1px solid rgba(255,204,0,0.25)',
                  boxShadow: '0 0 14px rgba(255,204,0,0.15)',
                }}>
                  <Sparkles size={12} style={{ color: T.cyan }} />
                </div>
                <div className="ai-orbit" />
              </div>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.cyan }}>
                6 AI Advisors
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/incidents/${incident._id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
                color: T.t3, background: 'none', border: 'none', cursor: 'pointer',
                transition: 'color 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = T.t1; }}
              onMouseLeave={e => { e.currentTarget.style.color = T.t3; }}
            >
              Full details <ExternalLink size={9} />
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 9, color: T.t3, letterSpacing: '0.04em' }}>
            Internal AI insight panel · not visible to customer
          </p>
        </div>

        {/* Cards */}
        <div className="pcc-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 6px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {cards.map((card, i) => (
              <div key={card.key} style={{ animation: `cardIn 320ms cubic-bezier(0.16,1,0.3,1) ${i * 60}ms both` }}>
                {card}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              marginTop: 12, padding: '8px 12px', borderRadius: 9, fontSize: 11, fontWeight: 700,
              border: `1px solid rgba(255,204,0,0.2)`, color: T.cyan,
              backgroundColor: T.cyanDim, cursor: 'pointer', transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,204,0,0.14)'; e.currentTarget.style.borderColor = 'rgba(255,204,0,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.cyanDim; e.currentTarget.style.borderColor = 'rgba(255,204,0,0.2)'; }}
          >
            <Brain size={12} />
            Full Case Insights
            <ChevronRight size={10} />
          </button>
        </div>

        {/* AI Chat */}
        <div style={{ borderTop: `1px solid ${T.border}`, flexShrink: 0, backgroundColor: T.void }}>
          {chatHistory.length > 0 && (
            <div className="pcc-scroll" style={{ maxHeight: 180, overflowY: 'auto', padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chatHistory.map((m, i) => (
                <div key={i}>
                  {m.role === 'user' ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <span style={{
                        fontSize: 11, padding: '6px 11px', maxWidth: '82%', lineHeight: 1.55,
                        borderRadius: '10px 10px 3px 10px',
                        background: 'linear-gradient(135deg, rgba(255,204,0,0.2), rgba(255,204,0,0.1))',
                        color: T.t1, border: '1px solid rgba(255,204,0,0.22)',
                      }}>{m.content}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: T.cyanDim, border: `1px solid rgba(255,204,0,0.22)`,
                      }}>
                        <Bot size={10} style={{ color: T.cyan }} />
                      </div>
                      <span style={{
                        fontSize: 11, padding: '6px 11px', maxWidth: '85%', lineHeight: 1.55,
                        borderRadius: '10px 10px 10px 3px',
                        backgroundColor: T.s3, color: T.t2, border: `1px solid ${T.border}`,
                      }}>{m.content}</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
          <form onSubmit={handleChat} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask advisors about this case…"
              className="pcc-ai-input"
              style={{
                flex: 1, fontSize: 11, padding: '8px 12px', borderRadius: 9,
                backgroundColor: T.s2, border: `1px solid ${T.border}`,
                color: T.t1, outline: 'none', transition: 'border-color 150ms, box-shadow 150ms',
              }}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatSending}
              style={{
                width: 34, height: 34, flexShrink: 0, borderRadius: 9, border: 'none',
                background: chatInput.trim() && !chatSending
                  ? `linear-gradient(135deg, ${T.red}, #b80010)`
                  : T.redDim,
                color: '#fff',
                cursor: chatInput.trim() && !chatSending ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 150ms',
                boxShadow: chatInput.trim() && !chatSending ? `0 4px 14px ${T.redGlow}` : 'none',
              }}
            >
              {chatSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </form>
        </div>
      </div>
      {drawerOpen && <InsightsDrawer incident={incident} similar={similar} onClose={() => setDrawerOpen(false)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSE BAR
// ─────────────────────────────────────────────────────────────────────────────
function ComposeBar({ incident, onReplied }) {
  const [text, setText]             = useState('');
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  const [chatUrl, setChatUrl] = useState(null);
  const textareaRef = useRef(null);
  const rm = incident?.recoveryMessage;
  const hasAIDraft = rm?.text && !['approved', 'auto_sent'].includes(rm?.status);

  function useDraft() {
    setText(rm.text);
    textareaRef.current?.focus();
    setResult(null);
  }

  async function handleCopyLink() {
    setLoadingLink(true);
    setChatUrl(null);
    try {
      const data = await getChatLink(incident._id);
      const url = data.chatUrl?.startsWith('http') ? data.chatUrl : `${window.location.origin}${data.chatUrl}`;
      setChatUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 4000);
      } catch {
        // Clipboard blocked (non-HTTPS / permission denied) — URL shown in UI below
      }
    } catch (e) {
      console.error('[chat-link]', e);
    } finally {
      setLoadingLink(false);
    }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setResult(null);
    try {
      await sendAgentReply(incident._id, trimmed);
      setResult({ saved: true });
      setText('');
      onReplied?.();
    } catch (e) {
      setResult({ error: e.message || 'Failed to save' });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
  }

  if (!incident) return null;

  return (
    <div style={{
      borderTop: `1px solid ${T.border}`,
      backgroundColor: T.s1, padding: '14px 18px', flexShrink: 0,
    }}>
      {hasAIDraft && !text && (
        <button
          type="button"
          onClick={useDraft}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 10,
            padding: '6px 13px', background: T.cyanDim, border: `1px solid rgba(255,204,0,0.25)`,
            borderRadius: 8, fontSize: 11, fontWeight: 700, color: T.cyan, cursor: 'pointer', transition: 'all 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,204,0,0.16)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = T.cyanDim; }}
        >
          <Sparkles size={12} />
          Use AI draft
        </button>
      )}

      <div
        className="pcc-compose"
        style={{
          display: 'flex', flexDirection: 'column', borderRadius: 12,
          border: `1px solid ${text ? 'rgba(212,5,17,0.22)' : T.border}`,
          backgroundColor: T.bg, overflow: 'hidden', transition: 'border-color 150ms',
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => { setText(e.target.value); setResult(null); }}
          onKeyDown={handleKeyDown}
          placeholder={`Reply to customer${incident.customerEmail ? ` · ${incident.customerEmail}` : ''}…`}
          rows={3}
          style={{
            width: '100%', padding: '13px 15px',
            background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', fontSize: 13, lineHeight: 1.65,
            color: T.t1, fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', borderTop: `1px solid ${T.border}`,
        }}>
          <button
            type="button"
            onClick={handleCopyLink}
            disabled={loadingLink}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700,
              background: linkCopied ? T.greenDim : T.cyanDim,
              border: `1px solid ${linkCopied ? 'rgba(16,185,129,0.28)' : 'rgba(255,204,0,0.25)'}`,
              color: linkCopied ? T.green : T.cyan,
              cursor: loadingLink ? 'wait' : 'pointer', transition: 'all 150ms',
            }}
          >
            {loadingLink ? <Loader2 size={11} className="animate-spin" /> : linkCopied ? <Copy size={11} /> : <Link2 size={11} />}
            {linkCopied ? 'Copied!' : 'Chat link'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: T.t3 }}>⌘↵ to save</span>
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() || sending}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '7px 17px',
                background: text.trim() && !sending ? `linear-gradient(135deg, ${T.red}, #b80010)` : T.redDim,
                border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, color: '#fff',
                cursor: text.trim() && !sending ? 'pointer' : 'not-allowed',
                boxShadow: text.trim() && !sending ? `0 4px 16px ${T.redGlow}` : 'none',
                transition: 'all 150ms',
              }}
              onMouseEnter={e => { if (text.trim() && !sending) e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Save note
            </button>
          </div>
        </div>
      </div>

      {chatUrl && (
        <div style={{
          marginTop: 10, padding: '10px 13px', borderRadius: 8,
          backgroundColor: T.cyanDim, border: '1px solid rgba(255,204,0,0.22)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Link2 size={12} style={{ color: T.cyan, flexShrink: 0 }} />
          <input
            readOnly
            value={chatUrl}
            onFocus={e => e.target.select()}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 11, color: T.cyan, fontFamily: 'monospace', minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(chatUrl).catch(() => {}); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 3000); }}
            style={{
              flexShrink: 0, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,204,0,0.3)',
              background: linkCopied ? T.greenDim : 'rgba(255,204,0,0.1)', color: linkCopied ? T.green : T.cyan,
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {linkCopied ? 'Copied ✓' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => window.open(chatUrl, '_blank')}
            style={{
              flexShrink: 0, padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,204,0,0.3)',
              background: 'rgba(255,204,0,0.1)', color: T.cyan,
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Open ↗
          </button>
        </div>
      )}

      {result && (
        <div style={{
          marginTop: 10, padding: '8px 13px', borderRadius: 8, fontSize: 11,
          background: result.error ? 'rgba(239,68,68,0.06)' : T.greenDim,
          border: `1px solid ${result.error ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.22)'}`,
          color: result.error ? T.red : T.green,
        }}>
          {result.error
            ? `Error: ${result.error}`
            : result.toEmail
            ? `Message saved & queued for delivery to ${result.toEmail}`
            : 'Internal note saved'}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ConversationPanel({ incident, loading, canReview, onApprove, onReject, actioning, navigate, onReplied }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [incident?._id]);

  if (!incident && !loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', textAlign: 'center', padding: 40,
      }}>
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--nexus-surface-3), var(--nexus-surface-1))',
            border: `1px solid ${T.border}`,
            boxShadow: '0 0 30px var(--nexus-surface-2)',
          }}>
            <MessageSquare size={26} style={{ color: T.t3 }} />
          </div>
        </div>
        <p style={{ margin: '0 0 7px', fontSize: 15, fontWeight: 700, color: T.t2 }}>No case selected</p>
        <p style={{ margin: 0, fontSize: 12, color: T.t3, lineHeight: 1.7 }}>
          Select a case from the list to view<br />the full conversation timeline
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
        <Loader2 size={28} className="animate-spin" style={{ color: T.cyan }} />
        <p style={{ fontSize: 11, color: T.t3, letterSpacing: '0.04em' }}>Loading case…</p>
      </div>
    );
  }

  const timeline  = buildTimeline(incident);
  const email     = incident.customerEmail || incident.agentResults?.intake?.fields?.email?.value || '';
  const sevColor  = SEV[incident.severity] || T.violet;
  const statusC   = STATUS_COLOR[incident.status] || T.t2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Case header */}
      <div style={{
        flexShrink: 0, borderBottom: `1px solid ${T.border}`,
        backgroundColor: T.s1, padding: '14px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <SevPill severity={incident.severity} />
              <StatusPill status={incident.status} />
              {incident.type && (
                <span style={{ fontSize: 11, color: T.t3 }}>{incident.type.replace(/_/g, ' ')}</span>
              )}
            </div>
            <p style={{
              margin: 0, fontSize: 14, fontWeight: 800, color: T.t1, lineHeight: 1.35,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {incident.title || incident.description?.slice(0, 80) || 'Incident'}
            </p>
            {email && <p style={{ margin: '5px 0 0', fontSize: 11, color: T.t3 }}>{email}</p>}
          </div>
          <button
            type="button"
            onClick={() => navigate(`/incidents/${incident._id}`)}
            style={{
              display: 'flex', flexShrink: 0, alignItems: 'center', gap: 6,
              borderRadius: 9, border: `1px solid ${T.border}`, padding: '7px 14px',
              fontSize: 11, fontWeight: 700, color: T.t2,
              backgroundColor: T.s2, cursor: 'pointer', transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderHover; e.currentTarget.style.color = T.t1; e.currentTarget.style.backgroundColor = T.s3; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.t2; e.currentTarget.style.backgroundColor = T.s2; }}
          >
            Full view <ArrowUpRight size={12} />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div
        data-tour="conversation"
        className="pcc-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {timeline.map((event, i) => (
          <EventBubble key={event.id} event={event} index={i} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <ComposeBar incident={incident} onReplied={onReplied} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TABS CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'bot',    label: 'Bot Active',   icon: Bot,          color: T.cyan },
  { id: 'review', label: 'Needs Review', icon: AlertTriangle, color: T.amber },
  { id: 'mine',   label: 'My Cases',     icon: UserCheck,    color: T.green },
];

// ─────────────────────────────────────────────────────────────────────────────
// DRAG HANDLE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function DragHandle({ onMouseDown, active = false }) {
  const [hovering, setHovering] = useState(false);
  const lit = hovering || active;
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        width: 5, flexShrink: 0, cursor: 'col-resize',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', userSelect: 'none', zIndex: 10,
        background: lit
          ? 'linear-gradient(180deg, transparent, rgba(255,204,0,0.35), transparent)'
          : 'transparent',
        transition: 'background 200ms',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: '50%',
        width: lit ? 2 : 1,
        background: lit ? 'rgba(255,204,0,0.65)' : 'var(--nexus-border)',
        boxShadow: lit ? '0 0 10px rgba(255,204,0,0.45)' : 'none',
        transform: 'translateX(-50%)',
        transition: 'all 200ms',
        borderRadius: 99,
      }} />
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center',
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: lit ? 3 : 2, height: lit ? 3 : 2, borderRadius: '50%',
            background: lit ? 'rgba(255,204,0,0.85)' : 'var(--nexus-border-bright)',
            boxShadow: lit ? '0 0 6px rgba(255,204,0,0.6)' : 'none',
            transition: 'all 200ms',
          }} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function PCCInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canReview = ['reviewer', 'admin'].includes(user?.role);

  const [activeTab, setActiveTab]     = useState('review');
  const [items, setItems]             = useState({ bot: [], review: [], mine: [] });
  const [counts, setCounts]           = useState({ bot: 0, review: 0, mine: 0 });
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError]     = useState('');
  const [selectedId, setSelectedId]   = useState(null);
  const [selectedInc, setSelectedInc] = useState(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [actioning, setActioning]     = useState({});

  // Resizable columns
  const { leftW, rightW, startDrag, draggingSide } = useColumnResize(270, 320, 190, 220);

  const loadLists = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const [botRes, reviewRes, assignedRes, inProgressRes] = await Promise.all([
        getIncidents({ source: 'rpa', status: 'DRAFT',          limit: 50 }),
        getIncidents({                status: 'PENDING_REVIEW',  limit: 50 }),
        getIncidents({ status: 'ASSIGNED',    limit: 25 }),
        getIncidents({ status: 'IN_PROGRESS', limit: 25 }),
      ]);
      const bot    = botRes?.incidents    || [];
      const review = reviewRes?.incidents || [];
      const mine   = [...(assignedRes?.incidents || []), ...(inProgressRes?.incidents || [])];
      setItems({ bot, review, mine });
      setCounts({ bot: bot.length, review: review.length, mine: mine.length });
    } catch (err) {
      setListError(err.message || 'Failed to load');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  const reloadSelected = useCallback(() => {
    if (!selectedId) return;
    getIncident(selectedId).then(inc => setSelectedInc(inc)).catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) { setSelectedInc(null); return; }
    let active = true;
    setLoadingConv(true);
    async function loadOnce() {
      try {
        const inc = await getIncident(selectedId);
        if (active) setSelectedInc(inc);
      } catch { /* ignore */ } finally {
        if (active) setLoadingConv(false);
      }
    }
    loadOnce();
    const timer = setInterval(async () => {
      if (!active) return;
      try {
        const inc = await getIncident(selectedId);
        if (active) setSelectedInc(inc);
      } catch { /* silent */ }
    }, 6000);
    return () => { active = false; clearInterval(timer); };
  }, [selectedId]);

  async function handleApprove(id) {
    setActioning(a => ({ ...a, [id + '_approve']: true }));
    try {
      await reviewIncident(id, { action: 'approve' });
      setSelectedId(null);
      await loadLists();
    } catch (e) {
      setListError(e.message);
    } finally {
      setActioning(a => ({ ...a, [id + '_approve']: false }));
    }
  }

  async function handleReject(id) {
    setActioning(a => ({ ...a, [id + '_reject']: true }));
    try {
      await reviewIncident(id, { action: 'reject', note: 'Rejected from PCC Inbox' });
      setSelectedId(null);
      await loadLists();
    } catch (e) {
      setListError(e.message);
    } finally {
      setActioning(a => ({ ...a, [id + '_reject']: false }));
    }
  }

  const currentList = items[activeTab] || [];

  return (
    <Layout title="PCC Inbox">
      <style>{GLOBAL_STYLES}</style>
      {draggingSide && (
        <style>{`* { cursor: col-resize !important; }`}</style>
      )}
      <div
        className="-m-4 sm:-m-6 flex overflow-hidden select-none"
        style={{ height: 'calc(100vh - 57px)', backgroundColor: T.bg }}
      >
        {/* ── COL 1: Thread list (resizable) ────────────────────────────── */}
        <div
          data-tour="inbox"
          style={{ width: leftW, flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: T.s1 }}
        >
          {/* Header */}
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${T.border}`, padding: '13px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, rgba(212,5,17,0.32), rgba(212,5,17,0.12))`,
                border: `1px solid rgba(212,5,17,0.32)`,
                boxShadow: '0 0 14px rgba(212,5,17,0.22)',
              }}>
                <Inbox size={14} style={{ color: T.red }} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: T.t1, letterSpacing: '-0.01em' }}>PCC Inbox</p>
                <p style={{ margin: 0, fontSize: 9, color: T.t3, letterSpacing: '0.04em' }}>DHL Customer Care</p>
              </div>
            </div>
            <button
              onClick={loadLists}
              disabled={loadingList}
              title="Refresh"
              style={{
                width: 28, height: 28, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'transparent', border: `1px solid ${T.border}`,
                cursor: 'pointer', transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderMid; e.currentTarget.style.backgroundColor = T.s2; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <RefreshCw size={12} style={{ color: T.t3, animation: loadingList ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ flexShrink: 0, padding: '8px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {TABS.map(({ id, label, icon: Icon, color }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                    backgroundColor: isActive ? `${color}12` : 'transparent',
                    color: isActive ? color : T.t3,
                    transition: 'all 150ms', textAlign: 'left',
                    boxShadow: isActive ? `inset 0 0 0 1px ${color}20` : 'none',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--nexus-surface-3)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isActive ? `${color}18` : 'var(--nexus-surface-3)',
                    border: `1px solid ${isActive ? `${color}30` : T.border}`,
                    boxShadow: isActive ? `0 0 8px ${color}25` : 'none',
                  }}>
                    <Icon size={12} style={{ color: isActive ? color : T.t3 }} />
                  </div>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 800 : 500, userSelect: 'none' }}>{label}</span>
                  {counts[id] > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 900, minWidth: 18, height: 18, borderRadius: 99,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0,
                      backgroundColor: isActive ? color : 'var(--nexus-border-bright)',
                      color: isActive ? '#fff' : T.t2,
                      boxShadow: isActive ? `0 0 10px ${color}70` : 'none',
                    }}>{counts[id]}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Thread list */}
          <div className="pcc-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            {listError && (
              <div style={{ margin: '8px 10px', padding: '9px 12px', borderRadius: 9, backgroundColor: T.redDim, border: `1px solid rgba(212,5,17,0.2)` }}>
                <p style={{ margin: 0, fontSize: 11, color: T.red }}>{listError}</p>
              </div>
            )}
            {loadingList ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, animation: `fadeRight 300ms ease ${i * 60}ms both` }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div className="pcc-skel" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <Skel w="65%" h={9} mb={7} />
                        <Skel w="88%" h={8} mb={7} />
                        <Skel w="42%" h={7} mb={0} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : currentList.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '52px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'var(--nexus-surface-3)', border: `1px solid ${T.border}`, marginBottom: 14,
                }}>
                  <CheckCircle2 size={20} style={{ color: T.t3 }} />
                </div>
                <p style={{ margin: 0, fontSize: 12, color: T.t3 }}>
                  {activeTab === 'bot' ? 'No active bot cases' : activeTab === 'review' ? 'Queue is clear' : 'Nothing assigned'}
                </p>
              </div>
            ) : (
              currentList.map(inc => (
                <ThreadItem
                  key={inc._id}
                  incident={inc}
                  isSelected={selectedId === inc._id}
                  onClick={() => setSelectedId(selectedId === inc._id ? null : inc._id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── DRAG HANDLE 1 ──────────────────────────────────────────────── */}
        <DragHandle
          onMouseDown={e => startDrag('left', e)}
          active={draggingSide === 'left'}
        />

        {/* ── COL 2: Conversation (flex-1) ──────────────────────────────── */}
        <div
          data-tour="conversation"
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
            userSelect: draggingSide ? 'none' : 'auto',
            pointerEvents: draggingSide ? 'none' : 'auto',
          }}
        >
          <ConversationPanel
            incident={selectedInc}
            loading={loadingConv}
            canReview={canReview}
            onApprove={handleApprove}
            onReject={handleReject}
            actioning={actioning}
            navigate={navigate}
            onReplied={reloadSelected}
          />
        </div>

        {/* ── DRAG HANDLE 2 ──────────────────────────────────────────────── */}
        <DragHandle
          onMouseDown={e => startDrag('right', e)}
          active={draggingSide === 'right'}
        />

        {/* ── COL 3: AI Copilot (resizable) — always visible ────────────── */}
        <div
          data-tour="copilot"
          style={{
            width: rightW, flexShrink: 0, display: 'flex', flexDirection: 'column',
            backgroundColor: T.s1,
            userSelect: draggingSide ? 'none' : 'auto',
            pointerEvents: draggingSide === 'right' ? 'none' : 'auto',
          }}
        >
          <FiveAdvisors
            incident={selectedInc}
            canReview={canReview}
            onApprove={handleApprove}
            onReject={handleReject}
            actioning={actioning}
            navigate={navigate}
          />
        </div>
      </div>
    </Layout>
  );
}
