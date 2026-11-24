/**
 * State for the hall flythrough, shared by the page, the scene and the
 * on-screen controls.
 *
 * THE SWITCH. Set HALL_FLYTHROUGH_ENABLED to false and the "Cinematic" button
 * disappears from the control dock; nothing else on the page changes, and the
 * camera rig, the light shafts and the controls are never mounted.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

export const HALL_FLYTHROUGH_ENABLED = true;

/** Resolution of the scrub slider: the run is divided into this many steps. */
export const FLYTHROUGH_STEPS = 400;

/**
 * The channel between the rig inside the Canvas and the DOM controls.
 *
 * A plain mutable object rather than React state on purpose. The rig writes
 * the playhead sixty times a second and the slider reads it; routing that
 * through setState would re-render the page every frame. The rig writes
 * straight to the slider element instead, and the slider leaves a seek
 * request here for the rig to pick up on its next frame.
 */
export interface FlythroughTransport {
  /** Fraction of the run, 0 to 1, the visitor dragged the slider to; null when none is pending. */
  seekTo: number | null;
  /** The scrub slider, so the rig can move its thumb without a render. */
  slider: HTMLInputElement | null;
}

export interface HallFlythroughState {
  /** The flythrough owns the camera. */
  active: boolean;
  playing: boolean;
  /** The run reached its closing frame and is holding there. */
  ended: boolean;
  /** Bumped on every fresh start so the rig rewinds. */
  runId: number;
  transport: FlythroughTransport;
  /** Goes on the button that starts it, so focus can return there afterwards. */
  triggerRef: RefObject<HTMLButtonElement>;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  /** Called by the rig when the playhead reaches the end. */
  handleEnd: () => void;
  /** Called by the slider: a drag away from the end clears the ended state. */
  handleSeek: (fraction: number) => void;
}

export function useHallFlythrough(): HallFlythroughState {
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [runId, setRunId] = useState(0);
  const transportRef = useRef<FlythroughTransport>({
    seekTo: null,
    slider: null,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(false);

  const start = useCallback(() => {
    transportRef.current.seekTo = null;
    setRunId((id) => id + 1);
    setEnded(false);
    setPlaying(true);
    setActive(true);
  }, []);

  const stop = useCallback(() => {
    setActive(false);
    setPlaying(false);
    setEnded(false);
  }, []);

  const toggle = useCallback(() => {
    if (ended) {
      // Play on the closing frame means play it again.
      setRunId((id) => id + 1);
      setEnded(false);
      setPlaying(true);
      return;
    }
    setPlaying((value) => !value);
  }, [ended]);

  const handleEnd = useCallback(() => {
    setPlaying(false);
    setEnded(true);
  }, []);

  const handleSeek = useCallback((fraction: number) => {
    transportRef.current.seekTo = fraction;
    if (fraction < 1) setEnded(false);
  }, []);

  /*
    The dock is unmounted while the flythrough runs, so the button that
    started it does not exist to hold focus. When the run stops the dock is
    back in the same commit; put focus on the button again so a keyboard
    user lands where they left off rather than at the top of the document.
  */
  useEffect(() => {
    if (wasActive.current && !active) triggerRef.current?.focus();
    wasActive.current = active;
  }, [active]);

  return useMemo(
    () => ({
      active,
      playing,
      ended,
      runId,
      transport: transportRef.current,
      triggerRef,
      start,
      stop,
      toggle,
      handleEnd,
      handleSeek,
    }),
    [active, ended, handleEnd, handleSeek, playing, runId, start, stop, toggle],
  );
}
