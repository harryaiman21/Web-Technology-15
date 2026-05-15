import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BarChart3, Brain, CheckCircle2,
  ChevronRight, Command, Database, ExternalLink, Inbox,
  Layers, RefreshCw, Search, Send, Sparkles, Terminal,
  Trash2, Zap,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import Layout from '../components/Layout';
import { sendOpsChat, getKbHealth } from '../lib/api';

// ── Design tokens (use CSS vars for theme compat) ───────────────────────────────
const BG      = 'var(--nexus-bg)';
const SURFACE = 'var(--nexus-surface-1)';
const BORDER  = 'var(--nexus-border)';
const RED     = 'var(--nexus-red)';
const CYAN    = 'var(--nexus-cyan)';
const MONO    = '"JetBrains Mono","Fira Code","Cascadia Code",monospace';

// ── Slash commands ───────────────────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { cmd: '/triage',   label: 'Triage now',         icon: AlertTriangle, prompt: 'Which incidents need manual triage right now? List them by INC reference, severity, and location.' },
  { cmd: '/report',   label: 'Daily report',        icon: BarChart3,     prompt: "Generate a full summary report of today's incidents including all INC references, hub breakdown, clusters, and NEXUS automated actions." },
  { cmd: '/clusters', label: 'Active clusters',     icon: Layers,        prompt: 'List all active incident clusters with their INC references, affected hub, incident count, and recommended immediate action.' },
  { cmd: '/critical', label: 'Critical incidents',  icon: Zap,           prompt: 'List all Critical and High severity incidents right now with their exact INC references, type, location, and status.' },
  { cmd: '/sop',      label: 'SOP lookup',          icon: Brain,         prompt: 'List all available SOPs in the knowledge base by code and incident type.' },
  { cmd: '/rpa',      label: 'RPA status',          icon: Database,      prompt: 'Report on the latest RPA bot email ingestion runs — success rate, volumes processed, and any failures.' },
  { cmd: '/hubs',     label: 'Hub breakdown',       icon: Search,        prompt: 'Break down all active incidents by hub location with counts and severity mix. Flag any hub with 3+ incidents.' },
  { cmd: '/queue',    label: 'Review queue',         icon: CheckCircle2,  prompt: 'List all incidents currently in the PENDING_REVIEW queue with INC references that need human review.' },
];

// ── Colors ──────────────────────────────────────────────────────────────────────
const SEV_COLOR = { Critical: '#D40511', High: '#F59E0B', Medium: '#FF8C00', Low: '#10B981' };
const STATUS_COLOR = {
  PENDING_REVIEW: '#F59E0B', DRAFT: '#FF8C00', UNDER_REVIEW: '#0EA5E9',
  ASSIGNED: '#0EA5E9', IN_PROGRESS: '#0EA5E9', RESOLVED: '#10B981',
};
const CTX = {
  incidents:       { color: '#FF8C00', label: 'Incidents DB', icon: Database },
  clusters:        { color: '#F59E0B', label: 'Clusters',     icon: Layers },
  audit:           { color: '#10B981', label: 'Audit Log',    icon: CheckCircle2 },
  rpa:             { color: '#0EA5E9', label: 'RPA Runs',     icon: Database },
  sop_kb:          { color: RED,       label: 'SOP KB',       icon: Brain },
  semantic:        { color: '#FF8C00', label: 'Vector KB',    icon: Sparkles },
  incident_detail: { color: RED,       label: 'Incident',     icon: Zap },
};

// ── getSuggestions ───────────────────────────────────────────────────────────────
function getSuggestions(reply, contextUsed) {
  const r = (reply || '').toLowerCase();
  const s = [];
  if (r.includes('critical') || r.includes('high') || r.includes('severe'))   s.push('Show only Critical & High incidents');
  if (r.includes('cluster') || r.includes('group'))                            s.push('Send proactive alerts for these clusters');
  if (r.includes('pending') || r.includes('review') || r.includes('queue'))   s.push('Open the review queue');
  if (r.includes('hub') || r.includes('location') || r.includes('gateway'))   s.push('Break down by hub location');
  if (contextUsed?.includes('sop_kb') || r.includes('sop') || r.includes('procedure')) s.push('Find the SOP for this incident type');
  if (contextUsed?.includes('semantic') || r.includes('similar'))             s.push('Show similar past incidents');
  if (r.includes('rpa') || r.includes('bot') || r.includes('email'))          s.push('Check RPA ingestion status');
  if (r.includes('report') || r.includes('summary') || r.includes('overview')) s.push('Generate full daily report');
  return s.slice(0, 3);
}

// ── ThinkingIndicator ────────────────────────────────────────────────────────────
const PHASES = [
  { label: 'Scanning incidents DB',       color: '#FF8C00' },
  { label: 'Querying SOP knowledge base', color: RED },
  { label: 'Running semantic search',     color: '#FF8C00' },
  { label: 'Synthesising answer',         color: '#10B981' },
];

function ThinkingIndicator() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % PHASES.length), 900);
    return () => clearInterval(id);
  }, []);
  const p = PHASES[phase];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <div style={{
        width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${p.color}30`, borderTopColor: p.color,
        animation: 'opsSpin 0.8s linear infinite',
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {PHASES.map((ph, i) => (
            <div key={i} style={{
              flex: 1, height: 2, borderRadius: 999,
              background: i <= phase ? ph.color : BORDER,
              transition: 'background 350ms',
            }} />
          ))}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: p.color, animation: 'opsPulse 0.9s ease-in-out infinite' }}>
          {p.label}…
        </span>
      </div>
    </div>
  );
}

// ── IncidentRow ──────────────────────────────────────────────────────────────────
function IncidentRow({ card, navigate }) {
  const sev = SEV_COLOR[card.severity] || '#FF8C00';
  const sta = STATUS_COLOR[card.status] || 'var(--nexus-text-3)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
      borderRadius: 6, background: 'var(--nexus-surface-2)',
      border: `1px solid ${card.needsReview ? 'rgba(245,158,11,0.25)' : BORDER}`,
      borderLeft: `3px solid ${sev}`,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: sev, minWidth: 78, flexShrink: 0 }}>{card.ref}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--nexus-text-3)', minWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {(card.type || '').replace(/_/g, ' ')}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--nexus-text-3)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {card.location || '—'}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 9, color: sta, flexShrink: 0 }}>{(card.status || '').replace(/_/g, ' ')}</span>
      {card.needsReview && (
        <span style={{ fontFamily: MONO, fontSize: 9, color: '#F59E0B', padding: '1px 5px', background: 'rgba(245,158,11,0.1)', borderRadius: 3, flexShrink: 0 }}>REVIEW</span>
      )}
      <button
        type="button"
        onClick={() => navigate(`/incidents/${card.id}`)}
        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 4, background: 'var(--nexus-surface-2)', border: 'none', cursor: 'pointer', color: 'var(--nexus-text-3)', fontSize: 10, flexShrink: 0 }}
      >
        <ExternalLink size={9} /> View
      </button>
    </div>
  );
}

// ── SemanticHit ──────────────────────────────────────────────────────────────────
function SemanticHit({ hit }) {
  const score = Math.round((hit.similarity || hit.rrfScore || 0) * 100);
  const barColor = score > 70 ? '#10B981' : score > 40 ? '#F59E0B' : '#FF8C00';
  return (
    <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.14)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <Sparkles size={10} color="#FF8C00" style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: '#FF8C00', fontWeight: 700 }}>{score}% match</span>
        <div style={{ flex: 1, height: 2, borderRadius: 999, background: BORDER }}>
          <div style={{ height: '100%', width: `${score}%`, background: barColor, borderRadius: 999, transition: 'width 500ms ease' }} />
        </div>
      </div>
      <p style={{ fontFamily: MONO, fontSize: 10, color: 'var(--nexus-text-3)', lineHeight: 1.5, margin: 0 }}>
        {(hit.incidentText || '').substring(0, 130)}{hit.incidentText?.length > 130 ? '…' : ''}
      </p>
    </div>
  );
}

// ── MarkdownText ─────────────────────────────────────────────────────────────────
function MarkdownText({ text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(text || '').split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 3 }} />;
        const isItem = /^[-•*]\s/.test(line) || /^\d+\.\s/.test(line);
        const raw = line.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '');
        const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`|INC-\d+)/g).map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={j} style={{ color: 'var(--nexus-text-1)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
          if (part.startsWith('`') && part.endsWith('`'))
            return <code key={j} style={{ fontFamily: MONO, fontSize: '0.85em', background: 'var(--nexus-surface-2)', padding: '1px 5px', borderRadius: 3, color: '#FF8C00' }}>{part.slice(1, -1)}</code>;
          if (/^INC-\d+$/.test(part))
            return <span key={j} style={{ fontFamily: MONO, fontWeight: 700, color: RED, fontSize: '0.9em' }}>{part}</span>;
          return <span key={j}>{part}</span>;
        });
        if (isItem) {
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--nexus-text-2)', lineHeight: 1.65 }}>
              <span style={{ marginTop: 7, width: 5, height: 5, borderRadius: '50%', background: RED, flexShrink: 0 }} />
              <span>{parts}</span>
            </div>
          );
        }
        return <p key={i} style={{ fontSize: 13, color: 'var(--nexus-text-1)', lineHeight: 1.7, margin: 0 }}>{parts}</p>;
      })}
    </div>
  );
}

// ── SourceBadges ─────────────────────────────────────────────────────────────────
function SourceBadges({ sources }) {
  if (!sources?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
      {sources.map(src => {
        const c = CTX[src] || { color: 'var(--nexus-text-3)', label: src, icon: Database };
        const Icon = c.icon;
        return (
          <span key={src} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: `${c.color}12`, border: `1px solid ${c.color}28`, color: c.color }}>
            <Icon size={9} />{c.label}
          </span>
        );
      })}
    </div>
  );
}

// ── SuggestionChips ──────────────────────────────────────────────────────────────
function SuggestionChips({ suggestions, onSelect }) {
  if (!suggestions?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
      {suggestions.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(s)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 99,
            fontSize: 11, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`,
            color: 'var(--nexus-text-3)', cursor: 'pointer', transition: 'all 150ms',
            animation: `opsIn ${200 + i * 70}ms ease forwards`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${RED}10`; e.currentTarget.style.borderColor = `${RED}30`; e.currentTarget.style.color = RED; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--nexus-surface-2)'; e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = 'var(--nexus-text-3)'; }}
        >
          <ChevronRight size={10} />{s}
        </button>
      ))}
    </div>
  );
}

// ── Inline Charts ───────────────────────────────────────────────────────────────
const CHART_COLORS = ['#D40511', '#F59E0B', '#FF8C00', '#10B981', '#FFCC00', '#FF8C00', '#ec4899'];
const SEV_CHART_COLORS = { Critical: '#D40511', High: '#F59E0B', Medium: '#FF8C00', Low: '#10B981' };

function MiniTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 9px', fontSize: 10, color: 'var(--nexus-text-1)' }}>
      <span style={{ fontWeight: 600 }}>{payload[0]?.payload?.name}</span>: {payload[0]?.value}
    </div>
  );
}

function InlineCharts({ chartData }) {
  if (!chartData) return null;
  const charts = [];

  if (chartData.severityBreakdown?.length > 0) {
    charts.push(
      <div key="sev" style={{ animation: 'opsIn 300ms ease forwards' }}>
        <p style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--nexus-text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Severity Distribution</p>
        <ResponsiveContainer width="100%" height={120}>
          <PieChart>
            <Pie data={chartData.severityBreakdown} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={48} paddingAngle={3} stroke="none">
              {chartData.severityBreakdown.map((entry) => (
                <Cell key={entry.name} fill={SEV_CHART_COLORS[entry.name] || '#FF8C00'} />
              ))}
            </Pie>
            <Tooltip content={<MiniTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 }}>
          {chartData.severityBreakdown.map((s) => (
            <span key={s.name} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: SEV_CHART_COLORS[s.name] || '#FF8C00' }} />
              <span style={{ color: 'var(--nexus-text-3)' }}>{s.name}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: 'var(--nexus-text-1)' }}>{s.count}</span>
            </span>
          ))}
        </div>
      </div>,
    );
  }

  if (chartData.hubBreakdown?.length > 0) {
    charts.push(
      <div key="hub" style={{ animation: 'opsIn 400ms ease forwards' }}>
        <p style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--nexus-text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Hub Breakdown</p>
        <ResponsiveContainer width="100%" height={Math.max(80, chartData.hubBreakdown.length * 28)}>
          <BarChart data={chartData.hubBreakdown} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: 'var(--nexus-text-3)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<MiniTooltip />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
              {chartData.hubBreakdown.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>,
    );
  }

  if (chartData.typeBreakdown?.length > 0) {
    charts.push(
      <div key="type" style={{ animation: 'opsIn 500ms ease forwards' }}>
        <p style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--nexus-text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Incident Types</p>
        <ResponsiveContainer width="100%" height={Math.max(80, chartData.typeBreakdown.length * 28)}>
          <BarChart data={chartData.typeBreakdown} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--nexus-text-3)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<MiniTooltip />} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
              {chartData.typeBreakdown.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>,
    );
  }

  if (charts.length === 0) return null;

  return (
    <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: charts.length > 1 ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr', gap: 14 }}>
      {charts.map((chart) => (
        <div key={chart.key} style={{ padding: 12, borderRadius: 8, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}` }}>
          {chart}
        </div>
      ))}
    </div>
  );
}

// ── Action Cards ────────────────────────────────────────────────────────────────
function ActionCards({ cards, navigate }) {
  if (!cards?.length) return null;
  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--nexus-text-3)', textTransform: 'uppercase', marginBottom: 2 }}>
        — actionable incidents —
      </p>
      {cards.map(card => {
        const sev = SEV_COLOR[card.severity] || '#FF8C00';
        return (
          <div
            key={card.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 8, background: 'var(--nexus-surface-2)',
              border: `1px solid ${card.needsReview ? 'rgba(245,158,11,0.3)' : BORDER}`,
              borderLeft: `3px solid ${sev}`,
              animation: 'opsIn 250ms ease forwards',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: sev }}>{card.ref}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--nexus-text-3)' }}>{(card.type || '').replace(/_/g, ' ')}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--nexus-text-3)' }}>{card.location || ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: `${sev}18`, color: sev, fontWeight: 600 }}>{card.severity}</span>
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'var(--nexus-surface-3)', color: STATUS_COLOR[card.status] || 'var(--nexus-text-3)', fontWeight: 600 }}>{(card.status || '').replace(/_/g, ' ')}</span>
                {card.needsReview && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', fontWeight: 600 }}>NEEDS REVIEW</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => navigate(`/incidents/${card.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 5, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, cursor: 'pointer', color: 'var(--nexus-text-3)', fontSize: 10, fontWeight: 600 }}
              >
                <ExternalLink size={10} /> View
              </button>
              {card.needsReview && (
                <button
                  type="button"
                  onClick={() => navigate('/review')}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 5, background: `${RED}12`, border: `1px solid ${RED}28`, cursor: 'pointer', color: RED, fontSize: 10, fontWeight: 600 }}
                >
                  <CheckCircle2 size={10} /> Review
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Quick-start tiles ─────────────────────────────────────────────────────────────
const QUICK_TILES = [
  { icon: Zap,          color: RED,       label: 'Critical incidents',   prompt: 'List all Critical and High severity incidents right now with their exact INC references, type, location, and status.' },
  { icon: AlertTriangle,color: '#F59E0B', label: 'Active clusters',      prompt: 'List all active incident clusters with their INC references, affected hub, incident count, and recommended immediate action.' },
  { icon: Brain,        color: '#FF8C00', label: 'SOP knowledge base',   prompt: 'List all available SOPs in the knowledge base by code and incident type.' },
  { icon: CheckCircle2, color: '#10B981', label: 'Review queue',          prompt: 'List all incidents currently in the PENDING_REVIEW queue with INC references that need human review.' },
];

// ── EmptyState ────────────────────────────────────────────────────────────────────
function EmptyState({ kbHealth, onSend }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 28, padding: '40px 24px' }}>
      {/* Brand mark */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 12, background: `${RED}14`, border: `1px solid ${RED}28`, marginBottom: 14 }}>
          <Brain size={22} color={RED} />
        </div>
        <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--nexus-text-1)', letterSpacing: '-0.025em', margin: '0 0 6px' }}>NEXUS Ops Intelligence</h2>
        <p style={{ fontSize: 13, color: 'var(--nexus-text-3)', margin: 0 }}>Ask anything about operations, incidents, or the knowledge base</p>
      </div>

      {/* KB health chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {kbHealth ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)' }}>
              <Sparkles size={11} color="#FF8C00" />
              <span style={{ fontSize: 11, color: '#FF8C00', fontWeight: 600 }}>{kbHealth.embeddingCount || 0} vectors indexed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, background: `${RED}0D`, border: `1px solid ${RED}25` }}>
              <Brain size={11} color={RED} />
              <span style={{ fontSize: 11, color: RED, fontWeight: 600 }}>{kbHealth.sopCount || 0} SOPs loaded</span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}` }}>
            <RefreshCw size={11} color="var(--nexus-text-3)" style={{ animation: 'opsSpin 1s linear infinite' }} />
            <span style={{ fontSize: 11, color: 'var(--nexus-text-3)' }}>Connecting to KB…</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px rgba(16,185,129,0.6)' }} />
          <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>Live data connected</span>
        </div>
      </div>

      {/* Quick tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: '100%', maxWidth: 510 }}>
        {QUICK_TILES.map((tile, i) => {
          const Icon = tile.icon;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSend(tile.prompt)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 9,
                textAlign: 'left', background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`,
                cursor: 'pointer', transition: 'all 180ms',
                animation: `opsIn ${220 + i * 80}ms ease forwards`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${tile.color}0C`; e.currentTarget.style.borderColor = `${tile.color}32`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--nexus-surface-2)'; e.currentTarget.style.borderColor = BORDER; }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 7, background: `${tile.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={15} color={tile.color} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--nexus-text-2)', lineHeight: 1.35 }}>{tile.label}</span>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--nexus-text-3)' }}>
        Type <kbd style={{ fontFamily: MONO, background: 'var(--nexus-surface-2)', padding: '1px 6px', borderRadius: 3, fontSize: 10, color: 'var(--nexus-text-3)' }}>/</kbd> for slash commands
      </p>
    </div>
  );
}

// ── Main OpsChat ──────────────────────────────────────────────────────────────────
export default function OpsChat() {
  const navigate = useNavigate();
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [showCmd, setShowCmd]     = useState(false);
  const [kbHealth, setKbHealth]   = useState(null);
  const bottomRef  = useRef(null);
  const textareaRef = useRef(null);
  const hasMounted = useRef(false);
  const sendRef    = useRef(null);
  const stateRef   = useRef({ input: '', loading: false, messages: [] });
  stateRef.current = { input, loading, messages };

  // Scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // Stable sendMessage — reads state via ref, no deps needed
  const sendMessage = useCallback(async (text) => {
    const { input: curInput, loading: curLoading, messages: curMessages } = stateRef.current;
    const trimmed = (typeof text === 'string' ? text : curInput).trim();
    if (!trimmed || curLoading) return;

    setInput('');
    setShowCmd(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const history = curMessages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setLoading(true);

    try {
      const res = await sendOpsChat(trimmed, history);
      const reply = res?.reply || 'No response.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply,
        contextUsed:    res?.contextUsed    || [],
        referencedCards: res?.referencedCards || [],
        semanticHits:   res?.semanticHits   || [],
        clusters:       res?.clusters        || [],
        reviewCount:    res?.reviewCount     ?? null,
        chartData:      res?.chartData       || null,
        suggestions:    getSuggestions(reply, res?.contextUsed || []),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to reach NEXUS Ops Intelligence. Check network connectivity.',
        contextUsed: [], referencedCards: [], semanticHits: [], suggestions: [],
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, []); // stable — reads stateRef

  // Keep sendRef current so the boot timer can call it
  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  // Boot: load KB health + auto-query
  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    getKbHealth().then(setKbHealth);
    const t = setTimeout(() => {
      sendRef.current?.('Summarise current operational status. List the top 3 priority incidents by INC reference, severity, and location.');
    }, 700);
    return () => clearTimeout(t);
  }, []);

  function onInputChange(e) {
    const val = e.target.value;
    setInput(val);
    setShowCmd(val === '/' || (val.startsWith('/') && !val.includes(' ')));
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === 'Escape') setShowCmd(false);
  }

  const filteredCmds = SLASH_COMMANDS.filter(
    c => input === '/' || c.cmd.startsWith(input.split(' ')[0])
  );

  const isEmpty = messages.length === 0 && !loading;

  return (
    <Layout title="Ops Chat">
      <div style={{ display: 'flex', height: 'calc(100vh - 57px)', margin: '-20px -24px 0', background: BG, overflow: 'hidden' }}>

        {/* ── Left rail ── */}
        <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${BORDER}`, background: SURFACE }}>
          {/* Header */}
          <div style={{ padding: '16px 14px 12px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <Brain size={13} color={RED} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--nexus-text-1)', letterSpacing: '-0.01em' }}>Ops Intel</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 5px rgba(16,185,129,0.7)' }} />
              <span style={{ fontSize: 9, color: 'var(--nexus-text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Live · KB Ready</span>
            </div>
          </div>

          {/* Commands list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
            <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--nexus-text-3)', marginBottom: 8, paddingLeft: 6 }}>
              Commands
            </p>
            {SLASH_COMMANDS.map(c => {
              const Icon = c.icon;
              return (
                <button
                  key={c.cmd}
                  type="button"
                  onClick={() => sendMessage(c.prompt)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '6px 8px', marginBottom: 1, background: 'transparent', border: 'none', borderRadius: 5, cursor: 'pointer', textAlign: 'left', transition: 'background 120ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--nexus-surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Icon size={11} color="var(--nexus-text-3)" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: RED, fontWeight: 700, lineHeight: 1 }}>{c.cmd}</div>
                    <div style={{ fontSize: 10, color: 'var(--nexus-text-3)', lineHeight: 1.3, marginTop: 2 }}>{c.label}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* KB status mini-panel */}
          {kbHealth && (
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--nexus-text-3)', marginBottom: 7 }}>KB Status</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <Sparkles size={10} color="#FF8C00" />
                <span style={{ fontSize: 10, color: '#FF8C00' }}>{kbHealth.embeddingCount || 0} vectors</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Brain size={10} color={RED} />
                <span style={{ fontSize: 10, color: RED }}>{kbHealth.sopCount || 0} SOPs</span>
              </div>
            </div>
          )}

          {/* Clear */}
          <div style={{ padding: '8px', borderTop: `1px solid ${BORDER}` }}>
            <button
              type="button"
              onClick={() => setMessages([])}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '7px', borderRadius: 6, fontSize: 11, color: 'var(--nexus-text-3)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 150ms' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexus-text-3)')}
            >
              <Trash2 size={12} /> Clear session
            </button>
          </div>
        </div>

        {/* ── Chat main ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Messages stream */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isEmpty ? 0 : '28px 32px', display: 'flex', flexDirection: 'column', gap: 26 }}>

            {isEmpty && <EmptyState kbHealth={kbHealth} onSend={sendMessage} />}

            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', animation: 'opsIn 220ms ease forwards' }}>

                  {isUser ? (
                    <div style={{
                      maxWidth: '68%', padding: '10px 15px',
                      borderRadius: '12px 12px 3px 12px',
                      background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`,
                      fontSize: 13, color: 'var(--nexus-text-1)', lineHeight: 1.65,
                    }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div style={{ maxWidth: '84%', width: '100%' }}>
                      {/* NEXUS label */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 5, background: `${RED}18`, border: `1px solid ${RED}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Brain size={11} color={RED} />
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: RED, letterSpacing: '0.07em' }}>NEXUS</span>
                      </div>

                      <MarkdownText text={msg.content} />

                      {/* Inline charts */}
                      <InlineCharts chartData={msg.chartData} />

                      {/* Referenced incidents as action cards */}
                      <ActionCards cards={msg.referencedCards} navigate={navigate} />

                      {/* Semantic KB hits */}
                      {msg.semanticHits?.length > 0 && (
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <p style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#FF8C00', textTransform: 'uppercase', marginBottom: 4 }}>
                            — vector kb matches —
                          </p>
                          {msg.semanticHits.slice(0, 3).map((hit, j) => (
                            <SemanticHit key={j} hit={hit} />
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      {(msg.reviewCount > 0 || msg.clusters?.length > 0) && (
                        <div style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
                          {msg.reviewCount > 0 && (
                            <button type="button" onClick={() => navigate('/inbox')}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)', color: '#F59E0B', cursor: 'pointer' }}>
                              <Inbox size={11} /> Review Queue ({msg.reviewCount})
                            </button>
                          )}
                          {msg.clusters?.length > 0 && (
                            <button type="button" onClick={() => navigate('/proactive')}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${RED}0E`, border: `1px solid ${RED}28`, color: RED, cursor: 'pointer' }}>
                              <AlertTriangle size={11} /> Proactive Alert ({msg.clusters.length})
                            </button>
                          )}
                          <button type="button" onClick={() => navigate('/admin')}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(129,140,248,0.09)', border: '1px solid rgba(129,140,248,0.24)', color: '#FF8C00', cursor: 'pointer' }}>
                            <BarChart3 size={11} /> Full Dashboard
                          </button>
                        </div>
                      )}

                      <SourceBadges sources={msg.contextUsed} />
                      <SuggestionChips suggestions={msg.suggestions} onSelect={sendMessage} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Thinking indicator */}
            {loading && (
              <div style={{ animation: 'opsIn 200ms ease forwards' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: `${RED}18`, border: `1px solid ${RED}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Brain size={11} color={RED} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: RED, letterSpacing: '0.07em' }}>NEXUS</span>
                </div>
                <ThinkingIndicator />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Compose bar ── */}
          <div style={{ borderTop: `1px solid ${BORDER}`, background: SURFACE, padding: '12px 20px', position: 'relative' }}>

            {/* Floating command palette */}
            {showCmd && filteredCmds.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 20, right: 20, marginBottom: 6,
                background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 9,
                overflow: 'hidden', boxShadow: '0 -16px 48px rgba(0,0,0,0.65)',
              }}>
                <div style={{ padding: '6px 12px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Command size={10} color="var(--nexus-text-3)" />
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--nexus-text-3)' }}>Slash commands</span>
                </div>
                {filteredCmds.map(c => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.cmd}
                      type="button"
                      onClick={() => sendMessage(c.prompt)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '9px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', textAlign: 'left', transition: 'background 100ms' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--nexus-surface-3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <Icon size={12} color="var(--nexus-text-3)" style={{ flexShrink: 0 }} />
                      <span style={{ fontFamily: MONO, fontSize: 12, color: RED, fontWeight: 700, minWidth: 72 }}>{c.cmd}</span>
                      <span style={{ fontSize: 12, color: 'var(--nexus-text-2)' }}>{c.label}</span>
                      <ArrowRight size={11} color="var(--nexus-text-3)" style={{ marginLeft: 'auto' }} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Input wrapper */}
            <div
              style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px', background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 10, transition: 'border-color 150ms' }}
              onFocusCapture={e => (e.currentTarget.style.borderColor = `${RED}42`)}
              onBlurCapture={e => (e.currentTarget.style.borderColor = BORDER)}
            >
              <Terminal size={14} color="var(--nexus-text-3)" style={{ flexShrink: 0, marginBottom: 4 }} />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={onInputChange}
                onKeyDown={onKeyDown}
                disabled={loading}
                placeholder="Ask anything… or type / for commands"
                rows={1}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 13, lineHeight: 1.6, color: 'var(--nexus-text-1)', fontFamily: 'inherit', maxHeight: 120, minHeight: 22, opacity: loading ? 0.5 : 1 }}
              />
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: input.trim() && !loading ? RED : `${RED}28`, border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', transition: 'all 150ms' }}
              >
                <Send size={14} color="#fff" />
              </button>
            </div>

            <p style={{ marginTop: 5, textAlign: 'center', fontSize: 10, color: 'var(--nexus-text-3)' }}>
              Enter ↵ to send · Shift+Enter for newline · Type <span style={{ fontFamily: MONO, color: 'var(--nexus-text-3)' }}>/</span> for commands
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
