import { useRef } from "react";
import { useScrollScene } from "@/lib/motion/useScrollScene";

const CHAPTERS = [
  {
    n: "01",
    title: "Architect",
    body: "Segmentation, VLANs, BGP, OSPF. Designed to fail safely and recover fast.",
  },
  {
    n: "02",
    title: "Harden",
    body: "FortiGate NGFW, ZFS checksums, least-privilege IAM. Defensive depth without friction.",
  },
  {
    n: "03",
    title: "Instrument",
    body: "Wireshark, Prometheus, structured logs. If it isn't measured, it doesn't exist.",
  },
  {
    n: "04",
    title: "Teach",
    body: "Lead instructor, youth coding camps across the Las Vegas Valley. Every rack is a classroom.",
  },
];

/**
 * Chapter Act — horizontal-feeling chapter reel driven by vertical scroll.
 * The inner track translates on X as you scroll; cards stagger in.
 */
export function ChapterAct() {
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      const track = trackRef.current;
      if (!track) return;
      const totalScroll = track.scrollWidth - window.innerWidth;

      timeline.to(track, { x: -totalScroll, duration: 1 });

      // Counter readout advances with scroll
      const counterTarget = { v: 1 };
      timeline.to(counterTarget, {
        v: CHAPTERS.length,
        duration: 1,
        onUpdate: () => {
          if (counterRef.current) {
            counterRef.current.textContent = Math.min(
              CHAPTERS.length,
              Math.round(counterTarget.v),
            )
              .toString()
              .padStart(2, "0");
          }
        },
      }, 0);
    },
    [],
    { end: "+=260%", pin: true, scrub: 1 },
  );

  return (
    <section
      ref={rootRef as React.RefObject<HTMLElement>}
      data-scroll-scene="chapters"
      data-testid="section-cinematic-chapters"
      className="relative h-screen w-full overflow-hidden bg-[hsl(var(--brand-obsidian))]"
    >
      <div className="absolute left-0 right-0 top-0 border-t border-[hsl(var(--brand-iron))]" />

      <div className="absolute left-6 top-24 z-10 md:left-10">
        <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
          · Unit 03 · Operating System
        </div>
        <div className="mt-2 flex items-baseline gap-3 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))]">
          <span className="signal-text" ref={counterRef}>01</span>
          <span>/ 0{CHAPTERS.length}</span>
        </div>
      </div>

      <div className="flex h-full items-center">
        <div
          ref={trackRef}
          className="flex h-[62vh] items-stretch gap-8 pl-[12vw] pr-[40vw]"
          style={{ willChange: "transform" }}
        >
          {CHAPTERS.map((c) => (
            <article
              key={c.n}
              className="group relative flex h-full w-[min(78vw,520px)] shrink-0 flex-col justify-between overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] p-8"
            >
              <div className="scanline pointer-events-none absolute inset-0 opacity-20" />
              <header className="relative flex items-center justify-between">
                <span className="font-techno text-xs uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                  {c.n}
                </span>
                <span
                  className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                  style={{ boxShadow: "0 0 8px hsl(var(--brand-signal))" }}
                />
              </header>
              <div className="relative">
                <h3 className="font-display text-4xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-5xl">
                  {c.title}
                </h3>
                <p className="mt-4 max-w-[38ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {c.body}
                </p>
              </div>
              <footer className="relative flex items-center justify-between font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                <span>trace · stable</span>
                <span>[{c.n}]</span>
              </footer>
            </article>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex items-center justify-between px-6 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] md:px-10">
        <span>scroll · horizontal-locked</span>
        <span>end of track →</span>
      </div>
    </section>
  );
}
