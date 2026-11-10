import test from "node:test";
import assert from "node:assert/strict";
import { validateMissionSnapshot, validateCloudRow, prepareMissionForCloud } from "./contracts.mjs";
import { createMissionRepository } from "./repository.mjs";
import { DEFAULT_SPECS, makeInstance } from "../mini-app-engine.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const stamp = "2026-10-08T10:00:00.000Z";
const id = index => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const mission = (index = 1) => ({ id: id(index), title: "A mission", goal: "Finish it", notes: "", nextStep: "Start", stage: "planned", tasks: [], decisions: [], artifacts: [], miniApps: [], updatedAt: stamp, templateSource: null });
const row = (index = 1, rev = 1) => ({ id: id(index), owner_id: A, revision: rev, title: "A mission", payload: mission(index), created_at: stamp, updated_at: stamp, deleted_at: null });

function fakeClient(reply) {
  const calls = []; const registrations = []; let removed = 0;
  const channel = { on(type, config, handler) { registrations.push({ type, config, handler }); return this; }, subscribe(callback) { callback("SUBSCRIBED"); return this; } };
  return {
    calls, registrations, get removed() { return removed; },
    from(table) {
      const query = { table, calls: [], range: null };
      calls.push(query);
      const builder = { then(resolve, reject) { return Promise.resolve().then(() => reply(query)).then(resolve, reject); } };
      for (const method of ["select", "eq", "order", "range", "insert", "update", "is"]) builder[method] = (...args) => { query.calls.push([method, ...args]); if (method === "range") query.range = args; return builder; };
      for (const method of ["single", "maybeSingle"]) builder[method] = () => { query.calls.push([method]); return Promise.resolve().then(() => reply(query)); };
      return builder;
    },
    channel: () => channel,
    removeChannel: async () => { removed += 1; }
  };
}

test("cloud snapshots normalize legacy mini-app omission and reject hostile/malformed records", () => {
  const legacy = mission(); delete legacy.miniApps;
  assert.deepEqual(validateMissionSnapshot(legacy).miniApps, []);
  for (const value of [ { ...mission(), owner_id: B }, { ...mission(), stage: "review" }, { ...mission(), updatedAt: "2026-02-30T10:00:00Z" }, { ...mission(), miniApps: null } ]) assert.throws(() => validateMissionSnapshot(value));
  assert.throws(() => validateMissionSnapshot({ ...mission(), tasks: [{ id: "same", title: "x", done: false }, { id: "same", title: "y", done: false }] }), /Duplicate/);
  assert.throws(() => validateCloudRow({ ...row(), owner_id: B }, A), /another account/);
  assert.throws(() => validateCloudRow({ ...row(), title: "Mismatched" }, A), /do not match/);
  assert.equal(validateCloudRow({ ...row(), revision: Number.MAX_SAFE_INTEGER }, A).revision, Number.MAX_SAFE_INTEGER);
});

test("mission reflections are bounded, normalized and backward compatible", () => {
  const checked = validateMissionSnapshot({
    ...mission(),
    reflection: {
      outcome: "partial",
      rating: 4,
      friction: ["scope", "clarity"],
      lesson: "Define the finish line before starting.",
      repeat: "yes",
      personalMemory: "Start with a smaller first milestone.",
      reviewedAt: stamp,
    },
  });
  assert.deepEqual(checked.reflection, {
    outcome: "partial",
    rating: 4,
    friction: ["scope", "clarity"],
    lesson: "Define the finish line before starting.",
    repeat: "yes",
    personalMemory: "Start with a smaller first milestone.",
    reviewedAt: stamp,
  });
  assert.equal(validateMissionSnapshot({ ...mission(), reflection: { outcome: "achieved", friction: [], lesson: "", repeat: "maybe", personalMemory: null, reviewedAt: stamp } }).reflection?.rating, 3);
  assert.equal(validateMissionSnapshot(mission()).reflection, null);
  for (const reflection of [
    { outcome: "unknown", rating: 4, friction: [], lesson: "", repeat: "yes", personalMemory: null, reviewedAt: stamp },
    { outcome: "achieved", rating: 0, friction: ["scope", "scope"], lesson: "", repeat: "yes", personalMemory: null, reviewedAt: stamp },
    { outcome: "achieved", rating: 4, friction: [], lesson: "", repeat: "yes", personalMemory: "", reviewedAt: stamp },
    { outcome: "achieved", rating: 4, friction: [], lesson: "", repeat: "yes", personalMemory: null, reviewedAt: "2026-02-30T10:00:00Z" },
  ]) assert.throws(() => validateMissionSnapshot({ ...mission(), reflection }), /Invalid|Duplicate/);
});

test("explicit local-to-cloud copy creates independent mission/installation IDs and keeps app data", () => {
  const local = { ...mission(), id: "legacy-local-id", miniApps: [makeInstance(DEFAULT_SPECS[0], "local-app", stamp)] };
  local.miniApps[0].data.entries.push({ id: "entry", values: { date: "2026-10-08", food: "Apple", calories: 80 } });
  let next = 30;
  const prepared = prepareMissionForCloud(local, { newId: () => id(next++), at: stamp });
  assert.equal(prepared.id, id(30)); assert.equal(prepared.miniApps[0].id, id(31));
  assert.equal(local.id, "legacy-local-id");
  prepared.miniApps[0].data.entries[0].values.food = "Different";
  assert.equal(local.miniApps[0].data.entries[0].values.food, "Apple");
});

test("repository CAS writes bind owner, expected revision and non-deleted state; zero rows conflict", async () => {
  const client = fakeClient(() => ({ data: null, error: null }));
  const repository = createMissionRepository(client, A);
  await assert.rejects(repository.save(mission(), 7), error => error.code === "REVISION_CONFLICT");
  const call = client.calls[0];
  assert(call.calls.some(value => value[0] === "eq" && value[1] === "owner_id" && value[2] === A));
  assert(call.calls.some(value => value[0] === "eq" && value[1] === "revision" && value[2] === 7));
  assert(call.calls.some(value => value[0] === "is" && value[1] === "deleted_at" && value[2] === null));
  assert.equal(call.calls.find(value => value[0] === "update")[1].revision, 8);
  await assert.rejects(repository.save(mission(), Number.MAX_SAFE_INTEGER), /limit/);
});

test("creation confirms the returned row and propagates permission/network failures", async () => {
  const ok = fakeClient(() => ({ data: row(), error: null }));
  const created = await createMissionRepository(ok, A).create(mission());
  assert.equal(created.ownerId, A);
  assert.equal(ok.calls[0].calls.find(value => value[0] === "insert")[1].owner_id, A);
  const denied = fakeClient(() => ({ data: null, error: { code: "42501", message: "Denied" } }));
  await assert.rejects(createMissionRepository(denied, A).create(mission()), error => error.code === "42501");
});

test("soft delete keeps a returned tombstone instead of issuing hard DELETE", async () => {
  const deleted = { ...row(1, 2), deleted_at: stamp };
  const client = fakeClient(() => ({ data: deleted, error: null }));
  const result = await createMissionRepository(client, A).remove(id(1), 1);
  assert.equal(result.deletedAt, stamp);
  assert.equal(client.calls[0].calls.find(value => value[0] === "update")[1].revision, 2);
});

test("list pagination fetches beyond server default limits and rejects oversize short final pages", async () => {
  const count = 101;
  const client = fakeClient(query => ({ data: Array.from({ length: Math.max(0, Math.min(100, count - query.range[0])) }, (_, index) => row(query.range[0] + index)), error: null }));
  assert.equal((await createMissionRepository(client, A).list()).length, count);
  assert.equal(client.calls.length, 2);
  const large = fakeClient(query => ({ data: Array.from({ length: Math.max(0, Math.min(100, 10001 - query.range[0])) }, (_, index) => row(query.range[0] + index)), error: null }));
  await assert.rejects(createMissionRepository(large, A).list(), /10,000/);
});

test("realtime listens only for owned INSERT/UPDATE and ignores callbacks after cleanup", async () => {
  const client = fakeClient(() => ({ data: [], error: null })); let invalidations = 0;
  const stop = createMissionRepository(client, A).watch(() => { invalidations += 1; });
  assert.deepEqual(client.registrations.map(value => value.config.event), ["INSERT", "UPDATE"]);
  assert(client.registrations.every(value => value.config.filter === `owner_id=eq.${A}`));
  client.registrations[0].handler(); stop(); client.registrations[1].handler();
  assert.equal(invalidations, 1); assert.equal(client.removed, 1);
});
