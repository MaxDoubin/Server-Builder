import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Rack } from "./Rack";
import {
  RACK_FEET_HEIGHT,
  RACK_INTERNAL_HEIGHT,
  RACK_TOTAL_HEIGHT,
  RACK_TOTAL_WIDTH,
} from "./rackConfig";

export type DcProgressRef = { current: number };

const AISLE_WIDTH = 1.2; // between rack rows
const RACK_SPACING = RACK_TOTAL_WIDTH + 0.04;
const ROW_COUNT = 2;
const PER_ROW = 10;

function DcRig({ progressRef }: { progressRef: DcProgressRef }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const targetRef = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    const p = Math.max(0, Math.min(1, progressRef.current ?? 0));

    // Start in-aisle close to one rack, pull back and rise to overhead
    const startPos = new THREE.Vector3(0, RACK_TOTAL_HEIGHT * 0.55, (PER_ROW / 2) * RACK_SPACING - 0.4);
    const midPos = new THREE.Vector3(1.8, RACK_TOTAL_HEIGHT * 0.9, (PER_ROW / 2) * RACK_SPACING + 2.5);
    const endPos = new THREE.Vector3(0, 7.5, (PER_ROW / 2) * RACK_SPACING + 6.5);

    const s1 = Math.min(p / 0.5, 1);
    const s2 = Math.max(0, (p - 0.5) / 0.5);

    const pos = new THREE.Vector3().copy(startPos).lerp(midPos, s1).lerp(endPos, s2);
    const sway = Math.sin(clock.elapsedTime * 0.25) * 0.012;
    camera.position.lerp(new THREE.Vector3(pos.x + sway, pos.y, pos.z), 0.09);

    const startTgt = new THREE.Vector3(0, RACK_TOTAL_HEIGHT * 0.5, 0);
    const endTgt = new THREE.Vector3(0, 0, 0);
    const target = startTgt.clone().lerp(endTgt, p);
    targetRef.current.lerp(target, 0.12);
    camera.lookAt(targetRef.current);

    const fov = 32 + p * 14;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, fov, 0.15);
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function RackRow({ z, flipped }: { z: number; flipped: boolean }) {
  const racks = useMemo(() => Array.from({ length: PER_ROW }), []);
  return (
    <group position={[0, 0, z]} rotation={[0, flipped ? Math.PI : 0, 0]}>
      {racks.map((_, i) => {
        const x = (i - (PER_ROW - 1) / 2) * RACK_SPACING;
        return (
          <group key={i} position={[x, 0, 0]}>
            <Rack />
          </group>
        );
      })}
    </group>
  );
}

/** Overhead cable tray that runs the length of the aisle. */
function CableTray() {
  const length = PER_ROW * RACK_SPACING + 0.2;
  const y = RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT + 0.18;
  return (
    <group>
      {/* Two trays, one above each row */}
      {[-AISLE_WIDTH / 2 - RACK_TOTAL_WIDTH / 4, AISLE_WIDTH / 2 + RACK_TOTAL_WIDTH / 4].map((z, i) => (
        <group key={i} position={[0, y, z]}>
          <mesh>
            <boxGeometry args={[length, 0.02, 0.16]} />
            <meshStandardMaterial color="#0a0c10" metalness={0.4} roughness={0.75} />
          </mesh>
          {/* Tie-bars */}
          {Array.from({ length: PER_ROW + 1 }).map((__, ii) => (
            <mesh key={ii} position={[(ii - PER_ROW / 2) * RACK_SPACING, 0.006, 0]}>
              <boxGeometry args={[0.01, 0.012, 0.18]} />
              <meshStandardMaterial color="#0a0c10" metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Floor with perforated-tile grid pattern. */
function DcFloor() {
  const size = Math.max(PER_ROW * RACK_SPACING + 4, 14);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#050608" metalness={0.25} roughness={0.9} />
      </mesh>
      {/* Raised-floor grout lines */}
      <gridHelper args={[size, size / 0.6, "#0c1014", "#0c1014"]} position={[0, 0.001, 0]} />
    </group>
  );
}

/** Overhead spotlights along the aisle. */
function AisleLights() {
  const length = PER_ROW * RACK_SPACING;
  const count = 5;
  return (
    <group>
      {Array.from({ length: count }).map((_, i) => {
        const x = (i - (count - 1) / 2) * (length / count);
        return (
          <group key={i} position={[x, 3.2, 0]}>
            <mesh>
              <boxGeometry args={[0.3, 0.02, 0.08]} />
              <meshStandardMaterial color="#0a0c10" metalness={0.7} roughness={0.4} />
            </mesh>
            <pointLight position={[0, -0.1, 0]} intensity={0.7} distance={4.0} color="#d0e3ff" decay={1.5} />
            {/* Glowing panel */}
            <mesh position={[0, -0.012, 0]}>
              <boxGeometry args={[0.28, 0.002, 0.07]} />
              <meshBasicMaterial color="#e6f1ff" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function DatacenterScene({ progressRef }: { progressRef: DcProgressRef }) {
  const rowGap = AISLE_WIDTH;
  const rows = useMemo(
    () =>
      Array.from({ length: ROW_COUNT }).map((_, i) => ({
        z: (i - (ROW_COUNT - 1) / 2) * rowGap,
        flipped: i === 1,
      })),
    [rowGap],
  );

  return (
    <Canvas
      dpr={[1, 2]}
      shadows={false}
      camera={{ position: [0, RACK_TOTAL_HEIGHT * 0.55, 3.0], fov: 32, near: 0.02, far: 60 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <color attach="background" args={["#03040a"]} />
      <fog attach="fog" args={["#03040a", 5.0, 22.0]} />

      <hemisphereLight args={["#2a3550", "#050608", 0.2]} />
      <directionalLight position={[4, 6, 4]} intensity={0.5} color="#bccbff" />

      <Suspense fallback={null}>
        <DcFloor />
        {rows.map((r, i) => (
          <RackRow key={i} z={r.z} flipped={r.flipped} />
        ))}
        <CableTray />
        <AisleLights />
      </Suspense>

      <DcRig progressRef={progressRef} />
    </Canvas>
  );
}
