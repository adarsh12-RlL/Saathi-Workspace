import assert from "node:assert/strict";
import test from "node:test";
import { createPlannerProposal, prepareProposalApplication } from "./agent-planner.mjs";

const MISSION = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const stamp = "2026-10-09T10:00:00.000Z";
const later = "2026-10-09T10:10:00.000Z";
const sequence = () => {
  let next = 1;
  return () => `22222222-2222-4222-8222-${String(next++).padStart(12, "0")}`;
};
const mission = (overrides = {}) => ({
  id: MISSION, title: "Build a study tool", goal: "Create a quiz for chapter one", notes: "Keep this private note intact",
  nextStep: "Write five questions", stage: "captured", tasks: [{ id: "existing-task", title: "Read the chapter", done: true }],
  decisions: [{ id: "decision", text: "Use a small quiz", at: stamp }],
  artifacts: [{ id: "artifact", title: "Source", kind: "Document", content: "Chapter notes" }],
  miniApps: [], updatedAt: stamp, templateSource: null, reflection: null, ...overrides,
});
const proposal = (overrides = {}, selectedMission = mission()) => ({
  ...createPlannerProposal(selectedMission, 4, { newId: sequence(), at: stamp }), ...overrides,
});
function freezeDeep(value) {
  for (const item of Object.values(value)) if (item && typeof item === "object") freezeDeep(item);
  return Object.freeze(value);
}

test("rules-based planner uses mission evidence and yields deterministic bounded starter tasks", () => {
  const first = proposal();
  assert.deepEqual(first, proposal());
  assert.equal(first.role, "planner");
  assert.equal(first.status, "proposed");
  assert.deepEqual(first.evidence, [`mission:${MISSION}`, "revision:4"]);
  assert.equal(first.body.nextStep, "Write five questions");
  assert.equal(first.body.tasks[0].title, "Write five questions");
  assert.match(first.summary, /Rules-based/);
  assert.match(first.summary, /no AI provider/);
  assert.equal(new Set([first.id, first.runId, ...first.body.tasks.map(task => task.id)]).size, 4);

  const goalPlan = proposal({}, mission({ nextStep: " ", goal: "a".repeat(2000) }));
  assert.equal(goalPlan.body.tasks[0].title.length, 300);
  assert.equal(goalPlan.body.nextStep.length, 400);
  const titlePlan = proposal({}, mission({ nextStep: "", goal: "" }));
  assert.equal(titlePlan.body.tasks[0].title, "Build a study tool");
  const nearlyFull = mission({ tasks: Array.from({ length: 99 }, (_, index) => ({ id: `task-${index}`, title: `Step ${index}`, done: false })) });
  assert.equal(proposal({}, nearlyFull).body.tasks.length, 1);
});

test("planner rejects invalid mission, revision, time, full capacity and colliding generated IDs", () => {
  assert.throws(() => proposal({}, mission({ id: "local" })), /UUID/);
  assert.throws(() => createPlannerProposal(mission(), 0), /revision/);
  assert.throws(() => createPlannerProposal(mission(), 4, { at: "2026-02-30T10:00:00Z" }), /timestamp/);
  assert.throws(() => createPlannerProposal(mission(), 4, { newId: () => MISSION, at: stamp }), /Duplicate/);
  const full = mission({ tasks: Array.from({ length: 100 }, (_, index) => ({ id: `task-${index}`, title: `Step ${index}`, done: false })) });
  assert.throws(() => proposal({}, full), /maximum number/);
});

test("preparation is immutable, appends only unchecked tasks and waits for CAS before acceptance", () => {
  const original = freezeDeep(mission());
  const suggestion = freezeDeep(proposal());
  const originalJson = JSON.stringify(original);
  const proposalJson = JSON.stringify(suggestion);
  const result = prepareProposalApplication(suggestion, original, 4, { at: later });
  assert.equal(result.proposal.status, "proposed");
  assert.equal(result.mission.tasks.length, 3);
  assert.deepEqual(result.mission.tasks[0], original.tasks[0]);
  assert.deepEqual(result.mission.tasks.slice(1).map(task => task.done), [false, false]);
  assert.equal(result.mission.updatedAt, later);
  for (const field of ["notes", "goal", "stage", "decisions", "artifacts", "miniApps", "templateSource", "reflection"]) {
    assert.deepEqual(result.mission[field], original[field]);
  }
  assert.equal(JSON.stringify(original), originalJson);
  assert.equal(JSON.stringify(suggestion), proposalJson);
  assert.notEqual(result.mission, original);
  assert.notEqual(result.mission.tasks, original.tasks);
});

test("wrong mission is rejected and stale or expired proposals preserve the snapshot", () => {
  const original = mission();
  assert.throws(() => prepareProposalApplication(proposal({ missionId: OTHER }), original, 4, { at: later }), /another mission/);
  const stale = prepareProposalApplication(proposal(), original, 5, { at: later });
  assert.equal(stale.proposal.status, "stale");
  assert.deepEqual(stale.mission, original);
  const expired = prepareProposalApplication(proposal({ expiresAt: later }), original, 5, { at: later });
  assert.equal(expired.proposal.status, "expired");
  assert.deepEqual(expired.mission, original);
});

test("application requires an active mission mutation proposal and permission", () => {
  assert.throws(() => prepareProposalApplication(proposal({ permissions: ["read_mission", "propose_tool"] }), mission(), 4, { at: later }), /propose_mission/);
  assert.throws(() => prepareProposalApplication(proposal({ operation: "feedback" }), mission(), 4, { at: later }), /Only mission_patch/);
  for (const status of ["accepted", "rejected", "stale", "expired"]) {
    assert.throws(() => prepareProposalApplication(proposal({ status }), mission(), 4, { at: later }), /Only proposed/);
  }
  assert.throws(() => prepareProposalApplication(proposal(), mission(), 0, { at: later }), /revision/);
  assert.throws(() => prepareProposalApplication(proposal(), mission(), 4, { at: "bad time" }), /application time/);
  assert.throws(() => prepareProposalApplication(proposal(), mission(), 4, { at: "2026-10-09T09:59:59.000Z" }), /precedes/);
});

test("hostile bodies, attempted completion edits and duplicate IDs are rejected", () => {
  const task = { id: "new-task", title: "Do the work" };
  for (const body of [
    { notes: "replace private notes", tasks: [task] },
    { stage: "complete", tasks: [task] },
    { execute: "process.exit()", tasks: [task] },
    { permissions: ["propose_mission"], tasks: [task] },
    { tasks: [{ ...task, done: true }] },
    { tasks: [{ ...task, constructor: "run code" }] },
    { tasks: [task, task] },
    { tasks: [{ ...task, id: "existing-task" }] },
    { nextStep: "a".repeat(401) },
    { tasks: [{ ...task, title: "a".repeat(301) }] },
    { tasks: [] },
    { nextStep: "Write five questions" },
  ]) {
    assert.throws(() => prepareProposalApplication(proposal({ body }), mission(), 4, { at: later }));
  }
  const full = mission({ tasks: Array.from({ length: 100 }, (_, index) => ({ id: `task-${index}`, title: `Step ${index}`, done: false })) });
  assert.throws(() => prepareProposalApplication(proposal(), full, 4, { at: later }), /Invalid tasks/);
});

test("tampered accessors, non-JSON task lists and hidden nested execution never run", () => {
  let ran = false;
  const body = {};
  Object.defineProperty(body, "nextStep", { enumerable: true, get() { ran = true; return "unsafe"; } });
  assert.throws(() => prepareProposalApplication(proposal({ body }), mission(), 4, { at: later }), /property/);
  assert.equal(ran, false);

  const accessorProposal = proposal();
  Object.defineProperty(accessorProposal, "body", { enumerable: true, get() { ran = true; return {}; } });
  assert.throws(() => prepareProposalApplication(accessorProposal, mission(), 4, { at: later }), /body property/);
  assert.equal(ran, false);

  const tasks = [{ id: "task", title: "Safe" }];
  Object.defineProperty(tasks, "0", { enumerable: true, get() { ran = true; return {}; } });
  assert.throws(() => prepareProposalApplication(proposal({ body: { tasks } }), mission(), 4, { at: later }), /entry/);
  assert.equal(ran, false);
  assert.throws(() => prepareProposalApplication(proposal({ body: { tasks: new Array(1) } }), mission(), 4, { at: later }), /entry/);

  const nested = { nextStep: { deep: { deep: { deep: { deep: { deep: { deep: { deep: { deep: { deep: () => { ran = true; } } } } } } } } } } };
  assert.throws(() => prepareProposalApplication(proposal({ body: nested }), mission(), 4, { at: later }), /next step/);
  assert.equal(ran, false);
  assert.throws(() => prepareProposalApplication(proposal({ body: JSON.parse('{"__proto__":{"polluted":true},"nextStep":"safe"}') }), mission(), 4, { at: later }), /property/);
  assert.equal({}.polluted, undefined);
});
