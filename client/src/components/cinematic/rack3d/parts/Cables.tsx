import { useMemo } from "react";
import * as THREE from "three";
import {
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_INNER_WIDTH,
  RACK_INTERNAL_HEIGHT,
  RACK_POST_WIDTH,
  U,
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

function CableComb({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.024, 0.036, 0.01]} />
        <meshStandardMaterial color="#14181d" metalness={0.38} roughness={0.82} />
      </mesh>
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[0, -0.012 + i * 0.006, 0.004]}>
          <boxGeometry args={[0.018, 0.0016, 0.002]} />
          <meshStandardMaterial color="#252a31" metalness={0.54} roughness={0.46} />
        </mesh>
      ))}
    </group>
  );
}

/** Loose patch cables running from switch areas into the side and rear cable paths. */
export function Cables() {
  const rightX = RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2 - 0.006;
  const leftX = -RACK_INNER_WIDTH / 2 - RACK_POST_WIDTH / 2 + 0.006;

  const bundles: CableSpec[] = useMemo(() => {
    const arr: CableSpec[] = [];
    const mutedColors = ["#1f3a55", "#4a1f3a", "#3a5520", "#1f553f", "#551f1f", "#37375a", "#264653", "#5b6c2f"];
    const liveColors = ["#64e6ff", "#c7f000", "#ff9a1f"];
    const switchAY = RACK_FEET_HEIGHT + 14 * U;
    const switchBY = RACK_FEET_HEIGHT + 15 * U;
    const patchPanels = [16, 32, 37, 40];

    for (let i = 0; i < 22; i++) {
      const targetU = 7 + (i * 2) % 32;
      arr.push({
        from: [
          rightX - 0.005,
          switchAY + (i % 2 === 0 ? 0.012 : -0.012),
          RACK_DEPTH / 2 - 0.02 - (i % 4) * 0.008,
        ],
        to: [
          rightX - 0.006,
          RACK_FEET_HEIGHT + targetU * U,
          -RACK_DEPTH / 2 + 0.08 + (i % 5) * 0.012,
        ],
        color: mutedColors[i % mutedColors.length],
        radius: 0.00115,
        emissive: 0.08,
      });
    }

    for (let i = 0; i < 14; i++) {
      const sourceY = RACK_FEET_HEIGHT + (31 + (i % 9)) * U;
      const targetY = RACK_FEET_HEIGHT + (18 + i) * U;
      arr.push({
        from: [leftX + 0.02, sourceY, RACK_DEPTH / 2 - 0.018],
        to: [leftX + 0.02, targetY, RACK_DEPTH / 2 - 0.06 - (i % 3) * 0.01],
        color: i % 2 === 0 ? "#64e6ff" : "#c7f000",
        radius: 0.00105,
        emissive: 0.18,
      });
    }

    patchPanels.forEach((uIndex, patchIndex) => {
      const patchY = RACK_FEET_HEIGHT + uIndex * U;
      const switchY = patchIndex % 2 === 0 ? switchAY : switchBY;
      for (let i = 0; i < 10; i++) {
        arr.push({
          from: [
            -0.19 + i * 0.016 + (patchIndex % 2) * 0.003,
            patchY + (i % 2 === 0 ? 0.006 : -0.004),
            RACK_DEPTH / 2 - 0.012,
          ],
          to: [
            -0.17 + ((i + patchIndex * 3) % 14) * 0.013,
            switchY + ((i % 3) - 1) * 0.005,
            RACK_DEPTH / 2 - 0.02 - (i % 4) * 0.003,
          ],
          color: liveColors[(i + patchIndex) % liveColors.length],
          radius: 0.00092,
          emissive: 0.22,
        });
      }
    });

    for (let i = 0; i < 6; i++) {
      arr.push({
        from: [
          rightX - 0.016,
          RACK_FEET_HEIGHT + 1.1 * U + i * 0.004,
          -RACK_DEPTH / 2 + 0.12 + i * 0.012,
        ],
        to: [
          rightX - 0.012,
          RACK_FEET_HEIGHT + (17 + i * 3) * U,
          -RACK_DEPTH / 2 + 0.08,
        ],
        color: "#141619",
        radius: 0.0021,
        emissive: 0.015,
      });
    }

    for (let i = 0; i < 8; i++) {
      arr.push({
        from: [
          -0.13 + i * 0.036,
          RACK_FEET_HEIGHT + 30.5 * U,
          RACK_DEPTH / 2 - 0.018,
        ],
        to: [
          leftX + 0.016,
          RACK_FEET_HEIGHT + (24 + i) * U,
          RACK_DEPTH / 2 - 0.05 - (i % 2) * 0.012,
        ],
        color: i % 2 === 0 ? "#64e6ff" : "#c7f000",
        radius: 0.00095,
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

      <mesh
        position={[0, RACK_FEET_HEIGHT + 16 * U + 0.004, RACK_DEPTH / 2 - 0.03]}
      >
        <boxGeometry args={[RACK_INNER_WIDTH - 0.04, 0.008, 0.018]} />
        <meshStandardMaterial color="#090c10" metalness={0.34} roughness={0.88} />
      </mesh>
      <mesh
        position={[0, RACK_FEET_HEIGHT + 16 * U + 0.011, RACK_DEPTH / 2 - 0.018]}
      >
        <boxGeometry args={[RACK_INNER_WIDTH - 0.12, 0.0018, 0.0018]} />
        <meshBasicMaterial color="#c7f000" transparent opacity={0.24} toneMapped={false} />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[
            side * (RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2 - 0.002),
            RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT / 2,
            -RACK_DEPTH / 2 + 0.12,
          ]}
        >
          <boxGeometry args={[0.008, RACK_INTERNAL_HEIGHT - 0.08, 0.02]} />
          <meshStandardMaterial color="#0b0d10" metalness={0.4} roughness={0.82} />
        </mesh>
      ))}

      {[
        [rightX - 0.02, RACK_FEET_HEIGHT + 10 * U, -RACK_DEPTH / 2 + 0.11],
        [rightX - 0.02, RACK_FEET_HEIGHT + 18 * U, -RACK_DEPTH / 2 + 0.11],
        [rightX - 0.02, RACK_FEET_HEIGHT + 28 * U, -RACK_DEPTH / 2 + 0.11],
        [leftX + 0.02, RACK_FEET_HEIGHT + 22 * U, RACK_DEPTH / 2 - 0.03],
        [leftX + 0.02, RACK_FEET_HEIGHT + 33 * U, RACK_DEPTH / 2 - 0.03],
      ].map((position, i) => (
        <CableComb key={i} position={position as [number, number, number]} />
      ))}
    </group>
  );
}
