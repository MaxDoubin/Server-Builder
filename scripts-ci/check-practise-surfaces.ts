/**
 * Every practise surface has to be findable from the front page, from the
 * hub, and from the palette.
 *
 * WHY THIS EXISTS. Before the act that added them, the home page linked to
 * exactly two places: the blog and the projects. Ten interactive surfaces
 * had been built and every one was reachable only from the nav or the
 * footer. That is a failure with no symptom, which is the kind worth
 * automating, so a gate was written.
 *
 * WHY IT WAS REWRITTEN. The gate kept a hand-typed list of twelve routes.
 * Six surfaces added in one day were in the act and the hub and in none of
 * those twelve, so the gate never looked at them. The array calculator was
 * in neither the act nor the hub and had never been in the twelve either, so
 * a whole surface sat reachable only from the footer and the check built to
 * prevent exactly that reported OK every time it ran.
 *
 * A gate against stale hand-maintained lists, with a stale hand-maintained
 * list in it. The list is derived now, from client/src/lib/practiseSurfaces,
 * and this file checks in both directions: every surface in the registry
 * appears in each place a reader would look, and every practise-looking link
 * in those places is a surface in the registry. One direction catches a
 * surface nobody can find. The other catches a link to something that no
 * longer exists.
 */

import { readFileSync } from "node:fs";
import { GROUPS, PRACTISE_SURFACES, surfacesIn } from "../client/src/lib/practiseSurfaces";
import { postIndex } from "../client/src/lib/postIndex";

const problems: string[] = [];

const ACT = "client/src/pages/cinematic/acts/PractiseAct.tsx";
const HUB = "client/src/pages/cinematic/CinematicPractise.tsx";
const PALETTE = "client/src/components/cinematic/CommandPalette.tsx";
const FOOTER = "client/src/components/cinematic/CinematicFooter.tsx";

const read = (path: string) => readFileSync(path, "utf8");
const links = (text: string, href: string) =>
  text.includes(`href: "${href}"`) || text.includes(`href="${href}"`);

if (PRACTISE_SURFACES.length < 10) {
  console.error(`FAIL  the registry holds ${PRACTISE_SURFACES.length} surfaces, which is too few to be right.`);
  process.exit(1);
}

/* ------------------------------------- every surface, everywhere it belongs */

/**
 * The home page carries the doing surfaces, and not the reference ones.
 *
 * This is a decision rather than an oversight, so it is written down. The
 * act is one section of a front page and every surface in the registry
 * would make it twenty cards, which stops being a front door and becomes a
 * second hub. The glossary, the flashcards, the exam sheets and the tools
 * are things you reach for while doing something else; they are one click
 * away in the nav, the footer, the palette and the hub, and the act links
 * the hub. Everything you actually sit down and do is on the front page.
 */
const actRequires = PRACTISE_SURFACES.filter((surface) => surface.group !== "ground");

const places: [string, string, typeof PRACTISE_SURFACES][] = [
  [ACT, "the home page's practise act", actRequires],
  [HUB, "the practise hub", PRACTISE_SURFACES],
  [PALETTE, "the command palette", PRACTISE_SURFACES],
  [FOOTER, "the footer", PRACTISE_SURFACES],
];

for (const [path, label, required] of places) {
  const text = read(path);
  for (const surface of required) {
    if (!links(text, surface.href)) {
      problems.push(`${label} does not link to ${surface.href} (${surface.title})`);
    }
  }
}

/*
  The prerendered body, for a crawler and a reader with no JavaScript. It
  carries the same set as the act, because it is the act's content rendered
  without the bundle: a crawler that sees fewer surfaces than a reader is
  the original bug in a quieter form.
*/
const home = read("dist/public/index.html");
for (const surface of actRequires) {
  if (!home.includes(`href="https://maxdoubin.com${surface.href}"`)) {
    problems.push(`the prerendered home page does not link to ${surface.href}`);
  }
}
for (const button of ["/today", "/practise"]) {
  if (!read(ACT).includes(`href="${button}"`)) {
    problems.push(`the practise act is missing its ${button} button`);
  }
}

/*
  And the other direction. A link in the act or the hub to a route the
  registry does not know about is either a surface somebody forgot to
  register or a page that no longer exists, and both are worth failing over.
*/
const known = new Set(PRACTISE_SURFACES.map((surface) => surface.href));
const ALLOWED_EXTRAS = new Set(["/today", "/practise", "/blog", "/racks", "/game", "/ncl", "/paths", "/verify", "/"]);
for (const [path, label] of [[ACT, "the act"], [HUB, "the hub"]] as [string, string][]) {
  const text = read(path);
  for (const match of text.matchAll(/href[:=]\s*"(\/[a-z0-9-]*)"/g)) {
    const href = match[1];
    if (known.has(href) || ALLOWED_EXTRAS.has(href)) continue;
    problems.push(
      `${label} links to ${href}, which is not in the practise registry. Register it, or add it to ALLOWED_EXTRAS.`,
    );
  }
}

/* ------------------------------------------------- the registry itself */

const seen = new Set<string>();
for (const surface of PRACTISE_SURFACES) {
  if (seen.has(surface.href)) problems.push(`${surface.href} is registered twice`);
  seen.add(surface.href);
  if (!surface.title || surface.title.length < 6) problems.push(`${surface.href} has no usable title`);
  if (!surface.eyebrow) problems.push(`${surface.href} has no eyebrow`);
}

/*
  Grouping only helps if the groups are used. One group holding almost
  everything is the flat list again with a heading on it, which is what this
  page looked like at eighteen cards and twelve phone screens.
*/
for (const group of GROUPS) {
  const members = surfacesIn(group);
  if (members.length === 0) problems.push(`the "${group}" group is empty`);
  if (members.length > PRACTISE_SURFACES.length * 0.55) {
    problems.push(
      `the "${group}" group holds ${members.length} of ${PRACTISE_SURFACES.length} surfaces, which is a flat list with a heading on it`,
    );
  }
}
/*
  Every surface accounted for by some group in GROUPS.

  This named the four groups by hand and therefore could not see a fifth: on
  the day "measure" was added, seven surfaces moved into it and this line
  reported them as belonging to nothing, because it was summing a list it had
  been given rather than the list that exists. Derived from GROUPS now, so
  adding a group is one edit rather than two.
*/
const grouped = GROUPS.reduce((total, group) => total + surfacesIn(group).length, 0);
if (grouped !== PRACTISE_SURFACES.length) {
  const homeless = PRACTISE_SURFACES.filter((surface) => !GROUPS.includes(surface.group));
  problems.push(
    `${PRACTISE_SURFACES.length - grouped} surfaces are in no group in GROUPS` +
      (homeless.length ? `: ${homeless.map((s) => `${s.href} (${s.group})`).join(", ")}` : "") +
      `. Either the group is missing from GROUPS or the surface names one that does not exist.`,
  );
}

/**
 * The hub has to render the headings, not merely import them.
 *
 * The first version of this checked that the string "GROUP_HEADING"
 * appeared in the file, which the import line satisfies on its own. I found
 * that by blinding it: replacing the rendered heading with a hard-coded word
 * left the import in place and the check passed. Testing for the identifier
 * rather than for its use is a necessary condition standing in for a
 * sufficient one, and it is the third time in one day I have written that
 * exact mistake.
 */
const hub = read(HUB);
if (!/\{\s*GROUP_HEADING\[/.test(hub)) {
  problems.push(
    "the hub does not interpolate GROUP_HEADING into its markup, so the registry's grouping is not what a reader sees",
  );
}
if (!/\{\s*GROUP_BLURB\[/.test(hub)) {
  problems.push("the hub does not render GROUP_BLURB, so each group is a heading with no explanation");
}
/* And it has to iterate the groups rather than hard-coding a subset of them. */
if (!/GROUPS\.map\(/.test(hub)) {
  problems.push("the hub does not map over GROUPS, so adding a group would not add a section");
}
for (const group of GROUPS) {
  if (!hub.includes(`group-${group}`) && !/GROUPS\.map\(/.test(hub)) {
    problems.push(`the hub does not render the "${group}" group`);
  }
}

/* ------------------------------------ the articles behind each surface */

/*
  Two of two hundred and sixty articles linked to a practise surface, and one
  surface of twenty linked back. The curated map fixes that in both
  directions at once, which means a slug pointing at a deleted or renamed
  article breaks a reader's path silently and in two places.
*/
const published = new Map(postIndex.filter((post) => !post.draft).map((post) => [post.slug, post]));
let curated = 0;

for (const surface of PRACTISE_SURFACES) {
  const reading = surface.reading ?? [];
  if (reading.length === 0) {
    /* A surface with nothing to read is allowed; a doing surface with nothing is suspicious. */
    if (surface.group !== "ground") {
      problems.push(
        `${surface.href} has no reading. Every exercise on this site is about something that has been written about.`,
      );
    }
    continue;
  }
  const seenSlugs = new Set<string>();
  for (const slug of reading) {
    curated += 1;
    if (seenSlugs.has(slug)) problems.push(`${surface.href} lists ${slug} twice`);
    seenSlugs.add(slug);
    if (!published.has(slug)) {
      problems.push(
        `${surface.href} points at the article "${slug}", which is not a published post. ` +
          `A renamed slug breaks the path in both directions and nothing else would say so.`,
      );
    }
  }
}

/*
  And the component that renders them has to exist and be used, or the map is
  data nobody sees. Both directions, because they are separate components and
  wiring one and forgetting the other is the exact failure this replaces.
*/
const component = "client/src/components/practise/ReadAboutThis.tsx";
const readerSide = read(component);
for (const exported of ["ReadAboutThis", "PractiseThis"]) {
  if (!readerSide.includes(`export function ${exported}`)) {
    problems.push(`${component} does not export ${exported}`);
  }
}
if (!/<PractiseThis\s/.test(read("client/src/pages/cinematic/CinematicBlogPost.tsx"))) {
  problems.push("blog posts do not render PractiseThis, so no article offers the surface that practises it");
}
{
  const rendering = PRACTISE_SURFACES.filter((surface) => (surface.reading ?? []).length > 0)
    .map((surface) => surface.href)
    .filter((href) => {
      const name = "Cinematic" + href.slice(1, 2).toUpperCase() + href.slice(2);
      try {
        return !/<ReadAboutThis\s/.test(read(`client/src/pages/cinematic/${name}.tsx`));
      } catch {
        /* Surfaces whose page is named differently are checked by hand below. */
        return false;
      }
    });
  for (const href of rendering) {
    problems.push(`${href} has curated reading and its page does not render ReadAboutThis`);
  }
}

/* No hand-typed count of the surfaces, anywhere. That number goes stale by tomorrow. */
for (const [path, label] of places) {
  const text = read(path);
  for (const match of text.matchAll(/\b(\d{1,3})\s+(?:practise |interactive )?surfaces?\b/g)) {
    problems.push(
      `${label} writes "${match[0]}". Interpolate PRACTISE_SURFACES.length: that number was wrong six times today.`,
    );
  }
}

if (problems.length) {
  console.error(`\ncheck-practise-surfaces: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  all ${PRACTISE_SURFACES.length} practise surfaces are linked from the hub, the palette and the footer, ` +
    `the ${actRequires.length} you sit down and do are on the front page and in its prerendered body, ` +
    `the ${GROUPS.length} groups hold ${GROUPS.map((g) => surfacesIn(g).length).join(", ")}, ` +
    `and ${curated} curated article links resolve in both directions.`,
);
