import assert from "node:assert/strict";
import {
  analyze,
  atLeastOne,
  atLeastTwo,
  formatBytes,
  formatCount,
  formatDuration,
  formatOdds,
  formatPercent,
  pairProbability,
  parseAfr,
  parseDiskSize,
  parseSpeed,
  parseSurvivors,
  rebuildSeconds,
  secondFailureProbability,
  ureProbability,
  formatSig,
} from "../../client/src/lib/toolkit/raid-rebuild-risk.ts";

function close(actual: number, expected: number, rel: number, msg: string) {
  const err = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(err <= rel, `${msg}: got ${actual}, expected ${expected} (rel err ${err})`);
}

/* The classic example: 12 TB read at 1 in 10^14 is 9.6e13 bits, P = 1 - e^-0.96. */
{
  const r = atLeastOne(1e-14, 9.6e13);
  close(r.fail, 1 - Math.exp(-0.96), 1e-12, "12 TB at 1e14");
  close(r.survive, Math.exp(-0.96), 1e-12, "12 TB at 1e14 survive");
  close(r.fail, 0.6171071, 1e-6, "12 TB at 1e14 value");
}
/* 1 TB at 1e14: 1 - e^-0.08. */
close(ureProbability(8e12, 14).fail, 1 - Math.exp(-0.08), 1e-12, "1 TB at 1e14");
/* The naive form loses p: 1 - 1e-17 rounds to exactly 1, 1 - 1e-16 to 1 - 1.11e-16. */
assert.equal((1 - 1e-17) ** 8e12, 1);
assert.ok(Math.abs(1 - (1 - 1e-16) ** 8e12 - 8e-4) / 8e-4 > 0.1);
close(atLeastOne(1e-17, 8e12).fail, -Math.expm1(-8e-5), 1e-12, "stable below the rounding limit");
close(atLeastOne(1e-16, 8e12).fail, -Math.expm1(-8e-4), 1e-12, "stable for tiny p");
close(atLeastOne(1e-16, 8e12).fail, 7.99680085e-4, 1e-8, "tiny p value");
/* Degenerate cases never produce NaN. */
assert.deepEqual(atLeastOne(0, 1e9), { fail: 0, survive: 1 });
assert.deepEqual(atLeastOne(1e-14, 0), { fail: 0, survive: 1 });
assert.deepEqual(atLeastOne(1, 5), { fail: 1, survive: 0 });

/* Binomial tail P(X >= 2). */
close(atLeastTwo(5, 0.3), 1 - 0.7 ** 5 - 5 * 0.3 * 0.7 ** 4, 1e-12, "n=5 s=0.3");
close(atLeastTwo(5, 0.3), 0.47178, 1e-10, "n=5 s=0.3 value");
assert.equal(atLeastTwo(1, 0.5), 0);
assert.equal(atLeastTwo(10, 0), 0);
assert.equal(atLeastTwo(10, 1), 1);
/* Tiny s: C(8,2) s^2 (1-s)^6 + C(8,3) s^3 ... */
close(atLeastTwo(8, 1e-10), 28e-20, 1e-8, "n=8 s=1e-10");
/* Exact rational check on both sides of the series/direct switch. */
function exactTail(n: number, den: bigint): number {
  // s = 1/den, P(X>=2) = 1 - ((den-1)/den)^n - n * (den-1)^(n-1) / den^n
  const D = den ** BigInt(n);
  const q = den - 1n;
  const num = D - q ** BigInt(n) - BigInt(n) * q ** BigInt(n - 1);
  // scale to 30 digits
  const scaled = (num * 10n ** 30n) / D;
  return Number(scaled) / 1e30;
}
close(atLeastTwo(100, 1 / 1001), exactTail(100, 1001n), 1e-10, "series side");
close(atLeastTwo(100, 1 / 1000), exactTail(100, 1000n), 1e-10, "direct side");
close(atLeastTwo(30, 1 / 100000), exactTail(30, 100000n), 1e-10, "small mean");
close(atLeastTwo(1000, 1 / 50), exactTail(1000, 50n), 1e-10, "large mean");

/* RAID 6 single failure: two UREs in one 4 KiB row. 12 TB disks, 8 survivors, 1e14. */
{
  const s = -Math.expm1(32768 * Math.log1p(-1e-14));
  const rows = Math.ceil(12e12 / 4096);
  const perRow = 28 * s * s; // higher terms are ~1e-27 relative
  const expected = -Math.expm1(rows * Math.log1p(-perRow));
  close(pairProbability(12e12, 8, 14).fail, expected, 1e-8, "pair 12TB x8");
  close(pairProbability(12e12, 8, 14).fail, 8.808e-9, 1e-3, "pair value");
}

/* Second disk failure during the window. */
{
  const lambda = -Math.log(0.98) / (365.25 * 86400);
  close(secondFailureProbability(0.02, 7, 86400), 1 - Math.exp(-7 * lambda * 86400), 1e-12, "afr");
  assert.equal(secondFailureProbability(0, 7, 86400), 0);
}

/* Rebuild time. */
assert.equal(rebuildSeconds(12e12, 200), 60000);
assert.equal(formatDuration(60000), "16 h 40 min");
assert.equal(formatDuration(59.6), "1 min");
assert.equal(formatDuration(59.4), "59 s");
assert.equal(formatDuration(86399), "1 day");
assert.equal(formatDuration(0.2), "under 1 s");
assert.equal(formatDuration(3599.8), "1 h");
assert.equal(formatDuration(200), "3 min 20 s");
assert.equal(formatDuration(86400 * 2 + 3600 * 4), "2 days 4 h");
assert.equal(formatDuration(Number.NaN), "--");

/* The Harris example: seven 2 TB disks in RAID 5, one fails, six are read. */
{
  const r = analyze({ diskBytes: 2e12, survivors: 6, ureExp: 14, speedMBps: 100, afr: null });
  assert.equal(r.bitsRead, 9.6e13);
  close(r.anyUre.fail, 0.6171071, 1e-6, "harris");
  close(r.expectedUres, 0.96, 1e-12, "expected count");
  assert.equal(r.secondFailure, null);
  assert.equal(r.scenarios[0].arrayDisks, 7);
  assert.equal(r.scenarios[0].applicable, true);
  assert.equal(r.scenarios[1].applicable, true);
  assert.equal(r.scenarios[2].arrayDisks, 8);
  assert.equal(r.scenarios[1].fail < 1e-6, true);
  assert.equal(formatPercent(r.anyUre.fail, r.anyUre.survive), "61.7%");
  assert.equal(formatOdds(r.anyUre.fail, r.anyUre.survive), null);
}
/* Small arrays mark the levels that cannot exist. */
{
  const r = analyze({ diskBytes: 1e12, survivors: 2, ureExp: 15, speedMBps: 100, afr: 0.015 });
  assert.equal(r.scenarios[0].applicable, true);
  assert.equal(r.scenarios[1].applicable, false);
  assert.ok(r.secondFailure !== null && r.secondFailure > 0 && r.secondFailure < 1e-3);
}
/* Adversarial: the largest inputs give a clean 1, not NaN. */
{
  const r = analyze({ diskBytes: 1e15, survivors: 1000, ureExp: 14, speedMBps: 0.001, afr: 0.99 });
  assert.equal(r.anyUre.fail, 1);
  assert.equal(r.anyUre.survive, 0);
  assert.ok(Number.isFinite(r.pairUre.fail));
  assert.equal(formatPercent(r.anyUre.fail, r.anyUre.survive), "> 99.999999%");
  assert.equal(formatDuration(r.rebuildSeconds), "more than 100 years");
  assert.ok(r.secondFailure !== null && r.secondFailure <= 1);
}

/* Formatting. */
assert.equal(formatPercent(0, 1), "0%");
assert.equal(formatPercent(1e-12, 1), "< 0.000001%");
assert.equal(formatPercent(0.000877, 0.999123), "0.0877%");
assert.equal(formatPercent(0.9997, 0.0003), "99.970%");
assert.equal(formatOdds(0.000877, 0.999123), "about 1 in 1,140");
assert.equal(formatOdds(0.99, 0.01), "a clean rebuild about 1 in 100");
assert.equal(formatCount(2.35e6), "2.35 million");
assert.equal(formatCount(3.1e18), "3.10 × 10^18");

/* Parsing. */
assert.deepEqual(parseDiskSize("12", "TB"), { kind: "ok", value: 12e12 });
assert.deepEqual(parseDiskSize("1", "TiB"), { kind: "ok", value: 1099511627776 });
assert.deepEqual(parseDiskSize("", "TB"), { kind: "empty" });
assert.equal(parseDiskSize("2000", "TB").kind, "error");
assert.equal(parseDiskSize("0", "TB").kind, "error");
assert.equal(parseDiskSize("-4", "TB").kind, "error");
assert.equal(parseDiskSize("1,5", "TB").kind, "error");
assert.deepEqual(parseDiskSize("1,000", "GB"), { kind: "ok", value: 1e12 });
assert.equal(parseDiskSize("abc", "TB").kind, "error");
assert.equal(parseDiskSize("1e400", "TB").kind, "error");
assert.equal(parseDiskSize("9".repeat(60), "TB").kind, "error");
assert.equal(parseSurvivors("2.5").kind, "error");
assert.equal(parseSurvivors("0").kind, "error");
assert.equal(parseSurvivors("1001").kind, "error");
assert.deepEqual(parseSurvivors("7"), { kind: "ok", value: 7 });
assert.equal(parseSpeed("0").kind, "error");
assert.deepEqual(parseSpeed("1e2"), { kind: "ok", value: 100 });
assert.deepEqual(parseAfr("0"), { kind: "ok", value: 0 });
assert.equal(parseAfr("100").kind, "error");
const msg = parseSpeed("0");
assert.ok(msg.kind === "error" && msg.message === "Rebuild speed must be at least 0.001 MB/s.");


/* ---------------------------------------------- verifier: independent cases */

/* Exact small cases of 1 - (1 - p)^n. 1 - 0.5^3 = 0.875 exactly; 0.999^1000 = 0.36769542477096373... */
assert.equal(atLeastOne(0.5, 3).fail, 0.875);
close(atLeastOne(1e-3, 1000).fail, 0.6323045752290363, 1e-13, "0.999^1000");
close(atLeastOne(1e-3, 1000).survive, 0.36769542477096373, 1e-13, "0.999^1000 survive");

/* Exact rational reference for 1 - (1 - 10^-14)^n, n = 10^6, through BigInt. */
{
  const n = 1_000_000n;
  // (1 - 1e-14)^n by the binomial series; terms fall by about 1e-8 each, three terms reach 1e-24.
  // 1 - (1-p)^n = n p - C(n,2) p^2 + C(n,3) p^3 - ...
  const scale = 10n ** 60n;
  const p = scale / 10n ** 14n;
  const c2 = (n * (n - 1n)) / 2n;
  const c3 = (n * (n - 1n) * (n - 2n)) / 6n;
  const exact = n * p - (c2 * p * p) / scale + (c3 * p * p * p) / scale / scale;
  const expected = Number((exact * 10n ** 30n) / scale) / 1e30;
  close(atLeastOne(1e-14, 1e6).fail, expected, 1e-12, "BigInt series 1e6 bits");
}

/* 10 TB disks, 4 read, 1 in 10^15: 3.2e14 bits, np = 0.32, P = 1 - e^-0.32 = 0.273851... */
{
  const r = analyze({ diskBytes: 10e12, survivors: 4, ureExp: 15, speedMBps: 200, afr: null });
  assert.equal(r.bitsRead, 3.2e14);
  close(r.anyUre.fail, 0.27385096292630906, 1e-9, "10 TB x4 at 1e15");
  assert.equal(formatPercent(r.anyUre.fail, r.anyUre.survive), "27.4%");
  assert.equal(r.rebuildSeconds, 50000);
  assert.equal(formatDuration(r.rebuildSeconds), "13 h 53 min");
}
/* 18 TB disks, 11 read, 1 in 10^16: 1.584e15 bits, np = 0.1584, P = 14.65 percent. */
{
  const r = analyze({ diskBytes: 18e12, survivors: 11, ureExp: 16, speedMBps: 250, afr: null });
  close(r.anyUre.fail, -Math.expm1(-0.1584), 1e-9, "18 TB x11 at 1e16");
  assert.equal(formatPercent(r.anyUre.fail, r.anyUre.survive), "14.6%");
  assert.equal(r.rebuildSeconds, 72000);
  assert.equal(formatDuration(r.rebuildSeconds), "20 h");
  assert.equal(formatBytes(r.readBytes), "198 TB");
}
/* 20 TB at 180 MB/s: 111,111 s, which rounds to 31 hours. */
assert.equal(formatDuration(rebuildSeconds(20e12, 180)), "1 day 7 h");
/* 16 TiB is 17,592,186,044,416 bytes. */
assert.deepEqual(parseDiskSize("16", "TiB"), { kind: "ok", value: 17592186044416 });

/* Binomial tail P(X >= 2), exact small cases. */
assert.equal(atLeastTwo(3, 0.5), 0.5);
close(atLeastTwo(2, 0.1), 0.01, 1e-12, "n=2 s=0.1");
close(atLeastTwo(4, 0.25), 0.26171875, 1e-12, "n=4 s=0.25");
/* Series side for n=2: exactly s^2. */
close(atLeastTwo(2, 1e-9), 1e-18, 1e-9, "n=2 s=1e-9");

/* One 4 KiB row read on 3 surviving disks: P = 3 s^2 (1 - s) + s^3, s = 1 - (1 - 1e-14)^32768. */
{
  const s = -Math.expm1(32768 * Math.log1p(-1e-14));
  close(s, 3.2768e-10, 1e-5, "sector chance");
  close(pairProbability(4096, 3, 14).fail, 3 * s * s * (1 - s) + s ** 3, 1e-9, "single row");
  /* Two survivors means one row can lose both: 2-of-2. */
  close(pairProbability(4096, 2, 14).fail, s * s, 1e-9, "single row two disks");
  /* One survivor cannot lose two sectors in a row. */
  assert.equal(pairProbability(12e12, 1, 14).fail, 0);
}

/* AFR is the one-year failure probability: one disk over a year at 50 percent is 0.5, two disks 0.75. */
{
  const year = 365.25 * 86400;
  close(secondFailureProbability(0.5, 1, year), 0.5, 1e-12, "afr one disk one year");
  close(secondFailureProbability(0.5, 2, year), 0.75, 1e-12, "afr two disks one year");
  close(secondFailureProbability(0.02, 1, year / 2), 1 - Math.sqrt(0.98), 1e-12, "afr half year");
}

/* Applicability boundaries. */
{
  const r1 = analyze({ diskBytes: 1e12, survivors: 1, ureExp: 14, speedMBps: 100, afr: null });
  assert.deepEqual(r1.scenarios.map((x) => x.applicable), [false, false, false]);
  const r3 = analyze({ diskBytes: 1e12, survivors: 3, ureExp: 14, speedMBps: 100, afr: null });
  assert.deepEqual(r3.scenarios.map((x) => x.applicable), [true, true, true]);
  assert.deepEqual(r3.scenarios.map((x) => x.arrayDisks), [4, 4, 5]);
}

/* Formatting edge cases: no "10.00" mantissas, no "1000 TB", no four-digit percentages. */
assert.equal(formatPercent(0.09999, 0.90001), "10.0%");
assert.equal(formatPercent(0.0009999, 0.9990001), "0.100%");
assert.equal(formatPercent(0.999, 0.001), "99.90%");
assert.equal(formatPercent(0.99999, 0.00001), "99.9990%");
assert.equal(formatPercent(1e-8, 1 - 1e-8), "0.00000100%");
assert.equal(formatCount(9.996e17), "1.00 × 10^18");
assert.equal(formatCount(999_999.6), "1 million");
assert.equal(formatCount(999_499), "999,000");
assert.equal(formatCount(9.996e14), "1.00 × 10^15");
assert.equal(formatSig(9.996e14), "1.00 × 10^15");
assert.equal(formatSig(9.6e-5), "9.60 × 10^-5");
assert.equal(formatSig(0.96), "0.96");
assert.equal(formatBytes(999.9e12), "1 PB");
assert.equal(formatBytes(1e18), "1 EB");
assert.equal(formatBytes(84e12), "84 TB");
assert.equal(formatBytes(512), "512 B");
assert.equal(formatBytes(Number.NaN), "--");

/* Malformed and adversarial input: always a Parsed value, never a throw. */
for (const raw of ["1.2.3", "１２", "12TB", "NaN", "Infinity", "0x10", "1e", "e5", ".", "\u20145", "\u221212", "😀", "1,,000", "12,5", "١٢"]) {
  const r = parseDiskSize(raw, "TB");
  assert.equal(r.kind, "error", `disk size ${JSON.stringify(raw)}`);
}
assert.deepEqual(parseDiskSize("   ", "TB"), { kind: "empty" });
assert.deepEqual(parseDiskSize(" 12 ", "TB"), { kind: "ok", value: 12e12 });
assert.deepEqual(parseDiskSize("1e3", "TB"), { kind: "ok", value: 1e15 });
assert.equal(parseDiskSize("1000.001", "TB").kind, "error");
assert.equal(parseDiskSize("1e-400", "TB").kind, "error");
assert.equal(parseDiskSize("0.000004", "GB").kind, "error"); // 4000 bytes, under one sector
assert.deepEqual(parseSurvivors("1e3"), { kind: "ok", value: 1000 });
assert.deepEqual(parseSurvivors("7.0"), { kind: "ok", value: 7 });
assert.equal(parseSurvivors("-7").kind, "error");
assert.equal(parseSpeed("0.0009").kind, "error");
assert.deepEqual(parseSpeed("0.001"), { kind: "ok", value: 0.001 });
assert.equal(parseSpeed("100001").kind, "error");
assert.equal(parseAfr("99.5").kind, "error");
assert.deepEqual(parseAfr(""), { kind: "empty" });
/* The slowest allowed rebuild of the largest disk stays finite. */
{
  const r = analyze({ diskBytes: 1e15, survivors: 1000, ureExp: 16, speedMBps: 0.001, afr: 0.99 });
  assert.ok(Number.isFinite(r.rebuildSeconds));
  assert.equal(formatDuration(r.rebuildSeconds), "more than 100 years");
  assert.ok(Number.isFinite(r.pairUre.fail) && r.pairUre.fail >= 0 && r.pairUre.fail <= 1);
  assert.equal(formatBytes(r.readBytes), "1 EB");
}
/* The smallest disk on one survivor at the best rating. */
{
  const r = analyze({ diskBytes: 4096, survivors: 1, ureExp: 16, speedMBps: 100_000, afr: 0 });
  assert.ok(r.anyUre.fail > 0 && r.anyUre.fail < 1e-11);
  assert.equal(formatPercent(r.anyUre.fail, r.anyUre.survive), "< 0.000001%");
  assert.equal(r.secondFailure, 0);
  assert.equal(formatDuration(r.rebuildSeconds), "under 1 s");
}

console.log("raid-rebuild-risk: all tests passed");
