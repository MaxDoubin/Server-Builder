import assert from "node:assert/strict";
import {
  aggregate,
  alignmentBits,
  alignmentSegments,
  binaryOctets,
  commonPrefixLength,
  formatCidr,
  formatIpv4,
  maskOf,
  mergeRanges,
  parseIpv4,
  parsePrefix,
  parsePrefixList,
  rangeToCidrs,
  redundantPrefixes,
  summarize,
  MAX_PREFIXES,
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

t("parse ipv4", () => {
  assert.equal(parseIpv4("0.0.0.0"), 0);
  assert.equal(parseIpv4("255.255.255.255"), 4294967295);
  assert.equal(parseIpv4("192.168.0.1"), 3232235521);
  assert.equal(parseIpv4("10.01.0.0"), null);
  assert.equal(parseIpv4("256.0.0.0"), null);
  assert.equal(parseIpv4("1.2.3"), null);
  assert.equal(formatIpv4(4294967295), "255.255.255.255");
  assert.equal(formatIpv4(3232235521), "192.168.0.1");
});

t("masks", () => {
  assert.equal(maskOf(0), 0);
  assert.equal(maskOf(32), 0xffffffff);
  assert.equal(maskOf(24), 0xffffff00);
  assert.equal(maskOf(1), 0x80000000);
});

t("common prefix", () => {
  assert.equal(commonPrefixLength(0, 0), 32);
  assert.equal(commonPrefixLength(0, 0xffffffff), 0);
  assert.equal(commonPrefixLength(0x80000000, 0x7fffffff), 0);
  assert.equal(commonPrefixLength(parseIpv4("10.1.0.0")!, parseIpv4("10.1.3.255")!), 22);
});

t("alignment", () => {
  assert.equal(alignmentBits(0), 32);
  assert.equal(alignmentBits(1), 0);
  assert.equal(alignmentBits(0x80000000), 31);
  assert.equal(alignmentBits(parseIpv4("10.1.2.0")!), 9);
});

t("parse prefix forms", () => {
  const a = parsePrefix("10.0.0.5/24");
  assert.ok(a.ok && a.hostBitsCleared && formatCidr(a.cidr) === "10.0.0.0/24");
  const b = parsePrefix("10.0.0.0/255.255.252.0");
  assert.ok(b.ok && b.cidr.length === 22);
  const c = parsePrefix("10.0.0.0/255.0.255.0");
  assert.ok(!c.ok && /unbroken/.test(c.message));
  const d = parsePrefix("10.0.0.0/33");
  assert.ok(!d.ok && /\/33/.test(d.message));
  const e = parsePrefix("10.0.0.0/");
  assert.ok(!e.ok);
  const f = parsePrefix("10.0.0.1");
  assert.ok(f.ok && f.cidr.length === 32 && !f.hostBitsCleared);
  const g = parsePrefix("010.0.0.0/8");
  assert.ok(!g.ok && /leading zero/.test(g.message));
  const h = parsePrefix("0.0.0.0/0");
  assert.ok(h.ok && h.cidr.network === 0 && h.cidr.length === 0);
  const i = parsePrefix("255.255.255.255/32");
  assert.ok(i.ok && i.cidr.network === 4294967295);
});

t("list parsing, comments, separators, problems", () => {
  const r = parsePrefixList("10.0.0.0/24, 10.0.1.0/24 # two\n\nbogus;10.0.2.0/24\r\n");
  assert.equal(r.prefixes.length, 3);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].line, 3);
  assert.equal(parsePrefixList("").prefixes.length, 0);
});

t("caps", () => {
  const many = Array.from({ length: MAX_PREFIXES + 5 }, (_, i) => `10.0.${Math.floor(i / 256) % 256}.${i % 256}`).join("\n");
  const r = parsePrefixList(many);
  assert.equal(r.truncated, true);
  assert.equal(r.prefixes.length, MAX_PREFIXES);
  assert.equal(parsePrefixList("x".repeat(200_001)).tooLong, true);
});

t("exact aggregation, textbook four /24s", () => {
  assert.deepEqual(agg("10.1.0.0/24 10.1.1.0/24 10.1.2.0/24 10.1.3.0/24"), ["10.1.0.0/22"]);
});

t("adjacent but misaligned /24s do not merge", () => {
  assert.deepEqual(agg("10.1.1.0/24 10.1.2.0/24"), ["10.1.1.0/24", "10.1.2.0/24"]);
});

t("three of four /24s", () => {
  assert.deepEqual(agg("192.168.0.0/24 192.168.1.0/24 192.168.2.0/24"), ["192.168.0.0/23", "192.168.2.0/24"]);
});

t("overlap and duplicates collapse", () => {
  assert.deepEqual(agg("10.0.0.0/8 10.1.0.0/16 10.0.0.0/8 10.255.255.255"), ["10.0.0.0/8"]);
});

t("whole space", () => {
  assert.deepEqual(agg("0.0.0.0/1 128.0.0.0/1"), ["0.0.0.0/0"]);
  assert.deepEqual(agg("0.0.0.0/0"), ["0.0.0.0/0"]);
});

t("range to cidrs", () => {
  // 10.0.0.1 - 10.0.0.6: .1/32 .2/31 .4/31 .6/32
  assert.deepEqual(
    rangeToCidrs(parseIpv4("10.0.0.1")!, parseIpv4("10.0.0.6")!).map(formatCidr),
    ["10.0.0.1/32", "10.0.0.2/31", "10.0.0.4/31", "10.0.0.6/32"],
  );
  // The worst case: 0.0.0.1 to 255.255.255.254 takes 62 blocks.
  assert.equal(rangeToCidrs(1, 4294967294).length, 62);
  assert.deepEqual(rangeToCidrs(4294967295, 4294967295).map(formatCidr), ["255.255.255.255/32"]);
});

t("merge ranges touching", () => {
  assert.deepEqual(mergeRanges([{ start: 5, end: 9 }, { start: 0, end: 4 }, { start: 11, end: 12 }]), [
    { start: 0, end: 9 },
    { start: 11, end: 12 },
  ]);
});

t("summary exact", () => {
  const s = summarize(list("10.1.0.0/24 10.1.1.0/24 10.1.2.0/24 10.1.3.0/24"))!;
  assert.equal(formatCidr(s), "10.1.0.0/22");
  assert.equal(s.extra, 0);
  assert.equal(s.covered, 1024);
  assert.equal(s.gapCidrs.length, 0);
});

t("summary over-claims for misaligned pair", () => {
  const s = summarize(list("10.1.1.0/24 10.1.2.0/24"))!;
  assert.equal(formatCidr(s), "10.1.0.0/22");
  assert.equal(s.size, 1024);
  assert.equal(s.covered, 512);
  assert.equal(s.extra, 512);
  assert.deepEqual(s.gapCidrs.map(formatCidr), ["10.1.0.0/24", "10.1.3.0/24"]);
});

t("summary with interior gap", () => {
  const s = summarize(list("172.16.0.0/24 172.16.3.0/24"))!;
  assert.equal(formatCidr(s), "172.16.0.0/22");
  assert.equal(s.extra, 512);
  assert.deepEqual(s.gapCidrs.map(formatCidr), ["172.16.1.0/24", "172.16.2.0/24"]);
});

t("summary across the top bit", () => {
  const s = summarize(list("127.255.255.255 128.0.0.0"))!;
  assert.equal(formatCidr(s), "0.0.0.0/0");
  assert.equal(s.covered, 2);
  assert.equal(s.extra, 4294967294);
  assert.equal(s.gapCidrTotal, 62);
  assert.ok(s.gapCidrs.length <= MAX_GAP_PREFIXES);
});

t("summary single host", () => {
  const s = summarize(list("192.0.2.7"))!;
  assert.equal(formatCidr(s), "192.0.2.7/32");
  assert.equal(s.extra, 0);
  assert.equal(summarize([]), null);
});

t("gap cidr cap", () => {
  // Every other /32 in a /20: 2048 gaps, listed up to the cap.
  const hosts = Array.from({ length: 2048 }, (_, i) => formatIpv4(parseIpv4("10.0.0.0")! + i * 2)).join(" ");
  const s = summarize(list(hosts))!;
  assert.equal(formatCidr(s), "10.0.0.0/20");
  assert.equal(s.gapCidrTotal, 2048);
  assert.equal(s.gapCidrs.length, MAX_GAP_PREFIXES);
});

t("redundant", () => {
  const r = redundantPrefixes(list("10.0.0.0/8 10.1.0.0/16 10.0.0.0/8 192.168.0.0/24"));
  assert.deepEqual(r.map(formatCidr).sort(), ["10.0.0.0/8", "10.1.0.0/16"]);
});

t("binary", () => {
  assert.equal(binaryOctets(parseIpv4("10.1.2.0")!), "00001010.00000001.00000010.00000000");
  const segs = alignmentSegments(parseIpv4("10.1.2.0")!, 22, 24);
  assert.equal(segs.map((s) => s.text).join(""), "00001010.00000001.00000010.00000000");
  assert.deepEqual(segs.map((s) => s.kind), ["common", "network", "host"]);
  assert.equal(segs[0].text, "00001010.00000001.000000");
  assert.equal(segs[1].text, "10.");
  assert.equal(segs[2].text, "00000000");
  const all = alignmentSegments(0, 32, 32);
  assert.equal(all.length, 1);
  const none = alignmentSegments(0, 0, 0);
  assert.equal(none.length, 1);
  assert.equal(none[0].kind, "host");
});

console.log(`route-summarizer: ${n} tests passed`);

// Independent verifier cases (run as part of this file).
import "./route-summarizer.verify.test.ts";
