import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '..');
const GENERATED_EVIDENCE_ROOT = path.join(BACKEND_ROOT, 'generated-evidence');

const escapeHtml = (value = '') => `${value}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const sanitizeFileSegment = (value = '') => `${value}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'asset';

const ensureDirectory = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const buildPublicFileUrl = (caseId, filename) => `/generated-evidence/${caseId}/${filename}`;

const buildAssetEnvelope = (evidence, filename, mimeType, assetType, extra = {}) => ({
  ...evidence,
  fileUrl: buildPublicFileUrl(extra.caseId, filename),
  mimeType,
  assetType,
  assetStatus: 'ready',
  assetGeneratedAt: new Date(),
  ...extra,
});

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const AI_MODEL = 'meta/llama-3.3-70b-instruct';

// ג”€ג”€ Helper: generate text content via AI ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const generateAiText = async (systemPrompt, userPrompt) => {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 500,
    temperature: 0.85,
  });
  return response.choices[0].message.content.trim();
};

// ג”€ג”€ Renderers ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const renderPhotoSvg = ({ briefingDetails, evidence, index, aiLines }) => {
  const scene = briefingDetails.incidentLocation || '׳–׳™׳¨׳× ׳”׳׳™׳¨׳•׳¢';
  const time = briefingDetails.incidentTime || '';
  const lines = (aiLines || [evidence.description || '', evidence.hiddenClue || '']).filter(Boolean);

  const lineElements = lines.map((line, i) => (
    `<text x="64" y="${390 + i * 36}" fill="#e8dfd0" font-size="15"
      font-family="'Segoe UI',Arial,sans-serif" text-anchor="end"
      transform="scale(-1,1) translate(-1216,0)">${escapeHtml(line.slice(0, 90))}</text>`
  )).join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1216" height="720" viewBox="0 0 1216 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0e12"/>
      <stop offset="100%" stop-color="#1c1508"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feBlend in="SourceGraphic" mode="multiply" result="blend"/>
      <feComposite in="blend" in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>
  <rect width="1216" height="720" fill="url(#bg)"/>
  <rect width="1216" height="720" fill="url(#bg)" filter="url(#grain)" opacity="0.18"/>

  <!-- top bar -->
  <rect x="0" y="0" width="1216" height="52" fill="#0f1318" opacity="0.9"/>
  <rect x="0" y="52" width="1216" height="2" fill="#8a6238" opacity="0.7"/>
  <text x="24" y="34" fill="#d7aa66" font-size="11" font-family="monospace" letter-spacing="3">FORENSIC EVIDENCE  ג€¢  PHOTO ${String(index + 1).padStart(2,'0')}  ג€¢  CLASSIFIED</text>
  <text x="1192" y="34" fill="#8a6238" font-size="11" font-family="monospace" text-anchor="end">${escapeHtml(time)}</text>

  <!-- main frame -->
  <rect x="40" y="76" width="760" height="570" rx="4" fill="#111820" stroke="#4a3520" stroke-width="1.5"/>
  <!-- inner scan lines -->
  <rect x="40" y="76" width="760" height="570" rx="4" fill="none" stroke="#d7aa66" stroke-width="0.5" opacity="0.15"/>

  <!-- evidence marker crosses -->
  <line x1="420" y1="260" x2="420" y2="300" stroke="#ff4444" stroke-width="1.5"/>
  <line x1="400" y1="280" x2="440" y2="280" stroke="#ff4444" stroke-width="1.5"/>
  <circle cx="420" cy="280" r="18" fill="none" stroke="#ff4444" stroke-width="1.2" opacity="0.7"/>

  <line x1="240" y1="420" x2="240" y2="460" stroke="#ffaa00" stroke-width="1.5"/>
  <line x1="220" y1="440" x2="260" y2="440" stroke="#ffaa00" stroke-width="1.5"/>
  <circle cx="240" cy="440" r="14" fill="none" stroke="#ffaa00" stroke-width="1.2" opacity="0.6"/>

  <!-- scene label -->
  <text x="56" y="108" fill="#d7aa66" font-size="13" font-family="monospace" letter-spacing="1" opacity="0.9">${escapeHtml(scene)}</text>

  <!-- AI-generated observation lines -->
  ${lineElements}

  <!-- bottom bar inside frame -->
  <rect x="40" y="614" width="760" height="32" fill="#0a0e12" opacity="0.85"/>
  <text x="56" y="634" fill="#6a7a8a" font-size="10" font-family="monospace">IMG-${String(index + 1).padStart(4,'0')} ג€¢ AUTO-ENHANCED ג€¢ DO NOT DISTRIBUTE</text>

  <!-- right panel -->
  <rect x="820" y="76" width="356" height="570" rx="4" fill="#0d1117" stroke="#2a2218" stroke-width="1"/>
  <rect x="836" y="96" width="324" height="2" fill="#8a6238" opacity="0.5"/>
  <text x="998" y="88" fill="#8a6238" font-size="10" font-family="monospace" text-anchor="middle" letter-spacing="2">FIELD NOTES</text>
  <text x="998" y="140" fill="#c0a070" font-size="12" font-family="'Segoe UI',Arial,sans-serif" text-anchor="middle">${escapeHtml((evidence.description || '').slice(0,45))}</text>
  <rect x="836" y="155" width="324" height="1" fill="#3a2e1e" opacity="0.8"/>
  <text x="998" y="190" fill="#6a7a6a" font-size="10" font-family="monospace" text-anchor="middle" letter-spacing="1">HIDDEN DETAIL</text>
  <text x="998" y="216" fill="#a09060" font-size="11" font-family="'Segoe UI',Arial,sans-serif" text-anchor="middle">${escapeHtml((evidence.hiddenClue || '').slice(0,48))}</text>
</svg>`;
};

const renderRecordingHtml = ({ caseName, evidence, transcript, suspects }) => {
  const lines = transcript.split('\n').filter(Boolean);
  const speakerA = suspects[0]?.name || 'קול א';
  const speakerB = suspects[1]?.name || 'קול ב';

  // Parse [שם]: text format from AI, fall back to alternating
  const rows = lines.map((line, i) => {
    const match = line.match(/^\[([^\]]+)\]:\s*(.*)/);
    const speaker = match ? match[1] : (i % 2 === 0 ? speakerA : speakerB);
    const text = match ? match[2] : line;
    const isA = !match ? i % 2 === 0 : (line.indexOf(speakerA) >= 0 || i % 2 === 0);
    const spkClass = isA ? 'spk-a' : 'spk-b';
    const secs = i * 17;
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    return `<div class="row">
        <div class="ts">${mm}:${ss}</div>
        <div class="content">
          <div class="spk ${spkClass}">${escapeHtml(speaker)}</div>
          <div class="text">${escapeHtml(text)}</div>
        </div>
      </div>`;
  }).join('\n');

  // Waveform bars (static decorative SVG)
  const barHeights = [8,14,22,18,30,12,26,20,10,28,16,24,8,20,14,32,10,18,26,12,22,16,8,30,20,14];
  const bars = barHeights.map((h, i) => {
    const x = 4 + i * 15;
    const y = 36 - h;
    return `<rect x="${x}" y="${y}" width="10" height="${h}" rx="2" fill="#c07030" opacity="${0.4 + (h / 80)}"/>`;
  }).join('');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>תמלול הקלטה — ${escapeHtml(caseName)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',Consolas,monospace;background:#0c0800;color:#c8b060;min-height:100vh}
    .top-bar{background:#1a0800;border-bottom:2px solid #7a3000;padding:10px 20px;display:flex;justify-content:space-between;align-items:center}
    .top-label{font-size:10px;letter-spacing:4px;color:#c03000;text-transform:uppercase}
    .top-id{font-size:10px;letter-spacing:2px;color:#4a3010}
    .wave-area{background:#0a0500;border-bottom:1px solid #3a1800;padding:14px 20px;display:flex;align-items:center;gap:16px}
    .play-btn{width:40px;height:40px;border-radius:50%;background:#2a1000;border:1px solid #7a3000;display:flex;align-items:center;justify-content:center;color:#c07030;font-size:18px;flex-shrink:0}
    .wave-info{display:flex;flex-direction:column;gap:4px}
    .wave-status{font-size:9px;letter-spacing:3px;color:#c03000}
    .wave-dur{font-size:10px;color:#4a3010}
    .meta{padding:14px 20px;border-bottom:1px solid #2a1000;background:#080400;font-size:11px;color:#7a5020;line-height:2}
    .meta b{color:#a07030;margin-left:8px}
    .transcript-hdr{padding:10px 20px;font-size:9px;letter-spacing:4px;color:#3a2008;background:#060300;border-bottom:1px solid #150a00}
    .row{display:grid;grid-template-columns:52px 1fr;border-bottom:1px solid #120800}
    .row:nth-child(even){background:#070401}
    .ts{padding:14px 8px;font-size:10px;color:#3a2408;border-left:1px solid #1a0c00;text-align:center;font-variant-numeric:tabular-nums}
    .content{padding:12px 16px}
    .spk{font-size:9px;letter-spacing:2px;margin-bottom:4px;text-transform:uppercase}
    .spk-a{color:#c07030}
    .spk-b{color:#4a8aaa}
    .text{font-size:13px;color:#c8c0a0;line-height:1.6}
    .footer{padding:12px 20px;border-top:2px solid #2a1000;background:#060300;font-size:9px;letter-spacing:2px;color:#2a1808;display:flex;justify-content:space-between}
  </style>
</head>
<body>
  <div class="top-bar">
    <span class="top-label">⬤ הקלטה מיורטת — סודי ביותר</span>
    <span class="top-id">AUDIO-INTERCEPT · תמלול</span>
  </div>
  <div class="wave-area">
    <div class="play-btn">▶</div>
    <svg width="390" height="40" viewBox="0 0 390 40">${bars}</svg>
    <div class="wave-info">
      <div class="wave-status">▐▐ PLAYBACK UNAVAILABLE</div>
      <div class="wave-dur">קובץ שמע — גישה מוגבלת</div>
    </div>
  </div>
  <div class="meta">
    <div><b>תיק:</b> ${escapeHtml(caseName)}</div>
    <div><b>תיאור:</b> ${escapeHtml(evidence.description || '')}</div>
  </div>
  <div class="transcript-hdr">▶ תמלול שיחה</div>
  ${rows}
  <div class="footer">
    <span>הקובץ מוגן — שימוש פנימי בלבד</span>
    <span>OPS-INTEL · UNIT 7</span>
  </div>
</body>
</html>`;
};

const renderMessageHtml = ({ caseName, evidence, aiMessages, suspects }) => {
  const lines = (aiMessages || '').split('\n').filter(Boolean);
  const nameA = suspects?.[0]?.name || '';
  const nameB = suspects?.[1]?.name || '';

  const bubbles = lines.map((line, i) => {
    const match = line.match(/^\[([^\]]+)\]:\s*(.*)/);
    const sender = match ? match[1] : (i % 2 === 0 ? nameA : nameB);
    const text = match ? match[2] : line;
    // First speaker = "other" (left), second = "self" (right, green)
    const isFirst = match ? (sender === nameA || (!nameA && i % 2 === 0)) : i % 2 === 0;
    const cls = isFirst ? 'bubble--other' : 'bubble--self';
    return `<div class="bubble ${cls}"><span class="sender">${escapeHtml(sender)}</span>${escapeHtml(text)}</div>`;
  }).join('\n      ');

  const contactName = nameB || nameA || '???';

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(caseName)} — שיחת WhatsApp</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',sans-serif;background:#0a1014;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .phone{width:min(400px,100%);background:#111b21;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
    .topbar{background:#1f2c34;padding:14px 18px;display:flex;align-items:center;gap:12px}
    .avatar{width:38px;height:38px;border-radius:50%;background:#2a3f4a;display:flex;align-items:center;justify-content:center;font-size:16px}
    .contact{color:#e9edef;font-size:14px;font-weight:600}
    .status{color:#8696a0;font-size:11px}
    .body{padding:12px 10px;display:flex;flex-direction:column;gap:6px;min-height:300px;background:#0b141a}
    .bubble{padding:8px 12px;border-radius:10px;max-width:82%;font-size:14px;line-height:1.45;color:#e9edef}
    .bubble--other{background:#202c33;align-self:flex-start;border-bottom-right-radius:4px}
    .bubble--self{background:#005c4b;align-self:flex-end;border-bottom-left-radius:4px}
    .sender{display:block;font-size:10px;color:#8696a0;margin-bottom:2px;letter-spacing:0.5px}
    .bubble--self .sender{text-align:left}
    .time{font-size:10px;color:#8696a0;display:block;margin-top:3px;text-align:left}
  </style>
</head>
<body>
  <div class="phone">
    <div class="topbar">
      <div class="avatar">💬</div>
      <div>
        <div class="contact">${escapeHtml(contactName)}</div>
        <div class="status">מוצפן מקצה לקצה</div>
      </div>
    </div>
    <div class="body">
      ${bubbles}
    </div>
  </div>
</body>
</html>`;
};

const renderDocumentHtml = ({ caseName, briefingDetails, evidence, caseId, aiContent }) => {
  const sections = (aiContent || '').split(/\n{2,}/).filter(Boolean);
  const sectionsHtml = sections.map((s) => `<p>${escapeHtml(s)}</p>`).join('\n    ');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(caseName)} ג€“ ׳׳¡׳׳ ׳—׳§׳™׳¨׳”</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',monospace;background:#f5f0e8;color:#1a1208;padding:40px 20px;min-height:100vh}
    .page{max-width:740px;margin:0 auto;background:#faf7f0;border:1px solid #c8b88a;box-shadow:4px 4px 20px rgba(0,0,0,.2);padding:50px 60px;position:relative}
    .stamp{position:absolute;top:32px;left:40px;border:3px solid #aa1111;color:#aa1111;font-size:22px;font-weight:bold;padding:6px 14px;border-radius:4px;transform:rotate(-12deg);opacity:.75;letter-spacing:2px}
    .letterhead{text-align:center;border-bottom:2px solid #8a6a30;padding-bottom:18px;margin-bottom:24px}
    .letterhead h1{font-size:13px;letter-spacing:3px;color:#5a4020;margin-bottom:6px}
    .letterhead h2{font-size:18px;color:#1a1208}
    .meta{font-size:11px;color:#7a6040;margin-bottom:20px;line-height:1.8}
    .meta span{display:inline-block;min-width:120px;font-weight:bold}
    .content p{font-size:13px;line-height:1.9;margin-bottom:14px;text-align:justify}
    .footer{margin-top:32px;border-top:1px solid #c8b88a;padding-top:14px;font-size:10px;color:#9a8060;text-align:center;letter-spacing:1px}
  </style>
</head>
<body>
  <div class="page">
    <div class="stamp">׳¡׳•׳“׳™ ׳‘׳™׳•׳×׳¨</div>
    <div class="letterhead">
      <h1>׳׳“׳™׳ ׳× ׳™׳©׳¨׳׳  ג€¢  ׳׳©׳˜׳¨׳× ׳™׳©׳¨׳׳  ג€¢  ׳׳—׳׳§׳× ׳—׳§׳™׳¨׳•׳×</h1>
      <h2>${escapeHtml(caseName)}</h2>
    </div>
    <div class="meta">
      <div><span>׳׳¡׳₪׳¨ ׳×׳™׳§:</span> OPS-${String(caseId).slice(-6)}</div>
      <div><span>׳׳™׳§׳•׳:</span> ${escapeHtml(briefingDetails.incidentLocation || '׳׳ ׳¦׳•׳™׳')}</div>
      <div><span>׳©׳¢׳× ׳׳™׳¨׳•׳¢:</span> ${escapeHtml(briefingDetails.incidentTime || '׳׳ ׳¦׳•׳™׳')}</div>
      <div><span>׳ ׳•׳©׳:</span> ${escapeHtml(evidence.description || '')}</div>
    </div>
    <div class="content">
      ${sectionsHtml}
    </div>
    <div class="footer">׳׳¡׳׳ ׳׳¡׳•׳•׳’ ג€“ ׳—׳ ׳׳™׳¡׳•׳¨ ׳¢׳ ׳”׳¢׳‘׳¨׳” ׳׳׳ ׳׳™׳©׳•׳¨ ׳׳₪׳•׳¨׳© ג€¢ ׳ ׳•׳¦׳¨ ׳׳•׳˜׳•׳׳˜׳™׳×</div>
  </div>
</body>
</html>`;
};

// ג”€ג”€ AI prompt builders ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const buildPhotoPrompt = ({ briefingDetails, evidence }) => ({
  system: 'אתה חוקר פלילי שכותב תצפיות מקצועיות על תמונות זירת פשע. כתוב בעברית קצרה ועניינית.',
  user: `כתוב 4 תצפיות קצרות ומדויקות (כל אחת בשורה נפרדת) שניתן לראות בצילום זירת פשע.
מיקום: ${briefingDetails.incidentLocation || 'זירה לא ידועה'}.
שעה: ${briefingDetails.incidentTime || 'לא ידוע'}.
ראיה: ${evidence.description || ''}.
רמז נסתר: ${evidence.hiddenClue || ''}.
רשום רק 4 שורות, ללא מספור, כל אחת תיאור תצפית קצר.`,
});

const buildRecordingPrompt = ({ evidence, suspects, briefingDetails }) => {
  const nameA = suspects[0]?.name || 'קול א';
  const nameB = suspects[1]?.name || 'קול ב';
  return {
    system: `אתה מערכת כתיבה יוצרת עבור משחק בלשים. עליך לכתוב תמלול של שיחה מיורטת.
כלל ברזל: כתוב אך ורק את שורות הדיאלוג עצמן, לא הסברים ולא תיאורים.
הפורמט הוא: [שם]: טקסט. שום דבר אחר.`,
    user: `כתוב תמלול שיחה טלפונית מיורטת בין ${nameA} ל${nameB}.
רקע: ${evidence.description || 'שיחה חשודה'}.
הרמז הנסתר שחייב להופיע בצורה עדינה בשיחה: ${evidence.hiddenClue || ''}.
מיקום ושעה: ${briefingDetails.incidentLocation || ''} ${briefingDetails.incidentTime || ''}.

כתוב בדיוק 7 שורות, פורמט מחייב:
[${nameA}]: משפט קצר
[${nameB}]: משפט קצר
[${nameA}]: משפט קצר
[${nameB}]: משפט קצר
[${nameA}]: משפט קצר
[${nameB}]: משפט קצר
[${nameA}]: משפט קצר

כתוב עכשיו — רק 7 שורות דיאלוג, ללא מבוא ולא הסברים:`,
  };
};

const buildMessagePrompt = ({ evidence, suspects }) => {
  const nameA = suspects[0]?.name || 'א';
  const nameB = suspects[1]?.name || 'ב';
  return {
    system: `אתה כותב הודעות ווטסאפ אמיתיות לצורך משחק בלשים.
כלל ברזל: כתוב אך ורק את הודעות הצ׳אט עצמן, לא הסברים ולא תיאורים.`,
    user: `כתוב שיחת ווטסאפ קצרה בין ${nameA} ל${nameB}.
נושא: ${evidence.description || 'עניין חשוד'}.
רמז נסתר שחייב להופיע בצורה עדינה: ${evidence.hiddenClue || ''}.

כתוב בדיוק 6 הודעות, פורמט מחייב:
[${nameA}]: הודעה קצרה
[${nameB}]: הודעה קצרה
[${nameA}]: הודעה קצרה
[${nameB}]: הודעה קצרה
[${nameA}]: הודעה קצרה
[${nameB}]: הודעה קצרה

כתוב עכשיו — רק 6 הודעות, ללא מבוא ולא הסברים:`,
  };
};

const buildDocumentPrompt = ({ caseName, briefingDetails, evidence, caseId }) => ({
  system: 'אתה כותב מסמכי חקירה פנימיים רשמיים של משטרת ישראל. השפה פורמלית ומדויקת בעברית.',
  user: `כתוב מסמך חקירה פנימי רשמי עבור התיק "${caseName}".
מיקום: ${briefingDetails.incidentLocation || ''}, שעה: ${briefingDetails.incidentTime || ''}.
נושא הראיה: ${evidence.description || ''}.
פרט נסתר: ${evidence.hiddenClue || ''}.
כלול: (1) רקע קצר, (2) ממצאים ראשוניים, (3) הערות חוקר. הפרד כל חלק בשורה ריקה. בלי כותרות.`,
});



const generateAssetForEvidence = async ({ caseId, caseName, briefingDetails, suspects, evidence, index }) => {
  const caseDir = path.join(GENERATED_EVIDENCE_ROOT, `${caseId}`);
  await ensureDirectory(caseDir);

  const fileBase = `${String(index + 1).padStart(2, '0')}-${sanitizeFileSegment(evidence.type)}-${sanitizeFileSegment(caseName)}`;

  if (evidence.type === 'photo') {
    const { system, user } = buildPhotoPrompt({ briefingDetails, evidence });
    const aiText = await generateAiText(system, user);
    const aiLines = aiText.split('\n').filter(Boolean).slice(0, 5);
    const filename = `${fileBase}.svg`;
    await fs.writeFile(path.join(caseDir, filename), renderPhotoSvg({ briefingDetails, evidence, index, aiLines }), 'utf8');
    return buildAssetEnvelope(evidence, filename, 'image/svg+xml', 'photo', { caseId });
  }

  if (evidence.type === 'recording') {
    const { system, user } = buildRecordingPrompt({ evidence, suspects, briefingDetails });
    const transcript = await generateAiText(system, user);
    const filename = `${fileBase}.html`;
    await fs.writeFile(path.join(caseDir, filename), renderRecordingHtml({ caseName, evidence, transcript, suspects }), 'utf8');
    return buildAssetEnvelope(evidence, filename, 'text/html; charset=utf-8', 'recording', { caseId, assetTranscript: transcript });
  }

  if (evidence.type === 'message') {
    const { system, user } = buildMessagePrompt({ evidence });
    const aiMessages = await generateAiText(system, user);
    const filename = `${fileBase}.html`;
    await fs.writeFile(path.join(caseDir, filename), renderMessageHtml({ caseName, evidence, aiMessages }), 'utf8');
    return buildAssetEnvelope(evidence, filename, 'text/html; charset=utf-8', 'message', { caseId });
  }

  if (evidence.type === 'document') {
    const { system, user } = buildDocumentPrompt({ caseName, briefingDetails, evidence, caseId });
    const aiContent = await generateAiText(system, user);
    const filename = `${fileBase}.html`;
    await fs.writeFile(path.join(caseDir, filename), renderDocumentHtml({ caseName, briefingDetails, evidence, caseId, aiContent }), 'utf8');
    return buildAssetEnvelope(evidence, filename, 'text/html; charset=utf-8', 'document', { caseId });
  }

  return {
    ...evidence,
    assetStatus: 'missing',
  };
};

export const generateEvidenceAssets = async ({ caseId, caseName, briefingDetails = {}, suspects = [], evidence = [] }) => {
  await ensureDirectory(GENERATED_EVIDENCE_ROOT);

  const generatedEvidence = [];

  for (let index = 0; index < evidence.length; index += 1) {
    try {
      const generated = await generateAssetForEvidence({
        caseId,
        caseName,
        briefingDetails,
        suspects,
        evidence: evidence[index],
        index,
      });
      generatedEvidence.push(generated);
    } catch (error) {
      generatedEvidence.push({
        ...evidence[index],
        assetStatus: 'missing',
        assetError: error.message,
      });
    }
  }

  return generatedEvidence;
};
