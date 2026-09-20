/**
 * A gigabyte that occupies four kilobytes, until somebody copies it.
 *
 * Measured on the host this was written on, kernel 6.18.44, on ext4 with a
 * 4096 byte block, by making files with dd, truncate and fallocate and
 * reading both numbers back with stat and du. Every figure below is after a
 * sync, because the allocation is what is being measured.
 *
 * FIRST, the two numbers. `ls -l` reports the apparent size, which is the
 * offset of the last byte plus one. `du` reports the blocks allocated to it.
 * Nothing makes these agree:
 *
 *     what was done                        apparent      du
 *     truncate -s 1G                     1073741824       0K
 *     1 byte written at offset 0                  1       4K
 *     1 byte written at 1073741823       1073741824       4K
 *     10 MiB of real zeros written         10485760   10240K
 *
 * The first three are one file's worth of ways to have almost nothing in a
 * very large file. The fourth is the one people get wrong: a filesystem does
 * not look at what you wrote. Zeros written are zeros stored.
 *
 * SECOND, the arithmetic is whole blocks, and the boundary is where it bites:
 *
 *     1 byte at 0                      apparent    1     du 4K
 *     1 byte at 4095                   apparent 4096     du 4K
 *     1 byte at 4096                   apparent 4097     du 4K
 *     1 byte at 0 and 1 byte at 4096   apparent 4097     du 8K
 *
 * A byte at 4096 costs the same as a byte at 0, because it is one block
 * either way. Two bytes cost two blocks only when they fall in two blocks.
 * Writing four more bytes into a block that is already allocated is free.
 *
 * THIRD, and this is what the disk actually fills up on, the tools disagree
 * about holes. The same 1 GiB file holding one byte, copied six ways:
 *
 *     cp                                      4K
 *     cp --sparse=never                 1048580K
 *     cat src > dst                     1048580K
 *     tar cf then tar xf                1048580K
 *     tar cSf then tar xf                     4K
 *     dd conv=sparse bs=1M                 1024K
 *
 * Only two of those preserve it. The backup that fills the disk is usually
 * the third or the fourth row, run against a directory of VM images.
 *
 * FOURTH, `dd conv=sparse` gives holes at the granularity of its own block
 * size, which is not the filesystem's:
 *
 *     bs=4096        4K        bs=1M      1024K
 *     bs=65536      64K        bs=8M      8192K
 *
 * It skips a buffer that is entirely zero and writes one that is not, so the
 * smallest hole it can make is one buffer wide.
 *
 * FIFTH, holes can be made as well as lost. 64 MiB of real zeros, copied:
 *
 *     cp                      65536K     auto only preserves holes that exist
 *     cp --sparse=always          0K     this one looks for runs of zeros
 *
 * SIXTH, punching frees whole blocks and nothing else. On a four block file:
 *
 *     punch bytes 100 to 8100      16K     no block is entirely inside it
 *     punch bytes 4096 to 12288     8K     two blocks are
 *
 * And truncating down frees blocks that truncating back up does not return:
 * 32768 down to 8192 went from 32K to 8K, and growing it to 1000000 left it
 * at 8K with a 992 kilobyte hole on the end.
 *
 * Not modeled: the extent tree, which is metadata rather than data. Four
 * extents fit in an ext4 inode and the fifth costs one 4 KiB index block,
 * measured at no overhead up to 384 MiB written and 4 KiB from 512 MiB up,
 * with the extent count decided by the allocator rather than by the size.
 * Also not modeled: filesystems that store small files inside the inode,
 * compression, deduplication, reflinks, and the fact that a block written
 * and then overwritten with zeros still counts as data here, which is why no
 * case writes zeros over part of a block that already holds data.
 */

/** What a block holds, once the filesystem has finished with it. */
export type Block =
  /** Not allocated. Reads as zeros and costs nothing. */
  | "hole"
  /** Allocated, and everything in it is a zero byte. */
  | "zeros"
  /** Allocated, and something in it is not. */
  | "data";

/** One thing done to the file, in order. */
export type Op =
  /** Set the apparent size. Grows with a hole, shrinks by dropping blocks. */
  | { do: "truncate"; at: number; bytes: 0 }
  /** Write real bytes, which allocates every block the range touches. */
  | { do: "write"; at: number; bytes: number }
  /** Write literal zero bytes, which allocates exactly the same way. */
  | { do: "zeros"; at: number; bytes: number }
  /** Reserve blocks without writing, which reads back as zeros. */
  | { do: "fallocate"; at: number; bytes: number }
  /** Give blocks back, but only the ones entirely inside the range. */
  | { do: "punch"; at: number; bytes: number };

/** How the file was then copied, if it was. */
export type Tool =
  /** Nobody copied it. */
  | "none"
  /** cp, whose default is --sparse=auto: keep the holes that are there. */
  | "cp"
  /** cp --sparse=never: write every block out. */
  | "cp-never"
  /** cp --sparse=always: look for runs of zeros and punch them. */
  | "cp-always"
  /** A shell redirect through cat, which knows nothing about holes. */
  | "cat"
  /** tar without -S, which does not either. */
  | "tar"
  /** tar -S, which does. */
  | "tar-sparse"
  /** dd conv=sparse, at its own block size. */
  | "dd-sparse"
  /** dd without it. */
  | "dd";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What made the file, in a few words. */
  job: string;
  /** The filesystem block size, in bytes. */
  blockBytes: number;
  /** What was done to the file, in order. */
  ops: Op[];
  /** What copied it afterwards. */
  copiedWith: Tool;
  /** The buffer dd was given, in bytes. Only read for dd. */
  ddBytes: number;
  /** Free space on the destination, in kibibytes, for whether the copy fits. */
  freeKib: number;
}

export type Claim =
  /** Apparent size of the file, as ls reports it, in kibibytes. */
  | { about: "apparent"; value: number }
  /** Blocks allocated before any copy, as du reports them, in kibibytes. */
  | { about: "allocated"; value: number }
  /** And after the copy. */
  | { about: "copied"; value: number }
  /** Whether the copy still has holes in it. */
  | { about: "stillSparse"; value: boolean }
  /** Whether the copy fits in the free space on the destination. */
  | { about: "fits"; value: boolean }
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
