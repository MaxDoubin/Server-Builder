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

/**
 * The shadcn palette, which the brand block above does not cover.
 *
 * That gap shipped. --primary is both the fill under a button's label and the
 * colour of a link on the page, and in the dark theme it was 4.11:1 under the
 * label and 4.29:1 as text: every primary button and every primary link on
 * the site sat just under AA in the theme the site opens in. Nothing here
 * noticed, because this gate only ever looked at the brand tokens.
 *
 * These values live in per-theme blocks rather than once at the top, so they
 * have to be read from inside the block that defines them. `token` above
 * takes the first match in the file, which for --primary is the light one.
 */
function blockToken(selector, name) {
  const marker = `${selector} {`;
  let from = 0;
  for (;;) {
    const start = CSS.indexOf(marker, from);
    if (start === -1) break;
    const end = CSS.indexOf("\n}", start);
    const block = CSS.slice(start, end === -1 ? undefined : end);
    const m = block.match(
      new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`),
    );
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    from = start + marker.length;
  }
  console.error(`check-contrast: no --${name} inside \`${selector}\``);
  process.exit(1);
}

/**
 * Each entry is a pairing that actually renders, named by the thing a reader
 * would point at if it were unreadable.
 */
const THEMED = [
  // Light theme. --primary serves as both fill and text here and clears the
  // floor doing both, which is why there is no --primary-text in :root.
  [":root", "primary-foreground", "primary", "the label on a primary button, light theme"],
  [":root", "primary", "background", "a primary-coloured link on the page, light theme"],
  [":root", "primary", "card", "a primary-coloured link inside a card, light theme"],
  [":root", "console-accent", "card", "the simulator header's brand line, light theme"],

  // Dark theme. The two jobs need two values; see the note beside
  // --primary-text in index.css.
  [".dark", "primary-foreground", "primary", "the label on a primary button, dark theme"],
  [".dark", "primary-text", "background", "a primary-coloured link on the page, dark theme"],
  [".dark", "primary-text", "card", "a primary-coloured link inside a card, dark theme"],
  [".dark", "console-accent", "card", "the simulator header's brand line, dark theme"],

  /*
    The cinematic surface in the light theme.

    Its own palette, because .cinematic redefines every brand token and the
    dark values are unusable on a light ground: --brand-signal is a lime that
    measures about 1.5:1 on white. The accent is one value doing two jobs
    here, the fill under a button label and a link on the page, which is only
    possible because on a light ground both want dark. In the dark theme they
    want opposite directions, which is what --primary-text exists for.

    Only the light block is listed. The dark values are the ones on :root,
    already covered by the brand pairings above.
  */
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-bone", "brand-obsidian", "body text on a cinematic page, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-bone-dim", "brand-obsidian", "secondary text on a cinematic page, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-ash", "brand-obsidian", "timestamps and tag rows, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-bone", "brand-graphite", "text inside a card, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-ash", "brand-graphite", "muted text inside a card, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-ash", "brand-carbon", "muted text on a muted surface, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-signal", "brand-obsidian", "a link or accent, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-signal", "brand-graphite", "a link inside a card, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-signal-soft", "brand-graphite", "inline code, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-obsidian", "brand-signal", "the label on a signal button, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-danger", "brand-obsidian", "an error, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-amber", "brand-obsidian", "a warning, light theme"],
  [".light .cinematic:not(.cinematic-pin-dark)", "brand-cyan", "brand-obsidian", "a secondary accent, light theme"],
];

for (const [selector, fg, bg, role] of THEMED) {
  const fgv = blockToken(selector, fg);
  const bgv = blockToken(selector, bg);
  const ratio = contrast(fgv, bgv);
  if (ratio >= FLOOR) continue;

  // Search both directions: a foreground can be too light or too dark for its
  // surface, and for a button fill it is the surface that has to move.
  let up = fgv[2], down = fgv[2];
  while (up < 100 && contrast([fgv[0], fgv[1], up], bgv) < FLOOR) up += 0.5;
  while (down > 0 && contrast([fgv[0], fgv[1], down], bgv) < FLOOR) down -= 0.5;
  const hints = [];
  if (up <= 100) hints.push(`${up}%`);
  if (down >= 0) hints.push(`${down}%`);

  failures.push(
    `--${fg} on --${bg} in \`${selector}\`: ${ratio.toFixed(2)}:1, needs ${FLOOR}:1\n` +
      `    ${role}\n` +
      `    --${fg} is ${fgv[0]} ${fgv[1]}% ${fgv[2]}%; it would pass at ${hints.join(" or ")} lightness,\n` +
      `    or move --${bg} the other way. If no single value works for both jobs\n` +
      `    a token has to split, the way --primary-text did.`,
  );
}

if (failures.length) {
  console.error("Colours below the WCAG AA contrast floor:\n");
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(
  `check-contrast: ${FOREGROUNDS.length} brand foregrounds x ${SURFACES.length} surfaces, ` +
    `plus ${THEMED.length} themed pairings, all at or above ${FLOOR}:1`,
);
