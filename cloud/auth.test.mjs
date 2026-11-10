import test from "node:test";
import assert from "node:assert/strict";
import { createAuthController } from "./auth.mjs";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function harness() {
  let callback = null;
  let currentUser = null;
  let timerId = 0;
  const timers = new Map();
  const states = [];
  const pendingReads = [];
  let nextRead = null;
  let signInDelay = null;
  let signUpSession = null;
  let unsubscribed = false;
  const auth = {
    async getUser() {
      if (nextRead) {
        const read = nextRead;
        nextRead = null;
        return read();
      }
      return { data: { user: currentUser }, error: null };
    },
    onAuthStateChange(listener) {
      callback = listener;
      return { data: { subscription: { unsubscribe() { unsubscribed = true; callback = null; } } } };
    },
    async signInWithPassword() {
      currentUser = { id: USER_ID, email: "person@example.test" };
      if (signInDelay) await signInDelay();
      return { data: { session: { access_token: "opaque-test-token" } }, error: null };
    },
    async signUp() { return { data: { session: signUpSession }, error: null }; },
    async signOut() { currentUser = null; return { error: null }; },
  };
  const controller = createAuthController({ auth }, {
    onState: state => states.push(state),
    setTimeoutFn(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeoutFn(id) { timers.delete(id); },
  });
  return {
    controller, auth, states,
    setUser(user) { currentUser = user; },
    emit(event, session) { callback?.(event, session); },
    blockNextRead() {
      let resolve;
      nextRead = () => new Promise(done => { resolve = done; pendingReads.push(resolve); });
      return () => pendingReads.shift()({ data: { user: currentUser }, error: null });
    },
    setRaceRead() {
      let first = true;
      nextRead = () => {
        if (!first) return Promise.resolve({ data: { user: currentUser }, error: null });
        first = false;
        callback?.("TOKEN_REFRESHED", { user: { id: USER_ID } });
        return Promise.resolve({ data: { user: currentUser }, error: null });
      };
    },
    setError(error) { nextRead = () => Promise.resolve({ data: { user: null }, error }); },
    setSignUpSession(session) { signUpSession = session; },
    async runTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const fn of callbacks) await fn();
    },
    async flush() { await Promise.resolve(); await Promise.resolve(); },
    setSignInDelay(fn) { signInDelay = fn; },
    wasUnsubscribed() { return unsubscribed; },
  };
}

test("initial check verifies a signed-out state and never exposes a cached user", async () => {
  const h = harness();
  h.setUser(null);
  await h.controller.start();
  assert.equal(h.controller.getState().status, "signed-out");
  assert.equal(h.controller.getState().user, null);
});

test("a refresh event during sign-in verification retries without a false login error", async () => {
  const h = harness();
  await h.controller.start();
  h.setRaceRead();
  const user = await h.controller.signIn(" person@example.test ", "password");
  assert.deepEqual(user, { id: USER_ID, email: "person@example.test" });
  assert.equal(h.controller.getState().status, "authenticated");
  assert.equal(h.controller.getState().user.id, USER_ID);
});

test("an event that signs out while a read is pending cannot revive the old user", async () => {
  const h = harness();
  h.setUser({ id: USER_ID, email: "person@example.test" });
  await h.controller.start();
  const resolveRead = h.blockNextRead();
  const check = h.controller.check();
  h.setUser(null);
  h.emit("SIGNED_OUT", null);
  resolveRead();
  assert.equal(await check, null);
  assert.equal(h.controller.getState().status, "signed-out");
  assert.equal(h.controller.getState().user, null);
});

test("email confirmation is reported without inventing an authenticated session", async () => {
  const h = harness();
  await h.controller.start();
  h.setSignUpSession(null);
  const result = await h.controller.signUp("person@example.test", "password");
  assert.deepEqual(result, { requiresConfirmation: true, user: null });
  assert.equal(h.controller.getState().user, null);
});

test("verification errors are visible and concurrent auth actions are rejected", async () => {
  const h = harness();
  await h.controller.start();
  h.setError(new Error("network unavailable"));
  assert.equal(await h.controller.check(), null);
  assert.equal(h.controller.getState().status, "error");
  assert.match(h.controller.getState().error, /network unavailable/);

  let release;
  h.setSignInDelay(() => new Promise(resolve => { release = resolve; }));
  const first = h.controller.signIn("person@example.test", "password");
  await h.flush();
  await assert.rejects(() => h.controller.signIn("person@example.test", "password"), /already in progress/);
  release();
  await first;
});

test("stop cancels deferred checks, unsubscribes, and prevents later actions", async () => {
  const h = harness();
  await h.controller.start();
  h.setUser({ id: USER_ID, email: "person@example.test" });
  h.emit("SIGNED_IN", { user: { id: USER_ID } });
  h.controller.stop();
  await h.runTimers();
  assert.equal(h.wasUnsubscribed(), true);
  assert.equal(h.controller.getState().status, "stopped");
  assert.equal(await h.controller.check(), null);
});
