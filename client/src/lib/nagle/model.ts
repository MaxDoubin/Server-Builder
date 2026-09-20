import type { Change, Claim, Setup } from "./types";

/** Bytes the application hands the socket before it waits for an answer. */
export function bytesBeforeRead(setup: Setup): number {
  return setup.writes.reduce((total, n) => total + n, 0);
}

/** Writes that arrive after the first, which are the ones with company. */
export function writesAfterTheFirst(setup: Setup): number {
  return Math.max(0, setup.writes.length - 1);
}

/**
 * Whether the sender holds anything back.
 *
 * Nagle holds a small segment while there is unacknowledged data outstanding.
 * The first write has nothing outstanding and leaves at once; anything after
 * it does, and is small, and waits.
 */
export function senderHolds(setup: Setup): boolean {
  if (setup.nodelaySender) return false;
  return writesAfterTheFirst(setup) > 0;
}

/**
 * Whether the receiver sits on its acknowledgement.
 *
 * It has part of a request, cannot answer yet, and an acknowledgement on its
 * own carries nothing, so it waits for data to carry it. TCP_QUICKACK is the
 * instruction not to.
 */
export function receiverDelaysAck(setup: Setup): boolean {
  return !setup.quickackReceiver;
}

/** The deadlock needs both halves. */
export function stalls(setup: Setup): boolean {
  return senderHolds(setup) && receiverDelaysAck(setup);
}

/**
 * Timers waited per round trip.
 *
 * One, or none. Every write after the first joins the same held segment, so
 * eight writes cost what two cost: measured at 44.35, 44.15 and 44.02 ms for
 * two, three and eight.
 */
export function stallsPerRequest(setup: Setup): number {
  return stalls(setup) ? 1 : 0;
}

/** What one round trip costs, in microseconds. */
export function roundTripUs(setup: Setup): number {
  return setup.baseUs + stallsPerRequest(setup) * setup.delayedAckMs * 1000;
}

/** Round trips a second, which is the number an operator actually feels. */
export function requestsPerSecond(setup: Setup): number {
  return Math.round(1_000_000 / roundTripUs(setup));
}

/** How much slower the stall makes this link. */
export function slowdown(setup: Setup): number {
  return Math.round(roundTripUs(setup) / setup.baseUs);
}

/** What the whole run costs, in milliseconds. */
export function totalMs(setup: Setup): number {
  return Math.round((setup.requests * roundTripUs(setup)) / 1000);
}

/* ------------------------------------------------------ proposed changes */

/** The same setup with one change applied. */
export function applying(setup: Setup, change: Change): Setup {
  switch (change) {
    case "nodelay-sender":
      return { ...setup, nodelaySender: true };
    case "nodelay-receiver":
      return { ...setup, nodelayReceiver: true };
    case "quickack-receiver":
      return { ...setup, quickackReceiver: true };
    case "one-write":
      return { ...setup, writes: [bytesBeforeRead(setup)] };
    case "nothing":
      return setup;
  }
}

/**
 * Whether a change removes the stall.
 *
 * Asked this way round rather than as "what is the fix", because several
 * things work and the interesting question is which of the four in front of
 * you does. nodelay-receiver is in every list because it is the one people
 * reach for, and the model says plainly that it changes nothing: measured at
 * 44.05 ms with the receiver's TCP_NODELAY set.
 */
export function removesTheStall(setup: Setup, change: Change): boolean {
  return stalls(setup) && !stalls(applying(setup, change));
}

/* ---------------------------------------------------------- for the page */

/** A duration in microseconds, written the way a person would say it. */
export function humanUs(us: number): string {
  if (us < 1000) return `${us} us`;
  /* Two decimals up to a tenth of a second, so 44050 reads as the 44.05 ms
     the measurement actually was rather than rounding to a flat 44.0. */
  if (us < 100_000) return `${(us / 1000).toFixed(2)} ms`;
  return `${(us / 1000).toFixed(1)} ms`;
}

/** The lines a reader would gather before answering. */
export function asSocket(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "writes before the read", value: setup.writes.join(" + ") + " bytes", unit: `${setup.writes.length} call${setup.writes.length === 1 ? "" : "s"} to send` },
    { name: "TCP_MAXSEG", value: String(setup.mss), unit: "one segment, far above anything here" },
    { name: "TCP_NODELAY, sender", value: setup.nodelaySender ? "on" : "off", unit: "the end that writes" },
    { name: "TCP_NODELAY, receiver", value: setup.nodelayReceiver ? "on" : "off", unit: "governs ITS OWN sends, not the sender's" },
    { name: "TCP_QUICKACK, receiver", value: setup.quickackReceiver ? "on" : "off", unit: "set before every read, or Linux clears it" },
    { name: "a round trip, unheld", value: humanUs(setup.baseUs), unit: `${setup.host}` },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "stalls":
      return claim.value === stalls(setup);
    case "fix":
      return removesTheStall(setup, claim.change);
    case "stallsPerRequest":
      return claim.value === stallsPerRequest(setup);
    case "roundTripUs":
      return claim.value === roundTripUs(setup);
    case "requestsPerSecond":
      return claim.value === requestsPerSecond(setup);
    case "slowdown":
      return claim.value === slowdown(setup);
    case "totalMs":
      return claim.value === totalMs(setup);
    case "nothing":
      return false;
  }
}

/**
 * The option the model says is right.
 *
 * The page calls this rather than reading an answer out of the data, which is
 * the property check-answer-keys exists to hold.
 */
export function correctOption(item: { setup: Setup; options: { id: string; says: Claim }[] }) {
  return item.options.find((option) => claimHolds(option.says, item.setup));
}
