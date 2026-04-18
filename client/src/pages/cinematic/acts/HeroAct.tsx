import { useRef } from "react";
import { useScrollScene } from "@/lib/motion/useScrollScene";

/**
 * HERO — Act 1
 *
 * Phase 1 scaffold: pinned 200vh section with scroll-scrubbed camera feel
 * built from CSS transforms on a placeholder rack silhouette.
 * Phase 2 will replace the silhouette with a live R3F <Canvas> rack.
 */
export function HeroAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const rackRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      gsap.set(rackRef.current, { scale: 0.82, y: 60, rotateX: 14, opacity: 0 });
      gsap.set(gridRef.current, { opacity: 0.15, scale: 1 });
      gsap.set(vignetteRef.current, { opacity: 0.7 });

      // 0 → 30%: rack rises and resolves, eyebrow flickers in
      timeline
        .to(rackRef.current, { y: 0, scale: 1, rotateX: 0, opacity: 1, duration: 0.3 }, 0)
        .from(eyebrowRef.current, { opacity: 0, y: 12, duration: 0.15 }, 0.05)
        .from(headlineRef.current, { opacity: 0, y: 24, duration: 0.2 }, 0.08)
        .from(metaRef.current, { opacity: 0, y: 12, duration: 0.15 }, 0.18);

      // 30 → 70%: camera push — rack scales up, grid expands, vignette tightens
      timeline
        .to(rackRef.current, { scale: 1.18, y: -20, duration: 0.4 }, 0.3)
        .to(gridRef.current, { opacity: 0.32, scale: 1.4, duration: 0.4 }, 0.3)
        .to(vignetteRef.current, { opacity: 0.92, duration: 0.4 }, 0.3);

      // 70 → 100%: text fades toward the next act
      timeline
        .to([eyebrowRef.current, headlineRef.current, metaRef.current], {
          opacity: 0,
          y: -16,
          duration: 0.3,
          stagger: 0.04,
        }, 0.7)
        .to(rackRef.current, { scale: 1.35, y: -80, opacity: 0.4, duration: 0.3 }, 0.7);
    },
    [],
    { end: "+=200%", pin: true, scrub: 1 },
  );

  return (
    <section
      ref={rootRef}
      data-scroll-scene="hero"
      data-testid="section-cinematic-hero"
      className="relative h-screen w-full overflow-hidden bg-[hsl(var(--brand-obsidian))]"
    >
      {/* Grid */}
      <div
        ref={gridRef}
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron) / 0.45) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.45) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      {/* Vignette */}
      <div
        ref={vignetteRef}
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, hsl(var(--brand-obsidian)) 85%)",
        }}
      />

      {/* Rack silhouette placeholder (Phase 2 replaces with R3F) */}
      <div
        ref={rackRef}
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 [perspective:1200px]"
        style={{ willChange: "transform, opacity" }}
      >
        <div
          className="relative h-[520px] w-[280px] rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] shadow-[0_60px_120px_-20px_rgba(0,0,0,0.85)]"
        >
          <div className="absolute inset-x-2 inset-y-2 flex flex-col-reverse gap-[2px] overflow-hidden rounded-sm">
            {Array.from({ length: 42 }).map((_, i) => (
              <div
                key={i}
                className="relative h-[10px] shrink-0 rounded-[1px] border border-[hsl(var(--brand-carbon))]"
                style={{
                  background:
                    i % 7 === 0
                      ? "linear-gradient(180deg, hsl(var(--brand-iron)) 0%, hsl(var(--brand-obsidian)) 100%)"
                      : "linear-gradient(180deg, hsl(var(--brand-carbon)) 0%, hsl(var(--brand-obsidian)) 100%)",
                }}
              >
                <span
                  className="absolute left-2 top-1/2 h-[3px] w-[3px] -translate-y-1/2 rounded-full"
                  style={{
                    background:
                      i % 3 === 0
                        ? "hsl(var(--brand-signal))"
                        : i % 5 === 0
                          ? "hsl(var(--brand-amber))"
                          : "hsl(var(--brand-cyan))",
                    boxShadow:
                      i % 3 === 0
                        ? "0 0 4px hsl(var(--brand-signal))"
                        : "none",
                  }}
                />
              </div>
            ))}
          </div>
          <div
            className="pointer-events-none absolute inset-0 rounded-md"
            style={{
              background:
                "linear-gradient(180deg, hsl(var(--brand-bone) / 0.08) 0%, transparent 20%, transparent 85%, hsl(var(--brand-obsidian) / 0.6) 100%)",
            }}
          />
        </div>
      </div>

      {/* Copy */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-[12vh] text-center">
        <div
          ref={eyebrowRef}
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Unit 01 · Hyperscale Craft
        </div>
        <h1
          ref={headlineRef}
          className="mt-6 max-w-[22ch] font-display text-[clamp(2.6rem,7vw,5.4rem)] font-medium leading-[0.95] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
        >
          Racks, routed. <span className="signal-text">Built to hold.</span>
        </h1>
        <div
          ref={metaRef}
          className="mt-10 flex items-center gap-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))]"
        >
          <span>Las Vegas, NV</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Top 1% National Cyber League</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Scroll</span>
        </div>
      </div>

      {/* Top corner HUD */}
      <div className="pointer-events-none absolute left-8 top-24 hidden flex-col gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex">
        <span>// Rack 01 / 42U</span>
        <span>// ambient · 19.4°C</span>
        <span>// load · 0.42</span>
      </div>
      <div className="pointer-events-none absolute right-8 top-24 hidden flex-col items-end gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex">
        <span>N 36.1699° W 115.1398°</span>
        <span>session · live</span>
      </div>
    </section>
  );
}
