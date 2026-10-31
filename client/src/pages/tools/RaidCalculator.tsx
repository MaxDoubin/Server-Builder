/**
 * RAID calculator.
 *
 * The form's text is parsed into one list of disk sizes in bytes and handed
 * to calculate(), and every figure on the page (capacity in TB and TiB,
 * efficiency, fault tolerance, write penalty, throughput, the comparison of
 * all levels and the disk diagram) is read from that one result. The
 * arithmetic, the grouping of mixed sizes into sets and the layout sketch live
 * in lib/toolkit/raid-calculator so they can be unit tested without React.
 */

import { Fragment, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  LEVELS,
  MAX_DISKS,
  MAX_SKETCH_DISKS,
  UNITS,
  UNIT_BYTES,
  calculate,
  compareLevels,
  diskBars,
  formatMultiplier,
  formatPercent,
  formatScaled,
  formatTB,
  formatTiB,
  layoutSketch,
  levelInfo,
  parseSpans,
  resolveSizes,
  type Failure,
  type Field,
  type LevelId,
  type RaidResult,
  type SetPlan,
  type Unit,
} from "@/lib/toolkit/raid-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const TOGGLE_CLASS =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 py-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function times(value: number, upTo = false): string {
  return `${upTo ? "up to " : ""}${formatMultiplier(value)}×`;
}

/** What sets the sequential figure for this level, in a sentence. */
function perfNote(result: RaidResult): string {
  switch (result.level.id) {
    case "jbod":
      return "JBOD does not stripe, so one file stays on one disk. Independent workloads on different disks add up.";
    case "raid0":
      return "Every disk carries data, so reads and writes scale with the disk count.";
    case "raid1":
      return "Every disk holds the same data, so a write goes to all of them and gains nothing. Reads reach the higher figure only when requests are spread across the copies.";
    case "raid10":
      return "Each mirror pair writes the same data to both disks, so only half the disks add write throughput. Reads reach the higher figure only when requests are spread across both copies of each pair.";
    case "raid5":
      return "Sequential counts the disks that carry data, and parity takes one disk's worth.";
    case "raid6":
      return "Sequential counts the disks that carry data, and parity takes two disks' worth.";
    case "raid50":
      return "Sequential counts the disks that carry data, and parity takes one disk's worth in each span.";
    default:
      return "Sequential counts the disks that carry data, and parity takes two disks' worth in each span.";
  }
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      data-testid="text-raid-error"
      className="mt-2 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
    >
      <span aria-hidden="true">✕</span>
      <span className="min-w-0 break-words">{message}</span>
    </p>
  );
}

function setTitle(result: RaidResult, set: SetPlan): string {
  const k = set.sizes.length;
  switch (result.level.id) {
    case "jbod":
      return `${k} ${plural(k, "disk", "disks")}, each on its own`;
    case "raid0":
      return `Stripe of ${k} disks`;
    case "raid1":
      return `Mirror of ${k} disks`;
    case "raid10":
      return `Mirror pair ${set.index + 1}`;
    case "raid50":
      return `Span ${set.index + 1}, RAID 5 of ${k} disks`;
    case "raid60":
      return `Span ${set.index + 1}, RAID 6 of ${k} disks`;
    case "raid5":
      return `RAID 5 set of ${k} disks`;
    default:
      return `RAID 6 set of ${k} disks`;
  }
}

function Legend() {
  const swatch = "inline-block h-3 w-3 shrink-0 rounded-sm border border-[hsl(var(--brand-iron))]";
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={`${swatch} bg-[hsl(var(--brand-signal)/0.75)]`} />
        Data
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={`${swatch} bg-[hsl(var(--brand-amber)/0.75)]`} />
        Parity or mirror copy
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={`${swatch} bg-[hsl(var(--brand-iron))]`} />
        Unused, limited by a smaller disk
      </li>
    </ul>
  );
}

function Diagram({ result, unit }: { result: RaidResult; unit: Unit }) {
  const sets = useMemo(() => diskBars(result), [result]);
  const sketch = useMemo(
    () => layoutSketch(result.level.id, result.diskCount, result.perSet),
    [result],
  );
  const unitBytes = UNIT_BYTES[unit];
  let number = 0;

  return (
    <div data-testid="diagram-disks">
      <Legend />
      <div className="mt-4 flex flex-wrap gap-4">
        {sets.map(({ set, bars }) => (
          <div
            key={set.index}
            className="min-w-0 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3"
          >
            <div className="font-mono-tight text-xs text-[hsl(var(--brand-bone))]">{setTitle(result, set)}</div>
            <div className="mt-0.5 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
              {formatTB(set.usable)} TB usable
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {bars.map((bar, i) => {
                number += 1;
                const label = `${formatScaled(bar.size, unitBytes)} ${unit}`;
                const description = `Disk ${number}, ${label}: ${formatPercent(bar.dataPct / 100)} percent data, ${formatPercent(
                  bar.redundancyPct / 100,
                )} percent parity or mirror copy, ${formatPercent(bar.unusedPct / 100)} percent unused.`;
                return (
                  <div key={i} className="flex w-14 shrink-0 flex-col items-center gap-1">
                    <div
                      role="img"
                      aria-label={description}
                      className="flex h-24 w-9 flex-col justify-end overflow-hidden rounded-md border border-[hsl(var(--brand-iron))]"
                    >
                      <div className="flex w-full flex-col" style={{ height: `${bar.heightPct}%` }}>
                        <div className="w-full bg-[hsl(var(--brand-iron))]" style={{ height: `${bar.unusedPct}%` }} />
                        <div
                          className="w-full bg-[hsl(var(--brand-amber)/0.75)]"
                          style={{ height: `${bar.redundancyPct}%` }}
                        />
                        <div
                          className="w-full bg-[hsl(var(--brand-signal)/0.75)]"
                          style={{ height: `${bar.dataPct}%` }}
                        />
                      </div>
                    </div>
                    <span className="font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">#{number}</span>
                    <span className="max-w-full break-words text-center font-mono-tight text-[0.625rem] leading-tight text-[hsl(var(--brand-bone-dim))]">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
        Bar height is disk size. Disks are numbered largest first, which is also how they are grouped.
        {result.level.id === "raid5" || result.level.id === "raid6" || result.level.id === "raid50" || result.level.id === "raid60"
          ? " In a parity layout the parity is spread over every disk, so each bar shows an equal share of it."
          : ""}
      </p>

      {sketch ? (
        <div className="mt-6">
          <div className={LABEL_CLASS}>Layout of the first stripes</div>
          <div className="mt-2 overflow-x-auto">
            <table className="border-separate border-spacing-1" data-testid="table-layout">
              <thead>
                <tr>
                  {sketch.rows[0].map((_, c) => (
                    <th
                      key={c}
                      scope="col"
                      className="px-2 font-mono-tight text-[0.625rem] font-normal text-[hsl(var(--brand-ash))]"
                    >
                      Disk {c + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sketch.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={`min-w-[3rem] rounded-md border px-2 py-1.5 text-center font-mono-tight text-xs ${
                          cell === "P" || cell === "Q"
                            ? "border-[hsl(var(--brand-amber)/0.55)] bg-[hsl(var(--brand-amber)/0.1)] text-[hsl(var(--brand-amber))]"
                            : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))]"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            {sketch.caption} This is one common layout, as in Linux md. Other implementations rotate parity differently,
            and the capacity and fault tolerance are the same.
          </p>
        </div>
      ) : result.diskCount > MAX_SKETCH_DISKS && result.level.id !== "jbod" ? (
        <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          The stripe layout is drawn for sets of up to {MAX_SKETCH_DISKS} disks.
        </p>
      ) : null}
    </div>
  );
}

export function RaidCalculator() {
  const [levelId, setLevelId] = useState<LevelId>("raid6");
  const [spansText, setSpansText] = useState("2");
  const [mode, setMode] = useState<"same" | "mixed">("same");
  const [count, setCount] = useState("8");
  const [size, setSize] = useState("8");
  const [mixed, setMixed] = useState("4x2, 8x6");
  const [unit, setUnit] = useState<Unit>("TB");

  const level = levelInfo(levelId);

  const outcome = useMemo((): { error: Failure | null; result: RaidResult | null; sizes: bigint[] | null; spans: number } => {
    const sizes = resolveSizes({ mode, count, size, mixed, unit });
    const spansParsed = level.usesSpans ? parseSpans(spansText) : { ok: true as const, spans: 2 };
    const spans = spansParsed.ok ? spansParsed.spans : 2;
    if (!sizes.ok) return { error: sizes, result: null, sizes: null, spans };
    if (!spansParsed.ok) return { error: spansParsed, result: null, sizes: sizes.sizes, spans };
    const result = calculate(levelId, sizes.sizes, spans);
    if (!result.ok) return { error: result, result: null, sizes: sizes.sizes, spans };
    return { error: null, result, sizes: sizes.sizes, spans };
  }, [levelId, spansText, mode, count, size, mixed, unit, level.usesSpans]);

  const { error, result } = outcome;
  const comparison = useMemo(() => (outcome.sizes ? compareLevels(outcome.sizes, outcome.spans) : []), [outcome]);

  // In list mode there is no separate count or size box, so those errors belong under the list.
  const shown: Field | null = error ? (mode === "mixed" && (error.field === "count" || error.field === "size") ? "mixed" : error.field) : null;
  const messageFor = (field: Field): string | null => (error && shown === field ? error.message : null);

  const summary = result
    ? [
        `${result.level.label}${level.usesSpans ? ` in ${result.setCount} spans` : ""}, ${result.diskCount} ${plural(result.diskCount, "disk", "disks")}`,
        `Raw capacity       ${formatTB(result.raw)} TB (${formatTiB(result.raw)} TiB)`,
        `Usable capacity    ${formatTB(result.usable)} TB (${formatTiB(result.usable)} TiB)`,
        `Efficiency         ${formatPercent(result.efficiency)}%`,
        `Disks that can fail  worst case ${result.tolerance.worst}, best case ${result.tolerance.best}`,
        `Write penalty      ${result.penalty}`,
        `Sequential read    ${times(result.perf.seqRead, result.perf.readIsUpperBound)}`,
        `Sequential write   ${times(result.perf.seqWrite)}`,
        `Random read        ${times(result.perf.rndRead)}`,
        `Random write       ${times(result.perf.rndWrite)}`,
      ].join("\n")
    : "";

  return (
    <ToolShell slug="raid-calculator">
      <div className="space-y-6">
        <ToolPanel title="Array">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="raid-level" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                RAID level
              </label>
              <select
                id="raid-level"
                value={levelId}
                onChange={(event) => setLevelId(event.target.value as LevelId)}
                data-testid="select-level"
                className={INPUT_CLASS}
              >
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {level.layout} Needs at least {level.minDisks} {plural(level.minDisks, "disk", "disks")}
                {level.usesSpans ? ` (2 spans of ${level.minPerSet})` : ""}.
              </p>
            </div>

            <div>
              <label htmlFor="raid-unit" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Unit for disk sizes
              </label>
              <select
                id="raid-unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value as Unit)}
                data-testid="select-unit"
                className={INPUT_CLASS}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                    {u === "GB" || u === "TB" ? " (decimal, as drives are sold)" : " (binary, as many systems report)"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5">
            <div className={LABEL_CLASS} id="raid-mode-label">
              Disk sizes
            </div>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="raid-mode-label">
              {(
                [
                  { id: "same", label: "All the same size" },
                  { id: "mixed", label: "Mixed sizes" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mode === option.id}
                  onClick={() => setMode(option.id)}
                  data-testid={`button-mode-${option.id}`}
                  className={`${TOGGLE_CLASS} ${
                    mode === option.id
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "same" ? (
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="raid-count" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                  Number of disks
                </label>
                <input
                  id="raid-count"
                  type="text"
                  inputMode="numeric"
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={shown === "count"}
                  aria-describedby={shown === "count" ? "raid-count-error" : undefined}
                  placeholder="8"
                  data-testid="input-disk-count"
                  className={INPUT_CLASS}
                />
                <FieldError id="raid-count-error" message={messageFor("count")} />
              </div>
              <div>
                <label htmlFor="raid-size" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                  Size of each disk, in {unit}
                </label>
                <input
                  id="raid-size"
                  type="text"
                  inputMode="decimal"
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={shown === "size"}
                  aria-describedby={shown === "size" ? "raid-size-error" : undefined}
                  placeholder="8"
                  data-testid="input-disk-size"
                  className={INPUT_CLASS}
                />
                <FieldError id="raid-size-error" message={messageFor("size")} />
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <label htmlFor="raid-mixed" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Disk sizes in {unit}, separated by commas or spaces
              </label>
              <input
                id="raid-mixed"
                type="text"
                value={mixed}
                onChange={(event) => setMixed(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={shown === "mixed"}
                aria-describedby={shown === "mixed" ? "raid-mixed-error" : "raid-mixed-hint"}
                placeholder="4x2, 8x6"
                data-testid="input-disk-sizes"
                className={INPUT_CLASS}
              />
              <FieldError id="raid-mixed-error" message={messageFor("mixed")} />
              {shown === "mixed" ? null : (
                <p id="raid-mixed-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  List each disk, or use size x count: <code className="text-[hsl(var(--brand-cyan))]">4, 4, 8, 8</code> and{" "}
                  <code className="text-[hsl(var(--brand-cyan))]">4x2, 8x2</code> are the same four disks. Up to {MAX_DISKS} disks.
                  Disks are grouped largest first, and each set is limited by its smallest disk.
                </p>
              )}
            </div>
          )}

          {level.usesSpans ? (
            <div className="mt-5 sm:max-w-[240px]">
              <label htmlFor="raid-spans" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                Number of spans
              </label>
              <input
                id="raid-spans"
                type="text"
                inputMode="numeric"
                value={spansText}
                onChange={(event) => setSpansText(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={shown === "spans"}
                aria-describedby={shown === "spans" ? "raid-spans-error" : undefined}
                placeholder="2"
                data-testid="input-spans"
                className={INPUT_CLASS}
              />
              <FieldError id="raid-spans-error" message={messageFor("spans")} />
            </div>
          ) : null}
        </ToolPanel>

        {result ? (
          <div className="space-y-6" data-testid="output-raid">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ToolPanel title="Capacity">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <span className="font-display text-3xl font-medium text-[hsl(var(--brand-bone))]" data-testid="text-usable-tb">
                    {formatTB(result.usable)} TB
                  </span>
                  <span className="font-mono-tight text-lg text-[hsl(var(--brand-bone-dim))]" data-testid="text-usable-tib">
                    {formatTiB(result.usable)} TiB
                  </span>
                </div>
                <p className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                  Usable. TB is 10^12 bytes, as drives are sold. TiB is 2^40 bytes, as many systems report.
                </p>
                <div className="mt-4">
                  <ToolResult
                    label="Raw capacity"
                    value={`${formatTB(result.raw)} TB · ${formatTiB(result.raw)} TiB`}
                    testId="text-raw"
                  />
                  <ToolResult label="Efficiency" value={`${formatPercent(result.efficiency)}%`} testId="text-efficiency" />
                  {result.redundancy > 0n ? (
                    <ToolResult
                      label={result.level.id === "raid1" || result.level.id === "raid10" ? "Spent on mirror copies" : "Spent on parity"}
                      value={`${formatTB(result.redundancy)} TB`}
                      testId="text-redundancy"
                    />
                  ) : null}
                  {result.mismatchWaste > 0n ? (
                    <ToolResult
                      label="Unused on larger disks"
                      value={`${formatTB(result.mismatchWaste)} TB`}
                      testId="text-waste"
                    />
                  ) : null}
                  <ToolResult label="Disks" value={`${result.diskCount}`} />
                </div>
                {result.mismatchWaste > 0n ? (
                  <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    Every disk in a set counts only as much as the smallest disk in that set, so the extra space on larger
                    disks is not used.
                  </p>
                ) : null}
                {result.strictStripeUsable !== null ? (
                  <p
                    className="mt-3 break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                    data-testid="text-strict-stripe"
                  >
                    The sets are not the same size. This adds them up, as software that stripes across sets by free
                    space does. A controller that stripes strictly across sets gives every set the capacity of the
                    smallest one, which would leave {formatTB(result.strictStripeUsable)} TB (
                    {formatTiB(result.strictStripeUsable)} TiB).
                  </p>
                ) : null}
              </ToolPanel>

              <ToolPanel title="Failures and writes">
                {result.tolerance.worst === result.tolerance.best ? (
                  <ToolResult
                    label="Disks that can fail"
                    value={`${result.tolerance.worst}`}
                    testId="text-tolerance"
                  />
                ) : (
                  <>
                    <ToolResult
                      label="Worst case"
                      value={`${result.tolerance.worst} ${plural(result.tolerance.worst, "disk", "disks")}`}
                      testId="text-tolerance-worst"
                    />
                    <ToolResult
                      label="Best case"
                      value={`${result.tolerance.best} ${plural(result.tolerance.best, "disk", "disks")}`}
                      testId="text-tolerance-best"
                    />
                  </>
                )}
                {result.secondFailureFatal !== null ? (
                  <ToolResult
                    label="After one failure, a second is fatal"
                    value={`${formatPercent(result.secondFailureFatal)}% of the time`}
                    testId="text-second-failure"
                  />
                ) : null}
                <ToolResult label="Write penalty" value={`${result.penalty}`} testId="text-penalty" />
                <ToolResult
                  label="Minimum disks"
                  value={`${result.minDisks}${result.level.usesSpans ? ` (2 spans of ${result.level.minPerSet})` : ""}`}
                  testId="text-min-disks"
                />
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {result.penaltyDetail}
                </p>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {result.tolerance.worst === result.tolerance.best
                    ? "This is the number of disks that can be down at once with the data intact."
                    : result.level.id === "raid10"
                      ? "Worst case is the number of failures survived wherever they land: one, because a second hit on the same mirror pair loses data. Best case is one failure in each pair."
                      : "Worst case is the number of failures survived wherever they land. Best case is the most it can survive if every failure lands in a different span."}{" "}
                  A failed disk starts a rebuild, and a disk lost during it counts against these figures.
                </p>
              </ToolPanel>
            </div>

            <ToolPanel title="Performance, relative to one disk">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] border-collapse text-left" data-testid="table-performance">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        <span className="sr-only">Direction</span>
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Sequential
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Random
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                      <th scope="row" className="py-2.5 pr-4 font-mono-tight text-xs font-normal uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))]">
                        Read
                      </th>
                      <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]" data-testid="text-perf-seq-read">
                        {times(result.perf.seqRead, result.perf.readIsUpperBound)}
                      </td>
                      <td className="py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))]" data-testid="text-perf-rnd-read">
                        {times(result.perf.rndRead)}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="py-2.5 pr-4 font-mono-tight text-xs font-normal uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))]">
                        Write
                      </th>
                      <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]" data-testid="text-perf-seq-write">
                        {times(result.perf.seqWrite)}
                      </td>
                      <td className="py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))]" data-testid="text-perf-rnd-write">
                        {times(result.perf.rndWrite)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Ideal figures for identical disks, ignoring the controller and the bus. Random write is the number of
                disks divided by the write penalty of {result.penalty}. {perfNote(result)}
              </p>
            </ToolPanel>

            <ToolPanel title="Disk diagram">
              <Diagram result={result} unit={unit} />
            </ToolPanel>

            <ToolPanel title="Every level with these disks">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-levels">
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Level
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Usable TB
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Usable TiB
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Efficiency
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Can fail
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Write penalty
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((row) => {
                      const current = row.level.id === levelId;
                      const rowClass = `border-b border-[hsl(var(--brand-iron)/0.5)] ${
                        current ? "bg-[hsl(var(--brand-signal)/0.08)]" : ""
                      }`;
                      return (
                        <tr key={row.level.id} className={rowClass} aria-current={current ? "true" : undefined} data-testid={`row-level-${row.level.id}`}>
                          <th scope="row" className="py-2.5 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                            {row.level.label}
                          </th>
                          {row.result ? (
                            <Fragment>
                              <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                                {formatTB(row.result.usable)}
                              </td>
                              <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                                {formatTiB(row.result.usable)}
                              </td>
                              <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                                {formatPercent(row.result.efficiency)}%
                              </td>
                              <td className="py-2.5 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                                {row.result.tolerance.worst === row.result.tolerance.best
                                  ? row.result.tolerance.worst
                                  : `${row.result.tolerance.worst} to ${row.result.tolerance.best}`}
                              </td>
                              <td className="py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                                {row.result.penalty}
                              </td>
                            </Fragment>
                          ) : (
                            <td colSpan={5} className="py-2.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                              Not possible: {row.reason}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                RAID 50 and RAID 60 use 2 spans here unless one of them is selected, in which case they use the span
                count you entered.
              </p>
            </ToolPanel>

            <div className="flex flex-wrap items-start gap-3">
              <CopyButton value={summary} label="Copy summary" testId="button-copy-summary">
                <span>Copy summary</span>
              </CopyButton>
            </div>
          </div>
        ) : null}
      </div>
    </ToolShell>
  );
}
