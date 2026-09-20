import type { Attempt, Claim, Setup, Store } from "./types";

/** The page size on the machine all of this was measured on. */
export const PAGE_KB = 4;

/** What this job's bytes cost, rounded to whole pages the way the kernel bills. */
export function costKb(setup: Setup): number {
  return Math.ceil(Math.max(0, setup.wroteKb) / PAGE_KB) * PAGE_KB;
}

/** Whether tmpfs is where it went, which is the whole question. */
export function pinned(setup: Setup): boolean {
  return setup.store === "tmpfs";
}

/**
 * Shmem, which is where tmpfs lands and an ordinary file does not.
 *
 * This is the figure that tells the two apart, and it is the one `free` prints
 * under "shared", which is the column nobody reads.
 */
export function shared(setup: Setup): number {
  return setup.baseShmemKb + (pinned(setup) ? costKb(setup) : 0);
}

/** Cached, which is both of them: Shmem is inside it. */
export function cached(setup: Setup): number {
  return setup.baseCacheKb + costKb(setup);
}

/**
 * What free prints in its buff/cache column.
 *
 * Measured against one atomic copy of /proc/meminfo: Buffers plus Cached plus
 * SReclaimable, to the kibibyte.
 */
export function buffCache(setup: Setup): number {
  return setup.buffersKb + cached(setup) + setup.reclaimableKb;
}

/** The part of that column that is ordinary page cache and nothing else. */
export function reclaimableCache(setup: Setup): number {
  return cached(setup) - shared(setup);
}

/**
 * What the attempt actually hands back, in kibibytes.
 *
 * drop_caches drops clean, unmapped page cache and the reclaimable slab. It
 * does not touch Shmem, which has nowhere to be written back to, and it does
 * not touch the page cache that was already there before this job ran: the
 * first version of this model said it did, and the measurement disagreed.
 * Cached went 212780 to 1261688 to 212360, so the gibibyte came back and the
 * 212 MB baseline stayed, because most of a baseline like that is the mapped
 * pages of everything currently running.
 *
 * Deleting frees a tmpfs file and does not free an ordinary file's cache,
 * which is already reclaimable and simply stops being interesting. And
 * deleting frees nothing at all while a descriptor is still open.
 */
export function freed(setup: Setup): number {
  switch (setup.attempt) {
    case "nothing":
      return 0;
    case "drop_caches":
      return (pinned(setup) ? 0 : costKb(setup)) + setup.reclaimableKb;
    case "delete":
      return pinned(setup) ? costKb(setup) : 0;
    case "delete while open":
      return 0;
  }
}

/** What the column reads once the attempt is done. */
export function after(setup: Setup): number {
  return buffCache(setup) - freed(setup);
}

/** Whether this job's own bytes are still resident afterwards. */
export function survives(setup: Setup): boolean {
  if (setup.attempt === "delete" && pinned(setup)) return false;
  if (setup.attempt === "drop_caches" && !pinned(setup)) return false;
  return true;
}

/**
 * What this job cost MemAvailable, which is the figure that was right all along.
 *
 * Stated as a cost rather than as an absolute, because a cost is what was
 * measured: writing a gibibyte to an ordinary file left MemAvailable where it
 * was, and writing the same gibibyte to tmpfs took the whole of it. The
 * absolute figure involves the watermarks and was not measured, so it is not
 * claimed here.
 */
export function availableCostKb(setup: Setup): number {
  return pinned(setup) ? costKb(setup) : 0;
}

/** Whether this job is visible in the one column that reports it honestly. */
export function honestColumn(setup: Setup): string {
  return pinned(setup) ? "MemAvailable, and Shmem" : "neither, and that is correct";
}

/** A size, written the way a reader would say it. */
export function asSize(kb: number): string {
  if (kb >= 1024 * 1024) return `${Number((kb / 1024 / 1024).toFixed(2))} GiB`;
  if (kb >= 1024) return `${Number((kb / 1024).toFixed(1))} MiB`;
  return `${kb} kB`;
}

/** What was tried, as a person would say it. */
export function asAttempt(attempt: Attempt): string {
  switch (attempt) {
    case "nothing":
      return "nothing yet";
    case "drop_caches":
      return "echo 3 > /proc/sys/vm/drop_caches";
    case "delete":
      return "rm the file";
    case "delete while open":
      return "rm the file, with a process still holding it open";
  }
}

/** Where the bytes are, as a mount would say it. */
export function asStore(store: Store): string {
  return store === "tmpfs" ? "tmpfs" : "an ordinary file on disk";
}

/** The lines a reader would gather before answering. */
export function asPagecache(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    {
      name: "the machine",
      value: asSize(setup.totalKb),
      unit: `${setup.host}, and ${setup.job} is what put the bytes there`,
    },
    {
      name: "what it wrote",
      value: asSize(costKb(setup)),
      unit: `into ${asStore(setup.store)}, rounded to whole pages of ${PAGE_KB} kB`,
    },
    {
      name: "Cached",
      value: asSize(cached(setup)),
      unit: `${asSize(setup.baseCacheKb)} was already there, and Shmem is inside this figure`,
    },
    {
      name: "Shmem",
      value: asSize(shared(setup)),
      unit: pinned(setup)
        ? "tmpfs lands here as well as in Cached, and free prints this under shared"
        : "an ordinary file does not land here, which is the whole difference",
    },
    {
      name: "buff/cache",
      value: asSize(buffCache(setup)),
      unit: `Buffers plus Cached plus SReclaimable, which is ${asSize(setup.buffersKb)} plus ${asSize(cached(setup))} plus ${asSize(setup.reclaimableKb)}`,
    },
    {
      name: "what was tried",
      value: asAttempt(setup.attempt),
      unit: "and the question is how much of that column comes back",
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "buffCache":
      return claim.value === buffCache(setup);
    case "shared":
      return claim.value === shared(setup);
    case "freed":
      return claim.value === freed(setup);
    case "after":
      return claim.value === after(setup);
    case "survives":
      return claim.value === survives(setup);
    case "availableCost":
      return claim.value === availableCostKb(setup);
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
