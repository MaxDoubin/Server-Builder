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

/**
 * Realistic cable management.
 *
 * Real rack cables don't "sag" in the middle like fairy lights — they're
 * routed through vertical cable managers on the side of the rack, or
 * through horizontal combs, and the only sag is a small service loop
 * right where they enter/exit a port.
 *
 * Geometry approach:
 *   start (switch port) → small service loop down → vertical drop in
 *   the cable manager → small service loop up → target (device port)
 *
 * This uses a 4-point Catmull-Rom spline so the curve is smooth
 * everywhere but stays tight to the manager channel. No cables cross.
 */

type Accent = "signal" | "amber" | "cyan" | "copper" | "dark";

const ACCENT_COLORS: Record<Accent, string> = {
  signal: "#3a5a20",
  cyan: "#1f4a6a",
  amber: "#6a3a14",
  copper: "#4a2a18",
  dark: "#18202a",
};

interface CableRun {
  targetU: number;
  accent: Accent;
  lane: number;
}

function CableTube({
  fromY,
  toY,
  laneX,
  frontZ,
  backZ,
  color,
  radius,
}: {
  fromY: number;
  toY: number;
  laneX: number;
  frontZ: number;
  backZ: number;
  color: string;
  radius: number;
}) {
  const geometry = useMemo(() => {
    const start = new THREE.Vector3(laneX, fromY, frontZ);
    const dropIn = new THREE.Vector3(laneX + 0.003, fromY - U * 0.3, frontZ - 0.015);
    const managerTop = new THREE.Vector3(laneX + 0.006, Math.max(fromY, toY) + U * 0.15, backZ + 0.02);
    const managerMid = new THREE.Vector3(
      laneX + 0.006,
      (fromY + toY) / 2,
      backZ + 0.02,
    );
    const managerBot = new THREE.Vector3(
      laneX + 0.006,
      Math.min(fromY, toY) - U * 0.15,
      backZ + 0.02,
    );
    const climbOut = new THREE.Vector3(laneX + 0.003, toY - U * 0.3, frontZ - 0.015);
    const end = new THREE.Vector3(laneX, toY, frontZ);

    const goingDown = fromY > toY;
    const points = goingDown
      ? [start, dropIn, managerTop, managerMid, managerBot, climbOut, end]
      : [start, dropIn, managerBot, managerMid, managerTop, climbOut, end];

    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
    const length = curve.getLength();
    const segments = Math.max(24, Math.min(64, Math.round(length * 80)));
    return new THREE.TubeGeometry(curve, segments, radius, 6, false);
  }, [fromY, toY, laneX, frontZ, backZ, radius]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.78} metalness={0.06} />
    </mesh>
  );
}

/**
 * Vertical cable manager — a D-ring raceway on the side of the rack
 * where patch cables live. Gives the cables a clear home.
 */
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

/**
 * Horizontal overhead cable tray with rails and organizing combs.
 */
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
    </group>
  );
}

/** Loose patch cables running from switch area down the side to the rear. */
export function Cables() {
  const rightLaneX = RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2 - 0.004;
  const leftLaneX = -(RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2 - 0.004);

  const frontZ = RACK_DEPTH / 2 - 0.015;
  const backZ = -RACK_DEPTH / 2 + 0.12;

  const switchY14 = RACK_FEET_HEIGHT + 14 * U + U * 0.5;
  const switchY15 = RACK_FEET_HEIGHT + 15 * U + U * 0.5;
  const switchY30 = RACK_FEET_HEIGHT + 30 * U + U * 0.5;

  const runs: CableRun[] = useMemo(
    () => [
      { targetU: 3, accent: "cyan", lane: 0 },
      { targetU: 7, accent: "signal", lane: 1 },
      { targetU: 10, accent: "signal", lane: 2 },
      { targetU: 12, accent: "signal", lane: 3 },
      { targetU: 17, accent: "copper", lane: 4 },
      { targetU: 22, accent: "cyan", lane: 5 },
      { targetU: 32, accent: "amber", lane: 6 },
      { targetU: 33, accent: "signal", lane: 7 },
      { targetU: 34, accent: "signal", lane: 8 },
      { targetU: 38, accent: "dark", lane: 9 },
      { targetU: 39, accent: "cyan", lane: 10 },
    ],
    [],
  );

  const laneStep = 0.0018;

  return (
    <group>
      <CableManager x={rightLaneX} frontZ={frontZ} backZ={backZ} />
      <CableManager x={leftLaneX} frontZ={frontZ} backZ={backZ} />

      {runs.map((run, i) => {
        const targetY = RACK_FEET_HEIGHT + run.targetU * U + U * 0.35;
        const useLeft = run.targetU <= 9 || run.targetU === 17;
        const baseX = useLeft ? leftLaneX : rightLaneX;
        const laneX = baseX + (useLeft ? -1 : 1) * (run.lane * laneStep);
        const fromY = run.targetU >= 30
          ? switchY30
          : run.targetU >= 16 && run.targetU <= 22
            ? switchY15
            : switchY14;

        return (
          <CableTube
            key={i}
            fromY={fromY}
            toY={targetY}
            laneX={laneX}
            frontZ={frontZ}
            backZ={backZ}
            color={ACCENT_COLORS[run.accent]}
            radius={0.0014}
          />
        );
      })}

      <OverheadTray />
    </group>
  );
}
