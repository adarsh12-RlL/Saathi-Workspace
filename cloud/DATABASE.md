# SAATHI Release 1 database

`schema.sql` is a reviewable initial Supabase/PostgreSQL mission schema. `learning-schema.sql` is the separate Release 1.5 append-only Learning Ledger migration. Neither has been applied to a remote project by Codex. `rls-acceptance.sql` has not been executed against a configured Supabase database. The local database tests execute the actual schemas against in-memory PostgreSQL via PGlite with a mock auth schema; those checks cannot establish that a remote database has these policies.

## Apply and verify

1. In the intended Supabase project, run `cloud/schema.sql` in the SQL Editor as an administrative role. It creates only `public.saathi_missions`, its constraints, owner policies, write trigger, index, and its entry in `supabase_realtime`.
2. Run `cloud/learning-schema.sql` as an administrative role. It creates only `public.saathi_learning_events`, which accepts validated learning signals and has owner SELECT/INSERT RLS with no UPDATE/DELETE grants or policies.
3. Use two distinct existing test accounts. In `cloud/rls-acceptance.sql`, replace the two marked UUIDs with their `auth.users.id` values. Run the entire file as one transaction in the SQL Editor. The SQL uses temporary JWT claims to test database permissions; it does not authenticate users or create accounts.
4. Every test must report PASS. The last statement is `ROLLBACK`, leaving no mission fixtures. If any assertion fails, roll back the failed transaction before retrying the complete script.
5. Also test through two authenticated browser accounts and two devices. Verify that session expiry/sign-out cannot expose another account's local/cloud state and that realtime changes and reconnect reconciliation work. These application/network tests remain separate from SQL policy acceptance.

The SQL Editor must permit changing the session role to `authenticated` and `anon`. It normally executes with elevated database privileges; testing only with that initial role would bypass the user policies. The script explicitly switches roles and installs account-specific JWT claims before its assertions. Existing `auth.users` rows are required because the owner foreign key is enforced.

Anonymous SELECT/UPDATE access is revoked, so an anonymous attempt receives permission denied rather than a successful empty result. The acceptance script accepts permission denied or zero visible/changed rows, and fails if any owner data becomes visible or mutable. Authenticated account B must receive zero rows for account A's mission; account B inserting for A must be rejected.

For local verification, run `node --test cloud/database.test.mjs cloud/learning-database.test.mjs`. These tests use in-memory PostgreSQL with mocked `auth.users`, `auth.uid()`, and Supabase roles; execute the real schemas twice; check isolation, compare-and-set writes, immutable fields, envelope/size limits, tombstones, and append-only event behavior. The mock database has no `supabase_realtime` publication, so the schemas' replication registration branches are skipped. Publication setup and real realtime delivery still require Supabase verification.

## Aggregate contract

`public.saathi_missions` has eight columns:

- `id`: client-generated UUID, immutable primary key; no automatic server ID.
- `owner_id`: required authenticated owner's `auth.users.id`, immutable. Account deletion cascades its missions; regular clients cannot hard-delete missions.
- `revision`: bigint starting at 1, capped at JavaScript's safe-integer maximum (9,007,199,254,740,991); each successful update must submit exactly the previous revision plus one.
- `title`: nonempty text, at most 120 characters, matching `payload.title`.
- `payload`: the complete mission snapshot, including mini-app definitions and instance data.
- `created_at`: server timestamp fixed when inserted and immutable thereafter.
- `updated_at`: server timestamp set on every successful insert/update; authoritative for cloud ordering.
- `deleted_at`: nullable server timestamp. Non-null means a soft-delete tombstone; the record remains visible to its owner for syncing deletions.

The payload must be a JSON object containing `id`, `title`, `goal`, `notes`, `nextStep`, `stage`, `tasks`, `decisions`, `artifacts`, `miniApps`, `updatedAt`, and `templateSource`. Its string ID must match the row's canonical UUID string. Title must match the row title. Stages are `captured`, `planned`, `working`, and `complete`.

Basic SQL bounds mirror the prototype: title 120, goal 2,000, notes 12,000, next step 400, timestamp 50, template-source ID 100 characters; tasks/decisions/artifacts arrays at most 100 items each; mini-apps at most 10. `templateSource` is a string or JSON null. JSONB's uncompressed text representation is capped at 10 MiB. This limit includes JSONB formatting; leave headroom rather than relying on exact compact `JSON.stringify` byte equality. PostgreSQL character counts and JavaScript UTF-16 string lengths may differ for some Unicode characters.

SQL validates the envelope and basic limits. It does not validate nested task/decision/artifact fields, parse `payload.updatedAt` as a date, or validate mini-app renderer specifications/data. The JavaScript mission/mini-app validators remain required on writes and reads. Incoming snapshots must never be executed as code. Payload `updatedAt` is the client's content timestamp and need not equal server `updated_at`.

Legacy local mission IDs may be non-UUID strings. Copy/normalize such missions to a fresh client UUID with their payload IDs updated before cloud insertion; do not silently overwrite their local originals. The client contract/repository owns that conversion.

## Writes and optimistic concurrency

Insert the complete aggregate with `id`, `owner_id`, `title`, `payload`, and optionally `revision: 1`. Obtain `owner_id` from the actual signed-in session. Omit `created_at` and `updated_at`; the trigger supplies authoritative server values.

For an edit at expected revision `r`, request an UPDATE filtered by both mission ID and `revision = r`, submitting `revision = r + 1` and the complete next title/payload. Return/select the updated row. Exactly one result means success. Zero results means a conflict, missing record, or lost authorization; refetch and reconcile instead of announcing a save. Never retry by unconditionally overwriting a newer revision. Avoid a blind UPSERT: on an existing row it cannot bypass the sequential revision trigger or resolve a conflict.

Soft deletion uses the same compare-and-set update and revision increment, setting `deleted_at` to a non-null timestamp. The trigger replaces a newly requested non-null value with server `now()`. Do not call DELETE. Fetch tombstones during reconciliation; only hide them in the active mission UI after applying their deletion. A deliberately authorized later update can restore a tombstone by clearing `deleted_at`, with the usual revision increment. Restoration must be an explicit application operation; stale offline changes must not resurrect deleted missions.

The index `(owner_id, updated_at, id)` supports account-scoped reads. Full account reconciliation is the initial safe approach. If a later implementation adds an incremental timestamp cursor, use a stable `(updated_at, id)` cursor/overlap plus revision checks; equal timestamps are possible. Realtime is an invalidation/update signal, not a replacement for refetching on reconnect.

## Ownership and setup behavior

Only `authenticated` clients receive SELECT, INSERT and UPDATE grants. Owner SELECT/INSERT/UPDATE policies use `auth.uid() = owner_id`, including UPDATE's `WITH CHECK`. A write trigger independently rejects changing the mission ID, owner, or creation time. There is no client DELETE grant or DELETE policy. The publication registers only this supported table and does not enable all public tables.

The setup runs transactionally and is repeatable for this initial schema. It refuses an existing unmarked table, changed column shape, missing baseline constraints, or unexpected policies instead of silently replacing/migrating it. An administrator must review a deliberate migration for structural changes. It requires the Supabase `auth` schema/roles. If the `supabase_realtime` publication is absent, it reports a NOTICE and completes table setup without replication; enable the publication in Supabase and rerun the schema before claiming realtime works. A preexisting publication covering all tables is left unchanged.

Service-role/elevated database credentials bypass normal client isolation and must never enter the browser. SQL role simulations test table grants/policies, not Supabase Auth's token verification, redirect settings, realtime transport, or the browser's session/cache lifecycle.

## Append-only Learning Ledger

`public.saathi_learning_events` stores one validated `saathi.learning-signal` payload per user feedback event. The row keeps the event ID, mission ID, owner and server append timestamp alongside the complete signal. The event row and payload IDs must match, and the payload is capped at 512 KiB. The client repository appends signals, lists them in stable server-time/ID order, and subscribes only to owner-scoped INSERT invalidations.

The table deliberately has no update or delete grant/policy. A trigger also rejects UPDATE and DELETE so the append-only rule remains explicit if elevated SQL is used accidentally. `learning-loop.mjs` derives pending memory candidates locally from a signal; acceptance, rejection and forget decisions remain a separate reviewed lifecycle. A sensitive signal or a signal without learning consent stays in the ledger but produces no candidate.
