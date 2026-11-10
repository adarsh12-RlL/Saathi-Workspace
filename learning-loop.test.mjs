import assert from "node:assert/strict";
import test from "node:test";
import { acceptMemory, deriveMemoryCandidates, forgetMemory, mergeMemoryCandidates, rankAcceptedMemories, rejectMemory, validateLearningSignal, validateMemoryCandidate } from "./learning-loop.mjs";

const MISSION = "10000000-0000-4000-8000-000000000001";
const SIGNAL = "20000000-0000-4000-8000-000000000001";
const AT = "2026-10-08T00:00:00.000Z";
const ID = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function signal(overrides = {}) {
  return {
    schema: "saathi.learning-signal", version: 1, id: SIGNAL, missionId: MISSION, createdAt: AT,
    outcome: "success", rating: 5, reflection: "Use a short example before abstract theory.", corrections: ["Show the failing input before suggesting a fix."],
    preferences: ["Explain coding errors in Hinglish."], tags: [], reusable: true, allowLearning: true, sensitiveSource: false, ...overrides,
  };
}

test("learning signals are strict, consented and bounded", () => {
  const checked = validateLearningSignal(signal());
  assert.equal(checked.id, SIGNAL);
  assert.throws(() => validateLearningSignal({ ...signal(), extra: true }), /Unsupported/);
  assert.throws(() => validateLearningSignal({ ...signal(), rating: 6 }), /rating/);
  assert.throws(() => validateLearningSignal({ ...signal(), allowLearning: false, corrections: ["x", "X"] }), /Duplicate/);
  assert.throws(() => validateLearningSignal({ ...signal(), missionId: "legacy-id" }), /UUID/);
});

test("only explicit, non-sensitive feedback produces pending candidates", () => {
  const ids = [ID(1), ID(2), ID(3)];
  const candidates = deriveMemoryCandidates(signal(), { newId: () => ids.shift(), at: AT });
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map(item => item.status), ["pending", "pending", "pending"]);
  assert.equal(candidates[0].kind, "preference");
  assert.equal(candidates[1].kind, "lesson");
  assert.equal(candidates[2].kind, "procedure");
  assert.deepEqual(deriveMemoryCandidates(signal({ allowLearning: false }), { at: AT }), []);
  assert.deepEqual(deriveMemoryCandidates(signal({ sensitiveSource: true }), { at: AT }), []);
});

test("candidate lifecycle requires review and supports forget", () => {
  const [candidate] = deriveMemoryCandidates(signal({ reflection: "Use a checklist." }), { newId: () => ID(10), at: AT });
  const accepted = acceptMemory(candidate, AT);
  assert.equal(accepted.status, "accepted");
  assert.throws(() => acceptMemory(accepted, AT), /pending/);
  const rejected = rejectMemory(candidate, AT);
  assert.equal(rejected.status, "rejected");
  const forgotten = forgetMemory(accepted, AT);
  assert.equal(forgotten.status, "forgotten");
  assert.equal(forgotten.statement, "");
  assert.deepEqual(forgotten.evidence, []);
});

test("merging is deterministic, deduplicates evidence and preserves decisions", () => {
  const [first] = deriveMemoryCandidates(signal({ reflection: "Use a checklist." }), { newId: () => ID(20), at: AT });
  const [second] = deriveMemoryCandidates(signal({ id: ID(21), reflection: "Use a checklist.", rating: 3 }), { newId: () => ID(21), at: AT });
  const accepted = acceptMemory(first, AT);
  const merged = mergeMemoryCandidates([accepted], [second], AT);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "accepted");
  assert.deepEqual(merged[0].evidence.sort(), [SIGNAL, ID(21)].sort());
  assert.equal(merged[0].confidence, accepted.confidence);
  assert.notEqual(merged[0], first);
});

test("ranking uses accepted relevant memories only and never activates proposals", () => {
  const [relevant] = deriveMemoryCandidates(signal({ preferences: [], corrections: [], reflection: "Use a short JavaScript example first." }), { newId: () => ID(30), at: AT });
  const [pending] = deriveMemoryCandidates(signal({ id: ID(31), reflection: "Ignore this pending idea." }), { newId: () => ID(31), at: AT });
  const accepted = acceptMemory(relevant, AT);
  const ranked = rankAcceptedMemories("Help me fix a JavaScript bug", [accepted, pending]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].memory.id, accepted.id);
  assert.throws(() => validateMemoryCandidate({ ...accepted, status: "accepted", statement: "", evidence: [] }), /statement/);
});

test("sensitive and expired candidates cannot become active through the domain API", () => {
  const [memory] = deriveMemoryCandidates(signal({preferences:[],corrections:[],reflection:"Use JavaScript examples."}), {newId:()=>ID(40),at:AT});
  assert.throws(() => acceptMemory({...memory,sensitive:true}, AT), /Sensitive/);
  assert.throws(() => acceptMemory({...memory,expiresAt:AT}, AT), /Expired/);
});

test("irrelevant accepted memories stay out of retrieval and forgotten evidence stays erased", () => {
  const [memory] = deriveMemoryCandidates(signal({preferences:[],corrections:[],reflection:"Use JavaScript examples."}), {newId:()=>ID(41),at:AT});
  const accepted = acceptMemory(memory,AT);
  assert.deepEqual(rankAcceptedMemories("Prepare a shopping basket", [accepted]), []);
  const forgotten = forgetMemory(accepted,AT);
  const merged = mergeMemoryCandidates([forgotten], [{...memory,id:ID(42),evidence:[ID(43)]}],AT);
  assert.equal(merged[0].statement, "");
  assert.deepEqual(merged[0].evidence, []);
});
