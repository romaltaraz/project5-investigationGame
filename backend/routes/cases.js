// routes/cases.js
import express from 'express';
import mongoose from 'mongoose';
import Case from '../models/Case.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import OpenAI from 'openai';
import {
  EVIDENCE_TYPES,
  buildCaseSkeleton,
  buildFallbackCaseData,
  enrichCaseText,
  buildCommanderAndBackstoryPrompt,
  buildBriefingDetailsPrompt,
  buildSuspectsDetailPrompt,
  buildEvidencePrompt,
} from '../caseFactory.js';
import { generateEvidenceAssets } from '../services/evidenceAssets.js';

const router = express.Router();

const clamp = (value, min, max, fallback) => {
  const numeric = typeof value === 'number' ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
};

const buildTruthProfile = (truthProfile = {}, index = 0) => ({
  liesAbout: Array.isArray(truthProfile.liesAbout) ? truthProfile.liesAbout : [],
  nervousTriggers: Array.isArray(truthProfile.nervousTriggers)
    ? truthProfile.nervousTriggers
    : ['זמן', 'מיקום', 'כסף', 'מצלמה'].slice(index % 2, (index % 2) + 2),
  truthLevel: clamp(truthProfile.truthLevel, 0, 1, 0.7),
});

const deriveInvolvementType = (suspect = {}, fallbackSuspect = {}) => {
  const candidate = suspect?.involvementType || suspect?.participantType || fallbackSuspect?.involvementType;

  if (candidate === 'suspect' || candidate === 'witness') {
    return candidate;
  }

  const role = `${suspect?.role || fallbackSuspect?.role || ''}`;
  return /עד/.test(role) ? 'witness' : 'suspect';
};

const serializeSuspectForClient = (suspect = {}) => ({
  name: suspect.name,
  role: suspect.role,
  involvementType: deriveInvolvementType(suspect),
  personality: suspect.personality,
  alibi: suspect.alibi,
  stressMeter: suspect.stressMeter || 0,
  breakingPoint: suspect.breakingPoint || 70,
  currentTone: suspect.currentTone || 'neutral',
});

const serializeEvidenceForClient = (evidence = {}) => ({
  type: evidence.type,
  description: evidence.description,
  isFound: Boolean(evidence.isFound),
  fileUrl: evidence.fileUrl || '',
  mimeType: evidence.mimeType || '',
  assetType: evidence.assetType || '',
  assetStatus: evidence.assetStatus || 'missing',
  assetGeneratedAt: evidence.assetGeneratedAt || null,
  assetTranscript: evidence.assetTranscript || '',
});

const serializeCaseForClient = (caseDoc) => {
  const plainCase = typeof caseDoc?.toObject === 'function' ? caseDoc.toObject() : caseDoc;
  const serializedId = plainCase?._id?.toString?.() || plainCase?.id;

  return {
    id: serializedId,
    _id: serializedId,
    caseName: plainCase?.caseName,
    difficulty: plainCase?.difficulty,
    commanderBrief: plainCase?.commanderBrief,
    briefingDetails: plainCase?.briefingDetails,
    commanderPersonality: plainCase?.commanderPersonality,
    interactions: plainCase?.interactions || [],
    investigatorNotes: plainCase?.investigatorNotes || '',
    status: plainCase?.status,
    createdAt: plainCase?.createdAt,
    updatedAt: plainCase?.updatedAt,
    suspects: (plainCase?.suspects || []).map((suspect) => serializeSuspectForClient(suspect)),
    evidence: (plainCase?.evidence || []).map((evidence) => serializeEvidenceForClient(evidence)),
  };
};

const caseNeedsEvidenceAssets = (caseDoc) => (caseDoc?.evidence || []).some((item) => !item?.fileUrl);

// Track in-progress generation to avoid duplicate concurrent runs for the same case
const _evidenceGenerationInProgress = new Set();

const ensureCaseEvidenceAssets = async (caseDoc) => {
  if (!caseDoc || !caseNeedsEvidenceAssets(caseDoc)) {
    return caseDoc;
  }

  const caseId = caseDoc._id.toString();

  // Skip if already generating for this case (concurrent GET requests)
  if (_evidenceGenerationInProgress.has(caseId)) {
    return caseDoc;
  }

  _evidenceGenerationInProgress.add(caseId);

  try {
    const generatedEvidence = await generateEvidenceAssets({
      caseId,
      caseName: caseDoc.caseName,
      briefingDetails: caseDoc.briefingDetails || {},
      suspects: (caseDoc.suspects || []).map((suspect) => suspect.toObject?.() || suspect),
      evidence: (caseDoc.evidence || []).map((item) => item.toObject?.() || item),
    });

    const mappedEvidence = generatedEvidence.map((item) => mapEvidenceForStorage(item));

    // Use findByIdAndUpdate to avoid Mongoose VersionError from concurrent saves
    await Case.findByIdAndUpdate(caseId, { evidence: mappedEvidence });
    caseDoc.evidence = mappedEvidence;
  } finally {
    _evidenceGenerationInProgress.delete(caseId);
  }

  return caseDoc;
};

const normalizeSuspects = (suspects = [], baseSuspects = []) => {
  const source = Array.isArray(suspects) && suspects.length >= 3 ? suspects : baseSuspects;

  return source.slice(0, 5).map((suspect, index) => ({
    name: suspect?.name || baseSuspects[index]?.name || `חשוד ${index + 1}`,
    role: suspect?.role || baseSuspects[index]?.role || 'חשוד',
    involvementType: deriveInvolvementType(suspect, baseSuspects[index]),
    personality: suspect?.personality || suspect?.description || baseSuspects[index]?.personality || 'מתוח, זהיר ולא חושף בקלות מידע.',
    alibi: suspect?.alibi || baseSuspects[index]?.alibi || '',
    secret: suspect?.secret || baseSuspects[index]?.secret || 'מסתיר פרט אישי שיכול להפליל אותו בהקשר משני.',
    isGuilty: Boolean(suspect?.isGuilty),
    truthProfile: buildTruthProfile(suspect?.truthProfile, index),
    stressMeter: clamp(suspect?.stressMeter, 0, 100, 0),
    breakingPoint: clamp(suspect?.breakingPoint, 30, 100, 70),
  }));
};

// Guarantees every evidence type appears at least once by relabeling spare
// duplicates — e.g. two "recording" items and no "photo" becomes one of each.
const ensureEvidenceTypeCoverage = (items) => {
  const counts = {};
  items.forEach((item) => { counts[item.type] = (counts[item.type] || 0) + 1; });

  const missingTypes = EVIDENCE_TYPES.filter((type) => !counts[type]);
  if (missingTypes.length === 0) {
    return items;
  }

  const result = [...items];
  for (const missingType of missingTypes) {
    const donorIndex = result.findIndex((item) => counts[item.type] > 1);
    if (donorIndex === -1) break;
    counts[result[donorIndex].type] -= 1;
    counts[missingType] = (counts[missingType] || 0) + 1;
    result[donorIndex] = { ...result[donorIndex], type: missingType };
  }
  return result;
};

const normalizeEvidence = (evidence = [], baseEvidence = []) => {
  const source = Array.isArray(evidence) && evidence.length >= 4 ? evidence : baseEvidence;

  const normalized = source.slice(0, 6).map((item, index) => ({
    type: EVIDENCE_TYPES.includes(item?.type) ? item.type : (baseEvidence[index]?.type || 'document'),
    description: item?.description || baseEvidence[index]?.description || `ראיה ${index + 1}`,
    hiddenClue: item?.hiddenClue || item?.hidden_clue || baseEvidence[index]?.hiddenClue || '',
    isFound: Boolean(item?.isFound),
    fileUrl: item?.fileUrl || baseEvidence[index]?.fileUrl || '',
    mimeType: item?.mimeType || baseEvidence[index]?.mimeType || '',
    assetType: item?.assetType || baseEvidence[index]?.assetType || '',
    assetStatus: item?.assetStatus || baseEvidence[index]?.assetStatus || 'missing',
    assetGeneratedAt: item?.assetGeneratedAt || baseEvidence[index]?.assetGeneratedAt || null,
    assetTranscript: item?.assetTranscript || baseEvidence[index]?.assetTranscript || '',
  }));

  return ensureEvidenceTypeCoverage(normalized);
};

const mapEvidenceForStorage = (evidence = {}) => ({
  type: EVIDENCE_TYPES.includes(evidence.type) ? evidence.type : 'document',
  description: evidence.description || '',
  hiddenClue: evidence.hiddenClue || evidence.hidden_clue || '',
  isFound: Boolean(evidence.isFound),
  fileUrl: evidence.fileUrl || '',
  mimeType: evidence.mimeType || '',
  assetType: evidence.assetType || '',
  assetStatus: evidence.assetStatus || 'missing',
  assetGeneratedAt: evidence.assetGeneratedAt || null,
  assetTranscript: evidence.assetTranscript || '',
});

const normalizeCaseData = (caseData, difficulty, commanderPersonality, fallback = buildFallbackCaseData(difficulty, commanderPersonality)) => {

  const normalizedCase = {
    caseName: caseData?.caseName || fallback.caseName,
    commanderBrief: caseData?.commanderBrief || fallback.commanderBrief,
    briefingDetails: {
      incidentTime: caseData?.briefingDetails?.incidentTime || fallback.briefingDetails?.incidentTime || '',
      incidentLocation: caseData?.briefingDetails?.incidentLocation || fallback.briefingDetails?.incidentLocation || '',
      incidentSummary: caseData?.briefingDetails?.incidentSummary || fallback.briefingDetails?.incidentSummary || '',
      anomaly: caseData?.briefingDetails?.anomaly || fallback.briefingDetails?.anomaly || '',
      situation: caseData?.briefingDetails?.situation || fallback.briefingDetails?.situation || '',
      stakes: caseData?.briefingDetails?.stakes || fallback.briefingDetails?.stakes || '',
      locationContext: caseData?.briefingDetails?.locationContext || fallback.briefingDetails?.locationContext || '',
      timelineMarks: Array.isArray(caseData?.briefingDetails?.timelineMarks) && caseData.briefingDetails.timelineMarks.length > 0
        ? caseData.briefingDetails.timelineMarks
        : (fallback.briefingDetails?.timelineMarks || []),
      fieldSignals: Array.isArray(caseData?.briefingDetails?.fieldSignals) && caseData.briefingDetails.fieldSignals.length > 0
        ? caseData.briefingDetails.fieldSignals
        : (fallback.briefingDetails?.fieldSignals || []),
      knownFacts: Array.isArray(caseData?.briefingDetails?.knownFacts) && caseData.briefingDetails.knownFacts.length > 0
        ? caseData.briefingDetails.knownFacts
        : (fallback.briefingDetails?.knownFacts || []),
      openingQuestions: Array.isArray(caseData?.briefingDetails?.openingQuestions) && caseData.briefingDetails.openingQuestions.length > 0
        ? caseData.briefingDetails.openingQuestions
        : (fallback.briefingDetails?.openingQuestions || []),
    },
    backstory: caseData?.backstory || fallback.backstory,
    solution: {
      culprit: caseData?.solution?.culprit || fallback.solution.culprit,
      method: caseData?.solution?.method || fallback.solution.method,
      motive: caseData?.solution?.motive || fallback.solution.motive,
      explanation: caseData?.solution?.explanation || fallback.solution.explanation,
    },
    suspects: normalizeSuspects(caseData?.suspects, fallback.suspects),
    evidence: normalizeEvidence(caseData?.evidence, fallback.evidence),
  };

  return enrichCaseText(normalizedCase, fallback);
};

const parseAiCasePayload = (content = '') => {
  // Strip markdown code fences
  let cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  // Repair Hebrew gershayim (") inside string values (e.g. ד"ר, ר"ל)
  // A quote flanked by non-structural characters is gershayim, not a JSON delimiter
  cleaned = cleaned.replace(/([^\s,:{[\]}"\\])"([^\s,:{[\]}"\\])/g, "$1'$2");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch { /* fall through */ }
    }

    throw new Error('לא נמצא JSON תקין בתשובת ה-AI');
  }
};

// ======================
// POST /api/cases/generate
// יצירת תיק חדש עם AI
// ======================
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { difficulty = 'medium', commanderPersonality = 'mentor' } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });

    const actualActiveCases = await Case.find({ userId, status: 'active' }).select('_id').lean();
    const activeCaseIds = actualActiveCases.map((item) => item._id);
    user.activeCases = activeCaseIds;

    if (activeCaseIds.length >= 3) {
      return res.status(400).json({
        message: `לא ניתן לפתוח יותר מ-3 תיקים פעילים במקביל. כרגע יש לך ${activeCaseIds.length} תיקים פתוחים, אז צריך לסיים תיק קיים קודם.`
      });
    }

    // בונים "שלד" תיק באופן מקומי ומיידי (בלי AI): זירה, שעה, שמות ותפקידי המעורבים, מי אשם.
    // זה מבטיח שכל קריאות ה-AI המקביליות מתייחסות לאותם עובדות בדיוק, וגם משמש רשת ביטחון
    // עקבית אם קריאה מסוימת נכשלת (הנפילה חוזרת לאותו שלד, לא לתיק אקראי אחר).
    const skeleton = buildCaseSkeleton();
    const fallback = buildFallbackCaseData(difficulty, commanderPersonality, skeleton);

    const openai = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });

    const SYSTEM_PROMPT = `אתה מנוע יצירת תיקי חקירה מקצועיים עם עברית טבעית, מדויקת ועשירה.
    כתוב כמו תסריטאי ישראלי מנוסה, לא כמו תרגום מאנגלית.
    שמור בקפידה על העובדות שנמסרות לך (זירה, שעה, שמות, תפקידים) בלי לשנות אותן.
    החזר רק JSON תקין ללא טקסט נוסף.`;

    const runSection = async (label, prompt) => {
      try {
        const aiResponse = await openai.chat.completions.create({
          model: 'meta/llama-3.3-70b-instruct',
          temperature: 0.7,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
        });

        const raw = aiResponse.choices?.[0]?.message?.content || '';
        return parseAiCasePayload(raw);
      } catch (sectionError) {
        console.error(`⚠️ AI section "${label}" failed, will fall back:`, sectionError.message);
        return null;
      }
    };

    // עד 4 קריאות AI במקביל, כל אחת מייצרת חלק אחר וקטן יותר של התיק על בסיס אותו שלד -
    // מקצר משמעותית את זמן ההמתנה הכולל לעומת קריאה אחת גדולה שמייצרת הכול ברצף.
    const [commanderResult, briefingResult, suspectsResult, evidenceResult] = await Promise.all([
      runSection('commander/backstory', buildCommanderAndBackstoryPrompt(skeleton, difficulty, commanderPersonality)),
      runSection('briefingDetails', buildBriefingDetailsPrompt(skeleton, difficulty)),
      runSection('suspects', buildSuspectsDetailPrompt(skeleton, difficulty)),
      runSection('evidence', buildEvidencePrompt(skeleton, difficulty)),
    ]);

    const mergedSuspects = skeleton.baseSuspects.map((suspect, index) => ({
      ...suspect,
      ...(Array.isArray(suspectsResult?.suspects) ? suspectsResult.suspects[index] : undefined),
    }));

    const caseData = {
      caseName: skeleton.caseName,
      commanderBrief: commanderResult?.commanderBrief,
      backstory: commanderResult?.backstory,
      briefingDetails: {
        incidentTime: skeleton.incidentTime,
        incidentLocation: skeleton.location,
        incidentSummary: skeleton.scenario.incident,
        ...briefingResult,
      },
      solution: {
        culprit: skeleton.culprit,
        method: skeleton.method,
        motive: skeleton.motive,
        explanation: commanderResult?.solutionExplanation,
      },
      suspects: mergedSuspects,
      evidence: evidenceResult?.evidence,
    };

    const normalizedCase = normalizeCaseData(caseData, difficulty, commanderPersonality, fallback);

    const newCase = await Case.create({
      userId,
      caseName: normalizedCase.caseName,
      difficulty,
      commanderPersonality,
      commanderBrief: normalizedCase.commanderBrief,
      briefingDetails: normalizedCase.briefingDetails,
      backstory: normalizedCase.backstory,
      solution: normalizedCase.solution,
      suspects: normalizedCase.suspects.map(s => ({
        name: s.name,
        role: s.role || 'חשוד',
        involvementType: s.involvementType || 'suspect',
        personality: s.personality || s.description || 'אישיות לא ידועה',
        alibi: s.alibi || '',
        secret: s.secret || '',
        isGuilty: s.isGuilty || false,
        truthProfile: {
          liesAbout: s.truthProfile?.liesAbout || [],
          nervousTriggers: s.truthProfile?.nervousTriggers || [],
          truthLevel: s.truthProfile?.truthLevel ?? 0.7,
        },
        stressMeter: s.stressMeter || 0,
        breakingPoint: s.breakingPoint || 70,
      })),
      evidence: normalizedCase.evidence.map(e => ({
        ...mapEvidenceForStorage(e),
      })),
      interactions: []
    });
    console.log('✅ Case created:', newCase._id);

    try {
      await User.findByIdAndUpdate(userId, { activeCases: [...activeCaseIds, newCase._id] });
    } catch (userSaveError) {
      await Case.findByIdAndDelete(newCase._id);
      throw userSaveError;
    }

    // החזרה בטוחה ללקוח (בלי מידע סודי) — שולחים מיד לפני יצירת הנכסים
    res.status(201).json({
      message: 'תיק נוצר בהצלחה',
      case: {
        id: newCase._id,
        caseName: newCase.caseName,
        difficulty: newCase.difficulty,
        commanderBrief: newCase.commanderBrief,
        commanderPersonality: newCase.commanderPersonality,
        suspects: newCase.suspects.map(s => ({
          name: s.name,
          role: s.role,
          involvementType: deriveInvolvementType(s),
          personality: s.personality,
          alibi: s.alibi,
          stressMeter: s.stressMeter || 0
        })),
        evidence: newCase.evidence.map(e => ({
          type: e.type,
          description: e.description,
          isFound: e.isFound || false,
          fileUrl: e.fileUrl || '',
          mimeType: e.mimeType || '',
          assetType: e.assetType || '',
          assetStatus: e.assetStatus || 'missing',
          assetTranscript: e.assetTranscript || '',
        }))
      }
    });

    // יצירת נכסי ראיות ברקע — לא חוסם את התגובה
    generateEvidenceAssets({
      caseId: newCase._id.toString(),
      caseName: newCase.caseName,
      briefingDetails: newCase.briefingDetails || {},
      suspects: (newCase.suspects || []).map((suspect) => suspect.toObject?.() || suspect),
      evidence: (newCase.evidence || []).map((item) => item.toObject?.() || item),
    }).then(async (generatedEvidence) => {
      await Case.findByIdAndUpdate(newCase._id, {
        evidence: generatedEvidence.map((item) => mapEvidenceForStorage(item))
      });
      console.log('✅ Evidence assets generated for case:', newCase._id);
    }).catch((assetGenerationError) => {
      console.error('⚠️ Evidence asset generation failed:', assetGenerationError.message);
    });

  } catch (error) {
    console.error('❌ Case generation error:', error.message);
    if (error.name === 'ValidationError') {
      console.error('Mongoose validation:', JSON.stringify(error.errors, null, 2));
    }
    res.status(500).json({ message: 'שגיאה ביצירת התיק', error: error.message });
  }
});

// ======================
// GET /api/cases
// ======================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const cases = await Case.find({ userId: req.user.userId })
      .select('-solution -backstory -suspects.secret -suspects.truthProfile -suspects.isGuilty -evidence.hiddenClue')
      .sort({ createdAt: -1 });

    res.json({ cases: cases.map((caseDoc) => serializeCaseForClient(caseDoc)) });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בטעינת התיקים', error: error.message });
  }
});

// ======================
// GET /api/cases/:id
// ======================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    if (!req.params.id || !mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'מזהה תיק לא תקין.' });
    }

    const caseDoc = await Case.findOne({
      _id: req.params.id,
      userId: req.user.userId
    })
      .select('-solution -backstory -suspects.secret -suspects.truthProfile -suspects.isGuilty -evidence.hiddenClue')
      .lean();

    if (!caseDoc) return res.status(404).json({ message: 'תיק לא נמצא' });

    // Generate missing assets in background so briefing can load immediately.
    ensureCaseEvidenceAssets(caseDoc).catch((assetError) => {
      console.error('⚠️ Evidence assets failed on GET:', assetError.message);
    });

    res.json({ case: serializeCaseForClient(caseDoc) });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בטעינת התיק', error: error.message });
  }
});

router.put('/:id/notes', authenticateToken, async (req, res) => {
  try {
    if (!req.params.id || !mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'מזהה תיק לא תקין.' });
    }

    const { investigatorNotes = '' } = req.body;

    if (typeof investigatorNotes !== 'string') {
      return res.status(400).json({ message: 'הערות החוקר חייבות להיות טקסט.' });
    }

    const caseDoc = await Case.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!caseDoc) {
      return res.status(404).json({ message: 'תיק לא נמצא' });
    }

    caseDoc.investigatorNotes = investigatorNotes.slice(0, 5000);
    await caseDoc.save();

    res.json({
      message: 'הערות החוקר נשמרו',
      investigatorNotes: caseDoc.investigatorNotes,
    });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בשמירת ההערות', error: error.message });
  }
});

export default router;