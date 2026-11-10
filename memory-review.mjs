// Explicit review decisions are replayed against consented learning signals.
// No candidate becomes active unless its owner accepts it.
import { acceptMemory, deriveMemoryCandidates, forgetMemory, rejectMemory, validateLearningSignal, validateMemoryCandidate } from "./learning-loop.mjs";
import { projectMemoryCandidate } from "./memory-candidate-ui.mjs";

export const MEMORY_DECISION_SCHEMA = "saathi.memory-decision";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["accept", "edit", "reject", "forget"]);
const DECISION_KEYS = ["schema", "version", "id", "signalId", "candidateId", "missionId", "action", "statement", "createdAt"];

function plain(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Invalid ${name}.`);
  return value;
}

function ownData(value, key, name) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`Invalid ${name}.${key}.`);
  return descriptor.value;
}

function uuid(value, name) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(`Invalid ${name}; a UUID is required.`);
  return value.toLowerCase();
}

function timestamp(value, name) {
  if (typeof value !== "string" || value.length > 50) throw new Error(`Invalid ${name}.`);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${name}.`);
  if (new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) throw new Error(`Invalid ${name}.`);
  return value;
}

// PostgreSQL timestamps may include microseconds. Preserve them in ordering,
// instead of allowing Date.parse's millisecond truncation to change a winner.
function orderTime(value) {
  const fraction = /\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
  const micros = fraction.padEnd(6, "0");
  return BigInt(Date.parse(value)) * 1000n + BigInt(micros.slice(3) || "0");
}

function ordered(left, right) {
  const a = orderTime(left.createdAt), b = orderTime(right.createdAt);
  return a < b ? -1 : a > b ? 1 : left.payload.id < right.payload.id ? -1 : left.payload.id > right.payload.id ? 1 : 0;
}

export function validateMemoryDecision(raw) {
  plain(raw, "memory decision");
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== "string" || !DECISION_KEYS.includes(key)) throw new Error("Unsupported memory decision property.");
    ownData(raw, key, "memory decision");
  }
  for (const key of DECISION_KEYS) ownData(raw, key, "memory decision");
  if (raw.schema !== MEMORY_DECISION_SCHEMA || raw.version !== 1) throw new Error("Unsupported memory decision version.");
  if (!ACTIONS.has(raw.action)) throw new Error("Invalid memory decision action.");
  let statement = null;
  if (raw.action === "edit") {
    if (typeof raw.statement !== "string" || raw.statement.length > 1000 || !raw.statement.trim()) throw new Error("An edit requires a nonempty memory statement of at most 1000 characters.");
    statement = raw.statement.trim();
  } else if (raw.statement !== null) throw new Error("Only edit decisions may contain a statement.");
  return {
    schema: MEMORY_DECISION_SCHEMA, version: 1,
    id: uuid(raw.id, "memory decision ID"), signalId: uuid(raw.signalId, "learning signal ID"),
    candidateId: uuid(raw.candidateId, "memory candidate ID"), missionId: uuid(raw.missionId, "source mission ID"),
    action: raw.action, statement, createdAt: timestamp(raw.createdAt, "memory decision timestamp"),
  };
}

export async function deriveStableCandidateId(signalId, index) {
  const id = uuid(signalId, "learning signal ID");
  if (!Number.isSafeInteger(index) || index < 0 || index > 20) throw new Error("Invalid memory candidate index.");
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto is required to derive stable memory candidate IDs.");
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`saathi.memory-candidate:v1:${id}:${index}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128; // UUID version 8: application-defined SHA-256 identity.
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeRecords(rawRecords, validate, name, warnings) {
  if (!Array.isArray(rawRecords) || rawRecords.length > 10000) throw new Error(`Invalid ${name} ledger; at most 10,000 records are supported.`);
  const records = new Map(), blocked = new Set();
  for (const raw of rawRecords) {
    let record;
    try {
      plain(raw, `${name} record`);
      record = { payload: validate(ownData(raw, "payload", `${name} record`)), createdAt: timestamp(ownData(raw, "createdAt", `${name} record`), `${name} server timestamp`) };
    } catch {
      warnings.push(`Ignored an invalid ${name} record.`);
      continue;
    }
    const id = record.payload.id;
    if (blocked.has(id)) continue;
    const prior = records.get(id);
    if (prior && (JSON.stringify(prior.payload) !== JSON.stringify(record.payload) || prior.createdAt !== record.createdAt)) {
      // A hostile duplicate cannot win based on which device downloaded it first.
      records.delete(id); blocked.add(id);
      warnings.push(`Ignored conflicting ${name} records with ID ${id}.`);
    } else if (!prior) records.set(id, record);
  }
  return [...records.values()].sort(ordered);
}

export async function projectLearningLedger(signals, decisions) {
  const warnings = [];
  const sources = normalizeRecords(signals, validateLearningSignal, "learning signal", warnings);
  const actions = normalizeRecords(decisions, validateMemoryDecision, "memory decision", warnings);
  const entries = [], candidates = new Map();
  for (const source of sources) {
    const signal = source.payload;
    if (!signal.allowLearning || signal.sensitiveSource) continue;
    const count = signal.preferences.length + signal.corrections.length + Number(Boolean(signal.reflection));
    const ids = await Promise.all(Array.from({ length: count }, (_, index) => deriveStableCandidateId(signal.id, index)));
    let index = 0;
    let derived;
    try {
      derived = deriveMemoryCandidates(signal, { newId: () => ids[index++], at: source.createdAt });
    } catch {
      // Older valid signals may contain a 2,000-character reflection while
      // memory statements support 1,000. One source must not break the ledger.
      warnings.push(`Ignored learning signal ${signal.id}: it cannot produce compatible memory candidates.`);
      continue;
    }
    for (const candidate of derived) {
      const entry = { signalId: signal.id, missionId: signal.missionId, candidate };
      entries.push(entry); candidates.set(candidate.id, entry);
    }
  }
  for (const record of actions) {
    const action = record.payload;
    const entry = candidates.get(action.candidateId);
    if (!entry || entry.signalId !== action.signalId || entry.missionId !== action.missionId) {
      warnings.push(`Ignored memory decision ${action.id}: its source or candidate is unavailable.`);
      continue;
    }
    const candidate = entry.candidate;
    if (orderTime(record.createdAt) < orderTime(candidate.createdAt)) {
      warnings.push(`Ignored memory decision ${action.id}: it precedes its source.`);
      continue;
    }
    if (candidate.status === "forgotten" || (action.action !== "forget" && (candidate.status !== "pending" || candidate.sensitive))) {
      warnings.push(`Ignored memory decision ${action.id}: the candidate no longer allows this action.`);
      continue;
    }
    if (action.action === "accept") entry.candidate = acceptMemory(candidate, record.createdAt);
    else if (action.action === "reject") entry.candidate = rejectMemory(candidate, record.createdAt);
    else if (action.action === "edit") entry.candidate = validateMemoryCandidate({ ...candidate, statement: action.statement, updatedAt: record.createdAt });
    else entry.candidate = validateMemoryCandidate({ ...forgetMemory(candidate, record.createdAt), key: `forgotten.${candidate.id}`, confidence: 0 });
  }
  return {
    entries: entries.map(entry => Object.freeze({ ...entry, candidate: Object.freeze(entry.candidate), view: projectMemoryCandidate(entry.candidate) })),
    warnings: warnings.sort(),
  };
}
