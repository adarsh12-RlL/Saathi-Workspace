import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const learningSchema = await readFile(new URL("./learning-schema.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("./memory-decisions-schema.sql", import.meta.url), "utf8");
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const MISSION = "33333333-3333-4333-8333-333333333333";
const SIGNAL = "44444444-4444-4444-8444-444444444444";
const SIGNAL_B = "55555555-5555-4555-8555-555555555555";
const CANDIDATE = "66666666-6666-8666-8666-666666666666";
const stamp = "2026-10-09T10:00:00.000Z";
const eventId = index => `77777777-7777-4777-8777-${index.toString().padStart(12, "0")}`;

function learning(id = SIGNAL, overrides = {}) {
  return {
    schema: "saathi.learning-signal", version: 1, id, missionId: MISSION, createdAt: stamp,
    outcome: "success", rating: 5, reflection: "Keep the first step small.", corrections: [], preferences: [], tags: [],
    reusable: true, allowLearning: true, sensitiveSource: false, ...overrides,
  };
}
function decision(id = eventId(1), overrides = {}) {
  return {
    schema: "saathi.memory-decision", version: 1, id, signalId: SIGNAL, candidateId: CANDIDATE, missionId: MISSION,
    action: "accept", statement: null, createdAt: stamp, ...overrides,
  };
}
async function bootstrap(db) {
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
    $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
  `);
  await db.query("INSERT INTO auth.users(id) VALUES ($1), ($2)", [USER_A, USER_B]);
  await db.exec(learningSchema);
  await db.exec(schema);
}
async function actAs(db, role, user = null) {
  await db.exec("RESET ROLE");
  if (role === "authenticated") await db.exec("SET ROLE authenticated");
  else if (role === "anon") await db.exec("SET ROLE anon");
  else if (role !== "admin") throw new Error("Unsupported test role");
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(user ? { sub: user, role } : { role })]);
}
async function appendSource(db, owner = USER_A, payload = learning()) {
  return db.query("INSERT INTO public.saathi_learning_events(id,owner_id,mission_id,payload) VALUES($1,$2,$3,$4)", [payload.id, owner, payload.missionId, JSON.stringify(payload)]);
}
async function appendDecision(db, owner = USER_A, payload = decision(), columns = {}) {
  return db.query(`
    INSERT INTO public.saathi_memory_decisions(id,owner_id,signal_id,candidate_id,mission_id,action,payload,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,'2000-01-01') RETURNING *
  `, [columns.id ?? payload.id, owner, columns.signalId ?? payload.signalId, columns.candidateId ?? payload.candidateId, columns.missionId ?? payload.missionId, columns.action ?? payload.action, JSON.stringify(payload)]);
}
async function denied(promise) {
  await assert.rejects(promise, error => ["42501", "23514", "23503", "22007", "22008", "22P02"].includes(error.code));
}

test("memory review SQL is repeatable, owner isolated and append-only with server append time", async () => {
  const db = new PGlite();
  try {
    await bootstrap(db); await db.exec(schema);
    await actAs(db, "authenticated", USER_A);
    await appendSource(db);
    const inserted = (await appendDecision(db)).rows[0];
    assert.equal(inserted.owner_id, USER_A);
    assert.deepEqual(inserted.payload, decision());
    assert.notEqual(inserted.created_at.getUTCFullYear(), 2000);
    assert.equal((await db.query("SELECT * FROM public.saathi_memory_decisions")).rows.length, 1);
    await denied(db.query("UPDATE public.saathi_memory_decisions SET action='reject' WHERE id=$1", [decision().id]));
    await denied(db.query("DELETE FROM public.saathi_memory_decisions WHERE id=$1", [decision().id]));

    await actAs(db, "authenticated", USER_B);
    assert.equal((await db.query("SELECT * FROM public.saathi_memory_decisions")).rows.length, 0);
    await denied(appendDecision(db, USER_A, decision(eventId(2))));
    // The attacker knows the signal ID but cannot bind it to their own account.
    await denied(appendDecision(db, USER_B, decision(eventId(3))));
    await actAs(db, "anon");
    await denied(db.query("SELECT * FROM public.saathi_memory_decisions"));
    await denied(appendDecision(db, USER_A, decision(eventId(4))));

    await actAs(db, "admin");
    // Removing RLS does not turn this append-only table into an update API.
    await denied(db.query("UPDATE public.saathi_memory_decisions SET action='reject' WHERE id=$1", [decision().id]));
    await denied(db.query("DELETE FROM public.saathi_memory_decisions WHERE id=$1", [decision().id]));
    assert.equal((await db.query("SELECT * FROM public.saathi_memory_decisions")).rows.length, 1);
  } finally { await db.close(); }
});

test("memory SQL requires the same owner's source mission and explicit learning consent", async () => {
  const db = new PGlite();
  try {
    await bootstrap(db);
    await actAs(db, "authenticated", USER_B); await appendSource(db, USER_B, learning(SIGNAL_B));
    await actAs(db, "authenticated", USER_A); await appendSource(db);
    await denied(appendDecision(db, USER_A, decision(eventId(1), { signalId: SIGNAL_B })));
    await denied(appendDecision(db, USER_A, decision(eventId(2), { signalId: eventId(90) })));
    await denied(appendDecision(db, USER_A, decision(eventId(3), { missionId: eventId(91) })));
    const optedOut = eventId(80), sensitive = eventId(81);
    await appendSource(db, USER_A, learning(optedOut, { allowLearning: false }));
    await appendSource(db, USER_A, learning(sensitive, { sensitiveSource: true }));
    for (const sourceId of [optedOut, sensitive]) {
      for (const action of ["accept", "edit", "reject", "forget"]) {
        await denied(appendDecision(db, USER_A, decision(eventId(10), { signalId: sourceId, action, statement: action === "edit" ? "Try again." : null })));
      }
    }
    assert.equal((await db.query("SELECT * FROM public.saathi_memory_decisions")).rows.length, 0);
  } finally { await db.close(); }
});

test("memory SQL rejects hostile envelopes, mismatched identity and statement misuse", async () => {
  const db = new PGlite();
  try {
    await bootstrap(db); await actAs(db, "authenticated", USER_A); await appendSource(db);
    const invalids = [
      { schema: "other" }, { schema: null }, { version: "1" }, { version: null }, { version: 2 },
      { id: eventId(70) }, { signalId: SIGNAL_B }, { candidateId: eventId(72) }, { missionId: eventId(73) },
      { statement: "Only edits can carry text." }, { action: "execute" }, { extra: "unreviewed" },
      { createdAt: "2026-10-09" }, { createdAt: "2026-02-30T10:00:00Z" },
      { action: "edit", statement: null }, { action: "edit", statement: " " }, { action: "edit", statement: "x".repeat(1001) },
    ];
    for (let index = 0; index < invalids.length; index++) {
      const valid = decision(eventId(index + 1));
      const bad = { ...valid, ...invalids[index] };
      await denied(appendDecision(db, USER_A, bad, {
        id: valid.id, signalId: valid.signalId, candidateId: valid.candidateId, missionId: valid.missionId,
        action: ["edit", "execute"].includes(bad.action) ? bad.action : valid.action,
      }));
    }
    const missing = decision(eventId(60)); delete missing.statement;
    await denied(appendDecision(db, USER_A, missing));
    const edit = decision(eventId(61), { action: "edit", statement: "Use a checklist." });
    assert.equal((await appendDecision(db, USER_A, edit)).rows[0].action, "edit");
    // Conflicting decisions remain evidence; deterministic projection resolves
    // them using server ordering and does not overwrite the first row.
    await appendDecision(db, USER_A, decision(eventId(62)));
    await appendDecision(db, USER_A, decision(eventId(63), { action: "reject" }));
    assert.equal((await db.query("SELECT * FROM public.saathi_memory_decisions")).rows.length, 3);
  } finally { await db.close(); }
});

test("memory migration refuses an unrelated table or added permissive policies", async () => {
  const unrelated = new PGlite();
  try {
    await bootstrap(unrelated);
    await unrelated.exec("ALTER TABLE public.saathi_memory_decisions RENAME TO saathi_memory_fixture");
    await unrelated.exec("CREATE TABLE public.saathi_memory_decisions (unrelated text)");
    await assert.rejects(unrelated.exec(schema), /unknown schema/);
  } finally { await unrelated.close(); }
  const permissive = new PGlite();
  try {
    await bootstrap(permissive);
    await permissive.exec("CREATE POLICY unexpected_allow_all ON public.saathi_memory_decisions FOR SELECT TO authenticated USING (true)");
    await assert.rejects(permissive.exec(schema), /Unexpected.*RLS/);
  } finally { await permissive.close(); }
});
