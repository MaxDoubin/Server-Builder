import { Suspense, lazy, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { disposePooledAssets } from "@/lib/asset-pool";

import { Home } from "@/pages/Home";
import { Blog } from "@/pages/Blog";
import { BlogPost } from "@/pages/BlogPost";
import { Projects } from "@/pages/Projects";
import { Contact } from "@/pages/Contact";
import { Layout } from "@/components/site/Layout";

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
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/blog" component={Blog} />
            <Route path="/blog/:slug" component={BlogPost} />
            <Route path="/projects" component={Projects} />
            <Route path="/contact" component={Contact} />
            <Route path="/game">
              <Suspense fallback={<GameLoading />}>
                <GamePage />
              </Suspense>
            </Route>
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
