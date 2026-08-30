/**
 * A UniFi rack built from Ubiquiti's own geometry, and patched.
 *
 * Everything the rack pages already do assumes a chassis we modelled, which
 * means the code knows where every port is because it put them there. A
 * vendor model knows nothing: it is the real hardware and it is a closed
 * box. So the port positions come from the build definition instead, and
 * everything else, the frame, the lead shape, the jacket colours, is shared
 * with the rack pages rather than rewritten.
 *
 * The models are Draco compressed and their textures are KTX2, both of
 * which need a decoder wired in, and both decoders are served from this
 * site rather than a CDN.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { StudioEnvironment } from "./StudioEnvironment";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { U } from "@/components/cinematic/rack3d/rackConfig";
import { FRAME_FOOT, OpenRackFrame } from "./OpenRackFrame";
import {
  CABLE_RADIUS,
  ETHERLIGHT_JACKET,
  JACKET_HEX,
  etherlightHue,
  leadCurve,
  powerCurve,
} from "./cableShape";
import {
  OPTIC_BASE,
  PDU_INDEX,
  WIRED_DEVICES,
  WIRED_PATCHES,
  WIRED_RACK_UNITS,
  type PortStrip,
  type WiredDevice,
} from "@/lib/unifiWiredRack";

/** Ubiquiti face plates are 442.4mm across; the frame's opening is wider. */
const PANEL_W = 0.4424;
/**
 * Where a face plate sits, front to back.
 *
 * The frame is built symmetrically about its own origin, so a 620mm deep
 * rack has its front posts at +310mm and not at zero. Mounting devices at
 * zero puts them a foot behind the rails, which renders as a rack you are
 * looking into rather than at, and it is not obvious from the front until
 * something crosses in front of a panel.
 */
const FACE_Z = 0.303;

/** Centre height of a device, given where it hangs in the rack. */
function deviceY(d: WiredDevice): number {
  const fromBottom = WIRED_RACK_UNITS - d.at - d.u;
  return FRAME_FOOT + fromBottom * U + (d.u * U) / 2;
}

/** World position of one jack on one device. */
function portAt(d: WiredDevice, strip: PortStrip, index: number): THREE.Vector3 {
  const row = Math.floor(index / strip.cols) % strip.rows.length;
  const col = index % strip.cols;
  const span = strip.x[1] - strip.x[0];
  const step = strip.cols > 1 ? span / (strip.cols - 1) : 0;
  const fx = strip.x[0] + col * step;
  const x = (fx - 0.5) * PANEL_W;
  const y = deviceY(d) + (0.5 - strip.rows[row]) * (d.u * U) * 0.86;
  return new THREE.Vector3(x, y, FACE_Z);
}

function anchor(deviceIndex: number, portIndex: number): THREE.Vector3 | null {
  const d = WIRED_DEVICES[deviceIndex];
  if (!d) return null;
  if (portIndex >= OPTIC_BASE) {
    return d.optics ? portAt(d, d.optics, portIndex - OPTIC_BASE) : null;
  }
  return d.ports ? portAt(d, d.ports, portIndex) : null;
}

/** One vendor model, mounted at its rack position. */
function MountedDevice({
  device,
  onPick,
  dimmed,
}: {
  device: WiredDevice;
  onPick: (label: string | null) => void;
  dimmed: boolean;
}) {
  const { gl } = useThree();
  const url = device.own
    ? `/models/own/${device.slug}.glb`
    : `/models/vendor/ubiquiti/${device.slug}.glb`;
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    const l = loader as GLTFLoader;
    l.setDRACOLoader(new DRACOLoader().setDecoderPath("/draco/"));
    l.setKTX2Loader(new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl));
    l.setMeshoptDecoder(MeshoptDecoder);
  });

  /*
    Clone per mount. Two surge panels are the same file, and without a clone
    the second one would move the first: a glTF scene is a single object
    graph, and useLoader hands out the same instance to every caller.
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
        s.opacity = dimmed ? 0.22 : 1;
      }
    });
  }, [scene, dimmed]);

  /*
    These exports do not agree which horizontal axis carries the width. The
    catalogue measured it per device and the build quotes the yaw, so a
    device whose panel runs along X gets no turn and one running along Z
    gets a quarter of one.
  */
  const yaw = useMemo(() => {
    if (device.own) return 0;
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    return Math.abs(size.x - PANEL_W) <= Math.abs(size.z - PANEL_W) ? 0 : -Math.PI / 2;
  }, [gltf, device.own]);

  /** Our own generators emit Z-up geometry, so it has to be laid back. */
  const pitch = device.own ? -Math.PI / 2 : 0;

  /*
    Sit the panel on the rack's mounting plane rather than trusting the
    file's origin: Dell and Ubiquiti both place theirs wherever the CAD
    happened to, and a rack of devices each offset differently reads as a
    shelf collapse.
  */
  const offset = useMemo(() => {
    const probe = gltf.scene.clone(true);
    probe.rotation.set(pitch, yaw, 0);
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(probe);
    const c = box.getCenter(new THREE.Vector3());
    return new THREE.Vector3(-c.x, -box.min.y, -box.max.z);
  }, [gltf, yaw, pitch]);

  const y = deviceY(device) - (device.u * U) / 2;
  return (
    <group
      position={[0, y, FACE_Z]}
      onClick={(e) => {
        e.stopPropagation();
        onPick(device.label);
      }}
    >
      <group rotation={[pitch, yaw, 0]} position={offset.toArray()}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

/**
 * Every patch lead, lit the way Etherlighting actually lights.
 *
 * Ubiquiti publish no model for any of their 27 cable products, which sounds
 * like a gap and is not one. A patch lead is not an object you place, it is
 * a path between two ports that do not exist until somebody decides what is
 * plugged into what, so a downloaded cable at a fixed length in a fixed pose
 * would have to be deformed along a curve computed here anyway.
 *
 * What took three attempts was the light. First the jackets were colour
 * coded like an ordinary patch panel, which is not what Etherlighting is at
 * all: the jacket is plain white and the colour lives in the plug. Then the
 * plug was a moulded boot with a tinted body, which is a cornered block
 * sitting where a light should be, and it read as a coloured object rather
 * than as something emitting.
 *
 * Light is not an object. So there is no plug body here at all. There is a
 * small unlit core at the port, a soft halo around it that is additively
 * blended so it brightens whatever is behind it the way a real glow does,
 * and the jacket itself carries the colour a short way up its own length
 * before fading to white, because that is what a translucent jacket lit
 * from one end looks like. The fade is per vertex, which also means every
 * lead in the rack is one draw call.
 */
function Leads() {
  const { tubeGeometry, glows } = useMemo(() => {
    const tubes: THREE.BufferGeometry[] = [];
    const glowList: Array<{ at: THREE.Vector3; hue: THREE.Color }> = [];
    const litCount = WIRED_PATCHES.filter((p) => !p.fibre).length;
    let litIndex = 0;
    const white = new THREE.Color(ETHERLIGHT_JACKET);

    WIRED_PATCHES.forEach((p, i) => {
      const a = anchor(p.from[0], p.from[1]);
      const b = anchor(p.to[0], p.to[1]);
      if (!a || !b) return;
      const reach = Math.min(1, Math.abs(a.y - b.y) / (WIRED_RACK_UNITS * U));
      const fibre = !!p.fibre;
      const radius = fibre ? CABLE_RADIUS.etherlighting : CABLE_RADIUS.etherlighting * 1.15;
      const segments = 48;
      const radial = 8;
      const geom = new THREE.TubeGeometry(leadCurve(a, b, i, reach), segments, radius, radial, false);

      const end = fibre
        ? new THREE.Color(JACKET_HEX[p.jacket] ?? "#8d949f")
        : new THREE.Color(etherlightHue(litIndex, litCount));
      const base = fibre ? end : white;
      if (!fibre) {
        glowList.push({ at: a, hue: end }, { at: b, hue: end });
        litIndex += 1;
      }

      /*
        TubeGeometry lays its vertices out ring by ring along the curve, so
        the ring a vertex belongs to gives its distance along the lead for
        free. The colour runs from the port hue at each end to the jacket
        white in the middle, over about a fifth of the length, which is
        roughly how far the light actually carries.
      */
      const count = geom.attributes.position.count;
      const colours = new Float32Array(count * 3);
      const c = new THREE.Color();
      for (let v = 0; v < count; v += 1) {
        const ring = Math.floor(v / (radial + 1));
        const t = ring / segments;
        const nearEnd = Math.min(t, 1 - t) / 0.2;
        c.copy(base).lerp(end, 1 - Math.min(1, nearEnd));
        colours[v * 3] = c.r;
        colours[v * 3 + 1] = c.g;
        colours[v * 3 + 2] = c.b;
      }
      geom.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      tubes.push(geom);
    });

    return { tubeGeometry: mergeGeometries(tubes, false), glows: glowList };
  }, []);

  const coreRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    glows.forEach((g, i) => {
      // The core sits just proud of the panel, where the plug face would be.
      m.compose(g.at, q, new THREE.Vector3(0.0034, 0.0034, 0.0026));
      coreRef.current?.setMatrixAt(i, m);
      coreRef.current?.setColorAt(i, g.hue);
      m.compose(g.at, q, new THREE.Vector3(0.0092, 0.0092, 0.0060));
      haloRef.current?.setMatrixAt(i, m);
      haloRef.current?.setColorAt(i, g.hue);
    });
    for (const ref of [coreRef, haloRef]) {
      const mesh = ref.current;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [glows]);

  const glowGeometry = useMemo(() => new THREE.SphereGeometry(1, 14, 10), []);

  return (
    <>
      {tubeGeometry ? (
        <mesh geometry={tubeGeometry}>
          <meshStandardMaterial vertexColors roughness={0.34} metalness={0.02} />
        </mesh>
      ) : null}
      {glows.length > 0 ? (
        <>
          <instancedMesh
            ref={coreRef}
            args={[glowGeometry, undefined, glows.length]}
            frustumCulled={false}
          >
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
          {/*
            Additive, so the halo adds light to the panel behind it instead
            of painting a coloured ball on top of it. Depth write off for the
            same reason: a glow does not occlude anything.
          */}
          <instancedMesh
            ref={haloRef}
            args={[glowGeometry, undefined, glows.length]}
            frustumCulled={false}
          >
            <meshBasicMaterial
              toneMapped={false}
              transparent
              opacity={0.30}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </instancedMesh>
        </>
      ) : null}
    </>
  );
}

/** Power leads, every one of them landing in the distribution unit. */
function PowerLeads() {
  const geometry = useMemo(() => {
    const pdu = WIRED_DEVICES[PDU_INDEX];
    if (!pdu?.ports) return null;
    const parts: THREE.BufferGeometry[] = [];
    let outlet = 0;
    WIRED_DEVICES.forEach((d, i) => {
      if (i === PDU_INDEX || d.inlet === undefined) return;
      const a = new THREE.Vector3((d.inlet - 0.5) * PANEL_W, deviceY(d), FACE_Z);
      const b = portAt(pdu, pdu.ports!, outlet);
      outlet += 1;
      // Leads leave on whichever side their inlet is nearer, which is what
      // keeps the two lanes down the rack tidy instead of crossed.
      const side = d.inlet > 0.5 ? 1 : -1;
      parts.push(new THREE.TubeGeometry(powerCurve(a, b, side, i), 40, 0.0042, 7, false));
    });
    return parts.length ? mergeGeometries(parts, false) : null;
  }, []);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#22262c" roughness={0.68} metalness={0.05} />
    </mesh>
  );
}

export function WiredRackScene({ onPick }: { onPick?: (label: string | null) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (label: string | null) => {
    const next = label === picked ? null : label;
    setPicked(next);
    onPick?.(next);
  };
  const height = WIRED_RACK_UNITS * U;
  const controls = useRef(null);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ fov: 28, position: [0.46, height * 0.30, 1.62], near: 0.01, far: 40 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => pick(null)}
    >
      <color attach="background" args={["#0c0e12"]} />
      <hemisphereLight args={["#e6edfa", "#15191f", 0.6]} />
      <directionalLight position={[1.4, 2.4, 1.9]} intensity={2.0} />
      <directionalLight position={[-1.9, 1.4, 1.1]} intensity={0.7} color="#cfdcf2" />
      <directionalLight position={[0, 1.0, -2.2]} intensity={0.5} color="#93a5c0" />
      <Suspense fallback={null}>
        {/* The site's own procedural studio rather than drei's Environment,
            which fetches an HDR from a third party CDN on every load. */}
        <StudioEnvironment />
        <group position={[0, -height / 2 - FRAME_FOOT, 0]}>
          <OpenRackFrame units={WIRED_RACK_UNITS} depth={0.62} style="white" />
          {WIRED_DEVICES.map((d, i) => (
            <MountedDevice
              key={`${d.slug}-${i}`}
              device={d}
              onPick={pick}
              dimmed={picked !== null && picked !== d.label}
            />
          ))}
          <Leads />
          <PowerLeads />
        </group>
      </Suspense>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        /* Aim at the middle of the frame rather than the world origin, which
           is the floor: without it the rack sits high and left in the shot. */
        target={[0, 0, 0]}
        minDistance={0.75}
        maxDistance={3.4}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.02}
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
