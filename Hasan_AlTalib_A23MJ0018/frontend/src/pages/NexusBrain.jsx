import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ClipboardList,
  Database,
  Eye,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  History,
  Layers,
  Loader2,
  MessageSquare,
  Network,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';

import IncidentAttachments from '../components/IncidentAttachments';
import Layout from '../components/Layout';
import { executeBrainAction, generateProactiveDocs, generateSop, getBrainFolders, getBrainRecords, queryBrain } from '../lib/api';

const DEMO_PROMPTS = [
  'Why is Shah Alam Hub having too many problems recently?',
  "Why was this customer's shipment delayed?",
  'What should DHL fix first to reduce complaints?',
  'Which SOP gap is creating repeated manual work?',
  'What did RPA learn from the latest messy inbox batch?',
];

const KIND_ICON = {
  root: Folder,
  hub: Network,
  incidents: ClipboardList,
  clusters: GitBranch,
  cluster: GitBranch,
  sla: ShieldAlert,
  sop: FileText,
  draft: FileText,
  gap: AlertTriangle,
  stale: History,
  rpa: Bot,
  duplicate: Archive,
  failure: AlertTriangle,
  ai: Brain,
  review: CheckCircle2,
  correction: Sparkles,
  evidence: Database,
  customer: Users,
  sentiment: AlertTriangle,
  proactive: Zap,
  roi: Sparkles,
  actions: Zap,
  type: Layers,
};

const ACTION_STYLE = {
  high: 'border-red-500/30 bg-red-500/10 text-[var(--nexus-red)] hover:bg-red-500/15',
  medium: 'border-amber-500/30 bg-amber-500/10 text-[var(--nexus-amber)] hover:bg-amber-500/15',
  normal: 'border-cyan-500/25 bg-cyan-500/10 text-[var(--nexus-cyan)] hover:bg-cyan-500/15',
};

function formatCount(value) {
  if (value == null) return '';
  if (Number(value) >= 1000) return `${(Number(value) / 1000).toFixed(1)}k`;
  return String(value);
}

function renderInlineMarkdown(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i} className="font-semibold text-[var(--nexus-text-1)]">{part.replace(/^\*\*|\*\*$/g, '')}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function normalizeAnswer(text) {
  return String(text || '')
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={index} className="h-2" />;

      const mdHeadingMatch = trimmed.match(/^\*\*([^*]+)\*\*$/);
      const oldStyleHeading = /^(Bottom line|Root cause hypothesis|Quantified impact|Pattern signal|Recommended action plan|Trade-offs and risks|What we don't know yet|Finding|Evidence|Likely causes|Recommended actions|System actions available):?$/i.test(trimmed);
      const isBullet = /^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed);

      if (mdHeadingMatch || oldStyleHeading) {
        const headingText = mdHeadingMatch ? mdHeadingMatch[1] : trimmed.replace(/:$/, '');
        return (
          <p key={index} className="pt-3 pb-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[var(--nexus-cyan)]">
            {headingText}
          </p>
        );
      }

      if (isBullet) {
        const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/);
        const bulletContent = numbered ? numbered[2] : trimmed.replace(/^[-*]\s+/, '');
        return (
          <div key={index} className="flex gap-3 text-[14px] leading-7 text-[var(--nexus-text-1)]">
            {numbered ? (
              <span className="mt-1.5 font-mono text-[11px] font-bold text-[var(--nexus-red)]">{numbered[1]}.</span>
            ) : (
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--nexus-red)] shadow-[0_0_10px_rgba(212,5,17,0.45)]" />
            )}
            <span>{renderInlineMarkdown(bulletContent)}</span>
          </div>
        );
      }

      return (
        <p key={index} className="text-[14px] leading-7 text-[var(--nexus-text-1)]">
          {renderInlineMarkdown(trimmed)}
        </p>
      );
    });
}

function flattenTree(nodes = []) {
  const out = [];
  const walk = (items, path = []) => {
    items.forEach((item) => {
      out.push({ ...item, path: [...path, item.label] });
      if (Array.isArray(item.children)) walk(item.children, [...path, item.label]);
    });
  };
  walk(nodes);
  return out;
}

function FolderNode({ node, depth, selectedId, expanded, onToggle, onSelect, onOpenRecords }) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const Icon = KIND_ICON[node.kind] || Folder;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(node);
          if (hasChildren) onToggle(node.id);
          if (!hasChildren && node.count !== 0) onOpenRecords(node);
        }}
        className={`group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
          isSelected
            ? 'border border-[rgba(34,211,238,0.25)] bg-[var(--nexus-cyan-dim)] text-[var(--nexus-text-1)]'
            : 'border border-transparent text-[var(--nexus-text-3)] hover:bg-[var(--nexus-surface-3)] hover:text-[var(--nexus-text-1)]'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {hasChildren ? (
          isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
        ) : (
          <span className="w-[13px]" />
        )}
        {hasChildren && isExpanded ? (
          <FolderOpen size={14} className={isSelected ? 'text-[var(--nexus-cyan)]' : 'text-[var(--nexus-text-3)]'} />
        ) : (
          <Icon size={14} className={isSelected ? 'text-[var(--nexus-cyan)]' : 'text-[var(--nexus-text-3)]'} />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{node.label}</span>
        {node.count != null && (
          <span className="rounded bg-[var(--nexus-surface-3)] px-1.5 py-0.5 font-mono-ui text-[10px] text-[var(--nexus-text-3)]">
            {formatCount(node.count)}
          </span>
        )}
      </button>
      {hasChildren && isExpanded && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onOpenRecords={onOpenRecords}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, accent = 'var(--nexus-cyan)' }) {
  return (
    <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">{label}</span>
        <Icon size={13} style={{ color: accent }} />
      </div>
      <p className="font-mono-ui text-xl font-extrabold text-[var(--nexus-text-1)]">{value ?? '--'}</p>
    </div>
  );
}

function EvidenceCard({ item }) {
  return (
    <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-3.5">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-[var(--nexus-cyan-dim)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-cyan)]">
          {item.type}
        </span>
        {item.link && (
          <span className="font-mono-ui text-[9px] text-[var(--nexus-text-3)]">{item.link}</span>
        )}
      </div>
      <p className="text-[13px] font-bold leading-5 text-[var(--nexus-text-1)]">{item.title}</p>
      <p className="mt-1 line-clamp-4 text-[12px] leading-5 text-[var(--nexus-text-2)]">{item.detail}</p>
      {item.meta && Object.keys(item.meta).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(item.meta).slice(0, 4).map(([key, value]) => (
            value == null ? null : (
              <span key={key} className="rounded border border-[var(--nexus-border)] px-1.5 py-0.5 font-mono-ui text-[9px] text-[var(--nexus-text-3)]">
                {key}: {String(value)}
              </span>
            )
          ))}
        </div>
      )}
    </div>
  );
}

function ActionButton({ action, onExecute, running, result }) {
  return (
    <button
      type="button"
      onClick={() => onExecute(action)}
      disabled={running}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${ACTION_STYLE[action.priority] || ACTION_STYLE.normal}`}
    >
      <span className="flex items-center gap-2 text-[13px] font-bold">
        {running && <Loader2 size={13} className="animate-spin" />}
        {!running && result?.state === 'success' && <CheckCircle2 size={13} />}
        {action.label}
      </span>
      <span className="mt-1 block text-[11px] leading-5 opacity-85">{action.description}</span>
      {action.operation && (
        <span className="mt-2 block font-mono-ui text-[9px] uppercase tracking-[0.12em] opacity-70">
          {action.operation.replace(/_/g, ' ')}
        </span>
      )}
      {result?.message && (
        <span className={`mt-2 block text-[10px] leading-4 ${result.state === 'error' ? 'text-[var(--nexus-red)]' : 'opacity-80'}`}>
          {result.message}
        </span>
      )}
    </button>
  );
}

function statusTone(state) {
  if (state === 'running') return 'border-cyan-400/30 bg-[var(--nexus-cyan-dim)] text-[var(--nexus-cyan)]';
  if (state === 'success') return 'border-emerald-400/30 bg-emerald-400/10 text-[var(--nexus-emerald)]';
  if (state === 'error') return 'border-red-400/30 bg-red-400/10 text-[var(--nexus-red)]';
  return 'border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] text-[var(--nexus-text-2)]';
}

function summarizeWorkflowStatus(actions = [], actionStatus = {}) {
  const executable = actions.filter((action) => action.operation);
  if (executable.length === 0) {
    return {
      state: 'ready',
      label: 'Navigation ready',
      detail: 'Open the linked NEXUS workspace to continue review.',
    };
  }

  const statuses = executable.map((action) => actionStatus[action.id || action.label]?.state).filter(Boolean);
  if (statuses.includes('running')) {
    return {
      state: 'running',
      label: 'Workflow running',
      detail: 'NEXUS is creating the selected operational record.',
    };
  }
  if (statuses.includes('error')) {
    return {
      state: 'error',
      label: 'Workflow needs attention',
      detail: 'An action failed. The card below shows the backend response.',
    };
  }
  if (statuses.includes('success')) {
    return {
      state: 'success',
      label: 'Workflow created',
      detail: 'The generated record is ready in its destination workspace.',
    };
  }
  return {
    state: 'ready',
    label: 'Ready to execute',
    detail: `${executable.length} action ${executable.length === 1 ? 'can' : 'cards can'} create workflow records.`,
  };
}

function ExecutionTimeline({ message, actionStatus }) {
  const context = message.context || {};
  const summary = context.summary || {};
  const evidenceCount = Array.isArray(message.evidence) ? message.evidence.length : 0;
  const incidentCount = Array.isArray(context.incidents) ? context.incidents.length : 0;
  const sopCount = Array.isArray(context.sops) ? context.sops.length : 0;
  const clusterCount = Array.isArray(context.clusters) ? context.clusters.length : 0;
  const rpaRuns = Array.isArray(context.rpa?.runs) ? context.rpa.runs.length : 0;
  const workflow = summarizeWorkflowStatus(message.actions || [], actionStatus);

  const steps = [
    {
      icon: Bot,
      label: 'Messy intake organized',
      detail: `${summary.totalInScope ?? evidenceCount} historical records are in this folder/query scope.`,
      state: 'success',
    },
    {
      icon: Database,
      label: 'Evidence pack assembled',
      detail: `${incidentCount} incidents, ${sopCount} SOPs, ${clusterCount} clusters, ${rpaRuns} RPA runs linked.`,
      state: 'success',
    },
    {
      icon: Brain,
      label: 'Root cause analysis generated',
      detail: message.summary || 'NEXUS Brain synthesized the answer from grounded evidence.',
      state: 'success',
    },
    {
      icon: Zap,
      label: 'Operational actions prepared',
      detail: `${message.actions?.length || 0} recommended next steps are available below.`,
      state: 'success',
    },
    {
      icon: workflow.state === 'error' ? AlertTriangle : workflow.state === 'running' ? Loader2 : CheckCircle2,
      label: workflow.label,
      detail: workflow.detail,
      state: workflow.state,
      spin: workflow.state === 'running',
    },
  ];

  return (
    <div className="mt-5 rounded-xl border border-[var(--nexus-border-bright)] bg-[var(--nexus-surface-2)] p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-2)]">
          Execution timeline
        </p>
        <span className="rounded bg-[var(--nexus-cyan-dim)] px-2 py-1 font-mono-ui text-[9px] uppercase tracking-[0.12em] text-[var(--nexus-cyan)]">
          Insight to action
        </span>
      </div>
      <div className="space-y-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className={`flex gap-3 rounded-lg border px-3 py-2 ${statusTone(step.state)}`}>
              <div className="flex flex-col items-center">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--nexus-surface-3)]">
                  <Icon size={14} className={step.spin ? 'animate-spin' : ''} />
                </span>
                {index < steps.length - 1 && <span className="mt-1 h-5 w-px bg-current opacity-20" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold leading-5">{step.label}</p>
                <p className="text-[11px] leading-5 opacity-85">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PRIORITY_STYLE = {
  critical: { pill: 'bg-red-500/15 text-[var(--nexus-red)] border border-red-500/30', bar: 'var(--nexus-red)', glow: 'rgba(212,5,17,0.08)', border: 'rgba(212,5,17,0.22)', top: 'var(--nexus-red)' },
  high:     { pill: 'bg-amber-500/15 text-[var(--nexus-amber)] border border-amber-500/30', bar: '#f59e0b', glow: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.22)', top: '#f59e0b' },
  medium:   { pill: 'bg-cyan-500/15 text-[var(--nexus-cyan)] border border-cyan-500/30', bar: 'var(--nexus-cyan)', glow: 'rgba(34,211,238,0.06)', border: 'rgba(34,211,238,0.2)', top: 'var(--nexus-cyan)' },
};

function ActionCard({ action, onNavigate, index }) {
  const [expanded, setExpanded] = useState(false);
  const s = PRIORITY_STYLE[action.priority] || PRIORITY_STYLE.medium;
  const confidence = Math.round((action.confidence || 0) * 100);

  return (
    <div
      style={{
        borderRadius: 14,
        border: `1px solid ${s.border}`,
        borderTop: `3px solid ${s.top}`,
        backgroundColor: `var(--nexus-surface-2)`,
        boxShadow: `0 8px 32px ${s.glow}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: `modalScaleIn 320ms ${index * 80}ms cubic-bezier(0.16,1,0.3,1) both`,
      }}
    >
      {/* Card header */}
      <div style={{ padding: '16px 18px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${s.pill}`}>
            {action.priority}
          </span>
          <span style={{ fontSize: 10, color: 'var(--nexus-text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={9} /> {action.timeframe}
          </span>
        </div>

        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: 'var(--nexus-text-1)', lineHeight: 1.3 }}>
          {action.title}
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--nexus-text-2)', lineHeight: 1.65 }}>
          {action.headline}
        </p>
      </div>

      {/* Signal chips */}
      {action.signals?.length > 0 && (
        <div style={{ padding: '0 18px 12px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {action.signals.map((sig, i) => (
            <span
              key={i}
              style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 99,
                backgroundColor: 'var(--nexus-surface-3)', color: 'var(--nexus-text-2)',
                border: '1px solid var(--nexus-border-bright)', fontWeight: 600,
              }}
            >
              {sig}
            </span>
          ))}
        </div>
      )}

      {/* Causal chain */}
      {action.causalChain && (
        <div style={{ margin: '0 18px 12px', borderRadius: 8, overflow: 'hidden', border: `1px solid ${s.border}`, backgroundColor: s.glow }}>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 10px', background: 'transparent', border: 'none',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Brain size={10} style={{ color: s.top, flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: s.top, flex: 1 }}>AI Reasoning Chain</span>
            <ChevronRight size={10} style={{ color: s.top, transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 180ms' }} />
          </button>
          {expanded && (
            <div style={{ padding: '4px 10px 10px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              {action.causalChain.split('→').map((part, i, arr) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--nexus-text-2)', lineHeight: 1.5 }}>{part.trim()}</span>
                  {i < arr.length - 1 && <ArrowRight size={11} style={{ color: s.top, flexShrink: 0 }} />}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spacer pushes footer down */}
      <div style={{ flex: 1 }} />

      {/* Card footer */}
      <div style={{
        padding: '10px 18px 14px', borderTop: '1px solid var(--nexus-border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {/* Confidence bar */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--nexus-text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Confidence</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: s.top }}>{confidence}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 99, backgroundColor: 'var(--nexus-border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${confidence}%`, borderRadius: 99, backgroundColor: s.top, boxShadow: `0 0 6px ${s.top}70`, transition: 'width 800ms cubic-bezier(0.4,0,0.2,1)' }} />
          </div>
          {action.estimatedImpact && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
              <TrendingUp size={9} style={{ color: 'var(--nexus-emerald)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--nexus-emerald)', fontWeight: 600 }}>{action.estimatedImpact}</span>
            </div>
          )}
        </div>

        {/* Action button */}
        {action.linkTo && (
          <button
            type="button"
            onClick={() => onNavigate(action.linkTo)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 14px', borderRadius: 9, flexShrink: 0,
              fontSize: 11, fontWeight: 800,
              backgroundColor: s.top, color: '#fff',
              border: 'none', cursor: 'pointer',
              boxShadow: `0 4px 14px ${s.glow}`,
              transition: 'transform 150ms, opacity 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.opacity = '1'; }}
          >
            Take action <ArrowRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function ActionPlanModal({ data, loading, error, onClose, onNavigate }) {
  const hub = data?.hub || 'Hub';
  const actions = data?.actions || [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--nexus-modal-backdrop)] p-6 backdrop-blur-sm overflow-y-auto">
      <div
        className="w-full max-w-5xl rounded-2xl border border-[var(--nexus-border-bright)] bg-[var(--nexus-surface-1)] shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
        style={{ animation: 'modalScaleIn 280ms cubic-bezier(0.16,1,0.3,1)', marginTop: 20, marginBottom: 40 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--nexus-border)', background: 'linear-gradient(135deg, rgba(212,5,17,0.06) 0%, transparent 60%)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(212,5,17,0.2), rgba(212,5,17,0.06))',
                border: '1px solid rgba(212,5,17,0.3)',
                boxShadow: '0 0 24px rgba(212,5,17,0.15)',
              }}>
                <Brain size={20} style={{ color: 'var(--nexus-red)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--nexus-red)' }}>
                    AI CROSS-SIGNAL SYNTHESIS
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, backgroundColor: 'rgba(212,5,17,0.1)', color: 'var(--nexus-red)', border: '1px solid rgba(212,5,17,0.2)' }}>
                    6 DATA STREAMS
                  </span>
                </div>
                <h2 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 900, color: 'var(--nexus-text-1)', letterSpacing: '-0.02em' }}>
                  Recommended Actions — {hub}
                </h2>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--nexus-text-3)' }}>
                  Incidents · Clusters · SLA · Customer Profiles · SOPs · RPA — synthesized in real time
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'var(--nexus-surface-3)', border: '1px solid var(--nexus-border)',
                cursor: 'pointer', transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--nexus-elevated)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--nexus-surface-3)'; }}
            >
              <X size={15} style={{ color: 'var(--nexus-text-3)' }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px 28px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 16, textAlign: 'center' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(212,5,17,0.15), rgba(212,5,17,0.05))',
                border: '1px solid rgba(212,5,17,0.25)',
              }}>
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--nexus-red)' }} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--nexus-text-1)', marginBottom: 6 }}>
                  AI synthesizing {hub} data
                </p>
                <p style={{ fontSize: 12, color: 'var(--nexus-text-3)', lineHeight: 1.7 }}>
                  Cross-referencing incidents, active clusters, SLA breaches,<br />
                  customer frustration history, SOP gaps, and RPA signals&hellip;
                </p>
              </div>
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: 16, borderRadius: 10, backgroundColor: 'rgba(212,5,17,0.07)', border: '1px solid rgba(212,5,17,0.2)', color: 'var(--nexus-red)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {!loading && !error && actions.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--nexus-text-3)', fontSize: 13 }}>
              No actionable signals detected for {hub} in the current 72-hour window.
            </div>
          )}

          {!loading && !error && actions.length > 0 && (
            <>
              <p style={{ fontSize: 11, color: 'var(--nexus-text-3)', marginBottom: 16, lineHeight: 1.65 }}>
                The following recommendations were generated by synthesizing{' '}
                <strong style={{ color: 'var(--nexus-text-2)' }}>6 operational data streams</strong> simultaneously.
                Each card surfaces a pattern that would take a human analyst hours to derive manually.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {actions.map((action, i) => (
                  <ActionCard key={i} action={action} index={i} onNavigate={(link) => { onClose(); onNavigate(link); }} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordModal({ data, selectedId, onSelect, loading, error, onClose, onNavigate }) {
  if (data?.isActionPlan) {
    return <ActionPlanModal data={data} loading={loading} error={error} onClose={onClose} onNavigate={onNavigate} />;
  }

  const records = data?.records || [];
  const selected = records.find((record) => record.id === selectedId) || records[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nexus-modal-backdrop)] p-6 backdrop-blur-sm">
      <div className="flex h-[82vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-[var(--nexus-border-bright)] bg-[var(--nexus-surface-1)] shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
        <div className="flex w-[380px] shrink-0 flex-col border-r border-[var(--nexus-border-bright)]">
          <div className="border-b border-[var(--nexus-border-bright)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--nexus-cyan)]">Folder records</p>
                <h3 className="mt-1 text-lg font-extrabold text-[var(--nexus-text-1)]">{data?.folderLabel || 'NEXUS records'}</h3>
                <p className="mt-1 text-[12px] text-[var(--nexus-text-3)]">{records.length} records loaded</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--nexus-border-bright)] text-[var(--nexus-text-2)] transition-colors hover:bg-[var(--nexus-surface-3)] hover:text-[var(--nexus-text-1)]"
                aria-label="Close records"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading && (
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(34,211,238,0.18)] bg-[var(--nexus-cyan-dim)] p-3 text-[13px] text-[var(--nexus-cyan)]">
                <Loader2 size={15} className="animate-spin" />
                Loading folder records...
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-red-500/25 bg-[var(--nexus-red-dim)] p-3 text-[13px] text-[var(--nexus-red)]">
                {error}
              </div>
            )}
            {!loading && !error && records.length === 0 && (
              <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-3 text-[13px] text-[var(--nexus-text-2)]">
                No records were found for this folder.
              </div>
            )}
            <div className="space-y-2">
              {records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onSelect(record.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    selected?.id === record.id
                      ? 'border-cyan-400/35 bg-[var(--nexus-cyan-dim)] text-[var(--nexus-text-1)]'
                      : 'border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] text-[var(--nexus-text-2)] hover:border-cyan-400/20 hover:bg-[var(--nexus-surface-3)] hover:text-[var(--nexus-text-1)]'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-[var(--nexus-cyan-dim)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-cyan)]">
                      {record.type}
                    </span>
                    {record.meta?.status && <span className="text-[10px] font-semibold text-[var(--nexus-text-3)]">{record.meta.status}</span>}
                  </div>
                  <p className="line-clamp-2 text-[13px] font-bold leading-5">{record.title}</p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--nexus-text-3)]">{record.detail}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-5">
          {selected ? (
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <span className="rounded bg-[var(--nexus-cyan-dim)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-cyan)]">
                    {selected.type}
                  </span>
                  <h2 className="mt-3 text-2xl font-extrabold leading-tight text-[var(--nexus-text-1)]">{selected.title}</h2>
                </div>
                {selected.link && (
                  <button
                    type="button"
                    onClick={() => onNavigate(selected.link)}
                    className="flex shrink-0 items-center gap-2 rounded-lg border border-cyan-400/25 bg-[var(--nexus-cyan-dim)] px-3 py-2 text-[12px] font-bold text-[var(--nexus-cyan)] transition-colors hover:bg-cyan-400/15"
                  >
                    <ExternalLink size={14} />
                    Open
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--nexus-border-bright)] bg-[var(--nexus-surface-2)] p-4">
                <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--nexus-text-1)]">{selected.detail}</p>
              </div>

              {selected.meta && Object.keys(selected.meta).length > 0 && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {Object.entries(selected.meta).map(([key, value]) => (
                    value == null || value === '' ? null : (
                      <div key={key} className="rounded-xl border border-[var(--nexus-border-bright)] bg-[var(--nexus-surface-2)] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">{key}</p>
                        <p className="mt-1 break-words text-[13px] font-semibold text-[var(--nexus-text-1)]">{String(value)}</p>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* Attachment evidence — auto-renders if this record's underlying
                  incident has any saved Vision-extracted images. Returns null
                  silently when there are no attachments, so non-image records
                  (SOPs, RPA runs, customers) don't show empty state. */}
              {(() => {
                const incidentId =
                  // incident-type records: raw is the incident doc itself
                  (selected.raw?._id && (selected.type === 'incident' ||
                                         selected.type === 'ai_classification' ||
                                         selected.type === 'hitl_review' ||
                                         selected.type === 'sla_breach' ||
                                         selected.type === 'recovery_pending' ||
                                         selected.type === 'chat_followup' ||
                                         selected.type === 'roi_contribution')) ? selected.raw._id
                    // FeedbackDatasetEntry / RpaRunItem: incidentId is a separate field
                    : (selected.raw?.incidentId || null);
                if (!incidentId) return null;
                return (
                  <div className="mt-4">
                    <IncidentAttachments incidentId={incidentId} />
                  </div>
                );
              })()}

              {selected.raw && (
                <details className="mt-4 rounded-xl border border-[var(--nexus-border-bright)] bg-[var(--nexus-surface-1)] p-3">
                  <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-2)]">
                    Raw record
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--nexus-surface-3)] p-3 font-mono-ui text-[11px] leading-5 text-[var(--nexus-text-2)]">
                    {JSON.stringify(selected.raw, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-[14px] text-[var(--nexus-text-3)]">
              Select a record to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NexusBrain() {
  const navigate = useNavigate();
  const [folderData, setFolderData] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState({ id: 'root', label: 'All NEXUS knowledge' });
  const [expanded, setExpanded] = useState(() => new Set(['hubs', 'incidents', 'types', 'sops', 'insights']));
  const [query, setQuery] = useState('Why is Shah Alam Hub having too many problems recently?');
  const [messages, setMessages] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [actionStatus, setActionStatus] = useState({});
  const [recordsModal, setRecordsModal] = useState({
    open: false,
    loading: false,
    error: '',
    data: null,
    selectedId: null,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getBrainFolders()
      .then((data) => {
        if (!active) return;
        setFolderData(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load NEXUS Brain folders.');
      })
      .finally(() => {
        if (active) setLoadingFolders(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const flatFolders = useMemo(() => flattenTree(folderData?.tree || []), [folderData]);
  const selectedPath = flatFolders.find((item) => item.id === selectedFolder.id)?.path || [selectedFolder.label];

  const toggleFolder = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openRecordsModal = async (folder = selectedFolder) => {
    const isActionFolder = folder.kind === 'actions' || folder.id?.endsWith('/actions');
    let hubName = folder.label;
    if (isActionFolder && folder.id) {
      const hubSlug = folder.id.split('/')[1];
      const hubNode = flatFolders.find((n) => n.id === `hubs/${hubSlug}`);
      if (hubNode) hubName = hubNode.label;
    }
    setRecordsModal({
      open: true,
      loading: true,
      error: '',
      data: isActionFolder
        ? { folderLabel: folder.label, records: [], isActionPlan: true, hub: hubName, actions: [] }
        : { folderLabel: folder.label, records: [] },
      selectedId: null,
    });

    try {
      const data = await getBrainRecords(folder.id, 50);
      setRecordsModal({
        open: true,
        loading: false,
        error: '',
        data,
        selectedId: data.records?.[0]?.id || null,
      });
    } catch (err) {
      setRecordsModal({
        open: true,
        loading: false,
        error: err.message || 'Unable to load folder records.',
        data: isActionFolder
          ? { folderLabel: folder.label, records: [], isActionPlan: true, hub: hubName, actions: [] }
          : { folderLabel: folder.label, records: [] },
        selectedId: null,
      });
    }
  };

  const submitQuery = async (text = query) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || thinking) return;

    setQuery('');
    setError('');
    setActionStatus({});
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: trimmed, folderLabel: selectedFolder.label },
    ]);
    setThinking(true);

    try {
      const response = await queryBrain({
        query: trimmed,
        folderId: selectedFolder.id,
        mode: 'deep_analysis',
      });
      setMessages((prev) => [...prev, { role: 'assistant', ...response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          answer: 'NEXUS Brain could not complete the analysis. Check backend connectivity and try again.',
          summary: err.message || 'Analysis failed',
          evidence: [],
          actions: [],
          reasoningStages: ['request failed before evidence synthesis completed'],
          confidence: 0,
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const executeAction = async (action) => {
    const key = action.id || action.label;
    if (!action.operation) {
      if (action.target) navigate(action.target);
      return;
    }

    setActionStatus((prev) => ({
      ...prev,
      [key]: { state: 'running', message: 'Creating workflow record...' },
    }));

    try {
      if (action.operation === 'generate_proactive') {
        await generateProactiveDocs(action.payload || {});
        setActionStatus((prev) => ({
          ...prev,
          [key]: { state: 'success', message: 'Proactive alert draft created.' },
        }));
        navigate(action.target || '/proactive');
        return;
      }

      if (action.operation === 'generate_sop') {
        const payload = action.payload || {};
        await generateSop(payload.incidentType, payload.location, payload.clusterId || null);
        setActionStatus((prev) => ({
          ...prev,
          [key]: { state: 'success', message: 'SOP draft created.' },
        }));
        navigate(action.target || '/knowledge');
        return;
      }

      if (['create_sop', 'fire_proactive_notice', 'flag_customer_account'].includes(action.operation)) {
        const result = await executeBrainAction({
          operation: action.operation,
          payload: action.payload || {},
          query: action.label,
        });
        setActionStatus((prev) => ({
          ...prev,
          [key]: {
            state: 'success',
            message: result.alreadyExists
              ? 'Already exists — no new record created.'
              : (result.message || 'Action executed.'),
          },
        }));
        return;
      }

      if (action.target) navigate(action.target);
    } catch (err) {
      setActionStatus((prev) => ({
        ...prev,
        [key]: {
          state: 'error',
          message: err.message || 'Action could not be completed.',
        },
      }));
    }
  };

  const folderPrompts = [
    `Summarize the risk inside ${selectedFolder.label}.`,
    `What is the root cause pattern in ${selectedFolder.label}?`,
    `Which action should DHL take first for ${selectedFolder.label}?`,
  ];

  return (
    <Layout title="NEXUS Brain">
      {recordsModal.open && (
        <RecordModal
          data={recordsModal.data}
          selectedId={recordsModal.selectedId}
          loading={recordsModal.loading}
          error={recordsModal.error}
          onSelect={(selectedId) => setRecordsModal((prev) => ({ ...prev, selectedId }))}
          onClose={() => setRecordsModal((prev) => ({ ...prev, open: false }))}
          onNavigate={(target) => {
            setRecordsModal((prev) => ({ ...prev, open: false }));
            navigate(target);
          }}
        />
      )}
      <div className="flex h-[calc(100vh-96px)] min-h-[680px] gap-5 overflow-hidden">
        <aside className="flex min-h-0 w-[320px] shrink-0 flex-col rounded-2xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-bg)]">
          <div className="border-b border-[var(--nexus-border)] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--nexus-cyan-dim)]">
                <Brain size={20} className="text-[var(--nexus-cyan)]" />
              </div>
              <div>
                <h2 className="text-[15px] font-extrabold text-[var(--nexus-text-1)]">NEXUS Brain</h2>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
                  Historical Memory
                </p>
              </div>
            </div>
          </div>

          {folderData?.stats && (
            <div className="grid grid-cols-2 gap-2 border-b border-[var(--nexus-border)] p-3">
              <StatTile label="Incidents" value={folderData.stats.totalIncidents} icon={ClipboardList} />
              <StatTile label="Vectors" value={folderData.stats.totalEmbeddings} icon={Database} accent="#FF8C00" />
              <StatTile label="SOPs" value={folderData.stats.publishedSops} icon={FileText} accent="#f59e0b" />
              <StatTile label="RPA Runs" value={folderData.stats.totalRuns} icon={Bot} accent="#10b981" />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingFolders ? (
              <div className="flex items-center gap-2 p-3 text-[12px] text-[var(--nexus-text-3)]">
                <Loader2 size={14} className="animate-spin" />
                Loading knowledge tree...
              </div>
            ) : (
              <div className="space-y-1">
                {(folderData?.tree || []).map((node) => (
                  <FolderNode
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedFolder.id}
                    expanded={expanded}
                    onToggle={toggleFolder}
                    onSelect={setSelectedFolder}
                    onOpenRecords={openRecordsModal}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <div
          className="grid min-h-0 min-w-0 flex-1 gap-5 overflow-hidden"
          style={{ gridTemplateColumns: 'minmax(380px, 440px) minmax(0, 1fr)' }}
        >
        <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
          <div className="rounded-2xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
                  Selected Folder
                </p>
                <h2 className="mt-1 text-lg font-extrabold text-[var(--nexus-text-1)]">{selectedFolder.label}</h2>
                <p className="mt-1 text-[12px] text-[var(--nexus-text-3)]">
                  {selectedPath.join(' / ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => openRecordsModal(selectedFolder)}
                  className="flex items-center gap-2 rounded-full border border-[rgba(34,211,238,0.25)] bg-[var(--nexus-cyan-dim)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-cyan)] transition-colors hover:bg-[var(--nexus-surface-3)]"
                >
                  <Eye size={12} />
                  View Records
                </button>
                <span className="rounded-full border border-[rgba(34,211,238,0.25)] bg-[var(--nexus-cyan-dim)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-cyan)]">
                  Smart Folder
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              {folderPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => submitQuery(prompt)}
                  className="flex items-center gap-2 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] px-3 py-2.5 text-left text-[13px] font-semibold leading-5 text-[var(--nexus-text-2)] transition-colors hover:border-[rgba(34,211,238,0.25)] hover:text-[var(--nexus-text-1)]"
                >
                  <Search size={13} className="text-[var(--nexus-cyan)]" />
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-bg)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-extrabold uppercase tracking-[0.12em] text-[var(--nexus-text-1)]">
                Evidence Stream
              </h3>
              <span className="text-[11px] text-[var(--nexus-text-3)]">Updates after each question</span>
            </div>

            {messages.filter((msg) => msg.role === 'assistant').length === 0 ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--nexus-cyan-dim)]">
                  <Database size={22} className="text-[var(--nexus-cyan)]" />
                </div>
                <p className="max-w-md text-[14px] leading-6 text-[var(--nexus-text-2)]">
                  Ask a question to pull incident history, SOPs, RPA runs, customer signals, clusters, and audit evidence into one answer.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages
                  .filter((msg) => msg.role === 'assistant')
                  .slice(-2)
                  .flatMap((msg) => msg.evidence || [])
                  .slice(0, 12)
                  .map((item) => (
                    <EvidenceCard key={item.id} item={item} />
                  ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-bg)]">
          <div className="border-b border-[var(--nexus-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--nexus-red-dim)]">
                  <Sparkles size={18} className="text-[var(--nexus-red)]" />
                </div>
                <div>
                  <h2 className="text-[15px] font-extrabold text-[var(--nexus-text-1)]">AI Incident Analyst</h2>
                  <p className="text-[11px] text-[var(--nexus-text-3)]">
                    Folder: {selectedFolder.label}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-emerald)]">
                Grounded
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-[rgba(34,211,238,0.18)] bg-[var(--nexus-cyan-dim)] p-4">
                  <p className="text-[13px] leading-6 text-[var(--nexus-text-2)]">
                    NEXUS Brain can inspect the whole historical memory and turn it into root causes, evidence, and actions.
                  </p>
                </div>
                <div className="grid gap-2">
                  {DEMO_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => submitQuery(prompt)}
                      className="flex items-center gap-2 rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] px-3 py-2.5 text-left text-[13px] font-semibold text-[var(--nexus-text-2)] transition-colors hover:border-[rgba(212,5,17,0.3)] hover:text-[var(--nexus-text-1)]"
                    >
                      <MessageSquare size={14} className="text-[var(--nexus-red)]" />
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6">
              {messages.map((msg, index) => {
                if (msg.role === 'user') {
                  return (
                    <div key={index} className="flex justify-end">
                      <div className="max-w-[76%] rounded-2xl rounded-br-md border border-[var(--nexus-border-bright)] bg-[var(--nexus-surface-3)] px-4 py-3">
                        <p className="text-[13px] leading-6 text-[var(--nexus-text-1)]">{msg.content}</p>
                        <p className="mt-1 text-[10px] text-[var(--nexus-text-3)]">{msg.folderLabel}</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={index} className="max-w-[92%]">
                    <div className="mb-2 flex items-center gap-2">
                      <Brain size={14} className="text-[var(--nexus-red)]" />
                      <span className="font-mono-ui text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-red)]">
                        NEXUS Brain
                      </span>
                      <span className="rounded bg-[var(--nexus-cyan-dim)] px-1.5 py-0.5 font-mono-ui text-[9px] text-[var(--nexus-cyan)]">
                        {Math.round((msg.confidence || 0) * 100)}% confidence
                      </span>
                    </div>
                    <div className="rounded-2xl rounded-tl-md border border-[var(--nexus-border-bright)] bg-[var(--nexus-panel-solid)] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
                      {msg.headline && (
                        <div className="mb-4 rounded-xl border border-[rgba(212,5,17,0.25)] bg-[rgba(212,5,17,0.06)] px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--nexus-red)]">
                            Headline
                          </p>
                          <p className="mt-1 text-[15px] font-semibold leading-6 text-[var(--nexus-text-1)]">
                            {msg.headline}
                          </p>
                        </div>
                      )}
                      <div className="space-y-2">{normalizeAnswer(msg.answer)}</div>

                      {msg.reasoningStages?.length > 0 && (
                        <div className="mt-5 rounded-xl border border-[var(--nexus-border-bright)] bg-[var(--nexus-surface-2)] p-3.5">
                          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-2)]">
                            Reasoning stages
                          </p>
                          <div className="space-y-2">
                            {msg.reasoningStages.map((stage, stageIndex) => (
                              <div key={`${stage}-${stageIndex}`} className="flex gap-2 rounded-lg border border-[rgba(34,211,238,0.12)] bg-[var(--nexus-cyan-dim)] px-3 py-2">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--nexus-cyan-dim)] font-mono-ui text-[10px] font-bold text-[var(--nexus-cyan)]">
                                  {stageIndex + 1}
                                </span>
                                <span className="text-[12px] leading-5 text-[var(--nexus-text-2)]">{stage}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <ExecutionTimeline message={msg} actionStatus={actionStatus} />

                      {msg.actions?.length > 0 && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {msg.actions.map((action) => {
                            const key = action.id || action.label;
                            return (
                              <ActionButton
                                key={key}
                                action={action}
                                onExecute={executeAction}
                                running={actionStatus[key]?.state === 'running'}
                                result={actionStatus[key]}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {thinking && (
                <div className="max-w-[80%] rounded-2xl rounded-tl-md border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-4">
                  <div className="flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-[var(--nexus-cyan)]" />
                    <div>
                      <p className="text-[12px] font-bold text-[var(--nexus-text-1)]">Building evidence pack</p>
                      <p className="text-[11px] text-[var(--nexus-text-3)]">
                        Incidents, SOPs, RPA, customers, clusters, AI decisions
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--nexus-border)] p-4">
            {error && (
              <p className="mb-2 rounded-lg border border-red-500/25 bg-[var(--nexus-red-dim)] px-3 py-2 text-[12px] text-[var(--nexus-red)]">
                {error}
              </p>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-2">
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitQuery();
                  }
                }}
                rows={2}
                disabled={thinking}
                placeholder="Ask NEXUS Brain anything about incidents, hubs, customers, SOPs, RPA, or root causes..."
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-6 text-[var(--nexus-text-1)] outline-none placeholder:text-[var(--nexus-text-3)] disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => submitQuery()}
                disabled={!query.trim() || thinking}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--nexus-red)] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send question"
              >
                {thinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </section>
        </div>
      </div>
    </Layout>
  );
}
