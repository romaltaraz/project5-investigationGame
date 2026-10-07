// Regression test for the first-interaction persistence bug (Stage 1, item 1).
//
// Mongoose's DocumentArray#push() casts the plain object you pass it into a
// NEW subdocument instance and stores that cast copy in the array - it does
// NOT keep your original object by reference. The old /ask and /consult code
// did:
//   interaction = { entityType: 'suspect', entityName, messages: [] };
//   caseDoc.interactions.push(interaction);
//   ... later: interaction.messages.push(...)
// which mutates the detached plain object, not the subdocument actually
// stored in caseDoc.interactions - so the first exchange is silently lost
// on caseDoc.save(), even though the AI response was returned to the client.
//
// This script builds an in-memory Case document (no DB connection needed -
// mongoose document/array casting works standalone) and reproduces the exact
// push-then-use pattern from the route handlers: first the old (buggy) form,
// to prove the failure mode, then the fixed (rebind) form, to prove the fix.
//
// What this verifies: the array-rebind mechanism that /ask and /consult rely
// on to persist the first exchange of a brand-new interaction.
// What this cannot verify: the full HTTP route behavior (auth, AI call,
// validation) - that would require a running server + DB + mocked AI client,
// which is out of scope for this focused regression test.
//
// Usage: node scripts/testInteractionPersistence.mjs
import mongoose from 'mongoose';
import Case from '../models/Case.js';

const makeCaseDoc = () => new Case({
  userId: new mongoose.Types.ObjectId(),
  caseName: 'test-case',
  commanderBrief: 'test-brief',
  solution: { culprit: 'x', method: 'x', motive: 'x', explanation: 'x' },
});

// ---- OLD (buggy) pattern: keep using the local variable after push() ----
const buggyCaseDoc = makeCaseDoc();
let interaction = buggyCaseDoc.interactions.find(
  (i) => i.entityType === 'suspect' && i.entityName === 'Alice',
);
if (!interaction) {
  interaction = { entityType: 'suspect', entityName: 'Alice', messages: [] };
  buggyCaseDoc.interactions.push(interaction);
}
interaction.messages.push({ role: 'user', content: 'first question' });
interaction.messages.push({ role: 'assistant', content: 'first answer' });

const storedBuggy = buggyCaseDoc.interactions.find(
  (i) => i.entityType === 'suspect' && i.entityName === 'Alice',
);

if (storedBuggy.messages.length === 2) {
  throw new Error(
    'Expected the OLD pattern to demonstrate the bug (0 messages on the stored ' +
    `subdocument), but it has ${storedBuggy.messages.length}. Mongoose's push() ` +
    'casting behavior may have changed - re-check before relying on this test.',
  );
}

console.log(
  `reproduced bug: local "interaction" has ${interaction.messages.length} message(s), ` +
  `but caseDoc.interactions (what actually gets saved) has ${storedBuggy.messages.length}.`,
);

// ---- NEW (fixed) pattern: rebind to the actual stored subdocument ----
const fixedCaseDoc = makeCaseDoc();
let interaction2 = fixedCaseDoc.interactions.find(
  (i) => i.entityType === 'suspect' && i.entityName === 'Bob',
);
if (!interaction2) {
  interaction2 = { entityType: 'suspect', entityName: 'Bob', messages: [] };
  fixedCaseDoc.interactions.push(interaction2);
  interaction2 = fixedCaseDoc.interactions[fixedCaseDoc.interactions.length - 1]; // the fix
}
interaction2.messages.push({ role: 'user', content: 'first question' });
interaction2.messages.push({ role: 'assistant', content: 'first answer' });

const storedFixed = fixedCaseDoc.interactions.find(
  (i) => i.entityType === 'suspect' && i.entityName === 'Bob',
);

if (storedFixed.messages.length !== 2) {
  throw new Error(`FIX FAILED: expected 2 persisted messages, got ${storedFixed.messages.length}`);
}
if (
  storedFixed.messages[0].content !== 'first question'
  || storedFixed.messages[1].content !== 'first answer'
) {
  throw new Error('FIX FAILED: persisted message content does not match what was pushed');
}

console.log(
  `fix verified: after rebinding, caseDoc.interactions has ${storedFixed.messages.length} ` +
  'message(s), so a subsequent request reading interaction history sees the first exchange.',
);

console.log('\nAll checks passed.');
