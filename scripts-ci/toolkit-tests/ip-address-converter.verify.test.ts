/**
 * Independent verification cases for ip-address-converter, added by the verifier.
 * References: glibc 2.39 inet_aton (through Python's socket.inet_aton, 8,887
 * generated strings in verify-rs-ip/refs.json), Node 22's WHATWG URL parser
 * (random hosts, compared live), RFC 4291 section 2.5.5.2, RFC 5737 and the
 * IANA special-purpose registry, and hand-derived boundary values.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  toMappedIpv6,
  whatwgPercentDecode,
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
const dotted = (o: ParseOutcome) => (o.ok ? toDottedDecimal(o.value) : null);

t("reference conversions", () => {
  // 8.8.8.8 = 0x08080808 = 134744072
  const g = 134744072;
  assert.equal(toDottedDecimal(g), "8.8.8.8");
  assert.equal(toHex(g), "0x08080808");
  assert.equal(toDottedOctal(g), "0010.0010.0010.0010");
  assert.equal(toBinary(g), "00001000.00001000.00001000.00001000");
  // 169.254.169.254 = 0xA9FEA9FE = 2852039166
  assert.equal(toDottedDecimal(2852039166), "169.254.169.254");
  assert.equal(toHex(2852039166), "0xA9FEA9FE");
  assert.equal(toDottedHex(2852039166), "0xA9.0xFE.0xA9.0xFE");
  assert.equal(dotted(parseInetAton("2852039166")), "169.254.169.254");
  assert.equal(dotted(parseInetAton("0xA9FEA9FE")), "169.254.169.254");
  assert.equal(dotted(parseInetAton("0251.0376.0251.0376")), "169.254.169.254");
  assert.equal(dotted(parseInetAton("169.16689662")), "169.254.169.254");
  assert.equal(dotted(parseInetAton("169.254.43518")), "169.254.169.254");
  // RFC 4291 2.5.5.2 IPv4-mapped, RFC 5952 section 5 mixed notation.
  assert.equal(toMappedIpv6(2852039166), "::ffff:169.254.169.254");
  // 2^31 boundary: 128.0.0.0
  assert.equal(toHex(2147483648), "0x80000000");
  assert.equal(dotted(parseInetAton("2147483648")), "128.0.0.0");
  assert.equal(dotted(parseInetAton("2147483647")), "127.255.255.255");
});

t("inet_aton matches glibc 2.39 on 8,887 generated strings", () => {
  const refs = JSON.parse(
    readFileSync(
      "scripts-ci/toolkit-tests/verify-rs-ip/refs.json",
      "utf8",
    ),
  ) as { aton: Record<string, string | null> };
  let bad = 0;
  let accepted = 0;
  for (const [input, expected] of Object.entries(refs.aton)) {
    const ours = dotted(parseInetAton(input));
    if (ours !== expected) {
      bad += 1;
      if (bad < 10) console.log("MISMATCH", JSON.stringify(input), "glibc:", expected, "ours:", ours);
    }
    if (expected) accepted += 1;
  }
  assert.equal(bad, 0);
  assert.ok(accepted > 1000);
});

function nodeHost(h: string): { ok: true; host: string } | { ok: false } {
  try {
    return { ok: true, host: new URL(`http://${h}/`).hostname };
  } catch {
    return { ok: false };
  }
}

t("WHATWG model matches Node's URL parser on random hosts", () => {
  // Deterministic LCG so the run is reproducible.
  let seed = 0x2026_1031;
  const rnd = (k: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % k;
  };
  const alphabet = [..."0123456789", ..."0000", ..."xX", ..."....", ..."abcfgz", "%", "%", ..."2e3", "\t", " ", "-", "_"];
  const pct = ["%2e", "%2E", "%31", "%37", "%30", "%78", "%25", "%2f", "%zz", "%"];
  let checked = 0;
  let ipv4 = 0;
  for (let i = 0; i < 40000; i += 1) {
    const len = 1 + rnd(14);
    let h = "";
    for (let j = 0; j < len; j += 1) h += rnd(6) === 0 ? pct[rnd(pct.length)] : alphabet[rnd(alphabet.length)];
    // The URL parser strips leading and trailing spaces of the whole URL; keep hosts interior.
    if (/^[ \t]|[ \t]$/.test(h)) continue;
    const ours = parseWhatwg(h);
    const node = nodeHost(h);
    const isIpv4 = node.ok && /^\d+\.\d+\.\d+\.\d+$/.test(node.host);
    if (isIpv4) {
      ipv4 += 1;
      assert.ok(ours.ok, `ours rejected ${JSON.stringify(h)}, Node gave ${node.ok ? node.host : ""}`);
      assert.equal(dotted(ours), node.host, JSON.stringify(h));
    } else if (node.ok) {
      assert.ok(!ours.ok && ours.kind === "domain", `ours ${JSON.stringify(ours)} for ${JSON.stringify(h)}, Node domain ${node.host}`);
    } else {
      assert.ok(!ours.ok && ours.kind !== "domain", `ours accepted ${JSON.stringify(h)} as ${JSON.stringify(ours)}, Node failed`);
    }
    checked += 1;
  }
  assert.ok(checked > 30000 && ipv4 > 2000, `${checked} checked, ${ipv4} IPv4`);
});

t("WHATWG percent-decoding and tab removal (URL Standard host parser)", () => {
  assert.equal(whatwgPercentDecode("%31%32%37.1"), "127.1");
  assert.equal(whatwgPercentDecode("%zz"), "%zz");
  assert.equal(whatwgPercentDecode("%"), "%");
  assert.equal(whatwgPercentDecode("%2525"), "%25");
  assert.equal(whatwgPercentDecode("%C3%A9"), null);
  const p = parseWhatwg("%31%32%37.1");
  assert.ok(p.ok && dotted(p) === "127.0.0.1" && /percent-decoded/.test(p.note ?? ""));
  assert.equal(dotted(parseWhatwg("127%2e0%2e0%2e1")), "127.0.0.1");
  const tab = parseWhatwg("12\t7.0.0.1");
  assert.ok(tab.ok && dotted(tab) === "127.0.0.1" && /tabs/.test(tab.note ?? ""));
  const sp = parseWhatwg("127.0 .0.1");
  assert.ok(!sp.ok && sp.kind === "invalid");
  const nonAscii = parseWhatwg("%EF%BC%91.1");
  assert.ok(!nonAscii.ok && nonAscii.kind === "unmodeled");
  assert.equal(parseWhatwg("%2f").ok, false);
});

t("analyze: percent-encoded loopback is legacy, not an error", () => {
  const a = analyze("%31%32%37.1");
  assert.ok(a.kind === "ok" && a.value === 2130706433 && a.via === "whatwg" && a.legacy);
  if (a.kind === "ok") {
    const ids = Object.fromEntries(a.rows.map((r) => [r.id, r.outcome.ok]));
    assert.deepEqual(ids, { strict: false, inet_aton: false, whatwg: true, naive: false });
  }
});

t("analyze: messages for URL pieces and IPv6", () => {
  const url = analyze("http://127.0.0.1/");
  assert.ok(url.kind === "error" && /scheme/.test(url.message));
  const port = analyze("127.0.0.1:8080");
  assert.ok(port.kind === "error" && /port/.test(port.message));
  const v6 = analyze("[::1]");
  assert.ok(v6.kind === "error" && /IPv6/.test(v6.message));
  const path = analyze("127.1/admin");
  assert.ok(path.kind === "error" && /path/.test(path.message));
  const plus = analyze("127+1");
  assert.ok(plus.kind === "error" && /not part of any IPv4 notation/.test(plus.message));
  const host = analyze("my-host_name.example");
  assert.ok(host.kind === "ok" && host.value === null);
  if (host.kind === "ok") assert.equal(host.rows.find((r) => r.id === "whatwg")!.outcome.ok, false);
});

t("analyze: underscore-separated binary is reachable", () => {
  const a = analyze("0b11000000_10101000_00000000_00000001");
  assert.ok(a.kind === "ok" && a.via === "binary" && a.value === 3232235521);
});

t("analyze: binary that real parsers read as octal", () => {
  const a = analyze("00000001.00000010.00000011.00000100");
  assert.ok(a.kind === "ok" && a.via === "binary");
  if (a.kind === "ok") {
    assert.equal(toDottedDecimal(a.value!), "1.2.3.4");
    assert.equal(dotted(a.rows.find((r) => r.id === "inet_aton")!.outcome), "1.8.9.64");
    assert.equal(dotted(a.rows.find((r) => r.id === "whatwg")!.outcome), "1.8.9.64");
    assert.equal(dotted(a.rows.find((r) => r.id === "naive")!.outcome), "1.10.11.100");
    assert.equal(a.conflict, true);
  }
});

t("strict and naive boundaries", () => {
  assert.equal(dotted(parseStrict("255.255.255.255")), "255.255.255.255");
  assert.equal(parseStrict("255.255.255.256").ok, false);
  assert.equal(parseStrict("1.2.3.04").ok, false);
  assert.equal(parseStrict("1.2.3.0").ok, true);
  assert.equal(parseStrict("1.2.3.-1").ok, false);
  assert.equal(parseStrict("1.2.3.4 ").ok, false);
  assert.equal(dotted(parseNaiveDecimal("010.010.010.010")), "10.10.10.10");
  assert.equal(dotted(parseNaiveDecimal("0000000000000000001.2.3.4")), "1.2.3.4");
  assert.equal(parseNaiveDecimal("0x1.2.3.4").ok, false);
});

t("binary rejects ambiguous or malformed bit strings", () => {
  assert.equal(parseBinary("0b1100000010101000000000000000000"), null); // 31 bits
  assert.equal(parseBinary("0b110000001010100000000000000000011"), null); // 33 bits
  assert.equal(parseBinary("1100000.10101000.00000000.00000001"), null); // 7-bit group
  assert.equal(parseBinary("11000000.10101000.00000000.00000002"), null);
  assert.equal(parseBinary("0b11111111111111111111111111111111"), 4294967295);
  assert.equal(parseBinary("00000000.00000000.00000000.00000000"), 0);
});

t("special-purpose registry entries", () => {
  const v = (s: string) => {
    const o = parseStrict(s);
    if (!o.ok) throw new Error(s);
    return o.value;
  };
  assert.equal(classify(v("192.0.2.1"))?.rfc, "RFC 5737");
  assert.equal(classify(v("198.51.100.255"))?.rfc, "RFC 5737");
  assert.equal(classify(v("203.0.113.0"))?.rfc, "RFC 5737");
  assert.equal(classify(v("192.31.196.1"))?.rfc, "RFC 7535");
  assert.equal(classify(v("192.52.193.1"))?.rfc, "RFC 7450");
  assert.equal(classify(v("192.175.48.1"))?.rfc, "RFC 7534");
  assert.equal(classify(v("192.0.0.170"))?.rfc, "RFC 6890");
  assert.equal(classify(v("100.63.255.255")), null);
  assert.equal(classify(v("100.127.255.255"))?.rfc, "RFC 6598");
  assert.equal(classify(v("198.17.255.255")), null);
  assert.equal(classify(v("198.20.0.0")), null);
  assert.equal(classify(v("223.255.255.255")), null);
  assert.equal(classify(v("224.0.0.1"))?.rfc, "RFC 5771");
  assert.equal(classify(v("255.255.255.254"))?.rfc, "RFC 1112");
  assert.equal(classify(v("169.254.169.253"))?.name, "Link-local");
});

t("hostile input never throws", () => {
  const inputs = [
    "%".repeat(256),
    "%00",
    "%7f.1",
    "\u0000",
    " 127.1",
    "\ud800",
    "0x".repeat(128),
    "9".repeat(256),
    "9".repeat(257),
    ".".repeat(256),
    "0b",
    "-1",
    "1e9",
    "Infinity",
    "NaN",
    "0x-1",
    "__proto__",
    "constructor",
    "1.2.3.4\u000b5",
  ];
  for (const s of inputs) {
    analyze(s);
    parseWhatwg(s);
    parseInetAton(s);
    parseStrict(s);
    parseNaiveDecimal(s);
    parseBinary(s);
  }
  assert.equal(analyze("9".repeat(257)).kind, "error");
  const neg = analyze("-1");
  assert.ok(neg.kind === "ok" && neg.value === null);
});

console.log(`ip-address-converter verify: ${n} tests passed`);
