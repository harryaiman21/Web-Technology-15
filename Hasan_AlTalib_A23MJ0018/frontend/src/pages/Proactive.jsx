import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  HelpCircle,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Wand2,
  Zap,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

import EmptyState from '../components/EmptyState';
import Layout from '../components/Layout';
import LoadingSkeleton from '../components/LoadingSkeleton';
import {
  demoProactiveReset,
  demoProactiveSeed,
  generateProactiveDocs,
  getAdminClusters,
  getProactiveSends,
  regenerateProactiveDoc,
  sendProactiveDocs,
  updateProactiveDocuments,
} from '../lib/api';

const DOC_TYPES = [
  { key: 'hubNotice', label: 'Hub Notice', icon: Building2, desc: 'Internal memo to hub manager' },
  { key: 'customerEmail', label: 'Customer Email', icon: Mail, desc: 'Proactive outreach to affected customers' },
  { key: 'faqUpdate', label: 'FAQ Update', icon: HelpCircle, desc: 'Help centre knowledge base entry' },
  { key: 'pccPlaybook', label: 'PCC Playbook', icon: BookOpen, desc: 'Agent reference guide for live calls' },
];

const INCIDENT_TYPES = [
  'late_delivery', 'damaged_parcel', 'missing_parcel',
  'address_error', 'system_error', 'wrong_item', 'other',
];

function formatTs(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const DOC_LABEL = { hubNotice: 'Hub Notice', customerEmail: 'Customer Email', faqUpdate: 'FAQ Update', pccPlaybook: 'PCC Playbook' };

function deriveHubEmail(location) {
  const slug = (location || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
  return `ops.${slug}@dhl.com`;
}

const RECIPIENT_CFG = {
  hubNotice:     { label: 'Hub Operations Manager', channel: 'Internal Email',          color: '#F59E0B' },
  customerEmail: { label: 'Affected Customers',      channel: 'Customer Email (Queued)', color: '#10B981' },
  faqUpdate:     { label: 'DHL Help Centre',          channel: 'Auto-published',          color: '#FF8C00' },
  pccPlaybook:   { label: 'PCC Agent Team',           channel: 'Internal Distribution',   color: '#0EA5E9' },
};

export default function Proactive() {
  const [searchParams] = useSearchParams();
  const urlType = searchParams.get('type') || '';
  const urlLocation = searchParams.get('location') || '';

  const saveTimerRef = useRef(null);

  // Clusters
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [pendingDrafts, setPendingDrafts] = useState([]);

  // Manual form
  const [manualType, setManualType] = useState(urlType || 'damaged_parcel');
  const [manualLocation, setManualLocation] = useState(urlLocation || '');

  // Generation
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [currentSend, setCurrentSend] = useState(null);

  // Document editing
  const [docEdits, setDocEdits] = useState({});
  const [activeDocTab, setActiveDocTab] = useState('hubNotice');
  const [regenerating, setRegenerating] = useState(null);

  // Send workflow
  const [checked, setChecked] = useState({
    hubNotice: true, customerEmail: true, faqUpdate: true, pccPlaybook: true,
  });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // History
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Demo controls
  const [demoSeeding, setDemoSeeding] = useState(false);
  const [demoSeedDone, setDemoSeedDone] = useState(false);
  const [demoResetting, setDemoResetting] = useState(false);
  const [demoError, setDemoError] = useState('');

  useEffect(() => {
    async function load() {
      const [clusterData, historyData] = await Promise.all([
        getAdminClusters().catch(() => []),
        getProactiveSends().catch(() => []),
      ]);
      const drafts = (clusterData || [])
        .filter(c => c.hasDraft && c.draftId)
        .map(c => ({
          cluster: c,
          draft: (historyData || []).find(h => h._id === c.draftId),
        }))
        .filter(item => item.draft);
      setPendingDrafts(drafts);
      setClusters((clusterData || []).filter(c => !c.handled && !c.hasDraft));
      setHistory(historyData || []);
      setHistoryLoading(false);

      if (urlType && urlLocation) {
        const match = (clusterData || []).find(
          (c) => c.type === urlType && c.location === urlLocation,
        );
        if (match) setSelectedCluster(match);

        // Restore existing draft for this type+location
        const existing = (historyData || []).find(
          (s) => s.incidentType === urlType && s.location === urlLocation && s.status === 'draft',
        );
        if (existing) {
          setCurrentSend(existing);
          setDocEdits(existing.documents || {});
        }
      }
    }
    load();
  }, [urlType, urlLocation]);

  // Sync edits when a new send is loaded
  useEffect(() => {
    if (currentSend?.documents) {
      setDocEdits({ ...currentSend.documents });
      setSendResult(null);
    }
  }, [currentSend?._id]);

  function handleDocChange(docType, value) {
    setDocEdits((prev) => ({ ...prev, [docType]: value }));
    // Debounce save to backend — 1.5s after last keystroke
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (currentSend?._id) {
      saveTimerRef.current = setTimeout(() => {
        updateProactiveDocuments(currentSend._id, { [docType]: value }).catch(() => {});
      }, 1500);
    }
  }

  function handleLoadDraft(item) {
    setSelectedCluster(item.cluster);
    setManualType(item.cluster.type);
    setManualLocation(item.cluster.location);
    setCurrentSend(item.draft);
    setDocEdits(item.draft.documents || {});
    setSendResult(null);
    setGenerateError('');
  }

  async function handleGenerate() {
    const type = selectedCluster?.type || manualType;
    const location = selectedCluster?.location || manualLocation.trim();
    if (!type || !location) return;

    setGenerating(true);
    setGenerateError('');
    setSendResult(null);
    setCurrentSend(null);
    setDocEdits({});

    try {
      const result = await generateProactiveDocs({
        incidentType: type,
        location,
        clusterId: selectedCluster?.clusterId || null,
        clusterCount: selectedCluster?.count || null,
      });
      setCurrentSend(result);
      setDocEdits(result.documents || {});
      setHistory((prev) => [result, ...prev.filter((h) => h._id !== result._id)]);
    } catch (err) {
      setGenerateError(err.data?.error || err.message || 'Generation failed. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenerate(docType) {
    if (!currentSend?._id || regenerating) return;
    setRegenerating(docType);
    setGenerateError('');
    try {
      const updated = await regenerateProactiveDoc(currentSend._id, docType);
      setCurrentSend(updated);
      setDocEdits((prev) => ({ ...prev, [docType]: updated.documents[docType] }));
    } catch (err) {
      setGenerateError(err.data?.error || err.message || 'Regeneration failed.');
    } finally {
      setRegenerating(null);
    }
  }

  async function handleSend() {
    if (!currentSend?._id || sending) return;
    const docsToSend = Object.entries(checked)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (docsToSend.length === 0) return;

    // Flush any pending debounced save first
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      await updateProactiveDocuments(currentSend._id, docEdits).catch(() => {});
    }

    setSending(true);
    setGenerateError('');
    try {
      const updated = await sendProactiveDocs(currentSend._id, docsToSend);
      setCurrentSend(updated);
      setSendResult({ count: docsToSend.length, prevented: updated.estimatedComplaintsPrevented });
      setHistory((prev) => prev.map((h) => (h._id === updated._id ? updated : h)));
      setPendingDrafts(prev => prev.filter(p => p.draft._id !== currentSend._id));
      getAdminClusters().then(data => {
        setClusters((data || []).filter(c => !c.handled && !c.hasDraft));
        const allHistory = history.map(h => (h._id === updated._id ? updated : h));
        const updatedDrafts = (data || [])
          .filter(c => c.hasDraft && c.draftId)
          .map(c => ({
            cluster: c,
            draft: allHistory.find(h => h._id === c.draftId),
          }))
          .filter(item => item.draft);
        setPendingDrafts(updatedDrafts);
      }).catch(() => {});
    } catch (err) {
      setGenerateError(err.data?.error || err.message || 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  async function handleDemoSeed() {
    setDemoSeeding(true);
    setDemoError('');
    setDemoSeedDone(false);
    try {
      await demoProactiveSeed();
      setDemoSeedDone(true);
      // Reload clusters and pending drafts
      const [clusterData, historyData] = await Promise.all([
        getAdminClusters().catch(() => []),
        getProactiveSends().catch(() => []),
      ]);
      const filtered = (clusterData || []).filter(c => !c.handled && !c.hasDraft);
      setClusters(filtered);
      const drafts = (clusterData || [])
        .filter(c => c.hasDraft && c.draftId)
        .map(c => ({ cluster: c, draft: (historyData || []).find(h => h._id === c.draftId) }))
        .filter(item => item.draft);
      setPendingDrafts(drafts);
      setHistory(historyData || []);
    } catch (e) {
      setDemoError(e.message || 'Seed failed');
    } finally {
      setDemoSeeding(false);
    }
  }

  async function handleDemoReset() {
    setDemoResetting(true);
    setDemoError('');
    setDemoSeedDone(false);
    try {
      await demoProactiveReset();
      // Refresh
      const [clusterData, historyData] = await Promise.all([
        getAdminClusters().catch(() => []),
        getProactiveSends().catch(() => []),
      ]);
      setClusters((clusterData || []).filter(c => !c.handled && !c.hasDraft));
      setPendingDrafts([]);
      setHistory(historyData || []);
      setCurrentSend(null);
      setSendResult(null);
    } catch (e) {
      setDemoError(e.message || 'Reset failed');
    } finally {
      setDemoResetting(false);
    }
  }

  const effectiveType = selectedCluster?.type || manualType;
  const effectiveLocation = (selectedCluster?.location || manualLocation).trim();
  const canGenerate = Boolean(effectiveType && effectiveLocation) && !generating;
  const hasDocs = Boolean(currentSend && Object.values(currentSend.documents || {}).some((v) => v));
  const alreadySent = currentSend?.status === 'sent';
  const sentHistory = history.filter((h) => h.status === 'sent');

  return (
    <Layout title="Proactive Communications">
      <div className="space-y-6">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">
            Proactive Communications
          </h1>
          <p className="mt-2 text-sm text-[var(--text-2)]">
            Generate hub notices, customer emails, FAQ entries and PCC playbooks from active incident clusters — before more complaints arrive.
          </p>
        </div>

        {generateError && (
          <div className="rounded-[6px] border-l-[3px] border-[var(--accent-red)] bg-[rgb(239,68,68,0.1)] px-4 py-3 text-sm text-[var(--text-1)]">
            {generateError}
            <button onClick={() => setGenerateError('')} className="ml-3 text-[var(--text-3)] hover:text-[var(--text-1)]">×</button>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">

          {/* ── Zone 1: left panel ── */}
          <div className="space-y-4">

            {/* Pending Review (auto-generated drafts) */}
            {pendingDrafts.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot size={15} className="text-[#F59E0B]" />
                      <CardTitle>Pending Review</CardTitle>
                    </div>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F59E0B] px-1 text-[9px] font-bold text-white">
                      {pendingDrafts.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                    AI-generated — review and send when ready
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {pendingDrafts.map((item) => {
                      const isSelected = currentSend?._id === item.draft._id;
                      return (
                        <button
                          key={item.draft._id}
                          type="button"
                          onClick={() => handleLoadDraft(item)}
                          className={`w-full rounded-[6px] border px-3 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'border-[rgb(245,158,11,0.5)] bg-[rgb(245,158,11,0.10)]'
                              : 'border-[rgb(245,158,11,0.2)] bg-[rgb(245,158,11,0.04)] hover:border-[rgb(245,158,11,0.4)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-[var(--text-1)]">
                                {item.cluster.location}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                                {(item.cluster.type || '').replace(/_/g, ' ')} · {item.cluster.count} incidents
                              </p>
                            </div>
                            <span
                              className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold text-[#F59E0B]"
                              style={{ background: 'rgb(245,158,11,0.12)' }}
                            >
                              Draft
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--text-3)]">
                            <Clock size={9} />
                            <span>{formatTs(item.draft.generatedAt)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active Patterns (unhandled clusters) */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={15} className="text-[var(--accent-amber)]" />
                    <CardTitle>Active Patterns</CardTitle>
                  </div>
                  <button
                    onClick={() => getAdminClusters().then(data => {
                      const filtered = (data || []).filter(c => !c.handled && !c.hasDraft);
                      setClusters(filtered);
                    }).catch(() => {})}
                    className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    <RefreshCw size={11} />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {clusters.length === 0 ? (
                  <p className="text-sm text-[var(--text-3)]">
                    {pendingDrafts.length > 0
                      ? 'All detected patterns have drafts ready for review.'
                      : 'No active clusters. Use the manual form below to generate documents for any type and location.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {clusters.map((cluster) => {
                      const isSelected = selectedCluster?.clusterId === cluster.clusterId;
                      return (
                        <button
                          key={cluster.clusterId}
                          onClick={() => {
                            setSelectedCluster(isSelected ? null : cluster);
                            setManualType(cluster.type);
                            setManualLocation(cluster.location);
                          }}
                          className={`w-full rounded-[6px] border px-3 py-2.5 text-left transition-colors ${
                            isSelected
                              ? 'border-[rgb(59,130,246,0.5)] bg-[rgb(59,130,246,0.08)]'
                              : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[rgb(59,130,246,0.3)]'
                          }`}
                        >
                          <p className="text-[12px] font-semibold text-[var(--text-1)]">
                            {cluster.location}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                            {(cluster.type || '').replace(/_/g, ' ')} · {cluster.count} incidents
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Manual generate */}
            <Card>
              <CardHeader>
                <CardTitle>Generate Manually</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="mb-1.5 text-[11px] text-[var(--text-3)]">Incident type</p>
                  <select
                    value={manualType}
                    onChange={(e) => { setManualType(e.target.value); setSelectedCluster(null); }}
                    className="h-9 w-full rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)]"
                  >
                    {INCIDENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-[var(--text-3)]">Hub / Location</p>
                  <input
                    value={manualLocation}
                    onChange={(e) => { setManualLocation(e.target.value); setSelectedCluster(null); }}
                    placeholder="e.g. Shah Alam Hub"
                    className="h-9 w-full rounded-[4px] border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                  />
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="w-full"
                >
                  {generating ? (
                    <><Loader2 size={14} className="animate-spin" /> Generating (up to 20s)…</>
                  ) : (
                    <><Wand2 size={14} /> Generate Documents</>
                  )}
                </Button>
                {selectedCluster && (
                  <p className="text-[11px] text-[#3B82F6]">
                    Using selected cluster: {selectedCluster.location} / {selectedCluster.type.replace(/_/g, ' ')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Demo Controls ─────────────────────────────── */}
            <Card style={{ borderColor: 'rgba(255,140,0,0.2)', background: 'rgba(255,140,0,0.03)' }}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu size={14} style={{ color: '#FF8C00' }} />
                    <CardTitle style={{ fontSize: 13 }}>Demo Cluster</CardTitle>
                  </div>
                  {demoSeedDone && (
                    <button
                      onClick={handleDemoReset}
                      disabled={demoResetting}
                      className="text-[10px] font-bold text-red-400 hover:text-red-300 disabled:opacity-40"
                    >
                      {demoResetting ? 'Clearing…' : 'Reset'}
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                  Seeds a real Shah Alam Hub cluster — 4 incidents, your email as customer
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {demoError && (
                  <p className="text-[11px] text-red-400">{demoError}</p>
                )}
                {demoSeedDone ? (
                  <div className="rounded-[6px] border border-[rgb(16,185,129,0.3)] bg-[rgb(16,185,129,0.07)] px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={11} className="text-[var(--accent-green)]" />
                      <span className="text-[11px] font-semibold text-[var(--accent-green)]">4 incidents seeded</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-3)]">
                      Check Pending Review above — then click the draft, review docs, and Send to trigger real emails.
                    </p>
                    <p className="text-[10px] text-[var(--text-3)]">
                      Customer email → <span className="font-mono">altalib.hasan05@gmail.com</span>
                    </p>
                    <p className="text-[10px] text-[var(--text-3)]">
                      Hub manager → <span className="font-mono">ammar.abdulaziz@graduate.utm.my</span>
                    </p>
                  </div>
                ) : (
                  <Button
                    onClick={handleDemoSeed}
                    disabled={demoSeeding}
                    className="w-full"
                    style={{ background: 'rgba(255,140,0,0.15)', color: '#FF8C00', border: '1px solid rgba(255,140,0,0.3)' }}
                  >
                    {demoSeeding ? (
                      <><Loader2 size={13} className="animate-spin" /> Generating 4 docs (up to 30s)…</>
                    ) : (
                      <><Zap size={13} /> Seed Demo Cluster</>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Zone 2+3: right column ── */}
          <div className="space-y-4">

            {generating ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 py-12">
                  <Loader2 size={32} className="animate-spin text-[#3B82F6]" />
                  <div className="text-center">
                    <p className="font-medium text-[var(--text-1)]">Generating 4 documents…</p>
                    <p className="mt-1 text-sm text-[var(--text-3)]">
                      Hub notice, customer email, FAQ entry, and PCC playbook are being written simultaneously.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : !hasDocs ? (
              <Card>
                <CardContent className="py-12">
                  <EmptyState
                    title="Select a pattern to generate documents"
                    subtitle="Choose an active pattern on the left, or fill in the manual form below."
                  />
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Document workspace */}
                <Card>
                  <CardHeader className="pb-0">
                    {/* Doc type tab bar */}
                    <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-0">
                      {DOC_TYPES.map((doc) => {
                        const Icon = doc.icon;
                        const isActive = activeDocTab === doc.key;
                        return (
                          <button
                            key={doc.key}
                            onClick={() => setActiveDocTab(doc.key)}
                            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-medium -mb-px transition-colors ${
                              isActive
                                ? 'border-[#D40511] text-[var(--text-1)]'
                                : 'border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]'
                            }`}
                          >
                            <Icon size={12} />
                            {doc.label}
                          </button>
                        );
                      })}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <p className="text-[11px] text-[var(--text-3)]">
                      {DOC_TYPES.find((d) => d.key === activeDocTab)?.desc}
                    </p>
                    <Textarea
                      value={docEdits[activeDocTab] || ''}
                      onChange={(e) => handleDocChange(activeDocTab, e.target.value)}
                      disabled={alreadySent}
                      className="min-h-[320px] font-mono text-[13px] leading-relaxed"
                      placeholder="Document content will appear here after generation…"
                    />
                    {!alreadySent && (
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-[var(--text-3)]">
                          Edits auto-saved as you type
                        </p>
                        <button
                          onClick={() => handleRegenerate(activeDocTab)}
                          disabled={!!regenerating}
                          className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-2)] hover:border-[#3B82F6] hover:text-[#3B82F6] disabled:opacity-50"
                        >
                          {regenerating === activeDocTab ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <RefreshCw size={11} />
                          )}
                          Regenerate
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Send workflow */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {alreadySent ? 'Documents Sent' : 'Send Selected Documents'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {sendResult ? (
                      <div className="rounded-[6px] border border-[var(--accent-green)]/20 bg-[rgb(16,185,129,0.08)] px-4 py-4 space-y-3">
                        <div className="flex items-center gap-2 font-semibold text-[var(--accent-green)]">
                          <CheckCircle2 size={16} />
                          {sendResult.count} document{sendResult.count !== 1 ? 's' : ''} sent successfully
                        </div>

                        {/* Delivery receipts */}
                        <div className="space-y-2 pt-1 border-t border-[rgb(16,185,129,0.15)]">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                            Delivery confirmation
                          </p>
                          {currentSend?.sentDocuments?.map((docKey) => {
                            const cfg = RECIPIENT_CFG[docKey];
                            const doc = DOC_TYPES.find(d => d.key === docKey);
                            if (!cfg || !doc) return null;
                            const DIcon = doc.icon;
                            const recipient = docKey === 'hubNotice'
                              ? deriveHubEmail(currentSend.location || effectiveLocation)
                              : docKey === 'customerEmail' && currentSend.customerEmailsContacted?.length
                                ? `${currentSend.customerEmailsContacted.length} customers`
                                : cfg.label;
                            return (
                              <div key={docKey} className="flex items-center gap-2">
                                <CheckCircle2 size={11} style={{ color: 'var(--accent-green)' }} />
                                <DIcon size={11} style={{ color: cfg.color }} />
                                <span className="text-[11px] text-[var(--text-2)] flex-1">{doc.label}</span>
                                <span className="text-[11px] font-medium" style={{ color: cfg.color }}>{recipient}</span>
                              </div>
                            );
                          })}
                          {/* Customer email list */}
                          {currentSend?.customerEmailsContacted?.length > 0 && (
                            <div className="ml-5 space-y-1 pt-1">
                              {currentSend.customerEmailsContacted.slice(0, 4).map(email => (
                                <div key={email} className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-[var(--text-3)]">→</span>
                                  <span className="text-[10px] text-[var(--text-2)]">{email}</span>
                                </div>
                              ))}
                              {currentSend.customerEmailsContacted.length > 4 && (
                                <p className="text-[10px] text-[var(--text-3)]">
                                  +{currentSend.customerEmailsContacted.length - 4} more customers
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {sendResult.prevented > 0 && (
                          <p className="text-sm text-[var(--text-2)] pt-1 border-t border-[rgb(16,185,129,0.15)]">
                            Estimated to prevent{' '}
                            <span className="font-semibold text-[var(--text-1)]">
                              ~{sendResult.prevented} complaints
                            </span>{' '}
                            based on historical patterns.
                          </p>
                        )}
                      </div>
                    ) : alreadySent ? (
                      <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-2)]">
                        Sent {formatTs(currentSend.sentAt)} by {currentSend.sentBy || 'unknown'} ·{' '}
                        {currentSend.sentDocuments?.map((k) => DOC_LABEL[k] || k).join(', ')}
                      </div>
                    ) : (
                      <>
                        {/* Recipient preview */}
                        {Object.values(checked).some(Boolean) && (
                          <div className="rounded-[6px] border border-[var(--border)] p-3 mb-1"
                               style={{ background: 'var(--nexus-surface-2)' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-2.5">
                              Who receives each document
                            </p>
                            <div className="space-y-2">
                              {DOC_TYPES.filter(d => checked[d.key]).map((doc) => {
                                const cfg = RECIPIENT_CFG[doc.key];
                                const DIcon = doc.icon;
                                const recipient = doc.key === 'hubNotice'
                                  ? deriveHubEmail(effectiveLocation)
                                  : doc.key === 'customerEmail'
                                    ? `${selectedCluster?.count || clusters.find(c => c.type === effectiveType && c.location === effectiveLocation)?.count || '?'} customers`
                                    : cfg.label;
                                return (
                                  <div key={doc.key} className="flex items-center gap-2.5">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
                                         style={{ background: `${cfg.color}18` }}>
                                      <DIcon size={11} style={{ color: cfg.color }} />
                                    </div>
                                    <span className="text-[11px] text-[var(--text-2)] w-28 shrink-0">{doc.label}</span>
                                    <span className="text-[11px] text-[var(--text-3)]">→</span>
                                    <span className="text-[11px] font-medium" style={{ color: cfg.color }}>{recipient}</span>
                                    <span className="ml-auto text-[9px] rounded px-1.5 py-0.5"
                                          style={{ background: `${cfg.color}12`, color: cfg.color }}>
                                      {cfg.channel}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          {DOC_TYPES.map((doc) => (
                            <label
                              key={doc.key}
                              className="flex cursor-pointer items-center gap-2.5 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 hover:border-[rgb(59,130,246,0.3)]"
                            >
                              <input
                                type="checkbox"
                                checked={checked[doc.key]}
                                onChange={(e) =>
                                  setChecked((prev) => ({ ...prev, [doc.key]: e.target.checked }))
                                }
                                className="h-3.5 w-3.5 accent-[#3B82F6]"
                              />
                              <span className="text-[12px] font-medium text-[var(--text-1)]">
                                {doc.label}
                              </span>
                            </label>
                          ))}
                        </div>
                        <Button
                          onClick={handleSend}
                          disabled={sending || !Object.values(checked).some(Boolean)}
                          className="w-full"
                        >
                          {sending ? (
                            <><Loader2 size={14} className="animate-spin" /> Sending…</>
                          ) : (
                            <><Send size={14} /> Send Selected</>
                          )}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* ── Send history ── */}
            <Card>
              <CardHeader>
                <CardTitle>Send History</CardTitle>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="space-y-2">
                    {[0, 1].map((i) => <LoadingSkeleton key={i} height={52} width="100%" />)}
                  </div>
                ) : sentHistory.length === 0 ? (
                  <p className="py-4 text-center text-sm text-[var(--text-3)]">
                    No proactive communications sent yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {sentHistory.map((h) => (
                      <div
                        key={h._id}
                        className="flex flex-wrap items-start justify-between gap-2 py-3"
                      >
                        <div>
                          <p className="text-[12px] font-medium text-[var(--text-1)]">
                            {h.location} — {(h.incidentType || '').replace(/_/g, ' ')}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[var(--text-3)]">
                            {formatTs(h.sentAt)} · {h.sentDocuments?.length ?? 0} docs
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {h.sentDocuments?.map((k) => {
                              const cfg = RECIPIENT_CFG[k];
                              return cfg ? (
                                <span key={k} className="rounded px-1.5 py-0.5 text-[9px] font-medium"
                                      style={{ background: `${cfg.color}12`, color: cfg.color }}>
                                  {DOC_LABEL[k]}
                                </span>
                              ) : null;
                            })}
                          </div>
                          {h.customerEmailsContacted?.length > 0 && (
                            <p className="mt-1 text-[10px] text-[var(--text-3)]">
                              {h.customerEmailsContacted.length} customer{h.customerEmailsContacted.length !== 1 ? 's' : ''} notified ·{' '}
                              {h.customerEmailsContacted.slice(0, 2).join(', ')}
                              {h.customerEmailsContacted.length > 2 ? ` +${h.customerEmailsContacted.length - 2} more` : ''}
                            </p>
                          )}
                        </div>
                        {h.estimatedComplaintsPrevented > 0 && (
                          <span className="rounded-full border border-[var(--accent-green)]/30 bg-[rgb(16,185,129,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-green)]">
                            ~{h.estimatedComplaintsPrevented} prevented
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </Layout>
  );
}
