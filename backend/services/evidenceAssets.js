import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

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

const resolvePdfFontPath = async () => {
  const candidates = [
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/seguiemj.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep searching
    }
  }

  return null;
};

const writePdfDocument = async ({ filePath, caseName, briefingDetails, evidence, caseId }) => {
  const fontPath = await resolvePdfFontPath();

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      info: {
        Title: `${caseName} report`,
        Author: 'Investigation Game',
      },
    });
    const stream = createWriteStream(filePath);

    doc.pipe(stream);

    if (fontPath) {
      doc.font(fontPath);
    }

    const writeSection = (title, value) => {
      doc.moveDown(0.7);
      doc.fontSize(14).fillColor('#6f4928').text(title, { align: 'right' });
      doc.moveDown(0.25);
      doc.fontSize(11).fillColor('#2c221b').text(value || '-', { align: 'right' });
    };

    doc.fillColor('#8a6238').fontSize(11).text('INTERNAL FIELD REPORT', { align: 'right' });
    doc.moveDown(0.4);
    doc.fillColor('#2c221b').fontSize(22).text(caseName, { align: 'right' });
    doc.moveDown(0.8);
    doc.fontSize(11).text(`מספר תיק: ${caseId}`, { align: 'right' });
    doc.text(`שעת אירוע: ${briefingDetails.incidentTime || 'לא צוין'}`, { align: 'right' });
    doc.text(`מיקום: ${briefingDetails.incidentLocation || 'לא צוין'}`, { align: 'right' });
    doc.text('סיווג: דוח מבצעי פנימי', { align: 'right' });

    writeSection('תיאור ראשוני', evidence.description || '');
    writeSection('הקשר חקירתי', `${briefingDetails.incidentSummary || ''}\n${briefingDetails.anomaly || ''}`.trim());
    writeSection('הערת מערכת', evidence.hiddenClue || '');

    doc.moveDown(1);
    doc.fontSize(10).fillColor('#6a5a4d').text('נוצר אוטומטית עבור סביבת המשחק', { align: 'right' });
    doc.text(`חתימה דיגיטלית: OPS-${String(caseId).slice(-6)}`, { align: 'right' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);
  });
};

const renderMessageHtml = ({ caseName, evidence }) => {
  const lead = evidence.description || 'שרשור הודעות רלוונטי לתיק.';
  const clue = evidence.hiddenClue || 'נוסח לא תקין ביחס להודעות השגרתיות.';

  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(caseName)} - הודעה שנאספה</title>
    <style>
      body { margin: 0; font-family: 'Segoe UI', sans-serif; background: #111315; color: #f4efe8; }
      .phone { width: min(420px, 100%); margin: 32px auto; padding: 22px; border-radius: 28px; background: #1d2125; box-shadow: 0 20px 50px rgba(0,0,0,0.35); }
      .bubble { margin-top: 12px; padding: 12px 14px; border-radius: 16px; max-width: 85%; line-height: 1.45; }
      .bubble--self { margin-right: auto; background: #7d5730; color: #fff7ed; }
      .bubble--other { background: #2b3137; color: #d6dbe0; }
      .meta { color: #d7aa66; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <main class="phone">
      <div class="meta">Extracted Message Thread</div>
      <div class="bubble bubble--other">${escapeHtml(lead)}</div>
      <div class="bubble bubble--self">ראיתי. אל תכניסי את זה לדו"ח עד שנבדוק את השעה.</div>
      <div class="bubble bubble--other">${escapeHtml(clue)}</div>
      <div class="bubble bubble--self">מחקי את השם מהניסוח. זה רגיש מדי כרגע.</div>
    </main>
  </body>
</html>`;
};

const renderPhotoSvg = ({ caseName, briefingDetails, evidence, index }) => {
  const scene = briefingDetails.incidentLocation || caseName;
  const timestamp = briefingDetails.incidentTime || '22:10';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1217" />
      <stop offset="100%" stop-color="#2b211c" />
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <rect x="96" y="90" width="1088" height="540" rx="28" fill="#1a1e24" stroke="#6f5537" stroke-width="2" />
  <rect x="160" y="180" width="340" height="260" rx="24" fill="#262d35" />
  <rect x="540" y="150" width="520" height="340" rx="28" fill="#171b20" />
  <circle cx="408" cy="292" r="58" fill="#94745c" opacity="0.42" />
  <path d="M690 410 C780 270 910 250 1010 380" stroke="#d2a56a" stroke-width="8" opacity="0.26" />
  <text x="164" y="140" fill="#f4efe7" font-size="30" font-family="Segoe UI, sans-serif">${escapeHtml(scene)}</text>
  <text x="164" y="176" fill="#d0b08b" font-size="18" font-family="Segoe UI, sans-serif">${escapeHtml(evidence.description || '')}</text>
  <text x="980" y="596" fill="#d7aa66" font-size="22" font-family="monospace">${escapeHtml(timestamp)}</text>
  <text x="160" y="596" fill="#f7d4aa" font-size="20" font-family="Segoe UI, sans-serif">סימון זירה ${index + 1}</text>
  <text x="160" y="632" fill="#ffffff" opacity="0.7" font-size="18" font-family="Segoe UI, sans-serif">${escapeHtml(evidence.hiddenClue || '')}</text>
</svg>`;
};

const writeWavFile = async (filePath, transcript) => {
  const sampleRate = 22050;
  const segments = transcript.split(' ').slice(0, 10).map((word, index) => ({
    duration: 0.22 + ((word.length % 4) * 0.03),
    frequency: 260 + ((index % 5) * 55),
    volume: 0.18,
  }));
  const rests = segments.flatMap((segment) => [segment, { duration: 0.05, frequency: 0, volume: 0 }]);
  const totalSamples = Math.floor(rests.reduce((sum, segment) => sum + (segment.duration * sampleRate), 0));
  const dataSize = totalSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let sampleIndex = 0;
  let byteOffset = 44;

  for (const segment of rests) {
    const sampleCount = Math.floor(segment.duration * sampleRate);

    for (let index = 0; index < sampleCount; index += 1) {
      let sampleValue = 0;

      if (segment.frequency > 0) {
        const t = sampleIndex / sampleRate;
        const fade = Math.min(index / 200, (sampleCount - index) / 200, 1);
        sampleValue = Math.sin((2 * Math.PI * segment.frequency) * t) * 32767 * segment.volume * Math.max(fade, 0);
      }

      buffer.writeInt16LE(Math.round(sampleValue), byteOffset);
      byteOffset += 2;
      sampleIndex += 1;
    }
  }

  await fs.writeFile(filePath, buffer);
};

const buildRecordingTranscript = ({ evidence, suspects = [], briefingDetails }) => {
  const leadNames = suspects.slice(0, 2).map((suspect) => suspect.name).join(', ');
  return `${evidence.description || 'הקלטה שנאספה מהזירה'}. ${evidence.hiddenClue || ''} נשמעים שמות כמו ${leadNames || 'המעורבים המרכזיים'} סביב ${briefingDetails.incidentTime || 'חלון הזמן הקריטי'}.`;
};

const generateAssetForEvidence = async ({ caseId, caseName, briefingDetails, suspects, evidence, index }) => {
  const caseDir = path.join(GENERATED_EVIDENCE_ROOT, `${caseId}`);
  await ensureDirectory(caseDir);

  const fileBase = `${String(index + 1).padStart(2, '0')}-${sanitizeFileSegment(evidence.type)}-${sanitizeFileSegment(caseName)}`;

  if (evidence.type === 'document') {
    const filename = `${fileBase}.pdf`;
    await writePdfDocument({
      filePath: path.join(caseDir, filename),
      caseName,
      briefingDetails,
      evidence,
      caseId,
    });
    return buildAssetEnvelope(evidence, filename, 'application/pdf', 'document', { caseId });
  }

  if (evidence.type === 'message') {
    const filename = `${fileBase}.html`;
    await fs.writeFile(path.join(caseDir, filename), renderMessageHtml({ caseName, evidence }), 'utf8');
    return buildAssetEnvelope(evidence, filename, 'text/html; charset=utf-8', 'message', { caseId });
  }

  if (evidence.type === 'photo') {
    const filename = `${fileBase}.svg`;
    await fs.writeFile(path.join(caseDir, filename), renderPhotoSvg({ caseName, briefingDetails, evidence, index }), 'utf8');
    return buildAssetEnvelope(evidence, filename, 'image/svg+xml', 'photo', { caseId });
  }

  if (evidence.type === 'recording') {
    const filename = `${fileBase}.wav`;
    const transcript = buildRecordingTranscript({ evidence, suspects, briefingDetails });
    await writeWavFile(path.join(caseDir, filename), transcript);
    return buildAssetEnvelope(evidence, filename, 'audio/wav', 'recording', { caseId, assetTranscript: transcript });
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
