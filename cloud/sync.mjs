// Lifecycle and concurrency only. The fixed repository owns auth and data validation.
function message(error) {
  return error && typeof error.message === "string" ? error.message : "Unable to synchronize this workspace.";
}

function frozenCopy(value) {
  const copy = structuredClone(value);
  const freeze = item => {
    if (item && typeof item === "object") {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
    return item;
  };
  return freeze(copy);
}

function taggedError(code, description) {
  return Object.assign(new Error(description), { code });
}

function checkedRecord(record) {
  if (!record || typeof record !== "object" || typeof record.id !== "string" || !record.id ||
      !Number.isSafeInteger(record.revision) || record.revision < 1) {
    throw new Error("The repository returned an invalid mission revision.");
  }
  return structuredClone(record);
}

export function createMissionSync({
  repository,
  onState = () => {},
  intervalMs = 15000,
  setIntervalFn = globalThis.setInterval.bind(globalThis),
  clearIntervalFn = globalThis.clearInterval.bind(globalThis),
  eventTarget = globalThis.window,
  visibilityTarget = globalThis.document,
} = {}) {
  if (!repository || ["list", "create", "save", "remove", "watch"].some(key => typeof repository[key] !== "function")) {
    throw new TypeError("A fixed mission repository is required.");
  }
  if (typeof onState !== "function" || !Number.isFinite(intervalMs) || intervalMs <= 0 ||
      typeof setIntervalFn !== "function" || typeof clearIntervalFn !== "function") {
    throw new TypeError("Invalid mission sync configuration.");
  }
  // Capture methods once; changing accounts requires stopping this controller.
  const list = repository.list.bind(repository);
  const createRecord = repository.create.bind(repository);
  const saveRecord = repository.save.bind(repository);
  const removeRecord = repository.remove.bind(repository);
  const watch = repository.watch.bind(repository);
  let records = [];
  let status = "idle";
  let error = null;
  let started = false;
  let stopped = false;
  let startPromise = null;
  let readVersion = 0;
  let refreshPending = false;
  let refreshPromise = null;
  let mutationPending = false;
  let mutationDone = null;
  let releaseMutation = null;
  let watchCleanup = null;
  let timer = null;

  const emit = (nextStatus, nextError = null) => {
    if (stopped && nextStatus !== "stopped") return;
    status = nextStatus;
    error = nextError;
    onState(frozenCopy({ status, records, error }));
  };

  const assertActive = () => {
    if (stopped) throw taggedError("SYNC_STOPPED", "This account's synchronization has stopped.");
  };

  const upsert = incoming => {
    const record = checkedRecord(incoming);
    const index = records.findIndex(item => item.id === record.id);
    if (index === -1) records = [...records, record];
    else if (record.revision > records[index].revision) {
      records = records.map((item, itemIndex) => itemIndex === index ? record : item);
    }
    // Equal or older reads must not replace a newer payload or resurrect a tombstone.
    return records.find(item => item.id === record.id);
  };

  const merge = incoming => {
    if (!Array.isArray(incoming)) throw new Error("The repository returned an invalid mission list.");
    const checked = incoming.map(checkedRecord);
    if (new Set(checked.map(record => record.id)).size !== checked.length) {
      throw new Error("The repository returned duplicate mission IDs.");
    }
    // Absence is not a deletion. Repositories retain tombstones explicitly.
    for (const record of checked) upsert(record);
  };

  async function drainRefreshes() {
    let lastError = null;
    try {
      while (refreshPending && !stopped) {
        if (mutationPending) await mutationDone;
        if (stopped) break;
        refreshPending = false;
        const version = readVersion;
        emit("loading");
        try {
          const incoming = await list();
          if (stopped || mutationPending || version !== readVersion) continue;
          merge(incoming);
          lastError = null;
          emit("ready");
        } catch (readError) {
          if (stopped || mutationPending || version !== readVersion) continue;
          lastError = readError;
          emit("error", message(readError));
        }
      }
      if (lastError && !stopped) throw lastError;
      return frozenCopy(records);
    } finally {
      refreshPromise = null;
    }
  }

  function refresh() {
    try { assertActive(); } catch (stoppedError) { return Promise.reject(stoppedError); }
    readVersion += 1;
    refreshPending = true;
    // One active GET and at most one queued follow-up, including bursts of events.
    if (!refreshPromise) refreshPromise = Promise.resolve().then(drainRefreshes);
    return refreshPromise;
  }

  const isVisible = () => !visibilityTarget || visibilityTarget.visibilityState !== "hidden";
  const invalidate = () => {
    if (!stopped && isVisible()) void refresh().catch(() => {});
  };
  const watchStatus = channelStatus => {
    if (stopped) return;
    if (channelStatus === "SUBSCRIBED") invalidate();
    else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(channelStatus)) {
      emit(mutationPending ? "saving" : "error", "Live updates are unavailable. Periodic refresh will retry.");
    }
  };

  function clearResources() {
    if (timer !== null) { clearIntervalFn(timer); timer = null; }
    eventTarget?.removeEventListener?.("focus", invalidate);
    visibilityTarget?.removeEventListener?.("visibilitychange", invalidate);
    if (watchCleanup) {
      const cleanup = watchCleanup;
      watchCleanup = null;
      cleanup();
    }
  }

  function start() {
    try { assertActive(); } catch (stoppedError) { return Promise.reject(stoppedError); }
    if (started) return startPromise;
    started = true;
    try {
      // Subscribe first so changes during the initial read can invalidate it.
      watchCleanup = watch(invalidate, watchStatus);
      if (typeof watchCleanup !== "function") throw new Error("The repository must provide watch cleanup.");
      eventTarget?.addEventListener?.("focus", invalidate);
      visibilityTarget?.addEventListener?.("visibilitychange", invalidate);
      timer = setIntervalFn(invalidate, intervalMs);
      startPromise = refresh();
    } catch (startError) {
      started = false;
      clearResources();
      emit("error", message(startError));
      startPromise = Promise.reject(startError);
    }
    return startPromise;
  }

  async function mutate(operation) {
    assertActive();
    if (mutationPending) {
      throw taggedError("MUTATION_IN_PROGRESS", "A change is already saving. Wait for it to finish before saving another.");
    }
    mutationPending = true;
    mutationDone = new Promise(resolve => { releaseMutation = resolve; });
    readVersion += 1;
    emit("saving");
    try {
      const incoming = await operation();
      if (stopped) return frozenCopy(checkedRecord(incoming));
      const result = upsert(incoming);
      emit("ready");
      return frozenCopy(result);
    } catch (mutationError) {
      if (!stopped) emit(mutationError?.code === "REVISION_CONFLICT" ? "conflict" : "error", message(mutationError));
      throw mutationError;
    } finally {
      mutationPending = false;
      releaseMutation();
      releaseMutation = null;
      mutationDone = null;
    }
  }

  function create(mission) {
    return mutate(() => createRecord(structuredClone(mission)));
  }

  function save(mission, expectedRevision) {
    return mutate(() => saveRecord(structuredClone(mission), expectedRevision));
  }

  function remove(id, expectedRevision) {
    return mutate(() => removeRecord(id, expectedRevision));
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    readVersion += 1;
    refreshPending = false;
    try { clearResources(); } finally { emit("stopped"); }
  }

  emit("idle");
  return Object.freeze({ start, refresh, create, save, remove, stop });
}
