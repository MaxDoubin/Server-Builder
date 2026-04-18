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
import { Led, LedStrip } from "./Led";

const POST_COLOR = "#1a1d21";
const FRAME_COLOR = "#0d0f11";
const HOLE_COLOR = "#06070a";
const BRAND_COLOR = "#c7f000";
const CYAN_COLOR = "#64e6ff";

function CageNutHoles({ side }: { side: "front" | "back" }) {
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

function FrontRailAccent({ side, color, seed }: { side: -1 | 1; color: string; seed: number }) {
  return (
    <group
      position={[
        side * (RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2 - 0.004),
        RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT / 2,
        RACK_DEPTH / 2 + 0.003,
      ]}
      rotation={[0, 0, Math.PI / 2]}
    >
      <LedStrip count={24} length={RACK_INTERNAL_HEIGHT - 0.08} color={color} size={0.0028} seed={seed} />
    </group>
  );
}

function FrontDoorOutline() {
  const w = RACK_TOTAL_WIDTH + 0.008;
  const h = RACK_INTERNAL_HEIGHT + RACK_FRAME_TOP - 0.02;
  const z = RACK_DEPTH / 2 + 0.0035;
  const y = RACK_FEET_HEIGHT + h / 2;

  return (
    <group>
      <mesh position={[0, y + h / 2 - 0.006, z]}>
        <boxGeometry args={[w, 0.004, 0.004]} />
        <meshBasicMaterial color={BRAND_COLOR} transparent opacity={0.32} toneMapped={false} />
      </mesh>
      <mesh position={[0, RACK_FEET_HEIGHT + 0.008, z]}>
        <boxGeometry args={[w, 0.004, 0.004]} />
        <meshBasicMaterial color={CYAN_COLOR} transparent opacity={0.18} toneMapped={false} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (w / 2 - 0.002), y, z]}>
          <boxGeometry args={[0.004, h, 0.004]} />
          <meshBasicMaterial color={sx < 0 ? CYAN_COLOR : BRAND_COLOR} transparent opacity={0.22} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function FrontDoorGlass() {
  const w = RACK_TOTAL_WIDTH - 0.012;
  const h = RACK_INTERNAL_HEIGHT + RACK_FRAME_TOP - 0.04;
  const z = RACK_DEPTH / 2 + 0.0012;
  const y = RACK_FEET_HEIGHT + h / 2 + 0.004;

  return (
    <group>
      <mesh position={[0, y, z]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#101820" transparent opacity={0.025} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, y + h * 0.18, z + 0.0008]}>
        <planeGeometry args={[w * 0.8, h * 0.16]} />
        <meshBasicMaterial color={CYAN_COLOR} transparent opacity={0.035} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, y - h * 0.22, z + 0.0008]}>
        <planeGeometry args={[w * 0.88, h * 0.08]} />
        <meshBasicMaterial color={BRAND_COLOR} transparent opacity={0.028} depthWrite={false} toneMapped={false} />
      </mesh>
      <group position={[w / 2 - 0.052, y + h * 0.08, z + 0.004]}>
        <mesh>
          <boxGeometry args={[0.01, h * 0.34, 0.01]} />
          <meshStandardMaterial color="#171b20" metalness={0.82} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0, 0.004]}>
          <boxGeometry args={[0.002, h * 0.26, 0.002]} />
          <meshBasicMaterial color={BRAND_COLOR} transparent opacity={0.2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function InnerCrossmembers() {
  const levels = [0.16, 0.34, 0.54, 0.74, 0.9];
  const depthPositions = [RACK_DEPTH / 2 - 0.12, -RACK_DEPTH / 2 + 0.12];

  return (
    <group>
      {levels.map((level) => {
        const y = RACK_FEET_HEIGHT + level * RACK_INTERNAL_HEIGHT;
        return depthPositions.map((z, index) => (
          <mesh key={`${level}-${index}`} position={[0, y, z]}>
            <boxGeometry args={[RACK_INNER_WIDTH + 0.018, 0.006, 0.018]} />
            <meshStandardMaterial color="#13171c" metalness={0.66} roughness={0.46} />
          </mesh>
        ));
      })}
    </group>
  );
}

function RearServiceChannels() {
  const channelH = RACK_INTERNAL_HEIGHT - 0.12;
  const channelY = RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT / 2;
  const channelZ = -RACK_DEPTH / 2 + 0.08;

  return (
    <group>
      {[-1, 1].map((sx, index) => (
        <group key={sx} position={[sx * (RACK_INNER_WIDTH / 2 - 0.05), channelY, channelZ]}>
          <mesh>
            <boxGeometry args={[0.028, channelH, 0.022]} />
            <meshStandardMaterial color="#0f1318" metalness={0.42} roughness={0.72} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.016, channelH - 0.04, 0.003]} />
            <meshBasicMaterial color={index === 0 ? CYAN_COLOR : BRAND_COLOR} transparent opacity={0.12} toneMapped={false} />
          </mesh>
          {Array.from({ length: 8 }).map((_, i) => (
            <mesh key={i} position={[0, -channelH / 2 + 0.08 + i * 0.2, 0.015]}>
              <boxGeometry args={[0.022, 0.004, 0.006]} />
              <meshStandardMaterial color="#1a2026" metalness={0.62} roughness={0.36} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function TopLiftHandles() {
  return (
    <group position={[0, RACK_TOTAL_HEIGHT + 0.006, RACK_DEPTH / 2 - 0.12]}>
      {[-0.14, 0.14].map((x, index) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[-0.018, 0, 0]}>
            <boxGeometry args={[0.006, 0.03, 0.012]} />
            <meshStandardMaterial color="#1e2329" metalness={0.78} roughness={0.28} />
          </mesh>
          <mesh position={[0.018, 0, 0]}>
            <boxGeometry args={[0.006, 0.03, 0.012]} />
            <meshStandardMaterial color="#1e2329" metalness={0.78} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0.012, 0]}>
            <boxGeometry args={[0.042, 0.006, 0.012]} />
            <meshStandardMaterial color="#252b32" metalness={0.82} roughness={0.24} />
          </mesh>
          <mesh position={[0, 0.016, 0.005]}>
            <boxGeometry args={[0.03, 0.002, 0.002]} />
            <meshBasicMaterial color={index === 0 ? CYAN_COLOR : BRAND_COLOR} transparent opacity={0.18} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TopTelemetryArray() {
  return (
    <group position={[0, RACK_TOTAL_HEIGHT - RACK_FRAME_TOP / 2 + 0.014, -0.03]}>
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} position={[-0.18 + i * 0.06, 0, 0]}>
          <boxGeometry args={[0.036, 0.004, 0.34]} />
          <meshStandardMaterial color="#101317" metalness={0.64} roughness={0.46} />
        </mesh>
      ))}
      <group position={[0, 0.006, 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <LedStrip count={12} length={0.28} color={CYAN_COLOR} size={0.0022} seed={25} />
      </group>
      <group position={[0, 0.006, -0.18]} rotation={[0, 0, Math.PI / 2]}>
        <LedStrip count={12} length={0.28} color={BRAND_COLOR} size={0.0022} seed={31} />
      </group>
    </group>
  );
}

function LowerServiceBayGlow() {
  return (
    <group position={[0, RACK_FEET_HEIGHT + 0.022, RACK_DEPTH / 2 - 0.075]}>
      <mesh>
        <boxGeometry args={[RACK_INNER_WIDTH - 0.08, 0.022, 0.022]} />
        <meshStandardMaterial color="#0a0d11" metalness={0.42} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.006, 0.012]}>
        <boxGeometry args={[RACK_INNER_WIDTH - 0.12, 0.0028, 0.002]} />
        <meshBasicMaterial color={CYAN_COLOR} transparent opacity={0.2} toneMapped={false} />
      </mesh>
      <group position={[0, -0.003, 0.012]}>
        <LedStrip count={18} length={RACK_INNER_WIDTH - 0.16} color={BRAND_COLOR} size={0.0021} seed={17} />
      </group>
    </group>
  );
}

function FootAnchorPads() {
  return (
    <group>
      {[
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ].map(([sx, sz], i) => (
        <group
          key={i}
          position={[
            (sx * (RACK_TOTAL_WIDTH / 2)) - sx * 0.012,
            0.003,
            (sz * (RACK_DEPTH / 2)) - sz * 0.012,
          ]}
        >
          <mesh>
            <boxGeometry args={[0.06, 0.006, 0.06]} />
            <meshStandardMaterial color="#111419" metalness={0.44} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.0035, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.002, 12]} />
            <meshStandardMaterial color="#2b3036" metalness={0.78} roughness={0.24} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function RackFrame() {
  const postH = RACK_INTERNAL_HEIGHT + RACK_FRAME_TOP;

  return (
    <group>
      <mesh
        receiveShadow
        position={[0, 0.0001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial
          color="#07080a"
          metalness={0.12}
          roughness={0.92}
        />
      </mesh>
      <mesh position={[0, 0.0012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.2, 64]} />
        <meshBasicMaterial color="#0d1118" transparent opacity={0.34} toneMapped={false} />
      </mesh>
      {[-0.22, 0.22].map((x, index) => (
        <mesh key={`floor-guide-${index}`} position={[x, 0.0018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.012, 1.48]} />
          <meshBasicMaterial color={index === 0 ? CYAN_COLOR : BRAND_COLOR} transparent opacity={0.28} toneMapped={false} />
        </mesh>
      ))}

      <FootAnchorPads />

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
            metalness={0.78}
            roughness={0.42}
          />
        </mesh>
      ))}

      <mesh
        position={[0, RACK_TOTAL_HEIGHT - RACK_FRAME_TOP / 2, 0]}
        castShadow
      >
        <boxGeometry
          args={[RACK_TOTAL_WIDTH + 0.01, RACK_FRAME_TOP, RACK_DEPTH + 0.01]}
        />
        <meshStandardMaterial
          color={FRAME_COLOR}
          metalness={0.78}
          roughness={0.52}
        />
      </mesh>

      <mesh position={[0, RACK_FEET_HEIGHT, 0]}>
        <boxGeometry args={[RACK_TOTAL_WIDTH + 0.005, 0.015, RACK_DEPTH - 0.04]} />
        <meshStandardMaterial color={FRAME_COLOR} metalness={0.72} roughness={0.58} />
      </mesh>

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
            metalness={0.58}
            roughness={0.58}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}

      <InnerCrossmembers />
      <RearServiceChannels />
      <TopLiftHandles />
      <CageNutHoles side="front" />
      <CageNutHoles side="back" />

      <FrontRailAccent side={-1} color={CYAN_COLOR} seed={2} />
      <FrontRailAccent side={1} color={BRAND_COLOR} seed={9} />
      <FrontDoorOutline />
      <FrontDoorGlass />
      <TopTelemetryArray />
      <LowerServiceBayGlow />

      <group position={[0, RACK_TOTAL_HEIGHT - RACK_FRAME_TOP / 2 + 0.001, RACK_DEPTH / 2 - 0.06]}>
        <mesh>
          <boxGeometry args={[0.26, 0.012, 0.04]} />
          <meshStandardMaterial color="#0b0d10" metalness={0.62} roughness={0.48} />
        </mesh>
        <mesh position={[0, -0.012, 0.019]}>
          <boxGeometry args={[0.22, 0.0025, 0.002]} />
          <meshBasicMaterial color={BRAND_COLOR} transparent opacity={0.42} toneMapped={false} />
        </mesh>
        <group position={[-0.09, 0.01, 0]}>
          <Led color={BRAND_COLOR} size={0.004} blink seed={0.1} />
        </group>
        <group position={[-0.072, 0.01, 0]}>
          <Led color={CYAN_COLOR} size={0.0035} blink seed={0.42} />
        </group>
        <group position={[0.09, 0.01, 0]}>
          <Led color={BRAND_COLOR} size={0.004} blink seed={0.72} />
        </group>
      </group>

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
            color={sx < 0 ? CYAN_COLOR : BRAND_COLOR}
            emissive={sx < 0 ? CYAN_COLOR : BRAND_COLOR}
            emissiveIntensity={0.7}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

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
