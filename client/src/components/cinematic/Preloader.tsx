import { useEffect, useState } from "react";
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

/** CSS rack silhouette whose units light up as boot progresses. */
function BootRack({ progress }: { progress: number }) {
  const UNITS = 18;
  const lit = Math.round(progress * UNITS);
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        aria-hidden
        className="relative flex h-[58%] w-[44%] flex-col justify-center gap-[3px] overflow-hidden rounded-md border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,#0a0d11_0%,#04050a_100%)] px-2"
        style={{ boxShadow: "0 60px 80px -40px rgba(0,0,0,0.9)" }}
      >
        {Array.from({ length: UNITS }).map((_, i) => {
          const on = UNITS - i <= lit;
          return (
            <div
              key={i}
              className="flex h-[5px] items-center gap-1 rounded-[2px] px-1"
              style={{
                background: on ? "hsl(220 26% 13%)" : "hsl(220 24% 9%)",
                transition: "background 260ms linear",
              }}
            >
              <span
                className="h-[3px] w-[3px] rounded-full"
                style={{
                  background: on ? "hsl(72 100% 50%)" : "hsl(215 14% 26%)",
                  boxShadow: on ? "0 0 5px hsl(72 100% 50%)" : "none",
                  transition: "background 260ms linear",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Preloader({ minDurationMs = 1200, onDone }: PreloaderProps) {
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

    const tick = () => {
      const elapsed = performance.now() - mountedAt;
      const timeFraction = Math.min(1, elapsed / minDurationMs);
      const target = Math.min(loadFraction, timeFraction);
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
          <BootRack progress={progress} />
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
