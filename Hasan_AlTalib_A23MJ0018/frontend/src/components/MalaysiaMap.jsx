"use client";

import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { queryIntelligence } from '../lib/api';

const LOCATIONS = [
  { name: 'Penang Hub',        lat: 5.3541,  lng: 100.4296, region: 'North' },
  { name: 'Shah Alam Hub',     lat: 3.0733,  lng: 101.5185, region: 'Central' },
  { name: 'Subang Jaya Depot', lat: 3.0456,  lng: 101.581,  region: 'Central' },
  { name: 'KLIA Cargo',        lat: 2.7456,  lng: 101.7072, region: 'South Central' },
  { name: 'JB Distribution',   lat: 1.4927,  lng: 103.7414, region: 'South' },
];

// Hub connections for data flow animation
const HUB_CONNECTIONS = [
  { from: 'Penang Hub', to: 'Shah Alam Hub' },
  { from: 'Shah Alam Hub', to: 'Subang Jaya Depot' },
  { from: 'Subang Jaya Depot', to: 'KLIA Cargo' },
  { from: 'KLIA Cargo', to: 'JB Distribution' },
  { from: 'Shah Alam Hub', to: 'KLIA Cargo' },
];

const PENINSULA_PATH =
  'M 132,28 L 158,26 L 190,38 L 218,60 L 240,88 L 256,122 L 252,158 L 262,194 L 250,234 L 260,270 L 252,312 L 236,354 L 214,398 L 184,444 L 158,458 L 138,434 L 132,396 L 124,356 L 112,316 L 104,276 L 94,238 L 90,198 L 82,158 L 86,116 L 96,76 L 112,44 Z';

const SAMPLE_QUERIES = [
  "Is everything OK at our hubs today?",
  "Show me critical incidents at Shah Alam",
  "What's the SLA status across all hubs?",
  "Are there any cascade risks right now?",
];

function getCoords(lat, lng) {
  const x = ((lng - 99.5) / 5.0) * 320 + 40;
  const y = ((6.5 - lat) / 5.3) * 420 + 40;
  return { x, y };
}

function getAlertLevel(count, hasCluster, cascadeInfo, intelligenceLevel) {
  if (intelligenceLevel === 'critical' || hasCluster) return 'critical';
  if (intelligenceLevel === 'danger') return 'danger';
  if (intelligenceLevel === 'warning' || cascadeInfo?.riskLevel === 'high') return 'warning';
  if (count >= 8) return 'high';
  if (count >= 4) return 'medium';
  return 'normal';
}

function getAlertColor(level) {
  switch (level) {
    case 'critical': return '#D40511';
    case 'danger': return '#ef4444';
    case 'warning': return '#f59e0b';
    case 'high': return '#ef4444';
    case 'medium': return '#f59e0b';
    default: return '#FFCC00';
  }
}

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur',
  }) + ' MYT';
}

function buildCascadeIndex(cascadeRisk = []) {
  const index = new Map();
  for (const prediction of cascadeRisk) {
    for (const edge of prediction.downstream || []) {
      const existing = index.get(edge.hub);
      const riskOrder = { high: 2, medium: 1, low: 0 };
      if (!existing || riskOrder[edge.riskLevel] > riskOrder[existing.riskLevel]) {
        index.set(edge.hub, {
          riskLevel: edge.riskLevel,
          estimatedImpactTime: edge.estimatedImpactTime,
          recommendation: prediction.recommendation,
          sourceHub: prediction.sourceHub,
        });
      }
    }
  }
  return index;
}

// Animated data flow particle
function DataFlowParticle({ from, to, delay = 0 }) {
  const fromCoords = getCoords(
    LOCATIONS.find(l => l.name === from)?.lat ?? 3,
    LOCATIONS.find(l => l.name === from)?.lng ?? 101
  );
  const toCoords = getCoords(
    LOCATIONS.find(l => l.name === to)?.lat ?? 3,
    LOCATIONS.find(l => l.name === to)?.lng ?? 101
  );

  return (
    <motion.circle
      r="3"
      fill="#FFCC00"
      filter="url(#glow-cyan)"
      initial={{ opacity: 0 }}
      animate={{
        cx: [fromCoords.x, toCoords.x],
        cy: [fromCoords.y, toCoords.y],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: 3,
        delay,
        repeat: Infinity,
        ease: "linear",
      }}
    />
  );
}

// Hub marker component
function HubMarker({ location, count, alertLevel, isSelected, onClick, onHover }) {
  const { x, y } = getCoords(location.lat, location.lng);
  const color = getAlertColor(alertLevel);
  const radius = Math.max(18, Math.min(36, 18 + (count / 10) * 18));

  const pulseClass = alertLevel === 'critical' ? 'nexus-critical' 
    : alertLevel === 'warning' || alertLevel === 'danger' ? 'nexus-warning' 
    : 'nexus-idle';

  return (
    <g
      className="cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => onHover(location)}
      onMouseLeave={() => onHover(null)}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      {/* Outer glow ring */}
      <motion.circle
        cx={x}
        cy={y}
        r={radius + 12}
        fill="none"
        stroke={color}
        strokeWidth="1"
        opacity={0.3}
        animate={{
          r: [radius + 8, radius + 20, radius + 8],
          opacity: alertLevel === 'critical' ? [0.5, 0.1, 0.5] : [0.3, 0.1, 0.3],
        }}
        transition={{
          duration: alertLevel === 'critical' ? 1.5 : 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Secondary pulse ring for critical */}
      {alertLevel === 'critical' && (
        <motion.circle
          cx={x}
          cy={y}
          r={radius + 8}
          fill="none"
          stroke={color}
          strokeWidth="2"
          opacity={0}
          animate={{
            r: [radius + 4, radius + 30],
            opacity: [0.8, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      )}

      {/* Main hub circle */}
      <motion.circle
        cx={x}
        cy={y}
        r={radius}
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth={isSelected ? 3 : 2}
        filter={`url(#glow-${alertLevel === 'critical' ? 'red' : alertLevel === 'warning' ? 'amber' : 'cyan'})`}
        animate={{
          scale: isSelected ? 1.15 : 1,
          fillOpacity: isSelected ? 0.4 : 0.2,
        }}
        transition={{ duration: 0.3 }}
      />

      {/* Inner core */}
      <circle
        cx={x}
        cy={y}
        r={radius * 0.5}
        fill={color}
        fillOpacity={0.6}
      />

      {/* Count label */}
      <text
        x={x}
        y={y + 1}
        fill="#ffffff"
        fontSize={radius > 24 ? 14 : 11}
        fontWeight="800"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
      >
        {count}
      </text>

      {/* Hub name label */}
      <text
        x={x}
        y={y + radius + 16}
        fill="#94a3b8"
        fontSize="9"
        fontWeight="600"
        textAnchor="middle"
        letterSpacing="0.05em"
      >
        {location.name.toUpperCase().replace(' HUB', '').replace(' DEPOT', '').replace(' CARGO', '').replace(' DISTRIBUTION', '')}
      </text>
    </g>
  );
}

export default function MalaysiaMap({
  byLocation = {},
  byType = {},
  clusters = [],
  cascadeRisk = [],
}) {
  const navigate = useNavigate();

  // Intelligence query state
  const [queryText, setQueryText] = useState('');
  const [querying, setQuerying] = useState(false);
  const [answer, setAnswer] = useState('');
  const [hubAlerts, setHubAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [queryError, setQueryError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Hover tooltip
  const [hoveredHub, setHoveredHub] = useState(null);
  const [selectedHub, setSelectedHub] = useState(null);
  const inputRef = useRef(null);

  const clusterByLocation = new Map(
    clusters.filter((c) => c.location).map((c) => [c.location, c]),
  );
  const cascadeIndex = buildCascadeIndex(cascadeRisk);
  const alertByHub = new Map(hubAlerts.map((a) => [a.hub, a.alertLevel]));

  // Find focus hub for zoom
  const priorityOrder = { critical: 3, danger: 2, warning: 1, info: 0 };
  let focusHub = null;
  let focusPriority = -1;
  for (const [hub, level] of alertByHub.entries()) {
    if ((priorityOrder[level] ?? -1) > focusPriority) {
      focusPriority = priorityOrder[level];
      focusHub = hub;
    }
  }

  const focusCoords = focusHub
    ? getCoords(
        LOCATIONS.find((l) => l.name === focusHub)?.lat ?? 3.0,
        LOCATIONS.find((l) => l.name === focusHub)?.lng ?? 101.5,
      )
    : null;

  // Text-to-speech for AI response
  function speakAnswer(text) {
    if ('speechSynthesis' in window && text) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }

  async function handleQuery(customQuery) {
    const q = customQuery || queryText.trim();
    if (!q || querying) return;
    setQuerying(true);
    setAnswer('');
    setQueryError('');
    setHubAlerts([]);
    setStats(null);
    try {
      const result = await queryIntelligence(q);
      setAnswer(result.answer || '');
      setHubAlerts(result.hubAlerts || []);
      setStats(result.stats || null);
      if (result.answer) {
        speakAnswer(result.answer);
      }
    } catch (err) {
      setQueryError(err.message || 'Query failed');
    } finally {
      setQuerying(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  }

  function clearQuery() {
    setQueryText('');
    setAnswer('');
    setHubAlerts([]);
    setStats(null);
    setQueryError('');
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }

  return (
    <div className="relative flex flex-col gap-6">
      {/* Intelligence Search Bar */}
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Ask NEXUS anything... e.g. "Is everything OK today?"'
              disabled={querying}
              className="h-12 w-full rounded-lg border border-[rgba(99,102,241,0.2)] bg-[#0a0f1a] px-4 pr-12 text-sm text-white placeholder:text-[#64748b] focus:border-[#D40511] focus:outline-none focus:ring-2 focus:ring-[#D40511]/20 disabled:opacity-60"
              style={{ boxShadow: '0 0 20px rgba(6, 182, 212, 0.05)' }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {querying ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-5 w-5 rounded-full border-2 border-[#D40511] border-t-transparent"
                />
              ) : (
                <svg className="h-5 w-5 text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </div>
          </div>
          <motion.button
            type="button"
            onClick={() => handleQuery()}
            disabled={querying || !queryText.trim()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-[#D40511] to-[#b8040e] px-6 text-sm font-bold text-white shadow-lg shadow-[#D40511]/25 hover:shadow-[#D40511]/40 disabled:opacity-50 disabled:shadow-none"
          >
            Ask NEXUS
          </motion.button>
          {(answer || queryError) && (
            <button
              type="button"
              onClick={clearQuery}
              className="h-12 rounded-lg border border-[rgba(99,102,241,0.2)] px-4 text-xs text-[#64748b] hover:border-[#D40511]/50 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Sample queries */}
        {!answer && !queryError && (
          <div className="flex flex-wrap gap-2">
            {SAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setQueryText(q); handleQuery(q); }}
                disabled={querying}
                className="rounded-full border border-[rgba(99,102,241,0.15)] bg-[#111827] px-3 py-1.5 text-xs text-[#94a3b8] hover:border-[#D40511]/50 hover:text-white disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* AI Response */}
        <AnimatePresence>
          {queryError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg border-l-4 border-red-500 bg-red-500/10 px-4 py-3"
            >
              <p className="text-sm text-red-400">{queryError}</p>
            </motion.div>
          )}
          {answer && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg border-l-4 border-[#D40511] bg-gradient-to-r from-[rgba(212,5,17,0.1)] to-transparent p-4"
              style={{ boxShadow: '0 0 30px rgba(212, 5, 17, 0.1)' }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#D40511]">
                  NEXUS Intelligence
                </span>
                {isSpeaking && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="flex items-center gap-1"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D40511]" />
                    <span className="h-2 w-1.5 rounded-full bg-[#D40511]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D40511]" />
                  </motion.div>
                )}
              </div>
              <p className="text-sm leading-relaxed text-[#f8fafc]">{answer}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats Strip */}
      <AnimatePresence>
        {stats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-4 gap-3"
          >
            {[
              { label: 'Active', value: stats.activeIncidents, color: '#D40511' },
              { label: 'Clusters', value: stats.clustersActive, color: '#f59e0b' },
              { label: 'Near Breach', value: stats.slaAtRisk, color: '#ef4444' },
              { label: 'Messages Sent', value: stats.recoveryMessagesSent, color: '#FFCC00' },
            ].map(({ label, value, color }) => (
              <motion.div
                key={label}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="rounded-lg border border-[rgba(99,102,241,0.15)] bg-[#111827] p-3 text-center"
                style={{ boxShadow: `0 0 20px ${color}10` }}
              >
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="text-[10px] uppercase tracking-wider text-[#64748b]">{label}</p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Map */}
      <div className="relative mx-auto" style={{ width: '100%', maxWidth: 500, aspectRatio: '4/5' }}>
        <motion.div
          className="absolute inset-0"
          animate={focusCoords && hubAlerts.length > 0 ? {
            scale: 1.15,
            x: (250 - focusCoords.x) * 0.15,
            y: (250 - focusCoords.y) * 0.15,
          } : {
            scale: 1,
            x: 0,
            y: 0,
          }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          <svg
            viewBox="0 0 400 500"
            className="h-full w-full"
            style={{ filter: 'drop-shadow(0 0 40px rgba(6, 182, 212, 0.1))' }}
          >
            <defs>
              {/* Gradients */}
              <linearGradient id="map-gradient" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#1e1e1e" />
                <stop offset="100%" stopColor="#0f0f0f" />
              </linearGradient>
              <linearGradient id="border-gradient" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#FFCC00" stopOpacity="0.5" />
                <stop offset="50%" stopColor="#D40511" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#FFCC00" stopOpacity="0.5" />
              </linearGradient>

              {/* Glow filters */}
              <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor="#FFCC00" floodOpacity="0.6" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feFlood floodColor="#D40511" floodOpacity="0.8" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feFlood floodColor="#f59e0b" floodOpacity="0.7" />
                <feComposite in2="blur" operator="in" />
                <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>

              {/* Grid pattern */}
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e3a5f" strokeWidth="0.5" opacity="0.3" />
              </pattern>
            </defs>

            {/* Background */}
            <rect width="400" height="500" fill="#030712" />
            <rect width="400" height="500" fill="url(#grid)" opacity="0.5" />

            {/* Peninsula Malaysia */}
            <path
              d={PENINSULA_PATH}
              fill="url(#map-gradient)"
              stroke="url(#border-gradient)"
              strokeWidth="2"
              filter="url(#glow-cyan)"
              style={{ filter: 'drop-shadow(0 0 20px rgba(6, 182, 212, 0.2))' }}
            />

            {/* Connection lines */}
            {HUB_CONNECTIONS.map(({ from, to }, i) => {
              const fromLoc = LOCATIONS.find(l => l.name === from);
              const toLoc = LOCATIONS.find(l => l.name === to);
              if (!fromLoc || !toLoc) return null;
              const fromCoords = getCoords(fromLoc.lat, fromLoc.lng);
              const toCoords = getCoords(toLoc.lat, toLoc.lng);
              return (
                <line
                  key={`${from}-${to}`}
                  x1={fromCoords.x}
                  y1={fromCoords.y}
                  x2={toCoords.x}
                  y2={toCoords.y}
                  stroke="#1e3a5f"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  opacity="0.4"
                />
              );
            })}

            {/* Data flow particles */}
            {HUB_CONNECTIONS.map(({ from, to }, i) => (
              <DataFlowParticle key={`flow-${from}-${to}`} from={from} to={to} delay={i * 0.6} />
            ))}

            {/* Hub markers */}
            {LOCATIONS.map((location) => {
              const count = Number(byLocation[location.name] || 0);
              const hasCluster = Boolean(clusterByLocation.get(location.name));
              const cascadeInfo = cascadeIndex.get(location.name) || null;
              const intelligenceLevel = alertByHub.get(location.name);
              const alertLevel = getAlertLevel(count, hasCluster, cascadeInfo, intelligenceLevel);

              return (
                <HubMarker
                  key={location.name}
                  location={location}
                  count={count}
                  alertLevel={alertLevel}
                  isSelected={selectedHub === location.name || hoveredHub?.name === location.name}
                  onClick={() => navigate('/board')}
                  onHover={setHoveredHub}
                />
              );
            })}
          </svg>
        </motion.div>

        {/* Tooltip */}
        <AnimatePresence>
          {hoveredHub && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="pointer-events-none absolute z-20 min-w-[240px] rounded-lg border border-[rgba(99,102,241,0.2)] bg-[#111827] p-4 shadow-2xl"
              style={{
                left: Math.min(getCoords(hoveredHub.lat, hoveredHub.lng).x + 20, 200),
                top: Math.max(getCoords(hoveredHub.lat, hoveredHub.lng).y - 10, 80),
                boxShadow: '0 0 40px rgba(6, 182, 212, 0.15)',
              }}
            >
              <p className="font-bold text-white">{hoveredHub.name}</p>
              <p className="mt-1 text-xs text-[#94a3b8]">
                Region: {hoveredHub.region}
              </p>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#64748b]">Active Incidents</span>
                  <span className="font-mono text-white">{byLocation[hoveredHub.name] || 0}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#94a3b8]">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#FFCC00]" style={{ boxShadow: '0 0 8px #FFCC00' }} />
          Normal
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#f59e0b]" style={{ boxShadow: '0 0 8px #f59e0b' }} />
          Warning
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#D40511]" style={{ boxShadow: '0 0 8px #D40511' }} />
          Critical
        </span>
        <span className="flex items-center gap-2">
          <motion.span
            className="h-3 w-3 rounded-full bg-[#FFCC00]"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          Data Flow
        </span>
      </div>
    </div>
  );
}
