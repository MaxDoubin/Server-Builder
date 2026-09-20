/**
 * Facility readout over the 3D floor.
 *
 * This was an `<Html transform distanceFactor={8}>` panel standing in the
 * scene, and both of the things wrong with it came from that.
 *
 * drei scales such a panel by distanceFactor over the distance to the camera.
 * Measured on this page that came to 0.417, so the authored type reached the
 * screen at well under half its size: 10px labels landed at 4.2px, 18px
 * values at 7.5px, and the 24px title at 10px. The type floor gate exempts
 * anything inside `<Html distanceFactor>` because the camera decides the real
 * size, which is true, and here the camera was deciding it downwards.
 *
 * Placement was worse. The panel sat at a fixed world position, but the
 * camera's field of view is vertical, so the horizontal slice of the scene on
 * screen narrows as the viewport does. At 1440 the panel overhung the right
 * edge by 29px. At 768 its left edge was at x=916 and at 390 at x=692, both
 * of them past the edge entirely: on a phone or a tablet this panel was
 * built, laid out and composited every frame and never once visible.
 *
 * Neither is fixable in place. Staying legible under a camera the reader can
 * orbit means pinning the panel to the camera, and a panel pinned to the
 * camera is a screen space overlay with extra steps, so it is one now, in the
 * same chrome as the other overlays on this canvas.
 *
 * Hidden below lg. Every number here is also in the dock and the top strip,
 * and at phone width the dock, the build toolbar, the tour and the
 * achievement toast already overlap one another.
 */

import { formatWatts } from "@/lib/capacity";
import { useGame } from "@/lib/game-context";

type Tone = "cyan" | "green" | "orange";

const TONE: Record<Tone, string> = {
  cyan: "border-cyan-500/30 text-cyan-200",
  green: "border-emerald-500/30 text-emerald-200",
  orange: "border-orange-500/40 text-orange-200",
};

function Metric({ label, value, tone = "cyan" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={`rounded border bg-black/40 px-1.5 py-1 ${TONE[tone]}`}>
      <div className="text-[0.625rem] uppercase tracking-wide text-cyan-500">{label}</div>
      <div className="font-mono text-sm font-bold leading-tight">{value}</div>
    </div>
  );
}

export function HolographicHUD({ visible = true }: { visible?: boolean }) {
  const { racks, facilityMetrics, alerts } = useGame();

  if (!visible) return null;

  const floor = racks ?? [];
  const itLoadW = floor.reduce((sum, rack) => sum + rack.currentPowerDraw, 0);
  const avgTemp = floor.length
    ? floor.reduce((sum, rack) => sum + rack.exhaustTemp, 0) / floor.length
    : 0;
  const raised = alerts ?? [];
  const criticalAlerts = raised.filter((alert) => alert.severity === "critical").length;
  const warningAlerts = raised.filter((alert) => alert.severity === "warning").length;

  /*
    Guard the number, not the formatted string. facilityMetrics initialises
    uptime to 0 and (0).toFixed(2) is the truthy string "0.00", so a fallback
    applied after the formatting could never run, and this panel read
    UPTIME 0.00% while the strip above it read 99.9%.
  */
  const uptime = facilityMetrics?.uptime || 99.99;
  const pue = facilityMetrics?.pue && facilityMetrics.pue > 1 ? facilityMetrics.pue : 1.2;

  return (
    <div
      className="pointer-events-none absolute right-4 top-32 hidden w-72 select-none rounded-lg border border-cyan-500/30 bg-black/70 p-3 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-md lg:block"
      data-ui="true"
      data-testid="facility-hud"
    >
      <div className="text-center">
        <div className="font-techno text-xs font-bold tracking-[0.2em] text-cyan-300">
          HYPERSCALE CONTROL
        </div>
        <div className="mt-0.5 text-[0.625rem] tracking-wide text-cyan-600">
          FACILITY MONITORING SYSTEM v3.2.1
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <Metric label="Power" value={formatWatts(itLoadW)} />
        <Metric
          label="Avg temp"
          value={`${avgTemp.toFixed(1)} C`}
          tone={avgTemp > 35 ? "orange" : "green"}
        />
        <Metric label="Uptime" value={`${uptime.toFixed(2)}%`} tone="green" />
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Metric label="PUE" value={pue.toFixed(2)} />
        <Metric label="Racks online" value={floor.length.toLocaleString()} />
      </div>

      <div className="mt-2 flex items-center justify-center gap-2 text-[0.625rem] font-bold">
        <span
          className={`rounded px-2 py-0.5 ${
            criticalAlerts > 0 ? "bg-rose-900/60 text-rose-200" : "bg-white/5 text-white/50"
          }`}
        >
          {criticalAlerts} CRITICAL
        </span>
        <span
          className={`rounded px-2 py-0.5 ${
            warningAlerts > 0 ? "bg-amber-900/60 text-amber-100" : "bg-white/5 text-white/50"
          }`}
        >
          {warningAlerts} WARNING
        </span>
      </div>

      <div className="mt-2 text-center text-[0.625rem] tracking-widest text-cyan-600">
        <span className="animate-pulse">LIVE DATA STREAM</span>
      </div>
    </div>
  );
}
