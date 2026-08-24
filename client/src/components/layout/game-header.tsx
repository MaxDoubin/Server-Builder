import { Link } from "wouter";
import { useGame } from "@/lib/game-context";
import { StatusBar } from "@/components/ui/status-bar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell, DollarSign, Star, Building2 } from "lucide-react";

const tierLabels = {
  garage: null,
  tier1: "Tier I",
  tier2: "Tier II",
  tier3: "Tier III",
  tier4: "Tier IV",
};

export function GameHeader() {
  const { gameState, alerts } = useGame();
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 gap-4" data-testid="game-header">
      <div className="flex items-center gap-4">
        {/*
          The only route out of the game. Once the briefing unmounts, its
          "back to portfolio" link goes with it, and every other control in
          here is a game control, so a player who entered Build had no way
          back to the site short of the browser button.
        */}
        <Link
          href="/"
          data-testid="link-game-exit"
          aria-label="Back to the profile"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-noc-blue hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-noc-blue"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Portfolio</span>
        </Link>
        <div className="flex items-center gap-2">
          <Building2 className="w-6 h-6 text-noc-blue" />
          <div className="hidden sm:flex flex-col leading-none">
            <h1 className="font-display text-lg font-bold tracking-wider">
              HYPERSCALE
            </h1>
            <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
              Max Doubin
            </span>
          </div>
        </div>
        <div className="h-6 w-px bg-border hidden md:block" />
        {tierLabels[gameState.tier] && (
          <div className="hidden md:flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {tierLabels[gameState.tier]}
            </Badge>
          </div>
        )}
      </div>

      {/*
        The mode tabs that used to sit here (Build, Floor, Network, NOC,
        Incidents, About) navigated to /build, /floor, /network, /noc,
        /incidents and /about. None of those routes exist, so every one of
        them landed the player on the 404 page, and nothing in the current
        game reads the mode they set. They are removed rather than pointed
        at stub pages. Mode is switched from the Datacenter Command panel,
        which works.
      */}
      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <StatusBar />
        
        <div className="h-6 w-px bg-border hidden lg:block" />
        
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm">
            <DollarSign className="w-4 h-4 text-noc-green" />
            <span className="font-mono">{gameState.money.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Star className="w-4 h-4 text-noc-yellow" />
            <span className="font-mono">{gameState.reputation}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
            <Bell className="w-4 h-4" />
            {unacknowledgedCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-noc-red text-[10px] font-bold text-white flex items-center justify-center">
                {unacknowledgedCount}
              </span>
            )}
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
