import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArrowDown, ArrowUp, Bot, BookOpen, Brain, CheckCircle2,
  ChevronRight, Clock, Copy, Database, FileText, Filter, GitBranch,
  History, Layers, Mail, Minus, RefreshCw, Search, Send, Shield,
  Sparkles, TrendingUp, User, X, Zap,
} from 'lucide-react';
import Layout from '../components/Layout';
import {
  getSops, getAuditLogList, getOutboundEmails, getRpaRunsList,
  getRetrainHistory,
} from '../lib/api';

const TABS = [
  { id: 'sops',     label: 'SOP Library',     icon: BookOpen,  hint: 'Every standard procedure' },
  { id: 'audit',    label: 'Audit Trail',     icon: Shield,    hint: 'Every AI + human decision' },
  { id: 'docs',     label: 'Generated Docs',  icon: Mail,      hint: 'Every email composed by NEXUS' },
  { id: 'rpa',      label: 'RPA Runs',        icon: Bot,       hint: 'Every robot batch traceable' },
  { id: 'retrain',  label: 'ML Retrains',     icon: Brain,     hint: 'Every model retrain + metrics' },
];

const ACTOR_TONE = {
  ai:        { fg: '#0EA5E9', bg: 'rgba(14,165,233,0.10)',  label: 'AI' },
  reviewer:  { fg: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  label: 'REVIEWER' },
  admin:     { fg: '#A855F7', bg: 'rgba(168,85,247,0.10)',  label: 'ADMIN' },
  rpa:       { fg: '#FF8C00', bg: 'rgba(255,140,0,0.10)',   label: 'ROBOT' },
  system:    { fg: '#64748B', bg: 'rgba(100,116,139,0.10)', label: 'SYSTEM' },
  default:   { fg: '#94A3B8', bg: 'rgba(148,163,184,0.10)', label: 'UNKNOWN' },
};

const STATUS_TONE = {
  sent:    { fg: '#10B981', bg: 'rgba(16,185,129,0.10)' },
  queued:  { fg: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
  failed:  { fg: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
  draft:   { fg: '#64748B', bg: 'rgba(100,116,139,0.10)' },
};

function fmtRelative(d) {
  if (!d) return '—';
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

function fmtNumber(n) {
  if (n == null) return '—';
  return Intl.NumberFormat().format(n);
}

export default function AuditTrace() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('sops');
  const [search, setSearch] = useState('');

  const [sops, setSops] = useState([]);
  const [auditData, setAuditData] = useState({ logs: [], total: 0, actorBreakdown: {} });
  const [emailData, setEmailData] = useState({ emails: [], statusBreakdown: {} });
  const [rpaData, setRpaData] = useState({ runs: [], total: 0 });
  const [retrainData, setRetrainData] = useState({ runs: [], latest: null, total: 0, successCount: 0, successRate: 0 });

  const [loading, setLoading] = useState(true);
  const [filterActor, setFilterActor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sopList, audit, emails, rpa, retrain] = await Promise.all([
        getSops(),
        getAuditLogList({ limit: 200, actorType: filterActor || undefined, search: search || undefined }),
        getOutboundEmails({ limit: 200, status: filterStatus || undefined, search: search || undefined }),
        getRpaRunsList(),
        getRetrainHistory({ limit: 50 }),
      ]);
      setSops(Array.isArray(sopList) ? sopList : []);
      setAuditData(audit || { logs: [], total: 0, actorBreakdown: {} });
      setEmailData(emails || { emails: [], statusBreakdown: {} });
      setRpaData(rpa || { runs: [], total: 0 });
      setRetrainData(retrain || { runs: [], latest: null, total: 0, successCount: 0, successRate: 0 });
    } finally {
      setLoading(false);
    }
  }, [filterActor, filterStatus, search]);

  useEffect(() => { load(); }, [load]);

  const headerCounts = useMemo(() => ({
    sops:    sops.length,
    audit:   auditData.total,
    docs:    (emailData.emails || []).length,
    rpa:     (rpaData.runs || []).length,
    retrain: retrainData.total,
  }), [sops, auditData, emailData, rpaData, retrainData]);

  return (
    <Layout>
      <div className="mx-auto max-w-screen-2xl space-y-4 px-4 py-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--nexus-text-3)]">
              <Archive size={11} />
              System Memory
            </div>
            <h1 className="mt-1 text-[24px] font-bold leading-tight text-[var(--nexus-text-1)]">
              Audit &amp; Trace
            </h1>
            <p className="mt-1 text-[12px] text-[var(--nexus-text-3)]">
              Every procedure, every decision, every email, every robot run — replayable from one place.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-[var(--nexus-border)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5 transition-colors focus-within:border-[rgba(56,189,248,0.4)]">
              <Search size={13} className="text-[var(--nexus-text-3)]" />
              <input
                type="text"
                placeholder="Search across audit + docs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56 bg-transparent text-[12px] text-[var(--nexus-text-1)] outline-none placeholder:text-[var(--nexus-text-3)]"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')}>
                  <X size={11} className="text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-1)]" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-[var(--nexus-border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--nexus-text-2)] hover:border-[rgba(56,189,248,0.4)] hover:text-[var(--nexus-text-1)] disabled:opacity-40"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Top stats strip ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className="flex items-start gap-3 rounded-lg border p-3 text-left transition-all"
                style={{
                  borderColor: active ? 'rgba(56,189,248,0.4)' : 'var(--nexus-border)',
                  background: active ? 'rgba(56,189,248,0.04)' : 'var(--nexus-surface-2)',
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                  style={{
                    background: active ? 'rgba(56,189,248,0.12)' : 'rgba(148,163,184,0.06)',
                    color: active ? '#38bdf8' : 'var(--nexus-text-2)',
                  }}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nexus-text-2)]">
                      {t.label}
                    </span>
                    <span className="font-mono text-[14px] font-bold text-[var(--nexus-text-1)]">
                      {fmtNumber(headerCounts[t.id])}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-[var(--nexus-text-3)]">
                    {t.hint}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Tab body ────────────────────────────────────────────────────── */}
        <div
          className="rounded-lg border"
          style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-1)' }}
        >
          {loading && (
            <div className="flex items-center justify-center py-16 text-[12px] text-[var(--nexus-text-3)]">
              Loading…
            </div>
          )}

          {!loading && activeTab === 'sops' && <SopTab sops={sops} search={search} navigate={navigate} />}
          {!loading && activeTab === 'audit' && (
            <AuditTab
              data={auditData}
              filterActor={filterActor}
              setFilterActor={setFilterActor}
              navigate={navigate}
            />
          )}
          {!loading && activeTab === 'docs' && (
            <DocsTab
              data={emailData}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
            />
          )}
          {!loading && activeTab === 'rpa' && <RpaTab data={rpaData} navigate={navigate} />}
          {!loading && activeTab === 'retrain' && <RetrainTab data={retrainData} />}
        </div>

      </div>
    </Layout>
  );
}

// ── SOP Library tab ──────────────────────────────────────────────────────────
function SopTab({ sops, search }) {
  const [selectedSop, setSelectedSop] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sops;
    return sops.filter((s) =>
      [s.code, s.title, s.incidentType, s.location]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(q))
    );
  }, [sops, search]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setSelectedSop(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (filtered.length === 0) {
    return <EmptyState icon={BookOpen} title="No SOPs yet" hint="SOPs auto-generate every 30 min from resolved cases." />;
  }

  return (
    <>
      <div className="divide-y divide-[var(--nexus-border)]">
        {filtered.map((sop) => (
          <div
            key={sop._id || sop.code}
            className="grid grid-cols-12 gap-4 px-5 py-3.5 transition-colors hover:bg-[rgba(255,255,255,0.015)]"
          >
            <div className="col-span-5 flex items-start gap-3 min-w-0">
              <div
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                style={{ background: 'rgba(56,189,248,0.10)', color: '#38bdf8' }}
              >
                <BookOpen size={13} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--nexus-text-1)]">
                  {sop.title || sop.code}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-[var(--nexus-text-3)]">{sop.code}</p>
              </div>
            </div>
            <div className="col-span-2 self-center">
              <span className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide" style={{
                background: 'rgba(245,158,11,0.10)', color: '#F59E0B',
              }}>
                {(sop.incidentType || 'general').replace(/_/g, ' ')}
              </span>
            </div>
            <div className="col-span-2 self-center text-[11px] text-[var(--nexus-text-2)]">
              <span className="font-mono">{(sop.steps || []).length}</span> steps
            </div>
            <div className="col-span-2 self-center text-[11px] text-[var(--nexus-text-3)]">
              {fmtRelative(sop.createdAt)}
            </div>
            <div className="col-span-1 self-center text-right">
              <button
                type="button"
                onClick={() => setSelectedSop(sop)}
                className="text-[11px] font-semibold text-[#38bdf8] hover:underline"
              >
                View →
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedSop && <SopModal sop={selectedSop} onClose={() => setSelectedSop(null)} />}
    </>
  );
}

// ── SOP detail modal ─────────────────────────────────────────────────────────
function SopModal({ sop, onClose }) {
  const steps = Array.isArray(sop.steps) ? sop.steps : [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'rgba(5,7,11,0.75)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl"
        style={{
          borderColor: 'var(--nexus-border)',
          background: 'var(--nexus-surface-1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[var(--nexus-border)] px-6 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{ background: 'rgba(56,189,248,0.10)', color: '#38bdf8' }}
            >
              <BookOpen size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-tight text-[var(--nexus-text-1)]">
                {sop.title || sop.code}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-[var(--nexus-text-3)]">{sop.code}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(245,158,11,0.10)', color: '#F59E0B' }}
                >
                  {(sop.incidentType || 'general').replace(/_/g, ' ')}
                </span>
                {sop.location && (
                  <span className="text-[10px] text-[var(--nexus-text-3)]">{sop.location}</span>
                )}
                <span className="text-[10px] text-[var(--nexus-text-3)]">·</span>
                <span className="text-[10px] text-[var(--nexus-text-3)]">{fmtRelative(sop.createdAt)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--nexus-text-3)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--nexus-text-1)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {sop.description && (
            <p className="mb-5 text-[12px] leading-relaxed text-[var(--nexus-text-2)]">
              {sop.description}
            </p>
          )}

          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--nexus-text-3)]">
            <Layers size={11} />
            Resolution Steps ({steps.length})
          </div>

          {steps.length === 0 ? (
            <p className="text-[12px] text-[var(--nexus-text-3)]">No steps defined.</p>
          ) : (
            <ol className="space-y-2">
              {steps.map((step, idx) => {
                const text = typeof step === 'string' ? step : (step?.text || step?.description || JSON.stringify(step));
                return (
                  <li
                    key={idx}
                    className="flex items-start gap-3 rounded-md border border-[var(--nexus-border)] bg-[rgba(255,255,255,0.015)] px-3 py-2.5"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold"
                      style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}
                    >
                      {idx + 1}
                    </span>
                    <p className="flex-1 text-[12px] leading-relaxed text-[var(--nexus-text-1)]">
                      {text}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}

          {sop.statusHistory && sop.statusHistory.length > 0 && (
            <div className="mt-6 border-t border-[var(--nexus-border)] pt-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--nexus-text-3)]">
                <History size={11} />
                Version History ({sop.statusHistory.length})
              </div>
              <ul className="space-y-1.5">
                {sop.statusHistory.slice(-5).reverse().map((h, i) => (
                  <li key={i} className="flex items-center gap-2 text-[11px] text-[var(--nexus-text-2)]">
                    <Clock size={9} className="text-[var(--nexus-text-3)]" />
                    <span className="font-mono text-[10px] text-[var(--nexus-text-3)]">{fmtRelative(h.at || h.timestamp)}</span>
                    <span>{h.status || h.action}</span>
                    {h.by && <span className="text-[var(--nexus-text-3)]">by {h.by}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--nexus-border)] px-6 py-3">
          <span className="text-[10px] text-[var(--nexus-text-3)]">
            Press <kbd className="rounded border border-[var(--nexus-border)] px-1.5 py-0.5 font-mono text-[9px]">Esc</kbd> to close
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-[var(--nexus-text-2)] hover:bg-[rgba(255,255,255,0.04)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Audit Trail tab ──────────────────────────────────────────────────────────
function AuditTab({ data, filterActor, setFilterActor, navigate }) {
  const actors = ['ai', 'reviewer', 'admin', 'rpa', 'system'];
  const logs = data.logs || [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--nexus-border)] px-5 py-3">
        <Filter size={11} className="text-[var(--nexus-text-3)]" />
        <span className="text-[10px] uppercase tracking-wide text-[var(--nexus-text-3)]">Actor:</span>
        <button
          type="button"
          onClick={() => setFilterActor('')}
          className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
            !filterActor
              ? 'bg-[rgba(56,189,248,0.12)] text-[#38bdf8]'
              : 'text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)]'
          }`}
        >
          All ({data.total || 0})
        </button>
        {actors.map((a) => {
          const tone = ACTOR_TONE[a] || ACTOR_TONE.default;
          const count = data.actorBreakdown?.[a] || 0;
          const active = filterActor === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => setFilterActor(active ? '' : a)}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium transition-all"
              style={{
                background: active ? `${tone.fg}22` : 'transparent',
                color: active ? tone.fg : 'var(--nexus-text-3)',
              }}
            >
              {tone.label} ({count})
            </button>
          );
        })}
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={Shield} title="No audit entries yet" hint="Every AI decision will appear here." />
      ) : (
        <div className="divide-y divide-[var(--nexus-border)]">
          {logs.map((log) => {
            const tone = ACTOR_TONE[log.actorType] || ACTOR_TONE.default;
            return (
              <div key={log._id} className="grid grid-cols-12 gap-3 px-5 py-3 transition-colors hover:bg-[rgba(255,255,255,0.015)]">
                <div className="col-span-2 text-[11px] text-[var(--nexus-text-3)]">
                  <div className="flex items-center gap-1.5">
                    <Clock size={10} />
                    <span className="font-mono">{fmtRelative(log.timestamp || log.createdAt)}</span>
                  </div>
                </div>
                <div className="col-span-2 self-center">
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {tone.label}
                  </span>
                </div>
                <div className="col-span-3 self-center text-[11px] text-[var(--nexus-text-1)]">
                  <span className="font-medium">{log.action || 'unknown'}</span>
                  {log.field && (
                    <span className="ml-1.5 font-mono text-[10px] text-[var(--nexus-text-3)]">
                      :{log.field}
                    </span>
                  )}
                </div>
                <div className="col-span-4 self-center min-w-0">
                  <p className="truncate text-[11px] text-[var(--nexus-text-2)]">
                    {log.incidentId?.title || (typeof log.newValue === 'object' ? JSON.stringify(log.newValue).slice(0, 100) : (log.newValue || '—'))}
                  </p>
                </div>
                <div className="col-span-1 self-center text-right">
                  {log.incidentId?._id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/incidents/${log.incidentId._id}`)}
                      className="text-[10px] font-semibold text-[#38bdf8] hover:underline"
                    >
                      Open →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Generated Docs tab ───────────────────────────────────────────────────────
function DocsTab({ data, filterStatus, setFilterStatus }) {
  const statuses = ['sent', 'queued', 'failed', 'draft'];
  const emails = data.emails || [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--nexus-border)] px-5 py-3">
        <Filter size={11} className="text-[var(--nexus-text-3)]" />
        <span className="text-[10px] uppercase tracking-wide text-[var(--nexus-text-3)]">Status:</span>
        <button
          type="button"
          onClick={() => setFilterStatus('')}
          className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
            !filterStatus
              ? 'bg-[rgba(56,189,248,0.12)] text-[#38bdf8]'
              : 'text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)]'
          }`}
        >
          All
        </button>
        {statuses.map((s) => {
          const tone = STATUS_TONE[s] || STATUS_TONE.draft;
          const count = data.statusBreakdown?.[s] || 0;
          const active = filterStatus === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(active ? '' : s)}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium uppercase transition-all"
              style={{
                background: active ? `${tone.fg}22` : 'transparent',
                color: active ? tone.fg : 'var(--nexus-text-3)',
              }}
            >
              {s} ({count})
            </button>
          );
        })}
      </div>

      {emails.length === 0 ? (
        <EmptyState icon={Mail} title="No generated emails yet" hint="Recovery, ack, and hub notices will appear here." />
      ) : (
        <div className="divide-y divide-[var(--nexus-border)]">
          {emails.map((em) => {
            const tone = STATUS_TONE[em.status] || STATUS_TONE.draft;
            return (
              <div key={em._id} className="grid grid-cols-12 gap-3 px-5 py-3 transition-colors hover:bg-[rgba(255,255,255,0.015)]">
                <div className="col-span-2 text-[11px] text-[var(--nexus-text-3)]">
                  <div className="flex items-center gap-1.5">
                    <Send size={10} />
                    <span className="font-mono">{fmtRelative(em.sentAt || em.createdAt)}</span>
                  </div>
                </div>
                <div className="col-span-2 self-center">
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {em.status}
                  </span>
                </div>
                <div className="col-span-3 self-center min-w-0 text-[11px] text-[var(--nexus-text-2)]">
                  <p className="truncate">{em.to || '—'}</p>
                </div>
                <div className="col-span-5 self-center min-w-0">
                  <p className="truncate text-[11px] text-[var(--nexus-text-1)]">
                    {em.subject || '(no subject)'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── RPA Runs tab ─────────────────────────────────────────────────────────────
function RpaTab({ data, navigate }) {
  const runs = data.runs || [];

  if (runs.length === 0) {
    return <EmptyState icon={Bot} title="No RPA runs yet" hint="Robot batches will appear here." />;
  }

  return (
    <div className="divide-y divide-[var(--nexus-border)]">
      {runs.map((run) => {
        const ok = run.status === 'completed' || run.status === 'success';
        return (
          <div key={run._id || run.runId} className="grid grid-cols-12 gap-3 px-5 py-3 transition-colors hover:bg-[rgba(255,255,255,0.015)]">
            <div className="col-span-3 flex items-center gap-3 min-w-0">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                style={{ background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.10)', color: ok ? '#10B981' : '#F59E0B' }}
              >
                <Bot size={14} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] font-semibold text-[var(--nexus-text-1)]">
                  {(run.runId || run._id || '').toString().slice(-12)}
                </p>
                <p className="text-[10px] text-[var(--nexus-text-3)]">{fmtRelative(run.completedAt || run.endTime || run.createdAt)}</p>
              </div>
            </div>
            <div className="col-span-2 self-center text-[11px] text-[var(--nexus-text-2)]">
              <span className="font-mono font-bold">{fmtNumber(run.processedCount ?? run.totalFiles)}</span>
              <span className="ml-1 text-[var(--nexus-text-3)]">processed</span>
            </div>
            <div className="col-span-2 self-center text-[11px] text-[var(--nexus-text-2)]">
              <span className="font-mono">{fmtNumber(run.duplicates ?? 0)}</span>
              <span className="ml-1 text-[var(--nexus-text-3)]">duplicates</span>
            </div>
            <div className="col-span-2 self-center text-[11px] text-[var(--nexus-text-2)]">
              <span className="font-mono">{fmtNumber(run.failed ?? 0)}</span>
              <span className="ml-1 text-[var(--nexus-text-3)]">failed</span>
            </div>
            <div className="col-span-2 self-center">
              <span
                className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: ok ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
                  color: ok ? '#10B981' : '#F59E0B',
                }}
              >
                {run.status || 'unknown'}
              </span>
            </div>
            <div className="col-span-1 self-center text-right">
              <button
                type="button"
                onClick={() => navigate(`/rpa?run=${run.runId || ''}`)}
                className="text-[10px] font-semibold text-[#38bdf8] hover:underline"
              >
                Open →
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── ML Retrain history tab ───────────────────────────────────────────────────
function RetrainTab({ data }) {
  const runs = data.runs || [];
  const latest = data.latest;
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setSelected(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {latest && (
        <div className="grid grid-cols-2 gap-3 border-b border-[var(--nexus-border)] px-5 py-4 lg:grid-cols-4">
          <MetricCell label="Current Accuracy" value={latest.metrics?.accuracy != null ? `${(latest.metrics.accuracy * 100).toFixed(2)}%` : '—'} accent="#10B981" />
          <MetricCell label="Calibrated Brier" value={latest.metrics?.calibratedBrier?.toFixed(4) ?? '—'} accent="#38bdf8" hint="lower is better" />
          <MetricCell label="Overall ECE" value={latest.metrics?.calibratedEce?.toFixed(4) ?? latest.metrics?.ece?.toFixed(4) ?? '—'} accent="#F59E0B" hint="lower is better" />
          <MetricCell label="Total Retrains" value={`${data.successCount}/${data.total}`} accent="#A855F7" hint={`${data.successRate}% success`} />
        </div>
      )}

      {runs.length === 0 ? (
        <EmptyState icon={Brain} title="No retrain history yet" hint="Once you retrain the model, every run will appear here." />
      ) : (
        <div className="divide-y divide-[var(--nexus-border)]">
          {runs.map((run) => {
            const ok = run.status === 'done';
            const m = run.metrics || {};
            const d = run.delta || {};
            return (
              <button
                key={run._id}
                type="button"
                onClick={() => setSelected(run)}
                className="grid w-full grid-cols-12 gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.025)]"
              >
                <div className="col-span-3 flex items-start gap-3 min-w-0">
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{
                      background: ok ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                      color: ok ? '#10B981' : '#EF4444',
                    }}
                  >
                    <Brain size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-[var(--nexus-text-1)]">
                      {fmtRelative(run.startedAt)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--nexus-text-3)]">
                      {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'} · {run.realRowsAdded ?? 0} new rows
                    </p>
                  </div>
                </div>

                <div className="col-span-2 self-center">
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      background: ok ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                      color: ok ? '#10B981' : '#EF4444',
                    }}
                  >
                    {run.status}
                  </span>
                </div>

                <div className="col-span-2 self-center text-[11px]">
                  <div className="text-[var(--nexus-text-3)]">Accuracy</div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[var(--nexus-text-1)]">
                      {m.accuracy != null ? `${(m.accuracy * 100).toFixed(2)}%` : '—'}
                    </span>
                    <DeltaChip value={d.accuracy} positiveIsGood />
                  </div>
                </div>

                <div className="col-span-2 self-center text-[11px]">
                  <div className="text-[var(--nexus-text-3)]">Cal. Brier</div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[var(--nexus-text-1)]">
                      {m.calibratedBrier?.toFixed(4) ?? '—'}
                    </span>
                    <DeltaChip value={d.calibratedBrier} positiveIsGood={false} />
                  </div>
                </div>

                <div className="col-span-2 self-center text-[11px]">
                  <div className="text-[var(--nexus-text-3)]">ECE</div>
                  <div className="font-mono font-bold text-[var(--nexus-text-1)]">
                    {(m.calibratedEce ?? m.ece)?.toFixed(4) ?? '—'}
                  </div>
                </div>

                <div className="col-span-1 self-center text-right">
                  {run.error ? (
                    <span title={run.error} className="text-[10px] font-semibold text-[#EF4444]">⚠</span>
                  ) : (
                    <ChevronRight size={12} className="ml-auto text-[var(--nexus-text-3)]" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && <RetrainModal run={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

// ── Retrain detail modal ─────────────────────────────────────────────────────
function RetrainModal({ run, onClose }) {
  const m = run.metrics || {};
  const prev = run.previousMetrics || {};
  const d = run.delta || {};
  const ecePerClass = m.ecePerClass || {};
  const eceEntries = Object.entries(ecePerClass).sort((a, b) => b[1] - a[1]);
  const maxEce = Math.max(0.0001, ...eceEntries.map(([, v]) => v));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'rgba(5,7,11,0.78)' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border shadow-2xl"
        style={{ borderColor: 'var(--nexus-border)', background: 'var(--nexus-surface-1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--nexus-border)] px-6 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
              style={{ background: 'rgba(168,85,247,0.12)', color: '#A855F7' }}
            >
              <Brain size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-tight text-[var(--nexus-text-1)]">
                Retrain · {new Date(run.startedAt).toLocaleString()}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className="rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{
                    background: run.status === 'done' ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                    color: run.status === 'done' ? '#10B981' : '#EF4444',
                  }}
                >
                  {run.status}
                </span>
                <span className="text-[10px] text-[var(--nexus-text-3)]">
                  {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                </span>
                <span className="text-[10px] text-[var(--nexus-text-3)]">·</span>
                <span className="text-[10px] text-[var(--nexus-text-3)]">
                  {run.realRowsAdded ?? 0} new rows added
                </span>
                <span className="text-[10px] text-[var(--nexus-text-3)]">·</span>
                <span className="text-[10px] text-[var(--nexus-text-3)]">
                  triggered: {run.triggeredBy || 'manual'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--nexus-text-3)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--nexus-text-1)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Metrics comparison */}
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--nexus-text-3)]">
              <TrendingUp size={11} />
              Metrics vs Previous Run
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <CompareCell
                label="Accuracy"
                current={m.accuracy != null ? `${(m.accuracy * 100).toFixed(2)}%` : '—'}
                previous={prev.accuracy != null ? `${(prev.accuracy * 100).toFixed(2)}%` : null}
                delta={d.accuracy}
                positiveIsGood
              />
              <CompareCell
                label="Calibrated Brier"
                current={m.calibratedBrier?.toFixed(4) ?? '—'}
                previous={prev.calibratedBrier?.toFixed(4) ?? null}
                delta={d.calibratedBrier}
                positiveIsGood={false}
                hint="lower is better"
              />
              <CompareCell
                label="Calibrated ECE"
                current={m.calibratedEce?.toFixed(4) ?? m.ece?.toFixed(4) ?? '—'}
                previous={null}
                delta={null}
                hint="lower is better"
              />
              <CompareCell
                label="Raw Brier"
                current={m.rawBrier?.toFixed(4) ?? '—'}
                previous={null}
                delta={null}
                hint="pre-calibration"
              />
            </div>
            {m.calibrationMethod && (
              <p className="mt-3 text-[10px] text-[var(--nexus-text-3)]">
                Calibration method: <span className="font-mono text-[var(--nexus-text-2)]">{m.calibrationMethod}</span>
              </p>
            )}
          </div>

          {/* Per-class ECE bars */}
          {eceEntries.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--nexus-text-3)]">
                <Layers size={11} />
                Calibration Error per Class
              </div>
              <div className="space-y-1.5">
                {eceEntries.map(([cls, val]) => (
                  <div key={cls} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-[11px] text-[var(--nexus-text-2)]">
                      {cls.replace(/_/g, ' ')}
                    </span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.04)]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${(val / maxEce) * 100}%`,
                          background: val > 0.01 ? '#F59E0B' : '#10B981',
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono text-[10px] text-[var(--nexus-text-2)]">
                      {val.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[var(--nexus-text-3)]">
                ECE = Expected Calibration Error. Closer to 0 means stated confidence matches actual accuracy for that class.
              </p>
            </div>
          )}

          {/* Log tail */}
          {run.logTail && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--nexus-text-3)]">
                <FileText size={11} />
                Training Output (tail)
              </div>
              <pre className="max-h-64 overflow-y-auto rounded-md border border-[var(--nexus-border)] bg-[rgba(0,0,0,0.25)] p-3 text-[10px] leading-relaxed text-[var(--nexus-text-2)]" style={{ fontFamily: 'Menlo, Consolas, monospace' }}>
                {run.logTail}
              </pre>
            </div>
          )}

          {/* Timing */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <DetailField label="Started" value={new Date(run.startedAt).toLocaleString()} />
            <DetailField label="Finished" value={run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '—'} />
            <DetailField label="Duration" value={run.durationMs ? `${(run.durationMs / 1000).toFixed(2)}s` : '—'} />
          </div>

        </div>

        <div className="flex items-center justify-between border-t border-[var(--nexus-border)] px-6 py-3">
          <span className="text-[10px] text-[var(--nexus-text-3)]">
            Press <kbd className="rounded border border-[var(--nexus-border)] px-1.5 py-0.5 font-mono text-[9px]">Esc</kbd> to close
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-[var(--nexus-text-2)] hover:bg-[rgba(255,255,255,0.04)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CompareCell({ label, current, previous, delta, positiveIsGood, hint }) {
  return (
    <div className="rounded-md border border-[var(--nexus-border)] bg-[rgba(255,255,255,0.015)] px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--nexus-text-3)]">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-[16px] font-bold text-[var(--nexus-text-1)]">{current}</span>
        <DeltaChip value={delta} positiveIsGood={positiveIsGood} />
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[9px] text-[var(--nexus-text-3)]">
        {previous != null ? <>was <span className="font-mono">{previous}</span></> : (hint || '—')}
      </div>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div className="rounded-md border border-[var(--nexus-border)] bg-[rgba(255,255,255,0.015)] px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--nexus-text-3)]">{label}</div>
      <div className="mt-0.5 text-[11px] text-[var(--nexus-text-1)]">{value}</div>
    </div>
  );
}

function MetricCell({ label, value, accent, hint }) {
  return (
    <div className="rounded-md border border-[var(--nexus-border)] bg-[rgba(255,255,255,0.015)] px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--nexus-text-3)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-[16px] font-bold" style={{ color: accent }}>
        {value}
      </div>
      {hint && <div className="text-[9px] text-[var(--nexus-text-3)]">{hint}</div>}
    </div>
  );
}

function DeltaChip({ value, positiveIsGood }) {
  if (value == null) return null;
  if (Math.abs(value) < 0.0001) {
    return <Minus size={10} className="text-[var(--nexus-text-3)]" />;
  }
  const up = value > 0;
  const good = positiveIsGood ? up : !up;
  const color = good ? '#10B981' : '#EF4444';
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className="flex items-center gap-0.5 font-mono text-[9px] font-semibold" style={{ color }}>
      <Icon size={9} />
      {Math.abs(value).toFixed(4)}
    </span>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-md"
        style={{ background: 'rgba(148,163,184,0.08)', color: 'var(--nexus-text-3)' }}
      >
        <Icon size={18} />
      </div>
      <p className="text-[13px] font-semibold text-[var(--nexus-text-2)]">{title}</p>
      <p className="text-[11px] text-[var(--nexus-text-3)]">{hint}</p>
    </div>
  );
}
