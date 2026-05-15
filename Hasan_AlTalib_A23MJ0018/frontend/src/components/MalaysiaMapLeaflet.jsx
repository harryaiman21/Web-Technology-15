"use client";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapContainer, TileLayer, Marker, Polyline, SVGOverlay, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useTheme } from "next-themes";
import { queryIntelligence } from "@/lib/api";
import { useView } from "@/context/ViewContext";
import {
  Search,
  Sparkles,
  X,
  Volume2,
  Sun,
  Moon,
  AlertTriangle,
  Activity,
  Clock,
  Layers,
  Zap,
  Radio,
  ChevronRight
} from "lucide-react";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png"
});
const LOCATIONS = [
  { name: "Penang Hub", lat: 5.3541, lng: 100.4296, region: "North" },
  { name: "Shah Alam Hub", lat: 3.0733, lng: 101.5185, region: "Central" },
  { name: "Subang Jaya Depot", lat: 3.0456, lng: 101.581, region: "Central" },
  { name: "KLIA Cargo", lat: 2.7456, lng: 101.7072, region: "South Central" },
  { name: "JB Distribution", lat: 1.4927, lng: 103.7414, region: "South" }
];
const HUB_CONNECTIONS = [
  { from: "Penang Hub", to: "Shah Alam Hub" },
  { from: "Shah Alam Hub", to: "Subang Jaya Depot" },
  { from: "Subang Jaya Depot", to: "KLIA Cargo" },
  { from: "KLIA Cargo", to: "JB Distribution" },
  { from: "Shah Alam Hub", to: "KLIA Cargo" }
];
const SAMPLE_QUERIES = [
  "Is everything OK at our hubs today?",
  "Show me critical incidents at Shah Alam",
  "What's the SLA status across all hubs?",
  "Are there any cascade risks right now?"
];
const MAP_CENTER = [3.8, 101.5];
const MAP_BOUNDS = [
  [1.2, 99.6],
  // Southwest - tighter
  [6.8, 104.3]
  // Northeast - tighter
];
const DEFAULT_ZOOM = 7.5;
const MIN_ZOOM = 6;
const MAX_ZOOM = 14;
const ZOOM_SCALE_CONFIG = {
  minZoom: 6,
  maxZoom: 14,
  minRadius: 8,
  maxRadius: 40,
  minGlow: 4,
  maxGlow: 20
};
function getScaledRadius(baseCount, currentZoom) {
  const zoomFactor = (currentZoom - ZOOM_SCALE_CONFIG.minZoom) / (ZOOM_SCALE_CONFIG.maxZoom - ZOOM_SCALE_CONFIG.minZoom);
  const clampedZoomFactor = Math.max(0, Math.min(1, zoomFactor));
  const baseRadius = ZOOM_SCALE_CONFIG.minRadius + (ZOOM_SCALE_CONFIG.maxRadius - ZOOM_SCALE_CONFIG.minRadius) * clampedZoomFactor;
  const countFactor = Math.min(1, baseCount / 10);
  return baseRadius * (0.7 + countFactor * 0.3);
}
function getScaledGlow(currentZoom) {
  const zoomFactor = (currentZoom - ZOOM_SCALE_CONFIG.minZoom) / (ZOOM_SCALE_CONFIG.maxZoom - ZOOM_SCALE_CONFIG.minZoom);
  const clampedZoomFactor = Math.max(0, Math.min(1, zoomFactor));
  return ZOOM_SCALE_CONFIG.minGlow + (ZOOM_SCALE_CONFIG.maxGlow - ZOOM_SCALE_CONFIG.minGlow) * clampedZoomFactor;
}
function getAlertLevel(count, hasCluster, cascadeInfo, intelligenceLevel) {
  if (intelligenceLevel === "critical" || hasCluster) return "critical";
  if (intelligenceLevel === "danger") return "danger";
  if (intelligenceLevel === "warning" || cascadeInfo?.riskLevel === "high") return "warning";
  if (count >= 8) return "high";
  if (count >= 4) return "medium";
  return "normal";
}
function getAlertColor(level, isDark) {
  const colors = {
    critical: { dark: "#ef4444", light: "#dc2626" },
    danger: { dark: "#f87171", light: "#ef4444" },
    warning: { dark: "#f59e0b", light: "#d97706" },
    high: { dark: "#f87171", light: "#ef4444" },
    medium: { dark: "#fbbf24", light: "#f59e0b" },
    normal: { dark: "#FFCC00", light: "#0891b2" }
  };
  return isDark ? colors[level].dark : colors[level].light;
}
function buildCascadeIndex(cascadeRisk = []) {
  const index = /* @__PURE__ */ new Map();
  for (const prediction of cascadeRisk) {
    for (const edge of prediction.downstream || []) {
      const existing = index.get(edge.hub);
      const riskOrder = { high: 2, medium: 1, low: 0 };
      if (!existing || (riskOrder[edge.riskLevel] ?? 0) > (riskOrder[existing.riskLevel ?? ""] ?? 0)) {
        index.set(edge.hub, {
          riskLevel: edge.riskLevel,
          estimatedImpactTime: edge.estimatedImpactTime,
          recommendation: prediction.recommendation,
          sourceHub: prediction.sourceHub
        });
      }
    }
  }
  return index;
}
function useZoomLevel() {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const map = useMapEvents({
    zoom: () => setZoom(map.getZoom()),
    zoomend: () => setZoom(map.getZoom())
  });
  useEffect(() => {
    setZoom(map.getZoom());
  }, [map]);
  return zoom;
}
function MapFlyTo({
  focusHub,
  flyTrigger,
  hasAlerts
}) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (focusHub) {
      const location = LOCATIONS.find((l) => l.name === focusHub);
      if (location) {
        map.flyTo([location.lat, location.lng], 10, {
          duration: 1.5,
          easeLinearity: 0.25
        });
        const PANEL_WIDTH_PX = 340;
        const timer = setTimeout(() => {
          const size = map.getSize();
          const offsetX = Math.round((size.x / 2 - PANEL_WIDTH_PX / 2) * 0.4);
          map.panBy([-offsetX, 0], { animate: true, duration: 0.5 });
        }, 1600);
        return () => clearTimeout(timer);
      }
    } else if (!hasAlerts) {
      map.flyToBounds(MAP_BOUNDS, {
        duration: 1,
        padding: [50, 50]
      });
    }
  }, [flyTrigger, map]);
  return null;
}
function MapInteractionControl() {
  const map = useMap();
  const [userInteracted, setUserInteracted] = useState(false);
  useEffect(() => {
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    const enableInteractions = () => {
      if (!userInteracted) {
        setUserInteracted(true);
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
        map.boxZoom.enable();
        map.keyboard.enable();
      }
    };
    map.on("dblclick", enableInteractions);
    map.on("contextmenu", enableInteractions);
    return () => {
      map.off("dblclick", enableInteractions);
      map.off("contextmenu", enableInteractions);
    };
  }, [map, userInteracted]);
  return null;
}
function ZoomLevelProvider({ onZoomChange }) {
  const zoom = useZoomLevel();
  useEffect(() => {
    onZoomChange(zoom);
  }, [zoom, onZoomChange]);
  return null;
}
function DataFlowParticles({ isDark }) {
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((prev) => {
        const updated = prev.map((p) => ({ ...p, progress: p.progress + 0.012 })).filter((p) => p.progress < 1);
        if (Math.random() > 0.7 && updated.length < 8) {
          const connection = HUB_CONNECTIONS[Math.floor(Math.random() * HUB_CONNECTIONS.length)];
          const from = LOCATIONS.find((l) => l.name === connection.from);
          const to = LOCATIONS.find((l) => l.name === connection.to);
          if (from && to) {
            updated.push({
              id: Date.now() + Math.random(),
              fromLat: from.lat,
              fromLng: from.lng,
              toLat: to.lat,
              toLng: to.lng,
              progress: 0
            });
          }
        }
        return updated;
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);
  const particleColor = isDark ? "#FFCC00" : "#0891b2";
  return <SVGOverlay bounds={MAP_BOUNDS}>
      <defs>
        <filter id="particle-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feFlood floodColor={particleColor} floodOpacity="0.8" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="particle-trail" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={particleColor} stopOpacity="0" />
          <stop offset="100%" stopColor={particleColor} stopOpacity="1" />
        </linearGradient>
      </defs>
      {particles.map((p) => {
    const lat = p.fromLat + (p.toLat - p.fromLat) * p.progress;
    const lng = p.fromLng + (p.toLng - p.fromLng) * p.progress;
    const x = (lng - MAP_BOUNDS[0][1]) / (MAP_BOUNDS[1][1] - MAP_BOUNDS[0][1]) * 100;
    const y = 100 - (lat - MAP_BOUNDS[0][0]) / (MAP_BOUNDS[1][0] - MAP_BOUNDS[0][0]) * 100;
    const opacity = Math.sin(p.progress * Math.PI);
    return <g key={p.id}>
            <circle
      cx={`${x}%`}
      cy={`${y}%`}
      r="4"
      fill={particleColor}
      filter="url(#particle-glow)"
      style={{ opacity }}
    />
          </g>;
  })}
    </SVGOverlay>;
}
function HubMarkerOverlay({
  location,
  count,
  alertLevel,
  isSelected,
  isFocused,
  onClick,
  onHover,
  currentZoom,
  isDark
}) {
  const color = getAlertColor(alertLevel, isDark);
  const radius = getScaledRadius(count, currentZoom);
  const glowSize = getScaledGlow(currentZoom);
  const isCritical = alertLevel === "critical" || alertLevel === "danger";
  const isWarning = alertLevel === "warning" || alertLevel === "high";
  const showDetails = currentZoom >= 9;
  const icon = useMemo(() => {
    const size = radius * 2 + glowSize * 2 + 8;
    return L.divIcon({
      className: "nexus-hub-marker",
      iconSize: [size, size + (showDetails ? 20 : 8)],
      iconAnchor: [size / 2, size / 2],
      html: `<div id="hub-${location.name.replace(/\s/g, "-")}"></div>`
    });
  }, [location.name, radius, glowSize, showDetails]);
  useEffect(() => {
    const el = document.getElementById(`hub-${location.name.replace(/\s/g, "-")}`);
    if (el) {
      const containerSize = radius * 2 + glowSize * 2 + 8;
      const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.9)";
      const shadowColor = isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)";
      const labelDisplay = currentZoom >= 8 ? "block" : "none";
      const fontSize = Math.max(10, Math.min(14, radius / 2.5));
      el.innerHTML = `
        <div class="nexus-hub-container" style="
          width: ${containerSize}px;
          height: ${containerSize + (showDetails ? 20 : 8)}px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
        ">
          ${isCritical ? `
            <div class="nexus-pulse-ring" style="
              position: absolute;
              width: ${radius * 2 + glowSize}px;
              height: ${radius * 2 + glowSize}px;
              border-radius: 50%;
              border: 2px solid ${color};
              animation: nexus-pulse-expand 2s ease-out infinite;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            "></div>
            <div class="nexus-pulse-ring" style="
              position: absolute;
              width: ${radius * 2 + glowSize}px;
              height: ${radius * 2 + glowSize}px;
              border-radius: 50%;
              border: 2px solid ${color};
              animation: nexus-pulse-expand 2s ease-out infinite;
              animation-delay: 1s;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            "></div>
          ` : ""}
          <div class="nexus-hub-glow" style="
            position: absolute;
            width: ${radius * 2 + glowSize}px;
            height: ${radius * 2 + glowSize}px;
            border-radius: 50%;
            background: ${color};
            opacity: ${isCritical ? 0.35 : 0.2};
            filter: blur(${glowSize / 2}px);
            animation: nexus-breathe 3s ease-in-out infinite;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
          "></div>
          ${showDetails ? `
            <div class="nexus-hub-outer" style="
              position: absolute;
              width: ${radius * 2 + 6}px;
              height: ${radius * 2 + 6}px;
              border-radius: 50%;
              border: 1.5px solid ${color};
              opacity: 0.5;
              animation: ${isCritical ? "nexus-critical-ring 1.5s ease-in-out infinite" : "nexus-breathe 4s ease-in-out infinite"};
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            "></div>
          ` : ""}
          <div class="nexus-hub-main" style="
            width: ${radius * 2}px;
            height: ${radius * 2}px;
            border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, ${color}${isDark ? "ee" : "dd"}, ${color}${isDark ? "aa" : "99"});
            border: ${Math.max(1.5, radius / 12)}px solid ${isDark ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,1)"};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 ${glowSize}px ${color}80, inset 0 0 ${glowSize / 2}px rgba(255,255,255,0.15);
            cursor: pointer;
            transition: transform 0.2s ease;
            ${isSelected || isFocused ? "transform: scale(1.15);" : ""}
            ${isCritical ? "animation: nexus-critical-pulse 1.5s ease-in-out infinite;" : ""}
          ">
            <span style="
              color: white;
              font-weight: 800;
              font-size: ${fontSize}px;
              font-family: ui-monospace, monospace;
              text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            ">${count}</span>
          </div>
          <span style="
            display: ${labelDisplay};
            margin-top: 4px;
            color: ${textColor};
            font-size: ${Math.max(8, Math.min(10, radius / 3))}px;
            font-weight: 600;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            text-shadow: 0 1px 3px ${shadowColor};
            white-space: nowrap;
          ">${location.name.replace(" Hub", "").replace(" Depot", "").replace(" Cargo", "").replace(" Distribution", "").toUpperCase()}</span>
        </div>
      `;
    }
  }, [location.name, count, alertLevel, isSelected, isFocused, currentZoom, isDark, color, radius, glowSize, isCritical, showDetails]);
  return <Marker
    position={[location.lat, location.lng]}
    icon={icon}
    eventHandlers={{
      click: onClick,
      mouseover: () => onHover(location),
      mouseout: () => onHover(null)
    }}
  />;
}
function ConnectionLines({
  alertByHub,
  isDark
}) {
  return <>
      {HUB_CONNECTIONS.map(({ from, to }) => {
    const fromLoc = LOCATIONS.find((l) => l.name === from);
    const toLoc = LOCATIONS.find((l) => l.name === to);
    if (!fromLoc || !toLoc) return null;
    const fromAlert = alertByHub.get(from);
    const toAlert = alertByHub.get(to);
    const isCriticalRoute = fromAlert === "critical" || toAlert === "critical";
    const isWarningRoute = fromAlert === "warning" || toAlert === "warning";
    const color = isCriticalRoute ? isDark ? "#ef4444" : "#dc2626" : isWarningRoute ? isDark ? "#f59e0b" : "#d97706" : isDark ? "#FFCC00" : "#0891b2";
    return <Polyline
      key={`${from}-${to}`}
      positions={[
        [fromLoc.lat, fromLoc.lng],
        [toLoc.lat, toLoc.lng]
      ]}
      pathOptions={{
        color,
        weight: 2,
        opacity: isDark ? 0.4 : 0.5,
        dashArray: "8, 8",
        lineCap: "round"
      }}
    />;
  })}
    </>;
}
function IncidentSummaryCard({
  hub,
  incidentCount,
  alertLevel,
  clusterInfo,
  cascadeInfo,
  onClose,
  onViewDetails,
  isDark
}) {
  const color = getAlertColor(alertLevel, isDark);
  const bgColor = isDark ? "rgba(17, 24, 39, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const borderColor = isDark ? "rgba(99, 102, 241, 0.3)" : "rgba(99, 102, 241, 0.2)";
  const textPrimary = isDark ? "#f8fafc" : "#0f0f0f";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const textMuted = isDark ? "#64748b" : "#94a3b8";
  const isCritical = alertLevel === "critical" || alertLevel === "danger";
  const hasCluster = !!clusterInfo;
  const hasCascadeRisk = cascadeInfo?.riskLevel === "high";
  return <motion.div
    initial={{ opacity: 0, x: 48 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 48 }}
    transition={{
      type: "spring",
      stiffness: 260,
      damping: 28,
      delay: 0.8
    }}
    className="absolute right-4 top-4 z-[1003]"
    style={{ width: "300px" }}
  >
      
      <div
    className="overflow-hidden rounded-xl backdrop-blur-xl"
    style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      boxShadow: isDark ? `0 0 40px rgba(6, 182, 212, 0.15), 0 0 80px ${color}20, 0 25px 50px rgba(0,0,0,0.5)` : `0 0 40px rgba(99, 102, 241, 0.1), 0 0 80px ${color}15, 0 25px 50px rgba(0,0,0,0.15)`
    }}
  >
        {
    /* Accent top bar — animates in after the card */
  }
        <motion.div
    initial={{ scaleX: 0 }}
    animate={{ scaleX: 1 }}
    transition={{ delay: 1, duration: 0.45, ease: "easeOut" }}
    className="h-0.5 origin-left"
    style={{ background: `linear-gradient(to right, ${color}, transparent)` }}
  />
        {
    /* Header with glow */
  }
        <div
    className="relative px-5 py-4"
    style={{
      borderBottom: `1px solid ${borderColor}`,
      background: `linear-gradient(135deg, ${color}15 0%, transparent 50%)`
    }}
  >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
    className="flex h-10 w-10 items-center justify-center rounded-lg"
    style={{
      background: `linear-gradient(135deg, ${color}30 0%, ${color}10 100%)`,
      boxShadow: `0 0 20px ${color}30`
    }}
  >
                <Activity className="h-5 w-5" style={{ color }} />
              </div>
              <div>
                <h3 className="font-bold" style={{ color: textPrimary }}>
                  {hub.name}
                </h3>
                <p className="text-xs" style={{ color: textSecondary }}>
                  {hub.region} Region
                </p>
              </div>
            </div>
            <button
    onClick={onClose}
    className="rounded-lg p-2 transition-colors hover:bg-white/10"
    style={{ color: textSecondary }}
  >
              <X className="h-4 w-4" />
            </button>
          </div>

          {
    /* Alert badge */
  }
          {isCritical && <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: 1.1, duration: 0.3 }}
    className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
    style={{
      background: `${color}20`,
      border: `1px solid ${color}40`
    }}
  >
              <AlertTriangle className="h-4 w-4" style={{ color }} />
              <span className="text-xs font-semibold" style={{ color }}>
                Critical Status - Immediate Attention Required
              </span>
            </motion.div>}
        </div>

        {
    /* Stats grid */
  }
        <div className="grid grid-cols-3 gap-3 p-4">
          <div className="text-center">
            <div
    className="mb-1 text-2xl font-bold"
    style={{ color: isCritical ? color : textPrimary }}
  >
              {incidentCount}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: textMuted }}>
              Incidents
            </div>
          </div>
          <div className="text-center">
            <div
    className="mb-1 text-2xl font-bold"
    style={{ color: hasCascadeRisk ? "#f59e0b" : textPrimary }}
  >
              {hasCascadeRisk ? "HIGH" : "LOW"}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: textMuted }}>
              SLA Risk
            </div>
          </div>
          <div className="text-center">
            <div
    className="mb-1 text-2xl font-bold"
    style={{ color: hasCluster ? "#f59e0b" : textPrimary }}
  >
              {hasCluster ? "ACTIVE" : "NONE"}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: textMuted }}>
              Clusters
            </div>
          </div>
        </div>

        {
    /* Cascade risk info */
  }
        {cascadeInfo && <div
    className="mx-4 mb-4 rounded-lg p-3"
    style={{
      background: isDark ? "rgba(249, 115, 22, 0.1)" : "rgba(249, 115, 22, 0.08)",
      border: "1px solid rgba(249, 115, 22, 0.3)"
    }}
  >
            <div className="flex items-center gap-2 text-xs font-semibold text-orange-500">
              <Zap className="h-3 w-3" />
              Cascade Risk from {cascadeInfo.sourceHub}
            </div>
            {cascadeInfo.recommendation && <p className="mt-1 text-xs" style={{ color: textSecondary }}>
                {cascadeInfo.recommendation}
              </p>}
          </div>}

        {
    /* Footer */
  }
        <div
    className="flex items-center justify-between px-4 py-3"
    style={{
      background: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)",
      borderTop: `1px solid ${borderColor}`
    }}
  >
          <div className="flex items-center gap-2 text-xs" style={{ color: textMuted }}>
            <Clock className="h-3 w-3" />
            Updated just now
          </div>
          <button
    onClick={onViewDetails}
    className="flex items-center gap-1 text-xs font-semibold transition-colors hover:underline"
    style={{ color: isDark ? "#FFCC00" : "#0891b2", cursor: "pointer" }}
  >
            View Details
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </motion.div>;
}
function MalaysiaMap({
  byLocation = {},
  byType = {},
  clusters = [],
  cascadeRisk = []
}) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const mapRef = useRef(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [queryText, setQueryText] = useState("");
  const [querying, setQuerying] = useState(false);
  const [answer, setAnswer] = useState("");
  const [hubAlerts, setHubAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [queryError, setQueryError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const [hoveredHub, setHoveredHub] = useState(null);
  const [selectedHub, setSelectedHub] = useState(null);
  const [showSummaryCard, setShowSummaryCard] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark = mounted ? resolvedTheme === "dark" : true;
  const clusterByLocation = new Map(
    clusters.filter((c) => c.location).map((c) => [c.location, c])
  );
  const cascadeIndex = buildCascadeIndex(cascadeRisk);
  const alertByHub = useMemo(
    () => new Map(hubAlerts.map((a) => [a.hub, a.alertLevel])),
    [hubAlerts]
  );
  const focusHub = useMemo(() => {
    // 1. Force focus if the query or the AI explicitly names a hub
    const textToSearch = (queryText + ' ' + answer).toLowerCase();
    if (textToSearch.includes('shah alam')) return 'Shah Alam Hub';
    if (textToSearch.includes('klia')) return 'KLIA Cargo';
    if (textToSearch.includes('penang')) return 'Penang Hub';
    if (textToSearch.includes('subang')) return 'Subang Jaya Depot';
    if (textToSearch.includes('jb') || textToSearch.includes('johor')) return 'JB Distribution';

    // 2. Fallback: focus on the hub with the highest active alert
    const priorityOrder = { critical: 3, danger: 2, warning: 1, high: 2, medium: 1, info: 0 };
    let best = null;
    let bestPriority = -1;
    for (const [hub, level] of alertByHub.entries()) {
      const p = priorityOrder[level] ?? -1;
      if (p > bestPriority) {
        bestPriority = p;
        best = hub;
      }
    }
    return best;
  }, [alertByHub, queryText, answer]);
  useEffect(() => {
    if (focusHub) {
      setSelectedHub(focusHub);
      setShowSummaryCard(true);
    } else {
      setShowSummaryCard(false);
      setSelectedHub(null);
    }
  }, [focusHub, flyTrigger]);
  function speakAnswer(text) {
    if ("speechSynthesis" in window && text) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }
  async function handleQuery(customQuery) {
    const q = customQuery || queryText.trim();
    if (!q || querying) return;
    setQuerying(true);
    setAnswer("");
    setQueryError("");
    setHubAlerts([]);
    setStats(null);
    setShowSummaryCard(false);
    try {
      const result = await queryIntelligence(q);
      setAnswer(result.answer || "");
      setHubAlerts(result.hubAlerts || []);
      setStats(result.stats || null);
      setFlyTrigger((n) => n + 1);
      if (result.answer) {
        speakAnswer(result.answer);
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setQuerying(false);
    }
  }
  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  }
  function clearQuery() {
    setQueryText("");
    setAnswer("");
    setHubAlerts([]);
    setStats(null);
    setQueryError("");
    setShowSummaryCard(false);
    setSelectedHub(null);
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }
  const handleZoomChange = useCallback((zoom) => {
    setCurrentZoom(zoom);
  }, []);
  const focusedHubData = focusHub ? LOCATIONS.find((l) => l.name === focusHub) : null;
  const focusedHubCount = focusHub ? Number(byLocation[focusHub] || 0) : 0;
  const focusedHubCluster = focusHub ? clusterByLocation.get(focusHub) : null;
  const focusedHubCascade = focusHub ? cascadeIndex.get(focusHub) : null;
  const focusedHubAlertLevel = focusHub ? getAlertLevel(
    focusedHubCount,
    Boolean(focusedHubCluster),
    focusedHubCascade ?? null,
    alertByHub.get(focusHub)
  ) : "normal";
  const navigate = useNavigate();
  const { switchToHub } = useView();

  const bgPrimary = isDark ? "#030712" : "#ffffff";
  const bgSecondary = isDark ? "#111827" : "#f8fafc";
  const bgTertiary = isDark ? "#0a0f1a" : "#f1f5f9";
  const borderColor = isDark ? "rgba(99, 102, 241, 0.2)" : "rgba(99, 102, 241, 0.15)";
  const textPrimary = isDark ? "#f8fafc" : "#0f0f0f";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const textMuted = isDark ? "#64748b" : "#94a3b8";
  const accentCyan = isDark ? "#FFCC00" : "#0891b2";
  const accentRed = isDark ? "#ef4444" : "#dc2626";
  const accentAmber = isDark ? "#f59e0b" : "#d97706";
  if (!mounted) {
    return <div className="flex h-[700px] items-center justify-center rounded-xl bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>;
  }
  return <div className="relative flex flex-col gap-5">
      {
    /* Header with theme toggle */
  }
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
    className="flex h-10 w-10 items-center justify-center rounded-xl"
    style={{
      background: `linear-gradient(135deg, ${accentRed}30 0%, ${accentRed}10 100%)`,
      boxShadow: `0 0 20px ${accentRed}20`
    }}
  >
            <Radio className="h-5 w-5" style={{ color: accentRed }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: textPrimary }}>
              Operations Command Centre
            </h2>
            <p className="text-xs" style={{ color: textSecondary }}>
              Real-time hub monitoring across Peninsular Malaysia
            </p>
          </div>
        </div>
        <button
    onClick={() => setTheme(isDark ? "light" : "dark")}
    className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
    style={{
      background: bgSecondary,
      border: `1px solid ${borderColor}`
    }}
  >
          {isDark ? <Sun className="h-5 w-5" style={{ color: textSecondary }} /> : <Moon className="h-5 w-5" style={{ color: textSecondary }} />}
        </button>
      </div>

      {
    /* Intelligence Search Bar */
  }
      <div className="space-y-4">
        <div className="flex gap-3">
          <div
    className="relative flex-1 overflow-hidden rounded-xl"
    style={{
      background: bgTertiary,
      border: `1px solid ${borderColor}`,
      boxShadow: isDark ? `0 0 30px ${accentCyan}08` : `0 0 30px ${accentCyan}05`
    }}
  >
            <div className="absolute inset-y-0 left-4 flex items-center">
              <Sparkles className="h-5 w-5" style={{ color: accentCyan }} />
            </div>
            <input
    ref={inputRef}
    type="text"
    value={queryText}
    onChange={(e) => setQueryText(e.target.value)}
    onKeyDown={handleKeyDown}
    placeholder='Ask NEXUS anything... e.g. "Is everything OK today?"'
    disabled={querying}
    className="h-14 w-full bg-transparent px-12 text-sm placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
    style={{ color: textPrimary }}
  />
            <div className="absolute inset-y-0 right-4 flex items-center gap-2">
              {isSpeaking && <motion.div
    animate={{ scale: [1, 1.2, 1] }}
    transition={{ duration: 0.5, repeat: Infinity }}
  >
                  <Volume2 className="h-4 w-4" style={{ color: accentCyan }} />
                </motion.div>}
              {querying ? <motion.div
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    className="h-5 w-5 rounded-full border-2 border-t-transparent"
    style={{ borderColor: accentRed }}
  /> : <Search className="h-5 w-5" style={{ color: textMuted }} />}
            </div>
          </div>
          <motion.button
    type="button"
    onClick={() => handleQuery()}
    disabled={querying || !queryText.trim()}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className="flex h-14 items-center gap-2 rounded-xl px-6 text-sm font-bold text-white disabled:opacity-50"
    style={{
      background: `linear-gradient(135deg, ${accentRed} 0%, ${isDark ? "#b91c1c" : "#dc2626"} 100%)`,
      boxShadow: `0 0 30px ${accentRed}40`
    }}
  >
            <Sparkles className="h-4 w-4" />
            Ask NEXUS
          </motion.button>
          {(answer || queryError) && <button
    type="button"
    onClick={clearQuery}
    className="flex h-14 items-center gap-2 rounded-xl px-4 text-xs transition-colors"
    style={{
      background: bgSecondary,
      border: `1px solid ${borderColor}`,
      color: textSecondary
    }}
  >
              <X className="h-4 w-4" />
              Clear
            </button>}
        </div>

        {
    /* Sample queries */
  }
        <AnimatePresence>
          {!answer && !queryError && <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="flex flex-wrap gap-2"
  >
              {SAMPLE_QUERIES.map((q) => <button
    key={q}
    type="button"
    onClick={() => {
      setQueryText(q);
      handleQuery(q);
    }}
    disabled={querying}
    className="rounded-full px-4 py-2 text-xs transition-all hover:scale-105 disabled:opacity-50"
    style={{
      background: bgSecondary,
      border: `1px solid ${borderColor}`,
      color: textSecondary
    }}
  >
                  {q}
                </button>)}
            </motion.div>}
        </AnimatePresence>

        {
    /* AI Response */
  }
        <AnimatePresence>
          {queryError && <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="rounded-xl p-4"
    style={{
      background: `linear-gradient(135deg, ${accentRed}15 0%, transparent 50%)`,
      border: `1px solid ${accentRed}40`
    }}
  >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" style={{ color: accentRed }} />
                <p className="text-sm" style={{ color: accentRed }}>
                  {queryError}
                </p>
              </div>
            </motion.div>}
          {answer && <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="overflow-hidden rounded-xl"
    style={{
      background: `linear-gradient(135deg, ${bgSecondary} 0%, ${bgTertiary} 100%)`,
      border: `1px solid ${accentRed}30`,
      boxShadow: `0 0 40px ${accentRed}10`
    }}
  >
              <div
    className="flex items-center gap-3 px-5 py-3"
    style={{ borderBottom: `1px solid ${borderColor}` }}
  >
                <div
    className="flex h-8 w-8 items-center justify-center rounded-lg"
    style={{ background: `${accentRed}20` }}
  >
                  <Sparkles className="h-4 w-4" style={{ color: accentRed }} />
                </div>
                <span
    className="text-xs font-bold uppercase tracking-widest"
    style={{ color: accentRed }}
  >
                  NEXUS Intelligence
                </span>
                {isSpeaking && <motion.div
    animate={{ scale: [1, 1.2, 1] }}
    transition={{ duration: 0.5, repeat: Infinity }}
    className="ml-auto flex items-center gap-1"
  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: accentRed }} />
                    <span className="h-2 w-1.5 rounded-full" style={{ background: accentRed }} />
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: accentRed }} />
                  </motion.div>}
              </div>
              <p className="px-5 py-4 text-sm leading-relaxed" style={{ color: textPrimary }}>
                {answer}
              </p>
            </motion.div>}
        </AnimatePresence>
      </div>

      {
    /* Stats Strip */
  }
      <AnimatePresence>
        {stats && <motion.div
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: "auto" }}
    exit={{ opacity: 0, height: 0 }}
    className="grid grid-cols-4 gap-3"
  >
            {[
    { label: "Active", value: stats.activeIncidents, color: accentRed, Icon: Activity },
    { label: "Clusters", value: stats.clustersActive, color: accentAmber, Icon: Layers },
    { label: "Near Breach", value: stats.slaAtRisk, color: accentRed, Icon: AlertTriangle },
    { label: "Msgs Sent", value: stats.recoveryMessagesSent, color: accentCyan, Icon: Zap }
  ].map(({ label, value, color, Icon }) => <motion.div
    key={label}
    initial={{ scale: 0.9, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="overflow-hidden rounded-xl p-4"
    style={{
      background: bgSecondary,
      border: `1px solid ${borderColor}`,
      boxShadow: `0 0 30px ${color}10`
    }}
  >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" style={{ color }} />
                  <p className="text-2xl font-bold" style={{ color }}>
                    {value}
                  </p>
                </div>
                <p
    className="mt-1 text-[10px] uppercase tracking-wider"
    style={{ color: textMuted }}
  >
                  {label}
                </p>
              </motion.div>)}
          </motion.div>}
      </AnimatePresence>

      {
    /* The Leaflet Map */
  }
      <div
    className="relative overflow-hidden rounded-2xl"
    style={{
      height: "550px",
      background: bgPrimary,
      border: `1px solid ${borderColor}`,
      boxShadow: isDark ? `0 0 80px ${accentCyan}08, inset 0 0 60px ${accentCyan}03` : `0 0 60px rgba(0,0,0,0.05)`
    }}
  >
        {
    /* Leaflet CSS and custom styles */
  }
        <style>{`
          @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
          
          .leaflet-container {
            background: ${bgPrimary} !important;
            font-family: inherit;
          }
          
          .leaflet-control-zoom {
            border: none !important;
            box-shadow: 0 0 20px ${isDark ? "rgba(6, 182, 212, 0.2)" : "rgba(99, 102, 241, 0.15)"} !important;
            border-radius: 12px !important;
            overflow: hidden;
          }
          
          .leaflet-control-zoom a {
            background: ${bgSecondary} !important;
            color: ${textSecondary} !important;
            border: 1px solid ${borderColor} !important;
            width: 36px !important;
            height: 36px !important;
            line-height: 36px !important;
            font-size: 16px !important;
          }
          
          .leaflet-control-zoom a:hover {
            background: ${isDark ? "#1f2937" : "#e2e8f0"} !important;
            color: ${textPrimary} !important;
          }
          
          .leaflet-control-zoom-in {
            border-radius: 12px 12px 0 0 !important;
          }
          
          .leaflet-control-zoom-out {
            border-radius: 0 0 12px 12px !important;
          }
          
          .nexus-hub-marker {
            background: transparent !important;
            border: none !important;
          }
          
          @keyframes nexus-pulse-expand {
            0% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.6;
            }
            100% {
              transform: translate(-50%, -50%) scale(2);
              opacity: 0;
            }
          }
          
          @keyframes nexus-breathe {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.3;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.08);
              opacity: 0.5;
            }
          }
          
          @keyframes nexus-critical-pulse {
            0%, 100% {
              box-shadow: 0 0 15px ${accentRed}60, inset 0 0 10px rgba(255,255,255,0.15);
            }
            50% {
              box-shadow: 0 0 30px ${accentRed}90, 0 0 50px ${accentRed}40, inset 0 0 10px rgba(255,255,255,0.15);
            }
          }
          
          @keyframes nexus-critical-ring {
            0%, 100% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.4;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.15);
              opacity: 0.7;
            }
          }
          
          .leaflet-tile-pane {
            filter: ${isDark ? "saturate(0.7) brightness(0.9)" : "saturate(0.9) brightness(1.02)"};
          }
          
          .leaflet-attribution {
            background: ${isDark ? "rgba(3, 7, 18, 0.85)" : "rgba(255, 255, 255, 0.9)"} !important;
            color: ${textMuted} !important;
            font-size: 9px !important;
            backdrop-filter: blur(8px);
            border-radius: 8px 0 0 0;
            padding: 4px 8px !important;
          }
          
          .leaflet-attribution a {
            color: ${textSecondary} !important;
          }

          @keyframes scan-line {
            0% { top: -2px; }
            100% { top: 100%; }
          }
        `}</style>

        {
    /* Ambient overlay */
  }
        <div
    className="pointer-events-none absolute inset-0 z-[1000]"
    style={{
      background: isDark ? "radial-gradient(ellipse at 50% 30%, rgba(6, 182, 212, 0.05) 0%, transparent 60%)" : "radial-gradient(ellipse at 50% 30%, rgba(99, 102, 241, 0.04) 0%, transparent 60%)"
    }}
  />

        {
    /* Scan line effect (dark mode only) */
  }
        {isDark && <div
    className="pointer-events-none absolute inset-0 z-[1001] overflow-hidden"
    style={{ opacity: 0.03 }}
  >
            <div
    className="absolute inset-x-0 h-px"
    style={{
      background: `linear-gradient(to right, transparent, ${accentCyan}, transparent)`,
      animation: "scan-line 4s linear infinite"
    }}
  />
          </div>}

        <MapContainer
    ref={mapRef}
    center={MAP_CENTER}
    zoom={DEFAULT_ZOOM}
    minZoom={MIN_ZOOM}
    maxZoom={MAX_ZOOM}
    style={{ height: "100%", width: "100%" }}
    zoomControl={true}
    attributionControl={true}
    maxBounds={MAP_BOUNDS}
    maxBoundsViscosity={0.9}
  >
          {
    /* Themed tiles */
  }
          <TileLayer
    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
    url={isDark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
    maxZoom={19}
  />

          {
    /* Map controllers */
  }
          <MapInteractionControl />
          <MapFlyTo focusHub={focusHub} flyTrigger={flyTrigger} hasAlerts={hubAlerts.length > 0} />
          <ZoomLevelProvider onZoomChange={handleZoomChange} />

          {
    /* Connection lines */
  }
          <ConnectionLines alertByHub={alertByHub} isDark={isDark} />

          {
    /* Data flow particles */
  }
          <DataFlowParticles isDark={isDark} />

          {
    /* Hub markers */
  }
          {LOCATIONS.map((location) => {
    const count = Number(byLocation[location.name] || 0);
    const hasCluster = Boolean(clusterByLocation.get(location.name));
    const cascadeInfo = cascadeIndex.get(location.name) || null;
    const intelligenceLevel = alertByHub.get(location.name);
    const alertLevel = getAlertLevel(count, hasCluster, cascadeInfo, intelligenceLevel);
    return <HubMarkerOverlay
      key={location.name}
      location={location}
      count={count}
      alertLevel={alertLevel}
      isSelected={selectedHub === location.name}
      isFocused={focusHub === location.name}
      onClick={() => {
        setSelectedHub(location.name);
        setShowSummaryCard(true);
      }}
      onHover={setHoveredHub}
      currentZoom={currentZoom}
      isDark={isDark}
    />;
  })}
        </MapContainer>

        {
    /* Hover tooltip */
  }
        <AnimatePresence>
          {hoveredHub && !showSummaryCard && <motion.div
    initial={{ opacity: 0, scale: 0.95, y: 10 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.95, y: 10 }}
    className="pointer-events-none absolute left-4 top-4 z-[1002] min-w-[220px] overflow-hidden rounded-xl backdrop-blur-xl"
    style={{
      background: isDark ? "rgba(17, 24, 39, 0.95)" : "rgba(255, 255, 255, 0.95)",
      border: `1px solid ${borderColor}`,
      boxShadow: isDark ? "0 0 40px rgba(6, 182, 212, 0.15)" : "0 0 30px rgba(0,0,0,0.1)"
    }}
  >
              <div className="p-4">
                <p className="font-bold" style={{ color: textPrimary }}>
                  {hoveredHub.name}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: textSecondary }}>
                  {hoveredHub.region} Region
                </p>
              </div>
              <div
    className="grid grid-cols-2 gap-px"
    style={{ background: borderColor }}
  >
                <div className="p-3" style={{ background: isDark ? "rgba(17, 24, 39, 0.95)" : "rgba(255, 255, 255, 0.95)" }}>
                  <p className="text-lg font-bold" style={{ color: textPrimary }}>
                    {byLocation[hoveredHub.name] || 0}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: textMuted }}>
                    Incidents
                  </p>
                </div>
                <div className="p-3" style={{ background: isDark ? "rgba(17, 24, 39, 0.95)" : "rgba(255, 255, 255, 0.95)" }}>
                  <p className="font-mono text-xs" style={{ color: textSecondary }}>
                    {hoveredHub.lat.toFixed(2)}, {hoveredHub.lng.toFixed(2)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: textMuted }}>
                    Coords
                  </p>
                </div>
              </div>
            </motion.div>}
        </AnimatePresence>

        {
    /* Incident Summary Card */
  }
        <AnimatePresence>
          {showSummaryCard && focusedHubData && <IncidentSummaryCard
    hub={focusedHubData}
    incidentCount={focusedHubCount}
    alertLevel={focusedHubAlertLevel}
    clusterInfo={focusedHubCluster ?? null}
    cascadeInfo={focusedHubCascade ?? null}
    onClose={() => {
      setShowSummaryCard(false);
      setSelectedHub(null);
    }}
    onViewDetails={() => {
      switchToHub(focusedHubData.name);
      navigate('/hub');
    }}
    isDark={isDark}
  />}
        </AnimatePresence>

        {
    /* Live indicator — left side so it never overlaps the card panel */
  }
        <AnimatePresence>
          {!showSummaryCard && <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
    className="absolute right-4 top-4 z-[1002] flex items-center gap-2 rounded-full px-3 py-2 backdrop-blur-xl"
    style={{
      background: isDark ? "rgba(17, 24, 39, 0.85)" : "rgba(255, 255, 255, 0.9)",
      border: `1px solid ${borderColor}`
    }}
  >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-green-500">
                LIVE
              </span>
            </motion.div>}
        </AnimatePresence>

        {
    /* Interaction hint */
  }
        <div
    className="absolute bottom-4 left-4 z-[1002] flex items-center gap-2 rounded-full px-3 py-2 backdrop-blur-xl"
    style={{
      background: isDark ? "rgba(17, 24, 39, 0.85)" : "rgba(255, 255, 255, 0.9)",
      border: `1px solid ${borderColor}`
    }}
  >
          <span className="text-[10px]" style={{ color: textMuted }}>
            Double-click to enable map interaction
          </span>
        </div>

        {
    /* Zoom level indicator */
  }
        <div
    className="absolute bottom-4 right-4 z-[1002] flex items-center gap-2 rounded-full px-3 py-2 backdrop-blur-xl"
    style={{
      background: isDark ? "rgba(17, 24, 39, 0.85)" : "rgba(255, 255, 255, 0.9)",
      border: `1px solid ${borderColor}`
    }}
  >
          <span className="text-[10px] font-mono" style={{ color: textMuted }}>
            {currentZoom.toFixed(1)}x
          </span>
        </div>
      </div>

      {
    /* Legend */
  }
      <div
    className="flex flex-wrap items-center justify-center gap-6 rounded-xl p-4"
    style={{
      background: bgSecondary,
      border: `1px solid ${borderColor}`
    }}
  >
        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
          <span
    className="h-3 w-3 rounded-full"
    style={{ background: accentCyan, boxShadow: `0 0 10px ${accentCyan}` }}
  />
          Normal
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
          <span
    className="h-3 w-3 rounded-full"
    style={{ background: accentAmber, boxShadow: `0 0 10px ${accentAmber}` }}
  />
          Warning
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
          <span
    className="h-3 w-3 rounded-full"
    style={{ background: accentRed, boxShadow: `0 0 10px ${accentRed}` }}
  />
          Critical
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
          <motion.span
    className="h-3 w-3 rounded-full"
    style={{ background: accentCyan }}
    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
    transition={{ duration: 2, repeat: Infinity }}
  />
          Data Flow
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: textSecondary }}>
          <div className="h-px w-6" style={{ background: accentCyan, opacity: 0.5 }} />
          Hub Connection
        </div>
      </div>
    </div>;
}
export {
  MalaysiaMap as default
};
