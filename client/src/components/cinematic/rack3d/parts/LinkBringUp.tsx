import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { InstancedBoxes } from "./InstancedBoxes";
import {
  DARK_SECONDS,
  IDLE_SECONDS,
  NEGOTIATE_SECONDS,
  ORIGIN_PLUG_LEAD,
  SEAT_SECONDS,
  WAVE,
  buildLinkBringUpLayout,
} from "./linkBringUpLayout";
import { buildSpriteGeometry, createSpriteMaterial } from "./linkSprites";
import { ACCENT_HEX } from "../rackConfig";
import type { DeviceTier } from "@/lib/motion/useDeviceTier";

/**
 * "Link coming up": the rack gets patched and its ports come alive.
 *
 * Cables are laid along the same paths `Cables` draws, each one is finished
 * into a real port with a plug that seats, and the port's LED then walks
 * through a link bring-up: dark while the cable is in but the link is down,
 * amber while the two ends negotiate, solid green once the link is up, and
 * a slow green blink once traffic flows. The cable shows the same story:
 * pulses run along it both ways while the ends train, and once the link is
 * up it glows end to end. `HallLinkWave` then repeats this across the hall.
 *
 * What is and is not literal here. The order (no link, negotiation, link,
 * activity) is how an Ethernet port comes up: on twisted pair the two ends
 * trade ability pages before either declares link (IEEE 802.3 Clause 28;
 * Clause 37 is the 1000BASE-X counterpart). The colors are a convention,
 * not a standard: 802.3 does not define front-panel LEDs, most ports simply
 * stay dark until link, and vendors assign amber differently (lower speed,
 * a fault, or a port that has link but is not forwarding yet). The caption
 * says so rather than implying one universal code. Real activity LEDs also
 * flicker far faster than this; the blink is held under 2 Hz on purpose.
 */

/** The one switch. Set to false to remove the sequence from the rack. */
export const LINK_BRINGUP_ENABLED = true;

/** Scroll position (0..1 of the systems act) where the sequence plays. */
/**
 * Scroll position (0..1 of the systems act) where the sequence plays. The
 * act's headline sits across the switches until it fades between 0.80 and
 * 0.86, so the sequence waits for it: the first port lights about two
 * seconds after this, on a clear rack.
 */
const PLAY_FROM = 0.83;
/** Scrolling back above this rewinds it, so coming back replays it. */
const REWIND_BELOW = 0.76;
/**
 * The hall beat brings its own copy in at 0.90. On a phone that copy and
 * the caption share the bottom of the screen, so the caption leaves first;
 * on a desktop it sits clear at the side and can stay a little longer.
 */
const CAPTION_OUT_MOBILE: [number, number] = [0.875, 0.9];
const CAPTION_OUT_DESKTOP: [number, number] = [0.9, 0.93];
/**
 * Scroll also pushes the sequence along: across this range the scroll
 * position sets a floor under the timeline that reaches its end, so a
 * visitor who never stops still sees every port come up, and the hall wave
 * (which sets off around 0.93) always leaves from a rack that is lit. The
 * clock runs on top, so stopping anywhere lets it finish by itself.
 */
const SCRUB: [number, number] = [PLAY_FROM, 0.93];

const LED_OFF = "#07090b";

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const TUBE_VERTEX = /* glsl */ `
  attribute float aU;
  attribute vec3 aRun;
  attribute vec3 aColor;
  varying float vU;
  varying vec3 vRun;
  varying vec3 vColor;
  varying vec3 vNormal;
  void main() {
    vU = aU;
    vRun = aRun;
    vColor = aColor;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TUBE_FRAGMENT = /* glsl */ `
  uniform float uT;
  uniform float uClock;
  uniform float uBlink;
  uniform vec3 uTimes;
  uniform vec3 uHead;
  uniform vec3 uAmber;
  uniform vec3 uGreen;
  varying float vU;
  varying vec3 vRun;
  varying vec3 vColor;
  varying vec3 vNormal;
  void main() {
    float x = clamp((uT - vRun.x) / vRun.y, 0.0, 1.0);
    float laid = x * x * (3.0 - 2.0 * x);
    // Nothing exists past the head: this is what draws the cable on.
    if (vU >= laid) discard;
    // Meters behind the moving head, so the hot tip is the same physical
    // length on a short jumper and a two meter rack cable.
    float behind = (laid - vU) * vRun.z;
    float settle = clamp((uT - vRun.x - vRun.y) / 0.7, 0.0, 1.0);
    float head = exp(-behind / 0.035) * (1.0 - settle);
    float light = 0.42 + 0.58 * max(dot(normalize(vNormal), normalize(vec3(0.35, 0.5, 0.8))), 0.0);
    vec3 col = vColor * light * (1.0 + 0.6 * (1.0 - settle)) + uHead * head * 1.6;

    // The link this cable carries. uTimes.x is the wait from the cable's
    // arrival to the first amber, uTimes.y the time spent training.
    float tau = uT - vRun.x - vRun.y - uTimes.x;
    float training = smoothstep(0.0, 0.15, tau);
    float up = smoothstep(uTimes.y, uTimes.y + 0.3, tau);
    float m = vU * vRun.z;
    // Dots travel, so no point of the cable is switched on and off: a
    // 5 cm train at 6 cm a second passes any one point about once a second.
    float a = 0.5 + 0.5 * sin(6.2832 * (m / 0.05 - tau * 1.2));
    float b = 0.5 + 0.5 * sin(6.2832 * (m / 0.05 + tau * 1.2));
    float pulses = pow(a, 6.0) + pow(b, 6.0);
    float flow = 0.5 + 0.5 * sin(6.2832 * (m / 0.16 - uClock * 0.5 + vRun.x));
    float traffic = uBlink * pow(flow, 8.0);
    col += uAmber * training * (1.0 - up) * (0.1 + 0.75 * pulses);
    // Up: the jacket takes a steady glow from end to end.
    col = mix(col, col * 0.55 + uGreen * 0.5, up) + uGreen * up * traffic * 0.7;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** When the cable reaches the port an instance sits at. See WAVE. */
const ARRIVAL_GLSL = /* glsl */ `
  uniform float uT;
  uniform vec4 uWave;
  uniform float uWaveX;
  float arrival(vec3 at) {
    return uWave.x + (at.y - uWave.y) * uWave.z + (at.x - uWave.w) * uWaveX;
  }
`;

const PLUG_VERTEX = /* glsl */ `
  ${ARRIVAL_GLSL}
  uniform float uSeat;
  varying vec3 vNormal;
  void main() {
    vec3 at = instanceMatrix[3].xyz;
    float s = (uT - arrival(at)) / uSeat;
    float k = clamp(s, 0.0, 1.0) - 1.0;
    // Ease out with a little overshoot: pushed home, then it springs back
    // against the latch.
    float seated = 1.0 + 2.2 * k * k * k + 1.2 * k * k;
    vec4 p = instanceMatrix * vec4(position, 1.0);
    p.z += (1.0 - seated) * 0.012;
    vNormal = normalize(normalMatrix * normal);
    // Not plugged in yet: park the vertex outside the clip volume.
    gl_Position = s <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * p;
  }
`;

const PLUG_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormal;
  void main() {
    float light = 0.4 + 0.6 * max(dot(normalize(vNormal), normalize(vec3(0.35, 0.5, 0.8))), 0.0);
    gl_FragColor = vec4(uColor * light, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * The LED's color as a pure function of time since its plug seated. The
 * halo over it (linkSprites) runs the same curve with the same phase, so
 * body and glow dip together.
 */
const LED_GLSL = /* glsl */ `
  ${ARRIVAL_GLSL}
  uniform float uSeat;
  uniform vec3 uTimes;
  uniform float uClock;
  uniform float uBlink;
  uniform vec3 uOff;
  uniform vec3 uAmber;
  uniform vec3 uGreen;
  vec3 ledColor(vec3 at) {
    float t = uT - arrival(at) - uSeat;
    float lit = smoothstep(uTimes.x, uTimes.x + 0.12, t);
    float up = smoothstep(uTimes.x + uTimes.y, uTimes.x + uTimes.y + 0.18, t);
    float busy = uBlink * smoothstep(0.0, 0.2, t - uTimes.x - uTimes.y - uTimes.z);
    float phase = fract(sin(dot(at.xy, vec2(127.1, 311.7))) * 43758.5453);
    // Two slow sines multiplied: irregular like traffic, yet it changes
    // sign about three times a second, so at most 1.5 dips a second.
    float wave = sin(6.2832 * (1.2 * uClock + phase)) * sin(6.2832 * (0.31 * uClock + phase * 1.7));
    float level = mix(1.0, mix(0.38, 1.0, smoothstep(-0.25, 0.25, wave)), busy);
    return mix(uOff, mix(uAmber, uGreen, up) * level, lit);
  }
`;

const LED_VERTEX = /* glsl */ `
  ${LED_GLSL}
  varying vec3 vColor;
  void main() {
    vColor = ledColor(instanceMatrix[3].xyz);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const LED_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/* Caption                                                             */
/* ------------------------------------------------------------------ */

const LEGEND: Array<{ color: string; glow: boolean; text: string }> = [
  { color: "#20262c", glow: false, text: "Dark · plugged in, no link" },
  { color: ACCENT_HEX.amber, glow: true, text: "Amber · negotiating" },
  { color: ACCENT_HEX.signal, glow: true, text: "Green · link up, blinks with traffic" },
];

// Inline rather than utility classes: this file is in the lazy scene chunk,
// and new classes would add to the stylesheet every page loads.
const LEGEND_PLACE_DESKTOP: CSSProperties = { right: "3rem", top: "46%" };
const LEGEND_PLACE_MOBILE: CSSProperties = { left: "50%", bottom: "9vh", transform: "translateX(-50%)" };

/**
 * A small key for the three LED states, pinned to the canvas rather than
 * to a point in the scene so it holds still while the camera moves.
 * Decorative, like the exploded-view captions: aria-hidden throughout.
 */
function Legend({ innerRef, mobile }: { innerRef: RefObject<HTMLDivElement>; mobile: boolean }) {
  const size = useThree((s) => s.size);
  // drei centers a fullscreen Html on whatever this returns, so the middle
  // of the canvas makes it cover the canvas exactly.
  const center = useMemo(
    () => () => [size.width / 2, size.height / 2] as [number, number],
    [size.width, size.height],
  );
  return (
    <Html fullscreen calculatePosition={center} style={{ pointerEvents: "none" }}>
      <div
        aria-hidden
        ref={innerRef}
        style={{
          ...(mobile ? LEGEND_PLACE_MOBILE : LEGEND_PLACE_DESKTOP),
          position: "absolute",
          width: "max-content",
          maxWidth: "88vw",
          opacity: 0,
          padding: "10px 14px",
          fontFamily: "'Space Grotesk', monospace",
          fontSize: "0.625rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "hsl(40 16% 92%)",
          background: "hsl(220 40% 4% / 0.78)",
          border: "1px solid hsl(72 100% 50% / 0.22)",
          borderRadius: "2px",
        }}
      >
        <div style={{ color: "hsl(72 100% 50%)", fontWeight: 600, marginBottom: "8px" }}>
          Link coming up
        </div>
        {LEGEND.map((row) => (
          <div key={row.text} style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "5px" }}>
            <span
              style={{
                width: "7px",
                height: "7px",
                flex: "none",
                background: row.color,
                boxShadow: row.glow ? `0 0 8px ${row.color}` : "inset 0 0 0 1px hsl(40 8% 40%)",
              }}
            />
            <span>{row.text}</span>
          </div>
        ))}
        <div style={{ marginTop: "8px", color: "hsl(40 8% 72%)" }}>
          Illustrative · LED colors vary by vendor, and most ports stay dark until link
        </div>
      </div>
    </Html>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function LinkBringUp({
  progressRef,
  tier,
  mobile,
  reducedMotion,
}: {
  progressRef: { current: number };
  tier: DeviceTier;
  mobile: boolean;
  reducedMotion: boolean;
}) {
  const layout = useMemo(() => buildLinkBringUpLayout(tier), [tier]);

  // The whole sequence hangs off this one number: seconds into the
  // timeline. Every shader reads it through the shared `uT` uniform.
  const timeline = useRef({ t: 0, clock: 0, playing: false, caption: -1 });
  const legendRef = useRef<HTMLDivElement>(null);

  const materials = useMemo(() => {
    // One object per uniform, shared by every material that uses it, so a
    // single write per frame reaches all five draw calls.
    const uT = { value: 0 };
    const uClock = { value: 0 };
    const uBlink = { value: 1 };
    const wave = {
      uT,
      uWave: { value: new THREE.Vector4(WAVE.base, WAVE.y0, WAVE.perMeterY, WAVE.x0) },
      uWaveX: { value: WAVE.perMeterX },
      uSeat: { value: SEAT_SECONDS },
    };
    const led = {
      ...wave,
      uTimes: { value: new THREE.Vector3(DARK_SECONDS, NEGOTIATE_SECONDS, IDLE_SECONDS) },
      uClock,
      uBlink,
      uOff: { value: new THREE.Color(LED_OFF) },
      uAmber: { value: new THREE.Color(ACCENT_HEX.amber) },
      uGreen: { value: new THREE.Color(ACCENT_HEX.signal) },
    };
    const plugColor = { value: new THREE.Color("#8f9aa3") };
    const originWave = wave.uWave.value.clone();
    originWave.x -= ORIGIN_PLUG_LEAD;

    return {
      uT,
      uClock,
      uBlink,
      tubes: new THREE.ShaderMaterial({
        uniforms: {
          uT,
          uClock,
          uBlink,
          uTimes: { value: new THREE.Vector3(SEAT_SECONDS + DARK_SECONDS, NEGOTIATE_SECONDS, 0) },
          uHead: { value: new THREE.Color("#eaffb0") },
          uAmber: led.uAmber,
          uGreen: led.uGreen,
        },
        vertexShader: TUBE_VERTEX,
        fragmentShader: TUBE_FRAGMENT,
      }),
      plugs: new THREE.ShaderMaterial({
        uniforms: { ...wave, uColor: plugColor },
        vertexShader: PLUG_VERTEX,
        fragmentShader: PLUG_FRAGMENT,
      }),
      // The far end of each jumper is pushed in before the jumper is laid.
      originPlugs: new THREE.ShaderMaterial({
        uniforms: { ...wave, uWave: { value: originWave }, uColor: plugColor },
        vertexShader: PLUG_VERTEX,
        fragmentShader: PLUG_FRAGMENT,
      }),
      leds: new THREE.ShaderMaterial({
        uniforms: led,
        vertexShader: LED_VERTEX,
        fragmentShader: LED_FRAGMENT,
      }),
      // Same clock, different shader family: fed by hand each frame.
      sprites: createSpriteMaterial({
        negotiate: NEGOTIATE_SECONDS,
        idle: IDLE_SECONDS,
        // A phone shows the rack a third the width a desktop does.
        ledScale: mobile ? 1.5 : 1,
      }),
    };
  }, [mobile]);

  useEffect(() => {
    const { tubes, plugs, originPlugs, leds, sprites } = materials;
    return () => [tubes, plugs, originPlugs, leds, sprites].forEach((m) => m.dispose());
  }, [materials]);
  useEffect(() => () => layout.tubes.dispose(), [layout]);
  const spriteGeometry = useMemo(() => buildSpriteGeometry(layout.sprites), [layout]);
  useEffect(() => () => spriteGeometry.dispose(), [spriteGeometry]);

  // Reduced motion gets the finished state as a still: everything patched,
  // every link up, nothing blinking. (The home page serves its static
  // fallback before this scene loads at all; this covers any other caller.)
  useEffect(() => {
    materials.uBlink.value = reducedMotion ? 0 : 1;
    materials.sprites.uniforms.uBlink.value = materials.uBlink.value;
    if (reducedMotion) {
      materials.uT.value = layout.endSeconds;
      materials.sprites.uniforms.uT.value = layout.endSeconds;
    }
  }, [reducedMotion, materials, layout]);

  const captionOut = mobile ? CAPTION_OUT_MOBILE : CAPTION_OUT_DESKTOP;
  // Port LEDs are drawn larger than life (a real one is about 2 mm) so the
  // three states can be told apart from across the room and on a phone.
  const ledSize: [number, number, number] = mobile ? [0.0115, 0.0052, 0.0016] : [0.0098, 0.0042, 0.0016];

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const s = timeline.current;
    const p = progressRef.current ?? 0;
    const dt = Math.min(delta, 0.1);

    if (p >= PLAY_FROM) s.playing = true;
    else if (p < REWIND_BELOW) s.playing = false;

    // Rewinding runs the same timeline backward, quickly: the cables pull
    // back out instead of popping away, and the next visit starts clean.
    s.t = s.playing
      ? Math.min(layout.endSeconds, s.t + dt)
      : p < REWIND_BELOW
        ? Math.max(0, s.t - dt * 4)
        : s.t;
    if (s.playing) {
      const scrub = Math.max(0, Math.min(1, (p - SCRUB[0]) / (SCRUB[1] - SCRUB[0])));
      s.t = Math.max(s.t, scrub * layout.endSeconds);
    }
    // 100 s is a whole number of cycles of both blink sines, so the wrap
    // is seamless and the float never loses precision.
    s.clock = (s.clock + dt) % 100;
    materials.uT.value = s.t;
    materials.uClock.value = s.clock;
    materials.sprites.uniforms.uT.value = s.t;
    materials.sprites.uniforms.uClock.value = s.clock;

    // Touch the DOM only when the rounded value actually changes.
    const caption =
      Math.round(smooth(0.4, 1.2, s.t) * (1 - smooth(captionOut[0], captionOut[1], p)) * 50) / 50;
    if (caption !== s.caption && legendRef.current) {
      s.caption = caption;
      legendRef.current.style.opacity = String(caption);
    }
  });

  return (
    <group>
      <mesh geometry={layout.tubes} material={materials.tubes} />
      <InstancedBoxes positions={layout.plugs} size={[0.0075, 0.0055, 0.012]} material={materials.plugs} />
      <InstancedBoxes
        positions={layout.originPlugs}
        size={[0.0075, 0.0055, 0.012]}
        material={materials.originPlugs}
      />
      <InstancedBoxes positions={layout.leds} size={ledSize} material={materials.leds} />
      <mesh geometry={spriteGeometry} material={materials.sprites} frustumCulled={false} renderOrder={2} />
      {!reducedMotion && <Legend innerRef={legendRef} mobile={mobile} />}
    </group>
  );
}
