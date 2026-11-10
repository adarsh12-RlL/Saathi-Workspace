// Typed, reviewable Agent Room proposals. Agents may suggest a change, but
// this module never applies one to a mission and never executes proposal body data.
export const AGENT_PROPOSAL_SCHEMA = "saathi.agent-proposal";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roles = new Set(["planner", "tutor", "builder", "reviewer", "learner"]);
const operations = new Set(["mission_patch", "mini_app", "feedback", "workflow"]);
const statuses = new Set(["proposed", "accepted", "rejected", "stale", "expired"]);
const risks = new Set(["low", "medium", "high"]);
const permissions = new Set(["read_mission", "read_sources", "propose_mission", "propose_tool", "propose_feedback"]);
const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);

function fail(message) { throw new Error(message); }

function object(value, name, keys, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${name}.`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key) || dangerousKeys.has(key)) fail(`Unsupported ${name} property.`);
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

function safeJson(value, path = "proposal body", depth = 0) {
  if (depth > 8) fail(`Invalid ${path}; nesting is too deep.`);
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "function" || typeof value === "undefined") fail(`Invalid ${path}.`);
  if (Array.isArray(value)) {
    if (value.length > 200) fail(`Invalid ${path}.`);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) fail(`Invalid ${path} item.`);
    }
    return value.map((item, index) => safeJson(item, `${path}[${index}]`, depth + 1));
  }
  if (typeof value === "object") {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${path}.`);
    const result = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || dangerousKeys.has(key)) fail(`Invalid ${path} property.`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) fail(`Invalid ${path} property.`);
      result[key] = safeJson(value[key], `${path}.${key}`, depth + 1);
    }
    return result;
  }
  fail(`Invalid ${path}.`);
}

function list(value, name, maximum, maximumText) {
  if (!Array.isArray(value) || value.length > maximum) fail(`Invalid ${name}.`);
  const seen = new Set();
  return value.map(item => {
    const normalized = text(item, name, maximumText, true).trim();
    if (seen.has(normalized)) fail(`Duplicate ${name}.`);
    seen.add(normalized);
    return normalized;
  });
}

export function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail("Invalid proposal base revision.");
  return value;
}

export function validateAgentProposal(raw) {
  object(raw, "agent proposal", ["schema", "version", "id", "missionId", "runId", "role", "operation", "status", "title", "summary", "baseRevision", "evidence", "permissions", "body", "risk", "createdAt", "expiresAt"]);
  if (raw.schema !== AGENT_PROPOSAL_SCHEMA || raw.version !== 1) fail("Unsupported agent proposal version.");
  if (!roles.has(raw.role) || !operations.has(raw.operation) || !statuses.has(raw.status) || !risks.has(raw.risk)) fail("Invalid agent proposal classification.");
  const checkedPermissions = list(raw.permissions, "proposal permissions", 8, 40);
  if (checkedPermissions.some(permission => !permissions.has(permission))) fail("Unsupported agent proposal permission.");
  const body = safeJson(raw.body);
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Proposal body must be a JSON object.");
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 256 * 1024) fail("Agent proposal body is too large.");
  const result = {
    schema: AGENT_PROPOSAL_SCHEMA,
    version: 1,
    id: uuid(raw.id, "agent proposal ID"),
    missionId: uuid(raw.missionId, "proposal mission ID"),
    runId: uuid(raw.runId, "proposal run ID"),
    role: raw.role,
    operation: raw.operation,
    status: raw.status,
    title: text(raw.title, "proposal title", 120, true).trim(),
    summary: text(raw.summary, "proposal summary", 2000).trim(),
    baseRevision: revision(raw.baseRevision),
    evidence: list(raw.evidence, "proposal evidence", 20, 120),
    permissions: checkedPermissions,
    body,
    risk: raw.risk,
    createdAt: timestamp(raw.createdAt, "proposal timestamp"),
    expiresAt: raw.expiresAt === null ? null : timestamp(raw.expiresAt, "proposal expiry"),
  };
  if (result.status === "accepted" && !result.permissions.includes("propose_mission") && !result.permissions.includes("propose_tool") && !result.permissions.includes("propose_feedback")) fail("Accepted proposals require a mutation permission.");
  return result;
}

export function acceptAgentProposal(raw, currentRevision, at = new Date().toISOString()) {
  const proposal = validateAgentProposal(raw);
  if (proposal.status !== "proposed") fail("Only proposed agent proposals can be accepted.");
  revision(currentRevision); timestamp(at, "proposal decision time");
  if (proposal.expiresAt !== null && Date.parse(proposal.expiresAt) <= Date.parse(at)) return validateAgentProposal({ ...proposal, status: "expired" });
  if (proposal.baseRevision !== currentRevision) return validateAgentProposal({ ...proposal, status: "stale" });
  return validateAgentProposal({ ...proposal, status: "accepted" });
}

export function rejectAgentProposal(raw, at = new Date().toISOString()) {
  const proposal = validateAgentProposal(raw);
  if (proposal.status !== "proposed") fail("Only proposed agent proposals can be rejected.");
  timestamp(at, "proposal decision time");
  return validateAgentProposal({ ...proposal, status: "rejected" });
}

export function expireAgentProposal(raw, at = new Date().toISOString()) {
  const proposal = validateAgentProposal(raw);
  if (proposal.status !== "proposed") fail("Only proposed agent proposals can expire.");
  timestamp(at, "proposal expiry time");
  return validateAgentProposal({ ...proposal, status: "expired" });
}
