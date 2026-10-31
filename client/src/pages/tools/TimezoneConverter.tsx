/**
 * Time zone converter and meeting planner.
 *
 * One instant is the source of truth. The reader types a wall clock reading
 * in a source zone, that reading is resolved to an instant (which is where
 * skipped and repeated local times get settled), and every other view, the
 * converted table, the meeting grid and the next-change list, is read back
 * from that instant. All zone knowledge comes from the browser's IANA data
 * through Intl.DateTimeFormat; see lib/toolkit/timezone-converter for how.
 */

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { pad, parseCivil, toInputValue, weekdayName, ymdString, type Civil } from "@/lib/toolkit/date-calculator";
import {
  DEFAULT_ZONES,
  MAX_ZONES,
  MAX_ZONE_YEAR,
  MIN_ZONE_YEAR,
  AWAKE_END_MINUTE,
  AWAKE_START_MINUTE,
  SCAN_HORIZON_DAYS,
  bestCoverage,
  buildGrid,
  chooseInstant,
  dayDifference,
  describeShift,
  deviceZone,
  flagRuns,
  formatOffset,
  groupZones,
  instantOf,
  isoWithOffset,
  listZones,
  nextTransition,
  offsetSeconds,
  overlapFlags,
  resolveWall,
  validWorkHours,
  wallAt,
  wallInZoneRange,
  zoneName,
  type Disambiguation,
  type HourState,
  type Resolution,
  type Transition,
  type Wall,
} from "@/lib/toolkit/timezone-converter";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "block font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none [color-scheme:dark] [.light_&]:[color-scheme:light]";
const SELECT_CLASS =
  "mt-3 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const NOTE_CLASS =
  "break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]";

const EXAMPLES: { label: string; zone: string; value: string }[] = [
  { label: "Skipped hour, New York", zone: "America/New_York", value: "2026-03-08T02:30" },
  { label: "Repeated hour, New York", zone: "America/New_York", value: "2026-11-01T01:30" },
  { label: "London clocks go back", zone: "Europe/London", value: "2026-10-25T01:30" },
  { label: "Skipped day, Samoa", zone: "Pacific/Apia", value: "2011-12-30T12:00" },
];

const MODES: { value: Disambiguation; label: string }[] = [
  { value: "compatible", label: "Usual rule: first of a repeated time, shifted forward for a skipped one" },
  { value: "earlier", label: "Always the earlier instant" },
  { value: "later", label: "Always the later instant" },
];

const STATE_CLASS: Record<HourState, string> = {
  work: "bg-[hsl(var(--brand-signal)/0.28)] text-[hsl(var(--brand-bone))]",
  awake: "bg-[hsl(var(--brand-amber)/0.16)] text-[hsl(var(--brand-bone-dim))]",
  night: "text-[hsl(var(--brand-ash))]",
};
const STATE_WORD: Record<HourState, string> = { work: "working hours", awake: "awake", night: "night" };

function nowInputValue(zone: string): string {
  const wall = wallAt(zone, Math.floor(Date.now() / 1000));
  return toInputValue({ ...wall, second: 0 });
}

function hm(wall: { hour: number; minute: number; second?: number }, seconds = false): string {
  return `${pad(wall.hour)}:${pad(wall.minute)}${seconds ? `:${pad(wall.second ?? 0)}` : ""}`;
}

function dateLabel(wall: Civil): string {
  return `${weekdayName(wall.year, wall.month, wall.day).slice(0, 3)} ${ymdString(wall)}`;
}

function dayWord(diff: number): string {
  if (diff === 0) return "same day";
  if (diff === 1) return "next day";
  if (diff === -1) return "previous day";
  return `${diff > 0 ? "+" : ""}${diff} days`;
}

function daysAway(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  if (days < 1) return "within a day";
  return days === 1 ? "in 1 day" : `in ${days.toLocaleString("en-US")} days`;
}

function hourOption(hour: number): string {
  return `${pad(hour)}:00`;
}

/** What a change in offset does to the clock, in the zone's own words. */
function describeTransition(t: Transition): { headline: string; detail: string; effect: string } {
  const forward = t.shift > 0;
  return {
    headline: `${dateLabel(t.localBefore)}, ${hm(t.localBefore)} ${t.beforeName} becomes ${hm(t.localAfter)} ${t.afterName}`,
    detail: `Clocks go ${forward ? "forward" : "back"} ${describeShift(t.shift)}. Offset ${formatOffset(t.before)} to ${formatOffset(t.after)}.`,
    effect: forward
      ? `Local times from ${hm(t.localBefore)} up to ${hm(t.localAfter)} do not exist that day.`
      : `Local times from ${hm(t.localAfter)} up to ${hm(t.localBefore)} happen twice that day.`,
  };
}

/** Explains a typed time that falls in a DST gap or overlap, with both instants spelled out. */
function AmbiguityNote({
  resolution,
  wall,
  zone,
  mode,
}: {
  resolution: Resolution;
  wall: Wall;
  zone: string;
  mode: Disambiguation;
}) {
  const t = resolution.transition;
  const seconds = wall.second !== 0;
  const [first, second] = resolution.candidates;
  const local = (instant: number) => `${hm(wallAt(zone, instant), seconds)} ${zoneName(zone, instant, "short")}`;
  const utc = (instant: number) => `${hm(wallAt("UTC", instant), seconds)} UTC`;
  const chosen = chooseInstant(resolution, mode);
  const rule = mode === "compatible" ? "usual rule" : mode === "earlier" ? "earlier instant" : "later instant";
  const gap = resolution.kind === "gap";

  let what: string;
  if (gap) {
    what = t
      ? `At ${hm(t.localBefore)} ${t.beforeName} (${utc(t.epoch)}) clocks jump to ${hm(t.localAfter)} ${t.afterName}, so every reading from ${hm(t.localBefore)} up to ${hm(t.localAfter)} never appears on a wall clock there.`
      : "Clocks jump forward across it.";
  } else {
    what = t
      ? `At ${hm(t.localBefore)} ${t.beforeName} (${utc(t.epoch)}) clocks fall back to ${hm(t.localAfter)} ${t.afterName}, so every reading from ${hm(t.localAfter)} up to ${hm(t.localBefore)} appears once on each side of the change.`
      : "Clocks fall back across it.";
  }

  return (
    <div role="status" data-testid="note-ambiguity" className={NOTE_CLASS}>
      <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
        {gap ? "This time does not exist" : "This time happens twice"}
      </div>
      <p className="mt-2">
        {hm(wall, seconds)} on {ymdString(wall)} {gap ? "is skipped" : "happens twice"} in {zone}. {what}
      </p>
      <ul className="mt-3 space-y-1">
        <li>
          Earlier instant: {local(first)}, which is {utc(first)}
        </li>
        <li>
          Later instant: {local(second)}, which is {utc(second)}
        </li>
      </ul>
      <p className="mt-3">
        The table below uses the {rule}: {local(chosen)}, {utc(chosen)}. Write the offset down with the time, for example{" "}
        {isoWithOffset(wallAt(zone, chosen), offsetSeconds(zone, chosen))}, so nobody has to guess which one was meant.
      </p>
    </div>
  );
}

export function TimezoneConverter() {
  const zoneChoices = useMemo(() => {
    const device = deviceZone();
    const all = listZones();
    return all.includes(device) ? all : [...all, device].sort();
  }, []);
  const groups = useMemo(() => groupZones(zoneChoices), [zoneChoices]);

  const [fromZone, setFromZone] = useState<string>(() => deviceZone());
  const [text, setText] = useState<string>(() => nowInputValue(deviceZone()));
  const [mode, setMode] = useState<Disambiguation>("compatible");
  const [zones, setZones] = useState<string[]>(() => DEFAULT_ZONES.slice());
  const [pick, setPick] = useState("");
  const [workStart, setWorkStart] = useState(9);
  const [workEnd, setWorkEnd] = useState(17);

  /* ----------------------------------------------------------- the input */

  const parsed = useMemo(() => (text.trim() === "" ? null : parseCivil(text)), [text]);
  const wall: Wall | null = parsed && parsed.ok ? parsed.value : null;
  const rangeError =
    wall && !wallInZoneRange(wall)
      ? `This tool covers years ${MIN_ZONE_YEAR} to ${MAX_ZONE_YEAR}. Earlier dates predate standardized time zones in many places, and later ones depend on rules that governments will probably change.`
      : null;
  const usable = wall && !rangeError ? wall : null;
  const inputError = parsed && !parsed.ok ? parsed.message : rangeError;

  const resolution = useMemo(() => (usable ? resolveWall(fromZone, usable) : null), [usable, fromZone]);
  const epoch = resolution ? chooseInstant(resolution, mode) : null;

  const rowZones = useMemo(() => [fromZone, ...zones.filter((z) => z !== fromZone)], [fromZone, zones]);

  const sourceWall = useMemo(() => (epoch !== null ? wallAt(fromZone, epoch) : null), [epoch, fromZone]);

  const rows = useMemo(() => {
    if (epoch === null || !sourceWall) return [];
    return rowZones.map((zone) => {
      const local = wallAt(zone, epoch);
      const offset = offsetSeconds(zone, epoch);
      return {
        zone,
        local,
        offset,
        short: zoneName(zone, epoch, "short"),
        long: zoneName(zone, epoch, "long"),
        dayDiff: dayDifference(sourceWall, local),
        iso: isoWithOffset(local, offset),
      };
    });
  }, [epoch, rowZones, sourceWall]);

  const transitions = useMemo(
    () => (epoch === null ? [] : rowZones.map((zone) => nextTransition(zone, epoch))),
    [epoch, rowZones],
  );

  /* --------------------------------------------------------- the planner */

  const hoursValid = validWorkHours({ start: workStart, end: workEnd });
  const hoursStart = hoursValid ? workStart : 9;
  const hoursEnd = hoursValid ? workEnd : 17;

  const plan = useMemo(() => {
    if (epoch === null || !sourceWall) return null;
    const midnight = instantOf(fromZone, { ...sourceWall, hour: 0, minute: 0, second: 0 }).epoch;
    const grid = buildGrid(rowZones, midnight, 24, { start: hoursStart, end: hoursEnd });
    const flags = overlapFlags(grid);
    const runs = flagRuns(flags).map((run) => {
      const startEpoch = grid[0].cells[run.from].epoch;
      const endEpoch = grid[0].cells[run.to].epoch + 3600;
      return {
        run,
        source: `${hm(wallAt(fromZone, startEpoch))} to ${hm(wallAt(fromZone, endEpoch))}`,
        utc: `${hm(wallAt("UTC", startEpoch))} to ${hm(wallAt("UTC", endEpoch))}`,
      };
    });
    const best = bestCoverage(grid);
    const selected = Math.max(0, Math.min(23, Math.floor((epoch - midnight) / 3600)));
    return { grid, flags, runs, best, selected };
  }, [epoch, sourceWall, rowZones, fromZone, hoursStart, hoursEnd]);

  /* ----------------------------------------------------------- the copy */

  const summary =
    rows.length > 0
      ? rows
          .map((row) => `${row.zone.padEnd(26)} ${dateLabel(row.local)} ${hm(row.local, row.local.second !== 0)}  ${formatOffset(row.offset)}  ${row.short}`)
          .join("\n")
      : "";
  const isoSummary = rows.map((row) => `${row.zone}: ${row.iso}`).join("\n");

  const canAdd = pick !== "" && !rowZones.includes(pick) && rowZones.length < MAX_ZONES;

  function addZone() {
    if (!canAdd) return;
    setZones([...zones, pick]);
    setPick("");
  }

  const errorId = "tz-input-message";

  return (
    <ToolShell slug="timezone-converter">
      <div className="space-y-6">
        <ToolPanel title="Source time">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="tz-datetime" className={LABEL_CLASS}>
                Date and time
              </label>
              <input
                id="tz-datetime"
                type="datetime-local"
                value={text}
                min={`${MIN_ZONE_YEAR}-01-01T00:00`}
                max={`${MAX_ZONE_YEAR}-12-31T23:59`}
                onChange={(event) => setText(event.target.value)}
                aria-invalid={inputError !== null}
                aria-describedby={errorId}
                data-testid="input-datetime"
                className={INPUT_CLASS}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="tz-from" className={LABEL_CLASS}>
                In this time zone
              </label>
              <select
                id="tz-from"
                value={fromZone}
                onChange={(event) => setFromZone(event.target.value)}
                data-testid="select-from-zone"
                className={SELECT_CLASS}
              >
                {groups.map((group) => (
                  <optgroup key={group.region} label={group.region}>
                    {group.zones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {inputError ? (
            <p
              id={errorId}
              role="alert"
              data-testid="text-datetime-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{inputError}</span>
            </p>
          ) : (
            <p id={errorId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Zone rules come from this browser's copy of the IANA time zone database, so results follow whatever
              rules your browser ships. Years {MIN_ZONE_YEAR} to {MAX_ZONE_YEAR} are supported.
            </p>
          )}

          <div className="mt-5">
            <label htmlFor="tz-mode" className={LABEL_CLASS}>
              If the time is skipped or repeated
            </label>
            <select
              id="tz-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as Disambiguation)}
              data-testid="select-disambiguation"
              className={`${SELECT_CLASS} md:max-w-[640px]`}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setText(nowInputValue(fromZone))}
              data-testid="button-now"
              className={CHIP_CLASS}
            >
              Use the current time
            </button>
            <span className="ml-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setFromZone(example.zone);
                  setText(example.value);
                }}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>
        </ToolPanel>

        {resolution && resolution.kind !== "normal" && usable ? (
          <AmbiguityNote resolution={resolution} wall={usable} zone={fromZone} mode={mode} />
        ) : null}

        {rows.length > 0 && epoch !== null ? (
          <ToolPanel title="Converted times">
            <div className="relative overflow-x-auto" data-testid="output-converted">
              <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-converted">
                <caption className="sr-only">The chosen moment as the local time in each listed zone</caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      Zone
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Local time
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      UTC offset
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Name
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Day
                    </th>
                    <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.zone} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                      <th scope="row" className="py-3 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                        <span className="break-all">{row.zone}</span>
                        {index === 0 ? " " : null}
                        {index === 0 ? (
                          <span className="ml-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                            source
                          </span>
                        ) : null}
                      </th>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        <span className="text-[hsl(var(--brand-ash))]">{dateLabel(row.local)}</span>{" "}
                        {hm(row.local, row.local.second !== 0)}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {formatOffset(row.offset)}
                      </td>
                      <td className="py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        <span className="text-sm text-[hsl(var(--brand-bone))]">{row.short}</span>
                        <br />
                        {row.long}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {dayWord(row.dayDiff)}
                      </td>
                      <td className="py-2 text-right">
                        {index === 0 ? null : (
                          <button
                            type="button"
                            onClick={() => setZones(zones.filter((z) => z !== row.zone))}
                            aria-label={`Remove ${row.zone}`}
                            data-testid={`button-remove-${row.zone.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                            className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1 sm:max-w-[360px]">
                <label htmlFor="tz-add" className={LABEL_CLASS}>
                  Add a zone ({rowZones.length} of {MAX_ZONES})
                </label>
                <select
                  id="tz-add"
                  value={pick}
                  onChange={(event) => setPick(event.target.value)}
                  data-testid="select-add-zone"
                  className={SELECT_CLASS}
                >
                  <option value="">Choose a zone</option>
                  {groups.map((group) => (
                    <optgroup key={group.region} label={group.region}>
                      {group.zones
                        .filter((zone) => !rowZones.includes(zone))
                        .map((zone) => (
                          <option key={zone} value={zone}>
                            {zone}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={addZone}
                disabled={!canAdd}
                data-testid="button-add-zone"
                className={`${CHIP_CLASS} mb-0 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Add zone
              </button>
              <CopyButton value={summary} label="Copy the converted times" testId="button-copy-times">
                <span>Copy times</span>
              </CopyButton>
              <CopyButton value={isoSummary} label="Copy the times in ISO 8601 form" testId="button-copy-iso">
                <span>Copy ISO 8601</span>
              </CopyButton>
            </div>
            <p className="mt-4 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Names are the browser's own. Where it has no common abbreviation it shows an offset such as GMT+9, and
              abbreviations are not unique: CST can mean Central Standard, China Standard or Cuba Standard Time. The
              offset is the part to rely on.
            </p>
          </ToolPanel>
        ) : null}

        {plan && sourceWall ? (
          <ToolPanel title="Meeting planner">
            <p className="max-w-3xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Twenty-four consecutive hours starting at midnight on {dateLabel(sourceWall)} in {fromZone}. Each cell is
              the local hour in that row's zone.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:max-w-[520px]">
              <div>
                <label htmlFor="tz-work-start" className={LABEL_CLASS}>
                  Work starts
                </label>
                <select
                  id="tz-work-start"
                  value={workStart}
                  onChange={(event) => setWorkStart(Number(event.target.value))}
                  data-testid="select-work-start"
                  className={SELECT_CLASS}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourOption(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tz-work-end" className={LABEL_CLASS}>
                  Work ends
                </label>
                <select
                  id="tz-work-end"
                  value={workEnd}
                  onChange={(event) => setWorkEnd(Number(event.target.value))}
                  data-testid="select-work-end"
                  className={SELECT_CLASS}
                >
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {hourOption(h)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!hoursValid ? (
              <p role="alert" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                Work has to end after it starts. The grid is using 09:00 to 17:00 until that is fixed.
              </p>
            ) : null}

            <div className="relative mt-5 overflow-x-auto pb-1">
              <table className="w-full min-w-[980px] border-collapse text-center" data-testid="table-planner">
                <caption className="sr-only">
                  Local hour in each zone for 24 hours from midnight in {fromZone}, marked as working hours, awake or night
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-[hsl(var(--brand-graphite))] py-2 pr-3 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
                    >
                      {fromZone} hour
                    </th>
                    {plan.grid[0].cells.map((cell, column) => (
                      <th
                        key={column}
                        scope="col"
                        aria-current={column === plan.selected ? "time" : undefined}
                        className={`px-1 py-2 font-mono-tight text-[0.625rem] font-normal ${
                          column === plan.selected ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-ash))]"
                        }`}
                      >
                        {pad(cell.wall.hour)}
                        {cell.wall.minute ? `:${pad(cell.wall.minute)}` : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.grid.map((row) => (
                    <tr key={row.zone}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-[hsl(var(--brand-graphite))] py-1 pr-3 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]"
                      >
                        <span className="whitespace-nowrap">{row.zone}</span>
                      </th>
                      {row.cells.map((cell, column) => {
                        const diff = dayDifference(plan.grid[0].cells[column].wall, cell.wall);
                        return (
                          <td
                            key={column}
                            className={`h-10 border border-[hsl(var(--brand-iron)/0.5)] px-1 font-mono-tight text-xs ${STATE_CLASS[cell.state]} ${
                              column === plan.selected ? "border-x-2 border-x-[hsl(var(--brand-bone)/0.8)]" : ""
                            }`}
                          >
                            {cell.wall.hour}
                            {cell.wall.minute ? `:${pad(cell.wall.minute)}` : ""}
                            {diff !== 0 ? (
                              <span className="block text-[0.625rem] leading-none text-[hsl(var(--brand-ash))]">
                                {diff > 0 ? "+" : ""}
                                {diff}d
                              </span>
                            ) : null}
                            <span className="sr-only"> {STATE_WORD[cell.state]}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-[hsl(var(--brand-graphite))] py-2 pr-3 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-signal))]"
                    >
                      Everyone at work
                    </th>
                    {plan.flags.map((flag, column) => (
                      <td key={column} className="py-2 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                        <span aria-hidden="true">{flag ? "●" : ""}</span>
                        <span className="sr-only">{flag ? "all zones in working hours" : "not all zones in working hours"}</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-[hsl(var(--brand-signal)/0.5)]" />
                Working hours
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm bg-[hsl(var(--brand-amber)/0.4)]" />
                Awake, {hm({ hour: AWAKE_START_MINUTE / 60, minute: 0 })} to {hm({ hour: AWAKE_END_MINUTE / 60, minute: 0 })}
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm border border-[hsl(var(--brand-iron))]" />
                Night
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block h-3 w-3 border-x-2 border-[hsl(var(--brand-bone)/0.8)]" />
                The chosen moment
              </li>
            </ul>

            <div className="mt-5" data-testid="output-overlap">
              <div className={LABEL_CLASS}>Overlap</div>
              {plan.runs.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {plan.runs.map(({ run, source, utc }) => (
                    <li
                      key={run.from}
                      className="break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]"
                    >
                      {source} in {fromZone}, which is {utc} UTC
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  No hour of this day is inside working hours in all {plan.grid.length} zones. The most that overlap is{" "}
                  {plan.best.count} of {plan.grid.length}, starting at{" "}
                  {hm(plan.grid[0].cells[plan.best.column].wall)} in {fromZone}.
                </p>
              )}
            </div>
          </ToolPanel>
        ) : null}

        {rows.length > 0 && epoch !== null ? (
          <ToolPanel title="Next offset change">
            <p className="max-w-3xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Found by sampling each zone's UTC offset forward from the chosen moment and then narrowing to the exact
              second. The scan looks {Math.round(SCAN_HORIZON_DAYS / 365)} years ahead in this browser's data, so a rule
              change your browser does not know about yet will not appear.
            </p>
            <div className="relative mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left" data-testid="table-transitions">
                <caption className="sr-only">The next change in UTC offset for each listed zone</caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      Zone
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Offset now
                    </th>
                    <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      Next change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const t = transitions[index];
                    const info = t ? describeTransition(t) : null;
                    return (
                      <tr key={row.zone} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th scope="row" className="py-3 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                          <span className="break-all">{row.zone}</span>
                        </th>
                        <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {formatOffset(row.offset)} {row.short}
                        </td>
                        <td className="py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {t && info ? (
                            <>
                              <span className="block text-sm text-[hsl(var(--brand-bone))]">{info.headline}</span>
                              <span className="block">{info.detail}</span>
                              <span className="block">{info.effect}</span>
                              <span className="block text-[hsl(var(--brand-ash))]">
                                {hm(wallAt("UTC", t.epoch), true)} UTC on {ymdString(wallAt("UTC", t.epoch))}, {daysAway(t.epoch - epoch)}
                              </span>
                            </>
                          ) : (
                            <span>No change in the next {Math.round(SCAN_HORIZON_DAYS / 365)} years.</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
