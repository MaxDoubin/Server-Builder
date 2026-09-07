/**
 * A build restored from a link obeys the same rules as one built by hand.
 *
 * The rack builder's whole premise, stated at the top of rackBuilder.ts, is
 * that a rack is a list of occupied units rather than a list of devices, so
 * placement asks "are these N units all free" and refuses when they are not.
 * `add` asked it. `nudge` asked it. `decodeBuild` did not: it checked that
 * the slug was real and that `at` was inside the frame, and stopped there.
 *
 * Neither omission needs a hostile reader to find. `?b=` is in the address
 * bar, in plain text, deliberately, because the point of a readable link is
 * that somebody can edit it. Two ways it went wrong:
 *
 *   12:enas@5,cloud-key-enterprise@5    a 3U and a 1U in the same unit
 *   12:enas@10                          a 3U needing 10, 11 and 12 of a 12U
 *
 * Positions in a link count from the TOP of the frame, the way `at` does
 * everywhere in rackBuilder.ts, which is the opposite of the U numbers the
 * page prints beside each row. The messages below say "position" for that
 * reason: reading one of them as a U label would send you to the wrong end
 * of the rack.
 *
 * Both drew, because the scene draws what it is given, and the elevation
 * beside it counted units it had already counted. The page then said in its
 * own prose that this could not happen.
 *
 * Checked by running the real decoder rather than by reading the source,
 * because the property is about what it returns, not what it looks like. The
 * generated cases matter as much as the two above: they are what stops the
 * next edit from re-opening the hole somewhere the named cases do not reach.
 *
 * Run by tsx, like script/addInternalLinks.ts, because the thing under test
 * is TypeScript that the site imports.
 */
import { readFileSync } from "fs";
import path from "path";
import {
  DEFAULT_FRAME,
  FRAME_SIZES,
  decodeBuild,
  encodeBuild,
  firstFreeSlot,
  occupancy,
  unitsOf,
  type CatalogueDevice,
  type FrameSize,
  type Placement,
} from "../client/src/lib/rackBuilder.ts";

/* The catalogues the page itself fetches. Real slugs and real heights, so a
   device that stops being 2U cannot quietly make this gate vacuous. */
const devices: CatalogueDevice[] = ["ubiquiti-catalogue", "own-catalogue"]
  .flatMap((name) => {
    const file = path.resolve(`client/public/data/${name}.json`);
    return JSON.parse(readFileSync(file, "utf8")).devices as CatalogueDevice[];
  })
  .filter((d) => d.mount === "rack");

const byslug = new Map(devices.map((d) => [d.slug, d] as const));
const slugs = devices.map((d) => d.slug);
const tall = devices.filter((d) => unitsOf(d) > 1);

if (devices.length < 20 || tall.length < 2) {
  console.error(
    `check-rack-decode: found ${devices.length} rack devices, ${tall.length} of them\n` +
      `  taller than 1U. That is too few to test overlap with, so the catalogue\n` +
      `  files have probably moved or changed shape.`,
  );
  process.exit(1);
}

const failures: string[] = [];

/**
 * What a decoded build must satisfy, checked without the library's help.
 *
 * occupancy() clamps its writes to the frame, which is right for drawing and
 * wrong here: it would silently absorb the overhang this gate exists to
 * catch. So the units are counted directly.
 */
function violation(frame: number, placements: Placement[]): string | null {
  const owner = new Map<number, string>();
  for (const p of placements) {
    const d = byslug.get(p.slug);
    if (!d) return `kept unknown slug ${p.slug}`;
    if (!Number.isInteger(p.at)) return `kept a non-integer position ${p.at} for ${p.slug}`;
    const height = unitsOf(d);
    if (p.at < 0 || p.at + height > frame) {
      return `${p.slug} is ${height}U at position ${p.at} of a ${frame}U frame, so it hangs outside it`;
    }
    for (let i = p.at; i < p.at + height; i += 1) {
      const held = owner.get(i);
      if (held) return `${p.slug} and ${held} both occupy position ${i}`;
      owner.set(i, p.slug);
    }
  }
  const ids = new Set(placements.map((p) => p.id));
  if (ids.size !== placements.length) return `placement ids are not unique`;
  return null;
}

/* Deterministic, so a failure here is reproducible from the seed alone. */
let seed = 20260906;
function rnd(n: number): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
}
const pick = <T,>(xs: T[]): T => xs[rnd(xs.length)];

// ---------------------------------------------------------------------------
// 1. The two payloads that shipped wrong, by name.
// ---------------------------------------------------------------------------
const overlapping = `${DEFAULT_FRAME}:${tall[0].slug}@5,${slugs.find((s) => s !== tall[0].slug)}@5`;
const overhanging = `${DEFAULT_FRAME}:${tall[0].slug}@${DEFAULT_FRAME - 1}`;

for (const [what, payload] of [
  ["two devices in one unit", overlapping],
  ["a multi-U device off the bottom of the frame", overhanging],
] as const) {
  const got = decodeBuild(payload, byslug);
  const bad = got && violation(got.frame, got.placements);
  if (bad) failures.push(`a link with ${what} decoded into a build where ${bad}\n    ${payload}`);
}

// ---------------------------------------------------------------------------
// 2. Every legal build survives the round trip unchanged.
//
// The half of this that a too-strict decoder would break. Builds are grown
// the way `add` grows them, so each one is reachable by clicking.
// ---------------------------------------------------------------------------
let roundTripped = 0;
for (let trial = 0; trial < 400; trial += 1) {
  const frame = pick([...FRAME_SIZES]) as FrameSize;
  const placements: Placement[] = [];
  for (let n = 0; n < 12; n += 1) {
    const d = pick(devices);
    const at = firstFreeSlot(occupancy(placements, frame, byslug), unitsOf(d));
    if (at === null) continue;
    placements.push({ id: placements.length + 1, slug: d.slug, at });
  }
  if (placements.length === 0) continue;

  const back = decodeBuild(encodeBuild(frame, placements), byslug);
  const before = [...placements].sort((a, b) => a.at - b.at).map((p) => `${p.slug}@${p.at}`);
  const after = (back?.placements ?? []).map((p) => `${p.slug}@${p.at}`);
  if (back?.frame !== frame || before.join(",") !== after.join(",")) {
    failures.push(
      `a legal build did not survive being shared and reopened.\n` +
        `    built:   ${frame}:${before.join(",")}\n` +
        `    reopened: ${back ? `${back.frame}:${after.join(",")}` : "null"}`,
    );
    break;
  }
  roundTripped += 1;
}

// ---------------------------------------------------------------------------
// 3. No payload at all produces a build that breaks the invariant.
//
// Deliberately weighted towards the shapes a hand-edited link takes: repeated
// positions, positions near the bottom edge, and the odd unknown slug.
// ---------------------------------------------------------------------------
let fuzzed = 0;
for (let trial = 0; trial < 4000; trial += 1) {
  const frame = pick([...FRAME_SIZES, 0, 7, -3, 999]);
  const parts: string[] = [];
  for (let n = 0, count = 1 + rnd(8); n < count; n += 1) {
    const slug = rnd(10) === 0 ? `not-a-device-${rnd(50)}` : pick(slugs);
    const at = pick([
      rnd(frame > 0 ? frame : 12),
      frame - 1,
      frame - 2,
      0,
      -1,
      -rnd(5),
      1.5,
      rnd(200),
      NaN,
    ]);
    parts.push(`${slug}@${at}`);
  }
  const payload = `${frame}:${parts.join(",")}`;
  const got = decodeBuild(payload, byslug);
  if (!got) continue;
  fuzzed += 1;
  const bad = violation(got.frame, got.placements);
  if (bad) {
    failures.push(`a hand-edited link decoded into a build where ${bad}\n    ${payload}`);
    break;
  }
}

// ---------------------------------------------------------------------------
// 4. Malformed input is refused rather than throwing or half-loading.
// ---------------------------------------------------------------------------
for (const payload of ["", ":", "abc", "12", "notanumber:udm-se@0", "13:udm-se@0", "@@@"]) {
  let got;
  try {
    got = decodeBuild(payload, byslug);
  } catch (e) {
    failures.push(`decoding ${JSON.stringify(payload)} threw ${(e as Error).message}`);
    continue;
  }
  const bad = got && violation(got.frame, got.placements);
  if (bad) failures.push(`decoding ${JSON.stringify(payload)} gave a build where ${bad}`);
}

if (failures.length) {
  console.error("A shared rack build does not obey the builder's own placement rule:\n");
  for (const f of failures) console.error(`  ${f}\n`);
  console.error(
    `  decodeBuild has to ask the same question add and nudge ask, which is\n` +
      `  whether the run of units a device needs is free, against occupancy it\n` +
      `  accumulates as it reads the link.`,
  );
  process.exit(1);
}

console.log(
  `check-rack-decode: ${roundTripped} legal builds reopened unchanged, and ` +
    `${fuzzed} hand-edited links\n  across ${devices.length} devices decoded ` +
    `to builds with nothing overlapping and nothing outside the frame.`,
);
