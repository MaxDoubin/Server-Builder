/**
 * Dell's PowerEdge R760 service model, standing in for the focus server on
 * the home page rack and coming apart as an engineering exploded view.
 *
 * This is the same model, the same part table and the same drafting layer
 * (dashed center lines, leaders, names) as the /teardown page. Nothing about
 * the teardown is re-described here: the parts, their travel and their order
 * come from teardownParts, the lines from ExplodedCallouts.
 *
 * This file is only ever reached through a dynamic import, fired as the
 * reader scrolls toward the beat, so the 4.2 MB model and the glTF decoders
 * cost nothing to a visitor who never gets there, and nothing at all on a
 * low tier device, which keeps the procedural chassis.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { configureGltf } from "@/components/racks/gltfLoaders";
import { MODEL_URL, authoredName, findAssemblyRoot } from "@/components/teardown/TeardownScene";
import { CHASSIS_MATCH, TEARDOWN_PARTS, waveProgress, type TeardownPart } from "@/components/teardown/teardownParts";
import { isCalledOut, measureCallouts } from "@/components/teardown/explodedView";
import { ExplodedCallouts } from "@/components/teardown/ExplodedCallouts";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";
import type { UnrackPose } from "./unrackTimeline";

interface Tracked {
  node: THREE.Object3D;
  home: THREE.Vector3;
  offset: THREE.Vector3;
  part: TeardownPart;
}

/**
 * The assemblies that can be seen from the front of a closed, racked
 * machine. Everything else is sealed inside the chassis, so while the server
 * sits in the rack it is not drawn at all: thirty assemblies of draw calls
 * saved for every frame of the page that is not this beat.
 */
const SEEN_WHEN_RACKED = new Set(["Front bezel", "Bezel key", "System cover", "Drive carriers", "Left control panel", "Right control panel"]);

/**
 * The front panel alone. If the reader scrolls into the beat while the
 * hand-over dissolve is part way, the model backs out again, and all of it
 * that is still drawn while it does is this. Left whole, its half-dissolved
 * lid would speckle the top of the procedural chassis as that slid out.
 */
const FRONT_PANEL = new Set(["Front bezel", "Bezel key", "Left control panel", "Right control panel"]);

/** How much faster the dissolve backs out than it comes in. */
const RETREAT_RATE = 4;

/** Which assemblies are drawn: see the three sets of rules where it is applied. */
type Drawn = "racked" | "retreat" | "all";

/**
 * How strongly the model's metal mirrors its studio. Racked, it is turned
 * down so the machine sits in the rack's own dim light; lifted out, it is
 * the teardown page's value, so the exploded view has that page's look.
 */
const REFLECTION_RACKED = 0.3;
const REFLECTION_HERO = 1;

/**
 * The names a portrait screen has room for. The cover and the memory sit
 * directly over the processors as a phone sees the machine, and the copy
 * leaves one row for names above it, so three names there print over each
 * other. The processors keep theirs.
 */
const PORTRAIT_CALLOUTS = new Set(["Drive carriers", "Cooling fans", "Processors and heatsinks", "Power supplies"]);

/** Seconds the model takes to dissolve in over the procedural chassis. */
const DISSOLVE_SECONDS = 0.7;

export default function R760Unrack({
  poseRef,
  frontZ,
  height,
  tier,
  onShown,
}: {
  /** Live pose of the beat, written by the parent every frame. */
  poseRef: { current: UnrackPose };
  /** Where the front of the machine sits, in the parent's space. */
  frontZ: number;
  /** Height of the rack slot, in meters, so the machine sits on its floor. */
  height: number;
  tier: DeviceTier;
  /** Called once the model fully covers the procedural chassis. */
  onShown: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const rootScene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  // The section copy is laid out differently on a portrait screen (a taller
  // block, further down), so the names keep clear of a different area there.
  const portrait = useThree((s) => s.size.width < s.size.height);
  const gltf = useLoader(GLTFLoader, MODEL_URL, (loader) => configureGltf(loader as GLTFLoader, gl));

  /*
    A private copy of the scene with private materials. The loader caches
    what it returns and /teardown draws from the same cache, so fading or
    relighting the shared materials here would follow the reader there.
  */
  const model = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const materials = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => {
        let copy = materials.get(m);
        if (!copy) {
          copy = m.clone() as THREE.MeshStandardMaterial;
          copy.userData.baseOpacity = copy.opacity;
          /*
            Dithered rather than blended transparency for the dissolve. A
            blended fade of a model with an interior shows the inside
            through the outside and sorts wrongly; a hashed one writes
            depth like any opaque surface and simply has holes in it until
            it does not.
          */
          if (!copy.transparent) copy.alphaHash = true;
          copy.opacity = 0;
          materials.set(m, copy);
        }
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });

    const root = findAssemblyRoot(scene);
    const tracked: Tracked[] = [];
    let chassis: THREE.Object3D | null = null;
    for (const child of root.children) {
      const name = authoredName(child).toLowerCase();
      if (name.includes(CHASSIS_MATCH)) {
        chassis = child;
        continue;
      }
      const part = TEARDOWN_PARTS.find((p) => name.includes(p.match.toLowerCase()));
      if (!part) continue;
      tracked.push({
        node: child,
        home: child.position.clone(),
        offset: new THREE.Vector3(...part.dir).normalize().multiplyScalar(part.distance),
        part,
      });
    }

    const callouts = measureCallouts(scene, tracked);

    // Sit the machine in the slot: centered, on the slot floor, bezel at the
    // rack face. Measured from the model so a rebuilt file still lands. Dell
    // author the machine with its front toward -Z in the scene (the Main
    // Assembly node is turned half a circle), and a rack faces +Z, so the
    // group below turns it around and the offset is worked out to match.
    //
    // Depth is taken from the bezel itself, not from the whole model. Other
    // parts reach further forward than the bezel's face, and aligning on
    // them left the bezel behind the procedural chassis's front panel: the
    // hand-over dissolve then ran entirely out of sight and the model
    // appeared in one frame when the procedural chassis was hidden.
    const box = new THREE.Box3().setFromObject(scene);
    const bezel = tracked.find((t) => t.part.label === "Front bezel");
    const front = bezel ? new THREE.Box3().setFromObject(bezel.node).min.z : box.min.z;
    const offset = new THREE.Vector3((box.min.x + box.max.x) / 2, -height / 2 + 0.0015 - box.min.y, frontZ + front);

    return { scene, materials: Array.from(materials.values()), tracked, chassis: chassis as THREE.Object3D | null, callouts, offset };
  }, [gltf, frontZ, height]);

  const compiled = useRef(false);

  /*
    Something for the sheet metal to reflect. The rack scene has no
    environment because its procedural parts are painted, not physically
    metal; Dell's materials are, and without a room to mirror they render
    near black. The map goes on these materials only, so the rest of the
    rack keeps the look it was lit for.
  */
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    for (const m of model.materials) {
      m.envMap = target.texture;
      m.envMapIntensity = REFLECTION_RACKED;
      m.needsUpdate = true;
    }
    // Build every shader before the first frame that draws them, off the
    // main thread where the driver allows, so the model arriving does not
    // cost the scroll a dropped frame.
    let live = true;
    gl.compileAsync(model.scene, camera, rootScene)
      .catch(() => undefined)
      .then(() => {
        if (live) compiled.current = true;
      });
    return () => {
      live = false;
      compiled.current = false;
      // Free the GPU side of everything the model brought with it. The
      // loader keeps its CPU copy, so /teardown can still reuse the fetch.
      model.scene.traverse((o) => {
        (o as THREE.Mesh).geometry?.dispose();
      });
      for (const m of model.materials) {
        for (const value of Object.values(m)) {
          if (value instanceof THREE.Texture && value !== target.texture) value.dispose();
        }
        m.dispose();
      }
      target.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, camera, rootScene, model]);

  const dissolve = useRef(0);
  const shown = useRef(false);
  const lastExplode = useRef(-1);
  const lastReflection = useRef(REFLECTION_RACKED);
  const lastDrawn = useRef<Drawn | null>(null);
  const explodeRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  // A landscape screen names exactly the parts /teardown names on the same
  // class of device. A portrait one has room for fewer: see PORTRAIT_CALLOUTS.
  const calledOut = useCallback(
    (label: string) => (portrait ? PORTRAIT_CALLOUTS.has(label) : isCalledOut(label, tier)),
    [tier, portrait],
  );

  useFrame((_, delta) => {
    const pose = poseRef.current;
    const racked = pose.slide <= 0 && pose.lift <= 0;

    /*
      The hand-over from the procedural chassis happens once, only while
      the server is home in the rack, as a short dissolve of its front
      panel. If the download lands mid beat the procedural server finishes
      the beat and the model takes over after it is back in its slot, so
      the two are never exchanged while either is the subject of the shot.

      The dissolve only advances while the server is home. If the reader
      scrolls into the beat part way through it, it runs backward instead
      and the model fades back out over the procedural chassis, which never
      stopped being drawn underneath. The hand-over can therefore only
      complete in the rack, and tries again the next time the server is home.
    */
    if (!shown.current) {
      const rising = compiled.current && racked;
      if (!rising && dissolve.current <= 0) {
        if (groupRef.current) groupRef.current.visible = false;
        return;
      }
      if (groupRef.current) groupRef.current.visible = true;
      // Development only: a capture script can stretch the fade, because a
      // software renderer cannot screenshot fast enough to catch 0.7 s.
      const seconds = (import.meta.env.DEV && (window as unknown as { __unrackDissolveSeconds?: number }).__unrackDissolveSeconds) || DISSOLVE_SECONDS;
      const step = Math.min(delta, 0.05) / seconds;
      dissolve.current = Math.max(0, Math.min(1, dissolve.current + (rising ? step : -step * RETREAT_RATE)));
      const k = dissolve.current;
      // Development only, for the capture script. Compiled out of production.
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__unrackDissolve = k;
      for (const m of model.materials) m.opacity = (m.userData.baseOpacity as number) * k;
      if (k >= 1) {
        shown.current = true;
        onShown();
      }
    }

    // Racked: only what can be seen from the front of a closed machine.
    // Backing out of an unfinished hand-over: only the front panel.
    // Otherwise, once the model is the server: everything.
    const drawn: Drawn = racked ? "racked" : shown.current ? "all" : "retreat";
    if (drawn !== lastDrawn.current) {
      lastDrawn.current = drawn;
      const set = drawn === "racked" ? SEEN_WHEN_RACKED : drawn === "retreat" ? FRONT_PANEL : null;
      for (const t of model.tracked) t.node.visible = !set || set.has(t.part.label);
      if (model.chassis) model.chassis.visible = drawn !== "retreat";
    }

    // Only written when it has moved: 185 materials is not a per-frame job.
    const reflection = REFLECTION_RACKED + (REFLECTION_HERO - REFLECTION_RACKED) * pose.lift;
    if (Math.abs(reflection - lastReflection.current) > 0.004) {
      lastReflection.current = reflection;
      for (const m of model.materials) m.envMapIntensity = reflection;
    }

    const q = pose.explode;
    explodeRef.current = q;
    if (q === lastExplode.current) return;
    lastExplode.current = q;
    for (const t of model.tracked) {
      const k = waveProgress(q, t.part.wave);
      t.node.position.set(t.home.x + t.offset.x * k, t.home.y + t.offset.y * k, t.home.z + t.offset.z * k);
    }
  });

  return (
    <group ref={groupRef} position={model.offset} rotation={[0, Math.PI, 0]} visible={false}>
      <primitive object={model.scene} />
      <ExplodedCallouts
        seeds={model.callouts.seeds}
        center={model.callouts.center}
        progressRef={explodeRef}
        selected={null}
        isCalledOut={calledOut}
        lean={portrait ? 0.15 : undefined}
        topInset={portrait ? 0.48 : 0.42}
        stagger={portrait ? 0.45 : undefined}
      />
    </group>
  );
}
