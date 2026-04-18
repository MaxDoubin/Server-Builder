import { useEffect, useState, type ReactNode } from "react";
import { SmoothScrollProvider } from "@/lib/motion/SmoothScrollProvider";
import { Preloader } from "./Preloader";
import { CinematicNav } from "./CinematicNav";
import { CinematicFooter } from "./CinematicFooter";

interface Props {
  children: ReactNode;
  /** Suppress preloader (for nested route transitions, etc.) */
  skipPreloader?: boolean;
}

export function CinematicLayout({ children, skipPreloader = false }: Props) {
  const [bootedOnce, setBootedOnce] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("cinematic-active");
    return () => document.documentElement.classList.remove("cinematic-active");
  }, []);

  return (
    <SmoothScrollProvider>
      <div className="cinematic cinematic-grain relative min-h-screen overflow-hidden bg-[hsl(var(--brand-obsidian))] text-[hsl(var(--brand-bone))]">
        {!skipPreloader && !bootedOnce && (
          <Preloader onDone={() => setBootedOnce(true)} />
        )}
        <CinematicNav />
        <main id="main-content" className="relative">
          {children}
        </main>
        <CinematicFooter />
      </div>
    </SmoothScrollProvider>
  );
}
