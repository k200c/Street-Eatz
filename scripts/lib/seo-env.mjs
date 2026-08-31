// Shared build-time helpers for the SEO scripts.
//
// Reads the same env files as scripts/validate-environment.mjs but never exits
// on failure — SEO generation must degrade, not block a deploy. That script
// remains the single gate that can fail a build.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");

const ENV_FILES = [".env", ".env.production", ".env.local", ".env.production.local"];

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/** Process env wins, then later env files override earlier ones. */
export function loadSupabaseEnv() {
  const fileValues = {};
  for (const filename of ENV_FILES) {
    const filepath = resolve(PROJECT_ROOT, filename);
    if (!existsSync(filepath)) continue;
    Object.assign(fileValues, parseEnvFile(readFileSync(filepath, "utf8")));
  }

  const url = process.env.VITE_SUPABASE_URL || fileValues.VITE_SUPABASE_URL || "";
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileValues.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const siteUrl =
    process.env.VITE_SITE_URL || fileValues.VITE_SITE_URL || "https://streeteatzwaterford.ie";

  return { url: url.replace(/\/+$/, ""), key, siteUrl: siteUrl.replace(/\/+$/, "") };
}

/** PostgREST GET. Returns null on any failure — callers decide what to do. */
export async function restGet(env, path, { timeoutMs = 15000 } = {}) {
  if (!env.url || !env.key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${env.url}/rest/v1/${path}`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[seo] GET ${path} -> HTTP ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`[seo] GET ${path} failed: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** PostgREST RPC call. Returns null on any failure. */
export async function rpc(env, name, { timeoutMs = 15000 } = {}) {
  if (!env.url || !env.key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${env.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[seo] rpc ${name}() -> HTTP ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`[seo] rpc ${name}() failed: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Replace the content between two HTML comment markers. Idempotent. */
export function replaceMarkedBlock(html, marker, replacement) {
  const start = `<!-- SEO:${marker}:START -->`;
  const end = `<!-- SEO:${marker}:END -->`;
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    console.warn(`[seo] marker ${marker} not found — leaving HTML untouched`);
    return html;
  }
  return html.slice(0, startIndex + start.length) + replacement + html.slice(endIndex);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * JSON embedded in a <script> block must not be able to close that block.
 * Escaping `<` covers `</script>` and `<!--` in one go.
 */
export function safeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export { PROJECT_ROOT };
