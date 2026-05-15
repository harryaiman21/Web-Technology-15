import 'dotenv/config';
import mongoose from 'mongoose';
import Incident from './src/models/Incident.model.js';
import RpaRun from './src/models/RpaRun.model.js';
import SopDraft from './src/models/SopDraft.model.js';
import ProactiveSend from './src/models/ProactiveSend.model.js';
import FeedbackDatasetEntry from './src/models/FeedbackDatasetEntry.model.js';
import OutboundEmail from './src/models/OutboundEmail.model.js';
import CascadeEvent from './src/models/CascadeEvent.model.js';
import AuditLog from './src/models/AuditLog.model.js';
import TrainingCandidate from './src/models/TrainingCandidate.model.js';
import CustomerProfile from './src/models/CustomerProfile.model.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI environment variable is required');

// ─── helpers ────────────────────────────────────────────────────────────────
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const hoursAgo = (n) => new Date(Date.now() - n * 60 * 60 * 1000);

const BASE_CONFIDENCE_HISTORY = (type) => [
  {
    stage: 'intake',
    stageLabel: 'Intake',
    confidence: 0.88,
    classificationType: type,
    minutesElapsed: 0,
    recordedAt: new Date(),
  },
  {
    stage: 'final',
    stageLabel: 'Final',
    confidence: 0.92,
    classificationType: type,
    minutesElapsed: 3,
    recordedAt: new Date(),
  },
];

// ─── INCIDENTS ───────────────────────────────────────────────────────────────

// 4 Shah Alam cluster incidents — damaged_parcel, RESOLVED
// Timestamps within the last 6 hours so cluster detection (72h window) picks them up
const clusterIncidents = [
  {
    createdAt: hoursAgo(5.8),
    title: 'Damaged Parcel — Ceramic Vase Broken',
    description:
      'Customer received parcel with crushed corner. Fragile sticker ignored. Contents — ceramic vase — broken in transit. Customer requests replacement and compensation.',
    rawInput:
      'Customer received parcel with crushed corner. Fragile sticker ignored. Contents — ceramic vase — broken in transit.',
    type: 'damaged_parcel',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Shah Alam Hub',
    clusterGroup: 'shah-alam-damaged-cluster-001',
    source: 'rpa',
    confidence: 0.92,
    holdForReview: false,
    department: 'Operations',
    recoveryMessage: {
      text: 'Dear customer, we sincerely apologise for the damage to your parcel. A full replacement has been arranged and will be delivered within 2 business days. We have escalated this to our Shah Alam Hub operations team.',
      language: 'en',
      status: 'approved',
      generatedAt: hoursAgo(5.5),
      approvedBy: 'admin@dhl.com',
      approvedAt: hoursAgo(5.3),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: hoursAgo(3),
    },
    resolutionNote: 'Fragile sticker was ignored during handling at Shah Alam Hub sorting line. Root cause: conveyor belt speed too high for fragile-tagged parcels. Replacement arranged via merchant portal within 4 hours. Customer compensated with RM50 voucher. Hub ops manager briefed to reduce belt speed for fragile items.',
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-DAM-001',
        steps: [
          'Verify damage via customer photos and cross-reference with AWB fragile tag',
          'Initiate replacement order through merchant portal',
          'Apply RM50 service credit to customer account as goodwill gesture',
          'Escalate to Shah Alam Hub Operations Manager for conveyor speed review on fragile parcels',
          'Log handling deviation in hub quality tracker',
        ],
      },
    },
  },
  {
    createdAt: hoursAgo(5.5),
    title: 'Damaged Parcel — Torn Bottom Seam, Multiple Items Spilled',
    description:
      'Box arrived with torn bottom seam. Multiple items spilled. Customer photographed damage before opening. Claims all 3 items damaged.',
    rawInput:
      'Box arrived with torn bottom seam. Multiple items spilled. Customer photographed damage before opening.',
    type: 'damaged_parcel',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Shah Alam Hub',
    clusterGroup: 'shah-alam-damaged-cluster-001',
    source: 'rpa',
    confidence: 0.92,
    holdForReview: false,
    department: 'Operations',
    recoveryMessage: {
      text: 'Dear customer, we sincerely apologise for the damage to your parcel. A full replacement has been arranged and will be delivered within 2 business days. We have escalated this to our Shah Alam Hub operations team.',
      language: 'en',
      status: 'approved',
      generatedAt: hoursAgo(5.2),
      approvedBy: 'admin@dhl.com',
      approvedAt: hoursAgo(5.0),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: hoursAgo(3),
    },
    resolutionNote: 'Bottom seam failure caused by overweight contents exceeding box rating. Merchant packaging guidelines violated. Replacement shipment sent with reinforced double-wall carton. Merchant notified of DHL packaging standards. Customer received all 3 replacement items within 48 hours.',
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-DAM-001',
        steps: [
          'Document spilled items with photographic evidence from customer',
          'Arrange replacement shipment with reinforced packaging',
          'Notify merchant of DHL packaging standards violation for overweight contents',
          'Apply RM30 service credit for multi-item damage',
          'Track replacement delivery to ensure safe arrival',
        ],
      },
    },
  },
  {
    createdAt: hoursAgo(5.1),
    title: 'Damaged Parcel — Heavy Impact Marks, Insufficient Packaging',
    description:
      'Parcel shows heavy impact marks on top face. Internal packaging insufficient for item weight. Customer filed complaint same day.',
    rawInput:
      'Parcel shows heavy impact marks on top face. Internal packaging insufficient for item weight.',
    type: 'damaged_parcel',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Shah Alam Hub',
    clusterGroup: 'shah-alam-damaged-cluster-001',
    source: 'rpa',
    confidence: 0.92,
    holdForReview: false,
    department: 'Operations',
    recoveryMessage: {
      text: 'Dear customer, we sincerely apologise for the damage to your parcel. A full replacement has been arranged and will be delivered within 2 business days. We have escalated this to our Shah Alam Hub operations team.',
      language: 'en',
      status: 'approved',
      generatedAt: hoursAgo(4.8),
      approvedBy: 'admin@dhl.com',
      approvedAt: hoursAgo(4.6),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: hoursAgo(2.5),
    },
    resolutionNote: 'Heavy impact marks indicate drop from height during loading at Shah Alam Hub. CCTV review confirmed forklift operator error. Internal packaging insufficient for 8kg item weight. Full replacement arranged. Forklift operator retrained on fragile handling protocol. Hub manager implementing weight-based packaging audit.',
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-DAM-003',
        steps: [
          'Request CCTV footage review from Shah Alam Hub for handling incident',
          'Initiate full replacement via merchant portal',
          'File internal incident report for forklift operator handling deviation',
          'Schedule retraining for loading crew on fragile parcel protocols',
          'Implement weight-based packaging audit at hub intake',
        ],
      },
    },
  },
  {
    createdAt: hoursAgo(4.8),
    title: 'Damaged Parcel — Water Damage to Electronics, Full Refund Requested',
    description:
      'Outer carton soaked and collapsed. Water damage to electronics inside. Customer requests full refund. Premium next-day delivery purchased.',
    rawInput:
      'Outer carton soaked and collapsed. Water damage to electronics inside. Customer requests full refund.',
    type: 'damaged_parcel',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Shah Alam Hub',
    clusterGroup: 'shah-alam-damaged-cluster-001',
    source: 'rpa',
    confidence: 0.92,
    holdForReview: false,
    department: 'Operations',
    recoveryMessage: {
      text: 'Dear customer, we sincerely apologise for the damage to your parcel. A full replacement has been arranged and will be delivered within 2 business days. We have escalated this to our Shah Alam Hub operations team.',
      language: 'en',
      status: 'approved',
      generatedAt: hoursAgo(4.5),
      approvedBy: 'admin@dhl.com',
      approvedAt: hoursAgo(4.3),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: hoursAgo(2),
    },
    resolutionNote: 'Water ingress during overnight storage at Shah Alam outdoor staging area. Rain cover was not deployed. Electronics total loss confirmed. Full refund processed via merchant within 24 hours. Premium delivery fee waived. Hub ops directed to enforce mandatory rain cover deployment for outdoor staging.',
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-DAM-004',
        steps: [
          'Assess water damage severity via customer photos and confirm total loss',
          'Process full refund through merchant portal including premium delivery fee',
          'File weather incident report for Shah Alam Hub outdoor staging area',
          'Enforce mandatory rain cover deployment protocol at all outdoor staging areas',
          'Issue customer apology letter with priority status for future shipments',
        ],
      },
    },
  },
];

// 3 KLIA Cargo cluster incidents — late_delivery, within 2 hours → triggers cascade
const kliaClusterIncidents = [
  {
    createdAt: hoursAgo(3.2),
    title: 'Late Delivery — International Air Freight Delay at KLIA',
    description:
      'International air freight parcel JD014700100001 stuck at KLIA Cargo customs clearance for 48 hours. No scan updates since arrival. Merchant requires confirmation for insurance claim.',
    rawInput:
      'International parcel JD014700100001 stuck at KLIA Cargo customs 48 hours. No scans.',
    type: 'late_delivery',
    severity: 'High',
    status: 'RESOLVED',
    location: 'KLIA Cargo',
    clusterGroup: 'klia-late-cluster-001',
    source: 'rpa',
    confidence: 0.89,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Dear customer, your parcel has cleared customs and is now en route. We apologise for the delay caused by additional documentation checks.',
      language: 'en',
      status: 'approved',
      generatedAt: hoursAgo(2.8),
      approvedBy: 'admin@dhl.com',
      approvedAt: hoursAgo(2.6),
    },
    followUp: { outcome: 'satisfied', checkedAt: hoursAgo(1) },
    resolutionNote: 'Customs clearance delay caused by missing HS code on commercial invoice. Shipper contacted to provide correct documentation. Parcel cleared within 6 hours after resubmission. Customer updated via SMS at each stage. Root cause: shipper did not use DHL Trade Automation tool for documentation.',
    confidenceHistory: BASE_CONFIDENCE_HISTORY('late_delivery'),
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-LATE-002',
        steps: [
          'Contact shipper to obtain correct HS code and commercial invoice',
          'Resubmit customs documentation via DHL Trade Automation portal',
          'Monitor customs clearance status every 2 hours',
          'Send proactive SMS updates to consignee at each clearance milestone',
          'Flag shipper account for mandatory Trade Automation enrollment',
        ],
      },
    },
  },
  {
    createdAt: hoursAgo(2.9),
    title: 'Late Delivery — KLIA Cargo Backlog, 3-Day Delay',
    description:
      'Parcel JD014700100002 from Japan held at KLIA Cargo sorting facility. Backlog due to peak season volume. Customer complaint escalated via social media. Requires urgent dispatch.',
    rawInput:
      'Parcel JD014700100002 from Japan held 3 days at KLIA Cargo. Social media escalation.',
    type: 'late_delivery',
    severity: 'High',
    status: 'RESOLVED',
    location: 'KLIA Cargo',
    clusterGroup: 'klia-late-cluster-001',
    source: 'rpa',
    confidence: 0.91,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Dear customer, your parcel has been prioritised and dispatched from KLIA. Expected delivery tomorrow.',
      language: 'en',
      status: 'approved',
      generatedAt: hoursAgo(2.5),
      approvedBy: 'admin@dhl.com',
      approvedAt: hoursAgo(2.3),
    },
    followUp: { outcome: 'satisfied', checkedAt: hoursAgo(1) },
    resolutionNote: 'Peak season volume caused backlog at KLIA Cargo sorting. Parcel prioritized after social media escalation flagged by monitoring team. Dispatched on next available domestic route. Customer received parcel next day. Service credit RM20 applied. KLIA sorting capacity review scheduled with ops team.',
    confidenceHistory: BASE_CONFIDENCE_HISTORY('late_delivery'),
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-LATE-003',
        steps: [
          'Prioritize parcel in sorting queue due to social media escalation',
          'Assign parcel to next available domestic dispatch route',
          'Send proactive delivery update to customer with revised ETA',
          'Apply RM20 service credit as goodwill compensation',
          'Schedule KLIA sorting capacity review for peak season readiness',
        ],
      },
    },
  },
  {
    createdAt: hoursAgo(2.5),
    title: 'Late Delivery — KLIA Express Transit Missed Connection',
    description:
      'Express transit parcel JD014700100003 missed connecting sort at KLIA Cargo. Parcel was due for same-day delivery in Penang but will now arrive next day. Premium customer.',
    rawInput:
      'Express parcel JD014700100003 missed KLIA sort connection. Penang same-day delivery failed.',
    type: 'late_delivery',
    severity: 'High',
    status: 'RESOLVED',
    location: 'KLIA Cargo',
    clusterGroup: 'klia-late-cluster-001',
    source: 'rpa',
    confidence: 0.87,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Dear customer, your express parcel missed its transit connection at KLIA. It has been placed on the next available route to Penang and will arrive by noon tomorrow.',
      language: 'en',
      status: 'approved',
      generatedAt: hoursAgo(2.2),
      approvedBy: 'admin@dhl.com',
      approvedAt: hoursAgo(2.0),
    },
    followUp: { outcome: 'no_response', checkedAt: hoursAgo(0.5) },
    resolutionNote: 'Express parcel missed connecting sort due to late inbound flight arrival. Parcel rerouted to next available Penang-bound truck departing 6am following day. Customer notified of revised ETA via automated SMS. Premium delivery fee refunded automatically. Flight delay logged in carrier performance tracker for SLA renegotiation.',
    confidenceHistory: BASE_CONFIDENCE_HISTORY('late_delivery'),
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-LATE-004',
        steps: [
          'Reroute parcel to next available Penang-bound dispatch',
          'Send automated SMS to customer with revised delivery window',
          'Process automatic premium delivery fee refund',
          'Log carrier flight delay in performance tracker',
          'Escalate to premium customer team for proactive follow-up call',
        ],
      },
    },
  },
];

// 8 DRAFT incidents
const draftIncidents = [
  {
    createdAt: hoursAgo(2),
    title: 'Late Delivery — Tracking JD014600123456 Petaling Jaya',
    description:
      'Customer reports parcel JD014600123456 was due for delivery on 28 April but has not arrived. Tracking shows "In Transit" at Petaling Jaya Hub since 3 days ago. No delivery attempts recorded.',
    rawInput:
      'Tracking JD014600123456 stuck at Petaling Jaya Hub for 3 days. No delivery attempt.',
    type: 'late_delivery',
    severity: 'Low',
    status: 'DRAFT',
    location: 'Petaling Jaya Hub',
    source: 'rpa',
    confidence: 0.62,
    holdForReview: false,
    agentResults: {},
  },
  {
    createdAt: hoursAgo(3),
    title: 'Missing Parcel — JD014600789123 KLIA Hub',
    description:
      'Parcel JD014600789123 last scanned at KLIA Hub on 25 April. Customer has not received item. International shipment from South Korea. Customer claims parcel has disappeared after customs clearance.',
    rawInput:
      'International parcel JD014600789123 missing after KLIA Hub customs scan on 25 April.',
    type: 'missing_parcel',
    severity: 'Medium',
    status: 'DRAFT',
    location: 'KLIA Hub',
    source: 'rpa',
    confidence: 0.68,
    holdForReview: false,
    agentResults: {},
  },
  {
    createdAt: hoursAgo(1),
    title: 'Late Delivery — Johor Bahru Residential Area',
    description:
      'Customer in Johor Bahru complains about delayed delivery. Parcel JD014600456789 was expected on 27 April. Driver reportedly attempted delivery but customer was home and no notification was sent.',
    rawInput:
      'Parcel JD014600456789 late delivery, no notification sent to customer at Johor Bahru.',
    type: 'late_delivery',
    severity: 'Low',
    status: 'DRAFT',
    location: 'Johor Bahru Hub',
    source: 'manual',
    confidence: 0.59,
    holdForReview: false,
    agentResults: {},
  },
  {
    createdAt: hoursAgo(4),
    title: 'Address Error — Penang Hub Misrouted Parcel',
    description:
      'Parcel JD014600234567 was sent to wrong address in Penang. Customer provided correct address at booking. Hub scanning shows parcel was delivered to a different postcode. Recipient unknown.',
    rawInput:
      'Parcel JD014600234567 delivered to wrong address in Penang. Customer confirmed correct address was provided.',
    type: 'address_error',
    severity: 'Medium',
    status: 'DRAFT',
    location: 'Penang Hub',
    source: 'manual',
    confidence: 0.65,
    holdForReview: false,
    agentResults: {},
  },
  {
    createdAt: hoursAgo(5),
    title: 'Missing Parcel — Kuala Lumpur CBD Delivery',
    description:
      'Customer in Kuala Lumpur city centre reports parcel JD014600345678 shows "Delivered" on tracking but was never received. Building management confirms no parcel received. High-value item.',
    rawInput:
      'Parcel JD014600345678 marked delivered at KL CBD but customer never received it.',
    type: 'missing_parcel',
    severity: 'Medium',
    status: 'DRAFT',
    location: 'Kuala Lumpur',
    source: 'rpa',
    confidence: 0.70,
    holdForReview: false,
    agentResults: {},
  },
  {
    createdAt: hoursAgo(2),
    title: 'Late Delivery — Ipoh Industrial Area',
    description:
      'Business customer in Ipoh reports urgent B2B delivery parcel JD014600567890 is 2 days overdue. Parts required for manufacturing line. Business operations being impacted.',
    rawInput:
      'B2B urgent parcel JD014600567890 overdue by 2 days at Ipoh Hub. Manufacturing line impacted.',
    type: 'late_delivery',
    severity: 'Low',
    status: 'DRAFT',
    location: 'Ipoh Hub',
    source: 'rpa',
    confidence: 0.57,
    holdForReview: false,
    agentResults: {},
  },
  {
    createdAt: hoursAgo(6),
    title: 'Wrong Item Delivered — Subang Jaya',
    description:
      'Customer at Subang Jaya received completely wrong item. Ordered electronics but received clothing items. Packaging label is correct but contents mismatched. Tracking number JD014600678901.',
    rawInput:
      'Wrong item delivered to Subang customer. Ordered electronics, received clothing. Tracking JD014600678901.',
    type: 'wrong_item',
    severity: 'Medium',
    status: 'DRAFT',
    location: 'Subang Hub',
    source: 'manual',
    confidence: 0.66,
    holdForReview: false,
    agentResults: {},
  },
  {
    createdAt: hoursAgo(3),
    title: 'Unclassified Complaint — Klang Hub',
    description:
      'Customer from Klang submitted a complaint via email about unsatisfactory service. Complaint does not clearly specify issue type. Mentions multiple previous incidents. Requires manual categorisation.',
    rawInput:
      'General service complaint from Klang customer. Multiple grievances mentioned. Manual review required.',
    type: 'other',
    severity: 'Low',
    status: 'DRAFT',
    location: 'Klang Hub',
    source: 'manual',
    confidence: 0.55,
    holdForReview: false,
    agentResults: {},
  },
];

// ─── minutesAgo helper (for fine-grained chat timestamps) ──────────────────
const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000);

// 8 PENDING_REVIEW incidents — rich, fully populated for inbox demo
const pendingIncidents = [
  // ── HERO CASE: hits every single advisor card ────────────────────────────────
  {
    createdAt: hoursAgo(1.5),
    title: 'Critical — Damaged Parcel, Repeat Customer Escalation, Shah Alam',
    description:
      'Puan Farah Hassan (pelanggan berulang, 3 kes sebelumnya) melaporkan bungkusan rosak teruk — tablet komputer untuk hadiah hari jadi anak beliau. Skrin pecah, kotak hancur. Pelanggan menulis dalam Bahasa Melayu dan mengancam aduan MCMC serta pendedahan media sosial. Kes ini bergabung dengan kluster kerosakan Shah Alam yang aktif.',
    rawInput: `Kepada Pihak DHL Malaysia,

Saya, Farah Hassan (No. Pelanggan: DHL-MY-88234), ingin membuat aduan rasmi mengenai bungkusan AWB JD014600901234 yang saya terima hari ini.

Ini adalah KALI KETIGA bungkusan yang dihantar melalui DHL rosak teruk. Kali ini lebih parah — saya memesan tablet komputer jenama Samsung Galaxy Tab S9 (harga RM2,199) sebagai hadiah hari jadi anak saya yang akan datang minggu depan. Apabila bungkusan tiba, kotak luar telah hancur sepenuhnya, dan apabila dibuka, skrin tablet telah pecah seperti kaca.

Saya ada gambar-gambar sebagai bukti — kotak luar yang remuk, bungkusan dalaman yang rosak, dan tablet itu sendiri dengan skrin yang retak teruk.

Saya sudah pernah buat aduan dua kali sebelum ini (kes DAM-2025-0341 dan LATE-2025-1122) dan setiap kali saya kena tunggu lama. Kali ini saya tidak lagi sabar.

Jika perkara ini tidak diselesaikan dalam masa 24 jam, saya akan:
1. Membuat aduan rasmi kepada MCMC
2. Memuat naik video unboxing ke TikTok dan Twitter dengan hashtag #DHLMalaysia
3. Menghubungi media untuk mendedahkan kelemahan sistem pengendalian barang DHL

Saya mahu penggantian PENUH atau bayaran balik segera.

Farah Hassan
farah.hassan@proton.me
012-738-4921`,
    type: 'damaged_parcel',
    severity: 'Critical',
    status: 'PENDING_REVIEW',
    location: 'Shah Alam Hub',
    clusterGroup: 'shah-alam-damaged-cluster-001',
    source: 'rpa',
    confidence: 0.74,
    holdForReview: true,
    department: 'Customer Service',
    customerEmail: 'farah.hassan@proton.me',
    awbNumber: 'JD014600901234',
    detectedLanguage: 'ms',
    sentimentScore: 0.09,
    sentimentLabel: 'very_frustrated',
    isRepeatCustomer: true,
    customerHistoryCount: 3,
    lastCaseType: 'damaged_parcel',
    rejectionReason: 'Critical severity · Repeat customer (3 prior cases) · Escalation language detected (MCMC, social media) · Active cluster at location',
    recoveryMessage: {
      text: 'Yang Dihormati Puan Farah,\n\nKami memohon maaf yang sebesar-besarnya atas kerosakan yang berlaku pada bungkusan anda (AWB: JD014600901234). Kami faham betapa kecewa dan marahnya Puan, apatah lagi ini merupakan kali ketiga berlaku.\n\nTindakan segera yang telah diambil:\n1. Satu unit tablet pengganti telah disediakan dan akan dihantar dalam 24 jam\n2. Kredit perkhidmatan RM100 telah dikreditkan ke akaun Puan\n3. Seorang Eksekutif Kanan akan menghubungi Puan dalam masa 2 jam\n\nSekali lagi kami memohon maaf dan berterima kasih atas kesabaran Puan.\n\nSalam hormat,\nPasukan DHL Customer Experience',
      language: 'ms',
      status: 'hitl_required',
      generatedAt: hoursAgo(1.2),
    },
    agentResults: {
      intake: {
        fields: {
          email:    { value: 'farah.hassan@proton.me', confidence: 0.99 },
          subject:  { value: 'ADUAN: Bungkusan Rosak Teruk — Ini Kali Ketiga!' },
          awb:      { value: 'JD014600901234', confidence: 0.98 },
          location: { value: 'Shah Alam Hub', confidence: 0.91 },
          sentiment:{ value: 'very_frustrated', score: 0.09 },
        },
      },
      uncertainty: {
        reasons: [
          'High severity: Critical classification',
          'Repeat customer — 3 prior cases on record',
          'Escalation language: MCMC complaint and social media threat',
          'Active damage cluster at Shah Alam Hub',
        ],
      },
      resolution: {
        sopCode: 'SOP-MY-DAM-002',
        steps: [
          'Verify damage via customer photos — request 3 clear images of outer carton and contents',
          'Initiate replacement order through merchant portal, reference AWB JD014600901234',
          'Apply premium service credit (RM100) — repeat customer escalation protocol',
          'Escalate to Hub Operations Manager: active cluster at Shah Alam Hub requires ops review',
          'Schedule courtesy callback within 2 hours — assign to Senior PCC Executive',
        ],
        estimatedCompletion: '2 hours',
      },
      sop: { match: 'SOP-MY-DAM-002' },
    },
    conversationThread: [
      {
        role: 'customer',
        text: 'Helo, saya Farah Hassan. Saya baru sahaja hantar emel aduan tentang tablet saya yang rosak. AWB JD014600901234. Boleh saya dapatkan update sekarang? Saya sangat kecewa.',
        sentBy: 'farah.hassan@proton.me',
        channel: 'chat',
        ts: minutesAgo(52),
      },
      {
        role: 'ai',
        text: 'Selamat datang Puan Farah. Kami telah menerima aduan anda (AWB JD014600901234) dan sedang memprosesnya sebagai kes kritikal. Saya lihat ini adalah kali ketiga anda mengalami masalah dengan DHL — kami memohon maaf yang ikhlas. Boleh Puan kongsikan beberapa gambar kerosakan melalui chat ini supaya kami dapat mempercepatkan proses penilaian?',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(51),
      },
      {
        role: 'customer',
        text: 'Ini gambar-gambarnya. [3 gambar dilampirkan] — kotak luar yang remuk sepenuhnya, bungkusan dalaman yang koyak, dan skrin tablet Samsung Galaxy Tab S9 yang pecah teruk. Nilai RM2,199. Ini hadiah hari jadi anak saya. Saya rasa menangis tengok ni.',
        sentBy: 'farah.hassan@proton.me',
        channel: 'chat',
        ts: minutesAgo(44),
      },
      {
        role: 'ai',
        text: 'Terima kasih Puan Farah. Saya telah simpan kesemua 3 gambar ke dalam kes anda. Kerosakan ini jelas berlaku semasa transit — kotak luar menunjukkan impak langsung. Kes anda kini ditandakan KRITIKAL dan sedang menunggu kelulusan pengurus kanan. Saya faham betapa bermakna hadiah ini untuk Puan. Boleh Puan beritahu — bilakah hari jadi anak Puan?',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(43),
      },
      {
        role: 'customer',
        text: 'Hari Rabu depan — tinggal 6 hari je lagi. Saya nak tahu — kalau penggantian diluluskan sekarang, boleh sampai sebelum hari Rabu tak? Saya kat Shah Alam.',
        sentBy: 'farah.hassan@proton.me',
        channel: 'chat',
        ts: minutesAgo(38),
      },
      {
        role: 'ai',
        text: 'Ya Puan Farah. Berdasarkan lokasi Shah Alam dan stok semasa, penghantaran ekspres boleh tiba dalam 1-2 hari bekerja setelah penggantian diluluskan. Jika diluluskan hari ini, unit baru boleh tiba Isnin atau Selasa — sebelum hari Rabu. Saya juga telah menambah kredit perkhidmatan RM100 ke akaun Puan sebagai tanda penghargaan atas kesabaran Puan. Adakah Puan memerlukan penghantaran ke alamat yang sama?',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(37),
      },
      {
        role: 'customer',
        text: 'Ya, alamat yang sama. Baiklah, saya tunggu. Tapi kalau dalam 30 minit tiada siapa hubungi saya atau tiada pengesahan bertulis, saya terus post video unboxing ke TikTok dengan hashtag #DHLMalaysia. Saya ada 12,000 pengikut. Saya serius.',
        sentBy: 'farah.hassan@proton.me',
        channel: 'chat',
        ts: minutesAgo(30),
      },
      {
        role: 'ai',
        text: 'Kami faham sepenuhnya Puan Farah dan kami tidak memandang ringan perkara ini. Saya telah menghantar notifikasi segera kepada Pengurus Kanan PCC. Berikut adalah ringkasan tindakan yang sedang diambil: (1) Unit pengganti Samsung Galaxy Tab S9 sedang dikonfirmasi dengan gudang — anggaran penghantaran Isnin. (2) Kredit RM100 telah dikreditkan. (3) Seorang Eksekutif Kanan akan menghubungi Puan melalui telefon dalam masa 20 minit. Nombor rujukan kes Puan: CRT-2026-05-FAR-001. Puan akan menerima e-mel pengesahan dalam beberapa minit.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(29),
      },
    ],
    sla: {
      deadlineAt: new Date(Date.now() + 0.5 * 60 * 60 * 1000),
      breachProbability: 0.81,
      breachProbabilityUpdatedAt: hoursAgo(0.5),
      hoursRemaining: 0.5,
    },
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
  },

  // ── Case 2: High-value electronics, frustrated first-time customer ────────────
  {
    createdAt: hoursAgo(3.5),
    title: 'Critical — RM8,500 Laptop Damaged, MCMC Threat, Klang',
    description:
      'Customer Marcus Tan received critically damaged laptop (RM8,500). Outer packaging shows forklift impact marks. Customer is a first-time DHL user, frustrated, threatening MCMC complaint and social media post. Parcel JD014600123789.',
    rawInput: `To DHL Malaysia Customer Service,

I am writing to formally complain about the absolutely unacceptable condition in which my parcel (AWB JD014600123789) was delivered today at 2:47 PM to my address in Klang.

The parcel contained a Dell XPS 15 laptop worth RM8,500 — a professional tool I use for my freelance content creation work. When I received it, the outer box had a massive structural dent spanning the entire left side. The foam inserts inside were completely compressed flat. The laptop itself powers on but the screen has a visible crack from corner to corner and the chassis is bent.

This is my FIRST TIME using DHL Express. I was told by my shipper that DHL was the most reliable option for high-value electronics. I trusted that recommendation and I now regret it completely.

I have 47,000 followers on Twitter and I document my tech purchases regularly. I will not hesitate to post about this experience — including photos — if this is not resolved within 24 hours.

I am also prepared to file a formal complaint with MCMC.

I want a full replacement unit (same model, same spec) or a complete refund of RM8,500. Nothing less.

Marcus Tan
marcus.tan@gmail.com
016-234-8821`,
    type: 'damaged_parcel',
    severity: 'Critical',
    status: 'PENDING_REVIEW',
    location: 'Klang Hub',
    source: 'rpa',
    confidence: 0.72,
    holdForReview: true,
    department: 'Customer Service',
    customerEmail: 'marcus.tan@gmail.com',
    awbNumber: 'JD014600123789',
    detectedLanguage: 'en',
    sentimentScore: 0.14,
    sentimentLabel: 'very_frustrated',
    isRepeatCustomer: false,
    customerHistoryCount: 0,
    rejectionReason: 'Critical severity · High-value item (RM8,500) · Escalation language detected (MCMC, social media) · Damage suggests handling fault',
    recoveryMessage: {
      text: 'Dear Mr Marcus,\n\nWe sincerely apologise for the condition your laptop arrived in. This is absolutely not the standard of service DHL stands for, and we understand your frustration completely.\n\nWe are taking immediate action:\n1. A dedicated senior case manager has been assigned to your case\n2. A full damage assessment is being initiated\n3. We will arrange either a full replacement or complete refund — your choice\n4. A service credit of RM150 has been added to your account\n\nYou will be contacted within 2 hours. We deeply regret this experience.\n\nSincerely,\nDHL Senior Customer Experience Team',
      language: 'en',
      status: 'hitl_required',
      generatedAt: hoursAgo(3.1),
    },
    agentResults: {
      intake: {
        fields: {
          email:    { value: 'marcus.tan@gmail.com', confidence: 0.99 },
          subject:  { value: 'DESTROYED LAPTOP — DHL Negligence — RM8500 Claim' },
          awb:      { value: 'JD014600123789', confidence: 0.97 },
          location: { value: 'Klang Hub', confidence: 0.88 },
        },
      },
      uncertainty: {
        reasons: [
          'High severity: Critical classification',
          'High declared value: RM8,500',
          'Escalation language: MCMC complaint, social media exposure',
          'Possible handling fault — forklift damage pattern',
        ],
      },
      resolution: {
        sopCode: 'SOP-MY-DAM-HV-001',
        steps: [
          'Request 5 clear photos: outer box all sides, inner packaging, item damage',
          'Initiate high-value damage assessment — escalate to Quality team',
          'Offer full replacement or refund — no partial settlements for Critical cases',
          'Apply RM150 service credit and document in CRM under DAMAGE-HIGHVAL',
          'Send written apology and resolution timeline within 30 minutes',
        ],
        estimatedCompletion: '3 hours',
      },
      sop: { match: 'SOP-MY-DAM-HV-001' },
    },
    conversationThread: [
      {
        role: 'customer',
        text: 'Hi, I just filed a complaint about my destroyed laptop (AWB JD014600123789). I need someone to respond NOW. This is a RM8,500 machine.',
        sentBy: 'marcus.tan@gmail.com',
        channel: 'chat',
        ts: minutesAgo(185),
      },
      {
        role: 'ai',
        text: 'Hi Marcus, I\'ve pulled up your case (AWB JD014600123789). I can see from your email that the damage to your Dell XPS 15 is severe — I\'m so sorry this happened on your first DHL shipment. This is being treated as a Critical case. Could you share photos of the damage? I need: (1) all sides of the outer box, (2) the inner foam packaging, (3) the laptop itself showing the screen and chassis damage.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(184),
      },
      {
        role: 'customer',
        text: 'Photos uploaded. [5 images attached] — you can see the box dent is massive, the foam is totally crushed, the screen is cracked diagonally, and the chassis is visibly bent near the hinge. I need to know — can you match the exact spec? Dell XPS 15 9530, i7-13700H, 32GB RAM, 1TB SSD.',
        sentBy: 'marcus.tan@gmail.com',
        channel: 'chat',
        ts: minutesAgo(175),
      },
      {
        role: 'ai',
        text: 'Thank you Marcus — photos received and logged. The damage pattern is consistent with a direct impact load, likely at a sorting facility. Your case reference is CRT-2026-05-MAR-001. Regarding the spec: for high-value replacement, we either arrange same-spec unit through our merchant partner OR issue a full refund of RM8,500 — whichever you prefer. A Senior Case Manager will contact you within 2 hours to confirm. I\'ve also applied a RM150 service credit to your account.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(174),
      },
      {
        role: 'customer',
        text: 'I want the replacement, not a refund. And I need to know the serial number for warranty purposes. Also — I have a client deadline this Friday. Can this be expedited? I literally cannot work without this machine.',
        sentBy: 'marcus.tan@gmail.com',
        channel: 'chat',
        ts: minutesAgo(160),
      },
      {
        role: 'ai',
        text: 'Understood — replacement noted. I\'ve flagged your Friday deadline to the Case Manager. For same-spec replacement with our merchant partner, delivery is typically 2-3 business days. Given your deadline, I\'ve added an URGENT tag for possible next-day dispatch. The Case Manager will confirm the exact serial number and delivery date when they call. Is Klang the correct delivery address?',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(159),
      },
    ],
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
  },

  // ── Case 3: System error, ops context ───────────────────────────────────────
  {
    createdAt: hoursAgo(6),
    title: 'High — Tracking System Error, 47 Deliveries Frozen, KLIA',
    description:
      'Operations team reports tracking platform error affecting 47 deliveries at KLIA Hub. Scan events not registering since 06:30. Customers seeing stale "In Transit" status. Possible API gateway fault.',
    rawInput: `[INTERNAL OPS ESCALATION — KLIA Hub Supervisor to PCC]

Priority: HIGH
Reported: 06:47 today
Reported by: Hafiz Rahim, KLIA Hub Supervisor (hafiz.rahim@dhl.com)

ISSUE SUMMARY:
Tracking platform scan events have stopped registering at KLIA Hub since approximately 06:30 today. All parcel scans at inbound, sortation, and outbound stations are completing physically, but no data is being written to the tracking API.

IMPACT:
- 47 active deliveries currently showing stale "In Transit" status
- 12 of these are time-sensitive: 8 Medical (cold chain), 4 Express next-day
- Customer-facing tracking portal is showing data 2+ hours old
- 3 customers have already called the PCC hotline asking for updates

TECHNICAL DETAILS:
- Platform: DHL TrakPro v4.2
- Last successful scan event recorded: 06:28:41 (Server timestamp)
- API gateway log shows HTTP 504 timeout errors starting 06:29
- Possible root cause: scheduled maintenance on backend DB ran 30 minutes late and may not have completed cleanly
- IT on-call (Raj Kumar, IT Operations) has been notified at 06:52 — investigating

IMMEDIATE RISK:
- If medical cold chain parcels miss scan windows, compliance flags will trigger
- Customer complaint volume will spike if tracking remains frozen past 08:00 (peak query window)
- SLA breach risk for 4 express parcels if not resolved by 09:00

REQUEST:
PCC to authorise proactive SMS blast to affected customers and coordinate with Hub Manager on manual logging fallback.

Hafiz Rahim | KLIA Hub Supervisor | +60 3-8787 4000 ext 312`,
    type: 'system_error',
    severity: 'High',
    status: 'PENDING_REVIEW',
    location: 'KLIA Hub',
    source: 'manual',
    confidence: 0.77,
    holdForReview: true,
    department: 'Operations',
    customerEmail: 'ops.klia@dhl.com',
    sentimentLabel: 'neutral',
    isRepeatCustomer: false,
    rejectionReason: 'High severity · System-wide impact (47 parcels) · Requires ops team decision',
    agentResults: {
      intake: {
        fields: {
          email:   { value: 'ops.klia@dhl.com', confidence: 0.99 },
          subject: { value: '[OPS] KLIA Tracking Platform — Scan Events Not Registering' },
          location:{ value: 'KLIA Hub', confidence: 0.99 },
        },
      },
      uncertainty: {
        reasons: [
          'High severity: system-wide impact',
          'Multi-parcel incident: 47 deliveries affected',
          'Requires IT and Ops co-ordination — beyond single agent authority',
        ],
      },
      resolution: {
        sopCode: 'SOP-MY-SYS-001',
        steps: [
          'Immediately notify IT Operations on-call — reference KLIA tracking API',
          'Manually log all 47 affected AWBs in the exception register',
          'Send proactive SMS to affected customers: "Tracking temporarily unavailable"',
          'Restore scan events from offline backup once API is restored',
          'Post-incident review within 24 hours — update SOP if gap identified',
        ],
        estimatedCompletion: '4 hours',
      },
      sop: { match: 'SOP-MY-SYS-001' },
    },
    conversationThread: [
      {
        role: 'agent',
        text: '[INTERNAL NOTE] Received ops escalation from Hafiz Rahim at KLIA Hub. 47 parcels affected, tracking API down since 06:30. IT on-call (Raj Kumar) already notified. Initiating PCC response protocol.',
        sentBy: 'pcc.ops@dhl.com',
        channel: 'email',
        ts: minutesAgo(360),
      },
      {
        role: 'ai',
        text: '[AI TRIAGE] System error classified HIGH. 8 medical cold chain parcels identified in affected batch — these have compliance scan windows. Recommend immediate action: (1) IT escalation to P1 (SLA: 30 min resolution), (2) Proactive SMS to all 47 customers, (3) Manual scan log fallback activated at KLIA. Drafting customer SMS template now.',
        sentBy: 'DHL AI Assistant',
        channel: 'email',
        ts: minutesAgo(358),
      },
      {
        role: 'agent',
        text: '[INTERNAL NOTE] Escalated to Raj Kumar IT team as P1. Manual logging activated at KLIA for medical parcels. Proactive SMS draft approved — sending to 47 customers. Hafiz Rahim confirmed manual scan process running. ETA for API restore: 45 minutes.',
        sentBy: 'pcc.ops@dhl.com',
        channel: 'email',
        ts: minutesAgo(340),
      },
      {
        role: 'ai',
        text: '[AI UPDATE] 3 customer calls received to PCC hotline re: stale tracking. All 3 given verbal update: "System maintenance in progress, expected restoration 09:00". No complaints escalated. Medical parcel compliance windows: 6 of 8 are within safe buffer. 2 require manual confirmation from cold chain team — flagging to Hub Manager.',
        sentBy: 'DHL AI Assistant',
        channel: 'email',
        ts: minutesAgo(320),
      },
      {
        role: 'agent',
        text: '[INTERNAL NOTE] IT confirms API restored at 08:54. Backfill of scan events from offline buffer initiated — estimated 15 minutes to sync. All 47 parcels should show correct status by 09:15. Cold chain compliance confirmed for all 8 medical parcels. Post-incident review scheduled 14:00 today.',
        sentBy: 'pcc.ops@dhl.com',
        channel: 'email',
        ts: minutesAgo(310),
      },
    ],
    confidenceHistory: BASE_CONFIDENCE_HISTORY('system_error'),
  },

  // ── Case 4: Insurance claim, corporate customer ──────────────────────────────
  {
    createdAt: hoursAgo(12),
    title: 'High — RM15,000 Machine Components Damaged, Insurance Claim, Penang',
    description:
      'Corporate customer Nextech Sdn Bhd reports parcel JD014600456123 arrived crushed. Machine components insured for RM15,000. Insurance provider already notified. DHL liability claim anticipated. Legal team may be involved.',
    rawInput: `From: procurement@nextech.com.my
To: dhl.corporate@dhl.com.my
Subject: Formal Damage Claim — AWB JD014600456123 — Nextech Sdn Bhd — Insured RM15,000

Dear DHL Corporate Client Solutions,

We are writing on behalf of Nextech Sdn Bhd (Account No: DHL-CORP-NT-4421) regarding parcel AWB JD014600456123, delivered yesterday at 11:20 AM to our Penang facility at Bayan Lepas Industrial Park.

The parcel contained precision CNC machine calibration components (Item Ref: NXT-CAL-007) with a declared and insured value of RM15,000. Upon opening, our engineering team found the components were severely compressed — the primary calibration housing is cracked and two alignment sensors are non-functional.

We have already notified our insurance provider, Etiqa Takaful (Policy No: ETQ-IND-2024-88234), and they are requiring a formal incident reference number from DHL before processing the claim. Please provide this immediately.

Additionally, we require:
1. DHL's formal incident acknowledgement letter (for insurance submission)
2. Damage assessment report from your Quality team within 5 business days
3. Confirmation of DHL's liability position given we hold a corporate shipment protection rider

Note: Nextech has a quarterly shipment volume of approximately RM800,000 through DHL. We are reviewing our preferred carrier arrangement pending resolution of this claim.

Please treat this as urgent.

Regards,
Lim Boon Keat
Head of Procurement, Nextech Sdn Bhd
procurement@nextech.com.my | +60 4-642 8800`,
    type: 'damaged_parcel',
    severity: 'High',
    status: 'PENDING_REVIEW',
    location: 'Penang Hub',
    source: 'rpa',
    confidence: 0.75,
    holdForReview: true,
    department: 'Customer Service',
    customerEmail: 'procurement@nextech.com.my',
    awbNumber: 'JD014600456123',
    detectedLanguage: 'en',
    sentimentLabel: 'frustrated',
    sentimentScore: 0.28,
    isRepeatCustomer: true,
    customerHistoryCount: 1,
    rejectionReason: 'High severity · High declared value (RM15,000) · Insurance claim in progress · Corporate account',
    recoveryMessage: {
      text: 'Dear Nextech Procurement Team,\n\nWe acknowledge receipt of your damage claim for parcel JD014600456123. A dedicated corporate account manager has been assigned and will contact you within 4 business hours.\n\nFor insurance purposes, please retain all packaging and damaged items pending our assessor visit. We will cover reasonable storage costs.\n\nWe sincerely apologise for this disruption to your operations.\n\nRegards,\nDHL Corporate Customer Solutions',
      language: 'en',
      status: 'hitl_required',
      generatedAt: hoursAgo(11),
    },
    agentResults: {
      intake: {
        fields: {
          email:    { value: 'procurement@nextech.com.my', confidence: 0.99 },
          subject:  { value: 'Formal Damage Claim — AWB JD014600456123 — Nextech Sdn Bhd' },
          awb:      { value: 'JD014600456123', confidence: 0.99 },
          location: { value: 'Penang Hub', confidence: 0.92 },
        },
      },
      uncertainty: {
        reasons: [
          'High severity: High classification',
          'Corporate account — escalated handling required',
          'Insurance claim in progress — legal review needed',
          'Declared value RM15,000 exceeds standard resolution authority',
        ],
      },
      resolution: {
        sopCode: 'SOP-MY-CORP-DAM-001',
        steps: [
          'Assign dedicated Corporate Account Manager within 1 hour',
          'Schedule on-site damage assessment — do not advise disposal of packaging',
          'Liaise with DHL insurance partner — initiate claim reference number',
          'Escalate to Legal if claim exceeds RM10,000 — standard liability threshold',
          'Provide written incident report to customer within 48 hours',
        ],
        estimatedCompletion: '48 hours',
      },
      sop: { match: 'SOP-MY-CORP-DAM-001' },
    },
    conversationThread: [
      {
        role: 'customer',
        text: 'Good morning. This is Lim Boon Keat from Nextech. We have filed a formal complaint regarding AWB JD014600456123. We need the DHL incident reference number urgently — our insurer Etiqa Takaful requires it before processing our claim. How soon can you provide this?',
        sentBy: 'procurement@nextech.com.my',
        channel: 'email',
        ts: minutesAgo(720),
      },
      {
        role: 'ai',
        text: 'Good morning Mr Lim. I have retrieved your case and I understand the urgency. Your DHL incident reference number is: INC-PEN-2026-05-NXT-001. Please use this in all correspondence with Etiqa Takaful. A dedicated Corporate Account Manager will be assigned within 4 business hours and will contact you to begin the formal damage assessment process. Could you confirm whether the original packaging and damaged components are still secured at your Bayan Lepas facility?',
        sentBy: 'DHL AI Assistant',
        channel: 'email',
        ts: minutesAgo(718),
      },
      {
        role: 'customer',
        text: 'Yes, packaging and components are secured. I have instructed our team not to dispose of anything. I also need to flag — the insurance assessor may need to visit on-site. Will DHL coordinate with Etiqa directly, or do we need to be the intermediary? Also, what is the realistic timeline for the damage assessment report?',
        sentBy: 'procurement@nextech.com.my',
        channel: 'email',
        ts: minutesAgo(700),
      },
      {
        role: 'ai',
        text: 'Understood — please keep all materials secured. On your questions: (1) DHL can liaise directly with Etiqa Takaful once your Account Manager is assigned — we will need your policy number (ETQ-IND-2024-88234 as noted in your email) and Etiqa\'s assessor contact. (2) The formal damage assessment report typically takes 5-7 business days. Given the claim value and your corporate account status, we will aim for 5 days. (3) DHL\'s assessor can coordinate the on-site visit jointly with Etiqa\'s representative — we will schedule this together to avoid disruption to your operations.',
        sentBy: 'DHL AI Assistant',
        channel: 'email',
        ts: minutesAgo(698),
      },
      {
        role: 'customer',
        text: 'That is acceptable. One final point — I need this on record: Nextech ships approximately RM800,000 per quarter through DHL. We are reviewing our carrier arrangement. I expect this to be resolved with the seriousness it deserves. Please escalate to whoever can provide that assurance.',
        sentBy: 'procurement@nextech.com.my',
        channel: 'email',
        ts: minutesAgo(680),
      },
      {
        role: 'ai',
        text: 'Mr Lim, I have flagged this case to our Head of Corporate Accounts (Penang region). Your account volume and the stakes here are fully understood. You can expect a direct call from our Director of Corporate Client Solutions, Ms Cindy Wong, before end of business today. DHL values the Nextech partnership and we intend to resolve this to your complete satisfaction.',
        sentBy: 'DHL AI Assistant',
        channel: 'email',
        ts: minutesAgo(678),
      },
    ],
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
  },

  // ── Case 5: SLA breach risk, enterprise account ──────────────────────────────
  {
    createdAt: hoursAgo(5),
    title: 'High — Enterprise SLA Breach +18h, Service Credits Due, KL',
    description:
      'Enterprise account TechCorp MY Sdn Bhd (Platinum tier) reports parcel JD014600789456 overdue by 18 hours against their guaranteed 24-hour SLA. Contract requires service credit of RM500 per breach hour after the first 4.',
    rawInput: `From: logistics@techcorp-my.com
To: dhl.enterprise@dhl.com.my
Subject: URGENT: SLA Breach — JD014600789456 — 18 Hours Overdue — Service Credits Owed

To the DHL Enterprise Account Team,

This is a formal notification of an SLA breach under our Platinum Enterprise Service Agreement (Contract Ref: TCMY-DHL-2025-PLT).

Parcel JD014600789456 was due for delivery at 09:00 yesterday under our guaranteed 24-hour express SLA. It is now 18 hours past the guaranteed delivery window with no delivery and no proactive communication from DHL.

As per Clause 7.3 of our agreement: service credits of RM500 per breach hour apply after the first 4-hour grace period. Calculation: 18 hours total breach − 4 grace hours = 14 billable hours × RM500 = RM7,000 in service credits owed.

This is not the first breach this quarter. We experienced a similar incident in March (Ref: TCQ-2026-03-SLA). We escalated internally after that and were given assurances of improvement.

I need the following by 12:00 today:
1. Current status of JD014600789456 — where is this parcel right now?
2. Written acknowledgement of the RM7,000 credit obligation
3. ETA for delivery
4. Root cause explanation

If these are not received by 12:00, we will invoke the contract performance review clause.

Rizwan Harun
Head of Logistics, TechCorp MY Sdn Bhd
logistics@techcorp-my.com | 03-2785 9900`,
    type: 'late_delivery',
    severity: 'High',
    status: 'PENDING_REVIEW',
    location: 'Kuala Lumpur',
    source: 'manual',
    confidence: 0.79,
    holdForReview: true,
    department: 'Logistics',
    customerEmail: 'logistics@techcorp-my.com',
    awbNumber: 'JD014600789456',
    detectedLanguage: 'en',
    sentimentLabel: 'frustrated',
    sentimentScore: 0.31,
    isRepeatCustomer: true,
    customerHistoryCount: 2,
    rejectionReason: 'High severity · Enterprise SLA breach · Contract credit obligation · Platinum account',
    recoveryMessage: {
      text: 'Dear TechCorp MY Logistics Team,\n\nWe acknowledge the SLA breach for parcel JD014600789456 and take full responsibility. Per your Platinum SLA agreement:\n\n• 14 breach hours beyond the 4-hour grace period = RM7,000 in service credits\n• Credits will be applied to your account within 24 hours\n• Your dedicated account manager will call within 1 hour\n• Full root cause report will be delivered within 48 hours\n\nWe sincerely apologise for this disruption.\n\nDHL Enterprise Account Management',
      language: 'en',
      status: 'hitl_required',
      generatedAt: hoursAgo(4.5),
    },
    agentResults: {
      intake: {
        fields: {
          email:    { value: 'logistics@techcorp-my.com', confidence: 0.99 },
          subject:  { value: 'URGENT: SLA Breach — JD014600789456 — 18 Hours Overdue' },
          awb:      { value: 'JD014600789456', confidence: 0.99 },
          location: { value: 'Kuala Lumpur', confidence: 0.95 },
        },
      },
      uncertainty: {
        reasons: [
          'High severity: SLA breach',
          'Enterprise Platinum account — contract credit obligation',
          'Repeat customer — 2 prior cases this quarter',
          'Credit value RM7,000 requires senior approval',
        ],
      },
      resolution: {
        sopCode: 'SOP-MY-ENT-SLA-001',
        steps: [
          'Calculate breach credits per contract: (breach hours − 4) × RM500 rate',
          'Contact Enterprise Account Manager immediately — do not communicate credits without approval',
          'Locate parcel — contact KL Hub operations for live status',
          'Apply approved credits to account and generate formal credit note',
          'Deliver written root cause analysis within 48 hours',
        ],
        estimatedCompletion: '6 hours',
      },
      sop: { match: 'SOP-MY-ENT-SLA-001' },
    },
    conversationThread: [
      {
        role: 'customer',
        text: 'Hi, Rizwan here from TechCorp MY. I filed the SLA breach complaint (AWB JD014600789456). I need to know: where is this parcel right now, and do you confirm the RM7,000 credit calculation is correct per our contract?',
        sentBy: 'logistics@techcorp-my.com',
        channel: 'email',
        ts: minutesAgo(300),
      },
      {
        role: 'ai',
        text: 'Good morning Rizwan. I have your case open. On parcel location: JD014600789456 is currently at KL Sorting Hub — it missed the morning dispatch due to a vehicle capacity issue. It has been prioritised for the afternoon run (13:00 departure), with estimated delivery between 15:00-17:00 today. I am sorry for the delay in communication — that should not have happened. Regarding the credit calculation: 18 hours breach − 4 grace hours = 14 billable hours × RM500 = RM7,000. The calculation is correct per Clause 7.3. This requires formal approval from your Enterprise Account Manager before I can issue the credit note. I have flagged this as urgent.',
        sentBy: 'DHL AI Assistant',
        channel: 'email',
        ts: minutesAgo(298),
      },
      {
        role: 'customer',
        text: 'Thank you for the honest response — that is more than I have gotten all morning. I am noting that you confirmed the RM7,000 figure. Who is our Enterprise Account Manager? I have not heard from them. And the March breach (TCQ-2026-03-SLA) — was that credit ever actually applied to our account?',
        sentBy: 'logistics@techcorp-my.com',
        channel: 'email',
        ts: minutesAgo(280),
      },
      {
        role: 'ai',
        text: 'Your dedicated Enterprise Account Manager is Ms Faizah Mohd Noor (faizah.mohd@dhl.com, +60 3-7724 8812). I have sent her an urgent flag and she should call you within the hour. On the March credit: I can confirm credit ref TCQ-2026-03-CR (RM4,500) was applied on 18 March 2026. I can generate a credit statement showing this if that would help. I am noting your concern about repeat breaches — I will include this in the escalation note to the Operations Review team.',
        sentBy: 'DHL AI Assistant',
        channel: 'email',
        ts: minutesAgo(278),
      },
      {
        role: 'customer',
        text: 'Yes please send the credit statement. And I need the root cause for today\'s breach in writing. I have a board report next week and I need to show we are managing carrier performance. If there is a structural issue with DHL\'s KL capacity, I need to know.',
        sentBy: 'logistics@techcorp-my.com',
        channel: 'email',
        ts: minutesAgo(260),
      },
      {
        role: 'ai',
        text: 'Understood Rizwan. I am generating: (1) Credit account statement (March credit + pending RM7,000) — will be emailed within 30 minutes. (2) Root cause report: today\'s delay was caused by a vehicle fleet reallocation at KL Hub — one vehicle diverted for a time-critical medical shipment, causing capacity shortage on the standard express run. Formal RCA document will be ready within 48 hours with corrective actions. I will ensure Ms Faizah includes all of this in her call.',
        sentBy: 'DHL AI Assistant',
        channel: 'email',
        ts: minutesAgo(258),
      },
    ],
    sla: {
      deadlineAt: hoursAgo(1),
      breachProbability: 1.0,
      breachProbabilityUpdatedAt: hoursAgo(1),
      hoursRemaining: -18,
    },
    confidenceHistory: BASE_CONFIDENCE_HISTORY('late_delivery'),
  },

  // ── Case 6: Water damage, medium severity ───────────────────────────────────
  {
    createdAt: hoursAgo(9),
    title: 'Medium — Water-Damaged Parcel, Documents & Stationery, Johor Bahru',
    description:
      'Customer Ahmad Zulkifli reports parcel JD014600567234 delivered with visible water damage. Contents were official documents and stationery. Documents partially legible. Customer requests partial compensation and replacement of damaged items.',
    rawInput: `Kepada Pasukan Khidmat Pelanggan DHL Malaysia,

Saya Ahmad Zulkifli, ingin membuat aduan mengenai bungkusan AWB JD014600567234 yang saya terima semalam dari Johor Bahru.

Bungkusan tersebut mengandungi dokumen-dokumen yang sangat PENTING dan SULIT — ia adalah dokumen pembiayaan rumah saya dari bank CIMB, termasuk Surat Tawaran Pembiayaan, Perjanjian Gadai Janji, dan beberapa salinan yang telah disahkan oleh peguam. Jumlah nilai pembiayaan: RM380,000.

Apabila bungkusan sampai, bahagian bawah kotak basah sepenuhnya dan ada tanda dakwat biru tersebar di beberapa halaman. Surat Tawaran Pembiayaan — dokumen yang paling penting — kertasnya lembik dan sebahagian teks tidak boleh dibaca lagi.

Masalahnya: saya perlu menyerahkan semula dokumen-dokumen ini kepada CIMB dalam masa 3 hari (deadline: Khamis ini) untuk pengesahan akhir. Kalau gagal, proses pembelian rumah saya terpaksa ditangguhkan minimum 30 hari kerana dokumen perlu dicetak dan disahkan semula oleh peguam — kos tambahan kira-kira RM800.

Saya mahu DHL:
1. Akui secara bertulis bahawa kerosakan berlaku semasa penghantaran (untuk saya tunjukkan kepada CIMB dan peguam)
2. Bayar kos untuk mencetak semula dan pensijilan semula dokumen (RM800 anggaran)
3. Beri jaminan keutamaan untuk penghantaran semula dokumen-dokumen yang baru dicetak

Saya tidak marah, tapi saya dalam situasi yang tertekan kerana ini melibatkan pembelian rumah pertama saya.

Ahmad Zulkifli
ahmad.zulkifli@ymail.com
013-456-7823`,
    type: 'damaged_parcel',
    severity: 'Medium',
    status: 'PENDING_REVIEW',
    location: 'Johor Bahru Hub',
    source: 'rpa',
    confidence: 0.73,
    holdForReview: true,
    department: 'Customer Service',
    customerEmail: 'ahmad.zulkifli@ymail.com',
    awbNumber: 'JD014600567234',
    detectedLanguage: 'ms',
    sentimentLabel: 'frustrated',
    sentimentScore: 0.33,
    isRepeatCustomer: false,
    customerHistoryCount: 0,
    rejectionReason: 'Medium severity · Document damage may have legal implications · Customer requesting compensation',
    recoveryMessage: {
      text: 'Saudara Ahmad yang dihormati,\n\nKami memohon maaf atas kerosakan yang berlaku pada bungkusan anda. Kami faham bahawa dokumen-dokumen tersebut adalah penting.\n\nKami menawarkan:\n• Pampasan separuh harga untuk item yang rosak\n• Penghantaran semula bagi item yang boleh digantikan\n• Kredit perkhidmatan RM30 ke akaun anda\n\nSila hubungi kami dengan senarai item yang rosak.\n\nTerima kasih,\nDHL Customer Care',
      language: 'ms',
      status: 'hitl_required',
      generatedAt: hoursAgo(8.5),
    },
    agentResults: {
      intake: {
        fields: {
          email:    { value: 'ahmad.zulkifli@ymail.com', confidence: 0.99 },
          subject:  { value: 'Bungkusan Basah — JD014600567234 — Dokumen Rasmi Rosak' },
          awb:      { value: 'JD014600567234', confidence: 0.98 },
          location: { value: 'Johor Bahru Hub', confidence: 0.87 },
        },
      },
      uncertainty: {
        reasons: [
          'Medium severity: document damage may have legal implications',
          'Customer first contact — unclear if items replaceable',
          'Water damage pattern unclear — possible transit vs. storage cause',
        ],
      },
      resolution: {
        sopCode: 'SOP-MY-DAM-003',
        steps: [
          'Request photos of damaged documents and wet packaging',
          'Assess whether damage occurred in transit or at facility',
          'Offer partial compensation for non-replaceable documents',
          'Apply RM30 service credit — standard Medium damage protocol',
        ],
        estimatedCompletion: '24 hours',
      },
      sop: { match: 'SOP-MY-DAM-003' },
    },
    conversationThread: [
      {
        role: 'customer',
        text: 'Salam. Saya Ahmad Zulkifli. Bungkusan saya AWB JD014600567234 sampai basah. Masalah besar — ia mengandungi dokumen bank untuk pembiayaan rumah saya. Perjanjian gadai janji dan surat tawaran. Deadline Khamis ni.',
        sentBy: 'ahmad.zulkifli@ymail.com',
        channel: 'chat',
        ts: minutesAgo(540),
      },
      {
        role: 'ai',
        text: 'Salam Encik Ahmad. Saya faham betapa seriusnya situasi ini — dokumen pembiayaan perumahan adalah dokumen yang tidak boleh ambil mudah. Saya perlu tanya beberapa soalan untuk membantu dengan segera: (1) Boleh Encik ambil beberapa gambar dokumen yang rosak dan bungkusan yang basah? (2) Apakah nama bank dan nama cawangan peguam yang mengesahkan dokumen ini?',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(539),
      },
      {
        role: 'customer',
        text: 'Gambar dah upload. [4 gambar dilampirkan] Boleh nampak dakwat tersebar, kertas lembik. Bank CIMB, cawangan Johor Bahru. Peguam Messrs Tan & Associates, JB. Yang paling kritikal adalah Surat Tawaran — ia perlu tandatangan asal dan ada cop bank, kalau rosak kena minta semula dari bank dan proses dari awal.',
        sentBy: 'ahmad.zulkifli@ymail.com',
        channel: 'chat',
        ts: minutesAgo(525),
      },
      {
        role: 'ai',
        text: 'Terima kasih Encik Ahmad — gambar-gambar diterima dan dilog. Ini yang saya cadangkan untuk selesaikan masalah Encik sebelum deadline Khamis: (1) Saya sedang menyediakan surat pengakuan rasmi dari DHL (letterhead) yang menyatakan kerosakan berlaku semasa transit — Encik boleh guna ini untuk CIMB dan peguam. (2) DHL akan menanggung kos cetakan semula dan pensijilan peguam (RM800 seperti yang Encik nyatakan). (3) Penghantaran semula dokumen baru akan diberi keutamaan — Urgent Express, percuma. Boleh saya tahu — adakah Encik boleh ke pejabat peguam esok untuk mulakan proses cetakan semula?',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(523),
      },
      {
        role: 'customer',
        text: 'Alhamdulillah, terima kasih. Ya saya boleh pergi pejabat peguam esok pagi. Tapi saya perlu tahu — surat pengakuan DHL tu, adakah ia cukup untuk CIMB terima sebagai alasan untuk extend deadline? Mereka agak ketat.',
        sentBy: 'ahmad.zulkifli@ymail.com',
        channel: 'chat',
        ts: minutesAgo(510),
      },
      {
        role: 'ai',
        text: 'Surat pengakuan rasmi DHL (berkop surat dan bertandatangan Pengurus) biasanya diterima oleh institusi kewangan sebagai bukti force majeure atau keadaan di luar kawalan. Saya cadangkan Encik hubungi CIMB terus dengan surat ini dan minta extension 5 hari bekerja. Saya juga boleh masukkan dalam surat itu maklumat khusus AWB, tarikh penghantaran, dan keterangan kerosakan — ini akan membantu. Surat akan siap dalam 2 jam dan dihantar ke e-mel Encik. Adakah alamat ahmad.zulkifli@ymail.com betul?',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(508),
      },
    ],
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
  },

  // ── Case 7: International customs, frustrated customer ───────────────────────
  {
    createdAt: hoursAgo(7),
    title: 'Medium — International Shipment Held 5 Days, KLIA Customs',
    description:
      'Customer Priya Nadarajan reports parcel JD014600234890 from Germany held at KLIA customs for 5 days. No status updates. Customer has called customs directly with no resolution. Contains electronic components for her home office setup.',
    rawInput: `Dear DHL Malaysia,

I am writing regarding AWB JD014600234890, an international shipment sent from Munich, Germany by my colleague Dr. Stefan Brauer on 22 April 2026.

The parcel contains electronic components for my home office — specifically a Thunderbolt 4 docking station, two USB-C hubs, and a mechanical keyboard. Total declared value: EUR 420 (approximately RM2,100).

According to DHL tracking, the parcel arrived at KLIA on 24 April and has shown "Clearance in progress" for 5 days now with no further updates. I called KLIA customs directly on 27 April and was told they could not give me information without a DHL reference — they directed me back to you.

I work from home and these components are needed for a remote project I started this week. Every day of delay is affecting my productivity.

I have two questions:
1. Is there a documentation issue I need to resolve? If customs needs additional paperwork, no one has told me what to provide.
2. Do I need to physically go to KLIA to resolve this, or can DHL handle it on my behalf?

I am patient but I need clear information so I can plan accordingly.

Thank you,
Priya Nadarajan
priya.nadarajan@outlook.com
017-892-3341`,
    type: 'late_delivery',
    severity: 'Medium',
    status: 'PENDING_REVIEW',
    location: 'KLIA Hub',
    source: 'manual',
    confidence: 0.71,
    holdForReview: true,
    department: 'Logistics',
    customerEmail: 'priya.nadarajan@outlook.com',
    awbNumber: 'JD014600234890',
    detectedLanguage: 'en',
    sentimentLabel: 'frustrated',
    sentimentScore: 0.29,
    isRepeatCustomer: false,
    customerHistoryCount: 0,
    rejectionReason: 'Medium severity · Customs hold requires specialist intervention · Unclear documentation status',
    recoveryMessage: {
      text: 'Dear Ms Priya,\n\nWe apologise for the delay with your international shipment JD014600234890. Customs holds can be complex, but our specialist team is here to help.\n\nWe will:\n1. Contact KLIA customs on your behalf to identify the specific hold reason\n2. Advise you on any additional documentation required within 24 hours\n3. Expedite clearance once documentation is confirmed\n\nYou will receive an update by end of business today.\n\nBest regards,\nDHL International Clearance Team',
      language: 'en',
      status: 'hitl_required',
      generatedAt: hoursAgo(6.5),
    },
    agentResults: {
      intake: {
        fields: {
          email:    { value: 'priya.nadarajan@outlook.com', confidence: 0.99 },
          subject:  { value: 'International Parcel Stuck at KLIA Customs — 5 Days No Update' },
          awb:      { value: 'JD014600234890', confidence: 0.97 },
          location: { value: 'KLIA Hub', confidence: 0.93 },
        },
      },
      uncertainty: {
        reasons: [
          'Medium severity: customs hold cause unknown',
          'Documentation status unclear — may require customer action',
          'Specialist clearance team involvement needed',
        ],
      },
      resolution: {
        sopCode: 'SOP-MY-INT-CUS-001',
        steps: [
          'Contact KLIA customs liaison — request specific hold reason and required docs',
          'Notify customer of hold reason within 4 hours',
          'Assist with customs documentation preparation if needed',
          'Expedite release request once documentation confirmed complete',
        ],
        estimatedCompletion: '24 hours',
      },
      sop: { match: 'SOP-MY-INT-CUS-001' },
    },
    conversationThread: [
      {
        role: 'customer',
        text: 'Hi, I\'m Priya. I emailed about AWB JD014600234890 — it\'s been 5 days at KLIA customs. The biggest thing I need to know: do I need to go to KLIA physically? I am in Subang Jaya and going to KLIA is not simple for me.',
        sentBy: 'priya.nadarajan@outlook.com',
        channel: 'chat',
        ts: minutesAgo(420),
      },
      {
        role: 'ai',
        text: 'Hi Priya, great news on your main question: you do NOT need to go to KLIA physically. DHL has a licensed customs broker on-site at KLIA who can act on your behalf for clearance. I have located your shipment — AWB JD014600234890 is held at the KLIA Customs examination bay. The hold appears to be a routine SST (Sales & Service Tax) assessment on electronics imported for personal use. I am reaching out to our KLIA customs liaison now to confirm the exact requirement.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(419),
      },
      {
        role: 'customer',
        text: 'Oh that is such a relief — thank you. SST — does that mean I need to pay something? The total value was EUR 420 which is about RM2,100. My colleague in Germany filled the commercial invoice correctly. What documents are they asking for?',
        sentBy: 'priya.nadarajan@outlook.com',
        channel: 'chat',
        ts: minutesAgo(400),
      },
      {
        role: 'ai',
        text: 'Yes, you may owe SST. For personal electronics imports above RM500, the rate is 8% SST on the assessed value. For RM2,100 declared value: estimated SST = RM168. However, I need to confirm the exact assessment from customs — the amount may be lower if some components qualify for exemption. I have submitted an enquiry to our KLIA customs liaison and should have the exact figure within 3 hours. Once confirmed, I will send you a payment instruction. Payment can be done online — no need to go anywhere.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(398),
      },
      {
        role: 'customer',
        text: 'That is fine, RM168 is manageable. How long after I pay before it is released and delivered? And is there anything I can provide now to speed this up — I have the original commercial invoice and packing list from Stefan.',
        sentBy: 'priya.nadarajan@outlook.com',
        channel: 'chat',
        ts: minutesAgo(380),
      },
      {
        role: 'ai',
        text: 'Yes — please send the commercial invoice and packing list to clearance.klia@dhl.com with your AWB number in the subject line. This will help our broker present a complete file to customs and may speed up the assessment. Once the SST payment is confirmed, typical release time is 4-8 hours and delivery is next business day. I will monitor your case and send you a payment link as soon as the amount is confirmed. You\'re very close to getting your parcel, Priya.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(378),
      },
    ],
    confidenceHistory: BASE_CONFIDENCE_HISTORY('late_delivery'),
  },

  // ── Case 8: High-value jewellery missing, CCTV dispute ───────────────────────
  {
    createdAt: hoursAgo(11),
    title: 'High — RM3,200 Jewellery Missing, CCTV Shows No Delivery, Petaling Jaya',
    description:
      'Customer Wei Chen reports parcel JD014600890567 marked as delivered 3 days ago but never received. Contains jewellery declared at RM3,200. Building management reviewed security footage — no DHL courier visible at delivery time.',
    rawInput: `To: DHL Malaysia Investigations / Senior Management
From: wei.chen.pj@gmail.com
Subject: MISSING PARCEL + FRAUDULENT DELIVERY SCAN — JD014600890567 — RM3,200 Jewellery

Dear DHL,

I am writing to report what I believe may be a fraudulent delivery event for parcel AWB JD014600890567.

The parcel — which I ordered from a jewellery boutique in Singapore — was marked as "Delivered" on your system at 14:32, 29 April 2026 at my address in Petaling Jaya, Selangor. I was home all day. I received nothing. No knock, no notification, no parcel.

I immediately checked with my building management at Vista Residences. They reviewed the security CCTV footage covering all entrance points and the lift lobby for the entire period between 14:00-15:00 on 29 April. There is NO DHL courier visible anywhere in the footage during that window. The building has 4 camera angles covering all access points. There is no way a courier delivered to my floor without appearing on at least one camera.

The parcel contains a gold necklace with diamond pendant (SKU: SG-JWL-9X-PEND) declared at RM3,200. I have the purchase invoice.

I also have screenshots of the CCTV timestamps clearly showing no DHL presence. I am prepared to share these with DHL and if necessary, the police.

What I need:
1. A formal investigation — I want to know who scanned this parcel as "delivered" and where the physical parcel is now
2. The GPS location data from the courier's device at 14:32 on 29 April — this should be retrievable
3. Full value compensation of RM3,200 OR return of the parcel

I have retained a lawyer (subject to how this is handled). This needs to be treated seriously.

Wei Chen
wei.chen.pj@gmail.com
012-567-9034`,
    type: 'missing_parcel',
    severity: 'High',
    status: 'PENDING_REVIEW',
    location: 'Petaling Jaya Hub',
    source: 'rpa',
    confidence: 0.76,
    holdForReview: true,
    department: 'Customer Service',
    customerEmail: 'wei.chen.pj@gmail.com',
    awbNumber: 'JD014600890567',
    detectedLanguage: 'en',
    sentimentLabel: 'very_frustrated',
    sentimentScore: 0.12,
    isRepeatCustomer: true,
    customerHistoryCount: 1,
    rejectionReason: 'High severity · CCTV contradicts delivery scan · High declared value · Possible fraudulent delivery event',
    recoveryMessage: {
      text: 'Dear Mr Wei Chen,\n\nWe take this matter extremely seriously. A false delivery scan is a significant incident that we will investigate with the highest priority.\n\nImmediate steps being taken:\n1. Courier GPS data for the delivery slot is being retrieved\n2. The delivery driver has been contacted for statement\n3. An internal investigation has been opened under case MISSING-PJ-001\n4. We will not close this until the parcel is located or full compensation is arranged\n\nYou will receive an update within 4 hours. We sincerely apologise.\n\nDHL Investigations Team',
      language: 'en',
      status: 'hitl_required',
      generatedAt: hoursAgo(10.5),
    },
    agentResults: {
      intake: {
        fields: {
          email:    { value: 'wei.chen.pj@gmail.com', confidence: 0.99 },
          subject:  { value: 'Missing Parcel — Tracking Shows Delivered But CCTV Contradicts' },
          awb:      { value: 'JD014600890567', confidence: 0.98 },
          location: { value: 'Petaling Jaya Hub', confidence: 0.89 },
        },
      },
      uncertainty: {
        reasons: [
          'High severity: CCTV contradicts delivery scan',
          'Possible fraudulent or ghost delivery event',
          'High declared value (RM3,200) — investigation required before compensation',
          'Repeat customer — 1 prior case',
        ],
      },
      resolution: {
        sopCode: 'SOP-MY-MISS-INV-001',
        steps: [
          'Retrieve courier GPS track for delivery time slot — compare to CCTV timestamp',
          'Obtain signed statement from delivery driver within 24 hours',
          'Review POD (Proof of Delivery) signature/photo — check validity',
          'Open formal internal investigation — Investigations Team ref MISSING-PJ',
          'If investigation confirms non-delivery: initiate full value compensation (RM3,200)',
        ],
        estimatedCompletion: '48 hours',
      },
      sop: { match: 'SOP-MY-MISS-INV-001' },
    },
    conversationThread: [
      {
        role: 'customer',
        text: 'Hi. I\'m Wei Chen. I\'ve filed a complaint about a missing parcel JD014600890567, RM3,200 jewellery. DHL tracking says delivered but I have CCTV from my building showing NO DHL courier appeared during the delivery window. I have screenshots. What can you tell me?',
        sentBy: 'wei.chen.pj@gmail.com',
        channel: 'chat',
        ts: minutesAgo(660),
      },
      {
        role: 'ai',
        text: 'Mr Wei Chen, I want to be completely honest with you: a delivery scan with no physical courier presence is a serious discrepancy that we take extremely seriously. This is being opened as a formal investigation, not a standard lost parcel claim. Case reference: INV-PJ-2026-05-WC-001. I need to ask — the CCTV screenshots showing no DHL courier between 14:00-15:00 on 29 April: can you share these with us directly? They will be critical evidence.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(658),
      },
      {
        role: 'customer',
        text: 'Yes I can share them. [4 CCTV screenshots attached] These are from 14:00, 14:25, 14:40, and 15:00. You can see the lobby entrance, lift lobby, and ground floor — all clear. The building manager Mr Rajan has agreed to provide an official statement if needed. He can be reached at 03-7784 6600.',
        sentBy: 'wei.chen.pj@gmail.com',
        channel: 'chat',
        ts: minutesAgo(645),
      },
      {
        role: 'ai',
        text: 'CCTV screenshots received — logged as evidence. Thank you for the building manager contact. I have opened a formal GPS audit request for courier ID associated with the JD014600890567 scan event at 14:32 on 29 April. GPS data will show us the courier\'s exact location when the "delivered" scan was made. This is retrievable and will take 2-4 hours. I have also placed an urgent hold on the assigned courier\'s account pending investigation — this is standard protocol. I want to be clear: if the GPS confirms the courier was not at your address, this is a serious internal matter and full compensation will be arranged.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(643),
      },
      {
        role: 'customer',
        text: 'Thank you for taking this seriously. One more thing — I see on the tracking that a "POD signature" was captured. I definitely did not sign anything. Can I see what signature or photo was used as proof of delivery? If someone forged a signature, that is a criminal matter.',
        sentBy: 'wei.chen.pj@gmail.com',
        channel: 'chat',
        ts: minutesAgo(620),
      },
      {
        role: 'ai',
        text: 'You are right to ask. I have retrieved the POD record for JD014600890567. The system shows a photo POD (no signature) — but I cannot share it directly in this chat as it may contain sensitive location metadata. Your investigation case manager will share it securely and will review whether the photo matches your address. I want to note: if the POD photo shows a different location, combined with your CCTV evidence, this constitutes strong grounds for a ghost delivery finding. Your case manager, Encik Farouk Ibrahim (farouk.ibrahim@dhl.com), has been assigned and will contact you within 90 minutes with the GPS findings and POD image review.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(618),
      },
      {
        role: 'customer',
        text: 'Understood. I am also consulting with a lawyer about this. I want to be clear — I am not looking to cause trouble, I just want my RM3,200 jewellery or the equivalent. But if the investigation shows what I think it shows, I expect DHL to take disciplinary action against whoever did this. Not just compensate me.',
        sentBy: 'wei.chen.pj@gmail.com',
        channel: 'chat',
        ts: minutesAgo(600),
      },
      {
        role: 'ai',
        text: 'Mr Wei Chen, your position is completely reasonable. I want to confirm: DHL has a zero-tolerance policy for fraudulent delivery events. If our investigation confirms a ghost delivery, the case will be referred to our Internal Compliance and HR team, and you will receive a written update on the disciplinary outcome (within the limits of employee privacy law). Your compensation of RM3,200 will not be conditional on the investigation outcome — if non-delivery is confirmed, full compensation will be processed within 5 business days. We deeply regret that you are in this situation.',
        sentBy: 'DHL AI Assistant',
        channel: 'chat',
        ts: minutesAgo(598),
      },
    ],
    confidenceHistory: BASE_CONFIDENCE_HISTORY('missing_parcel'),
  },
];

// 4 UNDER_REVIEW incidents
const underReviewIncidents = [
  {
    createdAt: hoursAgo(14),
    title: 'Address Error — Misrouted to Wrong State, Ipoh',
    description:
      'Parcel JD014600123456 addressed to Ipoh was delivered to Penang. Customer has confirmed receipt at wrong location. Parcel needs to be retrieved and re-routed. Both parties are cooperative.',
    rawInput: 'Parcel JD014600123456 misrouted from Ipoh to Penang. Retrieval required.',
    type: 'address_error',
    severity: 'Medium',
    status: 'UNDER_REVIEW',
    location: 'Ipoh Hub',
    source: 'manual',
    confidence: 0.80,
    holdForReview: false,
    department: 'Logistics',
    agentResults: {},
  },
  {
    createdAt: hoursAgo(16),
    title: 'Late Delivery — Subang Warehouse B2B',
    description:
      'Subang warehouse customer reports parcel JD014600234567 carrying auto parts is 36 hours overdue. Production line stalled awaiting components. B2B priority escalation required.',
    rawInput:
      'B2B auto parts parcel JD014600234567 36 hours late at Subang. Production stalled.',
    type: 'late_delivery',
    severity: 'High',
    status: 'UNDER_REVIEW',
    location: 'Subang Hub',
    source: 'rpa',
    confidence: 0.82,
    holdForReview: false,
    department: 'Operations',
    agentResults: {},
  },
  {
    createdAt: hoursAgo(18),
    title: 'Wrong Item — Klang, Customer Received Someone Else\'s Parcel',
    description:
      'Customer in Klang received a parcel containing household goods but ordered computer peripherals. Different name on inner packaging. Possible parcel swap at sorting facility.',
    rawInput:
      'Parcel swap suspected at Klang Hub. Customer received wrong parcel with different name on inner packaging.',
    type: 'wrong_item',
    severity: 'Medium',
    status: 'UNDER_REVIEW',
    location: 'Klang Hub',
    source: 'manual',
    confidence: 0.75,
    holdForReview: false,
    department: 'Operations',
    agentResults: {},
  },
  {
    createdAt: hoursAgo(20),
    title: 'Missing Parcel — Penang Hub Investigation',
    description:
      'Parcel JD014600345678 missing from Penang Hub for 4 days. Internal investigation opened. Hub manager has reviewed scanning logs. Last scan was at sorting bay 3.',
    rawInput:
      'Missing parcel JD014600345678 Penang Hub. Last scan at sorting bay 3. Internal investigation ongoing.',
    type: 'missing_parcel',
    severity: 'Medium',
    status: 'UNDER_REVIEW',
    location: 'Penang Hub',
    source: 'rpa',
    confidence: 0.78,
    holdForReview: false,
    department: 'Operations',
    agentResults: {},
  },
];

// 6 ASSIGNED incidents
const assignedIncidents = [
  {
    createdAt: daysAgo(1),
    title: 'Late Delivery — Kuala Lumpur Residential, Assigned to Ops',
    description:
      'Customer at Taman Desa KL reports parcel JD014600456789 now 4 days overdue. Multiple calls to customer service. Assigned to Operations team for direct hub intervention.',
    rawInput: 'Parcel JD014600456789 4 days overdue at KL hub. Multiple customer complaints.',
    type: 'late_delivery',
    severity: 'Medium',
    status: 'ASSIGNED',
    location: 'Kuala Lumpur',
    source: 'manual',
    confidence: 0.85,
    holdForReview: false,
    department: 'Operations',
    agentResults: {},
  },
  {
    createdAt: daysAgo(1),
    title: 'Damaged Parcel — KLIA Hub, Assigned to Customer Service',
    description:
      'International parcel JD014600567890 arrived with significant water damage. Customer has provided photos. Assigned to Customer Service for compensation processing and replacement arrangement.',
    rawInput:
      'International parcel JD014600567890 water damaged at KLIA. Photos provided. Compensation required.',
    type: 'damaged_parcel',
    severity: 'High',
    status: 'ASSIGNED',
    location: 'KLIA Hub',
    source: 'rpa',
    confidence: 0.88,
    holdForReview: false,
    department: 'Customer Service',
    agentResults: {},
  },
  {
    createdAt: daysAgo(1),
    title: 'Missing Parcel — Shah Alam, Logistics Team Assigned',
    description:
      'Parcel JD014600678901 last seen at Shah Alam Hub loading dock 2 days ago. Logistics team assigned to conduct physical search and trace the parcel path through the facility.',
    rawInput: 'Parcel JD014600678901 missing at Shah Alam loading dock. Physical trace required.',
    type: 'missing_parcel',
    severity: 'Medium',
    status: 'ASSIGNED',
    location: 'Shah Alam Hub',
    source: 'rpa',
    confidence: 0.84,
    holdForReview: false,
    department: 'Logistics',
    agentResults: {},
  },
  {
    createdAt: daysAgo(1),
    title: 'Address Error — Johor Bahru Redistribution Required',
    description:
      'Batch of 3 parcels (JD014600789012, JD014600789013, JD014600789014) all sent to wrong addresses in Johor Bahru. Address input error traced to single business customer. Operations team assigned for retrieval and redistribution.',
    rawInput:
      'Batch address error at JB Hub. 3 parcels misdelivered. Business customer input error.',
    type: 'address_error',
    severity: 'Medium',
    status: 'ASSIGNED',
    location: 'Johor Bahru Hub',
    source: 'manual',
    confidence: 0.90,
    holdForReview: false,
    department: 'Operations',
    agentResults: {},
  },
  {
    createdAt: daysAgo(1),
    title: 'System Error — Tracking Platform API Timeout, Penang',
    description:
      'Penang Hub reports tracking API timing out for all scan events since 09:00. IT team assigned. Approximately 120 parcels affected with stale tracking status. No physical issue confirmed.',
    rawInput:
      'Tracking API timeout at Penang Hub since 09:00. 120 parcels with stale status. IT assigned.',
    type: 'system_error',
    severity: 'High',
    status: 'ASSIGNED',
    location: 'Penang Hub',
    source: 'manual',
    confidence: 0.87,
    holdForReview: false,
    department: 'Operations',
    agentResults: {},
  },
  {
    createdAt: daysAgo(1),
    title: 'Wrong Item — Petaling Jaya, Exchange Arranged',
    description:
      'Customer in Petaling Jaya received wrong item for the second time on same order. Customer Service assigned to personally manage the exchange and investigate recurring pick-pack error at origin warehouse.',
    rawInput:
      'Recurring wrong item delivery in Petaling Jaya. Second occurrence same order. CS assigned for exchange.',
    type: 'wrong_item',
    severity: 'Medium',
    status: 'ASSIGNED',
    location: 'Petaling Jaya Hub',
    source: 'rpa',
    confidence: 0.82,
    holdForReview: false,
    department: 'Customer Service',
    agentResults: {},
  },
];

// 4 IN_PROGRESS incidents
const inProgressIncidents = [
  {
    createdAt: daysAgo(2),
    title: 'Late Delivery — Ipoh Hub, Re-delivery Scheduled',
    description:
      'Parcel JD014600890123 overdue by 48 hours. Hub manager contacted. Parcel located at facility. Re-delivery scheduled for today between 14:00–18:00. Customer notified via SMS.',
    rawInput: 'Parcel JD014600890123 48 hours overdue at Ipoh Hub. Located at facility.',
    type: 'late_delivery',
    severity: 'Medium',
    status: 'IN_PROGRESS',
    location: 'Ipoh Hub',
    source: 'rpa',
    confidence: 0.91,
    holdForReview: false,
    department: 'Operations',
    agentResults: {
      resolution: {
        steps: ['Contacted hub manager', 'Parcel located in inbound sorting area', 'Re-delivery slot booked 14:00–18:00', 'Customer notified via SMS'],
        estimatedCompletion: '4 hours',
      },
    },
  },
  {
    createdAt: daysAgo(2),
    title: 'Damaged Parcel — Klang Hub, Replacement In Progress',
    description:
      'Parcel JD014600901234 received by customer in heavily damaged state. Electronics inside destroyed. Replacement has been sourced from merchant. Replacement parcel JD014600901999 dispatched from warehouse.',
    rawInput:
      'Electronics damaged in parcel JD014600901234. Replacement sourced and dispatched as JD014600901999.',
    type: 'damaged_parcel',
    severity: 'High',
    status: 'IN_PROGRESS',
    location: 'Klang Hub',
    source: 'rpa',
    confidence: 0.93,
    holdForReview: false,
    department: 'Customer Service',
    agentResults: {
      resolution: {
        steps: ['Damage confirmed via customer photos', 'Merchant contacted for replacement', 'Replacement parcel JD014600901999 dispatched', 'Estimated delivery tomorrow before noon'],
        estimatedCompletion: '2 hours',
      },
    },
  },
  {
    createdAt: daysAgo(2),
    title: 'Missing Parcel — KLIA Hub Trace Active',
    description:
      'Parcel JD014600012345 reported missing for 5 days. Active trace underway. Hub surveillance footage reviewed. Parcel potentially misloaded onto Johor route. Johor hub contacted for physical search.',
    rawInput:
      'Parcel JD014600012345 missing 5 days. Possibly misloaded to Johor route. Cross-hub trace active.',
    type: 'missing_parcel',
    severity: 'High',
    status: 'IN_PROGRESS',
    location: 'KLIA Hub',
    source: 'manual',
    confidence: 0.85,
    holdForReview: false,
    department: 'Logistics',
    agentResults: {
      resolution: {
        steps: ['CCTV reviewed at KLIA Hub', 'Parcel potentially on Johor route', 'Johor Bahru Hub contacted for physical search', 'Customer updated on trace progress'],
        estimatedCompletion: '6 hours',
      },
    },
  },
  {
    createdAt: daysAgo(2),
    title: 'Address Error — Shah Alam, Retrieval In Progress',
    description:
      'Parcel JD014600123890 delivered to wrong unit in Shah Alam condominium. Actual recipient confirmed parcel not received. Wrong recipient has been contacted and agreed to return the parcel. Courier dispatched for retrieval.',
    rawInput:
      'Parcel JD014600123890 delivered to wrong condo unit Shah Alam. Wrong recipient cooperative. Retrieval in progress.',
    type: 'address_error',
    severity: 'Medium',
    status: 'IN_PROGRESS',
    location: 'Shah Alam Hub',
    source: 'manual',
    confidence: 0.88,
    holdForReview: false,
    department: 'Operations',
    agentResults: {
      resolution: {
        steps: ['Wrong recipient contacted and cooperative', 'Courier dispatched for retrieval', 'Re-delivery to correct address scheduled upon retrieval'],
        estimatedCompletion: '3 hours',
      },
    },
  },
];

// 4 RESOLVED incidents (not in cluster)
const resolvedIncidents = [
  {
    createdAt: daysAgo(3),
    title: 'Late Delivery Resolved — Petaling Jaya',
    description:
      'Parcel JD014600234567 delivered 3 days late due to public holiday backlog at PJ Hub. Customer informed, apology issued, RM10 service voucher applied to account. Customer satisfied.',
    rawInput: 'Late delivery resolved at Petaling Jaya Hub. Holiday backlog cause identified.',
    type: 'late_delivery',
    severity: 'Low',
    status: 'RESOLVED',
    location: 'Petaling Jaya Hub',
    source: 'manual',
    confidence: 0.92,
    holdForReview: false,
    department: 'Customer Service',
    recoveryMessage: {
      text: 'Dear customer, we apologise for the delay. Your parcel has been delivered and a service voucher of RM10 has been added to your account.',
      language: 'en',
      status: 'auto_sent',
      generatedAt: daysAgo(2),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: daysAgo(1),
    },
    resolutionNote: 'Public holiday backlog at Petaling Jaya Hub caused 3-day delay. Parcel was stuck in sorting queue during Hari Raya extended weekend. Delivered morning after hub reopened. Customer accepted apology and RM10 voucher. Hub ops implementing pre-holiday surge staffing plan.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-LATE-001',
        steps: [
          'Identify root cause as public holiday backlog in PJ Hub sorting queue',
          'Prioritize delayed parcels for immediate dispatch on first working day',
          'Contact customer with apology and revised delivery timeline',
          'Apply RM10 service voucher to customer account',
          'Recommend pre-holiday surge staffing plan to hub operations manager',
        ],
      },
    },
  },
  {
    createdAt: daysAgo(4),
    title: 'Wrong Item Resolved — Subang Customer Exchange Complete',
    description:
      'Customer received wrong item (clothing instead of ordered electronics). Merchant arranged collection of wrong item and sent correct parcel via expedited delivery. Customer satisfied with resolution speed.',
    rawInput: 'Wrong item exchange completed at Subang. Correct parcel delivered.',
    type: 'wrong_item',
    severity: 'Medium',
    status: 'RESOLVED',
    location: 'Subang Hub',
    source: 'rpa',
    confidence: 0.94,
    holdForReview: false,
    department: 'Customer Service',
    recoveryMessage: {
      text: 'We have arranged collection of the incorrect item and your correct order is on its way. We apologise for the inconvenience.',
      language: 'en',
      status: 'approved',
      generatedAt: daysAgo(3),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: daysAgo(1),
    },
    resolutionNote: 'Cross-shipment error at Subang Hub sorting line. Two parcels with adjacent AWB numbers swapped during manual sort. Wrong item collected from customer within 24 hours via reverse pickup. Correct item dispatched same day on expedited route. Sorting station barcode scanner recalibrated. Operator retrained on dual-scan verification.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-WRG-001',
        steps: [
          'Identify cross-shipment via AWB number adjacent-swap pattern at Subang Hub',
          'Arrange reverse pickup of incorrect item from customer',
          'Dispatch correct item via expedited same-day route',
          'Recalibrate barcode scanner at affected sorting station',
          'Retrain sorting operator on dual-scan verification protocol',
        ],
      },
    },
  },
  {
    createdAt: daysAgo(5),
    title: 'Address Error Resolved — Johor Bahru Parcel Rerouted',
    description:
      'Parcel JD014600345890 sent to old address. Rerouting to new address completed within 24 hours. Customer thanked DHL for quick resolution. Case closed.',
    rawInput: 'Address correction and rerouting completed for JD014600345890 in Johor Bahru.',
    type: 'address_error',
    severity: 'Low',
    status: 'RESOLVED',
    location: 'Johor Bahru Hub',
    source: 'manual',
    confidence: 0.88,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Your parcel has been successfully rerouted to your new address and will arrive within 1 business day.',
      language: 'en',
      status: 'auto_sent',
      generatedAt: daysAgo(4),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: daysAgo(2),
    },
    resolutionNote: 'Address error caused by outdated address in merchant system. Parcel delivered to customer old address in Taman Pelangi. Rerouting arranged within 24 hours to new address in Taman Molek. Customer thanked DHL for quick turnaround. Merchant notified to update customer address database. Address validation API recommended to merchant.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-ADDR-001',
        steps: [
          'Identify address mismatch between merchant system and customer records',
          'Arrange parcel rerouting from old address to new address within 24 hours',
          'Notify merchant of outdated address in their system',
          'Recommend address validation API integration to merchant',
          'Confirm successful delivery at correct address with customer',
        ],
      },
    },
  },
  {
    createdAt: daysAgo(2),
    title: 'Late Delivery Resolved — KLIA International Clearance',
    description:
      'International parcel held at KLIA customs resolved after documentation resubmission. Parcel delivered to customer on Day 8. Customer accepted resolution and declined compensation.',
    rawInput: 'KLIA customs hold resolved via documentation resubmission. Parcel delivered Day 8.',
    type: 'late_delivery',
    severity: 'Medium',
    status: 'RESOLVED',
    location: 'KLIA Hub',
    source: 'rpa',
    confidence: 0.91,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Your international parcel has cleared customs and been delivered. We apologise for the extended delay caused by documentation requirements.',
      language: 'en',
      status: 'approved',
      generatedAt: daysAgo(1),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: daysAgo(1),
    },
    resolutionNote: 'International customs hold caused by incomplete commercial invoice from Korean shipper. Missing product value declaration triggered customs review. DHL Trade Automation team resubmitted corrected documentation. Parcel cleared on Day 7 and delivered Day 8. Customer declined compensation offer. Shipper flagged for mandatory pre-shipment documentation review.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-LATE-005',
        steps: [
          'Contact Korean shipper to obtain complete commercial invoice with product valuations',
          'Resubmit corrected customs documentation via DHL Trade Automation',
          'Monitor customs clearance progress with hourly status checks',
          'Proactively update customer on clearance timeline via email',
          'Flag shipper account for mandatory pre-shipment documentation review',
        ],
      },
    },
  },

  // ── 15 additional rich resolved incidents ──────────────────────────────────

  // missing_parcel — Kuala Lumpur
  {
    createdAt: daysAgo(6),
    title: 'Missing Parcel Resolved — JD014600901001 KL CBD Investigation',
    description: 'High-value parcel JD014600901001 (RM3,500 laptop) marked delivered at KL CBD but customer never received it. Investigation revealed misdelivery to adjacent unit. Parcel recovered and redelivered.',
    rawInput: 'KL CBD parcel JD014600901001 marked delivered but missing. Investigation required.',
    type: 'missing_parcel',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Kuala Lumpur',
    source: 'manual',
    confidence: 0.93,
    holdForReview: false,
    department: 'Customer Service',
    recoveryMessage: {
      text: 'Your parcel has been recovered and redelivered. We apologise for the confusion.',
      language: 'en', status: 'approved', generatedAt: daysAgo(5),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(4) },
    resolutionNote: 'Delivery driver misscanned parcel at Unit 12A instead of Unit 12B on same floor. Security CCTV confirmed parcel left at wrong door. Unit 12A occupant contacted and parcel retrieved within 3 hours. Redelivered to correct customer same afternoon. Driver retrained on unit number verification. GPS delivery confirmation now mandatory for multi-storey buildings.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-MISS-001',
        steps: [
          'Pull delivery driver GPS logs and scan records for the reported AWB',
          'Review CCTV at delivery building to confirm physical drop location',
          'Contact occupant at misdelivery address to retrieve parcel',
          'Arrange same-day redelivery to correct customer with apology letter',
          'Retrain driver on unit number verification; add GPS confirmation for multi-unit buildings',
        ],
      },
    },
  },

  // missing_parcel — Penang Hub warehouse
  {
    createdAt: daysAgo(10),
    title: 'Missing Parcel Resolved — Warehouse Scan Miss at Penang Hub',
    description: 'International parcel from Germany (JD014600901002) lost in Penang Hub for 5 days. Tracking showed no scan after customs clearance. Located in wrong bay after systematic scan sweep.',
    rawInput: 'Parcel JD014600901002 from Germany missing after Penang Hub customs clearance. No tracking for 5 days.',
    type: 'missing_parcel',
    severity: 'Medium',
    status: 'RESOLVED',
    location: 'Penang Hub',
    source: 'rpa',
    confidence: 0.90,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Your parcel has been located and is now out for delivery. We apologise for the delay.',
      language: 'en', status: 'auto_sent', generatedAt: daysAgo(9),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(7) },
    resolutionNote: 'Parcel misrouted to Bay C (domestic) instead of Bay A (international outbound) after customs clearance. Label partially obscured by moisture. Systematic scan sweep identified parcel in Bay C. Barcode rescanned and re-inducted into outbound flow. Moisture-resistant label lamination added to customs clearance process.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-MISS-002',
        steps: [
          'Initiate systematic scan sweep of all warehouse bays from last known scan point',
          'Check cross-contamination between domestic and international outbound bays',
          'Re-induct found parcel into correct routing flow with updated scan',
          'Notify customer of resolution with revised delivery ETA',
          'Add moisture-resistant label lamination requirement for international inbound parcels',
        ],
      },
    },
  },

  // missing_parcel — repeat customer
  {
    createdAt: daysAgo(14),
    title: 'Missing Parcel Resolved — Camera Equipment Subang, Customs Hold Battery',
    description: 'Customer Ahmad Razif (repeat, 3rd case) — parcel JD014600901003 (RM5,800 camera equipment) missing 3 days. Found held in customs queue due to undeclared lithium battery.',
    rawInput: 'Camera equipment JD014600901003 missing Subang. Customs hold suspected. Repeat customer 3rd escalation.',
    type: 'missing_parcel',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Subang Hub',
    source: 'rpa',
    confidence: 0.91,
    holdForReview: false,
    department: 'Customer Service',
    customerEmail: 'ahmad.razif@email.com',
    isRepeatCustomer: true,
    customerHistoryCount: 3,
    recoveryMessage: {
      text: 'Dear Ahmad, your parcel cleared customs and will be delivered tomorrow. RM50 credit applied.',
      language: 'en', status: 'approved', generatedAt: daysAgo(13),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(11) },
    resolutionNote: 'Lithium battery in camera equipment triggered customs hold under DCA regulations. Shipper had not declared battery specification. DHL Trade Automation submitted supplementary MSDS declaration within 4 hours. Parcel cleared and delivered next day. RM50 goodwill credit applied for repeat customer. Shipper flagged for mandatory battery declaration training.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-MISS-003',
        steps: [
          'Check customs queue for undeclared restricted items (lithium batteries)',
          'Submit supplementary customs declaration with MSDS document via DHL Trade Automation',
          'Apply RM50 goodwill credit to repeat customer account',
          'Arrange priority delivery once customs cleared',
          'Flag shipper for mandatory battery declaration training',
        ],
      },
    },
  },

  // system_error — mass tracking failure
  {
    createdAt: daysAgo(8),
    title: 'System Error Resolved — Tracking API Timeout Mass Failure, 280 Parcels',
    description: 'Tracking API gateway experienced timeout cascade affecting 280 parcels across 4 hubs. Customers receiving "Tracking Unavailable". Root cause: database connection pool exhaustion from N+1 query in v2.4.1.',
    rawInput: 'Mass tracking failure 280 parcels 4 hubs. API gateway timeout. DB connection pool exhausted.',
    type: 'system_error',
    severity: 'Critical',
    status: 'RESOLVED',
    location: 'Shah Alam Hub',
    source: 'manual',
    confidence: 0.97,
    holdForReview: false,
    department: 'IT',
    recoveryMessage: {
      text: 'Our tracking system has been fully restored. We apologise for the disruption.',
      language: 'en', status: 'approved', generatedAt: daysAgo(7),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(6) },
    resolutionNote: 'N+1 query on tracking status endpoint in v2.4.1 exhausted 50-connection pool. Hotfix: query refactored to batch fetch, pool raised to 200, RDS read replica added for tracking. All 280 customers received proactive SMS. Rollback plan documented. Load test threshold raised to 500 concurrent users.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-SYS-001',
        steps: [
          'Identify root cause: pull application logs, check DB connection pool metrics',
          'Hotfix N+1 query and scale connection pool from 50 to 200',
          'Add RDS read replica for tracking query traffic isolation',
          'Send proactive SMS to all 280 affected customers with restoration time',
          'Conduct post-incident review and raise load testing thresholds',
        ],
      },
    },
  },

  // system_error — barcode scanner firmware
  {
    createdAt: daysAgo(12),
    title: 'System Error Resolved — KLIA Hub Scanner Firmware Timestamp Corruption',
    description: 'Firmware v3.1 update to 12 KLIA Hub scanners caused UTC-to-MYT double-conversion bug, creating 8-hour phantom delays on 47 parcels. Immediate rollback issued.',
    rawInput: 'KLIA Hub 12 scanners corrupting timestamps after firmware v3.1 update. 47 parcels affected.',
    type: 'system_error',
    severity: 'High',
    status: 'RESOLVED',
    location: 'KLIA Cargo',
    source: 'manual',
    confidence: 0.95,
    holdForReview: false,
    department: 'IT',
    recoveryMessage: {
      text: 'Tracking issue at KLIA resolved. Your tracking information has been corrected.',
      language: 'en', status: 'approved', generatedAt: daysAgo(11),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(10) },
    resolutionNote: 'Firmware v3.1 bug converted UTC to MYT+8 twice, adding phantom 8-hour delay. Rolled back to v3.0.8 within 2 hours. 47 parcels manually rescanned with correct timestamps. Timezone regression test now mandatory before firmware production deployment.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-SYS-002',
        steps: [
          'Rollback firmware to last stable version on all 12 affected scanners immediately',
          'Identify all parcels scanned in affected window and manually rescan with correct timestamps',
          'Update corrupted tracking records in NEXUS database',
          'Notify affected customers that tracking data has been corrected',
          'Add timezone regression test to firmware staging pipeline',
        ],
      },
    },
  },

  // address_error — B2B tower
  {
    createdAt: daysAgo(9),
    title: 'Address Error Resolved — B2B Parts Delivered Wrong KLCC Tower, Manufacturing Halt',
    description: 'Urgent B2B parts JD014600902001 delivered to Tower A KLCC instead of Tower B. Client manufacturing line halted 4 hours. Parcel recovered and redelivered within 45 minutes.',
    rawInput: 'B2B urgent parts JD014600902001 wrong tower KLCC. Manufacturing halt. Quick recovery needed.',
    type: 'address_error',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Kuala Lumpur',
    source: 'rpa',
    confidence: 0.92,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Parts collected from Tower A and redelivered to Tower B. SLA credit issued.',
      language: 'en', status: 'approved', generatedAt: daysAgo(9),
    },
    followUp: { outcome: 'no_response', checkedAt: daysAgo(7) },
    resolutionNote: 'Driver read "Menara KLCC" without distinguishing Tower A vs Tower B. Manifest lacked sub-building identifier. Parcel collected from Tower A, hand-delivered to Tower B in 45 minutes. RM200 SLA credit issued. Manifest system updated to require sub-building identifier for all multi-tower complexes.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-ADDR-002',
        steps: [
          'Retrieve parcel from incorrect delivery point immediately',
          'Hand-deliver to correct sub-building within same complex',
          'Issue SLA credit for corporate client manufacturing downtime',
          'Update manifest system to require sub-building identifier for multi-tower complexes',
          'Flag address with explicit tower disambiguation note in delivery instructions',
        ],
      },
    },
  },

  // address_error — postcode reassignment
  {
    createdAt: daysAgo(16),
    title: 'Address Error Resolved — Postcode Reassignment Misrouted Parcel to Ipoh',
    description: 'Parcel JD014600902002 routed to Ipoh Hub due to outdated postcode 70450 — reassigned from Seremban to Ipoh area by Malaysia Post. Customer in Seremban waited 4 extra days.',
    rawInput: 'Postcode 70450 rerouted parcel JD014600902002 to Ipoh instead of Seremban. Postcode reassignment issue.',
    type: 'address_error',
    severity: 'Medium',
    status: 'RESOLVED',
    location: 'Ipoh Hub',
    source: 'manual',
    confidence: 0.88,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Parcel rerouted from Ipoh to your correct Seremban address. Delivery in 1-2 days.',
      language: 'en', status: 'auto_sent', generatedAt: daysAgo(15),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(13) },
    resolutionNote: 'Malaysia Post reassigned postcode 70450 in Q1 2026. DHL routing table not updated. 3 other affected parcels identified and rerouted. Full postcode database refresh scheduled Q2 2026. Automated validation against Malaysia Post current data added to address verification.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-ADDR-003',
        steps: [
          'Check postcode-to-hub mapping against Malaysia Post current postcode database',
          'Reroute parcel from Ipoh to correct Seremban destination',
          'Scan for other parcels affected by same postcode reassignment',
          'Update postcode routing database with Malaysia Post current data',
          'Schedule quarterly postcode database refresh and add automated validation check',
        ],
      },
    },
  },

  // wrong_item — e-commerce pick error
  {
    createdAt: daysAgo(11),
    title: 'Wrong Item Resolved — Shopee Merchant Pick Error, Gaming Headset vs Cosmetics',
    description: 'Customer received cosmetics instead of gaming headset JD014600903001. Shopee warehouse adjacent-shelf pick error. Correct item dispatched same day via express.',
    rawInput: 'Wrong item JD014600903001. Customer ordered gaming headset received cosmetics. Shopee pick error.',
    type: 'wrong_item',
    severity: 'Medium',
    status: 'RESOLVED',
    location: 'Subang Hub',
    source: 'rpa',
    confidence: 0.94,
    holdForReview: false,
    department: 'Customer Service',
    recoveryMessage: {
      text: 'Correct order dispatched, incorrect item collected via reverse pickup.',
      language: 'en', status: 'approved', generatedAt: daysAgo(10),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(8) },
    resolutionNote: 'Adjacent shelf positions for similar SKUs at Shopee warehouse. Correct item dispatched same day, wrong item collected via reverse pickup next day. Shopee merchant advised to implement barcode scan verification at packing station.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-WRG-002',
        steps: [
          'Confirm wrong item via customer photos and cross-reference with merchant SKU list',
          'Raise ticket on Shopee merchant portal for correct item dispatch',
          'Arrange reverse pickup of wrong item',
          'Track correct item dispatch and confirm delivery',
          'Advise merchant to implement barcode scan verification at packing station',
        ],
      },
    },
  },

  // wrong_item — B2B cross-shipment
  {
    createdAt: daysAgo(18),
    title: 'Wrong Item Resolved — B2B Industrial Parts Cross-Shipment, Shah Alam',
    description: 'Two B2B shipments (JD014600903002 and JD014600903003) swapped at Shah Alam Hub. Client A received hydraulic fittings meant for Client B; Client B received electronic modules meant for Client A. Both productions affected.',
    rawInput: 'B2B cross-shipment Shah Alam JD014600903002 and JD014600903003 swapped. Two clients production impacted.',
    type: 'wrong_item',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Shah Alam Hub',
    source: 'manual',
    confidence: 0.96,
    holdForReview: false,
    department: 'Operations',
    recoveryMessage: {
      text: 'Cross-shipment error identified. Coordinated swap recovery completed within 6 hours.',
      language: 'en', status: 'approved', generatedAt: daysAgo(17),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(15) },
    resolutionNote: 'Adjacent manifest labels applied to wrong parcels during manual sorting. Recovery: simultaneous reverse pickups from both clients, cross-delivery of correct items within 6 hours. SLA credits RM500 each. Dimension-weight mismatch alert added to sorting line for B2B industrial shipments.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-WRG-003',
        steps: [
          'Identify both affected parties via AWB and manifest cross-reference',
          'Coordinate simultaneous reverse pickups from both clients',
          'Cross-deliver correct items within same business day',
          'Issue RM500 SLA credit to each corporate account',
          'Add dimension-weight mismatch alert to sorting line for B2B shipments',
        ],
      },
    },
  },

  // late_delivery — cosmetics customs
  {
    createdAt: daysAgo(20),
    title: 'Late Delivery Resolved — Cosmetics Misclassified as Pharmaceutical at KLIA',
    description: 'Cosmetics shipment JD014600904001 held 7 days at KLIA customs — automated system classified it as pharmaceutical due to ingredient names. Manual reclassification with NPRA certificate resolved.',
    rawInput: 'Cosmetics JD014600904001 held KLIA. Misclassified pharmaceutical by automated customs. Manual review needed.',
    type: 'late_delivery',
    severity: 'Medium',
    status: 'RESOLVED',
    location: 'KLIA Cargo',
    source: 'rpa',
    confidence: 0.89,
    holdForReview: false,
    department: 'Logistics',
    recoveryMessage: {
      text: 'Cosmetics shipment cleared customs. Delivery within 2 business days.',
      language: 'en', status: 'approved', generatedAt: daysAgo(19),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(17) },
    resolutionNote: 'Cosmetics ingredients (niacinamide, retinol) triggered pharmaceutical flag. DHL customs liaison filed manual reclassification with NPRA-approved certificates. Cleared within 24 hours. Merchant advised to use INCI standard ingredient format for future Malaysia shipments.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-LATE-007',
        steps: [
          'Contact KLIA customs liaison to obtain specific hold reason and HS code',
          'File manual reclassification request with NPRA-approved product safety certificates',
          'Provide INCI-format ingredient list to customs for product category verification',
          'Expedite review with customs supervisor once documentation submitted',
          'Advise merchant to use INCI standard format for all cosmetics shipments to Malaysia',
        ],
      },
    },
  },

  // damaged_parcel — recurring conveyor issue
  {
    createdAt: daysAgo(22),
    title: 'Damaged Parcel Resolved — JB Hub Recurring Conveyor Roller Gap Issue',
    description: 'Third damaged parcel complaint from Johor Bahru Hub in 2 weeks. Corrugated box crushed on Line 3 roller conveyor. Root cause: roller gap 28mm (DHL standard: 20mm). Engineering fix applied across all lines.',
    rawInput: 'Third damaged parcel JB Hub. Conveyor Line 3 roller gap too wide. Engineering inspection triggered.',
    type: 'damaged_parcel',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Johor Bahru Hub',
    source: 'manual',
    confidence: 0.93,
    holdForReview: false,
    department: 'Operations',
    recoveryMessage: {
      text: 'Replacement arranged and recurring conveyor issue at JB Hub identified and fixed.',
      language: 'en', status: 'approved', generatedAt: daysAgo(21),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(19) },
    resolutionNote: 'Line 3 roller gap at 28mm (standard: 20mm). Thin-wall corrugated boxes partially fell between rollers and were crushed. All Line 3 rollers adjusted to 19mm. Lines 1 and 4 also found out-of-spec and corrected. Monthly conveyor gap audit added to maintenance schedule.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-DAM-006',
        steps: [
          'Arrange customer replacement via merchant portal',
          'Trigger engineering inspection of all conveyor roller gaps at JB Hub',
          'Adjust all out-of-spec rollers to 20mm DHL standard',
          'Review all recent damage complaints from same hub to identify common conveyor line',
          'Add monthly conveyor gap audit to hub preventive maintenance schedule',
        ],
      },
    },
  },

  // late_delivery — CNY surge
  {
    createdAt: daysAgo(25),
    title: 'Late Delivery Resolved — CNY Surge 89 Parcels Delayed, Ipoh Hub',
    description: '89 parcels delayed 2-4 days at Ipoh Hub during Chinese New Year. Volume 340% above forecast. Emergency sorters deployed from Shah Alam. All cleared within 4 days.',
    rawInput: 'Ipoh Hub CNY surge 340% volume. 89 parcels delayed. Emergency crew deployed.',
    type: 'late_delivery',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Ipoh Hub',
    source: 'rpa',
    confidence: 0.91,
    holdForReview: false,
    department: 'Operations',
    recoveryMessage: {
      text: 'Your parcel dispatched from Ipoh Hub. Apologies for the CNY delay.',
      language: 'en', status: 'auto_sent', generatedAt: daysAgo(24),
    },
    followUp: { outcome: 'no_response', checkedAt: daysAgo(22) },
    resolutionNote: 'CNY e-commerce volume 340% above forecast. 15 emergency sorters deployed from Shah Alam Day 2. All 89 parcels cleared within 4 days. CNY 2027 capacity plan revised to 400% above baseline. Overflow arrangement secured with Ipoh Industrial Area depot.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-LATE-008',
        steps: [
          'Deploy emergency sorters from nearest hub within 24 hours of capacity breach',
          'Prioritise oldest parcels in FIFO order',
          'Send proactive SMS to all 89 affected customers with revised ETA',
          'Activate overflow arrangement with Ipoh Industrial Area depot',
          'Revise CNY capacity plan to 400% above baseline for following year',
        ],
      },
    },
  },

  // missing_parcel — RTS wrong phone number
  {
    createdAt: daysAgo(28),
    title: 'Missing Parcel Resolved — International RTS Intercepted, Wrong Phone Number',
    description: 'Parcel JD014600905001 from Singapore returned-to-sender after 3 failed deliveries. Customer claims they were home. Investigation: wrong contact number (missing leading 0) prevented delivery SMS.',
    rawInput: 'Singapore parcel JD014600905001 returned to sender 3 failed attempts Puchong. Customer was home. Phone number issue.',
    type: 'missing_parcel',
    severity: 'Medium',
    status: 'RESOLVED',
    location: 'Subang Hub',
    source: 'manual',
    confidence: 0.87,
    holdForReview: false,
    department: 'Customer Service',
    recoveryMessage: {
      text: 'Parcel intercepted and re-dispatched with correct contact number.',
      language: 'en', status: 'approved', generatedAt: daysAgo(27),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(25) },
    resolutionNote: 'Merchant system stored phone number missing leading zero (0123456789 entered as 123456789). Driver SMS never delivered. Parcel recalled from RTS queue before Singapore return shipment triggered. Correct phone number updated. Re-dispatched and delivered on first attempt. Malaysian phone number format validation (01x prefix) added to address submission workflow.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-MISS-004',
        steps: [
          'Intercept RTS parcel at hub before international return is triggered',
          'Verify correct customer contact details with shipper',
          'Update contact information and re-dispatch with driver notification enabled',
          'Confirm delivery on first attempt',
          'Add Malaysian phone number format validation to address submission workflow',
        ],
      },
    },
  },

  // system_error — webhook timeout
  {
    createdAt: daysAgo(30),
    title: 'System Error Resolved — Payment Webhook Timeout Froze 140 Shipments',
    description: 'Billplz payment webhook timeout caused 140 prepaid shipments to remain in CREATED status for 6 hours despite payment confirmation. Batch correction script run; webhook handler made async.',
    rawInput: 'Billplz webhook timeout froze 140 shipments CREATED status. Payment confirmed. Batch correction needed.',
    type: 'system_error',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Kuala Lumpur',
    source: 'rpa',
    confidence: 0.96,
    holdForReview: false,
    department: 'IT',
    recoveryMessage: {
      text: 'System issue resolved and all shipment statuses have been updated.',
      language: 'en', status: 'auto_sent', generatedAt: daysAgo(29),
    },
    followUp: { outcome: 'satisfied', checkedAt: daysAgo(27) },
    resolutionNote: 'Billplz webhook timeout 3s; DHL handler average 4.2s under load. Billplz stopped retrying after 3 failures. Fix: webhook handler made async (200 OK immediately, process in queue). 140 shipments batch-corrected via payment reference cross-matching. All 140 customers received SMS. Webhook health dashboard added.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-SYS-003',
        steps: [
          'Identify webhook failure via Billplz dashboard and DHL webhook logs',
          'Run batch correction script for all CREATED shipments with confirmed payment',
          'Send status correction SMS to all 140 affected customers',
          'Make webhook handler async: return 200 immediately, process in background queue',
          'Add webhook health monitoring with alerting on timeout rate > 1%',
        ],
      },
    },
  },
  // ── Test customer: hasooni1098@gmail.com — 3 prior resolved incidents ────
  {
    createdAt: daysAgo(21),
    title: 'Late Delivery — KLIA Cargo — hasooni1098',
    description:
      'From: Hasan <hasooni1098@gmail.com>\nSubject: Late parcel delivery\n\nMy parcel JD019800123456 was supposed to arrive 5 days ago from KLIA Cargo. I have been waiting and there is no update on tracking. This is very frustrating as it is a birthday gift.',
    rawInput: 'Late delivery complaint from hasooni1098@gmail.com. Parcel JD019800123456, KLIA Cargo origin, 5 days overdue. Birthday gift.',
    type: 'late_delivery',
    severity: 'High',
    status: 'RESOLVED',
    location: 'KLIA Cargo',
    source: 'rpa',
    confidence: 0.91,
    holdForReview: false,
    department: 'Customer Service',
    customerEmail: 'hasooni1098@gmail.com',
    awbNumber: 'JD019800123456',
    detectedLanguage: 'en',
    sentimentScore: 0.25,
    sentimentLabel: 'frustrated',
    isRepeatCustomer: false,
    customerHistoryCount: 0,
    resolvedAt: daysAgo(19),
    resolutionNote: 'Parcel was held at KLIA customs clearance due to missing commercial invoice. Coordinated with merchant to provide documentation. Parcel cleared and delivered via priority dispatch within 24 hours of document receipt. Customer accepted apology and confirmed receipt.',
    recoveryMessage: {
      text: 'Dear Customer, we sincerely apologise for the delay with parcel JD019800123456. The delay was caused by a customs documentation issue which has been resolved. Your parcel has been dispatched on priority and will arrive within 24 hours.',
      language: 'en',
      status: 'auto_sent',
      generatedAt: daysAgo(20),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: daysAgo(18),
    },
    agentResults: {
      intake: { fields: { reporterEmail: { value: 'hasooni1098@gmail.com' } } },
      resolution: {
        sopCode: 'SOP-MY-LATE-003',
        steps: [
          'Trace parcel JD019800123456 through KLIA Cargo tracking system to identify hold point',
          'Contact customs clearance team to determine documentation gap',
          'Coordinate with sender/merchant to provide missing commercial invoice',
          'Once cleared, dispatch via priority delivery lane with same-day pickup',
          'Send proactive update to customer with revised ETA and apology',
        ],
      },
    },
    confidenceHistory: BASE_CONFIDENCE_HISTORY('late_delivery'),
  },
  {
    createdAt: daysAgo(12),
    title: 'Missing Parcel — Shah Alam — hasooni1098',
    description:
      'From: Hasan <hasooni1098@gmail.com>\nSubject: Parcel never arrived\n\nI am writing again because my parcel JD019800234567 from Shah Alam Hub has been marked as delivered but I never received it. This is the second time I am having issues with DHL. Very disappointed.',
    rawInput: 'Missing parcel complaint from hasooni1098@gmail.com. JD019800234567 marked delivered but not received. Second complaint. Shah Alam Hub.',
    type: 'missing_parcel',
    severity: 'High',
    status: 'RESOLVED',
    location: 'Shah Alam Hub',
    source: 'rpa',
    confidence: 0.88,
    holdForReview: false,
    department: 'Operations',
    customerEmail: 'hasooni1098@gmail.com',
    awbNumber: 'JD019800234567',
    detectedLanguage: 'en',
    sentimentScore: 0.18,
    sentimentLabel: 'very_frustrated',
    isRepeatCustomer: true,
    customerHistoryCount: 1,
    resolvedAt: daysAgo(10),
    resolutionNote: 'GPS delivery coordinates showed parcel left at wrong unit in same apartment block (Unit 12-3 instead of 12-8). Driver confirmed misdelivery. Parcel recovered from neighbour within 2 hours. Customer received parcel with personal apology call from hub supervisor. RM20 service credit applied.',
    recoveryMessage: {
      text: 'Dear Customer, we deeply apologise for the misdelivery of parcel JD019800234567. We have located your parcel and it will be redelivered to the correct address today. A RM20 service credit has been applied to your account as a gesture of goodwill.',
      language: 'en',
      status: 'auto_sent',
      generatedAt: daysAgo(11),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: daysAgo(9),
    },
    agentResults: {
      intake: { fields: { reporterEmail: { value: 'hasooni1098@gmail.com' } } },
      resolution: {
        sopCode: 'SOP-MY-MISS-002',
        steps: [
          'Verify GPS delivery coordinates against customer registered address',
          'Contact delivery driver to confirm drop-off location and obtain photo proof',
          'If misdelivery confirmed, dispatch recovery team to retrieve parcel from incorrect address',
          'Redeliver to correct address with signature requirement and photo confirmation',
          'Apply RM20 service credit and schedule personal follow-up call from hub supervisor',
        ],
      },
    },
    confidenceHistory: BASE_CONFIDENCE_HISTORY('missing_parcel'),
  },
  {
    createdAt: daysAgo(5),
    title: 'Damaged Parcel — Subang — hasooni1098',
    description:
      'From: Hasan <hasooni1098@gmail.com>\nSubject: DAMAGED parcel AGAIN\n\nI cannot believe this. My electronics order JD019800345678 arrived with the box completely crushed and the laptop screen cracked. This is my THIRD issue with DHL in one month. I am seriously considering filing a formal complaint with the consumer tribunal.',
    rawInput: 'Damaged parcel from hasooni1098@gmail.com. JD019800345678 crushed box, cracked laptop screen. Third complaint in a month. Extremely frustrated. Subang Hub.',
    type: 'damaged_parcel',
    severity: 'Critical',
    status: 'CLOSED',
    location: 'Subang Hub',
    source: 'rpa',
    confidence: 0.95,
    holdForReview: false,
    department: 'Operations',
    customerEmail: 'hasooni1098@gmail.com',
    awbNumber: 'JD019800345678',
    detectedLanguage: 'en',
    sentimentScore: 0.08,
    sentimentLabel: 'very_frustrated',
    isRepeatCustomer: true,
    customerHistoryCount: 2,
    resolvedAt: daysAgo(3),
    resolutionNote: 'Laptop screen cracked due to insufficient padding during sorting at Subang Hub. Full insurance claim processed (RM3,200). Replacement laptop arranged with merchant for expedited delivery. Hub ops flagged Subang sorting line for fragile item handling audit. Customer escalated to VIP support, received personal call from regional manager. RM50 voucher and priority handling flag applied to account.',
    recoveryMessage: {
      text: 'Dear Customer, we are deeply sorry about the damage to your laptop. We understand this is your third issue and we take this extremely seriously. A full insurance claim of RM3,200 has been processed and a replacement is being arranged. Our Regional Manager will contact you personally today.',
      language: 'en',
      status: 'approved',
      generatedAt: daysAgo(4),
    },
    followUp: {
      outcome: 'escalated',
      checkedAt: daysAgo(2),
    },
    agentResults: {
      intake: { fields: { reporterEmail: { value: 'hasooni1098@gmail.com' } } },
      resolution: {
        sopCode: 'SOP-MY-DAM-004',
        steps: [
          'Document damage with photographs and initiate insurance claim for full declared value (RM3,200)',
          'Contact merchant to arrange replacement shipment via expedited priority lane',
          'Escalate to Regional Manager for personal customer follow-up given repeat complaint history',
          'Flag Subang Hub sorting line for immediate fragile item handling audit',
          'Apply VIP priority handling flag and RM50 service voucher to customer account',
        ],
      },
    },
    confidenceHistory: BASE_CONFIDENCE_HISTORY('damaged_parcel'),
  },
];

// 2 BREACHED incidents
const breachedIncidents = [
  {
    createdAt: daysAgo(3),
    title: 'BREACHED SLA — Missing Parcel, High Value Electronics',
    description:
      'Parcel JD014600456901 containing RM12,000 laptop and accessories missing for 3 days. SLA breached. Customer has engaged legal counsel. Emergency escalation to Regional Manager.',
    rawInput:
      'High-value missing parcel JD014600456901 RM12000 electronics. SLA breached 3 days. Legal escalation.',
    type: 'missing_parcel',
    severity: 'Critical',
    status: 'BREACHED',
    location: 'Kuala Lumpur',
    source: 'manual',
    confidence: 0.95,
    holdForReview: false,
    department: 'Customer Service',
    agentResults: {},
  },
  {
    createdAt: daysAgo(3),
    title: 'BREACHED SLA — System Error Mass Delivery Failure',
    description:
      'System error caused mass tracking failure affecting 340 parcels across 5 hubs. SLA breached for 78 affected customers. IT team working on resolution. Director-level awareness required.',
    rawInput:
      'System error affecting 340 parcels across 5 hubs. 78 SLA breaches. Director escalation.',
    type: 'system_error',
    severity: 'Critical',
    status: 'BREACHED',
    location: 'Shah Alam Hub',
    source: 'manual',
    confidence: 0.97,
    holdForReview: false,
    department: 'Operations',
    agentResults: {},
  },
];

// 2 CLOSED incidents
const closedIncidents = [
  {
    createdAt: daysAgo(7),
    title: 'CLOSED — Late Delivery, Customer Satisfied',
    description:
      'Late delivery case for parcel JD014600567012 at Penang Hub. Root cause: vehicle breakdown. Customer compensated with voucher. Follow-up confirmed satisfaction. Case closed.',
    rawInput: 'Late delivery Penang Hub vehicle breakdown. Compensation issued. Closed.',
    type: 'late_delivery',
    severity: 'Low',
    status: 'CLOSED',
    location: 'Penang Hub',
    source: 'manual',
    confidence: 0.93,
    holdForReview: false,
    department: 'Operations',
    recoveryMessage: {
      text: 'Your case has been fully resolved. Thank you for your patience. A service voucher has been added to your account.',
      language: 'en',
      status: 'approved',
      generatedAt: daysAgo(6),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: daysAgo(5),
    },
    resolutionNote: 'Late delivery at Penang Hub caused by delivery van breakdown on route PEN-03. Van replaced within 2 hours but remaining 14 parcels on route delayed by half day. Customer compensated with RM15 voucher. Penang Hub fleet maintenance schedule reviewed and preventive maintenance interval shortened from monthly to bi-weekly.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-LATE-006',
        steps: [
          'Dispatch replacement van to complete route PEN-03 deliveries',
          'Notify all 14 affected customers of revised delivery window',
          'Apply service vouchers to affected customer accounts',
          'File fleet maintenance incident report for van breakdown',
          'Shorten Penang Hub preventive maintenance interval to bi-weekly',
        ],
      },
    },
  },
  {
    createdAt: daysAgo(6),
    title: 'CLOSED — Damaged Parcel, Replacement Delivered',
    description:
      'Damaged parcel case at Ipoh Hub fully resolved. Replacement item delivered within 48 hours as promised. Customer provided positive feedback and rated experience 5/5. Case closed.',
    rawInput: 'Damaged parcel Ipoh Hub. Replacement delivered 48h. Customer 5/5 rating. Closed.',
    type: 'damaged_parcel',
    severity: 'Medium',
    status: 'CLOSED',
    location: 'Ipoh Hub',
    source: 'rpa',
    confidence: 0.96,
    holdForReview: false,
    department: 'Customer Service',
    recoveryMessage: {
      text: 'Your replacement parcel has been delivered as promised. We appreciate your positive feedback and look forward to serving you again.',
      language: 'en',
      status: 'approved',
      generatedAt: daysAgo(5),
    },
    followUp: {
      outcome: 'satisfied',
      checkedAt: daysAgo(4),
    },
    resolutionNote: 'Damaged parcel at Ipoh Hub caused by improper stacking in delivery van. Heavy parcel placed on top of fragile item. Replacement item sourced from merchant and dispatched via express within 24 hours. Delivered 48 hours after complaint. Customer rated resolution 5/5. Van loading SOP updated to enforce weight-over-fragile separation.',
    agentResults: {
      resolution: {
        sopCode: 'SOP-MY-DAM-005',
        steps: [
          'Assess damage from customer photos and confirm improper stacking as root cause',
          'Arrange replacement item via merchant express dispatch within 24 hours',
          'Apply RM30 service credit and priority delivery flag',
          'Update van loading SOP to enforce weight-over-fragile separation rules',
          'Schedule loading crew refresher training at Ipoh Hub',
        ],
      },
    },
  },
];

// ─── FEEDBACK DATASET ENTRIES ────────────────────────────────────────────────

const makeWeekDate = (weeksAgo, dayOffset = 0) =>
  new Date(Date.now() - weeksAgo * 7 * 24 * 60 * 60 * 1000 + dayOffset * 24 * 60 * 60 * 1000);

const feedbackEntries = [
  // Week 4 — 6 entries, 3 overrides (50%)
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Parcel JD014600111001 arrived with crushed corner. Fragile label visible. Customer requesting replacement.',
    finalType: 'damaged_parcel',
    finalSeverity: 'High',
    finalDepartment: 'Customer Service',
    aiType: 'late_delivery', // override
    aiSeverity: 'Medium',
    aiConfidence: 0.72,
    reviewAction: 'approve',
    overrideOccurred: true,
    correctedFields: ['type', 'severity'],
    source: 'rpa',
    hitlFired: true,
    createdAt: makeWeekDate(4, 0),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Customer claims parcel JD014600111002 never arrived. Tracking shows delivered 3 days ago.',
    finalType: 'missing_parcel',
    finalSeverity: 'High',
    finalDepartment: 'Customer Service',
    aiType: 'late_delivery', // override
    aiSeverity: 'Low',
    aiConfidence: 0.71,
    reviewAction: 'approve',
    overrideOccurred: true,
    correctedFields: ['type', 'severity'],
    source: 'rpa',
    hitlFired: true,
    createdAt: makeWeekDate(4, 1),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Wrong item in parcel JD014600111003. Customer ordered phone case but received kitchen utensils.',
    finalType: 'wrong_item',
    finalSeverity: 'Medium',
    finalDepartment: 'Operations',
    aiType: 'address_error', // override
    aiSeverity: 'Medium',
    aiConfidence: 0.74,
    reviewAction: 'approve',
    overrideOccurred: true,
    correctedFields: ['type'],
    source: 'manual',
    hitlFired: true,
    createdAt: makeWeekDate(4, 2),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Parcel JD014600111004 delivered 2 days late. Customer in Ipoh missed event. Seeking compensation.',
    finalType: 'late_delivery',
    finalSeverity: 'Low',
    finalDepartment: 'Customer Service',
    aiType: 'late_delivery',
    aiSeverity: 'Low',
    aiConfidence: 0.85,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(4, 3),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Address label on parcel JD014600111005 partially torn. Hub re-labelled and delivered successfully.',
    finalType: 'address_error',
    finalSeverity: 'Low',
    finalDepartment: 'Logistics',
    aiType: 'address_error',
    aiSeverity: 'Low',
    aiConfidence: 0.88,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(4, 4),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Customer at Shah Alam complains delivery vehicle never arrived. Tracking not updated for JD014600111006.',
    finalType: 'late_delivery',
    finalSeverity: 'Medium',
    finalDepartment: 'Operations',
    aiType: 'late_delivery',
    aiSeverity: 'Medium',
    aiConfidence: 0.80,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(4, 5),
  },

  // Week 3 — 8 entries, 2 overrides (25%)
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Parcel JD014600222001 box completely collapsed on arrival. Electronic device inside shattered.',
    finalType: 'damaged_parcel',
    finalSeverity: 'High',
    finalDepartment: 'Customer Service',
    aiType: 'missing_parcel', // override
    aiSeverity: 'High',
    aiConfidence: 0.73,
    reviewAction: 'approve',
    overrideOccurred: true,
    correctedFields: ['type'],
    source: 'rpa',
    hitlFired: true,
    createdAt: makeWeekDate(3, 0),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Customer received package with broken seal and missing items. JD014600222002.',
    finalType: 'missing_parcel',
    finalSeverity: 'High',
    finalDepartment: 'Logistics',
    aiType: 'damaged_parcel', // override
    aiSeverity: 'Medium',
    aiConfidence: 0.76,
    reviewAction: 'approve',
    overrideOccurred: true,
    correctedFields: ['type', 'severity'],
    source: 'manual',
    hitlFired: true,
    createdAt: makeWeekDate(3, 1),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Parcel JD014600222003 delivered to wrong address in Penang. Customer at correct address did not receive.',
    finalType: 'address_error',
    finalSeverity: 'Medium',
    finalDepartment: 'Operations',
    aiType: 'address_error',
    aiSeverity: 'Medium',
    aiConfidence: 0.91,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(3, 2),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Late delivery JD014600222004. Package due Monday arrived Thursday. Customer dissatisfied.',
    finalType: 'late_delivery',
    finalSeverity: 'Low',
    finalDepartment: 'Customer Service',
    aiType: 'late_delivery',
    aiSeverity: 'Low',
    aiConfidence: 0.87,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(3, 3),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Wrong parcel JD014600222005 delivered. Customer received mens shoes, ordered womens bag.',
    finalType: 'wrong_item',
    finalSeverity: 'Medium',
    finalDepartment: 'Customer Service',
    aiType: 'wrong_item',
    aiSeverity: 'Medium',
    aiConfidence: 0.93,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(3, 4),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'System error causing tracking page to show incorrect status for JD014600222006.',
    finalType: 'system_error',
    finalSeverity: 'Low',
    finalDepartment: 'Operations',
    aiType: 'system_error',
    aiSeverity: 'Low',
    aiConfidence: 0.82,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(3, 5),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Customer at Johor Bahru confirms parcel JD014600222007 arrived but packaging was damaged.',
    finalType: 'damaged_parcel',
    finalSeverity: 'Low',
    finalDepartment: 'Customer Service',
    aiType: 'damaged_parcel',
    aiSeverity: 'Low',
    aiConfidence: 0.89,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(3, 6),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Parcel JD014600222008 missing from customer doorstep after delivery confirmation. Building no CCTV.',
    finalType: 'missing_parcel',
    finalSeverity: 'Medium',
    finalDepartment: 'Logistics',
    aiType: 'missing_parcel',
    aiSeverity: 'Medium',
    aiConfidence: 0.88,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(3, 6),
  },

  // Week 2 — 10 entries, 1 override (10%)
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Parcel JD014600333001 severely damaged. Television screen cracked. Customer requesting full replacement.',
    finalType: 'damaged_parcel',
    finalSeverity: 'High',
    finalDepartment: 'Customer Service',
    aiType: 'late_delivery', // override
    aiSeverity: 'Medium',
    aiConfidence: 0.78,
    reviewAction: 'approve',
    overrideOccurred: true,
    correctedFields: ['type', 'severity'],
    source: 'rpa',
    hitlFired: true,
    createdAt: makeWeekDate(2, 0),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'JD014600333002 delivered 1 day late. Explanation given as weather delay. Customer accepts.',
    finalType: 'late_delivery',
    finalSeverity: 'Low',
    finalDepartment: 'Logistics',
    aiType: 'late_delivery',
    aiSeverity: 'Low',
    aiConfidence: 0.92,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(2, 1),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Missing parcel JD014600333003 investigation complete. Parcel located in KLIA overflow bay.',
    finalType: 'missing_parcel',
    finalSeverity: 'Medium',
    finalDepartment: 'Logistics',
    aiType: 'missing_parcel',
    aiSeverity: 'Medium',
    aiConfidence: 0.90,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(2, 1),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Wrong item JD014600333004 delivered. Returned by customer. Correct item dispatched same day.',
    finalType: 'wrong_item',
    finalSeverity: 'Medium',
    finalDepartment: 'Operations',
    aiType: 'wrong_item',
    aiSeverity: 'Medium',
    aiConfidence: 0.94,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(2, 2),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Address error on parcel JD014600333005. Postcode wrong. Rerouted and delivered +1 day.',
    finalType: 'address_error',
    finalSeverity: 'Low',
    finalDepartment: 'Logistics',
    aiType: 'address_error',
    aiSeverity: 'Low',
    aiConfidence: 0.88,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(2, 2),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Damaged parcel JD014600333006 at Penang Hub. External dent on can goods. Minor issue. Partial refund issued.',
    finalType: 'damaged_parcel',
    finalSeverity: 'Low',
    finalDepartment: 'Customer Service',
    aiType: 'damaged_parcel',
    aiSeverity: 'Low',
    aiConfidence: 0.86,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(2, 3),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Late delivery JD014600333007 due to public holiday. Customer notified in advance. No complaint.',
    finalType: 'late_delivery',
    finalSeverity: 'Low',
    finalDepartment: 'Operations',
    aiType: 'late_delivery',
    aiSeverity: 'Low',
    aiConfidence: 0.95,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(2, 4),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'System maintenance caused brief tracking unavailability for JD014600333008. Resolved in 2 hours.',
    finalType: 'system_error',
    finalSeverity: 'Low',
    finalDepartment: 'Operations',
    aiType: 'system_error',
    aiSeverity: 'Low',
    aiConfidence: 0.91,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(2, 4),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Missing parcel JD014600333009 reported. Customer at Klang. Parcel found at alternative delivery point.',
    finalType: 'missing_parcel',
    finalSeverity: 'Low',
    finalDepartment: 'Logistics',
    aiType: 'missing_parcel',
    aiSeverity: 'Low',
    aiConfidence: 0.90,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(2, 5),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Customer in Shah Alam received correct parcel JD014600333010 but slightly delayed. Expressed appreciation for proactive SMS.',
    finalType: 'late_delivery',
    finalSeverity: 'Low',
    finalDepartment: 'Customer Service',
    aiType: 'late_delivery',
    aiSeverity: 'Low',
    aiConfidence: 0.93,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(2, 6),
  },

  // Week 1 (this week) — 12 entries, 0 overrides (0%)
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Parcel JD014600444001 late by 6 hours. Traffic congestion reason given. Customer satisfied.',
    finalType: 'late_delivery',
    finalSeverity: 'Low',
    finalDepartment: 'Operations',
    aiType: 'late_delivery',
    aiSeverity: 'Low',
    aiConfidence: 0.94,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(0, -6),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Damaged parcel JD014600444002. Corner dent on box. Contents intact. Customer informed no action needed.',
    finalType: 'damaged_parcel',
    finalSeverity: 'Low',
    finalDepartment: 'Customer Service',
    aiType: 'damaged_parcel',
    aiSeverity: 'Low',
    aiConfidence: 0.92,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(0, -6),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Missing parcel JD014600444003. Customer confirmed receipt after checking with family. False alarm.',
    finalType: 'missing_parcel',
    finalSeverity: 'Low',
    finalDepartment: 'Logistics',
    aiType: 'missing_parcel',
    aiSeverity: 'Low',
    aiConfidence: 0.88,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(0, -5),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Address error parcel JD014600444004. Customer changed address online. Rerouted successfully.',
    finalType: 'address_error',
    finalSeverity: 'Low',
    finalDepartment: 'Logistics',
    aiType: 'address_error',
    aiSeverity: 'Low',
    aiConfidence: 0.91,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(0, -5),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Wrong item JD014600444005 resolved by merchant with same-day replacement dispatch.',
    finalType: 'wrong_item',
    finalSeverity: 'Medium',
    finalDepartment: 'Customer Service',
    aiType: 'wrong_item',
    aiSeverity: 'Medium',
    aiConfidence: 0.95,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(0, -4),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Late delivery JD014600444006 at Ipoh. Route change due to road closure. Customer understanding.',
    finalType: 'late_delivery',
    finalSeverity: 'Low',
    finalDepartment: 'Operations',
    aiType: 'late_delivery',
    aiSeverity: 'Low',
    aiConfidence: 0.93,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(0, -4),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Damaged parcel JD014600444007 at Klang. Wet packaging from rain. Customer declined compensation.',
    finalType: 'damaged_parcel',
    finalSeverity: 'Low',
    finalDepartment: 'Customer Service',
    aiType: 'damaged_parcel',
    aiSeverity: 'Low',
    aiConfidence: 0.89,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(0, -3),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Missing parcel JD014600444008. Found at pickup point. Customer not notified by SMS. Process gap identified.',
    finalType: 'missing_parcel',
    finalSeverity: 'Medium',
    finalDepartment: 'Operations',
    aiType: 'missing_parcel',
    aiSeverity: 'Medium',
    aiConfidence: 0.87,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(0, -3),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Late delivery JD014600444009 resolved. Parcel held for customs for 1 day extra. Expedited after call.',
    finalType: 'late_delivery',
    finalSeverity: 'Low',
    finalDepartment: 'Logistics',
    aiType: 'late_delivery',
    aiSeverity: 'Low',
    aiConfidence: 0.94,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(0, -2),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'System error JD014600444010 tracking glitch resolved. Mobile app showed wrong status. Backend fix applied.',
    finalType: 'system_error',
    finalSeverity: 'Low',
    finalDepartment: 'Operations',
    aiType: 'system_error',
    aiSeverity: 'Low',
    aiConfidence: 0.90,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(0, -2),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Address correction for JD014600444011 handled smoothly. Customer updated address via app. Delivered same day.',
    finalType: 'address_error',
    finalSeverity: 'Low',
    finalDepartment: 'Logistics',
    aiType: 'address_error',
    aiSeverity: 'Low',
    aiConfidence: 0.92,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'manual',
    hitlFired: false,
    createdAt: makeWeekDate(0, -1),
  },
  {
    incidentId: new mongoose.Types.ObjectId(),
    incidentText: 'Wrong item case JD014600444012. Merchant acknowledged pick-pack error. Replacement dispatched next-day.',
    finalType: 'wrong_item',
    finalSeverity: 'Low',
    finalDepartment: 'Customer Service',
    aiType: 'wrong_item',
    aiSeverity: 'Low',
    aiConfidence: 0.95,
    reviewAction: 'approve',
    overrideOccurred: false,
    correctedFields: [],
    source: 'rpa',
    hitlFired: false,
    createdAt: makeWeekDate(0, -1),
  },
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear seeded collections
  await Promise.all([
    Incident.deleteMany({}),
    RpaRun.deleteMany({}),
    SopDraft.deleteMany({}),
    ProactiveSend.deleteMany({}),
    FeedbackDatasetEntry.deleteMany({}),
    OutboundEmail.deleteMany({}),
    CascadeEvent.deleteMany({}),
    AuditLog.deleteMany({}),
    TrainingCandidate.deleteMany({}),
    CustomerProfile.deleteMany({}),
  ]);
  console.log('Cleared collections');

  // ── Incidents ──────────────────────────────────────────────────────────────
  const allIncidents = [
    ...clusterIncidents,
    ...kliaClusterIncidents,
    ...draftIncidents,
    ...pendingIncidents,
    ...underReviewIncidents,
    ...assignedIncidents,
    ...inProgressIncidents,
    ...resolvedIncidents,
    ...breachedIncidents,
    ...closedIncidents,
  ];

  // Use insertMany with timestamps option so we can set createdAt manually
  const insertedIncidents = await Incident.insertMany(allIncidents, { timestamps: false });
  console.log(`Incidents inserted: ${insertedIncidents.length}`);

  // ── Outbound Emails — approved recovery messages queued for UiPath ─────────
  // cluster incidents are the first 4 in insertedIncidents
  const clusterIds = insertedIncidents.slice(0, 4).map((inc) => inc._id);
  const customerEmails = [
    'sarah.lim@gmail.com',
    'ahmad.rashid@yahoo.com',
    'priya.nair@hotmail.com',
    'wei.chen@gmail.com',
  ];
  const outboundEmailSeeds = clusterIds.map((incidentId, i) => ({
    incidentId,
    toEmail: customerEmails[i],
    subject: 'DHL — Recovery Confirmation for Your Damaged Parcel',
    body: 'Dear customer, we sincerely apologise for the damage to your parcel. A full replacement has been arranged and will be delivered within 2 business days.',
    language: 'en',
    status: i < 2 ? 'sent' : i === 2 ? 'sent' : 'queued',
    sentAt: i < 3 ? hoursAgo(4.5 - i * 0.5) : null,
    approvedBy: 'admin@dhl.com',
  }));
  // Last email is queued (pending RPA pickup) — shows the live queue in action
  outboundEmailSeeds[3].status = 'queued';
  outboundEmailSeeds[3].sentAt = null;

  const insertedOutbound = await OutboundEmail.insertMany(outboundEmailSeeds);
  console.log(`Outbound Emails inserted: ${insertedOutbound.length}`);

  // ── RPA Run ────────────────────────────────────────────────────────────────
  const insertedRpaRuns = await RpaRun.insertMany([
    {
      runId: `RPA-${Date.now()}`,
      status: 'completed',
      processedCount: 3,
      errors: [],
      startedAt: hoursAgo(3),
      completedAt: hoursAgo(2.5),
      source: 'uipath',
      totalFiles: 3,
      duplicates: 0,
      failed: 0,
      narrative:
        'UiPath bot processed 3 complaint emails from the Shah Alam Hub cluster window. All 3 were classified as damaged_parcel with confidence above 0.90. Cluster group shah-alam-damaged-cluster-001 was automatically detected. No duplicates found. Pipeline completed in 3.2 minutes.',
    },
  ]);
  console.log(`RPA Runs inserted: ${insertedRpaRuns.length}`);

  // ── SOP Draft ──────────────────────────────────────────────────────────────
  const insertedSopDrafts = await SopDraft.insertMany([
    {
      incidentType: 'damaged_parcel',
      location: 'Shah Alam Hub',
      clusterId: 'shah-alam-damaged-cluster-001',
      status: 'approved',
      generatedContent: {
        title: 'Shah Alam Hub — Damaged Parcel Cluster Protocol',
        whenToApply:
          'Apply when 3 or more damaged_parcel incidents are detected originating from the same hub within a 4-hour window. This SOP supersedes the standard individual complaint procedure.',
        rootCause:
          'Cluster analysis of 4 incidents on 16 April 2026 indicates mechanical stress from Conveyor Line 3 during the 06:00–10:00 morning shift. Packaging compression at the sorting junction is the probable point of failure based on damage pattern consistency (top-face and corner impact across all 4 parcels).',
        recommendedAction:
          '1. Immediately suspend fragile/oversized items on Conveyor Line 3 and 4.\n2. Dispatch maintenance team to inspect sorting junction bearings and belt tension.\n3. Trigger PCC Playbook SHA-DAMAGE-CLUSTER for all inbound customer contacts.\n4. Send proactive email to all customers with parcels processed at this hub in the affected window.\n5. Document findings in the Hub Maintenance Log within 2 hours.\n6. Notify Operations Centre and Regional Manager if cluster count exceeds 6.',
        expectedOutcome:
          '95% of affected customers contacted proactively within 4 hours. Customer satisfaction maintained above 90% through pre-emptive outreach. Conveyor defect identified and rectified within same business day. Zero repeat cluster incidents within 7 days.',
        estimatedResolutionTime:
          '4 hours for customer communications, 8 hours for full mechanical resolution',
        evidenceCount: 4,
      },
      evidenceIds: [],
      generatedAt: hoursAgo(20),
      reviewedAt: hoursAgo(18),
      reviewedBy: 'admin@dhl.com',
      publishedSopCode: 'AI-DAM-SHA-X7K2',
    },
  ]);
  console.log(`SOP Drafts inserted: ${insertedSopDrafts.length}`);

  // ── Proactive Send ─────────────────────────────────────────────────────────
  const insertedProactiveSends = await ProactiveSend.insertMany([
    {
      incidentType: 'damaged_parcel',
      location: 'Shah Alam Hub',
      clusterId: 'shah-alam-damaged-cluster-001',
      documents: {
        hubNotice: `URGENT OPERATIONAL NOTICE — Shah Alam Hub\nDate: 16 April 2026\nRe: Damaged Parcel Cluster — Immediate Action Required\n\nDear Hub Operations Team,\n\nNEXUS has detected an abnormal cluster of 4 damaged parcel incidents originating from Shah Alam Hub between 08:10 and 09:47 this morning. This represents a 3.2× deviation from the daily baseline.\n\nImmediate actions required:\n1. Inspect Conveyor Line 3 and Line 4 for mechanical irregularities\n2. Review morning shift loading bay procedures (06:00–09:00 window)\n3. Suspend oversized fragile items on affected lines pending inspection\n4. Document any equipment anomalies in the maintenance log\n\nAll findings must be reported to the Operations Centre by 14:00 today.\n\nThis notice was auto-generated by NEXUS Pattern Detection. Reference: CLUSTER-SHA-20260416-001`,
        customerEmail: `Subject: Important Update on Your DHL Delivery — Proactive Service Notice\n\nDear Valued Customer,\n\nWe are reaching out proactively regarding a delivery that may have been affected by a packaging irregularity at our Shah Alam processing facility on 16 April 2026.\n\nWe have identified a cluster of incidents at this facility and want to ensure your experience is not impacted. Our team is:\n• Conducting an immediate inspection of affected packages\n• Expediting re-delivery where damage is confirmed\n• Offering a full refund or replacement at your preference\n\nYou do not need to take any action. A DHL Customer Experience representative will contact you within 4 business hours.\n\nWe sincerely apologise for any inconvenience and appreciate your patience.\n\nBest regards,\nDHL APSSC Customer Experience Team\nReference: PRO-SHA-20260416`,
        faqUpdate: `FAQ UPDATE — Shah Alam Hub Incident (16 April 2026)\n\nQ: Why did my parcel arrive damaged?\nA: A processing irregularity was identified at our Shah Alam Hub on the morning of 16 April. Our operations team has conducted an immediate inspection and corrective actions are underway.\n\nQ: What compensation am I entitled to?\nA: Affected customers are eligible for a full replacement or refund. No claim form is required — our team will proactively process your resolution.\n\nQ: How long will re-delivery take?\nA: Re-deliveries are being prioritised and will be completed within 2 business days.\n\nQ: Has the issue been fixed?\nA: Yes. The root cause has been identified and resolved. All subsequent shipments from Shah Alam Hub are operating normally.\n\nQ: Who can I contact for updates?\nA: Call DHL Customer Service at 1800-888-388 and quote reference CLUSTER-SHA-20260416-001.`,
        pccPlaybook: `PCC RESPONSE PLAYBOOK — Damaged Parcel Cluster\nCluster Reference: SHA-20260416-001\n\nOPERATOR SCRIPT:\n"Thank you for calling DHL. I can see you may be affected by a service disruption at our Shah Alam facility. I am raising this as a priority case right now."\n\nSTEP 1 — VERIFY: Confirm customer's tracking number begins with JD or confirm Shah Alam as origin hub.\n\nSTEP 2 — EMPATHISE: "I completely understand your frustration. This is not the standard of service DHL stands for."\n\nSTEP 3 — RESOLVE: Offer immediate replacement or refund. No escalation required for claims under RM500.\n\nSTEP 4 — COMPENSATE: Apply service credit code SHAHUB16APR to customer account (RM15 voucher).\n\nSTEP 5 — DOCUMENT: Log under incident type CLUSTER-DAMAGE, reference SHA-20260416-001.\n\nEXCEPTION: If customer claims value >RM2,000, escalate to Senior PCC Executive immediately.\n\nTARGET HANDLE TIME: 4 minutes\nCUSTOMER SATISFACTION TARGET: 95%`,
      },
      status: 'sent',
      sentDocuments: ['hubNotice', 'customerEmail', 'faqUpdate', 'pccPlaybook'],
      sentAt: hoursAgo(22),
      sentBy: 'admin@dhl.com',
      estimatedComplaintsPrevented: 5,
      customerEmailsContacted: [
        'sarah.lim@gmail.com',
        'ahmad.rashid@yahoo.com',
        'priya.nair@hotmail.com',
        'wei.chen@gmail.com',
        'farah.hassan@proton.me',
        'raj.kumar@gmail.com',
      ],
      generatedAt: hoursAgo(24),
    },
  ]);
  console.log(`Proactive Sends inserted: ${insertedProactiveSends.length}`);

  // ── Feedback Dataset Entries ───────────────────────────────────────────────
  // insertMany with lean objects including createdAt
  const insertedFeedback = await FeedbackDatasetEntry.insertMany(feedbackEntries, {
    timestamps: false,
  });
  console.log(`Feedback Dataset Entries inserted: ${insertedFeedback.length}`);

  // ── Cascade Event History ─────────────────────────────────────────────────
  const insertedCascade = await CascadeEvent.insertMany([
    {
      eventType: 'prediction',
      sourceHub: 'Shah Alam Hub',
      incidentType: 'damaged_parcel',
      clusterCount: 4,
      overallCascadeScore: 0.99,
      recommendation: 'Alert Subang Jaya Depot ops team — expect elevated damaged parcel volume by 11:30 MYT (risk level: HIGH).',
      downstream: [
        { hub: 'Subang Jaya Depot', riskLevel: 'high', baseRisk: 0.99, delayHours: 1.5, estimatedImpactTime: hoursAgo(4) },
        { hub: 'KLIA Cargo', riskLevel: 'high', baseRisk: 0.99, delayHours: 2.0, estimatedImpactTime: hoursAgo(3.5) },
      ],
      createdAt: hoursAgo(5.5),
    },
    {
      eventType: 'alert',
      sourceHub: 'Shah Alam Hub',
      incidentType: 'damaged_parcel',
      clusterCount: 4,
      overallCascadeScore: 0.99,
      alertId: 'CASCADE-SHA-20260501-001',
      triggeredBy: 'admin@dhl.com',
      recommendation: 'Alert Subang Jaya Depot ops team — expect elevated damaged parcel volume.',
      downstream: [
        { hub: 'Subang Jaya Depot', riskLevel: 'high', baseRisk: 0.99, delayHours: 1.5, estimatedImpactTime: hoursAgo(4) },
        { hub: 'KLIA Cargo', riskLevel: 'high', baseRisk: 0.99, delayHours: 2.0, estimatedImpactTime: hoursAgo(3.5) },
      ],
      resolved: true,
      resolvedAt: hoursAgo(3),
      createdAt: hoursAgo(5),
    },
    {
      eventType: 'prediction',
      sourceHub: 'KLIA Cargo',
      incidentType: 'late_delivery',
      clusterCount: 3,
      overallCascadeScore: 0.7,
      recommendation: 'Alert Shah Alam Hub ops team — expect elevated late delivery volume by 14:00 MYT (risk level: MEDIUM).',
      downstream: [
        { hub: 'Shah Alam Hub', riskLevel: 'medium', baseRisk: 0.7, delayHours: 1.0, estimatedImpactTime: hoursAgo(1.5) },
        { hub: 'Subang Jaya Depot', riskLevel: 'medium', baseRisk: 0.5, delayHours: 2.5, estimatedImpactTime: hoursAgo(0) },
        { hub: 'Penang Hub', riskLevel: 'low', baseRisk: 0.3, delayHours: 4.0, estimatedImpactTime: new Date(Date.now() + 2 * 60 * 60 * 1000) },
        { hub: 'JB Distribution', riskLevel: 'low', baseRisk: 0.3, delayHours: 4.0, estimatedImpactTime: new Date(Date.now() + 2 * 60 * 60 * 1000) },
      ],
      createdAt: hoursAgo(2.8),
    },
    {
      eventType: 'prediction',
      sourceHub: 'Penang Hub',
      incidentType: 'address_error',
      clusterCount: 3,
      overallCascadeScore: 0.4,
      recommendation: 'Monitor downstream hubs for elevated incident volume.',
      downstream: [
        { hub: 'KLIA Cargo', riskLevel: 'medium', baseRisk: 0.4, delayHours: 3.5, estimatedImpactTime: daysAgo(2) },
      ],
      resolved: true,
      resolvedAt: daysAgo(2),
      createdAt: daysAgo(3),
    },
  ]);
  console.log(`Cascade Events inserted: ${insertedCascade.length}`);

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  // Seed realistic audit trail for the first 10 incidents so Audit Trail tab
  // shows a meaningful history when judges click on any resolved incident.
  const auditSeeds = [];
  const ACTORS = ['rpa-service@dhl.com', 'intake.agent', 'classifier.agent', 'resolution.agent', 'reviewer@dhl.com'];
  insertedIncidents.slice(0, 10).forEach((inc, idx) => {
    const base = inc.createdAt ? new Date(inc.createdAt).getTime() : Date.now() - (10 - idx) * 5 * 3600000;
    auditSeeds.push(
      { incidentId: inc._id, actor: 'rpa-service@dhl.com', actorType: 'system',  action: 'incident_created',     timestamp: new Date(base) },
      { incidentId: inc._id, actor: 'Intake Agent',        actorType: 'agent',   action: 'intake_completed',     field: 'title',     confidence: 0.88, timestamp: new Date(base + 8 * 60000) },
      { incidentId: inc._id, actor: 'Dedup Agent',         actorType: 'agent',   action: 'dedup_checked',        field: 'isDuplicate', newValue: false,  confidence: 0.95, timestamp: new Date(base + 12 * 60000) },
      { incidentId: inc._id, actor: 'Classifier Agent',    actorType: 'agent',   action: 'classified',           field: 'type',      oldValue: null, newValue: inc.type, confidence: inc.confidence || 0.87, timestamp: new Date(base + 18 * 60000) },
      { incidentId: inc._id, actor: 'Resolution Agent',    actorType: 'agent',   action: 'resolution_suggestion',field: 'recoveryMessage', confidence: 0.91, timestamp: new Date(base + 26 * 60000) },
      { incidentId: inc._id, actor: 'reviewer@dhl.com',    actorType: 'human',   action: 'status_changed',       field: 'status',    oldValue: 'PENDING_REVIEW', newValue: inc.status || 'RESOLVED', timestamp: new Date(base + 44 * 60000) },
    );
  });
  const insertedAuditLogs = await AuditLog.insertMany(auditSeeds, { timestamps: false });
  console.log(`Audit Logs inserted: ${insertedAuditLogs.length}`);

  // ── Training Candidates ────────────────────────────────────────────────────
  // Seed 8 candidates so the "Batch Train" button is enabled and the training
  // queue looks active in the Resolution Intelligence Archive.
  const trainingSeeds = insertedIncidents.slice(7, 15).map((inc) => ({
    incidentId: inc._id,
    field:      'type',
    aiValue:    inc.type,
    humanValue: inc.type,
    timestamp:  inc.createdAt || new Date(),
  }));
  const insertedCandidates = await TrainingCandidate.insertMany(trainingSeeds, { timestamps: false });
  console.log(`Training Candidates inserted: ${insertedCandidates.length}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n=== SEED COMPLETE ===');
  console.log(`Incidents:              ${insertedIncidents.length}`);
  console.log(`  - Cluster (RESOLVED): 7 (4 Shah Alam + 3 KLIA)`);
  console.log(`  - DRAFT:              ${draftIncidents.length}`);
  console.log(`  - PENDING_REVIEW:     ${pendingIncidents.length}`);
  console.log(`  - UNDER_REVIEW:       ${underReviewIncidents.length}`);
  console.log(`  - ASSIGNED:           ${assignedIncidents.length}`);
  console.log(`  - IN_PROGRESS:        ${inProgressIncidents.length}`);
  console.log(`  - RESOLVED (other):   ${resolvedIncidents.length}`);
  console.log(`  - BREACHED:           ${breachedIncidents.length}`);
  console.log(`  - CLOSED:             ${closedIncidents.length}`);
  console.log(`RPA Runs:               ${insertedRpaRuns.length}`);
  console.log(`SOP Drafts:             ${insertedSopDrafts.length}`);
  console.log(`Proactive Sends:        ${insertedProactiveSends.length}`);
  console.log(`Outbound Emails:        ${insertedOutbound.length} (3 sent, 1 queued)`);
  console.log(`Cascade Events:         ${insertedCascade.length}`);
  console.log(`Feedback Entries:       ${insertedFeedback.length}`);
  console.log(`Audit Logs:             ${insertedAuditLogs.length} (6 events × 10 incidents)`);
  console.log(`Training Candidates:    ${insertedCandidates.length}`);
  console.log(`  - Week 4 (3 overrides / 6 = 50%)`);
  console.log(`  - Week 3 (2 overrides / 8 = 25%)`);
  console.log(`  - Week 2 (1 override  / 10 = 10%)`);
  console.log(`  - Week 1 (0 overrides / 12 = 0%)`);

  // ── Customer Profiles (per-customer KB) ────────────────────────────────────
  const customerProfileSeeds = [
    {
      email: 'sarah.lim@gmail.com',
      name: 'Sarah Lim',
      preferredLanguage: 'en',
      sentimentHistory: [
        { score: 0.35, label: 'frustrated', source: 'rpa', recordedAt: daysAgo(14) },
        { score: 0.22, label: 'very_frustrated', source: 'rpa', recordedAt: daysAgo(7) },
        { score: 0.18, label: 'very_frustrated', source: 'chat', recordedAt: daysAgo(6) },
        { score: 0.55, label: 'neutral', source: 'system', recordedAt: daysAgo(2) },
      ],
      cases: [
        { type: 'late_delivery', severity: 'Medium', outcome: 'satisfied', resolvedAt: daysAgo(12) },
        { type: 'damaged_parcel', severity: 'High', outcome: 'escalated', resolvedAt: daysAgo(5) },
        { type: 'damaged_parcel', severity: 'High', outcome: 'pending' },
      ],
      averageSentiment: 0.33,
      frustrationTrend: 'worsening',
      tags: ['repeat', 'high-risk'],
      totalCases: 3,
      totalEscalations: 1,
      totalSatisfied: 1,
      chatBehavior: { averageResponseTone: 0.28, escalationCount: 1, totalMessages: 7 },
      lastSeenAt: daysAgo(1),
      firstSeenAt: daysAgo(14),
    },
    {
      email: 'ahmad.rashid@yahoo.com',
      name: 'Ahmad Rashid',
      preferredLanguage: 'ms',
      sentimentHistory: [
        { score: 0.42, label: 'neutral', source: 'rpa', recordedAt: daysAgo(10) },
        { score: 0.38, label: 'frustrated', source: 'rpa', recordedAt: daysAgo(3) },
      ],
      cases: [
        { type: 'missing_parcel', severity: 'High', outcome: 'satisfied', resolvedAt: daysAgo(8) },
        { type: 'damaged_parcel', severity: 'Medium', outcome: 'pending' },
      ],
      averageSentiment: 0.40,
      frustrationTrend: 'worsening',
      tags: ['repeat'],
      totalCases: 2,
      totalEscalations: 0,
      totalSatisfied: 1,
      chatBehavior: { averageResponseTone: 0.45, escalationCount: 0, totalMessages: 3 },
      lastSeenAt: daysAgo(2),
      firstSeenAt: daysAgo(10),
    },
    {
      email: 'priya.nair@hotmail.com',
      name: 'Priya Nair',
      preferredLanguage: 'en',
      sentimentHistory: [
        { score: 0.72, label: 'positive', source: 'rpa', recordedAt: daysAgo(20) },
        { score: 0.65, label: 'neutral', source: 'system', recordedAt: daysAgo(5) },
      ],
      cases: [
        { type: 'address_error', severity: 'Low', outcome: 'satisfied', resolvedAt: daysAgo(18) },
        { type: 'damaged_parcel', severity: 'Medium', outcome: 'satisfied', resolvedAt: daysAgo(3) },
      ],
      averageSentiment: 0.69,
      frustrationTrend: 'stable',
      tags: ['repeat', 'loyal'],
      totalCases: 2,
      totalEscalations: 0,
      totalSatisfied: 2,
      chatBehavior: { averageResponseTone: 0.70, escalationCount: 0, totalMessages: 4 },
      lastSeenAt: daysAgo(3),
      firstSeenAt: daysAgo(20),
    },
    {
      email: 'wei.chen@gmail.com',
      name: 'Wei Chen',
      preferredLanguage: 'en',
      sentimentHistory: [
        { score: 0.50, label: 'neutral', source: 'rpa', recordedAt: daysAgo(2) },
      ],
      cases: [
        { type: 'damaged_parcel', severity: 'High', outcome: 'pending' },
      ],
      averageSentiment: 0.50,
      frustrationTrend: 'stable',
      tags: [],
      totalCases: 1,
      totalEscalations: 0,
      totalSatisfied: 0,
      chatBehavior: { averageResponseTone: 0.5, escalationCount: 0, totalMessages: 0 },
      lastSeenAt: daysAgo(1),
      firstSeenAt: daysAgo(2),
    },
    {
      email: 'farah.hassan@proton.me',
      name: 'Farah Hassan',
      preferredLanguage: 'ms',
      sentimentHistory: [
        { score: 0.15, label: 'very_frustrated', source: 'rpa', recordedAt: daysAgo(8) },
        { score: 0.12, label: 'very_frustrated', source: 'chat', recordedAt: daysAgo(7) },
        { score: 0.10, label: 'very_frustrated', source: 'chat', recordedAt: daysAgo(7) },
        { score: 0.30, label: 'frustrated', source: 'system', recordedAt: daysAgo(4) },
      ],
      cases: [
        { type: 'missing_parcel', severity: 'Critical', outcome: 'escalated', resolvedAt: daysAgo(5) },
        { type: 'late_delivery', severity: 'High', outcome: 'satisfied', resolvedAt: daysAgo(3) },
      ],
      averageSentiment: 0.17,
      frustrationTrend: 'improving',
      tags: ['repeat', 'high-risk', 'escalation-prone'],
      totalCases: 2,
      totalEscalations: 2,
      totalSatisfied: 1,
      chatBehavior: { averageResponseTone: 0.15, escalationCount: 2, totalMessages: 12 },
      lastSeenAt: daysAgo(3),
      firstSeenAt: daysAgo(8),
    },
    {
      email: 'hasooni1098@gmail.com',
      name: 'Hasan',
      preferredLanguage: 'en',
      sentimentHistory: [
        { score: 0.25, label: 'frustrated', source: 'rpa', recordedAt: daysAgo(21) },
        { score: 0.55, label: 'neutral', source: 'system', recordedAt: daysAgo(19) },
        { score: 0.18, label: 'very_frustrated', source: 'rpa', recordedAt: daysAgo(12) },
        { score: 0.40, label: 'neutral', source: 'chat', recordedAt: daysAgo(11) },
        { score: 0.08, label: 'very_frustrated', source: 'rpa', recordedAt: daysAgo(5) },
        { score: 0.10, label: 'very_frustrated', source: 'chat', recordedAt: daysAgo(4) },
        { score: 0.15, label: 'very_frustrated', source: 'chat', recordedAt: daysAgo(4) },
      ],
      cases: [
        { type: 'late_delivery', severity: 'High', outcome: 'satisfied', resolvedAt: daysAgo(19) },
        { type: 'missing_parcel', severity: 'High', outcome: 'satisfied', resolvedAt: daysAgo(10) },
        { type: 'damaged_parcel', severity: 'Critical', outcome: 'escalated', resolvedAt: daysAgo(3) },
      ],
      averageSentiment: 0.24,
      frustrationTrend: 'worsening',
      tags: ['repeat', 'high-risk', 'escalation-prone'],
      totalCases: 3,
      totalEscalations: 1,
      totalSatisfied: 2,
      chatBehavior: { averageResponseTone: 0.22, escalationCount: 1, totalMessages: 9 },
      lastSeenAt: daysAgo(3),
      firstSeenAt: daysAgo(21),
    },
    {
      email: 'raj.kumar@gmail.com',
      name: 'Raj Kumar',
      preferredLanguage: 'en',
      sentimentHistory: [
        { score: 0.80, label: 'positive', source: 'rpa', recordedAt: daysAgo(30) },
        { score: 0.75, label: 'positive', source: 'system', recordedAt: daysAgo(15) },
        { score: 0.68, label: 'neutral', source: 'rpa', recordedAt: daysAgo(5) },
      ],
      cases: [
        { type: 'late_delivery', severity: 'Low', outcome: 'satisfied', resolvedAt: daysAgo(28) },
        { type: 'system_error', severity: 'Medium', outcome: 'satisfied', resolvedAt: daysAgo(13) },
        { type: 'wrong_item', severity: 'Medium', outcome: 'satisfied', resolvedAt: daysAgo(3) },
      ],
      averageSentiment: 0.74,
      frustrationTrend: 'stable',
      tags: ['repeat', 'loyal'],
      totalCases: 3,
      totalEscalations: 0,
      totalSatisfied: 3,
      chatBehavior: { averageResponseTone: 0.72, escalationCount: 0, totalMessages: 5 },
      lastSeenAt: daysAgo(3),
      firstSeenAt: daysAgo(30),
    },
  ];

  const insertedProfiles = await CustomerProfile.insertMany(customerProfileSeeds);
  console.log(`Customer Profiles inserted: ${insertedProfiles.length}`);

  await mongoose.disconnect();
  console.log('\nDisconnected. Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
