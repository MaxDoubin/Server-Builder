/**
 * Four writers hand a log 51200 bytes and the file is 12800 long.
 *
 * Measured on the host this was written on, kernel 6.18.44, by forking
 * writers onto one file, giving each its own repeated character, and reading
 * the size back with stat. Every writer completed every write and not one of
 * them got an error.
 *
 * FIRST, the arithmetic, which is the whole subject. Four writers, two
 * hundred records each, sixty four bytes a record, so 51200 bytes go into
 * write() whatever else happens:
 *
 *     how the file was opened                      bytes written   file is
 *     each writer opens it with O_APPEND                   51200     51200
 *     each writer opens it without O_APPEND                51200     12800
 *     the parent opens it once and forks                   51200     51200
 *     each writer pwrites at its own tiled offset          51200     51200
 *
 * The second row is three quarters of the log gone, with no error anywhere.
 * 12800 is 200 times 64: exactly one writer's worth. Each of them walked its
 * own offset from zero and wrote over the others, and the file ended up as
 * long as the furthest any one of them reached.
 *
 * That figure does not depend on how many writers there are, which is the
 * part that makes it hard to spot. Eight writers at fifty records of 4096
 * handed over 1638400 bytes and left 204800 behind, which is again exactly
 * one writer's worth.
 *
 * SECOND, what actually differs between those rows is not the file and not
 * the descriptor. It is the file offset, and where it lives. An offset
 * belongs to an open file description, which is what one open() call
 * creates. Two open() calls on the same path make two of them, each with its
 * own offset. fork and dup do not: they make a second descriptor pointing at
 * the one description, so the offset is shared and every write advances it
 * for everybody.
 *
 * So the third row works for the same reason the first does, and neither has
 * anything to do with the file being a log.
 *
 * THIRD, O_APPEND is not "seek to the end first". It makes the seek and the
 * write one operation that nothing can interleave with, which is why it
 * survives writers that know nothing about each other. Asking for the same
 * thing in two steps is the second row.
 *
 * FOURTH, O_APPEND overrides the offset argument entirely, and Linux takes
 * that further than POSIX does. On a ten byte file:
 *
 *     plain fd,     pwrite "XX" at 0    size 10   0123456789 becomes XX23456789
 *     O_APPEND fd,  pwrite "XX" at 0    size 12   0123456789XX
 *     O_APPEND fd,  lseek 0 then write  size 12   0123456789YY
 *
 * pwrite exists precisely to write at an offset without touching the file
 * offset, and pwrite(2) says so: POSIX requires O_APPEND to have no effect on
 * where pwrite puts its data, and on Linux it appends regardless. A program
 * that opens with O_APPEND and then pwrites is not doing what it reads as
 * doing.
 *
 * Not modeled: NFS, where O_APPEND is not atomic because the client has to
 * do the seek itself; O_DIRECT; writes larger than the filesystem can do in
 * one operation, which can be torn by a crash rather than by another writer;
 * and the page cache, because every figure here is the size the file ends up
 * with rather than what is on the disk at any moment.
 */

/** Where the file offset lives, and what the writers do with it. */
export type How =
  /** Each writer opens the file itself, with O_APPEND. */
  | "append"
  /** Each writer opens the file itself, without it. */
  | "separate"
  /** The parent opens once and forks, so one offset serves all of them. */
  | "shared"
  /** Each writer works out an offset and pwrites there. */
  | "pwrite"
  /** O_APPEND and pwrite together, which on Linux appends regardless. */
  | "append-pwrite";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What is doing the writing, in a few words. */
  job: string;
  /** How many processes write at once. */
  writers: number;
  /** How many records each of them writes. */
  records: number;
  /** How long one record is, in bytes. */
  bytes: number;
  /** How the file was opened and written. */
  how: How;
  /**
   * Whether the writers lay out ranges that do not overlap.
   *
   * Only read for pwrite, where it is the difference between a file that
   * holds everything and one that holds a quarter of it. O_APPEND ignores
   * the offset either way, so it makes no difference there.
   */
  tiled: boolean;
}

export type Claim =
  /** Bytes handed to write, which is never in doubt. */
  | { about: "written"; value: number }
  /** Bytes the file ends up being. */
  | { about: "size"; value: number }
  /** The difference, which nothing reported. */
  | { about: "lost"; value: number }
  /** Whether everything that was written is in the file. */
  | { about: "safe"; value: boolean }
  /** Whether the offset a writer names is the offset it gets. */
  | { about: "honorsOffset"; value: boolean }
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
