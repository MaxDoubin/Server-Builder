import { Suspense, lazy, Component, type ErrorInfo, type ReactNode, useMemo, useState } from "react";
import { Maximize2, Minimize2, AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { GameProvider } from "@/lib/game-context";
import { BuildProvider } from "@/lib/build-context";
import { useSEO } from "@/lib/useSEO";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { SiteLoader } from "@/components/ui/site-loader";
import { detectWebGLSupport, type WebGLSupportState } from "@/lib/webgl-support";
import { logError } from "@/lib/error-log";

function GameFallbackPanel({
  support,
  error,
  onRetry,
}: {
  support: WebGLSupportState;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const unsupported = !support.supported;
  const title = unsupported ? "WebGL unavailable" : "3D scene failed to load";
  const body = unsupported
    ? support.reason
    : "The interactive datacenter hit a startup error. This is not automatically a WebGL support problem, so a retry is worth trying first.";

  return (
    <div className="relative flex h-full min-h-[500px] items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6 text-[hsl(var(--brand-bone))]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 18%, hsl(var(--brand-cyan) / 0.14), transparent 28%), radial-gradient(circle at 82% 16%, hsl(var(--brand-signal) / 0.12), transparent 24%), linear-gradient(180deg, rgba(2, 6, 23, 0.18) 0%, rgba(2, 6, 23, 0.88) 100%)",
        }}
      />
      <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(148,163,184,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] bg-[size:72px_72px]" />

      <div className="relative w-full max-w-[620px] overflow-hidden rounded-[28px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.9),hsl(var(--brand-obsidian)/0.82))] px-6 py-7 shadow-[0_30px_120px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl md:px-8 md:py-8">
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-signal)),transparent)] opacity-80" />

        <div className="flex items-center gap-3 font-techno text-[10px] uppercase tracking-[0.42em] text-[hsl(var(--brand-signal))]">
          <AlertTriangle className="h-4 w-4" />
          Interactive Lab Status
        </div>
        <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
          {title}
        </h2>
        <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {body}
        </p>

        {error?.message && !unsupported && (
          <div className="mt-5 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            <span className="text-[hsl(var(--brand-bone-dim))]">Technical detail:</span> {error.message}
          </div>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          {!unsupported && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-signal)/.4)] bg-[hsl(var(--brand-signal)/.08)] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-signal)/.14)]"
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-cyan)/.35)] bg-[hsl(var(--brand-cyan)/.08)] px-4 py-2 font-mono-tight text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-cyan)/.14)]"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}

class GameErrorBoundary extends Component<
  {
    children: ReactNode;
    support: WebGLSupportState;
    onRetry: () => void;
  },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: {
    children: ReactNode;
    support: WebGLSupportState;
    onRetry: () => void;
  }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError("Interactive datacenter scene failed to render.", error, {
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.hasError) {
      return (
        <GameFallbackPanel
          support={this.props.support}
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}

const DataCenter3D = lazy(() =>
  import("@/pages/datacenter-3d").then((module) => ({ default: module.DataCenter3D })),
);

function GameLoading() {
  return (
    <SiteLoader
      eyebrow="Max Doubin Interactive Lab"
      title="Launching the datacenter"
      detail="Bringing the build environment, rack systems, and controls online."
      status="Loading game"
    />
  );
}

export function GamePage() {
  /*
    This route had no SEO call, so it kept whatever head the previous route
    left behind, the same problem /legacy had. The canonical points at
    /game because this is the legacy presentation of the same simulator and
    the two should not be indexed separately.
  */
  useSEO({
    title: "Hyperscale Simulator | Max Doubin",
    description:
      "An interactive 3D data center simulator: design racks, place equipment, and watch power, thermals and network load respond.",
    canonical: "https://maxdoubin.com/game",
    ogType: "website",
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sceneNonce, setSceneNonce] = useState(0);
  const webglSupport = useMemo(() => detectWebGLSupport(), []);

  const handleRetryScene = () => {
    setSceneNonce((prev) => prev + 1);
  };

  const sceneShell = !webglSupport.supported ? (
    <GameFallbackPanel support={webglSupport} />
  ) : (
    <GameErrorBoundary support={webglSupport} onRetry={handleRetryScene}>
      <Suspense fallback={<GameLoading />}>
        <DataCenter3D key={sceneNonce} />
      </Suspense>
    </GameErrorBoundary>
  );

  if (isFullscreen) {
    return (
      <GameProvider>
        <BuildProvider>
          <div data-print-hide className="fixed inset-0 z-50 bg-black">
            <button
              onClick={() => setIsFullscreen(false)}
              className="fixed top-4 right-4 z-[60] rounded-lg bg-black/60 p-2 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
              aria-label="Exit fullscreen"
              data-testid="button-exit-fullscreen"
            >
              <Minimize2 className="h-5 w-5" />
            </button>
            {sceneShell}
          </div>
        </BuildProvider>
      </GameProvider>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main id="main-content">
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-game-title">
                Hyperscale: Data Center Architect
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Design, build, and operate hyper-realistic data centers. Explore the 3D environment,
                inspect racks, and scale from 1 to 500 racks.
              </p>
            </div>
            <button
              onClick={() => setIsFullscreen(true)}
              className="hidden items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
              data-testid="button-fullscreen"
            >
              <Maximize2 className="h-4 w-4" /> Fullscreen
            </button>
          </div>
        </div>

        <div className="relative h-[70vh] min-h-[500px] bg-black">
          <GameProvider>
            <BuildProvider>{sceneShell}</BuildProvider>
          </GameProvider>
        </div>
      </main>
      <Footer />
    </div>
  );
}
