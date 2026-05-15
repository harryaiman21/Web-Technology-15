import ProactiveSend from '../models/ProactiveSend.model.js';
import Incident from '../models/Incident.model.js';
import { getActiveClusters } from './clusterDetection.service.js';
import { callAI } from '../config/callAI.js';

const AUTO_GEN_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_CLUSTER_COUNT = 3;
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function buildDocPrompt(docType, typeLabel, location, count, caseLines) {
  const noCase = '(No resolved cases on record yet — use general DHL best practice)';
  const cases = caseLines || noCase;

  switch (docType) {
    case 'hubNotice':
      return {
        system:
          'You are a DHL operations manager writing an internal memo to a hub manager. ' +
          'Be specific, formal, and action-oriented. Name the hub and the incident pattern explicitly. ' +
          'Do not use placeholders. Write as if this is a real memo being sent today.',
        user:
          `Write a formal internal notice to the manager of ${location} about a ${typeLabel} incident cluster.\n` +
          `${count} incidents observed. Real customer complaint descriptions:\n${cases}\n\n` +
          `Format: 2-3 focused paragraphs.\n` +
          `Paragraph 1 — What was observed: describe the specific pattern and its operational impact.\n` +
          `Paragraph 2 — Recommended immediate action: specific steps the hub manager should take today.\n` +
          `Paragraph 3 — Expected timeline and monitoring: when to expect improvement, what to watch.\n` +
          `Tone: formal internal memo. Specific to ${location} and ${typeLabel}.`,
        maxTokens: 550,
      };

    case 'customerEmail':
      return {
        system:
          'You are writing on behalf of DHL Customer Service. ' +
          'Your tone is empathetic, reassuring, and specific. ' +
          'Do not make promises you cannot keep. Never use \'Dear Customer\' — use a warm greeting. ' +
          'Always end with a clear next step. Write a real email, not a template.',
        user:
          `Write a proactive customer email about ${typeLabel} issues affecting shipments through ${location}.\n` +
          `${count} customers may be affected. Real complaint context:\n${cases}\n\n` +
          `Format: First line must be "Subject: [subject line]", then blank line, then email body.\n` +
          `Body must include: (1) warm acknowledgment that we're reaching out before they had to contact us, ` +
          `(2) honest brief explanation of what's happening at ${location}, ` +
          `(3) what DHL is actively doing to resolve it, ` +
          `(4) what the customer should expect and when, ` +
          `(5) how to get help if needed.\n` +
          `Keep under 200 words. Empathetic, specific, professional.`,
        maxTokens: 550,
      };

    case 'faqUpdate':
      return {
        system:
          'You write concise, helpful FAQ entries for a courier company\'s help center. ' +
          'Answer the real question customers ask, not the question you wish they asked. ' +
          'Be honest about limitations. Write one question and one answer.',
        user:
          `Write one FAQ entry for the DHL help center about ${typeLabel} issues involving shipments from ${location}.\n` +
          `Real customer complaint context:\n${cases}\n\n` +
          `Format:\nQ: [The exact question a customer would type into the search bar — specific, not generic]\n` +
          `A: [Clear, specific answer. Under 90 words. Tell the customer: what's happening, ` +
          `what DHL is doing, what they should do if affected, and how long to wait before escalating.]\n\n` +
          `Do not give generic advice. Reference ${location} specifically.`,
        maxTokens: 350,
      };

    case 'pccPlaybook':
      return {
        system:
          'You write PCC (Parcel Care Centre) playbook entries for DHL customer service agents. ' +
          'Be direct, practical, and bullet-pointed. Agents read this during a live call — ' +
          'every word must count. No preamble, no filler.',
        user:
          `Write a PCC playbook entry for handling customer calls about ${typeLabel} issues from ${location}.\n` +
          `Real complaint context:\n${cases}\n\n` +
          `Format exactly as follows:\n` +
          `## How to identify this call\n` +
          `[3 bullet points — what the customer says that signals this pattern]\n\n` +
          `## What to tell the customer\n` +
          `[4 bullet points — specific scripted responses, use "I" language, be reassuring]\n\n` +
          `## System action\n` +
          `[3 bullet points — what to do in NEXUS/the system: status to set, note to add, team to notify]\n\n` +
          `## Escalate when\n` +
          `[2 bullet points — specific escalation triggers]\n\n` +
          `Specific to ${typeLabel} at ${location}. No generic advice.`,
        maxTokens: 600,
      };

    default:
      return { system: 'You are a helpful assistant.', user: 'Write a brief note.', maxTokens: 200 };
  }
}

async function fetchCaseLines(incidentType, location) {
  const locationEscaped = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const locationRegex = new RegExp(locationEscaped, 'i');
  const incidents = await Incident.find({
    type: incidentType,
    status: { $in: ['RESOLVED', 'CLOSED'] },
    $or: [
      { location: locationRegex },
      { 'agentResults.intake.fields.location.value': locationRegex },
    ],
  })
    .select('rawInput description')
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  return incidents
    .map((inc) => (inc.rawInput || inc.description || '').trim())
    .filter((t) => t.length > 10)
    .map((t) => `- "${t}"`)
    .join('\n');
}

export async function autoGenerateForClusters() {
  try {
    const clusters = await getActiveClusters();
    const eligible = clusters.filter((c) => c.count >= MIN_CLUSTER_COUNT);

    if (eligible.length === 0) return;

    const since24h = new Date(Date.now() - DEDUP_WINDOW_MS);

    for (const cluster of eligible) {
      try {
        const existing = await ProactiveSend.findOne({
          incidentType: cluster.type,
          location: cluster.location,
          generatedAt: { $gte: since24h },
        }).lean();

        if (existing) {
          continue;
        }

        const caseLines = await fetchCaseLines(cluster.type, cluster.location);
        const typeLabel = cluster.type.replace(/_/g, ' ');
        const count = cluster.count;

        const [hubNotice, customerEmail, faqUpdate, pccPlaybook] = await Promise.all([
          callAI(buildDocPrompt('hubNotice', typeLabel, cluster.location, count, caseLines)),
          callAI(buildDocPrompt('customerEmail', typeLabel, cluster.location, count, caseLines)),
          callAI(buildDocPrompt('faqUpdate', typeLabel, cluster.location, count, caseLines)),
          callAI(buildDocPrompt('pccPlaybook', typeLabel, cluster.location, count, caseLines)),
        ]);

        const estimatedComplaintsPrevented = Math.round(count * 1.8);

        await ProactiveSend.create({
          incidentType: cluster.type,
          location: cluster.location,
          clusterId: cluster.clusterId || null,
          documents: { hubNotice, customerEmail, faqUpdate, pccPlaybook },
          estimatedComplaintsPrevented,
          autoGenerated: true,
          status: 'draft',
        });

        console.log(
          `[proactiveAutoGen] auto-generated draft for ${cluster.type} @ ${cluster.location} (count: ${count})`,
        );
      } catch (clusterError) {
        console.error(
          `[proactiveAutoGen] error processing cluster ${cluster.type}@${cluster.location}:`,
          clusterError.message,
        );
      }
    }
  } catch (err) {
    console.error('[proactiveAutoGen] autoGenerateForClusters error:', err.message);
  }
}

export function startProactiveAutoGen() {
  console.log('[proactiveAutoGen] started — auto-generating drafts every 15 minutes');
  setInterval(autoGenerateForClusters, AUTO_GEN_INTERVAL_MS);
}
