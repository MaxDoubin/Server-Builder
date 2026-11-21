/**
 * Soft shafts of light down the aisle, and the pools they leave on the floor.
 *
 * These are not lights. A real spotlight per fixture would add a shadow pass
 * each and the hall already has its lighting; these are two instanced meshes
 * (every cone in one draw call, every pool in another) with an additive
 * shader that fakes the look of a beam in slightly hazy air. No
 * postprocessing, no extra render targets.
 *
 * All motion is one uniform. The slow breathing of each beam is computed in
 * the fragment shader from uTime, so the per-frame JavaScript cost is two
 * number writes regardless of how many beams there are.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Beam geometry, in meters. The cabinets are 2.8 tall, so the source sits well above them. */
const BEAM_TOP = 7;
const BEAM_TOP_RADIUS = 0.2;
const BEAM_FLOOR_RADIUS = 1.5;
const POOL_RADIUS = 1.9;
/** Just above the floor tiles, so the pool never fights them for depth. */
const POOL_HEIGHT = 0.04;

const BEAM_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vToCamera;
  varying float vHeight;
  varying float vPhase;
  void main() {
    vec4 world = instanceMatrix * vec4(position, 1.0);
    vec4 view = modelViewMatrix * world;
    // Instances are only translated, so the instance matrix leaves normals alone.
    vNormal = normalMatrix * normal;
    vToCamera = -view.xyz;
    vHeight = uv.y;
    // A different phase per beam, from where it stands, so they do not breathe in step.
    vPhase = instanceMatrix[3].x * 0.37;
    gl_Position = projectionMatrix * view;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vToCamera;
  varying float vHeight;
  varying float vPhase;
  void main() {
    float dist = length(vToCamera);
    // Brightest where the cone faces the eye and nothing at its silhouette,
    // which is what a volume of lit haze does and a hard cone does not.
    float facing = abs(dot(normalize(vNormal), vToCamera / dist));
    float body = pow(smoothstep(0.0, 0.9, facing), 1.6);
    // Strong at the fixture, thinning toward the floor.
    float fall = pow(vHeight, 1.5) * smoothstep(1.0, 0.94, vHeight) + 0.06;
    // Fade out as the camera passes through the wall of the cone, and with
    // distance so far beams do not stack into a white band (the material
    // ignores scene fog, so this stands in for it).
    float nearFade = smoothstep(0.4, 2.4, dist);
    float farFade = 1.0 - smoothstep(34.0, 90.0, dist);
    // A slow breath, one cycle in about ten seconds, a tenth of the brightness.
    float breath = 0.9 + 0.1 * sin(uTime * 0.6 + vPhase);
    gl_FragColor = vec4(uColor, body * fall * nearFade * farFade * breath * uIntensity);
  }
`;

const POOL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying float vDistance;
  varying float vPhase;
  void main() {
    vec4 view = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vUv = uv;
    vDistance = length(view.xyz);
    vPhase = instanceMatrix[3].x * 0.37;
    gl_Position = projectionMatrix * view;
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  varying float vDistance;
  varying float vPhase;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float glow = pow(1.0 - smoothstep(0.0, 1.0, r), 2.0);
    float farFade = 1.0 - smoothstep(34.0, 90.0, vDistance);
    float breath = 0.9 + 0.1 * sin(uTime * 0.6 + vPhase);
    gl_FragColor = vec4(uColor, glow * farFade * breath * uIntensity * 0.55);
  }
`;

interface AisleLightShaftsProps {
  /** World z of the aisle center line. */
  z: number;
  startX: number;
  endX: number;
  /** How many beams; decided by device tier upstream. */
  count: number;
  /** Peak opacity. Lower in the day lighting mode, where additive light washes out. */
  intensity: number;
  /** Hold the beams still, for visitors who asked for reduced motion. */
  still: boolean;
}

export function AisleLightShafts({ z, startX, endX, count, intensity, still }: AisleLightShaftsProps) {
  const beamsRef = useRef<THREE.InstancedMesh>(null);
  const poolsRef = useRef<THREE.InstancedMesh>(null);

  const assets = useMemo(() => {
    // Shared between both materials, so one write animates everything.
    const uTime = { value: 0 };
    const uIntensity = { value: 0 };
    const uColor = { value: new THREE.Color("#a9d8ff") };
    const common = {
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    };
    const beamGeometry = new THREE.CylinderGeometry(
      BEAM_TOP_RADIUS,
      BEAM_FLOOR_RADIUS,
      BEAM_TOP,
      24,
      1,
      true,
    );
    const poolGeometry = new THREE.CircleGeometry(POOL_RADIUS, 32);
    poolGeometry.rotateX(-Math.PI / 2);
    return {
      uTime,
      uIntensity,
      beamGeometry,
      poolGeometry,
      beamMaterial: new THREE.ShaderMaterial({
        ...common,
        uniforms: { uTime, uIntensity, uColor },
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
      }),
      poolMaterial: new THREE.ShaderMaterial({
        ...common,
        uniforms: { uTime, uIntensity, uColor },
        vertexShader: POOL_VERTEX,
        fragmentShader: POOL_FRAGMENT,
      }),
    };
  }, []);

  // React never owned these, so they are released by hand on unmount.
  useEffect(
    () => () => {
      assets.beamGeometry.dispose();
      assets.poolGeometry.dispose();
      assets.beamMaterial.dispose();
      assets.poolMaterial.dispose();
    },
    [assets],
  );

  // Stand the instances along the aisle. Runs when the aisle moves, never per frame.
  useLayoutEffect(() => {
    const beams = beamsRef.current;
    const pools = poolsRef.current;
    if (!beams || !pools) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const x = startX + ((i + 0.5) / count) * (endX - startX);
      matrix.makeTranslation(x, BEAM_TOP / 2 + POOL_HEIGHT, z);
      beams.setMatrixAt(i, matrix);
      matrix.makeTranslation(x, POOL_HEIGHT, z);
      pools.setMatrixAt(i, matrix);
    }
    beams.instanceMatrix.needsUpdate = true;
    pools.instanceMatrix.needsUpdate = true;
  }, [count, endX, startX, z]);

  useFrame((_, delta) => {
    if (still) {
      assets.uIntensity.value = intensity;
      return;
    }
    assets.uTime.value += Math.min(delta, 0.1);
    // Ease the beams up over about a second and a half rather than switching them on.
    assets.uIntensity.value +=
      (intensity - assets.uIntensity.value) * (1 - Math.exp(-Math.min(delta, 0.1) * 1.6));
  });

  /*
    frustumCulled is off because an instanced mesh is culled by the bounds of
    its one source geometry at the origin, which would drop the whole row of
    beams whenever the origin left the view.
  */
  return (
    <group>
      <instancedMesh
        ref={beamsRef}
        args={[assets.beamGeometry, assets.beamMaterial, count]}
        frustumCulled={false}
        renderOrder={2}
      />
      <instancedMesh
        ref={poolsRef}
        args={[assets.poolGeometry, assets.poolMaterial, count]}
        frustumCulled={false}
        renderOrder={1}
      />
    </group>
  );
}
