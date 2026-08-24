import { useMemo } from "react";
import * as THREE from "three";
import { Led, LedField, LedStrip } from "./Led";
import { InstancedBoxes } from "./InstancedBoxes";
import { ACCENT_HEX, RACK_DEPTH, RACK_INNER_WIDTH, U } from "../rackConfig";
import type { GearKind } from "../rackConfig";

const FACE_Z = RACK_DEPTH / 2 - 0.001;

const mats = {
  chassis: new THREE.MeshStandardMaterial({
    color: "#15181c",
    metalness: 0.72,
    roughness: 0.46,
  }),
  chassisFront: new THREE.MeshStandardMaterial({
    color: "#111419",
    metalness: 0.65,
    roughness: 0.5,
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
  patchPort: new THREE.MeshStandardMaterial({
    color: "#0b0d10",
    metalness: 0.35,
    roughness: 0.85,
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

function ChassisBody({ sizeU }: { sizeU: number }) {
  const h = sizeU * U;
  return (
    <group>
      <mesh castShadow receiveShadow material={mats.chassis}>
        <boxGeometry args={[RACK_INNER_WIDTH, h - 0.001, RACK_DEPTH - 0.01]} />
      </mesh>
      <mesh position={[0, h / 2 - 0.0005, 0]}>
        <boxGeometry args={[RACK_INNER_WIDTH - 0.02, 0.0008, RACK_DEPTH - 0.02]} />
        <meshStandardMaterial color="#06080a" metalness={0.3} roughness={0.9} />
      </mesh>
    </group>
  );
}

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

  const points = useMemo(
    () =>
      slots.out.map(
        (s) => [s.x, s.y, FACE_Z - 0.0005] as [number, number, number],
      ),
    [slots],
  );

  return (
    <InstancedBoxes
      positions={points}
      size={[slots.slotW * 0.72, slots.slotH * 0.55, 0.003]}
      material={mats.ventSlot}
    />
  );
}

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

  const points = useMemo(
    () =>
      pattern.out.map(
        (s) => [s.x, s.y, FACE_Z - 0.0008] as [number, number, number],
      ),
    [pattern],
  );

  return (
    <InstancedBoxes
      positions={points}
      size={[pattern.cellW * 0.78, pattern.cellH * 0.78, 0.004]}
      material={mats.ventSlot}
    />
  );
}

function AccentRule({ width, y, color, opacity = 0.9 }: { width: number; y: number; color: string; opacity?: number }) {
  return (
    <mesh position={[0, y, FACE_Z + 0.0012]}>
      <boxGeometry args={[width, 0.0026, 0.0008]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </mesh>
  );
}

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
      <mesh position={[-w * 0.28, 0, 0.005]}>
        <boxGeometry args={[w * 0.1, h * 0.28, 0.002]} />
        <meshStandardMaterial color="#03060a" roughness={0.9} />
      </mesh>
      <group position={[w * 0.35, 0, 0.005]}>
        <group position={[0, h * 0.14, 0]}>
          <Led color="#64e6ff" size={kind === "lff" ? 0.0032 : 0.0022} blink={active} seed={seed + 1} />
        </group>
        <group position={[0, -h * 0.14, 0]}>
          <Led color={active ? "#c7f000" : "#1d2024"} size={kind === "lff" ? 0.0032 : 0.0022} intensity={active ? 2.1 : 0.1} />
        </group>
      </group>
    </group>
  );
}

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
      <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.darkPlastic}>
        <boxGeometry args={[0.1, 0.022, 0.003]} />
      </mesh>
      <mesh position={[0, 0.007, FACE_Z + 0.001]}>
        <boxGeometry args={[0.06, 0.004, 0.0007]} />
        <meshBasicMaterial color="#64e6ff" transparent opacity={0.35} toneMapped={false} />
      </mesh>
      <mesh position={[-0.034, 0, FACE_Z + 0.0018]}>
        <cylinderGeometry args={[0.0045, 0.0045, 0.0015, 12]} />
        <meshStandardMaterial color="#1a1d22" metalness={0.7} roughness={0.4} />
      </mesh>
      <group position={[-0.034, 0, FACE_Z + 0.0024]}>
        <Led color={ACCENT_HEX[accent]} size={0.0028} blink seed={seed + 2} />
      </group>
      <group position={[0.002, 0, FACE_Z + 0.001]}>
        <LedStrip
          count={5}
          length={0.032}
          color={ACCENT_HEX[accent]}
          size={0.0022}
          seed={seed}
        />
      </group>
      <mesh position={[0.036, 0, FACE_Z + 0.0005]}>
        <boxGeometry args={[0.009, 0.0045, 0.0015]} />
        <meshStandardMaterial color="#0a0c0f" metalness={0.3} roughness={0.8} />
      </mesh>
      {label && (
        <mesh position={[0, -0.0105, FACE_Z + 0.0011]}>
          <boxGeometry args={[0.092, 0.002, 0.0003]} />
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

const PATCH_PORT_POSITIONS: Array<[number, number, number]> = Array.from(
  { length: 48 },
  (_, i) => {
    const col = i % 24;
    const row = Math.floor(i / 24);
    return [
      -0.198 + col * 0.017 + (col >= 12 ? 0.006 : 0),
      (row === 0 ? 1 : -1) * 0.008,
      FACE_Z + 0.0014,
    ];
  },
);

function PatchPanelFace({ accentColor, seed }: { accentColor: string; seed: number }) {
  // 48 ports, each previously a mesh plus its own <Led> with its own
  // per-frame callback. Instanced, the whole face is three draw calls.
  const portLeds = useMemo(
    () =>
      PATCH_PORT_POSITIONS.map((pos, i) => ({
        position: [pos[0], pos[1] + 0.006, pos[2] + 0.0008] as [number, number, number],
        color: i % 24 % 3 === 0 ? accentColor : "#64e6ff",
        blink: i % 2 === 0,
      })),
    [accentColor],
  );

  return (
    <group>
      <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
        <boxGeometry args={[RACK_INNER_WIDTH - 0.004, U - 0.003, 0.003]} />
      </mesh>
      <AccentRule width={RACK_INNER_WIDTH - 0.04} y={U * 0.24} color={accentColor} opacity={0.3} />
      <AccentRule width={RACK_INNER_WIDTH - 0.08} y={-U * 0.22} color="#64e6ff" opacity={0.18} />
      <InstancedBoxes
        positions={PATCH_PORT_POSITIONS}
        size={[0.012, 0.009, 0.0022]}
        material={mats.patchPort}
      />
      <LedField points={portLeds} size={0.0019} seed={seed} />
      <group position={[0, -0.014, FACE_Z + 0.0018]}>
        <LedStrip count={28} length={0.36} color={accentColor} size={0.002} seed={seed + 18} />
      </group>
    </group>
  );
}

export function ServerChassis({ kind, sizeU, accent = "signal", label, seed = 1 }: ChassisProps) {
  const h = sizeU * U;
  const accentColor = ACCENT_HEX[accent];

  switch (kind) {
    case "blank":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          <AccentRule width={RACK_INNER_WIDTH - 0.1} y={0} color="#64e6ff" opacity={0.12} />
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
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          <group position={[-0.17, 0, FACE_Z]}>
            {Array.from({ length: 6 }).map((_, i) => (
              <group key={i} position={[i * 0.023, 0, 0]}>
                <DriveBay w={0.020} h={0.026} kind="sff" active seed={seed + i} />
              </group>
            ))}
          </group>
          <VentStrip width={0.13} height={0.028} rows={2} cols={26} xOffset={0.03} />
          <AccentRule width={RACK_INNER_WIDTH - 0.06} y={0.012} color={accentColor} opacity={0.26} />
          <group position={[0.19, 0, 0]}>
            <ServerControlPanel accent={accent} label={label} seed={seed} />
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
          <VentStrip width={0.12} height={0.06} rows={4} cols={24} xOffset={0.02} />
          <group position={[0.02, -0.024, FACE_Z + 0.0016]}>
            <LedStrip count={12} length={0.16} color={accentColor} size={0.0022} seed={seed + 15} />
          </group>
          <group position={[0.19, 0, 0]}>
            <ServerControlPanel accent={accent} label={label} seed={seed} />
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
          <AccentRule width={RACK_INNER_WIDTH - 0.02} y={0.028} color="#64e6ff" opacity={0.16} />
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
          <group position={[0, -h * 0.34, FACE_Z + 0.0016]}>
            <LedStrip count={18} length={0.28} color={accentColor} size={0.0022} seed={seed + 21} />
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
          <AccentRule width={RACK_INNER_WIDTH - 0.02} y={0.016} color={accentColor} opacity={0.22} />
          <mesh position={[-0.045, 0, FACE_Z + 0.0005]}>
            <boxGeometry args={[0.33, 0.025, 0.004]} />
            <meshStandardMaterial color="#08090c" metalness={0.3} roughness={0.9} />
          </mesh>
          {Array.from({ length: portCount }).map((_, i) => {
            const col = i % 24;
            const row = Math.floor(i / 24);
            return (
              <mesh
                key={i}
                position={[
                  -0.045 - 0.155 + col * 0.0135 + (col >= 12 ? 0.006 : 0),
                  (row === 0 ? 1 : -1) * 0.006,
                  FACE_Z + 0.0011,
                ]}
              >
                <boxGeometry args={[0.010, 0.009, 0.002]} />
                <meshStandardMaterial color="#0a0d10" metalness={0.4} roughness={0.85} />
              </mesh>
            );
          })}
          <group position={[-0.045 - 0.08, 0.011, FACE_Z + 0.0022]}>
            <LedStrip count={24} length={0.32} color={accentColor} size={0.0022} seed={seed} />
          </group>
          <group position={[-0.045 - 0.08, -0.011, FACE_Z + 0.0022]}>
            <LedStrip count={24} length={0.32} color="#64e6ff" size={0.0022} seed={seed + 10} />
          </group>
          {Array.from({ length: 4 }).map((_, i) => (
            <group key={i} position={[0.11 + i * 0.018, 0.011, FACE_Z + 0.0016]}>
              <mesh>
                <boxGeometry args={[0.012, 0.011, 0.0024]} />
                <meshStandardMaterial color="#0b0d10" metalness={0.3} roughness={0.82} />
              </mesh>
              <group position={[0, -0.009, 0.001]}>
                <Led color={i % 2 === 0 ? accentColor : "#64e6ff"} size={0.0024} blink seed={seed + i * 3} />
              </group>
            </group>
          ))}
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
              <Led color="#ff9a1f" size={0.002} intensity={1.5} />
            </group>
          </group>
          <RackEars sizeU={sizeU} />
        </group>
      );
    }

    case "patch-panel-1u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <PatchPanelFace accentColor={accentColor} seed={seed} />
          <RackEars sizeU={sizeU} />
        </group>
      );

    case "switch-core-2u":
      return (
        <group>
          <ChassisBody sizeU={sizeU} />
          <mesh position={[0, 0, FACE_Z - 0.0005]} material={mats.chassisFront}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.004, h - 0.003, 0.003]} />
          </mesh>
          {Array.from({ length: 4 }).map((_, i) => (
            <group key={i} position={[-0.17 + i * 0.092, 0, FACE_Z]}>
              <mesh position={[0, 0, 0.0005]}>
                <boxGeometry args={[0.084, 0.062, 0.003]} />
                <meshStandardMaterial color="#0c0f13" metalness={0.5} roughness={0.7} />
              </mesh>
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
          <group position={[0, -0.038, FACE_Z + 0.0016]}>
            <LedStrip count={16} length={0.22} color={accentColor} size={0.0021} seed={seed + 30} />
          </group>
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
          {[-0.16, -0.054, 0.054, 0.16].map((x, i) => (
            <group key={i} position={[x, 0, 0]}>
              <HoneycombVent width={0.092} height={h * 0.72} />
            </group>
          ))}
          <mesh position={[0, h * 0.42, FACE_Z + 0.0012]}>
            <boxGeometry args={[RACK_INNER_WIDTH - 0.04, 0.003, 0.0008]} />
            <meshStandardMaterial
              color={accentColor}
              emissive={accentColor}
              emissiveIntensity={1.4}
              toneMapped={false}
            />
          </mesh>
          <group position={[0, -h * 0.42, FACE_Z + 0.0014]}>
            <LedStrip count={32} length={0.38} color={accentColor} seed={seed} size={0.0026} />
          </group>
          <group position={[0, -h * 0.32, FACE_Z + 0.0016]}>
            <LedStrip count={12} length={0.14} color="#64e6ff" seed={seed + 5} size={0.0023} />
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
          {Array.from({ length: 8 }).map((_, i) => (
            <group
              key={i}
              position={[-0.19 + i * 0.054, 0, FACE_Z]}
            >
              <mesh position={[0, 0, 0.0008]}>
                <boxGeometry args={[0.048, h * 0.82, 0.003]} />
                <meshStandardMaterial color="#0d1013" metalness={0.6} roughness={0.55} />
              </mesh>
              <mesh position={[0, -h * 0.36, 0.003]}>
                <boxGeometry args={[0.040, 0.008, 0.002]} />
                <meshStandardMaterial color="#1a1d22" metalness={0.7} roughness={0.4} />
              </mesh>
              <group position={[0.018, h * 0.33, 0.003]}>
                <Led
                  color={i === 2 ? "#ff9a1f" : accentColor}
                  size={0.0032}
                  blink
                  seed={seed + i * 3}
                />
              </group>
              <group position={[-0.016, h * 0.33, 0.003]}>
                <Led color="#64e6ff" size={0.0024} blink seed={seed + i * 7 + 1} />
              </group>
              <group position={[0, -h * 0.15, 0.003]}>
                <LedStrip count={5} length={0.032} color={accentColor} size={0.002} seed={seed + i} />
              </group>
            </group>
          ))}
          <group position={[0, 0, FACE_Z + 0.0014]}>
            <LedStrip count={20} length={0.28} color="#64e6ff" size={0.0021} seed={seed + 64} />
          </group>
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
          <mesh position={[-0.16, 0, FACE_Z + 0.0006]}>
            <boxGeometry args={[0.09, 0.050, 0.003]} />
            <meshStandardMaterial color="#05100a" emissive="#0a2618" emissiveIntensity={1.1} toneMapped={false} />
          </mesh>
          <mesh position={[-0.16, -0.005, FACE_Z + 0.0012]}>
            <boxGeometry args={[0.08, 0.002, 0.0004]} />
            <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
          {[-0.06, -0.03, 0].map((x, i) => (
            <mesh key={i} position={[x, 0, FACE_Z + 0.0009]}>
              <cylinderGeometry args={[0.0045, 0.0045, 0.0018, 14]} />
              <meshStandardMaterial color="#1f2226" metalness={0.7} roughness={0.4} />
            </mesh>
          ))}
          <VentStrip width={0.2} height={0.05} rows={3} cols={24} xOffset={0.06} />
          <group position={[0.13, 0.015, FACE_Z + 0.0016]}>
            <LedStrip count={6} length={0.08} color="#64e6ff" size={0.0022} seed={seed + 90} />
          </group>
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
          <mesh position={[0, 0, FACE_Z + 0.0005]}>
            <boxGeometry args={[0.36, h * 0.5, 0.002]} />
            <meshStandardMaterial color="#02050a" emissive="#052018" emissiveIntensity={0.48} toneMapped={false} />
          </mesh>
          <mesh position={[0, -h * 0.28, FACE_Z + 0.001]} material={mats.handle}>
            <boxGeometry args={[0.10, 0.006, 0.002]} />
          </mesh>
          <group position={[0.18, 0, FACE_Z + 0.001]}>
            <Led color={accentColor} size={0.0025} blink seed={seed} />
          </group>
          <group position={[0, -0.012, FACE_Z + 0.0015]}>
            <LedStrip count={10} length={0.12} color="#64e6ff" size={0.0021} seed={seed + 40} />
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
