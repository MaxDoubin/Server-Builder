import { Suspense, lazy, useRef } from "react";
import { useScrollScene } from "@/lib/motion/useScrollScene";

/**
 * HERO — Act 1
 *
 * 300vh pinned hero. The GSAP scroll timeline writes hero-progress (0..1)
 * into a ref that drives the R3F camera choreography inside RackCanvas.
 *
 * RackCanvas pulls in three.js + @react-three/fiber (~550KB); we lazy-load
 * it so the first paint ships with the hero copy + background grid and
 * the 3D scene fades in as soon as the chunk is ready.
 */
const RackCanvas = lazy(() =>
  import("@/components/cinematic/rack3d/RackCanvas").then((m) => ({
    default: m.RackCanvas,
  })),
);

function CanvasPoster() {
  // Pure-CSS silhouette of a rack. Same palette as the 3D scene so the
  // cross-fade to the canvas feels like it's filling in, not popping.
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center"
    >
      <div
        className="relative h-[56vh] w-[220px] overflow-hidden rounded-md border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,#0a0d11_0%,#04050a_100%)]"
        style={{
          boxShadow: "0 60px 80px -40px rgba(0,0,0,0.9), inset 0 0 0 1px hsl(var(--brand-iron) / 0.4)",
        }}
      >
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="my-[2px] h-2 rounded-[2px] bg-[hsl(var(--brand-graphite))]"
            style={{
              marginInline: "8px",
              opacity: 0.55 - (i % 3) * 0.1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function HeroAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  // Scroll progress (0..1) bridged from GSAP to R3F's camera.
  const progressRef = useRef(0);

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      gsap.set(gridRef.current, { opacity: 0.14, scale: 1 });
      gsap.set(vignetteRef.current, { opacity: 0.6 });

      // Text intro
      timeline
        .from(eyebrowRef.current, { opacity: 0, y: 16, duration: 0.15 }, 0.02)
        .from(headlineRef.current, { opacity: 0, y: 28, duration: 0.22 }, 0.06)
        .from(metaRef.current, { opacity: 0, y: 14, duration: 0.18 }, 0.16);

      // Background shifts synced to camera arc
      timeline
        .to(gridRef.current, { opacity: 0.32, scale: 1.3, duration: 0.45 }, 0.25)
        .to(vignetteRef.current, { opacity: 0.92, duration: 0.45 }, 0.25);

      // Text exits around the orbit keyframe
      timeline.to(
        [eyebrowRef.current, headlineRef.current, metaRef.current],
        { opacity: 0, y: -16, duration: 0.25, stagger: 0.05 },
        0.55,
      );

      // Overall scroll progress written into progressRef for R3F
      const proxy = { p: 0 };
      timeline.to(proxy, {
        p: 1,
        duration: 1,
        ease: "none",
        onUpdate: () => {
          progressRef.current = proxy.p;
        },
      }, 0);
    },
    [],
    { end: "+=260%", pin: true, scrub: 1 },
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
            "radial-gradient(ellipse at center, black 40%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 78%)",
        }}
      />

      {/* 3D rack canvas — fills the pinned hero (lazy-loaded) */}
      <div className="absolute inset-0">
        <Suspense fallback={<CanvasPoster />}>
          <RackCanvas progressRef={progressRef} />
        </Suspense>
      </div>

      {/* Vignette overlay */}
      <div
        ref={vignetteRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, hsl(var(--brand-obsidian)) 88%)",
        }}
      />

      {/* Copy */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-6 pb-[10vh] text-center">
        <div
          ref={eyebrowRef}
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Unit 01 · Hyperscale Craft
        </div>
        <h1
          ref={headlineRef}
          className="mt-6 max-w-[22ch] font-display text-[clamp(2.4rem,7vw,5.4rem)] font-medium leading-[0.95] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
        >
          Racks, routed. <span className="signal-text">Built to hold.</span>
        </h1>
        <div
          ref={metaRef}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))] md:text-[11px]"
        >
          <span>Las Vegas, NV</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Top 1% National Cyber League</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Scroll</span>
        </div>
      </div>

      {/* Top corner HUD */}
      <div className="pointer-events-none absolute left-8 top-24 z-10 hidden flex-col gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex">
        <span>// Rack 01 / 42U</span>
        <span>// ambient · 19.4°C</span>
        <span>// load · 0.42</span>
      </div>
      <div className="pointer-events-none absolute right-8 top-24 z-10 hidden flex-col items-end gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex">
        <span>N 36.1699° W 115.1398°</span>
        <span>session · live</span>
      </div>
    </section>
  );
}
