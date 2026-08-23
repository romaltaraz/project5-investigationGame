// services/documentEvidence.js
//
// AI generates structured document content (documentData). This module
// never lets the AI decide who a document "really" belongs to beyond
// what's already true in the case: the writer (if any) must be an exact
// match against a real suspect name. If the AI hallucinates a name, we
// do NOT silently swap it for a real one — we retry once with a stricter
// prompt, and if that still fails we signal the caller to fall back to
// the pre-existing generic renderer.

import {
  namesAreValid,
  parseAiJson,
  isHandwrittenArtifact,
  resolveWritingProfile,
  resolveGender,
  HEBREW_REGISTER,
  runHebrewQa,
} from './evidenceBlueprint.js';
import { renderHandwrittenArtifact } from './handwritingRenderer.js';
import { renderFormalDocumentHtml } from './documentRenderer.js';

const buildDocumentDataPrompt = ({ caseName, briefingDetails, evidence, artifactType, validNames, isHandwritten }) => {
  const nameList = [...validNames].join(', ') || 'ללא דמויות ידועות';

  const writerInstruction = isHandwritten
    ? `שדה "writer" חובה, וחייב להיות בדיוק אחד מהשמות הבאים, בלי לשנות אות אחת: ${nameList}.`
    : `שדה "writer" אופציונלי. אם המסמך נכתב/נחתם ע"י אחת הדמויות, חובה שיהיה שם מדויק מתוך: ${nameList}. אם זהו מסמך שנוצר ע"י מערכת (כמו רישום גישה אוטומטי), השאר "writer" ריק.`;
  const registerBlock = isHandwritten ? HEBREW_REGISTER.personalDocument : HEBREW_REGISTER.officialDocument;

  return {
    system: `אתה כותב תוכן מובנה (JSON בלבד) עבור ראיית מסמך במשחק חקירה בעברית. אסור בהחלט להמציא שם של דמות שלא נמסרה לך.
${registerBlock}`,
    user: `תיק: "${caseName}". מיקום: ${briefingDetails.incidentLocation || ''}. שעה: ${briefingDetails.incidentTime || ''}.
סוג הארטיפקט הפיזי: ${artifactType}.
תיאור הראיה: ${evidence.description || ''}.
מטרת הראיה: ${evidence.purpose || ''}.
הרמז המרכזי שחייב לעלות מהמסמך בעדינות: ${evidence.hiddenClue || ''}.
רמז משני (אופציונלי): ${evidence.secondaryClue || ''}.
דמויות קיימות בתיק (אסור להמציא שם נוסף): ${nameList}.
${writerInstruction}

החזר אך ורק JSON בפורמט הבא, בלי טקסט נוסף:
{
  "writer": "שם מדויק מהרשימה או מחרוזת ריקה",
  "title": "כותרת קצרה למסמך אם רלוונטי",
  "bodyText": "התוכן המלא של המסמך, פסקאות/שורות מופרדות ב-\\n",
  "corrections": ["מילה או ביטוי שמופיע ב-bodyText ונראה כמחוק/מתוקן"],
  "hasSignature": true,
  "signatureText": "טקסט החתימה אם יש",
  "hasStamp": false,
  "stampText": "",
  "paperType": "סוג הנייר (למשל: דף פנקס קטן, נייר מכתבים, טופס רשמי)",
  "paperCondition": "מצב פיזי (למשל: מקופל, קרוע בקצה, נקי)",
  "inkColor": "כחול",
  "metaFields": { "שדה": "ערך" },
  "logEntries": [{ "time": "21:03", "actor": "מזהה/תפקיד, לא שם דמות שלא ברשימה", "action": "פעולה", "location": "מיקום" }]
}
מלא רק שדות רלוונטיים לסוג הארטיפקט; שדות לא רלוונטיים אפשר להשאיר ריקים/מערך ריק.`,
  };
};

const validateDocumentData = (documentData, validNameSet, isHandwritten) => {
  if (!documentData || typeof documentData !== 'object') return false;
  if (isHandwritten && !documentData.writer) return false;
  if (documentData.writer && !namesAreValid([documentData.writer], validNameSet)) return false;
  if (!documentData.bodyText && !(Array.isArray(documentData.logEntries) && documentData.logEntries.length)) return false;
  return true;
};

// Attempts structured generation once, retries once with a corrective
// prompt on invalid character names, then gives up (caller falls back).
const generateDocumentData = async ({ generateAiText, caseName, briefingDetails, evidence, artifactType, validNameSet }) => {
  const isHandwritten = isHandwrittenArtifact(artifactType);
  const { system, user } = buildDocumentDataPrompt({
    caseName, briefingDetails, evidence, artifactType, validNames: validNameSet, isHandwritten,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await generateAiText(
        system,
        attempt === 0
          ? user
          : `${user}\n\nתשומת לב: הניסיון הקודם השתמש בשם דמות שלא קיים בתיק. השתמש אך ורק בשמות המדויקים: ${[...validNameSet].join(', ')}.`,
      );
      const documentData = parseAiJson(raw);
      if (validateDocumentData(documentData, validNameSet, isHandwritten)) {
        return documentData;
      }
    } catch {
      // fall through to retry / fallback
    }
  }

  return null;
};

// Runs the Hebrew QA pass over bodyText only (title/signatureText/meta
// fields are short labels, not prose, and are left untouched). When the
// document has a resolved writer, that suspect's gender is passed in so
// first-person self-reference gets corrected consistently. Any
// "corrections" (crossed-out words the renderer highlights by literal
// substring match - see documentRenderer.js's applyCorrections) are
// pinned verbatim so a QA rewording can never silently break the
// strikethrough rendering.
const applyDocumentHebrewQa = async ({ generateAiText, documentData, artifactType, suspects }) => {
  const bodyText = `${documentData.bodyText || ''}`.trim();
  if (!bodyText) return documentData;

  const registerBlock = isHandwrittenArtifact(artifactType)
    ? HEBREW_REGISTER.personalDocument
    : HEBREW_REGISTER.officialDocument;

  const writerSuspect = documentData.writer
    ? (suspects || []).find((suspect) => `${suspect?.name || ''}`.trim() === `${documentData.writer}`.trim())
    : null;
  const speakerGenders = writerSuspect ? { [writerSuspect.name]: resolveGender(writerSuspect) } : {};

  const corrections = Array.isArray(documentData.corrections) ? documentData.corrections.filter(Boolean) : [];
  const extraInstruction = corrections.length
    ? `שמור בדיוק, מילה במילה, על המחרוזות הבאות בתוך הטקסט המתוקן, גם אם הן נראות לא תקינות דקדוקית: ${corrections.join(', ')}.\n`
    : '';

  const [corrected] = await runHebrewQa({
    generateAiText,
    items: [{ text: bodyText }],
    registerBlock,
    speakerGenders,
    extraInstruction,
  });

  return { ...documentData, bodyText: corrected?.text ?? documentData.bodyText };
};

// Renders documentData into the actual artifact. Dispatch by artifactType
// only — swapping the handwritten branch for a FLUX image call later
// means changing this one branch, not the schema or the AI step.
const dispatchRenderer = ({ artifactType, documentData, suspects, evidence, caseName, briefingDetails, caseId }) => {
  if (isHandwrittenArtifact(artifactType)) {
    const writingProfile = resolveWritingProfile(suspects, documentData.writer);
    return renderHandwrittenArtifact({ documentData, writingProfile, evidence, caseName });
  }

  return renderFormalDocumentHtml({ caseName, briefingDetails, evidence, caseId, artifactType, documentData });
};

export const generateStructuredDocument = async ({
  generateAiText, caseName, briefingDetails, evidence, artifactType, validNameSet, suspects, caseId,
}) => {
  const documentData = await generateDocumentData({
    generateAiText, caseName, briefingDetails, evidence, artifactType, validNameSet,
  });

  if (!documentData) {
    return null; // signal caller: fall back to legacy generic renderer
  }

  const correctedDocumentData = await applyDocumentHebrewQa({
    generateAiText, documentData, artifactType, suspects,
  });

  const rendered = dispatchRenderer({
    artifactType, documentData: correctedDocumentData, suspects, evidence, caseName, briefingDetails, caseId,
  });

  return { documentData: correctedDocumentData, rendered };
};
