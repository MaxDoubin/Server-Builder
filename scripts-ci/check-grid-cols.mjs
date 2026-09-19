/**
 * A grid whose only grid-cols is behind a breakpoint overflows below it.
 *
 * WHY THIS EXISTS. /patch pushed a block 110px off the right edge of a
 * 390px screen and /triage pushed its inbox 19px off. Both were clipped
 * rather than scrollable, because the page shell is overflow-hidden, so the
 * content was simply not there. Neither had anything wrong with the card,
 * the text or the padding.
 *
 * The cause is a Tailwind habit. `grid gap-4 md:grid-cols-2` reads as "one
 * column, then two from md", and it is not: below md there is no
 * grid-template-columns at all, so the items land in an implicit track
 * sized `auto`. An `auto` track stretches to fill spare space, which is why
 * it usually looks right, but its floor is the content's min-content width.
 * Give it a child that cannot wrap, a `truncate` label or a long path, and
 * the track grows past its container instead of the child shrinking inside
 * it. On /patch the container was 342px and the track came out 475.6px.
 *
 * Tailwind's own `grid-cols-1` is `repeat(1, minmax(0, 1fr))`. The
 * `minmax(0, ...)` is exactly the floor that is missing: with it the track
 * is the container's width and the child truncates, wraps or scrolls inside
 * it. So the rule is that a grid which names columns at a breakpoint must
 * also name them at the base width, and 134 places on this site did not.
 *
 * This is a cheap static check for something that only shows up in a
 * browser at one specific width with one specific string of content, which
 * is the worst kind of bug to find by looking.
 */
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const files = execFileSync("git", ["ls-files", "client/src"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

/* className="…", className={`…`} and className={"…"}. */
const ATTR = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/gs;
const BREAKPOINT = /\b(?:sm|md|lg|xl|2xl):grid-cols-/;
const BASE = /(?<![:\w-])grid-cols-/;
const IS_GRID = /(?<![\w-])grid(?![\w-])/;

const problems = [];
let grids = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(ATTR)) {
    const classes = match[1] ?? match[2] ?? match[3];
    const flat = classes.split(/\s+/).filter(Boolean).join(" ");
    if (!IS_GRID.test(flat) || !BREAKPOINT.test(flat)) continue;
    grids += 1;
    if (BASE.test(flat)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    problems.push(
      `${file}:${line} is a grid with columns only from a breakpoint: "${flat.slice(0, 96)}". ` +
        `Below that width its track is auto sized, so a child that cannot shrink widens it past ` +
        `the container. Add grid-cols-1.`,
    );
  }
}

if (problems.length) {
  console.error(`\ncheck-grid-cols: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`OK  all ${grids} responsive grids name their columns at the base width as well as at a breakpoint.`);
