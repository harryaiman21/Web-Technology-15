import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { checkBackendHealth } from '../lib/api';

export default function BackendStatusBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(10);

  useEffect(() => {
    let mounted = true;
    let retryTimer = null;
    let countdownTimer = null;

    async function probe() {
      const online = await checkBackendHealth();
      if (!mounted) return;

      if (online) {
        setIsOffline(false);
        setSecondsLeft(10);
        countdownTimer = window.setTimeout(probe, 30000);
        return;
      }

      setIsOffline(true);
      setSecondsLeft(10);

      countdownTimer = window.setInterval(() => {
        setSecondsLeft((current) => {
          if (current <= 1) {
            return 10;
          }
          return current - 1;
        });
      }, 1000);

      retryTimer = window.setTimeout(async () => {
        window.clearInterval(countdownTimer);
        await probe();
      }, 10000);
    }

    probe();

    return () => {
      mounted = false;
      window.clearTimeout(retryTimer);
      window.clearTimeout(countdownTimer);
      window.clearInterval(countdownTimer);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="border-b border-[var(--accent-red)] bg-[rgb(239,68,68,0.1)] px-4 py-3 text-sm text-[var(--text-1)]">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-2">
        <AlertCircle className="text-[var(--accent-red)]" size={16} aria-hidden="true" />
        <span>Backend offline - retrying in {secondsLeft}s...</span>
      </div>
    </div>
  );
}
