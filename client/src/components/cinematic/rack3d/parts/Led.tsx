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
  size = 0.0045,
  intensity = 2.5,
  blink = false,
  seed = 0,
}: LedProps) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!mat.current) return;

    const t = clock.elapsedTime * 4 + seed * 6.28;
    const carrier = 0.58 + 0.42 * (0.5 + 0.5 * Math.sin(t) * Math.cos(t * 1.3 + seed * 3.14));
    const flicker = 0.86 + 0.14 * Math.sin(clock.elapsedTime * 11 + seed * 9.7);
    const active = blink ? carrier : 1;

    mat.current.emissiveIntensity = intensity * active * flicker;

    if (meshRef.current) {
      const scale = 1 + (blink ? (carrier - 0.5) * 0.18 : 0.04);
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[size, size, size * 0.72]} />
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
 * A row of instanced LEDs with per-instance blinking driven on the CPU.
 */
export function LedStrip({
  count,
  length,
  color = "#64e6ff",
  size = 0.0038,
  blink = true,
  blinkProbability = 0.84,
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
  const dim = useMemo(() => color3.clone().multiplyScalar(0.12), [color3]);
  const off = useMemo(() => new THREE.Color("#08090c"), []);

  useFrame(({ clock }) => {
    const m = meshRef.current;
    if (!m) return;
    const step = count > 1 ? length / (count - 1) : 0;
    for (let i = 0; i < count; i++) {
      dummy.position.set(-length / 2 + i * step, 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);

      if (blink && lit[i]) {
        const t = clock.elapsedTime * 5.8 + phases[i] * 6.28;
        const v = 0.48 + 0.52 * (0.5 + 0.5 * Math.sin(t) * Math.cos(t * 1.9 + phases[i] * 3.1));
        m.setColorAt(i, color3.clone().lerp(dim, 1 - v));
      } else {
        m.setColorAt(i, lit[i] ? dim : off);
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
      <boxGeometry args={[size, size, size * 0.62]} />
      <meshBasicMaterial
        color={color}
        vertexColors
        toneMapped={false}
        transparent
        opacity={0.98}
      />
    </instancedMesh>
  );
}
