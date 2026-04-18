import { useMemo } from "react";
import * as THREE from "three";
import {
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_FRAME_TOP,
  RACK_INNER_WIDTH,
  RACK_INTERNAL_HEIGHT,
  RACK_POST_WIDTH,
  RACK_TOTAL_HEIGHT,
  RACK_TOTAL_WIDTH,
  RACK_UNITS,
  U,
} from "../rackConfig";

const POST_COLOR = "#1a1d21";
const FRAME_COLOR = "#0d0f11";
const HOLE_COLOR = "#06070a";
const BRAND_COLOR = "#c7f000";

function CageNutHoles({ side }: { side: "front" | "back" }) {
  // 3 mounting holes per U (standard EIA-310)
  const holes = useMemo(() => {
    const rows: Array<{ y: number; slot: number }> = [];
    for (let u = 0; u < RACK_UNITS; u++) {
      for (let h = 0; h < 3; h++) {
        const y =
          RACK_FEET_HEIGHT + u * U + U * 0.18 + h * (U * 0.32);
        rows.push({ y, slot: u });
      }
    }
    return rows;
  }, []);

  const z = side === "front" ? RACK_DEPTH / 2 - 0.001 : -RACK_DEPTH / 2 + 0.001;

  return (
    <group>
      {holes.map((hole, i) => (
        <group key={i}>
          {[-1, 1].map((dir) => (
            <mesh
              key={dir}
              position={[
                dir * (RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2 - 0.004),
                hole.y,
                z,
              ]}
            >
              <boxGeometry args={[0.006, 0.006, 0.002]} />
              <meshStandardMaterial color={HOLE_COLOR} roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function RackFrame() {
  const postH = RACK_INTERNAL_HEIGHT + RACK_FRAME_TOP;

  return (
    <group>
      {/* Floor tile (subtle) */}
      <mesh
        receiveShadow
        position={[0, 0.0001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial
          color="#07080a"
          metalness={0.1}
          roughness={0.9}
        />
      </mesh>

      {/* Feet */}
      {[
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ].map(([sx, sz], i) => (
        <mesh
          key={i}
          position={[
            (sx * (RACK_TOTAL_WIDTH / 2)) - sx * 0.012,
            RACK_FEET_HEIGHT / 2,
            (sz * (RACK_DEPTH / 2)) - sz * 0.012,
          ]}
          castShadow
        >
          <boxGeometry args={[0.04, RACK_FEET_HEIGHT, 0.04]} />
          <meshStandardMaterial color={POST_COLOR} metalness={0.7} roughness={0.5} />
        </mesh>
      ))}

      {/* Four posts */}
      {[
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ].map(([sx, sz], i) => (
        <mesh
          key={i}
          position={[
            sx * (RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2),
            RACK_FEET_HEIGHT + postH / 2,
            sz * (RACK_DEPTH / 2 - RACK_POST_WIDTH / 2),
          ]}
          castShadow
        >
          <boxGeometry args={[RACK_POST_WIDTH, postH, RACK_POST_WIDTH]} />
          <meshStandardMaterial
            color={POST_COLOR}
            metalness={0.75}
            roughness={0.45}
          />
        </mesh>
      ))}

      {/* Top cap */}
      <mesh
        position={[0, RACK_TOTAL_HEIGHT - RACK_FRAME_TOP / 2, 0]}
        castShadow
      >
        <boxGeometry
          args={[RACK_TOTAL_WIDTH + 0.01, RACK_FRAME_TOP, RACK_DEPTH + 0.01]}
        />
        <meshStandardMaterial
          color={FRAME_COLOR}
          metalness={0.75}
          roughness={0.55}
        />
      </mesh>

      {/* Base bracket */}
      <mesh position={[0, RACK_FEET_HEIGHT, 0]}>
        <boxGeometry args={[RACK_TOTAL_WIDTH + 0.005, 0.015, RACK_DEPTH - 0.04]} />
        <meshStandardMaterial color={FRAME_COLOR} metalness={0.7} roughness={0.6} />
      </mesh>

      {/* Side panels (semi) */}
      {[-1, 1].map((sx) => (
        <mesh
          key={sx}
          position={[
            sx * (RACK_TOTAL_WIDTH / 2),
            RACK_FEET_HEIGHT + postH / 2,
            0,
          ]}
          castShadow
        >
          <boxGeometry args={[0.005, postH - 0.02, RACK_DEPTH - 0.08]} />
          <meshStandardMaterial
            color="#111316"
            metalness={0.55}
            roughness={0.6}
            transparent
            opacity={0.88}
          />
        </mesh>
      ))}

      <CageNutHoles side="front" />
      <CageNutHoles side="back" />

      {/* Brand plate on top */}
      <group position={[0, RACK_TOTAL_HEIGHT - RACK_FRAME_TOP / 2 + 0.001, RACK_DEPTH / 2 - 0.06]}>
        <mesh>
          <boxGeometry args={[0.26, 0.012, 0.04]} />
          <meshStandardMaterial color="#0b0d10" metalness={0.6} roughness={0.5} />
        </mesh>
        <mesh position={[-0.08, 0.01, 0]}>
          <boxGeometry args={[0.006, 0.006, 0.006]} />
          <meshStandardMaterial
            color={BRAND_COLOR}
            emissive={BRAND_COLOR}
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Front lip trim */}
      {[-1, 1].map((sx) => (
        <mesh
          key={sx}
          position={[
            sx * (RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2),
            RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT + 0.004,
            RACK_DEPTH / 2 - RACK_POST_WIDTH / 2 + 0.001,
          ]}
        >
          <boxGeometry args={[RACK_POST_WIDTH + 0.004, 0.008, 0.008]} />
          <meshStandardMaterial
            color={BRAND_COLOR}
            emissive={BRAND_COLOR}
            emissiveIntensity={0.6}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Static rail geometry shared across servers when needed. */
export const rackMaterials = {
  blackMetal: new THREE.MeshStandardMaterial({
    color: "#14171b",
    metalness: 0.72,
    roughness: 0.4,
  }),
  darkMetal: new THREE.MeshStandardMaterial({
    color: "#0c0e11",
    metalness: 0.78,
    roughness: 0.5,
  }),
  bezel: new THREE.MeshStandardMaterial({
    color: "#1a1d22",
    metalness: 0.6,
    roughness: 0.65,
  }),
  silver: new THREE.MeshStandardMaterial({
    color: "#707679",
    metalness: 0.85,
    roughness: 0.3,
  }),
};
