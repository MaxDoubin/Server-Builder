import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/lib/game-context";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, AlertCircle, Server, HardDrive } from "lucide-react";

export function StatusBar() {
  const { facilityMetrics, alerts, racks } = useGame();
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

  const derivedMetrics = useMemo(() => {
    const rackCount = racks.length;
    const serverCount = racks.reduce(
      (sum, rack) => sum + rack.installedEquipment.length,
      0
    );
    const itLoad = Math.max(1800, serverCount * 45 + rackCount * 120);
    const pue = 1.12 + Math.min(0.28, rackCount / 400);
    const storageCapacity = Math.max(100, serverCount * 4);
    const storageUsed = storageCapacity * Math.min(0.92, 0.42 + (serverCount % 30) / 100);
    const uptime = 99.9 + uptimeWave;
    return {
      itLoad,
      pue,
      uptime,
      serverCount,
      storageCapacity,
      storageUsed,
    };
  }, [racks, uptimeWave]);

  const resolvedMetrics = {
    itLoad: facilityMetrics.itLoad || derivedMetrics.itLoad,
    // A PUE of 1.0 means zero overhead for cooling and distribution, which
    // is not physically achievable. The seeded default is exactly 1, and it
    // is truthy, so `||` never reached the derived value and both readouts
    // showed PUE 1.00.
    pue:
      facilityMetrics.pue && facilityMetrics.pue > 1
        ? facilityMetrics.pue
        : derivedMetrics.pue,
    uptime: facilityMetrics.uptime || derivedMetrics.uptime,
    serverCount: facilityMetrics.serverCount || derivedMetrics.serverCount,
    storageCapacity:
      facilityMetrics.storageCapacity || derivedMetrics.storageCapacity,
    storageUsed: facilityMetrics.storageUsed || derivedMetrics.storageUsed,
  };
  const storagePercent = Math.min(
    100,
    (resolvedMetrics.storageUsed / Math.max(1, resolvedMetrics.storageCapacity)) * 100
  );

  return (
    <div className="flex items-center gap-4 text-sm" data-testid="status-bar">
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
