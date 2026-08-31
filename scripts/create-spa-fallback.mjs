import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const distDirectory = resolve(import.meta.dirname, "..", "dist");
const indexPath = resolve(distDirectory, "index.html");
const fallbackPath = resolve(distDirectory, "404.html");

if (!existsSync(indexPath)) {
  console.error("SPA fallback generation failed: dist/index.html does not exist.");
  process.exit(1);
}

copyFileSync(indexPath, fallbackPath);
console.log("SPA fallback generated at dist/404.html.");
