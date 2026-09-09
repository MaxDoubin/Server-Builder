/**
 * One cause, four error messages, none of which says the word time.
 *
 * A wrong clock is the only fault I know of that reports itself under four
 * unrelated names. Kerberos is honest and says the skew is too great.
 * Everything else lies by omission. TLS says the certificate is not yet
 * valid, which sends you to look at the certificate. An authenticator says
 * the code is invalid, which sends you to look at the seed. DNSSEC says the
 * answer is bogus, which sends you to look at the zone. Log correlation says
 * nothing at all: the events are simply in the wrong order, and the
 * conclusion you draw from reading them backwards is wrong in a way that
 * nothing will contradict.
 *
 * Two things make it hard beyond the messages.
 *
 * The skew that matters is relative. Two hosts that are both ten minutes
 * fast agree with each other perfectly, so everything between them works,
 * and everything either of them does against a third party fails. Which
 * means the machine you are logged into can look completely healthy.
 *
 * And the tolerances are not on one scale. Kerberos allows 300 seconds by
 * default. A one-time code allows a step either side, so 30. A certificate
 * window and an RRSIG allow nothing at all: the edges are hard. A factor of
 * ten between the two that tolerate anything, and then a cliff, and the
 * cliff is the useful part, because a check with no tolerance and a known
 * timestamp measures rather than reassures.
 *
 * So the set of things that are broken is itself a measurement, and that is
 * the exercise here: not "given the skew, what breaks", which is arithmetic,
 * but "given what broke and what did not, how wrong is the clock", which is
 * what you actually have in front of you.
 *
 * Those three figures are not written down anywhere that matters. See
 * tolerances() in ./model, which derives them from the cases, because the
 * sentence they replaced said two orders of magnitude in five places and was
 * wrong by a factor of ten.
 */

/**
 * A check performed by the host whose clock is in question.
 *
 * Every rule reduces to an interval of clock offsets in which the check
 * passes, which is what makes the reverse question answerable at all: the
 * observations intersect to a range, and the range is the answer.
 */
export type Rule =
  /**
   * Compared against another party's clock, with a tolerance.
   *
   * Kerberos is the archetype: the KDC rejects a request whose timestamp is
   * more than its clockskew away from its own idea of now. The peer's own
   * offset is part of the rule, because a tolerant comparison against a
   * clock that is itself wrong is the case people never think of.
   */
  | { kind: "mutual"; peer: string; peerOffset: number; tolerance: number }
  /**
   * Compared against a fixed window, in seconds either side of true time.
   *
   * A certificate's notBefore and notAfter, or an RRSIG's inception and
   * expiration. Negative is in the past. There is no tolerance: an edge is
   * an edge, which is why a certificate issued four minutes ago fails on a
   * host running five minutes slow and nothing else does.
   */
  | { kind: "window"; from: number; to: number };

export interface Check {
  /** What is being attempted. */
  label: string;
  rule: Rule;
  /** What the operator saw happen. */
  observed: "works" | "fails";
  /**
   * The error as it actually appears, which is the whole problem.
   *
   * Written verbatim in the register the tool uses, because recognizing this
   * means recognizing these strings and not a description of them.
   */
  message: string;
}

export interface Option {
  id: string;
  claim: string;
  /**
   * The offset range this option claims, in seconds, inclusive.
   *
   * Exactly one has to equal what the observations allow, which CI checks by
   * intersecting the rules and separately by brute force, rather than by
   * trusting a declared answer.
   */
  from: number;
  to: number;
}

export interface Case {
  slug: string;
  name: string;
  /** The situation, as it arrives. */
  brief: string;
  /** The host whose clock is in question. */
  host: string;
  checks: Check[];
  question: string;
  options: Option[];
  why: string;
  /** The belief this case is built to break. Unique across the set. */
  breaks: string;
}

/** A closed interval of clock offsets, in seconds. */
export interface Span {
  from: number;
  to: number;
}
