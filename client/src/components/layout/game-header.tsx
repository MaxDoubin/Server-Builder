import { Link } from "wouter";
import { useGame } from "@/lib/game-context";
import { ModeSwitcher } from "@/components/ui/mode-switcher";
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

export function GameHeader({
  /*
    The console pins itself to the dark palette, so a theme control rendered
    inside it would change every other surface on the page and leave the one
    around it alone. Hidden there, kept on the dashboards, where this header
    sits on a theme-aware page and the control does what it says.
  */
  showThemeToggle = true,
}: { showThemeToggle?: boolean } = {}) {
  const { gameState, alerts } = useGame();
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <header
      /*
        Below lg the row cannot hold the brand, the exit, five mode tabs and
        the status readouts at once: the tabs ran past the viewport edge and
        the last two sat underneath the status bar, unreachable by tap. The
        header wraps to a second line instead, and the tab strip scrolls
        within it.

        That holds up to 2xl, not lg. At 1280 everything technically fitted
        on one row only by clipping the tab strip mid-word, and before that
        the tabs overflowed their box entirely and drew over the brand and
        the power readout. One row is only used where the whole thing
        genuinely fits.
      */
      className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-card/80 px-4 py-2 backdrop-blur-sm 2xl:h-16 2xl:flex-nowrap 2xl:py-0"
      data-testid="game-header"
    >
      <div className="flex min-w-0 shrink items-center gap-4">
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
            <span className="font-display text-lg font-bold tracking-wider">
              HYPERSCALE
            </span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--console-accent))]">
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
        These tabs used to point at /build, /floor, /network, /noc and
        /incidents with none of those routes defined, so every one landed on
        the 404 page. The dashboards they were written for existed the whole
        time; they just had no route. Both halves are connected now.
      */}
      <div className="order-last w-full min-w-0 overflow-x-auto 2xl:order-none 2xl:w-auto 2xl:flex-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex justify-start lg:justify-center">
          <ModeSwitcher />
        </div>
      </div>

      <div className="flex min-w-0 shrink flex-wrap items-center justify-end gap-x-4 gap-y-2">
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
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              unacknowledgedCount > 0
                ? `Notifications, ${unacknowledgedCount} unread`
                : "Notifications"
            }
            data-testid="button-notifications"
          >
            <Bell className="w-4 h-4" />
            {unacknowledgedCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-noc-red text-[10px] font-bold text-white flex items-center justify-center">
                {unacknowledgedCount}
              </span>
            )}
          </Button>
          {showThemeToggle && <ThemeToggle />}
        </div>
      </div>
    </header>
  );
}
