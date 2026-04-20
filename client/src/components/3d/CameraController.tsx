import { useRef, useEffect, useState, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface CameraPreset {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

const CAMERA_PRESETS: CameraPreset[] = [
  { name: "overview", position: [20, 15, 20], target: [0, 1, 0], fov: 50 },
  { name: "aerial", position: [0, 30, 0.1], target: [0, 0, 0], fov: 60 },
  { name: "closeup", position: [3, 3, 5], target: [0, 1, 0], fov: 35 },
  { name: "walkthrough", position: [0, 1.7, 10], target: [0, 1.7, 0], fov: 75 },
  { name: "dramatic", position: [-15, 8, -15], target: [0, 2, 0], fov: 40 },
  { name: "cinematic", position: [25, 4, 0], target: [0, 2, 0], fov: 30 },
];

export function useCameraPresets() {
  const [currentPreset, setCurrentPreset] = useState<string>("overview");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goToPreset = (presetName: string) => {
    setCurrentPreset(presetName);
    setIsTransitioning(true);
  };

  const presets = CAMERA_PRESETS.map((p) => p.name);

  return { currentPreset, goToPreset, presets, isTransitioning, setIsTransitioning };
}

interface CameraControllerProps {
  targetPreset?: string;
  isTransitioning?: boolean;
  onTransitionComplete?: () => void;
  autoOrbit?: boolean;
  orbitSpeed?: number;
  maxHeight?: number;
  minHeight?: number;
}

export function CameraController({
  targetPreset = "overview",
  isTransitioning = false,
  onTransitionComplete,
  autoOrbit = false,
  orbitSpeed = 0.05,
  maxHeight,
  minHeight,
}: CameraControllerProps) {
  const { camera } = useThree();
  const targetPosition = useRef(new THREE.Vector3(20, 15, 20));
  const targetLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const currentLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const orbitAngle = useRef(0);
  const targetFov = useRef(camera.fov);

  useEffect(() => {
    const preset = CAMERA_PRESETS.find((p) => p.name === targetPreset);
    if (preset) {
      targetPosition.current.set(...preset.position);
      targetLookAt.current.set(...preset.target);
      targetFov.current = preset.fov ?? camera.fov;
    }
  }, [camera.fov, targetPreset]);

  useFrame((_, delta) => {
    if (autoOrbit && !isTransitioning) {
      orbitAngle.current += delta * orbitSpeed;
      const radius = 25;
      const height = 12 + Math.sin(orbitAngle.current * 0.3) * 3;
      targetPosition.current.set(
        Math.cos(orbitAngle.current) * radius,
        height,
        Math.sin(orbitAngle.current) * radius,
      );
    }

    const positionLerp = 1 - Math.exp(-delta * (isTransitioning ? 2.4 : 4.5));
    const targetLerp = 1 - Math.exp(-delta * (isTransitioning ? 2.2 : 4.8));
    const fovLerp = 1 - Math.exp(-delta * 4.2);

    camera.position.lerp(targetPosition.current, positionLerp);
    currentLookAt.current.lerp(targetLookAt.current, targetLerp);
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov.current, fovLerp);
    if (maxHeight !== undefined && camera.position.y > maxHeight) {
      camera.position.y = maxHeight;
    }
    if (minHeight !== undefined && camera.position.y < minHeight) {
      camera.position.y = minHeight;
    }
    camera.updateProjectionMatrix();
    camera.lookAt(currentLookAt.current);

    if (isTransitioning) {
      const distance = camera.position.distanceTo(targetPosition.current);
      if (distance < 0.35 && onTransitionComplete) {
        onTransitionComplete();
      }
    }
  });

  return null;
}

export function CinematicFlythrough({
  waypoints,
  speed = 1,
  loop = true,
  active = false,
  maxHeight,
  minHeight,
}: {
  waypoints: { position: [number, number, number]; target: [number, number, number] }[];
  speed?: number;
  loop?: boolean;
  active?: boolean;
  maxHeight?: number;
  minHeight?: number;
}) {
  const { camera } = useThree();
  const progress = useRef(0);
  const lookAtTarget = useRef(new THREE.Vector3());

  const positionCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        waypoints.map((point) => new THREE.Vector3(...point.position)),
        loop ? "centripetal" : "catmullrom",
        0.45,
      ),
    [loop, waypoints],
  );

  const targetCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        waypoints.map((point) => new THREE.Vector3(...point.target)),
        loop ? "centripetal" : "catmullrom",
        0.4,
      ),
    [loop, waypoints],
  );

  useFrame((_, delta) => {
    if (!active || waypoints.length < 2) return;

    progress.current += delta * speed * 0.025;
    if (loop) {
      progress.current = progress.current % 1;
    } else {
      progress.current = Math.min(1, progress.current);
    }

    const follow = 1 - Math.exp(-delta * 2.8);
    const lookFollow = 1 - Math.exp(-delta * 3.4);
    const positionPoint = positionCurve.getPointAt(progress.current);
    const targetPoint = targetCurve.getPointAt(progress.current);

    camera.position.lerp(positionPoint, follow);
    if (maxHeight !== undefined && camera.position.y > maxHeight) {
      camera.position.y = maxHeight;
    }
    if (minHeight !== undefined && camera.position.y < minHeight) {
      camera.position.y = minHeight;
    }

    lookAtTarget.current.lerp(targetPoint, lookFollow);
    camera.lookAt(lookAtTarget.current);
  });

  return null;
}

export function ShakeEffect({
  intensity = 0.02,
  active = false,
}: {
  intensity?: number;
  active?: boolean;
}) {
  const { camera } = useThree();
  const originalPosition = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!active) return;

    originalPosition.current.copy(camera.position);

    camera.position.x += (Math.random() - 0.5) * intensity;
    camera.position.y += (Math.random() - 0.5) * intensity;
    camera.position.z += (Math.random() - 0.5) * intensity;
  });

  return null;
}
