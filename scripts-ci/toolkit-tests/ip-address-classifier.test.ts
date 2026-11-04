import assert from "node:assert/strict";
import {
  parseIp,
  parseIPv4,
  parseIPv6,
  formatIPv6,
  formatIPv6Full,
  formatIPv4,
  classify,
  networkOf,
  IPV4_SPECIAL,
  IPV4_RELATED,
  IPV6_SPECIAL,
  IPV6_RELATED,
  attributeSentences,
} from "../../client/src/lib/toolkit/ip-address-classifier.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

function ip(text: string) {
  const r = parseIp(text);
  if (!r.ok) throw new Error(`parse failed for ${text}: ${r.error}`);
  return r.value;
}
function primaryOf(text: string): string | null {
  const c = classify(ip(text));
  return c.primary ? c.primary.entry.id : c.related ? c.related.entry.id : null;
}
function err(text: string): string {
  const r = parseIp(text);
  assert.equal(r.ok, false, `expected ${JSON.stringify(text)} to fail`);
  return (r as { ok: false; error: string }).error;
}

/* ---------------- IPv4 parsing */
t("ipv4 basics", () => {
  assert.equal(ip("192.0.2.1").value, 0xc0000201n);
  assert.equal(ip("0.0.0.0").value, 0n);
  assert.equal(ip("255.255.255.255").value, 0xffffffffn);
  assert.equal(ip("  10.0.0.1  ").value, 0x0a000001n);
});
t("ipv4 rejects", () => {
  assert.match(err("256.1.1.1"), /0 to 255/);
  assert.match(err("1.2.3"), /four octets/);
  assert.match(err("127.1"), /inet_aton/);
  assert.match(err("1.2.3.4.5"), /has 5/);
  assert.match(err("01.2.3.4"), /leading zero/);
  assert.match(err("0177.0.0.1"), /octal/);
  assert.match(err("2130706433"), /bare integer/);
  assert.match(err("0x7f.0.0.1"), /hexadecimal/);
  assert.match(err("1..2.3"), /empty/);
  assert.match(err("1.2.3.4."), /empty/);
  assert.match(err("a.b.c.d"), /not a decimal/);
  assert.match(err(""), /Enter/);
  assert.match(err("10.0.0.0/8"), /prefix length/);
  assert.match(err("10.0.0.1%eth0"), /only applies to IPv6/);
  assert.match(err("99999999999999999999999.1.1.1"), /0 to 255/);
});

/* ---------------- IPv6 parsing (RFC 4291 section 2.2) */
t("ipv6 parse forms", () => {
  assert.equal(ip("::").value, 0n);
  assert.equal(ip("::1").value, 1n);
  assert.equal(ip("2001:db8::1").value, (0x20010db8n << 96n) | 1n);
  assert.equal(ip("2001:DB8:0:0:8:800:200C:417A").value, ip("2001:db8::8:800:200c:417a").value);
  assert.equal(ip("ff01::101").value, (0xff01n << 112n) | 0x101n);
  assert.equal(ip("::ffff:192.0.2.1").value, (0xffffn << 32n) | 0xc0000201n);
  assert.equal(ip("0:0:0:0:0:FFFF:129.144.52.38").value, (0xffffn << 32n) | 0x81903426n);
  assert.equal(ip("[2001:db8::1]").value, ip("2001:db8::1").value);
  assert.equal(ip("1:2:3:4:5:6:7::").value, ip("1:2:3:4:5:6:7:0").value);
  assert.equal(ip("::2:3:4:5:6:7:8").value, ip("0:2:3:4:5:6:7:8").value);
  const z = ip("fe80::1%eth0");
  assert.equal(z.zoneId, "eth0");
  assert.equal(z.family, 6);
});
t("ipv6 rejects", () => {
  assert.match(err("1::2::3"), /only once/);
  assert.match(err(":::"), /':::'/);
  assert.match(err("12345::"), /more than four/);
  assert.match(err("1:2:3:4:5:6:7:8:9"), /eight groups/);
  assert.match(err("1:2:3:4:5:6:7"), /eight groups/);
  assert.match(err("1:2:3:4:5:6:7::8"), /at most seven/);
  assert.match(err(":1:2:3:4:5:6:7"), /empty group|eight groups/);
  assert.match(err("1:2:3:4:5:6:7:"), /empty group/);
  assert.match(err("::1:"), /empty group/);
  assert.match(err("g::1"), /not a hex group/);
  assert.match(err("::ffff:1.2.3"), /embedded IPv4/);
  assert.match(err("1.2.3.4::"), /last 32 bits/);
  assert.match(err("::1.2.3.4:1"), /last 32 bits/);
  assert.match(err("fe80::1%"), /zone ID/);
  assert.match(err("[::1]:443"), /port/);
  assert.match(err("x".repeat(10000)), /not read/);
  assert.match(err("::ffff:01.2.3.4"), /leading zero/);
});

/* ---------------- RFC 5952 canonical text, section 4 examples */
t("rfc 5952 formatting", () => {
  const f = (s: string) => formatIPv6(ip(s).value);
  assert.equal(f("2001:0db8::0001"), "2001:db8::1"); // 4.1 leading zeros
  assert.equal(f("2001:db8:0:0:0:0:2:1"), "2001:db8::2:1"); // 4.2.1 longest
  assert.equal(f("2001:db8:0:1:1:1:1:1"), "2001:db8:0:1:1:1:1:1"); // 4.2.2 single 0 not compressed
  assert.equal(f("2001:0:0:1:0:0:0:1"), "2001:0:0:1::1"); // 4.2.3 longest run wins
  assert.equal(f("2001:db8:0:0:1:0:0:1"), "2001:db8::1:0:0:1"); // 4.2.3 tie -> first
  assert.equal(f("2001:DB8::AAAA"), "2001:db8::aaaa"); // 4.3 lowercase
  assert.equal(f("0:0:0:0:0:0:0:0"), "::");
  assert.equal(f("0:0:0:0:0:0:0:1"), "::1");
  assert.equal(f("1:0:0:0:0:0:0:0"), "1::");
  assert.equal(f("::ffff:c000:0201"), "::ffff:192.0.2.1"); // section 5 mixed notation
  assert.equal(formatIPv6Full(ip("2001:db8::1").value), "2001:0db8:0000:0000:0000:0000:0000:0001");
  assert.equal(formatIPv4(0xc0000201n), "192.0.2.1");
});

/* ---------------- registry data sanity */
t("registry blocks are network addresses", () => {
  for (const e of [...IPV4_SPECIAL, ...IPV4_RELATED, ...IPV6_SPECIAL, ...IPV6_RELATED]) {
    for (const b of e.blocks) {
      assert.equal(networkOf(e.family, b.network, b.length), b.network, `${b.cidr} has host bits set`);
      assert.ok(b.length >= 0 && b.length <= (e.family === 4 ? 32 : 128));
    }
    assert.ok(e.summary.length > 20, e.id);
    assert.ok(!/—/.test(e.summary + e.name + (e.footnote ?? "")), `em dash in ${e.id}`);
  }
  assert.equal(IPV4_SPECIAL.length, 25);
  assert.equal(IPV6_SPECIAL.length, 25);
  const ids = new Set([...IPV4_SPECIAL, ...IPV4_RELATED, ...IPV6_SPECIAL, ...IPV6_RELATED].map((e) => e.id));
  assert.equal(ids.size, IPV4_SPECIAL.length + IPV4_RELATED.length + IPV6_SPECIAL.length + IPV6_RELATED.length);
});

t("registry attributes (spot checks vs IANA)", () => {
  const byId = (id: string) => [...IPV4_SPECIAL, ...IPV6_SPECIAL].find((e) => e.id === id)!;
  assert.deepEqual(byId("v4-loopback").attrs, { source: false, destination: false, forwardable: false, globallyReachable: false, reservedByProtocol: true });
  assert.deepEqual(byId("v4-link-local").attrs, { source: true, destination: true, forwardable: false, globallyReachable: false, reservedByProtocol: true });
  assert.deepEqual(byId("v4-limited-broadcast").attrs, { source: false, destination: true, forwardable: false, globallyReachable: false, reservedByProtocol: true });
  assert.deepEqual(byId("v4-pcp-anycast").attrs, { source: true, destination: true, forwardable: true, globallyReachable: true, reservedByProtocol: false });
  assert.deepEqual(byId("v4-this-host").attrs, { source: true, destination: false, forwardable: false, globallyReachable: false, reservedByProtocol: true });
  assert.deepEqual(byId("v6-teredo").attrs.globallyReachable, null);
  assert.deepEqual(byId("v6-6to4").attrs.globallyReachable, null);
  assert.deepEqual(byId("v6-ula").attrs, { source: true, destination: true, forwardable: true, globallyReachable: false, reservedByProtocol: false });
  assert.deepEqual(byId("v6-link-local").attrs, { source: true, destination: true, forwardable: false, globallyReachable: false, reservedByProtocol: true });
  assert.deepEqual(byId("v6-nat64-wkp").attrs.globallyReachable, true);
  assert.deepEqual(byId("v6-nat64-local").attrs.globallyReachable, false);
  assert.equal(byId("v4-6to4-relay").deprecated, true);
  assert.deepEqual(byId("v4-nat64-discovery").blocks.map((b) => b.cidr), ["192.0.0.170/32", "192.0.0.171/32"]);
});

/* ---------------- IPv4 classification, boundaries on both sides */
t("ipv4 classification", () => {
  const cases: [string, string | null][] = [
    ["0.0.0.0", "v4-this-host"],
    ["0.1.2.3", "v4-this-network"],
    ["0.255.255.255", "v4-this-network"],
    ["1.0.0.0", null],
    ["9.255.255.255", null],
    ["10.0.0.0", "v4-private-10"],
    ["10.255.255.255", "v4-private-10"],
    ["11.0.0.0", null],
    ["100.63.255.255", null],
    ["100.64.0.0", "v4-shared"],
    ["100.127.255.255", "v4-shared"],
    ["100.128.0.0", null],
    ["127.0.0.1", "v4-loopback"],
    ["127.255.255.255", "v4-loopback"],
    ["169.254.169.254", "v4-link-local"],
    ["169.255.0.0", null],
    ["172.15.255.255", null],
    ["172.16.0.0", "v4-private-172"],
    ["172.31.255.255", "v4-private-172"],
    ["172.32.0.0", null],
    ["192.0.0.0", "v4-service-continuity"],
    ["192.0.0.7", "v4-service-continuity"],
    ["192.0.0.8", "v4-dummy"],
    ["192.0.0.9", "v4-pcp-anycast"],
    ["192.0.0.10", "v4-turn-anycast"],
    ["192.0.0.11", "v4-ietf"],
    ["192.0.0.170", "v4-nat64-discovery"],
    ["192.0.0.171", "v4-nat64-discovery"],
    ["192.0.0.172", "v4-ietf"],
    ["192.0.0.255", "v4-ietf"],
    ["192.0.1.0", null],
    ["192.0.2.0", "v4-test-net-1"],
    ["192.0.2.255", "v4-test-net-1"],
    ["192.0.3.0", null],
    ["192.31.196.1", "v4-as112-dname"],
    ["192.52.193.1", "v4-amt"],
    ["192.88.99.1", "v4-6to4-relay"],
    ["192.88.99.2", "v4-6a44"],
    ["192.167.255.255", null],
    ["192.168.0.0", "v4-private-192"],
    ["192.168.255.255", "v4-private-192"],
    ["192.169.0.0", null],
    ["192.175.48.1", "v4-as112-direct"],
    ["198.17.255.255", null],
    ["198.18.0.0", "v4-benchmarking"],
    ["198.19.255.255", "v4-benchmarking"],
    ["198.20.0.0", null],
    ["198.51.100.7", "v4-test-net-2"],
    ["203.0.113.255", "v4-test-net-3"],
    ["223.255.255.255", null],
    ["224.0.0.251", "v4-mcast-local"],
    ["224.0.1.1", "v4-multicast"],
    ["232.1.1.1", "v4-mcast-ssm"],
    ["233.252.0.5", "v4-mcast-test-net"],
    ["239.255.255.250", "v4-mcast-admin"],
    ["239.255.255.255", "v4-mcast-admin"],
    ["240.0.0.0", "v4-reserved"],
    ["255.255.255.254", "v4-reserved"],
    ["255.255.255.255", "v4-limited-broadcast"],
  ];
  for (const [addr, id] of cases) assert.equal(primaryOf(addr), id, addr);
});

t("nesting and fallbacks", () => {
  const c = classify(ip("192.0.0.9"));
  assert.deepEqual(c.matches.map((m) => m.entry.id), ["v4-pcp-anycast", "v4-ietf"]);
  const b = classify(ip("255.255.255.255"));
  assert.deepEqual(b.matches.map((m) => m.entry.id), ["v4-limited-broadcast", "v4-reserved"]);
  const g = classify(ip("8.8.8.8"));
  assert.equal(g.primary, null);
  assert.equal(g.fallback?.title, "Global unicast");
  assert.deepEqual(g.details, [
    { label: "As one integer", value: "134744072" },
    { label: "As hex", value: "0x08080808" },
  ]);
  const m = classify(ip("224.0.0.251"));
  assert.equal(m.primary, null);
  assert.equal(m.related?.entry.id, "v4-mcast-local");
  assert.equal(m.fallback, null);
  assert.match(m.wellKnown ?? "", /Multicast DNS/);
  assert.equal(classify(ip("127.0.0.1")).details[0].value, "2130706433");
});

/* ---------------- IPv6 classification */
t("ipv6 classification", () => {
  const cases: [string, string | null][] = [
    ["::1", "v6-loopback"],
    ["::", "v6-unspecified"],
    ["::2", null],
    ["::ffff:10.0.0.1", "v6-mapped"],
    ["64:ff9b::192.0.2.1", "v6-nat64-wkp"],
    ["64:ff9b:1::1", "v6-nat64-local"],
    ["100::1", "v6-discard"],
    ["100:0:0:1::1", "v6-dummy"], // RFC 9780, IANA 2025-04
    ["2001::1", "v6-teredo"],
    ["2001:1::1", "v6-pcp-anycast"],
    ["2001:1::2", "v6-turn-anycast"],
    ["2001:1::3", "v6-srp-anycast"],
    ["2001:1::4", "v6-ietf"],
    ["2001:2::1", "v6-benchmarking"],
    ["2001:2:1::1", "v6-ietf"],
    ["2001:3::1", "v6-amt"],
    ["2001:4:112::1", "v6-as112"],
    ["2001:10::1", "v6-orchid"],
    ["2001:20::1", "v6-orchidv2"],
    ["2001:2f:ffff::1", "v6-orchidv2"],
    ["2001:30::1", "v6-det"],
    ["2001:1ff:ffff:ffff::", "v6-ietf"],
    ["2001:200::1", null],
    ["2001:db8::1", "v6-documentation"],
    ["2001:db9::1", null],
    ["2002:c000:204::1", "v6-6to4"],
    ["2620:4f:8000::1", "v6-as112-direct"],
    ["3fff::1", "v6-documentation-3fff"],
    ["3fff:fff:ffff::1", "v6-documentation-3fff"],
    ["3fff:1000::1", null],
    ["5f00::1", "v6-srv6"],
    ["fc00::1", "v6-ula"],
    ["fdff:ffff::1", "v6-ula"],
    ["fe00::1", null],
    ["fe80::1", "v6-link-local"],
    ["febf:ffff::1", "v6-link-local"],
    ["fec0::1", "v6-site-local"],
    ["ff02::1", "v6-multicast"],
    ["4000::1", null],
  ];
  for (const [addr, id] of cases) assert.equal(primaryOf(addr), id, addr);
  assert.equal(classify(ip("2001:4860::1")).fallback?.title, "Global unicast (2000::/3)");
  assert.equal(classify(ip("4000::1")).fallback?.title, "Reserved by the IETF");
  assert.equal(classify(ip("::2")).fallback?.title, "Reserved by the IETF");
  assert.equal(classify(ip("5f00::1")).fallback, null);
});

t("embedded IPv4", () => {
  const mapped = classify(ip("::ffff:192.168.1.1"));
  assert.equal(mapped.canonical, "::ffff:192.168.1.1");
  assert.equal(mapped.embedded[0].ipv4, "192.168.1.1");
  assert.equal(mapped.embedded[0].classifiedAs, "Private-Use");
  const nat = classify(ip("64:ff9b::10.1.2.3"));
  assert.equal(nat.embedded[0].ipv4, "10.1.2.3");
  assert.match(nat.notes.join(" "), /RFC 6052 section 3\.1/);
  const natOk = classify(ip("64:ff9b::c000:221"));
  assert.equal(natOk.embedded[0].ipv4, "192.0.2.33");
  const six = classify(ip("2002:c000:0204::1"));
  assert.equal(six.embedded[0].ipv4, "192.0.2.4");
  assert.equal(six.embedded[0].classifiedAs, "Documentation (TEST-NET-1)");
  // Teredo, RFC 4380 section 4 layout. Hand-checked: 4136:e378 = 65.54.227.120,
  // ~63bf = 0x9c40 = 40000, ~3fff:fdd2 = c000:022d = 192.0.2.45.
  const teredo = classify(ip("2001:0000:4136:e378:8000:63bf:3fff:fdd2"));
  assert.equal(teredo.embedded[0].ipv4, "65.54.227.120");
  assert.equal(teredo.embedded[1].ipv4, "192.0.2.45");
  assert.equal(teredo.embedded[1].port, 40000);
  assert.match(teredo.details[0].value, /0x8000 \(cone bit set\)/);
});

t("ipv6 details and notes", () => {
  const ula = classify(ip("fd12:3456:789a:1::1"));
  assert.deepEqual(ula.details.slice(0, 2), [
    { label: "Global ID (40 bits)", value: "123456789a" },
    { label: "Subnet ID (16 bits)", value: "0001" },
  ]);
  assert.match(classify(ip("fc00::1")).notes.join(" "), /L bit is 0/);
  const ll = classify(ip("fe80::1"));
  assert.match(ll.notes.join(" "), /No zone ID/);
  const llz = classify(ip("fe80::1%eth0"));
  assert.ok(!llz.notes.some((n) => /No zone ID/.test(n)));
  assert.match(classify(ip("fe80:1::1%eth0")).notes.join(" "), /54 bits/);
  assert.match(classify(ip("2001:db8::1%eth0")).notes.join(" "), /ignored/);
  const mc = classify(ip("ff02::1"));
  assert.match(mc.wellKnown ?? "", /All nodes/);
  assert.match(mc.details.find((d) => d.label === "Scope")!.value, /2 \(link-local\)/);
  assert.match(mc.details.find((d) => d.label === "Flags")!.value, /permanently assigned/);
  const sn = classify(ip("ff02::1:ff12:3456"));
  assert.match(sn.wellKnown ?? "", /low-order 24 bits are 0x123456/);
  const tr = classify(ip("ff3e:40:2001:db8::1"));
  assert.match(tr.details.find((d) => d.label === "Scope")!.value, /global/);
  assert.match(tr.details.find((d) => d.label === "Flags")!.value, /P: unicast-prefix-based.*T: transient/);
  assert.match(classify(ip("ff06::1")).details.find((d) => d.label === "Scope")!.value, /unassigned/);
});

t("attribute sentences", () => {
  const loop = IPV4_SPECIAL.find((e) => e.id === "v4-loopback")!;
  const s = attributeSentences(loop.attrs);
  assert.equal(s.length, 5);
  assert.match(s[2], /should not forward/);
  const dep = IPV4_SPECIAL.find((e) => e.id === "v4-6to4-relay")!;
  assert.deepEqual(attributeSentences(dep.attrs), []);
});

t("direct parsers", () => {
  assert.equal(parseIPv4("1.2.3.4").ok, true);
  assert.equal(parseIPv6("1.2.3.4").ok, false);
  assert.equal(parseIPv6("::").ok, true);
});

t("fuzz: never throws", () => {
  const alphabet = "0123456789abcdefABCDEFxX:.%[]/ g-";
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 20000; i++) {
    const len = Math.floor(rnd() * 48);
    let s = "";
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    const r = parseIp(s);
    if (r.ok) {
      const c = classify(r.value);
      // round trip through canonical text
      const back = parseIp(c.canonical);
      assert.ok(back.ok, `canonical ${c.canonical} of ${s} did not re-parse`);
      assert.equal((back as { ok: true; value: { value: bigint } }).value.value, r.value.value);
    } else {
      assert.ok(r.error.length > 0 && !/—/.test(r.error));
    }
  }
});


/* ================= independent verifier cases ================= */

t("verify: RFC 4291 section 2.2 and RFC 5952 section 2 text forms", () => {
  const f = (s: string) => classify(ip(s)).canonical;
  // RFC 4291 2.2 examples
  assert.equal(f("FF01:0:0:0:0:0:0:101"), "ff01::101");
  assert.equal(f("0:0:0:0:0:0:0:1"), "::1");
  assert.equal(f("0:0:0:0:0:0:0:0"), "::");
  assert.equal(f("0:0:0:0:0:FFFF:129.144.52.38"), "::ffff:129.144.52.38");
  // RFC 5952 2.1 and 2.2: every spelling maps to one canonical form
  assert.equal(f("2001:db8:aaaa:bbbb:cccc:dddd:eeee:0001"), "2001:db8:aaaa:bbbb:cccc:dddd:eeee:1");
  for (const v of ["2001:db8:0:0:0::1", "2001:db8:0:0::1", "2001:db8:0::1", "2001:db8::1", "2001:db8::0:1"]) {
    assert.equal(f(v), "2001:db8::1", v);
  }
  assert.equal(f("2001:db8:0:0:aaaa::1"), "2001:db8::aaaa:0:0:1"); // tie, first run (4.2.3)
  assert.equal(f("2001:db8:0:0:0:0:2:1"), "2001:db8::2:1"); // 4.2.1
  assert.equal(f("2001:db8::aaaa:0:0:1"), "2001:db8::aaaa:0:0:1");
});

t("verify: RFC 4291 2.2 IPv4-compatible example is flagged deprecated", () => {
  const c = classify(ip("0:0:0:0:0:0:13.1.68.3"));
  assert.equal(c.canonical, "::d01:4403");
  assert.equal(c.primary, null);
  assert.equal(c.embedded[0].label, "IPv4-compatible address (deprecated)");
  assert.equal(c.embedded[0].ipv4, "13.1.68.3");
  assert.match(c.notes.join(" "), /RFC 4291 section 2\.5\.5\.1/);
  // :: and ::1 are their own entries and get no such note
  assert.equal(classify(ip("::")).embedded.length, 0);
  assert.equal(classify(ip("::1")).embedded.length, 0);
});

t("verify: RFC 4291 2.7.1 solicited-node example", () => {
  // 4037::01:800:200E:8C6C -> FF02::1:FF0E:8C6C
  const c = classify(ip("FF02:0:0:0:0:1:FF0E:8C6C"));
  assert.equal(c.canonical, "ff02::1:ff0e:8c6c");
  assert.match(c.wellKnown ?? "", /low-order 24 bits are 0x0e8c6c/);
  // one bit outside the /104 is not solicited-node
  assert.equal(classify(ip("ff02::1:fe0e:8c6c")).wellKnown, null);
});

t("verify: RFC 6052 2.4, RFC 3056 and a hand-built Teredo vector", () => {
  const n = classify(ip("64:ff9b::192.0.2.33"));
  assert.equal(n.canonical, "64:ff9b::c000:221");
  assert.equal(n.primary?.entry.id, "v6-nat64-wkp");
  assert.equal(n.embedded[0].ipv4, "192.0.2.33");
  assert.match(n.notes.join(" "), /RFC 6052 section 3\.1/);
  assert.equal(classify(ip("64:ff9b::8.8.8.8")).notes.length, 0);
  // 6to4: 2002:V4ADDR::/48
  const s = classify(ip("2002:cb00:7101::1"));
  assert.equal(s.embedded[0].ipv4, "203.0.113.1");
  // Teredo built by hand: server 192.0.2.1, client 203.0.113.5 port 3544.
  // ~0x0dd8 = 0xf227, ~cb00:7105 = 34ff:8efa
  const t4 = classify(ip("2001:0:c000:201:0:f227:34ff:8efa"));
  assert.equal(t4.embedded[0].ipv4, "192.0.2.1");
  assert.equal(t4.embedded[1].ipv4, "203.0.113.5");
  assert.equal(t4.embedded[1].port, 3544);
  assert.match(t4.details.find((d) => d.label === "Teredo flags")!.value, /^0x0000$/);
});

t("verify: IANA registry attributes and block edges", () => {
  const attrs = (s: string) => {
    const c = classify(ip(s));
    const a = c.primary!.entry.attrs;
    return [a.source, a.destination, a.forwardable, a.globallyReachable, a.reservedByProtocol];
  };
  const T = true, F = false;
  assert.deepEqual(attrs("192.0.0.170"), [F, F, F, F, T]);
  assert.deepEqual(attrs("192.0.0.171"), [F, F, F, F, T]);
  assert.deepEqual(attrs("255.255.255.255"), [F, T, F, F, T]);
  assert.deepEqual(attrs("0.0.0.0"), [T, F, F, F, T]);
  assert.deepEqual(attrs("169.254.0.1"), [T, T, F, F, T]);
  assert.deepEqual(attrs("192.0.0.8"), [T, F, F, F, F]);
  assert.deepEqual(attrs("192.88.99.2"), [T, T, T, F, F]);
  assert.deepEqual(attrs("2001:1::3"), [T, T, T, T, F]);
  assert.deepEqual(attrs("5f00::1"), [T, T, T, F, F]);
  assert.deepEqual(attrs("2001::1"), [T, T, T, null, F]);
  assert.deepEqual(attrs("2002::1"), [T, T, T, null, F]);
  assert.deepEqual(attrs("fe80::1"), [T, T, F, F, T]);
  assert.deepEqual(attrs("::ffff:1.2.3.4"), [F, F, F, F, T]);
  const top = (s: string) => {
    const c = classify(ip(s));
    return c.primary?.entry.id ?? c.related?.entry.id ?? null;
  };
  // edges, both sides
  assert.equal(top("100.63.255.255"), null);
  assert.equal(top("100.64.0.0"), "v4-shared");
  assert.equal(top("100.127.255.255"), "v4-shared");
  assert.equal(top("100.128.0.0"), null);
  assert.equal(top("198.17.255.255"), null);
  assert.equal(top("198.19.255.255"), "v4-benchmarking");
  assert.equal(top("198.20.0.0"), null);
  assert.equal(top("192.0.0.7"), "v4-service-continuity");
  assert.equal(top("192.0.0.11"), "v4-ietf");
  assert.equal(top("192.88.99.1"), "v4-6to4-relay");
  assert.equal(top("239.255.255.255"), "v4-mcast-admin");
  assert.equal(top("223.255.255.255"), null);
  assert.equal(top("255.255.255.254"), "v4-reserved");
  assert.equal(top("3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff"), "v6-documentation-3fff");
  assert.equal(top("3fff:1000::"), null);
  assert.equal(top("2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff"), "v6-ietf");
  assert.equal(top("2001:200::"), null);
  assert.equal(top("2001:2:0:ffff::1"), "v6-benchmarking");
  assert.equal(top("2001:2:1::"), "v6-ietf");
  assert.equal(top("fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), null);
  assert.equal(top("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), "v6-ula");
  assert.equal(top("febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), "v6-link-local");
  assert.equal(top("fec0::"), "v6-site-local");
  assert.equal(classify(ip("3fff:1000::")).fallback?.title, "Global unicast (2000::/3)");
  assert.equal(classify(ip("4000::1")).fallback?.title, "Reserved by the IETF");
  // registry ids are unique (they are React keys)
  const ids = [...IPV4_SPECIAL, ...IPV4_RELATED, ...IPV6_SPECIAL, ...IPV6_RELATED].map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(IPV4_SPECIAL.length, 25);
  assert.equal(IPV6_SPECIAL.length, 25);
});

t("verify: zone IDs follow RFC 4007 scope", () => {
  const ignored = (s: string) => classify(ip(s)).notes.some((n) => /zone ID only means/.test(n));
  assert.equal(ignored("::1%lo"), false); // loopback is link-local scope (section 4)
  assert.equal(ignored("ff05::1:3%eth0"), false); // site-local multicast
  assert.equal(ignored("ff02::1%eth0"), false);
  assert.equal(ignored("fec0::1%1"), false);
  assert.equal(ignored("ff0e::1%eth0"), true); // global multicast
  assert.equal(ignored("2001:db8::1%eth0"), true);
  assert.equal(ignored("fd00::1%eth0"), true);
});

t("verify: hostile and malformed input gives errors, never throws", () => {
  assert.match(err("1.2.3.4:80"), /port/);
  assert.match(err("[2001:db8::1]:443"), /port/);
  assert.match(err("​1.2.3.4"), /U\+200B/);
  assert.match(err("1.2. 3.4"), /U\+00A0/);
  assert.match(err("１.2.3.4"), /U\+FF11/); // full-width digit one
  assert.match(err("١.2.3.4"), /U\+0661/); // Arabic-Indic digit one
  assert.match(err("2001:db8:: 1"), /space/);
  assert.match(err("1.2.3.4\u0000"), /U\+0000/);
  assert.match(err("😀"), /U\+1F600/);
  assert.equal(ip(" 1.2.3.4 ").value, 0x01020304n); // NBSP at the ends is trimmed
  assert.match(err("-1.2.3.4"), /not a decimal/);
  assert.match(err("1.2.3.4/32"), /prefix length/);
  assert.match(err("4294967295"), /bare integer/);
  assert.match(err("1:2:3:4:5:6:7:8%" + "a".repeat(65)), /zone ID/);
  assert.match(err("::ffff:256.0.0.1"), /0 to 255/);
  assert.match(err(":".repeat(200)), /':::'/);
  assert.match(err("1:".repeat(127) + "1"), /eight groups/);
  for (const s of ["[", "]", "[]", "%", "::%", ".", ":", "0x", "[::1", "::1]", "1.2.3.4]"]) {
    const r = parseIp(s);
    assert.equal(r.ok, false, s);
  }
});

console.log(`ip-address-classifier: ${passed} test groups passed`);

import { sampleAddress as sample } from "../../client/src/lib/toolkit/ip-address-classifier.ts";
{
  const all = [...IPV4_SPECIAL, ...IPV4_RELATED, ...IPV6_SPECIAL, ...IPV6_RELATED];
  const fmt = (f: 4 | 6, v: bigint) => (f === 4 ? formatIPv4(v) : formatIPv6(v));
  for (const e of all) {
    for (const b of e.blocks) {
      const v = sample(e, b);
      const c = classify({ family: e.family, value: v, zoneId: null });
      const top = c.primary ?? c.related;
      assert.equal(top?.entry.id, e.id, `sample for ${b.cidr} (${fmt(e.family, v)}) lands on ${top?.entry.id}`);
    }
  }
  const tn = IPV4_SPECIAL.find((e) => e.id === "v4-this-network")!;
  assert.equal(formatIPv4(sample(tn, tn.blocks[0])), "0.0.0.1");
  const mc = IPV4_RELATED.find((e) => e.id === "v4-multicast")!;
  assert.equal(formatIPv4(sample(mc, mc.blocks[0])), "228.0.0.0");
  console.log("sampleAddress: every registry row samples to itself");
}

/* ================= verifier pass 2 (registry checked against iana.org CSVs, updated 2025-10-09) ================= */
{
  let n = 0;
  const v2 = (name: string, fn: () => void) => {
    try {
      fn();
      n++;
    } catch (e) {
      console.error(`FAIL ${name}`);
      throw e;
    }
  };

  // Verbatim rows of iana-ipv4-special-registry-1.csv and iana-ipv6-special-registry-1.csv
  // (Address Block | Name | Source,Destination,Forwardable,Globally Reachable,Reserved-by-Protocol).
  // "-" marks the empty attribute cells of deprecated rows, "N" an N/A cell.
  const IANA_V4 = `0.0.0.0/8|"This network"|TFFFT
0.0.0.0/32|"This host on this network"|TFFFT
10.0.0.0/8|Private-Use|TTTFF
100.64.0.0/10|Shared Address Space|TTTFF
127.0.0.0/8|Loopback|FFFFT
169.254.0.0/16|Link Local|TTFFT
172.16.0.0/12|Private-Use|TTTFF
192.0.0.0/24|IETF Protocol Assignments|FFFFF
192.0.0.0/29|IPv4 Service Continuity Prefix|TTTFF
192.0.0.8/32|IPv4 dummy address|TFFFF
192.0.0.9/32|Port Control Protocol Anycast|TTTTF
192.0.0.10/32|Traversal Using Relays around NAT Anycast|TTTTF
192.0.0.170/32,192.0.0.171/32|NAT64/DNS64 Discovery|FFFFT
192.0.2.0/24|Documentation (TEST-NET-1)|FFFFF
192.31.196.0/24|AS112-v4|TTTTF
192.52.193.0/24|AMT|TTTTF
192.88.99.0/24|Deprecated (6to4 Relay Anycast)|-----
192.88.99.2/32|6a44-relay anycast address|TTTFF
192.168.0.0/16|Private-Use|TTTFF
192.175.48.0/24|Direct Delegation AS112 Service|TTTTF
198.18.0.0/15|Benchmarking|TTTFF
198.51.100.0/24|Documentation (TEST-NET-2)|FFFFF
203.0.113.0/24|Documentation (TEST-NET-3)|FFFFF
240.0.0.0/4|Reserved|FFFFT
255.255.255.255/32|Limited Broadcast|FTFFT`;
  const IANA_V6 = `::1/128|Loopback Address|FFFFT
::/128|Unspecified Address|TFFFT
::ffff:0:0/96|IPv4-mapped Address|FFFFT
64:ff9b::/96|IPv4-IPv6 Translat.|TTTTF
64:ff9b:1::/48|IPv4-IPv6 Translat.|TTTFF
100::/64|Discard-Only Address Block|TTTFF
100:0:0:1::/64|Dummy IPv6 Prefix|TFFFF
2001::/23|IETF Protocol Assignments|FFFFF
2001::/32|TEREDO|TTTNF
2001:1::1/128|Port Control Protocol Anycast|TTTTF
2001:1::2/128|Traversal Using Relays around NAT Anycast|TTTTF
2001:1::3/128|DNS-SD Service Registration Protocol Anycast|TTTTF
2001:2::/48|Benchmarking|TTTFF
2001:3::/32|AMT|TTTTF
2001:4:112::/48|AS112-v6|TTTTF
2001:10::/28|Deprecated (previously ORCHID)|-----
2001:20::/28|ORCHIDv2|TTTTF
2001:30::/28|Drone Remote ID Protocol Entity Tags (DETs) Prefix|TTTTF
2001:db8::/32|Documentation|FFFFF
2002::/16|6to4|TTTNF
2620:4f:8000::/48|Direct Delegation AS112 Service|TTTTF
3fff::/20|Documentation|FFFFF
5f00::/16|Segment Routing (SRv6) SIDs|TTTFF
fc00::/7|Unique-Local|TTTFF
fe80::/10|Link-Local Unicast|TTFFT`;
  const cell = (c: string) => (c === "T" ? true : c === "F" ? false : null);

  v2("every IANA row is present with the registry's attributes, in registry order", () => {
    for (const [table, data] of [
      [IANA_V4, IPV4_SPECIAL],
      [IANA_V6, IPV6_SPECIAL],
    ] as const) {
      const rows = table.split("\n").map((l) => l.split("|"));
      assert.equal(data.length, rows.length);
      rows.forEach(([blocks, , attrs], i) => {
        const e = data[i];
        assert.deepEqual(e.blocks.map((b) => b.cidr), blocks.split(","), `row ${i} blocks`);
        const want = attrs.split("").map(cell);
        const got = [e.attrs.source, e.attrs.destination, e.attrs.forwardable, e.attrs.globallyReachable, e.attrs.reservedByProtocol];
        assert.deepEqual(got, want, `${blocks} attributes`);
        assert.equal(e.deprecated, attrs === "-----", `${blocks} deprecated flag`);
        assert.equal(e.registry, "special");
        // RFC 8190 section 2: if Destination is false, Forwardable and Globally Reachable are false too.
        if (e.attrs.destination === false) {
          assert.equal(e.attrs.forwardable, false, blocks);
          assert.equal(e.attrs.globallyReachable, false, blocks);
        }
      });
    }
  });

  v2("Dummy IPv6 Prefix 100:0:0:1::/64 (RFC 9780 section 7.1), both edges", () => {
    const top = (s: string) => {
      const c = classify(ip(s));
      return c.primary?.entry.id ?? c.related?.entry.id ?? null;
    };
    assert.equal(top("100:0:0:1::"), "v6-dummy");
    assert.equal(top("100:0:0:1:ffff:ffff:ffff:ffff"), "v6-dummy");
    assert.equal(top("100::ffff:ffff:ffff:ffff"), "v6-discard");
    assert.equal(top("100:0:0:2::"), null);
    assert.equal(classify(ip("100:0:0:2::")).fallback?.kind, "reserved");
    const d = classify(ip("100:0:0:1::5"));
    assert.deepEqual(attributeSentences(d.primary!.entry.attrs).slice(0, 2), ["Valid as a source address.", "Not valid as a destination address."]);
  });

  v2("fallback kinds follow the IPv6 Address Space registry", () => {
    assert.equal(classify(ip("8.8.8.8")).fallback?.kind, "global");
    assert.equal(classify(ip("2001:4860:4860::8888")).fallback?.kind, "global");
    assert.equal(classify(ip("3fff:1000::")).fallback?.kind, "global"); // just past 3fff::/20, still 2000::/3
    assert.equal(classify(ip("1fff:ffff::")).fallback?.kind, "reserved"); // 1000::/4
    assert.equal(classify(ip("4000::")).fallback?.kind, "reserved"); // 4000::/3
    assert.equal(classify(ip("fe00::")).fallback?.kind, "reserved"); // fe00::/9
    assert.equal(classify(ip("200::1")).fallback?.kind, "reserved"); // 200::/7, deprecated NSAP
    assert.equal(classify(ip("fc00::")).fallback, null);
  });

  v2("well-known multicast groups cite the RFCs the IANA registries list today", () => {
    assert.match(classify(ip("224.0.0.18")).wellKnown ?? "", /RFC 9568/); // VRRPv3, obsoletes RFC 5798
    assert.match(classify(ip("ff02::16")).wellKnown ?? "", /RFC 9777/); // MLDv2, obsoletes RFC 3810
    assert.match(classify(ip("ff02::1:2")).wellKnown ?? "", /RFC 9915/); // DHCPv6, obsoletes RFC 8415
    assert.match(classify(ip("ff05::1:3")).wellKnown ?? "", /RFC 9915/);
    assert.match(classify(ip("224.0.0.22")).wellKnown ?? "", /IGMPv3/); // RFC 3376 section 4.2.14
  });

  v2("RFC 3956 embedded-RP and RFC 3306 flag decoding", () => {
    // ff7e:0140:2001:0db8:beef:feed::1234 is the RFC 3956 section 7 style: flags 7 = R, P, T; scope e.
    const c = classify(ip("ff7e:140:2001:db8:beef:feed::1234"));
    const flags = c.details.find((d) => d.label === "Flags")!.value;
    assert.match(flags, /R: embedded rendezvous point/);
    assert.match(flags, /P: unicast-prefix-based/);
    assert.match(flags, /T: transient/);
    assert.match(c.details.find((d) => d.label === "Scope")!.value, /^e \(global\)$/);
    const res = classify(ip("ff8e::1")).details.find((d) => d.label === "Flags")!.value;
    assert.match(res, /high bit set/);
    assert.match(classify(ip("ff03::1")).details.find((d) => d.label === "Scope")!.value, /realm-local/); // RFC 7346
  });

  v2("documentation blocks, outer edges (RFC 5737, RFC 3849, RFC 9637)", () => {
    const top = (s: string) => {
      const c = classify(ip(s));
      return c.primary?.entry.id ?? c.related?.entry.id ?? null;
    };
    assert.equal(top("198.51.99.255"), null);
    assert.equal(top("198.51.100.0"), "v4-test-net-2");
    assert.equal(top("198.51.101.0"), null);
    assert.equal(top("203.0.112.255"), null);
    assert.equal(top("203.0.113.0"), "v4-test-net-3");
    assert.equal(top("203.0.114.0"), null);
    assert.equal(top("2001:db7:ffff:ffff:ffff:ffff:ffff:ffff"), null);
    assert.equal(top("2001:db8:ffff:ffff:ffff:ffff:ffff:ffff"), "v6-documentation");
    assert.equal(top("3ffe:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), null);
    assert.equal(top("3fff::"), "v6-documentation-3fff");
    assert.equal(top("233.252.0.255"), "v4-mcast-test-net");
    assert.equal(top("233.252.1.0"), "v4-multicast");
  });

  v2("URLs and bracketed IPv4 are refused with a reason", () => {
    assert.match(err("http://192.0.2.1/"), /URL/);
    assert.match(err("https://[2001:db8::1]:8443/x"), /URL/);
    assert.match(err("HTTP://127.0.0.1"), /URL/);
    assert.match(err("[192.0.2.1]"), /only written around IPv6/);
    assert.equal(ip("[2001:db8::1]").value, ip("2001:db8::1").value);
    assert.match(err("[]"), /empty|Enter|not valid|IPv4|four octets/);
  });

  v2("IPv4 integer and hex forms (inet_aton equivalents)", () => {
    const d = (s: string) => classify(ip(s)).details;
    assert.deepEqual(d("255.255.255.255"), [
      { label: "As one integer", value: "4294967295" },
      { label: "As hex", value: "0xffffffff" },
    ]);
    assert.deepEqual(d("0.0.0.0")[1], { label: "As hex", value: "0x00000000" });
    assert.deepEqual(d("169.254.169.254")[0], { label: "As one integer", value: "2852039166" });
  });

  console.log(`ip-address-classifier verifier pass 2: ${n} groups passed`);
}

/* ================= verifier pass 3 (independent) ================= */
import { readFileSync as readFileSync3, existsSync as existsSync3 } from "node:fs";
{
  let n = 0;
  const v3 = (name: string, fn: () => void) => {
    try {
      fn();
      n++;
    } catch (e) {
      console.error(`FAIL ${name}`);
      throw e;
    }
  };
  const top = (s: string) => {
    const c = classify(ip(s));
    return c.primary?.entry.id ?? c.related?.entry.id ?? null;
  };

  v3("registry rows match the downloaded IANA CSVs field by field, RFC references included", () => {
    const dir = new URL("./fixtures/iana", import.meta.url).pathname;
    for (const [file, data] of [
      ["iana-ipv4-special-registry-1.csv", IPV4_SPECIAL],
      ["iana-ipv6-special-registry-1.csv", IPV6_SPECIAL],
    ] as const) {
      const path = `${dir}/${file}`;
      if (!existsSync3(path)) {
        console.log(`(skipped CSV cross-check, ${file} not present)`);
        continue;
      }
      // Minimal CSV reader: quoted fields may hold commas and doubled quotes.
      const rows = readFileSync3(path, "utf8")
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => {
          const out: string[] = [];
          let cur = "";
          let q = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (q) {
              if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
              else if (ch === '"') q = false;
              else cur += ch;
            } else if (ch === '"') q = true;
            else if (ch === ",") { out.push(cur); cur = ""; }
            else cur += ch;
          }
          out.push(cur);
          return out;
        });
      assert.equal(rows.length, data.length, file);
      rows.forEach((r, i) => {
        const e = data[i];
        const blocks = r[0].replace(/\s*\[\d+\]/g, "").split(/,\s*/);
        assert.deepEqual(e.blocks.map((b) => b.cidr), blocks, `${file} row ${i}`);
        const cell = (c: string) => {
          const v = c.replace(/\s*\[\d+\]/, "");
          return v === "True" ? true : v === "False" ? false : null;
        };
        assert.deepEqual(
          [e.attrs.source, e.attrs.destination, e.attrs.forwardable, e.attrs.globallyReachable, e.attrs.reservedByProtocol],
          r.slice(5, 10).map(cell),
          `${blocks.join(",")} attributes`,
        );
        // RFC column: "[RFC 791, Section 3.2]; [RFC 7050, Section 2.2]" -> "RFC 791 section 3.2"
        const rfcs = r[2].split(";").map((x) => x.trim().replace(/^\[|\]$/g, "").replace(", Section ", " section "));
        assert.deepEqual(e.rfcs, rfcs, `${blocks.join(",")} RFC column`);
      });
    }
  });

  v3("RFC 5952 section 4 recommendations, independent vectors", () => {
    const f = (s: string) => classify(ip(s)).canonical;
    assert.equal(f("2001:0db8::0001"), "2001:db8::1"); // 4.1 leading zeros
    assert.equal(f("2001:db8:0:1:1:1:1:1"), "2001:db8:0:1:1:1:1:1"); // 4.2.2 no :: for one group
    assert.equal(f("2001:db8::1:1:1:1:1"), "2001:db8:0:1:1:1:1:1"); // the same, written with ::
    assert.equal(f("2001:0:0:1:0:0:0:1"), "2001:0:0:1::1"); // 4.2.3 longest run wins
    assert.equal(f("2001:db8:0:0:1:0:0:1"), "2001:db8::1:0:0:1"); // 4.2.3 tie: first run
    assert.equal(f("2001:DB8::ABCD"), "2001:db8::abcd"); // 4.3 lowercase
    assert.equal(f("0:0:0:0:0:0:0:2"), "::2");
    assert.equal(f("1:0:0:0:0:0:0:0"), "1::");
    assert.equal(formatIPv6Full(ip("::1").value), "0000:0000:0000:0000:0000:0000:0000:0001");
  });

  v3("both edges of every special-purpose block, computed from the data", () => {
    for (const e of [...IPV4_SPECIAL, ...IPV4_RELATED, ...IPV6_SPECIAL, ...IPV6_RELATED]) {
      const bits = e.family === 4 ? 32 : 128;
      for (const b of e.blocks) {
        const size = 1n << BigInt(bits - b.length);
        const first = b.network;
        const last = b.network + size - 1n;
        for (const v of [first, last]) {
          const c = classify({ family: e.family, value: v, zoneId: null });
          assert.ok(c.matches.some((m) => m.entry.id === e.id), `${b.cidr} contains its own edge`);
        }
        for (const v of [first - 1n, last + 1n]) {
          if (v < 0n || v >= 1n << BigInt(bits)) continue;
          const c = classify({ family: e.family, value: v, zoneId: null });
          assert.ok(!c.matches.some((m) => m.block === b), `${b.cidr} excludes the neighbor of its edge`);
        }
      }
    }
  });

  v3("Teredo, 6to4 and NAT64 decoding, hand-built vectors", () => {
    // RFC 4380 section 4: server 198.51.100.7 = c633:6407, port 65535 obfuscated to 0000,
    // client 203.0.113.200 = cb00:71c8, obfuscated to 34ff:8e37.
    const t = classify(ip("2001:0:c633:6407:0:0:34ff:8e37"));
    assert.equal(t.embedded[0].ipv4, "198.51.100.7");
    assert.equal(t.embedded[1].ipv4, "203.0.113.200");
    assert.equal(t.embedded[1].port, 65535);
    // port 0 obfuscates to ffff; client 0.0.0.0 to ffff:ffff
    const z = classify(ip("2001:0:0:0:8000:ffff:ffff:ffff"));
    assert.equal(z.embedded[1].port, 0);
    assert.equal(z.embedded[1].ipv4, "0.0.0.0");
    assert.match(z.details.find((d) => d.label === "Teredo flags")!.value, /cone bit set/);
    // RFC 3056 section 2: 2002:V4ADDR::/48
    assert.equal(classify(ip("2002:c000:204::1")).embedded[0].ipv4, "192.0.2.4");
    assert.equal(classify(ip("2002:ffff:ffff::")).embedded[0].ipv4, "255.255.255.255");
    // RFC 6052 section 2.4, /96 row: 64:ff9b::/96 and 192.0.2.33 -> 64:ff9b::192.0.2.33
    assert.equal(ip("64:ff9b::192.0.2.33").value, ip("64:ff9b::c000:221").value);
    assert.match(classify(ip("64:ff9b::198.51.100.1")).notes.join(" "), /198\.51\.100\.1 is Documentation \(TEST-NET-2\)/);
    assert.equal(classify(ip("64:ff9b::192.0.0.9")).notes.length, 0); // PCP anycast is globally reachable
    // 64:ff9b:1::/48 is a different entry and gets no /96 decoding
    const local = classify(ip("64:ff9b:1::a00:1"));
    assert.equal(local.primary?.entry.id, "v6-nat64-local");
    assert.equal(local.embedded.length, 0);
  });

  v3("ULA fields (RFC 4193 section 3.1) and link-local checks (RFC 4291 2.5.6)", () => {
    const u = classify(ip("fd12:3456:789a:1::1"));
    const d = Object.fromEntries(u.details.map((x) => [x.label, x.value]));
    assert.equal(d["Global ID (40 bits)"], "123456789a");
    assert.equal(d["Subnet ID (16 bits)"], "0001");
    assert.equal(d["Interface ID (64 bits)"], "0000000000000001");
    assert.match(classify(ip("fc00::1")).notes.join(" "), /L bit is 0/);
    assert.equal(classify(ip("fe80::1%eth0")).notes.length, 0);
    assert.match(classify(ip("fe80::1")).notes.join(" "), /No zone ID/);
    assert.match(classify(ip("fe80:0:0:8000::1%1")).notes.join(" "), /54 bits after fe80::\/10/);
    assert.match(classify(ip("febf::1%1")).notes.join(" "), /54 bits/);
  });

  v3("solicited-node groups use the low-order 24 bits (RFC 4291 section 2.7.1)", () => {
    // 2001:db8::aa12:3456 -> ff02::1:ff12:3456
    assert.match(classify(ip("ff02::1:ff12:3456")).wellKnown ?? "", /0x123456/);
    assert.match(classify(ip("ff02::1:ff00:1")).wellKnown ?? "", /0x000001/);
    assert.equal(classify(ip("ff02::1:ff00:0")).wellKnown?.includes("0x000000"), true);
    assert.equal(classify(ip("ff05::1:ff00:1")).wellKnown, null); // site scope is not the /104
    assert.equal(classify(ip("ff02::2:ff00:1")).wellKnown, null);
  });

  v3("strict parsing: malformed and adversarial text never throws", () => {
    const bad = [
      "fffff::", "1:2:3:4:5:6:7:8:9", "::ffff:1.2.3.4:5", "1.2.3.4.", ".1.2.3.4", "1.2.3.256", "1.2.3.4a",
      "1.2.3.0x4", "01.2.3.4", "1.2.3.4/24", "::1/128", "[::1", "fe80::1%", "fe80::1%a/b", "fe80::1%%a", "1::2:3:4:5:6:7:8",
      "::ffff:1.2.3", "::1.2.3.04", "g::", "::-1", "1:2:3:4:5:6:7", "0x0.0.0.0", "+1.2.3.4", "1,2,3,4", "1.2.3.4%25eth0",
      "a".repeat(257), "1.".repeat(128), "١.2.3.4", "１.2.3.4", "1.2.3.4​", "ftp://1.2.3.4", "[1.2.3.4]:80",
    ];
    for (const s of bad) {
      let r: ReturnType<typeof parseIp> | null = null;
      assert.doesNotThrow(() => { r = parseIp(s); }, s);
      assert.equal(r!.ok, false, `should refuse ${JSON.stringify(s)}`);
    }
    // valid edges
    for (const [s, v] of [
      ["0.0.0.0", 0n], ["255.255.255.255", 0xffffffffn], ["::", 0n], ["ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", (1n << 128n) - 1n],
      ["::255.255.255.255", 0xffffffffn], ["1::", 1n << 112n], ["[::1]", 1n], ["\t::1\n", 1n],
    ] as const) {
      assert.equal(ip(s).value, v, s);
    }
    assert.equal(top("1.0.0.0"), null);
  });

  console.log(`ip-address-classifier verifier pass 3: ${n} groups passed`);
}

/* ================= verifier pass 4 (independent) ================= */
(async () => {
  const L = "../../client/src/lib/toolkit/ip-address-classifier.ts";
  const m = await import(L);
  let n = 0;
  const g = (name: string, fn: () => void) => { fn(); n++; };
  const P = (s: string) => { const r = m.parseIp(s); assert.ok(r.ok, `${s}: ${!r.ok && r.error}`); return r.value; };
  const topId = (s: string) => { const c = m.classify(P(s)); return (c.primary ?? c.related)?.entry.id ?? null; };
  const bad = (s: string) => { const r = m.parseIp(s); assert.equal(r.ok, false, s); assert.ok(r.error.length > 10); };

  g("CGNAT and benchmarking edges (cross-checked with Python ipaddress is_global)", () => {
    assert.equal(topId("100.63.255.255"), null);
    assert.equal(topId("100.64.0.0"), "v4-shared");
    assert.equal(topId("100.127.255.255"), "v4-shared");
    assert.equal(topId("100.128.0.0"), null);
    assert.equal(topId("198.17.255.255"), null);
    assert.equal(topId("198.19.255.255"), "v4-benchmarking");
    assert.equal(topId("198.20.0.0"), null);
    assert.equal(topId("192.0.0.11"), "v4-ietf");
    assert.equal(topId("192.88.99.1"), "v4-6to4-relay");
    assert.equal(topId("192.88.99.2"), "v4-6a44");
    assert.equal(topId("255.255.255.254"), "v4-reserved");
    assert.equal(topId("255.255.255.255"), "v4-limited-broadcast");
    assert.equal(topId("223.255.255.255"), null);
    assert.equal(topId("224.0.0.0"), "v4-mcast-local");
  });
  g("RFC 6890 attribute rows", () => {
    const a = (s: string) => m.classify(P(s)).primary.entry.attrs;
    assert.deepEqual(Object.values(a("0.0.0.0")), [true, false, false, false, true]);
    assert.deepEqual(Object.values(a("169.254.1.1")), [true, true, false, false, true]);
    assert.deepEqual(Object.values(a("255.255.255.255")), [false, true, false, false, true]);
    assert.deepEqual(Object.values(a("::")), [true, false, false, false, true]);
    assert.deepEqual(Object.values(a("2001::1")), [true, true, true, null, false]);
    assert.deepEqual(Object.values(a("fd00::1")), [true, true, true, false, false]);
  });
  g("6to4 and Teredo decoding match Python ipaddress", () => {
    const e = m.classify(P("2002:c000:204::1")).embedded;
    assert.equal(e[0].ipv4, "192.0.2.4");
    const t2 = m.classify(P("2001:0:4136:e378:8000:63bf:3fff:fdd2")).embedded;
    assert.equal(t2[0].ipv4, "65.54.227.120");
    assert.equal(t2[1].ipv4, "192.0.2.45");
    assert.equal(t2[1].port, 40000);
  });
  g("NAT64 warning for non-global embedded address (RFC 6052 3.1)", () => {
    const c = m.classify(P("64:ff9b::10.0.0.1"));
    assert.ok(c.notes.some((x: string) => /RFC 6052 section 3.1/.test(x)));
    const c2 = m.classify(P("64:ff9b::8.8.8.8"));
    assert.ok(!c2.notes.some((x: string) => /RFC 6052/.test(x)));
  });
  g("RFC 5952 canonical forms", () => {
    assert.equal(m.formatIp(6, P("2001:0db8:0000:0000:0001:0000:0000:0001").value), "2001:db8::1:0:0:1");
    assert.equal(m.formatIp(6, P("2001:db8:0:1:1:1:1:1").value), "2001:db8:0:1:1:1:1:1");
    assert.equal(m.formatIp(6, P("2001:DB8::AAAA").value), "2001:db8::aaaa");
    assert.equal(m.formatIp(6, P("::ffff:c000:201").value), "::ffff:192.0.2.1");
    assert.equal(m.formatIp(6, P("0:0:0:0:0:0:0:0").value), "::");
  });
  g("multicast scope and solicited node", () => {
    const c = m.classify(P("ff05::1:3"));
    assert.ok(c.details.some((d: { value: string }) => /site-local/.test(d.value)));
    assert.match(m.classify(P("ff02::1:ff12:3456")).wellKnown ?? "", /0x123456/);
    assert.equal(m.classify(P("ff02::1:fe12:3456")).wellKnown, null);
  });
  g("malformed and adversarial input never throws", () => {
    for (const s of ["", "   ", "1.2.3.4.", ".1.2.3.4", "1.2.3", "1.2.3.256", "-1.2.3.4", "1.2.3.4/24", "::ffff:1.2.3", "1:2:3:4:5:6:7:8:9",
      "::1.2.3.4:5", "1::2::3", ":1::", "fe80::1%", "fe80::1%a b", "%eth0", "1.2.3.4%eth0", "[1.2.3.4]", "[::1", "::1]", "12345::",
      "١٩٢.0.2.1", "1.2.3.4​", "x".repeat(100000), "ffff:".repeat(1000), "1e3.0.0.1", "0x7f.0.0.1", "4294967296",
      "::g", "1:2:3:4:5:6:1.2.3.4:7", "http://1.2.3.4/", "1.2.3.4:80", "[::1]:443"]) {
      if (s.trim() === "") { assert.equal(m.parseIp(s).ok, false); continue; }
      bad(s);
    }
    // Valid edge cases
    assert.equal(P("1:2:3:4:5:6:7::").value, 0x00010002000300040005000600070000n);
    assert.equal(P("::2:3:4:5:6:7:8").value, 0x0000000200030004000500060007_0008n);
    assert.equal(P("[fe80::1%eth0]").zoneId, "eth0");
  });
  console.log(`ip-address-classifier verifier pass 4: ${n} groups passed`);
})().catch((e) => { console.error(e); process.exit(1); });

/* ================= verifier pass 5 (independent; reference values derived by hand from the RFCs) ================= */
(async () => {
  const m = await import("../../client/src/lib/toolkit/ip-address-classifier");
  let n = 0;
  const g = (name: string, fn: () => void) => {
    try {
      fn();
      n++;
    } catch (e) {
      console.error(`FAIL pass5: ${name}`);
      throw e;
    }
  };
  const P = (s: string) => {
    const r = m.parseIp(s);
    assert.ok(r.ok, `${s}: ${!r.ok && r.error}`);
    return r.value;
  };
  const topId = (s: string) => {
    const c = m.classify(P(s));
    return (c.primary ?? c.related)?.entry.id ?? null;
  };
  const attrs = (s: string) => Object.values(m.classify(P(s)).primary!.entry.attrs);

  g("Teredo (RFC 4380 section 4): server in the clear, flags, port and client inverted", () => {
    // server 192.0.2.1, flags 0, port 12345 (0x3039, ~ = 0xcfc6), client 203.0.113.9 (cb007109, ~ = 34ff8ef6)
    const c = m.classify(P("2001:0:c000:201:0:cfc6:34ff:8ef6"));
    assert.equal(c.primary!.entry.id, "v6-teredo");
    assert.equal(c.embedded[0].ipv4, "192.0.2.1");
    assert.equal(c.embedded[1].ipv4, "203.0.113.9");
    assert.equal(c.embedded[1].port, 12345);
    assert.ok(c.details.some((d: { label: string; value: string }) => d.label === "Teredo flags" && d.value === "0x0000"));
  });
  g("6to4 (RFC 3056) takes the site IPv4 address from bits 16 to 47", () => {
    const c = m.classify(P("2002:cb00:7109::1"));
    assert.equal(c.primary!.entry.id, "v6-6to4");
    assert.equal(c.embedded[0].ipv4, "203.0.113.9");
    assert.equal(c.embedded[0].classifiedAs, "Documentation (TEST-NET-3)");
  });
  g("RFC 5952 section 4.2: longest zero run wins, first run on a tie, one zero group stays", () => {
    const f = (s: string) => m.formatIp(6, P(s).value);
    assert.equal(f("2001:0:0:1:0:0:0:1"), "2001:0:0:1::1");
    assert.equal(f("0:0:0:1:0:0:0:0"), "0:0:0:1::");
    assert.equal(f("1:0:0:2:0:0:3:4"), "1::2:0:0:3:4");
    assert.equal(f("2001:db8:0:1:1:1:1:1"), "2001:db8:0:1:1:1:1:1");
    assert.equal(f("0:0:0:0:0:0:0:1"), "::1");
    assert.equal(f("2001:DB8:0:0:8:800:200C:417A"), "2001:db8::8:800:200c:417a"); // RFC 4291 section 2.2 example, canonical form
  });
  g("IPv4-mapped hex form is decoded and classified through to the IPv4 address", () => {
    const c = m.classify(P("::ffff:7f00:1"));
    assert.equal(c.canonical, "::ffff:127.0.0.1");
    assert.equal(c.primary!.entry.id, "v6-mapped");
    assert.equal(c.embedded[0].ipv4, "127.0.0.1");
    assert.equal(c.embedded[0].classifiedAs, "Loopback");
  });
  g("ULA fields (RFC 4193 section 3.1): 40-bit Global ID, 16-bit Subnet ID, L bit", () => {
    const c = m.classify(P("fd12:3456:789a:1::1"));
    const get = (l: string) => c.details.find((d: { label: string }) => d.label.startsWith(l))?.value;
    assert.equal(get("Global ID"), "123456789a");
    assert.equal(get("Subnet ID"), "0001");
    assert.equal(get("Interface ID"), "0000000000000001");
    const l0 = m.classify(P("fc00::1"));
    assert.ok(l0.notes.some((x: string) => /L bit is 0/.test(x)));
    assert.ok(!l0.details.some((d: { label: string }) => d.label.startsWith("Global ID")));
  });
  g("IPv6 multicast flags and scope (RFC 4291 section 2.7, RFC 3306, RFC 7346)", () => {
    const t = m.classify(P("ff1e::1234"));
    assert.ok(t.details.some((d: { label: string; value: string }) => d.label === "Scope" && d.value === "e (global)"));
    assert.ok(t.details.some((d: { label: string; value: string }) => d.label === "Flags" && /T: transient/.test(d.value)));
    const pt = m.classify(P("ff3e::1"));
    assert.ok(pt.details.some((d: { label: string; value: string }) => d.label === "Flags" && /P: unicast-prefix/.test(d.value) && /T: transient/.test(d.value)));
    assert.ok(m.classify(P("ff03::1")).details.some((d: { value: string }) => d.value === "3 (realm-local)"));
    assert.ok(m.classify(P("ff02::1")).details.some((d: { value: string }) => /permanently assigned/.test(d.value)));
  });
  g("block edges: one address on each side", () => {
    const edges: [string, string | null][] = [
      ["172.15.255.255", null], ["172.16.0.0", "v4-private-172"], ["172.31.255.255", "v4-private-172"], ["172.32.0.0", null],
      ["192.0.0.255", "v4-ietf"], ["192.0.1.0", null], ["192.0.2.255", "v4-test-net-1"], ["192.0.3.0", null],
      ["198.51.99.255", null], ["198.51.100.0", "v4-test-net-2"], ["203.0.113.255", "v4-test-net-3"], ["203.0.114.0", null],
      ["10.255.255.255", "v4-private-10"], ["11.0.0.0", null], ["9.255.255.255", null],
      ["169.253.255.255", null], ["169.254.255.255", "v4-link-local"], ["169.255.0.0", null],
      ["0.255.255.255", "v4-this-network"], ["1.0.0.0", null], ["239.255.255.255", "v4-mcast-admin"],
      ["3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff", "v6-documentation-3fff"], ["3fff:1000::", null],
      ["2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", "v6-documentation"], ["2001:db9::", null], ["2001:db7:ffff:ffff:ffff:ffff:ffff:ffff", null],
      ["2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff", "v6-ietf"], ["2001:200::", null],
      ["febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "v6-link-local"], ["fec0::", "v6-site-local"], ["fe7f:ffff::", null],
      ["fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "v6-ula"], ["fe00::", null], ["fbff:ffff::", null],
      ["64:ff9a:ffff:ffff:ffff:ffff:ffff:ffff", null], ["64:ff9b::", "v6-nat64-wkp"], ["64:ff9b::ffff:ffff", "v6-nat64-wkp"], ["64:ff9b::1:0:0", null],
      ["64:ff9b:1::", "v6-nat64-local"], ["100::", "v6-discard"], ["100:0:0:1::", "v6-dummy"], ["100:0:0:2::", null],
    ];
    for (const [text, id] of edges) assert.equal(topId(text), id, text);
  });
  g("registry attribute rows copied from RFC 6890 and the IANA tables", () => {
    assert.deepEqual(attrs("100.64.0.1"), [true, true, true, false, false]);
    assert.deepEqual(attrs("198.18.0.1"), [true, true, true, false, false]);
    assert.deepEqual(attrs("192.0.2.1"), [false, false, false, false, false]);
    assert.deepEqual(attrs("2001:db8::1"), [false, false, false, false, false]);
    assert.deepEqual(attrs("64:ff9b::1.2.3.4"), [true, true, true, true, false]);
    assert.deepEqual(attrs("::ffff:1.2.3.4"), [false, false, false, false, true]);
    assert.deepEqual(attrs("192.31.196.1"), [true, true, true, true, false]);
    assert.deepEqual(attrs("2620:4f:8000::1"), [true, true, true, true, false]);
  });
  g("errors for ports, URLs, brackets, zero-width characters, oversize input", () => {
    const err = (s: string) => {
      const r = m.parseIp(s);
      assert.equal(r.ok, false, s);
      return (r as { error: string }).error;
    };
    assert.match(err("192.0.2.1:8080"), /port/i);
    assert.match(err("[2001:db8::1]:443"), /port/i);
    assert.match(err("https://192.0.2.1/"), /URL/);
    assert.match(err("[192.0.2.1]"), /IPv6/);
    assert.match(err("192.0.2.1​"), /U\+200B/);
    assert.match(err("0".repeat(300)), /256/);
    assert.match(err("2001:db8::1/64"), /prefix/i);
    assert.match(err("1.2.3.4%eth0"), /zone/i);
    assert.match(err("010.0.0.1"), /leading zero/);
    assert.match(err("192.0.2.256"), /0 to 255/);
    assert.match(err("2001:db8:::1"), /:::/);
    assert.match(err("1:2:3:4:5:6:7:8:9"), /eight groups|at most seven/);
    assert.match(err("12345::1"), /four hex/);
  });
  g("hostile text never throws, and anything accepted formats and reparses to itself", () => {
    const alphabet = ["0", "1", "9", "f", "F", "g", ":", "::", ".", "%", "/", "[", "]", " ", "a", "​", "٣", "x", "-"];
    let seed = 99;
    const rnd = (k: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % k;
    };
    let accepted = 0;
    for (let i = 0; i < 30000; i++) {
      let s = "";
      if (i % 3 === 0) {
        // Friendlier alphabet so a fair share of the inputs are valid addresses.
        const friendly = ["0", "1", "a", "f", "ff", "db8", "2001", ":", ":", "::", ".", "255", "7", "192", "168"];
        for (let j = rnd(14) + 1; j > 0; j--) s += friendly[rnd(friendly.length)];
      } else if (i % 3 === 1) {
        // A valid address with one position replaced by a hostile token.
        s = m.formatIp(rnd(2) ? 4 : 6, BigInt(rnd(0x7fffffff)) * BigInt(rnd(0x7fffffff)));
        const at = rnd(s.length + 1);
        s = s.slice(0, at) + alphabet[rnd(alphabet.length)] + s.slice(at + 1);
      } else {
        for (let j = rnd(24); j > 0; j--) s += alphabet[rnd(alphabet.length)];
      }
      const r = m.parseIp(s);
      if (!r.ok) continue;
      accepted++;
      const c = m.classify(r.value);
      const again = m.parseIp(c.canonical);
      assert.ok(again.ok && again.value.value === r.value.value && again.value.family === r.value.family, s);
    }
    assert.ok(accepted > 100, "fuzz accepted too few inputs to be meaningful");
  });
  console.log(`ip-address-classifier verifier pass 5: ${n} groups passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
