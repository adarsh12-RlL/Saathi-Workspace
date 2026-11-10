import { AGENT_PROPOSAL_SCHEMA, validateAgentProposal, revision as proposalRevision } from "./agent-room.mjs";
import { validateMissionSnapshot, uuid } from "./cloud/contracts.mjs";

// A rules-based starter plan. These functions neither call an AI provider nor
// write to storage. The caller must review the proposal and perform a CAS save.
function fail(message) { throw new Error(message); }

function time(value, name) {
  if (typeof value !== "string" || value.length > 50) fail(`Invalid ${name}.`);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(value))) fail(`Invalid ${name}.`);
  if (new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) fail(`Invalid ${name}.`);
  return value;
}

function strictObject(value, allowed, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`Invalid ${name}.`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !allowed.includes(key) || !descriptor?.enumerable || !("value" in descriptor)) fail(`Unsupported ${name} property.`);
  }
  return value;
}

function boundedText(value, name, maximum) {
  if (typeof value !== "string" || value.length > maximum || !value.trim()) fail(`Invalid ${name}.`);
  return value;
}

function strictTasks(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) fail("Invalid mission patch tasks.");
  const allowed = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) fail("Unsupported mission patch tasks property.");
  }
  const ids = new Set();
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) fail("Invalid mission patch task entry.");
    const task = strictObject(descriptor.value, ["id", "title"], "mission patch task");
    if (!Object.hasOwn(task, "id") || !Object.hasOwn(task, "title")) fail("Missing mission patch task field.");
    const id = boundedText(task.id, "mission patch task ID", 100);
    const title = boundedText(task.title, "mission patch task title", 300);
    if (ids.has(id)) fail("Duplicate mission patch task ID.");
    ids.add(id);
    return { id, title };
  });
}

function patchBody(raw) {
  const body = strictObject(raw, ["nextStep", "tasks"], "mission patch body");
  const result = {};
  if (Object.hasOwn(body, "nextStep")) result.nextStep = boundedText(body.nextStep, "mission patch next step", 400);
  if (Object.hasOwn(body, "tasks")) result.tasks = strictTasks(body.tasks);
  if (!Object.hasOwn(result, "nextStep") && !result.tasks?.length) fail("Mission patch must contain a next step or new tasks.");
  return result;
}

function checkedProposal(raw) {
  // Check the action body before the general proposal validator touches it.
  // Only bounded, shallow action data can reach the application path.
  if (!raw || typeof raw !== "object") fail("Invalid agent proposal.");
  const bodyDescriptor = Object.getOwnPropertyDescriptor(raw, "body");
  if (!bodyDescriptor || !("value" in bodyDescriptor)) fail("Invalid proposal body property.");
  const body = patchBody(bodyDescriptor.value);
  const proposal = validateAgentProposal(raw);
  if (proposal.operation !== "mission_patch") fail("Only mission_patch proposals can be applied here.");
  if (!proposal.permissions.includes("propose_mission")) fail("Mission proposals require propose_mission permission.");
  if (proposal.status !== "proposed") fail("Only proposed agent proposals can be prepared.");
  return { ...proposal, body };
}

export function createPlannerProposal(rawMission, currentRevision, { newId = () => globalThis.crypto.randomUUID(), at = new Date().toISOString() } = {}) {
  const mission = validateMissionSnapshot(rawMission, { requireUuid: true });
  const baseRevision = proposalRevision(currentRevision);
  time(at, "planner timestamp");
  if (typeof newId !== "function") fail("Invalid planner ID generator.");
  const capacity = 100 - mission.tasks.length;
  if (!capacity) fail("This mission already has the maximum number of tasks.");
  const generated = new Set([mission.id, ...mission.tasks.map(task => task.id)]);
  const id = () => {
    const candidate = uuid(newId(), "planner generated ID");
    if (generated.has(candidate)) fail("Duplicate planner generated ID.");
    generated.add(candidate);
    return candidate;
  };
  const target = (mission.nextStep.trim() || mission.goal.trim() || mission.title.trim()).replace(/\s+/g, " ");
  const titles = [target.slice(0, 300), "Check the result against the mission goal and record evidence"].slice(0, capacity);
  const proposalId = id();
  const runId = id();
  const tasks = titles.map(title => ({ id: id(), title }));
  return validateAgentProposal({
    schema: AGENT_PROPOSAL_SCHEMA,
    version: 1,
    id: proposalId,
    missionId: mission.id,
    runId,
    role: "planner",
    operation: "mission_patch",
    status: "proposed",
    title: "Starter plan from your mission",
    summary: "Rules-based suggestion using your next step, goal, or title. Review the new tasks before saving; no AI provider was used.",
    baseRevision,
    evidence: [`mission:${mission.id}`, `revision:${baseRevision}`],
    permissions: ["read_mission", "propose_mission"],
    body: { nextStep: target.slice(0, 400), tasks },
    risk: "low",
    createdAt: at,
    expiresAt: null,
  });
}

export function prepareProposalApplication(rawProposal, rawMission, currentRevision, { at = new Date().toISOString() } = {}) {
  const proposal = checkedProposal(rawProposal);
  const mission = validateMissionSnapshot(rawMission, { requireUuid: true });
  proposalRevision(currentRevision);
  time(at, "proposal application time");
  if (proposal.missionId !== mission.id) fail("Proposal belongs to another mission.");
  if (Date.parse(at) < Date.parse(proposal.createdAt)) fail("Proposal application time precedes its creation.");
  if (proposal.expiresAt !== null && Date.parse(proposal.expiresAt) <= Date.parse(at)) {
    return { proposal: validateAgentProposal({ ...proposal, status: "expired" }), mission };
  }
  if (proposal.baseRevision !== currentRevision) {
    return { proposal: validateAgentProposal({ ...proposal, status: "stale" }), mission };
  }
  const existingIds = new Set(mission.tasks.map(task => task.id));
  const additions = (proposal.body.tasks ?? []).map(task => {
    if (existingIds.has(task.id)) fail("Duplicate mission task ID.");
    return { ...task, done: false };
  });
  const nextStep = proposal.body.nextStep ?? mission.nextStep;
  if (!additions.length && nextStep === mission.nextStep) fail("Proposal does not change the mission.");
  const updated = validateMissionSnapshot({ ...mission, nextStep, tasks: [...mission.tasks, ...additions], updatedAt: at }, { requireUuid: true });
  // Preparing is not accepting: only the caller's successful revision-checked
  // cloud save makes this proposal accepted. A failed save leaves it proposed.
  return { proposal, mission: updated };
}
