import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle, Copy, Loader2, Package, PhoneCall,
  SendHorizontal, Shield, ThumbsDown, ThumbsUp, UserCheck, AlertTriangle,
} from 'lucide-react';
import { useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { getChatContext, getChatStatus, getChatThread, sendChatMessage, submitSatisfaction } from '../lib/api';

const POLL_INTERVAL_MS = 4000;
const STATUS_POLL_MS   = 30000;

// ── helpers ──────────────────────────────────────────────────────────────────

function convertDbMsg(msg) {
  return {
    role: msg.role,
    content: msg.text,
    id: `${msg.ts}-${msg.role}-${msg.text?.slice(0, 8)}`,
    sentimentScore: msg.sentimentScore,
    sentimentLabel: msg.sentimentLabel,
  };
}

function buildWelcome(ctx) {
  const typeLabel = (ctx.type || 'incident').replace(/_/g, ' ');
  const caseRef   = (ctx.incidentId || '').slice(-8).toUpperCase();
  let msg = `Hi! I can see your ${typeLabel} report`;
  if (ctx.location) msg += ` at ${ctx.location}`;
  msg += ` (Case #${caseRef})`;
  if (ctx.awbNumber) msg += ` — AWB ${ctx.awbNumber}`;
  msg += '.';

  if (ctx.severity === 'Critical' || ctx.severity === 'High') {
    msg += ` Your case is flagged ${ctx.severity} priority — our senior operations team has been notified.`;
  } else if (ctx.resolutionSteps?.length > 0) {
    msg += ` Our team has already prepared ${ctx.resolutionSteps.length} resolution step${ctx.resolutionSteps.length > 1 ? 's' : ''} for your case.`;
  } else {
    msg += ' Our operations team is actively reviewing your report.';
  }

  msg += ' What would you like to know?';
  return msg;
}

function quickSuggestions(ctx) {
  const list = [];
  if (ctx.severity === 'Critical' || ctx.severity === 'High') {
    list.push('This is urgent — what\'s being done right now?');
  }
  if (ctx.awbNumber) {
    list.push(`Where is my parcel ${ctx.awbNumber}?`);
  } else {
    list.push('What\'s the current status of my case?');
  }
  list.push('What are the next steps?');
  list.push('When will I get an update?');
  list.push('I\'d like to speak with a human agent');
  return list.slice(0, 4);
}

// ── hooks ─────────────────────────────────────────────────────────────────────

function useSlaCountdown(deadlineAt) {
  const [display, setDisplay] = useState(null);

  useEffect(() => {
    if (!deadlineAt) return;
    const deadline = new Date(deadlineAt).getTime();

    function tick() {
      const diff = deadline - Date.now();
      if (diff <= 0) { setDisplay({ breached: true, text: 'SLA BREACHED' }); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setDisplay({ breached: false, text: h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining` });
    }

    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [deadlineAt]);

  return display;
}

function useStatusPoller(token) {
  const [live, setLive] = useState(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    async function poll() {
      try {
        const data = await getChatStatus(token);
        if (active) setLive(data);
      } catch { /* silent — status is non-critical */ }
    }

    poll();
    const t = setInterval(poll, STATUS_POLL_MS);
    return () => { active = false; clearInterval(t); };
  }, [token]);

  return live;
}

// ── sub-components ────────────────────────────────────────────────────────────

function SeverityPill({ severity }) {
  if (!severity) return null;
  const map = {
    Critical: 'bg-red-100 text-red-700 border-red-200',
    High:     'bg-orange-100 text-orange-700 border-orange-200',
    Medium:   'bg-amber-100 text-amber-700 border-amber-200',
    Low:      'bg-green-100 text-green-700 border-green-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${map[severity] || map.Medium}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {severity}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = String(status || 'under_review').toUpperCase();
  const isGood = s === 'RESOLVED' || s === 'CLOSED';
  const isPending = s === 'PENDING_REVIEW' || s === 'UNDER_REVIEW';
  const cls = isGood
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : isPending
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-[#F3D2D5] bg-[#FFF2F3] text-[#D40511]';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${cls}`}>
      {isGood && <CheckCircle size={11} className="mr-1" />}
      {s.replace(/_/g, ' ')}
    </span>
  );
}

function CaseCard({ context, live, agentOnline }) {
  const status     = live?.status     || context.status;
  const severity   = live?.severity   || context.severity;
  const awbNumber  = live?.awbNumber  || context.awbNumber;
  const sla        = useSlaCountdown(live?.slaDeadlineAt);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyAwb() {
    if (!awbNumber) return;
    navigator.clipboard.writeText(awbNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const typeLabel = (context.type || 'Incident').replace(/_/g, ' ');

  return (
    <div className="overflow-hidden rounded-2xl border border-[#F3D2D5] bg-[var(--nexus-surface-2)] shadow-[0_8px_32px_rgba(0,0,0,0.07)]">
      {/* Red brand bar */}
      <div className="flex items-center justify-between bg-[#D40511] px-5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
            <span className="text-[9px] font-black text-white">DHL</span>
          </div>
          <span className="text-xs font-semibold text-white/90 tracking-wide">Express Support</span>
        </div>
        <div className="flex items-center gap-3">
          {agentOnline && (
            <span className="flex items-center gap-1 text-white/80 text-[11px]">
              <UserCheck size={12} />
              Agent connected
            </span>
          )}
          <span className="flex items-center gap-1 text-white/70 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* Case info */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
              {typeLabel}
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-[var(--nexus-text-1)]">
              Case #{(context.incidentId || '').slice(-8).toUpperCase()}
            </h1>
            {context.location && (
              <p className="mt-0.5 text-sm text-[var(--nexus-text-2)]">{context.location}</p>
            )}
          </div>
          <StatusBadge status={status} />
        </div>

        {/* AWB */}
        {awbNumber && (
          <button
            onClick={copyAwb}
            className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-1)] px-3 py-2 text-left transition-colors hover:bg-[#FFF2F3] hover:border-[#F3D2D5] group"
          >
            <Package size={14} className="text-[var(--nexus-text-3)] group-hover:text-[#D40511]" />
            <span className="font-mono text-xs font-medium text-[var(--nexus-text-2)]">AWB {awbNumber}</span>
            <Copy size={11} className={`ml-auto ${copied ? 'text-emerald-500' : 'text-[var(--nexus-text-3)] group-hover:text-[#D40511]'}`} />
            {copied && <span className="text-[10px] text-emerald-600 font-medium">Copied!</span>}
          </button>
        )}

        {/* Severity + SLA */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SeverityPill severity={severity} />
          {sla && (
            <span className={`flex items-center gap-1 text-xs font-medium ${sla.breached ? 'text-red-600' : 'text-amber-600'}`}>
              {sla.breached ? <AlertTriangle size={12} /> : null}
              {sla.text}
            </span>
          )}
        </div>

        {/* Resolution steps toggle */}
        {context.resolutionSteps?.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setOpen(v => !v)}
              className="flex items-center gap-1 text-xs font-semibold text-[#D40511] hover:underline"
            >
              <Shield size={12} />
              {open ? 'Hide' : 'View'} resolution steps ({context.resolutionSteps.length})
            </button>
            {open && (
              <ol className="mt-2 space-y-1.5 pl-1">
                {context.resolutionSteps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs text-[var(--nexus-text-2)]">
                    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#D40511] text-[9px] font-bold text-white">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickReplies({ context, onSelect }) {
  const suggestions = useMemo(() => quickSuggestions(context), [context]);
  return (
    <div className="px-4 pb-3 pt-1">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
        Quick questions
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="rounded-full border border-[#F3D2D5] bg-[var(--nexus-surface-2)] px-3 py-1.5 text-xs font-medium text-[#D40511] shadow-sm transition-all hover:bg-[#D40511] hover:text-white hover:shadow-md"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function sentimentBorder(score) {
  if (score == null) return '';
  if (score >= 0.6) return 'border-l-2 border-l-emerald-400';
  if (score >= 0.35) return 'border-l-2 border-l-amber-400';
  return 'border-l-2 border-l-red-400';
}

function MessageBubble({ role, content, sentimentScore, onFeedback }) {
  const isCustomer = role === 'customer';
  const isAgent    = role === 'agent';
  const [feedback, setFeedback] = useState(null);

  const label = isCustomer ? 'You' : isAgent ? 'DHL Support Agent' : 'DHL AI Assistant';

  const avatarClass = isAgent
    ? 'bg-blue-100 text-blue-600'
    : 'bg-[#FFF2F3] text-[#D40511]';

  // Bubble backgrounds are always light (pink/blue/red) regardless of theme,
  // so hardcode dark text instead of inheriting the theme variable —
  // otherwise the AI message text disappears in dark mode.
  const bubbleClass = isCustomer
    ? 'rounded-tr-sm bg-[#D40511] text-white shadow-[0_4px_12px_rgba(212,5,17,0.25)]'
    : isAgent
      ? 'rounded-tl-sm border border-blue-100 bg-blue-50 text-[#1A1A1A]'
      : 'rounded-tl-sm border border-[#F3D2D5] bg-[#FFF7F7] text-[#1A1A1A]';

  const sentBorder = !isCustomer ? sentimentBorder(sentimentScore) : '';

  const labelClass = isCustomer
    ? 'text-white/70'
    : isAgent
      ? 'text-blue-600'
      : 'text-[#D40511]';

  return (
    <div className={`flex items-end gap-2 ${isCustomer ? 'justify-end' : 'justify-start'}`}>
      {!isCustomer && (
        <div className={`mb-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${avatarClass}`}>
          {isAgent
            ? <UserCheck size={13} />
            : <span className="text-[8px] font-black">DHL</span>}
        </div>
      )}

      <div className="flex max-w-[78%] flex-col gap-1 sm:max-w-[70%]">
        <div className={`rounded-2xl px-4 py-3 ${bubbleClass} ${sentBorder}`}>
          <p className={`mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${labelClass}`}>
            {label}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
        </div>

        {/* Feedback buttons - only for AI messages */}
        {!isCustomer && !isAgent && onFeedback && (
          <div className="flex items-center gap-1 pl-1">
            <button
              onClick={() => { setFeedback('up'); onFeedback('up'); }}
              className={`rounded p-1 transition-colors ${feedback === 'up' ? 'text-emerald-600' : 'text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)]'}`}
            >
              <ThumbsUp size={12} />
            </button>
            <button
              onClick={() => { setFeedback('down'); onFeedback('down'); }}
              className={`rounded p-1 transition-colors ${feedback === 'down' ? 'text-red-500' : 'text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)]'}`}
            >
              <ThumbsDown size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF2F3]">
        <span className="text-[8px] font-black text-[#D40511]">DHL</span>
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-[#F3D2D5] bg-[#FFF7F7] px-4 py-3 shadow-sm">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D40511]">
          DHL AI Assistant
        </p>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-[#D40511]"
              style={{
                animation: 'chatBounce 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ title, description }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--nexus-bg)' }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#F3D2D5] bg-[var(--nexus-surface-2)] shadow-xl">
        <div className="bg-[#D40511] p-5 text-center">
          <span className="text-2xl font-black text-white">DHL</span>
        </div>
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF2F3]">
            <AlertTriangle size={24} className="text-[#D40511]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--nexus-text-1)]">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--nexus-text-2)]">{description}</p>
          <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-1)] px-4 py-3">
            <PhoneCall size={14} className="text-[var(--nexus-text-2)]" />
            <span className="text-sm font-semibold text-[var(--nexus-text-1)]">1300-888-DHL</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SatisfactionPrompt({ token, onSubmit }) {
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(satisfied) {
    setSubmitting(true);
    try {
      await submitSatisfaction(token, satisfied, comment || null);
      setResult(satisfied);
      setSubmitted(true);
      onSubmit?.(satisfied);
    } catch {
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle size={18} className="mt-0.5 flex-shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">
            {result ? 'Thank you for your feedback!' : 'We hear you.'}
          </p>
          <p className="text-xs text-emerald-700 mt-0.5">
            {result
              ? 'Your feedback helps us improve our service.'
              : 'A senior agent will review your case and reach out directly.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
      <p className="text-sm font-semibold text-amber-900 mb-2">
        Has your issue been resolved?
      </p>
      <p className="text-xs text-amber-700 mb-3">
        Your feedback helps us improve and ensures your case is fully handled.
      </p>
      {showComment && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Any additional feedback? (optional)"
          maxLength={500}
          className="mb-3 w-full rounded-lg border border-amber-200 bg-[var(--nexus-surface-2)] px-3 py-2 text-xs text-[var(--nexus-text-1)] placeholder:text-[var(--nexus-text-3)] focus:outline-none focus:ring-2 focus:ring-amber-300"
          rows={2}
        />
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleSubmit(true)}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
        >
          <ThumbsUp size={13} /> Yes, resolved
        </button>
        <button
          onClick={() => handleSubmit(false)}
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-600 active:scale-95 disabled:opacity-50"
        >
          <ThumbsDown size={13} /> No, still an issue
        </button>
        {!showComment && (
          <button
            onClick={() => setShowComment(true)}
            className="ml-auto text-xs text-amber-600 hover:text-amber-800 underline"
          >
            Add comment
          </button>
        )}
      </div>
    </div>
  );
}

function ResolvedBanner() {
  return (
    <div className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <CheckCircle size={18} className="mt-0.5 flex-shrink-0 text-emerald-600" />
      <div>
        <p className="text-sm font-semibold text-emerald-800">Case resolved!</p>
        <p className="text-xs text-emerald-700 mt-0.5">
          Your case has been marked as resolved. Our team will follow up shortly.
        </p>
      </div>
    </div>
  );
}

// ── inject bounce keyframes once ──────────────────────────────────────────────

let kfInjected = false;
function ensureKeyframes() {
  if (kfInjected) return;
  kfInjected = true;
  const s = document.createElement('style');
  s.textContent = `@keyframes chatBounce {
    0%,80%,100% { transform:translateY(0); opacity:0.4; }
    40%         { transform:translateY(-5px); opacity:1; }
  }`;
  document.head.appendChild(s);
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function CustomerChat() {
  ensureKeyframes();

  const { token } = useParams();
  const [context,    setContext]    = useState(null);
  const [messages,   setMessages]   = useState([]);
  const [draft,      setDraft]      = useState('');
  const [loading,    setLoading]    = useState(true);
  const [errorState, setErrorState] = useState(null);
  const [isSending,  setIsSending]  = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [satisfactionDone, setSatisfactionDone] = useState(false);
  const [wasEscalated, setWasEscalated] = useState(false);

  const scrollRef        = useRef(null);
  const dbThreadLenRef   = useRef(0);
  const isSendingRef     = useRef(false);
  const pollTimerRef     = useRef(null);
  const prevStatusRef    = useRef(null);

  const live = useStatusPoller(token);

  const isResolved = useMemo(() => {
    const s = (live?.status || '').toUpperCase();
    return s === 'RESOLVED' || s === 'CLOSED';
  }, [live]);

  const showResolvedBanner = useMemo(() => {
    if (!live?.status || !prevStatusRef.current) return false;
    const prev = prevStatusRef.current.toUpperCase();
    const curr = live.status.toUpperCase();
    return (curr === 'RESOLVED' || curr === 'CLOSED') && prev !== curr;
  }, [live]);

  useEffect(() => {
    if (live?.status) prevStatusRef.current = live.status;
  }, [live?.status]);

  const stopPolling  = () => { clearInterval(pollTimerRef.current); pollTimerRef.current = null; };
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(async () => {
      if (isSendingRef.current) return;
      try {
        const data   = await getChatThread(token);
        const thread = data.conversationThread || [];
        const newMsg = thread.slice(dbThreadLenRef.current);
        if (newMsg.length > 0) {
          dbThreadLenRef.current = thread.length;
          if (newMsg.some(m => m.role === 'agent')) setAgentOnline(true);
          setMessages(prev => [...prev, ...newMsg.map(convertDbMsg)]);
        }
      } catch { /* silent */ }
    }, POLL_INTERVAL_MS);
  }, [token]);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [ctx, threadData] = await Promise.all([
          getChatContext(token),
          getChatThread(token).catch(() => ({ conversationThread: [] })),
        ]);
        if (!active) return;
        setContext(ctx);
        const thread = threadData.conversationThread || [];
        dbThreadLenRef.current = thread.length;
        if (thread.some(m => m.role === 'agent')) setAgentOnline(true);

        const welcome = { role: 'ai', content: buildWelcome(ctx), id: 'welcome' };
        setMessages(thread.length > 0 ? thread.map(convertDbMsg) : [welcome]);
        if (thread.length > 1) setShowQuickReplies(false);
        startPolling();
      } catch (err) {
        if (!active) return;
        setErrorState(
          err.status === 401
            ? { title: 'Chat link expired', description: 'Your secure DHL support chat link is no longer active. Please contact our support team.' }
            : err.status === 400
              ? { title: 'Invalid chat link', description: 'The link you used is not valid. Please use the latest link from DHL support.' }
              : { title: 'Chat unavailable', description: 'We could not load your case right now. Please try again or call 1300-888-DHL.' }
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    init();
    return () => { active = false; stopPolling(); };
  }, [token, startPolling]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  async function handleSend(text) {
    const msg = (text ?? draft).trim();
    if (!msg || isSendingRef.current) return;

    isSendingRef.current = true;
    setIsSending(true);
    setDraft('');
    setShowQuickReplies(false);

    setMessages(prev => [...prev, { role: 'customer', content: msg, id: `cust-${Date.now()}` }]);

    try {
      const res = await sendChatMessage(token, msg);
      dbThreadLenRef.current += 2;
      setMessages(prev => [...prev, {
        role: 'ai',
        content: res.reply,
        id: `ai-${Date.now()}`,
        sentimentScore: res.sentiment?.score,
        sentimentLabel: res.sentiment?.label,
      }]);
      if (res.escalated) setWasEscalated(true);
    } catch {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: "I'm having trouble right now. Please call 1300-888-DHL for immediate assistance.",
        id: `err-${Date.now()}`,
      }]);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--nexus-bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D40511] shadow-lg">
            <span className="text-sm font-black text-white">DHL</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--nexus-text-2)]">
            <Loader2 className="animate-spin text-[#D40511]" size={16} />
            Loading your case...
          </div>
        </div>
      </div>
    );
  }

  if (errorState) return <ErrorState {...errorState} />;

  const resolvedDimmed = isResolved ? 'opacity-60 pointer-events-none' : '';

  return (
    <div className="min-h-screen text-[var(--nexus-text-1)]" style={{ background: 'var(--nexus-bg)' }}>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-5 sm:px-5">

        {/* Case card */}
        <CaseCard context={context} live={live} agentOnline={agentOnline} />

        {/* Escalation banner */}
        {wasEscalated && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
            <AlertTriangle size={16} className="shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Case escalated to human agent</p>
              <p className="text-xs text-amber-600">A DHL support agent has been notified and will join this conversation shortly.</p>
            </div>
          </div>
        )}

        {/* Chat window */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[#F3D2D5] bg-[var(--nexus-surface-2)] shadow-[0_8px_32px_rgba(0,0,0,0.07)]">

          {/* Resolved banner + satisfaction prompt */}
          {isResolved && (
            <div className="pt-3">
              {!satisfactionDone
                ? <SatisfactionPrompt token={token} onSubmit={() => setSatisfactionDone(true)} />
                : <ResolvedBanner />
              }
            </div>
          )}

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-5"
            style={{ height: 'calc(100vh - 380px)', minHeight: 300 }}
          >
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                sentimentScore={m.sentimentScore}
                onFeedback={m.role === 'ai' ? () => {} : null}
              />
            ))}
            {isSending && <TypingIndicator />}
          </div>

          {/* Quick replies — shown only before first customer message */}
          {showQuickReplies && !isSending && (
            <QuickReplies context={context} onSelect={(s) => handleSend(s)} />
          )}

          {/* Divider */}
          <div className="border-t border-[#F3D2D5]" />

          {/* Input area */}
          <div className={`bg-[var(--nexus-surface-2)] px-4 py-4 sm:px-5 ${resolvedDimmed}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={isResolved ? 'This case has been resolved.' : 'Type your message…'}
                className="min-h-[80px] resize-none border-[#F3D2D5] bg-[var(--nexus-surface-1)] text-[var(--nexus-text-1)] placeholder:text-[var(--nexus-text-3)] focus-visible:ring-[#D40511]/30"
                disabled={isSending || isResolved}
              />
              <Button
                onClick={() => handleSend()}
                disabled={isSending || !draft.trim() || isResolved}
                className="h-11 min-w-[110px] rounded-xl bg-[#D40511] text-white shadow-md hover:bg-[#B6040E] hover:shadow-lg active:scale-95"
              >
                {isSending
                  ? <Loader2 className="animate-spin" size={16} />
                  : <><span>Send</span><SendHorizontal className="ml-2" size={15} /></>
                }
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--nexus-text-3)]">
              For urgent matters call <span className="font-semibold text-[var(--nexus-text-2)]">1300-888-DHL</span> · Secure link expires in 72 hours
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
