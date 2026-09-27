// services/edgeTts.js
//
// Edge neural TTS provider (Hebrew: he-IL-AvriNeural male, he-IL-HilaNeural
// female). Same contract as elevenLabsTts.generateDialogueAudio: one call per
// turn, each turn decoded to raw PCM, then assembled with real silence gaps
// into one WAV whose per-turn timestamps come from the actual sample counts.
// Edge only emits MP3/Opus, so each turn's MP3 is decoded (pure-JS/WASM
// mpg123, no ffmpeg) to 24kHz PCM - exactly the format the WAV assembly
// already uses, so renderer, file naming and <audio> playback are unchanged.

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { MPEGDecoder } from 'mpg123-decoder';
import {
  SAMPLE_RATE, DEFAULT_PAUSE_MS, hashName, pcmDurationSeconds, buildWavHeader, buildSilencePcm,
} from './elevenLabsTts.js';

const VOICES = { male: 'he-IL-AvriNeural', female: 'he-IL-HilaNeural' };
// Applied to the 2nd/3rd speaker that would otherwise share a voice, so two
// same-gender characters in one recording stay distinguishable.
const PITCH_VARIANTS = ['+0Hz', '-25Hz', '+25Hz'];
const RATE_BY_PACE = { slow: '-15%', normal: '+0%', fast: '+15%' };
const MAX_ATTEMPTS = 3;

const synthesizeTurnMp3 = async ({ text, voice, pace, pitch }) => {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text, { rate: RATE_BY_PACE[pace] || RATE_BY_PACE.normal, pitch });
  const chunks = [];
  for await (const chunk of audioStream) chunks.push(chunk);
  const mp3 = Buffer.concat(chunks);
  if (mp3.length === 0) throw new Error('Edge TTS returned empty audio data');
  return mp3;
};

const decodeMp3ToPcm = async (mp3) => {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const { channelData, samplesDecoded, sampleRate } = decoder.decode(new Uint8Array(mp3));
    if (!samplesDecoded || sampleRate !== SAMPLE_RATE) {
      throw new Error(`Unexpected Edge TTS audio (samples=${samplesDecoded}, rate=${sampleRate})`);
    }
    const pcm = Buffer.alloc(samplesDecoded * 2);
    for (let i = 0; i < samplesDecoded; i += 1) {
      const s = Math.max(-1, Math.min(1, channelData[0][i]));
      pcm.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), i * 2);
    }
    return pcm;
  } finally {
    decoder.free();
  }
};

// The Edge websocket occasionally closes mid-synthesis; a retry is enough.
const synthesizeTurnPcm = async (opts) => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop -- retries are inherently sequential
      return await decodeMp3ToPcm(await synthesizeTurnMp3(opts));
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Edge TTS failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`);
};

export const generateDialogueAudio = async ({ turns = [], suspects = [] }) => {
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error('No dialogue turns to synthesize');
  }

  const voiceCount = { [VOICES.male]: 0, [VOICES.female]: 0 };
  const speakerVoice = new Map(); // per-run: same speaker keeps one voice+pitch

  const resolveForSpeaker = (speakerName) => {
    if (speakerVoice.has(speakerName)) return speakerVoice.get(speakerName);
    const suspect = suspects.find((s) => `${s?.name || ''}`.trim() === `${speakerName || ''}`.trim());
    const gender = `${suspect?.voiceProfile?.gender || ''}`.toLowerCase();
    const voice = gender === 'female' || gender === 'male'
      ? VOICES[gender]
      : (hashName(speakerName) % 2 === 0 ? VOICES.male : VOICES.female);
    const pitch = PITCH_VARIANTS[voiceCount[voice] % PITCH_VARIANTS.length];
    voiceCount[voice] += 1;
    const resolved = { voice, pitch };
    speakerVoice.set(speakerName, resolved);
    return resolved;
  };

  const segments = [];
  const timedTurns = [];
  let cursorSeconds = 0;

  for (const turn of turns) {
    const { voice, pitch } = resolveForSpeaker(turn.speaker);
    // eslint-disable-next-line no-await-in-loop -- strict sequential order is required for a correctly-timed assembly
    const pcm = await synthesizeTurnPcm({ text: turn.text, voice, pace: turn.pace, pitch });

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
  return {
    buffer: Buffer.concat([buildWavHeader(pcmBuffer.length), pcmBuffer]),
    mimeType: 'audio/wav',
    extension: 'wav',
    durationSeconds: Number(cursorSeconds.toFixed(3)),
    turns: timedTurns,
  };
};
