import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
const acceptance = await readFile(new URL("./rls-acceptance.sql", import.meta.url), "utf8");
const USER_A = "00000000-0000-0000-0000-000000000001";
const USER_B = "00000000-0000-0000-0000-000000000002";
const MISSION_A = "10000000-0000-4000-8000-000000000001";
const MISSION_B = "10000000-0000-4000-8000-000000000002";

function snapshot(id = MISSION_A, title = "Owner mission") {
  return {
    id, title, goal: "Keep this private", notes: "", nextStep: "Continue", stage: "captured",
    tasks: [], decisions: [], artifacts: [], miniApps: [],
    updatedAt: "2026-10-08T00:00:00.000Z", templateSource: null,
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
  // Role names are test constants, never user-provided SQL identifiers.
  if (role === "authenticated") await db.exec("SET ROLE authenticated");
  else if (role === "anon") await db.exec("SET ROLE anon");
  else if (role !== "admin") throw new Error("Unsupported test role");
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify(user ? { sub: user, role } : { role }),
  ]);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

test("actual mission schema enforces isolation, versions, and tombstones in local PostgreSQL", async (t) => {
  const db = new PGlite();
  try {
    await bootstrap(db);
    await db.exec(schema);
    await db.exec(schema); // Repeat applies only our own schema; no data destruction.

    await t.test("owner inserts and reads the complete aggregate with server timestamps", async () => {
      await actAs(db, "authenticated", USER_A);
      const { rows } = await db.query(`
        INSERT INTO public.saathi_missions(id,owner_id,title,payload,created_at,updated_at)
        VALUES ($1,$2,$3,$4,'2000-01-01','2000-01-01')
        RETURNING *
      `, [MISSION_A, USER_A, "Owner mission", JSON.stringify(snapshot())]);
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].revision), 1);
      assert.deepEqual(rows[0].payload, snapshot());
      assert.equal(rows[0].created_at.getTime(), rows[0].updated_at.getTime());
      assert.notEqual(rows[0].created_at.getUTCFullYear(), 2000);
      const selected = await db.query("SELECT * FROM public.saathi_missions WHERE id=$1", [MISSION_A]);
      assert.equal(selected.rows.length, 1);
    });

    await t.test("owner CAS succeeds once; stale CAS changes zero rows", async () => {
      const next = { ...snapshot(), goal: "Saved by owner" };
      const updated = await db.query(`
        UPDATE public.saathi_missions SET payload=$2,revision=2
        WHERE id=$1 AND revision=1 RETURNING *
      `, [MISSION_A, JSON.stringify(next)]);
      assert.equal(updated.rows.length, 1);
      assert.equal(Number(updated.rows[0].revision), 2);
      const stale = await db.query(`
        UPDATE public.saathi_missions SET payload=$2,revision=2
        WHERE id=$1 AND revision=1 RETURNING *
      `, [MISSION_A, JSON.stringify(snapshot())]);
      assert.equal(stale.rows.length, 0);
    });

    await t.test("identity, exact next revision, and matching payload envelope cannot be bypassed", async () => {
      await rejectsCode(db.query("UPDATE public.saathi_missions SET revision=4 WHERE id=$1", [MISSION_A]), "23514");
      await rejectsCode(db.query("UPDATE public.saathi_missions SET revision=3,owner_id=$2 WHERE id=$1", [MISSION_A, USER_B]), "23514");
      await rejectsCode(db.query("UPDATE public.saathi_missions SET revision=3,id=$2 WHERE id=$1", [MISSION_A, MISSION_B]), "23514");
      await rejectsCode(db.query("UPDATE public.saathi_missions SET revision=3,created_at='2000-01-01' WHERE id=$1", [MISSION_A]), "23514");
      await rejectsCode(db.query("UPDATE public.saathi_missions SET revision=3,title='Wrong title' WHERE id=$1", [MISSION_A]), "23514");

      for (const badPayload of [
        { ...snapshot(), id: MISSION_B }, { ...snapshot(), title: "Wrong title" },
        { ...snapshot(), tasks: null }, { ...snapshot(), notes: "x".repeat(12001) },
        { ...snapshot(), tasks: Array.from({ length: 101 }, () => ({})) },
        { ...snapshot(), miniApps: Array.from({ length: 11 }, () => ({})) },
        { ...snapshot(), stage: "review" },
        { ...snapshot(), extraData: "x".repeat(10 * 1024 * 1024) },
        Object.fromEntries(Object.entries(snapshot()).filter(([key]) => key !== "decisions")),
      ]) {
        await rejectsCode(db.query("UPDATE public.saathi_missions SET revision=3,payload=$2 WHERE id=$1", [MISSION_A, JSON.stringify(badPayload)]), "23514");
      }
      const unchanged = await db.query("SELECT revision,owner_id,payload FROM public.saathi_missions WHERE id=$1", [MISSION_A]);
      assert.equal(Number(unchanged.rows[0].revision), 2);
      assert.equal(unchanged.rows[0].owner_id, USER_A);
      assert.equal(unchanged.rows[0].payload.goal, "Saved by owner");
    });

    await t.test("owner soft-deletes with a revisioned tombstone and cannot hard-delete", async () => {
      const { rows } = await db.query(`
        UPDATE public.saathi_missions SET revision=3,deleted_at='2000-01-01'
        WHERE id=$1 AND revision=2 RETURNING *
      `, [MISSION_A]);
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].revision), 3);
      assert.equal(rows[0].deleted_at.getTime(), rows[0].updated_at.getTime());
      assert.notEqual(rows[0].deleted_at.getUTCFullYear(), 2000);
      const readable = await db.query("SELECT * FROM public.saathi_missions WHERE id=$1", [MISSION_A]);
      assert.equal(readable.rows.length, 1);
      await rejectsCode(db.query("DELETE FROM public.saathi_missions WHERE id=$1", [MISSION_A]), "42501");
    });

    await t.test("account B reads and changes zero A rows and cannot insert with A ownership", async () => {
      await actAs(db, "authenticated", USER_B);
      assert.equal((await db.query("SELECT * FROM public.saathi_missions WHERE id=$1", [MISSION_A])).rows.length, 0);
      assert.equal((await db.query("UPDATE public.saathi_missions SET revision=4 WHERE id=$1 RETURNING *", [MISSION_A])).rows.length, 0);
      await rejectsCode(db.query(`
        INSERT INTO public.saathi_missions(id,owner_id,title,payload) VALUES($1,$2,$3,$4)
      `, [MISSION_B, USER_A, "Owner mission", JSON.stringify(snapshot(MISSION_B))]), "42501");
      assert.equal((await db.query(`
        INSERT INTO public.saathi_missions(id,owner_id,title,payload) VALUES($1,$2,$3,$4) RETURNING *
      `, [MISSION_B, USER_B, "Owner mission", JSON.stringify(snapshot(MISSION_B))])).rows.length, 1);
      assert.equal((await db.query("SELECT * FROM public.saathi_missions")).rows.length, 1);
    });

    await t.test("anonymous select, insert, update and delete are all denied", async () => {
      await actAs(db, "anon");
      await rejectsCode(db.query("SELECT * FROM public.saathi_missions"), "42501");
      await rejectsCode(db.query("UPDATE public.saathi_missions SET revision=4 WHERE id=$1", [MISSION_A]), "42501");
      await rejectsCode(db.query("DELETE FROM public.saathi_missions WHERE id=$1", [MISSION_A]), "42501");
      await rejectsCode(db.query(`
        INSERT INTO public.saathi_missions(id,owner_id,title,payload) VALUES($1,$2,$3,$4)
      `, ["10000000-0000-4000-8000-000000000003", USER_A, "Owner mission", JSON.stringify(snapshot("10000000-0000-4000-8000-000000000003"))]), "42501");
    });

    await t.test("administrative RLS acceptance script passes and rolls back its fixtures", async () => {
      await actAs(db, "admin");
      const before = await db.query("SELECT count(*)::int AS count FROM public.saathi_missions");
      await db.exec(acceptance);
      const after = await db.query("SELECT count(*)::int AS count FROM public.saathi_missions");
      assert.equal(after.rows[0].count, before.rows[0].count);
      const owner = await db.query("SELECT owner_id,revision,payload FROM public.saathi_missions WHERE id=$1", [MISSION_A]);
      assert.equal(owner.rows[0].owner_id, USER_A);
      assert.equal(Number(owner.rows[0].revision), 3);
      assert.equal(owner.rows[0].payload.goal, "Saved by owner");
    });

    await t.test("an unrelated existing table is refused without rewriting it", async () => {
      await db.exec("ALTER TABLE public.saathi_missions RENAME TO saathi_existing_fixture");
      await db.exec("CREATE TABLE public.saathi_missions (unrelated text)");
      await assert.rejects(db.exec(schema), /already exists with an unknown schema/);
      await db.exec("ROLLBACK");
      const shape = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='saathi_missions'
      `);
      assert.deepEqual(shape.rows, [{ column_name: "unrelated" }]);
      await db.exec("DROP TABLE public.saathi_missions");
      await db.exec("ALTER TABLE public.saathi_existing_fixture RENAME TO saathi_missions");
    });
  } finally {
    await db.close();
  }
});
