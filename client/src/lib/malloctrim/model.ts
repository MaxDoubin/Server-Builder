import type { Claim, Pattern, Setup, Source } from "./types";

/** The page on the machine all of this was measured on. */
export const PAGE = 4096;

/** glibc's smallest chunk on 64-bit, and the granularity it rounds to. */
export const MIN_CHUNK = 32;
export const ALIGN = 16;

/** M_MMAP_THRESHOLD, M_TRIM_THRESHOLD and M_TOP_PAD, as glibc ships them. */
export const DEFAULT_MMAP_THRESHOLD = 131072;
export const DEFAULT_TRIM_THRESHOLD = 131072;
export const TOP_PAD = 131072;

/**
 * DEFAULT_MMAP_THRESHOLD_MAX, 32 MiB on 64-bit.
 *
 * The ceiling on the dynamic adjustment, and the reason a 32 MiB allocation
 * behaves better than a 20 MiB one: a chunk larger than this does not move
 * the thresholds at all.
 */
export const MMAP_THRESHOLD_MAX = 32 * 1024 * 1024;

/**
 * The chunk glibc cuts for a request of this size.
 *
 * The size field of the next chunk doubles as the last eight bytes of this
 * one, so a request needs its length plus eight, rounded up to sixteen. A
 * 1024 byte request is a 1040 byte chunk, which is what the measured 20000
 * chunks came to: 20.8 MB of heap for 20 MB asked for.
 */
export function chunkSpan(setup: Setup): number {
  return Math.max(MIN_CHUNK, Math.ceil((setup.chunkBytes + 8) / ALIGN) * ALIGN);
}

/** What an mmapped chunk for a request of this size costs, which is whole pages. */
export function mappingFor(bytes: number): number {
  return Math.ceil((bytes + ALIGN) / PAGE) * PAGE;
}

/** What one mmapped chunk of the working set costs. */
export function mmapSpan(setup: Setup): number {
  return mappingFor(setup.chunkBytes);
}

/**
 * The size glibc records for the earlier block, which is its whole mapping.
 *
 * Not the size asked for. An mmapped chunk's recorded size is the mapping,
 * rounded up to a page, and that rounded figure is what becomes the new
 * threshold. It matters: a 10 MiB block maps 10489856 bytes, so the next
 * 10 MiB request, whose chunk is 10485776 bytes, is under the new threshold
 * and comes from the heap. Measured exactly that way.
 */
export function earlierChunk(setup: Setup): number {
  return setup.earlierBytes > 0 ? mappingFor(setup.earlierBytes) : 0;
}

/**
 * Whether the earlier allocation moved the thresholds.
 *
 * Freeing an mmapped chunk sets mmap_threshold to that chunk's size and
 * trim_threshold to twice it, but only for a chunk at or under 32 MiB. A
 * mallopt call pins both and switches the adjustment off for good.
 */
export function adjusted(setup: Setup): boolean {
  if (setup.pinnedBytes > 0 || setup.earlierBytes <= 0) return false;
  const chunk = earlierChunk(setup);
  return chunk > DEFAULT_MMAP_THRESHOLD && chunk <= MMAP_THRESHOLD_MAX;
}

/** The size at which an allocation goes to mmap instead of the heap. */
export function mmapThreshold(setup: Setup): number {
  if (setup.pinnedBytes > 0) return setup.pinnedBytes;
  return adjusted(setup) ? earlierChunk(setup) : DEFAULT_MMAP_THRESHOLD;
}

/**
 * The free space at the top of the heap that makes free() call sbrk down.
 *
 * Twice the mapping that moved the pair, and otherwise the default. Note
 * which figure it doubles: the mapping that was freed, not the current mmap
 * threshold, because mallopt can have set that to something unrelated.
 * Pinning M_MMAP_THRESHOLD leaves this at the default, since mallopt on one
 * of the pair does not set the other; what it does is stop the pair ever
 * being adjusted together, which is what adjusted() reports.
 *
 * This used to short circuit on pinnedBytes before asking adjusted(), which
 * meant adjusted() decided nothing numeric at all when a threshold was
 * pinned, and blinding away its guard changed no figure anywhere. Going
 * through adjusted() for both is both simpler and checkable.
 */
export function trimThreshold(setup: Setup): number {
  return adjusted(setup) ? 2 * earlierChunk(setup) : DEFAULT_TRIM_THRESHOLD;
}

/** Where the working set's chunks come from. */
export function source(setup: Setup): Source {
  return chunkSpan(setup) >= mmapThreshold(setup) ? "mmap" : "heap";
}

/** How many chunks are still live once the freeing is done. */
export function liveCount(setup: Setup): number {
  switch (setup.pattern) {
    case "all freed":
      return 0;
    case "one on top":
      return 1;
    case "sparse survivors":
    case "dense survivors":
      /* Chunks 0, N, 2N and so on, for as many as fit. */
      return setup.everyNth > 0 ? Math.ceil(setup.chunks / setup.everyNth) : 0;
  }
}

/**
 * How many chunks apart the survivors sit, or nought when there is no spacing.
 *
 * One survivor has no spacing, and saying it is the whole heap wide put "20000
 * chunks apart" in front of a reader looking at a single live chunk. Nought
 * says there is nothing to space.
 */
export function strideChunks(setup: Setup): number {
  if (setup.pattern === "all freed" || setup.pattern === "one on top") return 0;
  return Math.max(1, setup.everyNth);
}

/**
 * Whether the survivors are packed too closely for any whole page to be free.
 *
 * This is the line between a heap that malloc_trim can empty and one nothing
 * can. It is not about how many bytes survive: measured, 10 MB of survivors
 * every other chunk released nothing and 2 MB of survivors every tenth chunk
 * released 10 MB.
 *
 * It was written as an inequality on the gap, gap < PAGE, and that is wrong
 * in both directions, because a gap of a page only holds a whole page when it
 * happens to be aligned to one. Survivors 8224 bytes apart with 4112 byte
 * chunks leave a 4112 byte gap and not one free page in it. So the question
 * is asked of the pages rather than of the arithmetic: are all the pages the
 * survivors reach across occupied.
 */
export function dense(setup: Setup): boolean {
  const live = liveCount(setup);
  if (live < 2) return false;
  return pagesPinned(setup) === pagesSpanned(setup);
}

/** How many pages the survivors reach across, from the first to the last. */
export function pagesSpanned(setup: Setup): number {
  const live = liveCount(setup);
  if (live <= 0) return 0;
  const first = Math.floor(offsetOf(setup, 0) / PAGE);
  const last = Math.floor((offsetOf(setup, live - 1) + chunkSpan(setup) - 1) / PAGE);
  return last - first + 1;
}

/** Where survivor number k sits in the arena, in bytes from the bottom. */
export function offsetOf(setup: Setup, k: number): number {
  if (setup.pattern === "one on top") return (setup.chunks - 1) * chunkSpan(setup);
  return k * strideChunks(setup) * chunkSpan(setup);
}

/** What the working set costs at its peak, with every chunk touched. */
export function peak(setup: Setup): number {
  return source(setup) === "mmap"
    ? setup.chunks * mmapSpan(setup)
    : setup.chunks * chunkSpan(setup);
}

/** The contiguous free space at the top of the heap once the freeing is done. */
export function topFree(setup: Setup): number {
  if (source(setup) === "mmap") return 0;
  const live = liveCount(setup);
  if (live <= 0) return peak(setup);
  /*
    Everything above the last survivor, which is all brk can reach. The first
    version of this said a stride's worth, which is right for a heap whose
    survivors run all the way up and wrong for every other, and the gate's
    own layout caught it on a heap of one chunk.
  */
  const lastEnd = offsetOf(setup, live - 1) + chunkSpan(setup);
  return Math.max(0, peak(setup) - lastEnd);
}

/**
 * What free() gives back to the operating system on its own.
 *
 * An mmapped chunk is munmapped the moment it is freed, so every freed chunk
 * goes. A heap chunk goes only if what it leaves at the top passes the trim
 * threshold, and even then M_TOP_PAD stays behind.
 */
export function freeReturns(setup: Setup): number {
  if (source(setup) === "mmap") {
    return (setup.chunks - liveCount(setup)) * mmapSpan(setup);
  }
  const top = topFree(setup);
  /*
    Whether this reads < or <= cannot be observed, and blinding it found that
    out rather than finding a hole. M_TOP_PAD and M_TRIM_THRESHOLD are both
    128 kB, so at exactly the threshold the line below already yields nought,
    and below it the subtraction goes negative and the max clamps it. The
    guard earns its place only once the threshold has been raised, where twice
    a freed mapping puts it far above anything the line would return; that is
    the band, and it is checked.
  */
  if (top < trimThreshold(setup)) return 0;
  return Math.max(0, Math.floor((top - TOP_PAD) / PAGE) * PAGE);
}

/** What the process is still holding once free() has returned. */
export function afterFree(setup: Setup): number {
  return Math.max(0, peak(setup) - freeReturns(setup));
}

/**
 * The pages a surviving chunk sits in, which nothing can release.
 *
 * Survivors are walked in order and their page ranges unioned, because two
 * that sit close together can share a page and it must not be counted twice.
 */
export function pagesPinned(setup: Setup): number {
  const live = liveCount(setup);
  if (live <= 0) return 0;
  if (source(setup) === "mmap") return live * (mmapSpan(setup) / PAGE);
  const span = chunkSpan(setup);
  let pages = 0;
  let lastPage = -1;
  for (let k = 0; k < live; k += 1) {
    const at = offsetOf(setup, k);
    const first = Math.floor(at / PAGE);
    const last = Math.floor((at + span - 1) / PAGE);
    const from = Math.max(first, lastPage + 1);
    if (last >= from) {
      pages += last - from + 1;
      lastPage = last;
    }
  }
  return pages;
}

/**
 * What would still be held after malloc_trim(0).
 *
 * It releases whole free pages anywhere in the arena, not only at the top, so
 * what is left is exactly the pages a survivor sits in.
 */
export function heldAfterTrim(setup: Setup): number {
  return Math.min(afterFree(setup), pagesPinned(setup) * PAGE);
}

/** What the process holds once it has done everything it is going to do. */
export function held(setup: Setup): number {
  return setup.trims ? heldAfterTrim(setup) : afterFree(setup);
}

/** Whether free() alone returns anything at all. */
export function freeHelps(setup: Setup): boolean {
  return freeReturns(setup) > 0;
}

/** Whether calling malloc_trim(0) would return anything free() did not. */
export function trimHelps(setup: Setup): boolean {
  return afterFree(setup) - heldAfterTrim(setup) >= PAGE;
}

/** A size in kibibytes, which is the unit every claim here is in. */
export function kib(bytes: number): number {
  return Math.round(bytes / 1024);
}

/** A size written the way a reader would say it. */
export function asBytes(value: number): string {
  if (value === 0) return "nothing";
  if (value >= 1024 * 1024) return `${Number((value / 1024 / 1024).toFixed(2))} MiB`;
  if (value >= 1024) return `${Number((value / 1024).toFixed(1))} KiB`;
  return `${value} bytes`;
}

/** What the pattern is called, as somebody would describe the heap. */
export function asPattern(pattern: Pattern): string {
  switch (pattern) {
    case "all freed":
      return "every chunk freed";
    case "sparse survivors":
      return "a few survivors, far apart";
    case "dense survivors":
      return "survivors every other chunk";
    case "one on top":
      return "one survivor, allocated last";
  }
}

/** Where the chunks came from, in the terms the allocator uses. */
export function asSource(value: Source): string {
  return value === "mmap" ? "mmap, one mapping each" : "the heap, carved from brk";
}

/** The lines a reader would gather before answering. */
export function asMalloctrim(setup: Setup): { name: string; value: string; unit: string }[] {
  const live = liveCount(setup);
  return [
    {
      name: "the working set",
      value: `${setup.chunks} x ${asBytes(setup.chunkBytes)}`,
      unit: `${setup.job} on ${setup.host}, ${asBytes(peak(setup))} of it once every chunk is touched`,
    },
    {
      name: "chunk size",
      value: asBytes(chunkSpan(setup)),
      unit: "what glibc cuts for that request, which is the length plus eight rounded up to sixteen",
    },
    {
      name: "where from",
      value: asSource(source(setup)),
      unit: `the threshold is ${asBytes(mmapThreshold(setup))}${adjusted(setup) ? ", raised by the earlier free" : ""}`,
    },
    {
      name: "still live",
      value: live === 0 ? "nothing, all freed" : `${live}, ${asPattern(setup.pattern)}`,
      unit:
        live === 0
          ? "so every chunk can consolidate into one region at the top"
          : strideChunks(setup) === 0
            ? `the last one allocated, so ${asBytes(topFree(setup))} of the heap is above it`
            : `${strideChunks(setup)} chunks apart, which is ${asBytes((strideChunks(setup) - 1) * chunkSpan(setup))} of free space between them`,
    },
    {
      name: "free at the top",
      value: asBytes(topFree(setup)),
      unit: `free() calls sbrk down at ${asBytes(trimThreshold(setup))} and leaves ${asBytes(TOP_PAD)} behind`,
    },
    {
      name: "earlier in this process",
      value: setup.earlierBytes > 0 ? `one ${asBytes(setup.earlierBytes)} block, freed` : "nothing over the threshold",
      unit: setup.pinnedBytes > 0
        ? `and mallopt pinned M_MMAP_THRESHOLD at ${asBytes(setup.pinnedBytes)}, which stops it ever being adjusted`
        : adjusted(setup)
          ? "which is at or under 32 MiB, so it moved both thresholds and they stay moved"
          : "so both thresholds are where glibc left them",
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "freeReturns":
      return claim.value === kib(freeReturns(setup));
    case "held":
      return claim.value === kib(held(setup));
    case "freeHelps":
      return claim.value === freeHelps(setup);
    case "trimHelps":
      return claim.value === trimHelps(setup);
    case "source":
      return claim.value === source(setup);
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
