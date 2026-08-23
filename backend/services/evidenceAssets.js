import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { buildValidNameSet, DEFAULT_ARTIFACT_TYPE } from './evidenceBlueprint.js';
import { generateStructuredMessage } from './whatsappEvidence.js';
import { generateStructuredDocument } from './documentEvidence.js';
import { generateStructuredRecording } from './recordingEvidence.js';
import { renderRecordingWithAudio } from './recordingRenderer.js';
import { buildImagePrompt, generateFluxImage } from './fluxImage.js';

// Must match the same fixed anchor index.js uses for its static mount (see
// GENERATED_EVIDENCE_DIR there): process.cwd(), not __dirname. __dirname
// here resolves to backend/services when running from source but to
// backend/dist/services when running the compiled output (the nodemon dev
// pipeline), which would silently write files the static server can never
// find. npm always launches this app with backend/ as the working directory
// either way, so process.cwd() is the one path that's stable across both.
const GENERATED_EVIDENCE_ROOT = path.join(process.cwd(), 'generated-evidence');

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

// ── Helper: generate text content via AI ────────────────────────────────────

const generateAiText = async (systemPrompt, userPrompt) => {
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 1100, // structured JSON blueprints (messageData/documentData) need headroom beyond short freeform text
    temperature: 0.85,
  });
  return response.choices[0].message.content.trim();
};

// ── Renderers ────────────────────────────────────────────────────────────────
// Photo evidence no longer has a local renderer here — real images now come
// from NVIDIA FLUX via services/fluxImage.js (buildImagePrompt + generateFluxImage).

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
    html{scrollbar-width:thin;scrollbar-color:rgba(212,173,99,.7) rgba(255,255,255,.04)}
    ::-webkit-scrollbar{width:10px}
    ::-webkit-scrollbar-track{background:rgba(255,255,255,.04);border-radius:999px}
    ::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(212,173,99,.9),rgba(196,107,58,.9));border:2px solid rgba(17,13,11,.85);border-radius:999px}
    ::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#e2bb73,#cf7645)}
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
  ${HEIGHT_REPORT_SCRIPT}
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
    html{scrollbar-width:thin;scrollbar-color:rgba(212,173,99,.7) rgba(255,255,255,.04)}
    ::-webkit-scrollbar{width:10px}
    ::-webkit-scrollbar-track{background:rgba(255,255,255,.04);border-radius:999px}
    ::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(212,173,99,.9),rgba(196,107,58,.9));border:2px solid rgba(17,13,11,.85);border-radius:999px}
    ::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#e2bb73,#cf7645)}
    body{font-family:'Segoe UI',sans-serif;background:#0a1014;padding:24px}
    .phone{width:min(400px,100%);margin:0 auto;background:#111b21;border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)}
    .topbar{background:#1f2c34;padding:14px 18px;display:flex;align-items:center;gap:12px}
    .avatar{width:38px;height:38px;border-radius:50%;background:#2a3f4a;display:flex;align-items:center;justify-content:center;font-size:16px}
    .contact{color:#e9edef;font-size:14px;font-weight:600}
    .status{color:#8696a0;font-size:11px}
    .body{padding:12px 10px;display:flex;flex-direction:column;gap:6px;min-height:300px;max-height:420px;overflow-y:auto;background:#0b141a}
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
  ${HEIGHT_REPORT_SCRIPT}
</body>
</html>`;
};

const renderDocumentHtml = ({ caseName, briefingDetails, evidence, caseId, aiContent }) => {
  const sections = (aiContent || "").split(/\n{2,}/).filter(Boolean);
  const sectionsHtml = sections.map((s) => `<p>${escapeHtml(s)}</p>`).join("\n    ");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(caseName)} – מסמך חקירה</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html{scrollbar-width:thin;scrollbar-color:rgba(196,107,58,.6) rgba(0,0,0,.06)}
    ::-webkit-scrollbar{width:10px}
    ::-webkit-scrollbar-track{background:rgba(0,0,0,.06);border-radius:999px}
    ::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(212,173,99,.9),rgba(196,107,58,.9));border:2px solid rgba(250,247,240,.9);border-radius:999px}
    ::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,#e2bb73,#cf7645)}
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
    <div class="stamp">סודי ביותר</div>
    <div class="letterhead">
      <h1>מדינת ישראל  •  משטרת ישראל  •  יחידת חקירות</h1>
      <h2>${escapeHtml(caseName)}</h2>
    </div>
    <div class="meta">
      <div><span>מספר תיק:</span> OPS-${String(caseId).slice(-6)}</div>
      <div><span>מיקום:</span> ${escapeHtml(briefingDetails.incidentLocation || "לא צוין")}</div>
      <div><span>שעת אירוע:</span> ${escapeHtml(briefingDetails.incidentTime || "לא צוין")}</div>
      <div><span>נושא:</span> ${escapeHtml(evidence.description || "")}</div>
    </div>
    <div class="content">
      ${sectionsHtml}
    </div>
    <div class="footer">מסמך מסווג – אין להעביר ללא אישור מפורש  •  נוצר אוטומטית</div>
  </div>
  ${HEIGHT_REPORT_SCRIPT}
</body>
</html>`;
};

// ── AI prompt builders ───────────────────────────────────────────────────────

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



const generateAssetForEvidence = async ({ caseId, caseName, briefingDetails, suspects, evidence, index, difficulty, solution }) => {
  const caseDir = path.join(GENERATED_EVIDENCE_ROOT, `${caseId}`);
  await ensureDirectory(caseDir);

  const fileBase = `${String(index + 1).padStart(2, '0')}-${sanitizeFileSegment(evidence.type)}-${sanitizeFileSegment(caseName)}`;

  if (evidence.type === 'photo') {
    const prompt = buildImagePrompt(evidence, suspects, { caseName, briefingDetails });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🖼️  FLUX prompt [${evidence.type} #${index + 1}]:`, prompt);
    }
    const { buffer, mimeType, extension } = await generateFluxImage(prompt);
    const filename = `${fileBase}.${extension}`;
    await fs.writeFile(path.join(caseDir, filename), buffer);
    return buildAssetEnvelope(evidence, filename, mimeType, 'photo', { caseId });
  }

  if (evidence.type === 'recording') {
    const validNameSet = buildValidNameSet(suspects);
    const structured = await generateStructuredRecording({
      generateAiText, evidence, suspects, briefingDetails, difficulty, solution, validNameSet,
    }).catch((err) => {
      console.error(`⚠️ Structured recording (ElevenLabs TTS) failed for evidence #${index + 1}, falling back to transcript-only:`, err.message);
      return null;
    });

    if (structured) {
      const audioFilename = `${fileBase}.${structured.audio.extension}`;
      const htmlFilename = `${fileBase}.html`;
      await fs.writeFile(path.join(caseDir, audioFilename), structured.audio.buffer);
      await fs.writeFile(
        path.join(caseDir, htmlFilename),
        renderRecordingWithAudio({
          caseName,
          evidence,
          turns: structured.recordingData.turns,
          audioFilename,
          durationSeconds: structured.audio.durationSeconds,
        }),
        'utf8',
      );
      return buildAssetEnvelope(evidence, htmlFilename, 'text/html; charset=utf-8', 'recording', {
        caseId,
        assetTranscript: structured.transcript,
        recordingData: structured.recordingData,
      });
    }

    // Fallback: pre-existing generic transcript-only renderer (no real audio yet,
    // but the player never loses the textual evidence just because TTS failed).
    const { system, user } = buildRecordingPrompt({ evidence, suspects, briefingDetails });
    const transcript = await generateAiText(system, user);
    const filename = `${fileBase}.html`;
    await fs.writeFile(path.join(caseDir, filename), renderRecordingHtml({ caseName, evidence, transcript, suspects }), 'utf8');
    return buildAssetEnvelope(evidence, filename, 'text/html; charset=utf-8', 'recording', { caseId, assetTranscript: transcript });
  }

  if (evidence.type === 'message') {
    const validNameSet = buildValidNameSet(suspects);
    const structured = await generateStructuredMessage({
      generateAiText, evidence, suspects, briefingDetails, validNameSet, caseName,
    }).catch(() => null);

    if (structured) {
      const filename = `${fileBase}.${structured.rendered.extension}`;
      await fs.writeFile(path.join(caseDir, filename), structured.rendered.content, 'utf8');
      return buildAssetEnvelope(evidence, filename, structured.rendered.mimeType, 'message', {
        caseId,
        messageData: structured.messageData,
      });
    }

    // Fallback: pre-existing generic freeform renderer (safe default, no name-identity risk).
    const { system, user } = buildMessagePrompt({ evidence, suspects });
    const aiMessages = await generateAiText(system, user);
    const filename = `${fileBase}.html`;
    await fs.writeFile(path.join(caseDir, filename), renderMessageHtml({ caseName, evidence, aiMessages, suspects }), 'utf8');
    return buildAssetEnvelope(evidence, filename, 'text/html; charset=utf-8', 'message', { caseId });
  }

  if (evidence.type === 'document') {
    const validNameSet = buildValidNameSet(suspects);
    const artifactType = evidence.artifactType || DEFAULT_ARTIFACT_TYPE;
    const structured = await generateStructuredDocument({
      generateAiText, caseName, briefingDetails, evidence, artifactType, validNameSet, suspects, caseId,
    }).catch(() => null);

    if (structured) {
      const filename = `${fileBase}.${structured.rendered.extension}`;
      await fs.writeFile(path.join(caseDir, filename), structured.rendered.content, 'utf8');
      return buildAssetEnvelope(evidence, filename, structured.rendered.mimeType, 'document', {
        caseId,
        artifactType,
        documentData: structured.documentData,
      });
    }

    // Fallback: pre-existing generic official-report renderer (safe default, no name-identity risk).
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

export const generateEvidenceAssets = async ({ caseId, caseName, briefingDetails = {}, suspects = [], evidence = [], difficulty, solution }) => {
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
        difficulty,
        solution,
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
