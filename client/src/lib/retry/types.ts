/**
 * Three retries at four layers is eighty-one requests, and nobody wrote 81.
 *
 * Every layer of a call path gets its retry policy from a different person on
 * a different day, and each one is defensible on its own. The browser retries
 * a failed fetch. The edge retries an upstream 502. The API client retries a
 * connection reset. The database driver retries a broken pipe. Three attempts
 * each, which is the default in most libraries and reads as cautious.
 *
 * They multiply. One user pressing a button becomes eighty-one queries
 * against the thing that is already having a bad day, which is how a slow
 * dependency becomes a dead one. The number is trivial to compute and almost
 * never computed, because no single layer's configuration contains it: you
 * have to look at all four at once, and no dashboard shows all four.
 *
 * The second failure is the timeouts, and it is worse because it is invisible.
 * When a caller's timeout is shorter than the time the layer below it needs to
 * exhaust its own retries, the caller hangs up and retries while the first
 * request is still running. The work is not cancelled. It completes, into a
 * socket nobody is reading, and it was competing with the retry the whole
 * time. Every layer that does this multiplies the load again and none of them
 * logs anything except a timeout.
 *
 * The third is the backoff. Exponential backoff without jitter does not spread
 * retries out, it synchronises them: every client that failed at the same
 * instant comes back at the same instant, and again at the same instant, in
 * tighter and tighter formation.
 */

/**
 * One layer that calls the next one down.
 *
 * The policy described here is how this layer calls the layer below it, not
 * how it is called. That is the direction all retry configuration is written
 * in and the direction that makes it multiply.
 */
export interface Caller {
  name: string;
  /**
   * Total attempts, so 1 means no retry at all.
   *
   * Named attempts rather than retries on purpose: half of the libraries in
   * any given stack count one way and half the other, and a policy of
   * "3 retries" that turns out to mean four requests is the commonest single
   * cause of an amplification factor nobody predicted.
   */
  attempts: number;
  /** How long this layer waits for one attempt, in milliseconds. */
  timeout: number;
  /** The first delay between attempts, in milliseconds. */
  backoff: number;
  /** Multiplier applied to the delay each retry. 1 is constant, 2 is exponential. */
  factor: number;
  /** Randomisation as a fraction of the delay. 0 means every client returns together. */
  jitter: number;
  /** Whether repeating this layer's call is safe. Retrying a charge is not. */
  idempotent: boolean;
  /** Shown beside the row when this layer is somebody's decision. */
  note?: string;
}

/** The thing at the bottom that is having the bad day. */
export interface Leaf {
  name: string;
  /**
   * How long it takes to answer, in milliseconds.
   *
   * This is the scenario: a dependency that is slow rather than down. Down is
   * easy, because a refused connection returns instantly and the retries cost
   * nothing. Slow is what takes the site with it.
   */
  latency: number;
  note?: string;
}

/** Which question a case asks, and what a correct answer is measured against. */
export type Ask =
  /** How many requests the bottom of the stack sees for one user action. */
  | { kind: "amplification" }
  /** How many a named layer sees. Indexed into callers, so 0 is the client. */
  | { kind: "requests-at"; at: number }
  /** Worst case wall clock before the user is told anything, in milliseconds. */
  | { kind: "elapsed" }
  /** Which layer hangs up while the one below it is still working. */
  | { kind: "truncates" }
  /** How many requests are still running after the user has given up. */
  | { kind: "orphaned" };

export interface Option {
  id: string;
  /** What somebody might answer, in prose. */
  claim: string;
  /**
   * The machine-checkable part of the claim.
   *
   * Exactly one option's value has to equal what the model computes, and CI
   * checks that rather than trusting a declared answer key. It means the prose
   * and the arithmetic cannot drift apart, and that two options cannot both be
   * right by accident, which happened twice while I was writing these.
   */
  value: string;
}

export interface Chain {
  slug: string;
  name: string;
  /** The situation, as somebody would describe it in a channel at the time. */
  brief: string;
  callers: Caller[];
  leaf: Leaf;
  ask: Ask;
  question: string;
  options: Option[];
  /** Why, once the reader has answered. */
  why: string;
  /**
   * The belief this case is built to break.
   *
   * Unique across the set, which CI enforces: five cases about multiplication
   * is one case with five sets of numbers.
   */
  breaks: string;
}
