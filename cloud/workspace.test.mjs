import test from "node:test";
import assert from "node:assert/strict";
import { createCloudWorkspace } from "./workspace.mjs";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeHarness() {
  let currentUser = null;
  let authCallback;
  let nextTimer = 1;
  const timers = new Map();
  const states = [];
  const controllers = [];
  const pendingCreates = [];
  const client = {
    auth: {
      async getUser() { return { data: { user: currentUser }, error: null }; },
      onAuthStateChange(callback) {
        authCallback = callback;
        return { data: { subscription: { unsubscribe() { authCallback = null; } } } };
      },
      async signInWithPassword() { return { data: { session: { access_token: "test" } }, error: null }; },
      async signUp() { return { data: { session: null, user: null }, error: null }; },
      async signOut() { currentUser = null; return { error: null }; },
    },
  };
  const repositoryFactory = (_client, ownerId) => ({ ownerId });
  const syncFactory = ({ repository, onState }) => {
    let stopped = false;
    let resolveCreate;
    const controller = {
      ownerId: repository.ownerId,
      async start() {
        if (!stopped) onState({ status: "ready", records: [{ id: `${repository.ownerId}-mission`, ownerId: repository.ownerId, revision: 1 }], error: null });
      },
      refresh: async () => {},
      create: async mission => {
        if (mission?.pending) {
          await new Promise(resolve => { resolveCreate = resolve; pendingCreates.push(() => resolve()); });
        }
        return { id: `${repository.ownerId}-created`, ownerId: repository.ownerId, revision: 1, mission };
      },
      save: async () => ({}),
      remove: async () => ({}),
      stop() { stopped = true; controller.stopped = true; },
      stopped: false,
      resolveCreate() { resolveCreate?.(); },
    };
    controllers.push(controller);
    return controller;
  };
  const workspace = createCloudWorkspace(client, {
    onState: state => states.push(state),
    repositoryFactory,
    syncFactory,
    authOptions: {
      setTimeoutFn(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
      clearTimeoutFn(id) { timers.delete(id); },
    },
  });
  return {
    workspace, states, controllers,
    setUser(user) { currentUser = user; },
    emit(event, session) { authCallback?.(event, session); },
    async runTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const callback of callbacks) await callback();
    },
    async flush() { await Promise.resolve(); await Promise.resolve(); },
  };
}

test("signed-out startup has no owner and rejects cloud mutations", async () => {
  const h = makeHarness();
  await h.workspace.start();
  assert.equal(h.workspace.getState().auth.status, "signed-out");
  assert.equal(h.workspace.getState().ownerId, null);
  assert.equal(h.workspace.getState().sync.records.length, 0);
  await assert.rejects(() => h.workspace.create({}), /Sign in before changing/);
});

test("account changes stop the old controller and clear its records before the new check", async () => {
  const h = makeHarness();
  await h.workspace.start();
  h.setUser({ id: USER_A, email: "a@example.test" });
  h.emit("SIGNED_IN", { user: { id: USER_A } });
  await h.runTimers();
  assert.equal(h.workspace.getState().ownerId, USER_A);
  assert.equal(h.controllers.length, 1);
  assert.equal(h.workspace.getState().sync.records[0].ownerId, USER_A);

  h.setUser({ id: USER_B, email: "b@example.test" });
  h.emit("SIGNED_IN", { user: { id: USER_B } });
  assert.equal(h.workspace.getState().ownerId, null);
  assert.equal(h.workspace.getState().sync.records.length, 0);
  assert.equal(h.controllers[0].stopped, true);
  await h.runTimers();
  assert.equal(h.workspace.getState().ownerId, USER_B);
  assert.equal(h.workspace.getState().sync.records[0].ownerId, USER_B);
});

test("a late mutation from an old account cannot return as the new account", async () => {
  const h = makeHarness();
  await h.workspace.start();
  h.setUser({ id: USER_A, email: "a@example.test" });
  h.emit("SIGNED_IN", { user: { id: USER_A } });
  await h.runTimers();
  const oldCreate = h.workspace.create({ pending: true });
  await h.flush();

  h.setUser({ id: USER_B, email: "b@example.test" });
  h.emit("SIGNED_IN", { user: { id: USER_B } });
  await h.runTimers();
  h.controllers[0].resolveCreate();
  await assert.rejects(oldCreate, error => error?.code === "SESSION_CHANGED");
  assert.equal(h.workspace.getState().ownerId, USER_B);
  assert.equal(h.workspace.getState().sync.records[0].ownerId, USER_B);
});

test("stop unsubscribes and prevents later auth events or mutations", async () => {
  const h = makeHarness();
  await h.workspace.start();
  h.workspace.stop();
  assert.equal(h.workspace.getState().auth.status, "stopped");
  h.setUser({ id: USER_A, email: "a@example.test" });
  h.emit("SIGNED_IN", { user: { id: USER_A } });
  await h.runTimers();
  assert.equal(h.workspace.getState().ownerId, null);
  await assert.rejects(() => h.workspace.save({}, 1), /Sign in before changing/);
});
