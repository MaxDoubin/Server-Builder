import type { Case } from "../types";

/**
 * Ten files, and what the two numbers say about each.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * keeping one entry per block and replaying the operations over it, rather
 * than by doing the same run arithmetic twice.
 *
 * Four of the ten are the same 1 GiB file with one byte in it, copied four
 * different ways, because the thing that fills a disk in production is not
 * the file. It is whatever ran over it at three in the morning.
 */
export const CASES: Case[] = [
  {
    slug: "the-gigabyte-that-occupied-four-kilobytes",
    name: "A gigabyte in one block",
    brief:
      "A database preallocates its data file by seeking to the end and writing a single byte, so the file exists at its final size before any rows go in. Somebody looks at the directory listing and asks where the gigabyte went.",
    setup: { host: "db-01", job: "a database", blockBytes: 4096, ops: [{ do: "write", at: 1073741823, bytes: 1 }], copiedWith: "none", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report for it?",
    options: [
      { id: "block", claim: "4 KiB. One byte at the end allocates the one block it lands in, and the gigabyte in front of it was never written", says: { about: "allocated", value: 4 } },
      { id: "whole", claim: "1048576 KiB, the whole gigabyte, because that is how big the file is", says: { about: "allocated", value: 1048576 } },
      { id: "none", claim: "0 KiB, because a file like this allocates nothing at all", says: { about: "allocated", value: 0 } },
      { id: "byte", claim: "1 KiB, which is the one byte rounded up to the unit du prints in", says: { about: "allocated", value: 1 } },
    ],
    why:
      "Measured: apparent size 1073741824, du 4K. ls reports the offset of the last byte plus one, and du reports the blocks the filesystem actually gave out. Nothing makes those agree, and on a file written this way they differ by a factor of two hundred and sixty thousand.",
    fix:
      "Read du and ls -l as answers to different questions. For capacity, du; for what an application thinks the file is, ls. du --apparent-size prints the ls number in du's units if you want them side by side.",
    breaks: "ls -l tells you how much disk a file is using",
  },
  {
    slug: "two-bytes-and-two-blocks",
    name: "Two bytes, two blocks",
    brief:
      "A test writes a single byte at offset 0 and a single byte at offset 4096 to see what the accounting does. The filesystem has a 4096 byte block.",
    setup: { host: "db-01", job: "a test", blockBytes: 4096, ops: [{ do: "write", at: 0, bytes: 1 }, { do: "write", at: 4096, bytes: 1 }], copiedWith: "none", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report?",
    options: [
      { id: "one", claim: "4 KiB. Two bytes is nowhere near a block, so they share one", says: { about: "allocated", value: 4 } },
      { id: "two", claim: "8 KiB. They land in two different blocks, and the block is the unit that gets allocated", says: { about: "allocated", value: 8 } },
      { id: "rounded", claim: "1 KiB, the two bytes rounded up to du's unit", says: { about: "allocated", value: 1 } },
      { id: "nothing", claim: "The file is 4097 bytes long, so it occupies 4097 bytes and a little rounding", says: { about: "nothing" } },
    ],
    why:
      "Measured: one byte at 0 gave 4K, one byte at 4095 gave 4K, one byte at 4096 alone gave 4K, and one byte at each of 0 and 4096 gave 8K. What costs a block is touching it. Writing four more bytes into a block already allocated cost nothing at all.",
    fix:
      "When you are working out what a write pattern costs, count the distinct blocks it touches and forget the byte count. A record format that puts one byte in each of a thousand blocks costs four megabytes.",
    breaks: "two bytes cost two bytes",
  },
  {
    slug: "the-zeros-that-were-stored",
    name: "Zeros written are zeros stored",
    brief:
      "A provisioning script writes ten mebibytes of zeros into a new file to reserve the space, on the reasoning that a filesystem will not bother storing zeros.",
    setup: { host: "build-02", job: "a provisioning script", blockBytes: 4096, ops: [{ do: "zeros", at: 0, bytes: 10485760 }], copiedWith: "none", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report?",
    options: [
      { id: "hole", claim: "0 KiB. A run of zeros is exactly what a hole is for", says: { about: "allocated", value: 0 } },
      { id: "half", claim: "5120 KiB, because a run of identical bytes halves under the filesystem's own packing", says: { about: "allocated", value: 5120 } },
      { id: "real", claim: "10240 KiB. The filesystem does not read what you hand it, so ten mebibytes written is ten mebibytes stored", says: { about: "allocated", value: 10240 } },
      { id: "one", claim: "4 KiB, one block, because every block in the file holds the same thing", says: { about: "allocated", value: 4 } },
    ],
    why:
      "Measured: ten mebibytes of zeros from /dev/zero gave du 10240K, and a fallocate of the same length gave 10240K as well. A hole is made by not writing, not by writing nothing. ext4 has no idea what is in the buffer you gave it and is not going to look.",
    fix:
      "To reserve space without using it, do not write anything: leave the hole, or use fallocate if you want the blocks guaranteed. To reserve space and mean it, writing zeros is exactly right, and it costs exactly what it says.",
    breaks: "a file full of zeros is stored as a hole",
  },
  {
    slug: "the-copy-that-filled-the-disk",
    name: "The copy that filled the disk",
    brief:
      "That 1 GiB database file, with its one byte, backed up overnight with a shell redirect through cat onto a volume with 512 MiB free. The backup had been running fine for months while the file was smaller.",
    setup: { host: "db-01", job: "a database", blockBytes: 4096, ops: [{ do: "write", at: 1073741823, bytes: 1 }], copiedWith: "cat", ddBytes: 1048576, freeKib: 524288 },
    question: "Does the copy fit?",
    options: [
      { id: "same", claim: "4 KiB is what gets written, so it fits with room to spare", says: { about: "copied", value: 4 } },
      { id: "yes", claim: "Yes. The source is using four kilobytes and the destination has half a gigabyte", says: { about: "fits", value: true } },
      { id: "no", claim: "No. cat reads the holes, gets zeros, and writes them, so the copy needs the whole gigabyte", says: { about: "fits", value: false } },
      { id: "sparse", claim: "The copy comes out sparse as well, so the question does not arise", says: { about: "stillSparse", value: true } },
    ],
    why:
      "Measured: the same 1 GiB file went from 4K to 1048580K through cat, through cp --sparse=never, and through plain tar. A read of a hole returns zeros, and a tool that does not check for them writes every one. The extra four kilobytes in that figure is the extent tree index block a file of more than four extents needs.",
    fix:
      "Back up images and database files with something that understands holes: cp on its own, tar with -S, rsync with -S, or dd with conv=sparse. Size the destination from du on the source, not from ls, and check what your backup tool does before the disk does it for you.",
    breaks: "copying a file needs as much space as the file was using",
  },
  {
    slug: "the-tar-that-did-not-know",
    name: "What tar does to a hole",
    brief:
      "The same file again, archived and restored with tar, because a tar archive is what the runbook says to take.",
    setup: { host: "db-01", job: "a database", blockBytes: 4096, ops: [{ do: "write", at: 1073741823, bytes: 1 }], copiedWith: "tar", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report for the restored file?",
    options: [
      { id: "same", claim: "4 KiB, unchanged, because tar stores the file and its metadata and this is metadata", says: { about: "copied", value: 4 } },
      { id: "zero", claim: "0 KiB, because a run of zeros in an archive compresses away to nothing", says: { about: "copied", value: 0 } },
      { id: "buffer", claim: "1024 KiB, the one mebibyte tar reads at a time", says: { about: "copied", value: 1024 } },
      { id: "full", claim: "1048576 KiB. tar without -S reads the holes as the zeros they are and puts every one of them in the archive", says: { about: "copied", value: 1048576 } },
    ],
    why:
      "Measured: tar cf then tar xf gave 1048580K, and tar cSf then tar xf gave 4K. GNU tar only looks for holes when you ask it to, because looking costs a read of the whole file. The archive itself is the giveaway: it is a gigabyte on disk either way unless you compress it.",
    fix:
      "Add -S to any tar that might touch an image, a database file, or anything else preallocated. It is free when there are no holes and it is the difference between four kilobytes and a gigabyte when there are.",
    breaks: "tar preserves a sparse file",
  },
  {
    slug: "the-granularity-dd-gives-back",
    name: "The holes dd gives back",
    brief:
      "Somebody who knows about this copies the file with dd conv=sparse, which skips writing a buffer that is entirely zero. They use the bs=1M everybody uses.",
    setup: { host: "db-01", job: "a database", blockBytes: 4096, ops: [{ do: "write", at: 1073741823, bytes: 1 }], copiedWith: "dd-sparse", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report for the copy?",
    options: [
      { id: "exact", claim: "4 KiB, the same as the original, which is the entire point of conv=sparse", says: { about: "copied", value: 4 } },
      { id: "full", claim: "1048576 KiB, because dd copies blocks and does not understand holes at all", says: { about: "copied", value: 1048576 } },
      { id: "buffer", claim: "1024 KiB. dd skips a buffer that is all zeros and writes one that is not, so the narrowest hole it can leave is one buffer wide", says: { about: "copied", value: 1024 } },
      { id: "half", claim: "512 KiB, because dd writes only the part of the buffer that is not zero", says: { about: "copied", value: 512 } },
    ],
    why:
      "Measured on the same source at four buffer sizes: bs=4096 gave 4K, bs=65536 gave 64K, bs=1M gave 1024K and bs=8M gave 8192K. The granularity of the sparseness you get back is dd's block size and not the filesystem's, so the convenient big buffer is the one that loses you the most.",
    fix:
      "If you are using dd conv=sparse to preserve holes, set bs to the filesystem block size and accept it will be slower, or use a tool that asks the kernel where the holes are. cp has done that with SEEK_HOLE since coreutils 8.10.",
    breaks: "conv=sparse gives you the holes back exactly",
  },
  {
    slug: "the-file-made-sparse-afterwards",
    name: "Made sparse afterwards",
    brief:
      "Sixty four mebibytes of real zeros, written by the provisioning script that thought it was being clever. Somebody wants the space back without deleting the file, and reaches for cp --sparse=always.",
    setup: { host: "build-02", job: "a provisioning script", blockBytes: 4096, ops: [{ do: "zeros", at: 0, bytes: 67108864 }], copiedWith: "cp-always", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report for the copy?",
    options: [
      { id: "same", claim: "65536 KiB, unchanged, because the zeros are real bytes that were really written", says: { about: "copied", value: 65536 } },
      { id: "partial", claim: "32768 KiB, because cp only punches out runs that are a mebibyte or more and aligned", says: { about: "copied", value: 32768 } },
      { id: "one", claim: "4 KiB, because a file has to keep at least one block", says: { about: "copied", value: 4 } },
      { id: "none", claim: "0 KiB. This is the one cp mode that reads the contents, and every byte of them is a zero", says: { about: "copied", value: 0 } },
    ],
    why:
      "Measured: 64 MiB of zeros went to 0K through cp --sparse=always, and an 8 MiB fallocate did the same, because an unwritten extent reads back as zeros just as written zeros do. A file can be made sparse after the fact. It costs a full read of it.",
    fix:
      "cp --sparse=always, or fallocate --dig-holes on the file in place, which does the same thing without a second copy. Both read every byte, so do it when the machine is not busy.",
    breaks: "a file cannot be made sparse after it has been written",
  },
  {
    slug: "the-default-that-does-not-hunt",
    name: "What the default does not do",
    brief:
      "The same sixty four mebibytes of zeros, copied with plain cp, by somebody who has heard that cp is sparse aware.",
    setup: { host: "build-02", job: "a provisioning script", blockBytes: 4096, ops: [{ do: "zeros", at: 0, bytes: 67108864 }], copiedWith: "cp", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report for the copy?",
    options: [
      { id: "none", claim: "0 KiB, because cp is sparse aware and this is what that means", says: { about: "copied", value: 0 } },
      { id: "one", claim: "4 KiB, because the whole file reads as one run of zeros and collapses into a block", says: { about: "copied", value: 4 } },
      { id: "sparse", claim: "The copy has holes in it that the original did not", says: { about: "stillSparse", value: true } },
      { id: "same", claim: "65536 KiB. The default is --sparse=auto, which keeps the holes that are there and does not go looking for new ones", says: { about: "copied", value: 65536 } },
    ],
    why:
      "Measured: 65536K through plain cp and 0K through cp --sparse=always, on the same source. Auto means cp reproduces the holes the source has, which on this file is none. Sparse aware is a claim about preserving, not about detecting, and the two get conflated constantly.",
    fix:
      "Know which of the three modes you want. auto preserves, always detects and costs a full read, never writes everything out and is what you want when the destination is a device or a filesystem that cannot do holes.",
    breaks: "cp looks for runs of zeros",
  },
  {
    slug: "the-punch-that-freed-nothing",
    name: "The punch that freed nothing",
    brief:
      "A log trimmer punches out the first eight thousand bytes of a sixteen kilobyte file, starting at offset 100 because that is where the header ends.",
    setup: { host: "log-05", job: "a log trimmer", blockBytes: 4096, ops: [{ do: "zeros", at: 0, bytes: 16384 }, { do: "punch", at: 100, bytes: 8000 }], copiedWith: "none", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report afterwards?",
    options: [
      { id: "two", claim: "8 KiB. Eight thousand bytes is two blocks' worth, so two blocks go back", says: { about: "allocated", value: 8 } },
      { id: "unchanged", claim: "16 KiB, unchanged. No block lies entirely inside bytes 100 to 8100, so there is nothing the filesystem can give back", says: { about: "allocated", value: 16 } },
      { id: "middle", claim: "12 KiB, because the range covers parts of three blocks and the middle one is fully inside", says: { about: "allocated", value: 12 } },
      { id: "one", claim: "4 KiB, because a punch at the front shifts the rest of the file down", says: { about: "allocated", value: 4 } },
    ],
    why:
      "Measured on a four block file: punching bytes 100 to 8100 left it at 16K, and punching bytes 4096 to 12288 took it to 8K. A block is either allocated or it is not, so a punch can only free the ones that are wholly inside the range. Block 1 runs to 8191 and the range stops at 8100, which is enough to keep it.",
    fix:
      "Align a punch to the block size or it does nothing. Read the block size from stat -f, or from statvfs, rather than assuming 4096: it is 4096 on almost everything and not on all of it.",
    breaks: "punching a hole frees the bytes in the range",
  },
  {
    slug: "the-blocks-that-did-not-come-back",
    name: "Truncated down, grown back",
    brief:
      "A rotation script truncates a thirty two kilobyte spool file down to its first two blocks and then sets the size back up to a million bytes so the writer's offsets still land in range.",
    setup: { host: "log-05", job: "a rotation script", blockBytes: 4096, ops: [{ do: "zeros", at: 0, bytes: 32768 }, { do: "truncate", at: 8192, bytes: 0 }, { do: "truncate", at: 1000000, bytes: 0 }], copiedWith: "none", ddBytes: 1048576, freeKib: 4194304 },
    question: "What does du report at the end?",
    options: [
      { id: "kept", claim: "8 KiB. Truncating to 8192 freed six of the eight blocks, and growing the file back added a hole rather than blocks", says: { about: "allocated", value: 8 } },
      { id: "apparent", claim: "977 KiB, because the file is a million bytes long again", says: { about: "allocated", value: 977 } },
      { id: "unchanged", claim: "32 KiB. Only the size changed, and the blocks are still there underneath", says: { about: "allocated", value: 32 } },
      { id: "nothing", claim: "A file cannot be grown past what has been written to it without allocating the space", says: { about: "nothing" } },
    ],
    why:
      "Measured: thirty two kilobytes went to 8K at truncate -s 8192, stayed at 8K when grown to 1000000, and stayed at 8K when trimmed again to 6000, which is halfway through block 1. Truncating up costs nothing and truncating down does not reserve anything for later. The 992 kilobytes on the end is a hole.",
    fix:
      "Truncate is the cheap way to set a size and a terrible way to reserve space. If the writer needs the blocks to exist, fallocate them; if it only needs the offsets to be legal, truncate is right and free.",
    breaks: "truncating a file to a larger size allocates the space",
  },
];
