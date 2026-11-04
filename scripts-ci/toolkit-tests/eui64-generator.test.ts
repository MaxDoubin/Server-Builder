import assert from "node:assert/strict";
import {
  parseMac,
  toModifiedEui64,
  linkLocal,
  slaacAddress,
  parseSlaacPrefix,
  parseReverseInput,
  macFromInterfaceId,
  macString,
  iidString,
  addressString,
  bin8,
  UL_BIT,
} from "../../client/src/lib/toolkit/eui64-generator.ts";
import { compress, parseIpv6, solicitedNode } from "../../client/src/lib/toolkit/ipv6-calculator.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

function mac(text: string): number[] {
  const r = parseMac(text);
  if (r.kind !== "ok") throw new Error(`expected ${text} to parse, got ${r.kind}`);
  return r.bytes;
}

test("MAC notations", () => {
  const want = [0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e];
  for (const t of [
    "00:1a:2b:3c:4d:5e",
    "00-1A-2B-3C-4D-5E",
    "001a.2b3c.4d5e",
    "001A2B3C4D5E",
    "0:1a:2b:3c:4d:5e",
    "00 1a 2b 3c 4d 5e",
    "  00:1a:2b:3c:4d:5e  ",
    "001a:2b3c:4d5e",
  ]) {
    assert.deepEqual(mac(t), want, t);
  }
  assert.equal(mac("0011.2233.4455.6677").length, 8);
  assert.equal(mac("00:11:22:33:44:55:66:77").length, 8);
});

test("MAC errors and hints", () => {
  assert.equal(parseMac("").kind, "empty");
  assert.equal(parseMac("00:1a:2b").kind, "hint");
  assert.equal(parseMac("00:1a:2b:").kind, "hint");
  assert.equal(parseMac("001a2b").kind, "hint");
  const cases: [string, RegExp][] = [
    ["00:1a:2b:3c:4d:5g", /"g" is not a hex digit/],
    ["00:1a-2b:3c:4d:5e", /Mixed separators/],
    ["00:1a:2b:3c:4d:5e:6f", /7 octets/],
    ["001:a2:b3:c4:d5:e6", /3 hex digits/],
    ["001a2b3c4d5e6f", /14 hex digits/],
    ["001.a2b3.c4d5", /three groups of four/],
    ["001a.2b3c.4d5e.", /Remove the dot at the end, or add a fourth group/],
    ["001a2.b3c", /5 hex digits. Each dotted group is four/],
    ["00::1a:2b:3c:4d", /empty octet/],
    ["00:1a:2b:3c:4d:5e:", /separator at the end/],
    ["x".repeat(500), /limit here/],
  ];
  for (const [t, re] of cases) {
    const r = parseMac(t);
    assert.equal(r.kind, "error", t);
    if (r.kind === "error") assert.match(r.message, re, t);
  }
});

// RFC 2464 section 4: 34-56-78-9A-BC-DE gives 36-56-78-FF-FE-9A-BC-DE.
test("RFC 2464 section 4 reference value", () => {
  const r = toModifiedEui64(mac("34-56-78-9A-BC-DE"));
  assert.deepEqual(r.inserted, [0x34, 0x56, 0x78, 0xff, 0xfe, 0x9a, 0xbc, 0xde]);
  assert.equal(r.firstBefore, 0x34);
  assert.equal(r.firstAfter, 0x36);
  assert.equal(macString(r.iidBytes, "-").toUpperCase(), "36-56-78-FF-FE-9A-BC-DE");
  assert.equal(iidString(r.iid), "3656:78ff:fe9a:bcde");
  assert.equal(r.universal, true);
  assert.equal(r.group, false);
  // RFC 2464 section 5: the link-local address is fe80::/64 plus the IID.
  assert.equal(addressString(linkLocal(r.iid)), "fe80::3656:78ff:fe9a:bcde");
});

test("common example 00:1a:2b:3c:4d:5e", () => {
  const r = toModifiedEui64(mac("00:1a:2b:3c:4d:5e"));
  assert.equal(iidString(r.iid), "021a:2bff:fe3c:4d5e");
  assert.equal(addressString(linkLocal(r.iid)), "fe80::21a:2bff:fe3c:4d5e");
  assert.equal(bin8(r.firstBefore), "00000000");
  assert.equal(bin8(r.firstAfter), "00000010");
});

test("locally administered MAC loses the bit", () => {
  // QEMU's 52:54:00 prefix has U/L = 1, so the IID gets u = 0.
  const r = toModifiedEui64(mac("52:54:00:12:34:56"));
  assert.equal(r.universal, false);
  assert.equal(r.firstAfter, 0x50);
  assert.equal(iidString(r.iid), "5054:00ff:fe12:3456");
  assert.equal(addressString(linkLocal(r.iid)), "fe80::5054:ff:fe12:3456");
});

test("group bit preserved and reported", () => {
  const r = toModifiedEui64(mac("01:00:5e:00:00:01"));
  assert.equal(r.group, true);
  assert.equal(r.firstAfter & 1, 1);
});

test("all-ones and all-zeros", () => {
  assert.equal(iidString(toModifiedEui64(mac("ff:ff:ff:ff:ff:ff")).iid), "fdff:ffff:feff:ffff");
  assert.equal(iidString(toModifiedEui64(mac("00:00:00:00:00:00")).iid), "0200:00ff:fe00:0000");
});

test("64-bit EUI-64 only flips the bit (RFC 4291 Appendix A)", () => {
  const r = toModifiedEui64(mac("00:11:22:33:44:55:66:77"));
  assert.equal(r.source, "eui64");
  assert.equal(iidString(r.iid), "0211:2233:4455:6677");
});

test("SLAAC prefix", () => {
  const iid = toModifiedEui64(mac("34-56-78-9A-BC-DE")).iid;
  const p = parseSlaacPrefix("2001:db8:1:2::/64");
  assert.equal(p.kind, "ok");
  if (p.kind === "ok") {
    assert.equal(addressString(slaacAddress(p.network, iid)), "2001:db8:1:2:3656:78ff:fe9a:bcde");
    assert.equal(p.notes.length, 0);
  }
  const noLen = parseSlaacPrefix("2001:db8:1:2::");
  assert.ok(noLen.kind === "ok" && noLen.notes.some((n) => /assumed/.test(n)));
  const hostBits = parseSlaacPrefix("2001:db8:1:2::99/64");
  assert.ok(hostBits.kind === "ok" && hostBits.notes.some((n) => /dropped/.test(n)));
  const errs: [string, RegExp][] = [
    ["2001:db8:1::/48", /must be a \/64/],
    ["2001:db8:1:2::/80", /must be a \/64/],
    ["ff02::/64", /multicast/],
    ["fe80::/64", /link-local/],
    ["febf::/64", /link-local/],
    ["2001:db8::1::/64", /only once/],
  ];
  for (const [t, re] of errs) {
    const r = parseSlaacPrefix(t);
    assert.equal(r.kind, "error", t);
    if (r.kind === "error") assert.match(r.message, re, t);
  }
  assert.equal(parseSlaacPrefix("  ").kind, "empty");
  const ula = parseSlaacPrefix("fd12:3456:789a:1::/64");
  assert.equal(ula.kind, "ok");
});

test("reverse: recover MAC", () => {
  const cases: [string, string, boolean][] = [
    ["fe80::3656:78ff:fe9a:bcde", "34:56:78:9a:bc:de", true],
    ["2001:db8:1:2:21a:2bff:fe3c:4d5e/64", "00:1a:2b:3c:4d:5e", true],
    ["fe80::5054:ff:fe12:3456%eth0", "52:54:00:12:34:56", false],
    ["021a:2bff:fe3c:4d5e", "00:1a:2b:3c:4d:5e", true],
  ];
  for (const [input, want, universal] of cases) {
    const p = parseReverseInput(input);
    assert.equal(p.kind, "ok", input);
    if (p.kind !== "ok") continue;
    const r = macFromInterfaceId(p.iid);
    assert.equal(r.eui64, true, input);
    assert.equal(macString(r.mac!), want, input);
    assert.equal(r.universal, universal, input);
  }
  const bare = parseReverseInput("021a:2bff:fe3c:4d5e");
  assert.ok(bare.kind === "ok" && bare.bareIid);
});

test("reverse: not EUI-64", () => {
  for (const t of ["fe80::1", "2001:db8::a1b2:c3d4:e5f6:789a", "::"]) {
    const p = parseReverseInput(t);
    assert.ok(p.kind === "ok");
    if (p.kind === "ok") assert.equal(macFromInterfaceId(p.iid).eui64, false, t);
  }
  const e = parseReverseInput("2001:db8::1::2");
  assert.ok(e.kind === "error" && /only once/.test(e.message));
  assert.equal(parseReverseInput("").kind, "empty");
});

test("round trip for random MACs", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) & 0xff;
  for (let i = 0; i < 2000; i++) {
    const bytes = Array.from({ length: 6 }, rnd);
    const r = toModifiedEui64(bytes);
    assert.equal((r.iidBytes[0] ^ bytes[0]), UL_BIT);
    const back = macFromInterfaceId(r.iid);
    assert.deepEqual(back.mac, bytes);
    const ll = linkLocal(r.iid);
    const parsed = parseIpv6(compress(ll));
    assert.ok(parsed.ok && parsed.value === ll);
  }
});

test("link-local and SLAAC share a solicited-node group", () => {
  const iid = toModifiedEui64(mac("00:1a:2b:3c:4d:5e")).iid;
  const p = parseSlaacPrefix("2001:db8:1:2::/64");
  if (p.kind !== "ok") throw new Error("prefix");
  assert.equal(solicitedNode(linkLocal(iid)), solicitedNode(slaacAddress(p.network, iid)));
  assert.equal(compress(solicitedNode(linkLocal(iid))), "ff02::1:ff3c:4d5e");
});


/* ---------------- verifier additions: independent reference cases ---------------- */

// Hand-computed from RFC 4291 Appendix A. 00-AA-00-3F-2A-1C: insert FF-FE
// after the third octet, then 0x00 xor 0x02 = 0x02.
test("00-AA-00-3F-2A-1C gives 02aa:00ff:fe3f:2a1c", () => {
  const r = toModifiedEui64(mac("00-AA-00-3F-2A-1C"));
  assert.deepEqual(r.inserted, [0x00, 0xaa, 0x00, 0xff, 0xfe, 0x3f, 0x2a, 0x1c]);
  assert.equal(iidString(r.iid), "02aa:00ff:fe3f:2a1c");
  assert.equal(addressString(linkLocal(r.iid)), "fe80::2aa:ff:fe3f:2a1c");
  assert.equal(compress(solicitedNode(linkLocal(r.iid))), "ff02::1:ff3f:2a1c");
  const back = parseReverseInput("FE80::2AA:FF:FE3F:2A1C");
  assert.ok(back.kind === "ok");
  if (back.kind === "ok") assert.equal(macString(macFromInterfaceId(back.iid).mac!), "00:aa:00:3f:2a:1c");
});

// Bit position boundaries: only mask 0x02 of the first octet changes.
test("only bit 7 of the first octet is inverted", () => {
  // 0xfe = 11111110: U/L is 1, so it is cleared to 0xfc.
  assert.equal(iidString(toModifiedEui64(mac("fe:ff:ff:ff:ff:ff")).iid), "fcff:ffff:feff:ffff");
  // 0x02 alone: a locally administered MAC becomes an all-zero first octet.
  const local = toModifiedEui64(mac("02:00:00:00:00:01"));
  assert.equal(local.universal, false);
  assert.equal(iidString(local.iid), "0000:00ff:fe00:0001");
  assert.equal(addressString(linkLocal(local.iid)), "fe80::ff:fe00:1");
  // 0x01 (I/G) and 0x04 are left alone.
  assert.equal(toModifiedEui64(mac("05:00:00:00:00:00")).firstAfter, 0x07);
  assert.equal(toModifiedEui64(mac("fd:00:00:00:00:00")).firstAfter, 0xff);
  // Changing any other octet never touches the first.
  for (let b = 0; b < 256; b++) {
    const r = toModifiedEui64([b, 0x11, 0x22, 0x33, 0x44, 0x55]);
    assert.equal(r.firstAfter, b ^ 0x02);
    assert.equal(r.universal, (b & 0x02) === 0);
    assert.equal(r.group, (b & 0x01) === 1);
  }
});

test("dotted MAC progress counts groups, not octets", () => {
  const h = (t: string) => {
    const r = parseMac(t);
    return r.kind === "hint" ? r.message : `${r.kind}`;
  };
  assert.equal(h("001a."), "1 of 3 dotted groups so far.");
  assert.equal(h("001a.2b"), "1 of 3 dotted groups so far.");
  assert.equal(h("001a.2b3c"), "2 of 3 dotted groups so far.");
  assert.equal(h("001a.2b3c."), "2 of 3 dotted groups so far.");
  assert.equal(h("001a.2b3c.4d5"), "2 of 3 dotted groups so far.");
  assert.deepEqual(mac("001A.2B3C.4D5E"), [0x00, 0x1a, 0x2b, 0x3c, 0x4d, 0x5e]);
  const four = parseMac("001a.2b3c.4d5e.6f70.");
  assert.ok(four.kind === "error" && /^Remove the dot at the end\.$/.test(four.message));
});

test("error messages quote the character as typed", () => {
  const r = parseMac("00:1A:2B:3C:4D:5G");
  assert.ok(r.kind === "error" && /^"G" is not a hex digit/.test(r.message));
  const z = parseMac("00:1a:2b:3c:4d:5e​");
  assert.ok(z.kind === "error" && /U\+200B/.test(z.message));
  const t = parseMac("00:11:22:33:44:55:");
  assert.ok(t.kind === "error" && /two more octets for a 64-bit EUI-64/.test(t.message));
  const long = parseMac("0".repeat(101));
  assert.ok(long.kind === "error" && /17 and an EUI-64 is 23/.test(long.message));
});

test("reverse: ff:fe in the wrong place is not EUI-64", () => {
  // IID 00ff:fe00:0000:0001: ff:fe sits in octets 2 and 3, not 4 and 5.
  // fe80::0:ff:fe:0 is IID octets 00 00 00 ff 00 fe 00 00: ff and fe, but not adjacent.
  for (const t of ["fe80::ff:fe00:0:1", "fe80::0:ff:fe:0", "fe80::fffe:0:0:0"]) {
    const p = parseReverseInput(t);
    assert.ok(p.kind === "ok", t);
    if (p.kind === "ok") assert.equal(macFromInterfaceId(p.iid).eui64, false, t);
  }
  // Exactly octets 4 and 5 (bits 24 to 39 of the IID).
  const near = parseReverseInput("fe80::ffff:fe00:0");
  assert.ok(near.kind === "ok" && macFromInterfaceId(near.iid).eui64);
  const p = parseReverseInput("::ff:fe00:0");
  assert.ok(p.kind === "ok" && macFromInterfaceId(p.iid).eui64);
  if (p.kind === "ok") assert.equal(macString(macFromInterfaceId(p.iid).mac!), "02:00:00:00:00:00");
});

test("SLAAC prefix: RFC 4862 5.5.3 lengths and zone note", () => {
  for (const len of [0, 48, 56, 63, 65, 128]) {
    const r = parseSlaacPrefix(`2001:db8::/${len}`);
    assert.ok(r.kind === "error" && /must be a \/64/.test(r.message), String(len));
  }
  const z = parseSlaacPrefix("2001:db8:1:2::%eth0/64");
  assert.ok(z.kind === "ok" && z.notes.some((n) => /zone %eth0 was ignored/.test(n)));
  const bad = parseSlaacPrefix("1.2.3.4::/64");
  assert.ok(bad.kind === "error");
  const huge = parseSlaacPrefix("f".repeat(5000));
  assert.ok(huge.kind === "error" && /limit/.test(huge.message));
});

test("adversarial MAC and reverse input never throws", () => {
  const junk = ["\u0000", "\u{1F600}", "::::::", "-", ".", " . ", "0".repeat(100), "g".repeat(100), "00:00:00:00:00:00:00:00:00", "0.0.0", "[::]", "%", "/64"];
  for (const j of junk) {
    parseMac(j);
    parseReverseInput(j);
    parseSlaacPrefix(j);
  }
});

console.log(`eui64-generator: ${passed} tests passed`);
