import Incident from '../models/Incident.model.js';
import { sendEmail } from './email.service.js';
import { getActiveClusters } from './clusterDetection.service.js';

function roundTo(value, decimals = 1) {
  return Math.round(Number(value) * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

const SLA_HRS = { Critical: 2, High: 4, Medium: 8, Low: 24 };

function severityBadge(s) {
  const colors = { Critical: '#ef4444', High: '#f97316', Medium: '#fbbf24', Low: '#22d3ee' };
  return `<span style="background:${colors[s] || '#64748b'};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${s || 'Med'}</span>`;
}

/**
 * Builds and sends the NEXUS Morning Intelligence Briefing email.
 * @param {string} toEmail
 * @returns {{ sent: boolean, subject: string, briefing: object }}
 */
export async function sendMorningBriefing(toEmail) {
  const now = new Date();
  const midnightLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const [newIncidents, resolvedIncidents, allOvernight] = await Promise.all([
    Incident.countDocuments({ createdAt: { $gte: midnightLocal } }),
    Incident.countDocuments({ status: 'RESOLVED', updatedAt: { $gte: midnightLocal } }),
    Incident.find({ createdAt: { $gte: midnightLocal } }, 'status holdForReview').lean(),
  ]);

  const hitlCount = allOvernight.filter((i) => i.holdForReview).length;
  const hitlRate = allOvernight.length > 0 ? roundTo((hitlCount / allOvernight.length) * 100, 1) : 0;

  const activeIncidents = await Incident.find(
    { status: { $in: ['OPEN', 'ASSIGNED', 'PENDING_REVIEW', 'DRAFT', 'UNDER_REVIEW', 'IN_PROGRESS'] } },
    '_id type location severity holdForReview createdAt',
  ).lean();

  const needsActionNow = activeIncidents
    .map((inc) => {
      const slaMs = (SLA_HRS[inc.severity] || 8) * 3600000;
      const deadline = new Date(new Date(inc.createdAt || now).getTime() + slaMs);
      const hoursUntil = roundTo((deadline - now) / 3600000, 1);
      return { inc, hoursUntil };
    })
    .filter(({ hoursUntil }) => hoursUntil < 4)
    .sort((a, b) => a.hoursUntil - b.hoursUntil)
    .slice(0, 5)
    .map(({ inc, hoursUntil }) => ({
      type: inc.type || 'unknown',
      location: inc.location || 'Unknown',
      severity: inc.severity || 'Medium',
      hoursUntilBreach: hoursUntil,
      reason: hoursUntil < 0
        ? `SLA breached ${Math.abs(hoursUntil).toFixed(1)}h ago`
        : `SLA breach in ${hoursUntil.toFixed(1)}h`,
    }));

  const clusters = await getActiveClusters().catch(() => []);

  const dateStr = now.toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });

  const topHub = clusters.length > 0 ? (clusters[0].location || 'Shah Alam Hub') : 'Shah Alam Hub';
  const subject = `NEXUS Daily Briefing — ${topHub} — ${clusters.length} active cluster${clusters.length !== 1 ? 's' : ''}, ${needsActionNow.length} SLA risk${needsActionNow.length !== 1 ? 's' : ''} — ${dateStr}`;

  let firstAction = 'All SLAs on track — no urgent action required at shift start.';
  if (clusters.length > 0) {
    const c = clusters[0];
    firstAction = `Investigate ${String(c.type || '').replace(/_/g, ' ')} cluster at ${c.location} — ${c.count} incidents detected in the last 72 hours.`;
  } else if (needsActionNow.length > 0) {
    const n = needsActionNow[0];
    firstAction = `Address ${n.type.replace(/_/g, ' ')} at ${n.location} — ${n.reason}.`;
  }

  const needsActionRows = needsActionNow.length > 0
    ? needsActionNow.map((item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${String(item.type).replace(/_/g, ' ')}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${item.location}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;">${severityBadge(item.severity)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:${item.hoursUntilBreach < 0 ? '#ef4444' : item.hoursUntilBreach < 2 ? '#f97316' : '#fbbf24'};font-size:13px;font-weight:600;">${item.reason}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#64748b;font-size:13px;">No urgent incidents — all SLAs on track</td></tr>`;

  const clusterRows = clusters.slice(0, 5).map((c) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${String(c.type || '').replace(/_/g, ' ')}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${c.location || '—'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#22d3ee;font-size:13px;font-weight:700;">${c.count || 0}</td>
        </tr>`).join('') || `<tr><td colspan="3" style="padding:16px;text-align:center;color:#64748b;font-size:13px;">No active clusters detected</td></tr>`;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030712;padding:32px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#0a0f1e;border:1px solid #1e293b;border-radius:12px;overflow:hidden;max-width:620px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#0a1628 100%);padding:28px 32px;border-bottom:1px solid #1e293b;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.15em;color:#22d3ee;text-transform:uppercase;">DHL NEXUS AI Platform</p>
                  <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#f1f5f9;">Morning Intelligence Briefing</h1>
                  <p style="margin:4px 0 0;font-size:13px;color:#64748b;">${dateStr} &bull; ${timeStr} MYT</p>
                </td>
                <td align="right" style="vertical-align:top;">
                  <div style="background:#22d3ee18;border:1px solid #22d3ee40;border-radius:8px;padding:10px 14px;text-align:center;">
                    <p style="margin:0;font-size:28px;font-weight:800;color:#22d3ee;">${newIncidents}</p>
                    <p style="margin:2px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">Today's Cases</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- KPI Strip -->
        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #1e293b;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="width:25%;padding:0 8px;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#10b981;">${resolvedIncidents}</p>
                  <p style="margin:4px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Resolved Today</p>
                </td>
                <td align="center" style="width:25%;padding:0 8px;border-left:1px solid #1e293b;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#fbbf24;">${needsActionNow.length}</p>
                  <p style="margin:4px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Need Action Now</p>
                </td>
                <td align="center" style="width:25%;padding:0 8px;border-left:1px solid #1e293b;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#a78bfa;">${clusters.length}</p>
                  <p style="margin:4px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Active Clusters</p>
                </td>
                <td align="center" style="width:25%;padding:0 8px;border-left:1px solid #1e293b;">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#22d3ee;">${hitlRate}%</p>
                  <p style="margin:4px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">HITL Rate</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Recommended First Action -->
        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #1e293b;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#22d3ee;text-transform:uppercase;">Recommended First Action</p>
            <p style="margin:0;font-size:14px;color:#f1f5f9;line-height:1.6;">${firstAction}</p>
          </td>
        </tr>

        <!-- Needs Action Now -->
        <tr>
          <td style="padding:24px 32px 0;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#ef4444;text-transform:uppercase;">Needs Action Now</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1e293b;border-radius:8px;overflow:hidden;">
              <tr style="background:#0f172a;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Type</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Hub</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Severity</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">SLA Status</th>
              </tr>
              ${needsActionRows}
            </table>
          </td>
        </tr>

        <!-- Active Clusters -->
        <tr>
          <td style="padding:24px 32px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#a78bfa;text-transform:uppercase;">Active Incident Clusters</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1e293b;border-radius:8px;overflow:hidden;">
              <tr style="background:#0f172a;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Type</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Location</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Count</th>
              </tr>
              ${clusterRows}
            </table>
          </td>
        </tr>

        <!-- CTA Footer -->
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #1e293b;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding-bottom:16px;">
                  <a href="${frontendUrl}/admin"
                     style="display:inline-block;background:#22d3ee;color:#030712;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:13px;letter-spacing:0.02em;">
                    Open NEXUS Dashboard
                  </a>
                </td>
              </tr>
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;color:#334155;text-align:center;line-height:1.5;">
                    NEXUS AI Platform &bull; DHL Malaysia Operations<br>
                    Auto-generated at ${timeStr} MYT &bull; Do not reply to this email
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const sent = await sendEmail(toEmail, subject, htmlBody);
  return {
    sent: !!sent,
    subject,
    briefing: { newIncidents, resolvedIncidents, hitlRate, needsActionNow, clusters: clusters.length },
  };
}
