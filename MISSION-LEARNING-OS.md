# SAATHI Mission Learning OS

SAATHI combines the useful parts of the Productivity Hub, coding workspace, tutor, multi-agent builder and schema-driven mini-app studio around one portable record: the mission passport.

Its product loop is:

**Capture → Plan → Work → Verify → Learn → Reuse → Handoff**

The differentiator is continuity. A mission keeps the reason for the work, accepted decisions, reviewed output, next action and the evidence that produced a reusable workflow. This is a product hypothesis, not a guarantee that no similar product exists.

## What “self-learning” means

SAATHI does not secretly retrain model weights or change its own application code. After a mission, the user can record an outcome, rating, correction, preference or reusable lesson. The deterministic `learning-loop.mjs` module turns that explicit signal into pending memory candidates.

Candidates are never active automatically. The user can accept, edit, reject, pause or forget them. Only accepted, relevant, non-sensitive memories can be retrieved for a future mission. Every memory keeps evidence IDs and a source mission, so the Learning Ledger can answer: “SAATHI learned this from where?”

This gives useful personalization without hidden behavior. A future private/local model adaptation can be considered only after dataset preview, explicit opt-in, evaluation, versioning and rollback.

## Connected surfaces

- **Mission Inbox:** capture text, voice, photos, files and quick ideas.
- **Mission Passport:** goal, context, tasks, decisions, artifacts, mini-apps and next step.
- **Agent Room:** planner, tutor, builder, reviewer and learner proposals.
- **Learning Ledger:** candidate memories, evidence, confidence, approval and forget controls.
- **Tool Studio:** validated trackers, quizzes, invoices, flashcards, reports and workflows.
- **Handoff Center:** devices, running jobs, conflicts, queued edits and scoped permissions.

The phone is optimized for capture, review and approval. A tablet is optimized for learning and organization. A laptop is optimized for editing, previews and builds. They all read the same authenticated mission and job state; a device changing does not restart an AI job.

## Data boundaries

The mission aggregate remains the canonical work record. Separate versioned records keep the learning and agent history auditable:

- `learning_events`: immutable user feedback, accepted/rejected proposals, outcomes and conflict resolutions.
- `memory_candidates`: pending suggestions with status, confidence, evidence and sensitivity classification.
- `memory_entries`: accepted memories with provenance, review/expiry dates and forget tombstones.
- `agent_runs`: planner/tutor/builder/reviewer/learner jobs with input references, base revision, provider/model version, budget and status.
- `agent_proposals`: validated proposed changes or `MiniAppSpec` definitions; approval is required before mission mutation.
- `skill_versions`: approved workflows and mini-app definitions with source revision, validation result, metrics and rollback link.
- `devices`, `handoffs` and `sync_operations`: capabilities, scoped handoff tokens, idempotency keys and visible conflict state.

The current `cloud/` foundation implements the safe mission aggregate, authentication, RLS, compare-and-set revisions and sync lifecycle. The Next.js Mission Review card now records an explicit, opt-in outcome/rating signal in that aggregate, including a repeatable next-run path. `learning-loop.mjs` implements the first deterministic candidate contract. The next cloud slice will persist the full ledger with the same owner and revision rules.

## Agent permissions

Agents propose; they do not silently mutate the passport. Each run declares its role, inputs, output schema, permissions, budget and base revision. A proposal is accepted only after schema validation, evidence review and an explicit user action. A stale proposal cannot overwrite a newer mission revision.

Generated mini-apps remain constrained `MiniAppSpec` JSON. Arbitrary generated code, if added later, runs in a separate sandbox with time, memory, filesystem and network limits. No browser bundle receives a service-role key, and no generated code receives the authenticated workspace client.

## Release path

1. **Release 1 — Mission Continuity:** real Supabase setup, two-account/two-device tests, conflict UI and offline drafts.
2. **Release 1.5 — Learning Ledger foundation:** cloud learning events and deterministic candidate contracts.
3. **Release 2 — Self-Learning Memory Module and Agent Room:** reviewed memory UI, relevant retrieval, planner, tutor, reviewer and learner jobs with typed proposals.
4. **Release 3 — Skill and Tool Studio:** approved workflows become versioned personal tools and mini-apps.
5. **Release 4 — Integrations:** Drive, Calendar, GitHub, imports and a narrowly scoped Windows companion.
6. **Release 5 — Optional private training:** only after privacy controls and evaluation are mature.

The defensible promise is: **SAATHI preserves the reasoning behind a person’s work, learns only from verified feedback, turns successful work into reusable tools, and carries the whole mission across devices.**
