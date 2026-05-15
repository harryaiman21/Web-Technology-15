export default function ConfidenceLabel({ confidence, className = '' }) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return null;

  const percentage = Math.round(value * 100);

  let tone = 'text-[var(--accent-red)]';
  let label = 'Low confidence';

  if (value >= 0.85) {
    tone = 'text-[var(--accent-green)]';
    label = 'High confidence';
  } else if (value >= 0.65) {
    tone = 'text-[var(--accent-amber)]';
    label = 'Needs review';
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone} ${className}`}>
      {label}
      <span className="font-mono-ui text-[var(--text-3)]">{percentage}%</span>
    </span>
  );
}
