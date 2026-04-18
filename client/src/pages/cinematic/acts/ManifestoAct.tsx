import { useRef } from "react";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

export function ManifestoAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const metaRef = useRef<HTMLDivElement>(null);

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

      gsap.from(metaRef.current, {
        opacity: 0,
        y: 18,
        duration: 0.7,
        ease: "power3.out",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 62%",
          end: "bottom 40%",
          toggleActions: "play none none reverse",
        },
      });
    },
    [],
  );

  const lines = [
    "Max Doubin builds with discipline.",
    "Cybersecurity, systems, and service in one signal.",
    "Every detail earned. Every environment tested. Every result real.",
  ];

  return (
    <section
      ref={rootRef}
      data-scroll-scene="manifesto"
      data-testid="section-cinematic-manifesto"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6"
    >
      <div className="absolute inset-x-0 top-0 hairline" />
      <div className="absolute inset-x-0 bottom-0 hairline" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, hsl(var(--brand-signal) / 0.08), transparent 30%), radial-gradient(circle at 22% 18%, hsl(var(--brand-cyan) / 0.06), transparent 26%), radial-gradient(circle at 78% 20%, hsl(var(--brand-amber) / 0.05), transparent 24%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.2) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage:
            "radial-gradient(circle at center, black 44%, transparent 84%)",
          WebkitMaskImage:
            "radial-gradient(circle at center, black 44%, transparent 84%)",
        }}
      />

      <div className="mx-auto max-w-[1180px] text-center">
        <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
          · Unit 02 · Max Doubin Manifesto
        </div>
        <h2 className="mt-10 font-display text-[clamp(2rem,5.2vw,4.2rem)] font-medium leading-[1.04] tracking-[-0.03em] text-[hsl(var(--brand-bone))]">
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
        <div
          ref={metaRef}
          className="mt-12 flex flex-wrap items-center justify-center gap-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
        >
          <span>Enterprise Networking</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Cybersecurity</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Systems Engineering</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Community Leadership</span>
        </div>
      </div>
    </section>
  );
}
