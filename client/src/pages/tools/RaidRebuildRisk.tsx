/**
 * RAID rebuild risk estimator.
 *
 * Every input is held as the string the reader typed and parsed on each
 * render, so a half-typed value shows a precise message instead of snapping
 * to a number. The probability arithmetic, which has to go through log1p and
 * expm1 to mean anything at 1 in 10^14, lives in lib/toolkit/raid-rebuild-risk
 * so it can be tested without React.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  SIZE_UNITS,
  type SizeUnit,
  URE_CLASSES,
  analyze,
  formatBytes,
  formatDuration,
  formatOdds,
  formatPercent,
  formatSig,
  pairProbability,
  parseAfr,
  parseDiskSize,
  parseSpeed,
  parseSurvivors,
  ureProbability,
  type Parsed,
} from "@/lib/toolkit/raid-rebuild-risk";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "min-h-[44px] w-full min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "min-h-[44px] w-28 shrink-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

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

/** Danger above 10 percent, amber above 0.1 percent, plain otherwise. */
function riskTone(fail: number): string {
  if (fail >= 0.1) return "text-[hsl(var(--brand-danger))]";
  if (fail >= 0.001) return "text-[hsl(var(--brand-amber))]";
  return "text-[hsl(var(--brand-bone))]";
}

function Chance({ fail, survive }: { fail: number; survive: number }) {
  const odds = formatOdds(fail, survive);
  return (
    <>
      <span className={riskTone(fail)}>{formatPercent(fail, survive)}</span>
      {odds ? <span className="text-[hsl(var(--brand-ash))]"> · {odds}</span> : null}
    </>
  );
}

/* --------------------------------------------------------------- component */

export function RaidRebuildRisk() {
  const [size, setSize] = useState("12");
  const [unit, setUnit] = useState<SizeUnit>("TB");
  const [survivors, setSurvivors] = useState("7");
  const [ureExp, setUreExp] = useState(14);
  const [speed, setSpeed] = useState("150");
  const [afr, setAfr] = useState("1.5");

  const sizeParsed = useMemo(() => parseDiskSize(size, unit), [size, unit]);
  const survivorsParsed = useMemo(() => parseSurvivors(survivors), [survivors]);
  const speedParsed = useMemo(() => parseSpeed(speed), [speed]);
  const afrParsed = useMemo(() => parseAfr(afr), [afr]);

  const diskBytes = valueOf(sizeParsed);
  const survivorCount = valueOf(survivorsParsed);
  const speedMBps = valueOf(speedParsed);
  const afrPct = valueOf(afrParsed);
  const afrOk = afrParsed.kind !== "error";

  const result = useMemo(
    () =>
      diskBytes !== null && survivorCount !== null && speedMBps !== null && afrOk
        ? analyze({
            diskBytes,
            survivors: survivorCount,
            ureExp,
            speedMBps,
            afr: afrPct === null ? null : afrPct / 100,
          })
        : null,
    [diskBytes, survivorCount, speedMBps, afrOk, afrPct, ureExp],
  );

  const byRating = useMemo(
    () =>
      result && diskBytes !== null && survivorCount !== null
        ? URE_CLASSES.map((c) => ({
            c,
            expected: result.bitsRead / 10 ** c.exp,
            any: ureProbability(result.bitsRead, c.exp),
            pair: pairProbability(diskBytes, survivorCount, c.exp),
          }))
        : [],
    [result, diskBytes, survivorCount],
  );

  const sizeError = errorOf(sizeParsed);
  const survivorsError = errorOf(survivorsParsed);
  const speedError = errorOf(speedParsed);
  const afrError = errorOf(afrParsed);

  const unitNote = SIZE_UNITS.find((u) => u.id === unit)?.note ?? "";
  const rating = URE_CLASSES.find((c) => c.exp === ureExp) ?? URE_CLASSES[0];

  const status = result
    ? `Reading ${formatBytes(result.readBytes)} from ${survivorCount} ${survivorCount === 1 ? "disk" : "disks"} rated ${rating.label} gives a ${formatPercent(result.anyUre.fail, result.anyUre.survive)} chance of at least one unrecoverable read error.`
    : sizeParsed.kind === "empty" || survivorsParsed.kind === "empty" || speedParsed.kind === "empty"
      ? "Enter a disk size, the number of surviving disks and a rebuild speed."
      : "Fix the highlighted field to see the estimate.";

  const summary =
    result && survivorCount !== null
      ? [
          `RAID rebuild risk (classic simplified model, URE spec ${rating.label} bits)`,
          `Disk size        ${size.trim()} ${unit}`,
          `Disks read       ${survivorCount}`,
          `Data read        ${formatBytes(result.readBytes)}`,
          `Rebuild time     ${formatDuration(result.rebuildSeconds)} at ${speed.trim()} MB/s`,
          `Expected UREs    ${formatSig(result.expectedUres)}`,
          ...result.scenarios.map(
            (s) =>
              `${`${s.level}, ${s.situation}`.padEnd(28)} ${
                s.applicable ? formatPercent(s.fail, s.survive) : `needs ${s.minSurvivors}+ surviving disks`
              }`,
          ),
          ...(result.secondFailure !== null
            ? [`Another disk fails during rebuild  ${formatPercent(result.secondFailure, 1 - result.secondFailure)}`]
            : []),
        ].join("\n")
      : "";

  return (
    <ToolShell slug="raid-rebuild-risk">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Array">
          <div>
            <label htmlFor="rrr-size" className={LABEL_CLASS}>
              Disk size
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="rrr-size"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                inputMode="decimal"
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={sizeError !== null}
                aria-describedby={sizeError ? "rrr-size-error" : "rrr-size-hint"}
                placeholder="12"
                data-testid="input-disk-size"
                className={INPUT_CLASS}
              />
              <label htmlFor="rrr-unit" className="sr-only">
                Disk size unit
              </label>
              <select
                id="rrr-unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value as SizeUnit)}
                data-testid="select-disk-unit"
                className={SELECT_CLASS}
              >
                {SIZE_UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id}
                  </option>
                ))}
              </select>
            </div>
            <FieldMessage id="rrr-size" error={sizeError} hint={`The capacity of one disk. ${unitNote}`} />
          </div>

          <div className="mt-5">
            <label htmlFor="rrr-survivors" className={LABEL_CLASS}>
              Surviving disks read during the rebuild
            </label>
            <input
              id="rrr-survivors"
              value={survivors}
              onChange={(event) => setSurvivors(event.target.value)}
              inputMode="numeric"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={survivorsError !== null}
              aria-describedby={survivorsError ? "rrr-survivors-error" : "rrr-survivors-hint"}
              placeholder="7"
              data-testid="input-survivors"
              className={`mt-2 ${INPUT_CLASS}`}
            />
            <FieldMessage
              id="rrr-survivors"
              error={survivorsError}
              hint="For a set of N disks with one failed, this is N - 1. Every surviving disk is read end to end to rebuild the missing one."
            />
          </div>

          <fieldset className="mt-5 min-w-0">
            <legend className={LABEL_CLASS}>Unrecoverable read error rating, bits read per error</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {URE_CLASSES.map((c) => {
                const active = c.exp === ureExp;
                return (
                  <button
                    key={c.exp}
                    type="button"
                    onClick={() => setUreExp(c.exp)}
                    aria-pressed={active}
                    data-testid={`button-ure-${c.exp}`}
                    className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                      active
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                    }`}
                  >
                    <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{c.label}</span>
                    <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {c.note}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The figure from the drive&apos;s data sheet, usually written as fewer than 1 sector per 10^14 bits read.
            </p>
          </fieldset>

          <div className="mt-5">
            <label htmlFor="rrr-speed" className={LABEL_CLASS}>
              Rebuild speed, MB/s
            </label>
            <input
              id="rrr-speed"
              value={speed}
              onChange={(event) => setSpeed(event.target.value)}
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={speedError !== null}
              aria-describedby={speedError ? "rrr-speed-error" : "rrr-speed-hint"}
              placeholder="150"
              data-testid="input-rebuild-speed"
              className={`mt-2 ${INPUT_CLASS}`}
            />
            <FieldMessage
              id="rrr-speed"
              error={speedError}
              hint="The rate the replacement disk is written, in decimal megabytes per second. Large hard drives sustain roughly 200 to 300 MB/s at best; a rebuild sharing the array with live traffic often runs far slower."
            />
          </div>

          <div className="mt-5">
            <label htmlFor="rrr-afr" className={LABEL_CLASS}>
              Annualized failure rate, percent (optional)
            </label>
            <input
              id="rrr-afr"
              value={afr}
              onChange={(event) => setAfr(event.target.value)}
              inputMode="decimal"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={afrError !== null}
              aria-describedby={afrError ? "rrr-afr-error" : "rrr-afr-hint"}
              placeholder="1.5"
              data-testid="input-afr"
              className={`mt-2 ${INPUT_CLASS}`}
            />
            <FieldMessage
              id="rrr-afr"
              error={afrError}
              hint="Used for the chance that another disk fails outright during the rebuild. Large published fleet statistics put hard drives at roughly 1 to 2 percent a year. Leave it empty to skip."
            />
          </div>
        </ToolPanel>

        <div className="min-w-0 space-y-6">
          <ToolPanel title="Rebuild">
            <div className={LABEL_CLASS}>Chance of at least one URE during the rebuild</div>
            <p
              data-testid="output-raid-risk"
              className={`mt-2 font-display text-3xl font-medium tracking-[-0.02em] ${
                result ? riskTone(result.anyUre.fail) : "text-[hsl(var(--brand-bone))]"
              }`}
            >
              {result ? formatPercent(result.anyUre.fail, result.anyUre.survive) : "--"}
            </p>
            <p
              role="status"
              aria-live="polite"
              data-testid="text-raid-summary"
              className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]"
            >
              {status}
            </p>

            {result && survivorCount !== null ? (
              <div className="mt-4">
                <ToolResult
                  label="Rebuild time"
                  value={formatDuration(result.rebuildSeconds)}
                  testId="text-rebuild-time"
                />
                <ToolResult label="Data read" value={formatBytes(result.readBytes)} testId="text-data-read" />
                <ToolResult label="Bits read" value={formatSig(result.bitsRead)} />
                <ToolResult
                  label="Expected UREs"
                  value={
                    <>
                      {formatSig(result.expectedUres)}
                      <span className="text-[hsl(var(--brand-ash))]"> · an average, not a chance</span>
                    </>
                  }
                  testId="text-expected-ures"
                />
                <ToolResult
                  label="Odds"
                  value={formatOdds(result.anyUre.fail, result.anyUre.survive) ?? "roughly even or worse"}
                />
                {result.secondFailure !== null ? (
                  <ToolResult
                    label="Another disk fails outright"
                    value={<Chance fail={result.secondFailure} survive={1 - result.secondFailure} />}
                    testId="text-second-failure"
                  />
                ) : null}
              </div>
            ) : null}

            {result && survivorCount === 1 ? (
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                One surviving disk is a two-disk mirror (RAID 1). The figure above applies to it unchanged: the whole
                survivor is read once to copy it.
              </p>
            ) : null}
          </ToolPanel>

          <div
            className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-5"
            data-testid="text-model-caveat"
          >
            <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
              Classic simplified model
            </div>
            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every bit read is treated as an independent trial that fails at exactly the data sheet rate, and any URE
              on a degraded RAID 5 counts as a failed rebuild. Real drives usually do much better: the data sheet
              figure is a ceiling the maker guarantees against, not a measured average; errors cluster on a few
              failing drives instead of spreading evenly; and regular scrubbing repairs weak sectors before a rebuild
              needs them. Read these numbers as a comparison between layouts and ratings, not a forecast for one
              array.
            </p>
          </div>
        </div>
      </div>

      {result ? (
        <>
          <ToolPanel title="RAID 5 against RAID 6" className="mt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-raid-levels">
                <caption className="sr-only">
                  Chance of losing at least one block during the rebuild, by RAID level and failure count
                </caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    {["Array", "Disks read", "A block is lost when", "Chance"].map((heading) => (
                      <th key={heading} scope="col" className={TH_CLASS}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.scenarios.map((s) => (
                    <tr key={s.id} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top last:border-b-0">
                      <th
                        scope="row"
                        className="py-3 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                      >
                        {s.level}
                        <span className="block text-xs text-[hsl(var(--brand-ash))]">
                          {s.arrayDisks} disks, {s.situation}
                        </span>
                      </th>
                      <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                        {survivorCount}
                      </td>
                      <td className="max-w-[260px] py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {s.lossRule}
                      </td>
                      <td
                        className="py-3 font-mono-tight text-sm"
                        data-testid={`text-chance-${s.id}`}
                      >
                        {s.applicable ? (
                          <Chance fail={s.fail} survive={s.survive} />
                        ) : (
                          <span className="text-[hsl(var(--brand-ash))]">
                            {s.level} needs at least {s.minSurvivors + (s.id === "raid6-two" ? 2 : 1)} disks
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The RAID 6 single failure figure assumes the controller reconstructs each 4 KiB sector row on its own, as
              Linux md does, so a second URE only matters if it lands on the same row. A controller that drops a whole
              disk from the set on its first read error turns that case back into the RAID 6 two-failure row.
              {result.secondFailure !== null ? (
                <>
                  {" "}
                  A second disk failing outright during the {formatDuration(result.rebuildSeconds)} rebuild (
                  {formatPercent(result.secondFailure, 1 - result.secondFailure)} at the failure rate entered) ends a
                  RAID 5 rebuild and moves RAID 6 into its two-failure row for the rest of the rebuild.
                </>
              ) : null}
            </p>
          </ToolPanel>

          <ToolPanel title="By URE rating" className="mt-6">
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The same {formatBytes(result.readBytes)} read under each data sheet class. Each factor of ten in the rating
              divides the expected error count by ten.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-ure-ratings">
                <caption className="sr-only">Rebuild risk for the same data read under each URE rating</caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    {["Rating", "Expected UREs", "RAID 5, 1 failed", "RAID 6, 1 failed"].map((heading) => (
                      <th key={heading} scope="col" className={TH_CLASS}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byRating.map((row) => {
                    const selected = row.c.exp === ureExp;
                    return (
                      <tr
                        key={row.c.exp}
                        className={`border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0 ${
                          selected ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""
                        }`}
                      >
                        <th
                          scope="row"
                          className="py-3 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                        >
                          {row.c.label}
                          {selected ? <span className="text-[hsl(var(--brand-signal))]"> · selected</span> : null}
                        </th>
                        <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
                          {formatSig(row.expected)}
                        </td>
                        <td className="py-3 pr-4 font-mono-tight text-sm">
                          {survivorCount !== null && survivorCount >= 2 ? (
                            <span className={riskTone(row.any.fail)}>{formatPercent(row.any.fail, row.any.survive)}</span>
                          ) : (
                            <span className="text-[hsl(var(--brand-ash))]">n/a</span>
                          )}
                        </td>
                        <td className="py-3 font-mono-tight text-sm">
                          {survivorCount !== null && survivorCount >= 3 ? (
                            <span className={riskTone(row.pair.fail)}>
                              {formatPercent(row.pair.fail, row.pair.survive)}
                            </span>
                          ) : (
                            <span className="text-[hsl(var(--brand-ash))]">n/a</span>
                          )}
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
