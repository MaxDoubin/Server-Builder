import { Suspense, lazy, useRef } from "react";
import { useScrollScene } from "@/lib/motion/useScrollScene";

/**
 * SYSTEMS — one continuous shot.
 *
 * A single 1500vh pinned section. One R3F Canvas. One camera. The same
 * rack is on screen the entire time:
 *
 *   1. HERO copy fades in over a slow front-on arc.
 *   2. Camera tilts down the SAME rack while empty bays get racked in.
 *   3. A 2U server slides forward out of its slot (camera stays in front
 *      of the rack — never enters it).
 *   4. The pulled server splits into labelled parts; camera arcs around
 *      it from outside the rack volume.
 *   5. Parts close back up, server seals into its slot.
 *   6. Camera pulls way back/up and the hall materialises around the
 *      hero rack — rows of racks, floor grid, the whole hall.
 */
const ContinuousRackScene = lazy(() =>
  import("@/components/cinematic/rack3d/ContinuousRackScene").then((m) => ({
    default: m.ContinuousRackScene,
  })),
);

function ScenePoster() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center"
    >
      <div
        className="relative h-[58vh] w-[230px] overflow-hidden rounded-md border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,#0a0d11_0%,#04050a_100%)]"
        style={{
          boxShadow:
            "0 60px 80px -40px rgba(0,0,0,0.9), inset 0 0 0 1px hsl(var(--brand-iron) / 0.4)",
        }}
      >
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="my-[2px] h-2 rounded-[2px] bg-[hsl(var(--brand-graphite))]"
            style={{ marginInline: "8px", opacity: 0.55 - (i % 3) * 0.1 }}
          />
        ))}
      </div>
    </div>
  );
}

export function SystemsAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);

  // Overlay panels — one per beat. Each panel is a fixed (within the pin)
  // composition that fades in/out at a specific progress range.
  const heroRef = useRef<HTMLDivElement>(null);
  const installRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);
  const anatomyRef = useRef<HTMLDivElement>(null);
  const hallRef = useRef<HTMLDivElement>(null);

  const beatCounterRef = useRef<HTMLSpanElement>(null);
  const beatLabelRef = useRef<HTMLSpanElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const rackCountRef = useRef<HTMLSpanElement>(null);
  const kwCountRef = useRef<HTMLSpanElement>(null);
  const uCountRef = useRef<HTMLSpanElement>(null);

  const vignetteRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      // Initial states for overlay panels — only the hero copy is showing.
      gsap.set([installRef.current, pullRef.current, anatomyRef.current, hallRef.current], {
        opacity: 0,
        y: 18,
      });
      gsap.set(heroRef.current, { opacity: 1, y: 0 });
      gsap.set(vignetteRef.current, { opacity: 0.7 });
      gsap.set(gridRef.current, { opacity: 0.16 });

      const fadeIn = (el: Element | null, at: number) => {
        if (!el) return;
        timeline.to(el, { opacity: 1, y: 0, duration: 0.06 }, at);
      };
      const fadeOut = (el: Element | null, at: number) => {
        if (!el) return;
        timeline.to(el, { opacity: 0, y: -14, duration: 0.06 }, at);
      };

      // Hero out, install in
      fadeOut(heroRef.current, 0.13);
      fadeIn(installRef.current, 0.16);

      // Install out, pull in
      fadeOut(installRef.current, 0.36);
      fadeIn(pullRef.current, 0.40);

      // Pull out, anatomy in
      fadeOut(pullRef.current, 0.54);
      fadeIn(anatomyRef.current, 0.58);

      // Anatomy out, hall in
      fadeOut(anatomyRef.current, 0.78);
      fadeIn(hallRef.current, 0.84);

      // Vignette opens up as we pull back to reveal the hall.
      timeline.to(vignetteRef.current, { opacity: 0.4, duration: 0.16 }, 0.84);
      timeline.to(gridRef.current, { opacity: 0.06, duration: 0.16 }, 0.84);

      // Hall counters animate during the hall reveal.
      const rackTarget = { v: 1 };
      timeline.to(
        rackTarget,
        {
          v: 20,
          duration: 0.14,
          onUpdate: () => {
            if (rackCountRef.current) {
              rackCountRef.current.textContent = Math.round(rackTarget.v)
                .toString()
                .padStart(2, "0");
            }
          },
        },
        0.84,
      );
      const kwTarget = { v: 3 };
      timeline.to(
        kwTarget,
        {
          v: 240,
          duration: 0.14,
          onUpdate: () => {
            if (kwCountRef.current) {
              kwCountRef.current.textContent = Math.round(kwTarget.v).toString();
            }
          },
        },
        0.84,
      );
      const uTarget = { v: 42 };
      timeline.to(
        uTarget,
        {
          v: 840,
          duration: 0.14,
          onUpdate: () => {
            if (uCountRef.current) {
              uCountRef.current.textContent = Math.round(uTarget.v).toString();
            }
          },
        },
        0.84,
      );

      // The progress proxy is the single source of truth. It updates the
      // shared progressRef (fed to R3F), the HUD counter, and the beat
      // label. Everything stays in sync because everything reads from it.
      const proxy = { p: 0 };
      timeline.to(
        proxy,
        {
          p: 1,
          duration: 1,
          ease: "none",
          onUpdate: () => {
            progressRef.current = proxy.p;
            const p = proxy.p;
            const beat =
              p < 0.14 ? { n: "01", l: "Front Signal" }
              : p < 0.36 ? { n: "02", l: "Build Live" }
              : p < 0.54 ? { n: "03", l: "Service Pull" }
              : p < 0.72 ? { n: "04", l: "Anatomy" }
              : p < 0.84 ? { n: "05", l: "Reseat" }
              : { n: "06", l: "Hall" };
            if (beatCounterRef.current) beatCounterRef.current.textContent = beat.n;
            if (beatLabelRef.current) beatLabelRef.current.textContent = beat.l;
            if (progressBarRef.current) {
              progressBarRef.current.style.transform = `scaleX(${p})`;
            }
          },
        },
        0,
      );
    },
    [],
    { end: "+=1500%", pin: true, scrub: 1 },
  );

  return (
    <section
      ref={rootRef}
      data-scroll-scene="systems"
      data-testid="section-cinematic-systems"
      className="relative h-screen w-full overflow-hidden bg-[hsl(var(--brand-obsidian))]"
    >
      {/* Background grid — subtle, persists through every beat */}
      <div
        ref={gridRef}
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.4) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 78%)",
        }}
      />

      {/* The single shared canvas — fills the pinned area */}
      <div className="absolute inset-0">
        <Suspense fallback={<ScenePoster />}>
          <ContinuousRackScene progressRef={progressRef} />
        </Suspense>
      </div>

      {/* Vignette that breathes open during the hall reveal */}
      <div
        ref={vignetteRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 28%, hsl(var(--brand-obsidian)) 88%)",
        }}
      />

      {/* Persistent HUD — beat counter (top-left) + scrub bar (bottom) */}
      <div className="pointer-events-none absolute left-6 top-24 z-20 flex items-baseline gap-4 font-mono-tight md:left-10 md:top-28">
        <span
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Unit
        </span>
        <span ref={beatCounterRef} className="font-display text-xl text-[hsl(var(--brand-bone))]">
          01
        </span>
        <span ref={beatLabelRef} className="text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone-dim))]">
          Front Signal
        </span>
      </div>

      <div className="pointer-events-none absolute right-6 top-24 z-20 hidden flex-col items-end gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex md:right-10 md:top-28">
        <span>N 36.1699° W 115.1398°</span>
        <span>cam · live</span>
        <span>signal · live</span>
      </div>

      {/* Beat 1 — HERO copy */}
      <div
        ref={heroRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-6 pb-[11vh] text-center"
      >
        <div
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 14px hsl(var(--brand-signal) / 0.54)" }}
        >
          · Max Doubin Live Signal
        </div>
        <h1 className="mt-6 max-w-[22ch] font-display text-[clamp(2.4rem,7vw,5.4rem)] font-medium leading-[0.95] tracking-[-0.03em] text-[hsl(var(--brand-bone))]">
          Max Doubin, all systems live. <span className="signal-text">Built to lead.</span>
        </h1>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))] md:text-[11px]">
          <span>Las Vegas, NV</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Top 1% National Cyber League</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Blue Ribbon Commissioner</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Scroll</span>
        </div>
      </div>

      {/* Beat 2 — INSTALL: copy lives off to the left so it doesn't fight
          the new gear sliding into the rack on the right of frame */}
      <div
        ref={installRef}
        className="pointer-events-none absolute inset-x-6 bottom-[14vh] z-10 max-w-[30ch] text-left md:inset-x-auto md:left-12 md:max-w-[36ch]"
      >
        <div
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Build Live
        </div>
        <h2 className="mt-4 font-display text-[clamp(1.6rem,4.4vw,3.4rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
          Same rack.
          <br />
          <span className="signal-text">Built up live.</span>
        </h2>
        <p className="mt-5 max-w-[40ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-sm">
          Slot by slot, the rack fills in. Compute, switching, capacity — racked
          in the order I'd actually deploy them on the floor.
        </p>
      </div>

      {/* Beat 3 — PULL OUT: copy on the right, server pulled forward */}
      <div
        ref={pullRef}
        className="pointer-events-none absolute inset-x-6 bottom-[14vh] z-10 max-w-[30ch] text-left md:inset-x-auto md:right-12 md:max-w-[34ch] md:text-right"
      >
        <div
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Service Pull
        </div>
        <h2 className="mt-4 font-display text-[clamp(1.6rem,4.4vw,3.4rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
          Hot-swap,
          <br />
          <span className="signal-text">no downtime.</span>
        </h2>
        <p className="mt-5 max-w-[40ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:ml-auto md:text-sm">
          PVE Compute 01 slides out on its rails. Same rack, same uptime — the
          fabric keeps running while we look inside.
        </p>
      </div>

      {/* Beat 4 — ANATOMY: copy along the top so labels around the server
          stay readable */}
      <div
        ref={anatomyRef}
        className="pointer-events-none absolute inset-x-0 top-[18vh] z-10 flex flex-col items-center px-6 text-center md:top-[22vh]"
      >
        <div
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Anatomy
        </div>
        <h2 className="mt-3 max-w-[24ch] font-display text-[clamp(1.6rem,4.2vw,3.2rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
          Every bay, <span className="signal-text">accounted for.</span>
        </h2>
      </div>

      {/* Beat 6 — HALL: stats strip across the bottom */}
      <div
        ref={hallRef}
        className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex flex-col items-center px-4 md:bottom-16"
      >
        <div
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Hall
        </div>
        <h2 className="mt-3 max-w-[26ch] text-center font-display text-[clamp(1.6rem,4.2vw,3.2rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
          One rack is a test.
          <br />
          <span className="signal-text">A hall is a proof.</span>
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.7)] px-4 py-3 backdrop-blur-md sm:gap-8 sm:px-8 md:gap-14">
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

      {/* Scrub bar across the very bottom */}
      <div className="pointer-events-none absolute inset-x-6 bottom-3 z-10 h-px bg-[hsl(var(--brand-iron))] md:inset-x-10">
        <div
          ref={progressBarRef}
          className="h-full origin-left bg-[hsl(var(--brand-signal))]"
          style={{
            transform: "scaleX(0)",
            boxShadow: "0 0 10px hsl(var(--brand-signal))",
          }}
        />
      </div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
        {children}
      </div>
      <div className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
        {label}
      </div>
    </div>
  );
}
