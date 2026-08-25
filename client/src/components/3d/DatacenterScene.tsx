import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Stars, Preload } from "@react-three/drei";
import {
  Suspense,
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  type RefObject,
} from "react";
import { useGame } from "@/lib/game-context";
import { useTheme } from "@/lib/theme-provider";
import { Rack3D } from "./Rack3D";
import { EquipmentMesh } from "./EquipmentMesh";
import { DustMotes, HeatShimmer, AirflowParticles, VolumetricLight } from "./AtmosphericEffects";
import {
  RaisedFloor,
  CRACUnit,
  FireSuppressionSystem,
  EmergencyLight,
  StatusPanel,
} from "./EnvironmentElements";
import { DataCenterNetworkMesh } from "./NetworkTraffic";
import { HolographicHUD } from "./HolographicHUD";
import { CameraController, CinematicFlythrough } from "./CameraController";
import { generateProceduralRacks } from "./ProceduralRacks";
import { PerformanceOverlay } from "./PerformanceOverlay";
import type { Rack, Equipment, InstalledEquipment } from "@shared/schema";
import * as THREE from "three";
import { precompileSceneMaterials } from "@/lib/asset-manager";
import { rackHeatLevel } from "@/lib/capacity";
import { useBuild } from "@/lib/build-context";
import { logInfo, logWarning } from "@/lib/error-log";
import type { GameRenderProfile } from "@/lib/webgl-support";

/** Photo mode and the day / night toggle both need to reach into the Canvas. */
export type SceneCapture = () => Promise<Blob | null>;
export type LightingMode = "day" | "night";

interface DatacenterSceneProps {
  onSelectRack: (rack: Rack | null) => void;
  selectedRackId: string | null;
  isUnlocked: boolean;
  showEffects?: boolean;
  cameraMode?: "orbit" | "auto" | "cinematic";
  showHUD?: boolean;
  showPerfOverlay?: boolean;
  rackScale?: number;
  rackCount?: number;
  showHeatmap?: boolean;
  lightingMode?: LightingMode;
  /**
   * Set to true while a photo is being taken: parks the camera on a framing
   * that shows the floor rather than wherever the user left it.
   */
  photoFraming?: boolean;
  /** Filled in with a function that renders and returns a PNG of the canvas. */
  captureRef?: React.MutableRefObject<SceneCapture | null>;
  performanceMode?: boolean;
  qualityMode?: "low" | "high";
  visibleRacks?: Rack[];
  forceSimplified?: boolean;
  lodResetToken?: number;
  renderProfile?: GameRenderProfile;
  onPerfWarningChange?: (warning: string | null) => void;
  onPointerGridChange?: (positionX: number, positionY: number) => void;
  onPointerGridConfirm?: (positionX: number, positionY: number) => void;
  proceduralOptions?: {
    seed?: number;
    fillRateMultiplier?: number;
    errorRate?: number;
    tempBase?: number;
  };
}

function AdvancedLights({
  performanceMode = false,
  theme = "dark",
  lightingMode = "night",
}: {
  performanceMode?: boolean;
  theme?: "dark" | "light";
  lightingMode?: LightingMode;
}) {
  const isLight = theme === "light";
  /*
    Day is not just "brighter". A hall on day shift has the overheads on, so
    the fill lifts a long way and the colour temperature comes up towards
    daylight, while at night the room is lit by equipment LEDs and the aisle
    strips, which is cooler and much dimmer. Both multipliers are applied to
    the existing per-theme values so the light and dark site themes keep
    their own character.
  */
  const isDay = lightingMode === "day";
  const fill = isDay ? 2.1 : 1;
  const key = isDay ? 1.35 : 1;
  const warm = (dayColor: string, nightColor: string) => (isDay ? dayColor : nightColor);

  return (
    <>
      <ambientLight
        intensity={(isLight ? 0.55 : 0.25) * fill}
        color={warm("#fff4e2", isLight ? "#dbe8ff" : "#5b79c7")}
      />
      {!performanceMode && (
        <>
          <pointLight position={[0, 18, 0]} intensity={(isLight ? 0.8 : 0.6) * fill} color={warm("#fff1da", isLight ? "#d9f0ff" : "#8bbcff")} />
          <pointLight position={[20, 12, 20]} intensity={(isLight ? 0.6 : 0.4) * fill} color={warm("#ffeccd", isLight ? "#e8f4ff" : "#7fd4ff")} />
          <pointLight position={[-20, 12, -20]} intensity={(isLight ? 0.6 : 0.4) * fill} color={warm("#ffeccd", isLight ? "#e8f4ff" : "#7fd4ff")} />
        </>
      )}

      <directionalLight
        position={[60, 100, 40]}
        intensity={(performanceMode ? 0.8 : isLight ? 1.1 : 1.0) * key}
        color={warm("#fffaf0", isLight ? "#f4f7ff" : "#ffffff")}
        castShadow={!performanceMode}
        shadow-mapSize={performanceMode ? [1024, 1024] : [2048, 2048]}
        shadow-camera-far={200}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-bias={-0.0001}
      />

      {!performanceMode && (
        <>
          <spotLight
            position={[0, 35, 10]}
            angle={0.4}
            penumbra={0.6}
            intensity={(isLight ? 0.7 : 0.6) * key}
            color={warm("#ffe9c4", isLight ? "#b4d6ff" : "#8bbcff")}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <spotLight
            position={[0, 30, -12]}
            angle={0.45}
            penumbra={0.6}
            intensity={(isLight ? 0.6 : 0.5) * key}
            color={warm("#ffe4bd", isLight ? "#a5f3fc" : "#7ee7ff")}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
        </>
      )}

      <directionalLight position={[-40, 50, -30]} intensity={(isLight ? 0.45 : 0.3) * fill} color={warm("#ffe8cc", isLight ? "#d1e2ff" : "#6688ff")} />
      <directionalLight position={[0, 20, -50]} intensity={(isLight ? 0.25 : 0.2) * fill} color={isLight ? "#ffd2b3" : "#ff8844"} />

      <hemisphereLight
        color={warm("#fff3e0", isLight ? "#cfe2ff" : "#88aaff")}
        groundColor={isLight ? "#e9eef7" : "#442200"}
        intensity={(isLight ? 0.3 : 0.15) * fill}
      />
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh position={[0, 2, 0]}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#00aaff" wireframe />
    </mesh>
  );
}

function ScenePrecompiler() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    precompileSceneMaterials(gl, scene, camera);
  }, [gl, scene, camera]);
  return null;
}

function RendererRuntime({ renderProfile }: { renderProfile: GameRenderProfile }) {
  const { gl } = useThree();

  useEffect(() => {
    gl.domElement.style.touchAction = "none";

    const previousToneMapping = gl.toneMapping;
    const previousExposure = gl.toneMappingExposure;
    const previousColorSpace = gl.outputColorSpace;

    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure =
      renderProfile === "compatibility"
        ? 0.9
        : renderProfile === "balanced"
          ? 0.96
          : 1.02;
    gl.outputColorSpace = THREE.SRGBColorSpace;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      logWarning("WebGL context lost. Waiting for restoration.");
    };
    const handleContextRestored = () => {
      logInfo("WebGL context restored.");
    };

    gl.domElement.addEventListener("webglcontextlost", handleContextLost, false);
    gl.domElement.addEventListener("webglcontextrestored", handleContextRestored, false);

    return () => {
      gl.domElement.removeEventListener("webglcontextlost", handleContextLost, false);
      gl.domElement.removeEventListener("webglcontextrestored", handleContextRestored, false);
      gl.toneMapping = previousToneMapping;
      gl.toneMappingExposure = previousExposure;
      gl.outputColorSpace = previousColorSpace;
    };
  }, [gl, renderProfile]);

  return null;
}

interface SceneBridgeState {
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
}

/**
 * Hands the page a function that renders one frame and returns it as a PNG,
 * and publishes the live camera to code outside the Canvas.
 *
 * The explicit gl.render before toBlob is not optional. React Three Fiber
 * renders on its own schedule, and the drawing buffer is only guaranteed to
 * hold the last frame because the context is created with
 * preserveDrawingBuffer. Rendering immediately before the read removes any
 * question about which frame you get.
 */
function CaptureBridge({
  captureRef,
  stateRef,
}: {
  captureRef?: React.MutableRefObject<SceneCapture | null>;
  /** Lets DOM level handlers outside the Canvas reach the live camera. */
  stateRef: React.MutableRefObject<SceneBridgeState | null>;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    stateRef.current = { camera, canvas: gl.domElement };
    if (captureRef) {
      captureRef.current = () =>
        new Promise<Blob | null>((resolve) => {
          try {
            gl.render(scene, camera);
            gl.domElement.toBlob((blob) => resolve(blob), "image/png");
          } catch (error) {
            logWarning("Could not read the canvas for photo mode.", error);
            resolve(null);
          }
        });
    }
    return () => {
      stateRef.current = null;
      if (captureRef) captureRef.current = null;
    };
  }, [camera, captureRef, gl, scene, stateRef]);

  return null;
}

/**
 * Parks the camera on a three quarter view of the whole floor for a photo.
 *
 * Restores whatever the camera was doing when photo mode ends, so taking a
 * picture does not lose the user's place. The move is instant rather than
 * animated: a tween would need the capture to wait on it, and there is
 * nothing to watch while the UI is hidden anyway.
 */
function PhotoFraming({ active, floorSize }: { active: boolean; floorSize: number }) {
  const { camera } = useThree();
  const previous = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);

  useEffect(() => {
    if (!active) return;
    previous.current = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
    };
    const reach = Math.max(18, floorSize * 0.62);
    camera.position.set(reach, Math.max(12, floorSize * 0.34), reach);
    camera.lookAt(0, 2.4, 0);
    camera.updateProjectionMatrix();

    return () => {
      const saved = previous.current;
      if (!saved) return;
      camera.position.copy(saved.position);
      camera.quaternion.copy(saved.quaternion);
      camera.updateProjectionMatrix();
      previous.current = null;
    };
  }, [active, camera, floorSize]);

  return null;
}

function CameraBounds({
  controlsRef,
  minHeight,
  maxHeight,
}: {
  controlsRef: RefObject<any>;
  minHeight: number;
  maxHeight: number;
}) {
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls?.object) return;
    const { position } = controls.object;
    if (position.y > maxHeight) position.y = maxHeight;
    if (position.y < minHeight) position.y = minHeight;
  });
  return null;
}

interface RackGridProps {
  racks: Rack[];
  selectedRackId: string | null;
  onSelectRack: (rack: Rack | null) => void;
  equipmentCatalog: Map<string, Equipment>;
  showHeatShimmer?: boolean;
  showNetworkMesh?: boolean;
  heatmapMode?: boolean;
  forceSimplified?: boolean;
  detailBudget?: number;
  buildMode: ReturnType<typeof useBuild>["mode"];
  canMove: boolean;
  onMoveRack: (rackId: string, positionX: number, positionY: number) => void;
  rackScale: number;
  onPointerGridChange?: (positionX: number, positionY: number) => void;
}

function RackGrid({
  racks,
  selectedRackId,
  onSelectRack,
  equipmentCatalog,
  showHeatShimmer = true,
  showNetworkMesh = true,
  heatmapMode = false,
  forceSimplified = false,
  detailBudget,
  buildMode,
  canMove,
  onMoveRack,
  rackScale,
  onPointerGridChange,
}: RackGridProps) {
  const rackSpacing = 2.8;
  const aisleSpacing = 5.2;
  const { camera, raycaster, mouse } = useThree();
  const draggingRef = useRef<{
    rackId: string;
    offsetX: number;
    offsetZ: number;
    worldX: number;
    worldZ: number;
    snapX: number;
    snapY: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    rackId: string;
    worldX: number;
    worldZ: number;
    snapX: number;
    snapY: number;
  } | null>(null);
  const pointerGridRef = useRef<{ x: number; y: number } | null>(null);
  const intersectionRef = useRef(new THREE.Vector3());
  const floorPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const maxCol = Math.max(...racks.map((r) => r.positionX), 0);
  const maxRow = Math.max(...racks.map((r) => r.positionY), 0);
  const centerX = (maxCol * rackSpacing) / 2;
  const centerZ = (maxRow * aisleSpacing) / 2;

  const rackPositions = useMemo(() => {
    return racks.map((rack) => ({
      rack,
      position: [
        rack.positionX * rackSpacing - centerX,
        0,
        rack.positionY * aisleSpacing - centerZ,
      ] as [number, number, number],
    }));
  }, [racks, rackSpacing, aisleSpacing, centerX, centerZ]);

  /*
    Real thermal load per rack, computed once per rack rather than per frame
    and only while the heatmap is on. rackHeatLevel quantises to twelfths so
    the colours resolve to a dozen pooled materials instead of one per rack.
  */
  const heatLevels = useMemo(() => {
    if (!heatmapMode) return null;
    const levels = new Map<string, number>();
    for (const rack of racks) {
      levels.set(rack.id, rackHeatLevel(rack, equipmentCatalog));
    }
    return levels;
  }, [equipmentCatalog, heatmapMode, racks]);

  useFrame(() => {
    const drag = draggingRef.current;
    if (!drag && onPointerGridChange) {
      raycaster.setFromCamera(mouse, camera);
      const intersection = intersectionRef.current;
      if (raycaster.ray.intersectPlane(floorPlane, intersection)) {
        const positionX = Math.round((intersection.x + centerX) / rackSpacing);
        const positionY = Math.round((intersection.z + centerZ) / aisleSpacing);
        const last = pointerGridRef.current;
        if (!last || last.x !== positionX || last.y !== positionY) {
          pointerGridRef.current = { x: positionX, y: positionY };
          onPointerGridChange(positionX, positionY);
        }
      }
    }
    if (!drag) return;
    raycaster.setFromCamera(mouse, camera);
    const intersection = intersectionRef.current;
    if (!raycaster.ray.intersectPlane(floorPlane, intersection)) return;
    const targetX = intersection.x + drag.offsetX;
    const targetZ = intersection.z + drag.offsetZ;
    const positionX = Math.round((targetX + centerX) / rackSpacing);
    const positionY = Math.round((targetZ + centerZ) / aisleSpacing);
    if (
      drag.worldX === targetX &&
      drag.worldZ === targetZ &&
      drag.snapX === positionX &&
      drag.snapY === positionY
    ) {
      return;
    }
    drag.worldX = targetX;
    drag.worldZ = targetZ;
    drag.snapX = positionX;
    drag.snapY = positionY;
    setDragPreview({
      rackId: drag.rackId,
      worldX: targetX,
      worldZ: targetZ,
      snapX: positionX,
      snapY: positionY,
    });
  });

  useEffect(() => {
    const stopDrag = () => {
      const drag = draggingRef.current;
      if (drag) {
        onMoveRack(drag.rackId, drag.snapX, drag.snapY);
      }
      draggingRef.current = null;
      setDragPreview(null);
    };
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [onMoveRack]);

  return (
    <group>
      {rackPositions.map(({ rack, position }, index) => (
        <group key={rack.id}>
          {dragPreview?.rackId === rack.id ? (
            <Rack3D
              rack={rack}
              position={[dragPreview.worldX, 0, dragPreview.worldZ]}
              isSelected={rack.id === selectedRackId}
              onSelect={() => onSelectRack(rack)}
              equipmentCatalog={equipmentCatalog}
              forceSimplified={forceSimplified}
              detailBudget={detailBudget}
              lodIndex={index}
              buildMode={buildMode}
              isDragging
              rackScale={rackScale}
              heatLevel={heatLevels?.get(rack.id) ?? null}
              onDragStart={(point) => {
                if (!canMove || buildMode !== "place") return;
                draggingRef.current = {
                  rackId: rack.id,
                  offsetX: position[0] - point.x,
                  offsetZ: position[2] - point.z,
                  worldX: dragPreview.worldX,
                  worldZ: dragPreview.worldZ,
                  snapX: dragPreview.snapX,
                  snapY: dragPreview.snapY,
                };
              }}
            />
          ) : (
            <Rack3D
              rack={rack}
              position={position}
              isSelected={rack.id === selectedRackId}
              onSelect={() => onSelectRack(rack)}
              equipmentCatalog={equipmentCatalog}
              forceSimplified={forceSimplified}
              detailBudget={detailBudget}
              lodIndex={index}
              buildMode={buildMode}
              rackScale={rackScale}
              heatLevel={heatLevels?.get(rack.id) ?? null}
              onDragStart={(point) => {
                if (!canMove || buildMode !== "place") return;
                draggingRef.current = {
                  rackId: rack.id,
                  offsetX: position[0] - point.x,
                  offsetZ: position[2] - point.z,
                  worldX: position[0],
                  worldZ: position[2],
                  snapX: rack.positionX,
                  snapY: rack.positionY,
                };
                setDragPreview({
                  rackId: rack.id,
                  worldX: position[0],
                  worldZ: position[2],
                  snapX: rack.positionX,
                  snapY: rack.positionY,
                });
              }}
            />
          )}

          {/* FIX: shimmer Z uses position[2], not position[1] */}
          {showHeatShimmer && rack.exhaustTemp > 35 && (
            <HeatShimmer
              position={[position[0], 2.5, position[2] - 0.5]}
              intensity={(rack.exhaustTemp - 30) / 20}
            />
          )}
        </group>
      ))}

      {dragPreview && (
        <mesh
          position={[
            dragPreview.snapX * rackSpacing - centerX,
            0.02,
            dragPreview.snapY * aisleSpacing - centerZ,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[1.8 * rackScale, 2.6 * rackScale]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.6} transparent opacity={0.35} />
        </mesh>
      )}

      {showNetworkMesh && (
        <DataCenterNetworkMesh
          racks={rackPositions.map(({ position, rack }) => ({
            position,
            heat: rack.exhaustTemp,
          }))}
          maxConnections={Math.min(160, rackPositions.length * 4)}
          maxStreams={Math.min(120, rackPositions.length * 2)}
          heatmapInfluence={heatmapMode ? 1 : 0}
        />
      )}
    </group>
  );
}

function EnvironmentalDetails({ size }: { size: number }) {
  const cracPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    const count = Math.ceil(size / 15);
    for (let i = 0; i < count; i++) {
      positions.push([-size * 0.8, 0, (i - count / 2) * 8]);
      positions.push([size * 0.8, 0, (i - count / 2) * 8]);
    }
    return positions;
  }, [size]);

  const emergencyLightPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        if (Math.random() > 0.7) positions.push([x * 6, 20, z * 6]);
      }
    }
    return positions;
  }, []);

  return (
    <group>
      {cracPositions.map((pos, i) => (
        <CRACUnit key={`crac-${i}`} position={pos} />
      ))}

      <FireSuppressionSystem position={[-size * 0.6, 0, -size * 0.6]} />
      <FireSuppressionSystem position={[size * 0.6, 0, -size * 0.6]} />
      <FireSuppressionSystem position={[-size * 0.6, 0, size * 0.6]} />
      <FireSuppressionSystem position={[size * 0.6, 0, size * 0.6]} />

      {emergencyLightPositions.map((pos, i) => (
        <EmergencyLight key={`emergency-${i}`} position={pos} />
      ))}

      <StatusPanel position={[-size * 0.9, 1.5, 0]} />
      <StatusPanel position={[size * 0.9, 1.5, 0]} />
    </group>
  );
}

function AtmosphericLayer({ size, intensity = 1 }: { size: number; intensity?: number }) {
  return (
    <group>
      <DustMotes count={Math.floor(300 * intensity)} size={size} />

      <VolumetricLight position={[0, 13, 0]} color="#4488ff" intensity={0.5 * intensity} />
      <VolumetricLight position={[-8, 13, 0]} color="#4488ff" intensity={0.3 * intensity} />
      <VolumetricLight position={[8, 13, 0]} color="#4488ff" intensity={0.3 * intensity} />

      <AirflowParticles start={[-size * 0.7, 0.5, 0]} end={[0, 0.5, 0]} count={Math.floor(30 * intensity)} color="#00aaff" />
      <AirflowParticles start={[size * 0.7, 0.5, 0]} end={[0, 0.5, 0]} count={Math.floor(30 * intensity)} color="#00aaff" />
    </group>
  );
}

function AssetPreloadQueue({
  equipment,
  equipmentCatalog,
  batchSize = 6,
}: {
  equipment: Equipment[];
  equipmentCatalog: Map<string, Equipment>;
  batchSize?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(0);

  const preloadRack = useMemo<Rack>(() => {
    const slots = Array.from({ length: 42 }).map((_, index) => ({
      uPosition: index + 1,
      equipmentInstanceId: null,
    }));
    return {
      id: "preload-rack",
      name: "Preload Rack",
      type: "enclosed_42U",
      totalUs: 42,
      slots,
      installedEquipment: [],
      powerCapacity: 12000,
      currentPowerDraw: 0,
      inletTemp: 22,
      exhaustTemp: 24,
      airflowRestriction: 0.1,
      positionX: 0,
      positionY: 0,
    };
  }, []);

  useEffect(() => {
    if (!equipment.length) return;
    setVisibleCount(0);
    const interval = window.setInterval(() => {
      setVisibleCount((prev) => {
        const next = Math.min(equipment.length, prev + batchSize);
        if (next >= equipment.length) window.clearInterval(interval);
        return next;
      });
    }, 60);
    return () => window.clearInterval(interval);
  }, [batchSize, equipment.length, equipment]);

  return (
    <group position={[0, -80, 0]}>
      <Rack3D
        rack={preloadRack}
        position={[0, 0, 0]}
        isSelected={false}
        onSelect={() => {}}
        equipmentCatalog={equipmentCatalog}
        forceSimplified
      />
      {equipment.slice(0, visibleCount).map((item, index) => {
        const installed: InstalledEquipment = {
          id: `preload-${item.id}`,
          equipmentId: item.id,
          uStart: 1,
          uEnd: Math.max(1, item.uHeight),
          status: "online",
          cpuLoad: 30,
          memoryUsage: 40,
          networkActivity: 20,
        };

        return (
          <EquipmentMesh
            key={`preload-equipment-${item.id}-${index}`}
            equipment={item}
            installed={installed}
            position={[index * 1.2, 0.2, 0]}
            rackWidth={0.85}
            rackDepth={1.4}
            uHeight={2.8 / 42}
          />
        );
      })}
    </group>
  );
}

export function DatacenterScene({
  onSelectRack,
  selectedRackId,
  isUnlocked,
  showEffects = true,
  cameraMode = "orbit",
  showHUD = true,
  showPerfOverlay = false,
  rackScale = 1,
  rackCount = 9,
  showHeatmap = false,
  lightingMode = "night",
  photoFraming = false,
  captureRef,
  performanceMode = false,
  qualityMode = "high",
  visibleRacks,
  forceSimplified = false,
  lodResetToken = 0,
  renderProfile = "cinematic",
  onPerfWarningChange,
  onPointerGridChange,
  onPointerGridConfirm,
  proceduralOptions,
}: DatacenterSceneProps) {
  const { racks, equipmentCatalog, preloadQueue, updateRackPosition } = useGame();
  const { mode: buildMode } = useBuild();
  const { theme } = useTheme();

  const controlsRef = useRef<any>(null);
  const sceneStateRef = useRef<SceneBridgeState | null>(null);
  const pointerNdc = useRef(new THREE.Vector2());
  const pickPoint = useRef(new THREE.Vector3());
  const pickRaycaster = useRef(new THREE.Raycaster());
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  // NEW: UI lock disables OrbitControls while clicking UI
  const [uiLock, setUiLock] = useState(false);

  const [detailBudget, setDetailBudget] = useState(0);
  const detailRampRef = useRef<number | null>(null);

  const ceilingHeight = 36;
  const minCameraHeight = 0.6;
  const isLight = theme === "light";
  const isDaylight = lightingMode === "day";
  const compatibilityMode = renderProfile === "compatibility";
  const balancedMode = renderProfile === "balanced";
  const effectiveQualityMode = compatibilityMode ? "low" : qualityMode;

  const equipmentMap = useMemo(() => {
    const map = new Map<string, Equipment>();
    if (equipmentCatalog) equipmentCatalog.forEach((eq: Equipment) => map.set(eq.id, eq));
    return map;
  }, [equipmentCatalog]);

  const displayRacks = useMemo(() => {
    if (visibleRacks) return visibleRacks;
    if (isUnlocked && rackCount > 9 && equipmentCatalog?.length > 0) {
      return generateProceduralRacks(rackCount, equipmentCatalog, proceduralOptions);
    }
    return racks || [];
  }, [equipmentCatalog, isUnlocked, rackCount, racks, proceduralOptions, visibleRacks]);

  const maxCol = Math.max(...displayRacks.map((r) => r.positionX), 2);
  const maxRow = Math.max(...displayRacks.map((r) => r.positionY), 2);
  const floorSize = Math.max(maxCol * 2.8 + 30, maxRow * 5.2 + 30, 60);

  const useLowEffects =
    compatibilityMode ||
    performanceMode ||
    effectiveQualityMode === "low" ||
    displayRacks.length > (balancedMode ? 140 : 200);
  const allowEnvironmentDetails = !useLowEffects && renderProfile === "cinematic" && displayRacks.length < 160;
  const allowAtmosphere = showEffects && !useLowEffects;
  const allowScenePrecompile = renderProfile === "cinematic" && !useLowEffects;
  const allowAssetPreload = renderProfile !== "compatibility";
  const canvasDpr: number | [number, number] = compatibilityMode
    ? 1
    : balancedMode || performanceMode
      ? [1, 1.5]
      : [1, 2];

  const cinematicWaypoints = useMemo(
    () => [
      { position: [floorSize * 0.8, floorSize * 0.5, floorSize * 0.8] as [number, number, number], target: [0, 2, 0] as [number, number, number] },
      { position: [floorSize * 0.5, 5, floorSize * 0.5] as [number, number, number], target: [0, 2, 0] as [number, number, number] },
      { position: [0, 3, floorSize * 0.4] as [number, number, number], target: [0, 2, 0] as [number, number, number] },
      { position: [-floorSize * 0.5, 8, floorSize * 0.3] as [number, number, number], target: [0, 2, 0] as [number, number, number] },
      { position: [-floorSize * 0.8, 15, -floorSize * 0.3] as [number, number, number], target: [0, 2, 0] as [number, number, number] },
      { position: [0, 25, -floorSize * 0.7] as [number, number, number], target: [0, 2, 0] as [number, number, number] },
      { position: [floorSize * 0.8, floorSize * 0.5, floorSize * 0.8] as [number, number, number], target: [0, 2, 0] as [number, number, number] },
    ],
    [floorSize]
  );

  const handlePointerMissed = useCallback(() => {
    onSelectRack(null);
  }, [onSelectRack]);

  // NEW: robust UI lock based on data-ui elements
  useEffect(() => {
    const onPointerDownCapture = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const hitUI = !!target?.closest?.('[data-ui="true"]');
      setUiLock(hitUI);
    };

    const onPointerUpCapture = () => {
      setUiLock(false);
    };

    window.addEventListener("pointerdown", onPointerDownCapture, true);
    window.addEventListener("pointerup", onPointerUpCapture, true);
    window.addEventListener("pointercancel", onPointerUpCapture, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
      window.removeEventListener("pointerup", onPointerUpCapture, true);
      window.removeEventListener("pointercancel", onPointerUpCapture, true);
    };
  }, []);

  useEffect(() => {
    if (detailRampRef.current) window.clearInterval(detailRampRef.current);

    if (forceSimplified || useLowEffects) {
      setDetailBudget(0);
      return;
    }

    const total = displayRacks.length;
    if (total === 0) {
      setDetailBudget(0);
      return;
    }

    const initial = compatibilityMode
      ? Math.min(4, total)
      : balancedMode
        ? Math.min(8, total)
        : Math.min(12, total);
    const batch = compatibilityMode
      ? Math.min(12, Math.max(4, Math.ceil(total * 0.02)))
      : balancedMode
        ? Math.min(24, Math.max(6, Math.ceil(total * 0.03)))
        : Math.min(40, Math.max(8, Math.ceil(total * 0.04)));

    setDetailBudget(initial);

    detailRampRef.current = window.setInterval(() => {
      setDetailBudget((prev) => {
        const next = Math.min(total, prev + batch);
        if (next >= total && detailRampRef.current) {
          window.clearInterval(detailRampRef.current);
          detailRampRef.current = null;
        }
        return next;
      });
    }, 50);

    return () => {
      if (detailRampRef.current) {
        window.clearInterval(detailRampRef.current);
        detailRampRef.current = null;
      }
    };
  }, [balancedMode, compatibilityMode, displayRacks.length, forceSimplified, lodResetToken, useLowEffects]);

  /**
   * Grid position of a click on the floor, for drop mode.
   *
   * This used to read camera, raycaster and pointer straight off the event.
   * Canvas spreads unknown props onto the wrapping div, so the handler was
   * receiving a plain React pointer event and those three were undefined:
   * every pointer down in the scene threw. The camera comes from the bridge
   * inside the Canvas instead, and the pointer is converted from client
   * coordinates against the canvas box.
   *
   * The vectors, the plane and the raycaster are all held in refs. This runs
   * on every pointer down and allocating four objects each time is exactly
   * the kind of garbage a 500 rack scene cannot afford.
   */
  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!onPointerGridConfirm) return;
      const state = sceneStateRef.current;
      if (!state) return;
      const rect = state.canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      pointerNdc.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      pickRaycaster.current.setFromCamera(pointerNdc.current, state.camera);
      const intersection = pickPoint.current;
      if (!pickRaycaster.current.ray.intersectPlane(groundPlane.current, intersection)) return;

      const rackSpacing = 2.8;
      const aisleSpacing = 5.2;
      const maxCol = Math.max(...displayRacks.map((r) => r.positionX), 2);
      const maxRow = Math.max(...displayRacks.map((r) => r.positionY), 2);
      const centerX = (maxCol * rackSpacing) / 2;
      const centerZ = (maxRow * aisleSpacing) / 2;
      onPointerGridConfirm(
        Math.round((intersection.x + centerX) / rackSpacing),
        Math.round((intersection.z + centerZ) / aisleSpacing),
      );
    },
    [displayRacks, onPointerGridConfirm],
  );

  const handleOrbitControlsChange = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const maxHeight = ceilingHeight - 0.5;

    if (controls.object.position.y > maxHeight) {
      controls.object.position.y = maxHeight;
      controls.update();
    }

    if (controls.object.position.y < minCameraHeight) {
      controls.object.position.y = minCameraHeight;
      controls.update();
    }
  }, [ceilingHeight, minCameraHeight]);

  return (
    <div className="w-full h-full relative" data-testid="datacenter-scene-3d">
      <Canvas
        shadows={renderProfile === "cinematic" && !useLowEffects}
        dpr={canvasDpr}
        raycaster={{
          // Mesh, LOD and Sprite are spelled out because three types
          // RaycasterParameters with every key required.
          params: {
            Mesh: {},
            LOD: {},
            Sprite: {},
            Line: { threshold: 0.03 },
            Points: { threshold: 0.04 },
          },
        }}
        gl={{
          antialias: !compatibilityMode && !performanceMode,
          alpha: false,
          depth: true,
          stencil: false,
          powerPreference: compatibilityMode ? "low-power" : balancedMode ? "default" : "high-performance",
          failIfMajorPerformanceCaveat: false,
          /*
            Required by photo mode. Without it the drawing buffer is cleared
            after compositing and canvas.toBlob returns a blank image. The
            cost is that the browser cannot discard the back buffer between
            frames, which is a small amount of extra memory bandwidth.
          */
          preserveDrawingBuffer: true,
        }}
        style={{
          background: isDaylight
            ? "linear-gradient(180deg, #f3f7ff 0%, #e6edfa 42%, #dbe3f0 100%)"
            : isLight
              ? "linear-gradient(180deg, #edf4ff 0%, #e5ebf7 40%, #d7dfea 100%)"
              : "linear-gradient(180deg, #050508 0%, #0a0c12 30%, #0d1117 70%, #101520 100%)",
        }}
        onPointerMissed={handlePointerMissed}
        onPointerDown={handleCanvasPointerDown}
      >
        <RendererRuntime renderProfile={renderProfile} />
        <CaptureBridge captureRef={captureRef} stateRef={sceneStateRef} />
        <PhotoFraming active={photoFraming} floorSize={floorSize} />
        <fog
          attach="fog"
          args={[isDaylight ? "#e8eef8" : isLight ? "#dfe7f2" : "#080a10", 20, 120]}
        />

        <PerspectiveCamera makeDefault position={[25, 18, 25]} fov={balancedMode ? 54 : 50} near={0.1} far={500} />

        {/*
          Photo mode takes the camera on its own. Leaving a controller mounted
          would have it write a position back every frame and fight the
          framing, so all three are unmounted for the duration and remount
          afterwards from the restored camera.
        */}
        {cameraMode === "orbit" && !photoFraming && (
          <OrbitControls
            ref={controlsRef}
            enabled={!uiLock}
            enablePan
            enableZoom
            enableRotate
            minDistance={3}
            maxDistance={80}
            minPolarAngle={0.1}
            maxPolarAngle={Math.PI / 2.1}
            target={[0, 3, 0]}
            enableDamping
            dampingFactor={0.05}
            onChange={handleOrbitControlsChange}
            mouseButtons={{
              LEFT: THREE.MOUSE.ROTATE,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.PAN,
            }}
          />
        )}

        {cameraMode === "orbit" && !photoFraming && (
          <CameraBounds controlsRef={controlsRef} minHeight={minCameraHeight} maxHeight={ceilingHeight - 0.5} />
        )}

        {cameraMode === "auto" && !photoFraming && (
          <CameraController autoOrbit orbitSpeed={0.08} maxHeight={ceilingHeight - 0.5} minHeight={minCameraHeight} />
        )}

        {cameraMode === "cinematic" && !photoFraming && (
          <CinematicFlythrough
            waypoints={cinematicWaypoints}
            speed={balancedMode ? 0.42 : 0.5}
            loop
            active
            maxHeight={ceilingHeight - 0.5}
            minHeight={minCameraHeight}
          />
        )}

        <Suspense fallback={<LoadingFallback />}>
          <AdvancedLights
            performanceMode={useLowEffects || balancedMode}
            theme={theme}
            lightingMode={lightingMode}
          />

          {!compatibilityMode && !isDaylight && (
            <Stars
              radius={200}
              depth={100}
              count={balancedMode ? 520 : 1000}
              factor={balancedMode ? 1.4 : 2}
              saturation={0.5}
              fade
              speed={balancedMode ? 0.35 : 0.5}
            />
          )}

          <RaisedFloor size={floorSize} showHeatmap={showHeatmap} theme={theme} />

          {displayRacks.length > 0 && (
            <RackGrid
              racks={displayRacks}
              selectedRackId={selectedRackId}
              onSelectRack={onSelectRack}
              equipmentCatalog={equipmentMap}
              showHeatShimmer={showEffects && !useLowEffects}
              showNetworkMesh={!useLowEffects}
              heatmapMode={showHeatmap}
              forceSimplified={forceSimplified || effectiveQualityMode === "low" || compatibilityMode}
              detailBudget={detailBudget}
              buildMode={buildMode}
              canMove={isUnlocked}
              onMoveRack={(rackId, positionX, positionY) => {
                const isOccupied = displayRacks.some(
                  (r) => r.id !== rackId && r.positionX === positionX && r.positionY === positionY
                );
                if (!isOccupied) {
                  updateRackPosition(rackId, positionX, positionY);
                }
              }}
              rackScale={rackScale}
              onPointerGridChange={onPointerGridChange}
            />
          )}

          {allowAssetPreload && preloadQueue.length > 0 && (
            <AssetPreloadQueue equipment={preloadQueue} equipmentCatalog={equipmentMap} />
          )}

          {allowEnvironmentDetails && <EnvironmentalDetails size={floorSize} />}

          {allowAtmosphere && (
            <AtmosphericLayer
              size={floorSize}
              intensity={balancedMode ? 0.6 : displayRacks.length > 50 ? 0.5 : 1}
            />
          )}

          {/*
            Sits low and off to one side. At y=10 dead centre it landed
            right where the build toolbar floats, so the two read as one
            cluttered strip at the default camera.
          */}
          {showHUD && (
            <HolographicHUD
              position={[floorSize * 0.22, 5.5, -floorSize * 0.7]}
              visible
            />
          )}

          <PerformanceOverlay
            visible={showPerfOverlay}
            qualityMode={effectiveQualityMode}
            onWarningChange={onPerfWarningChange}
          />

          {allowScenePrecompile && <ScenePrecompiler />}
          {allowScenePrecompile && <Preload all />}
        </Suspense>
      </Canvas>

      {isUnlocked && (
        <div
          className="absolute top-4 left-4 pointer-events-none select-none bg-black/60 backdrop-blur-md rounded-md px-3 py-2 border border-cyan-500/30"
          data-ui="true"
        >
          <div className="text-cyan-400 text-xs font-mono flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            ADMIN MODE ACTIVE
          </div>
          <div className="text-cyan-600 text-[10px] font-mono mt-1">{displayRacks.length} RACKS VISIBLE</div>
        </div>
      )}
    </div>
  );
}
