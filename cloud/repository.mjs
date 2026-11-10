import { TABLE, uuid, revision, validateMissionSnapshot, validateCloudRow } from "./contracts.mjs";

const COLUMNS = "id,owner_id,revision,title,payload,created_at,updated_at,deleted_at";
export class RevisionConflictError extends Error {
  constructor() { super("This mission changed on another device. Keep your draft and review the latest revision before saving again."); this.name = "RevisionConflictError"; this.code = "REVISION_CONFLICT"; }
}
function queryError(error) {
  const result = new Error(error?.message || "Cloud request failed.");
  result.code = error?.code || "CLOUD_REQUEST_FAILED";
  return result;
}

export function createMissionRepository(client, userId) {
  const ownerId = uuid(userId, "verified user ID");
  if (!client?.from || !client?.channel || !client?.removeChannel) throw new Error("A configured Supabase client is required.");
  const normalize = raw => validateCloudRow(raw, ownerId);
  return Object.freeze({
    ownerId,
    async list() {
      // Pagination is deliberate: a fixed server default row limit must not hide missions.
      const records = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client.from(TABLE).select(COLUMNS).eq("owner_id", ownerId).order("id", { ascending: true }).range(offset, offset + pageSize - 1);
        if (error) throw queryError(error);
        if (!Array.isArray(data)) throw new Error("Invalid cloud mission list.");
        records.push(...data.map(normalize));
        if (records.length > 10000) throw new Error("Workspace exceeds this release's 10,000 mission limit.");
        if (data.length < pageSize) break;
      }
      if (new Set(records.map(record => record.id)).size !== records.length) throw new Error("Mission list changed during pagination; refresh again.");
      return records;
    },
    async create(raw) {
      const payload = validateMissionSnapshot(raw, { requireUuid: true });
      const { data, error } = await client.from(TABLE).insert({ id: payload.id, owner_id: ownerId, revision: 1, title: payload.title, payload }).select(COLUMNS).single();
      if (error) throw queryError(error);
      if (!data) throw new Error("Cloud did not confirm mission creation.");
      return normalize(data);
    },
    async save(raw, expectedRevision) {
      const payload = validateMissionSnapshot(raw, { requireUuid: true });
      const base = revision(expectedRevision);
      if (base === Number.MAX_SAFE_INTEGER) throw new Error("Mission revision limit reached.");
      const { data, error } = await client.from(TABLE).update({ title: payload.title, payload, revision: base + 1 }).eq("id", payload.id).eq("owner_id", ownerId).eq("revision", base).is("deleted_at", null).select(COLUMNS).maybeSingle();
      if (error) throw queryError(error);
      if (!data) throw new RevisionConflictError();
      return normalize(data);
    },
    async remove(id, expectedRevision) {
      const missionId = uuid(id, "mission ID"); const base = revision(expectedRevision);
      if (base === Number.MAX_SAFE_INTEGER) throw new Error("Mission revision limit reached.");
      const { data, error } = await client.from(TABLE).update({ deleted_at: new Date().toISOString(), revision: base + 1 }).eq("id", missionId).eq("owner_id", ownerId).eq("revision", base).is("deleted_at", null).select(COLUMNS).maybeSingle();
      if (error) throw queryError(error);
      if (!data) throw new RevisionConflictError();
      return normalize(data);
    },
    watch(onInvalidate, onStatus = () => {}) {
      let active = true;
      const channel = client.channel(`saathi-missions:${ownerId}:${globalThis.crypto.randomUUID()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE, filter: `owner_id=eq.${ownerId}` }, () => { if (active) onInvalidate(); })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: TABLE, filter: `owner_id=eq.${ownerId}` }, () => { if (active) onInvalidate(); })
        .subscribe(status => { if (active) onStatus(status); });
      return () => { active = false; void client.removeChannel(channel).catch(() => {}); };
    }
  });
}
