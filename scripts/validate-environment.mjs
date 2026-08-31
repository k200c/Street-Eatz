import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const envFiles = [
  ".env",
  ".env.production",
  ".env.local",
  ".env.production.local",
];

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

const fileValues = {};
for (const filename of envFiles) {
  const filepath = resolve(projectRoot, filename);
  if (existsSync(filepath)) {
    Object.assign(fileValues, parseEnvFile(readFileSync(filepath, "utf8")));
  }
}

const env = { ...fileValues, ...process.env };
const errors = [];
const supabaseUrl = env.VITE_SUPABASE_URL?.trim();
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl) {
  errors.push("VITE_SUPABASE_URL is missing");
} else {
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
      errors.push("VITE_SUPABASE_URL must be an HTTPS Supabase project URL");
    }
  } catch {
    errors.push("VITE_SUPABASE_URL is not a valid URL");
  }
}

if (!publishableKey) {
  errors.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing");
} else if (
  !publishableKey.startsWith("sb_publishable_") &&
  !publishableKey.startsWith("eyJ")
) {
  errors.push("VITE_SUPABASE_PUBLISHABLE_KEY has an unexpected format");
}

if (errors.length > 0) {
  console.error("\nProduction build blocked: backend configuration is incomplete.");
  for (const error of errors) console.error(`- ${error}`);
  console.error(
    "\nSet the variables in the build environment or create a gitignored .env.production.local file.\n",
  );
  process.exit(1);
}

console.log("Environment validation passed.");
