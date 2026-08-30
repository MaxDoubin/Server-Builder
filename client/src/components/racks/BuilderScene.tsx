/**
 * The rack you are building, in 3D, out of Ubiquiti's own geometry.
 *
 * This differs from the wired rack scene in one way that changes the whole
 * design: there, the build is a constant, so every model can be loaded up
 * front and the scene either works or does not. Here the build changes while
 * somebody watches, and a device added must not blank the rack that is
 * already standing. So each device gets its own Suspense boundary and its
 * own loader call, and the one that is still fetching is the only thing
 * missing from the frame.
 *
 * Nothing here knows about ports, because nothing is patched. That is not a
 * gap: a vendor model is a closed box with no idea where its own jacks are,
 * and the wired rack only manages it because its build definition says. A
 * build assembled by hand at run time has no such definition, and inventing
 * one from a bounding box would put leads in places there are no holes.
 */

import { Suspense, useMemo } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { U } from "@/components/cinematic/rack3d/rackConfig";
import { FRAME_FOOT, OpenRackFrame } from "./OpenRackFrame";
import { StudioEnvironment } from "./StudioEnvironment";
import { unitsOf, type CatalogueDevice, type Placement } from "@/lib/rackBuilder";

/** Ubiquiti face plates are 442.4mm across; the frame's opening is wider. */
const PANEL_W = 0.4424;

/**
 * Where a face plate sits, front to back.
 *
 * The frame is symmetric about its own origin, so a 620mm deep rack has its
 * front posts at +310mm rather than at zero. Mounting at zero puts every
 * device a foot behind the rails, which reads as looking into a rack instead
 * of at one, and is not obvious until something crosses in front of a panel.
 */
const FACE_Z = 0.303;

/** Rack depth. Shallow, because these are studio frames rather than cabinets. */
const DEPTH = 0.62;

function useVendorModel(url: string) {
  const { gl } = useThree();
  return useLoader(GLTFLoader, url, (loader) => {
    const l = loader as GLTFLoader;
    l.setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
    l.setKTX2Loader(new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl));
    l.setMeshoptDecoder(MeshoptDecoder);
  });
}

function MountedDevice({
  device,
  placement,
  frame,
  selected,
  dimmed,
  onPick,
}: {
  device: CatalogueDevice;
  placement: Placement;
  frame: number;
  selected: boolean;
  dimmed: boolean;
  onPick: (id: number | null) => void;
}) {
  const gltf = useVendorModel(device.model);

  /*
    Clone per placement. Two of the same switch are one glTF file, and
    useLoader hands every caller the same object graph, so without a clone
    the second one would move the first.
  */
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material)
        ? m.material.map((x) => x.clone())
        : (m.material as THREE.Material).clone();
    });
    return s;
  }, [gltf]);

  useMemo(() => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const s = mat as THREE.MeshStandardMaterial;
        if (!s) continue;
        s.transparent = dimmed;
        s.opacity = dimmed ? 0.2 : 1;
        // A selected device lifts rather than tints, so its real colour is
        // still readable while it is the one being moved.
        s.emissive = new THREE.Color(selected ? 0x2a3a1e : 0x000000);
        s.emissiveIntensity = selected ? 1 : 0;
      }
    });
  }, [scene, dimmed, selected]);

  /*
    The exports do not agree which horizontal axis carries the width: 35 of
    the 51 rack devices put it on Z and 16 on X. Measuring the box beats
    trusting the catalogue field, because the measurement cannot go stale.
  */
  const yaw = useMemo(() => {
    const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
    return Math.abs(size.x - PANEL_W) <= Math.abs(size.z - PANEL_W) ? 0 : -Math.PI / 2;
  }, [gltf]);

  /*
    Sit the panel on the mounting plane rather than trusting the file's
    origin: Ubiquiti place theirs wherever the CAD happened to, and a rack of
    devices each offset differently reads as a shelf collapse.
  */
  const offset = useMemo(() => {
    const probe = gltf.scene.clone(true);
    probe.rotation.set(0, yaw, 0);
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(probe);
    const c = box.getCenter(new THREE.Vector3());
    return new THREE.Vector3(-c.x, -box.min.y, -box.max.z);
  }, [gltf, yaw]);

  const fromBottom = frame - placement.at - unitsOf(device);
  const y = FRAME_FOOT + fromBottom * U;

  return (
    <group
      position={[0, y, FACE_Z]}
      onClick={(e) => {
        e.stopPropagation();
        onPick(selected ? null : placement.id);
      }}
    >
      <group rotation={[0, yaw, 0]} position={offset.toArray()}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

/**
 * A blank where a device is still downloading.
 *
 * Showing nothing would be worse than showing a slab: a rack that grows a
 * hole for two seconds after every pick reads as broken, and the slab is
 * exactly the volume the device will occupy, so nothing jumps when it lands.
 */
function LoadingSlab({ at, height, frame }: { at: number; height: number; frame: number }) {
  const fromBottom = frame - at - height;
  const y = FRAME_FOOT + fromBottom * U + (height * U) / 2;
  return (
    <mesh position={[0, y, FACE_Z - 0.19]}>
      <boxGeometry args={[PANEL_W, height * U - 0.002, 0.38]} />
      <meshStandardMaterial color="#c9ccd2" roughness={0.85} transparent opacity={0.32} />
    </mesh>
  );
}

/**
 * The empty units, marked at the rails only.
 *
 * The first version drew a full width plate across every free unit at 7
 * percent opacity, on the theory that a rack with gaps should look like a
 * rack with gaps. In a 12U with devices in it that was invisible, which is
 * why it survived review. In a tall empty frame it is a stack of forty two
 * pale slabs and the rack reads as a bookcase.
 *
 * The mistake was drawing the gap rather than the mounting position. A real
 * empty rack is mostly air: what tells you where a unit is, is the punched
 * strip on the post, and the frame already draws that. So this marks the
 * rails and nothing in between, which reads as a rack you could put
 * something into rather than one full of shelves.
 */
function EmptyUnits({ used, frame }: { used: boolean[]; frame: number }) {
  const free = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < frame; i += 1) if (!used[i]) out.push(i);
    return out;
  }, [used, frame]);

  const tab = 0.026;
  const x = PANEL_W / 2 - tab / 2;

  return (
    <>
      {free.map((at) => {
        const y = FRAME_FOOT + (frame - at - 1) * U + U / 2;
        return (
          <group key={at}>
            {[-x, x].map((sx) => (
              <mesh key={sx} position={[sx, y, FACE_Z - 0.004]}>
                <planeGeometry args={[tab, U * 0.5]} />
                <meshBasicMaterial
                  color="#7d8590"
                  transparent
                  opacity={0.16}
                  side={THREE.DoubleSide}
                />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}

export function BuilderScene({
  frame,
  placements,
  byslug,
  selected,
  onPick,
  used,
}: {
  frame: number;
  placements: Placement[];
  byslug: Map<string, CatalogueDevice>;
  selected: number | null;
  onPick: (id: number | null) => void;
  used: boolean[];
}) {
  /*
    Frame on the rack's own height rather than a fixed distance, so a 6U
    shelf and a 42U cabinet both fill the viewport. The frame is centred on
    the world origin by lifting it half its own height, which is also what
    the orbit target then points at.
  */
  const height = frame * U;
  /*
    Pull back far enough to see the whole frame including its feet, with a
    little air. The first attempt floored the distance at 1.15m, which is
    closer than a 12U needs and framed four units of it: the floor has to be
    below what the smallest frame wants, not above it.
  */
  const dist = Math.max(1.35, (FRAME_FOOT + height) * 2.6);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 28, position: [dist * 0.28, height * 0.34, dist * 0.94], near: 0.01, far: 80 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => onPick(null)}
    >
      <color attach="background" args={["#0c0e12"]} />
      {/*
        A frame in satin white against a dark ground needs real key light or
        it reads as a black box: the studio environment alone lights the
        reflections and almost nothing else. Same rig as the wired rack, so
        the two pages look like the same room.
      */}
      <hemisphereLight args={["#e6edfa", "#15191f", 0.6]} />
      <directionalLight position={[1.4, 2.4, 1.9]} intensity={2.0} />
      <directionalLight position={[-1.9, 1.4, 1.1]} intensity={0.7} color="#cfdcf2" />
      <directionalLight position={[0, 1.0, -2.2]} intensity={0.5} color="#93a5c0" />
      <Suspense fallback={null}>
        <StudioEnvironment />
      </Suspense>
      <group position={[0, -height / 2 - FRAME_FOOT, 0]}>
        <OpenRackFrame units={frame} depth={DEPTH} style="white" />
        <EmptyUnits used={used} frame={frame} />
        {placements.map((p) => {
          const d = byslug.get(p.slug);
          if (!d) return null;
          return (
            <Suspense
              key={p.id}
              fallback={<LoadingSlab at={p.at} height={unitsOf(d)} frame={frame} />}
            >
              <MountedDevice
                device={d}
                placement={p}
                frame={frame}
                selected={selected === p.id}
                dimmed={selected !== null && selected !== p.id}
                onPick={onPick}
              />
            </Suspense>
          );
        })}
      </group>
      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, 0, 0]}
        minDistance={0.6}
        maxDistance={dist * 2.6}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.02}
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
