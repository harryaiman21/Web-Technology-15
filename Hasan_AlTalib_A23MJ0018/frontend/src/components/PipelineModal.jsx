import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Minus, Maximize2, CheckCircle, XCircle, Loader2,
  FileSearch, Zap, Tag, Copy, Shield, AlertTriangle,
  UserCheck, Activity, Mail, Package, MapPin, Calendar,
  User, Layers, Cpu, TrendingUp, MousePointerClick,
  BookOpen, BarChart3, ArrowUpCircle, Bell, Clock, HeartPulse,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';

/* ─── Stage definitions ─────────────────────────────────────────────────────── */

const STAGES = [
  { key: 'intake',       label: 'Email Intake',    agentId: 'intake',       Icon: FileSearch, subtitle: 'Parsing raw incident report' },
  { key: 'ml-service',   label: 'ML Classify',     agentId: 'ml-service',   Icon: Zap,        subtitle: 'LightGBM model scoring' },
  { key: 'classifier',   label: 'AI Classify',     agentId: 'classifier',   Icon: Tag,        subtitle: 'LLM-enhanced classification' },
  { key: 'dedup',        label: 'Dedup Check',     agentId: 'dedup',        Icon: Copy,       subtitle: 'Semantic duplicate detection' },
  { key: 'case-memory',  label: 'Case Memory',     agentId: 'case-memory',  Icon: BookOpen,   subtitle: 'CRAG-powered similar case retrieval' },
  { key: 'resolution',      label: 'Resolution',       agentId: 'resolution',      Icon: CheckCircle, subtitle: 'Context-aware SOP resolution' },
  { key: 'react-reflect',   label: 'ReAct Review',     agentId: 'react-reflect',   Icon: RefreshCw,   subtitle: 'Self-correction quality gate' },
  { key: 'shap',            label: 'Explainability',   agentId: 'shap',            Icon: BarChart3,   subtitle: 'SHAP feature attribution' },
  { key: 'vision',          label: 'Vision Analysis',  agentId: 'vision',          Icon: Package,     subtitle: 'Claude Vision damage assessment' },
];

const AGENT_ACCENT = {
  intake:             '#fbbf24',
  'ml-service':       '#3b82f6',
  classifier:         '#FFCC00',
  dedup:              '#FF8C00',
  resolution:         '#34d399',
  'react-reflect':    '#f97316',
  'case-memory':      '#FFCC00',
  shap:               '#FF8C00',
  vision:             '#a78bfa',
  hitl_decision:      '#fbbf24',
  pipeline_complete:  '#34d399',
};

/* ─── State derivation ──────────────────────────────────────────────────────── */

function deriveState(events, isActive) {
  const byAgent = {};
  const byType = {};
  let hasError = false;

  for (const ev of events) {
    if (ev.agentId) byAgent[ev.agentId] = ev;
    if (ev.type === 'pipeline_error') hasError = true;
    if (ev.type) byType[ev.type] = ev;
  }

  const snapshots = events.filter(ev => ev.type === 'confidence_snapshot');

  const stages = STAGES.map((stage, idx) => {
    const ev = byAgent[stage.agentId] || null;
    const isCompleted = !!ev;
    const prevDone = idx === 0 || !!byAgent[STAGES[idx - 1].agentId];
    let state = 'pending';
    if (isCompleted) state = 'completed';
    else if (prevDone && isActive && !hasError) state = 'active';
    else if (prevDone && hasError) state = 'error';
    return { ...stage, state, event: ev };
  });

  const autonomousEvent = events.find(ev => ev.type === 'autonomous_actions');

  return {
    stages,
    hitl:       byType['hitl_decision']    || null,
    complete:   byType['pipeline_complete'] || null,
    ackEvent:   byType['acknowledgement_sent'] || null,
    uncertainty: byType['uncertainty_signal'] || null,
    autonomousActions: autonomousEvent?.actions || [],
    hasError,
    snapshots,
    isComplete: !!byType['pipeline_complete'],
  };
}

/* ─── Tiny helpers ──────────────────────────────────────────────────────────── */

function fv(f) {
  if (!f) return null;
  if (typeof f === 'string') return f || null;
  if (typeof f.value === 'string') return f.value || null;
  return null;
}
function pct(v) { return typeof v === 'number' ? `${Math.round(v * 100)}%` : null; }
function sevColor(s) {
  return ({ Critical: '#ff2d55', High: '#ff9500', Medium: '#FFCC00', Low: '#34c759' })[s] || '#8e8e93';
}

/* ─── Confidence ring ───────────────────────────────────────────────────────── */

function Ring({ value, color = '#FFCC00', size = 72 }) {
  if (typeof value !== 'number') return null;
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(1, value));
  const rc = value >= 0.8 ? '#10b981' : value >= 0.6 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(34,211,238,0.08)" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={rc} strokeWidth={5}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.4,0,.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: rc, fontFamily: 'monospace', lineHeight: 1 }}>{pct(value)}</span>
        <span style={{ fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>conf</span>
      </div>
    </div>
  );
}

/* ─── Reasoning content renderers ───────────────────────────────────────────── */

function Sec({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--nexus-border)' }} />
      </div>
      {children}
    </div>
  );
}

function Chip({ color, children }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
      background: `${color}15`, color, border: `1px solid ${color}28` }}>
      {children}
    </span>
  );
}

function ConfBar({ value }) {
  if (typeof value !== 'number') return null;
  const c = value >= 0.8 ? '#10b981' : value >= 0.6 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--nexus-surface-2)' }}>
        <div style={{ width: `${Math.round(value*100)}%`, height: '100%', borderRadius: 2, background: c,
          transition: 'width 700ms cubic-bezier(.4,0,.2,1)' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', width: 30, textAlign: 'right', flexShrink: 0 }}>{pct(value)}</span>
    </div>
  );
}

function IntakeContent({ event }) {
  const f = event?.fields || {};
  const desc = fv(f.description);
  return (
    <>
      <Sec title="Extracted Fields">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[[User,'Reporter',fv(f.reporter)],[MapPin,'Location',fv(f.location)],[Calendar,'Date',fv(f.date)],
            [Mail,'Email',fv(f.reporterEmail)||fv(f.customerEmail)||fv(f.email)||fv(f.from)]]
            .filter(r=>r[2]).map(([Icon,label,val])=>(
              <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Icon size={12} style={{ color:'var(--text-3)', marginTop:2, flexShrink:0 }} />
                <span style={{ fontSize:11, color:'var(--text-3)', width:52, flexShrink:0 }}>{label}</span>
                <span style={{ fontSize:12, color:'var(--text-1)', wordBreak:'break-word' }}>{val}</span>
              </div>
          ))}
        </div>
      </Sec>
      {desc && (
        <Sec title="Description">
          <p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.65, fontStyle:'italic' }}>"{desc}"</p>
        </Sec>
      )}
    </>
  );
}

function MLContent({ event }) {
  const probs = event?.probabilities
    ? Object.entries(event.probabilities).sort(([,a],[,b])=>b-a).slice(0,5) : null;
  return (
    <>
      <Sec title="Prediction">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:14, fontWeight:700, color:'var(--text-1)' }}>
            {(event?.decision||'unknown').replace(/_/g,' ')}
          </span>
        </div>
        <ConfBar value={event?.confidence} />
        {event?.reasoning && <p style={{ fontSize:11, color:'var(--text-3)', margin:0, fontStyle:'italic' }}>{event.reasoning}</p>}
      </Sec>
      {probs?.length > 0 && (
        <Sec title="Class Probabilities">
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {probs.map(([cls,prob])=>(
              <div key={cls} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:10, color:'var(--text-3)', width:96, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {cls.replace(/_/g,' ')}
                </span>
                <div style={{ flex:1, height:4, borderRadius:2, background:'var(--nexus-surface-2)' }}>
                  <div style={{ width:`${Math.round(prob*100)}%`, height:'100%', borderRadius:2, background: prob>0.5?'#FFCC00':'rgba(34,211,238,0.4)' }} />
                </div>
                <span style={{ fontSize:10, color:'var(--text-3)', fontFamily:'monospace', width:28, textAlign:'right', flexShrink:0 }}>
                  {Math.round(prob*100)}%
                </span>
              </div>
            ))}
          </div>
        </Sec>
      )}
    </>
  );
}

function ClassifierContent({ event }) {
  const f = event?.fields || {};
  const type = fv(f.type) || event?.decision;
  const sev = fv(f.severity) || event?.severity;
  const dept = fv(f.department);
  return (
    <>
      <Sec title="Classification">
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {type && <Chip color="#FFCC00">{type.replace(/_/g,' ')}</Chip>}
          {sev && <Chip color={sevColor(sev)}>{sev}</Chip>}
          {dept && <Chip color="#8b92a9">{dept}</Chip>}
        </div>
        <ConfBar value={event?.confidence} />
      </Sec>
      {event?.reasoning && (
        <Sec title="Reasoning">
          <p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.65 }}>{event.reasoning}</p>
        </Sec>
      )}
    </>
  );
}

function DedupContent({ event }) {
  const isDup = event?.isDuplicate;
  const accent = isDup ? '#f59e0b' : '#10b981';
  return (
    <>
      <Sec title="Result">
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:8,
          background:`${accent}0d`, border:`1px solid ${accent}25` }}>
          {isDup ? <AlertTriangle size={18} style={{ color:accent }}/> : <CheckCircle size={18} style={{ color:accent }}/>}
          <div>
            <p style={{ fontSize:14, fontWeight:700, color:accent, margin:0 }}>
              {isDup ? 'Duplicate Detected' : 'Unique Incident'}
            </p>
            {isDup && event?.matchedIncidentId && (
              <p style={{ fontSize:12, color:'var(--text-3)', margin:'2px 0 0' }}>
                Matched: <code style={{ color:accent, fontFamily:'monospace' }}>
                  INC-{String(event.matchedIncidentId).slice(-8).toUpperCase()}
                </code>
              </p>
            )}
          </div>
        </div>
      </Sec>
      {event?.reasoning && (
        <Sec title="Reasoning">
          <p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.65 }}>{event.reasoning}</p>
        </Sec>
      )}
    </>
  );
}

function ResolutionContent({ event }) {
  const steps = event?.steps || event?.resolutionSteps || [];
  return (
    <>
      {event?.sopCode && (
        <Sec title="SOP Reference">
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:6,
            background:'rgba(34,211,238,0.08)', border:'1px solid rgba(34,211,238,0.18)' }}>
            <Layers size={14} style={{ color:'#FFCC00' }}/>
            <code style={{ fontSize:13, fontWeight:700, color:'#FFCC00', fontFamily:'monospace' }}>{event.sopCode}</code>
          </div>
        </Sec>
      )}
      {steps.length > 0 && (
        <Sec title={`Action Steps (${steps.length})`}>
          <ol style={{ margin:0, padding:'0 0 0 18px', display:'flex', flexDirection:'column', gap:8 }}>
            {steps.map((step,i)=>(
              <li key={i} style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6 }}>
                {typeof step==='string'?step:step.text||step.action||String(step)}
              </li>
            ))}
          </ol>
        </Sec>
      )}
      {event?.reasoning && (
        <Sec title="Reasoning">
          <p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.65 }}>{event.reasoning}</p>
        </Sec>
      )}
    </>
  );
}

function ReactReflectContent({ event }) {
  const isRevised = event?.decision === 'revised';
  const verdictColor = isRevised ? '#f97316' : '#10b981';
  const verdictLabel = isRevised ? 'REVISED' : 'APPROVED';
  const verdictIcon = isRevised ? <RefreshCw size={13} /> : <CheckCircle size={13} />;

  return (
    <>
      <Sec title="Quality Verdict">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 20,
            background: `${verdictColor}18`, color: verdictColor,
            border: `1px solid ${verdictColor}35`,
          }}>
            {verdictIcon} {verdictLabel}
          </span>
          {isRevised && event?.revisedStepCount && (
            <Chip color="#f97316">{event.revisedStepCount} steps revised</Chip>
          )}
        </div>
      </Sec>

      {isRevised && (event?.originalTone || event?.revisedTone) && (
        <Sec title="Tone Adaptation">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6,
              background: 'var(--nexus-surface-2)', color: 'var(--text-3)',
              textDecoration: 'line-through', opacity: 0.6,
            }}>
              {event.originalTone || 'professional'}
            </span>
            <TrendingUp size={14} style={{ color: '#f97316', flexShrink: 0 }} />
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
              background: 'rgba(249,115,22,0.1)', color: '#f97316',
              border: '1px solid rgba(249,115,22,0.2)',
            }}>
              {event.revisedTone || 'empathetic'}
            </span>
          </div>
        </Sec>
      )}

      {event?.reasoning && (
        <Sec title="Reasoning">
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.65 }}>
            {event.reasoning}
          </p>
        </Sec>
      )}
    </>
  );
}

function CaseMemoryContent({ event }) {
  const cases = event?.cases || [];
  const cragUsed = event?.cragUsed;
  return (
    <>
      <Sec title="Retrieval">
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <Chip color="#FFCC00">{cases.length} case{cases.length !== 1 ? 's' : ''} retrieved</Chip>
          {cragUsed && <Chip color="#a855f7">CRAG reformulated</Chip>}
        </div>
        <ConfBar value={event?.confidence} />
      </Sec>
      {cases.length > 0 && (
        <Sec title="Similar Resolved Cases">
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {cases.map((c, i) => (
              <div key={i} style={{ padding:'10px 12px', borderRadius:8,
                background:'rgba(6,182,212,0.06)', border:'1px solid rgba(6,182,212,0.15)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', flex:1, minWidth:0 }}>
                    {c.title || 'Resolved incident'}
                  </span>
                  {c.similarity != null && (
                    <span style={{ fontSize:10, fontFamily:'monospace', color:'#FFCC00', flexShrink:0 }}>
                      {Math.round(c.similarity * 100)}% match
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', gap:6, marginTop:5, flexWrap:'wrap' }}>
                  {c.type && <Chip color="#8b92a9">{c.type.replace(/_/g, ' ')}</Chip>}
                  {c.location && (
                    <span style={{ fontSize:10, color:'var(--text-3)', display:'flex', alignItems:'center', gap:3 }}>
                      <MapPin size={9} /> {c.location}
                    </span>
                  )}
                </div>
                {c.resolutionNote && (
                  <p style={{ fontSize:11, color:'var(--text-3)', margin:'6px 0 0', lineHeight:1.5, fontStyle:'italic' }}>
                    Resolution: {c.resolutionNote.length > 120 ? c.resolutionNote.slice(0, 120) + '...' : c.resolutionNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Sec>
      )}
      {event?.reasoning && (
        <Sec title="Reasoning">
          <p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.65 }}>{event.reasoning}</p>
        </Sec>
      )}
      {cragUsed && event?.reformulatedQuery && (
        <Sec title="Query Reformulation">
          <div style={{ padding:'8px 12px', borderRadius:6, background:'rgba(168,85,247,0.06)',
            border:'1px solid rgba(168,85,247,0.15)' }}>
            <p style={{ fontSize:10, color:'var(--text-3)', margin:'0 0 3px', textTransform:'uppercase', letterSpacing:'0.08em' }}>
              Reformulated search query
            </p>
            <p style={{ fontSize:12, color:'#a855f7', margin:0, fontFamily:'monospace' }}>
              "{event.reformulatedQuery}"
            </p>
          </div>
        </Sec>
      )}
    </>
  );
}

function ShapContent({ event }) {
  const topPos = event?.topPositive || [];
  const topNeg = event?.topNegative || [];
  const allFeatures = event?.features || [];
  const maxAbs = allFeatures.length > 0
    ? Math.max(...allFeatures.map(f => Math.abs(f.shap_value || 0)), 0.001) : 1;
  return (
    <>
      <Sec title="Predicted Class">
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Chip color="#FFCC00">{(event?.predictedClass || event?.decision || 'unknown').replace(/_/g, ' ')}</Chip>
          <ConfBar value={event?.confidence} />
        </div>
      </Sec>
      {topPos.length > 0 && (
        <Sec title="Top Contributing Features">
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {topPos.map((f, i) => {
              const w = Math.round((Math.abs(f.shap_value || 0) / maxAbs) * 100);
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:10, color:'var(--text-3)', width:100, flexShrink:0, overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>
                    {f.feature}
                  </span>
                  <div style={{ flex:1, height:6, borderRadius:3, background:'var(--nexus-surface-2)' }}>
                    <div style={{ width:`${w}%`, height:'100%', borderRadius:3, background:'#10b981',
                      transition:'width 600ms cubic-bezier(.4,0,.2,1)' }} />
                  </div>
                  <span style={{ fontSize:10, color:'#10b981', fontFamily:'monospace', width:44,
                    textAlign:'right', flexShrink:0 }}>
                    +{(f.shap_value || 0).toFixed(3)}
                  </span>
                </div>
              );
            })}
          </div>
        </Sec>
      )}
      {topNeg.length > 0 && (
        <Sec title="Counter-Signals">
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {topNeg.map((f, i) => {
              const w = Math.round((Math.abs(f.shap_value || 0) / maxAbs) * 100);
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:10, color:'var(--text-3)', width:100, flexShrink:0, overflow:'hidden',
                    textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>
                    {f.feature}
                  </span>
                  <div style={{ flex:1, height:6, borderRadius:3, background:'var(--nexus-surface-2)' }}>
                    <div style={{ width:`${w}%`, height:'100%', borderRadius:3, background:'#ef4444',
                      transition:'width 600ms cubic-bezier(.4,0,.2,1)' }} />
                  </div>
                  <span style={{ fontSize:10, color:'#ef4444', fontFamily:'monospace', width:44,
                    textAlign:'right', flexShrink:0 }}>
                    {(f.shap_value || 0).toFixed(3)}
                  </span>
                </div>
              );
            })}
          </div>
        </Sec>
      )}
      {event?.reasoning && (
        <Sec title="Reasoning">
          <p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.65 }}>{event.reasoning}</p>
        </Sec>
      )}
    </>
  );
}

function HitlContent({ event }) {
  const needsReview = event?.holdForReview;
  const accent = needsReview ? '#f59e0b' : '#10b981';
  return (
    <Sec title="HITL Decision">
      <div style={{ padding:'16px', borderRadius:10, background:`${accent}0d`, border:`1px solid ${accent}25` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
          {needsReview ? <AlertTriangle size={20} style={{ color:accent }}/> : <UserCheck size={20} style={{ color:accent }}/>}
          <span style={{ fontSize:16, fontWeight:800, color:accent }}>
            {needsReview ? 'Human Review Required' : 'Auto-Assigned'}
          </span>
        </div>
        {event?.hitlReason && (
          <p style={{ fontSize:13, color:'var(--text-2)', margin:'0 0 10px', lineHeight:1.6 }}>{event.hitlReason}</p>
        )}
        <div style={{ display:'flex', gap:8 }}>
          {event?.severity && <Chip color={sevColor(event.severity)}>{event.severity}</Chip>}
          {event?.confidence != null && (
            <span style={{ fontSize:11, color:'var(--text-3)', fontFamily:'monospace', alignSelf:'center' }}>{pct(event.confidence)}</span>
          )}
        </div>
      </div>
    </Sec>
  );
}

function VisionContent({ event }) {
  const sev = event?.severityScore ?? 0;
  const sevColor = sev >= 4.5 ? '#ef4444' : sev >= 3.5 ? '#f97316' : sev >= 2.5 ? '#fbbf24' : '#10b981';
  const sevLabel = sev >= 4.5 ? 'Critical' : sev >= 3.5 ? 'High' : sev >= 2.5 ? 'Medium' : 'Low';
  const areas = event?.affectedAreas || [];
  return (
    <>
      <Sec title="Damage Assessment">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Chip color="#a78bfa">{(event?.damageType || 'unknown').replace(/_/g, ' ')}</Chip>
          <span style={{ fontSize: 11, fontWeight: 700, color: sevColor,
            background: `${sevColor}18`, border: `1px solid ${sevColor}30`,
            borderRadius: 4, padding: '2px 8px' }}>
            Severity {sevLabel} ({sev.toFixed(1)}/5)
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
            Confidence {Math.round((event?.confidence || 0) * 100)}%
          </span>
        </div>
      </Sec>
      {areas.length > 0 && (
        <Sec title="Affected Areas">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {areas.map((a, i) => (
              <span key={i} style={{ fontSize: 11, color: '#f97316', background: '#f9731615',
                border: '1px solid #f9731630', borderRadius: 4, padding: '2px 8px' }}>
                {a}
              </span>
            ))}
          </div>
        </Sec>
      )}
      {event?.packagingCondition && (
        <Sec title="Packaging Condition">
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {event.packagingCondition.replace(/_/g, ' ')}
          </span>
        </Sec>
      )}
      {event?.consistencyNote && (
        <Sec title={event.consistencyMatch ? 'Photo-Text Consistent' : 'Inconsistency Detected'}>
          <p style={{ fontSize: 12, color: event.consistencyMatch ? '#10b981' : '#f97316',
            margin: 0, lineHeight: 1.5 }}>
            {event.consistencyNote}
          </p>
        </Sec>
      )}
      <Sec title="Powered by">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700,
            background: '#a78bfa15', border: '1px solid #a78bfa30', borderRadius: 4, padding: '2px 8px' }}>
            Claude Vision (claude-sonnet-4-6)
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Multi-modal damage analysis</span>
        </div>
      </Sec>
    </>
  );
}

function EventContent({ event }) {
  const key = event?.agentId || event?.type;
  switch (key) {
    case 'intake':             return <IntakeContent event={event} />;
    case 'ml-service':         return <MLContent event={event} />;
    case 'classifier':         return <ClassifierContent event={event} />;
    case 'dedup':              return <DedupContent event={event} />;
    case 'resolution':         return <ResolutionContent event={event} />;
    case 'react-reflect':      return <ReactReflectContent event={event} />;
    case 'case-memory':        return <CaseMemoryContent event={event} />;
    case 'shap':               return <ShapContent event={event} />;
    case 'vision':             return <VisionContent event={event} />;
    case 'hitl_decision':      return <HitlContent event={event} />;
    default:
      return event?.reasoning || event?.decision
        ? <Sec title="Details"><p style={{ fontSize:13, color:'var(--text-2)', margin:0, lineHeight:1.65 }}>{event.reasoning||event.decision}</p></Sec>
        : null;
  }
}

/* ─── Left panel: pipeline stages ──────────────────────────────────────────── */

function StageRow({ stage, selected, onClick, isLast }) {
  const { state, label, subtitle, Icon, event } = stage;
  const done = state === 'completed';
  const active = state === 'active';
  const error = state === 'error';
  const pending = state === 'pending';
  const nodeAccent = done ? '#FFCC00' : active ? '#FFCC00' : error ? '#ff2d55' : 'var(--nexus-border)';
  const lineColor = done ? 'rgba(34,211,238,0.3)' : 'var(--nexus-border)';
  const isClickable = done && !!event;

  return (
    <div style={{ display:'flex', gap:10, opacity: pending ? 0.38 : 1, transition:'opacity 350ms' }}>
      {/* Gutter */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0, width:28 }}>
        <div
          onClick={() => isClickable && onClick(event)}
          style={{
            width:28, height:28, borderRadius:'50%', flexShrink:0,
            display:'flex', alignItems:'center', justifyContent:'center',
            background: done ? '#FFCC00' : 'transparent',
            border: `2px solid ${selected && done ? '#fff' : nodeAccent}`,
            color: done ? '#fff' : nodeAccent,
            boxShadow: selected && done
              ? '0 0 0 3px rgba(34,211,238,0.25), 0 0 16px rgba(34,211,238,0.4)'
              : done ? '0 0 10px rgba(34,211,238,0.3)' : active ? '0 0 8px rgba(255,204,0,0.25)' : 'none',
            transition:'all 350ms ease',
            cursor: isClickable ? 'pointer' : 'default',
          }}
          className={active ? 'pipeline-node-pulse' : ''}
        >
          {done ? <CheckCircle size={14} strokeWidth={2.5}/>
            : active ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none"/>
            : error ? <XCircle size={14}/>
            : <Icon size={13}/>}
        </div>
        {!isLast && (
          <div style={{ flex:1, width:1, minHeight:10, background:lineColor, transition:'background 400ms' }}/>
        )}
      </div>

      {/* Content */}
      <div
        onClick={() => isClickable && onClick(event)}
        style={{
          flex:1, minWidth:0, paddingBottom: isLast ? 0 : 10,
          cursor: isClickable ? 'pointer' : 'default',
        }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:12, fontWeight:600, color: done||active ? 'var(--text-1)' : 'var(--text-3)',
            transition:'color 300ms' }}>
            {label}
          </span>
          {active && <span style={{ fontSize:9, color:'#FFCC00', animation:'blink 1s step-end infinite' }}>●</span>}
          {done && selected && (
            <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3,
              background:'var(--nexus-surface-3)', color:'var(--text-3)' }}>
              selected
            </span>
          )}
        </div>
        <p style={{ fontSize:10, color:'var(--text-3)', margin:'1px 0 0' }}>{subtitle}</p>
      </div>
    </div>
  );
}

/* ─── Right panel ───────────────────────────────────────────────────────────── */

function RightPanel({ event, isManual, activeAgentId, thinkingText }) {
  const key = event ? (event.agentId || event.type) : 'empty';
  const accent = AGENT_ACCENT[key] || AGENT_ACCENT[activeAgentId] || '#8b92a9';
  const conf = typeof event?.confidence === 'number' ? event.confidence
    : typeof event?.overallConfidence === 'number' ? event.overallConfidence : null;

  const ICONS = {
    intake: FileSearch, 'ml-service': Zap, classifier: Tag, dedup: Copy,
    resolution: CheckCircle, 'case-memory': BookOpen, shap: BarChart3, vision: Package,
    hitl_decision: UserCheck, pipeline_complete: Shield, orchestrator: Cpu,
  };
  const Icon = ICONS[key] || ICONS[activeAgentId] || Activity;

  if (!event) {
    if (thinkingText && activeAgentId) {
      const activeAccent = AGENT_ACCENT[activeAgentId] || '#8b92a9';
      const ActiveIcon = ICONS[activeAgentId] || Activity;
      const LABEL = {
        intake:'Email Intake','ml-service':'ML Classifier',classifier:'AI Classifier',
        dedup:'Dedup Check',resolution:'Resolution Agent','case-memory':'Case Memory',
        shap:'Explainability',vision:'Vision Analysis',
      };
      return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px',
            borderBottom:'1px solid var(--nexus-border)', flexShrink:0 }}>
            <div style={{ width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
              background:`${activeAccent}15`, border:`1px solid ${activeAccent}28`, flexShrink:0 }}>
              <ActiveIcon size={15} style={{ color:activeAccent }}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--text-1)', margin:0 }}>
                {LABEL[activeAgentId] || activeAgentId}
              </p>
              <p style={{ fontSize:10, color:activeAccent, margin:'1px 0 0' }}>Reasoning live...</p>
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
            <ThinkingStream text={thinkingText} agentId={activeAgentId} />
          </div>
        </div>
      );
    }
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:12, padding:'32px 24px', minHeight:200 }}>
        <div style={{ width:48, height:48, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center',
          background:'var(--nexus-surface-2)', border:'1px solid var(--nexus-border)' }}>
          <MousePointerClick size={20} style={{ color:'var(--text-3)' }}/>
        </div>
        <p style={{ fontSize:13, color:'var(--text-3)', textAlign:'center', margin:0, lineHeight:1.6, maxWidth:200 }}>
          Click any completed stage to inspect the agent's reasoning
        </p>
      </div>
    );
  }

  const LABEL = {
    intake:'Email Intake','ml-service':'ML Classifier',classifier:'AI Classifier',
    dedup:'Dedup Check',resolution:'Resolution Agent','case-memory':'Case Memory',
    shap:'Explainability',vision:'Vision Analysis',hitl_decision:'HITL Gate',pipeline_complete:'Pipeline Complete',
  };

  return (
    <div key={key} style={{ flex:1, display:'flex', flexDirection:'column', gap:0,
      animation:'reason-in 260ms cubic-bezier(.16,1,.3,1) forwards' }}>
      {/* Sub-header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 20px',
        borderBottom:'1px solid var(--nexus-border)', flexShrink:0 }}>
        <div style={{ width:32, height:32, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
          background:`${accent}15`, border:`1px solid ${accent}28`, flexShrink:0 }}>
          <Icon size={15} style={{ color:accent }}/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--text-1)', margin:0 }}>
            {LABEL[key] || key}
          </p>
          {!isManual && (
            <p style={{ fontSize:10, color:'var(--text-3)', margin:'1px 0 0' }}>Auto-following pipeline</p>
          )}
        </div>
        {conf !== null && <Ring value={conf} size={60}/>}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:18,
        scrollbarWidth:'thin', scrollbarColor:'var(--nexus-border) transparent' }}>
        <EventContent event={event}/>
      </div>
    </div>
  );
}

/* ─── Minimized chip ────────────────────────────────────────────────────────── */

function MinimizedChip({ stages, isActive, isComplete, hasError, onExpand }) {
  const done = stages.filter(s => s.state === 'completed').length;
  const total = stages.length;
  const accent = hasError ? '#ef4444' : isComplete ? '#10b981' : '#FFCC00';

  return (
    <button
      type="button"
      onClick={onExpand}
      style={{
        position:'fixed', bottom:24, right:24, zIndex:150,
        display:'flex', alignItems:'center', gap:10,
        padding:'10px 16px', borderRadius:40,
        background:'var(--nexus-panel-solid)',
        border:'1px solid var(--nexus-border)',
        backdropFilter:'blur(20px)',
        boxShadow:'0 8px 32px rgba(0,0,0,0.3)',
        cursor:'pointer',
        animation:'chip-in 250ms cubic-bezier(.16,1,.3,1) forwards',
      }}
    >
      <span style={{ width:8, height:8, borderRadius:'50%', background:accent, flexShrink:0,
        boxShadow:`0 0 8px ${accent}80`,
        animation: isActive ? 'blink 1s step-end infinite' : 'none' }}/>
      <span style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', whiteSpace:'nowrap' }}>
        AI Pipeline
      </span>
      <span style={{ fontSize:11, color:'var(--text-3)', fontFamily:'monospace' }}>
        {done}/{total}
      </span>
      <Maximize2 size={12} style={{ color:'var(--text-3)' }}/>
    </button>
  );
}

/* ─── Confidence chart ──────────────────────────────────────────────────────── */

function ConfChart({ snapshots }) {
  if (!snapshots || snapshots.length < 2) return null;
  const data = snapshots.map(s => ({
    name: (s.stageLabel || s.stage || '').split(' ')[0],
    conf: Math.round((s.confidence || 0) * 100),
  }));
  return (
    <div style={{ padding:'10px 0 0' }}>
      <p style={{ fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.08em', margin:'0 0 6px' }}>
        Confidence Evolution
      </p>
      <ResponsiveContainer width="100%" height={60}>
        <AreaChart data={data} margin={{ top:4, right:4, left:-28, bottom:0 }}>
          <defs>
            <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FFCC00" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#FFCC00" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="name" tick={{ fontSize:8, fill:'var(--nexus-text-3)' }} axisLine={false} tickLine={false}/>
          <YAxis domain={[0,100]} tick={{ fontSize:8, fill:'var(--nexus-text-3)' }} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{ background:'var(--nexus-panel-solid)', border:'1px solid var(--nexus-border)', borderRadius:6, fontSize:10, color:'var(--nexus-text-1)', padding:'3px 8px' }}
            formatter={v=>[`${v}%`,'Conf']} labelStyle={{ display:'none' }}/>
          <ReferenceLine y={75} stroke="rgba(34,211,238,0.3)" strokeDasharray="2 2"/>
          <Area type="monotone" dataKey="conf" stroke="#FFCC00" strokeWidth={1.5} fill="url(#cg2)"
            dot={{ fill:'#FFCC00', strokeWidth:0, r:2 }} activeDot={{ r:4, fill:'#FFCC00' }}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Thinking stream panel ─────────────────────────────────────────────────── */

function ThinkingStream({ text, agentId }) {
  const accent = AGENT_ACCENT[agentId] || '#8b92a9';
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  if (!text) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Agent Reasoning
        </span>
        <span style={{ fontSize: 9, color: accent, animation: 'blink 1s ease-in-out infinite' }}>●</span>
      </div>
      <div
        ref={scrollRef}
        style={{
          maxHeight: 320, overflowY: 'auto', padding: '10px 12px', borderRadius: 8,
          background: 'var(--nexus-surface-1)', border: `1px solid ${accent}20`,
          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.7, color: 'var(--nexus-text-3)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          scrollbarWidth: 'thin', scrollbarColor: 'var(--nexus-border) transparent',
        }}
      >
        {text}
        <span style={{ color: accent, animation: 'blink 0.8s ease-in-out infinite', marginLeft: 1 }}>▌</span>
      </div>
    </div>
  );
}

/* ─── Keyframe injection ────────────────────────────────────────────────────── */

const KF = `
  @keyframes modal-overlay-in { from { opacity:0 } to { opacity:1 } }
  @keyframes modal-panel-in { from { opacity:0; transform:scale(.94) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }
  @keyframes reason-in { from { opacity:0; transform:translateX(12px) } to { opacity:1; transform:translateX(0) } }
  @keyframes chip-in { from { opacity:0; transform:translateY(12px) scale(.9) } to { opacity:1; transform:translateY(0) scale(1) } }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes pipeline-node-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,211,238,.4)} 50%{box-shadow:0 0 14px 4px rgba(34,211,238,.2)} }
  @keyframes hitl-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes slideIn { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
  .pipeline-node-pulse { animation: pipeline-node-pulse 1.8s ease-in-out infinite; }
`;
let kfInjected = false;
function injectKF() {
  if (kfInjected || typeof document === 'undefined') return;
  kfInjected = true;
  const s = document.createElement('style');
  s.textContent = KF;
  document.head.appendChild(s);
}

/* ─── Main export ───────────────────────────────────────────────────────────── */

export default function PipelineModal({
  events = [],
  thinking = {},
  thinkingVersion = 0,
  isActive = false,
  completionMeta = null,
  onViewIncident,
  onViewQueue,
  onClose,
}) {
  useMemo(injectKF, []);

  const {
    stages, hitl, complete, ackEvent, uncertainty, snapshots,
    isComplete, hasError, autonomousActions,
  } = useMemo(() => deriveState(events, isActive), [events, isActive]);

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isManual, setIsManual] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bodyRef = useRef(null);

  // Auto-scroll pipeline left panel as events arrive
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [events.length]);

  // Auto-advance: select latest completed stage (unless user has manually picked)
  useEffect(() => {
    if (isManual) return;
    const lastDone = stages.filter(s => s.state === 'completed' && s.event).at(-1);
    if (lastDone?.event) setSelectedEvent(lastDone.event);
    // Also show hitl event when it arrives
    if (hitl) setSelectedEvent(hitl);
    if (complete) setSelectedEvent(complete);
  }, [stages, hitl, complete, isManual]);

  const handleEsc = useCallback((e) => { if (e.key === 'Escape') onClose?.(); }, [onClose]);
  useEffect(() => {
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [handleEsc]);

  function handleStageClick(event) {
    setIsManual(true);
    setSelectedEvent(event);
  }

  const done = stages.filter(s => s.state === 'completed').length;
  const total = stages.length;
  const progress = done / total;

  const activeStage = stages.find(s => s.state === 'active');
  const activeAgentId = activeStage?.agentId ?? null;
  const thinkingText = activeAgentId ? (thinking[activeAgentId] || null) : null;

  const statusLabel = hasError ? 'Error' : isComplete ? 'Complete' : isActive ? 'Analysing' : 'Starting';
  const statusColor = hasError ? '#ef4444' : isComplete ? '#10b981' : isActive ? '#FFCC00' : 'var(--text-3)';

  if (minimized) {
    return createPortal(
      <MinimizedChip
        stages={stages} isActive={isActive} isComplete={isComplete}
        hasError={hasError} onExpand={() => setMinimized(false)}
      />,
      document.body,
    );
  }

  return createPortal(
    <div
      aria-modal="true"
      role="dialog"
      aria-label="AI Pipeline Analysis"
      style={{
        position:'fixed', inset:0, zIndex:120,
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'20px 16px',
        background:'color-mix(in srgb, var(--nexus-bg) 82%, transparent)',
        backdropFilter:'blur(8px)',
        WebkitBackdropFilter:'blur(8px)',
        animation:'modal-overlay-in 220ms ease forwards',
      }}
    >
      <div style={{
        width:'100%', maxWidth:920,
        height:'min(88vh, 680px)',
        display:'flex', flexDirection:'column',
        borderRadius:16,
        overflow:'hidden',
        background:'var(--nexus-panel-bg)',
        backdropFilter:'blur(40px) saturate(150%)',
        WebkitBackdropFilter:'blur(40px) saturate(150%)',
        border:'1px solid var(--nexus-border)',
        boxShadow:[
          '0 40px 100px rgba(0,0,0,0.4)',
          '0 8px 32px rgba(0,0,0,0.3)',
        ].join(', '),
        animation:'modal-panel-in 280ms cubic-bezier(.16,1,.3,1) forwards',
      }}>

        {/* ── Header ── */}
        <div style={{
          display:'flex', alignItems:'center', gap:12,
          padding:'14px 20px',
          borderBottom:'1px solid var(--nexus-border)',
          flexShrink:0, position:'relative',
        }}>
          {/* Cyan accent bar */}
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3,
            background:'#FFCC00', borderRadius:'16px 0 0 0' }}/>

          <div style={{ display:'flex', alignItems:'center', gap:8, paddingLeft:4 }}>
            <div style={{ width:32, height:32, borderRadius:8,
              display:'flex', alignItems:'center', justifyContent:'center',
              background:'rgba(34,211,238,0.12)', border:'1px solid rgba(34,211,238,0.2)' }}>
              <Activity size={16} style={{ color:'#FFCC00' }}/>
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:'var(--text-1)', margin:0, letterSpacing:'-0.01em' }}>
                NEXUS AI Pipeline
              </p>
              {completionMeta?.reference && (
                <p style={{ fontSize:11, color:'var(--text-3)', margin:'1px 0 0', fontFamily:'monospace' }}>
                  {completionMeta.reference}
                </p>
              )}
            </div>
          </div>

          {/* Progress bar + status */}
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:12, marginLeft:8 }}>
            <div style={{ flex:1, height:3, borderRadius:2, background:'var(--nexus-surface-2)' }}>
              <div style={{ width:`${Math.round(progress*100)}%`, height:'100%', borderRadius:2,
                background:'#FFCC00', transition:'width 600ms cubic-bezier(.4,0,.2,1)' }}/>
            </div>
            <span style={{ fontSize:10, color:'var(--text-3)', fontFamily:'monospace', flexShrink:0 }}>
              {done}/{total}
            </span>
          </div>

          {/* Status */}
          <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:statusColor,
              animation: isActive ? 'blink 1s step-end infinite' : 'none' }}/>
            <span style={{ fontSize:11, color:'var(--text-2)' }}>{statusLabel}</span>
            {complete?.duration_ms != null && (
              <span style={{ fontSize:10, color:'var(--text-3)', fontFamily:'monospace' }}>
                {(complete.duration_ms/1000).toFixed(1)}s
              </span>
            )}
          </div>

          {/* Controls */}
          <div style={{ display:'flex', gap:6 }}>
            {[
              { Icon:Minus, onClick:()=>setMinimized(true), label:'Minimize' },
              { Icon:X, onClick:onClose, label:'Close' },
            ].map(({ Icon, onClick, label }) => (
              <button key={label} type="button" aria-label={label} onClick={onClick}
                style={{ width:28, height:28, borderRadius:7, flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background:'var(--nexus-surface-2)', border:'1px solid var(--nexus-border)',
                  color:'var(--text-3)', cursor:'pointer' }}
                onMouseEnter={e=>{ e.currentTarget.style.background='var(--nexus-surface-3)'; e.currentTarget.style.color='var(--text-1)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.background='var(--nexus-surface-2)'; e.currentTarget.style.color='var(--text-3)'; }}>
                <Icon size={13}/>
              </button>
            ))}
          </div>
        </div>

        {/* ── Body: left pipeline | right reasoning ── */}
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

          {/* Left: pipeline */}
          <div ref={bodyRef} style={{
            width:300, flexShrink:0,
            borderRight:'1px solid var(--nexus-border)',
            overflowY:'auto', padding:'16px 16px 16px 18px',
            display:'flex', flexDirection:'column', gap:0,
            scrollbarWidth:'thin', scrollbarColor:'var(--nexus-border) transparent',
          }}>
            {stages.map((stage, idx) => (
              <div key={stage.key}>
                <StageRow
                  stage={stage}
                  selected={selectedEvent === stage.event && !!stage.event}
                  onClick={handleStageClick}
                  isLast={false}
                />
                {/* HITL gate between resolution and complete */}
                {stage.key === 'resolution' && stage.state === 'completed' && (
                  <div style={{ marginLeft:38, marginBottom:10 }}>
                    <div
                      onClick={() => hitl && handleStageClick(hitl)}
                      style={{
                        padding:'9px 12px', borderRadius:7,
                        background: hitl
                          ? hitl.holdForReview ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)'
                          : 'rgba(255,204,0,0.05)',
                        border: `1px solid ${hitl ? hitl.holdForReview ? 'rgba(245,158,11,0.22)' : 'rgba(16,185,129,0.22)' : 'rgba(255,204,0,0.15)'}`,
                        cursor: hitl ? 'pointer' : 'default',
                        position:'relative', overflow:'hidden',
                      }}>
                      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:2,
                        background: hitl ? hitl.holdForReview ? '#f59e0b' : '#10b981' : '#FFCC00',
                        animation: !hitl ? 'hitl-pulse 1.8s ease-in-out infinite' : 'none' }}/>
                      <div style={{ paddingLeft:8, display:'flex', alignItems:'center', gap:6 }}>
                        {!hitl
                          ? <Loader2 size={12} style={{ color:'#FFCC00', animation:'spin 1s linear infinite' }}/>
                          : hitl.holdForReview
                          ? <AlertTriangle size={12} style={{ color:'#f59e0b' }}/>
                          : <UserCheck size={12} style={{ color:'#10b981' }}/>
                        }
                        <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.09em',
                          color: hitl ? hitl.holdForReview ? '#f59e0b' : '#10b981' : '#FFCC00' }}>
                          HITL Gate
                        </span>
                        {hitl && (
                          <span style={{ fontSize:10, color:'var(--text-2)', marginLeft:2 }}>
                            {hitl.holdForReview ? 'Review required' : 'Auto-assigned'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Complete node */}
            {isComplete && complete && (
              <div style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer' }}
                onClick={() => handleStageClick(complete)}>
                <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background: complete.holdForReview ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                  border: `2px solid ${complete.holdForReview ? '#f59e0b80' : '#10b98180'}`,
                  color: complete.holdForReview ? '#f59e0b' : '#10b981',
                  boxShadow: `0 0 10px ${complete.holdForReview ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}` }}>
                  <Shield size={13}/>
                </div>
                <div style={{ paddingTop:4 }}>
                  <p style={{ fontSize:12, fontWeight:600, color:'var(--text-1)', margin:0 }}>Complete</p>
                  <p style={{ fontSize:10, color:'var(--text-3)', margin:'1px 0 0' }}>
                    {pct(complete.overallConfidence)} overall
                  </p>
                </div>
              </div>
            )}

            {/* Uncertainty transparency panel */}
            {isComplete && uncertainty && (
              <div style={{
                marginTop: 14, paddingTop: 12,
                borderTop: '1px solid var(--nexus-border)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: 10,
                }}>
                  <AlertTriangle size={11} style={{
                    color: uncertainty.level === 'high' ? '#ef4444'
                      : uncertainty.level === 'medium' ? '#f59e0b' : '#10b981',
                  }} />
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>
                    Trust Risk
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                    marginLeft: 'auto',
                    color: uncertainty.level === 'high' ? '#ef4444'
                      : uncertainty.level === 'medium' ? '#f59e0b' : '#10b981',
                  }}>
                    {(uncertainty.score * 100).toFixed(0)}%
                    <span style={{
                      fontSize: 9, fontWeight: 600, marginLeft: 4,
                      textTransform: 'uppercase',
                    }}>
                      {uncertainty.level}
                    </span>
                  </span>
                </div>

                {/* Uncertainty gauge bar */}
                <div style={{
                  height: 4, borderRadius: 2, background: 'var(--nexus-surface-2)',
                  marginBottom: 10, overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(100, (uncertainty.score || 0) * 100)}%`,
                    height: '100%', borderRadius: 2,
                    background: uncertainty.level === 'high' ? '#ef4444'
                      : uncertainty.level === 'medium' ? '#f59e0b' : '#10b981',
                    transition: 'width 600ms ease-out',
                  }} />
                </div>

                {/* Signal breakdown */}
                {uncertainty.signals && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '4px 12px', marginBottom: 8,
                  }}>
                    {[
                      ['ML Conf', pct(uncertainty.signals.mlConfidence)],
                      ['AI Conf', pct(uncertainty.signals.classifierConfidence)],
                      ['Agreement', uncertainty.signals.mlAgreement ? 'Yes' : 'No'],
                      ['Dedup Conf', pct(uncertainty.signals.dedupConfidence)],
                      ['Top Match', pct(uncertainty.signals.topSimilarity)],
                      ['CRAG Used', uncertainty.signals.cragUsed ? 'Yes' : 'No'],
                    ].map(([label, val]) => (
                      <div key={label} style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: 10, lineHeight: 1.6,
                      }}>
                        <span style={{ color: 'var(--text-3)' }}>{label}</span>
                        <span style={{
                          color: 'var(--text-2)', fontFamily: 'monospace',
                          fontWeight: 600,
                        }}>
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reason chips */}
                {uncertainty.reasons?.length > 0 && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 4,
                  }}>
                    {uncertainty.reasons.map((r) => (
                      <span key={r} style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 7px',
                        borderRadius: 10,
                        background: 'rgba(239,68,68,0.08)',
                        color: '#f87171',
                        border: '1px solid rgba(239,68,68,0.15)',
                      }}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Confidence chart at bottom of left panel */}
            {isComplete && snapshots.length >= 2 && (
              <div style={{ marginTop:16, paddingTop:12, borderTop:'1px solid var(--nexus-border)' }}>
                <ConfChart snapshots={snapshots}/>
              </div>
            )}

            {/* Autonomous cascade timeline */}
            {isComplete && autonomousActions.length > 0 && (
              <div style={{
                marginTop: 14, paddingTop: 12,
                borderTop: '1px solid var(--nexus-border)',
              }}>
                <p style={{
                  fontSize: 9, fontWeight: 700, color: 'var(--text-3)',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  margin: '0 0 10px',
                }}>
                  Autonomous Actions
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {autonomousActions.map((a, i) => {
                    const iconMap = {
                      auto_escalate: ArrowUpCircle,
                      auto_acknowledge: Bell,
                      service_recovery: HeartPulse,
                      sla_monitor: Clock,
                      rate_limited: AlertTriangle,
                      kill_switch: Shield,
                    };
                    const colorMap = {
                      auto_escalate: '#ef4444',
                      auto_acknowledge: '#3b82f6',
                      service_recovery: '#10b981',
                      sla_monitor: '#f59e0b',
                      rate_limited: '#f97316',
                      kill_switch: '#6b7280',
                    };
                    const Icon = iconMap[a.action] || Activity;
                    const color = colorMap[a.action] || '#6b7280';
                    const isLast = i === autonomousActions.length - 1;
                    return (
                      <div key={a.action} style={{
                        display: 'flex', gap: 10, alignItems: 'stretch',
                        minHeight: 36,
                      }}>
                        {/* Vertical connector line + dot */}
                        <div style={{
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', width: 20, flexShrink: 0,
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexShrink: 0,
                            background: `${color}18`, border: `1.5px solid ${color}55`,
                          }}>
                            <Icon size={10} style={{ color }} />
                          </div>
                          {!isLast && (
                            <div style={{
                              flex: 1, width: 1.5, minHeight: 12,
                              background: `linear-gradient(${color}40, ${colorMap[autonomousActions[i + 1]?.action] || '#6b7280'}40)`,
                            }} />
                          )}
                        </div>
                        {/* Label + detail */}
                        <div style={{ paddingTop: 1, paddingBottom: isLast ? 0 : 8 }}>
                          <p style={{
                            fontSize: 11, fontWeight: 600, color: 'var(--text-1)',
                            margin: 0, lineHeight: 1.3,
                          }}>
                            {a.label}
                          </p>
                          <p style={{
                            fontSize: 10, color: 'var(--text-3)',
                            margin: '1px 0 0', lineHeight: 1.3,
                          }}>
                            {a.detail}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Auto/manual indicator */}
            {isManual && (
              <button type="button"
                onClick={() => setIsManual(false)}
                style={{ marginTop:12, fontSize:10, color:'var(--text-3)', background:'var(--nexus-surface-2)',
                  border:'1px solid var(--nexus-border)', borderRadius:4, padding:'4px 8px', cursor:'pointer',
                  alignSelf:'flex-start' }}>
                ↺ Resume auto-follow
              </button>
            )}
          </div>

          {/* Right: reasoning */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden',
            borderLeft:'1px solid var(--nexus-border)' }}>
            <RightPanel
              event={selectedEvent}
              isManual={isManual}
              activeAgentId={!isManual ? activeAgentId : null}
              thinkingText={!isManual ? thinkingText : null}
            />
          </div>
        </div>

        {/* ── Footer (completion actions) ── */}
        {isComplete && completionMeta && (
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'12px 20px',
            borderTop:'1px solid var(--nexus-border)',
            background:'var(--nexus-surface-1)',
            flexShrink:0, gap:12,
          }}>
            <div>
              <p style={{ fontSize:12, fontWeight:600, color: complete?.holdForReview ? '#f59e0b' : '#10b981', margin:0 }}>
                {completionMeta.reference} — {(completionMeta.type||'unclassified').replace(/_/g,' ')}
              </p>
              <p style={{ fontSize:10, color:'var(--text-3)', margin:'2px 0 0' }}>
                {completionMeta.severity||'Unknown'} · {completionMeta.department||'Unassigned'}
                {ackEvent?.toEmail && ` · Ack → ${ackEvent.toEmail}`}
              </p>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {complete?.holdForReview && (
                <Button variant="outline" size="sm" onClick={onViewQueue}>Review Queue</Button>
              )}
              <Button variant="outline" size="sm" onClick={onViewIncident}>View Incident</Button>
            </div>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>,
    document.body,
  );
}
