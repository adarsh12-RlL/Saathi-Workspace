"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CloudRecord, CloudRuntime, CloudWorkspace, CloudWorkspaceState, MissionSnapshot, SaathiClient } from "@/lib/saathi-cloud";
import { createBrowserCloudRuntime } from "@/lib/saathi-cloud";
import MissionReview from "./mission-review";
import ReviewWorkspace from "./review-workspace";

// A full document load applies the private route's CSP when leaving cloud mode.
function Link({href,className,children}:{href:string;className:string;children:ReactNode}) {
  return <a href={href} className={className} rel="noreferrer">{children}</a>;
}

const INITIAL_STATE: CloudWorkspaceState = {
  auth: { status: "idle", user: null, error: null },
  ownerId: null,
  sync: { status: "idle", records: [], error: null },
};

const stageLabels: Record<MissionSnapshot["stage"], string> = {
  captured: "Captured",
  planned: "Planned",
  working: "In progress",
  complete: "Complete",
};

function newId() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure browser UUID support is required to create a mission.");
  return globalThis.crypto.randomUUID();
}

function createMission(title: string, goal: string, nextStep: string): MissionSnapshot {
  const now = new Date().toISOString();
  return {
    id: newId(), title: title.trim(), goal: goal.trim(), notes: "", nextStep: nextStep.trim(), stage: "captured",
    tasks: [], decisions: [], artifacts: [], miniApps: [], updatedAt: now, templateSource: null, reflection: null,
  };
}

function createRepeatMission(source: MissionSnapshot): MissionSnapshot {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: `${source.title} — next run`.slice(0, 120),
    goal: source.goal,
    notes: source.reflection?.personalMemory ? `Previous run lesson: ${source.reflection.personalMemory}` : "",
    nextStep: source.nextStep,
    stage: "planned",
    tasks: source.tasks.map((task) => ({ id: newId(), title: task.title, done: false })),
    decisions: [],
    artifacts: [],
    miniApps: [],
    updatedAt: now,
    templateSource: source.id,
    reflection: null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export default function WorkspaceClient() {
  const [state, setState] = useState<CloudWorkspaceState>(INITIAL_STATE);
  const [startError, setStartError] = useState<string | null>(null);
  const [runtimeResult, setRuntimeResult] = useState<{runtime:CloudRuntime|null;error:string|null}>({runtime:null,error:null});
  const runtime = runtimeResult.runtime;

  useEffect(() => {
    let active = true;
    let workspace:CloudWorkspace|null = null;
    // Keep the server and first browser render identical. Runtime startup is a
    // client-only operation and must not touch localStorage during rendering.
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const started = createBrowserCloudRuntime(nextState => {if(active)setState(nextState);});
        workspace = started.workspace;
        setRuntimeResult({runtime:started,error:null});
        await workspace?.start();
      } catch (error) { if(active)setStartError(errorMessage(error)); }
    });
    return () => { active = false; workspace?.stop(); };
  }, []);

  if (runtimeResult.error || startError) return <CenteredMessage title="SAATHI could not start" body={runtimeResult.error ?? startError ?? "Unable to start the workspace."} />;
  if (!runtime) return <CenteredMessage title="Opening your workspace" body="Checking the local cloud configuration…" />;
  if (runtime.configurationError || !runtime.workspace) return <SetupScreen message={runtime.configurationError ?? "Add the Supabase browser configuration to continue."} />;
  if (state.auth.status === "idle" || state.auth.status === "checking") return <CenteredMessage title="Checking your mission passport" body="Verifying the current session without trusting cached user data…" />;
  if (state.auth.status === "signed-out" || state.auth.status === "error") return <AuthScreen workspace={runtime.workspace} error={state.auth.error} />;
  if (state.auth.status === "stopped") return <CenteredMessage title="Workspace stopped" body="Refresh the page to start a new session." />;
  if (!runtime.client || !state.ownerId) return <CenteredMessage title="Verifying workspace ownership" body="Checking the account before opening the learning ledger…" />;
  return <DashboardWithSurfaces key={state.ownerId} client={runtime.client} workspace={runtime.workspace} state={state} />;
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#08111f] px-6 text-slate-100"><section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl shadow-cyan-950/30"><BrandMark /><h1 className="mt-10 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-300">{body}</p></section></main>;
}

function BrandMark() {
  return <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-cyan-300 font-black text-[#08111f]">S</div><div><p className="text-sm font-semibold tracking-[0.28em] text-cyan-200">SAATHI</p><p className="text-xs text-slate-400">Personal mission workspace</p></div></div>;
}

function SetupScreen({ message }: { message: string }) {
  return <main className="min-h-screen bg-[#08111f] px-5 py-6 text-slate-100 sm:px-10 sm:py-10"><div className="mx-auto max-w-6xl"><BrandMark /><Link href="/review-lab" className="mt-6 inline-flex rounded-xl border border-cyan-200/20 px-4 py-3 text-sm text-cyan-200">Try Learning Ledger and Agent Room locally · no cloud keys</Link><div className="grid gap-8 pb-12 pt-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end"><div><p className="mb-5 inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cyan-200">Cloud-ready foundation</p><h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">Your ideas become missions, and missions become reusable tools.</h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">SAATHI keeps the goal, decisions, work and next step together so you can continue from a phone, tablet or laptop.</p></div><div className="rounded-3xl border border-amber-200/20 bg-amber-100/[0.06] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Setup needed</p><h2 className="mt-3 text-xl font-semibold">Connect your Supabase project</h2><p className="mt-3 text-sm leading-6 text-slate-300">{message}</p><div className="mt-5 rounded-2xl bg-black/20 p-4 font-mono text-xs leading-6 text-amber-100">NEXT_PUBLIC_SUPABASE_URL=<br />NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=</div><p className="mt-4 text-xs leading-5 text-slate-400">Copy these names into <code>web/.env.local</code>, restart the Next.js dev server, then the verified login screen will appear.</p></div></div><div className="grid gap-4 sm:grid-cols-3"><FeatureCard number="01" title="Mission passport" body="Keep context, tasks, decisions and outcomes in one portable record." /><FeatureCard number="02" title="Safe cloud sync" body="Owner-bound RLS, optimistic revisions and visible conflict handling protect edits." /><FeatureCard number="03" title="Mini-app studio" body="Validated tracker, quiz and invoice tools can grow from completed work." /></div></div></main>;
}

function FeatureCard({ number, title, body }: { number: string; title: string; body: string }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[0.045] p-5"><p className="text-xs font-semibold tracking-[0.2em] text-cyan-200">{number}</p><h2 className="mt-8 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></article>;
}

function DashboardWithSurfaces({ client, workspace, state }: { client: SaathiClient; workspace: CloudWorkspace; state: CloudWorkspaceState }) {
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorReset, setEditorReset] = useState(0);
  const selectedRecord = state.sync.records.find(record => record.id === selectedId && !record.deletedAt) ?? null;
  const syncStatus = state.sync.status === "ready" ? "Synced" : state.sync.status;
  async function saveProposal(mission: MissionSnapshot, revision: number) {
    const saved = await workspace.save(mission, revision);
    setSelectedId(saved.id); setEditorDirty(false); setEditorReset(value => value+1);
    return saved;
  }
  return <><Dashboard key={editorReset} initialRecord={selectedRecord} workspace={workspace} state={state} onSelectRecordAction={record=>setSelectedId(record?.id??null)} onDirtyAction={setEditorDirty} /><div className="bg-[#08111f] px-5 pb-12 text-slate-100 sm:px-10"><div className="mx-auto max-w-7xl"><ReviewWorkspace records={state.sync.records} selectedRecord={selectedRecord} syncStatus={syncStatus} mode="cloud" client={client} ownerId={state.ownerId??undefined} editorDirty={editorDirty} onSaveAction={saveProposal} /></div></div></>;
}

function AuthScreen({ workspace, error }: { workspace: CloudWorkspace; error: string | null }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(error);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      if (mode === "signin") await workspace.signIn(email, password);
      else { const result = await workspace.signUp(email, password); setMessage(result.requiresConfirmation ? "Check your email to confirm the account, then return here to sign in." : "Account created."); if (!result.requiresConfirmation) setMode("signin"); }
    } catch (submitError) { setMessage(errorMessage(submitError)); } finally { setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#08111f] px-5 py-8 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-7 shadow-2xl shadow-cyan-950/30 sm:p-9"><BrandMark /><div className="mt-10"><p className="text-sm font-medium text-cyan-200">{mode === "signin" ? "Welcome back" : "Start your passport"}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{mode === "signin" ? "Continue your mission" : "Create your SAATHI account"}</h1><p className="mt-3 text-sm leading-6 text-slate-400">Your mission records stay separated by the verified Supabase account.</p></div><form className="mt-8 space-y-4" onSubmit={submit}><label className="block text-sm text-slate-300">Email<input className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="block text-sm text-slate-300">Password<input className="field" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="rounded-2xl border border-amber-200/20 bg-amber-100/10 px-4 py-3 text-sm leading-5 text-amber-100">{message}</p>}<button className="primary-button w-full" type="submit" disabled={busy}>{busy ? "Verifying…" : mode === "signin" ? "Sign in securely" : "Create account"}</button></form><button className="mt-5 w-full text-sm text-slate-400 transition hover:text-cyan-200" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); }}>{mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}</button></section></main>;
}

function Dashboard({ workspace, state, initialRecord, onSelectRecordAction, onDirtyAction }: { workspace: CloudWorkspace; state: CloudWorkspaceState; initialRecord: CloudRecord|null; onSelectRecordAction: (record:CloudRecord|null)=>void; onDirtyAction:(dirty:boolean)=>void }) {
  const records = useMemo(() => state.sync.records.filter((record) => !record.deletedAt), [state.sync.records]);
  const [selectedId, setSelectedId] = useState<string | null>(initialRecord?.id??null);
  const [draft, setDraft] = useState<MissionSnapshot | null>(initialRecord ? structuredClone(initialRecord.mission) : null);
  const [draftRevision, setDraftRevision] = useState<number | null>(initialRecord?.revision??null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newNextStep, setNewNextStep] = useState("");
  function markDirty(value:boolean) { setDirty(value); onDirtyAction(value); }

  function selectRecord(record: CloudRecord) { setSelectedId(record.id); setDraft(structuredClone(record.mission)); setDraftRevision(record.revision); markDirty(false); setNotice(null); onSelectRecordAction(record); }

  async function createNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!newTitle.trim() || !newGoal.trim()) return; setNotice(null);
    try { const record = await workspace.create(createMission(newTitle, newGoal, newNextStep)); setNewTitle(""); setNewGoal(""); setNewNextStep(""); selectRecord(record); setNotice("Mission created and synced."); } catch (error) { setNotice(errorMessage(error)); }
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!draft || draftRevision === null) return;
    try { const record = await workspace.save({ ...draft, updatedAt: new Date().toISOString() }, draftRevision); setDraft(structuredClone(record.mission)); setDraftRevision(record.revision); markDirty(false); setNotice("Mission saved. Other devices will receive the update."); } catch (error) { setNotice(errorMessage(error)); }
  }

  async function removeDraft() {
    if (!draft || draftRevision === null || !window.confirm("Move this mission to the sync tombstone?")) return;
    try { await workspace.remove(draft.id, draftRevision); setSelectedId(null); onSelectRecordAction(null); setDraft(null); setDraftRevision(null); markDirty(false); setNotice("Mission archived and synced as a deletion marker."); } catch (error) { setNotice(errorMessage(error)); }
  }

  async function startRepeat() {
    if (!draft || draft.reflection?.repeat !== "yes" || dirty) return;
    setNotice(null);
    try {
      const record = await workspace.create(createRepeatMission(draft));
      selectRecord(record);
      setNotice("A fresh repeat mission was created and synced.");
    } catch (error) { setNotice(errorMessage(error)); }
  }

  const completeCount = records.filter((record) => record.mission.stage === "complete").length;
  const activeCount = records.filter((record) => record.mission.stage !== "complete").length;

  return <main className="min-h-screen bg-[#08111f] text-slate-100"><header className="border-b border-white/10 bg-[#0b1728]/90 px-5 py-4 backdrop-blur sm:px-10"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><BrandMark /><div className="flex items-center gap-3 text-right"><div className="hidden sm:block"><p className="text-xs text-slate-500">Signed in as</p><p className="max-w-52 truncate text-sm text-slate-300">{state.auth.user?.email ?? "verified account"}</p></div><button className="secondary-button" type="button" onClick={() => void workspace.signOut()}>Sign out</button></div></div></header><div className="mx-auto max-w-7xl px-5 py-8 sm:px-10 sm:py-10"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-cyan-200">Your mission passport</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Make progress that stays with you.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Capture the why, decide the next move, and pick up from any device without losing the thread.</p></div><SyncBadge status={state.sync.status} error={state.sync.error} /></div><div className="mt-8 grid gap-4 sm:grid-cols-3"><StatCard label="All missions" value={records.length} detail="Your cloud passport" /><StatCard label="In progress" value={activeCount} detail="Keep the next step visible" /><StatCard label="Completed" value={completeCount} detail="Ready to become workflows" /></div>{notice && <p className="mt-6 rounded-2xl border border-cyan-200/20 bg-cyan-100/10 px-4 py-3 text-sm text-cyan-100">{notice}</p>}<div className="mt-8 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Passport</p><h2 className="mt-2 text-xl font-semibold">Missions</h2></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">{records.length}</span></div><div className="mt-5 space-y-3">{records.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-sm leading-6 text-slate-400">Your first mission will appear here after you create it.</p>}{records.map((record) => <MissionListItem key={record.id} record={record} selected={selectedId === record.id} onSelect={() => selectRecord(record)} />)}</div><form className="mt-6 border-t border-white/10 pt-6" onSubmit={createNew}><p className="text-sm font-semibold">Capture a new mission</p><input className="field" placeholder="Mission title" required value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /><textarea className="field mt-3 min-h-24 resize-y" placeholder="What outcome do you want?" required value={newGoal} onChange={(event) => setNewGoal(event.target.value)} /><input className="field mt-3" placeholder="What is the next small step?" value={newNextStep} onChange={(event) => setNewNextStep(event.target.value)} /><button className="primary-button mt-3 w-full" type="submit">Create mission</button></form></section><section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 sm:p-6">{draft ? <form onSubmit={saveDraft}><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Mission editor</p><h2 className="mt-2 text-xl font-semibold">Continue the thread</h2></div><span className="text-xs text-slate-500">Revision {draftRevision}</span></div><label className="mt-6 block text-sm text-slate-300">Title<input className="field" required value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); markDirty(true); }} /></label><label className="mt-4 block text-sm text-slate-300">Goal<textarea className="field min-h-24 resize-y" required value={draft.goal} onChange={(event) => { setDraft({ ...draft, goal: event.target.value }); markDirty(true); }} /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm text-slate-300">Stage<select className="field" value={draft.stage} onChange={(event) => { setDraft({ ...draft, stage: event.target.value as MissionSnapshot["stage"] }); markDirty(true); }}>{Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block text-sm text-slate-300">Next step<input className="field" value={draft.nextStep} onChange={(event) => { setDraft({ ...draft, nextStep: event.target.value }); markDirty(true); }} /></label></div><label className="mt-4 block text-sm text-slate-300">Notes<textarea className="field min-h-32 resize-y" value={draft.notes} onChange={(event) => { setDraft({ ...draft, notes: event.target.value }); markDirty(true); }} /></label>{draft.stage === "complete" && <MissionReview value={draft.reflection} onChange={(reflection) => { setDraft({ ...draft, reflection }); markDirty(true); }} onRepeat={draft.reflection?.repeat === "yes" && !dirty ? () => void startRepeat() : undefined} /> }<div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-400"><span>{draft.tasks.length} tasks</span><span>·</span><span>{draft.decisions.length} decisions</span><span>·</span><span>{draft.miniApps.length} mini-apps</span>{dirty && <span className="text-amber-200">Unsaved changes</span>}</div><div className="mt-6 flex flex-wrap gap-3"><button className="primary-button" type="submit" disabled={!dirty}>Save mission</button><button className="danger-button" type="button" onClick={() => void removeDraft()}>Archive</button></div></form> : <div className="grid min-h-80 place-items-center text-center"><div><p className="text-lg font-semibold">Choose a mission to begin</p><p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">Your passport keeps the context and next step together while you move between devices.</p></div></div>}</section></div></div></main>;
}

function StatCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></article>;
}

function MissionListItem({ record, selected, onSelect }: { record: CloudRecord; selected: boolean; onSelect: () => void }) {
  return <button className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-cyan-200/40 bg-cyan-200/10" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"}`} type="button" onClick={onSelect}><div className="flex items-start justify-between gap-3"><span className="font-medium text-slate-100">{record.mission.title}</span><span className="shrink-0 text-[11px] text-slate-500">{stageLabels[record.mission.stage]}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{record.mission.goal}</p><p className="mt-3 text-[11px] text-slate-500">Revision {record.revision} · {new Date(record.updatedAt).toLocaleDateString()}</p></button>;
}

function SyncBadge({ status, error }: { status: CloudWorkspaceState["sync"]["status"]; error: string | null }) {
  const label = status === "ready" ? "Synced" : status === "loading" ? "Refreshing" : status === "saving" ? "Saving" : status === "conflict" ? "Conflict" : status === "error" ? "Needs attention" : "Preparing";
  return <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-slate-300"><span className={`mr-2 inline-block size-2 rounded-full ${status === "error" || status === "conflict" ? "bg-amber-300" : "bg-cyan-300"}`} />{label}{error && <span className="ml-2 text-amber-200">· {error}</span>}</div>;
}
