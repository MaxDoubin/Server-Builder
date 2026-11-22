import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  activityLevel,
  bootState,
  burstDepth,
  driveLevel,
  glowLevel,
  localTime,
  powerLed,
  powerOverride,
  stripLevel,
  unitDelay,
} from "../bootCascade";

/**
 * What an LED does during the boot cascade (see ../bootCascade.ts).
 * Leaving the prop off opts the LED out, which is right for anything that
 * is not the booting host: rack frame lights, the PDUs, the UPS.
 */
export type BootRole = "power" | "drive" | "activity";

const OFF = new THREE.Color("#08090c");
/** Mesh scale of an LED that is lit without blinking. */
const SOLID_SCALE = 1.04;
const worldScratch = new THREE.Vector3();
const colorScratch = new THREE.Color();

/**
 * Per-run delay for whatever `objRef` points at, measured from its height
 * in the rack. Measured once per cascade rather than once per mount because
 * the sliding servers are not at their final height on the first frame.
 */
function useUnitDelay(objRef: React.RefObject<THREE.Object3D>) {
  const run = useRef(-1);
  const delay = useRef(0);
  return () => {
    if (run.current !== bootState.run && objRef.current) {
      run.current = bootState.run;
      delay.current = unitDelay(objRef.current.getWorldPosition(worldScratch).y);
    }
    return delay.current;
  };
}

export interface LedProps {
  color?: string;
  size?: number;
  intensity?: number;
  blink?: boolean;
  /** 0..1, relative blink offset so adjacent LEDs don't pulse in sync. */
  seed?: number;
  /** Join the boot cascade in this role. Omit for always-on LEDs. */
  boot?: BootRole;
}

export function Led({
  color = "#c7f000",
  size = 0.0045,
  intensity = 2.5,
  blink = false,
  seed = 0,
  boot,
}: LedProps) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const base = useMemo(() => new THREE.Color(color), [color]);
  const getDelay = useUnitDelay(meshRef);
  // True while the material holds boot colors, so they are put back exactly
  // once when the cascade ends instead of being rewritten every frame.
  const tinted = useRef(false);

  useFrame(({ clock }) => {
    if (!mat.current) return;

    const t = clock.elapsedTime * 4 + seed * 6.28;
    const carrier = 0.58 + 0.42 * (0.5 + 0.5 * Math.sin(t) * Math.cos(t * 1.3 + seed * 3.14));
    // The three idle modulations, all taken from the carrier here and nowhere
    // below, so a boot role that has to silence the idle look has one place
    // to do it and cannot miss a term.
    let flicker = 0.86 + 0.14 * Math.sin(clock.elapsedTime * 11 + seed * 9.7);
    let active = blink ? carrier : 1;
    let scale = blink ? 1 + (carrier - 0.5) * 0.18 : SOLID_SCALE;
    let gate = 1;

    if (boot && bootState.active) {
      const lt = localTime(getDelay());
      if (boot === "power") {
        gate = powerLed(lt, base, colorScratch);
        mat.current.emissive.copy(colorScratch);
        // The power LED is solid or flashing by the legend, never shimmering:
        // every idle modulation (the slow blink, the 1.75 Hz flicker and the
        // size pulse that goes with the blink) is faded out while the legend
        // owns it, and eased back in afterwards rather than switched, so
        // there is no step when the boot ends.
        const own = powerOverride(lt);
        active += (1 - active) * own;
        flicker += (1 - flicker) * own;
        scale += (SOLID_SCALE - scale) * own;
      } else {
        gate = boot === "drive" ? driveLevel(lt, seed) : activityLevel(lt, seed);
        colorScratch.copy(base);
        if (blink) {
          // Same blink rate, deeper swing: busy without flashing faster.
          const deep = 0.1 + 0.9 * ((carrier - 0.58) / 0.42);
          active = carrier + (deep - carrier) * burstDepth(lt);
        }
      }
      // An unlit LED is a dark lens, not a bright box catching the key light.
      mat.current.color.copy(colorScratch).multiplyScalar(0.1 + 0.9 * Math.min(1, gate));
      tinted.current = true;
    } else if (tinted.current) {
      mat.current.color.copy(base);
      mat.current.emissive.copy(base);
      tinted.current = false;
    }

    mat.current.emissiveIntensity = intensity * active * flicker * gate;

    if (meshRef.current) meshRef.current.scale.setScalar(scale);
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
  boot = false,
}: {
  count: number;
  length: number;
  color?: string;
  size?: number;
  blink?: boolean;
  blinkProbability?: number;
  seed?: number;
  /** Join the boot cascade: dark, a POST lamp-test sweep, then normal. */
  boot?: boolean;
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
  const off = OFF;
  const scratch = useMemo(() => new THREE.Color(), []);
  const getDelay = useUnitDelay(meshRef);

  useFrame(({ clock }) => {
    const m = meshRef.current;
    if (!m) return;
    const step = count > 1 ? length / (count - 1) : 0;
    const booting = boot && bootState.active;
    const lt = booting ? localTime(getDelay()) : 0;
    for (let i = 0; i < count; i++) {
      dummy.position.set(-length / 2 + i * step, 0, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);

      if (blink && lit[i]) {
        const t = clock.elapsedTime * 5.8 + phases[i] * 6.28;
        const v = 0.48 + 0.52 * (0.5 + 0.5 * Math.sin(t) * Math.cos(t * 1.9 + phases[i] * 3.1));
        scratch.copy(color3).lerp(dim, 1 - v);
      } else {
        scratch.copy(lit[i] ? dim : off);
      }
      // LEDs that idle dark stay dark; the rest follow the POST sweep.
      if (booting && lit[i]) {
        scratch.lerp(off, 1 - stripLevel(lt, count > 1 ? i / (count - 1) : 0));
      }
      m.setColorAt(i, scratch);
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
 * panel; here it is one of each, with the per-instance color buffer
 * uploaded once per frame.
 */
export function LedField({
  points,
  size = 0.0019,
  seed = 0,
  boot = false,
}: {
  points: Array<{
    position: [number, number, number];
    color: string;
    blink?: boolean;
  }>;
  size?: number;
  seed?: number;
  /** Join the boot cascade: each LED comes up at its own moment. */
  boot?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = points.length;
  const getDelay = useUnitDelay(meshRef);

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
    const booting = boot && bootState.active;
    const lt = booting ? localTime(getDelay()) : 0;
    for (let i = 0; i < count; i++) {
      if (points[i].blink === false) {
        scratch.copy(colors[i]);
      } else {
        const phase = phases[i] * 6.28;
        const v =
          0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 5.2 + phase) * Math.cos(t * 1.7 + phase));
        scratch.copy(dims[i]).lerp(colors[i], v);
      }
      if (booting) scratch.lerp(OFF, 1 - activityLevel(lt, seed + i));
      mesh.setColorAt(i, scratch);
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


/**
 * Gates the light bars and screens inside it on the boot cascade, so a
 * unit that has no power yet is actually dark rather than dark with its
 * accent strip glowing.
 *
 * Children must be meshes that own their material (every caller passes
 * inline materials): the base opacity or emissive intensity is remembered
 * on the first boot frame and restored when the cascade ends.
 */
export function BootGlow({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const getDelay = useUnitDelay(groupRef);
  const dimmed = useRef(false);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (!bootState.active && !dimmed.current) return;
    const level = bootState.active ? glowLevel(localTime(getDelay())) : 1;
    for (let i = 0; i < group.children.length; i++) {
      const mat = (group.children[i] as THREE.Mesh).material as
        | (THREE.Material & { emissiveIntensity?: number })
        | undefined;
      if (!mat) continue;
      const emissive = typeof mat.emissiveIntensity === "number";
      if (mat.userData.bootBase === undefined) {
        mat.userData.bootBase = emissive ? mat.emissiveIntensity : mat.opacity;
      }
      const value = (mat.userData.bootBase as number) * level;
      if (emissive) mat.emissiveIntensity = value;
      else mat.opacity = value;
    }
    dimmed.current = bootState.active;
  });

  return <group ref={groupRef}>{children}</group>;
}
