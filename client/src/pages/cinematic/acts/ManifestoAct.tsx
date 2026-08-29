import { useRef } from "react";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

export function ManifestoAct() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const metaRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const scanlineRef = useRef<HTMLDivElement>(null);
  const beaconLeftRef = useRef<HTMLDivElement>(null);
  const beaconRightRef = useRef<HTMLDivElement>(null);

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

      gsap.from(fieldRef.current, {
        opacity: 0,
        scale: 0.96,
        duration: 1.05,
        ease: "power2.out",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 78%",
          end: "bottom 42%",
          toggleActions: "play none none reverse",
        },
      });

      gsap.from(scanlineRef.current, {
        opacity: 0,
        yPercent: 18,
        duration: 0.9,
        ease: "power2.out",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 74%",
          end: "bottom 44%",
          toggleActions: "play none none reverse",
        },
      });

      gsap.from([beaconLeftRef.current, beaconRightRef.current], {
        opacity: 0,
        scaleY: 0.72,
        duration: 0.9,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 72%",
          end: "bottom 42%",
          toggleActions: "play none none reverse",
        },
      });
    },
    [],
  );

  const lines = [
    "Max Doubin is a 10th grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada.",
    "Top 1 percent National Cyber League competitor, Blue Ribbon Commissioner, and real-world systems builder.",
    "Focused on enterprise networking, cybersecurity, systems engineering, community leadership, mentorship, and public service.",
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
        ref={fieldRef}
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, hsl(var(--brand-signal) / 0.09), transparent 30%), radial-gradient(circle at 22% 18%, hsl(var(--brand-cyan) / 0.07), transparent 26%), radial-gradient(circle at 78% 20%, hsl(var(--brand-amber) / 0.06), transparent 24%), radial-gradient(circle at 50% 74%, hsl(var(--brand-cyan) / 0.05), transparent 32%)",
        }}
      />
      <div
        ref={scanlineRef}
        aria-hidden
        className="absolute inset-x-[12vw] top-[40%] h-[18vh]"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-cyan) / 0.08) 38%, hsl(var(--brand-signal) / 0.1) 50%, transparent 100%)",
          filter: "blur(20px)",
        }}
      />
      <div
        ref={beaconLeftRef}
        aria-hidden
        className="absolute left-[10vw] top-[18vh] h-[48vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-cyan) / 0.5) 28%, transparent 100%)",
          boxShadow: "0 0 30px hsl(var(--brand-cyan) / 0.3)",
        }}
      />
      <div
        ref={beaconRightRef}
        aria-hidden
        className="absolute right-[10vw] top-[22vh] h-[42vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-signal) / 0.42) 32%, transparent 100%)",
          boxShadow: "0 0 30px hsl(var(--brand-signal) / 0.28)",
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

      <div className="mx-auto max-w-[1260px] text-center">
        <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
          · Unit 03 · Max Doubin About
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
          <span>Top 1% National Cyber League</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Enterprise Networking</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Cybersecurity</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Systems Engineering</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Blue Ribbon Commissioner</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Community Leadership</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Public Service</span>
        </div>
      </div>
    </section>
  );
}
