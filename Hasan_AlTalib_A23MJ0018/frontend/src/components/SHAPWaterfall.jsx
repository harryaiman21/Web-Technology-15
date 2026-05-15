import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const POS_COLOR = '#22c55e';
const NEG_COLOR = '#ef4444';
const CHAR_LIMIT = 22;

function truncate(str) {
  if (!str) return '';
  const s = String(str).replace(/^eng__/, '').replace(/_/g, ' ');
  return s.length > CHAR_LIMIT ? `${s.slice(0, CHAR_LIMIT)}…` : s;
}

function SHAPTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { feature, shap_value, direction, group } = payload[0]?.payload || {};
  return (
    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-2)]">
      <p className="mb-1 text-[var(--text-1)]">{String(feature).replace(/^eng__/, '').replace(/_/g, ' ')}</p>
      <p>
        SHAP value:{' '}
        <span className="font-mono-ui" style={{ color: direction === 'positive' ? POS_COLOR : NEG_COLOR }}>
          {Number(shap_value) > 0 ? '+' : ''}
          {Number(shap_value).toFixed(4)}
        </span>
      </p>
      <p className="mt-1 text-[var(--text-3)]">{group || 'lexical'} feature</p>
    </div>
  );
}

function UnavailableCard() {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <p className="text-sm text-[var(--text-3)]">Decision evidence not available for this incident.</p>
      </CardContent>
    </Card>
  );
}

export default function SHAPWaterfall({ shapData }) {
  const available = shapData && shapData.available !== false;
  const features = available && Array.isArray(shapData.features) ? shapData.features : [];
  const predicted_class = available ? shapData.predicted_class : '';
  const base_value = available ? shapData.base_value : null;
  const top_positive = available && Array.isArray(shapData.top_positive) ? shapData.top_positive : [];
  const top_negative = available && Array.isArray(shapData.top_negative) ? shapData.top_negative : [];

  const chartData = useMemo(() =>
    features.slice(0, 8).map((f) => ({
      ...f,
      label: truncate(f.feature),
      value: Number(f.shap_value),
    })),
    [features],
  );

  try {
    if (!available || !chartData.length) return <UnavailableCard />;

    const dominantPositive = top_positive.length > 0;
    const className = String(predicted_class || '').replace(/_/g, ' ');

    // Compute symmetric axis extent
    const maxAbs = Math.max(...chartData.map((d) => Math.abs(d.value)), 0.01);
    const axisPad = maxAbs * 0.25;
    const axisMax = Math.ceil((maxAbs + axisPad) * 100) / 100;


    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>Why NEXUS classified this as</span>
            <span
              className="rounded-[3px] border px-2 py-0.5 text-sm font-normal capitalize"
              style={{
                borderColor: dominantPositive ? 'rgb(34,197,94,0.4)' : 'rgb(239,68,68,0.4)',
                background: dominantPositive ? 'rgb(34,197,94,0.08)' : 'rgb(239,68,68,0.08)',
                color: dominantPositive ? POS_COLOR : NEG_COLOR,
              }}
            >
              {className}
            </span>
          </CardTitle>
          <p className="mt-1 text-xs text-[var(--text-3)]">
            Features pushing{' '}
            <span style={{ color: POS_COLOR }}>toward (green)</span> or{' '}
            <span style={{ color: NEG_COLOR }}>away from (red)</span> this classification
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Horizontal waterfall bar chart */}
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 32, bottom: 4, left: 4 }}
              >
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[-axisMax, axisMax]}
                  stroke="var(--text-2)"
                  tick={{ fill: 'var(--text-2)', fontSize: 11 }}
                  tickFormatter={(v) => v.toFixed(3)}
                />
                <YAxis
                  dataKey="label"
                  type="category"
                  width={130}
                  stroke="var(--text-2)"
                  tick={{ fill: 'var(--text-2)', fontSize: 11 }}
                />
                <Tooltip content={<SHAPTooltip />} cursor={{ fill: 'var(--nexus-surface-2)' }} />
                <Bar dataKey="value" name="SHAP value" isAnimationActive={false}>
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={entry.direction === 'positive' ? POS_COLOR : NEG_COLOR}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary lists */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: POS_COLOR }}>
                Pushed toward {className}
              </p>
              <div className="space-y-1">
                {top_positive.slice(0, 5).map((f) => (
                  <div key={f.feature} className="flex items-center justify-between gap-2 text-xs text-[var(--text-2)]">
                    <span className="truncate">• {String(f.feature).replace(/^eng__/, '').replace(/_/g, ' ')}</span>
                    <span className="shrink-0 font-mono-ui" style={{ color: POS_COLOR }}>
                      +{Number(f.shap_value).toFixed(3)}
                    </span>
                  </div>
                ))}
                {!top_positive.length && (
                  <p className="text-xs text-[var(--text-3)]">No strong positive signals.</p>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: NEG_COLOR }}>
                Pushed away
              </p>
              <div className="space-y-1">
                {top_negative.slice(0, 3).map((f) => (
                  <div key={f.feature} className="flex items-center justify-between gap-2 text-xs text-[var(--text-2)]">
                    <span className="truncate">• {String(f.feature).replace(/^eng__/, '').replace(/_/g, ' ')}</span>
                    <span className="shrink-0 font-mono-ui" style={{ color: NEG_COLOR }}>
                      {Number(f.shap_value).toFixed(3)}
                    </span>
                  </div>
                ))}
                {!top_negative.length && (
                  <p className="text-xs text-[var(--text-3)]">No strong counter-signals.</p>
                )}
              </div>
            </div>
          </div>

          {/* Base value footnote */}
          {base_value != null && (
            <p className="text-[11px] text-[var(--text-3)]">
              Base rate (model prior):{' '}
              <span className="font-mono-ui">{Number(base_value).toFixed(4)}</span>
            </p>
          )}
        </CardContent>
      </Card>
    );
  } catch {
    return <UnavailableCard />;
  }
}
