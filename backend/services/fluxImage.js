// services/fluxImage.js
//
// Real photo evidence via NVIDIA's hosted FLUX.1-dev image-generation
// endpoint — NVIDIA's "genai" gateway (https://ai.api.nvidia.com/v1/genai),
// which is a completely different API shape than the OpenAI-compatible
// chat/completions endpoint (integrate.api.nvidia.com) used everywhere
// else in this project for text. Two responsibilities:
//
//   1. buildImagePrompt(evidence, suspects, caseData) — deterministic,
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

const FLUX_BASE_URL = 'https://ai.api.nvidia.com/v1/genai';
const NVCF_STATUS_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/status';

const REQUEST_TIMEOUT_MS = 180000; // FLUX at default steps can legitimately take over a minute
const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 40; // ~160s of polling on top of the initial synchronous block

// ── Style selection ──────────────────────────────────────────────────────
// A photo's "camera" changes what artifacts/perspective/lighting read as
// realistic. Picked deterministically from the evidence's own text — no
// extra AI call, no new schema field. Defaults to the forensic/documentary
// look, which is the safest general-purpose choice for evidence photos.

const SECURITY_KEYWORDS = /מצלמ|אבטחה|מעקב|cctv|surveillance|security camera/i;
const PHONE_KEYWORDS = /טלפון|נייד|סמארטפון|smartphone|phone camera|selfie/i;

const STYLE_DESCRIPTIONS = {
  security: 'realistic CCTV surveillance photograph, fixed camera perspective, low-light conditions, slight compression artifacts, realistic security footage',
  phone: 'realistic smartphone photograph, natural perspective, imperfect lighting, subtle motion blur',
  forensic: 'realistic forensic documentation photograph, neutral perspective, documentary quality, natural lighting',
};

const resolvePhotoStyle = (evidence = {}) => {
  const haystack = [evidence.description, evidence.purpose, evidence.location].filter(Boolean).join(' ');
  if (SECURITY_KEYWORDS.test(haystack)) return STYLE_DESCRIPTIONS.security;
  if (PHONE_KEYWORDS.test(haystack)) return STYLE_DESCRIPTIONS.phone;
  return STYLE_DESCRIPTIONS.forensic;
};

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

export const buildImagePrompt = (evidence = {}, suspects = [], caseData = {}) => {
  const location = evidence.location || caseData?.briefingDetails?.incidentLocation || '';
  const time = evidence.timeline?.time || caseData?.briefingDetails?.incidentTime || '';
  const participants = Array.isArray(evidence.participants) ? evidence.participants : [];

  const subjects = participants
    .map((name) => {
      const suspect = suspects.find((s) => `${s?.name || ''}`.trim() === `${name || ''}`.trim());
      return describeAppearance(name, suspect?.appearanceProfile);
    })
    .filter(Boolean);

  const sceneParts = [
    location ? `Scene: ${location}${time ? `, ${time}` : ''}.` : '',
    subjects.length ? `Subjects present: ${subjects.join('; ')}.` : '',
    Array.isArray(evidence.visualDetails) && evidence.visualDetails.length
      ? `Visible in the scene: ${evidence.visualDetails.join(', ')}.`
      : '',
    // primaryClue is explicitly listed as a source-of-truth input — used only
    // to ground the scene visually, never as literal on-image text (the "no
    // readable text" constraint below prevents it from being rendered as a
    // caption). secondaryClue is deliberately NOT included: it is often a
    // narrative/investigation-logic detail (e.g. "she's been avoiding this
    // topic"), not a visual fact, and there is no reliable non-AI way here to
    // tell the two apart — forcing it in would risk an incoherent image.
    evidence.primaryClue ? `The scene should visually support: ${evidence.primaryClue}.` : '',
  ].filter(Boolean);

  const style = resolvePhotoStyle(evidence);

  return [
    style,
    ...sceneParts,
    'Photorealistic, unstaged, candid documentary photograph.',
    'No readable text, no captions, no subtitles, no watermarks, no logos anywhere in the image.',
    'No illustration, no anime, no cinematic poster style, no fantasy elements, no exaggerated dramatic lighting, no impossible camera angles.',
  ].filter(Boolean).join(' ');
};

// ── NVIDIA FLUX request ───────────────────────────────────────────────────

const IMAGE_DEFAULTS = {
  height: 1024,
  width: 1024,
  cfg_scale: 3.5,
  steps: 50,
};

const pollForResult = async (reqId, apiKey, deadline) => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(`${NVCF_STATUS_URL}/${reqId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });

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
    seed: 0,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;

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
        // the polling round-trip in the common case.
        'NVCF-POLL-SECONDS': '300',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('FLUX request timed out');
    }
    throw new Error(`FLUX request failed: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  let payload;

  if (response.status === 202) {
    const reqId = response.headers.get('nvcf-reqid');
    if (!reqId) {
      throw new Error('FLUX returned 202 (pending) with no NVCF-REQID header to poll');
    }
    payload = await pollForResult(reqId, apiKey, deadline);
  } else if (response.ok) {
    payload = await response.json().catch(() => null);
  } else {
    const detail = await response.text().catch(() => '');
    throw new Error(`FLUX request failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
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
