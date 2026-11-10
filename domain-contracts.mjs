// Framework-neutral contracts for the SAATHI Mission Learning OS.
// These records are deliberately inert: they describe evidence, proposals,
// skills and coordination state; adapters must still require explicit user
// approval before applying a proposal or invoking a connector.
import { validateSpec } from "./mini-app-engine.mjs";

export const DOMAIN_VERSION = 1;
export const SOURCE_REFERENCE_SCHEMA = "saathi.source-reference";
export const AGENT_RUN_SCHEMA = "saathi.agent-run";
export const AGENT_PROPOSAL_SCHEMA = "saathi.agent-proposal.v2";
export const SKILL_VERSION_SCHEMA = "saathi.skill-version";
export const DEVICE_HANDOFF_SCHEMA = "saathi.device-handoff";
export const SYNC_OPERATION_SCHEMA = "saathi.sync-operation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SOURCE_KINDS = new Set(["mission", "learning_event", "memory", "artifact", "note", "file", "url", "connector", "agent_run", "agent_proposal", "skill", "handoff", "sync_operation"]);
const AGENT_ROLES = new Set(["planner", "tutor", "builder", "reviewer", "learner", "analyst", "connector"]);
const AGENT_RUN_STATUSES = new Set(["queued", "running", "succeeded", "failed", "cancelled"]);
const AGENT_OPERATIONS = new Set(["mission_patch", "mini_app", "feedback", "workflow", "query", "connector_read"]);
const PROPOSAL_STATUSES = new Set(["proposed", "accepted", "rejected", "stale", "expired"]);
const RISKS = new Set(["low", "medium", "high"]);
const PERMISSIONS = new Set(["read_mission", "read_sources", "read_learning", "propose_mission", "propose_tool", "propose_feedback"]);
const SKILL_KINDS = new Set(["workflow", "mini_app", "query", "connector"]);
const SKILL_STATUSES = new Set(["draft", "approved", "superseded", "retired"]);
const HANDOFF_STATUSES = new Set(["offered", "accepted", "expired", "cancelled", "completed"]);
const HANDOFF_SCOPES = new Set(["mission", "agent_run", "skill", "workspace"]);
const HANDOFF_CAPABILITIES = new Set(["read", "review", "edit", "approve", "create_repeat", "sync"]);
const SYNC_ENTITY_TYPES = new Set(["mission", "learning_event", "memory", "agent_run", "agent_proposal", "skill", "handoff", "device"]);
const SYNC_ACTIONS = new Set(["create", "update", "tombstone", "append", "accept", "reject", "forget", "complete"]);
const SYNC_STATUSES = new Set(["queued", "in_flight", "applied", "conflict", "failed", "cancelled"]);

function fail(message) {
  throw new Error(message);
}

function object(value, name, keys, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(`Invalid ${name}.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key) || DANGEROUS_KEYS.has(key)) fail(`Unsupported ${name} property.`);
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

function safeId(value, name, maximum = 160) {
  const result = text(value, name, maximum, true);
  if (!SAFE_ID_PATTERN.test(result) || DANGEROUS_KEYS.has(result)) fail(`Invalid ${name}.`);
  return result;
}

function key(value, name) {
  const result = text(value, name, 128, true).toLowerCase();
  if (!KEY_PATTERN.test(result)) fail(`Invalid ${name}.`);
  return result;
}

function integer(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`Invalid ${name}.`);
  return value;
}

function number(value, name, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(`Invalid ${name}.`);
  return value;
}

function timestamp(value, name) {
  text(value, name, 50, true);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(value))) fail(`Invalid ${name}.`);
  if (new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) fail(`Invalid ${name}.`);
  return value;
}

function array(value, name, maximum) {
  if (!Array.isArray(value) || value.length > maximum) fail(`Invalid ${name}.`);
  for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) fail(`Invalid ${name}.`);
  return value;
}

function uniqueList(value, name, maximum, map) {
  const result = array(value, name, maximum).map(map);
  if (new Set(result).size !== result.length) fail(`Duplicate ${name}.`);
  return result;
}

function safeJson(value, path = "JSON value", depth = 0) {
  if (depth > 8) fail(`Invalid ${path}.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > 20000) fail(`Invalid ${path}.`);
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "undefined" || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") fail(`Invalid ${path}.`);
  if (Array.isArray(value)) return array(value, path, 300).map((item, index) => safeJson(item, `${path}[${index}]`, depth + 1));
  if (typeof value === "object") {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${path}.`);
    const result = {};
    const keys = Reflect.ownKeys(value);
    if (keys.length > 100) fail(`Invalid ${path}.`);
    for (const childKey of keys) {
      if (typeof childKey !== "string" || DANGEROUS_KEYS.has(childKey)) fail(`Invalid ${path} property.`);
      const descriptor = Object.getOwnPropertyDescriptor(value, childKey);
      if (!descriptor?.enumerable || !("value" in descriptor)) fail(`Invalid ${path} property.`);
      result[childKey] = safeJson(value[childKey], `${path}.${childKey}`, depth + 1);
    }
    return result;
  }
  fail(`Invalid ${path}.`);
}

function boundedJson(value, name, maximumBytes = 256 * 1024) {
  const result = safeJson(value, name);
  if (!result || typeof result !== "object" || Array.isArray(result)) fail(`${name} must be an object.`);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > maximumBytes) fail(`${name} is too large.`);
  return result;
}

function optionalUuid(value, name) {
  return value === null ? null : uuid(value, name);
}

function optionalTimestamp(value, name) {
  return value === null ? null : timestamp(value, name);
}

function uri(value) {
  const result = text(value, "source URI", 2048, true).trim();
  if (/^(?:javascript|vbscript|data):/i.test(result)) fail("Executable source URI schemes are not allowed.");
  return result;
}

export function validateSourceReference(raw) {
  object(raw, "source reference", ["schema", "version", "kind", "id", "label", "locator", "uri", "missionId", "revision", "sensitive", "createdAt"], ["uri", "missionId", "revision", "sensitive", "createdAt"]);
  if (raw.schema !== SOURCE_REFERENCE_SCHEMA || raw.version !== DOMAIN_VERSION) fail("Unsupported source reference version.");
  if (!SOURCE_KINDS.has(raw.kind)) fail("Invalid source reference kind.");
  const result = {
    schema: SOURCE_REFERENCE_SCHEMA,
    version: DOMAIN_VERSION,
    kind: raw.kind,
    id: safeId(raw.id, "source reference ID"),
    label: text(raw.label, "source reference label", 180, true).trim(),
    locator: text(raw.locator, "source locator", 500, true).trim(),
    uri: raw.uri === undefined || raw.uri === null ? null : uri(raw.uri),
    missionId: raw.missionId === undefined ? null : optionalUuid(raw.missionId, "source mission ID"),
    revision: raw.revision === undefined || raw.revision === null ? null : integer(raw.revision, "source revision", 1),
    sensitive: raw.sensitive === undefined ? false : raw.sensitive,
    createdAt: raw.createdAt === undefined ? null : optionalTimestamp(raw.createdAt, "source creation time"),
  };
  if (typeof result.sensitive !== "boolean") fail("Source sensitivity must be boolean.");
  if (result.kind === "mission" && result.missionId === null) fail("Mission source references require a mission ID.");
  return result;
}

export function validateSourceReferences(raw, { maximum = 32 } = {}) {
  return uniqueList(raw, "source references", maximum, validateSourceReference);
}

function validatePermissions(raw) {
  return uniqueList(raw, "agent permissions", 8, permission => {
    const value = text(permission, "agent permission", 40, true);
    if (!PERMISSIONS.has(value)) fail("Unsupported agent permission.");
    return value;
  });
}

function validateBudget(raw) {
  object(raw, "agent budget", ["maxTokens", "maxDurationMs", "maxOutputBytes"]);
  return {
    maxTokens: integer(raw.maxTokens, "maximum agent tokens", 1, 1_000_000),
    maxDurationMs: integer(raw.maxDurationMs, "maximum agent duration", 100, 86_400_000),
    maxOutputBytes: integer(raw.maxOutputBytes, "maximum agent output", 1_024, 10 * 1024 * 1024),
  };
}

export function validateAgentRun(raw) {
  object(raw, "agent run", ["schema", "version", "id", "missionId", "role", "status", "inputRefs", "outputRefs", "baseRevision", "provider", "model", "budget", "permissions", "idempotencyKey", "createdAt", "startedAt", "finishedAt", "error"]);
  if (raw.schema !== AGENT_RUN_SCHEMA || raw.version !== DOMAIN_VERSION) fail("Unsupported agent run version.");
  if (!AGENT_ROLES.has(raw.role) || !AGENT_RUN_STATUSES.has(raw.status)) fail("Invalid agent run classification.");
  const result = {
    schema: AGENT_RUN_SCHEMA,
    version: DOMAIN_VERSION,
    id: uuid(raw.id, "agent run ID"),
    missionId: uuid(raw.missionId, "agent run mission ID"),
    role: raw.role,
    status: raw.status,
    inputRefs: validateSourceReferences(raw.inputRefs, { maximum: 32 }),
    outputRefs: validateSourceReferences(raw.outputRefs, { maximum: 32 }),
    baseRevision: integer(raw.baseRevision, "agent run base revision", 1),
    provider: text(raw.provider, "agent provider", 80, true).trim(),
    model: text(raw.model, "agent model", 120, true).trim(),
    budget: validateBudget(raw.budget),
    permissions: validatePermissions(raw.permissions),
    idempotencyKey: key(raw.idempotencyKey, "agent run idempotency key"),
    createdAt: timestamp(raw.createdAt, "agent run creation time"),
    startedAt: optionalTimestamp(raw.startedAt, "agent run start time"),
    finishedAt: optionalTimestamp(raw.finishedAt, "agent run finish time"),
    error: raw.error === null ? null : text(raw.error, "agent run error", 1000),
  };
  if (result.status === "queued" && (result.startedAt !== null || result.finishedAt !== null)) fail("Queued agent runs cannot have execution timestamps.");
  if (["succeeded", "failed", "cancelled"].includes(result.status) && result.finishedAt === null) fail("Finished agent runs require a finish time.");
  if (result.status === "failed" && !result.error) fail("Failed agent runs require an error.");
  if (result.status !== "failed" && result.error !== null) fail("Only failed agent runs may contain an error.");
  return result;
}

function proposalBody(raw) {
  return boundedJson(raw, "agent proposal body", 256 * 1024);
}

export function validateAgentProposalRecord(raw) {
  object(raw, "agent proposal record", ["schema", "version", "id", "missionId", "runId", "role", "operation", "status", "title", "summary", "baseRevision", "sourceRefs", "permissions", "body", "risk", "idempotencyKey", "createdAt", "expiresAt"]);
  if (raw.schema !== AGENT_PROPOSAL_SCHEMA || raw.version !== DOMAIN_VERSION) fail("Unsupported agent proposal record version.");
  if (!AGENT_ROLES.has(raw.role) || !AGENT_OPERATIONS.has(raw.operation) || !PROPOSAL_STATUSES.has(raw.status) || !RISKS.has(raw.risk)) fail("Invalid agent proposal classification.");
  const permissions = validatePermissions(raw.permissions);
  const result = {
    schema: AGENT_PROPOSAL_SCHEMA,
    version: DOMAIN_VERSION,
    id: uuid(raw.id, "agent proposal ID"),
    missionId: uuid(raw.missionId, "proposal mission ID"),
    runId: uuid(raw.runId, "proposal run ID"),
    role: raw.role,
    operation: raw.operation,
    status: raw.status,
    title: text(raw.title, "proposal title", 120, true).trim(),
    summary: text(raw.summary, "proposal summary", 2000).trim(),
    baseRevision: integer(raw.baseRevision, "proposal base revision", 1),
    sourceRefs: validateSourceReferences(raw.sourceRefs, { maximum: 32 }),
    permissions,
    body: proposalBody(raw.body),
    risk: raw.risk,
    idempotencyKey: key(raw.idempotencyKey, "proposal idempotency key"),
    createdAt: timestamp(raw.createdAt, "proposal creation time"),
    expiresAt: optionalTimestamp(raw.expiresAt, "proposal expiry time"),
  };
  if (result.status === "accepted" && !permissions.some(permission => ["propose_mission", "propose_tool", "propose_feedback"].includes(permission))) fail("Accepted proposals require a mutation permission.");
  if (result.expiresAt !== null && Date.parse(result.expiresAt) <= Date.parse(result.createdAt)) fail("Proposal expiry must be after creation.");
  return result;
}

export function acceptAgentProposalRecord(raw, currentRevision, at = new Date().toISOString()) {
  const proposal = validateAgentProposalRecord(raw);
  if (proposal.status !== "proposed") fail("Only proposed agent proposals can be accepted.");
  integer(currentRevision, "current mission revision", 1);
  timestamp(at, "proposal decision time");
  if (proposal.baseRevision !== currentRevision) return validateAgentProposalRecord({ ...proposal, status: "stale" });
  return validateAgentProposalRecord({ ...proposal, status: "accepted" });
}

export function rejectAgentProposalRecord(raw, at = new Date().toISOString()) {
  const proposal = validateAgentProposalRecord(raw);
  if (proposal.status !== "proposed") fail("Only proposed agent proposals can be rejected.");
  timestamp(at, "proposal decision time");
  return validateAgentProposalRecord({ ...proposal, status: "rejected" });
}

function validateWorkflowDefinition(raw) {
  object(raw, "workflow definition", ["schema", "version", "steps"]);
  if (raw.schema !== "saathi.workflow" || raw.version !== DOMAIN_VERSION) fail("Unsupported workflow definition version.");
  const steps = array(raw.steps, "workflow steps", 50);
  const ids = new Set();
  return {
    schema: "saathi.workflow",
    version: DOMAIN_VERSION,
    steps: steps.map((step, index) => {
      object(step, `workflow step ${index + 1}`, ["id", "title", "kind", "role", "requiresApproval"]);
      const id = safeId(step.id, `workflow step ${index + 1} ID`, 48).toLowerCase();
      if (ids.has(id)) fail("Duplicate workflow step ID.");
      ids.add(id);
      if (!AGENT_ROLES.has(step.role) && step.role !== "human") fail("Invalid workflow step role.");
      if (typeof step.requiresApproval !== "boolean") fail("Workflow approval flag must be boolean.");
      return { id, title: text(step.title, "workflow step title", 160, true).trim(), kind: safeId(step.kind, "workflow step kind", 48).toLowerCase(), role: step.role, requiresApproval: step.requiresApproval };
    }),
  };
}

function validateQueryDefinition(raw) {
  object(raw, "query definition", ["schema", "version", "language", "template", "parameters", "visualization"]);
  if (raw.schema !== "saathi.query-template" || raw.version !== DOMAIN_VERSION || raw.language !== "sql") fail("Unsupported query definition.");
  const template = text(raw.template, "query template", 12_000, true).trim();
  if (!/^(select|with)\b/i.test(template) || /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|execute|call|merge|replace)\b/i.test(template)) fail("Query templates must be read-only SQL.");
  const parameters = uniqueList(raw.parameters, "query parameters", 32, (parameter) => key(parameter, "query parameter"));
  if (!new Set(["table", "bar", "line", "pie", "number"]).has(raw.visualization)) fail("Invalid query visualization.");
  return { schema: "saathi.query-template", version: DOMAIN_VERSION, language: "sql", template, parameters, visualization: raw.visualization };
}

function validateConnectorDefinition(raw) {
  object(raw, "connector definition", ["schema", "version", "connector", "operation", "scopes", "readOnly"]);
  if (raw.schema !== "saathi.connector-recipe" || raw.version !== DOMAIN_VERSION) fail("Unsupported connector definition.");
  if (!new Set(["read", "draft"]).has(raw.operation) || raw.readOnly !== true) fail("Connector recipes must be read-only or draft-only.");
  return { schema: "saathi.connector-recipe", version: DOMAIN_VERSION, connector: safeId(raw.connector, "connector ID", 80).toLowerCase(), operation: raw.operation, scopes: uniqueList(raw.scopes, "connector scopes", 12, scope => safeId(scope, "connector scope", 80).toLowerCase()), readOnly: true };
}

export function validateSkillDefinition(kind, raw) {
  if (!SKILL_KINDS.has(kind)) fail("Invalid skill kind.");
  if (kind === "mini_app") return validateSpec(raw);
  if (kind === "workflow") return validateWorkflowDefinition(raw);
  if (kind === "query") return validateQueryDefinition(raw);
  return validateConnectorDefinition(raw);
}

export function validateSkillVersion(raw) {
  object(raw, "skill version", ["schema", "version", "id", "skillId", "skillVersion", "kind", "title", "summary", "status", "sourceMissionId", "sourceRevision", "sourceRefs", "definition", "validation", "metrics", "supersedes", "createdAt", "updatedAt"]);
  if (raw.schema !== SKILL_VERSION_SCHEMA || raw.version !== DOMAIN_VERSION) fail("Unsupported skill version record.");
  if (!SKILL_KINDS.has(raw.kind) || !SKILL_STATUSES.has(raw.status)) fail("Invalid skill classification.");
  object(raw.validation, "skill validation", ["status", "checkedAt", "errors"]);
  if (!new Set(["passed", "failed"]).has(raw.validation.status)) fail("Invalid skill validation status.");
  const validation = { status: raw.validation.status, checkedAt: timestamp(raw.validation.checkedAt, "skill validation time"), errors: uniqueList(raw.validation.errors, "skill validation errors", 20, error => text(error, "skill validation error", 300, true).trim()) };
  object(raw.metrics, "skill metrics", ["uses", "successfulUses"]);
  const metrics = { uses: integer(raw.metrics.uses, "skill uses", 0, 1_000_000_000), successfulUses: integer(raw.metrics.successfulUses, "successful skill uses", 0, 1_000_000_000) };
  if (metrics.successfulUses > metrics.uses) fail("Successful skill uses cannot exceed uses.");
  const result = {
    schema: SKILL_VERSION_SCHEMA,
    version: DOMAIN_VERSION,
    id: uuid(raw.id, "skill version ID"),
    skillId: key(raw.skillId, "skill ID"),
    skillVersion: integer(raw.skillVersion, "skill version number", 1, 1_000_000),
    kind: raw.kind,
    title: text(raw.title, "skill title", 120, true).trim(),
    summary: text(raw.summary, "skill summary", 2000).trim(),
    status: raw.status,
    sourceMissionId: optionalUuid(raw.sourceMissionId, "skill source mission ID"),
    sourceRevision: raw.sourceRevision === null ? null : integer(raw.sourceRevision, "skill source revision", 1),
    sourceRefs: validateSourceReferences(raw.sourceRefs, { maximum: 32 }),
    definition: validateSkillDefinition(raw.kind, raw.definition),
    validation,
    metrics,
    supersedes: optionalUuid(raw.supersedes, "superseded skill ID"),
    createdAt: timestamp(raw.createdAt, "skill creation time"),
    updatedAt: timestamp(raw.updatedAt, "skill update time"),
  };
  if (result.status === "approved" && result.validation.status !== "passed") fail("Approved skills require passed validation.");
  if (result.sourceMissionId !== null && result.sourceRevision === null) fail("Mission-derived skills require a source revision.");
  return result;
}

export function validateDeviceHandoff(raw) {
  object(raw, "device handoff", ["schema", "version", "id", "missionId", "runId", "sourceDeviceId", "targetDeviceId", "scope", "capabilities", "status", "baseRevision", "tokenRef", "createdAt", "expiresAt", "acceptedAt", "completedAt"]);
  if (raw.schema !== DEVICE_HANDOFF_SCHEMA || raw.version !== DOMAIN_VERSION) fail("Unsupported device handoff version.");
  if (!HANDOFF_SCOPES.has(raw.scope) || !HANDOFF_STATUSES.has(raw.status)) fail("Invalid device handoff classification.");
  const capabilities = uniqueList(raw.capabilities, "handoff capabilities", 6, capability => {
    const value = safeId(capability, "handoff capability", 40).toLowerCase();
    if (!HANDOFF_CAPABILITIES.has(value)) fail("Unsupported handoff capability.");
    return value;
  });
  const result = {
    schema: DEVICE_HANDOFF_SCHEMA,
    version: DOMAIN_VERSION,
    id: uuid(raw.id, "handoff ID"),
    missionId: optionalUuid(raw.missionId, "handoff mission ID"),
    runId: optionalUuid(raw.runId, "handoff run ID"),
    sourceDeviceId: uuid(raw.sourceDeviceId, "source device ID"),
    targetDeviceId: uuid(raw.targetDeviceId, "target device ID"),
    scope: raw.scope,
    capabilities,
    status: raw.status,
    baseRevision: integer(raw.baseRevision, "handoff base revision", 1),
    tokenRef: key(raw.tokenRef, "handoff token reference"),
    createdAt: timestamp(raw.createdAt, "handoff creation time"),
    expiresAt: timestamp(raw.expiresAt, "handoff expiry time"),
    acceptedAt: optionalTimestamp(raw.acceptedAt, "handoff acceptance time"),
    completedAt: optionalTimestamp(raw.completedAt, "handoff completion time"),
  };
  if (result.sourceDeviceId === result.targetDeviceId) fail("A handoff requires two different devices.");
  if (Date.parse(result.expiresAt) <= Date.parse(result.createdAt)) fail("Handoff expiry must be after creation.");
  if (result.scope === "mission" && result.missionId === null) fail("Mission handoffs require a mission ID.");
  if (result.scope === "agent_run" && result.runId === null) fail("Agent run handoffs require a run ID.");
  if (result.status === "offered" && (result.acceptedAt !== null || result.completedAt !== null)) fail("Offered handoffs cannot have completion timestamps.");
  if (["accepted", "completed"].includes(result.status) && result.acceptedAt === null) fail("Accepted handoffs require an acceptance time.");
  if (result.status === "completed" && result.completedAt === null) fail("Completed handoffs require a completion time.");
  return result;
}

export function validateSyncOperation(raw) {
  object(raw, "sync operation", ["schema", "version", "id", "deviceId", "entityType", "entityId", "action", "status", "idempotencyKey", "baseRevision", "attempts", "dependsOn", "payload", "error", "createdAt", "updatedAt"]);
  if (raw.schema !== SYNC_OPERATION_SCHEMA || raw.version !== DOMAIN_VERSION) fail("Unsupported sync operation version.");
  if (!SYNC_ENTITY_TYPES.has(raw.entityType) || !SYNC_ACTIONS.has(raw.action) || !SYNC_STATUSES.has(raw.status)) fail("Invalid sync operation classification.");
  const result = {
    schema: SYNC_OPERATION_SCHEMA,
    version: DOMAIN_VERSION,
    id: uuid(raw.id, "sync operation ID"),
    deviceId: uuid(raw.deviceId, "sync device ID"),
    entityType: raw.entityType,
    entityId: safeId(raw.entityId, "sync entity ID"),
    action: raw.action,
    status: raw.status,
    idempotencyKey: key(raw.idempotencyKey, "sync idempotency key"),
    baseRevision: raw.baseRevision === null ? null : integer(raw.baseRevision, "sync base revision", 1),
    attempts: integer(raw.attempts, "sync attempts", 0, 20),
    dependsOn: uniqueList(raw.dependsOn, "sync dependencies", 20, dependency => uuid(dependency, "sync dependency ID")),
    payload: raw.payload === null ? null : boundedJson(raw.payload, "sync payload", 256 * 1024),
    error: raw.error === null ? null : text(raw.error, "sync error", 1000),
    createdAt: timestamp(raw.createdAt, "sync creation time"),
    updatedAt: timestamp(raw.updatedAt, "sync update time"),
  };
  if (result.dependsOn.includes(result.id)) fail("A sync operation cannot depend on itself.");
  if (result.status === "failed" && !result.error) fail("Failed sync operations require an error.");
  if (result.status !== "failed" && result.error !== null) fail("Only failed sync operations may contain an error.");
  if (["create", "update", "append", "accept", "reject", "forget", "complete"].includes(result.action) && result.payload === null) fail("Mutating sync operations require a payload.");
  return result;
}

