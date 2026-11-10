import { validateInstance } from "../mini-app-engine.mjs";

export const TABLE = "saathi_missions";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
const stages = new Set(["captured", "planned", "working", "complete"]);
const reflectionOutcomes = new Set(["achieved", "partial", "blocked"]);
const reflectionFriction = new Set(["scope", "time", "clarity", "skill", "tooling", "none"]);
const reflectionRepeat = new Set(["yes", "maybe", "no"]);

function object(raw, keys, name, optional = []) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw new Error(`Invalid ${name}.`);
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== "string" || !keys.includes(key)) throw new Error(`Unsupported ${name} property.`);
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`Invalid ${name} property.`);
  }
  for (const key of keys) if (!optional.includes(key) && !Object.hasOwn(raw, key)) throw new Error(`Missing ${name}.${key}.`);
  return raw;
}
function text(value, name, max, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`Invalid ${name}.`);
  return value;
}
export function uuid(value, name = "ID") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(`Invalid ${name}; a UUID is required.`);
  return value.toLowerCase();
}
function timestamp(value, name) {
  text(value, name, 50, true);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${name}.`);
  if (new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) throw new Error(`Invalid ${name}.`);
  return value;
}
function items(raw, name, max, map) {
  if (!Array.isArray(raw) || raw.length > max) throw new Error(`Invalid ${name}.`);
  const ids = new Set();
  return Array.from(raw, item => {
    const value = map(item);
    if (ids.has(value.id)) throw new Error(`Duplicate ${name} ID.`);
    ids.add(value.id); return value;
  });
}
function reflection(raw) {
  if (raw === null) return null;
  object(raw, ["outcome", "rating", "friction", "lesson", "repeat", "personalMemory", "reviewedAt"], "mission reflection", ["rating"]);
  if (!reflectionOutcomes.has(raw.outcome) || !reflectionRepeat.has(raw.repeat)) throw new Error("Invalid mission reflection choice.");
  const rating = raw.rating === undefined ? 3 : raw.rating;
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5) throw new Error("Invalid mission reflection rating.");
  if (!Array.isArray(raw.friction) || raw.friction.length > 6 || raw.friction.some(item => !reflectionFriction.has(item))) throw new Error("Invalid mission reflection friction.");
  if (new Set(raw.friction).size !== raw.friction.length) throw new Error("Duplicate mission reflection friction.");
  return {
    outcome: raw.outcome,
    rating,
    friction: [...raw.friction],
    lesson: text(raw.lesson, "mission reflection lesson", 2000),
    repeat: raw.repeat,
    personalMemory: raw.personalMemory === null ? null : text(raw.personalMemory, "personal memory", 1000, true),
    reviewedAt: timestamp(raw.reviewedAt, "mission review time"),
  };
}
export function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid mission revision.");
  return value;
}

export function validateMissionSnapshot(raw, { requireUuid = false } = {}) {
  object(raw, ["id", "title", "goal", "notes", "nextStep", "stage", "tasks", "decisions", "artifacts", "miniApps", "updatedAt", "templateSource", "reflection"], "mission", ["miniApps", "reflection"]);
  if (!stages.has(raw.stage)) throw new Error("Invalid mission stage.");
  const result = {
    id: requireUuid ? uuid(raw.id, "mission ID") : text(raw.id, "mission ID", 100, true),
    title: text(raw.title, "mission title", 120, true),
    goal: text(raw.goal, "goal", 2000),
    notes: text(raw.notes, "notes", 12000),
    nextStep: text(raw.nextStep, "next step", 400),
    stage: raw.stage,
    tasks: items(raw.tasks, "tasks", 100, task => {
      object(task, ["id", "title", "done"], "task");
      if (typeof task.done !== "boolean") throw new Error("Invalid task completion.");
      return { id: text(task.id, "task ID", 100, true), title: text(task.title, "task title", 300, true), done: task.done };
    }),
    decisions: items(raw.decisions, "decisions", 100, decision => {
      object(decision, ["id", "text", "at"], "decision");
      return { id: text(decision.id, "decision ID", 100, true), text: text(decision.text, "decision", 1000, true), at: timestamp(decision.at, "decision timestamp") };
    }),
    artifacts: items(raw.artifacts, "artifacts", 100, artifact => {
      object(artifact, ["id", "title", "kind", "content"], "artifact");
      if (!["Document", "Code", "Study material", "Data"].includes(artifact.kind)) throw new Error("Invalid artifact kind.");
      return { id: text(artifact.id, "artifact ID", 100, true), title: text(artifact.title, "artifact title", 150, true), kind: artifact.kind, content: text(artifact.content, "artifact content", 20000, true) };
    }),
    miniApps: items(raw.miniApps === undefined ? [] : raw.miniApps, "mini-apps", 10, validateInstance),
    updatedAt: timestamp(raw.updatedAt, "mission timestamp"),
    templateSource: raw.templateSource === null ? null : text(raw.templateSource, "template source", 100, true),
    reflection: reflection(raw.reflection === undefined ? null : raw.reflection),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_PAYLOAD_BYTES) throw new Error("Mission exceeds the 10 MB cloud payload limit.");
  return result;
}

export function validateCloudRow(raw, ownerId) {
  object(raw, ["id", "owner_id", "revision", "title", "payload", "created_at", "updated_at", "deleted_at"], "cloud row");
  const owner = uuid(ownerId, "owner ID");
  if (uuid(raw.owner_id, "row owner") !== owner) throw new Error("Cloud response belongs to another account.");
  const id = uuid(raw.id, "cloud mission ID");
  const mission = validateMissionSnapshot(raw.payload, { requireUuid: true });
  if (mission.id !== id || raw.title !== mission.title) throw new Error("Cloud row and mission payload do not match.");
  return { id, ownerId: owner, mission, revision: revision(raw.revision), createdAt: timestamp(raw.created_at, "creation time"), updatedAt: timestamp(raw.updated_at, "update time"), deletedAt: raw.deleted_at === null ? null : timestamp(raw.deleted_at, "deletion time") };
}

export function prepareMissionForCloud(raw, { newId = () => globalThis.crypto.randomUUID(), at = new Date().toISOString() } = {}) {
  const mission = validateMissionSnapshot(raw);
  mission.id = uuid(newId(), "new cloud mission ID");
  mission.updatedAt = timestamp(at, "copy timestamp");
  for (const group of [mission.tasks, mission.decisions, mission.artifacts, mission.miniApps]) for (const item of group) item.id = uuid(newId(), "copied item ID");
  return validateMissionSnapshot(mission, { requireUuid: true });
}
