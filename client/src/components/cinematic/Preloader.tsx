import { useEffect, useLayoutEffect, useState } from "react";
import { useSmoothScroll } from "@/lib/motion/SmoothScrollProvider";

interface PreloaderProps {
  /** Minimum ms the preloader stays visible so the animation is perceptible. */
  minDurationMs?: number;
  onDone?: () => void;
}

/*
  The preloader used to mount a WebGL scene. It appears on every route, so
  three.js and react-three-fiber (about 950 KB) were pulled on /blog,
  /projects and /contact purely to animate a screen that is up for a little
  over a second, and which in practice usually showed the CSS fallback below
  anyway because the chunk had not arrived yet. The fallback is now the
  loader. The homepage still loads those libraries for the hero, where they
  earn their weight.
*/

/*
  A real rack in three dimensions, built from CSS transforms rather than WebGL.

  The obvious way to make this scene "3D" would be to mount a WebGL canvas,
  and that was how it worked once. It was removed for a good reason, recorded
  above: the loader is on every route, so three.js and react-three-fiber cost
  about 950 KB to animate a screen that is up for a second, and the chunk
  usually had not even arrived before the loader was gone. A loading screen
  that must itself load is a contradiction.

  `perspective` plus `transform-style: preserve-3d` gives genuine perspective
  projection, real depth sorting and a real rotating camera for zero bytes.
  Every face below is a plane placed in space, not a picture of one.

  Everything animated here is transform or opacity, so it composites on the
  GPU and never touches layout, which matters on the mid range phone that is
  waiting on this screen in the first place.
*/

/*
  How long the loader will wait on `window.load` before giving up on it and
  finishing anyway. Generous enough that a normal slow connection still gets a
  truthful progress bar, short enough that a blocked CDN is a hiccup rather
  than a dead end.
*/
const FAILSAFE_MS = 3500;

const RACK_W = 190;
const RACK_H = 286;
const RACK_D = 84;
const UNITS = 16;

function Rack3D({ progress, reduceMotion }: { progress: number; reduceMotion: boolean }) {
  const lit = progress * UNITS;

  const face = (extra: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    left: "50%",
    top: "50%",
    transformStyle: "preserve-3d",
    backfaceVisibility: "hidden",
    ...extra,
  });

  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center"
      style={{ perspective: "1100px", perspectiveOrigin: "50% 42%" }}
    >
      <div
        style={{
          position: "relative",
          width: RACK_W,
          height: RACK_H,
          transformStyle: "preserve-3d",
          animation: reduceMotion ? undefined : "rack-orbit 14s ease-in-out infinite",
          transform: reduceMotion ? "rotateX(-6deg) rotateY(-24deg)" : undefined,
        }}
      >
        {/* Right side panel, the face that sells the depth. */}
        <div
          style={face({
            width: RACK_D,
            height: RACK_H,
            marginLeft: -RACK_D / 2,
            marginTop: -RACK_H / 2,
            transform: `translateX(${RACK_W / 2}px) rotateY(90deg)`,
            background:
              "linear-gradient(180deg, #0b0f14 0%, #05070c 100%)",
            borderLeft: "1px solid hsl(var(--brand-iron))",
            borderRight: "1px solid hsl(var(--brand-iron))",
          })}
        />
        {/* Left side panel. */}
        <div
          style={face({
            width: RACK_D,
            height: RACK_H,
            marginLeft: -RACK_D / 2,
            marginTop: -RACK_H / 2,
            transform: `translateX(${-RACK_W / 2}px) rotateY(-90deg)`,
            background: "linear-gradient(180deg, #070a0f 0%, #03050a 100%)",
          })}
        />
        {/* Top cap. */}
        <div
          style={face({
            width: RACK_W,
            height: RACK_D,
            marginLeft: -RACK_W / 2,
            marginTop: -RACK_D / 2,
            transform: `translateY(${-RACK_H / 2}px) rotateX(90deg)`,
            background: "linear-gradient(180deg, #10151c 0%, #080b11 100%)",
            border: "1px solid hsl(var(--brand-iron))",
          })}
        />
        {/* Back plane, so the rack reads as solid when the orbit swings round. */}
        <div
          style={face({
            width: RACK_W,
            height: RACK_H,
            marginLeft: -RACK_W / 2,
            marginTop: -RACK_H / 2,
            transform: `translateZ(${-RACK_D / 2}px)`,
            background: "#04060a",
            border: "1px solid hsl(var(--brand-iron))",
          })}
        />

        {/* Front rails, with the units mounted between them. */}
        <div
          style={face({
            width: RACK_W,
            height: RACK_H,
            marginLeft: -RACK_W / 2,
            marginTop: -RACK_H / 2,
            transform: `translateZ(${RACK_D / 2}px)`,
            background:
              "linear-gradient(180deg, rgba(14,19,26,0.96) 0%, rgba(5,7,12,0.96) 100%)",
            border: "1px solid hsl(var(--brand-iron))",
            borderRadius: 4,
            padding: "9px 8px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 3,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.05), 0 40px 70px -30px rgba(0,0,0,0.95)",
          })}
        >
          {/*
            A patch panel that is always present. Without it the rack starts
            as an empty rectangle and only becomes recognisable once enough
            units have seated, which wastes the first half second.
          */}
          <div
            style={{
              height: 9,
              flex: "none",
              marginBottom: 2,
              borderRadius: 2,
              border: "1px solid hsl(215 14% 16%)",
              background: "linear-gradient(180deg, #0d1218 0%, #080c11 100%)",
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: "0 4px",
            }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 1,
                  background: "hsl(215 14% 13%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              />
            ))}
          </div>

          {Array.from({ length: UNITS }).map((_, i) => {
            // Units seat from the bottom up, each sliding forward out of the
            // rack as its turn arrives. `seat` is 0 while queued and 1 once
            // fully home, so one expression drives depth, tilt and opacity.
            const order = UNITS - 1 - i;
            const seat = Math.max(0, Math.min(1, lit - order));
            const on = seat > 0.55;
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  height: 11,
                  borderRadius: 2,
                  transformStyle: "preserve-3d",
                  transform: reduceMotion
                    ? undefined
                    : `translateZ(${(seat - 1) * 46}px) rotateX(${(1 - seat) * -34}deg)`,
                  opacity: reduceMotion ? 1 : 0.15 + seat * 0.85,
                  transition:
                    "transform 420ms cubic-bezier(.2,.9,.25,1), opacity 420ms linear, background 300ms linear",
                  background: on
                    ? "linear-gradient(180deg, #1a2230 0%, #10161f 100%)"
                    : "linear-gradient(180deg, #0b0f15 0%, #080b10 100%)",
                  border: "1px solid",
                  borderColor: on ? "hsl(215 16% 22%)" : "hsl(215 14% 14%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  paddingLeft: 5,
                  boxShadow: on
                    ? "0 0 12px -4px hsl(var(--brand-signal) / 0.5)"
                    : "none",
                }}
              >
                <span
                  style={{
                    height: 3,
                    width: 3,
                    borderRadius: 999,
                    flex: "none",
                    background: on ? "hsl(var(--brand-signal))" : "hsl(215 14% 24%)",
                    boxShadow: on ? "0 0 7px hsl(var(--brand-signal))" : "none",
                    transition: "background 260ms linear, box-shadow 260ms linear",
                  }}
                />
                <span
                  style={{
                    height: 3,
                    width: 3,
                    borderRadius: 999,
                    flex: "none",
                    background: on ? "hsl(var(--brand-cyan) / 0.75)" : "hsl(215 14% 18%)",
                    transition: "background 300ms linear",
                  }}
                />
                {/* Vent slots, drawn as a repeating gradient rather than nodes. */}
                <span
                  style={{
                    flex: 1,
                    height: 5,
                    marginRight: 5,
                    borderRadius: 1,
                    opacity: on ? 0.5 : 0.25,
                    backgroundImage:
                      "repeating-linear-gradient(90deg, hsl(215 14% 20%) 0 2px, transparent 2px 5px)",
                    transition: "opacity 300ms linear",
                  }}
                />
              </div>
            );
          })}

          {/* Power at the bottom, where it lives in a real rack. */}
          <div
            style={{
              height: 13,
              flex: "none",
              marginTop: 3,
              borderRadius: 2,
              border: "1px solid hsl(215 14% 17%)",
              background: "linear-gradient(180deg, #0e141b 0%, #080c11 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 6px",
            }}
          >
            <span
              style={{
                height: 4,
                width: 4,
                borderRadius: 999,
                background: "hsl(var(--brand-signal))",
                boxShadow: "0 0 8px hsl(var(--brand-signal))",
                animation: reduceMotion ? undefined : "preloader-pulse 2.4s ease-in-out infinite",
              }}
            />
            <span
              style={{
                width: 46,
                height: 5,
                borderRadius: 1,
                backgroundImage:
                  "repeating-linear-gradient(90deg, hsl(215 14% 21%) 0 2px, transparent 2px 5px)",
              }}
            />
          </div>
        </div>

        {/* Contact shadow on the floor plane, tying the rack to the ground. */}
        <div
          style={face({
            width: RACK_W * 1.7,
            height: RACK_D * 2.4,
            marginLeft: (-RACK_W * 1.7) / 2,
            marginTop: (-RACK_D * 2.4) / 2,
            transform: `translateY(${RACK_H / 2 + 8}px) rotateX(90deg)`,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, transparent 68%)",
            filter: "blur(6px)",
          })}
        />
      </div>
    </div>
  );
}

export function Preloader({ minDurationMs = 1200, onDone }: PreloaderProps) {
  /*
    Take the veil off in the same frame this first paints.

    index.html hides the prerendered body behind an opaque ground from the
    first byte, because this component is React and does not exist for the
    first second and a half, which is how a reader ended up seeing the page,
    then a loading screen over it, then the page again.

    A layout effect rather than an effect: this runs after the DOM is in
    place and before the browser paints, so the frame that removes the veil
    is the frame that draws the animation. In an ordinary effect the browser
    can paint in between, and the gap is a flash of the page underneath,
    which is the thing being fixed.
  */
  useLayoutEffect(() => {
    document.documentElement.classList.remove("booting");
  }, []);

  const [progress, setProgress] = useState(0);
  const [hiding, setHiding] = useState(false);
  const [gone, setGone] = useState(false);
  const { stop, start } = useSmoothScroll();
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    stop();
    const mountedAt = performance.now();
    let rafId = 0;
    let loadFraction = 0;

    const onDocLoad = () => {
      loadFraction = 1;
    };
    if (document.readyState === "complete") {
      loadFraction = 1;
    } else {
      window.addEventListener("load", onDocLoad, { once: true });
    }

    /*
      Never let a hung request hold the whole site hostage.

      Progress is gated on `window.load`, which does not fire until every
      subresource has settled. The fonts come from fonts.googleapis.com, and
      plenty of school and corporate networks block it outright, so on those
      networks `load` never fires, `loadFraction` stays 0, and the visitor
      sits on a loading screen at 000% until they give up and leave. The page
      underneath is perfectly usable the whole time.

      Found by running the loader on a machine with no route to that CDN,
      where it hung indefinitely rather than degrading.

      The site is interactive well before this fires; the ceiling only exists
      so a stalled request cannot be the difference between a working site and
      a blank one.
    */
    const failsafe = window.setTimeout(() => {
      loadFraction = 1;
    }, FAILSAFE_MS);

    const tick = () => {
      const elapsed = performance.now() - mountedAt;
      const timeFraction = Math.min(1, elapsed / minDurationMs);

      /*
        Time drives the bar; the load only gates the finish.

        Taking `min(loadFraction, timeFraction)` pinned progress at exactly 0
        until `load` fired and then snapped it to 1, so the reading went 000%
        straight to 100% and the rack's assembly never played a single frame.
        The animation existed and was simply never seen.

        Now the bar climbs on its own and stops just short, so the units seat
        one by one every time, and the last stretch still waits on the real
        load. 100% continues to mean loaded rather than merely elapsed.
      */
      const target = loadFraction >= 1 ? timeFraction : Math.min(timeFraction, 0.92);
      setProgress((prev) => prev + (target - prev) * 0.18);

      if (elapsed > minDurationMs && loadFraction >= 1 && target >= 0.999) {
        setProgress(1);
        setHiding(true);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(failsafe);
      window.removeEventListener("load", onDocLoad);
    };
  }, [minDurationMs, stop]);

  useEffect(() => {
    if (!hiding) return;
    const timer = window.setTimeout(
      () => {
        setGone(true);
        start();
        onDone?.();
      },
      reduceMotion ? 0 : 720,
    );
    return () => window.clearTimeout(timer);
  }, [hiding, start, onDone, reduceMotion]);

  if (gone) return null;

  const pct = Math.round(progress * 100);

  return (
    <div
      aria-hidden="true"
      data-testid="preloader"
      data-print-hide
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] transition-opacity duration-[640ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
        hiding ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 38%, hsl(var(--brand-signal) / 0.16), transparent 38%), radial-gradient(circle at 14% 86%, hsl(var(--brand-cyan) / 0.10), transparent 32%), radial-gradient(circle at 88% 18%, hsl(var(--brand-cyan) / 0.06), transparent 28%), linear-gradient(180deg, #06080d 0%, #02030a 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at center, black 20%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 20%, transparent 78%)",
        }}
      />
      <div
        aria-hidden
        className="absolute left-[12vw] top-[16vh] h-[44vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-cyan) / 0.45) 28%, transparent 100%)",
          boxShadow: "0 0 28px hsl(var(--brand-cyan) / 0.3)",
        }}
      />
      <div
        aria-hidden
        className="absolute right-[12vw] top-[20vh] h-[40vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-signal) / 0.42) 32%, transparent 100%)",
          boxShadow: "0 0 28px hsl(var(--brand-signal) / 0.28)",
        }}
      />

      <div className="relative flex flex-col items-center gap-7 px-6">
        <div className="flex items-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.38em] text-[hsl(var(--brand-bone-dim))]">
          <span
            className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-signal))]"
            style={{
              boxShadow: "0 0 12px hsl(var(--brand-signal))",
              animation: reduceMotion
                ? undefined
                : "preloader-pulse 1.6s ease-in-out infinite",
            }}
          />
          <span>Max Doubin · Profile Loading</span>
        </div>

        <div
          style={{
            width: "min(360px, 78vw)",
            height: "min(420px, 60vh)",
          }}
        >
          <Rack3D progress={progress} reduceMotion={!!reduceMotion} />
        </div>

        <div className="flex w-[min(320px,78vw)] items-center justify-between font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone-dim))]">
          <span>Loading site</span>
          <span className="signal-text" data-testid="text-preloader-percent">
            {pct.toString().padStart(3, "0")}%
          </span>
        </div>

        <div className="relative h-px w-[min(320px,78vw)] overflow-hidden bg-[hsl(var(--brand-iron))]">
          <div
            className="absolute left-0 top-0 h-full bg-[hsl(var(--brand-signal))] transition-[width] duration-100 ease-out"
            style={{
              width: `${pct}%`,
              boxShadow: "0 0 10px hsl(var(--brand-signal))",
            }}
          />
        </div>

        <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone-dim))]">
          Cybersecurity · Networking · Leadership
        </div>
      </div>
    </div>
  );
}
