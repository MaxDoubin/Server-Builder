/**
 * Bandwidth-delay product calculator.
 *
 * Three ceilings sit over a single TCP stream: the link, the window divided
 * by the round trip, and the loss rate. This page computes all three from
 * the same inputs and says which one binds, because the fix for each is
 * different. The product itself is exact (BigInt over the decimal inputs);
 * the arithmetic lives in lib/toolkit/bandwidth-delay-product.
 */

import { useMemo, useState } from "react";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  type Ceiling,
  MATHIS_C_DELAYED_ACK,
  MATHIS_C_EVERY_SEGMENT,
  MAX_SCALED_WINDOW,
  MAX_UNSCALED_WINDOW,
  MAX_WINDOW_SHIFT,
  PATH_PRESETS,
  RTT_UNITS,
  type RttUnit,
  WINDOW_UNITS,
  bdpBits,
  bindingCeiling,
  ceilBytes,
  decimalToNumber,
  mathisThroughputBps,
  parseBandwidth,
  parseLossPct,
  parseMss,
  parseRtt,
  parseWindow,
  requiredWindowShift,
  windowCoversBdp,
  windowFieldFor,
  windowThroughputBps,
} from "@/lib/toolkit/bandwidth-delay-product";
import {
  RATE_UNITS,
  type RateUnit,
  type SizeUnit,
  formatBitRate,
  formatBytesIEC,
  formatBytesSI,
  formatRational,
  formatSig,
  groupDigits,
  scaleDecimal,
} from "@/lib/toolkit/transfer-time-calculator";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "min-h-[44px] w-full min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "min-h-[44px] w-28 shrink-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const WIDE_SELECT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_OFF_CLASS =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const NOTE_CLASS = "rounded-lg border p-3 font-mono-tight text-xs leading-relaxed";
const GOOD_TONE_CLASS =
  "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-signal))]";
const WARN_TONE_CLASS =
  "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]";

const CEILING_NAME: Record<Ceiling, string> = {
  link: "the link rate",
  window: "the window",
  loss: "packet loss (Mathis estimate)",
};

const CEILING_FIX: Record<Ceiling, string> = {
  link: "The stream can fill the link. Only a faster link makes it faster.",
  window:
    "The sender runs out of window and waits for acknowledgments. A larger receive window (and send buffer) fixes this; a faster link does nothing.",
  loss:
    "Congestion control keeps backing off. Finding the loss, or a congestion control that tolerates it, helps more than a bigger window or a faster link.",
};

/* ----------------------------------------------------------------- helpers */

function FieldMessage({ id, error, hint }: { id: string; error: string | null; hint: string }) {
  return error ? (
    <p
      id={`${id}-error`}
      role="alert"
      className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
    >
      {error}
    </p>
  ) : (
    <p id={`${id}-hint`} className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
      {hint}
    </p>
  );
}

function errorOf(parsed: { kind: string; message?: string }): string | null {
  return parsed.kind === "error" ? (parsed.message ?? "That value is not valid.") : null;
}

/**
 * A share of the link, for a rate that does not fill it. Rounding never
 * reaches 100 percent here, because "no, 100%" would contradict itself.
 */
function percentOf(part: number, whole: number): string {
  const pct = Math.min(1, part / whole) * 100;
  return pct >= 99.9 ? "over 99.9%" : `${formatSig(pct, 3)}%`;
}

/* --------------------------------------------------------------- component */

export function BandwidthDelayProduct() {
  const [bandwidth, setBandwidth] = useState("1");
  const [bandwidthUnit, setBandwidthUnit] = useState<RateUnit>("Gbps");
  const [rtt, setRtt] = useState("70");
  const [rttUnit, setRttUnit] = useState<RttUnit>("ms");
  const [windowSize, setWindowSize] = useState(String(MAX_UNSCALED_WINDOW));
  const [windowUnit, setWindowUnit] = useState<SizeUnit>("B");
  const [mss, setMss] = useState("1460");
  const [loss, setLoss] = useState("0.01");
  const [delayedAck, setDelayedAck] = useState(false);

  const bwParsed = useMemo(() => parseBandwidth(bandwidth, bandwidthUnit), [bandwidth, bandwidthUnit]);
  const rttParsed = useMemo(() => parseRtt(rtt, rttUnit), [rtt, rttUnit]);
  const windowParsed = useMemo(() => parseWindow(windowSize, windowUnit), [windowSize, windowUnit]);
  const mssParsed = useMemo(() => parseMss(mss), [mss]);
  const lossParsed = useMemo(() => parseLossPct(loss), [loss]);

  const bw = bwParsed.kind === "ok" ? bwParsed : null;
  const rt = rttParsed.kind === "ok" ? rttParsed : null;
  const win = windowParsed.kind === "ok" ? windowParsed : null;
  const mssBytes = mssParsed.kind === "ok" ? mssParsed.bytes : null;
  const lossFraction = lossParsed.kind === "ok" ? lossParsed.fraction : null;
  const mathisC = delayedAck ? MATHIS_C_DELAYED_ACK : MATHIS_C_EVERY_SEGMENT;

  const product = useMemo(() => {
    if (!bw || !rt) return null;
    const bits = bdpBits(bw.exact, rt.exact);
    // bits / 8 is bits * 125 * 10^-3, which keeps the denominator a power of ten.
    const bytesExact = scaleDecimal({ m: bits.m, e: bits.e - 3 }, 125n);
    const needed = ceilBytes(bits);
    const shift = requiredWindowShift(needed);
    const bitsNum = decimalToNumber(bits);
    // Under one unit, three decimal places would print a misleading zero.
    const precise = (value: number, exact: ReturnType<typeof formatRational>) =>
      value < 1 ? { text: formatSig(value, 4), exact: true } : exact;
    return {
      bitsText: precise(bitsNum, formatRational(scaleDecimal(bits, 1n), 3)),
      bytesText: precise(bitsNum / 8, formatRational(bytesExact, 3)),
      bytesNum: bitsNum / 8,
      needed,
      shift,
      field: shift !== null ? windowFieldFor(needed, shift) : null,
      unscaledBps: windowThroughputBps(MAX_UNSCALED_WINDOW, rt.seconds),
    };
  }, [bw, rt]);

  const segments = product && mssBytes !== null ? (product.needed + BigInt(mssBytes) - 1n) / BigInt(mssBytes) : null;

  const windowBps = win && rt ? windowThroughputBps(win.bytes, rt.seconds) : null;
  // Decided in integers, so a window equal to the product never reads as
  // a hair short of the link because of a rounded division.
  const windowCovers = win && product ? windowCoversBdp(win.bytes, product.needed) : false;
  const mathisBps =
    mssBytes !== null && rt && lossFraction !== null
      ? mathisThroughputBps(mssBytes, rt.seconds, lossFraction, mathisC)
      : null;
  const binding = bw && windowBps !== null ? bindingCeiling(bw.bps, windowBps, mathisBps, windowCovers) : null;

  const scaleRows = useMemo(() => {
    if (!rt || !product) return [];
    return Array.from({ length: MAX_WINDOW_SHIFT + 1 }, (_, shift) => {
      const maxWindow = MAX_UNSCALED_WINDOW * 2 ** shift;
      const bps = windowThroughputBps(maxWindow, rt.seconds);
      return { shift, maxWindow, bps, fills: windowCoversBdp(maxWindow, product.needed) };
    });
  }, [rt, product]);

  const bwError = errorOf(bwParsed);
  const rttError = errorOf(rttParsed);
  const windowError = errorOf(windowParsed);
  const mssError = errorOf(mssParsed);
  const lossError = errorOf(lossParsed);

  const summary = product
    ? `Bandwidth-delay product ${product.bytesText.exact ? "" : "about "}${product.bytesText.text} bytes. ${
        product.shift === null
          ? "Larger than any TCP window."
          : product.shift === 0
            ? "The unscaled 64 KiB window is enough."
            : `Needs window scale ${product.shift}.`
      }`
    : bwParsed.kind === "error" || rttParsed.kind === "error"
      ? "Fix the highlighted field to see the product."
      : "Enter a bandwidth and a round trip time.";

  function applyPreset(index: number) {
    const preset = PATH_PRESETS[index];
    setBandwidth(preset.bandwidth);
    setBandwidthUnit(preset.bandwidthUnit);
    setRtt(preset.rtt);
    setRttUnit(preset.rttUnit);
  }

  return (
    <ToolShell slug="bandwidth-delay-product">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <ToolPanel title="Path">
            <div>
              <label htmlFor="bdp-bandwidth" className={LABEL_CLASS}>
                Bandwidth
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="bdp-bandwidth"
                  value={bandwidth}
                  onChange={(event) => setBandwidth(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={bwError !== null}
                  aria-describedby={bwError ? "bdp-bandwidth-error" : "bdp-bandwidth-hint"}
                  placeholder="1"
                  data-testid="input-bandwidth"
                  className={INPUT_CLASS}
                />
                <label htmlFor="bdp-bandwidth-unit" className="sr-only">
                  Bandwidth unit
                </label>
                <select
                  id="bdp-bandwidth-unit"
                  value={bandwidthUnit}
                  onChange={(event) => setBandwidthUnit(event.target.value as RateUnit)}
                  data-testid="select-bandwidth-unit"
                  className={SELECT_CLASS}
                >
                  {RATE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id}
                    </option>
                  ))}
                </select>
              </div>
              <FieldMessage
                id="bdp-bandwidth"
                error={bwError}
                hint="The bottleneck rate of the path, in bits per second with decimal prefixes."
              />
            </div>

            <div className="mt-5">
              <label htmlFor="bdp-rtt" className={LABEL_CLASS}>
                Round trip time
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="bdp-rtt"
                  value={rtt}
                  onChange={(event) => setRtt(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={rttError !== null}
                  aria-describedby={rttError ? "bdp-rtt-error" : "bdp-rtt-hint"}
                  placeholder="70"
                  data-testid="input-rtt"
                  className={INPUT_CLASS}
                />
                <label htmlFor="bdp-rtt-unit" className="sr-only">
                  Round trip time unit
                </label>
                <select
                  id="bdp-rtt-unit"
                  value={rttUnit}
                  onChange={(event) => setRttUnit(event.target.value as RttUnit)}
                  data-testid="select-rtt-unit"
                  className={SELECT_CLASS}
                >
                  {RTT_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <FieldMessage
                id="bdp-rtt"
                error={rttError}
                hint="What ping reports, there and back. Use the RTT under load if you have it."
              />
            </div>
          </ToolPanel>

          <ToolPanel title="Example paths">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PATH_PRESETS.map((preset, index) => {
                const active =
                  bandwidth.trim() === preset.bandwidth &&
                  bandwidthUnit === preset.bandwidthUnit &&
                  rtt.trim() === preset.rtt &&
                  rttUnit === preset.rttUnit;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(index)}
                    aria-pressed={active}
                    data-testid={`button-preset-${preset.id}`}
                    className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                      active
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                    }`}
                  >
                    <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {preset.label}{" "}
                      <span className="text-[hsl(var(--brand-ash))]">
                        {preset.bandwidth} {preset.bandwidthUnit}, {preset.rtt} {preset.rttUnit}
                      </span>
                    </span>
                    <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {preset.note}
                    </span>
                  </button>
                );
              })}
            </div>
          </ToolPanel>

          <ToolPanel title="One TCP stream">
            <div>
              <label htmlFor="bdp-window" className={LABEL_CLASS}>
                Receive window
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="bdp-window"
                  value={windowSize}
                  onChange={(event) => setWindowSize(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={windowError !== null}
                  aria-describedby={windowError ? "bdp-window-error" : "bdp-window-hint"}
                  placeholder="65535"
                  data-testid="input-window"
                  className={INPUT_CLASS}
                />
                <label htmlFor="bdp-window-unit" className="sr-only">
                  Window unit
                </label>
                <select
                  id="bdp-window-unit"
                  value={windowUnit}
                  onChange={(event) => setWindowUnit(event.target.value as SizeUnit)}
                  data-testid="select-window-unit"
                  className={SELECT_CLASS}
                >
                  {WINDOW_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <FieldMessage
                id="bdp-window"
                error={windowError}
                hint={
                  win?.clamped
                    ? `More than TCP can advertise, so ${groupDigits(BigInt(MAX_SCALED_WINDOW))} bytes (65,535 x 2^14) is used.`
                    : win?.truncated
                      ? `TCP counts whole bytes, so ${groupDigits(BigInt(win.bytes))} bytes is used.`
                      : "The window the receiver advertises, after scaling. 65,535 bytes is the most without scaling."
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setWindowSize(String(MAX_UNSCALED_WINDOW));
                    setWindowUnit("B");
                  }}
                  data-testid="button-window-unscaled"
                  className={`${CHIP_CLASS} ${CHIP_OFF_CLASS}`}
                >
                  65,535 B unscaled
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWindowSize("4");
                    setWindowUnit("MiB");
                  }}
                  data-testid="button-window-4mib"
                  className={`${CHIP_CLASS} ${CHIP_OFF_CLASS}`}
                >
                  4 MiB
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWindowSize("16");
                    setWindowUnit("MiB");
                  }}
                  data-testid="button-window-16mib"
                  className={`${CHIP_CLASS} ${CHIP_OFF_CLASS}`}
                >
                  16 MiB
                </button>
                {product && product.shift !== null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setWindowSize(product.needed.toString());
                      setWindowUnit("B");
                    }}
                    data-testid="button-window-bdp"
                    className={`${CHIP_CLASS} ${CHIP_OFF_CLASS}`}
                  >
                    Match the BDP
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="bdp-mss" className={LABEL_CLASS}>
                  MSS, bytes
                </label>
                <input
                  id="bdp-mss"
                  value={mss}
                  onChange={(event) => setMss(event.target.value)}
                  inputMode="numeric"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={mssError !== null}
                  aria-describedby={mssError ? "bdp-mss-error" : "bdp-mss-hint"}
                  placeholder="1460"
                  data-testid="input-mss"
                  className={`mt-2 ${INPUT_CLASS}`}
                />
                <FieldMessage id="bdp-mss" error={mssError} hint="1460 for IPv4 on a 1500 byte MTU." />
              </div>
              <div className="min-w-0">
                <label htmlFor="bdp-loss" className={LABEL_CLASS}>
                  Packet loss, percent
                </label>
                <input
                  id="bdp-loss"
                  value={loss}
                  onChange={(event) => setLoss(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={lossError !== null}
                  aria-describedby={lossError ? "bdp-loss-error" : "bdp-loss-hint"}
                  placeholder="0.01"
                  data-testid="input-loss"
                  className={`mt-2 ${INPUT_CLASS}`}
                />
                <FieldMessage
                  id="bdp-loss"
                  error={lossError}
                  hint="0.01 is one packet in ten thousand. Leave empty to skip the estimate."
                />
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="bdp-ack" className={LABEL_CLASS}>
                Acknowledgments
              </label>
              <select
                id="bdp-ack"
                value={delayedAck ? "delayed" : "every"}
                onChange={(event) => setDelayedAck(event.target.value === "delayed")}
                data-testid="select-ack"
                className={WIDE_SELECT_CLASS}
              >
                <option value="every">Every segment, C = 1.22</option>
                <option value="delayed">Delayed, every second segment, C = 0.87</option>
              </select>
            </div>
          </ToolPanel>
        </div>

        <div className="min-w-0 space-y-6">
          <ToolPanel title="Bandwidth-delay product">
            <p
              data-testid="text-bdp"
              className="break-all font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
            >
              {product ? `${product.bytesText.exact ? "" : "~"}${product.bytesText.text} B` : "--"}
            </p>
            <p
              role="status"
              aria-live="polite"
              data-testid="text-summary"
              className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
            >
              {summary}
            </p>

            {product && rt ? (
              <div className="mt-4">
                <ToolResult
                  label="In bits"
                  value={`${product.bitsText.exact ? "" : "about "}${product.bitsText.text} bits`}
                  testId="text-bdp-bits"
                />
                <ToolResult
                  label="In bytes"
                  value={`${formatBytesSI(product.bytesNum)} = ${formatBytesIEC(product.bytesNum)}`}
                />
                <ToolResult
                  label="Segments in flight"
                  value={
                    segments !== null && mssBytes !== null
                      ? `${groupDigits(segments)} of ${groupDigits(BigInt(mssBytes))} B, rounded up`
                      : "needs a valid MSS"
                  }
                />
                <ToolResult
                  label="Receive window needed"
                  value={`${groupDigits(product.needed)} B`}
                  testId="text-window-needed"
                />
                <ToolResult
                  label="Window scale needed"
                  value={
                    product.shift === null
                      ? "more than 14"
                      : product.shift === 0
                        ? "0 (none)"
                        : `${product.shift} (x ${groupDigits(1n << BigInt(product.shift))})`
                  }
                  testId="text-window-scale"
                />
                {product.shift !== null && product.field !== null ? (
                  <ToolResult
                    label="16 bit field carries"
                    value={`${groupDigits(product.field)} << ${product.shift} = ${groupDigits(
                      product.field << BigInt(product.shift),
                    )} B`}
                  />
                ) : null}
              </div>
            ) : null}

            {product && bw && rt ? (
              <p
                data-testid="text-unscaled-verdict"
                className={`mt-4 ${NOTE_CLASS} ${product.shift === 0 ? GOOD_TONE_CLASS : WARN_TONE_CLASS}`}
              >
                {product.shift === 0
                  ? `The unscaled window is enough. 65,535 bytes covers the ${groupDigits(product.needed)} byte product, so one stream can fill this path without window scaling, loss permitting.`
                  : `The unscaled window is not enough. 65,535 bytes per ${formatSig(rt.seconds * 1000, 6)} ms round trip carries at most ${formatBitRate(product.unscaledBps)}, ${percentOf(product.unscaledBps, bw.bps)} of the link.`}
                {product.shift === null
                  ? ` Even the largest scaled window, ${groupDigits(BigInt(MAX_SCALED_WINDOW))} bytes at scale 14, is smaller than this product, so one TCP connection cannot fill the path. Parallel streams can.`
                  : ""}
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Throughput of one stream">
            {bw && rt && win && windowBps !== null ? (
              <>
                <ToolResult label="Link rate" value={formatBitRate(bw.bps)} />
                <ToolResult
                  label="Window limit, window / RTT"
                  value={formatBitRate(windowBps)}
                  testId="text-window-throughput"
                />
                <ToolResult
                  label="Loss limit, Mathis approx."
                  value={
                    mathisBps !== null
                      ? `about ${formatBitRate(mathisBps, 3)}`
                      : lossParsed.kind === "empty" || lossFraction === 0
                        ? "no loss entered"
                        : "needs a valid MSS and loss"
                  }
                  testId="text-mathis"
                />
                {binding ? (
                  <ToolResult
                    label="Best case for one stream"
                    value={`${binding.ceiling === "loss" ? "about " : ""}${formatBitRate(binding.bps, binding.ceiling === "loss" ? 3 : 4)}`}
                    testId="text-stream-ceiling"
                  />
                ) : null}
                {binding ? (
                  <p className={`mt-4 ${NOTE_CLASS} ${binding.ceiling === "link" ? GOOD_TONE_CLASS : WARN_TONE_CLASS}`}>
                    Bound by {CEILING_NAME[binding.ceiling]}. {CEILING_FIX[binding.ceiling]}
                  </p>
                ) : null}
                {win.bytes > MAX_UNSCALED_WINDOW ? (
                  <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    A window above 65,535 bytes exists only if both ends sent the window scale option in the
                    handshake.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                Needs a valid bandwidth, round trip time and window.
              </p>
            )}

            <div className="mt-5 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
              <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                Approximation
              </div>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Loss limit = (MSS / RTT) x (C / sqrt(p)), from Mathis, Semke, Mahdavi and Ott (1997). It models
                Reno-style congestion avoidance under light, steady loss and ignores timeouts and slow start, so read it as
                an order of magnitude.
                {mssBytes !== null && rt && lossFraction !== null && lossFraction > 0
                  ? ` Here: (${groupDigits(BigInt(mssBytes))} B x 8 / ${formatSig(rt.seconds, 6)} s) x (${formatSig(mathisC, 3)} / sqrt(${formatSig(lossFraction, 4)})).`
                  : ""}
              </p>
              {lossFraction !== null && lossFraction >= 0.01 ? (
                <p className={`mt-3 ${NOTE_CLASS} ${WARN_TONE_CLASS}`}>
                  At one percent loss or more, retransmission timeouts become common and the formula leaves them out,
                  so the real figure is likely lower.
                </p>
              ) : null}
            </div>
          </ToolPanel>
        </div>
      </div>

      <ToolPanel title="Window scale at this round trip" className="mt-6">
        {scaleRows.length && product && bw ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-window-scale">
              <caption className="sr-only">
                Largest window and throughput for each window scale shift count at this round trip time
              </caption>
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  {["Shift", "Multiplier", "Largest window", "Throughput cap", "Fills the link"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scaleRows.map((row) => {
                  const required = product.shift === row.shift;
                  return (
                    <tr
                      key={row.shift}
                      className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${
                        required ? "bg-[hsl(var(--brand-signal)/0.08)]" : ""
                      }`}
                    >
                      <th
                        scope="row"
                        className={`py-2 pr-4 font-mono-tight text-sm font-normal ${
                          required ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone))]"
                        }`}
                      >
                        {row.shift}
                        {required ? <span className="sr-only"> (smallest that fills the link)</span> : null}
                      </th>
                      <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {groupDigits(1n << BigInt(row.shift))}
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {groupDigits(BigInt(row.maxWindow))} B
                      </td>
                      <td className="py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {formatBitRate(row.bps)}
                      </td>
                      <td
                        className={`py-2 font-mono-tight text-sm ${
                          row.fills ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-ash))]"
                        }`}
                      >
                        {row.fills ? "yes" : `no, ${percentOf(row.bps, bw.bps)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
            Needs a valid bandwidth and round trip time.
          </p>
        )}
        <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          RFC 7323: each side sends its shift count once, in its own SYN, and the count is capped at{" "}
          {MAX_WINDOW_SHIFT}. On Linux,{" "}
          <code>ss -ti</code> shows the negotiated pair as <code>wscale:send,receive</code>.
        </p>
      </ToolPanel>
    </ToolShell>
  );
}
