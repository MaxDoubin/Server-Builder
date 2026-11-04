import assert from "node:assert/strict";
import {
  MAX_BYTES,
  bswap,
  bytesToEscaped,
  bytesToHex,
  floatView,
  hexValue,
  hostIsLittleEndian,
  integerToBytes,
  intView,
  networkReadings,
  parseHexBytes,
  parseInteger,
  reverseBytes,
  swapWithin,
} from "../../client/src/lib/toolkit/endianness-converter.ts";

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
function okBytes(s: string): number[] {
  const p = parseHexBytes(s);
  if (p.kind !== "ok") throw new Error(`expected ok for ${s}: ${JSON.stringify(p)}`);
  return p.bytes;
}
const DEADBEEF = [0xde, 0xad, 0xbe, 0xef];

t("hex byte forms", () => {
  for (const s of ["DEADBEEF", "DE AD BE EF", "de:ad:be:ef", "0xDEADBEEF", "0xde 0xad 0xbe 0xef", "\\xde\\xad\\xbe\\xef", "dead.beef", "de-ad-be-ef", "DE,AD,BE,EF", "  deadbeef\n", "DEAD_BEEF", "DEAD BEEF"]) {
    assert.deepEqual(okBytes(s), DEADBEEF, s);
  }
  assert.deepEqual(okBytes("1 2 3"), [1, 2, 3]);
  assert.deepEqual(okBytes("0:1a:2b"), [0, 0x1a, 0x2b]);
  const odd = parseHexBytes("0x123");
  assert.ok(odd.kind === "ok" && odd.note !== null);
  assert.deepEqual(okBytes("0x123"), [0x01, 0x23]);
  assert.deepEqual(okBytes("f"), [0x0f]);
});
t("hex byte errors", () => {
  assert.equal(parseHexBytes("").kind, "empty");
  for (const s of ["DEA DBEEF", "XYZ", "12 g4", "-1", "::", "0x"]) {
    const p = parseHexBytes(s);
    assert.equal(p.kind, "error", s);
  }
  const big = parseHexBytes("00".repeat(MAX_BYTES + 1));
  assert.ok(big.kind === "error" && big.message.includes(String(MAX_BYTES + 1)));
  assert.equal(parseHexBytes("00".repeat(MAX_BYTES)).kind, "ok");
  assert.equal(parseHexBytes("0".repeat(100000)).kind, "error");
});

t("DEADBEEF read both ways", () => {
  const be = intView(DEADBEEF, 0, 32, "big")!;
  const le = intView(DEADBEEF, 0, 32, "little")!;
  assert.equal(be.hex, "0xDEADBEEF");
  assert.equal(be.unsigned, 3735928559n);
  assert.equal(be.signed, -559038737n);
  assert.equal(be.msbIndex, 0);
  assert.equal(le.hex, "0xEFBEADDE");
  assert.equal(le.unsigned, 4022250974n);
  assert.equal(le.signed, -272716322n);
  assert.equal(le.msbIndex, 3);
  const be16 = intView(DEADBEEF, 0, 16, "big")!;
  const le16 = intView(DEADBEEF, 0, 16, "little")!;
  assert.equal(be16.unsigned, 57005n);
  assert.equal(be16.signed, -8531n);
  assert.equal(le16.unsigned, 44510n);
  assert.equal(le16.signed, -21026n);
  assert.equal(intView(DEADBEEF, 0, 64, "big"), null);
  // offset
  const mid = intView(DEADBEEF, 1, 16, "big")!;
  assert.equal(mid.hex, "0xADBE");
  assert.equal(intView(DEADBEEF, 3, 16, "big"), null);
  assert.equal(intView(DEADBEEF, -1, 16, "big"), null);
  assert.equal(intView(DEADBEEF, 0.5, 16, "big"), null);
});
t("64-bit", () => {
  const b = okBytes("0123456789ABCDEF");
  const be = intView(b, 0, 64, "big")!;
  const le = intView(b, 0, 64, "little")!;
  assert.equal(be.unsigned, 0x0123456789abcdefn);
  assert.equal(be.unsigned, 81985529216486895n);
  assert.equal(le.unsigned, 0xefcdab8967452301n);
  assert.equal(le.unsigned, 17279655951921914625n);
  assert.equal(le.signed, -1167088121787636991n);
  assert.equal(le.hex, "0xEFCDAB8967452301");
});

t("integer input", () => {
  const p = parseInteger("0xDEADBEEF", "auto");
  assert.ok(p.kind === "ok" && p.width === 32);
  assert.deepEqual(p.kind === "ok" && p.bytes, DEADBEEF);
  const m1 = parseInteger("-1", "auto");
  assert.ok(m1.kind === "ok" && m1.width === 16 && bytesToHex(m1.bytes) === "FF FF");
  const m1w = parseInteger("-1", 64);
  assert.ok(m1w.kind === "ok" && bytesToHex(m1w.bytes) === "FF FF FF FF FF FF FF FF");
  const u16 = parseInteger("65535", "auto");
  assert.ok(u16.kind === "ok" && u16.width === 16);
  const u32 = parseInteger("65536", "auto");
  assert.ok(u32.kind === "ok" && u32.width === 32 && bytesToHex(u32.bytes) === "00 01 00 00");
  assert.ok((() => { const r = parseInteger("-32768", "auto"); return r.kind === "ok" && r.width === 16 && bytesToHex(r.bytes) === "80 00"; })());
  assert.ok((() => { const r = parseInteger("-32769", "auto"); return r.kind === "ok" && r.width === 32; })());
  const max = parseInteger("18446744073709551615", "auto");
  assert.ok(max.kind === "ok" && max.width === 64 && bytesToHex(max.bytes, "") === "FF".repeat(8));
  const min = parseInteger("-9223372036854775808", "auto");
  assert.ok(min.kind === "ok" && bytesToHex(min.bytes, "") === "80" + "00".repeat(7));
  assert.equal(parseInteger("18446744073709551616", "auto").kind, "error");
  assert.equal(parseInteger("-9223372036854775809", "auto").kind, "error");
  assert.equal(parseInteger("70000", 16).kind, "error");
  assert.equal(parseInteger("-40000", 16).kind, "error");
  assert.ok((() => { const r = parseInteger("300", 32); return r.kind === "ok" && bytesToHex(r.bytes) === "00 00 01 2C"; })());
  assert.ok((() => { const r = parseInteger("0b1010", "auto"); return r.kind === "ok" && r.value === 10n; })());
  assert.ok((() => { const r = parseInteger("0o777", "auto"); return r.kind === "ok" && r.value === 511n; })());
  assert.ok((() => { const r = parseInteger("1_000_000", "auto"); return r.kind === "ok" && r.value === 1000000n; })());
  assert.ok((() => { const r = parseInteger("1,000,000", "auto"); return r.kind === "ok" && r.value === 1000000n; })());
  assert.ok((() => { const r = parseInteger("0755", "auto"); return r.kind === "ok" && r.value === 755n && r.note !== null; })());
  for (const bad of ["12a", "dead", "1.5", "0x", "0b102", "0xG", "--5", "1e5"]) {
    assert.equal(parseInteger(bad, "auto").kind, "error", bad);
  }
  assert.equal(parseInteger("", "auto").kind, "empty");
  assert.equal(parseInteger("9".repeat(500), "auto").kind, "error");
});
t("integerToBytes is two's complement big endian", () => {
  assert.deepEqual(integerToBytes(80n, 16), [0x00, 0x50]);
  assert.deepEqual(integerToBytes(-2n, 32), [0xff, 0xff, 0xff, 0xfe]);
  assert.deepEqual(integerToBytes(1n, 64), [0, 0, 0, 0, 0, 0, 0, 1]);
});

t("floats", () => {
  const one = okBytes("3F 80 00 00");
  const be = floatView(one, 0, 32, "big")!;
  assert.equal(be.value, 1);
  assert.equal(be.text, "1");
  const le = floatView(one, 0, 32, "little")!;
  assert.equal(le.bitsHex, "0x0000803F");
  // 0x0000803F is subnormal: 32831 x 2^-149.
  assert.equal(le.value, 32831 * 2 ** -149);
  assert.ok(le.text.endsWith("(subnormal)"));
  assert.equal(Math.fround(Number(le.text.split(" ")[0])), le.value);
  const pi = floatView(okBytes("40 09 21 FB 54 44 2D 18"), 0, 64, "big")!;
  assert.equal(pi.value, Math.PI);
  assert.equal(pi.text, "3.141592653589793");
  const piLe = floatView(okBytes("18 2D 44 54 FB 21 09 40"), 0, 64, "little")!;
  assert.equal(piLe.value, Math.PI);
  const db = floatView(DEADBEEF, 0, 32, "big")!;
  assert.equal(db.value, -6.259853398707798e18);
  assert.equal(db.text, "-6259853400000000000");
  assert.equal(Math.fround(Number(db.text)), db.value);
  const dl = floatView(DEADBEEF, 0, 32, "little")!;
  assert.equal(Math.fround(Number(dl.text)), dl.value);
  assert.equal(dl.text, "-1.1802469e+29");
  const nan = floatView(okBytes("7F A0 00 01"), 0, 32, "big")!;
  assert.ok(Number.isNaN(nan.value));
  assert.equal(nan.text, "NaN (signaling, payload 0x200001)");
  const neg0 = floatView(okBytes("80 00 00 00"), 0, 32, "big")!;
  assert.equal(neg0.text, "-0");
  assert.equal(floatView(DEADBEEF, 0, 64, "big"), null);
  assert.equal(floatView(DEADBEEF, 1, 32, "big"), null);
});

t("swaps", () => {
  assert.equal(bswap(0xdeadbeefn, 32), 0xefbeadden);
  assert.equal(bswap(0x0050n, 16), 0x5000n);
  assert.equal(bswap(0x0123456789abcdefn, 64), 0xefcdab8967452301n);
  assert.equal(bswap(bswap(0x1234n, 16), 16), 0x1234n);
  const seq = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(reverseBytes(seq), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(swapWithin(seq, 2), [2, 1, 4, 3, 6, 5, 8, 7]);
  assert.deepEqual(swapWithin(seq, 4), [4, 3, 2, 1, 8, 7, 6, 5]);
  assert.deepEqual(swapWithin(seq, 8), [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(swapWithin([1, 2, 3, 4, 5, 6], 4), null);
  assert.equal(swapWithin([], 2), null);
});

t("network readings: port 80 and 192.168.1.1", () => {
  const port = networkReadings([0x00, 0x50], 0);
  assert.equal(port.length, 1);
  assert.equal(port[0].wire, 80n);
  assert.equal(port[0].littleHostLoad, 20480n);
  assert.equal(port[0].fn, "ntohs");
  const ip = networkReadings([0xc0, 0xa8, 0x01, 0x01], 0);
  assert.equal(ip[1].wire, 0xc0a80101n);
  assert.equal(ip[1].littleHostLoad, 16885952n);
  assert.equal(ip[1].fn, "ntohl");
  assert.equal(networkReadings(okBytes("0011223344556677"), 0)[2].fn, "be64toh");
});

t("formatting", () => {
  assert.equal(hexValue(0xbeefn, 16), "0xBEEF");
  assert.equal(hexValue(-1n, 16), "0xFFFF");
  assert.equal(hexValue(1n, 64), "0x0000000000000001");
  assert.equal(bytesToEscaped([0xde, 0xad]), "\\xde\\xad");
  assert.equal(typeof hostIsLittleEndian(), "boolean");
  assert.equal(hostIsLittleEndian(), true); // x86-64 and arm64 test hosts
});

t("integer input: separators and written width", () => {
  for (const bad of ["1,5", "12,34", "1,0000", ",100", "0x1,000"]) {
    assert.equal(parseInteger(bad, "auto").kind, "error", bad);
  }
  assert.ok((() => { const r = parseInteger("-1,234", "auto"); return r.kind === "ok" && r.value === -1234n; })());
  assert.ok((() => { const r = parseInteger("−5", "auto"); return r.kind === "ok" && r.value === -5n; })());
  const w = (s: string) => { const r = parseInteger(s, "auto"); return r.kind === "ok" ? [r.width, bytesToHex(r.bytes)] : r.kind; };
  assert.deepEqual(w("0x50"), [16, "00 50"]);
  assert.deepEqual(w("0x0050"), [16, "00 50"]);
  assert.deepEqual(w("0x00000050"), [32, "00 00 00 50"]);
  assert.deepEqual(w("0x00050"), [32, "00 00 00 50"]);
  assert.deepEqual(w("0x0000000000000050"), [64, "00 00 00 00 00 00 00 50"]);
  assert.deepEqual(w("0b00000000000000000000000000000001"), [32, "00 00 00 01"]);
  assert.deepEqual(w("0b1"), [16, "00 01"]);
  // Decimal leading zeros do not widen.
  assert.deepEqual(w("00000080"), [16, "00 50"]);
  // An explicit width still wins when the value fits.
  const r = parseInteger("0x00000001", 16);
  assert.ok(r.kind === "ok" && r.width === 16);
});

console.log(`endianness-converter: ${passed} test groups passed`);

// Independent verifier cases (second pass): reference vectors, Node Buffer cross-checks, malformed input.
import "./endianness-converter.verifier.ts"; // hoisted: runs before the groups above
