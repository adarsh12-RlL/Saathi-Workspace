import type { SaathiClient } from "./index.mjs";
import type { MemoryDecision } from "../memory-review.mjs";

export type MemoryDecisionRecord = {
  id: string;
  ownerId: string;
  signalId: string;
  candidateId: string;
  missionId: string;
  action: MemoryDecision["action"];
  payload: MemoryDecision;
  createdAt: string;
};
export type MemoryDecisionRepository = {
  ownerId: string;
  list(): Promise<MemoryDecisionRecord[]>;
  append(decision: MemoryDecision): Promise<MemoryDecisionRecord>;
  watch(onInvalidate: () => void, onStatus?: (status: string) => void): () => void;
};
export const MEMORY_DECISIONS_TABLE: "saathi_memory_decisions";
export function createMemoryDecisionRepository(client: SaathiClient, verifiedUserId: string): MemoryDecisionRepository;
