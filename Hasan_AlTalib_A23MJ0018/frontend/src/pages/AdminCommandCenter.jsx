// frontend/src/pages/AdminCommandCenter.jsx
// W2 — Admin Command Center
// Live ops surface for system health, pipeline health, dead-letter queue,
// bulk incident operations, and export controls.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  Server,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import Layout from '../components/Layout';
import {
  bulkUpdateIncidentStatus,
  getAllIncidents,
  getAdminModelHealth,
  getOpsHealth,
  getOpsPipelineStats,
  getOutboundHistory,
  retryPipelineJob,
} from '../lib/api';

// ── Utility ───────────────────────────────────────────────────────────────────

function StatusDot({ ok, loading }) {
  if (loading) return <Loader2 className="animate-spin text-[var(--text-3)]" size={14} />;
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-[var(--accent-red)]'}`}
      aria-hidden="true"
    />
  );
}

function ServiceRow({ label, ok, loading, detail }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[4px] border border-[var(--border)] px-4 py-3">
      <div className="flex items-center gap-3">
        <StatusDot ok={ok} loading={loading} />
        <span className="text-sm font-medium text-[var(--text-1)]">{label}</span>
      </div>
      <span className="text-xs text-[var(--text-3)]">{loading ? '…' : (detail || (ok ? 'Healthy' : 'Unavailable'))}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const BULK_STATUSES = ['ASSIGNED', 'IN_PROGRESS'];

export default function AdminCommandCenter() {
  const [health, setHealth] = useState(null);
  const [mlHealth, setMlHealth] = useState(null);
  const [pipelineStats, setPipelineStats] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('RESOLVED');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [deadLetterJobs, setDeadLetterJobs] = useState([]);
  const [retryingJobId, setRetryingJobId] = useState(null);
  const [retryResult, setRetryResult] = useState(null);

  const [exportLoading, setExportLoading] = useState('');
  const [toast, setToast] = useState(null);

  const [outboundHistory, setOutboundHistory] = useState([]);
  const [outboundLoading, setOutboundLoading] = useState(false);

  const toastRef = useRef(null);
  const BASE = import.meta.env.VITE_API_URL || '';

  // ── Toast helper ────────────────────────────────────────────────────────────
  function showToast(message, type = 'ok') {
    setToast({ message, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }

  // ── System health polling ───────────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    const [backendHealth, mlData, statsData] = await Promise.all([
      getOpsHealth(),
      getAdminModelHealth().catch(() => null),
      getOpsPipelineStats().catch(() => null),
    ]);
    setHealth(backendHealth);
    setMlHealth(mlData);
    setPipelineStats(statsData);
    setDeadLetterJobs([...(statsData?.deadLetters || []), ...(statsData?.recentFailed || [])]);
    setHealthLoading(false);
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 30000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const fetchOutbound = useCallback(async () => {
    setOutboundLoading(true);
    try {
      const data = await getOutboundHistory();
      setOutboundHistory(data?.emails || []);
    } catch {
      // non-critical
    } finally {
      setOutboundLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOutbound();
  }, [fetchOutbound]);

  // ── Bulk operations ─────────────────────────────────────────────────────────
  async function loadBulkIncidents() {
    setIncidentsLoading(true);
    setBulkResult(null);
    setSelected(new Set());
    try {
      const data = await getAllIncidents({ limit: 200 });
      const rows = Array.isArray(data) ? data : (data?.incidents || []);
      setIncidents(rows.filter((inc) => BULK_STATUSES.includes(inc.status)));
    } catch (err) {
      showToast(err.message || 'Failed to load incidents', 'err');
    } finally {
      setIncidentsLoading(false);
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === incidents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(incidents.map((i) => i._id)));
    }
  }

  async function handleBulkSubmit() {
    if (selected.size === 0) { showToast('Select at least one incident', 'err'); return; }
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const result = await bulkUpdateIncidentStatus([...selected], bulkStatus, bulkNote);
      setBulkResult(result);
      showToast(`Updated ${result.updated} incident(s) to ${bulkStatus}`);
      setSelected(new Set());
      setIncidents((prev) => prev.filter((inc) => !selected.has(inc._id)));
    } catch (err) {
      showToast(err.message || 'Bulk update failed', 'err');
    } finally {
      setBulkLoading(false);
    }
  }

  // ── Retry dead-letter ───────────────────────────────────────────────────────
  async function handleRetry(jobId) {
    setRetryingJobId(jobId);
    setRetryResult(null);
    try {
      const result = await retryPipelineJob(jobId);
      setRetryResult({ jobId, ...result });
      showToast(`Retry queued for job ${jobId.slice(-6)}`);
      setDeadLetterJobs((prev) => prev.filter((j) => j._id !== jobId));
    } catch (err) {
      showToast(err.message || 'Retry failed', 'err');
    } finally {
      setRetryingJobId(null);
    }
  }

  // ── Exports ─────────────────────────────────────────────────────────────────
  function triggerDownload(path, filename) {
    const a = document.createElement('a');
    a.href = `${BASE}${path}`;
    a.download = filename;
    // Include cookie automatically via browser — need to open in same origin
    window.open(`${BASE}${path}`, '_blank');
  }

  async function handleExport(type) {
    setExportLoading(type);
    try {
      if (type === 'training') {
        triggerDownload('/api/v1/admin/export/training-candidates', 'training_candidates.jsonl');
      } else if (type === 'feedback') {
        triggerDownload('/api/v1/admin/export/feedback-dataset', 'feedback_dataset.jsonl');
      }
      showToast('Export started — check your downloads.');
    } finally {
      setExportLoading('');
    }
  }

  // ── Pipeline status counts ──────────────────────────────────────────────────
  const counts = pipelineStats?.counts || {};
  const totalJobs = Object.values(counts).reduce((s, v) => s + v, 0);

  return (
    <Layout title="Command Center">
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed right-6 bottom-6 z-50 flex items-center gap-3 rounded-[6px] border px-4 py-3 text-sm shadow-lg transition-all ${
              toast.type === 'err'
                ? 'border-[var(--accent-red)] bg-[rgb(239,68,68,0.12)] text-[var(--text-1)]'
                : 'border-emerald-500/30 bg-[rgb(16,185,129,0.1)] text-[var(--text-1)]'
            }`}
          >
            {toast.type === 'err'
              ? <XCircle size={16} className="text-[var(--accent-red)] shrink-0" />
              : <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
            {toast.message}
          </div>
        )}

        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            Admin Command Center
          </h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            System health, pipeline operations, bulk actions, and export controls.
          </p>
        </div>

        {/* ── Section 1: System Health ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base text-[var(--text-1)]">
                <Server size={16} aria-hidden="true" />
                System Health
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHealth}
                disabled={healthLoading}
                className="gap-2"
              >
                <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} aria-hidden="true" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ServiceRow
              label="Backend API"
              ok={health?.status === 'ok'}
              loading={healthLoading}
              detail={health?.timestamp ? `Last ping ${new Date(health.timestamp).toLocaleTimeString()}` : null}
            />
            <ServiceRow
              label="ML Service"
              ok={mlHealth?.modelLoaded === true}
              loading={healthLoading}
              detail={mlHealth?.modelLoaded ? `Model loaded · ${mlHealth.trainingDataSize || '?'} training rows` : 'Not reachable'}
            />
            <ServiceRow
              label="MongoDB Atlas"
              ok={health?.status === 'ok'}
              loading={healthLoading}
              detail="Connected to Atlas cluster"
            />
          </CardContent>
        </Card>

        {/* ── Section 2: Pipeline Health ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[var(--text-1)]">
              <Cpu size={16} aria-hidden="true" />
              Pipeline Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthLoading && !pipelineStats ? (
              <p className="text-sm text-[var(--text-3)]">Loading…</p>
            ) : (
              <div className="space-y-4">
                {/* Status counts */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { key: 'completed', label: 'Completed', color: 'text-emerald-500' },
                    { key: 'running', label: 'Running', color: 'text-[var(--accent-yellow)]' },
                    { key: 'failed', label: 'Failed', color: 'text-[var(--accent-red)]' },
                    { key: 'dead_letter', label: 'Dead Letter', color: 'text-[var(--accent-red)]' },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">{label}</p>
                      <p className={`mt-2 text-2xl font-bold ${color}`}>{counts[key] || 0}</p>
                    </div>
                  ))}
                </div>

                {/* Dead-letter / failed jobs */}
                {deadLetterJobs.length > 0 ? (
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                      Failed / Dead-Letter Jobs
                    </p>
                    <div className="space-y-2">
                      {deadLetterJobs.map((job) => (
                        <div
                          key={job._id}
                          className="flex items-center justify-between gap-4 rounded-[4px] border border-[var(--border)] px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-[var(--text-1)] font-mono-ui">
                              {job._id}
                            </p>
                            {job.lastError && (
                              <p className="mt-1 truncate text-xs text-[var(--accent-red)]">
                                {job.lastError}
                              </p>
                            )}
                            {job.incidentId && (
                              <p className="mt-0.5 text-xs text-[var(--text-3)]">
                                Incident: {String(job.incidentId).slice(-8)}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetry(job._id)}
                            disabled={retryingJobId === job._id}
                            className="shrink-0 gap-2"
                          >
                            {retryingJobId === job._id ? (
                              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                            ) : (
                              <RotateCcw size={13} aria-hidden="true" />
                            )}
                            Retry
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  !healthLoading && (
                    <div className="flex items-center gap-2 text-sm text-emerald-500">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      No failed or dead-letter jobs.
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Section 3: Bulk Operations ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2 text-base text-[var(--text-1)]">
                <AlertTriangle size={16} aria-hidden="true" />
                Bulk Operations
              </CardTitle>
              <Button size="sm" variant="outline" onClick={loadBulkIncidents} disabled={incidentsLoading} className="gap-2">
                {incidentsLoading
                  ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  : <RefreshCw size={13} aria-hidden="true" />}
                Load incidents
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-[var(--text-3)]">
              Select incidents in ASSIGNED or IN_PROGRESS status to bulk-move them to RESOLVED or CLOSED.
            </p>

            {bulkResult && (
              <div className="rounded-[6px] border border-emerald-500/30 bg-[rgb(16,185,129,0.08)] px-4 py-3 text-sm text-[var(--text-1)]">
                Updated {bulkResult.updated} incident(s) · Skipped {bulkResult.skipped || 0}
              </div>
            )}

            {incidents.length > 0 && (
              <>
                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                    <input
                      type="checkbox"
                      checked={selected.size === incidents.length && incidents.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
                    />
                    Select all ({incidents.length})
                  </label>
                  {selected.size > 0 && (
                    <>
                      <select
                        value={bulkStatus}
                        onChange={(e) => setBulkStatus(e.target.value)}
                        className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--text-1)]"
                      >
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                      <input
                        type="text"
                        placeholder="Optional note"
                        value={bulkNote}
                        onChange={(e) => setBulkNote(e.target.value)}
                        className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] min-w-0 flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={handleBulkSubmit}
                        disabled={bulkLoading}
                        className="bg-[var(--primary)] text-white hover:bg-[#b90410] gap-2"
                      >
                        {bulkLoading && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                        Apply to {selected.size}
                      </Button>
                    </>
                  )}
                </div>

                {/* Incident rows */}
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {incidents.map((inc) => (
                    <label
                      key={inc._id}
                      className="flex cursor-pointer items-center gap-3 rounded-[4px] px-3 py-2.5 hover:bg-[var(--surface-2)]"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(inc._id)}
                        onChange={() => toggleSelect(inc._id)}
                        className="h-4 w-4 shrink-0 rounded border-[var(--border)] accent-[var(--primary)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--text-1)]">
                          {inc.title || inc.description?.slice(0, 60) || 'Untitled'}
                        </p>
                        <p className="text-xs text-[var(--text-3)]">
                          {inc.status} · {inc.severity || '—'} · {inc.type || '—'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}

            {!incidentsLoading && incidents.length === 0 && (
              <p className="text-sm text-[var(--text-3)]">
                Click "Load incidents" to fetch eligible incidents.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Section 4: Export Controls ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-[var(--text-1)]">
              <Database size={16} aria-hidden="true" />
              Export Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs text-[var(--text-3)]">
              Download JSONL files for offline ML retraining. Only approved decisions are included.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleExport('training')}
                disabled={exportLoading === 'training'}
              >
                {exportLoading === 'training'
                  ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  : <Download size={14} aria-hidden="true" />}
                Training Candidates (JSONL)
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleExport('feedback')}
                disabled={exportLoading === 'feedback'}
              >
                {exportLoading === 'feedback'
                  ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  : <Download size={14} aria-hidden="true" />}
                Feedback Dataset (JSONL)
              </Button>
            </div>
            <p className="mt-3 text-xs text-[var(--text-3)]">
              After export, run:{' '}
              <code className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-2)]">
                python ml-service/scripts/retrain_from_feedback.py --input feedback_dataset.jsonl --merge
              </code>
            </p>
          </CardContent>
        </Card>

        {/* ── Outbound Email Queue — RPA Integration ──────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-[#3B82F6]" aria-hidden="true" />
                <CardTitle>Outbound Email Queue — RPA Integration</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={fetchOutbound} disabled={outboundLoading}>
                {outboundLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Refresh
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-3)]">
              Approved recovery messages queued here · UiPath polls <code className="rounded bg-[var(--surface-3)] px-1">GET /api/v1/rpa-runs/outbound-queue</code> to pick up and send via Outlook
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status summary */}
            {(() => {
              const queued  = outboundHistory.filter((e) => e.status === 'queued').length;
              const sent    = outboundHistory.filter((e) => e.status === 'sent').length;
              const failed  = outboundHistory.filter((e) => e.status === 'failed').length;
              return (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Queued', count: queued,  color: 'text-[var(--accent-amber)]', bg: 'bg-[rgb(245,158,11,0.08)] border-[rgb(245,158,11,0.2)]' },
                    { label: 'Sent',   count: sent,    color: 'text-[var(--accent-green)]', bg: 'bg-[rgb(16,185,129,0.08)] border-[rgb(16,185,129,0.2)]' },
                    { label: 'Failed', count: failed,  color: 'text-[var(--accent-red)]',   bg: 'bg-[rgb(239,68,68,0.08)] border-[rgb(239,68,68,0.2)]' },
                  ].map(({ label, count, color, bg }) => (
                    <div key={label} className={`rounded-[6px] border ${bg} p-3 text-center`}>
                      <p className={`text-[28px] font-bold leading-none tabular-nums ${color}`}>{count}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-3)]">{label}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {outboundHistory.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-3)]">
                No outbound emails yet. Approve a recovery message on any incident to queue the first email.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                  <thead className="text-left text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                    <tr>
                      <th className="pb-2 pr-4">Incident</th>
                      <th className="pb-2 pr-4">Recipient</th>
                      <th className="pb-2 pr-4">Subject</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Queued</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {outboundHistory.slice(0, 20).map((email) => {
                      const statusCfg = {
                        queued:  { label: 'Queued',  cls: 'bg-[rgb(245,158,11,0.12)] text-[var(--accent-amber)]' },
                        sent:    { label: 'Sent ✓',  cls: 'bg-[rgb(16,185,129,0.12)] text-[var(--accent-green)]' },
                        failed:  { label: 'Failed',  cls: 'bg-[rgb(239,68,68,0.12)] text-[var(--accent-red)]' },
                      }[email.status] || { label: email.status, cls: 'text-[var(--text-3)]' };
                      const incTitle = email.incidentId?.title || '—';
                      const queued = email.createdAt ? new Date(email.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
                      return (
                        <tr key={email._id}>
                          <td className="py-2.5 pr-4 text-xs text-[var(--text-2)] max-w-[160px] truncate">{incTitle}</td>
                          <td className="py-2.5 pr-4 font-mono-ui text-[11px] text-[var(--text-2)]">{email.toEmail || '—'}</td>
                          <td className="py-2.5 pr-4 text-xs text-[var(--text-3)] max-w-[200px] truncate">{email.subject || '—'}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`rounded-[2px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusCfg.cls}`}>
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="py-2.5 text-[11px] text-[var(--text-3)]">{queued}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {outboundHistory.length > 20 && (
                  <p className="mt-2 text-xs text-[var(--text-3)]">Showing 20 of {outboundHistory.length} records</p>
                )}
              </div>
            )}

            <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3 text-[11px] text-[var(--text-3)]">
              <p className="font-semibold text-[var(--text-2)]">RPA Integration Flow</p>
              <p className="mt-1">1. Human approves recovery message on incident detail page</p>
              <p>2. NEXUS creates OutboundEmail record (status: <span className="font-mono-ui">queued</span>)</p>
              <p>3. UiPath polls <span className="font-mono-ui">GET /outbound-queue</span> every N minutes</p>
              <p>4. UiPath sends via Outlook, calls <span className="font-mono-ui">PATCH /outbound-queue/:id</span> with status: sent</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
