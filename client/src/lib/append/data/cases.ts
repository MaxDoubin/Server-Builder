import type { Case } from "../types";

/**
 * Ten sets of writers, and what the file is afterwards.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * replaying the writes one at a time over a simulated file, under four
 * different interleavings, rather than by classifying the mode twice.
 *
 * Four of the ten are the same four writers and the same 51200 bytes, opened
 * four different ways, because the program that loses the data and the
 * program that does not are the same program apart from one flag.
 */
export const CASES: Case[] = [
  {
    slug: "the-log-that-lost-three-quarters",
    name: "The log that lost three quarters",
    brief:
      "Four worker processes write to one log file. Each opens it for writing on startup and writes two hundred sixty four byte records. Every write returns 64 and nothing reports an error anywhere.",
    setup: { host: "queue-03", job: "four workers", writers: 4, records: 200, bytes: 64, how: "separate", tiled: false },
    question: "How long is the file afterwards?",
    options: [
      { id: "all", claim: "51200 bytes. Every write succeeded, so everything that was written is there", says: { about: "size", value: 51200 } },
      { id: "one", claim: "12800 bytes, which is one writer's worth. They all walked the same offsets from zero and wrote over each other", says: { about: "size", value: 12800 } },
      { id: "half", claim: "25600 bytes, because on average half of the writes land on an offset nobody else used", says: { about: "size", value: 25600 } },
      { id: "safe", claim: "Nothing was lost. Four processes appending to one file is what log files are for", says: { about: "safe", value: true } },
    ],
    why:
      "Measured: 51200 bytes went into write() and the file came out 12800, which is 200 times 64 exactly. Each open() call makes its own file offset, so each writer started at zero and advanced its own, and the file ended up as long as the furthest any single one of them reached. Not one write failed, because none of them did anything wrong.",
    fix:
      "Open with O_APPEND. It makes the seek and the write one operation, which is the only thing here that survives writers that know nothing about each other.",
    breaks: "every write that returns success is in the file",
  },
  {
    slug: "the-flag-that-fixed-it",
    name: "The flag that fixed it",
    brief:
      "The same four workers on the same host, with O_APPEND added to the open call and nothing else changed.",
    setup: { host: "queue-03", job: "four workers", writers: 4, records: 200, bytes: 64, how: "append", tiled: false },
    question: "How long is the file afterwards?",
    options: [
      { id: "one", claim: "12800 bytes. The flag is a convenience and the writers still race", says: { about: "size", value: 12800 } },
      { id: "lost", claim: "38400 bytes are still lost, because the flag only affects where the first write goes", says: { about: "lost", value: 38400 } },
      { id: "nothing", claim: "It depends on whether the filesystem supports atomic appends", says: { about: "nothing" } },
      { id: "all", claim: "51200 bytes. O_APPEND makes the seek and the write one operation, so nothing can land between them", says: { about: "size", value: 51200 } },
    ],
    why:
      "Measured: the same 51200 bytes, and the file is 51200. O_APPEND is not shorthand for seeking to the end and then writing. The kernel does both under the inode lock, so there is no moment between them for another writer to use. Asking for the same thing in two steps is the previous case.",
    fix:
      "This is the arrangement to copy for anything append only. No lock, no coordination, and no shared state between the writers at all.",
    breaks: "appending is seeking to the end and then writing",
  },
  {
    slug: "twice-the-writers-the-same-loss",
    name: "Twice the writers, the same file",
    brief:
      "A different service, eight writers rather than four, fifty records each, four kilobytes a record, and the same mistake: each opens the file itself without O_APPEND.",
    setup: { host: "ingest-01", job: "eight shippers", writers: 8, records: 50, bytes: 4096, how: "separate", tiled: false },
    question: "How long is the file afterwards?",
    options: [
      { id: "eighth", claim: "204800 bytes, one writer's worth, because the number of writers does not come into it", says: { about: "size", value: 204800 } },
      { id: "all", claim: "1638400 bytes. With records this large the writes are far enough apart to miss each other", says: { about: "size", value: 1638400 } },
      { id: "half", claim: "819200 bytes, half of it, because two writers on average share each offset", says: { about: "size", value: 819200 } },
      { id: "block", claim: "409600 bytes, because a four kilobyte record is a whole block and two of them survive", says: { about: "size", value: 409600 } },
    ],
    why:
      "Measured: 1638400 bytes written and 204800 in the file, which is 50 times 4096. The figure is one writer's worth whatever the writer count, because the file is as long as the furthest offset any single writer reached and they all reach the same one. Adding writers adds loss and leaves the file the same size, which is what makes this hard to notice.",
    fix:
      "Look at the size against what the writers think they sent, not at the size over time. A log that grows and stays the same size under more load is this.",
    breaks: "more writers means more of the file survives",
  },
  {
    slug: "the-offset-that-was-inherited",
    name: "The offset that was inherited",
    brief:
      "A supervisor opens the log once, then forks four children, which write to the descriptor they inherited. Nobody passed O_APPEND.",
    setup: { host: "queue-03", job: "a supervisor and four children", writers: 4, records: 200, bytes: 64, how: "shared", tiled: false },
    question: "How long is the file afterwards?",
    options: [
      { id: "one", claim: "12800 bytes, the same as any other four writers without O_APPEND", says: { about: "size", value: 12800 } },
      { id: "quarter", claim: "3200 bytes, because the four of them share one offset and interleave into the space of one record each", says: { about: "size", value: 3200 } },
      { id: "all", claim: "51200 bytes. fork copies the descriptor and not the description, so all four share one offset and every write advances it for the others", says: { about: "size", value: 51200 } },
      { id: "nothing", claim: "The children cannot write to a descriptor the parent opened", says: { about: "nothing" } },
    ],
    why:
      "Measured: 51200 bytes in and 51200 in the file. An offset belongs to an open file description, which is what one open() creates. fork and dup hand out another descriptor onto the same description, so there is one offset between them and it moves for everybody. Two open() calls on the same path make two descriptions and two offsets, which is the first case.",
    fix:
      "Know which of the two you have. Inheriting a descriptor is safe for the offset and sharing a path is not, and nothing in the code looks different.",
    breaks: "two descriptors on one file always have their own offsets",
  },
  {
    slug: "the-ranges-that-did-not-overlap",
    name: "Ranges that do not overlap",
    brief:
      "An index builder gives each of four workers a stride: worker n writes record r at offset (r * 4 + n) * 64, with pwrite, so no two of them aim at the same bytes.",
    setup: { host: "index-02", job: "an index builder", writers: 4, records: 200, bytes: 64, how: "pwrite", tiled: true },
    question: "How long is the file afterwards?",
    options: [
      { id: "one", claim: "12800 bytes, because pwrite is a write like any other and they still collide", says: { about: "size", value: 12800 } },
      { id: "all", claim: "51200 bytes. Nothing overlaps, so there is nothing to lose and no offset anybody has to share", says: { about: "size", value: 51200 } },
      { id: "lost", claim: "38400 bytes are lost, the same as any four writers without O_APPEND", says: { about: "lost", value: 38400 } },
      { id: "nothing", claim: "pwrite cannot extend a file, so it stops at whatever the file was when they started", says: { about: "nothing" } },
    ],
    why:
      "Measured: 51200 in and 51200 out. This is the other way to be safe, and it is not about appending at all: if the writers agree in advance who owns which bytes, they do not need an offset between them or a flag. It only works because somebody worked out the layout.",
    fix:
      "Use pwrite when the layout is known ahead of time, as in a fixed record index, and O_APPEND when it is not, as in a log. Do not reach for pwrite because it sounds safer; it is safe here because of the arithmetic, not because of the call.",
    breaks: "only O_APPEND keeps concurrent writers from overwriting each other",
  },
  {
    slug: "the-pwrite-that-was-not-safe",
    name: "The pwrite that was not safe",
    brief:
      "The same index builder after a refactor that dropped the stride, so every worker computes its offsets as r * 64 and all four aim at the same bytes.",
    setup: { host: "index-02", job: "an index builder", writers: 4, records: 200, bytes: 64, how: "pwrite", tiled: false },
    question: "How long is the file afterwards?",
    options: [
      { id: "all", claim: "51200 bytes, because pwrite names its own offset and cannot be raced", says: { about: "size", value: 51200 } },
      { id: "safe", claim: "Nothing is lost, because each write goes exactly where it was told to", says: { about: "safe", value: true } },
      { id: "one", claim: "12800 bytes. Each write does go exactly where it was told, and all four were told the same thing", says: { about: "size", value: 12800 } },
      { id: "quarter", claim: "3200 bytes, because only the last writer's records remain", says: { about: "size", value: 3200 } },
    ],
    why:
      "Measured: 12800, the same as four writers with no flag at all. pwrite removes the shared offset as a problem and puts the layout in your hands, which is only an improvement if the layout is right. Every write here landed exactly where it asked to, and three quarters of them landed on top of another one.",
    fix:
      "pwrite makes correctness the caller's arithmetic. Check the stride, and prefer a layout where the owner of a byte range is obvious from the record number.",
    breaks: "pwrite is safe for concurrent writers",
  },
  {
    slug: "the-offset-that-was-ignored",
    name: "The offset that was ignored",
    brief:
      "Somebody who has read about both opens the file with O_APPEND for safety and uses pwrite with an explicit offset for control, on the reasoning that the two together are better than either.",
    setup: { host: "index-02", job: "a cautious writer", writers: 4, records: 200, bytes: 64, how: "append-pwrite", tiled: true },
    question: "Does each record land at the offset its pwrite names?",
    options: [
      { id: "yes", claim: "Yes. Naming the offset is the entire purpose of pwrite, and O_APPEND only decides where the file offset starts", says: { about: "honorsOffset", value: true } },
      { id: "no", claim: "No. On Linux, pwrite on a descriptor opened O_APPEND appends regardless and the offset argument is discarded", says: { about: "honorsOffset", value: false } },
      { id: "size", claim: "12800 bytes end up in the file, because the two flags cancel and the writers collide", says: { about: "size", value: 12800 } },
      { id: "nothing", claim: "pwrite returns EINVAL on a descriptor opened with O_APPEND", says: { about: "nothing" } },
    ],
    why:
      "Measured on a ten byte file: a plain descriptor pwriting two bytes at offset 0 left the size at ten and the content XX23456789, and an O_APPEND descriptor pwriting the same two bytes at the same offset took the size to twelve and put them on the end. pwrite(2) records it: POSIX requires O_APPEND to have no effect on where pwrite writes, and Linux appends anyway. The file here is the right length by accident, because appending four writers' records is the same total as tiling them.",
    fix:
      "Pick one. O_APPEND for a log and pwrite for a layout, and never both on the same descriptor, because the code then says something the kernel does not do.",
    breaks: "pwrite writes where you tell it to",
  },
  {
    slug: "the-bytes-nobody-counted",
    name: "The bytes nobody counted",
    brief:
      "Back to the eight shippers with their four kilobyte records and no O_APPEND. Somebody is reconciling the log against what the shippers report having sent.",
    setup: { host: "ingest-01", job: "eight shippers", writers: 8, records: 50, bytes: 4096, how: "separate", tiled: true },
    question: "How many bytes did the shippers hand to write?",
    options: [
      { id: "file", claim: "204800 bytes, which is what the file is, and write returned success for every one of them", says: { about: "written", value: 204800 } },
      { id: "lost", claim: "1433600 bytes, counting only the ones that did not survive", says: { about: "written", value: 1433600 } },
      { id: "half", claim: "819200 bytes, because half the calls were absorbed by another writer before they reached the filesystem", says: { about: "written", value: 819200 } },
      { id: "all", claim: "1638400 bytes. Eight writers, fifty records, four kilobytes each, and every call returned the full count", says: { about: "written", value: 1638400 } },
    ],
    why:
      "Every write returned the number of bytes it was given, so the shippers are right: 1638400 went in. The file is 204800. The gap is not an error anybody can see from either end, which is why reconciling a log against its writers is worth doing at all.",
    fix:
      "Count what the writers sent and compare it against the file. A shipper that reports more than the log holds is this, and no log line anywhere will tell you.",
    breaks: "the size of the file tells you how much was written to it",
  },
  {
    slug: "two-writers-are-enough",
    name: "Two writers are enough",
    brief:
      "A cron job and a daemon both append to the same status file, a few hundred times an hour, each having opened it for writing without O_APPEND. Somebody argues a race needs more contention than this.",
    setup: { host: "status-07", job: "a cron job and a daemon", writers: 2, records: 500, bytes: 128, how: "separate", tiled: false },
    question: "How much of what they wrote is missing?",
    options: [
      { id: "half", claim: "64000 bytes, exactly half, because the file holds one writer's worth and two of them wrote", says: { about: "lost", value: 64000 } },
      { id: "none", claim: "Nothing. Two writers this slow will not collide often enough to matter", says: { about: "lost", value: 0 } },
      { id: "some", claim: "128 bytes, one record, for the one time they happened to overlap", says: { about: "lost", value: 128 } },
      { id: "all", claim: "128000 bytes, all of it, since neither writer can see the other's records", says: { about: "lost", value: 128000 } },
    ],
    why:
      "The file is 64000 bytes, which is 500 times 128, and 128000 went in. It is not a matter of timing: each writer walks its own offsets from zero from the moment it opens the file, so the second one starts overwriting the first from its very first record. Contention makes a race more likely and this is not one.",
    fix:
      "Two writers is enough, and one writer plus a logrotate that reopens is enough. If more than one descriptor is open for writing, it needs O_APPEND.",
    breaks: "a race needs enough processes to be worth worrying about",
  },
  {
    slug: "the-supervisor-that-opened-it-twice",
    name: "Opened once, opened twice",
    brief:
      "A supervisor that opens the log once and forks, against one that has each child open the log for itself. Two hundred records of five hundred and twelve bytes from each of three children, and the only difference is where the open call sits.",
    setup: { host: "queue-03", job: "three children", writers: 3, records: 200, bytes: 512, how: "shared", tiled: false },
    question: "How much of what the children wrote survives, with the open before the fork?",
    options: [
      { id: "all", claim: "307200 bytes, all of it. One open call made one offset, and all three children move it as they write", says: { about: "size", value: 307200 } },
      { id: "third", claim: "102400 bytes, one child's worth, because three processes writing to one file is three processes writing to one file", says: { about: "size", value: 102400 } },
      { id: "lost", claim: "204800 bytes are lost, which is what moving the open call costs", says: { about: "lost", value: 204800 } },
      { id: "nothing", claim: "It is the same either way, because the file offset belongs to the file", says: { about: "nothing" } },
    ],
    why:
      "307200 bytes in and 307200 out. Moving the open call to the other side of the fork is the whole difference between this and losing two thirds: before it, there is one open file description and one offset; after it, there are three of each. The descriptor number can be the same in both, and strace shows the same writes.",
    fix:
      "Open before the fork, or use O_APPEND, and preferably both. What you cannot do is assume that because it is one file it is one offset.",
    breaks: "the file offset belongs to the file",
  },
];
