// Evaluation-only harness: generates N real case premises through the actual
// production ai-premise pipeline (buildCasePremisePrompt -> fixed chat wiring ->
// parseAiCasePayload -> buildSkeletonFromPremise -> conceptSignatureCollides retry
// -> buildCaseSkeleton fallback), all imported unmodified from caseFactory.js /
// routes/cases.js. Does NOT touch generateEvidenceAssets (FLUX/ElevenLabs/WhatsApp/
// documents) and does NOT write to Mongo - this only exercises and reports on the
// premise/skeleton stage for manual review.
import dotenv from 'dotenv';
import OpenAI from 'openai';
import {
  buildCasePremisePrompt,
  buildSkeletonFromPremise,
  buildCaseSkeleton,
  conceptSignatureCollides,
  NVIDIA_TEXT_MODEL,
} from '../caseFactory.js';
import { parseAiCasePayload } from '../routes/cases.js';

dotenv.config();

const difficulties = (process.argv[2] || 'easy,medium,hard,medium,hard').split(',');

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// Mirrors the fixed runSection() in routes/cases.js exactly: buildCasePremisePrompt
// returns { system, user }, sent as separate chat messages.
const runPremiseSection = async (label, prompt) => {
  try {
    const aiResponse = await openai.chat.completions.create({
      model: NVIDIA_TEXT_MODEL,
      temperature: 0.7,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    });
    const raw = aiResponse.choices?.[0]?.message?.content || '';
    if (!raw.trim()) throw new Error('empty AI response');
    return { payload: parseAiCasePayload(raw), error: null };
  } catch (err) {
    const status = err.status ? `HTTP ${err.status} - ` : '';
    console.error(`⚠️ [${label}] AI premise call failed: ${status}${err.message}`);
    return { payload: null, error: `${status}${err.message}` };
  }
};

const results = [];
const recentSignatures = [];

for (let i = 0; i < difficulties.length; i += 1) {
  const difficulty = difficulties[i];
  const label = `case ${i + 1}/${difficulties.length} (${difficulty})`;
  let skeleton = null;
  let usedRetry = false;
  let lastError = null;

  const first = await runPremiseSection(label, buildCasePremisePrompt(difficulty, recentSignatures, false));
  lastError = first.error;
  if (first.payload) {
    try {
      skeleton = buildSkeletonFromPremise(first.payload);
    } catch (e) {
      lastError = `buildSkeletonFromPremise threw: ${e.message}`;
      skeleton = null;
    }
  }

  if (skeleton && recentSignatures.some((entry) => conceptSignatureCollides(entry.conceptSignature, skeleton.conceptSignature))) {
    usedRetry = true;
    const retry = await runPremiseSection(`${label} [diversity-retry]`, buildCasePremisePrompt(difficulty, recentSignatures, true));
    if (retry.payload) {
      try {
        skeleton = buildSkeletonFromPremise(retry.payload);
      } catch (e) {
        lastError = `retry buildSkeletonFromPremise threw: ${e.message}`;
      }
    } else {
      lastError = retry.error;
    }
  }

  let fellBack = false;
  if (!skeleton) {
    fellBack = true;
    skeleton = buildCaseSkeleton();
  }

  console.log(`\n${skeleton.source === 'ai-premise' ? '✅' : '❌'} ${label} -> source=${skeleton.source}${usedRetry ? ' (diversity retry used)' : ''}${fellBack ? ` (FALLBACK - reason: ${lastError})` : ''}`);
  console.log(`   caseName: ${skeleton.caseName}`);

  if (skeleton.conceptSignature) {
    recentSignatures.push({
      caseName: skeleton.caseName,
      conceptSignature: skeleton.conceptSignature,
      // Mirrors the `suspects`/`motive` fields routes/cases.js now attaches to
      // recentSignatures, so this harness actually exercises the name-reuse
      // guard and the soft motive-variety nudge.
      suspects: (skeleton.baseSuspects || []).map((s) => s?.name).filter(Boolean),
      motive: skeleton.motive,
    });
  }

  results.push({ difficulty, skeleton, fellBack, fallbackReason: fellBack ? lastError : null, usedRetry });
}

const succeeded = results.filter((r) => !r.fellBack).length;
console.log(`\n${succeeded}/${results.length} generated via ai-premise. ${results.length - succeeded} fell back.`);

// Full structured dump for offline inspection (not printed to console - kept out
// of chat to avoid dumping huge raw JSON per the request).
const fs = await import('fs');
fs.writeFileSync(new URL('./evaluateCaseStructures.output.json', import.meta.url), JSON.stringify(results, null, 2), 'utf8');
console.log('\nFull structured results written to scripts/evaluateCaseStructures.output.json');
