/**
 * A control that is only its own text is only as tall as its line box.
 *
 * WHY THIS EXISTS. Measured at 390px with a wheel, scrolled to the bottom:
 * /glossary had 160 targets under 24px. A hundred of them were one button,
 * the field chip beside every term, written as
 *
 *     <button className="font-techno text-[0.625rem] uppercase tracking-...">
 *
 * with no padding and no height, so its hit area was the 15px its own text
 * drew. Thirty six were the term headings at 21px and twenty four were
 * cross references that were the only thing in their paragraph, at 14px.
 * Elsewhere: the three mtu size buttons at 17px, the triage reset, and two
 * filter buttons in the capture workbench.
 *
 * The defect is an absence, which is why it survives review: nothing in a
 * screenshot shows you a height that was never set. It is also invisible to
 * a reading of the class list unless you know to look for what is missing.
 *
 * WHAT IS NOT A DEFECT. A link inside a sentence. The target size guidance
 * exempts it, because its height is the line height of the text around it
 * and making it taller would mean setting the paragraph's leading by the
 * links in it. An earlier version of the browser sweep compared each link
 * against its immediate parent, and the glossary wraps every cross
 * reference in its own <span> with a separator, so 199 links in running
 * prose were reported as bare controls. They are not, and nothing here
 * changes them.
 *
 * WHAT THIS CHECKS. Every <button> carries a height, some vertical padding,
 * or the tap-target class, and tap-target still pads enough to clear 24px
 * from the smallest line box wearing it.
 *
 * And two shapes of link, because two shapes can be judged from the source.
 * Both require the link to name its own type size, which a link in a
 * sentence does not do: it inherits the paragraph's. On top of that, either
 *
 *   it declares a block level display, so it lays itself out rather than
 *   flowing in a line of prose. /today's progress rows were 38 of these at
 *   20px, and there were three more.
 *
 *   or it is the only thing in a list item, which is navigation rather than
 *   prose whatever its display. The "Practice this" block under every
 *   article was two of these at 16px with 8px between them, close enough
 *   that a 24px circle on one reaches the next, and there were seven more.
 *
 * The discriminator matters. Six block level links on the site set no height
 * and no padding, and two of them are the card links on /blog and /racks,
 * which wrap an image and are tall by construction. Neither names a type
 * size on the anchor, so neither is flagged, and the rule needs no list of
 * files to ignore. A rule that did would be the same mistake as exempting a
 * folder because the labels in it happened to be the case you meant.
 *
 * Class names are resolved through same-file helpers. /gear builds its
 * chips with chip(active) and /ask its actions with actionClasses, and both
 * already set padding; a checker that reads only the literal calls them
 * bare and is then taught to ignore two real files.
 */
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const CSS = "client/src/index.css";
const CLASS = "tap-target";
const FLOOR_PX = 24;
const SMALLEST_LINE_BOX_PX = 14;
const ROOT_PX = 16;

const problems = [];

/* A utility that gives the box a height of its own, rather than its text's. */
const HEIGHTY = /\b(py-|p-[0-9[]|h-[0-9[]|min-h-|size-|aspect-|inset-0|absolute|fixed)/;

/* A link that lays itself out rather than flowing in a sentence. */
const BLOCKY = /\b(flex|grid|block|inline-flex|inline-grid|inline-block)\b/;

/*
  And names its own size. A link inside a paragraph inherits the paragraph's,
  so an anchor that sets one is captioning itself rather than being read as
  part of a sentence. Card links that wrap an image set no size at all, which
  is what keeps the two on /blog and /racks out of this without a list.

  Any size under a rem qualifies, not just the very small ones. At the normal
  line height 0.8125rem draws a 20px line box and even 0.875rem draws 21, so
  the cutoff is not where the type starts looking small, it is wherever one
  line stops clearing 24px. An earlier version stopped at 0.7x and therefore
  did not hold /today's rows, which were the reason this rule exists.
*/
const OWN_SMALL_TYPE = /text-\[0\.[0-9]+rem\]|\btext-(xs|sm|base)\b/;

const files = execFileSync("git", ["ls-files", "client/src"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".tsx"));

let buttons = 0;
let links = 0;
let wearing = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");

  /* Same-file class helpers, so chip(active) is read as what chip returns. */
  const helpers = new Map();
  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*(?:\([^)]*\)\s*=>\s*)?\s*(`[\s\S]*?`|"[^"]*")/g)) {
    if (/class|chip|pill|btn|action|tab|style/i.test(m[1])) helpers.set(m[1], m[2]);
  }

  for (const m of source.matchAll(/<(?:button|a|Link)\b/g)) {
    const isButton = /^<button/.test(source.slice(m.index, m.index + 8));
    /* Walk to the tag's end, ignoring a > inside a JSX expression. */
    let i = m.index, depth = 0, end = -1;
    while (i < source.length) {
      const ch = source[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) { end = i; break; }
      i += 1;
    }
    if (end === -1) continue;
    const tag = source.slice(m.index, end + 1);
    let classes = [...tag.matchAll(/className=(?:"([^"]*)"|\{`([\s\S]*?)`\}|\{([^}]*)\})/g)]
      .map((c) => c[1] || c[2] || c[3] || "")
      .join(" ");
    if (!classes.trim()) continue;
    for (const [name, body] of helpers) {
      if (new RegExp(`\\b${name}\\b`).test(classes)) classes += " " + body;
    }

    /*
      A link is judged only when it is unambiguously standalone: block level,
      and naming its own small type size rather than inheriting a paragraph's.
    */
    const aloneInAListItem = /<li\b[^>]*>\s*$/.test(source.slice(Math.max(0, m.index - 220), m.index));
    const standaloneLink =
      !isButton && OWN_SMALL_TYPE.test(classes) && (BLOCKY.test(classes) || aloneInAListItem);
    if (!isButton && !standaloneLink) continue;
    if (isButton) buttons += 1;
    else links += 1;

    if (classes.includes(CLASS)) { wearing += 1; continue; }
    if (HEIGHTY.test(classes)) continue;

    const line = source.slice(0, m.index).split("\n").length;
    problems.push(
      `${file}:${line} is a ${isButton ? "button" : "standalone link naming its own type size"} with no height ` +
        `and no vertical padding, so its hit area is exactly the line box of its own text. ` +
        `Give it padding, a height, or the ${CLASS} class.`,
    );
  }
}

if (buttons < 100) {
  problems.push(`only ${buttons} buttons were found, which means this check is looking in the wrong place`);
}
if (wearing === 0) {
  problems.push(`nothing wears ${CLASS}, so either the class was removed or this is no longer matching it`);
}

/* ------------------------------------------------------------- the class */

const css = readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = css.match(new RegExp(`\\.${CLASS}\\s*\\{([^}]*)\\}`));
if (!rule) {
  problems.push(`${CSS} has no .${CLASS} rule, and every control fixed by this check names it`);
} else {
  const pad = rule[1].match(/padding-block:\s*([\d.]+)(rem|px)/);
  if (!pad) {
    problems.push(`.${CLASS} sets no padding-block, so it adds nothing to the hit area`);
  } else {
    const px = pad[2] === "rem" ? Number(pad[1]) * ROOT_PX : Number(pad[1]);
    const reached = SMALLEST_LINE_BOX_PX + 2 * px;
    if (reached < FLOOR_PX) {
      problems.push(
        `.${CLASS} pads ${px}px a side, which takes the smallest line box wearing it ` +
          `(${SMALLEST_LINE_BOX_PX}px) to ${reached}px, under the ${FLOOR_PX}px floor.`,
      );
    }
  }
  /*
    And it stays padding. A min-height needs inline-flex, which takes the box
    out of the line's baseline and moves the running text these sit in.
  */
  if (/min-height|display:\s*(inline-)?flex/.test(rule[1])) {
    problems.push(
      `.${CLASS} sets a height or a flex display. Several of the controls wearing it sit in running text, ` +
        `where that shifts the line rather than only the hit area. Vertical padding is the point of this rule.`,
    );
  }
}

if (problems.length) {
  console.error(`\ncheck-tap-targets: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  all ${buttons} buttons and ${links} standalone links have a hit area of their own, ${wearing} of them ` +
    `through .${CLASS}, which pads a ${SMALLEST_LINE_BOX_PX}px line box past the ${FLOOR_PX}px floor.`,
);
