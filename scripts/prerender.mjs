// prerender.mjs — build-time prerendering. Runs in `postbuild`, after Vite.
//
// THE PROBLEM THIS SOLVES
// The site is a client-rendered SPA, so the HTML served to a crawler is an
// empty <div id="root">. Google may eventually run the JS; AI answer engines
// largely do not. The result is that Just Eat outranks Street Eatz for Street
// Eatz's own menu, and Danny pays commission on his own customers.
//
// APPROACH
// No headless browser, no SSR, no new dependencies. This script takes the
// already-built dist/index.html (so it inherits the hashed asset links and the
// JSON-LD injected by generate-seo.mjs), renders real HTML for each marketing
// route from live menu data, and writes dist/<route>/index.html.
//
// Netlify serves a matching static file before it applies the SPA catch-all
// redirect, so a cold visit or a crawler gets real HTML. main.tsx then calls
// createRoot().render(), which replaces the container's children with the live
// app — the prerendered markup is a crawlable floor, not a second UI to
// maintain. Copy comes from src/content/seo-pages.json, which the React page
// reads too, so the two cannot drift.
//
// Failure policy: same as generate-seo.mjs. Warn loudly, never fail the build.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROJECT_ROOT,
  loadSupabaseEnv,
  restGet,
  rpc,
  replaceMarkedBlock,
  escapeHtml,
  safeJsonForScript,
} from "./lib/seo-env.mjs";

const env = loadSupabaseEnv();
const SITE = env.siteUrl;
const DIST = resolve(PROJECT_ROOT, "dist");

const content = JSON.parse(
  readFileSync(resolve(PROJECT_ROOT, "src", "content", "seo-pages.json"), "utf8"),
);

// The 14 EU allergen categories. Fixed in law; mirrored in
// src/hooks/useProductAllergens.ts (ALLERGEN_KEY).
const ALLERGEN_KEY = {
  1: "Gluten", 2: "Crustaceans", 3: "Eggs", 4: "Fish", 5: "Peanuts",
  6: "Soy", 7: "Milk", 8: "Nuts", 9: "Celery", 10: "Mustard",
  11: "Sesame", 12: "Sulphites", 13: "Lupins", 14: "Molluscs",
};

let warnings = 0;
const warn = (message) => {
  warnings += 1;
  console.warn(`[prerender] ${message}`);
};

const money = (value) => `€${Number(value ?? 0).toFixed(2)}`;

// ── Data ──────────────────────────────────────────────────────────────

async function loadData() {
  const [products, allergens, profile, restaurant, featured] = await Promise.all([
    restGet(
      env,
      "products?select=id,name,description,price,category&is_visible=eq.true&is_available=eq.true&order=category.asc,is_featured.desc,name.asc",
    ),
    restGet(env, "product_allergens?select=product_id,allergen_numbers"),
    restGet(env, "business_profile?select=*&limit=1"),
    rpc(env, "seo_restaurant_jsonld"),
    restGet(
      env,
      "products?select=image_url&is_visible=eq.true&is_available=eq.true&image_url=not.is.null&order=is_featured.desc,name.asc&limit=1",
    ),
  ]);

  if (!products) warn("menu unavailable — pages will prerender without dish text");
  if (!allergens) warn("allergen data unavailable — /allergens will prerender empty");
  if (!restaurant) warn("seo_restaurant_jsonld() unavailable — pages ship WITHOUT Restaurant markup");

  return {
    products: products ?? [],
    allergens: allergens ?? [],
    profile: (Array.isArray(profile) && profile[0]) || null,
    restaurant: restaurant ?? null,
    featuredImage: (Array.isArray(featured) && featured[0]?.image_url) || null,
  };
}

// ── Fragments ─────────────────────────────────────────────────────────

function renderMenuSection(category, products) {
  const items = products.filter((product) => product.category === category);
  if (items.length === 0) return "";

  const rows = items
    .map((item) => {
      const description = item.description
        ? `<p class="pr-desc">${escapeHtml(item.description)}</p>`
        : "";
      return `<li class="pr-item"><h3 class="pr-item-name">${escapeHtml(item.name)} <span class="pr-price">${money(item.price)}</span></h3>${description}</li>`;
    })
    .join("\n");

  return `<section class="pr-section"><h2>${escapeHtml(category)}</h2><ul class="pr-list">\n${rows}\n</ul></section>`;
}

function renderAllergenTable(products, allergens) {
  const byProduct = new Map(allergens.map((row) => [row.product_id, row.allergen_numbers ?? []]));
  if (products.length === 0) return "<p>Allergen information is being updated. Please ask us directly.</p>";

  const rows = products
    .map((product) => {
      const numbers = byProduct.get(product.id);
      const label =
        Array.isArray(numbers) && numbers.length > 0
          ? [...numbers].sort((a, b) => a - b).map((n) => `${n} ${ALLERGEN_KEY[n] ?? "Unknown"}`).join(", ")
          : "Not yet confirmed — please ask before ordering";
      return `<tr><td>${escapeHtml(product.name)}</td><td>${escapeHtml(product.category)}</td><td>${escapeHtml(label)}</td></tr>`;
    })
    .join("\n");

  const key = Object.entries(ALLERGEN_KEY)
    .map(([number, name]) => `${number} ${name}`)
    .join(" · ");

  return `<section class="pr-section"><h2>Allergens by menu item</h2><div class="pr-scroll"><table class="pr-table"><thead><tr><th>Item</th><th>Category</th><th>Allergens</th></tr></thead><tbody>\n${rows}\n</tbody></table></div><p class="pr-key"><strong>Key:</strong> ${escapeHtml(key)}</p></section>`;
}

function renderEnquiryNote() {
  // The form itself is a React component. Crawlers get the contact route and a
  // plain mailto so the page is useful without JavaScript.
  return `<section class="pr-section"><h2>Enquire about food truck hire</h2><p>Send the date, location, approximate guest numbers and the time you would like food served, and we will come back with a price.</p><p><a class="pr-cta" href="/catering">Open the catering enquiry form</a></p></section>`;
}

function renderFaq(faq) {
  if (!Array.isArray(faq) || faq.length === 0) return "";
  const items = faq
    .map(
      (entry) =>
        `<div class="pr-faq"><h3>${escapeHtml(entry.q)}</h3><p>${escapeHtml(entry.a)}</p></div>`,
    )
    .join("\n");
  return `<section class="pr-section"><h2>Common questions</h2>\n${items}\n</section>`;
}

function renderFooter(profile) {
  const address = profile
    ? [profile.street_address, profile.locality, profile.postal_code, profile.country]
        .filter(Boolean)
        .join(", ")
    : "Cork Road, Waterford, Ireland";
  const phone = profile?.telephone
    ? `<p>Phone: <a href="tel:${escapeHtml(profile.telephone.replace(/\s+/g, ""))}">${escapeHtml(profile.telephone)}</a></p>`
    : "";
  return `<footer class="pr-footer"><h2>Street Eatz Waterford</h2><p>${escapeHtml(address)}</p>${phone}<p><a href="/menu">Menu</a> · <a href="/allergens">Allergens</a> · <a href="/catering">Food truck hire</a> · <a href="/details">Opening hours and location</a></p></footer>`;
}

// Minimal inline styling so the prerendered floor is legible to a human who
// lands before React mounts, or with JS disabled. Deliberately tiny — the real
// design lives in the app.
const PRERENDER_STYLE = `<style id="pr-style">
.pr-wrap{max-width:44rem;margin:0 auto;padding:2rem 1.25rem 4rem;color:#fff;font-family:Inter,system-ui,sans-serif;line-height:1.6}
.pr-wrap h1{font-family:Montserrat,system-ui,sans-serif;font-size:1.9rem;line-height:1.2;margin:0 0 .75rem;text-transform:uppercase}
.pr-wrap h2{font-family:Montserrat,system-ui,sans-serif;font-size:1.25rem;margin:2rem 0 .5rem;color:#FF6B00}
.pr-wrap h3{font-size:1rem;margin:1rem 0 .25rem}
.pr-lede{font-size:1.05rem;color:#d4d4d4}
.pr-list{list-style:none;padding:0;margin:0}
.pr-item{border-bottom:1px solid #262626;padding:.75rem 0}
.pr-item-name{display:flex;justify-content:space-between;gap:1rem;font-family:Montserrat,system-ui,sans-serif}
.pr-price{color:#FF6B00;white-space:nowrap}
.pr-desc{margin:.25rem 0 0;color:#a3a3a3;font-size:.925rem}
.pr-scroll{overflow-x:auto}
.pr-table{width:100%;border-collapse:collapse;font-size:.9rem}
.pr-table th,.pr-table td{text-align:left;padding:.5rem;border-bottom:1px solid #262626;vertical-align:top}
.pr-key{color:#a3a3a3;font-size:.8rem}
.pr-cta{display:inline-block;background:#FF6B00;color:#000;font-weight:700;padding:.75rem 1.25rem;border-radius:.5rem;text-decoration:none}
.pr-footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #262626;color:#a3a3a3;font-size:.9rem}
.pr-wrap a{color:#FF6B00}
</style>`;

// ── Page assembly ─────────────────────────────────────────────────────

function buildBody(page, data) {
  const parts = [
    `<h1>${escapeHtml(page.h1)}</h1>`,
    `<p class="pr-lede">${escapeHtml(page.intro)}</p>`,
  ];

  for (const category of page.categories ?? []) {
    parts.push(renderMenuSection(category, data.products));
  }

  if (page.renderAllergenTable) {
    parts.push(renderAllergenTable(data.products, data.allergens));
  }

  for (const section of page.sections ?? []) {
    parts.push(`<section class="pr-section"><h2>${escapeHtml(section.h2)}</h2><p>${escapeHtml(section.body)}</p></section>`);
  }

  if (page.showEnquiryForm) parts.push(renderEnquiryNote());

  if ((page.categories ?? []).length > 0) {
    parts.push(`<p><a class="pr-cta" href="/">Order online for collection</a></p>`);
  }

  parts.push(renderFaq(page.faq));
  parts.push(renderFooter(data.profile));

  return `<div class="pr-wrap">\n${parts.filter(Boolean).join("\n")}\n</div>`;
}

function faqJsonLd(page) {
  if (!Array.isArray(page.faq) || page.faq.length === 0) return "";
  const document = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((entry) => ({
      "@type": "Question",
      name: entry.q,
      acceptedAnswer: { "@type": "Answer", text: entry.a },
    })),
  };
  return `<script type="application/ld+json">${safeJsonForScript(document)}</script>`;
}

function applyHead(html, page) {
  const canonical = `${SITE}${page.route}`;
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${escapeHtml(page.description)}" />`,
    )
    .replace(
      /<link rel="canonical" href="[^"]*" \/>/,
      `<link rel="canonical" href="${canonical}" />`,
    )
    .replace(
      /<meta property="og:url" content="[^"]*" \/>/,
      `<meta property="og:url" content="${canonical}" />`,
    )
    .replace(
      /<meta property="og:title" content="[^"]*" \/>/,
      `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    )
    .replace(
      /<meta property="og:description" content="[^"]*" \/>/,
      `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    )
    .replace(
      /<meta name="twitter:title" content="[^"]*" \/>/,
      `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    )
    .replace(
      /<meta name="twitter:description" content="[^"]*" \/>/,
      `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    )
    .replace("</head>", `  ${faqJsonLd(page)}\n    ${PRERENDER_STYLE}\n  </head>`);
}

function injectBody(html, body) {
  const rootPattern = /<div id="root">[\s\S]*?<\/div>/;
  if (!rootPattern.test(html)) {
    warn('could not find <div id="root"> — page written without prerendered content');
    return html;
  }
  return html.replace(rootPattern, `<div id="root">${body}</div>`);
}

function writePage(route, html) {
  const directory = route === "/" ? DIST : resolve(DIST, route.replace(/^\//, ""));
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "index.html"), html, "utf8");
}

// ── Home page ─────────────────────────────────────────────────────────

function buildHomeBody(data) {
  const featured = data.products.slice(0, 8);
  const items = featured
    .map(
      (item) =>
        `<li class="pr-item"><h3 class="pr-item-name">${escapeHtml(item.name)} <span class="pr-price">${money(item.price)}</span></h3>${item.description ? `<p class="pr-desc">${escapeHtml(item.description)}</p>` : ""}</li>`,
    )
    .join("\n");

  return `<div class="pr-wrap">
<h1>Street Eatz — gourmet street food in Waterford</h1>
<p class="pr-lede">Street Eatz is a food truck on the Cork Road in Waterford city, County Waterford, Ireland. Dry-aged smash burgers, hand-cut loaded fries and grilled flatbreads, cooked to order. Fresh, local, gourmet street food made from local products and producers.</p>
<section class="pr-section"><h2>From the menu</h2><ul class="pr-list">\n${items}\n</ul><p><a class="pr-cta" href="/menu">See the full menu</a></p></section>
<section class="pr-section"><h2>Order for collection</h2><p>Order online and pay by card, or pay when you collect at the truck. You will get a text message when your food is ready. Delivery is available separately through Just Eat, though ordering direct here is better value.</p></section>
${renderFooter(data.profile)}
</div>`;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const indexPath = resolve(DIST, "index.html");
  if (!existsSync(indexPath)) {
    warn("dist/index.html missing — did vite build run? Skipping prerender.");
    return;
  }

  let template = readFileSync(indexPath, "utf8");
  const data = await loadData();
  const written = [];

  // Real food photography beats the app icon on a share card. Applies to every
  // page, so it goes into the shared template.
  if (data.featuredImage) {
    template = replaceMarkedBlock(
      template,
      "SOCIAL_IMAGE",
      `\n    <meta property="og:image" content="${data.featuredImage}" />\n    <meta name="twitter:image" content="${data.featuredImage}" />\n    `,
    );
    console.log("[prerender] social image set from live menu photography");
  } else {
    warn("no product image available — social share keeps the app-icon fallback");
  }

  // The Restaurant + Menu document goes on / and /menu only. Repeating a 15KB
  // menu on every page would bloat each one for no additional ranking value.
  const withRestaurant = data.restaurant
    ? replaceMarkedBlock(
        template,
        "JSONLD",
        `\n    <script type="application/ld+json">${safeJsonForScript(data.restaurant)}</script>\n    `,
      )
    : template;

  if (data.restaurant) {
    const sections = data.restaurant?.hasMenu?.hasMenuSection?.length ?? 0;
    console.log(
      `[prerender] Restaurant JSON-LD: ${JSON.stringify(data.restaurant).length} bytes, ${sections} menu sections`,
    );
  }

  // Home page, written back over dist/index.html.
  writePage("/", injectBody(withRestaurant, buildHomeBody(data)));
  written.push("/");

  for (const page of content.pages) {
    const base = page.route === "/menu" ? withRestaurant : template;
    const html = injectBody(applyHead(base, page), buildBody(page, data));
    writePage(page.route, html);
    written.push(page.route);
  }

  console.log(`[prerender] wrote ${written.length} pages: ${written.join(", ")}`);
  console.log(`[prerender] menu items rendered: ${data.products.length}`);

  if (warnings > 0) {
    console.warn(`\n[prerender] completed with ${warnings} warning(s) — pages may lack dish text.\n`);
  }
}

main().catch((error) => {
  console.warn(`[prerender] aborted: ${error instanceof Error ? error.message : error}`);
  console.warn("[prerender] continuing — the SPA fallback still serves every route.");
});
