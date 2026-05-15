// backend/src/services/sse.service.js
// Manages Server-Sent Events connections.
// NOTE: Headers are set by the route BEFORE calling register().
// This service only writes data to the existing open response.

const clients = new Map(); // Map<incidentId, res>

export function register(incidentId, res) {
  clients.set(incidentId, res);
  res.write(": connected\n\n");
}

export function emit(incidentId, eventData) {
  const res = clients.get(incidentId);
  if (!res) return;

  if (!eventData.timestamp) {
    eventData.timestamp = Date.now();
  }

  if (eventData.event) {
    res.write(`event: ${eventData.event}\n`);
  }

  res.write(`data: ${JSON.stringify(eventData)}\n\n`);
}

export function close(incidentId) {
  const res = clients.get(incidentId);
  if (res) {
    emit(incidentId, { type: "complete", timestamp: Date.now() });
    res.end();
    clients.delete(incidentId);
  }
}

export function cleanup(incidentId) {
  clients.delete(incidentId);
}
