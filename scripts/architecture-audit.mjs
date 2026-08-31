import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const strict = process.argv.includes("--strict");
const asJson = process.argv.includes("--json");

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".toml"]);
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", ".git", ".temp"]);

function walk(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRECTORIES.has(entry.name)) return [];
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return TEXT_EXTENSIONS.has(extname(entry.name)) ? [fullPath] : [];
  });
}

function matchesIn(files, expression) {
  const results = [];

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      expression.lastIndex = 0;
      if (expression.test(line)) {
        results.push({
          file: relative(projectRoot, file).replaceAll("\\", "/"),
          line: index + 1,
          text: line.trim().slice(0, 180),
        });
      }
    });
  }

  return results;
}

function configuredJwtModes(configText) {
  const modes = new Map();
  let currentFunction = null;

  for (const line of configText.split(/\r?\n/)) {
    const section = line.match(/^\[functions\.([^\]]+)\]/);
    if (section) {
      currentFunction = section[1];
      continue;
    }

    const jwt = line.match(/^verify_jwt\s*=\s*(true|false)/);
    if (jwt && currentFunction) modes.set(currentFunction, jwt[1] === "true");
  }

  return modes;
}

const sourceFiles = walk(join(projectRoot, "src"));
const runtimeSourceFiles = sourceFiles.filter((file) => {
  const path = relative(projectRoot, file).replaceAll("\\", "/");
  return path !== "src/config/client.ts" && !/\.(?:test|spec)\.[^.]+$/.test(path);
});
const publicFiles = walk(join(projectRoot, "public"));
const functionRoot = join(projectRoot, "supabase", "functions");
const functionDirectories = existsSync(functionRoot)
  ? readdirSync(functionRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];
const functionFiles = functionDirectories
  .map((entry) => join(functionRoot, entry.name, "index.ts"))
  .filter(existsSync);

const configPath = join(projectRoot, "supabase", "config.toml");
const configText = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
const jwtModes = configuredJwtModes(configText);

const directAutomationUrls = matchesIn(
  sourceFiles,
  /https?:\/\/[^\s"']*(?:app\.n8n\.cloud|n8n\.lovable\.dev)[^\s"']*/i,
);
const serverAutomationUrls = matchesIn(
  functionFiles,
  /https?:\/\/[^\s"']*(?:app\.n8n\.cloud|n8n\.lovable\.dev)[^\s"']*/i,
);
const clientSpecificReferences = matchesIn(
  [...runtimeSourceFiles, ...functionFiles, ...publicFiles, configPath].filter(Boolean),
  /Street Eatz|streeteatz|ftzinsesuiuqcjfpbaur|74663174/i,
);
const simulatedBusinessMetrics = matchesIn(
  sourceFiles,
  /simulated(?:Recipients|OpenRate|Revenue)|revenue_generated:\s*simulated|Math\.random\(\).*revenue/i,
);
const normalRuntimeSourceFiles = sourceFiles.filter(
  (file) => !relative(projectRoot, file).replaceAll("\\", "/").endsWith("src/lib/resetApp.ts"),
);
const serviceWorkerDisabled = matchesIn(
  normalRuntimeSourceFiles,
  /serviceWorker\.getRegistrations|\.unregister\(\)/,
);
const manifestAdminStart = matchesIn(publicFiles, /"start_url"\s*:\s*"\/admin"/);

const openMutationFunctions = [];
const implicitJwtFunctions = [];

for (const entry of functionDirectories) {
  const file = join(functionRoot, entry.name, "index.ts");
  if (!existsSync(file)) continue;

  const source = readFileSync(file, "utf8");
  const mode = jwtModes.get(entry.name);
  if (mode === undefined) implicitJwtFunctions.push(entry.name);

  const mutatesWithServiceRole = /SUPABASE_SERVICE_ROLE_KEY/.test(source)
    && /\.from\s*\([^)]*\)[\s\S]{0,800}\.(?:insert|update|delete|upsert)\s*\(/.test(source);
  const verifiesSharedSecret = /N8N_WEBHOOK_SECRET/.test(source);
  const verifiesUser = /auth\.getUser\s*\(|auth\.getClaims\s*\(/.test(source)
    && /Unauthorized|Forbidden/.test(source);
  const verifiesCaller = verifiesSharedSecret || verifiesUser;

  if (mode === false && mutatesWithServiceRole && !verifiesCaller) {
    openMutationFunctions.push(entry.name);
  }
}

const testFiles = walk(join(projectRoot, "src")).filter((file) => /\.(?:test|spec)\.[^.]+$/.test(file));

const findings = [
  {
    id: "frontend-direct-automation-url",
    severity: "critical",
    count: directAutomationUrls.length,
    summary: "Frontend code calls automation webhooks directly.",
    locations: directAutomationUrls,
  },
  {
    id: "server-hardcoded-automation-url",
    severity: "high",
    count: serverAutomationUrls.length,
    summary: "An Edge Function hard-codes an automation URL instead of using deployment configuration.",
    locations: serverAutomationUrls,
  },
  {
    id: "open-service-role-mutation",
    severity: "critical",
    count: openMutationFunctions.length,
    summary: "A verify_jwt=false function mutates data with service-role privileges without a detected caller check.",
    locations: openMutationFunctions.map((name) => ({ file: `supabase/functions/${name}/index.ts` })),
  },
  {
    id: "simulated-business-metric",
    severity: "high",
    count: simulatedBusinessMetrics.length,
    summary: "Simulated values can be persisted or displayed as business metrics.",
    locations: simulatedBusinessMetrics,
  },
  {
    id: "implicit-function-jwt-mode",
    severity: "high",
    count: implicitJwtFunctions.length,
    summary: "Edge functions rely on an implicit gateway JWT setting, which can drift between deployments.",
    locations: implicitJwtFunctions.map((name) => ({ file: `supabase/functions/${name}/index.ts` })),
  },
  {
    id: "service-worker-disabled",
    severity: "medium",
    count: serviceWorkerDisabled.length,
    summary: "The app removes service workers, so offline/PWA claims must remain disabled.",
    locations: serviceWorkerDisabled,
  },
  {
    id: "manifest-opens-admin",
    severity: "high",
    count: manifestAdminStart.length,
    summary: "The install manifest opens the staff administration route.",
    locations: manifestAdminStart,
  },
  {
    id: "client-specific-reference",
    severity: "medium",
    count: clientSpecificReferences.length,
    summary: "Client-specific values remain outside a canonical client configuration layer.",
    locations: clientSpecificReferences,
  },
  {
    id: "automated-test-coverage",
    severity: "high",
    count: testFiles.length === 0 ? 1 : 0,
    summary: testFiles.length === 0 ? "No application tests were found." : `${testFiles.length} application tests found.`,
    locations: [],
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  project: "Street Eatz reference implementation",
  strict,
  inventory: {
    sourceFiles: sourceFiles.length,
    edgeFunctions: functionFiles.length,
    tests: testFiles.length,
  },
  totals: {
    critical: findings.filter((finding) => finding.severity === "critical").reduce((sum, finding) => sum + finding.count, 0),
    high: findings.filter((finding) => finding.severity === "high").reduce((sum, finding) => sum + finding.count, 0),
    medium: findings.filter((finding) => finding.severity === "medium").reduce((sum, finding) => sum + finding.count, 0),
  },
  findings,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Food OS architecture audit\n");
  for (const finding of findings) {
    const marker = finding.count > 0 ? "!" : "ok";
    console.log(`${marker.padEnd(2)} ${finding.severity.padEnd(8)} ${String(finding.count).padStart(3)}  ${finding.id}`);
    console.log(`             ${finding.summary}`);
    for (const location of finding.locations.slice(0, 8)) {
      console.log(`             - ${location.file}${location.line ? `:${location.line}` : ""}`);
    }
    if (finding.locations.length > 8) {
      console.log(`             - ... ${finding.locations.length - 8} more`);
    }
  }

  console.log("\nStrict mode fails while any critical or high finding remains: node scripts/architecture-audit.mjs --strict");
}

if (strict && (report.totals.critical > 0 || report.totals.high > 0)) {
  process.exitCode = 1;
}
