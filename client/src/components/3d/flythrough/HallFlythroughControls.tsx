/**
 * The on-screen controls for the hall flythrough: play and pause, a scrub
 * slider, skip, and the letterbox bars that frame it.
 *
 * Screen space chrome, outside the Canvas, like every other overlay on this
 * page. The keyboard contract is the one a video player has: Space plays and
 * pauses, Escape leaves. Focus moves to the first control when the
 * flythrough opens because the dock that held the button which started it is
 * hidden for the duration, and a keyboard user would otherwise be left
 * focused on nothing.
 *
 * For a visitor who asked for reduced motion there is nothing to play: the
 * scene holds one establishing frame, and this shows a line saying so and a
 * way out.
 */
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FLYTHROUGH_STEPS, type HallFlythroughState } from "./useHallFlythrough";

/** Space on these already means something; the shortcut must not also fire. */
const SPACE_OWNERS = "button, a, select, textarea, input:not([type='range']), [contenteditable='true']";

interface HallFlythroughControlsProps {
  flythrough: HallFlythroughState;
  /** Reduced motion: a still frame, so no transport controls. */
  still: boolean;
}

export function HallFlythroughControls({ flythrough, still }: HallFlythroughControlsProps) {
  const { playing, ended, transport, toggle, stop, handleSeek } = flythrough;
  const firstControl = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstControl.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target instanceof Element ? event.target : null;
      // An open dialog (the shortcut sheet) gets its own Escape first.
      if (target?.closest("[role='dialog']")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        stop();
        return;
      }
      if (event.key === " " && !still) {
        if (target?.closest(SPACE_OWNERS)) return;
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [still, stop, toggle]);

  const status = still
    ? "Still view of the hall. Motion is off because your system asks for reduced motion."
    : ended
      ? "Flythrough finished."
      : playing
        ? "Flythrough playing."
        : "Flythrough paused.";

  return (
    <div className="pointer-events-none absolute inset-0 z-[60]" data-ui="true">
      {/* Letterbox bars. Decoration only, and they slide in only if motion is welcome. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[8%] bg-black motion-safe:animate-in motion-safe:slide-in-from-top motion-safe:duration-700"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[8%] bg-black motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-700"
      />

      <div
        role="group"
        aria-label="Cinematic flythrough"
        className="pointer-events-auto absolute bottom-[calc(8%+0.75rem)] left-1/2 w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-cyan-500/30 bg-black/75 p-3 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[0.625rem] uppercase tracking-[0.3em] text-cyan-300/80">
              Hall flythrough
            </div>
            <p className="text-xs text-white/70" role="status" aria-live="polite">
              {status}
            </p>
          </div>
          <div className="flex gap-2">
            {!still && (
              <Button
                ref={firstControl}
                size="sm"
                variant="secondary"
                onClick={toggle}
                className="bg-white/10 text-white hover:bg-white/20"
              >
                {ended ? "Replay" : playing ? "Pause" : "Play"}
              </Button>
            )}
            <Button
              ref={still ? firstControl : undefined}
              size="sm"
              variant="secondary"
              onClick={stop}
              className="bg-white/10 text-white hover:bg-white/20"
            >
              {still ? "Close" : ended ? "Done" : "Skip"}
            </Button>
          </div>
        </div>

        {!still && (
          <>
            {/*
              Uncontrolled on purpose: the camera rig moves the thumb by
              writing to the element every frame, and React state would
              either fight that or re-render the page sixty times a second.
            */}
            <input
              ref={(element) => {
                transport.slider = element;
              }}
              type="range"
              className="range-slider mt-2"
              min={0}
              max={FLYTHROUGH_STEPS}
              step={1}
              defaultValue={0}
              aria-label="Flythrough position"
              onChange={(event) => handleSeek(event.currentTarget.valueAsNumber / FLYTHROUGH_STEPS)}
            />
            <p className="mt-1 text-[0.625rem] text-white/50">
              Space plays and pauses. Escape exits. Drag the bar to scrub.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
