import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_PROPOSAL_SCHEMA,
  AGENT_RUN_SCHEMA,
  DEVICE_HANDOFF_SCHEMA,
  DOMAIN_VERSION,
  SYNC_OPERATION_SCHEMA,
  acceptAgentProposalRecord,
  validateAgentProposalRecord,
  validateAgentRun,
  validateDeviceHandoff,
  validateSkillVersion,
  validateSourceReference,
  validateSyncOperation,
} from "./domain-contracts.mjs";

const missionId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const proposalId = "33333333-3333-4333-8333-333333333333";
const deviceA = "44444444-4444-4444-8444-444444444444";
const deviceB = "55555555-5555-4555-8555-555555555555";
const createdAt = "2026-01-01T00:00:00Z";
const later = "2026-01-02T00:00:00Z";

function source() {
  return validateSourceReference({
    schema: "saathi.source-reference", version: DOMAIN_VERSION, kind: "mission", id: "mission-source",
    label: "Mission passport", locator: "mission/111", missionId, revision: 2, sensitive: false, createdAt,
  });
}

function proposal(overrides = {}) {
  return {
    schema: AGENT_PROPOSAL_SCHEMA, version: DOMAIN_VERSION, id: proposalId, missionId, runId,
    role: "planner", operation: "mission_patch", status: "proposed", title: "Plan next step",
    summary: "Turn the next step into a checklist.", baseRevision: 2, sourceRefs: [source()],
    permissions: ["read_mission", "propose_mission"], body: { tasks: [{ title: "Draft checklist" }] }, risk: "low",
    idempotencyKey: "proposal-1", createdAt, expiresAt: later, ...overrides,
  };
}

test("unified contracts validate proposals and mark revision conflicts stale", () => {
  const valid = validateAgentProposalRecord(proposal());
  assert.equal(valid.status, "proposed");
  assert.equal(validateAgentProposalRecord({ ...valid, status: "accepted" }).status, "accepted");
  assert.equal(validateAgentProposalRecord({ ...valid, status: "rejected" }).status, "rejected");
  const stale = acceptAgentProposalRecord(valid, 3, later);
  assert.equal(stale.status, "stale");
  assert.throws(() => validateAgentProposalRecord({ ...valid, status: "accepted", permissions: ["read_mission"] }), /mutation permission/);
});

test("agent runs, handoffs and sync operations remain inert JSON records", () => {
  const run = validateAgentRun({
    schema: AGENT_RUN_SCHEMA, version: DOMAIN_VERSION, id: runId, missionId, role: "builder", status: "queued",
    inputRefs: [source()], outputRefs: [], baseRevision: 2, provider: "local", model: "planner-v1",
    budget: { maxTokens: 1000, maxDurationMs: 5000, maxOutputBytes: 2048 }, permissions: ["read_mission", "propose_tool"],
    idempotencyKey: "run-1", createdAt, startedAt: null, finishedAt: null, error: null,
  });
  assert.equal(run.status, "queued");
  const handoff = validateDeviceHandoff({
    schema: DEVICE_HANDOFF_SCHEMA, version: DOMAIN_VERSION, id: "66666666-6666-4666-8666-666666666666", missionId, runId: null,
    sourceDeviceId: deviceA, targetDeviceId: deviceB, scope: "mission", capabilities: ["read", "review"], status: "offered",
    baseRevision: 2, tokenRef: "handoff-1", createdAt, expiresAt: later, acceptedAt: null, completedAt: null,
  });
  assert.equal(handoff.status, "offered");
  const sync = validateSyncOperation({
    schema: SYNC_OPERATION_SCHEMA, version: DOMAIN_VERSION, id: "77777777-7777-4777-8777-777777777777", deviceId: deviceA,
    entityType: "agent_proposal", entityId: proposalId, action: "append", status: "queued", idempotencyKey: "sync-1",
    baseRevision: 2, attempts: 0, dependsOn: [], payload: { proposalId }, error: null, createdAt, updatedAt: createdAt,
  });
  assert.equal(sync.payload.proposalId, proposalId);
  assert.throws(() => validateDeviceHandoff({ ...handoff, targetDeviceId: deviceA }), /two different devices/);
  assert.throws(() => validateSyncOperation({ ...sync, action: "complete", payload: null }), /payload/);
});

test("skill versions enforce validation and source revision provenance", () => {
  const skill = validateSkillVersion({
    schema: "saathi.skill-version", version: DOMAIN_VERSION, id: "88888888-8888-4888-8888-888888888888", skillId: "daily-plan",
    skillVersion: 1, kind: "workflow", title: "Daily plan", summary: "A reviewed planning workflow", status: "approved",
    sourceMissionId: missionId, sourceRevision: 2, sourceRefs: [source()],
    definition: { schema: "saathi.workflow", version: DOMAIN_VERSION, steps: [{ id: "plan", title: "Plan", kind: "checklist", role: "planner", requiresApproval: true }] },
    validation: { status: "passed", checkedAt: later, errors: [] }, metrics: { uses: 1, successfulUses: 1 }, supersedes: null,
    createdAt, updatedAt: later,
  });
  assert.equal(skill.status, "approved");
  assert.throws(() => validateSkillVersion({ ...skill, validation: { status: "failed", checkedAt: later, errors: ["unsafe"] } }), /passed validation/);
});
