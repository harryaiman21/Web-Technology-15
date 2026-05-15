// backend/src/routes/ops.routes.js

import { Router } from "express";
import Incident from "../models/Incident.model.js";
import PipelineJob from "../models/PipelineJob.model.js";
import BotEvent from "../models/BotEvent.model.js";
import RpaRun from "../models/RpaRun.model.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireRpaAuth } from "../middleware/rpaAuth.middleware.js";
import {
  getEventsForIncident,
  getEventsForJob,
  getJobForIncident,
  getJobsForIncident,
} from "../services/pipelineJobs.service.js";
import { register as lsRegister, unregister as lsUnregister, broadcast as lsBroadcast } from "../services/liveStream.service.js";

const router = Router();

const demoTimers = new Set();

function broadcastOpsEvent(event) {
  lsBroadcast(event?.toObject ? event.toObject() : event);
}

// ── Rich customer story data ──────────────────────────────────────────────────
const STORIES = {
  ahmadRazif: {
    emailBody: `Subject: Urgent — Parcel AWB778234591 Not Delivered

Dear DHL Customer Support,

I am writing with urgency regarding my parcel AWB778234591 which has not been delivered as scheduled. The tracking shows it has been stationary at Shah Alam Hub for 2 days with no movement update.

I need this parcel for an important business meeting tomorrow morning. The delay is causing serious disruption to my work commitments.

Please provide an immediate resolution.

Best regards,
Ahmad Razif
+60 12-345 6789`,
    aiResponse: `Dear Ahmad Razif,

Thank you for contacting DHL Malaysia. We sincerely apologise for the delay to your shipment AWB778234591.

Our operations team at Shah Alam Hub has been immediately alerted and your parcel is now prioritised for same-day dispatch. You can expect a delivery attempt within the next 4–6 hours. A real-time tracking update has been triggered to your registered contact.

Should delivery not be possible today, our team will arrange a dedicated time slot before your meeting tomorrow.

We value your trust in DHL and appreciate your patience.

Warm regards,
NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Standard Late Delivery Response Protocol",
      factors: [
        "94% classification confidence — above auto-response threshold (80%)",
        "SOP LD-001 successfully applied 14× this month at Shah Alam Hub",
        "Hub-level delay pattern detected: 2 late-delivery cases at same hub this week",
        "Contact within business hours → immediate acknowledgment + hub escalation applied",
      ],
      similarCases: [
        { customer: "Raj Kumar", hub: "Shah Alam Hub", date: "28 Apr 2026", outcome: "resolved", satisfactionScore: 4.8 },
        { customer: "Amirul Hakeem", hub: "Shah Alam Hub", date: "22 Apr 2026", outcome: "resolved", satisfactionScore: 4.6 },
      ],
    },
  },

  nurulAina: {
    emailBody: `Subject: Damaged Parcel Received — AWB990112334

Hello DHL,

I received my parcel AWB990112334 today and was shocked to find it completely damaged. The outer box was crushed and the contents inside are broken. I have attached photos of the damage.

I paid for careful handling and this is unacceptable. I require either a replacement or full refund immediately.

Nurul Aina`,
    aiResponse: `Dear Nurul Aina,

We are truly sorry to learn about the condition of your parcel AWB990112334 upon delivery. This falls far short of the standard we hold ourselves to.

A damage claim has been registered on your behalf (Ref: DMG-20260501-334). Our customer relations team will contact you within 2 business hours to arrange either a full replacement or refund — whichever you prefer. Please retain the damaged packaging for our courier's inspection.

We deeply apologise for this experience.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Damaged Parcel Claims and Compensation Protocol",
      factors: [
        "87% confidence — above auto-response threshold",
        "SOP DP-003 (Damage Claim) matched: customer explicitly reports physical damage with photo evidence",
        "No prior complaint from this customer — standard compensation pathway applied",
        "Damage at KLIA Cargo — flagged to hub quality team for handler review",
      ],
      similarCases: [
        { customer: "Lee Siew", hub: "Penang Hub", date: "25 Apr 2026", outcome: "resolved", satisfactionScore: 4.7 },
        { customer: "Chen Wei", hub: "JB Distribution", date: "18 Apr 2026", outcome: "resolved", satisfactionScore: 4.4 },
      ],
    },
  },

  rajKumar: {
    emailBody: `Subject: My Parcel AWB445667821 is Late

Hi,

My shipment AWB445667821 was meant to arrive 2 days ago. I've been checking the tracking and it keeps showing "In transit" at Shah Alam. Can someone please tell me what is happening?

I have been a DHL customer for years and this has never happened before.

Raj Kumar`,
    aiResponse: `Dear Raj Kumar,

Thank you for your patience and for being a valued long-term DHL customer.

We have located your parcel AWB445667821 and can confirm it is being processed at Shah Alam Hub. A dedicated delivery attempt will be made within the next 3 hours. You will receive an SMS confirmation once your parcel is out for delivery.

We appreciate your continued trust in DHL.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Standard Late Delivery Response Protocol",
      factors: [
        "91% classification confidence — high-certainty late delivery",
        "Returning customer detected — loyalty acknowledgment applied in response tone",
        "SOP LD-001 matched; delivery window communicated as 3h (hub proximity factor)",
        "No prior unresolved complaints on record — standard auto-response appropriate",
      ],
      similarCases: [
        { customer: "Ahmad Razif", hub: "Shah Alam Hub", date: "1 May 2026", outcome: "resolved", satisfactionScore: 4.9 },
        { customer: "Yasmin Aziz", hub: "Subang Jaya Depot", date: "27 Apr 2026", outcome: "resolved", satisfactionScore: 4.5 },
      ],
    },
  },

  globalTrade: {
    emailBody: `Subject: URGENT: Customs Clearance Delay — 6 Shipments Affected

Dear DHL International,

We have 6 shipments currently held at Penang Hub pending customs clearance. The delay has now exceeded 72 hours and we are facing serious supply chain disruptions. Our import permits are valid and documentation was submitted in full.

We require immediate intervention from your customs team and a formal status update for each AWB.

This is now a business-critical situation.

Global Trade Co.
Logistics Manager`,
    reasoning: {
      sopTitle: "Complex Customs Delay — Multi-Shipment Escalation",
      escalationDetail: `This case was automatically escalated to a human agent because:

1. Multi-shipment complexity (6 AWBs affected) — AI handles single-parcel cases only
2. Customs clearance issues require licensed customs broker intervention
3. Import permit verification requires access to government systems outside NEXUS scope
4. Business-critical urgency level detected — 72+ hour delay exceeds auto-response SLA
5. Formal status report across multiple AWBs requires human coordination

A senior logistics coordinator at Penang Hub has been assigned and will contact Global Trade Co. within 30 minutes.`,
    },
  },

  fatimahZahra: {
    emailBody: `Subject: Where is my parcel? AWB223345678

Assalamualaikum DHL team,

I have been waiting for my parcel AWB223345678 for 3 days now. My tracking shows it arrived at Shah Alam Hub but has not moved since. I ordered this as a gift for my daughter's birthday which is tomorrow.

Please help me.

Fatimah Zahra`,
    aiResponse: `Dear Fatimah Zahra,

Waalaikumsalam. We are so sorry to hear about the delay to your special parcel AWB223345678.

We completely understand the importance of this delivery and have marked it as time-sensitive. Your parcel is being retrieved from Shah Alam Hub right now and will be given priority dispatch today. We expect delivery before 6 PM.

We hope your daughter has a wonderful birthday. Thank you for trusting DHL.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Standard Late Delivery Response Protocol",
      factors: [
        "96% classification confidence — highest confidence in this batch",
        "Time-sensitivity detected: 'birthday tomorrow' — response tone adjusted to empathetic",
        "SOP LD-001 applied with 6PM delivery commitment (hub capacity confirmed)",
        "Sentimental context flagged → response personalised beyond standard template",
      ],
      similarCases: [
        { customer: "Ahmad Razif", hub: "Shah Alam Hub", date: "1 May 2026", outcome: "resolved", satisfactionScore: 4.9 },
        { customer: "Raj Kumar", hub: "Shah Alam Hub", date: "28 Apr 2026", outcome: "resolved", satisfactionScore: 4.8 },
      ],
    },
  },

  chenWei: {
    emailBody: `Subject: Missing Item in Parcel AWB667788990

Hi DHL support,

I received parcel AWB667788990 but one item is missing from my order. The package looked sealed but the invoice shows 3 items and only 2 were inside. The missing item is a laptop charger.

Please advise on next steps.

Chen Wei`,
    aiResponse: `Dear Chen Wei,

Thank you for bringing this to our attention. We apologise for the discrepancy in your parcel AWB667788990.

A missing-item investigation has been opened (Ref: MI-20260501-990). Our JB Distribution Hub team will review the handling records and CCTV footage from your parcel's processing. We will update you within 24 hours with our findings.

If the item is confirmed missing due to a packing error, a replacement will be arranged at no cost.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Missing Item Investigation and Resolution Protocol",
      factors: [
        "72% confidence — below ideal threshold (80%) but above minimum (65%)",
        "Missing item claim — SOP MI-007 applied; investigation automatically opened",
        "Low confidence due to ambiguity: could be sender packing error or transit loss",
        "JB Distribution Hub flagged for CCTV review — standard procedure for missing item claims",
      ],
      similarCases: [
        { customer: "Nurul Aina", hub: "KLIA Cargo", date: "25 Apr 2026", outcome: "resolved", satisfactionScore: 4.3 },
        { customer: "Priya Nair", hub: "Subang Jaya Depot", date: "20 Apr 2026", outcome: "resolved", satisfactionScore: 4.1 },
      ],
    },
  },

  priyaNair: {
    emailBody: `Subject: Wrong Address on My Parcel — AWB334455667

Hello,

My parcel AWB334455667 was returned to sender because DHL says the address is incorrect. But the address I provided is correct — I have been receiving parcels at this address for years.

Please check and redeliver.

Priya Nair
Unit 12-3A, Jalan PJU 5/1, Subang Jaya`,
    aiResponse: `Dear Priya Nair,

Thank you for alerting us to this. We apologise for the inconvenience caused by the address verification issue on parcel AWB334455667.

Our address validation team has confirmed your address is valid and the return was triggered by a system formatting error on our end. Your parcel has been recalled from the return queue and redelivery has been scheduled for tomorrow before noon.

We sincerely apologise for this error.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Address Error — Redelivery and Correction Protocol",
      factors: [
        "89% confidence — address dispute clearly identified from email content",
        "SOP AE-002 applied: customer asserts address is correct → system error investigation triggered",
        "Address cross-checked against Malaysia postal database: address confirmed valid",
        "Root cause: postcode formatting inconsistency in our routing system — IT flagged for fix",
      ],
      similarCases: [
        { customer: "Mohammed Hassan", hub: "KLIA Cargo", date: "29 Apr 2026", outcome: "resolved", satisfactionScore: 4.6 },
        { customer: "Lee Siew", hub: "Penang Hub", date: "23 Apr 2026", outcome: "resolved", satisfactionScore: 4.5 },
      ],
    },
  },

  mohammedHassan: {
    emailBody: `Subject: Parcel Overdue — AWB556677889

Dear Support Team,

My parcel AWB556677889 shipped from Penang 5 days ago and is now showing as delayed at KLIA Cargo. I have an important delivery commitment to my client that I cannot miss.

When will this be delivered? I need a concrete answer.

Mohammed Hassan
MM Trading & Logistics`,
    aiResponse: `Dear Mohammed Hassan,

Thank you for your patience. We understand the urgency given your client commitment.

Your parcel AWB556677889 is currently at KLIA Cargo and has been flagged for priority processing. Our team has confirmed it will enter the delivery route for your area first thing tomorrow morning, with an estimated delivery window of 8–11 AM.

We will send you a confirmation SMS with live tracking once it departs the hub.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Standard Late Delivery Response Protocol",
      factors: [
        "93% confidence — clear late-delivery case with business urgency indicated",
        "Business account detected (MM Trading & Logistics) — SLA commitment tone applied",
        "5-day delay exceeds standard threshold → specific delivery time commitment given",
        "SOP LD-001 applied with next-morning guarantee (confirmed against hub schedule)",
      ],
      similarCases: [
        { customer: "Ahmad Razif", hub: "Shah Alam Hub", date: "1 May 2026", outcome: "resolved", satisfactionScore: 4.9 },
        { customer: "Raj Kumar", hub: "Shah Alam Hub", date: "28 Apr 2026", outcome: "resolved", satisfactionScore: 4.8 },
      ],
    },
  },

  amirulHakeem: {
    emailBody: `Subject: STILL WAITING — AWB778899001

This is my third message. My parcel AWB778899001 has been at Shah Alam Hub for 3 DAYS. I have called twice and been told it would be delivered "soon" each time.

I want a real answer: when exactly will this arrive?

Amirul Hakeem`,
    aiResponse: `Dear Amirul Hakeem,

We are truly sorry. Three days is completely unacceptable and we understand your frustration.

We have reviewed your case and escalated it to the Shah Alam Hub Operations Manager personally. Your parcel AWB778899001 will be hand-delivered to you today by 3 PM. You will receive a call from the delivery driver 30 minutes before arrival.

As an apology for this experience, a service credit has been applied to your account.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Repeat Contact — Escalated Late Delivery Protocol",
      factors: [
        "97% confidence — highest in this session; repeat contact + explicit frustration detected",
        "Escalated response path triggered: 3-day delay + 2 prior contacts = Operations Manager notification",
        "Service credit automatically applied — repeat complaint policy (>2 contacts, >48h delay)",
        "Specific delivery commitment (3 PM, driver call) — hub confirmed slot availability",
      ],
      similarCases: [
        { customer: "Fatimah Zahra", hub: "Shah Alam Hub", date: "1 May 2026", outcome: "resolved", satisfactionScore: 4.9 },
        { customer: "Ahmad Razif", hub: "Shah Alam Hub", date: "1 May 2026", outcome: "resolved", satisfactionScore: 4.9 },
      ],
    },
  },

  leeSiew: {
    emailBody: `Subject: Parcel Damage — AWB889900112

Hello,

I received parcel AWB889900112 from Penang Hub today and the item inside is cracked. The box itself looks fine from outside but the contents are damaged.

I think it was mishandled during sorting. I have photos if needed.

Lee Siew`,
    aiResponse: `Dear Lee Siew,

We are very sorry to hear that your item arrived damaged from AWB889900112. Internal damage without visible external damage is a known risk during high-volume sorting periods.

A damage claim has been registered (Ref: DMG-20260501-112). Our Penang Hub team has been notified to review handling procedures. A replacement or full refund will be processed within 2 business days — our team will confirm your preference via email shortly.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Damaged Parcel Claims and Compensation Protocol",
      factors: [
        "84% confidence — damage claim; internal damage without external visible damage",
        "SOP DP-003 applied: customer mentions 'mishandled during sorting' → hub quality alert triggered",
        "Penang Hub flagged: 2nd damage complaint this week from same hub → pattern investigation",
        "Photo evidence offered by customer → claim fast-tracked without inspection requirement",
      ],
      similarCases: [
        { customer: "Nurul Aina", hub: "KLIA Cargo", date: "1 May 2026", outcome: "resolved", satisfactionScore: 4.7 },
        { customer: "Chen Wei", hub: "JB Distribution", date: "25 Apr 2026", outcome: "resolved", satisfactionScore: 4.4 },
      ],
    },
  },

  dhlEnterprise: {
    emailBody: `Subject: [ENTERPRISE ACCOUNT] Priority Shipment Delayed — AWB BULK-20260501

To Whom It May Concern,

Our enterprise account (DHL Business Premier, Contract #ENT-MY-4471) has a bulk shipment that was supposed to arrive at our Subang Jaya warehouse by 8 AM today. It is now 11 AM and the shipment has not arrived. We have a production line waiting.

This is a contract SLA breach. Please connect us with our account manager immediately.

Operations Director
DHL Enterprise Client`,
    reasoning: {
      sopTitle: "Enterprise Account — SLA Breach Escalation",
      escalationDetail: `This case was automatically escalated to a senior human agent because:

1. Enterprise account detected (Contract #ENT-MY-4471) — AI handles standard customer cases only
2. Contract SLA breach explicitly stated — legal and commercial implications require human review
3. Production line impact reported — business-critical urgency exceeds auto-response scope
4. Account manager assignment required — enterprise accounts have dedicated relationship managers
5. Bulk shipment tracking requires ERP system access outside NEXUS capability

Enterprise Relationship Manager has been paged and will call the client within 10 minutes.`,
    },
  },

  yasminAziz: {
    emailBody: `Subject: Late Delivery — AWB112233445

Dear DHL,

My parcel AWB112233445 was supposed to arrive yesterday but I received a notification saying delivery failed because nobody was home. I was home all day and nobody came.

Can you please reattempt delivery today?

Yasmin Aziz`,
    aiResponse: `Dear Yasmin Aziz,

Thank you for reaching out. We apologise for the failed delivery attempt on AWB112233445 — we understand how frustrating this is, especially when you were home.

A redelivery has been scheduled for today between 2–5 PM. You will receive an SMS notification 15 minutes before the driver arrives. If this time slot does not suit you, please reply to this email with your preferred time and we will update the booking.

NEXUS Automated Resolution · DHL Malaysia`,
    reasoning: {
      sopTitle: "Failed Delivery — Redelivery Scheduling Protocol",
      factors: [
        "90% confidence — clear failed delivery dispute with customer asserting presence",
        "SOP LD-001 variant applied: failed delivery + customer present → redelivery scheduled same day",
        "Delivery attempt disputed — GPS log cross-check triggered on backend (driver verification)",
        "Flexible redelivery time offered — customer satisfaction protocol for disputed delivery attempts",
      ],
      similarCases: [
        { customer: "Priya Nair", hub: "Subang Jaya Depot", date: "27 Apr 2026", outcome: "resolved", satisfactionScore: 4.5 },
        { customer: "Raj Kumar", hub: "Shah Alam Hub", date: "28 Apr 2026", outcome: "resolved", satisfactionScore: 4.8 },
      ],
    },
  },
};

// ── Demo replay script (with full observability data) ─────────────────────────
const DEMO_SCRIPT = [
  { delay: 0,     type: "bot_started",       message: "UiPath bot online — connected to DHL Malaysia IMAP inbox",                               meta: { botId: "NEXUS-BOT-001", version: "2.1.4" } },
  { delay: 1100,  type: "email_scan",         message: "Inbox scan complete — 150 unread emails queued for processing",                          meta: { total: 150, sinceLastRun: 150 } },
  { delay: 2400,  type: "classified",         message: "Classified: late_delivery · Shah Alam Hub · HIGH · 94%",                                 meta: { incidentType: "late_delivery",  priority: "high",   confidence: 0.94, customer: "Ahmad Razif",          hub: "Shah Alam Hub",      awb: "AWB778234591",  sop: "LD-001", ...STORIES.ahmadRazif  } },
  { delay: 3400,  type: "response_sent",      message: "Auto-response sent to Ahmad Razif — SOP LD-001 applied",                                 meta: { customer: "Ahmad Razif",         sop: "LD-001", channel: "email", incidentType: "late_delivery",  hub: "Shah Alam Hub",      awb: "AWB778234591",  ...STORIES.ahmadRazif  } },
  { delay: 4100,  type: "classified",         message: "Classified: damaged_parcel · KLIA Cargo · MEDIUM · 87%",                                 meta: { incidentType: "damaged_parcel", priority: "medium", confidence: 0.87, customer: "Nurul Aina",          hub: "KLIA Cargo",         awb: "AWB990112334",  sop: "DP-003", ...STORIES.nurulAina   } },
  { delay: 4900,  type: "classified",         message: "Classified: late_delivery · Shah Alam Hub · HIGH · 91%",                                 meta: { incidentType: "late_delivery",  priority: "high",   confidence: 0.91, customer: "Raj Kumar",           hub: "Shah Alam Hub",      awb: "AWB445667821",  sop: "LD-001", ...STORIES.rajKumar    } },
  { delay: 5600,  type: "response_sent",      message: "Auto-response sent to Nurul Aina — SOP DP-003 applied",                                  meta: { customer: "Nurul Aina",          sop: "DP-003", channel: "email", incidentType: "damaged_parcel", hub: "KLIA Cargo",         awb: "AWB990112334",  ...STORIES.nurulAina   } },
  { delay: 6200,  type: "escalated",          message: "Escalated to human: customs_delay · Penang Hub · multi-shipment complexity",              meta: { incidentType: "customs_delay",  priority: "high",   reason: "multi_shipment_complexity", customer: "Global Trade Co.",    hub: "Penang Hub",                           ...STORIES.globalTrade  } },
  { delay: 6420,  type: "notification_sent",  message: "Penang Hub Senior Coordinator assigned — Global Trade Co. case escalated",                 meta: { recipient: "Penang Hub Senior Coordinator", role: "Senior Logistics Coordinator", channels: ["email", "system"], urgency: "high",     subject: "Case Assignment: Global Trade Co. — Multi-Shipment Customs Delay", relatedCase: "Global Trade Co.", hub: "Penang Hub",        action: "Agent assigned within 30-min SLA. Client contact expected within 30 minutes." } },
  { delay: 6900,  type: "classified",         message: "Classified: late_delivery · Shah Alam Hub · HIGH · 96%",                                 meta: { incidentType: "late_delivery",  priority: "high",   confidence: 0.96, customer: "Fatimah Zahra",       hub: "Shah Alam Hub",      awb: "AWB223345678",  sop: "LD-001", ...STORIES.fatimahZahra } },
  { delay: 7600,  type: "response_sent",      message: "Auto-response sent to Raj Kumar — SOP LD-001 applied",                                   meta: { customer: "Raj Kumar",           sop: "LD-001", channel: "email", incidentType: "late_delivery",  hub: "Shah Alam Hub",      awb: "AWB445667821",  ...STORIES.rajKumar    } },
  { delay: 8200,  type: "sentiment_detected", message: "Sentiment analysis: early batch showing mixed customer response",                         meta: { score: 0.45, label: "neutral",   batch: 1, happy: 9,  neutral: 12, frustrated: 6, total: 27 } },
  { delay: 8800,  type: "classified",         message: "Classified: missing_item · JB Distribution · LOW · 72%",                                 meta: { incidentType: "missing_item",   priority: "low",    confidence: 0.72, customer: "Chen Wei",            hub: "JB Distribution",    awb: "AWB667788990",  sop: "MI-007", ...STORIES.chenWei     } },
  { delay: 9500,  type: "classified",         message: "Classified: address_error · Subang Jaya Depot · LOW · 89%",                              meta: { incidentType: "address_error",  priority: "low",    confidence: 0.89, customer: "Priya Nair",          hub: "Subang Jaya Depot",  awb: "AWB334455667",  sop: "AE-002", ...STORIES.priyaNair   } },
  { delay: 10100, type: "response_sent",      message: "Auto-response sent to Fatimah Zahra — SOP LD-001 applied",                               meta: { customer: "Fatimah Zahra",       sop: "LD-001", channel: "email", incidentType: "late_delivery",  hub: "Shah Alam Hub",      awb: "AWB223345678",  ...STORIES.fatimahZahra } },
  { delay: 10700, type: "classified",         message: "Classified: late_delivery · KLIA Cargo · HIGH · 93%",                                    meta: { incidentType: "late_delivery",  priority: "high",   confidence: 0.93, customer: "Mohammed Hassan",     hub: "KLIA Cargo",         awb: "AWB556677889",  sop: "LD-001", ...STORIES.mohammedHassan } },
  { delay: 11500, type: "cluster_detected",   message: "CLUSTER DETECTED: 3 late_delivery incidents at Shah Alam Hub within 4-hour window",      meta: { hub: "Shah Alam Hub",           incidentType: "late_delivery", clusterSize: 3, windowHours: 4, affectedCustomers: ["Ahmad Razif", "Raj Kumar", "Fatimah Zahra"] } },
  { delay: 11780, type: "notification_sent",  message: "Shah Alam Hub Manager alerted — 3-incident late delivery cluster requires review",         meta: { recipient: "Shah Alam Hub Manager", role: "Hub Operations Manager", channels: ["email", "whatsapp"], urgency: "high",     subject: "Cluster Alert: 3 Late Delivery Incidents at Shah Alam Hub — Review Required", relatedCase: "Ahmad Razif, Raj Kumar, Fatimah Zahra", hub: "Shah Alam Hub", action: "Operations review triggered. Fleet dispatch schedule under immediate review." } },
  { delay: 12200, type: "response_sent",      message: "Auto-response sent to Chen Wei — SOP MI-007 applied",                                    meta: { customer: "Chen Wei",            sop: "MI-007", channel: "email", incidentType: "missing_item",   hub: "JB Distribution",    awb: "AWB667788990",  ...STORIES.chenWei     } },
  { delay: 12900, type: "classified",         message: "Classified: late_delivery · Shah Alam Hub · HIGH · 97%",                                 meta: { incidentType: "late_delivery",  priority: "high",   confidence: 0.97, customer: "Amirul Hakeem",      hub: "Shah Alam Hub",      awb: "AWB778899001",  sop: "LD-001", ...STORIES.amirulHakeem } },
  { delay: 13800, type: "sentiment_detected", message: "Sentiment improving — customers acknowledging fast response times",                       meta: { score: 0.65, label: "satisfied", trend: "up", batch: 2, happy: 32, neutral: 16, frustrated: 6, total: 54 } },
  { delay: 14600, type: "cascade_alert",      message: "CASCADE ALERT: Shah Alam cluster → 2 downstream hubs at risk. Alert file written.",      meta: { sourceHub: "Shah Alam Hub",     downstreamHubs: ["Subang Jaya Depot", "KLIA Cargo"], overallRisk: 0.99, alertId: "CASCADE-SHA-20260501-001", affectedCustomers: ["Ahmad Razif", "Raj Kumar", "Fatimah Zahra", "Amirul Hakeem"], recommendation: "Alert Subang Jaya and KLIA hub managers. Expect elevated late-delivery volume by 09:38 MYT." } },
  { delay: 14850, type: "notification_sent",  message: "Shah Alam Hub Manager: CRITICAL cascade alert dispatched via Email + WhatsApp",           meta: { recipient: "Shah Alam Hub Manager", role: "Hub Operations Manager", channels: ["email", "whatsapp"], urgency: "critical", subject: "CASCADE ALERT — Shah Alam Hub: Immediate Action Required (CASCADE-SHA-20260501-001)", relatedCase: "CASCADE-SHA-20260501-001", hub: "Shah Alam Hub",        action: "All available riders redirected. Emergency batch processing initiated." } },
  { delay: 15040, type: "notification_sent",  message: "Subang Jaya Depot Supervisor notified — downstream cascade overflow expected",            meta: { recipient: "Subang Jaya Depot Supervisor", role: "Depot Supervisor",    channels: ["sms", "email"],     urgency: "high",     subject: "Downstream Risk Warning: Shah Alam Cascade — Elevated Volume Expected at Subang Jaya", relatedCase: "CASCADE-SHA-20260501-001", hub: "Subang Jaya Depot",    action: "Standby crew on alert. Sorting capacity pre-cleared for overflow." } },
  { delay: 15200, type: "notification_sent",  message: "KLIA Cargo Operations Lead notified — downstream cascade impact warning",                 meta: { recipient: "KLIA Cargo Operations Lead", role: "Operations Lead",      channels: ["sms", "email"],     urgency: "high",     subject: "Downstream Risk Warning: Shah Alam Cascade — KLIA Cargo impact expected by 09:38 MYT", relatedCase: "CASCADE-SHA-20260501-001", hub: "KLIA Cargo",           action: "Priority sorting lanes activated. Incoming Shah Alam overflow pre-assigned." } },
  { delay: 15370, type: "notification_sent",  message: "Regional Logistics Director (MY) — automated cascade summary report dispatched",          meta: { recipient: "Regional Logistics Director", role: "Regional Director (Malaysia)", channels: ["email"],      urgency: "medium",   subject: "Automated Report: Cascade Event CASCADE-SHA-20260501-001 — 3 Hubs Actioned",           relatedCase: "CASCADE-SHA-20260501-001", hub: "Regional HQ",          action: "Executive summary generated. 3 hub managers actioned. No manual intervention required." } },
  { delay: 15400, type: "response_sent",      message: "Auto-response sent to Priya Nair — SOP AE-002 applied",                                  meta: { customer: "Priya Nair",          sop: "AE-002", channel: "email", incidentType: "address_error",  hub: "Subang Jaya Depot",  awb: "AWB334455667",  ...STORIES.priyaNair   } },
  { delay: 16000, type: "response_sent",      message: "Auto-response sent to Mohammed Hassan — SOP LD-001 applied",                             meta: { customer: "Mohammed Hassan",     sop: "LD-001", channel: "email", incidentType: "late_delivery",  hub: "KLIA Cargo",         awb: "AWB556677889",  ...STORIES.mohammedHassan } },
  { delay: 16600, type: "classified",         message: "Classified: damaged_parcel · Penang Hub · MEDIUM · 84%",                                 meta: { incidentType: "damaged_parcel", priority: "medium", confidence: 0.84, customer: "Lee Siew",            hub: "Penang Hub",         awb: "AWB889900112",  sop: "DP-003", ...STORIES.leeSiew     } },
  { delay: 17300, type: "escalated",          message: "Escalated to human: VIP enterprise client · KLIA Cargo · SLA breach",                    meta: { incidentType: "late_delivery",  priority: "critical", reason: "vip_customer",           customer: "DHL Enterprise Client", hub: "KLIA Cargo",                           ...STORIES.dhlEnterprise } },
  { delay: 17510, type: "notification_sent",  message: "Enterprise Relationship Manager paged — DHL Enterprise SLA breach requires immediate call", meta: { recipient: "Enterprise Relationship Manager", role: "Enterprise Account Manager", channels: ["page", "sms"], urgency: "critical", subject: "URGENT: Enterprise SLA Breach — Contract #ENT-MY-4471 — Client Call Required",         relatedCase: "DHL Enterprise Client",    hub: "KLIA Cargo",           action: "Relationship Manager on call to client within 10 minutes. SLA breach logged." } },
  { delay: 18000, type: "response_sent",      message: "Auto-response sent to Amirul Hakeem — SOP LD-001 applied",                               meta: { customer: "Amirul Hakeem",       sop: "LD-001", channel: "email", incidentType: "late_delivery",  hub: "Shah Alam Hub",      awb: "AWB778899001",  ...STORIES.amirulHakeem } },
  { delay: 18700, type: "classified",         message: "Classified: late_delivery · Subang Jaya Depot · HIGH · 90%",                             meta: { incidentType: "late_delivery",  priority: "high",   confidence: 0.90, customer: "Yasmin Aziz",         hub: "Subang Jaya Depot",  awb: "AWB112233445",  sop: "LD-001", ...STORIES.yasminAziz  } },
  { delay: 19500, type: "sentiment_detected", message: "Sentiment peak: 78% of contacted customers satisfied or better",                          meta: { score: 0.78, label: "satisfied", trend: "up", batch: 3, happy: 69, neutral: 14, frustrated: 6, total: 89 } },
  { delay: 20200, type: "response_sent",      message: "Auto-response sent to Lee Siew — SOP DP-003 applied",                                    meta: { customer: "Lee Siew",            sop: "DP-003", channel: "email", incidentType: "damaged_parcel", hub: "Penang Hub",         awb: "AWB889900112",  ...STORIES.leeSiew     } },
  { delay: 20900, type: "response_sent",      message: "Auto-response sent to Yasmin Aziz — SOP LD-001 applied",                                 meta: { customer: "Yasmin Aziz",         sop: "LD-001", channel: "email", incidentType: "late_delivery",  hub: "Subang Jaya Depot",  awb: "AWB112233445",  ...STORIES.yasminAziz  } },
  { delay: 22000, type: "bot_summary",        message: "Batch complete — 150 emails processed, 89 responded, 8 escalated, 2 clusters detected",  meta: { scanned: 150, classified: 127,  responded: 89,   escalated: 8, avgConfidence: 0.89, duration: "6m 12s" } },
];

// ── GET /api/v1/ops/real-stats ───────────────────────────────────────────────
router.get("/real-stats", requireAuth, requireRole("admin", "reviewer"), async (_req, res) => {
  try {
    const [rpaAgg, incAgg, sentAgg, typeAgg, hubAgg, recentRealEvents] = await Promise.all([
      RpaRun.aggregate([{
        $group: {
          _id: null,
          totalRuns: { $sum: 1 },
          totalFiles: { $sum: "$totalFiles" },
          totalProcessed: { $sum: "$processedCount" },
          totalFailed: { $sum: "$failed" },
        },
      }]),
      Incident.aggregate([{
        $group: {
          _id: null,
          total: { $sum: 1 },
          autoResolved: { $sum: { $cond: [{ $and: [{ $eq: ['$holdForReview', false] }, { $not: [{ $in: ['$status', ['DRAFT']] }] }] }, 1, 0] } },
          hitlRouted: { $sum: { $cond: ['$holdForReview', 1, 0] } },
          avgConfidence: { $avg: "$confidence" },
        },
      }]),
      Incident.aggregate([
        { $match: { sentimentScore: { $ne: null } } },
        {
          $group: {
            _id: null,
            happy: { $sum: { $cond: [{ $gte: ["$sentimentScore", 0.6] }, 1, 0] } },
            neutral: { $sum: { $cond: [{ $and: [{ $gte: ["$sentimentScore", 0.35] }, { $lt: ["$sentimentScore", 0.6] }] }, 1, 0] } },
            frustrated: { $sum: { $cond: [{ $lt: ["$sentimentScore", 0.35] }, 1, 0] } },
            avg: { $avg: "$sentimentScore" },
          },
        },
      ]),
      Incident.aggregate([
        { $match: { type: { $ne: null } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      Incident.aggregate([
        { $match: { location: { $ne: null } } },
        { $group: { _id: "$location", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      BotEvent.find({ source: { $ne: 'demo' }, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }).sort({ createdAt: -1 }).limit(40).lean(),
    ]);

    const rpa = rpaAgg[0] || { totalRuns: 0, totalFiles: 0, totalProcessed: 0, totalFailed: 0 };
    const inc = incAgg[0] || { total: 0, autoResolved: 0, hitlRouted: 0, avgConfidence: 0 };
    const sent = sentAgg[0] || { happy: 0, neutral: 0, frustrated: 0, avg: 0 };

    return res.status(200).json({
      rpa: {
        totalRuns: rpa.totalRuns,
        totalFiles: rpa.totalFiles,
        totalProcessed: rpa.totalProcessed,
        totalFailed: rpa.totalFailed,
      },
      incidents: {
        total: inc.total,
        autoResolved: inc.autoResolved,
        hitlRouted: inc.hitlRouted,
        avgConfidence: inc.avgConfidence ? Math.round(inc.avgConfidence * 100) / 100 : 0,
        byType: typeAgg.map((t) => ({ type: t._id, count: t.count })),
        byHub: hubAgg.map((h) => ({ hub: h._id, count: h.count })),
      },
      sentiment: {
        happy: sent.happy,
        neutral: sent.neutral,
        frustrated: sent.frustrated,
        avg: sent.avg ? Math.round(sent.avg * 100) / 100 : 0,
      },
      recentBotEvents: recentRealEvents,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[GET /ops/real-stats]", err.message);
    return res.status(500).json({ error: "Failed to load real stats" });
  }
});

// ── GET /api/v1/ops/health ────────────────────────────────────────────────────
router.get("/health", (_req, res) => {
  return res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── GET /api/v1/ops/live-stream (SSE) ────────────────────────────────────────
router.get("/live-stream", requireAuth, requireRole("admin", "reviewer"), (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");
  lsRegister(res);

  const keepAlive = setInterval(() => {
    try { res.write(": keepalive\n\n"); }
    catch { clearInterval(keepAlive); lsUnregister(res); }
  }, 15000);

  req.on("close", () => { clearInterval(keepAlive); lsUnregister(res); });
});

// ── GET /api/v1/ops/live-summary ─────────────────────────────────────────────
router.get("/live-summary", requireAuth, requireRole("admin", "reviewer"), async (req, res) => {
  try {
    const recent = await BotEvent.find().sort({ createdAt: -1 }).limit(80).lean();
    const counters = { scanned: 0, classified: 0, responded: 0, escalated: 0 };
    const hubStats = {};
    const typeStats = {};
    const sentimentScores = [];
    let latestSentimentMeta = null;

    for (const ev of [...recent].reverse()) {
      if (ev.type === "email_scan"        && ev.meta?.total)           counters.scanned = ev.meta.total;
      if (ev.type === "classified")       { counters.classified++;     if (ev.meta?.hub) hubStats[ev.meta.hub] = (hubStats[ev.meta.hub] || 0) + 1; if (ev.meta?.incidentType) typeStats[ev.meta.incidentType] = (typeStats[ev.meta.incidentType] || 0) + 1; }
      if (ev.type === "response_sent")      counters.responded++;
      if (ev.type === "escalated")          counters.escalated++;
      if (ev.type === "sentiment_detected" && ev.meta?.score !== undefined) {
        sentimentScores.push(ev.meta.score);
        latestSentimentMeta = ev.meta;
      }
    }

    let happy, neutral, frustrated, avg;
    if (latestSentimentMeta?.total > 0 && latestSentimentMeta?.happy !== undefined) {
      happy = latestSentimentMeta.happy;
      neutral = latestSentimentMeta.neutral;
      frustrated = latestSentimentMeta.frustrated;
      avg = (happy * 0.80 + neutral * 0.475 + frustrated * 0.175) / latestSentimentMeta.total;
    } else {
      happy = sentimentScores.filter((s) => s >= 0.6).length;
      neutral = sentimentScores.filter((s) => s >= 0.35 && s < 0.6).length;
      frustrated = sentimentScores.filter((s) => s < 0.35).length;
      avg = sentimentScores.length ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length : 0;
    }

    const lastEvent = recent[0];
    let botState = "offline";
    if (lastEvent) botState = (lastEvent.type === "bot_summary" || lastEvent.type === "bot_idle") ? "complete" : "running";

    const cascadeEvent = recent.find((e) => e.type === "cascade_alert");

    return res.status(200).json({
      counters, hubStats, typeStats,
      sentiment: { scores: sentimentScores, happy, neutral, frustrated, avg },
      recentEvents: recent,
      botState,
      cascadeAlert: cascadeEvent?.meta || null,
    });
  } catch (err) {
    console.error("[GET /ops/live-summary]", err.message);
    return res.status(500).json({ error: "Failed to load ops summary" });
  }
});

// ── POST /api/v1/ops/event (UiPath webhook) ───────────────────────────────────
router.post("/event", requireRpaAuth, async (req, res) => {
  try {
    const { type, message, meta } = req.body;
    if (!type || !message) return res.status(400).json({ error: "type and message required" });
    const event = await BotEvent.create({ type, message, meta: meta || {}, source: "uipath" });
    broadcastOpsEvent(event);
    return res.status(201).json({ ok: true, eventId: event._id });
  } catch (err) {
    console.error("[POST /ops/event]", err.message);
    return res.status(500).json({ error: "Failed to save event" });
  }
});

// ── POST /api/v1/ops/demo/start ───────────────────────────────────────────────
router.post("/demo/start", requireAuth, requireRole("admin", "reviewer"), async (req, res) => {
  for (const t of demoTimers) clearTimeout(t);
  demoTimers.clear();
  await BotEvent.deleteMany({ source: "demo" });

  for (const { delay, type, message, meta } of DEMO_SCRIPT) {
    const t = setTimeout(async () => {
      try {
        const event = await BotEvent.create({ type, message, meta, source: "demo" });
        broadcastOpsEvent(event);
      } catch (err) { console.error("[demo event error]", err.message); }
      demoTimers.delete(t);
    }, delay);
    demoTimers.add(t);
  }

  return res.status(200).json({ ok: true, events: DEMO_SCRIPT.length, durationMs: DEMO_SCRIPT.at(-1).delay });
});

// ── POST /api/v1/ops/demo/reset ───────────────────────────────────────────────
router.post("/demo/reset", requireAuth, requireRole("admin", "reviewer"), async (req, res) => {
  for (const t of demoTimers) clearTimeout(t);
  demoTimers.clear();
  await BotEvent.deleteMany({ source: "demo" });
  return res.status(200).json({ ok: true });
});

// ── Legacy pipeline endpoints ─────────────────────────────────────────────────
router.get("/incidents/:id/job", async (req, res) => {
  try { const job = await getJobForIncident(req.params.id); if (!job) return res.status(404).json({ error: "No pipeline job found" }); return res.status(200).json(job); }
  catch (err) { return res.status(500).json({ error: "Failed to retrieve pipeline job" }); }
});
router.get("/incidents/:id/jobs", async (req, res) => {
  try { return res.status(200).json(await getJobsForIncident(req.params.id)); }
  catch { return res.status(500).json({ error: "Failed" }); }
});
router.get("/incidents/:id/events", async (req, res) => {
  try { return res.status(200).json(await getEventsForIncident(req.params.id)); }
  catch { return res.status(500).json({ error: "Failed" }); }
});
router.get("/jobs/:jobId/events", async (req, res) => {
  try { return res.status(200).json(await getEventsForJob(req.params.jobId)); }
  catch { return res.status(500).json({ error: "Failed" }); }
});
router.get("/incidents/:id/summary", async (req, res) => {
  try {
    const [incident, job] = await Promise.all([
      Incident.findById(req.params.id).select("status severity type holdForReview pipelineError confidence createdAt").lean(),
      getJobForIncident(req.params.id),
    ]);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    return res.status(200).json({ incidentId: req.params.id, incidentStatus: incident.status, severity: incident.severity, type: incident.type, holdForReview: incident.holdForReview, pipelineError: incident.pipelineError, confidence: incident.confidence, createdAt: incident.createdAt, pipeline: job ? { jobId: job._id, status: job.status, currentStage: job.currentStage, startedAt: job.startedAt, completedAt: job.completedAt, durationMs: job.durationMs, lastError: job.lastError } : null });
  } catch { return res.status(500).json({ error: "Failed" }); }
});
router.get("/pipeline-stats", async (req, res) => {
  try {
    const [statusCounts, deadLetters, recentFailed] = await Promise.all([
      PipelineJob.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      PipelineJob.find({ status: "dead_letter" }).sort({ createdAt: -1 }).limit(5).select("incidentId lastError createdAt").lean(),
      PipelineJob.find({ status: "failed" }).sort({ createdAt: -1 }).limit(5).select("incidentId currentStage lastError createdAt").lean(),
    ]);
    const stats = {};
    for (const e of statusCounts) stats[e._id] = e.count;
    return res.status(200).json({ counts: stats, deadLetters, recentFailed });
  } catch { return res.status(500).json({ error: "Failed" }); }
});

export default router;
