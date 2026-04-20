import { useRef } from "react";
import { Link } from "wouter";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

export function CTAAct() {
  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<HTMLDivElement>(null);

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(eyebrowRef.current, {
        opacity: 0,
        y: 12,
        duration: 0.7,
        ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(titleRef.current, {
        opacity: 0,
        y: 40,
        duration: 1.1,
        ease: "power3.out",
        delay: 0.1,
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(subRef.current, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power3.out",
        delay: 0.25,
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(ctaRef.current?.children ?? [], {
        opacity: 0,
        y: 16,
        duration: 0.6,
        stagger: 0.1,
        ease: "power3.out",
        delay: 0.4,
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(sigRef.current, {
        opacity: 0,
        y: 12,
        duration: 0.6,
        ease: "power2.out",
        delay: 0.5,
        scrollTrigger: { trigger: rootRef.current, start: "top 70%", toggleActions: "play none none reverse" },
      });
    },
    [],
  );

  return (
    <section
      ref={rootRef as React.RefObject<HTMLElement>}
      data-scroll-scene="cta"
      data-testid="section-cinematic-cta"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6 py-24 md:px-10"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(var(--brand-graphite)) 0%, hsl(var(--brand-obsidian)) 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron) / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.3) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at center, black 36%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 36%, transparent 82%)",
          opacity: 0.5,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[hsl(var(--brand-signal))] to-transparent opacity-60"
        style={{ boxShadow: "0 0 12px hsl(var(--brand-signal) / 0.8)" }}
      />

      <div className="relative mx-auto max-w-[1100px] text-center">
        <div
          ref={eyebrowRef}
          className="flex items-center justify-center gap-3 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]"
        >
          <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" />
          <span className="text-[hsl(var(--brand-signal))]">· Contact ·</span>
          <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" />
        </div>
        <h2
          ref={titleRef}
          className="mt-10 font-display text-[clamp(2.4rem,6.4vw,5.6rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
        >
          Connect with Max Doubin.
          <br />
          <span className="signal-text">Projects, mentorship, speaking, and collaboration.</span>
        </h2>
        <p
          ref={subRef}
          className="mx-auto mt-8 max-w-[58ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base"
        >
          For project opportunities, student technology programs, speaking, mentorship, public-interest work, or technical collaboration, reach out directly by email or review current work through the project archive and GitHub.
        </p>

        <div
          ref={ctaRef}
          className="mt-12 flex flex-wrap items-center justify-center gap-4"
        >
          <a
            href="mailto:max@maxdoubin.com"
            data-testid="button-cta-email"
            className="group relative inline-flex h-12 items-center gap-3 overflow-hidden rounded-full border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-obsidian))] transition-transform hover:scale-[1.02]"
            style={{ boxShadow: "0 0 32px hsl(var(--brand-signal) / 0.4)" }}
          >
            <span
              className="h-[7px] w-[7px] rounded-full bg-[hsl(var(--brand-obsidian))]"
              style={{ boxShadow: "0 0 6px hsl(var(--brand-obsidian) / 0.8)" }}
            />
            max@maxdoubin.com
            <span className="ml-1 translate-x-0 transition-transform group-hover:translate-x-1">
              →
            </span>
          </a>
          <Link
            href="/projects"
            data-testid="button-cta-projects"
            className="inline-flex h-12 items-center gap-3 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-bone))]"
          >
            Review Projects
            <span>→</span>
          </Link>
          <a
            href="https://github.com/MaxFromYT/Server-Builder"
            target="_blank"
            rel="noreferrer noopener"
            data-testid="button-cta-github"
            className="inline-flex h-12 items-center gap-3 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-bone))]"
          >
            GitHub
            <span>↗</span>
          </a>
          <Link
            href="/blog"
            data-testid="button-cta-blog"
            className="inline-flex h-12 items-center gap-3 rounded-full border border-transparent bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
          >
            Field Notes
          </Link>
        </div>

        <div
          ref={sigRef}
          className="mt-16 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]"
        >
          <span>Max Doubin</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>South CTA · Las Vegas</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span>Top 1% NCL</span>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <a
            href="https://instagram.com/maxdoubin"
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-[hsl(var(--brand-bone))]"
            data-testid="link-cta-instagram"
          >
            @maxdoubin
          </a>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <a
            href="https://instagram.com/percussionmax"
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-[hsl(var(--brand-bone))]"
            data-testid="link-cta-percussionmax"
          >
            @percussionmax
          </a>
          <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
          <span className="text-[hsl(var(--brand-signal))]">signal · open</span>
        </div>
      </div>
    </section>
  );
}
