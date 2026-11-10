"use client";

import { useState, type ReactNode } from "react";
import type { MissionSnapshot } from "@/lib/saathi-cloud";

type Surface = "inbox" | "build" | "learn" | "data" | "review" | "agent" | "ledger" | "tools" | "handoff";

const surfaces: Array<{ id: Surface; label: string; hint: string }> = [
  { id: "inbox", label: "Mission Inbox", hint: "Capture an outcome" },
  { id: "build", label: "Build Studio", hint: "Edit and preview" },
  { id: "learn", label: "Learning Room", hint: "Get a useful hint" },
  { id: "data", label: "Data Lens", hint: "Ask read-only SQL" },
  { id: "review", label: "Review Room", hint: "Verify an output" },
  { id: "agent", label: "Agent Room", hint: "Review proposals" },
  { id: "ledger", label: "Learning Ledger", hint: "Approve memories" },
  { id: "tools", label: "Tool Studio", hint: "Reuse a workflow" },
  { id: "handoff", label: "Handoff Center", hint: "Continue anywhere" },
];

export default function UnifiedSurfaces({
  mission,
  missionCount,
  syncStatus,
  agentPanel,
  ledgerPanel,
  learningPanel,
}: {
  mission: MissionSnapshot | null;
  missionCount: number;
  syncStatus: string;
  agentPanel?: ReactNode;
  ledgerPanel?: ReactNode;
  learningPanel?: ReactNode;
}) {
  const [active, setActive] = useState<Surface>("inbox");
  const reflection = mission?.reflection ?? null;
  const privateMode = syncStatus === "Encrypted on this device";

  return <section className="mt-8 rounded-3xl border border-cyan-200/15 bg-gradient-to-br from-cyan-100/[0.07] via-white/[0.04] to-violet-200/[0.06] p-5 sm:p-6">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">SAATHI OS layer</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">One mission, nine connected surfaces.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">The productivity hub, tutor, builder, reviewer, memory and device handoff use the same mission passport. This shell keeps each AI action reviewable before it changes your work.</p>
      </div>
      <span className="rounded-full border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-300">{missionCount} missions · {syncStatus}</span>
    </div>
    <div className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {surfaces.map((surface) => <button key={surface.id} type="button" className={`rounded-2xl border px-3 py-3 text-left transition ${active === surface.id ? "border-cyan-200/40 bg-cyan-200/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"}`} onClick={() => setActive(surface.id)}><span className="block text-sm font-semibold text-slate-100">{surface.label}</span><span className="mt-1 block text-[11px] text-slate-500">{surface.hint}</span></button>)}
    </div>
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-4 sm:p-5">
      {active === "inbox" && <SurfacePanel title="Capture anything that deserves continuity" body="Turn a study goal, coding idea, receipt process or daily routine into a mission. Phone capture and laptop execution share the same passport." items={["Text, voice, photo and file capture are planned adapters.", mission ? `Selected: ${mission.title}` : "Choose a mission to attach context.", "Next action stays visible across devices."]} />}
      {active === "build" && <SurfacePanel title="Build Studio for the larger screen" body="A coding mission can keep files, preview notes and reviewed changes beside its goal. The first release keeps generated changes proposal-only." items={[`${mission?.artifacts.length ?? 0} artifacts attached to this mission`, "Desktop editor and isolated preview are the next adapter.", "Every change points back to a mission revision."]} badge="Laptop-ready boundary" />}
      {active === "learn" && (learningPanel ?? <SurfacePanel title="Learning Room that adapts with consent" body="Tutor hints use selected mission evidence and approved memories. Corrections become reviewable candidates instead of invisible training data." items={["Explain → hint → attempt → evidence", "Hinglish and multilingual prompts can share the same source set.", "Approved preferences can tune future explanations."]} badge="Evidence-first" />)}
      {active === "data" && <SurfacePanel title="Data Lens for safe questions" body="A future connector will turn plain-language questions into read-only, reviewable SQL with a source and visualization attached." items={["Only SELECT/CTE templates are allowed by the contract.", "Parameters and chart type are visible before execution.", "Database credentials stay server-side and scoped."]} badge="Read-only by default" />}
      {active === "review" && <SurfacePanel title="Review Room for trustworthy output" body="Code, data and mini-app results can be checked against the mission evidence before they become reusable work." items={["Correctness, security and maintainability findings.", "Findings stay tied to the exact revision reviewed.", "Failed checks never report success."]} badge="Revision-aware" />}
      {active === "agent" && (agentPanel ?? <SurfacePanel title="Agents propose; you decide" body="Planner, tutor, builder, reviewer and learner agents will return typed proposals tied to a mission revision." items={["Planner → editable checklist", "Tutor → hints grounded in your work", "Builder/reviewer → mini-app or artifact proposal"]} badge="Proposal-only foundation ready" />)}
      {active === "ledger" && (ledgerPanel ?? <SurfacePanel title="Learning with evidence" body="A completed mission can produce a memory candidate. Only approved, relevant and non-sensitive context can influence future suggestions." items={[reflection ? `Latest review: ${reflection.outcome} · usefulness ${reflection.rating}/5` : "Complete a mission to record an outcome and lesson.", reflection?.personalMemory ? "An optional personal memory is waiting for your review." : "No personal memory is active without consent.", "Forget remains available in the Learning Ledger."]} badge="User-controlled" />)}
      {active === "tools" && <SurfacePanel title="Task → workflow → tool" body="Approved work can become a constrained mini-app instead of being rebuilt from zero." items={[`${mission?.miniApps.length ?? 0} mini-apps attached to this mission`, "Tracker, quiz and invoice renderers are validated locally.", "Prompt-to-tool generation stays reviewable and sandboxed."]} badge="Schema-driven" />}
      {active === "handoff" && <SurfacePanel title={privateMode?"Your private vault stays on this device":"Continue from the device you have"} body={privateMode?"Private mode does not upload or synchronize this mission. A separate cloud workspace requires your explicit choice to send its data to Supabase. Encrypted device-to-device transfer is a future feature.":"The mission state is cloud-bound once Supabase is configured. Device capability decides whether you capture, review, build or run a local companion."} items={privateMode?["Encrypted storage belongs to this browser", "Cloud workspace is separate", "No automatic transfer to another device"]:["Phone: capture and approvals", "Tablet: learning and review", "Laptop: editor, previews and builds"]} badge={privateMode?"Device-only":syncStatus === "Synced" ? "Cloud state ready" : "Cloud setup required"} />}
    </div>
  </section>;
}

function SurfacePanel({ title, body, items, badge }: { title: string; body: string; items: string[]; badge?: string }) {
  return <div><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="text-lg font-semibold text-slate-100">{title}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{body}</p></div>{badge && <span className="rounded-full border border-cyan-200/20 bg-cyan-100/10 px-3 py-2 text-[11px] font-medium text-cyan-100">{badge}</span>}</div><ul className="mt-4 grid gap-2 sm:grid-cols-3">{items.map((item) => <li key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-xs leading-5 text-slate-300">{item}</li>)}</ul></div>;
}
