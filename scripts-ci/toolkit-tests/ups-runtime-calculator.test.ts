import assert from "node:assert/strict";
import {
  LOAD_STEPS,
  batteryWh,
  checkBankWh,
  estimateRuntime,
  formatHours,
  formatNum,
  formatPct,
  parse,
  ratingCheck,
} from "../../client/src/lib/toolkit/ups-runtime-calculator.ts";

function close(actual: number, expected: number, rel: number, msg: string) {
  const err = Math.abs(actual - expected) / Math.abs(expected);
  assert.ok(err <= rel, `${msg}: got ${actual}, expected ${expected} (rel err ${err})`);
}

const base = { efficiency: 1, dod: 1, health: 1, ratedHours: 20 };

/* Textbook Peukert: 100 Ah at the 20 h rate, k = 1.2. t = 20 * (100 / (I * 20))^1.2. With V = 12, E = 1200 Wh. */
{
  const at10A = estimateRuntime({ ...base, capacityWh: 1200, loadW: 120, peukert: 1.2 });
  close(at10A.peukertHours!, 20 * 0.5 ** 1.2, 1e-12, "10 A");
  close(at10A.peukertHours!, 8.7055, 1e-4, "10 A value");
  close(at10A.capacityFraction!, 0.5 ** 0.2, 1e-12, "10 A capacity share");
  close(at10A.linearHours, 10, 1e-12, "10 A linear");
  assert.equal(at10A.clamped, false);

  const at20A = estimateRuntime({ ...base, capacityWh: 1200, loadW: 240, peukert: 1.2 });
  close(at20A.peukertHours!, 3.7893, 1e-4, "20 A value");

  // At exactly the rated current the law returns the rated time.
  const at5A = estimateRuntime({ ...base, capacityWh: 1200, loadW: 60, peukert: 1.2 });
  close(at5A.peukertHours!, 20, 1e-12, "rated current");

  // Slower than rated: held at the linear figure rather than the 45.9 h the law would claim.
  const slow = estimateRuntime({ ...base, capacityWh: 1200, loadW: 30, peukert: 1.2 });
  assert.equal(slow.clamped, true);
  close(slow.peukertHours!, 40, 1e-12, "clamped");
}

/* k = 1 reduces Peukert to the linear figure. */
{
  const r = estimateRuntime({ capacityWh: 216, efficiency: 0.9, loadW: 500, dod: 0.8, health: 1, peukert: 1, ratedHours: 20 });
  close(r.peukertHours!, r.linearHours, 1e-12, "k = 1");
}

/* Linear: 1000 Wh, 90% inverter, 50% DoD, 300 W -> 1.5 h. */
{
  const r = estimateRuntime({ capacityWh: 1000, efficiency: 0.9, loadW: 300, dod: 0.5, health: 1, peukert: null, ratedHours: 20 });
  close(r.linearHours, 1.5, 1e-12, "linear");
  assert.equal(r.peukertHours, null);
  close(r.dcWatts, 300 / 0.9, 1e-12, "dc watts");
  close(r.usableWh, 500, 1e-12, "usable");
}

/* The default page: 2 x 12 V 9 Ah, 500 W, 90%, 80% DoD, k = 1.1, C20. */
{
  const wh = batteryWh(12, 9, 2);
  assert.equal(wh, 216);
  const r = estimateRuntime({ capacityWh: wh, efficiency: 0.9, loadW: 500, dod: 0.8, health: 1, peukert: 1.1, ratedHours: 20 });
  close(r.linearHours, (216 * 0.8 * 0.9) / 500, 1e-12, "default linear");
  const ratio = 216 / ((500 / 0.9) * 20);
  close(r.peukertHours!, 20 * ratio ** 1.1 * 0.8, 1e-12, "default peukert");
  assert.equal(formatHours(r.linearHours), "18 min 40 s");
  // Half the load gives more than twice the Peukert runtime: the nonlinearity.
  const half = estimateRuntime({ capacityWh: wh, efficiency: 0.9, loadW: 250, dod: 0.8, health: 1, peukert: 1.1, ratedHours: 20 });
  close(half.peukertHours! / r.peukertHours!, 2 ** 1.1, 1e-12, "half load ratio");
  // Aging scales the usable energy, and under Peukert by health^k.
  const aged = estimateRuntime({ capacityWh: wh, efficiency: 0.9, loadW: 500, dod: 0.8, health: 0.8, peukert: 1.1, ratedHours: 20 });
  close(aged.peukertHours! / r.peukertHours!, 0.8 ** 1.1, 1e-12, "aged ratio");
  close(aged.linearHours / r.linearHours, 0.8, 1e-12, "aged linear");
}

/* Rating check: load must fit both W and VA. */
{
  const ok = ratingCheck(800, 800 / 0.6, 900, 1500);
  assert.equal(ok.fits, true);
  const overW = ratingCheck(950, 950 / 0.9, 900, 1500);
  assert.equal(overW.fitsW, false);
  assert.equal(overW.fitsVA, true);
  assert.equal(overW.fits, false);
  assert.equal(overW.limiting, "W");
  const overVA = ratingCheck(700, 700 / 0.45, 900, 1500);
  assert.equal(overVA.fitsW, true);
  assert.equal(overVA.fitsVA, false);
  assert.equal(overVA.fits, false);
  assert.equal(overVA.limiting, "VA");
  const none = ratingCheck(700, 800, null, null);
  assert.equal(none.fits, null);
  assert.equal(none.limiting, null);
  const onlyVA = ratingCheck(700, 800, null, 1000);
  assert.equal(onlyVA.fits, true);
  assert.equal(onlyVA.limiting, "VA");
  close(onlyVA.vaFraction!, 0.8, 1e-12, "va fraction");
}

/* Formatting. */
assert.equal(formatHours(0.31104), "18 min 40 s");
assert.equal(formatHours(3.2), "3 h 12 min");
assert.equal(formatHours(52), "2 days 4 h");
assert.equal(formatHours(0.9999999), "1 h");
assert.equal(formatHours(Infinity), "--");
assert.equal(formatHours(1e9), "more than 100 years");
assert.equal(formatNum(555.555), "556");
assert.equal(formatNum(1500), "1,500");
assert.equal(formatNum(0.31104), "0.311");
assert.equal(formatPct(0.5537), "55%");
assert.equal(formatPct(0.004), "0.4%");
assert.equal(formatPct(1.333), "133%");
assert.deepEqual(LOAD_STEPS, [0.25, 0.5, 1, 1.5, 2]);

/* Parsing. */
assert.deepEqual(parse.wh("216"), { kind: "ok", value: 216 });
assert.deepEqual(parse.wh(""), { kind: "empty" });
assert.equal(parse.wh("0").kind, "error");
assert.equal(parse.wh("1e8").kind, "error");
assert.equal(parse.wh("abc").kind, "error");
assert.equal(parse.count("2.5").kind, "error");
assert.deepEqual(parse.count("4"), { kind: "ok", value: 4 });
const pf = parse.powerFactor("1.2");
assert.ok(pf.kind === "error" && pf.message.startsWith("A power factor cannot exceed 1"));
assert.deepEqual(parse.powerFactor("1"), { kind: "ok", value: 1 });
assert.equal(parse.powerFactor("0").kind, "error");
const k = parse.peukert("0.9");
assert.ok(k.kind === "error" && k.message.includes("below 1"));
assert.equal(parse.peukert("2.5").kind, "error");
assert.deepEqual(parse.peukert("1.15"), { kind: "ok", value: 1.15 });
assert.equal(parse.percent("101", "Inverter efficiency", "90").kind, "error");
assert.equal(parse.percent("0", "Inverter efficiency", "90").kind, "error");
assert.deepEqual(parse.percent("100", "Inverter efficiency", "90"), { kind: "ok", value: 100 });
assert.equal(parse.load("-5", "W").kind, "error");
assert.equal(parse.load("1,5", "W").kind, "error");
assert.deepEqual(parse.load("1,500", "VA"), { kind: "ok", value: 1500 });
assert.equal(parse.load("9".repeat(50), "W").kind, "error");

/* Adversarial extremes stay finite. */
{
  const r = estimateRuntime({ capacityWh: 1e7, efficiency: 0.01, loadW: 1e7, dod: 1, health: 1, peukert: 2, ratedHours: 1000 });
  assert.ok(Number.isFinite(r.peukertHours!) && r.peukertHours! >= 0);
  const r2 = estimateRuntime({ capacityWh: 1e-9, efficiency: 1, loadW: 1e7, dod: 1e-9, health: 1e-9, peukert: 2, ratedHours: 1e-9 });
  assert.ok(Number.isFinite(r2.peukertHours!) && r2.peukertHours! >= 0);
  assert.equal(formatHours(r2.peukertHours!), "under 1 s");
  const r3 = estimateRuntime({ capacityWh: 1e7, efficiency: 1, loadW: 1e-9, dod: 1, health: 1, peukert: 1.3, ratedHours: 20 });
  assert.equal(formatHours(r3.peukertHours!), "more than 100 years");
}


/* ---------------------------------------------- verifier: independent cases */

/* Linear: one 12 V 7 Ah battery (84 Wh), 100 W, 85 percent inverter, full discharge: 0.714 h = 2570.4 s. */
{
  const r = estimateRuntime({ capacityWh: batteryWh(12, 7, 1), efficiency: 0.85, loadW: 100, dod: 1, health: 1, peukert: null, ratedHours: 20 });
  close(r.linearHours, 0.714, 1e-12, "84 Wh at 100 W");
  assert.equal(formatHours(r.linearHours), "42 min 50 s");
}
/* Peukert: 200 Ah at C20, k = 1.25, 40 A at 12 V (480 W): t = 20 * 0.25^1.25 = 20 * 2^-2.5 = 3.5355339 h. */
{
  const r = estimateRuntime({ capacityWh: 2400, efficiency: 1, loadW: 480, dod: 1, health: 1, peukert: 1.25, ratedHours: 20 });
  close(r.peukertHours!, 20 * 2 ** -2.5, 1e-12, "200 Ah k=1.25");
  close(r.peukertHours!, 3.5355339, 1e-7, "200 Ah k=1.25 value");
  close(r.capacityFraction!, 0.25 ** 0.25, 1e-12, "capacity share");
  close(r.rateRatio, 0.25, 1e-12, "rate ratio");
}
/* Peukert at a C10 rating: 100 Ah, k = 1.3, 20 A: t = 10 * 0.5^1.3 = 4.0612619 h. */
{
  const r = estimateRuntime({ capacityWh: 1200, efficiency: 1, loadW: 240, dod: 1, health: 1, peukert: 1.3, ratedHours: 10 });
  close(r.peukertHours!, 4.0612619, 1e-7, "C10 k=1.3");
}
/* Peukert's invariant: I^k * t is the same at every current above the rated one. */
{
  const k = 1.15;
  const loads = [100, 300, 900, 2700];
  const inv = loads.map((w) => {
    const r = estimateRuntime({ capacityWh: 1000, efficiency: 1, loadW: w, dod: 1, health: 1, peukert: k, ratedHours: 20 });
    return w ** k * r.peukertHours!;
  });
  for (const v of inv) close(v, inv[0], 1e-12, "I^k t constant");
}
/* Continuity at the rated rate: just faster than rated is a hair below the linear figure, never above it. */
{
  const at = estimateRuntime({ capacityWh: 1200, efficiency: 1, loadW: 60, dod: 0.5, health: 1, peukert: 1.3, ratedHours: 20 });
  close(at.peukertHours!, at.linearHours, 1e-12, "rated rate");
  const faster = estimateRuntime({ capacityWh: 1200, efficiency: 1, loadW: 60.001, dod: 0.5, health: 1, peukert: 1.3, ratedHours: 20 });
  assert.equal(faster.clamped, false);
  assert.ok(faster.peukertHours! <= faster.linearHours);
  close(faster.peukertHours!, faster.linearHours, 1e-4, "continuity");
}
/* Peukert never beats the linear figure. */
for (const w of [10, 50, 200, 1000, 5000]) {
  const r = estimateRuntime({ capacityWh: 500, efficiency: 0.9, loadW: w, dod: 0.8, health: 0.9, peukert: 1.2, ratedHours: 20 });
  assert.ok(r.peukertHours! <= r.linearHours * (1 + 1e-12), `peukert <= linear at ${w} W`);
}

/* Rating check boundaries. 1500 VA / 900 W: a 900 W load at PF 0.6 is exactly 1500 VA, both at 100 percent, which fits. */
{
  const tie = ratingCheck(900, 900 / 0.6, 900, 1500);
  assert.equal(tie.fits, true);
  close(tie.wFraction!, 1, 1e-12, "tie W");
  close(tie.vaFraction!, 1, 1e-12, "tie VA");
  const over = ratingCheck(1000 * 0.95, 1000, 900, 1500);
  assert.equal(over.fitsW, false);
  assert.equal(over.fitsVA, true);
  const onlyW = ratingCheck(901, 1000, 900, null);
  assert.equal(onlyW.fits, false);
  assert.equal(onlyW.vaFraction, null);
  assert.equal(onlyW.limiting, "W");
}

/* Bank product limits. */
assert.deepEqual(checkBankWh(216), { kind: "ok", value: 216 });
assert.equal(checkBankWh(1e7 + 1).kind, "error");
assert.equal(checkBankWh(1e-300 * 1e-300).kind, "error");
assert.equal(checkBankWh(Number.POSITIVE_INFINITY).kind, "error");
assert.equal(checkBankWh(Number.NaN).kind, "error");

/* Formatting boundaries. */
assert.equal(formatHours(0.5), "30 min");
assert.equal(formatHours(1 / 120), "30 s");
assert.equal(formatHours(24), "1 day");
assert.equal(formatHours(-1), "--");
assert.equal(formatHours(Number.NaN), "--");
assert.equal(formatNum(Number.NaN), "--");
assert.equal(formatPct(Number.POSITIVE_INFINITY), "--");

/* Malformed and adversarial input: always a Parsed value, never a throw. */
for (const raw of ["1.2.3", "１２", "12W", "NaN", "Infinity", "0x10", "1e", ".", "\u221212", "\u20145", "😀", "1,,000", "١٢"]) {
  assert.equal(parse.load(raw, "W").kind, "error", `load ${JSON.stringify(raw)}`);
  assert.equal(parse.wh(raw).kind, "error", `wh ${JSON.stringify(raw)}`);
  assert.equal(parse.powerFactor(raw).kind, "error", `pf ${JSON.stringify(raw)}`);
}
assert.deepEqual(parse.load("  ", "W"), { kind: "empty" });
assert.deepEqual(parse.load("+500", "W"), { kind: "ok", value: 500 });
assert.equal(parse.load("1e-400", "W").kind, "error");
assert.equal(parse.load("0.001", "W").kind, "error");
assert.deepEqual(parse.load("0.01", "W"), { kind: "ok", value: 0.01 });
assert.equal(parse.wh("0.001").kind, "error");
assert.equal(parse.powerFactor("0.05").kind, "error");
assert.deepEqual(parse.powerFactor("0.1"), { kind: "ok", value: 0.1 });
assert.equal(parse.percent("0.05", "Battery health", "100").kind, "error");
assert.equal(parse.count("0").kind, "error");
assert.equal(parse.count("1001").kind, "error");
assert.equal(parse.ratedHours("0").kind, "error");
assert.deepEqual(parse.peukert("1"), { kind: "ok", value: 1 });
assert.deepEqual(parse.peukert("2"), { kind: "ok", value: 2 });

/* Every extreme the parsers allow gives finite or cleanly formatted output. */
{
  const lo = { capacityWh: 0.01, efficiency: 0.001, loadW: 1e7, dod: 0.001, health: 0.001, peukert: 2, ratedHours: 1000 };
  const r = estimateRuntime(lo);
  assert.ok(Number.isFinite(r.linearHours) && r.linearHours >= 0);
  assert.ok(Number.isFinite(r.peukertHours!) && r.peukertHours! >= 0);
  assert.ok(Number.isFinite(1 / r.rateRatio));
  const hi = { capacityWh: 1e7, efficiency: 1, loadW: 0.01, dod: 1, health: 1, peukert: 1.3, ratedHours: 0.001 };
  const r2 = estimateRuntime(hi);
  assert.equal(r2.clamped, true);
  assert.equal(formatHours(r2.linearHours), "more than 100 years");
}

console.log("ups-runtime-calculator: all tests passed");
