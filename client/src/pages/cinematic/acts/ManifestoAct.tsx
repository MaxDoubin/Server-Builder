import { useRef } from "react";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

export function ManifestoAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(lineRefs.current, {
        yPercent: 110,
        opacity: 0,
        stagger: 0.08,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 70%",
          end: "bottom 40%",
          toggleActions: "play none none reverse",
        },
      });
    },
    [],
  );

  const lines = [
    "A server rack is a trust contract.",
    "Built once, watched forever.",
    "Every U, a choice. Every cable, a promise.",
  ];

  return (
    <section
      ref={rootRef}
      data-scroll-scene="manifesto"
      data-testid="section-cinematic-manifesto"
      className="relative flex min-h-screen items-center justify-center bg-[hsl(var(--brand-obsidian))] px-6"
    >
      <div className="absolute inset-x-0 top-0 hairline" />
      <div className="absolute inset-x-0 bottom-0 hairline" />

      <div className="mx-auto max-w-[1100px] text-center">
        <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
          · Unit 02 · Manifesto
        </div>
        <h2 className="mt-10 font-display text-[clamp(2rem,5.2vw,4.2rem)] font-medium leading-[1.05] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
          {lines.map((line, i) => (
            <span
              key={i}
              className="relative block overflow-hidden"
            >
              <span
                ref={(el) => (lineRefs.current[i] = el)}
                className="block"
              >
                {line}
              </span>
            </span>
          ))}
        </h2>
        <div className="mt-12 flex items-center justify-center gap-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
          <span>Dell · PowerEdge</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Cisco · Catalyst</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>FortiGate · NGFW</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Proxmox · ZFS</span>
        </div>
      </div>
    </section>
  );
}
