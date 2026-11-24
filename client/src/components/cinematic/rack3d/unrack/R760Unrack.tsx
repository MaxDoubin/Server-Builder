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
import type { CalloutSeed } from "@/components/teardown/explodedView";
import { EXPLODE_LIFT_SCALE, type UnrackPose } from "./unrackTimeline";

/**
 * Left to right as this scene's wide-screen hero camera sees the machine,
 * which is very nearly back to front along the model's own depth axis. The
 * callout layer staggers neighboring names by this order.
 */
function acrossHero(s: CalloutSeed): number {
  return -(s.home.z + s.travel.z) - 0.12 * (s.home.x + s.travel.x);
}

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

const LIFT_SCALE = new THREE.Vector3(1, EXPLODE_LIFT_SCALE, 1);

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
    for (const child of root.children) {
      const name = authoredName(child).toLowerCase();
      if (name.includes(CHASSIS_MATCH)) continue;
      const part = TEARDOWN_PARTS.find((p) => name.includes(p.match.toLowerCase()));
      if (!part) continue;
      tracked.push({
        node: child,
        home: child.position.clone(),
        // Vertical travel is flattened here; the assembly root is only ever
        // turned about its vertical axis, so "up" means the same thing in a
        // part's own space as it does on screen.
        offset: new THREE.Vector3(...part.dir).normalize().multiplyScalar(part.distance).multiply(LIFT_SCALE),
        part,
      });
    }

    const callouts = measureCallouts(scene, tracked);

    // Sit the machine in the slot: centered, on the slot floor, bezel at the
    // rack face. Measured from the model so a rebuilt file still lands. Dell
    // author the machine with its front toward -Z in the scene (the Main
    // Assembly node is turned half a circle), and a rack faces +Z, so the
    // group below turns it around and the offset is worked out to match.
    const box = new THREE.Box3().setFromObject(scene);
    const offset = new THREE.Vector3((box.min.x + box.max.x) / 2, -height / 2 + 0.0015 - box.min.y, frontZ + box.min.z);

    return { scene, materials: Array.from(materials.values()), tracked, callouts, offset };
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
      m.envMapIntensity = 0.3;
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
  const lastRacked = useRef<boolean | null>(null);
  const explodeRef = useRef(0);
  const groupRef = useRef<THREE.Group>(null);

  // Fewer names than /teardown shows: this is a beat in a scroll, not a
  // page to study, and the section's own copy shares the screen.
  const calledOut = useCallback((label: string) => isCalledOut(label, tier === "high" ? "mid" : "low"), [tier]);

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
      const step = Math.min(delta, 0.05) / DISSOLVE_SECONDS;
      dissolve.current = Math.max(0, Math.min(1, dissolve.current + (rising ? step : -step)));
      const k = dissolve.current;
      for (const m of model.materials) m.opacity = (m.userData.baseOpacity as number) * k;
      if (k >= 1) {
        shown.current = true;
        onShown();
      }
    }

    if (racked !== lastRacked.current) {
      lastRacked.current = racked;
      for (const t of model.tracked) t.node.visible = !racked || SEEN_WHEN_RACKED.has(t.part.label);
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
        lean={0.25}
        topInset={0.42}
        stagger={0.9}
        across={acrossHero}
      />
    </group>
  );
}
