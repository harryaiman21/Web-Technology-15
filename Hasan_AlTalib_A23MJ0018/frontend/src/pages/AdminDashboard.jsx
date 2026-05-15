import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, Brain, CheckCircle2, Clock, Cpu, LayoutDashboard, Network, Play, RotateCcw, Shield, Zap } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import EmptyState from '../components/EmptyState';
import Layout from '../components/Layout';
import LiveIntelFeed from '../components/LiveIntelFeed';
import LoadingSkeleton from '../components/LoadingSkeleton';
import {
  getAdminAnalytics,
  getAdminClusters,
  getAdminFeedbackMetrics,
  getAdminMlStats,
  getAdminModelHealth,
  getRpaRuns,
  getRpaRunItems,
  getCascadeHistory,
  getCascadeRisk,
  triggerCascadeAlert,
  getMorningBriefing,
  queryIntelligence,
  getLearningMetrics,
  getAutonomousConfig,
  setAutonomousConfig,
  sendMorningBriefingEmail,
  getFlushWatchUrl,
} from '../lib/api';
import KpiCard from '../components/KpiCard';
import MalaysiaMapLeaflet from '../components/MalaysiaMapLeaflet';

const CHART_COLORS = ['#FFCC00', '#FF8C00', '#f59e0b', '#34d399', '#FF8C00', '#64748b'];

function number(value) {
  return new Intl.NumberFormat('en-MY').format(Number(value) || 0);
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function hours(value) {
  return `${Number(value || 0).toFixed(1)}h`;
}

function toChartRows(objectValue, labelKey, valueKey = 'count') {
  return Object.entries(objectValue || {}).map(([label, value]) => ({
    [labelKey]: label,
    [valueKey]: value,
  }));
}

// KpiCard is now imported from components/KpiCard.jsx

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-2)]">
      {label && <p className="mb-2 text-[var(--text-1)]">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-3">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="font-mono-ui text-[var(--text-1)]">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreeLoopsCard() {
  const [open, setOpen] = useState(true);

  return (
    <div className="nexus-card nexus-card-glow p-5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="nexus-section-header mb-0">
          <span className="nexus-section-indicator" />
          <span className="nexus-section-title">How NEXUS Closes the Loop</span>
        </div>
        <span className="text-xs text-[var(--text-3)]">{open ? 'collapse ∧' : 'expand ∨'}</span>
      </button>

      {open && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#FFCC00]" />
              <span className="text-sm font-semibold text-[var(--text-1)]">Prevention Loop</span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-2)]">
              Pattern detected → Proactive action sent → Complaint never arrives → Absence measured → Informs future detection
            </p>
          </div>
          <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-amber)]" />
              <span className="text-sm font-semibold text-[var(--text-1)]">Learning Loop</span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-2)]">
              AI classifies → Reviewer corrects → Correction captured → Override rate drops → Model improves over time
            </p>
          </div>
          <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#10b981]" />
              <span className="text-sm font-semibold text-[var(--text-1)]">Outcome Loop</span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-2)]">
              Resolution applied → Follow-up checks if it worked → Success rate computed → Better recommendations next time
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FinancialRoiCard({ analytics }) {
  const [showCalc, setShowCalc] = useState(false);
  const HOURLY_RATE = 21.50; // RM3500/month ÷ (22 days × 7.5h)
  const hoursSaved = Number(analytics?.hoursSavedToday || 0);
  const rmToday = Math.round(hoursSaved * HOURLY_RATE);
  const rmMonth = Math.round(rmToday * 22);
  const rmYear = Math.round(rmMonth * 12);

  return (
    <section className="nexus-card nexus-card-glow p-5">
      <div className="nexus-section-header">
        <span className="nexus-section-indicator" />
        <span className="nexus-section-title">Financial Impact</span>
        <span className="nexus-section-subtitle ml-2">— cost savings from AI-assisted resolution</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] p-4 text-center">
          <p className="text-2xl font-bold tabular-nums text-[#10b981]">RM {rmToday.toLocaleString()}</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">Today</p>
        </div>
        <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] p-4 text-center">
          <p className="text-2xl font-bold tabular-nums text-[#10b981]">RM {rmMonth.toLocaleString()}</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">This Month (est.)</p>
        </div>
        <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] p-4 text-center">
          <p className="text-2xl font-bold tabular-nums text-[#10b981]">RM {rmYear.toLocaleString()}</p>
          <p className="mt-1 text-xs text-[var(--text-3)]">Annualised</p>
        </div>
      </div>
      {analytics?.preventedThisWeek > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-[4px] border border-[#10b981]/20 bg-[rgb(16,185,129,0.06)] px-3 py-2">
          <span className="text-lg font-bold text-[#10b981]">{analytics.preventedThisWeek}</span>
          <span className="text-xs text-[var(--text-2)]">
            complaints prevented this week
            {analytics.preventionBreakdown?.method === 'confirmed' && (
              <span className="ml-1 text-[var(--text-3)]">
                (confirmed: {analytics.preventionBreakdown.confirmedPrevented} of {analytics.preventionBreakdown.customersContacted} customers contacted did not re-complain)
              </span>
            )}
          </span>
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--text-3)]">
        Based on {hoursSaved.toFixed(1)}h saved today × RM21.50/hr (DHL Malaysia PCC rate).{' '}
        <button
          type="button"
          className="text-[var(--text-2)] underline underline-offset-2"
          onClick={() => setShowCalc((v) => !v)}
        >
          {showCalc ? 'Hide calculation' : 'How we calculated this'}
        </button>
      </p>
      {showCalc && (
        <div className="mt-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] p-3 text-xs text-[var(--text-2)] space-y-1">
          <p><span className="font-semibold">Hours saved</span> = auto-resolved incidents × 10 min + batch-approved × 9.5 min + assisted × 5 min, divided by 60.</p>
          <p><span className="font-semibold">Hourly rate</span> = DHL Malaysia PCC average salary RM3,500/month ÷ 22 working days ÷ 7.5h = RM21.50/hr.</p>
          <p><span className="font-semibold">Monthly estimate</span> = today × 22 working days. <span className="font-semibold">Annual</span> = monthly × 12.</p>
          <p className="text-[var(--text-3)]">This is a conservative estimate. It excludes SLA penalty avoidance, customer retention value, and reputational cost savings.</p>
        </div>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <LoadingSkeleton key={index} height={140} width="100%" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <LoadingSkeleton key={index} height={340} width="100%" />
      ))}
    </div>
  );
}

// ── Hub Network Topology Graph ──────────────────────────────────────────────
const HUB_NODES = [
  { id: 'Shah Alam Hub',     x: 200, y: 140, label: 'Shah Alam' },
  { id: 'KLIA Cargo',        x: 360, y: 200, label: 'KLIA Cargo' },
  { id: 'Subang Jaya Depot', x: 180, y: 260, label: 'Subang Jaya' },
  { id: 'Penang Hub',        x: 130, y: 45,  label: 'Penang' },
  { id: 'JB Distribution',   x: 500, y: 260, label: 'JB Distribution' },
];

const HUB_EDGES = [
  { from: 'Shah Alam Hub', to: 'Subang Jaya Depot' },
  { from: 'Shah Alam Hub', to: 'KLIA Cargo' },
  { from: 'KLIA Cargo', to: 'Shah Alam Hub' },
  { from: 'KLIA Cargo', to: 'Subang Jaya Depot' },
  { from: 'KLIA Cargo', to: 'Penang Hub' },
  { from: 'KLIA Cargo', to: 'JB Distribution' },
  { from: 'Subang Jaya Depot', to: 'Shah Alam Hub' },
  { from: 'Subang Jaya Depot', to: 'KLIA Cargo' },
  { from: 'Penang Hub', to: 'KLIA Cargo' },
  { from: 'JB Distribution', to: 'KLIA Cargo' },
];

function HubNetworkGraph({ cascadeRisk }) {
  const nodeMap = Object.fromEntries(HUB_NODES.map((n) => [n.id, n]));

  const activeSourceHubs = new Set(cascadeRisk.map((p) => p.sourceHub));
  const activeEdges = new Map();
  for (const pred of cascadeRisk) {
    for (const edge of pred.downstream || []) {
      activeEdges.set(`${pred.sourceHub}→${edge.hub}`, edge);
    }
  }

  const riskColor = (level) =>
    level === 'high' ? '#EF4444' : level === 'medium' ? '#F59E0B' : '#64748b';

  return (
    <svg viewBox="0 0 620 310" className="w-full" style={{ maxHeight: 310 }}>
      <defs>
        <filter id="hub-glow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <marker id="arrow-high" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,3.5 L0,7Z" fill="#EF4444" />
        </marker>
        <marker id="arrow-medium" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,3.5 L0,7Z" fill="#F59E0B" />
        </marker>
        <marker id="arrow-low" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,3.5 L0,7Z" fill="#64748b" />
        </marker>
      </defs>

      {/* Inactive edges */}
      {HUB_EDGES.map(({ from, to }) => {
        const key = `${from}→${to}`;
        if (activeEdges.has(key)) return null;
        const a = nodeMap[from];
        const b = nodeMap[to];
        if (!a || !b) return null;
        return (
          <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4"
          />
        );
      })}

      {/* Active risk edges */}
      {[...activeEdges.entries()].map(([key, edge]) => {
        const [fromId, toId] = key.split('→');
        const a = nodeMap[fromId];
        const b = nodeMap[toId];
        if (!a || !b) return null;
        const color = riskColor(edge.riskLevel);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        const r = 22;
        return (
          <g key={key}>
            <line
              x1={a.x + ux * r} y1={a.y + uy * r}
              x2={b.x - ux * r} y2={b.y - uy * r}
              stroke={color} strokeWidth="2.5" opacity="0.8"
              markerEnd={`url(#arrow-${edge.riskLevel})`}
            >
              <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
            </line>
            <text
              x={(a.x + b.x) / 2 + uy * 12} y={(a.y + b.y) / 2 - ux * 12}
              textAnchor="middle" fill={color} fontSize="9" fontWeight="700" opacity="0.9"
            >
              {Math.round(edge.baseRisk * 100)}%
            </text>
          </g>
        );
      })}

      {/* Hub nodes */}
      {HUB_NODES.map((node) => {
        const isSource = activeSourceHubs.has(node.id);
        const isTarget = [...activeEdges.keys()].some((k) => k.endsWith(`→${node.id}`));
        const isActive = isSource || isTarget;
        const fill = isSource ? '#EF4444' : isTarget ? '#F59E0B' : 'var(--surface-3)';
        const strokeColor = isSource ? '#EF4444' : isTarget ? '#F59E0B' : 'var(--border)';
        const textColor = isActive ? '#fff' : 'var(--text-2)';

        return (
          <g key={node.id}>
            {isActive && (
              <circle cx={node.x} cy={node.y} r="28" fill={fill} opacity="0.15" filter="url(#hub-glow)">
                <animate attributeName="r" values="26;32;26" dur="3s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={node.x} cy={node.y} r="20"
              fill={fill} stroke={strokeColor} strokeWidth={isActive ? 2 : 1}
              opacity={isActive ? 1 : 0.6}
            />
            <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="central"
              fill={textColor} fontSize="7" fontWeight="600" letterSpacing="0.3"
            >
              {node.label.length > 10 ? node.label.slice(0, 8) + '…' : node.label}
            </text>
            <text x={node.x} y={node.y + 34} textAnchor="middle"
              fill="var(--text-3)" fontSize="9" fontWeight="500"
            >
              {node.label}
            </text>
            {isSource && (
              <text x={node.x} y={node.y - 28} textAnchor="middle"
                fill="#EF4444" fontSize="8" fontWeight="700"
              >
                ● SOURCE
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function RiskGauge({ score, size = 52 }) {
  const pct = Math.round(score * 100);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score);
  const color = score > 0.6 ? '#EF4444' : score > 0.3 ? '#F59E0B' : '#10B981';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

function relativeTime(value) {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ── Pull Incidents Button ─────────────────────────────────────────────────────
function PullIncidentsButton() {
  const [running, setRunning] = useState(false);
  const [queued, setQueued] = useState(null);
  const esRef = useRef(null);

  const pull = () => {
    if (running) return;
    setQueued(null);
    setRunning(true);
    const es = new EventSource(getFlushWatchUrl(), { withCredentials: true });
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'complete') { setQueued(data.queued); setRunning(false); es.close(); }
        else if (data.type === 'error') { setQueued(0); setRunning(false); es.close(); }
      } catch { /* ignore */ }
    };
    es.onerror = () => { setRunning(false); es.close(); };
  };

  return (
    <button
      type="button"
      onClick={pull}
      disabled={running}
      className={`flex items-center gap-1.5 rounded-[6px] px-4 py-2 text-sm font-semibold transition ${
        running
          ? 'cursor-not-allowed bg-[#10b981]/40 text-[#030712]'
          : 'bg-[#10b981] text-[#030712] hover:bg-[#059669]'
      }`}
    >
      <Play size={13} />
      {running ? 'Pulling...' : queued != null ? `Pulled ${queued} — Pull Again` : 'Pull Incidents'}
    </button>
  );
}


export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [mlStats, setMlStats] = useState(null);
  const [modelHealth, setModelHealth] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [feedbackMetrics, setFeedbackMetrics] = useState(null);
  const [rpaRuns, setRpaRuns] = useState([]);
  const [expandedRun, setExpandedRun] = useState(null);
  const [runItems, setRunItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Feature 3: cascade risk state
  const [cascadeRisk, setCascadeRisk] = useState([]);
  const [alertingHub, setAlertingHub] = useState(null);
  const [alertedHubs, setAlertedHubs] = useState(new Set());
  // Feature 5: Executive Pulse
  const [pulse, setPulse] = useState(null);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [pulseRefreshing, setPulseRefreshing] = useState(false);
  // Learning Loop metrics
  const [learningMetrics, setLearningMetrics] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [cascadeHistory, setCascadeHistory] = useState([]);
  const [cascadeStats, setCascadeStats] = useState({ totalPredictions: 0, totalAlerts: 0, resolvedAlerts: 0 });
  // Autonomous kill switch
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [autoToggling, setAutoToggling] = useState(false);

  async function fetchPulse(isRefresh = false) {
    if (isRefresh) setPulseRefreshing(true);
    else setPulseLoading(true);
    try {
      const data = await getMorningBriefing();
      setPulse(data);
    } catch (_) { /* non-fatal */ } finally {
      setPulseLoading(false);
      setPulseRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function fetchDashboard() {
      setLoading(true);
      setError('');

      try {
        const [analyticsData, mlStatsData, modelHealthData, clusterData] = await Promise.all([
          getAdminAnalytics(),
          getAdminMlStats(),
          getAdminModelHealth(),
          getAdminClusters(),
        ]);

        if (!active) {
          return;
        }

        setAnalytics(analyticsData);
        setMlStats(mlStatsData);
        setModelHealth(modelHealthData);
        setClusters(clusterData);

        // W3: Feedback metrics — fetch separately so main dashboard never fails
        try {
          const feedbackData = await getAdminFeedbackMetrics();
          if (active) setFeedbackMetrics(feedbackData);
        } catch {
          // non-fatal: feedback panel simply won't render
        }
      } catch (fetchError) {
        if (active) {
          setError(fetchError.message || 'Failed to load admin dashboard.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchDashboard();

    return () => {
      active = false;
    };
  }, []);

  // Fetch RPA runs separately so failures don't affect the main dashboard
  useEffect(() => {
    getRpaRuns().then(setRpaRuns).catch(() => {});
  }, []);

  // Fetch learning metrics separately (non-fatal)
  useEffect(() => {
    getLearningMetrics().then(setLearningMetrics).catch(() => {});
  }, []);

  // Feature 3: fetch cascade risk separately (non-fatal)
  useEffect(() => {
    getCascadeRisk().then(setCascadeRisk).catch(() => {});
    getCascadeHistory().then((data) => {
      if (data) {
        setCascadeHistory(data.events || []);
        setCascadeStats(data.stats || { totalPredictions: 0, totalAlerts: 0, resolvedAlerts: 0 });
      }
    }).catch(() => {});
    const interval = setInterval(() => {
      getCascadeRisk().then(setCascadeRisk).catch(() => {});
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Feature 5: Executive Pulse — fetch on mount and refresh every 5 minutes
  useEffect(() => {
    fetchPulse();
    const interval = setInterval(() => fetchPulse(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Autonomous kill switch
  useEffect(() => {
    getAutonomousConfig()
      .then((d) => setAutoEnabled(d.enabled))
      .catch(() => {});
  }, []);

  async function handleAutoToggle() {
    setAutoToggling(true);
    try {
      const next = !autoEnabled;
      await setAutonomousConfig(next);
      setAutoEnabled(next);
    } catch {
      /* revert on failure */
    } finally {
      setAutoToggling(false);
    }
  }

  async function toggleRunItems(run) {
    const id = run.runId;
    if (expandedRun === id) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(id);
    if (!runItems[id]) {
      const items = await getRpaRunItems(id);
      setRunItems((prev) => ({ ...prev, [id]: items }));
    }
  }

  const typeData = useMemo(() => toChartRows(analytics?.byType, 'type'), [analytics]);
  const statusData = useMemo(() => toChartRows(analytics?.byStatus, 'status'), [analytics]);
  const trendData = analytics?.recentTrend || [];
  const locationData = useMemo(() => toChartRows(analytics?.byLocation, 'location'), [analytics]);
  const confidenceByType = useMemo(
    () => toChartRows(modelHealth?.avgConfidenceByType, 'type', 'confidence'),
    [modelHealth],
  );
  const classDistribution = useMemo(
    () => toChartRows(modelHealth?.classDistribution, 'type'),
    [modelHealth],
  );

  return (
    <Layout
      title="Management Reports"
      topbarExtras={
        modelHealth ? (
          <span className="hidden text-xs text-[var(--text-3)] sm:block">
            Model {modelHealth.modelLoaded ? 'loaded' : 'unavailable'}
          </span>
        ) : null
      }
    >
      <div className="relative z-10 flex gap-5">
        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-6">

        {error && (
          <div className="rounded-[6px] border-l-[3px] border-[var(--accent-red)] bg-[rgb(239,68,68,0.1)] px-4 py-3 text-sm text-[var(--text-1)]">
            {error}
          </div>
        )}

        {/* ── Pull Incidents ── */}
        <div className="flex justify-end">
          <PullIncidentsButton />
        </div>

        {/* ── Tab Navigation ── */}
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-1">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {[
              { key: 'overview',   label: 'Overview',      desc: 'KPIs · Map · Pulse',      Icon: LayoutDashboard, accent: '#FFCC00' },
              { key: 'model',      label: 'Model',         desc: 'AI · Health · Feedback',   Icon: Brain,           accent: '#3B82F6' },
              { key: 'automation', label: 'Automation',    desc: 'RPA · Run History',        Icon: Cpu,             accent: '#F59E0B' },
              { key: 'cascade',    label: 'Cascade Intel', desc: 'Downstream risk · Alerts', Icon: Network,         accent: '#10B981', badge: cascadeRisk.length },
            ].map(({ key, label, desc, Icon, accent, badge = 0 }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`relative flex items-center gap-2.5 rounded-[7px] px-4 py-3 text-left transition-all duration-150 ${
                    isActive ? 'bg-[var(--surface-1)] shadow-sm' : 'hover:bg-[var(--surface-3)]'
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 h-[52%] w-[3px] -translate-y-1/2 rounded-r-full"
                      style={{ backgroundColor: accent }}
                    />
                  )}
                  <Icon
                    size={15}
                    aria-hidden="true"
                    className="shrink-0 transition-colors duration-150"
                    style={{ color: isActive ? accent : 'var(--text-3)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-medium leading-none transition-colors duration-150 ${isActive ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'}`}>
                      {label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-3)] truncate">{desc}</p>
                  </div>
                  {badge > 0 && (
                    <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-[#FFCC00] px-1 text-[10px] font-bold text-[#030712]">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (loading && !analytics ? (
          <DashboardSkeleton />
        ) : !analytics || !mlStats || !modelHealth ? (
          <EmptyState title="Admin dashboard unavailable" subtitle="Analytics data could not be loaded." />
        ) : (
          <>
            {/* ── KPI Strip ── */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Total Incidents" value={number(analytics.totalIncidents)} status="normal" index={0} />
              <KpiCard label="Auto-Resolved" value={number(analytics.autoResolved || 0)} status="success" index={1} trend="up" />
              <KpiCard label="Pending Review" value={number(analytics.pendingReview || 0)} status={analytics.pendingReview > 5 ? 'warning' : 'normal'} index={2} />
              <KpiCard label="SLA Compliance" value={percent(analytics.slaCompliance || analytics.slaOnTime || 0)} status={Number(analytics.slaCompliance || analytics.slaOnTime || 0) < 90 ? 'critical' : 'success'} index={3} />
              <KpiCard label="Avg Resolution" value={hours(analytics.avgResolutionTime || analytics.avgResolveTime || 0)} hint="per incident" index={4} />
              <KpiCard label="AI Confidence" value={percent(modelHealth?.avgConfidence ? modelHealth.avgConfidence * 100 : analytics.avgConfidence || 0)} status="normal" index={5} />
            </div>

            {/* Kill switch toggle */}
            <div className="nexus-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${autoEnabled ? 'bg-[rgba(34,211,238,0.1)]' : 'bg-[rgba(100,116,139,0.1)]'}`}>
                    <Cpu size={16} className={autoEnabled ? 'text-[var(--nexus-cyan)]' : 'text-[var(--nexus-text-3)]'} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--nexus-text-1)]">Autonomous Actions</p>
                    <p className="text-[11px] text-[var(--nexus-text-3)]">
                      {autoEnabled ? 'AI agents can auto-escalate and act on critical incidents' : 'Autonomous actions paused - manual review only'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAutoToggle}
                  disabled={autoToggling}
                  className="relative h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none"
                  style={{ background: autoEnabled ? 'var(--nexus-cyan)' : 'var(--nexus-surface-3)' }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                    style={{ transform: autoEnabled ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            </div>

            <ThreeLoopsCard />
            {/* ── Feature 5: Intelligence Map Hero ── */}
            <section className="nexus-card nexus-card-glow p-5">
              <div className="nexus-section-header">
                <span className="nexus-section-indicator" />
                <span className="nexus-section-title">Intelligence Map</span>
                <span className="nexus-section-subtitle">— Ask NEXUS about live operations</span>
              </div>
              <MalaysiaMapLeaflet
                byLocation={analytics?.byLocation}
                byType={analytics?.byType}
                clusters={clusters}
                cascadeRisk={cascadeRisk}
              />
            </section>

            {/* ── Executive Pulse ── */}
            <section className="nexus-card nexus-card-glow p-5">
              <div className="nexus-section-header">
                <span className="nexus-section-indicator" />
                <span className="nexus-section-title">Executive Pulse</span>
                <button
                  type="button"
                  onClick={() => fetchPulse(true)}
                  disabled={pulseRefreshing || pulseLoading}
                  className="ml-auto nexus-btn nexus-btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                >
                  {pulseRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {pulseLoading ? (
                <p className="text-xs text-[var(--text-3)]">Generating briefing…</p>
              ) : pulse ? (
                <>
                  {/* Needs Action Now */}
                  {pulse.needsActionNow?.length > 0 ? (
                    <div className="mb-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">Needs Action Now</p>
                      <div className="space-y-1.5">
                        {pulse.needsActionNow.map((item) => (
                          <a
                            key={item.incidentId}
                            href={`/incidents/${item.incidentId}`}
                            className="flex items-center gap-2 rounded-[4px] border border-[var(--nexus-border)] bg-[var(--nexus-surface-3)] px-3 py-1.5 text-xs hover:border-[#FFCC00] hover:bg-[rgba(34,211,238,0.05)]"
                          >
                            <span className="font-mono-ui text-[10px] text-[#FFCC00]">
                              INC-{item.incidentId.slice(-6).toUpperCase()}
                            </span>
                            <span className="text-[var(--text-2)]">{item.type?.replace(/_/g, ' ')}</span>
                            <span className="text-[var(--text-3)]">{item.location}</span>
                            <span
                              className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
                                item.severity === 'Critical' ? 'bg-red-600'
                                : item.severity === 'High' ? 'bg-orange-500'
                                : item.severity === 'Medium' ? 'bg-blue-500'
                                : 'bg-gray-500'
                              }`}
                            >
                              {item.severity}
                            </span>
                            <span className={`text-[10px] ${item.hoursUntilBreach < 0 ? 'text-red-500 font-semibold' : item.hoursUntilBreach < 2 ? 'text-orange-400' : 'text-[var(--text-3)]'}`}>
                              {item.hoursUntilBreach < 0
                                ? `${Math.abs(item.hoursUntilBreach).toFixed(1)}h overdue`
                                : `${item.hoursUntilBreach.toFixed(1)}h`}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mb-4 text-xs text-[#10b981]">✓ No critical items — shift is clear</p>
                  )}

                  {/* Summary bar */}
                  <div className="flex flex-wrap gap-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-2)]">
                    <span><span className="font-semibold text-[var(--text-1)]">{pulse.overnight?.newIncidents ?? '—'}</span> new</span>
                    <span><span className="font-semibold text-[var(--text-1)]">{pulse.overnight?.resolvedIncidents ?? '—'}</span> resolved</span>
                    <span><span className="font-semibold text-[var(--text-1)]">{pulse.activeClusters?.length ?? '—'}</span> clusters</span>
                    <span>
                      <span className={`font-semibold ${
                        (pulse.slaRisk?.nearBreach ?? 0) > 0 ? 'text-orange-400' : 'text-[var(--text-1)]'
                      }`}>{pulse.slaRisk?.nearBreach ?? '—'}</span> near breach
                    </span>
                    <span>
                      <span className={`font-semibold ${
                        (pulse.slaRisk?.breached ?? 0) > 0 ? 'text-red-500' : 'text-[var(--text-1)]'
                      }`}>{pulse.slaRisk?.breached ?? '—'}</span> breached
                    </span>
                  </div>

                  {/* Recommended first action */}
                  {pulse.recommendedFirstAction && (
                    <p className="mt-3 border-l-[3px] border-[#FFCC00] pl-3 text-xs italic text-[var(--text-2)]">
                      <span className="not-italic font-semibold text-[var(--text-3)] uppercase tracking-wide text-[10px] mr-1">Recommended:</span>
                      &ldquo;{pulse.recommendedFirstAction}&rdquo;
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-[var(--text-3)]">Briefing unavailable.</p>
              )}
            </section>

            {/* KPI strip is now at the top of the overview */}

            {analytics && <FinancialRoiCard analytics={analytics} />}

            <section className="grid gap-6 xl:grid-cols-3">
              <div className="nexus-card nexus-card-glow xl:col-span-2 p-5">
                <div className="nexus-section-header">
                  <span className="nexus-section-indicator" />
                  <span className="nexus-section-title">Incident Volume Trend</span>
                </div>
                <div className="h-[320px]">
                  {trendData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData}>
                        <CartesianGrid stroke="var(--nexus-border)" strokeDasharray="3 3" />
                        <XAxis dataKey="date" stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} />
                        <YAxis stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Legend wrapperStyle={{ color: 'var(--nexus-text-2)' }} />
                        <Line type="monotone" dataKey="count" name="Incidents" stroke="#FFCC00" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No trend data" subtitle="New incidents will appear here." />
                  )}
                </div>
              </div>

              <div className="nexus-card nexus-card-glow p-5">
                <div className="nexus-section-header">
                  <span className="nexus-section-indicator" />
                  <span className="nexus-section-title">Status Mix</span>
                </div>
                <div className="h-[320px]">
                  {statusData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData} dataKey="count" nameKey="status" innerRadius={55} outerRadius={96}>
                          {statusData.map((entry, index) => (
                            <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipBox />} />
                        <Legend wrapperStyle={{ color: 'var(--nexus-text-2)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No status data" subtitle="Incident status counts will appear here." />
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="nexus-card nexus-card-glow p-5">
                <div className="nexus-section-header">
                  <span className="nexus-section-indicator" />
                  <span className="nexus-section-title">Incidents by Type</span>
                </div>
                <div className="h-[320px]">
                  {typeData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={typeData}>
                        <CartesianGrid stroke="var(--nexus-border)" strokeDasharray="3 3" />
                        <XAxis dataKey="type" stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 11 }} />
                        <YAxis stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="count" name="Incidents" fill="#FFCC00" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No type data" subtitle="Incident type counts will appear here." />
                  )}
                </div>
              </div>

              <div className="nexus-card nexus-card-glow p-5">
                <div className="nexus-section-header">
                  <span className="nexus-section-indicator" />
                  <span className="nexus-section-title">Incident Hotspots — by Location</span>
                </div>
                <div className="h-[240px]">
                  {locationData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={locationData} layout="vertical">
                        <CartesianGrid stroke="var(--nexus-border)" strokeDasharray="3 3" />
                        <XAxis type="number" stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} />
                        <YAxis dataKey="location" type="category" width={130} stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="count" name="Incidents" fill="#f59e0b" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No location data" subtitle="Location counts will appear here." />
                  )}
                </div>
              </div>
            </section>
          </>
        ))}

        {/* ── Model Intelligence Tab ── */}
        {activeTab === 'model' && (loading && !analytics ? (
          <DashboardSkeleton />
        ) : !analytics || !mlStats || !modelHealth ? (
          <EmptyState title="Admin dashboard unavailable" subtitle="Analytics data could not be loaded." />
        ) : (
          <>
            {/* ── Learning Loop: Override Rate Trend ── */}
            {learningMetrics && (
              <section className="nexus-card nexus-card-glow p-5">
                <div className="nexus-section-header">
                  <span className="nexus-section-indicator" />
                  <span className="nexus-section-title">AI Override Rate — Learning Loop</span>
                  <span className="nexus-section-subtitle ml-2">— Lower = NEXUS improving</span>
                </div>
                <p className="mb-4 text-xs text-[var(--text-3)]">
                  Current override rate: <span className="font-semibold text-[var(--text-1)]">{learningMetrics.currentOverrideRate}%</span> across {learningMetrics.totalReviewed} reviewed decisions.
                  {learningMetrics.currentOverrideRate < 15 && (
                    <span className="ml-2 text-[#10b981]">✓ AI accuracy is strong</span>
                  )}
                </p>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={learningMetrics.weeklyTrend}>
                      <CartesianGrid stroke="var(--nexus-border)" strokeDasharray="3 3" />
                      <XAxis dataKey="week" stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} />
                      <YAxis stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} tickFormatter={(v) => `${v}%`} domain={[0, 60]} />
                      <Tooltip content={<TooltipBox />} />
                      <Line type="monotone" dataKey="overrideRate" name="Override Rate %" stroke="#FFCC00" strokeWidth={2.5} dot={{ r: 4, fill: '#FFCC00' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* ── Confidence Calibration: Does AI know what it knows? ── */}
            {learningMetrics?.calibration?.some(b => b.count > 0) && (
              <section className="nexus-card nexus-card-glow p-5">
                <div className="nexus-section-header">
                  <span className="nexus-section-indicator" />
                  <span className="nexus-section-title">Confidence Calibration</span>
                  <span className="nexus-section-subtitle ml-2">— Does the AI know when it's uncertain?</span>
                </div>
                <p className="mb-4 text-xs text-[var(--text-3)]">
                  A well-calibrated model's accuracy should rise with its confidence. Bars show actual accuracy per confidence bucket.
                </p>
                <div className="grid gap-3 sm:grid-cols-4 mb-4">
                  {learningMetrics.calibration.map((b) => (
                    <div key={b.bucket} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-3 text-center">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">{b.bucket} conf</p>
                      <p className="mt-1 text-xl font-bold text-[var(--text-1)]">
                        {b.accuracy !== null ? `${b.accuracy}%` : '--'}
                      </p>
                      <p className="text-[10px] text-[var(--text-3)]">
                        {b.count} decision{b.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={learningMetrics.calibration.filter(b => b.count > 0)} barSize={40}>
                      <CartesianGrid stroke="var(--nexus-border)" strokeDasharray="3 3" />
                      <XAxis dataKey="bucket" stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} />
                      <YAxis stroke="var(--nexus-text-3)" tick={{ fill: 'var(--nexus-text-3)', fontSize: 12 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                      <Tooltip content={<TooltipBox />} />
                      <Bar dataKey="accuracy" name="Actual Accuracy %" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avgConfidence" name="Avg Confidence %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            <section className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Model Intelligence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Classified</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {number(mlStats.totalClassified)}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Avg Confidence</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {percent((mlStats.avgConfidence || 0) * 100)}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">ML Fallback</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {percent(mlStats.mlFallbackRate)}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Raw Confidence</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {percent((mlStats.avgRawConfidence || 0) * 100)}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Calibration Delta</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {percent((mlStats.avgCalibrationDelta || 0) * 100)}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4 sm:col-span-3">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">High Uncertainty</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {number(analytics.highUncertaintyCount)}
                      </p>
                    </div>
                  </div>

                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mlStats.confidenceDistribution || []}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="bucket" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
                        <YAxis stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="count" name="Incidents" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Top Mismatches</p>
                    <div className="mt-3 space-y-2 text-sm text-[var(--text-2)]">
                      {(mlStats.topMismatches || []).length ? (
                        mlStats.topMismatches.map((item) => (
                          <div key={item.type} className="flex items-center justify-between">
                            <span>{item.type.replace(/_/g, ' ')}</span>
                            <span className="font-mono-ui text-[var(--text-1)]">{item.count}</span>
                          </div>
                        ))
                      ) : (
                        <p>No classifier mismatches recorded.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={toChartRows(analytics.uncertaintySummary?.distribution, 'level')}
                        >
                          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                          <XAxis dataKey="level" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
                          <YAxis stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                          <Tooltip content={<TooltipBox />} />
                          <Bar dataKey="count" name="Incidents" fill="#F59E0B" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Top Uncertainty Reasons</p>
                      <div className="mt-3 space-y-2 text-sm text-[var(--text-2)]">
                        {(analytics.uncertaintySummary?.topReasons || []).length ? (
                          analytics.uncertaintySummary.topReasons.map((item) => (
                            <div key={item.reason} className="flex items-center justify-between gap-3">
                              <span>{item.reason}</span>
                              <span className="font-mono-ui text-[var(--text-1)]">{item.count}</span>
                            </div>
                          ))
                        ) : (
                          <p>No uncertainty reasons recorded.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Model Health</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Loaded</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {modelHealth.modelLoaded ? 'Yes' : 'No'}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Training Rows</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {number(modelHealth.trainingDataSize)}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Last Trained</p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-1)]">
                        {modelHealth.lastTrainedAt ? new Date(modelHealth.lastTrainedAt).toLocaleString('en-GB') : 'Unknown'}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Accuracy</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {percent((modelHealth.accuracy || 0) * 100)}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Calibrated ECE</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {percent((modelHealth.calibration?.calibratedEce || 0) * 100)}
                      </p>
                    </div>
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Engineered Features</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--text-1)]">
                        {number(modelHealth.featureEngineering?.engineeredFeatureCount)}
                      </p>
                    </div>
                  </div>

                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={confidenceByType}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="type" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
                        <YAxis domain={[0, 1]} stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="confidence" name="Avg confidence" fill="#10B981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classDistribution}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="type" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 11 }} />
                        <YAxis stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="count" name="Training rows" fill="#8B5CF6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                        Calibration
                      </p>
                      <div className="mt-3 space-y-2 text-sm text-[var(--text-2)]">
                        <div className="flex items-center justify-between gap-3">
                          <span>Status</span>
                          {modelHealth.calibration?.calibrated ? (
                            <span className="inline-flex items-center gap-1 rounded-[2px] border border-[rgb(16,185,129,0.35)] bg-[rgb(16,185,129,0.12)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--accent-green)]">
                              ✓ Calibrated
                            </span>
                          ) : (
                            <span className="font-mono-ui text-[var(--text-1)]">uncalibrated</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Method</span>
                          <span className="font-mono-ui text-[var(--text-1)]">
                            {modelHealth.calibration?.method || 'n/a'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Raw ECE</span>
                          <span className="font-mono-ui text-[var(--text-1)]">
                            {Number(modelHealth.calibration?.rawEce || 0).toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Calibrated ECE</span>
                          <span className="font-mono-ui text-[var(--text-1)]">
                            {Number(modelHealth.calibration?.calibratedEce || 0).toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span title="Expected Calibration Error per class. 0 = perfect, 0.1 = poor">
                            Mean ECE (per-class) ⓘ
                          </span>
                          <span className="font-mono-ui text-[var(--text-1)]">
                            {modelHealth.calibration?.meanEcePerClass != null
                              ? Number(modelHealth.calibration.meanEcePerClass).toFixed(4)
                              : 'n/a'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Raw Brier</span>
                          <span className="font-mono-ui text-[var(--text-1)]">
                            {Number(modelHealth.calibration?.rawBrier || 0).toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Calibrated Brier</span>
                          <span className="font-mono-ui text-[var(--text-1)]">
                            {Number(modelHealth.calibration?.calibratedBrier || 0).toFixed(4)}
                          </span>
                        </div>
                      </div>

                      {modelHealth.calibration?.ecePerClass &&
                        Object.keys(modelHealth.calibration.ecePerClass).length > 0 && (
                          <div className="mt-4">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                              Per-class ECE{' '}
                              <span className="normal-case text-[var(--text-3)]">(lower is better)</span>
                            </p>
                            <div className="mt-3 h-[160px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={Object.entries(modelHealth.calibration.ecePerClass).map(
                                    ([cls, ece]) => ({
                                      type: cls.replace(/_/g, ' '),
                                      ece: Number(ece),
                                    }),
                                  )}
                                  margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
                                >
                                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                                  <XAxis
                                    dataKey="type"
                                    stroke="var(--text-2)"
                                    tick={{ fill: 'var(--text-2)', fontSize: 9 }}
                                  />
                                  <YAxis
                                    stroke="var(--text-2)"
                                    tick={{ fill: 'var(--text-2)', fontSize: 11 }}
                                    domain={[0, 'dataMax + 0.01']}
                                  />
                                  <Tooltip content={<TooltipBox />} />
                                  <Bar dataKey="ece" name="ECE" fill="#3B82F6" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                    </div>

                    <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                        Top Engineered Signals
                      </p>
                      <div className="mt-3 space-y-2 text-sm text-[var(--text-2)]">
                        {(modelHealth.featureEngineering?.topEngineeredSignals || []).length ? (
                          modelHealth.featureEngineering.topEngineeredSignals.slice(0, 6).map((item) => (
                            <div key={item.feature} className="flex items-center justify-between gap-3">
                              <span>{item.feature.replace(/^eng__/, '').replace(/_/g, ' ')}</span>
                              <span className="font-mono-ui text-[var(--text-1)]">{item.importance}</span>
                            </div>
                          ))
                        ) : (
                          <p>No engineered feature importances recorded.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                        Global Decision Signals
                      </p>
                      <span className="text-xs text-[var(--text-3)]">
                        {modelHealth.explainability?.mode || 'n/a'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      {(modelHealth.featureEngineering?.topSignals || []).length ? (
                        modelHealth.featureEngineering.topSignals.slice(0, 10).map((item) => (
                          <div
                            key={item.feature}
                            className="flex items-center justify-between gap-3 rounded-[4px] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-2)]"
                          >
                            <span>{item.feature.replace(/^eng__/, '').replace(/_/g, ' ')}</span>
                            <span className="font-mono-ui text-[var(--text-1)]">{item.importance}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--text-2)]">No global feature signals recorded.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* W3: Feedback Loop panel */}
            {feedbackMetrics && (
              <section aria-label="Feedback loop">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base text-[var(--text-1)]">🔁 Feedback Loop</CardTitle>
                    <p className="text-xs text-[var(--text-3)] mt-1">
                      HITL review decisions captured as training signal.
                      Export via Admin › Export Dataset to retrain the model.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 4 KPI tiles */}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Total Reviewed</p>
                        <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">{number(feedbackMetrics.totalReviewed)}</p>
                        <p className="mt-1 text-xs text-[var(--text-3)]">
                          {number(feedbackMetrics.approvalCount)} approved ·{' '}
                          {number(feedbackMetrics.rejectionCount)} rejected
                        </p>
                      </div>
                      <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Override Rate</p>
                        <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">
                          {percent(feedbackMetrics.overrideRate)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-3)]">AI classification corrected by reviewer</p>
                      </div>
                      <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Training Samples</p>
                        <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">
                          {number(feedbackMetrics.trainingSampleCount)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-3)]">Approved decisions available for retraining</p>
                      </div>
                      <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Top Corrected Field</p>
                        <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">
                          {feedbackMetrics.topCorrectedFields?.[0]?.field || 'none'}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-3)]">
                          {feedbackMetrics.topCorrectedFields?.[0]
                            ? `${feedbackMetrics.topCorrectedFields[0].count}× corrected`
                            : 'No overrides recorded'}
                        </p>
                      </div>
                    </div>

                    {/* 7-day HITL trend */}
                    {feedbackMetrics.hitlTrend?.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)] mb-3">
                          7-Day Review Activity
                        </p>
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={feedbackMetrics.hitlTrend} barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10, fill: 'var(--text-3)' }}
                              tickFormatter={(d) => d.slice(5)}
                            />
                            <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} width={24} />
                            <Tooltip content={<TooltipBox />} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="reviews" name="Reviews" fill="#3B82F6" radius={[2,2,0,0]} />
                            <Bar dataKey="hitl" name="HITL Fired" fill="#FF8C00" radius={[2,2,0,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Corrected fields list */}
                    {feedbackMetrics.topCorrectedFields?.length > 0 && (
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)] mb-2">
                          Corrected Fields
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {feedbackMetrics.topCorrectedFields.map(({ field, count }) => (
                            <span
                              key={field}
                              className="rounded-full bg-[var(--surface-3)] px-3 py-1 text-xs text-[var(--text-2)] border border-[var(--border)]"
                            >
                              {field} <span className="font-semibold text-[var(--text-1)]">{count}×</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </section>
            )}
          </>
        ))}

        {/* ── Automation Tab ── */}
        {activeTab === 'automation' && (
          <>
            {/* RPA Ops Panel — CREATIVE-1 narrative + per-item lineage */}
            <section aria-label="RPA activity">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-[var(--text-1)]">🤖 RPA Automation Activity</CardTitle>
                  <p className="text-xs text-[var(--text-3)] mt-1">
                    Last {rpaRuns.length} UiPath batch runs · Narratives, file lineage and cluster signals
                  </p>
                </CardHeader>
                <CardContent>
                  {rpaRuns.length === 0 ? (
                    <p className="text-sm text-[var(--text-3)]">No RPA run records found. Start the UiPath bot to see activity here.</p>
                  ) : (
                    <div className="space-y-3">
                      {rpaRuns.slice(0, 10).map((run) => {
                        const isOpen = expandedRun === run.runId;
                        const items  = runItems[run.runId] || [];
                        const statusColor = run.status === 'completed' ? '#059669'
                          : run.status === 'partial' ? '#D97706'
                          : '#DC2626';
                        const runDate = new Date(run.completedAt || run.createdAt);
                        const processed = run.processedCount ?? run.processed ?? 0;
                        const dupes     = run.duplicates  ?? run.skipped    ?? 0;
                        const failed    = run.failed      ?? 0;

                        return (
                          <div key={run.runId}
                            className="rounded-[8px] border border-[var(--border)] overflow-hidden"
                          >
                            {/* Run header row */}
                            <button
                              type="button"
                              onClick={() => toggleRunItems(run)}
                              className="w-full flex items-start justify-between gap-4 text-left px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
                                    style={{ background: statusColor }}
                                  >
                                    {run.status}
                                  </span>
                                  <span className="font-mono-ui text-xs text-[var(--text-3)]">{run.runId}</span>
                                  <span className="text-xs text-[var(--text-3)]">
                                    {runDate.toLocaleString('en-MY', { hour12: false })}
                                  </span>
                                </div>
                                <div className="mt-1 flex gap-4 text-xs text-[var(--text-3)]">
                                  <span>✅ {processed} processed</span>
                                  <span>⊘ {dupes} skipped</span>
                                  {failed > 0 && <span className="text-red-500 font-semibold">⚠ {failed} failed</span>}
                                </div>
                                {run.narrative && (
                                  <blockquote className="mt-2 border-l-2 border-[var(--nexus-cyan,#FFCC00)] pl-3 text-xs italic text-[var(--text-2)] leading-relaxed">
                                    {run.narrative}
                                  </blockquote>
                                )}
                              </div>
                              <span className="text-[var(--text-3)] text-sm flex-shrink-0 mt-0.5">
                                {isOpen ? '▲' : '▼'}
                              </span>
                            </button>

                            {/* Per-item lineage drawer */}
                            {isOpen && (
                              <div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                                {items.length === 0 ? (
                                  <p className="text-xs text-[var(--text-3)]">Loading lineage…</p>
                                ) : (
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="text-[var(--text-3)] uppercase tracking-wider text-[10px] border-b border-[var(--border)]">
                                        <th className="text-left py-1.5 pr-3">File</th>
                                        <th className="text-left py-1.5 pr-3">Outcome</th>
                                        <th className="text-left py-1.5 pr-3">Incident</th>
                                        <th className="text-left py-1.5 pr-3">Severity</th>
                                        <th className="text-left py-1.5">Location</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map((item) => {
                                        const outcomeColors = {
                                          created:        { bg: '#059669', label: 'CREATED' },
                                          duplicate:      { bg: '#6b7280', label: 'DUPE' },
                                          reply_threaded: { bg: '#3B82F6', label: 'REPLY' },
                                          spam:           { bg: '#374151', label: 'SPAM' },
                                          failed:         { bg: '#DC2626', label: 'FAILED' },
                                          enquiry:        { bg: '#D97706', label: 'ENQUIRY' },
                                        };
                                        const badge = outcomeColors[item.outcome] || { bg: '#6b7280', label: item.outcome };
                                        return (
                                          <tr key={item._id} className="border-b border-[var(--border)] last:border-0">
                                            <td className="py-1.5 pr-3 font-mono-ui text-[var(--text-2)] max-w-[160px] truncate" title={item.filename}>
                                              {item.filename}
                                            </td>
                                            <td className="py-1.5 pr-3">
                                              <span
                                                className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                                                style={{ background: badge.bg }}
                                              >
                                                {badge.label}
                                              </span>
                                              {item.errorMessage && (
                                                <span className="ml-1 text-red-400 text-[10px]" title={item.errorMessage}>⚠</span>
                                              )}
                                            </td>
                                            <td className="py-1.5 pr-3 font-mono-ui text-[var(--text-3)]">
                                              {item.incidentId ? (
                                                <a href={`/incidents/${item.incidentId}`} className="text-[var(--nexus-cyan,#FFCC00)] hover:underline">
                                                  {item.incidentId.slice(-8)}
                                                </a>
                                              ) : '—'}
                                            </td>
                                            <td className="py-1.5 pr-3 text-[var(--text-2)]">{item.severity || '—'}</td>
                                            <td className="py-1.5 text-[var(--text-2)] max-w-[120px] truncate" title={item.location}>
                                              {item.location || '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )}

        {/* ── Cascade Intelligence Tab ── */}
        {activeTab === 'cascade' && (
          <div className="space-y-6">
            {/* Explainer */}
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgb(16,185,129,0.1)]">
                  <Network size={18} className="text-[#10B981]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-1)]">What is Cascade Intelligence?</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-2)]">
                    When incidents cluster at one hub, downstream hubs in DHL Malaysia's logistics network are at risk of
                    experiencing the same problem hours later. NEXUS maps the hub topology, calculates propagation risk in
                    real time, and lets you alert hub managers <em>before</em> the cascade arrives.
                  </p>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                  <AlertTriangle size={12} /> Active Risks
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">{cascadeRisk.length}</p>
              </div>
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                  <Shield size={12} /> Predictions Logged
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--text-1)]">{cascadeStats.totalPredictions}</p>
              </div>
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                  <Bell size={12} /> Alerts Sent
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--accent-amber)]">{cascadeStats.totalAlerts}</p>
              </div>
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                  <CheckCircle2 size={12} /> Resolved
                </div>
                <p className="mt-2 text-2xl font-bold text-[var(--accent-green)]">{cascadeStats.resolvedAlerts}</p>
              </div>
            </div>

            {/* Hub Network Topology */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-[var(--text-1)]">Hub Network Topology</CardTitle>
                <p className="text-xs text-[var(--text-3)] mt-1">
                  Live view of Malaysia's 5-hub logistics network. Red nodes = source clusters. Amber nodes = at-risk downstream hubs. Animated edges show active cascade propagation paths.
                </p>
              </CardHeader>
              <CardContent>
                <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-3">
                  <HubNetworkGraph cascadeRisk={cascadeRisk} />
                </div>
                {cascadeRisk.length === 0 && (
                  <p className="mt-3 text-center text-xs text-[var(--text-3)]">
                    No active cascade risk — all hub connections idle.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Active Cascade Predictions */}
            {cascadeRisk.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-[var(--text-1)]">Active Cascade Predictions</CardTitle>
                  <p className="text-xs text-[var(--text-3)] mt-1">
                    {cascadeRisk.length} active prediction{cascadeRisk.length !== 1 ? 's' : ''} — click "Alert Hub Manager" to write a JSON alert file for the UiPath bot.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {cascadeRisk.map((prediction) => (
                    <div key={prediction.clusterId} className="overflow-hidden rounded-[8px] border border-[var(--border)]">
                      {/* Prediction header */}
                      <div className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--surface-3)] px-5 py-4">
                        <RiskGauge score={prediction.overallCascadeScore} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-[var(--text-1)]">{prediction.sourceHub}</p>
                            <ArrowRight size={12} className="text-[var(--text-3)]" />
                            <span className="text-xs text-[var(--text-2)]">
                              {(prediction.downstream || []).length} downstream hub{(prediction.downstream || []).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                            {prediction.incidentType?.replace(/_/g, ' ')} · {prediction.clusterCount} incidents in cluster
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={alertingHub === prediction.sourceHub}
                          onClick={async () => {
                            const hub = prediction.sourceHub;
                            setAlertingHub(hub);
                            try {
                              await triggerCascadeAlert(hub);
                              setAlertedHubs((prev) => new Set([...prev, hub]));
                              setTimeout(() => {
                                setAlertedHubs((prev) => { const n = new Set(prev); n.delete(hub); return n; });
                              }, 3500);
                            } catch {
                              /* non-fatal */
                            } finally {
                              setAlertingHub(null);
                            }
                          }}
                          className={`flex shrink-0 items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-[12px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                            alertedHubs.has(prediction.sourceHub)
                              ? 'border-[var(--accent-green)] bg-[rgb(16,185,129,0.1)] text-[var(--accent-green)]'
                              : 'border-[var(--accent-amber)] bg-[rgb(245,158,11,0.08)] text-[var(--accent-amber)] hover:opacity-80'
                          }`}
                        >
                          {alertedHubs.has(prediction.sourceHub)
                            ? <><CheckCircle2 size={12} /> Alert sent ✓</>
                            : alertingHub === prediction.sourceHub
                              ? <><Bell size={12} /> Sending…</>
                              : <><Bell size={12} /> Alert Hub Manager</>
                          }
                        </button>
                      </div>

                      {/* Recommendation */}
                      <div className="border-b border-[var(--border)] bg-[rgb(245,158,11,0.04)] px-5 py-2.5">
                        <p className="text-xs text-[var(--text-2)]">
                          <span className="font-semibold text-[var(--accent-amber)]">Recommended: </span>
                          {prediction.recommendation}
                        </p>
                      </div>

                      {/* Downstream risk table */}
                      <div className="px-5 py-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                              <th className="pb-2 text-left font-medium">Downstream Hub</th>
                              <th className="pb-2 text-left font-medium">Risk</th>
                              <th className="pb-2 text-right font-medium">Delay</th>
                              <th className="pb-2 text-right font-medium">Est. Impact</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {(prediction.downstream || []).map((edge) => {
                              const riskColor = edge.riskLevel === 'high' ? 'text-[var(--accent-red)]' : edge.riskLevel === 'medium' ? 'text-[var(--accent-amber)]' : 'text-[var(--text-3)]';
                              const riskBg = edge.riskLevel === 'high' ? 'bg-[rgb(239,68,68,0.1)]' : edge.riskLevel === 'medium' ? 'bg-[rgb(245,158,11,0.1)]' : 'bg-[var(--surface-3)]';
                              const impactTime = edge.estimatedImpactTime
                                ? new Date(edge.estimatedImpactTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }) + ' MYT'
                                : '—';
                              return (
                                <tr key={edge.hub}>
                                  <td className="py-2.5 font-medium text-[var(--text-1)]">{edge.hub}</td>
                                  <td className="py-2.5">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${riskColor} ${riskBg}`}>
                                      {Math.round(edge.baseRisk * 100)}% {edge.riskLevel}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-right text-xs text-[var(--text-2)]">+{edge.delayHours}h</td>
                                  <td className="py-2.5 text-right font-mono-ui text-xs text-[var(--text-2)]">{impactTime}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Alert & Prediction History */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-[var(--text-3)]" />
                  <CardTitle className="text-base text-[var(--text-1)]">Cascade Event Log</CardTitle>
                </div>
                <p className="text-xs text-[var(--text-3)] mt-1">
                  Recent cascade predictions and alerts triggered by administrators.
                </p>
              </CardHeader>
              <CardContent>
                {cascadeHistory.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[var(--text-3)]">No cascade events recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {cascadeHistory.slice(0, 15).map((event, idx) => {
                      const isAlert = event.eventType === 'alert';
                      return (
                        <div key={event._id || idx} className="flex items-start gap-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                          <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isAlert ? 'bg-[rgb(245,158,11,0.12)]' : 'bg-[rgb(59,130,246,0.12)]'}`}>
                            {isAlert ? <Bell size={12} className="text-[var(--accent-amber)]" /> : <Shield size={12} className="text-[#3B82F6]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isAlert ? 'bg-[rgb(245,158,11,0.1)] text-[var(--accent-amber)]' : 'bg-[rgb(59,130,246,0.1)] text-[#3B82F6]'}`}>
                                {event.eventType}
                              </span>
                              <span className="text-xs font-medium text-[var(--text-1)]">{event.sourceHub}</span>
                              <span className="text-[11px] text-[var(--text-3)]">{event.incidentType?.replace(/_/g, ' ')}</span>
                              {event.resolved && (
                                <span className="flex items-center gap-0.5 text-[10px] text-[var(--accent-green)]">
                                  <CheckCircle2 size={10} /> resolved
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-[var(--text-3)]">
                              {event.downstream?.length || 0} downstream · risk {Math.round((event.overallCascadeScore || 0) * 100)}%
                              {isAlert && event.triggeredBy && <> · by {event.triggeredBy}</>}
                              {isAlert && event.alertId && <> · <span className="font-mono-ui">{event.alertId}</span></>}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] text-[var(--text-3)]">{relativeTime(event.createdAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How it works */}
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">How Cascade Detection Works</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                {[
                  { step: '1', title: 'Cluster Detected', desc: '3+ incidents of same type at one hub within 4 hours triggers cluster detection.' },
                  { step: '2', title: 'Risk Propagation', desc: 'Hub adjacency graph maps downstream nodes with distance-based risk multipliers.' },
                  { step: '3', title: 'Alert Trigger', desc: 'Admin clicks "Alert Hub Manager" → JSON file written for UiPath bot pickup.' },
                  { step: '4', title: 'Proactive Action', desc: 'UiPath bot emails downstream hub managers before cascade arrives.' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgb(16,185,129,0.1)] text-[11px] font-bold text-[#10B981]">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-1)]">{item.title}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-3)]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Live Intel Feed - right panel */}
        <div className="hidden w-[300px] flex-shrink-0 xl:block">
          <div
            className="sticky top-0 overflow-hidden rounded-xl border border-[var(--nexus-border)]"
            style={{
              height: 'calc(100vh - 120px)',
              background: 'var(--nexus-panel-bg)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <LiveIntelFeed />
          </div>
        </div>
      </div>
    </Layout>
  );
}
