import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { ChevronDown, Clock, DollarSign, Shield, Zap } from 'lucide-react';
import { getRoiLive } from '../lib/api';

function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }) {
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState('0');
  const prevTarget = useRef(0);

  useEffect(() => {
    const num = Number(value) || 0;
    const from = prevTarget.current;
    prevTarget.current = num;

    const controls = animate(motionVal, num, {
      duration: from === 0 ? 1.4 : 0.8,
      ease: 'easeOut',
    });

    const unsub = motionVal.on('change', (v) => {
      if (decimals > 0) {
        setDisplay(v.toFixed(decimals));
      } else {
        setDisplay(Math.round(v).toLocaleString('en-MY'));
      }
    });

    return () => { controls.stop(); unsub(); };
  }, [value, decimals, motionVal]);

  return (
    <span className="font-mono-ui" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{display}{suffix}
    </span>
  );
}

function RoiStat({ icon: Icon, color, label, children, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.35 }}
      className="flex items-center gap-2.5"
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${color}14`, border: `1px solid ${color}28` }}
      >
        <Icon size={13} color={color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
          {label}
        </p>
        <p className="text-sm font-bold leading-tight" style={{ color }}>
          {children}
        </p>
      </div>
    </motion.div>
  );
}

export default function RoiCounter() {
  const [roi, setRoi] = useState(null);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      const data = await getRoiLive();
      if (active && data) setRoi(data);
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);

  if (!roi) return null;

  return (
    <div
      className="mx-2 mb-2 rounded-lg"
      style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(6,182,212,0.06))',
        border: '1px solid rgba(16,185,129,0.2)',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1.5 px-3 py-2"
        style={{ cursor: 'pointer', background: 'none', border: 'none' }}
      >
        <motion.div
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: '#10B981' }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: '#10B981' }}>
          Live ROI
        </span>
        <motion.div
          className="ml-auto"
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={12} style={{ color: '#10B981' }} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col gap-2.5 px-3 pb-3">
              <RoiStat icon={Clock} color="#10B981" label="Hours saved" index={0}>
                <AnimatedNumber value={roi.hoursSaved} decimals={1} suffix="h" />
              </RoiStat>
              <RoiStat icon={DollarSign} color="#FFCC00" label="Cost saved" index={1}>
                <AnimatedNumber value={roi.costSaved} prefix="RM " />
              </RoiStat>
              <RoiStat icon={Zap} color="#f59e0b" label="Auto-resolved" index={2}>
                <AnimatedNumber value={roi.autoResolved} />
              </RoiStat>
              <RoiStat icon={Shield} color="#FF8C00" label="Complaints prevented" index={3}>
                <AnimatedNumber value={roi.preventedComplaints} />
              </RoiStat>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
