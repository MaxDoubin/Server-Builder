/**
 * The canvas the teardown lives in.
 *
 * Kept apart from the page so the page can lazy load it, and apart from the
 * model so the model does not have to know about cameras or controls.
 *
 * Lighting is a dark studio rather than the white one the rack pages use.
 * A rack is photographed against white because that is how vendors shoot
 * them; a single machine suspended in its own parts is not a product shot,
 * and against white the pale sheet metal of a PowerEdge loses its edges
 * entirely.
 */

import { Suspense, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { StudioEnvironment } from "@/components/racks/StudioEnvironment";
import * as THREE from "three";
import { TeardownModel } from "./TeardownScene";

function Rig() {
  /*
    The model is a 1U server: 443mm across, 750mm deep, 43mm tall. Framing
    it on the face alone puts the camera inside the chassis, so the start
    position clears the footprint diagonal instead.
  */
  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      minDistance={0.55}
      maxDistance={3.2}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2.05}
      target={[0, 0.02, 0]}
      autoRotate={false}
      dampingFactor={0.08}
    />
  );
}

export function TeardownViewer({
  progressRef,
  selected,
  onSelect,
}: {
  progressRef: React.MutableRefObject<number>;
  selected: string | null;
  onSelect: (label: string | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 32, position: [0.85, 0.52, 1.15], near: 0.01, far: 40 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#0b0d10"]} />
      <hemisphereLight args={["#dfe7f5", "#14181d", 0.55]} />
      <directionalLight position={[1.6, 2.2, 1.8]} intensity={2.1} color="#ffffff" />
      <directionalLight position={[-1.8, 1.2, -1.4]} intensity={0.85} color="#c9d8f0" />
      <directionalLight position={[0, -1.4, 0.6]} intensity={0.35} color="#7f8ea8" />
      <Suspense fallback={null}>
        {/* The site's own procedural studio. drei's Environment fetches an
            HDR from a third party CDN, which is a request this page does
            not need and a dependency it should not have. */}
        <StudioEnvironment />
        {/*
          Dell model space puts the chassis floor at y=0 and the front at
          +Z, with the machine running 0 to 830mm deep, so it is shifted
          back onto the origin here rather than in the file. Leaving the
          file untouched means it still matches what Dell serve, byte for
          byte, and can be diffed against it.
        */}
        <group ref={groupRef} position={[0, -0.02, -0.42]}>
          <TeardownModel progressRef={progressRef} selected={selected} onSelect={onSelect} />
        </group>
      </Suspense>
      <Rig />
    </Canvas>
  );
}
