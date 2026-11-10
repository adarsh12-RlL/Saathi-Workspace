import test from "node:test";
import assert from "node:assert/strict";
import { createSaathiClient, validateCloudConfiguration } from "./client.mjs";

const PUBLIC_KEY = "sb_publishable_test_key_123";
const LEGACY_ANON = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;

test("client configuration requires a complete browser-safe URL and key", () => {
  assert.match(validateCloudConfiguration("", ""), /project URL/);
  assert.match(validateCloudConfiguration("project.supabase.co", PUBLIC_KEY), /beginning/);
  assert.match(validateCloudConfiguration("https://project.supabase.co/path", PUBLIC_KEY), /valid Supabase/);
  assert.match(validateCloudConfiguration("https://user:pass@project.supabase.co", PUBLIC_KEY), /valid Supabase/);
  assert.match(validateCloudConfiguration("https://project.supabase.co?x=1", PUBLIC_KEY), /valid Supabase/);
  assert.match(validateCloudConfiguration("https://project.supabase.co", "service-role-secret"), /Privileged/);
  assert.equal(validateCloudConfiguration("https://project.supabase.co", PUBLIC_KEY), null);
  assert.equal(validateCloudConfiguration("https://project.supabase.co", LEGACY_ANON), null);
});

test("client factory passes only validated public configuration to the SDK", () => {
  const storage = { getItem() {}, setItem() {}, removeItem() {} };
  let received;
  const made = createSaathiClient({
    url: " https://project.supabase.co ",
    publishableKey: ` ${PUBLIC_KEY} `,
    storage,
    createClientFn(...args) { received = args; return { marker: "client" }; },
  });
  assert.equal(made.configurationError, null);
  assert.deepEqual(made.client, { marker: "client" });
  assert.equal(received[0], "https://project.supabase.co");
  assert.equal(received[1], PUBLIC_KEY);
  assert.equal(received[2].auth.storage, storage);
  assert.equal(received[2].auth.storageKey, "saathi.supabase.project.supabase.co.auth.v1");
  assert.equal(received[2].auth.persistSession, true);
});

test("invalid configuration never calls the SDK factory", () => {
  let called = false;
  const result = createSaathiClient({
    url: "https://project.supabase.co",
    publishableKey: "eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature",
    createClientFn() { called = true; return {}; },
  });
  assert.equal(result.client, null);
  assert.equal(called, false);
});
