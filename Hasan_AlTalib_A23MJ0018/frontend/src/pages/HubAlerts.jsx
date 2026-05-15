import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bell, CheckCircle2, ChevronRight,
  FileText, Mail, MapPin, RefreshCw, Users, X, Zap,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useView } from '../context/ViewContext';
import { acknowledgeAlert, getProactiveSends } from '../lib/api';

// ── Design tokens ─────────────────────────────────────────────────────────────
const RED    = '#D40511';
const MONO   = '"JetBrains Mono","Fira Code",monospace';
const BORDER = 'var(--nexus-border)';
const S1     = 'var(--nexus-surface-1)';
const S2     = 'var(--nexus-surface-2)';

// ── Doc type config ───────────────────────────────────────────────────────────
const DOC_CFG = {
  hubNotice:     { label: 'Hub Notice',     color: RED,       icon: FileText, desc: 'Internal ops notice' },
  customerEmail: { label: 'Customer Email', color: '#0EA5E9', icon: Mail,     desc: 'Sent to customers' },
  faqUpdate:     { label: 'FAQ Update',     color: '#10B981', icon: FileText, desc: 'Help centre update' },
  pccPlaybook:   { label: 'PCC Playbook',   color: '#FF8C00', icon: Users,    desc: 'PCC team guide' },
};

const TYPE_LABEL = {
  late_delivery: 'Late Delivery', damaged_parcel: 'Damaged Parcel',
  missing_parcel: 'Missing Parcel', address_error: 'Address Error',
  system_error: 'System Error', wrong_item: 'Wrong Item', other: 'Other',
};

function timeAgo(date) {
  if (!date) return '—';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)     return `${s}s ago`;
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// ── Full-Document Modal ───────────────────────────────────────────────────────
function DocumentModal({ doc, onClose }) {
  const overlayRef = useRef(null);
  const cfg = DOC_CFG[doc.key] || { label: doc.key, color: '#FF8C00', icon: FileText, desc: '' };
  const Icon = cfg.icon;

  // Close on Escape or backdrop click
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleBackdrop(e) {
    if (e.target === overlayRef.current) onClose();
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'var(--nexus-modal-backdrop)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 740, maxHeight: '85vh',
        borderRadius: 14, overflow: 'hidden',
        background: 'var(--nexus-panel-solid)',
        border: `1px solid ${cfg.color}30`,
        boxShadow: `0 0 0 1px ${cfg.color}15, 0 32px 80px rgba(0,0,0,0.6)`,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Modal header */}
        <div style={{
          padding: '16px 20px',
          background: `${cfg.color}0C`,
          borderBottom: `1px solid ${cfg.color}20`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: `${cfg.color}18`, border: `1px solid ${cfg.color}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={16} color={cfg.color} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--nexus-text-1)' }}>{cfg.label}</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--nexus-text-3)', marginTop: 1 }}>{cfg.desc}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--nexus-text-3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--nexus-surface-3)'; e.currentTarget.style.color = 'var(--nexus-text-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--nexus-surface-2)'; e.currentTarget.style.color = 'var(--nexus-text-3)'; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {doc.content ? (
            <pre style={{
              fontFamily: MONO,
              fontSize: 13,
              lineHeight: 1.75,
              color: 'var(--nexus-text-1)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}>
              {doc.content}
            </pre>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--nexus-text-3)', fontStyle: 'italic', margin: 0 }}>
              No content available for this document.
            </p>
          )}
        </div>

        {/* Modal footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: `1px solid ${BORDER}`,
          background: S2,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`,
              color: 'var(--nexus-text-2)', cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Alert Card ────────────────────────────────────────────────────────────────
function AlertCard({ alert, onAcknowledge, acknowledged }) {
  const [expanded,    setExpanded]    = useState(false);
  const [activeDoc,   setActiveDoc]   = useState(null); // { key, content }
  const typeLabel = TYPE_LABEL[alert.incidentType] || alert.incidentType || 'Unknown';
  const docs      = alert.sentDocuments || [];
  const isNew     = !acknowledged && alert.status === 'sent';

  function openDoc(docKey) {
    setActiveDoc({ key: docKey, content: alert.documents?.[docKey] || null });
  }

  return (
    <>
      {activeDoc && (
        <DocumentModal doc={activeDoc} onClose={() => setActiveDoc(null)} />
      )}

      <div style={{
        background: S1, borderRadius: 12,
        border: `1px solid ${isNew ? 'rgba(212,5,17,0.3)' : BORDER}`,
        overflow: 'hidden',
        boxShadow: isNew ? `0 0 0 1px ${RED}15, 0 4px 28px rgba(0,0,0,0.35)` : '0 2px 12px rgba(0,0,0,0.2)',
      }}>
        {/* ── Header ── */}
        <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: isNew ? `${RED}18` : 'var(--nexus-surface-2)',
            border: `1px solid ${isNew ? `${RED}35` : BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={17} color={isNew ? RED : 'var(--nexus-text-3)'} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--nexus-text-1)' }}>{typeLabel} Cluster</span>
              {isNew && (
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${RED}18`, color: RED, border: `1px solid ${RED}30` }}>
                  NEW
                </span>
              )}
              {acknowledged && (
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.28)' }}>
                  ✓ ACKNOWLEDGED
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--nexus-text-3)', flexShrink: 0 }}>{timeAgo(alert.sentAt)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--nexus-text-2)' }}>
                <MapPin size={11} /> {alert.location}
              </span>
              {alert.estimatedComplaintsPrevented > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#10B981', fontWeight: 600 }}>
                  <Zap size={11} /> ~{alert.estimatedComplaintsPrevented} complaints prevented
                </span>
              )}
              {alert.customerEmailsContacted?.length > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#0EA5E9' }}>
                  <Mail size={11} /> {alert.customerEmailsContacted.length} customers notified
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Doc chips — click to open modal ── */}
        {docs.length > 0 && (
          <div style={{ padding: '0 18px 14px', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {docs.map(docKey => {
              const cfg = DOC_CFG[docKey] || { label: docKey, color: '#FF8C00', icon: FileText };
              const Icon = cfg.icon;
              return (
                <button
                  key={docKey}
                  type="button"
                  onClick={() => openDoc(docKey)}
                  title="Click to read full document"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                    background: `${cfg.color}14`, border: `1px solid ${cfg.color}30`, color: cfg.color,
                    cursor: 'pointer', transition: 'all 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${cfg.color}28`; e.currentTarget.style.borderColor = `${cfg.color}55`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${cfg.color}14`; e.currentTarget.style.borderColor = `${cfg.color}30`; }}
                >
                  <Icon size={10} /> {cfg.label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Expanded document previews ── */}
        {expanded && (
          <div style={{ borderTop: `1px solid ${BORDER}`, background: 'var(--nexus-surface-2)' }}>
            <p style={{ padding: '14px 18px 0', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--nexus-text-3)', margin: 0 }}>
              Documents Sent
            </p>
            <div style={{ padding: '10px 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {docs.map(docKey => {
                const cfg = DOC_CFG[docKey] || { label: docKey, color: '#FF8C00', icon: FileText, desc: '' };
                const Icon = cfg.icon;
                const content = alert.documents?.[docKey];
                const preview = content ? content.substring(0, 400) : null;
                const hasMore = content && content.length > 400;
                return (
                  <div key={docKey} style={{ borderRadius: 9, border: `1px solid ${cfg.color}22`, overflow: 'hidden' }}>
                    {/* Doc header row */}
                    <div style={{
                      padding: '10px 14px',
                      background: `${cfg.color}0A`,
                      display: 'flex', alignItems: 'center', gap: 8,
                      borderBottom: content ? `1px solid ${cfg.color}15` : 'none',
                    }}>
                      <Icon size={13} color={cfg.color} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--nexus-text-3)' }}>· {cfg.desc}</span>
                      <button
                        type="button"
                        onClick={() => openDoc(docKey)}
                        style={{
                          marginLeft: 'auto', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`, color: cfg.color,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${cfg.color}30`; }}
                        onMouseLeave={e => { e.currentTarget.style.background = `${cfg.color}18`; }}
                      >
                        Read full
                      </button>
                    </div>
                    {/* Preview text */}
                    {preview && (
                      <div style={{ padding: '12px 14px', background: 'var(--nexus-surface-1)' }}>
                        <p style={{
                          fontFamily: MONO, fontSize: 12, color: 'var(--nexus-text-2)',
                          lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0,
                        }}>
                          {preview}{hasMore && <span style={{ color: 'var(--nexus-text-3)' }}>…</span>}
                        </p>
                        {hasMore && (
                          <button
                            type="button"
                            onClick={() => openDoc(docKey)}
                            style={{
                              marginTop: 10, padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                              background: `${cfg.color}14`, border: `1px solid ${cfg.color}28`, color: cfg.color,
                              cursor: 'pointer',
                            }}
                          >
                            Read full document →
                          </button>
                        )}
                      </div>
                    )}
                    {!content && (
                      <div style={{ padding: '10px 14px' }}>
                        <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--nexus-text-3)', margin: 0, fontStyle: 'italic' }}>No content stored</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer actions ── */}
        <div style={{
          padding: '11px 18px', borderTop: `1px solid ${BORDER}`, background: S2,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500,
              color: 'var(--nexus-text-3)', background: 'none', border: 'none', cursor: 'pointer',
              padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--nexus-text-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--nexus-text-3)'; }}
          >
            {expanded ? 'Hide details' : 'View documents'}
            <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
          </button>

          {!acknowledged && alert.status === 'sent' && (
            <button
              type="button"
              onClick={() => onAcknowledge(alert._id)}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                color: '#10B981', cursor: 'pointer', transition: 'all 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.12)'; }}
            >
              <CheckCircle2 size={13} /> Acknowledge
            </button>
          )}
          {acknowledged && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#10B981', display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle2 size={13} /> Acknowledged
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HubAlerts() {
  const navigate = useNavigate();
  const { selectedHub } = useView();

  const [allAlerts,    setAllAlerts]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [acknowledged, setAcknowledged] = useState(new Set());
  const [filter,       setFilter]       = useState('all');

  async function load() {
    setLoading(true);
    try {
      const data = await getProactiveSends();
      const arr  = Array.isArray(data) ? data : (data?.sends || []);
      const hubLower = (selectedHub || '').toLowerCase();
      const hubKey = hubLower.replace(/\s*hub$/, '').replace(/\s*cargo$/, '').replace(/\s*depot$/, '').replace(/\s*distribution$/, '').trim();
      const filtered = arr.filter(a => {
        if (a.status !== 'sent') return false;
        const loc = (a.location || '').toLowerCase();
        if (!loc) return false;
        return loc === hubLower || loc.includes(hubKey) || hubLower.includes(loc);
      });
      setAllAlerts(filtered);
      const alreadyAcked = new Set(
        filtered.filter(a => a.acknowledgedAt).map(a => a._id)
      );
      setAcknowledged(alreadyAcked);
    } catch { setAllAlerts([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [selectedHub]);

  async function handleAcknowledge(id) {
    setAcknowledged(prev => new Set([...prev, id]));
    try {
      await acknowledgeAlert(id);
    } catch {
      setAcknowledged(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  const filtered = allAlerts.filter(a => {
    if (filter === 'new')          return !acknowledged.has(a._id);
    if (filter === 'acknowledged') return acknowledged.has(a._id);
    return true;
  });

  const newCount = allAlerts.filter(a => !acknowledged.has(a._id)).length;

  return (
    <Layout title="Hub Alerts">
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${RED}14`, border: `1px solid ${RED}28`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={16} color={RED} />
              </div>
              <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--nexus-text-1)', letterSpacing: '-0.02em', margin: 0 }}>Hub Alerts</h1>
              {newCount > 0 && (
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: `${RED}18`, color: RED, border: `1px solid ${RED}30` }}>
                  {newCount} new
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--nexus-text-3)', margin: 0, paddingLeft: 44 }}>
              Proactive notifications from NEXUS for <strong style={{ color: 'var(--nexus-text-1)' }}>{selectedHub}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, color: 'var(--nexus-text-2)', cursor: 'pointer' }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* ── Info banner ── */}
        <div style={{ padding: '13px 16px', borderRadius: 10, background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Zap size={14} color="#FF8C00" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: 'var(--nexus-text-2)', margin: 0, lineHeight: 1.65 }}>
            NEXUS automatically detects incident clusters and dispatches proactive alerts - hub notices, customer emails, FAQ updates, and PCC playbooks - before complaints escalate. Click any document chip to read the full content. These are alerts for <strong style={{ color: 'var(--nexus-text-1)' }}>{selectedHub}</strong>.
          </p>
        </div>

        {/* ── Filter tabs ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[
            { key: 'all',          label: `All (${allAlerts.length})` },
            { key: 'new',          label: `Unacknowledged (${newCount})` },
            { key: 'acknowledged', label: `Acknowledged (${allAlerts.length - newCount})` },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 15px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms',
                background: filter === f.key ? `${RED}16` : 'var(--nexus-surface-2)',
                border: `1px solid ${filter === f.key ? `${RED}35` : BORDER}`,
                color: filter === f.key ? RED : 'var(--nexus-text-3)',
              }}
            >
              {f.label}
            </button>
          ))}
          {newCount > 0 && filter !== 'acknowledged' && (
            <button
              type="button"
              onClick={() => allAlerts.forEach(a => setAcknowledged(prev => new Set([...prev, a._id])))}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 15px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#10B981' }}
            >
              <CheckCircle2 size={12} /> Acknowledge all
            </button>
          )}
        </div>

        {/* ── Alert list ── */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '70px 0', color: 'var(--nexus-text-3)' }}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 13 }}>Loading alerts for {selectedHub}…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '60px 24px', background: S1, borderRadius: 13, border: `1px solid ${BORDER}`, textAlign: 'center' }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--nexus-surface-2)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={22} color="var(--nexus-text-3)" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--nexus-text-2)', margin: '0 0 5px' }}>
                {filter === 'acknowledged' ? 'No acknowledged alerts yet' : `No alerts for ${selectedHub}`}
              </p>
              <p style={{ fontSize: 13, color: 'var(--nexus-text-3)', margin: 0 }}>
                {filter === 'acknowledged'
                  ? 'Alerts you acknowledge will appear here'
                  : 'NEXUS will notify you when incident clusters are detected at your hub'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/hub')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: `${RED}12`, border: `1px solid ${RED}28`, color: RED, cursor: 'pointer' }}
            >
              Back to Hub Dashboard
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filtered.map(alert => (
              <AlertCard
                key={alert._id}
                alert={alert}
                onAcknowledge={handleAcknowledge}
                acknowledged={acknowledged.has(alert._id)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
