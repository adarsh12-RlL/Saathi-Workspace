// Framework-neutral view data for the Memory Ledger. This projection keeps the
// review controls explicit: a pending candidate is never presented as active,
// and sensitive candidates can never receive an accept action.
import { validateMemoryCandidate } from "./learning-loop.mjs";

const statusLabels = Object.freeze({
  pending: "Needs your review",
  accepted: "In use",
  rejected: "Rejected",
  expired: "Expired",
  forgotten: "Forgotten",
});

function text(value, name, maximum, required = false) {
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function plainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

export function projectMemoryCandidate(raw, {
  missionTitle = "Source mission",
  evidenceLabels = Object.create(null),
} = {}) {
  const memory = validateMemoryCandidate(raw);
  const sourceTitle = text(missionTitle, "memory source title", 120, true).trim();
  plainObject(evidenceLabels, "memory evidence labels");
  const evidence = memory.evidence.map((id) => {
    const hasLabel = Object.hasOwn(evidenceLabels, id);
    return {
      id,
      label: hasLabel
        ? text(evidenceLabels[id], "memory evidence label", 160, true).trim()
        : "Verified learning signal",
    };
  });
  const pending = memory.status === "pending";
  const canAccept = pending && !memory.sensitive;
  const evidenceCount = evidence.length;
  const evidenceWord = evidenceCount === 1 ? "item" : "items";
  return Object.freeze({
    id: memory.id,
    kind: memory.kind,
    scope: memory.scope,
    statement: memory.statement,
    status: memory.status,
    statusLabel: statusLabels[memory.status],
    confidencePercent: Math.round(memory.confidence * 100),
    source: Object.freeze({ missionId: memory.missionId, missionTitle: sourceTitle }),
    evidence: Object.freeze(evidence.map(Object.freeze)),
    evidenceCount,
    explanation: memory.sensitive
      ? "Sensitive source material is excluded from personal memory."
      : `Derived from ${evidenceCount} verified evidence ${evidenceWord}.`,
    sensitive: memory.sensitive,
    canAccept,
    canEdit: pending && !memory.sensitive,
    canReject: pending,
    canForget: memory.status !== "forgotten",
  });
}

