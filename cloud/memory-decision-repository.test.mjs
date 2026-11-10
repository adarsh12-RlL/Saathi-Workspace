import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDecisionRepository, MEMORY_DECISIONS_TABLE } from "./memory-decision-repository.mjs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SIGNAL = "33333333-3333-4333-8333-333333333333";
const MISSION = "44444444-4444-4444-8444-444444444444";
const CANDIDATE = "55555555-5555-8555-8555-555555555555";
const stamp = "2026-10-09T10:00:00.000Z";
const id = index => `66666666-6666-4666-8666-${index.toString().padStart(12, "0")}`;
function payload(index = 1) {
  return { schema: "saathi.memory-decision", version: 1, id: id(index), signalId: SIGNAL, candidateId: CANDIDATE, missionId: MISSION, action: "accept", statement: null, createdAt: stamp };
}
function row(decision = payload(), owner = OWNER) {
  return { id: decision.id, owner_id: owner, signal_id: decision.signalId, candidate_id: decision.candidateId, mission_id: decision.missionId, action: decision.action, payload: decision, created_at: stamp };
}
function fakeClient(reply) {
  const calls = [], registrations = [], statuses = []; let removed = 0;
  const channel = {
    on(type, config, handler) { registrations.push({ type, config, handler }); return this; },
    subscribe(callback) { statuses.push(callback); callback("SUBSCRIBED"); return this; },
  };
  return {
    calls, registrations, statuses, get removed() { return removed; },
    from(table) {
      const query = { table, calls: [], range: null }; calls.push(query);
      const builder = { then(resolve, reject) { return Promise.resolve().then(() => reply(query)).then(resolve, reject); } };
      for (const method of ["select", "eq", "order", "range", "insert"]) builder[method] = (...args) => { query.calls.push([method, ...args]); if (method === "range") query.range = args; return builder; };
      builder.single = () => { query.calls.push(["single"]); return Promise.resolve().then(() => reply(query)); };
      return builder;
    },
    channel: () => channel,
    removeChannel: async () => { removed++; },
  };
}

test("memory repository sends only validated owner-scoped append records", async () => {
  const client = fakeClient(() => ({ data: row(), error: null }));
  const repository = createMemoryDecisionRepository(client, OWNER);
  const result = await repository.append(payload());
  assert.equal(result.ownerId, OWNER);
  assert.equal(result.signalId, SIGNAL);
  assert.equal(client.calls[0].table, MEMORY_DECISIONS_TABLE);
  assert.deepEqual(client.calls[0].calls.find(call => call[0] === "insert")[1], {
    id: payload().id, owner_id: OWNER, signal_id: SIGNAL, candidate_id: CANDIDATE, mission_id: MISSION, action: "accept", payload: payload(),
  });
  const count = client.calls.length;
  await assert.rejects(repository.append({ ...payload(), statement: "Unapproved text" }), /Only edit/);
  assert.equal(client.calls.length, count);
  await assert.rejects(createMemoryDecisionRepository(client, OTHER).append(payload()), /another account/);
});

test("memory list paginates in authoritative server order with an owner filter", async () => {
  const client = fakeClient(query => ({ data: query.range[0] === 0 ? Array.from({ length: 100 }, (_, index) => row(payload(index + 1))) : [row(payload(101))], error: null }));
  const records = await createMemoryDecisionRepository(client, OWNER).list();
  assert.equal(records.length, 101);
  assert.equal(client.calls.length, 2);
  for (const query of client.calls) {
    assert.deepEqual(query.calls.find(call => call[0] === "eq"), ["eq", "owner_id", OWNER]);
    assert.deepEqual(query.calls.filter(call => call[0] === "order").map(call => call[1]), ["created_at", "id"]);
  }
  const foreign = fakeClient(() => ({ data: [row(payload(), OTHER)], error: null }));
  await assert.rejects(createMemoryDecisionRepository(foreign, OWNER).list(), /another account/);
});

test("memory list rejects identity mismatches, hostile rows and pagination duplicates", async () => {
  for (const bad of [{ ...row(), signal_id: OTHER }, { ...row(), mission_id: OTHER }, { ...row(), action: "reject" }, { ...row(), created_at: "bad" }]) {
    await assert.rejects(createMemoryDecisionRepository(fakeClient(() => ({ data: [bad], error: null })), OWNER).list());
  }
  let read = false;
  const hostile = row();
  Object.defineProperty(hostile, "owner_id", { enumerable: true, get() { read = true; return OWNER; } });
  await assert.rejects(createMemoryDecisionRepository(fakeClient(() => ({ data: [hostile], error: null })), OWNER).list(), /property/);
  assert.equal(read, false);
  const duplicates = fakeClient(query => ({ data: query.range[0] === 0 ? Array.from({ length: 100 }, (_, index) => row(payload(index + 1))) : [row()], error: null }));
  await assert.rejects(createMemoryDecisionRepository(duplicates, OWNER).list(), /changed during pagination/);
});

test("memory repository preserves cloud failures and requires confirmation", async () => {
  const errorClient = fakeClient(() => ({ error: { code: "42501", message: "Denied" }, data: null }));
  await assert.rejects(createMemoryDecisionRepository(errorClient, OWNER).append(payload()), error => error.code === "42501" && error.message === "Denied");
  const missing = fakeClient(() => ({ error: null, data: null }));
  await assert.rejects(createMemoryDecisionRepository(missing, OWNER).append(payload()), /did not confirm/);
});

test("memory realtime watches only owned inserts and ignores callbacks after cleanup", () => {
  let invalidated = 0; const statuses = [];
  const client = fakeClient(() => ({ data: [], error: null }));
  const stop = createMemoryDecisionRepository(client, OWNER).watch(() => invalidated++, status => statuses.push(status));
  assert.deepEqual(client.registrations[0].config, { event: "INSERT", schema: "public", table: MEMORY_DECISIONS_TABLE, filter: `owner_id=eq.${OWNER}` });
  client.registrations[0].handler(); stop(); client.registrations[0].handler(); client.statuses[0]("CLOSED");
  assert.equal(invalidated, 1);
  assert.equal(client.removed, 1);
  assert.deepEqual(statuses, ["SUBSCRIBED"]);
});
