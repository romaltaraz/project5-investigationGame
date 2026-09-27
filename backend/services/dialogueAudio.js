// services/dialogueAudio.js
//
// Provider switch for recording audio. recordingEvidence.js calls
// generateDialogueAudio() and neither knows nor cares which TTS engine is
// behind it - every provider returns the same shape: a playable WAV buffer,
// its duration, and audio-derived per-turn start/end times.
//
// TTS_PROVIDER=edge        (default) Microsoft Edge neural voices - no API key, no credits
// TTS_PROVIDER=elevenlabs  the original ElevenLabs implementation (needs credits)

import { generateDialogueAudio as generateElevenLabsAudio } from './elevenLabsTts.js';
import { generateDialogueAudio as generateEdgeAudio } from './edgeTts.js';

export const generateDialogueAudio = (args) => {
  const provider = `${process.env.TTS_PROVIDER || 'edge'}`.toLowerCase();
  return provider === 'elevenlabs' ? generateElevenLabsAudio(args) : generateEdgeAudio(args);
};
