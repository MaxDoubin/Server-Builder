import { useLocation } from "wouter";
import { useGame } from "@/lib/game-context";
import { Button } from "@/components/ui/button";
import type { GameMode } from "@shared/schema";
import { Wrench, LayoutGrid, Network, Activity, AlertTriangle } from "lucide-react";

const modes: { id: GameMode; label: string; icon: typeof Wrench }[] = [
  { id: "build", label: "BUILD", icon: Wrench },
  { id: "floor", label: "FLOOR", icon: LayoutGrid },
  { id: "network", label: "NETWORK", icon: Network },
  { id: "noc", label: "NOC", icon: Activity },
  { id: "incident", label: "INCIDENTS", icon: AlertTriangle },
];

const modeRoutes: Record<GameMode, string> = {
  build: "/build",
  floor: "/floor",
  network: "/network",
  noc: "/noc",
  incident: "/incidents",
};

export function ModeSwitcher() {
  const { gameState, setGameMode } = useGame();
  const [location, setLocation] = useLocation();

  return (
    <div className="flex shrink-0 gap-1" data-testid="mode-switcher">
      {modes.map((mode) => {
        const Icon = mode.icon;
        const isActive = location === modeRoutes[mode.id];
        return (
          /*
            aria-current: which mode is current was carried only by the filled
            button variant, so it did not exist for a screen reader or under
            forced colours.
          */
          <Button
            key={mode.id}
            variant={isActive ? "default" : "ghost"}
            aria-current={isActive ? "page" : undefined}
            size="sm"
            onClick={() => {
              setGameMode(mode.id);
              setLocation(modeRoutes[mode.id]);
            }}
            className={`font-mono text-xs tracking-wide ${
              isActive ? "" : "text-muted-foreground"
            }`}
            data-testid={`button-mode-${mode.id}`}
          >
            <Icon className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {mode.label}
          </Button>
        );
      })}
    </div>
  );
}
