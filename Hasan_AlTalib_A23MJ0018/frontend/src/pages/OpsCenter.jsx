import { useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, Bell, Bot, Brain, CheckCircle2, ChevronRight,
  Cpu, Mail, Play, RefreshCw, RotateCcw, Send, Shield, TrendingUp,
  X, Zap, Network, Users, Database,
} from 'lucide-react';
import Layout from '../components/Layout';
import { startOpsDemo, resetOpsDemo, getOpsSummary } from '../lib/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const EVENT_CFG = {
  bot_started:        { Icon: Bot,           color: '#10B981', bg: 'rgba(16,185,129,0.12)',  label: 'BOT ONLINE'  },
  email_scan:         { Icon: Mail,          color: '#0EA5E9', bg: 'rgba(14,165,233,0.10)',  label: 'INBOX SCAN'  },
  classified:         { Icon: Cpu,           color: '#FF8C00', bg: 'rgba(129,140,248,0.10)', label: 'CLASSIFIED'  },
  response_sent:      { Icon: CheckCircle2,  color: '#10B981', bg: 'rgba(16,185,129,0.08)',  label: 'RESPONDED'   },
  sentiment_detected: { Icon: TrendingUp,    color: '#FF8C00', bg: 'rgba(167,139,250,0.08)', label: 'SENTIMENT'   },
  escalated:          { Icon: AlertTriangle, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  label: 'ESCALATED'   },
  rpa_file_timeline:  { Icon: Database,      color: '#22D3EE', bg: 'rgba(34,211,238,0.10)',  label: 'FILE STEP'   },
  rpa_batch_intelligence: { Icon: Brain,     color: '#F87171', bg: 'rgba(212,5,17,0.12)',    label: 'BRAIN PACKET' },
  cluster_detected:   { Icon: Activity,      color: '#F97316', bg: 'rgba(249,115,22,0.12)',  label: 'CLUSTER'     },
  cascade_alert:      { Icon: Zap,           color: '#D40511', bg: 'rgba(212,5,17,0.14)',    label: 'CASCADE'     },
  bot_summary:        { Icon: Shield,        color: '#10B981', bg: 'rgba(16,185,129,0.12)',  label: 'COMPLETE'    },
  bot_idle:           { Icon: Bot,           color: '#475569', bg: 'rgba(71,85,105,0.10)',   label: 'BOT IDLE'    },
  notification_sent:  { Icon: Send,          color: '#FFCC00', bg: 'rgba(6,182,212,0.10)',   label: 'NOTIFIED'    },
};

const TYPE_COLORS = {
  late_delivery:  '#D40511',
  damaged_parcel: '#F59E0B',
  customs_delay:  '#8B5CF6',
  address_error:  '#0EA5E9',
  missing_item:   '#10B981',
};

const HUB_SHORT = {
  'Shah Alam Hub': 'Shah Alam',
  'KLIA Cargo': 'KLIA',
  'Subang Jaya Depot': 'Subang Jaya',
  'Penang Hub': 'Penang',
  'JB Distribution': 'JB Dist.',
};

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-MY', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function SentimentBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] text-[var(--nexus-text-2)]">{label}</span>
        <span className="text-[12px] font-bold font-mono" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--nexus-border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MiniBar({ value, max, color = '#0EA5E9' }) {
  return (
    <div className="h-1 w-full rounded-full bg-[var(--nexus-border)] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%`, background: color }}
      />
    </div>
  );
}

const CLICKABLE_TYPES = new Set([
  'classified', 'response_sent', 'escalated', 'cluster_detected',
  'cascade_alert', 'sentiment_detected', 'notification_sent',
  'rpa_file_timeline', 'rpa_batch_intelligence',
]);

function EventDetailDrawer({ event, onClose }) {
  if (!event) return null;
  const cfg     = EVENT_CFG[event.type] || { color: '#6B7280', label: event.type };
  const meta    = event.meta || {};
  const isEsc   = event.type === 'escalated';
  const isCluster = event.type === 'cluster_detected' || event.type === 'cascade_alert';

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col overflow-hidden shadow-2xl"
        style={{ background: 'var(--nexus-surface-2)', borderLeft: '1px solid var(--nexus-border)' }}
      >
        <div className="flex items-center justify-between border-b border-[var(--nexus-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: `${cfg.color}18` }}
            >
              {(() => {
                const Icon = (EVENT_CFG[event.type] || {}).Icon || Activity;
                return <Icon size={13} style={{ color: cfg.color }} />;
              })()}
            </div>
            <div>
              <span
                className="text-[10px] font-bold tracking-[0.12em]"
                style={{ color: cfg.color }}
              >
                {cfg.label}
              </span>
              <p className="text-[13px] font-semibold text-[var(--nexus-text-1)] leading-tight mt-0.5">
                {event.message}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--nexus-border)] text-[var(--nexus-text-2)] transition-colors hover:border-[var(--nexus-text-3)] hover:text-[var(--nexus-text-1)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-[var(--nexus-border)] px-5 py-3">
          {meta.customer     && <Chip label="Customer"   value={meta.customer}                         />}
          {meta.filename     && <Chip label="File"       value={meta.filename}                         />}
          {meta.stage        && <Chip label="Stage"      value={meta.stage.replace(/_/g, ' ')} color="#22D3EE" />}
          {meta.hub          && <Chip label="Hub"        value={meta.hub}                              />}
          {meta.topHub       && <Chip label="Top Hub"    value={meta.topHub} color="#22D3EE"            />}
          {meta.topType      && <Chip label="Top Type"   value={meta.topType.replace(/_/g, ' ')} color="#F87171" />}
          {meta.incidentType && <Chip label="Type"       value={meta.incidentType.replace(/_/g, ' ')} color={TYPE_COLORS[meta.incidentType]} />}
          {meta.confidence   && <Chip label="Confidence" value={`${Math.round(meta.confidence * 100)}%`} color="#FF8C00" />}
          {meta.awb          && <Chip label="AWB"        value={meta.awb}                              />}
          {meta.priority     && <Chip label="Priority"   value={meta.priority} color={meta.priority === 'critical' ? '#D40511' : meta.priority === 'high' ? '#F59E0B' : '#6B7280'} />}
          {meta.alertId      && <Chip label="Alert"      value={meta.alertId}  color="#D40511"          />}
          {meta.sop          && <Chip label="SOP"        value={meta.sop}                              />}
          {event.createdAt   && <Chip label="Time"       value={new Date(event.createdAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} />}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {meta.emailBody && (
            <Section icon={Mail} color="#0EA5E9" title="Customer Email">
              <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--nexus-text-2)] font-mono">{meta.emailBody}</pre>
            </Section>
          )}

          {meta.aiResponse && (
            <Section icon={CheckCircle2} color="#10B981" title="AI Response Sent"
              badge={meta.sop ? { label: 'SOP', value: meta.sop, color: '#10B981' } : undefined}
            >
              <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--nexus-text-2)] font-mono">{meta.aiResponse}</pre>
            </Section>
          )}

          {isEsc && meta.reasoning?.escalationDetail && (
            <Section icon={AlertTriangle} color="#F59E0B" title="Escalation Reason">
              <p className="text-[12px] text-[#F59E0B] leading-relaxed">{meta.reasoning.escalationDetail}</p>
            </Section>
          )}

          {meta.reasoning && !isCluster && (
            <Section icon={Brain} color="#FF8C00" title="Why This Response">
              {meta.reasoning.sopTitle && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-[var(--nexus-text-3)] uppercase tracking-wide">SOP Matched</span>
                  <span className="rounded-md bg-[#FF8C00]/10 px-2 py-0.5 text-[11px] text-[#FF8C00]">{meta.reasoning.sopTitle}</span>
                </div>
              )}
              {Array.isArray(meta.reasoning.factors) && meta.reasoning.factors.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--nexus-text-3)]">Decision Factors</p>
                  <ul className="space-y-1.5">
                    {meta.reasoning.factors.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <ChevronRight size={11} className="mt-0.5 shrink-0 text-[#FF8C00]" />
                        <span className="text-[11px] text-[var(--nexus-text-2)] leading-relaxed">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(meta.reasoning.similarCases) && meta.reasoning.similarCases.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--nexus-text-3)]">Similar Resolved Cases</p>
                  <div className="rounded-lg border border-[var(--nexus-border)] overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-[var(--nexus-border)] bg-[var(--nexus-bg)]">
                          {['Customer', 'Hub', 'Date', 'Score'].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--nexus-text-3)] uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {meta.reasoning.similarCases.map((c, i) => (
                          <tr key={i} className="border-b border-[var(--nexus-border)] last:border-0 hover:bg-[var(--nexus-bg)]">
                            <td className="px-3 py-2 text-[var(--nexus-text-1)]">{c.customer}</td>
                            <td className="px-3 py-2 text-[var(--nexus-text-2)]">{c.hub}</td>
                            <td className="px-3 py-2 text-[var(--nexus-text-2)] font-mono">{c.date}</td>
                            <td className="px-3 py-2">
                              <span
                                className="font-bold font-mono"
                                style={{ color: c.satisfactionScore >= 4.5 ? '#10B981' : c.satisfactionScore >= 3.5 ? '#F59E0B' : '#D40511' }}
                              >
                                {c.satisfactionScore}★
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Section>
          )}

          {isCluster && (
            <Section icon={Network} color="#F97316" title="Cluster Intelligence">
              {meta.clusterSize && (
                <p className="mb-2 text-[12px] text-[var(--nexus-text-1)]">
                  <strong className="text-[var(--nexus-text-1)]">{meta.clusterSize}</strong> incidents across{' '}
                  <strong className="text-[var(--nexus-text-1)]">{meta.affectedHubs?.length || 1}</strong> hub(s) within{' '}
                  <strong className="text-[var(--nexus-text-1)]">{meta.windowMinutes || '-'}min</strong> window
                </p>
              )}
              {Array.isArray(meta.affectedCustomers) && meta.affectedCustomers.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--nexus-text-3)]">Affected Customers</p>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.affectedCustomers.map((c, i) => (
                      <span key={i} className="rounded-md bg-[#F97316]/10 px-2 py-0.5 text-[11px] text-[#F97316]">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {meta.overallRisk !== undefined && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--nexus-text-3)]">Cascade Risk Score</p>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--nexus-border)]">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.round(meta.overallRisk * 100)}%`, background: '#D40511' }}
                      />
                    </div>
                    <span className="text-[13px] font-bold font-mono text-[#D40511]">
                      {Math.round(meta.overallRisk * 100)}%
                    </span>
                  </div>
                  {Array.isArray(meta.downstreamHubs) && meta.downstreamHubs.length > 0 && (
                    <p className="mt-2 text-[11px] text-[var(--nexus-text-2)]">
                      Downstream at risk:{' '}
                      <span className="text-[#F59E0B]">{meta.downstreamHubs.join(', ')}</span>
                    </p>
                  )}
                </div>
              )}
            </Section>
          )}

          {event.type === 'notification_sent' && meta.recipient && (
            <Section icon={Send} color="#FFCC00" title="Notification Dispatched">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--nexus-text-3)] mb-1">Recipient</p>
                    <p className="text-[14px] font-bold text-[var(--nexus-text-1)]">{meta.recipient}</p>
                    <p className="text-[11px] text-[var(--nexus-text-2)] mt-0.5">{meta.role}</p>
                  </div>
                  {meta.urgency && (
                    <span
                      className="rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shrink-0"
                      style={{
                        background: meta.urgency === 'critical' ? 'rgba(212,5,17,0.15)' : meta.urgency === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(6,182,212,0.12)',
                        color:      meta.urgency === 'critical' ? '#D40511'             : meta.urgency === 'high' ? '#F59E0B'             : '#FFCC00',
                      }}
                    >
                      {meta.urgency}
                    </span>
                  )}
                </div>
                {Array.isArray(meta.channels) && meta.channels.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--nexus-text-3)] mb-2">Channels Used</p>
                    <div className="flex flex-wrap gap-2">
                      {meta.channels.map((ch) => {
                        const chColors = {
                          whatsapp: { bg: 'rgba(37,211,102,0.12)',  color: '#25D366' },
                          sms:      { bg: 'rgba(129,140,248,0.12)', color: '#FF8C00' },
                          page:     { bg: 'rgba(212,5,17,0.12)',    color: '#D40511' },
                          email:    { bg: 'rgba(6,182,212,0.12)',   color: '#FFCC00' },
                          system:   { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' },
                        };
                        const c = chColors[ch] || chColors.system;
                        return (
                          <span
                            key={ch}
                            className="rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide"
                            style={{ background: c.bg, color: c.color }}
                          >
                            {ch === 'whatsapp' ? 'WhatsApp' : ch === 'sms' ? 'SMS' : ch === 'page' ? 'Pager' : ch === 'email' ? 'Email' : 'System'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {meta.subject && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--nexus-text-3)] mb-1">Subject / Alert</p>
                    <p className="text-[12px] text-[var(--nexus-text-1)] leading-relaxed">{meta.subject}</p>
                  </div>
                )}
                {meta.action && (
                  <div className="rounded-lg border border-[#FFCC00]/20 bg-[#FFCC00]/05 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-[#FFCC00]/70 mb-1">Action Triggered</p>
                    <p className="text-[12px] text-[#FFCC00] leading-relaxed">{meta.action}</p>
                  </div>
                )}
                {meta.relatedCase && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--nexus-text-3)] mb-1">Related Case</p>
                    <p className="text-[12px] text-[var(--nexus-text-2)] font-mono">{meta.relatedCase}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {event.type === 'sentiment_detected' && meta.score !== undefined && (
            <Section icon={TrendingUp} color="#FF8C00" title="Sentiment Analysis">
              <div className="flex items-center gap-4 mb-3">
                <div className="text-center">
                  <p
                    className="text-3xl font-bold font-mono"
                    style={{ color: meta.score >= 0.6 ? '#10B981' : meta.score >= 0.35 ? '#F59E0B' : '#D40511' }}
                  >
                    {Math.round(meta.score * 100)}
                  </p>
                  <p className="text-[10px] text-[var(--nexus-text-3)] mt-0.5">Score</p>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--nexus-text-1)]">
                    {meta.score >= 0.6 ? 'Satisfied' : meta.score >= 0.35 ? 'Neutral / Uncertain' : 'Frustrated'}
                  </p>
                  {meta.customer && <p className="text-[11px] text-[var(--nexus-text-2)] mt-0.5">{meta.customer}</p>}
                </div>
              </div>
              {meta.sentimentLabel && (
                <p className="text-[11px] text-[var(--nexus-text-2)]">
                  Detected label: <span className="text-[var(--nexus-text-1)]">{meta.sentimentLabel}</span>
                </p>
              )}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function Chip({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-[var(--nexus-border)] bg-[var(--nexus-bg)] px-2 py-1">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--nexus-text-3)]">{label}</span>
      <span className="text-[10px] font-semibold" style={{ color: color || 'var(--nexus-text-2)' }}>{value}</span>
    </div>
  );
}

function Section({ icon: Icon, color, title, badge, children }) {
  return (
    <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--nexus-border)] px-4 py-2.5" style={{ background: `${color}08` }}>
        <Icon size={12} style={{ color }} />
        <span className="flex-1 text-[11px] font-semibold text-[var(--nexus-text-1)]">{title}</span>
        {badge && (
          <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: `${badge.color}18`, color: badge.color }}>
            {badge.value}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatCard({ label, value, color, Icon }) {
  return (
    <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${color}18` }}>
          <Icon size={12} style={{ color }} />
        </div>
        <span className="text-[10px] font-semibold tracking-[0.1em] text-[var(--nexus-text-2)] uppercase">{label}</span>
      </div>
      <span
        className="text-[2.2rem] font-bold leading-none tracking-tight tabular-nums"
        style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </span>
    </div>
  );
}

function InfoChip({ label, value }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--nexus-border)] bg-[var(--nexus-bg)] px-3 py-1">
      <span className="text-[10px] text-[var(--nexus-text-3)]">{label}</span>
      <span
        className="text-[11px] font-bold tabular-nums text-[var(--nexus-text-1)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </span>
    </div>
  );
}

export default function OpsCenter() {
  const [botState,     setBotState]     = useState('offline');
  const [events,       setEvents]       = useState([]);
  const [counters,     setCounters]     = useState({ scanned: 0, classified: 0, responded: 0, escalated: 0 });
  const [sentiment,    setSentiment]    = useState({ scores: [], happy: 0, neutral: 0, frustrated: 0, avg: 0 });
  const [hubStats,     setHubStats]     = useState({});
  const [typeStats,    setTypeStats]    = useState({});
  const [cascadeAlert, setCascadeAlert] = useState(null);
  const [uptimeStart,  setUptimeStart]  = useState(null);
  const [uptimeTick,   setUptimeTick]   = useState('00:00');
  const [demoRunning,  setDemoRunning]  = useState(false);
  const [currentEmail, setCurrentEmail] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [startPulse,   setStartPulse]   = useState(false);
  const [selectedEvent,  setSelectedEvent]  = useState(null);
  const [notifications,  setNotifications]  = useState([]);
  const [realStats,      setRealStats]      = useState(null);
  const [statsLoading,   setStatsLoading]   = useState(false);

  const sseRef  = useRef(null);
  const feedRef = useRef(null);

  // Google Fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch {} };
  }, []);

  function fetchRealStats() {
    setStatsLoading(true);
    fetch(`${API_BASE}/api/v1/ops/real-stats`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setRealStats(data);
        setEvents((prev) =>
          prev.length === 0 && data.recentBotEvents?.length > 0
            ? data.recentBotEvents
            : prev
        );
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }

  // Load initial summary + real stats
  useEffect(() => {
    getOpsSummary().then((data) => {
      if (!data) return;
      setCounters(data.counters  || { scanned: 0, classified: 0, responded: 0, escalated: 0 });
      setEvents(data.recentEvents || []);
      setHubStats(data.hubStats  || {});
      setTypeStats(data.typeStats || {});
      if (data.sentiment) setSentiment(data.sentiment);
      if (data.cascadeAlert) setCascadeAlert(data.cascadeAlert);
      if (data.botState && data.botState !== 'offline') setBotState(data.botState);
      const notifs = (data.recentEvents || []).filter((e) => e.type === 'notification_sent');
      if (notifs.length > 0) setNotifications(notifs);
    });

    fetchRealStats();
  }, []);

  // SSE connection
  useEffect(() => {
    let sse;
    const connect = () => {
      sse = new EventSource(`${API_BASE}/api/v1/ops/live-stream`, { withCredentials: true });
      sseRef.current = sse;
      sse.onopen    = () => setSseConnected(true);
      sse.onerror   = () => { setSseConnected(false); sse.close(); setTimeout(connect, 3000); };
      sse.onmessage = (e) => {
        if (!e.data || e.data.startsWith(':')) return;
        try { handleEvent(JSON.parse(e.data)); } catch {}
      };
    };
    connect();
    return () => { sse?.close(); setSseConnected(false); };
  }, []);

  // Uptime ticker
  useEffect(() => {
    if (!uptimeStart || botState !== 'running') return;
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - uptimeStart) / 1000);
      setUptimeTick(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [uptimeStart, botState]);

  function handleEvent(event) {
    setEvents((prev) => [event, ...prev].slice(0, 80));

    switch (event.type) {
      case 'bot_started':
        setBotState('running');
        setUptimeStart(Date.now());
        break;
      case 'email_scan':
        setCounters((c) => ({ ...c, scanned: event.meta?.total || c.scanned }));
        break;
      case 'classified':
        setCounters((c) => ({ ...c, classified: c.classified + 1 }));
        if (event.meta?.customer) setCurrentEmail(event.meta.customer);
        if (event.meta?.hub)
          setHubStats((h) => ({ ...h, [event.meta.hub]: (h[event.meta.hub] || 0) + 1 }));
        if (event.meta?.incidentType)
          setTypeStats((t) => ({ ...t, [event.meta.incidentType]: (t[event.meta.incidentType] || 0) + 1 }));
        break;
      case 'response_sent':
        setCounters((c) => ({ ...c, responded: c.responded + 1 }));
        break;
      case 'escalated':
        setCounters((c) => ({ ...c, escalated: c.escalated + 1 }));
        break;
      case 'sentiment_detected':
        if (event.meta?.score !== undefined) {
          setSentiment((s) => {
            const scores = [...s.scores, event.meta.score];
            if (event.meta.total > 0 && event.meta.happy !== undefined) {
              const { happy, neutral, frustrated, total } = event.meta;
              const weightedAvg = (happy * 0.80 + neutral * 0.475 + frustrated * 0.175) / total;
              return { scores, avg: weightedAvg, happy, neutral, frustrated };
            }
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            return {
              scores,
              avg,
              happy:      scores.filter((x) => x >= 0.6).length,
              neutral:    scores.filter((x) => x >= 0.35 && x < 0.6).length,
              frustrated: scores.filter((x) => x < 0.35).length,
            };
          });
        }
        break;
      case 'cascade_alert':
        setCascadeAlert(event.meta);
        break;
      case 'notification_sent':
        setNotifications((prev) => [event, ...prev]);
        break;
      case 'bot_summary':
        setBotState('complete');
        setDemoRunning(false);
        if (event.meta?.scanned) {
          setCounters({
            scanned:    event.meta.scanned,
            classified: event.meta.classified,
            responded:  event.meta.responded,
            escalated:  event.meta.escalated,
          });
        }
        break;
      default:
        break;
    }
  }

  async function startDemo() {
    setStartPulse(true);
    setTimeout(() => setStartPulse(false), 600);
    setDemoRunning(true);
    setBotState('running');
    setEvents([]);
    setCounters({ scanned: 0, classified: 0, responded: 0, escalated: 0 });
    setSentiment({ scores: [], happy: 0, neutral: 0, frustrated: 0, avg: 0 });
    setHubStats({});
    setTypeStats({});
    setCascadeAlert(null);
    setCurrentEmail(null);
    setNotifications([]);
    setUptimeStart(Date.now());
    try { await startOpsDemo(); } catch {}
  }

  async function resetDemo() {
    setDemoRunning(false);
    setBotState('offline');
    setEvents([]);
    setCounters({ scanned: 0, classified: 0, responded: 0, escalated: 0 });
    setSentiment({ scores: [], happy: 0, neutral: 0, frustrated: 0, avg: 0 });
    setHubStats({});
    setTypeStats({});
    setCascadeAlert(null);
    setCurrentEmail(null);
    setNotifications([]);
    setUptimeStart(null);
    setUptimeTick('00:00');
    try { await resetOpsDemo(); } catch {}
    // Re-fetch real data after reset so the page is populated again
    fetchRealStats();
  }

  const isRunning    = botState === 'running';
  const sentTotal    = sentiment.happy + sentiment.neutral + sentiment.frustrated;
  const sentPct      = sentTotal > 0 ? Math.round(sentiment.avg * 100) : 0;
  const sentColor    = sentPct >= 60 ? '#10B981' : sentPct >= 40 ? '#F59E0B' : '#D40511';
  const responseRate = counters.classified > 0 ? Math.round((counters.responded / counters.classified) * 100) : 0;

  // Real data takes priority; session data overlays during demo
  const displayHubStats = demoRunning || Object.keys(hubStats).length > 0
    ? hubStats
    : (realStats?.incidents?.byHub?.reduce((acc, h) => ({ ...acc, [h.hub]: h.count }), {}) || {});

  const displayTypeStats = demoRunning || Object.keys(typeStats).length > 0
    ? typeStats
    : (realStats?.incidents?.byType?.reduce((acc, t) => ({ ...acc, [t.type]: t.count }), {}) || {});

  const displaySentiment = demoRunning || sentiment.scores.length > 0
    ? sentiment
    : realStats?.sentiment
      ? { ...sentiment, happy: realStats.sentiment.happy, neutral: realStats.sentiment.neutral, frustrated: realStats.sentiment.frustrated, avg: realStats.sentiment.avg }
      : sentiment;

  const displaySentTotal  = displaySentiment.happy + displaySentiment.neutral + displaySentiment.frustrated;
  const displaySentPct    = displaySentTotal > 0 ? Math.round(displaySentiment.avg * 100) : 0;
  const displaySentColor  = displaySentPct >= 60 ? '#10B981' : displaySentPct >= 40 ? '#F59E0B' : '#D40511';

  const topHubs     = Object.entries(displayHubStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxHub      = topHubs[0]?.[1] || 1;
  const typeEntries = Object.entries(displayTypeStats).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <Layout>
      <div className="min-h-screen bg-[var(--nexus-bg)] p-4 md:p-5" style={{ fontFamily: "'Inter', sans-serif" }}>

        {/* Header */}
        <header className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all duration-500"
              style={{
                borderColor: isRunning ? 'rgba(16,185,129,0.35)' : 'var(--nexus-border)',
                background:  isRunning ? 'rgba(16,185,129,0.08)' : 'var(--nexus-bg)',
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: isRunning ? '#10B981' : botState === 'complete' ? '#3B82F6' : 'var(--nexus-text-3)',
                  boxShadow:  isRunning ? '0 0 6px rgba(16,185,129,0.8)' : 'none',
                  animation:  isRunning ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <span
                className="text-[10px] font-bold tracking-[0.15em]"
                style={{ color: isRunning ? '#10B981' : botState === 'complete' ? '#3B82F6' : 'var(--nexus-text-3)' }}
              >
                {isRunning ? 'LIVE' : botState === 'complete' ? 'COMPLETE' : 'OFFLINE'}
              </span>
            </div>

            <div>
              <h1 className="text-[17px] font-bold text-[var(--nexus-text-1)] leading-none tracking-tight">
                NEXUS Operations Center
              </h1>
              <p className="text-[11px] text-[var(--nexus-text-3)] mt-0.5">
                UiPath automation - DHL Malaysia logistics - real-time intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* SSE dot */}
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--nexus-border)] bg-[var(--nexus-bg)] px-2.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: sseConnected ? '#10B981' : 'var(--nexus-text-3)' }} />
              <span className="text-[10px] text-[var(--nexus-text-2)]">Stream</span>
            </div>

            {/* Refresh real stats */}
            <button
              onClick={fetchRealStats}
              disabled={statsLoading}
              title="Refresh live data"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-bg)] text-[var(--nexus-text-2)] transition-all hover:border-[var(--nexus-text-3)] hover:text-[var(--nexus-text-1)] disabled:opacity-40"
            >
              <RefreshCw size={12} className={statsLoading ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={resetDemo}
              disabled={isRunning}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--nexus-border)] bg-[var(--nexus-bg)] px-3 py-1.5 text-[12px] text-[var(--nexus-text-2)] transition-all hover:border-[var(--nexus-text-3)] hover:text-[var(--nexus-text-1)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              <RotateCcw size={12} /> Reset
            </button>

            {/* Demo mode - secondary ghost button */}
            <button
              onClick={startDemo}
              disabled={isRunning}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: isRunning ? 'rgba(16,185,129,0.30)' : startPulse ? 'rgba(212,5,17,0.6)' : 'rgba(212,5,17,0.35)',
                background:  isRunning ? 'rgba(16,185,129,0.08)' : 'rgba(212,5,17,0.07)',
                color:       isRunning ? '#10B981' : '#F87171',
              }}
            >
              <Play size={11} fill="currentColor" />
              {isRunning ? 'Running...' : 'Demo Mode'}
            </button>
          </div>
        </header>

        {/* KPI Strip - dual mode */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          {demoRunning || !realStats ? (
            <>
              <StatCard label="Emails Scanned"       value={counters.scanned}       color="#0EA5E9" Icon={Mail}          />
              <StatCard label="Classified"           value={counters.classified}    color="#FF8C00" Icon={Cpu}           />
              <StatCard label="Auto-Responded"       value={counters.responded}     color="#10B981" Icon={CheckCircle2}  />
              <StatCard label="Escalated"            value={counters.escalated}     color="#F59E0B" Icon={AlertTriangle} />
              <StatCard label="Stakeholders Notified" value={notifications.length}  color="#FFCC00" Icon={Bell}          />
            </>
          ) : (
            <>
              <StatCard label="Total Incidents"  value={realStats.incidents.total}       color="#FF8C00" Icon={Database}       />
              <StatCard label="Auto-Resolved"    value={realStats.incidents.autoResolved} color="#10B981" Icon={CheckCircle2}   />
              <StatCard label="HITL Routed"      value={realStats.incidents.hitlRouted}   color="#F59E0B" Icon={AlertTriangle}  />
              <StatCard label="Avg Confidence"   value={`${Math.round((realStats.incidents.avgConfidence || 0) * 100)}%`} color="#0EA5E9" Icon={TrendingUp} />
              <StatCard label="Bot Runs"         value={realStats.rpa.totalRuns}          color="#FF8C00" Icon={Bot}            />
            </>
          )}
        </div>

        {/* All-Time Operations banner - shown only when real data loaded and not in demo */}
        {realStats && !demoRunning && (
          <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-bg)] px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--nexus-text-3)] self-center mr-2">
              All-Time
            </span>
            <InfoChip label="Robot Runs"             value={realStats.rpa.totalRuns}       />
            <InfoChip label="Files Processed"        value={realStats.rpa.totalFiles}      />
            <InfoChip label="Incidents in DB"        value={realStats.incidents.total}     />
            <InfoChip label="Successfully Classified" value={realStats.rpa.totalProcessed} />
          </div>
        )}

        {/* Main 3-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_210px] gap-4 mb-4">

          {/* Col 1: Bot Status */}
          <div className="flex flex-col gap-3">

            <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-4 flex flex-col items-center gap-3">
              <p className="self-start text-[10px] font-semibold tracking-[0.1em] text-[var(--nexus-text-3)] uppercase">Bot Status</p>
              <div className="relative mt-1">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all duration-500"
                  style={{
                    borderColor: isRunning ? '#10B981' : botState === 'complete' ? '#3B82F6' : 'var(--nexus-border)',
                    boxShadow:   isRunning ? '0 0 24px rgba(16,185,129,0.25), inset 0 0 12px rgba(16,185,129,0.08)' : 'none',
                    background:  isRunning ? 'rgba(16,185,129,0.05)' : 'transparent',
                  }}
                >
                  <Bot
                    size={28}
                    style={{ color: isRunning ? '#10B981' : botState === 'complete' ? '#3B82F6' : 'var(--nexus-text-3)' }}
                  />
                </div>
                {isRunning && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full border-2 border-[var(--nexus-bg)] bg-[#10B981]"
                    style={{ animation: 'pulse 1.5s infinite' }}
                  />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-[var(--nexus-text-1)]">
                  {isRunning ? 'Processing' : botState === 'complete' ? 'Complete' : 'Offline'}
                </p>
                {isRunning && currentEmail && (
                  <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-[var(--nexus-text-2)]">{currentEmail}</p>
                )}
              </div>
              {/* Last batch context when idle */}
              {!isRunning && realStats?.rpa && (
                <p className="text-[10px] text-[var(--nexus-text-3)] text-center">
                  Last batch: {realStats.rpa.totalProcessed} files
                </p>
              )}
            </div>

            {uptimeStart && (
              <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--nexus-text-3)] mb-1">Uptime</p>
                <p
                  className="text-2xl font-bold text-[var(--nexus-text-1)] tabular-nums"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {uptimeTick}
                </p>
              </div>
            )}

            {counters.classified > 0 && (
              <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--nexus-text-3)] mb-2">Auto-response Rate</p>
                <p
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: '#10B981', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {responseRate}%
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--nexus-border)]">
                  <div className="h-full rounded-full bg-[#10B981] transition-all duration-700" style={{ width: `${responseRate}%` }} />
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-3">
              <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--nexus-text-3)] mb-2">UiPath Webhook</p>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                <span className="text-[10px] text-[var(--nexus-text-2)] font-mono">POST /api/v1/ops/event</span>
              </div>
              <p className="text-[10px] text-[var(--nexus-text-3)] leading-relaxed">
                Bot calls this endpoint after each action. Events stream live to this page.
              </p>
            </div>
          </div>

          {/* Col 2: Live Feed */}
          <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--nexus-border)] px-4 py-3">
              <div className="flex items-center gap-2">
                {isRunning && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[#10B981]"
                    style={{ animation: 'pulse 1.5s infinite' }}
                  />
                )}
                <span className="text-[11px] font-semibold tracking-[0.08em] text-[var(--nexus-text-2)] uppercase">Live Activity Feed</span>
                {!demoRunning && realStats && (
                  <span className="rounded-md bg-[#FF8C00]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#FF8C00] uppercase tracking-wide">
                    Live DB
                  </span>
                )}
              </div>
              <span className="rounded-md bg-[var(--nexus-bg)] px-2 py-0.5 text-[10px] text-[var(--nexus-text-3)] tabular-nums font-mono">{events.length}</span>
            </div>

            <div ref={feedRef} className="flex-1 overflow-y-auto max-h-[480px] p-2 space-y-1">
              {events.length === 0 ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--nexus-border)] bg-[var(--nexus-bg)]">
                    <Play size={20} className="text-[var(--nexus-text-3)]" />
                  </div>
                  <p className="text-sm font-medium text-[var(--nexus-text-2)]">Waiting for bot activity</p>
                  <p className="mt-1 text-[12px] text-[var(--nexus-text-3)]">Press "Demo Mode" to simulate a run</p>
                  <p className="mt-0.5 text-[11px] text-[var(--nexus-text-3)]">Or connect UiPath to the webhook above</p>
                </div>
              ) : (
                events.map((event, idx) => {
                  const cfg = EVENT_CFG[event.type] || { Icon: Activity, color: '#6B7280', bg: 'rgba(107,114,128,0.1)', label: event.type };
                  const { Icon } = cfg;
                  const hi        = event.type === 'cascade_alert' || event.type === 'cluster_detected';
                  const clickable = CLICKABLE_TYPES.has(event.type);
                  return (
                    <div
                      key={event._id || idx}
                      onClick={() => clickable && setSelectedEvent(event)}
                      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition-all ${clickable ? 'cursor-pointer hover:bg-[var(--nexus-bg)]' : ''}`}
                      style={{
                        background: hi ? cfg.bg : idx === 0 ? 'var(--nexus-bg)' : 'transparent',
                        border:     hi ? `1px solid ${cfg.color}28` : '1px solid transparent',
                      }}
                    >
                      <div
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                        style={{ background: cfg.bg }}
                      >
                        <Icon size={10} style={{ color: cfg.color }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[9px] font-bold tracking-[0.1em] shrink-0"
                            style={{ color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                          <span className="text-[12px] text-[var(--nexus-text-1)] truncate">{event.message}</span>
                        </div>
                        {event.meta && (event.meta.confidence || event.meta.hub || event.meta.alertId || event.meta.awb) && (
                          <p className="mt-0.5 text-[10px] text-[var(--nexus-text-3)] font-mono">
                            {event.meta.confidence ? `${Math.round(event.meta.confidence * 100)}% conf` : ''}
                            {event.meta.hub         ? ` · ${HUB_SHORT[event.meta.hub] || event.meta.hub}` : ''}
                            {event.meta.awb         ? ` · ${event.meta.awb}` : ''}
                            {event.meta.alertId     ? ` · ${event.meta.alertId}` : ''}
                            {event.meta.clusterSize ? ` · ${event.meta.clusterSize} incidents` : ''}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[10px] text-[var(--nexus-text-3)] font-mono">
                          {event.createdAt ? fmtTime(event.createdAt) : '--'}
                        </span>
                        {clickable && <ChevronRight size={10} className="text-[var(--nexus-text-3)]" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Col 3: Sentiment + Hub + Types */}
          <div className="flex flex-col gap-3">

            <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-4">
              <p className="text-[10px] font-semibold tracking-[0.1em] text-[var(--nexus-text-3)] uppercase mb-3">Customer Sentiment</p>
              <div className="flex flex-col items-center py-2 mb-3">
                <span
                  className="text-5xl font-bold tabular-nums leading-none"
                  style={{ color: displaySentColor, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {displaySentTotal > 0 ? displaySentPct : '--'}
                </span>
                {displaySentTotal > 0 && (
                  <span className="text-[11px] mt-1.5" style={{ color: displaySentColor }}>
                    {displaySentPct >= 60 ? 'Mostly satisfied' : displaySentPct >= 40 ? 'Mixed sentiment' : 'Needs attention'}
                  </span>
                )}
                {displaySentTotal === 0 && (
                  <span className="text-[11px] text-[var(--nexus-text-3)] mt-1.5">awaiting data</span>
                )}
              </div>
              <div className="space-y-2.5">
                <SentimentBar label="Happy"      value={displaySentiment.happy}      total={displaySentTotal} color="#10B981" />
                <SentimentBar label="Neutral"    value={displaySentiment.neutral}    total={displaySentTotal} color="#6B7280" />
                <SentimentBar label="Frustrated" value={displaySentiment.frustrated} total={displaySentTotal} color="#D40511" />
              </div>
            </div>

            {topHubs.length > 0 && (
              <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-4">
                <p className="text-[10px] font-semibold tracking-[0.1em] text-[var(--nexus-text-3)] uppercase mb-3">Hub Activity</p>
                <div className="space-y-2.5">
                  {topHubs.map(([hub, count]) => (
                    <div key={hub}>
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] text-[var(--nexus-text-2)] truncate max-w-[130px]">{HUB_SHORT[hub] || hub}</span>
                        <span className="text-[11px] font-bold text-[var(--nexus-text-1)] tabular-nums font-mono">{count}</span>
                      </div>
                      <MiniBar value={count} max={maxHub} color="#0EA5E9" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {typeEntries.length > 0 && (
              <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-4">
                <p className="text-[10px] font-semibold tracking-[0.1em] text-[var(--nexus-text-3)] uppercase mb-3">Incident Types</p>
                <div className="space-y-2">
                  {typeEntries.map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_COLORS[type] || '#6B7280' }} />
                      <span className="flex-1 text-[11px] text-[var(--nexus-text-2)] truncate">{type.replace(/_/g, ' ')}</span>
                      <span className="text-[11px] font-bold text-[var(--nexus-text-1)] font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cascade Alert Banner */}
        {cascadeAlert && (
          <div
            className="mb-4 flex items-start gap-3 rounded-xl border p-4"
            style={{ borderColor: 'rgba(212,5,17,0.35)', background: 'rgba(212,5,17,0.06)' }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'rgba(212,5,17,0.12)' }}
            >
              <Zap size={16} style={{ color: '#D40511' }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <span className="text-[10px] font-bold tracking-[0.12em] text-[#D40511] uppercase">Cascade Alert Triggered</span>
                {cascadeAlert.alertId && (
                  <span className="rounded-md bg-[var(--nexus-bg)] px-2 py-0.5 text-[10px] text-[var(--nexus-text-2)] font-mono">{cascadeAlert.alertId}</span>
                )}
              </div>
              <p className="text-[13px] text-[var(--nexus-text-1)] leading-relaxed">
                Incident cluster detected at <strong className="text-[var(--nexus-text-1)]">{cascadeAlert.sourceHub}</strong>.
                Downstream hubs at risk:{' '}
                <strong className="text-[#F59E0B]">{(cascadeAlert.downstreamHubs || []).join(', ')}</strong>.
                UiPath has written an alert JSON file - hub managers will be notified automatically.
              </p>
              <p className="mt-1 text-[11px] text-[var(--nexus-text-3)]">
                Overall cascade risk:{' '}
                <span className="font-bold text-[#D40511]">{Math.round((cascadeAlert.overallRisk || 0) * 100)}%</span>
              </p>
            </div>
          </div>
        )}

        {/* Stakeholder Alerts Panel */}
        {notifications.length > 0 && (
          <div className="mb-4 rounded-xl border border-[#FFCC00]/20 bg-[var(--nexus-surface-2)] overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--nexus-border)] px-4 py-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#FFCC00]/15">
                <Bell size={11} style={{ color: '#FFCC00' }} />
              </div>
              <span className="text-[11px] font-semibold tracking-[0.08em] text-[var(--nexus-text-2)] uppercase">Stakeholder Alerts Dispatched</span>
              <span className="ml-auto rounded-md bg-[#FFCC00]/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-[#FFCC00] font-mono">{notifications.length}</span>
            </div>
            <div className="divide-y divide-[var(--nexus-border)]">
              {notifications.map((n, idx) => {
                const urgColor  = n.meta?.urgency === 'critical' ? '#D40511' : n.meta?.urgency === 'high' ? '#F59E0B' : '#FFCC00';
                const chColors  = { whatsapp: '#25D366', sms: '#FF8C00', page: '#D40511', email: '#FFCC00', system: '#6B7280' };
                return (
                  <div
                    key={n._id || idx}
                    onClick={() => setSelectedEvent(n)}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[var(--nexus-bg)]"
                    style={{ borderLeft: `2px solid ${urgColor}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[12px] font-semibold text-[var(--nexus-text-1)] truncate">{n.meta?.recipient}</span>
                        <span className="text-[10px] text-[var(--nexus-text-3)] truncate hidden sm:block">· {n.meta?.role}</span>
                      </div>
                      <p className="text-[10px] text-[var(--nexus-text-3)] truncate">{n.meta?.subject}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(n.meta?.channels || []).map((ch) => (
                        <span
                          key={ch}
                          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                          style={{ background: `${chColors[ch] || '#6B7280'}18`, color: chColors[ch] || '#6B7280' }}
                        >
                          {ch === 'whatsapp' ? 'WA' : ch}
                        </span>
                      ))}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: urgColor }}>{n.meta?.urgency}</span>
                      <span className="text-[10px] text-[var(--nexus-text-3)] font-mono">{n.createdAt ? fmtTime(n.createdAt) : '--'}</span>
                    </div>
                    <ChevronRight size={12} className="shrink-0 text-[var(--nexus-text-3)]" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* How It Works - shown when no events and not in demo */}
        {events.length === 0 && !demoRunning && (
          <div className="rounded-xl border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] p-5">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-[var(--nexus-text-3)] uppercase mb-4">How This Works</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {[
                { n: '1', icon: Mail,         color: '#0EA5E9', t: 'Bot Scans Inbox',    d: 'UiPath connects to DHL Malaysia IMAP and reads all unread emails from customers.' },
                { n: '2', icon: Cpu,          color: '#FF8C00', t: 'NEXUS Classifies',   d: 'Each email is classified by the ML model: incident type, priority, hub, and confidence.' },
                { n: '3', icon: CheckCircle2, color: '#10B981', t: 'Auto-Response Sent', d: 'High-confidence emails get an immediate SOP-based response. Low-confidence ones are escalated.' },
                { n: '4', icon: Network,      color: '#F59E0B', t: 'Cascade Detection',  d: 'Clusters at one hub trigger downstream cascade alerts. UiPath notifies hub managers proactively.' },
              ].map(({ n, icon: Icon, color, t, d }) => (
                <div key={n} className="flex gap-3">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: `${color}18`, color }}
                  >
                    {n}
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--nexus-text-1)]">{t}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--nexus-text-3)]">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.4; }
          }
        `}</style>
      </div>

      <EventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </Layout>
  );
}
