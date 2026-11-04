/**
 * Storage IOPS calculator.
 *
 * Inputs are held as the strings the reader typed and parsed on every
 * render, so a half-typed value shows a precise message rather than a
 * wrong number. The arithmetic lives in lib/toolkit/iops-calculator so it
 * can be tested without React. The headline figure balances back-end disk
 * operations against the mix; the widely quoted functional IOPS formula is
 * shown beside it, in the totals and in the sizing, with the size of its
 * overstatement.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  BLOCK_SIZES,
  DISK_PRESETS,
  MIX_PRESETS,
  RAID_LEVELS,
  type RaidLevel,
  backendIops,
  breakdown,
  diskCountProblem,
  disksForTarget,
  disksForTargetShortcut,
  formatBlock,
  formatIops,
  formatRate,
  frontEndIops,
  hddIops,
  parseDiskCount,
  parseDiskIops,
  parseReadPercent,
  parseSeekMs,
  parseTargetIops,
  raidInfo,
  rotationalLatencyMs,
  shortcutIops,
} from "@/lib/toolkit/iops-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON_CLASS =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF_CLASS =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";

const RPM_CHOICES = [5400, 5900, 7200, 10000, 15000];

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

const count = (n: number) => n.toLocaleString("en-US");

function pct(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

/* --------------------------------------------------------------- component */

export function IopsCalculator() {
  const [iopsText, setIopsText] = useState("180");
  const [disksText, setDisksText] = useState("8");
  const [level, setLevel] = useState<RaidLevel>("raid5");
  const [readText, setReadText] = useState("70");
  const [blockSize, setBlockSize] = useState(4096);
  const [targetText, setTargetText] = useState("5,000");
  const [rpm, setRpm] = useState(7200);
  const [seekText, setSeekText] = useState("8.5");

  const iopsParsed = useMemo(() => parseDiskIops(iopsText), [iopsText]);
  const disksParsed = useMemo(() => parseDiskCount(disksText), [disksText]);
  const readParsed = useMemo(() => parseReadPercent(readText), [readText]);
  const targetParsed = useMemo(() => parseTargetIops(targetText), [targetText]);
  const seekParsed = useMemo(() => parseSeekMs(seekText), [seekText]);

  const perDisk = iopsParsed.kind === "ok" ? iopsParsed.value : null;
  const disks = disksParsed.kind === "ok" ? disksParsed.value : null;
  const readPct = readParsed.kind === "ok" ? readParsed.value : null;
  const target = targetParsed.kind === "ok" ? targetParsed.value : null;
  const seek = seekParsed.kind === "ok" ? seekParsed.value : null;

  const info = raidInfo(level);
  const levelProblem = disks !== null ? diskCountProblem(level, disks) : null;
  const raw = perDisk !== null && disks !== null ? perDisk * disks : null;

  const main =
    raw !== null && readPct !== null && levelProblem === null
      ? {
          front: frontEndIops(raw, readPct, info.penalty),
          shortcut: shortcutIops(raw, readPct, info.penalty),
          split: breakdown(raw, readPct, level),
          maxRead: raw,
          maxWrite: raw / info.penalty,
        }
      : null;

  const shortcutBackend = main && readPct !== null ? backendIops(main.shortcut, readPct, info.penalty) : null;
  const overstated = main && main.front > 0 ? main.shortcut / main.front - 1 : 0;

  const sizing =
    target !== null && readPct !== null && perDisk !== null
      ? disksForTarget(target, readPct, level, perDisk)
      : null;

  const shortcutDisks =
    target !== null && readPct !== null && perDisk !== null
      ? disksForTargetShortcut(target, readPct, level, perDisk)
      : null;
  // What fraction of its own operations the shortcut's disk count would be asked for.
  const shortcutLoad =
    shortcutDisks !== null && sizing && perDisk !== null ? sizing.backend / (shortcutDisks * perDisk) : null;

  const levelRows = useMemo(
    () =>
      perDisk !== null && disks !== null && readPct !== null
        ? RAID_LEVELS.map((r) => ({
            info: r,
            problem: diskCountProblem(r.id, disks),
            front: frontEndIops(perDisk * disks, readPct, r.penalty),
            shortcut: shortcutIops(perDisk * disks, readPct, r.penalty),
            maxWrite: (perDisk * disks) / r.penalty,
            sizing: target !== null ? disksForTarget(target, readPct, r.id, perDisk) : null,
          }))
        : [],
    [perDisk, disks, readPct, target],
  );

  const hdd = seek !== null ? { iops: hddIops(rpm, seek), half: rotationalLatencyMs(rpm) } : null;
  const hddRounded = hdd ? Math.max(1, Math.round(hdd.iops)) : null;

  const iopsError = errorOf(iopsParsed);
  const disksError = errorOf(disksParsed) ?? levelProblem;
  const readError = errorOf(readParsed);
  const targetError = errorOf(targetParsed);
  const seekError = errorOf(seekParsed);

  const throughput = main ? formatRate(main.front * blockSize) : null;

  const summary =
    main && disks !== null && perDisk !== null && readPct !== null
      ? `${count(disks)} disks of ${formatIops(perDisk)} IOPS in ${info.label} at ${pct(readPct)} reads: ${formatIops(main.front)} front-end IOPS from ${formatIops(raw ?? 0)} raw.`
      : levelProblem
        ? levelProblem
        : iopsParsed.kind === "empty" || disksParsed.kind === "empty" || readParsed.kind === "empty"
          ? "Fill in the per-disk IOPS, the disk count and the read share to see the result."
          : "Fix the highlighted field to see the result.";

  const copyText =
    main && disks !== null && perDisk !== null && readPct !== null && raw !== null
      ? [
          `${count(disks)} x ${formatIops(perDisk)} IOPS, ${info.label} (write penalty ${info.penalty}), ${pct(readPct)} reads / ${pct(100 - readPct)} writes`,
          `Raw back-end IOPS     ${formatIops(raw)}`,
          `Front-end IOPS        ${formatIops(main.front)}  (R / (r + w x P))`,
          `  reads               ${formatIops(main.split.frontReads)}`,
          `  writes              ${formatIops(main.split.frontWrites)}`,
          `100% read IOPS        ${formatIops(main.maxRead)}`,
          `100% write IOPS       ${formatIops(main.maxWrite)}`,
          `Common formula        ${formatIops(main.shortcut)}  (R x r + R x w / P, overstates mixed loads)`,
          ...(sizing && target !== null
            ? [
                `Disks for ${formatIops(target)} IOPS  ${sizing.disks === null ? "not possible with RAID 1" : count(sizing.disks)}`,
              ]
            : []),
        ].join("\n")
      : "";

  const activePreset = DISK_PRESETS.find((p) => perDisk === p.iops)?.id ?? null;

  const opSegments =
    main && raw !== null && raw > 0
      ? [
          {
            key: "reads",
            label: "Reads for front-end reads",
            value: main.split.frontReads,
            swatch: "bg-[hsl(var(--brand-signal))]",
          },
          {
            key: "rmw",
            label: "Reads of old data and parity",
            value: main.split.diskReads - main.split.frontReads,
            swatch: "bg-[hsl(var(--brand-amber))]",
          },
          {
            key: "writes",
            label:
              info.diskReads > 0
                ? "Writes of new data and parity"
                : info.penalty > 1
                  ? "Writes of both mirror copies"
                  : "Writes",
            value: main.split.diskWrites,
            swatch: "bg-[hsl(var(--brand-cyan))]",
          },
        ]
      : [];

  return (
    <ToolShell slug="iops-calculator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-6">
            <ToolPanel title="Disks">
              <div className={LABEL_CLASS} id="iops-preset-label">
                Disk type
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-labelledby="iops-preset-label">
                {DISK_PRESETS.map((preset) => {
                  const active = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setIopsText(count(preset.iops))}
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
                          {preset.typical ? "typ. " : "~"}
                          {count(preset.iops)}
                        </span>
                      </span>
                      <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {preset.note}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="iops-per-disk" className={LABEL_CLASS}>
                    IOPS per disk
                  </label>
                  <input
                    id="iops-per-disk"
                    value={iopsText}
                    onChange={(event) => setIopsText(event.target.value)}
                    inputMode="decimal"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={iopsError !== null}
                    aria-describedby={iopsError ? "iops-per-disk-error" : "iops-per-disk-hint"}
                    placeholder="180"
                    data-testid="input-iops-per-disk"
                    className={`mt-2 ${INPUT_CLASS}`}
                  />
                  <FieldMessage
                    id="iops-per-disk"
                    error={iopsError}
                    hint="Random small-block operations per second. Pick a type or type your drive's measured figure."
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="iops-disks" className={LABEL_CLASS}>
                    Disks
                  </label>
                  <input
                    id="iops-disks"
                    value={disksText}
                    onChange={(event) => setDisksText(event.target.value)}
                    inputMode="numeric"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={disksError !== null}
                    aria-describedby={disksError ? "iops-disks-error" : "iops-disks-hint"}
                    placeholder="8"
                    data-testid="input-iops-disks"
                    className={`mt-2 ${INPUT_CLASS}`}
                  />
                  <FieldMessage
                    id="iops-disks"
                    error={disksError}
                    hint={`Every disk in the set, parity and mirror copies included. ${info.label} takes ${
                      level === "raid1" ? "exactly 2" : level === "raid10" ? "an even number, at least 4" : `at least ${info.minDisks}`
                    }.`}
                  />
                </div>
              </div>
            </ToolPanel>

            <ToolPanel title="RAID level and workload">
              <div role="group" aria-labelledby="iops-level-label">
                <div id="iops-level-label" className={LABEL_CLASS}>
                  RAID level and write penalty
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RAID_LEVELS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setLevel(r.id)}
                      aria-pressed={level === r.id}
                      data-testid={`button-level-${r.id}`}
                      className={`${CHIP_CLASS} ${level === r.id ? CHIP_ON_CLASS : CHIP_OFF_CLASS}`}
                    >
                      {r.label} <span className="ml-2 opacity-80">x{r.penalty}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  One small random write to {info.label}: {info.writeSteps}. That is {info.penalty} disk{" "}
                  {info.penalty === 1 ? "operation" : "operations"}. A read is always one.
                </p>
              </div>

              <div className="mt-5">
                <label htmlFor="iops-read" className={LABEL_CLASS}>
                  Reads, percent of requests
                </label>
                <input
                  id="iops-read"
                  value={readText}
                  onChange={(event) => setReadText(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={readError !== null}
                  aria-describedby={readError ? "iops-read-error" : "iops-read-hint"}
                  placeholder="70"
                  data-testid="input-iops-read"
                  className={`mt-2 ${INPUT_CLASS}`}
                />
                <FieldMessage
                  id="iops-read"
                  error={readError}
                  hint={
                    readPct !== null
                      ? `${pct(readPct)} reads and ${pct(100 - readPct)} writes, counted by request.`
                      : "The rest are writes. Databases often run 70/30; backup targets and logging are mostly writes."
                  }
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {MIX_PRESETS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReadText(String(r))}
                      aria-pressed={readPct === r}
                      data-testid={`button-mix-${r}`}
                      className={`${CHIP_CLASS} ${readPct === r ? CHIP_ON_CLASS : CHIP_OFF_CLASS}`}
                    >
                      {r}/{100 - r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="iops-block" className={`block ${LABEL_CLASS}`}>
                  Block size, for throughput
                </label>
                <select
                  id="iops-block"
                  value={blockSize}
                  onChange={(event) => setBlockSize(Number(event.target.value))}
                  data-testid="select-iops-block"
                  className={`mt-2 sm:max-w-[240px] ${SELECT_CLASS}`}
                >
                  {BLOCK_SIZES.map((b) => (
                    <option key={b} value={b}>
                      {formatBlock(b)}
                    </option>
                  ))}
                </select>
              </div>
            </ToolPanel>
          </div>

          <div className="min-w-0 space-y-6">
            <ToolPanel title="Front-end IOPS">
              <p
                data-testid="output-iops"
                className="font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
              >
                {main ? `${formatIops(main.front)} IOPS` : "--"}
              </p>
              <p
                role="status"
                aria-live="polite"
                data-testid="text-iops-summary"
                className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
              >
                {summary}
              </p>

              {main && raw !== null && readPct !== null && disks !== null && perDisk !== null ? (
                <div className="mt-4">
                  <ToolResult
                    label="Raw back-end IOPS"
                    value={`${formatIops(raw)} (${count(disks)} x ${formatIops(perDisk)})`}
                    testId="text-iops-raw"
                  />
                  <ToolResult label="Front-end reads" value={`${formatIops(main.split.frontReads)} per second`} />
                  <ToolResult label="Front-end writes" value={`${formatIops(main.split.frontWrites)} per second`} />
                  <ToolResult label="At 100% reads" value={`${formatIops(main.maxRead)} IOPS`} testId="text-iops-max-read" />
                  <ToolResult
                    label="At 100% writes"
                    value={`${formatIops(main.maxWrite)} IOPS`}
                    testId="text-iops-max-write"
                  />
                  <ToolResult
                    label={`Throughput at ${formatBlock(blockSize)}`}
                    value={throughput ? `${throughput.si} (${throughput.iec})` : "--"}
                    testId="text-iops-throughput"
                  />
                  <ToolResult
                    label="Common functional IOPS formula"
                    value={`${formatIops(main.shortcut)} IOPS`}
                    testId="text-iops-shortcut"
                  />
                </div>
              ) : null}

              {main && readPct !== null && shortcutBackend !== null ? (
                overstated > 0.0005 ? (
                  <p className="mt-4 break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                    The widely quoted functional IOPS formula, R x r + R x w / P, gives {formatIops(main.shortcut)}. Serving that
                    many requests at {pct(readPct)} reads would take {formatIops(shortcutBackend)} disk operations
                    per second against the {formatIops(main.maxRead)} the disks have, so it overstates this mix by{" "}
                    {(overstated * 100).toFixed(1)} percent. The headline figure, R / (r + w x P), is the rate that keeps
                    the disks exactly busy.
                  </p>
                ) : (
                  <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {info.penalty === 1
                      ? "With no write penalty, the common formula and the headline one give the same answer."
                      : "At 100 percent reads or writes, the common formula and the headline one give the same answer."}
                  </p>
                )
              ) : null}

              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                These are random small-block figures. Sequential transfers avoid seeks and full-stripe writes avoid
                the parity reads, so streaming throughput is far higher. A write-back controller cache absorbs bursts
                until it fills; sustained load runs at the disks' pace.
              </p>

              {copyText ? (
                <div className="mt-4">
                  <CopyButton value={copyText} label="Copy the IOPS summary" testId="button-iops-copy">
                    <span>Copy summary</span>
                  </CopyButton>
                </div>
              ) : null}
            </ToolPanel>

            {main && raw !== null ? (
              <ToolPanel title="Where the disk operations go">
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  At {formatIops(main.front)} front-end IOPS the disks do exactly {formatIops(raw)} operations a
                  second between them.
                </p>
                <div className="mt-4" aria-hidden="true">
                  <div className="flex h-6 w-full overflow-hidden rounded-md border border-[hsl(var(--brand-iron))]">
                    {opSegments.map((s) =>
                      s.value > 0 ? (
                        <div key={s.key} className={`h-full ${s.swatch}`} style={{ width: `${(s.value / raw) * 100}%` }} />
                      ) : null,
                    )}
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5" data-testid="list-iops-ops">
                  {opSegments.filter((s) => s.key !== "rmw" || info.diskReads > 0).map((s) => (
                    <li key={s.key} className="flex min-w-0 items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                      <span aria-hidden="true" className={`inline-block h-3 w-3 shrink-0 rounded-sm ${s.swatch}`} />
                      <span className="min-w-0 break-words">
                        {s.label}: {formatIops(s.value)} per second{" "}
                        <span className="text-[hsl(var(--brand-ash))]">({((s.value / raw) * 100).toFixed(1)}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {main.split.frontWrites > 0
                    ? `Writes are ${pct(100 - (readPct ?? 0))} of requests but take ${(((main.split.frontWrites * info.penalty) / raw) * 100).toFixed(1)}% of the disks' operations.`
                    : "A read-only load uses each disk operation for one request."}
                </p>
              </ToolPanel>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Disks for a target">
            <label htmlFor="iops-target" className={LABEL_CLASS}>
              Front-end IOPS needed
            </label>
            <input
              id="iops-target"
              value={targetText}
              onChange={(event) => setTargetText(event.target.value)}
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={targetError !== null}
              aria-describedby={targetError ? "iops-target-error" : "iops-target-hint"}
              placeholder="5,000"
              data-testid="input-iops-target"
              className={`mt-2 ${INPUT_CLASS}`}
            />
            <FieldMessage
              id="iops-target"
              error={targetError}
              hint="Uses the per-disk figure, RAID level and read share set above."
            />
            {sizing && target !== null && readPct !== null && perDisk !== null ? (
              <div className="mt-4" data-testid="output-iops-sizing">
                <ToolResult
                  label="Back-end IOPS needed"
                  value={`${formatIops(sizing.backend)}`}
                  testId="text-iops-backend"
                />
                <ToolResult
                  label="Disks for the IOPS"
                  value={`${count(sizing.byIops)} x ${formatIops(perDisk)}`}
                  testId="text-iops-by-iops"
                />
                <ToolResult
                  label={`Disks in ${info.label}`}
                  value={sizing.disks === null ? "not possible" : count(sizing.disks)}
                  testId="text-iops-disks-needed"
                />
                {sizing.delivers !== null ? (
                  <ToolResult label="Those disks deliver" value={`${formatIops(sizing.delivers)} IOPS`} />
                ) : null}
                <ToolResult
                  label="By the common formula"
                  value={shortcutDisks === null ? "not possible" : count(shortcutDisks)}
                  testId="text-iops-shortcut-disks"
                />
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {formatIops(target)} x ({pct(readPct)} + {pct(100 - readPct)} x {info.penalty}) ={" "}
                  {formatIops(sizing.backend)} disk operations per second, then divided by {formatIops(perDisk)} and
                  rounded up.
                  {sizing.note ? ` ${sizing.note}` : ""}
                </p>
                {shortcutDisks !== null && shortcutLoad !== null && shortcutLoad > 1.0005 ? (
                  <p
                    data-testid="text-iops-shortcut-note"
                    className="mt-2 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                  >
                    The common formula stops at {count(shortcutDisks)} disks. Serving {formatIops(target)} requests at{" "}
                    {pct(readPct)} reads would then ask each disk for {Math.round(shortcutLoad * 100).toLocaleString("en-US")}{" "}
                    percent of the operations it can do.
                  </p>
                ) : null}
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  This sizes for IOPS alone, with no headroom. Capacity, rebuild time and growth usually add disks.
                </p>
              </div>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Estimate a hard disk">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="iops-rpm" className={LABEL_CLASS}>
                  Spindle speed
                </label>
                <select
                  id="iops-rpm"
                  value={rpm}
                  onChange={(event) => setRpm(Number(event.target.value))}
                  data-testid="select-iops-rpm"
                  className={`mt-2 ${SELECT_CLASS}`}
                >
                  {RPM_CHOICES.map((r) => (
                    <option key={r} value={r}>
                      {count(r)} rpm
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="iops-seek" className={LABEL_CLASS}>
                  Average seek, ms
                </label>
                <input
                  id="iops-seek"
                  value={seekText}
                  onChange={(event) => setSeekText(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={seekError !== null}
                  aria-describedby={seekError ? "iops-seek-error" : "iops-seek-hint"}
                  placeholder="8.5"
                  data-testid="input-iops-seek"
                  className={`mt-2 ${INPUT_CLASS}`}
                />
                <FieldMessage id="iops-seek" error={seekError} hint="Average read seek from the datasheet." />
              </div>
            </div>
            {hdd && seek !== null && hddRounded !== null ? (
              <div className="mt-4">
                <ToolResult label="Half a revolution" value={`${hdd.half.toFixed(2)} ms`} />
                <ToolResult label="Per operation" value={`${(seek + hdd.half).toFixed(2)} ms`} />
                <ToolResult label="Random IOPS" value={formatIops(hdd.iops)} testId="text-iops-hdd" />
                <button
                  type="button"
                  onClick={() => setIopsText(count(hddRounded))}
                  data-testid="button-iops-use-hdd"
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-[hsl(var(--brand-signal)/0.6)] px-4 font-mono-tight text-xs uppercase tracking-[0.18em] text-[hsl(var(--brand-signal))] transition-colors hover:bg-[hsl(var(--brand-signal)/0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  Use {count(hddRounded)} per disk
                </button>
                <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  1000 / (seek + 30000 / rpm). This is one request at a time. With several queued, the drive reorders
                  them to shorten the travel between them (NCQ on SATA, tagged queuing on SAS), which raises IOPS at
                  the cost of latency per request.
                </p>
              </div>
            ) : null}
          </ToolPanel>
        </div>

        {levelRows.length ? (
          <ToolPanel title="Same disks, every RAID level">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse" data-testid="table-iops-levels">
                <caption className="sr-only">Front-end IOPS for each RAID level with the same disks and mix</caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      Level
                    </th>
                    <th scope="col" className={`${TH_CLASS} text-right`}>
                      Penalty
                    </th>
                    <th scope="col" className={`${TH_CLASS} text-right`}>
                      Front-end
                    </th>
                    <th scope="col" className={`${TH_CLASS} text-right`}>
                      100% writes
                    </th>
                    <th scope="col" className={`${TH_CLASS} text-right`}>
                      Common formula
                    </th>
                    {target !== null ? (
                      <th scope="col" className={`${TH_CLASS} text-right`}>
                        Disks for {formatIops(target)}
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {levelRows.map((row) => {
                    const selected = row.info.id === level;
                    const cell = `py-1.5 pr-4 text-right align-top font-mono-tight text-sm ${selected ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone-dim))]"}`;
                    return (
                      <tr
                        key={row.info.id}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] ${selected ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""}`}
                      >
                        <th scope="row" className="py-1 pr-4 text-left align-top font-normal">
                          <button
                            type="button"
                            onClick={() => setLevel(row.info.id)}
                            aria-pressed={selected}
                            data-testid={`button-row-${row.info.id}`}
                            className={`min-h-[32px] rounded px-2 font-mono-tight text-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand-signal))] ${selected ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone))]"}`}
                          >
                            {row.info.label}
                          </button>
                          {row.problem ? (
                            <span className="block px-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                              {row.problem}
                            </span>
                          ) : null}
                        </th>
                        <td className={cell}>{row.info.penalty}</td>
                        <td className={cell}>{row.problem ? "--" : formatIops(row.front)}</td>
                        <td className={cell}>{row.problem ? "--" : formatIops(row.maxWrite)}</td>
                        <td className={cell}>{row.problem ? "--" : formatIops(row.shortcut)}</td>
                        {target !== null ? (
                          <td className={cell}>
                            {row.sizing ? (row.sizing.disks === null ? "n/a" : count(row.sizing.disks)) : "--"}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Every row uses the same disks and read share. Reads cost the same everywhere, so the levels differ only
              in what each write costs. Select a level to use it above.
            </p>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
