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
      <div className="flex items-center gap-1.5" data-testid="status-power">
        <Zap className="w-4 h-4 text-noc-yellow" />
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
        <Clock className="w-4 h-4 text-noc-green" />
        <span className="font-mono text-xs">
          {resolvedMetrics.uptime.toFixed(4)}%
        </span>
      </div>

      <div className="flex items-center gap-1.5" data-testid="status-servers">
        <Server className="w-4 h-4 text-noc-blue" />
        <span className="font-mono text-xs">{resolvedMetrics.serverCount}</span>
      </div>

      <div className="flex items-center gap-1.5" data-testid="status-storage">
        <HardDrive className="w-4 h-4 text-noc-purple" />
        <span className="font-mono text-xs">
          {storagePercent.toFixed(0)}%
        </span>
      </div>

      {criticalCount > 0 && (
        <Badge variant="destructive" className="font-mono" data-testid="status-critical-alerts">
          <AlertCircle className="w-3 h-3 mr-1" />
          {criticalCount} CRITICAL
        </Badge>
      )}
    </div>
  );
}
