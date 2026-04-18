import { useMemo } from "react";
import * as THREE from "three";
import {
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_INNER_WIDTH,
  RACK_INTERNAL_HEIGHT,
  RACK_POST_WIDTH,
} from "../rackConfig";

type CableSpec = {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  radius?: number;
  emissive?: number;
};

function CableTube({ spec }: { spec: CableSpec }) {
  const { from, to, color, radius = 0.0012, emissive = 0.06 } = spec;

  const curve = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const sag = start.distanceTo(end) * 0.28;
    const c1 = mid.clone().add(new THREE.Vector3(0, -sag * 0.6, 0));
    const c2 = mid.clone().add(new THREE.Vector3(0, -sag * 0.8, 0));
    return new THREE.CubicBezierCurve3(start, c1, c2, end);
  }, [from, to]);

  const geo = useMemo(
    () => new THREE.TubeGeometry(curve, 28, radius, 8, false),
    [curve, radius],
  );

  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.8} metalness={0.05} />
    </mesh>
  );
}

/** Loose patch cables running from switch area down the side to the rear/front. */
export function Cables() {
  const rightX = RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2 - 0.006;
  const leftX = -RACK_INNER_WIDTH / 2 - RACK_POST_WIDTH / 2 + 0.006;

  const bundles: CableSpec[] = useMemo(() => {
    const arr: CableSpec[] = [];
    const colors = ["#1f3a55", "#4a1f3a", "#3a5520", "#1f553f", "#551f1f", "#37375a", "#264653", "#5b6c2f"];
    const switchY = RACK_FEET_HEIGHT + 14 * 0.04445;

    for (let i = 0; i < 14; i++) {
      const targetU = 7 + (i * 3) % 28;
      arr.push({
        from: [
          rightX - 0.005,
          switchY + (i % 2 === 0 ? 0.012 : -0.012),
          RACK_DEPTH / 2 - 0.02 - (i % 3) * 0.008,
        ],
        to: [
          rightX - 0.005,
          RACK_FEET_HEIGHT + targetU * 0.04445,
          -RACK_DEPTH / 2 + 0.08 + (i % 4) * 0.01,
        ],
        color: colors[i % colors.length],
        radius: 0.00115,
        emissive: 0.08,
      });
    }

    for (let i = 0; i < 10; i++) {
      const sourceY = RACK_FEET_HEIGHT + (32 + (i % 8)) * 0.04445;
      const targetY = RACK_FEET_HEIGHT + (18 + i) * 0.04445;
      arr.push({
        from: [leftX + 0.02, sourceY, RACK_DEPTH / 2 - 0.018],
        to: [leftX + 0.02, targetY, RACK_DEPTH / 2 - 0.06 - (i % 3) * 0.01],
        color: i % 2 === 0 ? "#64e6ff" : "#c7f000",
        radius: 0.00105,
        emissive: 0.18,
      });
    }

    return arr;
  }, [leftX, rightX]);

  return (
    <group>
      {bundles.map((c, i) => (
        <CableTube key={i} spec={c} />
      ))}
      <mesh
        position={[
          0,
          RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT - 0.006,
          -RACK_DEPTH / 2 + 0.09,
        ]}
      >
        <boxGeometry args={[RACK_INNER_WIDTH, 0.012, 0.02]} />
        <meshStandardMaterial color="#0a0c0f" metalness={0.4} roughness={0.85} />
      </mesh>
      <mesh
        position={[
          0,
          RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT - 0.016,
          -RACK_DEPTH / 2 + 0.105,
        ]}
      >
        <boxGeometry args={[RACK_INNER_WIDTH - 0.06, 0.003, 0.003]} />
        <meshBasicMaterial color="#64e6ff" transparent opacity={0.22} toneMapped={false} />
      </mesh>
    </group>
  );
}
