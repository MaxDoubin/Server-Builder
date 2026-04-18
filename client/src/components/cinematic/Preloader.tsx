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
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 18%, rgba(34, 211, 238, 0.12), transparent 28%), radial-gradient(circle at 82% 14%, rgba(168, 85, 247, 0.1), transparent 24%), linear-gradient(180deg, rgba(2, 6, 23, 0.28) 0%, rgba(2, 6, 23, 0.82) 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.2) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute inset-0 scanline opacity-20" />

      <div className="relative flex flex-col items-center gap-8 px-6">
        <div className="flex items-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.38em] text-[hsl(var(--brand-bone-dim))]">
          <span
            className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-signal))]"
            style={{ boxShadow: "0 0 12px hsl(var(--brand-signal))" }}
          />
          <span>Max Doubin Experience</span>
        </div>

        <div
          className="relative overflow-hidden rounded-[22px] border border-[hsl(var(--brand-iron))] p-5 shadow-[0_40px_90px_-32px_rgba(0,0,0,0.85)]"
          style={{
            background:
              "linear-gradient(180deg, rgba(15, 23, 42, 0.88) 0%, rgba(2, 6, 23, 0.94) 100%)",
          }}
        >
          <div
            className="absolute inset-x-5 top-4 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(103, 232, 249, 0.75) 50%, transparent 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at top, rgba(56, 189, 248, 0.08), transparent 55%)",
            }}
          />

          <div className="relative flex w-[280px] flex-col gap-5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              Initializing profile systems
            </div>

            <div className="flex flex-col-reverse overflow-hidden rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {Array.from({ length: RACK_UNITS }).map((_, i) => {
                const active = i < filled;
                const accent = i % 4 === 0 ? "hsl(var(--brand-amber))" : "hsl(var(--brand-cyan))";

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
                          className="absolute left-4 top-1/2 h-[3px] w-8 -translate-y-1/2 rounded-[1px]"
                          style={{
                            background:
                              "linear-gradient(90deg, hsl(var(--brand-iron)) 0%, hsl(var(--brand-ash) / .4) 100%)",
                          }}
                        />
                        <span
                          className="absolute left-1/2 top-1/2 h-[2px] w-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
                          style={{
                            background:
                              "linear-gradient(90deg, transparent 0%, hsl(var(--brand-cyan) / 0.65) 50%, transparent 100%)",
                          }}
                        />
                        <span
                          className="absolute right-5 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
                          style={{
                            background: accent,
                            boxShadow: `0 0 6px ${accent}`,
                          }}
                        />
                        <span
                          className="absolute right-2 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
                          style={{
                            background: i % 5 === 0 ? "hsl(var(--brand-amber))" : "hsl(var(--brand-cyan))",
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
          </div>
        </div>

        <div className="flex w-[280px] items-center justify-between font-mono-tight text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))]">
          <span>Loading Profile</span>
          <span className="signal-text">{pct.toString().padStart(3, "0")}%</span>
        </div>

        <div className="relative h-px w-[280px] overflow-hidden bg-[hsl(var(--brand-iron))]">
          <div
            className="absolute left-0 top-0 h-full bg-[hsl(var(--brand-signal))] transition-[width] duration-150 ease-out"
            style={{ width: `${pct}%`, boxShadow: "0 0 10px hsl(var(--brand-signal))" }}
          />
        </div>

        <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone-dim))]">
          Cybersecurity · Networking · Systems Engineering
        </div>
      </div>
    </div>
  );
}
