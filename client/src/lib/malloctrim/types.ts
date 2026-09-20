/**
 * The memory you freed and still hold.
 *
 * Measured on Linux 6.18.44 with glibc 2.39, x86-64, 4 kB pages, single
 * threaded, by allocating a known working set, freeing a known part of it,
 * and reading RSS out of /proc/self/statm.
 *
 * FIRST, the probe's own bug, because it decided what could be measured at
 * all. The reader used fopen, fopen allocates a stdio buffer and touches it,
 * and so every reading taken after a free came out 64 kB higher than the
 * reading before it. The automatic trim looked as if it never fired at any
 * size. Nothing that can reach malloc may run between the two readings.
 *
 * SECOND, what free() does on its own. Twenty thousand kilobyte chunks, all
 * freed:
 *
 *     20000 x 1 kB allocated and touched      RSS  22092 kB
 *     all 20000 freed                         RSS   1912 kB
 *
 * Twenty megabytes, returned by free() with nothing else called. They
 * consolidate into the top chunk, the top chunk passes M_TRIM_THRESHOLD, and
 * free() calls sbrk down before it returns.
 *
 * THIRD, and this is the surface: keep one chunk and it returns nothing.
 *
 *                             after free()     after malloc_trim(0)
 *     keep none                  1908 kB              1780 kB
 *     keep every 100th          22084 kB              2788 kB
 *     keep every 10th           22084 kB             11892 kB
 *     keep every other          22084 kB             22084 kB
 *
 * One survivor anywhere above the low water mark and the top chunk never
 * grows, so free() does nothing at all. malloc_trim then releases whole free
 * pages anywhere in the arena, which means what comes back is decided by how
 * the survivors are spread and not by how many bytes they are. Every other
 * chunk live: no whole page is free anywhere and no call recovers a byte.
 *
 * Sixteen bytes is enough. An 8 MB block freed with nothing above it returns
 * 8 MB; the same block with a 16 byte allocation above it returns nothing.
 *
 * FOURTH, the mmap path, which is the one people remember, and which stops
 * working after one use:
 *
 *     round 1  10 MB allocated   RSS 11928 kB   mmapped 10489856
 *     round 1  freed             RSS  1684 kB   mmapped        0
 *     round 2  10 MB allocated   RSS 11924 kB   mmapped        0, from the heap
 *     round 2  freed             RSS 11924 kB   nothing came back
 *
 * The same call, the same size, the same process. Freeing an mmapped chunk
 * raises mmap_threshold to its size, so the second one comes from the heap.
 *
 * FIFTH, that adjustment also moves the trim threshold, to twice the new
 * value, and only while the chunk is at or under 32 MiB. So one allocation in
 * a band can switch the automatic trim off for the rest of the process:
 *
 *     9 MB in between     the 20 MB workload's free() gave it back
 *     10 to 31 MB         gave back nothing, on every later run
 *     32 MB and up        gave it back
 *
 * A 32 MB allocation is safer here than a 20 MB one.
 *
 * Not modeled: threads and the per-thread arenas, which are mmapped heaps on
 * a different rule; any allocator but glibc; MALLOC_ARENA_MAX; huge pages;
 * and whether the returned pages help under real pressure as opposed to
 * showing up in VmRSS.
 */

/** Where an allocation came from, which decides what freeing it does. */
export type Source = "heap" | "mmap";

/** How the freed chunks are distributed through the arena. */
export type Pattern =
  /** Every chunk freed, so they consolidate into one region at the top. */
  | "all freed"
  /** A few survivors, far apart, with whole free pages between them. */
  | "sparse survivors"
  /** Survivors every other chunk, so no whole page is free anywhere. */
  | "dense survivors"
  /** One survivor, allocated last, sitting above everything freed. */
  | "one on top";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** The process, likewise. */
  job: string;
  /** How many chunks the working set holds. */
  chunks: number;
  /** How big each one is, in bytes. */
  chunkBytes: number;
  /** How the freed chunks are laid out afterwards. */
  pattern: Pattern;
  /**
   * One chunk in every this many survives, for the two survivor patterns.
   *
   * The spacing rather than the count, because the spacing is what decides
   * everything here and a count would have to be turned back into one. A
   * survivor count derived from a count would also be a formula in the model
   * for the gate to agree with; this way the gate counts the survivors it
   * places and the model states how many there should be, and they have to
   * match. Ignored by the patterns that do not have survivors.
   */
  everyNth: number;
  /**
   * The size in bytes of one allocate-touch-free that happened earlier in
   * this process, or 0 for none.
   *
   * In bytes rather than mebibytes because the boundaries that matter are not
   * on mebibyte lines: the adjustment stops at a recorded mapping of exactly
   * 33554432, which a whole number of mebibytes can never produce, so a
   * mebibyte field cannot express the case that decides it.
   */
  earlierBytes: number;
  /** Whether the code calls malloc_trim(0) after freeing. */
  trims: boolean;
  /**
   * What mallopt pinned M_MMAP_THRESHOLD to, in bytes, or 0 for no call.
   *
   * Pinning it also sets no_dyn_threshold, so the adjustment described above
   * never happens again. It does not touch M_TRIM_THRESHOLD, which stays
   * where glibc left it.
   */
  pinnedBytes: number;
}

export type Claim =
  /** What free() alone gives back to the operating system, in KiB. */
  | { about: "freeReturns"; value: number }
  /** What the process still holds once everything it does has been done, in KiB. */
  | { about: "held"; value: number }
  /** Whether free() alone returns anything at all. */
  | { about: "freeHelps"; value: boolean }
  /** Whether calling malloc_trim(0) would return anything free() did not. */
  | { about: "trimHelps"; value: boolean }
  /** Where the working set's chunks come from. */
  | { about: "source"; value: Source }
  /** A claim about something this model does not decide. It never holds. */
  | { about: "nothing" };

export interface Option {
  id: string;
  claim: string;
  says: Claim;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  setup: Setup;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
