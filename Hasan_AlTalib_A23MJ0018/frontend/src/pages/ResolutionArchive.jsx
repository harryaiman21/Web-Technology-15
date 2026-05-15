import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BookOpen, Bot, Brain, CheckCircle2,
  CheckSquare, ChevronRight, Clock, Cpu, Database, Filter,
  Layers, Mail, RefreshCw, Search, Sparkles, Square, Tag, Trash2,
  TrendingUp, User, X, Zap,
} from 'lucide-react';
import Layout from '../components/Layout';
import {
  batchTrain, bulkQueueTraining, createSop, dequeueTraining, deleteSop,
  embedResolution, getKbHealth, getResolutionModelInfo, getResolutionStats,
  getResolutions, getSopProposals, getSops, queueTraining, searchKb, updateSop,
} from '../lib/api';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        'var(--nexus-bg)',
  surface:   'var(--nexus-surface-1)',
  surfaceHi: 'var(--nexus-surface-2)',
  border:    'var(--nexus-border)',
  bot:       '#0EA5E9',
  human:     '#F59E0B',
  ml:        '#FF8C00',
  green:     '#10B981',
  red:       '#D40511',
  muted:     'var(--nexus-text-3)',
};

const SEV_COLOR  = { Critical: '#D40511', High: '#F59E0B', Medium: '#FF8C00', Low: '#10B981' };
const TYPE_LABEL = {
  late_delivery: 'Late Delivery', damaged_parcel: 'Damaged Parcel',
  missing_parcel: 'Missing Parcel', address_error: 'Address Error',
  system_error: 'System Error', wrong_item: 'Wrong Item', other: 'Other',
};
const OUTCOME_CFG = {
  satisfied:   { color: '#10B981', label: 'Satisfied',   dot: '★' },
  escalated:   { color: '#F59E0B', label: 'Escalated',   dot: '⚡' },
  no_response: { color: '#6B7280', label: 'No Response', dot: '—' },
};
const STATUS_CFG = {
  RESOLVED:       { color: '#10B981', label: 'Resolved'       },
  CLOSED:         { color: '#0EA5E9', label: 'Closed'         },
  IN_PROGRESS:    { color: '#F59E0B', label: 'In Progress'    },
  ASSIGNED:       { color: '#FF8C00', label: 'Assigned'       },
  UNDER_REVIEW:   { color: '#F59E0B', label: 'Under Review'   },
  PENDING_REVIEW: { color: '#6B7280', label: 'Pending Review' },
  BREACHED:       { color: '#D40511', label: 'SLA Breached'   },
};
const HUBS = ['Shah Alam Hub', 'KLIA Cargo', 'Subang Jaya Depot', 'Penang Hub', 'JB Distribution'];

function timeAgo(date) {
  if (!date) return '—';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Training Progress Modal ───────────────────────────────────────────────────

const TRAIN_STEPS = [
  { label: 'Loading training candidates',     icon: Database  },
  { label: 'Vectorizing incident descriptions', icon: Cpu     },
  { label: 'Fine-tuning classification model', icon: Brain    },
  { label: 'Updating knowledge base index',   icon: BookOpen  },
  { label: 'Running accuracy validation',     icon: TrendingUp },
];
const STEP_DELAYS = [700, 1600, 3300, 4900, 5900];

function TrainingProgressModal({ queueCount, trainDone, trainError, trainResult, onClose }) {
  const [animStep, setAnimStep] = useState(0);
  const [autoCloseIn, setAutoCloseIn] = useState(null);

  useEffect(() => {
    const timers = STEP_DELAYS.map((d, idx) =>
      setTimeout(() => setAnimStep(s => Math.max(s, idx + 1)), d)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // ── Snap animation to "all complete" the moment the API confirms handoff ──
  // Avoids the modal lingering on Step 4/5 for several seconds when the
  // subprocess kickoff was actually instant. Keeps steps + progress bar
  // coherent with the success panel below.
  useEffect(() => {
    if (trainDone) setAnimStep(TRAIN_STEPS.length);
  }, [trainDone]);

  const showSuccess  = trainDone && !trainError;
  const showError    = !!trainError && trainDone;
  const progressPct  = Math.min(100, Math.round((animStep / TRAIN_STEPS.length) * (trainDone ? 100 : 92)));

  // ── Auto-close countdown when handoff succeeds ─────────────────────────────
  // Modal flips to "Training Started" once the API has acked (subprocess kicked
  // off). We give the user 3s to read the message, then close. The actual ML
  // completion arrives later via a global toast (see ToastProvider).
  useEffect(() => {
    if (!showSuccess) { setAutoCloseIn(null); return; }
    setAutoCloseIn(3);
    const tick = setInterval(() => {
      setAutoCloseIn((n) => {
        if (n == null) return null;
        if (n <= 1) { clearInterval(tick); onClose?.(); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [showSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}>
      <div className="w-full max-w-[440px] rounded-2xl border overflow-hidden shadow-2xl"
           style={{ background: 'var(--nexus-surface-1)', borderColor: `${C.ml}35`,
                    boxShadow: `0 0 60px ${C.ml}20, 0 24px 64px rgba(0,0,0,0.8)` }}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b px-6 py-4"
             style={{ borderColor: `${C.ml}20`, background: `${C.ml}08` }}>
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full"
               style={{ background: `${C.ml}20` }}>
            {showSuccess
              ? <CheckCircle2 size={18} style={{ color: C.green }} />
              : showError
                ? <AlertTriangle size={18} style={{ color: C.red }} />
                : <Brain size={18} style={{ color: C.ml, animation: 'spin 2.5s linear infinite' }} />}
            {!showSuccess && !showError && (
              <span className="absolute inset-0 rounded-full animate-ping opacity-20"
                    style={{ background: C.ml }} />
            )}
          </div>
          <div>
            <p className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--nexus-text-1)' }}>
              {showSuccess ? 'Training Handoff Complete' : 'Model Training Pipeline'}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
              {queueCount} candidate{queueCount !== 1 ? 's' : ''} · LightGBM real-world feedback loop
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 space-y-3">
          {TRAIN_STEPS.map((step, idx) => {
            const isComplete = idx < animStep || (showSuccess);
            const isActive   = idx === animStep && !trainDone;
            const StepIcon   = step.icon;
            return (
              <div key={idx} className="flex items-center gap-3">
                <div className="relative flex h-7 w-7 items-center justify-center rounded-full shrink-0 transition-all duration-500"
                     style={{
                       background: isComplete ? `${C.green}20`
                                 : isActive   ? `${C.ml}22`
                                 : 'var(--nexus-surface-2)',
                       boxShadow: isActive ? `0 0 14px ${C.ml}40` : 'none',
                     }}>
                  {isComplete
                    ? <CheckCircle2 size={13} style={{ color: C.green }} />
                    : <StepIcon size={13} style={{ color: isActive ? C.ml : 'var(--nexus-text-3)' }} />}
                  {isActive && (
                    <span className="absolute inset-0 rounded-full animate-ping opacity-25"
                          style={{ background: C.ml }} />
                  )}
                </div>

                <span className="flex-1 text-[12px] transition-colors duration-400"
                      style={{ color: isComplete ? 'var(--nexus-text-3)' : isActive ? 'var(--nexus-text-1)' : 'var(--nexus-text-3)' }}>
                  {step.label}
                </span>

                {isActive && (
                  <RefreshCw size={11} className="shrink-0"
                             style={{ color: C.ml, animation: 'spin 1s linear infinite' }} />
                )}
                {isComplete && (
                  <span className="text-[10px] shrink-0" style={{ color: C.green }}>✓</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="px-6 pb-4">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--nexus-surface-2)' }}>
            <div className="h-full rounded-full transition-all duration-500"
                 style={{
                   width: `${progressPct}%`,
                   background: showSuccess
                     ? `linear-gradient(90deg, ${C.green}, #34D399)`
                     : `linear-gradient(90deg, ${C.ml}, ${C.bot})`,
                 }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px]" style={{ color: C.muted }}>
              {showSuccess ? 'Subprocess kicked off' : showError ? 'Failed' : `Step ${Math.min(animStep + 1, TRAIN_STEPS.length)} of ${TRAIN_STEPS.length}`}
            </span>
            <span className="text-[10px] font-bold tabular-nums"
                  style={{ color: showSuccess ? C.green : C.ml, fontFamily: "'JetBrains Mono', monospace" }}>
              {progressPct}%
            </span>
          </div>
        </div>

        {/* Handoff success — subprocess kicked off, real training continues in bg */}
        {showSuccess && (
          <div className="mx-6 mb-6 rounded-xl border p-4 text-center"
               style={{ background: `${C.ml}08`, borderColor: `${C.ml}25` }}>
            <div className="flex justify-center mb-2">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full"
                   style={{ background: `${C.ml}20` }}>
                <Brain size={20} style={{ color: C.ml }} />
                <span className="absolute inset-0 rounded-full animate-ping opacity-25"
                      style={{ background: C.ml }} />
              </div>
            </div>
            <p className="text-[14px] font-bold mb-1" style={{ color: 'var(--nexus-text-1)' }}>
              Training Started
            </p>
            <p className="text-[11px] mb-1" style={{ color: 'var(--nexus-text-2)' }}>
              {(trainResult?.realRowsAdded ?? queueCount)} real-world sample{(trainResult?.realRowsAdded ?? queueCount) !== 1 ? 's' : ''} merged with synthetic baseline.
            </p>
            <p className="text-[11px] mb-4" style={{ color: C.muted }}>
              LightGBM classifier is retraining in the background.<br />
              You'll get a notification when the new model is saved.
            </p>
            <button
              onClick={onClose}
              className="rounded-xl px-6 py-2 text-[12px] font-bold transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${C.ml}, ${C.bot})`, color: '#1A1A1A' }}
            >
              {autoCloseIn != null ? `Close (${autoCloseIn})` : 'Close'}
            </button>
          </div>
        )}

        {showError && (
          <div className="mx-6 mb-6 rounded-xl border p-4"
               style={{ background: `${C.red}08`, borderColor: `${C.red}25` }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} style={{ color: C.red }} />
              <p className="text-[12px] font-semibold text-red-300">Training Failed</p>
            </div>
            <p className="text-[11px] text-red-400 mb-3">{trainError}</p>
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-1.5 text-[11px] font-semibold border transition-colors hover:text-[var(--nexus-text-1)]"
              style={{ borderColor: `${C.red}40`, color: '#F87171' }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bulk Action Bar ───────────────────────────────────────────────────────────

function BulkActionBar({ count, onQueueAll, onEmbedAll, onClear, queueing, embedding }) {
  const unqueuedCount = count; // shown from parent
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
         style={{ pointerEvents: 'auto' }}>
      <div className="flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-2xl"
           style={{
             background: 'var(--nexus-panel-solid)',
             borderColor: `${C.ml}40`,
             backdropFilter: 'blur(20px)',
             boxShadow: `0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px ${C.ml}20`,
           }}>
        {/* Selection count badge */}
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full"
               style={{ background: `${C.ml}25` }}>
            <CheckSquare size={12} style={{ color: C.ml }} />
          </div>
          <span className="text-[13px] font-bold tabular-nums"
                style={{ color: C.ml, fontFamily: "'JetBrains Mono', monospace" }}>
            {count}
          </span>
          <span className="text-[12px]" style={{ color: 'var(--nexus-text-2)' }}>selected</span>
        </div>

        <div className="h-4 w-px" style={{ background: 'var(--nexus-border)' }} />

        {/* Queue for Training */}
        <button
          onClick={onQueueAll}
          disabled={queueing || embedding}
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-bold transition-all disabled:opacity-50 hover:opacity-90"
          style={{ background: `${C.ml}22`, color: C.ml, border: `1px solid ${C.ml}35` }}
        >
          {queueing
            ? <><RefreshCw size={12} className="animate-spin" /> Queueing…</>
            : <><Layers size={12} /> Queue for Training</>}
        </button>

        {/* Embed to KB */}
        <button
          onClick={onEmbedAll}
          disabled={embedding || queueing}
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12px] font-bold transition-all disabled:opacity-50 hover:opacity-90"
          style={{ background: `${C.bot}18`, color: C.bot, border: `1px solid ${C.bot}30` }}
        >
          {embedding
            ? <><RefreshCw size={12} className="animate-spin" /> Embedding…</>
            : <><Database size={12} /> Embed to KB</>}
        </button>

        <div className="h-4 w-px" style={{ background: 'var(--nexus-border)' }} />

        {/* Clear */}
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-[11px] transition-colors hover:text-[var(--nexus-text-1)]"
          style={{ color: 'var(--nexus-text-3)' }}
        >
          <X size={12} /> Clear
        </button>
      </div>
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, Icon, pulse }) {
  return (
    <div className="relative rounded-xl border p-4 flex flex-col gap-2 overflow-hidden"
         style={{ background: C.surface, borderColor: C.border }}>
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: `radial-gradient(ellipse at 0% 0%, ${color}08 0%, transparent 70%)` }} />
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md"
             style={{ background: `${color}18` }}>
          <Icon size={12} style={{ color }} />
        </div>
        <span className="text-[10px] font-semibold tracking-[0.1em] uppercase" style={{ color: 'var(--nexus-text-3)' }}>{label}</span>
        {pulse && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full"
                style={{ background: color, animation: 'pulse 1.8s infinite' }} />
        )}
      </div>
      <span className="text-[2rem] font-bold leading-none tabular-nums"
            style={{ color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value ?? '—'}
      </span>
      {sub && <p className="text-[10px]" style={{ color: 'var(--nexus-text-3)' }}>{sub}</p>}
    </div>
  );
}

// ── Pipeline Flow ─────────────────────────────────────────────────────────────

function PipelineFlow({ stats, queueCount }) {
  const nodes = [
    { icon: Database,  color: C.bot,   label: 'Resolved Cases',  value: stats?.total ?? 0,              sub: 'in archive'      },
    { icon: Layers,    color: C.ml,    label: 'Training Queue',  value: queueCount ?? 0,                sub: 'candidates', pulse: true },
    { icon: Brain,     color: C.red,   label: 'Model Retrain',   value: stats?.avgConf ? `${stats.avgConf}%` : '—', sub: 'avg confidence' },
    { icon: Sparkles,  color: C.green, label: 'Improved AI',     value: stats?.satisfiedCount ?? 0,     sub: 'satisfied'       },
  ];
  return (
    <div className="rounded-xl border p-5 mb-4 relative overflow-hidden"
         style={{ background: C.surface, borderColor: C.border }}>
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(129,140,248,0.06) 0%, transparent 70%)' }} />
      <p className="text-[10px] font-semibold tracking-[0.1em] uppercase mb-4" style={{ color: 'var(--nexus-text-3)' }}>
        AI Feedback Loop · Every resolution improves the system
      </p>
      <div className="flex items-center gap-0">
        {nodes.map((n, idx) => (
          <div key={idx} className="flex items-center flex-1 min-w-0">
            <div className="flex-1 min-w-0 rounded-xl border p-3 text-center relative"
                 style={{ background: C.surfaceHi, borderColor: `${n.color}25` }}>
              <div className="flex justify-center mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full"
                     style={{ background: `${n.color}15`, boxShadow: `0 0 12px ${n.color}20` }}>
                  <n.icon size={14} style={{ color: n.color }} />
                </div>
              </div>
              <p className="text-[11px] font-semibold mb-0.5" style={{ color: 'var(--nexus-text-2)' }}>{n.label}</p>
              <p className="text-[1.4rem] font-bold tabular-nums leading-none"
                 style={{ color: n.color, fontFamily: "'JetBrains Mono', monospace" }}>
                {n.value}
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--nexus-text-3)' }}>{n.sub}</p>
              {n.pulse && (
                <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full"
                      style={{ background: n.color, animation: 'pulse 1.5s infinite' }} />
              )}
            </div>
            {idx < nodes.length - 1 && (
              <div className="flex items-center justify-center w-8 shrink-0">
                <div className="flex flex-col items-center gap-0.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-0.5 w-1.5 rounded-full"
                         style={{ background: `${nodes[idx].color}40` }} />
                  ))}
                  <ChevronRight size={10} style={{ color: nodes[idx].color, opacity: 0.5 }} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

function FilterBar({ filters, onChange, onClear }) {
  const hasActive = Object.values(filters).some(v => v && v !== '');
  return (
    <div className="rounded-xl border px-4 py-3 mb-4 flex flex-wrap items-center gap-2"
         style={{ background: C.surface, borderColor: C.border }}>
      <Filter size={13} className="shrink-0" style={{ color: 'var(--nexus-text-3)' }} />

      <select value={filters.hub} onChange={e => onChange('hub', e.target.value)}
              className="rounded-lg border px-2.5 py-1.5 text-[12px] appearance-none cursor-pointer"
              style={{ background: C.surfaceHi, borderColor: C.border, minWidth: 140, color: 'var(--nexus-text-2)' }}>
        <option value="">All Hubs</option>
        {HUBS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>

      <select value={filters.severity} onChange={e => onChange('severity', e.target.value)}
              className="rounded-lg border px-2.5 py-1.5 text-[12px] appearance-none cursor-pointer"
              style={{ background: C.surfaceHi, borderColor: C.border, minWidth: 110, color: 'var(--nexus-text-2)' }}>
        <option value="">All Severity</option>
        {['Critical', 'High', 'Medium', 'Low'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: C.border }}>
        {[['', 'All'], ['bot', 'Bot'], ['human', 'Human']].map(([val, lbl]) => (
          <button key={val} onClick={() => onChange('resolvedBy', val)}
                  className="px-3 py-1.5 text-[11px] font-semibold transition-all"
                  style={{
                    background: filters.resolvedBy === val
                      ? val === 'bot' ? `${C.bot}20` : val === 'human' ? `${C.human}20` : 'var(--nexus-surface-3)'
                      : C.surfaceHi,
                    color: filters.resolvedBy === val
                      ? val === 'bot' ? C.bot : val === 'human' ? C.human : 'var(--nexus-text-1)'
                      : 'var(--nexus-text-3)',
                  }}>
            {lbl}
          </button>
        ))}
      </div>

      <input type="date" value={filters.dateFrom} onChange={e => onChange('dateFrom', e.target.value)}
             className="rounded-lg border px-2.5 py-1.5 text-[12px] cursor-pointer"
             style={{ background: C.surfaceHi, borderColor: C.border, color: 'var(--nexus-text-2)' }} title="From date" />
      <span className="text-[11px]" style={{ color: 'var(--nexus-text-3)' }}>→</span>
      <input type="date" value={filters.dateTo} onChange={e => onChange('dateTo', e.target.value)}
             className="rounded-lg border px-2.5 py-1.5 text-[12px] cursor-pointer"
             style={{ background: C.surfaceHi, borderColor: C.border, color: 'var(--nexus-text-2)' }} title="To date" />

      <div className="flex-1 min-w-[160px] flex items-center gap-2 rounded-lg border px-3 py-1.5"
           style={{ background: C.surfaceHi, borderColor: C.border }}>
        <Search size={12} className="shrink-0" style={{ color: 'var(--nexus-text-3)' }} />
        <input type="text" placeholder="Search resolutions…" value={filters.search}
               onChange={e => onChange('search', e.target.value)}
               className="bg-transparent text-[12px] placeholder:text-[var(--nexus-text-3)] outline-none w-full"
               style={{ color: 'var(--nexus-text-2)' }} />
      </div>

      {hasActive && (
        <button onClick={onClear}
                className="flex items-center gap-1 text-[11px] transition-colors hover:text-[var(--nexus-text-1)]"
                style={{ color: 'var(--nexus-text-3)' }}>
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}

// ── SOP Builder Modal ─────────────────────────────────────────────────────────

function SopBuilderModal({ proposal, onClose, onSaved }) {
  const year     = new Date().getFullYear();
  const typeCode = (proposal.incidentType || '').replace(/_/g, '-').toUpperCase();

  const [code,    setCode]    = useState(proposal.existingSop?.code || `SOP-${typeCode}-${year}`);
  const [title,   setTitle]   = useState(
    proposal.existingSop?.title ||
    `${TYPE_LABEL[proposal.incidentType] || proposal.incidentType} — Resolution SOP`
  );
  const [steps,   setSteps]   = useState(
    proposal.existingSop?.steps?.join('\n') || [
      proposal.suggestion,
      'Confirm customer identity and incident reference number.',
      'Apply recovery action per severity tier (Critical ≤ 2h, High ≤ 4h).',
      'Send recovery email and capture follow-up outcome within 24h.',
      'Tag case for ML training if outcome is "satisfied".',
    ].join('\n')
  );
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const actionColor = proposal.action === 'update' ? C.bot : C.green;
  const actionLabel = proposal.action === 'update' ? 'UPDATE SOP' : 'CREATE SOP';

  async function handleSave() {
    const stepsArr = steps.split('\n').map(s => s.trim()).filter(Boolean);
    if (!code.trim() || !title.trim() || stepsArr.length === 0) return;
    setSaving(true);
    setSaveErr('');
    try {
      if (proposal.action === 'update' && proposal.existingSop?.code) {
        await updateSop(proposal.existingSop.code, { title: title.trim(), steps: stepsArr });
      } else {
        await createSop({
          code: code.trim().toUpperCase(),
          title: title.trim(),
          incidentType: proposal.incidentType,
          steps: stepsArr,
          keywords: [],
        });
      }
      setSaved(true);
      onSaved?.();
      setTimeout(onClose, 1800);
    } catch (err) {
      setSaveErr(err?.response?.data?.error || err.message || 'Failed to save SOP.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-[560px] rounded-2xl border shadow-2xl overflow-hidden pointer-events-auto"
             style={{ background: 'var(--nexus-surface-1)', borderColor: `${actionColor}30`,
                      boxShadow: `0 0 60px ${actionColor}15, 0 24px 64px rgba(0,0,0,0.8)` }}>

          {/* Header */}
          <div className="flex items-center gap-3 border-b px-6 py-4"
               style={{ borderColor: `${actionColor}20`, background: `${actionColor}08` }}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg"
                 style={{ background: `${actionColor}20` }}>
              <BookOpen size={15} style={{ color: actionColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-bold truncate" style={{ color: 'var(--nexus-text-1)' }}>
                  {TYPE_LABEL[proposal.incidentType] || proposal.incidentType}
                </p>
                <span className="rounded px-2 py-0.5 text-[9px] font-bold uppercase shrink-0"
                      style={{ background: `${actionColor}20`, color: actionColor }}>
                  {actionLabel}
                </span>
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                {proposal.sampleCount} resolutions · {proposal.avgConfidence}% avg confidence
              </p>
            </div>
            <button onClick={onClose}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border transition-colors shrink-0 hover:text-[var(--nexus-text-1)]"
                    style={{ borderColor: C.border, color: 'var(--nexus-text-3)' }}>
              <X size={13} />
            </button>
          </div>

          {/* Form */}
          <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] mb-1.5" style={{ color: C.muted }}>
                  SOP Code
                </label>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  disabled={proposal.action === 'update'}
                  className="w-full rounded-lg border px-3 py-2 text-[12px] outline-none transition-colors disabled:opacity-50"
                  style={{ background: C.surfaceHi, borderColor: C.border, color: 'var(--nexus-text-2)',
                           fontFamily: "'JetBrains Mono', monospace" }}
                  onFocus={e => { e.target.style.borderColor = `${actionColor}40`; }}
                  onBlur={e => { e.target.style.borderColor = C.border; }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] mb-1.5" style={{ color: C.muted }}>
                  Incident Type
                </label>
                <div className="flex h-9 items-center rounded-lg border px-3 text-[12px] opacity-50"
                     style={{ background: C.surfaceHi, borderColor: C.border, color: 'var(--nexus-text-2)' }}>
                  {TYPE_LABEL[proposal.incidentType] || proposal.incidentType}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] mb-1.5" style={{ color: C.muted }}>
                SOP Title
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-colors"
                style={{ background: C.surfaceHi, borderColor: C.border, color: 'var(--nexus-text-1)' }}
                onFocus={e => { e.target.style.borderColor = `${actionColor}40`; }}
                onBlur={e => { e.target.style.borderColor = C.border; }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: C.muted }}>
                  Resolution Steps
                </label>
                <span className="text-[9px]" style={{ color: C.muted }}>
                  one step per line · {steps.split('\n').filter(s => s.trim()).length} steps
                </span>
              </div>
              <textarea
                value={steps}
                onChange={e => setSteps(e.target.value)}
                rows={8}
                className="w-full resize-none rounded-xl border px-4 py-3 text-[12px] leading-relaxed outline-none transition-colors"
                style={{ background: C.surfaceHi, borderColor: C.border, color: 'var(--nexus-text-2)',
                         fontFamily: "'JetBrains Mono', monospace" }}
                onFocus={e => { e.target.style.borderColor = `${actionColor}40`; }}
                onBlur={e => { e.target.style.borderColor = C.border; }}
              />
            </div>

            {saveErr && (
              <div className="rounded-lg border px-3 py-2 text-[11px]"
                   style={{ background: `${C.red}10`, borderColor: `${C.red}30`, color: '#F87171' }}>
                {saveErr}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t px-6 py-4"
               style={{ borderColor: C.border }}>
            <button onClick={onClose}
                    className="rounded-xl border px-4 py-2 text-[12px] font-semibold transition-colors hover:text-[var(--nexus-text-1)]"
                    style={{ borderColor: C.border, color: 'var(--nexus-text-3)' }}>
              Cancel
            </button>

            {saved ? (
              <div className="flex items-center gap-2 rounded-xl px-4 py-2"
                   style={{ background: `${C.green}15`, border: `1px solid ${C.green}30` }}>
                <CheckCircle2 size={14} style={{ color: C.green }} />
                <span className="text-[12px] font-bold" style={{ color: C.green }}>
                  Saved to Knowledge Base ✓
                </span>
              </div>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving || !code.trim() || !title.trim() || !steps.trim()}
                className="flex items-center gap-2 rounded-xl px-5 py-2 text-[12px] font-bold text-white transition-all disabled:opacity-50"
                style={{
                  background: saving ? `${actionColor}30` : `linear-gradient(135deg, ${actionColor}, ${actionColor}cc)`,
                  boxShadow:  saving ? 'none' : `0 0 20px ${actionColor}30`,
                }}
              >
                {saving ? (
                  <><RefreshCw size={13} className="animate-spin" /> Saving to KB…</>
                ) : (
                  <><Sparkles size={13} /> Publish to Knowledge Base</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── SOP KB Card ───────────────────────────────────────────────────────────────

function SopKbCard({ sop, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const typeColors = {
    late_delivery: C.human, damaged_parcel: C.red, missing_parcel: '#F97316',
    address_error: C.ml, system_error: C.bot, wrong_item: C.green, other: '#6B7280',
  };
  const color = typeColors[sop.incidentType] || C.ml;
  const stepsPreview = sop.steps?.slice(0, 2) || [];

  async function handleDelete() {
    if (!window.confirm(`Delete SOP ${sop.code}?`)) return;
    setDeleting(true);
    try {
      await deleteSop(sop.code);
      onDeleted?.();
    } catch { setDeleting(false); }
  }

  return (
    <div className="rounded-xl border overflow-hidden transition-all duration-200 hover:border-opacity-60"
         style={{ background: C.surface, borderColor: C.border, borderLeft: `3px solid ${color}` }}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded px-2 py-0.5 text-[9px] font-bold tracking-wider shrink-0"
                  style={{ background: `${color}18`, color, fontFamily: "'JetBrains Mono', monospace" }}>
              {sop.code}
            </span>
            <span className="rounded px-2 py-0.5 text-[9px] font-medium"
                  style={{ background: 'var(--nexus-surface-2)', border: `1px solid ${C.border}`, color: 'var(--nexus-text-3)' }}>
              {(sop.incidentType || '').replace(/_/g, ' ')}
            </span>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg border hover:text-red-400 hover:border-red-400/30 transition-colors disabled:opacity-50"
            style={{ borderColor: C.border, color: 'var(--nexus-text-3)' }}
          >
            <Trash2 size={11} />
          </button>
        </div>
        <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--nexus-text-1)' }}>{sop.title}</p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--nexus-text-3)' }}>{sop.steps?.length ?? 0} steps</p>
      </div>

      {/* Steps preview */}
      <div className="px-4 pb-3 space-y-1.5">
        {stepsPreview.map((step, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="shrink-0 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold mt-0.5"
                  style={{ background: `${color}18`, color }}>
              {i + 1}
            </span>
            <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--nexus-text-2)' }}>{step}</p>
          </div>
        ))}
        {sop.steps?.length > 2 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[10px] transition-colors hover:text-[var(--nexus-text-1)]"
            style={{ color }}
          >
            +{sop.steps.length - 2} more steps →
          </button>
        )}
        {expanded && sop.steps?.slice(2).map((step, i) => (
          <div key={i + 2} className="flex gap-2 items-start">
            <span className="shrink-0 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold mt-0.5"
                  style={{ background: `${color}18`, color }}>
              {i + 3}
            </span>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--nexus-text-2)' }}>{step}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2.5 flex items-center justify-between"
           style={{ borderColor: C.border, background: C.surfaceHi }}>
        <span className="text-[9px]" style={{ color: 'var(--nexus-text-3)' }}>
          {sop.createdAt ? new Date(sop.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[10px] transition-colors hover:text-[var(--nexus-text-1)]"
          style={{ color: 'var(--nexus-text-3)' }}
        >
          {expanded ? 'Collapse' : 'Expand all'}
        </button>
      </div>
    </div>
  );
}

// ── Resolution Row ────────────────────────────────────────────────────────────

function ResolutionRow({ res, selected, onToggleSelect, onQueue, onDequeue, onEmbed, onEmbedSuccess, onSelect, navigate, alreadyEmbedded }) {
  const byColor  = res.resolvedBy === 'bot' ? C.bot : C.human;
  const sev      = SEV_COLOR[res.severity] || '#6B7280';
  const outcome  = OUTCOME_CFG[res.followUp?.outcome];
  const status   = STATUS_CFG[res.status] || { color: '#6B7280', label: res.status };
  const [embedDone,  setEmbedDone]  = useState(false);
  const [embedding,  setEmbedding]  = useState(false);
  const isEmbedded = alreadyEmbedded || embedDone;

  async function handleEmbed(e) {
    e.stopPropagation();
    setEmbedding(true);
    await onEmbed(res._id);
    setEmbedDone(true);
    onEmbedSuccess?.(res._id);
    setEmbedding(false);
  }

  return (
    <div
      className="group relative rounded-xl border transition-all duration-200 overflow-hidden mb-2"
      style={{
        background:  selected ? C.surfaceHi : C.surface,
        borderColor: selected ? `${C.ml}50` : C.border,
        borderLeft:  `3px solid ${selected ? C.ml : byColor}`,
        cursor: 'pointer',
      }}
      onClick={() => onSelect(res)}
      onMouseEnter={e => { if (!selected) { e.currentTarget.style.background = C.surfaceHi; e.currentTarget.style.borderColor = `${byColor}40`; } }}
      onMouseLeave={e => { if (!selected) { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; } }}
    >
      {selected && (
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: `linear-gradient(90deg, ${C.ml}08 0%, transparent 40%)` }} />
      )}

      <div className="relative px-4 py-3">
        {/* Top row */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {/* Checkbox */}
          <button
            onClick={e => { e.stopPropagation(); onToggleSelect(res._id); }}
            className="shrink-0 transition-colors hover:opacity-80"
            style={{ color: selected ? C.ml : 'var(--nexus-text-3)' }}
            aria-label={selected ? 'Deselect' : 'Select'}
          >
            {selected
              ? <CheckSquare size={14} style={{ color: C.ml }} />
              : <Square size={14} className="transition-colors" style={{ color: 'var(--nexus-text-3)' }} />}
          </button>

          {/* Resolved-by badge */}
          <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: `${byColor}18`, color: byColor }}>
            {res.resolvedBy === 'bot' ? <Bot size={9} /> : <User size={9} />}
            {res.resolvedBy}
          </span>

          <span className="text-[11px] font-semibold" style={{ color: 'var(--nexus-text-1)' }}>
            {TYPE_LABEL[res.type] || res.type || 'Unknown'}
          </span>

          {res.hub && res.hub !== 'Unknown' && (
            <span className="text-[10px]" style={{ color: 'var(--nexus-text-3)' }}>· {res.hub}</span>
          )}

          {res.severity && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                  style={{ background: `${sev}18`, color: sev }}>
              {res.severity}
            </span>
          )}

          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                style={{ background: `${status.color}12`, color: status.color }}>
            {status.label}
          </span>

          {res.confidence != null && (
            <span className="ml-auto text-[11px] tabular-nums font-bold"
                  style={{
                    color: res.confidence >= 0.85 ? C.green : res.confidence >= 0.70 ? C.human : '#6B7280',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
              {Math.round(res.confidence * 100)}%
            </span>
          )}

          {res.isQueued && (
            <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold"
                  style={{ background: `${C.ml}18`, color: C.ml }}>
              <Layers size={9} /> QUEUED
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-[12px] leading-relaxed mb-2 line-clamp-2 pr-4" style={{ color: 'var(--nexus-text-2)' }}>
          {res.description || res.title || 'No description'}
        </p>

        {/* Bottom row */}
        <div className="flex items-center gap-3 flex-wrap">
          {outcome && (
            <span className="text-[11px]" style={{ color: outcome.color }}>
              {outcome.dot} {outcome.label}
            </span>
          )}
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--nexus-text-3)' }}>
            <Clock size={9} /> {timeAgo(res.updatedAt)}
          </span>

          <div className="ml-auto flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            {!res.isQueued ? (
              <button onClick={() => onQueue(res._id)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all hover:opacity-90"
                      style={{ background: `${C.ml}18`, color: C.ml, border: `1px solid ${C.ml}30` }}>
                <Layers size={10} /> Queue Training
              </button>
            ) : (
              <button onClick={() => onDequeue(res._id)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all"
                      style={{ background: `${C.ml}10`, color: C.ml, border: `1px solid ${C.ml}20` }}>
                <Trash2 size={10} /> Dequeue
              </button>
            )}
            <button onClick={handleEmbed} disabled={embedding || isEmbedded}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all"
                    style={{
                      background: isEmbedded ? `${C.green}15` : `${C.bot}12`,
                      color:      isEmbedded ? C.green : C.bot,
                      border:     `1px solid ${isEmbedded ? C.green : C.bot}25`,
                      opacity:    embedding ? 0.6 : 1,
                    }}>
              <Database size={10} />
              {embedding ? 'Embedding…' : isEmbedded ? 'Embedded ✓' : 'Embed KB'}
            </button>
            <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/incidents/${res._id}`); }}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all hover:text-[var(--nexus-text-1)]"
                    style={{ border: `1px solid ${C.border}`, color: 'var(--nexus-text-3)' }}>
              View <ChevronRight size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Training Queue Panel ──────────────────────────────────────────────────────

function TrainingQueuePanel({ queueCount, modelInfo, onBatchTrain, training }) {
  return (
    <div className="rounded-xl border flex flex-col overflow-hidden sticky top-4"
         style={{ background: C.surface, borderColor: `${C.ml}25`, minWidth: 260 }}>
      <div className="border-b px-4 py-3 flex items-center gap-2"
           style={{ borderColor: `${C.ml}20`, background: `${C.ml}08` }}>
        <div className="flex h-6 w-6 items-center justify-center rounded-md"
             style={{ background: `${C.ml}20` }}>
          <Layers size={12} style={{ color: C.ml }} />
        </div>
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase flex-1" style={{ color: 'var(--nexus-text-2)' }}>
          Training Queue
        </span>
        <div className="relative">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: `${C.ml}25`, color: C.ml, fontFamily: "'JetBrains Mono', monospace" }}>
            {queueCount}
          </span>
          {queueCount > 0 && (
            <span className="absolute inset-0 rounded-full animate-ping opacity-30"
                  style={{ background: C.ml }} />
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 flex-1">
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-[10px]" style={{ color: 'var(--nexus-text-3)' }}>Queue depth</span>
            <span className="text-[11px] font-bold tabular-nums"
                  style={{ color: C.ml, fontFamily: "'JetBrains Mono', monospace" }}>
              {queueCount} candidates
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--nexus-surface-2)' }}>
            <div className="h-full rounded-full transition-all duration-700"
                 style={{
                   width: `${Math.min(100, (queueCount / 20) * 100)}%`,
                   background: `linear-gradient(90deg, ${C.ml}, ${C.bot})`,
                 }} />
          </div>
          <p className="text-[9px] mt-1" style={{ color: 'var(--nexus-text-3)' }}>Trains at 20+ for optimal batch size</p>
        </div>

        {modelInfo && (
          <div className="rounded-lg border p-3 space-y-2"
               style={{ background: C.surfaceHi, borderColor: C.border }}>
            <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: 'var(--nexus-text-3)' }}>Current Model</p>
            <div className="flex justify-between">
              <span className="text-[11px]" style={{ color: 'var(--nexus-text-2)' }}>Accuracy</span>
              <span className="text-[11px] font-bold" style={{ color: C.green, fontFamily: "'JetBrains Mono', monospace" }}>
                {modelInfo.accuracy ? `${Math.round(modelInfo.accuracy * 100)}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[11px]" style={{ color: 'var(--nexus-text-2)' }}>Training size</span>
              <span className="text-[11px] font-bold" style={{ color: C.bot, fontFamily: "'JetBrains Mono', monospace" }}>
                {modelInfo.trainingDataSize ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[11px]" style={{ color: 'var(--nexus-text-2)' }}>Last trained</span>
              <span className="text-[10px]" style={{ color: 'var(--nexus-text-3)' }}>
                {modelInfo.lastTrainedAt ? timeAgo(modelInfo.lastTrainedAt) : 'Never'}
              </span>
            </div>
          </div>
        )}

        <div className="rounded-lg border p-3 space-y-1.5"
             style={{ background: C.surfaceHi, borderColor: C.border }}>
          <p className="text-[10px] font-semibold tracking-wide uppercase mb-2" style={{ color: 'var(--nexus-text-3)' }}>Training improves</p>
          {[
            { icon: Cpu,        color: C.bot,   text: 'Classification accuracy' },
            { icon: BookOpen,   color: C.ml,    text: 'KB retrieval relevance'  },
            { icon: TrendingUp, color: C.green, text: 'SOP matching confidence' },
          ].map(({ icon: Icon, color, text }) => (
            <div key={text} className="flex items-center gap-2">
              <Icon size={10} style={{ color }} />
              <span className="text-[11px]" style={{ color: 'var(--nexus-text-2)' }}>{text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onBatchTrain}
          disabled={training || queueCount === 0}
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: training
              ? `${C.ml}25`
              : `linear-gradient(135deg, ${C.ml}, ${C.bot})`,
            color: 'white',
            boxShadow: training ? 'none' : `0 0 20px ${C.ml}30`,
          }}
        >
          {training
            ? <><RefreshCw size={14} className="animate-spin" /> Training…</>
            : <><Brain size={14} /> Batch Train Model</>}
        </button>
        {queueCount === 0 && (
          <p className="text-[10px] text-center" style={{ color: 'var(--nexus-text-3)' }}>
            Queue at least 1 candidate to train
          </p>
        )}
      </div>
    </div>
  );
}

// ── SOP Proposal Card ─────────────────────────────────────────────────────────

function SopProposalCard({ proposal, idx, onOpenSopModal }) {
  const colors = [C.bot, C.ml, C.green, C.human, C.red];
  const color  = colors[idx % colors.length];
  return (
    <div className="rounded-xl border flex-shrink-0 w-64 p-4 flex flex-col gap-3"
         style={{ background: C.surface, borderColor: `${color}25`, borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg"
               style={{ background: `${color}15` }}>
            <BookOpen size={12} style={{ color }} />
          </div>
          <div>
            <p className="text-[12px] font-semibold leading-tight" style={{ color: 'var(--nexus-text-1)' }}>
              {TYPE_LABEL[proposal.incidentType] || proposal.incidentType}
            </p>
            <p className="text-[9px] mt-0.5" style={{ color: 'var(--nexus-text-3)' }}>{proposal.sampleCount} resolutions</p>
          </div>
        </div>
        <span className="rounded px-2 py-0.5 text-[9px] font-bold uppercase shrink-0"
              style={{
                background: proposal.action === 'update' ? `${C.bot}18` : `${C.green}18`,
                color:      proposal.action === 'update' ? C.bot : C.green,
              }}>
          {proposal.action === 'update' ? 'UPDATE' : 'CREATE'}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[10px]" style={{ color: 'var(--nexus-text-3)' }}>Avg confidence</span>
          <span className="text-[11px] font-bold tabular-nums"
                style={{
                  color: proposal.avgConfidence >= 85 ? C.green : C.human,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
            {proposal.avgConfidence}%
          </span>
        </div>
        {proposal.existingSop && (
          <div className="flex items-center gap-1.5">
            <Tag size={9} style={{ color: C.bot }} />
            <span className="text-[10px]" style={{ color: 'var(--nexus-text-2)' }}>Existing: </span>
            <span className="text-[10px] font-bold" style={{ color: C.bot }}>{proposal.existingSop.code}</span>
          </div>
        )}
      </div>

      <p className="text-[10px] leading-relaxed border-t pt-2" style={{ borderColor: C.border, color: 'var(--nexus-text-3)' }}>
        {proposal.suggestion}
      </p>

      <button
        onClick={() => onOpenSopModal(proposal)}
        className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition-all hover:opacity-90 active:scale-95"
        style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}>
        <Sparkles size={10} />
        {proposal.action === 'update' ? 'Review & Update SOP' : 'Draft New SOP'}
      </button>
    </div>
  );
}

// ── Resolution Detail Drawer ──────────────────────────────────────────────────

function Chip({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border px-2 py-1"
         style={{ background: 'var(--nexus-surface-2)', borderColor: C.border }}>
      <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--nexus-text-3)' }}>{label}</span>
      <span className="text-[10px] font-semibold" style={{ color: color || 'var(--nexus-text-2)' }}>{value}</span>
    </div>
  );
}

function DrawerSection({ icon: Icon, color, title, badge, children }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5"
           style={{ borderColor: C.border, background: `${color}08` }}>
        <Icon size={12} style={{ color }} />
        <span className="flex-1 text-[11px] font-semibold" style={{ color: 'var(--nexus-text-2)' }}>{title}</span>
        {badge && (
          <span className="rounded-md px-2 py-0.5 text-[9px] font-bold"
                style={{ background: `${badge.color}18`, color: badge.color }}>
            {badge.label}
          </span>
        )}
      </div>
      <div className="p-4" style={{ background: C.surface }}>{children}</div>
    </div>
  );
}

function ResolutionDetailDrawer({ res, onClose }) {
  if (!res) return null;
  const byColor = res.resolvedBy === 'bot' ? C.bot : C.human;
  const outcome = OUTCOME_CFG[res.followUp?.outcome];
  const status  = STATUS_CFG[res.status] || { color: '#6B7280', label: res.status };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[540px] flex-col overflow-hidden shadow-2xl"
           style={{ background: 'var(--nexus-surface-1)', borderLeft: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between border-b px-5 py-4"
             style={{ borderColor: C.border }}>
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg"
                 style={{ background: `${byColor}18` }}>
              {res.resolvedBy === 'bot'
                ? <Bot size={13} style={{ color: byColor }} />
                : <User size={13} style={{ color: byColor }} />}
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-[0.12em]" style={{ color: byColor }}>
                {res.resolvedBy?.toUpperCase()} RESOLUTION
              </span>
              <p className="text-[13px] font-semibold leading-tight mt-0.5" style={{ color: 'var(--nexus-text-1)' }}>
                {TYPE_LABEL[res.type] || res.type || 'Unknown type'}
              </p>
            </div>
          </div>
          <button onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:text-[var(--nexus-text-1)]"
                  style={{ borderColor: C.border, color: 'var(--nexus-text-3)' }}>
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b px-5 py-3" style={{ borderColor: C.border }}>
          {res.hub && res.hub !== 'Unknown' && <Chip label="Hub"        value={res.hub}                        />}
          {res.severity   && <Chip label="Severity"   value={res.severity}   color={SEV_COLOR[res.severity]}   />}
          {res.status     && <Chip label="Status"     value={status.label}   color={status.color}              />}
          {res.confidence != null && <Chip label="Confidence" value={`${Math.round(res.confidence * 100)}%`}
                                          color={res.confidence >= 0.85 ? C.green : C.human}                   />}
          {outcome        && <Chip label="Outcome"    value={outcome.label}  color={outcome.color}             />}
          {res.source     && <Chip label="Source"     value={res.source}                                       />}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <DrawerSection icon={Mail} color={C.bot} title="Incident Description">
            <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--nexus-text-2)' }}>
              {res.description || res.title || 'No description available.'}
            </p>
          </DrawerSection>

          {res.recoveryMessage?.text && (
            <DrawerSection icon={Brain} color={C.ml} title="AI Recovery Response"
              badge={res.recoveryMessage.status
                ? { label: res.recoveryMessage.status.replace(/_/g, ' ').toUpperCase(), color: C.green }
                : undefined}>
              <pre className="whitespace-pre-wrap text-[11px] leading-relaxed font-mono" style={{ color: 'var(--nexus-text-2)' }}>
                {res.recoveryMessage.text}
              </pre>
            </DrawerSection>
          )}

          {res.confidence != null && (
            <DrawerSection icon={TrendingUp} color={C.green} title="Confidence Score">
              <div className="flex items-center gap-4">
                <span className="text-3xl font-bold tabular-nums"
                      style={{
                        color: res.confidence >= 0.85 ? C.green : res.confidence >= 0.70 ? C.human : '#6B7280',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                  {Math.round(res.confidence * 100)}%
                </span>
                <div className="flex-1">
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--nexus-surface-2)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                         style={{
                           width: `${Math.round(res.confidence * 100)}%`,
                           background: res.confidence >= 0.85 ? C.green : res.confidence >= 0.70 ? C.human : '#6B7280',
                         }} />
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--nexus-text-3)' }}>
                    {res.confidence >= 0.85 ? 'High confidence - auto-response eligible'
                      : res.confidence >= 0.70 ? 'Medium confidence - review recommended'
                      : 'Low confidence - human review required'}
                  </p>
                </div>
              </div>
            </DrawerSection>
          )}

          {Array.isArray(res.tags) && res.tags.length > 0 && (
            <DrawerSection icon={Tag} color={C.human} title="Tags">
              <div className="flex flex-wrap gap-1.5">
                {res.tags.map(t => (
                  <span key={t} className="rounded-md px-2 py-0.5 text-[10px]"
                        style={{ color: 'var(--nexus-text-2)', background: 'var(--nexus-surface-2)', border: `1px solid ${C.border}` }}>
                    {t}
                  </span>
                ))}
              </div>
            </DrawerSection>
          )}

          <DrawerSection icon={Layers} color={C.ml} title="Training Pipeline Status">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full"
                   style={{ background: res.isQueued ? `${C.ml}20` : 'var(--nexus-surface-2)' }}>
                {res.isQueued
                  ? <CheckCircle2 size={18} style={{ color: C.ml }} />
                  : <Layers size={18} style={{ color: 'var(--nexus-text-3)' }} />}
              </div>
              <div>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--nexus-text-1)' }}>
                  {res.isQueued ? 'Queued for model training' : 'Not yet in training queue'}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--nexus-text-3)' }}>
                  {res.isQueued
                    ? 'This resolution will improve the classification model on next batch train.'
                    : 'Add to training queue so this resolution teaches the AI.'}
                </p>
              </div>
            </div>
          </DrawerSection>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const EMPTY_FILTERS = { hub: '', severity: '', resolvedBy: '', dateFrom: '', dateTo: '', search: '' };

export default function ResolutionArchive() {
  const navigate = useNavigate();

  const [stats,          setStats]         = useState(null);
  const [modelInfo,      setModelInfo]     = useState(null);
  const [resolutions,    setResolutions]   = useState([]);
  const [total,          setTotal]         = useState(0);
  const [pages,          setPages]         = useState(1);
  const [page,           setPage]          = useState(1);
  const [filters,        setFilters]       = useState(EMPTY_FILTERS);
  const [proposals,      setProposals]     = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [selectedRes,    setSelectedRes]   = useState(null);

  // Selection
  const [selectedIds,    setSelectedIds]   = useState(new Set());
  const [embeddedIds,    setEmbeddedIds]   = useState(new Set());
  const [bulkQueueing,   setBulkQueueing]  = useState(false);
  const [bulkEmbedding,  setBulkEmbedding] = useState(false);

  // SOP builder modal
  const [sopModal,       setSopModal]      = useState(null);

  // Knowledge Base tab
  const [activeTab,      setActiveTab]     = useState('resolutions');
  const [sops,           setSops]          = useState([]);
  const [sopsLoading,    setSopsLoading]   = useState(false);
  const [sopSearch,      setSopSearch]     = useState('');
  const [kbHealth,       setKbHealth]      = useState(null);
  const [kbQuery,        setKbQuery]       = useState('');
  const [kbResults,      setKbResults]     = useState(null);
  const [kbSearching,    setKbSearching]   = useState(false);

  // Training modal
  const [trainModal,     setTrainModal]    = useState(false);
  const [training,       setTraining]      = useState(false);
  const [trainDone,      setTrainDone]     = useState(false);
  const [trainError,     setTrainError]    = useState(null);
  const [trainResult,    setTrainResult]   = useState(null);

  const debounceRef = useRef(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.href  = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
    link.rel   = 'stylesheet';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch {} };
  }, []);

  useEffect(() => {
    Promise.all([
      getResolutionStats().then(d => { if (d) setStats(d); }),
      getResolutionModelInfo().then(d => { if (d) setModelInfo(d); }),
      getSopProposals().then(d => { if (d) setProposals(d.proposals || []); }),
    ]);
    loadSops();
    loadKbHealth();
  }, []);

  async function loadSops() {
    setSopsLoading(true);
    try {
      const data = await getSops();
      setSops(Array.isArray(data) ? data : []);
    } catch { setSops([]); }
    setSopsLoading(false);
  }

  async function loadKbHealth() {
    const data = await getKbHealth();
    if (data) setKbHealth(data);
  }

  async function runKbQuery() {
    const q = kbQuery.trim();
    if (!q || kbSearching) return;
    setKbSearching(true);
    setKbResults(null);
    const data = await searchKb(q);
    setKbResults(data?.results || []);
    setKbSearching(false);
  }

  const fetchResolutions = useCallback(async (f = filters, p = page) => {
    setLoading(true);
    const params = { page: p, limit: 15 };
    if (f.hub)        params.hub        = f.hub;
    if (f.severity)   params.severity   = f.severity;
    if (f.resolvedBy) params.resolvedBy = f.resolvedBy;
    if (f.dateFrom)   params.dateFrom   = f.dateFrom;
    if (f.dateTo)     params.dateTo     = f.dateTo;
    if (f.search)     params.search     = f.search;
    const data = await getResolutions(params);
    setResolutions(data.resolutions || []);
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setLoading(false);
  }, [filters, page]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResolutions(filters, page), filters.search ? 400 : 0);
  }, [filters, page]);

  function handleFilterChange(key, value) {
    setPage(1);
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  // ── Selection helpers ───────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const allOnPageSelected = resolutions.length > 0 && resolutions.every(r => selectedIds.has(r._id));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(prev => {
        const n = new Set(prev);
        resolutions.forEach(r => n.delete(r._id));
        return n;
      });
    } else {
      setSelectedIds(prev => {
        const n = new Set(prev);
        resolutions.forEach(r => n.add(r._id));
        return n;
      });
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ── Single-row actions ──────────────────────────────────────────────────────
  async function handleQueue(id) {
    try {
      await queueTraining(id);
      setResolutions(prev => prev.map(r => r._id === id ? { ...r, isQueued: true } : r));
      setStats(prev => prev ? { ...prev, queueCount: (prev.queueCount || 0) + 1 } : prev);
    } catch {}
  }

  async function handleDequeue(id) {
    await dequeueTraining(id);
    setResolutions(prev => prev.map(r => r._id === id ? { ...r, isQueued: false } : r));
    setStats(prev => prev ? { ...prev, queueCount: Math.max(0, (prev.queueCount || 1) - 1) } : prev);
  }

  // ── Bulk actions ────────────────────────────────────────────────────────────
  async function handleBulkQueue() {
    setBulkQueueing(true);
    const ids = resolutions
      .filter(r => selectedIds.has(r._id) && !r.isQueued)
      .map(r => r._id);
    if (ids.length > 0) {
      try {
        const result = await bulkQueueTraining(ids);
        setResolutions(prev => prev.map(r =>
          selectedIds.has(r._id) ? { ...r, isQueued: true } : r
        ));
        setStats(prev => prev
          ? { ...prev, queueCount: (prev.queueCount || 0) + (result?.queued ?? ids.length) }
          : prev
        );
      } catch {}
    }
    clearSelection();
    setBulkQueueing(false);
  }

  async function handleBulkEmbed() {
    setBulkEmbedding(true);
    const ids = [...selectedIds];
    await Promise.allSettled(ids.map(id => embedResolution(id)));
    clearSelection();
    setBulkEmbedding(false);
  }

  // ── Batch train with modal ──────────────────────────────────────────────────
  async function handleBatchTrain() {
    setTrainDone(false);
    setTrainError(null);
    setTrainResult(null);
    setTraining(true);
    setTrainModal(true);
    try {
      const res = await batchTrain();
      setTrainResult(res?.result || {});
      getResolutionModelInfo().then(d => { if (d) setModelInfo(d); });
      setStats(prev => prev ? { ...prev, queueCount: 0 } : prev);
      fetchResolutions();
      setSelectedIds(new Set());
    } catch (err) {
      setTrainError(err.message || 'Training failed');
    }
    setTrainDone(true);
    setTraining(false);
  }

  function closeTrainModal() {
    setTrainModal(false);
  }

  const queueCount          = stats?.queueCount ?? 0;
  const selectedOnPage      = resolutions.filter(r => selectedIds.has(r._id)).length;
  const totalSelected       = selectedIds.size;
  const showBulkBar         = totalSelected > 0;

  return (
    <Layout title="Resolution Intelligence">
      <div className="min-h-screen p-4 md:p-5" style={{ background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg"
                   style={{ background: `${C.ml}18` }}>
                <Brain size={14} style={{ color: C.ml }} />
              </div>
              <h1 className="text-[18px] font-bold tracking-tight" style={{ color: 'var(--nexus-text-1)' }}>
                Resolution Intelligence Archive
              </h1>
            </div>
            <p className="text-[12px] ml-9" style={{ color: 'var(--nexus-text-3)' }}>
              Every resolved case teaches the AI · {total} incidents · {queueCount} queued for training
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleBatchTrain}
              disabled={training || queueCount === 0}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: training ? `${C.ml}25` : `linear-gradient(135deg, ${C.ml}, ${C.bot})`,
                color: 'white',
                boxShadow: training ? 'none' : `0 0 20px ${C.ml}25`,
              }}
            >
              {training ? <RefreshCw size={14} className="animate-spin" /> : <Brain size={14} />}
              {training ? 'Training…' : `Batch Train (${queueCount})`}
            </button>
          </div>
        </header>

        {/* ── Stats Strip ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatCard label="Total Archived"  value={stats?.total ?? '—'}               color={C.bot}   Icon={Database}    sub="all processed incidents" />
          <StatCard label="Bot Resolved"    value={stats?.botCount ?? '—'}            color={C.bot}   Icon={Bot}         sub="automated pipeline" />
          <StatCard label="Human Reviewed"  value={stats?.humanCount ?? '—'}          color={C.human} Icon={User}        sub="escalated + manual" />
          <StatCard label="Avg Confidence"  value={stats ? `${stats.avgConf}%` : '—'} color={C.ml}   Icon={Brain}       sub="ML classification" />
          <StatCard label="Training Queue"  value={queueCount}                        color={C.ml}    Icon={Layers}      sub="ready to train" pulse={queueCount > 0} />
        </div>

        {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 rounded-xl border p-1 mb-4"
             style={{ background: C.surface, borderColor: C.border, width: 'fit-content' }}>
          {[
            { key: 'resolutions', label: 'Resolution Archive', icon: Database },
            { key: 'kb', label: `Knowledge Base${sops.length > 0 ? ` (${sops.length})` : ''}`, icon: BookOpen },
          ].map(({ key, label, icon: Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-semibold transition-all"
                style={{
                  background: active ? 'var(--nexus-surface-2)' : 'transparent',
                  color: active ? 'var(--nexus-text-1)' : 'var(--nexus-text-3)',
                  border: active ? `1px solid ${C.border}` : '1px solid transparent',
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.4)' : 'none',
                }}
              >
                <Icon size={13} style={{ color: active ? C.bot : 'var(--nexus-text-3)' }} />
                {label}
              </button>
            );
          })}
        </div>

        {activeTab === 'kb' ? (
          /* ── Knowledge Base Viewer ──────────────────────────────────────────── */
          <div className="flex gap-4 items-start">

            {/* Left: SOP grid */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--nexus-text-3)' }} />
                  <input
                    value={sopSearch}
                    onChange={e => setSopSearch(e.target.value)}
                    placeholder="Search SOPs…"
                    className="w-full rounded-lg border pl-9 pr-3 py-2 text-[12px] outline-none transition-colors"
                    style={{ background: C.surface, borderColor: C.border, color: 'var(--nexus-text-1)' }}
                  />
                </div>
                <button
                  onClick={loadSops}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] transition-colors hover:text-[var(--nexus-text-1)]"
                  style={{ color: 'var(--nexus-text-3)', borderColor: C.border, background: C.surface }}
                >
                  <RefreshCw size={11} /> Refresh
                </button>
                <span className="text-[11px]" style={{ color: 'var(--nexus-text-3)' }}>
                  {sops.length} SOP{sops.length !== 1 ? 's' : ''} in knowledge base
                </span>
              </div>

              {sopsLoading ? (
                <div className="flex items-center justify-center py-20" style={{ color: 'var(--nexus-text-3)' }}>
                  <RefreshCw size={18} className="animate-spin mr-2" /> Loading knowledge base...
                </div>
              ) : sops.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 rounded-xl border text-center"
                     style={{ background: C.surface, borderColor: C.border }}>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border mb-4"
                       style={{ background: C.surfaceHi, borderColor: C.border }}>
                    <BookOpen size={24} style={{ color: 'var(--nexus-text-3)' }} />
                  </div>
                  <p className="text-[14px] font-semibold" style={{ color: 'var(--nexus-text-2)' }}>Knowledge Base is empty</p>
                  <p className="text-[12px] mt-1" style={{ color: 'var(--nexus-text-3)' }}>
                    Use the SOP proposals below to draft and publish SOPs
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {sops
                    .filter(s => !sopSearch || [s.code, s.title, s.incidentType, ...(s.steps || [])].join(' ').toLowerCase().includes(sopSearch.toLowerCase()))
                    .map(sop => (
                      <SopKbCard key={sop.code} sop={sop} onDeleted={() => setSops(prev => prev.filter(s => s.code !== sop.code))} />
                    ))}
                </div>
              )}
            </div>

            {/* Right: KB health + live test panel */}
            <div className="w-72 shrink-0 flex flex-col gap-4 sticky top-4">

              {/* Health Dashboard */}
              <div className="rounded-xl border overflow-hidden" style={{ background: C.surface, borderColor: `${C.ml}28` }}>
                <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: `${C.ml}20`, background: `${C.ml}08` }}>
                  <Sparkles size={12} style={{ color: C.ml }} />
                  <span className="text-[11px] font-semibold tracking-[0.06em] uppercase" style={{ color: 'var(--nexus-text-2)' }}>KB Health</span>
                  <button onClick={loadKbHealth} className="ml-auto transition-colors hover:text-[var(--nexus-text-1)]" style={{ color: 'var(--nexus-text-3)' }}>
                    <RefreshCw size={10} />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  {kbHealth ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px]" style={{ color: 'var(--nexus-text-2)' }}>Vector embeddings</span>
                        <span className="text-[14px] font-bold tabular-nums" style={{ color: C.ml, fontFamily: "'JetBrains Mono', monospace" }}>
                          {kbHealth.embeddingCount ?? 0}
                        </span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--nexus-surface-2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (kbHealth.embeddingCount || 0) / 2)}%`, background: C.ml, transition: 'width 600ms ease' }} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px]" style={{ color: 'var(--nexus-text-2)' }}>SOPs loaded</span>
                        <span className="text-[14px] font-bold tabular-nums" style={{ color: C.red, fontFamily: "'JetBrains Mono', monospace" }}>
                          {kbHealth.sopCount ?? 0}
                        </span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--nexus-surface-2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (kbHealth.sopCount || 0) * 10)}%`, background: C.red, transition: 'width 600ms ease' }} />
                      </div>
                      {kbHealth.lastEmbeddingAt && (
                        <div className="flex justify-between items-center pt-1 border-t" style={{ borderColor: C.border }}>
                          <span className="text-[10px]" style={{ color: 'var(--nexus-text-3)' }}>Last indexed</span>
                          <span className="text-[10px]" style={{ color: 'var(--nexus-text-2)' }}>{timeAgo(kbHealth.lastEmbeddingAt)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#10B981', boxShadow: '0 0 5px rgba(16,185,129,0.6)' }} />
                        <span className="text-[10px]" style={{ color: '#10B981' }}>Vector search ready</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 py-2" style={{ color: 'var(--nexus-text-3)' }}>
                      <RefreshCw size={12} className="animate-spin" />
                      <span className="text-[11px]">Loading KB stats...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Live Test Query Panel */}
              <div className="rounded-xl border overflow-hidden" style={{ background: C.surface, borderColor: `${C.bot}28` }}>
                <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: `${C.bot}20`, background: `${C.bot}08` }}>
                  <Search size={12} style={{ color: C.bot }} />
                  <span className="text-[11px] font-semibold tracking-[0.06em] uppercase" style={{ color: 'var(--nexus-text-2)' }}>Live Test Query</span>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-[10px] leading-relaxed" style={{ color: 'var(--nexus-text-3)' }}>
                    Test the semantic search to see which past incidents the KB retrieves for any query.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={kbQuery}
                      onChange={e => setKbQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && runKbQuery()}
                      placeholder="e.g. damaged parcel KLIA…"
                      className="flex-1 rounded-lg border px-3 py-2 text-[12px] outline-none transition-colors"
                      style={{ background: C.surfaceHi, borderColor: C.border, color: 'var(--nexus-text-1)' }}
                    />
                    <button
                      onClick={runKbQuery}
                      disabled={!kbQuery.trim() || kbSearching}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-all disabled:opacity-40"
                      style={{ background: `${C.bot}20`, color: C.bot, border: `1px solid ${C.bot}30` }}
                    >
                      {kbSearching ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
                    </button>
                  </div>

                  {kbSearching && (
                    <div className="flex items-center gap-2 py-1" style={{ color: 'var(--nexus-text-3)' }}>
                      <RefreshCw size={11} className="animate-spin" />
                      <span className="text-[11px]">Searching vector KB…</span>
                    </div>
                  )}

                  {kbResults !== null && (
                    <div className="space-y-2">
                      {kbResults.length === 0 ? (
                        <p className="text-[11px] text-center py-3" style={{ color: 'var(--nexus-text-3)' }}>No results found in KB</p>
                      ) : (
                        kbResults.slice(0, 5).map((hit, i) => {
                          const score = Math.round((hit.similarity || hit.rrfScore || 0) * 100);
                          const barColor = score > 70 ? '#10B981' : score > 40 ? '#F59E0B' : '#FF8C00';
                          return (
                            <div key={i} className="rounded-lg p-2.5" style={{ background: C.surfaceHi, border: `1px solid ${C.border}` }}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-bold tabular-nums" style={{ color: barColor, fontFamily: "'JetBrains Mono', monospace" }}>
                                  {score}%
                                </span>
                                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--nexus-surface-2)' }}>
                                  <div style={{ height: '100%', width: `${score}%`, background: barColor, borderRadius: 999, transition: 'width 500ms ease' }} />
                                </div>
                                {hit.ref && (
                                  <span className="text-[9px] font-bold" style={{ color: C.red, fontFamily: "'JetBrains Mono', monospace" }}>{hit.ref}</span>
                                )}
                              </div>
                              <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: 'var(--nexus-text-2)' }}>
                                {(hit.incidentText || hit.incident?.description || '').substring(0, 100)}…
                              </p>
                            </div>
                          );
                        })
                      )}
                      <p className="text-[9px] text-center" style={{ color: 'var(--nexus-text-3)' }}>{kbResults.length} results · hybrid BM25 + cosine</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* ── Pipeline Flow ────────────────────────────────────────────────────── */}
        <PipelineFlow stats={stats} queueCount={queueCount} />

        {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          onClear={() => { setFilters(EMPTY_FILTERS); setPage(1); }}
        />

        {/* ── Main Content ────────────────────────────────────────────────────── */}
        <div className="flex gap-4 items-start">

          {/* Resolution list */}
          <div className="flex-1 min-w-0">
            {/* Results header row */}
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="flex items-center gap-3">
                {/* Select All toggle */}
                {!loading && resolutions.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all hover:border-opacity-60"
                    style={{
                      background:   allOnPageSelected ? `${C.ml}18` : C.surfaceHi,
                      borderColor:  allOnPageSelected ? `${C.ml}40` : C.border,
                      color:        allOnPageSelected ? C.ml : 'var(--nexus-text-3)',
                    }}
                  >
                    {allOnPageSelected
                      ? <CheckSquare size={12} style={{ color: C.ml }} />
                      : <Square size={12} />}
                    {allOnPageSelected ? 'Deselect All' : 'Select All'}
                    {totalSelected > 0 && !allOnPageSelected && (
                      <span className="ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                            style={{ background: `${C.ml}25`, color: C.ml }}>
                        {totalSelected}
                      </span>
                    )}
                  </button>
                )}
                <span className="text-[11px]" style={{ color: 'var(--nexus-text-3)' }}>
                  {loading ? 'Loading...' : `${total} resolution${total !== 1 ? 's' : ''} found`}
                </span>
              </div>
              <button
                onClick={() => fetchResolutions()}
                className="flex items-center gap-1 text-[11px] transition-colors hover:text-[var(--nexus-text-1)]"
                style={{ color: 'var(--nexus-text-3)' }}
              >
                <RefreshCw size={11} /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20" style={{ color: 'var(--nexus-text-3)' }}>
                <RefreshCw size={20} className="animate-spin mr-3" /> Loading resolutions...
              </div>
            ) : resolutions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-xl border text-center"
                   style={{ background: C.surface, borderColor: C.border }}>
                <div className="flex h-14 w-14 items-center justify-center rounded-full border mb-4"
                     style={{ background: C.surfaceHi, borderColor: C.border }}>
                  <Database size={24} style={{ color: 'var(--nexus-text-3)' }} />
                </div>
                <p className="text-[14px] font-semibold" style={{ color: 'var(--nexus-text-2)' }}>No resolutions found</p>
                <p className="text-[12px] mt-1" style={{ color: 'var(--nexus-text-3)' }}>
                  {Object.values(filters).some(v => v)
                    ? 'Try adjusting your filters'
                    : 'Process some incidents to populate this archive'}
                </p>
              </div>
            ) : (
              <>
                {resolutions.map(res => (
                  <ResolutionRow
                    key={res._id}
                    res={res}
                    selected={selectedIds.has(res._id)}
                    onToggleSelect={toggleSelect}
                    onQueue={handleQueue}
                    onDequeue={handleDequeue}
                    onEmbed={embedResolution}
                    onEmbedSuccess={(id) => setEmbeddedIds(prev => new Set([...prev, id]))}
                    alreadyEmbedded={embeddedIds.has(res._id)}
                    onSelect={setSelectedRes}
                    navigate={navigate}
                  />
                ))}

                {pages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border px-3 py-1.5 text-[12px] transition-colors hover:text-[var(--nexus-text-1)] disabled:opacity-30"
                      style={{ borderColor: C.border, background: C.surface, color: 'var(--nexus-text-2)' }}
                    >
                      ← Prev
                    </button>
                    <span className="text-[12px]" style={{ color: 'var(--nexus-text-3)' }}>Page {page} of {pages}</span>
                    <button
                      onClick={() => setPage(p => Math.min(pages, p + 1))}
                      disabled={page === pages}
                      className="rounded-lg border px-3 py-1.5 text-[12px] transition-colors hover:text-[var(--nexus-text-1)] disabled:opacity-30"
                      style={{ borderColor: C.border, background: C.surface, color: 'var(--nexus-text-2)' }}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right panel */}
          <div className="w-64 shrink-0 hidden lg:block">
            <TrainingQueuePanel
              queueCount={queueCount}
              modelInfo={modelInfo}
              onBatchTrain={handleBatchTrain}
              training={training}
            />
          </div>
        </div>

        {/* ── SOP Proposals ───────────────────────────────────────────────────── */}
        {proposals.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-md"
                   style={{ background: `${C.green}18` }}>
                <BookOpen size={11} style={{ color: C.green }} />
              </div>
              <span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'var(--nexus-text-2)' }}>
                AI-Generated SOP Proposals · Based on high-confidence resolutions
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {proposals.map((p, i) => <SopProposalCard key={p.incidentType} proposal={p} idx={i} onOpenSopModal={setSopModal} />)}
            </div>
          </div>
        )}
          </>
        )}

        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        `}</style>
      </div>

      {/* ── Bulk Action Bar ────────────────────────────────────────────────────── */}
      {showBulkBar && (
        <BulkActionBar
          count={totalSelected}
          onQueueAll={handleBulkQueue}
          onEmbedAll={handleBulkEmbed}
          onClear={clearSelection}
          queueing={bulkQueueing}
          embedding={bulkEmbedding}
        />
      )}

      {/* ── Training Progress Modal ───────────────────────────────────────────── */}
      {trainModal && (
        <TrainingProgressModal
          queueCount={queueCount}
          trainDone={trainDone}
          trainError={trainError}
          trainResult={trainResult}
          onClose={closeTrainModal}
        />
      )}

      {/* ── SOP Builder Modal ────────────────────────────────────────────────── */}
      {sopModal && (
        <SopBuilderModal
          proposal={sopModal}
          onClose={() => setSopModal(null)}
          onSaved={() => { loadSops(); setActiveTab('kb'); }}
        />
      )}

      {/* ── Detail Drawer ─────────────────────────────────────────────────────── */}
      <ResolutionDetailDrawer res={selectedRes} onClose={() => setSelectedRes(null)} />
    </Layout>
  );
}
