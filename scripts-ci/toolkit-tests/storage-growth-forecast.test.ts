import assert from "node:assert/strict";
import {
  addMonths,
  annualRate,
  autoHorizon,
  capacityAt,
  crossings,
  dateAtMonths,
  daysInMonth,
  doublingMonths,
  estimateFromTwoPoints,
  formatDate,
  isGrowing,
  levelReached,
  monthTickStep,
  monthsBetween,
  monthsToEmpty,
  monthsToReach,
  niceTicks,
  parseIsoDate,
  parseNumber,
  parseThresholds,
  projection,
  toIso,
  usedAt,
  type Growth,
} from "../../client/src/lib/toolkit/storage-growth-forecast";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Gregorian calendar.
assert.equal(daysInMonth(2024, 2), 29);
assert.equal(daysInMonth(2100, 2), 28);
assert.equal(daysInMonth(2000, 2), 29);
assert.equal(daysInMonth(2026, 11), 30);
assert.deepEqual(parseIsoDate("2026-10-31"), { y: 2026, m: 10, d: 31 });
assert.equal(parseIsoDate("2026-02-29"), null);
assert.equal(parseIsoDate("2024-02-29") !== null, true);
assert.equal(parseIsoDate("2026-13-01"), null);
assert.equal(parseIsoDate("not a date"), null);
assert.equal(parseIsoDate(""), null);

// addMonths clamps and does not chain.
const jan31 = { y: 2027, m: 1, d: 31 };
assert.equal(toIso(addMonths(jan31, 1)), "2027-02-28");
assert.equal(toIso(addMonths(jan31, 2)), "2027-03-31");
assert.equal(toIso(addMonths(jan31, 13)), "2028-02-29");
assert.equal(toIso(addMonths({ y: 2026, m: 10, d: 31 }, 3)), "2027-01-31");
assert.equal(toIso(addMonths({ y: 2026, m: 10, d: 15 }, -10)), "2025-12-15");

// Fractional months land in the right calendar month and invert.
const oct1 = { y: 2026, m: 10, d: 1 };
assert.equal(toIso(dateAtMonths(oct1, 0)), "2026-10-01");
assert.equal(toIso(dateAtMonths(oct1, 1)), "2026-11-01");
assert.equal(toIso(dateAtMonths(oct1, 1.5)), "2026-11-16"); // Nov has 30 days: +15
assert.equal(toIso(dateAtMonths(oct1, 0.999)), "2026-10-31");
close(monthsBetween(oct1, { y: 2026, m: 11, d: 16 }), 1.5);
close(monthsBetween(oct1, { y: 2027, m: 10, d: 1 }), 12);
close(monthsBetween({ y: 2027, m: 1, d: 31 }, { y: 2027, m: 2, d: 28 }), 1);
close(monthsBetween({ y: 2027, m: 1, d: 31 }, { y: 2027, m: 2, d: 14 }), 14 / 28);
close(monthsBetween({ y: 2027, m: 3, d: 1 }, { y: 2027, m: 1, d: 1 }), -2);
for (const t of [0, 0.25, 3.7, 11.01, 47.5]) {
  const d = dateAtMonths(oct1, t);
  const back = monthsBetween(oct1, d);
  assert.ok(back <= t + 1e-9 && t - back < 1 / 27, `${t} -> ${back}`);
}
assert.equal(formatDate({ y: 2027, m: 6, d: 9 }), "Jun 9, 2027");

// Parsing.
assert.deepEqual(parseNumber("1,500"), { ok: true, value: 1500 });
assert.deepEqual(parseNumber("-2.5"), { ok: true, value: -2.5 });
assert.deepEqual(parseNumber(""), { ok: true, value: null });
assert.equal(parseNumber("1e5").ok, false);
assert.equal(parseNumber("1,5").ok, false);
assert.equal(parseNumber("9".repeat(20)).ok, false);
assert.deepEqual(parseThresholds("90, 80"), { ok: true, value: [80, 90] });
assert.deepEqual(parseThresholds("80% 90% 80 100"), { ok: true, value: [80, 90] });
assert.deepEqual(parseThresholds(""), { ok: true, value: [] });
assert.equal(parseThresholds("abc").ok, false);
assert.equal(parseThresholds("0").ok, false);
assert.equal(parseThresholds("120").ok, false);
assert.equal(parseThresholds("10,20,30,40,50,60,70").ok, false);

// Linear model.
const lin: Growth = { model: "linear", perMonth: 1.5, rate: 0 };
assert.equal(usedAt(42, lin, 4), 48);
close(monthsToReach(42, lin, 48) as number, 4);
assert.equal(monthsToReach(50, lin, 48), 0);
assert.equal(monthsToReach(42, { model: "linear", perMonth: 0, rate: 0 }, 48), null);
assert.equal(monthsToReach(42, { model: "linear", perMonth: -1, rate: 0 }, 48), null);
assert.equal(monthsToEmpty(42, { model: "linear", perMonth: -2, rate: 0 }), 21);
assert.equal(monthsToEmpty(42, lin), null);
assert.equal(annualRate(lin), 18);

// Compound model: 5% a month doubles in ln2/ln1.05 = 14.2067 months, 79.59% a year.
const cmp: Growth = { model: "compound", perMonth: 0, rate: 0.05 };
close(doublingMonths(0.05) as number, Math.log(2) / Math.log(1.05));
close(doublingMonths(0.05) as number, 14.2067, 1e-4);
close(annualRate(cmp), Math.pow(1.05, 12) - 1);
close(annualRate(cmp), 0.795856, 1e-6);
close(monthsToReach(10, cmp, 20) as number, 14.2067, 1e-4);
close(usedAt(10, cmp, 2), 11.025);
assert.equal(monthsToReach(0, cmp, 20), null); // compound from zero
assert.equal(monthsToReach(10, { model: "compound", perMonth: 0, rate: 0 }, 20), null);
assert.equal(monthsToReach(10, { model: "compound", perMonth: 0, rate: -0.1 }, 20), null);
assert.equal(doublingMonths(0), null);

// Crossings without expansion: 42 of 60, +1.5/month. 80% = 48 (4 mo), 90% = 54 (8 mo), full = 60 (12 mo).
{
  const c = crossings(42, 60, lin, [80, 90], null);
  assert.equal(c.length, 3);
  close(c[0].base as number, 4);
  close(c[1].base as number, 8);
  close(c[2].base as number, 12);
  assert.equal(c[2].pct, 100);
  assert.equal(c[0].withExpansion, undefined);
}

// With expansion of +20 at month 6: 80% crossed at 4 (before), at 6 cap=80 -> 64 needed, again at (64-42)/1.5 = 14.667.
{
  const c = crossings(42, 60, lin, [80, 90], { atMonth: 6, add: 20 });
  const e80 = c[0].withExpansion!;
  assert.equal(e80.beforeExpansion, true);
  close(e80.first as number, 4);
  assert.equal(e80.stillAbove, false);
  close(e80.again as number, 22 / 1.5);
  const e90 = c[1].withExpansion!;
  assert.equal(e90.beforeExpansion, false);
  close(e90.first as number, (72 - 42) / 1.5);
  const full = c[2].withExpansion!;
  close(full.first as number, (80 - 42) / 1.5);
  // Too late: expansion at month 15 after full at 12.
  const late = crossings(42, 60, lin, [], { atMonth: 15, add: 20 })[0].withExpansion!;
  assert.equal(late.beforeExpansion, true);
  close(late.first as number, 12);
  close(late.again as number, (80 - 42) / 1.5);
  // Still above: tiny expansion. 80% of 61 = 48.8, reached at 4.533, before month 6.
  const tiny = crossings(42, 60, lin, [80], { atMonth: 6, add: 1 })[0].withExpansion!;
  assert.equal(tiny.stillAbove, true);
  assert.equal(tiny.again, null);
  // Expansion now (month 0) when already above: re-evaluated against new capacity.
  const now = crossings(55, 60, lin, [80], { atMonth: 0, add: 40 })[0];
  assert.equal(now.base, 0);
  assert.equal(now.withExpansion!.beforeExpansion, false);
  close(now.withExpansion!.first as number, (80 - 55) / 1.5);
  // Flat growth.
  const flat = crossings(42, 60, { model: "linear", perMonth: 0, rate: 0 }, [80], { atMonth: 3, add: 10 });
  assert.equal(flat[0].base, null);
  assert.equal(flat[0].withExpansion!.first, null);
}

// Capacity step and projection rows.
assert.equal(capacityAt(60, { atMonth: 6, add: 20 }, 5.99), 60);
assert.equal(capacityAt(60, { atMonth: 6, add: 20 }, 6), 80);
assert.equal(capacityAt(60, null, 100), 60);
{
  const rows = projection({ y: 2026, m: 10, d: 31 }, 42, 60, lin, { atMonth: 6, add: 20 }, 12);
  assert.equal(rows.length, 13);
  assert.equal(toIso(rows[4].date), "2027-02-28");
  assert.equal(rows[4].used, 48);
  close(rows[4].ratio, 0.8);
  assert.equal(rows[6].capacity, 80);
  assert.equal(rows[5].capacity, 60);
  assert.equal(projection(oct1, 1, 2, lin, null, 99999).length, 241);
  assert.equal(projection(oct1, 1, 2, lin, null, 0).length, 2);
}

// Two-point estimate: 30 on Oct 1 2025, 42 on Oct 1 2026 -> 1 per month, 12 months.
{
  const r = estimateFromTwoPoints({ y: 2025, m: 10, d: 1 }, 30, { y: 2026, m: 10, d: 1 }, 42);
  assert.ok(r.ok);
  if (r.ok) {
    close(r.value.months, 12);
    close(r.value.perMonth, 1);
    close(r.value.rate as number, Math.pow(42 / 30, 1 / 12) - 1);
    assert.equal(r.value.days, 365);
  }
  const zero = estimateFromTwoPoints({ y: 2026, m: 1, d: 1 }, 0, { y: 2026, m: 7, d: 1 }, 6);
  assert.ok(zero.ok && zero.value.rate === null);
  assert.equal(estimateFromTwoPoints(oct1, 1, oct1, 2).ok, false);
  assert.equal(estimateFromTwoPoints({ y: 2027, m: 1, d: 1 }, 1, oct1, 2).ok, false);
  const shrink = estimateFromTwoPoints({ y: 2026, m: 9, d: 1 }, 50, oct1, 45);
  assert.ok(shrink.ok && shrink.value.perMonth === -5 && (shrink.value.rate as number) < 0);
}

// Horizon and ticks.
{
  const c = crossings(42, 60, lin, [80, 90], null);
  assert.equal(autoHorizon(c), Math.ceil(12 * 1.2) + 1);
  assert.equal(autoHorizon(crossings(42, 60, { model: "linear", perMonth: 0, rate: 0 }, [80], null)), 36);
  assert.equal(autoHorizon(crossings(1, 60, { model: "linear", perMonth: 0.0001, rate: 0 }, [80], null)), 240);
  assert.deepEqual(niceTicks(60), [0, 20, 40, 60]);
  assert.deepEqual(niceTicks(100), [0, 25, 50, 75, 100]);
  assert.deepEqual(niceTicks(0), [0, 1]);
  assert.deepEqual(niceTicks(NaN), [0, 1]);
  const t = niceTicks(0.37);
  assert.ok(t[t.length - 1] >= 0.37 && t.length <= 6);
  assert.equal(monthTickStep(12), 2);
  assert.equal(monthTickStep(36), 6);
  assert.equal(monthTickStep(240), 60);
}

// Huge compound stays finite over the max horizon.
{
  const rows = projection(oct1, 1e15, 1e15, { model: "compound", perMonth: 0, rate: 10 }, null, 240);
  assert.ok(rows.every((r) => Number.isFinite(r.used)));
}
console.log("storage-growth-forecast: all tests passed");
{
  const rows = projection({ y: 2026, m: 1, d: 1 }, 10, 60, { model: "linear", perMonth: -4, rate: 0 }, null, 6);
  assert.equal(rows[2].used, 2);
  assert.equal(rows[3].used, 0);
  assert.equal(rows[6].used, 0);
  console.log("storage-growth-forecast: clamp test passed");
}

/* ------------------------------------------------ verifier: independent cases */
{
  // 1. 3% a month: (1.03)^12 - 1 = 42.576% a year; ln 2 / ln 1.03 = 23.4498 months to double.
  close(annualRate({ model: "compound", perMonth: 0, rate: 0.03 }), 0.4257608868, 1e-9);
  close(doublingMonths(0.03) as number, 23.44977, 1e-4);
  // 2% a month from 70% to 90%: ln(9/7) / ln(1.02) = 12.6910 months.
  close(monthsToReach(70, { model: "compound", perMonth: 0, rate: 0.02 }, 90) as number, 12.69098, 1e-4);
  // Rule-of-thumb check: 1% a month doubles in 69.66 months, not 72.
  close(doublingMonths(0.01) as number, 69.66072, 1e-4);

  // 2. Linear: 10 of 100 TB, 5 TB a month. 80% in 14 months, full in 18.
  const c = crossings(10, 100, { model: "linear", perMonth: 5, rate: 0 }, [80], null);
  close(c[0].base as number, 14);
  close(c[1].base as number, 18);

  // 3. Leap years: Jan 31 2024 + 1 month clamps to Feb 29; 2100 is not a leap year.
  const j = { y: 2024, m: 1, d: 31 };
  assert.equal(toIso(addMonths(j, 1)), "2024-02-29");
  assert.equal(toIso(addMonths({ y: 2100, m: 1, d: 31 }, 1)), "2100-02-28");
  assert.equal(toIso(addMonths({ y: 2000, m: 1, d: 31 }, 1)), "2000-02-29");
  // Month 0.5 from Jan 31 2024: the span to Feb 29 is 29 days, floor(14.5) = 14 days later.
  assert.equal(toIso(dateAtMonths(j, 0.5)), "2024-02-14");
  close(monthsBetween(j, { y: 2024, m: 2, d: 14 }), 14 / 29);
  // Dec to Jan crosses a year boundary.
  assert.equal(toIso(addMonths({ y: 2026, m: 12, d: 15 }, 1)), "2027-01-15");
  assert.equal(toIso(addMonths({ y: 2026, m: 1, d: 15 }, -1)), "2025-12-15");
  assert.equal(toIso(addMonths({ y: 2026, m: 3, d: 31 }, -1)), "2026-02-28");

  // 4. Two readings: 100 on Jan 1, 121 on Jul 1 (6 calendar months, 181 days).
  //    Linear 3.5 a month; compound 1.21^(1/6) - 1 = 3.2280% a month.
  const e = estimateFromTwoPoints({ y: 2026, m: 1, d: 1 }, 100, { y: 2026, m: 7, d: 1 }, 121);
  assert.ok(e.ok);
  if (e.ok) {
    close(e.value.months, 6);
    assert.equal(e.value.days, 181);
    close(e.value.perMonth, 3.5);
    close(e.value.rate as number, 0.0322801, 1e-6);
    // Projecting the compound estimate from 121 reaches 146.41 (1.21^2 * 100) in 6 more months.
    close(usedAt(121, { model: "compound", perMonth: 0, rate: e.value.rate as number }, 6), 146.41, 1e-9);
  }
  // Dates spanning many years stay consistent.
  close(monthsBetween({ y: 1900, m: 1, d: 1 }, { y: 9000, m: 1, d: 1 }), 7100 * 12);

  // 5. Shrinking usage with an expansion: above 80% now (55 of 60), down 1 a month.
  //    At month 20 usage is 35, below 80% of 61 (48.8), so it is not "still above".
  const s = crossings(55, 60, { model: "linear", perMonth: -1, rate: 0 }, [80], { atMonth: 20, add: 1 })[0];
  assert.equal(s.base, 0);
  assert.equal(s.withExpansion!.beforeExpansion, true);
  assert.equal(s.withExpansion!.stillAbove, false);
  assert.equal(s.withExpansion!.again, null);
  // Shrinking but still above at the expansion month: 55 down 0.1 a month is 54 at month 10, above 48.8.
  const s2 = crossings(55, 60, { model: "linear", perMonth: -0.1, rate: 0 }, [80], { atMonth: 10, add: 1 })[0];
  assert.equal(s2.withExpansion!.stillAbove, true);
  // Flat and already above: still above only if the new line is still under the usage.
  const f1 = crossings(55, 60, { model: "linear", perMonth: 0, rate: 0 }, [80], { atMonth: 3, add: 5 })[0];
  assert.equal(f1.withExpansion!.stillAbove, true); // 80% of 65 = 52 <= 55
  const f2 = crossings(55, 60, { model: "linear", perMonth: 0, rate: 0 }, [80], { atMonth: 3, add: 20 })[0];
  assert.equal(f2.withExpansion!.stillAbove, false); // 80% of 80 = 64 > 55
  assert.equal(f2.withExpansion!.again, null);
  // Compound shrink: 55 * 0.9^5 = 32.48 < 48.8.
  const cs = crossings(55, 60, { model: "compound", perMonth: 0, rate: -0.1 }, [80], { atMonth: 5, add: 1 })[0];
  assert.equal(cs.withExpansion!.stillAbove, false);
  // Growing case unchanged: crossing at exactly the expansion month counts as still above.
  const g = crossings(42, 60, { model: "linear", perMonth: 1.5, rate: 0 }, [80], { atMonth: 6, add: 0.75 })[0];
  close(48.6, 0.8 * 60.75);
  assert.equal(g.withExpansion!.stillAbove, true); // 80% of 60.75 = 48.6, reached at 4.4 <= 6

  // 6. levelReached agrees with the crossing arithmetic where * 100 rounds badly.
  assert.equal(0.29 * 100 >= 29, false); // the trap
  assert.equal(levelReached(29, 100, 29), true);
  assert.equal(levelReached(0.29, 1, 29), true);
  assert.equal(levelReached(28.999, 100, 29), false);
  assert.equal(monthsToReach(29, { model: "linear", perMonth: 1, rate: 0 }, (29 / 100) * 100), 0);
  assert.equal(isGrowing(10, { model: "compound", perMonth: 0, rate: 0.1 }), true);
  assert.equal(isGrowing(0, { model: "compound", perMonth: 0, rate: 0.1 }), false);
  assert.equal(isGrowing(10, { model: "linear", perMonth: 0, rate: 0 }), false);

  // 7. Malformed input never throws and is refused.
  for (const bad of ["1e3", "Infinity", "NaN", "0x10", "1.2.3", "\u221212", "\uff11\uff12", "12 TB", "--4", ".", "1,23"]) {
    assert.equal(parseNumber(bad).ok, false, `number ${bad}`);
  }
  assert.ok(Object.is((parseNumber("-0") as { value: number }).value, 0));
  assert.deepEqual(parseNumber("  .5 "), { ok: true, value: 0.5 });
  assert.deepEqual(parseNumber("1,000,000,000,000,000"), { ok: true, value: 1e15 });
  assert.equal(parseNumber("1,000,000,000,000,001").ok, false);
  for (const bad of ["2026-1-01", "2026-10-31T00:00", "\uff12\uff10\uff12\uff16-10-31", "1899-12-31", "9001-01-01", "2026-04-31", "2026-00-10"]) {
    assert.equal(parseIsoDate(bad), null, `date ${bad}`);
  }
  assert.deepEqual(parseThresholds("80,,90;95"), { ok: true, value: [80, 90, 95] });
  assert.deepEqual(parseThresholds("80 %"), { ok: true, value: [80] });
  assert.deepEqual(parseThresholds("0.5"), { ok: true, value: [0.5] });
  assert.deepEqual(parseThresholds("100"), { ok: true, value: [] });
  assert.deepEqual(parseThresholds("80, 80.0, 080"), { ok: true, value: [80] });
  for (const bad of ["-80", "1e2", "80%%", "eighty", "100.5", "\u0668\u0660", "9".repeat(9)]) {
    assert.equal(parseThresholds(bad).ok, false, `threshold ${bad}`);
  }
  assert.equal(parseThresholds("5 ".repeat(5000)).ok, false);

  // 8. Extremes stay finite and bounded.
  const huge = monthsToReach(1e-22, { model: "linear", perMonth: 1e-22, rate: 0 }, 1e15);
  assert.ok(huge !== null && Number.isFinite(huge) && huge > 1200);
  const tinyRate = monthsToReach(1, { model: "compound", perMonth: 0, rate: 1e-21 }, 2);
  assert.ok(tinyRate !== null && Number.isFinite(tinyRate));
  assert.equal(autoHorizon(crossings(1, 1e15, { model: "linear", perMonth: 1e-22, rate: 0 }, [], null)), 240);
  const p = projection({ y: 9000, m: 12, d: 31 }, 1, 2, { model: "linear", perMonth: 1, rate: 0 }, null, 240);
  assert.equal(toIso(p[240].date), "9020-12-31");
  assert.ok(niceTicks(1.5e15).every(Number.isFinite));
  assert.ok(niceTicks(1e-20).length <= 12);
  console.log("storage-growth-forecast: verifier cases passed");
}

/* ------------------------------------- verifier 2: further independent cases */
import { compoundRateProblem } from "../../client/src/lib/toolkit/storage-growth-forecast";
{
  // A. Compound rate guard.
  assert.equal(compoundRateProblem(0.05), null);
  assert.equal(compoundRateProblem(10), null); // exactly 1000% a month is the cap
  assert.equal(compoundRateProblem(-0.5), null);
  assert.equal(compoundRateProblem(0), null);
  assert.ok(compoundRateProblem(10.0001));
  assert.ok(compoundRateProblem(Infinity));
  assert.ok(compoundRateProblem(NaN));
  assert.ok(compoundRateProblem(-1));
  assert.ok(compoundRateProblem(-1.5));
  // Two readings a day apart with a vast ratio imply an infinite rate; underflow implies -100%.
  const inf = estimateFromTwoPoints({ y: 2026, m: 10, d: 30 }, 1e-20, { y: 2026, m: 10, d: 31 }, 42);
  assert.ok(inf.ok && inf.value.rate === Infinity && compoundRateProblem(inf.value.rate) !== null);
  const under = estimateFromTwoPoints({ y: 2026, m: 10, d: 30 }, 42, { y: 2026, m: 10, d: 31 }, 1e-20);
  assert.ok(under.ok && compoundRateProblem(under.value.rate as number) !== null);
  // 1 to 60 in 30 days of October (0.9677 months) is ~6777% a month: refused.
  const fast = estimateFromTwoPoints({ y: 2026, m: 10, d: 1 }, 1, { y: 2026, m: 10, d: 31 }, 60);
  assert.ok(fast.ok);
  if (fast.ok) {
    close(fast.value.months, 30 / 31);
    close(fast.value.rate as number, Math.pow(60, 31 / 30) - 1, 1e-9);
    assert.ok(compoundRateProblem(fast.value.rate as number));
  }

  // B. 10% a month doubles in ln 2 / ln 1.1 = 7.27254 months; a year is 1.1^12 - 1 = 213.84%.
  close(monthsToReach(50, { model: "compound", perMonth: 0, rate: 0.1 }, 100) as number, 7.272540897, 1e-8);
  close(annualRate({ model: "compound", perMonth: 0, rate: 0.1 }), 2.138428376721, 1e-9);
  // -10% a month halves in ln 2 / -ln 0.9 = 6.57881 months.
  close(Math.LN2 / -Math.log1p(-0.1), 6.578813478, 1e-8);
  close(usedAt(100, { model: "compound", perMonth: 0, rate: -0.1 }, 2), 81, 1e-12);

  // C. Linear from empty: 0 of 100, 2.5 a month. 80% in 32 months, full in 40.
  const fromZero = crossings(0, 100, { model: "linear", perMonth: 2.5, rate: 0 }, [80], null);
  close(fromZero[0].base as number, 32);
  close(fromZero[1].base as number, 40);
  // Exactly at a threshold now counts as reached (month 0).
  assert.equal(crossings(48, 60, { model: "linear", perMonth: 1.5, rate: 0 }, [80], null)[0].base, 0);

  // D. Calendar placement. As of Oct 31 2026: month 3 is Jan 31 2027, month 4 is Feb 28 2027
  //    (clamped), so month 3.5 is 14 of the 28 days into that span: Feb 14 2027.
  const oct31 = { y: 2026, m: 10, d: 31 };
  assert.equal(toIso(dateAtMonths(oct31, 3.5)), "2027-02-14");
  assert.equal(toIso(dateAtMonths(oct31, 4)), "2027-02-28");
  // Default example: 80% of 60 at month 4 lands on Feb 28 2027.
  assert.equal(formatDate(dateAtMonths(oct31, crossings(42, 60, lin, [80], null)[0].base as number)), "Feb 28, 2027");
  // Leap day anchor: Feb 29 2024 plus 12 months is Feb 28 2025, exactly 12 months.
  assert.equal(toIso(addMonths({ y: 2024, m: 2, d: 29 }, 12)), "2025-02-28");
  close(monthsBetween({ y: 2024, m: 2, d: 29 }, { y: 2025, m: 2, d: 28 }), 12);
  // 2000 is a leap year, 1900 is not.
  assert.equal(daysInMonth(1900, 2), 28);
  assert.equal(parseIsoDate("1900-02-29"), null);
  assert.ok(parseIsoDate("2000-02-29"));

  // E. Compound with expansion: 50 of 100 at 5% a month. 80% at ln 1.6 / ln 1.05 = 9.6332 months,
  //    before +100 at month 12; against 200 the 80% line (160) is reached at ln 3.2 / ln 1.05 = 23.840.
  const ce = crossings(50, 100, { model: "compound", perMonth: 0, rate: 0.05 }, [80], { atMonth: 12, add: 100 });
  close(ce[0].base as number, Math.log(1.6) / Math.log(1.05));
  assert.equal(ce[0].withExpansion!.beforeExpansion, true);
  assert.equal(ce[0].withExpansion!.stillAbove, false);
  close(ce[0].withExpansion!.again as number, Math.log(3.2) / Math.log(1.05));
  close(ce[0].withExpansion!.again as number, 23.8399, 1e-4);
  // Full (100) at ln 2 / ln 1.05 = 14.2067 is after month 12, so it is against 200: ln 4 / ln 1.05 = 28.413.
  assert.equal(ce[1].withExpansion!.beforeExpansion, false);
  close(ce[1].withExpansion!.first as number, Math.log(4) / Math.log(1.05));
  // Expansion at month 0 applies to the first projection row.
  const rows0 = projection(oct31, 50, 100, lin, { atMonth: 0, add: 100 }, 3);
  assert.equal(rows0[0].capacity, 200);
  close(rows0[0].ratio, 0.25);

  // F. Unit facts used in the notes: TiB/TB and PiB/PB.
  close(2 ** 40 / 1e12, 1.0995, 1e-4);
  close(2 ** 50 / 1e15, 1.1259, 1e-4);

  // G. Malformed numbers never throw.
  for (const bad of [" 12 x", "12​", "1_000", "١٢", "1.5.", "+-1", "%", "x".repeat(100000)]) {
    assert.equal(parseNumber(bad).ok, false, `number ${bad.slice(0, 10)}`);
  }
  assert.deepEqual(parseNumber("   "), { ok: true, value: null });
  assert.deepEqual(parseThresholds("   "), { ok: true, value: [] });
  console.log("storage-growth-forecast: verifier 2 cases passed");
}
