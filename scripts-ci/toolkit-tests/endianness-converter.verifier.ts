import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  bswap, floatView, intView, networkReadings, parseHexBytes, parseInteger, swapWithin, integerToBytes,
} from "../../client/src/lib/toolkit/endianness-converter.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; } catch (e) { console.error("FAIL", name); throw e; }
}
const ok = (s: string, w: any = "auto") => { const p = parseInteger(s, w); if (p.kind !== "ok") throw new Error(s + " " + JSON.stringify(p)); return p; };

t("0x12345678 little endian is 0x78563412", () => {
  const p = ok("0x12345678");
  assert.equal(p.width, 32);
  assert.deepEqual(p.bytes, [0x12, 0x34, 0x56, 0x78]);
  const le = intView(p.bytes, 0, 32, "little")!;
  assert.equal(le.unsigned, 0x78563412n);
  assert.equal(le.hex, "0x78563412");
  assert.equal(le.msbIndex, 3);
});
t("int16 0x8000 both orders", () => {
  const be = intView([0x80, 0x00], 0, 16, "big")!;
  assert.equal(be.unsigned, 32768n); assert.equal(be.signed, -32768n);
  const le = intView([0x80, 0x00], 0, 16, "little")!;
  assert.equal(le.unsigned, 128n); assert.equal(le.signed, 128n);
});
t("htonl(10.0.0.1)", () => {
  assert.equal(bswap(0x0a000001n, 32), 0x0100000an);
  assert.equal(bswap(0x0102030405060708n, 64), 0x0807060504030201n);
  assert.equal(bswap(0x1234n, 16), 0x3412n);
  const n = networkReadings([0x0a, 0x00, 0x00, 0x01], 0);
  assert.deepEqual(n.map((r) => r.width), [16, 32]);
  assert.equal(n[1].wire, 167772161n);
  assert.equal(n[1].littleHostLoad, 0x0100000an);
});
t("integer range boundaries", () => {
  assert.deepEqual(ok("65535").bytes, [0xff, 0xff]); assert.equal(ok("65535").width, 16);
  assert.deepEqual(ok("65536").bytes, [0, 1, 0, 0]);
  assert.deepEqual(ok("-32768").bytes, [0x80, 0]);
  assert.deepEqual(ok("-32769").bytes, [0xff, 0xff, 0x7f, 0xff]);
  assert.deepEqual(ok("4294967295").bytes, [255, 255, 255, 255]);
  assert.equal(ok("4294967296").width, 64);
  assert.deepEqual(ok("18446744073709551615").bytes, Array(8).fill(255));
  assert.deepEqual(ok("-9223372036854775808").bytes, [0x80, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(parseInteger("18446744073709551616", "auto").kind, "error");
  assert.equal(parseInteger("-9223372036854775809", "auto").kind, "error");
  assert.equal(parseInteger("70000", 16).kind, "error");
  assert.equal(parseInteger("-32769", 16).kind, "error");
  assert.deepEqual(ok("-1", 64).bytes, Array(8).fill(255));
  assert.deepEqual(ok("0o177777").bytes, [255, 255]);
  assert.deepEqual(ok("0B1000000000000000").bytes, [0x80, 0]);
  assert.deepEqual(ok("-0").bytes, [0, 0]);
  assert.deepEqual(ok("1 000 000").bytes, integerToBytes(1000000n, 32));
});
t("malformed integers never throw and give errors", () => {
  for (const s of ["-", "+", "0x", "0b", "1.5", "1e3", "deadbeef", "0b102", "0o8", "--5", "0x-5", "1,5", "١٢٣", "😀", "\u0000", "9".repeat(71), "9".repeat(250), "0x1,000", "12abc"]) {
    const p = parseInteger(s, "auto");
    assert.equal(p.kind, "error", s);
    assert.ok(p.kind === "error" && p.message.length > 5);
  }
  assert.equal(parseInteger("   ", "auto").kind, "empty");
});
t("malformed hex bytes never throw", () => {
  for (const s of ["😀", "\u0000", "0x0x12", "zz", "12 345 67", "DE|AD", "−12"]) {
    const p = parseHexBytes(s);
    assert.equal(p.kind, "error", s);
  }
  assert.equal(parseHexBytes(" \t\n ").kind, "empty");
});
t("random bytes agree with Node Buffer readers", () => {
  for (let i = 0; i < 3000; i++) {
    const buf = randomBytes(8);
    const bytes = [...buf];
    for (const [w, o] of [[16, "big"], [16, "little"], [32, "big"], [32, "little"], [64, "big"], [64, "little"]] as const) {
      const v = intView(bytes, 0, w, o)!;
      const be = o === "big";
      const u = w === 16 ? BigInt(be ? buf.readUInt16BE() : buf.readUInt16LE()) : w === 32 ? BigInt(be ? buf.readUInt32BE() : buf.readUInt32LE()) : be ? buf.readBigUInt64BE() : buf.readBigUInt64LE();
      const s = w === 16 ? BigInt(be ? buf.readInt16BE() : buf.readInt16LE()) : w === 32 ? BigInt(be ? buf.readInt32BE() : buf.readInt32LE()) : be ? buf.readBigInt64BE() : buf.readBigInt64LE();
      assert.equal(v.unsigned, u); assert.equal(v.signed, s);
    }
    for (const [w, o] of [[32, "big"], [32, "little"], [64, "big"], [64, "little"]] as const) {
      const fv = floatView(bytes, 0, w, o)!;
      const be = o === "big";
      const x = w === 32 ? (be ? buf.readFloatBE() : buf.readFloatLE()) : be ? buf.readDoubleBE() : buf.readDoubleLE();
      if (Number.isNaN(x)) { assert.ok(fv.text.includes("NaN")); continue; }
      const num = Number(fv.text.replace(" (subnormal)", ""));
      if (w === 64) assert.ok(Object.is(num, x), `${fv.text} vs ${x}`);
      else assert.ok(Object.is(Math.fround(num), x), `${fv.text} vs ${x}`);
    }
  }
});
t("known float readings", () => {
  // 1.0 as a double, bytes reversed: 0x000000000000F03F is the subnormal 61503 x 2^-1074.
  const one = [0x3f, 0xf0, 0, 0, 0, 0, 0, 0];
  assert.equal(floatView(one, 0, 64, "big")!.text, "1");
  const le = floatView(one, 0, 64, "little")!;
  assert.equal(le.value, 61503 * 2 ** -1074);
  assert.ok(le.text.endsWith("(subnormal)"));
  assert.equal(floatView([0x7f, 0x80, 0, 0], 0, 32, "big")!.text, "Infinity");
  assert.equal(floatView([0xff, 0x80, 0, 0], 0, 32, "big")!.text, "-Infinity");
  assert.equal(floatView([0xc0, 0x49, 0x0f, 0xdb], 0, 32, "big")!.text, "-3.1415927");
  assert.equal(floatView([0x7f, 0xc0, 0, 0], 0, 32, "big")!.text, "NaN (quiet, payload 0x0)");
  assert.equal(floatView([0x00, 0x80, 0x00, 0x00], 0, 32, "big")!.text, "1.1754944e-38");
  assert.equal(floatView([0x00, 0x00, 0x80, 0x00], 0, 32, "big")!.text, "4.5918e-41 (subnormal)");
  assert.equal(floatView([0, 0, 0, 0, 0, 0, 0, 0x80], 0, 64, "little")!.text, "-0");
});
t("offsets and swaps", () => {
  const b = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(intView(b, 4, 32, "big")!.unsigned, 0x05060708n);
  assert.equal(intView(b, 5, 32, "big"), null);
  assert.equal(intView(b, -1, 16, "big"), null);
  assert.equal(intView(b, 1.5, 16, "big"), null);
  assert.deepEqual(swapWithin(b, 4), [4, 3, 2, 1, 8, 7, 6, 5]);
  assert.deepEqual(swapWithin(b, 2), [2, 1, 4, 3, 6, 5, 8, 7]);
  assert.equal(swapWithin([1, 2, 3], 2), null);
});
console.log(`endianness verifier: ${passed} groups passed`);
