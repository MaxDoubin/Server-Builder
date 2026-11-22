/**
 * The boot cascade on the home page rack must be dark where it claims dark.
 *
 * WHY THIS EXISTS. The first version of the cascade shipped to review with
 * three faults that a screenshot at hero size does not show, because each is
 * a few pixels of LED on a rack a few hundred pixels tall:
 *
 *   - the five-LED row on every server control panel was never given the
 *     `boot` prop, so it stayed lit through the phases labeled dark. It was
 *     the one LED element written across several lines, and the conversion
 *     had matched single-line elements only;
 *   - the mote shader called smoothstep with its edges reversed, which is
 *     undefined in GLSL ES and merely happened to work on the software
 *     renderer used for the screenshots;
 *   - the power LED kept its idle shimmer during the phases whose whole
 *     meaning is "solid" and "one flash per second".
 *
 * The first two are properties of the source text and the third of the pure
 * curves, so all three can be held here without a browser.
 *
 * Usage: npx tsx scripts-ci/check-boot-cascade.ts
 */

import { readFileSync } from "node:fs";
import {
  BOOT_DURATION,
  BOOT_T,
  activityLevel,
  bootState,
  driveLevel,
  glowLevel,
  powerOverride,
  stripLevel,
} from "../client/src/components/cinematic/rack3d/bootCascade";

const DIR = "client/src/components/cinematic/rack3d";
const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

/* 1. Every LED element on a booting chassis joins the cascade. */

const chassis = readFileSync(`${DIR}/parts/ServerChassis.tsx`, "utf8");
const upsStart = chassis.indexOf('case "ups-2u":');
const upsEnd = chassis.indexOf('case "kvm-1u":');
if (upsStart < 0 || upsEnd < upsStart) {
  fail("ServerChassis.tsx: could not find the ups-2u case, so the exemption below is not being applied to anything");
}

// Whole opening tags, however many lines they span. The whitespace after
// the name keeps a bare `<Led>` mentioned in a comment from counting.
const LED_TAG = /<(Led|LedStrip|LedField)\s[^>]*?>/g;
let ledCount = 0;
for (const m of chassis.matchAll(LED_TAG)) {
  const at = m.index ?? 0;
  // The UPS is what the rack powers on from; it is deliberately always on.
  if (at > upsStart && at < upsEnd) continue;
  ledCount++;
  if (!/\sboot(=|\s|\/|>)/.test(m[0])) {
    const line = chassis.slice(0, at).split("\n").length;
    fail(`ServerChassis.tsx:${line}: <${m[1]}> has no boot prop, so it stays lit while its unit is dark`);
  }
}
if (ledCount < 20) {
  fail(`ServerChassis.tsx: only ${ledCount} LED elements found; the tag pattern has stopped matching`);
}

/* 2. No smoothstep with descending literal edges in the shaders. */

const driver = readFileSync(`${DIR}/BootCascade.tsx`, "utf8");
let stepCount = 0;
for (const m of driver.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
  stepCount++;
  if (Number(m[1]) >= Number(m[2])) {
    const line = driver.slice(0, m.index ?? 0).split("\n").length;
    fail(`BootCascade.tsx:${line}: ${m[0]} has edge0 >= edge1, which is undefined in GLSL ES`);
  }
}
if (stepCount === 0) fail("BootCascade.tsx: no smoothstep calls found; the pattern has stopped matching");

/* 3. The curves: dark before power, legend-owned power LED, steady after. */

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

bootState.active = true;
bootState.settle = 0;
bootState.t = 1; // weight() is 1 for any t >= 0; local times are passed directly.

for (const lt of [-2, 0, BOOT_T.POWER - 0.01]) {
  if (!near(glowLevel(lt), 0)) fail(`glowLevel(${lt}) is ${glowLevel(lt)}, expected dark before power-on`);
  for (const u of [0, 0.5, 1]) {
    if (!near(stripLevel(lt, u), 0)) fail(`stripLevel(${lt}, ${u}) is ${stripLevel(lt, u)}, expected dark before POST`);
  }
  for (const seed of [0, 1, 7, 42]) {
    if (!near(driveLevel(lt, seed), 0)) fail(`driveLevel(${lt}, ${seed}) is lit before the drives spin up`);
    if (!near(activityLevel(lt, seed), 0)) fail(`activityLevel(${lt}, ${seed}) is lit before the drives spin up`);
  }
}

// Standby and the power-on flash belong to the legend alone: no idle shimmer.
for (const lt of [0.5, BOOT_T.POWER + 0.5, BOOT_T.POST + 1, BOOT_T.OS]) {
  if (!near(powerOverride(lt), 1)) fail(`powerOverride(${lt}) is ${powerOverride(lt)}; the power LED would shimmer during its legend phases`);
}
if (!near(powerOverride(BOOT_T.END), 0)) fail("powerOverride does not hand the power LED back by the end of the sequence");

// Everything is at its steady value once a unit is through, and at once
// everywhere when the visitor has scrolled on (settle = 1).
const checkSteady = (label: string, lt: number) => {
  const values: Array<[string, number]> = [
    ["glowLevel", glowLevel(lt)],
    ["stripLevel", stripLevel(lt, 0.5)],
    ["driveLevel", driveLevel(lt, 3)],
    ["activityLevel", activityLevel(lt, 3)],
  ];
  for (const [name, v] of values) {
    if (!near(v, 1)) fail(`${name} is ${v} ${label}, expected the steady value 1`);
  }
};
checkSteady("at the end of the sequence", BOOT_T.END);
bootState.settle = 1;
checkSteady("mid-boot with settle = 1", BOOT_T.POWER);
if (!near(powerOverride(0.5), 0)) fail("powerOverride ignores settle");

if (!(BOOT_DURATION > BOOT_T.END)) fail("BOOT_DURATION does not cover the stagger");

if (failures.length) {
  console.error(`FAIL  boot cascade: ${failures.length} problem(s)\n`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`OK  boot cascade: ${ledCount} LED elements gated, ${stepCount} shader smoothstep calls ordered, curves dark before power and steady after.`);
