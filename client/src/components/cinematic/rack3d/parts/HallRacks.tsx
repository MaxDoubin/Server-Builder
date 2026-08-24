import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  ACCENT_HEX,
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_FRAME_TOP,
  RACK_INNER_WIDTH,
  RACK_INTERNAL_HEIGHT,
  RACK_LAYOUT,
  RACK_POST_WIDTH,
  RACK_TOTAL_HEIGHT,
  RACK_TOTAL_WIDTH,
  U,
} from "../rackConfig";

/**
 * The rows of racks that fill the hall at the end of the scroll story.
 *
 * These used to be full `RackFrame` + per-slot `ServerChassis` trees. A
 * single chassis is ~110 meshes, so seventeen neighbours cost roughly
 * 30,000 draw calls per frame and hard-stalled the scene the moment the
 * hall revealed.
 *
 * The detail is kept, the draw calls are not: every layer below is one
 * InstancedMesh shared across the whole hall, so the cabinets, posts,
 * plinths, top caps, equipment bezels, vent grilles, drive handles,
 * status LEDs, link LEDs, rail accents and smoked glass doors together
 * cost eleven draw calls no matter how many racks are placed.
 */

export interface HallRackPlacement {
  x: number;
  z: number;
  rotY: number;
  /** Progress offset so racks rise in sequence rather than all at once. */
  delay: number;
}

/** Front plane of the equipment bezels. */
const FACE_Z = RACK_DEPTH / 2 - 0.014;
const BEZEL_DEPTH = 0.024;
const BEZEL_FRONT = FACE_Z + BEZEL_DEPTH / 2;
const SLOT_GAP = 0.0035;

const POST_X = RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2;
const RAIL_H = RACK_INTERNAL_HEIGHT * 0.94;

type SlotSpec = {
  y: number;
  h: number;
  accent: string;
  blank: boolean;
  /** Deterministic 0..1 used for LED phase and drive-bay density. */
  jitter: number;
};

const SLOTS: SlotSpec[] = RACK_LAYOUT.map((slot, i) => ({
  y: RACK_FEET_HEIGHT + (slot.u - 1 + slot.size / 2) * U,
  h: Math.max(slot.size * U - SLOT_GAP, 0.006),
  accent: ACCENT_HEX[slot.accent ?? "signal"],
  blank: slot.kind === "blank",
  jitter: ((i * 9301 + 49297) % 233280) / 233280,
}));

const SLOT_COUNT = SLOTS.length;

/** Accents are washed toward this before lighting the equipment faces. */
const FACE_WASH = new THREE.Color("#9fb4cc");

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Build the fixed rack-local transform for every instance layer, once. */
function buildLocalMatrices() {
  const m = () => new THREE.Matrix4();
  const t = (x: number, y: number, z: number) => m().makeTranslation(x, y, z);
  const ts = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => m().makeTranslation(x, y, z).scale(new THREE.Vector3(sx, sy, sz));

  return {
    cabinet: t(0, RACK_TOTAL_HEIGHT / 2, 0),
    plinth: t(0, RACK_FEET_HEIGHT / 2, 0),
    topCap: t(0, RACK_TOTAL_HEIGHT - RACK_FRAME_TOP / 2, 0),
    glass: t(
      0,
      RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT / 2,
      RACK_DEPTH / 2 + 0.006,
    ),
    posts: [-1, 1].map((sx) =>
      t(sx * POST_X, RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT / 2, RACK_DEPTH / 2 - 0.016),
    ),
    rails: [-1, 1].map((sx) =>
      t(sx * POST_X, RACK_FEET_HEIGHT + RAIL_H / 2, RACK_DEPTH / 2 - 0.0005),
    ),
    // Per-slot layers. Unit-height geometry is scaled on Y to the slot size.
    bezel: SLOTS.map((s) => ts(0, s.y, FACE_Z, 1, s.h, 1)),
    vent: SLOTS.map((s) =>
      ts(-0.028, s.y, BEZEL_FRONT - 0.0015, 1, Math.max(s.h * 0.58, 0.004), 1),
    ),
    handles: SLOTS.flatMap((s) =>
      [-1, 1].map((sx) =>
        ts(
          sx * (RACK_INNER_WIDTH / 2 - 0.024),
          s.y,
          BEZEL_FRONT + 0.004,
          1,
          Math.max(s.h * 0.42, 0.005),
          1,
        ),
      ),
    ),
    // A lit face per unit. Real racks in a dark hall are read by their own
    // emissive gear, not by room light, and an unlit material needs no
    // lighting to carry the aisle into the distance.
    activity: SLOTS.map((s) =>
      ts(-0.034, s.y, BEZEL_FRONT + 0.0012, 1, Math.max(s.h * 0.13, 0.0022), 1),
    ),
    statusLed: SLOTS.map((s) =>
      t(RACK_INNER_WIDTH / 2 - 0.058, s.y + s.h * 0.18, BEZEL_FRONT + 0.003),
    ),
    linkLed: SLOTS.map((s) =>
      t(RACK_INNER_WIDTH / 2 - 0.072, s.y - s.h * 0.18, BEZEL_FRONT + 0.003),
    ),
  };
}

export function HallRacks({
  placements,
  progressRef,
  start,
  end,
}: {
  placements: HallRackPlacement[];
  progressRef: { current: number };
  start: number;
  end: number;
}) {
  const cabinetRef = useRef<THREE.InstancedMesh>(null);
  const plinthRef = useRef<THREE.InstancedMesh>(null);
  const topCapRef = useRef<THREE.InstancedMesh>(null);
  const postRef = useRef<THREE.InstancedMesh>(null);
  const railRef = useRef<THREE.InstancedMesh>(null);
  const bezelRef = useRef<THREE.InstancedMesh>(null);
  const ventRef = useRef<THREE.InstancedMesh>(null);
  const activityRef = useRef<THREE.InstancedMesh>(null);
  const handleRef = useRef<THREE.InstancedMesh>(null);
  const statusRef = useRef<THREE.InstancedMesh>(null);
  const linkRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);

  const rackCount = placements.length;
  const slotTotal = rackCount * SLOT_COUNT;

  const locals = useMemo(buildLocalMatrices, []);
  const scratch = useMemo(
    () => ({
      rack: new THREE.Matrix4(),
      out: new THREE.Matrix4(),
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      scale: new THREE.Vector3(),
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
      color: new THREE.Color(),
      accent: new THREE.Color(),
      dim: new THREE.Color(),
    }),
    [],
  );

  /**
   * Per-rack variation so the hall doesn't read as one rack photocopied
   * down the aisle. Deterministic from the index, so it survives remounts.
   */
  const variance = useMemo(
    () =>
      Array.from({ length: rackCount }, (_, i) => {
        const n = ((i * 9301 + 49297) % 233280) / 233280;
        const n2 = ((i * 4021 + 12345) % 233280) / 233280;
        return {
          tint: 0.82 + n * 0.3,
          /** Racks further down the aisle run fewer lit units. */
          litRatio: 0.55 + n2 * 0.45,
          phase: n2,
        };
      }),
    [rackCount],
  );

  const seeded = useRef(false);
  const lastLocal = useRef<Float32Array>(new Float32Array(0));
  if (lastLocal.current.length !== rackCount) {
    lastLocal.current = new Float32Array(rackCount).fill(-1);
    // A changed rack count changes every <instancedMesh args>, so R3F builds
    // new meshes and the instanceColor buffers we seeded go with the old
    // ones. Seed again or the whole hall renders in the bare material colour.
    seeded.current = false;
  }

  useFrame(({ clock }) => {
    const cabinets = cabinetRef.current;
    const plinths = plinthRef.current;
    const topCaps = topCapRef.current;
    const posts = postRef.current;
    const rails = railRef.current;
    const bezels = bezelRef.current;
    const vents = ventRef.current;
    const activity = activityRef.current;
    const handles = handleRef.current;
    const status = statusRef.current;
    const links = linkRef.current;
    const glass = glassRef.current;
    if (
      !cabinets || !plinths || !topCaps || !posts || !rails ||
      !bezels || !vents || !activity || !handles || !status || !links || !glass
    ) {
      return;
    }

    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const visible = p > start - 0.02;

    for (const mesh of [
      cabinets, plinths, topCaps, posts, rails,
      bezels, vents, activity, handles, status, links, glass,
    ]) {
      mesh.visible = visible;
    }
    if (!visible) return;

    // ---- one-time per-instance colouring -------------------------------
    if (!seeded.current) {
      seeded.current = true;
      for (let r = 0; r < rackCount; r++) {
        const v = variance[r];
        for (let s = 0; s < SLOT_COUNT; s++) {
          const i = r * SLOT_COUNT + s;
          scratch.color.set("#22272e").multiplyScalar(v.tint);
          bezels.setColorAt(i, scratch.color);
        }
        for (const sx of [0, 1]) {
          rails.setColorAt(
            r * 2 + sx,
            scratch.color.set(sx === 0 ? ACCENT_HEX.cyan : ACCENT_HEX.signal),
          );
        }
      }
      if (bezels.instanceColor) bezels.instanceColor.needsUpdate = true;
      if (rails.instanceColor) rails.instanceColor.needsUpdate = true;
    }

    // ---- rise / settle transforms --------------------------------------
    let dirty = false;

    const rampEnd = end - 0.015;
    for (let r = 0; r < rackCount; r++) {
      const place = placements[r];
      // smoothstep inverts when its start passes its end, which would show a
      // rack at full size the instant the reveal begins and then hide it.
      const rampStart = Math.min(start + place.delay, rampEnd - 0.008);
      const local = smoothstep(rampStart, rampEnd, p);

      // A settled rack costs nothing to hold.
      if (Math.abs(local - lastLocal.current[r]) < 0.0015) continue;
      lastLocal.current[r] = local;
      dirty = true;

      if (local <= 0.0005) {
        cabinets.setMatrixAt(r, scratch.hidden);
        plinths.setMatrixAt(r, scratch.hidden);
        topCaps.setMatrixAt(r, scratch.hidden);
        glass.setMatrixAt(r, scratch.hidden);
        posts.setMatrixAt(r * 2, scratch.hidden);
        posts.setMatrixAt(r * 2 + 1, scratch.hidden);
        rails.setMatrixAt(r * 2, scratch.hidden);
        rails.setMatrixAt(r * 2 + 1, scratch.hidden);
        for (let s = 0; s < SLOT_COUNT; s++) {
          const i = r * SLOT_COUNT + s;
          bezels.setMatrixAt(i, scratch.hidden);
          vents.setMatrixAt(i, scratch.hidden);
          activity.setMatrixAt(i, scratch.hidden);
          handles.setMatrixAt(i * 2, scratch.hidden);
          handles.setMatrixAt(i * 2 + 1, scratch.hidden);
          status.setMatrixAt(i, scratch.hidden);
          links.setMatrixAt(i, scratch.hidden);
        }
        continue;
      }

      scratch.euler.set(0, place.rotY, 0);
      scratch.quat.setFromEuler(scratch.euler);
      scratch.pos.set(place.x, THREE.MathUtils.lerp(-0.6, 0, local), place.z);
      scratch.scale.setScalar(THREE.MathUtils.lerp(0.86, 1, local));
      scratch.rack.compose(scratch.pos, scratch.quat, scratch.scale);

      const put = (
        mesh: THREE.InstancedMesh,
        index: number,
        localMatrix: THREE.Matrix4,
      ) => {
        scratch.out.multiplyMatrices(scratch.rack, localMatrix);
        mesh.setMatrixAt(index, scratch.out);
      };

      put(cabinets, r, locals.cabinet);
      put(plinths, r, locals.plinth);
      put(topCaps, r, locals.topCap);
      put(glass, r, locals.glass);
      put(posts, r * 2, locals.posts[0]);
      put(posts, r * 2 + 1, locals.posts[1]);
      put(rails, r * 2, locals.rails[0]);
      put(rails, r * 2 + 1, locals.rails[1]);

      for (let s = 0; s < SLOT_COUNT; s++) {
        const i = r * SLOT_COUNT + s;
        put(bezels, i, locals.bezel[s]);
        put(vents, i, locals.vent[s]);
        put(activity, i, locals.activity[s]);
        put(handles, i * 2, locals.handles[s * 2]);
        put(handles, i * 2 + 1, locals.handles[s * 2 + 1]);
        put(status, i, locals.statusLed[s]);
        put(links, i, locals.linkLed[s]);
      }
    }

    if (dirty) {
      for (const mesh of [
        cabinets, plinths, topCaps, posts, rails,
        bezels, vents, activity, handles, status, links, glass,
      ]) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // ---- live status LEDs ----------------------------------------------
    // The hall should look like it is running, not parked. One colour
    // buffer upload per frame covers every LED in every rack.
    const time = clock.elapsedTime;
    for (let r = 0; r < rackCount; r++) {
      const v = variance[r];
      const reveal = lastLocal.current[r];
      for (let s = 0; s < SLOT_COUNT; s++) {
        const i = r * SLOT_COUNT + s;
        const spec = SLOTS[s];
        const lit = !spec.blank && spec.jitter < v.litRatio && reveal > 0.35;

        if (!lit) {
          scratch.color.set("#0a0d11");
          status.setColorAt(i, scratch.color);
          links.setColorAt(i, scratch.color);
          activity.setColorAt(i, scratch.color.set("#0c1016"));
          continue;
        }

        const phase = spec.jitter * 6.28 + v.phase * 3.1;
        const beat =
          0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 5.4 + phase) * Math.cos(time * 2.1 + phase));
        scratch.accent.set(spec.accent);
        scratch.dim.copy(scratch.accent).multiplyScalar(0.16);
        scratch.color.copy(scratch.dim).lerp(scratch.accent, beat * reveal);
        status.setColorAt(i, scratch.color);

        // The lit face holds a steadier, dimmer glow than the blinking
        // indicators, pulled well off full accent so a row of them reads
        // as running hardware rather than coloured tape.
        scratch.accent.set(spec.accent).lerp(FACE_WASH, 0.55);
        scratch.dim.copy(scratch.accent).multiplyScalar(0.04);
        scratch.color
          .copy(scratch.dim)
          .lerp(scratch.accent, (0.055 + 0.03 * beat) * reveal);
        activity.setColorAt(i, scratch.color);

        const linkBeat = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 8.3 + phase * 2.2));
        scratch.accent.set(ACCENT_HEX.cyan);
        scratch.dim.copy(scratch.accent).multiplyScalar(0.12);
        scratch.color.copy(scratch.dim).lerp(scratch.accent, linkBeat * reveal);
        links.setColorAt(i, scratch.color);
      }
    }
    if (status.instanceColor) status.instanceColor.needsUpdate = true;
    if (links.instanceColor) links.instanceColor.needsUpdate = true;
    if (activity.instanceColor) activity.instanceColor.needsUpdate = true;
  });

  const n = Math.max(1, rackCount);
  const ns = Math.max(1, slotTotal);

  return (
    <group>
      {/* Cabinet shell */}
      <instancedMesh ref={cabinetRef} args={[undefined, undefined, n]} frustumCulled={false} visible={false}>
        <boxGeometry args={[RACK_TOTAL_WIDTH, RACK_TOTAL_HEIGHT, RACK_DEPTH]} />
        <meshStandardMaterial color="#191d23" metalness={0.42} roughness={0.62} />
      </instancedMesh>

      {/* Plinth / feet */}
      <instancedMesh ref={plinthRef} args={[undefined, undefined, n]} frustumCulled={false} visible={false}>
        <boxGeometry args={[RACK_TOTAL_WIDTH + 0.012, RACK_FEET_HEIGHT, RACK_DEPTH * 0.96]} />
        <meshStandardMaterial color="#08090c" metalness={0.5} roughness={0.72} />
      </instancedMesh>

      {/* Top cap / telemetry housing */}
      <instancedMesh ref={topCapRef} args={[undefined, undefined, n]} frustumCulled={false} visible={false}>
        <boxGeometry args={[RACK_TOTAL_WIDTH + 0.008, RACK_FRAME_TOP, RACK_DEPTH * 0.98]} />
        <meshStandardMaterial color="#1e2228" metalness={0.5} roughness={0.5} />
      </instancedMesh>

      {/* Front posts */}
      <instancedMesh ref={postRef} args={[undefined, undefined, n * 2]} frustumCulled={false} visible={false}>
        <boxGeometry args={[RACK_POST_WIDTH, RACK_INTERNAL_HEIGHT, 0.032]} />
        <meshStandardMaterial color="#272c33" metalness={0.5} roughness={0.45} />
      </instancedMesh>

      {/* Vertical rail accent strips (cyan left, signal right) */}
      <instancedMesh ref={railRef} args={[undefined, undefined, n * 2]} frustumCulled={false} visible={false}>
        <boxGeometry args={[0.0035, RAIL_H, 0.0025]} />
        <meshBasicMaterial transparent opacity={0.5} toneMapped={false} depthWrite={false} />
      </instancedMesh>

      {/* Equipment bezels — unit height, scaled per slot.
          Colour comes from instanceColor, which multiplies the material
          colour, so the material must stay white or the two darks square
          together into black. */}
      <instancedMesh ref={bezelRef} args={[undefined, undefined, ns]} frustumCulled={false} visible={false}>
        <boxGeometry args={[RACK_INNER_WIDTH, 1, BEZEL_DEPTH]} />
        <meshStandardMaterial color="#ffffff" metalness={0.34} roughness={0.6} />
      </instancedMesh>

      {/* Recessed vent grille across the bezel face */}
      <instancedMesh ref={ventRef} args={[undefined, undefined, ns]} frustumCulled={false} visible={false}>
        <boxGeometry args={[RACK_INNER_WIDTH * 0.62, 1, 0.005]} />
        <meshStandardMaterial color="#05070a" metalness={0.28} roughness={0.92} />
      </instancedMesh>

      {/* Lit equipment face — unlit material, so the aisle reads without
          depending on room lighting reaching this far out. */}
      <instancedMesh ref={activityRef} args={[undefined, undefined, ns]} frustumCulled={false} visible={false}>
        <boxGeometry args={[RACK_INNER_WIDTH * 0.5, 1, 0.004]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Drive / service handles at each end of every unit */}
      <instancedMesh ref={handleRef} args={[undefined, undefined, ns * 2]} frustumCulled={false} visible={false}>
        <boxGeometry args={[0.011, 1, 0.011]} />
        <meshStandardMaterial color="#8d9398" metalness={0.6} roughness={0.36} />
      </instancedMesh>

      {/* Status LEDs */}
      <instancedMesh ref={statusRef} args={[undefined, undefined, ns]} frustumCulled={false} visible={false}>
        <boxGeometry args={[0.0062, 0.0062, 0.0042]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Link LEDs */}
      <instancedMesh ref={linkRef} args={[undefined, undefined, ns]} frustumCulled={false} visible={false}>
        <boxGeometry args={[0.0048, 0.0048, 0.0038]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* Smoked glass front door */}
      <instancedMesh ref={glassRef} args={[undefined, undefined, n]} frustumCulled={false} visible={false} renderOrder={2}>
        <boxGeometry args={[RACK_INNER_WIDTH + 0.03, RACK_INTERNAL_HEIGHT, 0.004]} />
        <meshStandardMaterial
          color="#0b1219"
          metalness={0.92}
          roughness={0.08}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}
