import { useEffect, useState } from 'react';

function isClosedStatus(status) {
  return ['RESOLVED', 'CLOSED'].includes(String(status || '').toUpperCase());
}

function formatCountdownParts(deltaMs) {
  const totalSeconds = Math.max(0, Math.floor(deltaMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds };
}

function formatRemaining(deltaMs) {
  const { hours, minutes, seconds } = formatCountdownParts(deltaMs);

  if (deltaMs > 30 * 60 * 1000) {
    return `${hours}h ${minutes}m remaining`;
  }

  return `${minutes}m ${seconds}s`;
}

function formatBreached(deltaMs) {
  const absoluteMs = Math.abs(deltaMs);
  const totalMinutes = Math.floor(absoluteMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `BREACHED ${hours}h ${minutes}m ago`;
}

export default function SlaCountdown({ slaDeadline, status }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!slaDeadline || isClosedStatus(status)) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [slaDeadline, status]);

  if (!slaDeadline || isClosedStatus(status)) {
    return null;
  }

  const deadline = new Date(slaDeadline);
  if (Number.isNaN(deadline.getTime())) {
    return null;
  }

  const deltaMs = deadline.getTime() - now;
  const moreThanTwoHours = deltaMs > 2 * 60 * 60 * 1000;
  const betweenThirtyMinutesAndTwoHours =
    deltaMs > 30 * 60 * 1000 && deltaMs <= 2 * 60 * 60 * 1000;
  const underThirtyMinutes = deltaMs >= 0 && deltaMs <= 30 * 60 * 1000;

  let classes =
    'inline-flex items-center rounded-[2px] border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em]';
  let content = formatRemaining(deltaMs);
  let style;

  if (deltaMs < 0) {
    classes += ' border-[var(--accent-red)]/30 bg-[rgb(239,68,68,0.12)] text-[var(--accent-red)] animate-pulse motion-reduce:animate-none';
    content = formatBreached(deltaMs);
    style = { animationDuration: '0.8s' };
  } else if (moreThanTwoHours) {
    classes += ' border-[var(--accent-green)]/30 bg-[rgb(16,185,129,0.12)] text-[var(--accent-green)]';
  } else if (betweenThirtyMinutesAndTwoHours) {
    classes += ' border-[var(--accent-amber)]/30 bg-[rgb(245,158,11,0.12)] text-[var(--accent-amber)] animate-pulse motion-reduce:animate-none';
    style = { animationDuration: '1.8s' };
  } else if (underThirtyMinutes) {
    classes += ' border-[var(--accent-red)]/30 bg-[rgb(239,68,68,0.12)] text-[var(--accent-red)] animate-pulse motion-reduce:animate-none';
    style = { animationDuration: '0.8s' };
  }

  return (
    <span className={classes} style={style}>
      {content}
    </span>
  );
}
