// services/evidenceBlueprint.js
//
// Shared building blocks for the structured evidence pipeline:
//   AI → evidence blueprint (JSON) → renderer → evidence asset
//
// This module holds the vocabulary (artifact types) and the two safety
// nets every generator in whatsappEvidence.js / documentEvidence.js relies
// on: (1) never invent a character — validate names against the real case
// roster, and (2) a tiny AI-JSON parser shared by both generators.

// ── Artifact type vocabulary ────────────────────────────────────────────
// "type" stays 'document' (Case schema). "artifactType" is the physical
// form the document actually takes. Adding a new artifact type later
// (including swapping a renderer for FLUX image generation) never
// requires a schema change — only an entry here and a renderer.

export const HANDWRITTEN_ARTIFACT_TYPES = [
  'handwritten_note',
  'handwritten_letter',
  'diary_page',
  'physical_letter',
  'threat_note',
  'personal_note',
];

// Layout family used by the "formal" HTML renderer for non-handwritten documents.
export const ARTIFACT_LAYOUT = {
  security_access_log: 'log',
  system_log: 'log',
  meeting_record: 'log',
  invoice: 'invoice',
  receipt: 'invoice',
  printed_email: 'email',
  internal_memo: 'letterhead',
  official_report: 'letterhead',
  medical_report: 'letterhead',
  employee_record: 'letterhead',
  investigation_report: 'letterhead',
  old_fax: 'letterhead',
  scanned_document: 'letterhead',
};

export const DOCUMENT_ARTIFACT_TYPES = [
  ...HANDWRITTEN_ARTIFACT_TYPES,
  ...Object.keys(ARTIFACT_LAYOUT),
];

export const DEFAULT_ARTIFACT_TYPE = 'official_report';

export const isHandwrittenArtifact = (artifactType) => HANDWRITTEN_ARTIFACT_TYPES.includes(artifactType);

export const resolveArtifactLayout = (artifactType) => ARTIFACT_LAYOUT[artifactType] || 'letterhead';

// ── Character-identity validation ───────────────────────────────────────
// Hard rule: evidence must only reference characters that already exist
// in the case. We never "fix" a hallucinated name by swapping it for a
// real one — that would silently change who did/said what, which is part
// of the investigation logic. Invalid content is rejected so the caller
// can retry generation or fall back to the pre-existing safe renderer.

export const buildValidNameSet = (suspects = []) => new Set(
  suspects.map((suspect) => `${suspect?.name || ''}`.trim()).filter(Boolean),
);

// Every name in `names` must exactly match a real suspect name.
// Empty/missing input is considered valid (nothing to violate).
export const namesAreValid = (names = [], validNameSet) => {
  const list = Array.isArray(names) ? names : [names];
  return list.every((name) => {
    const trimmed = `${name || ''}`.trim();
    return !trimmed || validNameSet.has(trimmed);
  });
};

export const filterValidParticipants = (participants = [], validNameSet) => (Array.isArray(participants)
  ? participants.map((name) => `${name || ''}`.trim()).filter((name) => name && validNameSet.has(name))
  : []);

// ── Writing-profile derivation ──────────────────────────────────────────
// Deterministic fallback so the same character's handwriting stays
// consistent across multiple documents even if the AI never supplies a
// writingProfile. Purely a hash of the name — no randomness, no I/O.

const STYLE_POOL = [
  'כתב יד גדול ועגול',
  'כתב יד קטן ומסודר, עם רווחים אחידים',
  'כתב יד מרובע ומודגש, בעיקר אותיות דפוס',
  'כתב יד לא אחיד עם קו בסיס גולש',
  'כתב יד מהיר ורשלני עם אותיות מחוברות',
  'כתב יד נוער, גדול מדי, עם קו בסיס לא יציב',
];
const PRESSURE_POOL = ['קלה', 'בינונית', 'חזקה'];
const SPACING_POOL = ['צפופה', 'רגילה', 'מרווחת'];
const CONSISTENCY_POOL = ['גבוהה', 'בינונית', 'נמוכה'];

const hashName = (name = '') => `${name}`
  .split('')
  .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);

export const deriveWritingProfile = (name = '') => {
  const hash = hashName(name);
  return {
    isHandwritten: true,
    style: STYLE_POOL[hash % STYLE_POOL.length],
    pressure: PRESSURE_POOL[Math.floor(hash / 7) % PRESSURE_POOL.length],
    spacing: SPACING_POOL[Math.floor(hash / 13) % SPACING_POOL.length],
    consistency: CONSISTENCY_POOL[Math.floor(hash / 29) % CONSISTENCY_POOL.length],
  };
};

// Look up a suspect's stored writingProfile, falling back to the
// deterministic derivation above so it's always populated.
export const resolveWritingProfile = (suspects = [], writerName = '') => {
  const suspect = suspects.find((item) => `${item?.name || ''}`.trim() === `${writerName || ''}`.trim());
  if (suspect?.writingProfile?.style) {
    return suspect.writingProfile;
  }
  return deriveWritingProfile(writerName);
};

// Small numeric seed derived from a name, used by renderers to keep
// per-character visual jitter (rotation, spacing) stable across renders.
export const seedFromName = (name = '') => hashName(name);

// ── Character identity profile derivation ───────────────────────────────
// Deterministic fallback so every suspect always has a fully-populated,
// internally consistent appearanceProfile/voiceProfile even if the AI
// generation step fails or omits them — same role deriveWritingProfile
// plays for handwriting. Pure function of the name: same name always
// produces the same profile, so identity never drifts once established.
// Values are short structured English descriptors (metadata for a future
// FLUX/TTS call), not player-facing Hebrew text — mirrors writingProfile's
// treatment as server-only data today.

const GENDER_POOL = ['female', 'male'];
const HAIR_POOL = [
  'long brown hair', 'short black hair', 'curly dark hair', 'straight blonde hair',
  'shoulder-length grey hair', 'shaved head', 'long black hair tied back', 'short reddish hair',
];
const EYES_POOL = ['brown', 'dark brown', 'hazel', 'green', 'blue', 'grey'];
const SKIN_TONE_POOL = ['light', 'olive', 'tan', 'dark', 'medium'];
const BODY_TYPE_POOL = ['slim', 'athletic', 'average build', 'heavyset', 'tall and lean', 'short and stocky'];
const CLOTHING_STYLE_POOL = [
  'casual elegant', 'formal business attire', 'worn work uniform',
  'sharp tailored suit', 'plain and practical', 'trendy streetwear',
];
const DISTINCTIVE_FEATURE_POOL = [
  'silver bracelet', 'small scar above the eyebrow', 'thin-framed glasses', 'wedding ring',
  'tattoo on the wrist', 'nervous habit of touching a necklace', 'chipped front tooth', 'burn mark on the hand',
];
const VOICE_PITCH_POOL = ['low', 'medium', 'high'];
const VOICE_SPEED_POOL = ['slow', 'normal', 'fast'];
const VOICE_TONE_POOL = ['calm', 'nervous', 'confident', 'cold', 'warm', 'gruff'];
const ACCENT_POOL = ['Israeli', 'Israeli', 'Israeli', 'Russian-Israeli', 'Ethiopian-Israeli', 'American-Israeli'];
const VOICE_PERSONALITY_POOL = [
  'confident but slightly nervous', 'measured and controlled', 'quick to anger',
  'soft-spoken and evasive', 'charismatic and smooth', 'flat and guarded',
];

export const deriveAppearanceProfile = (name = '') => {
  const hash = hashName(name);
  return {
    age: 24 + (hash % 35), // 24..58
    gender: GENDER_POOL[Math.floor(hash / 3) % GENDER_POOL.length],
    hair: HAIR_POOL[Math.floor(hash / 5) % HAIR_POOL.length],
    eyes: EYES_POOL[Math.floor(hash / 11) % EYES_POOL.length],
    skinTone: SKIN_TONE_POOL[Math.floor(hash / 17) % SKIN_TONE_POOL.length],
    bodyType: BODY_TYPE_POOL[Math.floor(hash / 19) % BODY_TYPE_POOL.length],
    clothingStyle: CLOTHING_STYLE_POOL[Math.floor(hash / 23) % CLOTHING_STYLE_POOL.length],
    distinctiveFeatures: [DISTINCTIVE_FEATURE_POOL[Math.floor(hash / 31) % DISTINCTIVE_FEATURE_POOL.length]],
  };
};

export const deriveVoiceProfile = (name = '') => {
  const hash = hashName(name);
  return {
    age: 24 + (hash % 35),
    gender: GENDER_POOL[Math.floor(hash / 3) % GENDER_POOL.length],
    pitch: VOICE_PITCH_POOL[Math.floor(hash / 7) % VOICE_PITCH_POOL.length],
    speed: VOICE_SPEED_POOL[Math.floor(hash / 13) % VOICE_SPEED_POOL.length],
    tone: VOICE_TONE_POOL[Math.floor(hash / 29) % VOICE_TONE_POOL.length],
    accent: ACCENT_POOL[Math.floor(hash / 37) % ACCENT_POOL.length],
    personality: VOICE_PERSONALITY_POOL[Math.floor(hash / 41) % VOICE_PERSONALITY_POOL.length],
  };
};

// Look up a suspect's stored voiceProfile, falling back to the
// deterministic derivation above so it's always populated.
export const resolveVoiceProfile = (suspects = [], name = '') => {
  const suspect = suspects.find((item) => `${item?.name || ''}`.trim() === `${name || ''}`.trim());
  if (suspect?.voiceProfile?.tone) {
    return suspect.voiceProfile;
  }
  return deriveVoiceProfile(name);
};

// Builds the evidence.voiceProfiles array for a set of participant names,
// always pulling from the case's existing, already-established suspect
// voiceProfile — never inventing a new one per evidence item.
export const buildVoiceProfilesForParticipants = (suspects = [], participantNames = []) => (
  Array.isArray(participantNames)
    ? participantNames
      .map((name) => `${name || ''}`.trim())
      .filter(Boolean)
      .map((name) => ({ name, voiceProfile: resolveVoiceProfile(suspects, name) }))
    : []
);

// ── Shared AI-JSON parsing ──────────────────────────────────────────────
// Mirrors the repair logic already used for full-case generation
// (strip code fences, fix Hebrew gershayim quotes, fall back to
// substring extraction) so every structured-content prompt in this
// pipeline can parse AI output the same forgiving way.

export const parseAiJson = (content = '') => {
  let cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
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

// ── Canonical gender resolution ─────────────────────────────────────────
// Single source of truth for a suspect's gender, used everywhere Hebrew
// text needs grammatical agreement (dialogue prompts, the Hebrew QA pass,
// document-writer resolution, interrogation). Priority: voiceProfile (the
// same field already used to pick a TTS voice) -> appearanceProfile -> the
// same deterministic per-name derivation already used to backfill both
// profiles - so an unset suspect still resolves to a stable, consistent
// gender instead of silently defaulting to masculine.

const VALID_GENDERS = new Set(['female', 'male']);

export const resolveGender = (suspect = {}) => {
  const fromVoice = `${suspect?.voiceProfile?.gender || ''}`.toLowerCase();
  if (VALID_GENDERS.has(fromVoice)) return fromVoice;

  const fromAppearance = `${suspect?.appearanceProfile?.gender || ''}`.toLowerCase();
  if (VALID_GENDERS.has(fromAppearance)) return fromAppearance;

  return deriveVoiceProfile(suspect?.name || '').gender;
};

const genderLabelHe = (gender) => (gender === 'female' ? 'אישה' : 'גבר');

// ── Hebrew quality: register-specific instruction blocks ───────────────
// Concise, reusable grammar/register guidance distilled from the
// hebrew-content-writer skill's core rules - not the whole skill dumped
// into every prompt. A shared core (gender agreement + anti-translation)
// plus one short register-specific addendum per content type, so each
// generator only pulls in what's relevant to what it's writing.

export const HEBREW_QUALITY_CORE = `כללי איכות עברית מחייבים:
- הקפד על התאמה דקדוקית מלאה של מגדר (זכר/נקבה) בין נושא, פועל, תואר וכינויי גוף - בגוף ראשון, שני ושלישי כאחד.
- אל תשתמש בצורת זכר כברירת מחדל - כל דמות כותבת/מדברת ומתוארת בהתאם למגדר שנמסר לך במפורש, לא בהתאם לניחוש מהשם.
- הימנע מתרגום מילולי מאנגלית ומבנים לא טבעיים (למשל "זה עושה סנס", שימוש יתר ב"אתה" הכללי, "בכדי" במקום "כדי").
- כתיב מלא לפי כללי האקדמיה ללשון (למשל תוכנה/שירות/תוכנית, לא תכנה/שרות/תכנית).`;

export const HEBREW_REGISTER = {
  whatsapp: `${HEBREW_QUALITY_CORE}
רישום: הודעות טקסט ישראליות טבעיות - יומיומיות, לא ספרותיות ולא מנומסות מדי.
מותר ורצוי: קיצורים, סלנג טבעי, משפטים קצרים וחסרי מילים כמו בהודעות אמיתיות.
אסור: ניסוח רשמי, משפטי נימוס ארוכים, עברית שנשמעת כמו תרגום.`,
  recording: `${HEBREW_QUALITY_CORE}
רישום: עברית מדוברת טבעית כמו שיחה אמיתית - לא כתיבה ספרותית ולא נאום.
שמור על היסוסים, קטיעות משפט וסגנון אישי כשמתאים לאישיות ולרמת הלחץ של הדובר.
אסור: עברית תקנית/ספרותית מדי, אלא אם זו ממש הדרך הטבעית שבה הדמות הזו מדברת.`,
  personalDocument: `${HEBREW_QUALITY_CORE}
רישום: כתיבה אישית בגוף ראשון (יומן/פתק/מכתב אישי) - לא מסמך רשמי.
כל התייחסות עצמית (אני, שלי, הרגשתי, חשבתי וכו') חייבת להתאים למגדר הכותב/ת.`,
  officialDocument: `${HEBREW_QUALITY_CORE}
רישום: עברית פורמלית ומקצועית - מסמך/דו"ח רשמי.
אסור סלנג, קיצורים או ניסוח יומיומי.`,
  suspectAlibi: `${HEBREW_QUALITY_CORE}
רישום: תיאור עובדתי בגוף שלישי של האליבי שהחשוד/ה מציג/ה - לא דיאלוג ולא מסמך רשמי.
שמור בדיוק על הטון התיאורי הקיים (ישיר/מהוסס/מפורט) - רק תקן התאמת מגדר ודקדוק.`,
};

// Explains, in general terms grounded in the two real participants, how
// Hebrew agreement direction flips between self-reference and addressing
// the other speaker - covers all four gender-pair combinations (female/
// male x female/male) with one rule instead of four hardcoded branches.
export const buildGenderDialogueNote = (participantA = {}, participantB = {}) => {
  const genderA = resolveGender(participantA);
  const genderB = resolveGender(participantB);

  return `מגדר הדוברים: ${participantA.name} - ${genderLabelHe(genderA)}. ${participantB.name} - ${genderLabelHe(genderB)}.
כלל התאמה מגדרית: כשדובר מדבר על עצמו (גוף ראשון: אני עשיתי/הייתי/חושב/חושבת וכו') ההתאמה היא למגדר הדובר עצמו. כשדובר פונה לדובר השני (גוף שני: אתה/את, פעלים ותארים המכוונים אליו/ה) ההתאמה היא למגדר המאזין/ת, לא למגדר הדובר.
לדוגמה: כש-${participantA.name} מדבר/ת על עצמו/ה, ההתאמה היא ל${genderLabelHe(genderA)}. כש-${participantA.name} פונה ל-${participantB.name}, ההתאמה היא ל${genderLabelHe(genderB)}. אותו כלל בכיוון ההפוך כש-${participantB.name} מדבר/ת.`;
};

// ── Hebrew QA: correction-only pass ─────────────────────────────────────
// Runs AFTER structured generation and BEFORE rendering/TTS. Strictly a
// grammar/agreement fixer, never a rewriter: it only ever sees raw text
// fields (never hiddenClue/primaryClue/solution), and any output that
// looks like more than a surgical edit (too big a length swing, too
// little word overlap with the original) is rejected in favor of the
// original text - the same validate-or-fall-back-to-safe-default pattern
// already used everywhere else in this pipeline (namesAreValid, etc).

const stripPunctuation = (text = '') => text.replace(/[^\p{L}\p{N}\s]/gu, ' ');

const tokenSet = (text = '') => new Set(
  stripPunctuation(text).split(/\s+/).filter(Boolean),
);

// Accepts small, local edits (a gender suffix, a swapped pronoun) and
// rejects anything that reads like a rewrite: too big a length swing, or
// too few of the original words surviving untouched.
const isSurgicalEdit = (original = '', corrected = '') => {
  const a = `${original}`.trim();
  const b = `${corrected}`.trim();
  if (!b) return false;
  if (a === b) return true;

  const lengthRatio = b.length / Math.max(1, a.length);
  if (lengthRatio < 0.6 || lengthRatio > 1.6) return false;

  const setA = tokenSet(a);
  if (setA.size === 0) return true;
  const setB = tokenSet(b);
  const shared = [...setA].filter((token) => setB.has(token)).length;
  return (shared / setA.size) >= 0.55;
};

const buildHebrewQaSystemPrompt = (registerBlock, extraInstruction = '') => `אתה עורך/ת לשוני שמתקן/ת אך ורק טעויות עברית בטקסט קיים - אינך כותב/ת מחדש ואינך משפר/ת סגנון.
${registerBlock}

חוקי ברזל של התיקון:
- מותר לתקן רק: התאמת מגדר (זכר/נקבה), כינויי גוף, התאמת פועל/תואר לנושא, טעויות דקדוק עבריות ברורות, ותרגומים מילוליים לא טבעיים בעליל.
- אסור בהחלט: לשנות משמעות, עובדות, שמות, מספרים, זמנים, רמזים, אישיות, סלנג טבעי, אורך המשפט, או להוסיף/להסיר מידע.
- אסור להפוך טקסט יומיומי לפורמלי או להפך - שמור בדיוק על הרישום המקורי.
- אם משפט כבר תקין דקדוקית, החזר אותו מילה במילה כפי שהוא, בלי לגעת בו.
${extraInstruction}הקלט מסומן "דובר: <שם> | טקסט: <תוכן>" רק כדי שתדע איזה מגדר להתאים - התווית "דובר:" ושם הדובר הם מידע-עזר בלבד ואינם חלק מהמשפט. בפלט שלך, כל איבר במערך "corrected" חייב להכיל את תוכן המשפט המתוקן בלבד - בלי מספור, בלי "דובר:", בלי שם הדובר, בלי "טקסט:" ובלי סוגריים מרובעים.
החזר אך ורק JSON בפורמט {"corrected": ["טקסט 0 מתוקן", "טקסט 1 מתוקן", ...]}, באותו סדר ובדיוק אותו מספר איברים כמו הרשימה שתקבל.`;

// Defensive strip only - never invents content. Guards against the model
// echoing the "דובר: X | טקסט:" context label (or a legacy "[שם]" style
// prefix it may associate with Hebrew chat transcripts) back into the
// corrected sentence itself, which would otherwise leak into rendered
// bubbles and, for recordings, get read aloud by ElevenLabs. Strips a
// leading occurrence of the item's own known speaker name first (catches
// partial/malformed variants like a dropped opening bracket), then any
// generic numbering/label prefix as a second pass.
//
// The name-specific strip requires an actual label delimiter (a bracket,
// colon, pipe or dash) right after the name - not just whitespace. Some
// content (e.g. a suspect's third-person alibi) legitimately opens with
// the same name runHebrewQa was given for gender context ("נועה כרמלי
// טענה ש..."), and that's real sentence content, not a leaked label -
// only "[נועה כרמלי] ..." / "נועה כרמלי: ..." / "נועה כרמלי] ..." style
// artifacts should ever be stripped.
const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripLeadingSpeakerLabel = (text = '', speakerName = '') => {
  let result = `${text}`.trim();

  if (speakerName) {
    const nameLabel = new RegExp(`^\\s*\\[?\\s*${escapeRegExp(speakerName)}\\s*(?:\\]|[:|\\-])\\s*`, 'u');
    result = result.replace(nameLabel, '');
  }

  return result
    .replace(/^\s*(?:\d+\s*[.):|-]\s*)?(?:דובר\s*:\s*[^|]*\|\s*)?(?:טקסט\s*:\s*)?/u, '')
    .replace(/^\s*\[[^\]]*\]\s*[:\-]?\s*/u, '')
    .trim();
};

// items: [{ speaker?, text }]. speakerGenders: { [name]: 'female'|'male' }.
// Best-effort: any failure (network, parse, validation) falls back to the
// original items completely unchanged - the QA pass must never be able to
// block or degrade evidence generation.
export const runHebrewQa = async ({
  generateAiText, items, registerBlock, speakerGenders = {}, extraInstruction = '',
}) => {
  if (!Array.isArray(items) || items.length === 0) return items;

  const genderLines = Object.entries(speakerGenders)
    .map(([name, gender]) => `${name}: ${genderLabelHe(gender)}`)
    .join(', ');

  const numbered = items
    .map((item, index) => `${index} | ${item.speaker ? `דובר: ${item.speaker} | ` : ''}טקסט: ${item.text}`)
    .join('\n');

  const system = buildHebrewQaSystemPrompt(registerBlock, extraInstruction);
  const user = `מגדרי הדוברים: ${genderLines || 'לא רלוונטי'}.
תקן את הטקסטים הבאים אם וכאשר יש טעות, לפי החוקים שניתנו. זכור: החזר רק את תוכן המשפט המתוקן, בלי התווית "דובר:" ובלי שם הדובר.
${numbered}`;

  let raw;
  try {
    raw = await generateAiText(system, user);
  } catch {
    return items;
  }

  let corrected;
  try {
    const parsed = parseAiJson(raw);
    corrected = Array.isArray(parsed?.corrected) ? parsed.corrected : null;
  } catch {
    // A single-item request sometimes comes back as a bare corrected
    // sentence instead of the requested JSON envelope, despite the system
    // prompt asking for JSON. Only trust that as a valid response when
    // there's exactly one item - the mapping is then unambiguous - and it
    // still goes through the exact same stripLeadingSpeakerLabel +
    // isSurgicalEdit validation below as the JSON path, so this never
    // relaxes what counts as an acceptable correction.
    corrected = items.length === 1 ? [raw] : null;
  }

  if (!corrected || corrected.length !== items.length) return items;

  return items.map((item, index) => {
    const candidate = stripLeadingSpeakerLabel(corrected[index] ?? '', item.speaker);
    return isSurgicalEdit(item.text, candidate)
      ? { ...item, text: candidate }
      : item;
  });
};
