import type { Case, Claim, Ending, Option, Setup } from "./types";

/** include/net/tcp.h: TCP_RTO_MIN is HZ/5, which is 200 milliseconds. */
export const RTO_MIN_MS = 200;
/** include/net/tcp.h: TCP_RTO_MAX_SEC is 120, so TCP_RTO_MAX is 120 seconds. */
export const RTO_MAX_MS = 120_000;

/**
 * tcp_model_timeout(), in the same three statements.
 *
 * The kernel works in jiffies and converts at the end; the ratio is what
 * matters and it is the same in milliseconds, so this works in milliseconds
 * throughout and skips the conversion. ilog2 is a floor, which is what
 * Math.floor(Math.log2(x)) gives for the exact powers this ever sees.
 *
 * `2 << boundary` is 2 to the power of boundary plus one, not boundary, and
 * getting that wrong changes the answer by a factor of two. It is written
 * out here rather than as a shift so the off-by-one is visible.
 */
export function modeledTimeoutMs(boundary: number, rtoBaseMs: number = RTO_MIN_MS): number {
  const linearBackoffThresh = Math.floor(Math.log2(RTO_MAX_MS / rtoBaseMs));
  if (boundary <= linearBackoffThresh) {
    return (2 ** (boundary + 1) - 1) * rtoBaseMs;
  }
  return (
    (2 ** (linearBackoffThresh + 1) - 1) * rtoBaseMs +
    (boundary - linearBackoffThresh) * RTO_MAX_MS
  );
}

/** The budget the socket is actually judged against, in milliseconds. */
export function budgetMs(setup: Setup): number {
  if (setup.userTimeoutMs > 0) return setup.userTimeoutMs;
  return modeledTimeoutMs(setup.retries2);
}

/**
 * The real retransmission schedule.
 *
 * Exponential backoff from the connection's own RTO, doubling each time and
 * clamped at TCP_RTO_MAX. Each entry is the moment that retransmission goes
 * out, measured from the first one, which is where retrans_stamp is set.
 *
 * Nothing here consults the model. That is the whole point: the schedule is
 * built from the path and the deadline is built from a constant, and the two
 * only agree when the path happens to cost 200 milliseconds.
 */
export function schedule(setup: Setup, limit = 64): number[] {
  const out: number[] = [];
  let elapsed = 0;
  let rto = setup.rtoMs;
  for (let i = 0; i < limit; i += 1) {
    out.push(elapsed);
    elapsed += Math.min(rto, RTO_MAX_MS);
    rto = Math.min(rto * 2, RTO_MAX_MS);
    if (elapsed > 4 * RTO_MAX_MS + modeledTimeoutMs(24)) break;
  }
  return out;
}

/**
 * How many retransmissions go out before the socket is abandoned.
 *
 * The check runs when a retransmit timer fires, so a retransmission at
 * exactly the deadline is the one that finds the budget spent rather than
 * one that is sent. Counting the sends strictly before the deadline is
 * therefore the honest number, and it is the number a packet capture shows.
 */
export function retransmissions(setup: Setup): number {
  if (setup.peerReturnsAtMs !== null && setup.peerReturnsAtMs < budgetMs(setup)) {
    return schedule(setup).filter((at) => at < setup.peerReturnsAtMs!).length;
  }
  return schedule(setup).filter((at) => at < budgetMs(setup)).length;
}

/** Where the connection ends up. */
export function ending(setup: Setup): Ending {
  const budget = budgetMs(setup);
  if (setup.peerReturnsAtMs !== null && setup.peerReturnsAtMs < budget) return "recovered";
  return setup.userTimeoutMs > 0 ? "user-timeout" : "timed-out";
}

/** Seconds from the first retransmission to the error, or null if it recovers. */
export function givesUpAtSeconds(setup: Setup): number | null {
  if (ending(setup) === "recovered") return null;
  return Math.round(budgetMs(setup) / 1000);
}

/** The budget as whole seconds, whatever decides it. */
export function budgetSeconds(setup: Setup): number {
  return Math.round(budgetMs(setup) / 1000);
}

/**
 * Whether the retransmissions that go out match the number in the sysctl.
 *
 * This is the claim the manual page invites and it is false on most paths.
 * A connection has to cost about TCP_RTO_MIN for the model and the schedule
 * to describe the same thing.
 */
export function countMatchesSysctl(setup: Setup): boolean {
  return ending(setup) !== "recovered" && retransmissions(setup) === setup.retries2;
}

/** Milliseconds, the way a trace reads them. */
export function human(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = (ms % 60_000) / 1000;
  return seconds === 0 ? `${minutes}min` : `${minutes}min ${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
}

/** The sysctls and the socket option, as they would be read back. */
export function asSysctl(setup: Setup): string {
  return [
    `$ sysctl net.ipv4.tcp_retries2`,
    `net.ipv4.tcp_retries2 = ${setup.retries2}`,
    `$ ss -tino dst ${setup.peer}`,
    `    rto:${Math.round(setup.rtoMs)} ${setup.userTimeoutMs > 0 ? `user_timeout:${setup.userTimeoutMs}` : "# TCP_USER_TIMEOUT not set"}`,
  ].join("\n");
}

/** The retransmissions a capture would show, and the line that ends it. */
export function asTrace(setup: Setup): string {
  const sends = schedule(setup);
  const count = retransmissions(setup);
  const rows: string[] = [];
  for (let i = 0; i < Math.min(count, 8); i += 1) {
    rows.push(`${human(sends[i]).padStart(9)}  retransmit #${i + 1}, rto now ${human(Math.min(setup.rtoMs * 2 ** i, RTO_MAX_MS))}`);
  }
  if (count > 8) rows.push(`      ...  ${count - 8} more, each one at the ${human(RTO_MAX_MS)} ceiling`);
  const end = ending(setup);
  if (end === "recovered") {
    rows.push(`${human(setup.peerReturnsAtMs ?? 0).padStart(9)}  the peer answers, and the connection carries on`);
  } else {
    rows.push(
      `${human(budgetMs(setup)).padStart(9)}  ETIMEDOUT` +
        (end === "user-timeout"
          ? `, at the TCP_USER_TIMEOUT you set`
          : `, at the modeled budget for tcp_retries2 ${setup.retries2}`),
    );
  }
  return rows.join("\n");
}

/** Whether one claim holds against one connection. */
export function holds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "budget-seconds":
      return budgetSeconds(setup) === claim.seconds;
    case "retransmissions":
      return retransmissions(setup) === claim.count;
    case "gives-up-at":
      return givesUpAtSeconds(setup) === claim.seconds;
    case "ending":
      return ending(setup) === claim.value;
    case "count-matches-sysctl":
      return countMatchesSysctl(setup) === claim.value;
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
