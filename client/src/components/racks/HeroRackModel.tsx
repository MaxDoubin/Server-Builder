/**
 * The hero rack, as a real model you can pick parts out of.
 *
 * This is not the procedural renderer. It loads one authored GLB and shows
 * exactly that, nothing added: 162 nodes, 110,150 triangles, every part
 * where the model put it. The procedural renderer still draws the other six
 * racks, because they have no model of their own.
 *
 * The interaction is the point. Every mesh in the file belongs to a named
 * top level group, so a click raycasts into the scene, walks up to that
 * group, and looks it up in the part table. Selecting `USW_PRO_24_POE`
 * opens the switch's real published figures in the same panel the elevation
 * uses, which is why the compression step had to keep the node hierarchy
 * intact: merge the meshes and there is nothing left to click.
 *
 * Structure and cabling are in the scenery set and are not selectable. The
 * frame is not a device and clicking it should not claim to be one.
 *
 * Loaded lazily by the page, because it pulls in three.js and 632 KB of
 * geometry.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { heroPartIndex, type HeroModel } from "@/lib/racks/heroModels";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";
import { StudioEnvironment } from "./StudioEnvironment";

/**
 * Framing bounds, the same ones the procedural renderer uses, for the same
 * reason: an adaptive canvas is only an improvement while it stays within
 * shapes a page can actually lay out.
 */
const MARGIN = 1.06;
const MIN_ASPECT = 0.78;
const MAX_ASPECT = 1.4;

/** The group a mesh belongs to: the first path segment of its node name. */
function groupOf(object: THREE.Object3D, model: HeroModel): string | null {
  const parts = heroPartIndex(model);
  let node: THREE.Object3D | null = object;
  while (node) {
    const name = node.name ?? "";
    if (name) {
      const head = name.split("__")[0].split(".")[0];
      if (parts.has(head)) return head;
      if (model.scenery.has(head)) return null;
    }
    node = node.parent;
  }
  return null;
}

function Model({
  model,
  selected,
  onPick,
  onHover,
  onAspect,
}: {
  model: HeroModel;
  selected: string | null;
  onPick: (group: string | null) => void;
  onHover: (group: string | null) => void;
  onAspect: (aspect: number) => void;
}) {
  const { camera, controls } = useThree();
  const gltf = useLoader(GLTFLoader, model.url, (loader) => {
    (loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder);
  });

  /*
    One clone, so a second mount does not reuse and then re-tint the same
    materials the first one is still showing.
  */
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);

  /** Every mesh, bucketed by the group it belongs to. */
  const byGroup = useMemo(() => {
    const map = new Map<string, THREE.Mesh[]>();
    scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const g = groupOf(o, model);
      if (!g) return;
      const mesh = o as THREE.Mesh;
      // Clone the material so highlighting one part cannot bleed into every
      // other part that happens to share it, which is most of them.
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : (mesh.material as THREE.Material).clone();
      const bucket = map.get(g);
      if (bucket) bucket.push(mesh);
      else map.set(g, [mesh]);
    });
    return map;
  }, [scene, model]);

  // Highlight by lifting emissive rather than by swapping colour: the
  // selected part should look lit from within, not repainted.
  useEffect(() => {
    byGroup.forEach((meshes, group) => {
      const on = group === selected;
      for (const mesh of meshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (!std.emissive) continue;
          std.emissive.set(on ? "#1b6fa8" : "#000000");
          std.emissiveIntensity = on ? 0.55 : 0;
          std.needsUpdate = true;
        }
      }
    });
  }, [byGroup, selected]);

  /*
    Frame the model from its own bounds rather than from a guess. The
    authored file does not have to put its origin anywhere in particular,
    and the first pass hardcoded an offset that left the rack mostly above
    the top of the frame. Measuring is both correct and shorter than
    getting the guess right.
  */
  useEffect(() => {
    /*
      The generator works in Z-up, which is the convention for CAD and the
      opposite of glTF's. trimesh exports the vertices as authored without
      inserting the correction, so the rack arrives lying on its side. One
      rotation puts it back on its casters, and it has to happen before the
      bounds are measured or the framing is computed for the wrong axis.
    */
    scene.rotation.set(-Math.PI / 2, 0, 0);
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    scene.position.sub(centre);
    scene.updateMatrixWorld(true);

    /*
      Fit the box to the canvas, and the canvas to the box.

      A rack is portrait and the canvas was a fixed 4:3, so filling the
      height left the width two thirds empty, and the taller the rack the
      worse it got. Letting the frame take the model's own proportions costs
      nothing and is the difference between a photograph and a snapshot of a
      photograph. The bounds are clamped either side so a short rack does
      not end up in a letterbox and a tall one does not push the spec table
      it sits beside off a laptop screen.
    */
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const az = (22 * Math.PI) / 180;
    const across = size.x * Math.cos(az) + size.z * Math.sin(az);
    const towards = size.x * Math.sin(az) + size.z * Math.cos(az);
    const aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, (across / size.y) * 1.5));
    onAspect(aspect);

    const tanV = Math.tan(fov / 2);
    const dist =
      Math.max(size.y / 2 / tanV, across / 2 / (tanV * aspect)) * MARGIN + towards / 2;
    camera.position.set(Math.sin(az) * dist, size.y * 0.16, Math.cos(az) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (orbit?.target) {
      orbit.target.set(0, 0, 0);
      orbit.update?.();
    }
  }, [scene, camera, controls, onAspect]);

  const pick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onPick(groupOf(e.object, model));
    },
    [onPick, model],
  );

  const hover = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(groupOf(e.object, model));
    },
    [onHover, model],
  );

  return (
    <primitive
      object={scene}
      onClick={pick}
      onPointerMove={hover}
      onPointerOut={() => onHover(null)}
    />
  );
}

export function HeroRackModel({
  model,
  selectedId,
  onSelect,
}: {
  model: HeroModel;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const { dpr, tier } = useDeviceTier();
  const [hovered, setHovered] = useState<string | null>(null);
  /* Set once the model has loaded and measured itself. */
  const [aspect, setAspect] = useState(4 / 3);

  const hoveredName = hovered ? heroPartIndex(model).get(hovered)?.device.model : null;

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[#eef0f3]"
      style={{ cursor: hovered ? "pointer" : "default", aspectRatio: aspect }}
    >
      <Canvas
        dpr={dpr}
        shadows={false}
        camera={{ position: [1.05, 0.95, 1.65], fov: 34, near: 0.01, far: 40 }}
        gl={{ antialias: tier !== "low", alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#f4f5f7"]} />
        <StudioEnvironment />

        <directionalLight position={[1.8, 2.4, 2.4]} intensity={2.4} color="#ffffff" />
        <directionalLight position={[-2.2, 1.4, 1.6]} intensity={0.75} color="#e8eeff" />
        <directionalLight position={[-0.6, 2.0, -2.4]} intensity={1.3} color="#ffffff" />
        <ambientLight intensity={0.3} />

        <Suspense fallback={null}>
          <Model
            key={model.url}
            model={model}
            selected={selectedId ?? null}
            onPick={(g) => onSelect?.(g)}
            onHover={setHovered}
            onAspect={setAspect}
          />
        </Suspense>

        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enablePan={false}
          minDistance={0.4}
          maxDistance={8}
          minPolarAngle={Math.PI * 0.12}
          maxPolarAngle={Math.PI * 0.56}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center font-techno text-[10px] uppercase tracking-[0.3em] text-[#5c6472]">
        {hoveredName ?? "Click a device · drag to orbit · scroll to zoom"}
      </p>
    </div>
  );
}

export default HeroRackModel;
