/**
 * Every JSON-LD block must parse and carry the fields Google requires.
 *
 * The home page shipped an Event for the Nevada All-State Band with no
 * startDate. startDate is required on Event, so Google's Rich Results Test
 * reported a critical issue and the item produced nothing. Nobody noticed
 * because invalid structured data fails silently: the page still renders,
 * the build still passes, and the only symptom is a rich result that never
 * appears.
 *
 * This parses every ld+json block in the built HTML and checks the required
 * fields for the types this site actually emits. It is not a full schema.org
 * validator and does not try to be. It catches the failure that already
 * happened and the ones adjacent to it.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIST = "dist/public";

/**
 * Required properties per type, from Google's structured data documentation.
 * Only types this site emits are listed; an unknown type is skipped rather
 * than guessed at.
 */
const REQUIRED = {
  Event: ["name", "startDate", "location"],
  BlogPosting: ["headline", "datePublished"],
  Article: ["headline", "datePublished"],
  Person: ["name"],
  Dataset: ["name", "description"],
  FAQPage: ["mainEntity"],
  BreadcrumbList: ["itemListElement"],
  Question: ["name", "acceptedAnswer"],
  ListItem: ["position", "name"],
  LearningResource: ["name"],
  CollectionPage: ["name"],
  Organization: ["name"],
  WebSite: ["name", "url"],
};

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const problems = [];
let blocks = 0;
let checked = 0;

for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, "utf8");
  const route = file.replace(`${DIST}`, "").replace(/\/index\.html$/, "") || "/";

  for (const match of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )) {
    blocks += 1;
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch (err) {
      problems.push(`${route}: JSON-LD does not parse: ${err.message}`);
      continue;
    }

    // Structured data nests: a Person holds credentials, a FAQPage holds
    // Questions. Every object with an @type gets checked wherever it sits.
    const visit = (node) => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (!node || typeof node !== "object") return;

      const type = node["@type"];
      const required = typeof type === "string" ? REQUIRED[type] : undefined;
      if (required) {
        checked += 1;
        // A node that is only a reference to another node, {"@id": "..."},
        // is legitimate and carries no fields of its own.
        const isReference = node["@id"] && Object.keys(node).length <= 2;
        if (!isReference) {
          const missing = required.filter(
            (f) => node[f] === undefined || node[f] === null || node[f] === "",
          );
          if (missing.length > 0) {
            problems.push(
              `${route}: ${type} "${node.name ?? node.headline ?? "unnamed"}" is missing ${missing.map((m) => `"${m}"`).join(", ")}`,
            );
          }
        }
      }
      for (const value of Object.values(node)) visit(value);
    };
    visit(data);
  }
}

if (blocks === 0) {
  console.error("FAIL  no JSON-LD found in dist/public. The prerender step did not run.");
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`FAIL  ${problems.length} structured data problem(s).\n`);
  // One route can repeat the same fault across hundreds of pages, so show a
  // sample rather than a wall.
  for (const p of problems.slice(0, 15)) console.error(`  ${p}`);
  if (problems.length > 15) console.error(`  ... and ${problems.length - 15} more`);
  console.error(
    "\n  Google drops an item that is missing a required field, silently." +
      "\n  Add the field, or remove the markup if the fact does not fit the type.",
  );
  process.exit(1);
}

console.log(
  `OK  ${blocks} JSON-LD blocks parse and ${checked} typed items carry their required fields.`,
);
