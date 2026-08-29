/**
 * Keep the brand palette above the WCAG AA contrast floor.
 *
 * --brand-ash is --muted-foreground: every timestamp, tag row, breadcrumb,
 * table-of-contents entry and form hint on the site. It shipped at 42%
 * lightness, which is 3.62:1 on the page background and 2.88:1 inside a card.
 * AA asks for 4.5:1 on body text, and none of that text is large enough to
 * qualify for the 3:1 large-text allowance: most of it is 10px or 11px.
 *
 * --brand-danger had the same problem in the other direction. At 58% it was
 * 4.03:1 on a carbon surface, so validation errors, the "wrong" state on quiz
 * answers and the traceroute failure text all sat under the floor. Those are
 * the strings a reader most needs to be able to read.
 *
 * This gate reads the tokens straight out of index.css and re-derives every
 * pairing rather than trusting a number written down once. A palette tweak
 * that pushes any of them back under the floor fails the build with the
 * lightness that would fix it.
 */
import { readFileSync } from "fs";

const CSS = readFileSync("client/src/index.css", "utf8");

/** `--brand-ash: 220 5% 56%;` -> [220, 5, 56] */
function token(name) {
  const m = CSS.match(
    new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`),
  );
  if (!m) {
    console.error(`check-contrast: no --${name} in client/src/index.css`);
    process.exit(1);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function hslToRgb([h, s, l]) {
  h /= 360;
  s /= 100;
  l /= 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

function luminance(hsl) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hslToRgb(hsl).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Surfaces text actually lands on. Iron is the border colour, not a fill, so
 * it is deliberately absent: requiring AA against it would force the whole
 * palette lighter for a pairing that never renders.
 */
const SURFACES = ["brand-obsidian", "brand-graphite", "brand-carbon"];

/**
 * AA is 4.5:1 for body text and 3:1 for text at 24px, or 18.7px bold. Nothing
 * in this palette is reserved for headings, so everything here is body text.
 */
const FLOOR = 4.5;

const FOREGROUNDS = [
  ["brand-bone", "primary text"],
  ["brand-bone-dim", "secondary text"],
  ["brand-ash", "muted-foreground: timestamps, tags, hints"],
  ["brand-signal", "links and active state"],
  ["brand-cyan", "code and inline literals"],
  ["brand-amber", "warnings"],
  ["brand-danger", "validation errors and failure states"],
];

const failures = [];

for (const [fg, role] of FOREGROUNDS) {
  const fgv = token(fg);
  for (const bg of SURFACES) {
    const ratio = contrast(fgv, token(bg));
    if (ratio >= FLOOR) continue;

    // Smallest lightness that clears the floor, so the error says what to do.
    let fix = fgv[2];
    while (fix < 100 && contrast([fgv[0], fgv[1], fix], token(bg)) < FLOOR) {
      fix += 0.5;
    }
    failures.push(
      `--${fg} on --${bg}: ${ratio.toFixed(2)}:1, needs ${FLOOR}:1\n` +
        `    ${role}\n` +
        `    ${fgv[0]} ${fgv[1]}% ${fgv[2]}% would pass at ${fix}% lightness.`,
    );
  }
}

if (failures.length) {
  console.error("Brand colours below the WCAG AA contrast floor:\n");
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(
  `check-contrast: ${FOREGROUNDS.length} foregrounds x ${SURFACES.length} surfaces, all at or above ${FLOOR}:1`,
);
