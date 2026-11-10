// Device storage contains only authenticated ciphertext. No network APIs.
export const PRIVATE_VAULT_KEY = "saathi.private-vault.v1";
const ITERATIONS = 310000;
const MAX_BYTES = 2 * 1024 * 1024;
const AAD = new TextEncoder().encode("saathi.private-vault:1");
function cryptography() {
  if (!globalThis.crypto?.subtle) throw new Error("A secure browser context is required for the private vault.");
  return globalThis.crypto;
}
function password(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 1024) throw new Error("Use a passphrase with 12 to 1024 characters.");
  return value;
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function unbase64(value, max, exact) {
  if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid vault envelope.");
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (bytes.length > max || (exact && bytes.length !== exact) || base64Chunked(bytes) !== value) throw new Error("Invalid vault envelope.");
  return bytes;
}
function base64Chunked(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 16384) text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(text);
}
function envelope(raw) {
  const keys = ["schema", "version", "kdf", "iterations", "salt", "iv", "ciphertext"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.getPrototypeOf(raw) !== Object.prototype || Reflect.ownKeys(raw).length !== keys.length) throw new Error("Invalid vault envelope.");
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(raw, key); if (!d?.enumerable || !("value" in d)) throw new Error("Invalid vault envelope."); }
  if (raw.schema !== "saathi.private-vault" || raw.version !== 1 || raw.kdf !== "PBKDF2-SHA256" || raw.iterations !== ITERATIONS) throw new Error("Unsupported vault envelope.");
  const salt = unbase64(raw.salt, 16, 16), iv = unbase64(raw.iv, 12, 12), ciphertext = unbase64(raw.ciphertext, MAX_BYTES + 16);
  if (ciphertext.length < 18) throw new Error("Invalid vault envelope.");
  return { salt, iv, ciphertext };
}
function bytes(payload) {
  const serialized = JSON.stringify(payload);
  if (typeof serialized !== "string") throw new Error("Vault payload must be JSON.");
  const result = new TextEncoder().encode(serialized);
  if (result.length > MAX_BYTES) throw new Error("The private vault has a 2 MB limit.");
  return result;
}
async function derive(passphrase, salt) {
  const input = new TextEncoder().encode(password(passphrase));
  try {
    const material = await cryptography().subtle.importKey("raw", input, "PBKDF2", false, ["deriveKey"]);
    return await cryptography().subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:ITERATIONS},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  } finally { input.fill(0); }
}
async function seal(payload, key, salt) {
  const iv = cryptography().getRandomValues(new Uint8Array(12)), plain = bytes(payload);
  try {
    const ciphertext = new Uint8Array(await cryptography().subtle.encrypt({name:"AES-GCM",iv,additionalData:AAD,tagLength:128},key,plain));
    return {schema:"saathi.private-vault",version:1,kdf:"PBKDF2-SHA256",iterations:ITERATIONS,salt:base64(salt),iv:base64(iv),ciphertext:base64Chunked(ciphertext)};
  } finally { plain.fill(0); }
}
async function decrypt(raw, key) {
  const {iv,ciphertext} = envelope(raw);
  const plain = new Uint8Array(await cryptography().subtle.decrypt({name:"AES-GCM",iv,additionalData:AAD,tagLength:128},key,ciphertext));
  try { return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(plain)); } finally { plain.fill(0); }
}
export async function sealPrivateVault(payload, passphrase) {
  const salt = cryptography().getRandomValues(new Uint8Array(16));
  return seal(payload,await derive(passphrase,salt),salt);
}
export async function openPrivateVault(raw, passphrase) {
  password(passphrase);
  try { const {salt} = envelope(raw); return await decrypt(raw,await derive(passphrase,salt)); }
  catch { throw new Error("Cannot unlock this vault. Check the passphrase and saved vault."); }
}
export function createPrivateVaultStore(storage, {key = PRIVATE_VAULT_KEY} = {}) {
  let cryptoKey = null, salt = null, etag = null, epoch = 0, busy = false;
  function lock() { epoch++; cryptoKey = null; salt = null; etag = null; }
  function read() { return storage.getItem(key); }
  async function operation(run) {
    if (busy) throw new Error("Wait for the current vault operation.");
    busy = true; const started = epoch;
    const perform=()=>run(() => { if (started !== epoch) throw new Error("The vault was locked during this operation."); });
    // Web Locks serialize cooperating tabs. The exact-ciphertext check also
    // detects writers that do not use this controller.
    try { return globalThis.navigator?.locks ? await globalThis.navigator.locks.request(`saathi.vault:${key}`,perform) : await perform(); }
    finally { busy = false; }
  }
  return {
    hasVault() { return read() !== null; },
    isUnlocked() { return cryptoKey !== null; },
    lock,
    create(payload, passphrase) { return operation(async check => {
      if (read() !== null) throw new Error("A vault already exists. Unlock it instead.");
      const nextSalt = cryptography().getRandomValues(new Uint8Array(16));
      const nextKey = await derive(passphrase,nextSalt), sealed = JSON.stringify(await seal(payload,nextKey,nextSalt));
      check();
      if (read() !== null) throw new Error("Another tab created a vault. Reload and unlock it.");
      storage.setItem(key,sealed);
      cryptoKey = nextKey; salt = nextSalt; etag = sealed;
      return structuredClone(payload);
    }); },
    unlock(passphrase) { return operation(async check => {
      password(passphrase); const original = read();
      if (original === null) throw new Error("Create a private vault first.");
      let nextKey, nextSalt, payload;
      try {
        if (original.length > 3 * MAX_BYTES) throw new Error("Invalid vault envelope.");
        const raw = JSON.parse(original); nextSalt = envelope(raw).salt;
        nextKey = await derive(passphrase,nextSalt); payload = await decrypt(raw,nextKey);
      } catch { throw new Error("Cannot unlock this vault. Check the passphrase and saved vault."); }
      check();
      if (read() !== original) throw new Error("Another tab changed the vault. Reload and unlock it.");
      cryptoKey = nextKey; salt = nextSalt; etag = original;
      return payload;
    }); },
    save(payload) { return operation(async check => {
      if (!cryptoKey || !salt || !etag) throw new Error("Unlock the private vault first.");
      const prior = etag, sealed = JSON.stringify(await seal(payload,cryptoKey,salt));
      check();
      if (read() !== prior) { lock(); throw new Error("Another tab changed the vault. Lock and unlock to load its latest state."); }
      storage.setItem(key,sealed); etag = sealed;
      return structuredClone(payload);
    }); },
  };
}
