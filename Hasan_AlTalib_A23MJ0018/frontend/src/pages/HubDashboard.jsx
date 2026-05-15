import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, CheckCircle2, Clock, ExternalLink,
  Layers, MapPin, RefreshCw, TrendingUp, Zap,
} from 'lucide-react';
import Layout from '../components/Layout';
import MalaysiaMapLeaflet from '../components/MalaysiaMapLeaflet';
import { useView } from '../context/ViewContext';
import {
  getAdminAnalytics, getAdminClusters, getIncidents, getMorningBriefing,
} from '../lib/api';

// ── Design tokens ────────────────────────────────────────────────────────────
const RED    = '#D40511';
const MONO   = '"JetBrains Mono","Fira Code",monospace';
const BORDER = 'var(--nexus-border)';
const S1     = 'var(--nexus-surface-1)';
const S2     = 'var(--nexus-surface-2)';

const SEV_COLOR = { Critical: '#D40511', High: '#F59E0B', Medium: '#FF8C00', Low: '#10B981' };
const STATUS_COLOR = {
  PENDING_REVIEW: '#F59E0B', DRAFT: '#FF8C00', UNDER_REVIEW: '#0EA5E9',
  ASSIGNED: '#0EA5E9', IN_PROGRESS: '#0EA5E9', RESOLVED: '#10B981', BREACHED: '#D40511',
};

function timeAgo(date) {
  if (!date) return '—';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Hub KPI Card ─────────────────────────────────────────────────────────────
function HubKpiCard({ label, value, sub, color, icon: Icon, pulse, warn }) {
  return (
    <div style={{
      background: S1, border: `1px solid ${warn ? `${color}35` : BORDER}`,
      borderRadius: 10, padding: '16px 18px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse at 0 0, ${color}08 0%, transparent 65%)` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={12} color={color} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--nexus-text-3)' }}>{label}</span>
        {pulse && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}90`, animation: 'hubPulse 1.8s ease-in-out infinite' }} />}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <p style={{ fontSize: 10, color: 'var(--nexus-text-3)', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// ── Incident Row ──────────────────────────────────────────────────────────────
function HubIncidentRow({ inc, navigate }) {
  const sev = SEV_COLOR[inc.severity] || '#FF8C00';
  const sta = STATUS_COLOR[inc.status] || 'var(--nexus-text-3)';
  const ref = inc.ref || `INC-${(inc._id || '').slice(-6).toUpperCase()}`;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      borderRadius: 7, background: 'var(--nexus-surface-2)',
      border: `1px solid ${inc.status === 'BREACHED' ? `${RED}30` : BORDER}`,
      borderLeft: `3px solid ${sev}`,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: sev, minWidth: 82, flexShrink: 0 }}>{ref}</span>
      <span style={{ fontSize: 11, color: 'var(--nexus-text-2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {(inc.type || inc.incidentType || '').replace(/_/g, ' ')}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: sta, flexShrink: 0 }}>{(inc.status || '').replace(/_/g, ' ')}</span>
      <span style={{ fontSize: 10, color: 'var(--nexus-text-3)', flexShrink: 0 }}>{timeAgo(inc.updatedAt || inc.createdAt)}</span>
      <button
        type="button"
        onClick={() => navigate(`/incidents/${inc._id}`)}
        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 4, background: 'var(--nexus-surface-2)', border: 'none', cursor: 'pointer', color: 'var(--nexus-text-2)', fontSize: 10, flexShrink: 0 }}
      >
        <ExternalLink size={9} /> View
      </button>
    </div>
  );
}

// ── Cluster Card ──────────────────────────────────────────────────────────────
function ClusterCard({ cluster }) {
  const color = cluster.count >= 5 ? RED : cluster.count >= 3 ? '#F59E0B' : '#FF8C00';
  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, background: `${color}08`, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <AlertTriangle size={13} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--nexus-text-1)' }}>{(cluster.type || cluster.incidentType || '').replace(/_/g, ' ')}</div>
        <div style={{ fontSize: 10, color: 'var(--nexus-text-2)' }}>{cluster.count} incidents · {cluster.location || cluster.hub}</div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color }}>{cluster.count}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HubDashboard() {
  const navigate    = useNavigate();
  const { selectedHub } = useView();

  const [analytics, setAnalytics] = useState(null);
  const [clusters,  setClusters]  = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [pulse,     setPulse]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(quiet = false) {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [an, cl, inc, p] = await Promise.allSettled([
        getAdminAnalytics(),
        getAdminClusters(),
        getIncidents({ location: selectedHub, limit: 15 }),
        getMorningBriefing(),
      ]);
      if (an.status === 'fulfilled' && an.value) setAnalytics(an.value);
      if (cl.status === 'fulfilled' && cl.value) setClusters(cl.value?.clusters || cl.value || []);
      if (inc.status === 'fulfilled' && inc.value) setIncidents(inc.value?.incidents || inc.value || []);
      if (p.status === 'fulfilled' && p.value)  setPulse(p.value);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [selectedHub]);

  // Derive hub-specific metrics
  const hubIncidentCount = analytics?.byLocation?.[selectedHub] ?? 0;
  const hubClusters      = useMemo(() => clusters.filter(c => (c.location || c.hub) === selectedHub), [clusters, selectedHub]);
  const pendingAtHub     = useMemo(() => incidents.filter(i => i.status === 'PENDING_REVIEW').length, [incidents]);
  const breachedAtHub    = useMemo(() => incidents.filter(i => i.status === 'BREACHED').length,       [incidents]);
  const needsAction      = useMemo(() =>
    (pulse?.needsActionNow || []).filter(i => i.location === selectedHub).slice(0, 5),
    [pulse, selectedHub]
  );

  const hubStatus = breachedAtHub > 0 ? 'BREACHED' : hubClusters.length > 0 ? 'CLUSTER ALERT' : 'OPERATIONAL';
  const hubStatusColor = hubStatus === 'BREACHED' ? RED : hubStatus === 'CLUSTER ALERT' ? '#F59E0B' : '#10B981';

  if (loading) {
    return (
      <Layout title="Hub Dashboard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10, color: 'var(--nexus-text-3)' }}>
          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13 }}>Loading hub data…</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Hub Dashboard">
      <style>{`
        @keyframes hubPulse { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Hub Banner ── */}
        <div style={{
          background: S1, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16,
          borderLeft: `4px solid ${hubStatusColor}`,
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: `${hubStatusColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MapPin size={20} color={hubStatusColor} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--nexus-text-1)', letterSpacing: '-0.02em', margin: 0 }}>{selectedHub}</h1>
              <span style={{
                fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                padding: '2px 8px', borderRadius: 99,
                background: `${hubStatusColor}18`, color: hubStatusColor, border: `1px solid ${hubStatusColor}30`,
              }}>
                ● {hubStatus}
              </span>
              {refreshing && <RefreshCw size={12} color="var(--nexus-text-3)" style={{ animation: 'spin 1s linear infinite' }} />}
            </div>
            <p style={{ fontSize: 12, color: 'var(--nexus-text-3)', margin: 0 }}>
              Hub Manager Dashboard · Live incident intelligence for your location
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/hub/alerts')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, color: 'var(--nexus-text-2)', cursor: 'pointer' }}
            >
              <Bell size={13} /> My Alerts
            </button>
            <button
              type="button"
              onClick={() => load(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: `${RED}12`, border: `1px solid ${RED}30`, color: RED, cursor: 'pointer' }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* ── KPI Strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <HubKpiCard label="Hub Incidents"  value={hubIncidentCount} sub="total at this hub"     color="#0EA5E9"  icon={TrendingUp} />
          <HubKpiCard label="Pending Review" value={pendingAtHub}     sub="awaiting your action"  color="#F59E0B"  icon={Clock}      warn={pendingAtHub > 0} pulse={pendingAtHub > 0} />
          <HubKpiCard label="Active Clusters" value={hubClusters.length} sub="incident clusters"  color="#FF8C00"  icon={Layers}     warn={hubClusters.length > 0} />
          <HubKpiCard label="SLA Breached"   value={breachedAtHub}   sub="urgent — overdue"       color={RED}      icon={Zap}        warn={breachedAtHub > 0} pulse={breachedAtHub > 0} />
        </div>

        {/* ── Main content ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>

          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Needs Action Now */}
            <div style={{ background: S1, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 3, height: 14, borderRadius: 99, background: RED, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nexus-text-1)' }}>Needs Action Now</span>
                {needsAction.length > 0 && (
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `${RED}18`, color: RED }}>
                    {needsAction.length}
                  </span>
                )}
                <button type="button" onClick={() => navigate('/board')} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--nexus-text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Full Board <ExternalLink size={9} />
                </button>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {needsAction.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: '#10B981' }}>
                    <CheckCircle2 size={15} />
                    <span style={{ fontSize: 12 }}>All clear — no critical items at {selectedHub}</span>
                  </div>
                ) : needsAction.map(item => (
                  <a
                    key={item.incidentId}
                    href={`/incidents/${item.incidentId}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, textDecoration: 'none' }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: RED, minWidth: 82 }}>
                      INC-{(item.incidentId || '').slice(-6).toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--nexus-text-2)', flex: 1 }}>{(item.type || '').replace(/_/g, ' ')}</span>
                    <span style={{
                      fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: `${SEV_COLOR[item.severity] || '#FF8C00'}18`,
                      color: SEV_COLOR[item.severity] || '#FF8C00',
                    }}>{item.severity}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: item.hoursUntilBreach < 0 ? RED : item.hoursUntilBreach < 2 ? '#F59E0B' : 'var(--nexus-text-3)' }}>
                      {item.hoursUntilBreach < 0
                        ? `${Math.abs(item.hoursUntilBreach).toFixed(1)}h overdue`
                        : `${item.hoursUntilBreach.toFixed(1)}h left`}
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {/* Recent incidents at this hub */}
            <div style={{ background: S1, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 3, height: 14, borderRadius: 99, background: '#0EA5E9', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nexus-text-1)' }}>Recent Incidents at {selectedHub}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--nexus-text-3)' }}>{incidents.length} loaded</span>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {incidents.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--nexus-text-3)', textAlign: 'center', padding: '20px 0' }}>No incidents found for this hub</p>
                ) : incidents.slice(0, 10).map(inc => (
                  <HubIncidentRow key={inc._id} inc={inc} navigate={navigate} />
                ))}
                {incidents.length > 10 && (
                  <button type="button" onClick={() => navigate('/board')} style={{ fontSize: 11, color: RED, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center', padding: '4px 0' }}>
                    View all {incidents.length} incidents on the Board →
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Active clusters at this hub */}
            <div style={{ background: S1, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 3, height: 14, borderRadius: 99, background: '#FF8C00', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nexus-text-1)' }}>Active Clusters</span>
              </div>
              <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {hubClusters.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 0', color: '#10B981' }}>
                    <CheckCircle2 size={14} />
                    <span style={{ fontSize: 11 }}>No clusters at this hub</span>
                  </div>
                ) : hubClusters.map((c, i) => <ClusterCard key={i} cluster={c} />)}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{ background: S1, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nexus-text-1)' }}>Quick Actions</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'View Incident Board', desc: 'All incidents at your hub', path: '/board', color: '#0EA5E9' },
                  { label: 'My Alerts Inbox', desc: 'NEXUS proactive alerts', path: '/hub/alerts', color: '#FF8C00' },
                  { label: 'Ask NEXUS',         desc: 'AI operations assistant', path: '/ops-chat', color: RED },
                ].map(action => (
                  <button
                    key={action.path}
                    type="button"
                    onClick={() => navigate(action.path)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 7, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, cursor: 'pointer', textAlign: 'left', transition: 'border-color 150ms' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${action.color}35`; e.currentTarget.style.background = `${action.color}07`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = 'var(--nexus-surface-2)'; }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: action.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--nexus-text-1)' }}>{action.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--nexus-text-3)' }}>{action.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Overnight summary */}
            {pulse && (
              <div style={{ background: S1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--nexus-text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Overnight Summary</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'New incidents',    value: pulse.overnight?.newIncidents ?? '—' },
                    { label: 'Resolved',          value: pulse.overnight?.resolvedIncidents ?? '—' },
                    { label: 'Near breach',       value: pulse.slaRisk?.nearBreach ?? '—',  warn: (pulse.slaRisk?.nearBreach ?? 0) > 0 },
                    { label: 'SLA breached',      value: pulse.slaRisk?.breached ?? '—',    warn: (pulse.slaRisk?.breached ?? 0) > 0 },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--nexus-text-2)' }}>{row.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: row.warn ? '#F59E0B' : 'var(--nexus-text-1)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Map ── */}
        <div style={{ background: S1, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 3, height: 14, borderRadius: 99, background: '#10B981', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nexus-text-1)' }}>Malaysia Operations Map</span>
            <span style={{ fontSize: 11, color: 'var(--nexus-text-3)', marginLeft: 6 }}>- your hub highlighted</span>
          </div>
          <div style={{ padding: 16 }}>
            <MalaysiaMapLeaflet
              byLocation={analytics?.byLocation}
              byType={analytics?.byType}
              clusters={clusters}
              cascadeRisk={[]}
              highlightHub={selectedHub}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
