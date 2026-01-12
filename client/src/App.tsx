import { Suspense, lazy, useEffect } from "react";
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
import { LoadingScreen } from "@/components/ui/loading-screen";

const DataCenter3D = lazy(() =>
  import("@/pages/datacenter-3d").then((module) => ({ default: module.DataCenter3D })),
);
const BuildDashboard = lazy(() =>
  import("@/pages/build-dashboard").then((module) => ({ default: module.BuildDashboard })),
);
const FloorDashboard = lazy(() =>
  import("@/pages/floor-dashboard").then((module) => ({ default: module.FloorDashboard })),
);
const NetworkDashboard = lazy(() =>
  import("@/pages/network-dashboard").then((module) => ({ default: module.NetworkDashboard })),
);
const NocDashboard = lazy(() =>
  import("@/pages/noc-dashboard").then((module) => ({ default: module.NocDashboard })),
);
const IncidentsDashboard = lazy(() =>
  import("@/pages/incidents-dashboard").then((module) => ({ default: module.IncidentsDashboard })),
);
const AboutDashboard = lazy(() =>
  import("@/pages/about-dashboard").then((module) => ({ default: module.AboutDashboard })),
);

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
    const idleCallback =
      window.requestIdleCallback?.(() => {
        void import("@/pages/build-dashboard");
        void import("@/pages/floor-dashboard");
        void import("@/pages/network-dashboard");
        void import("@/pages/noc-dashboard");
        void import("@/pages/incidents-dashboard");
        void import("@/pages/about-dashboard");
      }) ??
      window.setTimeout(() => {
        void import("@/pages/build-dashboard");
        void import("@/pages/floor-dashboard");
        void import("@/pages/network-dashboard");
        void import("@/pages/noc-dashboard");
        void import("@/pages/incidents-dashboard");
        void import("@/pages/about-dashboard");
      }, 1200);

    return () => {
      if (window.cancelIdleCallback) {
        window.cancelIdleCallback(idleCallback);
      } else {
        window.clearTimeout(idleCallback);
      }
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="dark" storageKey="hyperscale-theme">
          <GameProvider>
            <BuildProvider>
              <PageBackground />
              <div className="relative z-10">
                <Suspense fallback={<LoadingScreen />}>
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
                </Suspense>
              </div>
            </BuildProvider>
          </GameProvider>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
