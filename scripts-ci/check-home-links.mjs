/**
 * The front door has to mention the practise surfaces.
 *
 * WHY THIS EXISTS. Before the act that added them, the home page linked to
 * exactly two places: the blog and the projects. Ten interactive surfaces had
 * been built and every one of them was reachable only from the nav or the
 * footer. Nothing was broken and nothing reported a problem; the best work on
 * the site was simply invisible from its front page for weeks.
 *
 * That is a failure with no symptom, which is the kind worth automating. This
 * asserts that both the prerendered home body and the React act carry a link
 * to every practise route, so adding an eleventh surface and forgetting the
 * home page fails the build.
 */

import { readFileSync } from "node:fs";

const REQUIRED = [
  "/today",
  "/practise",
  "/scenarios",
  "/labs",
  "/capture",
  "/challenges",
  "/triage",
  "/firewall",
  "/resolve",
  "/chain",
  "/allocate",
  "/handshake",
];

const problems = [];

/* The static body, as a crawler and a reader with no JavaScript see it. */
const home = readFileSync("dist/public/index.html", "utf8");
for (const route of REQUIRED) {
  if (!home.includes(`href="https://maxdoubin.com${route}"`)) {
    problems.push(`the prerendered home page does not link to ${route}`);
  }
}

/*
  And the act, which is what a reader with JavaScript actually gets. Checked
  in source rather than in the built bundle because the bundle is minified and
  the routes would still be findable as strings either way; source is the
  thing a person edits and therefore the thing that goes stale.
*/
const act = readFileSync("client/src/pages/cinematic/acts/PractiseAct.tsx", "utf8");
for (const route of REQUIRED) {
  if (route === "/practise") continue; // the hub is a button, checked below
  if (!act.includes(`href: "${route}"`) && !act.includes(`href="${route}"`)) {
    problems.push(`the home page's practise act does not link to ${route}`);
  }
}
for (const button of ["/today", "/practise"]) {
  if (!act.includes(`href="${button}"`)) {
    problems.push(`the practise act is missing its ${button} button`);
  }
}

/*
  The act must be mounted. A component that links to everything and is not
  rendered is the same failure with an extra step.
*/
const page = readFileSync("client/src/pages/cinematic/CinematicHome.tsx", "utf8");
if (!page.includes("<PractiseAct />")) {
  problems.push("PractiseAct exists but is not rendered on the home page");
}

/* Counts on a home page go stale silently, so none of them may be literals. */
const literals = act.match(/count:\s*`?"?\d+\s/g);
if (literals) {
  problems.push(
    `the practise act has ${literals.length} hand-typed count${literals.length === 1 ? "" : "s"}; read them from the registry instead`,
  );
}

if (problems.length) {
  console.error(`\ncheck-home-links: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  the home page links to all ${REQUIRED.length} practise routes, in the prerendered body and in the act, with every count read from its registry.`,
);
