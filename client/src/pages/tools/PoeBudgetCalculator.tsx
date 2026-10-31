/**
 * PoE budget calculator.
 *
 * A switch's PoE budget is spent twice over: once by what it reserves for
 * each port, which is usually the class maximum at the PSE, and again by
 * what the devices really draw. This page adds both up against the budget
 * and the port type, and separately walks through the I^2 R arithmetic that
 * turns a PSE figure into the smaller PD figure. All of the arithmetic is in
 * lib/toolkit/poe-budget-calculator, in integer milliwatts.
 */

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  MAX_BUDGET_W,
  MAX_CABLE_M,
  MAX_DEVICE_ROWS,
  MAX_MEASURED_W,
  MAX_PORTS,
  MAX_QUANTITY,
  POE_CLASSES,
  PSE_TYPES,
  PSE_VMAX,
  analyzeBudget,
  cableLoss,
  parseCount,
  parseDecimal,
  parseWattsMw,
  poeClass,
  wattsText,
  worstCaseFor,
  type DeviceLineInput,
  type Flag,
  type PseType,
} from "@/lib/toolkit/poe-budget-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "block font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none aria-[invalid=true]:border-[hsl(var(--brand-danger))]";
const BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ERROR_CLASS = "mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_CLASS = "mt-1.5 font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";

const FLAG_STYLE: Record<Flag["level"], string> = {
  danger:
    "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
};

interface CableState {
  errors: { pd?: string; len?: string; volts?: string; loop?: string };
  result: ReturnType<typeof cableLoss> | null;
  pdW?: number;
  volts?: number;
}

interface Row {
  id: number;
  name: string;
  qty: string;
  cls: number;
  measured: string;
}

/*
  A wiring closet that fits on measured draw and not on class. The measured
  figures are illustrative, of the order a switch reports for these device
  kinds, not values from any particular product.
*/
const EXAMPLE_ROWS: Omit<Row, "id">[] = [
  { name: "Desk phones", qty: "12", cls: 2, measured: "4.1" },
  { name: "Wi-Fi access points", qty: "6", cls: 4, measured: "17.5" },
  { name: "Fixed cameras", qty: "4", cls: 3, measured: "6.2" },
  { name: "PTZ camera with heater", qty: "1", cls: 6, measured: "38" },
];
const EXAMPLE_SWITCH = { budget: "370", ports: "24", pseType: 3 as PseType };

/** Short enough to fit a half-width select on a phone: "4 · 30 W". */
function classOption(cls: number): string {
  const c = poeClass(cls);
  return `${cls} · ${wattsText(c.pseMw, c.pseMw % 1000 === 0 ? 0 : 1)}`;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const p = (part / whole) * 100;
  return `${p.toLocaleString("en-US", { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;
}

function num(n: number, digits: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Bar({ label, used, budget, testId }: { label: string; used: number; budget: number | null; testId: string }) {
  const over = budget !== null && used > budget;
  const width = budget === null || budget <= 0 ? 0 : Math.min(100, (used / budget) * 100);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className={LABEL_CLASS}>{label}</span>
        <span
          data-testid={testId}
          className={`font-mono-tight text-sm ${over ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-bone))]"}`}
        >
          {wattsText(used)}
          {budget !== null ? (
            <span className="text-[hsl(var(--brand-ash))]">
              {" "}
              of {wattsText(budget)} · {pct(used, budget)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-[hsl(var(--brand-iron)/0.6)]" aria-hidden="true">
        <div
          className={`h-full rounded-full ${over ? "bg-[hsl(var(--brand-danger))]" : "bg-[hsl(var(--brand-signal))]"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function FlagNote({ flag, prefix }: { flag: Flag; prefix?: string }) {
  return (
    <p className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${FLAG_STYLE[flag.level]}`}>
      {prefix ? <span className="font-medium">{prefix}: </span> : null}
      {flag.text}
    </p>
  );
}

export function PoeBudgetCalculator() {
  const nextId = useRef(EXAMPLE_ROWS.length + 1);
  const [budget, setBudget] = useState(EXAMPLE_SWITCH.budget);
  const [ports, setPorts] = useState(EXAMPLE_SWITCH.ports);
  const [pseType, setPseType] = useState<PseType>(EXAMPLE_SWITCH.pseType);
  const [rows, setRows] = useState<Row[]>(() => EXAMPLE_ROWS.map((r, i) => ({ ...r, id: i + 1 })));

  const [cableCls, setCableCls] = useState(4);
  const [cablePd, setCablePd] = useState("25.5");
  const [cableLen, setCableLen] = useState("100");
  const [cableVolts, setCableVolts] = useState("50");
  const [cableLoop, setCableLoop] = useState("12.5");
  const [cablePairs, setCablePairs] = useState<2 | 4>(2);

  /* ------------------------------------------------------------ parsing */

  const budgetParsed = useMemo(
    () => parseWattsMw(budget, { label: "PoE budget", max: MAX_BUDGET_W, required: true }),
    [budget],
  );
  const portsParsed = useMemo(
    () => parseCount(ports, { label: "number of PoE ports", min: 1, max: MAX_PORTS, required: false, example: 24 }),
    [ports],
  );

  const rowChecks = useMemo(
    () =>
      rows.map((row, index) => {
        const qty = parseCount(row.qty, { label: "quantity", min: 1, max: MAX_QUANTITY, required: true, example: 1 });
        const measured = parseWattsMw(row.measured, {
          label: "measured draw",
          max: MAX_MEASURED_W,
          required: false,
          allowZero: true,
        });
        const name = row.name.trim() === "" ? `Device ${index + 1}` : row.name.trim();
        const line: DeviceLineInput | null =
          qty.ok && measured.ok && qty.value !== null
            ? { name, qty: qty.value, cls: row.cls, measuredMw: measured.value }
            : null;
        return {
          id: row.id,
          name,
          qtyError: qty.ok ? null : qty.message,
          measuredError: measured.ok ? null : measured.message,
          line,
        };
      }),
    [rows],
  );

  const validLines = useMemo(() => rowChecks.flatMap((c) => (c.line ? [c.line] : [])), [rowChecks]);
  const skipped = rowChecks.length - validLines.length;

  const result = useMemo(
    () =>
      analyzeBudget(
        {
          budgetMw: budgetParsed.ok ? budgetParsed.value : null,
          ports: portsParsed.ok ? portsParsed.value : null,
          pseType,
        },
        validLines,
      ),
    [budgetParsed, portsParsed, pseType, validLines],
  );

  const port = PSE_TYPES[pseType];
  const budgetMw = budgetParsed.ok ? budgetParsed.value : null;

  /* --------------------------------------------------------- row edits */

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((current) =>
      current.length >= MAX_DEVICE_ROWS
        ? current
        : [...current, { id: nextId.current++, name: "", qty: "1", cls: 4, measured: "" }],
    );
  }
  function removeRow(id: number) {
    setRows((current) => current.filter((row) => row.id !== id));
  }
  function loadExample() {
    setBudget(EXAMPLE_SWITCH.budget);
    setPorts(EXAMPLE_SWITCH.ports);
    setPseType(EXAMPLE_SWITCH.pseType);
    setRows(EXAMPLE_ROWS.map((r) => ({ ...r, id: nextId.current++ })));
  }
  function clearRows() {
    setRows([]);
  }

  /* ------------------------------------------------------------- cable */

  function chooseCableClass(cls: number) {
    const wc = worstCaseFor(cls);
    setCableCls(cls);
    setCablePd(String(poeClass(cls).pdMw / 1000));
    setCableVolts(String(wc.voltage));
    setCableLoop(String(wc.loopOhmsPer100m));
    setCablePairs(wc.pairs);
  }

  const cable = useMemo((): CableState => {
    const errors: CableState["errors"] = {};
    const pd = parseDecimal(cablePd);
    const len = parseDecimal(cableLen);
    const volts = parseDecimal(cableVolts);
    const loop = parseDecimal(cableLoop);
    if (!pd.ok) errors.pd = pd.message;
    else if (pd.value === null) errors.pd = "Enter the power the device draws.";
    else if (pd.value <= 0) errors.pd = "The device draw has to be more than 0 W.";
    else if (pd.value > MAX_MEASURED_W) errors.pd = `The device draw is capped at ${MAX_MEASURED_W} W.`;
    if (!len.ok) errors.len = len.message;
    else if (len.value === null) errors.len = "Enter the cable length.";
    else if (len.value < 0) errors.len = "The length cannot be negative.";
    else if (len.value > MAX_CABLE_M) errors.len = `802.3 defines PoE over a channel of at most ${MAX_CABLE_M} m.`;
    if (!volts.ok) errors.volts = volts.message;
    else if (volts.value === null) errors.volts = "Enter the PSE output voltage.";
    else if (volts.value < 30 || volts.value > 60) errors.volts = "Use a voltage between 30 and 60 V.";
    if (!loop.ok) errors.loop = loop.message;
    else if (loop.value === null) errors.loop = "Enter the loop resistance.";
    else if (loop.value <= 0 || loop.value > 50) errors.loop = "Use a resistance above 0 and at most 50 ohm per 100 m.";
    if (Object.keys(errors).length || !pd.ok || !len.ok || !volts.ok || !loop.ok) return { errors, result: null };
    const r = cableLoss({
      pdW: pd.value as number,
      lengthM: len.value as number,
      voltage: volts.value as number,
      loopOhmsPer100m: loop.value as number,
      pairs: cablePairs,
    });
    return { errors, result: r, pdW: pd.value as number, volts: volts.value as number };
  }, [cablePd, cableLen, cableVolts, cableLoop, cablePairs]);

  const cableClass = poeClass(cableCls);
  const cableType = PSE_TYPES[cableClass.type];

  /* ----------------------------------------------------------- summary */

  const liveSummary =
    result.devices === 0
      ? "No devices entered."
      : `${result.devices} ${result.devices === 1 ? "device" : "devices"}: ${wattsText(result.allocMw)} reserved by class, ` +
        `${wattsText(result.actualMw)} drawn` +
        (budgetMw !== null
          ? `, against a ${wattsText(budgetMw)} budget. ${
              result.actualOver ? "Over budget on measured draw." : result.allocOver ? "Over budget by class." : "Within budget."
            }`
          : ".");

  return (
    <ToolShell slug="poe-budget-calculator">
      <p role="status" aria-live="polite" className="sr-only">
        {liveSummary}
      </p>
      <div className="space-y-6">
        <ToolPanel title="Switch">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="poe-budget" className={LABEL_CLASS}>
                Total PoE budget (W)
              </label>
              <input
                id="poe-budget"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                aria-invalid={!budgetParsed.ok}
                aria-describedby="poe-budget-msg"
                data-testid="input-poe-budget"
                className={INPUT_CLASS}
              />
              <p id="poe-budget-msg" className={budgetParsed.ok ? HINT_CLASS : ERROR_CLASS}>
                {budgetParsed.ok ? "From the datasheet, for the power supplies installed." : budgetParsed.message}
              </p>
            </div>
            <div>
              <label htmlFor="poe-ports" className={LABEL_CLASS}>
                PoE ports
              </label>
              <input
                id="poe-ports"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={ports}
                onChange={(e) => setPorts(e.target.value)}
                aria-invalid={!portsParsed.ok}
                aria-describedby="poe-ports-msg"
                data-testid="input-poe-ports"
                className={INPUT_CLASS}
              />
              <p id="poe-ports-msg" className={portsParsed.ok ? HINT_CLASS : ERROR_CLASS}>
                {portsParsed.ok ? "Optional. Leave blank to skip the port count check." : portsParsed.message}
              </p>
            </div>
            <div>
              <label htmlFor="poe-type" className={LABEL_CLASS}>
                Port type
              </label>
              <select
                id="poe-type"
                value={pseType}
                onChange={(e) => setPseType(Number(e.target.value) as PseType)}
                data-testid="select-poe-type"
                className={INPUT_CLASS}
              >
                {([1, 2, 3, 4] as PseType[]).map((t) => (
                  <option key={t} value={t}>
                    {PSE_TYPES[t].label}
                  </option>
                ))}
              </select>
              <p className={HINT_CLASS}>
                The most one port can output: up to class {port.maxClass}, {wattsText(port.portMw)}.
              </p>
            </div>
          </div>
        </ToolPanel>

        <ToolPanel title="Powered devices">
          {rows.length === 0 ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              No devices yet. Add one, or load the example closet.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => {
                const check = rowChecks[index];
                const base = `poe-row-${row.id}`;
                return (
                  <fieldset
                    key={row.id}
                    className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.35)] p-4"
                  >
                    <legend className="sr-only">Device {index + 1}</legend>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_auto] lg:items-start">
                      <div className="col-span-2 lg:col-span-1">
                        <label htmlFor={`${base}-name`} className={LABEL_CLASS}>
                          Device
                        </label>
                        <input
                          id={`${base}-name`}
                          type="text"
                          maxLength={60}
                          autoComplete="off"
                          value={row.name}
                          placeholder={`Device ${index + 1}`}
                          onChange={(e) => updateRow(row.id, { name: e.target.value })}
                          data-testid={`input-device-name-${index}`}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${base}-qty`} className={LABEL_CLASS}>
                          Qty
                        </label>
                        <input
                          id={`${base}-qty`}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={row.qty}
                          onChange={(e) => updateRow(row.id, { qty: e.target.value })}
                          aria-invalid={check?.qtyError ? true : false}
                          aria-describedby={check?.qtyError ? `${base}-err` : undefined}
                          data-testid={`input-device-qty-${index}`}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${base}-cls`} className={LABEL_CLASS}>
                          Class
                        </label>
                        <select
                          id={`${base}-cls`}
                          value={row.cls}
                          onChange={(e) => updateRow(row.id, { cls: Number(e.target.value) })}
                          data-testid={`select-device-class-${index}`}
                          className={INPUT_CLASS}
                        >
                          {POE_CLASSES.map((c) => (
                            <option key={c.cls} value={c.cls}>
                              {classOption(c.cls)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${base}-measured`} className={LABEL_CLASS}>
                          Measured (W)
                        </label>
                        <input
                          id={`${base}-measured`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={row.measured}
                          placeholder="unknown"
                          onChange={(e) => updateRow(row.id, { measured: e.target.value })}
                          aria-invalid={check?.measuredError ? true : false}
                          aria-describedby={check?.measuredError ? `${base}-err` : undefined}
                          data-testid={`input-device-measured-${index}`}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div className="flex items-end lg:self-end">
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          aria-label={`Remove ${check?.name ?? `device ${index + 1}`}`}
                          data-testid={`button-remove-device-${index}`}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-danger)/0.6)] hover:text-[hsl(var(--brand-danger))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span className="lg:sr-only">Remove</span>
                        </button>
                      </div>
                    </div>
                    {check?.qtyError || check?.measuredError ? (
                      <p id={`${base}-err`} role="alert" className={ERROR_CLASS}>
                        {[check.qtyError, check.measuredError].filter(Boolean).join(" ")}
                      </p>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>
          )}
          <p className={`${HINT_CLASS} mt-4`}>
            Measured is the per-device power the switch reports for the port, which includes cable loss. Leave it blank
            and the device is counted at its class maximum.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addRow}
              disabled={rows.length >= MAX_DEVICE_ROWS}
              data-testid="button-add-device"
              className={BUTTON_CLASS}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add device
            </button>
            <button type="button" onClick={loadExample} data-testid="button-load-example" className={BUTTON_CLASS}>
              Load example
            </button>
            <button
              type="button"
              onClick={clearRows}
              disabled={rows.length === 0}
              data-testid="button-clear-devices"
              className={BUTTON_CLASS}
            >
              Clear devices
            </button>
          </div>
          {rows.length >= MAX_DEVICE_ROWS ? (
            <p className={HINT_CLASS}>
              The list holds up to {MAX_DEVICE_ROWS} rows. Use the quantity field for identical devices.
            </p>
          ) : null}
        </ToolPanel>

        <div className="space-y-6" data-testid="output-poe">
          <ToolPanel title="Budget">
            <div className="space-y-5">
              <Bar label="Reserved by class" used={result.allocMw} budget={budgetMw} testId="text-poe-allocated" />
              <Bar
                label={result.measuredDevices === result.devices ? "Measured draw" : "Draw, unmeasured at class"}
                used={result.actualMw}
                budget={budgetMw}
                testId="text-poe-actual"
              />
            </div>
            <div className="mt-5">
              <ToolResult
                label="Devices"
                value={`${result.devices.toLocaleString("en-US")}${
                  portsParsed.ok && portsParsed.value !== null
                    ? ` on ${portsParsed.value.toLocaleString("en-US")} ${portsParsed.value === 1 ? "port" : "ports"}`
                    : ""
                }`}
                testId="text-poe-devices"
              />
              <ToolResult
                label="Measured"
                value={`${result.measuredDevices.toLocaleString("en-US")} of ${result.devices.toLocaleString("en-US")} devices`}
              />
              {result.allocHeadroomMw !== null ? (
                <ToolResult
                  label={result.allocHeadroomMw < 0 ? "Over by class" : "Left by class"}
                  value={wattsText(Math.abs(result.allocHeadroomMw))}
                  testId="text-poe-headroom"
                />
              ) : null}
              {result.actualHeadroomMw !== null ? (
                <ToolResult
                  label={result.actualHeadroomMw < 0 ? "Over by draw" : "Left by draw"}
                  value={wattsText(Math.abs(result.actualHeadroomMw))}
                />
              ) : null}
              {result.moreAtPortMax !== null ? (
                <ToolResult
                  label={`More ${wattsText(port.portMw, 0)} devices`}
                  value={`${result.moreAtPortMax.toLocaleString("en-US")} by class`}
                />
              ) : null}
              {result.fullPowerPorts !== null ? (
                <ToolResult
                  label="Ports at full power"
                  value={`${result.fullPowerPorts.toLocaleString("en-US")} at ${wattsText(port.portMw, 0)} each`}
                />
              ) : null}
            </div>
            {result.flags.length || skipped > 0 || !budgetParsed.ok ? (
              <div className="mt-5 space-y-2">
                {!budgetParsed.ok ? (
                  <FlagNote flag={{ level: "info", text: "Enter a valid PoE budget to compare against." }} />
                ) : null}
                {result.flags.map((flag, i) => (
                  <FlagNote key={i} flag={flag} />
                ))}
                {skipped > 0 ? (
                  <FlagNote
                    flag={{
                      level: "info",
                      text: `${skipped} ${skipped === 1 ? "row has" : "rows have"} an error and ${
                        skipped === 1 ? "is" : "are"
                      } left out of the totals until fixed.`,
                    }}
                  />
                ) : null}
              </div>
            ) : result.devices > 0 && budgetMw !== null ? (
              <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
                Fits by class and by draw.
              </p>
            ) : null}
          </ToolPanel>

          {result.lines.length ? (
            <ToolPanel title="Per device">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse" data-testid="table-poe-devices">
                  <caption className="sr-only">Power reserved and drawn per device line</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Device
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Qty
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Class
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Reserved each
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Draw each
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Reserved
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Draw
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lines.map((line, i) => (
                      <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          <div className="break-words">{line.name}</div>
                          {line.flags.length ? (
                            <div className="mt-2 max-w-[28rem] space-y-2">
                              {line.flags.map((flag, j) => (
                                <FlagNote key={j} flag={flag} />
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {line.qty.toLocaleString("en-US")}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {line.cls}
                          {line.demoted ? (
                            <span className="text-[hsl(var(--brand-amber))]"> → {line.assignedClass}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {wattsText(line.allocEachMw)}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {line.measured ? (
                            wattsText(line.actualEachMw, 2)
                          ) : (
                            <span className="text-[hsl(var(--brand-ash))]">{wattsText(line.actualEachMw)} *</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {wattsText(line.allocMw)}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {wattsText(line.actualMw)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.measuredDevices < result.devices ? (
                <p className={`${HINT_CLASS} mt-3`}>* Not measured, so counted at the class maximum.</p>
              ) : null}
            </ToolPanel>
          ) : null}
        </div>

        <ToolPanel title="Cable loss, PSE to PD">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="poe-cable-class" className={LABEL_CLASS}>
                Class
              </label>
              <select
                id="poe-cable-class"
                value={cableCls}
                onChange={(e) => chooseCableClass(Number(e.target.value))}
                data-testid="select-cable-class"
                className={INPUT_CLASS}
              >
                {POE_CLASSES.map((c) => (
                  <option key={c.cls} value={c.cls}>
                    {classOption(c.cls)}
                  </option>
                ))}
              </select>
              <p className={HINT_CLASS}>Choosing a class loads its worst case values.</p>
            </div>
            <div>
              <label htmlFor="poe-cable-pd" className={LABEL_CLASS}>
                Device draws (W)
              </label>
              <input
                id="poe-cable-pd"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={cablePd}
                onChange={(e) => setCablePd(e.target.value)}
                aria-invalid={cable.errors.pd ? true : false}
                aria-describedby="poe-cable-pd-msg"
                data-testid="input-cable-pd"
                className={INPUT_CLASS}
              />
              <p id="poe-cable-pd-msg" className={cable.errors.pd ? ERROR_CLASS : HINT_CLASS}>
                {cable.errors.pd ?? `Class ${cableCls} allows up to ${wattsText(cableClass.pdMw, 2)} at the PD.`}
              </p>
            </div>
            <div>
              <label htmlFor="poe-cable-len" className={LABEL_CLASS}>
                Cable length (m)
              </label>
              <input
                id="poe-cable-len"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={cableLen}
                onChange={(e) => setCableLen(e.target.value)}
                aria-invalid={cable.errors.len ? true : false}
                aria-describedby="poe-cable-len-msg"
                data-testid="input-cable-length"
                className={INPUT_CLASS}
              />
              <p id="poe-cable-len-msg" className={cable.errors.len ? ERROR_CLASS : HINT_CLASS}>
                {cable.errors.len ?? "The whole channel, patch cords included."}
              </p>
            </div>
            <div>
              <label htmlFor="poe-cable-volts" className={LABEL_CLASS}>
                PSE voltage (V)
              </label>
              <input
                id="poe-cable-volts"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={cableVolts}
                onChange={(e) => setCableVolts(e.target.value)}
                aria-invalid={cable.errors.volts ? true : false}
                aria-describedby="poe-cable-volts-msg"
                data-testid="input-cable-volts"
                className={INPUT_CLASS}
              />
              <p id="poe-cable-volts-msg" className={cable.errors.volts ? ERROR_CLASS : HINT_CLASS}>
                {cable.errors.volts ?? `Type ${cableClass.type} PSEs output ${cableType.vMin} to ${PSE_VMAX} V.`}
              </p>
            </div>
            <div>
              <label htmlFor="poe-cable-loop" className={LABEL_CLASS}>
                Loop ohms per 100 m
              </label>
              <input
                id="poe-cable-loop"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={cableLoop}
                onChange={(e) => setCableLoop(e.target.value)}
                aria-invalid={cable.errors.loop ? true : false}
                aria-describedby="poe-cable-loop-msg"
                data-testid="input-cable-loop"
                className={INPUT_CLASS}
              />
              <p id="poe-cable-loop-msg" className={cable.errors.loop ? ERROR_CLASS : HINT_CLASS}>
                {cable.errors.loop ?? "Per pair set. 802.3 assumes 20 for Type 1 and 12.5 for the rest."}
              </p>
            </div>
            <div>
              <label htmlFor="poe-cable-pairs" className={LABEL_CLASS}>
                Pairs carrying power
              </label>
              <select
                id="poe-cable-pairs"
                value={cablePairs}
                onChange={(e) => setCablePairs(e.target.value === "4" ? 4 : 2)}
                data-testid="select-cable-pairs"
                className={INPUT_CLASS}
              >
                {cableCls <= 4 ? <option value={2}>2 pairs (one pair set)</option> : null}
                <option value={4}>4 pairs (two pair sets)</option>
              </select>
              <p className={HINT_CLASS}>Classes 5 to 8 always use all four pairs.</p>
            </div>
          </div>

          {cable.result && cable.result.ok ? (
            <div className="mt-5" data-testid="output-cable-loss">
              <ToolResult
                label="Loop resistance"
                value={`${num(cable.result.value.loopOhms, 2)} ohm per pair set`}
              />
              <ToolResult
                label="Current"
                value={
                  cablePairs === 4
                    ? `${num(cable.result.value.currentA * 1000, 0)} mA total, ${num(cable.result.value.perPairSetA * 1000, 0)} mA per pair set`
                    : `${num(cable.result.value.currentA * 1000, 0)} mA`
                }
              />
              <ToolResult label="Lost in the cable" value={`${num(cable.result.value.lossW, 2)} W`} testId="text-cable-loss" />
              <ToolResult label="PSE outputs" value={`${num(cable.result.value.pseW, 2)} W`} testId="text-cable-pse" />
              <ToolResult
                label="Reaches the device"
                value={`${num(cable.result.value.efficiency * 100, 1)}%`}
              />
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Loss is I²R in each pair set: {num(cable.result.value.perPairSetA, 3)} A squared times{" "}
                {num(cable.result.value.loopOhms, 2)} ohm
                {cablePairs === 4 ? ", times two pair sets" : ""}. The standard budgets class {cableCls} at{" "}
                {wattsText(cableClass.pseMw, 1)} from the PSE so that {wattsText(cableClass.pdMw, 2)} still arrives
                over 100 m at {cableType.vMin} V and {cableType.loopOhms} ohm.
              </p>
              {cable.pdW !== undefined && cable.pdW * 1000 > cableClass.pdMw ? (
                <div className="mt-3">
                  <FlagNote
                    flag={{
                      level: "warn",
                      text: `${cable.pdW} W is more than class ${cableCls} lets a PD draw (${wattsText(cableClass.pdMw, 2)}).`,
                    }}
                  />
                </div>
              ) : null}
              {cable.volts !== undefined && (cable.volts < cableType.vMin || cable.volts > PSE_VMAX) ? (
                <div className="mt-3">
                  <FlagNote
                    flag={{
                      level: "warn",
                      text: `${cable.volts} V is outside the ${cableType.vMin} to ${PSE_VMAX} V a Type ${cableClass.type} PSE outputs.`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : cable.result && !cable.result.ok ? (
            <p role="alert" className={`${ERROR_CLASS} mt-5`}>
              {cable.result.message}
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Class reference">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse" data-testid="table-poe-classes">
              <caption className="sr-only">802.3 PoE classes with power at the PSE and at the PD</caption>
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH_CLASS}>
                    Class
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    PSE
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    PD
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Cable allowance
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Type
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Pairs
                  </th>
                </tr>
              </thead>
              <tbody>
                {POE_CLASSES.map((c) => (
                  <tr key={c.cls} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                      {c.cls}
                    </th>
                    <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {wattsText(c.pseMw, 1)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {wattsText(c.pdMw, 2)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                      {wattsText(c.pseMw - c.pdMw, 2)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                      {c.type} · {PSE_TYPES[c.type].standard}
                    </td>
                    <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">{c.pairs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
