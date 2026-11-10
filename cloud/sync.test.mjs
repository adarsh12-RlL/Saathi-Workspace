import test from "node:test";
import assert from "node:assert/strict";
import { createMissionSync } from "./sync.mjs";

const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function deferred() {
  let resolve; let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function record(id = "one", revision = 1, patch = {}) {
  return { id, ownerId: "owner-a", mission: { id, title: `Revision ${revision}` }, revision,
    createdAt: "2026-10-08T10:00:00Z", updatedAt: "2026-10-08T10:00:00Z", deletedAt: null, ...patch };
}
function target() {
  const listeners = new Map();
  return {
    visibilityState: "visible",
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    dispatch(name) { for (const handler of listeners.get(name) || []) handler(); },
    count(name) { return listeners.get(name)?.size || 0; },
  };
}
function harness(overrides = {}) {
  const states = [];
  const timers = new Map();
  const events = target();
  const visibility = target();
  let invalidation; let status; let watchCount = 0; let cleanupCount = 0; let timerId = 0;
  const repository = {
    list: async () => [], create: async mission => record(mission.id), save: async (mission, revision) => record(mission.id, revision + 1),
    remove: async (id, revision) => record(id, revision + 1, { deletedAt: "2026-10-08T10:05:00Z" }),
    watch(onInvalidate, onStatus) { watchCount += 1; invalidation = onInvalidate; status = onStatus; return () => { cleanupCount += 1; }; },
    ...overrides,
  };
  const controller = createMissionSync({ repository, onState: state => states.push(state), eventTarget: events, visibilityTarget: visibility,
    setIntervalFn(fn, interval) { const id = ++timerId; timers.set(id, { fn, interval }); return id; },
    clearIntervalFn(id) { timers.delete(id); },
  });
  return { controller, repository, states, timers, events, visibility, invalidate: () => invalidation(), watchStatus: value => status(value),
    watchCount: () => watchCount, cleanupCount: () => cleanupCount, last: () => states.at(-1) };
}

test("stale GET cannot overwrite a later write and caller drafts remain independent", async () => {
  const read = deferred();
  let savedDraft;
  const h = harness({ list: () => read.promise, save: async mission => { savedDraft = mission; return record("one", 2); } });
  const initial = h.controller.start();
  await tick();
  const draft = { id: "one", title: "My unsaved draft" };
  await h.controller.save(draft, 1);
  read.resolve([record("one", 1)]);
  await initial;
  assert.equal(h.last().records[0].revision, 2);
  assert.equal(h.last().status, "ready");
  savedDraft.title = "Repository changed its copy";
  assert.equal(draft.title, "My unsaved draft");
  h.controller.stop();
});

test("invalidation bursts coalesce and superseded reads never emit their old payload", async () => {
  const first = deferred(); const second = deferred(); let calls = 0;
  const h = harness({ list: () => (++calls === 1 ? first.promise : second.promise) });
  const started = h.controller.start(); await tick();
  for (let index = 0; index < 20; index += 1) h.invalidate();
  assert.equal(calls, 1);
  first.resolve([record("old", 1)]); await tick();
  assert.equal(calls, 2);
  second.resolve([record("latest", 2)]); await started;
  assert.deepEqual(h.last().records.map(item => item.id), ["latest"]);
  assert.ok(!h.states.some(state => state.records.some(item => item.id === "old")));
  h.controller.stop();
});

test("stop clears resources and ignores late reads, mutations and channel callbacks", async () => {
  const read = deferred(); const write = deferred();
  const h = harness({ list: () => read.promise, create: () => write.promise });
  const started = h.controller.start(); await tick();
  const creating = h.controller.create({ id: "new" });
  h.controller.stop();
  const count = h.states.length;
  h.invalidate(); h.watchStatus("SUBSCRIBED"); h.watchStatus("CHANNEL_ERROR");
  read.resolve([record("old")]); write.resolve(record("new"));
  await Promise.all([started, creating]);
  assert.equal(h.states.length, count);
  assert.equal(h.last().status, "stopped");
  assert.equal(h.cleanupCount(), 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.events.count("focus"), 0);
  assert.equal(h.visibility.count("visibilitychange"), 0);
  await assert.rejects(h.controller.refresh(), { code: "SYNC_STOPPED" });
  await assert.rejects(h.controller.save({ id: "one" }, 1), { code: "SYNC_STOPPED" });
  await assert.rejects(h.controller.start(), { code: "SYNC_STOPPED" });
  h.controller.stop(); assert.equal(h.cleanupCount(), 1);
});

test("revision conflicts preserve data, are never retried and allow later authoritative refresh", async () => {
  let saves = 0; let remote = record("one", 1);
  const conflict = Object.assign(new Error("The mission changed on another device."), { code: "REVISION_CONFLICT" });
  const h = harness({ list: async () => [remote], save: async () => { saves += 1; throw conflict; } });
  await h.controller.start();
  const draft = { id: "one", title: "Keep this draft" };
  await assert.rejects(h.controller.save(draft, 1), { code: "REVISION_CONFLICT" });
  assert.equal(saves, 1);
  assert.equal(h.last().status, "conflict");
  assert.match(h.last().error, /another device/);
  assert.equal(draft.title, "Keep this draft");
  assert.equal(h.last().records[0].revision, 1);
  remote = record("one", 2); await h.controller.refresh();
  assert.equal(h.last().status, "ready"); assert.equal(h.last().records[0].revision, 2);
  assert.equal(saves, 1);
  h.controller.stop();
});

test("concurrent mutations reject clearly rather than dropping work", async () => {
  const saving = deferred(); let saves = 0; let removes = 0;
  const h = harness({ save: () => { saves += 1; return saving.promise; }, remove: async () => { removes += 1; return record(); } });
  await h.controller.start();
  const first = h.controller.save({ id: "one" }, 1);
  await assert.rejects(h.controller.remove("one", 1), { code: "MUTATION_IN_PROGRESS" });
  assert.equal(saves, 1); assert.equal(removes, 0); assert.equal(h.last().status, "saving");
  saving.resolve(record("one", 2)); await first;
  assert.equal(h.last().status, "ready");
  h.controller.stop();
});

test("refresh waits for an active mutation and does not fetch pre-write state", async () => {
  const saving = deferred(); let lists = 0;
  const h = harness({ list: async () => { lists += 1; return [record("one", 2)]; }, save: () => saving.promise });
  await h.controller.start();
  const write = h.controller.save({ id: "one" }, 1);
  const read = h.controller.refresh(); await tick(); assert.equal(lists, 1);
  saving.resolve(record("one", 2)); await Promise.all([write, read]);
  assert.equal(lists, 2); assert.equal(h.last().records[0].revision, 2);
  h.controller.stop();
});

test("visible polling, focus and visibility changes refresh and repeated start is idempotent", async () => {
  let lists = 0;
  const h = harness({ list: async () => { lists += 1; return []; } });
  await h.controller.start(); await h.controller.start();
  assert.equal(h.watchCount(), 1); assert.equal(h.timers.size, 1);
  const timer = [...h.timers.values()][0]; assert.equal(timer.interval, 15000);
  h.visibility.visibilityState = "hidden"; timer.fn(); h.events.dispatch("focus"); await tick(); assert.equal(lists, 1);
  h.visibility.visibilityState = "visible"; h.visibility.dispatch("visibilitychange"); await tick(); assert.equal(lists, 2);
  h.events.dispatch("focus"); await tick(); assert.equal(lists, 3);
  timer.fn(); await tick(); assert.equal(lists, 4);
  h.controller.stop();
});

test("fresh account controllers cannot receive a stopped account's late data", async () => {
  const oldRead = deferred();
  const first = harness({ list: () => oldRead.promise });
  const firstStart = first.controller.start(); await tick(); first.controller.stop();
  const firstCount = first.states.length;
  const second = harness({ list: async () => [record("second-account", 1, { ownerId: "owner-b" })] });
  await second.controller.start();
  oldRead.resolve([record("old-account", 9)]); await firstStart;
  assert.equal(first.states.length, firstCount);
  assert.deepEqual(second.last().records.map(item => item.ownerId), ["owner-b"]);
  second.controller.stop();
});

test("tombstones survive older or incomplete lists and row revisions never regress", async () => {
  let remote = [record("one", 1)];
  const h = harness({ list: async () => remote });
  await h.controller.start(); await h.controller.remove("one", 1);
  assert.equal(h.last().records[0].revision, 2); assert.ok(h.last().records[0].deletedAt);
  await h.controller.refresh();
  assert.equal(h.last().records[0].revision, 2); assert.ok(h.last().records[0].deletedAt);
  remote = []; await h.controller.refresh(); assert.equal(h.last().records.length, 1);
  remote = [record("one", 2, { mission: { title: "Stale equal revision" } })]; await h.controller.refresh();
  assert.ok(h.last().records[0].deletedAt);
  h.controller.stop();
});

test("transient reads can retry and snapshots cannot mutate controller-owned data", async () => {
  let fail = true;
  const h = harness({ list: async () => { if (fail) throw new Error("Temporary connection failure"); return [record()]; } });
  await assert.rejects(h.controller.start(), /Temporary/);
  assert.equal(h.last().status, "error");
  fail = false; await h.controller.refresh();
  assert.equal(h.last().status, "ready"); assert.equal(h.last().error, null);
  assert.throws(() => { h.last().records[0].mission.title = "Changed"; }, TypeError);
  assert.throws(() => { h.last().records.push(record("extra")); }, TypeError);
  assert.equal(h.last().records[0].mission.title, "Revision 1");
  h.controller.stop();
});
