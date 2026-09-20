import type { Claim, Setup } from "./types";

const MODE_NAMES: Record<0 | 1 | 2, string> = {
  0: "heuristic",
  1: "always",
  2: "strict",
};

/** What the mode is called, rather than what the number is. */
export function modeName(setup: Setup): string {
  return MODE_NAMES[setup.mode];
}

/** The page size every /proc/meminfo figure here is a multiple of. */
export const PAGE_KB = 4;

/**
 * CommitLimit, the way vm_commit_limit computes it: in PAGES.
 *
 * Swap is added whole and the ratio applies to RAM alone, so a machine with
 * no swap and the default ratio of 50 has a limit of half its memory.
 * vm.overcommit_kbytes, when set, replaces the ratio rather than adding to it.
 *
 * The page arithmetic is not a detail. Working in kilobytes and rounding at
 * the end gives 8240990 kB on the host this was written on, and /proc/meminfo
 * reports 8240988. The kernel floors a page count and then multiplies, so the
 * remainder is lost before the conversion, not after. Doing it in pages
 * reproduces all five measured ratios exactly instead of explaining them away
 * as rounding.
 */
export function commitLimitKb(setup: Setup): number {
  const swapPages = Math.floor(setup.swapKb / PAGE_KB);
  const allowed =
    setup.kbytes > 0
      ? Math.floor(setup.kbytes / PAGE_KB)
      : Math.floor((Math.floor(setup.ramKb / PAGE_KB) * setup.ratio) / 100);
  return (allowed + swapPages) * PAGE_KB;
}

/** The limit against the hardware, which is the comparison that surprises people. */
export function limitPercentOfRam(setup: Setup): number {
  return Math.round((100 * commitLimitKb(setup)) / setup.ramKb);
}

/** Reservations already made, against the limit rather than against memory. */
export function committedPercentOfLimit(setup: Setup): number {
  return Math.round((100 * setup.committedKb) / commitLimitKb(setup));
}

/** The same reservations against the hardware. Rarely the same number. */
export function committedPercentOfRam(setup: Setup): number {
  return Math.round((100 * setup.committedKb) / setup.ramKb);
}

/** What is left before the wall. Negative when the limit is already passed. */
export function headroomKb(setup: Setup): number {
  return commitLimitKb(setup) - setup.committedKb;
}

/**
 * Whether this allocation is refused.
 *
 * Only strict accounting refuses on the running total. The heuristic judges
 * one request at a time and lets the total pass the limit without comment,
 * and mode 1 never refuses at all.
 */
export function refuses(setup: Setup): boolean {
  if (setup.mode !== 2) return false;
  return setup.committedKb + setup.wantKb > commitLimitKb(setup);
}

/**
 * Whether the accounting can still be satisfied while the memory is not.
 *
 * Derived from the limit against the hardware rather than asserted, because
 * that is the case where strict mode hands out promises the machine cannot
 * keep: a ratio over 100, or overcommit_kbytes set above RAM plus swap.
 */
export function oomPossible(setup: Setup): boolean {
  return commitLimitKb(setup) > setup.ramKb + setup.swapKb;
}

/** Whether refusing this allocation leaves memory sitting unused. */
export function refusesWithMemoryFree(setup: Setup): boolean {
  return refuses(setup) && setup.wantKb <= setup.availableKb;
}

/** Gibibytes, for prose. Whole numbers stay whole. */
export function human(kb: number): string {
  const gib = kb / 1048576;
  if (Math.abs(gib) >= 10) return `${gib.toFixed(1)} GiB`;
  return `${gib.toFixed(2)} GiB`;
}

/** The lines a reader would gather before answering, with their units named. */
export function asSysctl(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "vm.overcommit_memory", value: String(setup.mode), unit: `0 heuristic, 1 always, 2 strict: ${modeName(setup)}` },
    { name: "vm.overcommit_ratio", value: String(setup.ratio), unit: "percent of RAM ALONE, swap is added whole" },
    { name: "vm.overcommit_kbytes", value: String(setup.kbytes), unit: setup.kbytes > 0 ? "set, so the ratio is ignored" : "unset, so the ratio applies" },
    { name: "MemTotal", value: String(setup.ramKb), unit: `kB, ${human(setup.ramKb)}` },
    { name: "SwapTotal", value: String(setup.swapKb), unit: `kB, ${human(setup.swapKb)}` },
    { name: "CommitLimit", value: String(commitLimitKb(setup)), unit: `kB, ${limitPercentOfRam(setup)} percent of RAM` },
    { name: "Committed_AS", value: String(setup.committedKb), unit: "kB, RESERVED not touched" },
    { name: "MemAvailable", value: String(setup.availableKb), unit: `kB, ${human(setup.availableKb)} a process could really use` },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "limit-kb":
      return claim.value === commitLimitKb(setup);
    case "limit-pct-of-ram":
      return claim.value === limitPercentOfRam(setup);
    case "headroom-kb":
      return claim.value === headroomKb(setup);
    case "refuses":
      return claim.value === refuses(setup);
    case "oom-possible":
      return claim.value === oomPossible(setup);
    case "mode":
      return claim.name === modeName(setup);
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
