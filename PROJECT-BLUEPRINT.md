# SAATHI — Personal Mission Workspace

Working title; name availability and trademark rights have not been checked.

## Product decision

Build one workspace around **missions**: a study goal, a recurring chore, a personal project or a small business process. Each mission owns its context, tasks, decisions, outputs and next step. Completing useful work can produce a reusable workflow; a later AI builder can turn suitable workflows into small personal tools.

Core loop: **Capture → Plan → Work → Verify → Learn → Reuse → Handoff**.

This combines the useful parts of the earlier Productivity Hub, AI coding workspace, coding tutor, data assistant and multi-agent builder without making five independent applications. The mission is the common record throughout, while the Learning Ledger records only explicit, reviewable feedback.

## Distinctive hypothesis

**Task → Workflow → Tool, with a portable mission passport and deliberate device handoff.**

The proposed advantage is continuity and reuse: preserve why a decision was made, what input produced an output, which version was reviewed, and exactly what needs doing next. These are product hypotheses to test with real users, not verified market exclusivity.

“Nobody has ever built this” cannot be established by a limited search. Notion already offers AI agents over workspace knowledge, and Replit already supports AI app building from phones and continuation on computers. Simply combining chat, notes and an editor is insufficient to claim originality.

Primary sources checked on 2026-10-08:

- Notion agents: https://www.notion.com/product/agents
- Replit mobile: https://replit.com/products/mobile
- PWA offline/background operation: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation

## Example journey

1. On the phone: “Mujhe JavaScript seekhkar apna quiz app banana hai.” Capture the intent and attach selected material.
2. The planner proposes topics, practice tasks and a result definition. The user edits and accepts the plan.
3. On a laptop: the builder proposes a small quiz app in an isolated workspace. The reviewer checks changes; the tutor explains errors using the actual project.
4. On a phone/tablet: review the questions, preview the result and continue learning using the same mission context.
5. Record the reviewed output and its source/decisions. Save the workflow for another subject; eventually regenerate a quiz tool from new material.

Another mission might organize receipts into a reviewed expense summary and later become a repeatable personal report tool. Its data analysis belongs to that mission, with sources and validation retained.

## Device experience

- Phone: capture, chat, review, notifications and quick approvals.
- Tablet: read, learn, organize and review.
- Laptop/desktop: larger editor, previews, project files and build/review workflow.
- Other devices: browser access where supported; specialized adapters later if useful.

Cross-device sync means authenticated access to shared state. It does not mean every operating system permits the same background processing, filesystem access or automation. AI runs need connectivity unless a separate local-model option is added.

The first real app should be a responsive PWA deployed over HTTPS. Offline capture and drafts can queue operations locally; reconnect must reconcile them. Do not rely only on browser background sync: a foreground retry path is also required. A later Windows companion may execute narrowly defined actions when the paired PC is online. Phone browsers cannot provide arbitrary PC filesystem control by themselves.

## Full product architecture

- Web application: Next.js, TypeScript and responsive UI. Reuse the reviewed Productivity Hub authentication, task/note interactions and error handling.
- Identity/data: Supabase Auth, PostgreSQL, private file storage and per-user access policies. Data model should support a workspace boundary, even if the first release is personal use.
- Offline state: IndexedDB for local drafts and a durable pending-operation queue. Version numbers, idempotency keys and visible conflict handling prevent silently losing edits.
- AI gateway: server-side provider adapters. Planner, builder and reviewer are roles with explicit input/output contracts; the development assistants do not become connected runtime services automatically.
- Jobs: durable background queue, cancellation, bounded retries, progress and error records. Server owns job state; changing device never restarts a job by accident.
- Execution: isolated worker/sandbox with per-job files, time/resource limits and explicit network policy. AI-generated code must not execute in the web server process.
- Handoff: mission passport plus job/output revision, current view, selected files and next action. A device capability registry chooses an available worker/companion, rather than assuming all devices do everything.
- Local companion: later, explicit pairing and revocable permissions. Initial actions should be narrowly defined file operations inside user-selected folders, with a reviewable change plan and activity record.
- Portability: versioned exports and sources attached to outputs. Avoid tying the user's mission history to a single model/provider.

## Main records

Workspace, Mission, Task, Note, Decision, Source, Artifact, ArtifactRevision, WorkflowTemplate, ToolDefinition, AgentRun, Job, Device, Handoff and SyncOperation.

Artifact revisions reference input sources, relevant decisions and producing run IDs. Reviews reference the exact revision, preventing a review of yesterday's result from appearing to approve today's changed output.

## Releases and evidence required

### 0 — Reviewable concept (this repository)

Local missions, task/decision/result capture, next-step continuity, template reuse and manual passport transfer. A first dynamic engine now adds schema-defined trackers, quizzes and invoice calculators with independent saved data. Workflow runs retain their definitions and reset data. AI/cloud features are explicitly labeled as planned; see DYNAMIC-ENGINE.md.

### 1 — Real mission continuity

Login, missions/tasks/notes, source attachments, automatic cloud updates, online device handoff and versioned exports. Add offline drafts and sync reconciliation after the online path is reliable.

The first backend slice is now reviewable in `cloud/`: an authenticated owner-bound mission aggregate, strict snapshot/mini-app validation, optimistic revisions, soft-delete tombstones, auth lifecycle handling and invalidation-based sync. The first Next.js UI is wired to this boundary and includes a Mission Review card that stores an explicit outcome/rating signal plus an opt-in memory note. The static concept UI remains a local-storage reference, and live Supabase/two-device acceptance is still pending.

Acceptance: two devices on one account continue the same mission; a second account and an unauthenticated client cannot read or alter it. Reconnect must preserve queued edits or show an actionable conflict. Test expiration/sign-out and storage policy boundaries.

### 1.5 — Learning Ledger

Store immutable feedback events and pending memory candidates. The user accepts, edits, rejects or forgets each candidate; retrieval uses accepted relevant memories only. `learning-loop.mjs` is the deterministic local contract for this release.

Acceptance: no memory becomes active without approval; every accepted memory has evidence; sensitive signals are excluded by default; forget removes it from retrieval; account RLS and device sync preserve the same ledger.

### 2 — Self-Learning Memory Module and Agent Room

This is the main Phase 2 goal. SAATHI should learn verified corrections, preferences and successful workflows, explain the evidence behind each suggestion, and keep the owner in control of activation, pause and forget. The first implementation is deterministic; passive behavior learning and private model adaptation require separate opt-in and evaluation.

Complete the reviewed Learning Ledger UI, wire Mission Review signals to append-only cloud events, then add Hinglish chat grounded in selected mission sources. Planner, reviewer, tutor and learner agents must return typed proposals tied to a mission revision; they may not mutate the workspace directly.

Acceptance: sources and evidence are visible; no memory becomes active without approval; accepted memories are owner-isolated and forgettable; AI suggestions require acceptance before replacing saved work; stale runs cannot overwrite a newer revision; cancellation and connection failures remain truthful. See [PHASE-2-MEMORY-ROADMAP.md](PHASE-2-MEMORY-ROADMAP.md).

### 3 — Workflow becomes a personal tool

Generate a constrained mini-tool from an approved workflow, validate it, test it and preview the result. The first local renderer catalog already supports tracker/quiz/invoice definitions; this release adds actual AI generation and cloud persistence. Custom-code tools need a separate sandbox. Start with quiz/flashcard builders, simple data transformations and personal reports; arbitrary full software development comes later.

Acceptance: execution limits, isolation, reviewed artifact versions, exportability and useful repeated runs. Evaluate whether reuse saves time on actual missions before expanding the generator.

### 4 — Device actions and integrations

Pair a Windows companion; remotely request selected-folder actions; add integrations only around validated mission use cases. An offline PC produces a visible waiting job, not a false success. Mobile OS restrictions need separate implementation choices.

## Development collaboration

Suggested division: Codex handles data contracts, authentication/security, sync correctness and validation; Antigravity handles mission UI, capture, previews and responsive experience. Both review changes through shared files/Git and a common blueprint. This is a proposed division, not evidence of a direct chat or integration between the assistants.

## Current dependencies

Production cloud work still needs the user's Supabase account/project configuration. Runtime AI needs an explicitly configured provider and account credentials. The local prototype does not require either and does not claim those integrations are complete.

## Why build this

The user can apply it to study, personal projects and recurring work from the first small release. Later features reuse the same mission record instead of discarding the initial app. A real constraint is scope: ship the continuity loop first and expand only after it is useful in daily use.
