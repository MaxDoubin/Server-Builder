import { Suspense, lazy, Component, type ReactNode } from "react";
import { Maximize2, Minimize2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { GameProvider } from "@/lib/game-context";
import { BuildProvider } from "@/lib/build-context";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

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
        <div className="flex h-full items-center justify-center bg-black/90">
          <div className="text-center max-w-md px-6">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
            <h2 className="mt-4 text-lg font-semibold text-white">
              WebGL Required
            </h2>
            <p className="mt-2 text-sm text-white/60">
              The Hyperscale game needs WebGL to run. Please try a browser that supports hardware-accelerated 3D graphics.
            </p>
          </div>
        </div>
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
    <div className="flex h-full items-center justify-center bg-black/90">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        <p className="mt-4 text-sm text-white/60">Loading Hyperscale...</p>
      </div>
    </div>
  );
}

export function GamePage() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (isFullscreen) {
    return (
      <GameProvider>
        <BuildProvider>
          <div className="fixed inset-0 z-50 bg-black">
            <button
              onClick={() => setIsFullscreen(false)}
              className="fixed top-4 right-4 z-[60] rounded-lg bg-black/60 p-2 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
              aria-label="Exit fullscreen"
              data-testid="button-exit-fullscreen"
            >
              <Minimize2 className="h-5 w-5" />
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

        <div className="h-[70vh] min-h-[500px] bg-black">
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
      </main>
      <Footer />
    </div>
  );
}
