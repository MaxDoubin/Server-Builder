import assert from "node:assert/strict";
import {
  MAX_AGGREGATED,
  MAX_ENTRIES,
  MAX_LIST_CHARS,
  blockToString,
  mergeRanges,
  parseCidr,
  parseCidrList,
  parseIpv4,
  rangeToCidrs,
  summarizeMerge,
  trailingZeros,
  ipToString,
} from "../../client/src/lib/toolkit/ip-range-to-cidr.ts";

const ip = (s: string): number => {
  const p = parseIpv4(s);
  if (!p.ok) throw new Error(`bad ip ${s}`);
  return p.value;
};
const cidrs = (a: string, b: string) => rangeToCidrs(ip(a), ip(b)).map(blockToString);

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n += 1;
};

t("trailing zeros", () => {
  assert.equal(trailingZeros(0), 32);
  assert.equal(trailingZeros(1), 0);
  assert.equal(trailingZeros(0x80000000), 31);
  assert.equal(trailingZeros(0xc0000000), 30);
  assert.equal(trailingZeros(0xffffffff), 0);
  assert.equal(trailingZeros(256), 8);
});

t("range to cidr, reference cases", () => {
  // Hand computed: 10-11, 12-15, 16-31, 32-63, 64-95, 96-99, 100.
  assert.deepEqual(cidrs("192.0.2.10", "192.0.2.100"), [
    "192.0.2.10/31",
    "192.0.2.12/30",
    "192.0.2.16/28",
    "192.0.2.32/27",
    "192.0.2.64/27",
    "192.0.2.96/30",
    "192.0.2.100/32",
  ]);
  assert.deepEqual(cidrs("10.0.0.0", "10.255.255.255"), ["10.0.0.0/8"]);
  assert.deepEqual(cidrs("0.0.0.0", "255.255.255.255"), ["0.0.0.0/0"]);
  assert.deepEqual(cidrs("255.255.255.255", "255.255.255.255"), ["255.255.255.255/32"]);
  assert.deepEqual(cidrs("0.0.0.0", "0.0.0.0"), ["0.0.0.0/32"]);
  assert.deepEqual(cidrs("128.0.0.0", "255.255.255.255"), ["128.0.0.0/1"]);
  assert.deepEqual(cidrs("0.0.0.0", "127.255.255.255"), ["0.0.0.0/1"]);
  assert.deepEqual(cidrs("127.255.255.255", "128.0.0.0"), ["127.255.255.255/32", "128.0.0.0/32"]);
  // Matches Python ipaddress.summarize_address_range output.
  assert.deepEqual(cidrs("192.0.2.0", "192.0.2.130"), ["192.0.2.0/25", "192.0.2.128/31", "192.0.2.130/32"]);
  assert.deepEqual(cidrs("10.0.0.1", "10.0.0.6"), ["10.0.0.1/32", "10.0.0.2/31", "10.0.0.4/31", "10.0.0.6/32"]);
  assert.deepEqual(cidrs("172.16.0.0", "172.31.255.255"), ["172.16.0.0/12"]);
  assert.deepEqual(rangeToCidrs(ip("10.0.0.5"), ip("10.0.0.4")), []);
});

t("worst case is 62 blocks", () => {
  const blocks = rangeToCidrs(1, 0xfffffffe);
  assert.equal(blocks.length, 62);
  assert.equal(blocks.reduce((s, b) => s + b.size, 0), 0xfffffffe);
  assert.equal(blockToString(blocks[0]), "0.0.0.1/32");
  assert.equal(blockToString(blocks[61]), "255.255.255.254/32");
  assert.equal(blockToString(blocks[30]), "64.0.0.0/2");
  assert.equal(blockToString(blocks[31]), "128.0.0.0/2");
});

t("cover is exact, aligned, and minimal on random ranges", () => {
  let seed = 99;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let i = 0; i < 5000; i += 1) {
    let a = rand();
    let b = i % 4 === 0 ? (a + (rand() % 5000)) >>> 0 : rand();
    if (a > b) [a, b] = [b, a];
    const blocks = rangeToCidrs(a, b);
    assert.ok(blocks.length >= 1 && blocks.length <= 62);
    let cur = a;
    for (const blk of blocks) {
      assert.equal(blk.network, cur, "contiguous");
      assert.equal(blk.network % blk.size, 0, "aligned");
      assert.equal(blk.size, 2 ** (32 - blk.prefix));
      assert.equal(blk.last, blk.first + blk.size - 1);
      cur = blk.last + 1;
    }
    assert.equal(cur, b + 1, "exact end");
    // Minimality: no two neighbors could be joined into one aligned block.
    for (let k = 1; k < blocks.length; k += 1) {
      const x = blocks[k - 1];
      const y = blocks[k];
      const joinable = x.size === y.size && x.network % (2 * x.size) === 0;
      assert.ok(!joinable, "two equal sibling blocks would mean the greedy step was not greedy");
    }
  }
});

t("parse cidr", () => {
  const a = parseCidr("192.0.2.5/24");
  assert.ok(a.ok && a.value.hostBitsSet && ipToString(a.value.range.start) === "192.0.2.0" && ipToString(a.value.range.end) === "192.0.2.255");
  const b = parseCidr("10.0.0.0/8");
  assert.ok(b.ok && !b.value.hostBitsSet && b.value.range.end === ip("10.255.255.255"));
  const c = parseCidr("203.0.113.7");
  assert.ok(c.ok && c.value.prefix === 32 && c.value.range.start === c.value.range.end);
  const d = parseCidr("1.2.3.4/0");
  assert.ok(d.ok && d.value.range.start === 0 && d.value.range.end === 0xffffffff);
  const e = parseCidr("255.255.255.255/32");
  assert.ok(e.ok && e.value.range.start === 0xffffffff && e.value.range.end === 0xffffffff);
  for (const bad of ["1.2.3.4/33", "1.2.3.4/", "1.2.3.4/x", "1.2.3/24", "300.1.1.1/8", "1.2.3.4/024"]) {
    assert.equal(parseCidr(bad).ok, false, bad);
  }
});

t("merge ranges", () => {
  const r = (a: string, b: string) => ({ start: ip(a), end: ip(b) });
  const merged = mergeRanges([
    r("10.0.2.0", "10.0.3.255"),
    r("10.0.0.0", "10.0.0.255"),
    r("10.0.1.0", "10.0.1.255"), // adjacent
    r("10.0.3.128", "10.0.3.255"), // nested
    r("192.0.2.0", "192.0.2.127"),
    r("192.0.2.129", "192.0.2.200"), // gap of one address, not merged
  ]);
  assert.deepEqual(
    merged.map((m) => `${ipToString(m.start)}-${ipToString(m.end)}`),
    ["10.0.0.0-10.0.3.255", "192.0.2.0-192.0.2.127", "192.0.2.129-192.0.2.200"],
  );
  // Ending at the very top must not wrap to 0 when computing end + 1.
  const top = mergeRanges([r("255.255.255.0", "255.255.255.255"), r("0.0.0.0", "0.0.0.255")]);
  assert.equal(top.length, 2);
  const whole = mergeRanges([r("128.0.0.0", "255.255.255.255"), r("0.0.0.0", "127.255.255.255")]);
  assert.deepEqual(whole, [{ start: 0, end: 0xffffffff }]);
  assert.deepEqual(mergeRanges([]), []);
});

t("parse list and summarize", () => {
  const text = [
    "# comment line",
    "10.0.0.0/24",
    "10.0.1.0/24, 10.0.2.0/23 ; 10.0.3.128/25",
    "192.0.2.0/25   192.0.2.128/25  # trailing comment",
    "198.51.100.7",
    "",
    "203.0.113.5/24",
    "not-an-address",
    "10.0.0.1/33",
    "198.51.100.20 - 198.51.100.30",
    "198.51.100.40-198.51.100.35",
  ].join("\n");
  const parsed = parseCidrList(text);
  assert.equal(parsed.entries.length, 9);
  assert.equal(parsed.errorCount, 3);
  assert.deepEqual(parsed.errors.map((e) => e.line), [8, 9, 11]);
  assert.equal(parsed.warningCount, 1);
  assert.equal(parsed.warnings[0].line, 7);
  assert.match(parsed.warnings[0].message, /203\.0\.113\.0\/24/);
  const s = summarizeMerge(parsed.entries);
  assert.deepEqual(
    s.merged.map((m) => `${ipToString(m.start)}-${ipToString(m.end)}`),
    [
      "10.0.0.0-10.0.3.255",
      "192.0.2.0-192.0.2.255",
      "198.51.100.7-198.51.100.7",
      "198.51.100.20-198.51.100.30",
      "203.0.113.0-203.0.113.255",
    ],
  );
  assert.deepEqual(s.aggregated.map(blockToString), [
    "10.0.0.0/22",
    "192.0.2.0/24",
    "198.51.100.7/32",
    "198.51.100.20/30",
    "198.51.100.24/30",
    "198.51.100.28/31",
    "198.51.100.30/32",
    "203.0.113.0/24",
  ]);
  assert.equal(s.uniqueAddresses, 1024 + 256 + 1 + 11 + 256);
  // inputs: 256+256+512+128+128+128+1+256+11 = 1676
  assert.equal(s.inputAddresses, 1676);
});

t("adjacent but unaligned stays two blocks", () => {
  const s = summarizeMerge(parseCidrList("10.0.1.0/24\n10.0.2.0/24").entries);
  assert.equal(s.merged.length, 1);
  assert.deepEqual(s.aggregated.map(blockToString), ["10.0.1.0/24", "10.0.2.0/24"]);
});

t("caps", () => {
  const huge = parseCidrList("1".repeat(MAX_LIST_CHARS + 1));
  assert.equal(huge.entries.length, 0);
  assert.equal(huge.errorCount, 1);
  const many = Array.from({ length: MAX_ENTRIES + 10 }, (_, i) => ipToString(i * 4) + "/30").join("\n");
  assert.ok(many.length <= MAX_LIST_CHARS);
  const p = parseCidrList(many);
  assert.equal(p.entries.length, MAX_ENTRIES);
  assert.ok(p.truncated);
  const s = summarizeMerge(p.entries);
  assert.equal(s.merged.length, 1);
  assert.equal(s.uniqueAddresses, MAX_ENTRIES * 4);
  const lotsOfErrors = parseCidrList(Array.from({ length: 100 }, () => "junk").join("\n"));
  assert.equal(lotsOfErrors.errorCount, 100);
  assert.equal(lotsOfErrors.errors.length, 20);
  assert.equal(parseCidrList("").entries.length, 0);
  assert.equal(parseCidrList("\n\n  \n# only comments").errorCount, 0);
});


/* ===================== independent verifier cases ===================== */

t("verifier: hand-derived range covers", () => {
  // RFC 4632 3.1: a block is 2^n addresses starting on a multiple of 2^n.
  assert.deepEqual(cidrs("198.51.100.0", "198.51.103.255"), ["198.51.100.0/22"]);
  // Odd start cannot pair with its neighbor.
  assert.deepEqual(cidrs("1.1.1.1", "1.1.1.2"), ["1.1.1.1/32", "1.1.1.2/32"]);
  // Adjacent /24s that do not share a /23.
  assert.deepEqual(cidrs("192.168.1.0", "192.168.2.255"), ["192.168.1.0/24", "192.168.2.0/24"]);
  // 0.0.0.0 to 255.255.255.254 is /1, /2, ..., /32: 32 blocks.
  const low = rangeToCidrs(0, 0xfffffffe);
  assert.equal(low.length, 32);
  assert.deepEqual(low.map((b) => b.prefix), Array.from({ length: 32 }, (_, i) => i + 1));
  assert.equal(blockToString(low[0]), "0.0.0.0/1");
  assert.equal(blockToString(low[31]), "255.255.255.254/32");
  // 0.0.0.1 to 255.255.255.255 is /32, /31, ..., /1: 32 blocks.
  const high = rangeToCidrs(1, 0xffffffff);
  assert.equal(high.length, 32);
  assert.equal(blockToString(high[0]), "0.0.0.1/32");
  assert.equal(blockToString(high[31]), "128.0.0.0/1");
  assert.equal(high.reduce((a, b) => a + b.size, 0), 0xffffffff);
  // A full /0 has exactly 2^32 addresses.
  assert.equal(rangeToCidrs(0, 0xffffffff)[0].size, 4294967296);
  // Crossing the 127/128 boundary.
  assert.deepEqual(cidrs("127.255.255.254", "128.0.0.1"), ["127.255.255.254/31", "128.0.0.0/31"]);
});

t("verifier: greedy cover is optimal against dynamic programming", () => {
  // Minimum number of aligned power-of-two blocks partitioning [a, b], by DP.
  const optimal = (a: number, b: number): number => {
    const best = new Array<number>(b + 2).fill(Infinity);
    best[b + 1] = 0;
    for (let x = b; x >= a; x -= 1) {
      for (let k = 0; k <= 9; k += 1) {
        const size = 2 ** k;
        if (x % size !== 0 || x + size - 1 > b) continue;
        best[x] = Math.min(best[x], 1 + best[x + size]);
      }
    }
    return best[a];
  };
  for (let a = 0; a < 300; a += 7) {
    for (let b = a; b < 300; b += 5) {
      assert.equal(rangeToCidrs(a, b).length, optimal(a, b), `${a}-${b}`);
    }
  }
});

t("verifier: merge edge cases", () => {
  const r = (a: string, b: string) => ({ start: ip(a), end: ip(b) });
  const show = (x: { start: number; end: number }[]) => x.map((m) => `${ipToString(m.start)}-${ipToString(m.end)}`);
  // Partial overlap (possible with ranges), duplicates, and a one-address gap.
  assert.deepEqual(
    show(mergeRanges([r("10.0.0.5", "10.0.0.20"), r("10.0.0.0", "10.0.0.10"), r("10.0.0.0", "10.0.0.10"), r("10.0.0.22", "10.0.0.30")])),
    ["10.0.0.0-10.0.0.20", "10.0.0.22-10.0.0.30"],
  );
  // Adjacent at the very top and very bottom of the address space.
  assert.deepEqual(show(mergeRanges([r("255.255.255.255", "255.255.255.255"), r("255.255.255.254", "255.255.255.254")])), [
    "255.255.255.254-255.255.255.255",
  ]);
  assert.deepEqual(show(mergeRanges([r("0.0.0.1", "0.0.0.1"), r("0.0.0.0", "0.0.0.0")])), ["0.0.0.0-0.0.0.1"]);
  // A contained range does not shrink the outer one.
  assert.deepEqual(show(mergeRanges([r("10.0.0.0", "10.255.255.255"), r("10.1.0.0", "10.1.0.255")])), ["10.0.0.0-10.255.255.255"]);
  // Python: collapse_addresses([192.0.2.0/25, 192.0.2.128/25]) == [192.0.2.0/24]
  assert.deepEqual(summarizeMerge(parseCidrList("192.0.2.0/25 192.0.2.128/25").entries).aggregated.map(blockToString), ["192.0.2.0/24"]);
  // Python: collapse of 192.0.2.0/26, 192.0.2.64/26, 192.0.2.128/25 is one /24.
  assert.deepEqual(
    summarizeMerge(parseCidrList("192.0.2.128/25,192.0.2.64/26;192.0.2.0/26").entries).aggregated.map(blockToString),
    ["192.0.2.0/24"],
  );
  // Overlapping /0s: counts stay exact well past 2^32.
  const zeros = summarizeMerge(parseCidrList("0.0.0.0/0\n0.0.0.0/0\n0.0.0.0/0").entries);
  assert.equal(zeros.inputAddresses, 3 * 4294967296);
  assert.equal(zeros.uniqueAddresses, 4294967296);
  assert.deepEqual(zeros.aggregated.map(blockToString), ["0.0.0.0/0"]);
});

t("verifier: list parsing of malformed and adversarial input", () => {
  const cases: [string, number, number][] = [
    // text, entries, errors
    ["/24", 0, 1],
    ["10.0.0.0/24/8", 0, 1],
    ["-", 0, 1],
    ["10.0.0.1 -", 0, 1],
    ["10.0.0.1 - 10.0.0.5 10.0.0.9", 0, 1],
    ["10.0.0.5 - 10.0.0.1", 0, 1],
    ["10.0.0.1-10.0.0.5", 1, 0],
    ["10.0.0.1 – 10.0.0.5", 1, 0],
    ["１０.0.0.0/8", 0, 1],
    ["10.0.0.0/8\r\n10.0.0.0/8\r192.0.2.1", 3, 0],
    ["😀 10.0.0.0/8", 1, 1],
    ["x".repeat(500000), 0, 1],
    ["10.0.0.0/ 8", 0, 2],
    ["::1", 0, 1],
    ["2001:db8::/32", 0, 1],
  ];
  for (const [text, entries, errors] of cases) {
    const p = parseCidrList(text);
    assert.equal(p.entries.length, entries, `entries for ${JSON.stringify(text.slice(0, 30))}`);
    assert.equal(p.errorCount, errors, `errors for ${JSON.stringify(text.slice(0, 30))}`);
  }
  const empty = parseCidr("/24");
  assert.ok(!empty.ok && /no address before the slash/.test(empty.error));
  const dashLine = parseCidrList("10.0.0.1 - 10.0.0.5 10.0.0.9");
  assert.match(dashLine.errors[0].message, /line of its own/);
  // Error text is clipped so a giant token cannot flood the page.
  const giant = parseCidrList("1".repeat(300000));
  assert.ok(giant.errors[0].text.length <= 48);
  assert.ok(giant.errors[0].message.length < 200);
});

t("verifier: aggregated cap counts past the limit", () => {
  // 200 disjoint ranges that each need many blocks, capped at 50.
  const lines: string[] = [];
  for (let i = 0; i < 200; i += 1) lines.push(`${ipToString(i * 65536 + 1)} - ${ipToString(i * 65536 + 65534)}`);
  const p = parseCidrList(lines.join("\n"));
  assert.equal(p.entries.length, 200);
  const full = summarizeMerge(p.entries);
  assert.equal(full.aggregatedTotal, 200 * 30);
  assert.equal(full.aggregated.length, 200 * 30);
  const capped = summarizeMerge(p.entries, 50);
  assert.equal(capped.aggregated.length, 50);
  assert.equal(capped.aggregatedTotal, 6000);
  assert.deepEqual(capped.aggregated.map(blockToString), full.aggregated.slice(0, 50).map(blockToString));
  assert.ok(MAX_AGGREGATED >= 100000);
});

console.log(`ip-range-to-cidr: ${n} test groups passed`);
