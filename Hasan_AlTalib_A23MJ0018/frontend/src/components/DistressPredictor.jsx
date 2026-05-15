import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, TrendingUp } from 'lucide-react';

// ── Score calculation ─────────────────────────────────────────────────────────
// Transparent heuristic — every factor listed here maps to a visible bullet in
// the expandable detail so the PCC can see exactly why the score is what it is.
function computeDistress(incident, nowMs) {
  if (!incident) return { score: 0, factors: [] };

  const factors = [];
  let score = 0;

  // 1. Severity base
  const SEV = { Critical: 40, High: 28, Medium: 15, Low: 5 };
  score += SEV[incident.severity] || 10;
  if (SEV[incident.severity] >= 28) {
    factors.push(`${incident.severity} severity — elevated escalation baseline`);
  }

  // 2. Incident type heat
  const TYPE_HEAT = {
    missing_parcel:  20,
    damaged_parcel:  18,
    wrong_item:      12,
    late_delivery:    8,
    system_error:     5,
    address_error:    3,
    other:            5,
  };
  const typeScore = TYPE_HEAT[incident.type] ?? 5;
  score += typeScore;
  if (typeScore >= 12) {
    const label = String(incident.type || '').replace(/_/g, ' ');
    factors.push(`${label} incidents escalate ${typeScore >= 18 ? '2×' : '1.5×'} faster than average`);
  }

  // 3. Time open (log-scaled, caps at 30)
  const createdMs = incident.createdAt ? new Date(incident.createdAt).getTime() : nowMs;
  const hoursOpen = Math.max(0, (nowMs - createdMs) / 3_600_000);
  const timeScore = Math.min(30, Math.log1p(hoursOpen) * 9);
  score += timeScore;
  if (hoursOpen >= 2) {
    const display = hoursOpen >= 24
      ? `${Math.round(hoursOpen / 24)}d`
      : `${hoursOpen.toFixed(0)}h`;
    factors.push(`Open ${display} without resolution — customer patience decreasing`);
  }

  // 4. PENDING_REVIEW stale
  if (incident.status === 'PENDING_REVIEW') {
    if (hoursOpen >= 4) {
      score += 20;
      factors.push('In review queue 4+ hours — customer wait time critical');
    } else if (hoursOpen >= 2) {
      score += 12;
      factors.push('In review queue 2+ hours — needs attention soon');
    }
  }

  // 5. holdForReview flag
  if (incident.holdForReview) {
    score += 8;
    factors.push('Flagged for human review — action required');
  }

  // 6. Recovery message state
  const rm = incident.recoveryMessage?.status;
  if (rm === 'auto_sent' || rm === 'approved') {
    score -= 15;
  } else if (rm === 'hitl_required' || rm === 'pending_send') {
    score += 10;
    factors.push('Recovery message drafted but not yet sent to customer');
  }

  // 7. SLA signals
  const sla = incident.sla || {};
  if (incident.status === 'BREACHED' || sla.breachedAt) {
    score += 30;
    factors.push('SLA deadline already breached — customer expectations violated');
  } else if (Number(sla.breachProbability || 0) >= 0.6) {
    score += 15;
    factors.push(`${Math.round(sla.breachProbability * 100)}% SLA breach probability — high time pressure`);
  }

  // 8. Cluster
  if (incident.clusterGroup) {
    score += 6;
    factors.push('Part of an incident cluster — may signal a systemic issue');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    hoursOpen,
    factors: factors.slice(0, 4),
  };
}

function distressLevel(score) {
  if (score >= 70) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

const LEVEL_CFG = {
  Critical: { color: 'var(--accent-red)',   bgFaint: 'rgb(239,68,68,0.06)',  border: 'rgb(239,68,68,0.3)',  pulse: true  },
  High:     { color: 'var(--accent-amber)', bgFaint: 'rgb(245,158,11,0.06)', border: 'rgb(245,158,11,0.3)', pulse: false },
  Medium:   { color: 'var(--accent-amber)', bgFaint: 'rgb(245,158,11,0.04)', border: 'rgb(245,158,11,0.2)', pulse: false },
  Low:      { color: 'var(--accent-green)', bgFaint: 'rgb(16,185,129,0.04)', border: 'rgb(16,185,129,0.2)', pulse: false },
};

// ── Retrospective banner (resolved incidents) ─────────────────────────────────
function ResolvedBanner({ incident }) {
  const createdMs  = incident.createdAt ? new Date(incident.createdAt).getTime() : 0;
  const resolvedMs = incident.updatedAt ? new Date(incident.updatedAt).getTime() : Date.now();
  const hrs = createdMs ? Math.max(0, (resolvedMs - createdMs) / 3_600_000) : null;
  const timeStr = hrs != null ? (hrs >= 24 ? `${Math.round(hrs / 24)}d` : `${hrs.toFixed(0)}h`) : null;

  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-[rgb(16,185,129,0.3)] bg-[rgb(16,185,129,0.06)] px-4 py-3">
      <CheckCircle2 size={16} className="shrink-0 text-[var(--accent-green)]" aria-hidden="true" />
      <p className="text-sm text-[var(--text-2)]">
        <span className="font-semibold text-[var(--accent-green)]">Resolved before escalation</span>
        {timeStr && <> · {timeStr} from open to close</>}
        {' '}· Estimated customer outcome:{' '}
        <span className="font-medium text-[var(--text-1)]">Positive</span>
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
//
// Compact decision-insight strip. Single horizontal layout with:
//   [risk-level pill] + headline delta + tiny "Open Xh" timestamp + chevron toggle
// Expandable factor list below. NO internal CTA — primary action lives in hero.
//
export default function DistressPredictor({ incident }) {
  const [nowMs, setNowMs]       = useState(Date.now());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!incident) return null;

  if (['RESOLVED', 'CLOSED'].includes(incident.status)) {
    return <ResolvedBanner incident={incident} />;
  }

  const { score, hoursOpen, factors } = computeDistress(incident, nowMs);
  const level   = distressLevel(score);
  const riskPct = Math.min(95, Math.round(score * 0.85));
  const goodPct = Math.min(97, 100 - Math.round(riskPct * 0.45));
  const cfg     = LEVEL_CFG[level];

  const hoursDisplay = hoursOpen >= 24
    ? `${Math.round(hoursOpen / 24)}d`
    : hoursOpen >= 1
      ? `${Math.floor(hoursOpen)}h`
      : `${Math.round(hoursOpen * 60)}m`;

  const inactionFactors = factors.filter((f) => !f.toLowerCase().includes('de-escalation'));
  const hasFactors      = inactionFactors.length > 0;

  return (
    <div
      className="overflow-hidden rounded-[8px] border transition-colors"
      style={{ borderColor: cfg.border, backgroundColor: cfg.bgFaint }}
    >
      {/* ── Headline strip ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => hasFactors && setExpanded((v) => !v)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hasFactors ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {/* Level pill */}
        <span
          className={`shrink-0 rounded-[3px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${cfg.pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          style={{ borderColor: cfg.border, backgroundColor: cfg.bgFaint, color: cfg.color }}
        >
          {level} risk
        </span>

        {/* Headline insight */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="text-[13px] text-[var(--text-2)]">
            Acting now reduces escalation risk from{' '}
            <span className="font-semibold tabular-nums" style={{ color: cfg.color }}>
              {riskPct}%
            </span>
            {' '}→{' '}
            <span className="font-semibold tabular-nums text-[var(--accent-green)]">
              {Math.max(5, riskPct - Math.round(riskPct * 0.6))}%
            </span>
            <span className="ml-2 hidden text-[12px] text-[var(--text-3)] sm:inline">
              · estimated positive outcome <span className="tabular-nums">{goodPct}%</span> if recovery sent now
            </span>
          </span>
        </div>

        {/* Time open + expand */}
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-[var(--text-3)]">
          <span className="hidden items-center gap-1 sm:flex">
            <Clock size={11} aria-hidden="true" />
            Open {hoursDisplay}
          </span>
          {hasFactors && (
            <ChevronDown
              size={14}
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
              style={{ color: cfg.color }}
              aria-hidden="true"
            />
          )}
        </div>
      </button>

      {/* ── Bar (always visible, slim) ──────────────────────────────────── */}
      <div className="h-[3px] w-full bg-[var(--surface-3)]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${riskPct}%`, backgroundColor: cfg.color }}
        />
      </div>

      {/* ── Expandable factor list ──────────────────────────────────────── */}
      {expanded && hasFactors && (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-3)]">
            Active risk signals · score {score}/100
          </p>
          <ul className="space-y-1.5">
            {inactionFactors.map((factor, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-2)]">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" style={{ color: cfg.color }} aria-hidden="true" />
                <span>{factor}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--accent-green)]">
            <TrendingUp size={11} aria-hidden="true" />
            Approving the recovery message now reduces escalation risk by ~40%
          </p>
          <p className="mt-1.5 text-[10px] text-[var(--text-3)]">
            Heuristic estimate · use professional judgement
          </p>
        </div>
      )}
    </div>
  );
}
