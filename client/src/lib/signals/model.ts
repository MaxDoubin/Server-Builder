import type { Claim, Setup } from "./types";

/** The first realtime signal on Linux. Below this, signals do not queue. */
export const SIGRTMIN = 34;

/** The last one. Thirty one of them on this kernel. */
export const SIGRTMAX = 64;

/** RLIMIT_SIGPENDING as this host ships it, per real user rather than per process. */
export const PENDING_DEFAULT = 64_313;

/** What a signal number is called, for the ones a case names. */
export const NAMES: Record<number, string> = {
  1: "SIGHUP",
  2: "SIGINT",
  10: "SIGUSR1",
  12: "SIGUSR2",
  15: "SIGTERM",
  17: "SIGCHLD",
  18: "SIGCONT",
  28: "SIGWINCH",
};

/** How a signal number reads. Realtime ones are named by their offset. */
export function nameOf(sig: number): string {
  if (queues(sig)) return sig === SIGRTMIN ? "SIGRTMIN" : `SIGRTMIN+${sig - SIGRTMIN}`;
  return NAMES[sig] ?? `signal ${sig}`;
}

/**
 * Whether this signal queues.
 *
 * It is the number that decides and not the call. Measured: sigqueue on
 * SIGUSR1 coalesced 1000 sends into one delivery, and kill on SIGRTMIN queued
 * all 1000.
 */
export function queues(sig: number): boolean {
  return sig >= SIGRTMIN && sig <= SIGRTMAX;
}

/**
 * How many realtime instances the queue holds.
 *
 * Measured at seven values of RLIMIT_SIGPENDING, and it is the limit minus one
 * every time: at 32 the thirty second sigqueue was refused, and at 1 the first
 * one was.
 */
export function queueDepth(limit: number): number {
  return Math.max(limit - 1, 0);
}

/**
 * How many times the handler runs.
 *
 * The one awkward corner is real: when kill cannot allocate a queue entry the
 * kernel still sets the pending bit and delivers one, losing the siginfo,
 * where sigqueue refuses instead. Measured at a limit of 1, where kill
 * delivered one and sigqueue delivered none.
 */
export function delivered(setup: Setup): number {
  if (setup.sends === 0) return 0;
  if (!queues(setup.sig)) return 1;
  const queued = Math.min(setup.sends, queueDepth(setup.pendingLimit));
  return setup.via === "kill" ? Math.max(queued, 1) : queued;
}

/** Sends that produce nothing at all. */
export function lost(setup: Setup): number {
  return setup.sends - delivered(setup);
}

/**
 * How many of the send calls return success.
 *
 * kill returns 0 for signals it is about to drop. sigqueue returns EAGAIN once
 * the queue is full. They deliver the same number; only one of them says so.
 */
export function accepted(setup: Setup): number {
  if (setup.via === "kill") return setup.sends;
  if (!queues(setup.sig)) return setup.sends;
  return Math.min(setup.sends, queueDepth(setup.pendingLimit));
}

/** Send calls that come back EAGAIN. */
export function refused(setup: Setup): number {
  return setup.sends - accepted(setup);
}

/**
 * Every distinct signal actually pending when the mask is lifted, ascending.
 *
 * A signal that was sent is not a signal that arrived. At a limit of 1 a burst
 * of sigqueue is refused outright, and nothing is pending at all; the first
 * version of this listed the signal anyway and the gate caught it by walking
 * the queue instead. The others are one send each and draw on whatever
 * allowance the burst left.
 */
export function pending(setup: Setup): number[] {
  const out: number[] = [];
  if (delivered(setup) > 0) out.push(setup.sig);
  /*
    A standard signal is a bit and takes no entry, however many were sent, so a
    burst of them leaves the allowance untouched. The first version subtracted
    the burst either way and pushed the realtime signals queued alongside it out
    of the pending set, which the gate caught by posting them one at a time.
  */
  const takenByTheBurst = queues(setup.sig) ? Math.min(setup.sends, queueDepth(setup.pendingLimit)) : 0;
  let room = queueDepth(setup.pendingLimit) - takenByTheBurst;
  for (const other of setup.alsoQueued) {
    if (!queues(other)) { out.push(other); continue; }
    if (room > 0) { room -= 1; out.push(other); continue; }
    if (setup.via === "kill") out.push(other);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** The order sigtimedwait takes them in: lowest number first, always. */
export function dequeueOrder(setup: Setup): number[] {
  return pending(setup);
}

/**
 * The order the handlers run in, which is the reverse.
 *
 * The kernel dequeues lowest first and builds a signal frame for each before
 * returning to user space. Each frame's saved context is the previous
 * handler's entry, so the last built runs first and they unwind downward. They
 * do not nest: measured over five runs and four sets, the depth never left 1.
 */
export function handlerOrder(setup: Setup): number[] {
  return [...pending(setup)].reverse();
}

/** Which handler runs first, or -1 when nothing arrived at all. */
export function firstHandler(setup: Setup): number {
  return handlerOrder(setup)[0] ?? -1;
}

/** Which one sigtimedwait would take first, or -1 when nothing arrived. */
export function firstDequeued(setup: Setup): number {
  return dequeueOrder(setup)[0] ?? -1;
}

/** A count, written the way a person would say it. */
export function humanCount(n: number): string {
  return n === 1 ? "once" : `${n} times`;
}

/** The lines a reader would gather before answering. */
export function asSignals(setup: Setup): { name: string; value: string; unit: string }[] {
  const others = setup.alsoQueued.length;
  return [
    { name: "signal", value: `${nameOf(setup.sig)} (${setup.sig})`, unit: queues(setup.sig) ? `at or above SIGRTMIN, which is ${SIGRTMIN}` : `below SIGRTMIN, which is ${SIGRTMIN}` },
    { name: "sent", value: `${setup.sends} x ${setup.via}()`, unit: "while the receiver had it blocked" },
    { name: "the receiver", value: setup.job, unit: "once per handler call, not once per send" },
    { name: "RLIMIT_SIGPENDING", value: String(setup.pendingLimit), unit: `per real user, and the queue holds one less than this` },
    { name: "also queued", value: others === 0 ? "nothing" : setup.alsoQueued.map(nameOf).join(", "), unit: others === 0 ? "this signal is the only one pending" : "one instance each, at the same moment" },
    { name: "unblocked", value: "all at once", unit: "so nothing here turns on a race" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "delivered":
      return claim.value === delivered(setup);
    case "lost":
      return claim.value === lost(setup);
    case "accepted":
      return claim.value === accepted(setup);
    case "queues":
      return claim.value === queues(setup.sig);
    case "firstHandler":
      return claim.value === firstHandler(setup);
    case "firstDequeued":
      return claim.value === firstDequeued(setup);
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
