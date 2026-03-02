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
  }, [transforms]);

  return instanceCount === 0 ? null : (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instanceCount]}>
      <boxGeometry args={[0.08, 0.04, 0.5]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={3.0}
        roughness={0.35}
        metalness={0.2}
        toneMapped={false}
      />
    </instancedMesh>
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
    return racks.flatMap((rack, index) => {
      const colors = [palette.cool, palette.accent, palette.warm];
      const baseX = rack.position[0] > 0 ? rack.position[0] - 0.6 : rack.position[0] + 0.6;
      const baseZ = rack.position[2] + (index % 2 === 0 ? 0.4 : -0.4);
      return [
        {
          position: [baseX, 0.55, baseZ] as [number, number, number],
          color: colors[Math.floor(rng() * colors.length)],
          phase: rng() * Math.PI * 2,
        },
        {
          position: [baseX, 1.65, baseZ] as [number, number, number],
          color: colors[Math.floor(rng() * colors.length)],
          phase: rng() * Math.PI * 2,
        },
      ];
    });
  }, [palette, racks, seed, segmentIndex]);

  const stripTransforms = useMemo(() => {
    const transforms: Array<{ position: THREE.Vector3; rotation: THREE.Euler }> = [];
    racks.forEach((rack) => {
      const sideOffset = rack.position[0] > 0 ? -0.55 : 0.55;
      const baseX = rack.position[0] + sideOffset;
      const baseZ = rack.position[2] + 0.25;
      transforms.push(
        {
          position: new THREE.Vector3(baseX, 0.25, baseZ),
          rotation: new THREE.Euler(0, rack.position[0] > 0 ? Math.PI / 2 : -Math.PI / 2, 0),
        },
        {
          position: new THREE.Vector3(baseX, 2.35, baseZ),
          rotation: new THREE.Euler(0, rack.position[0] > 0 ? Math.PI / 2 : -Math.PI / 2, 0),
        }
      );
    });
    return transforms;
  }, [racks]);

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
          emissiveIntensity={0.4}
          roughness={0.12}
        />
      </mesh>

      <pointLight
        position={[0, 2.8, -SEGMENT_LENGTH / 2]}
        intensity={1.0}
        color={palette.cool}
        distance={11}
        decay={2}
      />
      <pointLight
        position={[0, 1.1, -SEGMENT_LENGTH / 2 + 4]}
        intensity={0.7}
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
        />
      ))}

      <RackLedStrips transforms={stripTransforms} color={palette.cool} />
    </group>
  );
}

function CameraRig({ motionFactor }: { motionFactor: number }) {
  const { camera } = useThree();
  const driftTarget = useRef(new THREE.Vector3(0, 0, 0));
  const driftTime = useRef(0);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    driftTime.current += delta;
    if (driftTime.current > 2.4) {
      driftTime.current = 0;
      driftTarget.current.set(
        Math.sin(t * 0.35) * 0.4,
        1.42 + Math.cos(t * 0.22) * 0.18,
        2.8
      );
    }
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, driftTarget.current.x, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, driftTarget.current.y, 0.04);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, driftTarget.current.z, 0.04);

    const lookAhead = -4.2 - Math.sin(t * 0.15) * 1.0;
    camera.lookAt(
      THREE.MathUtils.lerp(0, Math.sin(t * 0.2) * 0.28, motionFactor),
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
}: {
  palette: (typeof paletteMap)[keyof typeof paletteMap];
  seed: number;
  paused: boolean;
  reducedMotion: boolean;
}) {
  const motionFactor = reducedMotion ? 0.35 : 1;
  const equipmentMap = useMemo(
    () => new Map(staticEquipmentCatalog.map((item) => [item.id, item])),
    []
  );
  const segmentRefs = useRef<THREE.Group[]>([]);

  useFrame((_, delta) => {
    if (paused) return;
    const move = delta * 1.2 * motionFactor;
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
      <PerspectiveCamera makeDefault fov={42} position={[0, 1.55, 2.8]} />

      <ambientLight intensity={0.45} color={palette.ambient} />
      <directionalLight
        position={[-6, 7.5, 5]}
        intensity={0.9}
        color={palette.cool}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-bias={-0.00015}
      />
      <directionalLight
        position={[6, 6, -4]}
        intensity={0.35}
        color={palette.warm}
      />

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

      <CameraRig motionFactor={motionFactor} />
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

  const sceneSeed = lowQuality ? seed + 31 : mediumQuality ? seed + 13 : seed;
  const dprRange: [number, number] = lowQuality
    ? [0.5, 0.75]
    : mediumQuality
      ? [0.65, 0.9]
      : [0.75, 1];

  return (
    <div ref={containerRef} className={className}>
      <Canvas
        shadows={!lowQuality}
        dpr={dprRange}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        frameloop={paused ? "never" : "always"}
        performance={{ min: lowQuality ? 0.3 : 0.5 }}
        className="h-full w-full"
      >
        <DatacenterScene
          palette={palette}
          seed={sceneSeed}
          paused={paused}
          reducedMotion={reducedMotion}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80" />
    </div>
  );
}
