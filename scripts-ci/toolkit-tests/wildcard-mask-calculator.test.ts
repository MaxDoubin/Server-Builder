import assert from "node:assert/strict";
import {
  aclKind,
  aclLines,
  compareBits,
  highestMatch,
  invert,
  ipToString,
  looksLikeSubnetMask,
  lowestMatch,
  maskToPrefix,
  matchCount,
  matches,
  matchingBlocks,
  normalize,
  ospfLines,
  parseAclNumber,
  parseIpv4,
  parseMaskOrPrefix,
  parseOspfArea,
  parseOspfProcess,
  parseWildcard,
  popcount,
  prefixToMask,
  toDottedBinary,
  trailingOnes,
  wildcardToPrefix,
} from "../../client/src/lib/toolkit/wildcard-mask-calculator.ts";

const ip = (s: string): number => {
  const p = parseIpv4(s);
  if (!p.ok) throw new Error(`bad test ip ${s}: ${p.error}`);
  return p.value;
};

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n += 1;
};

t("parse ipv4", () => {
  assert.equal(ip("0.0.0.0"), 0);
  assert.equal(ip("255.255.255.255"), 0xffffffff);
  assert.equal(ip("192.0.2.1"), 0xc0000201);
  assert.equal(ip(" 10.1.2.3 "), 0x0a010203);
  for (const bad of ["", "1.2.3", "1.2.3.4.5", "256.0.0.0", "01.2.3.4", "1..2.3", "a.b.c.d", "1.2.3.-4", "1.2.3.4/24", "1e2.0.0.0", "x".repeat(10000)]) {
    const r = parseIpv4(bad);
    assert.equal(r.ok, false, `should reject ${bad.slice(0, 20)}`);
    if (!r.ok) assert.ok(r.error.length > 0);
  }
});

t("prefix and mask", () => {
  assert.equal(prefixToMask(0), 0);
  assert.equal(prefixToMask(32), 0xffffffff);
  assert.equal(prefixToMask(24), 0xffffff00);
  assert.equal(prefixToMask(1), 0x80000000);
  assert.equal(prefixToMask(31), 0xfffffffe);
  for (let p = 0; p <= 32; p += 1) {
    assert.equal(maskToPrefix(prefixToMask(p)), p);
    assert.equal(wildcardToPrefix(invert(prefixToMask(p))), p);
    assert.equal(popcount(invert(prefixToMask(p))), 32 - p);
  }
  assert.equal(maskToPrefix(ip("255.0.255.0")), null);
  assert.equal(wildcardToPrefix(ip("0.0.254.255")), null);
  assert.equal(wildcardToPrefix(ip("0.0.0.255")), 24);
  assert.equal(wildcardToPrefix(ip("0.0.15.255")), 20);
  assert.equal(wildcardToPrefix(0), 32);
  assert.equal(wildcardToPrefix(0xffffffff), 0);
});

t("mask to wildcard, the classic table", () => {
  const pairs: [string, string][] = [
    ["255.255.255.0", "0.0.0.255"],
    ["255.255.255.252", "0.0.0.3"],
    ["255.255.240.0", "0.0.15.255"],
    ["255.255.255.255", "0.0.0.0"],
    ["0.0.0.0", "255.255.255.255"],
    ["255.255.255.224", "0.0.0.31"],
    ["255.128.0.0", "0.127.255.255"],
  ];
  for (const [mask, wild] of pairs) {
    assert.equal(ipToString(invert(ip(mask))), wild);
    assert.equal(ipToString(invert(ip(wild))), mask);
  }
});

t("parseMaskOrPrefix", () => {
  const a = parseMaskOrPrefix("/24");
  assert.ok(a.ok && a.value.prefix === 24 && a.value.mask === 0xffffff00);
  const b = parseMaskOrPrefix("20");
  assert.ok(b.ok && b.value.prefix === 20);
  const c = parseMaskOrPrefix("255.255.255.252");
  assert.ok(c.ok && c.value.prefix === 30);
  const d = parseMaskOrPrefix("/0");
  assert.ok(d.ok && d.value.mask === 0);
  const e = parseMaskOrPrefix("0.0.0.0");
  assert.ok(e.ok && e.value.prefix === 0);
  for (const bad of ["/33", "33", "/", "/ab", "255.0.255.0", "999", "1.2.3"]) {
    assert.equal(parseMaskOrPrefix(bad).ok, false, bad);
  }
  const w = parseMaskOrPrefix("0.0.0.255");
  assert.ok(!w.ok && /wildcard/.test(w.error) && /255\.255\.255\.0/.test(w.error));
});

t("parseWildcard", () => {
  const a = parseWildcard("0.0.254.255");
  assert.ok(a.ok && a.value === 0x0000feff);
  assert.equal(parseWildcard("/24").ok, false);
  assert.equal(parseWildcard("24").ok, false);
  assert.equal(parseWildcard("").ok, false);
  assert.ok(looksLikeSubnetMask(ip("255.255.255.0")));
  assert.ok(!looksLikeSubnetMask(ip("0.0.0.255")));
  assert.ok(!looksLikeSubnetMask(0));
  assert.ok(!looksLikeSubnetMask(0xffffffff));
});

t("matching, contiguous", () => {
  const ref = ip("192.0.2.0");
  const w = ip("0.0.0.255");
  assert.ok(matches(ref, w, ip("192.0.2.0")));
  assert.ok(matches(ref, w, ip("192.0.2.255")));
  assert.ok(!matches(ref, w, ip("192.0.3.0")));
  assert.ok(!matches(ref, w, ip("192.0.1.255")));
  assert.equal(matchCount(w), 256);
  assert.equal(ipToString(lowestMatch(ref, w)), "192.0.2.0");
  assert.equal(ipToString(highestMatch(ref, w)), "192.0.2.255");
  // any and host
  assert.ok(matches(0, 0xffffffff, ip("203.0.113.9")));
  assert.equal(matchCount(0xffffffff), 4294967296);
  assert.equal(matchCount(0), 1);
  assert.ok(matches(ip("10.0.0.1"), 0, ip("10.0.0.1")));
  assert.ok(!matches(ip("10.0.0.1"), 0, ip("10.0.0.2")));
  // top bit set on both sides must not trip the signed int32 trap
  assert.ok(matches(ip("255.255.255.255"), 0, ip("255.255.255.255")));
  assert.ok(!matches(ip("128.0.0.0"), 0, ip("0.0.0.0")));
});

t("matching, non-contiguous odd third octet", () => {
  const ref = ip("10.0.1.0");
  const w = ip("0.0.254.255");
  assert.equal(matchCount(w), 32768);
  for (let third = 0; third < 256; third += 1) {
    const addr = ip(`10.0.${third}.77`);
    assert.equal(matches(ref, w, addr), third % 2 === 1, `third octet ${third}`);
  }
  assert.ok(!matches(ref, w, ip("10.1.1.0")));
  const blocks = matchingBlocks(ref, w, 4);
  assert.equal(blocks.total, 128);
  assert.equal(blocks.blockSize, 256);
  assert.deepEqual(
    blocks.blocks.map((b) => `${ipToString(b.base)}/${b.prefix}`),
    ["10.0.1.0/24", "10.0.3.0/24", "10.0.5.0/24", "10.0.7.0/24"],
  );
  const all = matchingBlocks(ref, w, 1000);
  assert.equal(all.blocks.length, 128);
  assert.equal(ipToString(all.blocks[127].base), "10.0.255.0");
  for (let i = 1; i < all.blocks.length; i += 1) assert.ok(all.blocks[i].base > all.blocks[i - 1].base);
});

t("matching, .1 in every /24 of a /16", () => {
  const ref = ip("10.20.0.1");
  const w = ip("0.0.255.0");
  assert.equal(matchCount(w), 256);
  assert.equal(trailingOnes(w), 0);
  const b = matchingBlocks(ref, w, 3);
  assert.equal(b.total, 256);
  assert.equal(b.blockSize, 1);
  assert.deepEqual(b.blocks.map((x) => ipToString(x.base)), ["10.20.0.1", "10.20.1.1", "10.20.2.1"]);
  assert.ok(matches(ref, w, ip("10.20.200.1")));
  assert.ok(!matches(ref, w, ip("10.20.200.2")));
});

t("matchingBlocks, extremes", () => {
  const any = matchingBlocks(ip("1.2.3.4"), 0xffffffff, 10);
  assert.equal(any.total, 1);
  assert.equal(any.blocks[0].prefix, 0);
  assert.equal(any.blocks[0].base, 0);
  assert.equal(any.blockSize, 4294967296);
  // every bit ignored except the lowest: odd addresses, 2^31 single-address blocks
  const odd = matchingBlocks(ip("0.0.0.1"), 0xfffffffe, 2);
  assert.equal(odd.total, 2147483648);
  assert.deepEqual(odd.blocks.map((x) => ipToString(x.base)), ["0.0.0.1", "0.0.0.3"]);
  // top bit only free
  const top = matchingBlocks(ip("0.0.0.5"), 0x80000000, 5);
  assert.equal(top.total, 2);
  assert.deepEqual(top.blocks.map((x) => ipToString(x.base)), ["0.0.0.5", "128.0.0.5"]);
  assert.equal(matchingBlocks(0, 0, -5).blocks.length, 0);
});

t("normalize clears ignored bits", () => {
  assert.equal(ipToString(normalize(ip("192.0.2.77"), ip("0.0.0.255"))), "192.0.2.0");
  assert.equal(ipToString(normalize(ip("10.0.3.9"), ip("0.0.254.255"))), "10.0.1.0");
  assert.equal(ipToString(normalize(ip("255.255.255.255"), 0)), "255.255.255.255");
});

t("bit comparison", () => {
  const rows = compareBits(ip("10.0.1.0"), ip("0.0.254.255"), ip("10.0.2.0"));
  assert.equal(rows.length, 32);
  const mismatches = rows.filter((r) => r.status === "mismatch");
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].octet, 3);
  assert.equal(mismatches[0].weight, 1);
  assert.equal(mismatches[0].index, 23);
  assert.equal(rows.filter((r) => r.status === "ignored").length, 15);
  assert.equal(rows[0].weight, 128);
  assert.equal(rows[31].weight, 1);
  assert.equal(toDottedBinary(ip("0.0.254.255")), "00000000.00000000.11111110.11111111");
});

t("ACL numbers and lines", () => {
  assert.equal(aclKind(1), "standard");
  assert.equal(aclKind(99), "standard");
  assert.equal(aclKind(100), "extended");
  assert.equal(aclKind(199), "extended");
  assert.equal(aclKind(200), null);
  assert.equal(aclKind(1299), null);
  assert.equal(aclKind(1300), "standard");
  assert.equal(aclKind(1999), "standard");
  assert.equal(aclKind(2000), "extended");
  assert.equal(aclKind(2699), "extended");
  assert.equal(aclKind(2700), null);
  assert.equal(aclKind(0), null);
  assert.equal(parseAclNumber("abc").ok, false);
  assert.equal(parseAclNumber("250").ok, false);
  assert.equal(parseAclNumber("99999").ok, false);
  const ok = parseAclNumber(" 10 ");
  assert.ok(ok.ok && ok.value.number === 10 && ok.value.kind === "standard");

  const std = aclLines(10, "standard", "permit", ip("192.0.2.0"), ip("0.0.0.255"));
  assert.equal(std.explicit, "access-list 10 permit 192.0.2.0 0.0.0.255");
  assert.equal(std.shorthand, null);
  const host = aclLines(10, "standard", "deny", ip("192.0.2.10"), 0);
  assert.equal(host.explicit, "access-list 10 deny 192.0.2.10 0.0.0.0");
  assert.equal(host.shorthand, "access-list 10 deny host 192.0.2.10");
  const any = aclLines(10, "standard", "permit", ip("192.0.2.10"), 0xffffffff);
  assert.equal(any.explicit, "access-list 10 permit 0.0.0.0 255.255.255.255");
  assert.equal(any.shorthand, "access-list 10 permit any");
  const ext = aclLines(110, "extended", "permit", ip("192.0.2.9"), ip("0.0.0.255"));
  assert.equal(ext.explicit, "access-list 110 permit ip 192.0.2.0 0.0.0.255 any");
  const extHost = aclLines(110, "extended", "permit", ip("192.0.2.9"), 0);
  assert.equal(extHost.shorthand, "access-list 110 permit ip host 192.0.2.9 any");
  const odd = aclLines(10, "standard", "permit", ip("10.0.3.0"), ip("0.0.254.255"));
  assert.equal(odd.explicit, "access-list 10 permit 10.0.1.0 0.0.254.255");
});

t("OSPF", () => {
  assert.equal(parseOspfProcess("0").ok, false);
  assert.equal(parseOspfProcess("65536").ok, false);
  assert.equal(parseOspfProcess("x").ok, false);
  assert.ok(parseOspfProcess("65535").ok);
  const a0 = parseOspfArea("0");
  assert.ok(a0.ok && a0.value === "0");
  const a1 = parseOspfArea("0.0.0.1");
  assert.ok(a1.ok && a1.value === "0.0.0.1");
  assert.ok(parseOspfArea("4294967295").ok);
  assert.equal(parseOspfArea("4294967296").ok, false);
  assert.equal(parseOspfArea("01").ok, false);
  assert.equal(parseOspfArea("").ok, false);
  assert.equal(parseOspfArea("backbone").ok, false);
  assert.equal(
    ospfLines(1, "0", ip("192.0.2.1"), ip("0.0.0.255")),
    "router ospf 1\n network 192.0.2.0 0.0.0.255 area 0",
  );
  assert.equal(ospfLines(10, "0.0.0.1", ip("192.0.2.1"), 0), "router ospf 10\n network 192.0.2.1 0.0.0.0 area 0.0.0.1");
});

t("exhaustive cross-check against a naive per-bit matcher", () => {
  let seed = 12345;
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed;
  };
  for (let i = 0; i < 20000; i += 1) {
    const r = rand();
    const w = rand() & rand();
    const x = (i % 3 === 0 ? ((r & ~w) | (rand() & w)) >>> 0 : rand()) >>> 0;
    let naive = true;
    for (let b = 0; b < 32; b += 1) {
      const wb = Math.floor((w >>> 0) / 2 ** b) % 2;
      if (wb === 0 && Math.floor(r / 2 ** b) % 2 !== Math.floor(x / 2 ** b) % 2) naive = false;
    }
    assert.equal(matches(r, w >>> 0, x), naive);
    assert.equal(matchCount(w >>> 0), 2 ** popcount(w >>> 0));
  }
});


/* ===================== independent verifier cases ===================== */

t("verifier: prefix to mask to wildcard reference table", () => {
  // Derived by hand: wildcard octet = 255 - mask octet.
  const table: [number, string, string][] = [
    [0, "0.0.0.0", "255.255.255.255"],
    [1, "128.0.0.0", "127.255.255.255"],
    [9, "255.128.0.0", "0.127.255.255"],
    [19, "255.255.224.0", "0.0.31.255"],
    [20, "255.255.240.0", "0.0.15.255"],
    [27, "255.255.255.224", "0.0.0.31"],
    [30, "255.255.255.252", "0.0.0.3"],
    [31, "255.255.255.254", "0.0.0.1"],
    [32, "255.255.255.255", "0.0.0.0"],
  ];
  for (const [p, mask, wild] of table) {
    assert.equal(ipToString(prefixToMask(p)), mask, `mask /${p}`);
    assert.equal(ipToString(invert(prefixToMask(p))), wild, `wildcard /${p}`);
    const m = parseMaskOrPrefix(mask);
    assert.ok(m.ok && m.value.prefix === p, `parse mask ${mask}`);
    const pr = parseMaskOrPrefix(`/${p}`);
    assert.ok(pr.ok && pr.value.mask === prefixToMask(p), `parse /${p}`);
    assert.equal(wildcardToPrefix(ip(wild)), p, `wildcard ${wild} -> /${p}`);
  }
});

t("verifier: Cisco documentation style examples", () => {
  // 172.16.0.0 0.0.255.255 covers 172.16.0.0/16.
  assert.ok(matches(ip("172.16.0.0"), ip("0.0.255.255"), ip("172.16.200.9")));
  assert.ok(!matches(ip("172.16.0.0"), ip("0.0.255.255"), ip("172.17.0.0")));
  assert.equal(matchCount(ip("0.0.255.255")), 65536);
  // 192.168.32.0 through 192.168.47.0 summarized as 192.168.32.0 0.0.15.255.
  const w = ip("0.0.15.255");
  assert.ok(matches(ip("192.168.32.0"), w, ip("192.168.32.0")));
  assert.ok(matches(ip("192.168.32.0"), w, ip("192.168.47.255")));
  assert.ok(!matches(ip("192.168.32.0"), w, ip("192.168.48.0")));
  assert.ok(!matches(ip("192.168.32.0"), w, ip("192.168.31.255")));
  // Odd third octets: 192.168.1.0 0.0.254.255.
  for (const third of [1, 3, 5, 255]) assert.ok(matches(ip("192.168.1.0"), ip("0.0.254.255"), ip(`192.168.${third}.9`)));
  for (const third of [0, 2, 254]) assert.ok(!matches(ip("192.168.1.0"), ip("0.0.254.255"), ip(`192.168.${third}.9`)));
  // Odd hosts only: 10.1.1.1 0.0.0.254 -> 128 single addresses.
  const odd = matchingBlocks(ip("10.1.1.1"), ip("0.0.0.254"), 1000);
  assert.equal(odd.total, 128);
  assert.equal(odd.blockSize, 1);
  assert.equal(odd.blockPrefix, 32);
  assert.equal(ipToString(odd.blocks[0].base), "10.1.1.1");
  assert.equal(ipToString(odd.blocks[1].base), "10.1.1.3");
  assert.equal(ipToString(odd.blocks[127].base), "10.1.1.255");
});

t("verifier: matchingBlocks equals brute force enumeration", () => {
  let seed = 4242;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let iter = 0; iter < 400; iter += 1) {
    // A wildcard with at most 12 one bits, scattered.
    let w = 0;
    const k = rand() % 13;
    for (let j = 0; j < k; j += 1) w = (w | (2 ** (rand() % 32))) >>> 0;
    if (iter % 5 === 0) w = (w | (2 ** (rand() % 9) - 1)) >>> 0; // some trailing run
    const r = rand();
    const res = matchingBlocks(r, w, 1 << 13);
    // brute force: every combination of the 1 bits
    const bits: number[] = [];
    for (let b = 0; b < 32; b += 1) if (Math.floor(w / 2 ** b) % 2 === 1) bits.push(b);
    const base = normalize(r, w);
    const all: number[] = [];
    for (let c = 0; c < 2 ** bits.length; c += 1) {
      let v = base;
      for (let j = 0; j < bits.length; j += 1) if (Math.floor(c / 2 ** j) % 2 === 1) v += 2 ** bits[j];
      all.push(v);
    }
    all.sort((a, b) => a - b);
    // Expand blocks into addresses and compare.
    const expanded: number[] = [];
    for (const blk of res.blocks) for (let o = 0; o < res.blockSize; o += 1) expanded.push(blk.base + o);
    assert.equal(res.total * res.blockSize, 2 ** bits.length);
    assert.deepEqual(expanded, all);
    for (const v of all) assert.ok(matches(r, w, v));
    assert.equal(lowestMatch(r, w), all[0]);
    assert.equal(highestMatch(r, w), all[all.length - 1]);
  }
});

t("verifier: malformed input never throws and is rejected", () => {
  const bad = [
    "",
    "   ",
    "1.2.3",
    "1.2.3.4.5",
    "1.2.3.256",
    "01.2.3.4",
    "1.2.3.-4",
    "-1.2.3.4",
    "+1.2.3.4",
    "0x10.0.0.1",
    "1e2.0.0.1",
    "1..3.4",
    "1.2.3.4/24",
    "１.２.３.４",
    "١.2.3.4",
    "1.2.3.4\u0000",
    "9".repeat(100000),
    "1.".repeat(50000) + "1",
    "99999999999999999999.0.0.0",
    "😀",
  ];
  for (const b of bad) {
    const r = parseIpv4(b);
    assert.equal(r.ok, false, JSON.stringify(b.slice(0, 20)));
    assert.equal(parseWildcard(b).ok, false);
    const m = parseMaskOrPrefix(b);
    assert.equal(m.ok, false, `mask ${JSON.stringify(b.slice(0, 20))}`);
  }
  assert.ok(parseIpv4("  10.0.0.1  ").ok);
  for (const b of ["/33", "33", "-1", "/-1", "/", "255.255.0.255", "0.0.0.255", "255.0.255.0", "/24.5", "1e1", "100"]) {
    assert.equal(parseMaskOrPrefix(b).ok, false, b);
  }
  const wildAsMask = parseMaskOrPrefix("0.0.0.255");
  assert.ok(!wildAsMask.ok && /wildcard/.test(wildAsMask.error) && /255\.255\.255\.0/.test(wildAsMask.error));
  for (const b of ["24", "/24", "0"]) {
    const r = parseWildcard(b);
    assert.equal(r.ok, false, b);
  }
});

t("verifier: ACL numbering boundaries and line formats", () => {
  const ok: [string, string][] = [
    ["1", "standard"], ["99", "standard"], ["1300", "standard"], ["1999", "standard"],
    ["100", "extended"], ["199", "extended"], ["2000", "extended"], ["2699", "extended"],
  ];
  for (const [num, kind] of ok) {
    const r = parseAclNumber(num);
    assert.ok(r.ok && r.value.kind === kind, num);
  }
  for (const num of ["0", "200", "1299", "2700", "9999", "-1", "", "abc", "10.5", "12345"]) {
    assert.equal(parseAclNumber(num).ok, false, num);
  }
  assert.deepEqual(aclLines(10, "standard", "permit", ip("192.0.2.77"), ip("0.0.0.255")), {
    explicit: "access-list 10 permit 192.0.2.0 0.0.0.255",
    shorthand: null,
  });
  assert.deepEqual(aclLines(110, "extended", "deny", ip("10.0.1.0"), ip("0.0.254.255")), {
    explicit: "access-list 110 deny ip 10.0.1.0 0.0.254.255 any",
    shorthand: null,
  });
  assert.deepEqual(aclLines(1, "standard", "permit", ip("198.51.100.4"), 0), {
    explicit: "access-list 1 permit 198.51.100.4 0.0.0.0",
    shorthand: "access-list 1 permit host 198.51.100.4",
  });
  assert.deepEqual(aclLines(2000, "extended", "permit", ip("8.8.8.8"), 0xffffffff), {
    explicit: "access-list 2000 permit ip 0.0.0.0 255.255.255.255 any",
    shorthand: "access-list 2000 permit ip any any",
  });
});

t("verifier: OSPF process and area validation", () => {
  for (const okv of ["1", "65535", " 42 "]) assert.ok(parseOspfProcess(okv).ok, okv);
  for (const bad of ["0", "65536", "-1", "", "1.0", "99999"]) assert.equal(parseOspfProcess(bad).ok, false, bad);
  const areas: [string, string][] = [["0", "0"], ["4294967295", "4294967295"], ["0.0.0.0", "0.0.0.0"], ["10.1.2.3", "10.1.2.3"], [" 51 ", "51"]];
  for (const [inp, out] of areas) {
    const r = parseOspfArea(inp);
    assert.ok(r.ok && r.value === out, inp);
  }
  for (const bad of ["4294967296", "00", "01", "-1", "1.2.3", "99999999999", "0.0.0.256"]) {
    assert.equal(parseOspfArea(bad).ok, false, bad);
  }
});

t("verifier: subnet-mask-shaped wildcard caution", () => {
  assert.equal(looksLikeSubnetMask(ip("255.255.255.0")), true);
  assert.equal(looksLikeSubnetMask(ip("128.0.0.0")), true);
  assert.equal(looksLikeSubnetMask(ip("255.255.255.254")), true);
  assert.equal(looksLikeSubnetMask(0), false);
  assert.equal(looksLikeSubnetMask(0xffffffff), false);
  assert.equal(looksLikeSubnetMask(ip("0.0.0.255")), false);
  assert.equal(looksLikeSubnetMask(ip("0.0.254.255")), false);
  // A subnet mask used as a wildcard matches every address ending in .0.
  assert.ok(matches(ip("192.0.2.0"), ip("255.255.255.0"), ip("198.51.100.0")));
  assert.ok(!matches(ip("192.0.2.0"), ip("255.255.255.0"), ip("192.0.2.1")));
  assert.equal(matchCount(ip("255.255.255.0")), 2 ** 24);
});

console.log(`wildcard-mask-calculator: ${n} test groups passed`);
