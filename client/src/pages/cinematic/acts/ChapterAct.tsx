import { useRef } from "react";
import { RackStoryCanvas } from "@/components/cinematic/rack3d/RackStoryCanvas";
import { useScrollScene } from "@/lib/motion/useScrollScene";

const STORY_BEATS = [
  {
    n: "01",
    label: "Front Signal",
    title: "Nationally recognized cybersecurity specialist.",
    body:
      "Max Doubin builds defensive systems that stay readable under pressure, turning live traffic, visibility, and hardening decisions into calm execution.",
    stats: ["Top 1% National Cyber League", "Threat visibility", "Resilience-first"],
  },
  {
    n: "02",
    label: "Enterprise Flow",
    title: "Enterprise networking expert.",
    body:
      "Routing, switching, segmentation, and rack architecture are treated like one operating system, with every path engineered for speed, clarity, and control.",
    stats: ["Enterprise networking", "Routing + switching", "Structured design"],
  },
  {
    n: "03",
    label: "Systems Build",
    title: "Real infrastructure, built end to end.",
    body:
      "From dense chassis layouts to power, storage, virtualization, and observability, the stack is assembled like a live machine instead of a static mockup.",
    stats: ["Systems engineering", "Rack integration", "Telemetry live"],
  },
  {
    n: "04",
    label: "Leadership",
    title: "Leadership backed by public service.",
    body:
      "Las Vegas based, Blue Ribbon Commissioner, mentor, and builder. The final layer is not just technical depth, but leadership that carries into community impact.",
    stats: ["Blue Ribbon Commissioner", "Las Vegas, NV", "Community leadership"],
  },
] as const;

const BEAT_TIMES = [0, 0.28, 0.52, 0.76] as const;

export function ChapterAct() {
  const rootRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const counterRef = useRef<HTMLSpanElement>(null);
  const cardRefs = useRef<(HTMLArticleElement | null)[]>([]);
  const indicatorRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fieldRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const leftBeamRef = useRef<HTMLDivElement>(null);
  const rightBeamRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      gsap.set(gridRef.current, { opacity: 0.08, scale: 1 });
      gsap.set(fieldRef.current, { opacity: 0.22, scale: 0.98 });
      gsap.set(haloRef.current, { opacity: 0.16, scale: 0.92 });
      gsap.set(sweepRef.current, { opacity: 0.08, yPercent: 8 });
      gsap.set([leftBeamRef.current, rightBeamRef.current], {
        opacity: 0.12,
        scaleY: 0.84,
      });
      gsap.set(vignetteRef.current, { opacity: 0.58 });
      gsap.set(cardRefs.current, { opacity: 0, y: 34, scale: 0.98 });
      gsap.set(cardRefs.current[0], { opacity: 1, y: 0, scale: 1 });
      gsap.set(indicatorRefs.current, {
        opacity: 0.22,
        scaleX: 0.34,
        transformOrigin: "left center",
      });
      gsap.set(indicatorRefs.current[0], {
        opacity: 1,
        scaleX: 1,
        transformOrigin: "left center",
      });

      timeline
        .to(gridRef.current, { opacity: 0.18, scale: 1.18, duration: 1 }, 0)
        .to(fieldRef.current, { opacity: 0.34, scale: 1.1, duration: 1 }, 0)
        .to(haloRef.current, { opacity: 0.32, scale: 1.14, duration: 1 }, 0)
        .to(sweepRef.current, { opacity: 0.2, yPercent: -18, duration: 1 }, 0)
        .to(leftBeamRef.current, { opacity: 0.24, xPercent: -4, scaleY: 1.14, duration: 1 }, 0)
        .to(rightBeamRef.current, { opacity: 0.2, xPercent: 4, scaleY: 1.08, duration: 1 }, 0)
        .to(vignetteRef.current, { opacity: 0.86, duration: 1 }, 0);

      const progressProxy = { p: 0 };
      timeline.to(
        progressProxy,
        {
          p: 1,
          duration: 1,
          ease: "none",
          onUpdate: () => {
            const p = progressProxy.p;
            progressRef.current = p;
            let activeBeat = 1;
            BEAT_TIMES.forEach((time, index) => {
              if (p >= time) activeBeat = index + 1;
            });
            if (counterRef.current) {
              counterRef.current.textContent = activeBeat.toString().padStart(2, "0");
            }
          },
        },
        0,
      );

      timeline.to(cardRefs.current[0], { opacity: 0, y: -24, scale: 0.99, duration: 0.1 }, 0.22);
      timeline.to(indicatorRefs.current[0], { opacity: 0.28, scaleX: 0.42, duration: 0.08 }, 0.22);

      STORY_BEATS.slice(1).forEach((_, index) => {
        const beatIndex = index + 1;
        const start = BEAT_TIMES[beatIndex];
        const end = beatIndex === STORY_BEATS.length - 1 ? 0.98 : Math.min(start + 0.18, 0.95);

        timeline.to(cardRefs.current[beatIndex], {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.12,
        }, start);
        timeline.to(indicatorRefs.current[beatIndex], {
          opacity: 1,
          scaleX: 1,
          duration: 0.12,
        }, start + 0.01);

        if (beatIndex !== STORY_BEATS.length - 1) {
          timeline.to(cardRefs.current[beatIndex], {
            opacity: 0,
            y: -24,
            scale: 0.99,
            duration: 0.1,
          }, end);
          timeline.to(indicatorRefs.current[beatIndex], {
            opacity: 0.28,
            scaleX: 0.42,
            duration: 0.08,
          }, end);
        }
      });
    },
    [],
    { end: "+=420%", pin: true, scrub: 1 },
  );

  return (
    <section
      ref={rootRef}
      data-scroll-scene="chapters"
      data-testid="section-cinematic-chapters"
      className="relative h-screen w-full overflow-hidden bg-[hsl(var(--brand-obsidian))]"
    >
      <div className="absolute inset-x-0 top-0 hairline" />
      <div className="absolute inset-x-0 bottom-0 hairline" />

      <div
        ref={fieldRef}
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 38%, hsl(var(--brand-signal) / 0.14), transparent 28%), radial-gradient(circle at 24% 22%, hsl(var(--brand-cyan) / 0.1), transparent 24%), radial-gradient(circle at 78% 20%, hsl(var(--brand-amber) / 0.08), transparent 22%), radial-gradient(circle at 50% 82%, hsl(var(--brand-cyan) / 0.06), transparent 32%)",
        }}
      />
      <div
        ref={gridRef}
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron) / 0.34) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.34) 1px, transparent 1px)",
          backgroundSize: "82px 82px",
          maskImage:
            "radial-gradient(circle at center, black 34%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(circle at center, black 34%, transparent 82%)",
        }}
      />
      <div
        ref={haloRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[62vw] w-[62vw] -translate-x-1/2 -translate-y-[44%] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, hsl(var(--brand-signal) / 0.16), transparent 34%), radial-gradient(circle at 38% 56%, hsl(var(--brand-cyan) / 0.14), transparent 56%)",
        }}
      />
      <div
        ref={sweepRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-[10vw] top-[30vh] h-[24vh]"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-cyan) / 0.08) 34%, hsl(var(--brand-signal) / 0.12) 52%, transparent 100%)",
          filter: "blur(24px)",
        }}
      />
      <div
        ref={leftBeamRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[24vw]"
        style={{
          background:
            "linear-gradient(112deg, transparent 14%, hsl(var(--brand-cyan) / 0.12) 48%, transparent 82%)",
          filter: "blur(14px)",
        }}
      />
      <div
        ref={rightBeamRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[28vw]"
        style={{
          background:
            "linear-gradient(248deg, transparent 12%, hsl(var(--brand-signal) / 0.14) 46%, transparent 84%)",
          filter: "blur(16px)",
        }}
      />

      <div className="absolute inset-0">
        <RackStoryCanvas progressRef={progressRef} />
      </div>

      <div
        ref={vignetteRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 26%, hsl(var(--brand-obsidian)) 90%)",
        }}
      />

      <div className="pointer-events-none absolute left-6 top-20 z-20 md:left-10 md:top-24">
        <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
          · Unit 02 · Max Doubin Live Architecture
        </div>
        <div className="mt-2 flex items-baseline gap-3 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))]">
          <span className="signal-text" ref={counterRef}>01</span>
          <span>/ 0{STORY_BEATS.length}</span>
        </div>
      </div>

      <div className="pointer-events-none absolute right-6 top-20 z-20 hidden w-[320px] md:block md:right-10 md:top-24">
        <div className="space-y-4">
          {STORY_BEATS.map((beat, index) => (
            <div key={beat.n} className="grid grid-cols-[42px,1fr] items-center gap-3">
              <span className="font-techno text-[10px] uppercase tracking-[0.42em] text-[hsl(var(--brand-ash))]">
                {beat.n}
              </span>
              <div className="space-y-1.5">
                <div
                  ref={(el) => (indicatorRefs.current[index] = el)}
                  className="h-px bg-[hsl(var(--brand-signal))]"
                />
                <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  {beat.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[7vh] z-20 px-6 md:px-10">
        <div className="mx-auto flex max-w-[1400px] justify-start">
          <div className="relative h-[292px] w-full max-w-[720px] md:h-[320px]">
            {STORY_BEATS.map((beat, index) => (
              <article
                key={beat.n}
                ref={(el) => (cardRefs.current[index] = el)}
                className="absolute inset-0 overflow-hidden rounded-[28px] border border-[hsl(var(--brand-iron))] px-6 py-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-[10px] md:px-8 md:py-8"
                style={{
                  background:
                    "linear-gradient(180deg, hsl(var(--brand-graphite) / 0.84) 0%, hsl(var(--brand-obsidian) / 0.76) 100%), radial-gradient(circle at 18% 22%, hsl(var(--brand-cyan) / 0.08), transparent 28%), radial-gradient(circle at 82% 16%, hsl(var(--brand-signal) / 0.08), transparent 22%)",
                }}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-signal)),transparent)] opacity-70" />
                <div className="absolute inset-y-0 right-0 w-[22%] bg-[linear-gradient(180deg,transparent,hsl(var(--brand-cyan)/0.06),transparent)] blur-2xl" />

                <div className="font-techno text-[10px] uppercase tracking-[0.44em] text-[hsl(var(--brand-signal))]">
                  {beat.n} · {beat.label}
                </div>
                <h3 className="mt-5 max-w-[14ch] font-display text-[clamp(2rem,4.2vw,4rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
                  {beat.title}
                </h3>
                <p className="mt-5 max-w-[54ch] font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-sm">
                  {beat.body}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] md:gap-5 md:text-[11px]">
                  {beat.stats.map((stat, statIndex) => (
                    <div key={stat} className="flex items-center gap-4 md:gap-5">
                      <span>{stat}</span>
                      {statIndex !== beat.stats.length - 1 && (
                        <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex items-center justify-between px-6 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] md:px-10">
        <span>scroll · angle shift · chassis insertion</span>
        <span>rack stays live through the sequence</span>
      </div>
    </section>
  );
}
