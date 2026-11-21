/**
 * A PowerEdge R760 coming apart, driven by one 0..1 value.
 *
 * The geometry is Dell's own service model, which is the whole reason this
 * is possible: it arrives as 34 named assemblies rather than one welded
 * lump, so the parts to move already exist and already carry the names a
 * technician uses. Ubiquiti's models, by comparison, are a single body mesh
 * with no interior at all, and nothing in this file would work on one.
 *
 * The scene is trimmed before it gets here. Dell ship it as a Unity export
 * carrying a camera, several point lights, an event system, a font atlas
 * and an Extra Content tree of alternate parts for procedures the guide can
 * branch into, and all of it renders, the duplicates inside the real parts.
 * What is served is the one subtree that is the machine.
 *
 * Parts move by offsetting their own transform rather than by reparenting,
 * so the model's hierarchy is left exactly as Dell built it and the whole
 * thing snaps back together by setting progress to zero.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { configureGltf } from "../racks/gltfLoaders";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";
import { CHASSIS_MATCH, TEARDOWN_PARTS, waveProgress, type TeardownPart } from "./teardownParts";
import { EXPLODED_VIEW_ENABLED, isCalledOut, measureCallouts } from "./explodedView";
import { ExplodedCallouts } from "./ExplodedCallouts";

export const MODEL_URL = "/models/vendor/dell/poweredge-r760.glb";

/** A part we found in the scene, with where it started and where it goes. */
interface Tracked {
  node: THREE.Object3D;
  home: THREE.Vector3;
  offset: THREE.Vector3;
  part: TeardownPart;
}

/**
 * Where the assemblies live.
 *
 * Dell's export nests the machine several levels deep inside the Unity
 * scene it was authored in, and the wrapper is not even named consistently
 * between platforms: the R660 calls it PE_R660_Clone and the R760 calls it
 * Main Assembly. Walking to it by name means a rebuild that renames or adds
 * a wrapper fails loudly here rather than silently producing an empty page.
 */
function findAssemblyRoot(scene: THREE.Object3D): THREE.Object3D {
  let found: THREE.Object3D | null = null;
  scene.traverse((o) => {
    if (!found && /^Main Assembly\b/i.test(authoredName(o))) found = o;
  });
  return found ?? scene;
}

/**
 * The name Dell gave a node, not the one three.js left it with.
 *
 * GLTFLoader rewrites every node name so it is safe to use in an animation
 * track: spaces become underscores and dots are dropped, and the original
 * goes to userData.name. So "R760_ 2.5 HDD" arrives as "R760__25_HDD" and
 * "Main Assembly (1)" as "Main_Assembly_(1)", and matching the table
 * against `name` quietly misses the wrapper and every part whose name has a
 * space or a dot in it: the drives, the memory, the processors, the power
 * supplies. Nothing throws. The parts simply never move.
 */
function authoredName(o: THREE.Object3D): string {
  const authored = (o.userData as { name?: unknown }).name;
  return typeof authored === "string" ? authored : o.name;
}

export function TeardownModel({
  progressRef,
  onParts,
  onSelect,
  selected,
}: {
  /** Live 0..1, read every frame so scrolling never waits on React. */
  progressRef: React.MutableRefObject<number>;
  onParts?: (labels: string[]) => void;
  onSelect?: (label: string | null) => void;
  selected?: string | null;
}) {
  const { gl } = useThree();
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => configureGltf(loader as GLTFLoader, gl));

  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);

  /*
    Match each assembly to its entry in the teardown table once, on load.
    Matching on a substring of the node name rather than the whole thing,
    because Dell's names carry revision suffixes (`_Update_B`, `_FB`) that
    change between platform revisions and would otherwise silently drop a
    part out of the animation.
  */
  const tracked = useMemo(() => {
    const root = findAssemblyRoot(scene);
    const out: Tracked[] = [];
    for (const child of root.children) {
      const name = authoredName(child).toLowerCase();
      if (name.includes(CHASSIS_MATCH)) continue;
      const part = TEARDOWN_PARTS.find((p) => name.includes(p.match.toLowerCase()));
      if (!part) continue;
      const dir = new THREE.Vector3(...part.dir).normalize();
      out.push({
        node: child,
        home: child.position.clone(),
        offset: dir.multiplyScalar(part.distance),
        part,
      });
    }
    return out;
  }, [scene]);

  useEffect(() => {
    onParts?.(tracked.map((t) => t.part.label));
  }, [tracked, onParts]);

  /*
    Dim everything except the selected part rather than hiding the rest.
    Hiding turns a machine into a floating component with no sense of where
    it came from, which is the opposite of what a teardown is for.
  */
  useEffect(() => {
    const dimmed = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const owner = tracked.find((t) => {
        let p: THREE.Object3D | null = o;
        while (p) {
          if (p === t.node) return true;
          p = p.parent;
        }
        return false;
      });
      const on = !selected || owner?.part.label === selected;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mat = m as THREE.MeshStandardMaterial;
        if (!mat) continue;
        if (!dimmed.has(mat)) {
          mat.transparent = true;
          dimmed.add(mat);
        }
        mat.opacity = on ? 1 : 0.16;
        mat.depthWrite = on;
      }
    });
  }, [scene, tracked, selected]);

  /*
    What the callout layer needs to know about each part, measured once.
    Skipped entirely when the layer is switched off.
  */
  const callouts = useMemo(
    () => (EXPLODED_VIEW_ENABLED ? measureCallouts(scene, tracked) : null),
    [scene, tracked],
  );
  const { tier } = useDeviceTier();
  const calledOut = useCallback((label: string) => isCalledOut(label, tier), [tier]);

  useFrame(() => {
    const p = progressRef.current;
    for (const t of tracked) {
      const k = waveProgress(p, t.part.wave);
      t.node.position.set(
        t.home.x + t.offset.x * k,
        t.home.y + t.offset.y * k,
        t.home.z + t.offset.z * k,
      );
    }
  });

  const onClick = (e: { stopPropagation: () => void; object: THREE.Object3D }) => {
    e.stopPropagation();
    let node: THREE.Object3D | null = e.object;
    while (node) {
      const hit = tracked.find((t) => t.node === node);
      if (hit) {
        onSelect?.(hit.part.label === selected ? null : hit.part.label);
        return;
      }
      node = node.parent;
    }
    onSelect?.(null);
  };

  return (
    <>
      <primitive object={scene} onClick={onClick} />
      {callouts ? (
        <ExplodedCallouts
          seeds={callouts.seeds}
          center={callouts.center}
          progressRef={progressRef}
          selected={selected ?? null}
          isCalledOut={calledOut}
        />
      ) : null}
    </>
  );
}
