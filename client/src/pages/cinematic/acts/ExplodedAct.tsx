import { useRef } from "react";
import { useScrollScene } from "@/lib/motion/useScrollScene";
import { ExplodedScene } from "@/components/cinematic/rack3d/ExplodedScene";

/**
 * EXPLODED — Act 4
 *
 * A 2U server disassembles across scroll. Camera arcs from front to overhead.
 * HTML-overlaid labels fade in when parts are separated, reading like an
 * engineering manual plate.
 */
export function ExplodedAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const progressRef = useRef(0);

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      gsap.set(gridRef.current, { opacity: 0.1 });
      gsap.set(legendRef.current, { opacity: 0 });

      timeline
        .from(eyebrowRef.current, { opacity: 0, y: 14, duration: 0.15 }, 0.02)
        .from(headlineRef.current, { opacity: 0, y: 24, duration: 0.22 }, 0.06)
        .from(captionRef.current, { opacity: 0, y: 14, duration: 0.18 }, 0.14);

      timeline.to(gridRef.current, { opacity: 0.28, duration: 0.4 }, 0.2);
      timeline.to(legendRef.current, { opacity: 1, duration: 0.3 }, 0.45);

      // Fade text out by the time the camera tour begins exploring parts,
      // so nothing competes with the labelled engineering plate.
      timeline.to(
        [eyebrowRef.current, headlineRef.current, captionRef.current],
        { opacity: 0.0, y: -10, duration: 0.2 },
        0.2,
      );

      const proxy = { p: 0 };
      timeline.to(
        proxy,
        {
          p: 1,
          duration: 1,
          ease: "none",
          onUpdate: () => {
            progressRef.current = proxy.p;
          },
        },
        0,
      );
    },
    [],
    { end: "+=320%", pin: true, scrub: 1 },
  );

  return (
    <section
      ref={rootRef}
      data-scroll-scene="exploded"
      data-testid="section-cinematic-exploded"
      className="relative h-screen w-full overflow-hidden bg-[hsl(var(--brand-obsidian))]"
    >
      {/* Grid backdrop */}
      <div
        ref={gridRef}
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 78%)",
        }}
      />

      <div className="absolute inset-0">
        <ExplodedScene progressRef={progressRef} />
      </div>

      {/* Vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, hsl(var(--brand-obsidian)) 92%)",
        }}
      />

      {/* Title block, left */}
      <div className="pointer-events-none absolute left-6 right-6 top-24 z-10 max-w-[32ch] md:left-10 md:right-auto md:top-28">
        <div
          ref={eyebrowRef}
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Unit 04 · Anatomy
        </div>
        <h2
          ref={headlineRef}
          className="mt-4 font-display text-[clamp(1.7rem,4.5vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]"
        >
          Every bay, <span className="signal-text">accounted for.</span>
        </h2>
        <div
          ref={captionRef}
          className="mt-5 max-w-[38ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-sm"
        >
          Scroll to separate the assembly. Each part I design around has a spec, a
          thermal budget, and a failure mode I've thought through.
        </div>
      </div>

      {/* Engineering-plate legend, right */}
      <div
        ref={legendRef}
        className="pointer-events-none absolute right-6 top-28 z-10 hidden flex-col items-end gap-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] md:flex"
      >
        <span>plate · 02.A</span>
        <span>rev · 2026.04</span>
        <span className="flex items-center gap-2">
          <span
            className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
            style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
          />
          live assembly
        </span>
      </div>

      {/* Bottom scale bar */}
      <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex items-center justify-between px-6 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] md:px-10">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" />
          <span>scale · 1 : 4</span>
        </div>
        <div className="flex items-center gap-3">
          <span>2U · 19" rack depth</span>
          <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" />
        </div>
      </div>
    </section>
  );
}
