import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Search,
  X,
  ExternalLink,
  Sparkles,
  Clock,
  MapPin,
  ChevronRight,
  Loader2,
  Network,
  Zap,
} from 'lucide-react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { getEmbeddingSpace, getKnowledgeGraphEdges } from '../lib/api';

const TYPE_COLORS = {
  damaged_parcel: '#f59e0b',
  late_delivery: '#22d3ee',
  missing_parcel: '#ef4444',
  address_error: '#a855f7',
  system_error: '#10b981',
  wrong_item: '#ec4899',
  other: '#94a3b8',
};

const TYPE_LABELS = {
  damaged_parcel: 'Damaged Parcel',
  late_delivery: 'Late Delivery',
  missing_parcel: 'Missing Parcel',
  address_error: 'Address Error',
  system_error: 'System Error',
  wrong_item: 'Wrong Item',
  other: 'Other',
};

const SEVERITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22d3ee',
};

const ALL_TYPES = Object.keys(TYPE_LABELS);

const HUB_ALIASES = {
  'Shah Alam Hub': ['Shah Alam', 'Shah Alam Hub'],
  'KLIA Hub': ['KLIA', 'KLIA Hub', 'KLIA Cargo', 'Sepang'],
  'Penang Hub': ['Penang', 'Penang Hub', 'Bayan Lepas'],
  'Johor Bahru Hub': ['Johor Bahru', 'JB', 'Johor Bahru Hub', 'Johor'],
  'Kuching Hub': ['Kuching', 'Kuching Hub', 'Sarawak'],
};

const HUB_NAMES = Object.keys(HUB_ALIASES);

function resolveHub(location) {
  if (!location) return null;
  const loc = location.toLowerCase().trim();
  for (const [hub, aliases] of Object.entries(HUB_ALIASES)) {
    for (const alias of aliases) {
      if (loc.includes(alias.toLowerCase())) return hub;
    }
  }
  return null;
}

function timeAgo(d) {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function lerp(a, b, t) {
  return a + (b - a) * Math.min(t, 1);
}

function quadBezierMid(x0, y0, x1, y1, curvature) {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  return { cx: mx - dy * curvature, cy: my + dx * curvature };
}

export default function KnowledgeMapGraph() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const animRef = useRef(null);
  const transformRef = useRef(d3.zoomIdentity);
  const hoverRef = useRef(null);
  const prevHoverRef = useRef(null);
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const hubNodesRef = useRef([]);
  const hubEdgesRef = useRef([]);
  const clusterLabelsRef = useRef([]);
  const canvasDims = useRef({ w: 0, h: 0 });
  const selectedIdRef = useRef(null);
  const lastFrameTime = useRef(0);
  const revealProgress = useRef(0);
  const edgeFadeRef = useRef(0);
  const connectionCountRef = useRef(new Map());

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [activeFilter, setActiveFilter] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);

  const activeFilterRef = useRef(null);
  const searchTermRef = useRef('');
  useEffect(() => { activeFilterRef.current = activeFilter; }, [activeFilter]);
  useEffect(() => { searchTermRef.current = searchTerm.toLowerCase(); }, [searchTerm]);

  const getAdjacentIds = useCallback((nodeId) => {
    const ids = new Set();
    for (const e of edgesRef.current) {
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      if (src === nodeId) ids.add(tgt);
      if (tgt === nodeId) ids.add(src);
    }
    return ids;
  }, []);

  const findNodeAt = useCallback((mx, my) => {
    const t = transformRef.current;
    for (const hub of hubNodesRef.current) {
      const sx = t.applyX(hub.x);
      const sy = t.applyY(hub.y);
      const hitR = 14 * t.k;
      if ((mx - sx) ** 2 + (my - sy) ** 2 <= (hitR + 6) ** 2) return hub;
    }
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const sx = t.applyX(n.x);
      const sy = t.applyY(n.y);
      const baseR = n.type === 'other' ? 3 : (4 + (n.connCount || 0) * 0.4);
      const r = Math.min(baseR, 9) * t.k;
      if ((mx - sx) ** 2 + (my - sy) ** 2 <= (r + 5) ** 2) return n;
    }
    return null;
  }, []);

  // ── Draw loop ──────────────────────────────────────────────────────────
  const draw = useCallback((time) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvasDims.current.w;
    const H = canvasDims.current.h;
    if (W === 0 || H === 0) {
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const dt = lastFrameTime.current ? (time - lastFrameTime.current) / 1000 : 0.016;
    lastFrameTime.current = time;

    const t = transformRef.current;
    const hovId = hoverRef.current;
    const adjIds = hovId ? getAdjacentIds(hovId) : null;
    const filter = activeFilterRef.current;
    const search = searchTermRef.current;
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const hubs = hubNodesRef.current;
    const hubEdges = hubEdgesRef.current;
    const labels = clusterLabelsRef.current;
    const selId = selectedIdRef.current;

    // Smooth edge fade on hover change
    if (hovId) {
      edgeFadeRef.current = Math.min(edgeFadeRef.current + dt * 6, 1);
    } else {
      edgeFadeRef.current = Math.max(edgeFadeRef.current - dt * 4, 0);
    }
    const edgeFade = edgeFadeRef.current;

    // Smooth reveal on load
    if (nodes.length > 0 && revealProgress.current < 1) {
      revealProgress.current = Math.min(revealProgress.current + dt * 1.2, 1);
    }
    const reveal = revealProgress.current;

    // Smooth per-node alpha lerp
    for (const n of nodes) {
      let targetAlpha = 1;
      if (n.type === 'other') {
        targetAlpha = 0.12;
        if (filter) targetAlpha = 0.03;
        if (search && !n.title?.toLowerCase().includes(search)) targetAlpha = 0.02;
      } else {
        if (filter && n.type !== filter) targetAlpha = 0.06;
        if (search && !n.title?.toLowerCase().includes(search)) targetAlpha = 0.05;
        if (hovId && hovId !== n.id && adjIds && !adjIds.has(n.id)) targetAlpha = 0.12;
        if (n.status === 'RESOLVED' || n.status === 'CLOSED') targetAlpha *= 0.35;
      }
      n._alpha = lerp(n._alpha ?? 0, targetAlpha, dt * 8);
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    bgGrad.addColorStop(0, '#11161f');
    bgGrad.addColorStop(0.55, '#0a0d14');
    bgGrad.addColorStop(1, '#05070b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const gridStep = 48;
    const gridOff = (time * 0.005) % gridStep;
    ctx.strokeStyle = 'rgba(148,163,184,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -gridOff; x < W; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = -gridOff; y < H; y += gridStep) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();

    const ambientCount = 60;
    for (let i = 0; i < ambientCount; i++) {
      const px = ((i * 137 + time * 0.012) % (W + 40)) - 20;
      const py = ((i * 211 + time * 0.008) % (H + 40)) - 20;
      const tw = 0.35 + 0.35 * Math.sin(time * 0.0015 + i);
      ctx.beginPath();
      ctx.arc(px, py, 0.7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(148,163,184,${0.05 + tw * 0.06})`;
      ctx.fill();
    }

    if (nodes.length === 0 && hubs.length === 0) {
      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // ── Hub-to-hub curved dashed lines ───────────────────────────────────
    ctx.setLineDash([5 / t.k, 4 / t.k]);
    ctx.lineWidth = 1.1 / t.k;
    const linkPulse = 0.5 + 0.5 * Math.sin(time * 0.001);
    for (const he of hubEdges) {
      const { cx, cy } = quadBezierMid(
        he.source.x, he.source.y,
        he.target.x, he.target.y,
        0.1,
      );
      ctx.beginPath();
      ctx.moveTo(he.source.x, he.source.y);
      ctx.quadraticCurveTo(cx, cy, he.target.x, he.target.y);
      ctx.strokeStyle = `rgba(56,189,248,${0.10 + linkPulse * 0.06})`;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (edgeFade < 0.99) {
      ctx.lineWidth = 0.4 / t.k;
      for (const e of edges) {
        const src = e.source;
        const tgt = e.target;
        if (!src || !tgt) continue;
        if (src.type === 'other' || tgt.type === 'other') continue;
        if (filter && (src.type !== filter || tgt.type !== filter)) continue;
        const srcNode = typeof src === 'object' ? src : null;
        const color = srcNode ? (TYPE_COLORS[srcNode.type] || '#64748b') : '#64748b';
        const rgb = hexToRgb(color);
        const baseAlpha = 0.06 * (1 - edgeFade) * reveal;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${baseAlpha})`;
        ctx.stroke();
      }
    }

    if (edgeFade > 0.01) {
      for (const e of edges) {
        const src = e.source;
        const tgt = e.target;
        if (!src || !tgt) continue;
        const srcId = src.id || src;
        const tgtId = tgt.id || tgt;
        const isHovered = hovId && (srcId === hovId || tgtId === hovId);
        const isSelected = selId && (srcId === selId || tgtId === selId);
        if (!isHovered && !isSelected) continue;
        if (src.type === 'other' || tgt.type === 'other') continue;

        const srcNode = typeof src === 'object' ? src : null;
        const color = srcNode ? (TYPE_COLORS[srcNode.type] || '#64748b') : '#64748b';
        const rgb = hexToRgb(color);

        let alpha = 0.35 * edgeFade;
        let width = 0.7;

        if (e.edgeType === 'cascade') {
          alpha = 0.5 * edgeFade;
          width = 1;
        } else if (e.edgeType === 'resolved_by') {
          alpha = 0.45 * edgeFade;
          width = 0.9;
        }

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
        ctx.lineWidth = width / t.k;
        ctx.stroke();

        // Edge type marker for cascade (small dot at midpoint)
        if (e.edgeType === 'cascade' && edgeFade > 0.5) {
          const mx = (src.x + tgt.x) / 2;
          const my = (src.y + tgt.y) / 2;
          ctx.beginPath();
          ctx.arc(mx, my, 1.5 / t.k, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(239,68,68,${0.6 * edgeFade})`;
          ctx.fill();
        }
      }
    }

    for (const label of labels) {
      const dimmed = filter && filter !== label.type;
      if (dimmed) continue;
      const color = TYPE_COLORS[label.type] || '#94a3b8';
      const rgb = hexToRgb(color);
      const labelAlpha = 0.85 * reveal;
      const text = `${TYPE_LABELS[label.type]} • ${label.count}`;
      ctx.font = `600 ${10.5 / t.k}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const textWidth = ctx.measureText(text).width;
      const padX = 9 / t.k;
      const padY = 5 / t.k;
      const boxW = textWidth + padX * 2;
      const boxH = 18 / t.k;
      const boxX = label.x - boxW / 2;
      const boxY = label.y - boxH / 2 - 1 / t.k;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 9 / t.k);
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.12 * reveal})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.35 * reveal})`;
      ctx.lineWidth = 1 / t.k;
      ctx.stroke();
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${labelAlpha})`;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, label.x, label.y + padY * 0.6);
      ctx.textBaseline = 'alphabetic';
    }

    // ── Nodes ────────────────────────────────────────────────────────────
    const showLabels = t.k > 2.2;
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.003);

    for (const n of nodes) {
      const alpha = n._alpha * reveal;
      if (alpha < 0.01) continue;

      const color = TYPE_COLORS[n.type] || '#94a3b8';
      const rgb = hexToRgb(color);
      const isOther = n.type === 'other';

      // Connection-count-based radius (more connections = slightly larger)
      const connCount = n.connCount || 0;
      const baseR = isOther ? 3 : Math.min(4.5 + connCount * 0.35, 8.5);
      const isResolved = n.status === 'RESOLVED' || n.status === 'CLOSED';
      const isActive = ['IN_PROGRESS', 'ASSIGNED', 'UNDER_REVIEW'].includes(n.status);
      const isEscalated = n.status === 'BREACHED';
      const isHovered = hovId === n.id;
      const isSelected = selId === n.id;

      let r = isResolved ? baseR * 0.75 : baseR;
      if (isHovered) r *= 1.4;
      if (isSelected) r *= 1.3;
      r = r / t.k;

      ctx.globalAlpha = alpha;

      // Selected ring
      if (isSelected && !isOther) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4 / t.k, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.5 * alpha})`;
        ctx.lineWidth = 1.5 / t.k;
        ctx.stroke();
      }

      // Active pulse ring
      if (isActive && alpha > 0.3 && !isOther) {
        const pulseR = r + (2 + pulse * 3) / t.k;
        ctx.beginPath();
        ctx.arc(n.x, n.y, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.15 * pulse * alpha})`;
        ctx.lineWidth = 1 / t.k;
        ctx.stroke();
      }

      if (!isOther && alpha > 0.25) {
        const glowR = r * 3.2;
        const glow = ctx.createRadialGradient(n.x, n.y, r * 0.3, n.x, n.y, glowR);
        const glowAlpha = (isHovered ? 0.55 : 0.32) * alpha;
        glow.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${glowAlpha})`);
        glow.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      if (isOther) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      } else {
        const fillGrad = ctx.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, 0, n.x, n.y, r);
        fillGrad.addColorStop(0, `rgb(${Math.min(rgb.r + 50, 255)},${Math.min(rgb.g + 50, 255)},${Math.min(rgb.b + 50, 255)})`);
        fillGrad.addColorStop(1, `rgb(${rgb.r},${rgb.g},${rgb.b})`);
        ctx.fillStyle = fillGrad;
      }
      ctx.fill();

      // Status badge
      if (alpha > 0.25 && !isOther && !isResolved) {
        if (isActive) {
          ctx.beginPath();
          ctx.arc(n.x + r * 0.7, n.y - r * 0.7, 1.8 / t.k, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = alpha * 0.9;
          ctx.fill();
        } else if (isEscalated) {
          const bx = n.x + r * 0.75;
          const by = n.y - r * 0.75;
          const bs = 2.5 / t.k;
          ctx.beginPath();
          ctx.moveTo(bx, by - bs);
          ctx.lineTo(bx + bs, by + bs);
          ctx.lineTo(bx - bs, by + bs);
          ctx.closePath();
          ctx.fillStyle = '#ef4444';
          ctx.globalAlpha = alpha;
          ctx.fill();
        }
      }

      // Zoom-adaptive labels
      if (showLabels && !isOther && alpha > 0.3) {
        ctx.globalAlpha = alpha * 0.7;
        ctx.font = `400 ${9 / t.k}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.8)`;
        const label = n.title
          ? (n.title.length > 28 ? n.title.slice(0, 28) + '...' : n.title)
          : `INC-${n.id.slice(-6).toUpperCase()}`;
        ctx.fillText(label, n.x + r + 4 / t.k, n.y + 3 / t.k);
      }

      ctx.globalAlpha = 1;
    }

    for (const hub of hubs) {
      const s = 16 / t.k;
      const isHubHovered = hovId === hub.id;
      const hubAlpha = reveal;
      const scale = isHubHovered ? 1.18 : 1;
      const hs = s * scale;
      const hh = hs / 2;

      ctx.globalAlpha = hubAlpha;

      const beacon = 0.5 + 0.5 * Math.sin(time * 0.0018 + hub.x * 0.01);
      if (hub.incidentCount > 0) {
        const ringR1 = (28 + hub.incidentCount * 0.8) / t.k;
        const ringR2 = ringR1 * 1.5;
        const haloGrad = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, ringR2);
        const haloAlpha = isHubHovered ? 0.22 : 0.11 + beacon * 0.04;
        haloGrad.addColorStop(0, `rgba(56,189,248,${haloAlpha})`);
        haloGrad.addColorStop(0.55, `rgba(56,189,248,${haloAlpha * 0.4})`);
        haloGrad.addColorStop(1, 'rgba(56,189,248,0)');
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, ringR2, 0, Math.PI * 2);
        ctx.fillStyle = haloGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(hub.x, hub.y, ringR1, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(125,211,252,${isHubHovered ? 0.35 : 0.15})`;
        ctx.lineWidth = 0.7 / t.k;
        ctx.stroke();
      }

      ctx.beginPath();
      const sides = 6;
      for (let i = 0; i < sides; i++) {
        const a = (Math.PI * 2 / sides) * i - Math.PI / 2;
        const px = hub.x + Math.cos(a) * hh;
        const py = hub.y + Math.sin(a) * hh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const hubFill = ctx.createRadialGradient(hub.x - hh * 0.3, hub.y - hh * 0.3, 0, hub.x, hub.y, hh);
      hubFill.addColorStop(0, '#ffffff');
      hubFill.addColorStop(1, '#bae6fd');
      ctx.fillStyle = hubFill;
      ctx.fill();
      ctx.strokeStyle = isHubHovered ? '#38bdf8' : 'rgba(56,189,248,0.6)';
      ctx.lineWidth = 1.2 / t.k;
      ctx.stroke();

      const initial = hub.name.charAt(0).toUpperCase();
      ctx.font = `800 ${hh * 0.85}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0c4a6e';
      ctx.fillText(initial, hub.x, hub.y + hh * 0.04);

      const nameY = hub.y + hh + 13 / t.k;
      ctx.font = `700 ${10.5 / t.k}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hubName = hub.name.replace(' Hub', '');
      const nameW = ctx.measureText(hubName).width;
      const namePadX = 7 / t.k;
      const nameBoxH = 16 / t.k;
      ctx.beginPath();
      ctx.roundRect(hub.x - nameW / 2 - namePadX, nameY - nameBoxH / 2, nameW + namePadX * 2, nameBoxH, 8 / t.k);
      ctx.fillStyle = `rgba(15,23,42,${isHubHovered ? 0.92 : 0.78})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(56,189,248,${isHubHovered ? 0.5 : 0.22})`;
      ctx.lineWidth = 0.8 / t.k;
      ctx.stroke();
      ctx.fillStyle = `rgba(241,245,249,${isHubHovered ? 1 : 0.92})`;
      ctx.fillText(hubName, hub.x, nameY);

      if (hub.incidentCount > 0) {
        const countText = `${hub.incidentCount}`;
        ctx.font = `700 ${8.5 / t.k}px Inter, system-ui, sans-serif`;
        const cw = ctx.measureText(countText).width;
        const badgeR = Math.max(7 / t.k, cw / 2 + 4 / t.k);
        const bx = hub.x + nameW / 2 + namePadX + badgeR + 2 / t.k;
        const by = nameY;
        ctx.beginPath();
        ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.fillStyle = '#0c4a6e';
        ctx.fillText(countText, bx, by);
      }

      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // ── Minimap (bottom-right) ───────────────────────────────────────────
    if (nodes.length > 0 && (t.k !== 1 || t.x !== 0 || t.y !== 0)) {
      const mmW = 120;
      const mmH = 75;
      const mmX = W - mmW - 12;
      const mmY = H - mmH - 12;
      const mmPad = 6;

      ctx.fillStyle = 'rgba(12,15,22,0.85)';
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(mmX, mmY, mmW, mmH, 4);
      ctx.fill();
      ctx.stroke();

      // Compute bounds of all nodes
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of nodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;

      // Draw minimap nodes
      for (const n of nodes) {
        if (n.type === 'other') continue;
        const nx = mmX + mmPad + ((n.x - minX) / rangeX) * (mmW - mmPad * 2);
        const ny = mmY + mmPad + ((n.y - minY) / rangeY) * (mmH - mmPad * 2);
        ctx.beginPath();
        ctx.arc(nx, ny, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = TYPE_COLORS[n.type] || '#94a3b8';
        ctx.globalAlpha = 0.6;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Draw viewport rectangle
      const vpLeft = (-t.x / t.k - minX) / rangeX;
      const vpTop = (-t.y / t.k - minY) / rangeY;
      const vpW = (W / t.k) / rangeX;
      const vpH = (H / t.k) / rangeY;

      const vx = mmX + mmPad + vpLeft * (mmW - mmPad * 2);
      const vy = mmY + mmPad + vpTop * (mmH - mmPad * 2);
      const vw = vpW * (mmW - mmPad * 2);
      const vh = vpH * (mmH - mmPad * 2);

      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.max(mmX + mmPad, vx),
        Math.max(mmY + mmPad, vy),
        Math.min(vw, mmW - mmPad * 2),
        Math.min(vh, mmH - mmPad * 2),
      );
    }

    // ── Tooltip (screen space) ───────────────────────────────────────────
    if (hovId) {
      const allNodes = [...nodes, ...hubs];
      const n = allNodes.find(nd => nd.id === hovId);
      if (n) {
        const sx = t.applyX(n.x);
        const sy = t.applyY(n.y);
        const tipX = sx + 18;
        const tipY = Math.max(10, sy - 24);
        const pad = 12;
        const lineH = 17;

        const lines = n.isHub
          ? [n.name, 'Infrastructure Hub', `${n.incidentCount || 0} routed incidents`]
          : [
            n.title || `INC-${n.id.slice(-6).toUpperCase()}`,
            `${TYPE_LABELS[n.type] || n.type}  -  ${n.severity || 'medium'}`,
            `Status: ${n.status || 'N/A'}`,
            `Confidence: ${Math.round((n.confidence || 0) * 100)}%`,
            `Connections: ${n.connCount || 0}`,
            n.location ? `Hub: ${n.location}` : null,
            n.createdAt ? timeAgo(n.createdAt) : null,
          ].filter(Boolean);

        ctx.font = '12px Inter, system-ui, sans-serif';
        const maxW = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2 + 8;
        const boxH = lines.length * lineH + pad * 2;
        const clampX = Math.min(tipX, W - maxW - 10);
        const clampY = Math.min(tipY, H - boxH - 10);

        // Tooltip background with subtle border
        ctx.fillStyle = 'rgba(12,15,22,0.96)';
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(clampX, clampY, maxW, boxH, 6);
        ctx.fill();
        ctx.stroke();

        // Color accent bar on left
        if (!n.isHub) {
          const accentColor = TYPE_COLORS[n.type] || '#64748b';
          ctx.fillStyle = accentColor;
          ctx.beginPath();
          ctx.roundRect(clampX, clampY, 3, boxH, [6, 0, 0, 6]);
          ctx.fill();
        }

        lines.forEach((line, i) => {
          ctx.textAlign = 'left';
          if (i === 0) {
            ctx.fillStyle = '#f1f5f9';
            ctx.font = '600 12px Inter, system-ui, sans-serif';
          } else if (i === 1 && !n.isHub) {
            const sevColor = SEVERITY_COLORS[n.severity] || '#64748b';
            ctx.fillStyle = sevColor;
            ctx.font = '500 10px Inter, system-ui, sans-serif';
          } else {
            ctx.fillStyle = '#64748b';
            ctx.font = '11px Inter, system-ui, sans-serif';
          }
          ctx.fillText(line, clampX + pad + 4, clampY + pad + (i + 1) * lineH - 4);
        });
      }
    }

    ctx.restore();
    animRef.current = requestAnimationFrame(draw);
  }, [getAdjacentIds]);

  // ── Data load + simulation ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    animRef.current = requestAnimationFrame(draw);

    async function init() {
      const [spaceData, edgeData] = await Promise.all([
        getEmbeddingSpace(),
        getKnowledgeGraphEdges(),
      ]);

      if (cancelled) return;
      const points = spaceData?.points || [];
      const rawEdges = edgeData?.edges || [];
      if (points.length < 2) { setLoading(false); return; }

      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;

      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight || 600;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvasDims.current = { w: W, h: H };

      const PAD = 80;
      const xExt = d3.extent(points, p => p.x);
      const yExt = d3.extent(points, p => p.y);
      const scaleX = d3.scaleLinear().domain(xExt).range([PAD, W - PAD]);
      const scaleY = d3.scaleLinear().domain(yExt).range([PAD, H - PAD]);

      const nodes = points.map(p => ({
        id: p.id,
        x: scaleX(p.x),
        y: scaleY(p.y),
        type: p.type || 'other',
        severity: p.severity,
        title: p.text || p.title,
        status: p.status,
        confidence: p.confidence,
        location: p.location,
        createdAt: p.createdAt,
        _alpha: 0,
        connCount: 0,
      }));

      // Outlier cluster compression
      const byType = {};
      for (const n of nodes) {
        if (!byType[n.type]) byType[n.type] = [];
        byType[n.type].push(n);
      }
      const overallCx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
      const overallCy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
      for (const [, typeNodes] of Object.entries(byType)) {
        const clCx = typeNodes.reduce((s, n) => s + n.x, 0) / typeNodes.length;
        const clCy = typeNodes.reduce((s, n) => s + n.y, 0) / typeNodes.length;
        const distX = Math.abs(clCx - overallCx);
        const distY = Math.abs(clCy - overallCy);
        const threshX = (W - PAD * 2) * 0.35;
        const threshY = (H - PAD * 2) * 0.35;
        if (distX > threshX || distY > threshY) {
          const pullX = (overallCx - clCx) * 0.25;
          const pullY = (overallCy - clCy) * 0.25;
          for (const n of typeNodes) {
            n.x += pullX;
            n.y += pullY;
          }
        }
      }

      // Force simulation
      const sim = d3.forceSimulation(nodes)
        .force('collide', d3.forceCollide(7).strength(0.6))
        .force('charge', d3.forceManyBody().strength(-1.5))
        .alphaDecay(0.06)
        .alpha(0.12);
      sim.stop();
      for (let i = 0; i < 120; i++) sim.tick();

      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const edges = rawEdges
        .filter(e => nodeMap.has(e.source) && nodeMap.has(e.target))
        .map(e => ({
          source: nodeMap.get(e.source),
          target: nodeMap.get(e.target),
          weight: e.weight,
          edgeType: e.edgeType,
        }));

      // Compute connection counts per node
      const connCounts = new Map();
      for (const e of edges) {
        const sid = e.source.id;
        const tid = e.target.id;
        connCounts.set(sid, (connCounts.get(sid) || 0) + 1);
        connCounts.set(tid, (connCounts.get(tid) || 0) + 1);
      }
      for (const n of nodes) {
        n.connCount = connCounts.get(n.id) || 0;
      }
      connectionCountRef.current = connCounts;

      // Cluster centroid labels (exclude "other")
      const clusterLabels = [];
      for (const [type, typeNodes] of Object.entries(byType)) {
        if (type === 'other') continue;
        if (typeNodes.length < 2) continue;
        const cx = typeNodes.reduce((s, n) => s + n.x, 0) / typeNodes.length;
        const cy = typeNodes.reduce((s, n) => s + n.y, 0) / typeNodes.length;
        clusterLabels.push({ type, x: cx, y: cy, count: typeNodes.length });
      }

      // Hub infrastructure nodes
      const hubCounts = {};
      for (const n of nodes) {
        const hub = resolveHub(n.location);
        if (hub) {
          if (!hubCounts[hub]) hubCounts[hub] = { count: 0, xs: [], ys: [] };
          hubCounts[hub].count++;
          hubCounts[hub].xs.push(n.x);
          hubCounts[hub].ys.push(n.y);
        }
      }

      const hubNodes = [];
      const hubRing = {
        cx: W / 2,
        cy: H / 2 + 10,
        rx: (W - PAD * 2) * 0.48,
        ry: (H - PAD * 2) * 0.48,
      };
      const baseAngle = -Math.PI / 2;
      for (let i = 0; i < HUB_NAMES.length; i++) {
        const hubName = HUB_NAMES[i];
        const data = hubCounts[hubName];
        const angle = baseAngle + (i / HUB_NAMES.length) * Math.PI * 2;
        const hx = hubRing.cx + Math.cos(angle) * hubRing.rx;
        const hy = hubRing.cy + Math.sin(angle) * hubRing.ry;
        hubNodes.push({
          id: `hub_${hubName}`,
          name: hubName,
          x: hx,
          y: hy,
          isHub: true,
          incidentCount: data?.count || 0,
          angle,
        });
      }

      // Hub-to-hub edges (fully connected)
      const hubEdgeList = [];
      for (let i = 0; i < hubNodes.length; i++) {
        for (let j = i + 1; j < hubNodes.length; j++) {
          hubEdgeList.push({ source: hubNodes[i], target: hubNodes[j] });
        }
      }

      nodesRef.current = nodes;
      edgesRef.current = edges;
      hubNodesRef.current = hubNodes;
      hubEdgesRef.current = hubEdgeList;
      clusterLabelsRef.current = clusterLabels;
      revealProgress.current = 0;

      // Stats
      const typeCounts = {};
      const now = Date.now();
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
      const recentCounts = {};
      const priorCounts = {};
      for (const n of nodes) {
        typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
        const ts = new Date(n.createdAt).getTime();
        if (ts > weekAgo) recentCounts[n.type] = (recentCounts[n.type] || 0) + 1;
        else if (ts > twoWeeksAgo) priorCounts[n.type] = (priorCounts[n.type] || 0) + 1;
      }
      const typeStats = {};
      for (const type of ALL_TYPES) {
        typeStats[type] = {
          count: typeCounts[type] || 0,
          trend: (recentCounts[type] || 0) > (priorCounts[type] || 0)
            ? 'up' : (recentCounts[type] || 0) < (priorCounts[type] || 0) ? 'down' : 'flat',
        };
      }
      setStats(typeStats);
      setNodeCount(nodes.length);
      setEdgeCount(edges.length);

      // D3 zoom with smooth transitions
      const zoomBehavior = d3.zoom()
        .scaleExtent([0.3, 5])
        .on('zoom', (event) => { transformRef.current = event.transform; });

      d3.select(canvas)
        .call(zoomBehavior)
        .on('dblclick.zoom', () => {
          d3.select(canvas).transition().duration(400).ease(d3.easeCubicOut)
            .call(zoomBehavior.transform, d3.zoomIdentity);
        });

      // Mouse
      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const found = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
        const newId = found ? found.id : null;
        if (newId !== hoverRef.current) {
          prevHoverRef.current = hoverRef.current;
          hoverRef.current = newId;
          if (!newId) edgeFadeRef.current = edgeFadeRef.current;
        }
        canvas.style.cursor = found ? 'pointer' : 'grab';
      });

      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const found = findNodeAt(e.clientX - rect.left, e.clientY - rect.top);
        if (found && !found.isHub) {
          selectedIdRef.current = found.id;
          setSelectedNode({
            ...found,
            similar: edges
              .filter(ed => ed.source.id === found.id || ed.target.id === found.id)
              .slice(0, 4)
              .map(ed => {
                const otherId = ed.source.id === found.id ? ed.target.id : ed.source.id;
                const other = nodes.find(nn => nn.id === otherId);
                return other
                  ? { id: other.id, title: other.title, type: other.type, edgeType: ed.edgeType }
                  : null;
              })
              .filter(Boolean),
          });
        } else {
          selectedIdRef.current = null;
          setSelectedNode(null);
        }
      });

      // Keyboard
      function onKeyDown(e) {
        if (e.key === 'Escape') {
          selectedIdRef.current = null;
          setSelectedNode(null);
        }
      }
      document.addEventListener('keydown', onKeyDown);

      setLoading(false);

      return () => {
        document.removeEventListener('keydown', onKeyDown);
      };
    }

    const cleanup = init();

    return () => {
      cancelled = true;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (cleanup && typeof cleanup.then === 'function') {
        cleanup.then(fn => fn && fn());
      }
    };
  }, [draw, findNodeAt]);

  // Handle resize
  useEffect(() => {
    function onResize() {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight || 600;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvasDims.current = { w: W, h: H };
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Stats bar */}
      <div className="grid grid-cols-7 gap-2">
        {ALL_TYPES.map(type => {
          const s = stats[type] || { count: 0, trend: 'flat' };
          const color = TYPE_COLORS[type];
          const isActive = activeFilter === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveFilter(activeFilter === type ? null : type)}
              className={`group flex flex-col gap-1 rounded-md border p-2.5 text-left transition-all duration-200 ${
                isActive
                  ? 'border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.04)]'
                  : 'border-[var(--nexus-border)] bg-transparent hover:border-[rgba(255,255,255,0.08)]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full transition-shadow duration-200"
                  style={{
                    background: color,
                    boxShadow: isActive ? `0 0 6px ${color}` : 'none',
                  }}
                />
                <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--nexus-text-3)]">
                  {TYPE_LABELS[type]}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className="font-mono text-[18px] font-semibold transition-colors duration-200"
                  style={{ color: isActive ? color : 'var(--nexus-text-1)' }}
                >
                  {s.count}
                </span>
                {s.trend === 'up' && (
                  <span className="text-[9px] text-red-400">+&#9650;</span>
                )}
                {s.trend === 'down' && (
                  <span className="text-[9px] text-emerald-400">&#9660;</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter pills + search + meta */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveFilter(null)}
          className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all duration-200 ${
            !activeFilter
              ? 'bg-[rgba(255,255,255,0.08)] text-[var(--nexus-text-1)]'
              : 'bg-transparent text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-2)]'
          }`}
        >
          All
        </button>
        {ALL_TYPES.filter(t => t !== 'other').map(type => {
          const color = TYPE_COLORS[type];
          const isActive = activeFilter === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveFilter(isActive ? null : type)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200"
              style={{
                background: isActive ? `${color}18` : 'transparent',
                color: isActive ? color : 'var(--nexus-text-3)',
                borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
              }}
            >
              {TYPE_LABELS[type]}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 rounded-md border border-[var(--nexus-border)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5 transition-colors focus-within:border-[rgba(56,189,248,0.4)]">
          <Search size={12} className="text-[var(--nexus-text-3)]" />
          <input
            type="text"
            placeholder="Search incidents…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-44 bg-transparent text-[11px] text-[var(--nexus-text-1)] outline-none placeholder:text-[var(--nexus-text-3)]"
          />
          {searchTerm && (
            <button type="button" onClick={() => setSearchTerm('')}>
              <X size={11} className="text-[var(--nexus-text-3)] hover:text-[var(--nexus-text-1)]" />
            </button>
          )}
        </div>
      </div>

      {/* Canvas + detail panel */}
      <div className="relative flex gap-0">
        <div
          ref={wrapRef}
          className="relative flex-1 overflow-hidden rounded-lg border border-[var(--nexus-border)]"
          style={{ height: 640, background: '#05070b' }}
        >
          <canvas ref={canvasRef} className="block h-full w-full" />

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 size={20} className="animate-spin text-[var(--nexus-text-3)]" />
              <span className="text-[12px] text-[var(--nexus-text-3)]">
                Loading knowledge graph...
              </span>
            </div>
          )}

          {!loading && (
            <div
              className="absolute bottom-4 left-4 flex flex-col gap-2 rounded-lg border border-[rgba(255,255,255,0.06)] px-3 py-2.5 backdrop-blur-md"
              style={{ background: 'linear-gradient(145deg, rgba(15,23,42,0.85), rgba(8,12,20,0.7))' }}
            >
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--nexus-text-3)]">
                Legend
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {ALL_TYPES.filter(tp => tp !== 'other').map(type => (
                  <div key={type} className="flex items-center gap-1.5">
                    <span
                      className="h-[7px] w-[7px] rounded-full"
                      style={{
                        background: TYPE_COLORS[type],
                        boxShadow: `0 0 6px ${TYPE_COLORS[type]}55`,
                      }}
                    />
                    <span className="text-[10px] text-[var(--nexus-text-2)]">
                      {TYPE_LABELS[type]}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-[8px] w-[8px] rotate-45 bg-white/95"
                    style={{ boxShadow: '0 0 6px rgba(56,189,248,0.6)' }}
                  />
                  <span className="text-[10px] text-[var(--nexus-text-2)]">Hub</span>
                </div>
              </div>
            </div>
          )}

          {!loading && (
            <div
              className="absolute right-4 top-4 flex flex-col gap-2 rounded-lg border border-[rgba(255,255,255,0.06)] px-3.5 py-3 backdrop-blur-md"
              style={{ background: 'linear-gradient(145deg, rgba(15,23,42,0.85), rgba(8,12,20,0.7))' }}
            >
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--nexus-text-3)]">
                <Sparkles size={10} className="text-emerald-400" />
                Knowledge Constellation
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="font-mono text-[16px] font-bold text-[var(--nexus-text-1)]">
                    {nodeCount}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-[var(--nexus-text-3)]">
                    Vectors
                  </span>
                </div>
                <div className="h-7 w-px bg-[rgba(255,255,255,0.08)]" />
                <div className="flex flex-col">
                  <span className="font-mono text-[16px] font-bold text-[var(--nexus-text-1)]">
                    {edgeCount}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-[var(--nexus-text-3)]">
                    Edges
                  </span>
                </div>
                <div className="h-7 w-px bg-[rgba(255,255,255,0.08)]" />
                <div className="flex flex-col">
                  <span className="font-mono text-[16px] font-bold text-[#38bdf8]">
                    {HUB_NAMES.length}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-[var(--nexus-text-3)]">
                    Hubs
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Keyboard hint */}
          {!loading && selectedNode && (
            <div className="absolute left-3 top-3 rounded-md bg-[rgba(12,15,22,0.85)] px-2 py-1 text-[9px] text-[var(--nexus-text-3)] backdrop-blur-sm">
              ESC to deselect
            </div>
          )}
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="shrink-0 overflow-hidden rounded-r-lg border border-l-0 border-[var(--nexus-border)] bg-[var(--nexus-surface)]"
              style={{ height: 640 }}
            >
              <div className="flex h-full w-[300px] flex-col">
                <div className="flex items-start justify-between border-b border-[var(--nexus-border)] p-4">
                  <div className="flex-1 pr-2">
                    <p className="text-[13px] font-semibold leading-tight text-[var(--nexus-text-1)]">
                      {selectedNode.title || `INC-${selectedNode.id.slice(-6).toUpperCase()}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className="rounded px-2 py-0.5 text-[9px] font-medium uppercase"
                        style={{
                          background: `${TYPE_COLORS[selectedNode.type]}12`,
                          color: TYPE_COLORS[selectedNode.type],
                        }}
                      >
                        {TYPE_LABELS[selectedNode.type]}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 text-[9px] font-medium uppercase"
                        style={{
                          background: selectedNode.status === 'RESOLVED'
                            ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                          color: selectedNode.status === 'RESOLVED'
                            ? '#10b981' : '#f59e0b',
                        }}
                      >
                        {selectedNode.status}
                      </span>
                      {selectedNode.severity && (
                        <span
                          className="rounded px-2 py-0.5 text-[9px] font-medium uppercase"
                          style={{
                            background: `${SEVERITY_COLORS[selectedNode.severity] || '#64748b'}12`,
                            color: SEVERITY_COLORS[selectedNode.severity] || '#64748b',
                          }}
                        >
                          {selectedNode.severity}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedNode(null); selectedIdRef.current = null; }}
                    className="flex h-6 w-6 items-center justify-center rounded text-[var(--nexus-text-3)] transition-colors hover:text-[var(--nexus-text-1)]"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {/* Confidence */}
                  <div className="mb-4">
                    <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-[var(--nexus-text-3)]">
                      <Sparkles size={10} /> Confidence
                    </p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.04)]">
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round((selectedNode.confidence || 0) * 100)}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        style={{ background: TYPE_COLORS[selectedNode.type] }}
                      />
                    </div>
                    <p className="mt-1 text-right font-mono text-[11px] text-[var(--nexus-text-2)]">
                      {Math.round((selectedNode.confidence || 0) * 100)}%
                    </p>
                  </div>

                  {/* Meta */}
                  <div className="mb-4 flex flex-col gap-2">
                    {selectedNode.location && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--nexus-text-2)]">
                        <MapPin size={11} className="text-[var(--nexus-text-3)]" />
                        {selectedNode.location}
                      </div>
                    )}
                    {selectedNode.createdAt && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--nexus-text-2)]">
                        <Clock size={11} className="text-[var(--nexus-text-3)]" />
                        {timeAgo(selectedNode.createdAt)}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--nexus-text-2)]">
                      <Network size={11} className="text-[var(--nexus-text-3)]" />
                      {selectedNode.connCount || 0} connections
                    </div>
                  </div>

                  {/* Similar incidents */}
                  {selectedNode.similar?.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--nexus-text-3)]">
                        Connected Incidents
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {selectedNode.similar.map(s => (
                          <div
                            key={s.id}
                            className="flex items-center gap-2 rounded border border-[var(--nexus-border)] p-2 transition-colors hover:border-[rgba(255,255,255,0.1)]"
                          >
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: TYPE_COLORS[s.type] }}
                            />
                            <span className="flex-1 truncate text-[10px] text-[var(--nexus-text-2)]">
                              {s.title || `INC-${s.id.slice(-6).toUpperCase()}`}
                            </span>
                            {s.edgeType && (
                              <span className="rounded bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[8px] uppercase text-[var(--nexus-text-3)]">
                                {s.edgeType === 'resolved_by' ? 'resolved' : s.edgeType}
                              </span>
                            )}
                            <ChevronRight size={10} className="text-[var(--nexus-text-3)]" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <a
                    href={`/board?highlight=${selectedNode.id}`}
                    className="flex items-center justify-center gap-1.5 rounded border border-[var(--nexus-border)] py-2 text-[11px] font-medium text-[var(--nexus-text-2)] transition-colors hover:border-[rgba(255,255,255,0.15)] hover:text-[var(--nexus-text-1)]"
                  >
                    <ExternalLink size={11} />
                    View in Board
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
