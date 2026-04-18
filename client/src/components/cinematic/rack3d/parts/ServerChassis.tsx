import { useMemo } from "react";
import * as THREE from "three";
import { Led, LedStrip } from "./Led";
import { ACCENT_HEX, RACK_DEPTH, RACK_INNER_WIDTH, U } from "../rackConfig";
import type { GearKind } from "../rackConfig";

const FACE_Z = RACK_DEPTH / 2 - 0.001;

/** Shared materials — instantiated once. */
const mats = {
  chassis: new THREE.MeshStandardMaterial({
    color: "#15181c",
    metalness: 0.72,
    roughness: 0.46,
  }),
  chassisFront: new THREE.MeshStandardMaterial({
    color: "#0f1114",
    metalness: 0.6,
    roughness: 0.55,
  }),
  ventSlot: new THREE.MeshStandardMaterial({
    color: "#05070a",
    metalness: 0.3,
    roughness: 0.9,
  }),
  handle: new THREE.MeshStandardMaterial({
    color: "#2c2f34",
    metalness: 0.75,
    roughness: 0.4,
  }),
  driveBay: new THREE.MeshStandardMaterial({
    color: "#1e2126",
    metalness: 0.55,
    roughness: 0.6,
  }),
  driveFace: new THREE.MeshStandardMaterial({
    color: "#262a30",
    metalness: 0.6,
    roughness: 0.55,
  }),
  darkPlastic: new THREE.MeshStandardMaterial({
    color: "#07090b",
    metalness: 0.15,
    roughness: 0.85,
  }),
};

type ChassisProps = {
  kind: GearKind;
  sizeU: number;
  label?: string;
  accent?: keyof typeof ACCENT_HEX;
  seed?: number;
};

/** Slim chassis body + side rails (shared). */
function ChassisBody({ sizeU }: { sizeU: number }) {
  const h = sizeU * U;
  return (
    <group>
      <mesh castShadow receiveShadow material={mats.chassis}>
        <boxGeometry args={[RACK_INNER_WIDTH, h - 0.001, RACK_DEPTH - 0.01]} />
      </mesh>
      {/* Seam line along top */}
      <mesh position={[0, h / 2 - 0.0005, 0]}>
        <boxGeometry args={[RACK_INNER_WIDTH - 0.02, 0.0008, RACK_DEPTH - 0.02]} />
        <meshStandardMaterial color="#06080a" metalness={0.3} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Ear brackets on the left/right front. */
function RackEars({ sizeU }: { sizeU: number }) {
  const h = sizeU * U;
  return (
    <group>
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <mesh
            position={[
              sx * (RACK_INNER_WIDTH / 2 + 0.004),
              0,
              FACE_Z - 0.0015,
            ]}
          >
            <boxGeometry args={[0.008, h - 0.002, 0.004]} />
            <meshStandardMaterial color="#0a0c0e" metalness={0.7} roughness={0.4} />
          </mesh>
          {/* Ear screws */}
          {Array.from({ length: Math.max(2, Math.floor(sizeU * 1.5)) }).map((_, i, arr) => {
            const t = arr.length === 1 ? 0 : i / (arr.length - 1);
            return (
              <mesh
                key={i}
                position={[
                  sx * (RACK_INNER_WIDTH / 2 + 0.004),
                  -h / 2 + 0.006 + t * (h - 0.012),
                  FACE_Z + 0.001,
                ]}
              >
                <cylinderGeometry args={[0.0018, 0.0018, 0.002, 8]} />
                <meshStandardMaterial color="#3a3e44" metalness={0.9} roughness={0.25} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

/** Row of vent slots on the front face. */
function VentStrip({
  width,
  height,
  rows = 2,
  cols = 42,
  y = 0,
  xOffset = 0,
}: {
  width: number;
  height: number;
  rows?: number;
  cols?: number;
  y?: number;
  xOffset?: number;
}) {
  const slots = useMemo(() => {
    const out: Array<{ x: number; y: number }> = [];
    const slotW = width / cols;
    const slotH = height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({
          x: -width / 2 + slotW / 2 + c * slotW + xOffset,
          y: -height / 2 + slotH / 2 + r * slotH + y,
        });
      }
    }
    return { out, slotW, slotH };
  }, [width, height, rows, cols, y, xOffset]);

  return (
    <group>
      {slots.out.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, FACE_Z - 0.0005]} material={mats.ventSlot}>
          <boxGeometry args={[slots.slotW * 0.72, slots.slotH * 0.55, 0.003]} />
        </mesh>
      ))}
    </group>
  );
}

/** Honeycomb-ish dense vent (for GPU servers). */
function HoneycombVent({ width, height }: { width: number; height: number }) {
  const pattern = useMemo(() => {
    const out: Array<{ x: number; y: number }> = [];
    const cellW = 0.012;
    const cellH = 0.010;
    const cols = Math.floor(width / cellW);
    const rows = Math.floor(height / cellH);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offX = r % 2 === 0 ? 0 : cellW / 2;
        out.push({
          x: -width / 2 + cellW / 2 + c * cellW + offX,
          y: -height / 2 + cellH / 2 + r * cellH,
        });
      }
    }
    return { out, cellW, cellH };
  }, [width, height]);

  return (
    <group>
      {pattern.out.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, FACE_Z - 0.0008]} material={mats.ventSlot}>
          <boxGeometry args={[pattern.cellW * 0.78, pattern.cellH * 0.78, 0.004]} />
        </mesh>
      ))}
    </group>
  );
}

/** Small server drive bay face (2.5in or 3.5in). */
function DriveBay({
  w,
  h,
  kind = "sff",
  active = false,
  seed = 0,
}: {
  w: number;
  h: number;
  kind?: "sff" | "lff";
  active?: boolean;
  seed?: number;
}) {
  return (
    <group>
      <mesh material={mats.driveBay}>
        <boxGeometry args={[w, h, 0.004]} />
      </mesh>
      <mesh position={[0, 0, 0.0025]} material={mats.driveFace}>
        <boxGeometry args={[w * 0.9, h * 0.86, 0.003]} />
      </mesh>
      {/* handle slot */}
      <mesh position={[-w * 0.28, 0, 0.005]}>
        <boxGeometry args={[w * 0.1, h * 0.28, 0.002]} />
        <meshStandardMaterial color="#03060a" roughness={0.9} />
      </mesh>
      {/* status LEDs */}
      <group position={[w * 0.35, 0, 0.005]}>
        <group position={[0, h * 0.14, 0]}>
          <Led color="#64e6ff" size={kind === "lff" ? 0.003 : 0.002} blink={active} seed={seed + 1} />
        </group>
        <group position={[0, -h * 0.14, 0]}>
          <Led color={active ? "#c7f000" : "#1d2024"} size={kind === "lff" ? 0.003 : 0.002} intensity={active ? 1.6 : 0} />
        </group>
      </group>
    </group>
  );
}

/** Power button + LCD-ish info display for servers. */
function ServerControlPanel({
  accent = "signal",
  label,
  seed = 0,
}: {
  accent?: keyof typeof ACCENT_HEX;
  label?: string;
  seed?: number;
}) {
  return (
    <group>
      {/* panel recess */}
      <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.darkPlastic}>
        <boxGeometry args={[0.09, 0.018, 0.003]} />
      </mesh>
      {/* power button */}
      <mesh position={[-0.032, 0, FACE_Z + 0.001]}>
        <cylinderGeometry args={[0.004, 0.004, 0.0015, 12]} />
        <meshStandardMaterial color="#1a1d22" metalness={0.7} roughness={0.4} />
      </mesh>
      <group position={[-0.032, 0, FACE_Z + 0.0022]}>
        <Led color={ACCENT_HEX[accent]} size={0.0025} blink seed={seed + 2} />
      </group>
      {/* activity LEDs row */}
      <group position={[0, 0, FACE_Z + 0.001]}>
        <LedStrip
          count={4}
          length={0.026}
          color={ACCENT_HEX[accent]}
          size={0.002}
          seed={seed}
        />
      </group>
      {/* USB/serial stubs */}
      <mesh position={[0.032, 0, FACE_Z + 0.0005]}>
        <boxGeometry args={[0.008, 0.004, 0.0015]} />
        <meshStandardMaterial color="#0a0c0f" metalness={0.3} roughness={0.8} />
      </mesh>
      {label && (
        /* tiny laser-etched label strip */
        <mesh position={[0, -0.01, FACE_Z + 0.0011]}>
          <boxGeometry args={[0.088, 0.002, 0.0003]} />
          <meshStandardMaterial
            color="#1c1f23"
            metalness={0.5}
            roughness={0.7}
          />
        </mesh>
      )}
    </group>
  );
}

export function ServerChassis({ kind, sizeU, accent = "signal", seed = 1 }: ChassisProps) {
  const h = sizeU * U;
  const accentColor = ACCENT_HEX[accent];

  switch (kind) {
    case "blank":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          {/* blanking face */}
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* 3 decorative dimples */}
          {[-0.1, 0, 0.1].map((x, i) => (
            <mesh key={i} position={[x, 0, FACE_Z + 0.0008]}>
              <cylinderGeometry args={[0.0015, 0.0015, 0.0015, 10]} />
              <meshStandardMaterial color="#222528" metalness={0.7} roughness={0.45} />
            </mesh>
          ))}
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "server-1u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          {/* Front face */}
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* Four drive bays */}
          <group position={[-0.17, 0, FACE_Z]}>
            {[0, 1, 2, 3].map((i) => (
              <group key={i} position={[i * 0.034, 0, 0]}>
                <DriveBay w={0.030} h={0.026} kind="sff" active seed={seed + i} />
              </group>
            ))}
          </group>
          {/* Vent segment */}
          <VentStrip
            width={0.14}
            height={0.030}
            rows={2}
            cols={28}
            xOffset={0.02}
          />
          <group position={[0.19, 0, 0]}>
            <ServerControlPanel accent={accent} seed={seed} />
          </group>
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "server-2u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* 8x SFF drive bays in 2 rows of 4 */}
          <group position={[-0.17, 0, FACE_Z]}>
            {Array.from({ length: 8 }).map((_, i) => {
              const col = i % 4;
              const row = Math.floor(i / 4);
              return (
                <group
                  key={i}
                  position={[col * 0.034, (row === 0 ? 1 : -1) * 0.016, 0]}
                >
                  <DriveBay w={0.030} h={0.028} kind="sff" active={i % 3 !== 0} seed={seed + i * 2} />
                </group>
              );
            })}
          </group>
          {/* center vent */}
          <VentStrip
            width={0.12}
            height={0.06}
            rows={4}
            cols={24}
            xOffset={0.02}
          />
          {/* Control panel */}
          <group position={[0.19, 0, 0]}>
            <ServerControlPanel accent={accent} seed={seed} />
          </group>
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "storage-2u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* 24x SFF bays in 2 rows × 12 cols */}
          <group position={[-0.22, 0, FACE_Z]}>
            {Array.from({ length: 24 }).map((_, i) => {
              const col = i % 12;
              const row = Math.floor(i / 12);
              return (
                <group
                  key={i}
                  position={[col * 0.017 + 0.001, (row === 0 ? 1 : -1) * 0.016, 0]}
                >
                  <DriveBay w={0.015} h={0.028} kind="sff" active={i !== 7 && i !== 19} seed={seed + i} />
                </group>
              );
            })}
          </group>
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "storage-4u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* 12x LFF bays in 3 rows × 4 cols */}
          <group position={[-0.16, 0.01, FACE_Z]}>
            {Array.from({ length: 12 }).map((_, i) => {
              const col = i % 4;
              const row = Math.floor(i / 4);
              return (
                <group
                  key={i}
                  position={[col * 0.105, (1 - row) * 0.046, 0]}
                >
                  <DriveBay w={0.094} h={0.040} kind="lff" active={i !== 3} seed={seed + i * 3} />
                </group>
              );
            })}
          </group>
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "switch-1u": {
      const portCount = 48;
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* Port body */}
          <mesh position={[-0.04, 0, FACE_Z + 0.0005]}>
            <boxGeometry args={[0.32, 0.024, 0.004]} />
            <meshStandardMaterial color="#08090c" metalness={0.3} roughness={0.9} />
          </mesh>
          {/* Port outlines (2 rows x 24) */}
          {Array.from({ length: portCount }).map((_, i) => {
            const col = i % 24;
            const row = Math.floor(i / 24);
            return (
              <mesh
                key={i}
                position={[
                  -0.04 - 0.155 + col * 0.0135 + (col >= 12 ? 0.006 : 0),
                  (row === 0 ? 1 : -1) * 0.006,
                  FACE_Z + 0.0011,
                ]}
              >
                <boxGeometry args={[0.010, 0.009, 0.002]} />
                <meshStandardMaterial color="#0a0d10" metalness={0.4} roughness={0.85} />
              </mesh>
            );
          })}
          {/* Port link LEDs (instanced) */}
          <group position={[-0.04 - 0.08, 0.011, FACE_Z + 0.0022]}>
            <LedStrip
              count={24}
              length={0.32}
              color={accentColor}
              size={0.0022}
              seed={seed}
            />
          </group>
          <group position={[-0.04 - 0.08, -0.011, FACE_Z + 0.0022]}>
            <LedStrip
              count={24}
              length={0.32}
              color="#64e6ff"
              size={0.0022}
              seed={seed + 10}
            />
          </group>
          {/* Console + mgmt ports + status strip on right */}
          <group position={[0.195, 0, 0]}>
            <mesh position={[0, 0, FACE_Z + 0.0008]}>
              <boxGeometry args={[0.012, 0.012, 0.002]} />
              <meshStandardMaterial color="#0c0f13" roughness={0.9} />
            </mesh>
            <group position={[0, -0.01, FACE_Z + 0.0018]}>
              <Led color={accentColor} size={0.0022} blink seed={seed} />
            </group>
            <group position={[-0.02, 0.010, FACE_Z + 0.0018]}>
              <Led color="#64e6ff" size={0.002} blink seed={seed + 5} />
            </group>
            <group position={[0.020, 0.010, FACE_Z + 0.0018]}>
              <Led color="#ff9a1f" size={0.002} intensity={1.2} />
            </group>
          </group>
          <RackEars sizeU={sizeU} />
        </group>
      );
    }

    case "switch-core-2u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* Module bays (4 big slots) */}
          {Array.from({ length: 4 }).map((_, i) => (
            <group key={i} position={[-0.17 + i * 0.092, 0, FACE_Z]}>
              <mesh position={[0, 0, 0.0005]}>
                <boxGeometry args={[0.084, 0.062, 0.003]} />
                <meshStandardMaterial color="#0c0f13" metalness={0.5} roughness={0.7} />
              </mesh>
              {/* SFP+ cage x 4 */}
              {Array.from({ length: 4 }).map((__, j) => (
                <group key={j} position={[-0.028 + j * 0.019, 0, 0.0018]}>
                  <mesh>
                    <boxGeometry args={[0.012, 0.016, 0.003]} />
                    <meshStandardMaterial color="#050608" roughness={0.95} />
                  </mesh>
                  <group position={[0, -0.015, 0.001]}>
                    <Led color={j % 2 === 0 ? accentColor : "#64e6ff"} size={0.0022} blink seed={seed + i * 10 + j} />
                  </group>
                </group>
              ))}
            </group>
          ))}
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "server-gpu-4u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* 4 honeycomb vent zones */}
          {[-0.16, -0.054, 0.054, 0.16].map((x, i) => (
            <group key={i} position={[x, 0, 0]}>
              <HoneycombVent width={0.092} height={h * 0.72} />
            </group>
          ))}
          {/* Top accent strip */}
          <mesh position={[0, h * 0.42, FACE_Z + 0.0012]}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.04, 0.003, 0.0008]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={1.3}
              toneMapped={false}
            />
          </mesh>
          {/* Bottom strip with small LEDs */}
          <group position={[0, -h * 0.42, FACE_Z + 0.0014]}>
            <LedStrip count={32} length={0.38} color={accentColor} seed={seed} size={0.0025} />
          </group>
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "blade-chassis-7u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* 8 vertical blades */}
          {Array.from({ length: 8 }).map((_, i) => (
            <group
              key={i}
              position={[-0.19 + i * 0.054, 0, FACE_Z]}
            >
              <mesh position={[0, 0, 0.0008]}>
                <boxGeometry args={[0.048, h * 0.82, 0.003]} />
                <meshStandardMaterial color="#0d1013" metalness={0.6} roughness={0.55} />
              </mesh>
              {/* blade handle */}
              <mesh position={[0, -h * 0.36, 0.003]}>
                <boxGeometry args={[0.040, 0.008, 0.002]} />
                <meshStandardMaterial color="#1a1d22" metalness={0.7} roughness={0.4} />
              </mesh>
              {/* blade status */}
              <group position={[0.018, h * 0.33, 0.003]}>
                <Led
                  color={i === 2 ? "#ff9a1f" : accentColor}
                  size={0.0032}
                  blink
                  seed={seed + i * 3}
                />
              </group>
              {/* small network leds */}
              <group position={[-0.016, h * 0.33, 0.003]}>
                <Led color="#64e6ff" size={0.0024} blink seed={seed + i * 7 + 1} />
              </group>
              <group position={[0, -h * 0.15, 0.003]}>
                <LedStrip count={5} length={0.032} color={accentColor} size={0.002} seed={seed + i} />
              </group>
            </group>
          ))}
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "ups-2u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* LCD */}
          <mesh position={[-0.16, 0, FACE_Z + 0.0006]}>
            <boxGeometry args={[0.09, 0.050, 0.003]} />
            <meshStandardMaterial color="#05100a" emissive="#0a2618" emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
          <mesh position={[-0.16, -0.005, FACE_Z + 0.0012]}>
            <boxGeometry args={[0.08, 0.002, 0.0004]} />
            <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
          {/* Buttons */}
          {[-0.06, -0.03, 0].map((x, i) => (
            <mesh key={i} position={[x, 0, FACE_Z + 0.0009]}>
              <cylinderGeometry args={[0.0045, 0.0045, 0.0018, 14]} />
              <meshStandardMaterial color="#1f2226" metalness={0.7} roughness={0.4} />
            </mesh>
          ))}
          {/* Battery vent */}
          <VentStrip width={0.2} height={0.05} rows={3} cols={24} xOffset={0.06} />
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "kvm-1u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {/* Dark LCD slit */}
          <mesh position={[0, 0, FACE_Z + 0.0005]}>
            <boxGeometry args={[0.36, h * 0.5, 0.002]} />
            <meshStandardMaterial color="#02050a" emissive="#052018" emissiveIntensity={0.4} toneMapped={false} />
          </mesh>
          {/* Handle */}
          <mesh position={[0, -h * 0.28, FACE_Z + 0.001]} material={mats.handle}>
            <boxGeometry args={[0.10, 0.006, 0.002]} />
          </mesh>
          <group position={[0.18, 0, FACE_Z + 0.001]}>
            <Led color={accentColor} size={0.0025} blink seed={seed} />
          </group>
          <RackEars sizeU={sizeU} />
        </group>
      );

    default:
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <RackEars sizeU={sizeU} />
        </group>
      );
  }
}
