"use client";

import { useRef, useState, type FormEvent } from "react";
import type {ReactNode} from "react";
import type { CloudRecord, MissionSnapshot } from "../../../../cloud/index.mjs";
import ReviewWorkspace from "../review-workspace";

function Link({href,className,children}:{href:string;className:string;children:ReactNode}) {
  // Apply the private page CSP with a full document load.
  return <a href={href} className={className} rel="noreferrer">{children}</a>;
}

export default function ReviewLab() {
  const [record, setRecord] = useState<CloudRecord|null>(null);
  const current = useRef<CloudRecord|null>(null);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [lesson, setLesson] = useState("");
  const [outcome, setOutcome] = useState<"achieved"|"partial"|"blocked">("achieved");
  const [error, setError] = useState<string|null>(null);

  function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    try {
      const now = new Date().toISOString(), id = crypto.randomUUID();
      const mission:MissionSnapshot = {id,title:title.trim(),goal:goal.trim(),nextStep:nextStep.trim(),notes:"",stage:"planned",tasks:[],decisions:[],artifacts:[],miniApps:[],templateSource:null,reflection:null,updatedAt:now};
      const created:CloudRecord = {id,mission,revision:1,ownerId:crypto.randomUUID(),createdAt:now,updatedAt:now,deletedAt:null};
      current.current = created; setRecord(created);
    } catch(reason) { setError(reason instanceof Error ? reason.message : "Could not create the local mission."); }
  }

  async function save(mission:MissionSnapshot,revision:number) {
    const prior = current.current;
    if (!prior || prior.id !== mission.id || prior.revision !== revision) throw new Error("The mission revision changed. Review it again.");
    const saved:CloudRecord = {...prior,mission,revision:revision+1,updatedAt:new Date().toISOString()};
    current.current = saved; setRecord(saved);
    return saved;
  }

  async function complete(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const prior = current.current;
    if (!prior) return;
    const now = new Date().toISOString();
    try {
      await save({...prior.mission,stage:"complete",updatedAt:now,reflection:{outcome,rating:4,friction:[],lesson:lesson.trim(),repeat:"yes",personalMemory:null,reviewedAt:now}},prior.revision);
    } catch(reason) { setError(reason instanceof Error ? reason.message : "Could not save the review."); }
  }

  return <main className="min-h-screen bg-[#08111f] px-5 py-8 text-slate-100 sm:px-10">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-4"><Link className="text-sm font-semibold tracking-[0.2em] text-cyan-200" href="/">SAATHI</Link><span className="rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-2 text-xs text-amber-100">Local review lab · session only</span></div>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight sm:text-4xl">Try the learning and approval loop.</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Use your own small goal to try a plan and a reviewed memory without cloud keys. This page stores data in memory for this session. Reloading clears it. Open the cloud workspace for account sync.</p>
      {!record ? <form className="mt-8 max-w-2xl rounded-3xl border border-white/10 bg-white/[0.05] p-6" onSubmit={create}>
        <label className="block text-sm text-slate-300">Mission title<input className="field" value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} required /></label>
        <label className="mt-4 block text-sm text-slate-300">Goal<textarea className="field" value={goal} onChange={event=>setGoal(event.target.value)} maxLength={2000} required /></label>
        <label className="mt-4 block text-sm text-slate-300">Next step<input className="field" value={nextStep} onChange={event=>setNextStep(event.target.value)} maxLength={400} /></label>
        <button className="primary-button mt-5" type="submit">Create my local mission</button>
      </form> : <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
          <p className="text-xs text-cyan-200">Saved mission · revision {record.revision}</p><h2 className="mt-3 text-xl font-semibold">{record.mission.title}</h2><p className="mt-3 text-sm text-slate-400">{record.mission.goal}</p>
          <p className="mt-4 text-sm text-slate-300">Next: {record.mission.nextStep||"Suggest a plan in Agent Room."}</p>
          <ul className="mt-4 space-y-2">{record.mission.tasks.map(task=><li key={task.id} className="rounded-xl bg-black/10 p-3 text-sm">{task.title}</li>)}</ul>
          {record.mission.tasks.length===0 && <p className="mt-4 text-xs text-slate-500">Open Agent Room and approve a plan to see tasks here.</p>}
        </article>
        <form className="rounded-3xl border border-white/10 bg-white/[0.05] p-6" onSubmit={complete}>
          <h2 className="font-semibold">Complete and review your mission</h2><p className="mt-2 text-xs leading-5 text-slate-400">Write a real lesson, save it, then open Learning Ledger to publish it with consent.</p>
          <label className="mt-4 block text-sm">Outcome<select className="field" value={outcome} onChange={event=>setOutcome(event.target.value as typeof outcome)}><option value="achieved">Achieved</option><option value="partial">Partial</option><option value="blocked">Blocked</option></select></label>
          <label className="mt-4 block text-sm">Reviewed lesson<textarea className="field min-h-24" value={lesson} onChange={event=>setLesson(event.target.value)} maxLength={1000} required /></label>
          <button type="submit" className="primary-button mt-4">Save completed review</button>
        </form>
      </section>}
      {error && <p className="mt-4 text-sm text-amber-200" role="alert">{error}</p>}
      <ReviewWorkspace records={record?[record]:[]} selectedRecord={record} syncStatus="Local session" mode="session" onSaveAction={save} />
    </div>
  </main>;
}
