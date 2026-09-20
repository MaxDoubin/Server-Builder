import type { Claim, Setup } from "./types";

export const PAGE_BYTES = 4096;

/**
 * What getsockopt(SO_RCVBUF) reports.
 *
 * Two different rules depending on whether anybody called setsockopt, which
 * is the source of most of the confusion here.
 *
 *   never set   the socket carries tcp_rmem[1] and reports it as it is
 *   set to n    sock_setsockopt stores min(n, rmem_max) * 2, and reports that
 *
 * Measured: a fresh socket reported 131072 against a tcp_rmem default of
 * 131072, a ratio of 1.0; setting that same 131072 reported 262144, a ratio
 * of 2.0. So the doubling is a property of the assignment, not of the field,
 * and reading the value before and after a change shows what looks like the
 * kernel rounding to a default and is not.
 */
export function reportedBytes(setup: Setup): number {
  if (setup.asks === null) return setup.tcpRmem[1];
  return Math.min(setup.asks, setup.rmemMax) * 2;
}

/** Whether the kernel is still free to resize this socket's buffer. */
export function autotuning(setup: Setup): boolean {
  return setup.asks === null;
}

/**
 * The largest this socket's receive buffer can ever become.
 *
 * Left alone, autotuning may take it to tcp_rmem[2]. Set by hand, it is
 * frozen at what setsockopt stored, which is capped at twice rmem_max. The
 * two ceilings are different sysctls and are routinely left at different
 * values, so which one applies depends on whether the program called
 * setsockopt at all.
 */
export function ceilingBytes(setup: Setup): number {
  return autotuning(setup) ? setup.tcpRmem[2] : reportedBytes(setup);
}

/**
 * Whether tuning the socket made its ceiling smaller than leaving it alone.
 *
 * Measured on this host: tcp_rmem[2] is 32 MiB and rmem_max is 4 MiB, so the
 * best a manually set socket can reach is 8 MiB, a quarter of what an
 * untouched one may reach. Asking for more is not an error, it is clamped.
 */
export function backfired(setup: Setup): boolean {
  return !autotuning(setup) && ceilingBytes(setup) < setup.tcpRmem[2];
}

/** tcp_mem's high mark read the way the kernel reads it, in pages. */
export function highMarkBytes(setup: Setup): number {
  return setup.tcpMemPages[2] * PAGE_BYTES;
}

/** And the same number read the way people read it, which is wrong. */
export function highMarkIfBytes(setup: Setup): number {
  return setup.tcpMemPages[2];
}

/**
 * Which of tcp_mem's three bands the machine's socket memory sits in.
 *
 * Under low the kernel never bothers accounting. Between low and pressure it
 * charges normally. Past pressure it enters the pressure state and starts
 * shrinking per socket buffers. Past high it refuses allocations outright.
 */
export function band(setup: Setup): string {
  const [low, pressure, high] = setup.tcpMemPages;
  if (setup.chargedPages >= high) return "above high";
  if (setup.chargedPages >= pressure) return "under pressure";
  if (setup.chargedPages >= low) return "charging normally";
  return "below low";
}

/** Pages this workload's sockets would charge at their ceiling. */
export function demandPages(setup: Setup): number {
  return Math.round((setup.sockets * ceilingBytes(setup)) / PAGE_BYTES);
}

/** A byte count a person would say out loud. */
export function human(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes / 1024 ** 3 >= 10 ? 0 : 2)} GiB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MiB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${bytes} B`;
}

/** The lines a reader would gather before answering, with their units named. */
export function asSysctl(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "net.ipv4.tcp_mem", value: setup.tcpMemPages.join("  "), unit: "PAGES: low, pressure, high" },
    { name: "net.ipv4.tcp_rmem", value: setup.tcpRmem.join("  "), unit: "bytes: min, default, max" },
    { name: "net.core.rmem_max", value: String(setup.rmemMax), unit: "bytes: the cap on what SO_RCVBUF may ask" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "reported":
      return claim.bytes === reportedBytes(setup);
    case "ceiling":
      return claim.bytes === ceilingBytes(setup);
    case "autotuning":
      return claim.value === autotuning(setup);
    case "backfired":
      return claim.value === backfired(setup);
    case "high-mark-gib":
      return claim.value === Math.round((highMarkBytes(setup) / 1024 ** 3) * 100) / 100;
    case "band":
      return claim.name === band(setup);
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
