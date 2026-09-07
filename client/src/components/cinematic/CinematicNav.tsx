import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
} from "framer-motion";
import { Magnetic, GlitchText } from "@/lib/framer-animations";
import { prefetchHandlers } from "@/lib/prefetchOnHover";
import { DisplayMenu } from "@/components/ui/display-menu";

/**
 * Everything the browser will hand a Tab to. Same selector the shortcuts
 * dialog uses, so the two focus loops behave identically.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

const NAV_LINKS = [
  { label: "Index", href: "/" },
  { label: "Dossier", href: "/#dossier" },
  { label: "Projects", href: "/projects" },
  { label: "Field Notes", href: "/blog" },
  { label: "Tools", href: "/tools" },
  { label: "Racks", href: "/racks" },
  { label: "Gear", href: "/gear" },
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

/**
 * @param overHero
 *   This nav is sitting on a full bleed image rather than on the page.
 *
 *   The bar is transparent until you scroll, which is the intent, and on a
 *   page with a cover that puts --brand-ash links straight onto a
 *   photograph. Measured by masking the glyphs and reading the plate behind
 *   them: 1.20:1 in dark and 1.41:1 in light, on fifteen of sixteen heroes.
 *
 *   A darker scrim cannot fix it. Ash is a mid grey at about 0.25 relative
 *   luminance, so 4.5:1 needs a plate below 0.017, which is a solid black
 *   bar and the opposite of the design. The text has to move instead, so on
 *   a hero the inactive links take --brand-bone and the bar takes a gradient
 *   of its own that fades out by its own height.
 *
 *   The plate holds almost to the bottom of the bar rather than fading from
 *   the middle. The wordmark's box is 30px tall against the links' 16, so it
 *   reached into the faded part and measured 2.16:1 while the links beside
 *   it measured 9.19:1. Same bar, same colour, different height.
 *
 *   Scoped rather than global because it is a real change in appearance and
 *   only two pages need it: a post and /projects. Everywhere else the nav
 *   sits on the page's own ground and already measures clean.
 */
export function CinematicNav({ overHero = false }: { overHero?: boolean }) {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const { scrollYProgress } = useScroll();
  const headerBlur = useTransform(scrollYProgress, [0, 0.02], [0, 12]);

  const headerRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

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

  /*
    The open drawer is a scrim across the whole page, so it has to behave
    like one. It did not. Opening it left focus on the hamburger, Tab then
    walked straight past the menu into the links hidden behind the scrim,
    Escape did nothing at all, and closing dropped focus on <body> so the
    next Tab restarted at the top of the document.

    The header stays above the scrim (z-50 against z-30) and remains visible
    and clickable, so the loop spans the header controls and the drawer
    together rather than the drawer alone. That is also why this stays a
    disclosure with aria-expanded instead of becoming an aria-modal dialog:
    the button that closes the menu lives in the header, and aria-modal
    would hide it from assistive tech.
  */
  useEffect(() => {
    if (!open) return;

    const cycle = () =>
      [
        ...Array.from(headerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
        ...Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
        // Anything display:none (the desktop nav, the CTA on a narrow phone)
        // is in the markup but not on screen, so it must not take a Tab.
      ].filter((el) => el.getClientRects().length > 0);

    drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // Whatever is underneath must not also act on this Escape.
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const loop = cycle();
      if (loop.length === 0) return;
      const first = loop[0];
      const last = loop[loop.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const at = active ? loop.indexOf(active) : -1;

      if (at === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      // Focus goes back to the trigger, but only when it is still inside the
      // menu that just closed. Closing by clicking something else on the page
      // must not yank the caret away from whatever the reader moved to.
      const active = document.activeElement;
      if (!active || active === document.body || drawerRef.current?.contains(active)) {
        toggleRef.current?.focus();
      }
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <>
      <motion.header
        ref={headerRef}
        /*
          Site chrome, not content. Printing a post used to put the wordmark,
          the theme toggle, the search badge and the "Get in touch" button
          across the top of page one. The print rule that was meant to stop
          that named `nav`, which is the link list *inside* this header, so
          the header itself kept printing. Twenty pages use <header> for their
          own page title, so the rule cannot simply be widened to `header`.
        */
        data-print-hide
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
          backgroundImage:
            !scrolled && !open && overHero
              ? "linear-gradient(180deg, hsl(var(--brand-obsidian) / 0.95) 0%, hsl(var(--brand-obsidian) / 0.93) 84%, hsl(var(--brand-obsidian) / 0.55) 95%, transparent 100%)"
              : "none",
        }}
      >
        {/*
          Google generates its own snippet when it decides the meta
          description does not answer the query, and it takes that snippet
          from the first text in the rendered DOM. On this site that text
          was the skip link and the whole primary nav, so a search for the
          site's own name returned six sitelinks all captioned "Skip to
          content. Max Doubin ... Index", which describes nothing and reads
          as a broken page.

          data-nosnippet is the documented fix: text inside it is still
          crawled, indexed and followed, it is simply not eligible to be
          quoted in a result. Google honours the attribute on div, span and
          section only, which is why it sits on the inner containers rather
          than on <header> and <footer> themselves.
        */}
        <div
          data-nosnippet
          className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 md:px-10"
        >
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

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
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
                    {...prefetchHandlers(link.href)}
                      aria-current={active ? "page" : undefined}
                      data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                      className={`relative px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.22em] transition-colors ${
                        active
                          ? "text-[hsl(var(--brand-bone))]"
                          : overHero && !scrolled
                            ? "text-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-bone))]"
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
            {/*
              Theme, text size and high contrast, on every page rather than on
              the five legacy routes.

              All three were reachable only from the old navbar, so about 360
              pages had no way to any of them. Text size was the sharpest
              miss: it moves the rem basis on the root element, so it always
              worked here, and the control that sets it was simply somewhere
              else. Theme and high contrast now work here too, since
              .cinematic answers both.

              Not hidden on small screens, unlike the search affordance beside
              it. A reader who needs larger text is most likely to need it on
              a phone.
            */}
            <DisplayMenu testId="button-display-menu-cinematic" />
            {/*
              The palette is keyboard first and nobody discovers a keyboard
              shortcut nobody told them about. This is the telling: it opens
              the same dialog, and it shows the key so the next time is
              faster. Hidden below sm, where the shortcut is meaningless and
              the room is not there.
            */}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("command-palette:open"))
              }
              data-testid="button-nav-search"
              aria-label="Search this site"
              className="hidden h-9 items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/.5)] hover:text-[hsl(var(--brand-bone))] sm:inline-flex"
            >
              {/*
                The word goes below 2xl, the shortcut stays.

                Nine nav links, a search affordance and a call to action
                already overflowed this row at 1280, and adding the display
                control moved that to 1440, which is most laptops. Dropping
                one word buys more room back than the control costs, so the
                row now holds at 1280 as well, better than before either
                change. aria-label on the button already names it, so nothing
                is lost to a screen reader.
              */}
              <span aria-hidden className="hidden 2xl:inline">Search</span>
              <kbd
                aria-hidden
                className="rounded border border-[hsl(var(--brand-iron))] px-1.5 py-0.5 font-techno text-[9px] tracking-[0.12em]"
              >
                ⌘K
              </kbd>
            </button>
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
                    {/* Decoration. Without aria-hidden the link is announced
                        as "Get in touch right arrow". */}
                    <motion.span
                      aria-hidden
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

            {/* The drawn box is 40x40, under the 44px touch target this one
                needs: it exists on phones alone and it is the only way into
                the menu. The pseudo-element grows the hit area to 44 without
                moving the border, the same trick ui/dialog and ui/sheet use
                on their close buttons. */}
            <motion.button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="cinematic-mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
              data-testid="button-nav-toggle"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] transition-colors before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:border-[hsl(var(--brand-signal)/.6)] md:hidden"
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
            {/* A bare div with onClick is not a control. It stays a pointer
                shortcut and is hidden from assistive tech; Escape and the
                toggle are the keyboard routes out. */}
            <motion.div
              aria-hidden
              data-print-hide
              className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              ref={drawerRef}
              id="cinematic-mobile-nav"
              data-testid="mobile-nav-drawer"
              data-print-hide
              className="fixed inset-x-0 top-16 z-40 border-b border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.96)] backdrop-blur-md md:hidden"
              initial={{ opacity: 0, y: -20, clipPath: "inset(0 0 100% 0)" }}
              animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
              exit={{ opacity: 0, y: -10, clipPath: "inset(0 0 100% 0)" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <nav
                aria-label="Site menu"
                className="mx-auto flex max-w-[1400px] flex-col gap-1 px-6 py-4"
              >
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
                    {...prefetchHandlers(link.href)}
                        aria-current={active ? "page" : undefined}
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
