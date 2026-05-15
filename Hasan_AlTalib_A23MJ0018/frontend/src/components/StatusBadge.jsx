import { LoaderCircle } from 'lucide-react';

import Badge from './Badge';

export default function StatusBadge({ status }) {
  const normalized = String(status || 'UNKNOWN').toUpperCase();

  return (
    <span className="inline-flex items-center gap-1">
      {normalized === 'PENDING_REVIEW' && (
        <LoaderCircle
          size={10}
          className="animate-spin text-[var(--accent-amber)] motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      <Badge variant="status" value={normalized} />
    </span>
  );
}
