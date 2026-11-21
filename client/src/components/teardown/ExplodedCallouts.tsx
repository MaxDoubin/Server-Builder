/**
 * The drafting on the exploded view: center lines, leaders and part names.
 *
 * Two draw calls for the whole layer, however many parts there are. One is
 * every line (a dashed center line per part from where it sat to where it
 * is, plus a leader and a shelf for each name), the other is every name, as
 * quads cut from one small canvas texture.
 *
 * Nothing here is positioned from JavaScript. Each vertex carries its
 * part's home, its full travel and its wave, and the vertex shader works
 * out the rest from a single progress uniform: the same eased curve
 * teardownParts uses for the meshes, evaluated on the GPU, so a line can
 * never lag the part it points at. The frame callback writes three numbers
 * and allocates nothing.
 *
 * There is also no clock. Every line and label is a pure function of the
 * teardown's progress, so there is nothing to pause, nothing that blinks,
 * and under prefers-reduced-motion the layer is already a still drawing
 * that only changes when the reader moves the slider.
 *
 * Leaders are laid out in screen space rather than in the model. A label
 * has to stay a readable size and stay on the canvas whichever way the
 * model is turned, and both of those are statements about pixels. Each
 * leader runs outward from the middle of the machine as it appears on
 * screen, so names fan out around the model instead of stacking over it.
 */

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WAVE_SPAN, WAVE_STEP } from "./teardownParts";
import type { CalloutSeed } from "./explodedView";

/** Label cell in CSS pixels, and how much sharper than that it is drawn. */
const CELL_W = 250;
const CELL_H = 22;
const ATLAS_SCALE = 2;
const ATLAS_COLS = 2;
const LABEL_FONT = '600 11px "JetBrains Mono", ui-monospace, monospace';

/** The site's signal green and bone, as the rest of the page draws them. */
const SIGNAL = "#ccff00";
const BONE = "#ece9e2";

/*
  Shared by both programs: the wave curve, how far a callout has come in,
  and where its leader ends. `position` is the part's assembled center so
  three.js has something to count vertices by; it is never drawn there.
*/
const COMMON_VERTEX = /* glsl */ `
uniform float uProgress;
uniform float uSpan;
uniform float uStep;
uniform float uSelected;
uniform vec2 uResolution;
uniform vec3 uCenter;

attribute vec3 aTravel;
attribute vec4 aMeta; // wave, index, then two values that differ per program
attribute vec3 aLook; // leader length px, label width px, shown unprompted

// Must stay the same curve as waveProgress() in teardownParts.
float waveK(float wave) {
  float t = clamp((uProgress - wave * uStep) / uSpan, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float isSelected() {
  return step(abs(aMeta.y - uSelected), 0.5);
}

// 0 hidden, 1 fully drawn. A picked part is always shown, wherever it is.
float reveal(float k) {
  return max(isSelected(), aLook.z * smoothstep(0.35, 0.95, k));
}

// Picking one part pushes every other callout into the background.
float focus() {
  return uSelected < 0.0 ? 1.0 : mix(0.16, 1.0, isSelected());
}

vec2 toPx(vec4 clip) {
  return (clip.xy / clip.w * 0.5 + 0.5) * uResolution;
}

vec4 fromPx(vec2 px, vec4 clip) {
  return vec4((px / uResolution * 2.0 - 1.0) * clip.w, clip.z, clip.w);
}

// Where the leader starts and ends, and which way the label hangs off it.
void leader(vec4 anchorClip, out vec2 anchorPx, out vec2 endPx, out float side) {
  anchorPx = toPx(anchorClip);
  vec2 centerPx = toPx(projectionMatrix * modelViewMatrix * vec4(uCenter, 1.0));
  vec2 away = anchorPx - centerPx;
  // Dividing by at least 40px keeps the direction continuous as a part
  // crosses the middle of the screen, where a plain normalize would flip.
  away /= max(length(away), 40.0);
  // Lean every leader upward: names read better above their part.
  vec2 dir = normalize(away + vec2(0.0001, 0.55));
  side = clamp(dir.x * 4.0, -1.0, 1.0);
  float halfW = aLook.y * 0.5;
  vec2 mid = anchorPx + dir * aLook.x + vec2(side * halfW, 0.0);
  // Keep the whole label on the canvas.
  mid = clamp(mid, vec2(halfW + 6.0, 10.0), uResolution - vec2(halfW + 6.0, 30.0));
  endPx = mid - vec2(side * halfW, 0.0);
}
`;

const LINE_VERTEX = /* glsl */ `
${COMMON_VERTEX}
varying float vAlpha;
varying float vDash;
varying float vAccent;

void main() {
  float k = waveK(aMeta.x);
  float kind = aMeta.z; // 0 center line, 1 leader, 2 shelf under the label
  float along = aMeta.w;

  if (kind < 0.5) {
    // Center line: from where the part sat to where it is now.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + aTravel * (k * along), 1.0);
    vDash = along * k * length(aTravel);
    vAlpha = smoothstep(0.02, 0.25, k) * 0.5 * focus();
    vAccent = 0.0;
    return;
  }

  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position + aTravel * k, 1.0);
  vec2 anchorPx;
  vec2 endPx;
  float side;
  leader(clip, anchorPx, endPx, side);

  // The leader draws out of the part first, then the shelf runs along
  // under the name, so the eye is led from the part to the word.
  float r = reveal(k);
  vec2 px = kind < 1.5
    ? mix(anchorPx, endPx, along * smoothstep(0.0, 0.6, r))
    : endPx + vec2(side * aLook.y * along * smoothstep(0.5, 1.0, r), 0.0);

  gl_Position = fromPx(px, clip);
  vDash = -1.0;
  vAlpha = min(1.0, r * 6.0) * 0.9 * focus();
  vAccent = 1.0;
}
`;

const LINE_FRAGMENT = /* glsl */ `
uniform vec3 uLine;
uniform vec3 uAccent;
varying float vAlpha;
varying float vDash;
varying float vAccent;

void main() {
  // 12mm dash, 8mm gap, measured along the part's travel in model space,
  // so the dashes stay put on the line while the far end extends.
  if (vDash >= 0.0 && fract(vDash / 0.02) > 0.6) discard;
  gl_FragColor = vec4(mix(uLine, uAccent, vAccent), vAlpha);
  #include <colorspace_fragment>
}
`;

const LABEL_VERTEX = /* glsl */ `
${COMMON_VERTEX}
attribute vec4 aRect; // u0, v0, u1, v1 in the atlas
varying vec2 vUv;
varying float vAlpha;

void main() {
  float k = waveK(aMeta.x);
  vec2 corner = aMeta.zw; // -0.5..0.5 on each axis
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position + aTravel * k, 1.0);
  vec2 anchorPx;
  vec2 endPx;
  float side;
  leader(clip, anchorPx, endPx, side);

  vec2 size = vec2(aLook.y, ${CELL_H.toFixed(1)});
  vec2 mid = endPx + vec2(side * size.x * 0.5, size.y * 0.5 + 3.0);
  // Whole pixels, or the text shimmers as the model turns.
  vec2 px = floor(mid + 0.5) + corner * size;

  gl_Position = fromPx(px, clip);
  vUv = mix(aRect.xy, aRect.zw, corner + 0.5);
  vAlpha = smoothstep(0.55, 1.0, reveal(k)) * focus();
}
`;

const LABEL_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vAlpha;

void main() {
  vec4 texel = texture2D(uAtlas, vUv);
  gl_FragColor = vec4(texel.rgb, texel.a * vAlpha);
  #include <colorspace_fragment>
}
`;

/**
 * Paint every label into the atlas and report how wide each one came out.
 *
 * Called twice: once straight away with whatever monospace the browser has
 * to hand, and again when the site's own face has loaded, because the two
 * do not measure the same and a shelf sized for one is wrong for the other.
 */
function paintAtlas(canvas: HTMLCanvasElement, seeds: readonly CalloutSeed[]): number[] {
  const ctx = canvas.getContext("2d");
  if (!ctx) return seeds.map(() => CELL_W);
  ctx.setTransform(ATLAS_SCALE, 0, 0, ATLAS_SCALE, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = LABEL_FONT;
  ctx.textBaseline = "middle";

  return seeds.map((seed, i) => {
    const x = (i % ATLAS_COLS) * CELL_W;
    const y = Math.floor(i / ATLAS_COLS) * CELL_H;
    // The step number matches the "order of removal" list beside the canvas.
    const step = String(seed.wave + 1).padStart(2, "0");
    const name = seed.label.toUpperCase();
    const stepW = ctx.measureText(step + " ").width;
    const width = Math.min(CELL_W, Math.ceil(stepW + ctx.measureText(name).width) + 14);

    // A dark plate, because half of this machine is pale sheet metal and
    // pale text over it disappears.
    ctx.fillStyle = "rgba(8, 10, 13, 0.82)";
    ctx.fillRect(x, y + 1, width, CELL_H - 2);
    ctx.fillStyle = SIGNAL;
    ctx.fillText(step, x + 7, y + CELL_H / 2 + 0.5);
    ctx.fillStyle = BONE;
    ctx.fillText(name, x + 7 + stepW, y + CELL_H / 2 + 0.5);
    return width;
  });
}

/** The attributes both programs read, laid down `per` vertices at a time. */
function sharedAttributes(seeds: readonly CalloutSeed[], per: number) {
  const n = seeds.length * per;
  const home = new Float32Array(n * 3);
  const travel = new Float32Array(n * 3);
  seeds.forEach((s, i) => {
    for (let v = 0; v < per; v++) {
      s.home.toArray(home, (i * per + v) * 3);
      s.travel.toArray(travel, (i * per + v) * 3);
    }
  });
  return { home, travel, meta: new Float32Array(n * 4), look: new Float32Array(n * 3) };
}

/** Line vertices per part: 2 for the center line, 2 leader, 2 shelf. */
const LINE_VERTS = 6;
/** [kind, along] for each of those six. */
const LINE_LAYOUT = [0, 0, 0, 1, 1, 0, 1, 1, 2, 0, 2, 1];
/** Label quad corners, as two triangles' worth of indexed vertices. */
const QUAD = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];

export function ExplodedCallouts({
  seeds,
  center,
  progressRef,
  selected,
  isCalledOut,
}: {
  seeds: readonly CalloutSeed[];
  center: THREE.Vector3;
  progressRef: React.MutableRefObject<number>;
  selected: string | null;
  /** Whether a part is named without being picked. */
  isCalledOut: (label: string) => boolean;
}) {
  const layer = useMemo(() => {
    const rows = Math.ceil(seeds.length / ATLAS_COLS);
    const canvas = document.createElement("canvas");
    canvas.width = CELL_W * ATLAS_COLS * ATLAS_SCALE;
    canvas.height = Math.max(1, rows) * CELL_H * ATLAS_SCALE;
    const atlas = new THREE.CanvasTexture(canvas);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.generateMipmaps = false;
    atlas.minFilter = THREE.LinearFilter;

    const uniforms = {
      uProgress: { value: 0 },
      uSpan: { value: WAVE_SPAN },
      uStep: { value: WAVE_STEP },
      uSelected: { value: -1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCenter: { value: center },
      uLine: { value: new THREE.Color("#aeb8c8") },
      uAccent: { value: new THREE.Color(SIGNAL) },
      uAtlas: { value: atlas },
    };
    // Drawn over the model, never hidden by it: a leader that ducks behind
    // the part it names is no use to anyone.
    const overlay = { uniforms, transparent: true, depthTest: false, depthWrite: false };

    const line = sharedAttributes(seeds, LINE_VERTS);
    const quad = sharedAttributes(seeds, 4);
    const rect = new Float32Array(seeds.length * 16);
    const index: number[] = [];
    seeds.forEach((s, i) => {
      for (let v = 0; v < LINE_VERTS; v++) {
        line.meta.set([s.wave, i, LINE_LAYOUT[v * 2], LINE_LAYOUT[v * 2 + 1]], (i * LINE_VERTS + v) * 4);
      }
      for (let v = 0; v < 4; v++) {
        quad.meta.set([s.wave, i, QUAD[v * 2], QUAD[v * 2 + 1]], (i * 4 + v) * 4);
      }
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(line.home, 3));
    lineGeometry.setAttribute("aTravel", new THREE.BufferAttribute(line.travel, 3));
    lineGeometry.setAttribute("aMeta", new THREE.BufferAttribute(line.meta, 4));
    lineGeometry.setAttribute("aLook", new THREE.BufferAttribute(line.look, 3));

    const labelGeometry = new THREE.BufferGeometry();
    labelGeometry.setAttribute("position", new THREE.BufferAttribute(quad.home, 3));
    labelGeometry.setAttribute("aTravel", new THREE.BufferAttribute(quad.travel, 3));
    labelGeometry.setAttribute("aMeta", new THREE.BufferAttribute(quad.meta, 4));
    labelGeometry.setAttribute("aLook", new THREE.BufferAttribute(quad.look, 3));
    labelGeometry.setAttribute("aRect", new THREE.BufferAttribute(rect, 4));
    labelGeometry.setIndex(index);

    const lines = new THREE.LineSegments(
      lineGeometry,
      new THREE.ShaderMaterial({ ...overlay, vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT }),
    );
    const labels = new THREE.Mesh(
      labelGeometry,
      new THREE.ShaderMaterial({ ...overlay, vertexShader: LABEL_VERTEX, fragmentShader: LABEL_FRAGMENT }),
    );
    for (const object of [lines, labels]) {
      // The shader moves every vertex, so the bounds three.js would cull
      // by describe the assembled machine and nothing else.
      object.frustumCulled = false;
      object.renderOrder = 10;
      // A decoration should not swallow the clicks meant for the parts.
      object.raycast = () => {};
    }

    /** Repaint the names and resize every leader to fit them. */
    const layout = () => {
      const widths = paintAtlas(canvas, seeds);
      seeds.forEach((s, i) => {
        const shown = isCalledOut(s.label) ? 1 : 0;
        // Three leader lengths in rotation, so neighbors do not end level
        // with each other and print their names on top of one another.
        const reach = 44 + (i % 3) * 20;
        for (let v = 0; v < LINE_VERTS; v++) line.look.set([reach, widths[i], shown], (i * LINE_VERTS + v) * 3);
        const u0 = ((i % ATLAS_COLS) * CELL_W * ATLAS_SCALE) / canvas.width;
        const u1 = u0 + (widths[i] * ATLAS_SCALE) / canvas.width;
        // Canvas rows count down from the top, texture v counts up.
        const v1 = 1 - (Math.floor(i / ATLAS_COLS) * CELL_H * ATLAS_SCALE) / canvas.height;
        const v0 = v1 - (CELL_H * ATLAS_SCALE) / canvas.height;
        for (let v = 0; v < 4; v++) {
          quad.look.set([reach, widths[i], shown], (i * 4 + v) * 3);
          rect.set([u0, v0, u1, v1], (i * 4 + v) * 4);
        }
      });
      lineGeometry.attributes.aLook.needsUpdate = true;
      labelGeometry.attributes.aLook.needsUpdate = true;
      labelGeometry.attributes.aRect.needsUpdate = true;
      atlas.needsUpdate = true;
    };

    const dispose = () => {
      lineGeometry.dispose();
      labelGeometry.dispose();
      lines.material.dispose();
      labels.material.dispose();
      atlas.dispose();
    };

    return { lines, labels, uniforms, layout, dispose };
  }, [seeds, center, isCalledOut]);

  useEffect(() => {
    let live = true;
    layer.layout();
    // The page already uses this face for its text, so this waits for a
    // font the reader is downloading anyway rather than asking for one.
    document.fonts
      ?.load(LABEL_FONT)
      .then(() => {
        if (live) layer.layout();
      })
      .catch(() => {});
    return () => {
      live = false;
      layer.dispose();
    };
  }, [layer]);

  const selectedIndex = useMemo(
    () => (selected ? seeds.findIndex((s) => s.label === selected) : -1),
    [seeds, selected],
  );

  useFrame((state) => {
    layer.uniforms.uProgress.value = progressRef.current;
    layer.uniforms.uSelected.value = selectedIndex;
    layer.uniforms.uResolution.value.set(state.size.width, state.size.height);
  });

  return (
    <>
      <primitive object={layer.lines} />
      <primitive object={layer.labels} />
    </>
  );
}
