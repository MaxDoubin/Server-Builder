import { Component, Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router, Link } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { disposePooledAssets } from "@/lib/asset-pool";

import { Layout } from "@/components/site/Layout";
import { Home } from "@/pages/Home";
import { CinematicHome } from "@/pages/cinematic/CinematicHome";
import { SiteLoader } from "@/components/ui/site-loader";

const Blog = lazy(() =>
  import("@/pages/Blog").then((module) => ({ default: module.Blog })),
);

const BlogPost = lazy(() =>
  import("@/pages/BlogPost").then((module) => ({ default: module.BlogPost })),
);

const Projects = lazy(() =>
  import("@/pages/Projects").then((module) => ({ default: module.Projects })),
);

const Contact = lazy(() =>
  import("@/pages/Contact").then((module) => ({ default: module.Contact })),
);

const CinematicProjects = lazy(() =>
  import("@/pages/cinematic/CinematicProjects").then((module) => ({
    default: module.CinematicProjects,
  })),
);

const CinematicBlog = lazy(() =>
  import("@/pages/cinematic/CinematicBlog").then((module) => ({
    default: module.CinematicBlog,
  })),
);

const CinematicBlogPost = lazy(() =>
  import("@/pages/cinematic/CinematicBlogPost").then((module) => ({
    default: module.CinematicBlogPost,
  })),
);

const CinematicContact = lazy(() =>
  import("@/pages/cinematic/CinematicContact").then((module) => ({
    default: module.CinematicContact,
  })),
);

const GamePage = lazy(() =>
  import("@/pages/GamePage").then((module) => ({ default: module.GamePage })),
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
};

class RouteChunkBoundary extends Component<RouteChunkBoundaryProps, RouteChunkBoundaryState> {
  state: RouteChunkBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RouteChunkBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Route chunk failed to load", error, errorInfo);
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
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Application Error</h2>
            <p className="mt-2 text-sm text-gray-400">We encountered a problem loading the site resources. This usually happens due to a temporary connection issue or a large asset failing to download.</p>
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

    return this.props.children;
  }
}

function NotFound() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-24">
        <h1 className="text-6xl font-bold text-muted-foreground/30">404</h1>
        <p className="mt-4 text-lg text-muted-foreground">Page not found</p>
        <Link
          href="/"
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          data-testid="link-404-home"
        >
          Go Home
        </Link>
      </div>
    </Layout>
  );
}

export default function App() {
  useEffect(() => {
    const handleUnload = () => disposePooledAssets();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      disposePooledAssets();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="hyperscale-theme">
          <Router>
            <RouteChunkBoundary>
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
                    <GamePage />
                  </Suspense>
                </Route>
                <Route component={NotFound} />
              </Switch>
            </RouteChunkBoundary>
          </Router>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
