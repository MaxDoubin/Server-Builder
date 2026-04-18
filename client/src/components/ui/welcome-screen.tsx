import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Sparkles as DreiSparkles } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cpu, Eye, Hammer, Play, Shield, Sparkles } from "lucide-react";
import { Rack3D } from "@/components/3d/Rack3D";
import { staticEquipmentCatalog } from "@/lib/static-equipment";
import { siteConfig } from "@/lib/siteConfig";
import type { Rack } from "@shared/schema";
import * as THREE from "three";
import { HeroAnimation } from "@/components/hero/HeroAnimation";

type StartMode = "build" | "explore";

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

const buildIntroRack = (
  index: number,
  positionX: number,
  positionY: number
): Rack => {
  const slots: Rack["slots"] = Array.from({ length: 42 }).map((_, slotIndex) => ({
    uPosition: slotIndex + 1,
    equipmentInstanceId: null,
  }));
  const rng = createSeededRandom(100 + index);
  const installedEquipment: Rack["installedEquipment"] = [];
  let u = 1;
  while (u <= 42) {
    const equipment = staticEquipmentCatalog[Math.floor(rng() * staticEquipmentCatalog.length)];
    const uEnd = Math.min(42, u + equipment.uHeight - 1);
    const instanceId = `intro-${index}-${u}-${equipment.id}`;
    for (let slot = u; slot <= uEnd; slot += 1) {
      slots[slot - 1].equipmentInstanceId = instanceId;
    }
    installedEquipment.push({
      id: instanceId,
      equipmentId: equipment.id,
      uStart: u,
      uEnd,
      status: "online",
      cpuLoad: 40 + rng() * 40,
      memoryUsage: 30 + rng() * 50,
      networkActivity: 20 + rng() * 60,
    });
    u = uEnd + 1 + (rng() > 0.8 ? 1 : 0);
  }

  return {
    id: `intro-rack-${index}`,
    name: `R${index + 1}`,
    type: "enclosed_42U",
    totalUs: 42,
    slots,
    installedEquipment,
    powerCapacity: 12000,
    currentPowerDraw: 3200,
    inletTemp: 22,
    exhaustTemp: 28,
    airflowRestriction: 0.1,
    positionX,
    positionY,
  };
};

export function WelcomeScreen({
  isVisible,
  onStart,
  defaultMode = "build",
}: {
  isVisible: boolean;
  onStart?: (mode: StartMode) => void;
  defaultMode?: StartMode;
}) {
  const [mode, setMode] = useState<StartMode>(defaultMode);
  const [showPanels, setShowPanels] = useState(false);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "e") {
        setShowPanels((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black">
      <HeroAnimation className="absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 16% 20%, rgba(34, 211, 238, 0.18), transparent 24%), radial-gradient(circle at 82% 18%, rgba(168, 85, 247, 0.16), transparent 26%), linear-gradient(180deg, rgba(2, 6, 23, 0.16) 0%, rgba(2, 6, 23, 0.58) 54%, rgba(2, 6, 23, 0.88) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/45 to-black/85" />

      <div className="relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-6 py-10 pointer-events-auto">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-black/35 px-3 py-1 font-mono-tight text-[10px] uppercase tracking-[0.34em] text-cyan-100/80 backdrop-blur-md">
              <span
                className="inline-flex h-2 w-2 rounded-full bg-cyan-300"
                style={{ boxShadow: "0 0 10px rgba(103, 232, 249, 0.85)" }}
              />
              Profile Experience
            </div>

            <div className="max-w-3xl space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-cyan-400/30 bg-cyan-500/12 text-cyan-100">
                  Top 1% NCL
                </Badge>
                <Badge className="border border-white/15 bg-white/8 text-white/80">
                  Blue Ribbon Commissioner
                </Badge>
                <Badge className="border border-amber-400/30 bg-amber-500/10 text-amber-100">
                  #1 Percussionist in Nevada
                </Badge>
              </div>

              <div className="space-y-3">
                <h1
                  className="text-5xl font-black tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl"
                  style={{ fontFamily: "Orbitron, sans-serif" }}
                >
                  {siteConfig.name.toUpperCase()}
                </h1>
                <p className="max-w-2xl text-base text-cyan-100/85 sm:text-lg">
                  {siteConfig.tagline}
                </p>
                <p className="max-w-3xl text-sm leading-relaxed text-white/68 sm:text-base">
                  {siteConfig.shortBio}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/12 bg-black/28 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <div className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
                    Choose your entry point
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    Build opens the interactive lab. Explore runs a cinematic overview shaped around Max Doubin&apos;s systems, security, and leadership story.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={mode === "build" ? "default" : "ghost"}
                    onClick={() => setMode("build")}
                    className={
                      mode === "build"
                        ? "border border-cyan-400/30 bg-cyan-500/18 text-cyan-50"
                        : "border border-white/10 bg-white/5 text-white/70"
                    }
                  >
                    <Hammer className="mr-2 h-4 w-4" />
                    Build
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "explore" ? "default" : "ghost"}
                    onClick={() => setMode("explore")}
                    className={
                      mode === "explore"
                        ? "border border-fuchsia-400/30 bg-fuchsia-500/18 text-fuchsia-50"
                        : "border border-white/10 bg-white/5 text-white/70"
                    }
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Explore
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onStart?.(mode)}
                    className="border border-white/10 bg-white/12 text-white hover:bg-white/18"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Enter
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    asChild
                    className="border border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                  >
                    <Link href="/about">About</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <InfoCard
              icon={<Shield className="h-4 w-4 text-cyan-200" />}
              title="Cybersecurity"
              body="Defensive security, forensics, log analysis, and competitive cyber work anchored by a top 1 percent National Cyber League finish."
            />
            <InfoCard
              icon={<Cpu className="h-4 w-4 text-cyan-200" />}
              title="Infrastructure"
              body="Enterprise networking, systems engineering, servers, virtualization, and real lab environments built to test ideas under pressure."
            />
            <InfoCard
              icon={<Sparkles className="h-4 w-4 text-cyan-200" />}
              title="Leadership"
              body="Youth coding camps, student leadership roles, and public service work across the Las Vegas Valley."
            />
          </div>
        </div>

        {showPanels && (
          <>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              <LiveFeed title="Systems" subtitle="Lab environments" variant="a" />
              <LiveFeed title="Security" subtitle="Signals and defense" variant="b" />
              <LiveFeed title="Builds" subtitle="Engineering practice" variant="c" />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <InfoCard
                icon={<Shield className="h-4 w-4 text-cyan-200" />}
                title="Competitive Edge"
                body="Top-tier cyber competition experience translates into calm, methodical technical problem solving."
              />
              <InfoCard
                icon={<Cpu className="h-4 w-4 text-cyan-200" />}
                title="Builder Mindset"
                body="Max focuses on clean systems, real infrastructure, and environments that teach through doing, not just theory."
              />
              <InfoCard
                icon={<Sparkles className="h-4 w-4 text-cyan-200" />}
                title="Community Impact"
                body="From coding camps to civic leadership, the work extends beyond hardware into mentorship and service."
              />
            </div>
          </>
        )}
      </div>

      <div className="absolute right-6 top-1/2 z-20 -translate-y-1/2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setShowPanels((prev) => !prev)}
          className="h-10 w-10 rounded-full border border-cyan-500/30 bg-black/50 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
          aria-label="Toggle intro panels"
        >
          {showPanels ? "⟨" : "⟩"}
        </Button>
        <div className="mt-2 text-center text-[10px] uppercase tracking-[0.3em] text-cyan-200/70">
          Press E
        </div>
      </div>
    </div>
  );
}

function IntroScene() {
  const fogColor = new THREE.Color("#070b18");
  const equipmentMap = useMemo(
    () => new Map(staticEquipmentCatalog.map((item) => [item.id, item])),
    []
  );
  const orbitRef = React.useRef<THREE.Group>(null);
  const lightARef = React.useRef<THREE.PointLight>(null);
  const lightBRef = React.useRef<THREE.PointLight>(null);
  const lightCRef = React.useRef<THREE.PointLight>(null);

  const rackGrid = useMemo(() => {
    const positions: [number, number, number, number][] = [];
    for (let x = -8; x <= 8; x += 2) {
      for (let z = -8; z <= 8; z += 2) {
        const height = 2.4 + Math.random() * 0.8;
        positions.push([x * 2.2, height / 2, z * 2.4, height]);
      }
    }
    return positions;
  }, []);
  const introRacks = useMemo(
    () =>
      rackGrid.slice(0, 16).map(([x, _y, z], index) =>
        buildIntroRack(index, x, z)
      ),
    [rackGrid]
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (orbitRef.current) {
      orbitRef.current.rotation.y = Math.sin(t * 0.08) * 0.15;
      orbitRef.current.position.x = Math.sin(t * 0.12) * 0.6;
      orbitRef.current.position.z = Math.cos(t * 0.1) * 0.4;
    }
    if (lightARef.current) {
      lightARef.current.intensity = 1.6 + Math.sin(t * 1.2) * 0.4;
      lightARef.current.position.x = Math.sin(t * 0.6) * 10;
    }
    if (lightBRef.current) {
      lightBRef.current.intensity = 1.2 + Math.cos(t * 1.4) * 0.3;
      lightBRef.current.position.z = Math.cos(t * 0.5) * 12;
    }
    if (lightCRef.current) {
      lightCRef.current.intensity = 1.0 + Math.sin(t * 1.1) * 0.25;
      lightCRef.current.position.x = Math.cos(t * 0.4) * -12;
    }
  });

  return (
    <>
      <fog attach="fog" args={[fogColor, 6, 34]} />
      <color attach="background" args={["#040813"]} />
      <PerspectiveCamera makeDefault position={[0, 8, 18]} fov={40} />

      <ambientLight intensity={0.9} color="#7dd3fc" />
      <directionalLight position={[10, 15, 10]} intensity={1.9} color="#b9e9ff" />
      <directionalLight position={[-10, 10, -8]} intensity={1.1} color="#c084fc" />
      <pointLight ref={lightARef} position={[0, 8, 0]} intensity={1.5} color="#22d3ee" />
      <pointLight ref={lightBRef} position={[0, 4, 12]} intensity={1.5} color="#38bdf8" />
      <pointLight ref={lightCRef} position={[-12, 6, -8]} intensity={1.2} color="#c084fc" />
      <pointLight position={[12, 3, -6]} intensity={1.3} color="#f472b6" />
      <pointLight position={[-6, 5, 10]} intensity={1.0} color="#34d399" />
      <pointLight position={[6, 2, 14]} intensity={0.9} color="#f97316" />

      <group ref={orbitRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial
            color="#0b1220"
            metalness={0.4}
            roughness={0.25}
            emissive="#0f172a"
            emissiveIntensity={0.35}
          />
        </mesh>

        <group position={[0, 0.08, 0]}>
          {Array.from({ length: 6 }).map((_, index) => (
            <mesh key={`strip-${index}`} position={[index * 6 - 15, 0, -10 + (index % 2) * 8]}>
              <boxGeometry args={[4, 0.05, 12]} />
              <meshStandardMaterial
                color={index % 2 === 0 ? "#22d3ee" : "#a855f7"}
                emissive={index % 2 === 0 ? "#22d3ee" : "#a855f7"}
                emissiveIntensity={1.1}
              />
            </mesh>
          ))}
        </group>

        <group scale={0.9}>
          {introRacks.map((rack, index) => (
            <Rack3D
              key={rack.id}
              rack={rack}
              position={[rack.positionX, 0, rack.positionY]}
              isSelected={false}
              onSelect={() => {}}
              equipmentCatalog={equipmentMap}
              forceSimplified
              lodIndex={index}
              detailBudget={introRacks.length}
              showHud={false}
            />
          ))}
        </group>

        <IntroSweep />
        <IntroSweep offset={6} color="#a855f7" />
      </group>

      <DreiSparkles count={80} speed={0.18} size={1.4} color="#22d3ee" scale={[30, 16, 30]} />
      <DreiSparkles count={32} speed={0.12} size={2.4} color="#f472b6" scale={[26, 12, 26]} />
      <DreiSparkles count={18} speed={0.08} size={2.8} color="#34d399" scale={[24, 10, 24]} />
    </>
  );
}

function LiveFeed({
  title,
  subtitle,
  variant,
}: {
  title: string;
  subtitle: string;
  variant: "a" | "b" | "c";
}) {
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-black/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-mono text-white/70">
          <div className="text-white/90">{title}</div>
          <div className="text-white/50">{subtitle}</div>
        </div>
        <Badge className="border border-white/10 bg-black/50 text-white/70">LIVE</Badge>
      </div>

      <div className="h-40 overflow-hidden rounded-lg border border-white/10">
        <Canvas
          dpr={1.4}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          frameloop="always"
          className="pointer-events-none"
        >
          <MiniRackScene variant={variant} />
        </Canvas>
      </div>
    </div>
  );
}

function MiniRackScene({ variant }: { variant: "a" | "b" | "c" }) {
  const camPos = useMemo(() => {
    if (variant === "a") return [8, 5, 9] as [number, number, number];
    if (variant === "b") return [0, 6, 10] as [number, number, number];
    return [-9, 4.5, 7] as [number, number, number];
  }, [variant]);

  const target = useMemo(() => [0, 1.5, 0] as [number, number, number], []);

  const equipmentMap = useMemo(
    () => new Map(staticEquipmentCatalog.map((item) => [item.id, item])),
    []
  );
  const rigRef = React.useRef<THREE.Group>(null);
  const glowRef = React.useRef<THREE.PointLight>(null);
  const racks = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, index) => {
        const row = Math.floor(index / 5);
        const col = index % 5;
        return buildIntroRack(index + (variant === "b" ? 40 : variant === "c" ? 80 : 0), col * 1.6 - 3.2, row * 1.6 - 3.2);
      }),
    [variant]
  );
  const lightPalette = useMemo(() => {
    if (variant === "a") {
      return {
        ambient: "#38bdf8",
        key: "#67e8f9",
        accent: "#22d3ee",
        fill: "#a855f7",
      };
    }
    if (variant === "b") {
      return {
        ambient: "#f472b6",
        key: "#fb7185",
        accent: "#fbbf24",
        fill: "#f97316",
      };
    }
    return {
      ambient: "#34d399",
      key: "#60a5fa",
      accent: "#22d3ee",
      fill: "#a78bfa",
    };
  }, [variant]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (rigRef.current) {
      rigRef.current.rotation.y = Math.sin(t * 0.35) * 0.08;
      rigRef.current.rotation.x = Math.cos(t * 0.3) * 0.04;
    }
    if (glowRef.current) {
      glowRef.current.intensity = 1.1 + Math.sin(t * 1.6) * 0.3;
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={camPos} fov={45} near={0.1} far={50} />

      <ambientLight intensity={1.0} color={lightPalette.ambient} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} color={lightPalette.key} />
      <pointLight ref={glowRef} position={[-4, 6, -2]} intensity={1.4} color={lightPalette.accent} />
      <pointLight position={[4, 3, 4]} intensity={1.0} color={lightPalette.fill} />
      <pointLight position={[0, 5, 8]} intensity={0.8} color={lightPalette.key} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial
          color="#101827"
          emissive={lightPalette.ambient}
          emissiveIntensity={0.18}
        />
      </mesh>

      <group position={[0, 0.05, 0]}>
        {Array.from({ length: 3 }).map((_, index) => (
          <mesh key={`mini-strip-${variant}-${index}`} position={[index * 3 - 3, 0, -2 + index * 2]}>
            <boxGeometry args={[2.8, 0.04, 6]} />
            <meshStandardMaterial
              color={lightPalette.accent}
              emissive={lightPalette.accent}
              emissiveIntensity={1.0}
            />
          </mesh>
        ))}
      </group>

      <group ref={rigRef} scale={0.6}>
        {racks.map((rack, index) => (
          <Rack3D
            key={`${variant}-${rack.id}`}
            rack={rack}
            position={[rack.positionX, 0, rack.positionY]}
            isSelected={false}
            onSelect={() => {}}
            equipmentCatalog={equipmentMap}
            forceSimplified
            lodIndex={index}
            detailBudget={racks.length}
            showHud={false}
          />
        ))}
      </group>

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate={true}
        autoRotate
        autoRotateSpeed={variant === "b" ? -0.35 : variant === "c" ? 0.5 : 0.25}
        target={target}
      />
    </>
  );
}

function IntroRack({
  position,
  height,
}: {
  position: [number, number, number];
  height: number;
}) {
  const [hovered, setHovered] = useState(false);
  const rackRef = React.useRef<THREE.Mesh>(null);
  const glowRef = React.useRef<THREE.Mesh>(null);
  const lights = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, index) => ({
        y: 0.2 + index * (height / 7),
        hue: Math.random() > 0.5 ? "#22d3ee" : "#a855f7",
      })),
    [height]
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (rackRef.current) {
      rackRef.current.rotation.y = Math.sin(t * 0.6 + position[0]) * 0.15;
    }
    if (glowRef.current) {
      glowRef.current.scale.y = 1 + Math.sin(t * 1.6 + position[2]) * 0.06;
    }
  });

  return (
    <group
      position={position}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <mesh ref={rackRef} position={[0, height / 2, 0]}>
        <boxGeometry args={[1.2, height, 1.8]} />
        <meshStandardMaterial
          color={hovered ? "#0ea5e9" : "#1f2937"}
          emissive={hovered ? "#38bdf8" : "#0b1220"}
          emissiveIntensity={hovered ? 0.8 : 0.3}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      {lights.map((light, index) => (
        <mesh key={index} position={[0, light.y, 0.92]}>
          <boxGeometry args={[0.9, 0.08, 0.05]} />
          <meshStandardMaterial
            color={light.hue}
            emissive={light.hue}
            emissiveIntensity={hovered ? 1.4 : 0.6}
          />
        </mesh>
      ))}
      <mesh ref={glowRef} position={[0, height / 2, 0]}>
        <boxGeometry args={[1.4, height * 1.05, 2]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.4} transparent opacity={0.15} />
      </mesh>
      <mesh position={[0, height * 0.25, 0.92]}>
        <boxGeometry args={[0.8, 0.35, 0.05]} />
        <meshStandardMaterial color="#0ea5e9" emissive="#0ea5e9" emissiveIntensity={0.9} />
      </mesh>
    </group>
  );
}

function IntroSweep({
  offset = 0,
  color = "#22d3ee",
}: {
  offset?: number;
  color?: string;
}) {
  const sweepRef = React.useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!sweepRef.current) return;
    const t = clock.getElapsedTime();
    sweepRef.current.position.z = ((t * 2 + offset) % 24) - 12;
  });

  return (
    <mesh ref={sweepRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -12]}>
      <planeGeometry args={[80, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.08} />
    </mesh>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <div className="text-sm font-semibold text-white/90">{title}</div>
      </div>
      <p className="text-xs leading-relaxed text-white/60">{body}</p>
    </div>
  );
}
