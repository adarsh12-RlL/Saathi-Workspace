import test from "node:test";
import assert from "node:assert/strict";
import { createLearningEventRepository, LEARNING_EVENTS_TABLE } from "./learning-repository.mjs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MISSION = "33333333-3333-4333-8333-333333333333";
const stamp = "2026-10-08T10:00:00.000Z";

function signal(id = "44444444-4444-4444-8444-444444444444") {
  return {
    schema: "saathi.learning-signal", version: 1, id, missionId: MISSION, createdAt: stamp,
    outcome: "partial", rating: 4, reflection: "Make the first step smaller.", corrections: [],
    preferences: ["Use short checklists."], tags: ["planning"], reusable: true,
    allowLearning: true, sensitiveSource: false,
  };
}

function fakeClient(reply) {
  const calls = []; const registrations = []; let removed = 0;
  const channel = { on(type, config, handler) { registrations.push({ type, config, handler }); return this; }, subscribe(callback) { callback("SUBSCRIBED"); return this; } };
  return {
    calls, registrations, get removed() { return removed; },
    from(table) {
      const query = { table, calls: [], range: null };
      calls.push(query);
      const builder = { then(resolve, reject) { return Promise.resolve().then(() => reply(query)).then(resolve, reject); } };
      for (const method of ["select", "eq", "order", "range", "insert"]) builder[method] = (...args) => { query.calls.push([method, ...args]); if (method === "range") query.range = args; return builder; };
      builder.single = () => { query.calls.push(["single"]); return Promise.resolve().then(() => reply(query)); };
      return builder;
    },
    channel: () => channel,
    removeChannel: async () => { removed += 1; },
  };
}

function row(payload, owner = OWNER) {
  return { id: payload.id, owner_id: owner, mission_id: payload.missionId, event_type: "learning_signal", payload, created_at: stamp };
}

test("learning event repository validates append-only owner records", async () => {
  const payload = signal();
  const client = fakeClient(() => ({ data: row(payload), error: null }));
  const repository = createLearningEventRepository(client, OWNER);
  const result = await repository.append(payload);
  assert.equal(result.ownerId, OWNER);
  assert.equal(result.missionId, MISSION);
  assert.equal(client.calls[0].table, LEARNING_EVENTS_TABLE);
  assert.deepEqual(client.calls[0].calls.find(call => call[0] === "insert")[1], {
    id: payload.id, owner_id: OWNER, mission_id: MISSION, event_type: "learning_signal", payload,
  });
  await assert.rejects(createLearningEventRepository(client, OTHER).append(payload), /another account/);
});

test("learning event repository paginates and rejects cross-account or malformed rows", async () => {
  const payload = signal();
  const client = fakeClient(query => ({ data: query.range[0] === 0 ? [row(payload)] : [], error: null }));
  const records = await createLearningEventRepository(client, OWNER).list();
  assert.equal(records.length, 1);
  assert.equal(client.calls[0].calls.find(call => call[0] === "order")[1], "created_at");

  const foreign = fakeClient(() => ({ data: [row(payload, OTHER)], error: null }));
  await assert.rejects(createLearningEventRepository(foreign, OWNER).list(), /another account/);
  const malformed = fakeClient(() => ({ data: [{ ...row(payload), event_type: "other" }], error: null }));
  await assert.rejects(createLearningEventRepository(malformed, OWNER).list(), /Unsupported/);
});

test("learning event realtime watches only owned inserts and stops after cleanup", () => {
  const payload = signal(); let invalidations = 0;
  const client = fakeClient(() => ({ data: [], error: null }));
  const stop = createLearningEventRepository(client, OWNER).watch(() => { invalidations += 1; });
  assert.deepEqual(client.registrations.map(value => value.type), ["postgres_changes"]);
  assert.equal(client.registrations[0].config.event, "INSERT");
  assert.equal(client.registrations[0].config.table, LEARNING_EVENTS_TABLE);
  assert.equal(client.registrations[0].config.filter, `owner_id=eq.${OWNER}`);
  client.registrations[0].handler(); stop(); client.registrations[0].handler();
  assert.equal(invalidations, 1); assert.equal(client.removed, 1);
  assert.equal(payload.missionId, MISSION);
});
