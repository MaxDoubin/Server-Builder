import { useLayoutEffect, useMemo, useRef } from "react";
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
        toneMapped={false}
        transparent
        opacity={0.98}
      />
    </instancedMesh>
  );
}


/**
 * An arbitrary field of blinking LEDs drawn in one call.
 *
 * Equivalent to scattering individual `<Led>` components, but a patch
 * panel carries 48 of them and the layout repeats down the rack. As
 * separate meshes that is 48 draw calls *and* 48 `useFrame` callbacks per
 * panel; here it is one of each, with the per-instance colour buffer
 * uploaded once per frame.
 */
export function LedField({
  points,
  size = 0.0019,
  seed = 0,
}: {
  points: Array<{
    position: [number, number, number];
    color: string;
    blink?: boolean;
  }>;
  size?: number;
  seed?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = points.length;

  const colors = useMemo(
    () => points.map((p) => new THREE.Color(p.color)),
    [points],
  );
  const dims = useMemo(
    () => colors.map((c) => c.clone().multiplyScalar(0.14)),
    [colors],
  );
  const phases = useMemo(
    () => points.map((_, i) => ((i * 9301 + seed * 49297) % 233280) / 233280),
    [points, seed],
  );
  const scratch = useMemo(() => new THREE.Color(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = points[i].position;
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [points, count, dummy]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      if (points[i].blink === false) {
        mesh.setColorAt(i, colors[i]);
        continue;
      }
      const phase = phases[i] * 6.28;
      const v =
        0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 5.2 + phase) * Math.cos(t * 1.7 + phase));
      mesh.setColorAt(i, scratch.copy(dims[i]).lerp(colors[i], v));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[size, size, size * 0.72]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
