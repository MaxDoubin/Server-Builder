/**
 * Patch leads in three dimensions.
 *
 * A cable drawn as a flat curve over an elevation is a diagram. A cable in
 * a real rack is a tube that leaves its jack along the plug's own axis,
 * bows out in front of the panel because copper will not turn a sharp
 * corner, and comes back in at the same angle at the far end. That service
 * loop is the single most recognisable thing about a patched rack, and it
 * is the reason a populated patch panel looks like hardware and an empty
 * one looks like a drawing.
 *
 * Everything is built once per rack and merged by jacket colour, because
 * ninety-three separate tube meshes would be ninety-three draw calls for an
 * object that never moves. The boots are one instanced mesh over the lot,
 * tinted per instance, so an Etherlighting boot can carry its own port's
 * indicator colour without costing a material each.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RackDefinition, RackPatch } from "@/lib/rackTypes";
import { chassisLayout, type ChassisLayout } from "./chassisLayout";
import { plugBoot } from "./parts";

/**
 * Jacket radius. Cat6A patch cord is about 6mm over the jacket; the UniFi
 * Etherlighting lead is a slim 2.5mm TPE. Drawn at its true 1.25mm radius
 * against a white chassis it disappeared into a scratch, so it renders at
 * the low end of what a booted patch lead actually measures instead.
 */
const RADIUS = { plain: 0.0029, etherlighting: 0.0019 };

const JACKET_HEX: Record<string, string> = {
  blue: "#2f6fd0",
  grey: "#8d949f",
  yellow: "#e3c02a",
  red: "#c8383d",
  green: "#3f9f57",
  // Slightly off white, so a white lead still reads against a white panel.
  white: "#e6eaef",
};

const LED_HEX: Record<string, string> = {
  green: "#4ef08a",
  blue: "#5ad2ff",
  amber: "#ffc043",
  red: "#ff5f5f",
  off: "#9aa3b0",
};

/** Deterministic 0..1 from an integer, so a rack looks the same every load. */
const jitter = (n: number): number => ((n * 2654435761) % 1000) / 1000;

interface Ends {
  a: THREE.Vector3;
  b: THREE.Vector3;
  jacket: string;
  boot: string;
  style: "plain" | "etherlighting";
  /** Direction the lead leaves each jack, for pointing the plug body. */
  outA?: THREE.Vector3;
  outB?: THREE.Vector3;
}

/**
 * The path one lead takes.
 *
 * The first pass let every lead find its own way from A to B, and the
 * result was a bowl of spaghetti across the front of the rack. That is not
 * what a patched rack looks like, and it is not what a cable does either.
 *
 * A dressed bundle is four moves, and every lead in it makes the same
 * four: out of the jack along the plug's axis, a turn down into a service
 * loop, a run along the bottom of that loop to get under the far port, and
 * back up into it. Because every lead turns at the same standoff from the
 * panel and drops to the same belly, the vertical runs come out parallel
 * and the bundle reads as combed rather than as tangled. The variation is
 * only in how far out each one sits, and that is not arbitrary either: a
 * long lead has to cross the ones under it, so it is layered further out.
 *
 * The dip below both ports is a real service loop, not a sag. It is the
 * slack an installer leaves so a switch can be pulled forward on its rails
 * without unplugging forty cables.
 */
function leadCurve(a: THREE.Vector3, b: THREE.Vector3, n: number, reach: number): THREE.CatmullRomCurve3 {
  const j = jitter(n + 1);
  // Standoff from the panel. Near constant, so the bundle is one surface,
  // with the long leads layered out over the short ones they cross.
  const out = 0.019 + reach * 0.016 + j * 0.0018;
  // Bottom of the service loop, just below whichever port is lower. A
  // dressed loop clears its own switch and stops; the first attempt hung
  // it eight centimetres out and two rack units down, which is a bundle
  // nobody would leave and a shape that covered the hardware behind it.
  const belly = Math.min(a.y, b.y) - 0.011 - reach * 0.013 - j * 0.002;
  const mid = (a.x + b.x) / 2;

  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(a.x, a.y, a.z),
      new THREE.Vector3(a.x, a.y, a.z + 0.019),
      new THREE.Vector3(a.x, a.y - 0.008, a.z + out * 0.75),
      new THREE.Vector3(a.x, (a.y + belly) / 2, a.z + out),
      new THREE.Vector3(a.x, belly, a.z + out),
      new THREE.Vector3(mid, belly - 0.0015, a.z + out),
      new THREE.Vector3(b.x, belly, b.z + out),
      new THREE.Vector3(b.x, (b.y + belly) / 2, b.z + out),
      new THREE.Vector3(b.x, b.y - 0.008, b.z + out * 0.75),
      new THREE.Vector3(b.x, b.y, b.z + 0.019),
      new THREE.Vector3(b.x, b.y, b.z),
    ],
    false,
    "catmullrom",
    0.25,
  );
}

export function RackCables3D({
  rack,
  yOf,
  faceZ,
  budget = 128,
}: {
  rack: RackDefinition;
  /** Centre height of each device, keyed by device id. */
  yOf: Map<string, number>;
  /** Front plane of this rack, where every jack sits. */
  faceZ: number;
  /** Cap on leads drawn, so a low-tier device is not asked for all of them. */
  budget?: number;
}) {
  const built = useMemo(() => {
    const patches = (rack.patches ?? []).slice(0, budget);
    if (!patches.length) return null;

    const layouts = new Map<string, ChassisLayout | null>();
    for (const d of rack.devices) layouts.set(d.id, chassisLayout(d));

    const endpoint = (ref: RackPatch["from"]): THREE.Vector3 | null => {
      const layout = layouts.get(ref.device);
      const y = yOf.get(ref.device);
      if (!layout || y === undefined) return null;
      const slot = layout.byIndex.get(ref.port);
      if (!slot) return null;
      return new THREE.Vector3(slot.x, y + slot.y, faceZ);
    };

    const ends: Ends[] = [];
    patches.forEach((patch) => {
      const a = endpoint(patch.from);
      const b = endpoint(patch.to);
      if (!a || !b) return;
      const style = patch.style ?? "plain";
      const source = rack.devices.find((d) => d.id === patch.from.device);
      const led = patch.colour ?? source?.ports?.[patch.from.port]?.led ?? "off";
      /*
        An Etherlighting boot is translucent white plastic with the port's
        LED piped into it, not a solid block of that LED's colour. Painting
        it the raw indicator colour turned the panel into a row of flat
        green and amber tiles, so the tint is mixed most of the way back to
        white and the colour reads as a glow rather than as paint.
      */
      const boot =
        style === "etherlighting"
          ? new THREE.Color(LED_HEX[led] ?? LED_HEX.off).lerp(new THREE.Color("#ffffff"), 0.68).getStyle()
          : "#1b1e23";
      ends.push({
        a,
        b,
        jacket: JACKET_HEX[patch.jacket ?? (style === "etherlighting" ? "white" : "grey")] ?? JACKET_HEX.grey,
        boot,
        style,
      });
    });
    if (!ends.length) return null;

    /*
      Order the bundle the way an installer builds one: the leads with the
      furthest to travel go in first and end up underneath, and each
      shorter run lies on top of them. That ordering is what `reach` below
      turns into a standoff, so the layering is consistent rather than
      decided per cable.
    */
    ends.sort((p, q) => Math.abs(q.a.x - q.b.x) - Math.abs(p.a.x - p.b.x));
    const widest = Math.max(...ends.map((e) => Math.abs(e.a.x - e.b.x)), 1e-6);

    /*
      Record which way each lead leaves its jack, so the plug body points
      along the cable instead of straight out of the panel. A plug that
      ignores the direction of its own cable is the tell that a render was
      assembled rather than modelled.
    */
    const reachOf = (e: Ends) => Math.abs(e.a.x - e.b.x) / widest;
    ends.forEach((e, i) => {
      const curve = leadCurve(e.a, e.b, i, reachOf(e));
      e.outA = curve.getTangentAt(0.001).normalize();
      e.outB = curve.getTangentAt(0.999).normalize().negate();
    });

    // One merged tube geometry per jacket colour.
    const byJacket = new Map<string, THREE.BufferGeometry[]>();
    ends.forEach((e, i) => {
      const geom = new THREE.TubeGeometry(leadCurve(e.a, e.b, i, reachOf(e)), 40, RADIUS[e.style], 7, false);
      const bucket = byJacket.get(e.jacket);
      if (bucket) bucket.push(geom);
      else byJacket.set(e.jacket, [geom]);
    });

    const runs: Array<{ colour: string; geometry: THREE.BufferGeometry }> = [];
    byJacket.forEach((parts, colour) => {
      const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (!merged) return;
      if (parts.length > 1) parts.forEach((p) => p.dispose());
      runs.push({ colour, geometry: merged });
    });

    return { runs, ends };
  }, [rack, yOf, faceZ, budget]);

  /*
    Boots. Every lead has two, and on the Etherlighting parts the boot is
    translucent and lit by the switch's own port LED, which is the whole
    product. One instanced mesh carries all of them.
  */
  const boots = useMemo(() => {
    if (!built) return null;
    const count = built.ends.length * 2;
    const mesh = new THREE.InstancedMesh(
      // Normalised to an 11.7mm plug body; the boot runs about 25mm back.
      plugBoot(),
      new THREE.MeshStandardMaterial({ metalness: 0.04, roughness: 0.38, envMapIntensity: 1 }),
      count,
    );
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3(0.0117, 0.0117, 0.0117);
    const nose = new THREE.Vector3(0, 0, 1);
    const dir = new THREE.Vector3();
    built.ends.forEach((e, i) => {
      [
        [e.a, e.outA] as const,
        [e.b, e.outB] as const,
      ].forEach(([p, out], k) => {
        // The plug's nose sits on z = 0 with its body running back along
        // -Z, so +Z has to point into the jack, opposite the way the cable
        // leaves it.
        dir.copy(out ?? new THREE.Vector3(0, 0, 1)).negate();
        q.setFromUnitVectors(nose, dir);
        m.compose(p, q, scale);
        mesh.setMatrixAt(i * 2 + k, m);
        mesh.setColorAt(i * 2 + k, colour.set(e.boot));
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }, [built]);

  if (!built) return null;

  return (
    <group>
      {built.runs.map((run) => (
        <mesh key={run.colour} geometry={run.geometry}>
          <meshStandardMaterial color={run.colour} metalness={0.05} roughness={0.55} />
        </mesh>
      ))}
      {boots && <primitive object={boots} />}
    </group>
  );
}
