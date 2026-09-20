/**
 * The same number in the same column, and half of it is not yours.
 *
 * Measured on the host this was written on, Linux 6.18.44, 16481980 kB of RAM
 * and no swap, by writing a known amount into a real file and into a tmpfs and
 * reading /proc/meminfo either side.
 *
 * FIRST, what the columns are. Confirmed against one atomic copy of
 * /proc/meminfo taken next to one `free -k`:
 *
 *     free's buff/cache  =  Buffers + Cached + SReclaimable
 *                           8704 + 230000 + 24828 = 263532, and free said 263532
 *     free's shared      =  Shmem
 *                           12996, and free said 12996
 *
 * Shmem is inside Cached and Cached is inside buff/cache, so a tmpfs file is
 * counted three times over in one line of output, once of them in the column
 * everybody reads as memory they can have back.
 *
 * SECOND, the whole surface. Two runs, each writing exactly one gibibyte, each
 * from the same clean baseline:
 *
 *     a real file on disk        MemFree     Cached      Shmem   MemAvailable
 *       clean                   14896456     212780      13164       14856712
 *       written                 13817736    1261688      12992       14840752
 *       after drop_caches       14901160     212360      12992       14860988
 *
 *     a file in tmpfs            MemFree     Cached      Shmem   MemAvailable
 *       clean                   14924388     212652      12992       14893824
 *       written                 13874728    1261392    1061396       13836480
 *       after drop_caches       13871756    1261232    1061568       13832524
 *
 * Cached reads 1261 MB in both. In the first it is memory the kernel hands
 * back the moment anything wants it, and drop_caches hands it back. In the
 * second the same command frees nothing.
 *
 * THIRD, MemAvailable is the honest figure. The real file did not move it. The
 * tmpfs file cost the whole gibibyte. And Shmem is what tells them apart,
 * which is the column `free` labels "shared" and nobody reads.
 *
 * FOURTH, deleting is not enough. 512 MiB in /dev/shm, then rm while one
 * process still holds the descriptor:
 *
 *       written                 Shmem 537096   df says 512M used
 *       unlinked, fd still open Shmem 537096   df says 512M used
 *       fd closed               Shmem  12992   df says 0
 *
 * FIFTH, the limit is a mount option and not the machine. A tmpfs mounted with
 * size=16M stopped at exactly 16777216 bytes and returned ENOSPC, "no space
 * left on device", with 14782776 kB of the machine's memory free. Mounted with
 * no size= at all it reported 7.9G against a MemTotal of 16481980 kB, so the
 * default is half of RAM.
 *
 * SIXTH, page granularity, which matters more here than elsewhere because the
 * thing being consumed is memory. A one byte file on tmpfs costs 4096 bytes by
 * both df and du.
 *
 * Not modeled: swap, because this machine has none, so every figure above is
 * the pinned case and a machine with swap can page tmpfs out; cgroup v2
 * memory.stat, where tmpfs is charged to whichever cgroup faulted the page in
 * rather than the one that wrote it; huge pages in tmpfs; and MAP_SHARED
 * anonymous memory and System V shared memory, which also land in Shmem and
 * were not measured separately.
 */

/** Where the bytes went. */
export type Store = "disk" | "tmpfs";

/** What somebody tried, hoping to get the memory back. */
export type Attempt = "nothing" | "drop_caches" | "delete" | "delete while open";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What put the bytes there. */
  job: string;
  /** The machine's RAM, in kibibytes, as MemTotal reports it. */
  totalKb: number;
  /** Page cache from ordinary files, in kibibytes, before this job ran. */
  baseCacheKb: number;
  /** Shmem before this job ran, in kibibytes. */
  baseShmemKb: number;
  /** Slab the kernel would give back, in kibibytes. */
  reclaimableKb: number;
  /** Buffers, in kibibytes. Small everywhere measured, and part of the column. */
  buffersKb: number;
  /** What this job wrote, in kibibytes. */
  wroteKb: number;
  /** Where it wrote it. */
  store: Store;
  /** What was then tried to get the memory back. */
  attempt: Attempt;
}

export type Claim =
  /** What free's buff/cache column reads, in kibibytes. */
  | { about: "buffCache"; value: number }
  /** What free's shared column reads, in kibibytes. */
  | { about: "shared"; value: number }
  /** How much of that column the attempt actually returns, in kibibytes. */
  | { about: "freed"; value: number }
  /** What is left in the column afterwards, in kibibytes. */
  | { about: "after"; value: number }
  /** Whether the bytes this job wrote survive the attempt. */
  | { about: "survives"; value: boolean }
  /** What this job cost MemAvailable, in kibibytes. */
  | { about: "availableCost"; value: number }
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
