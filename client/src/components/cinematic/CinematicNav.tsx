import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
} from "framer-motion";
import { Magnetic, GlitchText } from "@/lib/framer-animations";

const NAV_LINKS = [
  { label: "Index", href: "/" },
  { label: "Dossier", href: "/#dossier" },
  { label: "Projects", href: "/projects" },
  { label: "Field Notes", href: "/blog" },
  { label: "Build", href: "/game" },
  { label: "Contact", href: "/contact" },
];

const navItemVariants = {
  hidden: { opacity: 0, y: -12, filter: "blur(4px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      delay: 0.6 + i * 0.08,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

const logoVariants = {
  hidden: { opacity: 0, x: -20, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const ctaVariants = {
  hidden: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { delay: 1.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

const mobileItemVariants = {
  hidden: { opacity: 0, x: -30, filter: "blur(4px)" },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: {
      delay: i * 0.06,
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
  exit: (i: number) => ({
    opacity: 0,
    x: -20,
    transition: {
      delay: (NAV_LINKS.length - i) * 0.03,
      duration: 0.2,
    },
  }),
};

export function CinematicNav() {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const { scrollYProgress } = useScroll();
  const headerBlur = useTransform(scrollYProgress, [0, 0.02], [0, 12]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <>
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        className={`fixed left-0 right-0 top-0 z-50 transition-[border-color] duration-300 ${
          scrolled || open
            ? "border-b border-[hsl(var(--brand-iron)/.6)]"
            : "border-b border-transparent"
        }`}
        style={{
          backdropFilter: useTransform(headerBlur, (v) => `blur(${Math.max(scrolled ? 12 : 0, v)}px)`),
          backgroundColor: scrolled || open
            ? "hsl(var(--brand-obsidian) / 0.72)"
            : "transparent",
        }}
      >
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 md:px-10">
          <motion.div variants={logoVariants} initial="hidden" animate="visible">
            <Magnetic strength={0.2} radius={100}>
              <Link
                href="/"
                className="group flex min-h-[24px] items-center gap-3 py-1 text-[hsl(var(--brand-bone))]"
                data-testid="link-home-wordmark"
              >
                <motion.span
                  className="relative block h-5 w-5 rounded-sm border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))]"
                  aria-hidden
                  whileHover={{
                    scale: 1.2,
                    rotate: 90,
                    borderColor: "hsl(72 100% 50%)",
                    transition: { type: "spring", stiffness: 400, damping: 15 },
                  }}
                >
                  <motion.span
                    className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--brand-signal))]"
                    style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                    animate={{
                      scale: [1, 1.5, 1],
                      boxShadow: [
                        "0 0 6px hsl(72 100% 50%)",
                        "0 0 16px hsl(72 100% 50%)",
                        "0 0 6px hsl(72 100% 50%)",
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.span>
                <span className="font-techno text-[11px] uppercase tracking-[0.32em]">
                  <GlitchText text="Max Doubin" intensity={0.6} />
                </span>
              </Link>
            </Magnetic>
          </motion.div>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link, i) => {
              const active = isActive(link.href);
              return (
                <motion.div
                  key={link.href}
                  custom={i}
                  variants={navItemVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <Magnetic strength={0.12} radius={80}>
                    <Link
                      href={link.href}
                      data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                      className={`relative px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.22em] transition-colors ${
                        active
                          ? "text-[hsl(var(--brand-bone))]"
                          : "text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                      }`}
                    >
                      <motion.span
                        className="relative"
                        whileHover={{ y: -2 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      >
                        {link.label}
                        <AnimatePresence>
                          {active && (
                            <motion.span
                              className="absolute -bottom-1 left-0 right-0 h-px bg-[hsl(var(--brand-signal))]"
                              style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                              layoutId="nav-underline"
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              exit={{ scaleX: 0 }}
                              transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            />
                          )}
                        </AnimatePresence>
                      </motion.span>
                    </Link>
                  </Magnetic>
                </motion.div>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <motion.div variants={ctaVariants} initial="hidden" animate="visible">
              <Magnetic strength={0.15} radius={120}>
                <motion.div
                  whileHover={{
                    scale: 1.06,
                    boxShadow: "0 0 20px hsl(72 100% 50% / 0.3)",
                  }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  <Link
                    href="/contact"
                    data-testid="button-nav-cta"
                    className="group relative hidden h-9 items-center gap-2 overflow-hidden rounded-full border border-[hsl(var(--brand-signal)/.4)] bg-[hsl(var(--brand-signal)/.06)] px-4 font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-signal)/.12)] sm:inline-flex"
                  >
                    <motion.span
                      className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                      style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                      animate={{ scale: [1, 1.4, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    Get in touch
                    <motion.span
                      className="ml-1"
                      animate={{ x: [0, 3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      →
                    </motion.span>
                  </Link>
                </motion.div>
              </Magnetic>
            </motion.div>

            <motion.button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="cinematic-mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              data-testid="button-nav-toggle"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/.6)] md:hidden"
              whileHover={{ scale: 1.1, borderColor: "hsl(72 100% 50% / 0.6)" }}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              transition={{ delay: 0.8, type: "spring", stiffness: 200, damping: 15 }}
            >
              <span aria-hidden className="relative block h-3 w-5">
                <motion.span
                  className="absolute left-0 right-0 top-0 h-px bg-current"
                  animate={open ? { translateY: 6, rotate: 45 } : { translateY: 0, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
                <motion.span
                  className="absolute left-0 right-0 top-[6px] h-px bg-current"
                  animate={open ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
                  transition={{ duration: 0.2 }}
                />
                <motion.span
                  className="absolute bottom-0 left-0 right-0 h-px bg-current"
                  animate={open ? { translateY: -6, rotate: -45 } : { translateY: 0, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                />
              </span>
            </motion.button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              id="cinematic-mobile-nav"
              data-testid="mobile-nav-drawer"
              className="fixed inset-x-0 top-16 z-40 border-b border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.96)] backdrop-blur-md md:hidden"
              initial={{ opacity: 0, y: -20, clipPath: "inset(0 0 100% 0)" }}
              animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
              exit={{ opacity: 0, y: -10, clipPath: "inset(0 0 100% 0)" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <nav className="mx-auto flex max-w-[1400px] flex-col gap-1 px-6 py-4">
                {NAV_LINKS.map((link, i) => {
                  const active = isActive(link.href);
                  return (
                    <motion.div
                      key={link.href}
                      custom={i}
                      variants={mobileItemVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <Link
                        href={link.href}
                        data-testid={`link-mobile-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                        className={`flex items-center justify-between rounded-md border border-transparent px-4 py-3 font-mono-tight text-[13px] uppercase tracking-[0.22em] transition-colors ${
                          active
                            ? "border-[hsl(var(--brand-signal)/.4)] bg-[hsl(var(--brand-signal)/.08)] text-[hsl(var(--brand-bone))]"
                            : "text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-iron))] hover:text-[hsl(var(--brand-bone))]"
                        }`}
                      >
                        <span>{link.label}</span>
                        {active && (
                          <motion.span
                            className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                            style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                            layoutId="mobile-active-dot"
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          />
                        )}
                      </Link>
                    </motion.div>
                  );
                })}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
