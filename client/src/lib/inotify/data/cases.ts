import type { Case } from "../types";

/** What this host reports, and roughly what any modern Linux box reports. */
const WATCHES = 130_082;
const INSTANCES = 128;
const QUEUE = 16_384;
const NOFILE = 20_000;
/** 19.7 GiB, which is the number that makes the first case absurd. */
const DISK = 20_173;

/**
 * Ten hosts, one watcher each.
 *
 * Every number in an option is produced by the model, and the gate recomputes
 * each of them by counting rather than by multiplying before the set ships.
 */
export const CASES: Case[] = [
  {
    slug: "no-space-on-a-disk-with-space",
    name: "Nineteen gigabytes free",
    brief:
      "A file watcher on a build server dies at startup with 'No space left on device'. The first three people to look check df, and df is fine.",
    setup: {
      host: "build-02",
      maxUserWatches: 8192,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 0,
      instancesHeldByOthers: 0,
      directories: 12_000,
      instances: 1,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 100,
    },
    question: "What ran out?",
    options: [
      { id: "watches", claim: "fs.inotify.max_user_watches, at 8192 against 12000 directories", says: { about: "culprit", name: "fs.inotify.max_user_watches" } },
      { id: "disk", claim: "The filesystem, whatever df says about it", says: { about: "culprit", name: "the filesystem" } },
      { id: "emfile", claim: "Descriptors, which is what ENOSPC means on a socket", says: { about: "errno", name: "EMFILE" } },
      { id: "inodes", claim: "Inodes, which df -i would have shown", says: { about: "nothing" } },
    ],
    why:
      "inotify_add_watch returns ENOSPC when the user's watch budget is spent, and strerror prints 'No space left on device' because that is what errno 28 says everywhere else. Measured on one host with 19.7 GiB free at the moment of the failure.",
    fix:
      "Raise fs.inotify.max_user_watches, in /etc/sysctl.d so it survives a reboot. Then ask why one program needs 12000 of them.",
    breaks: "ENOSPC from a file watcher means the disk is full",
  },
  {
    slug: "the-budget-was-spent-by-someone-else",
    name: "Eighty two left",
    brief:
      "A small watcher wants 500 directories on a host whose limit is 130,082. It fails. The developer points at the limit and says it cannot possibly be that.",
    setup: {
      host: "dev-11",
      maxUserWatches: WATCHES,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 130_000,
      instancesHeldByOthers: 9,
      directories: 500,
      instances: 1,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 100,
    },
    question: "The limit is 130,082 and this program wants 500. How many can it have?",
    options: [
      { id: "all", claim: "All 500: it is nowhere near the limit", says: { about: "fits", value: true } },
      { id: "left", claim: "82, because the limit is per user and other processes hold 130,000", says: { about: "free", value: 82 } },
      { id: "half", claim: "65041, since the limit is shared evenly", says: { about: "free", value: 65_041 } },
      { id: "perproc", claim: "130082, because the limit is per process and this one is fresh", says: { about: "free", value: 130_082 } },
    ],
    why:
      "max_user_watches is charged to the real UID across every process that user runs. Measured: with the limit set to 200 and 181 already held by an unrelated process, a fresh instance got exactly 19 more.",
    fix:
      "Find the holder before touching the sysctl. Counting 'inotify wd:' lines in /proc/*/fdinfo/* names it in one command.",
    breaks: "the inotify limits are per process",
  },
  {
    slug: "too-many-open-files-with-six-open",
    name: "Six descriptors, too many open files",
    brief:
      "A sync agent fails with 'Too many open files'. It has six descriptors open. The ulimit was raised to 20,000 last month for exactly this reason.",
    setup: {
      host: "sync-03",
      maxUserWatches: WATCHES,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 0,
      instancesHeldByOthers: 127,
      directories: 10,
      instances: 4,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 50,
    },
    question: "Which limit is this?",
    options: [
      { id: "nofile", claim: "RLIMIT_NOFILE, which needs raising again", says: { about: "nothing" } },
      { id: "watches", claim: "fs.inotify.max_user_watches, at 130082", says: { about: "culprit", name: "fs.inotify.max_user_watches" } },
      { id: "instances", claim: "fs.inotify.max_user_instances, with 127 of 128 already held", says: { about: "culprit", name: "fs.inotify.max_user_instances" } },
      { id: "fine", claim: "Nothing: six descriptors cannot exhaust anything", says: { about: "fits", value: true } },
    ],
    why:
      "inotify_init returns EMFILE when the user's instance budget is spent, and errno 24 prints as 'Too many open files' regardless of how few files are open. Measured with RLIMIT_NOFILE at 20000 and a handful of descriptors in use.",
    fix:
      "Raise fs.inotify.max_user_instances. Raising the ulimit again will do nothing, and somebody already tried it once.",
    breaks: "EMFILE means the process has too many descriptors open",
  },
  {
    slug: "one-watch-per-directory",
    name: "A watch is not a tree",
    brief:
      "A bundler is told to watch one project directory recursively. The project has 41,000 directories under it, most of them in node_modules.",
    setup: {
      host: "ci-07",
      maxUserWatches: WATCHES,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 0,
      instancesHeldByOthers: 2,
      directories: 41_000,
      instances: 1,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 200,
    },
    question: "How many watches does that cost?",
    options: [
      { id: "one", claim: "1, the directory that was passed in", says: { about: "watches", value: 1 } },
      { id: "double", claim: "82000, a watch and a handle for each", says: { about: "watches", value: 82_000 } },
      { id: "none", claim: "None until a file actually changes", says: { about: "nothing" } },
      { id: "each", claim: "41000, one per directory in the tree", says: { about: "watches", value: 41_000 } },
    ],
    why:
      "inotify watches an inode, and a recursive watch is the library walking the tree and adding one per directory. There is no recursive mode in the kernel interface, which is why every watcher library has this loop and why node_modules is the usual culprit.",
    fix:
      "Exclude what does not need watching. A bundler that ignores node_modules drops this by an order of magnitude and nothing is lost.",
    breaks: "watching a directory tree costs one watch",
  },
  {
    slug: "two-instances-pay-twice",
    name: "The same tree, charged twice",
    brief:
      "One program opens two inotify instances, one for source and one for assets, and both end up watching the same 30,000 directories.",
    setup: {
      host: "dev-04",
      maxUserWatches: WATCHES,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 0,
      instancesHeldByOthers: 3,
      directories: 30_000,
      instances: 2,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 300,
    },
    question: "What is charged to the user?",
    options: [
      { id: "both", claim: "60000: each instance pays for its own watches", says: { about: "watches", value: 60_000 } },
      { id: "shared", claim: "30000, since the inodes are the same", says: { about: "watches", value: 30_000 } },
      { id: "one", claim: "1, the kernel keeps one watch per inode globally", says: { about: "watches", value: 1 } },
      { id: "none", claim: "Nothing, instances have their own budget", says: { about: "nothing" } },
    ],
    why:
      "Deduplication is per instance, not per user. Measured: a second instance watching a directory the first already watched brought the process to two watches held, both charged. This is why a machine with an editor, a bundler, a test runner and a file syncer runs out on a project none of them would exhaust alone.",
    fix:
      "One instance per program if you can. Otherwise this is a real cost and has to be budgeted for rather than assumed away.",
    breaks: "two watchers on one tree share the watches",
  },
  {
    slug: "asking-twice-inside-one-instance",
    name: "Added at startup, added again on rescan",
    brief:
      "A watcher adds a watch on each of its 30,000 directories at startup, then rescans on SIGHUP and adds them all again without removing anything.",
    setup: {
      host: "agent-02",
      maxUserWatches: WATCHES,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 0,
      instancesHeldByOthers: 1,
      directories: 30_000,
      instances: 1,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 400,
    },
    question: "After the rescan, what is charged?",
    options: [
      { id: "double", claim: "60000, one per call", says: { about: "watches", value: 60_000 } },
      { id: "same", claim: "30000: the second call returns the same wd", says: { about: "watches", value: 30_000 } },
      { id: "leak", claim: "It grows without bound on every rescan", says: { about: "nothing" } },
      { id: "fail", claim: "The second pass fails with ENOSPC", says: { about: "errno", name: "ENOSPC" } },
    ],
    why:
      "Within one instance the kernel keys the watch on the inode, so a second inotify_add_watch on the same directory returns the descriptor already issued. Measured: wd 1, then wd 1 again, and the same wd once more through a different path string to the same inode.",
    fix:
      "Nothing to fix. Worth knowing so the rescan is not rewritten to avoid a leak that was never there.",
    breaks: "adding the same watch twice costs twice",
  },
  {
    slug: "raising-the-wrong-knob",
    name: "A million watches, still failing",
    brief:
      "Both budgets are short: 127 of 128 instances are held, and the watcher wants 200,000 directories. Somebody raises max_user_watches to a million and restarts it.",
    setup: {
      host: "build-09",
      maxUserWatches: 1_000_000,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 0,
      instancesHeldByOthers: 127,
      directories: 200_000,
      instances: 3,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 500,
    },
    question: "What does the watcher report now?",
    options: [
      { id: "fixed", claim: "Nothing: a million watches is plenty", says: { about: "fits", value: true } },
      { id: "enospc", claim: "ENOSPC still, because 200000 is the real problem", says: { about: "errno", name: "ENOSPC" } },
      { id: "emfile", claim: "EMFILE: the instance is created before any watch is added", says: { about: "errno", name: "EMFILE" } },
      { id: "none", claim: "It works, but drops events", says: { about: "nothing" } },
    ],
    why:
      "inotify_init runs first. When both budgets are short, the instance limit is the one that reports, so the watch limit can be raised as high as you like without the message changing. That is how a host ends up with max_user_watches at a million and the same error in the log.",
    fix:
      "Read the errno rather than the message. EMFILE and ENOSPC point at different sysctls and neither name appears in either string.",
    breaks: "raising max_user_watches fixes an inotify failure",
  },
  {
    slug: "the-queue-drops-in-silence",
    name: "Sixty five thousand touched files",
    brief:
      "A build touches 65,536 files while the watcher's reader is blocked on something else. Afterwards the watcher's state is wrong and its log shows no errors.",
    setup: {
      host: "ci-02",
      maxUserWatches: WATCHES,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 0,
      instancesHeldByOthers: 2,
      directories: 5_000,
      instances: 1,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 65_536,
    },
    question: "How many events never reach the reader?",
    options: [
      { id: "none", claim: "None: the queue blocks the writer until it drains", says: { about: "lost", value: 0 } },
      { id: "all", claim: "65536, the queue is discarded whole on overflow", says: { about: "lost", value: 65_536 } },
      { id: "over", claim: "49152, everything past the 16384 the queue holds", says: { about: "lost", value: 49_152 } },
      { id: "error", claim: "None are lost, but the next read returns an error", says: { about: "nothing" } },
    ],
    why:
      "The reader gets the queue's worth plus a single IN_Q_OVERFLOW marker with wd set to -1, and the rest are gone. Measured with the limit lowered to 64: 256 files created, 65 events read back, 192 lost, and every read returned success.",
    fix:
      "Check every event for IN_Q_OVERFLOW and treat it as 'rescan everything', because after it the watcher's picture of the tree is wrong and nothing else will say so.",
    breaks: "a full event queue reports an error",
  },
  {
    slug: "a-big-tree-that-fits",
    name: "Fifty thousand, and fine",
    brief:
      "A watcher on a 50,000 directory tree, on a host where other processes hold 20,000 watches. The team wants to know whether to raise the sysctl before shipping.",
    setup: {
      host: "app-05",
      maxUserWatches: WATCHES,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 20_000,
      instancesHeldByOthers: 6,
      directories: 50_000,
      instances: 1,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 1_000,
    },
    question: "Does this fit as it stands?",
    options: [
      { id: "yes", claim: "Yes: 50000 against 110082 still free", says: { about: "fits", value: true } },
      { id: "no", claim: "No, 50000 is too many for any host", says: { about: "fits", value: false } },
      { id: "enospc", claim: "It will fail with ENOSPC under load", says: { about: "errno", name: "ENOSPC" } },
      { id: "none", claim: "Only if nothing else starts afterwards", says: { about: "nothing" } },
    ],
    why:
      "130,082 less the 20,000 already held leaves 110,082, and the watcher wants 50,000 of them. The default is not small; a tree has to be genuinely large, or shared with several other watchers, before it is the constraint.",
    fix:
      "Ship it. Measure the held total on the real host rather than raising a sysctl because a tree looked big.",
    breaks: "a watcher on a large tree always needs the sysctl raised",
  },
  {
    slug: "the-queue-is-per-instance",
    name: "Four queues, not one",
    brief:
      "A watcher opens four inotify instances and someone reasons that it therefore has 65,536 events of buffer. A burst of 20,000 events arrives at one of them.",
    setup: {
      host: "agent-08",
      maxUserWatches: WATCHES,
      maxUserInstances: INSTANCES,
      maxQueuedEvents: QUEUE,
      watchesHeldByOthers: 0,
      instancesHeldByOthers: 4,
      directories: 2_000,
      instances: 4,
      nofileSoft: NOFILE,
      diskFreeMiB: DISK,
      eventsBurst: 20_000,
    },
    question: "How many of that burst are lost?",
    options: [
      { id: "pooled", claim: "None: four instances hold 65536 between them", says: { about: "lost", value: 0 } },
      { id: "all", claim: "20000, since one instance cannot take a burst that size", says: { about: "lost", value: 20_000 } },
      { id: "quarter", claim: "The burst is spread across the four queues", says: { about: "nothing" } },
      { id: "over", claim: "3616, everything past this instance's own 16384", says: { about: "lost", value: 3_616 } },
    ],
    why:
      "max_queued_events is per instance, unlike max_user_watches and max_user_instances, which are per user. Opening more instances buys more queue in total and none at all for the instance the burst lands on, because events go to the instances watching the inode that changed.",
    fix:
      "Drain faster, or raise max_queued_events. Splitting across instances only helps if the load splits with it.",
    breaks: "max_queued_events is a per user budget like the other two",
  },
];
