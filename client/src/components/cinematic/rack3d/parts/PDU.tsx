import {
  RACK_DEPTH,
  RACK_FEET_HEIGHT,
  RACK_INNER_WIDTH,
  RACK_INTERNAL_HEIGHT,
  RACK_POST_WIDTH,
} from "../rackConfig";
import { Led } from "./Led";

/**
 * Vertical PDU (Power Distribution Unit) attached to a rear rail.
 * Outlets are C13-ish receptacles evenly distributed up the column.
 */
export function PDU({ side = "right" }: { side?: "left" | "right" }) {
  const sx = side === "right" ? 1 : -1;
  const pduH = RACK_INTERNAL_HEIGHT - 0.04;
  const outletCount = 24;
  const pduX =
    sx * (RACK_INNER_WIDTH / 2 + RACK_POST_WIDTH / 2);
  const pduY = RACK_FEET_HEIGHT + RACK_INTERNAL_HEIGHT / 2;
  const pduZ = -RACK_DEPTH / 2 + 0.04;

  return (
    <group position={[pduX, pduY, pduZ]} rotation={[0, -sx * Math.PI / 2, 0]}>
      {/* Body */}
      <mesh castShadow>
        <boxGeometry args={[0.05, pduH, 0.028]} />
        <meshStandardMaterial color="#18161a" metalness={0.5} roughness={0.6} />
      </mesh>
      {/* Top label bezel */}
      <mesh position={[0, pduH / 2 - 0.02, 0.016]}>
        <boxGeometry args={[0.042, 0.03, 0.002]} />
        <meshStandardMaterial color="#0c0d10" metalness={0.4} roughness={0.7} />
      </mesh>
      {/* Power indicator */}
      <group position={[0, pduH / 2 - 0.028, 0.019]}>
        <Led color="#c7f000" size={0.004} blink seed={0.2} />
      </group>
      {/* Phase LEDs */}
      {[-0.008, 0, 0.008].map((x, i) => (
        <group key={i} position={[x, pduH / 2 - 0.04, 0.019]}>
          <Led color={["#c7f000", "#64e6ff", "#ff9a1f"][i]} size={0.0025} intensity={1.3} />
        </group>
      ))}
      {/* Outlets */}
      {Array.from({ length: outletCount }).map((_, i) => {
        const t = i / (outletCount - 1);
        const y = -pduH / 2 + 0.035 + t * (pduH - 0.07);
        return (
          <group key={i} position={[0, y, 0.015]}>
            {/* outlet face */}
            <mesh>
              <boxGeometry args={[0.020, 0.012, 0.003]} />
              <meshStandardMaterial color="#0c0d10" metalness={0.3} roughness={0.9} />
            </mesh>
            {/* outlet hot slot */}
            <mesh position={[-0.004, 0, 0.0018]}>
              <boxGeometry args={[0.002, 0.005, 0.002]} />
              <meshStandardMaterial color="#020305" roughness={0.95} />
            </mesh>
            <mesh position={[0.004, 0, 0.0018]}>
              <boxGeometry args={[0.002, 0.005, 0.002]} />
              <meshStandardMaterial color="#020305" roughness={0.95} />
            </mesh>
            <mesh position={[0, -0.004, 0.0018]}>
              <cylinderGeometry args={[0.0012, 0.0012, 0.002, 8]} />
              <meshStandardMaterial color="#020305" roughness={0.95} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
