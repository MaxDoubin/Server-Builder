import assert from "node:assert/strict";
import {
  MAX_ENTRIES,
  MAX_INPUT_CHARS,
  MAX_PAIRS_LISTED,
  analyze,
  blockText,
  blocksHolding,
  formatCount,
  formatSize,
  parseBlock,
  parseBlocks,
  type Block,
} from "../../client/src/lib/toolkit/cidr-overlap-checker";
import { parseIp } from "../../client/src/lib/toolkit/ip-address-classifier";

let n = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    n += 1;
  } catch (e) {
    console.error("FAIL:", name);
    throw e;
  }
};

function blocks(text: string): Block[] {
  const r = parseBlocks(text);
  assert.equal(r.problemCount, 0, `unexpected problems: ${JSON.stringify(r.problems)}`);
  return r.blocks;
}
function bad(token: string): string {
  const r = parseBlock(token);
  assert.equal(r.ok, false, `${token} should be refused`);
  if (r.ok) throw new Error();
  return r.error;
}
function good(token: string) {
  const r = parseBlock(token);
  assert.equal(r.ok, true, `${token}: ${r.ok ? "" : r.error}`);
  if (!r.ok) throw new Error();
  return r.value;
}

/* ---- worked examples, computed by hand ---------------------------------- */

t("a /8 holds a /16 and counts its addresses", () => {
  const a = analyze(blocks("10.0.0.0/8\n10.1.0.0/16"));
  assert.equal(a.overlapPairs, 1);
  assert.equal(a.insidePairs, 1);
  assert.equal(a.identicalPairs, 0);
  assert.equal(blockText(a.overlaps[0].outer), "10.0.0.0/8");
  assert.equal(blockText(a.overlaps[0].inner), "10.1.0.0/16");
  assert.equal(a.overlaps[0].relation, "inside");
  assert.equal(a.overlaps[0].shared, 65536n);
  // The union is the /8 alone: 2^24 addresses, not 2^24 + 2^16.
  assert.equal(a.v4.covered, 16777216n);
  assert.equal(a.v4.blocks, 2);
  assert.equal(a.v4.distinct, 2);
});

t("RFC 1918 and the shared address space are all disjoint", () => {
  const a = analyze(blocks("10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10"));
  assert.equal(a.overlapPairs, 0);
  assert.equal(a.overlaps.length, 0);
  // 2^24 + 2^20 + 2^16 + 2^22
  assert.equal(a.v4.covered, 16777216n + 1048576n + 65536n + 4194304n);
});

t("172.16.0.0/12 ends at 172.31.255.255, so 172.32.0.0/16 is outside it", () => {
  const [b12] = blocks("172.16.0.0/12");
  assert.equal(b12.last, (172n << 24n) | (31n << 16n) | 0xffffn);
  assert.equal(analyze(blocks("172.16.0.0/12\n172.32.0.0/16")).overlapPairs, 0);
  assert.equal(analyze(blocks("172.16.0.0/12\n172.31.0.0/16")).overlapPairs, 1);
});

t("neighbors that touch do not overlap", () => {
  assert.equal(analyze(blocks("10.0.0.0/24\n10.0.1.0/24")).overlapPairs, 0);
  assert.equal(analyze(blocks("10.0.0.0/25\n10.0.0.128/25")).overlapPairs, 0);
  assert.equal(analyze(blocks("2001:db8::/33\n2001:db8:8000::/33")).overlapPairs, 0);
});

t("an address with bits past the prefix is read as its network", () => {
  const a = good("10.1.2.3/8");
  assert.equal(blockText(a), "10.0.0.0/8");
  assert.equal(a.hostBitsCleared, true);
  const b = good("192.168.1.130/25");
  assert.equal(blockText(b), "192.168.1.128/25");
  assert.equal(b.last, (192n << 24n) | (168n << 16n) | (1n << 8n) | 255n);
  assert.equal(good("10.0.0.0/8").hostBitsCleared, false);
  const r = parseBlocks("10.1.2.3/8");
  assert.equal(r.noteCount, 1);
  assert.match(r.notes[0].message, /read as 10\.0\.0\.0\/8/);
});

t("different spellings of one block are identical", () => {
  const a = analyze(blocks("10.0.0.0/24\n10.0.0.77/24\n10.0.0.0/24"));
  assert.equal(a.identicalPairs, 3);
  assert.equal(a.overlapPairs, 3);
  assert.equal(a.insidePairs, 0);
  assert.equal(a.v4.blocks, 3);
  assert.equal(a.v4.distinct, 1);
  assert.equal(a.v4.covered, 256n);
  const v6 = analyze(blocks("2001:db8::/32\n2001:0DB8:0:0::/32\n[2001:db8::]/32"));
  assert.equal(v6.identicalPairs, 3);
  assert.equal(v6.v6.distinct, 1);
});

t("n copies of a block are n choose 2 identical pairs", () => {
  for (const copies of [2, 3, 4, 7, 40]) {
    const a = analyze(blocks(Array(copies).fill("192.0.2.0/24").join("\n")));
    assert.equal(a.identicalPairs, (copies * (copies - 1)) / 2, `${copies} copies`);
    assert.equal(a.overlapPairs, a.identicalPairs);
    assert.equal(a.v4.covered, 256n);
  }
});

t("a chain /8 /16 /24 /32 is six pairs", () => {
  const a = analyze(blocks("10.0.0.0/8 10.0.0.0/16 10.0.0.0/24 10.0.0.1/32"));
  assert.equal(a.overlapPairs, 6);
  assert.equal(a.insidePairs, 6);
  assert.equal(a.v4.covered, 16777216n);
  // Widest outer block first, per inner block, in address order.
  assert.deepEqual(
    a.overlaps.map((o) => `${blockText(o.outer)}>${blockText(o.inner)}`),
    [
      "10.0.0.0/8>10.0.0.0/16",
      "10.0.0.0/8>10.0.0.0/24",
      "10.0.0.0/16>10.0.0.0/24",
      "10.0.0.0/8>10.0.0.1/32",
      "10.0.0.0/16>10.0.0.1/32",
      "10.0.0.0/24>10.0.0.1/32",
    ],
  );
});

t("the extremes of both families", () => {
  const all = good("0.0.0.0/0");
  assert.equal(all.size, 1n << 32n);
  assert.equal(all.last, 0xffffffffn); // unsigned, not -1
  const host = good("255.255.255.255");
  assert.equal(host.prefix, 32);
  assert.equal(host.bare, true);
  assert.equal(host.last, 0xffffffffn);
  assert.equal(good("::/0").size, 1n << 128n);
  assert.equal(good("::/0").last, (1n << 128n) - 1n);
  assert.equal(good("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff").last, (1n << 128n) - 1n);
  assert.equal(good("2001:db8::1").prefix, 128);
  assert.equal(good("2001:db8::/127").size, 2n);
  assert.equal(analyze(blocks("0.0.0.0/0\n255.255.255.255/32")).overlapPairs, 1);
  assert.equal(analyze(blocks("::/0\nffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")).overlapPairs, 1);
});

t("IPv4 and IPv6 never overlap, including a mapped IPv4 block", () => {
  const a = analyze(blocks("10.0.0.0/8\n::ffff:10.0.0.0/104\n::/0\n0.0.0.0/0"));
  assert.equal(a.v4.blocks, 2);
  assert.equal(a.v6.blocks, 2);
  // 0.0.0.0/0 holds 10/8, and ::/0 holds the mapped block. Nothing crosses.
  assert.equal(a.overlapPairs, 2);
  for (const o of a.overlaps) assert.equal(o.outer.family, o.inner.family);
  assert.equal(a.v4.covered, 1n << 32n);
  assert.equal(a.v6.covered, 1n << 128n);
});

t("sizes and counts print exactly", () => {
  assert.equal(formatCount(0n), "0");
  assert.equal(formatCount(999n), "999");
  assert.equal(formatCount(1000n), "1,000");
  assert.equal(formatCount(4294967296n), "4,294,967,296");
  assert.equal(formatSize(1n), "1");
  assert.equal(formatSize(256n), "256");
  assert.equal(formatSize(1n << 32n), "4,294,967,296");
  assert.equal(formatSize(1n << 39n), "549,755,813,888");
  assert.equal(formatSize(1n << 40n), "2^40");
  assert.equal(formatSize(1n << 128n), "2^128");
  // A union that is not a power of two is never rounded to one.
  assert.equal(formatSize((1n << 40n) + 1n), "1,099,511,627,777");
  assert.equal(formatSize((1n << 41n) - 1n), "2,199,023,255,551");
  assert.equal(formatSize(0n), "0");
});

/* ---- parsing ------------------------------------------------------------ */

t("separators, comments, tabs and CRLF", () => {
  const r = parseBlocks("10.0.0.0/8, 172.16.0.0/12;192.168.0.0/16\t100.64.0.0/10 # trailing\r\n# whole line\r\n\r\n  198.51.100.0/24  ");
  assert.equal(r.problemCount, 0);
  assert.deepEqual(r.blocks.map((b) => [b.line, blockText(b)]), [
    [1, "10.0.0.0/8"],
    [1, "172.16.0.0/12"],
    [1, "192.168.0.0/16"],
    [1, "100.64.0.0/10"],
    [4, "198.51.100.0/24"],
  ]);
  assert.deepEqual(r.blocks.map((b) => b.index), [1, 2, 3, 4, 5]);
  assert.equal(parseBlocks("").blocks.length, 0);
  assert.equal(parseBlocks("   \n# only a comment\n").problemCount, 0);
});

t("every malformed block is refused with a reason, and the rest are still read", () => {
  assert.match(bad("10.0.0.0/33"), /0 to 32/);
  assert.match(bad("::/129"), /0 to 128/);
  assert.match(bad("10.0.0.0/"), /not a prefix length/);
  assert.match(bad("10.0.0.0/-1"), /not a prefix length/);
  assert.match(bad("10.0.0.0/+8"), /not a prefix length/);
  assert.match(bad("10.0.0.0/8x"), /not a prefix length/);
  assert.match(bad("10.0.0.0/1000"), /not a prefix length/);
  assert.match(bad("10.0.0.0/255.0.0.0"), /netmask/);
  assert.match(bad("2001:db8::/ffff::"), /netmask/);
  assert.match(bad("10.0.0.0/8/8"), /more than one slash/);
  assert.match(bad("/8"), /no address before/);
  assert.match(bad("10.0.0/8"), /four octets/);
  assert.match(bad("10.0.0.256/8"), /256/);
  assert.match(bad("010.0.0.0/8"), /leading zero/);
  assert.match(bad("0x0a.0.0.0/8"), /hexadecimal/);
  assert.match(bad("167772160/8"), /bare integer/);
  assert.match(bad("10.0.0.0:80/8"), /port/);
  assert.match(bad("example.com/24"), /not a decimal number|octet/i);
  assert.match(bad("fe80::1%eth0/64"), /zone ID/);
  assert.match(bad("2001:db8:::/32"), /:::/);
  assert.match(bad("1:2:3:4:5:6:7:8:9/64"), /./);
  assert.match(bad("10.0.0.0​/8"), /U\+200B/);
  assert.match(bad("1٠.0.0.0/8"), /U\+0660/);
  const r = parseBlocks("10.0.0.0/8 nonsense 10.1.0.0/16\n::/129\n192.0.2.0/24");
  assert.equal(r.problemCount, 2);
  assert.deepEqual(r.problems.map((p) => p.line), [1, 2]);
  assert.deepEqual(r.blocks.map(blockText), ["10.0.0.0/8", "10.1.0.0/16", "192.0.2.0/24"]);
});

t("input limits", () => {
  const long = parseBlocks("a".repeat(MAX_INPUT_CHARS + 1));
  assert.equal(long.blocks.length, 0);
  assert.equal(long.problemCount, 1);
  assert.match(long.problems[0].message, /limit/);
  const exact = parseBlocks("10.0.0.0/8\n".repeat(MAX_ENTRIES));
  assert.equal(exact.blocks.length, MAX_ENTRIES);
  assert.equal(exact.truncated, false);
  const over = parseBlocks("10.0.0.0/8\n".repeat(MAX_ENTRIES + 1));
  assert.equal(over.blocks.length, MAX_ENTRIES);
  assert.equal(over.truncated, true);
  // Messages are bounded however many lines are wrong.
  const many = parseBlocks("x\n".repeat(500));
  assert.equal(many.problemCount, 500);
  assert.ok(many.problems.length <= 20);
});

/* ---- the sweep against an independent oracle ---------------------------- */

/** Brute force: compare every pair by range, share nothing with the sweep. */
function oracle(list: Block[]) {
  let overlap = 0;
  let identical = 0;
  let inside = 0;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (a.family !== b.family) continue;
      if (a.last < b.network || b.last < a.network) continue;
      overlap += 1;
      if (a.network === b.network && a.last === b.last) identical += 1;
      else inside += 1;
    }
  }
  // Union by merging sorted ranges per family.
  const covered = { 4: 0n, 6: 0n };
  for (const family of [4, 6] as const) {
    const ranges = list
      .filter((b) => b.family === family)
      .map((b) => [b.network, b.last] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    let cur: [bigint, bigint] | null = null;
    for (const [s, e] of ranges) {
      if (cur && s <= cur[1]) {
        if (e > cur[1]) cur[1] = e;
      } else {
        if (cur) covered[family] += cur[1] - cur[0] + 1n;
        cur = [s, e];
      }
    }
    if (cur) covered[family] += cur[1] - cur[0] + 1n;
  }
  return { overlap, identical, inside, covered };
}

let seed = 20260521;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

function randomList(count: number): string {
  // Few distinct networks and prefixes, so nesting, adjacency and repeats are
  // all common rather than rare.
  const v4Base = ["10.0.0.0", "10.0.0.128", "10.0.1.0", "10.1.0.0", "192.168.0.0", "192.168.0.200", "0.0.0.0", "255.255.255.255"];
  const v6Base = ["2001:db8::", "2001:db8:0:1::", "2001:db8:8000::", "fe80::", "::", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"];
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (rand() < 0.65) out.push(`${pick(v4Base)}/${pick([0, 8, 15, 16, 23, 24, 25, 28, 31, 32])}`);
    else out.push(`${pick(v6Base)}/${pick([0, 16, 32, 33, 48, 64, 127, 128])}`);
  }
  return out.join("\n");
}

t("the sweep agrees with comparing every pair, over 400 random lists", () => {
  for (let round = 0; round < 400; round += 1) {
    const list = blocks(randomList(1 + Math.floor(rand() * 40)));
    const got = analyze(list, 100_000);
    const want = oracle(list);
    assert.equal(got.overlapPairs, want.overlap, `round ${round} overlap`);
    assert.equal(got.identicalPairs, want.identical, `round ${round} identical`);
    assert.equal(got.insidePairs, want.inside, `round ${round} inside`);
    assert.equal(got.v4.covered, want.covered[4], `round ${round} v4 union`);
    assert.equal(got.v6.covered, want.covered[6], `round ${round} v6 union`);
    assert.equal(got.v4.blocks + got.v6.blocks, list.length);
    assert.equal(got.overlaps.length, want.overlap, `round ${round} listing is complete when it fits`);
    // Each listed pair is a real overlap, and no pair is listed twice.
    const seen = new Set<string>();
    for (const o of got.overlaps) {
      const key = `${Math.min(o.outer.index, o.inner.index)}-${Math.max(o.outer.index, o.inner.index)}`;
      assert.ok(!seen.has(key), `round ${round} repeats ${key}`);
      seen.add(key);
      assert.equal(o.outer.family, o.inner.family);
      assert.ok(o.outer.network <= o.inner.network && o.outer.last >= o.inner.last, `round ${round} outer holds inner`);
      assert.equal(o.relation === "identical", o.outer.prefix === o.inner.prefix);
      assert.equal(o.shared, o.inner.size);
    }
    // Distinct counts one per different block.
    const distinct = (f: 4 | 6) =>
      new Set(list.filter((b) => b.family === f).map((b) => `${b.network}/${b.prefix}`)).size;
    assert.equal(got.v4.distinct, distinct(4));
    assert.equal(got.v6.distinct, distinct(6));
  }
});

t("the pair list is capped but the counts stay exact", () => {
  const text = Array(300).fill("10.0.0.0/24").join("\n");
  const list = blocks(text);
  const a = analyze(list);
  assert.equal(a.overlapPairs, (300 * 299) / 2);
  assert.equal(a.overlaps.length, MAX_PAIRS_LISTED);
  const tiny = analyze(list, 5);
  assert.equal(tiny.overlaps.length, 5);
  assert.equal(tiny.overlapPairs, (300 * 299) / 2);
  assert.equal(analyze(list, 0).overlaps.length, 0);
  // A full list of nested distinct blocks finishes quickly: the cost is the sort.
  const big = blocks(Array.from({ length: MAX_ENTRIES }, (_, i) => `10.${i >> 8}.${i & 255}.0/24`).join("\n"));
  const started = Date.now();
  const r = analyze(big);
  assert.equal(r.overlapPairs, 0);
  assert.ok(Date.now() - started < 2000);
});

t("analysis of nothing", () => {
  const a = analyze([]);
  assert.equal(a.overlapPairs, 0);
  assert.equal(a.v4.blocks + a.v6.blocks, 0);
  assert.equal(a.v4.covered, 0n);
  assert.deepEqual(a.overlaps, []);
});

/* ---- address lookup ----------------------------------------------------- */

function address(text: string) {
  const r = parseIp(text);
  assert.equal(r.ok, true, text);
  if (!r.ok) throw new Error();
  return r.value;
}

t("lookup puts the most specific block first", () => {
  const list = blocks("10.0.0.0/8\n10.1.0.0/16\n10.1.2.0/24\n192.168.0.0/16\n10.1.2.0/24\n2001:db8::/32");
  const a = address("10.1.2.3");
  const hit = blocksHolding(list, a.family, a.value);
  assert.deepEqual(hit.map((b) => `${blockText(b)}#${b.index}`), ["10.1.2.0/24#3", "10.1.2.0/24#5", "10.1.0.0/16#2", "10.0.0.0/8#1"]);
  const miss = address("11.0.0.0");
  assert.equal(blocksHolding(list, miss.family, miss.value).length, 0);
  const edge = address("10.1.2.255");
  assert.equal(blocksHolding(list, edge.family, edge.value).length, 4);
  const past = address("10.1.3.0");
  assert.deepEqual(blocksHolding(list, past.family, past.value).map(blockText), ["10.1.0.0/16", "10.0.0.0/8"]);
  const v6 = address("2001:db8:ffff::1");
  assert.deepEqual(blocksHolding(list, v6.family, v6.value).map(blockText), ["2001:db8::/32"]);
  const other = address("2001:db9::1");
  assert.equal(blocksHolding(list, other.family, other.value).length, 0);
  // A zone ID names an interface and does not change the address.
  const zoned = address("fe80::1%eth0");
  assert.equal(blocksHolding(blocks("fe80::/10"), zoned.family, zoned.value).length, 1);
});

t("lookup agrees with the range test over random addresses", () => {
  for (let round = 0; round < 200; round += 1) {
    const list = blocks(randomList(1 + Math.floor(rand() * 25)));
    for (let k = 0; k < 20; k += 1) {
      const b = pick(list);
      // Probe at, around and inside a random block's edges.
      const offset = pick([-1n, 0n, 1n, b.size - 1n, b.size, b.size / 2n]);
      const max = (1n << BigInt(b.family === 4 ? 32 : 128)) - 1n;
      let value = b.network + offset;
      if (value < 0n) value = 0n;
      if (value > max) value = max;
      const got = blocksHolding(list, b.family, value);
      const want = list.filter((x) => x.family === b.family && x.network <= value && value <= x.last);
      assert.equal(got.length, want.length);
      for (let i = 1; i < got.length; i += 1) assert.ok(got[i - 1].prefix >= got[i].prefix, "most specific first");
    }
  }
});

t("lookup rejects what is not one address", () => {
  const msg = (s: string) => {
    const r = parseIp(s);
    assert.equal(r.ok, false, s);
    return r.ok ? "" : r.error;
  };
  assert.match(msg("10.0.0.0/8"), /without a prefix length/);
  assert.match(msg(""), /Enter/);
  assert.match(msg("10.0.0.256"), /256/);
});

/* ---- fuzz --------------------------------------------------------------- */

t("hostile input never throws and never breaks an invariant", () => {
  const samples = [
    "", "/", "//", "/0", "0/0", "::/0/0", "[", "]", "[]", "[::]/", "[::/0]", "[10.0.0.0]/8", "[::1]/128",
    "\u0000", "￿", "\uD800", "10.0.0.0/8—", "‮10.0.0.0/8", "10.0.0.0/٣",
    "__proto__", "constructor/8", "toString", "10.0.0.0/__proto__", "1e3/8", "NaN", "Infinity/8",
    "0".repeat(300), "1.".repeat(200), ":".repeat(200), "/".repeat(200), "#".repeat(10),
    "10.0.0.0/8 ".repeat(100), "10.0.0.0/8;,;,;,10.1.0.0/16", "\r\r\r\n\n\r", "a/b c/d e/f",
    "::ffff:1.2.3.4/96", "::ffff:1.2.3.4/129", "1:2:3:4:5:6:1.2.3.4/120", "64:ff9b::/96",
  ];
  for (const s of samples) {
    const r = parseBlocks(s);
    for (const b of r.blocks) {
      assert.ok(b.prefix >= 0 && b.prefix <= (b.family === 4 ? 32 : 128));
      assert.equal(b.last - b.network + 1n, b.size);
      assert.equal(b.network % b.size, 0n, "start is a multiple of the size");
    }
    for (const m of [...r.problems, ...r.notes]) {
      assert.ok(m.message.length > 0 && m.message.length < 600);
      // Messages quote what was typed, so only a sample without one can be held to this.
      if (!s.includes("—")) assert.ok(!m.message.includes("—"), `no em dash: ${m.message}`);
    }
    analyze(r.blocks);
  }
  // Random text over the alphabet the parser cares about.
  const alphabet = "0123456789abcdefABCDEF.:/[]%#;, \n\t-x";
  for (let i = 0; i < 20000; i += 1) {
    let s = "";
    const len = Math.floor(rand() * 40);
    for (let j = 0; j < len; j += 1) s += alphabet[Math.floor(rand() * alphabet.length)];
    const r = parseBlocks(s);
    for (const b of r.blocks) {
      assert.equal(b.network % b.size, 0n);
      assert.equal(b.last - b.network + 1n, b.size);
    }
    analyze(r.blocks);
  }
});

console.log(`cidr-overlap-checker: ${n} tests passed`);
