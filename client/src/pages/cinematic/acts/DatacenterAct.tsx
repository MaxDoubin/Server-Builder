import { useRef } from "react";
import { useScrollScene } from "@/lib/motion/useScrollScene";
import { DatacenterScene } from "@/components/cinematic/rack3d/DatacenterScene";

/**
 * DATACENTER — Act 5
 *
 * Start in the cold aisle between two rows of racks; scroll pulls the camera
 * back and up until the full hall is visible. Numbers tick in like a live HUD.
 */
export function DatacenterAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const rackCountRef = useRef<HTMLSpanElement>(null);
  const kwCountRef = useRef<HTMLSpanElement>(null);
  const uCountRef = useRef<HTMLSpanElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  const progressRef = useRef(0);

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      gsap.set(vignetteRef.current, { opacity: 0.85 });
      gsap.set(statsRef.current, { opacity: 0 });

      timeline
        .from(eyebrowRef.current, { opacity: 0, y: 14, duration: 0.15 }, 0.02)
        .from(headlineRef.current, { opacity: 0, y: 26, duration: 0.22 }, 0.06)
        .from(captionRef.current, { opacity: 0, y: 14, duration: 0.18 }, 0.14);

      // Stats rise as the camera pulls back
      timeline.to(statsRef.current, { opacity: 1, duration: 0.3 }, 0.35);

      // Counters
      const rackTarget = { v: 1 };
      timeline.to(
        rackTarget,
        {
          v: 20,
          duration: 0.6,
          onUpdate: () => {
            if (rackCountRef.current) {
              rackCountRef.current.textContent = Math.round(rackTarget.v).toString().padStart(2, "0");
            }
          },
        },
        0.35,
      );

      const kwTarget = { v: 3 };
      timeline.to(
        kwTarget,
        {
          v: 240,
          duration: 0.6,
          onUpdate: () => {
            if (kwCountRef.current) {
              kwCountRef.current.textContent = Math.round(kwTarget.v).toString();
            }
          },
        },
        0.35,
      );

      const uTarget = { v: 42 };
      timeline.to(
        uTarget,
        {
          v: 840,
          duration: 0.6,
          onUpdate: () => {
            if (uCountRef.current) {
              uCountRef.current.textContent = Math.round(uTarget.v).toString();
            }
          },
        },
        0.35,
      );

      // Headline fades out near the end
      timeline.to(
        [eyebrowRef.current, headlineRef.current, captionRef.current],
        { opacity: 0.15, duration: 0.3 },
        0.72,
      );

      // Vignette lightens as we pull out (to show scale)
      timeline.to(vignetteRef.current, { opacity: 0.55, duration: 0.5 }, 0.4);

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
    { end: "+=260%", pin: true, scrub: 1 },
  );

  return (
    <section
      ref={rootRef}
      data-scroll-scene="datacenter"
      data-testid="section-cinematic-datacenter"
      className="relative h-screen w-full overflow-hidden bg-[hsl(var(--brand-obsidian))]"
    >
      <div className="absolute inset-0">
        <DatacenterScene progressRef={progressRef} />
      </div>

      {/* Vignette */}
      <div
        ref={vignetteRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, hsl(var(--brand-obsidian)) 92%)",
        }}
      />

      {/* Top copy */}
      <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex flex-col items-center px-6 text-center md:top-28">
        <div
          ref={eyebrowRef}
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Unit 05 · Scale
        </div>
        <h2
          ref={headlineRef}
          className="mt-6 max-w-[22ch] font-display text-[clamp(1.8rem,5.4vw,4.2rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]"
        >
          One rack is a test.
          <br />
          <span className="signal-text">A hall is a proof.</span>
        </h2>
        <div
          ref={captionRef}
          className="mt-5 max-w-[48ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-sm"
        >
          Patterns only emerge at scale — airflow, weight, cable length,
          blast-radius. Design one rack well, then copy-paste discipline.
        </div>
      </div>

      {/* Stats strip */}
      <div
        ref={statsRef}
        className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex justify-center px-4 md:bottom-20 md:px-6"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.72)] px-4 py-4 backdrop-blur-md sm:gap-8 sm:px-8 sm:py-5 md:gap-14">
          <Stat label="racks">
            <span ref={rackCountRef}>01</span>
          </Stat>
          <Stat label="kW">
            <span ref={kwCountRef}>3</span>
          </Stat>
          <Stat label="U Deployed">
            <span ref={uCountRef}>42</span>
          </Stat>
          <Stat label="Aisle · cold">
            <span className="text-[hsl(var(--brand-signal))]">STABLE</span>
          </Stat>
        </div>
      </div>

      {/* HUD corners */}
      <div className="pointer-events-none absolute left-8 top-28 z-10 hidden flex-col gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex">
        <span>// hall 01 · 20 racks</span>
        <span>// aisle · cold · 18.2°C</span>
        <span>// pue · 1.32</span>
      </div>
      <div className="pointer-events-none absolute right-8 top-28 z-10 hidden flex-col items-end gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex">
        <span>cam · dolly-up</span>
        <span>trace · live</span>
      </div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="font-display text-3xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-4xl">
        {children}
      </div>
      <div className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
        {label}
      </div>
    </div>
  );
}
