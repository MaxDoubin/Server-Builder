import type { Case } from "../types";

/**
 * Ten writes through O_DIRECT, and which of them the kernel takes.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * cutting the transfer into the blocks the device deals in and asking of each
 * piece whether it could be handed over, rather than by evaluating the same
 * three modulo tests again.
 *
 * Every refusal here is the same EINVAL. That is the point: three separate
 * requirements, one undifferentiated errno, and nothing anywhere saying which
 * of the three it was.
 */
export const CASES: Case[] = [
  {
    slug: "the-length-that-was-not-a-block",
    name: "The length that was not a block",
    brief:
      "A database opens its data file with O_DIRECT, allocates its buffer with posix_memalign, and writes a record at the start of the file. The record is 4095 bytes.",
    setup: { host: "db-01", job: "a record writer", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 0, at: 0, length: 4095 },
    question: "What does the write return?",
    options: [
      { id: "short", claim: "It writes 3584 bytes, the whole blocks of it, and the caller loops for the rest", says: { about: "outcome", value: "it writes 3584 bytes" } },
      { id: "einval", claim: "EINVAL. The length has to be a multiple of 512, and 4095 is one short of eight blocks", says: { about: "outcome", value: "EINVAL, Invalid argument" } },
      { id: "all", claim: "It writes all 4095 bytes and pads the last block, which is what the block device does anyway", says: { about: "outcome", value: "it writes 4095 bytes" } },
      { id: "nothing", claim: "It depends on whether the file was preallocated", says: { about: "nothing" } },
    ],
    why:
      "Measured: lengths of 1, 100, 255, 256, 511, 513, 4095 and 4097 all return EINVAL, and 512, 1024 and 4096 all write. There is no short write and no padding. The transfer has to be a whole number of the device's blocks, and this one is a byte short of seven of them.",
    fix:
      "Round the length up to the block size and keep the real length somewhere else, in a header or an index. A direct write cannot carry a length that is not a multiple of a block, so the length has to live outside the data.",
    breaks: "a write that is nearly aligned does nearly the right thing",
  },
  {
    slug: "the-figure-that-was-the-wrong-one",
    name: "The figure that was the wrong one",
    brief:
      "The same writer, reading st_blksize from fstat and using it as the alignment, as most code does. st_blksize on this filesystem is 4096 and the device's blocks are 512.",
    setup: { host: "db-01", job: "a record writer", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 0, at: 0, length: 4096 },
    question: "Does a 4096 byte write at offset 0 from an aligned buffer go through?",
    options: [
      { id: "yes", claim: "Yes. 4096 is a multiple of 512 as well, so using the larger figure happens to satisfy the smaller one, which is exactly why this bug hides", says: { about: "accepted", value: true } },
      { id: "no", claim: "No, because 4096 is not the alignment the device asked for", says: { about: "accepted", value: false } },
      { id: "nothing", claim: "Only on a filesystem where st_blksize and the block size agree", says: { about: "nothing" } },
      { id: "blame", claim: "It is refused, and the length is to blame", says: { about: "blame", value: "the length" } },
    ],
    why:
      "statx reports stx_dio_mem_align and stx_dio_offset_align, both 512 here, and st_blksize separately as 4096. Code that reaches for st_blksize is using a figure four times too big, so every write it makes is aligned and it never finds out. Then it runs on a device with 4096 byte blocks, or somebody adds a 512 byte header, and the same code starts returning EINVAL.",
    fix:
      "Ask statx for STATX_DIOALIGN and use stx_dio_offset_align and stx_dio_mem_align. They are the two figures that answer the question, and they have been there since Linux 6.1.",
    breaks: "st_blksize is the alignment direct I/O wants",
  },
  {
    slug: "the-offset-that-was-a-header-away",
    name: "The offset that was a header away",
    brief:
      "A log writer puts a 100 byte header at the front of its file and then writes 512 byte records after it, from a properly aligned buffer, starting at offset 100.",
    setup: { host: "ingest-03", job: "a log writer", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 0, at: 100, length: 512 },
    question: "Which of the three requirements does this violate?",
    options: [
      { id: "none", claim: "None of them. The buffer is aligned and the length is a whole block", says: { about: "blame", value: "nothing, it is accepted" } },
      { id: "offset", claim: "The offset. 100 is not a multiple of 512, and the file offset has to be as much as the buffer and the length do", says: { about: "blame", value: "the offset" } },
      { id: "address", claim: "The buffer address, because the header has pushed everything after it out of alignment", says: { about: "blame", value: "the buffer address" } },
      { id: "nothing", claim: "None of them, and it fails for a different reason", says: { about: "nothing" } },
    ],
    why:
      "Measured: offsets of 1, 100, 255, 256, 511 and 513 all return EINVAL, and 0, 512, 1024 and 4096 all write. The offset is the requirement people forget, because it is not a property of their code at all: it is where their data structure happens to put things, and a header of any size that is not a block puts everything after it wrong.",
    fix:
      "Make the header a whole block, padding it out, so everything after it starts aligned. A 100 byte header becomes a 512 byte header and the rest of the format stops fighting the device.",
    breaks: "aligning the buffer and the length is what direct I/O asks of you",
  },
  {
    slug: "the-buffer-from-malloc",
    name: "The buffer from malloc",
    brief:
      "A cache writes 64 kibibyte objects with O_DIRECT, from a buffer it got from malloc. malloc aligns to sixteen bytes, and this one landed seven bytes into a page.",
    setup: { host: "cache-02", job: "an object cache", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 7, at: 0, length: 65536 },
    question: "What happens?",
    options: [
      { id: "ok", claim: "It writes. The kernel copies the data into a buffer of its own when the address is awkward", says: { about: "accepted", value: true } },
      { id: "bounce", claim: "It writes, but it stops being direct and goes through the page cache instead", says: { about: "nothing" } },
      { id: "einval", claim: "EINVAL. The buffer is not on a block boundary, and 64 KiB from seven bytes into a page crosses sixteen page boundaries, so there is nothing the controller can be handed", says: { about: "accepted", value: false } },
      { id: "partial", claim: "It writes 4089 bytes, to the end of the page the buffer starts in", says: { about: "outcome", value: "it writes 4089 bytes" } },
    ],
    why:
      "Measured: a 64 KiB write from +1, +7 and +64 all return EINVAL, and the same write from an aligned buffer, or from +512, writes all 65536 bytes with none of the file's pages left in the cache afterwards. So the kernel is not bouncing anything and it is not falling back to buffered I/O: it either does it directly or refuses.",
    fix:
      "Allocate with posix_memalign, or aligned_alloc, at the figure statx gives you. Never malloc a buffer you intend to hand to O_DIRECT, however carefully you size it.",
    breaks: "the kernel will copy the data if your buffer is awkward",
  },
  {
    slug: "the-small-write-that-got-away-with-it",
    name: "The small write that got away with it",
    brief:
      "The same cache, the same malloc buffer seven bytes into a page, writing a single 512 byte block rather than 64 kibibytes.",
    setup: { host: "cache-02", job: "an object cache", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 7, at: 0, length: 512 },
    question: "And this one?",
    options: [
      { id: "no", claim: "EINVAL, the same as the last one. The buffer is in the same wrong place", says: { about: "accepted", value: false } },
      { id: "yes", claim: "It writes. A misaligned buffer is tolerated while the whole transfer stays inside the page it started in, and 7 plus 512 is nowhere near 4096", says: { about: "accepted", value: true } },
      { id: "nothing", claim: "It writes, but only because the file was empty", says: { about: "nothing" } },
      { id: "blame", claim: "It is refused, and the buffer address is to blame", says: { about: "blame", value: "the buffer address" } },
    ],
    why:
      "Measured: 512 byte writes from +1, +7, +8, +64, +255, +256 and +511 all went through. This is the worst thing on this page. The code is wrong, the tests are small, the tests pass, and the first write big enough to cross a page returns EINVAL in production.",
    fix:
      "Do not read this as permission. Fix the allocation. A misalignment that only fails above some size is a misalignment that fails when the load arrives.",
    breaks: "a misaligned buffer fails whenever you use it",
  },
  {
    slug: "the-largest-that-fits",
    name: "The largest that fits",
    brief:
      "The same buffer seven bytes into a page. Somebody wants to know exactly how much they can get away with before it starts failing.",
    setup: { host: "cache-02", job: "an object cache", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 7, at: 0, length: 1024 },
    question: "What is the largest length that works from this buffer?",
    options: [
      { id: "page", claim: "4096 bytes, one page, which is what the buffer has to stay inside", says: { about: "largest", value: 4096 } },
      { id: "rest", claim: "4089 bytes, which is what is left of the page after the seven", says: { about: "largest", value: 4089 } },
      { id: "block", claim: "3584 bytes. What is left of the page is 4089, and the length has to be a whole number of blocks as well, so it rounds down to seven of them", says: { about: "largest", value: 3584 } },
      { id: "nothing", claim: "There is no fixed answer, because it depends on how fragmented memory is", says: { about: "nothing" } },
    ],
    why:
      "Measured across ten misalignments: +1, +7, +64, +100 and +511 all stop at 3584; +513 and +1000 stop at 3072; +2000 stops at 2048; +3000 stops at 1024; and +4000 cannot write anything at all. Every one of them is the rest of the page rounded down to a block. Two rules apply at once here and the smaller wins.",
    fix:
      "There is nothing to get away with. The figure exists to be recognized in a bug report, where a write that works at 2 KiB and fails at 4 KiB is this and nothing else.",
    breaks: "the page is the limit, so the limit is a page",
  },
  {
    slug: "the-buffer-that-was-already-too-far",
    name: "The buffer that was already too far",
    brief:
      "A worker slices its own arena into records and hands one to O_DIRECT. This record starts 4000 bytes into a page, and it is a 512 byte write to offset 0.",
    setup: { host: "cache-02", job: "an arena slicer", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 4000, at: 0, length: 512 },
    question: "What is the largest length that works from here?",
    options: [
      { id: "small", claim: "512 bytes, since the small writes went through from every other misalignment", says: { about: "largest", value: 512 } },
      { id: "none", claim: "Nothing at all. There are 96 bytes left of the page and a block is 512, so no legal length fits, and every write from this buffer is EINVAL", says: { about: "largest", value: 0 } },
      { id: "rest", claim: "96 bytes, the rest of the page", says: { about: "largest", value: 96 } },
      { id: "nothing", claim: "It cannot be answered without knowing where the arena itself starts", says: { about: "nothing" } },
    ],
    why:
      "Measured: from +4000 nothing works, which is the only one of the ten misalignments with that answer. The rest of the page is 96 bytes, and the smallest legal transfer is a 512 byte block, so the two rules have no overlap. An arena that hands out records at arbitrary offsets will produce buffers like this one and buffers that work, and the difference is invisible in the code.",
    fix:
      "Align the arena's slices, not just the arena. An allocator that hands out block aligned records makes every one of them usable, and one that packs them tightly makes some fraction of them unusable at random.",
    breaks: "a small enough write always fits",
  },
  {
    slug: "the-two-that-were-both-wrong",
    name: "The two that were both wrong",
    brief:
      "A first attempt at direct I/O, from an aligned buffer, writing a 300 byte record at offset 100, which is where the previous record left off.",
    setup: { host: "ingest-03", job: "a first attempt", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 0, at: 100, length: 300 },
    question: "The write returns EINVAL. What does it tell you about which requirement was wrong?",
    options: [
      { id: "offset", claim: "That the offset was wrong, since that is the first thing the kernel checks", says: { about: "blame", value: "the offset" } },
      { id: "length", claim: "That the length was wrong, since that is what the call is about", says: { about: "blame", value: "the length" } },
      { id: "nothing", claim: "Nothing at all. Both the offset and the length are wrong here, and EINVAL is what every one of the three requirements returns, so the errno distinguishes none of them", says: { about: "blame", value: "the offset and the length" } },
      { id: "fine", claim: "It does not return EINVAL: 300 bytes is under a block, so it is padded", says: { about: "accepted", value: true } },
    ],
    why:
      "Three separate requirements and one undifferentiated errno. Nothing in the return value, in errno, or anywhere in /proc says which of the three it was, and when two are wrong at once fixing one of them changes nothing visible. That is why this is usually debugged by commenting out O_DIRECT, which makes it work and teaches nothing.",
    fix:
      "Check all three yourself before the call, against the figures statx gives you, and fail with a message that names the one that is wrong. It is six lines and it turns an afternoon into a log line.",
    breaks: "the errno tells you what was wrong",
  },
  {
    slug: "the-write-that-really-was-direct",
    name: "The write that really was direct",
    brief:
      "A 64 kibibyte write from a properly aligned buffer to offset 0, on a file that nothing else has touched. Afterwards, mincore is used to count how many of the file's pages are resident.",
    setup: { host: "db-01", job: "a checkpoint writer", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 0, at: 0, length: 65536 },
    question: "How many of the file's pages are in the page cache afterwards?",
    options: [
      { id: "sixteen", claim: "Sixteen, the 64 KiB that was just written. The flag is a hint and the kernel caches what it likes", says: { about: "nothing" } },
      { id: "direct", claim: "None. The write went to the device and left nothing behind, which is what mincore reports and what the flag is for", says: { about: "direct", value: true } },
      { id: "not", claim: "None, because the write was refused", says: { about: "accepted", value: false } },
      { id: "some", claim: "It cannot be said, because writeback may or may not have run", says: { about: "largest", value: 512 } },
    ],
    why:
      "Measured: 0 of the file's pages resident after the direct write, and 16 after the identical write without the flag. This is here so that the rest of the page means something. The three requirements are a real cost, and what they buy is real: the data goes to the device and the page cache is not disturbed, which is what a database wants when it is managing its own.",
    fix:
      "Nothing to fix. This is the arrangement the other nine cases are measured against.",
    breaks: "O_DIRECT is advisory and the kernel caches anyway",
  },
  {
    slug: "the-aligned-buffer-that-crossed-pages",
    name: "The aligned buffer that crossed pages",
    brief:
      "A buffer 512 bytes into a page, which is a block boundary but not a page boundary, writing one mebibyte. That transfer crosses two hundred and fifty six pages.",
    setup: { host: "db-01", job: "a checkpoint writer", blockAlign: 512, pageBytes: 4096, reportedBlksize: 4096, memOffset: 512, at: 0, length: 65536 },
    question: "Does crossing that many pages matter?",
    options: [
      { id: "no", claim: "No. The page only bounds a buffer that is not on a block boundary, and this one is, so the transfer can run as long as it likes", says: { about: "accepted", value: true } },
      { id: "yes", claim: "Yes, it is refused: the whole transfer has to stay inside one page", says: { about: "accepted", value: false } },
      { id: "largest", claim: "It is capped at 3584 bytes, what is left of the page rounded to a block", says: { about: "largest", value: 3584 } },
      { id: "nothing", claim: "Only if the pages are not physically contiguous", says: { about: "nothing" } },
    ],
    why:
      "Measured: a 64 KiB write from +512 wrote all of it, and the same write from +1, +7 and +64 did not. The page rule is not about crossing pages. It is about being handed a piece of memory that does not start where a block starts, which can only be described to the controller while it stays in one page. A buffer on a block boundary has no such problem and the page never comes into it.",
    fix:
      "Align to the block size and stop thinking about pages. Aligning to the page as well costs nothing and is what posix_memalign is usually asked for, but the requirement is the block.",
    breaks: "direct I/O requires page aligned buffers",
  },
];
