import assert from "node:assert/strict";
import test from "node:test";
import { acceptAgentProposal, rejectAgentProposal, validateAgentProposal } from "./agent-room.mjs";

const MISSION = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const PROPOSAL = "33333333-3333-4333-8333-333333333333";
const stamp = "2026-10-08T10:00:00.000Z";
const proposal = (overrides = {}) => ({
  schema: "saathi.agent-proposal", version: 1, id: PROPOSAL, missionId: MISSION, runId: RUN,
  role: "planner", operation: "mission_patch", status: "proposed", title: "Break this into steps",
  summary: "Add three small milestones before starting.", baseRevision: 4, evidence: ["mission:" + MISSION],
  permissions: ["read_mission", "propose_mission"], body: { tasks: [{ title: "First step" }] }, risk: "low",
  createdAt: stamp, expiresAt: null, ...overrides,
});

test("agent proposals are strict JSON and preserve review metadata", () => {
  const checked = validateAgentProposal(proposal());
  assert.equal(checked.status, "proposed");
  assert.equal(checked.baseRevision, 4);
  assert.deepEqual(checked.body, { tasks: [{ title: "First step" }] });
  assert.throws(() => validateAgentProposal(proposal({ body: { __proto__: { unsafe: true } } })), /body/);
  assert.throws(() => validateAgentProposal(proposal({ permissions: ["execute_code"] })), /permission/);
  assert.throws(() => validateAgentProposal(proposal({ status: "accepted", permissions: ["read_mission"] })), /mutation permission/);
});

test("acceptance is revision-aware and turns stale proposals into visible stale state", () => {
  assert.equal(acceptAgentProposal(proposal(), 4).status, "accepted");
  assert.equal(acceptAgentProposal(proposal(), 5).status, "stale");
  assert.throws(() => acceptAgentProposal(proposal({ status: "rejected" }), 4), /Only proposed/);
});

test("rejection is explicit and cannot silently be applied twice", () => {
  const rejected = rejectAgentProposal(proposal());
  assert.equal(rejected.status, "rejected");
  assert.throws(() => rejectAgentProposal(rejected), /Only proposed/);
});

test("proposal validation rejects deeply nested and sparse JSON", () => {
  let nested = { value: () => "execute" };
  for (let index = 0; index < 10; index += 1) nested = { nested };
  assert.throws(() => validateAgentProposal(proposal({ body: nested })), /nesting/);
  assert.throws(() => validateAgentProposal(proposal({ body: { entries: new Array(2) } })), /item/);
});

test("expired proposals remain reviewable but cannot be accepted", () => {
  const expired = proposal({ expiresAt: "2026-10-08T11:00:00.000Z" });
  assert.equal(acceptAgentProposal(expired, 4, "2026-10-08T12:00:00.000Z").status, "expired");
  assert.equal(acceptAgentProposal(expired, 4, stamp).status, "accepted");
});
