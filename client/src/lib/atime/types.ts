/**
 * Whether reading a file writes to the disk.
 *
 * Every number and every yes or no below was measured on the host this was
 * written on, kernel 6.18.44, root on ext4 mounted rw,relatime, by stating a
 * file, reading it, and stating it again. stat itself does not move atime, so
 * the measurement does not disturb what it measures: fifty stat calls in a
 * row left atime untouched.
 *
 * FIRST, the part that surprises people who have only ever heard "atime is a
 * write on every read". On a relatime mount, which is every default mount on
 * Linux since 2009, most reads write nothing:
 *
 *     first read of a fresh file        atime moved
 *     second read, moments later        atime did not move
 *     third read                        atime did not move
 *
 * The kernel updates atime on a read only when one of three things is true,
 * and they are checked in this order:
 *
 *     mtime is at least as new as atime      the file changed since last read
 *     ctime is at least as new as atime      the inode changed since last read
 *     the stored atime is a day old or more  once a day, whatever else happens
 *
 * SECOND, the middle rule swallows the first one. Nothing moves mtime without
 * also moving ctime, and utimes, which sets mtime to whatever you like, sets
 * ctime to now. So ctime is never older than mtime on a real file, and the
 * mtime rule can only fire when the ctime rule fires too. Measured both ways:
 * a write moved both and the read updated; a chmod, which moves ctime alone,
 * also made the next read update.
 *
 * THIRD, the day rule, isolated on a file nothing here had touched:
 *
 *     /usr/lib/file/magic.mgc
 *     atime 494.23 h ago, mtime 21671.60 h ago, ctime 21671.60 h ago
 *     one read              atime moved 494 hours forward
 *     one more read at once atime did not move
 *
 * Same file, same reader, seconds apart. The only thing that differed between
 * the two reads was how old the stored atime was.
 *
 * FOURTH, what that costs a read-only workload. Reading 1059 files under
 * /usr/share/doc dirtied 1059 inodes. Reading the same 1059 again dirtied
 * none. Directories behave identically and are charged separately: listing
 * every subdirectory of /usr/src, /var/cache and /usr/libexec moved 1, 8 and
 * 6 atimes, one per directory, while the 33 subdirectories of
 * /usr/lib/x86_64-linux-gnu, listed once already that hour, moved none.
 *
 * FIFTH, four things stop the update outright. Measured here through the
 * per-inode flag and a read-only mount, which the kernel tests at the same
 * two points it tests the mount-wide options:
 *
 *     chattr +A on the inode   backdated 26 h, read: atime did not move
 *     the flag cleared         same read: atime moved
 *     a read-only mount        /opt/claude-code, ext4, ro,relatime
 *
 * That last one is worth stating plainly. /opt/claude-code/bin/claude had
 * atime equal to mtime and ctime 29 hours newer, so all three relatime rules
 * said update, and reading it moved nothing, because the filesystem is
 * mounted read-only and there is nowhere to put the answer.
 *
 * SIXTH, the operational trap, which is what the surface is really about.
 * atime frozen by noatime does not read as missing. It reads as old. A file
 * with the A flag set, backdated 40 days and then read 200 times in a row,
 * still reported an access time 40.0 days old, and a cleanup rule of "not
 * accessed in 30 days" selects it while it is being read 200 times a minute.
 *
 * strictatime, which is what every mount did before 2009, is deliberately not
 * here. This host could not be remounted to exercise it, and a model that
 * claims to be measured should not carry a branch nobody measured.
 *
 * The same rules apply on tmpfs: on /dev/shm, mounted rw,relatime, a
 * backdated file updated on the next read and did not update on the one after
 * it. This is a decision the VFS makes, not something ext4 does.
 *
 * Not modeled: lazytime, which keeps the update in memory and changes when it
 * reaches the disk rather than whether it happens; the O_NOATIME open flag,
 * which a reader can set for itself; how long the dirty inode sits before
 * writeback; and NFS, where the client and the server each have opinions.
 */

export interface Setup {
  /** The host, so the mount line names something. */
  host: string;
  /** What /proc/mounts prints for this filesystem. */
  mountOption: "relatime" | "noatime" | "nodiratime";
  /** Whether the filesystem is mounted read-only. */
  readOnly: boolean;
  /** What is being read. A directory is read by listing it. */
  target: "file" | "directory";
  /** The per-inode flag chattr sets with +A. Blocks the update on its own. */
  inodeNoatime: boolean;
  /** Seconds since the stored atime. Larger is older. */
  atimeAge: number;
  /** Seconds since the stored mtime. */
  mtimeAge: number;
  /** Seconds since the stored ctime. Never older than mtime on a real inode. */
  ctimeAge: number;
  /** Files a read-only pass walks. */
  filesInPass: number;
  /** How many of those the day rule no longer covers, having been read today. */
  filesFreshInPass: number;
  /** The age a cleanup rule selects on, in days. */
  cleanupDays: number;
}

export type Claim =
  /** Whether this read moves atime. */
  | { about: "updates"; value: boolean }
  /** Which rule let the update through. */
  | { about: "reason"; name: string }
  /** What stopped it, when something did. */
  | { about: "blocked"; name: string }
  /** Inodes a read-only pass dirties. */
  | { about: "dirtied"; value: number }
  /** Whether a cleanup by access age selects the file after this read. */
  | { about: "cleanup"; value: boolean }
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
