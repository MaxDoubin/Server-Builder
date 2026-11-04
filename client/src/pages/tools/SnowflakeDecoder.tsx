/**
 * Snowflake ID decoder.
 *
 * Paste one ID, a list, or links and mentions that contain them, and every
 * ID is decoded into its creation time and machine fields. More than one ID
 * becomes a timeline sorted by creation time, with the gap between
 * neighbors. The reverse panel turns a date into the smallest and largest ID
 * that could have been minted then, which is what a range search needs.
 *
 * The bit arithmetic lives in lib/toolkit/snowflake-decoder, on BigInt
 * throughout, so it can be tested without a browser.
 */

import { useMemo, useState } from "react";
import { pluralise } from "@/lib/plural";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";
import {
  MAX_BATCH,
  PLATFORMS,
  batchCsv,
  bitFields,
  decodeBatch,
  formatDelta,
  formatLocal,
  formatUtc,
  idRange,
  parseEpoch,
  parseInstant,
  platformEpoch,
  relativeTime,
  reviewDecoded,
  type BatchRow,
  type BitField,
  type PlatformId,
  type Result,
  type Tone,
} from "@/lib/toolkit/snowflake-decoder";

/* ----------------------------------------------------------------- styles */

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ERROR_BOX =
  "rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const TH =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

const pillClass = (on: boolean) =>
  `inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
    on
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
  }`;

const TONE_STYLE: Record<Tone, string> = {
  info: "border-[hsl(var(--brand-cyan)/0.45)] bg-[hsl(var(--brand-cyan)/0.07)] text-[hsl(var(--brand-cyan))]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]",
};

const FIELD_STYLE: Record<BitField["key"], string> = {
  sign: "text-[hsl(var(--brand-ash))]",
  time: "text-[hsl(var(--brand-signal))]",
  a: "text-[hsl(var(--brand-cyan))]",
  b: "text-[hsl(var(--brand-amber))]",
  seq: "text-[hsl(var(--brand-bone))]",
};

/* --------------------------------------------------------------- examples */

/*
  Synthetic IDs, built from a chosen time and machine fields so they decode
  to round, checkable values. The Discord one is the worked example from
  Discord's own developer documentation, and 20 is a real pre-Snowflake
  post ID, there to show what a sequential counter looks like.
*/
const EXAMPLES: { label: string; platform: PlatformId; text: string }[] = [
  { label: "X ID", platform: "x", text: "1768293366511185921" },
  {
    label: "X timeline",
    platform: "x",
    text: "1768293770611404804\n1768293366511185921\nhttps://x.com/i/status/1768293368889024512\n1741610183681150988",
  },
  { label: "Pre-Snowflake", platform: "x", text: "20" },
  { label: "Discord docs", platform: "discord", text: "175928847299117063" },
  {
    label: "Discord link",
    platform: "discord",
    text: "https://discord.com/channels/309037367812030464/613571166430302211/1249460793393811473",
  },
];

const PLATFORM_ORDER: PlatformId[] = ["x", "discord", "custom"];

const MAX_ERRORS_SHOWN = 20;

function hex64(id: bigint): string {
  return `0x${id.toString(16).padStart(16, "0")}`;
}

/** Unix seconds with the millisecond fraction, which a snowflake always has. */
function unixSeconds(ms: number): string {
  return `${Math.floor(ms / 1000)}.${String(ms % 1000).padStart(3, "0")}`;
}

/* ------------------------------------------------------------------- view */

function BitLayout({ row, idBits, platform }: { row: BatchRow; idBits: 63 | 64; platform: PlatformId }) {
  const fields = bitFields(row.decoded.id, idBits);
  const meta = PLATFORMS[platform];
  const names: Record<BitField["key"], string> = {
    sign: "Sign bit (unused)",
    time: "Timestamp, ms since epoch",
    a: meta.fieldA,
    b: meta.fieldB,
    seq: meta.sequence,
  };
  return (
    <ToolPanel title="Bit layout">
      <p className="break-all font-mono-tight text-sm leading-relaxed" data-testid="text-snowflake-bits">
        {fields.map((f, i) => (
          <span key={f.key}>
            {i > 0 ? <span className="text-[hsl(var(--brand-iron))]"> </span> : null}
            <span className={FIELD_STYLE[f.key]}>{f.bits}</span>
          </span>
        ))}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              <th scope="col" className={TH}>
                Field
              </th>
              <th scope="col" className={TH}>
                Bits
              </th>
              <th scope="col" className={TH}>
                Width
              </th>
              <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                <th scope="row" className={`py-2 pr-4 font-mono-tight text-xs font-normal ${FIELD_STYLE[f.key]}`}>
                  {names[f.key]}
                </th>
                <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {f.high === f.low ? f.high : `${f.high} to ${f.low}`}
                </td>
                <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {f.bits.length}
                </td>
                <td className="py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                  {BigInt(`0b${f.bits}`).toString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        The value is the timestamp shifted left by 22 bits, plus the machine bits shifted left by
        12, plus the sequence. Decoding is the reverse: shift right by 22 for the time, then mask
        out the low fields.
      </p>
    </ToolPanel>
  );
}

export function SnowflakeDecoder() {
  const [platform, setPlatform] = useState<PlatformId>("x");
  const [customEpoch, setCustomEpoch] = useState("0");
  const [raw, setRaw] = useState(EXAMPLES[0].text);
  const [selected, setSelected] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());

  const [fromText, setFromText] = useState("2024-01-01T00:00:00Z");
  const [toText, setToText] = useState("2024-01-01T23:59:59.999Z");
  const [zone, setZone] = useState<"utc" | "local">("utc");

  const meta = PLATFORMS[platform];
  const epoch: Result<number> = useMemo(() => {
    if (platform !== "custom") return { ok: true, value: platformEpoch(platform, 0) };
    return parseEpoch(customEpoch);
  }, [platform, customEpoch]);

  const outcome = useMemo(
    () => (epoch.ok ? decodeBatch(raw, meta.idBits, epoch.value) : null),
    [raw, meta.idBits, epoch],
  );

  const rows = outcome?.kind === "ok" ? outcome.rows : [];
  const errors = outcome?.kind === "ok" ? outcome.errors : [];
  const current = rows.find((r) => r.decoded.id.toString() === selected) ?? rows[0] ?? null;
  const findings = useMemo(
    () => (current ? reviewDecoded(current.decoded, platform, nowMs) : []),
    [current, platform, nowMs],
  );
  const csv = useMemo(() => (rows.length > 1 ? batchCsv(rows, meta) : ""), [rows, meta]);

  const range = useMemo(() => {
    if (!epoch.ok) return null;
    const from = parseInstant(fromText, zone);
    if (!from.ok) return { ok: false as const, error: `Start: ${from.error}` };
    let toMs = from.value;
    if (toText.trim() !== "") {
      const to = parseInstant(toText, zone);
      if (!to.ok) return { ok: false as const, error: `End: ${to.error}` };
      toMs = to.value;
    }
    const r = idRange(from.value, toMs, epoch.value, meta.idBits);
    if (!r.ok) return r;
    return { ok: true as const, value: { ...r.value, fromMs: from.value, toMs } };
  }, [fromText, toText, zone, epoch, meta.idBits]);

  const ceiling = (1n << BigInt(meta.idBits)) - 1n;

  let summary: string;
  if (!epoch.ok) summary = "Set an epoch to decode.";
  else if (!outcome || outcome.kind === "empty") summary = "Paste an ID to decode it.";
  else if (outcome.kind === "error") summary = "Nothing decoded.";
  else if (rows.length === 0) summary = "No valid IDs found.";
  else if (rows.length === 1) summary = `Decoded 1 ID against the ${meta.label} epoch.`;
  else summary = `Decoded ${rows.length} ${pluralise(rows.length, "ID")}, sorted by creation time.`;

  const localZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
    } catch {
      return "local time";
    }
  }, []);

  return (
    <ToolShell slug="snowflake-decoder">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <ToolPanel title="IDs">
            <div role="group" aria-label="Platform" className="flex flex-wrap gap-2">
              {PLATFORM_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlatform(id)}
                  aria-pressed={platform === id}
                  data-testid={`button-platform-${id}`}
                  className={pillClass(platform === id)}
                >
                  {PLATFORMS[id].label}
                </button>
              ))}
            </div>

            {platform === "custom" ? (
              <div className="mt-5">
                <label htmlFor="snowflake-epoch" className={LABEL}>
                  Epoch
                </label>
                <input
                  id="snowflake-epoch"
                  value={customEpoch}
                  onChange={(e) => setCustomEpoch(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={!epoch.ok}
                  aria-describedby="snowflake-epoch-hint"
                  placeholder="1288834974657 or 2010-11-04T01:42:54.657Z"
                  data-testid="input-epoch"
                  className={FIELD}
                />
                <p
                  id="snowflake-epoch-hint"
                  role={epoch.ok ? undefined : "alert"}
                  className={`mt-2 font-mono-tight text-xs leading-relaxed ${
                    epoch.ok ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-danger))]"
                  }`}
                >
                  {epoch.ok
                    ? `Unix milliseconds or a UTC date. Reads as ${formatUtc(epoch.value)}. The layout is Twitter's: 22 low bits of machine and sequence.`
                    : epoch.error}
                </p>
              </div>
            ) : (
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Epoch {formatUtc(platformEpoch(platform, 0))} ({platformEpoch(platform, 0)} ms).
              </p>
            )}

            <label htmlFor="snowflake-input" className={`mt-5 block ${LABEL}`}>
              IDs, links or mentions
            </label>
            <textarea
              id="snowflake-input"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={5}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={outcome?.kind === "error"}
              aria-describedby={outcome?.kind === "error" ? "snowflake-error" : "snowflake-hint"}
              placeholder={"1768293366511185921\nhttps://discord.com/channels/.../.../...\n<@80351110224678912>"}
              data-testid="input-snowflake"
              className={`${FIELD} resize-y break-all text-xs leading-relaxed`}
            />
            {outcome?.kind === "error" ? (
              <p id="snowflake-error" role="alert" data-testid="text-snowflake-error" className={`mt-3 ${ERROR_BOX}`}>
                {outcome.message}
              </p>
            ) : (
              <p id="snowflake-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                One per line, or separated by spaces or commas. Links contribute every numeric path
                segment, so a Discord message link gives its server, channel and message. Up to{" "}
                {MAX_BATCH.toLocaleString("en-US")} IDs.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    setPlatform(ex.platform);
                    setRaw(ex.text);
                    setSelected(null);
                  }}
                  data-testid={`button-example-${ex.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={CHIP}
                >
                  {ex.label}
                </button>
              ))}
              {raw ? (
                <button
                  type="button"
                  onClick={() => {
                    setRaw("");
                    setSelected(null);
                  }}
                  data-testid="button-clear"
                  className={CHIP}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {errors.length > 0 ? (
              <div className="mt-5">
                <h3 className={LABEL}>
                  {errors.length} {pluralise(errors.length, "entry", "entries")} skipped
                </h3>
                <ul className="mt-2 space-y-2" data-testid="list-snowflake-errors">
                  {errors.slice(0, MAX_ERRORS_SHOWN).map((err, i) => (
                    <li key={i} className={`break-words ${ERROR_BOX}`}>
                      <code className="break-all">{err.source}</code> {err.error}
                    </li>
                  ))}
                </ul>
                {errors.length > MAX_ERRORS_SHOWN ? (
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    And {errors.length - MAX_ERRORS_SHOWN} more.
                  </p>
                ) : null}
              </div>
            ) : null}
            {outcome?.kind === "ok" && outcome.truncated > 0 ? (
              <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                Only the first {MAX_BATCH.toLocaleString("en-US")} entries were read.{" "}
                {outcome.truncated.toLocaleString("en-US")} more were skipped.
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Decoded">
            <p
              role="status"
              aria-live="polite"
              data-testid="text-summary"
              className="mb-3 font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
            >
              {summary}
            </p>
            {current ? (
              <div data-testid="output-snowflake">
                <ToolResult
                  label="ID"
                  value={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {current.decoded.id.toString()}
                      <CopyButton value={current.decoded.id.toString()} label="Copy the ID" />
                    </span>
                  }
                  testId="text-snowflake-id"
                />
                <ToolResult label="UTC" value={formatUtc(current.decoded.unixMs)} testId="text-snowflake-utc" />
                <ToolResult label="Local" value={formatLocal(current.decoded.unixMs)} testId="text-snowflake-local" />
                <ToolResult label="Relative" value={relativeTime(current.decoded.unixMs, nowMs)} />
                <ToolResult label="Unix ms" value={String(current.decoded.unixMs)} />
                <ToolResult label="Unix seconds" value={unixSeconds(current.decoded.unixMs)} />
                <ToolResult label="Since epoch" value={`${current.decoded.offsetMs} ms`} />
                <ToolResult label={meta.fieldA} value={current.decoded.fieldA} testId="text-snowflake-field-a" />
                <ToolResult label={meta.fieldB} value={current.decoded.fieldB} testId="text-snowflake-field-b" />
                <ToolResult label="Machine ID (10 bits)" value={current.decoded.machine} />
                <ToolResult label={meta.sequence} value={current.decoded.sequence} testId="text-snowflake-sequence" />
                <ToolResult label="Hex" value={hex64(current.decoded.id)} />
                {current.source !== current.decoded.id.toString() ? (
                  <ToolResult label="Found in" value={current.source} />
                ) : null}
              </div>
            ) : null}
            {findings.length > 0 ? (
              <ul className="mt-4 space-y-2" data-testid="list-snowflake-findings">
                {findings.map((f) => (
                  <li key={f.text} className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${TONE_STYLE[f.tone]}`}>
                    {f.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </ToolPanel>
        </div>

        {rows.length > 1 ? (
          <ToolPanel title="Timeline">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left" data-testid="table-snowflake-batch">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH}>
                      #
                    </th>
                    <th scope="col" className={TH}>
                      ID
                    </th>
                    <th scope="col" className={TH}>
                      Created (UTC)
                    </th>
                    <th scope="col" className={TH}>
                      Gap
                    </th>
                    <th scope="col" className={TH}>
                      <abbr title={meta.fieldA} className="no-underline">
                        A
                      </abbr>
                    </th>
                    <th scope="col" className={TH}>
                      <abbr title={meta.fieldB} className="no-underline">
                        B
                      </abbr>
                    </th>
                    <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      Seq
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const idText = row.decoded.id.toString();
                    const isCurrent = current === row;
                    return (
                      <tr
                        key={`${idText}-${i}`}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${
                          isCurrent ? "bg-[hsl(var(--brand-signal)/0.07)]" : ""
                        }`}
                      >
                        <td className="py-1 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{i + 1}</td>
                        <td className="py-1 pr-4">
                          <button
                            type="button"
                            onClick={() => setSelected(idText)}
                            aria-pressed={isCurrent}
                            aria-label={`Show details for ${idText}`}
                            className={`min-h-[44px] rounded px-1 text-left font-mono-tight text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                              isCurrent
                                ? "text-[hsl(var(--brand-signal))]"
                                : "text-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-signal))]"
                            }`}
                          >
                            {idText}
                          </button>
                          {row.duplicate ? (
                            <span className="ml-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-amber))]">
                              duplicate
                            </span>
                          ) : null}
                        </td>
                        <td className="py-1 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {formatUtc(row.decoded.unixMs)}
                        </td>
                        <td className="py-1 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          {row.deltaMs === null ? "first" : formatDelta(row.deltaMs)}
                        </td>
                        <td className="py-1 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">{row.decoded.fieldA}</td>
                        <td className="py-1 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">{row.decoded.fieldB}</td>
                        <td className="py-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{row.decoded.sequence}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                A is {meta.fieldA.toLowerCase()}, B is {meta.fieldB.toLowerCase()}. Select an ID for its
                full breakdown.
              </p>
              <CopyButton value={csv} label="Copy the timeline as CSV" testId="button-copy-csv" />
            </div>
          </ToolPanel>
        ) : null}

        {current ? <BitLayout row={current} idBits={meta.idBits} platform={platform} /> : null}

        <ToolPanel title="ID from a date">
          <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            The smallest and largest {meta.label} IDs that could have been minted between two instants,
            for searching a time range by ID. Leave the end empty for a single millisecond.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="snowflake-from" className={LABEL}>
                Start
              </label>
              <input
                id="snowflake-from"
                value={fromText}
                onChange={(e) => setFromText(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="2024-01-01T00:00:00Z"
                data-testid="input-range-from"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="snowflake-to" className={LABEL}>
                End (optional)
              </label>
              <input
                id="snowflake-to"
                value={toText}
                onChange={(e) => setToText(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="2024-01-01T23:59:59.999Z"
                data-testid="input-range-to"
                className={FIELD}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              No offset means
            </span>
            <div role="group" aria-label="Time zone for dates without an offset" className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setZone("utc")} aria-pressed={zone === "utc"} data-testid="button-zone-utc" className={pillClass(zone === "utc")}>
                UTC
              </button>
              <button type="button" onClick={() => setZone("local")} aria-pressed={zone === "local"} data-testid="button-zone-local" className={`${pillClass(zone === "local")} max-w-full break-all text-left`}>
                {localZone}
              </button>
            </div>
          </div>

          <div className="mt-5" data-testid="output-snowflake-range">
            {range === null ? (
              <p className={ERROR_BOX}>Set a valid epoch first.</p>
            ) : !range.ok ? (
              <p role="alert" data-testid="text-range-error" className={ERROR_BOX}>
                {range.error}
              </p>
            ) : (
              <>
                <ToolResult label="Start (UTC)" value={formatUtc(range.value.fromMs)} />
                <ToolResult label="End (UTC)" value={formatUtc(range.value.toMs)} />
                <ToolResult
                  label="Smallest ID"
                  testId="text-range-min"
                  value={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {range.value.min.toString()}
                      <CopyButton value={range.value.min.toString()} label="Copy the smallest ID" />
                    </span>
                  }
                />
                <ToolResult
                  label="Largest ID"
                  testId="text-range-max"
                  value={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {range.value.max.toString()}
                      <CopyButton value={range.value.max.toString()} label="Copy the largest ID" />
                    </span>
                  }
                />
                <ToolResult
                  label={platform === "x" ? "since_id (exclusive)" : platform === "discord" ? "after (exclusive)" : "Exclusive lower bound"}
                  value={range.value.min > 0n ? (range.value.min - 1n).toString() : "none needed, the range starts at 0"}
                />
                <ToolResult
                  label={platform === "x" ? "until_id (exclusive)" : platform === "discord" ? "before (exclusive)" : "Exclusive upper bound"}
                  value={range.value.max < ceiling ? (range.value.max + 1n).toString() : "none, this is the largest ID the layout allows"}
                />
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {platform === "x"
                    ? "The X API v2 search endpoints take since_id and until_id, and both exclude the ID given, so the bounds sit one outside the range."
                    : platform === "discord"
                      ? "Discord's channel message endpoint pages with after or before (one at a time), and both exclude the ID given, so the bounds sit one outside the range."
                      : "Most APIs that page by ID exclude the ID given, so the bounds sit one outside the range."}
                </p>
              </>
            )}
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
