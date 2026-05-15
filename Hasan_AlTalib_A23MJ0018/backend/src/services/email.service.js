import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import Incident from "../models/Incident.model.js";
import OutboundEmail from "../models/OutboundEmail.model.js";
import AuditLog from "../models/AuditLog.model.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const SMTP_HOST    = process.env.SMTP_HOST    || "smtp.gmail.com";
const SMTP_PORT    = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER    = process.env.SMTP_USER    || "";
const SMTP_PASS    = (process.env.SMTP_PASS   || "").replace(/\s/g, ""); // Gmail shows spaces for readability; SMTP needs them stripped

let transporter = null;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   SMTP_PORT,
    secure: false,
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
    tls:    { rejectUnauthorized: false },
  });
  console.log(`[email-service] SMTP configured — ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);
} else {
  console.log("[email-service] SMTP not configured (set SMTP_USER + SMTP_PASS). Emails will be queued only.");
}

export function generateChatToken(incident) {
  const context = {
    incidentId: incident._id.toString(),
    type: incident.type,
    location: incident.location || incident.agentResults?.request?.location,
    severity: incident.severity,
    status: incident.status,
    description: incident.description,
    resolutionSteps: incident.agentResults?.resolution?.steps || [],
    sopCode:
      incident.agentResults?.resolution?.sopCode ||
      incident.agentResults?.sop?.match ||
      null,
    awbNumber: incident.awbNumber || null,
    detectedLanguage: incident.detectedLanguage || "en",
    reporterEmail: getReporterEmail(incident),
    createdAt: incident.createdAt,
  };
  return jwt.sign(context, JWT_SECRET + "chat", { expiresIn: "72h" });
}

function getReporterEmail(incident) {
  const fields = incident?.agentResults?.intake?.fields || {};
  const candidates = [
    fields.reporterEmail?.value,
    fields.customerEmail?.value,
    fields.email?.value,
    fields.from?.value,
    incident?.agentResults?.request?.customerEmail,
  ];
  return candidates.find((v) => typeof v === "string" && v.includes("@")) || null;
}

async function buildAcknowledgementEmail(incident, chatUrl) {
  const typeLabel = String(incident.type || "incident").replace(/_/g, " ");
  const caseId = incident._id.toString().slice(-8).toUpperCase();
  const caseRef = `INC-${caseId.slice(-6)}`;

  const subject = `DHL Case ${caseRef} — We've received your ${typeLabel} report`;

  // Lazy-import to avoid a require cycle (proactiveEmail does not depend on
  // email.service, but the extra robustness is cheap).
  const { buildAcknowledgmentCustomerEmail } = await import("./proactiveEmail.service.js");
  const body = buildAcknowledgmentCustomerEmail({
    caseRef,
    incidentType: incident.type,
    severity:     incident.severity,
    chatUrl,
  });

  return { subject, body };
}

export async function sendAcknowledgement(incidentId) {
  try {
    const incident = await Incident.findById(incidentId).lean();
    if (!incident) {
      console.error(`[email-service] Incident ${incidentId} not found`);
      return { sent: false, reason: "incident_not_found" };
    }

    const toEmail =
      incident.customerEmail ||
      getReporterEmail(incident) ||
      null;

    if (!toEmail) {
      console.log(`[email-service] No customer email for incident ${incidentId} — skipping`);
      return { sent: false, reason: "no_customer_email" };
    }

    const chatToken = generateChatToken(incident);
    const chatUrl = `${FRONTEND_URL}/chat/${chatToken}`;
    const { subject, body } = await buildAcknowledgementEmail(incident, chatUrl);

    const emailRecord = await OutboundEmail.create({
      incidentId: incident._id,
      toEmail,
      subject,
      body,
      language: incident.detectedLanguage || "en",
      status: "queued",
      approvedBy: "system-auto",
    });

    if (transporter) {
      const isHtml = typeof body === "string"
        && (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html"));
      await transporter.sendMail({
        from: `"DHL NEXUS Support" <${SMTP_USER}>`,
        to: toEmail,
        subject,
        ...(isHtml
          ? { html: body, text: "Please view this email in an HTML-capable client." }
          : { text: body }),
      });

      await OutboundEmail.findByIdAndUpdate(emailRecord._id, {
        status: "sent",
        sentAt: new Date(),
      });

      console.log(`[email-service] Acknowledgement sent to ${toEmail} for incident ${incidentId}`);

      await AuditLog.create({
        incidentId: incident._id,
        actor: "system",
        actorType: "system",
        action: "auto_acknowledgement_sent",
        newValue: { toEmail, chatUrl, method: "smtp" },
        timestamp: new Date(),
      });

      return { sent: true, toEmail, chatUrl, method: "smtp" };
    }

    console.log(`[email-service] Email queued (no SMTP) for ${toEmail}, incident ${incidentId}`);
    return { sent: false, reason: "no_smtp", queued: true, toEmail, chatUrl };
  } catch (error) {
    console.error(`[email-service] Failed to send acknowledgement for ${incidentId}:`, error.message);
    return { sent: false, reason: "error", error: error.message };
  }
}

export async function sendEmail(to, subject, body) {
  if (!transporter) {
    console.log("[email-service] No SMTP — cannot send");
    return false;
  }
  const isHtml = body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html");
  await transporter.sendMail({
    from: `"DHL NEXUS Support" <${SMTP_USER}>`,
    to,
    subject,
    ...(isHtml ? { html: body, text: "Please view this email in an HTML-capable client." } : { text: body }),
  });
  return true;
}

const MAX_RETRIES = 3;

export async function processOutboundQueue() {
  if (!transporter) return { processed: 0, reason: "no_smtp" };

  const queued = await OutboundEmail.find({
    status: "queued",
    retryCount: { $lt: MAX_RETRIES },
  })
    .sort({ createdAt: 1 })
    .limit(20)
    .lean();

  let sent = 0;
  for (const email of queued) {
    const nextRetry = (email.retryCount || 0) + 1;
    try {
      // Auto-detect HTML bodies so the queued recovery / acknowledgment
      // emails (which are full HTML documents) render correctly in the
      // recipient's mail client. Plain-text bodies fall through unchanged.
      const body = email.body || "";
      const isHtml = body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html");
      await transporter.sendMail({
        from: `"DHL NEXUS Support" <${SMTP_USER}>`,
        to: email.toEmail,
        subject: email.subject,
        ...(isHtml
          ? { html: body, text: "Please view this email in an HTML-capable client." }
          : { text: body }),
      });
      await OutboundEmail.findByIdAndUpdate(email._id, {
        status: "sent",
        sentAt: new Date(),
        lastAttemptAt: new Date(),
      });
      sent++;
    } catch (err) {
      await OutboundEmail.findByIdAndUpdate(email._id, {
        $inc: { retryCount: 1 },
        $set: {
          lastAttemptAt: new Date(),
          error: err.message,
          ...(nextRetry >= MAX_RETRIES ? { status: "failed" } : {}),
        },
      });
      if (nextRetry >= MAX_RETRIES) {
        console.error(`[email-service] email ${email._id} permanently failed after ${MAX_RETRIES} attempts`);
      }
    }
  }
  return { processed: queued.length, sent };
}
