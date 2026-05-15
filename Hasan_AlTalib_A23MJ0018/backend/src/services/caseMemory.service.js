import mongoose from "mongoose";

import { callAI } from "../config/callAI.js";
import Incident from "../models/Incident.model.js";
import { searchEmbeddings } from "./fastapi.service.js";

function normalizeResolutionNote(incident) {
  if (typeof incident?.resolutionNote === "string" && incident.resolutionNote.trim()) {
    return incident.resolutionNote.trim();
  }

  const steps = incident?.agentResults?.resolution?.steps;
  if (Array.isArray(steps) && steps.length > 0) {
    return steps.map((s, i) => `${i + 1}. ${s}`).join(' ');
  }

  return "Resolution note unavailable";
}

function normalizeLocation(incident) {
  return (
    incident?.location ||
    incident?.agentResults?.request?.location ||
    incident?.agentResults?.intake?.fields?.location?.value ||
    null
  );
}

function normalizeDescription(incident) {
  return (
    incident?.description ||
    incident?.rawInput ||
    incident?.agentResults?.intake?.fields?.description?.value ||
    ""
  );
}

function isResolvedStatus(status) {
  return ["RESOLVED", "resolved", "CLOSED"].includes(status);
}

function extractCandidates(searchResult) {
  if (Array.isArray(searchResult?.candidates)) {
    return searchResult.candidates;
  }

  if (Array.isArray(searchResult?.results)) {
    return searchResult.results;
  }

  return [];
}

function buildIncidentContext(incident) {
  return {
    id: incident?._id ? String(incident._id) : null,
    type: incident?.type || "other",
    location: normalizeLocation(incident),
    description: normalizeDescription(incident),
    severity:
      incident?.severity ||
      incident?.agentResults?.classifier?.fields?.severity?.value ||
      null,
  };
}

function buildFallbackReformulation(sourceContext) {
  return [
    sourceContext?.type ? sourceContext.type.replace(/_/g, " ") : null,
    sourceContext?.location,
    sourceContext?.severity,
    sourceContext?.description,
  ]
    .filter(Boolean)
    .join(" ");
}

function getMatchPriority(sourceContext, candidate) {
  const sameType = sourceContext?.type && candidate?.type === sourceContext.type;
  const sameLocation =
    sourceContext?.location &&
    candidate?.location &&
    sourceContext.location.toLowerCase() === candidate.location.toLowerCase();

  if (sameType && sameLocation) {
    return 4;
  }

  if (sameType) {
    return 3;
  }

  if (sameLocation) {
    return 2;
  }

  return 1;
}

function isWeakMatch(sourceContext, candidate) {
  const similarity = Number(candidate?.similarity || 0);
  const priority = getMatchPriority(sourceContext, candidate);

  if (priority === 4 && similarity >= 0.45) {
    return false;
  }

  if (priority === 3 && similarity >= 0.58) {
    return false;
  }

  if (priority === 2 && similarity >= 0.68) {
    return false;
  }

  return similarity < 0.75;
}

function postFilterCandidates(sourceContext, candidates) {
  const ranked = [...candidates]
    .map((candidate) => ({
      ...candidate,
      _matchPriority: getMatchPriority(sourceContext, candidate),
      _similarity: Number(candidate?.similarity || 0),
      _rrfScore: Number(candidate?.rrfScore || 0),
    }))
    .sort((left, right) => {
      if (right._matchPriority !== left._matchPriority) {
        return right._matchPriority - left._matchPriority;
      }

      if (right._rrfScore !== left._rrfScore) {
        return right._rrfScore - left._rrfScore;
      }

      return right._similarity - left._similarity;
    });

  const filtered = ranked.filter((candidate) => {
    const similarity = Number(candidate?.similarity || 0);
    const priority = candidate._matchPriority;

    if (priority === 4) {
      return similarity >= 0.5;
    }

    if (priority === 3) {
      return similarity >= 0.58;
    }

    if (priority === 2) {
      return similarity >= 0.68;
    }

    return similarity >= 0.75;
  });

  if (filtered.length) {
    return filtered.map(({ _matchPriority, _similarity, _rrfScore, ...candidate }) => candidate);
  }

  return ranked
    .filter((candidate) => candidate?._matchPriority === 4)
    .filter((candidate) => candidate._similarity >= 0.45)
    .slice(0, 2)
    .concat(
      ranked
        .filter((candidate) => candidate?._matchPriority === 3)
        .filter((candidate) => candidate._similarity >= 0.5)
        .slice(0, 1)
    )
    .slice(0, 1);
}

export async function mapCandidatesToIncidents(candidates, options = {}) {
  const excludeIncidentId = options.excludeIncidentId ? String(options.excludeIncidentId) : null;

  if (!Array.isArray(candidates) || !candidates.length) {
    return [];
  }

  const orderedIds = [
    ...new Set(
      candidates
        .map((candidate) => candidate?.incidentId || candidate?.incident_id || candidate?._id)
        .filter(Boolean)
        .map(String)
        .filter((candidateId) => candidateId !== excludeIncidentId)
    ),
  ];

  if (!orderedIds.length) {
    return [];
  }

  const validObjectIds = orderedIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const incidents = await Incident.aggregate([
    {
      $match: validObjectIds.length
        ? {
            $or: [
              { _id: { $in: validObjectIds } },
              { $expr: { $in: [{ $toString: "$_id" }, orderedIds] } },
            ],
          }
        : { $expr: { $in: [{ $toString: "$_id" }, orderedIds] } },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        type: 1,
        status: 1,
        confidence: 1,
        location: 1,
        description: 1,
        rawInput: 1,
        resolvedAt: 1,
        resolutionNote: 1,
        updatedAt: 1,
        agentResults: 1,
      },
    },
  ]);

  if (!incidents.length) {
    return [];
  }

  const incidentsById = new Map(
    incidents.map((incident) => [incident._id.toString(), incident])
  );

  const rankedMatches = candidates
    .map((candidate) => {
      const candidateId = String(
        candidate?.incidentId || candidate?.incident_id || candidate?._id || ""
      );
      const incident = incidentsById.get(candidateId);

      if (!incident) {
        return null;
      }

      return {
        _id: incident._id,
        title:
          incident.title ||
          incident.agentResults?.intake?.fields?.description?.value ||
          "Resolved incident",
        description: normalizeDescription(incident),
        type: incident.type || "other",
        location: normalizeLocation(incident),
        resolvedAt: incident.resolvedAt || incident.updatedAt || null,
        resolutionNote: normalizeResolutionNote(incident),
        confidence: incident.confidence ?? null,
        similarity: candidate.similarity,
        bm25Score: candidate.bm25Score ?? null,
        rrfScore: candidate.rrfScore ?? null,
        status: incident.status,
      };
    })
    .filter(Boolean);

  const resolvedMatches = rankedMatches.filter((match) => isResolvedStatus(match.status));
  const fallbackMatches = rankedMatches.filter(
    (match) => !isResolvedStatus(match.status) && Number(match.similarity || 0) > 0.7
  );

  return [...resolvedMatches, ...fallbackMatches];
}

async function gradeCandidates(description, mappedIncidents, sourceContext) {
  if (!mappedIncidents || mappedIncidents.length === 0) {
    return { good: [], needsReformulation: true, reformulatedQuery: null };
  }

  const summaries = mappedIncidents
    .map(
      (incident, index) =>
        `[${index + 1}] ${incident.type || "unknown"} at ${incident.location || "unknown"}: ${incident.title || incident.description || "no title"}`
    )
    .join("\n");

  let parsed;
  try {
    const raw = await callAI({
      system: `You are a retrieval grader for a logistics incident system.
Grade whether each retrieved incident is genuinely relevant to the query.
Location and incident type matter strongly. A same-type result from a different facility with low semantic similarity is usually not relevant.
Reject weak cross-location matches unless the text clearly indicates the same operational pattern.
Respond in JSON only, no markdown fences:
{"grades":[{"index":1,"relevant":true,"reason":"..."}],"reformulatedQuery":"better query string or null"}`,
      user: `Query: "${description}"\nIncident type: "${sourceContext?.type || "unknown"}"\nLocation: "${sourceContext?.location || "unknown"}"\nSeverity: "${sourceContext?.severity || "unknown"}"\n\nCandidates:\n${summaries}`,
      maxTokens: 400,
    });

    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (error) {
    return {
      good: mappedIncidents,
      needsReformulation: false,
      reformulatedQuery: null,
    };
  }

  const gradeMap = new Map(
    (parsed.grades || [])
      .filter((grade) => Number.isInteger(grade?.index))
      .map((grade) => [grade.index - 1, grade])
  );

  const good = mappedIncidents.filter((_, index) => gradeMap.get(index)?.relevant !== false);
  const needsReformulation =
    good.length === 0 || good.every((candidate) => isWeakMatch(sourceContext, candidate));
  let reformulatedQuery =
    typeof parsed.reformulatedQuery === "string" && parsed.reformulatedQuery.trim()
      ? parsed.reformulatedQuery.trim()
      : null;

  if (needsReformulation && !reformulatedQuery) {
    reformulatedQuery = buildFallbackReformulation(sourceContext) || null;
  }

  return { good, needsReformulation, reformulatedQuery };
}

export async function getSimilarResolvedIncidents(sourceIncident) {
  const sourceContext = buildIncidentContext(sourceIncident);
  const description = sourceContext.description;

  if (!description || description.trim().length < 10) {
    return [];
  }

  try {
    const initialResult = await searchEmbeddings(description, 12);
    const initialCandidates = await mapCandidatesToIncidents(extractCandidates(initialResult), {
      excludeIncidentId: sourceContext.id,
    });

    if (!initialCandidates.length) {
      return [];
    }

    let finalCandidates = initialCandidates;
    let cragUsed = false;
    let reformulatedQuery = null;

    const highConfidence = initialCandidates.filter((c) => {
      const sim = Number(c.similarity || 0);
      const sameType = c.type === sourceContext.type;
      const sameLoc = sourceContext.location
        && c.location
        && c.location.toLowerCase() === sourceContext.location.toLowerCase();
      return sim >= 0.8 && sameType && sameLoc;
    });

    if (highConfidence.length >= 2) {
      finalCandidates = postFilterCandidates(sourceContext, highConfidence);
      return finalCandidates.slice(0, 3).map((candidate) => ({
        ...candidate,
        cragUsed: false,
        reformulatedQuery: null,
        fastPath: true,
      }));
    }

    try {
      const gradeResult = await Promise.race([
        gradeCandidates(description, initialCandidates, sourceContext),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("CRAG timeout")), 5000)
        ),
      ]);

      if (gradeResult.needsReformulation && gradeResult.reformulatedQuery) {
        cragUsed = true;
        reformulatedQuery = gradeResult.reformulatedQuery;

        const secondResult = await searchEmbeddings(reformulatedQuery, 12);
        const secondCandidates = await mapCandidatesToIncidents(extractCandidates(secondResult), {
          excludeIncidentId: sourceContext.id,
        });
        const secondGrade = await gradeCandidates(
          reformulatedQuery,
          secondCandidates,
          sourceContext
        );

        finalCandidates =
          secondGrade.good.length > 0 ? secondGrade.good : secondCandidates.slice(0, 3);
      } else {
        finalCandidates =
          gradeResult.good.length > 0 ? gradeResult.good : initialCandidates.slice(0, 3);
      }
    } catch (error) {
      finalCandidates = initialCandidates.slice(0, 3);
    }

    finalCandidates = postFilterCandidates(sourceContext, finalCandidates);

    return finalCandidates.slice(0, 3).map((candidate) => ({
      ...candidate,
      cragUsed,
      reformulatedQuery: cragUsed ? reformulatedQuery : null,
    }));
  } catch (error) {
    console.error("[case-memory]", error.message);
    return [];
  }
}
