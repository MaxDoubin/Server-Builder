/**
 * Power and cooling headroom for the visible floor.
 *
 * Both bars state their condition in words as well as in colour. A bar that
 * only turns red tells a colour blind user nothing, and it tells nobody how
 * far over the line they are.
 */

import { useMemo } from "react";
import {
  CRAH_UNITS_INSTALLED,
  formatPercent,
  formatWatts,
  heatLevelColor,
  HEAT_SCALE_MAX_W,
  type FacilityCapacity,
} from "@/lib/capacity";

type MeterState = "clear" | "tight" | "over";

function meterState(utilization: number): MeterState {
  if (utilization > 1) return "over";
  if (utilization >= 0.9) return "tight";
  return "clear";
}

const STATE_TEXT: Record<MeterState, string> = {
  clear: "Within budget",
  tight: "Tight, under 10 percent left",
  over: "OVER BUDGET",
};

const STATE_BAR: Record<MeterState, string> = {
  clear: "bg-cyan-400",
  tight: "bg-amber-400",
  over: "bg-rose-500",
};

const STATE_LABEL: Record<MeterState, string> = {
  clear: "text-cyan-200",
  tight: "text-amber-200",
  over: "text-rose-300",
};

function Meter({
  label,
  loadW,
  capacityW,
  utilization,
  detail,
}: {
  label: string;
  loadW: number;
  capacityW: number;
  utilization: number;
  detail: string;
}) {
  const state = meterState(utilization);
  const headroom = capacityW - loadW;
  const width = Math.min(100, Math.max(0, utilization * 100));

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-widest text-white/60">
        <span>{label}</span>
        <span className={STATE_LABEL[state]}>{formatPercent(utilization)}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuenow={Math.round(utilization * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${formatPercent(utilization)} used, ${formatWatts(headroom)} headroom`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${STATE_BAR[state]}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[10px] text-white/60">
        <span className="font-mono">
          {formatWatts(loadW)} of {formatWatts(capacityW)}
        </span>
        <span className={`font-mono ${STATE_LABEL[state]}`}>
          {headroom >= 0 ? `${formatWatts(headroom)} free` : `${formatWatts(-headroom)} over`}
        </span>
      </div>
      <div className={`text-[10px] ${STATE_LABEL[state]}`}>
        {STATE_TEXT[state]}
        <span className="text-white/50"> · {detail}</span>
      </div>
    </div>
  );
}

export function CapacityMeters({
  capacity,
  heatmapOn,
  scenarioNote,
}: {
  capacity: FacilityCapacity;
  heatmapOn: boolean;
  /** Set while a scenario has degraded the plant, so the numbers make sense. */
  scenarioNote?: string | null;
}) {
  const legend = useMemo(
    () =>
      [0, 0.25, 0.5, 0.75, 1].map((level) => ({
        level,
        color: heatLevelColor(level),
        label: `${Math.round((level * HEAT_SCALE_MAX_W) / 1000)} kW`,
      })),
    [],
  );

  const overAnything = capacity.overPower || capacity.overCooling;

  return (
    <div className="space-y-3" data-tour="capacity">
      {scenarioNote && (
        <p className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-100">
          {scenarioNote}
        </p>
      )}

      <Meter
        label="Power"
        loadW={capacity.itLoadW}
        capacityW={capacity.powerCeilingW}
        utilization={capacity.powerUtilization}
        detail={`${capacity.rackCount} racks, ${formatWatts(capacity.averageRackW)} average`}
      />

      <Meter
        label="Cooling"
        loadW={capacity.coolingLoadW}
        capacityW={capacity.coolingCapacityW}
        utilization={capacity.coolingUtilization}
        detail={`${capacity.crahUnitsOnline} of ${CRAH_UNITS_INSTALLED} CRAH units online`}
      />

      {overAnything && (
        <p
          role="alert"
          className="rounded-md border border-rose-500/50 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-rose-100"
        >
          {capacity.overPower && capacity.overCooling
            ? `This build is past both ceilings: ${formatWatts(
                -capacity.powerHeadroomW,
              )} over the power feed and ${formatWatts(
                -capacity.coolingHeadroomW,
              )} over cooling capacity. Reduce rack density or remove equipment.`
            : capacity.overPower
              ? `This build draws ${formatWatts(
                  -capacity.powerHeadroomW,
                )} more than the feed is rated for. Reduce rack density or remove equipment.`
              : `The plant cannot reject this much heat. The floor is ${formatWatts(
                  -capacity.coolingHeadroomW,
                )} over cooling capacity.`}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-white/60">
        <div className="flex justify-between gap-2">
          <dt>Hottest rack</dt>
          <dd className="font-mono text-white/80">
            {capacity.hottestRackName
              ? `${formatWatts(capacity.hottestRackHeatW)}`
              : "none"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Installed items</dt>
          <dd className="font-mono text-white/80">{capacity.equipmentCount.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Mean inlet</dt>
          <dd className="font-mono text-white/80">{capacity.avgInletTempC.toFixed(1)} C</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Near rack limit</dt>
          <dd className="font-mono text-white/80">{capacity.racksNearOwnCapacity}</dd>
        </div>
      </dl>

      {heatmapOn && (
        <div className="rounded-md border border-white/10 bg-white/5 p-2">
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Heatmap scale, heat per rack
          </div>
          <div className="mt-1.5 flex items-center gap-1" aria-hidden>
            {legend.map((stop) => (
              <div
                key={stop.level}
                className="h-2 flex-1 rounded-sm"
                style={{ backgroundColor: stop.color }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] font-mono text-white/50">
            {legend.map((stop) => (
              <span key={stop.level}>{stop.label}</span>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-white/50">
            Blue is under 5 kW, green around 10 kW, amber around 15 kW, red at 25 kW and above.
            Colour comes from the equipment in each rack plus an airflow penalty.
          </p>
        </div>
      )}
    </div>
  );
}
