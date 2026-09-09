/**
 * Two hundred megabytes free, and the machine is fine.
 *
 * `free -h` prints a column called "free" and a column called "available",
 * and almost everybody reads the first one. On a server that has been up for
 * a week the first one is always small, because an operating system that
 * leaves memory unused is wasting it: the page cache grows until something
 * needs the space back.
 *
 * MemAvailable is the number that answers the question people are asking,
 * and it is not a measurement. The kernel comment above si_mem_available
 * calls it an estimate of what userspace can allocate "without causing
 * swapping or OOM", and the estimate has three parts and two subtractions.
 *
 *   free, less the reserves the kernel will not hand out
 *   plus the page cache, less whatever it decides has to stay
 *   plus reclaimable slab, less the same
 *
 * The subtraction is the interesting half: `min(half of it, the low
 * watermark)`. On a host with thirty gigabytes of cache the low watermark
 * wins and almost all the cache counts. On one with two hundred megabytes of
 * cache the half wins and only half of it does. So the shape of the estimate
 * changes with the size of the machine, which is why the folklore version
 * ("half the cache") is right on a laptop and wrong on a server.
 *
 * And it can be wrong in the other direction, because tmpfs and shared
 * memory sit on the file lists and are counted as cache, and no amount of
 * pressure will free them without swap.
 *
 * Nothing here models zones or NUMA nodes. One machine against one estimate
 * is where all of these go wrong.
 */

/** Everything in kibibytes, which is what /proc/meminfo uses. */
export interface Setup {
  /** MemTotal. */
  total: number;
  /** MemFree, the pages on nobody's list at all. */
  free: number;
  /** Pages the kernel keeps back and will not allocate from. */
  totalReserve: number;
  /** The sum of every zone's low watermark. */
  watermarkLow: number;
  /** Active(file), the page cache in recent use. */
  activeFile: number;
  /** Inactive(file), the page cache that is a candidate to drop. */
  inactiveFile: number;
  /**
   * Shmem: tmpfs and shared memory.
   *
   * Counted inside the file lists above, because that is where those pages
   * live, and not reclaimable without swap. Carried separately so the model
   * can say how much of the estimate is not real.
   */
  shmem: number;
  /** Dirty pages, which have to be written before they can be dropped. */
  dirty: number;
  /** SReclaimable, the slab the kernel can give back under pressure. */
  slabReclaimable: number;
  /** KReclaimable beyond slab, mostly other kernel caches. */
  kernelMiscReclaimable: number;
  /** SwapTotal, so a case can have none. */
  swapTotal: number;
  /** How much a process is about to try to allocate. */
  wants: number;
}

/** The three parts of the estimate, each after its own subtraction. */
export interface Estimate {
  /** free minus totalreserve, floored at nothing sensible: it may be negative. */
  fromFree: number;
  /** The page cache contribution, after keeping some back. */
  fromCache: number;
  /** The reclaimable slab contribution, after keeping some back. */
  fromSlab: number;
  /** What the kernel keeps back out of the cache, and why. */
  cacheHeld: number;
  cacheHeldBy: "half the cache" | "the low watermark";
  /** MemAvailable itself, floored at zero the way the kernel floors it. */
  available: number;
}

/**
 * A claim about a machine.
 *
 * Five shapes. The two that carry the lesson are what MemAvailable actually
 * says, which almost nobody reads, and whether an allocation succeeds, which
 * is the question behind every reading of this file.
 */
export type Claim =
  /** MemAvailable, in kibibytes. */
  | { about: "available"; value: number }
  /** MemFree, in kibibytes, for the option that reads the wrong column. */
  | { about: "free"; value: number }
  /** The allocation the case describes fits without reclaim or swap. */
  | { about: "fits" }
  /** It does not fit and the machine will swap or kill something. */
  | { about: "does-not-fit" }
  /** MemAvailable overstates by at least this much, because of shmem. */
  | { about: "overstates-by"; value: number }
  /** What could be had without waiting on writeback, in kibibytes. */
  | { about: "without-waiting"; value: number }
  /** The used column of free, in kibibytes. */
  | { about: "used"; value: number }
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
