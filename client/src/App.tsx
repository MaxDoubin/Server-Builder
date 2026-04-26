import {
  Component,
  Suspense,
  lazy,
  useEffect,
  type ComponentType,
  type ErrorInfo,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { disposePooledAssets } from "@/lib/asset-pool";
import { AnimatePresence, motion } from "framer-motion";
import { ScrollProgressBar, CursorGlow } from "@/lib/framer-animations";

import { Home } from "@/pages/Home";
import { CinematicHome } from "@/pages/cinematic/CinematicHome";
import { SiteLoader } from "@/components/ui/site-loader";

/**
 * Chunk loading is fragile right after a deploy: the browser may still be
 * holding a stale HTML reference while the bundler has already swapped out
 * the hashed chunk paths, which makes the first dynamic import fail with a
 * generic "Loading chunk X failed" error. We retry transparently a few
 * times with short backoff before surfacing any error, so the user never
 * has to click "reload" on cold load.
 */
function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  retries = 3,
  delayMs = 250,
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await loader();
      } catch (error) {
        lastError = error;
        if (attempt === retries) break;
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs * Math.pow(2, attempt)),
        );
      }
    }
    throw lastError;
  });
}

const Blog = lazyWithRetry(() =>
  import("@/pages/Blog").then((module) => ({ default: module.Blog })),
);

const BlogPost = lazyWithRetry(() =>
  import("@/pages/BlogPost").then((module) => ({ default: module.BlogPost })),
);

const Projects = lazyWithRetry(() =>
  import("@/pages/Projects").then((module) => ({ default: module.Projects })),
);

const Contact = lazyWithRetry(() =>
  import("@/pages/Contact").then((module) => ({ default: module.Contact })),
);

const CinematicProjects = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicProjects").then((module) => ({
    default: module.CinematicProjects,
  })),
);

const CinematicBlog = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicBlog").then((module) => ({
    default: module.CinematicBlog,
  })),
);

const CinematicBlogPost = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicBlogPost").then((module) => ({
    default: module.CinematicBlogPost,
  })),
);

const CinematicContact = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicContact").then((module) => ({
    default: module.CinematicContact,
  })),
);

const GamePage = lazyWithRetry(() =>
  import("@/pages/GamePage").then((module) => ({ default: module.GamePage })),
);

const CinematicGame = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicGame").then((module) => ({
    default: module.CinematicGame,
  })),
);

const CinematicNotFound = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicNotFound").then((module) => ({
    default: module.CinematicNotFound,
  })),
);

function GameLoading() {
  return (
    <SiteLoader
      eyebrow="Max Doubin Interactive Lab"
      title="Launching the game"
      detail="Preparing the 3D datacenter, controls, and live systems overlays."
      status="Loading interactive scene"
    />
  );
}

function RouteLoading() {
  return (
    <SiteLoader
      eyebrow="Max Doubin Profile"
      title="Loading page"
      detail="Bringing the next section online."
      status="Routing"
    />
  );
}

type RouteChunkBoundaryProps = {
  children: ReactNode;
};

type RouteChunkBoundaryState = {
  hasError: boolean;
  retryKey: number;
  autoRetriesLeft: number;
};

/**
 * Route-level error boundary that first tries to *transparently* recover
 * from a chunk load failure by forcing a remount of the lazy tree, and
 * only surfaces a user-visible failure UI if remounting also fails.
 *
 * Combined with `lazyWithRetry` above, the user should never see the
 * reload button for a transient first-load network blip.
 */
class RouteChunkBoundary extends Component<
  RouteChunkBoundaryProps,
  RouteChunkBoundaryState
> {
  state: RouteChunkBoundaryState = {
    hasError: false,
    retryKey: 0,
    autoRetriesLeft: 1,
  };

  static getDerivedStateFromError(): Partial<RouteChunkBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Route chunk failed to load", error, errorInfo);
    // Try once to recover silently by remounting the subtree.
    if (this.state.autoRetriesLeft > 0) {
      setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          retryKey: prev.retryKey + 1,
          autoRetriesLeft: prev.autoRetriesLeft - 1,
        }));
      }, 400);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6">
          <div className="max-w-md rounded-xl border border-white/10 bg-[#111] p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-12 w-12 text-red-500/80">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Application Error</h2>
            <p className="mt-2 text-sm text-gray-400">
              We encountered a problem loading the site resources. This usually
              happens due to a temporary connection issue.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#111]"
            >
              Reload Website
            </button>
          </div>
        </div>
      );
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

export default function App() {
  useEffect(() => {
    const handleUnload = () => disposePooledAssets();
    window.addEventListener("beforeunload", handleUnload);

    // Idle-prefetch the most likely next routes so clicking Projects / Blog
    // / Contact doesn't show the skeleton loader on first navigation. Ties
    // into the retry helper — prefetch failures are silent.
    const idle = (cb: () => void) => {
      const ric = (window as unknown as {
        requestIdleCallback?: (fn: () => void) => number;
      }).requestIdleCallback;
      if (typeof ric === "function") ric(cb);
      else setTimeout(cb, 1500);
    };
    idle(() => {
      void import("@/pages/cinematic/CinematicProjects");
      void import("@/pages/cinematic/CinematicBlog");
      void import("@/pages/cinematic/CinematicContact");
    });

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      disposePooledAssets();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="hyperscale-theme">
          <ScrollProgressBar color="hsl(72 100% 50%)" />
          <CursorGlow color="hsl(72 100% 50% / 0.06)" size={400} />
          <Router>
            <RouteChunkBoundary>
              <AnimatedRoutes />
            </RouteChunkBoundary>
          </Router>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const pageTransition = {
  initial: { opacity: 0, y: 12, filter: "blur(6px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: "blur(3px)",
    transition: { duration: 0.3, ease: [0.65, 0, 0.35, 1] },
  },
};

function AnimatedRoutes() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageTransition}
      >
        <Switch>
          <Route path="/" component={CinematicHome} />
          <Route path="/legacy" component={Home} />
          <Route path="/legacy/blog">
            <Suspense fallback={<RouteLoading />}>
              <Blog />
            </Suspense>
          </Route>
          <Route path="/legacy/blog/:slug">
            <Suspense fallback={<RouteLoading />}>
              <BlogPost />
            </Suspense>
          </Route>
          <Route path="/legacy/projects">
            <Suspense fallback={<RouteLoading />}>
              <Projects />
            </Suspense>
          </Route>
          <Route path="/legacy/contact">
            <Suspense fallback={<RouteLoading />}>
              <Contact />
            </Suspense>
          </Route>
          <Route path="/blog">
            <Suspense fallback={<RouteLoading />}>
              <CinematicBlog />
            </Suspense>
          </Route>
          <Route path="/blog/:slug">
            <Suspense fallback={<RouteLoading />}>
              <CinematicBlogPost />
            </Suspense>
          </Route>
          <Route path="/projects">
            <Suspense fallback={<RouteLoading />}>
              <CinematicProjects />
            </Suspense>
          </Route>
          <Route path="/contact">
            <Suspense fallback={<RouteLoading />}>
              <CinematicContact />
            </Suspense>
          </Route>
          <Route path="/game">
            <Suspense fallback={<GameLoading />}>
              <CinematicGame />
            </Suspense>
          </Route>
          <Route path="/legacy/game">
            <Suspense fallback={<GameLoading />}>
              <GamePage />
            </Suspense>
          </Route>
          <Route>
            <Suspense fallback={<RouteLoading />}>
              <CinematicNotFound />
            </Suspense>
          </Route>
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}
