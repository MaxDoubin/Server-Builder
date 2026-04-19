import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Maximize2, Minimize2, AlertTriangle } from "lucide-react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { GameProvider } from "@/lib/game-context";
import { BuildProvider } from "@/lib/build-context";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

const DataCenter3D = lazy(() =>
  import("@/pages/datacenter-3d").then((module) => ({ default: module.DataCenter3D })),
);

class GameErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center bg-[hsl(var(--brand-obsidian))]">
          <div className="max-w-md px-6 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-[hsl(var(--brand-warning,36_100%_60%))]" />
            <div className="mt-6 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
              · Error · WebGL
            </div>
            <h2 className="mt-3 font-display text-2xl font-medium text-[hsl(var(--brand-bone))]">
              Hardware acceleration required.
            </h2>
            <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The simulator needs WebGL to render. Try a browser with hardware-accelerated 3D graphics enabled.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function GameLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-[hsl(var(--brand-obsidian))]">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--brand-signal))] border-t-transparent" />
        <div className="mt-5 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
          · Boot · Simulator
        </div>
        <p className="mt-2 font-mono-tight text-xs uppercase tracking-[0.22em] text-[hsl(var(--brand-bone-dim))]">
          loading hyperscale...
        </p>
      </div>
    </div>
  );
}

const SITE_URL = "https://maxdoubin.com";

export function CinematicGame() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useSEO({
    title: "Hyperscale Simulator | Max Doubin",
    description:
      "Hyperscale Data Center Architect — design, build, and operate hyper-realistic data centers. Explore the 3D environment, inspect racks, and scale from 1 to 500 racks.",
    canonical: `${SITE_URL}/game`,
  });

  if (isFullscreen) {
    return (
      <GameProvider>
        <BuildProvider>
          <div className="fixed inset-0 z-50 bg-[hsl(var(--brand-obsidian))]">
            <button
              onClick={() => setIsFullscreen(false)}
              data-testid="button-exit-fullscreen"
              aria-label="Exit fullscreen"
              className="fixed right-4 top-4 z-[60] inline-flex h-10 items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.7)] px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] backdrop-blur-md transition-colors hover:border-[hsl(var(--brand-signal)/.6)]"
            >
              <Minimize2 className="h-4 w-4" />
              Exit
            </button>
            <GameErrorBoundary>
              <Suspense fallback={<GameLoading />}>
                <DataCenter3D />
              </Suspense>
            </GameErrorBoundary>
          </div>
        </BuildProvider>
      </GameProvider>
    );
  }

  return (
    <CinematicLayout disableSmoothScroll hideFooter>
      <GameBriefing onLaunchFullscreen={() => setIsFullscreen(true)} />
      <div
        data-testid="game-canvas-container"
        className="relative h-[calc(100vh-theme(spacing.16))] min-h-[520px] w-full border-t border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]"
      >
        <GameProvider>
          <BuildProvider>
            <GameErrorBoundary>
              <Suspense fallback={<GameLoading />}>
                <DataCenter3D />
              </Suspense>
            </GameErrorBoundary>
          </BuildProvider>
        </GameProvider>
      </div>
    </CinematicLayout>
  );
}

function GameBriefing({ onLaunchFullscreen }: { onLaunchFullscreen: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setShown(false), 20_000);
    return () => window.clearTimeout(t);
  }, []);

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(headingRef.current, { opacity: 0, y: 20, duration: 0.6, ease: "power3.out" });
      gsap.from(metaRef.current?.children ?? [], {
        opacity: 0,
        y: 12,
        stagger: 0.06,
        duration: 0.5,
        delay: 0.15,
        ease: "power3.out",
      });
    },
    [],
  );

  if (!shown) return null;

  return (
    <div
      ref={rootRef}
      data-testid="game-briefing"
      className="relative border-b border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] pt-16"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron) / 0.22) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.22) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
          opacity: 0.6,
        }}
      />

      <div className="relative mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-10 md:flex-row md:items-end md:justify-between md:gap-10 md:px-10 md:py-14">
        <div className="max-w-[58ch]">
          <div className="flex items-center gap-3 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
            <span
              className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
              style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
            />
            · NOC · Live
            <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" aria-hidden />
            <Link
              href="/"
              data-testid="link-briefing-home"
              className="text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← Portfolio
            </Link>
          </div>
          <h1
            ref={headingRef}
            data-testid="text-game-title"
            className="mt-5 font-display text-[clamp(2rem,4.8vw,3.8rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]"
          >
            Hyperscale. <span className="signal-text">A simulator you can touch.</span>
          </h1>
          <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
            Procedural datacenter with 500 racks. Place equipment, watch load,
            scale the hall. Everything renders at rack-level fidelity.
          </p>

          <div
            ref={metaRef}
            className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
          >
            <span>1 → 500 racks</span>
            <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" aria-hidden />
            <span>Procedural seed</span>
            <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" aria-hidden />
            <span>Autosave · rollback</span>
            <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" aria-hidden />
            <span>WebGL 2</span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end">
          <button
            onClick={onLaunchFullscreen}
            data-testid="button-fullscreen"
            className="group inline-flex h-11 items-center gap-3 rounded-full border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-obsidian))] transition-transform hover:scale-[1.02]"
            style={{ boxShadow: "0 0 24px hsl(var(--brand-signal) / 0.35)" }}
          >
            <Maximize2 className="h-4 w-4" />
            Launch fullscreen
            <span className="translate-x-0 transition-transform group-hover:translate-x-1">
              →
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShown(false)}
            data-testid="button-collapse-briefing"
            className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
          >
            Hide briefing →
          </button>
        </div>
      </div>
    </div>
  );
}
