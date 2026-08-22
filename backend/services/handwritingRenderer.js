// services/handwritingRenderer.js
//
// Renders a "handwritten physical document" evidence artifact from fully
// structured data (documentData + writingProfile). This is an MVP,
// CSS-only visual approximation — it deliberately does NOT depend on
// finding/installing an external Hebrew handwriting webfont; it only
// uses the OS/browser's own Hebrew-capable system fonts and simulates a
// handwritten feel with per-line jitter, ink color, paper texture and
// physical wear.
//
// ── Renderer contract (keep stable when swapping in FLUX later) ────────
// renderHandwrittenArtifact({ documentData, writingProfile, evidence, caseName })
//   → { content: string, mimeType: string, extension: string }
//
// Every piece of information a future image-generation renderer would
// need (who wrote it, their writing characteristics, paper/ink/physical
// condition, corrections, signature, stamp) already lives in
// documentData/writingProfile — nothing here derives new facts. To swap
// this renderer for a FLUX-based one later, replace the body of this
// function (e.g. build an image prompt from the same documentData and
// return a PNG buffer + 'image/png' + 'png') without touching the schema,
// the AI generation step, or the caller in documentEvidence.js.

const escapeHtml = (value = '') => `${value}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const INK_COLORS = {
  'כחול': '#1a3a8f',
  'שחור': '#161616',
  'אדום': '#8f1a1a',
  'blue': '#1a3a8f',
  'black': '#161616',
  'red': '#8f1a1a',
};

const resolveInkColor = (inkColor = '') => {
  const key = Object.keys(INK_COLORS).find((candidate) => inkColor.includes(candidate));
  return key ? INK_COLORS[key] : '#1a3a8f';
};

const PRESSURE_WEIGHT = { 'קלה': 300, 'בינונית': 400, 'חזקה': 600 };
const SPACING_LETTER = { 'צפופה': '0px', 'רגילה': '0.5px', 'מרווחת': '1.6px' };

const isLinedPaper = (paperType = '') => /פנקס|שורות|מחברת|lined/i.test(paperType);
const isTorn = (paperCondition = '') => /קרוע|torn/i.test(paperCondition);
const isFolded = (paperCondition = '') => /מקופל|קפל|fold/i.test(paperCondition);
const isStained = (paperCondition = '') => /כתם|stain/i.test(paperCondition);

// Deterministic per-line jitter so re-rendering the same document looks the
// same, and different writers "feel" different (seed comes from name hash).
const jitterForLine = (seed, index) => {
  const n = Math.sin(seed + index * 12.9898) * 43758.5453;
  const frac = n - Math.floor(n);
  return {
    rotate: ((frac - 0.5) * 2.4).toFixed(2), // -1.2deg .. 1.2deg
    shiftY: ((frac - 0.5) * 4).toFixed(1), // -2px .. 2px
  };
};

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

const renderBodyLines = (bodyText = '', corrections = [], seed) => bodyText
  .split(/\n+/)
  .filter((line) => line.trim().length > 0)
  .map((line, index) => {
    const { rotate, shiftY } = jitterForLine(seed, index);
    const html = applyCorrections(line, corrections);
    return `<p class="line" style="transform:rotate(${rotate}deg) translateY(${shiftY}px)">${html}</p>`;
  })
  .join('\n      ');

export const renderHandwrittenArtifact = ({ documentData = {}, writingProfile = {}, evidence = {}, caseName = '' }) => {
  const {
    writer = '',
    title = '',
    bodyText = evidence.description || '',
    corrections = [],
    hasSignature = false,
    signatureText = writer,
    hasStamp = false,
    stampText = '',
    paperType = 'דף רגיל',
    paperCondition = '',
    inkColor = 'כחול',
  } = documentData;

  const seed = writer
    ? writer.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    : bodyText.length;

  const ink = resolveInkColor(inkColor);
  const weight = PRESSURE_WEIGHT[writingProfile.pressure] || 400;
  const letterSpacing = SPACING_LETTER[writingProfile.spacing] || '0.5px';
  const fontSize = writingProfile.style?.includes('גדול') ? '20px' : writingProfile.style?.includes('קטן') ? '15px' : '17px';
  const rotatePage = (((seed % 5) - 2) * 0.6).toFixed(2);

  const linedBg = isLinedPaper(paperType)
    ? 'repeating-linear-gradient(#f6efd9 0px, #f6efd9 31px, #cfc6a3 32px, #f6efd9 33px)'
    : '#f6efd9';

  const foldStyle = isFolded(paperCondition)
    ? 'box-shadow: inset 0 0 0 1px rgba(0,0,0,.05), 0 40% 0 -39% rgba(0,0,0,.12) inset;'
    : '';

  const stainHtml = isStained(paperCondition)
    ? '<div class="stain"></div>'
    : '';

  const tornClass = isTorn(paperCondition) ? 'torn' : '';

  return {
    mimeType: 'text/html; charset=utf-8',
    extension: 'html',
    content: `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(caseName)} — מסמך בכתב יד</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#12100c;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;font-family:'Segoe UI',Arial,sans-serif}
    .scan-frame{background:#0a0906;padding:18px;border-radius:6px;box-shadow:0 30px 70px rgba(0,0,0,.55)}
    .page{
      position:relative;
      width:min(520px,88vw);
      min-height:640px;
      background:${linedBg};
      padding:46px 40px;
      transform:rotate(${rotatePage}deg);
      box-shadow:2px 4px 18px rgba(0,0,0,.35), inset 0 0 40px rgba(120,100,60,.08);
      ${foldStyle}
    }
    .page.torn{clip-path:polygon(0 0,100% 0,100% 96%,97% 100%,94% 96%,91% 100%,88% 96%,85% 100%,82% 96%,79% 100%,76% 96%,73% 100%,70% 96%,67% 100%,64% 96%,61% 100%,58% 96%,55% 100%,52% 96%,49% 100%,46% 96%,43% 100%,40% 96%,37% 100%,34% 96%,31% 100%,28% 96%,25% 100%,22% 96%,19% 100%,16% 96%,13% 100%,10% 96%,7% 100%,4% 96%,0 100%)}
    .stain{position:absolute;width:70px;height:56px;border-radius:50%;background:radial-gradient(circle,rgba(120,90,40,.16),transparent 70%);top:60%;left:12%;transform:rotate(12deg)}
    .title{color:${ink};font-weight:700;font-size:19px;margin-bottom:18px;letter-spacing:.5px;opacity:.92}
    .content{color:${ink};font-weight:${weight};font-size:${fontSize};letter-spacing:${letterSpacing};line-height:2.15}
    .line{display:block}
    .crossed{text-decoration:line-through;text-decoration-thickness:2px;opacity:.55}
    .signature{margin-top:40px;text-align:start;color:${ink};font-size:22px;font-style:italic;opacity:.85;transform:rotate(-2deg)}
    .signature-line{width:160px;border-top:1px solid ${ink};opacity:.4;margin-bottom:6px}
    .stamp{position:absolute;bottom:34px;left:36px;border:3px solid #aa1111;color:#aa1111;font-size:14px;font-weight:bold;padding:5px 10px;border-radius:4px;transform:rotate(-10deg);opacity:.7;letter-spacing:1px}
    .meta{position:absolute;top:10px;left:14px;font-size:9px;font-family:monospace;color:#6a5a3a;opacity:.55;letter-spacing:2px}
  </style>
</head>
<body>
  <div class="scan-frame">
    <div class="page ${tornClass}">
      <div class="meta">EVIDENCE • ${escapeHtml(paperType)} ${paperCondition ? '• ' + escapeHtml(paperCondition) : ''}</div>
      ${stainHtml}
      ${title ? `<div class="title">${escapeHtml(title)}</div>` : ''}
      <div class="content">
        ${renderBodyLines(bodyText, corrections, seed)}
      </div>
      ${hasSignature ? `<div class="signature"><div class="signature-line"></div>${escapeHtml(signatureText || writer)}</div>` : ''}
      ${hasStamp && stampText ? `<div class="stamp">${escapeHtml(stampText)}</div>` : ''}
    </div>
  </div>
</body>
</html>`,
  };
};
