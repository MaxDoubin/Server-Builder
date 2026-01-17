import { useRef, useEffect, useState } from "react";
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
  
  const presets = CAMERA_PRESETS.map(p => p.name);
  
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

  useEffect(() => {
    const preset = CAMERA_PRESETS.find(p => p.name === targetPreset);
    if (preset) {
      targetPosition.current.set(...preset.position);
      targetLookAt.current.set(...preset.target);
    }
  }, [targetPreset]);

  useFrame((state, delta) => {
    if (autoOrbit && !isTransitioning) {
      orbitAngle.current += delta * orbitSpeed;
      const radius = 25;
      const height = 12 + Math.sin(orbitAngle.current * 0.3) * 3;
      targetPosition.current.set(
        Math.cos(orbitAngle.current) * radius,
        height,
        Math.sin(orbitAngle.current) * radius
      );
    }

    camera.position.lerp(targetPosition.current, isTransitioning ? 0.02 : 0.05);
    currentLookAt.current.lerp(targetLookAt.current, isTransitioning ? 0.02 : 0.05);
    if (maxHeight !== undefined && camera.position.y > maxHeight) {
      camera.position.y = maxHeight;
    }
    if (minHeight !== undefined && camera.position.y < minHeight) {
      camera.position.y = minHeight;
    }
    camera.lookAt(currentLookAt.current);

    if (isTransitioning) {
      const distance = camera.position.distanceTo(targetPosition.current);
      if (distance < 0.5 && onTransitionComplete) {
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
  const currentWaypoint = useRef(0);
  const currentPosition = useRef(new THREE.Vector3());
  const nextPosition = useRef(new THREE.Vector3());
  const currentTarget = useRef(new THREE.Vector3());
  const nextTarget = useRef(new THREE.Vector3());
  const lookAtTarget = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!active || waypoints.length < 2) return;

    progress.current += delta * speed * 0.1;
    
    if (progress.current >= 1) {
      progress.current = 0;
      currentWaypoint.current = (currentWaypoint.current + 1) % (waypoints.length - 1);
      if (!loop && currentWaypoint.current === 0) {
        return;
      }
    }

    const current = waypoints[currentWaypoint.current];
    const next = waypoints[(currentWaypoint.current + 1) % waypoints.length];
    
    const t = progress.current;
    const smoothT = t * t * (3 - 2 * t);

    camera.position.lerpVectors(
      currentPosition.current.set(...current.position),
      nextPosition.current.set(...next.position),
      smoothT
    );
    if (maxHeight !== undefined && camera.position.y > maxHeight) {
      camera.position.y = maxHeight;
    }
    if (minHeight !== undefined && camera.position.y < minHeight) {
      camera.position.y = minHeight;
    }

    const lookAt = lookAtTarget.current.lerpVectors(
      currentTarget.current.set(...current.target),
      nextTarget.current.set(...next.target),
      smoothT
    );
    camera.lookAt(lookAt);
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

  useFrame((state) => {
    if (!active) return;
    
    originalPosition.current.copy(camera.position);
    
    camera.position.x += (Math.random() - 0.5) * intensity;
    camera.position.y += (Math.random() - 0.5) * intensity;
    camera.position.z += (Math.random() - 0.5) * intensity;
  });

  return null;
}
