import { useMemo } from "react";
import * as THREE from "three";
import {
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_INNER_WIDTH,
  RACK_INTERNAL_HEIGHT,
  RACK_POST_WIDTH,
  U,
} from "../rackConfig";

export type CableAccent = "signal" | "amber" | "cyan" | "copper" | "dark";

const ACCENT_COLORS: Record<CableAccent, string> = {
  signal: "#3a5a20",
  cyan: "#1f4a6a",
  amber: "#6a3a14",
  copper: "#4a2a18",
  dark: "#18202a",
};

interface CableRun {
  targetU: number;
  accent: CableAccent;
  lane: number;
}

const RUNS: CableRun[] = [
  { targetU: 3, accent: "cyan", lane: 0 },
  { targetU: 4, accent: "signal", lane: 1 },
  { targetU: 7, accent: "signal", lane: 2 },
  { targetU: 9, accent: "copper", lane: 3 },
  { targetU: 10, accent: "signal", lane: 4 },
  { targetU: 12, accent: "signal", lane: 5 },
  { targetU: 17, accent: "copper", lane: 6 },
  { targetU: 18, accent: "dark", lane: 7 },
  { targetU: 21, accent: "cyan", lane: 8 },
  { targetU: 22, accent: "cyan", lane: 9 },
  { targetU: 32, accent: "amber", lane: 10 },
  { targetU: 33, accent: "signal", lane: 11 },
  { targetU: 34, accent: "signal", lane: 12 },
  { targetU: 38, accent: "dark", lane: 13 },
  { targetU: 39, accent: "cyan", lane: 14 },
  { targetU: 40, accent: "signal", lane: 15 },
];

const LANE_STEP = 0.0018;
const RIGHT_LANE_X = RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2 - 0.004;
const LEFT_LANE_X = -RIGHT_LANE_X;
const FRONT_Z = RACK_DEPTH / 2 - 0.015;
const BACK_Z = -RACK_DEPTH / 2 + 0.12;

const switchY = (u: number) => RACK_FEET_HEIGHT + u * U + U * 0.5;

/** One patch cable: the path it takes and the jacket accent it wears. */
export interface CablePath {
  curve: THREE.CatmullRomCurve3;
  accent: CableAccent;
}

function buildCableCurve(fromY: number, toY: number, laneX: number) {
  const start = new THREE.Vector3(laneX, fromY, FRONT_Z);
  const dropIn = new THREE.Vector3(laneX + 0.003, fromY - U * 0.3, FRONT_Z - 0.015);
  const managerTop = new THREE.Vector3(laneX + 0.006, Math.max(fromY, toY) + U * 0.15, BACK_Z + 0.02);
  const managerMid = new THREE.Vector3(laneX + 0.006, (fromY + toY) / 2, BACK_Z + 0.02);
  const managerBot = new THREE.Vector3(laneX + 0.006, Math.min(fromY, toY) - U * 0.15, BACK_Z + 0.02);
  const climbOut = new THREE.Vector3(laneX + 0.003, toY - U * 0.3, FRONT_Z - 0.015);
  const end = new THREE.Vector3(laneX, toY, FRONT_Z);

  const goingDown = fromY > toY;
  const points = goingDown
    ? [start, dropIn, managerTop, managerMid, managerBot, climbOut, end]
    : [start, dropIn, managerBot, managerMid, managerTop, climbOut, end];

  return new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
}

/**
 * Every patch cable in the rack as a curve running from its switch port
 * (t = 0) to the device port (t = 1).
 *
 * The single source of truth for cable routing: the tubes below are swept
 * along these curves and the packet-flow pulses ride the same ones, so the
 * light can never drift off the jacket it is meant to be inside.
 */
export function buildCablePaths(): CablePath[] {
  return RUNS.map((run) => {
    const targetY = RACK_FEET_HEIGHT + run.targetU * U + U * 0.35;
    const useLeft = run.targetU <= 9 || run.targetU === 17 || run.targetU === 18;
    const baseX = useLeft ? LEFT_LANE_X : RIGHT_LANE_X;
    const laneX = baseX + (useLeft ? -1 : 1) * (run.lane * LANE_STEP * 0.55);
    const fromY = run.targetU >= 35
      ? switchY(35)
      : run.targetU >= 30
        ? switchY(30)
        : run.targetU >= 16 && run.targetU <= 22
          ? switchY(15)
          : switchY(14);
    return { curve: buildCableCurve(fromY, targetY, laneX), accent: run.accent };
  });
}

function CableTube({
  curve,
  color,
  radius,
}: {
  curve: THREE.CatmullRomCurve3;
  color: string;
  radius: number;
}) {
  const geometry = useMemo(() => {
    const length = curve.getLength();
    const segments = Math.max(24, Math.min(64, Math.round(length * 80)));
    return new THREE.TubeGeometry(curve, segments, radius, 6, false);
  }, [curve, radius]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.78} metalness={0.06} />
    </mesh>
  );
}

function CableManager({ x, frontZ, backZ }: { x: number; frontZ: number; backZ: number }) {
  const depth = frontZ - backZ - 0.04;
  const y = RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT / 2;
  const height = RACK_INTERNAL_HEIGHT - U * 0.5;
  return (
    <group position={[x + 0.006, y, (frontZ + backZ) / 2 + 0.02]}>
      <mesh>
        <boxGeometry args={[0.014, height, depth]} />
        <meshStandardMaterial color="#0a0d11" metalness={0.42} roughness={0.72} />
      </mesh>
      {Array.from({ length: 10 }).map((_, i) => {
        const ringY = -height / 2 + (i + 0.5) * (height / 10);
        return (
          <mesh key={i} position={[0.008, ringY, 0]}>
            <torusGeometry args={[0.011, 0.0016, 6, 12, Math.PI]} />
            <meshStandardMaterial color="#0e1318" metalness={0.55} roughness={0.55} />
          </mesh>
        );
      })}
    </group>
  );
}

function OverheadTray() {
  const y = RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT - 0.002;
  const z = -RACK_DEPTH / 2 + 0.1;
  return (
    <group position={[0, y, z]}>
      <mesh>
        <boxGeometry args={[RACK_INNER_WIDTH, 0.006, 0.03]} />
        <meshStandardMaterial color="#0a0c0f" metalness={0.5} roughness={0.72} />
      </mesh>
      <mesh position={[0, -0.005, 0.014]}>
        <boxGeometry args={[RACK_INNER_WIDTH, 0.004, 0.002]} />
        <meshStandardMaterial color="#161a20" metalness={0.55} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.005, -0.014]}>
        <boxGeometry args={[RACK_INNER_WIDTH, 0.004, 0.002]} />
        <meshStandardMaterial color="#161a20" metalness={0.55} roughness={0.6} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[-0.2 + i * 0.057, 0.006, 0]}>
          <boxGeometry args={[0.003, 0.016, 0.024]} />
          <meshStandardMaterial color="#1a1f24" metalness={0.48} roughness={0.54} />
        </mesh>
      ))}
    </group>
  );
}

function HorizontalBrushPanel({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[0.018, 0.022, 0.028]} />
        <meshStandardMaterial color="#0d1014" metalness={0.34} roughness={0.82} />
      </mesh>
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[0, -0.008 + i * 0.004, 0.014]}>
          <boxGeometry args={[0.016, 0.0012, 0.002]} />
          <meshBasicMaterial color="#64e6ff" transparent opacity={0.12} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function RearTrunkBundle({ x, color, height }: { x: number; color: string; height: number }) {
  return (
    <group position={[x, RACK_FEET_HEIGHT + height / 2 + 0.06, -RACK_DEPTH / 2 + 0.06]}>
      <mesh>
        <cylinderGeometry args={[0.007, 0.007, height, 10]} />
        <meshStandardMaterial color={color} roughness={0.82} metalness={0.08} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[0.009, -height / 2 + 0.12 + i * 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.008, 0.0012, 5, 10, Math.PI * 1.2]} />
          <meshStandardMaterial color="#182029" metalness={0.38} roughness={0.64} />
        </mesh>
      ))}
    </group>
  );
}

export function Cables() {
  const rightLaneX = RIGHT_LANE_X;
  const leftLaneX = LEFT_LANE_X;
  const frontZ = FRONT_Z;
  const backZ = BACK_Z;

  const paths = useMemo(buildCablePaths, []);

  return (
    <group>
      <CableManager x={rightLaneX} frontZ={frontZ} backZ={backZ} />
      <CableManager x={leftLaneX} frontZ={frontZ} backZ={backZ} />

      <HorizontalBrushPanel x={rightLaneX + 0.008} y={switchY(14)} z={backZ + 0.02} />
      <HorizontalBrushPanel x={rightLaneX + 0.008} y={switchY(30)} z={backZ + 0.02} />
      <HorizontalBrushPanel x={leftLaneX - 0.008} y={switchY(15)} z={backZ + 0.02} />
      <HorizontalBrushPanel x={leftLaneX - 0.008} y={switchY(35)} z={backZ + 0.02} />

      {paths.map((path, i) => (
        <CableTube key={i} curve={path.curve} color={ACCENT_COLORS[path.accent]} radius={0.0014} />
      ))}

      <RearTrunkBundle x={-0.14} color="#18202a" height={RACK_INTERNAL_HEIGHT * 0.86} />
      <RearTrunkBundle x={0.02} color="#1f4a6a" height={RACK_INTERNAL_HEIGHT * 0.72} />
      <RearTrunkBundle x={0.16} color="#3a5a20" height={RACK_INTERNAL_HEIGHT * 0.9} />

      <OverheadTray />
    </group>
  );
}
