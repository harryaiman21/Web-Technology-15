import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, MapPin, Search, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import EmptyState from '../components/EmptyState';
import KanbanColumn from '../components/KanbanColumn';
import Layout from '../components/Layout';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { getAdminAnalytics, getAdminClusters, getIncidents } from '../lib/api';
import { useView } from '../context/ViewContext';

const BOARD_COLUMNS = [
  { id: 'DRAFT', title: 'Incoming', subtitle: 'AI is processing' },
  { id: 'PENDING_REVIEW', title: 'Needs Your Decision', subtitle: 'Awaiting human review' },
  { id: 'UNDER_REVIEW', title: 'Under Review', subtitle: 'Being assessed' },
  { id: 'ASSIGNED', title: 'Assigned', subtitle: 'Routed to department' },
  { id: 'IN_PROGRESS', title: 'In Progress', subtitle: 'Resolution underway' },
  { id: 'BREACHED', title: 'SLA Breached', subtitle: 'Needs urgent attention' },
  { id: 'RESOLVED', title: 'Resolved', subtitle: 'Closed successfully' },
  { id: 'CLOSED', title: 'Closed', subtitle: 'Archived incident' },
];

const TYPES = [
  'all',
  'late_delivery',
  'damaged_parcel',
  'missing_parcel',
  'address_error',
  'system_error',
  'wrong_item',
  'other',
];

const SOURCES = ['all', 'manual', 'rpa'];
const SEVERITIES = ['all', 'Critical', 'High', 'Medium', 'Low'];
const DEPARTMENTS = ['all', 'Operations', 'Customer Service', 'IT', 'Logistics'];
const INITIAL_VISIBLE = 8;
const LOAD_MORE_STEP = 20;

function FilterChip({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-[999px] border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(34,211,238,0.45)] ${
        active
          ? 'border-[var(--nexus-cyan)] bg-[rgba(34,211,238,0.1)] text-[var(--nexus-cyan)]'
          : 'border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] text-[var(--text-2)] hover:bg-[var(--nexus-surface-3)] hover:text-[var(--text-1)]'
      }`}
    >
      {label}
    </button>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 4 }).map((_, columnIndex) => (
        <div
          key={columnIndex}
          className="w-[320px] shrink-0 rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] p-4"
        >
          <LoadingSkeleton height={16} width="45%" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((__, cardIndex) => (
              <div key={cardIndex} className="rounded-[6px] border border-[var(--border)] p-4">
                <LoadingSkeleton height={12} width="50%" />
                <LoadingSkeleton className="mt-3" height={16} width="100%" />
                <LoadingSkeleton className="mt-2" height={16} width="82%" />
                <LoadingSkeleton className="mt-4" height={4} width="100%" rounded={99} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function defaultVisibleState() {
  return Object.fromEntries(BOARD_COLUMNS.map((column) => [column.id, INITIAL_VISIBLE]));
}

export default function Board() {
  const navigate = useNavigate();
  const { viewMode, selectedHub } = useView();
  const isHubManager = viewMode === 'hub_manager';
  const [incidents, setIncidents] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clusterModalOpen, setClusterModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [visibleByStatus, setVisibleByStatus] = useState(defaultVisibleState());
  const [stats, setStats] = useState(null);

  const hasFilters = Boolean(
    search ||
      sourceFilter !== 'all' ||
      severityFilter !== 'all' ||
      typeFilter !== 'all' ||
      departmentFilter !== 'all' ||
      dateFrom ||
      dateTo
  );

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = { limit: 50 };
      if (search.trim()) params.q = search.trim();
      if (sourceFilter !== 'all') params.source = sourceFilter.toLowerCase();
      if (severityFilter !== 'all') params.severity = severityFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      if (departmentFilter !== 'all') params.department = departmentFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const data = await getIncidents(params);
      setIncidents(data.incidents || []);
      setVisibleByStatus(defaultVisibleState());
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, departmentFilter, search, severityFilter, sourceFilter, typeFilter]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchIncidents();
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [fetchIncidents]);

  useEffect(() => {
    let active = true;

    const loadClusters = async () => {
      try {
        const data = await getAdminClusters();
        if (active) {
          setClusters(data || []);
        }
      } catch {
        if (active) {
          setClusters([]);
        }
      }
    };

    loadClusters();
    const intervalId = setInterval(loadClusters, 60000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    getAdminAnalytics()
      .then(setStats)
      .catch(() => {}); // non-fatal — strip just won't show
  }, []);

  // ── Live SSE: incident_created / incident_updated / incident_deleted ────
  // Patches the local incidents state so cards animate between columns
  // without a full refetch. AnimatePresence + layout in KanbanColumn handles
  // the visual transition.
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || '';
    let es = null;
    let reconnectTimer = null;
    let stopped = false;

    function connect() {
      es = new EventSource(`${apiBase}/api/v1/ops/live-stream`, { withCredentials: true });

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data || !data.type) return;

          if (data.type === 'incident_created' && data.incident) {
            setIncidents((prev) => {
              // Avoid dupes if both fetch + SSE deliver
              if (prev.some((p) => String(p._id) === String(data.incident._id))) return prev;
              return [data.incident, ...prev];
            });
            return;
          }

          if (data.type === 'incident_updated' && data.incident) {
            setIncidents((prev) => {
              const idx = prev.findIndex((p) => String(p._id) === String(data.incident._id));
              if (idx === -1) {
                // Updated incident isn't currently in our window — prepend it
                return [data.incident, ...prev];
              }
              const next = [...prev];
              next[idx] = { ...next[idx], ...data.incident };
              return next;
            });
            return;
          }

          if (data.type === 'incident_deleted' && data.incidentId) {
            setIncidents((prev) => prev.filter((p) => String(p._id) !== String(data.incidentId)));
            return;
          }
        } catch {
          /* ignore parse errors */
        }
      };

      es.onerror = () => {
        if (es) es.close();
        if (stopped) return;
        reconnectTimer = window.setTimeout(connect, 4000);
      };
    }

    // Tiny delay so the first fetch lands first and we don't race with auth bootstrap
    const startTimer = window.setTimeout(connect, 800);

    return () => {
      stopped = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, []);

  const clusterByIncidentId = useMemo(() => {
    const map = new Map();

    clusters.forEach((cluster) => {
      (cluster.incidentIds || []).forEach((incidentId) => {
        map.set(String(incidentId), cluster.clusterId);
      });
    });

    return map;
  }, [clusters]);

  const incidentsWithClusters = useMemo(
    () =>
      incidents.map((incident) => ({
        ...incident,
        clusterGroup: incident.clusterGroup || clusterByIncidentId.get(String(incident._id)) || null,
      })),
    [clusterByIncidentId, incidents],
  );

  const incidentsByStatus = useMemo(() => {
    const mapped = Object.fromEntries(BOARD_COLUMNS.map((column) => [column.id, []]));
    const filtered = isHubManager
      ? incidentsWithClusters.filter(i => i.location === selectedHub || i.hub === selectedHub)
      : incidentsWithClusters;
    filtered.forEach((incident) => {
      if (mapped[incident.status]) {
        mapped[incident.status].push(incident);
      }
    });
    return mapped;
  }, [incidentsWithClusters, isHubManager, selectedHub]);

  const clusterHeadline = clusters[0]
    ? `${clusters[0].type.replace(/_/g, ' ')} spike at ${clusters[0].location} (${clusters[0].count} incidents)`
    : '';

  function clearFilters() {
    setSearch('');
    setSourceFilter('all');
    setSeverityFilter('all');
    setTypeFilter('all');
    setDepartmentFilter('all');
    setDateFrom('');
    setDateTo('');
  }

  function loadMore(status) {
    setVisibleByStatus((current) => ({
      ...current,
      [status]: current[status] + LOAD_MORE_STEP,
    }));
  }

  return (
    <Layout title={isHubManager ? `${selectedHub} — Incident Board` : 'Incident Board'}>
      <div className="space-y-4">
        {isHubManager && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 7, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', fontSize: 13, color: '#0EA5E9' }}>
            <MapPin size={14} />
            <span style={{ fontWeight: 600 }}>Hub Manager View</span>
            <span style={{ color: 'rgba(14,165,233,0.6)', marginLeft: 4 }}>— showing incidents for <strong style={{ color: '#0EA5E9' }}>{selectedHub}</strong> only</span>
          </div>
        )}
        {clusters.length > 0 && (
          <button
            type="button"
            onClick={() => setClusterModalOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-[6px] border border-[var(--accent-amber)]/30 bg-[rgb(245,158,11,0.12)] px-4 py-3 text-left text-sm text-[var(--text-1)]"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-[var(--accent-amber)]" aria-hidden="true" />
              {clusters.length} active cluster{clusters.length === 1 ? '' : 's'} detected - {clusterHeadline}
            </span>
            <span className="text-xs uppercase tracking-[0.08em] text-[var(--accent-amber)]">
              View
            </span>
          </button>
        )}

        <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-bg)] p-4 backdrop-blur-xl">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-wrap gap-2">
                {SOURCES.map((source) => (
                  <FilterChip
                    key={source}
                    active={sourceFilter === source}
                    label={source === 'all' ? 'All Sources' : source.toUpperCase()}
                    onClick={() => setSourceFilter(source)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((severity) => (
                  <FilterChip
                    key={severity}
                    active={severityFilter === severity}
                    label={severity === 'all' ? 'All Severities' : severity}
                    onClick={() => setSeverityFilter(severity)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {DEPARTMENTS.map((dept) => (
                  <FilterChip
                    key={dept}
                    active={departmentFilter === dept}
                    label={dept === 'all' ? 'All Departments' : dept}
                    onClick={() => setDepartmentFilter(dept)}
                  />
                ))}
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[520px]">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative flex-1">
                  <label htmlFor="board-search" className="sr-only">
                    Search incidents
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-3.5 text-[var(--text-3)]"
                    size={14}
                    aria-hidden="true"
                  />
                  <Input
                    id="board-search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search incidents, hashes, locations..."
                    className="pl-9"
                  />
                </div>

                <div className="flex flex-col">
                  <label htmlFor="board-type" className="sr-only">
                    Incident type filter
                  </label>
                  <select
                    id="board-type"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className="h-11 rounded-[4px] border border-[var(--nexus-border)] bg-[var(--nexus-surface-3)] px-3 text-sm text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(34,211,238,0.45)]"
                  >
                    {TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === 'all' ? 'All Types' : type.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex-1">
                  <label htmlFor="board-date-from" className="sr-only">
                    From date
                  </label>
                  <Input
                    id="board-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="board-date-to" className="sr-only">
                    To date
                  </label>
                  <Input
                    id="board-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </div>
                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="justify-start md:justify-center"
                  >
                    <X size={14} aria-hidden="true" />
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-bg)] px-4 py-3 text-center">
              <p className="text-2xl font-bold tabular-nums text-[var(--nexus-cyan)]">
                {stats.preventedThisWeek ?? 0}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">complaints prevented this week</p>
            </div>
            <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-bg)] px-4 py-3 text-center">
              <p className="text-2xl font-bold tabular-nums text-[var(--text-1)]">
                {stats.avgResolutionMinutes || stats.avgResolutionHours
                  ? `${stats.avgResolutionMinutes ?? Math.round((stats.avgResolutionHours ?? 0) * 60)} min`
                  : '—'}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">avg resolution time</p>
            </div>
            <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-bg)] px-4 py-3 text-center">
              <p className="text-2xl font-bold tabular-nums text-[var(--accent-amber)]">
                {clusters.length}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-3)]">active clusters detected</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-[6px] border-l-[3px] border-[var(--accent-red)] bg-[rgb(239,68,68,0.1)] px-4 py-3 text-sm text-[var(--text-1)]">
            <div className="flex items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={fetchIncidents}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
            <BoardSkeleton />
          </div>
        ) : incidents.length === 0 ? (
          <EmptyState
            title="No incidents found"
            subtitle="Adjust your filters or submit a new report"
            actions={[
              { label: 'Clear Filters', onClick: clearFilters, variant: 'outline' },
              { label: 'Submit Incident', onClick: () => navigate('/intake') },
            ]}
            className="min-h-[260px]"
          />
        ) : (
          <div className="overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex min-h-[640px] gap-4">
              {BOARD_COLUMNS.map((column) => {
                const allIncidents = incidentsByStatus[column.id] || [];
                const visibleIncidents = allIncidents.slice(0, visibleByStatus[column.id]);
                const canLoadMore = allIncidents.length > visibleIncidents.length;

                return (
                  <KanbanColumn
                    key={column.id}
                    id={column.id}
                    title={column.title}
                    subtitle={column.subtitle}
                    count={allIncidents.length}
                    incidents={visibleIncidents}
                    canLoadMore={canLoadMore}
                    onLoadMore={() => loadMore(column.id)}
                    onCardClick={(incidentId) => navigate(`/incidents/${incidentId}`)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {clusterModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nexus-modal-backdrop)] px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-panel-solid)] shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-1)]">Active Clusters</h2>
                <p className="text-sm text-[var(--text-3)]">Duplicate or spike groups detected in the last 72 hours.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setClusterModalOpen(false)}>
                Close
              </Button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
              {clusters.map((cluster) => (
                <div key={cluster.clusterId} className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-1)]">
                        {cluster.type.replace(/_/g, ' ')} - {cluster.location}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-3)]">
                        First seen {new Date(cluster.firstSeen).toLocaleString('en-GB')} - Last seen {new Date(cluster.lastSeen).toLocaleString('en-GB')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-[2px] bg-[rgb(245,158,11,0.12)] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--accent-amber)]">
                        {cluster.count} incidents
                      </span>
                      <Link
                        to={`/proactive?type=${encodeURIComponent(cluster.type)}&location=${encodeURIComponent(cluster.location)}`}
                        onClick={() => setClusterModalOpen(false)}
                        className="rounded-[4px] border border-[rgb(59,130,246,0.35)] bg-[rgb(59,130,246,0.08)] px-2 py-1 text-[10px] font-semibold text-[#3B82F6] hover:bg-[rgb(59,130,246,0.15)] transition-colors"
                      >
                        Proactive Response →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </Layout>
  );
}
