// services/caseSerializer.js
// The single client-facing projection of a case document. Extracted from
// routes/cases.js so the real-time change-stream feed (services/caseEvents.js)
// pushes the EXACT same shape the REST endpoints return - no second, drifting
// copy of "what is safe to send the browser".
//
// This is an explicit allowlist: solution / backstory / suspects.secret /
// suspects.isGuilty / evidence.hiddenClue etc. are simply never copied out,
// so it is safe to hand it a full Mongo document (as the change stream does).

export const deriveInvolvementType = (suspect = {}, fallbackSuspect = {}) => {
  const candidate = suspect?.involvementType || suspect?.participantType || fallbackSuspect?.involvementType;

  if (candidate === 'suspect' || candidate === 'witness') {
    return candidate;
  }

  const role = `${suspect?.role || fallbackSuspect?.role || ''}`;
  return /עד/.test(role) ? 'witness' : 'suspect';
};

export const serializeSuspectForClient = (suspect = {}) => ({
  name: suspect.name,
  role: suspect.role,
  involvementType: deriveInvolvementType(suspect),
  personality: suspect.personality,
  alibi: suspect.alibi,
  stressMeter: suspect.stressMeter || 0,
  breakingPoint: suspect.breakingPoint || 70,
  currentTone: suspect.currentTone || 'neutral',
});

export const serializeEvidenceForClient = (evidence = {}) => ({
  type: evidence.type,
  description: evidence.description,
  isFound: Boolean(evidence.isFound),
  fileUrl: evidence.fileUrl || '',
  mimeType: evidence.mimeType || '',
  assetType: evidence.assetType || '',
  assetStatus: evidence.assetStatus || 'missing',
  assetGeneratedAt: evidence.assetGeneratedAt || null,
  assetTranscript: evidence.assetTranscript || '',
  // Metadata only — not clue-revealing, safe to expose. purpose/secondaryClue/
  // messageData/documentData stay server-only, same treatment as hiddenClue.
  artifactType: evidence.artifactType || '',
  participants: Array.isArray(evidence.participants) ? evidence.participants : [],
});

export const serializeCaseForClient = (caseDoc) => {
  const plainCase = typeof caseDoc?.toObject === 'function' ? caseDoc.toObject() : caseDoc;
  const serializedId = plainCase?._id?.toString?.() || plainCase?.id;

  return {
    id: serializedId,
    _id: serializedId,
    caseName: plainCase?.caseName,
    difficulty: plainCase?.difficulty,
    commanderBrief: plainCase?.commanderBrief,
    briefingDetails: plainCase?.briefingDetails,
    commanderPersonality: plainCase?.commanderPersonality,
    interactions: plainCase?.interactions || [],
    investigatorNotes: plainCase?.investigatorNotes || '',
    status: plainCase?.status,
    createdAt: plainCase?.createdAt,
    updatedAt: plainCase?.updatedAt,
    suspects: (plainCase?.suspects || []).map((suspect) => serializeSuspectForClient(suspect)),
    evidence: (plainCase?.evidence || []).map((evidence) => serializeEvidenceForClient(evidence)),
  };
};
