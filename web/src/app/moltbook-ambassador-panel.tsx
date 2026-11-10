"use client";
import {useEffect,useRef,useState,type ChangeEvent} from "react";
import {validatePublicResearchCapsule,createPublicResearchArtifact,type PublicResearchCapsule} from "../../../public-research.mjs";

export default function MoltbookAmbassadorPanel({missionTitle,canImport,disabled,onImportAction}:{missionTitle:string|null;canImport:boolean;disabled:boolean;onImportAction?:(capsule:PublicResearchCapsule)=>Promise<void>}){
  const [capsule,setCapsule]=useState<PublicResearchCapsule|null>(null),[approved,setApproved]=useState(false),[reading,setReading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const epoch=useRef(0);
  useEffect(()=>()=>{epoch.current++;},[]);
  async function choose(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0],generation=++epoch.current;event.target.value="";
    setCapsule(null);setApproved(false);setError(null);setNotice(null);setReading(false);
    if(!file)return;
    if(file.size>64*1024){setError("Research files must be smaller than 64 KB.");return;}
    setReading(true);
    try{
      let raw:unknown;try{raw=JSON.parse(await file.text());}catch{throw new Error("Choose a valid public research JSON file.");}
      const checked=validatePublicResearchCapsule(raw);
      createPublicResearchArtifact(checked,{newId:()=>checked.id});
      if(generation===epoch.current)setCapsule(checked);
    }catch(reason){if(generation===epoch.current)setError(reason instanceof Error?reason.message:"The research file could not be validated.");}
    finally{if(generation===epoch.current)setReading(false);}
  }
  async function importReference(){
    if(!capsule||!approved||!onImportAction||saving||disabled)return;
    const generation=epoch.current;setSaving(true);setError(null);
    try{await onImportAction(capsule);if(generation===epoch.current){setCapsule(null);setApproved(false);setNotice("Saved as an unverified external reference. It is not approved memory or executable code.");}}
    catch(reason){if(generation===epoch.current)setError(reason instanceof Error?reason.message:"The reference could not be saved.");}
    finally{if(generation===epoch.current)setSaving(false);}
  }
  return <section className="mb-5 rounded-3xl border border-violet-200/20 bg-violet-100/[0.04] p-5 sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Moltbook Ambassador · public research only</p>
    <h3 className="mt-2 text-xl font-semibold">Bring ideas back with their sources.</h3>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Open the separate reader, select public discussions and download a research file. Return here to review and save it as a reference. Your mission, notes and memory are never passed to the reader. This role does not post, discuss your private problem, bypass verification or run code.</p>
    <a href="/community/moltbook" rel="noreferrer" className="secondary-button mt-4 inline-block">Open public research reader ↗</a>
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4">
      <p className="text-sm text-slate-300">{canImport&&missionTitle?`Private destination: ${missionTitle}`:"Select a saved mission in the private workspace to import a reference."}</p>
      <label className="mt-4 block text-sm text-slate-300">Public research JSON<input type="file" accept="application/json,.json" className="field" disabled={!canImport||disabled||reading||saving} onChange={event=>void choose(event)}/></label>
      {reading&&<p role="status" className="mt-3 text-xs text-slate-400">Checking source and size…</p>}
      {capsule&&<div className="mt-4 space-y-3"><p className="text-xs text-amber-200">Unverified Moltbook content · {capsule.items.length} sources · exported {capsule.exportedAt}</p>{capsule.items.map(item=><details key={item.id} className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer break-words text-sm">{item.title}</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{item.content}</p><p className="mt-3 break-all text-xs text-slate-500">Source: {item.url} · {item.author} · {item.community}</p></details>)}
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 accent-violet-300" checked={approved} disabled={disabled||saving} onChange={event=>setApproved(event.target.checked)}/>I reviewed these sources and want to save them only as unverified reference material.</label>
      <button type="button" className="primary-button" disabled={!approved||disabled||saving||!canImport} onClick={()=>void importReference()}>{saving?"Saving encrypted reference…":"Save reference to private mission"}</button></div>}
      <p className="mt-4 text-xs leading-5 text-slate-500">Incoming community text stays untrusted. Importing does not change approved memory, create tasks or train a model. The next saved mission revision will mark older plans stale.</p>
      {error&&<p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm text-cyan-200">{notice}</p>}
    </div>
  </section>;
}
