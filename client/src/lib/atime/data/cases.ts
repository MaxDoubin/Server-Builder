import type { Case } from "../types";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The pass measured on the host this was written on: /usr/share/doc, once. */
const PASS = 1059;

/**
 * Ten filesystems, one read each.
 *
 * Every yes and no comes from the model, and the gate recomputes each of them
 * by walking the kernel's own order of tests rather than by calling the same
 * function twice.
 */
export const CASES: Case[] = [
  {
    slug: "the-second-read",
    name: "Read it twice",
    brief:
      "A health check opens the same config file every ten seconds. Somebody watching iostat asks how much write traffic that is costing.",
    setup: {
      host: "web-04",
      mountOption: "relatime",
      readOnly: false,
      target: "file",
      inodeNoatime: false,
      atimeAge: 12,
      mtimeAge: 3 * HOUR,
      ctimeAge: 3 * HOUR,
      filesInPass: PASS,
      filesFreshInPass: PASS,
      cleanupDays: 30,
    },
    question: "Does this read write anything?",
    options: [
      { id: "no", claim: "No. None of relatime's three tests is true here, so the kernel skips the update", says: { about: "updates", value: false } },
      { id: "always", claim: "Yes. Every read moves the access time; that is what the field is for", says: { about: "updates", value: true } },
      { id: "daily", claim: "Yes, once a day, and this is the day's first read", says: { about: "reason", name: "day" } },
      { id: "ro", claim: "No, because this filesystem is mounted read-only", says: { about: "blocked", name: "the mount is read-only" } },
    ],
    why:
      "relatime updates atime only when mtime or ctime is at least as new as the stored atime, or when that atime is a day old or more. Ten seconds after the last read none of those is true. Measured: a fresh file's first read moved atime and the second and third reads, moments later, moved nothing.",
    fix:
      "Nothing to fix. This is the default, and it is why the old advice to mount noatime for performance buys far less than it used to.",
    breaks: "a read always updates the access time",
  },
  {
    slug: "chmod-moved-ctime",
    name: "The file did not change",
    brief:
      "A deployment runs chmod across a directory of static assets. The next request for one of them writes to the disk, and nobody has edited a byte.",
    setup: {
      host: "app-07",
      mountOption: "relatime",
      readOnly: false,
      target: "file",
      inodeNoatime: false,
      atimeAge: 2 * HOUR,
      mtimeAge: 25 * HOUR,
      ctimeAge: 30,
      filesInPass: 400,
      filesFreshInPass: 400,
      cleanupDays: 30,
    },
    question: "The contents are identical. Why does this read write?",
    options: [
      { id: "nothing", claim: "It does not. Nothing changed, so there is nothing to record", says: { about: "updates", value: false } },
      { id: "day", claim: "The day rule: the stored access time is over a day old", says: { about: "reason", name: "day" } },
      { id: "ctime", claim: "ctime moved when the mode changed, and relatime compares atime against ctime as well as mtime", says: { about: "reason", name: "ctime" } },
      { id: "flag", claim: "The A flag was cleared, and clearing it forces one update", says: { about: "nothing" } },
    ],
    why:
      "The second of relatime's three tests is about the inode, not the contents. chmod, chown, a rename and a hard link all move ctime, and each of them arms the next read to write. Measured: a chmod alone, with mtime left at 25 hours old, made the following read move atime.",
    fix:
      "Expect a burst of atime writes after any mass metadata change. It is one write per file and it does not repeat.",
    breaks: "relatime only looks at whether the contents changed",
  },
  {
    slug: "twenty-days-since-the-last-read",
    name: "Four hundred and ninety four hours",
    brief:
      "A file on the base image was written in March 2024 and last read three weeks ago. A profiler catches a write while the only thing running is a read.",
    setup: {
      host: "build-02",
      mountOption: "relatime",
      readOnly: false,
      target: "file",
      inodeNoatime: false,
      atimeAge: 1_779_228,
      mtimeAge: 78_017_760,
      ctimeAge: 78_017_760,
      filesInPass: PASS,
      filesFreshInPass: 0,
      cleanupDays: 30,
    },
    question: "Which rule lets this one through?",
    options: [
      { id: "none", claim: "None of them. The file has not changed in two and a half years", says: { about: "updates", value: false } },
      { id: "day", claim: "The day rule. The stored access time is 494 hours old, and relatime updates once a day whatever else is true", says: { about: "reason", name: "day" } },
      { id: "mtime", claim: "The mtime rule, since mtime is far older than atime", says: { about: "reason", name: "mtime" } },
      { id: "ctime", claim: "The ctime rule, since the inode was last written at build time", says: { about: "reason", name: "ctime" } },
    ],
    why:
      "The first two tests ask whether mtime or ctime is at least as new as atime, and here both are years older, so both say no. The third asks only how old the stored atime is. Measured on /usr/lib/file/magic.mgc: atime 494.23 h old, mtime 21671.60 h old, one read moved atime 494 hours forward, and a second read seconds later moved nothing. Same file, same reader; only the age of the stored atime differed.",
    fix:
      "Nothing. This is the once-a-day floor relatime keeps so that atime stays roughly usable.",
    breaks: "relatime skips the update when the file has not changed",
  },
  {
    slug: "the-read-only-mount",
    name: "Nowhere to put the answer",
    brief:
      "A tool ships on its own ext4 image, mounted ro,relatime. Its binary records an access time of 1999 and a change time of yesterday.",
    setup: {
      host: "runner-15",
      mountOption: "relatime",
      readOnly: true,
      target: "file",
      inodeNoatime: false,
      atimeAge: 843_203_592,
      mtimeAge: 843_203_592,
      ctimeAge: 105_264,
      filesInPass: 3,
      filesFreshInPass: 0,
      cleanupDays: 30,
    },
    question: "Running it reads the binary. Does that move its access time?",
    options: [
      { id: "yes", claim: "Yes. All three relatime tests are true here, so the kernel writes", says: { about: "updates", value: true } },
      { id: "ro", claim: "No. The mount is read-only, and there is nowhere to put the answer", says: { about: "blocked", name: "the mount is read-only" } },
      { id: "noatime", claim: "No, because noatime is set on this mount", says: { about: "blocked", name: "noatime on the mount" } },
      { id: "flag", claim: "No, because the inode carries the A flag", says: { about: "blocked", name: "the A flag on the inode" } },
    ],
    why:
      "The read-only check is not part of the relatime decision. atime_needs_update says yes, and then touch_atime asks the mount for write access and is refused. Measured on /opt/claude-code/bin/claude, ext4 mounted ro,relatime, with atime equal to mtime and ctime 29 hours newer, so every one of the three tests said update: the read moved nothing.",
    fix:
      "Nothing to fix, and worth knowing: access times on a read-only image are the image's, not yours, so they say nothing about what is being used.",
    breaks: "the three relatime rules are the whole decision",
  },
  {
    slug: "the-cleanup-that-deletes-what-is-in-use",
    name: "Read two hundred times, forty days old",
    brief:
      "A cache directory is mounted noatime, which somebody set years ago for throughput. A nightly job removes anything not accessed in 30 days. One of the files is read two hundred times a minute.",
    setup: {
      host: "cache-01",
      mountOption: "noatime",
      readOnly: false,
      target: "file",
      inodeNoatime: false,
      atimeAge: 40 * DAY,
      mtimeAge: 40 * DAY,
      ctimeAge: 40 * DAY,
      filesInPass: 2000,
      filesFreshInPass: 0,
      cleanupDays: 30,
    },
    question: "What does the nightly job do with that file?",
    options: [
      { id: "keeps", claim: "Keeps it. Reading a file is what keeps its access time current", says: { about: "cleanup", value: false } },
      { id: "deletes", claim: "Deletes it. noatime means the reads never move atime, so it has read as 40 days old since the day it was written", says: { about: "cleanup", value: true } },
      { id: "blind", claim: "Keeps it. Under noatime there is no access time for the job to test", says: { about: "nothing" } },
      { id: "daily", claim: "Keeps it. noatime still lets the once-a-day refresh through", says: { about: "reason", name: "day" } },
    ],
    why:
      "An access time frozen by noatime does not read as missing. It reads as old, and every tool that selects on age agrees it is old. Measured with the per-inode form of the same flag: a file backdated 40 days and then read 200 times in a row still reported an access time 40.0 days old, and clearing the flag moved it to zero on the very next read.",
    fix:
      "Pick one. Either the mount keeps access times or the cleanup selects on something else, such as mtime or a record the application keeps itself.",
    breaks: "atime tells you when a file was last read",
  },
  {
    slug: "the-flag-on-the-inode",
    name: "lsattr prints A",
    brief:
      "One file on an ordinary relatime mount never updates its access time. The mount options are the same as everything around it.",
    setup: {
      host: "db-03",
      mountOption: "relatime",
      readOnly: false,
      target: "file",
      inodeNoatime: true,
      atimeAge: 26 * HOUR,
      mtimeAge: 30 * HOUR,
      ctimeAge: 30 * HOUR,
      filesInPass: 500,
      filesFreshInPass: 0,
      cleanupDays: 90,
    },
    question: "relatime's day rule fires here. What stops the update anyway?",
    options: [
      { id: "nothing", claim: "Nothing stops it. The day rule fires and the update happens", says: { about: "updates", value: true } },
      { id: "mount", claim: "noatime on the mount", says: { about: "blocked", name: "noatime on the mount" } },
      { id: "ro", claim: "The mount is read-only", says: { about: "blocked", name: "the mount is read-only" } },
      { id: "flag", claim: "The A flag on the inode, which is noatime for this one file and which lsattr prints", says: { about: "blocked", name: "the A flag on the inode" } },
    ],
    why:
      "The kernel tests the inode's own flag before it tests anything about the mount, so one file can opt out while the rest of the filesystem behaves. Measured: with the flag set and atime backdated 26 hours, a read moved nothing; with the flag cleared, the same read moved atime at once.",
    fix:
      "lsattr, not just mount, when an access time will not move. chattr -A puts the file back.",
    breaks: "atime behavior is a property of the mount",
  },
  {
    slug: "nodiratime-and-the-listing",
    name: "Listing the directory",
    brief:
      "A share is mounted rw,nodiratime. A crawler walks it every night, listing three hundred thousand directories.",
    setup: {
      host: "nfs-gw",
      mountOption: "nodiratime",
      readOnly: false,
      target: "directory",
      inodeNoatime: false,
      atimeAge: 1_082_160,
      mtimeAge: 5_000_000,
      ctimeAge: 5_000_000,
      filesInPass: 1200,
      filesFreshInPass: 0,
      cleanupDays: 30,
    },
    question: "The directory's access time is twelve days old. What stops the listing from moving it?",
    options: [
      { id: "nodiratime", claim: "nodiratime on the mount, which spares directories and nothing else", says: { about: "blocked", name: "nodiratime on the mount" } },
      { id: "nothing", claim: "Nothing. The listing writes, because twelve days is past the day rule", says: { about: "updates", value: true } },
      { id: "flag", claim: "The A flag on the inode", says: { about: "blocked", name: "the A flag on the inode" } },
      { id: "dirs", claim: "Nothing needs to. The kernel keeps no access time for a directory", says: { about: "nothing" } },
    ],
    why:
      "A directory has an access time and listing it is a read, so relatime applies to directories exactly as it does to files. Measured: the subdirectories of /usr/src, /var/cache and /usr/libexec, none listed that day, moved 1, 8 and 6 access times on a single listing, one per directory. nodiratime is the option that turns that off for directories alone.",
    fix:
      "nodiratime is the right setting for a tree that gets walked and whose files still want honest access times.",
    breaks: "nodiratime is noatime with a longer name",
  },
  {
    slug: "the-same-mount-one-file-deeper",
    name: "One file deeper",
    brief:
      "Same share, same crawler, same night. Having listed the directory it opens one of the files inside it.",
    setup: {
      host: "nfs-gw",
      mountOption: "nodiratime",
      readOnly: false,
      target: "file",
      inodeNoatime: false,
      atimeAge: 1_082_160,
      mtimeAge: 5_000_000,
      ctimeAge: 5_000_000,
      filesInPass: 1200,
      filesFreshInPass: 0,
      cleanupDays: 30,
    },
    question: "Does reading that file write?",
    options: [
      { id: "mount", claim: "No. nodiratime is on the mount, so nothing under it updates", says: { about: "blocked", name: "nodiratime on the mount" } },
      { id: "unchanged", claim: "No. The file has not changed since it was last read", says: { about: "updates", value: false } },
      { id: "yes", claim: "Yes. nodiratime spares directories only, and this file's access time is twelve days old", says: { about: "updates", value: true } },
      { id: "mtime", claim: "Yes, because mtime is newer than atime", says: { about: "reason", name: "mtime" } },
    ],
    why:
      "nodiratime is scoped to directories. Every file under the mount is still on relatime's terms, and this one has not been read in twelve days, so the day rule fires. The pair matters because a crawl is mostly listings but the writes it causes are mostly files.",
    fix:
      "If the files should be spared too, the option is noatime. nodiratime by itself is a half measure, on purpose.",
    breaks: "one mount option applies to everything under the mount",
  },
  {
    slug: "one-thousand-and-fifty-nine-reads",
    name: "The backup that writes",
    brief:
      "A nightly backup reads 1059 files under a documentation tree. It opens every one read-only and writes nothing itself. The volume shows write traffic all the same.",
    setup: {
      host: "backup-01",
      mountOption: "relatime",
      readOnly: false,
      target: "file",
      inodeNoatime: false,
      atimeAge: 1_082_160,
      mtimeAge: 5_000_000,
      ctimeAge: 5_000_000,
      filesInPass: PASS,
      filesFreshInPass: 0,
      cleanupDays: 30,
    },
    question: "How many inodes does that pass dirty?",
    options: [
      { id: "none", claim: "0. It is a backup: it opens files for reading and writes nothing", says: { about: "dirtied", value: 0 } },
      { id: "all", claim: "1059, one per file, because none of them has been read today", says: { about: "dirtied", value: PASS } },
      { id: "double", claim: "2118, one for each file and one for the directory holding it", says: { about: "dirtied", value: 2 * PASS } },
      { id: "batched", claim: "1, because the kernel folds the updates into a single inode write", says: { about: "dirtied", value: 1 } },
    ],
    why:
      "Measured exactly: 1059 files under /usr/share/doc, none of them read that day, dirtied 1059 inodes. One read, one inode write, per file. Directories are charged separately and only when the pass lists them, which a backup reading a file list does not.",
    fix:
      "If the tree is only ever read by machines, noatime on that mount removes the write traffic. Check nothing selects on access age first.",
    breaks: "a read-only pass does not write",
  },
  {
    slug: "the-same-pass-twenty-minutes-later",
    name: "The second pass",
    brief:
      "The backup is rerun twenty minutes after the first one finished, over the same 1059 files, none of which changed in between.",
    setup: {
      host: "backup-01",
      mountOption: "relatime",
      readOnly: false,
      target: "file",
      inodeNoatime: false,
      atimeAge: 20 * MINUTE,
      mtimeAge: 5_000_000,
      ctimeAge: 5_000_000,
      filesInPass: PASS,
      filesFreshInPass: PASS,
      cleanupDays: 30,
    },
    question: "How many inodes does the second pass dirty?",
    options: [
      { id: "none", claim: "0. Every one of them was read twenty minutes ago, so the only test left that could fire is the day rule", says: { about: "dirtied", value: 0 } },
      { id: "all", claim: "1059 again. The kernel keeps no memory of the earlier pass", says: { about: "dirtied", value: PASS } },
      { id: "half", claim: "529, about half, because the updates are spread across the day", says: { about: "dirtied", value: 529 } },
      { id: "depends", claim: "It depends on whether the first pass reached the disk before the second began", says: { about: "nothing" } },
    ],
    why:
      "Measured: the same 1059 files, read a second time, dirtied nothing. The cost of reading a tree is not per pass, it is per file per day, and it lands on whichever pass gets there first.",
    fix:
      "Nothing. This is also why a benchmark that reads the same tree twice reports a write cost on the first run only.",
    breaks: "the cost of a read pass is the same every time",
  },
];
