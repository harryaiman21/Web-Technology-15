import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Archive, BarChart3, Bell, BookOpen, Brain, ChevronUp,
  Cpu, Layers, LayoutDashboard, LogOut, MapPin, Menu, MessageSquare,
  Moon, Radio, Shield, ShieldCheck, Sun, Terminal, X, Zap,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';

import Badge from './Badge';
import DemoTour from './DemoTour';
import RoiCounter from './RoiCounter';
import { useAuth } from '../hooks/useAuth';
import { useView, HUBS } from '../context/ViewContext';
import { getPendingCount, getProactivePendingCount, getPendingIncidents } from '../lib/api';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const DEMO_USERS = [
  { email: 'admin@nexus.com',    password: 'nexus123', name: 'Admin User',     role: 'ADMIN' },
  { email: 'reviewer@nexus.com', password: 'nexus123', name: 'Sara Reviewer',  role: 'REVIEWER' },
  { email: 'reporter@nexus.com', password: 'nexus123', name: 'Ahmad Reporter', role: 'REPORTER' },
];

const ADMIN_NAV = [
  { section: 'Operations' },
  { label: 'Intake Hub',          path: '/intake',             icon: Layers,          roles: null },
  { label: 'Incident Board',     path: '/board',              icon: LayoutDashboard, roles: null, showPending: true },
  { label: 'PCC Inbox',          path: '/inbox',              icon: BookOpen,        roles: null },
  { label: 'Review Queue',       path: '/review',             icon: ShieldCheck,     roles: ['admin', 'reviewer'], showPending: true },
  { label: 'Resolution Archive', path: '/resolution-archive', icon: Archive,         roles: ['admin', 'reviewer'] },
  { label: 'Audit & Trace',      path: '/audit',              icon: Shield,          roles: ['admin', 'reviewer'] },
  { section: 'Intelligence' },
  { label: 'Admin Dashboard',       path: '/admin',      icon: BarChart3,       roles: ['admin', 'reviewer'] },
  { label: 'NEXUS Brain',           path: '/brain',      icon: Brain,           roles: ['admin', 'reviewer'] },
  { label: 'Knowledge Observatory', path: '/knowledge',  icon: Brain,           roles: ['admin', 'reviewer'] },
  { label: 'RPA Mission Control',   path: '/rpa',        icon: Zap,             roles: ['admin', 'reviewer'] },
  { label: 'Proactive',             path: '/proactive',  icon: MapPin,          roles: ['admin', 'reviewer'], proactiveBadge: true },
  { label: 'Command Center',        path: '/admin/ops',  icon: Terminal,        roles: ['admin'] },
  { label: 'Ops Chat',              path: '/ops-chat',   icon: MessageSquare,   roles: ['admin', 'reviewer'] },
  { label: 'Live Ops Center',       path: '/live',       icon: Radio,           roles: ['admin', 'reviewer'], live: true },
];

const HUB_NAV = [
  { section: 'Hub Manager' },
  { label: 'Hub Dashboard',  path: '/hub',        icon: MapPin,          roles: null },
  { label: 'Incident Board', path: '/board',      icon: LayoutDashboard, roles: null, showPending: true },
  { label: 'Hub Alerts',     path: '/hub/alerts', icon: Bell,            roles: null, alertBadge: true },
  { label: 'Ops Chat',       path: '/ops-chat',   icon: MessageSquare,   roles: null },
];

/* ── Live Clock ─────────────────────────────────────────────────────────────── */

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-mono-ui text-[11px] tabular-nums text-[var(--nexus-text-3)]">
      {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

/* ── Sidebar ────────────────────────────────────────────────────────────────── */

function SidebarContent({
  location, pendingCount, proactivePendingCount, user, onNavigate, onLogout,
  viewMode, selectedHub, setSelectedHub, switchToHub, switchToAdmin, canSwitchView,
  switcherOpen, setSwitcherOpen, switching, onSwitchUser,
  switcherRef,
}) {
  const isHubManager = viewMode === 'hub_manager';

  const navItems = isHubManager
    ? HUB_NAV
    : ADMIN_NAV.filter(item =>
        item.section || !item.roles || item.roles.includes(user?.role)
      );

  return (
    <div className="flex h-full flex-col">

      {/* Logo */}
      <div className="flex-shrink-0 border-b border-[var(--nexus-border)] px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[var(--nexus-red)]">
            <span className="text-[8px] font-black tracking-wider text-white">DHL</span>
          </div>
          <div>
            <span className="text-[15px] font-extrabold tracking-tight text-[var(--nexus-logo-text)]">NEXUS</span>
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--nexus-cyan)] opacity-60">
              Incident Intelligence
            </p>
          </div>
        </div>
      </div>

      {/* Role switcher */}
      {canSwitchView && (
        <div className="flex-shrink-0 border-b border-[var(--nexus-border)] px-3 py-2.5">
          <p className="sidebar-section-label mb-1 px-0 pt-0">View as</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={switchToAdmin}
              className={`flex-1 rounded-md py-1.5 text-[10px] font-bold transition-all ${
                !isHubManager
                  ? 'bg-[var(--nexus-cyan-dim)] text-[var(--nexus-cyan)] border border-[rgba(34,211,238,0.15)]'
                  : 'text-[var(--nexus-text-3)] border border-transparent hover:text-[var(--nexus-text-2)]'
              }`}
            >Admin</button>
            <button
              type="button"
              onClick={() => switchToHub(selectedHub)}
              className={`flex-1 rounded-md py-1.5 text-[10px] font-bold transition-all ${
                isHubManager
                  ? 'bg-[rgba(14,165,233,0.12)] text-[#FFCC00] border border-[rgba(14,165,233,0.2)]'
                  : 'text-[var(--nexus-text-3)] border border-transparent hover:text-[var(--nexus-text-2)]'
              }`}
            >Hub Mgr</button>
          </div>
          {isHubManager && (
            <select
              value={selectedHub}
              onChange={e => setSelectedHub(e.target.value)}
              className="mt-2 w-full rounded-md border border-[rgba(14,165,233,0.2)] bg-[var(--nexus-surface-2)] px-2 py-1.5 text-[10px] font-semibold text-[#FFCC00] outline-none"
            >
              {HUBS.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {navItems.map((item, i) => {
          if (item.section) {
            return (
              <p key={item.section} className="sidebar-section-label">
                {item.section}
              </p>
            );
          }

          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={`sidebar-nav-item ${isActive ? 'sidebar-nav-item--active' : ''}`}
            >
              <Icon size={15} className="sidebar-nav-icon flex-shrink-0" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.showPending && pendingCount > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--nexus-red)] px-1 text-[9px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
              {item.proactiveBadge && proactivePendingCount > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#F59E0B] px-1 text-[9px] font-bold text-white">
                  {proactivePendingCount}
                </span>
              )}
              {item.live && (
                <span className="status-dot status-dot--live" />
              )}
              {item.alertBadge && pendingCount > 0 && isHubManager && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FFCC00] px-1 text-[9px] font-bold text-white">!</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ROI counter */}
      <RoiCounter />

      {/* User footer */}
      <div ref={switcherRef} className="flex-shrink-0 border-t border-[var(--nexus-border)]">
        {/* User switcher panel */}
        {switcherOpen && (
          <div className="border-b border-[var(--nexus-border)] bg-[var(--nexus-surface-1)]">
            <p className="px-3.5 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--nexus-text-3)]">
              Switch demo user
            </p>
            {DEMO_USERS.map(du => {
              const active = du.email === user?.email;
              const loading = switching === du.email;
              return (
                <button
                  key={du.email}
                  type="button"
                  onClick={() => onSwitchUser(du)}
                  disabled={!!switching}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                    active
                      ? 'border-l-[3px] border-l-[var(--nexus-cyan)] bg-[var(--nexus-cyan-dim)]'
                      : 'border-l-[3px] border-l-transparent hover:bg-[var(--nexus-surface-2)]'
                  }`}
                >
                  <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                    active ? 'bg-[var(--nexus-cyan)] text-[var(--nexus-bg)]' : 'bg-[var(--nexus-surface-3)] text-[var(--nexus-text-3)]'
                  }`}>
                    {loading ? '...' : du.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold leading-tight ${active ? 'text-[var(--nexus-text-1)]' : 'text-[var(--nexus-text-2)]'}`}>
                      {du.name}
                    </p>
                    <p className={`text-[10px] ${active ? 'text-[var(--nexus-cyan)]' : 'text-[var(--nexus-text-3)]'}`}>
                      {du.role}
                    </p>
                  </div>
                  {active && <span className="status-dot status-dot--live" />}
                </button>
              );
            })}
            <div className="px-3 py-2">
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-[var(--nexus-text-3)] hover:text-[#ef4444] transition-colors"
              >
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </div>
        )}

        {/* User row */}
        <button
          type="button"
          onClick={() => setSwitcherOpen(v => !v)}
          className="flex w-full items-center gap-2.5 px-4 py-3 transition-colors hover:bg-[var(--nexus-surface-2)]"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-electric)] text-[12px] font-extrabold text-[var(--nexus-bg)]">
            {(isHubManager ? selectedHub[0] : user?.name?.[0]) || 'U'}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="truncate text-[13px] font-semibold leading-tight text-[var(--nexus-text-1)]">
              {isHubManager ? selectedHub : (user?.name || 'User')}
            </p>
            <p className="text-[10px] font-medium text-[var(--nexus-text-3)]">
              {isHubManager ? 'HUB MANAGER' : String(user?.role || 'USER').toUpperCase()}
            </p>
          </div>
          <ChevronUp
            size={13}
            className={`flex-shrink-0 text-[var(--nexus-text-3)] transition-transform duration-200 ${
              switcherOpen ? '' : 'rotate-180'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

/* ── Main Layout ────────────────────────────────────────────────────────────── */

export default function Layout({ title, children, topbarExtras }) {
  const { user, login, logout } = useAuth();
  const { viewMode, selectedHub, setSelectedHub, switchToHub, switchToAdmin } = useView();
  const { resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [proactivePendingCount, setProactivePendingCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [mounted, setMounted] = useState(false);
  const switcherRef = useRef(null);

  useEffect(() => { setMounted(true); }, []);
  const isDark = !mounted || resolvedTheme === 'dark';

  useEffect(() => {
    let active = true;
    const fetchPending = async () => {
      const c = await getPendingCount();
      if (active) setPendingCount(c);
    };
    if (user) {
      fetchPending();
      const id = setInterval(fetchPending, 30000);
      return () => { active = false; clearInterval(id); };
    }
    return undefined;
  }, [user]);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      const c = await getProactivePendingCount();
      if (active) setProactivePendingCount(c);
    };
    if (user?.role === 'admin' || user?.role === 'reviewer') {
      fetch();
      const id = setInterval(fetch, 60000);
      return () => { active = false; clearInterval(id); };
    }
    return undefined;
  }, [user]);

  useEffect(() => {
    if (!switcherOpen) return;
    const handler = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) setSwitcherOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [switcherOpen]);

  const canSwitchView = user?.role === 'admin' || user?.role === 'reviewer';

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const handleSwitchUser = async (demoUser) => {
    if (demoUser.email === user?.email) { setSwitcherOpen(false); return; }
    setSwitching(demoUser.email);
    try {
      await login(demoUser.email, demoUser.password);
      switchToAdmin();
      setSwitcherOpen(false);
      navigate('/intake');
    } catch { /* ignore */ } finally { setSwitching(null); }
  };

  const sharedProps = {
    location, pendingCount, proactivePendingCount, user, onLogout: handleLogout,
    viewMode, selectedHub, setSelectedHub, switchToHub, switchToAdmin, canSwitchView,
    switcherOpen, setSwitcherOpen, switching, onSwitchUser: handleSwitchUser,
    switcherRef,
  };

  return (
    <div className="flex min-h-screen bg-[var(--nexus-bg)] text-[var(--nexus-text-1)]">

      {/* ── Ambient Background ─────────────────────────────────────────────── */}
      <div className="nexus-ambient">
        <div className="nexus-grid" />
        <div className="nexus-orb nexus-orb--cyan" />
        <div className="nexus-orb nexus-orb--red" />
        <div className="nexus-orb nexus-orb--electric" />
        <div className="nexus-scanline" />
      </div>

      {/* ── Desktop Sidebar ────────────────────────────────────────────────── */}
      <aside
        data-tour="sidebar"
        className="relative z-10 hidden lg:block"
        style={{
          width: 240,
          flexShrink: 0,
          height: '100vh',
          position: 'sticky',
          top: 0,
          background: 'var(--nexus-sidebar-bg)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid var(--nexus-border)',
        }}
      >
        <SidebarContent {...sharedProps} onNavigate={undefined} />
      </aside>

      {/* ── Mobile Sidebar Overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="absolute left-0 top-0 z-10 h-full"
              style={{
                width: 240,
                background: 'var(--nexus-sidebar-bg)',
                backdropFilter: 'blur(20px)',
                borderRight: '1px solid var(--nexus-border)',
              }}
            >
              <SidebarContent {...sharedProps} onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">

        {/* Header */}
        <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-[var(--nexus-border)] px-4 backdrop-blur-xl" style={{ background: 'var(--nexus-header-bg)' }}>
          <div className="flex items-center gap-3">
            {/* Mobile menu */}
            <button
              type="button"
              aria-label="Open navigation menu"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] text-[var(--nexus-text-3)] lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={15} aria-hidden="true" />
            </button>

            {/* Page title */}
            <h1 className="text-[15px] font-semibold tracking-tight text-[var(--nexus-text-1)]">{title}</h1>

            {/* System status */}
            <div className="hidden items-center gap-1.5 rounded-full bg-[rgba(52,211,153,0.08)] px-2.5 py-1 sm:flex">
              <span className="status-dot status-dot--live" />
              <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--nexus-emerald)]">
                Operational
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {topbarExtras}

            {/* Live clock */}
            <div className="hidden md:block">
              <LiveClock />
            </div>

            {/* Active agents pill */}
            <div className="hidden items-center gap-1.5 rounded-md bg-[var(--nexus-cyan-dim)] px-2 py-1 sm:flex">
              <Activity size={11} className="text-[var(--nexus-cyan)]" />
              <span className="text-[10px] font-bold text-[var(--nexus-cyan)]">
                AI ACTIVE
              </span>
            </div>

            {/* Theme toggle */}
            {mounted && (
              <button
                type="button"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] text-[var(--nexus-text-3)] transition-colors hover:text-[var(--nexus-text-1)]"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            )}

            {/* Separator */}
            <div className="hidden h-4 w-px bg-[var(--nexus-border)] sm:block" />

            {/* Notifications */}
            <NotificationsBell pendingCount={pendingCount} navigate={navigate} />


            {/* Pending count */}
            {pendingCount > 0 && (
              <span className="hidden rounded-md bg-[var(--nexus-red-dim)] px-2 py-1 text-[10px] font-bold text-[var(--nexus-red)] sm:inline-flex">
                {pendingCount} pending
              </span>
            )}

            {/* User info */}
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-[12px] font-medium text-[var(--nexus-text-2)]">{user?.name}</span>
              <span className="rounded-[4px] bg-[var(--nexus-surface-3)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--nexus-text-3)]">
                {String(user?.role || 'USER').toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

    </div>
  );
}

function NotificationsBell({ pendingCount, navigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getPendingIncidents()
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : (data?.incidents || []);
        setItems(arr.slice(0, 8));
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function fmtTime(d) {
    if (!d) return '';
    const ms = Date.now() - new Date(d).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const sevColor = (s) => ({
    Critical: '#ef4444',
    High: '#f59e0b',
    Medium: '#3b82f6',
    Low: '#64748b',
  })[s] || '#64748b';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[var(--nexus-border)] bg-[var(--nexus-surface-2)] text-[var(--nexus-text-3)] transition-colors hover:text-[var(--nexus-text-1)]"
      >
        <Bell size={14} aria-hidden="true" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--nexus-red)] px-1 text-[8px] font-bold text-white">
            {pendingCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 w-[380px] overflow-hidden rounded-lg border shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
            style={{
              zIndex: 9999,
              backgroundColor: '#0f1219',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: '#13171f' }}
            >
              <div className="flex items-center gap-2">
                <Bell size={12} className="text-[var(--nexus-text-3)]" />
                <span className="text-[12px] font-semibold text-[var(--nexus-text-1)]">Pending Review</span>
              </div>
              <span className="font-mono text-[10px] text-[var(--nexus-text-3)]">{pendingCount} item{pendingCount === 1 ? '' : 's'}</span>
            </div>

            <div className="max-h-[420px] overflow-y-auto" style={{ backgroundColor: '#0f1219' }}>
              {loading && (
                <div className="px-4 py-8 text-center text-[11px] text-[var(--nexus-text-3)]">Loading…</div>
              )}
              {!loading && items.length === 0 && (
                <div className="px-4 py-8 text-center text-[11px] text-[var(--nexus-text-3)]">
                  No pending items. The team is caught up.
                </div>
              )}
              {!loading && items.map((inc) => (
                <button
                  key={inc._id}
                  type="button"
                  onClick={() => { setOpen(false); navigate(`/incidents/${inc._id}`); }}
                  className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: sevColor(inc.severity) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12px] font-medium text-[var(--nexus-text-1)]">
                        {(inc.type || 'unknown').replace(/_/g, ' ')}
                      </span>
                      <span
                        className="rounded-[2px] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                        style={{
                          background: `${sevColor(inc.severity)}22`,
                          color: sevColor(inc.severity),
                        }}
                      >
                        {inc.severity || '—'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--nexus-text-2)]">
                      {inc.title || inc.description?.slice(0, 80) || `Incident ${String(inc._id).slice(-6).toUpperCase()}`}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--nexus-text-3)]">
                      {inc.location || 'unknown hub'} · {fmtTime(inc.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/review'); }}
              className="flex w-full items-center justify-center gap-2 border-t px-4 py-3 text-[11px] font-semibold text-[var(--nexus-text-2)] transition-colors hover:text-[var(--nexus-text-1)]"
              style={{
                borderColor: 'rgba(255,255,255,0.06)',
                backgroundColor: '#13171f',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1a1f29'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#13171f'; }}
            >
              Open Review Queue
              <span>→</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
