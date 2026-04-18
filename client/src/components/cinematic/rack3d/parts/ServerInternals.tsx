import { useMemo } from "react";
import * as THREE from "three";

/**
 * High-detail 2U server internals, positioned relative to (0,0,0) at the
 * geometric center of the chassis. Intended to be "exploded" along Y (and
 * some parts along Z/X) by a parent group that receives a 0..1 progress.
 *
 * Layout (viewed front-to-rear, +Z = front):
 *   - Front:   3.5" drive cage (8 bays in 2 rows × 4)
 *   - Middle:  fan wall, RAM banks, CPU + heat sinks, motherboard
 *   - Rear:    PSU (redundant pair), expansion cards
 */

export interface ServerInternalsProps {
  /** Outer shell box (width, height, depth) in meters. */
  size?: [number, number, number];
  /** 0 = assembled, 1 = fully exploded. */
  explode?: number;
  /** Emit labels that the 2D overlay can target. */
  onLayout?: (layout: InternalPartLayout[]) => void;
}

export interface InternalPartLayout {
  id: string;
  label: string;
  sublabel?: string;
  /** Anchor position in local space when exploded (used for HTML labels). */
  anchor: [number, number, number];
}

/** Exploded offset (meters) per-part when explode = 1. */
const OFFSETS: Record<string, [number, number, number]> = {
  lid:         [0, 0.42, 0],
  motherboard: [0, 0.00, 0],
  cpuA:        [0, 0.20, 0.04],
  cpuB:        [0, 0.20, -0.04],
  heatsinkA:   [0, 0.36, 0.04],
  heatsinkB:   [0, 0.36, -0.04],
  ramBankA:    [-0.22, 0.20, 0.05],
  ramBankB:    [0.22, 0.20, 0.05],
  fanWall:     [0, 0.00, 0.30],
  psuA:        [0.24, -0.10, -0.34],
  psuB:        [-0.24, -0.10, -0.34],
  driveCage:   [0, -0.04, 0.58],
  nic:         [0.30, 0.14, -0.22],
  gpu:         [-0.30, 0.18, -0.18],
  chassis:     [0, -0.42, 0],
};

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function ServerInternals({ size = [0.56, 0.12, 0.78], explode = 0 }: ServerInternalsProps) {
  const [w, h, d] = size;
  const t = Math.max(0, Math.min(1, explode));

  // Chassis material shared
  const steel = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#1a1d23", metalness: 0.7, roughness: 0.52,
  }), []);
  const pcbGreen = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#0c2a1e", metalness: 0.15, roughness: 0.65,
  }), []);
  const heatsinkMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#a8b0b8", metalness: 0.82, roughness: 0.35,
  }), []);
  const copper = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#b07b3c", metalness: 0.9, roughness: 0.38,
  }), []);
  const ramMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#0a0a0f", metalness: 0.3, roughness: 0.55,
  }), []);
  const ramGold = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#c9a64a", metalness: 0.9, roughness: 0.3,
  }), []);
  const plasticBlk = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#08090c", metalness: 0.1, roughness: 0.88,
  }), []);
  const driveMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#1a1e26", metalness: 0.6, roughness: 0.45,
  }), []);
  const psuBody = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#0e1014", metalness: 0.5, roughness: 0.6,
  }), []);
  const ledGreen = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#c7f000", emissive: "#c7f000", emissiveIntensity: 1.5,
  }), []);
  const ledAmber = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#ff9a1f", emissive: "#ff9a1f", emissiveIntensity: 1.2,
  }), []);

  // Helpers to apply exploded offsets
  const pos = (key: keyof typeof OFFSETS, base: [number, number, number] = [0, 0, 0]) => {
    const off = OFFSETS[key];
    return lerp3(base, [base[0] + off[0], base[1] + off[1], base[2] + off[2]], t);
  };

  // --- Motherboard ---
  const mobo = (
    <group position={pos("motherboard", [0, -h * 0.25, -d * 0.08])}>
      <mesh material={pcbGreen}>
        <boxGeometry args={[w * 0.86, 0.008, d * 0.72]} />
      </mesh>
      {/* Trace hints as slim black rectangles */}
      <mesh position={[0, 0.0045, 0]} material={steel}>
        <boxGeometry args={[w * 0.3, 0.001, d * 0.6]} />
      </mesh>
      {/* Chipset heatsink */}
      <mesh position={[0.08, 0.02, -0.12]} material={heatsinkMat}>
        <boxGeometry args={[0.05, 0.02, 0.05]} />
      </mesh>
    </group>
  );

  // --- CPU sockets (LGA-ish pattern + retention mech) ---
  const cpuSocket = (key: "cpuA" | "cpuB", x: number, z: number) => (
    <group key={key} position={pos(key, [x, -h * 0.18, z])}>
      <mesh material={plasticBlk}>
        <boxGeometry args={[0.07, 0.008, 0.07]} />
      </mesh>
      {/* IHS (integrated heat spreader) */}
      <mesh position={[0, 0.006, 0]} material={heatsinkMat}>
        <boxGeometry args={[0.055, 0.004, 0.055]} />
      </mesh>
      {/* etched square — small darker plate */}
      <mesh position={[0, 0.009, 0]} material={steel}>
        <boxGeometry args={[0.04, 0.0008, 0.04]} />
      </mesh>
    </group>
  );

  // --- Tower heatsinks w/ copper heatpipes ---
  const heatsink = (key: "heatsinkA" | "heatsinkB", x: number, z: number) => (
    <group key={key} position={pos(key, [x, -h * 0.10, z])}>
      {/* Fin stack */}
      {Array.from({ length: 22 }).map((_, i) => (
        <mesh key={i} position={[0, 0, -0.035 + (i * 0.003)]} material={heatsinkMat}>
          <boxGeometry args={[0.08, 0.07, 0.0018]} />
        </mesh>
      ))}
      {/* Heatpipes */}
      {[-0.02, 0, 0.02].map((xo, i) => (
        <mesh key={`pipe-${i}`} position={[xo, 0.038, 0]} rotation={[Math.PI / 2, 0, 0]} material={copper}>
          <cylinderGeometry args={[0.004, 0.004, 0.08, 12]} />
        </mesh>
      ))}
    </group>
  );

  // --- RAM banks (8 sticks per bank × 2) ---
  const ramBank = (key: "ramBankA" | "ramBankB", x: number) => (
    <group key={key} position={pos(key, [x, -h * 0.12, -d * 0.02])}>
      {Array.from({ length: 8 }).map((_, i) => (
        <group key={i} position={[0, 0, -0.08 + i * 0.024]}>
          <mesh material={ramMat}>
            <boxGeometry args={[0.02, 0.05, 0.018]} />
          </mesh>
          {/* Gold heat spreader band */}
          <mesh position={[0, 0.01, 0]} material={ramGold}>
            <boxGeometry args={[0.02, 0.01, 0.0182]} />
          </mesh>
          {/* Latches */}
          <mesh position={[0, -0.028, 0]} material={plasticBlk}>
            <boxGeometry args={[0.024, 0.006, 0.02]} />
          </mesh>
        </group>
      ))}
    </group>
  );

  // --- Fan wall (6 counter-rotating fans) ---
  const fanWall = (
    <group position={pos("fanWall", [0, -h * 0.1, d * 0.08])}>
      {Array.from({ length: 6 }).map((_, i) => {
        const x = -w * 0.35 + (i * (w * 0.7) / 5);
        return (
          <group key={i} position={[x, 0, 0]}>
            {/* Fan frame */}
            <mesh material={plasticBlk}>
              <boxGeometry args={[0.08, 0.09, 0.04]} />
            </mesh>
            {/* Hub */}
            <mesh material={steel}>
              <cylinderGeometry args={[0.012, 0.012, 0.042, 16]} />
            </mesh>
            {/* Blades (approx as a cylinder ring) */}
            {Array.from({ length: 7 }).map((__, bi) => (
              <mesh
                key={bi}
                rotation={[0, 0, (bi / 7) * Math.PI * 2]}
                material={plasticBlk}
              >
                <boxGeometry args={[0.035, 0.004, 0.03]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );

  // --- PSU pair (rear) ---
  const psu = (key: "psuA" | "psuB", x: number) => (
    <group key={key} position={pos(key, [x, -h * 0.2, -d * 0.32])}>
      <mesh material={psuBody}>
        <boxGeometry args={[0.14, 0.085, 0.18]} />
      </mesh>
      {/* Fan grill circle */}
      <mesh position={[0, 0, 0.091]} material={plasticBlk}>
        <cylinderGeometry args={[0.032, 0.032, 0.002, 24]} />
      </mesh>
      {/* Status LED */}
      <mesh position={[0.055, 0.028, 0.091]} material={ledGreen}>
        <boxGeometry args={[0.004, 0.004, 0.001]} />
      </mesh>
      {/* C19 connector */}
      <mesh position={[-0.04, -0.03, -0.091]} material={steel}>
        <boxGeometry args={[0.03, 0.018, 0.002]} />
      </mesh>
    </group>
  );

  // --- Front drive cage (8 × 3.5" bays) ---
  const driveCage = (
    <group position={pos("driveCage", [0, -h * 0.15, d * 0.3])}>
      <mesh material={steel}>
        <boxGeometry args={[w * 0.92, h * 0.85, 0.12]} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = -w * 0.34 + col * (w * 0.22);
        const y = h * 0.2 - row * (h * 0.38);
        return (
          <group key={i} position={[x, y, 0.045]}>
            <mesh material={driveMat}>
              <boxGeometry args={[w * 0.19, h * 0.3, 0.025]} />
            </mesh>
            {/* Caddy handle */}
            <mesh position={[0, -h * 0.14, 0.013]} material={plasticBlk}>
              <boxGeometry args={[w * 0.18, h * 0.02, 0.005]} />
            </mesh>
            {/* Activity LED */}
            <mesh position={[w * 0.07, h * 0.12, 0.014]} material={i === 0 ? ledAmber : ledGreen}>
              <boxGeometry args={[0.004, 0.004, 0.002]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );

  // --- Expansion cards (NIC + GPU bracket) ---
  const expansionCards = (
    <>
      <group position={pos("nic", [w * 0.22, -h * 0.12, -d * 0.22])}>
        <mesh material={pcbGreen}>
          <boxGeometry args={[0.14, 0.06, 0.008]} />
        </mesh>
        {/* SFP cages */}
        {[-0.04, -0.02, 0, 0.02].map((xo, i) => (
          <mesh key={i} position={[xo, 0.02, 0.005]} material={steel}>
            <boxGeometry args={[0.014, 0.018, 0.012]} />
          </mesh>
        ))}
      </group>
      <group position={pos("gpu", [-w * 0.22, -h * 0.10, -d * 0.18])}>
        <mesh material={plasticBlk}>
          <boxGeometry args={[0.22, 0.08, 0.03]} />
        </mesh>
        {/* Shroud slot */}
        <mesh position={[0.02, 0, 0.016]} material={steel}>
          <boxGeometry args={[0.18, 0.05, 0.003]} />
        </mesh>
      </group>
    </>
  );

  // --- Lid (slides up on explode) ---
  const lid = (
    <group position={pos("lid", [0, h * 0.5, 0])}>
      <mesh material={steel}>
        <boxGeometry args={[w, 0.004, d]} />
      </mesh>
      {/* Vent perforations */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[-w * 0.3 + i * (w * 0.05), 0.003, 0]} material={plasticBlk}>
          <boxGeometry args={[0.004, 0.002, d * 0.5]} />
        </mesh>
      ))}
    </group>
  );

  // --- Chassis base (drops on explode) ---
  const chassisBase = (
    <group position={pos("chassis", [0, -h * 0.5, 0])}>
      <mesh material={steel}>
        <boxGeometry args={[w, 0.006, d]} />
      </mesh>
      <mesh position={[0, 0.003, d * 0.49]} material={steel}>
        <boxGeometry args={[w, h, 0.004]} />
      </mesh>
      <mesh position={[0, 0.003, -d * 0.49]} material={steel}>
        <boxGeometry args={[w, h, 0.004]} />
      </mesh>
      <mesh position={[w * 0.49, 0.003, 0]} material={steel}>
        <boxGeometry args={[0.004, h, d]} />
      </mesh>
      <mesh position={[-w * 0.49, 0.003, 0]} material={steel}>
        <boxGeometry args={[0.004, h, d]} />
      </mesh>
    </group>
  );

  return (
    <group>
      {chassisBase}
      {mobo}
      {cpuSocket("cpuA", -w * 0.04, 0.04)}
      {cpuSocket("cpuB", -w * 0.04, -0.04)}
      {heatsink("heatsinkA", -w * 0.04, 0.04)}
      {heatsink("heatsinkB", -w * 0.04, -0.04)}
      {ramBank("ramBankA", -w * 0.30)}
      {ramBank("ramBankB", w * 0.22)}
      {fanWall}
      {psu("psuA", w * 0.30)}
      {psu("psuB", -w * 0.30)}
      {driveCage}
      {expansionCards}
      {lid}
    </group>
  );
}

/** Static layout info used to position 2D labels in world-space. */
export const INTERNAL_LABELS: InternalPartLayout[] = [
  { id: "lid",         label: "Top Cover",     sublabel: "1.5mm Cold-Rolled Steel", anchor: [0, 0.42, 0] },
  { id: "heatsinkA",   label: "CPU · Socket 1", sublabel: "Xeon Platinum · 350W TDP", anchor: [-0.02, 0.36, 0.04] },
  { id: "ramBankA",    label: "DIMM Bank A",   sublabel: "16× DDR5-5600 ECC", anchor: [-0.52, 0.20, 0.05] },
  { id: "fanWall",     label: "Hot-Swap Fans", sublabel: "6× Counter-Rotating", anchor: [0, 0.00, 0.30] },
  { id: "psuA",        label: "PSU · Primary", sublabel: "1100W · Platinum", anchor: [0.54, -0.10, -0.34] },
  { id: "driveCage",   label: "Drive Cage",    sublabel: "8× 3.5\" SAS/SATA", anchor: [0, -0.04, 0.58] },
  { id: "gpu",         label: "GPU Accelerator", sublabel: "L40S · 48GB HBM3", anchor: [-0.60, 0.18, -0.18] },
  { id: "chassis",     label: "Chassis Base",  sublabel: "2U · 19\" Rack Depth", anchor: [0, -0.42, 0] },
];
