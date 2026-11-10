import { validateLearningSignal } from "../learning-loop.mjs";

export const LEARNING_EVENTS_TABLE = "saathi_learning_events";
const COLUMNS = "id,owner_id,mission_id,event_type,payload,created_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value, name) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(`Invalid ${name}; a UUID is required.`);
  return value.toLowerCase();
}

function queryError(error) {
  const result = new Error(error?.message || "Cloud request failed.");
  result.code = error?.code || "CLOUD_REQUEST_FAILED";
  return result;
}

function normalize(raw, ownerId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid cloud learning event.");
  const rowOwner = uuid(raw.owner_id, "learning event owner ID");
  if (rowOwner !== ownerId) throw new Error("Learning event belongs to another account.");
  const id = uuid(raw.id, "learning event ID");
  const missionId = uuid(raw.mission_id, "learning event mission ID");
  if (raw.event_type !== "learning_signal") throw new Error("Unsupported cloud learning event type.");
  const payload = validateLearningSignal(raw.payload);
  if (payload.id !== id || payload.missionId !== missionId) throw new Error("Learning event identity does not match its payload.");
  if (typeof raw.created_at !== "string" || !Number.isFinite(Date.parse(raw.created_at))) throw new Error("Invalid cloud learning event timestamp.");
  return Object.freeze({
    id,
    ownerId: rowOwner,
    missionId,
    eventType: raw.event_type,
    payload,
    createdAt: raw.created_at,
  });
}

export function createLearningEventRepository(client, userId) {
  const ownerId = uuid(userId, "verified user ID");
  if (!client?.from || !client?.channel || !client?.removeChannel) throw new Error("A configured Supabase client is required.");
  const owned = raw => normalize(raw, ownerId);
  return Object.freeze({
    ownerId,
    async list() {
      const records = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client.from(LEARNING_EVENTS_TABLE)
          .select(COLUMNS).eq("owner_id", ownerId).order("created_at", { ascending: true }).order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw queryError(error);
        if (!Array.isArray(data)) throw new Error("Invalid cloud learning event list.");
        records.push(...data.map(owned));
        if (records.length > 10000) throw new Error("Learning ledger exceeds this release's 10,000 event limit.");
        if (data.length < pageSize) break;
      }
      if (new Set(records.map(record => record.id)).size !== records.length) throw new Error("Learning ledger changed during pagination; refresh again.");
      return records;
    },
    async append(raw) {
      const payload = validateLearningSignal(raw);
      const { data, error } = await client.from(LEARNING_EVENTS_TABLE)
        .insert({ id: payload.id, owner_id: ownerId, mission_id: payload.missionId, event_type: "learning_signal", payload })
        .select(COLUMNS).single();
      if (error) throw queryError(error);
      if (!data) throw new Error("Cloud did not confirm learning event creation.");
      return owned(data);
    },
    watch(onInvalidate, onStatus = () => {}) {
      let active = true;
      const channel = client.channel(`saathi-learning-events:${ownerId}:${globalThis.crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: LEARNING_EVENTS_TABLE, filter: `owner_id=eq.${ownerId}` }, () => { if (active) onInvalidate(); })
        .subscribe(status => { if (active) onStatus(status); });
      return () => { active = false; void client.removeChannel(channel).catch(() => {}); };
    },
  });
}
