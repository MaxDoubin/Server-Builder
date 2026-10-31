/**
 * Storage IOPS arithmetic.
 *
 * The model is the usual one for small random I/O against a RAID set:
 *
 *   - every disk delivers the same number of random operations per second,
 *     so the array's raw (back-end) IOPS is that figure times the disk count;
 *   - a front-end read costs one disk operation at every RAID level;
 *   - a front-end write costs P disk operations, the RAID write penalty:
 *     1 for RAID 0, 2 for a mirror, 4 for RAID 5 (read old data and parity,
 *     write new data and parity), 6 for RAID 6 (the same with two parities).
 *
 * At read fraction r and write fraction w = 1 - r, each front-end request
 * costs r + wP disk operations on average, so an array with raw IOPS R
 * delivers R / (r + wP) front-end IOPS. The widely quoted shortcut,
 * R * r + R * w / P, is computed too, because readers will meet it; it
 * splits disk time rather than requests by the mix and so overstates any
 * mixed workload. Both agree at 100 percent reads or writes.
 *
 * Percentages are carried as percentages (0 to 100) so that common mixes
 * such as 70/30 stay exact integers through the arithmetic.
 *
 * Pure functions only, no React and no DOM.
 */

/* ---------------------------------------------------------------- RAID sets */

export type RaidLevel = "raid0" | "raid1" | "raid10" | "raid5" | "raid6";

export interface RaidInfo {
  id: RaidLevel;
  label: string;
  /** Disk operations per front-end write. */
  penalty: number;
  /** Of those, how many are reads of old data or parity. */
  diskReads: number;
  /** And how many are writes. */
  diskWrites: number;
  minDisks: number;
  /** What one small random write turns into on the disks. */
  writeSteps: string;
}

export const RAID_LEVELS: RaidInfo[] = [
  {
    id: "raid0",
    label: "RAID 0",
    penalty: 1,
    diskReads: 0,
    diskWrites: 1,
    minDisks: 1,
    writeSteps: "write the block once, to the one disk that holds it",
  },
  {
    id: "raid1",
    label: "RAID 1",
    penalty: 2,
    diskReads: 0,
    diskWrites: 2,
    minDisks: 2,
    writeSteps: "write the block to both disks of the pair",
  },
  {
    id: "raid10",
    label: "RAID 10",
    penalty: 2,
    diskReads: 0,
    diskWrites: 2,
    minDisks: 4,
    writeSteps: "write the block to both disks of its mirror",
  },
  {
    id: "raid5",
    label: "RAID 5",
    penalty: 4,
    diskReads: 2,
    diskWrites: 2,
    minDisks: 3,
    writeSteps: "read the old data and old parity, then write the new data and new parity",
  },
  {
    id: "raid6",
    label: "RAID 6",
    penalty: 6,
    diskReads: 3,
    diskWrites: 3,
    minDisks: 4,
    writeSteps: "read the old data and both old parity blocks, then write the new data and both new parity blocks",
  },
];

export function raidInfo(id: RaidLevel): RaidInfo {
  return RAID_LEVELS.find((r) => r.id === id) ?? RAID_LEVELS[0];
}

/** Why a disk count does not fit a RAID level, or null when it does. */
export function diskCountProblem(id: RaidLevel, disks: number): string | null {
  const info = raidInfo(id);
  if (id === "raid1" && disks !== 2) {
    return disks > 2
      ? "RAID 1 is a pair of disks. For four or more, choose RAID 10."
      : "RAID 1 needs exactly 2 disks.";
  }
  if (disks < info.minDisks) {
    return `${info.label} needs at least ${info.minDisks} ${info.minDisks === 1 ? "disk" : "disks"}.`;
  }
  if (id === "raid10" && disks % 2 !== 0) {
    return "RAID 10 is a stripe of mirrored pairs, so it needs an even number of disks.";
  }
  return null;
}

/** The smallest disk count at or above n that the level accepts, or null if none does. */
export function roundUpForLevel(id: RaidLevel, n: number): number | null {
  const info = raidInfo(id);
  let disks = Math.max(info.minDisks, n);
  if (id === "raid1") return disks <= 2 ? 2 : null;
  if (id === "raid10" && disks % 2 !== 0) disks += 1;
  return disks;
}

/* ------------------------------------------------------------- disk presets */

export interface DiskPreset {
  id: string;
  label: string;
  /** Random small-block IOPS per disk. */
  iops: number;
  note: string;
  /** True for the solid-state figures, which vary far more between models. */
  typical: boolean;
}

export const DISK_PRESETS: DiskPreset[] = [
  {
    id: "hdd-7k2",
    label: "7.2k rpm SATA",
    iops: 80,
    note: "Nearline hard disk: about 8.5 ms seek plus 4.17 ms average rotational wait.",
    typical: false,
  },
  {
    id: "hdd-10k",
    label: "10k rpm SAS",
    iops: 140,
    note: "Enterprise hard disk: about 4 ms seek plus 3 ms rotational wait.",
    typical: false,
  },
  {
    id: "hdd-15k",
    label: "15k rpm SAS",
    iops: 180,
    note: "The fastest common spindle speed: about 3.5 ms seek plus 2 ms rotational wait.",
    typical: false,
  },
  {
    id: "ssd-sata",
    label: "SATA SSD",
    iops: 20000,
    note: "Typical steady-state mixed 4 KiB figure, deliberately conservative. Datasheet peaks are several times higher.",
    typical: true,
  },
  {
    id: "ssd-nvme",
    label: "NVMe SSD",
    iops: 100000,
    note: "Typical steady-state mixed 4 KiB figure, deliberately conservative. Datasheet read peaks run to the hundreds of thousands.",
    typical: true,
  },
];

/** Read percentages offered as one-click mixes. */
export const MIX_PRESETS: number[] = [100, 90, 70, 50, 30, 0];

/** Block sizes for the throughput line, in bytes. */
export const BLOCK_SIZES: number[] = [4096, 8192, 16384, 32768, 65536];

/* ------------------------------------------------------------------- limits */

export const MAX_DISK_IOPS = 10_000_000;
export const MAX_DISKS = 100_000;
export const MAX_TARGET_IOPS = 1_000_000_000;
export const MIN_SEEK_MS = 0.1;
export const MAX_SEEK_MS = 50;

/* ------------------------------------------------------------------ parsing */

export type Parsed<T> =
  | { kind: "ok"; value: T }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

const DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

function parseDecimal(text: string, what: string, example: string): Parsed<number> {
  // Thousands separators are common when typing IOPS figures, so commas
  // between digit groups are accepted. A comma anywhere else is refused.
  const t = text.trim().replace(/[\s_]/g, "");
  if (t === "") return { kind: "empty", message: `Enter ${what}.` };
  if (t.length > 24) return { kind: "error", message: `That is too long to be ${what}.` };
  let plain = t;
  if (t.includes(",")) {
    if (!/^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/.test(t)) {
      return {
        kind: "error",
        message: "Use commas only between groups of three digits, and a period for decimals.",
      };
    }
    plain = t.replace(/,/g, "");
  }
  if (!DECIMAL.test(plain)) return { kind: "error", message: `Type a plain number for ${what}, such as ${example}.` };
  const n = Number(plain);
  if (!Number.isFinite(n)) return { kind: "error", message: "That number could not be read." };
  return { kind: "ok", value: n };
}

export function parseDiskIops(text: string): Parsed<number> {
  const p = parseDecimal(text, "the IOPS of one disk", "180");
  if (p.kind !== "ok") return p;
  if (p.value <= 0) return { kind: "error", message: "Per-disk IOPS must be greater than zero." };
  if (p.value > MAX_DISK_IOPS) {
    return { kind: "error", message: `Enter at most ${MAX_DISK_IOPS.toLocaleString("en-US")} IOPS per disk.` };
  }
  return p;
}

export function parseDiskCount(text: string): Parsed<number> {
  const t = text.trim().replace(/[\s_,]/g, "");
  if (t === "") return { kind: "empty", message: "Enter the number of disks." };
  if (!/^\d+$/.test(t)) return { kind: "error", message: "The number of disks must be a whole number." };
  if (t.length > 7 || Number(t) > MAX_DISKS) {
    return { kind: "error", message: `Enter at most ${MAX_DISKS.toLocaleString("en-US")} disks.` };
  }
  const n = Number(t);
  if (n < 1) return { kind: "error", message: "Enter at least 1 disk." };
  return { kind: "ok", value: n };
}

export function parseReadPercent(text: string): Parsed<number> {
  const t = text.trim().replace(/%$/, "");
  const p = parseDecimal(t, "the read percentage", "70");
  if (p.kind !== "ok") return p;
  if (p.value > 100) return { kind: "error", message: "The read share is a percentage from 0 to 100." };
  return p;
}

export function parseTargetIops(text: string): Parsed<number> {
  const p = parseDecimal(text, "the front-end IOPS you need", "5,000");
  if (p.kind !== "ok") return p;
  if (p.value <= 0) return { kind: "error", message: "The target must be greater than zero." };
  if (p.value > MAX_TARGET_IOPS) {
    return { kind: "error", message: `Enter a target of at most ${MAX_TARGET_IOPS.toLocaleString("en-US")} IOPS.` };
  }
  return p;
}

export function parseSeekMs(text: string): Parsed<number> {
  const p = parseDecimal(text, "the average seek time", "8.5");
  if (p.kind !== "ok") return p;
  if (p.value < MIN_SEEK_MS || p.value > MAX_SEEK_MS) {
    return { kind: "error", message: `Enter a seek time from ${MIN_SEEK_MS} to ${MAX_SEEK_MS} ms.` };
  }
  return p;
}

/* -------------------------------------------------------------- arithmetic */

/** Disk operations per front-end request, times 100: readPct + writePct * P. */
function costPer100(readPct: number, penalty: number): number {
  return readPct + (100 - readPct) * penalty;
}

/** Front-end IOPS the array sustains at the mix: R / (r + wP). */
export function frontEndIops(rawIops: number, readPct: number, penalty: number): number {
  return (rawIops * 100) / costPer100(readPct, penalty);
}

/** The widely quoted shortcut: R * r + R * w / P. Overstates mixed workloads. */
export function shortcutIops(rawIops: number, readPct: number, penalty: number): number {
  return (rawIops * readPct) / 100 + (rawIops * (100 - readPct)) / 100 / penalty;
}

/** Back-end disk operations per second needed to serve a front-end rate at the mix. */
export function backendIops(front: number, readPct: number, penalty: number): number {
  return (front * costPer100(readPct, penalty)) / 100;
}

/** Ceiling that ignores the last few bits of floating point noise, so 20.000000000000004 is 20. */
export function ceilSafe(x: number): number {
  return Math.ceil(x - Math.max(1, Math.abs(x)) * 1e-12);
}

export interface Breakdown {
  front: number;
  frontReads: number;
  frontWrites: number;
  /** Disk reads: the front-end reads plus parity and data reads for writes. */
  diskReads: number;
  /** Disk writes: every front-end write times the level's disk writes. */
  diskWrites: number;
}

/** Where the raw IOPS go at the sustained front-end rate. */
export function breakdown(rawIops: number, readPct: number, level: RaidLevel): Breakdown {
  const info = raidInfo(level);
  const front = frontEndIops(rawIops, readPct, info.penalty);
  const frontReads = (front * readPct) / 100;
  const frontWrites = front - frontReads;
  return {
    front,
    frontReads,
    frontWrites,
    diskReads: frontReads + frontWrites * info.diskReads,
    diskWrites: frontWrites * info.diskWrites,
  };
}

export interface Sizing {
  /** Back-end IOPS the target needs. */
  backend: number;
  /** Disks the IOPS alone call for. */
  byIops: number;
  /** Disks after the level's own rules (minimum count, even count), or null if the level cannot reach it. */
  disks: number | null;
  /** Front-end IOPS those disks deliver. */
  delivers: number | null;
  /** Why the count was raised above byIops, if it was. */
  note: string | null;
}

/** How many disks of perDisk IOPS a target front-end rate needs at the mix and level. */
export function disksForTarget(target: number, readPct: number, level: RaidLevel, perDisk: number): Sizing {
  const info = raidInfo(level);
  const backend = backendIops(target, readPct, info.penalty);
  const byIops = Math.max(1, ceilSafe(backend / perDisk));
  const disks = roundUpForLevel(level, byIops);
  let note: string | null = null;
  if (disks === null) {
    note = `That needs ${byIops.toLocaleString("en-US")} disks, more than the two RAID 1 holds. RAID 10 spreads the same mirroring across more pairs.`;
  } else if (disks > byIops) {
    note =
      level === "raid10" && byIops >= info.minDisks
        ? `Raised from ${byIops.toLocaleString("en-US")} to the next even count, because RAID 10 is built from pairs.`
        : `Raised from ${byIops.toLocaleString("en-US")} to ${info.label}'s minimum of ${disks}.`;
  }
  return {
    backend,
    byIops,
    disks,
    delivers: disks === null ? null : frontEndIops(disks * perDisk, readPct, info.penalty),
    note,
  };
}

/**
 * Random IOPS of a hard disk from its mechanics: one average seek plus half
 * a revolution of rotational latency per operation. Transfer time for a
 * small block is a fraction of a millisecond and is left out.
 */
export function hddIops(rpm: number, seekMs: number): number {
  const halfTurnMs = 30000 / rpm;
  return 1000 / (seekMs + halfTurnMs);
}

export function rotationalLatencyMs(rpm: number): number {
  return 30000 / rpm;
}

/* --------------------------------------------------------------- formatting */

/** IOPS with sensible precision: whole numbers from 100 up, a decimal or two below. */
export function formatIops(n: number): string {
  if (!Number.isFinite(n)) return "--";
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** Bytes per second with an SI and an IEC reading. */
export function formatRate(bytesPerSecond: number): { si: string; iec: string } {
  const pick = (base: number, names: string[]) => {
    let v = bytesPerSecond;
    let i = 0;
    while (i < names.length - 1 && v >= base * 0.99995) {
      v /= base;
      i += 1;
    }
    const digits = v >= 100 ? 1 : 2;
    return `${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${names[i]}`;
  };
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return { si: "0 B/s", iec: "0 B/s" };
  return {
    si: pick(1000, ["B/s", "kB/s", "MB/s", "GB/s", "TB/s", "PB/s"]),
    iec: pick(1024, ["B/s", "KiB/s", "MiB/s", "GiB/s", "TiB/s", "PiB/s"]),
  };
}

export function formatBlock(bytes: number): string {
  return bytes >= 1024 && bytes % 1024 === 0 ? `${bytes / 1024} KiB` : `${bytes} B`;
}
