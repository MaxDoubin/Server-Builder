/**
 * PDU load calculator.
 *
 * Devices are entered in watts or amps, wired to a line or a pair of lines,
 * and added up as phasors against the feed breaker with the 80 percent
 * continuous load rule applied. The arithmetic is in
 * lib/toolkit/pdu-load-calculator so it can be unit tested without React.
 */

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  COMMON_BREAKERS,
  CONNECTION_LABELS,
  DEFAULT_PF,
  IMBALANCE_LIMIT_PCT,
  MAX_DEVICE_ROWS,
  MAX_QUANTITY,
  SQRT3,
  TOPOLOGIES,
  analyzePdu,
  connectionsFor,
  continuousLimitA,
  effectiveConnection,
  parseAmount,
  parseBreaker,
  parseCount,
  parsePf,
  type Connection,
  type DeviceInput,
  type Flag,
  type LineResult,
  type LineStatus,
  type LoadUnit,
  type Topology,
} from "@/lib/toolkit/pdu-load-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "block font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-[hsl(var(--brand-danger))]";
const BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border px-3 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ERROR_CLASS = "mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_CLASS = "mt-1.5 font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const TD_CLASS = "whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]";

const FLAG_STYLE: Record<Flag["level"], string> = {
  danger:
    "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]",
};

const STATUS_TEXT: Record<LineStatus, string> = {
  ok: "Within limit",
  near: "Close to limit",
  over: "Over the limit",
  trip: "Over the breaker",
  unknown: "No breaker set",
};

interface Row {
  id: number;
  name: string;
  qty: string;
  amount: string;
  unit: LoadUnit;
  pf: string;
  conn: Connection;
}

/*
  A rack with its load put on one line more than the others, which is how
  racks tend to end up. The figures are illustrative, of the order these
  device kinds draw, not values from any particular product.
*/
const EXAMPLE_ROWS: Omit<Row, "id">[] = [
  { name: "1U web servers", qty: "8", amount: "250", unit: "W", pf: "", conn: "LN1" },
  { name: "Database servers", qty: "4", amount: "420", unit: "W", pf: "", conn: "LN2" },
  { name: "Storage shelves", qty: "2", amount: "3.5", unit: "A", pf: "0.98", conn: "LN3" },
  { name: "Top-of-rack switches", qty: "2", amount: "180", unit: "W", pf: "", conn: "LN3" },
  { name: "Core switch, 208 V", qty: "1", amount: "6", unit: "A", pf: "0.9", conn: "LL12" },
];

function fmt(n: number, digits: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function ampsText(n: number): string {
  return `${fmt(n, n < 10 ? 2 : 1)} A`;
}

function pctText(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 1 : 0 })}%`;
}

function FlagNote({ flag }: { flag: Flag }) {
  return (
    <p className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${FLAG_STYLE[flag.level]}`}>
      {flag.text}
    </p>
  );
}

function LineBar({ line, limitA, testId }: { line: LineResult; limitA: number | null; testId: string }) {
  const over = line.status === "over" || line.status === "trip";
  const warn = line.status === "near";
  const width = line.pctOfLimit === null ? 0 : Math.min(100, line.pctOfLimit);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className={LABEL_CLASS}>{line.label}</span>
        <span
          data-testid={testId}
          className={`font-mono-tight text-sm ${over ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-bone))]"}`}
        >
          {ampsText(line.amps)}
          {limitA !== null && line.pctOfLimit !== null ? (
            <span className="text-[hsl(var(--brand-ash))]">
              {" "}
              of {ampsText(limitA)} · {pctText(line.pctOfLimit)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-[hsl(var(--brand-iron)/0.6)]" aria-hidden="true">
        <div
          className={`h-full rounded-full ${
            over
              ? "bg-[hsl(var(--brand-danger))]"
              : warn
                ? "bg-[hsl(var(--brand-amber))]"
                : "bg-[hsl(var(--brand-signal))]"
          }`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function PduLoadCalculator() {
  const nextId = useRef(EXAMPLE_ROWS.length + 1);
  const [topology, setTopology] = useState<Topology>("wye");
  const [voltage, setVoltage] = useState(208);
  const [breaker, setBreaker] = useState("30");
  const [derate, setDerate] = useState(true);
  const [defaultPf, setDefaultPf] = useState(String(DEFAULT_PF));
  const [rows, setRows] = useState<Row[]>(() => EXAMPLE_ROWS.map((r, i) => ({ ...r, id: i + 1 })));

  const topo = TOPOLOGIES[topology];
  const three = topology !== "single";
  const connections = connectionsFor(topology);

  /* ------------------------------------------------------------ parsing */

  const breakerParsed = useMemo(() => parseBreaker(breaker), [breaker]);
  const pfParsed = useMemo(() => parsePf(defaultPf, false), [defaultPf]);
  const breakerA = breakerParsed.ok ? breakerParsed.value : null;
  const pfDefault = pfParsed.ok && pfParsed.value !== null ? pfParsed.value : DEFAULT_PF;

  const rowChecks = useMemo(
    () =>
      rows.map((row, index) => {
        const qty = parseCount(row.qty, { label: "quantity", min: 1, max: MAX_QUANTITY, example: 1 });
        const amount = parseAmount(row.amount, row.unit);
        const pf = parsePf(row.pf, true);
        const name = row.name.trim() === "" ? `Device ${index + 1}` : row.name.trim();
        const device: DeviceInput | null =
          qty.ok && amount.ok && pf.ok
            ? { name, qty: qty.value, unit: row.unit, amount: amount.value, pf: pf.value, conn: row.conn }
            : null;
        return {
          id: row.id,
          name,
          qtyError: qty.ok ? null : qty.message,
          amountError: amount.ok ? null : amount.message,
          pfError: pf.ok ? null : pf.message,
          device,
        };
      }),
    [rows],
  );

  const validDevices = useMemo(() => rowChecks.flatMap((c) => (c.device ? [c.device] : [])), [rowChecks]);
  const skipped = rowChecks.length - validDevices.length;

  const analysis = useMemo(
    () => analyzePdu({ topology, voltage, breakerA, derate, defaultPf: pfDefault }, validDevices),
    [topology, voltage, breakerA, derate, pfDefault, validDevices],
  );

  /* --------------------------------------------------------- row edits */

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((current) =>
      current.length >= MAX_DEVICE_ROWS
        ? current
        : [
            ...current,
            { id: nextId.current++, name: "", qty: "1", amount: "", unit: "W", pf: "", conn: connections[0] },
          ],
    );
  }
  function removeRow(id: number) {
    setRows((current) => current.filter((row) => row.id !== id));
  }
  function loadExample() {
    setTopology("wye");
    setVoltage(208);
    setBreaker("30");
    setDerate(true);
    setDefaultPf(String(DEFAULT_PF));
    setRows(EXAMPLE_ROWS.map((r) => ({ ...r, id: nextId.current++ })));
  }
  function chooseTopology(next: Topology) {
    setTopology(next);
    const offered = TOPOLOGIES[next].voltages;
    if (!offered.includes(voltage)) setVoltage(TOPOLOGIES[next].defaultVoltage);
  }

  /* ----------------------------------------------------------- summary */

  const limitA = analysis.limitA;
  const worst = analysis.lines.reduce((a, b) => (b.amps > a.amps ? b : a), analysis.lines[0]);
  const hasLoad = analysis.devices.length > 0;
  const cap = analysis.capacity;

  const liveSummary = !hasLoad
    ? "No devices entered."
    : `${fmt(analysis.kw, 2)} kilowatts, ${fmt(analysis.kva, 2)} kilovolt-amperes. Heaviest ${three ? "line" : "circuit"} ${worst.label} at ${ampsText(worst.amps)}${
        limitA !== null ? ` of ${ampsText(limitA)}` : ""
      }.`;

  const summary = [
    `PDU           ${topo.label}, ${voltage} V${three ? " line to line" : ""}`,
    breakerA !== null && limitA !== null
      ? `Breaker       ${ampsText(breakerA)}${derate ? `, ${ampsText(limitA)} continuous (80%)` : ", no derating"}`
      : "Breaker       not set",
    `Load          ${fmt(analysis.kw, 2)} kW, ${fmt(analysis.kva, 2)} kVA${analysis.pf !== null ? `, PF ${fmt(analysis.pf, 3)}` : ""}`,
    ...analysis.lines.map(
      (l) =>
        `${l.label.padEnd(13)} ${ampsText(l.amps)}${l.pctOfLimit !== null ? ` (${pctText(l.pctOfLimit)} of limit)` : ""}`,
    ),
    ...(analysis.neutralA !== null ? [`Neutral       ${ampsText(analysis.neutralA)}`] : []),
    ...(analysis.imbalance ? [`Imbalance     ${pctText(analysis.imbalance.pct)}`] : []),
    ...analysis.flags.filter((f) => f.level !== "info").map((f) => `* ${f.text}`),
  ].join("\n");

  const limitForText = breakerA !== null ? continuousLimitA(breakerA, derate) : null;

  return (
    <ToolShell slug="pdu-load-calculator">
      <p role="status" aria-live="polite" className="sr-only">
        {liveSummary}
      </p>
      <div className="space-y-6">
        <ToolPanel title="PDU feed">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="pdu-topology" className={LABEL_CLASS}>
                Supply
              </label>
              <select
                id="pdu-topology"
                value={topology}
                onChange={(e) => chooseTopology(e.target.value as Topology)}
                data-testid="select-pdu-topology"
                className={INPUT_CLASS}
              >
                {(Object.keys(TOPOLOGIES) as Topology[]).map((t) => (
                  <option key={t} value={t}>
                    {TOPOLOGIES[t].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pdu-voltage" className={LABEL_CLASS}>
                {three ? "Line-to-line voltage" : "Voltage"}
              </label>
              <select
                id="pdu-voltage"
                value={voltage}
                onChange={(e) => setVoltage(Number(e.target.value))}
                data-testid="select-pdu-voltage"
                className={INPUT_CLASS}
              >
                {topo.voltages.map((v) => (
                  <option key={v} value={v}>
                    {v} V
                  </option>
                ))}
              </select>
              <p className={HINT_CLASS}>
                {topology === "wye"
                  ? `${fmt(voltage / SQRT3, 1)} V from a line to neutral.`
                  : topology === "delta"
                    ? "Every load sits across two lines at this voltage."
                    : "One circuit, one voltage."}
              </p>
            </div>
            <div>
              <label htmlFor="pdu-breaker" className={LABEL_CLASS}>
                Breaker rating (A{three ? ", per line" : ""})
              </label>
              <input
                id="pdu-breaker"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={breaker}
                onChange={(e) => setBreaker(e.target.value)}
                aria-invalid={!breakerParsed.ok}
                aria-describedby="pdu-breaker-msg"
                data-testid="input-pdu-breaker"
                className={INPUT_CLASS}
              />
              <p id="pdu-breaker-msg" className={breakerParsed.ok ? HINT_CLASS : ERROR_CLASS}>
                {breakerParsed.ok
                  ? limitForText !== null
                    ? `Continuous limit ${ampsText(limitForText)}.`
                    : ""
                  : breakerParsed.message}
              </p>
            </div>
            <div>
              <label htmlFor="pdu-pf" className={LABEL_CLASS}>
                Default power factor
              </label>
              <input
                id="pdu-pf"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={defaultPf}
                onChange={(e) => setDefaultPf(e.target.value)}
                aria-invalid={!pfParsed.ok}
                aria-describedby="pdu-pf-msg"
                data-testid="input-pdu-pf"
                className={INPUT_CLASS}
              />
              <p id="pdu-pf-msg" className={pfParsed.ok ? HINT_CLASS : ERROR_CLASS}>
                {pfParsed.ok
                  ? "Used for any device that has none of its own. Treated as lagging."
                  : `${pfParsed.message} Using ${DEFAULT_PF} until then.`}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Common breakers
            </span>
            {COMMON_BREAKERS.map((a) => {
              const active = breakerParsed.ok && breakerParsed.value === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setBreaker(String(a))}
                  aria-pressed={active}
                  data-testid={`button-breaker-${a}`}
                  className={`${CHIP_CLASS} ${
                    active
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                  }`}
                >
                  {a} A
                </button>
              );
            })}
          </div>

          <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            <input
              type="checkbox"
              checked={derate}
              onChange={(e) => setDerate(e.target.checked)}
              data-testid="checkbox-pdu-derate"
              className="h-5 w-5 shrink-0 accent-[hsl(var(--brand-signal))]"
            />
            <span>Apply the 80% continuous load rule (loads that run three hours or more)</span>
          </label>
        </ToolPanel>

        <ToolPanel title="Devices">
          {rows.length === 0 ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              No devices yet. Add one, or load the example rack.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => {
                const check = rowChecks[index];
                const base = `pdu-row-${row.id}`;
                const errors = [check?.qtyError, check?.amountError, check?.pfError].filter(Boolean).join(" ");
                const conn = effectiveConnection(topology, row.conn);
                return (
                  <fieldset
                    key={row.id}
                    className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.35)] p-4"
                  >
                    <legend className="sr-only">Device {index + 1}</legend>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_auto] lg:items-start">
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
                          aria-describedby={errors ? `${base}-err` : undefined}
                          data-testid={`input-device-qty-${index}`}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${base}-amount`} className={LABEL_CLASS}>
                          Each ({row.unit === "W" ? "watts" : "amps"})
                        </label>
                        <input
                          id={`${base}-amount`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={row.amount}
                          onChange={(e) => updateRow(row.id, { amount: e.target.value })}
                          aria-invalid={check?.amountError ? true : false}
                          aria-describedby={errors ? `${base}-err` : undefined}
                          data-testid={`input-device-amount-${index}`}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label htmlFor={`${base}-unit`} className={LABEL_CLASS}>
                          Unit
                        </label>
                        <select
                          id={`${base}-unit`}
                          value={row.unit}
                          onChange={(e) => updateRow(row.id, { unit: e.target.value === "A" ? "A" : "W" })}
                          data-testid={`select-device-unit-${index}`}
                          className={INPUT_CLASS}
                        >
                          <option value="W">Watts</option>
                          <option value="A">Amps</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${base}-pf`} className={LABEL_CLASS}>
                          Power factor
                        </label>
                        <input
                          id={`${base}-pf`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={row.pf}
                          placeholder={String(pfDefault)}
                          onChange={(e) => updateRow(row.id, { pf: e.target.value })}
                          aria-invalid={check?.pfError ? true : false}
                          aria-describedby={errors ? `${base}-err` : undefined}
                          data-testid={`input-device-pf-${index}`}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div className="col-span-2 lg:col-span-1">
                        <label htmlFor={`${base}-conn`} className={LABEL_CLASS}>
                          Connected to
                        </label>
                        <select
                          id={`${base}-conn`}
                          value={conn}
                          disabled={!three}
                          onChange={(e) => updateRow(row.id, { conn: e.target.value as Connection })}
                          data-testid={`select-device-conn-${index}`}
                          className={INPUT_CLASS}
                        >
                          {connections.map((c) => (
                            <option key={c} value={c}>
                              {CONNECTION_LABELS[c]}
                              {c.startsWith("LN") && three ? ` (${fmt(voltage / SQRT3, 0)} V)` : c.startsWith("LL") ? ` (${voltage} V)` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2 flex items-end lg:col-span-1 lg:self-end">
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
                    {errors ? (
                      <p id={`${base}-err`} role="alert" className={ERROR_CLASS}>
                        {errors}
                      </p>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>
          )}
          <p className={`${HINT_CLASS} mt-4`}>
            Each is the figure for one unit. Watts are real power, as on a power supply label. Amps are taken at the
            voltage of the connection chosen, or per line for a balanced three-phase device.
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
              onClick={() => setRows([])}
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

        <div className="space-y-6" data-testid="output-pdu">
          <ToolPanel title={three ? "Load by line" : "Load on the circuit"}>
            <div className="space-y-5">
              {analysis.lines.map((line, i) => (
                <LineBar key={line.label} line={line} limitA={limitA} testId={`text-pdu-line-${i}`} />
              ))}
            </div>

            {analysis.flags.length > 0 || skipped > 0 || !breakerParsed.ok ? (
              <div className="mt-5 space-y-2">
                {!breakerParsed.ok ? (
                  <FlagNote flag={{ level: "info", text: "Enter a valid breaker rating to check the load against it." }} />
                ) : null}
                {analysis.flags.map((flag, i) => (
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
            ) : hasLoad ? (
              <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
                Every {three ? "line" : "circuit"} is under the {derate ? "continuous" : "breaker"} limit
                {three ? " and the lines are balanced" : ""}.
              </p>
            ) : null}

            {hasLoad ? (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse" data-testid="table-pdu-lines">
                  <caption className="sr-only">Current, share of limit and room left on each {three ? "line" : "circuit"}</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        {three ? "Line" : "Circuit"}
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Current
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Plain sum
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Of limit
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Room left
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.lines.map((line) => (
                      <tr key={line.label} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                        <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                          {line.label}
                        </th>
                        <td className={TD_CLASS}>{ampsText(line.amps)}</td>
                        <td className={`${TD_CLASS} text-[hsl(var(--brand-bone-dim))]`}>{ampsText(line.plainSumA)}</td>
                        <td className={TD_CLASS}>{line.pctOfLimit === null ? "n/a" : pctText(line.pctOfLimit)}</td>
                        <td className={TD_CLASS}>
                          {line.headroomA === null
                            ? "n/a"
                            : line.headroomA >= 0
                              ? ampsText(line.headroomA)
                              : `over by ${ampsText(-line.headroomA)}`}
                        </td>
                        <td className={`${TD_CLASS} ${line.status === "over" || line.status === "trip" ? "text-[hsl(var(--brand-danger))]" : line.status === "near" ? "text-[hsl(var(--brand-amber))]" : ""}`}>
                          {STATUS_TEXT[line.status]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {hasLoad ? (
              <p className={`${HINT_CLASS} mt-3`}>
                Current is the phasor sum of the loads on the {three ? "line" : "circuit"}, which is what a clamp meter
                reads. Plain sum adds each load as an ordinary number. A load across two lines is 30 degrees out of
                step with a line-to-neutral load on either of them, so the two differ, and the plain sum is the
                cautious figure.
              </p>
            ) : null}
          </ToolPanel>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ToolPanel title="Total load">
              <ToolResult label="Real power" value={`${fmt(analysis.kw, 2)} kW`} testId="text-pdu-kw" />
              <ToolResult label="Apparent power" value={`${fmt(analysis.kva, 2)} kVA`} testId="text-pdu-kva" />
              <ToolResult label="Reactive power" value={`${fmt(analysis.kvar, 2)} kvar`} />
              <ToolResult
                label="Power factor"
                value={analysis.pf === null ? "n/a" : fmt(analysis.pf, 3)}
                testId="text-pdu-pf"
              />
              <ToolResult label="Units" value={analysis.units.toLocaleString("en-US")} />
              {analysis.neutralA !== null ? (
                <ToolResult label="Neutral current" value={ampsText(analysis.neutralA)} testId="text-pdu-neutral" />
              ) : null}
              {analysis.imbalance ? (
                <ToolResult
                  label="Current imbalance"
                  value={
                    <>
                      {pctText(analysis.imbalance.pct)}
                      {analysis.imbalance.suppressed ? (
                        <span className="text-[hsl(var(--brand-ash))]"> · light load, not flagged</span>
                      ) : null}
                    </>
                  }
                  testId="text-pdu-imbalance"
                />
              ) : null}
            </ToolPanel>

            <ToolPanel title="Capacity at the limit">
              {cap && limitA !== null ? (
                <>
                  <ToolResult label="Limit per line" value={ampsText(limitA)} />
                  <ToolResult label="Usable apparent power" value={`${fmt(cap.kva, 2)} kVA`} testId="text-pdu-cap-kva" />
                  <ToolResult label={`Usable real power at PF ${fmt(cap.pf, 2)}`} value={`${fmt(cap.kw, 2)} kW`} />
                  {hasLoad ? (
                    <ToolResult
                      label="Heaviest line uses"
                      value={worst.pctOfLimit === null ? "n/a" : pctText(worst.pctOfLimit)}
                    />
                  ) : null}
                  <p className={`${HINT_CLASS} mt-3`}>
                    {three
                      ? `√3 × ${voltage} V × ${fmt(limitA, 1)} A = ${fmt(cap.kva, 2)} kVA, reached only when every line carries the limit. The heaviest line sets the real ceiling.`
                      : `${voltage} V × ${fmt(limitA, 1)} A = ${fmt(cap.kva, 2)} kVA.`}
                  </p>
                </>
              ) : (
                <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                  Enter a valid breaker rating to see how much the feed can carry.
                </p>
              )}
            </ToolPanel>
          </div>

          {three && analysis.branches.length > 0 ? (
            <ToolPanel title="Load by connection">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse" data-testid="table-pdu-branches">
                  <caption className="sr-only">Units, voltage, current and power on each connection</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Connection
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Units
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Volts
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Current
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        kW
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        kVA
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.branches.map((b) => (
                      <tr key={b.conn} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                        <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                          {b.label}
                        </th>
                        <td className={TD_CLASS}>{b.units.toLocaleString("en-US")}</td>
                        <td className={TD_CLASS}>{fmt(b.volts, 1)}</td>
                        <td className={TD_CLASS}>
                          {ampsText(b.amps)}
                          {b.conn === "BAL" ? <span className="text-[hsl(var(--brand-ash))]"> per line</span> : null}
                        </td>
                        <td className={TD_CLASS}>{fmt(b.kw, 2)}</td>
                        <td className={TD_CLASS}>{fmt(b.kva, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={`${HINT_CLASS} mt-3`}>
                {topology === "delta"
                  ? "In a delta each connection is a phase of the delta. The line currents above are larger than the phase currents here, by up to √3 when the loads are equal."
                  : "In a wye the line-to-neutral rows are phase currents and equal the line currents they sit on. A row across two lines draws that current from each of them."}
              </p>
            </ToolPanel>
          ) : null}

          <div className="flex flex-wrap items-start gap-3">
            <CopyButton value={summary} testId="button-copy-summary">
              <span>Copy summary</span>
            </CopyButton>
          </div>
        </div>

        <ToolPanel title={topology === "wye" ? "Line and phase current on a wye" : topology === "delta" ? "Line and phase current on a delta" : "Voltage, current and power"}>
          {topology === "wye" ? (
            <div className="space-y-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                In a wye each line conductor is wired to one winding, so the line current and the phase current are
                the same number. The two voltages are not. The line-to-line voltage is {voltage} V, and the voltage
                from any line to neutral is {voltage} / √3 = {fmt(voltage / SQRT3, 1)} V.
              </p>
              <p>
                A {fmt(voltage / SQRT3, 0)} V outlet connects one line to the neutral. A {voltage} V outlet connects
                two lines and draws the same current from each of them. Three equal loads give the balanced result{" "}
                <code className="text-[hsl(var(--brand-cyan))]">P = √3 × {voltage} × I × PF</code>
                {", which is "}
                {fmt(SQRT3 * voltage, 1)} × I × PF watts, or the same total as 3 × {fmt(voltage / SQRT3, 1)} × I × PF.
              </p>
            </div>
          ) : topology === "delta" ? (
            <div className="space-y-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                In a delta each load sits across two lines at the full {voltage} V, so the phase current in the load
                is smaller than the line current feeding it. For equal loads,{" "}
                <code className="text-[hsl(var(--brand-cyan))]">I_line = √3 × I_phase</code>. There is no neutral and
                no line-to-neutral voltage.
              </p>
              <p>
                The balanced power formula is the same as for a wye:{" "}
                <code className="text-[hsl(var(--brand-cyan))]">P = √3 × {voltage} × I_line × PF</code>, which is{" "}
                {fmt(SQRT3 * voltage, 1)} × I_line × PF watts.
              </p>
            </div>
          ) : (
            <div className="space-y-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                A single-phase circuit has one voltage and one current, so{" "}
                <code className="text-[hsl(var(--brand-cyan))]">P = V × I × PF</code> and{" "}
                <code className="text-[hsl(var(--brand-cyan))]">S = V × I</code>. At {voltage} V, each amp is {voltage}{" "}
                VA.
              </p>
              <p>
                A 208 V, 230 V or 240 V single-phase circuit is two conductors at that voltage, often two lines of a
                three-phase supply. Pick a three-phase supply above to place devices on separate lines and check the
                balance.
              </p>
            </div>
          )}
          <p className={`${HINT_CLASS} mt-3`}>
            Imbalance is the largest departure of a line current from the average, as a percentage of the average. It
            is flagged above {IMBALANCE_LIMIT_PCT}%, once the average line carries at least a tenth of the limit.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
