import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export interface LedProps {
  color?: string;
  size?: number;
  intensity?: number;
  blink?: boolean;
  /** 0..1 — relative blink offset so adjacent LEDs don't pulse in sync. */
  seed?: number;
}

export function Led({
  color = "#c7f000",
  size = 0.004,
  intensity = 1.6,
  blink = false,
  seed = 0,
}: LedProps) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    if (blink) {
      const t = clock.elapsedTime * 4 + seed * 6.28;
      // fast stochastic-ish blink
      const v =
        0.25 +
        0.75 *
          (0.5 + 0.5 * Math.sin(t) * Math.cos(t * 1.3 + seed * 3.14));
      mat.current.emissiveIntensity = intensity * v;
    } else {
      mat.current.emissiveIntensity = intensity;
    }
  });
  return (
    <mesh>
      <boxGeometry args={[size, size, size * 0.6]} />
      <meshStandardMaterial
        ref={mat}
        color={color}
        emissive={color}
        emissiveIntensity={intensity}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * A row of instanced LEDs with per-instance blinking driven on the CPU
 * (count usually stays under 96 so cost is negligible).
 */
export function LedStrip({
  count,
  length,
  color = "#64e6ff",
  size = 0.0035,
  blink = true,
  blinkProbability = 0.72,
  seed = 1,
}: {
  count: number;
  length: number;
  color?: string;
  size?: number;
  blink?: boolean;
  blinkProbability?: number;
  seed?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lit = useMemo(
    () => Array.from({ length: count }, (_, i) => ((i * 9301 + seed * 49297) % 233280) / 233280 < blinkProbability),
    [count, blinkProbability, seed],
  );
  const phases = useMemo(
    () => Array.from({ length: count }, (_, i) => (i * 0.37 + seed) % 1),
    [count, seed],
  );

  const color3 = useMemo(() => new THREE.Color(color), [color]);
  const off = useMemo(() => new THREE.Color("#0b0d10"), []);

  useFrame(({ clock }) => {
    const m = meshRef.current;
    if (!m) return;
    const step = count > 1 ? length / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      dummy.position.set(-length / 2 + i * step, 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);

      if (blink && lit[i]) {
        const t = clock.elapsedTime * 5 + phases[i] * 6.28;
        const v = 0.5 + 0.5 * Math.sin(t) * Math.cos(t * 1.9 + phases[i] * 3.1);
        const intensity = v < 0.3 ? 0 : 1;
        m.setColorAt(i, intensity > 0 ? color3 : off);
      } else {
        m.setColorAt(i, lit[i] ? color3 : off);
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <boxGeometry args={[size, size, size * 0.55]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={1.6}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
