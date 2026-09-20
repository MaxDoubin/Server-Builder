/**
 * Four processes hold 64 MiB between them, and ps adds up to 258.
 *
 * Measured on the host this was written on, kernel 6.18.44, with a C program
 * that maps one region, touches every page of it, forks, and then reads
 * Rss and Pss for that one mapping out of /proc/self/smaps in each process.
 *
 * FIRST, the arithmetic everybody has already met and nobody applies. A
 * parent maps 64 MiB of private anonymous memory, touches all of it, and
 * forks three children. What ps says:
 *
 *       PID    RSS    PSS COMMAND
 *      3295  66948  16492 hold
 *      3297  65828  16435 hold
 *      3298  65828  16435 hold
 *      3299  65828  16435 hold
 *
 *     sum of RSS   264432 kB   258.2 MiB
 *     sum of PSS    65794 kB    64.3 MiB
 *
 * There is 64 MiB of memory here. RSS is not wrong about any one of those
 * rows: every one of those processes really can reach 64 MiB of resident
 * pages. RSS is wrong the moment you add two of them together, because the
 * same page frame is in both numbers at full price.
 *
 * PSS is the same measurement with the price divided by the number of
 * processes that map the page. It is designed to be added up, and it adds up
 * to the truth: 64 MiB of frames, 64 MiB of PSS spread across four
 * processes. This is the only reason PSS exists.
 *
 * SECOND, a read costs nothing and a write costs a page. The same four
 * processes, with each child touching 16 MiB of the region after the fork:
 *
 *     what each child did     RSS each   PSS each   anonymous pages
 *     nothing                    65536      16384             65536
 *     read 16 MiB                65536      16384             65536
 *     wrote 16 MiB               65536      28672            114688
 *
 * Reading changed nothing at all, because fork already put those pages in
 * the child's page table; there was nothing left to fault. Writing copied
 * them, three times over, and the 48 MiB that appeared is the only new
 * memory in the whole exercise. RSS reports 64 MiB in every row and cannot
 * tell the three apart.
 *
 * THIRD, which pages the children write decides who pays, and not how much.
 * Three children writing the same 16 MiB, against three children writing a
 * different 16 MiB each:
 *
 *     the same range     parent PSS 28672   child PSS 28672   anon 114688
 *     one range each     parent PSS 20479   child PSS 31402   anon 114688
 *
 * Identical totals. The pages moved between the columns because the
 * number of processes sharing each frame moved, which is all PSS is.
 *
 * FOURTH, MAP_SHARED is a different animal, and fork treats it differently.
 * The same 64 MiB mapped with MAP_SHARED | MAP_ANONYMOUS:
 *
 *     children touched nothing     parent 65536 / 65536    child     0 /    0
 *     children read 16 MiB each    parent 65536 / 53248    child 16384 / 4096
 *
 * A child that touched nothing has an RSS of zero for a region it maps in
 * full. Linux does not copy the page tables of a shared anonymous mapping on
 * fork, because a page fault can fill them in correctly later and most
 * children never touch most of what they inherit. So a child's RSS here is a
 * record of what it has touched since the fork, not of what it can reach.
 *
 * FIFTH, and this is the one that makes PSS confusing to watch over time:
 * killing a process raises everybody else's. Four processes sharing 64 MiB
 * are 16384 kB of PSS each. Kill one, allocate nothing, free nothing:
 *
 *     before   16384 kB each, four of them
 *     after    21845 kB each, three of them
 *
 * The divisor changed. A graph of one process's PSS during a deployment
 * shows a step up as the old workers exit, and nothing was leaked.
 *
 * A note on the arithmetic, because a case here will not claim a figure the
 * kernel would not print. The kernel accumulates PSS in fixed point with 12
 * bits of fraction, taking floor(4096 << 12 / mapcount) per page. A page
 * shared three ways loses a third of a unit every time, which is how the
 * measured parent above reads 20479 where the exact division gives 20480.
 * The model below reproduces that arithmetic rather than rounding it away.
 *
 * Not modeled: swap, which has its own Swap and SwapPss lines and is counted
 * nowhere in these; file-backed mappings, which share with every other
 * process on the machine and not just with your own children; huge pages, on
 * which recent kernels estimate PSS from an average mapcount rather than
 * counting each page; KSM, which makes unrelated pages share after the fact;
 * and cgroup memory accounting, which charges a page to whichever cgroup
 * touched it first and does not divide anything.
 */

/** How the region was mapped, which decides what fork does with it. */
export type Kind = "private" | "shared";

/** What each child does to its share of the region after the fork. */
export type Touch = "none" | "read" | "write";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What the program is, in a few words. */
  job: string;
  /** Pages in the one mapping, which the parent touches in full before forking. */
  pages: number;
  /** MAP_PRIVATE or MAP_SHARED, both with MAP_ANONYMOUS. */
  kind: Kind;
  /** How many children it forks. */
  children: number;
  /** What each child does after the fork. */
  touch: Touch;
  /** How many pages each child touches. */
  touchPages: number;
  /** Whether each child touches its own range rather than all of them the same one. */
  distinct: boolean;
  /** How many of the children have exited by the time the reading is taken. */
  thenKilled: number;
}

export type Claim =
  /** Resident pages of the parent, in MiB. */
  | { about: "rssParent"; value: number }
  /** Resident pages of one surviving child, in MiB. */
  | { about: "rssChild"; value: number }
  /** RSS added up across every process that maps it, in MiB. */
  | { about: "rssSum"; value: number }
  /** Page frames that actually exist, in MiB. */
  | { about: "physical"; value: number }
  /** Proportional set size of the parent, in MiB. */
  | { about: "pssParent"; value: number }
  /** Proportional set size of one surviving child, in MiB. */
  | { about: "pssChild"; value: number }
  /** PSS added up across every process, in MiB. */
  | { about: "pssSum"; value: number }
  /** Whether anything that happened after the fork cost a page frame. */
  | { about: "grew"; value: boolean }
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
