import { uuid } from "./contracts.mjs";

export function createAuthController(client, { onState = () => {}, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  if (!client?.auth) throw new Error("A configured auth client is required.");
  let state = { status: "idle", user: null, error: null };
  let epoch = 0;
  let stopped = false;
  let started = false;
  let subscription = null;
  let timer = null;
  let busy = false;

  const snapshot = () => Object.freeze({ ...state, user: state.user ? Object.freeze({ ...state.user }) : null });
  const emit = next => { state = next; onState(snapshot()); };
  const message = error => error?.message || "Unable to check authentication.";
  const requireActive = () => { if (stopped) throw new Error("Authentication controller has stopped."); };

  function invalidate(status = "checking") {
    epoch += 1;
    emit({ status, user: null, error: null });
  }

  // A result whose epoch was superseded is marked stale so an action can obtain
  // a fresh identity instead of showing a false login error during token refresh.
  async function verifyOnce() {
    if (stopped) return { user: null, superseded: false };
    if (timer !== null) { clearTimeoutFn(timer); timer = null; }
    invalidate();
    const version = epoch;
    try {
      const { data, error } = await client.auth.getUser();
      if (stopped) return { user: null, superseded: false };
      if (version !== epoch) return { user: null, superseded: true };
      if (error && error.name !== "AuthSessionMissingError") throw error;
      if (!data?.user) {
        emit({ status: "signed-out", user: null, error: null });
        return { user: null, superseded: false };
      }
      const user = {
        id: uuid(data.user.id, "authenticated user ID"),
        email: typeof data.user.email === "string" ? data.user.email : null,
      };
      emit({ status: "authenticated", user, error: null });
      return { user: { ...user }, superseded: false };
    } catch (error) {
      if (!stopped && version === epoch) emit({ status: "error", user: null, error: message(error) });
      return { user: null, superseded: false, error };
    }
  }

  async function check() { return (await verifyOnce()).user; }

  async function verifyForAction() {
    // Retry only reads invalidated by a newer event, with a bound so a broken
    // event source cannot hang a login request forever.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await verifyOnce();
      if (!result.superseded) return result.user;
    }
    return null;
  }

  async function action(run) {
    requireActive();
    if (busy) throw new Error("An authentication request is already in progress.");
    busy = true;
    try { return await run(); } finally { busy = false; }
  }

  function credentials(email, password) {
    if (typeof email !== "string" || !email.trim() || email.length > 320 ||
        typeof password !== "string" || !password || password.length > 4096) {
      throw new Error("Enter your email and password.");
    }
    return { email: email.trim(), password };
  }

  return Object.freeze({
    getState: snapshot,
    async start() {
      requireActive();
      if (started) return snapshot();
      started = true;
      const result = client.auth.onAuthStateChange((_event, session) => {
        if (stopped) return;
        if (timer !== null) { clearTimeoutFn(timer); timer = null; }
        // Clear the old owner synchronously. Supabase callbacks must not await
        // Auth APIs; the deferred check performs the verified read.
        invalidate(session ? "checking" : "signed-out");
        if (session) timer = setTimeoutFn(() => { timer = null; void check(); }, 0);
      });
      subscription = result.data.subscription;
      await check();
      return snapshot();
    },
    check,
    signIn(email, password) { return action(async () => {
      const { data, error } = await client.auth.signInWithPassword(credentials(email, password));
      if (error) throw new Error(message(error));
      if (!data?.session) throw new Error("No sign-in session was created.");
      const user = await verifyForAction();
      if (!user) throw new Error("Sign-in could not be verified. Retry your session check.");
      return user;
    }); },
    signUp(email, password, { emailRedirectTo } = {}) { return action(async () => {
      const options = emailRedirectTo ? { emailRedirectTo } : undefined;
      const { data, error } = await client.auth.signUp({
        ...credentials(email, password),
        ...(options ? { options } : {}),
      });
      if (error) throw new Error(message(error));
      if (!data?.session) return { requiresConfirmation: true, user: null };
      const user = await verifyForAction();
      if (!user) throw new Error("The new session could not be verified.");
      return { requiresConfirmation: false, user };
    }); },
    signOut() { return action(async () => {
      const { error } = await client.auth.signOut();
      if (error) throw new Error(message(error));
      if (!stopped) invalidate("signed-out");
    }); },
    stop() {
      if (stopped) return;
      stopped = true;
      epoch += 1;
      if (timer !== null) { clearTimeoutFn(timer); timer = null; }
      subscription?.unsubscribe();
      emit({ status: "stopped", user: null, error: null });
    },
  });
}
