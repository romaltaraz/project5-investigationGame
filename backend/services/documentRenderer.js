// services/documentRenderer.js
//
// Renders non-handwritten document evidence (official reports, security
// access logs, printed emails, invoices, etc.) from structured
// documentData. The layout (log / invoice / email / letterhead) is picked
// from the artifactType, so a security log looks like a log and not like
// a police report with the word "log" typed on it.

import { resolveArtifactLayout } from './evidenceBlueprint.js';

const escapeHtml = (value = '') => `${value}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const applyCorrections = (text = '', corrections = []) => {
  let result = escapeHtml(text);
  corrections.filter(Boolean).forEach((phrase) => {
    const escapedPhrase = escapeHtml(phrase);
    if (escapedPhrase && result.includes(escapedPhrase)) {
      result = result.replace(escapedPhrase, `<span class="crossed">${escapedPhrase}</span>`);
    }
  });
  return result;
};

const renderParagraphs = (bodyText = '', corrections = []) => bodyText
  .split(/\n{1,}/)
  .filter(Boolean)
  .map((paragraph) => `<p>${applyCorrections(paragraph, corrections)}</p>`)
  .join('\n      ');

const HEIGHT_REPORT_SCRIPT = `<script>
  (function () {
    function reportHeight() {
      var h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.parent.postMessage({ source: 'evidence-frame', height: h }, '*');
    }
    window.addEventListener('load', reportHeight);
    window.addEventListener('resize', reportHeight);
  })();
</script>`;

const BASE_STYLE = `
    *{box-sizing:border-box;margin:0;padding:0}
    html{scrollbar-width:thin;scrollbar-color:rgba(196,107,58,.6) rgba(0,0,0,.06)}
    ::-webkit-scrollbar{width:10px}
    ::-webkit-scrollbar-track{background:rgba(0,0,0,.06);border-radius:999px}
    ::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(212,173,99,.9),rgba(196,107,58,.9));border:2px solid rgba(250,247,240,.9);border-radius:999px}
    ::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#e2bb73,#cf7645)}
    body{font-family:'Courier New',monospace;background:#f5f0e8;color:#1a1208;padding:40px 20px;min-height:100vh}
    .page{max-width:740px;margin:0 auto;background:#faf7f0;border:1px solid #c8b88a;box-shadow:4px 4px 20px rgba(0,0,0,.2);padding:44px 56px;position:relative}
    .stamp{position:absolute;top:32px;left:40px;border:3px solid #aa1111;color:#aa1111;font-size:20px;font-weight:bold;padding:6px 14px;border-radius:4px;transform:rotate(-12deg);opacity:.75;letter-spacing:2px}
    .letterhead{text-align:center;border-bottom:2px solid #8a6a30;padding-bottom:16px;margin-bottom:22px}
    .letterhead h1{font-size:12px;letter-spacing:3px;color:#5a4020;margin-bottom:6px}
    .letterhead h2{font-size:17px;color:#1a1208}
    .meta{font-size:11px;color:#7a6040;margin-bottom:18px;line-height:1.8}
    .meta span{display:inline-block;min-width:120px;font-weight:bold}
    .content p{font-size:13px;line-height:1.9;margin-bottom:12px;text-align:justify}
    .crossed{text-decoration:line-through;opacity:.55}
    .signature{margin-top:28px;font-size:14px;font-style:italic;color:#3a2a10}
    .footer{margin-top:28px;border-top:1px solid #c8b88a;padding-top:12px;font-size:10px;color:#9a8060;text-align:center;letter-spacing:1px}
    table.log{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
    table.log th,table.log td{border:1px solid #c8b88a;padding:6px 10px;text-align:right}
    table.log th{background:#eee3c8;color:#5a4020;font-size:11px;letter-spacing:1px}
    .email-header{border:1px solid #c8b88a;padding:14px 16px;margin-bottom:20px;font-size:12px;line-height:2;background:#fffdf6}
    .email-header b{display:inline-block;min-width:64px;color:#5a4020}
  `;

const renderLetterhead = ({ caseName, briefingDetails, evidence, caseId, documentData, artifactTitle }) => {
  const { title, bodyText = '', corrections = [], hasSignature, signatureText, hasStamp, stampText, metaFields = {} } = documentData;
  const metaRows = Object.entries(metaFields)
    .map(([key, value]) => `<div><span>${escapeHtml(key)}:</span> ${escapeHtml(value)}</div>`)
    .join('\n      ');

  return `<body>
  <div class="page">
    ${hasStamp && stampText ? `<div class="stamp">${escapeHtml(stampText)}</div>` : ''}
    <div class="letterhead">
      <h1>${escapeHtml(artifactTitle)}</h1>
      <h2>${escapeHtml(title || caseName)}</h2>
    </div>
    <div class="meta">
      <div><span>מספר תיק:</span> OPS-${String(caseId).slice(-6)}</div>
      <div><span>מיקום:</span> ${escapeHtml(briefingDetails.incidentLocation || 'לא צוין')}</div>
      <div><span>שעת אירוע:</span> ${escapeHtml(briefingDetails.incidentTime || 'לא צוין')}</div>
      ${metaRows}
    </div>
    <div class="content">
      ${renderParagraphs(bodyText, corrections)}
    </div>
    ${hasSignature ? `<div class="signature">${escapeHtml(signatureText || '')}</div>` : ''}
    <div class="footer">מסמך מסווג – אין להעביר ללא אישור מפורש</div>
  </div>
</body>`;
};

const renderLog = ({ caseName, evidence, documentData, artifactTitle, caseId }) => {
  const { logEntries = [], bodyText = '' } = documentData;
  const rows = logEntries.map((entry) => `<tr>
        <td>${escapeHtml(entry.time || '')}</td>
        <td>${escapeHtml(entry.actor || '')}</td>
        <td>${escapeHtml(entry.action || '')}</td>
        <td>${escapeHtml(entry.location || '')}</td>
      </tr>`).join('\n      ');

  return `<body>
  <div class="page">
    <div class="letterhead">
      <h1>${escapeHtml(artifactTitle)}</h1>
      <h2>${escapeHtml(caseName)}</h2>
    </div>
    <div class="meta"><div><span>מספר רישום:</span> LOG-${String(caseId).slice(-6)}</div></div>
    <table class="log">
      <thead><tr><th>שעה</th><th>גורם</th><th>פעולה</th><th>מיקום</th></tr></thead>
      <tbody>
      ${rows || `<tr><td colspan="4">${escapeHtml(evidence.description || '')}</td></tr>`}
      </tbody>
    </table>
    ${bodyText ? `<div class="content" style="margin-top:18px">${renderParagraphs(bodyText)}</div>` : ''}
    <div class="footer">רישום אוטומטי – מערכת בקרה</div>
  </div>
</body>`;
};

const renderInvoice = ({ caseName, documentData, artifactTitle, caseId }) => {
  const { bodyText = '', metaFields = {} } = documentData;
  const rows = Object.entries(metaFields)
    .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join('\n      ');

  return `<body>
  <div class="page">
    <div class="letterhead">
      <h1>${escapeHtml(artifactTitle)}</h1>
      <h2>${escapeHtml(caseName)}</h2>
    </div>
    <div class="meta"><div><span>מספר מסמך:</span> DOC-${String(caseId).slice(-6)}</div></div>
    <table class="log">
      <tbody>
      ${rows}
      </tbody>
    </table>
    <div class="content" style="margin-top:18px">${renderParagraphs(bodyText)}</div>
    <div class="footer">הופק אוטומטית</div>
  </div>
</body>`;
};

const renderEmail = ({ caseName, documentData, artifactTitle }) => {
  const { bodyText = '', metaFields = {}, title = '' } = documentData;
  return `<body>
  <div class="page">
    <div class="letterhead"><h1>${escapeHtml(artifactTitle)}</h1></div>
    <div class="email-header">
      <div><b>מאת:</b> ${escapeHtml(metaFields.from || metaFields['מאת'] || '')}</div>
      <div><b>אל:</b> ${escapeHtml(metaFields.to || metaFields['אל'] || '')}</div>
      <div><b>נושא:</b> ${escapeHtml(title || metaFields.subject || metaFields['נושא'] || '')}</div>
      <div><b>תאריך:</b> ${escapeHtml(metaFields.date || metaFields['תאריך'] || '')}</div>
    </div>
    <div class="content">${renderParagraphs(bodyText)}</div>
    <div class="footer">${escapeHtml(caseName)}</div>
  </div>
</body>`;
};

const ARTIFACT_TITLES = {
  official_report: 'מדינת ישראל • משטרת ישראל • יחידת חקירות',
  security_access_log: 'רישום גישה מאובטח',
  system_log: 'יומן מערכת',
  meeting_record: 'סיכום פגישה',
  medical_report: 'דו"ח רפואי',
  employee_record: 'תיק עובד',
  investigation_report: 'דו"ח חקירה',
  internal_memo: 'תזכיר פנימי',
  invoice: 'חשבונית',
  receipt: 'קבלה',
  printed_email: 'הודעת דוא"ל',
  old_fax: 'פקס',
  scanned_document: 'מסמך סרוק',
};

export const renderFormalDocumentHtml = ({ caseName, briefingDetails = {}, evidence = {}, caseId, artifactType, documentData = {} }) => {
  const layout = resolveArtifactLayout(artifactType);
  const artifactTitle = ARTIFACT_TITLES[artifactType] || ARTIFACT_TITLES.official_report;
  const ctx = { caseName, briefingDetails, evidence, caseId, documentData, artifactTitle };

  const bodyHtml = layout === 'log'
    ? renderLog(ctx)
    : layout === 'invoice'
      ? renderInvoice(ctx)
      : layout === 'email'
        ? renderEmail(ctx)
        : renderLetterhead(ctx);

  return {
    mimeType: 'text/html; charset=utf-8',
    extension: 'html',
    content: `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(caseName)} – ${escapeHtml(artifactTitle)}</title>
  <style>${BASE_STYLE}</style>
</head>
${bodyHtml}
${HEIGHT_REPORT_SCRIPT}
</html>`,
  };
};
