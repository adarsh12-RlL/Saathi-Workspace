# SAATHI — Unified Product Integration Blueprint

SAATHI brings the earlier Productivity Hub, AI coding workspace, coding tutor, database assistant, code review bot, multi-agent builder and Omni-OS mini-app ideas into one product. The common unit is a mission: a goal with its context, plan, work, evidence, decisions, review and next action.

The product hypothesis is:

> Capture a goal once, get help from the right role, preserve what worked, and continue on any capable device.

This is a product direction, not a claim that no similar product exists. Its differentiator to test is the complete chain:

Mission → Evidence → Learning → Reusable Workflow → Mini-App → Handoff

## One product, seven connected surfaces

The earlier ideas become focused surfaces instead of separate applications.

| Earlier idea | SAATHI surface | What it does |
| --- | --- | --- |
| Productivity Hub | Mission Inbox and Passport | Captures notes, tasks, files, decisions and next steps in one portable record. |
| AI coding editor | Build Studio | Provides a larger-screen editor, file context, preview and reviewed changes for a mission. |
| Coding tutor | Learning Room | Explains concepts, gives hints, evaluates attempts and adapts explanations to approved preferences. |
| Text-to-SQL assistant | Data Lens | Connects an approved data source, turns a question into a reviewable query, then presents validated tables or charts. |
| Code review bot | Review Room | Checks a selected revision for correctness, security and maintainability, with findings tied to exact evidence. |
| Multi-agent builder | Agent Room | Planner, tutor, builder, reviewer and learner agents return typed proposals; the owner approves their effects. |
| Omni-OS mini-app studio | Tool Studio | Turns an approved workflow into a constrained tracker, quiz, invoice, flashcard, report or future personal tool. |
| Cross-device workspace | Handoff Center | Shows device capability, running jobs, queued edits, conflicts and the next action to continue. |

A mission can use one surface or several. A study mission may use the Inbox, Learning Room and Tool Studio. A software mission may use Build Studio, Review Room and Agent Room. A business mission may use Data Lens, Review Room and a reusable report tool.

## The shared lifecycle

Every surface writes to the same mission and evidence model:

1. Capture — The user records an idea, goal, source or problem from a phone, tablet or laptop.
2. Plan — A planner proposes milestones, tasks, definition of done and required tools. The user edits or accepts the plan.
3. Work — The user works directly, or invokes a selected tutor, builder, reviewer or data role.
4. Verify — Outputs are tested or reviewed against sources, checks and the mission revision that produced them.
5. Learn — The user records outcome, rating, correction, friction and reusable lessons. SAATHI creates a pending learning candidate.
6. Reuse — The user approves a memory or workflow, then starts a fresh mission or installs a validated schema-based mini-app.
7. Handoff — The current revision, selected files, output, job status and next action follow the authenticated account to another device.

The lifecycle is deliberately explicit. An agent can propose a plan, query, code change, review finding or tool definition, but it cannot silently replace saved work.

## Self-learning contract

Khud train means transparent, user-controlled personalization:

- A completed mission can emit one immutable learning signal for a reviewed revision.
- The deterministic learning engine derives pending candidates from explicit corrections, preferences, lessons and reusable workflows.
- Every candidate shows its source mission, evidence, confidence, scope and status.
- The user can accept, edit, reject, pause or forget it.
- Retrieval uses only accepted, relevant and non-sensitive memories.
- Forgetting removes the memory from retrieval while preserving the audit history required to explain what happened.
- Passive behaviour learning, provider fine-tuning or local model adaptation requires a later opt-in, dataset preview, evaluation, versioning and rollback plan.

SAATHI does not silently retrain model weights, modify its own application code or infer permission to contact external systems. A useful suggestion must remain explainable and dismissible.

## Device and connector model

The primary client is a responsive PWA served over HTTPS.

- Phone: capture, voice/photo input, quick review, approvals and notifications.
- Tablet: reading, learning, organizing, chart review and mission planning.
- Laptop/desktop: editor, project files, mini-app building, data review and larger previews.
- Paired PC companion, later: narrowly scoped actions inside user-selected folders with revocable permissions and a visible change plan.

Cloud state is account-bound and owner-scoped. Jobs live on the server, so changing devices does not restart them. Local drafts and queued operations need durable storage, idempotency keys and visible conflict handling before offline work is advertised as complete.

Future connectors should be opt-in, capability-scoped and evidence-producing. Candidates include calendar, email, cloud files, Git repositories, issue trackers and approved databases. A connector may read or write only the scopes the user grants, and its result becomes a source or artifact on the relevant mission. Mobile browser access does not grant arbitrary access to a laptop filesystem.

## Architecture map

The current repository already contains the foundation for this direction:

- cloud/ — authenticated mission persistence, RLS contracts, optimistic revisions, tombstones, auth lifecycle and sync.
- learning-loop.mjs — deterministic signal, candidate, approval, forget and ranking rules.
- memory-candidate-ui.mjs — review-safe evidence and action projection.
- agent-room.mjs — proposal metadata, permissions, evidence and stale-revision checks.
- mini-app-engine.mjs and mini-app-studio.mjs — constrained JSON mini-app definitions and validation.
- web/ — Next.js responsive PWA shell with setup, authentication, mission editing, sync status and Mission Review.
- MISSION-LEARNING-OS.md — detailed data boundaries and trust model.

The foundation is local and tested. It does not mean that a remote Supabase project, live AI provider, connector, background job worker, browser rendering or two-device flow has already been verified.

## Release sequence and gates

### Release 0 — Reviewable local foundation

Ship the mission passport, tasks, notes, decisions, next step, workflow reuse, constrained mini-apps and local export/import. Keep the static prototype useful without cloud credentials.

Gate: local validation, safe schema rejection, independent mini-app state and an honest manual checklist.

### Release 1 — Mission continuity

Deploy the PWA over HTTPS. Wire Supabase Auth, owner-scoped mission persistence, realtime invalidation, revision conflicts and versioned exports. Add offline drafts only after the online path is reliable.

Gate: two devices on one account see the same mission; a second account and anonymous client cannot read or mutate it; sign-out, expiry, reconnect and conflict states remain truthful.

### Release 1.5 — Learning Ledger

Persist immutable learning events and memory candidates in the append-only ledger. Show evidence and source mission, and provide accept, edit, reject, pause and forget actions.

Gate: no memory activates without approval; sensitive signals stay excluded; accepted memories are owner-isolated, relevant and forgettable; duplicate reviews are idempotent.

### Release 2 — Memory Module and Agent Room

Ground Hinglish or multilingual chat in selected mission sources. Add planner, tutor, builder, reviewer and learner runs with budgets, cancellation, provider/version records and typed proposal output.

Gate: stale proposals cannot overwrite newer revisions; proposals need explicit approval; every suggestion explains its evidence; failed or cancelled jobs never report success.

### Release 3 — Tool Studio, Build Studio and Data Lens

Migrate the renderer into the web UI. Generate validated tracker, quiz, flashcard, invoice, report and data transformation definitions from approved workflows. Add a larger code editor and isolated preview, then query approved databases through a reviewable server-side gateway.

Gate: generated definitions are schema-validated, versioned and exportable; arbitrary code never runs in the web server; queries and changes are reviewable; outputs retain their sources.

### Release 4 — Review Room and integrations

Add revision-aware code review, selected Git integrations, calendar/email/file connectors and the paired PC companion. Start with narrow, useful scopes and reversible actions.

Gate: connector permissions are visible and revocable, external actions require approval where appropriate, every action is logged to a mission, and an unavailable device reports waiting instead of pretending to have completed work.

### Release 5 — Optional private adaptation

Consider local model or private provider adaptation only if real usage proves that approved memories and workflows are insufficient. Provide dataset inspection, explicit opt-in, evaluation, version pinning, rollback and deletion.

Gate: a user can see what was included, compare versions, disable adaptation and remove its source data.

## Local verification checklist

Run these checks before calling a release complete:

- npm test from the repository root.
- npm run lint, npx tsc --noEmit and npm run build from web/.
- Create, edit, complete, review, export and import a mission locally.
- Confirm a learning signal creates a pending candidate only when consent and sensitivity rules allow it.
- Confirm accept, reject, pause and forget change retrieval as expected.
- Confirm stale Agent Room proposals remain visible and cannot overwrite newer revisions.
- Test a tracker, quiz and invoice definition through validate → preview → install → repeat.
- Apply cloud SQL only in an intended Supabase project, then test two accounts on two devices, sign-out, expiry, reconnect, realtime invalidation and revision conflict.
- Record any browser, PWA, connector or AI-provider test that was not actually run.

The success criterion is daily usefulness across phone, tablet and laptop: less repeated setup, clearer evidence, safer reuse and a reliable next step. Expand only when users can complete a real mission faster and understand why SAATHI made each suggestion.

