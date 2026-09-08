/**
 * What `df`, `df -i` and `du` each report, and why they disagree.
 *
 * Everything here is derived from the filesystem state. No case declares its
 * own cause: the model works out whether a write succeeds and, if not, which
 * of the six things stopped it, and the correct option is whichever names
 * that. So a case whose prose says "inodes" while its numbers say "reserve"
 * cannot pass CI.
 *
 * The order the kernel checks in matters, and it is the order below. A
 * filesystem can be out of inodes AND out of blocks, and the write fails for
 * whichever the kernel notices first, which is what somebody reading the
 * error is being told.
 */

import type { Case, Cause, Filesystem, Write } from "./types";

/* ------------------------------------------------------- what df reports */

/**
 * Blocks `df` counts as used.
 *
 * All three kinds, because all three are allocated on this filesystem: files
 * with a name, files whose name has been removed while a process still holds
 * them open, and files under a directory that something is now mounted over.
 * The last two are invisible to anything that walks names, which is the
 * entire subject of this surface.
 */
export const dfUsed = (fs: Filesystem): number =>
  fs.namedBlocks + fs.unlinkedBlocks + fs.shadowedBlocks;

/** Blocks held back for root. */
export const reserved = (fs: Filesystem): number =>
  Math.floor(fs.totalBlocks * fs.reservedFraction);

/**
 * What `df` prints in its Available column.
 *
 * The number that confuses everybody: total minus used minus the reserve, so
 * Used plus Available does not equal Size, and the percentage is computed
 * against the non-reserved total. A filesystem showing 100% still has the
 * reserve, which is why root can write to a full disk and a service cannot.
 */
export const dfAvailable = (fs: Filesystem): number =>
  Math.max(0, fs.totalBlocks - dfUsed(fs) - reserved(fs));

/** The percentage `df` prints, which is against the usable total. */
export function dfPercent(fs: Filesystem): number {
  const usable = fs.totalBlocks - reserved(fs);
  if (usable <= 0) return 100;
  return Math.min(100, Math.round((dfUsed(fs) / usable) * 100));
}

/**
 * What `du -x` reports for the mount point.
 *
 * Only what it can walk to: named files on this filesystem. Not the unlinked
 * blocks, which have no name to walk to, and not the shadowed blocks, which
 * are behind another mount. So `df` minus `du` is the invisible remainder,
 * and it is the first number worth computing.
 */
export const duTotal = (fs: Filesystem): number => fs.namedBlocks;

/** The blocks df counts and du cannot reach. */
export const invisible = (fs: Filesystem): number => fs.unlinkedBlocks + fs.shadowedBlocks;

/** What `df -i` reports as the inode percentage. */
export function inodePercent(fs: Filesystem): number {
  if (fs.totalInodes <= 0) return 100;
  return Math.min(100, Math.round((fs.usedInodes / fs.totalInodes) * 100));
}

/* --------------------------------------------------- can the write happen */

/** Blocks available to a given user, which is not what df prints. */
export function availableTo(fs: Filesystem, user: string): number {
  const free = fs.totalBlocks - dfUsed(fs);
  const headroom = user === "root" ? free : free - reserved(fs);
  const quota = fs.quotas.find((q) => q.user === user);
  const byQuota = quota ? quota.limitBlocks - quota.usedBlocks : Infinity;
  return Math.max(0, Math.min(headroom, byQuota));
}

/**
 * Why a write fails, or null when it succeeds.
 *
 * Checked in the order the kernel would notice, and the order is load
 * bearing: inodes first, because a filesystem with no inodes left refuses a
 * new file however much room it has, and a reader who sees ENOSPC on a disk
 * showing 34% is being told exactly that.
 *
 * A shadowed mount is not a kernel check at all. It is the case where the
 * numbers all look fine and the write still fails, because the bytes filling
 * the disk are under a mount point and the disk in question is the one
 * underneath. It is placed last for that reason: only reachable once
 * everything measurable has been ruled out.
 */
export function failure(fs: Filesystem, write: Write): Cause | null {
  if (write.files > 0 && fs.usedInodes + write.files > fs.totalInodes) return "inodes";

  const free = fs.totalBlocks - dfUsed(fs);
  const quota = fs.quotas.find((q) => q.user === write.user);
  if (quota && quota.usedBlocks + write.blocks > quota.limitBlocks) return "quota";

  if (write.blocks > free) {
    /*
      Out of blocks, and there are three ways to be. Where the bytes went
      decides which, and `df` minus `du` only narrows it to two of them: the
      remainder is invisible either because the names are gone or because the
      names are behind a mount, and no amount of tidying the tree helps in
      either case. Separating those two takes a third observation, which is
      what candidates() below is about.
    */
    if (invisible(fs) <= fs.namedBlocks) return "blocks";
    return fs.unlinkedBlocks >= fs.shadowedBlocks ? "unlinked" : "shadowed";
  }

  /*
    Room in the filesystem, but not for this user: the reserve. Root writes,
    the service does not, and `df` says 100% to both of them.

    The `write.blocks > 0` guard is not decoration. Once the filesystem is
    inside its reserve, `free - reserved` is negative, and a write of nothing
    is greater than a negative number, so a zero block write was being
    refused for want of space. Found by a property comparing this against
    availableTo(), which clamps at zero and therefore disagreed.
  */
  if (write.user !== "root" && write.blocks > 0 && write.blocks > free - reserved(fs)) {
    return "reserve";
  }

  return null;
}

/**
 * What `df` and `du` alone leave open.
 *
 * The honest answer, and the reason the surface is worth building: two
 * numbers narrow six causes to one in four cases and to two in the others,
 * because unlinked blocks and shadowed blocks look identical from outside.
 * The command that separates them is named here rather than in prose,
 * because it is the thing to remember.
 */
export function candidates(fs: Filesystem, write: Write): { causes: Cause[]; separator: string } {
  const cause = failure(fs, write);
  if (cause === "unlinked" || cause === "shadowed") {
    return {
      causes: ["unlinked", "shadowed"],
      separator:
        "lsof +L1 lists files with no name; if it finds nothing, bind mount the filesystem root elsewhere and walk underneath the mount point",
    };
  }
  return { causes: cause ? [cause] : [], separator: "" };
}

/** The errno a caller actually gets, which collapses five of the six. */
export const errnoFor = (cause: Cause): string => (cause === "quota" ? "EDQUOT" : "ENOSPC");

/** Blocks as a person would say them, from `df`'s 1K units. */
export function human(blocks: number): string {
  const units: [number, string][] = [
    [1024 ** 3, "T"],
    [1024 ** 2, "G"],
    [1024, "M"],
  ];
  for (const [size, suffix] of units) {
    if (blocks >= size) return `${Number((blocks / size).toFixed(1))}${suffix}`;
  }
  return `${blocks}K`;
}

/**
 * The two numbers that give the cause away.
 *
 * Written as the comparison a person would make at a prompt, because the
 * point of the surface is the habit rather than the taxonomy.
 */
export function tell(fs: Filesystem, write: Write, cause: Cause): string {
  switch (cause) {
    case "unlinked":
      return `df counts ${human(dfUsed(fs))} used and du can only find ${human(duTotal(fs))}, a gap of ${human(invisible(fs))}`;
    case "inodes":
      return `df says ${dfPercent(fs)}% of the space is used and df -i says ${inodePercent(fs)}% of the inodes are`;
    case "reserve":
      return `df says ${dfPercent(fs)}% and ${human(reserved(fs))} is still held back for root, which ${write.user} is not`;
    case "quota": {
      const quota = fs.quotas.find((q) => q.user === write.user);
      return quota
        ? `df says ${dfPercent(fs)}% and ${write.user} is at ${human(quota.usedBlocks)} of a ${human(quota.limitBlocks)} quota`
        : `df says ${dfPercent(fs)}% and the limit is not on the filesystem`;
    }
    case "shadowed":
      return `df counts ${human(dfUsed(fs))} used and du can only find ${human(duTotal(fs))}, and lsof +L1 finds nothing holding the difference`;
    case "blocks":
    default:
      return `df counts ${human(dfUsed(fs))} used and du finds ${human(duTotal(fs))}, which agree`;
  }
}

/**
 * The option that is right, found rather than declared.
 *
 * The same rule as everywhere else on this site: the data carries the state,
 * the model carries the reading, and CI requires exactly one option to match.
 */
export const correctOption = (item: Case) => {
  const cause = failure(item.filesystem, item.write);
  if (!cause) return undefined;
  return item.options.find((option) => option.cause === cause);
};

export const CAUSE_LABEL: Record<Cause, string> = {
  blocks: "out of blocks",
  unlinked: "a deleted file still open",
  inodes: "out of inodes",
  reserve: "the reserved blocks",
  quota: "a user quota",
  shadowed: "a mount shadowing data",
};
