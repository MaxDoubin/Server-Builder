import { Component, Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { disposePooledAssets } from "@/lib/asset-pool";

import { Layout } from "@/components/site/Layout";

import { Home } from "@/pages/Home";

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

const GamePage = lazy(() =>
  import("@/pages/GamePage").then((module) => ({ default: module.GamePage })),
);

function GameLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Loading game...</p>
      </div>
    </div>
  );
}

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-3 text-sm text-muted-foreground">Loading page...</p>
      </div>
    </div>
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
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="max-w-md rounded-xl border border-border/70 bg-card/80 p-6 text-center">
            <p className="text-base font-semibold text-foreground">We couldn't load this page.</p>
            <p className="mt-2 text-sm text-muted-foreground">Please reload to retry.</p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Reload page
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
        <a
          href="/"
          className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          data-testid="link-404-home"
        >
          Go Home
        </a>
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
          <RouteChunkBoundary>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/blog">
              <Suspense fallback={<RouteLoading />}>
                <Blog />
              </Suspense>
            </Route>
            <Route path="/blog/:slug">
              <Suspense fallback={<RouteLoading />}>
                <BlogPost />
              </Suspense>
            </Route>
            <Route path="/projects">
              <Suspense fallback={<RouteLoading />}>
                <Projects />
              </Suspense>
            </Route>
            <Route path="/contact">
              <Suspense fallback={<RouteLoading />}>
                <Contact />
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
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
