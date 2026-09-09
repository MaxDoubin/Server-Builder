import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SmoothScrollProvider } from "@/lib/motion/SmoothScrollProvider";
import { Preloader } from "./Preloader";
import { CinematicNav } from "./CinematicNav";
import { CinematicFooter } from "./CinematicFooter";
import { CommandPalette } from "./CommandPalette";

interface Props {
  children: ReactNode;
  /** Suppress preloader (for nested route transitions, etc.) */
  skipPreloader?: boolean;
  /** Omit the standard footer (for game / immersive pages). */
  hideFooter?: boolean;
  /**
   * Omit the site navigation.
   *
   * The nav is `fixed top-0`, so on a page that renders its own header in
   * normal flow the two occupy the same strip and their text overlaps into
   * something unreadable. Immersive pages that carry their own navigation
   * opt out here.
   */
  hideNav?: boolean;
  /** Disable Lenis smooth-scroll (useful when embedding interactive 3D). */
  disableSmoothScroll?: boolean;
  /**
   * Keep this page on the dark palette whatever the theme says.
   *
   * For a page whose content is a full-bleed 3D scene with its own text
   * composited over it. A light palette cannot recolour a dark rack: it
   * turns the text near-black and leaves it sitting on the scene, which is
   * how the home page read at every scroll position when the light theme
   * first reached it. Measured: the canvas there covers 100% of the
   * viewport, against 55% on /racks/wired and 41% on /teardown, where the
   * canvas is a panel inside a normal page and the light theme is fine.
   */
  pinDark?: boolean;
  /**
   * This page opens with a full bleed image behind the navigation.
   *
   * The nav is transparent until scrolled, so on these pages its links sit
   * on a photograph and need their own plate and a brighter color. See the
   * note on CinematicNav.
   */
  overHero?: boolean;
}

/** Marks that the boot sequence has already played in this tab. */
const BOOTED_KEY = "cinematic-booted";

export function CinematicLayout({
  children,
  skipPreloader = false,
  hideFooter = false,
  hideNav = false,
  disableSmoothScroll = false,
  pinDark = false,
  overHero = false,
}: Props) {
  /*
    Once per visit, not once per page.

    This was component state, and every route mounts its own layout, so
    clicking a link in the navigation replayed the whole boot sequence over
    a page the reader had already asked for: measured at 5.8 seconds going
    from /tools to /racks, 2.6 to /gear, 2.2 to /blog. A first impression
    that plays again every time you click something is not a first
    impression, it is an interstitial.

    sessionStorage rather than a module level flag, so it also survives a
    reload of the same tab, and rather than localStorage, so a visitor
    coming back tomorrow still gets the entrance the site was designed
    around. Wrapped, because storage throws outright in some privacy modes
    and a loading screen is not worth a blank page.
  */
  const [bootedOnce, setBootedOnce] = useState(() => {
    try {
      return sessionStorage.getItem(BOOTED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const markBooted = () => {
    setBootedOnce(true);
    try {
      sessionStorage.setItem(BOOTED_KEY, "1");
    } catch {
      /* Then it plays again next navigation, which is the old behavior. */
    }
  };

  useEffect(() => {
    document.documentElement.classList.add("cinematic-active");
    return () => document.documentElement.classList.remove("cinematic-active");
  }, []);

  return (
    <SmoothScrollProvider disabled={disableSmoothScroll}>
      <div
        className={`cinematic cinematic-grain relative min-h-screen overflow-hidden bg-[hsl(var(--brand-obsidian))] text-[hsl(var(--brand-bone))]${
          pinDark ? " cinematic-pin-dark" : ""
        }`}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[-8vw] top-[-10vh] h-[34rem] w-[34rem] rounded-full bg-[hsl(var(--brand-cyan)/0.08)] blur-3xl animate-aurora-drift" />
          <div className="absolute right-[-6vw] top-[14vh] h-[30rem] w-[30rem] rounded-full bg-[hsl(var(--brand-signal)/0.07)] blur-3xl animate-panel-float" />
          <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(148,163,184,0.24)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:72px_72px] animate-telemetry-drift" />
          <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,hsl(var(--brand-cyan)/0.08),transparent_62%)]" />
        </div>
        <a
          href="#main-content"
          data-testid="link-skip-to-content"
          data-nosnippet
          data-print-hide
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:border focus:border-[hsl(var(--brand-signal))] focus:bg-[hsl(var(--brand-obsidian))] focus:px-4 focus:py-2 focus:font-mono-tight focus:text-xs focus:uppercase focus:tracking-[0.28em] focus:text-[hsl(var(--brand-signal))] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[hsl(var(--brand-signal))]"
        >
          Skip to content
        </a>
        {/*
          Portalled to <body>, not rendered here.

          Every route renders inside .route-fade, which animates opacity from
          0 to 1 over 380ms. Opacity below 1 composites the whole subtree as
          one group, so while that runs the entrance animation was being
          faded in by the route transition rather than being the first thing
          on screen. Caught by reading the ancestor chain during boot: the
          preloader sat under a .route-fade measured at opacity 0, then
          0.88, then 1.

          Portalled, the chain above it is body and html, both at opacity 1,
          so its own fixed position and z-index answer to the viewport and
          nothing dims it on the way in. Everything else stays here, because
          whether it plays at all is a property of the page: the 404 skips
          it, and sessionStorage remembers that this tab has seen it.
        */}
        {!skipPreloader &&
          !bootedOnce &&
          createPortal(<Preloader onDone={markBooted} />, document.body)}
        {!hideNav && <CinematicNav overHero={overHero} />}
        {/*
          Outside the nav, because the palette has to work on the pages that
          hide the nav too, and because it is a dialog over the whole page
          rather than a piece of the header.
        */}
        <CommandPalette />
        <main id="main-content" className="relative">
          {children}
        </main>
        {!hideFooter && <CinematicFooter />}
      </div>
    </SmoothScrollProvider>
  );
}
