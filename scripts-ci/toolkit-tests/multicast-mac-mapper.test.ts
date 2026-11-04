import assert from "node:assert/strict";
import {
  formatIPv6,
  formatMac,
  ipv4Collisions,
  ipv4GroupToMac,
  ipv4LostBits,
  ipv4Block,
  ipv6GroupToMac,
  isSolicitedNode,
  mapInput,
  macToCandidates,
  parseIPv4,
  parseIPv6,
  parseMac,
  solicitedNodeGroup,
  toBits,
  type MapResult,
} from "../../client/src/lib/toolkit/multicast-mac-mapper.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const v4 = (s: string) => {
  const p = parseIPv4(s);
  assert.ok(p.ok, s);
  return p.ok ? p.value : 0;
};
const v6 = (s: string) => {
  const p = parseIPv6(s);
  assert.ok(p.ok, `${s}: ${p.ok ? "" : p.error}`);
  return p.ok ? p.value.value : 0n;
};
const mac = (s: string) => {
  const p = parseMac(s);
  assert.ok(p.ok, s);
  return p.ok ? p.value : [];
};

/* RFC 1112 section 6.4 */
test("ipv4 base mapping", () => {
  assert.equal(formatMac(ipv4GroupToMac(v4("224.0.0.0"))), "01:00:5e:00:00:00");
  assert.equal(formatMac(ipv4GroupToMac(v4("224.0.0.1"))), "01:00:5e:00:00:01");
  assert.equal(formatMac(ipv4GroupToMac(v4("224.0.0.5"))), "01:00:5e:00:00:05");
  assert.equal(formatMac(ipv4GroupToMac(v4("224.0.0.251"))), "01:00:5e:00:00:fb");
  assert.equal(formatMac(ipv4GroupToMac(v4("239.255.255.250"))), "01:00:5e:7f:ff:fa");
  assert.equal(formatMac(ipv4GroupToMac(v4("239.255.255.255"))), "01:00:5e:7f:ff:ff");
  assert.equal(formatMac(ipv4GroupToMac(v4("224.128.0.1"))), "01:00:5e:00:00:01");
  assert.equal(formatMac(ipv4GroupToMac(v4("232.1.2.3"))), "01:00:5e:01:02:03");
  assert.equal(formatMac(ipv4GroupToMac(v4("239.129.1.1"))), "01:00:5e:01:01:01");
});

test("lost bits", () => {
  assert.equal(ipv4LostBits(v4("224.0.0.1")), 0);
  assert.equal(ipv4LostBits(v4("224.128.0.1")), 1);
  assert.equal(ipv4LostBits(v4("225.0.0.1")), 2);
  assert.equal(ipv4LostBits(v4("239.255.255.250")), 31);
  assert.equal(toBits(v4("224.0.0.1"), 32), "11100000000000000000000000000001");
});

test("32 collisions", () => {
  const c = ipv4Collisions(v4("224.0.0.1"));
  assert.equal(c.length, 32);
  assert.equal(c[0].address, "224.0.0.1");
  assert.equal(c[1].address, "224.128.0.1");
  assert.equal(c[2].address, "225.0.0.1");
  assert.equal(c[31].address, "239.128.0.1");
  assert.equal(new Set(c.map((x) => x.address)).size, 32);
  for (const x of c) assert.equal(formatMac(ipv4GroupToMac(x.value)), "01:00:5e:00:00:01");
  assert.equal(c[0].name?.startsWith("All systems"), true);
  const s = ipv4Collisions(v4("239.255.255.250"));
  assert.ok(s.some((x) => x.address === "224.127.255.250"));
  assert.ok(s.some((x) => x.address === "239.255.255.250" && x.name?.startsWith("SSDP")));
});

test("rfc 5771 blocks", () => {
  assert.match(ipv4Block(v4("224.0.0.5")), /Local Network Control/);
  assert.match(ipv4Block(v4("224.0.1.1")), /Internetwork Control/);
  assert.match(ipv4Block(v4("232.1.1.1")), /Source-Specific/);
  assert.match(ipv4Block(v4("233.252.0.7")), /MCAST-TEST-NET/);
  assert.match(ipv4Block(v4("233.1.2.3")), /GLOP/);
  assert.match(ipv4Block(v4("239.255.255.250")), /Local Scope/);
  assert.match(ipv4Block(v4("239.192.1.1")), /Organization Local/);
  assert.match(ipv4Block(v4("239.1.1.1")), /Administratively Scoped Block/);
  assert.match(ipv4Block(v4("10.0.0.1")), /Not multicast/);
});

test("ipv4 parse errors", () => {
  for (const bad of ["224.0.0", "224.0.0.256", "224.0.0.01", "224..0.1", "1.2.3.4.5", "abc", ""]) {
    assert.equal(parseIPv4(bad).ok, false, bad);
  }
  assert.equal(parseIPv4("0.0.0.0").ok, true);
  assert.equal(parseIPv4("255.255.255.255").ok && parseIPv4("255.255.255.255").ok, true);
});

/* RFC 2464 section 7 */
test("ipv6 mapping", () => {
  assert.equal(formatMac(ipv6GroupToMac(v6("ff02::1"))), "33:33:00:00:00:01");
  assert.equal(formatMac(ipv6GroupToMac(v6("ff02::2"))), "33:33:00:00:00:02");
  assert.equal(formatMac(ipv6GroupToMac(v6("ff02::fb"))), "33:33:00:00:00:fb");
  assert.equal(formatMac(ipv6GroupToMac(v6("ff02::1:ff00:1"))), "33:33:ff:00:00:01");
  assert.equal(formatMac(ipv6GroupToMac(v6("ff02::1:2"))), "33:33:00:01:00:02");
  assert.equal(formatMac(ipv6GroupToMac(v6("ff05::1:3"))), "33:33:00:01:00:03");
  assert.equal(formatMac(ipv6GroupToMac(v6("ff0e::db8:abcd:1234"))), "33:33:ab:cd:12:34");
});

/* RFC 4291 section 2.7.1 example: 4037::01:800:200E:8C6C -> FF02::1:FF0E:8C6C */
test("solicited node", () => {
  const sn = solicitedNodeGroup(v6("4037::01:800:200E:8C6C"));
  assert.equal(formatIPv6(sn), "ff02::1:ff0e:8c6c");
  assert.equal(isSolicitedNode(sn), true);
  assert.equal(isSolicitedNode(v6("ff02::1")), false);
  const r = mapInput("2001:db8::aabb:ccdd");
  assert.equal(r.kind, "ipv6-unicast");
  if (r.kind === "ipv6-unicast") {
    assert.equal(r.solicited, "ff02::1:ffbb:ccdd");
    assert.equal(formatMac(r.mac), "33:33:ff:bb:cc:dd");
  }
});

/* RFC 5952 canonical text and RFC 4291 parsing */
test("ipv6 parse and format", () => {
  assert.equal(formatIPv6(v6("FF02:0:0:0:0:0:0:1")), "ff02::1");
  assert.equal(formatIPv6(v6("ff02:0000:0000:0000:0000:0001:ff28:9c5a")), "ff02::1:ff28:9c5a");
  assert.equal(formatIPv6(v6("2001:db8:0:0:1:0:0:1")), "2001:db8::1:0:0:1");
  assert.equal(formatIPv6(v6("2001:0:0:1:0:0:0:1")), "2001:0:0:1::1");
  assert.equal(formatIPv6(v6("2001:db8:0:1:1:1:1:1")), "2001:db8:0:1:1:1:1:1");
  assert.equal(formatIPv6(v6("::")), "::");
  assert.equal(formatIPv6(v6("::1")), "::1");
  assert.equal(formatIPv6(v6("1::")), "1::");
  assert.equal(formatIPv6(v6("::ffff:192.0.2.1")), "::ffff:c000:201");
  assert.equal(formatIPv6(v6("[ff02::1%eth0]")), "ff02::1");
  for (const bad of [":::", "1:::2", "1::2::3", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "12345::", "ff02::g", ":1::", "1::2:", "::1.2.3", "1:2:3:4:5:6:7::1.2.3.4", "ff02::1%"]) {
    assert.equal(parseIPv6(bad).ok, false, bad);
  }
});

test("mac parse", () => {
  assert.equal(formatMac(mac("01-00-5E-00-00-FB")), "01:00:5e:00:00:fb");
  assert.equal(formatMac(mac("0100.5e00.00fb")), "01:00:5e:00:00:fb");
  assert.equal(formatMac(mac("01005e0000fb")), "01:00:5e:00:00:fb");
  assert.equal(formatMac(mac("1:0:5e:0:0:fb")), "01:00:5e:00:00:fb");
  assert.equal(formatMac(mac("01:00:5e:00:00:fb"), "cisco"), "0100.5e00.00fb");
  assert.equal(formatMac(mac("01:00:5e:00:00:fb"), "hyphen"), "01-00-5E-00-00-FB");
  for (const bad of ["01:00:5e:00:00", "01:00-5e:00:00:fb", "01:00:5e:00:00:fg", "0100.5e00.00f", "01005e0000fb0"]) {
    assert.equal(parseMac(bad).ok, false, bad);
  }
});

test("reverse ipv4", () => {
  const r = macToCandidates(mac("01:00:5e:7f:ff:fa"));
  assert.equal(r.kind, "mac");
  if (r.kind === "mac") {
    assert.equal(r.family, "ipv4");
    assert.equal(r.ipv4Candidates.length, 32);
    assert.equal(r.ipv4Candidates[0].address, "224.127.255.250");
    assert.ok(r.ipv4Candidates.some((c) => c.address === "239.255.255.250"));
  }
  const upper = macToCandidates(mac("01:00:5e:80:00:01"));
  assert.ok(upper.kind === "mac" && upper.family === "other" && upper.ipv4Candidates.length === 0);
  assert.ok(upper.kind === "mac" && /MPLS/.test(upper.summary));
  const upper2 = macToCandidates(mac("01:00:5e:90:00:01"));
  assert.ok(upper2.kind === "mac" && !/MPLS/.test(upper2.summary));
});

test("reverse ipv6", () => {
  const r = macToCandidates(mac("33:33:ff:28:9c:5a"));
  assert.ok(r.kind === "mac" && r.family === "ipv6");
  if (r.kind === "mac") {
    assert.equal(r.ipv6Candidates[0].address, "ff02::1:ff28:9c5a");
    assert.match(r.ipv6Candidates[0].name ?? "", /Solicited-node/);
    assert.ok(r.ipv6Candidates.some((c) => c.address === "ff02::ff28:9c5a"));
  }
  const all = macToCandidates(mac("33:33:00:00:00:01"));
  if (all.kind === "mac") {
    assert.equal(all.ipv6Candidates[0].address, "ff02::1");
    assert.match(all.ipv6Candidates[0].name ?? "", /All nodes, link-local/);
    assert.equal(all.ipv6Candidates[1].address, "ff01::1");
    assert.equal(all.ipv6Candidates.length, 5);
  }
});

test("reverse other", () => {
  const u = macToCandidates(mac("00:50:56:aa:bb:cc"));
  assert.ok(u.kind === "mac" && !u.multicast && /unicast/.test(u.summary));
  const stp = macToCandidates(mac("01:80:c2:00:00:00"));
  assert.ok(stp.kind === "mac" && stp.multicast && /BPDU/.test(stp.l2Name ?? ""));
  const bc = macToCandidates(mac("ff:ff:ff:ff:ff:ff"));
  assert.ok(bc.kind === "mac" && bc.l2Name === "Broadcast");
});

test("mapInput detection and errors", () => {
  const kinds = (s: string): MapResult["kind"] => mapInput(s).kind;
  assert.equal(kinds(""), "empty");
  assert.equal(kinds("   "), "empty");
  assert.equal(kinds("224.0.0.5"), "ipv4");
  assert.equal(kinds("ff02::5"), "ipv6");
  assert.equal(kinds("01:00:5e:00:00:05"), "mac");
  assert.equal(kinds("0100.0000.0001"), "mac");
  assert.equal(kinds("010000000001"), "mac");
  assert.equal(kinds("10.0.0.1"), "error");
  assert.equal(kinds("::"), "error");
  assert.equal(kinds("::1"), "error");
  assert.equal(kinds("ff02::1/16"), "error");
  assert.equal(kinds("hello"), "error");
  assert.equal(kinds("x".repeat(10000)), "error");
  assert.equal(kinds(":".repeat(99)), "error");
  assert.equal(kinds("1.".repeat(40)), "error");
  const ospf = mapInput("224.0.0.5");
  assert.ok(ospf.kind === "ipv4" && ospf.inControlBlock && ospf.sharesControlBlockMac);
  const bad = mapInput("239.128.0.5");
  assert.ok(bad.kind === "ipv4" && !bad.inControlBlock && bad.sharesControlBlockMac);
  const fine = mapInput("239.1.1.1");
  assert.ok(fine.kind === "ipv4" && !fine.sharesControlBlockMac);
  const scoped = mapInput("ff05::2");
  assert.ok(scoped.kind === "ipv6" && scoped.scope === 5 && scoped.scopeName === "site-local");
  const zoned = mapInput("ff02::1%eth0");
  assert.ok(zoned.kind === "ipv6" && zoned.zoneIgnored === "eth0");
  const doc = mapInput("ff0e::db8:0:1");
  assert.ok(doc.kind === "ipv6" && /RFC 6676/.test(doc.name ?? ""));
  const transient = mapInput("ff15::1234");
  assert.ok(transient.kind === "ipv6" && transient.flags === 1 && transient.flagNotes.some((n) => n.startsWith("T = 1")));
});

/* Fuzz: never throws on random input. */
test("fuzz", () => {
  const alphabet = "0123456789abcdefABCDEF:.-%[]/ x";
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let i = 0; i < 20000; i += 1) {
    const len = rnd() % 48;
    let s = "";
    for (let j = 0; j < len; j += 1) s += alphabet[rnd() % alphabet.length];
    const r = mapInput(s);
    assert.ok(typeof r.kind === "string");
  }
});


/* ---------------- Independent verifier cases ---------------- */

test("verifier: RFC 1112 boundaries and lost-bit extremes", () => {
  // 224.0.0.0 has lost bits 00000 and maps to the bottom of the block; 239.255.255.255 has 11111.
  assert.equal(ipv4LostBits(v4("224.0.0.0")), 0);
  assert.equal(ipv4LostBits(v4("239.255.255.255")), 31);
  assert.equal(ipv4LostBits(v4("224.127.255.255")), 0);
  assert.equal(ipv4LostBits(v4("224.128.0.0")), 1);
  const top = ipv4Collisions(v4("239.255.255.255"));
  assert.equal(top[0].address, "224.127.255.255");
  assert.equal(top[31].address, "239.255.255.255");
  // 233.252.0.1, MCAST-TEST-NET: 252 = 0xfc, top bit dropped -> 0x7c.
  assert.equal(formatMac(ipv4GroupToMac(v4("233.252.0.1"))), "01:00:5e:7c:00:01");
  // 238.0.0.0 shares 01:00:5e:00:00:00 with the base address.
  const r = mapInput("238.0.0.0");
  assert.ok(r.kind === "ipv4" && r.sharesControlBlockMac && !r.inControlBlock);
  assert.ok(r.kind === "ipv4" && r.collisions.some((c) => c.address === "224.0.0.0"));
  // 223.255.255.255 and 240.0.0.0 sit just outside 224.0.0.0/4.
  assert.equal(mapInput("223.255.255.255").kind, "error");
  assert.equal(mapInput("240.0.0.0").kind, "error");
  assert.equal(mapInput("255.255.255.255").kind, "error");
});

test("verifier: well-known names", () => {
  const n = (s: string) => {
    const r = mapInput(s);
    return r.kind === "ipv4" || r.kind === "ipv6" ? r.name ?? "" : "";
  };
  assert.match(n("224.0.0.1"), /All systems/);
  assert.match(n("224.0.0.5"), /OSPF AllSPFRouters/);
  assert.match(n("224.0.0.6"), /OSPF AllDRouters/);
  assert.match(n("224.0.0.251"), /mDNS/);
  assert.match(n("ff02::1"), /All nodes, link-local/);
  assert.match(n("ff02::fb"), /mDNS/);
  assert.match(n("ff02::1:ffab:cdef"), /Solicited-node.*ab:cdef/);
  assert.equal(n("224.0.0.3"), "");
});

test("verifier: solicited-node for an EUI-64 link-local address", () => {
  // fe80::2aa:ff:fe28:9c5a -> ff02::1:ff28:9c5a -> 33:33:ff:28:9c:5a (RFC 4291 2.7.1, RFC 2464 7)
  const r = mapInput("fe80::2aa:ff:fe28:9c5a%eth0");
  assert.equal(r.kind, "ipv6-unicast");
  if (r.kind === "ipv6-unicast") {
    assert.equal(r.address, "fe80::2aa:ff:fe28:9c5a");
    assert.equal(r.solicited, "ff02::1:ff28:9c5a");
    assert.equal(formatMac(r.mac), "33:33:ff:28:9c:5a");
  }
  // Solicited-node prefix ff02::1:ff00:0/104 exactly.
  assert.equal(isSolicitedNode(v6("ff02::1:ff00:0")), true);
  assert.equal(isSolicitedNode(v6("ff02::1:ffff:ffff")), true);
  assert.equal(isSolicitedNode(v6("ff02::1:fe00:0")), false);
  assert.equal(isSolicitedNode(v6("ff05::1:ff00:1")), false);
});

test("verifier: IPv6 mapping drops the top 96 bits", () => {
  assert.equal(formatMac(ipv6GroupToMac(v6("ff02::2"))), formatMac(ipv6GroupToMac(v6("ff05::2"))));
  assert.equal(formatMac(ipv6GroupToMac(v6("ff3e:40:2001:db8::8000:1"))), "33:33:80:00:00:01");
  assert.equal(formatMac(ipv6GroupToMac(v6("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"))), "33:33:ff:ff:ff:ff");
  assert.equal(formatMac(ipv6GroupToMac(v6("ff02::192.0.2.1"))), "33:33:c0:00:02:01");
  const r = macToCandidates(mac("33:33:00:00:00:fb"));
  assert.ok(r.kind === "mac" && /2\^88/.test(r.summary) && !/2\^96/.test(r.summary));
});

test("verifier: flag validity (RFC 3306, RFC 3956)", () => {
  const p0 = mapInput("ff22::1");
  assert.ok(p0.kind === "ipv6" && p0.flagNotes.some((s) => /P = 1 requires T = 1/.test(s)));
  const ok = mapInput("ff32::1");
  assert.ok(ok.kind === "ipv6" && !ok.flagNotes.some((s) => /not valid/.test(s)));
  const r = mapInput("ff52::1");
  assert.ok(r.kind === "ipv6" && r.flagNotes.some((s) => /R = 1 requires P = 1/.test(s)));
  const rp = mapInput("ff72::1");
  assert.ok(rp.kind === "ipv6" && !rp.flagNotes.some((s) => /not valid/.test(s)));
});

test("verifier: friendly errors for near misses", () => {
  const e = (s: string) => {
    const r = mapInput(s);
    assert.equal(r.kind, "error", s);
    return r.kind === "error" ? r.message : "";
  };
  assert.match(e("01:00:5e:00:00"), /six octets\. This has 5/);
  assert.match(e("01-00-5e-00-00"), /six octets\. This has 5/);
  assert.match(e("01:00:5e:00:00:05:07"), /six octets\. This has 7/);
  assert.match(e("::ffff:224.0.0.5"), /IPv4-mapped form of 224\.0\.0\.5/);
  assert.match(e("224.0.0.256"), /0 to 255/);
  assert.match(e("224.0.0.05"), /leading zero/);
  assert.match(e("10.1.2.3"), /not a multicast address/);
  assert.match(e("\u0662\u0662\u0664.0.0.1"), /Not recognized/);
  assert.match(e("224.0.0.1\u200b"), /Not recognized/);
  assert.match(e("1".repeat(101)), /capped/);
  assert.equal(mapInput("1:2:3:4:5:6:7:8").kind, "ipv6-unicast");
});

test("verifier: reverse 01:00:5e:00:00:fb lists the mDNS group", () => {
  const r = mapInput("0100.5E00.00FB");
  assert.ok(r.kind === "mac" && r.family === "ipv4");
  if (r.kind === "mac") {
    assert.equal(r.ipv4Candidates.length, 32);
    assert.ok(r.ipv4Candidates.some((c) => c.address === "224.0.0.251" && /mDNS/.test(c.name ?? "")));
    assert.ok(r.ipv4Candidates.some((c) => c.address === "239.128.0.251"));
    for (const c of r.ipv4Candidates) assert.equal(formatMac(ipv4GroupToMac(c.value)), "01:00:5e:00:00:fb");
  }
  const lldp = mapInput("01:80:c2:00:00:0e");
  assert.ok(lldp.kind === "mac" && /LLDP/.test(lldp.l2Name ?? "") && /reserved block/.test(lldp.summary));
  const local = mapInput("02:00:00:00:00:01");
  assert.ok(local.kind === "mac" && !local.multicast);
});

test("verifier: adversarial fuzz with unicode and long runs", () => {
  const alphabet = ["0", "1", "f", "F", ":", ".", "-", "%", "[", "]", " ", "\u00e9", "\u{1F600}", "\u0000", "::", "ff02", "224."];
  let seed = 777;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let i = 0; i < 20000; i += 1) {
    let s = "";
    const len = rnd() % 60;
    for (let j = 0; j < len; j += 1) s += alphabet[rnd() % alphabet.length];
    const r = mapInput(s);
    assert.ok(["empty", "error", "ipv4", "ipv6", "ipv6-unicast", "mac"].includes(r.kind));
    if (r.kind === "error") assert.ok(r.message.length > 0 && !r.message.includes("undefined") && !r.message.includes("NaN"));
  }
});

console.log(`multicast-mac-mapper: ${passed} tests passed`);
