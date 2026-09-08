/**
 * Walking one user action down a call path and counting what happens.
 *
 * Everything here is bottom-up, because that is the only direction the
 * numbers work in. How long a layer takes depends on how long the layer below
 * it takes, and whether a layer's timeout is wrong depends on a number that
 * is not in its own configuration.
 *
 * The scenario throughout is a dependency that is slow rather than down.
 * Down is the easy case: a refused connection comes back in microseconds and
 * the retries cost nothing but log lines. Slow is what takes the site with
 * it, because every layer holds a connection open, spends its whole budget,
 * and then does it again.
 */

import type { Ask, Caller, Chain, Leaf } from "./types";

/**
 * The delays a layer waits between its attempts.
 *
 * One shorter than the attempt count, because the last attempt is not
 * followed by a wait. Getting that off by one is how a budget calculation
 * ends up one backoff too long, which is the direction that hides the bug.
 */
export function delays(caller: Caller): number[] {
  const out: number[] = [];
  for (let retry = 0; retry < caller.attempts - 1; retry += 1) {
    out.push(caller.backoff * caller.factor ** retry);
  }
  return out;
}

/** How many requests reach a given depth, where 0 is the client being pressed once. */
export function requestsAt(chain: Chain, depth: number): number {
  let out = 1;
  for (let index = 0; index < depth; index += 1) out *= chain.callers[index].attempts;
  return out;
}

/** How many the thing at the bottom sees. The number nobody writes down. */
export const amplification = (chain: Chain): number => requestsAt(chain, chain.callers.length);

/**
 * How long a layer takes to give an answer to the layer above it.
 *
 * Recursive from the leaf up. Each attempt waits for the layer below, or for
 * its own timeout, whichever comes first, and the delays between attempts are
 * added on. Every attempt fails, because the leaf is slower than the deepest
 * timeout, which is the whole scenario.
 */
export function answerTime(chain: Chain, depth: number): number {
  if (depth >= chain.callers.length) return chain.leaf.latency;
  const caller = chain.callers[depth];
  const below = answerTime(chain, depth + 1);
  const perAttempt = Math.min(caller.timeout, below);
  return caller.attempts * perAttempt + delays(caller).reduce((sum, wait) => sum + wait, 0);
}

/** What the person who pressed the button waits, worst case. */
export const elapsed = (chain: Chain): number => answerTime(chain, 0);

/**
 * Every layer that gives up on something that is still working.
 *
 * Includes the innermost one, whose callee is the dependency itself. That
 * layer is not misconfigured, but the work it abandons is still real work.
 */
export const abandoning = (chain: Chain): Caller[] =>
  chain.callers.filter((caller, depth) => caller.timeout < answerTime(chain, depth + 1));

/**
 * The shallowest layer whose budget is smaller than its callee's, which is
 * a configuration fault rather than a timeout doing its job.
 *
 * The innermost layer is deliberately excluded, and getting that wrong is
 * what made me write this comment. The first version compared every caller's
 * timeout against whatever was beneath it, so on a chain with a slow database
 * it reported the driver: a driver that gives up after 900ms on a query
 * taking four seconds is behaving exactly as intended, and calling that the
 * fault sends somebody to raise the one timeout that was right.
 *
 * What is a fault is a caller whose budget is smaller than the retry budget
 * of the layer below it, because then the layer below is abandoned in the
 * middle of a policy somebody configured, and its remaining attempts run
 * into a socket nobody is reading. That comparison only means anything when
 * the callee has a policy of its own, which the dependency does not.
 *
 * Returns null when every layer allows more time than everything under it.
 */
export function truncatingCaller(chain: Chain): Caller | null {
  for (let depth = 0; depth < chain.callers.length - 1; depth += 1) {
    if (chain.callers[depth].timeout < answerTime(chain, depth + 1)) return chain.callers[depth];
  }
  return null;
}

/**
 * How many requests are still running once the user has given up.
 *
 * Nothing cancels them. Above the truncation point the caller has moved on;
 * below it, every one of those requests is still holding a connection and
 * still competing with the retry that replaced it. Counted as everything the
 * leaf sees, because a request that was abandoned at any depth still reaches
 * the bottom.
 */
export function orphaned(chain: Chain): number {
  return abandoning(chain).length === 0 ? 0 : amplification(chain);
}

/** Layers whose call is not safe to repeat and which retry anyway. */
export const unsafeRetries = (chain: Chain): Caller[] =>
  chain.callers.filter((caller) => caller.attempts > 1 && !caller.idempotent);

/**
 * Layers that back off without jitter, and so synchronise rather than spread.
 *
 * A layer that does not retry cannot synchronise anything, so it is not
 * counted: the first version of this flagged every caller with jitter 0 and
 * reported a thundering herd on a chain where three of the four layers made
 * exactly one attempt each.
 */
export const synchronised = (chain: Chain): Caller[] =>
  chain.callers.filter((caller) => caller.attempts > 1 && caller.jitter === 0);

/** The canonical answer to a case's question, as a string CI can compare. */
export function canonical(chain: Chain): string {
  const ask: Ask = chain.ask;
  switch (ask.kind) {
    case "amplification":
      return String(amplification(chain));
    case "requests-at":
      return String(requestsAt(chain, ask.at));
    case "elapsed":
      return String(elapsed(chain));
    case "orphaned":
      return String(orphaned(chain));
    case "truncates": {
      const caller = truncatingCaller(chain);
      return caller ? caller.name : "none";
    }
    default:
      /* A new ask with no answer would silently score every option wrong. */
      throw new Error(`no canonical answer for ask ${JSON.stringify(ask)}`);
  }
}

/**
 * The option that is right, found rather than declared.
 *
 * There is no answer key in the data. The correct option is the one whose
 * value matches what the model computes, which makes it impossible for a
 * case's prose and its arithmetic to drift apart and impossible for two
 * options to both be right. CI checks that exactly one matches.
 */
export const correctOption = (chain: Chain) =>
  chain.options.find((option) => option.value === canonical(chain));

/** Milliseconds, rendered the way somebody would say them out loud. */
export const ms = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}s` : `${Math.round(value)}ms`;

/**
 * The timeout each layer would need for the one below it to finish first.
 *
 * Offered as the fix rather than as a score. Deadline propagation is the real
 * answer and this is the arithmetic version of it: each layer needs longer
 * than everything beneath it, which means the budget has to be divided from
 * the top rather than chosen from the bottom.
 */
export const needsAtLeast = (chain: Chain, depth: number): number =>
  answerTime(chain, depth + 1);

/** A leaf that answers inside every timeout above it, for a control case. */
export const healthy = (leaf: Leaf, latency: number): Leaf => ({ ...leaf, latency });
