import { validateMissionSnapshot } from "./cloud/contracts.mjs";
import { validateLearningSignal } from "./learning-loop.mjs";

// Publishing a review is explicit. The saved review, rather than a mutable
// draft or a new random ID per click, identifies an immutable learning signal.
export async function createReviewSignal(rawMission, { allowLearning, sensitiveSource = false } = {}) {
  const mission = validateMissionSnapshot(rawMission, { requireUuid: true });
  if (mission.stage !== "complete" || !mission.reflection) throw new Error("Complete and save a mission review first.");
  if (typeof allowLearning !== "boolean" || typeof sensitiveSource !== "boolean") throw new Error("Explicit learning consent is required.");
  const review = mission.reflection;
  const statement = (review.personalMemory ?? review.lesson).trim();
  if (!statement) throw new Error("Write and save a lesson before publishing it.");
  if (statement.length > 1000) throw new Error("Shorten the memory statement to 1,000 characters before publishing.");
  if (!globalThis.crypto?.subtle) throw new Error("Use localhost or HTTPS to publish a reviewed lesson.");
  const identity = JSON.stringify(["saathi.review-signal.v1", mission.id, review]);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity))).slice(0, 16);
  digest[6] = (digest[6] & 15) | 128;
  digest[8] = (digest[8] & 63) | 128;
  const hex = [...digest].map(value => value.toString(16).padStart(2, "0")).join("");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return validateLearningSignal({
    schema: "saathi.learning-signal", version: 1, id, missionId: mission.id, createdAt: review.reviewedAt,
    outcome: review.outcome === "achieved" ? "success" : review.outcome, rating: review.rating,
    reflection: statement, corrections: [], preferences: [], tags: [],
    reusable: review.personalMemory !== null || review.repeat === "yes", allowLearning, sensitiveSource,
  });
}
