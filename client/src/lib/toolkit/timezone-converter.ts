/**
 * Time zone arithmetic on top of Intl.DateTimeFormat and the browser's copy
 * of the IANA time zone database.
 *
 * The browser can answer exactly one question about a zone: what does the
 * wall clock read at this instant. Every other fact here is built from that
 * single question. The UTC offset at an instant is the wall clock reading
 * (taken as if it were UTC) minus the instant. A local time is turned back
 * into an instant by trying the offsets in effect around it and keeping the
 * ones that round-trip. The next DST change is found by sampling the offset
 * forward in steps and then bisecting to the exact second. Nothing here
 * hard-codes a rule, so it follows whatever data the browser ships.
 *
 * A local time can map to no instant (a "gap", when clocks jump forward) or
 * to two (an "overlap", when clocks fall back). The three disambiguation
 * modes use the same names and meanings as the ECMAScript Temporal proposal:
 * "compatible" takes the earlier instant for an overlap and the later one
 * for a gap, which is what most calendar software does.
 */

import {
  addCalendarPart,
  civilToSeconds,
  clockSeconds,
  pad,
  secondsToCivil,
  addDuration,
  MAX_YEAR,
  MIN_YEAR,
  type Civil,
  type Duration,
  type ParseResult,
} from "./date-calculator";

export type Wall = Civil;

/** Zone rules are only meaningful in this span: earlier dates predate standard time in many places. */
export const MIN_ZONE_YEAR = 1900;
export const MAX_ZONE_YEAR = 2200;
/** The most zones listed at once. */
export const MAX_ZONES = 12;
export const DEFAULT_ZONES = ["UTC", "America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Tokyo"];

/** Sampling interval when scanning for an offset change. No real zone changes offset twice inside one step. */
export const SCAN_STEP_DAYS = 7;
/** How far ahead a scan looks. */
export const SCAN_HORIZON_DAYS = 1096;

/** The span of a day the planner treats as "awake but not at work". */
export const AWAKE_START_MINUTE = 7 * 60;
export const AWAKE_END_MINUTE = 22 * 60;

const FALLBACK_ZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Chicago",
  "America/Denver",
  "America/Halifax",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/St_Johns",
  "America/Toronto",
  "Asia/Dhaka",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Kolkata",
  "Asia/Manila",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tehran",
  "Asia/Tokyo",
  "Atlantic/Reykjavik",
  "Australia/Adelaide",
  "Australia/Lord_Howe",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/Dublin",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Moscow",
  "Europe/Paris",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

/* ----------------------------------------------------------- zone list */

const partsCache = new Map<string, Intl.DateTimeFormat | null>();
const nameCache = new Map<string, Intl.DateTimeFormat | null>();

function partsFormatter(zone: string): Intl.DateTimeFormat | null {
  if (partsCache.has(zone)) return partsCache.get(zone) ?? null;
  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    formatter = null;
  }
  partsCache.set(zone, formatter);
  return formatter;
}

export function isValidZone(zone: string): boolean {
  return zone !== "" && partsFormatter(zone) !== null;
}

/** The zone the browser reports for this device, or UTC when it reports nothing usable. */
export function deviceZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isValidZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

/** Every zone the browser knows, sorted, with UTC first. Falls back to a short list on old browsers. */
export function listZones(): string[] {
  let zones: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supported === "function") zones = supported.call(Intl, "timeZone");
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = FALLBACK_ZONES;
  const unique = new Set(zones.filter(isValidZone));
  unique.delete("UTC");
  return ["UTC", ...[...unique].sort()];
}

/** Zones grouped by the part before the first slash, for a grouped select. UTC sits in its own group. */
export function groupZones(zones: string[]): { region: string; zones: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    const slash = zone.indexOf("/");
    const region = zone === "UTC" ? "UTC" : slash === -1 ? "Other" : zone.slice(0, slash);
    const list = groups.get(region);
    if (list) list.push(zone);
    else groups.set(region, [zone]);
  }
  return [...groups.entries()].map(([region, list]) => ({ region, zones: list }));
}

/* ------------------------------------------- the one question we can ask */

/**
 * The wall clock reading in a zone at an instant, in whole seconds. If the
 * zone is unknown this reads the clock as UTC rather than throwing.
 */
export function wallAt(zone: string, epochSeconds: number): Wall {
  const formatter = partsFormatter(zone);
  if (!formatter) return secondsToCivil(epochSeconds);
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return secondsToCivil(epochSeconds);

  const wall: Wall = { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  for (const part of formatter.formatToParts(date)) {
    const value = Number(part.value);
    switch (part.type) {
      case "year":
        wall.year = value;
        break;
      case "month":
        wall.month = value;
        break;
      case "day":
        wall.day = value;
        break;
      case "hour":
        wall.hour = value % 24;
        break;
      case "minute":
        wall.minute = value;
        break;
      case "second":
        wall.second = value;
        break;
    }
  }
  return wall;
}

/** Seconds east of UTC in effect at an instant. */
export function offsetSeconds(zone: string, epochSeconds: number): number {
  if (zone === "UTC") return 0;
  return civilToSeconds(wallAt(zone, epochSeconds)) - epochSeconds;
}

/** `+05:30`, `-04:00`, and `+00:00`. Seconds appear only for the odd historical offset that has them. */
export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const base = `${sign}${pad(Math.floor(abs / 3600))}:${pad(Math.floor((abs % 3600) / 60))}`;
  return abs % 60 === 0 ? base : `${base}:${pad(abs % 60)}`;
}

/** The browser's name for the zone at an instant: "PDT" or "Pacific Daylight Time". Often "GMT+9" when no short name exists. */
export function zoneName(zone: string, epochSeconds: number, style: "short" | "long"): string {
  const key = `${zone}|${style}`;
  let formatter = nameCache.get(key);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: style });
    } catch {
      formatter = null;
    }
    nameCache.set(key, formatter);
  }
  if (!formatter) return zone;
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return zone;
  const part = formatter.formatToParts(date).find((p) => p.type === "timeZoneName");
  return part ? part.value : zone;
}

export function wallInZoneRange(wall: Wall): boolean {
  return wall.year >= MIN_ZONE_YEAR && wall.year <= MAX_ZONE_YEAR;
}

/* ---------------------------------------------- wall time to an instant */

export type WallKind = "normal" | "ambiguous" | "gap";
export type Disambiguation = "compatible" | "earlier" | "later";

export interface Transition {
  /** The first second at the new offset. */
  epoch: number;
  /** Offsets in seconds east of UTC before and after. */
  before: number;
  after: number;
  beforeName: string;
  afterName: string;
  /** The wall clock reading at the instant of change, read at the old offset. */
  localBefore: Wall;
  /** The wall clock reading at the instant of change, read at the new offset. */
  localAfter: Wall;
  /** after - before, in seconds. Positive means clocks go forward. */
  shift: number;
}

export interface Resolution {
  kind: WallKind;
  /**
   * One instant for a normal time. Two, earlier first, for an overlap. For a
   * gap, the two instants the reading lands on when taken at the offset on
   * each side of the change, earlier first.
   */
  candidates: number[];
  /** The offset change responsible, when the time is in a gap or overlap. */
  transition: Transition | null;
}

/**
 * The instants at which a zone's wall clock reads the given time.
 *
 * Reading the time as UTC gives a first guess. Subtracting each offset seen
 * within a day either side of it gives candidate instants, and a candidate
 * is real only if the zone's offset at that instant is the offset used.
 */
export function resolveWall(zone: string, wall: Wall): Resolution {
  const asUtc = civilToSeconds(wall);
  if (zone === "UTC") return { kind: "normal", candidates: [asUtc], transition: null };

  const earlier = offsetSeconds(zone, asUtc - 86400);
  const here = offsetSeconds(zone, asUtc);
  const later = offsetSeconds(zone, asUtc + 86400);

  const valid: number[] = [];
  for (const offset of new Set([earlier, here, later])) {
    const epoch = asUtc - offset;
    if (offsetSeconds(zone, epoch) === offset) valid.push(epoch);
  }
  valid.sort((a, b) => a - b);

  if (valid.length === 1) return { kind: "normal", candidates: valid, transition: null };

  if (valid.length >= 2) {
    const pair = [valid[0], valid[valid.length - 1]];
    return { kind: "ambiguous", candidates: pair, transition: nextTransition(zone, pair[0], 3) };
  }

  // No instant has this reading. Taking it at the new offset lands before the
  // change and taking it at the old offset lands after it.
  const pair = [asUtc - later, asUtc - earlier].sort((a, b) => a - b);
  return { kind: "gap", candidates: pair, transition: nextTransition(zone, pair[0], 3) };
}

export function chooseInstant(resolution: Resolution, mode: Disambiguation): number {
  const { kind, candidates } = resolution;
  if (kind === "normal" || candidates.length === 1) return candidates[0];
  if (kind === "ambiguous") return mode === "later" ? candidates[1] : candidates[0];
  return mode === "earlier" ? candidates[0] : candidates[1];
}

export interface Instant {
  epoch: number;
  kind: WallKind;
  /** The offset in effect at that instant. */
  offset: number;
}

/** The instant a wall clock reading means in a zone, with the rule used when it is skipped or repeated. */
export function instantOf(zone: string, wall: Wall, mode: Disambiguation = "compatible"): Instant {
  const resolution = resolveWall(zone, wall);
  const epoch = chooseInstant(resolution, mode);
  return { epoch, kind: resolution.kind, offset: offsetSeconds(zone, epoch) };
}

/* ------------------------------------------------------ offset changes */

/**
 * The next time after an instant that the zone's UTC offset changes, or null
 * when none occurs within the horizon. The offset is sampled every
 * SCAN_STEP_DAYS and, once two samples differ, bisected to the exact second.
 */
export function nextTransition(zone: string, fromEpoch: number, horizonDays = SCAN_HORIZON_DAYS): Transition | null {
  if (zone === "UTC") return null;
  const step = SCAN_STEP_DAYS * 86400;
  const end = fromEpoch + horizonDays * 86400;

  let lo = fromEpoch;
  let loOffset = offsetSeconds(zone, lo);
  for (let probe = fromEpoch + step; ; probe += step) {
    const hi = Math.min(probe, end);
    const hiOffset = offsetSeconds(zone, hi);
    if (hiOffset !== loOffset) {
      let a = lo;
      let b = hi;
      while (b - a > 1) {
        const mid = Math.floor((a + b) / 2);
        if (offsetSeconds(zone, mid) === loOffset) a = mid;
        else b = mid;
      }
      const after = offsetSeconds(zone, b);
      return {
        epoch: b,
        before: loOffset,
        after,
        beforeName: zoneName(zone, b - 1, "short"),
        afterName: zoneName(zone, b, "short"),
        localBefore: secondsToCivil(b + loOffset),
        localAfter: secondsToCivil(b + after),
        shift: after - loOffset,
      };
    }
    if (hi >= end) return null;
    lo = hi;
    loOffset = hiOffset;
  }
}

/** "1 hour", "30 minutes", "1 hour 30 minutes". */
export function describeShift(seconds: number): string {
  const abs = Math.abs(seconds);
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const rest = abs % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? "second" : "seconds"}`);
  return parts.join(" ") || "0 minutes";
}

/* ------------------------------------------------------ zone formatting */

/** `YYYY-MM-DDTHH:MM:SS+hh:mm`, an ISO 8601 date and time with the offset spelled out. */
export function isoWithOffset(wall: Wall, offset: number): string {
  const date = `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`;
  return `${date}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}${formatOffset(offset)}`;
}

/** Calendar days from one wall clock reading's date to another's. */
export function dayDifference(from: Wall, to: Wall): number {
  return Math.floor(civilToSeconds(to) / 86400) - Math.floor(civilToSeconds(from) / 86400);
}

/* --------------------------------------------------------- meeting grid */

export type HourState = "work" | "awake" | "night";

export interface WorkHours {
  /** First working hour, 0 to 23. */
  start: number;
  /** Hour work ends, 1 to 24. Work runs up to but not including it. */
  end: number;
}

export function validWorkHours(hours: WorkHours): boolean {
  return Number.isInteger(hours.start) && Number.isInteger(hours.end) && hours.start >= 0 && hours.end <= 24 && hours.start < hours.end;
}

export function classifyMinute(minuteOfDay: number, hours: WorkHours): HourState {
  if (minuteOfDay >= hours.start * 60 && minuteOfDay < hours.end * 60) return "work";
  if (minuteOfDay >= AWAKE_START_MINUTE && minuteOfDay < AWAKE_END_MINUTE) return "awake";
  return "night";
}

export interface GridCell {
  epoch: number;
  wall: Wall;
  state: HourState;
}

export interface GridRow {
  zone: string;
  cells: GridCell[];
}

/** One row per zone and one column per consecutive hour from startEpoch, each classified by local time of day. */
export function buildGrid(zones: string[], startEpoch: number, columns: number, hours: WorkHours): GridRow[] {
  return zones.map((zone) => ({
    zone,
    cells: Array.from({ length: columns }, (_, column) => {
      const epoch = startEpoch + column * 3600;
      const wall = wallAt(zone, epoch);
      return { epoch, wall, state: classifyMinute(wall.hour * 60 + wall.minute, hours) };
    }),
  }));
}

/** For each column, whether every zone is inside working hours. */
export function overlapFlags(rows: GridRow[]): boolean[] {
  if (rows.length === 0) return [];
  return rows[0].cells.map((_, column) => rows.every((row) => row.cells[column].state === "work"));
}

/** Contiguous runs of true flags as inclusive column ranges. */
export function flagRuns(flags: boolean[]): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = [];
  let from = -1;
  flags.forEach((flag, index) => {
    if (flag && from === -1) from = index;
    if (!flag && from !== -1) {
      runs.push({ from, to: index - 1 });
      from = -1;
    }
  });
  if (from !== -1) runs.push({ from, to: flags.length - 1 });
  return runs;
}

/** The column where the most zones are inside working hours, and how many. The first such column wins a tie. */
export function bestCoverage(rows: GridRow[]): { column: number; count: number } {
  let best = { column: 0, count: -1 };
  const columns = rows[0]?.cells.length ?? 0;
  for (let column = 0; column < columns; column++) {
    const count = rows.filter((row) => row.cells[column].state === "work").length;
    if (count > best.count) best = { column, count };
  }
  return best.count < 0 ? { column: 0, count: 0 } : best;
}

/* ------------------------------------------- zone-aware date arithmetic */

export interface ZonedSpan {
  /** Seconds from the first instant to the second, negative when the second is earlier. */
  seconds: number;
  first: Instant;
  second: Instant;
}

/** Elapsed seconds between two wall clock readings in a zone. Differs from the clock difference across a DST change. */
export function zonedElapsed(zone: string, first: Wall, second: Wall, mode: Disambiguation = "compatible"): ZonedSpan {
  const a = instantOf(zone, first, mode);
  const b = instantOf(zone, second, mode);
  return { seconds: b.epoch - a.epoch, first: a, second: b };
}

export interface ZonedAdd {
  wall: Wall;
  epoch: number;
  offset: number;
  /** Whether the calendar step landed on a skipped or repeated time that had to be resolved. */
  kind: WallKind;
  clamped: boolean;
  requestedDay: number;
}

/**
 * Add or subtract a duration in a zone, the way Temporal's ZonedDateTime
 * does. Years, months, weeks and days move the wall clock on the calendar, so
 * 09:00 stays 09:00 across a DST change. Hours, minutes and seconds are
 * exact time on the instant timeline, so adding 24 hours across a change of
 * an hour does not land on the same wall clock time.
 */
export function addInZone(
  zone: string,
  wall: Wall,
  sign: 1 | -1,
  duration: Duration,
  mode: Disambiguation = "compatible",
): ParseResult<ZonedAdd> {
  if (zone === "UTC") {
    const result = addDuration(wall, sign, duration);
    if (!result.ok) return result;
    return {
      ok: true,
      value: {
        wall: result.value.civil,
        epoch: civilToSeconds(result.value.civil),
        offset: 0,
        kind: "normal",
        clamped: result.value.clamped,
        requestedDay: result.value.requestedDay,
      },
    };
  }

  const step = addCalendarPart(wall, sign, duration);
  if (step.civil.year < MIN_ZONE_YEAR - 1 || step.civil.year > MAX_ZONE_YEAR + 1) {
    return { ok: false, message: zoneRangeMessage() };
  }
  const resolved = resolveWall(zone, step.civil);
  const calendarEpoch = chooseInstant(resolved, mode);
  const epoch = calendarEpoch + sign * clockSeconds(duration);
  const result = wallAt(zone, epoch);
  if (!wallInZoneRange(result)) return { ok: false, message: zoneRangeMessage() };
  return {
    ok: true,
    value: {
      wall: result,
      epoch,
      offset: offsetSeconds(zone, epoch),
      kind: resolved.kind,
      clamped: step.clamped,
      requestedDay: step.requestedDay,
    },
  };
}

export function zoneRangeMessage(): string {
  return `Zone rules are available for years ${MIN_ZONE_YEAR} to ${MAX_ZONE_YEAR}. Choose UTC to work with years ${MIN_YEAR} to ${MAX_YEAR}.`;
}
