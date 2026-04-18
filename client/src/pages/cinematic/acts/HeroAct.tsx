import { useRef } from "react";
import { useScrollScene } from "@/lib/motion/useScrollScene";
import { RackCanvas } from "@/components/cinematic/rack3d/RackCanvas";

/**
 * HERO — Act 1
 *
 * 300vh pinned hero. The GSAP scroll timeline writes hero-progress (0..1)
 * into a ref that drives the R3F camera choreography inside RackCanvas.
 */
export function HeroAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const beamLeftRef = useRef<HTMLDivElement>(null);
  const beamRightRef = useRef<HTMLDivElement>(null);

  const progressRef = useRef(0);

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      gsap.set(gridRef.current, { opacity: 0.14, scale: 1 });
      gsap.set(vignetteRef.current, { opacity: 0.56 });
      gsap.set([beamLeftRef.current, beamRightRef.current], { opacity: 0.18, scaleY: 0.84 });

      timeline
        .from(eyebrowRef.current, { opacity: 0, y: 18, duration: 0.16 }, 0.02)
        .from(headlineRef.current, { opacity: 0, y: 30, scale: 0.985, duration: 0.24 }, 0.06)
        .from(metaRef.current, { opacity: 0, y: 16, duration: 0.18 }, 0.18);

      timeline
        .to(gridRef.current, { opacity: 0.34, scale: 1.34, duration: 0.45 }, 0.22)
        .to(vignetteRef.current, { opacity: 0.94, duration: 0.45 }, 0.22)
        .to(beamLeftRef.current, { opacity: 0.36, scaleY: 1.2, xPercent: -4, duration: 0.42 }, 0.22)
        .to(beamRightRef.current, { opacity: 0.3, scaleY: 1.14, xPercent: 4, duration: 0.42 }, 0.22);

      timeline.to(
        [eyebrowRef.current, headlineRef.current, metaRef.current],
        { opacity: 0, y: -16, duration: 0.25, stagger: 0.05 },
        0.57,
      );

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

      <div
        ref={beamLeftRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[24vw]"
        style={{
          background:
            "linear-gradient(115deg, transparent 12%, hsl(var(--brand-signal) / 0.18) 44%, transparent 82%)",
          filter: "blur(12px)",
        }}
      />
      <div
        ref={beamRightRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[28vw]"
        style={{
          background:
            "linear-gradient(245deg, transparent 12%, hsl(var(--brand-cyan) / 0.14) 46%, transparent 84%)",
          filter: "blur(14px)",
        }}
      />

      <div className="absolute inset-0">
        <RackCanvas progressRef={progressRef} />
      </div>

      <div
        ref={vignetteRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, hsl(var(--brand-obsidian)) 88%)",
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-6 pb-[10vh] text-center">
        <div
          ref={eyebrowRef}
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 14px hsl(var(--brand-signal) / 0.54)" }}
        >
          · Unit 01 · Max Doubin Signal
        </div>
        <h1
          ref={headlineRef}
          className="mt-6 max-w-[20ch] font-display text-[clamp(2.7rem,7vw,5.6rem)] font-medium leading-[0.94] tracking-[-0.035em] text-[hsl(var(--brand-bone))]"
        >
          Max Doubin, in full signal. <span className="signal-text">Built to lead.</span>
        </h1>
        <div
          ref={metaRef}
          className="mt-10 flex flex-wrap items-center justify-center gap-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))]"
        >
          <span>Las Vegas, NV</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Top 1% National Cyber League</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Blue Ribbon Commissioner</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Scroll</span>
        </div>
      </div>

      <div className="pointer-events-none absolute left-8 top-24 z-10 hidden flex-col gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex">
        <span>// max doubin / systems + cyber</span>
        <span>// youth mentorship · public service</span>
        <span>// signal · live</span>
      </div>
      <div className="pointer-events-none absolute right-8 top-24 z-10 hidden flex-col items-end gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex">
        <span>N 36.1699° W 115.1398°</span>
        <span>class of 2029</span>
        <span>session · live</span>
      </div>
    </section>
  );
}
