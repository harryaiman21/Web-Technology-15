import { useCallback, useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import useSSE from '../hooks/useSSE';

function confidenceColor(pct) {
  if (pct >= 80) return '#22C55E';
  if (pct >= 60) return '#F59E0B';
  return '#EF4444';
}

function buildPlaceholderHistory(finalConf) {
  const f = Math.min(0.99, Math.max(0, Number(finalConf || 0)));
  if (f === 0) return [];
  return [
    { stage: 'intake',       stageLabel: 'Email received',    confidence: Math.min(f, 0.5),           minutesElapsed: 0,  note: 'Initial classification from raw input' },
    { stage: 'ml_classifier',stageLabel: 'ML model scored',   confidence: Math.min(0.99, f * 0.88),   minutesElapsed: 2,  note: 'LightGBM classification' },
    { stage: 'dedup',        stageLabel: 'Cluster analysis',  confidence: Math.min(0.99, f * 0.94),   minutesElapsed: 5,  note: 'Cluster check complete' },
    { stage: 'case_memory',  stageLabel: 'Similar cases found',confidence: Math.min(0.99, f + 0.02),  minutesElapsed: 8,  note: 'Case memory consulted' },
    { stage: 'final',        stageLabel: 'Pipeline complete', confidence: f, isAutoResolved: f >= 0.9, minutesElapsed: 10,
      note: f >= 0.9 ? 'Confidence threshold met — auto-resolved' : 'HITL review required' },
  ];
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const pct = Math.round(Number(d.confidence || 0) * 100);
  const color = confidenceColor(pct);
  return (
    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-[var(--text-1)]">{d.stageLabel}</p>
      <p style={{ color }} className="font-mono-ui font-bold">{pct}%</p>
      {d.note && <p className="mt-1 text-[var(--text-3)]">{d.note}</p>}
    </div>
  );
}

export default function ConfidenceEvolutionChart({ incidentId, initialHistory, isLive, finalConfidence }) {
  const streamUrl = isLive ? `/api/v1/incidents/${incidentId}/stream` : null;
  const { events } = useSSE(streamUrl);

  const snapshots = useMemo(() => {
    const liveSnaps = events.filter((e) => e.type === 'confidence_snapshot');
    const base =
      Array.isArray(initialHistory) && initialHistory.length > 0
        ? initialHistory
        : liveSnaps.length === 0 && !isLive && Number(finalConfidence) > 0
          ? buildPlaceholderHistory(finalConfidence)
          : [];

    const combined = [...base, ...liveSnaps];
    const byStage = new Map();
    for (const s of combined) {
      if (s.stage) byStage.set(s.stage, s);
    }
    return [...byStage.values()];
  }, [events, initialHistory, isLive, finalConfidence]);

  const chartData = snapshots.map((s) => ({
    stageLabel: s.stageLabel || s.stage,
    confidence: Math.round(Number(s.confidence || 0) * 100),
    note: s.note,
    stage: s.stage,
    isAutoResolved: Boolean(s.isAutoResolved),
  }));

  const lastSnap = snapshots[snapshots.length - 1];
  const isAutoResolved = Boolean(lastSnap?.isAutoResolved);
  const lastConf = lastSnap != null ? Math.round(Number(lastSnap.confidence || 0) * 100) : null;
  const completedStages = snapshots.length;
  const isPipelineComplete = completedStages >= 5 || lastSnap?.stage === 'final';
  const lineColor = lastConf != null ? confidenceColor(lastConf) : '#64748B';

  let summaryText = null;
  if (isPipelineComplete && lastConf != null) {
    summaryText = isAutoResolved
      ? `Pipeline completed with ${lastConf}% confidence — resolved automatically`
      : `Pipeline completed with ${lastConf}% confidence — assigned for human review`;
  } else if (isLive && completedStages > 0) {
    summaryText = `Analysis in progress — ${completedStages} of 5 stages complete`;
  }

  const renderDot = useCallback((props) => {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null) return null;
    const pct = Number(payload?.confidence || 0);
    const color = confidenceColor(pct);
    const isLast = index === chartData.length - 1;

    if (isLast && payload?.isAutoResolved) {
      return (
        <g key={`dot-${index}`}>
          <circle cx={cx} cy={cy} r={8} fill={color} stroke="white" strokeWidth={2.5} />
          <text x={cx} y={cy - 16} textAnchor="middle" fontSize={9} fontWeight="700" fill={color}>
            ✓ AUTO-RESOLVED
          </text>
        </g>
      );
    }
    if (isLast && isPipelineComplete) {
      return (
        <g key={`dot-${index}`}>
          <circle cx={cx} cy={cy} r={6} fill={color} stroke="white" strokeWidth={2} />
          <text x={cx} y={cy - 14} textAnchor="middle" fontSize={9} fontWeight="600" fill={color}>
            HITL REQUIRED
          </text>
        </g>
      );
    }
    return (
      <circle key={`dot-${index}`} cx={cx} cy={cy} r={4} fill={color} stroke="white" strokeWidth={1.5} />
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData.length, isPipelineComplete]);

  if (chartData.length === 0 && !isLive) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Confidence Evolution</CardTitle>
          {isLive && !isPipelineComplete && (
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3B82F6] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#3B82F6]" />
              </span>
              Live
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-xs text-[var(--text-3)]">Waiting for pipeline data…</p>
          </div>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 28, right: 130, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="stageLabel"
                  tick={{ fill: 'var(--text-3)', fontSize: 10 }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <YAxis
                  domain={[40, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: 'var(--text-3)', fontSize: 10 }}
                  stroke="var(--border)"
                  tickLine={false}
                  width={36}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={90}
                  stroke="#22C55E"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: 'Auto-resolve threshold',
                    position: 'right',
                    fontSize: 9,
                    fill: '#22C55E',
                    offset: 6,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="confidence"
                  stroke={lineColor}
                  strokeWidth={2.5}
                  dot={renderDot}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
                  isAnimationActive
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {summaryText && (
          <p className="mt-2 text-xs text-[var(--text-2)]">{summaryText}</p>
        )}
      </CardContent>
    </Card>
  );
}
