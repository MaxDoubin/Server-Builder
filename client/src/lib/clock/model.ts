/**
 * Turning a set of observations into a range for the clock.
 *
 * Every rule here passes inside one closed interval of offsets and fails
 * outside it, which is the property that makes the reverse question tractable:
 *
 *   a mutual comparison with tolerance T against a peer at offset P passes
 *   for offsets in [P - T, P + T]
 *
 *   a window from F to T passes for offsets in [F, T]
 *
 * An observation of "works" keeps that interval. An observation of "fails"
 * keeps its complement, which is two intervals. So the consistent set is an
 * intersection of unions of intervals, and it is computed here as exactly
 * that. The gate recomputes the same answer by walking every offset one
 * second at a time and comparing, because interval arithmetic is the sort of
 * thing that is nearly right.
 */

import type { Case, Check, Rule, Span } from "./types";

/** The whole range considered, which is a fortnight either side of correct. */
export const HORIZON = 14 * 24 * 3600;

/** The offsets at which a rule is satisfied. */
export function passing(rule: Rule): Span {
  return rule.kind === "mutual"
    ? { from: rule.peerOffset - rule.tolerance, to: rule.peerOffset + rule.tolerance }
    : { from: rule.from, to: rule.to };
}

/** Whether a given clock offset satisfies a rule. */
export const satisfies = (rule: Rule, offset: number): boolean => {
  const span = passing(rule);
  return offset >= span.from && offset <= span.to;
};

/** Whether a candidate offset produces everything the operator saw. */
export const explains = (checks: Check[], offset: number): boolean =>
  checks.every((check) => satisfies(check.rule, offset) === (check.observed === "works"));

/* ------------------------------------------------------- interval algebra */

const clamp = (span: Span): Span => ({
  from: Math.max(span.from, -HORIZON),
  to: Math.min(span.to, HORIZON),
});

/** What is left of a set of spans after keeping only what is also in one span. */
function intersect(spans: Span[], span: Span): Span[] {
  const out: Span[] = [];
  for (const current of spans) {
    const from = Math.max(current.from, span.from);
    const to = Math.min(current.to, span.to);
    if (from <= to) out.push({ from, to });
  }
  return out;
}

/**
 * What is left after removing one span.
 *
 * Integer seconds, so the complement of [a, b] is everything up to a - 1 and
 * everything from b + 1. Getting that off by one puts the boundary second in
 * both the passing and the failing set, which is the kind of error that makes
 * a case have two right answers.
 */
function subtract(spans: Span[], span: Span): Span[] {
  const out: Span[] = [];
  for (const current of spans) {
    if (span.to < current.from || span.from > current.to) {
      out.push(current);
      continue;
    }
    if (current.from <= span.from - 1) out.push({ from: current.from, to: span.from - 1 });
    if (span.to + 1 <= current.to) out.push({ from: span.to + 1, to: current.to });
  }
  return out;
}

/**
 * Every clock offset consistent with the observations.
 *
 * Returns the spans in order. An empty result means the observations
 * contradict each other, which is a broken case rather than a diagnosis, and
 * CI rejects it.
 */
export function consistent(checks: Check[]): Span[] {
  let spans: Span[] = [{ from: -HORIZON, to: HORIZON }];
  for (const check of checks) {
    const span = clamp(passing(check.rule));
    spans = check.observed === "works" ? intersect(spans, span) : subtract(spans, span);
  }
  return spans;
}

/** The one span a case narrows to, or null when it narrows to several. */
export function narrowed(checks: Check[]): Span | null {
  const spans = consistent(checks);
  return spans.length === 1 ? spans[0] : null;
}

/**
 * The option that is right, found rather than declared.
 *
 * No case carries an answer key: the correct option is the one whose range
 * equals the range the observations allow.
 */
export const correctOption = (item: Case) => {
  const span = narrowed(item.checks);
  if (!span) return undefined;
  return item.options.find((option) => option.from === span.from && option.to === span.to);
};

/* ------------------------------------------------------ what the set spans */

/**
 * The distinct tolerances the cases actually use, widest first.
 *
 * Derived rather than written down. A sentence claiming these tolerances span
 * two orders of magnitude appeared in five places and was wrong by a factor
 * of ten: they are 300 seconds, 30 seconds and zero, so the gap between the
 * two that tolerate anything is 10x and the interesting part is the cliff to
 * nothing. None of the gates on this surface read prose, so nothing caught
 * it. Prose that quotes the data cannot disagree with the data.
 */
export const tolerances = (cases: Case[]): number[] =>
  [
    ...new Set(
      cases.flatMap((item) =>
        item.checks.map((check) => (check.rule.kind === "mutual" ? check.rule.tolerance : 0)),
      ),
    ),
  ].sort((a, b) => b - a);

/** The ratio between the widest and the narrowest tolerance above zero. */
export const toleranceSpread = (cases: Case[]): number => {
  const graded = tolerances(cases).filter((value) => value > 0);
  return graded.length < 2 ? 1 : graded[0] / graded[graded.length - 1];
};

/* ---------------------------------------------------------------- reading */

/**
 * A duration as somebody would say it.
 *
 * Signed, because the direction is half the diagnosis: fast means a
 * certificate looks expired before it is, slow means it looks not yet valid.
 */
export function readable(seconds: number): string {
  const sign = seconds < 0 ? "slow" : "fast";
  const total = Math.abs(seconds);
  if (total === 0) return "correct";
  const units: [number, string][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  for (const [size, name] of units) {
    if (total >= size) {
      const count = total / size;
      const rounded = Number.isInteger(count) ? count : Number(count.toFixed(1));
      return `${rounded} ${rounded === 1 ? name : `${name}s`} ${sign}`;
    }
  }
  return `${total} seconds ${sign}`;
}

/** A span as a sentence. */
export const spanText = (span: Span): string =>
  span.from === span.to
    ? readable(span.from)
    : `between ${readable(span.from)} and ${readable(span.to)}`;

/**
 * How wide a case's answer is, in seconds.
 *
 * Used to insist that the cases actually narrow things down: an answer of
 * "somewhere in a fortnight" is not a diagnosis, and one that pins the clock
 * to the exact second is a puzzle rather than an exercise.
 */
export const width = (span: Span): number => span.to - span.from;
