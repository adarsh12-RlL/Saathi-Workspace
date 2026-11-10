import assert from "node:assert/strict";
import test from "node:test";
import { projectMemoryCandidate } from "./memory-candidate-ui.mjs";

const MISSION = "11111111-1111-4111-8111-111111111111";
const MEMORY = "22222222-2222-4222-8222-222222222222";
const EVENT = "33333333-3333-4333-8333-333333333333";
const stamp = "2026-10-08T10:00:00.000Z";

function memory(overrides = {}) {
  return {
    schema: "saathi.memory-proposal", version: 1, id: MEMORY, kind: "preference",
    key: "preference.short-checklists", statement: "Use short checklists.", scope: "global",
    missionId: null, confidence: 0.8, evidence: [EVENT], status: "pending", sensitive: false,
    createdAt: stamp, updatedAt: stamp, expiresAt: null, ...overrides,
  };
}

test("memory projection exposes source evidence and review actions", () => {
  const card = projectMemoryCandidate(memory(), {
    missionTitle: "Plan a product launch",
    evidenceLabels: { [EVENT]: "Mission review · 8 Oct 2026" },
  });
  assert.equal(card.statusLabel, "Needs your review");
  assert.equal(card.confidencePercent, 80);
  assert.equal(card.source.missionTitle, "Plan a product launch");
  assert.deepEqual(card.evidence, [{ id: EVENT, label: "Mission review · 8 Oct 2026" }]);
  assert.equal(card.explanation, "Derived from 1 verified evidence item.");
  assert.equal(card.canAccept, true);
  assert.equal(card.canEdit, true);
  assert.equal(card.canReject, true);
  assert.equal(card.canForget, true);
  assert.throws(() => { card.status = "accepted"; }, TypeError);
});

test("sensitive and resolved memories cannot be shown as actionable", () => {
  const sensitive = projectMemoryCandidate(memory({ sensitive: true }));
  assert.equal(sensitive.canAccept, false);
  assert.equal(sensitive.canEdit, false);
  assert.equal(sensitive.explanation, "Sensitive source material is excluded from personal memory.");
  const forgotten = projectMemoryCandidate(memory({ status: "forgotten", statement: "" }));
  assert.equal(forgotten.canAccept, false);
  assert.equal(forgotten.canReject, false);
  assert.equal(forgotten.canForget, false);
});

test("projection rejects untrusted source labels instead of widening the UI contract", () => {
  assert.throws(() => projectMemoryCandidate(memory(), { missionTitle: "" }), /source title/);
  assert.throws(() => projectMemoryCandidate(memory(), { evidenceLabels: [] }), /evidence labels/);
  assert.throws(() => projectMemoryCandidate(memory(), { evidenceLabels: { [EVENT]: 42 } }), /evidence label/);
});

