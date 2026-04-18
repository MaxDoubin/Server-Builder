import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Rack } from "./Rack";
import { ServerChassis } from "./parts/ServerChassis";
import {
  RACK_FEET_HEIGHT,
  RACK_LAYOUT,
  RACK_TOTAL_HEIGHT,
  U,
  type GearSlot,
} from "./rackConfig";

export type StoryProgressRef = { current: number };

type StoryInsertion = {
  slot: GearSlot;
  start: number;
  end: number;
  fromX: number;
  fromZ: number;
  yaw: number;
};

type CameraKey = {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
};

const STORY_INSERTIONS: StoryInsertion[] = [
  {
    slot: RACK_LAYOUT.find((slot) => slot.u === 13)!,
    start: 0.06,
    end: 0.18,
    fromX: -1.22,
    fromZ: 0.22,
    yaw: 0.24,
  },
  {
    slot: RACK_LAYOUT.find((slot) => slot.u === 17)!,
    start: 0.30,
    end: 0.42,
    fromX: 1.26,
    fromZ: 0.12,
    yaw: -0.22,
  },
  {
    slot: RACK_LAYOUT.find((slot) => slot.u === 30)!,
    start: 0.54,
    end: 0.66,
    fromX: -1.18,
    fromZ: -0.06,
    yaw: 0.26,
  },
  {
    slot: RACK_LAYOUT.find((slot) => slot.u === 41)!,
    start: 0.78,
    end: 0.90,
    fromX: 1.24,
    fromZ: 0.18,
    yaw: -0.2,
  },
];

const STORY_LAYOUT = RACK_LAYOUT.filter(
  (slot) => !STORY_INSERTIONS.some((insertion) => insertion.slot.u === slot.u),
);

const CAMERA_KEYS: CameraKey[] = [
  {
    t: 0,
    pos: [0.05, RACK_TOTAL_HEIGHT * 0.57, 2.72],
    look: [0, RACK_TOTAL_HEIGHT * 0.52, 0],
    fov: 31,
  },
  {
    t: 0.24,
    pos: [1.4, RACK_TOTAL_HEIGHT * 0.68, 1.46],
    look: [0.04, RACK_TOTAL_HEIGHT * 0.62, 0],
    fov: 27,
  },
  {
    t: 0.5,
    pos: [-1.26, RACK_TOTAL_HEIGHT * 0.6, 1.08],
    look: [0, RACK_TOTAL_HEIGHT * 0.58, -0.01],
    fov: 28,
  },
  {
    t: 0.76,
    pos: [1.18, RACK_TOTAL_HEIGHT * 0.5, -1.02],
    look: [0, RACK_TOTAL_HEIGHT * 0.6, -0.04],
    fov: 29,
  },
  {
    t: 1,
    pos: [-0.88, RACK_TOTAL_HEIGHT * 0.72, 2.3],
    look: [0, RACK_TOTAL_HEIGHT * 0.6, 0],
    fov: 32,
  },
];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function interpolate(keys: CameraKey[], t: number) {
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const local = smoothstep(a.t, b.t, t);
      return {
        pos: [
          a.pos[0] + (b.pos[0] - a.pos[0]) * local,
          a.pos[1] + (b.pos[1] - a.pos[1]) * local,
          a.pos[2] + (b.pos[2] - a.pos[2]) * local,
        ] as [number, number, number],
        look: [
          a.look[0] + (b.look[0] - a.look[0]) * local,
          a.look[1] + (b.look[1] - a.look[1]) * local,
          a.look[2] + (b.look[2] - a.look[2]) * local,
        ] as [number, number, number],
        fov: a.fov + (b.fov - a.fov) * local,
      };
    }
  }
  return keys[0];
}

function StoryBackdrop() {
  const telemetryRows = Array.from({ length: 6 });
  const telemetryCols = Array.from({ length: 18 });

  return (
    <group>
      <mesh position={[0, RACK_TOTAL_HEIGHT * 0.56, -1.02]}>
        <planeGeometry args={[3.3, RACK_TOTAL_HEIGHT * 1.22]} />
        <meshBasicMaterial color="#05070d" transparent opacity={0.94} toneMapped={false} />
      </mesh>
      <mesh position={[0, RACK_TOTAL_HEIGHT * 0.56, -0.9]}>
        <planeGeometry args={[2.78, RACK_TOTAL_HEIGHT * 1.12]} />
        <meshBasicMaterial color="#070b11" transparent opacity={0.86} toneMapped={false} />
      </mesh>

      {[-1.26, 1.26].map((x, i) => (
        <group key={x} position={[x, RACK_TOTAL_HEIGHT * 0.58, -0.28]} rotation={[0, i === 0 ? 0.18 : -0.18, 0]}>
          <mesh>
            <planeGeometry args={[0.24, RACK_TOTAL_HEIGHT * 1.08]} />
            <meshBasicMaterial color="#0a0f17" transparent opacity={0.7} toneMapped={false} />
          </mesh>
          {Array.from({ length: 11 }).map((_, lineIndex) => (
            <mesh key={lineIndex} position={[0, -RACK_TOTAL_HEIGHT * 0.5 + lineIndex * (RACK_TOTAL_HEIGHT * 0.1), 0.002]}>
              <boxGeometry args={[0.18, 0.004, 0.002]} />
              <meshBasicMaterial
                color={lineIndex % 2 === 0 ? "#64e6ff" : "#c7f000"}
                transparent
                opacity={0.12}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      ))}

      {[-0.92, -0.48, 0, 0.48, 0.92].map((x, i) => (
        <mesh key={i} position={[x, RACK_TOTAL_HEIGHT * 0.56, -0.88]}>
          <boxGeometry args={[0.02, RACK_TOTAL_HEIGHT * 1.02, 0.02]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#64e6ff" : "#c7f000"}
            transparent
            opacity={0.12}
            toneMapped={false}
          />
        </mesh>
      ))}

      {telemetryRows.map((_, row) =>
        telemetryCols.map((__, col) => (
          <mesh
            key={`${row}-${col}`}
            position={[
              -0.78 + col * 0.092,
              RACK_TOTAL_HEIGHT * 0.24 + row * 0.17,
              -0.86,
            ]}
          >
            <boxGeometry args={[0.03, 0.003, 0.002]} />
            <meshBasicMaterial
              color={(row + col) % 4 === 0 ? "#c7f000" : "#64e6ff"}
              transparent
              opacity={(row + col) % 5 === 0 ? 0.2 : 0.1}
              toneMapped={false}
            />
          </mesh>
        )),
      )}

      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`ceiling-${i}`} position={[-0.84 + i * 0.24, RACK_TOTAL_HEIGHT + 0.08, -0.14]}>
          <boxGeometry args={[0.16, 0.01, 0.42]} />
          <meshStandardMaterial color="#11151b" metalness={0.62} roughness={0.48} />
        </mesh>
      ))}

      {[-0.36, 0.36].map((x, i) => (
        <mesh key={i} position={[x, 0.002, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.014, 2.1]} />
          <meshBasicMaterial
            color={i === 0 ? "#64e6ff" : "#c7f000"}
            transparent
            opacity={0.18}
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.0018, -0.08]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.38, 2.18]} />
        <meshBasicMaterial color="#10151d" transparent opacity={0.34} toneMapped={false} />
      </mesh>
      {Array.from({ length: 11 }).map((_, i) => (
        <mesh key={`cross-${i}`} position={[0, 0.0022, -0.96 + i * 0.19]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.78, 0.012]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#64e6ff" : "#c7f000"}
            transparent
            opacity={0.11}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function StorySweepLight() {
  const cyanRef = useRef<THREE.Mesh>(null);
  const brandRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const cyan = cyanRef.current;
    const brand = brandRef.current;
    if (!cyan || !brand) return;

    const cyanMaterial = cyan.material as THREE.MeshBasicMaterial;
    const brandMaterial = brand.material as THREE.MeshBasicMaterial;
    const t = clock.elapsedTime;

    cyan.position.y = RACK_TOTAL_HEIGHT * 0.26 + (Math.sin(t * 0.72) * 0.5 + 0.5) * (RACK_TOTAL_HEIGHT * 0.34);
    brand.position.y = RACK_TOTAL_HEIGHT * 0.18 + (Math.cos(t * 0.64) * 0.5 + 0.5) * (RACK_TOTAL_HEIGHT * 0.4);
    cyanMaterial.opacity = 0.05 + (Math.sin(t * 1.1) * 0.5 + 0.5) * 0.08;
    brandMaterial.opacity = 0.04 + (Math.cos(t * 0.96) * 0.5 + 0.5) * 0.07;
  });

  return (
    <group>
      <mesh ref={cyanRef} position={[0, RACK_TOTAL_HEIGHT * 0.46, -0.84]}>
        <planeGeometry args={[2.08, 0.22]} />
        <meshBasicMaterial color="#64e6ff" transparent opacity={0.08} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={brandRef} position={[0, RACK_TOTAL_HEIGHT * 0.34, -0.82]}>
        <planeGeometry args={[1.84, 0.18]} />
        <meshBasicMaterial color="#c7f000" transparent opacity={0.06} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function StoryCameraRig({ progressRef }: { progressRef: StoryProgressRef }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const targetRef = useRef(new THREE.Vector3());
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const clamped = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const key = interpolate(CAMERA_KEYS, clamped);
    const swayX = Math.sin(clock.elapsedTime * 0.32) * 0.015;
    const swayY = Math.cos(clock.elapsedTime * 0.28) * 0.012;

    tmpPos.set(key.pos[0] + swayX, key.pos[1] + swayY, key.pos[2]);
    tmpTarget.set(key.look[0], key.look[1], key.look[2]);

    camera.position.lerp(tmpPos, 0.12);
    targetRef.current.lerp(tmpTarget, 0.16);
    camera.lookAt(targetRef.current);
    if (Math.abs(camera.fov - key.fov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, key.fov, 0.14);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function SlidingServer({
  insertion,
  progressRef,
}: {
  insertion: StoryInsertion;
  progressRef: StoryProgressRef;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const targetY =
    RACK_FEET_HEIGHT + (insertion.slot.u - 1 + insertion.slot.size / 2) * U;

  useFrame(() => {
    if (!groupRef.current) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(insertion.start, insertion.end, p);
    const settle = smoothstep(insertion.end, insertion.end + 0.05, p);
    const overshoot = Math.sin(local * Math.PI) * 0.06 * (1 - settle);

    const x = THREE.MathUtils.lerp(insertion.fromX, 0, local) + overshoot * Math.sign(insertion.fromX) * -1;
    const z = THREE.MathUtils.lerp(insertion.fromZ, 0, local);
    const y = targetY + Math.sin(local * Math.PI) * 0.01 * (1 - settle);
    groupRef.current.position.set(x, y, z);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(insertion.yaw, 0, local);
    groupRef.current.visible = p >= insertion.start - 0.02;

    if (glowRef.current) {
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = p < insertion.start ? 0 : 0.08 + Math.sin(local * Math.PI) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={glowRef} position={[0, -insertion.slot.size * U * 0.48, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.42, 0.08]} />
        <meshBasicMaterial color="#c7f000" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <ServerChassis
        kind={insertion.slot.kind}
        sizeU={insertion.slot.size}
        accent={insertion.slot.accent}
        label={insertion.slot.label}
        seed={100 + insertion.slot.u}
      />
    </group>
  );
}

export function RackStoryCanvas({ progressRef }: { progressRef: StoryProgressRef }) {
  return (
    <Canvas
      dpr={[1, 2]}
      shadows={false}
      camera={{ position: [0, RACK_TOTAL_HEIGHT * 0.55, 2.6], fov: 31, near: 0.01, far: 50 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 2.4, 6.8]} />

      <ambientLight intensity={0.22} color="#c8d4e0" />
      <directionalLight position={[2.6, 3.2, 2.4]} intensity={2.2} color="#d7e4ff" />
      <directionalLight position={[-1.8, 0.8, 1.2]} intensity={0.42} color="#ffd1a1" />
      <directionalLight position={[-1.2, 2.4, -1.6]} intensity={0.52} color="#64e6ff" />
      <hemisphereLight args={["#2a3550", "#060812", 0.3]} />
      <pointLight position={[0, RACK_TOTAL_HEIGHT * 0.62, 0.45]} intensity={0.62} distance={1.8} color="#c7f000" />
      <pointLight position={[0, RACK_TOTAL_HEIGHT * 0.34, 0.5]} intensity={0.42} distance={1.4} color="#64e6ff" />
      <pointLight position={[0, RACK_TOTAL_HEIGHT * 0.76, -0.72]} intensity={0.28} distance={2.4} color="#ff9a1f" />

      <StoryBackdrop />
      <StorySweepLight />

      <Suspense fallback={null}>
        <group position={[0, 0, 0.02]}>
          <Rack layout={STORY_LAYOUT} />
          {STORY_INSERTIONS.map((insertion) => (
            <SlidingServer key={insertion.slot.u} insertion={insertion} progressRef={progressRef} />
          ))}
        </group>
      </Suspense>

      <StoryCameraRig progressRef={progressRef} />

      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.95, 72]} />
        <meshBasicMaterial color="#0a0c12" transparent opacity={0.45} />
      </mesh>
    </Canvas>
  );
}
