import { useMemo, useState } from 'react';

function formatRelativeTime(value) {
  if (!value) return 'Unknown time';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Unknown time';
  const diffMinutes = Math.round((Date.now() - timestamp) / 60000);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

function tone(entry) {
  const action = String(entry.action || '').toLowerCase();
  if (action.includes('error')) return 'bg-[var(--accent-red)]';
  if (action.includes('hold') || action.includes('review')) return 'bg-[var(--accent-amber)]';
  if (entry.actorType === 'agent') return 'bg-[var(--accent-blue)]';
  return 'bg-[var(--accent-green)]';
}

function roleTone(entry) {
  if (entry.actorType === 'agent') return 'bg-[rgb(59,130,246,0.12)] text-[var(--accent-blue)]';
  return 'bg-[rgb(16,185,129,0.12)] text-[var(--accent-green)]';
}

function prettyPayload(entry) {
  return JSON.stringify(
    {
      action: entry.action,
      actor: entry.actorName || entry.actor,
      actorRole: entry.actorRole,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      confidence: entry.confidence,
      timestamp: entry.timestamp,
    },
    null,
    2
  );
}

function TimelineItem({ entry, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const payload = useMemo(() => prettyPayload(entry), [entry]);

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`mt-1 h-2 w-2 rounded-full ${tone(entry)}`} aria-hidden="true" />
        {!isLast && <span className="mt-2 w-px flex-1 bg-[var(--border)]" aria-hidden="true" />}
      </div>

      <div className="min-w-0 flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[var(--text-1)]">
                {entry.actorName || entry.actor || 'System'}
              </span>
              <span className={`rounded-[2px] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${roleTone(entry)}`}>
                {entry.actorRole || entry.actorType}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--text-2)]">{entry.action || 'Activity recorded'}</p>
          </div>
          <span className="text-xs text-[var(--text-3)]">{formatRelativeTime(entry.timestamp)}</span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 text-xs font-medium text-[var(--text-2)] hover:text-[var(--text-1)]"
        >
          {expanded ? 'Hide payload ^' : 'Show payload v'}
        </button>

        {expanded && (
          <pre className="mt-3 overflow-auto rounded-[4px] border border-[var(--border)] bg-[var(--surface)] p-3 font-mono-ui text-xs leading-6 text-[var(--text-2)]">
            {payload}
          </pre>
        )}
      </div>
    </div>
  );
}

export default function AuditTimeline({ auditLog = [] }) {
  if (!auditLog.length) {
    return (
      <div className="rounded-[6px] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-6 py-8 text-center text-sm text-[var(--text-3)]">
        No audit events recorded for this incident yet
      </div>
    );
  }

  return (
    <div className="space-y-4 border-l border-[var(--border)] pl-4">
      {auditLog.map((entry, index) => (
        <TimelineItem
          key={entry._id || `${entry.timestamp}-${index}`}
          entry={entry}
          isLast={index === auditLog.length - 1}
        />
      ))}
    </div>
  );
}
