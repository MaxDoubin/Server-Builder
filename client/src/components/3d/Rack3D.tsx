import { Html, Instances, Instance } from "@react-three/drei";
import { useRef, useState, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Rack, Equipment } from "@shared/schema";
import type { BuildMode } from "@/lib/build-context";
import { EquipmentMesh } from "./EquipmentMesh";
import {
  getBoxGeometry,
  getPlaneGeometry,
  getStandardMaterial,
  getPhysicalMaterial,
  getBasicMaterial,
} from "@/lib/asset-pool";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Thermometer, Zap } from "lucide-react";
import { logWarning } from "@/lib/error-log";

interface Rack3DProps {
  rack: Rack;
  position: [number, number, number];
  isSelected: boolean;
  onSelect: () => void;
  equipmentCatalog: Map<string, Equipment>;
  forceSimplified?: boolean;
  detailBudget?: number;
  lodIndex?: number;
  detailRadius?: number;
  buildMode?: BuildMode;
  onDragStart?: (point: THREE.Vector3) => void;
  isDragging?: boolean;
  rackScale?: number;
  showHud?: boolean;
}

const RACK_WIDTH = 0.85;
const RACK_DEPTH = 1.4;
const RACK_HEIGHT = 2.8;
const U_HEIGHT = RACK_HEIGHT / 42;
const FRAME_THICKNESS = 0.025;
const POST_SIZE = 0.04;
const RAIL_GEOMETRY = getBoxGeometry([
  RACK_WIDTH - POST_SIZE * 2,
  FRAME_THICKNESS,
  FRAME_THICKNESS,
]);
const RAIL_MATERIAL = getStandardMaterial({
  color: "#1a1d24",
  metalness: 0.8,
  roughness: 0.2,
});

function RackFrame({
  isSelected,
  thermalStatus,
  statusGlowIntensity,
}: {
  isSelected: boolean;
  thermalStatus: string;
  statusGlowIntensity: number;
}) {
  const frameColor = "#1a1d24";
  const highlightColor = isSelected ? "#4488ff" : "#2a2d34";

  const statusGlowHex = useMemo(() => {
    switch (thermalStatus) {
      case "critical":
        return "#ff3333";
      case "warning":
        return "#ff9900";
      case "elevated":
        return "#ffff00";
      default:
        return "#00ff66";
    }
  }, [thermalStatus]);

  return (
    <group>
      {[
        [-RACK_WIDTH / 2 + POST_SIZE / 2, RACK_HEIGHT / 2, -RACK_DEPTH / 2 + POST_SIZE / 2],
        [RACK_WIDTH / 2 - POST_SIZE / 2, RACK_HEIGHT / 2, -RACK_DEPTH / 2 + POST_SIZE / 2],
        [-RACK_WIDTH / 2 + POST_SIZE / 2, RACK_HEIGHT / 2, RACK_DEPTH / 2 - POST_SIZE / 2],
        [RACK_WIDTH / 2 - POST_SIZE / 2, RACK_HEIGHT / 2, RACK_DEPTH / 2 - POST_SIZE / 2],
      ].map((pos, i) => (
        <mesh key={`post-${i}`} position={pos as [number, number, number]} castShadow>
          <primitive object={getBoxGeometry([POST_SIZE, RACK_HEIGHT, POST_SIZE])} attach="geometry" />
          <primitive
            object={getStandardMaterial({
              color: highlightColor,
              metalness: 0.85,
              roughness: 0.15,
            })}
            attach="material"
          />
        </mesh>
      ))}

      <Instances geometry={RAIL_GEOMETRY} material={RAIL_MATERIAL} castShadow>
        {[0, RACK_HEIGHT].map((y, i) => (
          <group key={`rails-${i}`}>
            <Instance position={[0, y, -RACK_DEPTH / 2 + FRAME_THICKNESS / 2]} />
            <Instance position={[0, y, RACK_DEPTH / 2 - FRAME_THICKNESS / 2]} />
          </group>
        ))}
      </Instances>
      <Instances
        geometry={getBoxGeometry([FRAME_THICKNESS, FRAME_THICKNESS, RACK_DEPTH - POST_SIZE * 2])}
        material={RAIL_MATERIAL}
        castShadow
      >
        {[0, RACK_HEIGHT].map((y, i) => (
          <group key={`rails-depth-${i}`}>
            <Instance position={[-RACK_WIDTH / 2 + FRAME_THICKNESS / 2, y, 0]} />
            <Instance position={[RACK_WIDTH / 2 - FRAME_THICKNESS / 2, y, 0]} />
          </group>
        ))}
      </Instances>

      <mesh position={[-RACK_WIDTH / 2 + 0.015, RACK_HEIGHT / 2, 0]}>
        <primitive object={getBoxGeometry([0.008, RACK_HEIGHT - 0.05, RACK_DEPTH - 0.15])} attach="geometry" />
        <primitive
          object={getStandardMaterial({ color: "#0a0c10", metalness: 0.3, roughness: 0.7 })}
          attach="material"
        />
      </mesh>
      <mesh position={[RACK_WIDTH / 2 - 0.015, RACK_HEIGHT / 2, 0]}>
        <primitive object={getBoxGeometry([0.008, RACK_HEIGHT - 0.05, RACK_DEPTH - 0.15])} attach="geometry" />
        <primitive
          object={getStandardMaterial({ color: "#0a0c10", metalness: 0.3, roughness: 0.7 })}
          attach="material"
        />
      </mesh>

      <mesh position={[0, RACK_HEIGHT / 2, RACK_DEPTH / 2 + 0.003]} receiveShadow>
        <primitive object={getPlaneGeometry([RACK_WIDTH - 0.06, RACK_HEIGHT - 0.04])} attach="geometry" />
        <primitive
          object={getPhysicalMaterial({
            color: "#1a2030",
            transparent: true,
            opacity: 0.3,
            metalness: 0.1,
            roughness: 0.1,
            transmission: 0.7,
            thickness: 0.01,
            side: THREE.DoubleSide,
          })}
          attach="material"
        />
      </mesh>

      <mesh position={[0, RACK_HEIGHT / 2, RACK_DEPTH / 2 + 0.004]}>
        <primitive object={getPlaneGeometry([RACK_WIDTH - 0.08, RACK_HEIGHT - 0.06])} attach="geometry" />
        <primitive object={getBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.02 })} attach="material" />
      </mesh>

      <mesh position={[0, RACK_HEIGHT / 2, RACK_DEPTH / 2 + 0.002]}>
        <primitive object={getBoxGeometry([RACK_WIDTH - 0.04, 0.01, 0.002])} attach="geometry" />
        <primitive
          object={getStandardMaterial({ color: frameColor, metalness: 0.9, roughness: 0.1 })}
          attach="material"
        />
      </mesh>

      <mesh position={[0, 0.02, RACK_DEPTH / 2 + 0.005]}>
        <primitive object={getBoxGeometry([RACK_WIDTH - 0.08, 0.015, 0.003])} attach="geometry" />
        <primitive
          object={getStandardMaterial({
            color: statusGlowHex,
            emissive: statusGlowHex,
            emissiveIntensity: statusGlowIntensity,
          })}
          attach="material"
        />
      </mesh>

      <mesh position={[0, RACK_HEIGHT - 0.02, RACK_DEPTH / 2 + 0.005]}>
        <primitive object={getBoxGeometry([RACK_WIDTH - 0.08, 0.015, 0.003])} attach="geometry" />
        <primitive
          object={getStandardMaterial({
            color: statusGlowHex,
            emissive: statusGlowHex,
            emissiveIntensity: statusGlowIntensity,
          })}
          attach="material"
        />
      </mesh>
      <mesh position={[0, RACK_HEIGHT - 0.06, RACK_DEPTH / 2 + 0.01]}>
        <primitive object={getBoxGeometry([RACK_WIDTH - 0.1, 0.03, 0.01])} attach="geometry" />
        <primitive object={getBasicMaterial({ color: statusGlowHex })} attach="material" />
      </mesh>

      {[0.2, 0.4, 0.6, 0.8].map((y, i) => (
        <mesh key={`vent-${i}`} position={[0, y * RACK_HEIGHT + 0.1, -RACK_DEPTH / 2 + 0.02]}>
          <primitive object={getBoxGeometry([RACK_WIDTH - 0.1, 0.02, 0.005])} attach="geometry" />
          <primitive object={getStandardMaterial({ color: "#0a0c10" })} attach="material" />
        </mesh>
      ))}

      {isSelected && (
        <mesh position={[0, RACK_HEIGHT / 2, RACK_DEPTH / 2 + 0.006]}>
          <primitive object={getPlaneGeometry([RACK_WIDTH - 0.04, RACK_HEIGHT - 0.02])} attach="geometry" />
          <primitive
            object={getBasicMaterial({ color: "#4488ff", transparent: true, opacity: 0.15 })}
            attach="material"
          />
        </mesh>
      )}
    </group>
  );
}

function SimplifiedRack({ thermalStatus }: { thermalStatus: string }) {
  const statusGlowHex = useMemo(() => {
    switch (thermalStatus) {
      case "critical":
        return "#ff3333";
      case "warning":
        return "#ff9900";
      case "elevated":
        return "#ffff00";
      default:
        return "#00ff66";
    }
  }, [thermalStatus]);

  return (
    <group>
      <mesh position={[0, RACK_HEIGHT / 2, 0]} castShadow>
        <primitive object={getBoxGeometry([RACK_WIDTH - 0.02, RACK_HEIGHT, RACK_DEPTH - 0.02])} attach="geometry" />
        <primitive
          object={getStandardMaterial({ color: "#1a1d24", metalness: 0.6, roughness: 0.4 })}
          attach="material"
        />
      </mesh>
      <mesh position={[0, RACK_HEIGHT - 0.05, RACK_DEPTH / 2 + 0.01]}>
        <primitive object={getBoxGeometry([RACK_WIDTH - 0.08, 0.025, 0.01])} attach="geometry" />
        <primitive object={getBasicMaterial({ color: statusGlowHex })} attach="material" />
      </mesh>
      <mesh position={[0, 0.02, RACK_DEPTH / 2 + 0.01]}>
        <primitive object={getBoxGeometry([RACK_WIDTH - 0.1, 0.015, 0.003])} attach="geometry" />
        <primitive object={getBasicMaterial({ color: statusGlowHex })} attach="material" />
      </mesh>
    </group>
  );
}

function PlaceholderEquipment({
  position,
  width,
  height,
  depth,
}: {
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <primitive object={getBoxGeometry([width, height, depth])} attach="geometry" />
        <primitive
          object={getStandardMaterial({ color: "#4b5563", metalness: 0.2, roughness: 0.7 })}
          attach="material"
        />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.002]}>
        <primitive object={getBoxGeometry([width * 0.8, height * 0.3, 0.001])} attach="geometry" />
        <primitive object={getBasicMaterial({ color: "#f43f5e" })} attach="material" />
      </mesh>
    </group>
  );
}

export function Rack3D({
  rack,
  position,
  isSelected,
  onSelect,
  equipmentCatalog,
  forceSimplified = false,
  detailBudget,
  lodIndex = 0,
  detailRadius = 18,
  buildMode,
  onDragStart,
  isDragging = false,
  rackScale = 1,
  showHud = true,
}: Rack3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const { camera } = useThree();
  const missingLogged = useRef<Set<string>>(new Set());
  const appearDelay = 0;
  const appearDuration = 0.9;

  const operationalStatus = useMemo(() => {
    // 1. Check for critical equipment status
    const hasCriticalEq = rack.installedEquipment.some(eq => eq.status === "critical");
    if (hasCriticalEq || rack.inletTemp > 32 || rack.currentPowerDraw > rack.powerCapacity * 0.98) return "critical";

    // 2. Check for warning equipment status or elevated metrics
    const hasWarningEq = rack.installedEquipment.some(eq => eq.status === "warning");
    if (hasWarningEq || rack.inletTemp > 28 || rack.currentPowerDraw > rack.powerCapacity * 0.9) return "warning";

    // 3. Check for slightly elevated metrics
    if (rack.inletTemp > 25 || rack.currentPowerDraw > rack.powerCapacity * 0.75) return "elevated";

    return "normal";
  }, [rack.inletTemp, rack.currentPowerDraw, rack.powerCapacity, rack.installedEquipment]);

  const [isDetailedView, setIsDetailedView] = useState(true);
  const allowDetailed = !forceSimplified && (detailBudget === undefined || lodIndex < detailBudget);

  // Force re-render when rack._lastUpdate changes
  const [, forceUpdate] = useState({});
  useEffect(() => {
    forceUpdate({});
  }, [rack._lastUpdate]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      const elapsed = state.clock.getElapsedTime();
      const appearT = THREE.MathUtils.clamp((elapsed - appearDelay) / appearDuration, 0, 1);
      const eased = appearT * appearT * (3 - 2 * appearT);
      const appearLift = THREE.MathUtils.lerp(0, 0.12, eased);
      const baseY = position[1];
      const dragLift = isDragging ? 0.35 : 0;
      const targetY = baseY + appearLift + dragLift + (hovered || isSelected ? 0.05 : 0);
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        targetY,
        0.15
      );
      const scale = THREE.MathUtils.lerp(0.9, 1, eased);
      groupRef.current.scale.setScalar(scale * rackScale);
      if (buildMode === "rotate" && (hovered || isSelected)) {
        groupRef.current.rotation.y += delta * 0.8;
      }

      const distance = camera.position.distanceTo(
        new THREE.Vector3(position[0], position[1] + RACK_HEIGHT / 2, position[2])
      );
      const shouldBeDetailed = distance < detailRadius || isSelected || hovered;
      if (shouldBeDetailed !== isDetailedView) {
        setIsDetailedView(shouldBeDetailed);
      }
    }
  });

  const sortedEquipment = useMemo(() => {
    if (!allowDetailed) return [];
    return [...rack.installedEquipment].sort((a, b) => a.uStart - b.uStart);
  }, [allowDetailed, rack.installedEquipment]);

  // Dynamic glow intensity based on status - faster pulsing for critical
  const statusGlowIntensity = useMemo(() => {
    const baseGlow = 1.5;
    const pulseSpeed = operationalStatus === "critical" ? 0.006 : operationalStatus === "warning" ? 0.004 : 0.002;
    return baseGlow + Math.sin(Date.now() * pulseSpeed) * (operationalStatus === "critical" ? 0.8 : 0.4);
  }, [operationalStatus]);

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        onDragStart?.(e.point);
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      {isDetailedView && allowDetailed ? (
        <>
          <RackFrame
            isSelected={isSelected}
            thermalStatus={operationalStatus}
            statusGlowIntensity={statusGlowIntensity}
          />

          {sortedEquipment.map((installed) => {
            const equipment = equipmentCatalog.get(installed.equipmentId);
            if (!equipment) {
              if (!missingLogged.current.has(installed.equipmentId)) {
                missingLogged.current.add(installed.equipmentId);
                logWarning("Equipment asset missing. Rendering placeholder.", undefined, {
                  equipmentId: installed.equipmentId,
                  rackId: rack.id,
                });
              }
              const uHeight = Math.max(1, installed.uEnd - installed.uStart + 1) * U_HEIGHT;
              const yPos = (installed.uStart - 1) * U_HEIGHT + uHeight / 2;
              return (
                <PlaceholderEquipment
                  key={`placeholder-${installed.id}`}
                  position={[0, yPos, 0]}
                  width={RACK_WIDTH - 0.08}
                  height={uHeight}
                  depth={RACK_DEPTH - 0.1}
                />
              );
            }

            const yPos = (installed.uStart - 1) * U_HEIGHT + (equipment.uHeight * U_HEIGHT) / 2;

            return (
              <EquipmentMesh
                key={installed.id}
                equipment={equipment}
                installed={installed}
                position={[0, yPos, 0]}
                rackWidth={RACK_WIDTH}
                rackDepth={RACK_DEPTH}
                uHeight={U_HEIGHT}
              />
            );
          })}
        </>
      ) : (
        <SimplifiedRack thermalStatus={operationalStatus} />
      )}

      <mesh position={[0, RACK_HEIGHT / 2, 0]}>
        <boxGeometry args={[1.4, 3.2, 2.2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {(hovered || isSelected) && !forceSimplified && showHud && (
        <group>
          <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <primitive object={getPlaneGeometry([RACK_WIDTH + 0.1, RACK_DEPTH + 0.1])} attach="geometry" />
            <primitive
              object={getBasicMaterial({
                color: isSelected ? "#4488ff" : "#ffffff",
                transparent: true,
                opacity: 0.15,
              })}
              attach="material"
            />
          </mesh>
          <Html position={[0.8, RACK_HEIGHT + 0.45, 0]} distanceFactor={10} wrapperClass="pointer-events-none">
            <Card className="p-3 min-w-[200px] bg-black/80 backdrop-blur-md border-cyan-500/50 shadow-[0_0_30px_rgba(0,255,255,0.25)]">
              <div className="flex justify-between items-start mb-2">
                <div className="font-mono text-xs text-cyan-200 font-bold tracking-tight">
                  RACK {rack.name}
                </div>
                <Badge
                  variant="outline"
                  className={`text-[9px] uppercase h-4 px-1 ${
                    operationalStatus === "critical"
                      ? "border-red-500 text-red-400"
                      : operationalStatus === "warning"
                      ? "border-amber-500 text-amber-400"
                      : "border-green-500 text-green-400"
                  }`}
                >
                  {operationalStatus}
                </Badge>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] text-white/70">
                  <div className="flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-cyan-500" /> {rack.inletTemp}°C
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-500" /> {rack.currentPowerDraw}W
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[8px] text-white/50 uppercase">
                    <span>Power Usage</span>
                    <span>{Math.round((rack.currentPowerDraw / rack.powerCapacity) * 100)}%</span>
                  </div>
                  <Progress
                    value={(rack.currentPowerDraw / rack.powerCapacity) * 100}
                    className="h-1 bg-white/10"
                    indicatorClassName="bg-cyan-500 shadow-[0_0_5px_rgba(0,255,255,0.5)]"
                  />
                </div>
              </div>
            </Card>
          </Html>
        </group>
      )}
    </group>
  );
}
