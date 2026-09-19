/**
 * systemd's start rate limiter, simulated rather than solved.
 *
 * The primary model here walks the unit's life one start at a time and asks
 * the rate limiter about each, exactly as src/basic/ratelimit.c would. That is
 * deliberate: the closed form is short enough to be tempting and wrong in a
 * way that is hard to see, because the window resets rather than slides.
 *
 * The closed form, for the record, and the gate checks it against the walk:
 * with a constant cycle of crash time plus RestartSec, the attempt that would
 * be refused is the one at burst x cycle after the window opened, and it is
 * refused only if that lands at or before the end of the interval. So the
 * limit trips exactly when burst x cycle <= interval. A unit whose cycle is
 * long enough that the burst does not fit inside one interval resets the
 * counter on its way past and can crash forever.
 */

import type { Attempt, Case, Ending, Option, Setup } from "./types";

/** systemd.unit(5): DefaultStartLimitIntervalSec, as shipped. */
export const DEFAULT_INTERVAL_MS = 10_000;
/** systemd.unit(5): DefaultStartLimitBurst, as shipped. */
export const DEFAULT_BURST = 5;
/** systemd.service(5): RestartSec= when nothing sets it. */
export const DEFAULT_RESTART_SEC_MS = 100;
/** How far the walk goes before calling a loop endless. */
export const WALK_LIMIT = 10_000;

/** Whether the limiter is switched on at all. Either zero turns it off. */
export const limitEnabled = (setup: Setup): boolean => setup.burst > 0 && setup.intervalMs > 0;

/** Whether the policy asks for a restart after this exit. */
export function restarts(setup: Setup): boolean {
  if (setup.crashAfterMs === null) return false;
  if (setup.restart === "no") return false;
  if (setup.restart === "always") return true;
  return setup.exitCode !== 0;
}

/** One start to the next, in milliseconds: the crash, then RestartSec. */
export const cycleMs = (setup: Setup): number | null =>
  setup.crashAfterMs === null ? null : setup.crashAfterMs + setup.restartSecMs;

/**
 * Every start attempt, in order, with the limiter's verdict on each.
 *
 * The last entry is the refused one when the limit trips. When it does not,
 * the walk stops at WALK_LIMIT attempts and the caller reads that as endless.
 */
export function attempts(setup: Setup): Attempt[] {
  const out: Attempt[] = [];
  const cycle = cycleMs(setup);
  let windowBegan = -1;
  let count = 0;
  let at = 0;

  for (let i = 0; i < WALK_LIMIT; i += 1) {
    /* ratelimit_below(), transcribed. */
    let allowed: boolean;
    if (!limitEnabled(setup)) {
      allowed = true;
    } else if (windowBegan < 0 || at - windowBegan > setup.intervalMs) {
      windowBegan = at;
      count = 1;
      allowed = true;
    } else if (count < setup.burst) {
      count += 1;
      allowed = true;
    } else {
      allowed = false;
    }

    out.push({ atMs: at, allowed, windowBeganMs: Math.max(0, windowBegan), countInWindow: count });
    if (!allowed) return out;
    if (cycle === null || !restarts(setup)) return out;
    at += cycle;
  }
  return out;
}

/** Starts that actually ran the service, which excludes a refused attempt. */
export const startsBeforeFailing = (setup: Setup): number => attempts(setup).filter((a) => a.allowed).length;

/** When a start is refused, in milliseconds from the first start, or null. */
export function givesUpAtMs(setup: Setup): number | null {
  const refused = attempts(setup).find((a) => !a.allowed);
  return refused ? refused.atMs : null;
}

/** Whether the limiter ever refuses a start. */
export const rateLimited = (setup: Setup): boolean => givesUpAtMs(setup) !== null;

/** Whether the unit is still being restarted once the walk is done. */
export const stillRestarting = (setup: Setup): boolean => !rateLimited(setup) && restarts(setup);

export function ending(setup: Setup): Ending {
  if (rateLimited(setup)) return "rate-limited";
  if (setup.crashAfterMs === null) return "running";
  return restarts(setup) ? "restarting-forever" : "left-alone";
}

/**
 * The smallest whole second of RestartSec that keeps this unit out of the
 * limit, or null when the unit is not limited in the first place.
 *
 * Whole seconds because that is how people write RestartSec, and searching
 * rather than solving because the walk is the authority here.
 */
export function safeRestartSecMs(setup: Setup): number | null {
  if (!rateLimited(setup)) return null;
  for (let seconds = 1; seconds <= 600; seconds += 1) {
    if (!rateLimited({ ...setup, restartSecMs: seconds * 1000 })) return seconds * 1000;
  }
  return null;
}

export function holds(claim: Option["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "starts":
      return startsBeforeFailing(setup) === claim.count;
    case "gives-up-at":
      return givesUpAtMs(setup) === claim.ms;
    case "ending":
      return ending(setup) === claim.value;
    case "still-restarting":
      return stillRestarting(setup) === claim.value;
    case "safe-restart-sec":
      return safeRestartSecMs(setup) === claim.ms;
    case "nothing":
      return false;
  }
}

export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** Milliseconds as a unit file writes them: 100ms, 2s, 1min 30s. */
export function human(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms % 60_000 === 0) return `${ms / 60_000}min`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** The unit file, with only the lines this case actually sets. */
export function asUnit(setup: Setup): string {
  const lines = [`# /etc/systemd/system/${setup.unit}`, "[Unit]", `Description=${setup.unit.replace(/\.service$/, "")}`];
  if (setup.intervalMs !== DEFAULT_INTERVAL_MS) lines.push(`StartLimitIntervalSec=${human(setup.intervalMs)}`);
  if (setup.burst !== DEFAULT_BURST) lines.push(`StartLimitBurst=${setup.burst}`);
  lines.push("", "[Service]", "ExecStart=/usr/local/bin/worker", `Restart=${setup.restart}`);
  if (setup.restartSecMs !== DEFAULT_RESTART_SEC_MS) lines.push(`RestartSec=${human(setup.restartSecMs)}`);
  lines.push("", "[Install]", "WantedBy=multi-user.target");
  return lines.join("\n");
}

/** The journal, one line per start, ending the way systemd ends it. */
export function asJournal(setup: Setup): string {
  const walk = attempts(setup);
  const shown = walk.slice(0, 12);
  const name = setup.unit;
  const rows: string[] = [];
  for (const [i, a] of shown.entries()) {
    const stamp = `${(a.atMs / 1000).toFixed(3).padStart(8)}s`;
    if (!a.allowed) {
      rows.push(`${stamp}  ${name}: Start request repeated too quickly.`);
      rows.push(`${stamp}  ${name}: Failed with result 'start-limit-hit'.`);
      rows.push(`${stamp}  Failed to start ${name.replace(/\.service$/, "")}.`);
      continue;
    }
    /* countInWindow, not the overall index: after a window resets this is 1 again, which is the
       whole point of the surface and printing "start 6 of 5" here would flatly contradict it. */
    rows.push(`${stamp}  Started ${name.replace(/\.service$/, "")}. (start ${a.countInWindow} of ${setup.burst || "unlimited"} in this window)`);
    if (setup.crashAfterMs !== null) {
      const died = a.atMs + setup.crashAfterMs;
      rows.push(
        `${`${(died / 1000).toFixed(3)}s`.padStart(9)}  ${name}: Main process exited, code=exited, status=${setup.exitCode}/FAILURE`,
      );
      if (restarts(setup)) {
        rows.push(`${`${(died / 1000).toFixed(3)}s`.padStart(9)}  ${name}: Scheduled restart job, restart counter is at ${i + 1}.`);
      } else {
        rows.push(`${`${(died / 1000).toFixed(3)}s`.padStart(9)}  ${name}: Consumed. Not restarting (Restart=${setup.restart}, status ${setup.exitCode}).`);
      }
    }
  }
  if (walk.length > shown.length) {
    rows.push(`      ...  and on, with no refusal: ${setup.burst} starts never fall inside one ${human(setup.intervalMs)} window`);
  }
  return rows.join("\n");
}

/** What systemctl status would say at the end. */
export function asStatus(setup: Setup): string {
  const end = ending(setup);
  const gave = givesUpAtMs(setup);
  if (end === "rate-limited") {
    return [
      `● ${setup.unit} - worker`,
      `     Loaded: loaded (/etc/systemd/system/${setup.unit}; enabled)`,
      `     Active: failed (Result: start-limit-hit) since ${human(gave ?? 0)} after the first start`,
      `   Main PID: - (code=exited, status=${setup.exitCode}/FAILURE)`,
      "",
      "# systemctl start will be refused until:",
      "#   systemctl reset-failed " + setup.unit,
    ].join("\n");
  }
  if (end === "restarting-forever") {
    return [
      `● ${setup.unit} - worker`,
      `     Loaded: loaded (/etc/systemd/system/${setup.unit}; enabled)`,
      "     Active: activating (auto-restart) (Result: exit-code)",
      `   Main PID: - (code=exited, status=${setup.exitCode}/FAILURE)`,
      "",
      `# and again every ${human(cycleMs(setup) ?? 0)}, for as long as nobody looks`,
    ].join("\n");
  }
  if (end === "left-alone") {
    return [
      `○ ${setup.unit} - worker`,
      `     Loaded: loaded (/etc/systemd/system/${setup.unit}; enabled)`,
      `     Active: inactive (dead)`,
      `   Main PID: - (code=exited, status=${setup.exitCode}/SUCCESS)`,
      "",
      `# Restart=${setup.restart} did not ask for a restart after this exit`,
    ].join("\n");
  }
  return [
    `● ${setup.unit} - worker`,
    `     Loaded: loaded (/etc/systemd/system/${setup.unit}; enabled)`,
    "     Active: active (running)",
  ].join("\n");
}
