/**
 * Transfer time calculator.
 *
 * Every input is held as the string the reader typed and parsed on each
 * render, so a half-typed "1." or "1e" shows a precise message rather than
 * snapping to a number. Sizes go through exact BigInt decimals, which is
 * why 1.1 TiB prints as the byte count it really is. The arithmetic lives
 * in lib/toolkit/transfer-time-calculator so it can be tested on its own.
 */

import { useMemo, useState } from "react";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  DURATION_UNITS,
  type DurationUnit,
  LINK_PRESETS,
  OVERHEAD_CHOICES,
  RATE_UNITS,
  type RateUnit,
  SIZE_UNITS,
  type SizeUnit,
  efficiency,
  formatBitRate,
  formatByteRateIEC,
  formatByteRateSI,
  formatBytesIEC,
  formatBytesSI,
  formatDuration,
  formatRational,
  formatSig,
  parseDuration,
  parseOverhead,
  parseRate,
  parseSize,
  requiredLineBps,
  sizeUnit,
  transferSeconds,
} from "@/lib/toolkit/transfer-time-calculator";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "min-h-[44px] w-full min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "min-h-[44px] w-32 shrink-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON_CLASS =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF_CLASS =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";

/** "Mbps" read wrongly as bytes: the label the mistake would use. */
const BYTE_MISREAD: Record<RateUnit, string> = {
  bps: "B/s",
  kbps: "kB/s",
  Mbps: "MB/s",
  Gbps: "GB/s",
};

const SIZE_OPTION_LABEL: Record<SizeUnit, string> = {
  B: "B (bytes)",
  KB: "KB (SI)",
  KiB: "KiB (IEC)",
  MB: "MB (SI)",
  MiB: "MiB (IEC)",
  GB: "GB (SI)",
  GiB: "GiB (IEC)",
  TB: "TB (SI)",
  TiB: "TiB (IEC)",
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

function pctChange(from: number, to: number): string {
  const pct = ((to - from) / from) * 100;
  return `${formatSig(Math.abs(pct), 3)} percent ${pct >= 0 ? "longer" : "shorter"}`;
}

/* --------------------------------------------------------------- component */

export function TransferTimeCalculator() {
  const [size, setSize] = useState("4.7");
  const [sizeUnitId, setSizeUnitId] = useState<SizeUnit>("GB");
  const [rate, setRate] = useState("1");
  const [rateUnitId, setRateUnitId] = useState<RateUnit>("Gbps");
  const [overhead, setOverhead] = useState(LINK_PRESETS[1].overhead);
  const [target, setTarget] = useState("30");
  const [targetUnit, setTargetUnit] = useState<DurationUnit>("s");

  const sizeParsed = useMemo(() => parseSize(size, sizeUnitId), [size, sizeUnitId]);
  const rateParsed = useMemo(() => parseRate(rate, rateUnitId), [rate, rateUnitId]);
  const overheadParsed = useMemo(() => parseOverhead(overhead), [overhead]);
  const targetParsed = useMemo(() => parseDuration(target, targetUnit), [target, targetUnit]);

  const unit = sizeUnit(sizeUnitId);
  const sizeOk = sizeParsed.kind === "ok" ? sizeParsed : null;
  const bps = rateParsed.kind === "ok" ? rateParsed.bps : null;
  const pct = overheadParsed.kind === "ok" ? overheadParsed.pct : null;
  const targetSeconds = targetParsed.kind === "ok" ? targetParsed.seconds : null;

  const bytesExact = sizeOk ? formatRational(sizeOk.bytes) : null;
  const bitsExact = sizeOk ? formatRational({ num: sizeOk.bytes.num * 8n, den: sizeOk.bytes.den }) : null;

  // The same digits under the other prefix system, which is the mistake
  // this tool exists to make visible.
  const partner = unit.partner ? sizeUnit(unit.partner) : null;
  const partnerParsed = partner ? parseSize(size, partner.id) : null;
  const partnerBytes = partnerParsed?.kind === "ok" ? partnerParsed.bytesNum : null;

  const forward =
    sizeOk && bps !== null && pct !== null
      ? {
          seconds: transferSeconds(sizeOk.bytesNum, bps, pct),
          goodput: bps * efficiency(pct),
          rawSeconds: transferSeconds(sizeOk.bytesNum, bps, 0),
          partnerSeconds: partnerBytes !== null ? transferSeconds(partnerBytes, bps, pct) : null,
        }
      : null;

  const reverse =
    sizeOk && pct !== null && targetSeconds !== null
      ? {
          line: requiredLineBps(sizeOk.bytesNum, targetSeconds, pct),
          goodput: requiredLineBps(sizeOk.bytesNum, targetSeconds, pct) * efficiency(pct),
        }
      : null;

  const presetRows = useMemo(
    () =>
      sizeOk && targetSeconds !== null
        ? LINK_PRESETS.map((preset) => {
            const parsedRate = parseRate(preset.value, preset.unit);
            const lineBps = parsedRate.kind === "ok" ? parsedRate.bps : 0;
            const presetPct = Number(preset.overhead);
            const seconds = transferSeconds(sizeOk.bytesNum, lineBps, presetPct);
            return {
              preset,
              goodput: lineBps * efficiency(presetPct),
              seconds,
              meets: seconds <= targetSeconds * (1 + 1e-12),
            };
          })
        : [],
    [sizeOk, targetSeconds],
  );

  const sizeError = errorOf(sizeParsed);
  const rateError = errorOf(rateParsed);
  const overheadError = errorOf(overheadParsed);
  const targetError = errorOf(targetParsed);

  const summary = forward
    ? `${size.trim()} ${sizeUnitId} over ${rate.trim()} ${rateUnitId} with ${formatSig(pct ?? 0, 4)} percent overhead takes ${formatDuration(forward.seconds)}.`
    : sizeParsed.kind === "empty" || rateParsed.kind === "empty"
      ? "Enter a data size and a link speed to see the transfer time."
      : "Fix the highlighted field to see the transfer time.";

  function applyPreset(index: number) {
    const preset = LINK_PRESETS[index];
    setRate(preset.value);
    setRateUnitId(preset.unit);
    setOverhead(preset.overhead);
  }

  return (
    <ToolShell slug="transfer-time-calculator">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <ToolPanel title="Data and link">
            <div>
              <label htmlFor="ttc-size" className={LABEL_CLASS}>
                Data size
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="ttc-size"
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={sizeError !== null}
                  aria-describedby={sizeError ? "ttc-size-error" : "ttc-size-hint"}
                  placeholder="4.7"
                  data-testid="input-size"
                  className={INPUT_CLASS}
                />
                <label htmlFor="ttc-size-unit" className="sr-only">
                  Size unit
                </label>
                <select
                  id="ttc-size-unit"
                  value={sizeUnitId}
                  onChange={(event) => setSizeUnitId(event.target.value as SizeUnit)}
                  data-testid="select-size-unit"
                  className={SELECT_CLASS}
                >
                  {SIZE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {SIZE_OPTION_LABEL[u.id]}
                    </option>
                  ))}
                </select>
              </div>
              <FieldMessage
                id="ttc-size"
                error={sizeError}
                hint={`${unit.id === "B" ? "Plain bytes." : `1 ${unit.id} is ${unit.power} bytes (${unit.system}).`} Decimals and 1e9 notation work.`}
              />
            </div>

            <div className="mt-5">
              <label htmlFor="ttc-rate" className={LABEL_CLASS}>
                Link speed
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="ttc-rate"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={rateError !== null}
                  aria-describedby={rateError ? "ttc-rate-error" : "ttc-rate-hint"}
                  placeholder="1"
                  data-testid="input-rate"
                  className={INPUT_CLASS}
                />
                <label htmlFor="ttc-rate-unit" className="sr-only">
                  Speed unit
                </label>
                <select
                  id="ttc-rate-unit"
                  value={rateUnitId}
                  onChange={(event) => setRateUnitId(event.target.value as RateUnit)}
                  data-testid="select-rate-unit"
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
                id="ttc-rate"
                error={rateError}
                hint="Bits per second, decimal prefixes: 1 Mbps is 1,000,000 bits per second."
              />
            </div>

            <div className="mt-5">
              <label htmlFor="ttc-overhead" className={LABEL_CLASS}>
                Protocol overhead, percent
              </label>
              <input
                id="ttc-overhead"
                value={overhead}
                onChange={(event) => setOverhead(event.target.value)}
                inputMode="decimal"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={overheadError !== null}
                aria-describedby={overheadError ? "ttc-overhead-error" : "ttc-overhead-hint"}
                placeholder="0"
                data-testid="input-overhead"
                className={`mt-2 ${INPUT_CLASS}`}
              />
              <FieldMessage
                id="ttc-overhead"
                error={overheadError}
                hint={
                  pct !== null
                    ? `Efficiency ${formatSig(efficiency(pct) * 100, 4)} percent: that share of the line rate carries your data.`
                    : "The share of the line rate spent on headers, framing and line coding."
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {OVERHEAD_CHOICES.map((choice) => (
                  <button
                    key={choice.label}
                    type="button"
                    title={choice.note}
                    onClick={() => setOverhead(choice.pct)}
                    data-testid={`button-overhead-${choice.pct}`}
                    className={`${CHIP_CLASS} ${overhead.trim() === choice.pct ? CHIP_ON_CLASS : CHIP_OFF_CLASS}`}
                  >
                    {choice.label} {choice.pct}%
                  </button>
                ))}
              </div>
            </div>
          </ToolPanel>

          <ToolPanel title="Link presets">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {LINK_PRESETS.map((preset, index) => {
                const active =
                  rate.trim() === preset.value && rateUnitId === preset.unit && overhead.trim() === preset.overhead;
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
                        {preset.value} {preset.unit}, {preset.overhead}%
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
        </div>

        <div className="min-w-0 space-y-6">
          <ToolPanel title="Transfer time">
            <p
              data-testid="text-transfer-time"
              className="font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
            >
              {forward ? formatDuration(forward.seconds) : "--"}
            </p>
            <p
              role="status"
              aria-live="polite"
              data-testid="text-summary"
              className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
            >
              {summary}
            </p>

            {forward && sizeOk && bps !== null && pct !== null ? (
              <div className="mt-4">
                <ToolResult label="Seconds" value={`${formatSig(forward.seconds, 6)} s`} testId="text-seconds" />
                <ToolResult
                  label="Size in bytes"
                  value={`${bytesExact?.exact ? "" : "about "}${bytesExact?.text} B`}
                  testId="text-bytes"
                />
                <ToolResult
                  label="Size in bits"
                  value={`${bitsExact?.exact ? "" : "about "}${bitsExact?.text} bits`}
                  testId="text-bits"
                />
                <ToolResult label="Same size, SI" value={formatBytesSI(sizeOk.bytesNum, 5)} />
                <ToolResult label="Same size, IEC" value={formatBytesIEC(sizeOk.bytesNum, 5)} />
                <ToolResult label="Line rate" value={formatBitRate(bps)} />
                <ToolResult label="Payload rate" value={formatBitRate(forward.goodput)} testId="text-goodput" />
                <ToolResult
                  label="Payload in bytes"
                  value={`${formatByteRateSI(forward.goodput)} = ${formatByteRateIEC(forward.goodput)}`}
                />
              </div>
            ) : null}
          </ToolPanel>

          <ToolPanel title="The units, spelled out">
            {forward && sizeOk && bps !== null && pct !== null ? (
              <ul className="space-y-3" data-testid="list-units">
                <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="text-[hsl(var(--brand-bone))]">Bits and bytes. </span>A byte is 8 bits, so{" "}
                  {formatBitRate(bps)} moves at most {formatByteRateSI(bps)}. Reading {rate.trim()} {rateUnitId} as{" "}
                  {rate.trim()} {BYTE_MISREAD[rateUnitId]} would predict {formatDuration(forward.seconds / 8)}, eight
                  times too fast.
                </li>
                <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="text-[hsl(var(--brand-bone))]">SI and IEC. </span>
                  {unit.system === "none"
                    ? "Plain bytes carry no prefix, so there is nothing to mix up. The difference appears from kilo upward: a KiB is 1024 bytes, a KB is 1000."
                    : partner && forward.partnerSeconds !== null
                      ? `${unit.id} is ${unit.system}, ${unit.power} bytes each. The same ${size.trim()} read as ${partner.id} (${partner.system}, ${partner.power}) would take ${formatDuration(forward.partnerSeconds)}, ${pctChange(forward.seconds, forward.partnerSeconds)}.`
                      : `${unit.id} is ${unit.system}, ${unit.power} bytes each.`}
                </li>
                <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="text-[hsl(var(--brand-bone))]">Line rate and payload. </span>
                  {pct === 0
                    ? "No overhead is set, so this is the time at the full line rate: a best case no real protocol reaches."
                    : `At the raw line rate the same transfer would take ${formatDuration(forward.rawSeconds)}. The ${formatSig(pct, 4)} percent overhead is the difference.`}
                </li>
                <li className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="text-[hsl(var(--brand-bone))]">Network rates are decimal. </span>1 Gbps is exactly
                  1,000,000,000 bits per second. No link rate uses 1024.
                </li>
              </ul>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                The comparisons appear once the size, speed and overhead are valid.
              </p>
            )}
          </ToolPanel>
        </div>
      </div>

      <ToolPanel title="Speed needed" className="mt-6">
        <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          The reverse question: what line rate moves the size above in a given time, with the same overhead.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="ttc-target" className={LABEL_CLASS}>
              Finish within
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="ttc-target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                inputMode="decimal"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={targetError !== null}
                aria-describedby={targetError ? "ttc-target-error" : "ttc-target-hint"}
                placeholder="30"
                data-testid="input-target-time"
                className={INPUT_CLASS}
              />
              <label htmlFor="ttc-target-unit" className="sr-only">
                Time unit
              </label>
              <select
                id="ttc-target-unit"
                value={targetUnit}
                onChange={(event) => setTargetUnit(event.target.value as DurationUnit)}
                data-testid="select-target-unit"
                className={SELECT_CLASS}
              >
                {DURATION_UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <FieldMessage
              id="ttc-target"
              error={targetError}
              hint={sizeOk ? `For ${size.trim()} ${sizeUnitId}, the size entered above.` : "Uses the data size entered above."}
            />
          </div>

          <div className="min-w-0">
            {reverse && pct !== null ? (
              <>
                <ToolResult label="Line rate needed" value={formatBitRate(reverse.line)} testId="text-required-rate" />
                <ToolResult label="Payload rate needed" value={formatBitRate(reverse.goodput)} />
                <ToolResult
                  label="Payload in bytes"
                  value={`${formatByteRateSI(reverse.goodput)} = ${formatByteRateIEC(reverse.goodput)}`}
                />
                <ToolResult label="Overhead assumed" value={`${formatSig(pct, 4)}%`} />
              </>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                Needs a valid size, overhead and time.
              </p>
            )}
          </div>
        </div>

        {presetRows.length && targetSeconds !== null ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-presets">
              <caption className="sr-only">How long each preset link takes for this size</caption>
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  {["Link", "Payload rate", "Time", `Within ${formatDuration(targetSeconds)}`].map((heading) => (
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
                {presetRows.map((row) => (
                  <tr key={row.preset.id} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                    <th
                      scope="row"
                      className="py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                    >
                      {row.preset.label}
                    </th>
                    <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                      {formatBitRate(row.goodput)}
                    </td>
                    <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                      {formatDuration(row.seconds)}
                    </td>
                    <td
                      className={`py-2.5 font-mono-tight text-sm ${
                        row.meets ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-amber))]"
                      }`}
                    >
                      {row.meets ? "yes" : "no"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ToolPanel>
    </ToolShell>
  );
}
