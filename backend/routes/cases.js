// routes/cases.js
import express from 'express';
import mongoose from 'mongoose';
import Case from '../models/Case.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import OpenAI from 'openai';
import {
  EVIDENCE_TYPES,
  NVIDIA_TEXT_MODEL,
  buildCaseSkeleton,
  buildSkeletonFromPremise,
  conceptSignatureCollides,
  buildFallbackCaseData,
  enrichCaseText,
  buildCasePremisePrompt,
  buildCommanderAndBackstoryPrompt,
  buildBriefingDetailsPrompt,
  buildSuspectsDetailPrompt,
  buildEvidencePrompt,
  applySuspectAlibiHebrewQa,
} from '../caseFactory.js';
import { generateEvidenceAssets } from '../services/evidenceAssets.js';
import {
  buildValidNameSet,
  deriveWritingProfile,
  deriveAppearanceProfile,
  deriveVoiceProfile,
  buildVoiceProfilesForParticipants,
  DOCUMENT_ARTIFACT_TYPES,
} from '../services/evidenceBlueprint.js';
import {
  deriveInvolvementType,
  serializeCaseForClient,
} from '../services/caseSerializer.js';
import { addCaseStreamClient } from '../services/caseEvents.js';

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

// Falls back to a deterministic per-name profile so handwriting stays
// consistent across evidence even if the AI never supplies one.
const buildWritingProfile = (writingProfile = {}, name = '') => (
  writingProfile?.style
    ? {
      isHandwritten: true,
      style: writingProfile.style,
      pressure: writingProfile.pressure || 'בינונית',
      spacing: writingProfile.spacing || 'רגילה',
      consistency: writingProfile.consistency || 'בינונית',
    }
    : deriveWritingProfile(name)
);

// Same pattern as buildWritingProfile: AI-supplied profile wins when
// present, otherwise a deterministic per-name fallback so every suspect
// always has a fully-populated, internally consistent identity — this is
// the ONE place the profile is established; evidence generation only
// ever reads it back (see buildVoiceProfilesForParticipants), never
// regenerates it.
const buildAppearanceProfile = (appearanceProfile = {}, name = '') => (
  appearanceProfile?.hair || appearanceProfile?.gender
    ? {
      age: typeof appearanceProfile.age === 'number' ? appearanceProfile.age : undefined,
      gender: appearanceProfile.gender || '',
      hair: appearanceProfile.hair || '',
      eyes: appearanceProfile.eyes || '',
      skinTone: appearanceProfile.skinTone || '',
      bodyType: appearanceProfile.bodyType || '',
      clothingStyle: appearanceProfile.clothingStyle || '',
      distinctiveFeatures: Array.isArray(appearanceProfile.distinctiveFeatures)
        ? appearanceProfile.distinctiveFeatures.filter(Boolean)
        : [],
    }
    : deriveAppearanceProfile(name)
);

const buildVoiceProfile = (voiceProfile = {}, name = '') => (
  voiceProfile?.tone || voiceProfile?.pitch
    ? {
      age: typeof voiceProfile.age === 'number' ? voiceProfile.age : undefined,
      gender: voiceProfile.gender || '',
      pitch: voiceProfile.pitch || '',
      speed: voiceProfile.speed || '',
      tone: voiceProfile.tone || '',
      accent: voiceProfile.accent || '',
      personality: voiceProfile.personality || '',
    }
    : deriveVoiceProfile(name)
);

// serializeCaseForClient / serializeSuspectForClient / serializeEvidenceForClient /
// deriveInvolvementType now live in services/caseSerializer.js so the SSE change
// feed (services/caseEvents.js) emits the exact same client-safe shape.

// Automatic-retry bound (see models/Case.js evidenceSchema.assetAttempts).
// A permanently-broken provider call (NVIDIA 410/500/504, FLUX CONTENT_FILTERED,
// ElevenLabs quota, ...) must stop being retried after a few tries instead of
// forever - this is a COUNT, not a delay, and it is persisted per evidence item
// in MongoDB so it survives across requests/restarts (an in-memory guard alone
// cannot do this - see _evidenceGenerationInProgress below, which only ever
// prevented CONCURRENT runs, never repeated SEQUENTIAL ones).
const MAX_AUTO_ATTEMPTS = 3;

// An item is only picked up for another AUTOMATIC attempt when it has never
// succeeded, has no usable file, and hasn't already burned its automatic
// attempt budget. Once assetAttempts reaches MAX_AUTO_ATTEMPTS the item is
// left alone by ensureCaseEvidenceAssets - no more generation calls, no more
// writes, no more updatedAt bumps, no more SSE echo - until something
// explicitly resets assetAttempts (an intentional retry path, not built yet).
const evidenceItemNeedsAutoAttempt = (item) => (
  item?.assetStatus !== 'ready'
  && !item?.fileUrl
  && (item?.assetAttempts || 0) < MAX_AUTO_ATTEMPTS
);

const caseNeedsEvidenceAssets = (caseDoc) => (caseDoc?.evidence || []).some(evidenceItemNeedsAutoAttempt);

// Track in-progress generation to avoid duplicate concurrent runs for the same case
const _evidenceGenerationInProgress = new Set();

// Shared per-case guard around generateEvidenceAssets() - used by BOTH trigger
// points (this file's POST /generate background kickoff, and GET's
// ensureCaseEvidenceAssets below) so a case can never have two generation runs
// in flight at once regardless of which one started first. Keyed by caseId, so
// different cases still generate fully concurrently. Returns null instead of
// running when a generation for this exact case is already in progress - the
// caller treats that as "nothing to do here", never as a failure.
const runGuardedEvidenceGeneration = async (caseId, run) => {
  if (_evidenceGenerationInProgress.has(caseId)) {
    return null;
  }

  _evidenceGenerationInProgress.add(caseId);
  try {
    return await run();
  } finally {
    _evidenceGenerationInProgress.delete(caseId);
  }
};

const ensureCaseEvidenceAssets = async (caseDoc) => {
  if (!caseDoc || !caseNeedsEvidenceAssets(caseDoc)) {
    return caseDoc;
  }

  const caseId = caseDoc._id.toString();

  // Resolves to the FULL evidence array (ready to save, original length/order/
  // indexes intact) when something was actually attempted, or null when there
  // was nothing to do - either a run for this case was already in progress
  // (runGuardedEvidenceGeneration's own "already running" signal), or every
  // item is already ready / has exhausted its automatic-attempt budget. Both
  // collapse to the same "no-op" handling below: no generateEvidenceAssets
  // call, no Mongo write, no updatedAt bump, no SSE echo - this is what
  // breaks the GET /:id -> generate -> updatedAt -> change stream -> SSE ->
  // GET /:id loop.
  const outcome = await runGuardedEvidenceGeneration(caseId, async () => {
    // caseDoc here comes from a client-facing query that deliberately excludes
    // solution/suspects.appearanceProfile/suspects.voiceProfile (see the
    // .select() calls below) - but the generators need all of that (FLUX
    // needs appearanceProfile for character consistency, the recording
    // generator needs voiceProfile + solution). Re-fetch the full document
    // for generation purposes only; nothing from it is sent to the client.
    const fullCaseDoc = await Case.findById(caseId).lean();
    if (!fullCaseDoc) return null;

    // Re-check against the freshly-fetched evidence (not the possibly-stale
    // caseDoc passed in). Build attemptIndexes from the ORIGINAL positions
    // and bump attempt bookkeeping only on those items, but keep every item
    // - attempted or not - in place in a full-length array in its original
    // order. This is what generateEvidenceAssets is handed below, so its own
    // loop index is always the item's true original position (the FLUX seed
    // and the `${index+1}-...` filename/log numbering key off that index -
    // passing a pre-filtered, shorter array here would silently shift it for
    // any retried item).
    const baseEvidence = fullCaseDoc.evidence || [];
    const attemptIndexes = new Set();
    const attemptStartedAt = new Date();
    const evidenceForCall = baseEvidence.map((item, index) => {
      if (!evidenceItemNeedsAutoAttempt(item)) {
        return item;
      }
      attemptIndexes.add(index);
      return {
        ...item,
        assetAttempts: (item.assetAttempts || 0) + 1,
        assetLastAttemptAt: attemptStartedAt,
      };
    });

    if (attemptIndexes.size === 0) {
      // Everything is already ready, or every remaining item has exhausted
      // MAX_AUTO_ATTEMPTS - nothing to regenerate, nothing to write.
      return null;
    }

    // generateEvidenceAssets already returns a full-length array in the same
    // order (it passes non-attempted indexes through untouched itself), so
    // no further merge-by-index step is needed here.
    return generateEvidenceAssets({
      caseId,
      caseName: fullCaseDoc.caseName,
      briefingDetails: fullCaseDoc.briefingDetails || {},
      suspects: fullCaseDoc.suspects || [],
      evidence: evidenceForCall,
      attemptIndexes,
      difficulty: fullCaseDoc.difficulty,
      solution: fullCaseDoc.solution,
    });
  });

  if (!outcome) {
    // Nothing to do this time (already in progress elsewhere, or no item
    // needed an automatic attempt) - deliberately no write, no updatedAt
    // bump, no SSE broadcast.
    return caseDoc;
  }

  const mappedEvidence = outcome.map((item) => mapEvidenceForStorage(item));

  // Use findByIdAndUpdate to avoid Mongoose VersionError from concurrent saves
  await Case.findByIdAndUpdate(caseId, { evidence: mappedEvidence });
  caseDoc.evidence = mappedEvidence;

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
    writingProfile: buildWritingProfile(suspect?.writingProfile, suspect?.name || baseSuspects[index]?.name),
    appearanceProfile: buildAppearanceProfile(suspect?.appearanceProfile, suspect?.name || baseSuspects[index]?.name),
    voiceProfile: buildVoiceProfile(suspect?.voiceProfile, suspect?.name || baseSuspects[index]?.name),
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

// Participants must reference real case characters only. A hallucinated
// name is dropped, never swapped for a real one — identity is part of the
// investigation logic, so we'd rather have no participants metadata than
// a silently wrong one.
const sanitizeParticipants = (participants, validNameSet) => (Array.isArray(participants)
  ? participants.map((name) => `${name || ''}`.trim()).filter((name) => name && validNameSet.has(name))
  : []);

const sanitizeArtifactType = (artifactType) => (DOCUMENT_ARTIFACT_TYPES.includes(artifactType) ? artifactType : '');

const coerceStringArray = (value) => (Array.isArray(value)
  ? value.map((item) => `${item || ''}`.trim()).filter(Boolean)
  : []);

// evidence blueprint (structured) → normalized evidence record.
// primaryClue/purpose are now the canonical source of truth; description/
// hiddenClue are kept fully populated too (existing consumers — investigate.js
// stress scoring, whatsappEvidence.js/documentEvidence.js prompts — still read
// them directly) and only get DERIVED from the new fields as a fallback when
// the AI didn't supply them, never the other way around.
const normalizeEvidence = (evidence = [], baseEvidence = [], validNameSet = new Set(), suspects = [], defaultLocation = '') => {
  const source = Array.isArray(evidence) && evidence.length >= 4 ? evidence : baseEvidence;

  const normalized = source.slice(0, 6).map((item, index) => {
    const purpose = `${item?.purpose || ''}`.trim();
    const primaryClue = `${item?.primaryClue || ''}`.trim();
    const secondaryClue = `${item?.secondaryClue || baseEvidence[index]?.secondaryClue || ''}`.trim();
    const hiddenClue = `${item?.hiddenClue || item?.hidden_clue || baseEvidence[index]?.hiddenClue || ''}`.trim()
      || primaryClue || secondaryClue;
    const description = `${item?.description || baseEvidence[index]?.description || ''}`.trim()
      || [purpose, primaryClue].filter(Boolean).join(' — ')
      || `ראיה ${index + 1}`;
    const participants = sanitizeParticipants(item?.participants, validNameSet);
    const time = `${item?.time || item?.timeline?.time || baseEvidence[index]?.timeline?.time || ''}`.trim();

    return {
      type: EVIDENCE_TYPES.includes(item?.type) ? item.type : (baseEvidence[index]?.type || 'document'),
      description,
      hiddenClue,
      isFound: Boolean(item?.isFound),
      fileUrl: item?.fileUrl || baseEvidence[index]?.fileUrl || '',
      mimeType: item?.mimeType || baseEvidence[index]?.mimeType || '',
      assetType: item?.assetType || baseEvidence[index]?.assetType || '',
      assetStatus: item?.assetStatus || baseEvidence[index]?.assetStatus || 'missing',
      assetGeneratedAt: item?.assetGeneratedAt || baseEvidence[index]?.assetGeneratedAt || null,
      assetTranscript: item?.assetTranscript || baseEvidence[index]?.assetTranscript || '',
      purpose,
      primaryClue,
      secondaryClue,
      participants,
      location: `${item?.location || ''}`.trim() || defaultLocation,
      timeline: { time },
      visualDetails: coerceStringArray(item?.visualDetails),
      // photo-only English visual scene description (see caseFactory.js
      // buildEvidencePrompt + fluxImage.js buildImagePrompt). Optional: blank
      // for non-photo items and for older/fallback evidence that never had it.
      visualPromptEn: item?.type === 'photo'
        ? `${item?.visualPromptEn || ''}`.trim().replace(/\s+/g, ' ').slice(0, 800)
        : '',
      // Always re-derived from the case's own suspects — never trusts AI-supplied
      // voice data, so a character's voice can never drift between evidence items.
      voiceProfiles: buildVoiceProfilesForParticipants(suspects, participants),
      artifactType: item?.type === 'document' ? sanitizeArtifactType(item?.artifactType) : '',
    };
  });

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
  // Automatic-retry bookkeeping (see caseNeedsEvidenceAssets/ensureCaseEvidenceAssets
  // above) - must survive every write, or the attempt cap can't persist across
  // requests/restarts and the old regeneration loop comes back.
  assetAttempts: evidence.assetAttempts || 0,
  assetLastAttemptAt: evidence.assetLastAttemptAt || null,
  // Cleared on a successful (re)generation so a stale failure message never
  // lingers next to assetStatus:'ready'; preserved otherwise. Previously this
  // field was silently dropped here, which is why runtime failures (NVIDIA
  // 410, FLUX CONTENT_FILTERED, ElevenLabs quota, ...) never reached MongoDB.
  assetError: evidence.assetStatus === 'ready' ? '' : (evidence.assetError || ''),
  purpose: evidence.purpose || '',
  primaryClue: evidence.primaryClue || '',
  secondaryClue: evidence.secondaryClue || '',
  participants: Array.isArray(evidence.participants) ? evidence.participants : [],
  location: evidence.location || '',
  timeline: { time: evidence.timeline?.time || '' },
  visualDetails: coerceStringArray(evidence.visualDetails),
  visualPromptEn: evidence.visualPromptEn || '',
  voiceProfiles: Array.isArray(evidence.voiceProfiles) ? evidence.voiceProfiles : [],
  artifactType: evidence.artifactType || '',
  messageData: evidence.messageData || undefined,
  documentData: evidence.documentData || undefined,
  recordingData: evidence.recordingData || undefined,
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
  };
  normalizedCase.evidence = normalizeEvidence(
    caseData?.evidence,
    fallback.evidence,
    buildValidNameSet(normalizedCase.suspects),
    normalizedCase.suspects,
    normalizedCase.briefingDetails.incidentLocation,
  );

  return enrichCaseText(normalizedCase, fallback);
};

export const parseAiCasePayload = (content = '') => {
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
  let reservedCase = null;

  try {
    const { difficulty = 'medium', commanderPersonality = 'mentor' } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });

    // תגי-תוכן קצרים (conceptSignature) מהתיקים האחרונים של המשתמש הזה, נשלפים
    // לפני יצירת התיק החדש (ולפני שריון ה-placeholder למטה, כדי שלא יכלול אותו)
    // כדי להזין אותם ל-AI שממציא את התעלומה החדשה כהנחיית "תהיה שונה מאלה" (ראו
    // buildCasePremisePrompt) - המימוש של case-diversity-check מסעיף 14 בבריף.
    const recentCases = await Case.find({ userId })
      .sort({ createdAt: -1 })
      .limit(6)
      .select('caseName conceptSignature suspects.name solution.motive')
      .lean();
    const recentSignatures = recentCases
      .filter((c) => c.conceptSignature && Object.values(c.conceptSignature).some(Boolean))
      .map((c) => ({
        caseName: c.caseName,
        conceptSignature: c.conceptSignature,
        // Feeds buildRecentCaseAvoidanceBlock's character-name-reuse guard - same
        // filtered cohort as above, just carrying one more field through.
        suspects: (c.suspects || []).map((s) => s?.name).filter(Boolean),
        // Feeds the soft motive-variety nudge - same cohort, same pattern.
        motive: c.solution?.motive,
      }));

    // user.activeCases מתעדכן אוטומטית רק דרך פעולות האפליקציה (למשל סגירת תיק ב-
    // investigate.js). אם תיק נמחק ישירות ב-Mongo (בעקיפין לגמרי מהאפליקציה), ה-ObjectId
    // שלו נשאר תקוע במערך ותופס סלוט לשווא. מתקנים את זה כאן לפני בדיקת הסלוטים, כך
    // שמחיקה ידנית של תיק תשתקף באתר מיד בפעם הבאה שמנסים לפתוח תיק חדש.
    if (user.activeCases.length > 0) {
      const existingIds = await Case.find({ _id: { $in: user.activeCases } }).distinct('_id');
      const existingIdSet = new Set(existingIds.map((id) => id.toString()));
      const staleIds = user.activeCases.filter((id) => !existingIdSet.has(id.toString()));

      if (staleIds.length > 0) {
        await User.findByIdAndUpdate(userId, { $pull: { activeCases: { $in: staleIds } } });
        user.activeCases = user.activeCases.filter((id) => existingIdSet.has(id.toString()));
      }
    }

    // בדיקה מהירה, לא-אטומית, רק כדי לתת הודעת שגיאה זולה בלי לבזבז עבודה במקרה הנפוץ.
    // המנגנון שבאמת מונע יותר מ-3 תיקים פעילים הוא ההזמנה האטומית שמתחתיה. 'generating'
    // נספר יחד עם 'active' כי תיק בהכנה תופס סלוט בדיוק כמו תיק שכבר נוצר.
    const activeCaseCount = await Case.countDocuments({ userId, status: { $in: ['active', 'generating'] } });
    if (activeCaseCount >= 3) {
      return res.status(400).json({
        message: `לא ניתן לפתוח יותר מ-3 תיקים פעילים במקביל. כרגע יש לך ${activeCaseCount} תיקים פתוחים, אז צריך לסיים תיק קיים קודם.`
      });
    }

    // שומרים "מקום" מיד, לפני שמתחילים ביצירה עצמה (שלוקחת כמה שניות בגלל קריאות ה-AI).
    // הפלייסהולדר נשמר בסטטוס 'generating' - תופס סלוט אבל לא מוצג כתיק פעיל וניתן למשחק
    // עד שהיצירה מסתיימת ומעדכנת את אותו מסמך בדיוק לסטטוס 'active'.
    reservedCase = await Case.create({
      userId,
      caseName: 'תיק בהכנה...',
      commanderBrief: 'התיק בתהליך יצירה, פרטים מלאים בדרך...',
      difficulty,
      commanderPersonality,
      status: 'generating',
    });

    // ה-$expr על גודל activeCases רץ כעדכון אטומי על מסמך יחיד, אז שתי בקשות /generate
    // שמגיעות ממש קרוב אחת לשנייה (למשל בקשה כפולה אחרי שהראשונה נראתה תקועה) לא יכולות
    // שתיהן לעבור את הבדיקה בו-זמנית ולייצר יחד יותר מ-3 תיקים פעילים. activeCases הוא
    // מקור האמת היחיד לספירת הסלוטים - Case.status הוא רק שיקוף שלו לתצוגה בלקוח.
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, $expr: { $lt: [{ $size: '$activeCases' }, 3] } },
      { $push: { activeCases: reservedCase._id } },
      { new: true }
    );

    if (!updatedUser) {
      await Case.findByIdAndDelete(reservedCase._id);
      reservedCase = null;
      const currentCount = await Case.countDocuments({ userId, status: { $in: ['active', 'generating'] } });
      return res.status(400).json({
        message: `לא ניתן לפתוח יותר מ-3 תיקים פעילים במקביל. כרגע יש לך ${currentCount} תיקים פתוחים, אז צריך לסיים תיק קיים קודם.`
      });
    }

    // ✅ Hand-off point. The case now exists with a real id in 'generating'
    // state and its slot is reserved atomically. Respond RIGHT NOW - every AI
    // call runs detached in generateCaseInBackground() and updates this same
    // document. The browser tracks completion/failure through the
    // /api/cases/stream change-stream feed, so generation duration no longer
    // touches this request and a client fetch timeout can never be mistaken for
    // "generation failed".
    const reservedId = reservedCase._id;
    const pendingCasePayload = serializeCaseForClient(reservedCase);
    reservedCase = null; // ownership handed to the background task - catch() must not delete it

    res.status(202).json({
      message: 'התיק נכנס לתהליך יצירה',
      case: pendingCasePayload,
    });

    generateCaseInBackground({ reservedId, userId, difficulty, commanderPersonality, recentSignatures })
      .catch((backgroundError) => console.error('❌ Background case generation crashed:', backgroundError));
    return;

  } catch (preHandoffError) {
    console.error('❌ Case generation error (before hand-off):', preHandoffError.message);
    if (preHandoffError.name === 'ValidationError') {
      console.error('Mongoose validation:', JSON.stringify(preHandoffError.errors, null, 2));
    }

    // Only reachable for failures BEFORE the response (validation / slot
    // reservation). Once generateCaseInBackground owns the case it flips it to
    // 'failed' itself.
    if (reservedCase) {
      try {
        await Case.findByIdAndDelete(reservedCase._id);
        await User.findByIdAndUpdate(reservedCase.userId, { $pull: { activeCases: reservedCase._id } });
      } catch (cleanupError) {
        console.error('⚠️ Failed to release reserved case slot:', cleanupError.message);
      }
    }

    if (!res.headersSent) {
      res.status(500).json({ message: 'שגיאה ביצירת התיק', error: preHandoffError.message });
    }
  }
});

// Runs detached from the HTTP request that reserved the 'generating' placeholder.
// This IS the original generation pipeline, unchanged - same prompts, same AI
// model, same FLUX/evidence flow. It only updates the reserved document in place
// and, on unrecoverable failure, flips it to 'failed' (freeing the user's slot)
// instead of leaving it stuck on the loading screen forever. Every state change
// reaches the browser through the change-stream feed.
async function generateCaseInBackground({ reservedId, userId, difficulty, commanderPersonality, recentSignatures }) {
  try {
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
        // Most section builders (commander/briefing/suspects/evidence) return a
        // plain string user prompt, paired with the generic SYSTEM_PROMPT above.
        // buildCasePremisePrompt is the one builder that returns { system, user }
        // instead - it needs its own system message sent separately, not the
        // whole object stringified into a single "content" field.
        const isStructuredPrompt = prompt && typeof prompt === 'object';
        const systemContent = isStructuredPrompt ? (prompt.system || SYSTEM_PROMPT) : SYSTEM_PROMPT;
        const userContent = isStructuredPrompt ? prompt.user : prompt;

        const aiResponse = await openai.chat.completions.create({
          model: NVIDIA_TEXT_MODEL,
          temperature: 0.7,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userContent },
          ],
        });

        const raw = aiResponse.choices?.[0]?.message?.content || '';
        return parseAiCasePayload(raw);
      } catch (sectionError) {
        console.error(`⚠️ AI section "${label}" failed, will fall back:`, sectionError.message);
        return null;
      }
    };

    // Same generateAiText shape the structured evidence generators already
    // use (see evidenceAssets.js) - lets applySuspectAlibiHebrewQa reuse the
    // exact same runHebrewQa pass without a separate AI integration.
    const generateAiText = async (systemPrompt, userPrompt) => {
      const aiResponse = await openai.chat.completions.create({
        model: NVIDIA_TEXT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1100,
        temperature: 0.85,
      });
      return aiResponse.choices[0].message.content.trim();
    };

    // "שלד" התיק: זירה, שעה, שמות ותפקידי המעורבים, מי אשם, שיטה ומניע. כל קריאות
    // ה-AI המקבילות למטה מתייחסות לאותן עובדות בדיוק ברגע שהשלד קיים - זה הבסיס
    // ש-buildFallbackCaseData נשען עליו גם אם קריאה מסוימת נכשלת.
    //
    // המקור העיקרי לשלד הוא קריאת AI אחת (buildCasePremisePrompt) שממציאה תעלומה
    // מקורית במקום לבחור מתוך CASE_SCENARIOS/LOCATIONS/ROLE_DEFINITIONS הקבועים -
    // אלה נשארים כרשת ביטחון דטרמיניסטית (buildCaseSkeleton) למקרה שקריאת ה-AI
    // נכשלת לגמרי או מחזירה תוצאה שלא ניתנת לשימוש, בדיוק כמו הרשת שכל 4 הקריאות
    // המקבילות כבר משתמשות בה היום.
    let skeleton = null;
    const premise = await runSection('premise', buildCasePremisePrompt(difficulty, recentSignatures));
    if (premise) {
      try {
        skeleton = buildSkeletonFromPremise(premise);
      } catch (skeletonError) {
        console.error('⚠️ Failed to build skeleton from AI premise, falling back to template skeleton:', skeletonError.message);
        skeleton = null;
      }
    }

    // גיבוי מקומי וזול (בלי קריאת AI נוספת לשיפוט) - אם התעלומה שחזרה עדיין דומה
    // מדי לתיקים האחרונים של המשתמש, ניסיון חוזר אחד בלבד עם הנחיה נחרצת יותר.
    // לעולם לא חוסם את יצירת התיק - אם גם הניסיון החוזר נכשל, ממשיכים עם מה שיש.
    if (skeleton && recentSignatures.some((entry) => conceptSignatureCollides(entry.conceptSignature, skeleton.conceptSignature))) {
      const retryPremise = await runSection('premise-retry', buildCasePremisePrompt(difficulty, recentSignatures, true));
      if (retryPremise) {
        try {
          skeleton = buildSkeletonFromPremise(retryPremise);
        } catch (retryError) {
          console.error('⚠️ Failed to build skeleton from retried AI premise, keeping previous premise:', retryError.message);
        }
      }
    }

    if (!skeleton) skeleton = buildCaseSkeleton();

    const fallback = buildFallbackCaseData(difficulty, commanderPersonality, skeleton);

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

    // Correction-only Hebrew QA over each suspect's alibi text specifically
    // (not a general narrative rewrite - see applySuspectAlibiHebrewQa).
    // Best-effort: runHebrewQa already falls back to the original alibi on
    // any failure, but the whole step is wrapped too so a Promise.all
    // rejection here can never block case creation.
    try {
      normalizedCase.suspects = await applySuspectAlibiHebrewQa({
        generateAiText, suspects: normalizedCase.suspects,
      });
    } catch (alibiQaError) {
      console.error('⚠️ Suspect alibi Hebrew QA failed, keeping original alibi text:', alibiQaError.message);
    }

    // מעדכנים את אותו מסמך שהוזמן מראש (לא יוצרים תיק שני!) ומעבירים אותו לסטטוס 'active'.
    // reservedId כבר נמצא ב-User.activeCases מההזמנה האטומית ב-POST /generate, אז אין
    // צורך בעדכון נוסף על המשתמש כאן.
    const newCase = await Case.findByIdAndUpdate(
      reservedId,
      {
        caseName: normalizedCase.caseName,
        difficulty,
        commanderPersonality,
        commanderBrief: normalizedCase.commanderBrief,
        briefingDetails: normalizedCase.briefingDetails,
        conceptSignature: skeleton.conceptSignature || undefined,
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
          writingProfile: s.writingProfile,
          appearanceProfile: s.appearanceProfile,
          voiceProfile: s.voiceProfile,
        })),
        evidence: normalizedCase.evidence.map(e => ({
          ...mapEvidenceForStorage(e),
        })),
        interactions: [],
        status: 'active',
      },
      { new: true, runValidators: true }
    );

    if (!newCase) {
      throw new Error('התיק השמור מראש לא נמצא בעדכון הסופי');
    }
    // status is now 'active' - the change stream pushes this to the browser,
    // which swaps the loading UI for the finished case with no refresh.
    console.log('✅ Case generated (background):', newCase._id);

    // יצירת נכסי ראיות ברקע — לא חוסם את התגובה. עדכון ה-evidence כשמסתיים
    // משדר אף הוא אירוע change-stream, כך שתמונות/הקלטות מופיעות מעצמן.
    runGuardedEvidenceGeneration(newCase._id.toString(), () => generateEvidenceAssets({
      caseId: newCase._id.toString(),
      caseName: newCase.caseName,
      briefingDetails: newCase.briefingDetails || {},
      suspects: (newCase.suspects || []).map((suspect) => suspect.toObject?.() || suspect),
      evidence: (newCase.evidence || []).map((item) => item.toObject?.() || item),
      difficulty: newCase.difficulty,
      solution: newCase.solution,
    })).then(async (generatedEvidence) => {
      if (!generatedEvidence) return; // a run for this case was already in progress
      await Case.findByIdAndUpdate(newCase._id, {
        evidence: generatedEvidence.map((item) => mapEvidenceForStorage(item))
      });
      console.log('✅ Evidence assets generated for case:', newCase._id);
    }).catch((assetGenerationError) => {
      console.error('⚠️ Evidence asset generation failed:', assetGenerationError.message);
    });

  } catch (error) {
    console.error('❌ Background case generation failed:', error.message);
    if (error.name === 'ValidationError') {
      console.error('Mongoose validation:', JSON.stringify(error.errors, null, 2));
    }

    // The reserved placeholder is ours to resolve. Flip it to 'failed' so the
    // client renders a genuine failure + retry (never a false "timeout"), and
    // pull it from activeCases so the slot is freed. The change stream delivers
    // this state to any open dashboard immediately.
    try {
      await Case.findByIdAndUpdate(reservedId, {
        status: 'failed',
        caseName: 'יצירת התיק נכשלה',
        commanderBrief: 'משהו השתבש במהלך יצירת התיק. אפשר לנסות שוב מחדר המבצעים.',
      });
      await User.findByIdAndUpdate(userId, { $pull: { activeCases: reservedId } });
    } catch (cleanupError) {
      console.error('⚠️ Failed to mark case as failed:', cleanupError.message);
    }
  }
}

// ======================
// GET /api/cases
// ======================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const cases = await Case.find({ userId: req.user.userId })
      .select('-solution -backstory -conceptSignature -suspects.secret -suspects.truthProfile -suspects.isGuilty -suspects.appearanceProfile -suspects.voiceProfile -evidence.hiddenClue -evidence.purpose -evidence.primaryClue -evidence.secondaryClue -evidence.visualDetails -evidence.voiceProfiles -evidence.messageData -evidence.documentData -evidence.recordingData')
      .sort({ createdAt: -1 });

    res.json({ cases: cases.map((caseDoc) => serializeCaseForClient(caseDoc)) });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בטעינת התיקים', error: error.message });
  }
});

// ======================
// GET /api/cases/stream   ← live case feed (SSE)
// One server-side MongoDB change stream (services/caseEvents.js) fans out to
// every connected browser. Must be declared BEFORE '/:id' so it isn't captured
// as an id. EventSource can't send an Authorization header, so authenticateToken
// also accepts ?token=... (see middleware/auth.js).
// ======================
router.get('/stream', authenticateToken, (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // retry: tells EventSource how fast to reconnect; the ": " lines are comments
  // that just open the stream and act as keep-alive pings.
  res.write('retry: 3000\n\n');
  res.write(': connected\n\n');

  const removeClient = addCaseStreamClient(req.user.userId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* socket died; 'close' below cleans up */
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient();
    res.end();
  });
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
      .select('-solution -backstory -conceptSignature -suspects.secret -suspects.truthProfile -suspects.isGuilty -suspects.appearanceProfile -suspects.voiceProfile -evidence.hiddenClue -evidence.purpose -evidence.primaryClue -evidence.secondaryClue -evidence.visualDetails -evidence.voiceProfiles -evidence.messageData -evidence.documentData -evidence.recordingData')
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

// ======================
// DELETE /api/cases/:id
// Used by the dashboard "retry" action on a failed case, and generally to
// discard a case. Deleting fires a change-stream 'delete' event, so any open
// client drops the card live.
// ======================
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (!req.params.id || !mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'מזהה תיק לא תקין.' });
    }

    const deleted = await Case.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!deleted) {
      return res.status(404).json({ message: 'תיק לא נמצא' });
    }

    await User.findByIdAndUpdate(req.user.userId, { $pull: { activeCases: deleted._id } });

    res.json({ message: 'התיק נמחק' });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה במחיקת התיק', error: error.message });
  }
});

export default router;