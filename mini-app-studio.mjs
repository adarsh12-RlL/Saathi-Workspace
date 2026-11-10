import { DEFAULT_SPECS, validateSpec, makeInstance } from "./mini-app-engine.mjs";
import { renderMiniApp } from "./mini-app-ui.mjs";

const $ = id => document.getElementById(id);

export function createMiniAppStudio({ onInstall, onUpdate, onError, beforeOpen }) {
  let previewedSpec = null;
  const editor = $("mini-definition");
  const preview = $("mini-preview");
  const install = $("mini-install");
  const status = $("mini-preview-status");
  const report = (message, error = false) => { status.textContent = message; status.classList.toggle("error", error); };
  const invalidate = () => {
    previewedSpec = null; install.disabled = true; preview.replaceChildren();
    report("Preview the definition before adding this app to your mission.");
  };
  function loadPreset() {
    const spec = DEFAULT_SPECS.find(item => item.kind === $("mini-preset").value);
    editor.value = JSON.stringify(spec, null, 2); invalidate();
  }
  $("new-mini-app").addEventListener("click", () => {
    beforeOpen(); loadPreset(); $("mini-dialog").showModal(); $("mini-preset").focus();
  });
  $("mini-preset").addEventListener("change", loadPreset);
  editor.addEventListener("input", invalidate);
  $("mini-preview-button").addEventListener("click", () => {
    try {
      if (editor.value.length > 100000) throw new Error("The definition is too large.");
      previewedSpec = validateSpec(JSON.parse(editor.value));
      const instance = makeInstance(previewedSpec, "preview", new Date().toISOString());
      preview.replaceChildren(renderMiniApp(instance, { onError: message => report(message, true) }));
      install.disabled = false;
      report("Ready to add. Preview data is temporary; the installed app starts empty.");
    } catch (error) {
      previewedSpec = null; install.disabled = true; preview.replaceChildren();
      report(error instanceof Error ? error.message : "Invalid mini-app definition.", true);
    }
  });
  install.addEventListener("click", () => {
    if (!previewedSpec) return;
    try {
      // Install the exact validated spec shown, never a later unreviewed editor value.
      if (onInstall(validateSpec(previewedSpec))) $("mini-dialog").close();
    } catch (error) { report(error instanceof Error ? error.message : "Unable to install this app.", true); }
  });
  loadPreset();
  return {
    render(mission) {
      const container = $("mini-apps"); container.replaceChildren();
      if (!mission.miniApps.length) {
        const empty = document.createElement("p"); empty.className = "empty";
        empty.textContent = "Add a tracker, quiz or invoice calculator to this mission."; container.append(empty); return;
      }
      for (const instance of mission.miniApps) {
        container.append(renderMiniApp(instance, {
          onChange: data => onUpdate(mission.id, instance.id, data),
          onError,
        }));
      }
    }
  };
}
