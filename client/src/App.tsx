import { useEffect } from "react";
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
import { DataCenter3D } from "@/pages/datacenter-3d";
import { BuildDashboard } from "@/pages/build-dashboard";
import { FloorDashboard } from "@/pages/floor-dashboard";
import { NetworkDashboard } from "@/pages/network-dashboard";
import { NocDashboard } from "@/pages/noc-dashboard";
import { IncidentsDashboard } from "@/pages/incidents-dashboard";
import { AboutDashboard } from "@/pages/about-dashboard";

export default function App() {
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
                  <Route path="/" component={DataCenter3D} />
                  <Route path="/floor" component={DataCenter3D} />
                  <Route path="/build" component={BuildDashboard} />
                  <Route path="/floor-dashboard" component={FloorDashboard} />
                  <Route path="/network" component={NetworkDashboard} />
                  <Route path="/noc" component={NocDashboard} />
                  <Route path="/incidents" component={IncidentsDashboard} />
                  <Route path="/about" component={AboutDashboard} />
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
