/**
 * Type written in px ignores the reader's text size preference.
 *
 * WHY THIS EXISTS. The preference works by moving the rem basis:
 *
 *     html { font-size: calc(100% * var(--font-scale)); }
 *
 * Every Tailwind size class is in rem, so text-sm and text-3xl follow it.
 * An arbitrary value in pixels, text-[10px], does not, and this site had
 * 1906 of them. Measured in a browser with the scale at 1.4: on /blog, 166
 * of 255 text nodes did not move at all, and on /maxstartups 51 of 92.
 * Two thirds of a page of prose, and the setting that was supposed to make
 * it readable changed the other third.
 *
 * It is invisible in review for the same reason the slider height was. The
 * page looks right, the preference appears to work because something does
 * grow, and the part that stayed behind is the part in the smallest type,
 * which is exactly the part a reader turned the setting on for.
 *
 * So the arbitrary values are in rem now, computed as N/16, which lands on
 * the same pixel at the default scale: text-[0.625rem] is 10px on a 16px
 * root, and 14px at a scale of 1.4. This checks that nobody writes another
 * one in px, and that the mechanism the rem values depend on is still there.
 *
 * WHAT IS EXEMPT, AND WHY. client/src/components/3d. Those labels sit in
 * absolutely positioned boxes the size of a rack unit, with truncate, over
 * geometry whose apparent size is set by the camera. Growing the text there
 * does not make it readable, it makes it truncate sooner, and the control a
 * reader actually has over that scene is the zoom. The exemption is counted
 * rather than open, so it cannot quietly become where new px type goes.
 */
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const EXEMPT_DIR = "client/src/components/3d/";
const EXEMPT_CAP = 105;
const CSS = "client/src/index.css";

const problems = [];

const files = execFileSync("git", ["ls-files", "client/src"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

const PX = /text-\[\d+(?:\.\d+)?px\]/g;

let exempt = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(PX)) {
    if (file.startsWith(EXEMPT_DIR)) {
      exempt += 1;
      continue;
    }
    const line = source.slice(0, match.index).split("\n").length;
    problems.push(
      `${file}:${line} sets ${match[0]}, which does not move when a reader raises the text size. ` +
        `Write it in rem: ${match[0].replace(/(\d+(?:\.\d+)?)px/, (_, n) => `${Number(n) / 16}rem`)}.`,
    );
  }
}

if (exempt > EXEMPT_CAP) {
  problems.push(
    `${EXEMPT_DIR} holds ${exempt} pixel type sizes, over the cap of ${EXEMPT_CAP}. ` +
      `That directory is exempt because its labels are fixed boxes over 3D geometry, not because px is fine there.`,
  );
}

/*
  And the mechanism itself. Every rem above is worth nothing if the scale
  stops being applied to the rem basis, and that is one line in one file.
*/
const css = readFileSync(CSS, "utf8");
if (!/html\s*\{[^}]*font-size:\s*calc\(100%\s*\*\s*var\(--font-scale\)\)/s.test(css)) {
  problems.push(
    `${CSS} no longer sets the html font size from --font-scale, so every rem on the site is fixed again ` +
      `and the text size preference does nothing.`,
  );
}

if (problems.length) {
  console.error(`\ncheck-text-scaling: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 40)) console.error(`  ${problem}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  every arbitrary type size outside the 3D labels is in rem and follows the reader's text size preference ` +
    `(${exempt} exempt in ${EXEMPT_DIR}, capped at ${EXEMPT_CAP}).`,
);
