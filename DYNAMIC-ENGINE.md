# First dynamic mini-app engine

The Omni-OS idea fits the SAATHI mission core: each mission can gain useful mini-apps while retaining context, decisions and outputs. “Self-evolving” should mean producing versioned, reviewable modules; unrestricted self-modification of the authenticated application is not implemented.

## Implemented pipeline

**Template or JSON definition → Validate → Interactive preview → Add to mission → Save app data → Export/reuse**

- `mini-app-engine.mjs`: pure definition/state validation and calculations.
- `mini-app-ui.mjs`: fixed renderer registry, tracker tables/totals/charts, quiz checking and invoice subtotals.
- `mini-app-studio.mjs`: candidate definition, preview state and explicit installation.
- `app.js`: per-mission persistence, passport version 2, imports and workflow reuse.

This is a working engine foundation. Natural-language AI generation is **not connected**. Presets and edited definitions are clearly labeled. A future server-side generator can return the same `MiniAppSpec` contract; the local UI must validate that output before previewing it.

## Contract

`MiniAppSpec` contains exactly `schema`, `version`, `kind`, `title`, `description` and `config`.

- Schema: `saathi.mini-app`; version: `1`.
- Tracker: 2–8 typed fields (`text`, `number`, `date`), one numeric metric and its unit; up to 365 entries.
- Quiz: 1–30 questions, 2–6 choices each, correct answer index and explanation. Answers and checking state belong to the app installation.
- Invoice: selected currency (`INR`, `USD`, `EUR`, `GBP`), customer and up to 100 lines. Quantity is an integer from 1 to 1000; money is integer minor units. The UI accepts up to two decimal places and calculates exact integer subtotals. Tax/payment/document generation are outside this version.

Unknown properties, executable-code fields, unsupported kinds/versions, unsafe or duplicate field IDs, invalid dates, non-finite numbers, out-of-range answers and malformed state are rejected. The renderer uses text nodes for supplied labels/content. It does not use `eval`, `new Function`, user HTML or JSX execution.

Each installed instance owns its validated definition and independent data. The exact normalized definition shown in the preview is installed. Preview data is temporary and does not become installed app data. A workflow template preserves app definitions; new runs reset their entries, answers and invoice lines. Passport import validates app state and assigns fresh installation IDs; it is a manual copy, not cloud sync.

Local storage failures remain visible. Invalid previously saved data is kept unchanged. Another-tab changes block stale writes; this is basic conflict detection, not a complete offline merge engine.

## Where Sandpack fits later

Sandpack offers files/templates/dependencies, bundling and an iframe preview. It can support a later code-editor mode. React Live can render supplied React components and expose values through `scope`. Those libraries solve preview/execution experience; authentication boundaries, code capabilities, data access and execution limits still require application design.

Our first release uses the constrained schema/renderer registry. A later arbitrary-code mode should have a separate origin/worker boundary and a narrow capability API; never hand generated code the authenticated workspace client or secrets.

Primary sources checked 2026-10-08:

- Sandpack architecture: https://sandpack.codesandbox.io/docs/architecture/overview
- React Live usage: https://nearform.com/open-source/react-live/docs/usage
- JSON Schema object properties: https://json-schema.org/understanding-json-schema/reference/object

## Next implementation

1. Wire the tested `cloud/` persistence foundation into the authenticated Next.js/PWA UI, then run real two-account/two-device isolation tests against the user's Supabase project.
2. Keep the Mission Review learning signal explicit: a completed mission can record outcome, friction, lesson, repeat intent and optional user-approved memory. This signal is evidence for future suggestions, not hidden model training.
3. Add server-side prompt-to-definition generation, cancellation, version checks and visible generation errors. Store sources and exact proposed definitions with runs; agents propose typed definitions and the user approves installation.
4. Extend the renderer catalog from actual user needs. Keep custom code preview as a separately isolated mode.
5. Pair a local companion when a mission needs PC actions. Browser layout changes alone do not grant operating-system automation.
