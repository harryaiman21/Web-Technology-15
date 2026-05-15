import { Brain, Clock3, Cpu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import Badge from './Badge';
import ConfidenceBar from './ConfidenceBar';

/* ── Confidence Ring ──────────────────────────────────────────────────────────── */
function ConfidenceRing({ value, size = 36 }) {
  const pct = Math.round((value || 0) * 100);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (value || 0));
  const color = pct >= 80 ? '#34d399' : pct >= 60 ? '#22d3ee' : pct >= 40 ? '#fbbf24' : '#ef4444';
  return (
    <div className="confidence-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} className="confidence-ring__track" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className="confidence-ring__fill"
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 4px ${color}50)` }}
        />
      </svg>
      <span className="confidence-ring__value font-mono-ui" style={{ color, fontSize: 9 }}>{pct}</span>
    </div>
  );
}

function timeAgo(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const diffHours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3600000));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const days = Math.round(diffHours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function severityBarColor(severity) {
  if (severity === 'Critical') return 'bg-[var(--accent-red)]';
  if (severity === 'High') return 'bg-[var(--accent-amber)]';
  if (severity === 'Medium') return 'bg-[var(--accent-blue)]';
  return 'bg-[var(--accent-green)]';
}

function typeAccent(type) {
  switch (type) {
    case 'damaged_parcel':
      return 'border-[var(--accent-red)]';
    case 'late_delivery':
      return 'border-[var(--accent-amber)]';
    case 'system_error':
      return 'border-[var(--accent-blue)]';
    default:
      return 'border-[var(--text-2)]';
  }
}

// ── Feature 2: SLA Breach Probability Gauge ───────────────────────────────────
function breachGaugeColor(prob) {
  if (prob >= 0.8)  return { bar: 'bg-[var(--accent-red)]',   text: 'text-[var(--accent-red)]' };
  if (prob >= 0.6)  return { bar: 'bg-orange-500',             text: 'text-orange-400' };
  if (prob >= 0.3)  return { bar: 'bg-[var(--accent-amber)]',  text: 'text-[var(--accent-amber)]' };
  return             { bar: 'bg-[var(--accent-green)]',        text: 'text-[var(--accent-green)]' };
}

function SlaBreachGauge({ sla, status }) {
  // Breached state
  if (status === 'BREACHED' || (sla?.breachedAt)) {
    const hoursAgo = sla?.hoursRemaining != null
      ? Math.abs(sla.hoursRemaining).toFixed(1)
      : '?';
    return (
      <div className="mt-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-red)] animate-pulse motion-reduce:animate-none" aria-hidden />
        <span className="text-[11px] font-semibold text-[var(--accent-red)] uppercase tracking-wide">
          BREACHED · {hoursAgo}h ago
        </span>
      </div>
    );
  }

  // No SLA data yet — incident still in pipeline
  if (!sla?.breachProbability && sla?.breachProbability !== 0) {
    return (
      <div className="mt-3 text-[11px] text-[var(--text-3)]">SLA calculating…</div>
    );
  }

  const prob    = Number(sla.breachProbability ?? 0);
  const pct     = Math.round(prob * 100);
  const hours   = sla.hoursRemaining != null ? sla.hoursRemaining : null;
  const colors  = breachGaugeColor(prob);
  const isPulsing = prob >= 0.8;

  return (
    <div className="mt-3 space-y-1">
      {/* Bar */}
      <div className="h-1 w-full rounded-full bg-[var(--surface-3)]">
        <div
          className={`h-1 rounded-full transition-all duration-500 ${colors.bar} ${isPulsing ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          style={{ width: `${Math.min(100, pct)}%` }}
          aria-label={`${pct}% SLA breach risk`}
        />
      </div>
      {/* Label */}
      <div className={`flex items-center justify-between text-[10px] font-medium ${colors.text}`}>
        <span>
          {isPulsing && <span className="mr-1" aria-hidden>●</span>}
          {pct}% breach risk
        </span>
        {hours != null && (
          <span className="text-[var(--text-3)]">
            {hours >= 0 ? `${hours.toFixed(1)}h remaining` : `${Math.abs(hours).toFixed(1)}h overdue`}
          </span>
        )}
      </div>
    </div>
  );
}

export default function IncidentCard({ incident, onClick }) {
  const navigate = useNavigate();
  const agentCount = Object.keys(incident.agentResults || {}).length;
  const title = incident.title || incident.description || 'Untitled incident';

  const dedupResult = incident.agentResults?.dedup || incident.agentResults?.deduplication || incident.agentResults?.duplicateCheck;
  const duplicateOfId = dedupResult?.duplicateOf || dedupResult?.matchedIncidentId || dedupResult?.originalIncidentId;
  const isDuplicate = dedupResult?.isDuplicate || dedupResult?.duplicateDetected || incident.clusterGroup;

  const handleDuplicateClick = (e) => {
    if (duplicateOfId) {
      e.stopPropagation();
      navigate(`/incidents/${duplicateOfId}`);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="nexus-card-glow group w-full rounded-[10px] border border-[var(--nexus-border)] p-4 text-left transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[rgba(34,211,238,0.2)]"
      style={{
        background: 'var(--nexus-panel-bg)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`border-l-[3px] pl-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-2)] ${typeAccent(incident.type)}`}>
            {String(incident.type || 'unclassified').replace(/_/g, ' ')}
          </span>
          {incident.department && (
            <span className="rounded-full bg-[var(--nexus-surface-3)] px-2 py-0.5 text-[9px] font-medium text-[var(--nexus-text-3)]">
              {incident.department}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="severity" value={incident.severity || 'Low'} />
        </div>
      </div>

      <div className="mt-2.5 flex items-start gap-3">
        {/* Confidence ring */}
        <ConfidenceRing value={incident.confidence || 0} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[13px] font-medium leading-5 text-[var(--text-1)]">
            {title}
          </h3>
          {incident.location && (
            <p className="mt-1 text-[10px] text-[var(--nexus-text-3)]">
              {incident.location}
            </p>
          )}
        </div>
      </div>

      {isDuplicate && (
        <div 
          className={`mt-3 flex items-center gap-1.5 w-fit rounded-[4px] border border-[var(--accent-amber)]/40 bg-[rgb(245,158,11,0.1)] px-2.5 py-1.5 ${duplicateOfId ? 'cursor-pointer hover:bg-[rgb(245,158,11,0.2)] transition-colors' : ''}`}
          onClick={handleDuplicateClick}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-amber)] opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-amber)]"></span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-amber)]">
            {duplicateOfId ? `Duplicate · INC-${String(duplicateOfId).slice(-6).toUpperCase()}` : 'Duplicate Detected'}
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="source" value={incident.source || 'manual'} />
          {agentCount > 0 && (
            <span className="flex items-center gap-1 rounded-[3px] bg-[rgba(34,211,238,0.06)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--nexus-cyan)]">
              <Brain size={8} /> {agentCount} agents
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px] text-[var(--nexus-text-3)]">
          <Clock3 size={9} aria-hidden="true" />
          {timeAgo(incident.createdAt)}
        </span>
      </div>

      {/* RPA Intelligence chips — repeat customer / frustrated / language / AWB */}
      {(incident.isRepeatCustomer || incident.sentimentLabel === 'frustrated' || incident.sentimentLabel === 'very_frustrated' || incident.detectedLanguage === 'ms' || incident.awbNumber) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {incident.isRepeatCustomer && (
            <span className="rounded-[2px] border border-[rgb(239,68,68,0.4)] bg-[rgb(239,68,68,0.08)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-red)]">
              Repeat ×{incident.customerHistoryCount || '?'}
            </span>
          )}
          {(incident.sentimentLabel === 'very_frustrated' || incident.sentimentLabel === 'frustrated') && (
            <span className={`rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              incident.sentimentLabel === 'very_frustrated'
                ? 'border-[rgb(212,5,17,0.4)] bg-[rgb(212,5,17,0.08)] text-[#D40511]'
                : 'border-[rgb(239,68,68,0.3)] bg-[rgb(239,68,68,0.06)] text-[var(--accent-red)]'
            }`}>
              {incident.sentimentLabel === 'very_frustrated' ? '🔴 Angry' : '⚠ Frustrated'}
            </span>
          )}
          {incident.detectedLanguage === 'ms' && (
            <span className="rounded-[2px] border border-blue-500/30 bg-blue-500/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-400">
              BM
            </span>
          )}
          {incident.awbNumber && (
            <span className="rounded-[2px] border border-[var(--border)] bg-[var(--surface-3)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent-amber)]">
              {incident.awbNumber}
            </span>
          )}
        </div>
      )}

      {/* Cluster membership */}
      {incident.clusterGroup && !isDuplicate && (
        <div className="mt-2.5 flex items-center gap-1.5 w-fit rounded-[4px] border border-[var(--nexus-cyan)]/20 bg-[rgba(34,211,238,0.06)] px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--nexus-cyan)]" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--nexus-cyan)]">
            Cluster member
          </span>
        </div>
      )}

      {/* Uncertainty badge */}
      {incident.agentResults?.uncertainty && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className={`rounded-[3px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            incident.agentResults.uncertainty.level === 'high'
              ? 'bg-[rgba(239,68,68,0.08)] text-[#ef4444]'
              : incident.agentResults.uncertainty.level === 'medium'
              ? 'bg-[rgba(251,191,36,0.08)] text-[#fbbf24]'
              : 'bg-[rgba(52,211,153,0.08)] text-[#34d399]'
          }`}>
            Trust: {Math.round((incident.agentResults.uncertainty.score || 0) * 100)}% {incident.agentResults.uncertainty.level}
          </span>
        </div>
      )}

      {/* Customer Contacted badge */}
      {incident.recoveryMessage?.status === 'approved' && (
        <div className="mt-2.5 flex items-center gap-1.5 w-fit rounded-[4px] border border-[#34d399]/20 bg-[rgba(52,211,153,0.06)] px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" aria-hidden />
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#34d399]">
            Contacted
          </span>
        </div>
      )}

      {/* Feature 2: SLA breach probability gauge replaces the basic SlaCountdown */}
      <SlaBreachGauge sla={incident.sla} status={incident.status} />
    </button>
  );
}
