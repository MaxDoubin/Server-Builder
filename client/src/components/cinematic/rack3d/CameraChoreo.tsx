import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { RACK_TOTAL_HEIGHT } from "./rackConfig";

type Keyframe = {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
};

/**
 * Scroll-driven camera path.
 *
 * t=0.00 → far front-on, rack fills frame loosely
 * t=0.20 → dolly forward, slight tilt up
 * t=0.45 → orbit to 3/4 view, focus mid-rack (switches)
 * t=0.70 → push close to switch ports, slight down-tilt
 * t=1.00 → pull out, slight roll to reveal full silhouette
 */
const KEYS: Keyframe[] = [
  { t: 0.0,  pos: [0, RACK_TOTAL_HEIGHT * 0.55, 2.6],   look: [0, RACK_TOTAL_HEIGHT * 0.5, 0], fov: 32 },
  { t: 0.2,  pos: [0.05, RACK_TOTAL_HEIGHT * 0.52, 1.85], look: [0, RACK_TOTAL_HEIGHT * 0.52, 0], fov: 30 },
  { t: 0.45, pos: [1.25, RACK_TOTAL_HEIGHT * 0.62, 1.25], look: [0, RACK_TOTAL_HEIGHT * 0.62, 0], fov: 28 },
  { t: 0.7,  pos: [0.45, RACK_TOTAL_HEIGHT * 0.55, 0.7],  look: [0, RACK_TOTAL_HEIGHT * 0.55, 0], fov: 26 },
  { t: 1.0,  pos: [-0.6, RACK_TOTAL_HEIGHT * 0.48, 2.8],  look: [0, RACK_TOTAL_HEIGHT * 0.5, 0], fov: 34 },
];

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function interpolate(keys: Keyframe[], t: number) {
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const local = smoothstep(a.t, b.t, t);
      return {
        t,
        pos: [
          a.pos[0] + (b.pos[0] - a.pos[0]) * local,
          a.pos[1] + (b.pos[1] - a.pos[1]) * local,
          a.pos[2] + (b.pos[2] - a.pos[2]) * local,
        ] as [number, number, number],
        look: [
          a.look[0] + (b.look[0] - a.look[0]) * local,
          a.look[1] + (b.look[1] - a.look[1]) * local,
          a.look[2] + (b.look[2] - a.look[2]) * local,
        ] as [number, number, number],
        fov: (a.fov ?? 30) + ((b.fov ?? 30) - (a.fov ?? 30)) * local,
      };
    }
  }
  return keys[0];
}

const tmpTarget = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

export type ProgressRef = { current: number };

export function CameraChoreo({
  progressRef,
  idleSway = 0.008,
}: {
  progressRef: ProgressRef;
  idleSway?: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const targetRef = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    const clamped = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const k = interpolate(KEYS, clamped);

    const sway = Math.sin(clock.elapsedTime * 0.4) * idleSway;
    const swayY = Math.cos(clock.elapsedTime * 0.3) * idleSway * 0.6;

    tmpPos.set(k.pos[0] + sway, k.pos[1] + swayY, k.pos[2]);
    tmpTarget.set(k.look[0], k.look[1], k.look[2]);

    camera.position.lerp(tmpPos, 0.18);
    targetRef.current.lerp(tmpTarget, 0.22);
    camera.lookAt(targetRef.current);
    if (k.fov && Math.abs(camera.fov - k.fov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, k.fov, 0.15);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
