"use client";

import { useId, useState } from "react";

export type MemoryCandidateStatus = "pending" | "accepted" | "rejected" | "expired" | "forgotten";
export type MemoryDecisionAction = "accept" | "edit" | "reject" | "forget";

export type MemoryCandidate = {
  id: string;
  kind: string;
  scope: string;
  statement: string;
  status: MemoryCandidateStatus;
  sensitive: boolean;
  evidence: readonly string[];
};

export type MemoryCandidateView = {
  id: string;
  kind: string;
  scope: string;
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

export type MemoryLedgerEntry = {
  signalId: string;
  missionId: string;
  candidate: MemoryCandidate;
  view: MemoryCandidateView;
};

export type MemoryLedgerProps = {
  entries: readonly MemoryLedgerEntry[];
  busy: boolean;
  error: string | null;
  notice?: string | null;
  onDecisionAction: (entry: MemoryLedgerEntry, action: MemoryDecisionAction, statement?: string) => Promise<void>;
  onRefreshAction: () => void;
};

const disabledStyle = "disabled:cursor-not-allowed disabled:opacity-40";

function MemoryCard({ entry, busy, onDecisionAction }: {
  entry: MemoryLedgerEntry;
  busy: boolean;
  onDecisionAction: MemoryLedgerProps["onDecisionAction"];
}) {
  const textareaId = useId();
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(entry.candidate.statement);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const { view, candidate } = entry;
  const pending = candidate.status === "pending";
  const sensitive = candidate.sensitive || view.sensitive;
  const disabled = busy || working;
  const editable = pending && !sensitive && view.canEdit;
  const acceptable = pending && !sensitive && view.canAccept;
  const forgettable = candidate.status !== "forgotten" && view.canForget;

  async function decide(action: MemoryDecisionAction, editedStatement?: string) {
    setActionError(null);
    setWorking(true);
    try {
      await onDecisionAction(entry, action, editedStatement);
      if (action === "edit") setEditing(false);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "This memory decision could not be saved. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-violet-300/10 px-2.5 py-1 text-xs font-medium text-violet-200">{view.kind}</span>
          <span className="text-xs text-slate-400">{view.scope === "global" ? "Across missions" : "This mission"}</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${candidate.status === "accepted" ? "bg-cyan-300/10 text-cyan-200" : "bg-white/5 text-slate-300"}`}>{view.statusLabel}</span>
      </div>

      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">
        {sensitive ? "Sensitive source material is excluded from personal memory." : candidate.status === "forgotten" ? "Removed from active memory." : view.statement}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{view.explanation}</p>
      <div className="mt-4 flex items-center gap-3" aria-label={`Confidence ${view.confidencePercent} percent`}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
          <div className="h-full rounded-full bg-violet-300/60" style={{ width: `${Math.max(0, Math.min(100, view.confidencePercent))}%` }} />
        </div>
        <span className="text-xs text-slate-400">{view.confidencePercent}% confidence</span>
      </div>

      <details className="mt-4 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2 text-xs text-slate-400">
        <summary className="cursor-pointer text-slate-300">Evidence · {view.evidenceCount} {view.evidenceCount === 1 ? "item" : "items"}</summary>
        <p className="mt-3 font-medium text-slate-200">Source mission: {view.source.missionTitle}</p>
        <p className="mt-1 break-all">Mission ID: {entry.missionId}</p>
        <p className="mt-1 break-all">Learning signal: {entry.signalId}</p>
        {view.evidence.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {view.evidence.map((evidence) => <li key={evidence.id}><span className="text-slate-300">{evidence.label}</span><span className="mt-0.5 block break-all text-slate-500">{evidence.id}</span></li>)}
          </ul>
        ) : <p className="mt-3">Evidence references have been erased.</p>}
      </details>

      {editing && editable && (
        <div className="mt-4">
          <label htmlFor={textareaId} className="text-sm text-slate-200">Edit the memory before accepting it</label>
          <textarea id={textareaId} className="field min-h-28 resize-y" value={statement} onChange={(event) => setStatement(event.target.value)} maxLength={1000} disabled={disabled} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={`primary-button ${disabledStyle}`} disabled={disabled || !statement.trim()} onClick={() => void decide("edit", statement.trim())}>Save edit</button>
            <button type="button" className={`secondary-button ${disabledStyle}`} disabled={disabled} onClick={() => setEditing(false)}>Cancel</button>
            <span className="ml-auto text-xs text-slate-500">{statement.length}/1000</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">Saving an edit keeps this memory pending. Review the saved text, then accept it.</p>
        </div>
      )}

      {actionError && <p className="mt-3 text-sm text-amber-200" role="alert">{actionError}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={`primary-button ${disabledStyle}`} disabled={disabled || !acceptable || editing} onClick={() => void decide("accept")}>Accept memory</button>
        <button type="button" className={`secondary-button ${disabledStyle}`} disabled={disabled || !editable || editing} onClick={() => { setStatement(candidate.statement); setEditing(true); setActionError(null); }}>Edit</button>
        <button type="button" className={`secondary-button ${disabledStyle}`} disabled={disabled || !pending || !view.canReject} onClick={() => void decide("reject")}>Reject</button>
        <button type="button" className={`danger-button ${disabledStyle}`} disabled={disabled || !forgettable} onClick={() => void decide("forget")}>Forget</button>
      </div>
      {forgettable && <p className="mt-3 text-xs leading-5 text-slate-500">Forget removes the candidate text and evidence from active memory. Original source reviews and decision records remain in the audit ledger.</p>}
    </article>
  );
}

export default function MemoryLedger({ entries, busy, error, notice, onDecisionAction, onRefreshAction }: MemoryLedgerProps) {
  const [filter, setFilter] = useState<"pending" | "accepted" | "all">("pending");
  const pending = entries.filter((entry) => entry.candidate.status === "pending").length;
  const accepted = entries.filter((entry) => entry.candidate.status === "accepted").length;
  const visible = entries.filter((entry) => filter === "all" || entry.candidate.status === filter);

  return (
    <section className="rounded-3xl border border-violet-300/15 bg-slate-900/60 p-5 sm:p-6" aria-labelledby="memory-ledger-heading" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Learn from verified work</p>
          <h2 id="memory-ledger-heading" className="mt-2 text-xl font-semibold text-white">Learning Ledger</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A completed mission can suggest a lesson or preference. Your approval decides what SAATHI remembers for future missions.</p>
        </div>
        <button type="button" className={`secondary-button ${disabledStyle}`} disabled={busy} onClick={onRefreshAction}>Refresh memories</button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Filter memories">
        {([{ value: "pending", label: `Needs review (${pending})` }, { value: "accepted", label: `In use (${accepted})` }, { value: "all", label: `All (${entries.length})` }] as const).map((option) => (
          <button type="button" key={option.value} aria-pressed={filter === option.value} className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${filter === option.value ? "border-violet-300/40 bg-violet-300/10 text-violet-100" : "border-white/10 text-slate-400 hover:bg-white/5"}`} onClick={() => setFilter(option.value)}>{option.label}</button>
        ))}
      </div>
      <div className="mt-4 space-y-2" aria-live="polite">
        {busy && <p className="text-sm text-cyan-200" role="status">Updating the learning ledger…</p>}
        {notice && <p className="text-sm text-cyan-200" role="status">{notice}</p>}
        {error && <p className="text-sm text-amber-200" role="alert">{error}</p>}
      </div>

      {visible.length > 0 ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {visible.map((entry) => <MemoryCard key={`${entry.candidate.id}:${entry.candidate.status}:${entry.candidate.statement}`} entry={entry} busy={busy} onDecisionAction={onDecisionAction} />)}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center">
          <p className="text-sm font-medium text-slate-200">{filter === "pending" ? "No memories waiting for review" : filter === "accepted" ? "No memories accepted yet" : "Your learning ledger is empty"}</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">Complete a mission, save a review, then publish it with learning consent to create candidates from your feedback.</p>
        </div>
      )}
    </section>
  );
}
