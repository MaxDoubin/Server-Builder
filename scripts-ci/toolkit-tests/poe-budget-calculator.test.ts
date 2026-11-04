import assert from "node:assert/strict";
import {
  POE_CLASSES,
  PSE_TYPES,
  analyzeBudget,
  analyzeLine,
  cableLoss,
  parseCount,
  parseDecimal,
  parseWattsMw,
  poeClass,
  worstCaseFor,
} from "../../client/src/lib/toolkit/poe-budget-calculator";

// Class table, IEEE 802.3 Clause 33 / 145.
const expected: [number, number, number][] = [
  [0, 15.4, 12.95], [1, 4.0, 3.84], [2, 7.0, 6.49], [3, 15.4, 12.95], [4, 30, 25.5],
  [5, 45, 40], [6, 60, 51], [7, 75, 62], [8, 90, 71.3],
];
for (const [cls, pse, pd] of expected) {
  assert.equal(poeClass(cls).pseMw, Math.round(pse * 1000));
  assert.equal(poeClass(cls).pdMw, Math.round(pd * 1000));
}
assert.equal(POE_CLASSES.length, 9);
assert.equal(poeClass(99).cls, 8);
assert.equal(poeClass(-3).cls, 0);
assert.equal(poeClass(NaN).cls, 0);

// Cable loss reproduces the standard's PSE figures at worst case.
for (const c of POE_CLASSES) {
  const wc = worstCaseFor(c.cls);
  const r = cableLoss({ pdW: c.pdMw / 1000, lengthM: 100, voltage: wc.voltage, loopOhmsPer100m: wc.loopOhmsPer100m, pairs: wc.pairs });
  assert.ok(r.ok, `class ${c.cls}`);
  if (r.ok) assert.ok(Math.abs(r.value.pseW - c.pseMw / 1000) < 0.1, `class ${c.cls}: ${r.value.pseW}`);
}
// Exact cases: Type 1 350 mA through 20 ohm = 2.45 W; Type 2 600 mA through 12.5 ohm = 4.5 W.
{
  const r = cableLoss({ pdW: 12.95, lengthM: 100, voltage: 44, loopOhmsPer100m: 20, pairs: 2 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.ok(Math.abs(r.value.currentA - 0.35) < 1e-9);
    assert.ok(Math.abs(r.value.lossW - 2.45) < 1e-9);
    assert.ok(Math.abs(r.value.pseW - 15.4) < 1e-9);
  }
  const t2 = cableLoss({ pdW: 25.5, lengthM: 100, voltage: 50, loopOhmsPer100m: 12.5, pairs: 2 });
  assert.ok(t2.ok);
  if (t2.ok) {
    assert.ok(Math.abs(t2.value.currentA - 0.6) < 1e-9);
    assert.ok(Math.abs(t2.value.lossW - 4.5) < 1e-9);
  }
  const t3 = cableLoss({ pdW: 51, lengthM: 100, voltage: 50, loopOhmsPer100m: 12.5, pairs: 4 });
  assert.ok(t3.ok);
  if (t3.ok) {
    assert.ok(Math.abs(t3.value.perPairSetA - 0.6) < 1e-9);
    assert.ok(Math.abs(t3.value.pseW - 60) < 1e-9);
  }
  // Zero length: no loss.
  const z = cableLoss({ pdW: 20, lengthM: 0, voltage: 50, loopOhmsPer100m: 12.5, pairs: 2 });
  assert.ok(z.ok);
  if (z.ok) assert.equal(z.value.lossW, 0);
  // Half length halves resistance.
  const h = cableLoss({ pdW: 25.5, lengthM: 50, voltage: 50, loopOhmsPer100m: 12.5, pairs: 2 });
  assert.ok(h.ok);
  if (h.ok) {
    assert.equal(h.value.loopOhms, 6.25);
    assert.ok(h.value.lossW < 4.5 / 2 + 0.01 && h.value.lossW > 1);
  }
  // Impossible: more than V^2/4R.
  const bad = cableLoss({ pdW: 100, lengthM: 100, voltage: 44, loopOhmsPer100m: 20, pairs: 2 });
  assert.equal(bad.ok, false);
  assert.equal(cableLoss({ pdW: NaN, lengthM: 1, voltage: 50, loopOhmsPer100m: 1, pairs: 2 }).ok, false);
  assert.equal(cableLoss({ pdW: 0, lengthM: 1, voltage: 50, loopOhmsPer100m: 1, pairs: 2 }).ok, false);
}

// Parsing.
assert.deepEqual(parseDecimal(""), { ok: true, value: null });
assert.deepEqual(parseDecimal("1,500.5"), { ok: true, value: 1500.5 });
assert.equal(parseDecimal("1,5").ok, false);
assert.equal(parseDecimal("12abc").ok, false);
assert.equal(parseDecimal("9".repeat(400)).ok, false);
assert.deepEqual(parseWattsMw("370", { label: "budget", max: 100000, required: true }), { ok: true, value: 370000 });
assert.deepEqual(parseWattsMw("4.125", { label: "draw", max: 100, required: false, allowZero: true }), { ok: true, value: 4125 });
assert.equal(parseWattsMw("", { label: "budget", max: 100000, required: true }).ok, false);
assert.equal(parseWattsMw("-1", { label: "budget", max: 100000, required: true }).ok, false);
assert.equal(parseWattsMw("0", { label: "budget", max: 100000, required: true }).ok, false);
assert.equal(parseWattsMw("200000", { label: "budget", max: 100000, required: true }).ok, false);
assert.deepEqual(parseCount("24", { label: "ports", min: 1, max: 1000, required: false, example: 24 }), { ok: true, value: 24 });
assert.deepEqual(parseCount("", { label: "ports", min: 1, max: 1000, required: false, example: 24 }), { ok: true, value: null });
assert.equal(parseCount("2.5", { label: "ports", min: 1, max: 1000, required: false, example: 24 }).ok, false);
assert.equal(parseCount("0", { label: "qty", min: 1, max: 1000, required: true, example: 1 }).ok, false);

// Sums stay exact in mW: three class 0 devices on a 46.2 W budget fit exactly.
{
  const r = analyzeBudget({ budgetMw: 46200, ports: 3, pseType: 2 }, [{ name: "a", qty: 3, cls: 0, measuredMw: null }]);
  assert.equal(r.allocMw, 46200);
  assert.equal(r.allocOver, false);
  assert.equal(r.allocHeadroomMw, 0);
}

// Demotion: class 6 on a Type 2 port reserves 30 W.
{
  const l = analyzeLine({ name: "ptz", qty: 1, cls: 6, measuredMw: null }, 2);
  assert.equal(l.demoted, true);
  assert.equal(l.assignedClass, 4);
  assert.equal(l.allocEachMw, 30000);
  assert.ok(l.flags.some((f) => f.level === "warn"));
  // class 4 on an af port -> treated as class 0, 15.4 W
  const af = analyzeLine({ name: "ap", qty: 1, cls: 4, measuredMw: null }, 1);
  assert.equal(af.allocEachMw, 15400);
  assert.equal(af.assignedClass, 0);
  // class 8 on Type 3 -> class 6
  assert.equal(analyzeLine({ name: "x", qty: 1, cls: 8, measuredMw: null }, 3).allocEachMw, 60000);
  // no demotion when it fits
  assert.equal(analyzeLine({ name: "x", qty: 1, cls: 2, measuredMw: null }, 4).demoted, false);
}

// Measured over class and over port.
{
  const over = analyzeLine({ name: "ap", qty: 1, cls: 4, measuredMw: 31000 }, 3);
  assert.ok(over.flags.some((f) => f.level === "danger" && /class 4/.test(f.text)));
  const port = analyzeLine({ name: "ap", qty: 1, cls: 4, measuredMw: 31000 }, 2);
  assert.ok(port.flags.some((f) => f.level === "danger" && /port can output/.test(f.text)));
  const fine = analyzeLine({ name: "ap", qty: 1, cls: 4, measuredMw: 17500 }, 2);
  assert.equal(fine.flags.length, 0);
  assert.equal(fine.actualEachMw, 17500);
}

// The worked example: 24 port Type 3 switch, 370 W.
{
  const r = analyzeBudget({ budgetMw: 370000, ports: 24, pseType: 3 }, [
    { name: "Phones", qty: 12, cls: 2, measuredMw: 4100 },
    { name: "APs", qty: 6, cls: 4, measuredMw: 17500 },
    { name: "Cameras", qty: 4, cls: 3, measuredMw: 6200 },
    { name: "PTZ", qty: 1, cls: 6, measuredMw: 38000 },
  ]);
  assert.equal(r.devices, 23);
  assert.equal(r.allocMw, 12 * 7000 + 6 * 30000 + 4 * 15400 + 60000);
  assert.equal(r.allocMw, 385600);
  assert.equal(r.actualMw, 12 * 4100 + 6 * 17500 + 4 * 6200 + 38000);
  assert.equal(r.actualMw, 217000);
  assert.equal(r.allocOver, true);
  assert.equal(r.actualOver, false);
  assert.equal(r.portsOver, false);
  assert.equal(r.fullPowerPorts, 6);
  assert.equal(r.moreAtPortMax, 0);
  assert.ok(r.flags.some((f) => f.level === "warn"));
}

// Ports over and unmeasured fallback.
{
  const r = analyzeBudget({ budgetMw: 740000, ports: 2, pseType: 2 }, [{ name: "a", qty: 3, cls: 4, measuredMw: null }]);
  assert.equal(r.portsOver, true);
  assert.equal(r.actualMw, 90000);
  assert.equal(r.measuredDevices, 0);
  assert.equal(r.moreAtPortMax, Math.floor((740000 - 90000) / 30000));
}

// No budget, no devices.
{
  const r = analyzeBudget({ budgetMw: null, ports: null, pseType: 4 }, []);
  assert.equal(r.devices, 0);
  assert.equal(r.allocHeadroomMw, null);
  assert.equal(r.flags.length, 0);
}
assert.equal(PSE_TYPES[4].portMw, 90000);

/* ------------------------------------------------ verifier: independent cases */
const near = (a: number, b: number, eps: number, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} != ${b}`);

// 1. Forward direction: PSE class power at worst case minus I^2 R gives the
//    standard's PD figures (802.3 Table 33-18 / 145-? PClass_PD) within 0.01 W
//    for classes 0, 2, 3, 4, 6, 7. Class 1 (3.835 vs 3.84), class 8 (71.28 vs 71.3) and class 5
//    (39.94 vs 40) are rounded in the standard, within 0.07 W.
for (const c of POE_CLASSES) {
  const wc = worstCaseFor(c.cls);
  const pse = c.pseMw / 1000;
  const total = pse / wc.voltage;
  const perSet = wc.pairs === 4 ? total / 2 : total;
  const loss = perSet * perSet * wc.loopOhmsPer100m * (wc.pairs === 4 ? 2 : 1);
  near(pse - loss, c.pdMw / 1000, [1, 5, 8].includes(c.cls) ? 0.07 : 0.01, `class ${c.cls} forward`);
}

// 2. Four-pair class 4 on a Type 3 PSE: R_eff = 6.25 ohm.
//    I = (50 - sqrt(2500 - 4 * 6.25 * 25.5)) / 12.5 = 0.547464 A, P_PSE = 27.373 W.
{
  const r = cableLoss({ pdW: 25.5, lengthM: 100, voltage: 50, loopOhmsPer100m: 12.5, pairs: 4 });
  assert.ok(r.ok);
  if (r.ok) {
    near(r.value.currentA, (50 - Math.sqrt(1862.5)) / 12.5, 1e-12, "4-pair current");
    near(r.value.pseW, 27.3732, 1e-3, "4-pair pse");
    near(r.value.lossW, 1.8732, 1e-3, "4-pair loss");
    near(r.value.perPairSetA, r.value.currentA / 2, 1e-15);
  }
}

// 3. 25 m of Type 2 cable: 3.125 ohm, I = 0.527384 A, loss 0.869 W.
{
  const r = cableLoss({ pdW: 25.5, lengthM: 25, voltage: 50, loopOhmsPer100m: 12.5, pairs: 2 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.loopOhms, 3.125);
    near(r.value.currentA, 0.527384, 1e-6, "25 m current");
    near(r.value.lossW, 0.869, 1e-3, "25 m loss");
  }
}

// 4. Maximum power transfer boundary: P_max = V^2 / 4R = 50 W at 50 V and 12.5 ohm,
//    reached at I = V / 2R = 2 A with as much again lost in the cable.
{
  const r = cableLoss({ pdW: 50, lengthM: 100, voltage: 50, loopOhmsPer100m: 12.5, pairs: 2 });
  assert.ok(r.ok);
  if (r.ok) {
    near(r.value.currentA, 2, 1e-12);
    near(r.value.pseW, 100, 1e-9);
    near(r.value.efficiency, 0.5, 1e-12);
    assert.equal(r.value.maxPdW, 50);
  }
  assert.equal(cableLoss({ pdW: 50.001, lengthM: 100, voltage: 50, loopOhmsPer100m: 12.5, pairs: 2 }).ok, false);
  assert.equal(cableLoss({ pdW: 10, lengthM: -1, voltage: 50, loopOhmsPer100m: 12.5, pairs: 2 }).ok, false);
  assert.equal(cableLoss({ pdW: 10, lengthM: 1, voltage: 0, loopOhmsPer100m: 12.5, pairs: 2 }).ok, false);
  assert.equal(cableLoss({ pdW: Infinity, lengthM: 1, voltage: 50, loopOhmsPer100m: 12.5, pairs: 2 }).ok, false);
}

// 5. PSE types: max class, port power and minimum voltage per 802.3.
assert.deepEqual(
  ([1, 2, 3, 4] as const).map((t) => [PSE_TYPES[t].maxClass, PSE_TYPES[t].portMw, PSE_TYPES[t].vMin, PSE_TYPES[t].loopOhms]),
  [[3, 15400, 44, 20], [4, 30000, 50, 12.5], [6, 60000, 50, 12.5], [8, 90000, 52, 12.5]],
);
// Classes 5 to 8 need four pairs; 0 to 4 run on two.
assert.deepEqual(POE_CLASSES.map((c) => c.pairs), [2, 2, 2, 2, 2, 4, 4, 4, 4]);
assert.deepEqual(POE_CLASSES.map((c) => c.type), [1, 1, 1, 1, 2, 3, 3, 4, 4]);

// 6. Demotion on every port type for a class 8 PD.
assert.deepEqual(
  ([1, 2, 3, 4] as const).map((t) => {
    const l = analyzeLine({ name: "x", qty: 1, cls: 8, measuredMw: null }, t);
    return [l.assignedClass, l.allocEachMw, l.demoted];
  }),
  [[0, 15400, true], [4, 30000, true], [6, 60000, true], [8, 90000, false]],
);
assert.ok(/treats class 4 and above as class 0/.test(analyzeLine({ name: "x", qty: 1, cls: 5, measuredMw: null }, 1).flags[0].text));

// 7. Measured draw boundaries: exactly the class figure is fine, 1 mW over is flagged.
assert.equal(analyzeLine({ name: "x", qty: 1, cls: 3, measuredMw: 15400 }, 2).flags.length, 0);
assert.equal(analyzeLine({ name: "x", qty: 1, cls: 3, measuredMw: 15401 }, 2).flags.length, 1);
assert.equal(analyzeLine({ name: "x", qty: 1, cls: 4, measuredMw: 0 }, 2).flags.length, 0);

// 8. Budget boundaries in exact milliwatts.
{
  const fit = analyzeBudget({ budgetMw: 217000, ports: 24, pseType: 4 }, [{ name: "a", qty: 31, cls: 2, measuredMw: 7000 }]);
  assert.equal(fit.actualMw, 217000);
  assert.equal(fit.actualOver, false);
  const over = analyzeBudget({ budgetMw: 216999, ports: 31, pseType: 4 }, [{ name: "a", qty: 31, cls: 2, measuredMw: 7000 }]);
  assert.equal(over.actualOver, true);
  assert.equal(over.actualHeadroomMw, -1);
  assert.equal(over.portsOver, false);
  assert.equal(fit.portsOver, true);
}

// 9. Wording: nothing measured must not claim a measured draw.
{
  const r = analyzeBudget({ budgetMw: 60000, ports: null, pseType: 2 }, [{ name: "a", qty: 3, cls: 4, measuredMw: null }]);
  assert.equal(r.allocOver, true);
  assert.equal(r.flags.length, 1);
  assert.ok(!/measured draw,|as measured/.test(r.flags[0].text), r.flags[0].text);
  assert.ok(/No draw is measured/.test(r.flags[0].text));
  const partial = analyzeBudget({ budgetMw: 60000, ports: null, pseType: 2 }, [
    { name: "a", qty: 1, cls: 4, measuredMw: 10000 },
    { name: "b", qty: 1, cls: 4, measuredMw: null },
  ]);
  assert.equal(partial.allocOver, false);
  const partialOver = analyzeBudget({ budgetMw: 55000, ports: null, pseType: 2 }, [
    { name: "a", qty: 1, cls: 4, measuredMw: 10000 },
    { name: "b", qty: 1, cls: 4, measuredMw: null },
  ]);
  assert.equal(partialOver.allocOver, true);
  assert.equal(partialOver.actualOver, false);
  assert.ok(/measured where known/.test(partialOver.flags[0].text));
}

// 10. Malformed and adversarial parsing.
for (const bad of ["1,0", "1,,0", "12,34", ",100", "1e3", "0x10", "\u0661\u0662", "  -3 ", "+4", "4.0", "NaN"]) {
  assert.equal(parseCount(bad, { label: "qty", min: 1, max: 1000, required: true, example: 1 }).ok, false, `count ${bad}`);
}
assert.deepEqual(parseCount("1,000", { label: "qty", min: 1, max: 1000, required: true, example: 1 }), { ok: true, value: 1000 });
assert.deepEqual(parseCount(" 12 ", { label: "qty", min: 1, max: 1000, required: true, example: 1 }), { ok: true, value: 12 });
for (const bad of ["Infinity", "1.2.3", "--1", "1 000", "\u221212", "\uff11\uff12", "12 W", "."]) {
  assert.equal(parseDecimal(bad).ok, false, `decimal ${bad}`);
}
assert.equal(parseWattsMw("0.0004", { label: "budget", max: 100000, required: true }).ok, false);
assert.deepEqual(parseWattsMw("0.0004", { label: "draw", max: 100, required: false, allowZero: true }), { ok: true, value: 0 });
assert.deepEqual(parseWattsMw("-0", { label: "draw", max: 100, required: false, allowZero: true }), { ok: true, value: 0 });
assert.ok(Object.is((parseWattsMw("-0", { label: "draw", max: 100, required: false, allowZero: true }) as { value: number }).value, 0));
assert.deepEqual(parseWattsMw("100,000", { label: "budget", max: 100000, required: true }), { ok: true, value: 100000000 });
assert.deepEqual(parseWattsMw("   ", { label: "draw", max: 100, required: false, allowZero: true }), { ok: true, value: null });

// 11. Rows past the cap are ignored rather than looped over.
{
  const many = Array.from({ length: 5000 }, () => ({ name: "a", qty: 1, cls: 1, measuredMw: null }));
  const r = analyzeBudget({ budgetMw: 1000000, ports: null, pseType: 1 }, many);
  assert.equal(r.lines.length, 50);
  assert.equal(r.allocMw, 50 * 4000);
}
console.log("poe-budget-calculator: all tests passed");

/* ------------------------------------- verifier 2: further independent cases */
{
  const near2 = (a: number, b: number, eps: number, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} != ${b}`);
  // A. Class 7 forward at worst case (Clause 145, Type 4, 52 V, 12.5 ohm per pair set, 4 pairs):
  //    I = 75 / 52 = 1.44231 A, R_eff = 6.25 ohm, loss = 13.0018 W, PD = 61.998 W ~ 62.0 W.
  near2(75 - (75 / 52) ** 2 * 6.25, 62, 0.01, "class 7 forward");
  // Class 2 forward (Type 1, 44 V, 20 ohm): I = 0.159091 A, loss = 0.50620 W, PD = 6.4938 ~ 6.49 W.
  near2(7 - (7 / 44) ** 2 * 20, 6.49, 0.005, "class 2 forward");

  // B. Inverse at class 1: 3.84 W at the PD through 20 ohm at 44 V.
  //    I = (44 - sqrt(44^2 - 4 * 20 * 3.84)) / 40 = 0.091040 A, PSE = 4.0057 W ~ 4.0 W.
  const c1 = cableLoss({ pdW: 3.84, lengthM: 100, voltage: 44, loopOhmsPer100m: 20, pairs: 2 });
  assert.ok(c1.ok);
  if (c1.ok) {
    near2(c1.value.currentA, (44 - Math.sqrt(1936 - 307.2)) / 40, 1e-12, "class 1 current");
    near2(c1.value.pseW, 4.0057, 1e-3, "class 1 pse");
  }
  // Class 8 inverse at 57 V (the highest PSE voltage) over 50 m four-pair: R_eff = 3.125 ohm.
  //    I = (57 - sqrt(3249 - 12.5 * 71.3)) / 6.25 = 1.29069 A, loss = 5.2059 W.
  const c8 = cableLoss({ pdW: 71.3, lengthM: 50, voltage: 57, loopOhmsPer100m: 12.5, pairs: 4 });
  assert.ok(c8.ok);
  if (c8.ok) {
    near2(c8.value.currentA, (57 - Math.sqrt(3249 - 12.5 * 71.3)) / 6.25, 1e-12);
    near2(c8.value.lossW, c8.value.currentA ** 2 * 3.125, 1e-9, "loss = I^2 R_eff");
    near2(c8.value.perPairSetA ** 2 * 6.25 * 2, c8.value.lossW, 1e-9, "loss per pair set summed");
  }

  // C. Draw over budget while class reservations fit (measured above class):
  //    one class 4 device on a Type 3 port measured at 31 W, 30 W budget.
  const r = analyzeBudget({ budgetMw: 30000, ports: 24, pseType: 3 }, [{ name: "ap", qty: 1, cls: 4, measuredMw: 31000 }]);
  assert.equal(r.allocOver, false);
  assert.equal(r.actualOver, true);
  assert.equal(r.flags.length, 1);
  assert.ok(/^The draw, 31\.0 W as measured, is 1\.0 W over the 30\.0 W budget, although the class reservations of 30\.0 W fit\./.test(r.flags[0].text), r.flags[0].text);
  assert.ok(!/Even/.test(r.flags[0].text));
  // Both over: keeps "Even".
  const both = analyzeBudget({ budgetMw: 20000, ports: null, pseType: 3 }, [{ name: "ap", qty: 1, cls: 4, measuredMw: 25000 }]);
  assert.ok(both.allocOver && both.actualOver && /^Even the draw/.test(both.flags[0].text), both.flags[0]?.text);

  // D. Type 1 port limit: class 3 at exactly 15.4 W is fine, 15.5 W is over the port (and only that flag).
  assert.equal(analyzeLine({ name: "x", qty: 1, cls: 3, measuredMw: 15400 }, 1).flags.length, 0);
  const t1 = analyzeLine({ name: "x", qty: 1, cls: 3, measuredMw: 15500 }, 1);
  assert.equal(t1.flags.length, 1);
  assert.ok(/more than a Type 1 port can output \(15\.4 W\)/.test(t1.flags[0].text));
  // Class 7 on Type 3 demotes to class 6: 60.0 W reserved, 51.00 W at the PD.
  const d7 = analyzeLine({ name: "x", qty: 2, cls: 7, measuredMw: null }, 3);
  assert.equal(d7.assignedClass, 6);
  assert.equal(d7.allocMw, 120000);
  assert.ok(/assigns at most class 6, so it reserves 60\.0 W and the device gets 51\.00 W/.test(d7.flags[0].text), d7.flags[0].text);
  // Class 5 on Type 2 demotes to class 4.
  assert.equal(analyzeLine({ name: "x", qty: 1, cls: 5, measuredMw: null }, 2).allocEachMw, 30000);

  // E. Headroom arithmetic: 100 W Type 2, one class 1 device (4 W): 96 W left, 3 more 30 W ports, 3 at full power.
  const h = analyzeBudget({ budgetMw: 100000, ports: 8, pseType: 2 }, [{ name: "x", qty: 1, cls: 1, measuredMw: null }]);
  assert.equal(h.allocHeadroomMw, 96000);
  assert.equal(h.moreAtPortMax, 3);
  assert.equal(h.fullPowerPorts, 3);
  assert.equal(h.flags.length, 0);
  // Ports over: 25 devices on 24 ports.
  const p = analyzeBudget({ budgetMw: 1000000, ports: 24, pseType: 2 }, [{ name: "x", qty: 25, cls: 1, measuredMw: null }]);
  assert.equal(p.portsOver, true);
  assert.ok(p.flags.some((f) => f.text === "25 devices but only 24 PoE ports."));
  // One port singular.
  const p1 = analyzeBudget({ budgetMw: 1000000, ports: 1, pseType: 2 }, [{ name: "x", qty: 2, cls: 1, measuredMw: null }]);
  assert.ok(p1.flags.some((f) => f.text === "2 devices but only 1 PoE port."));

  // F. Largest input stays exact in integer mW: 50 rows x 1000 class 8 devices on Type 4 = 4.5 MW.
  const big = analyzeBudget(
    { budgetMw: 100000000, ports: 1000, pseType: 4 },
    Array.from({ length: 50 }, () => ({ name: "x", qty: 1000, cls: 8, measuredMw: 99999 })),
  );
  assert.equal(big.allocMw, 4500000000);
  assert.equal(big.actualMw, 4999950000);
  assert.ok(Number.isSafeInteger(big.allocMw) && Number.isSafeInteger(big.actualMw));
  assert.ok(big.portsOver && big.allocOver && big.actualOver);

  // G. Malformed watt strings never throw.
  for (const bad of ["1e2", "١٢", "12.", "12..5", "1,23", "∞", "0b1", " - 5", "12 W", "x".repeat(10000)]) {
    const res = parseWattsMw(bad, { label: "budget", max: 100000, required: true });
    assert.equal(res.ok, false, `watts ${bad.slice(0, 12)}`);
  }
  assert.deepEqual(parseWattsMw("  370  ", { label: "budget", max: 100000, required: true }), { ok: true, value: 370000 });
  assert.deepEqual(parseWattsMw("100000.0004", { label: "budget", max: 100000, required: true }).ok, false);
  console.log("poe-budget-calculator: verifier 2 cases passed");
}
