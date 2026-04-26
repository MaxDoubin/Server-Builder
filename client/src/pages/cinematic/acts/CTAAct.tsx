import { useRef } from "react";
import { Link } from "wouter";
import { useScrollReveal } from "@/lib/motion/useScrollScene";
import {
  motion,
  useInView,
  ScrollReveal,
  StaggerGroup,
  StaggerItem,
  fadeUp,
  blurIn,
  Magnetic,
  WordReveal,
  ScrambleText,
  DrawLine,
  FloatingParticles,
  MorphingBlob,
  OrbitingParticles,
  AnimatedGradientText,
  PulseGlow,
  Breathing,
  ParallaxFloat,
} from "@/lib/framer-animations";

const ctaButtonVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export function CTAAct() {
  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<HTMLDivElement>(null);
  const sectionInView = useInView(rootRef, { once: true, amount: 0.2 });

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(eyebrowRef.current, {
        opacity: 0, y: 12, duration: 0.7, ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(titleRef.current, {
        opacity: 0, y: 40, duration: 1.1, ease: "power3.out", delay: 0.1,
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(subRef.current, {
        opacity: 0, y: 20, duration: 0.8, ease: "power3.out", delay: 0.25,
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(ctaRef.current?.children ?? [], {
        opacity: 0, y: 16, duration: 0.6, stagger: 0.1, ease: "power3.out", delay: 0.4,
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(sigRef.current, {
        opacity: 0, y: 12, duration: 0.6, ease: "power2.out", delay: 0.5,
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
      <FloatingParticles count={25} color="hsl(72 100% 50% / 0.4)" maxSize={3} />
      <FloatingParticles count={15} color="hsl(180 85% 62% / 0.3)" maxSize={2} />

      <ParallaxFloat speed={0.15} direction="up" className="absolute left-[10%] top-[15%]">
        <MorphingBlob color="hsl(72 100% 50% / 0.06)" size={500} duration={10} />
      </ParallaxFloat>
      <ParallaxFloat speed={0.2} direction="down" className="absolute right-[5%] bottom-[10%]">
        <MorphingBlob color="hsl(180 85% 62% / 0.05)" size={400} duration={12} />
      </ParallaxFloat>

      <div aria-hidden className="absolute inset-0 opacity-60" style={{ background: "radial-gradient(ellipse at center, hsl(var(--brand-graphite)) 0%, hsl(var(--brand-obsidian)) 70%)" }} />

      <ParallaxFloat speed={0.08} direction="up">
        <div aria-hidden className="absolute inset-0" style={{ backgroundImage: "linear-gradient(hsl(var(--brand-iron) / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.3) 1px, transparent 1px)", backgroundSize: "56px 56px", maskImage: "radial-gradient(ellipse at center, black 36%, transparent 82%)", WebkitMaskImage: "radial-gradient(ellipse at center, black 36%, transparent 82%)", opacity: 0.5 }} />
      </ParallaxFloat>

      <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[hsl(var(--brand-signal))] to-transparent" style={{ boxShadow: "0 0 12px hsl(var(--brand-signal) / 0.8)" }} animate={{ opacity: [0.3, 0.8, 0.3], scaleX: [0.8, 1, 0.8] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />

      <div className="relative mx-auto max-w-[1100px] text-center">
        <OrbitingParticles count={12} radius={280} color="hsl(72 100% 50% / 0.5)" particleSize={2} duration={20} className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />

        <div ref={eyebrowRef}>
          <ScrollReveal variants={blurIn} delay={0.1}>
            <div className="flex items-center justify-center gap-3 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
              <motion.span className="h-px w-10 bg-[hsl(var(--brand-iron))]" initial={{ scaleX: 0 }} animate={sectionInView ? { scaleX: 1 } : {}} transition={{ duration: 0.8, delay: 0.2 }} />
              <span className="text-[hsl(var(--brand-signal))]"><ScrambleText text="· Contact ·" scrambleDuration={1} /></span>
              <motion.span className="h-px w-10 bg-[hsl(var(--brand-iron))]" initial={{ scaleX: 0 }} animate={sectionInView ? { scaleX: 1 } : {}} transition={{ duration: 0.8, delay: 0.3 }} />
            </div>
          </ScrollReveal>
        </div>

        <div ref={titleRef}>
          <h2 className="mt-10 font-display text-[clamp(2.4rem,6.4vw,5.6rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]">
            <WordReveal text="Connect with Max Doubin." delay={0.2} staggerDelay={0.05} />
            <br />
            <span className="signal-text">
              <AnimatedGradientText>
                <WordReveal text="Projects, mentorship, speaking, and collaboration." delay={0.6} staggerDelay={0.04} />
              </AnimatedGradientText>
            </span>
          </h2>
        </div>

        <div ref={subRef}>
          <ScrollReveal variants={fadeUp} delay={0.5}>
            <p className="mx-auto mt-8 max-w-[58ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
              For project opportunities, student technology programs, speaking, mentorship, public-interest work, or technical collaboration, reach out directly by email or review current work through the project archive and GitHub.
            </p>
          </ScrollReveal>
        </div>

        <DrawLine color="hsl(72 100% 50% / 0.4)" className="mx-auto mt-10 max-w-[200px]" delay={0.7} />

        <StaggerGroup className="mt-12 flex flex-wrap items-center justify-center gap-4" staggerDelay={0.1} delayChildren={0.6}>
          <StaggerItem variants={ctaButtonVariants}>
            <PulseGlow color="hsl(72 100% 50%)">
              <Magnetic strength={0.2} radius={150}>
                <motion.a href="mailto:max@maxdoubin.com" data-testid="button-cta-email" className="group relative inline-flex h-12 items-center gap-3 overflow-hidden rounded-full border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-obsidian))]" style={{ boxShadow: "0 0 32px hsl(var(--brand-signal) / 0.4)" }} whileHover={{ scale: 1.06, boxShadow: "0 0 48px hsl(72 100% 50% / 0.6)" }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
                  <Breathing intensity={1.5}><span className="h-[7px] w-[7px] rounded-full bg-[hsl(var(--brand-obsidian))]" style={{ boxShadow: "0 0 6px hsl(var(--brand-obsidian) / 0.8)" }} /></Breathing>
                  max@maxdoubin.com
                  <motion.span className="ml-1" animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>→</motion.span>
                </motion.a>
              </Magnetic>
            </PulseGlow>
          </StaggerItem>

          <StaggerItem variants={ctaButtonVariants}>
            <Magnetic strength={0.15} radius={120}>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                <Link href="/projects" data-testid="button-cta-projects" className="inline-flex h-12 items-center gap-3 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-bone))]">Review Projects<span>→</span></Link>
              </motion.div>
            </Magnetic>
          </StaggerItem>

          <StaggerItem variants={ctaButtonVariants}>
            <Magnetic strength={0.15} radius={120}>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                <a href="https://github.com/MaxFromYT/Server-Builder" target="_blank" rel="noreferrer noopener" data-testid="button-cta-github" className="inline-flex h-12 items-center gap-3 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-bone))]">
                  GitHub<motion.span animate={{ rotate: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>↗</motion.span>
                </a>
              </motion.div>
            </Magnetic>
          </StaggerItem>

          <StaggerItem variants={ctaButtonVariants}>
            <Magnetic strength={0.1} radius={100}>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Link href="/blog" data-testid="button-cta-blog" className="inline-flex h-12 items-center gap-3 rounded-full border border-transparent bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]">Field Notes</Link>
              </motion.div>
            </Magnetic>
          </StaggerItem>
        </StaggerGroup>

        <motion.div ref={sigRef} initial={{ opacity: 0, y: 20 }} animate={sectionInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 1.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <DrawLine color="hsl(var(--brand-iron) / 0.4)" className="mx-auto mt-12 max-w-[400px]" delay={1} />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
            <motion.span whileHover={{ color: "hsl(var(--brand-bone))" }}>Max Doubin</motion.span>
            <motion.span className="h-px w-8 bg-[hsl(var(--brand-iron))]" animate={{ width: [32, 48, 32] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
            <motion.span whileHover={{ color: "hsl(var(--brand-bone))" }}>South CTA · Las Vegas</motion.span>
            <motion.span className="h-px w-8 bg-[hsl(var(--brand-iron))]" animate={{ width: [32, 48, 32] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} />
            <motion.span whileHover={{ color: "hsl(var(--brand-bone))" }}>Top 1% NCL</motion.span>
            <motion.span className="h-px w-8 bg-[hsl(var(--brand-iron))]" animate={{ width: [32, 48, 32] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }} />
            <motion.a href="https://instagram.com/maxdoubin" target="_blank" rel="noreferrer noopener" whileHover={{ color: "hsl(72 100% 50%)", scale: 1.05 }} data-testid="link-cta-instagram">@maxdoubin</motion.a>
            <motion.span className="h-px w-8 bg-[hsl(var(--brand-iron))]" animate={{ width: [32, 48, 32] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} />
            <motion.a href="https://instagram.com/percussionmax" target="_blank" rel="noreferrer noopener" whileHover={{ color: "hsl(72 100% 50%)", scale: 1.05 }} data-testid="link-cta-percussionmax">@percussionmax</motion.a>
            <motion.span className="h-px w-8 bg-[hsl(var(--brand-iron))]" animate={{ width: [32, 48, 32] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 2 }} />
            <PulseGlow color="hsl(72 100% 50%)"><span className="text-[hsl(var(--brand-signal))]"><ScrambleText text="signal · open" scrambleDuration={0.8} /></span></PulseGlow>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
