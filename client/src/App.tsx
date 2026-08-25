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
import { disposePooledAssets } from "@/lib/asset-pool-dispose";
import { installLinkPrefetching } from "@/lib/prefetchOnHover";
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

/**
 * Operations dashboards.
 *
 * These are complete pages (NOC, network, floor, incidents, build) that had
 * no route. The only way in was a set of game-header tabs pointing at
 * /noc, /network and friends, none of which the router defined, so every
 * one of them landed on the 404 page and the dashboards themselves were
 * unreachable dead code. They are routed now, wrapped in the same
 * providers the game uses since they read from game state.
 */
const NocDashboard = lazyWithRetry(() =>
  import("@/pages/noc-dashboard").then((m) => ({ default: m.NocDashboard })),
);
const NetworkDashboard = lazyWithRetry(() =>
  import("@/pages/network-dashboard").then((m) => ({ default: m.NetworkDashboard })),
);
const FloorDashboard = lazyWithRetry(() =>
  import("@/pages/floor-dashboard").then((m) => ({ default: m.FloorDashboard })),
);
const IncidentsDashboard = lazyWithRetry(() =>
  import("@/pages/incidents-dashboard").then((m) => ({ default: m.IncidentsDashboard })),
);
const BuildDashboard = lazyWithRetry(() =>
  import("@/pages/build-dashboard").then((m) => ({ default: m.BuildDashboard })),
);

/**
 * Topic hubs and the roadmap.
 *
 * /topics/:tag rather than /blog/tag/:tag, so a topic can never be
 * mistaken for a post slug by the router.
 */
const CinematicTopics = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicTopics").then((m) => ({
    default: m.CinematicTopics,
  })),
);
const CinematicTag = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicTag").then((m) => ({
    default: m.CinematicTag,
  })),
);
const CinematicRoadmap = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicRoadmap").then((m) => ({
    default: m.CinematicRoadmap,
  })),
);

/**
 * Standalone pages.
 *
 * Each is lazy for the same reason every other route is: none of them
 * should cost anything to a visitor who never opens them.
 */
const CinematicArchive = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicArchive").then((m) => ({ default: m.CinematicArchive })),
);
const CinematicPaths = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicPaths").then((m) => ({ default: m.CinematicPaths })),
);
const CinematicNow = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicNow").then((m) => ({ default: m.CinematicNow })),
);
const CinematicUses = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicUses").then((m) => ({ default: m.CinematicUses })),
);
const CinematicResume = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicResume").then((m) => ({ default: m.CinematicResume })),
);
const CinematicTimeline = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicTimeline").then((m) => ({ default: m.CinematicTimeline })),
);
const CinematicCyberClub = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicCyberClub").then((m) => ({ default: m.CinematicCyberClub })),
);
const CinematicCamps = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicCamps").then((m) => ({ default: m.CinematicCamps })),
);
const CinematicColophon = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicColophon").then((m) => ({ default: m.CinematicColophon })),
);
const CinematicFaq = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicFaq").then((m) => ({ default: m.CinematicFaq })),
);
const CinematicLinks = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicLinks").then((m) => ({ default: m.CinematicLinks })),
);
const CinematicSubscribe = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicSubscribe").then((m) => ({ default: m.CinematicSubscribe })),
);
const CinematicStudyTimer = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicStudyTimer").then((m) => ({ default: m.CinematicStudyTimer })),
);
const CinematicAsk = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicAsk").then((m) => ({ default: m.CinematicAsk })),
);
const CinematicChangelog = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicChangelog").then((m) => ({ default: m.CinematicChangelog })),
);

/** Browser utilities. One chunk each, so /tools costs nothing until used. */
const SubnetCalculator = lazyWithRetry(() =>
  import("@/pages/tools/SubnetCalculator").then((m) => ({ default: m.SubnetCalculator })),
);
const RackBudget = lazyWithRetry(() =>
  import("@/pages/tools/RackBudget").then((m) => ({ default: m.RackBudget })),
);
const VlsmPractice = lazyWithRetry(() =>
  import("@/pages/tools/VlsmPractice").then((m) => ({ default: m.VlsmPractice })),
);
const CidrVisualizer = lazyWithRetry(() =>
  import("@/pages/tools/CidrVisualizer").then((m) => ({ default: m.CidrVisualizer })),
);
const PacketHeaders = lazyWithRetry(() =>
  import("@/pages/tools/PacketHeaders").then((m) => ({ default: m.PacketHeaders })),
);
const PortReference = lazyWithRetry(() =>
  import("@/pages/tools/PortReference").then((m) => ({ default: m.PortReference })),
);
const WiresharkFilters = lazyWithRetry(() =>
  import("@/pages/tools/WiresharkFilters").then((m) => ({ default: m.WiresharkFilters })),
);
const DnsRecords = lazyWithRetry(() =>
  import("@/pages/tools/DnsRecords").then((m) => ({ default: m.DnsRecords })),
);
const MacLookup = lazyWithRetry(() =>
  import("@/pages/tools/MacLookup").then((m) => ({ default: m.MacLookup })),
);
const ChmodCalculator = lazyWithRetry(() =>
  import("@/pages/tools/ChmodCalculator").then((m) => ({ default: m.ChmodCalculator })),
);
const CronExplainer = lazyWithRetry(() =>
  import("@/pages/tools/CronExplainer").then((m) => ({ default: m.CronExplainer })),
);
const RegexTester = lazyWithRetry(() =>
  import("@/pages/tools/RegexTester").then((m) => ({ default: m.RegexTester })),
);
const HttpStatusCodes = lazyWithRetry(() =>
  import("@/pages/tools/HttpStatusCodes").then((m) => ({ default: m.HttpStatusCodes })),
);
const EncoderDecoder = lazyWithRetry(() =>
  import("@/pages/tools/EncoderDecoder").then((m) => ({ default: m.EncoderDecoder })),
);
const BaseConverter = lazyWithRetry(() =>
  import("@/pages/tools/BaseConverter").then((m) => ({ default: m.BaseConverter })),
);
const ClassicalCiphers = lazyWithRetry(() =>
  import("@/pages/tools/ClassicalCiphers").then((m) => ({ default: m.ClassicalCiphers })),
);
const HashIdentifier = lazyWithRetry(() =>
  import("@/pages/tools/HashIdentifier").then((m) => ({ default: m.HashIdentifier })),
);
const CinematicTools = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicTools").then((m) => ({ default: m.CinematicTools })),
);

/** Competition study material. */
const CinematicNcl = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicNcl").then((m) => ({ default: m.CinematicNcl })),
);
const CinematicNclGuide = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicNclGuide").then((m) => ({ default: m.CinematicNclGuide })),
);
const CinematicFlashcards = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicFlashcards").then((m) => ({ default: m.CinematicFlashcards })),
);
const CinematicCerts = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicCerts").then((m) => ({ default: m.CinematicCerts })),
);

const CinematicData = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicData").then((m) => ({ default: m.CinematicData })),
);

const CinematicStudy = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicStudy").then((m) => ({ default: m.CinematicStudy })),
);
const CinematicStudyDomain = lazyWithRetry(() =>
  import("@/pages/cinematic/CinematicStudyDomain").then((m) => ({
    default: m.CinematicStudyDomain,
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

    // Warm the chunk behind any internal link the pointer or keyboard
    // reaches. Delegated from the document, so every link is covered
    // without each one having to opt in.
    const stopPrefetching = installLinkPrefetching();

    // Idle-prefetch the most likely next routes so clicking Projects / Blog
    // / Contact doesn't show the skeleton loader on first navigation. Ties
    // into the retry helper, so prefetch failures are silent.
    const idle = (cb: () => void) => {
      const ric = (window as unknown as {
        requestIdleCallback?: (fn: () => void) => number;
      }).requestIdleCallback;
      if (typeof ric === "function") ric(cb);
      else setTimeout(cb, 1500);
    };
    idle(() => {
      // Not CinematicBlog: it imports the post archive, so prefetching it
      // speculatively pulls over a megabyte on every visit to the home page,
      // including from people who never open the blog. It loads on
      // navigation like any other route.
      void import("@/pages/cinematic/CinematicProjects");
      void import("@/pages/cinematic/CinematicContact");
    });

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      stopPrefetching();
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
 * Route transition. Opacity only, deliberately.
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
/**
 * Scroll to an in-page anchor after a client-side navigation.
 *
 * The nav links to "/#dossier". A fresh page load honours that, but wouter
 * pushes history without scrolling, so clicking Dossier from the site
 * changed the URL and left the reader at the top of an 8000px page with no
 * indication anything had happened.
 *
 * The target is inside a lazily loaded act behind a pinned scroll scene, so
 * it may not exist yet when the click lands. Poll briefly for it, then give
 * up rather than scrolling somewhere arbitrary.
 */
function useHashScroll() {
  const [location] = useLocation();

  useEffect(() => {
    scrollToHash();
  }, [location]);

  // wouter pushes history without firing hashchange, and a same-page hash
  // link does not change the path either, so neither the router nor the
  // browser tells us anything. Watch the URL directly.
  useEffect(() => {
    let last = window.location.hash;
    const check = () => {
      if (window.location.hash !== last) {
        last = window.location.hash;
        scrollToHash();
      }
    };
    const id = window.setInterval(check, 120);
    window.addEventListener("hashchange", check);
    window.addEventListener("popstate", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("hashchange", check);
      window.removeEventListener("popstate", check);
    };
  }, []);
}

function scrollToHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  let attempts = 0;
  const tryScroll = () => {
    const el = document.getElementById(hash);
    if (el) {
      const reduced = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      el.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
      return;
    }
    // The target can sit inside a lazily loaded act, so wait for it rather
    // than giving up on the first miss. Four seconds, then stop, instead of
    // scrolling somewhere arbitrary.
    if (attempts++ < 40) window.setTimeout(tryScroll, 100);
  };
  window.setTimeout(tryScroll, 60);
}

/** Dashboards read live game state, so they need the same providers the game mounts. */
/**
 * The simulator's state providers, loaded with the routes that need them.
 *
 * These were static imports. game-context reaches save-system, which imports
 * a runtime zod schema, so the whole of zod (151KB) sat in the entry chunk
 * and every reader of the blog downloaded the save system for a simulator
 * they never opened. Only the five ops dashboards mount these.
 */
const GameProvider = lazyWithRetry(() =>
  import("@/lib/game-context").then((m) => ({ default: m.GameProvider })),
);
const BuildProvider = lazyWithRetry(() =>
  import("@/lib/build-context").then((m) => ({ default: m.BuildProvider })),
);

function OpsRoute({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<GameLoading />}>
      <GameProvider>
        <BuildProvider>{children}</BuildProvider>
      </GameProvider>
    </Suspense>
  );
}

function AnimatedRoutes() {
  const [location] = useLocation();
  useHashScroll();

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
          <Route path="/ncl">
            <Suspense fallback={<RouteLoading />}>
              <CinematicNcl />
            </Suspense>
          </Route>
          <Route path="/ncl/:slug">
            <Suspense fallback={<RouteLoading />}>
              <CinematicNclGuide />
            </Suspense>
          </Route>
          <Route path="/flashcards">
            <Suspense fallback={<RouteLoading />}>
              <CinematicFlashcards />
            </Suspense>
          </Route>
          <Route path="/certifications">
            <Suspense fallback={<RouteLoading />}>
              <CinematicCerts />
            </Suspense>
          </Route>
          <Route path="/archive">
            <Suspense fallback={<RouteLoading />}>
              <CinematicArchive />
            </Suspense>
          </Route>
          <Route path="/paths">
            <Suspense fallback={<RouteLoading />}>
              <CinematicPaths />
            </Suspense>
          </Route>
          <Route path="/now">
            <Suspense fallback={<RouteLoading />}>
              <CinematicNow />
            </Suspense>
          </Route>
          <Route path="/uses">
            <Suspense fallback={<RouteLoading />}>
              <CinematicUses />
            </Suspense>
          </Route>
          <Route path="/resume">
            <Suspense fallback={<RouteLoading />}>
              <CinematicResume />
            </Suspense>
          </Route>
          <Route path="/timeline">
            <Suspense fallback={<RouteLoading />}>
              <CinematicTimeline />
            </Suspense>
          </Route>
          <Route path="/cyber-club">
            <Suspense fallback={<RouteLoading />}>
              <CinematicCyberClub />
            </Suspense>
          </Route>
          <Route path="/coding-camps">
            <Suspense fallback={<RouteLoading />}>
              <CinematicCamps />
            </Suspense>
          </Route>
          <Route path="/colophon">
            <Suspense fallback={<RouteLoading />}>
              <CinematicColophon />
            </Suspense>
          </Route>
          <Route path="/faq">
            <Suspense fallback={<RouteLoading />}>
              <CinematicFaq />
            </Suspense>
          </Route>
          <Route path="/links">
            <Suspense fallback={<RouteLoading />}>
              <CinematicLinks />
            </Suspense>
          </Route>
          <Route path="/subscribe">
            <Suspense fallback={<RouteLoading />}>
              <CinematicSubscribe />
            </Suspense>
          </Route>
          <Route path="/study-timer">
            <Suspense fallback={<RouteLoading />}>
              <CinematicStudyTimer />
            </Suspense>
          </Route>
          <Route path="/ask">
            <Suspense fallback={<RouteLoading />}>
              <CinematicAsk />
            </Suspense>
          </Route>
          <Route path="/changelog">
            <Suspense fallback={<RouteLoading />}>
              <CinematicChangelog />
            </Suspense>
          </Route>
          {/*
            Tool routes are listed explicitly rather than resolved from the
            registry through one dynamic import. A single import() with a
            variable specifier makes Rollup bundle every tool into one
            chunk, which would put all sixteen on the wire the moment
            anybody opened one of them.
          */}
          <Route path="/tools">
            <Suspense fallback={<RouteLoading />}>
              <CinematicTools />
            </Suspense>
          </Route>
          <Route path="/tools/hash-identifier">
            <Suspense fallback={<RouteLoading />}>
              <HashIdentifier />
            </Suspense>
          </Route>
          <Route path="/tools/rack-budget">
            <Suspense fallback={<RackBudget />}>
              <RackBudget />
            </Suspense>
          </Route>
          <Route path="/tools/subnet-calculator">
            <Suspense fallback={<RouteLoading />}>
              <SubnetCalculator />
            </Suspense>
          </Route>
          <Route path="/tools/vlsm-practice">
            <Suspense fallback={<RouteLoading />}>
              <VlsmPractice />
            </Suspense>
          </Route>
          <Route path="/tools/cidr-visualizer">
            <Suspense fallback={<RouteLoading />}>
              <CidrVisualizer />
            </Suspense>
          </Route>
          <Route path="/tools/packet-headers">
            <Suspense fallback={<RouteLoading />}>
              <PacketHeaders />
            </Suspense>
          </Route>
          <Route path="/tools/port-reference">
            <Suspense fallback={<RouteLoading />}>
              <PortReference />
            </Suspense>
          </Route>
          <Route path="/tools/wireshark-filters">
            <Suspense fallback={<RouteLoading />}>
              <WiresharkFilters />
            </Suspense>
          </Route>
          <Route path="/tools/dns-records">
            <Suspense fallback={<RouteLoading />}>
              <DnsRecords />
            </Suspense>
          </Route>
          <Route path="/tools/mac-lookup">
            <Suspense fallback={<RouteLoading />}>
              <MacLookup />
            </Suspense>
          </Route>
          <Route path="/tools/chmod-calculator">
            <Suspense fallback={<RouteLoading />}>
              <ChmodCalculator />
            </Suspense>
          </Route>
          <Route path="/tools/cron-explainer">
            <Suspense fallback={<RouteLoading />}>
              <CronExplainer />
            </Suspense>
          </Route>
          <Route path="/tools/regex-tester">
            <Suspense fallback={<RouteLoading />}>
              <RegexTester />
            </Suspense>
          </Route>
          <Route path="/tools/http-status-codes">
            <Suspense fallback={<RouteLoading />}>
              <HttpStatusCodes />
            </Suspense>
          </Route>
          <Route path="/tools/encoder-decoder">
            <Suspense fallback={<RouteLoading />}>
              <EncoderDecoder />
            </Suspense>
          </Route>
          <Route path="/tools/base-converter">
            <Suspense fallback={<RouteLoading />}>
              <BaseConverter />
            </Suspense>
          </Route>
          <Route path="/tools/classical-ciphers">
            <Suspense fallback={<RouteLoading />}>
              <ClassicalCiphers />
            </Suspense>
          </Route>
          <Route path="/data">
            <Suspense fallback={<RouteLoading />}>
              <CinematicData />
            </Suspense>
          </Route>
          <Route path="/study">
            <Suspense fallback={<RouteLoading />}>
              <CinematicStudy />
            </Suspense>
          </Route>
          <Route path="/study/:exam/:domain">
            <Suspense fallback={<RouteLoading />}>
              <CinematicStudyDomain />
            </Suspense>
          </Route>
          <Route path="/topics">
            <Suspense fallback={<RouteLoading />}>
              <CinematicTopics />
            </Suspense>
          </Route>
          <Route path="/topics/:tag">
            <Suspense fallback={<RouteLoading />}>
              <CinematicTag />
            </Suspense>
          </Route>
          <Route path="/roadmap">
            <Suspense fallback={<RouteLoading />}>
              <CinematicRoadmap />
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
          <Route path="/noc">
            <OpsRoute><NocDashboard /></OpsRoute>
          </Route>
          <Route path="/network">
            <OpsRoute><NetworkDashboard /></OpsRoute>
          </Route>
          <Route path="/floor">
            <OpsRoute><FloorDashboard /></OpsRoute>
          </Route>
          <Route path="/incidents">
            <OpsRoute><IncidentsDashboard /></OpsRoute>
          </Route>
          <Route path="/build">
            <OpsRoute><BuildDashboard /></OpsRoute>
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
