// Deterministic, user-controlled personalization. This module never trains a
// model or activates a memory implicitly; it turns explicit feedback into
// reviewable candidates only.
export const LEARNING_SIGNAL_SCHEMA = "saathi.learning-signal";
export const MEMORY_SCHEMA = "saathi.memory-proposal";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const outcomes = new Set(["success", "partial", "blocked"]);
const kinds = new Set(["preference", "fact", "procedure", "lesson", "constraint", "goal"]);
const scopes = new Set(["global", "mission"]);
const statuses = new Set(["pending", "accepted", "rejected", "expired", "forgotten"]);

function fail(message) { throw new Error(message); }

function object(value, name, keys, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${name}.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key)) fail(`Unsupported ${name} property.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail(`Invalid ${name} property.`);
  }
  for (const key of keys) if (!optional.includes(key) && !Object.hasOwn(value, key)) fail(`Missing ${name}.${key}.`);
  return value;
}

function text(value, name, maximum, required = false) {
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) fail(`Invalid ${name}.`);
  return value;
}

function uuid(value, name) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail(`Invalid ${name}; a UUID is required.`);
  return value.toLowerCase();
}

function timestamp(value, name) {
  text(value, name, 50, true);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(value))) fail(`Invalid ${name}.`);
  if (new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) fail(`Invalid ${name}.`);
  return value;
}

function boundedTextList(value, name, maximumItems, maximumText) {
  if (!Array.isArray(value) || value.length > maximumItems) fail(`Invalid ${name}.`);
  const seen = new Set();
  return value.map((item) => {
    const normalized = text(item, name, maximumText, true).trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) fail(`Duplicate ${name}.`);
    seen.add(key);
    return normalized;
  });
}

function idList(value, name, maximumItems) {
  if (!Array.isArray(value) || value.length > maximumItems) fail(`Invalid ${name}.`);
  const seen = new Set();
  return value.map((item) => {
    const id = uuid(item, name);
    if (seen.has(id)) fail(`Duplicate ${name}.`);
    seen.add(id);
    return id;
  });
}

export function validateLearningSignal(raw) {
  object(raw, "learning signal", ["schema", "version", "id", "missionId", "createdAt", "outcome", "rating", "reflection", "corrections", "preferences", "tags", "reusable", "allowLearning", "sensitiveSource"]);
  if (raw.schema !== LEARNING_SIGNAL_SCHEMA || raw.version !== 1) fail("Unsupported learning signal version.");
  const outcome = text(raw.outcome, "outcome", 20, true);
  if (!outcomes.has(outcome)) fail("Invalid learning outcome.");
  if (!Number.isSafeInteger(raw.rating) || raw.rating < 1 || raw.rating > 5) fail("Learning rating must be an integer from 1 to 5.");
  if (typeof raw.reusable !== "boolean" || typeof raw.allowLearning !== "boolean" || typeof raw.sensitiveSource !== "boolean") fail("Learning consent flags must be boolean.");
  const result = {
    schema: LEARNING_SIGNAL_SCHEMA,
    version: 1,
    id: uuid(raw.id, "learning signal ID"),
    missionId: uuid(raw.missionId, "learning mission ID"),
    createdAt: timestamp(raw.createdAt, "learning timestamp"),
    outcome,
    rating: raw.rating,
    reflection: text(raw.reflection, "reflection", 2000).trim(),
    corrections: boundedTextList(raw.corrections, "corrections", 10, 300),
    preferences: boundedTextList(raw.preferences, "preferences", 10, 240),
    tags: boundedTextList(raw.tags, "tags", 12, 32).map(tag => tag.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")).filter(Boolean),
    reusable: raw.reusable,
    allowLearning: raw.allowLearning,
    sensitiveSource: raw.sensitiveSource,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 512 * 1024) fail("Learning signal is too large.");
  return result;
}

export function validateMemoryCandidate(raw) {
  object(raw, "memory candidate", ["schema", "version", "id", "kind", "key", "statement", "scope", "missionId", "confidence", "evidence", "status", "sensitive", "createdAt", "updatedAt", "expiresAt"]);
  if (raw.schema !== MEMORY_SCHEMA || raw.version !== 1) fail("Unsupported memory candidate version.");
  if (!kinds.has(raw.kind) || !scopes.has(raw.scope) || !statuses.has(raw.status)) fail("Invalid memory candidate classification.");
  if (raw.scope === "mission" && raw.missionId === null) fail("Mission memory candidates require a mission ID.");
  if (raw.scope === "global" && raw.missionId !== null) fail("Global memory candidates cannot have a mission ID.");
  if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) fail("Invalid memory confidence.");
  if (typeof raw.sensitive !== "boolean") fail("Memory sensitivity must be boolean.");
  const key = text(raw.key, "memory key", 80, true);
  if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(key)) fail("Memory key must be a safe lowercase key.");
  const result = {
    schema: MEMORY_SCHEMA, version: 1, id: uuid(raw.id, "memory candidate ID"), kind: raw.kind, key,
    statement: text(raw.statement, "memory statement", 1000, raw.status !== "forgotten").trim(),
    scope: raw.scope, missionId: raw.missionId === null ? null : uuid(raw.missionId, "memory mission ID"),
    confidence: raw.confidence, evidence: idList(raw.evidence, "memory evidence", 20), status: raw.status,
    sensitive: raw.sensitive, createdAt: timestamp(raw.createdAt, "memory creation time"),
    updatedAt: timestamp(raw.updatedAt, "memory update time"), expiresAt: raw.expiresAt === null ? null : timestamp(raw.expiresAt, "memory expiry time"),
  };
  return result;
}

function stableKey(kind, statement, index) {
  const slug = statement.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55);
  return `${kind}.${slug || `item-${index + 1}`}`.slice(0, 80);
}

function candidate({ id, kind, statement, scope, missionId, signal, at, index }) {
  const confidence = Math.min(1, Math.max(0, (signal.rating / 5) * (signal.reusable ? 1 : 0.8) * (signal.outcome === "blocked" ? 0.6 : 1)));
  return validateMemoryCandidate({
    schema: MEMORY_SCHEMA, version: 1, id, kind, key: stableKey(kind, statement, index), statement,
    scope, missionId, confidence, evidence: [signal.id, ...signal.tags.filter(tag => UUID_PATTERN.test(tag))],
    status: "pending", sensitive: signal.sensitiveSource, createdAt: at, updatedAt: at, expiresAt: null,
  });
}

export function deriveMemoryCandidates(rawSignal, { newId = () => globalThis.crypto.randomUUID(), at = new Date().toISOString() } = {}) {
  const signal = validateLearningSignal(rawSignal);
  timestamp(at, "candidate timestamp");
  if (!signal.allowLearning || signal.sensitiveSource) return [];
  const result = [];
  let index = 0;
  for (const statement of signal.preferences) result.push(candidate({ id: uuid(newId(), "memory candidate ID"), kind: "preference", statement, scope: "global", missionId: null, signal, at, index: index++ }));
  for (const statement of signal.corrections) result.push(candidate({ id: uuid(newId(), "memory candidate ID"), kind: "lesson", statement, scope: "mission", missionId: signal.missionId, signal, at, index: index++ }));
  if (signal.reflection) result.push(candidate({ id: uuid(newId(), "memory candidate ID"), kind: signal.reusable ? "procedure" : "lesson", statement: signal.reflection, scope: signal.reusable ? "global" : "mission", missionId: signal.reusable ? null : signal.missionId, signal, at, index: index++ }));
  return result;
}

export function acceptMemory(raw, at = new Date().toISOString()) {
  const memory = validateMemoryCandidate(raw);
  if (memory.status !== "pending") fail("Only pending memories can be accepted.");
  if (memory.sensitive) fail("Sensitive memories cannot be accepted.");
  timestamp(at, "memory acceptance time");
  if (memory.expiresAt !== null && Date.parse(memory.expiresAt) <= Date.parse(at)) fail("Expired memories cannot be accepted.");
  return validateMemoryCandidate({ ...memory, status: "accepted", updatedAt: at });
}

export function rejectMemory(raw, at = new Date().toISOString()) {
  const memory = validateMemoryCandidate(raw);
  if (memory.status !== "pending") fail("Only pending memories can be rejected.");
  timestamp(at, "memory rejection time");
  return validateMemoryCandidate({ ...memory, status: "rejected", updatedAt: at });
}

export function forgetMemory(raw, at = new Date().toISOString()) {
  const memory = validateMemoryCandidate(raw);
  timestamp(at, "memory forget time");
  return validateMemoryCandidate({ ...memory, status: "forgotten", statement: "", evidence: [], updatedAt: at });
}

export function mergeMemoryCandidates(existing, incoming, at = new Date().toISOString()) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) fail("Memory lists must be arrays.");
  timestamp(at, "memory merge time");
  const merged = new Map();
  for (const raw of [...existing, ...incoming]) {
    const memory = validateMemoryCandidate(raw);
    const identity = `${memory.kind}|${memory.scope}|${memory.missionId ?? "global"}|${memory.key}`;
    const prior = merged.get(identity);
    if (!prior) { merged.set(identity, structuredClone(memory)); continue; }
    if (prior.status === "forgotten") continue;
    const evidence = [...new Set([...prior.evidence, ...memory.evidence])].slice(0, 20);
    const status = ["forgotten", "rejected", "accepted"].includes(prior.status) ? prior.status : memory.status;
    merged.set(identity, validateMemoryCandidate({ ...prior, confidence: Math.max(prior.confidence, memory.confidence), evidence, status, updatedAt: at }));
  }
  return [...merged.values()];
}

function tokens(value) { return new Set(value.toLocaleLowerCase().match(/[a-z0-9]{3,}/g) ?? []); }

export function rankAcceptedMemories(goal, rawMemories, limit = 5) {
  text(goal, "mission goal", 2000, true);
  if (!Array.isArray(rawMemories) || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) fail("Invalid memory ranking input.");
  const goalTokens = tokens(goal);
  return rawMemories.map(validateMemoryCandidate)
    .filter(memory => memory.status === "accepted" && !memory.sensitive && (memory.expiresAt === null || Date.parse(memory.expiresAt) > Date.now()))
    .map(memory => {
      const overlap = [...tokens(`${memory.key} ${memory.statement}`)].filter(token => goalTokens.has(token)).length;
      return { memory, score: overlap > 0 ? overlap + memory.confidence * 0.25 : 0 };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt) || a.memory.id.localeCompare(b.memory.id))
    .slice(0, limit);
}
