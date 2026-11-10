"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Privacy mode changes require full document navigation so the new CSP is applied. */

import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import type {CloudRecord,MissionSnapshot} from "../../../cloud/index.mjs";
import {PRIVATE_VAULT_KEY,createPrivateVaultStore,type PrivateVaultStore} from "../../../private-vault.mjs";
import {createPrivateWorkspace,emptyPrivateWorkspace,validatePrivateWorkspace,type PrivateWorkspace,type PrivateWorkspaceState} from "../../../private-workspace.mjs";
import {AGENT_CATALOG,buildPrivateAgentContext,type PrivateAgentContext,type PrivateProfile} from "../../../agent-council.mjs";
import {projectLearningLedger} from "../../../memory-review.mjs";
import {readPublicResearchArtifact} from "../../../public-research.mjs";
import ReviewWorkspace from "./review-workspace";

function errorText(reason:unknown){return reason instanceof Error?reason.message:"The private operation could not be saved.";}

export default function PrivateWorkspaceClient(){
  const vault=useRef<PrivateVaultStore|null>(null),controller=useRef<PrivateWorkspace|null>(null);
  const [active,setActive]=useState<PrivateWorkspace|null>(null);
  const [ready,setReady]=useState(false),[hasVault,setHasVault]=useState(false),[state,setState]=useState<PrivateWorkspaceState|null>(null);
  const [passphrase,setPassphrase]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(null),[dirty,setDirty]=useState(false);
  const lock=useCallback(()=>{
    controller.current?.lock();controller.current=null;vault.current?.lock();
    setActive(null);setState(null);setSelectedId(null);setDirty(false);setPassphrase("");setError(null);
  },[]);
  useEffect(()=>{
    let mounted=true;
    void Promise.resolve().then(()=>{
      if(!mounted)return;
      try {vault.current=createPrivateVaultStore(window.localStorage);setHasVault(vault.current.hasVault());setReady(true);}
      catch(reason){setError(errorText(reason));setReady(false);}
    });
    return()=>{mounted=false;controller.current?.lock();controller.current=null;vault.current?.lock();};
  },[]);
  useEffect(()=>{
    if(!active)return;
    return active.subscribe(()=>setState(active.getState()));
  },[active]);
  useEffect(()=>{
    if(!active)return;
    let timer:ReturnType<typeof setTimeout>;
    const reset=()=>{clearTimeout(timer);timer=setTimeout(lock,5*60_000);};
    const hidden=()=>{if(document.visibilityState==="hidden")lock();};
    const changed=(event:StorageEvent)=>{if(event.key===PRIVATE_VAULT_KEY||event.key===null)lock();};
    reset();window.addEventListener("pointerdown",reset);window.addEventListener("keydown",reset);window.addEventListener("storage",changed);document.addEventListener("visibilitychange",hidden);
    return()=>{clearTimeout(timer);window.removeEventListener("pointerdown",reset);window.removeEventListener("keydown",reset);window.removeEventListener("storage",changed);document.removeEventListener("visibilitychange",hidden);};
  },[active,lock]);

  async function unlock(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||!vault.current)return;setBusy(true);setError(null);
    const secret=passphrase;setPassphrase("");
    try {
      const payload=hasVault?await vault.current.unlock(secret):await vault.current.create(emptyPrivateWorkspace(),secret);
      if(document.visibilityState==="hidden"){vault.current.lock();throw new Error("Keep this page visible while unlocking the private vault.");}
      const checked=validatePrivateWorkspace(payload),active=createPrivateWorkspace(vault.current,checked);
      controller.current=active;setActive(active);setHasVault(true);setState(active.getState());setSelectedId(checked.records[0]?.id??null);
    }catch(reason){vault.current?.lock();setError(errorText(reason));}
    finally{setBusy(false);}
  }
  const record=state?.records.find(item=>item.id===selectedId&&!item.deletedAt)??null;
  async function run(action:()=>Promise<void>){setBusy(true);setError(null);try{await action();}catch(reason){if(!vault.current?.isUnlocked())lock();setError(errorText(reason));throw reason;}finally{setBusy(false);}}
  async function save(mission:MissionSnapshot,revision:number){
    if(!controller.current)throw new Error("Unlock the vault first.");
    const saved=await controller.current.save(mission,revision);setDirty(false);return saved;
  }
  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-center justify-between gap-4"><a href="/" className="text-sm font-semibold tracking-[0.2em] text-cyan-200">SAATHI</a><div className="flex items-center gap-3"><span className="rounded-full border border-cyan-200/20 bg-cyan-100/5 px-3 py-2 text-xs text-cyan-100">Private · this device</span>{state&&<button type="button" className="secondary-button" onClick={lock}>Lock workspace</button>}</div></header>
    <h1 className="mt-10 text-3xl font-semibold tracking-tight sm:text-4xl">Your mission. One private team.</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Keep your goals, reviewed lessons and agent preferences together. Private mode uses local rules and encrypted device storage. Cloud, external AI and communities are disconnected.</p>
    {!state ? <form onSubmit={unlock} className="mt-8 max-w-xl rounded-3xl border border-cyan-200/15 bg-white/[0.04] p-6" autoComplete="off">
      <h2 className="text-xl font-semibold">{!ready?"Checking device storage…":hasVault?"Unlock your private vault":"Create your private vault"}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">A passphrase encrypts missions, memory decisions and team plans on this browser. Reload and unlock to continue. Keep the passphrase safe: SAATHI has no reset or recovery key.</p>
      <p className="mt-3 text-xs leading-5 text-cyan-200/80">The workspace locks when this page is hidden or after five minutes without interaction.</p>
      <label className="mt-5 block text-sm">Vault passphrase<input type="password" className="field" value={passphrase} onChange={event=>setPassphrase(event.target.value)} minLength={12} maxLength={1024} required autoComplete={hasVault?"current-password":"new-password"} spellCheck={false} disabled={busy||!ready}/></label>
      <button className="primary-button mt-5" type="submit" disabled={busy||!ready}>{busy?"Opening encrypted vault…":hasVault?"Unlock on this device":"Create encrypted vault"}</button>
      <p className="mt-4 text-xs leading-5 text-slate-500">This page blocks app fetches, WebSockets and form submissions. Local app assets still load. Device extensions, a compromised browser, screenshots and the hosting server are outside this app boundary. Clearing browser storage deletes the vault.</p>
    </form> : active&&<>
      <section className="mt-8 grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="space-y-5"><section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><h2 className="font-semibold">Missions</h2><p className="mt-2 text-xs leading-5 text-slate-400">Save edits before switching. Everything here belongs to this device vault.</p><div className="mt-4 space-y-2">{state.records.map(item=><button key={item.id} type="button" disabled={dirty||busy} className={`w-full rounded-xl border p-3 text-left text-sm disabled:opacity-40 ${item.id===selectedId?"border-cyan-200/40 bg-cyan-200/10":"border-white/10"}`} onClick={()=>setSelectedId(item.id)}>{item.mission.title}<span className="mt-1 block text-xs text-slate-500">{item.mission.stage} · r{item.revision}</span></button>)}</div></section>
        <NewMission disabled={busy||dirty} onCreateAction={async mission=>{await run(async()=>{const created=await active.create(mission);setSelectedId(created.id);});}}/>
        </div>
        {record?<MissionEditor key={`${record.id}:${record.revision}`} record={record} disabled={busy} onDirtyAction={()=>setDirty(true)} onResetAction={()=>setDirty(false)} onSaveAction={async mission=>{await run(async()=>{await save(mission,record.revision);});}}/>:<section className="rounded-3xl border border-dashed border-white/15 p-8 text-sm text-slate-400">Create a mission, ask the private team for plans, then approve the changes you want.</section>}
      </section>
      <PrivateCouncil state={state} record={record} disabled={busy||dirty} onProfileAction={async profile=>{await run(()=>active.setProfile(profile));}}/>
      <ReviewWorkspace records={state.records} selectedRecord={record} syncStatus="Encrypted on this device" mode="private" privateBackend={active} editorDirty={dirty||busy} onSaveAction={save} onImportResearchAction={async capsule=>{if(!record||dirty)throw new Error("Select and save a mission first.");await run(async()=>{await active.importResearch(capsule,record.id,record.revision);});}} privateAgents={{proposals:state.proposals,onPlanAction:async()=>{if(!record)throw new Error("Choose a saved mission first.");await run(async()=>{await active.plan(record.id,record.revision);});},onAcceptAction:async proposal=>{await run(async()=>{await active.apply(proposal);});},onRejectAction:async proposal=>{await run(()=>active.reject(proposal));}}}/>
    </>}
    {error&&<p role="alert" className="mt-5 text-sm text-amber-200">{error}</p>}
    <p className="mt-8 text-xs leading-6 text-slate-400"><a href="/community/moltbook" rel="noreferrer" className="text-cyan-200">Moltbook community reader</a> · Separate public discussions, off until you choose to load. Your private vault is never passed to this page.</p>
    <footer className="mt-10 border-t border-white/10 pt-5 text-xs leading-6 text-slate-500"><p>Local rules personalize checklists from your approved memory; model training and autonomous code execution are not connected.</p><p>Private mode has no device sync. <a href="/cloud" rel="noreferrer" className="text-cyan-200">Cloud workspace and sharing choice</a> · <a href="/review-lab" rel="noreferrer" className="text-cyan-200">Temporary review lab</a></p><p>No external agent community has been joined. Connecting one requires its name, membership identity and a separate choice about what leaves the device.</p></footer>
  </div></main>;
}

function NewMission({disabled,onCreateAction}:{disabled:boolean;onCreateAction:(mission:MissionSnapshot)=>Promise<void>}){
  const [title,setTitle]=useState(""),[goal,setGoal]=useState(""),[error,setError]=useState<string|null>(null),[working,setWorking]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setWorking(true);setError(null);try{const at=new Date().toISOString();await onCreateAction({id:crypto.randomUUID(),title:title.trim(),goal:goal.trim(),notes:"",nextStep:"",stage:"captured",tasks:[],decisions:[],artifacts:[],miniApps:[],updatedAt:at,templateSource:null,reflection:null});setTitle("");setGoal("");}catch(reason){setError(errorText(reason));}finally{setWorking(false);}}
  return <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><h2 className="font-semibold">New mission</h2><label className="mt-4 block text-sm">Title<input className="field" value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} required disabled={disabled||working}/></label><label className="mt-3 block text-sm">Goal<textarea className="field" value={goal} onChange={event=>setGoal(event.target.value)} maxLength={2000} required disabled={disabled||working}/></label><button type="submit" className="primary-button mt-4" disabled={disabled||working}>Save mission</button>{error&&<p role="alert" className="mt-3 text-xs text-amber-200">{error}</p>}</form>;
}
function MissionEditor({record,disabled,onDirtyAction,onResetAction,onSaveAction}:{record:CloudRecord;disabled:boolean;onDirtyAction:()=>void;onResetAction:()=>void;onSaveAction:(mission:MissionSnapshot)=>Promise<void>}){
  const [draft,setDraft]=useState(record.mission),[lesson,setLesson]=useState(record.mission.reflection?.lesson??""),[error,setError]=useState<string|null>(null),[working,setWorking]=useState(false);
  const references=record.mission.artifacts.flatMap(artifact=>{const capsule=readPublicResearchArtifact(artifact);return capsule?[{artifactId:artifact.id,capsule}]:[];});
  function edit(patch:Partial<MissionSnapshot>){setDraft(current=>({...current,...patch}));onDirtyAction();}
  async function persist(complete:boolean){setWorking(true);setError(null);try{const at=new Date().toISOString();if(complete&&!lesson.trim())throw new Error("Write a reviewed lesson before completing.");await onSaveAction({...draft,updatedAt:at,stage:complete?"complete":draft.stage,reflection:lesson.trim()?{outcome:"achieved",rating:4,friction:[],lesson:lesson.trim(),repeat:"yes",personalMemory:null,reviewedAt:at}:null});}catch(reason){setError(errorText(reason));}finally{setWorking(false);}}
  return <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-xs text-cyan-200">Saved mission · revision {record.revision}</p><h2 className="mt-2 text-xl font-semibold">Mission passport</h2><fieldset disabled={disabled||working}>
    <label className="mt-5 block text-sm">Title<input className="field" value={draft.title} onChange={event=>edit({title:event.target.value})} maxLength={120}/></label><label className="mt-4 block text-sm">Goal<textarea className="field" value={draft.goal} onChange={event=>edit({goal:event.target.value})} maxLength={2000}/></label><label className="mt-4 block text-sm">Next step<input className="field" value={draft.nextStep} onChange={event=>edit({nextStep:event.target.value})} maxLength={400}/></label><label className="mt-4 block text-sm">Private notes<textarea className="field" value={draft.notes} onChange={event=>edit({notes:event.target.value})} maxLength={12000}/></label>
    <div className="mt-5 space-y-2">{draft.tasks.map(task=><label key={task.id} className="flex gap-3 rounded-xl bg-black/20 p-3 text-sm"><input type="checkbox" className="accent-cyan-300" checked={task.done} onChange={event=>edit({tasks:draft.tasks.map(item=>item.id===task.id?{...item,done:event.target.checked}:item)})}/>{task.title}</label>)}</div>
    {references.length>0&&<section className="mt-5 rounded-2xl border border-violet-200/20 p-4"><h3 className="text-sm font-semibold text-violet-200">Saved public research · unverified</h3><p className="mt-2 text-xs leading-5 text-slate-400">Encrypted references, excluded from internal team context and approved memory. Source labels do not authenticate community claims.</p>{references.map(({artifactId,capsule})=><details key={artifactId} className="mt-3 rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-sm">Moltbook · {capsule.items.length} sources · {capsule.exportedAt}</summary>{capsule.items.map(item=><article key={item.id} className="mt-4"><h4 className="break-words text-sm font-semibold">{item.title}</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{item.content}</p><p className="mt-2 break-all text-xs text-slate-500">{item.url} · {item.author} · {item.community}</p></article>)}</details>)}</section>}
    <label className="mt-5 block text-sm">Reviewed lesson<textarea className="field" value={lesson} onChange={event=>{setLesson(event.target.value);onDirtyAction();}} maxLength={1000}/></label>
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" className="primary-button" onClick={()=>void persist(false)}>Save mission edits</button><button type="button" className="secondary-button" onClick={()=>void persist(true)}>Complete and save review</button><button type="button" className="secondary-button" onClick={()=>{setDraft(record.mission);setLesson(record.mission.reflection?.lesson??"");setError(null);onResetAction();}}>Discard edits</button></div></fieldset>{error&&<p role="alert" className="mt-4 text-sm text-amber-200">{error}</p>}</section>;
}
function PrivateCouncil({state,record,disabled,onProfileAction}:{state:PrivateWorkspaceState;record:CloudRecord|null;disabled:boolean;onProfileAction:(profile:PrivateProfile)=>Promise<void>}){
  const [context,setContext]=useState<PrivateAgentContext|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{let active=true;void projectLearningLedger(state.signals,state.decisions).then(ledger=>{if(active){setContext(record?buildPrivateAgentContext(record.mission,record.revision,ledger.entries.map(entry=>entry.candidate),state.profile):null);setError(null);}}).catch(reason=>{if(active){setContext(null);setError(errorText(reason));}});return()=>{active=false;};},[state,record]);
  async function profile(patch:Partial<PrivateProfile>){try{await onProfileAction({...state.profile,...patch});}catch(reason){setError(errorText(reason));}}
  return <section className="mt-8 rounded-3xl border border-cyan-200/15 bg-cyan-100/[0.03] p-6"><p className="text-xs uppercase tracking-widest text-cyan-200">Internal agent team</p><h2 className="mt-2 text-2xl font-semibold">Shared context, less repetition.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{AGENT_CATALOG.length} role definitions: four local checklist generators, four local checks and four unconnected specialist adapters. The Ambassador opens a separate public reader without mission context. Specialist AI models remain unconnected.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">Preferred language<select className="field" value={state.profile.language} disabled={disabled} onChange={event=>void profile({language:event.target.value as PrivateProfile["language"]})}><option value="hinglish">Hinglish</option><option value="hindi">Hindi</option><option value="english">English</option></select></label><label className="text-sm">Explanation style<select className="field" value={state.profile.responseStyle} disabled={disabled} onChange={event=>void profile({responseStyle:event.target.value as PrivateProfile["responseStyle"]})}><option value="concise">Concise</option><option value="detailed">Detailed</option></select></label></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{AGENT_CATALOG.map(agent=><article key={agent.id} className="rounded-2xl border border-white/10 bg-black/10 p-4"><h3 className="font-semibold">{agent.label}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{agent.purpose}</p><p className={`mt-3 text-xs ${agent.runtimeStatus==="not_connected"?"text-amber-200":"text-cyan-200"}`}>{agent.runtimeStatus.replaceAll("_"," ")}</p></article>)}</div>
    <details className="mt-5 rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer text-sm">Context shared inside this device · {context?.memories.length??0} approved memories</summary><p className="mt-3 text-xs leading-5 text-slate-400">Selected mission goal, next step, revision and your preferences. Pending, rejected, forgotten, expired, sensitive and other-mission memories are excluded. Relevant global memories and explicitly approved global preferences may be reused.</p>{context?.memories.map(memory=><p key={memory.id} className="mt-3 text-sm">{memory.statement}<span className="mt-1 block break-all text-xs text-slate-500">Approved source: {memory.id} · {memory.evidence.length} evidence references</span></p>)}</details>{error&&<p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
  </section>;
}
