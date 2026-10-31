/**
 * UPS runtime estimator.
 *
 * Every input is held as the string the reader typed and parsed on each
 * render, so a half-typed value shows a precise message instead of snapping
 * to a number. Battery energy and load can each be entered two ways; both
 * collapse to watt-hours and watts before any arithmetic. The linear and
 * Peukert estimates and the W and VA rating check live in
 * lib/toolkit/ups-runtime-calculator so they can be tested without React.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  END_OF_LIFE_HEALTH,
  LOAD_STEPS,
  PEUKERT_PRESETS,
  type Parsed,
  batteryWh,
  estimateRuntime,
  formatHours,
  formatNum,
  formatPct,
  parse,
  ratingCheck,
} from "@/lib/toolkit/ups-runtime-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON_CLASS =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF_CLASS =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

type BatteryMode = "wh" | "cells";
type LoadMode = "W" | "VA";

/* ----------------------------------------------------------------- helpers */

function FieldMessage({ id, error, hint }: { id: string; error: string | null; hint: string }) {
  return error ? (
    <p
      id={`${id}-error`}
      role="alert"
      className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
    >
      {error}
    </p>
  ) : (
    <p id={`${id}-hint`} className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
      {hint}
    </p>
  );
}

function errorOf(parsed: Parsed): string | null {
  return parsed.kind === "error" ? parsed.message : null;
}

function valueOf(parsed: Parsed): number | null {
  return parsed.kind === "ok" ? parsed.value : null;
}

/** A labeled text field with its hint or error underneath. */
function NumberField({
  id,
  label,
  value,
  onChange,
  parsed,
  hint,
  placeholder,
  testId,
  inputMode = "decimal",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  parsed: Parsed;
  hint: string;
  placeholder: string;
  testId: string;
  inputMode?: "decimal" | "numeric";
}) {
  const error = errorOf(parsed);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        placeholder={placeholder}
        data-testid={testId}
        className={`mt-2 ${INPUT_CLASS}`}
      />
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

/** Two mutually exclusive choices drawn as pressed and unpressed buttons. */
function ModeSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
  testPrefix,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
  testPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          data-testid={`${testPrefix}-${option.id.toLowerCase()}`}
          className={`${CHIP_CLASS} ${value === option.id ? CHIP_ON_CLASS : CHIP_OFF_CLASS}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A thin bar for a share of a rating, capped at the track and colored once it is over. */
function ShareBar({ fraction }: { fraction: number }) {
  const over = fraction > 1;
  const warm = fraction > 0.8;
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--brand-iron)/0.6)]" aria-hidden="true">
      <div
        className={`h-full rounded-full ${
          over
            ? "bg-[hsl(var(--brand-danger))]"
            : warm
              ? "bg-[hsl(var(--brand-amber))]"
              : "bg-[hsl(var(--brand-signal))]"
        }`}
        style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- component */

export function UpsRuntimeCalculator() {
  const [batteryMode, setBatteryMode] = useState<BatteryMode>("cells");
  const [wh, setWh] = useState("216");
  const [volts, setVolts] = useState("12");
  const [ah, setAh] = useState("9");
  const [count, setCount] = useState("2");
  const [health, setHealth] = useState("100");

  const [loadMode, setLoadMode] = useState<LoadMode>("W");
  const [load, setLoad] = useState("500");
  const [pf, setPf] = useState("0.9");
  const [ratedVA, setRatedVA] = useState("1500");
  const [ratedW, setRatedW] = useState("1000");

  const [efficiency, setEfficiency] = useState("90");
  const [dod, setDod] = useState("80");
  const [peukert, setPeukert] = useState("1.1");
  const [ratedHours, setRatedHours] = useState("20");

  /* parse */
  const whParsed = useMemo(() => parse.wh(wh), [wh]);
  const voltsParsed = useMemo(() => parse.volts(volts), [volts]);
  const ahParsed = useMemo(() => parse.ah(ah), [ah]);
  const countParsed = useMemo(() => parse.count(count), [count]);
  const healthParsed = useMemo(() => parse.percent(health, "Battery health", "100"), [health]);
  const loadParsed = useMemo(() => parse.load(load, loadMode), [load, loadMode]);
  const pfParsed = useMemo(() => parse.powerFactor(pf), [pf]);
  const ratedVAParsed = useMemo(() => parse.rating(ratedVA, "VA"), [ratedVA]);
  const ratedWRaw = useMemo(() => parse.rating(ratedW, "W"), [ratedW]);
  const efficiencyParsed = useMemo(() => parse.percent(efficiency, "Inverter efficiency", "90"), [efficiency]);
  const dodParsed = useMemo(() => parse.percent(dod, "Depth of discharge", "80"), [dod]);
  const peukertParsed = useMemo(() => parse.peukert(peukert), [peukert]);
  const ratedHoursParsed = useMemo(() => parse.ratedHours(ratedHours), [ratedHours]);

  // A watt rating above the VA rating is impossible, since W = VA x PF and PF <= 1.
  const ratedWParsed: Parsed =
    ratedWRaw.kind === "ok" && ratedVAParsed.kind === "ok" && ratedWRaw.value > ratedVAParsed.value
      ? {
          kind: "error",
          message: `A watt rating cannot be higher than the VA rating (${formatNum(ratedVAParsed.value)} VA), because watts are at most volt-amperes.`,
        }
      : ratedWRaw;

  /* combine: the cells product is capped the same as a typed Wh figure */
  const cellsWh =
    voltsParsed.kind === "ok" && ahParsed.kind === "ok" && countParsed.kind === "ok"
      ? batteryWh(voltsParsed.value, ahParsed.value, countParsed.value)
      : null;
  const cellsError = cellsWh !== null && cellsWh > 10_000_000 ? "That battery bank is over 10 MWh, past the limit here." : null;
  const capacityWh = batteryMode === "wh" ? valueOf(whParsed) : cellsError ? null : cellsWh;

  const pfValue = valueOf(pfParsed);
  const loadValue = valueOf(loadParsed);
  const loadW = loadValue === null ? null : loadMode === "W" ? loadValue : pfValue === null ? null : loadValue * pfValue;
  const loadVA = loadValue === null ? null : loadMode === "VA" ? loadValue : pfValue === null ? null : loadValue / pfValue;

  const eff = valueOf(efficiencyParsed);
  const dodValue = valueOf(dodParsed);
  const healthValue = valueOf(healthParsed);
  const ratedHoursValue = valueOf(ratedHoursParsed);
  const peukertValue = valueOf(peukertParsed);
  const peukertOk = peukertParsed.kind !== "error" && (peukertValue === null || ratedHoursValue !== null);

  const inputs = useMemo(
    () =>
      capacityWh !== null && loadW !== null && eff !== null && dodValue !== null && healthValue !== null && peukertOk
        ? {
            capacityWh,
            efficiency: eff / 100,
            loadW,
            dod: dodValue / 100,
            health: healthValue / 100,
            peukert: peukertValue,
            ratedHours: ratedHoursValue ?? 20,
          }
        : null,
    [capacityWh, loadW, eff, dodValue, healthValue, peukertOk, peukertValue, ratedHoursValue],
  );

  const result = useMemo(() => (inputs ? estimateRuntime(inputs) : null), [inputs]);
  const endOfLife = useMemo(
    () => (inputs && inputs.health > END_OF_LIFE_HEALTH ? estimateRuntime({ ...inputs, health: END_OF_LIFE_HEALTH }) : null),
    [inputs],
  );

  const ratedWValue = valueOf(ratedWParsed);
  const ratedVAValue = valueOf(ratedVAParsed);
  const check =
    loadW !== null && loadVA !== null && ratedWParsed.kind !== "error" && ratedVAParsed.kind !== "error"
      ? ratingCheck(loadW, loadVA, ratedWValue, ratedVAValue)
      : null;

  const closest = check ? (check.limiting === "W" ? check.wFraction : check.vaFraction) : null;

  const steps = useMemo(
    () =>
      inputs
        ? LOAD_STEPS.map((m) => {
            const w = inputs.loadW * m;
            return { m, w, r: estimateRuntime({ ...inputs, loadW: w }) };
          })
        : [],
    [inputs],
  );

  const headline = result ? (result.peukertHours ?? result.linearHours) : null;
  const headlineLabel = result && result.peukertHours !== null ? "Peukert-adjusted estimate" : "Linear estimate";

  const status = result
    ? `${headlineLabel}: ${formatHours(headline ?? 0)} at ${formatNum(inputs?.loadW ?? 0)} W from ${formatNum(capacityWh ?? 0)} Wh of battery.`
    : "Fix the highlighted field, or fill in the empty one, to see the runtime.";

  const summary =
    result && inputs
      ? [
          "UPS runtime estimate",
          `Battery          ${formatNum(inputs.capacityWh)} Wh nameplate, ${formatPct(inputs.health)} health`,
          `Load             ${formatNum(inputs.loadW)} W${loadVA !== null ? ` / ${formatNum(loadVA)} VA` : ""}`,
          `Inverter         ${formatPct(inputs.efficiency)} efficient, ${formatNum(result.dcWatts)} W from the battery`,
          `Depth used       ${formatPct(inputs.dod)}`,
          `Linear runtime   ${formatHours(result.linearHours)}`,
          ...(result.peukertHours !== null
            ? [`Peukert k=${inputs.peukert}   ${formatHours(result.peukertHours)} (estimate, C${inputs.ratedHours} rating)`]
            : []),
          ...(check && check.fits !== null ? [`Rating check     ${check.fits ? "fits" : "does not fit"}`] : []),
        ].join("\n")
      : "";

  return (
    <ToolShell slug="ups-runtime-calculator">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <ToolPanel title="Battery">
            <ModeSwitch
              label="How to enter battery capacity"
              value={batteryMode}
              options={[
                { id: "cells", label: "Volts × Ah × count" },
                { id: "wh", label: "Total Wh" },
              ]}
              onChange={setBatteryMode}
              testPrefix="button-battery"
            />
            <div className="mt-5">
              {batteryMode === "wh" ? (
                <NumberField
                  id="ups-wh"
                  label="Battery capacity, Wh"
                  value={wh}
                  onChange={setWh}
                  parsed={whParsed}
                  hint="Nameplate watt-hours of the whole battery, at its rated discharge period."
                  placeholder="216"
                  testId="input-battery-wh"
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <NumberField
                      id="ups-volts"
                      label="Volts each"
                      value={volts}
                      onChange={setVolts}
                      parsed={voltsParsed}
                      hint="Nominal, such as 12."
                      placeholder="12"
                      testId="input-battery-volts"
                    />
                    <NumberField
                      id="ups-ah"
                      label="Ah each"
                      value={ah}
                      onChange={setAh}
                      parsed={ahParsed}
                      hint="From the label."
                      placeholder="9"
                      testId="input-battery-ah"
                    />
                    <NumberField
                      id="ups-count"
                      label="Batteries"
                      value={count}
                      onChange={setCount}
                      parsed={countParsed}
                      hint="Identical units."
                      placeholder="2"
                      testId="input-battery-count"
                      inputMode="numeric"
                    />
                  </div>
                  <p
                    className={`mt-3 break-words font-mono-tight text-xs leading-relaxed ${
                      cellsError ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-bone-dim))]"
                    }`}
                    role={cellsError ? "alert" : undefined}
                    data-testid="text-battery-wh"
                  >
                    {cellsError ??
                      (cellsWh !== null
                        ? `${volts.trim()} V × ${ah.trim()} Ah × ${count.trim()} = ${formatNum(cellsWh)} Wh. Series or parallel wiring does not change the total energy.`
                        : "Total energy is volts times amp-hours times the number of batteries.")}
                  </p>
                </>
              )}
            </div>
            <div className="mt-5">
              <NumberField
                id="ups-health"
                label="Battery health, percent of rated capacity"
                value={health}
                onChange={setHealth}
                parsed={healthParsed}
                hint="100 for a new battery. VRLA batteries are usually replaced when a discharge test shows 80 percent."
                placeholder="100"
                testId="input-battery-health"
              />
            </div>
          </ToolPanel>

          <ToolPanel title="Load and UPS rating">
            <ModeSwitch
              label="How to enter the load"
              value={loadMode}
              options={[
                { id: "W", label: "Watts" },
                { id: "VA", label: "Volt-amperes" },
              ]}
              onChange={setLoadMode}
              testPrefix="button-load"
            />
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                id="ups-load"
                label={loadMode === "W" ? "Load, W" : "Load, VA"}
                value={load}
                onChange={setLoad}
                parsed={loadParsed}
                hint={
                  loadMode === "W"
                    ? "Real power, as a power meter or PDU reports it."
                    : "Apparent power: volts times amps at the outlet."
                }
                placeholder="500"
                testId="input-load"
              />
              <NumberField
                id="ups-pf"
                label="Power factor"
                value={pf}
                onChange={setPf}
                parsed={pfParsed}
                hint={
                  loadMode === "W" && loadVA !== null
                    ? `Gives ${formatNum(loadVA)} VA. Supplies with active PFC usually run at 0.9 or better.`
                    : loadMode === "VA" && loadW !== null
                      ? `Gives ${formatNum(loadW)} W. Supplies with active PFC usually run at 0.9 or better.`
                      : "Watts divided by volt-amperes, 0 to 1."
                }
                placeholder="0.9"
                testId="input-power-factor"
              />
              <NumberField
                id="ups-rated-va"
                label="UPS rating, VA (optional)"
                value={ratedVA}
                onChange={setRatedVA}
                parsed={ratedVAParsed}
                hint="The first number on the model, such as 1500."
                placeholder="1500"
                testId="input-rated-va"
              />
              <NumberField
                id="ups-rated-w"
                label="UPS rating, W (optional)"
                value={ratedW}
                onChange={setRatedW}
                parsed={ratedWParsed}
                hint="The watt limit on the data sheet, always at or below the VA figure."
                placeholder="1000"
                testId="input-rated-w"
              />
            </div>
          </ToolPanel>

          <ToolPanel title="Conversion and discharge">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                id="ups-eff"
                label="Inverter efficiency, percent"
                value={efficiency}
                onChange={setEfficiency}
                parsed={efficiencyParsed}
                hint="DC to AC. Often 85 to 95 near rated load, lower at light load."
                placeholder="90"
                testId="input-efficiency"
              />
              <NumberField
                id="ups-dod"
                label="Usable depth of discharge, percent"
                value={dod}
                onChange={setDod}
                parsed={dodParsed}
                hint="100 runs to the low-battery cutoff. Lower leaves time for a clean shutdown."
                placeholder="80"
                testId="input-dod"
              />
            </div>
            <div className="mt-5">
              <NumberField
                id="ups-peukert"
                label="Peukert exponent (optional, lead-acid)"
                value={peukert}
                onChange={setPeukert}
                parsed={peukertParsed}
                hint="From the battery data sheet or a discharge test. Empty gives the linear figure only."
                placeholder="1.1"
                testId="input-peukert"
              />
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Typical Peukert exponents">
                {PEUKERT_PRESETS.map((preset) => {
                  const active = peukert.trim() === preset.value;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      title={preset.note}
                      onClick={() => setPeukert(preset.value)}
                      aria-pressed={active}
                      data-testid={`button-peukert-${preset.value || "off"}`}
                      className={`${CHIP_CLASS} ${active ? CHIP_ON_CLASS : CHIP_OFF_CLASS}`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {peukertValue !== null || peukertParsed.kind === "error" ? (
              <div className="mt-5">
                <NumberField
                  id="ups-rated-hours"
                  label="Capacity rating period, hours"
                  value={ratedHours}
                  onChange={setRatedHours}
                  parsed={ratedHoursParsed}
                  hint="The discharge time the Ah figure is rated at. Small VRLA batteries are usually rated at 20 hours (C20)."
                  placeholder="20"
                  testId="input-rated-hours"
                />
              </div>
            ) : null}
          </ToolPanel>
        </div>

        <div className="min-w-0 space-y-6">
          <ToolPanel title="Runtime">
            <div className={LABEL_CLASS}>{headlineLabel}</div>
            <p
              data-testid="output-ups-runtime"
              className="mt-2 font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
            >
              {headline !== null ? formatHours(headline) : "--"}
            </p>
            <p
              role="status"
              aria-live="polite"
              data-testid="text-ups-summary"
              className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
            >
              {status}
            </p>

            {result && inputs ? (
              <div className="mt-4">
                <ToolResult label="Linear runtime" value={formatHours(result.linearHours)} testId="text-linear-runtime" />
                {result.peukertHours !== null ? (
                  <ToolResult
                    label="Peukert-adjusted, estimate"
                    value={formatHours(result.peukertHours)}
                    testId="text-peukert-runtime"
                  />
                ) : null}
                {result.capacityFraction !== null ? (
                  <ToolResult
                    label="Capacity available at this load"
                    value={`${formatPct(result.capacityFraction)} of rated`}
                    testId="text-capacity-fraction"
                  />
                ) : null}
                <ToolResult label="Drawn from the battery" value={`${formatNum(result.dcWatts)} W`} />
                <ToolResult label="Usable energy" value={`${formatNum(result.usableWh)} Wh`} />
                {endOfLife ? (
                  <ToolResult
                    label="Same load at 80% health"
                    value={formatHours(endOfLife.peukertHours ?? endOfLife.linearHours)}
                    testId="text-end-of-life"
                  />
                ) : null}
              </div>
            ) : null}

            {result && inputs && result.peukertHours !== null ? (
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {result.clamped
                  ? `This load discharges the battery more slowly than its ${inputs.ratedHours}-hour rating, where Peukert's law overstates capacity, so the estimate is held at the linear figure.`
                  : `This load empties the battery about ${formatNum(1 / result.rateRatio)} times faster than its ${inputs.ratedHours}-hour rating, so under Peukert's law only part of the rated capacity is there to use. Treat the adjusted figure as an estimate: the exponent itself is fitted to test data and drifts with temperature and age.`}
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Rating check">
            {check && loadW !== null && loadVA !== null ? (
              check.fits === null ? (
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
                  Enter the UPS VA and W ratings to check the load against both.
                </p>
              ) : (
                <div data-testid="output-rating-check">
                  <p
                    className={`font-display text-xl font-medium ${
                      check.fits ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-danger))]"
                    }`}
                    data-testid="text-rating-verdict"
                  >
                    {check.fits ? "The load fits" : "The load does not fit"}
                  </p>
                  {check.wFraction !== null && ratedWValue !== null ? (
                    <div className="mt-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className={LABEL_CLASS}>Real power</span>
                        <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {formatNum(loadW)} W of {formatNum(ratedWValue)} W ·{" "}
                          <span className={check.fitsW ? "" : "text-[hsl(var(--brand-danger))]"}>
                            {formatPct(check.wFraction)}
                          </span>
                        </span>
                      </div>
                      <ShareBar fraction={check.wFraction} />
                    </div>
                  ) : null}
                  {check.vaFraction !== null && ratedVAValue !== null ? (
                    <div className="mt-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className={LABEL_CLASS}>Apparent power</span>
                        <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {formatNum(loadVA)} VA of {formatNum(ratedVAValue)} VA ·{" "}
                          <span className={check.fitsVA ? "" : "text-[hsl(var(--brand-danger))]"}>
                            {formatPct(check.vaFraction)}
                          </span>
                        </span>
                      </div>
                      <ShareBar fraction={check.vaFraction} />
                    </div>
                  ) : null}
                  <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {check.fits === false
                      ? check.fitsW === false && check.fitsVA === false
                        ? "Both limits are exceeded. The UPS will overload on battery and may refuse the load on line power too."
                        : check.fitsW === false
                          ? "The watt limit is exceeded even though the VA figure looks fine. The watt rating is the one that usually binds with modern power supplies."
                          : "The VA limit is exceeded even though the watts fit. A low power factor draws more current than the real power suggests, and the inverter has to carry that current."
                      : closest !== null && closest > 0.8
                        ? `Within both limits, but the ${check.limiting} rating is above 80 percent. Many operators keep steady load under about 80 percent to leave room for growth and inrush.`
                        : `Within both limits. The ${check.limiting} rating is the closer of the two.`}
                    {ratedWValue === null || ratedVAValue === null
                      ? " Only one rating was given, so only that limit is checked."
                      : ""}
                  </p>
                </div>
              )
            ) : (
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
                Needs a valid load and power factor.
              </p>
            )}
          </ToolPanel>
        </div>
      </div>

      {result && inputs ? (
        <>
          <ToolPanel title="Runtime against load" className="mt-6">
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The same battery at other loads. Linear runtime doubles when the load halves;
              {inputs.peukert !== null
                ? ` with a Peukert exponent of ${inputs.peukert} it grows by up to 2^${inputs.peukert}, about ${formatNum(2 ** inputs.peukert)} times.`
                : " add a Peukert exponent to see the lead-acid penalty at high current."}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-runtime-load">
                <caption className="sr-only">Estimated runtime at multiples of the entered load</caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    {["Load", "Of W rating", "Linear", "Peukert estimate"].map((heading) => (
                      <th key={heading} scope="col" className={TH_CLASS}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {steps.map((row) => {
                    const share = ratedWValue !== null ? row.w / ratedWValue : null;
                    const current = row.m === 1;
                    return (
                      <tr
                        key={row.m}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0 ${
                          current ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""
                        }`}
                      >
                        <th
                          scope="row"
                          className="py-2.5 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                        >
                          {formatNum(row.w)} W
                          {current ? <span className="text-[hsl(var(--brand-signal))]"> · entered</span> : null}
                        </th>
                        <td
                          className={`py-2.5 pr-4 font-mono-tight text-sm ${
                            share !== null && share > 1
                              ? "text-[hsl(var(--brand-danger))]"
                              : "text-[hsl(var(--brand-bone-dim))]"
                          }`}
                        >
                          {share === null ? "n/a" : `${formatPct(share)}${share > 1 ? " over" : ""}`}
                        </td>
                        <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                          {formatHours(row.r.linearHours)}
                        </td>
                        <td className="py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {row.r.peukertHours === null ? "n/a" : formatHours(row.r.peukertHours)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ToolPanel>

          <div className="mt-6 flex flex-wrap items-start gap-3">
            <CopyButton value={summary} label="Copy the estimate as text" testId="button-copy-summary">
              <span>Copy summary</span>
            </CopyButton>
          </div>
        </>
      ) : null}
    </ToolShell>
  );
}
