import Incident from '../models/Incident.model.js';
import OutboundEmail from '../models/OutboundEmail.model.js';
import ProactiveSend from '../models/ProactiveSend.model.js';
import AuditLog from '../models/AuditLog.model.js';
import { sendEmail } from './email.service.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const OPS_EMAIL = process.env.OPS_EMAIL || process.env.SMTP_USER || '';

function extractCustomerEmail(incident) {
  return (
    incident.customerEmail ||
    incident.agentResults?.intake?.fields?.reporterEmail?.value ||
    incident.agentResults?.intake?.fields?.customerEmail?.value ||
    incident.agentResults?.intake?.fields?.email?.value ||
    incident.agentResults?.request?.customerEmail ||
    null
  );
}

function buildCustomerSubject(incidentType, location, language) {
  const typeLabel = (incidentType || 'delivery').replace(/_/g, ' ');
  if (language === 'ms') {
    return `Makluman DHL — Masalah ${typeLabel} di ${location}`;
  }
  return `DHL Service Notice — ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} at ${location}`;
}

function buildCustomerBody(incidentType, location, clusterCount, language, awb) {
  const typeLabel = (incidentType || 'delivery issue').replace(/_/g, ' ');
  const awbLine = awb ? (language === 'ms' ? `Nombor AWB anda: ${awb}` : `Your AWB number: ${awb}`) : '';

  if (language === 'ms') {
    return `Yang Dihormati Pelanggan,

Kami ingin memaklumkan bahawa kami sedang mengalami ${typeLabel} yang mempengaruhi penghantaran di ${location}. Isu ini telah dikesan oleh sistem NEXUS AI kami yang memantau pola aduan secara masa nyata.

${awbLine}

**Tindakan yang sedang diambil:**
1. Pasukan operasi ${location} telah dimaklumkan dan sedang mengambil tindakan segera
2. Kes anda telah ditandakan sebagai keutamaan tinggi dalam sistem kami
3. Seorang ejen dedikasi telah ditugaskan untuk memantau perkembangan kes anda

Kami memohon maaf atas kesulitan ini dan berkomitmen untuk menyelesaikan isu anda secepat mungkin. Anda boleh memantau status penghantaran anda di ${FRONTEND_URL}.

Jika anda memerlukan bantuan segera, sila balas emel ini.

Salam hormat,
Pasukan DHL Customer Experience
(Dihantar secara automatik oleh NEXUS AI — ${new Date().toLocaleDateString('ms-MY')})`;
  }

  return `Dear Valued Customer,

We are writing to inform you that we are currently experiencing ${typeLabel} issues affecting shipments at ${location}. This has been automatically detected by our NEXUS AI monitoring system, which identified a pattern across ${clusterCount} related cases.

${awbLine}

**Actions already underway:**
1. ${location} operations team has been alerted and is taking immediate corrective action
2. Your case has been flagged as high priority in our system
3. A dedicated agent has been assigned to monitor your shipment status

We sincerely apologise for this inconvenience. You can track your shipment status at ${FRONTEND_URL}.

If you require immediate assistance, please reply to this email or contact our Customer Experience team.

Yours sincerely,
DHL Customer Experience Team
(Auto-sent by NEXUS AI — ${new Date().toLocaleDateString('en-GB')})`;
}

function buildOpsEscalationBody(cluster, affectedCount, customerEmails) {
  const typeLabel = (cluster.type || 'incident').replace(/_/g, ' ');
  const emailList = customerEmails.slice(0, 10).join(', ') + (customerEmails.length > 10 ? ` ...and ${customerEmails.length - 10} more` : '');

  return `NEXUS AI — Cluster Customer Notification Report

Cluster ID:    ${cluster.clusterId}
Hub:           ${cluster.location}
Incident Type: ${typeLabel}
Cluster Size:  ${cluster.count} incidents
Emails Sent:   ${affectedCount} customers notified

Customers notified:
${emailList}

This notification was sent automatically by NEXUS AI when the cluster threshold was reached.
All outbound emails have been queued for delivery and will be processed by the email flusher.

View cluster details: ${FRONTEND_URL}/board

— NEXUS Autonomous Notification System`;
}

/**
 * Notify all customers affected by a cluster incident.
 * Creates OutboundEmail queue records for each affected customer.
 * Updates the ProactiveSend record with customerEmailsContacted.
 * Returns { notified: number, emails: string[] }
 */
export async function notifyClusterCustomers(cluster) {
  if (!cluster?.clusterId || !cluster?.location) {
    return { notified: 0, emails: [] };
  }

  try {
    // Find all incidents in this cluster
    const clusterIncidents = await Incident.find({
      $or: [
        { clusterGroup: cluster.clusterId },
        { type: cluster.type, location: cluster.location, createdAt: { $gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } },
      ],
    }).lean();

    if (!clusterIncidents.length) {
      return { notified: 0, emails: [] };
    }

    // Extract unique customer emails (skip missing)
    const seen = new Set();
    const targets = [];

    for (const inc of clusterIncidents) {
      const email = extractCustomerEmail(inc);
      if (email && !seen.has(email)) {
        seen.add(email);
        targets.push({ email, incident: inc });
      }
    }

    if (!targets.length) {
      return { notified: 0, emails: [] };
    }

    // Create OutboundEmail records for each customer
    const queued = [];
    for (const { email, incident } of targets) {
      const language = incident.detectedLanguage || 'en';
      const subject = buildCustomerSubject(cluster.type, cluster.location, language);
      const body = buildCustomerBody(
        cluster.type,
        cluster.location,
        cluster.count,
        language,
        incident.awbNumber || null,
      );

      const outbound = await OutboundEmail.create({
        incidentId: incident._id,
        toEmail: email,
        subject,
        body,
        language,
        status: 'queued',
        approvedBy: 'nexus-autonomous',
        metadata: { clusterId: cluster.clusterId, trigger: 'cluster_notification' },
      });

      queued.push({ id: outbound._id, email });

      await AuditLog.create({
        incidentId: incident._id,
        actor: 'nexus-autonomous',
        actorType: 'system',
        action: 'cluster_notification_queued',
        newValue: { clusterId: cluster.clusterId, toEmail: email },
        timestamp: new Date(),
      });
    }

    const customerEmails = queued.map((q) => q.email);

    // Update ProactiveSend if one exists for this cluster
    await ProactiveSend.findOneAndUpdate(
      { clusterId: cluster.clusterId },
      {
        $set: {
          customerEmailsContacted: customerEmails,
          'documents.customerEmail': buildCustomerBody(cluster.type, cluster.location, cluster.count, 'en', null),
        },
      },
    );

    // Notify ops manager that cluster emails were queued
    if (OPS_EMAIL) {
      const opsBody = buildOpsEscalationBody(cluster, customerEmails.length, customerEmails);
      await sendEmail(
        OPS_EMAIL,
        `[NEXUS] Cluster Alert — ${customerEmails.length} customers notified at ${cluster.location}`,
        opsBody,
      ).catch(() => {}); // non-fatal
    }

    console.log(`[cluster-notify] Queued ${customerEmails.length} emails for cluster ${cluster.clusterId} at ${cluster.location}`);
    return { notified: customerEmails.length, emails: customerEmails };

  } catch (err) {
    console.error('[cluster-notify] Failed (non-fatal):', err.message);
    return { notified: 0, emails: [] };
  }
}
