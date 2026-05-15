import { useEffect } from 'react';
import { Brain, X } from 'lucide-react';

import ConfidenceEvolutionChart from './ConfidenceEvolutionChart';
import SHAPWaterfall from './SHAPWaterfall';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';

function formatFeatureName(feature) {
  if (!feature) return 'Unknown signal';
  return String(feature)
    .replace(/^eng__/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function ExplainRow({ item, tone }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2">
      <div>
        <p className="text-sm text-[var(--text-1)]">{formatFeatureName(item.feature)}</p>
        <p className="mt-1 text-xs text-[var(--text-3)]">
          value {Number(item.value || 0).toFixed(3)} · {item.group}
        </p>
      </div>
      <span className={`font-mono-ui text-xs ${tone}`}>
        {Number(item.contribution || 0) > 0 ? '+' : ''}
        {Number(item.contribution || 0).toFixed(3)}
      </span>
    </div>
  );
}

function UncertaintyBadge({ level }) {
  const normalized = String(level || 'low').toLowerCase();
  const tone =
    normalized === 'high'
      ? 'border-[var(--accent-red)]/30 bg-[rgb(239,68,68,0.12)] text-[var(--accent-red)]'
      : normalized === 'medium'
        ? 'border-[var(--accent-amber)]/30 bg-[rgb(245,158,11,0.12)] text-[var(--accent-amber)]'
        : 'border-[var(--accent-green)]/30 bg-[rgb(16,185,129,0.12)] text-[var(--accent-green)]';

  return (
    <span className={`inline-flex items-center rounded-[2px] border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${tone}`}>
      {normalized} uncertainty
    </span>
  );
}

function MetaRow({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">{label}</p>
      <p className={`mt-1 text-sm text-[var(--text-1)] ${mono ? 'font-mono-ui' : ''}`}>{value || 'N/A'}</p>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-3)]">
      {children}
    </p>
  );
}

export default function AIReasoningDrawer({
  isOpen,
  onClose,
  incident,
  explanation,
  explanationLoading,
  explanationError,
}) {
  // Escape key + body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const uncertainty = incident?.agentResults?.uncertainty;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI Reasoning"
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[580px] flex-col bg-[var(--surface-2)] shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[rgb(59,130,246,0.12)] text-[#3B82F6]">
              <Brain size={16} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-1)]">AI Reasoning</h2>
              <p className="text-[11px] text-[var(--text-3)]">Diagnostic view · For reviewers</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition-colors"
            aria-label="Close AI Reasoning drawer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">

          {/* ── Section 1: Pipeline Confidence ── */}
          <section>
            <SectionTitle>Pipeline Confidence</SectionTitle>
            <ConfidenceEvolutionChart
              incidentId={incident?._id}
              initialHistory={incident?.confidenceHistory || []}
              isLive={['DRAFT', 'IN_PROGRESS'].includes(incident?.status)}
              finalConfidence={incident?.confidence || 0}
            />
          </section>

          {/* ── Section 2: Feature Importance ── */}
          {incident?.agentResults?.shap && (
            <section>
              <SectionTitle>Feature Importance</SectionTitle>
              <SHAPWaterfall shapData={incident.agentResults.shap} />
            </section>
          )}

          {/* ── Section 3: Decision Evidence ── */}
          <section>
            <SectionTitle>Decision Evidence</SectionTitle>
            {explanationLoading ? (
              <LoadingSkeleton height={180} width="100%" />
            ) : explanationError ? (
              <p className="text-sm text-[var(--text-2)]">{explanationError}</p>
            ) : explanation?.supported === false ? (
              <EmptyState
                title="Decision evidence unavailable"
                subtitle="Feature contribution evidence could not be generated for this incident."
              />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetaRow label="Predicted class" value={explanation?.predictedClass?.replace(/_/g, ' ')} />
                  <MetaRow
                    label="Calibrated confidence"
                    value={`${(Number(explanation?.confidence || 0) * 100).toFixed(0)}%`}
                    mono
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                      Top Positive Signals
                    </p>
                    {(explanation?.topPositive || []).length ? (
                      explanation.topPositive.map((item) => (
                        <ExplainRow
                          key={`pos-${item.feature}`}
                          item={item}
                          tone="text-[var(--accent-green)]"
                        />
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-2)]">No positive feature contributions returned.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]">
                      Top Negative Signals
                    </p>
                    {(explanation?.topNegative || []).length ? (
                      explanation.topNegative.map((item) => (
                        <ExplainRow
                          key={`neg-${item.feature}`}
                          item={item}
                          tone="text-[var(--accent-red)]"
                        />
                      ))
                    ) : (
                      <p className="text-sm text-[var(--text-2)]">No counter-signals returned.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── Section 4: Uncertainty Signal ── */}
          {uncertainty && (
            <section>
              <SectionTitle>Uncertainty Signal</SectionTitle>
              <div className="space-y-4 rounded-[6px] border border-[var(--border)] bg-[var(--surface-3)] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <UncertaintyBadge level={uncertainty.level} />
                  <span className="font-mono-ui text-sm text-[var(--text-1)]">
                    {(Number(uncertainty.score || 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm text-[var(--text-2)]">
                  {uncertainty.reasons?.length
                    ? uncertainty.reasons.slice(0, 4).join(' | ')
                    : 'Signals aligned with low uncertainty.'}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetaRow
                    label="ML confidence"
                    value={uncertainty.signals?.mlConfidence?.toFixed?.(3) || uncertainty.signals?.mlConfidence}
                    mono
                  />
                  <MetaRow
                    label="Top similar-case score"
                    value={uncertainty.signals?.topSimilarity?.toFixed?.(3) || uncertainty.signals?.topSimilarity}
                    mono
                  />
                  <MetaRow
                    label="CRAG reformulated"
                    value={uncertainty.signals?.cragUsed ? 'Yes' : 'No'}
                  />
                  <MetaRow
                    label="ML agreement"
                    value={uncertainty.signals?.mlAgreement === false ? 'No' : 'Yes'}
                  />
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--border)] px-6 py-3">
          <p className="text-[11px] text-[var(--text-3)]">
            Press <kbd className="rounded border border-[var(--border)] px-1 py-0.5 font-mono text-[10px]">Esc</kbd> to close
            &nbsp;·&nbsp; For diagnostic use only — not customer-facing
          </p>
        </div>
      </div>
    </>
  );
}
