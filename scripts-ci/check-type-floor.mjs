/**
 * The smallest type on the site has a floor, and it is not decorative.
 *
 * WHY THIS EXISTS. A headless sweep of all 80 prerendered routes at 390px
 * found text rendering at 8px, 9px and 9.5px: the tag chips on /archive,
 * the difficulty badges on /capture, the column heads on /logs, the bit
 * labels under the MAC decomposition on the lookup tool, the spec captions
 * on the home page. 105 sites in 63 files.
 *
 * All of them were the same shape, and it is the worst shape to set small:
 *
 *     font-mono-tight text-[0.5625rem] uppercase tracking-[0.22em]
 *
 * Uppercase removes the ascenders and descenders a reader uses to tell
 * letters apart, so the whole word is one band of the x-height. Tracking
 * then pulls the letters away from each other, so the word stops being a
 * shape and becomes a row of marks. At 9px there is not enough of either
 * left. The type is doing three things at once that each cost legibility,
 * and the size is the one with no upside.
 *
 * The site already had an answer. 0.625rem was on 693 elements, the
 * smallest size in ordinary use and the one every label reads as. The 105
 * were not a decision, they were drift: a size picked one component at a
 * time, each a little under the last. They are all at 0.625rem now, and
 * this refuses anything below it.
 *
 * THE OTHER HALF. check-text-scaling bans `text-[10px]`, because a size in
 * px ignores the reader's text size preference. It reads Tailwind classes,
 * so it never saw this:
 *
 *     style={{ fontSize: "8px", letterSpacing: "0.2em" }}
 *
 * Four of those, on the rack scene's callout labels and the traceroute hops
 * on the 404 page. An inline style sets the same property with the same
 * defect and none of the gate's attention, which is the failure mode of a
 * check written against a syntax rather than against an effect. So this one
 * reads both, and reads the stylesheet too.
 *
 * WHAT IS EXEMPT, AND WHAT STOPPED BEING. A label inside <Html
 * distanceFactor> may still be written in px, because drei ties its apparent
 * size to the camera and moving it with the rem basis truncates it rather
 * than making it readable. That is check-text-scaling's concern and the
 * exemption belongs to it.
 *
 * The FLOOR used to be exempt there too, and that was wrong. drei scales such
 * a label by distanceFactor over the distance to the camera, which is a
 * number this gate cannot know and which goes both ways. Measured on the
 * facility HUD over the 3D floor, it came to 0.417: the authored 10px labels
 * reached the screen at 4.2px, and this gate called the page clean because
 * the exemption said the camera would decide. It did decide, downwards.
 *
 * So the floor now applies to the authored value everywhere, which is the
 * only value a static check has. A camera that shrinks the label makes it
 * worse than the floor, and a camera that grows it loses nothing by starting
 * at 0.625rem. scripts-ci/lib/camera-scaled still decides the unit exemption
 * for this gate and check-text-scaling together, because two gates
 * disagreeing about one exemption means the size inside it is checked by
 * neither.
 */
import { readFileSync } from "fs";
import { sourceFiles } from "./lib/source-files.mjs";
import { cameraScaledRanges, isCameraScaled } from "./lib/camera-scaled.mjs";

const FLOOR_REM = 0.625;
const ROOT_PX = 16;
const EXEMPT_CAP = 3;
const CSS = "client/src/index.css";

const problems = [];

/*
  Every length inside an arbitrary value, not just a bare one. A size can
  arrive through clamp(), min() or calc(), and the smallest term in those is
  what a narrow phone actually gets. em is skipped: it is relative to a
  parent this check cannot see.
*/
const lengthsIn = (value) =>
  [...value.matchAll(/(-?\d*\.?\d+)(rem|px)(?![\w-])/g)].map(([, n, unit]) => ({
    rem: unit === "rem" ? Number(n) : Number(n) / ROOT_PX,
    text: `${n}${unit}`,
  }));

const files = sourceFiles(["client/src"])
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

let sizes = 0;
let atFloor = 0;
let exemptScaled = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const scaled = cameraScaledRanges(source);
  const lineAt = (index) => source.slice(0, index).split("\n").length;

  /* ------------------------------------------------ Tailwind text-[...] */

  for (const match of source.matchAll(/text-\[([^\]]+)\]/g)) {
    for (const length of lengthsIn(match[1])) {
      sizes += 1;
      if (length.rem === FLOOR_REM) atFloor += 1;
      if (length.rem >= FLOOR_REM) continue;
      problems.push(
        `${file}:${lineAt(match.index)} sets ${match[0]}, which is ${(length.rem * ROOT_PX).toFixed(2)}px ` +
          `at the default scale, under the ${FLOOR_REM}rem floor. Label type is already uppercase and tracked; ` +
          `below the floor there is nothing left to read.`,
      );
    }
  }

  /* --------------------------------------------- inline style fontSize */

  for (const match of source.matchAll(/fontSize:\s*("[^"]*"|'[^']*'|[\d.]+)/g)) {
    const raw = match[1].replace(/^["']|["']$/g, "");
    const line = lineAt(match.index);
    const scaledHere = isCameraScaled(scaled, match.index);
    if (/^[\d.]+$/.test(raw)) {
      if (scaledHere) { exemptScaled += 1; continue; }
      problems.push(
        `${file}:${line} sets fontSize: ${raw} as a bare number, which React writes out as ${raw}px. ` +
          `Write it in rem so the reader's text size preference moves it.`,
      );
      continue;
    }
    const lengths = lengthsIn(raw);
    if (!lengths.length) continue;
    for (const length of lengths) {
      sizes += 1;
      if (length.rem === FLOOR_REM) atFloor += 1;
      /* The unit is exempt inside a camera scaled <Html>. The floor is not. */
      if (/px/.test(length.text)) {
        if (scaledHere) exemptScaled += 1;
        else
          problems.push(
            `${file}:${line} sets fontSize: ${raw} in px. An inline style has the same defect as text-[${length.text}] ` +
              `and check-text-scaling cannot see it, because that gate reads class names.`,
          );
      }
      if (length.rem < FLOOR_REM) {
        problems.push(
          `${file}:${line} sets fontSize: ${raw}, under the ${FLOOR_REM}rem floor.`,
        );
      }
    }
  }
}

/* ---------------------------------------------------------- stylesheet */

const css = readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
for (const match of css.matchAll(/font-size:\s*([^;}]+)/g)) {
  for (const length of lengthsIn(match[1])) {
    sizes += 1;
    if (length.rem === FLOOR_REM) atFloor += 1;
    if (length.rem >= FLOOR_REM) continue;
    const line = css.slice(0, match.index).split("\n").length;
    problems.push(
      `${CSS}:${line} sets font-size: ${match[1].trim()}, under the ${FLOOR_REM}rem floor.`,
    );
  }
}

/*
  And the check is not passing because it found nothing to look at. The
  floor is the site's most common small size by a wide margin; if that stops
  being true the parser above has stopped matching what it is aimed at.
*/
if (sizes < 1000) {
  problems.push(`only ${sizes} explicit type sizes were found, which means this check is looking in the wrong place`);
}
if (atFloor < 500) {
  problems.push(`only ${atFloor} sites sit at the ${FLOOR_REM}rem floor, where the site's own smallest label size is used hundreds of times`);
}
if (exemptScaled > EXEMPT_CAP) {
  problems.push(
    `${exemptScaled} type sizes sit inside a camera scaled <Html>, over the cap of ${EXEMPT_CAP}. ` +
      `distanceFactor exempts a label because the zoom already controls its apparent size, which is not a reason to set new type small.`,
  );
}

if (problems.length) {
  console.error(`\ncheck-type-floor: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  all ${sizes} explicit type sizes are at or above the ${FLOOR_REM}rem floor (${atFloor} sit exactly on it), ` +
    `in class names, inline styles and the stylesheet alike. The floor applies inside a camera scaled <Html> too; ` +
    `${exemptScaled} px units are exempt there, which is a unit and not a size.`,
);
