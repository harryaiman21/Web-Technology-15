import { useMemo } from 'react';

import { cn } from '@/lib/utils';

function getTone(value) {
  if (value >= 0.85) return 'bg-[var(--accent-green)]';
  if (value >= 0.65) return 'bg-[var(--accent-amber)]';
  return 'bg-[var(--accent-red)]';
}

export default function ConfidenceBar({ value = 0, showLabel = true, className }) {
  const normalized = Math.max(0, Math.min(1, Number(value) || 0));
  const percentage = Math.round(normalized * 100);
  const tone = useMemo(() => getTone(normalized), [normalized]);

  return (
    <div className={cn('space-y-1.5', className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-[11px] font-medium text-[var(--text-3)]">
          <span>{percentage}% confidence</span>
          <span className="font-mono-ui">{normalized.toFixed(2)}</span>
        </div>
      )}
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className={cn('h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none', tone)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
