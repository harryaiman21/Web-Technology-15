// src/lib/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  // 30 s default cap so a sleeping Render service can't hang the UI forever.
  // Routes that legitimately stream (SSE, long pipeline) opt out per-call.
  timeout: 30000,
});

const handleError = (error) => {
  throw new Error(error.response?.data?.error || error.message);
};

const buildRichError = (error) => {
  const nextError = new Error(error.response?.data?.error || error.message);
  nextError.status = error.response?.status;
  nextError.data = error.response?.data;
  return nextError;
};

export async function login(email, password) {
  try {
    const res = await api.post('/api/v1/auth/login', { email, password });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function logout() {
  try {
    const res = await api.post('/api/v1/auth/logout');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getMe() {
  try {
    const res = await api.get('/api/v1/auth/me');
    return res.data;
  } catch (error) {
    if (error.response?.status === 401) return null;
    return null;
  }
}

export async function analyzePhoto(photoFile) {
  try {
    const formData = new FormData();
    formData.append('photo', photoFile);
    const res = await api.post('/api/v1/incidents/analyze-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function analyseIncident(payload) {
  try {
    const normalized =
      typeof payload === 'string'
        ? { text: payload }
        : payload || {};

    const hasPhoto = Boolean(normalized.photo);
    const hasFile = Boolean(normalized.file);

    let requestBody = { text: normalized.text };
    let config = undefined;

    if (hasPhoto || hasFile) {
      const formData = new FormData();
      if (normalized.text) formData.append('text', normalized.text);
      if (normalized.description) formData.append('description', normalized.description);
      if (normalized.type) formData.append('type', normalized.type);
      if (normalized.severity) formData.append('severity', normalized.severity);
      if (normalized.location) formData.append('location', normalized.location);
      if (normalized.batchDefer) formData.append('batchDefer', 'true');
      if (normalized.file) formData.append('file', normalized.file);
      if (normalized.photo) formData.append('photo', normalized.photo);
      requestBody = formData;
      config = { headers: { 'Content-Type': 'multipart/form-data' } };
    } else {
      requestBody = {
        text: normalized.text,
        ...(normalized.type ? { type: normalized.type } : {}),
        ...(normalized.severity ? { severity: normalized.severity } : {}),
        ...(normalized.location ? { location: normalized.location } : {}),
        ...(normalized.batchDefer ? { batchDefer: true } : {}),
      };
    }

    const res = await api.post('/api/v1/incidents', requestBody, config);
    return res.data; // { incidentId, streamUrl }
  } catch (error) {
    handleError(error);
  }
}

export async function getIncidents(params = {}) {
  try {
    const res = await api.get('/api/v1/incidents', { params });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function patchIncident(id, data) {
  try {
    const res = await api.patch(`/api/v1/incidents/${id}`, data);
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getIncident(id) {
  try {
    const res = await api.get(`/api/v1/incidents/${id}`);
    return res.data.incident;
  } catch (error) {
    handleError(error);
  }
}

export async function getIncidentExplanation(id) {
  try {
    const res = await api.get(`/api/v1/incidents/${id}/explain`);
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getAuditLog(id) {
  try {
    const res = await api.get(`/api/v1/admin/audit/${id}`);
    return res.data.auditLog;
  } catch (error) {
    return [];
  }
}

export async function getPendingCount() {
  try {
    const res = await api.get('/api/v1/incidents/pending-count');
    return res.data.count;
  } catch (error) {
    return 0;
  }
}

export async function getSimilarIncidents(id) {
  try {
    const res = await api.get(`/api/v1/incidents/${id}/similar`);
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getPendingIncidents() {
  try {
    const res = await api.get('/api/v1/incidents/pending');
    return Array.isArray(res.data) ? res.data : res.data.incidents;
  } catch (error) {
    handleError(error);
  }
}

export async function reviewIncident(id, data) {
  try {
    const res = await api.post(`/api/v1/incidents/${id}/review`, data);
    return res.data.incident || res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function draftResolutionMessage(incidentId) {
  try {
    const res = await api.post(`/api/v1/incidents/${incidentId}/draft-message`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function extractFileText(file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/api/v1/incidents/attachments/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data.text;
  } catch (error) {
    handleError(error);
  }
}

export async function getIncidentAttachments(incidentId) {
  try {
    const res = await api.get(`/api/v1/incidents/attachments/by-incident/${incidentId}`);
    return res.data.attachments || [];
  } catch (error) {
    handleError(error);
  }
}

export function getAttachmentFileUrl(attachmentId) {
  // Returned URL works directly in <img src> because axios sends cookies via withCredentials.
  // For images embedded in HTML, the browser carries the auth cookie automatically.
  const base = import.meta.env.VITE_API_URL || '';
  return `${base}/api/v1/incidents/attachments/${attachmentId}/file`;
}

export async function uploadIncidentAttachment(incidentId, file) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post(`/api/v1/incidents/attachments/${incidentId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data.attachment;
  } catch (error) {
    handleError(error);
  }
}

export async function getOutcomeHistory(incidentId) {
  try {
    const res = await api.get(`/api/v1/incidents/${incidentId}/outcome-history`);
    return res.data;
  } catch (error) {
    return { insufficient: true, reason: 'Unable to load history' };
  }
}

export async function getCustomerProfile(incidentId) {
  try {
    const res = await api.get(`/api/v1/incidents/${incidentId}/customer-profile`);
    return res.data?.profile || null;
  } catch {
    return null;
  }
}

export async function getAdminAnalytics() {
  try {
    const res = await api.get('/api/v1/admin/analytics');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getAdminMlStats() {
  try {
    const res = await api.get('/api/v1/admin/ml-stats');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getAdminModelHealth() {
  try {
    const res = await api.get('/api/v1/admin/model-health');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getAdminClusters() {
  try {
    const res = await api.get('/api/v1/admin/clusters');
    return Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    handleError(error);
  }
}

export async function getAdminRpaRuns(params = {}) {
  try {
    const res = await api.get('/api/v1/admin/rpa-runs', { params });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function exportTrainingCandidates() {
  try {
    const res = await api.get('/api/v1/admin/export/training-candidates', {
      responseType: 'blob',
    });
    return {
      blob: res.data,
      filename:
        res.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] ||
        'training_candidates.jsonl',
    };
  } catch (error) {
    handleError(error);
  }
}

export async function checkBackendHealth() {
  try {
    const res = await api.get('/api/v1/auth/me', {
      timeout: 10000,
      validateStatus: () => true,
    });

    return res.status >= 200 && res.status < 500;
  } catch (error) {
    return false;
  }
}

export async function getChatContext(token) {
  try {
    const res = await api.get(`/api/v1/chat/context/${token}`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function sendChatMessage(token, message) {
  try {
    const res = await api.post(`/api/v1/chat/message/${token}`, { message });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getChatStatus(token) {
  try {
    const res = await api.get(`/api/v1/chat/status/${token}`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getChatThread(token) {
  try {
    const res = await api.get(`/api/v1/chat/thread/${token}`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function submitSatisfaction(token, satisfied, comment) {
  try {
    const res = await api.post(`/api/v1/chat/satisfaction/${token}`, { satisfied, comment });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export const generateCallBrief = (incidentId) =>
  api.post(`/api/v1/incidents/${incidentId}/call-brief`).then((r) => r.data);

export const generateHandoverNote = (incidentId) =>
  api.post(`/api/v1/incidents/${incidentId}/handover`).then((r) => r.data);

export async function getAdminFeedbackMetrics() {
  try {
    const res = await api.get('/api/v1/admin/feedback-metrics');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

// ── W2: Admin Command Center ─────────────────────────────────────────────────

export async function getOpsHealth() {
  try {
    const res = await api.get('/api/v1/ops/health');
    return res.data;
  } catch {
    return { status: 'error', timestamp: new Date().toISOString() };
  }
}

export async function getOpsPipelineStats() {
  try {
    const res = await api.get('/api/v1/ops/pipeline-stats');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function retryPipelineJob(jobId) {
  try {
    const res = await api.post(`/api/v1/admin/pipeline-jobs/${jobId}/retry`);
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function bulkUpdateIncidentStatus(ids, status, note) {
  try {
    const res = await api.post('/api/v1/admin/incidents/bulk-status', { ids, status, note });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getAllIncidents(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.limit) params.set('limit', filters.limit);
    const res = await api.get(`/api/v1/incidents?${params.toString()}`);
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

// ── RPA Ops Panel ─────────────────────────────────────────────────────────────
// Fetches from /api/v1/rpa-runs (direct route, not admin proxy)
// Returns the last 20 runs including CREATIVE-1 narrative field.

export async function getRpaRuns() {
  try {
    const res = await api.get('/api/v1/rpa-runs');
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

// Returns per-item lineage records for a specific run.
export async function getRpaRunItems(rpaRunId) {
  try {
    const res = await api.get(`/api/v1/rpa-runs/${rpaRunId}/items`);
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

// ── Feature 1: Service Recovery Paradox ────────────────────────────────────────

// Fetch the recovery message for an incident.
export async function getRecoveryMessage(incidentId) {
  try {
    const res = await api.get(`/api/v1/incidents/${incidentId}/recovery`);
    return res.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    handleError(error);
  }
}

// Approve a hitl_required recovery message.
export async function approveRecovery(incidentId) {
  try {
    const res = await api.post(`/api/v1/incidents/${incidentId}/recovery/approve`);
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

// Reject a recovery message.
export async function rejectRecovery(incidentId) {
  try {
    const res = await api.post(`/api/v1/incidents/${incidentId}/recovery/reject`);
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

// ── Feature 3: Cascade Risk ───────────────────────────────────────────────────

// Fetch current cascade risk predictions for all active clusters.
export async function getCascadeRisk() {
  try {
    const res = await api.get('/api/v1/admin/cascade-risk');
    return res.data?.cascadeRisk ?? [];
  } catch (error) {
    handleError(error);
  }
}

// Trigger a hub manager alert for a specific source hub's cascade.
// Writes an alert file that the UiPath bot picks up asynchronously.
export async function triggerCascadeAlert(sourceHub) {
  try {
    const res = await api.post(
      `/api/v1/admin/cascade-risk/${encodeURIComponent(sourceHub)}/alert`,
    );
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

// Fetch cascade event history (predictions + alerts).
export async function getCascadeHistory() {
  try {
    const res = await api.get('/api/v1/admin/cascade-history');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

// Feature 5: Executive Morning Briefing — structured shift handover data.
export async function getMorningBriefing() {
  try {
    const res = await api.get('/api/v1/admin/morning-briefing');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

// Feature 5: Excellence-Mode Intelligence Map — natural language query.
export async function queryIntelligence(query) {
  try {
    const res = await api.post('/api/v1/admin/intelligence/query', { query });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getLearningMetrics() {
  try {
    const res = await api.get('/api/v1/admin/learning-metrics');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getRoiLive() {
  try {
    const res = await api.get('/api/v1/admin/roi-live');
    return res.data;
  } catch {
    return null;
  }
}

export async function getAutonomousConfig() {
  const res = await api.get('/api/v1/admin/autonomous-config');
  return res.data;
}

export async function setAutonomousConfig(enabled) {
  const res = await api.put('/api/v1/admin/autonomous-config', { enabled });
  return res.data;
}

export async function sendMorningBriefingEmail(email) {
  try {
    const res = await api.post('/api/v1/admin/morning-briefing/send', { email });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export function getLiveSequenceUrl() {
  return `${import.meta.env.VITE_API_URL}/api/v1/demo/live-sequence`;
}

export async function resetLiveSequence() {
  try {
    const res = await api.delete('/api/v1/demo/live-sequence-reset');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export function getFloodStreamUrl() {
  return `${import.meta.env.VITE_API_URL}/api/v1/demo/flood-stream`;
}

export async function resetFloodStream() {
  try {
    const res = await api.delete('/api/v1/demo/flood-reset');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export function getFlushWatchUrl() {
  return `${import.meta.env.VITE_API_URL}/api/v1/demo/flush-watch-stream`;
}

export async function resetFlushWatch() {
  try {
    const res = await api.delete('/api/v1/demo/flush-watch-reset');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function exportAuditLog() {
  const res = await api.get('/api/v1/admin/export/audit-log', { responseType: 'blob' });
  const date = new Date().toISOString().slice(0, 10);
  return { blob: res.data, filename: `nexus_audit_log_${date}.csv` };
}

export async function getOutboundHistory() {
  try {
    const res = await api.get('/api/v1/rpa-runs/outbound-history');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

// ── ML Retraining ─────────────────────────────────────────────────────────────

export async function triggerRetrain() {
  try {
    const res = await api.post('/api/v1/admin/retrain');
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getRetrainStatus() {
  try {
    const res = await api.get('/api/v1/admin/retrain/status');
    return res.data;
  } catch (error) {
    return { status: 'unknown' };
  }
}

export async function uploadTrainingCsv(file) {
  try {
    const formData = new FormData();
    formData.append('csv', file);
    const res = await api.post('/api/v1/admin/upload-training-data', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

// ── SOP Library ───────────────────────────────────────────────────────────────

export async function getSops() {
  try {
    const res = await api.get('/api/v1/admin/sops');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function createSop(data) {
  try {
    const res = await api.post('/api/v1/admin/sops', data);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function updateSop(code, data) {
  try {
    const res = await api.patch(`/api/v1/admin/sops/${encodeURIComponent(code)}`, data);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function deleteSop(code) {
  try {
    const res = await api.delete(`/api/v1/admin/sops/${encodeURIComponent(code)}`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function sendOpsChat(message, conversationHistory = []) {
  try {
    const res = await api.post('/api/v1/admin/ops-chat', { message, conversationHistory }, { timeout: 90000 });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function sendAdvisorChat(message, incident, history = []) {
  const ctx = incident
    ? `[INCIDENT ctx: id=${incident._id} type=${incident.type || '?'} severity=${incident.severity || '?'} status=${incident.status || '?'} location=${incident.location || '?'} customer=${incident.customerEmail || 'unknown'}]\n\n`
    : '';
  return sendOpsChat(ctx + message, history);
}

export async function getKbHealth() {
  try {
    const res = await api.get('/api/v1/admin/kb-health');
    return res.data;
  } catch { return null; }
}

export async function searchKb(query) {
  try {
    const res = await api.post('/api/v1/admin/kb-search', { query });
    return res.data;
  } catch { return { results: [] }; }
}

// ── Feature G: Proactive Communications ──────────────────────────────────────

export async function generateProactiveDocs(payload) {
  try {
    const res = await api.post('/api/v1/admin/proactive/generate', payload);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getProactiveSends() {
  try {
    const res = await api.get('/api/v1/admin/proactive');
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

export async function updateProactiveDocuments(id, documents) {
  try {
    const res = await api.patch(`/api/v1/admin/proactive/${id}/documents`, documents);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function regenerateProactiveDoc(id, docType) {
  try {
    const res = await api.post(`/api/v1/admin/proactive/${id}/regenerate/${docType}`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function sendProactiveDocs(id, documents) {
  try {
    const res = await api.post(`/api/v1/admin/proactive/${id}/send`, { documents });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function acknowledgeAlert(id, note = '') {
  try {
    const res = await api.post(`/api/v1/admin/proactive/${id}/acknowledge`, { note });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

// ── Feature F: Self-Writing SOP ──────────────────────────────────────────────

export async function generateSop(incidentType, location, clusterId = null) {
  try {
    const res = await api.post('/api/v1/admin/generate-sop', { incidentType, location, clusterId });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getSopDrafts() {
  try {
    const res = await api.get('/api/v1/admin/sop-drafts');
    return res.data; // { drafts, pendingCount }
  } catch (error) {
    return { drafts: [], pendingCount: 0 };
  }
}

export async function approveSopDraft(id) {
  try {
    const res = await api.post(`/api/v1/admin/sop-drafts/${id}/approve`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function rejectSopDraft(id) {
  try {
    const res = await api.post(`/api/v1/admin/sop-drafts/${id}/reject`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function batchReviewIncidents(ids, action, note = '') {
  try {
    const res = await api.post('/api/v1/incidents/batch-review', { ids, action, note });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

// ── Live Ops Center ───────────────────────────────────────────────────────────

export async function getOpsSummary() {
  try {
    const res = await api.get('/api/v1/ops/live-summary');
    return res.data;
  } catch {
    return null;
  }
}

export async function startOpsDemo() {
  try {
    const res = await api.post('/api/v1/ops/demo/start');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function resetOpsDemo() {
  try {
    const res = await api.post('/api/v1/ops/demo/reset');
    return res.data;
  } catch {
    return null;
  }
}

// ── Resolution Intelligence Archive ──────────────────────────────────────────
export async function getResolutionStats() {
  try {
    const res = await api.get('/api/v1/resolutions/stats');
    return res.data;
  } catch { return null; }
}

export async function getResolutions(params = {}) {
  try {
    const res = await api.get('/api/v1/resolutions', { params });
    return res.data;
  } catch { return { resolutions: [], total: 0, page: 1, pages: 1 }; }
}

export async function queueTraining(incidentId, humanValue) {
  try {
    const res = await api.post(`/api/v1/resolutions/${incidentId}/queue-training`, { humanValue });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function dequeueTraining(incidentId) {
  try {
    const res = await api.delete(`/api/v1/resolutions/${incidentId}/queue-training`);
    return res.data;
  } catch { return null; }
}

export async function batchTrain() {
  try {
    const res = await api.post('/api/v1/resolutions/batch-train');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function getSopProposals() {
  try {
    const res = await api.get('/api/v1/resolutions/sop-proposals');
    return res.data;
  } catch { return { proposals: [] }; }
}

export async function getResolutionModelInfo() {
  try {
    const res = await api.get('/api/v1/resolutions/model-info');
    return res.data;
  } catch { return null; }
}

export async function embedResolution(incidentId) {
  try {
    const res = await api.post(`/api/v1/resolutions/${incidentId}/embed`);
    return res.data;
  } catch { return null; }
}

export async function bulkQueueTraining(incidentIds) {
  try {
    const res = await api.post('/api/v1/resolutions/bulk-queue-training', { incidentIds });
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function sendAgentReply(incidentId, message) {
  const res = await api.post(`/api/v1/incidents/${incidentId}/reply`, { message });
  return res.data;
}

export async function getChatLink(incidentId) {
  const res = await api.get(`/api/v1/incidents/${incidentId}/chat-link`);
  return res.data;
}

// ── RPA Mission Control ────────────────────────────────────────────────────────

export async function getRpaStats() {
  try {
    const res = await api.get('/api/v1/rpa/stats');
    return res.data;
  } catch {
    return { totalRuns: 0, totalFiles: 0, totalDuplicates: 0, totalFailed: 0, successRate: 0, lastRunAt: null, lastRun: null };
  }
}

export async function getRpaStatus() {
  try {
    const res = await api.get('/api/v1/rpa/status');
    return res.data;
  } catch {
    return { running: false, jobId: null };
  }
}

export async function triggerRpa(demo = false) {
  try {
    const res = await api.post('/api/v1/rpa/trigger', { demo });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function triggerCloudDispatcher() {
  try {
    const res = await api.post('/api/v1/rpa/trigger-cloud-run');
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getCloudJobStatus(jobKey) {
  try {
    const res = await api.get(`/api/v1/rpa/cloud-job/${encodeURIComponent(jobKey)}`);
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getRpaRunCases(runId) {
  try {
    const res = await api.get(`/api/v1/rpa/runs/${encodeURIComponent(runId)}/cases`);
    return res.data;
  } catch (error) {
    handleError(error);
    return { run: null, cases: [] };
  }
}

// ── Knowledge Observatory ─────────────────────────────────────────────────────

export async function queryKnowledge(query) {
  try {
    const res = await api.post('/api/v1/knowledge/query', { query }, { timeout: 90000 });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getEmbeddingSpace() {
  try {
    const res = await api.get('/api/v1/knowledge/embedding-space');
    return res.data;
  } catch {
    return { points: [], total: 0, message: 'Embedding space unavailable' };
  }
}

export async function getKnowledgeHealth() {
  try {
    const res = await api.get('/api/v1/knowledge/health');
    return res.data;
  } catch {
    return {
      healthScore: 0,
      totalSops: 0,
      totalEmbeddings: 0,
      pendingDrafts: 0,
      coverageGaps: [],
      staleSops: [],
      corpusGrowth: [],
    };
  }
}

export async function getAuditLogList({ limit = 100, actorType, action, search } = {}) {
  try {
    const params = { limit };
    if (actorType) params.actorType = actorType;
    if (action) params.action = action;
    if (search) params.search = search;
    const res = await api.get('/api/v1/admin/audit-log', { params });
    return res.data;
  } catch {
    return { logs: [], total: 0, actorBreakdown: {} };
  }
}

export async function getOutboundEmails({ limit = 100, status, search } = {}) {
  try {
    const params = { limit };
    if (status) params.status = status;
    if (search) params.search = search;
    const res = await api.get('/api/v1/admin/outbound-emails', { params });
    return res.data;
  } catch {
    return { emails: [], statusBreakdown: {} };
  }
}

export async function getRpaRunsList() {
  try {
    const res = await api.get('/api/v1/admin/rpa-runs');
    return res.data;
  } catch {
    return { runs: [] };
  }
}

export async function getRetrainHistory({ limit = 50 } = {}) {
  try {
    const res = await api.get('/api/v1/admin/retrain/history', { params: { limit } });
    return res.data;
  } catch {
    return { runs: [], latest: null, total: 0, successCount: 0, successRate: 0 };
  }
}

export async function getKnowledgeGraphEdges() {
  try {
    const res = await api.get('/api/v1/admin/knowledge-graph-edges');
    return res.data;
  } catch {
    return { edges: [] };
  }
}

// ── NEXUS Brain ─────────────────────────────────────────────────────────────

export async function getBrainFolders() {
  try {
    const res = await api.get('/api/v1/brain/folders');
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getBrainRecords(folderId, limit = 50) {
  try {
    const res = await api.get('/api/v1/brain/records', { params: { folderId, limit } });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function queryBrain(payload) {
  try {
    const res = await api.post('/api/v1/brain/query', payload, { timeout: 90000 });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function executeBrainAction({ operation, payload, query }) {
  try {
    const res = await api.post('/api/v1/brain/actions/execute', { operation, payload, query }, { timeout: 30000 });
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function demoLearningSeed() {
  try {
    const res = await api.post('/api/v1/demo/learning-seed');
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function demoLearningFollowup() {
  try {
    const res = await api.post('/api/v1/demo/learning-followup');
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function demoLearningStatus() {
  try {
    const res = await api.get('/api/v1/demo/learning-status');
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function demoReset() {
  try {
    const res = await api.delete('/api/v1/demo/reset');
    return res.data;
  } catch (error) {
    throw buildRichError(error);
  }
}

export async function getProactivePendingCount() {
  try {
    const res = await api.get('/api/v1/admin/proactive/pending-count');
    return res.data?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function demoProactiveSeed() {
  try {
    const res = await api.post('/api/v1/demo/proactive-seed');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}

export async function demoProactiveReset() {
  try {
    const res = await api.delete('/api/v1/demo/proactive-reset');
    return res.data;
  } catch (error) {
    handleError(error);
  }
}
