import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ── Tour step definitions ────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    target: '[data-tour="sidebar"]',
    title: 'Navigation Hub',
    description:
      'Access all NEXUS modules: PCC Inbox for live cases, Board for Kanban view, Upload for new incidents, and Admin dashboards.',
    position: 'right',
  },
  {
    target: '[data-tour="inbox"]',
    title: 'Smart Inbox',
    description:
      'Cases are auto-sorted by AI: Bot Active (processing), Needs Review (human decision required), and My Cases (assigned to you).',
    position: 'right',
  },
  {
    target: '[data-tour="conversation"]',
    title: 'AI Processing Timeline',
    description:
      'Watch the full journey: email received → RPA enrichment → AI classification → SOP matching → resolution. Every step is transparent.',
    position: 'bottom',
  },
  {
    target: '[data-tour="copilot"]',
    title: 'AI Copilot',
    description:
      'Real-time AI insights for the agent: customer DNA, sentiment analysis, SOP recommendations, similar resolved cases, and drafted responses. Never visible to the customer.',
    position: 'left',
  },
  {
    target: '[data-tour="decision"]',
    title: 'Human-in-the-Loop',
    description:
      'The critical moment: AI recommends, human decides. Approve to proceed or reject with feedback. Every decision is audited.',
    position: 'left',
  },
];

// ── Positioning helpers ──────────────────────────────────────────────────────

const TOOLTIP_GAP = 14;
const TOOLTIP_W = 320;
const TOOLTIP_H_EST = 180; // rough estimate for initial calc

function computeTooltipPos(targetRect, preferred) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = targetRect.left + targetRect.width / 2;
  const cy = targetRect.top + targetRect.height / 2;

  // Available space on each side
  const spaceRight = vw - targetRect.right;
  const spaceLeft = targetRect.left;
  const spaceBottom = vh - targetRect.bottom;
  const spaceTop = targetRect.top;

  // Try preferred, then fallback order
  const order = {
    right: ['right', 'left', 'bottom', 'top'],
    left: ['left', 'right', 'bottom', 'top'],
    bottom: ['bottom', 'top', 'right', 'left'],
    top: ['top', 'bottom', 'right', 'left'],
  }[preferred] || ['bottom', 'right', 'left', 'top'];

  for (const dir of order) {
    if (dir === 'right' && spaceRight >= TOOLTIP_W + TOOLTIP_GAP) {
      return {
        dir,
        left: targetRect.right + TOOLTIP_GAP,
        top: Math.max(8, Math.min(cy - TOOLTIP_H_EST / 2, vh - TOOLTIP_H_EST - 8)),
      };
    }
    if (dir === 'left' && spaceLeft >= TOOLTIP_W + TOOLTIP_GAP) {
      return {
        dir,
        left: targetRect.left - TOOLTIP_W - TOOLTIP_GAP,
        top: Math.max(8, Math.min(cy - TOOLTIP_H_EST / 2, vh - TOOLTIP_H_EST - 8)),
      };
    }
    if (dir === 'bottom' && spaceBottom >= TOOLTIP_H_EST + TOOLTIP_GAP) {
      return {
        dir,
        left: Math.max(8, Math.min(cx - TOOLTIP_W / 2, vw - TOOLTIP_W - 8)),
        top: targetRect.bottom + TOOLTIP_GAP,
      };
    }
    if (dir === 'top' && spaceTop >= TOOLTIP_H_EST + TOOLTIP_GAP) {
      return {
        dir,
        left: Math.max(8, Math.min(cx - TOOLTIP_W / 2, vw - TOOLTIP_W - 8)),
        top: targetRect.top - TOOLTIP_H_EST - TOOLTIP_GAP,
      };
    }
  }

  // Fallback: bottom-center
  return {
    dir: 'bottom',
    left: Math.max(8, Math.min(cx - TOOLTIP_W / 2, vw - TOOLTIP_W - 8)),
    top: targetRect.bottom + TOOLTIP_GAP,
  };
}

// ── Spotlight overlay (box-shadow approach) ──────────────────────────────────

function SpotlightOverlay({ rect, onClick }) {
  if (!rect) return null;

  const pad = 6;
  const r = 8;
  const x = rect.left - pad;
  const y = rect.top - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;

  return (
    <div
      onClick={onClick}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        pointerEvents: 'auto',
        /* box-shadow creates the darkened overlay with a transparent cutout */
        borderRadius: `${r}px`,
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
        boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.75)`,
        backdropFilter: 'blur(2px)',
        transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    />
  );
}

// ── Tooltip card ─────────────────────────────────────────────────────────────

function Tooltip({ step, stepIndex, totalSteps, pos, onNext, onBack, onSkip }) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      role="dialog"
      aria-label={`Tour step ${stepIndex + 1}: ${step.title}`}
      style={{
        position: 'fixed',
        zIndex: 99999,
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        width: `${TOOLTIP_W}px`,
        transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div
        style={{
          background: 'var(--nexus-panel-solid)',
          border: '1px solid rgba(212, 5, 17, 0.3)',
          borderRadius: '10px',
          padding: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(212,5,17,0.08)',
        }}
      >
        {/* Step indicator */}
        <p
          style={{
            margin: '0 0 8px 0',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--nexus-text-3)',
          }}
        >
          Step {stepIndex + 1} of {totalSteps}
        </p>

        {/* Title */}
        <h3
          style={{
            margin: '0 0 8px 0',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--nexus-text-1)',
            lineHeight: 1.3,
          }}
        >
          {step.title}
        </h3>

        {/* Description */}
        <p
          style={{
            margin: '0 0 20px 0',
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'var(--nexus-text-2)',
          }}
        >
          {step.description}
        </p>

        {/* Progress bar */}
        <div
          style={{
            height: '2px',
            background: 'var(--nexus-surface-2)',
            borderRadius: '1px',
            marginBottom: '16px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${((stepIndex + 1) / totalSteps) * 100}%`,
              background: '#D40511',
              borderRadius: '1px',
              transition: 'width 300ms ease',
            }}
          />
        </div>

        {/* Button row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Skip */}
          <button
            type="button"
            onClick={onSkip}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--nexus-text-3)',
              cursor: 'pointer',
              borderRadius: '6px',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--nexus-text-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--nexus-text-3)')}
          >
            Skip
          </button>

          <div style={{ flex: 1 }} />

          {/* Back */}
          {!isFirst && (
            <button
              type="button"
              onClick={onBack}
              style={{
                background: 'transparent',
                border: '1px solid var(--nexus-border)',
                padding: '7px 16px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--nexus-text-2)',
                cursor: 'pointer',
                borderRadius: '6px',
                transition: 'all 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--nexus-text-3)';
                e.currentTarget.style.color = 'var(--nexus-text-1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--nexus-border)';
                e.currentTarget.style.color = 'var(--nexus-text-2)';
              }}
            >
              Back
            </button>
          )}

          {/* Next / Finish */}
          <button
            type="button"
            onClick={onNext}
            style={{
              background: isLast ? '#10B981' : '#D40511',
              border: 'none',
              padding: '7px 20px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              borderRadius: '6px',
              transition: 'filter 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            {isLast ? 'Finish Tour' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main DemoTour component ──────────────────────────────────────────────────

export default function DemoTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ left: 0, top: 0, dir: 'bottom' });
  const [visible, setVisible] = useState(false); // for fade-in
  const rafRef = useRef(null);

  // Measure target element and compute positions
  const measure = useCallback(() => {
    if (!active) return;
    const currentStep = TOUR_STEPS[step];
    if (!currentStep) return;

    const el = document.querySelector(currentStep.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setTooltipPos(computeTooltipPos(rect, currentStep.position));
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } else {
      // Target not found — use a centered fallback
      const fallback = {
        left: window.innerWidth / 2 - 100,
        top: window.innerHeight / 2 - 50,
        width: 200,
        height: 100,
        right: window.innerWidth / 2 + 100,
        bottom: window.innerHeight / 2 + 50,
      };
      setTargetRect(fallback);
      setTooltipPos(computeTooltipPos(fallback, currentStep.position));
    }
  }, [active, step]);

  // Measure on step change and window resize
  useEffect(() => {
    if (!active) return;

    // Small delay to allow DOM to settle after navigation
    const timer = setTimeout(() => {
      measure();
      setVisible(true);
    }, 100);

    const handleResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, step, measure]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;

    function handleKey(e) {
      if (e.key === 'Escape') {
        closeTour();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goBack();
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, step]);

  function startTour() {
    setStep(0);
    setActive(true);
    setVisible(false);
  }

  function closeTour() {
    setVisible(false);
    setTimeout(() => {
      setActive(false);
      setStep(0);
      setTargetRect(null);
    }, 200);
  }

  function goNext() {
    if (step < TOUR_STEPS.length - 1) {
      setVisible(false);
      setTimeout(() => {
        setStep((s) => s + 1);
      }, 150);
    } else {
      closeTour();
    }
  }

  function goBack() {
    if (step > 0) {
      setVisible(false);
      setTimeout(() => {
        setStep((s) => s - 1);
      }, 150);
    }
  }

  // ── Floating trigger button ──
  const triggerButton = (
    <button
      type="button"
      onClick={startTour}
      aria-label="Start guided tour"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99990,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 18px',
        background: '#D40511',
        color: '#ffffff',
        border: 'none',
        borderRadius: '999px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(212, 5, 17, 0.4), 0 2px 8px rgba(0,0,0,0.3)',
        transition: 'transform 150ms, box-shadow 150ms',
        letterSpacing: '0.01em',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.05)';
        e.currentTarget.style.boxShadow =
          '0 6px 28px rgba(212, 5, 17, 0.5), 0 3px 12px rgba(0,0,0,0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow =
          '0 4px 20px rgba(212, 5, 17, 0.4), 0 2px 8px rgba(0,0,0,0.3)';
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          fontSize: '12px',
          fontWeight: 700,
        }}
      >
        ?
      </span>
      Tour
    </button>
  );

  // ── Overlay portal ──
  const overlay =
    active && targetRect
      ? createPortal(
          <div
            style={{
              opacity: visible ? 1 : 0,
              transition: 'opacity 300ms ease',
            }}
          >
            <SpotlightOverlay rect={targetRect} onClick={closeTour} />
            <Tooltip
              step={TOUR_STEPS[step]}
              stepIndex={step}
              totalSteps={TOUR_STEPS.length}
              pos={tooltipPos}
              onNext={goNext}
              onBack={goBack}
              onSkip={closeTour}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {!active && triggerButton}
      {overlay}
    </>
  );
}
