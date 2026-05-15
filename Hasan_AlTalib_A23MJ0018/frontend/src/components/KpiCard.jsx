import { useEffect, useState, useRef } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';

const STATUS_CONFIG = {
  critical: {
    borderColor: 'rgba(212, 5, 17, 0.4)',
    glowColor: 'rgba(212, 5, 17, 0.15)',
    valueColor: '#D40511',
    pulseAnimation: true,
  },
  warning: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    glowColor: 'rgba(245, 158, 11, 0.1)',
    valueColor: '#f59e0b',
    pulseAnimation: true,
  },
  success: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
    glowColor: 'rgba(16, 185, 129, 0.1)',
    valueColor: '#10b981',
    pulseAnimation: false,
  },
  normal: {
    borderColor: 'rgba(99, 102, 241, 0.15)',
    glowColor: 'transparent',
    valueColor: 'var(--nexus-text-1)',
    pulseAnimation: false,
  },
};

// Parses a value string like "$1,400", "12.3%", "47" into prefix, number, suffix
function parseValue(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^([^0-9]*?)([\d,]+\.?\d*)(.*?)$/);
  if (!match) return null;
  const prefix = match[1];
  const raw = match[2];
  const suffix = match[3];
  const numeric = parseFloat(raw.replace(/,/g, ''));
  if (isNaN(numeric)) return null;
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  const hasCommas = raw.includes(',');
  return { prefix, numeric, suffix, decimals, hasCommas };
}

function useAnimatedNumber(value) {
  const parsed = parseValue(value);
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState(value);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!parsed || hasAnimated.current) return;
    hasAnimated.current = true;

    const { prefix, numeric, suffix, decimals, hasCommas } = parsed;

    const unsubscribe = motionVal.on('change', (latest) => {
      let formatted = decimals > 0
        ? latest.toFixed(decimals)
        : Math.round(latest).toString();

      if (hasCommas) {
        const [intPart, decPart] = formatted.split('.');
        const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        formatted = decPart ? `${withCommas}.${decPart}` : withCommas;
      }

      setDisplay(`${prefix}${formatted}${suffix}`);
    });

    const controls = animate(motionVal, numeric, {
      duration: 1.2,
      ease: 'easeOut',
    });

    return () => {
      unsubscribe();
      controls.stop();
    };
  }, []); // only on mount

  if (!parsed) return value;
  return display;
}

export default function KpiCard({
  label, 
  value, 
  hint, 
  status = 'normal',
  trend = null, // 'up' | 'down' | null
  index = 0 
}) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.normal;
  const displayValue = useAnimatedNumber(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      className="relative overflow-hidden rounded-xl p-5"
      style={{
        background: 'var(--nexus-panel-bg)',
        border: `1px solid ${config.borderColor}`,
        boxShadow: `0 4px 24px rgba(0, 0, 0, 0.2), 0 0 40px ${config.glowColor}`,
      }}
    >
      {/* Top accent line */}
      <div 
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: status === 'critical' 
            ? 'linear-gradient(90deg, #D40511, transparent)'
            : status === 'warning'
            ? 'linear-gradient(90deg, #f59e0b, transparent)'
            : status === 'success'
            ? 'linear-gradient(90deg, #10b981, transparent)'
            : 'linear-gradient(90deg, rgba(6, 182, 212, 0.3), transparent)',
        }}
      />

      {/* Animated corner accent for critical */}
      {config.pulseAnimation && (
        <motion.div
          className="absolute top-2 right-2 h-2 w-2 rounded-full"
          style={{ background: config.valueColor }}
          animate={{ 
            opacity: [1, 0.3, 1],
            scale: [1, 0.8, 1],
          }}
          transition={{ 
            duration: status === 'critical' ? 1 : 2, 
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}

      {/* Label */}
      <p 
        className="text-[10px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: 'var(--nexus-text-3)' }}
      >
        {label}
      </p>

      {/* Value with optional trend */}
      <div className="mt-3 flex items-end gap-2">
        <motion.p
          className="text-4xl font-extrabold leading-none tracking-tight"
          style={{ 
            color: config.valueColor,
            fontVariantNumeric: 'tabular-nums',
          }}
          animate={config.pulseAnimation ? {
            textShadow: [
              `0 0 20px ${config.glowColor}`,
              `0 0 40px ${config.glowColor}`,
              `0 0 20px ${config.glowColor}`,
            ],
          } : {}}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {displayValue}
        </motion.p>
        
        {trend && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`mb-1 flex items-center text-xs font-semibold ${
              trend === 'up' ? 'text-[#10b981]' : 'text-[#ef4444]'
            }`}
          >
            {trend === 'up' ? (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </motion.span>
        )}
      </div>

      {/* Hint */}
      {hint && (
        <p 
          className="mt-3 text-[11px]"
          style={{ color: 'var(--nexus-text-3)' }}
        >
          {hint}
        </p>
      )}
    </motion.div>
  );
}
