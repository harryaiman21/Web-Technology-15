// backend/src/routes/resolutions.routes.js
import { Router } from 'express';
import Incident from '../models/Incident.model.js';
import TrainingCandidate from '../models/TrainingCandidate.model.js';
import SopLibrary from '../models/SopLibrary.model.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { triggerRetrain } from '../services/retraining.service.js';
import { embed, getModelInfo } from '../services/fastapi.service.js';

const router = Router();

const HUBS = ['Shah Alam Hub', 'KLIA Cargo', 'Subang Jaya Depot', 'Penang Hub', 'JB Distribution'];

function getHub(incident) {
  return (
    incident.location ||
    incident.agentResults?.intake?.fields?.location?.value ||
    incident.agentResults?.request?.location ||
    null
  );
}

function computeResolvedBy(incident) {
  if (
    incident.source === 'rpa' &&
    !incident.holdForReview &&
    (incident.confidence || 0) >= 0.75
  ) return 'bot';
  return 'human';
}

// ── GET /api/v1/resolutions/stats ────────────────────────────────────────────
router.get('/stats', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  try {
    const incidents = await Incident.find({ status: { $nin: ['DRAFT'] } })
      .select('source confidence holdForReview followUp status severity type location agentResults createdAt updatedAt')
      .lean();

    const total      = incidents.length;
    const botCount   = incidents.filter(i => computeResolvedBy(i) === 'bot').length;
    const humanCount = total - botCount;
    const resolvedCount = incidents.filter(i => ['RESOLVED','CLOSED'].includes(i.status)).length;
    const avgConf    = total > 0
      ? Math.round((incidents.reduce((s, i) => s + (i.confidence || 0), 0) / total) * 100)
      : 0;
    const satisfiedCount = incidents.filter(i => i.followUp?.outcome === 'satisfied').length;
    const queueCount     = await TrainingCandidate.countDocuments();
    const hubBreakdown   = {};
    for (const i of incidents) {
      const h = getHub(i) || 'Unknown';
      hubBreakdown[h] = (hubBreakdown[h] || 0) + 1;
    }
    return res.json({ total, botCount, humanCount, resolvedCount, avgConf, satisfiedCount, queueCount, hubBreakdown });
  } catch (err) {
    console.error('[GET /resolutions/stats]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/resolutions/model-info ───────────────────────────────────────
router.get('/model-info', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  try {
    const info = await getModelInfo();
    return res.json(info);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/resolutions/sop-proposals ────────────────────────────────────
router.get('/sop-proposals', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  try {
    const pipeline = [
      {
        $match: {
          status:    { $in: ['RESOLVED', 'CLOSED'] },
          confidence: { $gte: 0.80 },
          type:      { $ne: null },
        },
      },
      {
        $group: {
          _id:           '$type',
          count:         { $sum: 1 },
          avgConfidence: { $avg: '$confidence' },
          satisfiedCount: {
            $sum: { $cond: [{ $eq: ['$followUp.outcome', 'satisfied'] }, 1, 0] },
          },
          latestAt: { $max: '$updatedAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ];

    const groups       = await Incident.aggregate(pipeline);
    const existingSops = await SopLibrary.find().lean();
    const sopByType    = Object.fromEntries(existingSops.map(s => [s.incidentType, s]));

    const proposals = groups.map(g => ({
      incidentType:  g._id,
      sampleCount:   g.count,
      avgConfidence: Math.round(g.avgConfidence * 100),
      satisfiedCount: g.satisfiedCount,
      existingSop:   sopByType[g._id] || null,
      action:        sopByType[g._id] ? 'update' : 'create',
      suggestion:    sopByType[g._id]
        ? `${g.count} resolutions back this SOP — consider refreshing steps in ${sopByType[g._id].code}`
        : `${g.count} high-confidence resolutions with no SOP — recommend creating one`,
      latestAt: g.latestAt,
    }));

    return res.json({ proposals });
  } catch (err) {
    console.error('[GET /resolutions/sop-proposals]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/v1/resolutions ───────────────────────────────────────────────────
router.get('/', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  try {
    const {
      hub, severity, resolvedBy: rbFilter,
      dateFrom, dateTo, search,
      page = 1, limit = 15,
    } = req.query;

    const query = { status: { $nin: ['DRAFT'] } };
    if (severity) query.severity = severity;
    if (dateFrom || dateTo) {
      query.updatedAt = {};
      if (dateFrom) query.updatedAt.$gte = new Date(dateFrom);
      if (dateTo)   query.updatedAt.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }
    if (search) {
      query.$or = [
        { title:       { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { type:        { $regex: search, $options: 'i' } },
      ];
    }

    let incidents = await Incident.find(query)
      .sort({ updatedAt: -1 })
      .limit(500) // cap for JS-side filtering
      .select('title description type severity status source confidence holdForReview followUp recoveryMessage location agentResults tags createdAt updatedAt')
      .lean();

    if (hub) {
      incidents = incidents.filter(i => {
        const h = getHub(i) || '';
        return h.toLowerCase().includes(hub.toLowerCase());
      });
    }
    if (rbFilter === 'bot')   incidents = incidents.filter(i => computeResolvedBy(i) === 'bot');
    if (rbFilter === 'human') incidents = incidents.filter(i => computeResolvedBy(i) === 'human');

    const incidentIds      = incidents.map(i => i._id);
    const existingCandidates = await TrainingCandidate.find({ incidentId: { $in: incidentIds } })
      .select('incidentId').lean();
    const queuedSet = new Set(existingCandidates.map(c => c.incidentId.toString()));

    const enriched = incidents.map(i => ({
      ...i,
      resolvedBy: computeResolvedBy(i),
      hub:        getHub(i) || 'Unknown',
      isQueued:   queuedSet.has(i._id.toString()),
    }));

    const totalCount = enriched.length;
    const pageNum    = Math.max(1, parseInt(page));
    const limitNum   = Math.max(1, parseInt(limit));
    const paginated  = enriched.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return res.json({
      resolutions: paginated,
      total:       totalCount,
      page:        pageNum,
      pages:       Math.ceil(totalCount / limitNum),
    });
  } catch (err) {
    console.error('[GET /resolutions]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/resolutions/:id/queue-training ───────────────────────────────
router.post('/:id/queue-training', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id).lean();
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const existing = await TrainingCandidate.findOne({ incidentId: incident._id });
    if (existing) return res.status(409).json({ error: 'Already in training queue', candidate: existing });

    const candidate = await TrainingCandidate.create({
      incidentId:  incident._id,
      field:       'type',
      aiValue:     incident.type,
      humanValue:  req.body.humanValue || incident.type,
      reviewerId:  req.user?._id,
      timestamp:   new Date(),
    });

    return res.status(201).json({ ok: true, candidate });
  } catch (err) {
    console.error('[POST /resolutions/:id/queue-training]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/v1/resolutions/:id/queue-training ────────────────────────────
router.delete('/:id/queue-training', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  try {
    await TrainingCandidate.deleteOne({ incidentId: req.params.id });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/resolutions/bulk-queue-training ──────────────────────────────
router.post('/bulk-queue-training', requireAuth, requireRole('admin', 'reviewer'), async (req, res) => {
  try {
    const { incidentIds } = req.body;
    if (!Array.isArray(incidentIds) || incidentIds.length === 0) {
      return res.status(400).json({ error: 'incidentIds must be a non-empty array' });
    }

    const results = await Promise.allSettled(
      incidentIds.map(async (id) => {
        const incident = await Incident.findById(id).lean();
        if (!incident) return { id, status: 'not_found' };
        const existing = await TrainingCandidate.findOne({ incidentId: incident._id });
        if (existing) return { id, status: 'already_queued' };
        await TrainingCandidate.create({
          incidentId:  incident._id,
          field:       'type',
          aiValue:     incident.type,
          humanValue:  incident.type,
          reviewerId:  req.user?._id,
          timestamp:   new Date(),
        });
        return { id, status: 'queued' };
      })
    );

    const queued    = results.filter(r => r.status === 'fulfilled' && r.value.status === 'queued').length;
    const skipped   = results.length - queued;
    return res.json({ ok: true, queued, skipped });
  } catch (err) {
    console.error('[POST /resolutions/bulk-queue-training]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/resolutions/batch-train ─────────────────────────────────────
router.post('/batch-train', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await triggerRetrain();
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('[POST /resolutions/batch-train]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/resolutions/:id/embed ───────────────────────────────────────
router.post('/:id/embed', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id).lean();
    if (!incident) return res.status(404).json({ error: 'Not found' });
    const text   = incident.description || incident.title || '';
    const result = await embed(text, incident._id.toString());
    return res.json({ ok: true, dim: result.dim, fallback: result.fallback });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
