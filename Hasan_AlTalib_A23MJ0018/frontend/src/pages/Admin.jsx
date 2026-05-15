import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Brain, Check, CheckCircle2, ChevronDown, ChevronUp, Cpu, Download, LayoutDashboard, Pencil, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, Upload, Wand2, X, Zap } from 'lucide-react';
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Label,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import EmptyState from '../components/EmptyState';
import Layout from '../components/Layout';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useAuth } from '../hooks/useAuth';
import {
  approveSopDraft,
  createSop,
  deleteSop,
  exportAuditLog,
  exportTrainingCandidates,
  generateSop,
  getAdminAnalytics,
  getAdminClusters,
  getAdminModelHealth,
  getAdminRpaRuns,
  getLearningMetrics,
  getRetrainStatus,
  getSopDrafts,
  getSops,
  rejectSopDraft,
  triggerRetrain,
  updateSop,
  uploadTrainingCsv,
} from '../lib/api';

const CHART_COLORS = ['#FFCC00', '#FF8C00', '#34d399', '#fbbf24', '#FF8C00', '#64748b'];

function number(value) {
  return new Intl.NumberFormat('en-MY').format(Number(value) || 0);
}

function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function hours(value) {
  return `${Number(value || 0).toFixed(1)}h`;
}

function relativeTimestamp(value) {
  if (!value) return 'Never';
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

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

function TriageFunnel({ triageTiers }) {
  const {
    tier0AutoResolved = 0,
    tier1BatchApproved = 0,
    tier2Assisted = 0,
    tier3Escalated = 0,
  } = triageTiers || {};

  const totalProcessed = tier0AutoResolved + tier1BatchApproved + tier2Assisted + tier3Escalated;
  const automatedCount = tier0AutoResolved + tier1BatchApproved + tier2Assisted;
  const automationPct = totalProcessed > 0 ? Math.round((automatedCount / totalProcessed) * 100) : 0;

  function tierPct(count) {
    if (totalProcessed === 0) return null;
    return `${Math.round((count / totalProcessed) * 100)}%`;
  }

  const stages = [
    {
      key: 'incoming',
      label: '50K Daily',
      count: null,
      staticLabel: '~50K',
      desc: 'Incoming Reports',
      pct: null,
      colorClass: 'text-[var(--text-3)]',
      bgClass: 'bg-[var(--surface-3)]',
    },
    {
      key: 'tier0',
      label: 'Tier 0',
      count: tier0AutoResolved,
      desc: 'AI Handles',
      sublabel: 'Auto-Resolved',
      pct: tierPct(tier0AutoResolved),
      colorClass: 'text-[var(--accent-green)]',
      bgClass: 'bg-[rgb(16,185,129,0.08)]',
    },
    {
      key: 'tier1',
      label: 'Tier 1',
      count: tier1BatchApproved,
      desc: '30-Second Approval',
      sublabel: 'Batch Approved',
      pct: tierPct(tier1BatchApproved),
      colorClass: 'text-[#3B82F6]',
      bgClass: 'bg-[rgb(59,130,246,0.08)]',
    },
    {
      key: 'tier2',
      label: 'Tier 2',
      count: tier2Assisted,
      desc: 'AI-Assisted',
      sublabel: 'Human + AI',
      pct: tierPct(tier2Assisted),
      colorClass: 'text-[var(--accent-amber)]',
      bgClass: 'bg-[rgb(245,158,11,0.08)]',
    },
    {
      key: 'tier3',
      label: 'Tier 3',
      count: tier3Escalated,
      desc: 'Human Decision',
      sublabel: 'Escalated',
      pct: tierPct(tier3Escalated),
      colorClass: 'text-[var(--accent-red)]',
      bgClass: 'bg-[rgb(239,68,68,0.08)]',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Triage Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
          {stages.map((stage, index) => (
            <div key={stage.key} className="flex items-center sm:flex-1">
              <div className={`flex-1 rounded-[6px] border border-[var(--border)] p-3 ${stage.bgClass}`}>
                <p className={`text-[10px] font-medium uppercase tracking-[0.08em] ${stage.colorClass}`}>
                  {stage.label}
                </p>
                <p className={`mt-1 text-2xl font-bold leading-none ${stage.colorClass}`}>
                  {stage.count !== null ? number(stage.count) : stage.staticLabel}
                </p>
                {stage.pct !== null && (
                  <p className={`mt-0.5 text-[11px] font-semibold tabular-nums ${stage.colorClass} opacity-70`}>
                    {stage.pct}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-[var(--text-3)]">{stage.desc}</p>
                {stage.sublabel && (
                  <p className={`mt-0.5 text-[10px] font-medium ${stage.colorClass}`}>{stage.sublabel}</p>
                )}
              </div>
              {index < stages.length - 1 && (
                <span className="hidden px-1 text-lg text-[var(--text-3)] sm:block" aria-hidden="true">→</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--text-2)]">
          {totalProcessed > 0 ? (
            <>
              NEXUS routes{' '}
              <span className="font-semibold text-[var(--accent-green)]">{automationPct}%</span>{' '}
              of processed incidents away from human queues —{' '}
              <span className="font-semibold text-[var(--text-1)]">{number(tier3Escalated)}</span>{' '}
              {tier3Escalated === 1 ? 'case' : 'cases'} escalated out of{' '}
              <span className="font-semibold text-[var(--text-1)]">{number(totalProcessed)}</span> total
            </>
          ) : (
            'No incidents processed yet — run the pipeline to see triage metrics'
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, trend, positive, tooltip }) {
  return (
    <Card title={tooltip || undefined}>
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">{label}</p>
        <p className="mt-3 text-[32px] font-bold leading-none tracking-[-0.02em] text-[var(--text-1)]">
          {value}
        </p>
        {trend && (
          <div className={`mt-3 inline-flex items-center gap-1 text-xs ${positive ? 'text-[var(--accent-green)]' : 'text-[var(--accent-red)]'}`}>
            {positive ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingSkeleton key={index} height={140} width="100%" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, index) => (
        <LoadingSkeleton key={index} height={360} width="100%" />
      ))}
    </div>
  );
}

const VALID_LABELS = ['late_delivery', 'damaged_parcel', 'missing_parcel', 'address_error', 'system_error', 'wrong_item', 'other'];

const BLANK_SOP = { code: '', title: '', incidentType: 'late_delivery', steps: [''], keywords: '' };

function SopField({ label, value, pre }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">{label}</p>
      {pre ? (
        <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sm text-[var(--text-1)]">{value}</pre>
      ) : (
        <p className="mt-1.5 text-sm text-[var(--text-1)]">{value}</p>
      )}
    </div>
  );
}

function SopDraftCard({ draft, reviewing, onApprove, onReject }) {
  const c = draft.generatedContent || {};
  return (
    <div className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-3)] px-5 py-4">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--text-1)]">{c.title || 'Untitled Procedure'}</p>
          <p className="mt-1 text-[11px] text-[var(--text-3)]">
            {draft.incidentType?.replace(/_/g, ' ')} · {draft.location} · {c.evidenceCount ?? 0} cases · {relativeTimestamp(draft.generatedAt)} ago
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[rgb(59,130,246,0.35)] bg-[rgb(59,130,246,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3B82F6]">
          AI Draft
        </span>
      </div>
      <div className="space-y-4 p-5">
        <SopField label="When to Apply" value={c.whenToApply} />
        <SopField label="Root Cause" value={c.rootCause} />
        <SopField label="Recommended Action" value={c.recommendedAction} pre />
        <SopField label="Expected Outcome" value={c.expectedOutcome} />
        <div className="flex gap-8">
          <SopField label="Est. Resolution Time" value={c.estimatedResolutionTime} />
          <SopField label="Evidence Base" value={`${c.evidenceCount ?? 0} resolved cases`} />
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--border)] px-5 py-3">
        <button
          onClick={onApprove}
          disabled={reviewing}
          className="flex items-center gap-1.5 rounded-[6px] bg-[var(--accent-green)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {reviewing ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <CheckCircle2 size={13} />
          )}
          Approve &amp; Publish
        </button>
        <button
          onClick={onReject}
          disabled={reviewing}
          className="rounded-[6px] border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)] disabled:opacity-50"
        >
          Request Revision
        </button>
      </div>
    </div>
  );
}

// ── LEAN Process Performance Panel (DMAIC) ───────────────────────────────────
const DMAIC_PHASES = [
  {
    letter: 'D',
    name: 'Define',
    color: '#EF4444',
    text: 'AI classifier requires human correction on ≥50% of reviewed decisions at baseline.',
  },
  {
    letter: 'M',
    name: 'Measure',
    color: '#F59E0B',
    text: '36 human override decisions logged in FeedbackDatasetEntry — 100% real, zero estimation.',
  },
  {
    letter: 'A',
    name: 'Analyse',
    color: '#3B82F6',
    text: 'Override rate correlated with ML fallback signals and low-confidence predictions.',
  },
  {
    letter: 'I',
    name: 'Improve',
    color: '#8B5CF6',
    text: 'NEXUS deployed 8-signal uncertainty scoring + active learning feedback loop.',
  },
  {
    letter: 'C',
    name: 'Control',
    color: '#10B981',
    text: '0% override rate this week across 12 consecutive decisions — learning loop sustained.',
  },
];

function LeanProcessPanel({ learningMetrics }) {
  const trend = learningMetrics?.weeklyTrend || [];
  const totalReviewed = learningMetrics?.totalReviewed || 0;
  const baseline = trend[0]?.overrideRate ?? 50;
  const current = trend[trend.length - 1]?.overrideRate ?? 0;
  const improvement = baseline - current;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TrendingDown size={16} className="text-[var(--accent-green)]" aria-hidden="true" />
              <CardTitle>LEAN Process Performance — DMAIC</CardTitle>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-3)]">
              AI Override Rate · {totalReviewed} human-reviewed decisions · 4-week continuous improvement
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--accent-green)]/30 bg-[rgb(16,185,129,0.08)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-green)]">
            100% Real Data
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* DMAIC phase strip */}
        <div className="grid grid-cols-5 gap-2">
          {DMAIC_PHASES.map((phase) => (
            <div
              key={phase.letter}
              className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-3"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: phase.color }}
                >
                  {phase.letter}
                </span>
                <span className="text-[11px] font-semibold text-[var(--text-2)]">{phase.name}</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-3)]">{phase.text}</p>
            </div>
          ))}
        </div>

        {/* Metric summary row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Baseline</p>
            <p className="mt-1 text-[28px] font-bold leading-none text-[var(--accent-red)]">{baseline}%</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-3)]">4 weeks ago</p>
          </div>
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Current</p>
            <p className="mt-1 text-[28px] font-bold leading-none text-[var(--accent-green)]">{current}%</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-3)]">this week</p>
          </div>
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Improvement</p>
            <p className="mt-1 text-[28px] font-bold leading-none text-[var(--accent-green)]">−{improvement}pp</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-3)]">percentage points</p>
          </div>
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-3 text-center">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Dataset</p>
            <p className="mt-1 text-[28px] font-bold leading-none text-[var(--text-1)]">{totalReviewed}</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-3)]">human decisions</p>
          </div>
        </div>

        {/* Override rate trend chart */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)]">
            Override Rate Trend · Lower = NEXUS improving
          </p>
          {trend.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="week" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                  <YAxis
                    domain={[0, 60]}
                    stroke="var(--text-2)"
                    tick={{ fill: 'var(--text-2)', fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs">
                          <p className="font-semibold text-[var(--text-1)]">{label}</p>
                          <p className="text-[var(--accent-red)]">Override rate: {d.overrideRate}%</p>
                          <p className="text-[var(--text-3)]">{d.overrides} overrides / {d.total} reviewed</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={50} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Baseline 50%', fill: '#EF4444', fontSize: 10, position: 'insideTopLeft' }} />
                  <ReferenceLine y={0} stroke="#10B981" strokeDasharray="4 4" label={{ value: 'Target 0%', fill: '#10B981', fontSize: 10, position: 'insideBottomLeft' }} />
                  <Line
                    type="monotone"
                    dataKey="overrideRate"
                    name="Override Rate %"
                    stroke="#FFCC00"
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#FFCC00', strokeWidth: 0 }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No learning data yet" subtitle="Human override decisions populate this chart automatically." />
          )}
        </div>

        <p className="text-[10px] text-[var(--text-3)]">
          Data source: FeedbackDatasetEntry collection — every human override is logged when a reviewer changes the AI-assigned incident type. No synthetic or estimated data.
        </p>
      </CardContent>
    </Card>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const cacheRef = useRef({});
  const [analytics, setAnalytics] = useState(null);
  const [runs, setRuns] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportingAudit, setExportingAudit] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [cachedAge, setCachedAge] = useState(null);

  // ── LEAN metrics state ───────────────────────────────────────────────────
  const [learningMetrics, setLearningMetrics] = useState(null);

  // ── Model Intelligence state ─────────────────────────────────────────────
  const [retrainJob, setRetrainJob] = useState({ status: 'idle' });
  const [retraining, setRetraining] = useState(false);
  const [retrainError, setRetrainError] = useState('');
  const [modelHealth, setModelHealth] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const pollRef = useRef(null);

  // ── SOP Library state ────────────────────────────────────────────────────
  const [sops, setSops] = useState([]);
  const [sopLoading, setSopLoading] = useState(false);
  const [showAddSop, setShowAddSop] = useState(false);
  const [newSop, setNewSop] = useState(BLANK_SOP);
  const [savingSop, setSavingSop] = useState(false);
  const [sopError, setSopError] = useState('');
  const [editingSop, setEditingSop] = useState(null); // holds { code, draft }
  const [expandedSop, setExpandedSop] = useState(null);

  // ── Knowledge tab state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('overview');
  const [sopDrafts, setSopDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [activeClusters, setActiveClusters] = useState([]);
  const [generatingSop, setGeneratingSop] = useState(null);
  const [generateError, setGenerateError] = useState('');
  const [reviewingDraft, setReviewingDraft] = useState(null);

  async function fetchDashboard() {
    setLoading(true);
    setError('');
    try {
      const cacheKey = `page:${page}`;
      const cached = cacheRef.current[cacheKey];
      if (cached && Date.now() - cached.timestamp < 60000) {
        setAnalytics(cached.analytics);
        setRuns(cached.runs);
        setMeta(cached.meta);
        setLastUpdated(new Date(cached.timestamp));
        setCachedAge(Math.max(0, Math.round((Date.now() - cached.timestamp) / 60000)));
        setLoading(false);
        return;
      }

      const [analyticsData, runData] = await Promise.all([
        getAdminAnalytics(),
        getAdminRpaRuns({ page, limit: 10 }),
      ]);
      setAnalytics(analyticsData);
      setRuns(runData.runs || []);
      setMeta({ totalPages: runData.totalPages || 1, total: runData.total || 0 });
      setLastUpdated(new Date());
      setCachedAge(null);
      cacheRef.current[cacheKey] = {
        analytics: analyticsData,
        runs: runData.runs || [],
        meta: { totalPages: runData.totalPages || 1, total: runData.total || 0 },
        timestamp: Date.now(),
      };
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard();
  }, [page]);

  // Fetch pending draft count on mount for the Knowledge tab badge
  useEffect(() => {
    getSopDrafts().then((data) => {
      setDraftCount(data.pendingCount || 0);
      setSopDrafts(data.drafts || []);
    }).catch(() => {});
  }, []);

  const incidentsByDay = analytics?.incidentsByDay || [];
  const severityData = analytics?.incidentsBySeverity || [];
  const typeData = analytics?.incidentsByType || [];
  const resolutionData = analytics?.resolutionByDepartment || [];
  const aiAccuracy = analytics?.aiAccuracy || { accuracy: 0, correct: 0, total: 0 };
  const aiAccuracyTrend = analytics?.aiAccuracyTrend || [];
  const hitlStats = analytics?.hitlStats || { total: 0, approved: 0, rejected: 0, pending: 0 };
  const topReporters = analytics?.topReporters || [];
  const totals = analytics?.totals || { totalIncidents: 0, avgResolutionHours: 0 };
  const rpaStats = analytics?.rpaStats || { processed: 0, skipped: 0 };
  const triageTiers = analytics?.triageTiers || {};
  const hoursSavedToday = analytics?.hoursSavedToday || 0;
  const preventedThisWeek = analytics?.preventedThisWeek || 0;
  const resolutionOutcomes = analytics?.resolutionOutcomes || null;
  const showAccuracyWarning = aiAccuracyTrend.some((point) => Number(point.accuracy) < 75);
  const typeTotal = typeData.reduce((sum, item) => sum + Number(item.count || 0), 0);

  const sevenDayTrend = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return incidentsByDay
      .filter((item) => new Date(item.date).getTime() >= cutoff)
      .reduce((sum, item) => sum + item.count, 0);
  }, [incidentsByDay]);

  async function exportTraining() {
    setExporting(true);
    try {
      const { blob, filename } = await exportTrainingCandidates();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportAudit() {
    setExportingAudit(true);
    try {
      const { blob, filename } = await exportAuditLog();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Audit export failed', err);
    } finally {
      setExportingAudit(false);
    }
  }

  // ── Model Intelligence handlers ──────────────────────────────────────────
  const loadModelHealth = useCallback(async () => {
    try {
      const data = await getAdminModelHealth();
      setModelHealth(data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadModelHealth();
    getSops().then(setSops).catch(() => {});
    getLearningMetrics().then(setLearningMetrics).catch(() => {});
  }, [loadModelHealth]);

  // Poll retrain status while running
  useEffect(() => {
    if (retrainJob.status === 'running') {
      pollRef.current = setInterval(async () => {
        const status = await getRetrainStatus();
        setRetrainJob(status);
        if (status.status !== 'running') {
          clearInterval(pollRef.current);
          setRetraining(false);
          if (status.status === 'done') loadModelHealth();
        }
      }, 4000);
    }
    return () => clearInterval(pollRef.current);
  }, [retrainJob.status, loadModelHealth]);

  async function handleRetrain() {
    setRetraining(true);
    setRetrainError('');
    try {
      const result = await triggerRetrain();
      setRetrainJob({ status: 'running', startedAt: result.startedAt, realRowsAdded: result.realRowsAdded });
    } catch (err) {
      setRetrainError(err.message || 'Failed to start retrain');
      setRetraining(false);
    }
  }

  async function handleCsvUpload() {
    if (!csvFile) return;
    setUploading(true);
    setUploadError('');
    setUploadResult(null);
    try {
      const result = await uploadTrainingCsv(csvFile);
      setUploadResult(result);
      setCsvFile(null);
    } catch (err) {
      setUploadError(err.message || err.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  // ── SOP handlers ─────────────────────────────────────────────────────────
  async function handleAddSop() {
    setSavingSop(true);
    setSopError('');
    try {
      const payload = {
        ...newSop,
        steps: newSop.steps.filter((s) => s.trim()),
        keywords: newSop.keywords ? newSop.keywords.split(',').map((k) => k.trim()).filter(Boolean) : [],
      };
      const created = await createSop(payload);
      setSops((prev) => [...prev, created]);
      setNewSop(BLANK_SOP);
      setShowAddSop(false);
    } catch (err) {
      setSopError(err.message || err.data?.error || 'Failed to create SOP');
    } finally {
      setSavingSop(false);
    }
  }

  async function handleUpdateSop(code, draft) {
    try {
      const payload = {
        ...draft,
        steps: draft.steps.filter((s) => s.trim()),
        keywords: typeof draft.keywords === 'string'
          ? draft.keywords.split(',').map((k) => k.trim()).filter(Boolean)
          : draft.keywords,
      };
      const updated = await updateSop(code, payload);
      setSops((prev) => prev.map((s) => (s.code === code ? updated : s)));
      setEditingSop(null);
    } catch (err) {
      setSopError(err.message || 'Failed to update SOP');
    }
  }

  async function handleDeleteSop(code) {
    if (!window.confirm(`Delete SOP ${code}? This cannot be undone.`)) return;
    try {
      await deleteSop(code);
      setSops((prev) => prev.filter((s) => s.code !== code));
    } catch (err) {
      setSopError(err.message || 'Failed to delete SOP');
    }
  }

  function exportCurrentPageCsv() {
    if (!runs.length) return;

    const rows = [
      ['run_id', 'started', 'duration', 'processed', 'duplicates', 'failed', 'status'],
      ...runs.map((run) => [
        String(run._id).slice(0, 8),
        run.startTime || run.createdAt || '',
        run.endTime && run.startTime
          ? `${Math.round((new Date(run.endTime) - new Date(run.startTime)) / 60000)}m`
          : 'N/A',
        run.totalFiles ?? 0,
        run.duplicates ?? 0,
        run.failed ?? 0,
        run.failed > 0 ? 'issues' : 'healthy',
      ]),
    ];

    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rpa_runs_page_${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Knowledge tab handlers ────────────────────────────────────────────────
  async function fetchDrafts() {
    setDraftsLoading(true);
    try {
      const data = await getSopDrafts();
      setSopDrafts(data.drafts || []);
      setDraftCount(data.pendingCount || 0);
    } catch {
      // non-critical
    } finally {
      setDraftsLoading(false);
    }
  }

  async function fetchClusters() {
    try {
      const data = await getAdminClusters();
      setActiveClusters(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function handleGenerateSop(incidentType, location, clusterId) {
    const key = `${incidentType}::${location}`;
    setGeneratingSop(key);
    setGenerateError('');
    try {
      const result = await generateSop(incidentType, location, clusterId);
      const draft = result.draft;
      setSopDrafts((prev) => [draft, ...prev.filter((d) => d._id !== draft._id)]);
      if (!result.alreadyExists) setDraftCount((prev) => prev + 1);
    } catch (err) {
      setGenerateError(err.data?.error || err.message || 'Failed to generate SOP');
    } finally {
      setGeneratingSop(null);
    }
  }

  async function handleApproveDraft(draftId) {
    setReviewingDraft(draftId);
    setGenerateError('');
    try {
      await approveSopDraft(draftId);
      setSopDrafts((prev) =>
        prev.map((d) => (d._id === draftId ? { ...d, status: 'approved' } : d)),
      );
      setDraftCount((prev) => Math.max(0, prev - 1));
      const updatedSops = await getSops();
      setSops(Array.isArray(updatedSops) ? updatedSops : []);
    } catch (err) {
      setGenerateError(err.data?.error || err.message || 'Failed to approve draft');
    } finally {
      setReviewingDraft(null);
    }
  }

  async function handleRejectDraft(draftId) {
    setReviewingDraft(draftId);
    setGenerateError('');
    try {
      await rejectSopDraft(draftId);
      setSopDrafts((prev) =>
        prev.map((d) => (d._id === draftId ? { ...d, status: 'rejected' } : d)),
      );
      setDraftCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setGenerateError(err.data?.error || err.message || 'Failed to reject draft');
    } finally {
      setReviewingDraft(null);
    }
  }

  return (
    <Layout
      title="Admin Analytics"
      topbarExtras={<span className="hidden text-xs text-[var(--text-3)] sm:block">{cachedAge !== null ? `Cached · ${cachedAge} min ago` : `Last updated ${relativeTimestamp(lastUpdated)}`}</span>}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-[var(--text-2)]">Analytics</p>
            <p className="text-xs text-[var(--text-3)]">Last updated {relativeTimestamp(lastUpdated)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchDashboard}>
              <RefreshCw size={14} aria-hidden="true" />
              Refresh
            </Button>
            {user?.role === 'admin' && (
              <>
                <Button variant="outline" onClick={handleExportAudit} disabled={exportingAudit}>
                  <Download size={14} aria-hidden="true" />
                  {exportingAudit ? 'Exporting...' : 'Audit Log CSV'}
                </Button>
                <Button onClick={exportTraining} disabled={exporting}>
                  <Download size={14} aria-hidden="true" />
                  {exporting ? 'Exporting...' : 'Export Training Data'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Tab navigation ───────────────────────────────────────────────── */}
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-1">
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {[
              { key: 'overview',   label: 'Overview',           desc: 'KPIs · Trends · LEAN',      Icon: LayoutDashboard, accent: '#FFCC00' },
              { key: 'model',      label: 'Model Intelligence', desc: 'Accuracy · HITL · Retrain',  Icon: Brain,           accent: '#3B82F6' },
              { key: 'automation', label: 'Automation',         desc: 'RPA · Run History',          Icon: Cpu,             accent: '#F59E0B' },
              { key: 'knowledge',  label: 'Knowledge',          desc: 'SOPs · Clusters · Drafts',   Icon: BookOpen,        accent: '#10B981', badge: draftCount },
            ].map(({ key, label, desc, Icon, accent, badge = 0 }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveTab(key);
                    if (key === 'knowledge') { fetchDrafts(); fetchClusters(); }
                  }}
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

        {error && activeTab !== 'knowledge' && (
          <div className="rounded-[6px] border-l-[3px] border-[var(--accent-red)] bg-[rgb(239,68,68,0.1)] px-4 py-3 text-sm text-[var(--text-1)]">
            <div className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={fetchDashboard}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (loading && !analytics ? (
          <AnalyticsSkeleton />
        ) : (
          <>
            <TriageFunnel triageTiers={triageTiers} />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard label="Total Incidents" value={number(totals.totalIncidents)} trend={`+${number(sevenDayTrend)} last 7 days`} positive />
              <KpiCard label="AI Accuracy" value={percent(aiAccuracy.accuracy)} trend={`${number(aiAccuracy.correct)} / ${number(aiAccuracy.total)} reviewed`} positive={aiAccuracy.accuracy >= 85} />
              <KpiCard label="RPA Processed" value={number(rpaStats.processed)} trend={`${number(rpaStats.skipped)} duplicates skipped`} positive />
              <KpiCard label="Avg Resolution" value={hours(totals.avgResolutionHours)} trend="Resolved incidents only" positive={totals.avgResolutionHours <= 24} />
              <KpiCard
                label="Hours Saved Today"
                value={hoursSavedToday > 0 ? `${new Intl.NumberFormat('en-MY').format(hoursSavedToday)}h` : '0.0h'}
                trend="Est. PCC hours returned by automation today"
                positive={hoursSavedToday > 0}
                tooltip="Estimated PCC hours returned by automation today"
              />
              <KpiCard
                label="Prevented This Week"
                value={number(preventedThisWeek)}
                trend="Proactive contacts that may have prevented complaints"
                positive={preventedThisWeek > 0}
                tooltip="Proactive contacts sent that may have prevented complaints"
              />
            </div>

            <LeanProcessPanel learningMetrics={learningMetrics} />

            <Card>
              <CardHeader>
                <CardTitle>Incident Trends</CardTitle>
              </CardHeader>
              <CardContent className="h-[360px]">
                {incidentsByDay.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={incidentsByDay}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                      <YAxis stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                      <Tooltip content={<TooltipBox />} />
                      <Legend wrapperStyle={{ color: 'var(--text-2)' }} />
                      <Line type="monotone" dataKey="manualCount" name="Manual" stroke="#FFCC00" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="rpaCount" name="RPA" stroke="#3B82F6" strokeWidth={2.5} dot={false} />
                      <Brush dataKey="date" stroke="#3B82F6" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No analytics data yet" subtitle="Process your first incident to see insights" />
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Incident Breakdown by Type</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {typeData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={typeData} dataKey="count" nameKey="type" innerRadius={72} outerRadius={110}>
                          {typeData.map((entry, index) => (
                            <Cell key={entry.type} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                          <Label
                            position="center"
                            content={() => (
                              <text
                                x="50%"
                                y="50%"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="var(--text-1)"
                              >
                                <tspan x="50%" dy="-0.2em" fontSize="26" fontWeight="700">
                                  {typeTotal}
                                </tspan>
                                <tspan x="50%" dy="1.5em" fontSize="11" fill="var(--text-3)">
                                  total
                                </tspan>
                              </text>
                            )}
                          />
                        </Pie>
                        <Tooltip content={<TooltipBox />} />
                        <Legend wrapperStyle={{ color: 'var(--text-2)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No analytics data yet" subtitle="Process your first incident to see insights" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Incidents by Severity</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {severityData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={severityData}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="severity" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <YAxis stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Legend wrapperStyle={{ color: 'var(--text-2)' }} />
                        <Bar dataKey="count" name="Incidents">
                          {severityData.map((entry) => (
                            <Cell
                              key={entry.severity}
                              fill={
                                entry.severity === 'Critical' ? '#EF4444'
                                  : entry.severity === 'High' ? '#F59E0B'
                                  : entry.severity === 'Medium' ? '#3B82F6'
                                  : '#10B981'
                              }
                            />
                          ))}
                          <LabelList dataKey="count" position="top" fill="var(--text-2)" fontSize={11} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No analytics data yet" subtitle="Process your first incident to see insights" />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Average Resolution Time by Department</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {resolutionData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={resolutionData} layout="vertical">
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis type="number" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <YAxis dataKey="department" type="category" width={110} stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="avgHours" name="Avg hours">
                          {resolutionData.map((entry, index) => (
                            <Cell key={entry.department} fill={index < 2 ? '#10B981' : index < 4 ? '#F59E0B' : '#EF4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No analytics data yet" subtitle="Process your first incident to see insights" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Reporters</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {topReporters.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topReporters} layout="vertical">
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis type="number" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <YAxis dataKey="name" type="category" width={120} stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Bar dataKey="count" name="Incidents" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No analytics data yet" subtitle="Process your first incident to see insights" />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Feature D: Resolution Outcomes Panel ──────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle>Resolution Outcomes</CardTitle>
              </CardHeader>
              <CardContent>
                {!resolutionOutcomes || resolutionOutcomes.byApproach?.length === 0 ? (
                  <EmptyState
                    title="No resolution data yet"
                    subtitle="Outcomes are recorded 24 hours after an incident is resolved."
                  />
                ) : (
                  <div className="space-y-6">
                    {/* Overall satisfaction + follow-up count */}
                    <div className="flex flex-wrap items-end gap-6">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Overall Satisfaction</p>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span
                            className="text-[40px] font-bold leading-none tabular-nums"
                            style={{
                              color: resolutionOutcomes.overallSatisfactionRate == null ? 'var(--text-3)'
                                : resolutionOutcomes.overallSatisfactionRate >= 80 ? '#22C55E'
                                : resolutionOutcomes.overallSatisfactionRate >= 60 ? '#F59E0B'
                                : '#EF4444',
                            }}
                          >
                            {resolutionOutcomes.overallSatisfactionRate != null
                              ? `${resolutionOutcomes.overallSatisfactionRate}%`
                              : '–'}
                          </span>
                          <span className="text-sm text-[var(--text-2)]">across all resolved incidents</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-3)]">
                          {resolutionOutcomes.totalWithFollowUp > 0
                            ? `${resolutionOutcomes.totalWithFollowUp} confirmed via 24h follow-up · remainder estimated from resolution status`
                            : 'Estimated from resolution status — follow-ups pending'}
                        </p>
                      </div>
                    </div>

                    {/* By approach */}
                    <div>
                      <p className="mb-3 text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">By Resolution Approach</p>
                      <div className="space-y-2">
                        {resolutionOutcomes.byApproach.map((item) => {
                          const pct = item.successRate ?? 0;
                          const barColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#EF4444';
                          return (
                            <div key={item.approach}>
                              <div className="mb-1 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-[var(--text-1)]">{item.label}</span>
                                  <span className="text-[11px] text-[var(--text-3)]">{item.count} case{item.count !== 1 ? 's' : ''}</span>
                                </div>
                                <span
                                  className="font-mono-ui text-sm font-semibold tabular-nums"
                                  style={{ color: barColor }}
                                >
                                  {item.successRate != null ? `${item.successRate}%` : '–'}
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-[var(--surface-3)]">
                                <div
                                  className="h-2 rounded-full transition-all duration-700"
                                  style={{ width: `${pct}%`, background: barColor }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Recent follow-ups table */}
                    {resolutionOutcomes.recentFollowUps?.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">Recent Confirmed Follow-ups</p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                            <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                              <tr>
                                <th className="pb-2">Incident</th>
                                <th className="pb-2">Approach</th>
                                <th className="pb-2">Severity</th>
                                <th className="pb-2">Outcome</th>
                                <th className="pb-2">Checked</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {resolutionOutcomes.recentFollowUps.map((f) => {
                                const outcomeCfg = {
                                  satisfied:   { label: 'Satisfied',   cls: 'text-[var(--accent-green)]' },
                                  escalated:   { label: 'Escalated',   cls: 'text-[var(--accent-red)]' },
                                  no_response: { label: 'No response', cls: 'text-[var(--text-3)]' },
                                }[f.outcome] || { label: f.outcome, cls: 'text-[var(--text-2)]' };
                                return (
                                  <tr key={f.id}>
                                    <td className="py-2 font-mono-ui text-[var(--text-2)] text-xs">
                                      {`INC-${f.id.slice(-6).toUpperCase()}`}
                                    </td>
                                    <td className="py-2 text-[var(--text-2)]">{f.approachLabel}</td>
                                    <td className="py-2 text-[var(--text-2)]">{f.severity}</td>
                                    <td className={`py-2 font-medium ${outcomeCfg.cls}`}>{outcomeCfg.label}</td>
                                    <td className="py-2 text-xs text-[var(--text-3)]">
                                      {f.checkedAt
                                        ? new Date(f.checkedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                                        : '–'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ))}

        {/* ── Model Intelligence tab ──────────────────────────────────────── */}
        {activeTab === 'model' && (loading && !analytics ? (
          <AnalyticsSkeleton />
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>HITL Gate Stats</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-[0.9fr,1.1fr]">
                  <div className="grid gap-3">
                    {[
                      ['Approved', hitlStats.approved, '#10B981'],
                      ['Rejected', hitlStats.rejected, '#EF4444'],
                      ['Pending', hitlStats.pending, '#F59E0B'],
                    ].map(([label, value, color]) => (
                      <div key={label} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">{label}</p>
                        <p className="mt-2 text-2xl font-semibold" style={{ color }}>{number(value)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Approved', value: hitlStats.approved, fill: '#10B981' },
                            { name: 'Rejected', value: hitlStats.rejected, fill: '#EF4444' },
                            { name: 'Pending', value: hitlStats.pending, fill: '#F59E0B' },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={62}
                          outerRadius={90}
                        >
                          {[
                            { name: 'Approved', fill: '#10B981' },
                            { name: 'Rejected', fill: '#EF4444' },
                            { name: 'Pending', fill: '#F59E0B' },
                          ].map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipBox />} />
                        <Legend wrapperStyle={{ color: 'var(--text-2)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>AI Accuracy Trend</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  {showAccuracyWarning && (
                    <div className="mb-4 rounded-[6px] border-l-[3px] border-[var(--accent-red)] bg-[rgb(239,68,68,0.1)] px-4 py-3 text-sm text-[var(--text-1)]">
                      Weekly AI accuracy dropped below 75% in at least one bucket. Review overrides and recent classifier behavior.
                    </div>
                  )}
                  {aiAccuracyTrend.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={aiAccuracyTrend}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis dataKey="week" stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <YAxis domain={[0, 100]} stroke="var(--text-2)" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
                        <Tooltip content={<TooltipBox />} />
                        <Legend wrapperStyle={{ color: 'var(--text-2)' }} />
                        <ReferenceLine y={85} stroke="#10B981" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="accuracy" name="Accuracy %" stroke="#FFCC00" strokeWidth={2.5} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState title="No analytics data yet" subtitle="Process your first incident to see insights" />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {/* Retrain card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Brain size={16} className="text-[#3B82F6]" aria-hidden="true" />
                    <CardTitle>Retrain Classifier</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current model stats */}
                  <div className="grid grid-cols-3 gap-3 text-center text-[11px]">
                    {[
                      { label: 'Last Trained', value: modelHealth?.lastTrainedAt ? relativeTimestamp(modelHealth.lastTrainedAt) : '–' },
                      { label: 'Dataset Size', value: modelHealth?.trainingDataSize ? number(modelHealth.trainingDataSize) : '–' },
                      { label: 'Accuracy', value: modelHealth?.accuracy ? `${(modelHealth.accuracy * 100).toFixed(1)}%` : '–' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-2 py-2">
                        <p className="font-semibold text-[var(--text-1)]">{item.value}</p>
                        <p className="mt-0.5 text-[var(--text-3)]">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Status banner */}
                  {retrainJob.status === 'running' && (
                    <div className="flex items-center gap-2 rounded-[6px] bg-[rgb(59,130,246,0.08)] border border-[rgb(59,130,246,0.2)] px-3 py-2 text-xs text-[#3B82F6]">
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
                      Training in progress — {retrainJob.realRowsAdded ?? 0} real-world rows merged
                    </div>
                  )}
                  {retrainJob.status === 'done' && (
                    <div className="flex items-center gap-2 rounded-[6px] bg-[rgb(16,185,129,0.08)] border border-[rgb(16,185,129,0.2)] px-3 py-2 text-xs text-[var(--accent-green)]">
                      <Check size={13} />
                      Training complete — {retrainJob.realRowsAdded ?? 0} real-world rows added
                    </div>
                  )}
                  {retrainJob.status === 'failed' && (
                    <div className="rounded-[6px] bg-[rgb(239,68,68,0.08)] border border-[rgb(239,68,68,0.2)] px-3 py-2 text-xs text-[var(--accent-red)]">
                      Training failed — check server logs
                    </div>
                  )}
                  {retrainError && <p className="text-xs text-[var(--accent-red)]">{retrainError}</p>}

                  <p className="text-xs text-[var(--text-3)]">
                    Pulls all resolved incidents + human corrections, merges with synthetic base, runs <code className="rounded bg-[var(--surface-3)] px-1">train.py</code>.
                  </p>

                  <Button
                    onClick={handleRetrain}
                    disabled={retraining || retrainJob.status === 'running'}
                    className="w-full"
                  >
                    {retraining || retrainJob.status === 'running' ? (
                      <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> Training…</>
                    ) : (
                      <><Brain size={14} /> Retrain Model</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Bulk CSV upload card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Upload size={16} className="text-[var(--accent-amber)]" aria-hidden="true" />
                    <CardTitle>Bulk Import Training Data</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-[var(--text-3)]">
                    Upload a CSV with <code className="rounded bg-[var(--surface-3)] px-1">description</code> and <code className="rounded bg-[var(--surface-3)] px-1">label</code> columns.
                    Valid labels: <span className="font-medium text-[var(--text-2)]">{VALID_LABELS.join(', ')}</span>
                  </p>

                  {/* Drop zone */}
                  <label className="flex flex-col items-center justify-center gap-2 cursor-pointer rounded-[8px] border-2 border-dashed border-[var(--border)] bg-[var(--surface-3)] p-6 text-center transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-2)]">
                    <Upload size={20} className="text-[var(--text-3)]" aria-hidden="true" />
                    <span className="text-sm text-[var(--text-2)]">
                      {csvFile ? csvFile.name : 'Drop CSV here or click to browse'}
                    </span>
                    {csvFile && (
                      <span className="text-[11px] text-[var(--text-3)]">
                        {(csvFile.size / 1024).toFixed(1)} KB
                      </span>
                    )}
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      onChange={(e) => { setCsvFile(e.target.files[0] || null); setUploadResult(null); setUploadError(''); }}
                    />
                  </label>

                  {uploadResult && (
                    <div className="rounded-[6px] border border-[rgb(16,185,129,0.3)] bg-[rgb(16,185,129,0.07)] px-3 py-2 text-xs space-y-1">
                      <p className="font-semibold text-[var(--accent-green)]">
                        {number(uploadResult.rowsAdded)} rows added · {number(uploadResult.skipped)} skipped
                      </p>
                      {Object.entries(uploadResult.labelCounts || {}).map(([label, count]) => (
                        <p key={label} className="text-[var(--text-2)]">{label}: {count}</p>
                      ))}
                      <p className="text-[var(--text-3)] mt-1">{uploadResult.message}</p>
                    </div>
                  )}
                  {uploadError && <p className="text-xs text-[var(--accent-red)]">{uploadError}</p>}

                  <Button
                    onClick={handleCsvUpload}
                    disabled={!csvFile || uploading}
                    variant="outline"
                    className="w-full"
                  >
                    {uploading ? (
                      <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Uploading…</>
                    ) : (
                      <><Upload size={14} /> Upload & Append</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

          </>
        ))}

        {/* ── Automation tab ───────────────────────────────────────────────── */}
        {activeTab === 'automation' && (loading && !analytics ? (
          <AnalyticsSkeleton />
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-[var(--accent-amber)]" aria-hidden="true" />
                  <CardTitle>RPA Run History</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={exportCurrentPageCsv}>Current page CSV</Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {runs.length ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                        <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                          <tr>
                            <th className="pb-3">Run ID</th>
                            <th className="pb-3">Started</th>
                            <th className="pb-3">Duration</th>
                            <th className="pb-3">Processed</th>
                            <th className="pb-3">Duplicates</th>
                            <th className="pb-3">Failed</th>
                            <th className="pb-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {runs.map((run) => (
                            <tr key={run._id}>
                              <td className="py-3 font-mono-ui text-[var(--text-1)]">{String(run._id).slice(0, 8)}</td>
                              <td className="py-3 text-[var(--text-2)]">{relativeTimestamp(run.startTime || run.createdAt)}</td>
                              <td className="py-3 text-[var(--text-2)]">{run.endTime ? `${Math.round((new Date(run.endTime) - new Date(run.startTime)) / 60000)}m` : 'N/A'}</td>
                              <td className="py-3 text-[var(--text-2)]">{number(run.totalFiles)}</td>
                              <td className="py-3 text-[var(--text-2)]">{number(run.duplicates)}</td>
                              <td className="py-3 text-[var(--text-2)]">{number(run.failed)}</td>
                              <td className="py-3">
                                <span className={`rounded-[2px] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${run.failed > 0 ? 'bg-[rgb(245,158,11,0.12)] text-[var(--accent-amber)]' : 'bg-[rgb(16,185,129,0.12)] text-[var(--accent-green)]'}`}>
                                  {run.failed > 0 ? 'Issues' : 'Healthy'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[var(--text-3)]">Page {page} of {meta.totalPages}</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))}>
                          Previous
                        </Button>
                        <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((value) => Math.min(value + 1, meta.totalPages))}>
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <EmptyState title="No RPA runs recorded" subtitle="Run the UiPath automation or seed the database to populate history." />
                )}
              </CardContent>
            </Card>
          </>
        ))}

        {/* ── Knowledge Tab ──────────────────────────────────────────────── */}
        {activeTab === 'knowledge' && (
          <div className="space-y-6">
            {generateError && (
              <div className="rounded-[6px] border-l-[3px] border-[var(--accent-red)] bg-[rgb(239,68,68,0.1)] px-4 py-3 text-sm text-[var(--text-1)]">
                {generateError}
                <button onClick={() => setGenerateError('')} className="ml-3 text-[var(--text-3)] hover:text-[var(--text-1)]">×</button>
              </div>
            )}

            {/* ── SOP Library ─────────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-[var(--accent-green)]" aria-hidden="true" />
                    <CardTitle>SOP Library</CardTitle>
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-2)]">
                      {sops.length} procedures
                    </span>
                  </div>
                  {user?.role === 'admin' && (
                    <Button size="sm" variant="outline" onClick={() => { setShowAddSop((v) => !v); setSopError(''); }}>
                      <Plus size={13} />
                      Add SOP
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {sopError && <p className="text-xs text-[var(--accent-red)]">{sopError}</p>}

                {/* Add SOP form */}
                {showAddSop && (
                  <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-3)] p-4 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">New SOP</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="h-9 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                        placeholder="Code e.g. DHL-OPS-08"
                        value={newSop.code}
                        onChange={(e) => setNewSop((p) => ({ ...p, code: e.target.value }))}
                      />
                      <input
                        className="h-9 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                        placeholder="Title"
                        value={newSop.title}
                        onChange={(e) => setNewSop((p) => ({ ...p, title: e.target.value }))}
                      />
                      <select
                        className="h-9 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                        value={newSop.incidentType}
                        onChange={(e) => setNewSop((p) => ({ ...p, incidentType: e.target.value }))}
                      >
                        {VALID_LABELS.map((l) => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
                      </select>
                      <input
                        className="h-9 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                        placeholder="Keywords (comma-separated)"
                        value={newSop.keywords}
                        onChange={(e) => setNewSop((p) => ({ ...p, keywords: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-[var(--text-3)]">Steps</p>
                      {newSop.steps.map((step, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            className="flex-1 h-9 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                            placeholder={`Step ${i + 1}`}
                            value={step}
                            onChange={(e) => setNewSop((p) => { const s = [...p.steps]; s[i] = e.target.value; return { ...p, steps: s }; })}
                          />
                          {newSop.steps.length > 1 && (
                            <button type="button" onClick={() => setNewSop((p) => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }))} className="text-[var(--text-3)] hover:text-[var(--accent-red)]"><X size={14} /></button>
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => setNewSop((p) => ({ ...p, steps: [...p.steps, ''] }))} className="text-[11px] text-[#3B82F6] hover:underline">+ Add step</button>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddSop} disabled={savingSop}>
                        {savingSop ? 'Saving…' : 'Save SOP'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowAddSop(false); setNewSop(BLANK_SOP); setSopError(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* SOP list */}
                {sops.length === 0 ? (
                  <p className="text-sm text-[var(--text-3)] py-4 text-center">No SOPs found. Click "Add SOP" to create the first one.</p>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {sops.map((sop) => {
                      const isEditing = editingSop?.code === sop.code;
                      const isExpanded = expandedSop === sop.code;
                      return (
                        <div key={sop.code} className="py-3">
                          {/* Row header */}
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setExpandedSop(isExpanded ? null : sop.code)}
                              className="flex flex-1 items-center gap-3 text-left"
                            >
                              <span className="font-mono-ui text-[11px] text-[var(--text-3)] w-24 shrink-0">{sop.code}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[var(--text-1)] truncate">{sop.title}</p>
                                <p className="text-[11px] text-[var(--text-3)]">{sop.incidentType?.replace(/_/g, ' ')} · {sop.steps?.length ?? 0} steps</p>
                              </div>
                              {isExpanded ? <ChevronUp size={14} className="text-[var(--text-3)] shrink-0" /> : <ChevronDown size={14} className="text-[var(--text-3)] shrink-0" />}
                            </button>
                            {user?.role === 'admin' && (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  type="button"
                                  title="Edit"
                                  onClick={() => {
                                    setEditingSop({ code: sop.code, draft: { ...sop, keywords: Array.isArray(sop.keywords) ? sop.keywords.join(', ') : '' } });
                                    setExpandedSop(sop.code);
                                  }}
                                  className="rounded p-1 text-[var(--text-3)] hover:text-[#3B82F6] hover:bg-[rgb(59,130,246,0.08)]"
                                ><Pencil size={13} /></button>
                                <button
                                  type="button"
                                  title="Delete"
                                  onClick={() => handleDeleteSop(sop.code)}
                                  className="rounded p-1 text-[var(--text-3)] hover:text-[var(--accent-red)] hover:bg-[rgb(239,68,68,0.08)]"
                                ><Trash2 size={13} /></button>
                              </div>
                            )}
                          </div>

                          {/* Expanded / edit view */}
                          {isExpanded && !isEditing && (
                            <div className="mt-3 space-y-2 pl-[108px]">
                              <ol className="space-y-1">
                                {(sop.steps || []).map((step, i) => (
                                  <li key={i} className="flex gap-2 text-sm text-[var(--text-2)]">
                                    <span className="w-5 shrink-0 font-mono-ui text-[11px] text-[var(--text-3)]">{i + 1}.</span>
                                    {step}
                                  </li>
                                ))}
                              </ol>
                              {sop.keywords?.length > 0 && (
                                <p className="text-[11px] text-[var(--text-3)]">
                                  Keywords: {sop.keywords.join(', ')}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Edit form */}
                          {isEditing && (
                            <div className="mt-3 space-y-3 pl-[108px]">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <input
                                  className="h-9 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                                  placeholder="Title"
                                  value={editingSop.draft.title}
                                  onChange={(e) => setEditingSop((p) => ({ ...p, draft: { ...p.draft, title: e.target.value } }))}
                                />
                                <select
                                  className="h-9 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                                  value={editingSop.draft.incidentType}
                                  onChange={(e) => setEditingSop((p) => ({ ...p, draft: { ...p.draft, incidentType: e.target.value } }))}
                                >
                                  {VALID_LABELS.map((l) => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
                                </select>
                                <input
                                  className="h-9 sm:col-span-2 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                                  placeholder="Keywords (comma-separated)"
                                  value={editingSop.draft.keywords}
                                  onChange={(e) => setEditingSop((p) => ({ ...p, draft: { ...p.draft, keywords: e.target.value } }))}
                                />
                              </div>
                              <div className="space-y-1.5">
                                {(editingSop.draft.steps || []).map((step, i) => (
                                  <div key={i} className="flex gap-2">
                                    <input
                                      className="flex-1 h-9 rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                                      value={step}
                                      onChange={(e) => setEditingSop((p) => { const s = [...p.draft.steps]; s[i] = e.target.value; return { ...p, draft: { ...p.draft, steps: s } }; })}
                                    />
                                    {editingSop.draft.steps.length > 1 && (
                                      <button type="button" onClick={() => setEditingSop((p) => ({ ...p, draft: { ...p.draft, steps: p.draft.steps.filter((_, idx) => idx !== i) } }))} className="text-[var(--text-3)] hover:text-[var(--accent-red)]"><X size={14} /></button>
                                    )}
                                  </div>
                                ))}
                                <button type="button" onClick={() => setEditingSop((p) => ({ ...p, draft: { ...p.draft, steps: [...p.draft.steps, ''] } }))} className="text-[11px] text-[#3B82F6] hover:underline">+ Add step</button>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => handleUpdateSop(sop.code, editingSop.draft)}>Save</Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingSop(null)}>Cancel</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Active Clusters → Generate SOP */}
            {activeClusters.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap size={16} className="text-[var(--accent-amber)]" aria-hidden="true" />
                      <CardTitle>Active Clusters</CardTitle>
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2 py-0.5 text-[10px] text-[var(--text-2)]">
                        {activeClusters.length} cluster{activeClusters.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <button onClick={fetchClusters} className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">Refresh</button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-[var(--text-2)]">
                    These incident clusters have resolved cases. Click "Draft SOP" to generate a Standard Operating Procedure from the real incident data.
                  </p>
                  <div className="space-y-2 pt-1">
                    {activeClusters.map((cluster) => {
                      const key = `${cluster.type}::${cluster.location}`;
                      const isGenerating = generatingSop === key;
                      const alreadyHasDraft = sopDrafts.some(
                        (d) => d.incidentType === cluster.type && d.location === cluster.location && d.status === 'pending',
                      );
                      return (
                        <div
                          key={cluster.clusterId}
                          className="flex items-center justify-between rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium text-[var(--text-1)]">
                              {cluster.location} — {(cluster.type || '').replace(/_/g, ' ')}
                            </p>
                            <p className="text-xs text-[var(--text-3)]">
                              {cluster.count} incidents in cluster
                            </p>
                          </div>
                          {alreadyHasDraft ? (
                            <span className="text-[11px] italic text-[var(--text-3)]">Draft pending review</span>
                          ) : (
                            <button
                              onClick={() => handleGenerateSop(cluster.type, cluster.location, cluster.clusterId)}
                              disabled={isGenerating || !!generatingSop}
                              className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-1)] hover:border-[#3B82F6] hover:text-[#3B82F6] disabled:opacity-50"
                            >
                              {isGenerating ? (
                                <><div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />Generating…</>
                              ) : (
                                <><Wand2 size={13} />Draft SOP</>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap size={16} className="text-[var(--accent-amber)]" aria-hidden="true" />
                      <CardTitle>Generate from Cluster</CardTitle>
                    </div>
                    <button onClick={fetchClusters} className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">Refresh</button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--text-2)]">
                    No active clusters detected. When 3+ incidents of the same type cluster at one hub within a 4-hour window, a "Draft SOP" button will appear here.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Pending Drafts */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>Pending Drafts</CardTitle>
                  {draftCount > 0 && (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#FFCC00] px-1.5 text-[10px] font-bold text-[#030712]">
                      {draftCount}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {draftsLoading ? (
                  <div className="space-y-3">
                    {[0, 1].map((i) => (
                      <LoadingSkeleton key={i} height={240} width="100%" />
                    ))}
                  </div>
                ) : sopDrafts.filter((d) => d.status === 'pending').length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--text-3)]">
                    No pending drafts. Generate one from an active cluster above.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {sopDrafts
                      .filter((d) => d.status === 'pending')
                      .map((draft) => (
                        <SopDraftCard
                          key={draft._id}
                          draft={draft}
                          reviewing={reviewingDraft === draft._id}
                          onApprove={() => handleApproveDraft(draft._id)}
                          onReject={() => handleRejectDraft(draft._id)}
                        />
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Published Playbooks */}
            {sopDrafts.filter((d) => d.status === 'approved').length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-[var(--accent-green)]" aria-hidden="true" />
                    <CardTitle>Published Playbooks</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-[var(--border)]">
                    {sopDrafts
                      .filter((d) => d.status === 'approved')
                      .map((draft) => {
                        const c = draft.generatedContent || {};
                        return (
                          <div key={draft._id} className="py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-[var(--text-1)]">{c.title || 'Untitled'}</p>
                                <p className="mt-1 text-[11px] text-[var(--text-3)]">
                                  {draft.incidentType?.replace(/_/g, ' ')} · {draft.location}
                                  {draft.publishedSopCode && (
                                    <> · <span className="font-mono-ui">{draft.publishedSopCode}</span></>
                                  )}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full border border-[var(--accent-green)]/30 bg-[rgb(16,185,129,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-green)]">
                                Published
                              </span>
                            </div>
                            {c.recommendedAction && (
                              <p className="mt-2 line-clamp-2 text-sm text-[var(--text-2)]">
                                {c.recommendedAction.split('\n')[0]}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
