// ─────────────────────────────────────────────────────────────────────────────
// proactiveEmail.service.js
//
// Wraps AI-generated proactive content (hub-manager memos, customer notices,
// FAQ updates) in an enterprise-grade DHL-branded HTML email.
//
// Why all-inline CSS + table layout: Gmail/Outlook/Apple Mail strip <style>
// tags inconsistently and aggressively block external resources. The only
// reliable pattern for cross-client styling is inline + tables. This template
// renders identically in Gmail web, Outlook desktop, Apple Mail, and Android
// Mail.
// ─────────────────────────────────────────────────────────────────────────────

const DHL_YELLOW = '#FFCC00';
const DHL_RED    = '#D40511';
const TEXT_DARK  = '#1A1A1A';
const TEXT_MUTED = '#5A5A5A';
const BORDER     = '#E5E5E5';
const PANEL_BG   = '#FAFAFA';
const BODY_BG    = '#F2F2F2';

// ── Markdown → HTML converter (tolerant, AI-output-shaped) ─────────────────
// Supports the patterns the AI actually produces:
//   **bold**                → <strong>bold</strong>
//   # / ## / ### headings   → spaced h2/h3 blocks
//   "1. " / "2. " sections  → bold section headers with subtle red bar
//   "- " / "• " bullets     → <ul><li>
//   blank lines             → paragraph breaks
//
// We escape HTML first to prevent injection from AI-generated content.
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function convertInline(text) {
  // **bold**
  let out = text.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:' + TEXT_DARK + ';">$1</strong>');
  // *italic* (only when not part of **)
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return out;
}

function markdownToBlocks(raw) {
  if (!raw || typeof raw !== 'string') return [];

  // Normalise line endings, trim trailing spaces on each line
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''));

  const blocks = [];
  let buf = [];
  let inList = false;
  let listItems = [];

  function flushPara() {
    if (buf.length === 0) return;
    const text = buf.join(' ').trim();
    buf = [];
    if (!text) return;

    // Numbered section header — e.g. "1. Observation" or "**1. Observation**"
    const sectionMatch = text.match(/^\*?\*?(\d+)\.\s+(.+?)\*?\*?$/);
    if (sectionMatch) {
      blocks.push({ kind: 'section', num: sectionMatch[1], title: sectionMatch[2] });
      return;
    }
    // Heading-only bold line that's standalone (e.g. "**INTERNAL MEMORANDUM**")
    const standaloneBold = text.match(/^\*\*([^*]+)\*\*$/);
    if (standaloneBold) {
      blocks.push({ kind: 'h2', text: standaloneBold[1] });
      return;
    }
    blocks.push({ kind: 'p', text });
  }

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push({ kind: 'ul', items: [...listItems] });
    listItems = [];
    inList = false;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Bullet
    if (/^[-•]\s+/.test(trimmed)) {
      flushPara();
      inList = true;
      listItems.push(trimmed.replace(/^[-•]\s+/, ''));
      continue;
    }

    // Blank line — flush whatever we were building
    if (trimmed === '') {
      flushPara();
      flushList();
      continue;
    }

    if (inList) {
      // Continuation of the previous bullet
      listItems[listItems.length - 1] += ' ' + trimmed;
      continue;
    }

    buf.push(trimmed);
  }

  flushPara();
  flushList();
  return blocks;
}

function renderBlocks(blocks) {
  return blocks
    .map((b) => {
      if (b.kind === 'h2') {
        return `<h2 style="margin:24px 0 8px;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${DHL_RED};font-weight:800;">${convertInline(escapeHtml(b.text))}</h2>`;
      }
      if (b.kind === 'section') {
        return (
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 10px;">` +
            `<tr>` +
              `<td valign="top" style="width:34px;padding-top:2px;">` +
                `<div style="width:26px;height:26px;border-radius:4px;background:${DHL_YELLOW};color:${TEXT_DARK};font-weight:800;font-size:13px;text-align:center;line-height:26px;">${escapeHtml(b.num)}</div>` +
              `</td>` +
              `<td valign="middle" style="font-size:15px;color:${TEXT_DARK};font-weight:700;letter-spacing:0.01em;">${convertInline(escapeHtml(b.title))}</td>` +
            `</tr>` +
          `</table>`
        );
      }
      if (b.kind === 'p') {
        return `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:${TEXT_DARK};">${convertInline(escapeHtml(b.text))}</p>`;
      }
      if (b.kind === 'ul') {
        const items = b.items
          .map((it) => `<li style="margin:0 0 8px;line-height:1.65;">${convertInline(escapeHtml(it))}</li>`)
          .join('');
        return `<ul style="margin:6px 0 18px 22px;padding:0;font-size:14px;color:${TEXT_DARK};">${items}</ul>`;
      }
      return '';
    })
    .join('');
}

// Strip embedded chat-URL footer from a message body. The orchestrator
// pre-appends a plain-text "Track your case... <url>... 72 hours" block to the
// recovery message — we don't want it duplicated since the HTML template
// renders the URL as a proper CTA button.
function stripChatFooter(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\n*Track your case and chat with our support team:[\s\S]*$/i, '')
    .replace(/\n*Jejak kes anda dan berbual dengan pasukan sokongan kami:[\s\S]*$/i, '')
    .replace(/\n*This link is valid for 72 hours\.?[\s\S]*$/i, '')
    .replace(/\n*Pautan ini sah selama 72 jam\.?[\s\S]*$/i, '')
    .trim();
}

// ── Public entry point — wrap content in the enterprise template ───────────
/**
 * @param {object} params
 * @param {string} params.title              Subject-line-style title shown in the email header
 * @param {string} params.preheader          One-line summary shown beneath the title
 * @param {string} params.markdownContent    The AI-generated body
 * @param {object} [params.meta]             Optional meta chips (location, type, severity, refId)
 * @param {object} [params.cta]              Optional call-to-action button { label, url, hint }
 * @param {'internal'|'customer'} [params.tone]  'internal' (default) or 'customer'
 * @returns {string} Full HTML document, ready for transporter.sendMail({ html })
 */
export function buildEnterpriseHtmlEmail({ title, preheader, markdownContent, meta = {}, cta = null, tone = 'internal' }) {
  const blocks = markdownToBlocks(markdownContent);
  const body = renderBlocks(blocks);

  const metaChips = Object.entries(meta)
    .filter(([, v]) => v != null && v !== '')
    .map(
      ([label, value]) =>
        `<span style="display:inline-block;margin:0 8px 6px 0;padding:4px 10px;border:1px solid ${BORDER};border-radius:3px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${TEXT_MUTED};background:#FFF;">` +
          `<span style="color:${TEXT_MUTED};font-weight:700;">${escapeHtml(label)}:</span> ` +
          `<span style="color:${TEXT_DARK};font-weight:700;">${escapeHtml(String(value))}</span>` +
        `</span>`,
    )
    .join('');

  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(title || 'DHL NEXUS Notice')}</title>
</head>
<body style="margin:0;padding:0;background:${BODY_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<!-- Hidden preheader text (shown in inbox preview, hidden in body) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BODY_BG};">
  ${escapeHtml(preheader || '')}
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BODY_BG};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Card -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;width:100%;background:#FFFFFF;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;">

        <!-- Top accent strip (DHL yellow) -->
        <tr>
          <td style="height:6px;background:${DHL_YELLOW};line-height:6px;font-size:0;">&nbsp;</td>
        </tr>

        <!-- Header band -->
        <tr>
          <td style="padding:22px 32px 18px;border-bottom:1px solid ${BORDER};background:#FFFFFF;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="middle">
                  <div style="font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:900;color:${DHL_RED};letter-spacing:0.06em;line-height:1;">
                    DHL
                  </div>
                  <div style="margin-top:4px;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${TEXT_MUTED};font-weight:700;">
                    NEXUS Operations Center
                  </div>
                </td>
                <td valign="top" align="right" style="font-size:11px;color:${TEXT_MUTED};line-height:1.5;">
                  <div style="font-weight:700;color:${TEXT_DARK};letter-spacing:0.04em;">${escapeHtml(dateStr)}</div>
                  <div style="margin-top:2px;letter-spacing:0.04em;">DHL Malaysia · Internal</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Title block -->
        <tr>
          <td style="padding:24px 32px 12px;background:${PANEL_BG};border-bottom:1px solid ${BORDER};">
            <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${DHL_RED};font-weight:800;">
              ${tone === 'customer' ? 'DHL Customer Care' : 'Proactive Operations Notice'}
            </div>
            <h1 style="margin:6px 0 0;font-size:21px;line-height:1.35;color:${TEXT_DARK};font-weight:800;letter-spacing:-0.005em;">
              ${escapeHtml(title || 'DHL NEXUS Notice')}
            </h1>
            ${metaChips ? `<div style="margin-top:14px;">${metaChips}</div>` : ''}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:26px 32px 8px;background:#FFFFFF;">
            ${body}
          </td>
        </tr>

        ${cta && cta.url ? `
        <!-- CTA button — for customer-facing emails (chat link) -->
        <tr>
          <td style="padding:6px 32px 26px;background:#FFFFFF;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" style="padding:8px 0 4px;">
                  <a href="${escapeHtml(cta.url)}"
                     style="display:inline-block;padding:13px 28px;background:${DHL_YELLOW};color:${TEXT_DARK};font-size:14px;font-weight:800;letter-spacing:0.04em;text-decoration:none;border-radius:4px;border-bottom:2px solid #E0B800;">
                    ${escapeHtml(cta.label || 'Open in NEXUS')}
                  </a>
                </td>
              </tr>
              ${cta.hint ? `
              <tr>
                <td align="center" style="padding-top:8px;font-size:11px;color:${TEXT_MUTED};letter-spacing:0.02em;">
                  ${escapeHtml(cta.hint)}
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>` : ''}

        <!-- Signature block -->
        <tr>
          <td style="padding:18px 32px 28px;background:#FFFFFF;border-top:1px solid ${BORDER};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td valign="top">
                  <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${TEXT_MUTED};font-weight:700;">
                    ${tone === 'customer' ? 'Sincerely' : 'Issued by'}
                  </div>
                  <div style="margin-top:6px;font-size:14px;color:${TEXT_DARK};font-weight:700;">
                    ${tone === 'customer' ? 'DHL Malaysia Customer Care' : 'NEXUS Autonomous Operations'}
                  </div>
                  <div style="font-size:12px;color:${TEXT_MUTED};margin-top:2px;">
                    ${tone === 'customer' ? 'Powered by NEXUS · 24/7 Customer Support' : 'On behalf of Operations Manager · DHL Malaysia'}
                  </div>
                </td>
                <td valign="top" align="right" style="font-size:11px;color:${TEXT_MUTED};line-height:1.6;">
                  <div>${tone === 'customer' ? 'Customer Hotline' : 'Operations Hotline'} · 1300-888-DHL</div>
                  <div>support.my@dhl.com</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:14px 32px 18px;background:${PANEL_BG};border-top:1px solid ${BORDER};font-size:10.5px;line-height:1.6;color:${TEXT_MUTED};letter-spacing:0.02em;">
            ${tone === 'customer'
              ? `This is an automated message from DHL Malaysia regarding your active case.
                 If you did not contact DHL or no longer wish to receive these updates, please
                 reply to this email or call our hotline. Your case and chat link are valid
                 for 72 hours; we will follow up before then.`
              : `This message is generated by the NEXUS autonomous operations system based on real-time
                 cluster detection and SLA monitoring. It is intended for internal DHL Malaysia
                 recipients and contains operational guidance derived from confirmed incident data.
                 Recommended actions are advisory; your judgment as accountable manager remains the
                 authoritative override.`}
          </td>
        </tr>

        <!-- Bottom accent (DHL red) -->
        <tr>
          <td style="height:3px;background:${DHL_RED};line-height:3px;font-size:0;">&nbsp;</td>
        </tr>

      </table>

      <div style="margin-top:14px;font-size:10.5px;color:${TEXT_MUTED};letter-spacing:0.04em;">
        DHL NEXUS · Autonomous Operations Layer · DAC 3.0
      </div>

    </td>
  </tr>
</table>

</body>
</html>`;
}

// ── Convenience helper for hub-manager memos specifically ──────────────────
export function buildHubNoticeEmail({ hubNotice, location, incidentType, incidentCount }) {
  const typeLabel = String(incidentType || 'incident').replace(/_/g, ' ');
  const title = `Hub Cluster Alert — ${typeLabel} at ${location || 'Unknown hub'}`;
  const preheader =
    `${incidentCount || 'Multiple'} confirmed ${typeLabel} incidents at ${location} — immediate action required.`;
  return buildEnterpriseHtmlEmail({
    title,
    preheader,
    markdownContent: hubNotice,
    meta: {
      Hub:      location || '—',
      Type:     typeLabel,
      Cases:    incidentCount != null ? String(incidentCount) : null,
      Priority: 'High',
    },
  });
}

// ── Customer-facing service notice (proactive cluster broadcast) ───────────
export function buildCustomerNoticeEmail({ customerEmailContent, location, incidentType }) {
  const typeLabel = String(incidentType || 'incident').replace(/_/g, ' ');
  const title = `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} — Service Update`;
  const preheader = `DHL Malaysia service update regarding your ${typeLabel} at ${location}.`;
  return buildEnterpriseHtmlEmail({
    tone:  'customer',
    title,
    preheader,
    markdownContent: customerEmailContent,
    meta: {
      Service: typeLabel,
      Hub:     location || '—',
    },
  });
}

// ── Acknowledgment email (auto-sent on intake) ─────────────────────────────
export function buildAcknowledgmentCustomerEmail({ caseRef, incidentType, severity, chatUrl }) {
  const typeLabel = String(incidentType || 'incident').replace(/_/g, ' ');
  const title = `We've received your ${typeLabel} report`;
  const preheader = `Case ${caseRef} created — track and chat with our team via the secure link inside.`;

  // We hand-write the markdown body (rather than using AI text) because this
  // is a deterministic acknowledgment template. Same wording as the original
  // plain-text version, just structured for the converter.
  const md = [
    `Dear Customer,`,
    ``,
    `Thank you for contacting DHL Malaysia. We have received your report and your case is now under review by our team.`,
    ``,
    `**Case Details:**`,
    ``,
    `- Case reference: **${caseRef}**`,
    `- Type: ${typeLabel}`,
    `- Priority: ${severity || 'Under assessment'}`,
    `- Status: Under review`,
    ``,
    `Use the link below to track your case and chat directly with our support team. The link is secure and valid for 72 hours.`,
    ``,
    `If you need immediate assistance, please call **1300-888-DHL**.`,
  ].join('\n');

  return buildEnterpriseHtmlEmail({
    tone:  'customer',
    title,
    preheader,
    markdownContent: md,
    meta: {
      'Case Ref': caseRef,
      Type:       typeLabel,
      Priority:   severity || '—',
    },
    cta: chatUrl ? {
      label: 'Track your case',
      url:   chatUrl,
      hint:  'Secure link · valid for 72 hours',
    } : null,
  });
}

// ── Recovery email (sent after PCC approves the AI-drafted message) ────────
export function buildRecoveryCustomerEmail({ recoveryText, caseRef, incidentType, chatUrl, language = 'en' }) {
  const typeLabel = String(incidentType || 'incident').replace(/_/g, ' ');
  const isMalay = language === 'ms';
  const title = isMalay
    ? `Kemas kini DHL untuk kes anda`
    : `Update on your DHL ${typeLabel} case`;
  const preheader = isMalay
    ? `Kes ${caseRef} - rujukan dan pautan sembang dalam mesej ini.`
    : `Case ${caseRef} — your case reference and secure chat link inside.`;

  // The recoveryText comes from the AI. It may include a chat URL footer that
  // the orchestrator pre-appended — we strip that since the HTML CTA renders
  // the URL as a button. We then append a clean "Case reference" line.
  const cleanedBody = stripChatFooter(recoveryText) +
    (caseRef ? `\n\n**Case reference: ${caseRef}**` : '');

  return buildEnterpriseHtmlEmail({
    tone:  'customer',
    title,
    preheader,
    markdownContent: cleanedBody,
    meta: {
      'Case Ref': caseRef,
      Type:       typeLabel,
    },
    cta: chatUrl ? {
      label: isMalay ? 'Buka sembang sokongan' : 'Open support chat',
      url:   chatUrl,
      hint:  isMalay ? 'Pautan selamat · sah selama 72 jam' : 'Secure link · valid for 72 hours',
    } : null,
  });
}
