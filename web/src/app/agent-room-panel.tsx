"use client";

import { useEffect, useState } from "react";
import type { AgentProposal } from "../../../agent-planner.mjs";

export type AgentRoomPanelProps = {
  missionTitle: string | null;
  proposals: readonly AgentProposal[];
  currentRevision: number | null;
  busy: boolean;
  persistenceLabel?: string;
  planLabel?:string;
  onPlanAction: () => Promise<void>;
  onAcceptAction: (proposal: AgentProposal) => Promise<void>;
  onRejectAction: (proposal: AgentProposal) => Promise<void> | void;
};

const disabledStyle = "disabled:cursor-not-allowed disabled:opacity-40";

export default function AgentRoomPanel({ missionTitle, proposals, currentRevision, busy, persistenceLabel, planLabel, onPlanAction, onAcceptAction, onRejectAction }: AgentRoomPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const disabled = busy || working;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setActionError(null);
    try {
      await action();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The proposal could not be saved. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rounded-3xl border border-cyan-300/15 bg-slate-900/60 p-5 sm:p-6" aria-labelledby="agent-room-heading" aria-busy={disabled}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Propose · Review · Approve</p>
          <h2 id="agent-room-heading" className="mt-2 text-xl font-semibold text-white">Agent Room</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Review a plan before it changes your mission. Each proposal records the mission revision and evidence it used.</p>
        </div>
        <button type="button" className={`primary-button ${disabledStyle}`} disabled={disabled || currentRevision === null || !missionTitle} onClick={() => void run(onPlanAction)}>{disabled ? "Working…" : planLabel??"Suggest a plan"}</button>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-white/5 bg-white/[0.025] px-4 py-3 text-xs">
        <span className="text-slate-400">Provider: <span className="text-cyan-200">Local rules planner</span></span>
        <span className="text-slate-400">Mission: <span className="text-slate-200">{missionTitle || "Choose a saved mission"}</span></span>
        <span className="text-slate-400">Current revision: <span className="text-slate-200">{currentRevision ?? "—"}</span></span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">An AI provider is not connected. {persistenceLabel ?? "Proposal decisions last for this session; approved mission changes are saved through your cloud workspace."}</p>
      {actionError && <p className="mt-3 text-sm text-amber-200" role="alert">{actionError}</p>}

      {proposals.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center">
          <p className="text-sm font-medium text-slate-200">No proposals yet</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Select a saved mission, then suggest a plan. You can inspect the changes and their evidence before applying them.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {proposals.map((proposal) => {
            const expired = proposal.status === "proposed" && proposal.expiresAt !== null && Date.parse(proposal.expiresAt) <= now;
            const stale = proposal.status === "proposed" && currentRevision !== null && proposal.baseRevision !== currentRevision;
            const status = expired ? "expired" : stale ? "stale" : proposal.status;
            const actionable = status === "proposed" && currentRevision !== null && proposal.operation === "mission_patch" && proposal.permissions.includes("propose_mission");
            const rejectable = proposal.status === "proposed" && !expired;
            return (
              <article key={proposal.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-cyan-200">{proposal.role}</span><span className="text-slate-500">{proposal.operation.replaceAll("_", " ")}</span></div>
                    <h3 className="mt-3 font-semibold text-slate-100">{proposal.title}</h3>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs capitalize ${status === "accepted" ? "bg-cyan-300/10 text-cyan-200" : ["stale", "expired"].includes(status) ? "bg-amber-300/10 text-amber-200" : "bg-white/5 text-slate-300"}`}>{status}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{proposal.summary}</p>
                <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                  <p className="break-all">Mission ID: {proposal.missionId}</p>
                  <p>Based on revision: <span className="text-slate-300">{proposal.baseRevision}</span></p>
                  <p>Risk: <span className="capitalize text-slate-300">{proposal.risk}</span></p>
                  <p>Expires: {proposal.expiresAt ? new Date(proposal.expiresAt).toLocaleString() : "No expiry"}</p>
                </div>
                <details className="mt-4 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2 text-xs text-slate-400">
                  <summary className="cursor-pointer text-slate-300">Source evidence · {proposal.evidence.length} {proposal.evidence.length === 1 ? "reference" : "references"}</summary>
                  {proposal.evidence.length > 0 ? <ul className="mt-3 space-y-2">{proposal.evidence.map((evidence) => <li key={evidence} className="break-all">{evidence}</li>)}</ul> : <p className="mt-3">No source references were supplied.</p>}
                </details>
                <details open className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2">
                  <summary className="cursor-pointer text-xs text-slate-300">Proposed mission changes</summary>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-cyan-100/80" aria-label={`Proposed changes for ${proposal.title}`}>{JSON.stringify(proposal.body, null, 2)}</pre>
                </details>
                {status === "stale" && <p className="mt-3 text-xs leading-5 text-amber-200">The mission changed after this plan was made. Suggest a new plan using the current revision.</p>}
                {status === "expired" && <p className="mt-3 text-xs leading-5 text-amber-200">This proposal expired. Suggest a new plan before applying changes.</p>}
                {status === "accepted" && <p className="mt-3 text-xs leading-5 text-cyan-200">Approved mission changes were saved.</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={`primary-button ${disabledStyle}`} disabled={disabled || !actionable} onClick={() => void run(() => onAcceptAction(proposal))}>Approve and save</button>
                  <button type="button" className={`secondary-button ${disabledStyle}`} disabled={disabled || !rejectable} onClick={() => void run(async()=>{await onRejectAction(proposal);})}>Reject</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
