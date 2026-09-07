/**
 * One device, on its own, in 3D.
 *
 * The catalogue lists two hundred and forty nine models and until this
 * existed you could look at a thumbnail of any of them and the actual model
 * of none of them, which is a strange thing for a page whose entire claim is
 * that these are real geometry with real measurements. A thumbnail is a
 * photograph of a model; this is the model.
 *
 * It is deliberately not the rack renderer. A rack has a frame, a floor, a
 * sweep, cabling and a dozen devices whose positions matter. One device has
 * none of that and needs none of it: a studio, the model, and a camera that
 * frames whatever it turns out to be, which for this catalogue ranges from a
 * 24mm door sensor to a 5U storage shelf.
 *
 * WHAT IT COSTS. Nothing until asked. The page mounts this only when a reader
 * opens a device, and the module is loaded lazily, so browsing the catalogue
 * downloads thumbnails and no geometry at all. That matters here more than
 * usual: the catalogue is 112MB of models and a page that eagerly loaded even
 * a fraction of them would be unusable.
 */

import { Suspense, useEffect, useMemo } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";
import { StudioEnvironment } from "./StudioEnvironment";
import { configureGltf } from "./gltfLoaders";

/** Room to leave around the object. */
const MARGIN = 1.16;
const AZIMUTH = (24 * Math.PI) / 180;

/**
 * How far above the object to stand.
 *
 * A fixed elevation cannot serve this catalogue. At fourteen degrees a 44mm
 * tall switch is nearly all lid, and its forty eight ports, which are the
 * only reason anybody opened it, are a sliver along the front edge. The same
 * fourteen degrees on a 130mm cube of a camera is too flat to read as an
 * object at all.
 *
 * Geometry alone cannot settle it. A ceiling access point is a 206mm disc
 * 46mm thick and a 3U network recorder is 482mm across and 132mm tall, and
 * by the ratios that is 0.22 against 0.24: indistinguishable, and they want
 * opposite treatments. So the mount decides, which is a fact the catalogue
 * already records rather than something inferred from a bounding box:
 *
 *   rack     stand low and look at the front, because it has one
 *   ceiling   look down on the face, because a disc has no front and the
 *             face is where the light ring and the model number are
 *   anything else   from its own proportions, which for a wall camera or a
 *             desk gateway gives a normal three quarter view
 */
function elevationFor(size: THREE.Vector3, mount?: string): number {
  if (mount === "rack") return (7 * Math.PI) / 180;
  if (mount === "ceiling") return (48 * Math.PI) / 180;
  const [a, , c] = [size.x, size.y, size.z].sort((m, n) => m - n);
  const natural = Math.atan2(a, Math.max(c, 0.001)) * 0.6;
  return Math.min((26 * Math.PI) / 180, Math.max((6 * Math.PI) / 180, natural));
}

function Model({ url, up, mount }: { url: string; up?: "y" | "z"; mount?: string }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);

  const gltf = useLoader(GLTFLoader, url, (loader) => {
    configureGltf(loader as GLTFLoader, gl);
  });

  /* Cloned, so opening the same device twice does not hand back a scene the
     previous viewer has already re-parented and re-centred. */
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);

  useEffect(() => {
    /*
      Two conventions in one catalogue. Ubiquiti export Y up, which is what
      glTF says; the generators here work in Z up, which is what CAD says,
      and trimesh writes the vertices as authored without inserting the
      correction. Rotating has to happen before the bounds are measured or
      the framing is computed against the wrong axis and a switch arrives
      standing on its end.
    */
    scene.rotation.set(up === "z" ? -Math.PI / 2 : 0, 0, 0);
    scene.updateMatrixWorld(true);

    let box = new THREE.Box3().setFromObject(scene);
    let size = box.getSize(new THREE.Vector3());

    /*
      Lay a ceiling device flat.

      The U7 Pro is a 206mm disc 46mm thick, and in the file that 46mm runs
      along X: the disc is standing on its edge like a wheel. Looking down on
      it from above then shows the rim, which is the least informative
      surface it has. Every ceiling mounted product in this catalogue lies
      flat against a ceiling in real life, so rotating the thin axis to
      vertical is not a presentation trick, it is putting the thing the way
      up it is actually installed.

      It does not work out which way up. Nothing in the file says which face
      is the one you see from below and which is the mounting side, so a disc
      whose thin axis ran along X comes to rest with a fifty fifty chance of
      showing its bracket. Both are a face rather than a rim, which was the
      problem worth solving, and the reader can turn it over.
    */
    if (mount === "ceiling") {
      if (size.x < size.y && size.x < size.z) scene.rotateZ(Math.PI / 2);
      else if (size.z < size.y && size.z < size.x) scene.rotateX(Math.PI / 2);
      scene.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(scene);
      size = box.getSize(new THREE.Vector3());
    }

    scene.position.sub(box.getCenter(new THREE.Vector3()));
    scene.updateMatrixWorld(true);

    /*
      Fit the bounding sphere rather than one axis. The catalogue runs from a
      24mm door sensor to a 5U shelf nearly a metre deep, and any rule that
      picks an axis in advance will crop one end of that range: a sphere is
      the only thing that is the same shape from every angle the reader can
      orbit to, so the object stays in frame all the way round.
    */
    const radius = size.length() / 2 || 0.1;
    const cam = camera as THREE.PerspectiveCamera;
    const fov = (cam.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * MARGIN;
    const elevation = elevationFor(size, mount);

    cam.position.set(
      Math.sin(AZIMUTH) * Math.cos(elevation) * dist,
      Math.sin(elevation) * dist,
      Math.cos(AZIMUTH) * Math.cos(elevation) * dist,
    );
    /* Near and far follow the object too, or a door sensor z-fights itself. */
    cam.near = Math.max(0.001, dist - radius * 2);
    cam.far = dist + radius * 4;
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (orbit?.target) {
      orbit.target.set(0, 0, 0);
      orbit.update?.();
    }
  }, [scene, camera, controls, up, mount]);

  return <primitive object={scene} />;
}

export function DeviceViewer({
  url,
  up,
  mount,
  label,
}: {
  url: string;
  up?: "y" | "z";
  /** Where the device mounts, which is what sets the camera's elevation. */
  mount?: string;
  label: string;
}) {
  const { dpr, tier } = useDeviceTier();

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[#eef0f3]">
      <Canvas
        dpr={dpr}
        shadows={false}
        camera={{ position: [0.4, 0.2, 0.6], fov: 32, near: 0.001, far: 40 }}
        gl={{ antialias: tier !== "low", alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#f4f5f7"]} />
        <StudioEnvironment />
        <directionalLight position={[1.8, 2.4, 2.4]} intensity={2.6} color="#ffffff" />
        <directionalLight position={[-2.2, 1.4, 1.6]} intensity={0.7} color="#e8eeff" />
        <directionalLight position={[-0.6, 2.0, -2.4]} intensity={1.3} color="#ffffff" />
        <ambientLight intensity={0.3} />
        <Suspense fallback={null}>
          <Model key={url} url={url} up={up} mount={mount} />
        </Suspense>
        <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} enableDamping />
      </Canvas>
      <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center font-techno text-[9px] uppercase tracking-[0.28em] text-[hsl(220_6%_45%)]">
        {label} · drag to orbit · scroll to zoom
      </p>
    </div>
  );
}

export default DeviceViewer;
