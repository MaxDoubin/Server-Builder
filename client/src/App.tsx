import { useEffect, useLayoutEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { GameProvider } from "@/lib/game-context";
import { BuildProvider } from "@/lib/build-context";
import { disposePooledAssets } from "@/lib/asset-pool";
import { PageBackground } from "@/components/ui/page-background";
import { startPerfMonitor } from "@/lib/perf-monitor";
import { AppShell } from "@/components/layout/app-shell";
import { Home } from "@/pages/home";
import { HyperscaleGame } from "@/pages/hyperscale-game";
import { About } from "@/pages/about";
import { routes } from "@/lib/routes";

function AppShell() {
  const { markReady } = useIntro();

  useEffect(() => {
    const handleUnload = () => disposePooledAssets();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      disposePooledAssets();
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return startPerfMonitor();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="hyperscale-theme">
          <GameProvider>
            <BuildProvider>
              <PageBackground />
              <div className="relative z-10">
                <Switch>
                  <Route path={routes.home}>
                    <AppShell>
                      <Home />
                    </AppShell>
                  </Route>
                  <Route path={routes.game}>
                    <AppShell fullBleed>
                      <HyperscaleGame />
                    </AppShell>
                  </Route>
                  <Route path={routes.about}>
                    <AppShell>
                      <About />
                    </AppShell>
                  </Route>
                </Switch>
              </div>
            </BuildProvider>
          </GameProvider>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <IntroProvider>
      <IntroOverlay />
      <AppShell />
    </IntroProvider>
  );
}
