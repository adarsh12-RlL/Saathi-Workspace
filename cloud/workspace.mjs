import { createAuthController } from "./auth.mjs";
import { createMissionRepository } from "./repository.mjs";
import { createMissionSync } from "./sync.mjs";

const emptySync = () => Object.freeze({ status: "idle", records: Object.freeze([]), error: null });

// A framework-neutral adapter: a React hook can subscribe with setState and dispose in useEffect.
export function createCloudWorkspace(client, { onState = () => {}, repositoryFactory = createMissionRepository, syncFactory = createMissionSync, authOptions = {}, syncOptions = {} } = {}) {
  let ownerId = null; let sync = null; let generation = 0; let stopped = false;
  let authState = Object.freeze({ status: "idle", user: null, error: null });
  let syncState = emptySync();
  const snapshot = () => Object.freeze({ auth: authState, ownerId, sync: syncState });
  const publish = () => onState(snapshot());
  const clear = () => {
    generation += 1;
    const previous = sync; sync = null; ownerId = null; syncState = emptySync();
    previous?.stop();
  };
  const auth = createAuthController(client, {
    ...authOptions,
    onState: state => {
      authState = state;
      if (state.status !== "authenticated" || !state.user || stopped) { clear(); publish(); return; }
      if (ownerId === state.user.id && sync) { publish(); return; }
      clear(); ownerId = state.user.id;
      const boundGeneration = generation;
      sync = syncFactory({
        ...syncOptions,
        repository: repositoryFactory(client, ownerId),
        onState: next => {
          if (stopped || generation !== boundGeneration) return;
          syncState = next; publish();
        }
      });
      publish();
      void sync.start().catch(error => {
        if (stopped || generation !== boundGeneration) return;
        syncState = Object.freeze({ status: "error", records: Object.freeze([]), error: error.message || "Unable to start cloud synchronization." }); publish();
      });
    }
  });
  async function mutate(method, ...args) {
    if (stopped || !sync || authState.status !== "authenticated") throw new Error("Sign in before changing cloud missions.");
    const lease = generation; const controller = sync;
    const result = await controller[method](...args);
    if (stopped || generation !== lease || sync !== controller) {
      const error = new Error("The account changed while this request was in progress. Its result was not applied to the current account.");
      error.code = "SESSION_CHANGED"; throw error;
    }
    return result;
  }
  return Object.freeze({
    getState: snapshot,
    start: () => auth.start(),
    checkSession: () => auth.check(),
    signIn: (email, password) => auth.signIn(email, password),
    signUp: (email, password, options) => auth.signUp(email, password, options),
    signOut: () => auth.signOut(),
    create: mission => mutate("create", mission),
    save: (mission, expectedRevision) => mutate("save", mission, expectedRevision),
    remove: (id, expectedRevision) => mutate("remove", id, expectedRevision),
    refresh: () => sync?.refresh() ?? Promise.resolve(),
    stop() { if (stopped) return; stopped = true; clear(); auth.stop(); }
  });
}
