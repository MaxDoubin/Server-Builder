/**
 * A colour that paints a UI surface has to come from a token.
 *
 * The cinematic pages have two palettes now, dark and light, and both are
 * built by redefining thirteen --brand-* tokens. That only works for colours
 * that ask for a token. A literal written into a class is invisible to it,
 * and stays exactly as dark as it was while the text around it goes dark
 * with the light theme.
 *
 * That shipped, briefly. The rack cards on /racks carried
 * bg-[hsl(220_10%_6%)] rather than a token, so in the light theme they were
 * near-black cards holding near-black text: 115 of 174 text elements on that
 * page under the contrast floor, including a heading at 1.16:1. Nothing
 * caught it, because check-contrast reads the tokens and these colours were
 * not tokens.
 *
 * NOT every literal is wrong, which is the whole difficulty. The same file
 * fills its rack elevations with literal HSL and is right to: a rack chassis
 * is dark in a light room, the same reason the 3D scene and the preloader
 * hardcode their materials. The distinction this gate draws is between a
 * colour describing an object and a colour describing a surface, and it
 * draws it structurally:
 *
 *   - fill- and stroke- are SVG, so they are drawing a thing, and are allowed.
 *   - rack3d/, Preloader and LoaderScene are three-dimensional materials and
 *     a loading screen that only ever appears over its own dark ground.
 *   - everything else naming a background, a text colour or a border must use
 *     hsl(var(--token)), or be listed below with a reason.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const ROOTS = ["client/src/pages/cinematic", "client/src/components/cinematic"];

/** Directories and files whose colours describe an object, not a surface. */
const OBJECT_COLOURS = [
  "rack3d/",              // three.js materials: chassis, rails, cables
  "Preloader.tsx",        // the boot screen, which paints its own dark ground
  "LoaderScene.tsx",      // the same, for the route that still uses a scene
];

/**
 * Individually justified. Each is a colour that is deliberately the same in
 * both themes, and each was measured against its own background rather than
 * assumed: both clear the AA floor in light and dark.
 */
const ALLOWED = [
  // A "no preview" tile. A light chip with grey type on it, the same object
  // in both themes, the way a printed swatch would be.
  { file: "client/src/pages/cinematic/CinematicRackDetail.tsx", text: "bg-[#eef0f3]" },
  { file: "client/src/pages/cinematic/CinematicRackDetail.tsx", text: "text-[#5c6472]" },
  // A translucent red wash under the remove button. Danger reads as danger on
  // either ground, and the alpha is tuned to sit on both.
  { file: "client/src/pages/cinematic/CinematicRackBuilder.tsx", text: "bg-[hsl(0_60%_40%/0.35)]" },
];

const UTILITY = /(?:^|[\s"'`:])(?:hover:|focus:|focus-visible:|active:|group-hover:|dark:|md:|lg:|xl:|2xl:|sm:)*(bg|text|border|from|to|via|ring|outline|decoration|shadow)-\[(hsl\(\s*[\d.]|#[0-9a-fA-F]{3,8})[^\]]*\]/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const problems = [];
let scanned = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = path.relative(process.cwd(), file);
    if (OBJECT_COLOURS.some((frag) => rel.includes(frag))) continue;
    scanned += 1;
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(UTILITY)) {
        const hit = m[0].replace(/^[\s"'`:]+/, "");
        if (ALLOWED.some((a) => rel === a.file && hit.includes(a.text))) continue;
        problems.push(`${rel}:${i + 1}  ${hit}`);
      }
    });
  }
}

if (scanned < 20) {
  console.error(
    `check-themed-colours: only scanned ${scanned} files, which is fewer than\n` +
      `  this site has. The scan is probably not reaching the source.`,
  );
  process.exit(1);
}

if (problems.length) {
  console.error(
    `${problems.length} literal colour${problems.length === 1 ? "" : "s"} on a cinematic surface:\n`,
  );
  for (const p of problems) console.error(`    ${p}`);
  console.error(
    `\n  A literal does not follow the theme. In the light palette it stays as\n` +
      `  dark as it was while the text on it goes dark, which is how /racks\n` +
      `  ended up with a heading at 1.16:1. Use hsl(var(--brand-...)), or add it\n` +
      `  to ALLOWED in this file with the reason it is the same in both themes.`,
  );
  process.exit(1);
}

console.log(
  `check-themed-colours: ${scanned} cinematic files, every surface colour comes from a token.`,
);
