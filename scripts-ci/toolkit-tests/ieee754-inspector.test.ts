import assert from "node:assert/strict";
import {
  BINARY32,
  BINARY64,
  addInFormat,
  approx,
  bitsHex,
  decimalPlain,
  decimalScientific,
  decimalShort,
  decode,
  exactDecimal,
  hexFloat,
  largestFinite,
  negateBits,
  nextDown,
  nextUp,
  parseInput,
  rationalToDecimal,
  roundToFormat,
  roundingReport,
  shortestDecimal,
  significandBinary,
  significandDecimal,
  significantDigits,
  ulpDecimal,
  valueDecimal,
  valueOf,
  type Format,
  type Value,
} from "../../client/src/lib/toolkit/ieee754-inspector.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error("FAIL", name);
    throw e;
  }
}

function val(s: string): Value {
  const p = parseInput(s);
  if (p.kind === "value") return p.value;
  if (p.kind === "bits") return valueOf(decode(p.bits, p.format));
  throw new Error(`parse failed for ${s}: ${JSON.stringify(p)}`);
}
const bits = (s: string, f: Format) => roundToFormat(val(s), f);
const hex = (s: string, f: Format) => bitsHex(bits(s, f), f);

/* Reference encodings (IEEE 754 binary32/binary64, widely published). */
t("0.1", () => {
  assert.equal(hex("0.1", BINARY64), "0x3FB999999999999A");
  assert.equal(hex("0.1", BINARY32), "0x3DCCCCCD");
  assert.equal(decimalPlain(exactDecimal(decode(bits("0.1", BINARY64), BINARY64))!), "0.1000000000000000055511151231257827021181583404541015625");
  assert.equal(decimalPlain(exactDecimal(decode(bits("0.1", BINARY32), BINARY32))!), "0.100000001490116119384765625");
});
t("simple values", () => {
  assert.equal(hex("1", BINARY64), "0x3FF0000000000000");
  assert.equal(hex("1", BINARY32), "0x3F800000");
  assert.equal(hex("-2", BINARY32), "0xC0000000");
  assert.equal(hex("0.5", BINARY32), "0x3F000000");
  assert.equal(hex("3.141592653589793", BINARY64), "0x400921FB54442D18");
  assert.equal(hex("0.3", BINARY64), "0x3FD3333333333333");
  assert.equal(hex("0.3", BINARY32), "0x3E99999A");
  assert.equal(hex("0", BINARY64), "0x0000000000000000");
  assert.equal(hex("-0", BINARY64), "0x8000000000000000");
  assert.equal(hex("-0.0e5", BINARY32), "0x80000000");
  assert.equal(hex("inf", BINARY64), "0x7FF0000000000000");
  assert.equal(hex("-Infinity", BINARY32), "0xFF800000");
  assert.equal(hex("nan", BINARY64), "0x7FF8000000000000");
  assert.equal(hex("NaN", BINARY32), "0x7FC00000");
  assert.equal(hex("-nan", BINARY32), "0xFFC00000");
});
t("ties to even", () => {
  // 2^24 + 1 is halfway between 2^24 and 2^24 + 2: even significand wins.
  assert.equal(hex("16777217", BINARY32), "0x4B800000");
  // 2^24 + 3 is halfway between 2^24 + 2 and 2^24 + 4: 2^24 + 4 has the even significand.
  assert.equal(hex("16777219", BINARY32), "0x4B800002");
  assert.equal(hex("9007199254740993", BINARY64), "0x4340000000000000");
  assert.equal(hex("9007199254740995", BINARY64), "0x4340000000000002");
});
t("limits and overflow", () => {
  assert.equal(hex("3.4028234663852886e38", BINARY32), "0x7F7FFFFF");
  assert.equal(hex("3.4028235e38", BINARY32), "0x7F7FFFFF");
  // 2^128 - 2^103 is the midpoint above FLT_MAX; ties to even rounds it to 2^128, which overflows.
  assert.equal(hex("340282356779733661637539395458142568448", BINARY32), "0x7F800000");
  assert.equal(hex("340282356779733661637539395458142568447", BINARY32), "0x7F7FFFFF");
  assert.equal(hex("1.7976931348623157e308", BINARY64), "0x7FEFFFFFFFFFFFFF");
  assert.equal(hex("1.7976931348623158e308", BINARY64), "0x7FEFFFFFFFFFFFFF");
  assert.equal(hex("1.7976931348623159e308", BINARY64), "0x7FF0000000000000");
  assert.equal(hex("-1e400", BINARY64), "0xFFF0000000000000");
  assert.equal(hex("1e999999999999", BINARY64), "0x7FF0000000000000");
  assert.equal(bitsHex(largestFinite(BINARY32).bits, BINARY32), "0x7F7FFFFF");
  assert.equal(bitsHex(largestFinite(BINARY64).bits, BINARY64), "0x7FEFFFFFFFFFFFFF");
});
t("subnormals and underflow", () => {
  assert.equal(hex("5e-324", BINARY64), "0x0000000000000001");
  assert.equal(hex("0x1p-1074", BINARY64), "0x0000000000000001");
  // Exactly half the smallest subnormal ties to even, which is zero.
  assert.equal(hex("0x1p-1075", BINARY64), "0x0000000000000000");
  assert.equal(hex("0x1.0000000000001p-1075", BINARY64), "0x0000000000000001");
  assert.equal(hex("0x3p-1075", BINARY64), "0x0000000000000002");
  assert.equal(hex("-1e-400", BINARY64), "0x8000000000000000");
  assert.equal(hex("1e-99999999999", BINARY32), "0x00000000");
  assert.equal(hex("1.4e-45", BINARY32), "0x00000001");
  assert.equal(hex("2.2250738585072014e-308", BINARY64), "0x0010000000000000");
  assert.equal(hex("1.1754943508222875e-38", BINARY32), "0x00800000");
  // Largest subnormal rounds up into the smallest normal when nudged by half an ULP.
  assert.equal(hex("0x0.fffffffffffff8p-1022", BINARY64), "0x0010000000000000");
});
t("hex float input", () => {
  assert.equal(hex("0x1.8p3", BINARY32), "0x41400000"); // 12
  assert.equal(hex("-0x1p-3", BINARY64), "0xBFC0000000000000");
  assert.equal(hex("0x.8p1", BINARY32), "0x3F800000");
});
t("raw bits input", () => {
  const p = parseInput("0x3DCCCCCD");
  assert.ok(p.kind === "bits" && p.format === BINARY32 && p.bits === 0x3dcccccdn);
  const q = parseInput("0x3FB9_9999_9999_999A");
  assert.ok(q.kind === "bits" && q.format === BINARY64 && q.bits === 0x3fb999999999999an);
  const r = parseInput("0b" + "0".repeat(31) + "1");
  assert.ok(r.kind === "bits" && r.format === BINARY32 && r.bits === 1n);
});
t("errors", () => {
  for (const bad of ["abc", "0x123", "-0x3F800000", "1,5", "0b101", "1e", ".", "--1", "0x1.gp3", "0xZZ"]) {
    const p = parseInput(bad);
    assert.equal(p.kind, "error", bad);
    assert.ok(p.kind === "error" && p.message.length > 10);
    assert.ok(p.kind === "error" && !p.message.includes("—"));
  }
  assert.equal(parseInput("   ").kind, "empty");
  assert.equal(parseInput("1".repeat(1101)).kind, "error");
  assert.equal(parseInput("1".repeat(1100)).kind, "value");
});

/* Decoding. */
t("decode fields", () => {
  const d = decode(0x3dcccccdn, BINARY32);
  assert.equal(d.sign, 0);
  assert.equal(d.expField, 123);
  assert.equal(d.unbiased, -4);
  assert.equal(d.cls, "normal");
  assert.equal(significandBinary(d), "1.10011001100110011001101");
  assert.equal(significandDecimal(d), "1.60000002384185791015625");
  assert.equal(hexFloat(d), "0x1.99999ap-4");
  assert.equal(hexFloat(decode(0x3fb999999999999an, BINARY64)), "0x1.999999999999ap-4");
  assert.equal(hexFloat(decode(0x3ff0000000000000n, BINARY64)), "0x1p+0");
  assert.equal(hexFloat(decode(1n, BINARY64)), "0x0.0000000000001p-1022");
  assert.equal(hexFloat(decode(0x80000000n, BINARY32)), "-0x0p+0");
  assert.equal(hexFloat(decode(0x40490fdbn, BINARY32)), "0x1.921fb6p+1");
});
t("decode specials", () => {
  const sn = decode(0x7fa00000n, BINARY32);
  assert.equal(sn.cls, "nan");
  assert.equal(sn.quiet, false);
  assert.equal(sn.payload, 0x200000n);
  const qn = decode(0x7fc00001n, BINARY32);
  assert.equal(qn.quiet, true);
  assert.equal(qn.payload, 1n);
  assert.equal(decode(0xfff0000000000000n, BINARY64).cls, "infinity");
  const sub = decode(1n, BINARY32);
  assert.equal(sub.cls, "subnormal");
  assert.equal(sub.unbiased, -126);
  assert.equal(sub.implicitBit, 0);
  assert.equal(decode(0x80000000n, BINARY32).cls, "zero");
});
t("NaN conversion between formats keeps the payload and quiets", () => {
  // float32 sNaN 0x7FA00000 widens the way x86 cvtss2sd does: 0x7FFC000000000000.
  assert.equal(bitsHex(roundToFormat(valueOf(decode(0x7fa00000n, BINARY32)), BINARY64), BINARY64), "0x7FFC000000000000");
  // A float64 qNaN with payload in high fraction bits narrows to the matching float32 NaN.
  assert.equal(bitsHex(roundToFormat(valueOf(decode(0x7ff8000020000000n, BINARY64)), BINARY32), BINARY32), "0x7FC00001");
  // Payload only in the low 29 bits is lost, but the result stays a NaN.
  const narrowed = decode(roundToFormat(valueOf(decode(0x7ff0000000000001n, BINARY64)), BINARY32), BINARY32);
  assert.equal(narrowed.cls, "nan");
  assert.equal(narrowed.bits, 0x7fc00000n);
  // Sign survives.
  assert.equal(bitsHex(roundToFormat(valueOf(decode(0xffc00000n, BINARY32)), BINARY64), BINARY64), "0xFFF8000000000000");
});

/* Exact decimals. */
t("exact decimal strings", () => {
  const min = exactDecimal(decode(1n, BINARY64))!;
  assert.equal(significantDigits(min), 751);
  assert.ok(decimalScientific(min).startsWith("4.94065645841246544176568792868"));
  assert.ok(decimalScientific(min).endsWith("e-324"));
  const minF = exactDecimal(decode(1n, BINARY32))!;
  assert.ok(decimalScientific(minF).startsWith("1.40129846432481707092372958328991613128026194187651577"));
  assert.ok(decimalScientific(minF).endsWith("e-45"));
  assert.equal(
    decimalPlain(exactDecimal(decode(0x7f7fffffn, BINARY32))!),
    "340282346638528859811704183484516925440",
  );
  assert.equal(decimalPlain(exactDecimal(decode(0x80000000n, BINARY32))!), "-0");
  assert.equal(rationalToDecimal(false, 1n, 3n), null);
  assert.equal(decimalPlain(rationalToDecimal(true, 5n, 4n)!), "-1.25");
  assert.equal(decimalScientific(rationalToDecimal(false, 12300n, 1n)!), "1.23e+4");
});
t("rounding error", () => {
  const r = roundingReport(val("0.1"), decode(bits("0.1", BINARY64), BINARY64));
  assert.equal(r.kind, "rounded");
  assert.equal(decimalScientific(r.error!), "5.5511151231257827021181583404541015625e-18");
  assert.equal(approx(r.ulps!), "0.4");
  const r32 = roundingReport(val("0.1"), decode(bits("0.1", BINARY32), BINARY32));
  assert.equal(decimalScientific(r32.error!), "1.490116119384765625e-9");
  // 1/3 is not a terminating decimal but 0.3333 is, so the error must terminate.
  const third = roundingReport(val("0.3333"), decode(bits("0.3333", BINARY32), BINARY32));
  assert.ok(third.error !== null && Math.abs(third.ulps!) <= 0.5);
  assert.equal(roundingReport(val("0.5"), decode(bits("0.5", BINARY32), BINARY32)).kind, "exact");
  assert.equal(roundingReport(val("1e39"), decode(bits("1e39", BINARY32), BINARY32)).kind, "overflow");
  assert.equal(roundingReport(val("1e-50"), decode(bits("1e-50", BINARY32), BINARY32)).kind, "underflow");
  assert.equal(roundingReport(val("1e-500"), decode(bits("1e-500", BINARY32), BINARY32)).kind, "tiny");
  assert.equal(roundingReport(val("nan"), decode(bits("nan", BINARY32), BINARY32)).kind, "nan");
  // Halfway case: error is exactly half an ULP.
  const tie = roundingReport(val("16777217"), decode(bits("16777217", BINARY32), BINARY32));
  assert.equal(decimalPlain(tie.error!), "-1");
  assert.equal(tie.ulps, -0.5);
});
t("ulp", () => {
  assert.equal(decimalScientific(ulpDecimal(decode(bits("0.1", BINARY64), BINARY64))!), "1.387778780781445675529539585113525390625e-17");
  assert.equal(decimalPlain(ulpDecimal(decode(bits("16777216", BINARY32), BINARY32))!), "2");
});

/* Shortest round trip. */
t("shortest decimal, known float32 values", () => {
  const s32 = (b: bigint) => shortestDecimal(decode(b, BINARY32));
  assert.equal(s32(0x3dcccccdn), "0.1");
  assert.equal(s32(0x4b800000n), "16777216");
  assert.equal(s32(0x7f7fffffn), "3.4028235e+38");
  assert.equal(s32(1n), "1e-45");
  assert.equal(s32(0x00800000n), "1.1754944e-38");
  assert.equal(s32(0x3f800001n), "1.0000001");
  assert.equal(s32(0x3e99999an), "0.3");
  assert.equal(s32(0x40490fdbn), "3.1415927");
  assert.equal(s32(0x80000000n), "-0");
  assert.equal(s32(0x7fc00000n), "NaN");
  assert.equal(s32(0xff800000n), "-Infinity");
});

/* Random cross-checks against V8, whose Number parsing is correctly rounded and whose toString is shortest. */
function rnd64(): bigint {
  const hi = BigInt(Math.floor(Math.random() * 2 ** 32));
  const lo = BigInt(Math.floor(Math.random() * 2 ** 32));
  return (hi << 32n) | lo;
}
const dv = new DataView(new ArrayBuffer(8));
function f64bits(x: number): bigint {
  dv.setFloat64(0, x);
  return dv.getBigUint64(0);
}
function f64from(b: bigint): number {
  dv.setBigUint64(0, b);
  return dv.getFloat64(0);
}
function f32from(b: bigint): number {
  dv.setUint32(0, Number(b));
  return dv.getFloat32(0);
}

t("fuzz binary64: decode, round-trip, shortest == String(Number)", () => {
  for (let i = 0; i < 20000; i++) {
    let b = rnd64();
    if (i % 4 === 0) b &= 0x800fffffffffffffn; // subnormals
    if (i % 4 === 1) b = (b & 0x800fffffffffffffn) | (BigInt(1 + (i % 2046)) << 52n);
    const d = decode(b, BINARY64);
    if (d.cls === "nan") continue;
    const x = f64from(b);
    const expect = Object.is(x, -0) ? "-0" : String(x);
    const got = shortestDecimal(d);
    assert.equal(got, expect, `shortest of ${bitsHex(b, BINARY64)}`);
    // exact value rounds back to itself
    if (d.cls !== "infinity") assert.equal(roundToFormat(valueOf(d), BINARY64), b);
    // the shortest string parses back to the same bits
    assert.equal(bits(got, BINARY64), b, `reparse ${got}`);
  }
});

t("fuzz binary64: random decimal strings round like V8", () => {
  for (let i = 0; i < 20000; i++) {
    const nd = 1 + Math.floor(Math.random() * 25);
    let digits = "";
    for (let j = 0; j < nd; j++) digits += Math.floor(Math.random() * 10);
    const e = Math.floor(Math.random() * 660) - 340;
    const s = `${Math.random() < 0.5 ? "-" : ""}${digits[0]}.${digits.slice(1)}e${e}`;
    const expect = f64bits(Number(s));
    assert.equal(bits(s, BINARY64), expect, s);
  }
});

t("fuzz binary32: shortest round-trips, nothing shorter does, nearest rounding", () => {
  for (let i = 0; i < 20000; i++) {
    let b = BigInt(Math.floor(Math.random() * 2 ** 32));
    if (i % 3 === 0) b &= 0x807fffffn;
    const d = decode(b, BINARY32);
    if (d.cls === "nan" || d.cls === "infinity" || d.cls === "zero") continue;
    const s = shortestDecimal(d);
    assert.equal(bits(s, BINARY32), b, `float32 reparse ${s} of ${bitsHex(b, BINARY32)}`);
    const x = f32from(b);
    // V8 agrees on the value.
    assert.equal(Math.fround(Number(s)), x);
    // No representation with fewer significant digits round-trips.
    const sig = s.replace(/^-/, "").replace(/e.*$/, "").replace(".", "").replace(/^0+/, "").replace(/0+$/, "").length;
    if (sig > 1) {
      const shorter = Math.abs(x).toPrecision(sig - 1);
      assert.notEqual(bits(shorter, BINARY32), b & 0x7fffffffn, `shorter ${shorter} also round trips for ${s}`);
    }
  }
});

t("fuzz binary32: rounding a random decimal picks the nearest float, ties to even", () => {
  for (let i = 0; i < 5000; i++) {
    const nd = 1 + Math.floor(Math.random() * 20);
    let digits = "";
    for (let j = 0; j < nd; j++) digits += Math.floor(Math.random() * 10);
    const e = Math.floor(Math.random() * 100) - 60;
    const s = `${digits[0]}.${digits.slice(1)}e${e}`;
    const v = val(s);
    if (v.kind !== "finite" || v.num === 0n) continue;
    const b = roundToFormat(v, BINARY32);
    const d = decode(b, BINARY32);
    if (d.cls === "infinity") continue;
    const err = (bb: bigint) => {
      const dd = decode(bb, BINARY32);
      const r = roundingReport(v, dd);
      return r.error ? (r.error.digits * 10n ** BigInt(2000 - r.error.scale)) : 0n;
    };
    const here = err(b);
    if (b > 0n) assert.ok(here <= err(b - 1n), `lower neighbor closer for ${s}`);
    if (b < 0x7f7fffffn) assert.ok(here <= err(b + 1n), `upper neighbor closer for ${s}`);
  }
});

/* 0.1 + 0.2 */
t("0.1 + 0.2", () => {
  const r64 = addInFormat(val("0.1"), val("0.2"), BINARY64);
  assert.equal(bitsHex(r64.sum.bits, BINARY64), "0x3FD3333333333334");
  assert.equal(bitsHex(r64.direct.bits, BINARY64), "0x3FD3333333333333");
  assert.equal(r64.equal, false);
  assert.equal(r64.apart, 1n);
  assert.equal(shortestDecimal(r64.sum), "0.30000000000000004");
  // The exact sum of the stored operands is exactly the midpoint, so ties-to-even decides.
  assert.equal(decimalPlain(valueDecimal(r64.exactSum)!), "0.3000000000000000166533453693773481063544750213623046875");
  assert.equal(decimalPlain(exactDecimal(r64.sum)!), "0.3000000000000000444089209850062616169452667236328125");
  assert.equal(decimalPlain(exactDecimal(r64.direct)!), "0.299999999999999988897769753748434595763683319091796875");
  assert.equal(0.1 + 0.2, f64from(r64.sum.bits));
  const r32 = addInFormat(val("0.1"), val("0.2"), BINARY32);
  assert.equal(r32.equal, true);
  assert.equal(bitsHex(r32.sum.bits, BINARY32), "0x3E99999A");
  assert.equal(Math.fround(Math.fround(0.1) + Math.fround(0.2)), Math.fround(0.3));
});
t("addition specials", () => {
  const z = addInFormat(val("-0"), val("-0"), BINARY64);
  assert.equal(z.sum.bits, 0x8000000000000000n);
  const z2 = addInFormat(val("1"), val("-1"), BINARY64);
  assert.equal(z2.sum.bits, 0n);
  const n = addInFormat(val("inf"), val("-inf"), BINARY32);
  assert.equal(n.sum.cls, "nan");
  assert.equal(n.equal, false);
  const big = addInFormat(val("3e38"), val("3e38"), BINARY32);
  assert.equal(big.sum.cls, "infinity");
  // random agreement with JS doubles
  for (let i = 0; i < 5000; i++) {
    const a = (Math.random() - 0.5) * 10 ** Math.floor(Math.random() * 40 - 20);
    const b = (Math.random() - 0.5) * 10 ** Math.floor(Math.random() * 40 - 20);
    const r = addInFormat(val(String(a)), val(String(b)), BINARY64);
    assert.equal(r.sum.bits, f64bits(a + b), `${a} + ${b}`);
  }
});

/* Ties, measured against the gap on the input's side. */
t("tie detection", () => {
  const rep = (s: string, f: Format) => roundingReport(val(s), decode(bits(s, f), f));
  assert.equal(rep("16777217", BINARY32).tie, true);
  assert.equal(rep("16777219", BINARY32).tie, true);
  assert.equal(rep("16777218", BINARY32).tie, false);
  assert.equal(rep("0.1", BINARY64).tie, false);
  assert.equal(rep("9007199254740993", BINARY64).tie, true);
  assert.equal(rep("-9007199254740993", BINARY64).tie, true);
  // 1 - 2^-25 is halfway between 1 - 2^-24 and 1. The gap below 1.0 is
  // 2^-24, half the ULP above it, so this is a tie even though the error is
  // a quarter of the stored value's ULP. Ties to even picks 1.0.
  const half = roundingReport(val("0x0.ffffff8p0"), decode(bits("0x0.ffffff8p0", BINARY32), BINARY32));
  assert.equal(bitsHex(bits("0x0.ffffff8p0", BINARY32), BINARY32), "0x3F800000");
  assert.equal(half.tie, true);
  assert.equal(half.ulps, 0.25); // stored 1.0 minus input 1 - 2^-25
  const quarter = roundingReport(val("0x0.ffffffcp0"), decode(bits("0x0.ffffffcp0", BINARY32), BINARY32));
  assert.equal(quarter.tie, false);
  // Same thing negative.
  const negHalf = roundingReport(val("-0x0.ffffff8p0"), decode(bits("-0x0.ffffff8p0", BINARY32), BINARY32));
  assert.equal(negHalf.tie, true);
  // Half the smallest subnormal ties to zero; a hair more does not tie and rounds up.
  assert.equal(roundingReport(val("0x1p-150"), decode(bits("0x1p-150", BINARY32), BINARY32)).tie, true);
  assert.equal(roundingReport(val("0x1p-150"), decode(bits("0x1p-150", BINARY32), BINARY32)).kind, "underflow");
  assert.equal(roundingReport(val("0x3p-150"), decode(bits("0x3p-150", BINARY32), BINARY32)).tie, true);
  // The 0.1 + 0.2 exact sum is a midpoint.
  const r64 = addInFormat(val("0.1"), val("0.2"), BINARY64);
  assert.equal(roundingReport(r64.exactSum, r64.sum).tie, true);
  // Random float32 midpoints computed independently are always ties.
  for (let i = 0; i < 3000; i++) {
    const b = BigInt(1 + Math.floor(Math.random() * 0x7f7ffffe));
    const lo = valueOf(decode(b, BINARY32));
    const hi = valueOf(decode(b + 1n, BINARY32));
    if (lo.kind !== "finite" || hi.kind !== "finite") continue;
    const mid: Value = { kind: "finite", neg: false, num: lo.num * hi.den + hi.num * lo.den, den: 2n * lo.den * hi.den };
    const stored = decode(roundToFormat(mid, BINARY32), BINARY32);
    assert.ok(stored.bits === b || stored.bits === b + 1n);
    assert.equal(stored.bits & 1n, 0n, "ties go to the even significand");
    assert.equal(roundingReport(mid, stored).tie, true, `midpoint above ${bitsHex(b, BINARY32)}`);
    // A point three quarters of the way is not a tie.
    const q3: Value = { kind: "finite", neg: false, num: lo.num * hi.den + 3n * hi.num * lo.den, den: 4n * lo.den * hi.den };
    assert.equal(roundingReport(q3, decode(roundToFormat(q3, BINARY32), BINARY32)).tie, false);
  }
});

t("nextUp, nextDown, negate (IEEE 754 5.3.1, 5.5.1)", () => {
  const h = (b: bigint) => bitsHex(b, BINARY32);
  assert.equal(h(nextUp(0n, BINARY32)), "0x00000001");
  assert.equal(h(nextUp(0x80000000n, BINARY32)), "0x00000001");
  assert.equal(h(nextUp(0x3f800000n, BINARY32)), "0x3F800001");
  assert.equal(h(nextUp(0x7f7fffffn, BINARY32)), "0x7F800000");
  assert.equal(h(nextUp(0x7f800000n, BINARY32)), "0x7F800000");
  assert.equal(h(nextUp(0xff800000n, BINARY32)), "0xFF7FFFFF");
  assert.equal(h(nextUp(0x80000001n, BINARY32)), "0x80000000");
  assert.equal(h(nextUp(0xbf800000n, BINARY32)), "0xBF7FFFFF");
  assert.equal(h(nextUp(0x7fa00000n, BINARY32)), "0x7FE00000");
  assert.equal(h(nextDown(0n, BINARY32)), "0x80000001");
  assert.equal(h(nextDown(0x80000000n, BINARY32)), "0x80000001");
  assert.equal(h(nextDown(1n, BINARY32)), "0x00000000");
  assert.equal(h(nextDown(0x3f800000n, BINARY32)), "0x3F7FFFFF");
  assert.equal(h(nextDown(0xff7fffffn, BINARY32)), "0xFF800000");
  assert.equal(h(nextDown(0xff800000n, BINARY32)), "0xFF800000");
  assert.equal(h(nextDown(0x7f800000n, BINARY32)), "0x7F7FFFFF");
  assert.equal(h(negateBits(0x7fc00000n, BINARY32)), "0xFFC00000");
  assert.equal(h(negateBits(0n, BINARY32)), "0x80000000");
  assert.equal(bitsHex(nextUp(0x3fb999999999999an, BINARY64), BINARY64), "0x3FB999999999999B");
  // Against V8 doubles: nextUp(x) is greater than x and nothing lies between.
  for (let i = 0; i < 5000; i++) {
    const b = rnd64();
    const d = decode(b, BINARY64);
    if (d.cls === "nan") continue;
    const x = f64from(b);
    const up = f64from(nextUp(b, BINARY64));
    const down = f64from(nextDown(b, BINARY64));
    if (x !== Infinity) assert.ok(up > x, `nextUp ${x}`);
    if (x !== -Infinity) assert.ok(down < x, `nextDown ${x}`);
    if (Number.isFinite(x) && Number.isFinite(up) && up !== 0 && x !== 0) {
      // Midpoint of x and nextUp(x) rounds to one of them.
      const mid = x / 2 + up / 2;
      assert.ok(mid === x || mid === up);
    }
  }
});

t("decimalShort", () => {
  assert.equal(decimalShort(rationalToDecimal(false, 55511151231257827021181583404541015625n, 10n ** 55n)!, 3), "5.55e-18");
  assert.equal(decimalShort(rationalToDecimal(false, 99996n, 10000n)!, 4), "1e+1");
  assert.equal(decimalShort(rationalToDecimal(false, 125n, 100n)!, 2), "1.2e+0");
  assert.equal(decimalShort(rationalToDecimal(false, 135n, 100n)!, 2), "1.4e+0");
  assert.equal(decimalShort(rationalToDecimal(true, 1n, 1n)!, 4), "-1e+0");
  assert.equal(decimalShort(rationalToDecimal(false, 0n, 1n)!, 4), "0");
  assert.equal(decimalShort(exactDecimal(decode(1n, BINARY64))!, 4), "4.941e-324");
  assert.equal(decimalShort(exactDecimal(decode(0x7fefffffffffffffn, BINARY64))!, 4), "1.798e+308");
});

t("infinity sign", () => {
  assert.equal(hex("∞", BINARY32), "0x7F800000");
  assert.equal(hex("-∞", BINARY64), "0xFFF0000000000000");
});

console.log(`ieee754-inspector: ${passed} test groups passed`);

// Independent verifier cases (second pass): published encodings, overflow and underflow midpoints, Math.fround and hardware-sum fuzzing.
import "./ieee754-inspector.verifier.ts"; // hoisted: runs before the groups above
