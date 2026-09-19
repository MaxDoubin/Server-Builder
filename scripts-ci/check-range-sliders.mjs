/**
 * A range input's hit area is the element box, not the thumb.
 *
 * WHY THIS EXISTS. Every slider on this site styled the input itself as the
 * track. `h-1.5 w-full appearance-none rounded-full bg-…` draws the thin
 * line you see, and it also makes the thin line the whole of what a finger
 * has to land on. Measured in a headless browser at 390px: /mtu's packet
 * size was 292x6, /transfer's four were 292x6 each, /teardown's was 132x4
 * and the Caesar shift was 292x8. Four pixels at the worst, against the
 * twenty-four that the target size guidance asks for, and no amount of
 * care with your thumb helps.
 *
 * It is invisible in review because it looks right. The bug is the absence
 * of height, and nothing in a screenshot shows you an absence.
 *
 * So the track moved to ::-webkit-slider-runnable-track and
 * ::-moz-range-track, the input became a transparent 24px box over it, and
 * this checks that it stays that way: every range input carries the class,
 * the class is still at least 24px tall, and the two vendor track selectors
 * are still written as separate rules.
 *
 * That last one is not pedantry. A browser drops an entire selector list
 * when it does not recognise one selector in it, so writing the WebKit and
 * Gecko pseudo-elements in one comma separated rule styles the slider in
 * neither engine rather than in both, and the result looks like the plain
 * unstyled control in every browser at once.
 */
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const CSS = "client/src/index.css";
const CLASS = "range-slider";
const FLOOR = 24;

const problems = [];

/* ------------------------------------------------------- every input */

const files = execFileSync("git", ["ls-files", "client/src"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".tsx"));

let sliders = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  let at = source.indexOf('type="range"');
  while (at !== -1) {
    sliders += 1;
    const open = source.lastIndexOf("<input", at);
    /* Walk to the tag's end, ignoring the > inside arrow functions in props. */
    let end = at, depth = 0;
    while (end < source.length) {
      const ch = source[end];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) break;
      end += 1;
    }
    const tag = source.slice(open, end + 1);
    const line = source.slice(0, at).split("\n").length;
    if (!new RegExp(`className=[^\\n]*\\b${CLASS}\\b`).test(tag)) {
      problems.push(
        `${file}:${line} is a range input without the ${CLASS} class, so its hit area is however tall its track is drawn.`,
      );
    }
    /* A height utility on the element fights the class and wins. */
    const height = tag.match(/className="[^"]*?\b(h-[\w.[\]]+)/);
    if (height) {
      problems.push(
        `${file}:${line} sets ${height[1]} on a range input. The track's height belongs on the pseudo-element; this one sets the hit area.`,
      );
    }
    at = source.indexOf('type="range"', at + 1);
  }
}

if (sliders === 0) {
  problems.push("no range inputs were found at all, which means this check is looking in the wrong place");
}

/* ------------------------------------------------------------ the class */

const css = readFileSync(CSS, "utf8");

const rule = css.match(new RegExp(`\\.${CLASS}\\s*\\{([^}]*)\\}`));
if (!rule) {
  problems.push(`${CSS} has no .${CLASS} rule, and every slider on the site names it`);
} else {
  const height = rule[1].match(/height:\s*(\d+(?:\.\d+)?)px/);
  if (!height) {
    problems.push(`.${CLASS} sets no height, so the hit area is back to whatever the track is`);
  } else if (Number(height[1]) < FLOOR) {
    problems.push(
      `.${CLASS} is ${height[1]}px tall, under the ${FLOOR}px floor. That number is the whole point of the rule.`,
    );
  }
}

for (const selector of ["::-webkit-slider-runnable-track", "::-moz-range-track", "::-webkit-slider-thumb", "::-moz-range-thumb"]) {
  if (!css.includes(`.${CLASS}${selector}`)) {
    problems.push(`${CSS} has no .${CLASS}${selector} rule, so one engine draws the default control`);
  }
}

/*
  And the two engines' selectors stay in rules of their own. A selector list
  holding both is dropped whole by both browsers.
*/
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
for (const match of cssWithoutComments.matchAll(/([^{}]+)\{/g)) {
  const selector = match[1];
  if (/-webkit-slider/.test(selector) && /-moz-range/.test(selector)) {
    problems.push(
      `${CSS} puts a WebKit and a Gecko pseudo-element in one selector list: "${selector.trim().slice(0, 80)}". ` +
        `Each browser drops the whole list, so this styles the slider in neither. Write them as two rules.`,
    );
  }
}

if (problems.length) {
  console.error(`\ncheck-range-sliders: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  all ${sliders} range sliders carry .${CLASS}, which is at least ${FLOOR}px of hit area over a track drawn by both engines' pseudo-elements.`,
);
