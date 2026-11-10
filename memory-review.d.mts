import type { LearningSignal } from "./cloud/index.mjs";

export type MemoryAction = "accept" | "edit" | "reject" | "forget";
export type MemoryDecision = {
  schema: "saathi.memory-decision";
  version: 1;
  id: string;
  signalId: string;
  candidateId: string;
  missionId: string;
  action: MemoryAction;
  statement: string | null;
  createdAt: string;
};
export type MemoryCandidate = {
  schema: "saathi.memory-proposal";
  version: 1;
  id: string;
  kind: "preference" | "fact" | "procedure" | "lesson" | "constraint" | "goal";
  key: string;
  statement: string;
  scope: "global" | "mission";
  missionId: string | null;
  confidence: number;
  evidence: string[];
  status: "pending" | "accepted" | "rejected" | "expired" | "forgotten";
  sensitive: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};
export type MemoryCandidateView = {
  id: string;
  kind: MemoryCandidate["kind"];
  scope: MemoryCandidate["scope"];
  statement: string;
  status: MemoryCandidate["status"];
  statusLabel: string;
  confidencePercent: number;
  source: { missionId: string | null; missionTitle: string };
  evidence: ReadonlyArray<{ id: string; label: string }>;
  evidenceCount: number;
  explanation: string;
  sensitive: boolean;
  canAccept: boolean;
  canEdit: boolean;
  canReject: boolean;
  canForget: boolean;
};
export type LedgerEntry = {
  signalId: string;
  missionId: string;
  candidate: MemoryCandidate;
  view: MemoryCandidateView;
};
export type LedgerProjection = { entries: LedgerEntry[]; warnings: string[] };
export const MEMORY_DECISION_SCHEMA: "saathi.memory-decision";
export function validateMemoryDecision(raw: unknown): MemoryDecision;
export function deriveStableCandidateId(signalId: string, index: number): Promise<string>;
export function projectLearningLedger(
  signals: ReadonlyArray<{ payload: LearningSignal; createdAt: string }>,
  decisions: ReadonlyArray<{ payload: MemoryDecision; createdAt: string }>,
): Promise<LedgerProjection>;
