// Minimal smoke test for AI premise generation (P0-3).
//
// Calls the real buildCasePremisePrompt() + parseAiCasePayload() + buildSkeletonFromPremise()
// used by POST /api/cases/generate, with the same system/user message wiring. Fails loudly
// (thrown error, non-zero exit) on any AI error, invalid JSON, or a skeleton that isn't
// tagged 'ai-premise' - it never reports success on a silent fallback to the static
// buildCaseSkeleton() pool.
//
// Usage: node scripts/smokeTestPremise.mjs [runs=1] [difficulty=medium]
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { buildCasePremisePrompt, buildSkeletonFromPremise, NVIDIA_TEXT_MODEL } from '../caseFactory.js';
import { parseAiCasePayload } from '../routes/cases.js';

dotenv.config();

const runs = Number(process.argv[2]) || 1;
const difficulty = process.argv[3] || 'medium';

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

const generateOnePremise = async (index) => {
  const prompt = buildCasePremisePrompt(difficulty, []);

  const aiResponse = await openai.chat.completions.create({
    model: NVIDIA_TEXT_MODEL,
    temperature: 0.7,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
  });

  const raw = aiResponse.choices?.[0]?.message?.content || '';
  if (!raw.trim()) {
    throw new Error(`[run ${index}] AI returned empty content`);
  }

  const premise = parseAiCasePayload(raw); // throws on invalid JSON - must fail the test, not fall back
  const skeleton = buildSkeletonFromPremise(premise);

  if (skeleton.source !== 'ai-premise') {
    throw new Error(`[run ${index}] skeleton.source was "${skeleton.source}", expected "ai-premise"`);
  }
  if (!Array.isArray(premise.suspects) || premise.suspects.length !== 5) {
    throw new Error(`[run ${index}] premise did not contain exactly 5 suspects (got ${premise.suspects?.length})`);
  }
  if (!premise.caseName || !premise.culpritName) {
    throw new Error(`[run ${index}] premise missing caseName/culpritName`);
  }

  return { premise, skeleton };
};

let failures = 0;
for (let i = 1; i <= runs; i += 1) {
  try {
    const { premise, skeleton } = await generateOnePremise(i);
    console.log(`\n✅ [run ${i}/${runs}] ai-premise OK — model=${NVIDIA_TEXT_MODEL}`);
    console.log(`   caseName: ${premise.caseName}`);
    console.log(`   culprit: ${premise.culpritName}`);
    console.log(`   location: ${premise.location}`);
    console.log(`   skeleton.source: ${skeleton.source}`);
    console.log(JSON.stringify(premise, null, 2));
  } catch (err) {
    failures += 1;
    console.error(`\n❌ [run ${i}/${runs}] FAILED: ${err.status ? `HTTP ${err.status} — ` : ''}${err.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures}/${runs} run(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${runs} run(s) passed via ai-premise path.`);
