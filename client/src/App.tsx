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
import { ScrollProgressBar, CursorGlow } from "@/lib/framer-animations";

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

/**
 * The legacy profile page. Lazy like every other legacy route.
 *
 * It was a static import, and it imports blogPosts, so the full text of the
 * whole archive was linked into the entry chunk. Every visitor downloaded
 * every post before the landing page could run.
 */
const Home = lazyWithRetry(() =>
  import("@/pages/Home").then((module) => ({ default: module.Home })),
);

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

/**
 * Route transition — opacity only, deliberately.
 *
 * This wrapper is an ancestor of every page, including the pinned
 * scroll scenes (SystemsAct pins for ~900vh). GSAP pins by setting
 * `position: fixed` on the section, and a fixed element resolves
 * against its nearest ancestor that establishes a containing block.
 * `transform`, `filter`, `backdrop-filter`, `perspective`, `contain`
 * and `will-change` on any of those properties all create one.
 *
 * Framer Motion leaves the animated property on the element after the
 * transition finishes, so a `filter: blur(0px)` here silently turns
 * this div into the containing block for the whole app. The pinned
 * hero then scrolls away with the page instead of staying put, and the
 * scroll story plays out off-screen.
 *
 * Opacity does not create a containing block, so it is safe. Do not
 * add `y`, `scale`, `blur`, or `will-change` to these variants.
 */
/**
 * The route fade is CSS, not JavaScript, and that is deliberate.
 *
 * This used to be a Framer `motion.div` animating `initial: {opacity: 0}` to
 * `animate: {opacity: 1}`. Every route except `/` is a `React.lazy` chunk
 * behind Suspense, and Suspense sits *inside* the animating element. Framer
 * wrote the initial `opacity: 0` to the DOM, the child then suspended, and
 * the enter animation never started. It never recovered either: the wrapper
 * held `opacity: 0` indefinitely, so the page rendered, laid out, and was
 * completely invisible. Clicking any nav link gave a blank screen.
 *
 * A keyframe cannot fail that way. It is owned by the compositor, not by a
 * React lifecycle, and `opacity: 1` is the element's natural state, so the
 * worst case for the animation not running is that the page simply appears.
 * A page transition is decoration; it must never be the thing that decides
 * whether the site is visible.
 */
function AnimatedRoutes() {
  const [location] = useLocation();

  return (
    <div key={location} className="route-fade">
        <Switch>
          <Route path="/" component={CinematicHome} />
          <Route path="/legacy">
            <Suspense fallback={<RouteLoading />}>
              <Home />
            </Suspense>
          </Route>
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
    </div>
  );
}
