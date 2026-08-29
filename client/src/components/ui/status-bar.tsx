import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/game-context";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, AlertCircle, Server, HardDrive } from "lucide-react";

export function StatusBar() {
  const { facilityMetrics, alerts } = useGame();
  const criticalCount = alerts.filter((a) => a.severity === "critical" && !a.acknowledged).length;
  const bootTimeRef = useRef(Date.now());
  const [uptimeWave, setUptimeWave] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const minutes = (Date.now() - bootTimeRef.current) / 60000;
      setUptimeWave(Math.sin(minutes / 2) * 0.03);
    }, 2000);
    return () => window.clearInterval(interval);
  }, []);

  /**
   * These used to be `facilityMetrics.x || locallyDerived.x` fallbacks,
   * because facilityMetrics arrived all zeroes in static mode. That masked
   * the problem here while every dashboard KPI reading the same context
   * still showed 0. game-context now derives real numbers, so this reads
   * them straight and the strip agrees with the panels beneath it.
   *
   * The wave is display-only jitter so the uptime readout is not frozen. It
   * stays local: putting a two-second tick in the context would re-render
   * every consumer of the game state.
   */
  const resolvedMetrics = {
    itLoad: facilityMetrics.itLoad,
    pue: facilityMetrics.pue,
    uptime: Math.min(99.999, facilityMetrics.uptime + uptimeWave),
    serverCount: facilityMetrics.serverCount,
    storageCapacity: facilityMetrics.storageCapacity,
    storageUsed: facilityMetrics.storageUsed,
  };
  const storagePercent = Math.min(
    100,
    (resolvedMetrics.storageUsed / Math.max(1, resolvedMetrics.storageCapacity)) * 100
  );

  return (
    /*
      Wraps. This is one flex item inside the header's right-hand group, and
      as a nowrap row its readouts were 581px wide inside a 358px box on a
      390px screen. While the header was `fixed` that overflow was invisible
      to the document; once it became sticky, and therefore in flow, it gave
      every dashboard 207px of sideways scroll on a phone.
    */
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
      data-testid="status-bar"
    >
      {/*
        Each readout is an icon plus a number. lucide-react does not set
        aria-hidden, and the icon carried the entire meaning, so these were
        announced as "graphic, 12" with nothing saying what 12 counted. The
        sr-only labels are position:absolute, so they are not flex items and
        the gap-1.5 spacing is unchanged.
      */}
      <div className="flex items-center gap-1.5" data-testid="status-power">
        <Zap className="w-4 h-4 text-noc-yellow" aria-hidden="true" />
        <span className="sr-only">IT load</span>
        <span className="font-mono text-xs">
          {(resolvedMetrics.itLoad / 1000).toFixed(1)} kW
        </span>
      </div>

      <div className="flex items-center gap-1.5" data-testid="status-pue">
        <span className="text-xs text-muted-foreground">PUE</span>
        <span className="font-mono text-xs font-semibold">
          {resolvedMetrics.pue.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center gap-1.5" data-testid="status-uptime">
        <Clock className="w-4 h-4 text-noc-green" aria-hidden="true" />
        <span className="sr-only">Uptime</span>
        <span className="font-mono text-xs">
          {resolvedMetrics.uptime.toFixed(4)}%
        </span>
      </div>

      <div className="flex items-center gap-1.5" data-testid="status-servers">
        <Server className="w-4 h-4 text-noc-blue" aria-hidden="true" />
        <span className="sr-only">Servers</span>
        <span className="font-mono text-xs">{resolvedMetrics.serverCount}</span>
      </div>

      <div className="flex items-center gap-1.5" data-testid="status-storage">
        <HardDrive className="w-4 h-4 text-noc-purple" aria-hidden="true" />
        <span className="sr-only">Storage used</span>
        <span className="font-mono text-xs">
          {storagePercent.toFixed(0)}%
        </span>
      </div>

      {/*
        The live region is always mounted, and only its text changes. Putting
        role="status" on the badge itself would not work: a live region that
        is inserted into the DOM already holding its text is not reliably
        announced, and the badge only exists once an alert fires.
      */}
      <span className="sr-only" role="status" aria-live="polite">
        {criticalCount > 0
          ? `${criticalCount} unacknowledged critical ${criticalCount === 1 ? "alert" : "alerts"}`
          : ""}
      </span>

      {/*
        aria-hidden: the sr-only region above already carries this count in the
        same reading position, and announcing it twice is worse than once.
      */}
      {criticalCount > 0 && (
        <Badge
          variant="destructive"
          className="font-mono"
          data-testid="status-critical-alerts"
          aria-hidden="true"
        >
          <AlertCircle className="w-3 h-3 mr-1" />
          {criticalCount} CRITICAL
        </Badge>
      )}
    </div>
  );
}
