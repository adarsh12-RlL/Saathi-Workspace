"use client";

import type { MissionReflection } from "@/lib/saathi-cloud";

const frictionOptions: Array<{ value: MissionReflection["friction"][number]; label: string }> = [
  { value: "scope", label: "Scope was too large" },
  { value: "time", label: "It took longer than expected" },
  { value: "clarity", label: "The definition of done was unclear" },
  { value: "skill", label: "I needed a missing skill" },
  { value: "tooling", label: "A tool or setup slowed me down" },
  { value: "none", label: "No meaningful friction" },
];

function defaultReflection(): MissionReflection {
  return {
    outcome: "achieved",
    rating: 3,
    friction: [],
    lesson: "",
    repeat: "maybe",
    personalMemory: null,
    reviewedAt: new Date().toISOString(),
  };
}

function suggestion(reflection: MissionReflection) {
  if (reflection.friction.includes("scope")) return "For the next run, split the mission into smaller milestones before you start.";
  if (reflection.friction.includes("clarity")) return "For the next run, add a clear definition of done to the first step.";
  if (reflection.friction.includes("time")) return "For the next run, reserve a smaller time box and review it before expanding scope.";
  if (reflection.repeat === "yes") return "This mission is a good candidate for a repeatable workflow.";
  return "Your review becomes evidence for better future mission suggestions.";
}

export default function MissionReview({
  value,
  onChange,
  onRepeat,
}: {
  value: MissionReflection | null;
  onChange: (value: MissionReflection) => void;
  onRepeat?: () => void;
}) {
  const reflection = value ?? defaultReflection();

  function update(patch: Partial<MissionReflection>) {
    onChange({ ...reflection, ...patch, reviewedAt: new Date().toISOString() });
  }

  function toggleFriction(item: MissionReflection["friction"][number]) {
    const selected = reflection.friction.includes(item);
    if (item === "none") {
      update({ friction: selected ? [] : ["none"] });
      return;
    }
    const next = selected
      ? reflection.friction.filter((entry) => entry !== item && entry !== "none")
      : [...reflection.friction.filter((entry) => entry !== "none"), item];
    update({ friction: next });
  }

  return <section className="mt-6 rounded-3xl border border-cyan-200/20 bg-cyan-100/[0.06] p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Learning review</p>
        <h3 className="mt-2 text-lg font-semibold">What should SAATHI carry forward?</h3>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">This is a user-approved learning signal. It improves future suggestions as personal context; it does not silently retrain a model.</p>
      </div>
      {onRepeat && <button className="secondary-button shrink-0" type="button" onClick={onRepeat}>Start repeat mission</button>}
    </div>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      <label className="block text-sm text-slate-300">Outcome<select className="field" value={reflection.outcome} onChange={(event) => update({ outcome: event.target.value as MissionReflection["outcome"] })}><option value="achieved">Achieved</option><option value="partial">Partly achieved</option><option value="blocked">Blocked</option></select></label>
      <label className="block text-sm text-slate-300">Usefulness<select className="field" value={reflection.rating} onChange={(event) => update({ rating: Number(event.target.value) as MissionReflection["rating"] })}><option value="1">1 · low</option><option value="2">2</option><option value="3">3 · okay</option><option value="4">4</option><option value="5">5 · high</option></select></label>
      <label className="block text-sm text-slate-300">Would you repeat this workflow?<select className="field" value={reflection.repeat} onChange={(event) => update({ repeat: event.target.value as MissionReflection["repeat"] })}><option value="yes">Yes</option><option value="maybe">Maybe</option><option value="no">No</option></select></label>
    </div>
    <fieldset className="mt-5">
      <legend className="text-sm text-slate-300">What caused friction?</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {frictionOptions.map((option) => <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-3 text-sm text-slate-300"><input className="mt-1 accent-cyan-300" type="checkbox" checked={reflection.friction.includes(option.value)} onChange={() => toggleFriction(option.value)} /><span>{option.label}</span></label>)}
      </div>
    </fieldset>
    <label className="mt-5 block text-sm text-slate-300">Lesson for the next run<textarea className="field min-h-24 resize-y" maxLength={2000} placeholder="What did you learn from the result?" value={reflection.lesson} onChange={(event) => update({ lesson: event.target.value })} /></label>
    <label className="mt-5 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-300"><input className="mt-1 accent-cyan-300" type="checkbox" disabled={!reflection.lesson.trim()} checked={reflection.personalMemory !== null} onChange={(event) => update({ personalMemory: event.target.checked ? reflection.lesson.trim() : null })} /><span><span className="font-medium text-slate-100">Remember this for future suggestions</span><span className="mt-1 block text-xs leading-5 text-slate-400">Write a lesson first. Only text you approve becomes a pending personal memory candidate.</span></span></label>
    {reflection.personalMemory !== null && <label className="mt-3 block text-sm text-slate-300">Approved memory<textarea className="field min-h-20 resize-y" maxLength={1000} value={reflection.personalMemory} onChange={(event) => update({ personalMemory: event.target.value })} /></label>}
    <p className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-xs leading-5 text-cyan-100">{suggestion(reflection)}</p>
  </section>;
}
