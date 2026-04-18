import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { RACK_TOTAL_HEIGHT } from "./rackConfig";

type Keyframe = {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
  roll?: number;
};

const KEYS: Keyframe[] = [
  { t: 0.0,  pos: [0, RACK_TOTAL_HEIGHT * 0.56, 2.9],   look: [0, RACK_TOTAL_HEIGHT * 0.52, 0],   fov: 34, roll: 0.0 },
  { t: 0.16, pos: [0.05, RACK_TOTAL_HEIGHT * 0.6, 2.05], look: [0, RACK_TOTAL_HEIGHT * 0.58, 0],   fov: 31, roll: -0.02 },
  { t: 0.32, pos: [0.9, RACK_TOTAL_HEIGHT * 0.68, 1.38], look: [0.05, RACK_TOTAL_HEIGHT * 0.66, 0], fov: 28, roll: -0.05 },
  { t: 0.5,  pos: [0.42, RACK_TOTAL_HEIGHT * 0.73, 0.82], look: [0.05, RACK_TOTAL_HEIGHT * 0.74, 0], fov: 24, roll: 0.025 },
  { t: 0.68, pos: [-0.28, RACK_TOTAL_HEIGHT * 0.34, 0.76], look: [0, RACK_TOTAL_HEIGHT * 0.34, 0],  fov: 23, roll: 0.04 },
  { t: 0.84, pos: [-0.96, RACK_TOTAL_HEIGHT * 0.58, 1.34], look: [0, RACK_TOTAL_HEIGHT * 0.6, 0],  fov: 28, roll: -0.035 },
  { t: 1.0,  pos: [-0.42, RACK_TOTAL_HEIGHT * 0.5, 2.95], look: [0, RACK_TOTAL_HEIGHT * 0.52, 0],  fov: 35, roll: 0.0 },
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
        roll: (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * local,
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
  idleSway = 0.012,
}: {
  progressRef: ProgressRef;
  idleSway?: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const targetRef = useRef(new THREE.Vector3());
  const rig = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const clamped = Math.max(0, Math.min(1, progressRef.current ?? 0));
    const k = interpolate(KEYS, clamped);

    const sway = Math.sin(clock.elapsedTime * 0.42) * idleSway;
    const swayY = Math.cos(clock.elapsedTime * 0.3) * idleSway * 0.7;
    const swayZ = Math.sin(clock.elapsedTime * 0.22) * idleSway * 0.38;

    tmpPos.set(k.pos[0] + sway, k.pos[1] + swayY, k.pos[2] + swayZ);
    tmpTarget.set(k.look[0], k.look[1], k.look[2]);

    camera.position.lerp(tmpPos, 0.16);
    targetRef.current.lerp(tmpTarget, 0.2);

    rig.position.copy(camera.position);
    rig.lookAt(targetRef.current);
    rig.rotateZ(k.roll ?? 0);
    camera.quaternion.slerp(rig.quaternion, 0.18);

    if (k.fov && Math.abs(camera.fov - k.fov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, k.fov, 0.15);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
