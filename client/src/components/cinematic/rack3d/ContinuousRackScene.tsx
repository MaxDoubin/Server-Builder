import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RackFrame } from "./parts/RackFrame";
import { ServerChassis } from "./parts/ServerChassis";
import { PDU } from "./parts/PDU";
import { Cables } from "./parts/Cables";
import { FocusUnrack } from "./unrack/FocusUnrack";
import { NARROW_PULL_DOLLY, NARROW_PULL_LOOK_DROP, NARROW_PULL_LOOK_LEFT, heroCameraKey, narrowDollyWeight, narrowPullWeight } from "./unrack/unrackTimeline";
import { HallRacks, type HallRackPlacement } from "./parts/HallRacks";
import {
  RACK_FEET_HEIGHT,
  RACK_LAYOUT,
  RACK_TOTAL_HEIGHT,
  RACK_TOTAL_WIDTH,
  U,
  type GearSlot,
} from "./rackConfig";
import { useDeviceTier, type DeviceTier } from "@/lib/motion/useDeviceTier";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

export type ContinuousProgressRef = { current: number };

const FOCUS_SLOT: GearSlot = {
  u: 9,
  size: 2,
  kind: "server-2u",
  label: "PVE · Compute 01",
  accent: "signal",
};

const INSTALL_TARGETS = new Set([13, 14, 15, 21, 33, 38]);

const BASE_LAYOUT = RACK_LAYOUT.filter(
  (s) => !INSTALL_TARGETS.has(s.u) && s.u !== FOCUS_SLOT.u,
);
const INSTALL_LAYOUT = RACK_LAYOUT.filter((s) => INSTALL_TARGETS.has(s.u));

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function easeInOut(x: number) {
  return x * x * (3 - 2 * x);
}

type Key = {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
};

const RACK_MID_Y = RACK_TOTAL_HEIGHT * 0.5;

// The exploded view is looked at from where the teardown page looks at it.
const HERO_KEY = heroCameraKey(RACK_FEET_HEIGHT + (FOCUS_SLOT.u - 1 + FOCUS_SLOT.size / 2) * U);

const CAM_KEYS: Key[] = [
  { t: 0.00, pos: [-0.55, RACK_MID_Y + 0.18, 2.85], look: [0, RACK_MID_Y + 0.05, 0], fov: 32 },
  { t: 0.10, pos: [0.40, RACK_MID_Y + 0.10, 2.70], look: [0, RACK_MID_Y + 0.05, 0], fov: 32 },
  { t: 0.18, pos: [1.10, RACK_MID_Y + 0.05, 2.40], look: [0, RACK_MID_Y * 0.92, 0], fov: 33 },
  { t: 0.28, pos: [1.25, RACK_MID_Y * 0.62, 2.20], look: [0, RACK_MID_Y * 0.55, 0], fov: 34 },
  { t: 0.36, pos: [1.05, RACK_MID_Y * 0.48, 2.10], look: [0, RACK_MID_Y * 0.50, 0], fov: 34 },
  // Unrack beat. The camera comes to rest exactly where the server does
  // (unrackTimeline: out on its rails at 0.47, hero pose at 0.535, fully
  // exploded at 0.69), and frames it clear of the section copy, which sits
  // on the right while the server slides out and top center while it is apart.
  { t: 0.47, pos: [-1.20, FOCUS_SLOT.u * U + 0.60, 2.25], look: [0.55, FOCUS_SLOT.u * U + 0.12, 0.55], fov: 34 },
  { t: 0.535, ...HERO_KEY },
  { t: 0.69, ...HERO_KEY },
  { t: 0.80, pos: [0.15, RACK_MID_Y * 0.72, 2.32], look: [0, RACK_MID_Y * 0.56, 0.06], fov: 34 },
  { t: 0.90, pos: [0.62, RACK_MID_Y * 0.92, 2.95], look: [0.02, RACK_MID_Y * 0.58, -0.02], fov: 36 },
  { t: 0.96, pos: [1.10, RACK_MID_Y + 0.62, 3.72], look: [0.04, RACK_MID_Y * 0.56, -0.12], fov: 38 },
  { t: 1.00, pos: [1.48, RACK_MID_Y + 0.96, 4.48], look: [0.08, RACK_MID_Y * 0.54, -0.22], fov: 40 },
];

function sampleKey(t: number): Key {
  if (t <= CAM_KEYS[0].t) return CAM_KEYS[0];
  if (t >= CAM_KEYS[CAM_KEYS.length - 1].t) return CAM_KEYS[CAM_KEYS.length - 1];
  for (let i = 0; i < CAM_KEYS.length - 1; i++) {
    const a = CAM_KEYS[i];
    const b = CAM_KEYS[i + 1];
    if (t >= a.t && t <= b.t) {
      const e = easeInOut((t - a.t) / Math.max(1e-6, b.t - a.t));
      return {
        t,
        pos: [
          a.pos[0] + (b.pos[0] - a.pos[0]) * e,
          a.pos[1] + (b.pos[1] - a.pos[1]) * e,
          a.pos[2] + (b.pos[2] - a.pos[2]) * e,
        ],
        look: [
          a.look[0] + (b.look[0] - a.look[0]) * e,
          a.look[1] + (b.look[1] - a.look[1]) * e,
          a.look[2] + (b.look[2] - a.look[2]) * e,
        ],
        fov: a.fov + (b.fov - a.fov) * e,
      };
    }
  }
  return CAM_KEYS[0];
}

const tmpPos = new THREE.Vector3();
const tmpLook = new THREE.Vector3();
const tmpDolly = new THREE.Vector3();

function CameraRig({
  progressRef,
  reducedMotion,
}: {
  progressRef: ContinuousProgressRef;
  reducedMotion: boolean;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const lookRef = useRef(new THREE.Vector3(0, RACK_MID_Y, 0));

  useFrame(({ clock }) => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const k = sampleKey(p);

    // Idle drift is the one motion here that runs with no input at all, so it
    // is the one a reduced-motion visitor most needs gone: the static layout
    // still shows this rack, and it would otherwise float forever.
    const swayScale = reducedMotion ? 0 : p > 0.54 && p < 0.74 ? 0.0025 : 0.007;
    const sway = Math.sin(clock.elapsedTime * 0.32) * swayScale;
    const swayY = Math.cos(clock.elapsedTime * 0.27) * swayScale * 0.6;

    tmpPos.set(k.pos[0] + sway, k.pos[1] + swayY, k.pos[2]);
    tmpLook.set(k.look[0], k.look[1], k.look[2]);

    // Portrait screens only: see narrowPullWeight and narrowDollyWeight.
    const dolly = narrowDollyWeight(p, camera.aspect);
    if (dolly > 0) {
      const aim = narrowPullWeight(p, camera.aspect);
      tmpPos.addScaledVector(tmpDolly.subVectors(tmpPos, tmpLook), dolly * NARROW_PULL_DOLLY);
      tmpLook.y -= aim * NARROW_PULL_LOOK_DROP;
      tmpLook.x -= aim * NARROW_PULL_LOOK_LEFT;
    }

    camera.position.lerp(tmpPos, 0.15);
    lookRef.current.lerp(tmpLook, 0.18);
    camera.lookAt(lookRef.current);

    if (Math.abs(camera.fov - k.fov) > 0.04) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, k.fov, 0.12);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

type Insertion = {
  slot: GearSlot;
  start: number;
  end: number;
  side: 1 | -1;
};

const INSTALL_BEAT_START = 0.16;
const INSTALL_BEAT_END = 0.36;

function buildInsertions(): Insertion[] {
  const ordered = [...INSTALL_LAYOUT].sort((a, b) => b.u - a.u);
  const span = INSTALL_BEAT_END - INSTALL_BEAT_START;
  const winSize = 0.06;
  return ordered.map((slot, i) => {
    const start =
      INSTALL_BEAT_START + (i / Math.max(1, ordered.length - 1)) * (span - winSize);
    return {
      slot,
      start,
      end: Math.min(INSTALL_BEAT_END, start + winSize),
      side: i % 2 === 0 ? 1 : -1,
    };
  });
}

function SlidingServer({
  insertion,
  progressRef,
  seed,
}: {
  insertion: Insertion;
  progressRef: ContinuousProgressRef;
  seed: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const railRef = useRef<THREE.Mesh>(null);
  const targetY =
    RACK_FEET_HEIGHT + (insertion.slot.u - 1 + insertion.slot.size / 2) * U;
  const fromX = insertion.side * 1.15;

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(insertion.start, insertion.end, p);
    const settle = smoothstep(insertion.end, insertion.end + 0.025, p);

    g.position.x = THREE.MathUtils.lerp(fromX, 0, local);
    g.position.y = targetY + Math.sin(local * Math.PI) * 0.005 * (1 - settle);
    g.position.z = THREE.MathUtils.lerp(0.10, 0, local);
    g.rotation.y = THREE.MathUtils.lerp(insertion.side * -0.16, 0, local);
    g.visible = p >= insertion.start - 0.01;

    if (railRef.current) {
      const m = railRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = local > 0 && settle < 1 ? 0.22 * (1 - settle) : 0;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh
        ref={railRef}
        position={[0, -insertion.slot.size * U * 0.48, 0.12]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.46, 0.07]} />
        <meshBasicMaterial
          color="#c7f000"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <ServerChassis
        kind={insertion.slot.kind}
        sizeU={insertion.slot.size}
        accent={insertion.slot.accent}
        label={insertion.slot.label}
        seed={seed}
      />
    </group>
  );
}

const HALL_START = 0.90;
const HALL_END = 0.995;

const RACK_SPACING = RACK_TOTAL_WIDTH + 0.05;
const AISLE = 1.3;

function HallFloor({ progressRef }: { progressRef: ContinuousProgressRef }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(HALL_START - 0.02, HALL_END, p);
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = local * 0.55;
    ref.current.visible = local > 0.001;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <planeGeometry args={[28, 28]} />
      <meshBasicMaterial
        color="#06080c"
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
}

function HallGrid({ progressRef }: { progressRef: ContinuousProgressRef }) {
  const ref = useRef<THREE.GridHelper>(null);
  useFrame(() => {
    if (!ref.current) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(HALL_START, HALL_END, p);
    (ref.current.material as THREE.LineBasicMaterial).opacity = local * 0.45;
    (ref.current.material as THREE.LineBasicMaterial).transparent = true;
    ref.current.visible = local > 0.001;
  });
  return (
    <gridHelper
      ref={ref}
      args={[24, 40, "#0d1218", "#0a0e13"]}
      position={[0, 0.0025, 0]}
    />
  );
}

function HallSignalField({ progressRef, tier }: { progressRef: ContinuousProgressRef; tier: DeviceTier }) {
  const groupRef = useRef<THREE.Group>(null);
  const laneMarkers = tier === "low" ? 6 : tier === "mid" ? 10 : 14;
  const ceilingRuns = tier === "low" ? 3 : tier === "mid" ? 5 : 7;

  useFrame(() => {
    if (!groupRef.current) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(HALL_START + 0.01, HALL_END, p);
    groupRef.current.visible = local > 0.005;
    groupRef.current.position.y = THREE.MathUtils.lerp(-0.18, 0, local);
    const s = THREE.MathUtils.lerp(0.95, 1, local);
    groupRef.current.scale.setScalar(s);
  });

  return (
    <group ref={groupRef} visible={false}>
      {[-0.34, -AISLE + 0.34].map((z, index) => (
        <mesh key={`lane-${index}`} position={[0, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[18, 0.018]} />
          <meshBasicMaterial
            color={index === 0 ? "#64e6ff" : "#c7f000"}
            transparent
            opacity={0.16}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      {Array.from({ length: laneMarkers }).map((_, i) => (
        <mesh
          key={`marker-${i}`}
          position={[-10.8 + i * (21.6 / Math.max(1, laneMarkers - 1)), 0.0045, -AISLE / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.16, 1.82]} />
          <meshBasicMaterial color="#0e151f" transparent opacity={0.11} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: ceilingRuns }).map((_, i) => (
        <mesh key={`ceiling-${i}`} position={[0, 2.42, -0.28 + i * 0.10]}>
          <boxGeometry args={[7.4, 0.008, 0.01]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#64e6ff" : "#c7f000"}
            transparent
            opacity={0.16}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh position={[0, 1.98, -3.4]}>
        <planeGeometry args={[10, 2.8]} />
        <meshBasicMaterial color="#0c1117" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Aisle lighting for the hall reveal.
 *
 * Every other light in this scene is parked on the hero rack with a
 * `distance` of 1.2-2.4m, which is correct for the close-up beats but
 * leaves the hall unlit when the camera pulls back. These fade in with
 * the reveal so the rows read as a room rather than a black field, and
 * fade back out so they never wash out the earlier close-ups.
 */
function HallLighting({ progressRef }: { progressRef: ContinuousProgressRef }) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRefs = useRef<Array<THREE.PointLight | null>>([]);
  const ambientRef = useRef<THREE.HemisphereLight>(null);

  const rig = useMemo(
    () => [
      { position: [0, 2.6, 0.9] as [number, number, number], color: "#cfe0ff", intensity: 2.6, distance: 9 },
      { position: [-3.4, 2.5, 0.4] as [number, number, number], color: "#9fd8ff", intensity: 2.0, distance: 8 },
      { position: [3.4, 2.5, 0.4] as [number, number, number], color: "#9fd8ff", intensity: 2.0, distance: 8 },
      { position: [0, 2.3, -2.6] as [number, number, number], color: "#c7f000", intensity: 1.1, distance: 7 },
    ],
    [],
  );

  useFrame(() => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(HALL_START - 0.03, HALL_END, p);
    const on = local > 0.002;
    if (groupRef.current) groupRef.current.visible = on;
    if (!on) return;
    rig.forEach((cfg, i) => {
      const light = lightRefs.current[i];
      if (light) light.intensity = cfg.intensity * local;
    });
    if (ambientRef.current) ambientRef.current.intensity = 0.5 * local;
  });

  return (
    <group ref={groupRef} visible={false}>
      <hemisphereLight ref={ambientRef} args={["#4a5b7d", "#070910", 0]} />
      {rig.map((cfg, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lightRefs.current[i] = el;
          }}
          position={cfg.position}
          color={cfg.color}
          intensity={0}
          distance={cfg.distance}
          decay={1.6}
        />
      ))}
    </group>
  );
}

function HallContents({ progressRef, tier }: { progressRef: ContinuousProgressRef; tier: DeviceTier }) {
  /**
   * Rack placements for the hall reveal.
   *
   * Every rack here is drawn by the shared `HallRacks` instancer, so the
   * whole hall is a fixed ~11 draw calls regardless of how many racks are
   * placed. That is what lets the aisle run deep enough to read as a real
   * datacenter instead of a token row of three.
   */
  const racks = useMemo<HallRackPlacement[]>(() => {
    const out: HallRackPlacement[] = [];
    const rowSpan = tier === "low" ? 5 : tier === "mid" ? 7 : 9;
    // Rows behind the aisle recede into the fog, so they can be deeper.
    const rows: Array<{ z: number; rotY: number; base: number }> = [
      { z: 0, rotY: 0, base: 0 },
      { z: -AISLE, rotY: Math.PI, base: 0.022 },
      { z: -AISLE - 2.15, rotY: 0, base: 0.04 },
      { z: -AISLE * 2 - 2.15, rotY: Math.PI, base: 0.052 },
    ];

    for (const row of rows) {
      for (let i = -rowSpan; i <= rowSpan; i++) {
        // The hero rack already occupies the origin.
        if (row.z === 0 && i === 0) continue;
        out.push({
          x: i * RACK_SPACING,
          z: row.z,
          rotY: row.rotY,
          delay: row.base + Math.abs(i) * 0.004,
        });
      }
    }
    return out;
  }, [tier]);

  return (
    <group>
      <HallFloor progressRef={progressRef} />
      <HallGrid progressRef={progressRef} />
      <HallSignalField progressRef={progressRef} tier={tier} />
      <HallLighting progressRef={progressRef} />
      <HallRacks
        placements={racks}
        progressRef={progressRef}
        start={HALL_START}
        end={HALL_END}
      />
    </group>
  );
}

function HeroRack() {
  return (
    <group>
      <RackFrame />
      {BASE_LAYOUT.map((slot, i) => {
        const centerY = RACK_FEET_HEIGHT + (slot.u - 1 + slot.size / 2) * U;
        return (
          <group key={`${slot.u}-${i}`} position={[0, centerY, 0]}>
            <ServerChassis
              kind={slot.kind}
              sizeU={slot.size}
              accent={slot.accent}
              label={slot.label}
              seed={i + 1}
            />
          </group>
        );
      })}
      <PDU side="right" />
      <PDU side="left" />
      <Cables />
    </group>
  );
}

export function ContinuousRackScene({
  progressRef,
}: {
  progressRef: ContinuousProgressRef;
}) {
  const { dpr, effects, tier } = useDeviceTier();
  const reducedMotion = useReducedMotion();
  const insertions = useMemo(buildInsertions, []);

  return (
    <Canvas
      dpr={dpr}
      shadows={false}
      performance={{ min: 0.6, debounce: 200 }}
      camera={{
        position: [-0.55, RACK_MID_Y + 0.18, 2.85],
        fov: 32,
        near: 0.01,
        far: 80,
      }}
      gl={{
        antialias: tier !== "low",
        alpha: true,
        powerPreference: "high-performance",
        stencil: false,
      }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 4.0, 18.0]} />

      <directionalLight position={[2.5, 3.0, 2.2]} intensity={2.0} color="#d7e4ff" />
      <directionalLight position={[-1.5, 0.6, 1.5]} intensity={0.34} color="#ffd1a1" />
      <directionalLight position={[-1.2, 2.4, -1.6]} intensity={0.42} color="#64e6ff" />
      <hemisphereLight args={["#2a3550", "#060812", 0.28]} />

      {effects && (
        <>
          <pointLight
            position={[0, RACK_TOTAL_HEIGHT * 0.62, 0.6]}
            intensity={0.55}
            distance={1.8}
            color="#c7f000"
          />
          <pointLight
            position={[0, RACK_TOTAL_HEIGHT * 0.32, 0.6]}
            intensity={0.38}
            distance={1.4}
            color="#64e6ff"
          />
          <pointLight
            position={[0.4, RACK_TOTAL_HEIGHT * 0.92, -0.2]}
            intensity={0.22}
            distance={2.4}
            color="#64e6ff"
          />
          <pointLight
            position={[-0.35, RACK_TOTAL_HEIGHT * 0.12, 0.45]}
            intensity={0.18}
            distance={1.2}
            color="#ff9a1f"
          />
        </>
      )}

      <Suspense fallback={null}>
        <HeroRack />
        {insertions.map((insertion, i) => (
          <SlidingServer
            key={`ins-${insertion.slot.u}`}
            insertion={insertion}
            progressRef={progressRef}
            seed={200 + i}
          />
        ))}
        <FocusUnrack slot={FOCUS_SLOT} progressRef={progressRef} tier={tier} reducedMotion={reducedMotion} />
        <HallContents progressRef={progressRef} tier={tier} />
      </Suspense>

      <CameraRig progressRef={progressRef} reducedMotion={reducedMotion} />

      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, effects ? 64 : 32]} />
        <meshBasicMaterial color="#0a0c12" transparent opacity={0.45} />
      </mesh>
    </Canvas>
  );
}
