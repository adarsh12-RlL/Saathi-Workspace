// Public reference data only. This module never connects, evaluates or approves it.
const CAPSULE_KEYS = ["schema", "version", "id", "source", "trust", "exportedAt", "items"];
const POST_KEYS = ["id", "title", "content", "author", "community", "url"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 64 * 1024;

function fail() { throw new Error("Invalid public research capsule."); }

// Read only own data descriptors. A public reference cannot supply executable getters.
function exact(raw, keys) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail();
  const ownKeys = Reflect.ownKeys(raw);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== "string" || !keys.includes(key))) fail();
  const values = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) fail();
    values[key] = descriptor.value;
  }
  return values;
}

function id(value) {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value.toLowerCase();
}

function text(value, maximum, required = false) {
  if (typeof value !== "string" || value.length > maximum || (required && !value.trim())) fail();
  // Preserve malicious-looking text literally; trust labels stay visible to callers.
  return value;
}

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) fail();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) fail();
  return value;
}

function post(raw) {
  const fields = exact(raw, POST_KEYS);
  const postId = id(fields.id);
  const url = `https://www.moltbook.com/post/${postId}`;
  if (fields.url !== url) fail();
  return {
    id: postId,
    title: text(fields.title, 240, true),
    content: text(fields.content, 3000),
    author: text(fields.author, 80, true),
    community: text(fields.community, 80, true),
    url,
  };
}

function posts(raw) {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(raw, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 1 || lengthDescriptor.value > 5) fail();
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== length + 1 || keys.some(key => typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key)))) fail();
  const result = [], ids = new Set();
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) fail();
    const checked = post(descriptor.value);
    if (ids.has(checked.id)) fail();
    ids.add(checked.id);
    result.push(checked);
  }
  return result;
}

/** Validate bounded, unverified public data without reading any workspace state. */
export function validatePublicResearchCapsule(raw) {
  const fields = exact(raw, CAPSULE_KEYS);
  if (fields.schema !== "saathi.public-research" || fields.version !== 1 || fields.source !== "moltbook" || fields.trust !== "unverified") fail();
  const result = {
    schema: "saathi.public-research",
    version: 1,
    id: id(fields.id),
    source: "moltbook",
    trust: "unverified",
    exportedAt: timestamp(fields.exportedAt),
    items: posts(fields.items),
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_BYTES) fail();
  return result;
}

/** Create a local download capsule from explicitly selected public posts. */
export function createPublicResearchCapsule(selectedPosts, { newId = () => globalThis.crypto.randomUUID(), at = new Date().toISOString() } = {}) {
  // Validate the selection before invoking the caller's ID generator.
  const items = posts(selectedPosts);
  return validatePublicResearchCapsule({schema: "saathi.public-research", version: 1, id: newId(), source: "moltbook", trust: "unverified", exportedAt: at, items});
}

/** Return an inert document artifact. Saving it is an explicit caller-owned action. */
export function createPublicResearchArtifact(raw, { newId = () => globalThis.crypto.randomUUID() } = {}) {
  const capsule = validatePublicResearchCapsule(raw);
  const content = JSON.stringify({classification: "unverified_external_reference", capsule});
  if (content.length > 20000) throw new Error("Public research document exceeds the mission artifact limit. Select fewer or shorter discussions.");
  return {id: id(newId()), title: "Moltbook public research", kind: "Document", content};
}

/** Recognize a saved reference without trusting its claimed source or executing its text. */
export function readPublicResearchArtifact(raw) {
  try {
    const artifact = exact(raw, ["id", "title", "kind", "content"]);
    id(artifact.id);
    if (artifact.title !== "Moltbook public research" || artifact.kind !== "Document" || typeof artifact.content !== "string" || artifact.content.length > 20000) return null;
    const document = exact(JSON.parse(artifact.content), ["classification", "capsule"]);
    if (document.classification !== "unverified_external_reference") return null;
    return validatePublicResearchCapsule(document.capsule);
  } catch { return null; }
}
