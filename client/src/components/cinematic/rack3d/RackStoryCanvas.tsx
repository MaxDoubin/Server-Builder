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
import { useDeviceTier } from "@/lib/motion/useDeviceTier";

export type StoryProgressRef = { current: number };

type StoryInsertion = {
  slot: GearSlot;
  start: number;
  end: number;
};

/**
 * Camera is locked. Nearly every slot in the rack is racked in over the
 * course of the scroll — small servers first, heavy gear later — so the
 * viewer actually sees the rack being built up unit by unit.
 *
 * Start/end progress values are spread across 0..0.92 so the assembly
 * completes comfortably before the scene unpins.
 */
function buildInsertions(): StoryInsertion[] {
  const ordered = [...RACK_LAYOUT].sort((a, b) => a.u - b.u);
  const spacing = 0.92 / ordered.length;
  const windowSize = 0.1;
  return ordered.map((slot, i) => {
    const start = i * spacing;
    return {
      slot,
      start,
      end: Math.min(0.96, start + windowSize),
    };
  });
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function StoryBackdrop() {
  return (
    <group>
      {/* Deep back wall */}
      <mesh position={[0, RACK_TOTAL_HEIGHT * 0.56, -1.1]}>
        <planeGeometry args={[3.6, RACK_TOTAL_HEIGHT * 1.3]} />
        <meshBasicMaterial color="#04060b" transparent opacity={0.96} toneMapped={false} />
      </mesh>
      {/* Telemetry wall detail */}
      <mesh position={[0, RACK_TOTAL_HEIGHT * 0.56, -0.98]}>
        <planeGeometry args={[2.82, RACK_TOTAL_HEIGHT * 1.14]} />
        <meshBasicMaterial color="#070b11" transparent opacity={0.86} toneMapped={false} />
      </mesh>
      {/* Vertical accent rails behind the rack */}
      {[-0.92, -0.48, 0, 0.48, 0.92].map((x, i) => (
        <mesh key={i} position={[x, RACK_TOTAL_HEIGHT * 0.56, -0.96]}>
          <boxGeometry args={[0.018, RACK_TOTAL_HEIGHT * 1.02, 0.018]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#64e6ff" : "#c7f000"}
            transparent
            opacity={0.1}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Floor disc */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.95, 72]} />
        <meshBasicMaterial color="#0a0c12" transparent opacity={0.5} />
      </mesh>
      {/* Floor crosshatch */}
      {Array.from({ length: 11 }).map((_, i) => (
        <mesh
          key={`cross-${i}`}
          position={[0, 0.0022, -0.96 + i * 0.19]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.82, 0.01]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? "#64e6ff" : "#c7f000"}
            transparent
            opacity={0.09}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Camera locked dead-center front of the rack. No panning, no orbit.
 * Holds a subtle breathe-in/out on position.y so the image still feels
 * alive without ever losing sight of what's being racked.
 */
function LockedCamera() {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const targetRef = useRef(new THREE.Vector3(0, RACK_TOTAL_HEIGHT * 0.52, 0));

  useFrame(({ clock }) => {
    const breathe = Math.sin(clock.elapsedTime * 0.25) * 0.008;
    camera.position.set(0, RACK_TOTAL_HEIGHT * 0.52 + breathe, 2.2);
    camera.lookAt(targetRef.current);
    if (Math.abs(camera.fov - 34) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, 34, 0.2);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/**
 * One server sliding into its rack slot from the right.
 *
 * Per-insertion animation:
 *   - before `start`: hidden
 *   - [start..end]: slides from offset -> rack center, rotation aligns to 0
 *   - after `end`: locked in place, drive-bay LEDs in the chassis take over
 */
function SlidingServer({
  insertion,
  progressRef,
  seed,
}: {
  insertion: StoryInsertion;
  progressRef: StoryProgressRef;
  seed: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const targetY =
    RACK_FEET_HEIGHT + (insertion.slot.u - 1 + insertion.slot.size / 2) * U;
  // Slide in from the right. Large gear (blade, GPU) uses a shorter
  // offset so it doesn't swing into the camera.
  const fromX = insertion.slot.size >= 4 ? 0.9 : 1.2;

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const local = smoothstep(insertion.start, insertion.end, p);
    const settle = smoothstep(insertion.end, insertion.end + 0.04, p);
    const lift = Math.sin(local * Math.PI) * 0.006 * (1 - settle);

    group.position.x = THREE.MathUtils.lerp(fromX, 0, local);
    group.position.y = targetY + lift;
    group.position.z = THREE.MathUtils.lerp(0.12, 0, local);
    // Slight yaw during travel, straightens on dock
    group.rotation.y = THREE.MathUtils.lerp(-0.18, 0, local);
    group.visible = p >= insertion.start - 0.01;

    if (glowRef.current) {
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      // Rail glow under the chassis while it's in motion
      material.opacity = p < insertion.start || settle >= 0.98
        ? 0
        : 0.18 * (1 - settle) + 0.04;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh
        ref={glowRef}
        position={[0, -insertion.slot.size * U * 0.48, 0.14]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.46, 0.08]} />
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

export function RackStoryCanvas({ progressRef }: { progressRef: StoryProgressRef }) {
  const { dpr, effects, tier } = useDeviceTier();
  const insertions = useMemo(buildInsertions, []);

  return (
    <Canvas
      dpr={dpr}
      shadows={false}
      camera={{
        position: [0, RACK_TOTAL_HEIGHT * 0.52, 2.2],
        fov: 34,
        near: 0.01,
        far: 40,
      }}
      gl={{
        antialias: tier !== "low",
        alpha: true,
        powerPreference: "high-performance",
      }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#04050a"]} />
      <fog attach="fog" args={["#04050a", 2.2, 6.2]} />

      <ambientLight intensity={0.24} color="#c8d4e0" />
      <directionalLight position={[2.6, 3.2, 2.4]} intensity={2.2} color="#d7e4ff" />
      <directionalLight position={[-1.8, 0.8, 1.2]} intensity={0.42} color="#ffd1a1" />
      <directionalLight position={[-1.2, 2.4, -1.6]} intensity={0.52} color="#64e6ff" />
      <hemisphereLight args={["#2a3550", "#060812", 0.3]} />
      {effects && (
        <>
          <pointLight
            position={[0, RACK_TOTAL_HEIGHT * 0.62, 0.45]}
            intensity={0.6}
            distance={1.8}
            color="#c7f000"
          />
          <pointLight
            position={[0, RACK_TOTAL_HEIGHT * 0.34, 0.5]}
            intensity={0.42}
            distance={1.4}
            color="#64e6ff"
          />
        </>
      )}

      <StoryBackdrop />

      <Suspense fallback={null}>
        <group position={[0, 0, 0.02]}>
          {/* Empty rack with no gear — gear slides in from the side. */}
          <Rack layout={[]} />
          {insertions.map((insertion, i) => (
            <SlidingServer
              key={insertion.slot.u}
              insertion={insertion}
              progressRef={progressRef}
              seed={100 + i}
            />
          ))}
        </group>
      </Suspense>

      <LockedCamera />
    </Canvas>
  );
}
