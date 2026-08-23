// services/elevenLabsTts.js
//
// ElevenLabs-specific API details live ONLY here - the rest of the app
// (recordingEvidence.js, evidenceAssets.js) calls generateDialogueAudio()
// and never touches ElevenLabs' request/response shape directly.
//
// ── Why separate per-turn calls instead of /v1/text-to-dialogue ────────
// ElevenLabs' dedicated multi-speaker endpoint (one call, all speakers)
// does NOT return per-turn timestamps and has no real pause/silence
// control - both are hard requirements here ("timestamps must correspond
// to the actual audio", "no accidental overlap", real silence between
// turns). So instead: one POST /v1/text-to-speech/{voiceId} call PER
// TURN, requesting raw PCM (not MP3), so segments + hand-built silence
// can be concatenated byte-exactly in pure JS - no ffmpeg/encoder
// dependency, and each turn's start/end time is then a simple, provably
// correct function of cumulative byte offsets rather than a guess.
//
// pcm_24000 (not pcm_44100) deliberately: 44.1kHz PCM/WAV requires
// ElevenLabs' Pro tier; pcm_24000 works on the Free tier and is more
// than sufficient for speech. The assembled output is wrapped as a
// standard WAV file (audio/wav) rather than MP3 for the same reason MP3
// concatenation was avoided: WAV/PCM lets duration and turn boundaries
// be computed exactly from byte counts, with zero encoding involved.

const TTS_BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const VOICES_URL = 'https://api.elevenlabs.io/v2/voices';

const SAMPLE_RATE = 24000;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const BYTES_PER_SECOND = SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE;

// eleven_v3: confirmed Hebrew + 70-language support, and the model whose
// inline bracket "audio tags" (e.g. "[whispers]") drive real emotional
// delivery - exactly the mechanism used below to turn a turn's `emotion`
// into actual vocal performance without ever showing the label to the player.
const MODEL_ID = 'eleven_v3';
const REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_PAUSE_MS = 450;

const EMOTION_TAGS = {
  neutral: '',
  nervous: '[nervously]',
  defensive: '[defensively]',
  angry: '[angrily]',
  calm: '[calmly]',
  hesitant: '[hesitantly]',
  whispering: '[whispers]',
  worried: '[worried]',
  suspicious: '[suspiciously]',
};

const PACE_SPEED = {
  slow: 0.85,
  normal: 1.0,
  fast: 1.15,
};

let cachedVoices = null; // fetched once per process, reused for every character/turn

const hashName = (name = '') => `${name}`
  .split('')
  .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 11);

const fetchVoiceLibrary = async (apiKey) => {
  if (cachedVoices) return cachedVoices;

  const res = await fetch(`${VOICES_URL}?category=premade&voice_type=default&page_size=100`, {
    headers: { 'xi-api-key': apiKey },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs voice list request failed: HTTP ${res.status} ${detail.slice(0, 300)}`);
  }

  const body = await res.json().catch(() => null);
  const voices = Array.isArray(body?.voices) ? body.voices : [];

  if (voices.length === 0) {
    throw new Error('ElevenLabs returned no premade voices to choose from');
  }

  cachedVoices = voices;
  return voices;
};

// Deterministic: the same character name (optionally narrowed by gender)
// always resolves to the same voice, for as long as the fetched voice
// list is stable - ElevenLabs' premade library rarely changes. This is
// what keeps "Noa Levi" sounding like the same person across every
// recording in a case, without persisting anything.
const pickVoiceId = (voices, name, gender) => {
  const normalizedGender = `${gender || ''}`.toLowerCase();
  const pool = voices.filter((v) => `${v?.labels?.gender || ''}`.toLowerCase() === normalizedGender);
  const candidates = normalizedGender && pool.length > 0 ? pool : voices;
  const hash = hashName(name);
  return candidates[hash % candidates.length].voice_id;
};

// Exposed so callers can resolve+display a character's assigned voice
// without generating audio. Honors an already-assigned voiceProfile
// (provider/voiceId) if present, so a future persistence layer would be
// respected rather than overridden.
export const resolveVoiceId = async (suspect = {}) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured - cannot resolve a voice');
  }
  if (suspect?.voiceProfile?.provider === 'elevenlabs' && suspect.voiceProfile.voiceId) {
    return suspect.voiceProfile.voiceId;
  }
  const voices = await fetchVoiceLibrary(apiKey);
  return pickVoiceId(voices, suspect?.name, suspect?.voiceProfile?.gender);
};

const synthesizeTurnPcm = async ({ text, voiceId, emotion, pace, apiKey }) => {
  const tag = EMOTION_TAGS[emotion] || '';
  const taggedText = tag ? `${tag} ${text}` : text;
  const speed = PACE_SPEED[pace] || PACE_SPEED.normal;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${TTS_BASE_URL}/${voiceId}?output_format=pcm_${SAMPLE_RATE}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/*',
      },
      body: JSON.stringify({
        text: taggedText,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('ElevenLabs TTS request timed out');
    }
    throw new Error(`ElevenLabs TTS request failed: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error('ElevenLabs TTS returned empty audio data');
  }

  return buffer;
};

// Zero-filled PCM of an exact duration = true silence, sample-accurate.
const buildSilencePcm = (durationMs) => {
  const numSamples = Math.max(0, Math.round((durationMs / 1000) * SAMPLE_RATE));
  return Buffer.alloc(numSamples * BYTES_PER_SAMPLE * NUM_CHANNELS);
};

const pcmDurationSeconds = (buffer) => buffer.length / BYTES_PER_SECOND;

const buildWavHeader = (dataLength) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE(NUM_CHANNELS * BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataLength, 40);
  return header;
};

// Synthesizes every turn (sequentially - order matters for the timeline),
// assembles them with real silence gaps, and returns one playable WAV
// plus per-turn timestamps computed directly from the actual assembled
// audio (never invented independently of it).
export const generateDialogueAudio = async ({ turns = [], suspects = [] }) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured - cannot generate dialogue audio');
  }
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error('No dialogue turns to synthesize');
  }

  const voices = await fetchVoiceLibrary(apiKey);
  const voiceIdCache = new Map(); // per-run: same speaker never gets re-picked mid-recording

  const resolveForSpeaker = (speakerName) => {
    if (voiceIdCache.has(speakerName)) return voiceIdCache.get(speakerName);
    const suspect = suspects.find((s) => `${s?.name || ''}`.trim() === `${speakerName || ''}`.trim());
    const voiceId = (suspect?.voiceProfile?.provider === 'elevenlabs' && suspect.voiceProfile.voiceId)
      ? suspect.voiceProfile.voiceId
      : pickVoiceId(voices, speakerName, suspect?.voiceProfile?.gender);
    voiceIdCache.set(speakerName, voiceId);
    return voiceId;
  };

  const segments = [];
  const timedTurns = [];
  let cursorSeconds = 0;

  for (const turn of turns) {
    const voiceId = resolveForSpeaker(turn.speaker);
    // eslint-disable-next-line no-await-in-loop -- strict sequential order is required for a gapless, correctly-timed assembly
    const pcm = await synthesizeTurnPcm({
      text: turn.text, voiceId, emotion: turn.emotion, pace: turn.pace, apiKey,
    });

    const startTime = cursorSeconds;
    const endTime = startTime + pcmDurationSeconds(pcm);

    segments.push(pcm);
    timedTurns.push({
      speaker: turn.speaker,
      text: turn.text,
      startTime: Number(startTime.toFixed(3)),
      endTime: Number(endTime.toFixed(3)),
    });

    cursorSeconds = endTime;

    const pauseMs = typeof turn.pauseAfterMs === 'number' ? turn.pauseAfterMs : DEFAULT_PAUSE_MS;
    if (pauseMs > 0) {
      const silence = buildSilencePcm(pauseMs);
      segments.push(silence);
      cursorSeconds += pcmDurationSeconds(silence);
    }
  }

  const pcmBuffer = Buffer.concat(segments);
  const wavBuffer = Buffer.concat([buildWavHeader(pcmBuffer.length), pcmBuffer]);

  return {
    buffer: wavBuffer,
    mimeType: 'audio/wav',
    extension: 'wav',
    durationSeconds: Number(cursorSeconds.toFixed(3)),
    turns: timedTurns,
  };
};
