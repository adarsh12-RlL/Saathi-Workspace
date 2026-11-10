import type { LearningSignal, MissionSnapshot } from "./cloud/index.mjs";
export function createReviewSignal(mission: MissionSnapshot, options: {allowLearning: boolean; sensitiveSource?: boolean}): Promise<LearningSignal>;
