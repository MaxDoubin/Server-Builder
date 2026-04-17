import { useEffect, useRef, useState } from "react";
import { useSmoothScroll } from "@/lib/motion/SmoothScrollProvider";

const RACK_UNITS = 24;

interface PreloaderProps {
  /** Minimum ms the preloader stays visible so the animation is perceptible. */
  minDurationMs?: number;
  onDone?: () => void;
}

/**
 * Rack-assembly preloader.
 *
 * Fills rack-unit slots from bottom to top as load progress advances.
 * Blocks Lenis scroll until the exit animation completes.
 */
export function Preloader({ minDurationMs = 1100, onDone }: PreloaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [hiding, setHiding] = useState(false);
  const [gone, setGone] = useState(false);
  const { stop, start } = useSmoothScroll();

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
      // smoothly approach the lower of load-fraction and time-fraction
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
    const timer = window.setTimeout(() => {
      setGone(true);
      start();
      onDone?.();
    }, 680);
    return () => window.clearTimeout(timer);
  }, [hiding, start, onDone]);

  if (gone) return null;

  const filled = Math.round(progress * RACK_UNITS);
  const pct = Math.round(progress * 100);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[hsl(var(--brand-obsidian))] transition-[opacity,transform] duration-[680ms] ease-[cubic-bezier(.2,.8,.2,1)] ${
        hiding ? "pointer-events-none opacity-0 -translate-y-2" : "opacity-100"
      }`}
    >
      <div className="absolute inset-0 scanline opacity-20" />

      <div className="relative flex flex-col items-center gap-8 px-6">
        {/* Mini rack */}
        <div className="flex w-[260px] flex-col-reverse overflow-hidden rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] p-1 shadow-[0_40px_60px_-20px_rgba(0,0,0,0.7)]">
          {Array.from({ length: RACK_UNITS }).map((_, i) => {
            const active = i < filled;
            return (
              <div
                key={i}
                className="relative my-[1px] h-3 rounded-[2px] border border-[hsl(var(--brand-carbon))] transition-all duration-300 ease-out"
                style={{
                  background: active
                    ? "linear-gradient(180deg, hsl(var(--brand-carbon)) 0%, hsl(var(--brand-obsidian)) 100%)"
                    : "hsl(var(--brand-obsidian))",
                  boxShadow: active
                    ? "inset 0 0 0 1px hsl(var(--brand-iron) / 0.6), inset 0 1px 0 hsl(var(--brand-bone) / 0.04)"
                    : "none",
                }}
              >
                {active && (
                  <>
                    <span
                      className="absolute left-2 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
                      style={{
                        background: "hsl(var(--brand-signal))",
                        boxShadow: "0 0 6px hsl(var(--brand-signal))",
                      }}
                    />
                    <span
                      className="absolute left-4 top-1/2 h-[3px] w-6 -translate-y-1/2 rounded-[1px]"
                      style={{
                        background:
                          "linear-gradient(90deg, hsl(var(--brand-iron)) 0%, hsl(var(--brand-ash) / .4) 100%)",
                      }}
                    />
                    <span
                      className="absolute right-2 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
                      style={{
                        background:
                          i % 5 === 0
                            ? "hsl(var(--brand-amber))"
                            : "hsl(var(--brand-cyan))",
                        boxShadow: `0 0 6px ${
                          i % 5 === 0
                            ? "hsl(var(--brand-amber))"
                            : "hsl(var(--brand-cyan))"
                        }`,
                      }}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Readout */}
        <div className="flex w-[260px] items-center justify-between font-mono-tight text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))]">
          <span>Racking</span>
          <span className="signal-text">{pct.toString().padStart(3, "0")}%</span>
        </div>

        <div className="h-px w-[260px] bg-[hsl(var(--brand-iron))] relative overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-[hsl(var(--brand-signal))] transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%`, boxShadow: "0 0 10px hsl(var(--brand-signal))" }}
          />
        </div>

        <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
          Max Doubin · Infrastructure
        </div>
      </div>
    </div>
  );
}
