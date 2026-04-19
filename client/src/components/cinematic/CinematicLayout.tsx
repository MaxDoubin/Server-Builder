import { useEffect, useState, type ReactNode } from "react";
import { SmoothScrollProvider } from "@/lib/motion/SmoothScrollProvider";
import { Preloader } from "./Preloader";
import { CinematicNav } from "./CinematicNav";
import { CinematicFooter } from "./CinematicFooter";

interface Props {
  children: ReactNode;
  /** Suppress preloader (for nested route transitions, etc.) */
  skipPreloader?: boolean;
  /** Omit the standard footer (for game / immersive pages). */
  hideFooter?: boolean;
  /** Disable Lenis smooth-scroll (useful when embedding interactive 3D). */
  disableSmoothScroll?: boolean;
}

export function CinematicLayout({
  children,
  skipPreloader = false,
  hideFooter = false,
  disableSmoothScroll = false,
}: Props) {
  const [bootedOnce, setBootedOnce] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("cinematic-active");
    return () => document.documentElement.classList.remove("cinematic-active");
  }, []);

  return (
    <SmoothScrollProvider disabled={disableSmoothScroll}>
      <div className="cinematic cinematic-grain relative min-h-screen overflow-hidden bg-[hsl(var(--brand-obsidian))] text-[hsl(var(--brand-bone))]">
        <a
          href="#main-content"
          data-testid="link-skip-to-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:border focus:border-[hsl(var(--brand-signal))] focus:bg-[hsl(var(--brand-obsidian))] focus:px-4 focus:py-2 focus:font-mono-tight focus:text-xs focus:uppercase focus:tracking-[0.28em] focus:text-[hsl(var(--brand-signal))] focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[hsl(var(--brand-signal))]"
        >
          Skip to content
        </a>
        {!skipPreloader && !bootedOnce && (
          <Preloader onDone={() => setBootedOnce(true)} />
        )}
        <CinematicNav />
        <main id="main-content" className="relative">
          {children}
        </main>
        {!hideFooter && <CinematicFooter />}
      </div>
    </SmoothScrollProvider>
  );
}
