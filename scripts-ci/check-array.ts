/**
 * The array arithmetic, against values worked out by hand.
 *
 * This one is all maths, so the check is a table. The URE probabilities are
 * the part worth guarding: the textbook form of that expression silently
 * returns zero for small rates because of float64, and the failure is
 * invisible in the output, which reads as a very reassuring number rather
 * than as an error.
 */

import { analyse, formatDuration, parityDisksFor, tbToTib, toleranceFor } from "../client/src/lib/array/analyse";
import { MIN_DISKS, type Level } from "../client/src/lib/array/types";
import { CONFIGS } from "../client/src/lib/array/data/configs";

const problems: string[] = [];
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/* Capacity, tolerance and efficiency. */
interface Row {
  level: Level;
  disks: number;
  diskTb: number;
  usableTb: number;
  tolerance: number;
  parity: number;
}
const ROWS: Row[] = [
  { level: "raid0", disks: 4, diskTb: 4, usableTb: 16, tolerance: 0, parity: 0 },
  { level: "raid1", disks: 2, diskTb: 4, usableTb: 4, tolerance: 1, parity: 1 },
  { level: "raid1", disks: 3, diskTb: 4, usableTb: 4, tolerance: 2, parity: 2 },
  { level: "raid5", disks: 4, diskTb: 4, usableTb: 12, tolerance: 1, parity: 1 },
  { level: "raid5", disks: 8, diskTb: 16, usableTb: 112, tolerance: 1, parity: 1 },
  { level: "raid6", disks: 8, diskTb: 16, usableTb: 96, tolerance: 2, parity: 2 },
  { level: "raid10", disks: 8, diskTb: 16, usableTb: 64, tolerance: 1, parity: 4 },
  { level: "raid10", disks: 4, diskTb: 8, usableTb: 16, tolerance: 1, parity: 2 },
  { level: "raidz1", disks: 5, diskTb: 8, usableTb: 32, tolerance: 1, parity: 1 },
  { level: "raidz2", disks: 12, diskTb: 20, usableTb: 200, tolerance: 2, parity: 2 },
  { level: "raidz3", disks: 12, diskTb: 20, usableTb: 180, tolerance: 3, parity: 3 },
];
for (const row of ROWS) {
  const a = analyse({ ...row, rebuildMbs: 100, ureExponent: 14 });
  if (!near(a.usableTb, row.usableTb, 0.001)) {
    problems.push(`${row.level} ${row.disks}x${row.diskTb}TB usable should be ${row.usableTb}, got ${a.usableTb}`);
  }
  if (a.tolerance !== row.tolerance) {
    problems.push(`${row.level} ${row.disks} disks tolerance should be ${row.tolerance}, got ${a.tolerance}`);
  }
  if (a.parityDisks !== row.parity) {
    problems.push(`${row.level} ${row.disks} disks parity should be ${row.parity}, got ${a.parityDisks}`);
  }
  if (parityDisksFor(row.level, row.disks) !== a.parityDisks) {
    problems.push(`${row.level}: parityDisksFor disagrees with analyse`);
  }
  if (toleranceFor(row.level, row.disks) !== a.tolerance) {
    problems.push(`${row.level}: toleranceFor disagrees with analyse`);
  }
}

/*
  URE probability. Values are 1 - exp(-bits / 10^exponent), computed
  separately here so the check is not the implementation restated.
*/
interface UreCase {
  level: Level;
  disks: number;
  diskTb: number;
  exponent: number;
  expected: number;
}
const URE: UreCase[] = [
  // 7 survivors x 16TB = 112e12 bytes = 8.96e14 bits at 1e-14 -> 1 - e^-89.6
  { level: "raid5", disks: 8, diskTb: 16, exponent: 14, expected: 1 },
  // same read at 1e-16 -> 1 - e^-0.0896
  { level: "raid5", disks: 8, diskTb: 16, exponent: 16, expected: 0.08571 },
  // 3 survivors x 4TB = 12e12 bytes = 9.6e13 bits at 1e-14 -> 1 - e^-0.96
  { level: "raid5", disks: 4, diskTb: 4, exponent: 14, expected: 0.61712 },
  // a mirror reads one partner: 16e12 bytes = 1.28e14 bits at 1e-14 -> 1 - e^-1.28
  { level: "raid10", disks: 8, diskTb: 16, exponent: 14, expected: 0.72198 },
  // 11 survivors x 20TB = 220e12 bytes = 1.76e15 bits at 1e-15 -> 1 - e^-1.76
  { level: "raidz2", disks: 12, diskTb: 20, exponent: 15, expected: 0.82796 },
  /*
    The one that motivated the whole check. 1.76e15 bits at 1e-17 is about
    1.74 per cent, and the textbook 1-(1-r)^n form returns exactly zero here
    because 1 - 1e-17 is not representable as anything but 1.0.
  */
  { level: "raidz2", disks: 12, diskTb: 20, exponent: 17, expected: 0.017448 },
];
for (const item of URE) {
  const a = analyse({
    level: item.level,
    disks: item.disks,
    diskTb: item.diskTb,
    rebuildMbs: 100,
    ureExponent: item.exponent,
  });
  if (!near(a.ureProbability, item.expected, 0.0005)) {
    problems.push(
      `${item.level} ${item.disks}x${item.diskTb}TB at 1e-${item.exponent}: URE probability should be about ${item.expected}, got ${a.ureProbability}`,
    );
  }
  if (a.ureProbability === 0 && item.expected > 0) {
    problems.push(`${item.level} at 1e-${item.exponent}: probability collapsed to exactly zero`);
  }
}

/* The observed figure must always be lower than the spec one, and never zero. */
for (const item of URE) {
  const a = analyse({
    level: item.level,
    disks: item.disks,
    diskTb: item.diskTb,
    rebuildMbs: 100,
    ureExponent: item.exponent,
  });
  if (a.ureProbabilityObserved > a.ureProbability) {
    problems.push(`${item.level} at 1e-${item.exponent}: observed probability exceeds the spec one`);
  }
  if (a.ureProbabilityObserved === 0) {
    problems.push(`${item.level} at 1e-${item.exponent}: observed probability is exactly zero, which is the float64 bug`);
  }
}

/*
  A level with no redundancy has no rebuild.

  Reporting sixteen days and a URE probability for a RAID 0 reads as a recovery
  that exists, and the arithmetic will happily produce one from "surviving"
  members that cannot reconstruct anything. The browser caught this before this
  check did, which is why it is here now.
*/
{
  const zero = analyse({ level: "raid0", disks: 6, diskTb: 8, rebuildMbs: 200, ureExponent: 14 });
  if (zero.rebuildSeconds !== 0) {
    problems.push(`raid0 reports a rebuild of ${zero.rebuildSeconds}s, and a raid0 cannot rebuild`);
  }
  if (zero.rebuildReadBytes !== 0) {
    problems.push(`raid0 reports ${zero.rebuildReadBytes} bytes read to rebuild`);
  }
  if (zero.ureProbability !== 0 || zero.ureProbabilityObserved !== 0) {
    problems.push("raid0 reports a URE probability for a rebuild that cannot happen");
  }
  if (formatDuration(zero.rebuildSeconds) !== "no time at all") {
    problems.push(`raid0 rebuild renders as "${formatDuration(zero.rebuildSeconds)}"`);
  }
}

/* Rebuild times, worked out by hand. */
const REBUILD: [Level, number, number, number, string][] = [
  // 7 x 16TB = 112e12 bytes at 80 MB/s = 1.4e6 s = 16.2 days
  ["raid5", 8, 16, 80, "16.2 days"],
  // one 16TB partner at 80 MB/s = 2e5 s = 2.3 days
  ["raid10", 8, 16, 80, "2.3 days"],
  // 3 x 4TB = 12e12 at 100 MB/s = 1.2e5 s = 33.3 hours
  ["raid5", 4, 4, 100, "33.3 hours"],
];
for (const [level, disks, diskTb, rate, want] of REBUILD) {
  const a = analyse({ level, disks, diskTb, rebuildMbs: rate, ureExponent: 14 });
  const got = formatDuration(a.rebuildSeconds);
  if (got !== want) {
    problems.push(`${level} ${disks}x${diskTb}TB at ${rate}MB/s should rebuild in ${want}, got ${got}`);
  }
}

/* Decimal TB to binary TiB, the "where did my space go" conversion. */
if (!near(tbToTib(112), 101.86, 0.02)) {
  problems.push(`112 TB should be about 101.86 TiB, got ${tbToTib(112)}`);
}
if (!near(tbToTib(1), 0.9095, 0.001)) problems.push(`1 TB should be about 0.9095 TiB`);

/* Every shipped configuration must be valid and say something true. */
const seen = new Set<string>();
for (const config of CONFIGS) {
  if (seen.has(config.id)) problems.push(`${config.id}: duplicate id`);
  seen.add(config.id);
  if (config.array.disks < MIN_DISKS[config.array.level]) {
    problems.push(
      `${config.id}: ${config.array.disks} disks is below the minimum of ${MIN_DISKS[config.array.level]} for ${config.array.level}`,
    );
  }
  if (config.array.diskTb <= 0) problems.push(`${config.id}: disk size must be positive`);
  if (config.array.rebuildMbs <= 0) problems.push(`${config.id}: rebuild rate must be positive`);
  if (config.notes.length < 1) problems.push(`${config.id}: no commentary`);
  const a = analyse(config.array);
  if (a.usableTb <= 0 && config.array.level !== "raid0") {
    problems.push(`${config.id}: no usable capacity`);
  }
}

if (problems.length) {
  console.error(`\ncheck-array: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${ROWS.length} capacity rows, ${URE.length} URE probabilities, ${REBUILD.length} rebuild times and ${CONFIGS.length} shipped configurations, all matching values worked out by hand.`,
);
