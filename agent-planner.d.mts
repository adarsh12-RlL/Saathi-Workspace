import type { MissionSnapshot } from "./cloud/index.mjs";

export type AgentRole = "planner" | "tutor" | "builder" | "reviewer" | "learner";
export type AgentOperation = "mission_patch" | "mini_app" | "feedback" | "workflow";
export type AgentStatus = "proposed" | "accepted" | "rejected" | "stale" | "expired";
export type AgentPermission = "read_mission" | "read_sources" | "propose_mission" | "propose_tool" | "propose_feedback";
export type MissionPatchBody = {
  nextStep?: string;
  tasks?: Array<{ id: string; title: string }>;
};
export type AgentProposal = {
  schema: "saathi.agent-proposal";
  version: 1;
  id: string;
  missionId: string;
  runId: string;
  role: AgentRole;
  operation: AgentOperation;
  status: AgentStatus;
  title: string;
  summary: string;
  baseRevision: number;
  evidence: string[];
  permissions: AgentPermission[];
  body: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  createdAt: string;
  expiresAt: string | null;
};
export type PlannerProposal = AgentProposal & { role: "planner"; operation: "mission_patch"; body: MissionPatchBody };
export type PreparedProposalApplication = { proposal: AgentProposal; mission: MissionSnapshot };

/** Creates a rules-based proposal; it does not call an AI provider or write data. */
export function createPlannerProposal(mission: MissionSnapshot, revision: number, options?: {
  newId?: () => string;
  at?: string;
}): PlannerProposal;

/** Pure preparation. The caller must mark accepted only after a successful CAS save. */
export function prepareProposalApplication(proposal: AgentProposal, mission: MissionSnapshot, currentRevision: number, options?: {
  at?: string;
}): PreparedProposalApplication;
