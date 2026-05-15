import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Archive, BarChart3, Bell, ChevronUp, ClipboardCheck, Layers,
  Inbox, LayoutDashboard, LogOut, MapPin, MessageSquare,
  Radio, Shield,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useView, HUBS } from '../context/ViewContext';
import { getPendingCount } from '../lib/api';
import StatusBadge from './StatusBadge';

const DEMO_USERS = [
  { email: 'admin@nexus.com',    password: 'nexus123', name: 'Admin User',     role: 'ADMIN' },
  { email: 'reviewer@nexus.com', password: 'nexus123', name: 'Sara Reviewer',  role: 'REVIEWER' },
  { email: 'reporter@nexus.com', password: 'nexus123', name: 'Ahmad Reporter', role: 'REPORTER' },
];

const ADMIN_NAV = [
  { label: 'Intake Hub',          icon: Layers,          path: '/intake',              roles: null },
  { label: 'Incident Board',      icon: LayoutDashboard, path: '/board',               roles: null, showPending: true },
  { label: 'PCC Inbox',           icon: Inbox,           path: '/inbox',               roles: null },
  { label: 'Review Queue',        icon: ClipboardCheck,  path: '/review',              roles: ['admin', 'reviewer'] },
  { label: 'Resolution Archive',  icon: Archive,         path: '/resolution-archive',  roles: ['admin', 'reviewer'] },
  { label: 'Audit & Trace',       icon: Shield,          path: '/audit',               roles: ['admin', 'reviewer'] },
  { label: 'Admin Dashboard',     icon: BarChart3,       path: '/admin',               roles: ['admin', 'reviewer'] },
  { label: 'Live Ops Center',     icon: Radio,           path: '/live',                roles: ['admin', 'reviewer'], live: true },
];

const HUB_NAV = [
  { label: 'Hub Dashboard',   icon: MapPin,          path: '/hub' },
  { label: 'Incident Board',  icon: LayoutDashboard, path: '/board', showPending: true },
  { label: 'Hub Alerts',      icon: Bell,            path: '/hub/alerts', alertBadge: true },
  { label: 'Ops Chat',        icon: MessageSquare,   path: '/ops-chat' },
];

const RED    = '#D40511';
const BORDER = 'var(--nexus-border)';

export default function Sidebar() {
  const { user, login, logout }                    = useAuth();
  const { viewMode, selectedHub, setSelectedHub,
          switchToHub, switchToAdmin }             = useView();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching]       = useState(null);
  const switcherRef = useRef(null);

  useEffect(() => {
    if (!user || (user.role !== 'reviewer' && user.role !== 'admin')) return;
    const fetch = async () => setPendingCount(await getPendingCount());
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, [user]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const handleSwitchUser = async (demoUser) => {
    if (demoUser.email === user?.email) { setSwitcherOpen(false); return; }
    setSwitching(demoUser.email);
    try {
      await login(demoUser.email, demoUser.password);
      switchToAdmin();
      setSwitcherOpen(false);
      navigate('/intake');
    } catch { /* ignore */ } finally {
      setSwitching(null);
    }
  };

  useEffect(() => {
    if (!switcherOpen) return;
    const handler = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [switcherOpen]);

  const isHubManager   = viewMode === 'hub_manager';
  const canSwitchView  = user?.role === 'admin' || user?.role === 'reviewer';
  const navItems       = isHubManager ? HUB_NAV : ADMIN_NAV;

  return (
    <aside
      data-tour="sidebar"
      style={{
        width: 232, flexShrink: 0, height: '100vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--nexus-sidebar-bg)',
        borderRight: `1px solid ${BORDER}`,
        position: 'relative',
      }}
    >
      {/* DHL accent strip */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, width: 3, height: '100%',
        background: `linear-gradient(to bottom, ${RED} 0%, rgba(212,5,17,0.15) 60%, transparent 100%)`,
      }} />

      {/* Logo block */}
      <div style={{ padding: '24px 20px 20px 24px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 28, height: 20, background: RED, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#fff', flexShrink: 0 }}>
            DHL
          </div>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--nexus-logo-text)' }}>NEXUS</span>
        </div>
        <p style={{ margin: 0, fontSize: 10, color: 'var(--nexus-text-3)', letterSpacing: '0.04em', paddingLeft: 38 }}>
          Incident Intelligence
        </p>
      </div>

      {/* Role Switcher (admin/reviewer only) */}
      {canSwitchView && (
        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--nexus-text-3)', marginBottom: 7, paddingLeft: 2 }}>
            View as
          </p>
          <div style={{ display: 'flex', gap: 4, marginBottom: isHubManager ? 8 : 0 }}>
            <button
              type="button"
              onClick={switchToAdmin}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700,
                cursor: 'pointer', transition: 'all 150ms', border: '1px solid transparent',
                background: !isHubManager ? `${RED}18` : 'var(--nexus-border)',
                color: !isHubManager ? RED : 'var(--nexus-text-3)',
                borderColor: !isHubManager ? `${RED}30` : 'transparent',
              }}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => switchToHub(selectedHub)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700,
                cursor: 'pointer', transition: 'all 150ms', border: '1px solid transparent',
                background: isHubManager ? 'rgba(14,165,233,0.15)' : 'var(--nexus-border)',
                color: isHubManager ? '#0EA5E9' : 'var(--nexus-text-3)',
                borderColor: isHubManager ? 'rgba(14,165,233,0.28)' : 'transparent',
              }}
            >
              Hub Mgr
            </button>
          </div>

          {isHubManager && (
            <select
              value={selectedHub}
              onChange={e => { setSelectedHub(e.target.value); if (location.pathname === '/hub' || location.pathname === '/hub/alerts') navigate('/hub'); }}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: 'var(--nexus-surface-1)', border: '1px solid rgba(14,165,233,0.25)',
                color: '#0EA5E9', cursor: 'pointer', outline: 'none',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%230EA5E9' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
                paddingRight: 24,
              }}
            >
              {HUBS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {isHubManager && (
          <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(14,165,233,0.5)', marginBottom: 8, paddingLeft: 6 }}>
            Hub Manager · {selectedHub.split(' ')[0]}
          </p>
        )}

        {navItems.map((item) => {
          if (!isHubManager && item.roles && !item.roles.includes(user?.role)) return null;

          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          const accentColor = isHubManager ? '#0EA5E9' : RED;

          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', marginBottom: 2, borderRadius: 7,
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--nexus-text-1)' : 'var(--nexus-text-2)',
                background: isActive ? `${accentColor}12` : 'transparent',
                border: isActive ? `1px solid ${accentColor}20` : '1px solid transparent',
                textDecoration: 'none', transition: 'all 150ms ease',
              }}
              onMouseEnter={e => {
                if (!isActive) { e.currentTarget.style.background = 'var(--nexus-border)'; e.currentTarget.style.color = 'var(--nexus-text-1)'; }
              }}
              onMouseLeave={e => {
                if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--nexus-text-2)'; }
              }}
            >
              <item.icon size={15} style={{ color: isActive ? accentColor : 'inherit', flexShrink: 0 }} />
              <span style={{ flex: 1, lineHeight: 1 }}>{item.label}</span>

              {item.showPending && pendingCount > 0 && (
                <span style={{ background: RED, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                  {pendingCount}
                </span>
              )}
              {item.live && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px rgba(16,185,129,0.7)', animation: 'pulse 1.8s ease-in-out infinite' }} />
              )}
              {item.alertBadge && pendingCount > 0 && isHubManager && (
                <span style={{ background: '#0EA5E9', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>
                  !
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer with inline user switcher */}
      <div ref={switcherRef} style={{ borderTop: `1px solid ${BORDER}` }}>

        {/* Inline switcher panel — shown above the user row */}
        {switcherOpen && (
          <div style={{ borderBottom: `1px solid ${BORDER}`, background: 'var(--nexus-surface-1)' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--nexus-text-3)', margin: '8px 14px 4px' }}>
              Switch demo user
            </p>
            {DEMO_USERS.map(du => {
              const isActive = du.email === user?.email;
              const isLoading = switching === du.email;
              return (
                <button
                  key={du.email}
                  type="button"
                  onClick={() => handleSwitchUser(du)}
                  disabled={!!switching}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 14px',
                    background: isActive ? 'rgba(212,5,17,0.08)' : 'transparent',
                    borderLeft: `3px solid ${isActive ? RED : 'transparent'}`,
                    borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                    cursor: isActive ? 'default' : 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--nexus-border)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: isActive ? RED : 'var(--nexus-border-bright)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, color: isActive ? '#fff' : 'var(--nexus-text-3)',
                  }}>
                    {isLoading ? '…' : du.name[0]}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: isActive ? 'var(--nexus-text-1)' : 'var(--nexus-text-2)', lineHeight: 1.3 }}>{du.name}</p>
                    <p style={{ margin: 0, fontSize: 10, color: isActive ? RED : 'var(--nexus-text-3)' }}>{du.role}</p>
                  </div>
                  {isActive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />}
                </button>
              );
            })}
            <div style={{ padding: '6px 10px 8px' }}>
              <button
                type="button"
                onClick={handleLogout}
                style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 11, color: 'var(--nexus-text-3)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--nexus-text-3)')}
              >
                <LogOut size={12} /> Sign out completely
              </button>
            </div>
          </div>
        )}

        {/* Clickable user row — always visible */}
        <button
          type="button"
          onClick={() => setSwitcherOpen(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '12px 14px 16px',
            background: 'none', border: 'none', cursor: 'pointer',
            transition: 'background 120ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--nexus-border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: RED, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff',
          }}>
            {(isHubManager ? selectedHub[0] : user?.name?.[0]) || 'U'}
          </div>
          <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
            <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 600, color: 'var(--nexus-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>
              {isHubManager ? selectedHub : user?.name}
            </p>
            <StatusBadge status={isHubManager ? 'HUB MANAGER' : user?.role?.toUpperCase()} />
          </div>
          <ChevronUp
            size={13}
            style={{
              color: 'var(--nexus-text-3)', flexShrink: 0,
              transform: switcherOpen ? 'none' : 'rotate(180deg)',
              transition: 'transform 200ms',
            }}
          />
        </button>
      </div>
    </aside>
  );
}
