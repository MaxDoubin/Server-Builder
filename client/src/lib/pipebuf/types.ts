/**
 * A log line that came out with another log line inside it.
 *
 * Measured on the host this was written on, kernel 6.18.44, by forking four
 * writers onto one pipe, giving each its own repeated character, and counting
 * maximal runs of that character in the raw bytes afterwards. A run shorter
 * than a whole record is a write that was torn in half by somebody else's.
 *
 * The detector took three attempts and the first two both appeared to show the
 * POSIX guarantee being violated. Counting fixed-size windows from offset zero
 * breaks as soon as the record sizes differ, and splitting the stream on
 * newlines is worse: when a large writer's record tears, its fragments land
 * either side of a SMALL writer's intact record and swallow the newline, so a
 * write that was never touched reads as broken. Counting runs of one
 * character in the raw stream is immune to both, because nothing another
 * writer does can shorten a run of your character.
 *
 * FIRST, the guarantee, and it holds:
 *
 *     four writers at 4096 bytes          200 of 200 whole, every run
 *     three at 4096 with one at 5000      200 of 200 whole, every run
 *     two at 4096 with two at 20000       200 of 200 whole, every run
 *     one at 512 with three at 20000      200 of 200 whole, every run
 *
 * A write of PIPE_BUF bytes or fewer is never interleaved with another, and
 * that held here even with writers three and four times the size tearing
 * themselves to pieces alongside it. PIPE_BUF on this host is 4096.
 *
 * SECOND, above it there is no guarantee, and what happens depends on what
 * else is in the pipe. Four writers all sending the same size, on a pipe whose
 * capacity is 65536:
 *
 *     size    capacity / size     torn, three runs
 *     4096              16.00     0, 0, 0
 *     4097              16.00     84, 81, 76
 *     5000              13.11     103, 78, 72
 *     8192               8.00     0, 0, 0
 *     8193               8.00     125, 125, 139
 *    12288               5.33     146, 136, 132
 *    16384               4.00     0, 0, 0
 *    20000               3.28     354, 311, 354
 *    32768               2.00     0, 0, 0
 *
 * Every size that divides the capacity exactly tore nothing, three runs out of
 * three. Every size that does not tore between seventy and three hundred
 * records of eight hundred. The reason is plain once seen: a writer is only
 * interrupted part way through a record if the pipe fills part way through a
 * record, and if the capacity is a whole number of records it never does.
 *
 * THIRD, and this is the part that matters, that safety is arithmetic rather
 * than a promise. It survives nothing:
 *
 *     four writers at 8192                        0, 0, 0 torn
 *     three at 8192 and one at 5000               6, 6, 14 torn on the 8192s
 *
 * One writer with a different record size, and every other writer starts
 * tearing. Which is exactly the shape of the bug: it works in testing, it
 * works in staging, and it breaks the week somebody adds a second logger.
 *
 * FOURTH, a regular file opened O_APPEND did not tear at any size measured
 * here, including 200000 byte records alongside 512 byte ones: 200 of 200
 * whole, every writer, every run. Linux holds the inode lock for the length
 * of a buffered write, so writes to one file do not interleave. That is a
 * measurement of this kernel and this filesystem, NOT a guarantee: it is not
 * promised by POSIX above PIPE_BUF and it is not true over NFS. The contrast
 * is still the useful part, because it is the difference between
 *
 *     myapp >> app.log           one file, and it held here
 *     myapp 2>&1 | tee app.log   a pipe, and above 4096 it does not
 *
 * FIFTH, F_SETPIPE_SZ rounds up to a power of two, which quietly decides
 * whether your sizes divide the capacity:
 *
 *     asked      granted
 *         1         4096
 *      4097         8192
 *     40000        65536
 *     65537       131072
 *   1048576      1048576
 *   2097152      refused, EPERM, above fs.pipe-max-size
 *
 * Not modeled: what a reader that is slower than the writers changes, which
 * was not isolated here; writev, which has its own atomicity; O_NONBLOCK,
 * where a large write can return a partial count instead of blocking; and
 * NFS, where the file result above does not hold.
 */

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** Where the writers are writing. */
  target: "pipe" | "file";
  /** What F_SETPIPE_SZ was asked for. The default, unresized, is 65536. */
  requested: number;
  /** The pipe's capacity, as F_GETPIPE_SZ reports it. Ignored for a file. */
  capacity: number;
  /** One record size per writer, in bytes. */
  writers: number[];
  /** Which writer the question is about. */
  underTest: number;
  /** Records each writer sends. */
  records: number;
}

export type Claim =
  /** Whether the writer under test can have a record torn. */
  | { about: "tears"; value: boolean }
  /** What makes it safe, or what does not. */
  | { about: "because"; name: string }
  /** How many of the writers here can be torn. */
  | { about: "atRisk"; value: number }
  /** What F_SETPIPE_SZ would grant for this capacity as a request. */
  | { about: "granted"; value: number }
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
