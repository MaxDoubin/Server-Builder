import { Suspense, useMemo, useReducer, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { RackFrame } from "./parts/RackFrame";
import { ServerChassis } from "./parts/ServerChassis";
import { PDU } from "./parts/PDU";
import { Cables } from "./parts/Cables";
import { ServerInternals, INTERNAL_LABELS } from "./parts/ServerInternals";
import {
  RACK_FEET_HEIGHT,
  RACK_LAYOUT,
  RACK_TOTAL_HEIGHT,
  RACK_TOTAL_WIDTH,
  U,
  type GearSlot,
} from "./rackConfig";
import { useDeviceTier, type DeviceTier } from "@/lib/motion/useDeviceTier";

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

const CAM_KEYS: Key[] = [
  { t: 0.00, pos: [-0.55, RACK_MID_Y + 0.18, 2.85], look: [0, RACK_MID_Y + 0.05, 0], fov: 32 },
  { t: 0.10, pos: [0.40, RACK_MID_Y + 0.10, 2.70], look: [0, RACK_MID_Y + 0.05, 0], fov: 32 },
  { t: 0.18, pos: [1.10, RACK_MID_Y + 0.05, 2.40], look: [0, RACK_MID_Y * 0.92, 0], fov: 33 },
  { t: 0.28, pos: [1.25, RACK_MID_Y * 0.62, 2.20], look: [0, RACK_MID_Y * 0.55, 0], fov: 34 },
  { t: 0.36, pos: [1.05, RACK_MID_Y * 0.48, 2.10], look: [0, RACK_MID_Y * 0.50, 0], fov: 34 },
  { t: 0.44, pos: [-0.40, FOCUS_SLOT.u * U + 0.20, 2.20], look: [0, FOCUS_SLOT.u * U + 0.10, 0.30], fov: 34 },
  { t: 0.54, pos: [-0.95, FOCUS_SLOT.u * U + 0.18, 2.00], look: [0, FOCUS_SLOT.u * U + 0.05, 0.65], fov: 34 },
  { t: 0.62, pos: [-1.20, FOCUS_SLOT.u * U + 0.55, 1.85], look: [0, FOCUS_SLOT.u * U + 0.20, 0.60], fov: 36 },
  { t: 0.70, pos: [1.10, FOCUS_SLOT.u * U + 0.55, 1.85], look: [0, FOCUS_SLOT.u * U + 0.20, 0.60], fov: 36 },
  { t: 0.80, pos: [0.30, RACK_MID_Y * 0.65, 2.40], look: [0, RACK_MID_Y * 0.55, 0], fov: 35 },
  { t: 0.92, pos: [1.40, RACK_MID_Y + 1.20, 5.20], look: [0, RACK_MID_Y * 0.5, 0], fov: 42 },
  { t: 1.00, pos: [2.40, RACK_MID_Y + 2.40, 8.20], look: [0, RACK_MID_Y * 0.4, 0], fov: 48 },
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

function CameraRig({ progressRef }: { progressRef: ContinuousProgressRef }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const lookRef = useRef(new THREE.Vector3(0, RACK_MID_Y, 0));

  useFrame(({ clock }) => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const k = sampleKey(p);

    const swayScale = p > 0.54 && p < 0.74 ? 0.0025 : 0.008;
    const sway = Math.sin(clock.elapsedTime * 0.32) * swayScale;
    const swayY = Math.cos(clock.elapsedTime * 0.27) * swayScale * 0.6;

    tmpPos.set(k.pos[0] + sway, k.pos[1] + swayY, k.pos[2]);
    tmpLook.set(k.look[0], k.look[1], k.look[2]);

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

const PULL_START = 0.38;
const PULL_END = 0.52;
const EXPLODE_START = 0.54;
const EXPLODE_END = 0.70;
const REASSEMBLE_END = 0.82;

function FocusServer({ progressRef }: { progressRef: ContinuousProgressRef }) {
  const slidGroup = useRef<THREE.Group>(null);
  const chassisGroup = useRef<THREE.Group>(null);
  const internalsGroup = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const targetY = RACK_FEET_HEIGHT + (FOCUS_SLOT.u - 1 + FOCUS_SLOT.size / 2) * U;
  const explodeRef = useRef(0);

  useFrame(() => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const out = smoothstep(PULL_START, PULL_END, p);
    const back = smoothstep(EXPLODE_END, REASSEMBLE_END, p);

    const slideZ = THREE.MathUtils.lerp(0, 0.95, out) * (1 - back);

    if (slidGroup.current) {
      slidGroup.current.position.set(0, targetY, slideZ);
    }

    if (innerRef.current) {
      const orbitP = smoothstep(EXPLODE_START + 0.02, EXPLODE_END - 0.04, p);
      innerRef.current.rotation.y = THREE.MathUtils.lerp(
        0,
        -Math.PI * 0.18,
        orbitP * (1 - back),
      );
    }

    const explodeP =
      smoothstep(EXPLODE_START, EXPLODE_END, p) * (1 - back);
    explodeRef.current = explodeP;
    const showInternals = p > EXPLODE_START - 0.02 && p < REASSEMBLE_END + 0.02;

    if (chassisGroup.current) {
      chassisGroup.current.visible = explodeP < 0.05;
    }
    if (internalsGroup.current) {
      internalsGroup.current.visible = showInternals;
    }

    const labelOpacity =
      explodeP > 0.25 ? Math.min(1, (explodeP - 0.25) / 0.25) : 0;
    INTERNAL_LABELS.forEach((l) => {
      const el = labelRefs.current[l.id];
      if (!el) return;
      el.style.opacity = String(labelOpacity);
    });
  });

  return (
    <group ref={slidGroup} position={[0, targetY, 0]}>
      <group ref={innerRef}>
        <group ref={chassisGroup}>
          <ServerChassis
            kind={FOCUS_SLOT.kind}
            sizeU={FOCUS_SLOT.size}
            accent={FOCUS_SLOT.accent}
            label={FOCUS_SLOT.label}
            seed={42}
          />
        </group>
        <group ref={internalsGroup} visible={false}>
          <ExplodeBridge progressRef={progressRef} />
          {INTERNAL_LABELS.map((l) => (
            <Html
              key={l.id}
              position={l.anchor}
              distanceFactor={1.6}
              style={{ pointerEvents: "none" }}
              wrapperClass="cinematic-label"
            >
              <div
                ref={(el) => {
                  labelRefs.current[l.id] = el;
                }}
                style={{
                  opacity: 0,
                  transition: "opacity 0.32s linear",
                  transform: "translate(12px, -50%)",
                  whiteSpace: "nowrap",
                  fontFamily: "'Space Grotesk', monospace",
                  fontSize: "10px",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "hsl(40 16% 92%)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "3px 9px",
                  background: "hsl(220 40% 4% / 0.78)",
                  border: "1px solid hsl(72 100% 50% / 0.22)",
                  borderRadius: "2px",
                  backdropFilter: "blur(4px)",
                }}
              >
                <span
                  style={{
                    height: "1px",
                    width: "22px",
                    background: "hsl(72 100% 50% / 0.85)",
                    boxShadow: "0 0 6px hsl(72 100% 50%)",
                  }}
                />
                <span>
                  <span style={{ color: "hsl(72 100% 50%)", fontWeight: 600 }}>{l.label}</span>
                  {l.sublabel ? (
                    <span
                      style={{
                        display: "block",
                        color: "hsl(40 8% 72%)",
                        marginTop: "2px",
                        fontSize: "8px",
                        letterSpacing: "0.2em",
                      }}
                    >
                      {l.sublabel}
                    </span>
                  ) : null}
                </span>
              </div>
            </Html>
          ))}
        </group>
      </group>
    </group>
  );
}

function ExplodeBridge({ progressRef }: { progressRef: ContinuousProgressRef }) {
  const ref = useRef<THREE.Group>(null);
  const lastExplode = useRef(-1);
  const explodeNow = useRef(0);
  const [, setBump] = useStateBump();

  useFrame(() => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const back = smoothstep(EXPLODE_END, REASSEMBLE_END, p);
    const e = smoothstep(EXPLODE_START, EXPLODE_END, p) * (1 - back);
    explodeNow.current = e;
    const quantized = Math.round(e * 32) / 32;
    if (quantized !== lastExplode.current) {
      lastExplode.current = quantized;
      setBump();
    }
  });

  return (
    <group ref={ref} scale={[0.34, 0.46, 0.34]} position={[0, 0, 0]}>
      <ServerInternals explode={lastExplode.current === -1 ? 0 : lastExplode.current} />
    </group>
  );
}

function useStateBump() {
  return useReducer((x: number) => x + 1, 0);
}

const HALL_START = 0.84;
const HALL_END = 1.0;

const RACK_SPACING = RACK_TOTAL_WIDTH + 0.05;
const AISLE = 1.3;

function NeighbourRack({
  position,
  rotationY = 0,
  progressRef,
  delay = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
  progressRef: ContinuousProgressRef;
  delay?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(HALL_START + delay, HALL_END - 0.04, p);
    groupRef.current.visible = local > 0.005;
    groupRef.current.position.y = THREE.MathUtils.lerp(-0.6, 0, local);
    const s = THREE.MathUtils.lerp(0.86, 1, local);
    groupRef.current.scale.setScalar(s);
  });

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]} visible={false}>
      <RackFrame />
      {RACK_LAYOUT.map((slot, i) => {
        const centerY = RACK_FEET_HEIGHT + (slot.u - 1 + slot.size / 2) * U;
        return (
          <group key={`${slot.u}-${i}`} position={[0, centerY, 0]}>
            <ServerChassis
              kind={slot.kind}
              sizeU={slot.size}
              accent={slot.accent}
              label={slot.label}
              seed={i + 100}
            />
          </group>
        );
      })}
      <PDU side="right" />
      <PDU side="left" />
    </group>
  );
}

function HallFloor({ progressRef }: { progressRef: ContinuousProgressRef }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(HALL_START - 0.05, HALL_END, p);
    const m = ref.current.material as THREE.MeshBasicMaterial;
    m.opacity = 0.0 + local * 0.55;
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
    const local = smoothstep(HALL_START + 0.015, HALL_END, p);
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

function HallContents({ progressRef, tier }: { progressRef: ContinuousProgressRef; tier: DeviceTier }) {
  const racks = useMemo(() => {
    const out: Array<{ x: number; z: number; rotY: number; delay: number }> = [];
    const sameRowSpan = tier === "low" ? 2 : tier === "mid" ? 3 : 4;
    const oppositeSpan = tier === "low" ? 2 : tier === "mid" ? 3 : 4;
    for (let i = 1; i <= sameRowSpan; i++) {
      out.push({ x: i * RACK_SPACING, z: 0, rotY: 0, delay: i * 0.005 });
      out.push({ x: -i * RACK_SPACING, z: 0, rotY: 0, delay: i * 0.005 });
    }
    for (let i = -oppositeSpan; i <= oppositeSpan; i++) {
      out.push({
        x: i * RACK_SPACING,
        z: -AISLE,
        rotY: Math.PI,
        delay: 0.03 + Math.abs(i) * 0.005,
      });
    }
    return out;
  }, [tier]);

  return (
    <group>
      <HallFloor progressRef={progressRef} />
      <HallGrid progressRef={progressRef} />
      <HallSignalField progressRef={progressRef} tier={tier} />
      {racks.map((r, i) => (
        <NeighbourRack
          key={`hall-${i}`}
          position={[r.x, 0, r.z]}
          rotationY={r.rotY}
          progressRef={progressRef}
          delay={r.delay}
        />
      ))}
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
        <FocusServer progressRef={progressRef} />
        <HallContents progressRef={progressRef} tier={tier} />
      </Suspense>

      <CameraRig progressRef={progressRef} />

      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, effects ? 64 : 32]} />
        <meshBasicMaterial color="#0a0c12" transparent opacity={0.45} />
      </mesh>
    </Canvas>
  );
}
