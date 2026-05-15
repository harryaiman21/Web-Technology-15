const clients = new Set();

export function register(res) {
  clients.add(res);
}

export function unregister(res) {
  clients.delete(res);
}

export function broadcast(event) {
  const payload = `data: ${JSON.stringify({ ...event, timestamp: Date.now() })}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

// Convenience helper for broadcasting incident state changes that the
// Incident Board (or any consumer) can use to live-update without a full
// fetch. Pass the incident document (lean or hydrated) — only public-safe
// fields are forwarded over the wire.
export function broadcastIncidentUpdate(incident, action = 'incident_updated') {
  if (!incident || !incident._id) return;
  broadcast({
    type:        action, // 'incident_created' | 'incident_updated' | 'incident_deleted'
    incidentId:  String(incident._id),
    incident: {
      _id:                  String(incident._id),
      title:                incident.title || null,
      description:          (incident.description || '').slice(0, 280),
      status:               incident.status || null,
      severity:             incident.severity || null,
      type:                 incident.type || null,
      department:           incident.department || null,
      location:             incident.location || null,
      confidence:           incident.confidence ?? null,
      source:               incident.source || null,
      customerEmail:        incident.customerEmail || null,
      awbNumber:            incident.awbNumber || null,
      sentimentScore:       incident.sentimentScore ?? null,
      sentimentLabel:       incident.sentimentLabel || null,
      isRepeatCustomer:     incident.isRepeatCustomer || false,
      customerHistoryCount: incident.customerHistoryCount || 0,
      holdForReview:        incident.holdForReview || false,
      slaDeadline:          incident.slaDeadline || incident.sla?.deadlineAt || null,
      sla: incident.sla ? {
        deadlineAt:        incident.sla.deadlineAt || null,
        breachProbability: incident.sla.breachProbability ?? null,
        hoursRemaining:    incident.sla.hoursRemaining ?? null,
        breachedAt:        incident.sla.breachedAt || null,
      } : null,
      createdAt: incident.createdAt || null,
      updatedAt: incident.updatedAt || new Date(),
    },
  });
}
