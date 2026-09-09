/**
 * si_mem_available(), transcribed.
 *
 * This is one of the few kernel functions short enough to model exactly, so
 * it is modeled exactly rather than approximated, and the approximation
 * everybody carries ("half the cache is available") turns out to be the
 * small-machine case of a min() that usually goes the other way.
 *
 * From mm/show_mem.c:
 *
 *   available = NR_FREE_PAGES - totalreserve_pages;
 *   pagecache = NR_ACTIVE_FILE + NR_INACTIVE_FILE;
 *   pagecache -= min(pagecache / 2, wmark_low);
 *   available += pagecache;
 *   reclaimable = NR_SLAB_RECLAIMABLE_B + NR_KERNEL_MISC_RECLAIMABLE;
 *   reclaimable -= min(reclaimable / 2, wmark_low);
 *   available += reclaimable;
 *   if (available < 0) available = 0;
 */

import type { Case, Estimate, Option, Setup } from "./types";

/** The page cache, which is both file lists together. */
export const pageCache = (setup: Setup): number => setup.activeFile + setup.inactiveFile;

/** Slab and other kernel memory the kernel is willing to give back. */
export const reclaimable = (setup: Setup): number =>
  setup.slabReclaimable + setup.kernelMiscReclaimable;

/**
 * MemAvailable, part by part.
 *
 * The subtraction is `min(half of it, the low watermark)` and which arm wins
 * decides the whole character of the answer. On a machine with a lot of
 * cache the watermark is much smaller than half the cache, so the watermark
 * is subtracted and nearly all of the cache counts as available. On a
 * machine with little cache, half of it is smaller, so half is kept back.
 * The version people remember is the second case, and most servers are the
 * first.
 */
export function estimate(setup: Setup): Estimate {
  const cache = pageCache(setup);
  const cacheHeld = Math.min(Math.floor(cache / 2), setup.watermarkLow);
  const slab = reclaimable(setup);
  const slabHeld = Math.min(Math.floor(slab / 2), setup.watermarkLow);

  const fromFree = setup.free - setup.totalReserve;
  const fromCache = cache - cacheHeld;
  const fromSlab = slab - slabHeld;

  return {
    fromFree,
    fromCache,
    fromSlab,
    cacheHeld,
    cacheHeldBy: Math.floor(cache / 2) <= setup.watermarkLow ? "half the cache" : "the low watermark",
    available: Math.max(0, fromFree + fromCache + fromSlab),
  };
}

/** MemAvailable, as /proc/meminfo prints it. */
export const available = (setup: Setup): number => estimate(setup).available;

/**
 * How much of MemAvailable is not really available.
 *
 * tmpfs and shared memory live on the file LRU lists, so they are inside
 * NR_ACTIVE_FILE and NR_INACTIVE_FILE and the estimate counts them. Nothing
 * frees them under pressure: a tmpfs page can only go to swap, and on a host
 * with no swap it cannot go anywhere. The estimate counts all but the held
 * back portion of the cache, and shmem is a share of that.
 *
 * Zero when there is swap, because then the pages can at least move.
 */
export function overstatedBy(setup: Setup): number {
  if (setup.swapTotal > 0) return 0;
  const cache = pageCache(setup);
  if (cache === 0) return 0;
  const counted = estimate(setup).fromCache;
  return Math.min(setup.shmem, Math.max(0, Math.round((setup.shmem / cache) * counted)));
}

/** What a process can have without the machine swapping or killing anything. */
export const trulyAvailable = (setup: Setup): number =>
  Math.max(0, available(setup) - overstatedBy(setup));

/**
 * What could be had without waiting for a disk, which is not a kernel figure.
 *
 * si_mem_available does not subtract Dirty and this function is not claiming
 * it does. It is a separate question with a separate answer: a dirty page is
 * counted as available because it will become available, and it becomes
 * available at the speed of the device under it. On a host with eight
 * gigabytes of dirty pages against a slow disk, MemAvailable is telling the
 * truth about the destination and nothing about the journey, and an
 * allocation that large stalls in writeback rather than failing.
 *
 * Kept separate from available() for exactly that reason: one is what
 * /proc/meminfo prints and the other is an operational reading of it, and
 * conflating them would put a number on this page that no machine would
 * agree with.
 */
export const withoutWaiting = (setup: Setup): number =>
  Math.max(0, trulyAvailable(setup) - setup.dirty);

/**
 * The `used` column of `free`, which is a residue rather than a quantity.
 *
 * total minus free minus buff/cache. Nothing chose it and nothing tracks it:
 * it moves whenever the page cache moves, which is constantly, and it is the
 * column people screenshot.
 */
export const used = (setup: Setup): number =>
  setup.total - setup.free - (pageCache(setup) + setup.slabReclaimable);

/** Does the allocation the case describes fit? */
export const fits = (setup: Setup): boolean => setup.wants <= trulyAvailable(setup);

/** Does a claim hold of a machine? */
export function holds(claim: Case["options"][number]["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "available":
      return available(setup) === claim.value;
    case "free":
      return setup.free === claim.value;
    case "fits":
      return fits(setup);
    case "does-not-fit":
      return !fits(setup);
    case "overstates-by":
      return overstatedBy(setup) === claim.value;
    case "without-waiting":
      return withoutWaiting(setup) === claim.value;
    case "used":
      return used(setup) === claim.value;
    case "nothing":
      return false;
  }
}

/** Every option whose claim holds of what the model computed. */
export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

/**
 * The option that is right, found rather than declared.
 *
 * The data carries the fields of /proc/meminfo. The model runs
 * si_mem_available over them. CI requires exactly one option to hold.
 */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** Kibibytes as `free -h` would print them. */
export function human(kib: number): string {
  if (kib >= 1024 * 1024) return `${(kib / 1024 / 1024).toFixed(1)}Gi`;
  if (kib >= 1024) return `${Math.round(kib / 1024)}Mi`;
  return `${kib}Ki`;
}

/** The lines of /proc/meminfo this estimate is built from. */
export function asMeminfo(setup: Setup): string {
  const row = (name: string, value: number) =>
    `${(name + ":").padEnd(16)}${String(value).padStart(12)} kB`;
  return [
    row("MemTotal", setup.total),
    row("MemFree", setup.free),
    row("MemAvailable", available(setup)),
    row("Active(file)", setup.activeFile),
    row("Inactive(file)", setup.inactiveFile),
    row("Dirty", setup.dirty),
    row("Shmem", setup.shmem),
    row("SReclaimable", setup.slabReclaimable),
    row("KReclaimable", setup.slabReclaimable + setup.kernelMiscReclaimable),
    row("SwapTotal", setup.swapTotal),
  ].join("\n");
}

/**
 * What `free -h` prints, which is where most people look first.
 *
 * used is total minus free minus buff/cache, which is why it moves when the
 * cache does and is not a quantity anybody chose.
 */
export function asFree(setup: Setup): string {
  const buffCache = pageCache(setup) + setup.slabReclaimable;
  const pad = (s: string) => s.padStart(7);
  return [
    `               total        used        free      shared  buff/cache   available`,
    `Mem:     ${pad(human(setup.total))}     ${pad(human(used(setup)))}     ${pad(human(setup.free))}     ` +
      `${pad(human(setup.shmem))}     ${pad(human(buffCache))}     ${pad(human(available(setup)))}`,
    `Swap:    ${pad(human(setup.swapTotal))}     ${pad(human(0))}     ${pad(human(setup.swapTotal))}`,
  ].join("\n");
}
