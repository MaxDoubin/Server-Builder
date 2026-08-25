/**
 * Rack power, cooling and cost budget.
 *
 * The arithmetic here is the simulator's, imported rather than reimplemented:
 * BTU_PER_WATT, WATTS_PER_COOLING_TON, IN_ROOM_LOSS_FACTOR,
 * CRAH_UNIT_CAPACITY_W and facilityPue all come from lib/capacity, and the
 * energy rate from lib/buildCosts. That physics was locked inside a three.js
 * scene, so the only way to reach it was to load 950KB of WebGL and place
 * racks by hand. It is a plain form here, and because both read the same
 * constants the tool and the simulator cannot drift apart.
 */

import { useMemo, useState } from "react";
import { ToolShell } from "./ToolShell";
import {
  BTU_PER_WATT,
  WATTS_PER_COOLING_TON,
  IN_ROOM_LOSS_FACTOR,
  CRAH_UNIT_CAPACITY_W,
  facilityPue,
} from "@/lib/capacity";
import { ELECTRICITY_USD_PER_KWH, HOURS_PER_YEAR, RACK_CAPEX_USD } from "@/lib/buildCosts";

interface Field {
  key: "racks" | "kwPerRack" | "rate" | "crahCapacityKw";
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

const FIELDS: Field[] = [
  { key: "racks", label: "Racks", suffix: "racks", min: 1, max: 2000, step: 1,
    hint: "How many cabinets on the floor." },
  { key: "kwPerRack", label: "Load per rack", suffix: "kW", min: 0.5, max: 40, step: 0.5,
    hint: "Steady-state IT draw per cabinet. A dense compute rack runs 15 to 22 kW." },
  { key: "rate", label: "Electricity", suffix: "$/kWh", min: 0.01, max: 1, step: 0.01,
    hint: "Your commercial rate. The default is the simulator's." },
  { key: "crahCapacityKw", label: "CRAH unit capacity", suffix: "kW", min: 10, max: 1000, step: 10,
    hint: "Sensible cooling per air handler." },
];

const fmt = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function RackBudget() {
  const [racks, setRacks] = useState(40);
  const [kwPerRack, setKwPerRack] = useState(12);
  const [rate, setRate] = useState(ELECTRICITY_USD_PER_KWH);
  const [crahCapacityKw, setCrahCapacityKw] = useState(CRAH_UNIT_CAPACITY_W / 1000);

  const set = (key: Field["key"], value: number) => {
    if (key === "racks") setRacks(value);
    else if (key === "kwPerRack") setKwPerRack(value);
    else if (key === "rate") setRate(value);
    else setCrahCapacityKw(value);
  };
  const value = (key: Field["key"]) =>
    key === "racks" ? racks : key === "kwPerRack" ? kwPerRack : key === "rate" ? rate : crahCapacityKw;

  const r = useMemo(() => {
    const itLoadW = racks * kwPerRack * 1000;
    const pue = facilityPue(racks);
    // What the utility meter turns, IT load plus everything supporting it.
    const facilityW = itLoadW * pue;
    // Cooling has to remove the IT heat plus in-room losses from lighting,
    // fans and distribution, which is what IN_ROOM_LOSS_FACTOR represents.
    const coolingLoadW = itLoadW * IN_ROOM_LOSS_FACTOR;
    const btuPerHour = coolingLoadW * BTU_PER_WATT;
    const tons = coolingLoadW / WATTS_PER_COOLING_TON;
    const crahUnits = Math.ceil(coolingLoadW / (crahCapacityKw * 1000));
    // N+1: one spare unit so a single failure is not an outage.
    const crahWithRedundancy = crahUnits + 1;
    const annualKwh = (facilityW / 1000) * HOURS_PER_YEAR;
    const annualCost = annualKwh * rate;
    const rackCapex = racks * RACK_CAPEX_USD;
    return {
      itLoadW, pue, facilityW, coolingLoadW, btuPerHour, tons,
      crahUnits, crahWithRedundancy, annualKwh, annualCost, rackCapex,
      overheadW: facilityW - itLoadW,
    };
  }, [racks, kwPerRack, rate, crahCapacityKw]);

  const results: Array<[string, string, string]> = [
    ["IT load", `${fmt(r.itLoadW / 1000, 1)} kW`, "What the equipment itself draws."],
    ["PUE", fmt(r.pue, 3), "Modelled from floor size: 1.12 plus racks over 400, capped at 1.40."],
    ["Facility power", `${fmt(r.facilityW / 1000, 1)} kW`, "IT load times PUE. What the meter turns."],
    ["Support overhead", `${fmt(r.overheadW / 1000, 1)} kW`, "Cooling, distribution and losses."],
    ["Heat to remove", `${fmt(r.btuPerHour)} BTU/hr`, `IT load times ${IN_ROOM_LOSS_FACTOR} for in-room losses, converted at ${BTU_PER_WATT} BTU per watt.`],
    ["Cooling required", `${fmt(r.tons, 1)} tons`, "One ton is 12,000 BTU per hour."],
    ["CRAH units", `${r.crahUnits} (${r.crahWithRedundancy} with N+1)`, `At ${fmt(crahCapacityKw)} kW sensible each, plus one spare.`],
    ["Annual energy", `${fmt(r.annualKwh)} kWh`, `Facility power across ${fmt(HOURS_PER_YEAR)} hours.`],
    ["Annual energy cost", usd(r.annualCost), `At ${usd(rate)} per kWh.`],
    ["Rack capex", usd(r.rackCapex), `${fmt(RACK_CAPEX_USD)} per cabinet, enclosure only, no equipment.`],
  ];

  return (
    <ToolShell
      slug="rack-budget"
      notes={
        <>
          <p>
            Every figure here comes from the same constants the datacenter
            simulator on this site runs on, imported rather than copied, so
            the two cannot disagree. Watts convert to BTU per hour at{" "}
            {BTU_PER_WATT}, a cooling ton is 12,000 BTU per hour, and cooling
            is sized against IT load times {IN_ROOM_LOSS_FACTOR} to cover
            in-room losses rather than against IT load alone, which is the
            mistake that leaves a room short on a hot day.
          </p>
          <p>
            PUE is modelled, not measured. A small floor spreads fixed plant
            losses over less IT load, so it starts at 1.12 and worsens with
            scale up to a 1.40 cap. Real facilities vary widely; treat it as
            a planning figure and measure your own once there is something to
            meter.
          </p>
          <p>
            The N+1 column adds one spare air handler so a single unit failing
            is not an outage. That is the minimum most designs assume, and it
            is why the unit count is usually one higher than the arithmetic
            alone suggests.
          </p>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label
                htmlFor={`rb-${f.key}`}
                className="block font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
              >
                {f.label}
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id={`rb-${f.key}`}
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={value(f.key)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) set(f.key, Math.min(f.max, Math.max(f.min, n)));
                  }}
                  data-testid={`input-${f.key}`}
                  className="w-32 rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                />
                <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  {f.suffix}
                </span>
              </div>
              <p className="mt-1.5 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {f.hint}
              </p>
            </div>
          ))}
        </div>

        <div>
          <table className="w-full border-collapse">
            <caption className="sr-only">
              Calculated power, cooling and cost budget
            </caption>
            <tbody>
              {results.map(([label, val, note]) => (
                <tr key={label} className="border-b border-[hsl(var(--brand-iron))]">
                  <th
                    scope="row"
                    className="py-3 pr-4 text-left align-top font-mono-tight text-[10px] uppercase tracking-[0.26em] text-[hsl(var(--brand-ash))]"
                  >
                    {label}
                  </th>
                  <td className="py-3 pr-4 align-top font-display text-lg text-[hsl(var(--brand-signal))]">
                    <span data-testid={`out-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                      {val}
                    </span>
                  </td>
                  <td className="hidden py-3 align-top font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-bone-dim))] sm:table-cell">
                    {note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ToolShell>
  );
}
