import CustomerProfile from "../models/CustomerProfile.model.js";

function labelFromScore(score) {
  if (score >= 0.7) return "positive";
  if (score >= 0.45) return "neutral";
  if (score >= 0.25) return "frustrated";
  return "very_frustrated";
}

function computeTrend(sentimentHistory) {
  if (!sentimentHistory || sentimentHistory.length < 2) return "stable";

  const recent = sentimentHistory
    .slice(-6)
    .map((e) => e.score);

  if (recent.length < 2) return "stable";

  const midpoint = Math.floor(recent.length / 2);
  const older = recent.slice(0, midpoint);
  const newer = recent.slice(midpoint);

  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const avgNewer = newer.reduce((a, b) => a + b, 0) / newer.length;

  const delta = avgNewer - avgOlder;
  if (delta > 0.1) return "improving";
  if (delta < -0.1) return "worsening";
  return "stable";
}

function computeAverageSentiment(sentimentHistory) {
  if (!sentimentHistory || sentimentHistory.length === 0) return 0.5;
  const scores = sentimentHistory.map((e) => e.score);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function deriveTags(profile) {
  const tags = new Set(profile.tags || []);

  if (profile.totalCases >= 2) tags.add("repeat");
  else tags.delete("repeat");

  if (profile.averageSentiment < 0.3 && profile.totalCases >= 2) tags.add("high-risk");
  else tags.delete("high-risk");

  if (profile.totalEscalations >= 2) tags.add("escalation-prone");
  else tags.delete("escalation-prone");

  if (profile.totalSatisfied >= 3 && profile.averageSentiment >= 0.6) tags.add("loyal");
  else tags.delete("loyal");

  return [...tags];
}

export async function upsertOnIntake(email, incident) {
  if (!email) return null;

  const now = new Date();
  const sentimentEntry = incident.sentimentScore != null
    ? {
        score: incident.sentimentScore,
        label: incident.sentimentLabel || labelFromScore(incident.sentimentScore),
        incidentId: incident._id,
        source: incident.source === "rpa" ? "rpa" : "email",
      }
    : null;

  const caseEntry = {
    incidentId: incident._id,
    type: incident.type || null,
    severity: incident.severity || null,
    outcome: "pending",
  };

  let profile = await CustomerProfile.findOne({ email });

  if (!profile) {
    profile = await CustomerProfile.create({
      email,
      name: incident.agentResults?.intake?.fields?.customerName?.value || null,
      preferredLanguage: incident.detectedLanguage || "en",
      sentimentHistory: sentimentEntry ? [sentimentEntry] : [],
      cases: [caseEntry],
      averageSentiment: sentimentEntry ? sentimentEntry.score : 0.5,
      frustrationTrend: "stable",
      tags: [],
      totalCases: 1,
      lastSeenAt: now,
      firstSeenAt: now,
    });
    profile.tags = deriveTags(profile);
    await profile.save();
    return profile;
  }

  if (sentimentEntry) profile.sentimentHistory.push(sentimentEntry);

  const alreadyTracked = profile.cases.some(
    (c) => c.incidentId?.toString() === incident._id?.toString(),
  );
  if (!alreadyTracked) {
    profile.cases.push(caseEntry);
    profile.totalCases = profile.cases.length;
  }

  if (incident.detectedLanguage) {
    profile.preferredLanguage = incident.detectedLanguage;
  }

  profile.averageSentiment = computeAverageSentiment(profile.sentimentHistory);
  profile.frustrationTrend = computeTrend(profile.sentimentHistory);
  profile.lastSeenAt = now;
  profile.tags = deriveTags(profile);

  await profile.save();
  return profile;
}

export async function recordSentiment(email, score, label, incidentId, source = "system") {
  if (!email) return null;

  let profile = await CustomerProfile.findOne({ email });
  if (!profile) {
    profile = await CustomerProfile.findOneAndUpdate(
      { email },
      { $setOnInsert: { email, totalCases: 0, totalSatisfied: 0, totalEscalations: 0 } },
      { upsert: true, new: true },
    );
  }

  profile.sentimentHistory.push({
    score,
    label: label || labelFromScore(score),
    incidentId,
    source,
  });

  profile.averageSentiment = computeAverageSentiment(profile.sentimentHistory);
  profile.frustrationTrend = computeTrend(profile.sentimentHistory);
  profile.tags = deriveTags(profile);
  profile.lastSeenAt = new Date();
  await profile.save();
  return profile;
}

export async function recordChatMessage(email, sentimentScore, incidentId) {
  if (!email) return null;

  let profile = await CustomerProfile.findOne({ email });
  if (!profile) {
    profile = await CustomerProfile.findOneAndUpdate(
      { email },
      { $setOnInsert: { email, totalCases: 0, totalSatisfied: 0, totalEscalations: 0 } },
      { upsert: true, new: true },
    );
  }

  profile.chatBehavior.totalMessages += 1;

  if (sentimentScore != null) {
    const prevAvg = profile.chatBehavior.averageResponseTone;
    const n = profile.chatBehavior.totalMessages;
    profile.chatBehavior.averageResponseTone =
      prevAvg + (sentimentScore - prevAvg) / n;
  }

  profile.lastSeenAt = new Date();
  await profile.save();
  return profile;
}

export async function recordChatEscalation(email, incidentId) {
  if (!email) return null;

  let profile = await CustomerProfile.findOne({ email });
  if (!profile) {
    profile = await CustomerProfile.findOneAndUpdate(
      { email },
      { $setOnInsert: { email, totalCases: 0, totalSatisfied: 0, totalEscalations: 0 } },
      { upsert: true, new: true },
    );
  }

  profile.chatBehavior.escalationCount += 1;
  profile.tags = deriveTags(profile);
  profile.lastSeenAt = new Date();
  await profile.save();
  return profile;
}

export async function updateCaseOutcome(email, incidentId, outcome) {
  if (!email || !incidentId) return null;

  const profile = await CustomerProfile.findOne({ email });
  if (!profile) return null;

  const caseEntry = profile.cases.find(
    (c) => c.incidentId?.toString() === incidentId.toString(),
  );

  if (caseEntry) {
    const wasPending = caseEntry.outcome === "pending";
    caseEntry.outcome = outcome;
    if (outcome === "satisfied" || outcome === "escalated" || outcome === "no_response") {
      caseEntry.resolvedAt = new Date();
    }
    if (wasPending) {
      if (outcome === "satisfied") profile.totalSatisfied += 1;
      if (outcome === "escalated") profile.totalEscalations += 1;
    }
  }

  profile.averageSentiment = computeAverageSentiment(profile.sentimentHistory);
  profile.frustrationTrend = computeTrend(profile.sentimentHistory);
  profile.tags = deriveTags(profile);
  profile.lastSeenAt = new Date();
  await profile.save();
  return profile;
}

export async function getProfile(email) {
  if (!email) return null;
  return CustomerProfile.findOne({ email }).lean();
}

export async function getProfileSummaryForAgent(email) {
  const profile = await getProfile(email);
  if (!profile) return null;

  return {
    totalCases: profile.totalCases,
    totalEscalations: profile.totalEscalations,
    totalSatisfied: profile.totalSatisfied,
    averageSentiment: profile.averageSentiment,
    frustrationTrend: profile.frustrationTrend,
    preferredLanguage: profile.preferredLanguage,
    tags: profile.tags,
    isRepeat: profile.totalCases > 1,
    recentSentiment: profile.sentimentHistory.slice(-3).map((e) => ({
      score: e.score,
      label: e.label,
      source: e.source,
    })),
    chatBehavior: {
      averageTone: profile.chatBehavior?.averageResponseTone ?? 0.5,
      escalationCount: profile.chatBehavior?.escalationCount ?? 0,
    },
    lastSeenAt: profile.lastSeenAt,
    firstSeenAt: profile.firstSeenAt,
  };
}
