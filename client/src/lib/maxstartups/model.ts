import type { Case, Certainty, Claim, Option, Setup } from "./types";

/**
 * sshd.c should_drop_connection(), kept in its own shape.
 *
 * The four statements are the four statements, in order, with the same
 * integer division. Writing it as one expression would be shorter and would
 * lose the thing worth seeing: the multiply happens before the divide, so
 * the truncation lands once at the end of that term rather than on each
 * factor, and the result is a staircase whose steps are (full - begin)
 * wide divided into (100 - rate) parts.
 *
 * `startups` is the count of connections already unauthenticated when this
 * one arrives, which is what sshd passes: the new connection is #startups,
 * counting from zero, so the first connection to face a non-zero
 * probability is the one that arrives with `begin` already standing.
 */
export function dropPercent(setup: Setup): number {
  return dropPercentAt(setup, standingOrCeiling(setup));
}

/** The arithmetic itself, against an occupancy you name. */
export function dropPercentAt(setup: Setup, startups: number): number {
  const { begin, rate, full } = setup;
  if (startups < begin) return 0;
  if (startups >= full) return 100;
  if (rate === 100) return 100;
  let p = 100 - rate;
  p *= startups - begin;
  p = Math.trunc(p / (full - begin));
  p += rate;
  return p;
}

/**
 * How many connections are standing unauthenticated once the rate settles.
 *
 * Arrival rate times holding time, which is all Little's law is. The two
 * populations hold their slots for different lengths: a client that
 * authenticates holds one for as long as that takes, and a client that
 * never does holds one until LoginGraceTime cuts it off.
 *
 * Both rates are per minute and both times are in seconds, so the numerator
 * is an integer count of connection-seconds per minute and the single
 * divide by sixty at the end is the only place a fraction can appear. That
 * is deliberate: dividing each population first and adding afterwards
 * rounds twice and disagrees with this by one at several of the numbers
 * below.
 *
 * Returns null when there is no steady state: with LoginGraceTime 0 nothing
 * ever clears a connection that does not authenticate, so the count grows
 * without bound and the daemon ends up refusing everything for good.
 */
export function inFlight(setup: Setup): number | null {
  if (setup.graceSeconds === 0 && setup.stuckPerMinute > 0) return null;
  const held = setup.graceSeconds === 0 ? setup.authSeconds : Math.min(setup.authSeconds, setup.graceSeconds);
  const connectionSeconds = setup.arrivalsPerMinute * held + setup.stuckPerMinute * setup.graceSeconds;
  return Math.floor(connectionSeconds / 60);
}

/** The occupancy, with "never settles" standing in as past every threshold. */
function standingOrCeiling(setup: Setup): number {
  const standing = inFlight(setup);
  return standing === null ? setup.full : standing;
}

/** Whether the next connection's fate is settled, and which way. */
export function certainty(setup: Setup): Certainty {
  const percent = dropPercent(setup);
  if (percent === 0) return "accepted";
  if (percent === 100) return "dropped";
  return "coin";
}

/**
 * The smallest MaxStartups start value that refuses none of them.
 *
 * This is the fix people reach for last and should reach for first. Raising
 * `full` flattens the ramp and lowers the odds; it cannot make them zero,
 * because the first guard clause is the only one that returns a definite
 * accept and it tests `begin` alone. To stop dropping you raise the first
 * number, not the third.
 *
 * Null when there is no steady state, because no value of `begin` is enough
 * for a count that does not stop climbing.
 */
export function safeBegin(setup: Setup): number | null {
  const standing = inFlight(setup);
  return standing === null ? null : standing + 1;
}

/** The three numbers as sshd_config(5) writes them. */
export function asConfig(setup: Setup): string {
  return [
    `# /etc/ssh/sshd_config on ${setup.host}`,
    `MaxStartups ${setup.begin}:${setup.rate}:${setup.full}`,
    `LoginGraceTime ${setup.graceSeconds}`,
  ].join("\n");
}

/**
 * What the daemon's log would show, in sshd's own words.
 *
 * The line is drop_connection()'s, which prints the count as it stood and
 * the reason that refused it. The note underneath it is not decoration:
 * that function initialises its limiter with
 * log_ratelimit_init(&ratelimit_maxstartups, 4, 60, 20, 5*60) and drops the
 * message to debug3 once it is rate limited, so a daemon dropping steadily
 * writes a handful of lines and then goes quiet at the log level anybody
 * runs. The quiet is the limiter, not a recovery.
 */
export function asLog(setup: Setup): string {
  const standing = inFlight(setup);
  const percent = dropPercent(setup);
  const rows: string[] = [];
  if (standing === null) {
    rows.push(`sshd[2411]: drop connection #${setup.full} from [198.51.100.24]:52310 on [${setup.host}]:22 MaxStartups`);
    rows.push(`sshd[2411]: drop connection #${setup.full} from [198.51.100.24]:52311 on [${setup.host}]:22 MaxStartups`);
    rows.push(`# LoginGraceTime 0, so nothing clears a connection that never authenticates.`);
    rows.push(`# The count only goes up, and every connection from here is refused.`);
    return rows.join("\n");
  }
  if (percent === 0) {
    rows.push(`# ${standing} unauthenticated, under MaxStartups start=${setup.begin}. Nothing is refused and nothing is logged.`);
    return rows.join("\n");
  }
  rows.push(`sshd[2411]: drop connection #${standing} from [198.51.100.24]:52310 on [${setup.host}]:22 MaxStartups`);
  if (percent < 100) {
    rows.push(`# and the next one at the same count has a ${100 - percent}% chance of getting in.`);
  } else {
    rows.push(`# and every one after it, at this count, for the same reason.`);
  }
  rows.push(`# MaxStartups logging rate-limited: additional connections dropped`);
  return rows.join("\n");
}

/** The ramp, one row per occupancy, for drawing the staircase. */
export function ramp(setup: Setup, from: number, to: number): { startups: number; percent: number }[] {
  const rows: { startups: number; percent: number }[] = [];
  for (let n = from; n <= to; n += 1) rows.push({ startups: n, percent: dropPercentAt(setup, n) });
  return rows;
}

/** Whether one claim holds against one daemon. */
export function holds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "drop-percent":
      return dropPercent(setup) === claim.percent;
    case "certainty":
      return certainty(setup) === claim.value;
    case "in-flight":
      return inFlight(setup) === claim.count;
    case "safe-begin":
      return safeBegin(setup) === claim.value;
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
