#!/usr/bin/env node
/**
 * inject-schema.js
 *
 * Walks every .html file in the repo and injects/refreshes JSON-LD schema:
 *   - Organization (with description + sameAs)
 *   - WebSite
 *   - BreadcrumbList (derived from the file path)
 *   - SoftwareApplication + AggregateRating (homepage only)
 *
 * Safe to re-run: managed blocks are wrapped in HTML comment markers and
 * fully replaced on each run. Any pre-existing UNMARKED Organization/WebSite
 * <script type="application/ld+json"> blocks are removed and replaced by the
 * managed ones, so you don't end up with duplicates. FAQPage, Review, or any
 * other schema you've hand-written elsewhere is left untouched.
 *
 * Usage:
 *   node inject-schema.js            (writes changes)
 *   node inject-schema.js --dry-run  (prints what would change, writes nothing)
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// CONFIG — edit these to match your brand
// ---------------------------------------------------------------------------
const SITE_URL = "https://linkfinderai.com";
const ORG_NAME = "LinkFinderAI";
const ORG_LOGO = "https://i.ibb.co/jPjX9SSp/Screen-Shot-2025-03-28-at-8-16-15-PM.png";
const ORG_DESCRIPTION =
  "B2B data enrichment API for sales and revenue teams. Enrich CRM data and automate workflows in n8n, Make, and Zapier.";
const SAME_AS = [
  "https://www.linkedin.com/in/eliasse-hamour-08194821a/",
  "https://www.trustpilot.com/review/linkfinderai.com",
  "https://www.producthunt.com/products/link-finder",
];

// Pulled from a live Trustpilot check — update this periodically, don't invent numbers.
const AGGREGATE_RATING = {
  ratingValue: "4.0",
  reviewCount: "37",
  bestRating: "5",
};

const PRODUCT_NAME = "LinkFinder AI";
const PRODUCT_DESCRIPTION = ORG_DESCRIPTION;
const PRODUCT_CATEGORY = "BusinessApplication";
const OFFERS_PRICE = "23.00";
const OFFERS_CURRENCY = "USD";

const ROOT_DIR = process.argv[3] || process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".github",
  "dist",
  "build",
  ".next",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findHtmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      findHtmlFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

// Derive a clean URL path from a file's location relative to ROOT_DIR
function urlPathFor(filePath) {
  let rel = path.relative(ROOT_DIR, filePath).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel;
}

// Turn a URL path into readable breadcrumb labels
function breadcrumbLabel(segment) {
  return segment
    .replace(/\.html$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildBreadcrumbSchema(urlPath) {
  if (urlPath === "/") return null; // no breadcrumb needed on homepage
  const segments = urlPath.split("/").filter(Boolean);
  const itemListElement = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL + "/",
    },
  ];
  let cumulative = "";
  segments.forEach((seg, i) => {
    cumulative += "/" + seg;
    itemListElement.push({
      "@type": "ListItem",
      position: i + 2,
      name: breadcrumbLabel(seg),
      item: SITE_URL + cumulative,
    });
  });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
}

function buildOrgAndWebsiteSchema() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: ORG_NAME,
      url: SITE_URL,
      logo: ORG_LOGO,
      description: ORG_DESCRIPTION,
      sameAs: SAME_AS,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: ORG_NAME,
      url: SITE_URL,
    },
  ];
}

function buildProductSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
    applicationCategory: PRODUCT_CATEGORY,
    operatingSystem: "Web",
    url: SITE_URL,
    offers: {
      "@type": "Offer",
      price: OFFERS_PRICE,
      priceCurrency: OFFERS_CURRENCY,
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: AGGREGATE_RATING.ratingValue,
      reviewCount: AGGREGATE_RATING.reviewCount,
      bestRating: AGGREGATE_RATING.bestRating,
    },
  };
}

function ldJsonBlock(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

function managedBlock(id, objOrArray) {
  const blocks = Array.isArray(objOrArray)
    ? objOrArray.map(ldJsonBlock).join("\n")
    : ldJsonBlock(objOrArray);
  return `<!-- SCHEMA:${id}:START -->\n${blocks}\n<!-- SCHEMA:${id}:END -->`;
}

function replaceOrInsertManaged(html, id, objOrArray) {
  const block = managedBlock(id, objOrArray);
  const markerRe = new RegExp(
    `<!-- SCHEMA:${id}:START -->[\\s\\S]*?<!-- SCHEMA:${id}:END -->`
  );
  if (markerRe.test(html)) {
    return html.replace(markerRe, block);
  }
  // insert right before </head>
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `  ${block}\n</head>`);
  }
  // no head tag found — bail, leave html unchanged, caller will warn
  return null;
}

// Strip pre-existing UNMARKED Organization/WebSite ld+json blocks so we don't
// end up with duplicates once the managed ORG block is inserted.
function stripLegacyOrgWebsiteBlocks(html) {
  const scriptRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  let result = html;
  const toRemove = [];

  while ((match = scriptRe.exec(html)) !== null) {
    const fullTag = match[0];
    const jsonText = match[1];
    // skip anything already inside our managed markers (handled separately)
    try {
      const parsed = JSON.parse(jsonText);
      const types = Array.isArray(parsed) ? parsed : [parsed];
      const hasOrgOrSite = types.some(
        (t) => t && (t["@type"] === "Organization" || t["@type"] === "WebSite")
      );
      if (hasOrgOrSite) toRemove.push(fullTag);
    } catch (e) {
      // not valid JSON — leave it alone
    }
  }

  for (const tag of toRemove) {
    result = result.replace(tag, "");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const files = findHtmlFiles(ROOT_DIR);
  if (files.length === 0) {
    console.log("No .html files found under", ROOT_DIR);
    return;
  }

  let changedCount = 0;

  for (const file of files) {
    const original = fs.readFileSync(file, "utf8");
    let html = original;

    const urlPath = urlPathFor(file);
    const isHomepage = urlPath === "/";

    // 1. Remove old unmarked Organization/WebSite blocks (but never touch
    //    anything already wrapped in our SCHEMA: markers on a re-run — those
    //    get fully replaced by replaceOrInsertManaged below anyway).
    html = stripLegacyOrgWebsiteBlocks(html);

    // 2. Managed Organization + WebSite block, every page.
    let next = replaceOrInsertManaged(html, "ORG", buildOrgAndWebsiteSchema());
    if (next === null) {
      console.warn(`⚠️  Skipped (no <head> tag found): ${file}`);
      continue;
    }
    html = next;

    // 3. Breadcrumbs — every page except homepage.
    const breadcrumb = buildBreadcrumbSchema(urlPath);
    if (breadcrumb) {
      next = replaceOrInsertManaged(html, "BREADCRUMB", breadcrumb);
      if (next !== null) html = next;
    }

    // 4. Product schema — homepage only.
    if (isHomepage) {
      next = replaceOrInsertManaged(html, "PRODUCT", buildProductSchema());
      if (next !== null) html = next;
    }

    if (html !== original) {
      changedCount++;
      console.log(`${DRY_RUN ? "[dry-run] would update" : "updated"}: ${file}`);
      if (!DRY_RUN) fs.writeFileSync(file, html, "utf8");
    }
  }

  console.log(
    `\nDone. ${changedCount}/${files.length} file(s) ${DRY_RUN ? "would be" : "were"} updated.`
  );
  if (DRY_RUN) console.log("Re-run without --dry-run to write changes.");
}

main();
