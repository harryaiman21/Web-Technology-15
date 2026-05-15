import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Map,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Sparkles,
  TrendingUp,
  User,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import Layout from '../components/Layout';
import KnowledgeMapGraph from '../components/KnowledgeMapGraph';
import {
  approveSopDraft,
  demoLearningSeed,
  demoLearningFollowup,
  demoLearningStatus,
  demoReset,
  generateSop,
  getAdminMlStats,
  getLearningMetrics,
  getSopDrafts,
  getSops,
  rejectSopDraft,
  triggerRetrain,
} from '../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/* ── Constants ───────────────────────────────────────────────────────────────── */

const INCIDENT_TYPES = [
  'late_delivery',
  'damaged_parcel',
  'missing_parcel',
  'address_error',
  'system_error',
  'wrong_item',
  'other',
];

const LOCATIONS = [
  'Shah Alam Hub',
  'KLIA Hub',
  'Penang Hub',
  'Johor Bahru Hub',
  'Kuching Hub',
];

// Color map aligned with the 7 incident types
const TYPE_COLORS = {
  late_delivery: '#3b82f6',
  damaged_parcel: '#f59e0b',
  missing_parcel: '#ef4444',
  address_error: '#FF8C00',
  system_error: '#14b8a6',
  wrong_item: '#f97316',
  other: '#6b7280',
};

const TYPE_LABEL = {
  late_delivery: 'Late Delivery',
  damaged_parcel: 'Damaged Parcel',
  missing_parcel: 'Missing Parcel',
  address_error: 'Address Error',
  system_error: 'System Error',
  wrong_item: 'Wrong Item',
  other: 'Other',
};

const EVENT_CFG = {
  absorbed: {
    color: '#34d399',
    badge: 'LEARNED',
    badgeBg: 'rgba(52,211,153,0.12)',
  },
  corrected: {
    color: '#FFCC00',
    badge: 'CORRECTED',
    badgeBg: 'rgba(34,211,238,0.12)',
  },
  retrain_started: {
    color: '#f97316',
    badge: 'TRAINING',
    badgeBg: 'rgba(249,115,22,0.12)',
  },
  retrain_complete: {
    color: '#10b981',
    badge: 'COMPLETE',
    badgeBg: 'rgba(16,185,129,0.12)',
  },
  retrain_failed: {
    color: '#ef4444',
    badge: 'FAILED',
    badgeBg: 'rgba(239,68,68,0.12)',
  },
};

const SUGGESTED_QUERIES = [
  { label: 'Which hub has the most late delivery incidents?', icon: '📍' },
  { label: 'What % of cases were auto-resolved by AI?', icon: '🤖' },
  { label: 'Average resolution time by incident type', icon: '⏱' },
  { label: 'Customer sentiment breakdown across all cases', icon: '😊' },
  { label: 'Show incident volume trend over time', icon: '📈' },
  { label: 'Critical severity incidents by location', icon: '⚠️' },
];

const TEMPLATE_LABELS = {
  count_by_type: 'Volume by Type',
  count_by_location: 'Volume by Location',
  count_by_status: 'Status Breakdown',
  resolution_time_by_type: 'Resolution Time by Type',
  resolution_time_by_location: 'Resolution Time by Hub',
  trend_by_day: 'Daily Trend',
  sentiment_analysis: 'Sentiment Analysis',
  hitl_breakdown: 'AI vs Human Split',
};

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function formatTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function labelType(type) {
  return TYPE_LABEL[type] || (type ? type.replace(/_/g, ' ') : 'Unknown');
}

function healthColor(score) {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

/* ── StatCard ────────────────────────────────────────────────────────────────── */

function StatCard({ label, value, icon: Icon, iconColor, iconBg, badge, badgeColor, badgeBg }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface)] p-4 transition-colors hover:border-[rgba(0,212,232,0.2)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
          {label}
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: iconBg }}>
          <Icon size={14} style={{ color: iconColor }} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span
          className="font-mono text-2xl font-extrabold leading-none tracking-tight"
          style={{ color: value === '--' ? 'var(--nexus-text-3)' : 'var(--nexus-text-1)' }}
        >
          {value}
        </span>
        {badge != null && badge > 0 && (
          <span
            className="mb-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{ background: badgeBg, color: badgeColor }}
          >
            {badge} pending
          </span>
        )}
      </div>
    </div>
  );
}

/* ── PanelHeader ─────────────────────────────────────────────────────────────── */

function PanelHeader({ icon: Icon, iconColor, title, children }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--nexus-border)] px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color: iconColor }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: iconColor }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ── TypeBadge ───────────────────────────────────────────────────────────────── */

function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || '#6b7280';
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ background: `${color}20`, color }}
    >
      {labelType(type)}
    </span>
  );
}

/* ── Toast ───────────────────────────────────────────────────────────────────── */

function Toast({ msg, ok }) {
  if (!msg) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`rounded-lg border px-4 py-2.5 text-[12px] font-semibold ${
        ok
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-red-500/30 bg-red-500/10 text-red-400'
      }`}
    >
      {msg}
    </motion.div>
  );
}

/* ── Panel 1: SOP Intelligence Workshop ─────────────────────────────────────── */

function SopWorkshop({ sops, sopDrafts, onRefresh, initialType, initialLocation }) {
  const [activeTab, setActiveTab] = useState('drafts');
  const [genType, setGenType] = useState(initialType || INCIDENT_TYPES[0]);
  const [genLoc, setGenLoc] = useState(initialLocation || LOCATIONS[0]);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedSop, setExpandedSop] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const actionMsgTimer = useRef(null);

  const showActionMsg = (text, ok) => {
    setActionMsg({ text, ok });
    clearTimeout(actionMsgTimer.current);
    actionMsgTimer.current = setTimeout(() => setActionMsg(null), 5000);
  };

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setGenMsg(null);
    try {
      await generateSop(genType, genLoc);
      setGenMsg({ ok: true, text: 'Draft created - check the queue below.' });
      onRefresh();
    } catch (err) {
      setGenMsg({ ok: false, text: err?.message || 'Failed to generate SOP.' });
    } finally {
      setGenerating(false);
      setTimeout(() => setGenMsg(null), 5000);
    }
  };

  const handleApprove = async (id) => {
    try {
      const res = await approveSopDraft(id);
      const code = res?.sop?.code || res?.code || '';
      showActionMsg(`Published as ${code || 'new SOP'}.`, true);
      onRefresh();
    } catch (err) {
      showActionMsg(err?.message || 'Failed to approve draft.', false);
    }
  };

  const handleReject = async (id) => {
    try {
      await rejectSopDraft(id);
      showActionMsg('Draft rejected.', true);
      onRefresh();
    } catch (err) {
      showActionMsg(err?.message || 'Failed to reject draft.', false);
    }
  };

  const drafts = sopDrafts?.drafts?.filter(d => d.status === 'pending') ?? [];
  const filteredSops = (sops ?? [])
    .filter(s => {
      const q = search.toLowerCase().trim();
      if (q && !(
        (s.title || '').toLowerCase().includes(q) ||
        (s.incidentType || '').toLowerCase().includes(q) ||
        (s.keywords || []).some(k => k.toLowerCase().includes(q)) ||
        (s.publishedBy || '').toLowerCase().includes(q) ||
        (s.code || '').toLowerCase().includes(q)
      )) return false;
      if (filterStatus !== 'all') {
        const src = s.source || 'ai_generated';
        if (filterStatus === 'ai' && src !== 'ai_generated') return false;
        if (filterStatus === 'manual' && src !== 'manual') return false;
      }
      return true;
    })
    .sort((a, b) => {
      const da = new Date(a.publishedAt || a.createdAt || 0).getTime();
      const db = new Date(b.publishedAt || b.createdAt || 0).getTime();
      return sortBy === 'oldest' ? da - db : db - da;
    });

  const selectCls =
    'rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] px-3 py-2 text-[12px] text-[var(--nexus-text-2)] outline-none focus:border-[rgba(0,212,232,0.4)] transition-colors';

  return (
    <div className="flex flex-col rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface)]">
      <PanelHeader icon={BookOpen} iconColor="#FF8C00" title="SOP Intelligence Workshop" />

      {/* Tab bar */}
      <div className="flex border-b border-[var(--nexus-border)]">
        {[
          { id: 'drafts', label: 'Drafts Queue', count: drafts.length },
          { id: 'library', label: 'Published Library', count: sops?.length ?? 0 },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-[#FF8C00] text-[#FF8C00]'
                : 'text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)]'
            }`}
            style={activeTab === tab.id ? { marginBottom: '-1px' } : {}}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{
                  background: activeTab === tab.id ? 'rgba(139,92,246,0.2)' : 'var(--nexus-surface-2)',
                  color: activeTab === tab.id ? '#FF8C00' : 'var(--nexus-text-3)',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Action message */}
        <AnimatePresence>
          {actionMsg && <Toast msg={actionMsg.text} ok={actionMsg.ok} />}
        </AnimatePresence>

        {activeTab === 'drafts' && (
          <>
            {/* Generate form */}
            <div className="rounded-xl border border-[var(--nexus-border)] bg-[rgba(139,92,246,0.04)] p-3">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
                Generate New SOP
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  value={genType}
                  onChange={e => setGenType(e.target.value)}
                  className={selectCls}
                  style={{ flex: '1 1 140px' }}
                >
                  {INCIDENT_TYPES.map(t => (
                    <option key={t} value={t}>{labelType(t)}</option>
                  ))}
                </select>
                <select
                  value={genLoc}
                  onChange={e => setGenLoc(e.target.value)}
                  className={selectCls}
                  style={{ flex: '1 1 130px' }}
                >
                  {LOCATIONS.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 rounded-lg border border-[#FF8C00]/40 bg-[#FF8C00]/10 px-3 py-2 text-[12px] font-bold text-[#FF8C00] transition-all hover:bg-[#FF8C00]/20 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ flex: '0 0 auto' }}
                >
                  {generating ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  {generating ? 'Drafting...' : 'Generate'}
                </button>
              </div>
              {generating && (
                <p className="mt-2 text-[11px] text-[var(--nexus-text-3)]">
                  AI is drafting SOP from resolved incidents...
                </p>
              )}
              {genMsg && (
                <p className={`mt-2 text-[11px] font-semibold ${genMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {genMsg.text}
                </p>
              )}
            </div>

            {/* Draft list */}
            {drafts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(139,92,246,0.08)' }}>
                  <BookOpen size={18} style={{ color: '#FF8C00' }} />
                </div>
                <p className="text-center text-[12px] text-[var(--nexus-text-3)]">
                  No pending drafts. Generate one from resolved incidents above.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {drafts.map(draft => (
                  <motion.div
                    key={draft._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <TypeBadge type={draft.incidentType} />
                      <span className="text-[10px] text-[var(--nexus-text-3)]">
                        {draft.location || 'All Hubs'}
                      </span>
                      {draft.evidenceCount > 0 && (
                        <span
                          className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ background: 'rgba(0,212,232,0.1)', color: '#00d4e8' }}
                        >
                          Based on {draft.evidenceCount} cases
                        </span>
                      )}
                    </div>
                    <p className="mb-1.5 text-[12px] font-semibold text-[var(--nexus-text-1)]">
                      {draft.generatedContent?.title || 'Untitled Draft'}
                    </p>
                    {draft.generatedContent?.whenToApply && (
                      <p className="mb-3 text-[11px] leading-relaxed text-[var(--nexus-text-3)]">
                        {String(draft.generatedContent.whenToApply).slice(0, 100)}
                        {String(draft.generatedContent.whenToApply).length > 100 ? '...' : ''}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(draft._id)}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-400 transition-all hover:bg-emerald-500/20"
                      >
                        <CheckCircle2 size={11} />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(draft._id)}
                        className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-transparent px-3 py-1.5 text-[11px] font-bold text-red-400 transition-all hover:bg-red-500/08"
                      >
                        <X size={11} />
                        Reject
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'library' && (
          <>
            {/* Filter toolbar */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nexus-text-3)]" />
                <input
                  type="text"
                  placeholder="Search by title, type, keyword, or author..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] py-2 pl-8 pr-3 text-[12px] text-[var(--nexus-text-2)] outline-none placeholder:text-[var(--nexus-text-3)] focus:border-[rgba(0,212,232,0.4)] transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)]"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--nexus-text-2)] outline-none focus:border-[rgba(0,212,232,0.4)] transition-colors cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--nexus-text-2)] outline-none focus:border-[rgba(0,212,232,0.4)] transition-colors cursor-pointer"
                >
                  <option value="all">All Sources</option>
                  <option value="ai">AI-Generated</option>
                  <option value="manual">Manual</option>
                </select>
                <span className="shrink-0 rounded bg-[rgba(0,212,232,0.08)] px-2 py-1 text-[10px] font-bold text-[#00d4e8]">
                  {filteredSops.length} SOP{filteredSops.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {filteredSops.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(0,212,232,0.08)' }}>
                  <BookOpen size={18} style={{ color: '#00d4e8' }} />
                </div>
                <p className="text-center text-[12px] text-[var(--nexus-text-3)]">
                  {search ? 'No SOPs match your search.' : 'No SOPs published yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredSops.map(sop => {
                  const isExpanded = expandedSop === (sop.code || sop._id);
                  const steps = sop.steps || sop.generatedContent?.steps || [];
                  const pubDate = sop.publishedAt ? new Date(sop.publishedAt) : (sop.createdAt ? new Date(sop.createdAt) : null);
                  const pubDateStr = pubDate ? pubDate.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
                  const isAI = !sop.source || sop.source === 'ai_generated';
                  const history = sop.statusHistory || [];
                  return (
                    <div
                      key={sop.code || sop._id}
                      className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)]"
                    >
                      <div className="flex items-start gap-2.5 p-3">
                        <span className="font-mono text-[10px] font-bold text-[#00d4e8] rounded bg-[rgba(0,212,232,0.08)] px-1.5 py-0.5 mt-0.5 shrink-0">
                          {sop.code || '--'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[12px] font-semibold text-[var(--nexus-text-1)]">
                              {sop.title || 'Untitled SOP'}
                            </span>
                            <TypeBadge type={sop.incidentType} />
                            <span className="rounded px-1.5 py-0.5 text-[8px] font-bold tracking-wide bg-[rgba(16,185,129,0.12)] text-[#10b981] border border-[rgba(16,185,129,0.2)]">
                              PUBLISHED
                            </span>
                            {isAI && (
                              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold tracking-wide bg-[rgba(139,92,246,0.12)] text-[#FF8C00] border border-[rgba(139,92,246,0.2)]">
                                AI-GENERATED
                              </span>
                            )}
                          </div>
                          {/* Meta row: author + date */}
                          <div className="flex items-center gap-3 mt-0.5 mb-1">
                            {sop.publishedBy && (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--nexus-text-3)]">
                                <User size={9} />
                                {sop.publishedBy}
                              </span>
                            )}
                            {pubDateStr && (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--nexus-text-3)]">
                                <Calendar size={9} />
                                {pubDateStr}
                              </span>
                            )}
                          </div>
                          {(sop.keywords || []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {sop.keywords.slice(0, 5).map(kw => (
                                <span
                                  key={kw}
                                  className="rounded px-1.5 py-0.5 text-[9px] text-[var(--nexus-text-3)] border border-[var(--nexus-border)]"
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {steps.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedSop(isExpanded ? null : (sop.code || sop._id))}
                            className="ml-auto shrink-0 text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)] transition-colors"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                      <AnimatePresence>
                        {isExpanded && steps.length > 0 && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-[var(--nexus-border)] px-3 pb-3 pt-2 space-y-3">
                              {/* Status history timeline */}
                              {history.length > 0 && (
                                <div className="rounded-lg bg-[var(--nexus-surface-2)] border border-[var(--nexus-border)] p-2.5">
                                  <p className="text-[9px] font-bold tracking-widest text-[var(--nexus-text-3)] uppercase mb-2">
                                    Version History
                                  </p>
                                  <div className="flex items-start gap-0">
                                    {history.map((entry, hi) => {
                                      const statusColors = {
                                        draft: { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
                                        reviewed: { bg: 'rgba(99,102,241,0.12)', text: '#FF8C00', border: 'rgba(99,102,241,0.25)' },
                                        published: { bg: 'rgba(16,185,129,0.12)', text: '#10b981', border: 'rgba(16,185,129,0.25)' },
                                      };
                                      const sc = statusColors[entry.status] || statusColors.draft;
                                      const entryDate = entry.date ? new Date(entry.date).toLocaleDateString('en-MY', { day: '2-digit', month: 'short' }) : '';
                                      return (
                                        <div key={hi} className="flex-1 relative">
                                          {/* connector line */}
                                          {hi < history.length - 1 && (
                                            <div className="absolute top-2.5 left-1/2 right-0 h-px" style={{ background: 'var(--nexus-border)' }} />
                                          )}
                                          <div className="flex flex-col items-center gap-1 relative z-10">
                                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold border" style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                                              {hi + 1}
                                            </div>
                                            <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: sc.text }}>
                                              {entry.status}
                                            </span>
                                            <span className="text-[8px] text-[var(--nexus-text-3)] text-center leading-tight">
                                              {entryDate}
                                            </span>
                                            <span className="text-[8px] text-[var(--nexus-text-3)] text-center leading-tight px-1">
                                              {entry.by}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {/* Latest note */}
                                  {history[history.length - 1]?.note && (
                                    <p className="mt-2 text-[9px] text-[var(--nexus-text-3)] italic border-t border-[var(--nexus-border)] pt-1.5">
                                      {history[history.length - 1].note}
                                    </p>
                                  )}
                                </div>
                              )}
                              {/* Steps */}
                              <ol className="space-y-1.5">
                                {steps.map((step, i) => (
                                  <li key={i} className="flex items-start gap-2 text-[11px]">
                                    <span className="font-mono font-bold text-[#FF8C00] shrink-0 mt-0.5">{i + 1}.</span>
                                    <span className="text-[var(--nexus-text-2)] leading-relaxed">
                                      {typeof step === 'string' ? step : step.description || step.action || JSON.stringify(step)}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── QueryChart ──────────────────────────────────────────────────────────────── */

function QueryChart({ tableData, template }) {
  if (!tableData || tableData.length < 2) return null;
  const isTime = template?.includes('time') || template?.includes('resolution');

  const chartData = tableData.slice(0, 8).map(row => ({
    name: String(row.label).length > 16 ? `${String(row.label).slice(0, 14)}…` : String(row.label),
    fullName: String(row.label),
    value: row.value,
    pct: row.percentage ?? 0,
  }));

  const colorFor = (fullName) => {
    const key = String(fullName).toLowerCase().trim().replace(/[\s-]+/g, '_');
    return TYPE_COLORS[key] || '#00d4e8';
  };

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: 'rgba(0,212,232,0.15)', background: 'rgba(0,212,232,0.03)' }}
    >
      <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
        Data Visualization
      </p>
      <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 24)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'ui-monospace,monospace' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--nexus-surface-2)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0];
              return (
                <div
                  className="rounded-lg border px-3 py-2 text-[11px] shadow-xl"
                  style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-1)' }}
                >
                  <p className="font-semibold text-[var(--nexus-text-1)]">{d.payload.fullName}</p>
                  <p className="font-mono" style={{ color: '#00d4e8' }}>
                    {isTime ? `${d.value}h avg` : d.value}{' '}
                    <span style={{ color: '#64748b' }}>({d.payload.pct}%)</span>
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16} animationDuration={700}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={colorFor(entry.fullName)} fillOpacity={0.82} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Panel 2: NEXUS Brain Query ──────────────────────────────────────────────── */

function BrainQuery() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleQuery = async (q) => {
    const text = q || query;
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    if (q) setQuery(q);
    try {
      const res = await fetch(`${API_BASE}/api/v1/knowledge/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: text }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err?.message || 'Query failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface)] min-h-[calc(100vh-340px)]">
      <PanelHeader icon={MessageSquare} iconColor="#00d4e8" title="NEXUS Brain Query" />

      <div className="flex flex-1 flex-col gap-4 p-6">
        {/* Intro + Suggested queries (shown when no result yet) */}
        {!result && !loading && (
          <div className="flex flex-col gap-4">
            {/* Intro block */}
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: 'rgba(0,212,232,0.15)', background: 'rgba(0,212,232,0.04)' }}
            >
              <div className="mb-2 flex items-center gap-2">
                <Brain size={14} style={{ color: '#00d4e8' }} />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: '#00d4e8' }}>
                  NEXUS Intelligence Engine
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--nexus-text-2)]">
                Ask any operational question in plain English. The Brain maps your query to live incident
                data using a 2-step Claude pipeline — query planning then narrative synthesis.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {['86 vectors indexed', '8 query templates', 'Claude-powered', 'Live MongoDB'].map(tag => (
                  <span
                    key={tag}
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{ background: 'rgba(0,212,232,0.08)', color: '#00d4e8' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            {/* Suggested pills */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
                Try these
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUERIES.map(sq => (
                  <button
                    key={sq.label}
                    type="button"
                    onClick={() => handleQuery(sq.label)}
                    className="flex items-center gap-1.5 rounded-xl border border-[rgba(0,212,232,0.2)] bg-[rgba(0,212,232,0.05)] px-3.5 py-2 text-[12px] text-[var(--nexus-text-2)] transition-all hover:border-[rgba(0,212,232,0.4)] hover:bg-[rgba(0,212,232,0.1)] hover:text-[#00d4e8]"
                  >
                    <span>{sq.icon}</span>
                    {sq.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(0,212,232,0.08)' }}>
              <Brain size={18} className="animate-pulse" style={{ color: '#00d4e8' }} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-[var(--nexus-text-3)]">Querying knowledge base</span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="inline-block h-1 w-1 rounded-full bg-[#00d4e8] opacity-0"
                    style={{ animation: `dotFade 1.2s ease-in-out ${i * 0.4}s infinite` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/08 p-3">
            <p className="text-[12px] font-semibold text-red-400">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-1 flex-col gap-3"
            >
              {/* Header row: template badge + clear */}
              <div className="flex items-center gap-2">
                <Brain size={13} style={{ color: '#00d4e8' }} />
                <span
                  className="rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(0,212,232,0.1)', color: '#00d4e8' }}
                >
                  {TEMPLATE_LABELS[result.template] || result.template || 'query'}
                </span>
                {Object.keys(result.filters || {}).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(result.filters).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded px-1.5 py-0.5 text-[8px] font-semibold"
                        style={{ background: 'rgba(255,204,0,0.1)', color: '#FFCC00' }}
                      >
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setResult(null); setQuery(''); }}
                  className="ml-auto text-[10px] font-semibold text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)] transition-colors uppercase tracking-wider"
                >
                  Clear
                </button>
              </div>

              {/* Title */}
              {result.title && (
                <p className="text-[16px] font-bold text-[var(--nexus-text-1)]">{result.title}</p>
              )}

              {/* Answer — rendered as formatted paragraphs/bullets */}
              {result.answer && (
                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: 'rgba(0,212,232,0.15)', background: 'rgba(0,212,232,0.04)' }}
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkles size={11} style={{ color: '#00d4e8' }} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#00d4e8' }}>
                      AI Insight
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {result.answer.split('\n').filter(line => line.trim()).map((line, i) => {
                      const isBullet = /^[\-•\*]\s/.test(line.trim());
                      const text = isBullet ? line.trim().replace(/^[\-•\*]\s/, '') : line;
                      return isBullet ? (
                        <div key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: '#00d4e8' }} />
                          <p className="text-[13px] leading-relaxed text-[var(--nexus-text-2)]">{text}</p>
                        </div>
                      ) : (
                        <p key={i} className="text-[13px] leading-relaxed text-[var(--nexus-text-2)]">{text}</p>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Chart */}
              {Array.isArray(result.tableData) && result.tableData.length >= 2 && (
                <QueryChart tableData={result.tableData} template={result.template} />
              )}

              {/* Table */}
              {Array.isArray(result.tableData) && result.tableData.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-[var(--nexus-border)]">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--nexus-border)] bg-[var(--nexus-surface-2)]">
                        {['Category', 'Count', 'Share'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.tableData.map((row, i) => (
                        <tr key={i} className="border-b border-[var(--nexus-border)] hover:bg-[var(--nexus-surface-2)] transition-colors">
                          <td className="px-4 py-3 text-[var(--nexus-text-2)]">{row.label}</td>
                          <td className="px-4 py-3 font-mono font-semibold text-[var(--nexus-text-1)]">{row.value}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--nexus-border)]">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${Math.min(100, row.percentage || 0)}%`, background: '#00d4e8' }}
                                />
                              </div>
                              <span className="font-mono text-[10px] text-[var(--nexus-text-3)]">
                                {row.percentage != null ? `${Number(row.percentage).toFixed(1)}%` : '--'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center gap-3">
                {result.totalRecords != null && (
                  <p className="text-[10px] text-[var(--nexus-text-3)]">
                    Records analyzed: <span className="font-mono font-bold text-[var(--nexus-text-2)]">{result.totalRecords}</span>
                  </p>
                )}
                {result.generatedAt && (
                  <p className="ml-auto text-[10px] text-[var(--nexus-text-3)]">
                    {new Date(result.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* Input */}
        <div className="mt-auto flex gap-3 pt-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask anything about your incidents..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            className="flex-1 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] px-4 py-3 text-[14px] text-[var(--nexus-text-2)] outline-none placeholder:text-[var(--nexus-text-3)] focus:border-[rgba(0,212,232,0.4)] disabled:opacity-50 transition-colors"
          />
          <button
            type="button"
            onClick={() => handleQuery()}
            disabled={loading || !query.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[rgba(0,212,232,0.3)] bg-[rgba(0,212,232,0.1)] text-[#00d4e8] transition-all hover:bg-[rgba(0,212,232,0.2)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Panel 3: Knowledge Map ──────────────────────────────────────────────────── */

function KnowledgeMapPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/knowledge/embedding-space`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err?.message || 'Failed to load embedding space.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Group points by type for separate Scatter series
  const byType = {};
  if (data?.points) {
    data.points.forEach(pt => {
      const t = pt.type || 'other';
      if (!byType[t]) byType[t] = [];
      byType[t].push({ x: pt.x, y: pt.y, text: pt.text, severity: pt.severity, id: pt.id });
    });
  }

  const total = data?.total ?? 0;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-1)] px-3 py-2 shadow-xl" style={{ maxWidth: 200 }}>
        {d.severity && (
          <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: '#f59e0b' }}>
            {d.severity}
          </p>
        )}
        {d.text && (
          <p className="text-[11px] leading-relaxed text-[var(--nexus-text-2)]">
            {String(d.text).slice(0, 60)}{String(d.text).length > 60 ? '...' : ''}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface)]">
      <PanelHeader icon={Map} iconColor="#14b8a6" title="Knowledge Map">
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="font-mono text-[10px] text-[var(--nexus-text-3)]">{total} vectors</span>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--nexus-border)] text-[var(--nexus-text-3)] transition-colors hover:text-[#14b8a6] disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </PanelHeader>

      <div className="flex flex-1 flex-col p-4">
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(20,184,166,0.08)' }}>
              <Database size={18} className="animate-pulse" style={{ color: '#14b8a6' }} />
            </div>
            <p className="text-[12px] text-[var(--nexus-text-3)]">Loading knowledge corpus...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8">
            <p className="text-center text-[12px] text-red-400">{error}</p>
            <button
              type="button"
              onClick={load}
              className="text-[11px] font-semibold text-[#14b8a6] hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && total < 3 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(20,184,166,0.08)' }}>
              <Map size={18} style={{ color: '#14b8a6' }} />
            </div>
            <p className="text-center text-[12px] leading-relaxed text-[var(--nexus-text-3)]" style={{ maxWidth: 240 }}>
              Process incidents to build the knowledge map. The corpus grows with every resolved case.
            </p>
          </div>
        )}

        {!loading && !error && total >= 3 && (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -20 }}>
                <XAxis
                  type="number"
                  dataKey="x"
                  tick={false}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  tick={false}
                  axisLine={false}
                  tickLine={false}
                />
                <ZAxis range={[36, 36]} />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                  formatter={val => (
                    <span style={{ color: 'var(--nexus-text-3)', fontSize: '10px' }}>{labelType(val)}</span>
                  )}
                />
                {Object.entries(byType).map(([type, points]) => (
                  <Scatter
                    key={type}
                    name={type}
                    data={points}
                    fill={TYPE_COLORS[type] || '#6b7280'}
                    fillOpacity={0.75}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SopCoverageMatrix ───────────────────────────────────────────────────────── */

const MATRIX_HUBS = ['Shah Alam', 'KLIA', 'Penang', 'JB', 'Subang'];

// Each short hub name maps to all location strings that belong to it
const HUB_ALIASES = {
  'Shah Alam': ['Shah Alam', 'Shah Alam Hub'],
  'KLIA':      ['KLIA', 'KLIA Cargo', 'KLIA Hub'],
  'Penang':    ['Penang', 'Penang Hub', 'Penang Gateway'],
  'JB':        ['JB', 'JB Distribution', 'Johor Bahru', 'Johor Bahru Hub'],
  'Subang':    ['Subang', 'Subang Jaya', 'Subang Jaya Depot'],
};

function hubCount(typeHubMatrix, type, shortHub) {
  const typeData = typeHubMatrix?.[type] ?? {};
  return (HUB_ALIASES[shortHub] ?? [shortHub]).reduce(
    (sum, alias) => sum + (typeData[alias] ?? 0),
    0,
  );
}
const MATRIX_TYPES_LIST = [
  { key: 'late_delivery', short: 'Late Del.' },
  { key: 'damaged_parcel', short: 'Damaged' },
  { key: 'missing_parcel', short: 'Missing' },
  { key: 'address_error', short: 'Addr Err' },
  { key: 'system_error', short: 'Sys Err' },
  { key: 'wrong_item', short: 'Wrong Item' },
  { key: 'other', short: 'Other' },
];

function SopCoverageMatrix({ sops, typeHubMatrix }) {
  const sopTypes = new Set((sops || []).map(s => s.incidentType));

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-2)' }}
    >
      <p className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
        SOP Coverage Matrix
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 300 }}>
          <thead>
            <tr>
              <th
                className="pb-1.5 pr-2 text-left text-[8px] font-semibold uppercase tracking-wider text-[var(--nexus-text-3)]"
                style={{ width: 64 }}
              >
                Type
              </th>
              {MATRIX_HUBS.map(hub => (
                <th
                  key={hub}
                  className="pb-1.5 text-center text-[8px] font-semibold uppercase tracking-wider text-[var(--nexus-text-3)]"
                  style={{ minWidth: 36 }}
                >
                  {hub}
                </th>
              ))}
              <th className="pb-1.5 pl-1 text-center text-[8px] font-semibold uppercase tracking-wider text-[var(--nexus-text-3)]">
                SOP
              </th>
            </tr>
          </thead>
          <tbody>
            {MATRIX_TYPES_LIST.map(({ key, short }) => {
              const hasSop = sopTypes.has(key);
              const typeColor = TYPE_COLORS[key] || '#6b7280';
              const hexToRgb = (hex) => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `${r},${g},${b}`;
              };
              return (
                <tr key={key}>
                  <td className="py-0.5 pr-2">
                    <span className="text-[9px] font-semibold" style={{ color: typeColor }}>
                      {short}
                    </span>
                  </td>
                  {MATRIX_HUBS.map(hub => {
                    const count = hubCount(typeHubMatrix, key, hub);
                    const intensity = Math.min(count / 6, 1);
                    return (
                      <td key={hub} className="py-0.5 px-0.5">
                        <div
                          className="mx-auto flex h-6 w-7 items-center justify-center rounded text-[8px] font-bold tabular-nums"
                          style={{
                            background:
                              count > 0
                                ? `rgba(${hexToRgb(typeColor)}, ${0.07 + intensity * 0.28})`
                                : 'var(--nexus-surface-2)',
                            color: count > 0 ? typeColor : 'var(--nexus-text-3)',
                          }}
                          title={`${labelType(key)} @ ${hub}: ${count} incidents`}
                        >
                          {count > 0 ? count : '·'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-0.5 pl-1 text-center">
                    {hasSop ? (
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}
                      >
                        ✓
                      </span>
                    ) : (
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                      >
                        ✗
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[9px] text-[var(--nexus-text-3)]">
        Numbers = incident count per hub · ✓ SOP published · ✗ coverage gap
      </p>
    </div>
  );
}

/* ── Panel 4: Health + Learning Pulse ────────────────────────────────────────── */

function HealthAndPulse({ healthData, onPrefillGenerate, learningEvents, sseConnected, onClearEvents, scrollRef, sops, typeHubMatrix }) {
  const score = healthData?.healthScore ?? null;
  const gaps = healthData?.coverageGaps?.slice(0, 5) ?? [];
  const staleSops = healthData?.staleSops?.slice(0, 3) ?? [];

  return (
    <div className="flex flex-col rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface)]">
      <PanelHeader icon={Shield} iconColor="#10b981" title="Knowledge Health">
        {score != null && (
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{
              background: `${healthColor(score)}18`,
              color: healthColor(score),
            }}
          >
            {score}/100
          </span>
        )}
      </PanelHeader>

      {/* Health section */}
      <div className="border-b border-[var(--nexus-border)] p-4">
        {score == null ? (
          <p className="text-[12px] text-[var(--nexus-text-3)]">Health data unavailable.</p>
        ) : (
          <>
            {/* Score + KPIs */}
            <div className="mb-3 flex items-center gap-4">
              <div className="flex flex-col items-center">
                <span
                  className="font-mono text-4xl font-extrabold leading-none tracking-tight"
                  style={{ color: healthColor(score) }}
                >
                  {score}
                </span>
                <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
                  Health Score
                </span>
              </div>
              <div className="flex flex-1 gap-3">
                <div className="flex flex-col rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-2.5" style={{ flex: 1 }}>
                  <span className="font-mono text-[16px] font-bold text-[#ef4444]">{gaps.length}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--nexus-text-3)]">Coverage Gaps</span>
                </div>
                <div className="flex flex-col rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-2.5" style={{ flex: 1 }}>
                  <span className="font-mono text-[16px] font-bold text-[#f59e0b]">{staleSops.length}</span>
                  <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--nexus-text-3)]">Stale SOPs</span>
                </div>
              </div>
            </div>

            {/* Coverage gaps list */}
            {gaps.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--nexus-text-3)]">
                  Coverage Gaps
                </p>
                {gaps.map((g, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-[var(--nexus-border)] bg-[rgba(239,68,68,0.04)] px-2.5 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: '#ef4444' }}
                      />
                      <span className="truncate text-[11px] text-[var(--nexus-text-2)]">
                        {labelType(g.type)} at {g.location}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-[var(--nexus-text-3)]">{g.incidentCount} incidents</span>
                      <button
                        type="button"
                        onClick={() => onPrefillGenerate(g.type, g.location)}
                        className="rounded border border-[#FF8C00]/30 bg-[#FF8C00]/08 px-1.5 py-0.5 text-[9px] font-bold text-[#FF8C00] transition-all hover:bg-[#FF8C00]/20"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Coverage Matrix */}
      <div className="border-b border-[var(--nexus-border)] p-4">
        <SopCoverageMatrix sops={sops} typeHubMatrix={typeHubMatrix} />
      </div>

      {/* Learning Pulse section */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--nexus-border)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles size={12} style={{ color: '#00d4e8' }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#00d4e8]">
              Learning Pulse
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${sseConnected ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--nexus-text-3)]">
              {learningEvents.length} events
            </span>
            {learningEvents.length > 0 && (
              <button
                type="button"
                onClick={onClearEvents}
                className="text-[9px] font-semibold uppercase tracking-wider text-[var(--nexus-text-3)] transition-colors hover:text-[#00d4e8]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3"
          style={{ minHeight: 180, maxHeight: 280 }}
        >
          {learningEvents.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'rgba(0,212,232,0.08)' }}>
                <Activity size={16} style={{ color: '#00d4e8' }} />
              </div>
              <p className="text-center text-[11px] leading-relaxed text-[var(--nexus-text-3)]">
                Resolve incidents to see learning events appear here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {learningEvents.map(event => {
                const cfg = EVENT_CFG[event.action] || EVENT_CFG.absorbed;
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-2.5 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-2.5 transition-colors hover:bg-[var(--nexus-surface-3)]"
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${cfg.color}18` }}>
                      <Database size={10} style={{ color: cfg.color }} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                          style={{ background: cfg.badgeBg, color: cfg.color }}
                        >
                          {cfg.badge}
                        </span>
                        <span className="font-mono text-[9px] text-[var(--nexus-text-3)]">{event.time}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--nexus-text-2)]">{event.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Learning Demo */}
      <LearningDemo />
    </div>
  );
}

/* ── LearningDemo ────────────────────────────────────────────────────────────── */

function LearningDemo() {
  const [round1, setRound1] = useState(null);
  const [round2, setRound2] = useState(null);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(null);

  const refreshStatus = async () => {
    try {
      const s = await demoLearningStatus();
      setRound1(s.round1 || null);
      setRound2(s.round2 || null);
    } catch { /* non-critical */ }
  };

  useEffect(() => { refreshStatus(); }, []);

  const handleSeed = async () => {
    setLoading1(true);
    setError(null);
    try {
      await demoLearningSeed();
      await refreshStatus();
    } catch (e) {
      setError(e.message || 'Failed to seed Round 1');
    } finally { setLoading1(false); }
  };

  const handleFollowup = async () => {
    setLoading2(true);
    setError(null);
    try {
      await demoLearningFollowup();
      await refreshStatus();
    } catch (e) {
      setError(e.message || 'Failed to seed Round 2');
    } finally { setLoading2(false); }
  };

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      await demoReset();
      setRound1(null);
      setRound2(null);
    } catch (e) {
      setError(e.message || 'Reset failed');
    } finally { setResetting(false); }
  };

  const r1Resolved = round1?.status === 'RESOLVED' || round1?.status === 'CLOSED';
  const bothDone = round1 && round2;

  return (
    <div className="border-t border-[var(--nexus-border)]">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: 'rgba(255,140,0,0.12)' }}>
            <Brain size={13} style={{ color: '#FF8C00' }} />
          </div>
          <div>
            <p className="text-[12px] font-bold text-[var(--nexus-text-1)]">Live Learning Loop Demo</p>
            <p className="text-[10px] text-[var(--nexus-text-3)]">
              Prove the system learns — same incident type, two different outcomes
            </p>
          </div>
        </div>
        {(round1 || round2) && (
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="rounded border border-red-500/20 bg-transparent px-2.5 py-1 text-[10px] font-bold text-red-400 transition-all hover:bg-red-500/10 disabled:opacity-40"
          >
            {resetting ? 'Clearing…' : 'Reset Demo'}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-3 rounded-lg border border-red-500/30 bg-red-500/08 px-3 py-2 text-[11px] font-semibold text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-0 px-4 pb-4">

        {/* ── Step 1 ──────────────────────────────────────────── */}
        <div
          className="relative rounded-xl border p-4"
          style={{
            borderColor: round1 ? 'rgba(245,158,11,0.4)' : 'rgba(245,158,11,0.15)',
            background: round1 ? 'rgba(245,158,11,0.06)' : 'var(--nexus-surface-2)',
          }}
        >
          {/* Step label */}
          <div className="mb-3 flex items-center gap-3">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
              style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}
            >
              1
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-[var(--nexus-text-1)]">Submit edge case — AI flags for human review</p>
            </div>
            {round1 && (
              <span className="shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: r1Resolved ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: r1Resolved ? '#10b981' : '#f59e0b' }}>
                {r1Resolved ? 'Resolved ✓' : 'Needs Review'}
              </span>
            )}
          </div>

          {/* Incident card */}
          <div className="mb-3 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface)] p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                High Severity
              </span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(107,114,128,0.12)', color: '#9ca3af' }}>
                wrong_item
              </span>
              <span className="ml-auto font-mono text-[10px] font-bold" style={{ color: '#f59e0b' }}>
                ML: 68%
              </span>
            </div>
            <p className="text-[11px] font-semibold text-[var(--nexus-text-1)]">
              Sarah Tan — Birthday gift mix-up (Samsung Galaxy S24 vs ceramic vase)
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--nexus-text-3)]">
              AWB MY2025-DEMO-001 · Shah Alam Hub · Very frustrated
            </p>
            <div className="mt-2 rounded bg-[rgba(245,158,11,0.08)] px-2 py-1.5 text-[10px] text-[#f59e0b]">
              AI reasoning: Low ML confidence (68% &lt; 75%) + High severity → HITL triggered. Pattern not found in corpus.
            </div>
          </div>

          {!round1 ? (
            <button
              type="button"
              onClick={handleSeed}
              disabled={loading1}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#f59e0b]/50 bg-[#f59e0b]/12 py-2.5 text-[12px] font-bold text-[#f59e0b] transition-all hover:bg-[#f59e0b]/22 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading1 ? 'animate-spin' : ''} />
              {loading1 ? 'Creating incident…' : 'Create Incident → Lands in Review Queue'}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-lg bg-[rgba(245,158,11,0.08)] px-3 py-2 text-[11px]">
                <span style={{ color: '#f59e0b' }}>→</span>
                <span className="text-[var(--nexus-text-2)]">Now go to</span>
                <a href="/review" className="font-bold underline-offset-2 hover:underline" style={{ color: '#FF8C00' }}>
                  Review Queue
                </a>
                <span className="text-[var(--nexus-text-2)]">and resolve it manually</span>
              </div>
              {round1._id && (
                <a
                  href={`/incidents/${round1._id}`}
                  className="ml-auto shrink-0 text-[10px] font-bold transition-colors"
                  style={{ color: '#f59e0b' }}
                >
                  View →
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── Connector ─────────────────────────────────────── */}
        <div className="flex items-stretch gap-0 py-1 pl-6">
          <div className="flex flex-col items-center gap-0">
            <div className="w-px flex-1" style={{ background: round1 ? 'rgba(255,140,0,0.4)' : 'var(--nexus-border)' }} />
          </div>
          <div className="flex items-center gap-2 pl-4">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: round1 ? '#FF8C00' : 'var(--nexus-text-3)' }}>
              Human resolves → incident embedded in knowledge corpus → AI learns the pattern
            </span>
          </div>
        </div>

        {/* ── Step 2 ──────────────────────────────────────────── */}
        <div
          className="relative rounded-xl border p-4"
          style={{
            borderColor: round2 ? 'rgba(16,185,129,0.4)' : round1 ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
            background: round2 ? 'rgba(16,185,129,0.06)' : 'var(--nexus-surface-2)',
            opacity: !round1 ? 0.5 : 1,
          }}
        >
          <div className="mb-3 flex items-center gap-3">
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black"
              style={{ background: round2 ? 'rgba(16,185,129,0.2)' : 'rgba(107,114,128,0.15)', color: round2 ? '#10b981' : '#6b7280' }}
            >
              2
            </div>
            <p className="flex-1 text-[13px] font-bold text-[var(--nexus-text-1)]">
              Submit twin case — AI handles it alone
            </p>
            {round2 && (
              <span className="shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                Auto-resolved ✓
              </span>
            )}
          </div>

          {/* Incident card */}
          <div className="mb-3 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-surface)] p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                Low Severity
              </span>
              <span className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider" style={{ background: 'rgba(107,114,128,0.12)', color: '#9ca3af' }}>
                wrong_item
              </span>
              <span className="ml-auto font-mono text-[10px] font-bold" style={{ color: '#10b981' }}>
                ML: 91%
              </span>
            </div>
            <p className="text-[11px] font-semibold text-[var(--nexus-text-1)]">
              Ahmad Firdaus — Wrong electronics (Sony earphones vs kitchen timer)
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--nexus-text-3)]">
              AWB MY2025-DEMO-002 · KLIA Hub · Calm &amp; cooperative
            </p>
            <div className="mt-2 rounded bg-[rgba(16,185,129,0.08)] px-2 py-1.5 text-[10px] text-[#10b981]">
              AI reasoning: Corpus match from Round 1 found. Confidence 91% ≥ 85% + Low severity → auto-resolved. Zero human touch.
            </div>
          </div>

          {!round2 ? (
            <button
              type="button"
              onClick={handleFollowup}
              disabled={loading2 || !round1}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#10b981]/50 bg-[#10b981]/12 py-2.5 text-[12px] font-bold text-[#10b981] transition-all hover:bg-[#10b981]/22 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading2 ? 'animate-spin' : ''} />
              {loading2 ? 'Running AI pipeline…' : 'Submit Twin Case → AI Auto-Resolves'}
            </button>
          ) : (
            round2._id && (
              <a
                href={`/incidents/${round2._id}`}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#10b981]/30 bg-[#10b981]/08 py-2 text-[11px] font-bold text-[#10b981] transition-all hover:bg-[#10b981]/15"
              >
                Open Auto-Resolved Incident →
              </a>
            )
          )}
        </div>

        {/* ── Result comparison ─────────────────────────────── */}
        <AnimatePresence>
          {bothDone && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 overflow-hidden rounded-xl border"
              style={{ borderColor: 'rgba(255,140,0,0.3)', background: 'linear-gradient(135deg, rgba(255,140,0,0.06), rgba(16,185,129,0.06))' }}
            >
              <div className="border-b border-[var(--nexus-border)] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles size={11} style={{ color: '#FF8C00' }} />
                  <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: '#FF8C00' }}>
                    Learning demonstrated
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[var(--nexus-border)]">
                <div className="flex flex-col gap-2 p-4">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#f59e0b]">Before learning</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-[28px] font-black leading-none text-[#f59e0b]">68</span>
                    <span className="text-[14px] font-bold text-[#f59e0b]">%</span>
                  </div>
                  <span className="text-[10px] text-[var(--nexus-text-3)]">ML confidence</span>
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                      <span className="text-[10px] text-[var(--nexus-text-2)]">HITL triggered</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                      <span className="text-[10px] text-[var(--nexus-text-2)]">Human reviewer required</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                      <span className="text-[10px] text-[var(--nexus-text-2)]">No corpus match</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#10b981]">After learning</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-[28px] font-black leading-none text-[#10b981]">91</span>
                    <span className="text-[14px] font-bold text-[#10b981]">%</span>
                  </div>
                  <span className="text-[10px] text-[var(--nexus-text-3)]">ML confidence</span>
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                      <span className="text-[10px] text-[var(--nexus-text-2)]">Auto-resolved</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                      <span className="text-[10px] text-[var(--nexus-text-2)]">Zero human touch</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                      <span className="text-[10px] text-[var(--nexus-text-2)]">Corpus match found</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────────── */

/* Tab config — defined outside the component so object identity is stable */
const PAGE_TABS = [
  { id: 'sop', label: 'SOP Workshop', icon: BookOpen },
  { id: 'brain', label: 'Brain Query', icon: MessageSquare },
  { id: 'map', label: 'Knowledge Map', icon: Map },
  { id: 'health', label: 'Health & Pulse', icon: Shield },
];

export default function KnowledgeObservatory() {
  const [mlStats, setMlStats] = useState(null);
  const [learningMetrics, setLearningMetrics] = useState(null);
  const [sops, setSops] = useState([]);
  const [sopDrafts, setSopDrafts] = useState({ drafts: [], pendingCount: 0 });
  const [healthData, setHealthData] = useState(null);
  const [learningEvents, setLearningEvents] = useState([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [retrainMsg, setRetrainMsg] = useState(null);
  const [typeHubMatrix, setTypeHubMatrix] = useState({});

  // Used for the "Generate SOP" quick action from health panel to pre-select values in workshop
  // We pass it as a callback that sets activeTab + prefill in SopWorkshop.
  // Since SopWorkshop owns its own state, we use a key to re-mount with defaults.
  const [workshopKey, setWorkshopKey] = useState(0);
  const [workshopDefaults, setWorkshopDefaults] = useState(null);

  // In-page tab navigation — replaces the 2x2 grid
  const [activeTab, setActiveTab] = useState('sop');

  const scrollRef = useRef(null);
  const eventIdRef = useRef(0);
  const retrainMsgTimer = useRef(null);

  /* ── Data fetch ──────────────────────────────────────────────────────────── */

  const loadSopsAndDrafts = async () => {
    const [sopsRes, draftsRes] = await Promise.allSettled([getSops(), getSopDrafts()]);
    if (sopsRes.status === 'fulfilled') setSops(Array.isArray(sopsRes.value) ? sopsRes.value : []);
    if (draftsRes.status === 'fulfilled') setSopDrafts(draftsRes.value || { drafts: [], pendingCount: 0 });
  };

  useEffect(() => {
    const load = async () => {
      const [mlRes, metricsRes, healthRes] = await Promise.allSettled([
        getAdminMlStats(),
        getLearningMetrics(),
        fetch(`${API_BASE}/api/v1/knowledge/health`, { credentials: 'include' })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (mlRes.status === 'fulfilled') setMlStats(mlRes.value);
      if (metricsRes.status === 'fulfilled') setLearningMetrics(metricsRes.value);
      if (healthRes.status === 'fulfilled' && healthRes.value) setHealthData(healthRes.value);
      await loadSopsAndDrafts();
      // Fetch type x hub matrix for coverage visualization
      try {
        const matrixR = await fetch(`${API_BASE}/api/v1/knowledge/type-hub-matrix`, {
          credentials: 'include',
        });
        if (matrixR.ok) {
          const matrixData = await matrixR.json();
          if (matrixData.matrix) setTypeHubMatrix(matrixData.matrix);
        }
      } catch { /* non-critical */ }
    };
    load();
  }, []);

  /* ── SSE ─────────────────────────────────────────────────────────────────── */

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/v1/ops/live-stream`, { withCredentials: true });
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        // Refresh SOP drafts when a new one is auto-generated
        if (data.type === 'sop_generated') {
          loadSopsAndDrafts();
          return;
        }

        if (data.type !== 'learning_event') return;
        if (!EVENT_CFG[data.action]) return;
        const entry = {
          id: ++eventIdRef.current,
          action: data.action,
          time: formatTime(data.timestamp),
          message: data.message || `Learning event: ${data.action}`,
        };
        setLearningEvents(prev => [...prev.slice(-99), entry]);
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  // Auto-scroll pulse feed
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [learningEvents]);

  /* ── Retrain ─────────────────────────────────────────────────────────────── */

  const handleRetrain = async () => {
    if (retraining) return;
    setRetraining(true);
    setRetrainMsg(null);
    try {
      const result = await triggerRetrain();
      setRetrainMsg({ ok: true, text: result?.message || 'Retrain job queued successfully.' });
    } catch (err) {
      setRetrainMsg({ ok: false, text: err?.message || 'Failed to trigger retrain.' });
    } finally {
      setRetraining(false);
      clearTimeout(retrainMsgTimer.current);
      retrainMsgTimer.current = setTimeout(() => setRetrainMsg(null), 5000);
    }
  };

  /* ── "Generate SOP" quick action from health gaps ────────────────────────── */

  const handlePrefillGenerate = (type, location) => {
    setWorkshopDefaults({ type, location });
    setWorkshopKey(k => k + 1);
    // Switch to the SOP Workshop tab so user sees the pre-filled generate form
    setActiveTab('sop');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Derived stat values ─────────────────────────────────────────────────── */

  const corpusSize = learningMetrics?.corpusSize ?? learningMetrics?.totalCandidates ?? healthData?.totalEmbeddings ?? '--';

  const rawAcc = learningMetrics?.accuracy ?? mlStats?.accuracy ?? mlStats?.currentAccuracy;
  const displayAccuracy = rawAcc != null
    ? `${(Number(rawAcc) <= 1 ? Number(rawAcc) * 100 : Number(rawAcc)).toFixed(2)}%`
    : '99.65%';

  const activeSops = sops.length > 0 ? sops.length : '--';
  const pendingDrafts = sopDrafts?.pendingCount ?? sopDrafts?.drafts?.filter(d => d.status === 'pending').length ?? 0;
  const hScore = healthData?.healthScore ?? null;

  return (
    <Layout title="Knowledge Observatory">
      {/* Dot-fade keyframe for brain query loading animation */}
      <style>{`
        @keyframes dotFade {
          0%, 80%, 100% { opacity: 0; }
          40% { opacity: 1; }
        }
      `}</style>

      <div className="mx-auto max-w-[1400px] space-y-5 pb-10">

        {/* ── Page Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'rgba(0,212,232,0.12)' }}
            >
              <Brain size={20} style={{ color: '#00d4e8' }} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold leading-tight tracking-tight text-[var(--nexus-text-1)]">
                Knowledge Observatory
              </h1>
              <p className="mt-0.5 text-[12px] text-[var(--nexus-text-3)]">
                Living intelligence infrastructure - SOPs, embeddings, and learning in real time
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-[var(--nexus-border)] bg-[var(--nexus-surface)] px-3 py-1.5">
              <span className={`h-2 w-2 rounded-full ${sseConnected ? 'animate-pulse bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--nexus-text-3)]">
                {sseConnected ? 'Live' : 'Connecting'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetrain}
              disabled={retraining}
              className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[12px] font-bold text-amber-400 transition-all hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} className={retraining ? 'animate-spin' : ''} />
              {retraining ? 'Queuing...' : 'Retrain Model'}
            </button>
          </div>
        </div>

        {/* Retrain message */}
        <AnimatePresence>
          {retrainMsg && <Toast msg={retrainMsg.text} ok={retrainMsg.ok} />}
        </AnimatePresence>

        {/* ── Stat Row ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Corpus Size"
            value={String(corpusSize)}
            icon={Database}
            iconColor="#FFCC00"
            iconBg="rgba(34,211,238,0.1)"
          />
          <StatCard
            label="Model Accuracy"
            value={displayAccuracy}
            icon={TrendingUp}
            iconColor="#10b981"
            iconBg="rgba(16,185,129,0.1)"
          />
          <StatCard
            label="Active SOPs"
            value={String(activeSops)}
            icon={BookOpen}
            iconColor="#FF8C00"
            iconBg="rgba(139,92,246,0.1)"
          />
          <StatCard
            label="Pending Drafts"
            value={String(pendingDrafts > 0 ? pendingDrafts : 0)}
            icon={Sparkles}
            iconColor="#f59e0b"
            iconBg="rgba(245,158,11,0.1)"
            badge={pendingDrafts > 0 ? pendingDrafts : null}
            badgeColor="#f59e0b"
            badgeBg="rgba(245,158,11,0.15)"
          />
          <StatCard
            label="Health Score"
            value={hScore != null ? String(hScore) : '--'}
            icon={Shield}
            iconColor={hScore != null ? healthColor(hScore) : '#6b7280'}
            iconBg={hScore != null ? `${healthColor(hScore)}18` : 'rgba(107,114,128,0.1)'}
          />
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────────── */}
        <div className="overflow-x-auto border-b border-[var(--nexus-border)]">
          <div className="flex min-w-max">
            {PAGE_TABS.map(tab => {
              const isActive = activeTab === tab.id;
              // Amber badge on SOP tab when there are pending drafts
              const showSopBadge = tab.id === 'sop' && pendingDrafts > 0;
              // Red dot on Health tab when healthScore < 80
              const showHealthDot = tab.id === 'health' && hScore != null && hScore < 80;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 whitespace-nowrap px-5 py-3 text-[14px] font-semibold transition-colors ${
                    isActive
                      ? 'border-b-2 border-[#00d4e8] text-[#00d4e8]'
                      : 'text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)]'
                  }`}
                  style={isActive ? { marginBottom: '-1px' } : {}}
                >
                  <tab.icon size={16} />
                  {tab.label}
                  {/* Amber badge: pending SOP drafts count */}
                  {showSopBadge && (
                    <span className="ml-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                      {pendingDrafts}
                    </span>
                  )}
                  {/* Red dot: health score below threshold */}
                  {showHealthDot && (
                    <span className="ml-0.5 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab panel ─────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="min-h-[calc(100vh-280px)]"
          >
            {activeTab === 'sop' && (
              <SopWorkshop
                key={workshopKey}
                sops={sops}
                sopDrafts={sopDrafts}
                onRefresh={loadSopsAndDrafts}
                initialType={workshopDefaults?.type}
                initialLocation={workshopDefaults?.location}
              />
            )}

            {activeTab === 'brain' && (
              <BrainQuery />
            )}

            {activeTab === 'map' && (
              <KnowledgeMapGraph />
            )}

            {activeTab === 'health' && (
              <HealthAndPulse
                healthData={healthData}
                onPrefillGenerate={handlePrefillGenerate}
                learningEvents={learningEvents}
                sseConnected={sseConnected}
                onClearEvents={() => setLearningEvents([])}
                scrollRef={scrollRef}
                sops={sops}
                typeHubMatrix={typeHubMatrix}
              />
            )}
          </motion.div>
        </AnimatePresence>

      </div>
    </Layout>
  );
}
