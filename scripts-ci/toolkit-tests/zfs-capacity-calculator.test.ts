import assert from "node:assert/strict";
import {
  LAYOUTS,
  MAX_SLOP,
  MIN_SLOP,
  RECORDSIZES,
  blockAlloc,
  dataDisks,
  deflateRatio,
  formatBinarySize,
  formatIEC,
  formatSI,
  layoutWarnings,
  parseCount,
  parseDiskSize,
  parseDisksPerVdev,
  poolCapacity,
  slopSpace,
  toleratedFailures,
  zfsNicenum,
} from "../../client/src/lib/toolkit/zfs-capacity-calculator";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

const KiB = 1024;
const MiB = 2 ** 20;
const GiB = 2 ** 30;
const TiB = 2 ** 40;

/*
 * Independent reimplementation of vdev_raidz_asize() with BigInt shifts,
 * transcribed from OpenZFS module/zfs/vdev_raidz.c, to cross-check the
 * Number version over a grid of widths, parities, ashifts and sizes.
 */
function raidzAsizeRef(psize: bigint, ashift: bigint, cols: bigint, nparity: bigint): bigint {
  let asize = ((psize - 1n) >> ashift) + 1n;
  asize += nparity * ((asize + cols - nparity - 1n) / (cols - nparity));
  const m = nparity + 1n;
  asize = ((asize + m - 1n) / m) * m;
  return asize << ashift;
}

test("RAIDZ2 10-wide, ashift 12, 128 KiB: 32 data + 8 parity + 2 skip", () => {
  const a = blockAlloc("raidz2", 10, 12, 128 * KiB);
  assert.equal(a.data, 32);
  assert.equal(a.redundancy, 8);
  assert.equal(a.skip, 2);
  assert.equal(a.total, 42);
  assert.equal(a.ideal, 0.8);
  assert.ok(Math.abs(a.efficiency - 32 / 42) < 1e-15);
});

test("RAIDZ2 10-wide, 1 MiB record pads by one sector", () => {
  const a = blockAlloc("raidz2", 10, 12, 1 * MiB);
  assert.deepEqual([a.data, a.redundancy, a.skip, a.total], [256, 64, 1, 321]);
});

test("RAIDZ2 6-wide, 128 KiB: exactly 4/6", () => {
  const a = blockAlloc("raidz2", 6, 12, 128 * KiB);
  assert.deepEqual([a.data, a.redundancy, a.skip, a.total], [32, 16, 0, 48]);
  assert.ok(Math.abs(a.efficiency - 2 / 3) < 1e-15);
});

test("RAIDZ1 4-wide, 128 KiB: 32 + 11 parity, rounded to 44", () => {
  const a = blockAlloc("raidz1", 4, 12, 128 * KiB);
  assert.deepEqual([a.data, a.redundancy, a.skip, a.total], [32, 11, 1, 44]);
});

test("small blocks: 4 KiB on RAIDZ1/2/3 cost p + 1 sectors", () => {
  assert.equal(blockAlloc("raidz1", 6, 12, 4 * KiB).total, 2);
  assert.equal(blockAlloc("raidz2", 6, 12, 4 * KiB).total, 3);
  assert.equal(blockAlloc("raidz3", 8, 12, 4 * KiB).total, 4);
  const z2 = blockAlloc("raidz2", 6, 12, 8 * KiB);
  // 2 data, 2 parity, rounded up to 6: a third efficient on a 6-wide RAIDZ2
  assert.deepEqual([z2.data, z2.redundancy, z2.skip, z2.total], [2, 2, 2, 6]);
  assert.ok(Math.abs(z2.efficiency - 1 / 3) < 1e-15);
});

test("Number blockAlloc matches the BigInt vdev_raidz_asize transcription", () => {
  let checked = 0;
  for (const layout of ["raidz1", "raidz2", "raidz3"] as const) {
    const p = layout === "raidz1" ? 1 : layout === "raidz2" ? 2 : 3;
    for (let cols = p + 1; cols <= 40; cols += 1) {
      for (let ashift = 9; ashift <= 16; ashift += 1) {
        for (const psize of [...RECORDSIZES, 512, 1536, 5000, 131071, 131073]) {
          const a = blockAlloc(layout, cols, ashift, psize);
          const ref = raidzAsizeRef(BigInt(psize), BigInt(ashift), BigInt(cols), BigInt(p));
          assert.equal(BigInt(a.total) << BigInt(ashift), ref, `${layout} ${cols} ${ashift} ${psize}`);
          assert.ok(a.efficiency <= a.ideal + 1e-15, "never better than (n - p) / n");
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 10000);
});

test("mirrors and stripes: sector round up, written once per copy", () => {
  const m = blockAlloc("mirror", 3, 12, 128 * KiB);
  assert.deepEqual([m.data, m.redundancy, m.total], [32, 64, 96]);
  assert.ok(Math.abs(m.efficiency - 1 / 3) < 1e-15);
  const s = blockAlloc("stripe", 1, 13, 4 * KiB);
  assert.equal(s.total, 1);
  assert.equal(s.efficiency, 0.5);
});

test("deflate ratio: 341/512 for 3-wide RAIDZ1 ashift 12, 512 for mirrors", () => {
  // asize(128K) = 48 sectors * 4096 = 196608; >> 9 = 384; 131072 / 384 = 341
  assert.equal(deflateRatio("raidz1", 3, 12), 341);
  assert.equal(deflateRatio("raidz2", 6, 12), 341);
  // 42 * 4096 / 512 = 336; 131072 / 336 = 390.09 -> 390
  assert.equal(deflateRatio("raidz2", 10, 12), 390);
  assert.equal(deflateRatio("mirror", 2, 12), 512);
  assert.equal(deflateRatio("stripe", 1, 16), 512);
});

test("slop: 1/32, at least 128 MiB unless over half, at most 128 GiB", () => {
  assert.equal(slopSpace(1 * TiB), 32 * GiB);
  assert.equal(slopSpace(4 * TiB), 128 * GiB);
  assert.equal(slopSpace(10 * TiB), MAX_SLOP);
  assert.equal(slopSpace(1 * GiB), MIN_SLOP);
  assert.equal(slopSpace(200 * MiB), 100 * MiB);
  assert.equal(slopSpace(0), 0);
  assert.equal(slopSpace(Number.NaN), 0);
});

test("6 x 12 TB RAIDZ2, ashift 12, 128 KiB", () => {
  const r = poolCapacity({ layout: "raidz2", vdevs: 1, disksPerVdev: 6, diskBytes: 12e12, ashift: 12, recordsize: 128 * KiB });
  assert.equal(r.totalDisks, 6);
  assert.equal(r.raw, 72e12);
  assert.equal(r.afterParity, 48e12);
  assert.equal(r.redundancy, 24e12);
  assert.ok(Math.abs(r.afterPadding - 48e12) < 1);
  assert.ok(Math.abs(r.padding) < 1);
  assert.equal(r.slop, 128 * GiB);
  assert.ok(Math.abs(r.usable - (48e12 - 128 * GiB)) < 1);
  assert.ok(Math.abs(r.fillLine - 38.4e12) < 1);
  assert.equal(r.zpoolSize, 72e12);
  assert.equal(r.deflate, 341);
  // floor(72e12 / 512) * 341 - 128 GiB
  assert.equal(r.zfsAvail, 140625000000 * 341 - 128 * GiB);
  assert.equal(r.perVdevTolerance, 2);
  assert.equal(r.guaranteed, 2);
  assert.equal(r.bestCase, 2);
  assert.equal(r.slopBeyondFillLine, false);
});

test("3 x 10-wide RAIDZ2 of 20 TB, padding at 128 KiB", () => {
  const r = poolCapacity({ layout: "raidz2", vdevs: 3, disksPerVdev: 10, diskBytes: 20e12, ashift: 12, recordsize: 128 * KiB });
  assert.equal(r.raw, 600e12);
  assert.equal(r.afterParity, 480e12);
  // 600e12 * 32/42
  assert.ok(Math.abs(r.afterPadding - (600e12 * 32) / 42) < 1);
  assert.ok(r.padding > 22e12 && r.padding < 23e12);
  assert.equal(r.slop, MAX_SLOP);
  assert.equal(r.guaranteed, 2);
  assert.equal(r.bestCase, 6);
});

test("2 x 2-way mirror of 4 TB", () => {
  const r = poolCapacity({ layout: "mirror", vdevs: 2, disksPerVdev: 2, diskBytes: 4e12, ashift: 12, recordsize: 128 * KiB });
  assert.equal(r.raw, 16e12);
  assert.equal(r.afterParity, 8e12);
  assert.equal(r.afterPadding, 8e12);
  assert.equal(r.zpoolSize, 8e12);
  assert.equal(r.deflate, 512);
  assert.equal(r.guaranteed, 1);
  assert.equal(r.bestCase, 2);
});

test("stripe ignores disks per vdev", () => {
  const r = poolCapacity({ layout: "stripe", vdevs: 4, disksPerVdev: 9, diskBytes: 1e12, ashift: 12, recordsize: 128 * KiB });
  assert.equal(r.totalDisks, 4);
  assert.equal(r.afterParity, 4e12);
  assert.equal(r.guaranteed, 0);
  assert.equal(r.bestCase, 0);
});

test("tiny pool: slop exceeds 20 percent", () => {
  const r = poolCapacity({ layout: "stripe", vdevs: 1, disksPerVdev: 1, diskBytes: 64 * MiB, ashift: 12, recordsize: 128 * KiB });
  assert.equal(r.slop, 32 * MiB);
  assert.equal(r.slopBeyondFillLine, true);
});

test("largest pool stays finite", () => {
  const r = poolCapacity({ layout: "raidz3", vdevs: 1000, disksPerVdev: 255, diskBytes: 1e15, ashift: 16, recordsize: 4 * KiB });
  for (const v of [r.raw, r.afterParity, r.afterPadding, r.usable, r.zfsAvail, r.zpoolSize]) assert.ok(Number.isFinite(v));
  assert.ok(r.afterPadding <= r.afterParity);
});

test("fault tolerance and data disks", () => {
  assert.equal(toleratedFailures("mirror", 3), 2);
  assert.equal(toleratedFailures("raidz3", 11), 3);
  assert.equal(toleratedFailures("stripe", 1), 0);
  assert.equal(dataDisks("raidz2", 8), 6);
  assert.equal(dataDisks("mirror", 4), 1);
  assert.equal(LAYOUTS.find((l) => l.id === "raidz3")?.minDisks, 4);
});

test("parsing", () => {
  assert.deepEqual(parseDiskSize("12", "TB"), { kind: "ok", value: 12e12 });
  assert.deepEqual(parseDiskSize(" 3.84 ", "TB"), { kind: "ok", value: 3.84e12 });
  assert.deepEqual(parseDiskSize("1", "TiB"), { kind: "ok", value: TiB });
  assert.deepEqual(parseDiskSize(".5", "TB"), { kind: "ok", value: 5e11 });
  assert.equal(parseDiskSize("", "TB").kind, "empty");
  assert.equal(parseDiskSize("0", "TB").kind, "error");
  assert.equal(parseDiskSize("3,84", "TB").kind, "error");
  assert.equal(parseDiskSize("12TB", "TB").kind, "error");
  assert.equal(parseDiskSize("-4", "TB").kind, "error");
  assert.equal(parseDiskSize("1e3", "TB").kind, "error");
  assert.equal(parseDiskSize("0.05", "GB").kind, "error");
  assert.equal(parseDiskSize("1001", "TB").kind, "error");
  assert.equal(parseDiskSize("9".repeat(400), "TB").kind, "error");
  assert.equal(parseDiskSize("NaN", "TB").kind, "error");
  assert.equal(parseDiskSize("Infinity", "TB").kind, "error");
  assert.deepEqual(parseCount("3", 1, 1000, "vdevs"), { kind: "ok", value: 3 });
  assert.equal(parseCount("0", 1, 1000, "vdevs").kind, "error");
  assert.equal(parseCount("1.5", 1, 1000, "vdevs").kind, "error");
  assert.equal(parseCount("1001", 1, 1000, "vdevs").kind, "error");
  assert.equal(parseCount("99999999999999999999", 1, 1000, "vdevs").kind, "error");
  assert.equal(parseDisksPerVdev("2", "raidz2").kind, "error");
  assert.equal(parseDisksPerVdev("3", "raidz2").kind, "ok");
  assert.equal(parseDisksPerVdev("1", "mirror").kind, "error");
  assert.equal(parseDisksPerVdev("256", "raidz1").kind, "error");
  assert.deepEqual(parseDisksPerVdev("anything", "stripe"), { kind: "ok", value: 1 });
});

test("warnings", () => {
  const base = { vdevs: 1, diskBytes: 12e12, ashift: 12, recordsize: 128 * KiB };
  assert.equal(layoutWarnings({ ...base, layout: "raidz2", disksPerVdev: 6 }).length, 0);
  assert.equal(layoutWarnings({ ...base, layout: "raidz2", disksPerVdev: 3 }).length, 1);
  assert.equal(layoutWarnings({ ...base, layout: "raidz1", disksPerVdev: 5 }).length, 1);
  assert.equal(layoutWarnings({ ...base, layout: "stripe", disksPerVdev: 1 }).length, 1);
  assert.equal(layoutWarnings({ ...base, layout: "mirror", disksPerVdev: 2, ashift: 9 }).length, 1);
  assert.equal(layoutWarnings({ ...base, layout: "mirror", disksPerVdev: 2, ashift: 13, recordsize: 4096 }).length, 1);
  for (const w of layoutWarnings({ ...base, layout: "raidz1", disksPerVdev: 2, ashift: 9, recordsize: 256 })) {
    assert.ok(!w.includes("—"));
  }
});

test("formatting", () => {
  assert.equal(formatSI(12e12), "12.00 TB");
  assert.equal(formatIEC(12e12), "10.91 TiB");
  assert.equal(formatIEC(128 * GiB), "128.0 GiB");
  assert.equal(formatSI(999.999e12), "1.00 PB");
  assert.equal(formatSI(0), "0 B");
  assert.equal(formatSI(512), "512 B");
  assert.equal(formatBinarySize(128 * KiB), "128 KiB");
  assert.equal(formatBinarySize(16 * MiB), "16 MiB");
  assert.equal(formatBinarySize(512), "512 B");
});

test("zfsNicenum matches zfs list output", () => {
  assert.equal(zfsNicenum(512), "512B");
  assert.equal(zfsNicenum(1024), "1K");
  assert.equal(zfsNicenum(1536), "1.50K");
  assert.equal(zfsNicenum(TiB), "1T");
  assert.equal(zfsNicenum(12e12), "10.9T");
  assert.equal(zfsNicenum(140625000000 * 341 - 128 * GiB), "43.5T");
  assert.equal(zfsNicenum(130.97 * TiB), "131T");
  assert.equal(zfsNicenum(1.09 * 1024 * TiB), "1.09P");
  assert.equal(zfsNicenum(10239), "10.0K");
  assert.equal(zfsNicenum(0), "0B");
  assert.equal(zfsNicenum(-1), "0B");
});

test("zfsNicenum rounds exact ties to even, as C printf does", () => {
  // 1.125 T is exactly 1.125 * 2^40: %.2f gives 1.12 (tie to even), toFixed would give 1.13
  assert.equal(zfsNicenum(1.125 * TiB), "1.12T");
  assert.equal(zfsNicenum(1.375 * TiB), "1.38T");
  // 122.5 T does not fit 5 characters until zero decimals: tie to even is 122
  assert.equal(zfsNicenum(122.5 * TiB), "122T");
  assert.equal(zfsNicenum(123.5 * TiB), "124T");
});

test("no stray padding when nothing is rounded", () => {
  const base = { vdevs: 1, ashift: 12, recordsize: 128 * KiB };
  for (const disksPerVdev of [2, 3, 4, 5, 7, 9, 11, 13]) {
    const m = poolCapacity({ ...base, layout: "mirror", disksPerVdev, diskBytes: 3.84e12 });
    assert.equal(m.padding, 0, `mirror ${disksPerVdev}`);
    assert.equal(m.afterPadding, m.afterParity);
  }
  // RAIDZ widths where 32 data sectors divide evenly into the row: 2 + 32/(n-p) rows of parity
  for (const [layout, disksPerVdev] of [["raidz1", 5], ["raidz1", 9], ["raidz2", 6], ["raidz2", 10 + 0 * 1], ["raidz3", 5]] as const) {
    const r = poolCapacity({ ...base, layout, disksPerVdev, diskBytes: 8e12 });
    assert.ok(r.padding >= 0 && r.afterPadding <= r.afterParity, `${layout} ${disksPerVdev}`);
  }
  const even = poolCapacity({ ...base, layout: "raidz2", disksPerVdev: 6, diskBytes: 8e12 });
  assert.equal(even.padding, 0);
  const z1 = poolCapacity({ ...base, layout: "raidz1", disksPerVdev: 5, diskBytes: 8e12 });
  // 32 data + 8 parity = 40, a multiple of 2: exactly 4/5
  assert.equal(z1.padding, 0);
  const stripe = poolCapacity({ ...base, layout: "stripe", vdevs: 7, disksPerVdev: 1, diskBytes: 1e12 });
  assert.equal(stripe.padding, 0);
});

test("pool arithmetic holds together for every layout", () => {
  for (const l of LAYOUTS) {
    for (const disksPerVdev of [l.minDisks, l.minDisks + 1, 8, 12, 24]) {
      if (disksPerVdev < l.minDisks || disksPerVdev > l.maxDisks) continue;
      for (const ashift of [9, 12, 13]) {
        for (const recordsize of [4096, 128 * KiB, 1 * MiB]) {
          const r = poolCapacity({ layout: l.id, vdevs: 3, disksPerVdev, diskBytes: 8e12, ashift, recordsize });
          const tol = r.raw * 1e-12;
          assert.ok(r.afterParity <= r.raw + tol);
          assert.ok(r.afterPadding <= r.afterParity + tol);
          assert.ok(r.padding >= 0);
          assert.ok(Math.abs(r.raw - (r.redundancy + r.afterParity)) <= tol);
          assert.ok(Math.abs(r.afterPadding - (r.usable + r.slop)) <= tol);
          assert.ok(r.usable >= 0 && r.fillLine <= r.afterPadding);
        }
      }
    }
  }
});


/* ------------------------------------------------------------------------
 * Independent verifier cases. Sector counts are worked by hand from
 * vdev_raidz_asize() (asize = ceil(psize / sector); add p * ceil(asize /
 * (n - p)); round up to a multiple of p + 1) and checked against a separate
 * Python transcription; deflate ratios from vdev_deflate_ratio =
 * 131072 / (asize(128 KiB) >> 9); slop from spa_get_slop_space().
 * --------------------------------------------------------------------- */

test("verifier: RAIDZ sector counts from vdev_raidz_asize", () => {
  // [layout, width, ashift, psize, total sectors, deflate ratio]
  const cases: [Parameters<typeof blockAlloc>[0], number, number, number, number, number][] = [
    ["raidz1", 5, 12, 128 * KiB, 40, 409], // 32 + 8 = 40, already even: exactly 4/5
    ["raidz1", 3, 12, 128 * KiB, 48, 341], // 32 + 16 = 48
    ["raidz2", 8, 12, 128 * KiB, 45, 364], // 32 + 2*6 = 44, rounded to 45
    ["raidz3", 11, 12, 128 * KiB, 44, 372], // 32 + 3*4 = 44, a multiple of 4: exactly 8/11
    ["raidz1", 4, 9, 128 * KiB, 342, 383], // 256 + 86 = 342
    ["raidz2", 8, 12, 1 * MiB, 342, 364], // 256 + 2*43 = 342
    ["raidz3", 12, 12, 16 * KiB, 8, 372], // 4 + 3 = 7, rounded to 8
    ["raidz2", 7, 13, 128 * KiB, 24, 341], // 16 + 2*4 = 24
  ];
  for (const [layout, width, ashift, psize, total, deflate] of cases) {
    assert.equal(blockAlloc(layout, width, ashift, psize).total, total, `${layout} ${width} ${ashift} ${psize}`);
    assert.equal(deflateRatio(layout, width, ashift), deflate, `deflate ${layout} ${width} ${ashift}`);
  }
  // 8-wide RAIDZ2 at 128 KiB stores 32/45 = 71.1 percent against an ideal 75
  const a = blockAlloc("raidz2", 8, 12, 128 * KiB);
  assert.equal(a.skip, 1);
  assert.ok(Math.abs(a.efficiency - 32 / 45) < 1e-15);
  assert.equal(a.ideal, 0.75);
});

test("verifier: blocks smaller than a sector", () => {
  // 4 KiB record, 64 KiB sectors: one whole sector per copy
  const m = blockAlloc("mirror", 2, 16, 4 * KiB);
  assert.deepEqual([m.data, m.redundancy, m.total], [1, 1, 2]);
  assert.equal(m.efficiency, 4096 / (2 * 65536));
  const z = blockAlloc("raidz2", 6, 16, 4 * KiB);
  assert.deepEqual([z.data, z.redundancy, z.skip, z.total], [1, 2, 0, 3]);
  // Mirror pool padding is then 15/16 of the after-parity space
  const r = poolCapacity({ layout: "mirror", vdevs: 1, disksPerVdev: 2, diskBytes: 1e12, ashift: 16, recordsize: 4 * KiB });
  assert.ok(Math.abs(r.afterPadding - 1e12 / 16) < 1);
  assert.ok(Math.abs(r.padding - (1e12 * 15) / 16) < 1);
});

test("verifier: slop boundaries", () => {
  assert.equal(slopSpace(2 * TiB), 64 * GiB);
  assert.equal(slopSpace(5 * TiB), MAX_SLOP); // 160 GiB capped
  assert.equal(slopSpace(4 * GiB), 128 * MiB); // exactly 1/32 = the floor
  assert.equal(slopSpace(3 * GiB), MIN_SLOP); // 96 MiB raised to the floor
  assert.equal(slopSpace(256 * MiB), 128 * MiB); // half the pool = the floor
  assert.equal(slopSpace(100 * MiB), 50 * MiB); // never more than half
  assert.equal(slopSpace(-5), 0);
  assert.equal(slopSpace(Number.POSITIVE_INFINITY), MAX_SLOP);
});

test("verifier: 1 x 8-wide RAIDZ2 of 10 TB", () => {
  const r = poolCapacity({ layout: "raidz2", vdevs: 1, disksPerVdev: 8, diskBytes: 10e12, ashift: 12, recordsize: 128 * KiB });
  assert.equal(r.raw, 80e12);
  assert.equal(r.afterParity, 60e12);
  assert.ok(Math.abs(r.afterPadding - (80e12 * 32) / 45) < 1); // 56.89 TB
  assert.ok(Math.abs(r.padding - (60e12 - (80e12 * 32) / 45)) < 1);
  assert.equal(r.slop, MAX_SLOP);
  assert.ok(Math.abs(r.usable - ((80e12 * 32) / 45 - MAX_SLOP)) < 1);
  assert.equal(r.zpoolSize, 80e12);
  assert.equal(r.deflate, 364);
  assert.equal(r.zfsAvail, Math.floor(80e12 / 512) * 364 - MAX_SLOP);
  assert.equal(r.guaranteed, 2);
  assert.equal(r.bestCase, 2);
});

test("verifier: 4 x 3-way mirrors", () => {
  const r = poolCapacity({ layout: "mirror", vdevs: 4, disksPerVdev: 3, diskBytes: 2e12, ashift: 12, recordsize: 128 * KiB });
  assert.equal(r.totalDisks, 12);
  assert.equal(r.raw, 24e12);
  assert.equal(r.afterParity, 8e12);
  assert.equal(r.padding, 0);
  assert.equal(r.zpoolSize, 8e12);
  // 8 TB / 32 = 250 GB, above the 128 GiB (137.4 GB) cap
  assert.equal(r.slop, MAX_SLOP);
  assert.equal(r.perVdevTolerance, 2);
  assert.equal(r.guaranteed, 2);
  assert.equal(r.bestCase, 8);
});

test("verifier: zfs_nicenum_format cases", () => {
  // From the comment in libzfs_util.c: 10239 is 9.999K and prints as 10.0K
  assert.equal(zfsNicenum(10239), "10.0K");
  assert.equal(zfsNicenum(1023), "1023B");
  // 1048575 is 1023.999K: 1024.00K and 1024.0K are too long, so 1024K
  assert.equal(zfsNicenum(1048575), "1024K");
  assert.equal(zfsNicenum(1.5 * GiB), "1.50G");
  assert.equal(zfsNicenum(100 * GiB + 1), "100G");
  assert.equal(zfsNicenum(48e12), "43.7T");
  assert.equal(zfsNicenum(2 ** 60), "1E");
  assert.equal(zfsNicenum(Number.NaN), "0B");
  assert.equal(zfsNicenum(Number.POSITIVE_INFINITY), "0B");
});

test("verifier: parsing rejects malformed and adversarial input", () => {
  assert.equal(parseDiskSize("   ", "TB").kind, "empty");
  assert.equal(parseDiskSize("1 2", "TB").kind, "error"); // not silently 12
  assert.equal(parseDiskSize("12.5.3", "TB").kind, "error");
  assert.equal(parseDiskSize("+5", "TB").kind, "error");
  assert.equal(parseDiskSize("0x10", "TB").kind, "error");
  assert.equal(parseDiskSize("\u0661\u0662", "TB").kind, "error"); // Arabic-Indic digits
  assert.equal(parseDiskSize("\uff11\uff12", "TB").kind, "error"); // full-width digits
  assert.equal(parseDiskSize("12 TB", "TB").kind, "error");
  assert.deepEqual(parseDiskSize("1_000", "GB"), { kind: "ok", value: 1e12 });
  assert.deepEqual(parseDiskSize("909.4947", "TiB").kind, "ok");
  assert.equal(parseDiskSize("909.5", "TiB").kind, "error"); // just over 1 PB
  assert.equal(parseDiskSize("1".repeat(33), "TB").kind, "error");
  assert.equal(parseCount("1 0", 1, 1000, "vdevs").kind, "error");
  assert.equal(parseCount("-1", 1, 1000, "vdevs").kind, "error");
  assert.equal(parseCount("\u0663", 1, 1000, "vdevs").kind, "error");
  assert.deepEqual(parseCount(" 007 ", 1, 1000, "vdevs"), { kind: "ok", value: 7 });
  assert.equal(parseDisksPerVdev("3", "raidz3").kind, "error");
  assert.equal(parseDisksPerVdev("4", "raidz3").kind, "ok");
  assert.equal(parseDisksPerVdev("255", "mirror").kind, "ok");
  assert.equal(parseDisksPerVdev("", "raidz1").kind, "empty");
});


/* ------------------------------------------------------------------------
 * Second independent verifier pass. Expected values worked by hand from
 * vdev_raidz_asize() and vdev_set_deflate_ratio() in OpenZFS, and checked
 * against a separate Python transcription (not the TypeScript under test).
 * --------------------------------------------------------------------- */

test("verifier 2: RAIDZ widths from Ahrens' parity-cost examples", () => {
  // [layout, width, ashift, psize, data, parity, skip, total, deflate]
  const cases: [Parameters<typeof blockAlloc>[0], number, number, number, number, number, number, number, number][] = [
    ["raidz3", 7, 12, 128 * KiB, 32, 24, 0, 56, 292], // 3 * ceil(32/4) = 24; 56 is a multiple of 4
    ["raidz3", 9, 12, 128 * KiB, 32, 18, 2, 52, 315], // 3 * ceil(32/6) = 18; 50 -> 52
    ["raidz1", 6, 12, 128 * KiB, 32, 7, 1, 40, 409], // ceil(32/5) = 7; 39 -> 40
    ["raidz1", 3, 9, 128 * KiB, 256, 128, 0, 384, 341], // 512-byte sectors, exactly 2/3
    ["raidz2", 4, 12, 16 * KiB, 4, 4, 1, 9, 248], // 4 + 2 * 2 = 8 -> 9
    ["raidz1", 5, 13, 128 * KiB, 16, 4, 0, 20, 409], // 8 KiB sectors
    ["raidz2", 12, 12, 1 * MiB, 256, 52, 1, 309, 390], // 2 * ceil(256/10) = 52; 308 -> 309
    ["raidz1", 2, 12, 4 * KiB, 1, 1, 0, 2, 256], // 2-wide RAIDZ1 is a mirror's cost
    ["raidz3", 255, 9, 16 * MiB, 32768, 393, 3, 33164, 496], // widest, largest record
  ];
  for (const [layout, width, ashift, psize, data, parity, skip, total, deflate] of cases) {
    const a = blockAlloc(layout, width, ashift, psize);
    assert.deepEqual([a.data, a.redundancy, a.skip, a.total], [data, parity, skip, total], `${layout} ${width} ${ashift} ${psize}`);
    assert.equal(deflateRatio(layout, width, ashift), deflate, `deflate ${layout} ${width} ${ashift}`);
  }
  // A 1-byte block still takes a whole sector plus parity
  assert.deepEqual([blockAlloc("raidz2", 6, 12, 1).data, blockAlloc("raidz2", 6, 12, 1).total], [1, 3]);
});

test("verifier 2: 1 x 12-wide RAIDZ2 of 4 TB", () => {
  const r = poolCapacity({ layout: "raidz2", vdevs: 1, disksPerVdev: 12, diskBytes: 4e12, ashift: 12, recordsize: 128 * KiB });
  assert.equal(r.raw, 48e12);
  assert.equal(r.afterParity, 40e12);
  // 32 data sectors in 42: 48 TB * 32/42 = 36.57 TB, against 40 TB with no rounding
  assert.ok(Math.abs(r.afterPadding - (48e12 * 32) / 42) < 1);
  assert.equal(r.slop, MAX_SLOP); // 36.57 TB / 32 = 1.14 TB, capped
  assert.ok(Math.abs(r.fillLine - 0.8 * ((48e12 * 32) / 42)) < 1);
  assert.equal(r.deflate, 390);
  assert.equal(r.zfsAvail, 36425061046528); // (48e12 >> 9) * 390 - 128 GiB, from the Python transcription
  assert.equal(zfsNicenum(r.zfsAvail), "33.1T");
  assert.equal(zfsNicenum(r.zpoolSize), "43.7T");
  assert.equal(r.perVdevTolerance, 2);
});

test("verifier 2: 3 x 2-way mirrors and 4 x RAIDZ1 fault tolerance", () => {
  const m = poolCapacity({ layout: "mirror", vdevs: 3, disksPerVdev: 2, diskBytes: 8e12, ashift: 12, recordsize: 128 * KiB });
  assert.equal(m.raw, 48e12);
  assert.equal(m.afterParity, 24e12);
  assert.equal(m.zpoolSize, 24e12);
  assert.equal(m.slop, MAX_SLOP); // 750 GB / 32 is above the cap
  assert.equal(m.zfsAvail, Math.floor(24e12 / 512) * 512 - MAX_SLOP);
  assert.deepEqual([m.perVdevTolerance, m.guaranteed, m.bestCase], [1, 1, 3]);
  const z = poolCapacity({ layout: "raidz1", vdevs: 4, disksPerVdev: 5, diskBytes: 2e12, ashift: 12, recordsize: 128 * KiB });
  assert.deepEqual([z.perVdevTolerance, z.guaranteed, z.bestCase], [1, 1, 4]);
  assert.equal(z.afterParity, 32e12);
  assert.equal(z.padding, 0); // 5-wide RAIDZ1 at 128 KiB is exact (40 sectors)
});

test("verifier 2: slop between the floor and the cap", () => {
  // 1/32 of 100 GiB is 3.125 GiB: neither floor nor cap applies
  assert.equal(slopSpace(100 * GiB), 3.125 * GiB);
  // exactly 4 TiB: 1/32 equals the 128 GiB cap
  assert.equal(slopSpace(4 * TiB), MAX_SLOP);
  // 300 MiB: 1/32 is 9.4 MiB, raised to the 128 MiB floor (less than half)
  assert.equal(slopSpace(300 * MiB), MIN_SLOP);
  // 64 MiB, the smallest device ZFS accepts: half the pool
  assert.equal(slopSpace(64 * MiB), 32 * MiB);
});

test("verifier 2: TB versus TiB", () => {
  assert.deepEqual(parseDiskSize("12", "TB"), { kind: "ok", value: 12e12 });
  assert.equal(formatIEC(12e12), "10.91 TiB");
  assert.equal(formatSI(TiB), "1.10 TB");
  assert.deepEqual(parseDiskSize("16", "TiB"), { kind: "ok", value: 16 * TiB });
  assert.deepEqual(parseDiskSize("960", "GB"), { kind: "ok", value: 960e9 });
  assert.equal(zfsNicenum(12e12), "10.9T");
});

test("verifier 2: malformed input gives a message, never a throw", () => {
  const bad = ["1 2", "1\u00a02", "12 TB", "12TB", ".", "..", "1..2", "--1", "1e", "0x1", "\u0000", "12\u200b", "\ud83d\ude00", "1,000", "_12", "12_", "1__2", "9".repeat(10000)];
  for (const b of bad) {
    const r = parseDiskSize(b, "TB");
    assert.equal(r.kind, "error", JSON.stringify(b.slice(0, 20)));
  }
  assert.equal(parseDiskSize("1 2", "TB").kind === "error" && parseDiskSize("1 2", "TB").message.includes("spaces"), true);
  assert.deepEqual(parseDiskSize("\t12\n", "TB"), { kind: "ok", value: 12e12 });
  assert.deepEqual(parseDiskSize("12.", "TB"), { kind: "ok", value: 12e12 });
  assert.deepEqual(parseDiskSize("0.064", "TB"), { kind: "ok", value: 64e9 });
  assert.equal(parseDiskSize("0.0000000000000000000001", "TB").kind, "error");
  assert.equal(parseDiskSize("00000", "TB").kind, "error");
  for (const b of ["1 0", "1\t0", "ten", "1.0", "1e2", "-0", "\u0661"]) {
    assert.equal(parseCount(b, 1, 1000, "vdevs").kind, "error", b);
  }
  assert.deepEqual(parseCount("1_000", 1, 1000, "vdevs"), { kind: "ok", value: 1000 });
  assert.equal(parseCount("", 1, 1000, "vdevs").kind, "empty");
  assert.equal(parseDisksPerVdev("1 1", "raidz2").kind, "error");
  assert.equal(parseDisksPerVdev("2", "raidz1").kind, "ok"); // zpool allows nparity + 1 children
  assert.equal(parseDisksPerVdev("2", "mirror").kind, "ok");
});

console.log(`zfs-capacity-calculator: ${passed} tests passed`);
