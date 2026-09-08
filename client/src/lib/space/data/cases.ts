/**
 * Six filesystems, one error message, six different things to do.
 *
 * Each case declares the state of a filesystem and one write. Nothing
 * declares a cause: the model works out which of the six stopped the write,
 * and the correct option is whichever names it. So a case whose prose says
 * one thing and whose numbers say another cannot pass CI.
 */

import type { Case } from "../types";

/** df reports 1K blocks by default, so these are the units throughout. */
const M = 1024;
const G = 1024 * 1024;

export const CASES: Case[] = [
  {
    slug: "the-log-that-was-deleted",
    name: "The log somebody already deleted",
    brief:
      "The application stopped writing at 04:12 with ENOSPC. Somebody was paged, found a 41G access log, deleted it, and went back to bed. The alert cleared for no time at all and then came back, and now du says the whole volume holds 9G and df says it is full.",
    filesystem: {
      mount: "/var/log",
      totalBlocks: 50 * G,
      namedBlocks: 9 * G,
      unlinkedBlocks: 41 * G,
      shadowedBlocks: 0,
      reservedFraction: 0.05,
      totalInodes: 3_200_000,
      usedInodes: 41_000,
      quotas: [],
    },
    write: { user: "app", blocks: 512 * M, files: 1, what: "the next log rotation" },
    question: "Why can nothing write to /var/log?",
    options: [
      { id: "a", claim: "The volume is genuinely out of blocks and needs more disk or fewer logs.", cause: "blocks" },
      { id: "b", claim: "A process still holds the deleted log open, so its blocks are allocated to a file with no name and du cannot see them.", cause: "unlinked" },
      { id: "c", claim: "The inodes are exhausted, which is what a directory full of small rotated logs does.", cause: "inodes" },
      { id: "d", claim: "The 5% reserve is all that is left, and the application does not run as root.", cause: "reserve" },
    ],
    why:
      "df counts blocks allocated to files. du walks names. Unlinking a file removes the name and not the allocation, and the kernel will not release the blocks while any process holds a descriptor on it, which is exactly what a logging process that has not been signalled does. So the 40G is still spent, still counted by df, and invisible to du and to ls and to every tidy-up script anybody writes. The gap between the two numbers is the entire diagnosis and it takes one command to see.",
    fix:
      "Find the holder with lsof +L1 or ls -l /proc/*/fd | grep deleted, then signal it to reopen: logrotate's copytruncate or a SIGHUP the process actually handles. Restarting works and is the version people reach for. Truncating through the descriptor with : > /proc/PID/fd/N frees the blocks without dropping the file, which is the trick worth knowing when the process cannot be restarted.",
    breaks: "that deleting a file frees its space",
  },
  {
    slug: "thirty-six-percent-and-full",
    name: "Thirty-six percent used, and full",
    brief:
      "A build agent's cache volume refuses to write. df shows 36% used and 30.5G available. The person looking at it has checked twice, because the number is right there and it says there is room.",
    filesystem: {
      mount: "/var/cache/build",
      totalBlocks: 50 * G,
      namedBlocks: 17 * G,
      unlinkedBlocks: 0,
      shadowedBlocks: 0,
      reservedFraction: 0.05,
      totalInodes: 3_200_000,
      usedInodes: 3_199_400,
      quotas: [],
    },
    write: { user: "runner", blocks: 4, files: 900, what: "unpacking a dependency tree" },
    question: "Why can the agent not unpack anything?",
    options: [
      { id: "a", claim: "The volume is out of blocks despite what df says, because df is reporting a stale value.", cause: "blocks" },
      { id: "b", claim: "A deleted file is holding the difference, which is why the numbers do not add up.", cause: "unlinked" },
      { id: "c", claim: "The reserve is in the way, since a third of a volume this size is more than the 5% held back.", cause: "reserve" },
      { id: "d", claim: "There is room in blocks and no inodes left to make files with, which df does not show and df -i does.", cause: "inodes" },
    ],
    why:
      "An inode is allocated when a file is created and a filesystem is formatted with a fixed number of them. ext4 defaults to roughly one per 16K of capacity, which is generous for a volume of documents and nowhere near enough for a dependency cache made of hundreds of thousands of tiny files. Space and inodes are two independent budgets and a write needs both, so running out of one while the other is a third used is not a contradiction. The error is the same ENOSPC either way, which is why nobody thinks to look.",
    fix:
      "df -i first, always, alongside df. Then delete files rather than bytes: the largest directories are not the problem, the most numerous ones are. Reformatting with -i 8192 or -N is the durable fix, and it cannot be done in place, which is why the answer for a cache volume is usually to stop keeping small files on a filesystem sized for large ones.",
    breaks: "that a filesystem with space on it can accept a file",
  },
  {
    slug: "root-can-write-and-nothing-else-can",
    name: "Root can write and the service cannot",
    brief:
      "A database volume is at 100%. The person on call can create files in it perfectly well, so they conclude the alert is wrong and the application's error is about something else. The application, which does not run as root, cannot write a byte.",
    filesystem: {
      mount: "/var/lib/postgresql",
      totalBlocks: 100 * G,
      namedBlocks: 96 * G,
      unlinkedBlocks: 0,
      shadowedBlocks: 0,
      reservedFraction: 0.05,
      totalInodes: 6_400_000,
      usedInodes: 22_000,
      quotas: [],
    },
    write: { user: "postgres", blocks: 2 * G, files: 1, what: "a WAL segment" },
    question: "Why does root succeed where postgres fails?",
    options: [
      { id: "a", claim: "The blocks are genuinely gone and root's write succeeded by luck of timing.", cause: "blocks" },
      { id: "b", claim: "There is a quota on the postgres user that does not apply to root.", cause: "quota" },
      { id: "c", claim: "The 5% reserve is what is left, and only root and processes with CAP_SYS_RESOURCE may spend it.", cause: "reserve" },
      { id: "d", claim: "A deleted file holds the remainder, and root's write went to a different allocation group.", cause: "unlinked" },
    ],
    why:
      "ext4 holds back 5% of the filesystem for root by default. It is not a safety margin for the disk, it is a guarantee that a full filesystem can still be administered and that root-owned daemons keep running while somebody fixes it. The consequence is that a full filesystem behaves differently depending on who asks, and testing with a root shell is testing the one case that works. df's percentage is computed against the non-reserved total, which is why it can read 100% while there are gigabytes left.",
    fix:
      "Free space, obviously. But the lesson is to reproduce a permissions-shaped fault as the user that has it: sudo -u postgres touch, not touch. And if the reserve is not wanted on a data volume with no root daemons on it, tune2fs -m 1 recovers most of it, at the cost of the thing the reserve is there for.",
    breaks: "that a filesystem is either full or not, for everybody at once",
  },
  {
    slug: "four-terabytes-and-a-hundred-gigabytes",
    name: "Four terabytes, and a hundred gigabytes",
    brief:
      "A new 4T archive volume was added to /srv/archive last month and the copy has been running ever since. This morning the root filesystem filled up. df shows /srv/archive at 2% and du shows almost nothing under it, and the copy is still failing.",
    filesystem: {
      mount: "/srv/archive",
      totalBlocks: 4 * G * 1024,
      namedBlocks: 90 * G,
      unlinkedBlocks: 0,
      shadowedBlocks: 0,
      reservedFraction: 0.05,
      totalInodes: 260_000_000,
      usedInodes: 14_000,
      quotas: [{ user: "archiver", limitBlocks: 100 * G, usedBlocks: 90 * G }],
    },
    write: { user: "archiver", blocks: 20 * G, files: 1, what: "the next archive tarball" },
    question: "Why is the copy failing onto a volume that is 2% used?",
    options: [
      { id: "a", claim: "There is a quota on the archiver user, which is the one limit df does not know about.", cause: "quota" },
      { id: "b", claim: "The volume is out of blocks and df's percentage is against the wrong total.", cause: "blocks" },
      { id: "c", claim: "The inodes are exhausted by the number of files copied so far.", cause: "inodes" },
      { id: "d", claim: "The reserve is in the way, because 2% of four terabytes is less than the 5% held back.", cause: "reserve" },
    ],
    why:
      "A quota is enforced against the user and reported by quota and repquota, and by nothing else. df answers about the filesystem, which has 3.9T free and is perfectly happy. The write fails with EDQUOT rather than ENOSPC, which is a different error entirely and prints as \"Disk quota exceeded\", and that is the tell if anybody reads it. Most tooling logs strerror and most people read \"disk\" and go to df. Four terabytes of volume and a hundred gigabytes of allowance is a configuration nobody would write down on purpose, and it is what happens when a quota set on the old volume survives the migration.",
    fix:
      "quota -s -u archiver, or repquota -a to see every limit at once. Then either raise it with edquota or remove it, and decide which, because a quota on the account doing the archiving may well be what somebody wanted before the volume grew forty times.",
    breaks: "that df knows what a user is allowed to write",
  },
  {
    slug: "hidden-under-the-mount-point",
    name: "The bytes underneath the mount point",
    brief:
      "The root filesystem is full. du -x / accounts for 12G of the 40G df says is used, and lsof +L1 finds nothing holding the difference, which rules out the usual answer. The 4T volume at /srv/archive was added last month, and the service that writes there has been running since long before that.",
    filesystem: {
      mount: "/",
      totalBlocks: 40 * G,
      namedBlocks: 12 * G,
      unlinkedBlocks: 0,
      shadowedBlocks: 27 * G + 900 * M,
      reservedFraction: 0.05,
      totalInodes: 2_600_000,
      usedInodes: 310_000,
      quotas: [],
    },
    write: { user: "app", blocks: 1 * G, files: 1, what: "an upload" },
    question: "Where are the missing 28G?",
    options: [
      { id: "a", claim: "A deleted file is holding them, which is why du cannot see them.", cause: "unlinked" },
      { id: "b", claim: "They are on the root filesystem, underneath a directory that something is now mounted over, so nothing can reach them to delete them.", cause: "shadowed" },
      { id: "c", claim: "The inodes are exhausted and the block count is a red herring.", cause: "inodes" },
      { id: "d", claim: "The reserve accounts for the difference on a volume of this size.", cause: "reserve" },
    ],
    why:
      "Mounting a filesystem on a directory hides whatever was in that directory. The files are not deleted and their blocks are not freed; they belong to the underlying filesystem and there is no path that reaches them, so du walking from / cannot count them and rm cannot remove them. It is the standard way for a data directory to fill a root volume: the service ran before the volume was mounted, wrote its data to the plain directory, and the mount arrived afterwards and covered it. Both copies exist and only one is visible.",
    fix:
      "Bind mount the root of the filesystem somewhere else and look underneath: mount --bind / /mnt/root, then du -x /mnt/root/srv. What is there is the copy from before the mount, and it can be deleted through the bind mount without touching what is live. This is also the case for du -x, since without it du crosses into the mounted volume and reports the visible copy twice.",
    breaks: "that everything on a filesystem is reachable from its mount point",
  },
  {
    slug: "genuinely-out-of-disk",
    name: "Genuinely out of disk",
    brief:
      "A metrics volume is full. df says 100%, du accounts for all of it, df -i shows 4% of inodes used, there are no quotas, and the write is from a process running as root. The control case, which is worth having because five of the six things this looks like are not this.",
    filesystem: {
      mount: "/var/lib/prometheus",
      totalBlocks: 200 * G,
      namedBlocks: 199 * G,
      unlinkedBlocks: 0,
      shadowedBlocks: 0,
      reservedFraction: 0.05,
      totalInodes: 13_000_000,
      usedInodes: 520_000,
      quotas: [],
    },
    write: { user: "root", blocks: 8 * G, files: 1, what: "a block compaction" },
    question: "What is wrong with this one?",
    options: [
      { id: "a", claim: "A deleted file is holding the space, since a metrics store rewrites its blocks constantly.", cause: "unlinked" },
      { id: "b", claim: "The inodes, because a metrics store keeps one file per block per retention window.", cause: "inodes" },
      { id: "c", claim: "Nothing subtle. The data is there, du agrees with df, and the volume needs to be bigger or hold less.", cause: "blocks" },
      { id: "d", claim: "The reserve, because a compaction is a large write and the margin is thin.", cause: "reserve" },
    ],
    why:
      "Sometimes the disk is full. It is worth having one of these in the set for the same reason a test suite needs a passing case: every diagnostic habit above is a way of noticing that two numbers disagree, and the way to tell that this is the ordinary one is that none of them do. df and du agree, df -i is nowhere near, there is no quota, and root gets the same answer as everybody else. That is the shape of an actual capacity problem, and reading it correctly takes the same four commands as reading any of the others.",
    fix:
      "Retention, compression, or a bigger volume, in that order of cheapness. And an alert on the trend rather than the threshold, because a volume that fills at a predictable rate should not be a page at four in the morning.",
    breaks: "that a diagnosis is only interesting when it is surprising",
  },
];
