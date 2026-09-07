import { Link } from "wouter";
import { PRESS } from "@/lib/siteConfig";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  ScrollReveal,
  StaggerGroup,
  StaggerItem,
  fadeUp,
  fadeLeft,
  fadeRight,
  DrawLine,
  Magnetic,
  AnimatedGradientText,
  Breathing,
  FloatingParticles,
  useClampedInView,
} from "@/lib/framer-animations";

const footerLinkVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

export function CinematicFooter() {
  const year = new Date().getFullYear();
  const footerRef = useRef<HTMLElement>(null);
  const isInView = useClampedInView(footerRef, 0.15, true);

  return (
    <footer
      ref={footerRef}
      className="relative border-t border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] text-[hsl(var(--brand-bone-dim))] overflow-hidden"
    >
      <FloatingParticles count={12} color="hsl(72 100% 50% / 0.3)" maxSize={2} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px hairline" />
      <DrawLine color="hsl(72 100% 50%)" className="relative z-10" delay={0.3} />

      <div
        data-nosnippet
        className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-6 py-20 md:grid-cols-12 md:px-10"
      >
        <div className="md:col-span-5">
          <ScrollReveal variants={fadeLeft} delay={0.1}>
            <div className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              Max Doubin · Las Vegas, NV
            </div>
          </ScrollReveal>
          <ScrollReveal variants={fadeUp} delay={0.2}>
            {/*
              h2, not h3. The footer is a top level region of every page, and
              this is its heading, so a level two is what it is. As an h3 it
              was the only heading between the page h1 and nothing on pages
              whose body has no h2 of its own, which made the outline of the
              simulator page read h1 then h3 with a level missing. Nothing
              about how it looks changed.
            */}
            <h2 className="mt-4 max-w-md font-display text-3xl font-medium leading-[1.05] tracking-tight text-[hsl(var(--brand-bone))] md:text-4xl">
              Cybersecurity, enterprise networking, systems infrastructure, percussion, and community leadership.
            </h2>
          </ScrollReveal>
          <ScrollReveal variants={fadeUp} delay={0.35}>
            <Magnetic strength={0.15} radius={120}>
              <motion.a
                href="mailto:max@maxdoubin.com"
                data-testid="link-footer-email"
                className="mt-6 inline-flex min-h-[24px] items-center gap-3 py-1 font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone))]"
                whileHover={{ x: 6, color: "hsl(72 100% 50%)" }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <span>max@maxdoubin.com</span>
                <motion.span
                  aria-hidden
                  className="inline-block h-px w-8 bg-[hsl(var(--brand-signal))]"
                  animate={{ width: [32, 48, 32] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.a>
            </Magnetic>
          </ScrollReveal>
        </div>

        <div className="md:col-span-3">
          <ScrollReveal variants={fadeUp} delay={0.25}>
            <div className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              Navigate
            </div>
          </ScrollReveal>
          <StaggerGroup className="mt-4 space-y-2 font-mono-tight text-sm" staggerDelay={0.06} delayChildren={0.3}>
            {[
              { href: "/#dossier", label: "Dossier", testId: "link-footer-dossier" },
              { href: "/projects", label: "Projects", testId: "link-footer-projects" },
              { href: "/blog", label: "Field Notes", testId: "link-footer-blog" },
              { href: "/topics", label: "Topics", testId: "link-footer-topics" },
              { href: "/archive", label: "Archive", testId: "link-footer-archive" },
              { href: "/tools", label: "Tools", testId: "link-footer-tools" },
              { href: "/ncl", label: "NCL guides", testId: "link-footer-ncl" },
              { href: "/game", label: "Build Simulator", testId: "link-footer-game" },
              { href: "/contact", label: "Contact", testId: "link-footer-contact-2" },
            ].map((item) => (
              <StaggerItem key={item.href} variants={footerLinkVariants}>
                <Magnetic strength={0.1} radius={60}>
                  <motion.div
                    whileHover={{ x: 8, color: "hsl(var(--brand-bone))" }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Link href={item.href} className="inline-block py-1 hover:text-[hsl(var(--brand-bone))]" data-testid={item.testId}>
                      {item.label}
                    </Link>
                  </motion.div>
                </Magnetic>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>

        <div className="md:col-span-2">
          <ScrollReveal variants={fadeUp} delay={0.28}>
            <div className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              About
            </div>
          </ScrollReveal>
          <StaggerGroup className="mt-4 space-y-2 font-mono-tight text-sm" staggerDelay={0.06} delayChildren={0.32}>
            {[
              { href: "/now", label: "Now", testId: "link-footer-now" },
              { href: "/resume", label: "Resume", testId: "link-footer-resume" },
              { href: "/timeline", label: "Timeline", testId: "link-footer-timeline" },
              { href: "/certifications", label: "Certifications", testId: "link-footer-certs" },
              { href: "/cyber-club", label: "Cyber Club", testId: "link-footer-club" },
              { href: "/cyber-club/kit", label: "Start a cyber club", testId: "link-footer-club-kit" },
              { href: "/coding-camps", label: "Coding camps", testId: "link-footer-camps" },
              { href: "/faq", label: "FAQ", testId: "link-footer-faq" },
              { href: "/uses", label: "Uses", testId: "link-footer-uses" },
              { href: "/subscribe", label: "Subscribe", testId: "link-footer-subscribe" },
              { href: "/colophon", label: "Colophon", testId: "link-footer-colophon" },
              { href: "/roadmap", label: "Roadmap", testId: "link-footer-roadmap" },
            ].map((item) => (
              <StaggerItem key={item.href} variants={footerLinkVariants}>
                <Magnetic strength={0.1} radius={60}>
                  <motion.div
                    whileHover={{ x: 8, color: "hsl(var(--brand-bone))" }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Link href={item.href} className="inline-block py-1 hover:text-[hsl(var(--brand-bone))]" data-testid={item.testId}>
                      {item.label}
                    </Link>
                  </motion.div>
                </Magnetic>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>

        <div className="md:col-span-2">
          <ScrollReveal variants={fadeRight} delay={0.3}>
            <div className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              Elsewhere
            </div>
          </ScrollReveal>
          <StaggerGroup className="mt-4 grid grid-cols-1 gap-2 font-mono-tight text-sm" staggerDelay={0.08} delayChildren={0.35}>
            {[
              { href: "https://github.com/MaxDoubin/Server-Builder", label: "GitHub · MaxDoubin/Server-Builder", testId: "link-footer-github" },
              { href: "https://instagram.com/maxdoubin", label: "Instagram · @maxdoubin", testId: "link-footer-instagram" },
              { href: PRESS.url, label: `${PRESS.outlet} · Press feature`, testId: "link-footer-press" },
              { href: "mailto:max@maxdoubin.com", label: "max@maxdoubin.com", testId: "link-footer-email-2" },
            ].map((item) => (
              <StaggerItem key={item.testId} variants={footerLinkVariants}>
                <Magnetic strength={0.1} radius={60}>
                  <motion.div
                    whileHover={{ x: 8, color: "hsl(var(--brand-bone))" }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <a
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noreferrer noopener" : undefined}
                      className="inline-block py-1 hover:text-[hsl(var(--brand-bone))]"
                      data-testid={item.testId}
                    >
                      {item.label}
                      {/* These three throw the reader into a new tab with no
                          visible sign that they will. Say so in the name, the
                          way the suggest-an-edit link already does. */}
                      {item.href.startsWith("http") && (
                        <span className="sr-only"> (opens in a new tab)</span>
                      )}
                    </a>
                  </motion.div>
                </Magnetic>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </div>

      <motion.div
        className="border-t border-[hsl(var(--brand-iron)/.6)]"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.6 }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-6 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] md:px-10">
          <motion.span
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.7, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            © {year} Max Doubin
          </motion.span>
          <motion.span
            className="flex items-center gap-2"
            initial={{ opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.8, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <Breathing intensity={2}>
              <span
                className="h-[5px] w-[5px] rounded-full bg-[hsl(var(--brand-signal))]"
                style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
              />
            </Breathing>
            <AnimatedGradientText>All systems operational</AnimatedGradientText>
          </motion.span>
        </div>
      </motion.div>
    </footer>
  );
}
