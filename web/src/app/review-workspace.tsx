"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CloudRecord, LearningEvent, LearningSignal, MissionSnapshot, SaathiClient } from "../../../cloud/index.mjs";
import type { MemoryDecisionRecord } from "../../../cloud/memory-decision-repository.mjs";
import { projectLearningLedger, validateMemoryDecision } from "../../../memory-review.mjs";
import type { LedgerProjection, MemoryCandidate, MemoryDecision } from "../../../memory-review.mjs";
import { createReviewSignal } from "../../../review-signal.mjs";
import { rankAcceptedMemories } from "../../../learning-loop.mjs";
import { createPlannerProposal, prepareProposalApplication } from "../../../agent-planner.mjs";
import type { AgentProposal } from "../../../agent-planner.mjs";
import MemoryLedger from "./memory-ledger";
import type { MemoryDecisionAction, MemoryLedgerEntry } from "./memory-ledger";
import AgentRoomPanel from "./agent-room-panel";
import UnifiedSurfaces from "./unified-surfaces";
import MoltbookAmbassadorPanel from "./moltbook-ambassador-panel";
import type {PublicResearchCapsule} from "../../../public-research.mjs";

type SignalRecord = Pick<LearningEvent, "payload" | "createdAt">;
type DecisionRecord = Pick<MemoryDecisionRecord, "payload" | "createdAt">;
export type LedgerBackend = {
  list(): Promise<{ signals: SignalRecord[]; decisions: DecisionRecord[] }>;
  appendSignal(signal: LearningSignal): Promise<unknown>;
  appendDecision(decision: MemoryDecision): Promise<unknown>;
  watch(invalidate: () => void): () => void;
};

function cloudBackend(client: SaathiClient, ownerId: string): LedgerBackend {
  // Provider modules are loaded only after cloud mode is explicitly selected.
  const repositories = Promise.all([import("../../../cloud/index.mjs"),import("../../../cloud/memory-decision-repository.mjs")]).then(([cloud,memory])=>({signals:cloud.createLearningEventRepository(client,ownerId),decisions:memory.createMemoryDecisionRepository(client,ownerId)}));
  return {
    async list() {
      const {signals,decisions}=await repositories;
      const [signalList, decisionList] = await Promise.all([signals.list(), decisions.list()]);
      return { signals: [...signalList], decisions: [...decisionList] };
    },
    async appendSignal(signal) { return (await repositories).signals.append(signal); },
    async appendDecision(decision) { return (await repositories).decisions.append(decision); },
    watch(invalidate) {
      let disposed=false,stop=()=>{};
      void repositories.then(({signals,decisions})=>{if(disposed)return;const a=signals.watch(invalidate),b=decisions.watch(invalidate);stop=()=>{a();b();};}).catch(()=>{});
      return () => { disposed=true;stop(); };
    },
  };
}

function sessionBackend(): LedgerBackend {
  const signals: SignalRecord[] = [];
  const decisions: DecisionRecord[] = [];
  return {
    async list() { return structuredClone({ signals, decisions }); },
    async appendSignal(payload) {
      if (!signals.some(record => record.payload.id === payload.id)) signals.push({ payload, createdAt: new Date().toISOString() });
    },
    async appendDecision(payload) { decisions.push({ payload, createdAt: new Date().toISOString() }); },
    watch() { return () => {}; },
  };
}

function message(error: unknown) { return error instanceof Error ? error.message : "The review could not be saved."; }

export type ReviewWorkspaceProps = {
  records: readonly CloudRecord[];
  selectedRecord: CloudRecord | null;
  syncStatus: string;
  mode: "cloud" | "session" | "private";
  privateBackend?: LedgerBackend;
  onImportResearchAction?:(capsule:PublicResearchCapsule)=>Promise<void>;
  privateAgents?: {
    proposals:readonly AgentProposal[];
    onPlanAction:()=>Promise<void>;
    onAcceptAction:(proposal:AgentProposal)=>Promise<void>;
    onRejectAction:(proposal:AgentProposal)=>Promise<void>;
  };
  client?: SaathiClient;
  ownerId?: string;
  editorDirty?: boolean;
  onSaveAction: (mission: MissionSnapshot, revision: number) => Promise<CloudRecord>;
};

// Cloud and the explicit local lab share the exact same review contracts.
// The local lab is isolated session data; it never impersonates cloud auth.
export default function ReviewWorkspace({ records, selectedRecord, syncStatus, mode, client, ownerId, editorDirty = false, onSaveAction, privateBackend, privateAgents,onImportResearchAction }: ReviewWorkspaceProps) {
  const backend = useMemo(() => {
    if (mode === "session") return sessionBackend();
    if (mode === "private") { if(!privateBackend) throw new Error("An unlocked private vault is required."); return privateBackend; }
    if (!client || !ownerId) throw new Error("A verified account is required for the cloud ledger.");
    return cloudBackend(client, ownerId);
  }, [mode, client, ownerId, privateBackend]);
  const [projection, setProjection] = useState<LedgerProjection>({ entries: [], warnings: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const readEpoch = useRef(0);
  const mounted = useRef(false);
  const writeBusy = useRef(false);
  const latestRecord = useRef(selectedRecord);
  const latestDirty = useRef(editorDirty);
  useEffect(() => { latestRecord.current = selectedRecord; latestDirty.current = editorDirty; }, [selectedRecord, editorDirty]);

  const refresh = useCallback(async () => {
    const epoch = ++readEpoch.current;
    try {
      const lists = await backend.list();
      const next = await projectLearningLedger(lists.signals, lists.decisions);
      if (mounted.current && epoch === readEpoch.current) { setProjection(next); setError(null); }
      return next;
    } catch (reason) {
      if (mounted.current && epoch === readEpoch.current) setError(message(reason));
      throw reason;
    }
  }, [backend]);

  useEffect(() => {
    mounted.current = true;
    const invalidate = () => { if (!writeBusy.current) void refresh().catch(() => {}); };
    invalidate();
    const unwatch = backend.watch(invalidate);
    const poll = mode === "cloud" ? setInterval(invalidate, 15_000) : null;
    window.addEventListener("focus", invalidate);
    return () => {
      mounted.current = false;
      readEpoch.current += 1;
      unwatch();
      if (poll !== null) clearInterval(poll);
      window.removeEventListener("focus", invalidate);
    };
  }, [backend, mode, refresh]);

  async function publish(allowLearning: boolean, sensitiveSource: boolean) {
    if (writeBusy.current) throw new Error("Wait for the current ledger operation.");
    const record = latestRecord.current;
    if (!record || latestDirty.current) throw new Error("Save the selected mission before publishing its review.");
    writeBusy.current = true;
    setBusy(true); setNotice(null);
    try {
      const signal = await createReviewSignal(record.mission, { allowLearning, sensitiveSource });
      const lists = await backend.list();
      const existing = lists.signals.find(entry => entry.payload.id === signal.id);
      if (existing && (existing.payload.allowLearning !== signal.allowLearning || existing.payload.sensitiveSource !== signal.sensitiveSource)) {
        throw new Error("This review was recorded with different consent. Save a new review before publishing changed consent.");
      }
      if (!existing) {
        try { await backend.appendSignal(signal); }
        catch (reason) {
          // A retry or another device may already have appended this exact review.
          const raced = (await backend.list()).signals.find(entry => entry.payload.id === signal.id);
          if (!raced || raced.payload.allowLearning !== signal.allowLearning || raced.payload.sensitiveSource !== signal.sensitiveSource) throw reason;
        }
      }
      await refresh();
      if (mounted.current) setNotice(sensitiveSource || !allowLearning ? "Review recorded with learning excluded." : "Review published. Candidates need your approval.");
    } catch (reason) { if (mounted.current) setError(message(reason)); throw reason; }
    finally { writeBusy.current = false; if (mounted.current) setBusy(false); }
  }

  async function decide(entry: MemoryLedgerEntry, action: MemoryDecisionAction, statement?: string) {
    if (writeBusy.current) throw new Error("Wait for the current ledger operation.");
    writeBusy.current = true;
    setBusy(true); setNotice(null);
    try {
      const current = await refresh();
      const candidate = current.entries.find(item => item.candidate.id === entry.candidate.id);
      if (!candidate) throw new Error("This candidate is no longer available. Refresh the ledger.");
      const allowed = action === "accept" ? candidate.view.canAccept : action === "edit" ? candidate.view.canEdit : action === "reject" ? candidate.view.canReject : candidate.view.canForget;
      if (!allowed) throw new Error("This candidate changed. Review its current state before deciding.");
      const payload = validateMemoryDecision({
        schema: "saathi.memory-decision", version: 1, id: crypto.randomUUID(),
        signalId: candidate.signalId, candidateId: candidate.candidate.id, missionId: candidate.missionId,
        action, statement: action === "edit" ? statement?.trim() ?? "" : null, createdAt: new Date().toISOString(),
      });
      await backend.appendDecision(payload);
      const next = await refresh();
      const saved = next.entries.find(item => item.candidate.id === candidate.candidate.id);
      const matched = action === "edit" ? saved?.candidate.statement === payload.statement && saved.candidate.status === "pending"
        : saved?.candidate.status === ({accept:"accepted",reject:"rejected",forget:"forgotten"} as const)[action];
      if (!matched) throw new Error("Another decision took precedence. Review the refreshed candidate.");
      if (mounted.current) setNotice(action === "forget" ? "Removed from active memory. Source reviews remain in the audit history." : "Your memory decision was saved.");
    } catch (reason) { if (mounted.current) setError(message(reason)); throw reason; }
    finally { writeBusy.current = false; if (mounted.current) setBusy(false); }
  }

  async function suggest() {
    if(privateAgents) return privateAgents.onPlanAction();
    const record = latestRecord.current;
    if (!record || latestDirty.current) throw new Error("Select and save a mission before suggesting a plan.");
    const proposal = createPlannerProposal(record.mission, record.revision);
    setProposals(current => [proposal, ...current].slice(0, 50));
  }

  async function apply(proposal: AgentProposal) {
    if(privateAgents) return privateAgents.onAcceptAction(proposal);
    if (writeBusy.current) throw new Error("Wait for the current operation.");
    const record = latestRecord.current;
    if (!record || latestDirty.current) throw new Error("Save your current edits before applying a proposal.");
    writeBusy.current = true; setAgentBusy(true);
    try {
      const prepared = prepareProposalApplication(proposal, record.mission, record.revision);
      if (prepared.proposal.status === "stale" || prepared.proposal.status === "expired") {
        setProposals(current => current.map(item => item.id === proposal.id ? prepared.proposal : item));
        return;
      }
      await onSaveAction(prepared.mission, record.revision);
      if (mounted.current) setProposals(current => current.map(item => item.id === proposal.id ? {...prepared.proposal, status:"accepted"} : item));
    } finally { writeBusy.current = false; if (mounted.current) setAgentBusy(false); }
  }

  const entries = projection.entries.map(entry => ({
    ...entry,
    view: { ...entry.view, source: { ...entry.view.source, missionTitle: records.find(record => record.id === entry.missionId)?.mission.title ?? "Archived source mission" } },
  }));
  const ledgerPanel = <div className="space-y-5">
    <PublishReview key={selectedRecord ? `${selectedRecord.id}:${selectedRecord.mission.reflection?.reviewedAt ?? ""}` : "none"} record={selectedRecord} busy={busy || editorDirty} onPublishAction={publish} />
    <MemoryLedger entries={entries} busy={busy} error={error} notice={notice} onDecisionAction={decide} onRefreshAction={() => void refresh().catch(() => {})} />
    {projection.warnings.length > 0 && <p role="status" className="text-xs leading-5 text-amber-200">{projection.warnings.length} ledger decisions were superseded or could not apply. The displayed state is authoritative.</p>}
    <p className="text-xs leading-5 text-slate-500">{mode === "cloud" ? "Reviews and decisions use your account's append-only cloud ledger." : mode === "private" ? "Reviews, approved memories and decisions are saved in this device's encrypted vault. Locking removes the unlocked workspace from the page." : "Local review lab: mission, memories and decisions last only for this page session. Refresh clears them."}</p>
  </div>;
  const agentPanel = <div>
    <MoltbookAmbassadorPanel key={selectedRecord?`${selectedRecord.id}:${selectedRecord.revision}`:"none"} missionTitle={selectedRecord?.mission.title??null} canImport={mode==="private"&&!!selectedRecord&&!!onImportResearchAction} disabled={editorDirty||busy||agentBusy} onImportAction={onImportResearchAction}/>
    {editorDirty && <p className="mb-4 text-sm text-amber-200">Save mission edits before making or applying a plan.</p>}
    <AgentRoomPanel missionTitle={selectedRecord?.mission.title ?? null} currentRevision={selectedRecord?.revision ?? null}
      proposals={(privateAgents?.proposals??proposals).filter(item => item.missionId === selectedRecord?.id)} busy={agentBusy || editorDirty}
      planLabel={mode==="private"?"Ask the private team":"Suggest a plan"}
      persistenceLabel={mode === "cloud" ? "Proposal decisions last for this session; approved mission changes are saved to your cloud workspace." : mode === "private" ? "Four local roles share approved context. Plans and decisions persist in your encrypted vault. Approving one changes the mission revision; regenerate the remaining plans." : "Plans and approved mission changes last for this local page session."}
      onPlanAction={suggest} onAcceptAction={apply} onRejectAction={async proposal => {if(privateAgents)await privateAgents.onRejectAction(proposal);else setProposals(current => current.map(item => item.id === proposal.id && item.status === "proposed" ? {...item,status:"rejected"} : item));}} />
  </div>;
  const relevant: Array<{memory:MemoryCandidate;score:number}> = !error && selectedRecord && selectedRecord.mission.goal.trim()
    ? rankAcceptedMemories(selectedRecord.mission.goal, projection.entries.map(entry=>entry.candidate).filter(candidate=>candidate.scope==="global"||candidate.missionId===selectedRecord.id))
    : [];
  const learningPanel = <section>
    <h3 className="text-xl font-semibold">Approved context for this mission</h3>
    <p className="mt-2 text-sm leading-6 text-slate-400">Lessons you accept in Learning Ledger can be reused here when their words match the mission goal. This is deterministic context retrieval; the tutor AI is a later integration.</p>
    {relevant.length>0 ? <ul className="mt-5 grid gap-3 sm:grid-cols-2">{relevant.map(({memory})=><li key={memory.id} className="rounded-2xl border border-cyan-200/15 bg-cyan-100/5 p-4"><p className="text-sm leading-6">{memory.statement}</p><p className="mt-3 break-all text-xs text-slate-500">Approved memory: {memory.id}</p><p className="mt-1 text-xs text-cyan-200">Source evidence: {memory.evidence.length} reviewed signals</p></li>)}</ul> : <p className="mt-5 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-400">No accepted lesson matches this mission yet. Publish a saved review and approve a relevant candidate in Learning Ledger.</p>}
  </section>;
  return <UnifiedSurfaces mission={selectedRecord?.mission ?? null} missionCount={records.filter(record => !record.deletedAt).length} syncStatus={syncStatus} agentPanel={agentPanel} ledgerPanel={ledgerPanel} learningPanel={learningPanel} />;
}

function PublishReview({record,busy,onPublishAction}:{record:CloudRecord|null;busy:boolean;onPublishAction:(allow:boolean,sensitive:boolean)=>Promise<void>}) {
  const [consent, setConsent] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const review = record?.mission.stage === "complete" ? record.mission.reflection : null;
  async function publish() { setError(null); try { await onPublishAction(consent,sensitive); } catch(reason) { setError(message(reason)); } }
  return <section className="rounded-2xl border border-white/10 bg-black/10 p-5">
    <h3 className="font-semibold">Publish the saved review</h3>
    <p className="mt-2 text-sm leading-6 text-slate-400">{review ? `Source: ${record?.mission.title}. ${review.personalMemory ?? review.lesson}` : "Complete a mission, write a lesson and save the review first."}</p>
    <label className="mt-4 flex gap-3 text-sm text-slate-300"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy||!review} className="accent-cyan-300" />Allow this reviewed lesson to produce pending memory candidates.</label>
    <label className="mt-3 flex gap-3 text-sm text-slate-300"><input type="checkbox" checked={sensitive} onChange={event=>setSensitive(event.target.checked)} disabled={busy||!review} className="accent-cyan-300" />This source contains sensitive material; exclude it from learning.</label>
    <button type="button" className="primary-button mt-4 disabled:opacity-40" disabled={busy||!review||(!review.lesson.trim()&&!review.personalMemory?.trim())} onClick={()=>void publish()}>{busy ? "Publishing…" : consent&&!sensitive ? "Publish for review" : "Record with learning excluded"}</button>
    {error && <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
  </section>;
}
