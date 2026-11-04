import assert from "node:assert/strict";
import {
  BINARY32, BINARY64, addInFormat, decode, decimalPlain, exactDecimal, hexFloat, nextDown, nextUp, parseInput,
  roundToFormat, roundingReport, shortestDecimal, valueOf, significandBinary, type Value, type Format,
} from "../../client/src/lib/toolkit/ieee754-inspector.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; } catch (e) { console.error("FAIL", name); throw e; }
}
function val(s: string): Value {
  const p = parseInput(s);
  if (p.kind === "value") return p.value;
  if (p.kind === "bits") return valueOf(decode(p.bits, p.format));
  throw new Error(`${s}: ${JSON.stringify(p, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
}
const r32 = (s: string) => roundToFormat(val(s), BINARY32);
const r64 = (s: string) => roundToFormat(val(s), BINARY64);
const dv = new DataView(new ArrayBuffer(8));
const f64bits = (x: number) => { dv.setFloat64(0, x); return dv.getBigUint64(0); };
const f32bits = (x: number) => { dv.setFloat32(0, x); return BigInt(dv.getUint32(0)); };

t("published encodings", () => {
  assert.equal(r32("0.1"), 0x3dcccccdn);
  assert.equal(r32("1"), 0x3f800000n);
  assert.equal(r32("-2"), 0xc0000000n);
  assert.equal(r32("3.14159265358979"), 0x40490fdbn);
  assert.equal(r64("0.3333333333333333"), 0x3fd5555555555555n);
  assert.equal(r64("1"), 0x3ff0000000000000n);
  assert.equal(r64("-0"), 0x8000000000000000n);
  assert.equal(r32("-0"), 0x80000000n);
  assert.equal(r64("2"), 0x4000000000000000n);
  assert.equal(r64("3.141592653589793"), 0x400921fb54442d18n);
  assert.equal(decimalPlain(exactDecimal(decode(0x3dcccccdn, BINARY32))!), "0.100000001490116119384765625");
});
t("subnormal boundaries in float64", () => {
  assert.equal(r64("4.9406564584124654e-324"), 1n);
  assert.equal(r64("5e-324"), 1n);
  // 2^-1075 exactly: half the smallest subnormal, a tie that goes to even (zero).
  const half = decimalPlain({ neg: false, digits: 5n ** 1075n, scale: 1075 });
  assert.equal(r64(half), 0n);
  assert.equal(r64(half + "1"), 1n);
  assert.equal(r64("2.4703282292062327e-324"), 0n);
  assert.equal(r64("2.4703282292062328e-324"), 1n);
  assert.equal(r64("-2.4703282292062328e-324"), 0x8000000000000001n);
  assert.equal(r64("-1e-400"), 0x8000000000000000n);
  assert.equal(r64("2.2250738585072014e-308"), 0x0010000000000000n);
  assert.equal(r64("2.225073858507201e-308"), 0x000fffffffffffffn);
  const rep = roundingReport(val(half), decode(0n, BINARY64));
  assert.equal(rep.kind, "underflow"); assert.equal(rep.tie, true);
});
t("float32 overflow midpoint", () => {
  assert.equal(r32("3.4028234663852886e38"), 0x7f7fffffn);
  // 2^128 - 2^103 is the midpoint between FLT_MAX and 2^128: ties to even overflows.
  const mid = (2n ** 128n - 2n ** 103n).toString();
  assert.equal(r32(mid), 0x7f800000n);
  assert.equal(r32((2n ** 128n - 2n ** 103n - 1n).toString()), 0x7f7fffffn);
  assert.equal(r32("-" + mid), 0xff800000n);
  assert.equal(r32("1e39"), 0x7f800000n);
});
t("float64 overflow and DBL_MAX", () => {
  assert.equal(r64("1.7976931348623157e308"), 0x7fefffffffffffffn);
  assert.equal(r64("1.7976931348623158e308"), 0x7fefffffffffffffn);
  assert.equal(r64("1.7976931348623159e308"), 0x7ff0000000000000n);
  assert.equal(r64((2n ** 1024n - 2n ** 970n).toString()), 0x7ff0000000000000n);
  assert.equal(r64((2n ** 1024n - 2n ** 970n - 1n).toString()), 0x7fefffffffffffffn);
  assert.equal(r64("1e309"), 0x7ff0000000000000n);
  assert.equal(r64("1e999999999999"), 0x7ff0000000000000n);
});
t("hex floats", () => {
  assert.equal(r64("0x1.fffffffffffffp1023"), 0x7fefffffffffffffn);
  assert.equal(r64("0x1p-1074"), 1n);
  assert.equal(r64("0x1p-1022"), 0x0010000000000000n);
  assert.equal(r64("0x1.8p3"), r64("12"));
  assert.equal(r64("-0x1p-3"), r64("-0.125"));
  assert.equal(r64("0x1p1024"), 0x7ff0000000000000n);
  assert.equal(r32("0x1.fffffep127"), 0x7f7fffffn);
  assert.equal(r32("0x1.ffffffp127"), 0x7f800000n); // midpoint, overflows
  assert.equal(hexFloat(decode(0x3fb999999999999an, BINARY64)), "0x1.999999999999ap-4");
  assert.equal(hexFloat(decode(0x3dcccccdn, BINARY32)), "0x1.99999ap-4");
  assert.equal(hexFloat(decode(1n, BINARY64)), "0x0.0000000000001p-1022");
  assert.equal(hexFloat(decode(0x8000000000000000n, BINARY64)), "-0x0p+0");
});
t("integer ties", () => {
  assert.equal(r32("16777217"), 0x4b800000n);
  assert.equal(r32("16777219"), 0x4b800002n);
  assert.equal(r32("16777218"), 0x4b800001n);
  assert.equal(r64("9007199254740993"), 0x4340000000000000n);
  assert.equal(r64("9007199254740995"), 0x4340000000000002n);
  // Midpoint between 1 and nextUp(1) in float64 rounds to 1; a hair above rounds up.
  assert.equal(r64("1.00000000000000011102230246251565404236316680908203125"), 0x3ff0000000000000n);
  assert.equal(r64("1.000000000000000111022302462515654042363166809082031250001"), 0x3ff0000000000001n);
  assert.equal(r64("1.00000000000000033306690738754696212708950042724609375"), 0x3ff0000000000002n); // 1 + 3*2^-53 tie, to even
});
t("decode fields of -pi float32", () => {
  const d = decode(0xc0490fdbn, BINARY32);
  assert.equal(d.sign, 1); assert.equal(d.expField, 128); assert.equal(d.unbiased, 1);
  assert.equal(significandBinary(d), "1.10010010000111111011011");
  assert.equal(shortestDecimal(d), "-3.1415927");
  const sub = decode(0x00000001n, BINARY32);
  assert.equal(sub.cls, "subnormal"); assert.equal(sub.unbiased, -126); assert.equal(shortestDecimal(sub), "1e-45");
  assert.equal(shortestDecimal(decode(0x7f7fffffn, BINARY32)), "3.4028235e+38");
  assert.equal(shortestDecimal(decode(0x00800000n, BINARY32)), "1.1754944e-38");
  const qn = decode(0x7fc00001n, BINARY32);
  assert.equal(qn.cls, "nan"); assert.equal(qn.quiet, true); assert.equal(qn.payload, 1n);
  const sn = decode(0x7f800001n, BINARY32);
  assert.equal(sn.quiet, false); assert.equal(sn.payload, 1n);
  assert.equal(decode(0xfff0000000000000n, BINARY64).cls, "infinity");
});
t("rounding report for 0.1 in float64", () => {
  const d = decode(r64("0.1"), BINARY64);
  const rep = roundingReport(val("0.1"), d);
  assert.equal(rep.kind, "rounded");
  assert.equal(decimalPlain(rep.error!), "0.0000000000000000055511151231257827021181583404541015625");
  assert.ok(Math.abs(rep.ulps! - 0.4) < 1e-15);
  assert.ok(Math.abs(rep.relative! - 5.551115123125783e-17) < 1e-30);
  assert.equal(rep.tie, false);
  const t32 = roundingReport(val("16777217"), decode(r32("16777217"), BINARY32));
  assert.equal(t32.tie, true); assert.equal(decimalPlain(t32.error!), "-1");
  assert.equal(t32.error!.neg, true);
});
t("nextUp and nextDown", () => {
  const F = BINARY64;
  assert.equal(nextUp(0x3ff0000000000000n, F), 0x3ff0000000000001n);
  assert.equal(nextDown(0x3ff0000000000000n, F), 0x3fefffffffffffffn);
  assert.equal(nextUp(0x8000000000000000n, F), 1n);
  assert.equal(nextDown(0n, F), 0x8000000000000001n);
  assert.equal(nextUp(0x7fefffffffffffffn, F), 0x7ff0000000000000n);
  assert.equal(nextDown(0xffefffffffffffffn, F), 0xfff0000000000000n);
  assert.equal(nextUp(0xfff0000000000000n, F), 0xffefffffffffffffn);
  assert.equal(nextUp(0x8000000000000001n, F), 0x8000000000000000n);
  assert.equal(nextDown(1n, F), 0n);
  assert.equal(nextUp(0x7ff0000000000000n, F), 0x7ff0000000000000n);
});
t("0.1 + 0.2 in both formats", () => {
  const r64s = addInFormat(val("0.1"), val("0.2"), BINARY64);
  assert.equal(r64s.sum.bits, 0x3fd3333333333334n);
  assert.equal(r64s.direct.bits, 0x3fd3333333333333n);
  assert.equal(r64s.equal, false); assert.equal(r64s.apart, 1n);
  assert.equal(shortestDecimal(r64s.sum), "0.30000000000000004");
  const r32s = addInFormat(val("0.1"), val("0.2"), BINARY32);
  assert.equal(r32s.sum.bits, f32bits(Math.fround(Math.fround(0.1) + Math.fround(0.2))));
  assert.equal(r32s.equal, true);
  const z = addInFormat(val("-0"), val("-0"), BINARY64); assert.equal(z.sum.bits, 0x8000000000000000n);
  const z2 = addInFormat(val("-0"), val("0"), BINARY64); assert.equal(z2.sum.bits, 0n);
  const z3 = addInFormat(val("0.1"), val("-0.1"), BINARY64); assert.equal(z3.sum.bits, 0n);
  const n = addInFormat(val("inf"), val("-inf"), BINARY64); assert.equal(n.sum.cls, "nan"); assert.equal(n.equal, false);
  const o = addInFormat(val("1e308"), val("1e308"), BINARY64); assert.equal(o.sum.cls, "infinity");
  const s = addInFormat(val("0.1"), val("0.7"), BINARY64);
  assert.equal(s.sum.bits, f64bits(0.1 + 0.7));
});
t("fuzz: double to float32 matches Math.fround", () => {
  for (let i = 0; i < 20000; i++) {
    // Random doubles across the whole range, including the float32 subnormal and overflow zones.
    const e = Math.floor(Math.random() * 340) - 170;
    const x = (Math.random() * 2 - 1) * 2 ** e;
    const bits = roundToFormat(valueOf(decode(f64bits(x), BINARY64)), BINARY32);
    assert.equal(bits, f32bits(Math.fround(x)), `x=${x}`);
  }
});
t("fuzz: arithmetic sums match the hardware", () => {
  for (let i = 0; i < 5000; i++) {
    const a = (Math.random() - 0.5) * 2 ** (Math.floor(Math.random() * 60) - 30);
    const b = (Math.random() - 0.5) * 2 ** (Math.floor(Math.random() * 60) - 30);
    const r = addInFormat(valueOf(decode(f64bits(a), BINARY64)), valueOf(decode(f64bits(b), BINARY64)), BINARY64);
    assert.equal(r.sum.bits, f64bits(a + b));
    const fa = Math.fround(a), fb = Math.fround(b);
    const r2 = addInFormat(valueOf(decode(f32bits(fa), BINARY32)), valueOf(decode(f32bits(fb), BINARY32)), BINARY32);
    // float32 addition is exactly fround of the double sum (double has enough precision for one add of floats).
    assert.equal(r2.sum.bits, f32bits(Math.fround(fa + fb)));
  }
});
t("malformed input never throws", () => {
  const bad = ["", "  ", "abc", "1.2.3", "1e", "e5", ".", "+", "-", "0x", "0x123", "-0x3F800000", "1,5", "0b101", "--1", "١", "😀", "\u0000", "0x1.8", "0xp3", "0x.p3", "0x1p", "1 000", "9".repeat(1101), "0b2", "nan nan", "infinit"];
  for (const s of bad) {
    const p = parseInput(s);
    assert.ok(p.kind === "error" || p.kind === "empty", s);
  }
  for (const s of ["∞", "-inf", "+Infinity", "NaN", "1_000", "−5", "0x7fc0_0000", "1e-99999999999", "0x1p-99999999999", "0x1p99999999999", "9".repeat(1100)]) {
    const p = parseInput(s);
    assert.ok(p.kind === "value" || p.kind === "bits", s);
    for (const f of [BINARY32, BINARY64] as Format[]) {
      const v = p.kind === "value" ? p.value : valueOf(decode(p.bits, p.format));
      const d = decode(roundToFormat(v, f), f);
      shortestDecimal(d); roundingReport(v, d);
    }
  }
});
console.log(`ieee754 verifier: ${passed} groups passed`);
