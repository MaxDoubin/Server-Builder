/**
 * Three things have to be aligned, and all three failures are the same errno.
 *
 * Measured on the host this was written on, Linux 6.18.44, ext4 on a device
 * whose logical block size is 512, with 4 kB pages, by pwriting through a
 * descriptor opened O_DIRECT at a grid of offsets, lengths and buffer
 * misalignments.
 *
 * FIRST, what the kernel says it wants, which it will tell you if you ask:
 *
 *     statx STATX_DIOALIGN
 *       stx_dio_mem_align      512
 *       stx_dio_offset_align   512
 *     st_blksize               4096
 *
 * st_blksize is 4096 and the alignment is 512. The figure people reach for is
 * the wrong one, and it is four times too big rather than too small, so using
 * it works and hides the rule.
 *
 * SECOND, the file offset and the transfer length. Multiples of 512, and
 * nothing else:
 *
 *     length 1, 100, 255, 256, 511, 513, 4095, 4097   EINVAL
 *     length 512, 1024, 4096                          wrote it
 *     offset 1, 100, 255, 256, 511, 513               EINVAL
 *     offset 0, 512, 1024, 4096                       wrote it
 *
 * THIRD, and this is the one that is not the same rule, the address of the
 * buffer. A misaligned buffer is tolerated, but only while the whole transfer
 * stays inside one page. From a buffer at N bytes into a page, the largest
 * length that works is 4096 minus N, rounded down to a multiple of 512:
 *
 *     buffer at    largest length that works    rest of the page
 *         +1                  3584                   4095
 *         +7                  3584                   4089
 *        +64                  3584                   4032
 *       +100                  3584                   3996
 *       +511                  3584                   3585
 *       +513                  3072                   3583
 *      +1000                  3072                   3096
 *      +2000                  2048                   2096
 *      +3000                  1024                   1096
 *      +4000              nothing works                96
 *
 * Ten misalignments and the rule holds on all ten. At the boundary, from +1, a
 * length of 3584 ends at byte 3585 of the page and is accepted, and a length
 * of 4096 ends one byte into the next page and is not.
 *
 * FOURTH, an accepted write really is direct. A 64 KiB write from an aligned
 * buffer leaves 0 of the file's pages in the page cache, by mincore, against
 * 16 for the same write without the flag. The kernel does not quietly fall
 * back to buffered I/O: it either does it directly or refuses.
 *
 * FIFTH, every refusal is EINVAL. Three separate requirements, one
 * undifferentiated "Invalid argument", and nothing anywhere says which.
 *
 * Not modeled: a device whose logical block size is 4096, where every figure
 * above changes; any filesystem other than ext4; reads, since all of this is
 * pwrite; the end of the file, where a direct write may be shortened; and
 * io_uring's registered buffers, which have their own rules.
 */

/** Which of the three requirements a case is about. */
export type Requirement = "the offset" | "the length" | "the buffer address";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What is doing the writing. */
  job: string;
  /** The device's logical block size, which is the alignment. */
  blockAlign: number;
  /** The page size, which is what bounds a misaligned buffer. */
  pageBytes: number;
  /** st_blksize, which is the figure people use by mistake. */
  reportedBlksize: number;
  /** How far into a page the buffer starts. */
  memOffset: number;
  /** The file offset the write names. */
  at: number;
  /** How many bytes it asks to write. */
  length: number;
}

export type Claim =
  /** Whether the call is accepted at all. */
  | { about: "accepted"; value: boolean }
  /** What the call returns, in the words strerror would use. */
  | { about: "outcome"; value: string }
  /** The requirement that is violated, when exactly one is. */
  | { about: "blame"; value: string }
  /** The largest length that would work from this buffer, in bytes. */
  | { about: "largest"; value: number }
  /** Whether an accepted write bypasses the page cache. */
  | { about: "direct"; value: boolean }
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
