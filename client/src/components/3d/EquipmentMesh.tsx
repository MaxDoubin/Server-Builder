import { useRef, useMemo } from "react";
import { Instances, Instance } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Equipment, InstalledEquipment } from "@shared/schema";
import { getBoxGeometry, getCircleGeometry, getSphereGeometry, getStandardMaterial } from "@/lib/asset-pool";

interface EquipmentMeshProps {
  equipment: Equipment;
  installed: InstalledEquipment;
  position: [number, number, number];
  rackWidth: number;
  rackDepth: number;
  uHeight: number;
}

function LEDIndicator({ 
  position, 
  color, 
  intensity = 1,
  blinkSpeed = 0
}: { 
  position: [number, number, number]; 
  color: string; 
  intensity?: number;
  blinkSpeed?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (blinkSpeed > 0 && meshRef.current) {
      const blink = Math.sin(state.clock.elapsedTime * blinkSpeed) > 0 ? 1 : 0.2;
      (meshRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity * blink * 2;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <primitive object={getSphereGeometry([0.006, 6, 6])} attach="geometry" />
      <primitive
        object={getStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: intensity * 2,
        })}
        attach="material"
      />
    </mesh>
  );
}

function FanGrill({ position, size, isSpinning }: { position: [number, number, number]; size: number; isSpinning: boolean }) {
  const fanRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (fanRef.current && isSpinning) {
      fanRef.current.rotation.z += 0.3;
    }
  });

  return (
    <group position={position}>
      <mesh>
        <primitive object={getCircleGeometry([size / 2, 16])} attach="geometry" />
        <primitive object={getStandardMaterial({ color: "#1a1a1a", metalness: 0.3, roughness: 0.7 })} attach="material" />
      </mesh>
      <mesh ref={fanRef} position={[0, 0, 0.001]}>
        <primitive object={getCircleGeometry([size / 2.5, 6])} attach="geometry" />
        <primitive object={getStandardMaterial({ color: "#333333", metalness: 0.5, roughness: 0.5 })} attach="material" />
      </mesh>
    </group>
  );
}

function DriveBay({ position, hasActivity }: { position: [number, number, number]; hasActivity: boolean }) {
  return (
    <group position={position}>
      <mesh>
        <primitive object={getBoxGeometry([0.025, 0.015, 0.003])} attach="geometry" />
        <primitive object={getStandardMaterial({ color: "#2a2a2a", metalness: 0.6, roughness: 0.4 })} attach="material" />
      </mesh>
      <LEDIndicator
        position={[0.008, 0.004, 0.002]}
        color={hasActivity ? "#00aaff" : "#004488"}
        intensity={hasActivity ? 1 : 0.3}
        blinkSpeed={hasActivity ? Math.random() * 20 + 10 : 0}
      />
    </group>
  );
}

export function EquipmentMesh({ equipment, installed, position, rackWidth, rackDepth, uHeight }: EquipmentMeshProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Force re-render when installed equipment data changes (like ID or status)
  const [, forceUpdate] = useState({});
  useMemo(() => {
    forceUpdate({});
  }, [installed.id, installed.status]);

  const equipmentHeight = equipment.uHeight * uHeight;
  const equipmentWidth = rackWidth - 0.08;
  const equipmentDepth = rackDepth - 0.1;

  const equipmentColor = useMemo(() => {
    return equipment.color || "#2a2a2a";
  }, [equipment.color]);

  const statusColor = useMemo(() => {
    switch (installed.status) {
      case "critical": return "#ff2200";
      case "warning": return "#ffaa00";
      case "offline": return "#444444";
      default: return equipment.ledColor || "#00ff44";
    }
  }, [installed.status, equipment.ledColor]);

  const isServer = equipment.type.startsWith("server");
  const isSwitch = equipment.type.startsWith("switch");
  const isStorage = equipment.type.startsWith("storage");
  const isNetwork = equipment.type.startsWith("router") || equipment.type.startsWith("firewall");
  const isPDU = equipment.type.startsWith("pdu");
  const isUPS = equipment.type.startsWith("ups");

  const portCount = equipment.portCount || 0;
  const networkActivity = installed.networkActivity || 0;
  const portBodyGeometry = getBoxGeometry([0.012, 0.008, 0.004]);
  const portBodyMaterial = getStandardMaterial({ color: "#1a1a1a", metalness: 0.5, roughness: 0.5 });
  const outletBodyGeometry = getBoxGeometry([0.02, 0.015, 0.003]);
  const outletBodyMaterial = getStandardMaterial({ color: "#1a1a1a" });

  return (
    <group ref={groupRef} position={position}>
      <mesh castShadow receiveShadow>
        <primitive object={getBoxGeometry([equipmentWidth, equipmentHeight - 0.003, equipmentDepth])} attach="geometry" />
        <primitive object={getStandardMaterial({ color: equipmentColor, metalness: 0.7, roughness: 0.3 })} attach="material" />
      </mesh>

      <mesh position={[0, 0, equipmentDepth / 2 + 0.001]}>
        <primitive object={getBoxGeometry([equipmentWidth, equipmentHeight - 0.005, 0.0005])} attach="geometry" />
        <primitive object={getStandardMaterial({ color: "#0a0a0a", metalness: 0.5, roughness: 0.5 })} attach="material" />
      </mesh>

      <LEDIndicator
        position={[-equipmentWidth / 2 + 0.02, equipmentHeight / 2 - 0.015, equipmentDepth / 2 + 0.005]}
        color={statusColor}
        intensity={1}
        blinkSpeed={installed.status === "warning" ? 4 : 0}
      />

      {isServer && (
        <>
          <Instances geometry={portBodyGeometry} material={portBodyMaterial}>
            {Array.from({ length: Math.min(4, Math.floor(portCount / 2)) }).map((_, i) => (
              <Instance
                key={`port-body-${i}`}
                position={[
                  equipmentWidth / 2 - 0.03 - i * 0.018,
                  -equipmentHeight / 2 + 0.015,
                  equipmentDepth / 2 + 0.003
                ]}
              />
            ))}
          </Instances>
          {Array.from({ length: Math.min(4, Math.floor(portCount / 2)) }).map((_, i) => (
            <LEDIndicator
              key={`port-led-${i}`}
              position={[
                equipmentWidth / 2 - 0.03 - i * 0.018,
                -equipmentHeight / 2 + 0.021,
                equipmentDepth / 2 + 0.006
              ]}
              color="#00ff44"
              intensity={0.8}
              blinkSpeed={networkActivity > 20 + i * 15 ? Math.random() * 10 + 5 : 0}
            />
          ))}

          {equipment.hasFans && (
            <>
              {Array.from({ length: equipment.uHeight >= 2 ? 4 : 2 }).map((_, i) => (
                <FanGrill
                  key={`fan-${i}`}
                  position={[
                    -equipmentWidth / 2 + 0.04 + i * 0.06,
                    0,
                    -equipmentDepth / 2 - 0.001
                  ]}
                  size={0.04}
                  isSpinning={installed.status !== "offline"}
                />
              ))}
            </>
          )}

          <mesh position={[0, equipmentHeight / 2 - 0.012, equipmentDepth / 2 + 0.003]}>
            <primitive object={getBoxGeometry([equipmentWidth * 0.3, 0.008, 0.0005])} attach="geometry" />
            <primitive
              object={getStandardMaterial({
                color: "#ffffff",
                emissive: "#ffffff",
                emissiveIntensity: 0.1,
              })}
              attach="material"
            />
          </mesh>
        </>
      )}

      {isSwitch && (
        <>
          <Instances geometry={portBodyGeometry} material={portBodyMaterial}>
            {Array.from({ length: Math.min(portCount, 24) }).map((_, i) => {
              const row = Math.floor(i / 12);
              const col = i % 12;
              return (
                <Instance
                  key={`switch-port-body-${i}`}
                  position={[
                    -equipmentWidth / 2 + 0.03 + col * 0.04,
                    equipmentHeight / 2 - 0.015 - row * 0.018,
                    equipmentDepth / 2 + 0.003
                  ]}
                />
              );
            })}
          </Instances>
          {Array.from({ length: Math.min(portCount, 24) }).map((_, i) => {
            const row = Math.floor(i / 12);
            const col = i % 12;
            const isActive = Math.random() > 0.3;
            return (
              <LEDIndicator
                key={`switch-port-led-${i}`}
                position={[
                  -equipmentWidth / 2 + 0.03 + col * 0.04,
                  equipmentHeight / 2 - 0.009 - row * 0.018,
                  equipmentDepth / 2 + 0.006
                ]}
                color="#00ff44"
                intensity={0.6}
                blinkSpeed={isActive ? Math.random() * 10 + 4 : 0}
              />
            );
          })}

          {Array.from({ length: Math.min(8, portCount) }).map((_, i) => (
            <LEDIndicator
              key={`status-led-${i}`}
              position={[
                equipmentWidth / 2 - 0.02,
                equipmentHeight / 2 - 0.01 - i * 0.008,
                equipmentDepth / 2 + 0.005
              ]}
              color={Math.random() > 0.2 ? "#00ff44" : "#ffaa00"}
              intensity={0.6}
              blinkSpeed={Math.random() * 15 + 5}
            />
          ))}
        </>
      )}

      {isStorage && (
        <>
          {Array.from({ length: Math.min(12, equipment.uHeight * 6) }).map((_, i) => {
            const row = Math.floor(i / 6);
            const col = i % 6;
            return (
              <DriveBay
                key={`drive-${i}`}
                position={[
                  -equipmentWidth / 2 + 0.05 + col * 0.07,
                  equipmentHeight / 2 - 0.02 - row * 0.022,
                  equipmentDepth / 2 + 0.003
                ]}
                hasActivity={Math.random() > 0.5}
              />
            );
          })}

          <LEDIndicator
            position={[equipmentWidth / 2 - 0.02, 0, equipmentDepth / 2 + 0.005]}
            color={equipment.ledColor || "#0088ff"}
            intensity={1}
          />
        </>
      )}

      {isNetwork && (
        <>
          <Instances geometry={portBodyGeometry} material={portBodyMaterial}>
            {Array.from({ length: Math.min(portCount, 8) }).map((_, i) => (
              <Instance
                key={`net-port-body-${i}`}
                position={[
                  -equipmentWidth / 2 + 0.04 + i * 0.055,
                  0,
                  equipmentDepth / 2 + 0.003
                ]}
              />
            ))}
          </Instances>
          {Array.from({ length: Math.min(portCount, 8) }).map((_, i) => {
            const isActive = Math.random() > 0.4;
            return (
              <LEDIndicator
                key={`net-port-led-${i}`}
                position={[
                  -equipmentWidth / 2 + 0.04 + i * 0.055,
                  0.006,
                  equipmentDepth / 2 + 0.006
                ]}
                color="#00ff44"
                intensity={0.6}
                blinkSpeed={isActive ? Math.random() * 12 + 4 : 0}
              />
            );
          })}

          <mesh position={[equipmentWidth / 2 - 0.05, 0, equipmentDepth / 2 + 0.003]}>
            <primitive object={getBoxGeometry([0.06, equipmentHeight * 0.6, 0.0005])} attach="geometry" />
            <primitive object={getStandardMaterial({ color: "#111111", metalness: 0.8, roughness: 0.2 })} attach="material" />
          </mesh>
        </>
      )}

      {isPDU && (
        <>
          <Instances geometry={outletBodyGeometry} material={outletBodyMaterial}>
            {Array.from({ length: Math.min(portCount, 12) }).map((_, i) => (
              <Instance
                key={`outlet-body-${i}`}
                position={[
                  -equipmentWidth / 2 + 0.04 + i * 0.04,
                  0,
                  equipmentDepth / 2 + 0.003
                ]}
              />
            ))}
          </Instances>
          {Array.from({ length: Math.min(portCount, 12) }).map((_, i) => (
            <LEDIndicator
              key={`outlet-led-${i}`}
              position={[
                -equipmentWidth / 2 + 0.04 + i * 0.04,
                0.01,
                equipmentDepth / 2 + 0.005
              ]}
              color={equipment.ledColor || "#ffaa00"}
              intensity={0.5}
            />
          ))}
        </>
      )}

      {isUPS && (
        <>
          <mesh position={[0, equipmentHeight / 2 - 0.02, equipmentDepth / 2 + 0.003]}>
            <primitive object={getBoxGeometry([0.08, 0.02, 0.0005])} attach="geometry" />
            <primitive
              object={getStandardMaterial({
                color: "#00ff44",
                emissive: "#00ff44",
                emissiveIntensity: 0.5,
              })}
              attach="material"
            />
          </mesh>

          {Array.from({ length: 4 }).map((_, i) => (
            <LEDIndicator
              key={`battery-led-${i}`}
              position={[
                -0.03 + i * 0.02,
                equipmentHeight / 2 - 0.04,
                equipmentDepth / 2 + 0.005
              ]}
              color="#00ff44"
              intensity={0.8}
            />
          ))}
        </>
      )}
    </group>
  );
}
