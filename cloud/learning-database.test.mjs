import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const schema = await readFile(new URL("./learning-schema.sql", import.meta.url), "utf8");
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const MISSION = "10000000-0000-4000-8000-000000000001";
const EVENT = "20000000-0000-4000-8000-000000000001";

function payload(id = EVENT, missionId = MISSION) {
  return {
    schema: "saathi.learning-signal", version: 1, id, missionId,
    createdAt: "2026-10-08T00:00:00.000Z", outcome: "success", rating: 5,
    reflection: "Keep the first step small.", corrections: [], preferences: [], tags: [],
    reusable: true, allowLearning: true, sensitiveSource: false,
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
}

async function actAs(db, role, user = null) {
  await db.exec("RESET ROLE");
  if (role === "authenticated") await db.exec("SET ROLE authenticated");
  else if (role === "anon") await db.exec("SET ROLE anon");
  else if (role !== "admin") throw new Error("Unsupported test role");
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(user ? { sub: user, role } : { role })]);
}

async function denied(promise) { await assert.rejects(promise, error => ["42501", "23514"].includes(error.code)); }

test("learning event SQL is append-only, owner isolated, and idempotently applicable", async () => {
  const db = new PGlite();
  try {
    await bootstrap(db); await db.exec(schema); await db.exec(schema);
    await actAs(db, "authenticated", USER_A);
    await db.query("INSERT INTO public.saathi_learning_events(id,owner_id,mission_id,payload) VALUES($1,$2,$3,$4)", [EVENT, USER_A, MISSION, JSON.stringify(payload())]);
    const inserted = await db.query("SELECT * FROM public.saathi_learning_events WHERE id=$1", [EVENT]);
    assert.equal(inserted.rows.length, 1); assert.equal(inserted.rows[0].owner_id, USER_A);
    assert.notEqual(inserted.rows[0].created_at.getUTCFullYear(), 2000);

    await denied(db.query("UPDATE public.saathi_learning_events SET mission_id=$2 WHERE id=$1", [EVENT, MISSION]));
    await denied(db.query("DELETE FROM public.saathi_learning_events WHERE id=$1", [EVENT]));
    await actAs(db, "authenticated", USER_B);
    assert.equal((await db.query("SELECT * FROM public.saathi_learning_events WHERE id=$1", [EVENT])).rows.length, 0);
    await denied(db.query("INSERT INTO public.saathi_learning_events(id,owner_id,mission_id,payload) VALUES($1,$2,$3,$4)", ["20000000-0000-4000-8000-000000000002", USER_A, MISSION, JSON.stringify(payload("20000000-0000-4000-8000-000000000002"))]));
    await actAs(db, "anon");
    await denied(db.query("SELECT * FROM public.saathi_learning_events"));
    await denied(db.query("INSERT INTO public.saathi_learning_events(id,owner_id,mission_id,payload) VALUES($1,$2,$3,$4)", ["20000000-0000-4000-8000-000000000003", USER_A, MISSION, JSON.stringify(payload("20000000-0000-4000-8000-000000000003"))]));
  } finally { await db.close(); }
});

test("learning event SQL rejects payload identity mismatches and unknown tables", async () => {
  const db = new PGlite();
  try {
    await bootstrap(db); await db.exec(schema);
    await actAs(db, "authenticated", USER_A);
    await assert.rejects(db.query("INSERT INTO public.saathi_learning_events(id,owner_id,mission_id,payload) VALUES($1,$2,$3,$4)", [EVENT, USER_A, MISSION, JSON.stringify(payload(EVENT, "10000000-0000-4000-8000-000000000009"))]), /check constraint/);
    await actAs(db, "admin");
    await db.exec("ALTER TABLE public.saathi_learning_events RENAME TO saathi_learning_existing_fixture");
    await db.exec("CREATE TABLE public.saathi_learning_events (unrelated text)");
    await assert.rejects(db.exec(schema), /unknown schema/);
  } finally { await db.close(); }
});
