/**
 * Every connector, screw and outlet in the rack, in one pass.
 *
 * The parts themselves live in parts.ts. This is the thing that decides
 * where they go: it walks the whole rack once, works out a matrix for each
 * instance, and hands one InstancedMesh per part to the scene. A rack with
 * ten switches has upwards of five hundred fully modelled jacks in it, and
 * as separate meshes that would be five hundred draw calls for a picture
 * that never moves. Instanced, it is about a dozen.
 *
 * Doing it at rack level rather than per device is what makes that
 * possible, which is why this is not simply part of BrandedChassis.
 */

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { LedState, RackDefinition } from "@/lib/rackTypes";
import { CHASSIS_WIDTH, chassisLayout, deviceDepth } from "./chassisLayout";
import { RACK_INNER_WIDTH, U } from "@/components/cinematic/rack3d/rackConfig";
import {
  blankRim,
  cableRing,
  fanGuard,
  jackCavity,
  jackContacts,
  jackRim,
  outlet,
  rackScrew,
  sfpBore,
  sfpCage,
  sfpModule,
} from "./parts";

/** Build an InstancedMesh from a list of matrices, or nothing if empty. */
function instance(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
): THREE.InstancedMesh | null {
  if (!matrices.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

const place = (x: number, y: number, z: number, w: number, h: number, d: number): THREE.Matrix4 =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion(),
    new THREE.Vector3(w, h, d),
  );

const LED_HEX: Record<string, string> = {
  green: "#4ef08a",
  blue: "#5ad2ff",
  amber: "#ffc043",
  red: "#ff5f5f",
  off: "#191d22",
};

const MATS = {
  rim: new THREE.MeshStandardMaterial({ color: "#1a1e24", metalness: 0.35, roughness: 0.55, envMapIntensity: 0.55 }),
  gold: new THREE.MeshStandardMaterial({ color: "#e0b45a", metalness: 0.95, roughness: 0.24 }),
  cage: new THREE.MeshStandardMaterial({ color: "#8d949c", metalness: 0.9, roughness: 0.3 }),
  screw: new THREE.MeshStandardMaterial({ color: "#b6bcc4", metalness: 0.9, roughness: 0.3 }),
  guard: new THREE.MeshStandardMaterial({ color: "#3a3f46", metalness: 0.7, roughness: 0.45 }),
  module: new THREE.MeshStandardMaterial({ color: "#6f7780", metalness: 0.82, roughness: 0.34 }),
  bore: new THREE.MeshStandardMaterial({ color: "#05070a", metalness: 0.1, roughness: 0.95 }),
  ring: new THREE.MeshStandardMaterial({ color: "#9aa2ab", metalness: 0.85, roughness: 0.32 }),
  outletFace: new THREE.MeshStandardMaterial({ color: "#e9ebee", metalness: 0.05, roughness: 0.55 }),
};

/** One cavity material per throat colour, so Cisco's teal survives instancing. */
const cavityMaterials = new Map<string, THREE.MeshStandardMaterial>();
function cavityMaterial(tint: string): THREE.MeshStandardMaterial {
  let m = cavityMaterials.get(tint);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: tint, metalness: 0.15, roughness: 0.9 });
    cavityMaterials.set(tint, m);
  }
  return m;
}

/**
 * Every lit indicator in the rack, in one instanced mesh.
 *
 * They were a mesh each, sitting in a group per device: three hundred draw
 * calls for three hundred one millimetre squares, and positioned inboard
 * enough that a patched port hid its own LED behind the plug. Now they sit
 * in the top corner of the bezel where the real ones are, they are one
 * draw call for the rack, and the blink is a per-instance colour written
 * on the frame loop rather than a visibility toggle per object.
 *
 * They flicker out of step. A switch across a room does not pulse in
 * unison, and a rack that does is the most distracting thing in a scene.
 */
function PortLeds({ spots }: { spots: Array<{ m: THREE.Matrix4; colour: string; seed: number }> }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const mesh = useMemo(() => {
    if (!spots.length) return null;
    const m = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      spots.length,
    );
    const c = new THREE.Color();
    spots.forEach((spot, i) => {
      m.setMatrixAt(i, spot.m);
      m.setColorAt(i, c.set(spot.colour));
    });
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    return m;
  }, [spots]);

  const lit = useMemo(() => spots.map((s) => new THREE.Color(s.colour)), [spots]);
  const dim = useMemo(() => spots.map((s) => new THREE.Color(s.colour).multiplyScalar(0.12)), [spots]);

  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m || !m.instanceColor) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < spots.length; i += 1) {
      const seed = spots[i].seed;
      const rate = 1.5 + (seed % 7) * 0.31;
      const phase = ((seed * 0.37) % 1) * 10;
      m.setColorAt(i, Math.sin((t + phase) * rate) > -0.35 ? lit[i] : dim[i]);
    }
    m.instanceColor.needsUpdate = true;
  });

  if (!mesh) return null;
  return <primitive ref={ref} object={mesh} />;
}

export function RackHardware({
  rack,
  yOf,
  faceZ,
}: {
  rack: RackDefinition;
  yOf: Map<string, number>;
  faceZ: number;
}) {
  const meshes = useMemo(() => {
    const rimUp: THREE.Matrix4[] = [];
    const rimDown: THREE.Matrix4[] = [];
    const contactsUp: THREE.Matrix4[] = [];
    const contactsDown: THREE.Matrix4[] = [];
    const blanks: THREE.Matrix4[] = [];
    const cages: THREE.Matrix4[] = [];
    const screws: THREE.Matrix4[] = [];
    const guards: THREE.Matrix4[] = [];
    const outlets: THREE.Matrix4[] = [];
    const modules: THREE.Matrix4[] = [];
    const bores: THREE.Matrix4[] = [];
    const rings: THREE.Matrix4[] = [];
    const cavities = new Map<string, THREE.Matrix4[]>();
    const leds: Array<{ m: THREE.Matrix4; colour: string; seed: number }> = [];
    let ledSeed = 0;

    const addCavity = (tint: string, m: THREE.Matrix4) => {
      const bucket = cavities.get(tint);
      if (bucket) bucket.push(m);
      else cavities.set(tint, [m]);
    };

    for (const device of rack.devices) {
      const y0 = yOf.get(device.id);
      if (y0 === undefined) continue;
      const h = device.u * U;
      const tint = device.portTint ?? "#080a0d";

      /*
        Rack screws. Every device is bolted through its ears, two per rack
        unit per side on a cage nut rail, and they are the one detail that
        is on absolutely every box in the rack.
      */
      for (let u = 0; u < device.u; u += 1) {
        for (const sx of [-1, 1]) {
          const yc = y0 - h / 2 + (u + 0.5) * U;
          for (const dy of [-U * 0.28, U * 0.28]) {
            screws.push(place(sx * (RACK_INNER_WIDTH / 2 - 0.008), yc + dy, faceZ + 0.0005, 0.0085, 0.0085, 0.0085));
          }
        }
      }

      // PDU faces are outlets, not ports, and the layout skips power inlets.
      if (device.family === "pdu") {
        const sockets = (device.ports ?? []).filter((p) => p.kind === "power");
        const rows = sockets.length > 8 ? 2 : 1;
        const cols = Math.ceil(sockets.length / Math.max(1, rows));
        const size = Math.min((CHASSIS_WIDTH * 0.8) / Math.max(1, cols), (h * 0.84) / rows);
        const startX = -(cols * size) / 2 + size / 2;
        sockets.forEach((_, i) => {
          const col = rows === 2 ? Math.floor(i / 2) : i;
          const row = rows === 2 ? i % 2 : 0;
          outlets.push(
            place(
              startX + col * size,
              y0 + (rows === 2 ? (row === 0 ? size * 0.5 : -size * 0.5) : 0),
              faceZ + 0.0008,
              size * 0.86,
              size * 0.86,
              size * 0.86,
            ),
          );
        });
      }

      // A horizontal cable manager is a row of open D-rings on posts, not a
      // comb of slabs: bundles drop in from above and are retained without
      // being clamped, and the open side is what lets a lead be added later
      // without unthreading the whole rack.
      if (device.family === "blank" && device.look === "fingers") {
        const count = 12;
        const step = (CHASSIS_WIDTH * 0.88) / (count - 1);
        for (let i = 0; i < count; i += 1) {
          const size = Math.min(h * 0.78, step * 0.92);
          rings.push(place(-CHASSIS_WIDTH * 0.44 + i * step, y0, faceZ + 0.03, size, size, size));
        }
      }

      const layout = chassisLayout(device);
      if (layout) {
        for (const slot of layout.copper) {
          const m = place(slot.x, y0 + slot.y, faceZ + 0.0008, slot.w, slot.h, slot.w);
          if (slot.port.kind === "blank") {
            blanks.push(m);
            addCavity(tint, place(slot.x, y0 + slot.y, faceZ + 0.0008, slot.w, slot.h, slot.w));
            continue;
          }
          // Top row takes the plug latch downward, bottom row upward.
          const tabUp = slot.row !== 0;
          (tabUp ? rimUp : rimDown).push(m);
          (tabUp ? contactsUp : contactsDown).push(m);
          addCavity(tint, m);

          /*
            Two indicators per jack, at the outer corners of the cage: link
            on one side, activity on the other. That is where a real 8P8C
            jack puts them, and it is also the only place they survive
            being patched, since a plug body is narrower than the cage it
            goes into and would hide anything set further in.
          */
          const led = slot.port.led;
          if (led && led !== "off") {
            const lens = Math.min(slot.w * 0.12, slot.h * 0.11);
            const ly = y0 + slot.y + (tabUp ? -slot.h * 0.33 : slot.h * 0.33);
            for (const [side, colour] of [
              [-1, LED_HEX[led as LedState] ?? LED_HEX.off],
              [1, LED_HEX.amber],
            ] as const) {
              ledSeed += 1;
              leds.push({
                m: place(slot.x + side * slot.w * 0.46, ly, faceZ + 0.0022, lens, lens, 1),
                colour,
                seed: ledSeed,
              });
            }
          }
        }
        for (const slot of layout.cages) {
          const m = place(slot.x, y0 + slot.y, faceZ + 0.0008, slot.w, slot.h, slot.w * 0.8);
          cages.push(m);
          addCavity(tint, m);
          const led = slot.port.led;
          if (led && led !== "off") {
            // A lit optic has a module in it. An empty cage where a link is
            // up is a contradiction, and a rack of empty cages reads as one
            // that was never finished.
            const mm = place(slot.x, y0 + slot.y, faceZ, slot.w, slot.h, slot.w * 0.62);
            modules.push(mm);
            bores.push(mm);
            ledSeed += 1;
            leds.push({
              m: place(
                slot.x - slot.w * 0.36,
                y0 + slot.y + slot.h * 0.36,
                faceZ + 0.0022,
                slot.w * 0.14,
                slot.h * 0.12,
                1,
              ),
              colour: LED_HEX[led as LedState] ?? LED_HEX.off,
              seed: ledSeed,
            });
          }
        }
      }

      /*
        The rear. Orbiting round the back of a rack used to show six blank
        boxes; anything with a fan in it has a guard on that face, and a
        server has two.
      */
      const rearZ = faceZ - deviceDepth(device);
      if (device.family === "server" || device.family === "storage" || device.family === "ups") {
        const n = device.u >= 2 ? 2 : 1;
        const d = Math.min(h * 0.7, 0.09);
        for (let i = 0; i < n; i += 1) {
          const gx = n === 1 ? CHASSIS_WIDTH * 0.28 : CHASSIS_WIDTH * (i === 0 ? 0.18 : 0.36);
          const gm = place(gx, y0, rearZ - 0.001, d, d, d);
          gm.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
          guards.push(gm);
        }
      }
    }

    const out: THREE.Object3D[] = [];
    const push = (m: THREE.InstancedMesh | null) => {
      if (m) out.push(m);
    };
    push(instance(jackRim(true), MATS.rim, rimUp));
    push(instance(jackRim(false), MATS.rim, rimDown));
    push(instance(jackContacts(true), MATS.gold, contactsUp));
    push(instance(jackContacts(false), MATS.gold, contactsDown));
    push(instance(blankRim(), MATS.rim, blanks));
    push(instance(sfpCage(), MATS.cage, cages));
    push(instance(rackScrew(), MATS.screw, screws));
    push(instance(fanGuard(), MATS.guard, guards));
    push(instance(outlet(), MATS.outletFace, outlets));
    push(instance(sfpModule(), MATS.module, modules));
    push(instance(sfpBore(), MATS.bore, bores));
    push(instance(cableRing(), MATS.ring, rings));
    cavities.forEach((list, tint) => push(instance(jackCavity(), cavityMaterial(tint), list)));
    return { out, leds };
  }, [rack, yOf, faceZ]);

  return (
    <group>
      {meshes.out.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <PortLeds spots={meshes.leds} />
    </group>
  );
}
