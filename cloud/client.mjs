import { createClient } from "@supabase/supabase-js";

export function validateCloudConfiguration(urlValue, keyValue) {
  const url = typeof urlValue === "string" ? urlValue.trim() : "";
  const key = typeof keyValue === "string" ? keyValue.trim() : "";
  if (!url || !key) return "Add the Supabase project URL and publishable key to enable cloud sign-in.";
  if (!/^https?:\/\//i.test(url)) return "Use a Supabase project URL beginning with http:// or https://.";
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) return "Use a valid Supabase project URL without credentials, query or fragment.";
  } catch { return "Use a valid Supabase project URL."; }
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return null;
  // Legacy anon keys are accepted; decoding here only prevents accidental privileged-key configuration.
  // Identity/authorization still come from Supabase Auth and PostgreSQL RLS, never this decoded payload.
  try {
    const parts = key.split(".");
    if (parts.length === 3) {
      const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(globalThis.atob(encoded));
      if (payload.role === "anon") return null;
    }
  } catch { /* reject below without exposing any key content */ }
  return "Use a publishable or legacy anon key. Privileged secret/service-role keys cannot be used in the browser.";
}

export function createSaathiClient({ url, publishableKey, storage, createClientFn = createClient } = {}) {
  const configurationError = validateCloudConfiguration(url, publishableKey);
  if (configurationError) return { client: null, configurationError };
  const options = { auth: { storageKey: `saathi.supabase.${new URL(url).host}.auth.v1`, autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } };
  if (storage) options.auth.storage = storage;
  return { client: createClientFn(url.trim(), publishableKey.trim(), options), configurationError: null };
}
