/**
 * ZFS pool capacity arithmetic.
 *
 * A pool is a stripe of identical top-level vdevs. Capacity is worked out in
 * the same layers ZFS itself applies, each one a pure function:
 *
 *   raw            every disk, counted once
 *   after parity   the data share of each vdev: one disk for a mirror,
 *                  n - p disks for RAIDZp
 *   after padding  RAIDZ rounds every allocation up (vdev_raidz_asize in
 *                  OpenZFS module/zfs/vdev_raidz.c), so the real share
 *                  depends on block size and ashift. This is an estimate
 *                  that assumes every block is one full record.
 *   slop           spa_get_slop_space() in module/zfs/spa_misc.c: 1/32 of
 *                  the pool, at least 128 MiB (but never more than half),
 *                  at most 128 GiB
 *   usable         what ordinary writes can fill
 *
 * The figures are doubles. A pool is at most 1000 vdevs of 255 disks of
 * 1 PB, about 2.6e20 bytes, where a double still holds 15 significant
 * digits, far more than any figure here is shown with. Sector counts are
 * small integers and are exact.
 *
 * Pure functions only, no React and no DOM.
 */

/* ------------------------------------------------------------------ layouts */

export type Layout = "stripe" | "mirror" | "raidz1" | "raidz2" | "raidz3";

export interface LayoutInfo {
  id: Layout;
  label: string;
  /** Parity sectors per row for RAIDZ, 0 otherwise. */
  nparity: number;
  /** Fewest disks one vdev of this kind may hold. */
  minDisks: number;
  /** Most disks one vdev of this kind may hold here. */
  maxDisks: number;
}

/** Hard cap on disks per vdev. zpool create accepts at most 255 in a RAIDZ vdev. */
export const MAX_DISKS_PER_VDEV = 255;
/** Calculator cap on top-level vdevs. */
export const MAX_VDEVS = 1000;

export const LAYOUTS: LayoutInfo[] = [
  { id: "stripe", label: "Stripe", nparity: 0, minDisks: 1, maxDisks: 1 },
  { id: "mirror", label: "Mirror", nparity: 0, minDisks: 2, maxDisks: MAX_DISKS_PER_VDEV },
  // zpool requires nparity + 1 children for RAIDZ (is_grouping in zpool_vdev.c).
  { id: "raidz1", label: "RAIDZ1", nparity: 1, minDisks: 2, maxDisks: MAX_DISKS_PER_VDEV },
  { id: "raidz2", label: "RAIDZ2", nparity: 2, minDisks: 3, maxDisks: MAX_DISKS_PER_VDEV },
  { id: "raidz3", label: "RAIDZ3", nparity: 3, minDisks: 4, maxDisks: MAX_DISKS_PER_VDEV },
];

export function layoutInfo(id: Layout): LayoutInfo {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

export function isRaidz(id: Layout): boolean {
  return layoutInfo(id).nparity > 0;
}

/** Disks one vdev can lose and keep running. */
export function toleratedFailures(id: Layout, disks: number): number {
  if (id === "stripe") return 0;
  if (id === "mirror") return Math.max(0, disks - 1);
  return layoutInfo(id).nparity;
}

/** Disks' worth of data one vdev stores. */
export function dataDisks(id: Layout, disks: number): number {
  if (id === "stripe" || id === "mirror") return 1;
  return Math.max(0, disks - layoutInfo(id).nparity);
}

/* -------------------------------------------------------------------- units */

export type SizeUnit = "GB" | "TB" | "GiB" | "TiB";

export const SIZE_UNITS: { id: SizeUnit; bytes: number; system: "SI" | "IEC" }[] = [
  { id: "TB", bytes: 1e12, system: "SI" },
  { id: "TiB", bytes: 2 ** 40, system: "IEC" },
  { id: "GB", bytes: 1e9, system: "SI" },
  { id: "GiB", bytes: 2 ** 30, system: "IEC" },
];

export function unitBytes(id: SizeUnit): number {
  return SIZE_UNITS.find((u) => u.id === id)?.bytes ?? 1e12;
}

/** SPA_MINDEVSIZE: ZFS refuses a device smaller than this. */
export const MIN_DEVICE_BYTES = 64 * 2 ** 20;
/** Calculator cap on one disk: 1 PB. */
export const MAX_DISK_BYTES = 1e15;

/** ashift is log2 of the sector size; OpenZFS accepts 9 (512 B) to 16 (64 KiB). */
export const ASHIFTS = [9, 10, 11, 12, 13, 14, 15, 16] as const;
export const DEFAULT_ASHIFT = 12;

/** Record sizes offered, 4 KiB to 16 MiB. Above 128 KiB needs the large_blocks feature. */
export const RECORDSIZES: number[] = Array.from({ length: 13 }, (_, i) => 4096 * 2 ** i);
export const DEFAULT_RECORDSIZE = 128 * 1024;

/** spa_slop_shift, spa_min_slop and spa_max_slop. */
export const SLOP_SHIFT = 5;
export const MIN_SLOP = 128 * 2 ** 20;
export const MAX_SLOP = 128 * 2 ** 30;

/** The fill rule of thumb. */
export const FILL_LINE = 0.8;

/** The block size ZFS's space accounting assumes for RAIDZ (vdev_deflate_ratio). */
export const ACCOUNTING_BLOCK = 1 << 17;

/* ------------------------------------------------------------------ parsing */

export type Parsed<T> =
  | { kind: "ok"; value: T }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

const DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/** One disk's capacity, typed as a plain decimal in the chosen unit. */
export function parseDiskSize(text: string, unit: SizeUnit): Parsed<number> {
  const t = text.trim().replace(/[\s_]/g, "");
  if (t === "") return { kind: "empty", message: "Enter the capacity of one disk." };
  if (t.length > 32) return { kind: "error", message: "That is too long to be a disk size." };
  if (t.includes(",")) {
    return {
      kind: "error",
      message: "Use a period for the decimal point and leave out thousands separators, such as 3.84.",
    };
  }
  if (!DECIMAL.test(t)) {
    return { kind: "error", message: "Type only the number, such as 12 or 3.84, and pick the unit from the list." };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return { kind: "error", message: "That number could not be read." };
  if (n === 0) return { kind: "error", message: "Disk size must be greater than zero." };
  const bytes = Math.round(n * unitBytes(unit));
  if (bytes < MIN_DEVICE_BYTES) {
    return { kind: "error", message: "ZFS will not use a device smaller than 64 MiB (67.1 MB)." };
  }
  if (bytes > MAX_DISK_BYTES) {
    return { kind: "error", message: "This calculator stops at 1,000 TB (909.5 TiB) per disk." };
  }
  return { kind: "ok", value: bytes };
}

/** A whole number in [min, max], with messages that name the field. */
export function parseCount(text: string, min: number, max: number, what: string): Parsed<number> {
  const t = text.trim().replace(/[\s_]/g, "");
  if (t === "") return { kind: "empty", message: `Enter the number of ${what}.` };
  if (!/^\d+$/.test(t)) return { kind: "error", message: `The number of ${what} must be a whole number.` };
  if (t.length > 9) return { kind: "error", message: `Enter at most ${max.toLocaleString("en-US")} ${what}.` };
  const n = Number(t);
  if (n < min) return { kind: "error", message: `Enter at least ${min.toLocaleString("en-US")} ${what}.` };
  if (n > max) return { kind: "error", message: `Enter at most ${max.toLocaleString("en-US")} ${what}.` };
  return { kind: "ok", value: n };
}

/** Disks per vdev, checked against the layout's own limits. */
export function parseDisksPerVdev(text: string, id: Layout): Parsed<number> {
  const info = layoutInfo(id);
  if (id === "stripe") return { kind: "ok", value: 1 };
  const parsed = parseCount(text, 1, MAX_DISKS_PER_VDEV, "disks per vdev");
  if (parsed.kind !== "ok") return parsed;
  if (parsed.value < info.minDisks) {
    return {
      kind: "error",
      message:
        id === "mirror"
          ? "A mirror needs at least 2 disks. One disk on its own is a stripe."
          : `A ${info.label} vdev needs at least ${info.minDisks} disks: ${info.nparity} for parity and 1 for data.`,
    };
  }
  return parsed;
}

/* --------------------------------------------------------------- allocation */

export interface BlockAlloc {
  /** Sectors of data, the block rounded up to whole sectors. */
  data: number;
  /** Redundancy sectors: parity for RAIDZ, the extra copies for a mirror. */
  redundancy: number;
  /** RAIDZ skip sectors added to reach a multiple of nparity + 1. */
  skip: number;
  /** All sectors the block occupies across the vdev. */
  total: number;
  /** Sector size in bytes, 2^ashift. */
  sector: number;
  /** Block bytes over bytes allocated. */
  efficiency: number;
  /** The share with no rounding at all: (n - p) / n, 1 / n, or 1. */
  ideal: number;
}

/**
 * Sectors one block of psize bytes occupies on one vdev.
 *
 * RAIDZ follows vdev_raidz_asize():
 *   asize = ((psize - 1) >> ashift) + 1
 *   asize += nparity * ((asize + cols - nparity - 1) / (cols - nparity))
 *   asize = roundup(asize, nparity + 1) << ashift
 * Mirrors and single disks use vdev_default_asize(), a round up to one
 * sector, written once per copy.
 */
export function blockAlloc(id: Layout, disks: number, ashift: number, psize: number): BlockAlloc {
  const sector = 2 ** ashift;
  const data = Math.floor((Math.max(1, psize) - 1) / sector) + 1;
  const p = layoutInfo(id).nparity;
  if (p > 0) {
    const cols = Math.max(disks, p + 1);
    const parity = p * Math.ceil(data / (cols - p));
    const raw = data + parity;
    const total = Math.ceil(raw / (p + 1)) * (p + 1);
    return {
      data,
      redundancy: parity,
      skip: total - raw,
      total,
      sector,
      efficiency: psize / (total * sector),
      ideal: (cols - p) / cols,
    };
  }
  const copies = id === "mirror" ? Math.max(2, disks) : 1;
  const total = data * copies;
  return {
    data,
    redundancy: total - data,
    skip: 0,
    total,
    sector,
    efficiency: psize / (total * sector),
    ideal: 1 / copies,
  };
}

/**
 * vdev_deflate_ratio: how ZFS converts a vdev's raw size into the space
 * zfs list reports, computed once from a 128 KiB block whatever the
 * recordsize, and kept as an integer over 512 (SPA_MINBLOCKSHIFT).
 */
export function deflateRatio(id: Layout, disks: number, ashift: number): number {
  const sector = 2 ** ashift;
  const asize = isRaidz(id)
    ? blockAlloc(id, disks, ashift, ACCOUNTING_BLOCK).total * sector
    : Math.ceil(ACCOUNTING_BLOCK / sector) * sector;
  return Math.floor(ACCOUNTING_BLOCK / (asize / 512));
}

/** spa_get_slop_space(), ignoring the embedded log class. */
export function slopSpace(space: number): number {
  if (!(space > 0)) return 0;
  let slop = Math.min(Math.floor(space / 2 ** SLOP_SHIFT), MAX_SLOP);
  slop = Math.max(slop, Math.min(Math.floor(space / 2), MIN_SLOP));
  return slop;
}

/* --------------------------------------------------------------------- pool */

export interface PoolInput {
  layout: Layout;
  vdevs: number;
  disksPerVdev: number;
  diskBytes: number;
  ashift: number;
  recordsize: number;
}

export interface PoolResult {
  totalDisks: number;
  raw: number;
  redundancy: number;
  afterParity: number;
  padding: number;
  afterPadding: number;
  slop: number;
  usable: number;
  fillLine: number;
  /** True when slop leaves less than the 80 percent line, on very small pools. */
  slopBeyondFillLine: boolean;
  alloc: BlockAlloc;
  /** vdev_deflate_ratio, out of 512. */
  deflate: number;
  /** What zpool list shows as SIZE: every vdev's own size, parity included for RAIDZ. */
  zpoolSize: number;
  /** About what zfs list shows as AVAIL on an empty pool. */
  zfsAvail: number;
  perVdevTolerance: number;
  /** Failures the pool survives wherever they land. */
  guaranteed: number;
  /** Failures the pool survives if they are spread across vdevs as evenly as possible. */
  bestCase: number;
}

export function poolCapacity(input: PoolInput): PoolResult {
  const { layout, vdevs, diskBytes, ashift, recordsize } = input;
  const disks = layout === "stripe" ? 1 : input.disksPerVdev;
  const totalDisks = vdevs * disks;
  const raw = totalDisks * diskBytes;
  const afterParity = vdevs * dataDisks(layout, disks) * diskBytes;
  const alloc = blockAlloc(layout, disks, ashift, recordsize);
  // Per vdev the data share is raw times the block's efficiency, so the
  // pool's is too. Never above afterParity: parity is a ceiling of d/(n-p).
  const afterPadding = Math.min(afterParity, raw * alloc.efficiency);
  const slop = slopSpace(afterPadding);
  const usable = Math.max(0, afterPadding - slop);
  const fillLine = afterPadding * FILL_LINE;

  const deflate = deflateRatio(layout, disks, ashift);
  const vdevSize = isRaidz(layout) ? disks * diskBytes : diskBytes;
  const zpoolSize = vdevs * vdevSize;
  // vdev_deflated_space(): (space >> SPA_MINBLOCKSHIFT) * vdev_deflate_ratio
  const deflated = vdevs * Math.floor(vdevSize / 512) * deflate;
  const zfsAvail = Math.max(0, deflated - slopSpace(deflated));

  const perVdevTolerance = toleratedFailures(layout, disks);
  return {
    totalDisks,
    raw,
    redundancy: raw - afterParity,
    afterParity,
    padding: afterParity - afterPadding,
    afterPadding,
    slop,
    usable,
    fillLine,
    slopBeyondFillLine: usable < fillLine,
    alloc,
    deflate,
    zpoolSize,
    zfsAvail,
    perVdevTolerance,
    guaranteed: perVdevTolerance,
    bestCase: perVdevTolerance * vdevs,
  };
}

/** Warnings worth saying about a layout, plain sentences. */
export function layoutWarnings(input: PoolInput): string[] {
  const { layout, vdevs, diskBytes, ashift, recordsize } = input;
  const disks = layout === "stripe" ? 1 : input.disksPerVdev;
  const info = layoutInfo(layout);
  const out: string[] = [];
  if (layout === "stripe") {
    out.push(
      vdevs === 1
        ? "A single disk has no redundancy. ZFS will detect corruption but cannot repair it, and losing the disk loses the pool."
        : `A stripe has no redundancy. Any one of the ${vdevs.toLocaleString("en-US")} disks failing loses every file in the pool.`,
    );
  }
  if (info.nparity > 0 && disks === info.nparity + 1) {
    out.push(
      `A ${disks}-disk ${info.label} stores one disk's worth and survives ${info.nparity} ${info.nparity === 1 ? "failure" : "failures"}, the same as a ${disks}-way mirror. The mirror can serve each read from any copy, so it handles random reads better.`,
    );
  }
  if (layout === "raidz1" && diskBytes >= 4e12) {
    out.push(
      "With single parity, a second disk failure during a resilver loses the pool, and an unreadable sector on a surviving disk damages the files that use it. Resilvering a large disk can take a day or more.",
    );
  }
  if (ashift === 9) {
    out.push(
      "ashift=9 suits only disks with true 512-byte physical sectors. Nearly every current disk has 4 KiB physical sectors, and on those it forces a read-modify-write inside the drive for small writes.",
    );
  }
  if (recordsize < 2 ** ashift) {
    out.push(
      `The record size is smaller than one ${formatBinarySize(2 ** ashift)} sector, so every block still occupies a whole sector.`,
    );
  }
  return out;
}

/* --------------------------------------------------------------- formatting */

const SI = ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB"];
const IEC = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB"];

function scaled(bytes: number, base: number, names: string[]): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${names[0]}`;
  let i = 0;
  let v = bytes;
  while (i < names.length - 1 && v >= base * 0.99995) {
    v /= base;
    i += 1;
  }
  if (i === 0) return `${Math.round(v).toLocaleString("en-US")} B`;
  const digits = v >= 100 ? 1 : 2;
  return `${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${names[i]}`;
}

/** Decimal prefixes, powers of 1000, as drive labels use. */
export function formatSI(bytes: number): string {
  return scaled(bytes, 1000, SI);
}

/** Binary prefixes, powers of 1024, as zpool and zfs print them. */
export function formatIEC(bytes: number): string {
  return scaled(bytes, 1024, IEC);
}

/** Exact binary size for powers of two, such as 128 KiB or 16 MiB. */
export function formatBinarySize(bytes: number): string {
  for (let i = IEC.length - 1; i > 0; i -= 1) {
    const unit = 1024 ** i;
    if (bytes >= unit && bytes % unit === 0) return `${bytes / unit} ${IEC[i]}`;
  }
  return `${bytes} B`;
}

/**
 * A byte count the way zpool list and zfs list print it, after
 * zfs_nicenum_format() in OpenZFS lib/libzfs/libzfs_util.c: binary units
 * with a bare suffix (T means TiB), and the most decimals, from 2 down to
 * 0, that keep the whole string within 5 characters.
 */
export function zfsNicenum(num: number): string {
  const units = ["", "K", "M", "G", "T", "P", "E"];
  if (!Number.isFinite(num) || num < 0) return "0";
  const whole = Math.floor(num);
  let n = whole;
  let index = 0;
  while (n >= 1024 && index < units.length - 1) {
    n = Math.floor(n / 1024);
    index += 1;
  }
  const u = units[index];
  const base = 1024 ** index;
  if (index === 0 || whole % base === 0) return `${Math.floor(whole / base)}${u}`;
  let text = "";
  for (let digits = 2; digits >= 0; digits -= 1) {
    text = `${(whole / base).toFixed(digits)}${u}`;
    if (text.length <= 5) break;
  }
  return text;
}

export function formatPercent(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "0%";
  return `${(fraction * 100).toFixed(digits)}%`;
}
