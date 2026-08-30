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
    camera: 'Image grabbed from a fixed CCTV security camera, mounted high on a wall or ceiling corner, wide-angle lens.',
    framing: 'Wide static field of view shot from a high angle looking down, mild fisheye-style edge distortion, subjects appear small and off-center rather than composed in the frame.',
    lighting: 'Flat institutional lighting (fluorescent/sodium), harsh overexposed patches near light fixtures and dim underexposed corners, low dynamic range.',
    quality: 'Low-resolution video-grab quality, visible compression blocking and interlacing artifacts, muted desaturated color, slight motion smear on anything moving.',
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
    lighting: 'Mixed practical light sources (streetlight, window glow, screen light) with uneven color temperature, deep shadows away from the light sources.',
    quality: 'Visible high-ISO sensor noise/grain, slight smearing from computational noise reduction, faint motion blur from a long handheld exposure.',
    depthOfField: 'Shallow phone-sensor depth of field only on very close subjects, otherwise mostly in focus but soft from noise reduction.',
    dims: DIMS.portraitPhone,
  },
  night_ambient: {
    id: 'night_ambient',
    camera: 'Photo of an empty or near-empty scene at night, taken by a handheld camera or phone left to a longer exposure, no people in frame close enough to matter.',
    framing: 'Wide environmental framing showing the space itself, natural unstaged perspective at normal standing height.',
    lighting: 'Available night lighting only — streetlights, interior spill, signage — with real pools of light and darkness, no artificial fill.',
    quality: 'Visible grain in the shadows, slight chromatic noise, realistic long-exposure light trails only if a moving light source is plausible.',
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
  easy: 'This detail should be clearly visible and easy to notice at a glance — well-lit and unobstructed in the frame.',
  medium: 'This detail should be present but not the obvious focal point of the shot — easy to miss on a first glance, clear on closer inspection.',
  hard: 'This detail should be subtle — partially obscured, near the edge of the frame, in shadow, or small relative to the scene — but still genuinely identifiable on close inspection, never removed or illegible.',
};

const resolveClueVisibility = (difficulty) => CLUE_VISIBILITY_BY_DIFFICULTY[difficulty] || CLUE_VISIBILITY_BY_DIFFICULTY.medium;

const NEGATIVE_CONSTRAINTS = 'No readable text, no captions, no subtitles, no watermarks, no logos, no on-screen UI, no fake timestamp overlays, no labels or annotations anywhere in the image. No cinematic color grading, no teal-and-orange grading, no dramatic movie lighting, no illustration, no anime, no fantasy elements, no impossible camera angles, no overly clean or staged environment, no perfectly centered "movie poster" composition.';

// ── Prompt construction ──────────────────────────────────────────────────
// Character consistency: a participant's appearance is looked up from the
// suspect's OWN stored appearanceProfile (established once at case-generation
// time) and never re-derived or reworded here — same name, same attributes,
// every single evidence item.

const describeAppearance = (name, appearanceProfile = {}) => {
  const parts = [
    appearanceProfile.age ? `${appearanceProfile.age}-year-old` : '',
    appearanceProfile.gender || '',
    appearanceProfile.hair || '',
    appearanceProfile.eyes ? `${appearanceProfile.eyes} eyes` : '',
    appearanceProfile.skinTone ? `${appearanceProfile.skinTone} skin tone` : '',
    appearanceProfile.bodyType || '',
    appearanceProfile.clothingStyle ? `wearing ${appearanceProfile.clothingStyle}` : '',
    ...(Array.isArray(appearanceProfile.distinctiveFeatures) ? appearanceProfile.distinctiveFeatures : []),
  ].filter(Boolean);

  return parts.length ? `${name} (${parts.join(', ')})` : name;
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

  const subjects = participants
    .map((name) => {
      const suspect = suspects.find((s) => `${s?.name || ''}`.trim() === `${name || ''}`.trim());
      return describeAppearance(name, suspect?.appearanceProfile);
    })
    .filter(Boolean);

  const profile = resolveCaptureProfile(evidence, { location, time, participants });

  const sceneParts = [
    location ? `Scene: ${location}${time ? `, ${time}` : ''}.` : '',
    subjects.length ? `Subjects present: ${subjects.join('; ')}.` : '',
    Array.isArray(evidence.visualDetails) && evidence.visualDetails.length
      ? `Visible in the scene: ${evidence.visualDetails.join(', ')}.`
      : '',
    // primaryClue is explicitly listed as a source-of-truth input — used only
    // to ground the scene visually, never as literal on-image text (the "no
    // readable text" negative constraint below prevents it from being
    // rendered as a caption). secondaryClue is deliberately NOT included
    // here: it is often a narrative/investigation-logic detail (e.g. "she's
    // been avoiding this topic"), not a visual fact, same reasoning that
    // already keeps `purpose` out of the rendered scene.
    evidence.primaryClue
      ? `Key visual detail the photo must depict (never as on-image text): ${evidence.primaryClue}. ${resolveClueVisibility(difficulty)}`
      : '',
  ].filter(Boolean);

  const prompt = [
    profile.camera,
    profile.framing,
    profile.lighting,
    profile.quality,
    profile.depthOfField,
    ...sceneParts,
    'Photorealistic, unstaged, real-world photograph — not concept art, not a movie still.',
    NEGATIVE_CONSTRAINTS,
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
