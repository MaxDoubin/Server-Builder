/**
 * Standby generator runtime and fuel calculator.
 *
 * The fuel curve is four numbers, consumption at 25, 50, 75 and 100 percent
 * of the standby rating, exactly as a generator data sheet prints them. The
 * page starts from typical values scaled to the rating and lets the reader
 * overwrite any of them; every result is interpolated from whatever the
 * four fields hold. The math lives in lib/toolkit/generator-runtime-calculator.
 */

import { useMemo, useState } from "react";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  FUELS,
  LITERS_PER_GALLON,
  LOAD_POINTS,
  MAX_TANK,
  MAX_TARGET_HOURS,
  WET_STACKING_FRACTION,
  computeRuntime,
  convertVolume,
  draftNumber,
  formatHours,
  formatQuantity,
  fuelById,
  interpolateCurve,
  parseCurve,
  parseLoad,
  parseNumber,
  parseRating,
  propaneVapor,
  tankForRuntime,
  typicalCurve,
  volumeUnit,
  type FuelId,
  type LoadMode,
  type Parsed,
  type UnitSystem,
} from "@/lib/toolkit/generator-runtime-calculator";

const TARGETS = [8, 24, 48, 72, 96];

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CELL_INPUT =
  "w-full min-w-[5.5rem] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_BASE =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON = "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const ERROR_TEXT = "mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_TEXT = "mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const WARN_BOX =
  "mt-4 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const DANGER_BOX =
  "mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const TD = "py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]";
const TD_DIM = "py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]";
const BIG =
  "font-display text-[clamp(2rem,6vw,3rem)] font-medium leading-none tracking-[-0.03em] text-[hsl(var(--brand-bone))]";

function errorOf<T>(parsed: Parsed<T>): string | null {
  return parsed.ok ? null : parsed.error;
}

function pct(fraction: number): string {
  return `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

function days(value: number): string {
  const text = value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${text} ${text === "1" ? "day" : "days"}`;
}

function kw(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} kW`;
}

/** A labeled text input with a fixed unit after it. */
function Field({
  id,
  label,
  value,
  onChange,
  error,
  suffix,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  suffix?: string;
  testId?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid={testId}
          className={INPUT}
        />
        {suffix ? (
          <span className="w-[2.5rem] shrink-0 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{suffix}</span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className={ERROR_TEXT}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ChipGroup<K extends string>({
  label,
  options,
  value,
  onChange,
  testPrefix,
}: {
  label: string;
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  testPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          data-testid={`${testPrefix}-${o.key}`}
          className={`${CHIP_BASE} ${value === o.key ? CHIP_ON : CHIP_OFF}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Re-expresses a typed number in the other unit system, leaving unparsable text alone. */
function convertDraft(text: string, convert: (n: number) => number): string {
  const n = parseNumber(text, "value");
  return n.ok ? draftNumber(convert(n.value)) : text;
}

export function GeneratorRuntimeCalculator() {
  const [ratingText, setRatingText] = useState("200");
  const [loadMode, setLoadMode] = useState<LoadMode>("percent");
  const [loadText, setLoadText] = useState("60");
  const [fuelId, setFuelId] = useState<FuelId>("diesel");
  const [system, setSystem] = useState<UnitSystem>("us");
  const [customCurve, setCustomCurve] = useState<string[] | null>(null);
  const [tankText, setTankText] = useState("500");
  const [usableText, setUsableText] = useState(String(fuelById("diesel").usableDefault ?? 100));
  const [targetText, setTargetText] = useState("48");

  const fuel = fuelById(fuelId);
  const unit = volumeUnit(fuel, system);
  const hasTank = fuel.usableDefault !== null;

  const rating = useMemo(() => parseRating(ratingText), [ratingText]);
  const ratingKw = rating.ok ? rating.value : null;
  const load = useMemo(() => parseLoad(loadText, loadMode, ratingKw), [loadText, loadMode, ratingKw]);

  const typical = useMemo(
    () => (ratingKw !== null ? typicalCurve(fuel, ratingKw, system) : null),
    [fuel, ratingKw, system],
  );
  const curveDrafts = useMemo(
    () => customCurve ?? (typical ? typical.map(draftNumber) : ["", "", "", ""]),
    [customCurve, typical],
  );
  const curve = useMemo(() => parseCurve(curveDrafts, unit), [curveDrafts, unit]);

  const tank = useMemo(
    () =>
      parseNumber(tankText, "the tank size", { min: 0, minExclusive: true, max: MAX_TANK, unit: ` ${unit}` }),
    [tankText, unit],
  );
  const usable = useMemo(
    () => parseNumber(usableText, "the usable share", { min: 0, minExclusive: true, max: 100, unit: " percent" }),
    [usableText],
  );
  const target = useMemo(
    () =>
      parseNumber(targetText, "the target runtime", {
        min: 0,
        minExclusive: true,
        max: MAX_TARGET_HOURS,
        unit: " hours",
      }),
    [targetText],
  );

  const tankReady = !hasTank || (tank.ok && usable.ok);
  const result = useMemo(() => {
    if (ratingKw === null || !load.ok || !curve.ok || !tankReady) return null;
    return computeRuntime({
      ratingKw,
      loadFraction: load.value,
      curve: curve.value.values,
      tank: hasTank && tank.ok ? tank.value : null,
      usableFraction: hasTank && usable.ok ? usable.value / 100 : 1,
    });
  }, [ratingKw, load, curve, tankReady, hasTank, tank, usable]);
  const run = result && result.ok ? result.value : null;

  const usableFraction = hasTank && usable.ok ? usable.value / 100 : 1;
  const fullLoadPerHour = curve.ok ? curve.value.values[3] : null;

  function chooseFuel(next: FuelId) {
    if (next === fuelId) return;
    setFuelId(next);
    setCustomCurve(null);
    const nextFuel = fuelById(next);
    if (nextFuel.usableDefault !== null) setUsableText(String(nextFuel.usableDefault));
  }

  function chooseSystem(next: UnitSystem) {
    if (next === system) return;
    const convert = (n: number) => convertVolume(n, fuel, system, next);
    if (customCurve) setCustomCurve(customCurve.map((t) => convertDraft(t, convert)));
    // Only liquid fuels have a tank, so the tank converts as a liquid even
    // while natural gas is selected and the field is hidden.
    setTankText((t) => convertDraft(t, (n) => (next === "metric" ? n * LITERS_PER_GALLON : n / LITERS_PER_GALLON)));
    setSystem(next);
  }

  function editCurve(index: number, value: string) {
    setCustomCurve((prev) => (prev ?? curveDrafts).map((v, i) => (i === index ? value : v)));
  }

  const vaporUnit = system === "us" ? "ft³" : "m³";
  const lightDiesel = run !== null && fuel.id === "diesel" && run.loadFraction < WET_STACKING_FRACTION;
  const runtime = run && run.hours !== null ? formatHours(run.hours) : null;

  const pointRows =
    curve.ok && ratingKw !== null
      ? LOAD_POINTS.map((p, i) => {
          const perHour = curve.value.values[i];
          return {
            label: pct(p),
            kw: ratingKw * p,
            perHour,
            hours: hasTank && tank.ok ? (tank.value * usableFraction) / perHour : null,
          };
        })
      : null;

  // Sizing needs the fuel rate and the usable share, but not the current
  // tank, so a half-typed tank size does not hide it.
  const perHourAtLoad = useMemo(
    () => (load.ok && curve.ok ? interpolateCurve(curve.value.values, load.value) : null),
    [load, curve],
  );
  const sizing =
    perHourAtLoad && perHourAtLoad.ok && target.ok && (!hasTank || usable.ok)
      ? {
          atLoad: tankForRuntime(perHourAtLoad.value, target.value, usableFraction),
          atFull: fullLoadPerHour !== null ? tankForRuntime(fullLoadPerHour, target.value, usableFraction) : null,
        }
      : null;

  const idle = curve.ok ? interpolateCurve(curve.value.values, 0) : null;

  return (
    <ToolShell slug="generator-runtime-calculator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Generator and load">
            <div className="space-y-5">
              <Field
                id="gen-rating"
                label="Standby rating"
                value={ratingText}
                onChange={setRatingText}
                error={errorOf(rating)}
                suffix="kW"
                testId="input-rating"
              />
              <div>
                <div className={LABEL}>Load given as</div>
                <div className="mt-2">
                  <ChipGroup
                    label="Load given as"
                    options={[
                      { key: "percent" as LoadMode, label: "% of rating" },
                      { key: "kw" as LoadMode, label: "kW" },
                    ]}
                    value={loadMode}
                    onChange={(next) => {
                      if (next === loadMode) return;
                      // Carry the current load across so switching units does not change it.
                      if (load.ok && ratingKw !== null) {
                        const v = next === "kw" ? load.value * ratingKw : load.value * 100;
                        setLoadText(String(Number(v.toFixed(2))));
                      }
                      setLoadMode(next);
                    }}
                    testPrefix="button-load"
                  />
                </div>
              </div>
              <Field
                id="gen-load"
                label={loadMode === "percent" ? "Load, percent of rating" : "Load"}
                value={loadText}
                onChange={setLoadText}
                error={errorOf(load)}
                suffix={loadMode === "percent" ? "%" : "kW"}
                testId="input-load"
              />
              <div>
                <div className={LABEL}>Fuel</div>
                <div className="mt-2">
                  <ChipGroup
                    label="Fuel"
                    options={FUELS.map((f) => ({ key: f.id, label: f.label }))}
                    value={fuelId}
                    onChange={chooseFuel}
                    testPrefix="button-fuel"
                  />
                </div>
              </div>
              <div>
                <div className={LABEL}>Units</div>
                <div className="mt-2">
                  <ChipGroup
                    label="Units"
                    options={[
                      { key: "us" as UnitSystem, label: fuel.state === "liquid" ? "US gallons" : "Cubic feet" },
                      { key: "metric" as UnitSystem, label: fuel.state === "liquid" ? "Liters" : "Cubic meters" },
                    ]}
                    value={system}
                    onChange={chooseSystem}
                    testPrefix="button-units"
                  />
                </div>
              </div>
            </div>
          </ToolPanel>

          <ToolPanel title={hasTank ? "Tank" : "Supply"}>
            {hasTank ? (
              <div className="space-y-5">
                <Field
                  id="gen-tank"
                  label="Tank size, nominal"
                  value={tankText}
                  onChange={setTankText}
                  error={errorOf(tank)}
                  suffix={unit}
                  testId="input-tank"
                />
                <Field
                  id="gen-usable"
                  label="Usable share of the tank"
                  value={usableText}
                  onChange={setUsableText}
                  error={errorOf(usable)}
                  suffix="%"
                  testId="input-usable"
                />
                <p className={HINT_TEXT}>{fuel.usableNote}</p>
              </div>
            ) : (
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Natural gas arrives through the utility main, so there is no tank to run dry. The limit is the supply
                itself: the meter, regulator and piping have to deliver the full-load flow, and the gas service can be
                cut by the same earthquake or emergency that took out the power.
              </p>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="Fuel curve">
          <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-curve-source">
            {customCurve
              ? "Your values. Every result below is interpolated from these four figures."
              : ratingKw !== null
                ? `Typical values for a ${kw(ratingKw)} ${fuel.label.toLowerCase()} set, scaled from mid-size standby units of roughly 100 to 1,000 kW. Smaller sets burn more per kWh. Replace them with the fuel consumption table from the generator's data sheet.`
                : "Enter a valid rating to fill in typical values."}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-left" data-testid="table-curve">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH}>
                    Load
                  </th>
                  <th scope="col" className={TH}>
                    Output
                  </th>
                  <th scope="col" className={TH}>
                    Fuel, {unit}/h
                  </th>
                  <th scope="col" className={TH}>
                    kWh per {unit}
                  </th>
                </tr>
              </thead>
              <tbody>
                {LOAD_POINTS.map((p, i) => {
                  const n = parseNumber(curveDrafts[i] ?? "", "value", { min: 0, minExclusive: true });
                  return (
                    <tr key={p} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                      <td className={TD_DIM}>{pct(p)}</td>
                      <td className={TD}>{ratingKw !== null ? kw(ratingKw * p) : ""}</td>
                      <td className="py-2 pr-4">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={curveDrafts[i] ?? ""}
                          onChange={(event) => editCurve(i, event.target.value)}
                          spellCheck={false}
                          autoComplete="off"
                          aria-label={`Fuel per hour at ${p * 100} percent load, ${unit} per hour`}
                          aria-invalid={n.ok ? undefined : true}
                          data-testid={`input-curve-${p * 100}`}
                          className={CELL_INPUT}
                        />
                      </td>
                      <td className={TD}>
                        {ratingKw !== null && n.ok ? formatQuantity((ratingKw * p) / n.value) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!curve.ok && (customCurve || ratingKw !== null) ? (
            <p role="alert" className={ERROR_TEXT}>
              {curve.error}
            </p>
          ) : curve.ok && curve.value.warning ? (
            <p className={WARN_BOX}>{curve.value.warning}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {customCurve ? (
              <button
                type="button"
                onClick={() => setCustomCurve(null)}
                data-testid="button-reset-curve"
                className={`${CHIP_BASE} ${CHIP_OFF}`}
              >
                Use typical values
              </button>
            ) : null}
            <p className="min-w-0 flex-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Loads between the points are interpolated in a straight line. Below 25 percent the line from 25 to 50
              percent is extended
              {idle && idle.ok ? `, which puts idle at about ${formatQuantity(idle.value)} ${unit}/h` : ""}.
            </p>
          </div>
        </ToolPanel>

        {result && !result.ok ? (
          <p role="alert" className={DANGER_BOX}>
            {result.error}
          </p>
        ) : null}

        {run ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ToolPanel title={hasTank ? "Runtime on this tank" : "Fuel use"}>
              <div data-testid="output-runtime" aria-live="polite">
                {runtime ? (
                  <>
                    <p className={BIG}>{runtime.short}</p>
                    {runtime.long ? (
                      <p className="mt-2 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">{runtime.long}</p>
                    ) : null}
                  </>
                ) : (
                  <p className={BIG}>
                    {formatQuantity(run.perHour)}{" "}
                    <span className="text-[0.5em] text-[hsl(var(--brand-ash))]">{unit}/h</span>
                  </p>
                )}
              </div>
              <div className="mt-4">
                <ToolResult label="Load" value={`${kw(run.loadKw)} (${pct(run.loadFraction)} of rating)`} />
                <ToolResult label="Fuel per hour" value={`${formatQuantity(run.perHour)} ${unit}/h`} testId="text-per-hour" />
                {fuel.id === "propane" ? (
                  <ToolResult
                    label="As vapor"
                    value={`${formatQuantity(propaneVapor(run.perHour, system))} ${vaporUnit}/h`}
                  />
                ) : null}
                <ToolResult label="Fuel per day" value={`${formatQuantity(run.perDay)} ${unit}/day`} />
                {run.kwhPerUnit !== null ? (
                  <ToolResult label={`Energy per ${unit}`} value={`${formatQuantity(run.kwhPerUnit)} kWh`} />
                ) : null}
                {run.usable !== null ? (
                  <ToolResult label="Usable fuel" value={`${formatQuantity(run.usable)} ${unit}`} />
                ) : null}
                {run.hours !== null ? (
                  <ToolResult
                    label="Days of autonomy"
                    value={days(run.hours / 24)}
                    testId="text-days"
                  />
                ) : null}
                {!hasTank && fullLoadPerHour !== null ? (
                  <ToolResult
                    label="Supply must deliver"
                    value={`${formatQuantity(fullLoadPerHour)} ${unit}/h at full load`}
                    testId="text-supply"
                  />
                ) : null}
              </div>
              {lightDiesel ? (
                <p className={WARN_BOX} data-testid="text-wet-stacking">
                  At {pct(run.loadFraction)} of its rating this diesel is below the 30 percent floor engine makers and
                  NFPA 110 use for exercising. Long runs this light lead to wet stacking. Size the set closer to the
                  real load, or plan load bank runs to burn the deposits off.
                </p>
              ) : null}
              {run.loadKw === 0 ? (
                <p className={HINT_TEXT}>
                  At zero load the set is idling, so it burns fuel and produces nothing. The idle figure is an
                  extrapolation; the data sheet may list a measured one.
                </p>
              ) : null}
            </ToolPanel>

            <ToolPanel title={hasTank ? "Runtime by load" : "Fuel by load"}>
              {pointRows ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-left" data-testid="table-loads">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th scope="col" className={TH}>
                          Load
                        </th>
                        <th scope="col" className={TH}>
                          {unit}/h
                        </th>
                        <th scope="col" className={TH}>
                          {hasTank ? "Runtime" : "Per day"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...pointRows.map((r) => ({ ...r, mine: false })),
                        {
                          label: `${pct(run.loadFraction)} (yours)`,
                          kw: run.loadKw,
                          perHour: run.perHour,
                          hours: run.hours,
                          mine: true,
                        },
                      ]
                        .sort((a, b) => a.kw - b.kw || Number(a.mine) - Number(b.mine))
                        .map((r) => (
                          <tr
                            key={r.label}
                            className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${r.mine ? "bg-[hsl(var(--brand-signal)/0.08)]" : ""}`}
                          >
                            <td className={r.mine ? "py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]" : TD_DIM}>
                              {r.label}
                            </td>
                            <td className={TD}>{formatQuantity(r.perHour)}</td>
                            <td className={TD}>
                              {r.hours !== null
                                ? formatHours(r.hours).short
                                : `${formatQuantity(r.perHour * 24)} ${unit}`}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className={HINT_TEXT}>
                Halving the load does not {hasTank ? "double the runtime" : "halve the gas flow"}. Part of the fuel
                keeps the engine turning whatever the load, so energy per {unit} falls as the load drops.
              </p>
            </ToolPanel>
          </div>
        ) : null}

        <ToolPanel title={hasTank ? "Tank needed for a target runtime" : "Gas needed for a target runtime"}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="gen-target"
              label="Target runtime"
              value={targetText}
              onChange={setTargetText}
              error={errorOf(target)}
              suffix="h"
              testId="input-target"
            />
            <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Common targets">
              {TARGETS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setTargetText(String(h))}
                  aria-pressed={target.ok && target.value === h}
                  data-testid={`button-target-${h}`}
                  className={`${CHIP_BASE} ${target.ok && target.value === h ? CHIP_ON : CHIP_OFF}`}
                >
                  {h} h
                </button>
              ))}
            </div>
          </div>
          {sizing && target.ok ? (
            <div className="mt-4" data-testid="output-sizing">
              <ToolResult
                label={`Fuel for ${formatQuantity(target.value)} h at your load`}
                value={`${formatQuantity(sizing.atLoad.fuel)} ${unit}`}
              />
              {hasTank ? (
                <ToolResult
                  label="Nominal tank at your load"
                  value={`${formatQuantity(sizing.atLoad.tank)} ${unit}`}
                  testId="text-tank-needed"
                />
              ) : null}
              {sizing.atFull ? (
                <>
                  <ToolResult
                    label={`Fuel for ${formatQuantity(target.value)} h at full load`}
                    value={`${formatQuantity(sizing.atFull.fuel)} ${unit}`}
                  />
                  {hasTank ? (
                    <ToolResult
                      label="Nominal tank at full load"
                      value={`${formatQuantity(sizing.atFull.tank)} ${unit}`}
                      testId="text-tank-full"
                    />
                  ) : null}
                </>
              ) : null}
              <p className={HINT_TEXT}>
                {hasTank
                  ? `Tank sizes divide the fuel by the ${usable.ok ? usable.value : ""} percent usable share. `
                  : ""}
                NFPA 110 states its Class as the hours a system must run at rated load without refueling, so a Class 48
                design is sized on the full-load line, not on today's load.
              </p>
            </div>
          ) : (
            <p className={HINT_TEXT}>Fix the inputs above to size {hasTank ? "a tank" : "the supply"}.</p>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
