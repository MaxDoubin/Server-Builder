import assert from "node:assert/strict";
import {
  analyze,
  classify,
  parseBinary,
  parseInetAton,
  parseNaiveDecimal,
  parseStrict,
  parseWhatwg,
  toBinary,
  toDottedDecimal,
  toDottedHex,
  toDottedOctal,
  toHex,
  toInteger,
  toMappedIpv6,
  whatwgEndsInNumber,
  type ParseOutcome,
} from "../../client/src/lib/toolkit/ip-address-converter.ts";

let n = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    n += 1;
  } catch (e) {
    console.error("FAIL", name);
    throw e;
  }
}

const LOOP = 2130706433; // 127.0.0.1
const val = (o: ParseOutcome) => (o.ok ? o.value : null);

t("formatting 192.168.0.1", () => {
  const v = 3232235521;
  assert.equal(toDottedDecimal(v), "192.168.0.1");
  assert.equal(toInteger(v), "3232235521");
  assert.equal(toHex(v), "0xC0A80001");
  assert.equal(toDottedHex(v), "0xC0.0xA8.0x00.0x01");
  assert.equal(toDottedOctal(v), "0300.0250.0000.0001");
  assert.equal(toBinary(v), "11000000.10101000.00000000.00000001");
  assert.equal(toMappedIpv6(v), "::ffff:192.168.0.1");
});

t("formatting extremes", () => {
  assert.equal(toHex(0), "0x00000000");
  assert.equal(toHex(4294967295), "0xFFFFFFFF");
  assert.equal(toDottedOctal(4294967295), "0377.0377.0377.0377");
  assert.equal(toDottedDecimal(4294967295), "255.255.255.255");
});

t("round trip: every output notation parses back with inet_aton", () => {
  for (const v of [0, 1, 255, 256, 65535, LOOP, 3232235521, 2147483648, 4294967295]) {
    assert.equal(val(parseInetAton(toDottedDecimal(v))), v);
    assert.equal(val(parseInetAton(toInteger(v))), v);
    assert.equal(val(parseInetAton(toHex(v))), v);
    assert.equal(val(parseInetAton(toDottedHex(v))), v);
    assert.equal(val(parseInetAton(toDottedOctal(v))), v);
    assert.equal(val(parseWhatwg(toDottedOctal(v))), v);
    assert.equal(val(parseWhatwg(toDottedHex(v))), v);
    assert.equal(parseBinary(toBinary(v)), v);
  }
});

t("inet_aton legacy forms (4.2BSD semantics)", () => {
  assert.equal(val(parseInetAton("127.1")), LOOP);
  assert.equal(val(parseInetAton("127.0.1")), LOOP);
  assert.equal(val(parseInetAton("0x7f.0.0.1")), LOOP);
  assert.equal(val(parseInetAton("0177.0.0.1")), LOOP);
  assert.equal(val(parseInetAton("2130706433")), LOOP);
  assert.equal(val(parseInetAton("0x7f000001")), LOOP);
  assert.equal(val(parseInetAton("017700000001")), LOOP);
  assert.equal(val(parseInetAton("0X7F.1")), LOOP);
  assert.equal(val(parseInetAton("010.0.0.1")), 134217729); // 8.0.0.1
  assert.equal(val(parseInetAton("0")), 0);
  assert.equal(val(parseInetAton("1.2.65535")), toNum("1.2.255.255"));
  assert.equal(val(parseInetAton("1.16777215")), toNum("1.255.255.255"));
  assert.equal(val(parseInetAton("4294967295")), 4294967295);
});

function toNum(s: string): number {
  const o = parseStrict(s);
  if (!o.ok) throw new Error(s);
  return o.value;
}

t("inet_aton rejections", () => {
  for (const s of [
    "4294967296", // 33 bits
    "1.2.65536", // last part over 16 bits
    "1.16777216",
    "256.1",
    "1.2.3.4.5",
    "127.0.0.1.", // trailing dot
    "127..1",
    ".1",
    "08.0.0.1", // 8 is not octal
    "0x", // strtoul consumes only the 0
    "0x.1",
    "1x",
    "a.b.c.d",
    "0xFFFFFFFFFFFFFFFFFFFF",
  ]) {
    const o = parseInetAton(s);
    assert.equal(o.ok, false, `expected rejection of ${s}`);
  }
});

t("inet_aton ignores what follows whitespace", () => {
  const o = parseInetAton("127.1 trailing words");
  assert.ok(o.ok && o.value === LOOP && o.note && /whitespace/.test(o.note));
});

t("inet_aton part widths", () => {
  const o = parseInetAton("10.1.258");
  assert.ok(o.ok);
  if (o.ok) assert.deepEqual(o.parts.map((p) => p.bits), [8, 8, 16]);
  const p = parseInetAton("0x7f.1");
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(p.parts.map((x) => [x.radix, x.bits]), [[16, 8], [10, 24]]);
});

t("WHATWG URL Standard host parsing", () => {
  assert.equal(val(parseWhatwg("127.1")), LOOP);
  assert.equal(val(parseWhatwg("0x7f.1")), LOOP);
  assert.equal(val(parseWhatwg("0177.0.0.1")), LOOP);
  assert.equal(val(parseWhatwg("2130706433")), LOOP);
  assert.equal(val(parseWhatwg("0X7F.0.0.1")), LOOP);
  // One trailing dot is allowed (Node: new URL("http://127.0.0.1./").hostname === "127.0.0.1").
  const td = parseWhatwg("127.0.0.1.");
  assert.ok(td.ok && td.value === LOOP && td.note);
  // A bare 0x is zero in the URL Standard.
  assert.equal(val(parseWhatwg("0x.0.0.1")), 1);
  // Domain versus invalid.
  const d = parseWhatwg("localhost");
  assert.ok(!d.ok && d.kind === "domain");
  const d2 = parseWhatwg("1.2.3.example");
  assert.ok(!d2.ok && d2.kind === "domain");
  const inv = parseWhatwg("foo.1");
  assert.ok(!inv.ok && inv.kind === "invalid");
  const five = parseWhatwg("1.2.3.4.5");
  assert.ok(!five.ok && five.kind === "invalid");
  assert.equal(parseWhatwg("256.0.0.1").ok, false);
  assert.equal(parseWhatwg("1.2.3.256").ok, false);
  assert.equal(parseWhatwg("09.0.0.1").ok, false);
  assert.equal(parseWhatwg("127..1").ok, false);
  assert.equal(parseWhatwg("127.1 x").ok, false);
  assert.equal(whatwgEndsInNumber("."), false);
  assert.equal(whatwgEndsInNumber("a.0x1f"), true);
});

t("WHATWG agrees with Node's URL implementation", () => {
  const cases = ["127.1", "0x7f.1", "0177.0.0.1", "2130706433", "127.0.0.1.", "0x.0.0.1", "1.2.65535", "0x7f000001", "010.0.0.1"];
  for (const c of cases) {
    const ours = parseWhatwg(c);
    const node = new URL(`http://${c}/`).hostname;
    assert.ok(ours.ok, c);
    if (ours.ok) assert.equal(toDottedDecimal(ours.value), node, c);
  }
  for (const c of ["1.2.3.4.5", "256.1.1.1", "09.1.1.1", "foo.1", "1.16777216"]) {
    assert.equal(parseWhatwg(c).ok, false, c);
    assert.throws(() => new URL(`http://${c}/`), c);
  }
});

t("strict", () => {
  assert.equal(val(parseStrict("192.168.0.1")), 3232235521);
  assert.equal(val(parseStrict("0.0.0.0")), 0);
  for (const s of ["127.1", "0177.0.0.1", "010.0.0.1", "256.0.0.0", "1.2.3.4.5", "0x7f.0.0.1", "", "1..2.3"]) {
    assert.equal(parseStrict(s).ok, false, s);
  }
});

t("naive decimal reads leading zeros as decimal", () => {
  assert.equal(toDottedDecimal(val(parseNaiveDecimal("0177.0.0.1"))!), "177.0.0.1");
  assert.equal(toDottedDecimal(val(parseNaiveDecimal("010.8.8.8"))!), "10.8.8.8");
  assert.equal(parseNaiveDecimal("127.1").ok, false);
});

t("binary", () => {
  assert.equal(parseBinary("11000000.10101000.00000000.00000001"), 3232235521);
  assert.equal(parseBinary("0b11000000101010000000000000000001"), 3232235521);
  assert.equal(parseBinary("0b11000000_10101000_00000000_00000001"), 3232235521);
  assert.equal(parseBinary("1100000010101000"), null);
  assert.equal(parseBinary("127.0.0.1"), null);
});

t("classify", () => {
  assert.equal(classify(LOOP)?.name, "Loopback");
  assert.match(classify(toNum("169.254.169.254"))!.name, /metadata/);
  assert.equal(classify(toNum("169.254.1.1"))?.name, "Link-local");
  assert.equal(classify(toNum("172.31.255.255"))?.rfc, "RFC 1918");
  assert.equal(classify(toNum("172.32.0.0")), null);
  assert.equal(classify(toNum("100.64.0.0"))?.rfc, "RFC 6598");
  assert.equal(classify(toNum("100.128.0.0")), null);
  assert.equal(classify(toNum("8.8.8.8")), null);
  assert.equal(classify(4294967295)?.name, "Limited broadcast");
  assert.equal(classify(toNum("240.0.0.1"))?.rfc, "RFC 1112");
  assert.equal(classify(0)?.rfc, "RFC 1122");
  assert.equal(classify(toNum("198.19.255.255"))?.name, "Benchmarking");
});

t("analyze", () => {
  assert.equal(analyze("").kind, "empty");
  assert.equal(analyze("   ").kind, "empty");
  assert.equal(analyze("x".repeat(300)).kind, "error");
  assert.equal(analyze("１２７.0.0.1").kind, "error");
  const url = analyze("http://127.0.0.1/");
  assert.ok(url.kind === "error" && /scheme/.test(url.message));

  const a = analyze(" 0177.0.0.1 ");
  assert.ok(a.kind === "ok");
  if (a.kind === "ok") {
    assert.equal(a.value, LOOP);
    assert.equal(a.via, "inet_aton");
    assert.equal(a.legacy, true);
    assert.equal(a.conflict, true); // naive reads 177.0.0.1
  }
  const b = analyze("192.168.0.1");
  assert.ok(b.kind === "ok" && b.value === 3232235521 && !b.legacy && !b.conflict);
  const c = analyze("127.0.0.1.");
  assert.ok(c.kind === "ok" && c.via === "whatwg" && c.value === LOOP);
  const d = analyze("11000000.10101000.00000000.00000001");
  assert.ok(d.kind === "ok" && d.via === "binary" && d.value === 3232235521);
  const e = analyze("localhost");
  assert.ok(e.kind === "ok" && e.value === null);
  const f = analyze("2130706433");
  assert.ok(f.kind === "ok" && f.value === LOOP && f.legacy && !f.conflict);
});

t("adversarial input never throws", () => {
  const junk = ["....", ".", "0x", "0b", "9".repeat(256), "0x" + "f".repeat(250), "1.".repeat(120), "0.0.0.0.0.0", "\t\t1", "0 0 0 0"];
  for (const j of junk) {
    analyze(j);
    parseInetAton(j);
    parseWhatwg(j);
    parseStrict(j);
    parseNaiveDecimal(j);
  }
});

console.log(`ip-address-converter: ${n} tests passed`);

// Independent verifier cases (run as part of this file).
import "./ip-address-converter.verify.test.ts";
