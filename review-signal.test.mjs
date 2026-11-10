import test from "node:test";
import assert from "node:assert/strict";
import { createReviewSignal } from "./review-signal.mjs";
const at = "2026-10-09T01:00:00.000Z";
function mission(overrides = {}) {
  return { id: "11111111-1111-4111-8111-111111111111", title: "Study", goal: "Understand JavaScript",
    notes: "", nextStep: "", stage: "complete", tasks: [], decisions: [], artifacts: [], miniApps: [],
    templateSource: null, updatedAt: at,
    reflection: { outcome: "achieved", rating: 4, friction: [], lesson: "Use smaller examples.", repeat: "yes", personalMemory: null, reviewedAt: at },
    ...overrides };
}
test("publishing the same saved review gives one stable signal identity", async () => {
  const first = await createReviewSignal(mission(), { allowLearning: true });
  const again = await createReviewSignal(mission({ nextStep: "A later plan" }), { allowLearning: true });
  assert.equal(first.id, again.id);
  assert.equal(first.reflection, "Use smaller examples.");
  assert.equal(first.outcome, "success");
  assert.equal(first.allowLearning, true);
  const changed = await createReviewSignal(mission({ reflection: {...mission().reflection, lesson: "A different lesson"} }), {allowLearning:true});
  assert.notEqual(changed.id, first.id);
});
test("review signal preserves opt-out and sensitive exclusion without truncating", async () => {
  const excluded = await createReviewSignal(mission(), {allowLearning:false,sensitiveSource:true});
  assert.equal(excluded.allowLearning, false);
  assert.equal(excluded.sensitiveSource, true);
  await assert.rejects(createReviewSignal(mission(), {}), /consent/);
  await assert.rejects(createReviewSignal(mission({stage:"working"}), {allowLearning:true}), /save a mission review/);
  await assert.rejects(createReviewSignal(mission({reflection:{...mission().reflection,lesson:"x".repeat(1001)}}), {allowLearning:true}), /Shorten/);
});
