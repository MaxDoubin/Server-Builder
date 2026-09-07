/**
 * Every rack model must agree with the rack definition it illustrates.
 *
 * A rack page shows the same hardware three ways: the SVG elevation, the
 * procedural 3D view, and the authored GLB. The first two are generated
 * from the RackDefinition, so they cannot disagree with it. The GLB is
 * built by a Python generator that keeps its own copy of the layout, and
 * that copy has drifted twice already: three Cisco blanking panels and one
 * Juniper panel existed in the model and in no device list, so the
 * elevation showed a gap where the model showed a panel and clicking it
 * resolved to nothing; and a Cisco blank and firewall were swapped between
 * the two, which no set-membership check would ever notice.
 *
 * So this checks the shipped artifact rather than either source. Node group
 * names must match device ids exactly, in both directions. Then the vertical
 * position of every group is read out of the GLB and fitted against the
 * order and heights the definition declares: one rack unit of drift and this
 * fails, which is what a swap looks like.
 *
 * The fit derives the rack's origin from the model rather than assuming it,
 * because a 12U studio frame on casters and a 42U cabinet bolted to the
 * floor do not start their first unit in the same place.
 *
 * The device lists come from the published rack dataset rather than from a
 * regex over the source, and that is not a stylistic preference. Reading
 * the source found only devices written as object literals, so panels
 * produced by a rack's own local helper were invisible: this check called
 * four of them missing from the device list when they were there all
 * along, the fix added duplicates beside them, and every rack in it then
 * carried more units than its frame is tall without anything noticing.
 * The dataset is the array the site actually renders.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";

const MODELS = path.resolve("client/public/models");
const RACKS = path.resolve("client/src/lib/racks");
const HERO = path.join(RACKS, "heroModels");

/** One rack unit, in meters. The generators and the renderers share it. */
const U = 0.04445;

/** How far a device may sit from its slot before it counts as misplaced. */
const DRIFT_U = 0.45;

const problems = [];
const fail = (m) => problems.push(m);

/** Every hero model: its GLB, the rack module behind it, its scenery set. */
function heroModels() {
  const out = [];
  for (const file of readdirSync(HERO)) {
    if (!file.endsWith(".ts") || file === "types.ts" || file === "index.ts") continue;
    const src = readFileSync(path.join(HERO, file), "utf8");
    const scenery = new Set(
      [...(src.match(/SCENERY = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    );
    /*
      Most part tables are a filter over a rack definition, so the devices
      and their order come from there. The UniFi table is written out by
      hand because that model was authored rather than generated and its
      parts do not map one to one onto the 12U rack's device list, so it
      gets the name check and not the position fit.
    */
    const mod = src.match(/from "@\/lib\/racks\/(\w+)"/);
    const inline = [...src.matchAll(/^    group: "([^"]+)"/gm)].map((m) => m[1]);
    out.push({ file, module: mod ? mod[1] : null, groups: inline, scenery });
  }
  return out;
}

/** The GLB a rack's page loads, found by its slug in the model registry. */
function urlFor(module) {
  const src = readFileSync(path.join(HERO, "index.ts"), "utf8");
  const slug = readFileSync(path.join(RACKS, `${module}.ts`), "utf8").match(/slug:\s*"([^"]+)"/)?.[1];
  if (!slug) return null;
  const entry = src.match(new RegExp(`"${slug}":[\\s\\S]{0,400}?url:\\s*"([^"]+)"`));
  return entry ? entry[1] : null;
}

/** The GLB for a hand written part table, matched on the table's own name. */
function urlForFile(file) {
  const key = path.basename(file, ".ts");
  const src = readFileSync(path.join(HERO, "index.ts"), "utf8");
  for (const m of src.matchAll(/url:\s*"([^"]+)"/g)) {
    if (path.basename(m[1], ".glb").replace(/-/g, "").includes(key)) return m[1];
  }
  return null;
}

/** Every rack the site renders, as the build published it. */
const DATASET = JSON.parse(readFileSync(path.resolve("dist/public/data/rack-library.json"), "utf8"));

/** Devices in rack order, top to bottom, with the units each occupies. */
function devicesOf(slug) {
  const rows = DATASET.devices.filter((d) => d.rack === slug);
  return {
    height: rows[0]?.rackUnits ?? 0,
    devices: rows.map((d) => ({ id: d.id, u: d.u, centre: d.position + d.u / 2 })),
    used: rows.reduce((n, d) => n + d.u, 0),
  };
}

/** The slug a rack module declares, which is how the dataset names it. */
function slugOf(module) {
  return readFileSync(path.join(RACKS, `${module}.ts`), "utf8").match(/slug:\s*"([^"]+)"/)?.[1] ?? null;
}

/**
 * Vertical extent of every top level node group in a GLB.
 *
 * Positions are quantised to normalised shorts by the meshopt pass, so a
 * node's world range is its translation plus its scale times the accessor
 * bounds. That is enough to place a group without decoding a single vertex,
 * which matters because these files are compressed.
 *
 * The generators work Z-up, which is the CAD convention and the opposite of
 * glTF's, so the rack's vertical axis here is Z.
 */
function groupExtents(glb) {
  const data = readFileSync(glb);
  const jsonLen = data.readUInt32LE(12);
  const doc = JSON.parse(data.subarray(20, 20 + jsonLen).toString("utf8"));
  const bounds = new Map();
  for (const node of doc.nodes ?? []) {
    if (node.mesh === undefined || !node.name) continue;
    const head = node.name.split("__")[0].split(".")[0];
    const tz = node.translation?.[2] ?? 0;
    const sz = node.scale?.[2] ?? 1;
    for (const prim of doc.meshes[node.mesh].primitives) {
      const acc = doc.accessors[prim.attributes.POSITION];
      if (!acc?.min || !acc?.max) continue;
      const unit = acc.normalized ? 32767 : 1;
      const lo = tz + sz * Math.max(acc.min[2] / unit, -1);
      const hi = tz + sz * Math.min(acc.max[2] / unit, 1);
      const prev = bounds.get(head);
      if (prev) {
        prev.lo = Math.min(prev.lo, lo);
        prev.hi = Math.max(prev.hi, hi);
      } else {
        bounds.set(head, { lo, hi });
      }
    }
  }
  return bounds;
}

/**
 * Fit z = intercept + slope * u over a rack's devices, robustly.
 *
 * Not least squares. Least squares has a breakdown point of zero: every
 * point pulls the line by its residual, so a device that has genuinely
 * moved drags the whole fit toward itself and every innocent device
 * inherits a share of its error. That is the exact failure mode this check
 * exists to be immune to, because the fault it looks for is one or two
 * devices out of place among twenty that are fine.
 *
 * Theil-Sen instead: the slope is the median of the pairwise slopes, the
 * intercept the median of the residuals against it. Both tolerate up to
 * about a third of the points being wrong. selfTest below holds this
 * function to that property on the case that matters, so it cannot quietly
 * be simplified back to a mean.
 */
function fitLadder(pts) {
  const median = (xs) => {
    const a = [...xs].sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const slopes = [];
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      const du = pts[j].u - pts[i].u;
      if (Math.abs(du) > 1e-9) slopes.push((pts[j].z - pts[i].z) / du);
    }
  }
  const slope = median(slopes);
  return { slope, intercept: median(pts.map((p) => p.z - slope * p.u)) };
}

/** Which devices the fit puts more than the tolerance away from their slot. */
function drifters(pts) {
  const { slope, intercept } = fitLadder(pts);
  return pts.filter((p) => Math.abs((p.z - (intercept + slope * p.u)) / U) > DRIFT_U).map((p) => p.id);
}

/**
 * The fit must name the devices that moved, and only those.
 *
 * A perfect 21 rung ladder with two rungs exchanged: a real, ordinary
 * fault, two devices swapped between the generator and the device list.
 * Theil-Sen reports the two. A least squares fit over the same points
 * reports sixteen of the twenty one, with the two culprits buried among
 * fourteen devices that never moved, and it also mismeasures the rack unit
 * badly enough to raise a second, entirely fictional failure.
 *
 * That is not a small difference in output quality. A gate that names
 * fourteen innocent devices sends whoever reads it into a generator that
 * was correct, so it is worth a few milliseconds a run to hold the fit to
 * the property that makes the message trustworthy.
 */
function selfTest() {
  const rungs = Array.from({ length: 21 }, (_, i) => ({ id: `R${i}`, u: i + 0.5, z: 2 - U * (i + 0.5) }));
  const swapped = rungs.map((r) => ({ ...r }));
  [swapped[5].z, swapped[16].z] = [swapped[16].z, swapped[5].z];

  const flagged = drifters(swapped);
  if (flagged.length !== 2 || !flagged.includes("R5") || !flagged.includes("R16")) {
    fail(
      `the position fit is not robust: two swapped rungs out of 21 should flag exactly those two,` +
        ` but it flagged ${flagged.length} (${flagged.join(", ") || "none"}).` +
        ` A fit that spreads one fault across the innocent devices makes this check's output misleading.`,
    );
  }
  const { slope } = fitLadder(swapped);
  if (Math.abs(-slope - U) > U * 0.001) {
    fail(
      `the position fit is not robust: two swapped rungs moved the measured rack unit to` +
        ` ${(-slope * 1000).toFixed(2)}mm, which would raise a second failure about a rack that is dimensionally fine.`,
    );
  }
}

selfTest();

let fitted = 0;
let named = 0;

for (const { file, module, groups, scenery } of heroModels()) {
  const url = module ? urlFor(module) : urlForFile(file);
  if (!url) {
    fail(`${file}: no model url found in heroModels/index.ts`);
    continue;
  }
  const glb = path.join(MODELS, path.basename(url));
  const { height, devices, used } = module
    ? devicesOf(slugOf(module))
    : { height: 0, devices: groups.map((id) => ({ id, u: 0, centre: 0 })), used: 0 };

  if (module && used < height) {
    fail(`${module}: devices total ${used}U in a ${height}U frame, leaving ${height - used}U of open rack undeclared`);
  }

  const bounds = groupExtents(glb);
  const ids = new Set(devices.map((d) => d.id));

  for (const name of bounds.keys()) {
    if (!ids.has(name) && !scenery.has(name)) {
      fail(`${path.basename(url)}: node group "${name}" is neither a device nor scenery, so a click on it does nothing`);
    }
  }
  for (const d of devices) {
    if (!bounds.has(d.id)) fail(`${path.basename(url)}: device "${d.id}" has no node group, so it can never be selected`);
  }

  /*
    Fit the declared layout onto the measured one. z = A - B * u, where B
    should come out as one rack unit; anything else means the model and the
    definition disagree about how tall a unit is.
  */
  const pts = devices.filter((d) => bounds.has(d.id)).map((d) => {
    const b = bounds.get(d.id);
    return { id: d.id, u: d.centre, z: (b.lo + b.hi) / 2 };
  });
  named += 1;
  if (!module || pts.length < 3) continue;
  fitted += 1;

  const { slope, intercept } = fitLadder(pts);

  if (Math.abs(-slope - U) > U * 0.03) {
    fail(`${path.basename(url)}: a rack unit measures ${(-slope * 1000).toFixed(2)}mm in the model, not ${(U * 1000).toFixed(2)}mm`);
  }

  for (const p of pts) {
    const drift = (p.z - (intercept + slope * p.u)) / U;
    if (Math.abs(drift) > DRIFT_U) {
      fail(
        `${path.basename(url)}: "${p.id}" sits ${drift.toFixed(2)}U from where the device list puts it` +
          ` (a whole unit of drift is two devices swapped)`,
      );
    }
  }
}

/*
  Three invariants that hold for every rack, model or not.

  A rack whose contents add up to more than its frame is a drawing of
  something that cannot be built. One that adds up to less has units the
  elevation draws as nothing and the definition never mentions, which is a
  different bug and was caught late: mikrotik-9u declared six units in a
  nine unit frame, so its bottom three were open rack that no device, no
  blanking panel and no error accounted for, and it turned out the rack had
  simply never been given a PDU or a UPS. The equivalent check already
  existed for racks with an authored 3D model and that is exactly why this
  one slipped: it is the small racks, drawn only as elevations, that nobody
  counts by hand.

  And two devices sharing an id means one of them can never be selected,
  deep linked, or told apart in the dataset.
*/
for (const slug of new Set(DATASET.devices.map((d) => d.rack))) {
  const rows = DATASET.devices.filter((d) => d.rack === slug);
  const used = rows.reduce((n, d) => n + d.u, 0);
  if (used > rows[0].rackUnits) {
    fail(`${slug}: ${used}U of hardware in a ${rows[0].rackUnits}U frame, which is ${used - rows[0].rackUnits}U past the floor`);
  }
  if (used < rows[0].rackUnits) {
    fail(
      `${slug}: ${used}U declared in a ${rows[0].rackUnits}U frame, leaving ${rows[0].rackUnits - used}U` +
        ` the elevation draws as open rack and nothing accounts for. Fit something, or cover it with a panel.`,
    );
  }
  const seen = new Set();
  for (const d of rows) {
    if (seen.has(d.id)) fail(`${slug}: two devices share the id "${d.id}", so only the first can ever be selected`);
    seen.add(d.id);
  }

  /*
    A rack with a UPS and no PDU is a rack nobody could plug in.

    Not a style rule. A rack UPS has a handful of outlets on its back, four
    or eight, and every rack here has more powered devices than that, so a
    frame holding one and no strip is a drawing of something that does not
    work. Five racks were in exactly that state, and the reason is worth
    knowing: a PDU is the least interesting thing in a rack, so it is the
    thing that gets left out of a device list and never missed.
  */
  const families = new Set(rows.map((d) => d.family));
  const powered = rows.filter((d) => !["blank", "patch", "pdu", "ups"].includes(d.family));
  if (families.has("ups") && !families.has("pdu") && powered.length > 2) {
    fail(
      `${slug}: ${powered.length} powered devices and a UPS, but no PDU.` +
        ` A rack UPS has a handful of outlets on its back, so this is a rack nobody could plug in.`,
    );
  }
}

if (problems.length) {
  console.error("\nRack models disagree with their device lists:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"}.\n`);
  process.exit(1);
}
console.log(
  `OK  ${named} rack models match their part tables by name; ${fitted} of them also match in order and position.`,
);
