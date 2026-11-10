import { validateInstance, validateData, makeInstance } from "./mini-app-engine.mjs";
import { createMiniAppStudio } from "./mini-app-studio.mjs";

"use strict";
(() => {
  const STORAGE = "saathi.workspace.v1";
  const SCHEMA = "saathi.mission-passport";
  const $ = id => document.getElementById(id);
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = () => new Date().toISOString();
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const stages = ["captured", "planned", "working", "complete"];
  const maxItems = 100;
  const MAX_PASSPORT_BYTES = 10 * 1024 * 1024;
  let storageError = false;
  let recoveryBlocked = false;
  let storageSnapshot = null;

  function makeMission(title, goal) {
    return { id: uid(), title, goal, notes: "", nextStep: "Choose the first small step.", stage: "captured", tasks: [], decisions: [], artifacts: [], miniApps: [], updatedAt: now(), templateSource: null };
  }
  function sampleState() {
    const mission = makeMission("JavaScript quiz · sample mission", "Learn JavaScript basics and make a small quiz I can practice on my phone.");
    mission.notes = "I have 30 minutes a day. Start with variables, conditions and loops. The first quiz should have five questions.";
    mission.nextStep = "Write five quiz questions and the correct answers.";
    mission.stage = "planned";
    mission.tasks = ["Pick the first three topics", "Write five quiz questions", "Build the first quiz screen", "Check every answer and explain mistakes"].map((title, index) => ({ id: uid(), title, done: index === 0 }));
    mission.decisions = [{ id: uid(), text: "Use short Hinglish explanations so I can revise quickly on my phone.", at: now() }];
    mission.artifacts = [{ id: uid(), title: "Quiz outline", kind: "Study material", content: "1. What is a variable?\n2. When do we use an if statement?\n3. What does a loop repeat?\n\nNext result: five questions with answers and explanations." }];
    return { version: 2, missions: [mission], templates: [], selectedId: mission.id, device: "laptop" };
  }
  function requireText(value, field, maxLength, nonempty = false) {
    if (typeof value !== "string" || value.length > maxLength || (nonempty && !value.trim())) throw new Error(`Invalid ${field}.`);
    return value;
  }
  function checkedArray(value, field) {
    if (!Array.isArray(value) || value.length > maxItems) throw new Error(`Invalid ${field}.`);
    return value;
  }
  function validateMission(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || !stages.includes(raw.stage)) throw new Error("Invalid mission passport.");
    const timestamp = requireText(raw.updatedAt, "timestamp", 50, true);
    if (Number.isNaN(Date.parse(timestamp))) throw new Error("Invalid timestamp.");
    const miniApps = checkedArray(raw.miniApps === undefined ? [] : raw.miniApps, "mini-apps").map(validateInstance);
    if (miniApps.length > 10 || new Set(miniApps.map(app => app.id)).size !== miniApps.length) throw new Error("Invalid mini-app installations.");
    return {
      id: requireText(raw.id, "mission ID", 100, true),
      title: requireText(raw.title, "mission name", 120, true),
      goal: requireText(raw.goal, "goal", 2000),
      notes: requireText(raw.notes, "notes", 12000),
      nextStep: requireText(raw.nextStep, "next step", 400),
      stage: raw.stage,
      tasks: checkedArray(raw.tasks, "tasks").map(task => {
        if (!task || typeof task.done !== "boolean") throw new Error("Invalid task.");
        return { id: requireText(task.id, "task ID", 100, true), title: requireText(task.title, "task title", 300, true), done: task.done };
      }),
      decisions: checkedArray(raw.decisions, "decisions").map(decision => {
        if (!decision || Number.isNaN(Date.parse(decision.at))) throw new Error("Invalid decision.");
        return { id: requireText(decision.id, "decision ID", 100, true), text: requireText(decision.text, "decision", 1000, true), at: requireText(decision.at, "decision date", 50, true) };
      }),
      artifacts: checkedArray(raw.artifacts, "results").map(artifact => {
        if (!artifact || !["Document", "Code", "Study material", "Data"].includes(artifact.kind)) throw new Error("Invalid result.");
        return { id: requireText(artifact.id, "result ID", 100, true), title: requireText(artifact.title, "result title", 150, true), kind: artifact.kind, content: requireText(artifact.content, "result content", 20000, true) };
      }),
      miniApps,
      updatedAt: timestamp,
      templateSource: typeof raw.templateSource === "string" ? requireText(raw.templateSource, "template source", 100) : null
    };
  }
  function load() {
    try {
      const saved = localStorage.getItem(STORAGE);
      storageSnapshot = saved;
      if (!saved) return sampleState();
      const raw = JSON.parse(saved);
      if (![1, 2].includes(raw.version) || !Array.isArray(raw.missions) || raw.missions.length === 0 || raw.missions.length > maxItems) throw new Error("Invalid local workspace.");
      const missions = raw.missions.map(validateMission);
      const templates = checkedArray(raw.templates, "templates").map(template => ({ id: requireText(template.id, "template ID", 100, true), title: requireText(template.title, "template name", 120, true), mission: validateMission(template.mission) }));
      return { version: 2, missions, templates, selectedId: missions.some(m => m.id === raw.selectedId) ? raw.selectedId : missions[0].id, device: ["laptop", "tablet", "phone"].includes(raw.device) ? raw.device : "laptop" };
    } catch {
      storageError = true;
      recoveryBlocked = storageSnapshot !== null;
      return sampleState();
    }
  }
  let state = load();
  const current = () => state.missions.find(mission => mission.id === state.selectedId);
  function notice(message, error = false) {
    $("notice").textContent = message;
    $("notice").hidden = false;
    $("notice").classList.toggle("error", error);
  }
  function persist() {
    try {
      if (recoveryBlocked) throw new Error("Existing saved workspace could not be read. It has been kept unchanged; export this session's mission before recovering the saved workspace.");
      if (localStorage.getItem(STORAGE) !== storageSnapshot) throw new Error("Another tab changed this workspace. Export unsaved work and reload before saving again.");
      const serialized = JSON.stringify(state);
      localStorage.setItem(STORAGE, serialized);
      storageSnapshot = serialized;
      storageError = false;
      $("storage-status").textContent = "Saved on this browser";
      return true;
    } catch (error) {
      storageError = true;
      $("storage-status").textContent = "Not saved · export a passport";
      notice(error instanceof Error && /workspace|tab/.test(error.message) ? error.message : "Browser storage is unavailable or full. Export your current mission to keep a copy.", true);
      return false;
    }
  }
  function saveDraft() {
    const mission = current();
    if (!mission || $("goal").dataset.missionId !== mission.id) return;
    const next = { goal: $("goal").value, notes: $("notes").value, nextStep: $("next-step").value, stage: $("stage").value };
    if (Object.keys(next).some(key => next[key] !== mission[key])) {
      Object.assign(mission, next, { updatedAt: now() });
      persist();
    }
  }
  function changed() { current().updatedAt = now(); persist(); render(); }
  const studio = createMiniAppStudio({
    beforeOpen: saveDraft,
    onError: message => notice(message, true),
    onInstall: spec => {
      saveDraft();
      if (current().miniApps.length >= 10) throw new Error("A mission supports up to 10 mini-apps in this prototype.");
      current().miniApps.push(makeInstance(spec, uid(), now())); current().updatedAt = now();
      const saved = persist(); render();
      if (saved) notice("Mini-app added and saved on this browser.");
      return true;
    },
    onUpdate: (missionId, appId, data) => {
      saveDraft();
      const mission = state.missions.find(item => item.id === missionId);
      const app = mission?.miniApps.find(item => item.id === appId);
      if (!app) throw new Error("This mini-app is no longer available.");
      app.data = validateData(app.spec, data); app.updatedAt = now(); mission.updatedAt = app.updatedAt;
      persist();
    }
  });
  function render() {
    const mission = current();
    $("missions").innerHTML = state.missions.map(item => `<button class="mission-button${item.id === mission.id ? " active" : ""}" data-mission="${escape(item.id)}" type="button" aria-current="${item.id === mission.id ? "page" : "false"}"><span>${escape(item.title)}</span><small>${escape(item.stage)} · ${item.tasks.filter(task => task.done).length}/${item.tasks.length} steps</small></button>`).join("");
    $("templates").innerHTML = state.templates.length ? state.templates.map(template => `<button class="template-button" data-template="${escape(template.id)}" type="button">↗ ${escape(template.title)}</button>`).join("") : '<p class="template-placeholder">Complete a mission to save its workflow here.</p>';
    $("mission-title").textContent = mission.title;
    $("goal").value = mission.goal;
    $("goal").dataset.missionId = mission.id;
    $("notes").value = mission.notes;
    $("next-step").value = mission.nextStep;
    $("stage").value = mission.stage;
    $("last-saved").textContent = `Updated ${new Date(mission.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    $("tasks").innerHTML = mission.tasks.length ? mission.tasks.map(task => `<li class="task-row${task.done ? " completed" : ""}"><label><input type="checkbox" data-task="${escape(task.id)}"${task.done ? " checked" : ""}><span class="task-text">${escape(task.title)}</span></label><button class="remove-button" data-remove-task="${escape(task.id)}" aria-label="Remove ${escape(task.title)}" type="button">×</button></li>`).join("") : '<li class="empty">Add a small first step.</li>';
    $("task-progress").textContent = `${mission.tasks.filter(task => task.done).length} / ${mission.tasks.length} complete`;
    $("decisions").innerHTML = mission.decisions.length ? mission.decisions.map(decision => `<li>${escape(decision.text)}<time datetime="${escape(decision.at)}">${escape(new Date(decision.at).toLocaleDateString())}</time></li>`).join("") : '<li class="empty">Record a decision when it changes your plan.</li>';
    $("artifacts").innerHTML = mission.artifacts.length ? mission.artifacts.map(artifact => `<article class="artifact"><div class="artifact-heading"><strong>${escape(artifact.title)}</strong><small>${escape(artifact.kind)}</small></div><pre>${escape(artifact.content)}</pre></article>`).join("") : '<p class="empty">Save a document, code snippet or study result here.</p>';
    studio.render(mission);
    $("save-template").disabled = mission.stage !== "complete";
    $("save-template").textContent = mission.stage === "complete" ? "Save workflow template" : "Complete mission to reuse";
    $("workspace").dataset.device = state.device;
    document.querySelectorAll("button[data-device]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.device === state.device)));
    const role = { phone: "Phone: capture ideas, read results and review the next step.", tablet: "Tablet: study, organize context and review results.", laptop: "Laptop: plan, write and build with a larger workspace." }[state.device];
    $("handoff-text").textContent = `${role} Next: ${mission.nextStep || "Choose the next step."}`;
    $("storage-status").textContent = storageError ? "Not saved · export a passport" : "Saved on this browser";
  }
  function addMission(mission) {
    if (state.missions.length >= maxItems) { notice("This prototype supports up to 100 missions. Export work you want to keep.", true); return false; }
    state.missions.push(mission);
    state.selectedId = mission.id;
    persist(); render();
    return true;
  }
  $("missions").addEventListener("click", event => {
    const button = event.target.closest("[data-mission]");
    if (!button) return;
    saveDraft(); state.selectedId = button.dataset.mission; persist(); render();
  });
  $("new-mission").addEventListener("click", () => { saveDraft(); $("mission-dialog").showModal(); $("new-title").focus(); });
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(button.dataset.close).close()));
  $("create-form").addEventListener("submit", event => {
    event.preventDefault();
    const title = $("new-title").value.trim(); const goal = $("new-goal").value.trim();
    if (!title || !goal) return;
    if (addMission(makeMission(title, goal))) { $("mission-dialog").close(); event.target.reset(); notice("Mission created. Add a small first step."); }
  });
  $("mission-form").addEventListener("submit", event => {
    event.preventDefault(); saveDraft();
    if (persist()) { render(); notice("Mission saved on this browser."); }
  });
  $("mission-form").addEventListener("input", () => {
    $("storage-status").textContent = "Unsaved mission edits";
  });
  $("stage").addEventListener("change", () => { saveDraft(); render(); });
  $("task-form").addEventListener("submit", event => {
    event.preventDefault(); saveDraft();
    const title = $("task-input").value.trim();
    if (!title) return;
    if (current().tasks.length >= maxItems) { notice("A mission supports up to 100 tasks.", true); return; }
    current().tasks.push({ id: uid(), title, done: false }); event.target.reset(); changed();
  });
  $("tasks").addEventListener("change", event => {
    if (!event.target.dataset.task) return;
    saveDraft();
    const task = current().tasks.find(item => item.id === event.target.dataset.task);
    if (task) { task.done = event.target.checked; changed(); }
  });
  $("tasks").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-task]");
    if (!button) return;
    saveDraft(); current().tasks = current().tasks.filter(task => task.id !== button.dataset.removeTask); changed();
  });
  $("decision-form").addEventListener("submit", event => {
    event.preventDefault(); saveDraft();
    const text = $("decision-input").value.trim(); if (!text) return;
    if (current().decisions.length >= maxItems) { notice("A mission supports up to 100 decisions.", true); return; }
    current().decisions.push({ id: uid(), text, at: now() }); event.target.reset(); changed();
  });
  $("new-artifact").addEventListener("click", () => { saveDraft(); $("artifact-dialog").showModal(); $("artifact-title").focus(); });
  $("artifact-form").addEventListener("submit", event => {
    event.preventDefault(); const title = $("artifact-title").value.trim(); const content = $("artifact-content").value.trim();
    if (!title || !content) return;
    if (current().artifacts.length >= maxItems) { notice("A mission supports up to 100 results.", true); return; }
    current().artifacts.push({ id: uid(), title, kind: $("artifact-kind").value, content }); $("artifact-dialog").close(); event.target.reset(); changed();
  });
  $("save-template").addEventListener("click", () => {
    saveDraft(); const mission = current();
    if (mission.stage !== "complete") return;
    if (state.templates.length >= maxItems) { notice("This prototype supports up to 100 workflows.", true); return; }
    state.templates.push({ id: uid(), title: mission.title, mission: structuredClone(mission) });
    persist(); render(); notice("Workflow template saved. Select it in the sidebar to start a fresh mission.");
  });
  $("templates").addEventListener("click", event => {
    const button = event.target.closest("[data-template]"); if (!button) return;
    const template = state.templates.find(item => item.id === button.dataset.template); if (!template) return;
    saveDraft();
    const mission = makeMission(`${template.title.slice(0, 106)} · new run`, template.mission.goal);
    mission.notes = template.mission.notes; mission.nextStep = template.mission.nextStep; mission.stage = "planned"; mission.templateSource = template.id;
    mission.tasks = template.mission.tasks.map(task => ({ id: uid(), title: task.title, done: false }));
    mission.decisions = template.mission.decisions.map(decision => ({ ...decision, id: uid() }));
    mission.miniApps = template.mission.miniApps.map(app => makeInstance(app.spec, uid(), now()));
    if (addMission(mission)) notice("Started a fresh mission from the workflow. Checklist completion and results were reset.");
  });
  document.querySelectorAll("button[data-device]").forEach(button => button.addEventListener("click", () => { saveDraft(); state.device = button.dataset.device; persist(); render(); }));
  $("export").addEventListener("click", () => {
    saveDraft();
    const passport = { schema: SCHEMA, version: 2, exportedAt: now(), mission: current() };
    const blob = new Blob([JSON.stringify(passport, null, 2)], { type: "application/json" });
    if (blob.size > MAX_PASSPORT_BYTES) { notice("This passport exceeds the 10 MB transfer limit. Reduce large results before exporting.", true); return; }
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "saathi-mission-passport.json"; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice("Passport exported. Import it in another browser for a manual copy.");
  });
  $("import").addEventListener("change", async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > MAX_PASSPORT_BYTES) throw new Error("The passport must be at most 10 MB.");
      const passport = JSON.parse(await file.text());
      if (passport.schema !== SCHEMA || ![1, 2].includes(passport.version)) throw new Error("Choose a SAATHI mission passport, version 1 or 2.");
      const mission = validateMission(passport.mission);
      saveDraft(); mission.id = uid(); mission.tasks.forEach(task => { task.id = uid(); }); mission.decisions.forEach(decision => { decision.id = uid(); }); mission.artifacts.forEach(artifact => { artifact.id = uid(); }); mission.updatedAt = now();
      mission.miniApps.forEach(app => { app.id = uid(); });
      if (addMission(mission)) notice("Passport imported as a new mission. Existing missions were kept.");
    } catch (error) { notice(error instanceof Error ? error.message : "Unable to import this passport.", true); }
    finally { event.target.value = ""; }
  });
  render();
  if (storageError) notice("Existing browser data could not be loaded. Saved data has been kept unchanged; this session shows a sample and may remain unsaved.", true);
  else persist();
  if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/sw.js").catch(() => { notice("Offline app caching is unavailable. The workspace still works while this page is open."); });
})();
