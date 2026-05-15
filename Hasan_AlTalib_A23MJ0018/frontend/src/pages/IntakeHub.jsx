import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Camera, CheckCircle2, ChevronRight,
  FileText, Loader2, Mail, MessageCircle, PhoneCall,
  Scan, ShieldCheck, Upload as UploadIcon, X, Zap,
} from 'lucide-react';

import Layout from '../components/Layout';
import PipelineModal from '../components/PipelineModal';
import useSSE from '../hooks/useSSE';
import {
  analyseIncident, analyzePhoto, extractFileText, getRpaStats, uploadIncidentAttachment,
} from '../lib/api';

/* ── Channel definitions ─────────────────────────────────────────────────────── */

const CHANNELS = [
  {
    id: 'photo',
    label: 'Photo / Image',
    icon: Camera,
    tagline: 'Vision AI assesses damage from a photo — type, severity, and areas auto-detected.',
    badge: 'Vision AI',
    color: '#FF8C00',
    border: 'rgba(167,139,250,0.35)',
    bg: 'rgba(167,139,250,0.06)',
  },
  {
    id: 'email',
    label: 'Email',
    icon: Mail,
    tagline: 'Paste raw customer email. NEXUS extracts structure, AWB number, and sentiment.',
    badge: 'Auto-parsed',
    color: '#FFCC00',
    border: 'rgba(56,189,248,0.35)',
    bg: 'rgba(56,189,248,0.06)',
  },
  {
    id: 'chat',
    label: 'Teams / WhatsApp',
    icon: MessageCircle,
    tagline: 'Copy-paste a chat thread or Teams message. Works with any platform.',
    badge: 'Multi-platform',
    color: '#34d399',
    border: 'rgba(52,211,153,0.35)',
    bg: 'rgba(52,211,153,0.06)',
  },
  {
    id: 'phone',
    label: 'Phone Notes',
    icon: PhoneCall,
    tagline: 'Type or paste call notes — NEXUS structures them into a classified incident.',
    badge: 'Auto-struct',
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.35)',
    bg: 'rgba(251,191,36,0.06)',
  },
  {
    id: 'document',
    label: 'Document',
    icon: FileText,
    tagline: 'Drop a PDF, DOCX, or TXT — NEXUS extracts the text and runs the full pipeline.',
    badge: 'PDF / DOCX',
    color: '#a78bfa',
    border: 'rgba(167,139,250,0.35)',
    bg: 'rgba(167,139,250,0.06)',
  },
  {
    id: 'rpa',
    label: 'RPA Batch',
    icon: Zap,
    tagline: 'UiPath bot watches the Outlook inbox and ingests emails automatically, 24/7.',
    badge: 'Automated',
    color: '#f87171',
    border: 'rgba(248,113,113,0.35)',
    bg: 'rgba(248,113,113,0.06)',
  },
];

const DOC_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const DOC_MAX_BYTES = 10 * 1024 * 1024;

const SEVERITY_COLORS = {
  Critical: '#f87171',
  High: '#fb923c',
  Medium: '#fbbf24',
  Low: '#34d399',
};

const DAMAGE_ICONS = {
  crushed: '📦',
  torn: '🩹',
  wet: '💧',
  missing_contents: '🔍',
  surface_scratch: '🪛',
  dented: '⚠️',
  broken: '💥',
  other: '📋',
};

/* ── Photo drop zone ─────────────────────────────────────────────────────────── */

function PhotoDropZone({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback(
    (file) => {
      if (!file || disabled) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
      onFile(file);
    },
    [onFile, disabled],
  );

  return (
    <div
      className="relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-all"
      style={{
        borderColor: dragging ? '#FF8C00' : 'var(--border)',
        background: dragging ? 'rgba(167,139,250,0.08)' : 'var(--surface-2, var(--surface))',
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
    >
      <Camera size={36} style={{ color: '#FF8C00', opacity: disabled ? 0.4 : 1 }} />
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--text)]">Drop a damage photo here</p>
        <p className="mt-1 text-xs text-[var(--text-2)]">JPEG, PNG, WebP — max 5 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
    </div>
  );
}

/* ── Vision analysis result card ─────────────────────────────────────────────── */

function VisionResultCard({ result, previewUrl }) {
  const { photoAnalysis, consistencyCheck } = result.damageAssessment || {};
  const sevColor = SEVERITY_COLORS[result.severity] || '#fbbf24';
  const icon = DAMAGE_ICONS[photoAnalysis?.damageType] || '📋';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-4 space-y-4"
      style={{ borderColor: 'rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.05)' }}
    >
      <div className="flex items-start gap-4">
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Uploaded"
            className="h-20 w-20 rounded-lg object-cover flex-shrink-0 border"
            style={{ borderColor: 'var(--border)' }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{icon}</span>
            <span className="text-sm font-semibold text-[var(--text)] capitalize">
              {(photoAnalysis?.damageType || 'unknown').replace(/_/g, ' ')}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{ background: `${sevColor}22`, color: sevColor }}
            >
              {result.severity}
            </span>
            <span className="ml-auto text-xs text-[var(--text-2)]">
              Confidence: {Math.round((photoAnalysis?.confidence || 0) * 100)}%
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(photoAnalysis?.affectedAreas || []).map((a) => (
              <span
                key={a}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: 'rgba(167,139,250,0.15)', color: '#FF8C00' }}
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg p-2" style={{ background: 'var(--surface)' }}>
          <p className="text-[var(--text-2)] mb-0.5">Packaging</p>
          <p className="font-medium text-[var(--text)] capitalize">
            {photoAnalysis?.packagingCondition || '-'}
          </p>
        </div>
        <div className="rounded-lg p-2" style={{ background: 'var(--surface)' }}>
          <p className="text-[var(--text-2)] mb-0.5">Severity Score</p>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 rounded-full h-1.5" style={{ background: 'var(--border)' }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${((photoAnalysis?.severityScore || 0) / 5) * 100}%`, background: sevColor }}
              />
            </div>
            <span className="font-mono font-medium text-[var(--text)]">
              {(photoAnalysis?.severityScore || 0).toFixed(1)}/5
            </span>
          </div>
        </div>
      </div>

      {consistencyCheck && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            background: consistencyCheck.discrepancyDetected
              ? 'rgba(248,113,113,0.08)'
              : 'rgba(52,211,153,0.08)',
            borderLeft: `3px solid ${consistencyCheck.discrepancyDetected ? '#f87171' : '#34d399'}`,
          }}
        >
          {consistencyCheck.discrepancyDetected ? (
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-red-400" />
          ) : (
            <CheckCircle2 size={12} className="mt-0.5 flex-shrink-0 text-emerald-400" />
          )}
          <span style={{ color: consistencyCheck.discrepancyDetected ? '#f87171' : '#34d399' }}>
            {consistencyCheck.recommendation}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/* ── RPA status card ─────────────────────────────────────────────────────────── */

function RpaStatusCard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRpaStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-5 space-y-4"
        style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.05)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'rgba(248,113,113,0.15)' }}
          >
            <Zap size={20} style={{ color: '#f87171' }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">UiPath Email Bot</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400">Active — monitoring Outlook inbox</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 size={20} className="animate-spin text-[var(--text-2)]" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Bot Runs', value: stats.totalRuns },
              { label: 'Emails Processed', value: stats.totalFiles },
              { label: 'Success Rate', value: `${stats.successRate}%` },
              { label: 'Last Run', value: stats.lastRunAt ? new Date(stats.lastRunAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg p-3 text-center" style={{ background: 'var(--surface)' }}>
                <p className="text-lg font-bold text-[var(--text)]">{value}</p>
                <p className="text-[10px] text-[var(--text-2)] mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-[var(--text-2)] leading-relaxed">
          The UiPath bot watches the DHL Malaysia inbox, reads each incoming customer email, calls
          the NEXUS API, and hands off to the full 8-agent pipeline — without any human touch.
        </p>
      </div>

      <div
        className="rounded-xl border p-4"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider mb-3">Bot Flow</p>
        {[
          { step: 'Read Outlook inbox', icon: Mail },
          { step: 'Extract email body + attachments', icon: FileText },
          { step: 'POST /incidents/ingest-email', icon: Zap },
          { step: 'Full AI pipeline runs (8 agents)', icon: Scan },
          { step: 'Auto-response sent to customer', icon: CheckCircle2 },
        ].map(({ step, icon: Icon }, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5">
            <div
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}
            >
              {i + 1}
            </div>
            <Icon size={12} className="text-[var(--text-2)] flex-shrink-0" />
            <span className="text-xs text-[var(--text)]">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Document channel (PDF / DOCX / TXT) ─────────────────────────────────────── */

function DocumentChannel({
  pendingFile, extractedText, extracting, extractError,
  onFile, onClear, onChangeText, onSubmit, submitting,
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function pickFile(file) {
    if (!file) return;
    if (!DOC_MIME.includes(file.type)) {
      onFile(null, 'Unsupported file. Use PDF, DOCX, or TXT.');
      return;
    }
    if (file.size > DOC_MAX_BYTES) {
      onFile(null, 'File too large. Maximum size is 10 MB.');
      return;
    }
    onFile(file, null);
  }

  if (!pendingFile) {
    return (
      <div
        className="relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-all"
        style={{
          borderColor: dragging ? '#a78bfa' : 'var(--border)',
          background: dragging ? 'rgba(167,139,250,0.08)' : 'var(--surface-2, var(--surface))',
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
      >
        <UploadIcon size={36} style={{ color: '#a78bfa' }} />
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--text)]">Drop a document here</p>
          <p className="mt-1 text-xs text-[var(--text-2)]">PDF, DOCX, TXT — max 10 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={(e) => pickFile(e.target.files[0])}
        />
        {extractError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle size={12} />
            <span>{extractError}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{ borderColor: 'rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.06)' }}
      >
        <FileText size={18} style={{ color: '#a78bfa' }} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text)] truncate">{pendingFile.name}</p>
          <p className="text-xs text-[var(--text-2)]">
            {(pendingFile.size / 1024).toFixed(1)} KB · {pendingFile.type || 'file'}
          </p>
        </div>
        <button
          onClick={onClear}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-2)] transition-all hover:bg-[var(--surface-2,var(--surface))] hover:text-[var(--text)]"
          aria-label="Remove file"
        >
          <X size={14} />
        </button>
      </div>

      {extracting && (
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.06)' }}
        >
          <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: '#a78bfa' }} />
          <span className="text-sm text-[var(--text)]">Extracting text from document...</span>
        </div>
      )}

      {extractError && (
        <div
          className="flex items-center gap-2 rounded-xl border px-4 py-3"
          style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)' }}
        >
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400">{extractError}</span>
        </div>
      )}

      {!extracting && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-[var(--text-2)]">
            Extracted text (edit before submitting if needed)
          </p>
          <textarea
            className="w-full rounded-xl border p-3 text-sm font-mono resize-none outline-none transition-all"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minHeight: 180,
            }}
            value={extractedText}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="Extracted text will appear here..."
          />
          <p className="mt-1 text-[10px] text-[var(--text-2)]">
            {extractedText.length} chars · file will be attached to the incident
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          disabled={extractedText.trim().length < 10 || submitting || extracting}
          onClick={onSubmit}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: '#a78bfa', color: '#fff' }}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Submit to AI Pipeline
        </button>
      </div>
    </div>
  );
}

/* ── Text intake form (shared by email / chat / phone) ───────────────────────── */

function TextIntakeForm({ channel, onSubmit, submitting }) {
  const [text, setText] = useState('');
  const placeholders = {
    email: 'From: customer@example.com\nSubject: Damaged parcel AWB778899001\n\nDear DHL, my parcel arrived today completely crushed...',
    chat: '[WhatsApp 09:42] Hi I ordered from Lazada and the item came broken. AWB is 123456789. Please help.',
    phone: 'Caller: Ms Lim, Penang. AWB 334455667. Parcel missing. Ordered laptop. Charged but not received. Very upset.',
  };

  return (
    <div className="space-y-4">
      <textarea
        className="w-full rounded-xl border p-4 text-sm font-mono resize-none outline-none transition-all focus:ring-1"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          minHeight: 180,
          focusRingColor: channel.color,
        }}
        placeholder={placeholders[channel.id] || 'Paste or type the incident details here...'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-2)]">{text.length} chars</span>
        <button
          disabled={text.trim().length < 10 || submitting}
          onClick={() => onSubmit({ text: text.trim() })}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: channel.color, color: '#fff' }}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Run AI Pipeline
        </button>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────────── */

export default function IntakeHub() {
  const navigate = useNavigate();
  const [activeChannel, setActiveChannel] = useState(CHANNELS[0]);

  // Photo channel state
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [visionResult, setVisionResult] = useState(null);
  const [visionError, setVisionError] = useState(null);
  const [photoDescription, setPhotoDescription] = useState('');

  // Document channel state
  const [docFile, setDocFile] = useState(null);
  const [docText, setDocText] = useState('');
  const [docExtracting, setDocExtracting] = useState(false);
  const [docError, setDocError] = useState(null);

  // Pipeline state
  const [submitting, setSubmitting] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [currentIncidentId, setCurrentIncidentId] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);

  const { events, thinking, thinkingVersion, isConnected } = useSSE(streamUrl);

  const handlePhotoFile = useCallback(async (file) => {
    setPhotoFile(file);
    setVisionResult(null);
    setVisionError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setAnalyzing(true);
    try {
      const result = await analyzePhoto(file);
      setVisionResult(result);
      setPhotoDescription(result.description || '');
    } catch (err) {
      setVisionError(err.message || 'Vision analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const clearPhoto = useCallback(() => {
    setPhotoFile(null);
    setPreviewUrl(null);
    setVisionResult(null);
    setVisionError(null);
    setPhotoDescription('');
  }, []);

  const handleSubmit = useCallback(async (payload) => {
    setSubmitting(true);
    try {
      const isDoc = activeChannel.id === 'document';
      const { incidentId, streamUrl: url } = await analyseIncident({
        ...payload,
        photo: activeChannel.id === 'photo' && photoFile ? photoFile : undefined,
        file: isDoc && docFile ? docFile : undefined,
        type: visionResult?.type || undefined,
      });
      setCurrentIncidentId(incidentId);
      setStreamUrl(`${import.meta.env.VITE_API_URL}${url}`);
      setPipelineOpen(true);
      if (isDoc && docFile) {
        uploadIncidentAttachment(incidentId, docFile).catch(() => {});
      }
    } catch (err) {
      console.error('[IntakeHub] submit failed:', err.message);
    } finally {
      setSubmitting(false);
    }
  }, [activeChannel.id, photoFile, visionResult, docFile]);

  const handlePhotoSubmit = useCallback(() => {
    if (!photoDescription.trim()) return;
    handleSubmit({ text: photoDescription });
  }, [photoDescription, handleSubmit]);

  const handleDocFile = useCallback(async (file, errMsg) => {
    if (errMsg) { setDocError(errMsg); return; }
    setDocFile(file);
    setDocText('');
    setDocError(null);
    setDocExtracting(true);
    try {
      const text = await extractFileText(file);
      setDocText(text || '');
    } catch (err) {
      setDocFile(null);
      setDocError(err.message || 'Failed to extract document text.');
    } finally {
      setDocExtracting(false);
    }
  }, []);

  const clearDoc = useCallback(() => {
    setDocFile(null);
    setDocText('');
    setDocError(null);
  }, []);

  const handleDocSubmit = useCallback(() => {
    if (docText.trim().length < 10) return;
    handleSubmit({ text: docText.trim() });
  }, [docText, handleSubmit]);

  const handlePipelineClose = useCallback(() => {
    setPipelineOpen(false);
    setStreamUrl(null);
    setCurrentIncidentId(null);
    setPhotoFile(null);
    setPreviewUrl(null);
    setVisionResult(null);
    setPhotoDescription('');
    setDocFile(null);
    setDocText('');
    setDocError(null);
  }, []);

  const handleViewIncident = useCallback(() => {
    if (currentIncidentId) navigate(`/incidents/${currentIncidentId}`);
  }, [currentIncidentId, navigate]);

  return (
    <Layout title="Intake Hub">
      <div className="mx-auto max-w-5xl space-y-6 pb-10">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Multi-Channel Incident Intake</h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            Every format, every channel — one AI pipeline. Select the input type that matches your source.
          </p>
        </div>

        {/* Channel selector */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            const active = activeChannel.id === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch)}
                className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all"
                style={{
                  borderColor: active ? ch.border : 'var(--border)',
                  background: active ? ch.bg : 'var(--surface)',
                  transform: active ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: active ? `${ch.color}22` : 'var(--surface-2, var(--surface))' }}
                >
                  <Icon size={20} style={{ color: active ? ch.color : 'var(--text-2)' }} />
                </div>
                <p
                  className="text-xs font-semibold leading-tight"
                  style={{ color: active ? ch.color : 'var(--text)' }}
                >
                  {ch.label}
                </p>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                  style={{
                    background: active ? `${ch.color}22` : 'var(--surface)',
                    color: active ? ch.color : 'var(--text-2)',
                    border: `1px solid ${active ? ch.border : 'var(--border)'}`,
                  }}
                >
                  {ch.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active channel panel */}
        <AnimatePresence>
          <motion.div
            key={activeChannel.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="rounded-xl border p-6 space-y-5"
            style={{ borderColor: activeChannel.border, background: activeChannel.bg }}
          >
            {/* Channel header */}
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: `${activeChannel.color}22` }}
              >
                {(() => { const Icon = activeChannel.icon; return <Icon size={18} style={{ color: activeChannel.color }} />; })()}
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">{activeChannel.label}</p>
                <p className="text-xs text-[var(--text-2)]">{activeChannel.tagline}</p>
              </div>
            </div>

            {/* Photo channel */}
            {activeChannel.id === 'photo' && (
              <div className="space-y-4">
                {!photoFile ? (
                  <PhotoDropZone onFile={handlePhotoFile} disabled={analyzing} />
                ) : (
                  <div className="space-y-3">
                    {analyzing && (
                      <div className="flex items-center gap-3 rounded-xl border px-4 py-3"
                        style={{ borderColor: 'rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.06)' }}>
                        <Loader2 size={16} className="animate-spin flex-shrink-0" style={{ color: '#FF8C00' }} />
                        <span className="text-sm text-[var(--text)]">Claude Vision is analysing your photo...</span>
                      </div>
                    )}

                    {visionError && (
                      <div className="flex items-center gap-2 rounded-xl border px-4 py-3"
                        style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)' }}>
                        <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                        <span className="text-sm text-red-400">{visionError}</span>
                      </div>
                    )}

                    {visionResult && (
                      <VisionResultCard result={visionResult} previewUrl={previewUrl} />
                    )}

                    <div>
                      <p className="mb-1.5 text-xs font-medium text-[var(--text-2)]">
                        Description (auto-filled from vision — edit as needed)
                      </p>
                      <textarea
                        className="w-full rounded-xl border p-3 text-sm resize-none outline-none transition-all focus:ring-1"
                        style={{
                          borderColor: 'var(--border)',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          minHeight: 80,
                        }}
                        value={photoDescription}
                        onChange={(e) => setPhotoDescription(e.target.value)}
                        placeholder="Describe the damage in your own words (optional — Vision AI has auto-filled this)"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={clearPhoto}
                        className="rounded-lg border px-3 py-1.5 text-xs text-[var(--text-2)] transition-all hover:text-[var(--text)]"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        Clear photo
                      </button>
                      <button
                        disabled={!visionResult || submitting || photoDescription.trim().length < 5}
                        onClick={handlePhotoSubmit}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all disabled:opacity-40"
                        style={{ background: '#FF8C00', color: '#fff' }}
                      >
                        {submitting ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Zap size={14} />
                        )}
                        Submit to AI Pipeline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Text channels */}
            {['email', 'chat', 'phone'].includes(activeChannel.id) && (
              <TextIntakeForm
                channel={activeChannel}
                onSubmit={handleSubmit}
                submitting={submitting}
              />
            )}

            {/* Document channel */}
            {activeChannel.id === 'document' && (
              <DocumentChannel
                pendingFile={docFile}
                extractedText={docText}
                extracting={docExtracting}
                extractError={docError}
                onFile={handleDocFile}
                onClear={clearDoc}
                onChangeText={setDocText}
                onSubmit={handleDocSubmit}
                submitting={submitting}
              />
            )}

            {/* RPA channel */}
            {activeChannel.id === 'rpa' && <RpaStatusCard />}
          </motion.div>
        </AnimatePresence>

        {/* Pipeline connections info strip */}
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-2)]">
            All channels → same pipeline
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-2)]">
            {[
              'Intake extraction',
              'ML classification',
              'Dedup check',
              'Case memory RAG',
              'Resolution steps',
              'SHAP explainability',
              'HITL gate',
              'Auto-email',
              'Customer chat link',
              'Satisfaction tracking',
              'Auto-embed + retrain',
            ].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-2">
                <span
                  className="rounded px-2 py-0.5 font-medium"
                  style={{ background: 'rgba(99,102,241,0.1)', color: '#FF8C00' }}
                >
                  {step}
                </span>
                {i < arr.length - 1 && <ChevronRight size={10} className="text-[var(--border)]" />}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline modal */}
      {pipelineOpen && (
        <PipelineModal
          events={events}
          thinking={thinking}
          thinkingVersion={thinkingVersion}
          isActive={submitting || isConnected}
          completionMeta={null}
          onViewIncident={handleViewIncident}
          onViewQueue={() => navigate('/board')}
          onClose={handlePipelineClose}
        />
      )}
    </Layout>
  );
}
