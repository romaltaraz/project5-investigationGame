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
