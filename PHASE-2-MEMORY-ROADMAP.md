# SAATHI Phase 2 — Self-Learning Memory Module

Phase 2 is now the main product goal after Release 1 cloud continuity:

> SAATHI should remember verified lessons, preferences and successful workflows, explain where each memory came from, and let the owner control whether it is used.

This is personalized learning, not hidden model-weight training. The application must not silently clone behavior, change its own code or activate an agent suggestion. Passive behavior signals are disabled until the user explicitly opts in to a clear category and retention period.

## The learning loop

1. A mission produces an observable result.
2. The user records an outcome, usefulness rating, correction, preference or repeat decision.
3. SAATHI stores an immutable `learning_event` with the mission and revision that produced it.
4. Deterministic rules derive a bounded `memory_candidate` with confidence and evidence.
5. The user previews, edits, accepts, rejects, pauses or forgets the candidate.
6. Only accepted, relevant and non-sensitive memories can influence a later mission proposal.
7. A successful repeated workflow can become a versioned skill or schema-driven mini-app after explicit approval.

The React Learning Ledger and Agent Room screens now use these contracts. `review-signal.mjs` publishes a saved review under a stable identity; `memory-review.mjs` derives stable candidates and replays explicit decisions in server order. `cloud/memory-decisions-schema.sql` adds the owner-isolated append-only decision history. `agent-planner.mjs` produces a rules-based starter plan and prepares bounded mission changes for a revision-checked save. Learning Room retrieves accepted, relevant context. The explicit `/review-lab` route exercises the same contracts in an isolated local page session.

Local tests/build establish implementation evidence. Live Supabase verification, persistent agent-run/proposal history, AI providers, pause support and richer pattern suggestions remain later work.

## Phase 2 slices

### 2A — Learning Ledger

- Append a Mission Review signal exactly once per reviewed revision.
- Show pending candidates with source mission, evidence and confidence.
- Support accept, edit, reject, pause and forget.
- Keep accepted memory retrieval owner-scoped and revision-aware.
- Exclude sensitive signals and unapproved candidates from retrieval.

### 2B — Personal pattern suggestions

- Suggest repeat timing, task sizing and explanation style only after enough evidence.
- Show the evidence count and a dismiss/forget control beside every suggestion.
- Never create a task, send a message or call an external connector without approval.
- Start with deterministic rules; evaluate usefulness before adding an AI learner.

### 2C — Agent Room

- The initial proposal contract is implemented in `agent-room.mjs`; it validates role, operation, permissions, evidence and JSON-only body data.
- Planner, tutor, reviewer and learner runs use typed input/output contracts.
- Every proposal contains a mission ID, base revision, source evidence, permissions and an idempotency key.
- Agents can propose a mission edit or mini-app definition, but only an approved proposal can mutate the workspace.
- A stale proposal must remain visible as stale instead of overwriting newer work.

### 2D — Reusable skill memory

- Promote an accepted workflow into a versioned `skill_version`.
- Track whether repeating it saves time or improves the result.
- Roll back or supersede a skill without deleting its evidence history.
- Keep schema-driven mini-apps as the first execution format; arbitrary code needs a separate sandbox.

## Gate before releasing Phase 2 cloud use

Apply `cloud/schema.sql`, `cloud/learning-schema.sql`, then `cloud/memory-decisions-schema.sql` to the intended Supabase project, configure the browser-safe public variables in `web/.env.local`, and verify two accounts across two devices. The tests must show RLS isolation, session teardown, realtime invalidation and visible revision conflicts. No service-role key belongs in the browser. Local implementation and the review lab do not depend on this live release gate.

## Phase 2 acceptance

- A memory never becomes active without a user approval event.
- Every accepted memory points to at least one immutable evidence event.
- Forget removes the memory from retrieval and marks its history appropriately.
- A second account cannot read, rank or mutate another account's memories.
- A disconnected device either reconciles its queued operation or shows a conflict; it never reports a false save.
- The product can explain, in plain language, why a suggestion appeared.

The product promise for this phase is: **SAATHI learns from what you verify, shows its evidence, and stays under your control.**
