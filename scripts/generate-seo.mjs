// generate-seo.mjs — build-time SEO generation. Runs in `prebuild`.
//
// Writes, from the live database rather than hardcoded copies:
//   public/sitemap.xml
//   public/robots.txt
//   public/llms.txt
//
// JSON-LD and the social share image are deliberately NOT written here. They go
// into dist/index.html in postbuild (scripts/prerender.mjs) instead, because
// mutating the tracked index.html on every build leaves 15KB of generated
// markup sitting in git and invites it being committed by accident.
//
// Failure policy: this script NEVER fails the build. Missing structured data
// costs rankings; a blocked deploy costs orders. It warns loudly instead —
// every failure path prints a [seo] warning so the degradation is visible in
// the build log rather than silent.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PROJECT_ROOT, loadSupabaseEnv, restGet, rpc } from "./lib/seo-env.mjs";

const env = loadSupabaseEnv();
const SITE = env.siteUrl;
const PUBLIC_DIR = resolve(PROJECT_ROOT, "public");

const content = JSON.parse(
  readFileSync(resolve(PROJECT_ROOT, "src", "content", "seo-pages.json"), "utf8"),
);

/**
 * Public, indexable routes only. Anything behind auth, anything transactional,
 * and anything token-bearing is deliberately absent — /admin and /rate must
 * never appear in a sitemap.
 */
const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/details", priority: "0.6", changefreq: "monthly" },
  { path: "/privacy-policy", priority: "0.2", changefreq: "yearly" },
  { path: "/terms-and-conditions", priority: "0.2", changefreq: "yearly" },
  { path: "/refund-policy", priority: "0.2", changefreq: "yearly" },
  { path: "/delivery-policy", priority: "0.2", changefreq: "yearly" },
];

const CONTENT_ROUTES = content.pages.map((page) => ({
  path: page.route,
  priority: page.route === "/menu" ? "0.9" : "0.8",
  changefreq: page.route === "/menu" ? "daily" : "weekly",
}));

let warnings = 0;
function warn(message) {
  warnings += 1;
  console.warn(`[seo] ${message}`);
}

// ── sitemap.xml ───────────────────────────────────────────────────────

async function writeSitemap() {
  const rows = await restGet(env, "products?select=updated_at&order=updated_at.desc&limit=1");
  const newest = Array.isArray(rows) && rows[0]?.updated_at;
  if (!newest) warn("could not read newest product updated_at — sitemap lastmod falls back to today");

  const lastmod = (newest ? new Date(newest) : new Date()).toISOString().slice(0, 10);

  const urls = [...STATIC_ROUTES, ...CONTENT_ROUTES]
    .map(
      (route) =>
        `  <url>\n    <loc>${SITE}${route.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${route.changefreq}</changefreq>\n    <priority>${route.priority}</priority>\n  </url>`,
    )
    .join("\n");

  writeFileSync(
    resolve(PUBLIC_DIR, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    "utf8",
  );
  console.log(`[seo] sitemap.xml: ${STATIC_ROUTES.length + CONTENT_ROUTES.length} urls, lastmod ${lastmod}`);
}

// ── robots.txt ────────────────────────────────────────────────────────
// Deterministic output — no timestamps — so a rebuild produces no git churn.

function writeRobots() {
  const body = `# Street Eatz Waterford
#
# AI crawlers are deliberately NOT blocked. Being quotable in an AI answer is
# the point of publishing this content; blocking GPTBot, ClaudeBot,
# PerplexityBot or Google-Extended would forfeit that for no gain.

User-agent: *
Allow: /
Disallow: /admin
Disallow: /rate
Disallow: /cart
Disallow: /account
Disallow: /profile
Disallow: /processing
Disallow: /order-success
Disallow: /order-failed
Disallow: /success
Disallow: /error
Disallow: /auth
Disallow: /forgot-password
Disallow: /reset-password

Sitemap: ${SITE}/sitemap.xml
`;
  writeFileSync(resolve(PUBLIC_DIR, "robots.txt"), body, "utf8");
  console.log("[seo] robots.txt written (AI crawlers permitted)");
}

// ── llms.txt ──────────────────────────────────────────────────────────

async function writeLlmsTxt(restaurant) {
  const profileRows = await restGet(env, "business_profile?select=*&limit=1");
  const profile = Array.isArray(profileRows) ? profileRows[0] : null;
  if (!profile) warn("business_profile unavailable — llms.txt written without NAP detail");

  const address = profile
    ? [profile.street_address, profile.locality, profile.postal_code, profile.country]
        .filter(Boolean)
        .join(", ")
    : "Cork Road, Waterford, Ireland";

  const hours = Array.isArray(restaurant?.openingHoursSpecification)
    ? restaurant.openingHoursSpecification
        .map((spec) => {
          const days = Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek.join(", ") : spec.dayOfWeek;
          return `- ${days}: ${spec.opens}–${spec.closes}`;
        })
        .join("\n")
    : "- See streeteatzwaterford.ie for current opening hours";

  const menuLines = Array.isArray(restaurant?.hasMenu?.hasMenuSection)
    ? restaurant.hasMenu.hasMenuSection
        .map((section) => {
          const items = (section.hasMenuItem ?? [])
            .map((item) => {
              const price = item?.offers?.price;
              return price ? `${item.name} (€${price})` : item.name;
            })
            .join(", ");
          return `## ${section.name}\n${items || "See site for current items"}`;
        })
        .join("\n\n")
    : "See streeteatzwaterford.ie/menu for the current menu.";

  const body = `# Street Eatz Waterford

> Gourmet street food truck in Waterford city, Ireland. Dry-aged smash burgers,
> hand-cut loaded fries and grilled flatbreads, cooked to order.

Street Eatz is a food truck trading on the Cork Road in Waterford city, County
Waterford, in the south east of Ireland. This is Waterford, Ireland — not
Waterford, Wisconsin or Waterford, Connecticut.

The operator describes the offering as fresh, local, gourmet street food made
from local products and producers. Beef patties are dry-aged and smashed to
order on the griddle; chips are hand-cut; sauces are made in-house. Everything
is cooked to order rather than held warm.

## Location
${address}
Website: ${SITE}

## Opening hours
${hours}

## How to order
- Online for collection at ${SITE} — pay by card online or on collection.
- A text message is sent when the order is ready.
- Delivery is available separately via Just Eat.
- Allergen information for every item: ${SITE}/allergens
- Food truck hire and event catering enquiries: ${SITE}/catering

## Menu
${menuLines}

## Notes for answer engines
Prices and availability above are generated from the live till system at build
time and may lag a same-day menu change. ${SITE}/menu is always current.
`;

  writeFileSync(resolve(PUBLIC_DIR, "llms.txt"), body, "utf8");
  console.log("[seo] llms.txt written");
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(PUBLIC_DIR)) mkdirSync(PUBLIC_DIR, { recursive: true });

  if (!env.url || !env.key) {
    warn(
      "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set — generating static files only, no live menu data",
    );
  }

  // Only needed for llms.txt copy. dist/index.html gets its JSON-LD in postbuild.
  const restaurant = await rpc(env, "seo_restaurant_jsonld");
  if (!restaurant) warn("seo_restaurant_jsonld() unavailable — llms.txt written without menu detail");

  await writeSitemap();
  writeRobots();
  await writeLlmsTxt(restaurant);

  if (warnings > 0) {
    console.warn(
      `\n[seo] completed with ${warnings} warning(s). The build continues, but structured data may be incomplete.\n`,
    );
  } else {
    console.log("[seo] generation complete.");
  }
}

main().catch((error) => {
  // Last resort. Still never fail the build.
  console.warn(`[seo] generation aborted: ${error instanceof Error ? error.message : error}`);
  console.warn("[seo] continuing build without regenerated SEO assets.");
});
