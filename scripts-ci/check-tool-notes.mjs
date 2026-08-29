/**
 * Every tool in the registry must have explanatory notes, and every set of
 * notes must belong to a tool.
 *
 * The notes are the only prose on a tool page. Without them the page is a
 * heading, a one-line blurb and a box of inputs: about 200 characters, which
 * clears the check-prerender-depth floor while being exactly the empty page
 * that floor exists to catch. So a tool page needs its own gate rather than
 * relying on the length one.
 *
 * The reverse direction matters too. Notes keyed to a slug no longer in the
 * registry render nowhere, which means prose that someone wrote and nobody
 * can read.
 *
 * Source-only, so it runs before the build.
 */
import { readFileSync } from "fs";

const registry = readFileSync("client/src/lib/toolsRegistry.ts", "utf8");
const notes = readFileSync("client/src/lib/toolNotes.ts", "utf8");

/** `slug: "subnet-calculator",` inside a ToolEntry. */
const registrySlugs = [...registry.matchAll(/^\s*slug:\s*"([^"]+)",/gm)].map((m) => m[1]);

/** Top-level keys of TOOL_NOTES, which are quoted slugs at two spaces of indent. */
const notesBody = notes.slice(notes.indexOf("export const TOOL_NOTES"));
const noteSlugs = [...notesBody.matchAll(/^ {2}"([^"]+)":\s*\[/gm)].map((m) => m[1]);

if (registrySlugs.length === 0 || noteSlugs.length === 0) {
  console.error(
    "check-tool-notes: parsed 0 slugs from one of the two files, so this gate " +
      "is not actually checking anything. Fix the parse before trusting it.",
  );
  process.exit(1);
}

const noteSet = new Set(noteSlugs);
const registrySet = new Set(registrySlugs);

const missing = registrySlugs.filter((s) => !noteSet.has(s));
const orphaned = noteSlugs.filter((s) => !registrySet.has(s));

if (missing.length || orphaned.length) {
  if (missing.length) {
    console.error(`${missing.length} tool(s) have no notes in toolNotes.ts:\n`);
    for (const s of missing) {
      console.error(`  ${s}\n      Its page would ship a heading and a blurb, nothing else.`);
    }
  }
  if (orphaned.length) {
    console.error(`\n${orphaned.length} note entr(ies) match no tool in the registry:\n`);
    for (const s of orphaned) console.error(`  ${s}      Written, and rendered nowhere.`);
  }
  process.exit(1);
}

console.log(
  `check-tool-notes: ${registrySlugs.length} tools, all with notes, no orphans`,
);
