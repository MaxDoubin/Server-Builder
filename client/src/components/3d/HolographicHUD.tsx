import { Html } from "@react-three/drei";
import { useGame } from "@/lib/game-context";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface HolographicHUDProps {
  position: [number, number, number];
  visible?: boolean;
}

export function HolographicHUD({ position, visible = true }: HolographicHUDProps) {
  const { racks, facilityMetrics, alerts } = useGame();
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.02;
    }
  });

  if (!visible) return null;

  const totalPower = racks?.reduce((sum, r) => sum + r.currentPowerDraw, 0) || 0;
  const avgTemp = racks?.reduce((sum, r) => sum + r.exhaustTemp, 0) / (racks?.length || 1) || 0;
  const criticalAlerts = alerts?.filter(a => a.severity === 'critical').length || 0;
  const warningAlerts = alerts?.filter(a => a.severity === 'warning').length || 0;

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial
          color="#001020"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh position={[-1.95, 0, 0]} rotation={[0, Math.PI / 6, 0]}>
        <planeGeometry args={[0.05, 3]} />
        <meshStandardMaterial
          color="#00aaff"
          emissive="#00aaff"
          emissiveIntensity={2}
          transparent
          opacity={0.8}
        />
      </mesh>
      <mesh position={[1.95, 0, 0]} rotation={[0, -Math.PI / 6, 0]}>
        <planeGeometry args={[0.05, 3]} />
        <meshStandardMaterial
          color="#00aaff"
          emissive="#00aaff"
          emissiveIntensity={2}
          transparent
          opacity={0.8}
        />
      </mesh>

      <Html
        center
        transform
        distanceFactor={8}
        style={{
          width: '600px',
          padding: '20px',
          background: 'transparent',
          pointerEvents: 'none',
        }}
      >
        <div className="font-mono text-cyan-400 select-none" style={{ textShadow: '0 0 10px #00aaff' }}>
          <div className="text-center mb-4">
            <div className="text-2xl font-bold tracking-widest" style={{ fontFamily: 'Orbitron, monospace' }}>
              HYPERSCALE CONTROL
            </div>
            <div className="text-xs text-cyan-600">FACILITY MONITORING SYSTEM v3.2.1</div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <MetricCard label="TOTAL POWER" value={`${(totalPower / 1000).toFixed(1)} kW`} color="cyan" />
            <MetricCard label="AVG TEMP" value={`${avgTemp.toFixed(1)}°C`} color={avgTemp > 35 ? "orange" : "green"} />
            {/*
              Guard the number, not the formatted string. facilityMetrics
              initialises uptime to 0 and is never recomputed, and
              (0).toFixed(2) is the truthy string "0.00", so the fallback
              after `||` could never run and the HUD read UPTIME 0.00% while
              the header beside it read 99.9%.
            */}
            <MetricCard label="UPTIME" value={`${(facilityMetrics?.uptime || 99.99).toFixed(2)}%`} color="green" />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <MetricCard label="PUE" value={(facilityMetrics?.pue && facilityMetrics.pue > 1 ? facilityMetrics.pue : 1.2).toFixed(2)} color="cyan" />
            <MetricCard label="RACKS ONLINE" value={`${racks?.length || 0}`} color="cyan" />
          </div>

          <div className="flex gap-4 justify-center">
            <AlertIndicator count={criticalAlerts} type="critical" />
            <AlertIndicator count={warningAlerts} type="warning" />
          </div>

          <div className="mt-4 text-center text-xs text-cyan-700">
            <span className="animate-pulse">LIVE DATA STREAM</span>
          </div>
        </div>
      </Html>
    </group>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    cyan: 'text-cyan-400 border-cyan-500/50',
    green: 'text-green-400 border-green-500/50',
    orange: 'text-orange-400 border-orange-500/50',
    red: 'text-red-400 border-red-500/50',
  };

  return (
    <div className={`border ${colorClasses[color]} p-2 rounded bg-black/30`}>
      <div className="text-[10px] text-cyan-600">{label}</div>
      <div className={`text-lg font-bold ${colorClasses[color]}`}>{value}</div>
    </div>
  );
}

function AlertIndicator({ count, type }: { count: number; type: 'critical' | 'warning' }) {
  const isCritical = type === 'critical';
  
  return (
    <div className={`px-3 py-1 rounded ${isCritical ? 'bg-red-900/50 border border-red-500/50' : 'bg-yellow-900/50 border border-yellow-500/50'}`}>
      <span className={`text-sm font-bold ${isCritical ? 'text-red-400' : 'text-yellow-400'}`}>
        {count} {type.toUpperCase()}
      </span>
    </div>
  );
}

export function FloatingMetric({
  position,
  label,
  value,
  color = "#00aaff",
}: {
  position: [number, number, number];
  label: string;
  value: string;
  color?: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.05;
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <planeGeometry args={[0.6, 0.25]} />
        <meshStandardMaterial
          color="#001520"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Html center transform distanceFactor={10}>
        <div className="font-mono text-center whitespace-nowrap" style={{ color, textShadow: `0 0 5px ${color}` }}>
          <div className="text-[8px] opacity-70">{label}</div>
          <div className="text-sm font-bold">{value}</div>
        </div>
      </Html>
    </group>
  );
}
