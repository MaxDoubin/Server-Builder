import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Link } from "wouter";
import { Gauge, Layers3, Maximize2, Minimize2, Shield, Sparkles } from "lucide-react";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { GameRecoveryPanel } from "@/components/game/GameRecoveryPanel";
import { SiteLoader } from "@/components/ui/site-loader";
import { GameProvider } from "@/lib/game-context";
import { BuildProvider } from "@/lib/build-context";
import { logError } from "@/lib/error-log";
import {
  detectWebGLSupport,
  getDowngradedRenderProfile,
  getRecommendedRenderProfile,
  type GameRenderProfile,
  type WebGLSupportState,
} from "@/lib/webgl-support";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

const DataCenter3D = lazy(() =>
  import("@/pages/datacenter-3d").then((module) => ({ default: module.DataCenter3D })),
);

class GameRuntimeBoundary extends Component<
  {
    children: ReactNode;
    support: WebGLSupportState;
    profile: GameRenderProfile;
    onRetry: () => void;
    onDowngrade?: () => void;
  },
  { error: Error | null }
> {
  constructor(props: {
    children: ReactNode;
    support: WebGLSupportState;
    profile: GameRenderProfile;
    onRetry: () => void;
    onDowngrade?: () => void;
  }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError("Interactive lab failed to initialize.", error, {
      profile: this.props.profile,
      webglTier: this.props.support.tier,
      renderer: this.props.support.renderer,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  handleDowngrade = () => {
    this.setState({ error: null });
    this.props.onDowngrade?.();
  };

  render() {
    if (this.state.error) {
      return (
        <GameRecoveryPanel
          support={this.props.support}
          profile={this.props.profile}
          error={this.state.error}
          onRetry={this.handleRetry}
          onDowngrade={this.props.onDowngrade ? this.handleDowngrade : undefined}
        />
      );
    }

    return this.props.children;
  }
}

function GameLoading() {
  return (
    <SiteLoader
      eyebrow="Max Doubin Interactive Lab"
      title="Launching the datacenter"
      detail="Establishing the adaptive renderer, rack systems, and live controls."
      status="Booting 3D scene"
    />
  );
}

const SITE_URL = "https://maxdoubin.com";

export function CinematicGame() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const support = useMemo(() => detectWebGLSupport(), []);
  const [profile, setProfile] = useState<GameRenderProfile>(() =>
    getRecommendedRenderProfile(support),
  );
  const [sceneNonce, setSceneNonce] = useState(0);

  useSEO({
    title: "Hyperscale Simulator | Max Doubin",
    description:
      "Hyperscale Data Center Architect: design, build, and operate hyper-realistic data centers. Explore the 3D environment, inspect racks, and scale from 1 to 500 racks.",
    canonical: `${SITE_URL}/game`,
  });

  const downgradeTarget = getDowngradedRenderProfile(profile);

  const handleRetryScene = () => {
    setSceneNonce((prev) => prev + 1);
  };

  const handleDowngrade = () => {
    if (!downgradeTarget) return;
    setProfile(downgradeTarget);
    setSceneNonce((prev) => prev + 1);
  };

  const sceneShell = !support.supported ? (
    <GameRecoveryPanel support={support} profile={profile} />
  ) : (
    <GameRuntimeBoundary
      support={support}
      profile={profile}
      onRetry={handleRetryScene}
      onDowngrade={downgradeTarget ? handleDowngrade : undefined}
    >
      <Suspense fallback={<GameLoading />}>
        <DataCenter3D key={`${profile}-${sceneNonce}`} renderProfile={profile} />
      </Suspense>
    </GameRuntimeBoundary>
  );

  if (isFullscreen) {
    return (
      <GameProvider>
        <BuildProvider>
          <div data-print-hide className="fixed inset-0 z-50 bg-[hsl(var(--brand-obsidian))]">
            <button
              onClick={() => setIsFullscreen(false)}
              data-testid="button-exit-fullscreen"
              aria-label="Exit fullscreen"
              className="fixed right-4 top-4 z-[60] inline-flex h-10 items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.7)] px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] backdrop-blur-md transition-colors hover:border-[hsl(var(--brand-signal)/.6)]"
            >
              <Minimize2 className="h-4 w-4" />
              Exit
            </button>
            {sceneShell}
          </div>
        </BuildProvider>
      </GameProvider>
    );
  }

  return (
    <CinematicLayout disableSmoothScroll hideFooter hideNav>
      <GameBriefing
        support={support}
        profile={profile}
        onLaunchFullscreen={() => setIsFullscreen(true)}
        onDowngrade={downgradeTarget ? handleDowngrade : undefined}
      />
      <div
        data-testid="game-canvas-container"
        className="relative h-[calc(100vh-theme(spacing.16))] min-h-[520px] w-full border-t border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]"
      >
        <GameProvider>
          <BuildProvider>{sceneShell}</BuildProvider>
        </GameProvider>
      </div>
    </CinematicLayout>
  );
}

function GameBriefing({
  support,
  profile,
  onLaunchFullscreen,
  onDowngrade,
}: {
  support: WebGLSupportState;
  profile: GameRenderProfile;
  onLaunchFullscreen: () => void;
  onDowngrade?: () => void;
}) {
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
        y: 14,
        stagger: 0.07,
        duration: 0.55,
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
      className="relative overflow-hidden border-b border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] pt-16"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--brand-iron) / 0.22) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.22) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
            opacity: 0.6,
          }}
        />
        <div className="absolute left-[-8vw] top-[-6vh] h-[22rem] w-[22rem] rounded-full bg-[hsl(var(--brand-cyan)/0.12)] blur-3xl animate-aurora-drift" />
        <div className="absolute right-[-5vw] top-[6vh] h-[24rem] w-[24rem] rounded-full bg-[hsl(var(--brand-signal)/0.1)] blur-3xl animate-panel-float" />
      </div>

      <div className="relative mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-10 md:px-10 md:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between md:gap-10">
          <div className="max-w-[62ch]">
            <div className="flex flex-wrap items-center gap-3 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              <span
                className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))] animate-rack-led"
                style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
              />
              · NOC · Live
              <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" aria-hidden />
              <Link
                href="/"
                data-testid="link-briefing-home"
                className="inline-flex min-h-[24px] items-center text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
              >
                ← Portfolio
              </Link>
            </div>
            <h1
              ref={headingRef}
              data-testid="text-game-title"
              className="mt-5 font-display text-[clamp(2rem,4.8vw,3.8rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]"
            >
              Hyperscale. <span className="signal-text">An adaptive simulator built to recover.</span>
            </h1>
            <p className="mt-4 max-w-[58ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
              The interactive lab now boots through an adaptive render ladder with safer startup profiles, smoother camera motion, and graceful recovery when a device cannot sustain the full cinematic pass.
            </p>

            <div
              ref={metaRef}
              className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
            >
              <span>{profile} profile</span>
              <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" aria-hidden />
              <span>{support.tier === "webgl2" ? "WebGL 2" : support.tier === "webgl1" ? "WebGL 1" : "Fallback"}</span>
              <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" aria-hidden />
              <span>Runtime recovery</span>
              <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" aria-hidden />
              <span>Rack-level detail</span>
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
            {onDowngrade && (
              <button
                type="button"
                onClick={onDowngrade}
                className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.08)] px-4 py-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-cyan)/0.14)]"
              >
                <Gauge className="h-4 w-4" />
                Prefer safer mode
              </button>
            )}
            <button
              type="button"
              onClick={() => setShown(false)}
              data-testid="button-collapse-briefing"
              className="inline-flex min-h-[24px] items-center font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              Hide briefing →
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <BriefingCard
            icon={<Layers3 className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />}
            title="Adaptive Profiles"
            body="Cinematic, balanced, and compatibility profiles let the game step down gracefully instead of failing at first render."
          />
          <BriefingCard
            icon={<Shield className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />}
            title="Recovery Path"
            body="Runtime errors now surface actionable recovery controls instead of a blanket WebGL message, with retry and safer-mode fallbacks."
          />
          <BriefingCard
            icon={<Sparkles className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />}
            title="Motion Pass"
            body="The shell, loader, and camera choreography were upgraded to feel smoother, more atmospheric, and more aligned with the rest of the site."
          />
        </div>
      </div>
    </div>
  );
}

function BriefingCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.82),hsl(var(--brand-obsidian)/0.74))] p-5 backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2">{icon}<div className="font-techno text-[10px] uppercase tracking-[0.34em] text-[hsl(var(--brand-signal))]">{title}</div></div>
      <p className="text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">{body}</p>
    </div>
  );
}
