/**
 * One error message, six filesystems, six different things to do about it.
 *
 *     write: No space left on device
 *
 * The instinct is to look at `df`, and `df` is the tool most likely to lie to
 * you here, because it answers a different question from the one you asked.
 * It reports blocks accounted to the filesystem. It does not report what a
 * given user may consume, or what a directory tree contains, or what is still
 * allocated to a file with no name.
 *
 * So the diagnosis is never a number. It is a disagreement between two
 * numbers, and each of the six causes here produces a different pair:
 *
 *   df full and du agrees                a file that is genuinely too big
 *   df full and du much smaller          bytes held by an unlinked open file
 *   df not full and df -i full           out of inodes, with space to spare
 *   df full for one user and not root    the reserved blocks, doing their job
 *   df fine and one user cannot write    a quota, which df knows nothing about
 *   df fine and du fine and it still     a mount shadowing a directory that
 *     will not write                       already had bytes in it
 *
 * Two of those are not really "the disk is full" at all, and one of them is
 * the filesystem working exactly as designed. Which is the point: the message
 * is a statement about one write, not about the disk.
 */

/** A per-user limit the kernel enforces, which `df` cannot see. */
export interface Quota {
  user: string;
  /** Blocks this user may consume, and what they consume now. */
  limitBlocks: number;
  usedBlocks: number;
}

/**
 * The state of a filesystem, in the terms the kernel actually holds.
 *
 * Deliberately not "cause: inodes". The cause is derived from this, so a
 * filesystem that claims one fault and describes another fails CI rather
 * than teaching the wrong reading.
 */
export interface Filesystem {
  mount: string;
  /** Blocks, in the 1K units `df` reports by default. */
  totalBlocks: number;
  /**
   * Blocks accounted to files that still have a name.
   *
   * This is what `du` walks and finds. It is not what `df` reports, and the
   * gap between them is the whole subject of two of these cases.
   */
  namedBlocks: number;
  /**
   * Blocks still allocated to files that have been unlinked but are held
   * open by a running process.
   *
   * `df` counts these. `du` cannot see them, because they have no name to
   * walk to. Deleting the logs and not restarting the process is how this
   * happens, every time.
   */
  unlinkedBlocks: number;
  /**
   * Blocks under this mount point that belong to a filesystem mounted over
   * them, so nothing can reach them.
   *
   * They are not on this filesystem at all: they are on whatever was mounted
   * underneath, and they are why a directory can be measured at nothing and
   * a disk still be full of it.
   */
  shadowedBlocks: number;
  /** The fraction held back for root, which ext4 sets to 5% by default. */
  reservedFraction: number;
  totalInodes: number;
  usedInodes: number;
  quotas: Quota[];
}

/** Somebody, or something, trying to write. */
export interface Write {
  /** Who the process runs as. Root is not subject to the reserve. */
  user: string;
  /** How many blocks the write needs. */
  blocks: number;
  /** How many new files it creates, which is what consumes inodes. */
  files: number;
  /** What is doing it, for the prose. */
  what: string;
}

/**
 * Why a write failed.
 *
 * Two distinct errnos and six distinct causes, because ENOSPC covers five of
 * them and EDQUOT is its own. A tool that prints strerror() collapses the
 * five, which is why the message is the same and the fix is not.
 */
export type Cause =
  | "blocks"
  | "unlinked"
  | "inodes"
  | "reserve"
  | "quota"
  | "shadowed";

export interface Option {
  id: string;
  claim: string;
  /** The cause this option names. Exactly one has to be the derived one. */
  cause: Cause;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  filesystem: Filesystem;
  write: Write;
  question: string;
  options: Option[];
  why: string;
  /** The fix, which differs for all six. */
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
