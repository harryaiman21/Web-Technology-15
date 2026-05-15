import { useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowUpCircle, Bell, BookOpen, Brain,
  CheckCircle2, Copy, Database, FileSearch, FileText, RefreshCw, Shield, Tag, Zap,
} from 'lucide-react';

/* ── Agent config ─────────────────────────────────────────────────────────────── */

const AGENT_META = {
  intake:        { icon: FileSearch, color: '#fbbf24', label: 'Intake Agent' },
  'ml-service':  { icon: Zap,       color: '#3b82f6', label: 'ML Classifier' },
  classifier:    { icon: Tag,       color: '#FFCC00', label: 'AI Classifier' },
  dedup:         { icon: Copy,      color: '#FF8C00', label: 'Dedup Agent' },
  'case-memory': { icon: BookOpen,  color: '#FFCC00', label: 'Case Memory' },
  resolution:    { icon: CheckCircle2, color: '#34d399', label: 'Resolution Agent' },
  shap:          { icon: Activity,  color: '#f97316', label: 'SHAP Explainer' },
};

const AUTO_META = {
  auto_escalate:    { icon: ArrowUpCircle, color: '#ef4444', label: 'Auto-Escalation' },
  auto_acknowledge: { icon: Bell,          color: '#3b82f6', label: 'Auto-Acknowledge' },
  auto_resolved:    { icon: CheckCircle2,  color: '#10b981', label: 'Auto-Resolved' },
  service_recovery: { icon: Shield,        color: '#34d399', label: 'Service Recovery' },
  sla_monitor:      { icon: Activity,      color: '#fbbf24', label: 'SLA Monitor' },
  rate_limited:     { icon: AlertTriangle, color: '#f97316', label: 'Rate Limited' },
  kill_switch:      { icon: Shield,        color: '#64748b', label: 'Kill Switch' },
};

/* ── Helpers ──────────────────────────────────────────────────────────────────── */

function formatTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function buildAgentMessage(agent, data) {
  const conf = data?.confidence;
  const confStr = conf != null ? ` | Confidence: ${Math.round(conf * 100)}%` : '';

  switch (agent) {
    case 'intake':
      return `Extracted structured fields from raw input${confStr}`;
    case 'ml-service': {
      const pred = data?.prediction || data?.type;
      return pred
        ? `ML prediction: ${pred.replace(/_/g, ' ')}${confStr}`
        : `ML classification complete${confStr}`;
    }
    case 'classifier': {
      const type = data?.type || data?.incidentType;
      const sev = data?.severity;
      const parts = [];
      if (type) parts.push(type.replace(/_/g, ' '));
      if (sev) parts.push(`Severity: ${sev}`);
      return parts.length
        ? `Classification: ${parts.join(' | ')}${confStr}`
        : `AI classification complete${confStr}`;
    }
    case 'dedup': {
      const isDup = data?.isDuplicate || data?.duplicateDetected;
      return isDup
        ? `Duplicate detected - matched to existing incident`
        : `No duplicates found in ${data?.candidatesChecked || 'existing'} records`;
    }
    case 'case-memory': {
      const count = data?.similarCases?.length || data?.matchCount || 0;
      return count > 0
        ? `Found ${count} similar historical case${count > 1 ? 's' : ''} in memory`
        : 'No similar cases found in knowledge base';
    }
    case 'resolution': {
      const sop = data?.sopCode || data?.matchedSop;
      return sop
        ? `Matched SOP: ${sop} - resolution steps generated`
        : 'Resolution recommendation generated';
    }
    case 'shap':
      return 'SHAP explainability analysis complete - feature attributions calculated';
    default:
      return `${agent} processing complete${confStr}`;
  }
}

function buildAutoMessage(action) {
  switch (action.action) {
    case 'auto_escalate':
      return `Escalated to ${action.detail || 'department'} - Critical severity detected`;
    case 'auto_acknowledge':
      return 'Customer acknowledgement notification queued';
    case 'service_recovery':
      return 'Service recovery message prepared for customer';
    case 'sla_monitor':
      return 'SLA breach monitoring activated';
    case 'rate_limited':
      return 'Rate limit reached (50/hr) - escalation deferred';
    case 'kill_switch':
      return 'Autonomous actions paused by administrator';
    default:
      return action.label || action.action;
  }
}

/* ── Feed Entry ──────────────────────────────────────────────────────────────── */

function FeedEntry({ entry }) {
  const Icon = entry.icon;
  return (
    <div className="feed-entry">
      <div
        className="feed-entry__icon"
        style={{ background: `${entry.color}18`, color: entry.color }}
      >
        <Icon size={11} />
      </div>
      <span className="feed-entry__time">{entry.time}</span>
      <div className="feed-entry__text">
        <span className="agent-name">{entry.label}</span>
        {' '}
        {entry.message}
        {entry.highlight && (
          <span className="value-highlight"> {entry.highlight}</span>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────────────── */

export default function LiveIntelFeed({ className = '', maxEntries = 50 }) {
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef(null);
  const entryIdRef = useRef(0);

  // Auto-scroll on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  // SSE connection to ops live stream
  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const es = new EventSource(`${baseUrl}/api/v1/ops/live-stream`, {
      withCredentials: true,
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        let entry = null;

        if (data.type === 'learning_event') {
          const LEARN_CFG = {
            absorbed:         { icon: Database, color: '#34d399', label: 'Continuous Learning', highlight: 'LEARNED' },
            corrected:        { icon: Database, color: '#FFCC00', label: 'Corpus Correction', highlight: 'CORRECTED' },
            retrain_started:  { icon: RefreshCw, color: '#f97316', label: 'Auto-Retrain', highlight: 'TRAINING' },
            retrain_complete: { icon: RefreshCw, color: '#10b981', label: 'Auto-Retrain', highlight: 'COMPLETE' },
            retrain_failed:   { icon: RefreshCw, color: '#ef4444', label: 'Auto-Retrain', highlight: 'FAILED' },
          };
          const cfg = LEARN_CFG[data.action];
          if (cfg) {
            entry = {
              id: ++entryIdRef.current,
              time: formatTime(data.timestamp),
              icon: cfg.icon,
              color: cfg.color,
              label: cfg.label,
              message: data.message || `Learning event: ${data.action}`,
              highlight: cfg.highlight,
            };
          }
        } else if (data.agentId && AGENT_META[data.agentId]) {
          const meta = AGENT_META[data.agentId];
          entry = {
            id: ++entryIdRef.current,
            time: formatTime(data.timestamp),
            icon: meta.icon,
            color: meta.color,
            label: meta.label,
            message: buildAgentMessage(data.agentId, data),
            highlight: data.confidence != null ? `${Math.round(data.confidence * 100)}%` : null,
          };
        } else if (data.type === 'sop_generated') {
          entry = {
            id: ++entryIdRef.current,
            time: formatTime(data.timestamp),
            icon: FileText,
            color: '#FF8C00',
            label: 'SOP Intelligence',
            message: data.message || `SOP auto-drafted: ${(data.incidentType || '').replace(/_/g, ' ')} at ${data.location || 'unknown'}`,
            highlight: `${data.evidenceCount || 0} CASES`,
          };
        } else if (data.type === 'hitl_decision') {
          const held = data.holdForReview;
          entry = {
            id: ++entryIdRef.current,
            time: formatTime(data.timestamp),
            icon: held ? AlertTriangle : CheckCircle2,
            color: held ? '#fbbf24' : '#34d399',
            label: 'HITL Gate',
            message: held ? 'Held for human review' : 'Auto-approved - confidence threshold met',
            highlight: held ? 'PENDING REVIEW' : 'APPROVED',
          };
        } else if (data.type === 'pipeline_complete') {
          const ref = data.incidentRef || data.reference;
          entry = {
            id: ++entryIdRef.current,
            time: formatTime(data.timestamp),
            icon: CheckCircle2,
            color: '#34d399',
            label: 'Pipeline Complete',
            message: ref ? `Incident ${ref} fully processed` : 'Incident processing complete',
            highlight: ref || null,
          };
        } else if (data.type === 'uncertainty_signal') {
          const level = data.level || 'unknown';
          const score = data.score != null ? Math.round(data.score * 100) : null;
          entry = {
            id: ++entryIdRef.current,
            time: formatTime(data.timestamp),
            icon: AlertTriangle,
            color: level === 'high' ? '#ef4444' : level === 'medium' ? '#fbbf24' : '#34d399',
            label: 'Trust Assessment',
            message: `Uncertainty: ${level}`,
            highlight: score != null ? `${score}%` : null,
          };
        } else if (data.type === 'autonomous_actions') {
          const actions = data.actions || [];
          actions.forEach(action => {
            const meta = AUTO_META[action.action] || { icon: Zap, color: '#94a3b8', label: action.action };
            setEntries(prev => [...prev.slice(-maxEntries + 1), {
              id: ++entryIdRef.current,
              time: formatTime(action.timestamp),
              icon: meta.icon, color: meta.color, label: meta.label,
              message: buildAutoMessage(action),
            }]);
          });
        }

        if (entry) {
          setEntries(prev => [...prev.slice(-maxEntries + 1), entry]);
        }
      } catch { /* ignore malformed events */ }
    };

    return () => es.close();
  }, [maxEntries]);

  return (
    <div className={`flex h-full flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--nexus-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-[var(--nexus-cyan)]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-cyan)]">
            Live Intel
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`status-dot ${connected ? 'status-dot--live' : 'status-dot--warning'}`} />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--nexus-text-3)]">
            {connected ? 'Connected' : 'Connecting'}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--nexus-cyan-dim)]">
              <Brain size={18} className="text-[var(--nexus-cyan)]" />
            </div>
            <p className="text-center text-[11px] text-[var(--nexus-text-3)]">
              Submit an incident to see the AI pipeline narrate its reasoning in real-time
            </p>
            <div className="data-flow-line mt-2 w-3/4 rounded-full" />
          </div>
        ) : (
          entries.map(entry => <FeedEntry key={entry.id} entry={entry} />)
        )}
      </div>

      {/* Stats footer */}
      <div className="flex items-center justify-between border-t border-[var(--nexus-border)] px-4 py-2">
        <span className="font-mono-ui text-[9px] text-[var(--nexus-text-3)]">
          {entries.length} events
        </span>
        <button
          type="button"
          onClick={() => setEntries([])}
          className="text-[9px] font-semibold uppercase tracking-wider text-[var(--nexus-text-3)] transition-colors hover:text-[var(--nexus-cyan)]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
