"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation applies the private-mode CSP. */
import {useState} from "react";
import dynamic from "next/dynamic";
const WorkspaceClient=dynamic(()=>import("../workspace-client"),{ssr:false});
export default function CloudOptIn(){
  const [allowed,setAllowed]=useState(false),[confirmed,setConfirmed]=useState(false);
  if(allowed)return <WorkspaceClient/>;
  return <main className="mx-auto max-w-xl px-5 py-20"><p className="text-xs uppercase tracking-widest text-amber-200">Separate cloud workspace</p><h1 className="mt-4 text-3xl font-semibold">Cloud sync sends data off this device.</h1><p className="mt-5 text-sm leading-6 text-slate-400">Supabase receives the cloud account, missions and reviews you save here. Your private vault is separate and is never automatically uploaded. External AI providers and communities remain disconnected.</p><label className="mt-6 flex gap-3 text-sm"><input type="checkbox" className="accent-cyan-300" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I want to use the separate Supabase cloud workspace.</label><button type="button" className="primary-button mt-6" disabled={!confirmed} onClick={()=>setAllowed(true)}>Continue to cloud sign in</button><a href="/" className="mt-6 block text-sm text-cyan-200" rel="noreferrer">Return to private workspace</a></main>;
}
