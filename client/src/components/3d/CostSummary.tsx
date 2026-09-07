/**
 * What the visible floor would cost.
 *
 * Order of magnitude figures for the simulation, not quotes. The panel says
 * so on screen, because a number with a dollar sign in front of it gets
 * quoted back at you later.
 */

import {
  ELECTRICITY_USD_PER_KWH,
  formatUsd,
  OPEX_USD_PER_KW_YEAR,
  RACK_CAPEX_USD,
  type BuildCostEstimate,
} from "@/lib/buildCosts";

function Line({
  label,
  value,
  detail,
  emphasis,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 border-b border-white/5 py-1.5 last:border-b-0 ${
        emphasis ? "text-cyan-100" : "text-white/70"
      }`}
    >
      <div>
        <div className={`text-[11px] ${emphasis ? "font-semibold" : ""}`}>{label}</div>
        {detail && <div className="text-[9px] text-white/50">{detail}</div>}
      </div>
      <div className={`font-mono text-xs ${emphasis ? "text-cyan-200" : "text-white/80"}`}>
        {value}
      </div>
    </div>
  );
}

export function CostSummary({ estimate }: { estimate: BuildCostEstimate }) {
  return (
    <div className="space-y-2">
      <div>
        <Line
          label="Equipment capex"
          value={formatUsd(estimate.equipmentCapexUsd)}
          detail="Installed hardware at catalog prices"
        />
        <Line
          label="Rack capex"
          value={formatUsd(estimate.rackCapexUsd)}
          detail={`Cabinets, rails and rack PDUs at ${formatUsd(RACK_CAPEX_USD)} each`}
        />
        <Line label="Hardware capex" value={formatUsd(estimate.hardwareCapexUsd)} emphasis />
        <Line
          label="Annual power opex"
          value={formatUsd(estimate.annualPowerOpexUsd)}
          detail={`${estimate.facilityLoadKw.toFixed(0)} kW at facility level, ${formatUsd(
            OPEX_USD_PER_KW_YEAR,
          )} per kW-year`}
        />
        <Line label="First year total" value={formatUsd(estimate.firstYearTotalUsd)} emphasis />
      </div>

      {estimate.unpricedItems > 0 && (
        <p className="text-[10px] text-amber-200">
          {estimate.unpricedItems} installed item
          {estimate.unpricedItems === 1 ? " is" : "s are"} not in the catalog and priced at zero.
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-white/50">
        Rough order of magnitude for the simulation, not a quote. Energy is costed at{" "}
        {ELECTRICITY_USD_PER_KWH.toFixed(2)} per kWh across 8,760 hours. Excludes shell, generators,
        UPS and chiller plant, staff, and maintenance contracts, all of which are larger than the
        hardware line at this scale.
      </p>
    </div>
  );
}
