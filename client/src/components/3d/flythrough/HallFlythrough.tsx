/**
 * The hall flythrough: a camera rig that lives inside the Canvas.
 *
 * It takes the camera while it is mounted (DatacenterScene unmounts the
 * orbit controls for any non-orbit camera mode, this one included) and gives
 * it back unchanged apart from where it is standing: field of view, fog and
 * the render loop are all restored on unmount.
 *
 * Everything the camera does is a function of one number, the playhead in
 * seconds. Position comes from a Catmull-Rom spline by arc length, the look
 * target from a second spline, roll from how hard the path is turning, and
 * field of view and fog from how far inside the aisle it is. That is what
 * makes pause, scrub and replay exact rather than approximately right.
 *
 * The frame callback allocates nothing: the scratch vectors are refs, the
 * splines write into targets they are handed, and the arc length table is
 * built once with the path.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useDeviceTier } from "@/lib/motion/useDeviceTier";
import { AisleLightShafts } from "./AisleLightShafts";
import {
  aisleWeight,
  buildFlythroughPath,
  easeFlight,
  findAisle,
  type GridCell,
} from "./hallFlythroughPath";
import {
  FLYTHROUGH_STEPS,
  type FlythroughTransport,
} from "./useHallFlythrough";

/** Longest step the playhead takes in one frame, so a stall does not become a jump cut. */
const MAX_FRAME_STEP = 1 / 15;

/** How far ahead on the path, as a fraction of it, the rig samples to measure the turn. */
const TURN_SAMPLE = 0.02;
/** Bank into turns: radians of roll per unit of turn, capped at about four degrees. */
const ROLL_GAIN = 0.2;
const MAX_ROLL = 0.07;

/** Degrees the lens widens inside the aisle, which is what gives the dolly its sense of speed. */
const AISLE_FOV_GAIN = 9;
/** Fog pulled in while in the aisle, so its far end falls away into depth. */
const AISLE_FOG_NEAR = 6;
const AISLE_FOG_FAR = 78;

/** One beam about every two cabinets, up to a cap that depends on the device. */
const BEAM_SPACING = 5.6;
const BEAM_CAP = { high: 12, mid: 6, low: 0 } as const;

interface HallFlythroughProps {
  /** Grid positions of the cabinets on the floor right now. */
  cells: readonly GridCell[];
  playing: boolean;
  /** Reduced motion: hold one establishing frame and move nothing. */
  still: boolean;
  /** Changes on every fresh start; the rig rewinds when it does. */
  runId: number;
  transport: FlythroughTransport;
  onEnd: () => void;
  /** Whether atmospheric extras are allowed at all (off in the low effects profiles). */
  effects: boolean;
  /** The day lighting mode, where additive light has to be turned well down. */
  daylight: boolean;
}

export function HallFlythrough({
  cells,
  playing,
  still,
  runId,
  transport,
  onEnd,
  effects,
  daylight,
}: HallFlythroughProps) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const setFrameloop = useThree((state) => state.setFrameloop);
  const { tier } = useDeviceTier();

  /*
    The racks array is a new object whenever anything on the floor ticks, so
    the path is keyed on the three numbers that define the aisle rather than
    on the array. The scan is one pass over the cabinets and only runs when
    React renders this component, never in the frame loop.
  */
  const aisle = findAisle(cells);
  const { z, startX, endX, flanked } = aisle;
  const path = useMemo(
    () => buildFlythroughPath({ z, startX, endX, flanked }),
    [z, startX, endX, flanked],
  );

  const time = useRef(0);
  const endReported = useRef(false);
  const lastStep = useRef(-1);
  const look = useRef(new THREE.Vector3());
  const ahead = useRef(new THREE.Vector3());
  const further = useRef(new THREE.Vector3());

  useEffect(() => {
    time.current = 0;
    endReported.current = false;
  }, [runId]);

  /*
    Borrow the lens and the fog; hand both back exactly as they were. A
    layout effect so the base values are recorded before the first frame
    callback can run and start changing them.
  */
  const base = useRef({ fov: 50, fogNear: 0, fogFar: 0 });
  useLayoutEffect(() => {
    const lens = camera instanceof THREE.PerspectiveCamera ? camera : null;
    const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
    base.current = {
      fov: lens?.fov ?? 50,
      fogNear: fog?.near ?? 0,
      fogFar: fog?.far ?? 0,
    };
    const saved = base.current;
    return () => {
      if (lens) {
        lens.fov = saved.fov;
        lens.updateProjectionMatrix();
      }
      if (fog) {
        fog.near = saved.fogNear;
        fog.far = saved.fogFar;
      }
    };
  }, [camera, scene]);

  /*
    Stop rendering when nobody can see the canvas: scrolled out of view, or
    the tab in the background. The scene normally renders every frame, so
    this is switched off for the duration and put back on unmount.
  */
  const visible = useRef(true);
  useEffect(() => {
    let onScreen = true;
    const apply = () => {
      visible.current = onScreen && !document.hidden;
      setFrameloop(visible.current ? "always" : "never");
    };
    const observer = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      apply();
    });
    observer.observe(gl.domElement);
    document.addEventListener("visibilitychange", apply);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
      setFrameloop("always");
    };
  }, [gl, setFrameloop]);
  // The Canvas reasserts its own frame loop setting whenever it re-renders,
  // which would quietly restart a loop that was paused for being offscreen.
  useEffect(() => {
    if (!visible.current) setFrameloop("never");
  });

  useFrame((_, delta) => {
    const { duration } = path;

    if (transport.seekTo !== null) {
      time.current = transport.seekTo * duration;
      transport.seekTo = null;
    } else if (playing && !still) {
      time.current += Math.min(delta, MAX_FRAME_STEP);
    }
    if (time.current >= duration) {
      time.current = duration;
      if (playing && !endReported.current) {
        endReported.current = true;
        onEnd();
      }
    } else {
      endReported.current = false;
    }

    const linear = time.current / duration;
    const u = still ? path.stillAt : easeFlight(linear);

    // Position by arc length, so the eased value is distance and speed is even.
    path.position.getPointAt(u, camera.position);
    // The target spline has the same waypoint count, so the spline parameter
    // (not the arc length) is what lines a camera position up with its target.
    // The second argument is an absolute distance that overrides u; zero means "use u".
    path.target.getPoint(path.position.getUtoTmapping(u, 0), look.current);
    camera.lookAt(look.current);

    /*
      Bank into the turn. Two short steps ahead on the path give two headings;
      the vertical part of their cross product is the sine of the angle
      between them, positive for a left turn. The steps are long (two percent
      of the path each) because a Catmull-Rom spline is continuous in
      direction but not in curvature at a waypoint, and a long baseline
      spreads that jump out without any smoothing over time.
    */
    let turn = 0;
    if (!still) {
      path.position.getPointAt(Math.min(1, u + TURN_SAMPLE), ahead.current);
      path.position.getPointAt(
        Math.min(1, u + TURN_SAMPLE * 2),
        further.current,
      );
      const ax = ahead.current.x - camera.position.x;
      const az = ahead.current.z - camera.position.z;
      const bx = further.current.x - ahead.current.x;
      const bz = further.current.z - ahead.current.z;
      const scale = Math.hypot(ax, az) * Math.hypot(bx, bz);
      if (scale > 1e-6) turn = (az * bx - ax * bz) / scale;
    }
    // Straight from the playhead, with no memory of earlier frames, so a held
    // frame holds and the same playhead always gives the same horizon.
    camera.rotateZ(
      THREE.MathUtils.clamp(turn * ROLL_GAIN, -MAX_ROLL, MAX_ROLL),
    );

    const inside = still ? 0 : aisleWeight(path, u);
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = base.current.fov + AISLE_FOV_GAIN * inside;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = THREE.MathUtils.lerp(
        base.current.fogNear,
        AISLE_FOG_NEAR,
        inside,
      );
      scene.fog.far = THREE.MathUtils.lerp(
        base.current.fogFar,
        AISLE_FOG_FAR,
        inside,
      );
    }

    // Move the scrub thumb, but only when it would land on a different step.
    const step = Math.round(linear * FLYTHROUGH_STEPS);
    if (transport.slider && step !== lastStep.current) {
      lastStep.current = step;
      transport.slider.valueAsNumber = step;
    }
  });

  // The beams are instanced, which WebGL 1 only has as an extension: skip them there.
  const beamCount =
    effects && gl.capabilities.isWebGL2
      ? Math.min(
          BEAM_CAP[tier],
          Math.max(2, Math.round((endX - startX) / BEAM_SPACING)),
        )
      : 0;

  if (beamCount === 0) return null;
  return (
    <AisleLightShafts
      z={z}
      startX={startX}
      endX={endX}
      count={beamCount}
      intensity={daylight ? 0.12 : 0.34}
      still={still}
      playhead={time}
    />
  );
}
