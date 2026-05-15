import { cn } from '@/lib/utils';

const MAP = {
  severity: {
    Critical: 'border-[var(--accent-red)]/30 bg-[rgb(239,68,68,0.12)] text-[var(--accent-red)]',
    High: 'border-[var(--accent-amber)]/30 bg-[rgb(245,158,11,0.12)] text-[var(--accent-amber)]',
    Medium: 'border-[var(--accent-blue)]/30 bg-[rgb(59,130,246,0.12)] text-[var(--accent-blue)]',
    Low: 'border-[var(--accent-green)]/30 bg-[rgb(16,185,129,0.12)] text-[var(--accent-green)]',
  },
  status: {
    DRAFT: 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-2)]',
    PENDING_REVIEW: 'border-[var(--accent-amber)]/30 bg-[rgb(245,158,11,0.12)] text-[var(--accent-amber)]',
    UNDER_REVIEW: 'border-[var(--accent-blue)]/30 bg-[rgb(59,130,246,0.12)] text-[var(--accent-blue)]',
    ASSIGNED: 'border-[rgb(139,92,246,0.3)] bg-[rgb(139,92,246,0.12)] text-[rgb(167,139,250)]',
    IN_PROGRESS: 'border-[var(--accent-blue)]/30 bg-[rgb(59,130,246,0.12)] text-[var(--accent-blue)]',
    RESOLVED: 'border-[var(--accent-green)]/30 bg-[rgb(16,185,129,0.12)] text-[var(--accent-green)]',
    CLOSED: 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-2)]',
  },
  source: {
    manual: 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-2)]',
    rpa: 'border-[var(--accent-blue)]/30 bg-[rgb(59,130,246,0.12)] text-[var(--accent-blue)]',
  },
  type: {
    default: 'border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-2)]',
  },
};

export default function Badge({ variant = 'type', value, className }) {
  const normalized = variant === 'source' ? String(value || '').toLowerCase() : String(value || '');
  const styles = MAP[variant]?.[normalized] || MAP[variant]?.default || MAP.type.default;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]',
        styles,
        className
      )}
    >
      {String(value || 'Unknown').replace(/_/g, ' ')}
    </span>
  );
}
