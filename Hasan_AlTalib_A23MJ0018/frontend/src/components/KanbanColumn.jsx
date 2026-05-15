import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/components/ui/button';

import EmptyState from './EmptyState';
import IncidentCard from './IncidentCard';

const COLUMN_TONES = {
  DRAFT: 'text-[var(--text-3)]',
  PENDING_REVIEW: 'text-[var(--accent-amber)]',
  UNDER_REVIEW: 'text-[var(--accent-blue)]',
  ASSIGNED: 'text-[var(--text-2)]',
  IN_PROGRESS: 'text-[rgb(167,139,250)]',
  BREACHED: 'text-[var(--accent-red)]',
  RESOLVED: 'text-[var(--accent-green)]',
  CLOSED: 'text-[var(--text-3)]',
};

const EMPTY_MESSAGES = {
  DRAFT: 'No intake incidents waiting in draft.',
  PENDING_REVIEW: 'No incidents awaiting review.',
  UNDER_REVIEW: 'No incidents currently under review.',
  ASSIGNED: 'No assigned incidents in this stage.',
  IN_PROGRESS: 'No incidents are actively being worked.',
  BREACHED: 'No SLA breaches — great work!',
  RESOLVED: 'No resolved incidents yet.',
  CLOSED: 'No closed incidents available.',
};

export default function KanbanColumn({
  id,
  title,
  subtitle,
  count,
  incidents,
  onCardClick,
  canLoadMore = false,
  onLoadMore,
}) {
  return (
    <section className="flex h-full w-[320px] shrink-0 flex-col rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          {(id === 'PENDING_REVIEW' || id === 'BREACHED') && (
            <span className={`h-2 w-2 rounded-full animate-pulse motion-reduce:animate-none ${
              id === 'BREACHED' ? 'bg-[var(--accent-red)]' : 'bg-[var(--accent-amber)]'
            }`} aria-hidden="true" />
          )}
          <div className="flex flex-col">
            <h3 className={`text-[11px] font-medium uppercase tracking-[0.08em] ${COLUMN_TONES[id] || 'text-[var(--text-2)]'}`}>
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[11px] font-normal tracking-normal text-[var(--text-3)] normal-case">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <span className="rounded-[2px] bg-[var(--surface-3)] px-2 py-1 text-[11px] font-medium text-[var(--text-2)]">
          {count}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {incidents.length > 0 ? (
          <>
            <AnimatePresence initial={false} mode="popLayout">
              {incidents.map((incident) => (
                <motion.div
                  key={incident._id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{
                    layout:  { type: 'spring', stiffness: 380, damping: 32, mass: 0.6 },
                    opacity: { duration: 0.18 },
                    y:       { duration: 0.18 },
                    scale:   { duration: 0.18 },
                  }}
                >
                  <IncidentCard
                    incident={incident}
                    onClick={() => onCardClick(incident._id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {canLoadMore && (
              <Button variant="outline" size="sm" className="w-full" onClick={onLoadMore}>
                Load 20 more
              </Button>
            )}
          </>
        ) : (
          <EmptyState
            title="Column empty"
            subtitle={EMPTY_MESSAGES[id] || 'No incidents are available for this status.'}
            className="min-h-[180px]"
          />
        )}
      </div>
    </section>
  );
}
