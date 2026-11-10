# SAATHI cloud integration handoff

This folder contains the framework-neutral Release 1 foundation used by the Next.js/PWA UI in `web/`. The original static prototype still uses browser-local storage as a reference; it does not import these modules.

## UI boundary

The Next.js default is now the device-only private workspace. This cloud runtime is mounted only in `/cloud` after explicit opt-in to Supabase off-device transmission. The private vault remains separate and is never automatically uploaded. See `../PRIVACY-PRIVATE-MODE.md` for the current private-team implementation and boundary.

The opt-in cloud UI creates a configured client once, then creates one workspace controller for the signed-in browser:

```js
import { createSaathiClient, createCloudWorkspace } from "./cloud/index.mjs";

const configured = createSaathiClient({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  storage: window.localStorage,
});
const workspace = configured.client
  ? createCloudWorkspace(configured.client, { onState: render })
  : null;
```

In Next.js, keep these variables browser-safe and expose only the publishable/legacy anon key. `createSaathiClient` rejects missing, malformed, secret, and service-role keys. Decoding a legacy JWT is only a configuration guard; the verified user returned by `auth.getUser()` and PostgreSQL RLS establish identity.

Subscribe to the immutable workspace snapshot from `onState`. While authentication is `checking`, `signed-out`, or `error`, clear the visible mission list and any account-bound drafts. A new authenticated `ownerId` always gets a new repository and sync controller. Dispose the controller on unmount, sign-out, and account changes with `workspace.stop()`.

Use `sync.records` as the cloud truth. Keep an edit draft separate from the last loaded record and retain its loaded revision. Call `workspace.save(draft, loadedRevision)`. A `REVISION_CONFLICT` is an actionable conflict: keep the draft, refresh the latest record, and show a review/merge choice. Do not silently retry with the newer revision or overwrite another device.

Records with `deletedAt` are tombstones used to reconcile deletions. Hide them from the active mission view only after applying the deletion to local state. The repository never issues a hard delete.

## Initial data migration

Local prototype passports may have non-UUID IDs. If a user explicitly chooses to move one into the cloud, call `prepareMissionForCloud` and show that a fresh mission and item IDs will be created. It returns a validated copy; it does not upload or overwrite the local passport automatically. Do not seed shared demo data into an authenticated account.

## Supabase setup and evidence

An administrator must review and run `schema.sql` in the intended Supabase project, then run the marked two-account transaction in `rls-acceptance.sql`. `DATABASE.md` describes the required account and role setup. The local `database.test.mjs` executes the real SQL against PGlite with mocked auth functions; it does not prove a remote project is configured.

Realtime is an invalidation signal. The repository listens only for owned INSERT/UPDATE events and `sync.mjs` refetches the complete account list. Reconnect, focus, visibility changes, and periodic polling all trigger refreshes. This avoids treating an untrusted event payload as a mission snapshot.

The `web/` Mission Review card is the first user-facing learning signal. It stores outcome, usefulness rating, friction, lesson, repeat intent and optional approved memory inside the revisioned mission snapshot, so the signal follows the mission across devices. The separate `learning-loop.mjs` contract turns a complete, consented signal into reviewable candidates, and `memory-candidate-ui.mjs` provides the review-safe view model for the interactive React Ledger screen. `learning-schema.sql` and `learning-repository.mjs` add the next append-only cloud ledger slice: owner-scoped events can be appended and read across devices, while UPDATE/DELETE are denied. `agent-room.mjs` validates revision-aware proposal metadata without applying proposal bodies. Pending candidates must remain separate from accepted memories, and model-generated suggestions must never activate automatically. The web review workspace publishes saved reviews with explicit consent. `memory-review.mjs` replays owner-bound decisions from `memory-decision-repository.mjs`; apply `memory-decisions-schema.sql` after the learning schema. Candidate IDs are stable across devices, and forget removes active text/evidence while preserving the source review and audit records.

## Release status

Implemented and tested locally: strict mission/mini-app contracts, client configuration guards, owner-bound repository, optimistic compare-and-set saves, soft tombstones, auth state lifecycle, sync concurrency, and local PostgreSQL RLS acceptance.

Still required before calling the live release complete: migrating the full mini-app renderer into the web UI, deploying the PWA over HTTPS, applying `schema.sql`, `learning-schema.sql` and `memory-decisions-schema.sql` to the user's Supabase project, testing two authenticated accounts on two devices, and testing reconnect/session expiry against real Supabase Auth and Realtime. The web Mission Review-to-ledger flow and interactive review screens are wired locally. AI providers and persistent agent-run/proposal history remain pending. No cloud credentials are stored in this repository.
