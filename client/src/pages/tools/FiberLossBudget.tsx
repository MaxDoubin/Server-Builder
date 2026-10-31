/**
 * Fiber loss budget.
 *
 * Adds up fiber, connector and splice loss for a link and holds it against
 * the power budget of a transceiver: minimum transmit power, less receiver
 * sensitivity, less the penalties the standard reserves. The arithmetic is
 * in lib/toolkit/fiber-loss-budget, in integer milli-dB, so it can be unit
 * tested without React.
 */

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  CONNECTOR_LOSS_LOW_DB,
  CONNECTOR_LOSS_TIA_DB,
  DEFAULT_MARGIN_DB,
  FIBER_TYPES,
  MAX_CONNECTORS,
  MAX_LENGTH_M,
  MAX_CONNECTOR_LOSS_DB,
  MAX_MARGIN_DB,
  MAX_PENALTY_DB,
  MAX_SPLICES,
  MAX_SPLICE_LOSS_DB,
  RX_RANGE_DBM,
  SPLICE_LOSS_FUSION_DB,
  TRANSCEIVERS,
  TX_RANGE_DBM,
  analyzeLink,
  dbText,
  defaultFiberFor,
  fiberType,
  gradeOf,
  lengthText,
  parseAtten,
  parseBounded,
  parseCount,
  parseLength,
  toMdb,
  transceiver,
  type FiberId,
  type Flag,
  type LengthUnit,
  type Transceiver,
} from "@/lib/toolkit/fiber-loss-budget";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "block font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none aria-[invalid=true]:border-[hsl(var(--brand-danger))]";
const BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
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

const CUSTOM = "custom";
const DEFAULT_PRESET = "10gbase-sr";

function numText(n: number): string {
  return String(Number(n.toFixed(3)));
}

function FlagNote({ flag }: { flag: Flag }) {
  return (
    <p className={`break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${FLAG_STYLE[flag.level]}`}>
      {flag.text}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`${CHIP_CLASS} ${
        active
          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]"
          : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
      }`}
    >
      {children}
    </button>
  );
}

export function FiberLossBudget() {
  const initial: Transceiver = transceiver(DEFAULT_PRESET) ?? TRANSCEIVERS[0];
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET);
  const [tx, setTx] = useState(numText(initial.txMinDbm));
  const [rx, setRx] = useState(numText(initial.rxSensDbm));
  const [penalty, setPenalty] = useState(numText(initial.penaltyDb));

  const [fiber, setFiber] = useState<FiberId>("OM4");
  const [length, setLength] = useState("50");
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("m");
  const [atten, setAtten] = useState("");
  const [connectors, setConnectors] = useState("2");
  const [connectorLoss, setConnectorLoss] = useState(numText(CONNECTOR_LOSS_TIA_DB));
  const [splices, setSplices] = useState("0");
  const [spliceLoss, setSpliceLoss] = useState(numText(SPLICE_LOSS_FUSION_DB));
  const [margin, setMargin] = useState(numText(DEFAULT_MARGIN_DB));

  const optic = presetId === CUSTOM ? null : transceiver(presetId);
  const ft = fiberType(fiber);

  /* ------------------------------------------------------------ parsing */

  const txP = useMemo(
    () => parseBounded(tx, { label: "minimum transmit power", min: TX_RANGE_DBM.min, max: TX_RANGE_DBM.max, unit: "dBm" }),
    [tx],
  );
  const rxP = useMemo(
    () => parseBounded(rx, { label: "receiver sensitivity", min: RX_RANGE_DBM.min, max: RX_RANGE_DBM.max, unit: "dBm" }),
    [rx],
  );
  const penP = useMemo(
    () => parseBounded(penalty, { label: "penalty allowance", min: 0, max: MAX_PENALTY_DB, unit: "dB" }),
    [penalty],
  );
  const lenP = useMemo(() => parseLength(length, lengthUnit), [length, lengthUnit]);
  const attenP = useMemo(() => parseAtten(atten), [atten]);
  const connP = useMemo(() => parseCount(connectors, { label: "connector count", max: MAX_CONNECTORS }), [connectors]);
  const connLossP = useMemo(
    () => parseBounded(connectorLoss, { label: "connector loss", min: 0, max: MAX_CONNECTOR_LOSS_DB, unit: "dB" }),
    [connectorLoss],
  );
  const spliceP = useMemo(() => parseCount(splices, { label: "splice count", max: MAX_SPLICES }), [splices]);
  const spliceLossP = useMemo(
    () => parseBounded(spliceLoss, { label: "splice loss", min: 0, max: MAX_SPLICE_LOSS_DB, unit: "dB" }),
    [spliceLoss],
  );
  const marginP = useMemo(
    () => parseBounded(margin, { label: "safety margin", min: 0, max: MAX_MARGIN_DB, unit: "dB" }),
    [margin],
  );

  const attenValue = attenP.ok && attenP.value !== null ? attenP.value : ft.attenDbPerKm;

  const result = useMemo(() => {
    if (!txP.ok || !rxP.ok || !penP.ok || !lenP.ok || !attenP.ok || !connP.ok || !connLossP.ok || !spliceP.ok || !spliceLossP.ok || !marginP.ok) {
      return null;
    }
    return analyzeLink({
      fiber,
      lengthM: lenP.value,
      attenDbPerKm: attenP.value ?? ft.attenDbPerKm,
      connectors: connP.value,
      connectorLossDb: connLossP.value,
      splices: spliceP.value,
      spliceLossDb: spliceLossP.value,
      marginDb: marginP.value,
      txMinDbm: txP.value,
      rxSensDbm: rxP.value,
      penaltyDb: penP.value,
      optic,
    });
  }, [txP, rxP, penP, lenP, attenP, connP, connLossP, spliceP, spliceLossP, marginP, fiber, ft.attenDbPerKm, optic]);

  /* ----------------------------------------------------------- handlers */

  function choosePreset(id: string) {
    setPresetId(id);
    const t = transceiver(id);
    if (!t) return;
    setTx(numText(t.txMinDbm));
    setRx(numText(t.rxSensDbm));
    setPenalty(numText(t.penaltyDb));
    if (ft.media !== t.media) setFiber(defaultFiberFor(t));
  }

  const edited =
    optic !== null &&
    (!txP.ok ||
      !rxP.ok ||
      !penP.ok ||
      toMdb(txP.value) !== toMdb(optic.txMinDbm) ||
      toMdb(rxP.value) !== toMdb(optic.rxSensDbm) ||
      toMdb(penP.value) !== toMdb(optic.penaltyDb));

  /* ------------------------------------------------------------ outputs */

  const spare = result ? result.spareMdb : 0;
  let verdictTitle = "Fix the highlighted fields";
  let verdictStyle: string = FLAG_STYLE.info;
  if (result) {
    if (result.wrongMedia) {
      verdictTitle = "Optic and fiber do not match";
      verdictStyle = FLAG_STYLE.danger;
    } else if (result.verdict === "fail") {
      verdictTitle = "Over budget";
      verdictStyle = FLAG_STYLE.danger;
    } else if (result.exceedsReach) {
      verdictTitle = "Fits the loss budget, longer than the standard reach";
      verdictStyle = FLAG_STYLE.warn;
    } else if (result.verdict === "tight") {
      verdictTitle = "Within budget, short of the safety margin";
      verdictStyle = FLAG_STYLE.warn;
    } else {
      verdictTitle = "Within budget";
      verdictStyle =
        "border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.06)] text-[hsl(var(--brand-signal))]";
    }
  }

  const scale = result ? Math.max(1, result.budgetMdb, result.totalMdb + result.marginMdb) : 1;
  const segments = result
    ? [
        { key: "fiber", label: "Fiber", mdb: result.fiberMdb, className: "bg-[hsl(var(--brand-signal))]" },
        { key: "connectors", label: "Connectors", mdb: result.connectorMdb, className: "bg-[hsl(var(--brand-cyan))]" },
        { key: "splices", label: "Splices", mdb: result.spliceMdb, className: "bg-[hsl(var(--brand-amber))]" },
        { key: "margin", label: "Safety margin", mdb: result.marginMdb, className: "bg-[hsl(var(--brand-ash)/0.55)]" },
      ]
    : [];
  const markerPct = result ? Math.max(0, Math.min(100, (Math.max(0, result.budgetMdb) / scale) * 100)) : 0;

  const summary = result
    ? [
        `Optic         ${optic ? optic.name : "custom"}, TX min ${tx} dBm, RX ${rx} dBm, penalty ${penalty} dB`,
        `Fiber         ${ft.label}, ${lengthText(lenP.ok ? lenP.value : 0)} at ${numText(attenValue)} dB/km`,
        `Connectors    ${connectors} at ${connectorLoss} dB`,
        `Splices       ${splices} at ${spliceLoss} dB`,
        `Link loss     ${dbText(result.totalMdb)} (fiber ${dbText(result.fiberMdb)}, connectors ${dbText(result.connectorMdb)}, splices ${dbText(result.spliceMdb)})`,
        `Budget        ${dbText(result.budgetMdb)}`,
        `Remaining     ${dbText(result.remainingMdb)}`,
        `Safety margin ${dbText(result.marginMdb)}`,
        `Spare         ${dbText(result.spareMdb)} (${verdictTitle.toLowerCase()})`,
        ...result.flags.map((f) => `* ${f.text}`),
      ].join("\n")
    : "";

  const liveSummary = result
    ? `${verdictTitle}. Link loss ${dbText(result.totalMdb)} against a budget of ${dbText(result.budgetMdb)}, ${dbText(result.spareMdb)} spare after the safety margin.`
    : "Some fields have errors.";

  return (
    <ToolShell slug="fiber-loss-budget">
      <p role="status" aria-live="polite" className="sr-only">
        {liveSummary}
      </p>
      <div className="space-y-6">
        <ToolPanel title="Optic">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="fiber-preset" className={LABEL_CLASS}>
                Transceiver
              </label>
              <select
                id="fiber-preset"
                value={presetId}
                onChange={(e) => choosePreset(e.target.value)}
                data-testid="select-fiber-preset"
                className={INPUT_CLASS}
              >
                {TRANSCEIVERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.wavelengthNm} nm {t.media === "mmf" ? "multimode" : "single-mode"}
                  </option>
                ))}
                <option value={CUSTOM}>Custom optic</option>
              </select>
            </div>
            <div>
              <label htmlFor="fiber-tx" className={LABEL_CLASS}>
                Minimum TX power (dBm)
              </label>
              <input
                id="fiber-tx"
                type="text"
                autoComplete="off"
                value={tx}
                onChange={(e) => setTx(e.target.value)}
                aria-invalid={!txP.ok}
                aria-describedby="fiber-tx-msg"
                data-testid="input-fiber-tx"
                className={INPUT_CLASS}
              />
              <p id="fiber-tx-msg" className={txP.ok ? HINT_CLASS : ERROR_CLASS}>
                {txP.ok ? "Average launch power, worst case." : txP.message}
              </p>
            </div>
            <div>
              <label htmlFor="fiber-rx" className={LABEL_CLASS}>
                RX sensitivity (dBm)
              </label>
              <input
                id="fiber-rx"
                type="text"
                autoComplete="off"
                value={rx}
                onChange={(e) => setRx(e.target.value)}
                aria-invalid={!rxP.ok}
                aria-describedby="fiber-rx-msg"
                data-testid="input-fiber-rx"
                className={INPUT_CLASS}
              />
              <p id="fiber-rx-msg" className={rxP.ok ? HINT_CLASS : ERROR_CLASS}>
                {rxP.ok ? "Weakest signal it is specified to receive." : rxP.message}
              </p>
            </div>
            <div>
              <label htmlFor="fiber-penalty" className={LABEL_CLASS}>
                Penalty allowance (dB)
              </label>
              <input
                id="fiber-penalty"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={penalty}
                onChange={(e) => setPenalty(e.target.value)}
                aria-invalid={!penP.ok}
                aria-describedby="fiber-penalty-msg"
                data-testid="input-fiber-penalty"
                className={INPUT_CLASS}
              />
              <p id="fiber-penalty-msg" className={penP.ok ? HINT_CLASS : ERROR_CLASS}>
                {penP.ok
                  ? "Dispersion and noise the standard holds back. Use 0 if your figures already allow for it."
                  : penP.message}
              </p>
            </div>
          </div>

          {optic ? (
            <div className="mt-4 space-y-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                {optic.note} Figures from {optic.clause}. Its channel insertion loss limit is {optic.channelLossDb.toFixed(2)}{" "}
                dB, set for {optic.channelLossNote}. Check them against your module's own datasheet.
              </p>
              {edited ? (
                <p className="text-[hsl(var(--brand-amber))]">
                  These figures differ from the {optic.name} values.{" "}
                  <button
                    type="button"
                    onClick={() => choosePreset(optic.id)}
                    data-testid="button-fiber-reset"
                    className="inline-flex min-h-[24px] items-center text-[hsl(var(--brand-signal))] underline underline-offset-2 hover:text-[hsl(var(--brand-bone))]"
                  >
                    Reset to the standard values
                  </button>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Custom optic. Take the minimum transmit power and receiver sensitivity from the datasheet. No media or
              reach checks are made.
            </p>
          )}
        </ToolPanel>

        <ToolPanel title="Link">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="fiber-type" className={LABEL_CLASS}>
                Fiber type
              </label>
              <select
                id="fiber-type"
                value={fiber}
                onChange={(e) => setFiber(e.target.value as FiberId)}
                data-testid="select-fiber-type"
                className={INPUT_CLASS}
              >
                {FIBER_TYPES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className={HINT_CLASS}>{ft.note}</p>
            </div>
            <div>
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                <div>
                  <label htmlFor="fiber-length" className={LABEL_CLASS}>
                    Length
                  </label>
                  <input
                    id="fiber-length"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    aria-invalid={!lenP.ok}
                    aria-describedby="fiber-length-msg"
                    data-testid="input-fiber-length"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="fiber-length-unit" className={LABEL_CLASS}>
                    Unit
                  </label>
                  <select
                    id="fiber-length-unit"
                    value={lengthUnit}
                    onChange={(e) => setLengthUnit(e.target.value === "km" ? "km" : "m")}
                    data-testid="select-fiber-length-unit"
                    className={INPUT_CLASS}
                  >
                    <option value="m">m</option>
                    <option value="km">km</option>
                  </select>
                </div>
              </div>
              <p id="fiber-length-msg" className={lenP.ok ? HINT_CLASS : ERROR_CLASS}>
                {lenP.ok ? `The cable path, patch cords included. Up to ${MAX_LENGTH_M / 1000} km.` : lenP.message}
              </p>
            </div>
            <div>
              <label htmlFor="fiber-atten" className={LABEL_CLASS}>
                Attenuation (dB/km)
              </label>
              <input
                id="fiber-atten"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={atten}
                placeholder={numText(ft.attenDbPerKm)}
                onChange={(e) => setAtten(e.target.value)}
                aria-invalid={!attenP.ok}
                aria-describedby="fiber-atten-msg"
                data-testid="input-fiber-atten"
                className={INPUT_CLASS}
              />
              <p id="fiber-atten-msg" className={attenP.ok ? HINT_CLASS : ERROR_CLASS}>
                {attenP.ok
                  ? `Blank uses ${numText(ft.attenDbPerKm)} dB/km. Enter a test report or datasheet figure to replace it.`
                  : attenP.message}
              </p>
            </div>

            <div>
              <label htmlFor="fiber-connectors" className={LABEL_CLASS}>
                Mated connector pairs
              </label>
              <input
                id="fiber-connectors"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={connectors}
                onChange={(e) => setConnectors(e.target.value)}
                aria-invalid={!connP.ok}
                aria-describedby="fiber-connectors-msg"
                data-testid="input-fiber-connectors"
                className={INPUT_CLASS}
              />
              <p id="fiber-connectors-msg" className={connP.ok ? HINT_CLASS : ERROR_CLASS}>
                {connP.ok ? "Every joint along the path: panel couplers, cassettes, patch cord ends." : connP.message}
              </p>
            </div>
            <div>
              <label htmlFor="fiber-connector-loss" className={LABEL_CLASS}>
                Loss per connector pair (dB)
              </label>
              <input
                id="fiber-connector-loss"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={connectorLoss}
                onChange={(e) => setConnectorLoss(e.target.value)}
                aria-invalid={!connLossP.ok}
                aria-describedby="fiber-connector-loss-msg"
                data-testid="input-fiber-connector-loss"
                className={INPUT_CLASS}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip
                  active={connLossP.ok && toMdb(connLossP.value) === toMdb(CONNECTOR_LOSS_LOW_DB)}
                  onClick={() => setConnectorLoss(numText(CONNECTOR_LOSS_LOW_DB))}
                  testId="button-connector-loss-0.5"
                >
                  0.5 dB
                </Chip>
                <Chip
                  active={connLossP.ok && toMdb(connLossP.value) === toMdb(CONNECTOR_LOSS_TIA_DB)}
                  onClick={() => setConnectorLoss(numText(CONNECTOR_LOSS_TIA_DB))}
                  testId="button-connector-loss-0.75"
                >
                  0.75 dB TIA max
                </Chip>
              </div>
              <p id="fiber-connector-loss-msg" className={connLossP.ok ? HINT_CLASS : ERROR_CLASS}>
                {connLossP.ok
                  ? "0.75 dB is the TIA-568.3-D maximum for a mated pair. Good, clean connectors usually do better."
                  : connLossP.message}
              </p>
            </div>
            <div>
              <label htmlFor="fiber-margin" className={LABEL_CLASS}>
                Safety margin (dB)
              </label>
              <input
                id="fiber-margin"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                aria-invalid={!marginP.ok}
                aria-describedby="fiber-margin-msg"
                data-testid="input-fiber-margin"
                className={INPUT_CLASS}
              />
              <p id="fiber-margin-msg" className={marginP.ok ? HINT_CLASS : ERROR_CLASS}>
                {marginP.ok
                  ? "Room for repair splices, re-terminations and aging. Long single-mode links often hold 3 dB. Multimode budgets are too tight for that."
                  : marginP.message}
              </p>
            </div>

            <div>
              <label htmlFor="fiber-splices" className={LABEL_CLASS}>
                Splices
              </label>
              <input
                id="fiber-splices"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={splices}
                onChange={(e) => setSplices(e.target.value)}
                aria-invalid={!spliceP.ok}
                aria-describedby="fiber-splices-msg"
                data-testid="input-fiber-splices"
                className={INPUT_CLASS}
              />
              <p id="fiber-splices-msg" className={spliceP.ok ? HINT_CLASS : ERROR_CLASS}>
                {spliceP.ok ? "Permanent joints along the run, usually one per cable reel." : spliceP.message}
              </p>
            </div>
            <div>
              <label htmlFor="fiber-splice-loss" className={LABEL_CLASS}>
                Loss per splice (dB)
              </label>
              <input
                id="fiber-splice-loss"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={spliceLoss}
                onChange={(e) => setSpliceLoss(e.target.value)}
                aria-invalid={!spliceLossP.ok}
                aria-describedby="fiber-splice-loss-msg"
                data-testid="input-fiber-splice-loss"
                className={INPUT_CLASS}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Chip
                  active={spliceLossP.ok && toMdb(spliceLossP.value) === toMdb(SPLICE_LOSS_FUSION_DB)}
                  onClick={() => setSpliceLoss(numText(SPLICE_LOSS_FUSION_DB))}
                  testId="button-splice-loss-0.1"
                >
                  0.1 dB fusion
                </Chip>
                <Chip
                  active={spliceLossP.ok && toMdb(spliceLossP.value) === toMdb(0.3)}
                  onClick={() => setSpliceLoss("0.3")}
                  testId="button-splice-loss-0.3"
                >
                  0.3 dB TIA max
                </Chip>
              </div>
              <p id="fiber-splice-loss-msg" className={spliceLossP.ok ? HINT_CLASS : ERROR_CLASS}>
                {spliceLossP.ok ? "A fusion splice is typically 0.1 dB or better." : spliceLossP.message}
              </p>
            </div>
          </div>
        </ToolPanel>

        <div className="space-y-6" data-testid="output-fiber">
          <ToolPanel title="Result">
            <div className={`rounded-xl border p-4 ${verdictStyle}`}>
              <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em]">Verdict</div>
              <p className="mt-1 font-display text-xl font-medium" data-testid="text-fiber-verdict">
                {verdictTitle}
              </p>
              {result ? (
                <p className="mt-1 break-words font-mono-tight text-sm leading-relaxed">
                  {result.wrongMedia
                    ? "The figures below are for reference only."
                    : result.verdict === "fail"
                      ? `${dbText(-result.remainingMdb)} over the ${dbText(Math.max(0, result.budgetMdb))} budget.`
                      : `${dbText(result.spareMdb)} spare after the ${dbText(result.marginMdb)} safety margin.`}
                </p>
              ) : null}
            </div>

            {result ? (
              <>
                <div className="mt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className={LABEL_CLASS}>Where the budget goes</span>
                    <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {dbText(result.totalMdb + result.marginMdb)}
                      <span className="text-[hsl(var(--brand-ash))]"> of {dbText(Math.max(0, result.budgetMdb))}</span>
                    </span>
                  </div>
                  <div
                    className="relative mt-2 h-4 overflow-hidden rounded-full bg-[hsl(var(--brand-iron)/0.6)]"
                    aria-hidden="true"
                  >
                    <div className="flex h-full w-full">
                      {segments.map((s) => (
                        <div
                          key={s.key}
                          className={`h-full ${s.className}`}
                          style={{ width: `${(s.mdb / scale) * 100}%` }}
                        />
                      ))}
                    </div>
                    <div
                      className="absolute inset-y-0 w-[2px] bg-[hsl(var(--brand-bone))]"
                      style={{ left: `calc(${markerPct}% - 1px)` }}
                    />
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    {segments.map((s) => (
                      <li key={s.key} className="flex items-center gap-2">
                        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-sm ${s.className}`} />
                        {s.label} {dbText(s.mdb)}
                      </li>
                    ))}
                    <li className="flex items-center gap-2">
                      <span aria-hidden="true" className="inline-block h-3 w-[2px] bg-[hsl(var(--brand-bone))]" />
                      End of budget
                    </li>
                  </ul>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h3 className={`${LABEL_CLASS} mb-1`}>Link loss</h3>
                    <ToolResult label="Fiber" value={`${dbText(result.fiberMdb)}`} />
                    <ToolResult label="Connectors" value={dbText(result.connectorMdb)} />
                    <ToolResult label="Splices" value={dbText(result.spliceMdb)} />
                    <ToolResult label="Total link loss" value={dbText(result.totalMdb)} testId="text-fiber-total" />
                  </div>
                  <div>
                    <h3 className={`${LABEL_CLASS} mb-1`}>Power budget</h3>
                    <ToolResult label="TX min less RX sensitivity" value={dbText(result.gapMdb)} />
                    <ToolResult label="Penalty allowance" value={`-${dbText(result.penaltyMdb)}`} />
                    <ToolResult label="Budget for the link" value={dbText(result.budgetMdb)} testId="text-fiber-budget" />
                    <ToolResult label="Remaining after link loss" value={dbText(result.remainingMdb)} testId="text-fiber-remaining" />
                    <ToolResult label="Safety margin" value={`-${dbText(result.marginMdb)}`} />
                    <ToolResult label="Spare" value={dbText(spare)} testId="text-fiber-spare" />
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h3 className={`${LABEL_CLASS} mb-1`}>How far this fiber can go</h3>
                    <ToolResult
                      label="Longest run the loss allows"
                      value={
                        result.lossLimitedM === null
                          ? "no limit at 0 dB/km"
                          : result.lossLimitedM === 0
                            ? "none, connectors and margin use it all"
                            : lengthText(result.lossLimitedM)
                      }
                      testId="text-fiber-loss-limited"
                    />
                    {result.standardReachM !== null ? (
                      <ToolResult label="Standard reach on this fiber" value={lengthText(result.standardReachM)} />
                    ) : null}
                    {result.connectorEquivM !== null ? (
                      <ToolResult
                        label="One connector pair costs as much as"
                        value={`${lengthText(result.connectorEquivM)} of fiber`}
                      />
                    ) : null}
                  </div>
                  <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:self-end">
                    {ft.media === "mmf"
                      ? "On multimode fiber the standard reach is set by modal bandwidth, so a run can fit the loss budget and still be longer than the optic supports."
                      : "On single-mode fiber the reach is usually set by loss, up to the distance the standard specifies."}
                    {gradeOf(fiber) === null && optic && optic.smfReachM
                      ? ` ${optic.name} is specified to ${lengthText(optic.smfReachM)}.`
                      : ""}
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                One or more fields above have an error. Fix them and the budget appears here.
              </p>
            )}

            {result && result.flags.length > 0 ? (
              <div className="mt-6 space-y-2">
                {result.flags.map((flag, i) => (
                  <FlagNote key={i} flag={flag} />
                ))}
              </div>
            ) : null}

            {result ? (
              <div className="mt-6">
                <CopyButton value={summary} testId="button-copy-summary">
                  <span>Copy summary</span>
                </CopyButton>
              </div>
            ) : null}
          </ToolPanel>
        </div>

        <ToolPanel title="Optic reference">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse" data-testid="table-fiber-optics">
              <caption className="sr-only">Power figures and standard reach for each transceiver preset</caption>
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th scope="col" className={TH_CLASS}>
                    Optic
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    TX min
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    RX sens.
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Penalty
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Link budget
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Standard reach
                  </th>
                </tr>
              </thead>
              <tbody>
                {TRANSCEIVERS.map((t) => (
                  <tr key={t.id} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                      {t.name}
                    </th>
                    <td className={TD_CLASS}>{t.txMinDbm.toFixed(1)} dBm</td>
                    <td className={TD_CLASS}>{t.rxSensDbm.toFixed(1)} dBm</td>
                    <td className={TD_CLASS}>{t.penaltyDb.toFixed(2)} dB</td>
                    <td className={TD_CLASS}>{dbText(toMdb(t.txMinDbm) - toMdb(t.rxSensDbm) - toMdb(t.penaltyDb))}</td>
                    <td className={`${TD_CLASS} text-[hsl(var(--brand-bone-dim))]`}>
                      {t.mmfReachM
                        ? `${lengthText(t.mmfReachM.OM3)} OM3, ${lengthText(t.mmfReachM.OM4)} OM4`
                        : t.smfReachM
                          ? `${lengthText(t.smfReachM)} OS2`
                          : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`${HINT_CLASS} mt-3`}>
            Link budget is TX min less RX sensitivity less the penalty. For every row it equals the channel insertion
            loss limit in the standard. The 100G rows are per lane.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
