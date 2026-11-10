import { validateMemoryDecision } from "../memory-review.mjs";

export const MEMORY_DECISIONS_TABLE = "saathi_memory_decisions";
const COLUMNS = "id,owner_id,signal_id,candidate_id,mission_id,action,payload,created_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value, name) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new Error(`Invalid ${name}; a UUID is required.`);
  return value.toLowerCase();
}

function queryError(error) {
  const result = new Error(error?.message || "Cloud memory request failed.");
  result.code = error?.code || "CLOUD_REQUEST_FAILED";
  return result;
}

function ownData(raw, key) {
  const descriptor = Object.getOwnPropertyDescriptor(raw, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error("Invalid cloud memory decision property.");
  return descriptor.value;
}

function normalize(raw, ownerId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw new Error("Invalid cloud memory decision.");
  const rowOwner = uuid(ownData(raw, "owner_id"), "memory decision owner ID");
  if (rowOwner !== ownerId) throw new Error("Memory decision belongs to another account.");
  const id = uuid(ownData(raw, "id"), "memory decision ID");
  const signalId = uuid(ownData(raw, "signal_id"), "learning signal ID");
  const candidateId = uuid(ownData(raw, "candidate_id"), "memory candidate ID");
  const missionId = uuid(ownData(raw, "mission_id"), "source mission ID");
  const payload = validateMemoryDecision(ownData(raw, "payload"));
  if (payload.id !== id || payload.signalId !== signalId || payload.candidateId !== candidateId || payload.missionId !== missionId || payload.action !== ownData(raw, "action")) throw new Error("Memory decision identity does not match its payload.");
  const createdAt = ownData(raw, "created_at");
  if (typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt))) throw new Error("Invalid cloud memory decision timestamp.");
  return Object.freeze({ id, ownerId: rowOwner, signalId, candidateId, missionId, action: payload.action, payload, createdAt });
}

export function createMemoryDecisionRepository(client, verifiedUserId) {
  const ownerId = uuid(verifiedUserId, "verified user ID");
  if (typeof client?.from !== "function" || typeof client?.channel !== "function" || typeof client?.removeChannel !== "function") throw new Error("A configured Supabase client is required.");
  const owned = raw => normalize(raw, ownerId);
  return Object.freeze({
    ownerId,
    async list() {
      const records = [], pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client.from(MEMORY_DECISIONS_TABLE)
          .select(COLUMNS).eq("owner_id", ownerId).order("created_at", { ascending: true }).order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw queryError(error);
        if (!Array.isArray(data)) throw new Error("Invalid cloud memory decision list.");
        records.push(...data.map(owned));
        if (records.length > 10000) throw new Error("Memory decision ledger exceeds this release's 10,000 event limit.");
        if (data.length < pageSize) break;
      }
      if (new Set(records.map(record => record.id)).size !== records.length) throw new Error("Memory decision ledger changed during pagination; refresh again.");
      return records;
    },
    async append(raw) {
      const payload = validateMemoryDecision(raw);
      const { data, error } = await client.from(MEMORY_DECISIONS_TABLE)
        .insert({ id: payload.id, owner_id: ownerId, signal_id: payload.signalId, candidate_id: payload.candidateId, mission_id: payload.missionId, action: payload.action, payload })
        .select(COLUMNS).single();
      if (error) throw queryError(error);
      if (!data) throw new Error("Cloud did not confirm memory decision creation.");
      return owned(data);
    },
    watch(onInvalidate, onStatus = () => {}) {
      if (typeof onInvalidate !== "function" || typeof onStatus !== "function") throw new Error("Memory watch callbacks must be functions.");
      let active = true;
      const channel = client.channel(`saathi-memory-decisions:${ownerId}:${globalThis.crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: MEMORY_DECISIONS_TABLE, filter: `owner_id=eq.${ownerId}` }, () => { if (active) onInvalidate(); })
        .subscribe(status => { if (active) onStatus(status); });
      return () => { active = false; void Promise.resolve(client.removeChannel(channel)).catch(() => {}); };
    },
  });
}
