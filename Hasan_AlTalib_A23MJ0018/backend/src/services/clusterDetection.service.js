import Incident from "../models/Incident.model.js";

const ACTIVE_WINDOW_MS = 72 * 60 * 60 * 1000;
const CLUSTER_WINDOW_MS = 4 * 60 * 60 * 1000;
const MIN_CLUSTER_SIZE = 3;

// ── Feature 3: Malaysia Cascade Detection Network ────────────────────────────
// Hub adjacency map — locked geography, do not change.
const HUB_CASCADE_MAP = {
  "Shah Alam Hub":     { downstream: [{ hub: "Subang Jaya Depot", delayHours: 1.5, riskMultiplier: 0.8 },
                                      { hub: "KLIA Cargo",        delayHours: 2.0, riskMultiplier: 0.6 }] },
  "KLIA Cargo":        { downstream: [{ hub: "Shah Alam Hub",     delayHours: 1.0, riskMultiplier: 0.7 },
                                      { hub: "Subang Jaya Depot", delayHours: 2.5, riskMultiplier: 0.5 },
                                      { hub: "Penang Hub",        delayHours: 4.0, riskMultiplier: 0.3 },
                                      { hub: "JB Distribution",   delayHours: 4.0, riskMultiplier: 0.3 }] },
  "Subang Jaya Depot": { downstream: [{ hub: "Shah Alam Hub",     delayHours: 1.0, riskMultiplier: 0.6 },
                                      { hub: "KLIA Cargo",        delayHours: 1.5, riskMultiplier: 0.5 }] },
  "Penang Hub":        { downstream: [{ hub: "KLIA Cargo",        delayHours: 3.5, riskMultiplier: 0.4 }] },
  "JB Distribution":   { downstream: [{ hub: "KLIA Cargo",        delayHours: 4.0, riskMultiplier: 0.4 }] },
};

/**
 * predictCascadeRisk(cluster)
 *
 * Given a confirmed cluster object, returns predicted downstream cascade risk
 * for all adjacent hubs in the Malaysia hub network.
 *
 * @param {object} cluster - { type, location, count, firstSeen, lastSeen, ... }
 * @returns {object} { sourceHub, cascadeRisk[], overallCascadeScore, recommendation }
 */
export function predictCascadeRisk(cluster) {
  try {
    const sourceHub = cluster.location;
    const adjacency = HUB_CASCADE_MAP[sourceHub];

    // Hub not in map — graceful skip
    if (!adjacency || !Array.isArray(adjacency.downstream)) {
      return {
        sourceHub,
        cascadeRisk: [],
        overallCascadeScore: 0,
        recommendation: `No cascade map entry for ${sourceHub}. Monitor manually.`,
      };
    }

    const baseTime = cluster.lastSeen ? new Date(cluster.lastSeen) : new Date();
    const incidentType = (cluster.type || "incident").replace(/_/g, " ");

    const cascadeRisk = adjacency.downstream.map((edge) => {
      // Normalize by cluster threshold (3) then amplify for large clusters
      let baseRisk = edge.riskMultiplier * (cluster.count / MIN_CLUSTER_SIZE);
      if (cluster.count >= 5) baseRisk *= 1.3;

      // Cap at 0.99 for display sanity
      baseRisk = Math.min(0.99, Math.round(baseRisk * 1000) / 1000);

      const riskLevel =
        baseRisk > 0.6 ? "high" :
        baseRisk > 0.3 ? "medium" : "low";

      const estimatedImpactTime = new Date(
        baseTime.getTime() + edge.delayHours * 60 * 60 * 1000
      );

      return {
        hub:                 edge.hub,
        delayHours:          edge.delayHours,
        riskMultiplier:      edge.riskMultiplier,
        baseRisk,
        riskLevel,
        estimatedImpactTime: estimatedImpactTime.toISOString(),
      };
    });

    const overallCascadeScore = cascadeRisk.length
      ? Math.max(...cascadeRisk.map((r) => r.baseRisk))
      : 0;

    // Identify the highest-risk downstream hub for the recommendation
    const topRisk = cascadeRisk
      .slice()
      .sort((a, b) => b.baseRisk - a.baseRisk)[0];

    let recommendation = "Monitor downstream hubs for elevated incident volume.";
    if (topRisk && topRisk.riskLevel !== "low") {
      const impactTime = new Date(topRisk.estimatedImpactTime);
      const timeStr = impactTime.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kuala_Lumpur",
      });
      recommendation =
        `Alert ${topRisk.hub} ops team — expect elevated ${incidentType} volume ` +
        `by ${timeStr} MYT (risk level: ${topRisk.riskLevel.toUpperCase()}).`;
    }

    return {
      sourceHub,
      cascadeRisk,
      overallCascadeScore: Math.round(overallCascadeScore * 1000) / 1000,
      recommendation,
    };
  } catch (error) {
    console.error("[cascade] predictCascadeRisk error:", error.message);
    return {
      sourceHub: cluster.location || "unknown",
      cascadeRisk: [],
      overallCascadeScore: 0,
      recommendation: "Cascade prediction unavailable.",
    };
  }
}

// ── Hub name → canonical location lookup (for MalaysiaMap coloring) ──────────
export function getAllCascadeHubs() {
  return Object.keys(HUB_CASCADE_MAP);
}

function normalizeLocation(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function getIncidentLocation(incident) {
  return normalizeLocation(
    incident?.location ||
      incident?.agentResults?.intake?.fields?.location?.value ||
      incident?.agentResults?.request?.location ||
      "",
  );
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildClusterId(type, location, firstSeen) {
  return `${type}-${slugify(location)}-${new Date(firstSeen).toISOString()}`;
}

function buildClustersFromGroup(type, location, incidents) {
  const clusters = [];
  const sorted = [...incidents].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  let start = 0;

  while (start < sorted.length) {
    let end = start + 1;

    while (
      end < sorted.length &&
      new Date(sorted[end].createdAt).getTime() - new Date(sorted[start].createdAt).getTime() <=
        CLUSTER_WINDOW_MS
    ) {
      end += 1;
    }

    const windowIncidents = sorted.slice(start, end);

    if (windowIncidents.length >= MIN_CLUSTER_SIZE) {
      const firstSeen = windowIncidents[0].createdAt;
      const lastSeen = windowIncidents[windowIncidents.length - 1].createdAt;

      clusters.push({
        clusterId: buildClusterId(type, location, firstSeen),
        type,
        location,
        count: windowIncidents.length,
        firstSeen,
        lastSeen,
        incidentIds: windowIncidents.map((incident) => incident._id.toString()),
      });

      start = end;
      continue;
    }

    start += 1;
  }

  return clusters;
}

export async function getActiveClusters() {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);

  const incidents = await Incident.find({
    createdAt: { $gte: cutoff },
    type: { $nin: [null, ""] },
  })
    .select("_id type createdAt location agentResults clusterGroup")
    .lean();

  const grouped = new Map();

  for (const incident of incidents) {
    const location = getIncidentLocation(incident);

    if (!location) {
      continue;
    }

    const key = `${incident.type}::${location}`;
    const group = grouped.get(key) || [];
    group.push(incident);
    grouped.set(key, group);
  }

  const clusters = [];

  for (const [key, groupIncidents] of grouped.entries()) {
    const [type, location] = key.split("::");
    clusters.push(...buildClustersFromGroup(type, location, groupIncidents));
  }

  const sorted = clusters.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime();
  });

  // ── Feature 3: attach cascade risk to every confirmed cluster ─────────────
  for (const cluster of sorted) {
    cluster.cascadeRisk = predictCascadeRisk(cluster);
  }

  return sorted;
}

export async function findClusterForIncident(incidentId) {
  const clusters = await getActiveClusters();
  return (
    clusters.find((cluster) => cluster.incidentIds.includes(String(incidentId))) || null
  );
}

