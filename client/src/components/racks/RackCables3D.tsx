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
}

/**
 * The path one lead takes: out of the jack along the plug axis, into a
 * belly that hangs below the shorter of the two ends, and back in.
 */
function leadCurve(a: THREE.Vector3, b: THREE.Vector3, n: number): THREE.CatmullRomCurve3 {
  const span = a.distanceTo(b);
  const j = jitter(n + 1);
  /*
    A patched panel is a combed bundle, not a bowl of spaghetti. The first
    pass let every lead swing a quarter of its own length out into the room
    and the result crossed the whole face. Real leads leave the boot, turn
    within a few centimetres and run down the panel, so the loop is tight
    and the depth off the face barely changes between a short lead and a
    long one. What varies is where the belly hangs.
  */
  const out = 0.016 + span * 0.05 + j * 0.005;
  const sag = 0.006 + span * 0.1 + j * 0.004;
  const bow = (a.x < b.x ? 1 : -1) * j * 0.002;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(a.x, a.y, a.z),
      new THREE.Vector3(a.x, a.y, a.z + 0.019),
      new THREE.Vector3(a.x + bow, a.y - 0.008, a.z + out),
      new THREE.Vector3(mid.x, mid.y - sag, a.z + out * 1.08),
      new THREE.Vector3(b.x - bow, b.y + 0.008, b.z + out),
      new THREE.Vector3(b.x, b.y, b.z + 0.019),
      new THREE.Vector3(b.x, b.y, b.z),
    ],
    false,
    "catmullrom",
    0.35,
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

    // Long leads first, so the ones that hang furthest out sit behind the
    // short ones rather than cutting through them.
    ends.sort((p, q) => q.a.distanceTo(q.b) - p.a.distanceTo(p.b));

    // One merged tube geometry per jacket colour.
    const byJacket = new Map<string, THREE.BufferGeometry[]>();
    ends.forEach((e, i) => {
      const geom = new THREE.TubeGeometry(leadCurve(e.a, e.b, i), 26, RADIUS[e.style], 6, false);
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
      // 11.7 by 13.4mm is the real RJ45 body; the boot runs about 20mm back.
      new THREE.BoxGeometry(0.0117, 0.0134, 0.02),
      new THREE.MeshStandardMaterial({ metalness: 0.05, roughness: 0.4, envMapIntensity: 1 }),
      count,
    );
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    built.ends.forEach((e, i) => {
      [e.a, e.b].forEach((p, k) => {
        m.makeTranslation(p.x, p.y, p.z + 0.009);
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
