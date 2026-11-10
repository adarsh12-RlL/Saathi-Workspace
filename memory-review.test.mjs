import test from "node:test";
import assert from "node:assert/strict";
import { deriveStableCandidateId, projectLearningLedger, validateMemoryDecision } from "./memory-review.mjs";
import { rankAcceptedMemories } from "./learning-loop.mjs";

const SIGNAL = "11111111-1111-4111-8111-111111111111";
const MISSION = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "33333333-3333-4333-8333-333333333333";
const stamp = "2026-10-09T10:00:00.000Z";
const later = "2026-10-09T10:01:00.000Z";

function signal(overrides = {}) {
  return {
    schema: "saathi.learning-signal", version: 1, id: SIGNAL, missionId: MISSION, createdAt: stamp,
    outcome: "success", rating: 5, reflection: "", corrections: [], preferences: ["Use short checklists."], tags: [],
    reusable: true, allowLearning: true, sensitiveSource: false, ...overrides,
  };
}
function source(payload = signal(), createdAt = stamp) { return { payload, createdAt }; }
async function decision(action, overrides = {}, createdAt = later) {
  const candidateId = await deriveStableCandidateId(SIGNAL, 0);
  return { payload: {
    schema: "saathi.memory-decision", version: 1, id: "44444444-4444-4444-8444-444444444444", signalId: SIGNAL,
    candidateId, missionId: MISSION, action, statement: action === "edit" ? "Use one checklist each morning." : null,
    createdAt: stamp, ...overrides,
  }, createdAt };
}

test("memory decisions require a strict identity, action, timestamp and edit-only statement", async () => {
  const valid = (await decision("edit")).payload;
  assert.equal(validateMemoryDecision({ ...valid, statement: "  Keep it short.  " }).statement, "Keep it short.");
  for (const invalid of [
    { ...valid, action: "execute" }, { ...valid, statement: " " }, { ...valid, statement: "x".repeat(1001) },
    { ...valid, action: "accept", statement: "Keep it short." }, { ...valid, version: "1" },
    { ...valid, missionId: "foreign" }, { ...valid, createdAt: "2026-02-30T10:00:00Z" },
    { ...valid, createdAt: "2026-10-09" }, { ...valid, executable: "run" },
  ]) assert.throws(() => validateMemoryDecision(invalid));
  let getterCalls = 0;
  const hostile = { ...valid };
  Object.defineProperty(hostile, "statement", { enumerable: true, get() { getterCalls++; return "Secret"; } });
  assert.throws(() => validateMemoryDecision(hostile), /property|statement/);
  assert.equal(getterCalls, 0);
  assert.throws(() => validateMemoryDecision(Object.assign(Object.create({ inherited: true }), valid)));
});

test("candidate identities and projections remain identical across device downloads", async () => {
  const payload = signal({ preferences: ["Use short checklists.", "Show a compact view."], corrections: ["Confirm the due date."], reflection: "Review at the end." });
  const first = await projectLearningLedger([source(payload)], []);
  const second = await projectLearningLedger([source(structuredClone(payload))], []);
  assert.deepEqual(first, second);
  assert.equal(first.entries.length, 4);
  assert.equal(new Set(first.entries.map(entry => entry.candidate.id)).size, 4);
  assert.equal(first.entries[0].candidate.id, await deriveStableCandidateId(SIGNAL.toUpperCase(), 0));
  assert.match(first.entries[0].candidate.id, /^[0-9a-f-]{14}8[0-9a-f]{3}-[89ab]/);
  assert.equal(first.entries[0].candidate.createdAt, stamp);
  assert.equal(first.entries[0].view.canAccept, true);
  await assert.rejects(deriveStableCandidateId(SIGNAL, -1));
  await assert.rejects(deriveStableCandidateId(SIGNAL, 21));
});

test("first valid server-ordered resolution wins over conflicting device clocks", async () => {
  const accept = await decision("accept", { createdAt: "2026-10-09T13:00:00Z" }, "2026-10-09T10:01:00Z");
  const reject = await decision("reject", { id: FOREIGN, createdAt: "2020-01-01T00:00:00Z" }, "2026-10-09T10:02:00Z");
  const left = await projectLearningLedger([source()], [reject, accept]);
  const right = await projectLearningLedger([source()], [accept, reject]);
  assert.deepEqual(left, right);
  assert.equal(left.entries[0].candidate.status, "accepted");
  assert.equal(left.entries[0].view.canAccept, false);
  assert.equal(left.entries[0].view.canForget, true);
  assert.equal(left.warnings.length, 1);
});

test("server microseconds and equal-time IDs choose deterministic winners", async () => {
  const reject = await decision("reject", { id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }, "2026-10-09T10:01:00.123001Z");
  const accept = await decision("accept", {}, "2026-10-09T10:01:00.123002Z");
  assert.equal((await projectLearningLedger([source()], [accept, reject])).entries[0].candidate.status, "rejected");
  const tie = { ...reject, createdAt: accept.createdAt };
  assert.equal((await projectLearningLedger([source()], [tie, accept])).entries[0].candidate.status, "accepted");
});

test("edits require review and acceptance activates only the reviewed statement", async () => {
  const edit = await decision("edit");
  const pending = await projectLearningLedger([source()], [edit]);
  assert.equal(pending.entries[0].candidate.status, "pending");
  assert.equal(pending.entries[0].view.canAccept, true);
  assert.deepEqual(rankAcceptedMemories("morning checklist", pending.entries.map(entry => entry.candidate)), []);
  const accept = await decision("accept", { id: FOREIGN }, "2026-10-09T10:02:00Z");
  const accepted = await projectLearningLedger([source()], [accept, edit]);
  assert.equal(accepted.entries[0].candidate.statement, edit.payload.statement);
  assert.equal(accepted.entries[0].candidate.status, "accepted");
  assert.equal(rankAcceptedMemories("morning checklist", accepted.entries.map(entry => entry.candidate)).length, 1);
});

test("forget permanently redacts candidate content and prevents later resurrection", async () => {
  const accept = await decision("accept");
  const forget = await decision("forget", { id: FOREIGN }, "2026-10-09T10:02:00Z");
  const edit = await decision("edit", { id: "55555555-5555-4555-8555-555555555555", statement: "Resurrect secret" }, "2026-10-09T10:03:00Z");
  const reactivate = await decision("accept", { id: "66666666-6666-4666-8666-666666666666" }, "2026-10-09T10:04:00Z");
  const result = await projectLearningLedger([source()], [reactivate, forget, edit, accept]);
  const entry = result.entries[0];
  assert.equal(entry.candidate.status, "forgotten");
  assert.equal(entry.candidate.statement, "");
  assert.deepEqual(entry.candidate.evidence, []);
  assert.equal(entry.candidate.confidence, 0);
  assert.equal(entry.view.canForget, false);
  assert.equal(entry.view.canAccept, false);
  assert.equal(JSON.stringify(result).includes("short-checklists"), false);
  assert.equal(JSON.stringify(result).includes("Use short checklists"), false);
  assert.equal(JSON.stringify(result).includes("Resurrect secret"), false);
  assert.equal(result.warnings.length, 2);
  assert.deepEqual(rankAcceptedMemories("checklist", [entry.candidate]), []);
});

test("nonconsenting or sensitive signals never derive actionable memories", async () => {
  const action = await decision("accept");
  for (const payload of [signal({ allowLearning: false }), signal({ sensitiveSource: true })]) {
    const result = await projectLearningLedger([source(payload)], [action]);
    assert.equal(result.entries.length, 0);
    assert.equal(result.warnings.length, 1);
  }
});

test("foreign source identities and decisions preceding a source cannot mutate it", async () => {
  const mismatches = [
    await decision("accept", { missionId: FOREIGN }),
    await decision("accept", { signalId: FOREIGN }),
    await decision("accept", { candidateId: FOREIGN }),
    await decision("accept", {}, "2026-10-09T09:00:00Z"),
  ];
  for (const action of mismatches) {
    const result = await projectLearningLedger([source()], [action]);
    assert.equal(result.entries[0].candidate.status, "pending");
    assert.equal(result.warnings.length, 1);
  }
});

test("duplicate downloads are idempotent but conflicting identities are quarantined", async () => {
  const accept = await decision("accept");
  const duplicate = await projectLearningLedger([source(), source()], [accept, structuredClone(accept)]);
  assert.equal(duplicate.entries.length, 1);
  assert.equal(duplicate.entries[0].candidate.status, "accepted");
  assert.deepEqual(duplicate.warnings, []);
  const conflict = await projectLearningLedger([source(), source(signal({ preferences: ["Foreign statement"] }))], [accept]);
  assert.equal(conflict.entries.length, 0);
  assert.equal(conflict.warnings.length, 2);
  const differentAction = { ...accept, payload: { ...accept.payload, action: "reject" } };
  const decisions = await projectLearningLedger([source()], [accept, differentAction]);
  assert.equal(decisions.entries[0].candidate.status, "pending");
  assert.equal(decisions.warnings.length, 1);
});

test("hostile records do not run accessors or leak their untrusted statements", async () => {
  let read = false;
  const hostile = { createdAt: stamp };
  Object.defineProperty(hostile, "payload", { enumerable: true, get() { read = true; throw new Error("secret"); } });
  const result = await projectLearningLedger([hostile, source()], [{ payload: { statement: "PRIVATE" }, createdAt: stamp }]);
  assert.equal(read, false);
  assert.equal(result.entries.length, 1);
  assert.equal(result.warnings.length, 2);
  assert.equal(JSON.stringify(result.warnings).includes("PRIVATE"), false);
  await assert.rejects(projectLearningLedger(null, []), /ledger/);
});

test("a valid legacy signal with an oversized reflection cannot break other sources", async () => {
  const legacy = signal({ id: FOREIGN, reflection: "x".repeat(1500) });
  const result = await projectLearningLedger([source(legacy), source()], []);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].signalId, SIGNAL);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].includes("compatible"), true);
  assert.equal(JSON.stringify(result.warnings).includes("x".repeat(50)), false);
});
