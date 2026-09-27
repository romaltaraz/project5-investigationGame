// services/fluxImage.js
//
// Real photo evidence via NVIDIA's hosted FLUX.1-dev image-generation
// endpoint — NVIDIA's "genai" gateway (https://ai.api.nvidia.com/v1/genai),
// which is a completely different API shape than the OpenAI-compatible
// chat/completions endpoint (integrate.api.nvidia.com) used everywhere
// else in this project for text. Two responsibilities:
//
//   1. buildImagePrompt(evidence, suspects, context) — deterministic,
//      code-only prompt construction from the evidence blueprint. No AI
//      call here: the structured blueprint (visualDetails/location/time/
//      participants -> appearanceProfile) IS the source of truth, so the
//      main LLM is never asked to "invent" an image prompt, and a
//      character's stored appearanceProfile is always reused verbatim
//      rather than regenerated per evidence item.
//
//   2. generateFluxImage(prompt, overrides) — the actual HTTP call.
//      NVIDIA's Cloud-Functions-backed "genai" endpoints can respond
//      either synchronously (200) or, if generation takes longer than
//      the requested block window, asynchronously (202 + NVCF-REQID to
//      poll) — both paths are handled here.
//
// Renderer contract this replaces (see the old renderPhotoSvg in
// evidenceAssets.js): returns { buffer, mimeType, extension } instead of
// an HTML/SVG string, since the output here is a real raster image, not
// markup. evidenceAssets.js still owns the actual fs.writeFile + asset
// envelope, exactly as it does for whatsappEvidence.js/documentEvidence.js.

import { seedFromName } from './evidenceBlueprint.js';

const FLUX_BASE_URL = 'https://ai.api.nvidia.com/v1/genai';
const NVCF_STATUS_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/status';

const REQUEST_TIMEOUT_MS = 180000; // FLUX at default steps can legitimately take over a minute
const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 40; // ~160s of polling on top of the initial synchronous block

// ── Capture-profile model ────────────────────────────────────────────────
// A photo's believability comes from "how did this image actually come to
// exist" (who held what camera, how far away, in what light) — not from
// generic aesthetic language. Each profile below is a distinct, semantically
// grounded photographic source. Picked deterministically from the evidence's
// own text/time/participants (see resolveCaptureProfile) — no extra AI call,
// no new schema field, and never a random/blind choice.
//
// Dimensions are all multiples of 64 (safe bucket sizes for a FLUX-class
// endpoint) at roughly the same total pixel count as the old fixed
// 1024x1024 default, so per-image latency/cost doesn't change. The frontend
// lightbox renders via `object-fit: contain` with no fixed aspect ratio, so
// varying them per profile is safe (see frontend/src/styles/components/
// game.css .image-lightbox__img).

const DIMS = {
  square: { width: 1024, height: 1024 },
  landscapeWide: { width: 1216, height: 832 }, // ~3:2, distant/establishing scenes
  landscape43: { width: 1152, height: 896 }, // ~4:3, CCTV-like / indoor establishing
  portraitPhone: { width: 832, height: 1216 }, // ~2:3, handheld vertical phone shot
};

const CAPTURE_PROFILES = {
  cctv: {
    id: 'cctv',
    camera: 'Image grabbed from a fixed CCTV security camera bolted high in a wall or ceiling corner, wide-angle lens, the same unchanging viewpoint it always has.',
    framing: 'Wide static field of view looking down across the whole room from the high mount, slight wide-angle stretching toward the edges, anything of interest sits small and off-center rather than composed in the frame.',
    lighting: 'Flat institutional lighting (fluorescent/sodium) that is simply whatever the room normally has on, harsh overexposed patches near the fixtures and dim underexposed corners, low dynamic range.',
    quality: 'Low-resolution video-grab quality, visible compression blocking and mild interlacing, muted desaturated color, slight smear on anything that moved.',
    depthOfField: 'Deep focus, everything in the frame is in focus, no artistic blur.',
    dims: DIMS.landscape43,
  },
  telephoto: {
    id: 'telephoto',
    camera: 'Photo taken from a distance with a telephoto or digital zoom lens, likely a phone or compact camera held by someone observing from across a street, a parked car, or through a gap.',
    framing: 'Subject small and distant within the frame, compressed telephoto perspective, partially obstructed by a plausible foreground element (railing, window edge, parked vehicle, foliage).',
    lighting: 'Natural ambient outdoor or window light, exposed realistically for the distance rather than for the subject.',
    quality: 'Visible zoom softness and grain, mild atmospheric haze, slight handheld motion blur.',
    depthOfField: 'Mild telephoto compression of the background, not an artistic bokeh blur.',
    dims: DIMS.landscapeWide,
  },
  phone_flash: {
    id: 'phone_flash',
    camera: 'Handheld smartphone photo taken at night with the built-in flash fired.',
    framing: 'Casual handheld framing, slightly off-level horizon, subject roughly centered but imperfectly cropped like a quick grab-shot.',
    lighting: 'Hard direct on-axis flash falloff — subject and nearby surfaces overexposed and flat, background dropping quickly into near-black.',
    quality: 'Visible sensor noise in the dark background, mild red-eye or flash glare on reflective surfaces, realistic phone-camera sharpening halos.',
    depthOfField: 'Small-sensor phone depth of field, background rendered as dark and undetailed rather than smoothly blurred.',
    dims: DIMS.portraitPhone,
  },
  phone_night: {
    id: 'phone_night',
    camera: 'Handheld smartphone photo taken at night without flash, relying on computational low-light processing.',
    framing: 'Casual handheld framing, natural imperfect composition, not centered or staged.',
    lighting: 'Only the light actually present in the place — a wall light, a doorway, a single lamp — dim and uneven, with deep shadows away from it.',
    quality: 'Visible high-ISO sensor noise/grain, slight smearing from computational noise reduction, faint motion blur from a long handheld exposure.',
    depthOfField: 'Shallow phone-sensor depth of field only on very close subjects, otherwise mostly in focus but soft from noise reduction.',
    dims: DIMS.portraitPhone,
  },
  night_ambient: {
    id: 'night_ambient',
    camera: 'Photo of an empty or near-empty scene at night, taken by a handheld camera or phone left to a longer exposure, no people in frame close enough to matter.',
    framing: 'Wide environmental framing showing the space itself, natural unstaged perspective at normal standing height.',
    lighting: 'Available night lighting only — interior lights, or a single outside light — with real pools of light and darkness, no artificial fill.',
    quality: 'Visible grain in the shadows, slight chromatic noise, a little softness from a longer hand-held exposure.',
    depthOfField: 'Normal deep-ish focus typical of a wide night shot, background readable but not crisp.',
    dims: DIMS.landscapeWide,
  },
  phone_candid_crowd: {
    id: 'phone_candid_crowd',
    camera: 'Casual handheld smartphone snapshot taken in a crowded social setting (party, bar, event).',
    framing: 'Busy, imperfect framing with other people and background clutter in shot, subject not isolated from the crowd, slightly tilted or off-center like a quick candid grab.',
    lighting: 'Mixed indoor social lighting — warm practicals, some harsh overhead spots, uneven skin tones.',
    quality: 'Typical phone-camera compression, mild motion blur from a moving subject or crowd, natural imperfect exposure.',
    depthOfField: 'Shallow-ish phone depth of field on the near subject only, background a believable blur of people and shapes, not a clean bokeh.',
    dims: DIMS.landscape43,
  },
  phone_snapshot: {
    id: 'phone_snapshot',
    camera: 'Ordinary handheld smartphone photograph, the kind someone takes casually of a person or moment in front of them.',
    framing: 'Natural handheld composition, not perfectly centered, realistic phone field of view, ordinary standing-eye-level perspective.',
    lighting: 'Ordinary available light for the scene — daylight through a window, room lighting, or outdoor daylight — natural white balance, no dramatic contrast.',
    quality: 'Realistic computational-photography look: slight oversharpening, natural phone dynamic range, no professional retouching.',
    depthOfField: 'Believable phone-camera depth of field — subject in focus, background softly but not artistically blurred.',
    dims: DIMS.portraitPhone,
  },
  documentary_closeup: {
    id: 'documentary_closeup',
    camera: 'Close-up documentary photograph of a specific object or detail, taken from roughly arm\'s length, phone macro-style or a simple point-and-shoot.',
    framing: 'Tight framing centered on the object itself, filling most of the frame, shot straight-on or at a slight practical angle, no people in shot.',
    lighting: 'Ordinary available light — indoor room light or daylight — realistic shadows cast by the object itself, no studio lighting setup.',
    quality: 'Realistic close-focus softness at the edges, natural texture detail on the object, no artificial glow or product-photo polish.',
    depthOfField: 'Shallow close-focus depth of field typical of a phone macro shot — the object sharp, immediate surroundings falling softly out of focus.',
    dims: DIMS.square,
  },
  documentary_outdoor: {
    id: 'documentary_outdoor',
    camera: 'Plain outdoor documentary photograph of the location itself, taken at normal standing eye level with an ordinary camera or phone.',
    framing: 'Natural wide environmental framing of the outdoor scene, unstaged, realistic perspective, no people isolated or posed.',
    lighting: 'Natural daylight or overcast light appropriate to the scene, realistic outdoor shadows and white balance.',
    quality: 'Ordinary photographic clarity with natural imperfections — slight lens distortion at the edges, realistic exposure, no added grain or filter.',
    depthOfField: 'Normal deep focus typical of an environmental outdoor shot.',
    dims: DIMS.landscapeWide,
  },
  documentary_indoor: {
    id: 'documentary_indoor',
    camera: 'Plain indoor documentary photograph of the location itself, taken at normal standing eye level with an ordinary camera or phone.',
    framing: 'Natural room-level framing showing the space as it actually looks, unstaged, realistic perspective, no people isolated or posed.',
    lighting: 'Ordinary indoor lighting for the room type (overhead fixtures, window light), realistic mixed color temperature, no dramatic contrast.',
    quality: 'Ordinary photographic clarity with natural imperfections — realistic exposure, mild lens distortion, no added grain or filter.',
    depthOfField: 'Normal deep-ish focus typical of a plain interior shot.',
    dims: DIMS.landscape43,
  },
};

// One plain lead sentence per profile: WHAT this image is and why it exists.
// It goes FIRST in the built prompt (before any camera mechanics) so the
// model commits to "a real photo taken for a practical reason" instead of
// "a cinematic image representing a scene". Same ids as CAPTURE_PROFILES.
const CAPTURE_LEAD = {
  cctv: 'A still frame from a fixed indoor security camera — a routine surveillance capture, not a composed photograph.',
  telephoto: 'A photo taken quietly from a distance by someone watching, without the subject aware of the camera.',
  phone_flash: 'A quick phone snapshot grabbed in the dark with the flash on.',
  phone_night: 'A casual hand-held phone photo taken at night, grabbed quickly rather than set up.',
  night_ambient: 'A plain record shot of a mostly empty place at night, taken just to show how it looked.',
  phone_candid_crowd: 'An offhand phone snapshot taken in a busy social setting.',
  phone_snapshot: 'An ordinary phone snapshot of whatever was in front of the person.',
  documentary_closeup: 'A plain close-up photo taken to document one specific object.',
  documentary_outdoor: 'A plain photo taken to document an outdoor location as it looked.',
  documentary_indoor: 'A plain photo taken to document an indoor location as it looked.',
};

const resolveCaptureLead = (id) => CAPTURE_LEAD[id] || CAPTURE_LEAD.documentary_indoor;

// ── Deterministic Hebrew→English environment anchor ─────────────────────
// The evidence blueprint's scene fields (location / primaryClue /
// visualDetails / description) are authored in Hebrew (see
// caseFactory.js buildEvidencePrompt), and FLUX.1-dev's text encoders do
// not understand Hebrew — so those fields currently reach the model as
// noise. Full deterministic translation of free Hebrew prose is not
// possible here without a translation service or a second AI call (both
// explicitly out of scope), BUT the single most important structural fact
// for the image — "what kind of place is this" — can be recovered from a
// small, high-precision keyword table, in exactly the same spirit as the
// SECURITY/OBSERVATION keyword tables above. Since `visualPromptEn` landed
// (see the notes at the end of this file) this is the FALLBACK path for
// photo evidence that has no English description — plus a light reinforcement
// of the environment even when it does. Order matters — first match wins.
const ENV_ANCHORS = [
  [/ספריי?|חדר קריאה|אולם קריאה|חדר עיון/, 'an indoor library / reading room, with bookshelves, reading tables and chairs'],
  [/חדר ישיבות/, 'an indoor meeting room built around one large table'],
  [/משרד|לשכה|תא עבודה/, 'an ordinary indoor office with desks, chairs and office equipment'],
  [/מסדרון|פרוזדור/, 'a plain interior corridor'],
  [/חדר מדרגות|גרם מדרגות/, 'an indoor concrete stairwell'],
  [/מעלית/, 'the inside of an elevator car'],
  [/חניון|מגרש חנייה|מרתף חניה/, 'a parking garage'],
  [/מטבח/, 'a kitchen'],
  [/מעבדה/, 'a laboratory room with work benches'],
  [/מחסן|מרתף/, 'a storage room / warehouse space'],
  [/לובי|דלפק קבלה|רחבת כניסה/, 'a building lobby / reception area'],
  [/כיתה|אולם הרצאות/, 'a classroom / lecture room'],
  [/מרפאה|חדר טיפול|בית חולים|מיון/, 'a clinic / hospital treatment room'],
  [/מועדון|פאב|בר לילה/, 'a bar / nightclub interior'],
  [/חדר שינה/, 'an ordinary bedroom'],
  [/סלון|מטבחון|דירה/, 'an ordinary residential interior'],
  [/רחוב|מדרכה|סמטה|חניה חיצונית/, 'an outdoor street / pavement'],
  [/גינה|חצר|פארק/, 'an outdoor yard / garden'],
];

const resolveEnvAnchor = (haystack = '') => {
  for (const [pattern, phrase] of ENV_ANCHORS) {
    if (pattern.test(haystack)) return phrase;
  }
  return '';
};

// "מעקב"/"אבטחה" alone are ambiguous in Hebrew (can mean "video surveillance"
// just as easily as "tailing a person" or "security" in the abstract) — CCTV
// is only inferred when an actual camera is named, so a phrase like "מעקב
// חיצוני אחרי הבניין" (a person tailing/watching the building) correctly
// falls through to OBSERVATION_KEYWORDS below instead of being claimed here.
const SECURITY_KEYWORDS = /מצלמת אבטחה|מצלמות אבטחה|מצלמת מעקב|מצלמה[^.]{0,10}(אבטחה|מעקב)|cctv|security camera|surveillance camera/i;
const OBSERVATION_KEYWORDS = /מרחוק|עוקב|עוקבת|מעקב|מהצד השני|בסתר|מסתתר|מציץ|זום|טלה|hidden observation|across the street|from a distance|telephoto|zoom(?:ed)?|stakeout|tailing|following/i;
const CROWD_KEYWORDS = /מסיבה|אירוע חברתי|המונים|קהל|ברים?|מועדון|party|crowd(?:ed)?|club|nightclub/i;
const FLASH_KEYWORDS = /פלאש|flash photo/i;
const NIGHT_KEYWORDS = /לילה|חושך|אפל|night(?:time)?|after dark/i;
const PHONE_KEYWORDS = /טלפון|נייד|סמארטפון|smartphone|phone camera|selfie/i;
const CLOSEUP_KEYWORDS = /תקריב|מקרוב|טביע|עקבות|כתם|חפץ בודד|close-?up|macro|fingerprint|footprint|\bstain\b/i;
const OUTDOOR_KEYWORDS = /רחוב|חוץ|חניה|גינה|מדרכה|כניסה חיצונית|street|outdoor|parking lot|sidewalk|\balley\b/i;

const buildClassificationHaystack = (evidence = {}) => [
  evidence.description,
  evidence.purpose,
  evidence.primaryClue,
  evidence.secondaryClue,
  evidence.location,
  ...(Array.isArray(evidence.visualDetails) ? evidence.visualDetails : []),
].filter(Boolean).join(' ');

// 22:00-05:59 only — evidence timestamped in the early evening (e.g. 21:xx)
// still reads as ordinary indoor/daylight-adjacent, not full night.
const isNightScene = (time, haystack) => {
  const hour = parseInt(`${time || ''}`.split(':')[0], 10);
  if (!Number.isNaN(hour) && (hour >= 22 || hour < 6)) return true;
  return NIGHT_KEYWORDS.test(haystack);
};

// Deterministic English time-of-day + lighting line from the HH:MM string
// (which is already language-neutral). Used instead of relying on the
// Hebrew scene text to carry the "it was the middle of the night" fact.
// Deliberately plain — ordinary available light, never "moody" or "golden".
const resolveTimeContext = (time) => {
  const raw = `${time || ''}`.trim();
  const hour = parseInt(raw.split(':')[0], 10);
  if (Number.isNaN(hour)) return '';
  const stamp = /^\d{1,2}:\d{2}$/.test(raw) ? `roughly ${raw}, ` : '';
  if (hour >= 22 || hour <= 4) return `Time: ${stamp}the middle of the night — only the dim, uneven light the place leaves on overnight, with genuinely dark areas, no daylight.`;
  if (hour >= 5 && hour <= 7) return `Time: ${stamp}early morning before full daylight — weak grey light, still dim.`;
  if (hour >= 8 && hour <= 17) return `Time: ${stamp}daytime — ordinary, fairly even natural light.`;
  return `Time: ${stamp}evening — fading daylight or the first interior lights, low but not pitch dark.`;
};

// Semantic, deterministic capture-source selection — never random. Order
// matters: more specific/confident signals (a camera explicitly mentioned,
// an explicit observation-from-a-distance framing, a deliberate close-up-
// on-an-object clue) are checked before the broader time-of-day/participants
// heuristics, since a generic "it's late" timestamp shouldn't override a
// much more specific visual signal. If nothing matches confidently, falls to
// a plain indoor/outdoor documentary shot rather than a "forensic photo"
// default — the brief was "someone actually took this photo," not "an AI
// generated an investigation image."
const resolveCaptureProfile = (evidence = {}, { location = '', time = '', participants = [] } = {}) => {
  const haystack = buildClassificationHaystack(evidence);

  if (SECURITY_KEYWORDS.test(haystack)) return CAPTURE_PROFILES.cctv;
  if (OBSERVATION_KEYWORDS.test(haystack)) return CAPTURE_PROFILES.telephoto;
  if (participants.length === 0 && CLOSEUP_KEYWORDS.test(haystack)) return CAPTURE_PROFILES.documentary_closeup;

  if (isNightScene(time, haystack)) {
    if (CROWD_KEYWORDS.test(haystack) || FLASH_KEYWORDS.test(haystack)) return CAPTURE_PROFILES.phone_flash;
    if (participants.length > 0) return CAPTURE_PROFILES.phone_night;
    return CAPTURE_PROFILES.night_ambient;
  }

  if (CROWD_KEYWORDS.test(haystack)) return CAPTURE_PROFILES.phone_candid_crowd;
  if (PHONE_KEYWORDS.test(haystack)) return CAPTURE_PROFILES.phone_snapshot;
  if (participants.length > 0) return CAPTURE_PROFILES.phone_snapshot;
  if (OUTDOOR_KEYWORDS.test(`${location} ${haystack}`)) return CAPTURE_PROFILES.documentary_outdoor;
  return CAPTURE_PROFILES.documentary_indoor;
};

// ── Difficulty → visual prominence (NOT a second difficulty system) ─────
// Reuses the same case-level `difficulty` field already threaded through
// generateEvidenceAssets for recordings/messages. Only changes how easy the
// primaryClue is to spot in the frame — never invents/removes facts, and
// never allowed to make the clue truly unreadable. Mirrors the
// DIFFICULTY_GUIDANCE idiom in recordingEvidence.js, scoped to framing
// instead of dialogue.
const CLUE_VISIBILITY_BY_DIFFICULTY = {
  easy: 'Keep this detail clearly visible and easy to notice at a glance — well lit, in focus, unobstructed.',
  medium: 'Let this detail sit naturally in the scene rather than being spotlighted as the focal point — easy to overlook on a quick glance, but fully visible, in focus and unmistakable on a proper look.',
  hard: 'Keep this detail understated and not the first thing the eye lands on — worked naturally into the scene, not highlighted — but still fully visible, in focus and clearly identifiable on a careful look. Never hidden, cropped out, blurred, or too small to make out.',
};

const resolveClueVisibility = (difficulty) => CLUE_VISIBILITY_BY_DIFFICULTY[difficulty] || CLUE_VISIBILITY_BY_DIFFICULTY.medium;

// ── Negative constraints, split by intent ──────────────────────────────
// ALWAYS_NEGATIVE kills the "AI cinematic image" tells and fake overlays.
// The readable-text rule is SEPARATE and conditional (resolveTextPolicy):
// some evidence — a badge, a document, a label, a plate — only works if the
// physical object is allowed to carry its own text. We forbid invented
// UI/caption/watermark text always, but forbid ALL text only when nothing
// in the evidence implies a physical object that legitimately has text.
const ALWAYS_NEGATIVE = 'Not an illustration, render, painting or anime. No cinematic or teal-and-orange color grading, no lens flare, no vignette, no dramatic or glamorous lighting, no shallow-focus bokeh, no posed models, no centered movie-poster framing. No added interface, watermark, logo, caption or fake burnt-in timestamp overlay.';

const REALISM_BLOCK = 'Look: a real photo already sitting in a case file — ordinary phone or camera quality, plain imperfect framing, slightly uneven exposure, unremarkable and a little dull, natural colors.';

// Signals that the evidence depends on a physical object that legitimately
// carries text/numbers (Hebrew + English). Matched against the same
// classification haystack used for capture-profile selection.
const PHYSICAL_TEXT_KEYWORDS = /תג|תעוד|תווית|שלט|מסמך|חשבונית|קבל[הת]|פתק|מכתב|רישום|לוחית|לוח מספר|מספר רישוי|רישוי|טופס|כרטיס|דרכון|רישיו|ברקוד|חתימה|חותמת|כיתוב|כתוב|מדבק|badge|id card|identification|licen[sc]e|passport|\bdocument\b|invoice|receipt|\bnote\b|\bletter\b|\blabel\b|\bsign\b|number ?plate|license ?plate|\bform\b|\bticket\b|barcode|serial|signature|\bstamp\b|handwrit/i;

const resolveTextPolicy = (haystack = '') => (PHYSICAL_TEXT_KEYWORDS.test(haystack)
  ? 'Text may appear only on the real objects that naturally carry it (a badge, ID card, document, label, sign); keep it minimal and plausible, and none anywhere else.'
  : 'No readable text, lettering or numbers anywhere in the image.');

// ── Prompt construction ──────────────────────────────────────────────────
// Character consistency: a participant's appearance is looked up from the
// suspect's OWN stored appearanceProfile (established once at case-generation
// time) and never re-derived or reworded here — same attributes, every
// single evidence item. Rendered as natural English rather than a raw
// comma-attribute dump so the model reads it as a description of a person.

const GENDER_WORD = { female: 'woman', male: 'man' };

const describeAppearance = (appearanceProfile = {}) => {
  const profile = appearanceProfile || {};
  const hasAny = ['age', 'gender', 'hair', 'eyes', 'skinTone', 'bodyType', 'clothingStyle']
    .some((key) => profile[key])
    || (Array.isArray(profile.distinctiveFeatures) && profile.distinctiveFeatures.length > 0);
  if (!hasAny) return 'an adult, ordinary and unremarkable in appearance, plainly dressed';

  const who = GENDER_WORD[`${profile.gender || ''}`.toLowerCase()] || 'person';
  const lead = profile.age ? `a ${who}, about ${profile.age} years old` : `a ${who}`;
  const traits = [
    profile.hair || '',
    profile.eyes ? `${profile.eyes} eyes` : '',
    profile.skinTone ? `${profile.skinTone} skin` : '',
    profile.bodyType || '',
    profile.clothingStyle ? `wearing ${profile.clothingStyle}` : '',
    ...(Array.isArray(profile.distinctiveFeatures) ? profile.distinctiveFeatures : []),
  ].filter(Boolean);

  return traits.length ? `${lead}, with ${traits.join(', ')}` : lead;
};

// context: { caseId, index, caseName, briefingDetails, difficulty } — caseId
// + index give the seed identity (see below); the rest are the same
// case-level facts the old (evidence, suspects, caseData) signature already
// carried, just gathered into one object so difficulty can ride along
// without yet another positional parameter.
export const buildImagePrompt = (evidence = {}, suspects = [], context = {}) => {
  const {
    caseId = '', index = 0, briefingDetails = {}, difficulty = 'medium',
  } = context;

  const location = evidence.location || briefingDetails?.incidentLocation || '';
  const time = evidence.timeline?.time || briefingDetails?.incidentTime || '';
  const participants = Array.isArray(evidence.participants) ? evidence.participants : [];

  // One appearance block per participant, in order — pulled verbatim from
  // each suspect's stored appearanceProfile, never reworded per evidence.
  const people = participants
    .map((name) => {
      const suspect = suspects.find((s) => `${s?.name || ''}`.trim() === `${name || ''}`.trim());
      return describeAppearance(suspect?.appearanceProfile);
    })
    .filter(Boolean);

  const profile = resolveCaptureProfile(evidence, { location, time, participants });
  const timeContext = resolveTimeContext(time);

  // visualPromptEn (photo-evidence blueprint field): a 1–3 sentence English
  // factual description of what the photo shows, produced by the SAME
  // case-generation LLM call that emits the Hebrew fields (no extra call, no
  // translation model — see caseFactory.js buildEvidencePrompt). When it is
  // present it is the PRIMARY semantic scene description; the Hebrew
  // `primaryClue` / `visualDetails` (which FLUX cannot reliably ground) are
  // then dropped from the prompt rather than duplicated. When it is absent
  // (older cases, or a generation that omitted it) the prompt falls back to
  // exactly the previous behaviour: Hebrew primaryClue + visualDetails +
  // the deterministic environment anchor.
  const visualPromptEn = `${evidence.visualPromptEn || ''}`.trim();
  const hasVisualEn = visualPromptEn.length > 0;

  // Text-policy / environment detection also sees the English description so
  // an ID badge / document named only in visualPromptEn still gets the
  // right text rule and environment class.
  const haystack = buildClassificationHaystack(evidence);
  const semanticHaystack = hasVisualEn ? `${haystack} ${visualPromptEn}` : haystack;
  const envAnchor = resolveEnvAnchor(`${location} ${semanticHaystack}`);

  // The Hebrew blueprint fields are free prose and often end with their own
  // full stop — trim it so it doesn't collide with the sentence we wrap
  // them in.
  const cleanLocation = `${location}`.replace(/\s*[.。]\s*$/, '').trim();
  const cleanPrimaryClue = `${evidence.primaryClue || ''}`.replace(/\s*[.。]\s*$/, '').trim();

  // 1. WHAT is happening — kind of photo + how many people are in it.
  const shotType = people.length >= 2
    ? 'Two people are together in one place; show both of them clearly and show that they are interacting.'
    : people.length === 1
      ? 'One person is present in the place; show them clearly.'
      : 'No people are anywhere in the frame — the subject is the place itself and one physical detail in it.';

  // 2. WHAT WAS CAPTURED — the English scene description, verbatim, as the
  //    load-bearing semantic content of the whole prompt.
  const scenePart = hasVisualEn ? visualPromptEn : '';

  // 3. WHO — explicit per-person blocks (skipped when there are no people).
  const peopleBlock = people.length
    ? people.map((p, i) => `Person ${i + 1}: ${p}.`).join(' ')
    : '';

  // 4. WHERE — the Hebrew sub-location verbatim, plus a deterministic
  //    English environment class so the setting still lands for FLUX. Kept
  //    even when visualPromptEn is present: it is short, and it reinforces
  //    rather than restates the environment.
  const whereParts = [
    cleanLocation ? `Location: ${cleanLocation}.` : '',
    envAnchor ? `The place is ${envAnchor}.` : '',
  ].filter(Boolean);

  // 5. PRIMARY CLUE — always physically present and identifiable in frame;
  //    difficulty only tunes how prominent. With visualPromptEn present the
  //    clue is already named there in English, so this only reinforces its
  //    prominence instead of re-injecting the Hebrew `primaryClue` (which is
  //    the logical/investigative clue and can carry conclusions — those must
  //    never reach the image). secondaryClue / purpose stay out entirely.
  const cluePart = hasVisualEn
    ? `The primary physical clue in that description is the single most important thing in the photograph: a real object in the scene, plainly visible and identifiable, never rendered as text over the image. ${resolveClueVisibility(difficulty)}`
    : (cleanPrimaryClue
      ? `The whole reason this photo exists, and the thing it must clearly show: ${cleanPrimaryClue}. It is a real physical object or detail in the scene, plainly visible — never shown as text over the image. ${resolveClueVisibility(difficulty)}`
      : '');

  // 6. SUPPORTING VISIBLE DETAIL — only the Hebrew visualDetails, and only
  //    as a fallback: when visualPromptEn exists it already covers what is
  //    visible, so this is skipped to avoid piling untranslatable text on.
  const detailPart = (!hasVisualEn && Array.isArray(evidence.visualDetails) && evidence.visualDetails.length)
    ? `Also visible: ${evidence.visualDetails.join('; ')}.`
    : '';

  // Content-first ordering: what / what-was-captured / who / where / clue /
  // detail / time come BEFORE the capture mechanics and the realism/negative
  // language, so the evidence drives the image and the photographic style
  // only supports it. Only the three most defining capture-profile fields
  // are emitted (camera, framing, quality) — the profile's `lighting` is
  // already covered by the time-of-day line and `depthOfField` by the
  // realism line — so the style language stays a supporting clause instead
  // of swamping the evidence.
  const prompt = [
    resolveCaptureLead(profile.id), // 1  what the photograph is
    shotType, // 1
    scenePart, // 2  visualPromptEn
    peopleBlock, // 3  people / appearance
    ...whereParts, // 4  location / environment
    cluePart, // 5  primary visual clue
    detailPart, // 6  visualDetails (fallback only)
    timeContext, // 7  time
    `Capture: ${profile.camera} ${profile.framing} ${profile.quality}`, // 8  capture method
    REALISM_BLOCK, // 9  photorealism
    ALWAYS_NEGATIVE, // 10 negative constraints
    resolveTextPolicy(semanticHaystack), // 10
  ].filter(Boolean).join(' ');

  // Deterministic per-item seed instead of a fixed 0 for every image: same
  // evidence (same caseId+index+capture profile) always reproduces the same
  // seed, but different evidence items normally land on different seeds —
  // which, combined with the profile's own distinct dims/framing, is what
  // actually breaks the "every photo looks like the same shot" pattern a
  // shared fixed seed was contributing to. Reuses the existing generic
  // string hash already exported for writing/voice-profile derivation
  // rather than adding a second hashing implementation.
  const seed = seedFromName(`${caseId}:${index}:${profile.id}`);

  return {
    prompt,
    width: profile.dims.width,
    height: profile.dims.height,
    seed,
    captureProfile: profile.id,
  };
};

// ── NVIDIA FLUX request ───────────────────────────────────────────────────

const IMAGE_DEFAULTS = {
  height: 1024,
  width: 1024,
  cfg_scale: 3.5,
  steps: 50,
  seed: 0,
};

const pollForResult = async (reqId, apiKey, deadline, signal) => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let res;
    try {
      // Same AbortController/signal as the initial request (see
      // generateFluxImage) - without this, a single hung status-poll fetch
      // has no bound at all and can never return to the deadline check above.
      res = await fetch(`${NVCF_STATUS_URL}/${reqId}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('FLUX generation timed out while polling for a result');
      }
      throw err;
    }

    if (res.status === 202) continue; // still pending
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`FLUX status poll failed: HTTP ${res.status} ${detail.slice(0, 300)}`);
    }
    return res.json();
  }
  throw new Error('FLUX generation timed out while polling for a result');
};

// Generates one image via NVIDIA FLUX. Throws on any failure (missing key,
// timeout, HTTP error, malformed response, missing image data) — the caller
// (evidenceAssets.js) already wraps each evidence item in its own try/catch
// and marks assetStatus 'missing' on error, exactly like every other
// evidence type, so a single failed photo never aborts the rest of the case.
export const generateFluxImage = async (prompt, overrides = {}) => {
  const apiKey = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_IMAGE_MODEL;

  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not configured - cannot generate FLUX image');
  }
  if (!model) {
    throw new Error('NVIDIA_IMAGE_MODEL is not configured - cannot generate FLUX image');
  }

  const body = {
    prompt,
    mode: 'base',
    height: overrides.height || IMAGE_DEFAULTS.height,
    width: overrides.width || IMAGE_DEFAULTS.width,
    cfg_scale: overrides.cfg_scale || IMAGE_DEFAULTS.cfg_scale,
    steps: overrides.steps || IMAGE_DEFAULTS.steps,
    samples: 1,
    seed: typeof overrides.seed === 'number' ? overrides.seed : IMAGE_DEFAULTS.seed,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;

  // clearTimeout only fires once, in the finally below, covering the initial
  // request AND the polling phase that may follow it - previously it was
  // cleared right after the initial fetch settled, which silently disarmed
  // the abort for the rest of the operation.
  let payload;
  try {
    let response;
    try {
      response = await fetch(`${FLUX_BASE_URL}/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          // Ask NVCF to block synchronously for up to this long instead of
          // returning 202 immediately at its default ~5-60s window — avoids
          // the polling round-trip in the common case. Derived from the same
          // constant as our own client-side abort so we never ask NVIDIA to
          // hold the request open longer than we're actually willing to wait.
          'NVCF-POLL-SECONDS': String(REQUEST_TIMEOUT_MS / 1000),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('FLUX request timed out');
      }
      throw new Error(`FLUX request failed: ${err.message}`);
    }

    if (response.status === 202) {
      const reqId = response.headers.get('nvcf-reqid');
      if (!reqId) {
        throw new Error('FLUX returned 202 (pending) with no NVCF-REQID header to poll');
      }
      payload = await pollForResult(reqId, apiKey, deadline, controller.signal);
    } else if (response.ok) {
      payload = await response.json().catch(() => null);
    } else {
      const detail = await response.text().catch(() => '');
      throw new Error(`FLUX request failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }

  const artifact = payload?.artifacts?.[0];

  if (!artifact?.base64) {
    throw new Error('FLUX response did not contain image data');
  }
  if (artifact.finishReason && artifact.finishReason !== 'SUCCESS') {
    throw new Error(`FLUX did not return a usable image (finishReason: ${artifact.finishReason})`);
  }

  return {
    buffer: Buffer.from(artifact.base64, 'base64'),
    mimeType: 'image/jpeg',
    extension: 'jpg',
  };
};

// ── Grounding the scene: visualPromptEn, with a deterministic fallback ──
// The evidence blueprint's scene fields (`location` / `primaryClue` /
// `visualDetails`) are authored in Hebrew, and the current pipeline was
// observed NOT to reliably ground that Hebrew content into the right visual
// scene (a CCTV/library/badge item generated as a neon street portrait).
//
// Primary fix: the photo blueprint now carries `visualPromptEn` — a 1–3
// sentence English factual description of what the photo shows, emitted by
// the SAME case-generation LLM call that produces the Hebrew fields (no
// extra call, no translation model — see caseFactory.js buildEvidencePrompt).
// When present it is the load-bearing semantic content of the prompt
// (section 2) and the Hebrew primaryClue/visualDetails are dropped rather
// than duplicated.
//
// Fallback (older cases, or a generation that omitted the field): the
// prompt still works exactly as before — Hebrew primaryClue + visualDetails
// + the coarse deterministic environment class from ENV_ANCHORS, plus the
// facts that are language-neutral anyway (people count, HH:MM → lighting).
// `hasVisualEn` in buildImagePrompt is the single switch between the two.
