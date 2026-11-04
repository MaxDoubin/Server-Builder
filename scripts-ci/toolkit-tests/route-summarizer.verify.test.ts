/**
 * Independent verification cases for route-summarizer, added by the verifier.
 * Reference data comes from RFC 1519 / RFC 4632 worked examples, hand-derived
 * boundary values, and Python's ipaddress module (collapse_addresses and
 * summarize_address_range) run over 400 random lists (verify-rs-ip/refs.json).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aggregate,
  formatCidr,
  maskLength,
  parseIpv4,
  parsePrefix,
  parsePrefixList,
  rangeToCidrs,
  redundantPrefixes,
  summarize,
  wildcardLength,
  MAX_GAP_PREFIXES,
} from "../../client/src/lib/toolkit/route-summarizer.ts";

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

const list = (s: string) => parsePrefixList(s).prefixes;
const agg = (s: string) => aggregate(list(s)).map(formatCidr);
const sum = (s: string) => summarize(list(s))!;

t("RFC 1519 / RFC 4632: 192.24.0.0 through 192.31.255.255 is 192.24.0.0/13", () => {
  const eight = Array.from({ length: 8 }, (_, i) => `192.${24 + i}.0.0/16`).join("\n");
  assert.deepEqual(agg(eight), ["192.24.0.0/13"]);
  const s = sum(eight);
  assert.equal(formatCidr(s), "192.24.0.0/13");
  assert.equal(s.extra, 0);
  assert.equal(s.size, 524288);
  // The same block as 2048 /24s.
  const many = Array.from({ length: 2048 }, (_, i) => `192.${24 + Math.floor(i / 256)}.${i % 256}.0/24`).join("\n");
  assert.deepEqual(agg(many), ["192.24.0.0/13"]);
});

t("RFC 1918 172.16/12 from its first and last /16", () => {
  const s = sum("172.16.0.0/16 172.31.0.0/16");
  assert.equal(formatCidr(s), "172.16.0.0/12");
  assert.equal(s.extra, 14 * 65536);
  assert.deepEqual(s.gapCidrs.map(formatCidr), [
    "172.17.0.0/16",
    "172.18.0.0/15",
    "172.20.0.0/14",
    "172.24.0.0/14",
    "172.28.0.0/15",
    "172.30.0.0/16",
  ]);
});

t("disjoint private blocks only share /0", () => {
  const s = sum("10.0.0.0/8 192.168.0.0/16");
  assert.equal(formatCidr(s), "0.0.0.0/0");
  assert.equal(s.covered, 16777216 + 65536);
  assert.equal(s.extra, 4294967296 - 16777216 - 65536);
});

t("top of the address space", () => {
  assert.deepEqual(agg("255.255.255.254/31 255.255.255.255"), ["255.255.255.254/31"]);
  assert.deepEqual(agg("255.255.255.255/32 255.255.255.254/32"), ["255.255.255.254/31"]);
  assert.deepEqual(agg("128.0.0.0/1 0.0.0.0/1 10.0.0.0/8"), ["0.0.0.0/0"]);
  const s = sum("0.0.0.0/0 10.0.0.0/8");
  assert.equal(formatCidr(s), "0.0.0.0/0");
  assert.equal(s.extra, 0);
  assert.equal(s.size, 4294967296);
});

t("range splitting reference values", () => {
  const ip = (s: string) => parseIpv4(s)!;
  assert.deepEqual(rangeToCidrs(ip("10.0.0.0"), ip("10.0.0.255")).map(formatCidr), ["10.0.0.0/24"]);
  assert.deepEqual(rangeToCidrs(ip("192.168.1.10"), ip("192.168.1.20")).map(formatCidr), [
    "192.168.1.10/31",
    "192.168.1.12/30",
    "192.168.1.16/30",
    "192.168.1.20/32",
  ]);
  assert.deepEqual(rangeToCidrs(0, 4294967295).map(formatCidr), ["0.0.0.0/0"]);
  assert.deepEqual(rangeToCidrs(ip("127.255.255.255"), ip("128.0.0.0")).map(formatCidr), [
    "127.255.255.255/32",
    "128.0.0.0/32",
  ]);
});

t("netmask and wildcard helpers", () => {
  assert.equal(maskLength(parseIpv4("255.255.255.0")!), 24);
  assert.equal(maskLength(parseIpv4("255.255.248.0")!), 21);
  assert.equal(maskLength(0), 0);
  assert.equal(maskLength(4294967295), 32);
  assert.equal(maskLength(parseIpv4("255.0.255.0")!), -1);
  assert.equal(maskLength(parseIpv4("0.0.0.255")!), -1);
  assert.equal(wildcardLength(parseIpv4("0.0.0.255")!), 24);
  assert.equal(wildcardLength(parseIpv4("0.0.7.255")!), 21);
  assert.equal(wildcardLength(0), 32);
  assert.equal(wildcardLength(parseIpv4("0.0.255.0")!), -1);
});

t("router-config style address and mask pairs", () => {
  const a = parsePrefixList("10.1.0.0 255.255.255.0\n10.1.1.0 255.255.255.0");
  assert.equal(a.problems.length, 0);
  assert.deepEqual(a.prefixes.map(formatCidr), ["10.1.0.0/24", "10.1.1.0/24"]);
  assert.deepEqual(a.prefixes.map((p) => p.pairedMask), ["netmask", "netmask"]);
  assert.deepEqual(aggregate(a.prefixes).map(formatCidr), ["10.1.0.0/23"]);
  const w = parsePrefixList("network 10.1.0.0 0.0.0.255 area 0");
  assert.deepEqual(w.prefixes.map(formatCidr), ["10.1.0.0/24"]);
  assert.equal(w.prefixes[0].pairedMask, "wildcard");
  assert.deepEqual(w.problems.map((p) => p.text), ["network", "area", "0"]);
  const bad = parsePrefixList("10.1.0.0 255.0.255.0");
  assert.equal(bad.prefixes.length, 0);
  assert.equal(bad.problems.length, 1);
  assert.equal(bad.problems[0].text, "10.1.0.0 255.0.255.0");
  // Two host addresses that are not masks stay two entries.
  assert.deepEqual(list("127.255.255.255 128.0.0.0").map(formatCidr), ["127.255.255.255/32", "128.0.0.0/32"]);
  assert.deepEqual(list("10.0.0.1 10.0.0.2").map(formatCidr), ["10.0.0.1/32", "10.0.0.2/32"]);
  // A slash prefix followed by a mask-looking token is not paired.
  assert.deepEqual(list("10.0.0.0/24 255.255.255.0").map(formatCidr), ["10.0.0.0/24", "255.255.255.0/32"]);
  // Host bits are still cleared and reported in pair form.
  const h = parsePrefixList("10.1.2.3 255.255.0.0").prefixes[0];
  assert.equal(formatCidr(h), "10.1.0.0/16");
  assert.equal(h.hostBitsCleared, true);
});

t("wildcard mask after a slash gets a specific error", () => {
  const r = parsePrefix("10.0.0.0/0.0.0.255");
  assert.ok(!r.ok && /wildcard/.test(r.message) && /255\.255\.255\.0/.test(r.message) && /\/24/.test(r.message));
});

t("malformed tokens are reported, never thrown", () => {
  const bad = [
    "/24",
    "10.0.0.0/-1",
    "10.0.0.0/24/5",
    "1e3.0.0.0",
    "10.0.0.0/0x18",
    "１０.0.0.0/8",
    "10.0.0",
    "10.0.0.0.0",
    "10.0.0.0/033",
    "10.0.0.0/ 24",
    "::1",
    "2001:db8::/32",
    "-1.0.0.0",
    "10.0.0.256",
    "10.0.0.0/4294967296",
    "\u0000",
  ];
  for (const b of bad) {
    const r = parsePrefixList(b);
    assert.equal(r.prefixes.length === 0 || b === "10.0.0.0/ 24", true, b);
    assert.ok(r.problems.length >= 1, b);
  }
  // A huge single token is echoed back truncated.
  const huge = parsePrefixList("9".repeat(150_000));
  assert.equal(huge.problems.length, 1);
  assert.ok(huge.problems[0].text.length <= 63);
  // Whitespace only.
  const ws = parsePrefixList(" \n\t\r\n  ,;; ");
  assert.equal(ws.prefixes.length + ws.problems.length, 0);
  assert.equal(summarize([]), null);
  assert.deepEqual(aggregate([]), []);
});

t("redundant entries: nested, duplicate, and covered only by a larger one", () => {
  const r = redundantPrefixes(list("10.0.0.0/24 10.0.1.0/24 10.0.0.0/23 10.0.0.0/23"));
  assert.deepEqual(r.map(formatCidr).sort(), ["10.0.0.0/23", "10.0.0.0/24", "10.0.1.0/24"]);
});

t("gap list is capped but the total is exact", () => {
  // On one line this would be read as an address and a /31 netmask, so use two lines.
  assert.equal(formatCidr(list("0.0.0.1 255.255.255.254")[0]), "0.0.0.0/31");
  const s = sum("0.0.0.1\n255.255.255.254");
  assert.equal(formatCidr(s), "0.0.0.0/0");
  assert.deepEqual(s.gapCidrs.map(formatCidr), [
    "0.0.0.0/32",
    "0.0.0.2/31",
    "0.0.0.4/30",
    ...s.gapCidrs.slice(3).map(formatCidr),
  ]);
  // 0.0.0.0/32, then /31 up to /2 below 128.0.0.0 (30 blocks), /2 down to /31
  // above it (30 blocks), then 255.255.255.255/32.
  assert.equal(s.gapCidrTotal, 1 + 30 + 30 + 1);
  assert.equal(formatCidr(s.gapCidrs[30]), "64.0.0.0/2");
  assert.equal(formatCidr(s.gapCidrs[31]), "128.0.0.0/2");
  assert.ok(s.gapCidrs.length <= MAX_GAP_PREFIXES);
});

t("matches Python ipaddress on 400 random lists", () => {
  const refs = JSON.parse(
    readFileSync(
      "scripts-ci/toolkit-tests/verify-rs-ip/refs.json",
      "utf8",
    ),
  ) as {
    agg: { input: string[]; collapsed: string[]; summary: string; extra: number; covered: number; gaps: string[] }[];
  };
  let checked = 0;
  for (const c of refs.agg) {
    const parsed = parsePrefixList(c.input.join("\n"));
    assert.equal(parsed.problems.length, 0, c.input.join(" "));
    assert.deepEqual(aggregate(parsed.prefixes).map(formatCidr), c.collapsed, c.input.join(" "));
    const s = summarize(parsed.prefixes)!;
    assert.equal(formatCidr(s), c.summary, c.input.join(" "));
    assert.equal(s.extra, c.extra);
    assert.equal(s.covered, c.covered);
    assert.equal(s.gapCidrTotal, c.gaps.length);
    assert.deepEqual(s.gapCidrs.map(formatCidr), c.gaps.slice(0, MAX_GAP_PREFIXES));
    checked += 1;
  }
  assert.equal(checked, 400);
});

console.log(`route-summarizer verify: ${n} tests passed`);
