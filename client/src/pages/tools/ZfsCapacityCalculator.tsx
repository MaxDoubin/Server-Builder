/**
 * ZFS pool capacity calculator.
 *
 * Inputs are held as the strings the reader typed and parsed on every
 * render, so a half-typed value shows a precise message instead of
 * snapping to a number. All of the arithmetic, including the transcription
 * of vdev_raidz_asize() and spa_get_slop_space(), lives in
 * lib/toolkit/zfs-capacity-calculator so it can be tested without React.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  ACCOUNTING_BLOCK,
  ASHIFTS,
  DEFAULT_ASHIFT,
  DEFAULT_RECORDSIZE,
  FILL_LINE,
  LAYOUTS,
  type Layout,
  MAX_SLOP,
  MAX_VDEVS,
  MIN_SLOP,
  RECORDSIZES,
  SIZE_UNITS,
  type SizeUnit,
  blockAlloc,
  formatBinarySize,
  formatIEC,
  formatPercent,
  formatSI,
  isRaidz,
  layoutInfo,
  layoutWarnings,
  parseCount,
  parseDiskSize,
  parseDisksPerVdev,
  poolCapacity,
  zfsNicenum,
} from "@/lib/toolkit/zfs-capacity-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "min-h-[44px] w-full min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";
const SELECT_CLASS =
  "min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON_CLASS =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF_CLASS =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const SMALL_CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";

/* ---------------------------------------------------------------- examples */

interface Example {
  id: string;
  label: string;
  layout: Layout;
  vdevs: string;
  disks: string;
  size: string;
  unit: SizeUnit;
}

const EXAMPLES: Example[] = [
  { id: "raidz2-6", label: "6 x 12 TB RAIDZ2", layout: "raidz2", vdevs: "1", disks: "6", size: "12", unit: "TB" },
  { id: "mirrors", label: "Two mirrored pairs", layout: "mirror", vdevs: "2", disks: "2", size: "4", unit: "TB" },
  { id: "raidz2-wide", label: "3 x 10-wide RAIDZ2", layout: "raidz2", vdevs: "3", disks: "10", size: "20", unit: "TB" },
  { id: "raidz1-4", label: "4 x 8 TB RAIDZ1", layout: "raidz1", vdevs: "1", disks: "4", size: "8", unit: "TB" },
  { id: "raidz3-11", label: "11-wide RAIDZ3", layout: "raidz3", vdevs: "1", disks: "11", size: "18", unit: "TB" },
];

/** Diagram limits, so a 1000-vdev pool does not draw 255,000 squares. */
const DRAW_VDEVS = 12;
const DRAW_DISKS = 24;

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

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const count = (n: number) => n.toLocaleString("en-US");

/* --------------------------------------------------------------- component */

export function ZfsCapacityCalculator() {
  const [layout, setLayout] = useState<Layout>("raidz2");
  const [vdevsText, setVdevsText] = useState("1");
  const [disksText, setDisksText] = useState("6");
  const [sizeText, setSizeText] = useState("12");
  const [unit, setUnit] = useState<SizeUnit>("TB");
  const [ashift, setAshift] = useState<number>(DEFAULT_ASHIFT);
  const [recordsize, setRecordsize] = useState<number>(DEFAULT_RECORDSIZE);

  const info = layoutInfo(layout);
  const vdevsParsed = useMemo(() => parseCount(vdevsText, 1, MAX_VDEVS, "vdevs"), [vdevsText]);
  const disksParsed = useMemo(() => parseDisksPerVdev(disksText, layout), [disksText, layout]);
  const sizeParsed = useMemo(() => parseDiskSize(sizeText, unit), [sizeText, unit]);

  const vdevs = vdevsParsed.kind === "ok" ? vdevsParsed.value : null;
  const disks = disksParsed.kind === "ok" ? disksParsed.value : null;
  const diskBytes = sizeParsed.kind === "ok" ? sizeParsed.value : null;

  const input = useMemo(
    () =>
      vdevs !== null && disks !== null && diskBytes !== null
        ? { layout, vdevs, disksPerVdev: disks, diskBytes, ashift, recordsize }
        : null,
    [layout, vdevs, disks, diskBytes, ashift, recordsize],
  );
  const result = useMemo(() => (input ? poolCapacity(input) : null), [input]);
  const warnings = useMemo(() => (input ? layoutWarnings(input) : []), [input]);

  const paddingRows = useMemo(
    () =>
      disks !== null
        ? RECORDSIZES.map((size) => ({ size, alloc: blockAlloc(layout, disks, ashift, size) }))
        : [],
    [layout, disks, ashift],
  );

  const vdevsError = errorOf(vdevsParsed);
  const disksError = layout === "stripe" ? null : errorOf(disksParsed);
  const sizeError = errorOf(sizeParsed);

  function chooseLayout(id: Layout) {
    setLayout(id);
    const min = layoutInfo(id).minDisks;
    const typed = Number(disksText.trim());
    if (id !== "stripe" && (!Number.isInteger(typed) || typed < min)) setDisksText(String(min));
  }

  function applyExample(example: Example) {
    setLayout(example.layout);
    setVdevsText(example.vdevs);
    setDisksText(example.disks);
    setSizeText(example.size);
    setUnit(example.unit);
  }

  const raidz = isRaidz(layout);
  // How the chosen record size compares with the 128 KiB block that
  // zfs list's accounting ratio is fixed from.
  const vsAccounting =
    result && disks !== null
      ? result.alloc.efficiency / blockAlloc(layout, disks, ashift, ACCOUNTING_BLOCK).efficiency - 1
      : 0;
  const redundancyLabel = layout === "mirror" ? "Mirror copies" : raidz ? "Parity" : "Redundancy";
  const vdevNoun = (n: number) => `${info.label} ${plural(n, "vdev", "vdevs")}`;

  const describe =
    input && result
      ? layout === "stripe"
        ? `${count(result.totalDisks)} ${plural(result.totalDisks, "disk", "disks")} of ${formatSI(input.diskBytes)}, striped`
        : `${count(input.vdevs)} ${vdevNoun(input.vdevs)} of ${input.disksPerVdev} x ${formatSI(input.diskBytes)}`
      : "";

  const summary =
    input && result
      ? `${describe}: ${formatIEC(result.usable)} (${formatSI(result.usable)}) usable, ${formatIEC(result.fillLine)} at the 80 percent line. ${
          result.guaranteed === 0
            ? "One disk failure loses the pool."
            : `Survives any ${result.guaranteed} disk ${plural(result.guaranteed, "failure", "failures")}.`
        }`
      : vdevsParsed.kind === "empty" || disksParsed.kind === "empty" || sizeParsed.kind === "empty"
        ? "Fill in the vdev count, disks per vdev and disk size to see the capacity."
        : "Fix the highlighted field to see the capacity.";

  const segments =
    result && result.raw > 0
      ? [
          {
            key: "fill",
            label: "Usable, below the 80% line",
            bytes: Math.min(result.fillLine, result.usable),
            swatch: "bg-[hsl(var(--brand-signal))]",
          },
          {
            key: "headroom",
            label: "Usable, above the 80% line",
            bytes: Math.max(0, result.usable - result.fillLine),
            swatch: "bg-[hsl(var(--brand-signal)/0.35)]",
          },
          { key: "slop", label: "Slop space", bytes: result.slop, swatch: "bg-[hsl(var(--brand-amber))]" },
          {
            key: "padding",
            label: "RAIDZ padding (estimate)",
            bytes: result.padding,
            swatch: "bg-[hsl(var(--brand-cyan))]",
          },
          { key: "redundancy", label: redundancyLabel, bytes: result.redundancy, swatch: "bg-[hsl(var(--brand-iron))]" },
        ]
      : [];

  const rows =
    input && result
      ? [
          {
            key: "raw",
            label: "Raw capacity",
            bytes: result.raw,
            note: `${count(result.totalDisks)} ${plural(result.totalDisks, "disk", "disks")} x ${formatSI(input.diskBytes)}`,
            total: false,
          },
          {
            key: "parity",
            label: `Less ${redundancyLabel.toLowerCase()}`,
            bytes: result.redundancy,
            note:
              layout === "mirror"
                ? `${input.disksPerVdev - 1} extra ${plural(input.disksPerVdev - 1, "copy", "copies")} per vdev`
                : raidz
                  ? `${info.nparity} ${plural(info.nparity, "disk", "disks")}' worth per vdev`
                  : "none",
            total: false,
          },
          {
            key: "after-parity",
            label: "After parity",
            bytes: result.afterParity,
            note: "the data share of every vdev",
            total: true,
          },
          {
            key: "padding",
            label: "Less RAIDZ padding (estimate)",
            bytes: result.padding,
            note: raidz
              ? `short rows and skip sectors, ${formatBinarySize(recordsize)} records, ashift=${ashift}`
              : result.padding > 0
                ? "records smaller than a sector"
                : "none outside RAIDZ",
            total: false,
          },
          {
            key: "pool",
            label: "Pool size",
            bytes: result.afterPadding,
            note: "after parity and padding",
            total: true,
          },
          {
            key: "slop",
            label: "Less slop space",
            bytes: result.slop,
            note:
              result.afterPadding < 2 * MIN_SLOP
                ? "half the pool, which is under 256 MiB"
                : result.slop === MIN_SLOP
                  ? "raised to the 128 MiB floor"
                  : result.slop === MAX_SLOP
                    ? "1/32 of the pool, capped at 128 GiB"
                    : "1/32 of the pool",
            total: false,
          },
          { key: "usable", label: "Usable", bytes: result.usable, note: "what ordinary writes can fill", total: true },
          {
            key: "fill",
            label: "80% fill line",
            bytes: result.fillLine,
            note: `${FILL_LINE * 100} percent of the pool size`,
            total: false,
          },
        ]
      : [];

  const copyText =
    input && result
      ? [
          `ZFS pool: ${describe}, ashift=${ashift}, recordsize=${formatBinarySize(recordsize)}`,
          ...rows.map((r) => `${r.label.padEnd(30)} ${formatSI(r.bytes).padStart(10)}  ${formatIEC(r.bytes).padStart(11)}`),
          `Fault tolerance: ${result.perVdevTolerance} per vdev; the pool survives any ${result.guaranteed}, at most ${result.bestCase} if spread across vdevs.`,
          "Padding is an estimate that assumes every block is a full record.",
        ].join("\n")
      : "";

  const drawnVdevs = input ? Math.min(input.vdevs, DRAW_VDEVS) : 0;
  const drawnDisks = input ? Math.min(layout === "stripe" ? 1 : input.disksPerVdev, DRAW_DISKS) : 0;

  return (
    <ToolShell slug="zfs-capacity-calculator">
      <p role="status" aria-live="polite" data-testid="text-zfs-summary" className="sr-only">
        {summary}
      </p>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Pool layout">
            <div role="group" aria-labelledby="zfs-layout-label">
              <div id="zfs-layout-label" className={LABEL_CLASS}>
                Vdev type
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => chooseLayout(l.id)}
                    aria-pressed={layout === l.id}
                    data-testid={`button-layout-${l.id}`}
                    className={`${CHIP_CLASS} ${layout === l.id ? CHIP_ON_CLASS : CHIP_OFF_CLASS}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="zfs-vdevs" className={LABEL_CLASS}>
                  {layout === "stripe" ? "Disks (one per vdev)" : "Vdevs"}
                </label>
                <input
                  id="zfs-vdevs"
                  value={vdevsText}
                  onChange={(event) => setVdevsText(event.target.value)}
                  inputMode="numeric"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={vdevsError !== null}
                  aria-describedby={vdevsError ? "zfs-vdevs-error" : "zfs-vdevs-hint"}
                  data-testid="input-zfs-vdevs"
                  className={`mt-2 ${INPUT_CLASS}`}
                />
                <FieldMessage
                  id="zfs-vdevs"
                  error={vdevsError}
                  hint="Top-level vdevs. ZFS spreads writes across all of them."
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="zfs-disks" className={LABEL_CLASS}>
                  Disks per vdev
                </label>
                <input
                  id="zfs-disks"
                  value={layout === "stripe" ? "1" : disksText}
                  onChange={(event) => setDisksText(event.target.value)}
                  disabled={layout === "stripe"}
                  inputMode="numeric"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={disksError !== null}
                  aria-describedby={disksError ? "zfs-disks-error" : "zfs-disks-hint"}
                  data-testid="input-zfs-disks"
                  className={`mt-2 ${INPUT_CLASS}`}
                />
                <FieldMessage
                  id="zfs-disks"
                  error={disksError}
                  hint={
                    layout === "stripe"
                      ? "A stripe vdev is one disk, so the count to the left is the number of disks."
                      : layout === "mirror"
                        ? "2 for a pair, 3 for a three-way mirror."
                        : `Parity included. At least ${info.minDisks}.`
                  }
                />
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="zfs-size" className={LABEL_CLASS}>
                Capacity of one disk
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="zfs-size"
                  value={sizeText}
                  onChange={(event) => setSizeText(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={sizeError !== null}
                  aria-describedby={sizeError ? "zfs-size-error" : "zfs-size-hint"}
                  placeholder="12"
                  data-testid="input-zfs-disk-size"
                  className={INPUT_CLASS}
                />
                <label htmlFor="zfs-size-unit" className="sr-only">
                  Disk size unit
                </label>
                <select
                  id="zfs-size-unit"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as SizeUnit)}
                  data-testid="select-zfs-unit"
                  className={`${SELECT_CLASS} w-28 shrink-0`}
                >
                  {SIZE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id}
                    </option>
                  ))}
                </select>
              </div>
              <FieldMessage
                id="zfs-size"
                error={sizeError}
                hint={
                  diskBytes !== null
                    ? `${sizeText.trim()} ${unit} is ${formatSI(diskBytes)}, or ${formatIEC(diskBytes)}. Drive labels use TB (10^12 bytes); zpool and zfs print TiB (2^40).`
                    : "As printed on the label. Drive labels use TB (10^12 bytes); zpool and zfs print TiB (2^40)."
                }
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => applyExample(example)}
                  data-testid={`button-example-${example.id}`}
                  className={SMALL_CHIP_CLASS}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </ToolPanel>

          <ToolPanel title="Allocation">
            <div>
              <label htmlFor="zfs-ashift" className={LABEL_CLASS}>
                ashift (sector size)
              </label>
              <select
                id="zfs-ashift"
                value={ashift}
                onChange={(event) => setAshift(Number(event.target.value))}
                data-testid="select-zfs-ashift"
                className={`mt-2 w-full ${SELECT_CLASS}`}
              >
                {ASHIFTS.map((a) => (
                  <option key={a} value={a}>
                    {a} ({formatBinarySize(2 ** a)} sectors){a === DEFAULT_ASHIFT ? ", the usual choice" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The sector size as a power of two, fixed for each vdev when it is created. 12 matches nearly every
                current disk.
              </p>
            </div>

            <div className="mt-5">
              <label htmlFor="zfs-recordsize" className={LABEL_CLASS}>
                recordsize
              </label>
              <select
                id="zfs-recordsize"
                value={recordsize}
                onChange={(event) => setRecordsize(Number(event.target.value))}
                data-testid="select-zfs-recordsize"
                className={`mt-2 w-full ${SELECT_CLASS}`}
              >
                {RECORDSIZES.map((size) => (
                  <option key={size} value={size}>
                    {formatBinarySize(size)}
                    {size === DEFAULT_RECORDSIZE ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                The dataset property. Padding is estimated as if every block were one full record; small files and
                compressed blocks are smaller, and small blocks pad worst. Records above 128 KiB use the large_blocks
                pool feature.
              </p>
            </div>

            {result && input ? (
              <div className="mt-5 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-4">
                <div className={LABEL_CLASS}>One {formatBinarySize(recordsize)} record on one vdev</div>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {count(result.alloc.data)} data {plural(result.alloc.data, "sector", "sectors")}
                  {result.alloc.redundancy > 0
                    ? ` + ${count(result.alloc.redundancy)} ${raidz ? "parity" : "copy"} ${plural(result.alloc.redundancy, "sector", "sectors")}`
                    : ""}
                  {result.alloc.skip > 0
                    ? ` + ${result.alloc.skip} skip ${plural(result.alloc.skip, "sector", "sectors")}`
                    : ""}{" "}
                  = {count(result.alloc.total)} x {formatBinarySize(result.alloc.sector)}.
                </p>
                <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Stores {formatPercent(result.alloc.efficiency)} of the raw space it occupies, against{" "}
                  {formatPercent(result.alloc.ideal)} with no rounding.
                </p>
              </div>
            ) : null}
          </ToolPanel>
        </div>

        {input && result ? (
          <div className="space-y-6" data-testid="output-zfs">
            <ToolPanel title="Capacity">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <div className={LABEL_CLASS}>Usable</div>
                  <p
                    data-testid="text-zfs-usable"
                    className="mt-1 font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
                  >
                    {formatIEC(result.usable)}
                  </p>
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{formatSI(result.usable)}</p>
                </div>
                <div>
                  <div className={LABEL_CLASS}>Keep below (80%)</div>
                  <p
                    data-testid="text-zfs-fill"
                    className="mt-1 font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-signal))]"
                  >
                    {formatIEC(result.fillLine)}
                  </p>
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{formatSI(result.fillLine)}</p>
                </div>
                <div>
                  <div className={LABEL_CLASS}>Efficiency</div>
                  <p className="mt-1 font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-bone))]">
                    {formatPercent(result.usable / result.raw)}
                  </p>
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">usable over raw</p>
                </div>
              </div>

              <div className="mt-6" aria-hidden="true">
                <div className="flex h-6 w-full overflow-hidden rounded-md border border-[hsl(var(--brand-iron))]">
                  {segments.map((s) =>
                    s.bytes > 0 ? (
                      <div key={s.key} className={`h-full ${s.swatch}`} style={{ width: `${(s.bytes / result.raw) * 100}%` }} />
                    ) : null,
                  )}
                </div>
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2" data-testid="list-zfs-legend">
                {segments.map((s) => (
                  <li key={s.key} className="flex min-w-0 items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    <span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 rounded-sm ${s.swatch}`} />
                    <span className="min-w-0 break-words">
                      {s.label}: {formatIEC(s.bytes)}{" "}
                      <span className="text-[hsl(var(--brand-ash))]">({formatPercent(s.bytes / result.raw)} of raw)</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse" data-testid="table-zfs-capacity">
                  <caption className="sr-only">Capacity at each step, in decimal and binary units</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Step
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        TB (SI)
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        TiB (IEC)
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        Of raw
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                        <th scope="row" className="py-2.5 pr-4 text-left align-top font-normal">
                          <span
                            className={`block font-mono-tight text-sm ${r.total ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-bone-dim))]"}`}
                          >
                            {r.label}
                          </span>
                          <span className="block font-mono-tight text-xs text-[hsl(var(--brand-ash))]">{r.note}</span>
                        </th>
                        <td
                          className={`py-2.5 pr-4 text-right align-top font-mono-tight text-sm ${r.total ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-bone-dim))]"}`}
                          data-testid={`text-zfs-${r.key}-si`}
                        >
                          {formatSI(r.bytes)}
                        </td>
                        <td
                          className={`py-2.5 pr-4 text-right align-top font-mono-tight text-sm ${r.total ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-bone-dim))]"}`}
                          data-testid={`text-zfs-${r.key}-iec`}
                        >
                          {formatIEC(r.bytes)}
                        </td>
                        <td className="py-2.5 text-right align-top font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                          {formatPercent(r.bytes / result.raw)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.slopBeyondFillLine ? (
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                  On a pool this small the slop reserve (at least 128 MiB, or half of a pool under 256 MiB) is more
                  than a fifth of the space, so the pool fills before it reaches the 80 percent line.
                </p>
              ) : null}
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Fault tolerance">
                <ToolResult
                  label="Each vdev survives"
                  value={`${result.perVdevTolerance} disk ${plural(result.perVdevTolerance, "failure", "failures")}`}
                  testId="text-zfs-per-vdev"
                />
                <ToolResult
                  label="Pool survives, any disks"
                  value={`${result.guaranteed} ${plural(result.guaranteed, "failure", "failures")}`}
                  testId="text-zfs-guaranteed"
                />
                <ToolResult
                  label="Pool survives, at best"
                  value={`${count(result.bestCase)} ${plural(result.bestCase, "failure", "failures")}${input.vdevs > 1 && result.bestCase > 0 ? `, ${result.perVdevTolerance} in each vdev` : ""}`}
                />
                <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {layout === "stripe"
                    ? `Every vdev is a single disk with no redundancy, so the first disk to fail takes the pool with it.`
                    : input.vdevs === 1
                      ? `The pool is this one vdev. ${result.perVdevTolerance + 1} failures inside it lose the vdev and the pool with it. Adding a second vdev later adds no redundancy between the two: losing either would lose the pool.`
                      : `The pool is a stripe across its ${count(input.vdevs)} vdevs, with no redundancy between them. ${
                          result.perVdevTolerance + 1
                        } failures inside one vdev lose that vdev, and losing any vdev loses the whole pool.`}
                </p>

                <div className="mt-5">
                  <ul className="flex flex-wrap gap-2" aria-label="Pool diagram" data-testid="list-zfs-vdevs">
                    {Array.from({ length: drawnVdevs }, (_, v) => (
                      <li
                        key={v}
                        className="rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-2"
                      >
                        <span className="sr-only">
                          vdev {v + 1}: {layout === "stripe" ? 1 : input.disksPerVdev} disks, survives{" "}
                          {result.perVdevTolerance}
                        </span>
                        <div className="flex max-w-[184px] flex-wrap gap-1" aria-hidden="true">
                          {Array.from({ length: drawnDisks }, (_, d) => (
                            <span
                              key={d}
                              className={`inline-block h-5 w-3.5 rounded-sm ${
                                d < result.perVdevTolerance
                                  ? "bg-[hsl(var(--brand-amber)/0.8)]"
                                  : "bg-[hsl(var(--brand-signal)/0.55)]"
                              }`}
                            />
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    One box per vdev, one bar per disk.{" "}
                    {result.perVdevTolerance > 0 ? (
                      <>
                        <span className="text-[hsl(var(--brand-amber))]">Amber</span> counts how many disks each vdev
                        can lose; any of its disks may be the ones that fail.{" "}
                      </>
                    ) : null}
                    {input.vdevs > DRAW_VDEVS ? `The first ${DRAW_VDEVS} of ${count(input.vdevs)} vdevs are drawn. ` : ""}
                    {layout !== "stripe" && input.disksPerVdev > DRAW_DISKS
                      ? `Each vdev is drawn with its first ${DRAW_DISKS} of ${input.disksPerVdev} disks.`
                      : ""}
                  </p>
                </div>
              </ToolPanel>

              <ToolPanel title="What zpool and zfs will print">
                <ToolResult
                  label="zpool list SIZE"
                  value={`${zfsNicenum(result.zpoolSize)} (${formatIEC(result.zpoolSize)})`}
                  testId="text-zfs-zpool-size"
                />
                <ToolResult
                  label="zfs list AVAIL, empty"
                  value={`about ${zfsNicenum(result.zfsAvail)} (${formatIEC(result.zfsAvail)})`}
                  testId="text-zfs-avail"
                />
                {raidz ? (
                  <ToolResult label="Accounting ratio" value={`${result.deflate}/512 = ${formatPercent(result.deflate / 512)}`} />
                ) : null}
                <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Both commands print binary units with a bare suffix, so {zfsNicenum(result.zfsAvail)} means{" "}
                  {formatIEC(result.zfsAvail)}.{" "}
                  {raidz
                    ? `zpool list counts every disk, parity included; zfs list counts space after parity, converting with a ratio fixed from a 128 KiB block whatever the recordsize. ${
                        recordsize === ACCOUNTING_BLOCK
                          ? "128 KiB is the size the ratio assumes, so AVAIL is a fair guide for full records."
                          : vsAccounting > 0.0005
                          ? `With full ${formatBinarySize(recordsize)} records the pool holds about ${formatPercent(vsAccounting)} more file data than AVAIL suggests.`
                          : vsAccounting < -0.0005
                            ? `With full ${formatBinarySize(recordsize)} records the pool holds about ${formatPercent(-vsAccounting)} less file data than AVAIL suggests.`
                            : `At this width ${formatBinarySize(recordsize)} records pad the same as 128 KiB, so AVAIL is a fair guide.`
                      }`
                    : "For mirrors and single disks zpool list already counts one copy, so the two differ only by slop space."}
                </p>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Approximate: labels, the reserved partition and metaslab rounding take a further fraction of a
                  percent, and a little metadata is written at creation.
                </p>
              </ToolPanel>
            </div>

            <ToolPanel title="Padding by record size">
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {raidz
                  ? `How one block of each size lands on a ${input.disksPerVdev}-disk ${info.label} vdev at ashift=${ashift}. RAIDZ adds ${info.nparity} parity ${plural(info.nparity, "sector", "sectors")} per row of up to ${input.disksPerVdev - info.nparity} data sectors, then adds skip sectors to reach a multiple of ${info.nparity + 1}. A short last row still pays full parity.`
                  : `${info.label} vdevs only round each block up to whole ${formatBinarySize(2 ** ashift)} sectors, so there is no padding unless a block is smaller than a sector.`}{" "}
                Select a size to use it above.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse" data-testid="table-zfs-padding">
                  <caption className="sr-only">Sectors and efficiency for each record size</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Record
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        Data
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        {layout === "mirror" ? "Copies" : raidz ? "Parity" : "Extra"}
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        Skip
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        Total
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        Stored
                      </th>
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        Lost to rounding
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paddingRows.map(({ size, alloc }) => {
                      const selected = size === recordsize;
                      const loss = alloc.ideal > 0 ? 1 - alloc.efficiency / alloc.ideal : 0;
                      const cell = `py-1.5 pr-4 text-right font-mono-tight text-sm ${selected ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone-dim))]"}`;
                      return (
                        <tr
                          key={size}
                          className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${selected ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""}`}
                        >
                          <th scope="row" className="py-1 pr-4 text-left font-normal">
                            <button
                              type="button"
                              onClick={() => setRecordsize(size)}
                              aria-pressed={selected}
                              data-testid={`button-zfs-record-${size}`}
                              className={`min-h-[32px] rounded px-2 font-mono-tight text-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand-signal))] ${selected ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone))]"}`}
                            >
                              {formatBinarySize(size)}
                            </button>
                          </th>
                          <td className={cell}>{count(alloc.data)}</td>
                          <td className={cell}>{count(alloc.redundancy)}</td>
                          <td className={cell}>{count(alloc.skip)}</td>
                          <td className={cell}>{count(alloc.total)}</td>
                          <td className={cell}>{formatPercent(alloc.efficiency)}</td>
                          <td className={cell}>{formatPercent(Math.max(0, loss))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Sector counts are per block across the whole vdev. Stored is the share of the raw space the block
                occupies that holds its data. Lost to rounding is the parity of short rows plus skip sectors, measured
                against the after-parity capacity.
              </p>
            </ToolPanel>

            {warnings.length ? (
              <div className="space-y-3" data-testid="list-zfs-warnings">
                {warnings.map((w) => (
                  <p
                    key={w}
                    className="break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                  >
                    {w}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-start gap-3">
              <CopyButton value={copyText} label="Copy the capacity summary" testId="button-zfs-copy">
                <span>Copy summary</span>
              </CopyButton>
            </div>
          </div>
        ) : (
          <p
            data-testid="output-zfs"
            className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]"
          >
            {summary}
          </p>
        )}
      </div>
    </ToolShell>
  );
}
