import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOutcomeHistory } from '../lib/api';

// ── Outcome dot ───────────────────────────────────────────────────────────────
function OutcomeDot({ outcome, severity, confirmed }) {
  const color =
    outcome === 'satisfied'   ? 'bg-[var(--accent-green)]'
    : outcome === 'escalated' ? 'bg-[var(--accent-red)]'
    : 'bg-[var(--surface-3)] border border-[var(--border)]';

  const label =
    outcome === 'satisfied'   ? '✓'
    : outcome === 'escalated' ? '✕'
    : '–';

  const title = `${outcome}${confirmed ? ' (confirmed)' : ' (estimated)'} · ${severity}`;

  return (
    <span
      title={title}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ${color}`}
      aria-label={title}
    >
      {label}
    </span>
  );
}

// ── Success rate ring (SVG) ───────────────────────────────────────────────────
function RateRing({ pct, color }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;

  return (
    <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
      <circle
        cx="30" cy="30" r={r} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 30 30)"
        style={{ transition: 'stroke-dasharray 0.7s ease-out' }}
      />
      <text x="30" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// Only renders for PENDING_REVIEW incidents. Hidden once approved.
export default function OutcomeValidationCard({ incidentId, status }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== 'PENDING_REVIEW') return;
    let cancelled = false;

    getOutcomeHistory(incidentId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [incidentId, status]);

  if (status !== 'PENDING_REVIEW') return null;

  const rateColor =
    !data || data.insufficient ? '#64748B'
    : data.successRate >= 80   ? '#22C55E'
    : data.successRate >= 60   ? '#F59E0B'
    : '#EF4444';

  return (
    <Card className="border-l-[3px] border-l-[#3B82F6]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Resolution Track Record</CardTitle>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-2)]">
            Before you approve
          </span>
        </div>
        <p className="text-xs text-[var(--text-3)]">
          Historical outcomes for this incident type — use to calibrate your decision
        </p>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center gap-3 py-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
            <span className="text-xs text-[var(--text-3)]">Loading history…</span>
          </div>
        ) : !data || data.insufficient ? (
          /* ── Insufficient history state ─────────────────────────────────── */
          <div className="flex items-start gap-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
            <HelpCircle size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[var(--text-1)]">Insufficient history</p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">
                {data?.reason || 'Not enough resolved cases of this type to derive a reliable success rate.'}
              </p>
              {data?.approachLabel && (
                <p className="mt-1 text-xs text-[var(--text-2)]">
                  Typical approach: <span className="font-medium">{data.approachLabel}</span>
                </p>
              )}
            </div>
          </div>
        ) : (
          /* ── Main data state ────────────────────────────────────────────── */
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-5">
              {/* Rate ring */}
              <RateRing pct={data.successRate} color={rateColor} />

              {/* Summary text */}
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-[var(--text-1)]">
                  {data.successRate}% success rate
                </p>
                <p className="text-xs text-[var(--text-2)]">
                  Based on{' '}
                  <span className="font-medium text-[var(--text-1)]">{data.sampleSize}</span>{' '}
                  resolved {String(data.approachLabel || '').toLowerCase()} cases
                  {data.confirmedCount > 0 && (
                    <> · <span className="text-[var(--accent-green)]">{data.confirmedCount} confirmed via follow-up</span></>
                  )}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                  <TrendingUp size={10} aria-hidden="true" />
                  Best approach for this type: <span className="font-medium text-[var(--text-2)]">{data.approachLabel}</span>
                </div>
              </div>

              {/* Outcome breakdown */}
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                {[
                  { label: 'Satisfied', value: data.outcomes.satisfied, color: 'text-[var(--accent-green)]' },
                  { label: 'Escalated', value: data.outcomes.escalated, color: 'text-[var(--accent-red)]' },
                  { label: 'No response', value: data.outcomes.noResponse, color: 'text-[var(--text-3)]' },
                ].map((item) => (
                  <div key={item.label} className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] px-2 py-1.5">
                    <p className={`text-base font-bold leading-none ${item.color}`}>{item.value}</p>
                    <p className="mt-0.5 text-[var(--text-3)]">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Warnings */}
            {data.warnings?.length > 0 && (
              <div className="space-y-1.5">
                {data.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-[4px] border border-[rgb(245,158,11,0.3)] bg-[rgb(245,158,11,0.07)] px-3 py-2"
                  >
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[var(--accent-amber)]" aria-hidden="true" />
                    <p className="text-[11px] text-[var(--text-2)]">{w}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Recent cases */}
            {data.recentCases?.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                  Recent outcomes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data.recentCases.map((c) => (
                    <OutcomeDot
                      key={c.id}
                      outcome={c.outcome}
                      severity={c.severity}
                      confirmed={c.confirmed}
                    />
                  ))}
                  {data.sampleSize > data.recentCases.length && (
                    <span className="text-[11px] text-[var(--text-3)]">
                      +{data.sampleSize - data.recentCases.length} more
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--text-3)]">
                  Green = satisfied · Red = escalated · Grey = no response ·
                  Solid = follow-up confirmed
                </p>
              </div>
            )}

            {data.confirmedCount === 0 && (
              <p className="text-[10px] text-[var(--text-3)]">
                No follow-up confirmations yet — outcomes estimated from resolution status
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
