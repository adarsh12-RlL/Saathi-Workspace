"use client";

import type { ReactNode } from "react";

/**
 * Shared review-first surfaces for SAATHI.
 *
 * These components are intentionally controller-agnostic. They render the
 * state supplied by a parent and emit typed intent callbacks. They do not
 * create cloud clients, approve proposals, or mutate mission data themselves.
 */

type SurfaceTone = "cyan" | "green" | "amber" | "rose" | "slate";

const toneClasses: Record<SurfaceTone, string> = {
  cyan: "border-cyan-200/20 bg-cyan-100/[0.06] text-cyan-100",
  green: "border-emerald-200/20 bg-emerald-100/[0.06] text-emerald-100",
  amber: "border-amber-200/20 bg-amber-100/[0.06] text-amber-100",
  rose: "border-rose-200/20 bg-rose-100/[0.06] text-rose-100",
  slate: "border-white/10 bg-white/[0.04] text-slate-200",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "No date available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function SurfaceHeader({
  eyebrow,
  title,
  description,
  count,
}: {
  eyebrow: string;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      {count !== undefined && (
        <span className="w-fit rounded-full border border-white/10 bg-black/10 px-3 py-1 text-xs text-slate-300">
          {count}
        </span>
      )}
    </header>
  );
}

function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: SurfaceTone }) {
  return (
    <span className={"inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium " + toneClasses[tone]}>
      {children}
    </span>
  );
}

function EmptySurface({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-sm leading-6 text-slate-400">
      {children}
    </p>
  );
}

function EvidenceList({ evidence }: { evidence: readonly string[] }) {
  return (
    <ul className="mt-3 space-y-2" aria-label="Evidence references">
      {evidence.map((item) => (
        <li key={item} className="flex gap-2 text-xs leading-5 text-slate-400">
          <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-cyan-300" />
          <span className="break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Button({
  children,
  onClick,
  variant = "secondary",
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  ariaLabel?: string;
}) {
  const className = variant === "primary" ? "primary-button" : variant === "danger" ? "danger-button" : "secondary-button";
  return (
    <button className={className + " text-xs"} type="button" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Agent Room
// ---------------------------------------------------------------------------

export type AgentRole = "planner" | "tutor" | "builder" | "reviewer" | "learner";
export type AgentOperation = "mission_patch" | "mini_app" | "feedback" | "workflow";
export type AgentProposalStatus = "proposed" | "accepted" | "rejected" | "stale" | "expired";
export type AgentProposalRisk = "low" | "medium" | "high";

export type AgentProposalCardData = {
  id: string;
  role: AgentRole;
  operation: AgentOperation;
  status: AgentProposalStatus;
  title: string;
  summary: string;
  baseRevision: number;
  evidence: readonly string[];
  permissions: readonly string[];
  risk: AgentProposalRisk;
  createdAt: string;
  expiresAt: string | null;
};

export type AgentProposalAction = "review" | "accept" | "reject";

export type AgentRoomProps = {
  proposals: readonly AgentProposalCardData[];
  onAction?: (proposal: AgentProposalCardData, action: AgentProposalAction) => void;
};

const roleLabels: Record<AgentRole, string> = {
  planner: "Planner",
  tutor: "Tutor",
  builder: "Builder",
  reviewer: "Reviewer",
  learner: "Learner",
};

const operationLabels: Record<AgentOperation, string> = {
  mission_patch: "Mission suggestion",
  mini_app: "Tool suggestion",
  feedback: "Feedback suggestion",
  workflow: "Workflow suggestion",
};

const proposalStatusLabels: Record<AgentProposalStatus, string> = {
  proposed: "Needs review",
  accepted: "Accepted",
  rejected: "Rejected",
  stale: "Stale",
  expired: "Expired",
};

function proposalTone(status: AgentProposalStatus): SurfaceTone {
  if (status === "proposed") return "cyan";
  if (status === "accepted") return "green";
  if (status === "stale" || status === "expired") return "amber";
  return "rose";
}

export function AgentRoom({ proposals, onAction }: AgentRoomProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 sm:p-6" aria-labelledby="agent-room-title">
      <SurfaceHeader
        eyebrow="Agent Room · review first"
        title="Suggestions with a clear boundary"
        description="Planner, tutor, builder, reviewer and learner agents can suggest work. A proposal never changes your mission until you explicitly approve it."
        count={proposals.length}
      />
      <p className="mt-5 rounded-2xl border border-cyan-200/15 bg-cyan-100/[0.05] px-4 py-3 text-xs leading-5 text-cyan-100">
        Proposal only · review the evidence and base revision before any controller applies a change.
      </p>
      <div id="agent-room-title" className="mt-5 grid gap-4 xl:grid-cols-2">
        {proposals.length === 0 ? (
          <EmptySurface>No agent proposals are waiting. Suggestions will appear here after a typed agent run.</EmptySurface>
        ) : (
          proposals.map((proposal) => (
            <article key={proposal.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="cyan">{roleLabels[proposal.role]}</Badge>
                <Badge>{operationLabels[proposal.operation]}</Badge>
                <Badge tone={proposalTone(proposal.status)}>{proposalStatusLabels[proposal.status]}</Badge>
                <Badge tone={proposal.risk === "high" ? "rose" : proposal.risk === "medium" ? "amber" : "green"}>
                  {proposal.risk} risk
                </Badge>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-100">{proposal.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{proposal.summary}</p>
              <dl className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Mission revision</dt>
                  <dd className="mt-1 text-slate-200">Base revision {proposal.baseRevision}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Created</dt>
                  <dd className="mt-1 text-slate-200">{formatDate(proposal.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Expires</dt>
                  <dd className="mt-1 text-slate-200">{formatDate(proposal.expiresAt)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Permissions</dt>
                  <dd className="mt-1 break-words text-slate-200">{proposal.permissions.join(", ") || "Read only"}</dd>
                </div>
              </dl>
              <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-cyan-200">Show proposal evidence</summary>
                <EvidenceList evidence={proposal.evidence} />
              </details>
              {proposal.status === "stale" && (
                <p className="mt-4 text-xs leading-5 text-amber-200">
                  This proposal was created for an older mission revision. Refresh it before considering approval.
                </p>
              )}
              {onAction && proposal.status === "proposed" && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button onClick={() => onAction(proposal, "review")} variant="primary">
                    Review proposal
                  </Button>
                  <Button onClick={() => onAction(proposal, "accept")} ariaLabel={"Accept proposal: " + proposal.title}>
                    Accept after review
                  </Button>
                  <Button onClick={() => onAction(proposal, "reject")} variant="danger" ariaLabel={"Reject proposal: " + proposal.title}>
                    Reject
                  </Button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Learning Ledger
// ---------------------------------------------------------------------------

export type MemoryCandidateKind = "preference" | "fact" | "procedure" | "lesson" | "constraint" | "goal";
export type MemoryCandidateStatus = "pending" | "accepted" | "rejected" | "expired" | "forgotten";
export type MemoryCandidateAction = "accept" | "edit" | "reject" | "forget";

export type LearningCandidateCardData = {
  id: string;
  kind: MemoryCandidateKind;
  scope: "global" | "mission";
  statement: string;
  status: MemoryCandidateStatus;
  statusLabel: string;
  confidencePercent: number;
  source: { missionId: string | null; missionTitle: string };
  evidence: readonly { id: string; label: string }[];
  evidenceCount: number;
  explanation: string;
  sensitive: boolean;
  canAccept: boolean;
  canEdit: boolean;
  canReject: boolean;
  canForget: boolean;
};

export type LearningLedgerProps = {
  candidates: readonly LearningCandidateCardData[];
  onAction?: (candidate: LearningCandidateCardData, action: MemoryCandidateAction) => void;
};

function memoryTone(status: MemoryCandidateStatus, sensitive: boolean): SurfaceTone {
  if (sensitive) return "rose";
  if (status === "pending") return "amber";
  if (status === "accepted") return "green";
  if (status === "forgotten" || status === "rejected") return "slate";
  return "cyan";
}

export function LearningLedger({ candidates, onAction }: LearningLedgerProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 sm:p-6" aria-labelledby="learning-ledger-title">
      <SurfaceHeader
        eyebrow="Learning Ledger · owner controlled"
        title="Verified lessons with evidence"
        description="SAATHI derives bounded candidates from your reviewed outcomes. Only approved, relevant and non-sensitive memories can influence a later suggestion."
        count={candidates.length}
      />
      <p className="mt-5 rounded-2xl border border-amber-200/15 bg-amber-100/[0.05] px-4 py-3 text-xs leading-5 text-amber-100">
        Pending review · nothing shown here is active personal memory until you approve it.
      </p>
      <div id="learning-ledger-title" className="mt-5 grid gap-4 xl:grid-cols-2">
        {candidates.length === 0 ? (
          <EmptySurface>Complete a mission review to create the first evidence-backed learning candidate.</EmptySurface>
        ) : (
          candidates.map((candidate) => (
            <article key={candidate.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{candidate.kind}</Badge>
                <Badge>{candidate.scope === "global" ? "Across missions" : "This mission"}</Badge>
                <Badge tone={memoryTone(candidate.status, candidate.sensitive)}>
                  {candidate.sensitive ? "Sensitive · excluded" : candidate.statusLabel}
                </Badge>
              </div>
              <blockquote className="mt-4 border-l-2 border-cyan-300/50 pl-4 text-sm leading-6 text-slate-200">
                {candidate.statement}
              </blockquote>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>Confidence {Math.max(0, Math.min(100, Math.round(candidate.confidencePercent)))}%</span>
                <span aria-hidden="true">·</span>
                <span>{candidate.evidenceCount} evidence {candidate.evidenceCount === 1 ? "item" : "items"}</span>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs leading-5 text-slate-400">
                <p className="font-medium text-slate-300">Why this appeared</p>
                <p className="mt-1">{candidate.explanation}</p>
                <p className="mt-2 text-slate-500">Source mission: <span className="text-slate-300">{candidate.source.missionTitle}</span></p>
              </div>
              <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-cyan-200">Show immutable evidence</summary>
                <ul className="mt-3 space-y-2" aria-label="Learning evidence">
                  {candidate.evidence.length === 0 ? (
                    <li className="text-xs text-slate-500">No evidence labels available.</li>
                  ) : (
                    candidate.evidence.map((item) => (
                      <li key={item.id} className="text-xs leading-5 text-slate-400">
                        <span className="font-mono text-slate-500">{item.id}</span> · {item.label}
                      </li>
                    ))
                  )}
                </ul>
              </details>
              {candidate.sensitive && (
                <p className="mt-4 text-xs leading-5 text-rose-200">
                  This candidate is excluded from retrieval because its source was marked sensitive.
                </p>
              )}
              {onAction && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {candidate.canAccept && <Button onClick={() => onAction(candidate, "accept")} variant="primary">Accept memory</Button>}
                  {candidate.canEdit && <Button onClick={() => onAction(candidate, "edit")}>Edit candidate</Button>}
                  {candidate.canReject && <Button onClick={() => onAction(candidate, "reject")} variant="danger">Reject</Button>}
                  {candidate.canForget && <Button onClick={() => onAction(candidate, "forget")} variant="danger">Forget</Button>}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tool Studio
// ---------------------------------------------------------------------------

export type MiniAppKind = "tracker" | "quiz" | "invoice";
export type MiniAppToolStatus = "draft" | "validated" | "installed" | "archived";
export type MiniAppToolAction = "preview" | "open" | "addToMission";

export type MiniAppToolCardData = {
  id: string;
  title: string;
  kind: MiniAppKind;
  description: string;
  schemaVersion: number;
  status: MiniAppToolStatus;
  sourceMissionTitle?: string;
  updatedAt?: string;
  installedMissionCount?: number;
};

export type ToolStudioProps = {
  tools: readonly MiniAppToolCardData[];
  onAction?: (tool: MiniAppToolCardData, action: MiniAppToolAction) => void;
};

const miniAppLabels: Record<MiniAppKind, string> = {
  tracker: "Tracker",
  quiz: "Quiz",
  invoice: "Invoice",
};

const toolStatusLabels: Record<MiniAppToolStatus, string> = {
  draft: "Draft",
  validated: "Validated",
  installed: "Installed",
  archived: "Archived",
};

export function ToolStudio({ tools, onAction }: ToolStudioProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 sm:p-6" aria-labelledby="tool-studio-title">
      <SurfaceHeader
        eyebrow="Tool Studio · constrained by schema"
        title="Reusable mini-apps for your missions"
        description="Trackers, quizzes and invoice calculators are rendered from validated JSON definitions. They stay reviewable and portable across devices."
        count={tools.length}
      />
      <p className="mt-5 rounded-2xl border border-emerald-200/15 bg-emerald-100/[0.05] px-4 py-3 text-xs leading-5 text-emerald-100">
        Schema-driven preview · this surface does not execute arbitrary generated code.
      </p>
      <div id="tool-studio-title" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tools.length === 0 ? (
          <EmptySurface>Approved workflow tools will appear here after a validated mini-app definition is available.</EmptySurface>
        ) : (
          tools.map((tool) => (
            <article key={tool.id} className="flex h-full flex-col rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="cyan">{miniAppLabels[tool.kind]}</Badge>
                <Badge tone={tool.status === "installed" ? "green" : tool.status === "archived" ? "slate" : "amber"}>
                  {toolStatusLabels[tool.status]}
                </Badge>
                <Badge>Schema v{tool.schemaVersion}</Badge>
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-100">{tool.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{tool.description}</p>
              <dl className="mt-4 space-y-2 text-xs text-slate-400">
                {tool.sourceMissionTitle && <div className="flex justify-between gap-3"><dt>Source mission</dt><dd className="text-right text-slate-200">{tool.sourceMissionTitle}</dd></div>}
                {tool.updatedAt && <div className="flex justify-between gap-3"><dt>Updated</dt><dd className="text-right text-slate-200">{formatDate(tool.updatedAt)}</dd></div>}
                {tool.installedMissionCount !== undefined && <div className="flex justify-between gap-3"><dt>Used in missions</dt><dd className="text-right text-slate-200">{tool.installedMissionCount}</dd></div>}
              </dl>
              {onAction && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button onClick={() => onAction(tool, "preview")} variant="primary">Preview</Button>
                  <Button onClick={() => onAction(tool, "open")}>Open definition</Button>
                  {tool.status !== "archived" && <Button onClick={() => onAction(tool, "addToMission")}>Add to mission</Button>}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Handoff Center
// ---------------------------------------------------------------------------

export type DevicePlatform = "phone" | "tablet" | "laptop" | "desktop" | "other";
export type DevicePresence = "online" | "offline" | "syncing" | "conflict" | "unknown";
export type HandoffAction = "inspect";

export type DeviceStatusCardData = {
  id: string;
  name: string;
  platform: DevicePlatform;
  presence: DevicePresence;
  lastSeenAt: string | null;
  isCurrent?: boolean;
  capabilities?: readonly string[];
  queuedChanges?: number;
};

export type HandoffContext = {
  missionTitle: string | null;
  nextStep: string | null;
  syncStatus: "synced" | "syncing" | "offline" | "conflict" | "unknown";
  lastSyncedAt: string | null;
  message?: string;
};

export type HandoffCenterProps = {
  devices: readonly DeviceStatusCardData[];
  context: HandoffContext;
  onAction?: (device: DeviceStatusCardData, action: HandoffAction) => void;
};

const platformLabels: Record<DevicePlatform, string> = {
  phone: "Phone",
  tablet: "Tablet",
  laptop: "Laptop",
  desktop: "Desktop",
  other: "Device",
};

const presenceLabels: Record<DevicePresence, string> = {
  online: "Online",
  offline: "Offline",
  syncing: "Syncing",
  conflict: "Needs attention",
  unknown: "Status unknown",
};

function presenceTone(presence: DevicePresence): SurfaceTone {
  if (presence === "online") return "green";
  if (presence === "syncing") return "cyan";
  if (presence === "conflict") return "amber";
  if (presence === "offline") return "slate";
  return "rose";
}

function syncTone(status: HandoffContext["syncStatus"]): SurfaceTone {
  if (status === "synced") return "green";
  if (status === "syncing") return "cyan";
  if (status === "conflict") return "amber";
  if (status === "offline") return "slate";
  return "rose";
}

export function HandoffCenter({ devices, context, onAction }: HandoffCenterProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 sm:p-6" aria-labelledby="handoff-center-title">
      <SurfaceHeader
        eyebrow="Handoff Center · device continuity"
        title="Continue with the context intact"
        description="Every device reads the same authenticated mission state. This status view makes sync, queued edits and conflicts visible before you continue."
        count={devices.length}
      />
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={syncTone(context.syncStatus)}>{context.syncStatus}</Badge>
            {context.missionTitle && <Badge>{context.missionTitle}</Badge>}
          </div>
          <h3 id="handoff-center-title" className="mt-4 text-base font-semibold text-slate-100">Current mission context</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{context.message ?? "Choose a device after checking its sync status."}</p>
          <dl className="mt-4 space-y-3 text-xs text-slate-400">
            <div><dt className="text-slate-500">Next step</dt><dd className="mt-1 text-sm text-slate-200">{context.nextStep || "No next step recorded."}</dd></div>
            <div><dt className="text-slate-500">Last cloud sync</dt><dd className="mt-1 text-slate-200">{formatDate(context.lastSyncedAt)}</dd></div>
          </dl>
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs leading-5 text-slate-400">
            Device handoff is reviewable state. A real controller must verify the authenticated session and reconcile revisions before applying queued work.
          </p>
        </div>
        <div className="space-y-3">
          {devices.length === 0 ? (
            <EmptySurface>Sign in on another device to see its authenticated presence here.</EmptySurface>
          ) : (
            devices.map((device) => (
              <article key={device.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-100">{device.name}</h3>
                      {device.isCurrent && <Badge tone="cyan">This device</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{platformLabels[device.platform]}</p>
                  </div>
                  <Badge tone={presenceTone(device.presence)}>{presenceLabels[device.presence]}</Badge>
                </div>
                <dl className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-2">
                  <div><dt className="text-slate-500">Last seen</dt><dd className="mt-1 text-slate-200">{formatDate(device.lastSeenAt)}</dd></div>
                  <div><dt className="text-slate-500">Queued edits</dt><dd className="mt-1 text-slate-200">{device.queuedChanges ?? 0}</dd></div>
                </dl>
                {device.presence === "conflict" && <p className="mt-3 text-xs leading-5 text-amber-200">A revision conflict needs review before this device can continue safely.</p>}
                {device.capabilities && device.capabilities.length > 0 && <p className="mt-3 text-xs leading-5 text-slate-500">Capabilities: <span className="text-slate-300">{device.capabilities.join(", ")}</span></p>}
                {onAction && (
                  <div className="mt-4">
                    <Button onClick={() => onAction(device, "inspect")}>Inspect status</Button>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

