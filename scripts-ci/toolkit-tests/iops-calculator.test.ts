import assert from "node:assert/strict";
import {
  DISK_PRESETS,
  RAID_LEVELS,
  backendIops,
  breakdown,
  ceilSafe,
  diskCountProblem,
  disksForTarget,
  disksForTargetShortcut,
  formatIops,
  formatRate,
  frontEndIops,
  hddIops,
  parseDiskCount,
  parseDiskIops,
  parseReadPercent,
  parseSeekMs,
  parseTargetIops,
  raidInfo,
  roundUpForLevel,
  shortcutIops,
} from "../../client/src/lib/toolkit/iops-calculator";

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

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

test("write penalties 1, 2, 2, 4, 6", () => {
  assert.deepEqual(
    RAID_LEVELS.map((r) => r.penalty),
    [1, 2, 2, 4, 6],
  );
  for (const r of RAID_LEVELS) assert.equal(r.diskReads + r.diskWrites, r.penalty);
});

test("presets match the spec figures", () => {
  assert.deepEqual(
    DISK_PRESETS.slice(0, 3).map((p) => p.iops),
    [80, 140, 180],
  );
  assert.ok(DISK_PRESETS.slice(3).every((p) => p.typical));
});

test("8 x 180 IOPS RAID 5 at 70 percent reads", () => {
  const raw = 8 * 180;
  // Shortcut: 1440 * 0.7 + 1440 * 0.3 / 4 = 1008 + 108
  assert.ok(near(shortcutIops(raw, 70, 4), 1116));
  // Balanced: 1440 / (0.7 + 0.3 * 4) = 1440 / 1.9
  assert.ok(near(frontEndIops(raw, 70, 4), 1440 / 1.9));
  // Serving the shortcut's figure would need more than the disks have
  assert.ok(near(backendIops(1116, 70, 4), 2120.4));
  // Serving the balanced figure uses exactly the raw IOPS
  assert.ok(near(backendIops(frontEndIops(raw, 70, 4), 70, 4), raw));
});

test("both formulas agree at the ends", () => {
  for (const p of [1, 2, 4, 6]) {
    assert.ok(near(frontEndIops(1000, 100, p), 1000));
    assert.ok(near(shortcutIops(1000, 100, p), 1000));
    assert.ok(near(frontEndIops(1000, 0, p), 1000 / p));
    assert.ok(near(shortcutIops(1000, 0, p), 1000 / p));
  }
});

test("shortcut never below the balanced figure", () => {
  for (const p of [1, 2, 4, 6]) {
    for (let r = 0; r <= 100; r += 5) {
      assert.ok(shortcutIops(1000, r, p) >= frontEndIops(1000, r, p) - 1e-9);
    }
  }
  // RAID 0: penalty 1, the formulas are identical
  assert.ok(near(shortcutIops(1000, 37, 1), frontEndIops(1000, 37, 1)));
});

test("breakdown adds back up to the raw IOPS", () => {
  for (const level of RAID_LEVELS) {
    const b = breakdown(2000, 60, level.id);
    assert.ok(near(b.diskReads + b.diskWrites, 2000), level.id);
    assert.ok(near(b.frontReads + b.frontWrites, b.front));
  }
  const r5 = breakdown(1440, 70, "raid5");
  assert.ok(near(r5.diskWrites, r5.frontWrites * 2));
  assert.ok(near(r5.diskReads, r5.frontReads + r5.frontWrites * 2));
});

test("disk counts per level", () => {
  assert.equal(diskCountProblem("raid0", 1), null);
  assert.equal(diskCountProblem("raid1", 2), null);
  assert.notEqual(diskCountProblem("raid1", 3), null);
  assert.notEqual(diskCountProblem("raid1", 1), null);
  assert.notEqual(diskCountProblem("raid10", 2), null);
  assert.notEqual(diskCountProblem("raid10", 5), null);
  assert.equal(diskCountProblem("raid10", 6), null);
  assert.notEqual(diskCountProblem("raid5", 2), null);
  assert.equal(diskCountProblem("raid5", 3), null);
  assert.notEqual(diskCountProblem("raid6", 3), null);
  assert.equal(diskCountProblem("raid6", 4), null);
  assert.equal(roundUpForLevel("raid10", 5), 6);
  assert.equal(roundUpForLevel("raid10", 1), 4);
  assert.equal(roundUpForLevel("raid6", 2), 4);
  assert.equal(roundUpForLevel("raid1", 1), 2);
  assert.equal(roundUpForLevel("raid1", 3), null);
});

test("reverse sizing", () => {
  // 1000 IOPS at 70/30 on RAID 5: 700 + 300 * 4 = 1900 back-end; / 95 = exactly 20
  const s = disksForTarget(1000, 70, "raid5", 95);
  assert.equal(s.backend, 1900);
  assert.equal(s.byIops, 20);
  assert.equal(s.disks, 20);
  assert.equal(s.note, null);
  assert.ok(s.delivers !== null && s.delivers >= 1000 - 1e-9);
  // 1900 / 80 = 23.75 -> 24
  assert.equal(disksForTarget(1000, 70, "raid5", 80).disks, 24);
  // RAID 10 rounds to even: 5000 at 50/50 = 2500 + 5000 = 7500 / 180 = 41.67 -> 42 (even)
  assert.equal(disksForTarget(5000, 50, "raid10", 180).disks, 42);
  // 7500 / 140 = 53.57 -> 54 (even already)
  assert.equal(disksForTarget(5000, 50, "raid10", 140).disks, 54);
  // 7500 / 160 = 46.875 -> 47 -> 48
  const odd = disksForTarget(5000, 50, "raid10", 160);
  assert.equal(odd.byIops, 47);
  assert.equal(odd.disks, 48);
  assert.ok(odd.note && odd.note.includes("even"));
  // Small target raised to the level's minimum
  const min = disksForTarget(10, 100, "raid6", 180);
  assert.equal(min.byIops, 1);
  assert.equal(min.disks, 4);
  assert.ok(min.note && min.note.includes("minimum"));
  // RAID 1 cannot grow past two
  const r1 = disksForTarget(1000, 50, "raid1", 80);
  assert.equal(r1.disks, null);
  assert.equal(r1.delivers, null);
  // Decimal mix: floating noise must not add a disk
  assert.equal(ceilSafe(20.000000000000004), 20);
  assert.equal(ceilSafe(20.0001), 21);
  assert.equal(ceilSafe(0.3), 1);
  // Delivered IOPS always meet the target
  for (const level of RAID_LEVELS) {
    for (const mix of [0, 33.3, 66.7, 100]) {
      const sz = disksForTarget(12345, mix, level.id, 137);
      if (sz.delivers !== null) assert.ok(sz.delivers >= 12345 * (1 - 1e-9), `${level.id} ${mix}`);
    }
  }
});

test("reverse sizing by the common formula", () => {
  // 1000 IOPS, 70/30, RAID 5, 95 per disk: 95 * (0.7 + 0.3 / 4) = 73.625 per disk; 1000 / 73.625 = 13.58 -> 14
  assert.equal(disksForTargetShortcut(1000, 70, "raid5", 95), 14);
  assert.equal(disksForTarget(1000, 70, "raid5", 95).disks, 20);
  // Those 14 disks have 1330 operations a second against 1900 needed: 143 percent
  assert.ok(near(1900 / (14 * 95), 1.4285714285714286));
  // It is the exact inverse of shortcutIops: n disks from the answer deliver at least the target
  for (const level of RAID_LEVELS) {
    for (const mix of [0, 25, 70, 100]) {
      const n = disksForTargetShortcut(5000, mix, level.id, 140);
      if (n === null) continue;
      assert.ok(shortcutIops(n * 140, mix, level.penalty ?? raidInfo(level.id).penalty) >= 5000 * (1 - 1e-9), `${level.id} ${mix}`);
    }
  }
  // Never more disks than the balanced model asks for, and equal at the ends and for RAID 0
  for (const level of RAID_LEVELS) {
    for (const mix of [0, 10, 50, 70, 90, 100]) {
      const a = disksForTargetShortcut(12345, mix, level.id, 137);
      const b = disksForTarget(12345, mix, level.id, 137).disks;
      if (a === null || b === null) continue;
      assert.ok(a <= b, `${level.id} ${mix}`);
      if (mix === 0 || mix === 100 || level.id === "raid0") assert.equal(a, b, `${level.id} ${mix}`);
    }
  }
  // Level rules still apply: RAID 10 even, RAID 6 at least 4, RAID 1 capped at 2
  assert.equal(disksForTargetShortcut(10, 100, "raid6", 180), 4);
  assert.equal(disksForTargetShortcut(1000, 50, "raid1", 80), null);
  assert.equal(disksForTargetShortcut(100, 100, "raid1", 180), 2);
  assert.equal((disksForTargetShortcut(5000, 50, "raid10", 160) ?? 0) % 2, 0);
});

test("hard disk mechanics", () => {
  // 7200 rpm: half turn 4.1667 ms; + 8.5 ms seek -> 78.9 IOPS
  assert.ok(near(hddIops(7200, 8.5), 1000 / (8.5 + 30000 / 7200)));
  assert.equal(Math.round(hddIops(7200, 8.5)), 79);
  assert.equal(Math.round(hddIops(10000, 4)), 143);
  assert.equal(Math.round(hddIops(15000, 3.5)), 182);
});

test("parsing", () => {
  assert.deepEqual(parseDiskIops("180"), { kind: "ok", value: 180 });
  assert.deepEqual(parseDiskIops("100,000"), { kind: "ok", value: 100000 });
  assert.equal(parseDiskIops("10,00").kind, "error");
  assert.equal(parseDiskIops("0").kind, "error");
  assert.equal(parseDiskIops("").kind, "empty");
  assert.equal(parseDiskIops("-5").kind, "error");
  assert.equal(parseDiskIops("1e5").kind, "error");
  assert.equal(parseDiskIops("99999999").kind, "error");
  assert.equal(parseDiskIops("9".repeat(500)).kind, "error");
  assert.deepEqual(parseDiskCount("8"), { kind: "ok", value: 8 });
  assert.equal(parseDiskCount("0").kind, "error");
  assert.equal(parseDiskCount("2.5").kind, "error");
  assert.equal(parseDiskCount("100001").kind, "error");
  assert.equal(parseDiskCount("12345678901234567890").kind, "error");
  assert.deepEqual(parseReadPercent("70"), { kind: "ok", value: 70 });
  assert.deepEqual(parseReadPercent("70%"), { kind: "ok", value: 70 });
  assert.deepEqual(parseReadPercent("0"), { kind: "ok", value: 0 });
  assert.equal(parseReadPercent("101").kind, "error");
  assert.equal(parseReadPercent("abc").kind, "error");
  assert.deepEqual(parseTargetIops("5,000"), { kind: "ok", value: 5000 });
  assert.equal(parseTargetIops("0").kind, "error");
  assert.equal(parseTargetIops("2000000000").kind, "error");
  assert.deepEqual(parseSeekMs("8.5"), { kind: "ok", value: 8.5 });
  assert.equal(parseSeekMs("0").kind, "error");
  assert.equal(parseSeekMs("51").kind, "error");
});

test("formatting", () => {
  assert.equal(formatIops(757.894), "758");
  assert.equal(formatIops(1116), "1,116");
  assert.equal(formatIops(78.94), "78.9");
  assert.equal(formatIops(2.345), "2.35");
  assert.deepEqual(formatRate(80 * 4096), { si: "327.7 kB/s", iec: "320.0 KiB/s" });
  assert.equal(formatRate(0).si, "0 B/s");
  assert.equal(raidInfo("raid6").label, "RAID 6");
});


/* ------------------------------------------------------------------------
 * Independent verifier cases, worked by hand.
 *   balanced:   R / (r + w * P)
 *   functional: R * r + R * w / P   (the spec's formula)
 *   reverse:    ceil(target * (r + w * P) / perDisk), then level rules
 * --------------------------------------------------------------------- */

test("verifier: 10 x 140 IOPS RAID 10 at 60 percent reads", () => {
  const raw = 10 * 140;
  // 840 + 560 / 2 = 1120 by the functional formula
  assert.ok(near(shortcutIops(raw, 60, 2), 1120));
  // 1400 / (0.6 + 0.4 * 2) = 1400 / 1.4 = 1000 exactly
  assert.ok(near(frontEndIops(raw, 60, 2), 1000));
  const b = breakdown(raw, 60, "raid10");
  assert.ok(near(b.frontReads, 600) && near(b.frontWrites, 400));
  assert.ok(near(b.diskReads, 600) && near(b.diskWrites, 800));
});

test("verifier: 12 x 80 IOPS RAID 6 at 50/50", () => {
  // functional: 480 + 480 / 6 = 560; balanced: 960 / 3.5 = 274.29
  assert.ok(near(shortcutIops(960, 50, 6), 560));
  assert.ok(near(frontEndIops(960, 50, 6), 960 / 3.5));
  const b = breakdown(960, 50, "raid6");
  // each write: 3 reads and 3 writes
  assert.ok(near(b.diskReads, b.frontReads + 3 * b.frontWrites));
  assert.ok(near(b.diskWrites, 3 * b.frontWrites));
  assert.equal(formatIops(b.front), "274");
});

test("verifier: RAID 0 and the pure mixes", () => {
  assert.ok(near(frontEndIops(80000, 30, 1), 80000));
  assert.ok(near(shortcutIops(80000, 30, 1), 80000));
  // 100 percent writes to 8 x 180 RAID 5: 1440 / 4
  assert.ok(near(frontEndIops(1440, 0, 4), 360));
  // 100 percent reads: every disk serves reads, parity or not
  assert.ok(near(frontEndIops(1440, 100, 6), 1440));
});

test("verifier: reverse sizing reference values", () => {
  // 2000 at 80/20 on RAID 6: 2000 * (0.8 + 1.2) = 4000; / 140 = 28.57 -> 29
  const a = disksForTarget(2000, 80, "raid6", 140);
  assert.ok(near(a.backend, 4000));
  assert.equal(a.byIops, 29);
  assert.equal(a.disks, 29);
  assert.ok(a.delivers !== null && near(a.delivers, 2030));
  // 3000 at 50/50 on RAID 10, 180 per disk: 4500 / 180 = 25 -> 26 (even)
  const b = disksForTarget(3000, 50, "raid10", 180);
  assert.equal(b.byIops, 25);
  assert.equal(b.disks, 26);
  // functional formula: 180 * (0.5 + 0.25) = 135 per disk; 3000 / 135 = 22.2 -> 23 -> 24
  assert.equal(disksForTargetShortcut(3000, 50, "raid10", 180), 24);
  // exact division must not add a disk: 5000 at 100 percent reads, 100 per disk = 50
  assert.equal(disksForTarget(5000, 100, "raid0", 100).disks, 50);
  // 33.3 percent reads keeps float noise out of the count
  const c = disksForTarget(999, 33.3, "raid5", 111);
  assert.equal(c.byIops, Math.ceil((999 * (33.3 + 66.7 * 4)) / 100 / 111 - 1e-9));
});

test("verifier: ceilSafe snaps only float noise, at any magnitude", () => {
  assert.equal(ceilSafe(3), 3);
  assert.equal(ceilSafe((0.1 + 0.2) * 10), 3); // 3.0000000000000004
  assert.equal(ceilSafe(3.0000001), 4);
  assert.equal(ceilSafe(1e13 + 0.5), 1e13 + 1); // the old relative slack gave 9999999999991
  assert.equal(ceilSafe(6e13 + 3), 6e13 + 3);
  assert.equal(ceilSafe(123456789012.25), 123456789013);
  assert.equal(ceilSafe(0.000001), 1);
  // Adversarial sizing: tiny per-disk figure, huge target
  const s = disksForTarget(1e9, 0, "raid6", 0.0001);
  assert.equal(s.byIops, 6e13);
  assert.ok(Number.isFinite(s.delivers ?? 0));
});

test("verifier: hard disk estimates", () => {
  // 5400 rpm: 5.56 ms half turn + 12 ms seek -> 56.96
  assert.ok(near(hddIops(5400, 12), 1000 / (12 + 30000 / 5400)));
  assert.equal(Math.round(hddIops(5400, 12)), 57);
  // 10k rpm, 3.8 ms seek: 1000 / 6.8 = 147.06
  assert.ok(near(hddIops(10000, 3.8), 1000 / 6.8));
  // preset figures sit within 5 percent of their own mechanics
  assert.ok(Math.abs(hddIops(7200, 8.5) - 80) / 80 < 0.05);
  assert.ok(Math.abs(hddIops(10000, 4) - 140) / 140 < 0.05);
  assert.ok(Math.abs(hddIops(15000, 3.5) - 180) / 180 < 0.05);
});

test("verifier: throughput arithmetic", () => {
  // 758 IOPS x 4 KiB = 3,104,768 B/s
  assert.deepEqual(formatRate(758 * 4096), { si: "3.10 MB/s", iec: "2.96 MiB/s" });
  assert.deepEqual(formatRate(100000 * 65536), { si: "6.55 GB/s", iec: "6.10 GiB/s" });
  assert.equal(formatRate(Number.NaN).si, "0 B/s");
});

test("verifier: malformed input gives a message, never a throw", () => {
  for (const b of ["1 0", "1\u00a00", "1,0", "10,00", ",100", "100,", "1,00,000", "1.2.3", "+5", "0x10", "\u0661\u0662", "\uff11", "NaN", "Infinity", "\ud83d\ude00", "9".repeat(10000)]) {
    assert.equal(parseDiskIops(b).kind, "error", JSON.stringify(b.slice(0, 20)));
    assert.equal(parseDiskCount(b).kind, "error", `count ${JSON.stringify(b.slice(0, 20))}`);
  }
  assert.ok(parseDiskIops("1 0").kind === "error" && (parseDiskIops("1 0") as { message: string }).message.includes("spaces"));
  assert.ok((parseDiskIops("5,000 IOPS") as { message: string }).message.includes("plain number"));
  assert.deepEqual(parseDiskCount("1,000"), { kind: "ok", value: 1000 });
  assert.deepEqual(parseDiskCount(" 8 "), { kind: "ok", value: 8 });
  assert.equal(parseDiskCount("8 disks").kind, "error");
  assert.deepEqual(parseReadPercent("70 %"), { kind: "ok", value: 70 });
  assert.deepEqual(parseReadPercent("33.3"), { kind: "ok", value: 33.3 });
  assert.equal(parseReadPercent("7 0").kind, "error");
  assert.equal(parseReadPercent("%").kind, "empty");
  assert.equal(parseReadPercent("-1").kind, "error");
  assert.equal(parseReadPercent("100.0001").kind, "error");
  assert.deepEqual(parseTargetIops("1,000,000,000"), { kind: "ok", value: 1e9 });
  assert.equal(parseTargetIops("1,000,000,001").kind, "error");
  assert.deepEqual(parseSeekMs("0.1"), { kind: "ok", value: 0.1 });
  assert.deepEqual(parseSeekMs("50"), { kind: "ok", value: 50 });
  assert.equal(parseSeekMs("0.09").kind, "error");
  assert.equal(parseSeekMs("").kind, "empty");
  // Extremes of the accepted range stay finite
  const raw = 10_000_000 * 100_000;
  for (const level of RAID_LEVELS) {
    for (const mix of [0, 0.001, 50, 99.999, 100]) {
      assert.ok(Number.isFinite(frontEndIops(raw, mix, level.penalty)));
      assert.ok(Number.isFinite(frontEndIops(0.0001, mix, level.penalty)));
    }
  }
  assert.notEqual(diskCountProblem("raid1", 3), null);
  assert.ok((diskCountProblem("raid1", 4) ?? "").includes("RAID 10"));
});

console.log(`iops-calculator: ${passed} tests passed`);
