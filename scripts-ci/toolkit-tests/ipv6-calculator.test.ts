import assert from "node:assert/strict";
import {
  parseIpv6,
  parsePrefixed,
  expand,
  compress,
  prefixInfo,
  classify,
  reversePointer,
  reverseZones,
  subdivide,
  formatBig,
  maskOf,
  solicitedNode,
  looksLikeEui64,
  BLOCK_COUNT,
  ALL_ONES,
  SUBDIVIDE_LIST_LIMIT,
  clip,
  describeChar,
} from "../../client/src/lib/toolkit/ipv6-calculator.ts";

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

function v(text: string): bigint {
  const r = parseIpv6(text);
  if (!r.ok) throw new Error(`expected ${text} to parse: ${r.message}`);
  return r.value;
}
function err(text: string): string {
  const r = parseIpv6(text);
  if (r.ok) throw new Error(`expected ${text} to fail`);
  return r.message;
}

test("block table compiles completely", () => {
  assert.equal(BLOCK_COUNT.compiled, BLOCK_COUNT.declared);
});

// RFC 5952 section 2.1: all of these are the same address.
test("RFC 5952 2.1 variants are one address with one canonical form", () => {
  const variants = [
    "2001:db8:0:0:1:0:0:1",
    "2001:0db8:0:0:1:0:0:1",
    "2001:db8::1:0:0:1",
    "2001:db8::0:1:0:0:1",
    "2001:0db8::1:0:0:1",
    "2001:db8:0:0:1::1",
    "2001:db8:0000:0:1::1",
    "2001:DB8:0:0:1::1",
  ];
  const want = v(variants[0]);
  for (const t of variants) {
    assert.equal(v(t), want, t);
    assert.equal(compress(v(t)), "2001:db8::1:0:0:1", t);
  }
});

// RFC 5952 section 4 rules.
test("RFC 5952 4.1 leading zeros", () => assert.equal(compress(v("2001:0db8::0001")), "2001:db8::1"));
test("RFC 5952 4.2.1 shorten as much as possible", () => assert.equal(compress(v("2001:db8:0:0:0:0:2:1")), "2001:db8::2:1"));
test("RFC 5952 4.2.2 no :: for one zero group", () =>
  assert.equal(compress(v("2001:db8:0:1:1:1:1:1")), "2001:db8:0:1:1:1:1:1"));
test("RFC 5952 4.2.3 longest run wins", () => assert.equal(compress(v("2001:0:0:1:0:0:0:1")), "2001:0:0:1::1"));
test("RFC 5952 4.2.3 tie goes to the first run", () => assert.equal(compress(v("2001:db8:0:0:1:0:0:1")), "2001:db8::1:0:0:1"));
test("RFC 5952 4.3 lowercase", () => assert.equal(compress(v("2001:DB8:ABCD::EF")), "2001:db8:abcd::ef"));
test("RFC 5952 5 mixed notation for IPv4-mapped", () => {
  assert.equal(compress(v("::ffff:192.0.2.1")), "::ffff:192.0.2.1");
  assert.equal(compress(v("0:0:0:0:0:ffff:c000:0201")), "::ffff:192.0.2.1");
  assert.equal(compress(v("::ffff:192.0.2.1"), true), "::ffff:c000:201");
});

test("edge compressions", () => {
  assert.equal(compress(0n), "::");
  assert.equal(compress(1n), "::1");
  assert.equal(compress(ALL_ONES), "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff");
  assert.equal(compress(v("1::")), "1::");
  assert.equal(compress(v("1:0:0:0:0:0:0:0")), "1::");
  assert.equal(compress(v("0:0:1:0:0:0:0:0")), "0:0:1::");
  assert.equal(compress(v("1:2:3:4:5:6:7::")), "1:2:3:4:5:6:7:0");
  assert.equal(compress(v("::2:3:4:5:6:7:8")), "0:2:3:4:5:6:7:8");
  assert.equal(compress(v("fe80::1")), "fe80::1");
});

test("expand", () => {
  assert.equal(expand(v("2001:db8::1")), "2001:0db8:0000:0000:0000:0000:0000:0001");
  assert.equal(expand(0n), "0000:0000:0000:0000:0000:0000:0000:0000");
});

test("embedded IPv4 tail value", () => {
  assert.equal(v("::ffff:1.2.3.4"), (0xffffn << 32n) | 0x01020304n);
  assert.equal(v("64:ff9b::192.0.2.33"), (0x64ff9bn << 96n) | 0xc0000221n);
  assert.equal(v("1:2:3:4:5:6:1.2.3.4"), v("1:2:3:4:5:6:102:304"));
});

test("brackets and zones", () => {
  const r = parseIpv6("fe80::1%eth0");
  assert.ok(r.ok && r.zone === "eth0" && r.value === v("fe80::1"));
  const b = parseIpv6("[2001:db8::1]");
  assert.ok(b.ok && b.value === v("2001:db8::1"));
});

test("malformed inputs give precise messages", () => {
  assert.match(err("2001:db8::1::2"), /only once/);
  assert.match(err("2001:db8:12345::1"), /5 hex digits/);
  assert.match(err("1:2:3:4:5:6:7:8:9"), /Too many groups: 9/);
  assert.match(err("1:2:3:4:5:6:7:8::"), /at most 7/);
  assert.match(err("1:2:3:4::5:6:7:8"), /at most 7/);
  assert.match(err("1:2:3:4:5:6:7"), /Only 7 groups/);
  assert.match(err(":1:2:3:4:5:6:7"), /starts with a single colon/);
  assert.match(err("1:2:3:4:5:6:7:"), /ends with a single colon/);
  assert.match(err(":1::"), /starts with a single colon/);
  assert.match(err("::1:"), /ends with a single colon/);
  assert.match(err("1:::2"), /Three colons/);
  assert.match(err("2001:db8::g"), /"g" is not allowed/);
  assert.match(err("192.168.0.1"), /IPv4-mapped IPv6 form is ::ffff:192.168.0.1/);
  assert.match(err("::1.2.3.4:5"), /only allowed in the last 32 bits/);
  assert.match(err("::256.1.1.1"), /over 255/);
  assert.match(err("::01.1.1.1"), /leading zero/);
  assert.match(err("::1.2.3"), /four decimal parts/);
  assert.match(err("1:2:3:4:5:6:7:1.2.3.4"), /Too many groups: 9/);
  assert.match(err("2001:db8::1%"), /followed by a zone/);
  assert.match(err("[2001:db8::1"), /Unbalanced/);
  assert.match(err("2001:db8 ::1"), /spaces/);
  assert.match(err(""), /Enter/);
  assert.match(err("x".repeat(500)), /limit here/);
  assert.match(err("1:2"), /Only 2 groups/);
  assert.match(err("abcd"), /needs colons/);
});

test("adversarial input never throws", () => {
  const junk = ["::::::", ":", "::%", "%%", "/", "[]", "[::]", "::/", "1::2::3::4", "ffff:".repeat(40), "1.2.3.4.5", "::1.2.3.4.5", "\u0000", "::ffff:999.999.999.999"];
  for (const j of junk) {
    parseIpv6(j);
    parsePrefixed(j);
  }
  const ok = parseIpv6("[::]");
  assert.ok(ok.ok && ok.value === 0n);
});

test("prefix parsing", () => {
  const p = parsePrefixed("2001:db8:abcd:12::1/56");
  assert.ok(p.ok && p.prefix === 56 && p.prefixGiven);
  const q = parsePrefixed("2001:db8::1");
  assert.ok(q.ok && q.prefix === 128 && !q.prefixGiven);
  const z = parsePrefixed("fe80::1%eth0/64");
  assert.ok(z.ok && z.prefix === 64 && z.zone === "eth0");
  for (const bad of ["::/129", "::/-1", "::/", "::/6.4", "::/1/2", "::/abc"]) {
    const r = parsePrefixed(bad);
    assert.equal(r.ok, false, bad);
  }
  const zero = parsePrefixed("::/0");
  assert.ok(zero.ok && zero.prefix === 0);
});

test("spec example 2001:db8:abcd:12::1/56", () => {
  const info = prefixInfo(v("2001:db8:abcd:12::1"), 56);
  assert.equal(compress(info.network), "2001:db8:abcd::");
  assert.equal(compress(info.last), "2001:db8:abcd:ff:ffff:ffff:ffff:ffff");
  assert.equal(info.count64, 256n);
  assert.equal(info.count56, 1n);
  assert.equal(info.count48, null);
  assert.equal(info.hostBitsSet, true);
  assert.equal(info.total, 1n << 72n);
});

test("prefix boundaries", () => {
  const all = prefixInfo(v("2001:db8::1"), 0);
  assert.equal(all.network, 0n);
  assert.equal(all.last, ALL_ONES);
  assert.equal(all.total, 1n << 128n);
  assert.equal(all.count64, 1n << 64n);
  const host = prefixInfo(v("2001:db8::1"), 128);
  assert.equal(host.network, host.last);
  assert.equal(host.total, 1n);
  assert.equal(host.count64, null);
  assert.equal(host.hostBitsSet, false);
  const p64 = prefixInfo(v("2001:db8:1:2:3:4:5:6"), 64);
  assert.equal(compress(p64.network), "2001:db8:1:2::");
  assert.equal(p64.count64, 1n);
  const p48 = prefixInfo(v("2001:db8:1::"), 48);
  assert.equal(p48.count64, 65536n);
  assert.equal(p48.count56, 256n);
  assert.equal(p48.hostBitsSet, false);
  assert.equal(maskOf(64), ((1n << 64n) - 1n) << 64n);
  assert.equal(maskOf(1), 1n << 127n);
});

test("formatBig", () => {
  assert.equal(formatBig(1n << 128n), "340,282,366,920,938,463,463,374,607,431,768,211,456");
  assert.equal(formatBig(256n), "256");
  assert.equal(formatBig(65536n), "65,536");
});

// RFC 3596 section 2.5 example: 4321:0:1:2:3:4:567:89ab
test("reverse pointer (RFC 3596)", () => {
  assert.equal(
    reversePointer(v("4321:0:1:2:3:4:567:89ab")),
    "b.a.9.8.7.6.5.0.4.0.0.0.3.0.0.0.2.0.0.0.1.0.0.0.0.0.0.0.1.2.3.4.ip6.arpa",
  );
});

test("reverse zones", () => {
  assert.deepEqual(reverseZones(v("2001:db8::"), 32), ["8.b.d.0.1.0.0.2.ip6.arpa"]);
  assert.deepEqual(reverseZones(v("2001:db8:abcd::"), 48), ["d.c.b.a.8.b.d.0.1.0.0.2.ip6.arpa"]);
  assert.deepEqual(reverseZones(0n, 0), ["ip6.arpa"]);
  // /30: 2001:0db8 has nibbles 2,0,0,1,0,d,b,8. Seven are fixed and the
  // eighth (8 = 1000) has its top two bits fixed, so it can be 8, 9, a or b.
  assert.deepEqual(reverseZones(v("2001:db8::"), 30), [
    "8.b.d.0.1.0.0.2.ip6.arpa",
    "9.b.d.0.1.0.0.2.ip6.arpa",
    "a.b.d.0.1.0.0.2.ip6.arpa",
    "b.b.d.0.1.0.0.2.ip6.arpa",
  ]);
  assert.equal(reverseZones(v("2001:db8::"), 57).length, 8);
  assert.equal(reverseZones(v("2001:db8::"), 58).length, 4);
  assert.equal(reverseZones(v("2001:db8::"), 59).length, 2);
});

test("subdivide", () => {
  const s = subdivide(v("2001:db8:abcd::"), 48, 56)!;
  assert.equal(s.count, 256n);
  assert.equal(s.first.length, SUBDIVIDE_LIST_LIMIT);
  assert.equal(compress(s.first[0]), "2001:db8:abcd::");
  assert.equal(compress(s.first[1]), "2001:db8:abcd:100::");
  assert.equal(compress(s.lastSubnet!), "2001:db8:abcd:ff00::");
  const small = subdivide(v("2001:db8::"), 62, 64)!;
  assert.equal(small.count, 4n);
  assert.equal(small.first.length, 4);
  assert.equal(small.lastSubnet, null);
  assert.equal(compress(small.first[3]), "2001:db8:0:3::");
  assert.equal(subdivide(0n, 64, 64), null);
  assert.equal(subdivide(0n, 64, 129), null);
  const huge = subdivide(0n, 0, 128)!;
  assert.equal(huge.count, 1n << 128n);
  assert.equal(huge.lastSubnet, ALL_ONES);
});

test("classification", () => {
  const cases: [string, string, string][] = [
    ["::", "Unspecified", "::/128"],
    ["::1", "Loopback", "::1/128"],
    ["::ffff:192.0.2.1", "IPv4-mapped", "::ffff:0:0/96"],
    ["::192.0.2.1", "IPv4-compatible (deprecated)", "::/96"],
    ["64:ff9b::192.0.2.33", "NAT64 well-known prefix", "64:ff9b::/96"],
    ["64:ff9b:1::1", "Local-use IPv4/IPv6 translation", "64:ff9b:1::/48"],
    ["100::1", "Discard-only", "100::/64"],
    ["2001:0:4136:e378:8000:63bf:3fff:fdd2", "Teredo", "2001::/32"],
    ["2001:1::1", "Port Control Protocol anycast", "2001:1::1/128"],
    ["2001:1::2", "TURN anycast", "2001:1::2/128"],
    ["2001:1::3", "DNS-SD Service Registration Protocol anycast", "2001:1::3/128"],
    ["2001:1::4", "IETF protocol assignments", "2001::/23"],
    ["100:0:0:1::5", "Dummy IPv6 prefix", "100:0:0:1::/64"],
    ["100:0:0:2::1", "Reserved by IETF", "outside every allocated block"],
    ["2001:2::5", "Benchmarking", "2001:2::/48"],
    ["2001:20::1", "ORCHIDv2", "2001:20::/28"],
    ["2001:db8::1", "Documentation", "2001:db8::/32"],
    ["3fff:123::1", "Documentation", "3fff::/20"],
    ["2002:c000:204::1", "6to4", "2002::/16"],
    ["2600::1", "Global unicast", "2000::/3"],
    ["3ffe::1", "Global unicast", "2000::/3"],
    ["fd12:3456:789a:1::1", "Unique local (ULA)", "fc00::/7"],
    ["fc00::1", "Unique local (ULA)", "fc00::/7"],
    ["fe80::1", "Link-local unicast", "fe80::/10"],
    ["febf::1", "Link-local unicast", "fe80::/10"],
    ["fec0::1", "Site-local (deprecated)", "fec0::/10"],
    ["5f00::1", "SRv6 segment identifiers", "5f00::/16"],
    ["4000::1", "Reserved by IETF", "outside every allocated block"],
    ["::2:0:0:1", "Reserved by IETF", "outside every allocated block"],
  ];
  for (const [addr, label, block] of cases) {
    const c = classify(v(addr));
    assert.equal(c.label, label, addr);
    assert.equal(c.block, block, addr);
  }
});

test("multicast scope and groups (RFC 4291 2.7)", () => {
  const allNodes = classify(v("ff02::1"));
  assert.equal(allNodes.label, "Multicast, link-local scope");
  assert.ok(allNodes.fields.some((f) => f.value === "All nodes on the link"));
  assert.ok(allNodes.fields.some((f) => f.label === "Scope" && f.value.startsWith("0x2")));
  assert.equal(classify(v("ff0e::101")).label, "Multicast, global scope");
  assert.equal(classify(v("ff05::1:3")).label, "Multicast, site-local scope");
  assert.equal(classify(v("ff03::1")).label, "Multicast, realm-local scope");
  assert.equal(classify(v("ff08::1")).label, "Multicast, organization-local scope");
  assert.equal(classify(v("ff06::1")).label, "Multicast, unassigned scope");
  const transient = classify(v("ff15::1234"));
  assert.ok(transient.fields.some((f) => f.label === "Flags" && f.value.includes("transient")));
  const sn = classify(v("ff02::1:ff3c:4d5e"));
  assert.equal(sn.label, "Solicited-node multicast");
  assert.ok(sn.fields.some((f) => f.value === "3c4d5e"));
  assert.equal(compress(solicitedNode(v("fe80::21a:2bff:fe3c:4d5e"))), "ff02::1:ff3c:4d5e");
  assert.equal(compress(solicitedNode(v("2001:db8::1"))), "ff02::1:ff00:1");
});

// Teredo example: server 65.54.227.120, client 192.0.2.45, port 40000.
test("Teredo decode (RFC 4380 section 4)", () => {
  const c = classify(v("2001:0000:4136:e378:8000:63bf:3fff:fdd2"));
  const f = Object.fromEntries(c.fields.map((x) => [x.label, x.value]));
  assert.equal(f["Teredo server"], "65.54.227.120");
  assert.equal(f["Client public IPv4"], "192.0.2.45");
  assert.equal(f["Client UDP port"], "40000");
  assert.match(f["Flags"], /0x8000 · high bit set \(the cone flag/);
});

test("6to4 decode (RFC 3056)", () => {
  const c = classify(v("2002:c000:0204::1"));
  const f = Object.fromEntries(c.fields.map((x) => [x.label, x.value]));
  assert.equal(f["6to4 router IPv4"], "192.0.2.4");
  assert.equal(f["Site /48"], "2002:c000:204::/48");
});

test("ULA and link-local decode", () => {
  const u = classify(v("fd12:3456:789a:1::1"));
  const f = Object.fromEntries(u.fields.map((x) => [x.label, x.value]));
  assert.equal(f["Global ID"], "123456789a");
  assert.equal(f["Subnet ID"], "0001");
  assert.equal(classify(v("fc00::1")).notes.length, 1);
  assert.equal(classify(v("fe80::1")).notes.length, 0);
  assert.equal(classify(v("fe80:1::1")).notes.length, 1);
  const m = classify(v("::ffff:10.0.0.1"));
  assert.ok(m.fields.some((x) => x.value === "10.0.0.1"));
});

test("EUI-64 shape detection", () => {
  assert.equal(looksLikeEui64(v("fe80::21a:2bff:fe3c:4d5e")), true);
  assert.equal(looksLikeEui64(v("fe80::1")), false);
});

test("messages quote input briefly and name invisible characters", () => {
  const long = err("2001:" + "a".repeat(150) + "::1");
  assert.match(long, /150 hex digits/);
  assert.ok(long.length < 140, long);
  assert.ok(parsePrefixed("::1/" + "9".repeat(150)).ok === false);
  const pm = parsePrefixed("::1/" + "9".repeat(150));
  assert.ok(!pm.ok && pm.message.length < 140);
  assert.equal(clip("abc"), "abc");
  assert.equal(clip("a".repeat(30), 5), "aaaaa...");
  assert.equal(describeChar("g"), '"g"');
  assert.equal(describeChar("\u0000"), "U+0000");
  assert.equal(describeChar("\u200b"), "U+200B");
  assert.match(err("2001:db8::\u200b1"), /U\+200B is not allowed/);
  assert.match(err("2001:db8::\u{1F600}"), /"\u{1F600}" is not allowed/u);
  assert.match(err("2001:db8::\t1"), /spaces or line breaks/);
});


/* ---------------- verifier additions: independent reference cases ---------------- */

// RFC 4291 section 2.2: the text-form examples given in the RFC itself.
test("RFC 4291 2.2 examples", () => {
  assert.equal(compress(v("ABCD:EF01:2345:6789:ABCD:EF01:2345:6789")), "abcd:ef01:2345:6789:abcd:ef01:2345:6789");
  assert.equal(compress(v("2001:DB8:0:0:8:800:200C:417A")), "2001:db8::8:800:200c:417a");
  assert.equal(compress(v("FF01:0:0:0:0:0:0:101")), "ff01::101");
  assert.equal(compress(v("0:0:0:0:0:0:0:1")), "::1");
  assert.equal(compress(v("0:0:0:0:0:0:0:0")), "::");
  assert.equal(v("0:0:0:0:0:0:13.1.68.3"), v("::d01:4403"));
  assert.equal(compress(v("0:0:0:0:0:FFFF:129.144.52.38")), "::ffff:129.144.52.38");
  assert.equal(v("::FFFF:129.144.52.38"), (0xffffn << 32n) | 0x81903426n);
});

// RFC 4291 section 2.3: the legal and illegal prefix spellings.
test("RFC 4291 2.3 prefix examples", () => {
  const want = v("2001:db8:0:cd30::");
  for (const t of ["2001:0DB8:0000:CD30:0000:0000:0000:0000/60", "2001:0DB8::CD30:0:0:0:0/60", "2001:0DB8:0:CD30::/60"]) {
    const p = parsePrefixed(t);
    assert.ok(p.ok && p.prefix === 60 && prefixInfo(p.value, 60).network === want, t);
  }
  // "2001:0DB8::CD3/60" is legal text but names a different address: cd3
  // lands in the last group, so the /60 network is 2001:db8::.
  const odd = parsePrefixed("2001:0DB8::CD3/60");
  assert.ok(odd.ok && compress(prefixInfo(odd.value, 60).network) === "2001:db8::");
  // "2001:0DB8:0:CD3/60" drops trailing zeros, which is not allowed.
  const bad = parsePrefixed("2001:0DB8:0:CD3/60");
  assert.ok(!bad.ok && /Only 4 groups/.test(bad.message));
});

// RFC 4291 section 2.7.1: 4037::01:800:200E:8C6C joins FF02::1:FF0E:8C6C.
test("RFC 4291 2.7.1 solicited-node example", () => {
  assert.equal(compress(solicitedNode(v("4037::01:800:200E:8C6C"))), "ff02::1:ff0e:8c6c");
  assert.equal(classify(v("FF02::1:FF0E:8C6C")).label, "Solicited-node multicast");
  // ff02::1:ff00:0/104 boundary: one bit outside is not solicited-node.
  assert.notEqual(classify(v("ff02::1:fe00:0")).label, "Solicited-node multicast");
  assert.notEqual(classify(v("ff02::2:ff00:0")).label, "Solicited-node multicast");
});

// RFC 6052 section 2.4: 192.0.2.33 in the well-known prefix.
test("RFC 6052 NAT64 example", () => {
  const a = v("64:ff9b::192.0.2.33");
  assert.equal(compress(a), "64:ff9b::c000:221");
  const c = classify(a);
  assert.equal(c.block, "64:ff9b::/96");
  assert.ok(c.fields.some((f) => f.label === "Embedded IPv4" && f.value === "192.0.2.33"));
});

// The IPv4 part of RFC 4291 form 3 is the low-order 32 bits, so it must end
// the text. inet_pton, Python's ipaddress and Node's net.isIPv6 all reject these.
test("dotted quad before a trailing :: is rejected", () => {
  for (const t of ["1.2.3.4::", "1:2:1.2.3.4::", "1:2:3:4:5:1.2.3.4::", "::1.2.3.4::"]) {
    const r = parseIpv6(t);
    assert.equal(r.ok, false, t);
  }
  assert.match(err("1.2.3.4::"), /followed by "::"/);
  assert.match(err("1:2:3:4:5:6:1.2.3.4:7"), /only allowed in the last 32 bits/);
  assert.ok(parseIpv6("1:2:3:4:5:6:1.2.3.4").ok);
  assert.ok(parseIpv6("1::1.2.3.4").ok);
  assert.ok(parseIpv6("::0.0.0.0").ok);
});

test("IPv4-looking input with a bad octet is not called an IPv4 address", () => {
  const m = err("999.1.1.1");
  assert.match(m, /looks like an IPv4 address, but/);
  assert.match(m, /over 255/);
  assert.doesNotMatch(m, /::ffff:999/);
  assert.match(err("010.1.1.1"), /leading zero/);
});

test("text after a closing bracket is named", () => {
  assert.match(err("[2001:db8::1]:443"), /":443" after the closing bracket/);
  assert.match(err("[fe80::1]%eth0"), /"%eth0" after the closing bracket/);
  const inside = parseIpv6("[fe80::1%eth0]");
  assert.ok(inside.ok && inside.zone === "eth0");
});

// RFC 3306 section 4 and RFC 3956 section 3: flag dependencies.
test("multicast flag combinations", () => {
  // RFC 3306 example form ff3e:30:<64-bit prefix>:group, P = 1 and T = 1.
  const ssm = classify(v("ff3e:30:2001:db8::1234"));
  assert.ok(ssm.fields.some((f) => f.label === "Flags" && f.value.startsWith("0x3")));
  assert.equal(ssm.notes.length, 0);
  assert.equal(ssm.label, "Multicast, global scope");
  // R, P and T all set (RFC 3956 embedded-RP form).
  assert.equal(classify(v("ff7e:140:2001:db8::1")).notes.length, 0);
  assert.ok(classify(v("ff2e::1")).notes.some((n) => /RFC 3306 requires T = 1/.test(n)));
  assert.ok(classify(v("ff4e::1")).notes.some((n) => /RFC 3956 requires P = 1 and T = 1/.test(n)));
  assert.ok(classify(v("ff6e::1")).notes.some((n) => /RFC 3956/.test(n)));
  // ff0f: reserved scope F.
  assert.ok(classify(v("ff0f::1")).notes.some((n) => /reserved/.test(n)));
});

test("prefix boundaries at /127, /1 and /63", () => {
  const p127 = prefixInfo(v("2001:db8::1"), 127);
  assert.equal(compress(p127.network), "2001:db8::");
  assert.equal(compress(p127.last), "2001:db8::1");
  assert.equal(p127.total, 2n);
  assert.equal(p127.count64, null);
  const p1 = prefixInfo(v("8000::1"), 1);
  assert.equal(compress(p1.network), "8000::");
  assert.equal(p1.last, ALL_ONES);
  assert.equal(p1.count64, 1n << 63n);
  const p63 = prefixInfo(v("2001:db8:0:1::"), 63);
  assert.equal(compress(p63.network), "2001:db8::");
  assert.equal(compress(p63.last), "2001:db8:0:1:ffff:ffff:ffff:ffff");
  assert.equal(p63.count64, 2n);
  assert.equal(p63.hostBitsSet, true);
});

test("Teredo all-ones client and port decode to 0.0.0.0 and 0", () => {
  const c = classify(v("2001:0:102:304:0:ffff:ffff:ffff"));
  const f = Object.fromEntries(c.fields.map((x) => [x.label, x.value]));
  assert.equal(f["Teredo server"], "1.2.3.4");
  assert.equal(f["Client public IPv4"], "0.0.0.0");
  assert.equal(f["Client UDP port"], "0");
});

test("input at the length cap", () => {
  const atCap = "0:".repeat(99) + "00"; // exactly 200 characters, too many groups
  assert.equal(atCap.length, 200);
  assert.match(err(atCap), /Too many groups/);
  assert.match(err(atCap + "0"), /limit here is 200/);
});

console.log(`ipv6-calculator: ${passed} tests passed`);
