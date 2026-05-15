import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain, CheckCircle2, X, XCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const ToastContext = createContext(null);

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ── Visual config per kind ───────────────────────────────────────────────────
const KIND_CFG = {
  success: {
    icon: CheckCircle2,
    iconColor: '#10B981',
    accentBg:  'rgb(16,185,129,0.1)',
    accentBorder: 'rgb(16,185,129,0.4)',
  },
  error: {
    icon: XCircle,
    iconColor: '#EF4444',
    accentBg:  'rgb(239,68,68,0.1)',
    accentBorder: 'rgb(239,68,68,0.4)',
  },
  ml: {
    icon: Brain,
    iconColor: '#FFCC00',
    accentBg:  'rgb(255,204,0,0.1)',
    accentBorder: 'rgb(255,204,0,0.4)',
  },
  info: {
    icon: CheckCircle2,
    iconColor: '#3B82F6',
    accentBg:  'rgb(59,130,246,0.1)',
    accentBorder: 'rgb(59,130,246,0.4)',
  },
};

// ── Single toast card ────────────────────────────────────────────────────────
function ToastCard({ toast, onDismiss }) {
  const cfg = KIND_CFG[toast.kind] || KIND_CFG.info;
  const Icon = cfg.icon;
  const [isLeaving, setIsLeaving] = useState(false);

  // Trigger leave animation 150ms before unmount
  const handleDismiss = useCallback(() => {
    setIsLeaving(true);
    window.setTimeout(() => onDismiss(toast.id), 180);
  }, [onDismiss, toast.id]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;
    const id = window.setTimeout(handleDismiss, toast.duration);
    return () => window.clearTimeout(id);
  }, [toast.duration, handleDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        pointer-events-auto w-[360px] overflow-hidden rounded-[10px] border bg-[var(--nexus-panel-solid)]
        backdrop-blur-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.25)]
        transition-all duration-200
        ${isLeaving ? 'translate-x-4 opacity-0' : 'translate-x-0 opacity-100'}
      `}
      style={{ borderColor: cfg.accentBorder }}
    >
      {/* Top accent stripe */}
      <div className="h-[2px] w-full" style={{ backgroundColor: cfg.iconColor }} />

      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Icon */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: cfg.accentBg, color: cfg.iconColor }}
        >
          <Icon size={16} aria-hidden="true" />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-[var(--text-1)]">
            {toast.title}
          </p>
          {toast.description && (
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-3)]">
              {toast.description}
            </p>
          )}
          {toast.meta && (
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-[var(--text-3)]">
              {toast.meta.map((m, i) => (
                <span
                  key={i}
                  className="rounded-[3px] border px-1.5 py-0.5 font-mono"
                  style={{ borderColor: cfg.accentBorder, color: cfg.iconColor }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}
          {toast.cta && (
            <button
              type="button"
              onClick={() => { toast.cta.onClick?.(); handleDismiss(); }}
              className="mt-2 text-[11px] font-semibold transition-opacity hover:opacity-80"
              style={{ color: cfg.iconColor }}
            >
              {toast.cta.label} →
            </button>
          )}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded-[4px] p-1 text-[var(--text-3)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]"
          aria-label="Dismiss notification"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((opts) => {
    const id = ++idRef.current;
    setToasts((prev) => [
      ...prev,
      { id, kind: 'info', duration: 7000, ...opts },
    ]);
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Global SSE listener — fires toasts on ML retrain events ──────────────
  // One EventSource for the whole app; reads `learning_event` records broadcast
  // from the backend's retraining pipeline. Modal closes early ("training kicked
  // off"); the actual subprocess completion arrives here.
  useEffect(() => {
    let es = null;
    let reconnectTimer = null;
    let stopped = false;

    function connect() {
      es = new EventSource(`${API_BASE}/api/v1/ops/live-stream`, { withCredentials: true });

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type !== 'learning_event') return;

          if (data.action === 'retrain_complete') {
            const meta = [];
            if (typeof data.realRowsAdded === 'number') meta.push(`${data.realRowsAdded} REAL ROWS`);
            if (data.accuracy != null) meta.push(`${(data.accuracy * 100).toFixed(2)}% ACC`);
            showToast({
              kind: 'ml',
              title: 'ML Retrain Complete',
              description: data.message || 'Classifier model has been retrained on real-world data.',
              meta: meta.length ? meta : undefined,
              duration: 9000,
            });
          } else if (data.action === 'retrain_failed') {
            showToast({
              kind: 'error',
              title: 'ML Retrain Failed',
              description: data.message || 'Training subprocess exited with a non-zero code. Check backend logs.',
              duration: 11000,
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        if (es) es.close();
        if (stopped) return;
        // Reconnect after 5s — best-effort, don't spam
        reconnectTimer = window.setTimeout(connect, 5000);
      };
    }

    // Tiny delay so it doesn't compete with auth bootstrap on first paint
    const startTimer = window.setTimeout(connect, 1500);

    return () => {
      stopped = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed top-6 right-6 z-[9999] flex flex-col gap-2.5">
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismissToast} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
