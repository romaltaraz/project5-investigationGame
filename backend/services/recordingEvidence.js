// services/recordingEvidence.js
//
// AI generates a structured dialogue (recordingData: turns with speaker/
// text/emotion/pace/pauseAfterMs) grounded in the evidence blueprint, the
// case briefing and the (secret, never-revealed-directly) solution.
// Speakers must be exact matches against real case suspects - never
// invented, never silently swapped - exactly the same rule
// whatsappEvidence.js/documentEvidence.js already enforce for their own
// structured content. Invalid output triggers one corrective retry, then
// signals the caller to fall back to the pre-existing generic transcript
// renderer (see evidenceAssets.js).
//
// Difficulty changes ONLY how easily the player can pick the clue out of
// the conversation (turn count, directness, misdirection) - the
// underlying facts (culprit/motive/method/timeline) are fixed inputs,
// never altered here.

import {
  namesAreValid, parseAiJson, resolveGender, HEBREW_REGISTER, buildGenderDialogueNote, runHebrewQa,
} from './evidenceBlueprint.js';
import { generateDialogueAudio } from './elevenLabsTts.js';

const DIFFICULTY_GUIDANCE = {
  easy: {
    turnsRange: [5, 7],
    style: `רמת קושי: קלה.
- רמזים ברורים יחסית, שאלות ותשובות ישירות בעיקרן.
- מעט עמימות ומעט משפטים מטעים.
- שיחה קצרה יחסית.`,
  },
  medium: {
    turnsRange: [7, 10],
    style: `רמת קושי: בינונית.
- שיחה טבעית יותר, עם רמזים עקיפים ולא רק ישירים.
- מידה מסוימת של התחמקות וסתירות עדינות בין הדוברים.
- שהיות/הפסקות טבעיות יותר בין חלק מהמשפטים (משתקף ב-pauseAfterMs).`,
  },
  hard: {
    turnsRange: [9, 14],
    style: `רמת קושי: קשה.
- הרמזים עדינים ומשולבים בתוך שיחה טבעית - לא בולטים או מוסברים.
- תשובות עקיפות, היסוס ניכר, התחמקות מחושבת.
- חלק מהרמזים הופכים למשמעותיים רק בשילוב עם ראיות אחרות בתיק.
- פרטים שנשמעים מדויקים ואמינים אך עלולים להטעות אם מתפרשים לבד - בלי לסתור אף פעם את העובדות בפועל.`,
  },
};

const resolveDifficultyGuidance = (difficulty) => DIFFICULTY_GUIDANCE[difficulty] || DIFFICULTY_GUIDANCE.medium;

const buildDialoguePrompt = ({
  evidence, participantA, participantB, briefingDetails, difficulty, solution, validNames,
}) => {
  const nameList = [...validNames].join(', ');
  const guidance = resolveDifficultyGuidance(difficulty);
  const [minTurns, maxTurns] = guidance.turnsRange;
  const genderNote = buildGenderDialogueNote(participantA, participantB);

  return {
    system: `אתה כותב תמלול שיחה מיורטת (הקלטה) פיקטיבית עבור משחק חקירה בעברית טבעית ואמינה.
אסור בהחלט להמציא דובר שלא נמסר לך. אסור לחשוף את הפתרון של התיק במפורש.
${guidance.style}
${HEBREW_REGISTER.recording}`,
    user: `שיחה מיורטת בין ${participantA.name} (${participantA.role}) לבין ${participantB.name} (${participantB.role}).
${genderNote}

הקשר הראיה (מקור האמת - אל תסטה ממנו):
מטרת הראיה: ${evidence.purpose || ''}
הרמז המרכזי שהשיחה חייבת לתמוך בו (בעדינות, לא במפורש): ${evidence.primaryClue || evidence.hiddenClue || ''}
רמז משני (אופציונלי, רק אם רלוונטי לשיחה): ${evidence.secondaryClue || ''}
מיקום: ${evidence.location || briefingDetails.incidentLocation || ''}. שעה: ${evidence.timeline?.time || briefingDetails.incidentTime || ''}.

הקשר התיק (רקע, אל תחשוף ישירות):
תקציר האירוע: ${briefingDetails.incidentSummary || ''}
עובדות ידועות: ${(briefingDetails.knownFacts || []).join(' | ')}
מאחורי הקלעים (סודי, לשימוש פנימי בלבד - אסור להיאמר במפורש בשיחה): האחראי בפועל הוא ${solution?.culprit || 'לא ידוע'}, השיטה הייתה "${solution?.method || ''}", המניע היה "${solution?.motive || ''}".

דמויות קיימות בתיק (אסור להשתמש בשם אחר): ${nameList}.
כל שדה "speaker" חייב להיות בדיוק ${participantA.name} או ${participantB.name}, אין אפשרות שלישית.

כתוב שיחה בת ${minTurns} עד ${maxTurns} תורות דיבור (turns), טבעית ואמינה, שמשקפת את היחסים והאישיות של שני הדוברים.
לכל תור הוסף:
- "emotion": אחד בדיוק מתוך: neutral, nervous, defensive, angry, calm, hesitant, whispering, worried, suspicious
- "pace": אחד בדיוק מתוך: slow, normal, fast
- "pauseAfterMs": מספר מילישניות הפסקה טבעית אחרי המשפט הזה (בדרך כלל 200 עד 900, יותר אם יש היסוס)

החזר אך ורק JSON בפורמט:
{
  "turns": [
    { "speaker": "שם מדויק מהרשימה", "text": "משפט הדיאלוג בעברית טבעית ומדוברת", "emotion": "...", "pace": "...", "pauseAfterMs": 400 }
  ]
}`,
  };
};

const validateDialogueData = (dialogueData, validNameSet) => {
  if (!dialogueData || !Array.isArray(dialogueData.turns) || dialogueData.turns.length === 0) return false;
  const speakers = dialogueData.turns.map((turn) => turn.speaker);
  if (!namesAreValid(speakers, validNameSet)) return false;
  return dialogueData.turns.every((turn) => `${turn?.text || ''}`.trim().length > 0);
};

const VALID_EMOTIONS = new Set(['neutral', 'nervous', 'defensive', 'angry', 'calm', 'hesitant', 'whispering', 'worried', 'suspicious']);
const VALID_PACES = new Set(['slow', 'normal', 'fast']);

// Defensive normalization only - never invents content, only clamps
// out-of-vocabulary AI output to a safe default so a stray value can't
// break TTS emotion-tag lookup or pace mapping downstream.
const normalizeTurns = (turns) => turns.map((turn) => ({
  speaker: `${turn.speaker}`.trim(),
  text: `${turn.text}`.trim(),
  emotion: VALID_EMOTIONS.has(turn.emotion) ? turn.emotion : 'neutral',
  pace: VALID_PACES.has(turn.pace) ? turn.pace : 'normal',
  pauseAfterMs: typeof turn.pauseAfterMs === 'number' && turn.pauseAfterMs >= 0 ? Math.min(turn.pauseAfterMs, 2500) : 450,
}));

const generateDialogueData = async ({
  generateAiText, evidence, participantA, participantB, briefingDetails, difficulty, solution, validNameSet,
}) => {
  const { system, user } = buildDialoguePrompt({
    evidence, participantA, participantB, briefingDetails, difficulty, solution, validNames: validNameSet,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await generateAiText(
        system,
        attempt === 0
          ? user
          : `${user}\n\nתשומת לב: הניסיון הקודם השתמש בשם דובר שלא קיים בתיק. מותר להשתמש אך ורק ב: ${participantA.name}, ${participantB.name}.`,
      );
      const dialogueData = parseAiJson(raw);
      if (validateDialogueData(dialogueData, validNameSet)) {
        return { turns: normalizeTurns(dialogueData.turns) };
      }
    } catch {
      // fall through to retry / fallback
    }
  }

  return null;
};

// Runs the Hebrew QA pass over every turn's text before it ever reaches
// generateDialogueAudio (ElevenLabs) - this is what guarantees the audio,
// the stored recordingData.turns, and the plain-text transcript are all
// derived from the exact same corrected text, never from the raw draft.
const applyRecordingHebrewQa = async ({ generateAiText, turns, participantA, participantB }) => {
  const items = turns.map((turn) => ({ speaker: turn.speaker, text: turn.text }));

  const corrected = await runHebrewQa({
    generateAiText,
    items,
    registerBlock: HEBREW_REGISTER.recording,
    speakerGenders: {
      [participantA.name]: resolveGender(participantA),
      [participantB.name]: resolveGender(participantB),
    },
  });

  return turns.map((turn, index) => ({ ...turn, text: corrected[index]?.text ?? turn.text }));
};

// Plain-text transcript kept in the exact same "[שם]: טקסט" shape the
// rest of the app already expects from assetTranscript (investigate.js's
// stress-keyword scoring, the client-facing evidence-card display) -
// backward compatible even though the source is now structured turns.
const buildPlainTranscript = (turns) => turns.map((turn) => `[${turn.speaker}]: ${turn.text}`).join('\n');

export const generateStructuredRecording = async ({
  generateAiText, evidence, suspects, briefingDetails, difficulty, solution, validNameSet,
}) => {
  const declaredParticipants = Array.isArray(evidence.participants) ? evidence.participants : [];
  const validDeclared = declaredParticipants.filter((name) => validNameSet.has(name));

  const [participantA, participantB] = validDeclared.length >= 2
    ? validDeclared.slice(0, 2).map((name) => suspects.find((suspect) => suspect.name === name))
    : (suspects || []).slice(0, 2);

  if (!participantA || !participantB) {
    return null;
  }

  const dialogueData = await generateDialogueData({
    generateAiText, evidence, participantA, participantB, briefingDetails, difficulty, solution, validNameSet,
  });

  if (!dialogueData) {
    return null;
  }

  // Hebrew QA runs here, strictly between generation and synthesis, so
  // ElevenLabs always receives the corrected text below - never the raw
  // AI draft in dialogueData.turns.
  const qaTurns = await applyRecordingHebrewQa({
    generateAiText, turns: dialogueData.turns, participantA, participantB,
  });

  // Real audio + real, audio-derived timestamps, synthesized from the
  // QA-corrected turns. If ElevenLabs fails for any reason, the caller's
  // own catch (see evidenceAssets.js) falls back to the pre-existing
  // generic recording renderer, which still uses this same transcript
  // text - the player never loses the textual evidence.
  const audio = await generateDialogueAudio({ turns: qaTurns, suspects });

  const timedTurns = qaTurns.map((turn, index) => ({
    ...turn,
    startTime: audio.turns[index]?.startTime ?? 0,
    endTime: audio.turns[index]?.endTime ?? 0,
  }));

  return {
    recordingData: {
      turns: timedTurns,
      difficulty: difficulty || 'medium',
      durationSeconds: audio.durationSeconds,
      participants: [participantA.name, participantB.name],
    },
    transcript: buildPlainTranscript(timedTurns),
    audio,
  };
};
