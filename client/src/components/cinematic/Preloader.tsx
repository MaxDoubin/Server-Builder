import { useEffect, useRef, useState } from "react";
import { useSmoothScroll } from "@/lib/motion/SmoothScrollProvider";

interface PreloaderProps {
  /** Minimum ms the preloader stays visible so the animation is perceptible. */
  minDurationMs?: number;
  onDone?: () => void;
}

/**
 * 3D rack-boot preloader.
 *
 * Single tilted rack silhouette rendered via CSS 3D transforms.
 * Rack units fill bottom-up as load progress advances. Intentionally
 * DOM-light (one transform-style:preserve-3d group, ~30 child nodes)
 * so it stays fluid on slow devices where a busier preloader would
 * drop frames.
 */
export function Preloader({ minDurationMs = 1100, onDone }: PreloaderProps) {
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
      reduceMotion ? 0 : 680,
    );
    return () => window.clearTimeout(timer);
  }, [hiding, start, onDone, reduceMotion]);

  if (gone) return null;

  const pct = Math.round(progress * 100);
  const RACK_UNITS = 16;
  const filled = Math.max(0, Math.min(RACK_UNITS, Math.round(progress * RACK_UNITS)));

  return (
    <div
      aria-hidden="true"
      data-testid="preloader"
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] transition-opacity duration-[520ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
        hiding ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 38%, hsl(var(--brand-signal) / 0.14), transparent 38%), radial-gradient(circle at 14% 86%, hsl(var(--brand-cyan) / 0.08), transparent 32%), linear-gradient(180deg, #06080d 0%, #02030a 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.06]"
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

      <div className="relative flex flex-col items-center gap-8 px-6">
        <div className="flex items-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.38em] text-[hsl(var(--brand-bone-dim))]">
          <span
            className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-signal))]"
            style={{
              boxShadow: "0 0 12px hsl(var(--brand-signal))",
              animation: reduceMotion ? undefined : "preloader-pulse 1.6s ease-in-out infinite",
            }}
          />
          <span>Max Doubin · Systems Online</span>
        </div>

        {/* 3D rack silhouette */}
        <div
          className="preloader-stage"
          style={{
            perspective: "900px",
            width: "min(240px, 72vw)",
            height: "min(340px, 62vh)",
          }}
        >
          <div
            className="preloader-rack"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateX(6deg) rotateY(${reduceMotion ? -18 : -22}deg)`,
              animation: reduceMotion ? undefined : "preloader-float 6s ease-in-out infinite",
            }}
          >
            {/* Rack body */}
            <div className="preloader-rack-body" />
            {/* Front bezel slots */}
            <div className="preloader-rack-front">
              {Array.from({ length: RACK_UNITS }).map((_, i) => {
                const fromBottom = RACK_UNITS - 1 - i;
                const isOn = fromBottom < filled;
                const accentClass =
                  fromBottom % 5 === 0
                    ? "preloader-unit-signal"
                    : fromBottom % 3 === 0
                      ? "preloader-unit-cyan"
                      : "preloader-unit-muted";
                return (
                  <div
                    key={i}
                    className={`preloader-unit ${isOn ? `preloader-unit-on ${accentClass}` : ""}`}
                  />
                );
              })}
            </div>
            {/* Side panel depth */}
            <div className="preloader-rack-side" />
            {/* Top cap */}
            <div className="preloader-rack-top" />
            {/* Floor glow */}
            <div className="preloader-rack-floor" />
          </div>
        </div>

        <div className="flex w-[min(280px,74vw)] items-center justify-between font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone-dim))]">
          <span>Booting profile</span>
          <span className="signal-text" data-testid="text-preloader-percent">
            {pct.toString().padStart(3, "0")}%
          </span>
        </div>

        <div className="relative h-px w-[min(280px,74vw)] overflow-hidden bg-[hsl(var(--brand-iron))]">
          <div
            className="absolute left-0 top-0 h-full bg-[hsl(var(--brand-signal))] transition-[width] duration-100 ease-out"
            style={{
              width: `${pct}%`,
              boxShadow: "0 0 10px hsl(var(--brand-signal))",
            }}
          />
        </div>

        <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone-dim))]">
          Cybersecurity · Networking · Systems
        </div>
      </div>
    </div>
  );
}
