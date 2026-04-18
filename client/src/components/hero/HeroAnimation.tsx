"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Rack3D } from "@/components/3d/Rack3D";
import { staticEquipmentCatalog } from "@/lib/static-equipment";
import { usePrefersReducedMotion } from "@/lib/motion";
import type { Rack } from "@shared/schema";

type HeroAnimationProps = {
  className?: string;
  variant?: "intro" | "floor" | "build" | "network" | "noc" | "incidents" | "about";
  seed?: number;
};

const paletteMap = {
  intro: {
    base: new THREE.Color("#02050b"),
    ambient: new THREE.Color("#2b4157"),
    cool: new THREE.Color("#5ad1ff"),
    warm: new THREE.Color("#f59e8b"),
    accent: new THREE.Color("#6d7cff"),
    floor: new THREE.Color("#0b0f14"),
  },
  floor: {
    base: new THREE.Color("#020509"),
    ambient: new THREE.Color("#24364b"),
    cool: new THREE.Color("#4cc3ff"),
    warm: new THREE.Color("#fb923c"),
    accent: new THREE.Color("#38bdf8"),
    floor: new THREE.Color("#0c1016"),
  },
  build: {
    base: new THREE.Color("#050509"),
    ambient: new THREE.Color("#2c3443"),
    cool: new THREE.Color("#7dd3fc"),
    warm: new THREE.Color("#fb7185"),
    accent: new THREE.Color("#a855f7"),
    floor: new THREE.Color("#12131b"),
  },
  network: {
    base: new THREE.Color("#02060d"),
    ambient: new THREE.Color("#2b3d4f"),
    cool: new THREE.Color("#38bdf8"),
    warm: new THREE.Color("#f59e0b"),
    accent: new THREE.Color("#60a5fa"),
    floor: new THREE.Color("#0c1219"),
  },
  noc: {
    base: new THREE.Color("#01060f"),
    ambient: new THREE.Color("#203348"),
    cool: new THREE.Color("#22c55e"),
    warm: new THREE.Color("#fb7185"),
    accent: new THREE.Color("#8b5cf6"),
    floor: new THREE.Color("#0b1118"),
  },
  incidents: {
    base: new THREE.Color("#090207"),
    ambient: new THREE.Color("#352029"),
    cool: new THREE.Color("#fb7185"),
    warm: new THREE.Color("#f97316"),
    accent: new THREE.Color("#ef4444"),
    floor: new THREE.Color("#14080f"),
  },
  about: {
    base: new THREE.Color("#020812"),
    ambient: new THREE.Color("#263a52"),
    cool: new THREE.Color("#38bdf8"),
    warm: new THREE.Color("#60a5fa"),
    accent: new THREE.Color("#a855f7"),
    floor: new THREE.Color("#0d121b"),
  },
};

const createSeededRandom = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const buildDatacenterRack = (index: number, seed: number): Rack => {
  const slots: Rack["slots"] = Array.from({ length: 42 }).map((_, slotIndex) => ({
    uPosition: slotIndex + 1,
    equipmentInstanceId: null,
  }));
  const rng = createSeededRandom(seed + index * 11);
  const installedEquipment: Rack["installedEquipment"] = [];
  let u = 1;
  while (u <= 42) {
    const equipment = staticEquipmentCatalog[Math.floor(rng() * staticEquipmentCatalog.length)];
    const uEnd = Math.min(42, u + equipment.uHeight - 1);
    const instanceId = `cinematic-${seed}-${index}-${u}-${equipment.id}`;
    for (let slot = u; slot <= uEnd; slot += 1) {
      slots[slot - 1].equipmentInstanceId = instanceId;
    }
    installedEquipment.push({
      id: instanceId,
      equipmentId: equipment.id,
      uStart: u,
      uEnd,
      status: "online",
      cpuLoad: 25 + rng() * 70,
      memoryUsage: 20 + rng() * 70,
      networkActivity: 30 + rng() * 60,
    });
    u = uEnd + 1 + (rng() > 0.6 ? 1 : 0);
  }

  const inletTemp = 22 + rng() * 10;

  return {
    id: `cinematic-rack-${seed}-${index}`,
    name: `Hall ${index + 1}`,
    type: "enclosed_42U",
    totalUs: 42,
    slots,
    installedEquipment,
    powerCapacity: 12000,
    currentPowerDraw: 3000 + rng() * 3500,
    inletTemp,
    exhaustTemp: inletTemp + 6,
    airflowRestriction: rng() * 0.2,
    positionX: 0,
    positionY: 0,
  };
};

const usePageVisibility = () => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
};

const useHeroVisibility = () => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return { containerRef, isVisible };
};

const SEGMENT_LENGTH = 22;
const SEGMENT_COUNT = 8;
const RACKS_PER_SEGMENT = 3;
const RACK_SPACING = 3.2;
const AISLE_HALF_WIDTH = 2.4;
const DETAIL_BUDGET = 60;
const DETAIL_RADIUS = 30;
const RACK_FACE_OFFSET = 0.46;
const WALL_OFFSET = 5.9;

const getDeviceTier = () => {
  if (typeof navigator === "undefined") return "high" as const;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  if (cores <= 4 || memory <= 4) return "low" as const;
  if (cores <= 6 || memory <= 6) return "medium" as const;
  return "high" as const;
};

function BlinkingIndicator({
  position,
  color,
  phase,
  intensity = 3.4,
}: {
  position: [number, number, number];
  color: THREE.Color;
  phase: number;
  intensity?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = 0.55 + Math.sin(t * 2.1 + phase) * 0.45;
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = intensity * pulse;
  });

  return (
    <mesh ref={meshRef} position={position} castShadow={false}>
      <boxGeometry args={[0.08, 0.025, 0.02]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={intensity}
        roughness={0.2}
        metalness={0.1}
        toneMapped={false}
      />
    </mesh>
  );
}

function RackLedStrips({
  transforms,
  color,
}: {
  transforms: Array<{ position: THREE.Vector3; rotation: THREE.Euler }>;
  color: THREE.Color;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const instanceCount = transforms.length;

  useEffect(() => {
    if (!meshRef.current || instanceCount === 0) return;
    const dummy = new THREE.Object3D();
    transforms.forEach((transform, index) => {
      dummy.position.copy(transform.position);
      dummy.rotation.copy(transform.rotation);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [transforms, instanceCount]);

  return instanceCount === 0 ? null : (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instanceCount]}>
      <boxGeometry args={[0.08, 0.04, 0.5]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={4.2}
        roughness={0.25}
        metalness={0.2}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function RackDetailLights({
  lights,
}: {
  lights: Array<{ position: THREE.Vector3; rotation: THREE.Euler; color: THREE.Color }>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const instanceCount = lights.length;

  useEffect(() => {
    if (!meshRef.current || instanceCount === 0) return;
    const dummy = new THREE.Object3D();
    lights.forEach((light, index) => {
      dummy.position.copy(light.position);
      dummy.rotation.copy(light.rotation);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
      meshRef.current?.setColorAt(index, light.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [lights, instanceCount]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.72 + Math.sin(clock.getElapsedTime() * 2.8) * 0.16;
  });

  return instanceCount === 0 ? null : (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instanceCount]}>
      <boxGeometry args={[0.1, 0.026, 0.014]} />
      <meshBasicMaterial vertexColors transparent opacity={0.82} toneMapped={false} />
    </instancedMesh>
  );
}

function ArchitecturalBackdrop({
  palette,
  introMode,
}: {
  palette: (typeof paletteMap)[keyof typeof paletteMap];
  introMode: boolean;
}) {
  const columnZPositions = useMemo(
    () => Array.from({ length: SEGMENT_COUNT + 2 }, (_, index) => 4 - index * 9.5),
    []
  );

  return (
    <group>
      <mesh position={[0, 1.6, -SEGMENT_LENGTH * SEGMENT_COUNT - 6]}>
        <boxGeometry args={[13.5, 4.2, 0.25]} />
        <meshStandardMaterial
          color="#081019"
          emissive={palette.ambient}
          emissiveIntensity={introMode ? 0.18 : 0.1}
          roughness={0.55}
          metalness={0.22}
        />
      </mesh>

      <mesh position={[0, 2.72, -SEGMENT_LENGTH * SEGMENT_COUNT * 0.5]}>
        <boxGeometry args={[7.6, 0.04, SEGMENT_LENGTH * SEGMENT_COUNT + 26]} />
        <meshBasicMaterial color={palette.cool} transparent opacity={introMode ? 0.09 : 0.05} toneMapped={false} />
      </mesh>

      {[-1.65, 1.65].map((x, index) => (
        <mesh key={`aisle-edge-${index}`} position={[x, 0.02, -SEGMENT_LENGTH * SEGMENT_COUNT * 0.5]}>
          <boxGeometry args={[0.05, 0.01, SEGMENT_LENGTH * SEGMENT_COUNT + 16]} />
          <meshBasicMaterial color={palette.accent} transparent opacity={0.18} toneMapped={false} />
        </mesh>
      ))}

      {columnZPositions.map((z, index) => (
        <group key={`backdrop-column-${index}`}>
          <mesh position={[-WALL_OFFSET, 1.55, z]}>
            <boxGeometry args={[0.08, 2.9, 0.08]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? palette.cool : palette.accent}
              transparent
              opacity={introMode ? 0.18 : 0.12}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[WALL_OFFSET, 1.55, z]}>
            <boxGeometry args={[0.08, 2.9, 0.08]} />
            <meshBasicMaterial
              color={index % 2 === 0 ? palette.cool : palette.warm}
              transparent
              opacity={introMode ? 0.18 : 0.12}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[-4.95, 1.45, z]}>
            <boxGeometry args={[0.14, 1.6, 4.2]} />
            <meshStandardMaterial color="#0b131d" emissive={palette.ambient} emissiveIntensity={0.08} roughness={0.7} />
          </mesh>
          <mesh position={[4.95, 1.45, z]}>
            <boxGeometry args={[0.14, 1.6, 4.2]} />
            <meshStandardMaterial color="#0b131d" emissive={palette.ambient} emissiveIntensity={0.08} roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DatacenterSegment({
  segmentIndex,
  palette,
  seed,
  equipmentMap,
}: {
  segmentIndex: number;
  palette: (typeof paletteMap)[keyof typeof paletteMap];
  seed: number;
  equipmentMap: Map<string, (typeof staticEquipmentCatalog)[number]>;
}) {
  const racks = useMemo(() => {
    const layout: Array<{
      rack: Rack;
      position: [number, number, number];
      rotation: [number, number, number];
      lodIndex: number;
    }> = [];
    for (let i = 0; i < RACKS_PER_SEGMENT; i += 1) {
      const z = -i * RACK_SPACING - 0.8;
      const leftIndex = segmentIndex * RACKS_PER_SEGMENT * 2 + i * 2;
      const rightIndex = leftIndex + 1;
      layout.push({
        rack: buildDatacenterRack(leftIndex, seed),
        position: [-AISLE_HALF_WIDTH, 0, z],
        rotation: [0, Math.PI / 2, 0],
        lodIndex: leftIndex,
      });
      layout.push({
        rack: buildDatacenterRack(rightIndex, seed + 5),
        position: [AISLE_HALF_WIDTH, 0, z],
        rotation: [0, -Math.PI / 2, 0],
        lodIndex: rightIndex,
      });
    }
    return layout;
  }, [segmentIndex, seed]);

  const indicatorNodes = useMemo(() => {
    const rng = createSeededRandom(seed + segmentIndex * 17);
    const heights = [0.34, 0.78, 1.22, 1.68, 2.12, 2.48];
    const colors = [palette.cool, palette.accent, palette.warm];

    return racks.flatMap((rack, index) => {
      const baseX = rack.position[0] > 0 ? rack.position[0] - 0.6 : rack.position[0] + 0.6;
      return heights.flatMap((height, heightIndex) =>
        [-0.34, 0.34]
          .filter((_, offsetIndex) => heightIndex === 0 || (heightIndex + offsetIndex + index) % 2 === 0)
          .map((zOffset) => ({
            position: [baseX, height, rack.position[2] + zOffset] as [number, number, number],
            color: colors[Math.floor(rng() * colors.length)],
            phase: rng() * Math.PI * 2,
          }))
      );
    });
  }, [palette, racks, seed, segmentIndex]);

  const stripTransforms = useMemo(() => {
    const transforms: Array<{ position: THREE.Vector3; rotation: THREE.Euler }> = [];
    racks.forEach((rack) => {
      const sideOffset = rack.position[0] > 0 ? -0.55 : 0.55;
      const baseX = rack.position[0] + sideOffset;
      const rotation = new THREE.Euler(0, rack.position[0] > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      [0.22, 1.18, 2.16].forEach((y) => {
        transforms.push(
          {
            position: new THREE.Vector3(baseX, y, rack.position[2] + 0.28),
            rotation,
          },
          {
            position: new THREE.Vector3(baseX, y, rack.position[2] - 0.2),
            rotation,
          }
        );
      });
    });
    return transforms;
  }, [racks]);

  const detailLights = useMemo(() => {
    const rng = createSeededRandom(seed + segmentIndex * 29);
    const colors = [palette.cool, palette.accent, palette.warm];
    const white = new THREE.Color("#ffffff");
    const levels = [0.24, 0.42, 0.6, 0.78, 0.96, 1.14, 1.32, 1.5, 1.68, 1.86, 2.04, 2.22, 2.4];
    const zOffsets = [-0.26, -0.1, 0.1, 0.26];

    return racks.flatMap((rack, rackIndex) => {
      const faceX = rack.position[0] > 0 ? rack.position[0] - RACK_FACE_OFFSET : rack.position[0] + RACK_FACE_OFFSET;
      const rotation = new THREE.Euler(0, rack.position[0] > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      return levels.flatMap((y, levelIndex) =>
        zOffsets
          .filter((_, zIndex) => (levelIndex + zIndex + rackIndex) % 2 === 0 || levelIndex % 4 === 0)
          .map((zOffset) => ({
            position: new THREE.Vector3(faceX, y, rack.position[2] + zOffset),
            rotation,
            color: colors[Math.floor(rng() * colors.length)]
              .clone()
              .lerp(white, 0.18 + rng() * 0.16),
          }))
      );
    });
  }, [palette, racks, seed, segmentIndex]);

  return (
    <group>
      <mesh position={[0, -0.02, -SEGMENT_LENGTH / 2]} receiveShadow>
        <boxGeometry args={[10.2, 0.04, SEGMENT_LENGTH]} />
        <meshStandardMaterial
          color={palette.floor}
          metalness={0.35}
          roughness={0.45}
          emissive={palette.ambient}
          emissiveIntensity={0.08}
        />
      </mesh>

      <mesh position={[0, 3.05, -SEGMENT_LENGTH / 2]} receiveShadow>
        <boxGeometry args={[10.2, 0.06, SEGMENT_LENGTH]} />
        <meshStandardMaterial
          color="#151c26"
          metalness={0.5}
          roughness={0.25}
          emissive={palette.ambient}
          emissiveIntensity={0.1}
        />
      </mesh>

      {Array.from({ length: 5 }).map((_, index) => (
        <mesh key={`ceiling-rib-${segmentIndex}-${index}`} position={[0, 2.92, -2.8 - index * 4.1]}>
          <boxGeometry args={[8.5, 0.03, 0.22]} />
          <meshBasicMaterial color={palette.cool} transparent opacity={0.12} toneMapped={false} />
        </mesh>
      ))}

      <mesh position={[-4.6, 1.5, -SEGMENT_LENGTH / 2]} receiveShadow>
        <boxGeometry args={[0.2, 3.1, SEGMENT_LENGTH]} />
        <meshStandardMaterial color="#10151d" metalness={0.3} roughness={0.7} />
      </mesh>
      <mesh position={[4.6, 1.5, -SEGMENT_LENGTH / 2]} receiveShadow>
        <boxGeometry args={[0.2, 3.1, SEGMENT_LENGTH]} />
        <meshStandardMaterial color="#10151d" metalness={0.3} roughness={0.7} />
      </mesh>

      <mesh position={[0, 2.72, -SEGMENT_LENGTH / 2]}>
        <boxGeometry args={[6, 0.05, SEGMENT_LENGTH - 2]} />
        <meshStandardMaterial
          color={palette.cool}
          emissive={palette.cool}
          emissiveIntensity={0.5}
          roughness={0.12}
        />
      </mesh>

      {[-1.1, 1.1].map((x, index) => (
        <mesh key={`floor-trace-${segmentIndex}-${index}`} position={[x, 0.015, -SEGMENT_LENGTH / 2]}>
          <boxGeometry args={[0.05, 0.01, SEGMENT_LENGTH - 1.2]} />
          <meshBasicMaterial color={index === 0 ? palette.cool : palette.accent} transparent opacity={0.18} toneMapped={false} />
        </mesh>
      ))}

      <pointLight
        position={[0, 2.8, -SEGMENT_LENGTH / 2]}
        intensity={1.1}
        color={palette.cool}
        distance={11}
        decay={2}
      />
      <pointLight
        position={[0, 1.1, -SEGMENT_LENGTH / 2 + 4]}
        intensity={0.8}
        color={palette.accent}
        distance={7}
        decay={2}
      />

      {racks.map((rack) => (
        <group
          key={rack.rack.id}
          position={rack.position}
          rotation={rack.rotation}
        >
          <Rack3D
            rack={rack.rack}
            position={[0, 0, 0]}
            isSelected={false}
            onSelect={() => {}}
            equipmentCatalog={equipmentMap}
            showHud={false}
            detailBudget={DETAIL_BUDGET}
            lodIndex={rack.lodIndex}
            detailRadius={DETAIL_RADIUS}
          />
        </group>
      ))}

      {indicatorNodes.map((indicator, index) => (
        <BlinkingIndicator
          key={`indicator-${segmentIndex}-${index}`}
          position={indicator.position}
          color={indicator.color}
          phase={indicator.phase}
          intensity={3.8}
        />
      ))}

      <RackLedStrips transforms={stripTransforms} color={palette.cool} />
      <RackDetailLights lights={detailLights} />
    </group>
  );
}

function CameraRig({
  motionFactor,
  introMode,
}: {
  motionFactor: number;
  introMode: boolean;
}) {
  const { camera } = useThree();
  const driftTarget = useRef(new THREE.Vector3(0, 0, 0));
  const driftTime = useRef(0);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    driftTime.current += delta;
    if (driftTime.current > (introMode ? 1.8 : 2.4)) {
      driftTime.current = 0;
      driftTarget.current.set(
        Math.sin(t * 0.35) * (introMode ? 0.58 : 0.4),
        1.42 + Math.cos(t * 0.22) * (introMode ? 0.24 : 0.18),
        introMode ? 2.45 : 2.8
      );
    }
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, driftTarget.current.x, introMode ? 0.06 : 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, driftTarget.current.y, introMode ? 0.06 : 0.04);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, driftTarget.current.z, introMode ? 0.06 : 0.04);

    const lookAhead = (introMode ? -5.4 : -4.2) - Math.sin(t * 0.15) * (introMode ? 1.35 : 1.0);
    camera.lookAt(
      THREE.MathUtils.lerp(0, Math.sin(t * 0.2) * 0.32, motionFactor),
      1.35 + Math.sin(t * 0.3) * 0.14,
      lookAhead
    );
  });

  return null;
}

function DatacenterScene({
  palette,
  seed,
  paused,
  reducedMotion,
  introMode,
}: {
  palette: (typeof paletteMap)[keyof typeof paletteMap];
  seed: number;
  paused: boolean;
  reducedMotion: boolean;
  introMode: boolean;
}) {
  const motionFactor = reducedMotion ? 0.35 : 1;
  const equipmentMap = useMemo(
    () => new Map(staticEquipmentCatalog.map((item) => [item.id, item])),
    []
  );
  const segmentRefs = useRef<THREE.Group[]>([]);

  useFrame((_, delta) => {
    if (paused) return;
    const move = delta * (introMode ? 1.34 : 1.2) * motionFactor;
    segmentRefs.current.forEach((segment) => {
      segment.position.z += move;
      if (segment.position.z > SEGMENT_LENGTH) {
        segment.position.z -= SEGMENT_LENGTH * SEGMENT_COUNT;
      }
    });
  });

  return (
    <>
      <color attach="background" args={[palette.base]} />
      <fog attach="fog" args={[palette.base, 12, 80]} />
      <PerspectiveCamera makeDefault fov={introMode ? 40 : 42} position={[0, 1.55, introMode ? 2.45 : 2.8]} />

      <ambientLight intensity={introMode ? 0.52 : 0.45} color={palette.ambient} />
      <directionalLight
        position={[-6, 7.5, 5]}
        intensity={introMode ? 1.05 : 0.9}
        color={palette.cool}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-bias={-0.00015}
      />
      <directionalLight
        position={[6, 6, -4]}
        intensity={introMode ? 0.44 : 0.35}
        color={palette.warm}
      />
      <pointLight position={[0, 2.25, 4]} intensity={introMode ? 0.85 : 0.55} color={palette.accent} distance={9} decay={2} />

      <ArchitecturalBackdrop palette={palette} introMode={introMode} />

      <group position={[0, 0, 0]}>
        {Array.from({ length: SEGMENT_COUNT }).map((_, index) => (
          <group
            key={`segment-${index}`}
            ref={(node) => {
              if (node) segmentRefs.current[index] = node;
            }}
            position={[0, 0, -index * SEGMENT_LENGTH]}
          >
            <DatacenterSegment
              segmentIndex={index}
              palette={palette}
              seed={seed}
              equipmentMap={equipmentMap}
            />
          </group>
        ))}
      </group>

      <CameraRig motionFactor={motionFactor} introMode={introMode} />
    </>
  );
}

export function HeroAnimation({
  className,
  variant = "intro",
  seed = 420,
}: HeroAnimationProps) {
  const reducedMotion = usePrefersReducedMotion();
  const visible = usePageVisibility();
  const { containerRef, isVisible } = useHeroVisibility();
  const palette = paletteMap[variant];
  const deviceTier = useMemo(() => getDeviceTier(), []);
  const paused = !visible || !isVisible;
  const lowQuality = reducedMotion || deviceTier === "low";
  const mediumQuality = !lowQuality && deviceTier === "medium";
  const introMode = variant === "intro";

  const sceneSeed = lowQuality ? seed + 31 : mediumQuality ? seed + 13 : seed;
  const dprRange: [number, number] = lowQuality
    ? [0.5, 0.75]
    : mediumQuality
      ? introMode
        ? [0.9, 1.15]
        : [0.65, 0.9]
      : introMode
        ? [1, 1.5]
        : [0.75, 1];

  return (
    <div ref={containerRef} className={className}>
      <Canvas
        shadows={!lowQuality}
        dpr={dprRange}
        gl={{ antialias: !lowQuality, powerPreference: "high-performance" }}
        frameloop={paused ? "never" : "always"}
        performance={{ min: lowQuality ? 0.3 : introMode ? 0.6 : 0.5 }}
        className="h-full w-full"
      >
        <DatacenterScene
          palette={palette}
          seed={sceneSeed}
          paused={paused}
          reducedMotion={reducedMotion}
          introMode={introMode}
        />
      </Canvas>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: introMode
            ? "radial-gradient(circle at 18% 20%, rgba(34, 211, 238, 0.16), transparent 28%), radial-gradient(circle at 82% 18%, rgba(109, 124, 255, 0.14), transparent 24%), linear-gradient(180deg, rgba(0, 0, 0, 0.12) 0%, rgba(0, 0, 0, 0.26) 45%, rgba(0, 0, 0, 0.78) 100%)"
            : "linear-gradient(180deg, rgba(0, 0, 0, 0.16) 0%, rgba(0, 0, 0, 0.32) 45%, rgba(0, 0, 0, 0.8) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)",
          backgroundSize: introMode ? "84px 84px" : "120px 120px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/80" />
    </div>
  );
}
