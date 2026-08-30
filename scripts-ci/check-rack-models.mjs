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
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";

const MODELS = path.resolve("client/public/models");
const RACKS = path.resolve("client/src/lib/racks");
const HERO = path.join(RACKS, "heroModels");

/** One rack unit, in meters. The generators and the renderers share it. */
const U = 0.04445;

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

/** Devices in rack order, top to bottom, with the units each occupies. */
function devicesOf(module) {
  const src = readFileSync(path.join(RACKS, `${module}.ts`), "utf8");
  const height = Number(src.match(/height:\s*(\d+)/)?.[1] ?? 0);
  const out = [];
  let fromTop = 0;
  for (const block of src.split(/\n(?=      id: ")/).slice(1)) {
    const id = block.match(/^      id: "([^"]+)"/)?.[1];
    const u = Number(block.match(/\n      u: (\d+),/)?.[1] ?? NaN);
    if (!id || Number.isNaN(u)) continue;
    out.push({ id, u, centre: fromTop + u / 2 });
    fromTop += u;
  }
  return { height, devices: out, used: fromTop };
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
    ? devicesOf(module)
    : { height: 0, devices: groups.map((id) => ({ id, u: 0, centre: 0 })), used: 0 };

  if (module && used !== height) {
    fail(`${module}: devices total ${used}U in a ${height}U frame, so ${height - used}U is undeclared`);
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

  const n = pts.length;
  const mu = pts.reduce((s, p) => s + p.u, 0) / n;
  const mz = pts.reduce((s, p) => s + p.z, 0) / n;
  const cov = pts.reduce((s, p) => s + (p.u - mu) * (p.z - mz), 0);
  const varU = pts.reduce((s, p) => s + (p.u - mu) ** 2, 0);
  const slope = cov / varU;
  const intercept = mz - slope * mu;

  if (Math.abs(-slope - U) > U * 0.03) {
    fail(`${path.basename(url)}: a rack unit measures ${(-slope * 1000).toFixed(2)}mm in the model, not ${(U * 1000).toFixed(2)}mm`);
  }

  for (const p of pts) {
    const drift = (p.z - (intercept + slope * p.u)) / U;
    if (Math.abs(drift) > 0.45) {
      fail(
        `${path.basename(url)}: "${p.id}" sits ${drift.toFixed(2)}U from where the device list puts it` +
          ` (a whole unit of drift is two devices swapped)`,
      );
    }
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
