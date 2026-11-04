import assert from "node:assert/strict";
import {
  MAX_BYTES,
  analyzeGeneric,
  analyzeIpv4Header,
  analyzeTransport,
  buildPseudoHeader,
  fold,
  incrementalUpdate,
  internetChecksum,
  parseHex,
  parseIpv4,
  sumBytes,
  toHexWords,
  transportFromPacket,
  verifies,
} from "../../client/src/lib/toolkit/ipv4-checksum-calculator.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function hex(text: string): Uint8Array {
  const parsed = parseHex(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.bytes;
}

/* RFC 1071 section 3, numerical example: 00 01 f2 03 f4 f5 f6 f7. */
test("RFC 1071 section 3 example", () => {
  const detail = sumBytes(hex("00 01 f2 03 f4 f5 f6 f7"));
  assert.deepEqual(detail.words, [0x0001, 0xf203, 0xf4f5, 0xf6f7]);
  assert.equal(detail.total, 0x2ddf0);
  assert.equal(detail.folds.length, 1);
  assert.deepEqual(detail.folds[0], { before: 0x2ddf0, carry: 2, low: 0xddf0, after: 0xddf2 });
  assert.equal(detail.folded, 0xddf2);
  assert.equal(detail.checksum, 0x220d);
});

/* RFC 1071 section 2(B): byte order independence. Swapping every byte pair
   swaps the bytes of the folded sum. */
test("RFC 1071 byte order independence", () => {
  const data = hex("00 01 f2 03 f4 f5 f6 f7 12 34 ab cd");
  const swapped = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 2) {
    swapped[i] = data[i + 1];
    swapped[i + 1] = data[i];
  }
  const a = sumBytes(data).folded;
  const b = sumBytes(swapped).folded;
  assert.equal(((a & 0xff) << 8) | (a >> 8), b);
});

/* The textbook IPv4 header (192.168.0.1 to 192.168.0.199, UDP). */
test("IPv4 header b861", () => {
  const r = analyzeIpv4Header(hex("4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7"));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.computed, 0xb861);
  assert.equal(r.existing, 0xb861);
  assert.equal(r.valid, true);
  assert.equal(r.verifySum, 0xffff);
  assert.equal(r.detail.total, 0x2479c);
  assert.equal(r.detail.folded, 0x479e);
  assert.equal(r.source, "192.168.0.1");
  assert.equal(r.destination, "192.168.0.199");
  assert.equal(r.protocol, 17);
  assert.equal(r.ttl, 64);
  assert.equal(r.dontFragment, true);
  assert.equal(r.totalLength, 0x73);
  assert.equal(r.words[5].value, 0);
  assert.equal(r.words[5].original, 0xb861);
  assert.equal(r.words[5].role, "checksum");
});

/* The other widely reproduced example, 172.16.10.99 to 172.16.10.12, TCP. */
test("IPv4 header b1e6", () => {
  const r = analyzeIpv4Header(hex("45 00 00 3c 1c 46 40 00 40 06 b1 e6 ac 10 0a 63 ac 10 0a 0c"));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.computed, 0xb1e6);
  assert.equal(r.valid, true);
});

test("IPv4 header with a wrong checksum", () => {
  const r = analyzeIpv4Header(hex("4500 0073 0000 4000 4011 0000 c0a8 0001 c0a8 00c7"));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.computed, 0xb861);
  assert.equal(r.existing, 0);
  assert.equal(r.valid, false);
  assert.equal(toHexWords(r.corrected), "4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7");
});

/* IHL 6 with a Router Alert option, cross-checked by an independent
   little-endian implementation: 4200. */
test("IPv4 header with options", () => {
  const r = analyzeIpv4Header(hex("46c00020 00004000 01020000 c0000201 e0000016 94040000 2200eb05 00000000"));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.headerLength, 24);
  assert.equal(r.computed, 0x4200);
  assert.equal(r.words.length, 12);
  assert.equal(r.words[10].label, "Options");
  assert.equal(r.trailing.length, 8);
  assert.ok(r.warnings.some((w) => w.includes("8 bytes after the header")));
});

/* RFC 1624: the incremental update must agree with a full recompute. */
test("RFC 1624 incremental update after TTL decrement", () => {
  const r = analyzeIpv4Header(hex("4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7"));
  assert.ok(r.ok);
  if (!r.ok) return;
  const next = r.header.slice();
  next[8] -= 1;
  next[10] = 0;
  next[11] = 0;
  assert.equal(r.afterTtlDecrement, internetChecksum(next));
  assert.equal(r.afterTtlDecrement, 0xb961);

  // Randomized agreement over many headers and word changes.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let trial = 0; trial < 2000; trial++) {
    const h = new Uint8Array(20);
    for (let i = 0; i < 20; i++) h[i] = rand() & 0xff;
    h[0] = 0x45;
    h[10] = 0;
    h[11] = 0;
    const hc = internetChecksum(h);
    const wordIndex = 1 + (rand() % 9);
    const pos = wordIndex === 5 ? 2 : wordIndex * 2;
    const m = (h[pos] << 8) | h[pos + 1];
    const m2 = rand() & 0xffff;
    h[pos] = m2 >> 8;
    h[pos + 1] = m2 & 0xff;
    assert.equal(incrementalUpdate(hc, m, m2), internetChecksum(h), `trial ${trial}`);
  }
  // TTL 0 has nothing to decrement.
  const zero = analyzeIpv4Header(hex("4500 0073 0000 4000 0011 0000 c0a8 0001 c0a8 00c7"));
  assert.ok(zero.ok && zero.afterTtlDecrement === null);
});

test("IPv4 header errors", () => {
  const short = analyzeIpv4Header(hex("4500 0073"));
  assert.ok(!short.ok && short.error.includes("at least 20 bytes"));
  const v6 = analyzeIpv4Header(hex("6000000000140640" + "00".repeat(32)));
  assert.ok(!v6.ok && v6.error.includes("IPv6"));
  const v5 = analyzeIpv4Header(hex("5500" + "00".repeat(18)));
  assert.ok(!v5.ok && v5.error.includes("not 4"));
  const ihl = analyzeIpv4Header(hex("4300" + "00".repeat(18)));
  assert.ok(!ihl.ok && ihl.error.includes("minimum is 5"));
  const trunc = analyzeIpv4Header(hex("4f00" + "00".repeat(18)));
  assert.ok(!trunc.ok && trunc.error.includes("60 bytes"));
  const reserved = analyzeIpv4Header(hex("4500 0014 0000 8000 4011 0000 c0a8 0001 c0a8 00c7"));
  assert.ok(reserved.ok && reserved.warnings.some((w) => w.includes("reserved flag")));
  const badTotal = analyzeIpv4Header(hex("4500 0010 0000 4000 4011 0000 c0a8 0001 c0a8 00c7"));
  assert.ok(badTotal.ok && badTotal.warnings.some((w) => w.includes("smaller than")));
});

test("generic: odd length is padded on the right", () => {
  const one = analyzeGeneric(hex("01"));
  assert.deepEqual(one.detail.words, [0x0100]);
  assert.equal(one.detail.padded, true);
  assert.equal(one.detail.checksum, 0xfeff);
  assert.equal(one.words[0].role, "pad");
  const three = sumBytes(hex("ab cd ef"));
  assert.deepEqual(three.words, [0xabcd, 0xef00]);
  assert.equal(three.checksum, ~fold(0xabcd + 0xef00).folded & 0xffff);
  assert.equal(three.checksum, 0x6531);
});

test("generic: edge values", () => {
  assert.equal(sumBytes(new Uint8Array(0)).checksum, 0xffff);
  assert.equal(sumBytes(hex("0000")).checksum, 0xffff);
  assert.equal(sumBytes(hex("ffff")).checksum, 0x0000);
  assert.equal(verifies(hex("ffff")), true);
  // 65534 bytes of FF: 32767 words of FFFF, which is -0 repeated, so FFFF.
  const even = sumBytes(new Uint8Array(MAX_BYTES - 1).fill(0xff));
  assert.equal(even.words.length, 32767);
  assert.equal(even.folded, 0xffff);
  assert.equal(even.checksum, 0);
  // 65535 bytes: the odd last byte pads to FF00, and FFFF words add nothing
  // in ones' complement, so the sum is FF00 and the checksum 00FF.
  const big = sumBytes(new Uint8Array(MAX_BYTES).fill(0xff));
  assert.equal(big.words.length, 32768);
  assert.equal(big.total, 32767 * 0xffff + 0xff00);
  assert.equal(big.folded, 0xff00);
  assert.equal(big.checksum, 0x00ff);
  // Data followed by its own checksum verifies.
  const data = hex("dead beef 0102 0304 55");
  const cs = internetChecksum(data);
  const padded = new Uint8Array(data.length + 1 + 2);
  padded.set(data, 0);
  padded[data.length + 1] = cs >> 8;
  padded[data.length + 2] = cs & 0xff;
  assert.equal(verifies(padded), true);
  assert.equal(analyzeGeneric(padded).selfVerifies, true);
});

test("fold handles multiple carries", () => {
  const { folds, folded } = fold(0x1fffe);
  assert.equal(folded, 0xffff);
  assert.equal(folds.length, 1);
  const two = fold(0xffff + 0xffff + 0xffff);
  assert.equal(two.folded, 0xffff);
  assert.equal(fold(0x10000).folded, 1);
  assert.equal(fold(0).folded, 0);
});

test("hex parsing accepts real paste formats", () => {
  assert.deepEqual([...hex("4500003c")], [0x45, 0x00, 0x00, 0x3c]);
  assert.deepEqual([...hex("45:00:00:3c")], [0x45, 0x00, 0x00, 0x3c]);
  assert.deepEqual([...hex("45-00-00-3C")], [0x45, 0x00, 0x00, 0x3c]);
  assert.deepEqual([...hex("0x45 0x00, 0x00, 0x3c")], [0x45, 0x00, 0x00, 0x3c]);
  assert.deepEqual([...hex("\\x45\\x00\\x00\\x3c")], [0x45, 0x00, 0x00, 0x3c]);
  const tcpdump = "\t0x0000:  4500 003c 1c46 4000 4006 b1e6 ac10 0a63\n\t0x0010:  ac10 0a0c";
  const r = analyzeIpv4Header(hex(tcpdump));
  assert.ok(r.ok && r.computed === 0xb1e6);
});

test("hex parsing errors", () => {
  const empty = parseHex("   ");
  assert.ok(!empty.ok && empty.error === "Enter some hex bytes.");
  const odd = parseHex("450");
  assert.ok(!odd.ok && odd.error.includes("odd count"));
  const bad = parseHex("45 0g");
  assert.ok(!bad.ok && bad.error.includes('"g"') && bad.error.includes("ASCII column"));
  const big = parseHex("00".repeat(MAX_BYTES + 1));
  assert.ok(!big.ok && big.error.includes("65,535"));
  const huge = parseHex("0".repeat(500_000));
  assert.ok(!huge.ok && huge.error.includes("characters"));
  const adversarial = parseHex("<script>alert(1)</script>");
  assert.ok(!adversarial.ok);
});

test("dotted quad parsing", () => {
  const ok = parseIpv4(" 10.0.0.1 ", "source");
  assert.ok(ok.ok && ok.bytes.join(".") === "10.0.0.1");
  const lead = parseIpv4("10.0.0.010", "source");
  assert.ok(!lead.ok && lead.error.includes("leading zero"));
  const high = parseIpv4("10.0.0.256", "source");
  assert.ok(!high.ok && high.error.includes("above 255"));
  const three = parseIpv4("10.0.1", "destination");
  assert.ok(!three.ok && three.error.includes("four"));
  const empty = parseIpv4("", "destination");
  assert.ok(!empty.ok && empty.error.includes("destination"));
  const neg = parseIpv4("10.0.0.-1", "source");
  assert.ok(!neg.ok);
});

test("pseudo-header layout", () => {
  const ph = buildPseudoHeader([10, 0, 0, 1], [10, 0, 0, 2], 6, 24);
  assert.equal(toHexWords(ph), "0a00 0001 0a00 0002 0006 0018");
});

/* UDP, hand computed: pseudo sum 0x1836e plus UDP sum 0x7adc is 0x1fe4a,
   folds to 0xfe4b, complement 0x01b4. Matches the independent check. */
test("UDP checksum, hand computed", () => {
  const r = analyzeTransport({
    source: "192.168.1.1",
    destination: "192.168.1.2",
    protocol: 17,
    segment: hex("1234 0035 000a 0000 6869"),
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.length, 10);
  assert.equal(r.pseudoSum, fold(0x1836e).folded);
  assert.equal(r.detail.total, 0x1fe4a);
  assert.equal(r.detail.folded, 0xfe4b);
  assert.equal(r.computed, 0x01b4);
  assert.equal(r.transmitted, 0x01b4);
  assert.equal(r.udpNoChecksum, true);
  assert.equal(r.valid, false);
  assert.equal(r.words.length, 11);
  assert.equal(r.words[0].role, "pseudo");
  assert.equal(r.words[9].role, "checksum");
  assert.equal(toHexWords(r.corrected), "1234 0035 000a 01b4 6869");

  const check = analyzeTransport({
    source: "192.168.1.1",
    destination: "192.168.1.2",
    protocol: 17,
    segment: r.corrected,
  });
  assert.ok(check.ok && check.valid && check.verifySum === 0xffff && !check.udpNoChecksum);
});

test("UDP odd length payload, independent check 00ca", () => {
  const r = analyzeTransport({
    source: "198.51.100.7",
    destination: "203.0.113.9",
    protocol: 17,
    segment: hex("d431 0035 000b 0000 616263"),
  });
  assert.ok(r.ok && r.computed === 0x00ca && r.detail.padded && r.warnings.length === 0);
});

/* RFC 768: a computed checksum of zero is transmitted as all ones. */
test("UDP zero checksum is sent as FFFF", () => {
  const base = analyzeTransport({
    source: "192.168.1.1",
    destination: "192.168.1.2",
    protocol: 17,
    segment: hex("1234 0035 000a 0000 0000"),
  });
  assert.ok(base.ok);
  if (!base.ok) return;
  const w = 0xffff - base.detail.folded;
  const seg = hex("1234 0035 000a 0000 0000");
  seg[8] = w >> 8;
  seg[9] = w & 0xff;
  const r = analyzeTransport({ source: "192.168.1.1", destination: "192.168.1.2", protocol: 17, segment: seg });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.computed, 0);
  assert.equal(r.transmitted, 0xffff);
  const sent = r.corrected;
  const verify = analyzeTransport({ source: "192.168.1.1", destination: "192.168.1.2", protocol: 17, segment: sent });
  assert.ok(verify.ok && verify.valid);
});

/* TCP SYN with MSS, cross-checked by the independent implementation: c082. */
test("TCP SYN checksum", () => {
  const r = analyzeTransport({
    source: "10.0.0.1",
    destination: "10.0.0.2",
    protocol: 6,
    segment: hex("c350005000000001000000006002ffff00000000020405b4"),
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.computed, 0xc082);
  assert.equal(r.checksumOffset, 16);
  assert.equal(r.words[6 + 9].label, "Urgent pointer");
  assert.equal(r.words[6 + 8].role, "checksum");
  assert.equal(r.words[6 + 10].label, "TCP options");
  assert.equal(r.warnings.length, 0);
  // A TCP checksum of zero stays zero; only UDP remaps it.
  assert.equal(r.transmitted, r.computed);
});

test("transport errors and warnings", () => {
  const badSrc = analyzeTransport({ source: "1.2.3", destination: "1.2.3.4", protocol: 6, segment: new Uint8Array(20) });
  assert.ok(!badSrc.ok && badSrc.error.includes("source"));
  const short = analyzeTransport({ source: "1.2.3.4", destination: "1.2.3.4", protocol: 6, segment: new Uint8Array(19) });
  assert.ok(!short.ok && short.error.includes("at least 20"));
  const shortUdp = analyzeTransport({ source: "1.2.3.4", destination: "1.2.3.4", protocol: 17, segment: new Uint8Array(7) });
  assert.ok(!shortUdp.ok && shortUdp.error.includes("at least 8"));
  const badOffset = analyzeTransport({ source: "1.2.3.4", destination: "1.2.3.4", protocol: 6, segment: new Uint8Array(20) });
  assert.ok(badOffset.ok && badOffset.warnings.some((w) => w.includes("below the minimum")));
  const udpLen = analyzeTransport({ source: "1.2.3.4", destination: "1.2.3.4", protocol: 17, segment: hex("0001 0002 0020 0000") });
  assert.ok(udpLen.ok && udpLen.warnings.some((w) => w.includes("UDP length field says 32")));
  const override = analyzeTransport({
    source: "1.2.3.4",
    destination: "1.2.3.4",
    protocol: 17,
    segment: hex("0001 0002 0008 0000"),
    lengthOverride: 100,
  });
  assert.ok(override.ok && override.length === 100 && override.warnings.some((w) => w.includes("partial sum")));
  const badOverride = analyzeTransport({
    source: "1.2.3.4",
    destination: "1.2.3.4",
    protocol: 17,
    segment: hex("0001 0002 0008 0000"),
    lengthOverride: 70000,
  });
  assert.ok(!badOverride.ok);
});

test("a whole packet yields its transport segment, Ethernet padding trimmed", () => {
  // IPv4 + UDP from the hand example, with 6 bytes of Ethernet padding.
  const packet = hex("4500 001e 0000 4000 4011 0000 c0a8 0101 c0a8 0102 1234 0035 000a 01b4 6869 0000 0000 0000");
  const r = analyzeIpv4Header(packet);
  assert.ok(r.ok);
  if (!r.ok) return;
  const t = transportFromPacket(r);
  assert.ok(t);
  if (!t) return;
  assert.equal(t.segment.length, 10);
  assert.equal(t.protocol, 17);
  const check = analyzeTransport({ ...t });
  assert.ok(check.ok && check.valid);
  // A fragment does not yield a segment.
  const frag = analyzeIpv4Header(hex("4500 001e 0000 2000 4011 0000 c0a8 0101 c0a8 0102 1234 0035 000a 01b4 6869"));
  assert.ok(frag.ok && transportFromPacket(frag) === null);
  // ICMP does not either.
  const icmp = analyzeIpv4Header(hex("4500 001c 0000 4000 4001 0000 c0a8 0101 c0a8 0102 0800 f7ff 0000 0000"));
  assert.ok(icmp.ok && transportFromPacket(icmp) === null);
});

/* Every example the page offers must say what its label claims. */
test("page examples are self-consistent", () => {
  const whole = analyzeIpv4Header(hex("4500 001e 0000 4000 4011 b77b c0a8 0101 c0a8 0102 1234 0035 000a 01b4 6869"));
  assert.ok(whole.ok && whole.valid && whole.computed === 0xb77b);
  const opts = analyzeIpv4Header(hex("46c0 0020 0000 4000 0102 4200 c000 0201 e000 0016 9404 0000"));
  assert.ok(opts.ok && opts.valid && opts.warnings.length === 0);
  const wrong = analyzeIpv4Header(hex("4500 0073 0000 4000 4011 b862 c0a8 0001 c0a8 00c7"));
  assert.ok(wrong.ok && !wrong.valid);
  const syn = analyzeTransport({ source: "10.0.0.1", destination: "10.0.0.2", protocol: 6, segment: hex("c350 0050 0000 0001 0000 0000 6002 ffff c082 0000 0204 05b4") });
  assert.ok(syn.ok && syn.valid);
  // ICMP echo request, type 8: 0800 + 0000 + 0000 + 0001 = 0801, complement F7FE.
  const icmp = analyzeGeneric(hex("0800 f7fe 0000 0001"));
  assert.ok(icmp.selfVerifies && icmp.detail.checksum === 0);
  assert.equal(internetChecksum(hex("0800 0000 0000 0001")), 0xf7fe);
});


/* ---------------------------------------------------------------------------
   Independent verifier cases. Expected values come from the RFCs' own worked
   examples or from a separate Python implementation that computes the ones'
   complement sum as (sum mod 0xffff), not by folding carries.
   --------------------------------------------------------------------------- */

/* RFC 1624 section 4: m = 0x5555 changes to m' = 0x3285, the sum of the
   other words is 0xCD7A, so HC = ~(0xCD7A + 0x5555) = 0xDD2F and the correct
   new checksum is 0x0000. Equation 2 would give the wrong 0xFFFF; equation 3
   must give 0x0000. */
test("verifier: RFC 1624 section 4 example", () => {
  assert.equal(~fold(0xcd7a + 0x5555).folded & 0xffff, 0xdd2f);
  assert.equal(incrementalUpdate(0xdd2f, 0x5555, 0x3285), 0x0000);
});

test("verifier: published and hand-built IPv4 headers", () => {
  // Wikipedia "IPv4 header checksum" example, TTL 64 -> 63 raises the checksum by 0x0100.
  const h = analyzeIpv4Header(hex("4500 0073 0000 4000 4011 0000 c0a8 0001 c0a8 00c7"));
  assert.ok(h.ok);
  if (!h.ok) return;
  assert.equal(h.computed, 0xb861);
  assert.equal(h.valid, false);
  assert.equal(h.afterTtlDecrement, 0xb961);
  // IHL 15: a 60-byte header with 40 bytes of NOP options (Python: 0x9cd8).
  const ihl15 = analyzeIpv4Header(hex("4f00 003c abcd 0000 4006 0000 0a00 0001 0a00 0002" + " 01".repeat(40)));
  assert.ok(ihl15.ok && ihl15.headerLength === 60 && ihl15.computed === 0x9cd8 && ihl15.words.length === 30);
  // TTL 0 has nothing to decrement.
  const ttl0 = analyzeIpv4Header(hex("4500 0014 0000 0000 0011 0000 0a00 0001 0a00 0002"));
  assert.ok(ttl0.ok && ttl0.afterTtlDecrement === null);
});

test("verifier: boundary byte strings", () => {
  // All zero: sum 0, checksum 0xffff (RFC 1071: ones' complement of +0).
  assert.equal(internetChecksum(new Uint8Array(20)), 0xffff);
  // One byte ff pads to ff00, checksum 00ff.
  const one = sumBytes(hex("ff"));
  assert.ok(one.padded && one.words[0] === 0xff00 && one.checksum === 0x00ff);
  // 65,535 bytes of ff: 32,767 words of ffff plus ff00, total 0x7fff7f01,
  // ones' complement sum 0xff00, checksum 0x00ff (Python reference).
  const max = sumBytes(new Uint8Array(MAX_BYTES).fill(0xff));
  assert.equal(max.total, 0x7fff7f01);
  assert.equal(max.folded, 0xff00);
  assert.equal(max.checksum, 0x00ff);
  // Every fold leaves at most 16 bits.
  assert.ok(max.folds.length <= 2 && max.folds.every((f) => f.after === f.low + f.carry));
});

test("verifier: ICMP echo and TCP with an odd payload", () => {
  // Echo request, id 1, seq 1, 32-byte payload abcdefghijklmnopqrstuvwabcdefghi.
  const payload = Array.from("abcdefghijklmnopqrstuvwabcdefghi", (c) => c.charCodeAt(0).toString(16)).join("");
  assert.equal(internetChecksum(hex("0800 0000 0001 0001" + payload)), 0x4d5a);
  // TCP PSH-ACK with the 3-byte payload "abc", 192.0.2.1 -> 198.51.100.2 (Python: 0xf80c).
  const t = analyzeTransport({
    source: "192.0.2.1",
    destination: "198.51.100.2",
    protocol: 6,
    segment: hex("04d2 0050 0000 0001 0000 0000 5018 0200 0000 0000 616263"),
  });
  assert.ok(t.ok && t.computed === 0xf80c && t.length === 23 && t.detail.padded);
});

test("verifier: UDP that computes to zero is sent as ffff (RFC 768)", () => {
  // Payload word chosen so the pseudo-header plus segment sums to 0xffff.
  const u = analyzeTransport({ source: "10.0.0.1", destination: "10.0.0.2", protocol: 17, segment: hex("0007 000a 000a 0000 ebc6") });
  assert.ok(u.ok);
  if (!u.ok) return;
  assert.equal(u.computed, 0x0000);
  assert.equal(u.transmitted, 0xffff);
  assert.ok(u.udpNoChecksum);
  const sent = analyzeTransport({ source: "10.0.0.1", destination: "10.0.0.2", protocol: 17, segment: u.corrected });
  assert.ok(sent.ok && sent.valid && !sent.udpNoChecksum && sent.existing === 0xffff);
  // The same bytes as TCP keep a computed zero as zero.
  const tcpZeroish = analyzeTransport({ source: "10.0.0.1", destination: "10.0.0.2", protocol: 6, segment: hex("0000 0000 0000 0000 0000 0000 5000 0000 0000 0000") });
  assert.ok(tcpZeroish.ok && tcpZeroish.transmitted === tcpZeroish.computed);
});

test("verifier: dump formats with offsets", () => {
  const want = "4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7";
  const ref = hex(want);
  const wireshark = "0000   45 00 00 73 00 00 40 00 40 11 b8 61 c0 a8 00 01\n0010   c0 a8 00 c7";
  const xxd = "00000000: 4500 0073 0000 4000 4011 b861 c0a8 0001  E..s..@.@..a....\n";
  const xxdNoAscii = "00000000: 4500 0073 0000 4000 4011 b861 c0a8 0001\n00000010: c0a8 00c7";
  const tcpdumpX = "\t0x0000:  4500 0073 0000 4000\r\n\t0x0008:  4011 b861 c0a8 0001\r\n\t0x0010:  c0a8 00c7";
  assert.deepEqual(hex(wireshark), ref);
  assert.deepEqual(hex(xxdNoAscii), ref);
  assert.deepEqual(hex(tcpdumpX), ref);
  // An ASCII column is refused with a hint, not silently summed.
  const bad = parseHex(xxd);
  assert.ok(!bad.ok && bad.error.includes("ASCII column"));
  // A single line beginning 0000 is data, not an offset.
  assert.deepEqual(Array.from(hex("0000 45 00")), [0, 0, 0x45, 0]);
  // Lines whose first token is not the running offset stay data.
  assert.equal(hex("0000 11 22\n0005 33 44").length, 8);
});

test("verifier: malformed and adversarial input never throws", () => {
  const cases = ["", "   ", "\n\n", "0x", "4", "zz", "45 00 😀", "45​00", "４５", "\u0000\u0000", "0x0x45", "45 0", "45".repeat(65536), "a".repeat(400_001)];
  for (const c of cases) {
    const r = parseHex(c);
    assert.ok(!r.ok, JSON.stringify(c.slice(0, 20)));
    assert.ok(typeof r.error === "string" && r.error.length > 0);
  }
  assert.match((parseHex("45 00 😀") as { error: string }).error, /^"😀"/);
  assert.match((parseHex("45​00") as { error: string }).error, /U\+200B/);
  // Header errors: IPv6, version 0, IHL 4, truncated options.
  const err = (t: string) => {
    const r = analyzeIpv4Header(hex(t));
    assert.ok(!r.ok);
    return (r as { error: string }).error;
  };
  assert.match(err("6000 0000 0000 0000 0000 0000 0000 0000 0000 0000"), /IPv6/);
  assert.match(err("0500 0000 0000 0000 0000 0000 0000 0000 0000 0000"), /not 4/);
  assert.match(err("4400 0000 0000 0000 0000 0000 0000 0000 0000 0000"), /minimum is 5/);
  assert.match(err("4600 0018 0000 0000 4006 0000 0a00 0001 0a00 0002"), /24 bytes/);
  assert.match(err("4500"), /at least 20 bytes/);
  // A whole Ethernet frame (dst MAC, src MAC, EtherType 0800) gets a specific hint.
  assert.match(err("0011 2233 4455 6677 8899 aabb 0800 4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7"), /Ethernet frame/);
  // Address errors.
  for (const [a, re] of [["", /Enter/], ["1.2.3", /four/], ["1.2.3.256", /above 255/], ["01.2.3.4", /leading zero/], ["1.2.3.-4", /not a number/], ["１.2.3.4", /not a number/]] as const) {
    const r = parseIpv4(a, "source");
    assert.ok(!r.ok && re.test(r.error), a);
  }
  // Length override out of range is an error, not a throw.
  const o = analyzeTransport({ source: "1.1.1.1", destination: "2.2.2.2", protocol: 17, segment: hex("0001 0002 0008 0000"), lengthOverride: 70000 });
  assert.ok(!o.ok);
  // A segment too large to fit in a datagram.
  const big = analyzeTransport({ source: "1.1.1.1", destination: "2.2.2.2", protocol: 17, segment: new Uint8Array(MAX_BYTES - 19) });
  assert.ok(!big.ok);
});


/* ---------------------------------------------------------------------------
   Second independent verifier. Reference values come from scapy 2.8.0, a
   separate implementation that builds and checksums real IPv4, TCP, UDP and
   ICMP packets (vectors/ipv4-checksum-scapy.json, generated by
   verify_gen_scapy.py with a fixed seed), and from RFC 1624 / RFC 1071 algebra.
   --------------------------------------------------------------------------- */

import { readFileSync as readVectors } from "node:fs";

test("verifier 2: 400 scapy packets and 45 byte strings agree", () => {
  const v = JSON.parse(
    readVectors(
      new URL("./fixtures/ipv4-checksum-scapy.json", import.meta.url).pathname,
      "utf8",
    ),
  );
  assert.equal(v.packets.length, 400);
  let transportChecked = 0;
  for (const p of v.packets) {
    const h = analyzeIpv4Header(hex(p.packet));
    assert.ok(h.ok, p.packet.slice(0, 40));
    if (!h.ok) continue;
    assert.equal(h.headerLength, p.ihl);
    assert.equal(h.computed, p.ip_chksum, `IPv4 ${p.packet.slice(0, 48)}`);
    assert.equal(h.valid, true);
    if (p.kind === "icmp") {
      const seg = hex(p.segment);
      assert.ok(analyzeGeneric(seg).selfVerifies);
      seg[2] = 0;
      seg[3] = 0;
      assert.equal(internetChecksum(seg), p.l4_chksum);
      continue;
    }
    // Pasting the segment and typing the addresses must match scapy.
    const direct = analyzeTransport({ source: p.src, destination: p.dst, protocol: p.proto, segment: hex(p.segment) });
    assert.ok(direct.ok && direct.transmitted === p.l4_chksum && direct.valid, `${p.kind} ${p.segment.slice(0, 40)}`);
    // Fragments (MF set) must not be offered as whole segments.
    const t = transportFromPacket(h);
    if (h.moreFragments) {
      assert.equal(t, null);
    } else {
      assert.ok(t);
      if (!t) continue;
      const r = analyzeTransport(t);
      assert.ok(r.ok && r.transmitted === p.l4_chksum && r.valid && r.warnings.length === 0);
      transportChecked++;
    }
  }
  assert.ok(transportChecked > 150);
  for (const g of v.generic) {
    const bytes = g.hex === "" ? new Uint8Array(0) : hex(g.hex);
    assert.equal(internetChecksum(bytes), g.checksum, `generic ${bytes.length} bytes`);
  }
});

/* RFC 1624 is how NAT fixes the TCP checksum after rewriting the source
   address: two words change, so equation 3 is applied twice. It must agree
   with a full recompute over the new pseudo-header. */
test("verifier 2: NAT address rewrite via RFC 1624 equals a full recompute", () => {
  const seg = hex("c350 0050 0000 0001 0000 0000 6002 ffff 0000 0000 0204 05b4");
  const before = analyzeTransport({ source: "10.0.0.1", destination: "10.0.0.2", protocol: 6, segment: seg });
  const after = analyzeTransport({ source: "203.0.113.77", destination: "10.0.0.2", protocol: 6, segment: seg });
  assert.ok(before.ok && after.ok);
  if (!before.ok || !after.ok) return;
  let hc = incrementalUpdate(before.computed, 0x0a00, (203 << 8) | 0);
  hc = incrementalUpdate(hc, 0x0001, (113 << 8) | 77);
  assert.equal(hc, after.computed);
  // m equal to m' leaves any checksum other than 0xffff unchanged.
  for (const c of [0x0000, 0x1234, 0xfffe]) assert.equal(incrementalUpdate(c, 0xabcd, 0xabcd), c);
});

/* Linux transmit offload leaves the folded pseudo-header sum in the field
   (CHECKSUM_PARTIAL). Such a capture fails verification, and its field equals
   the pseudo-header sum the tool reports, which is the offload signature. */
test("verifier 2: offload signature equals the pseudo-header sum", () => {
  const ph = buildPseudoHeader([192, 168, 1, 1], [192, 168, 1, 2], 17, 10);
  const partial = sumBytes(ph).folded;
  const seg = hex("1234 0035 000a 0000 6869");
  seg[6] = partial >> 8;
  seg[7] = partial & 0xff;
  const r = analyzeTransport({ source: "192.168.1.1", destination: "192.168.1.2", protocol: 17, segment: seg });
  assert.ok(r.ok && !r.valid && r.existing === r.pseudoSum && r.computed === 0x01b4);
});

test("verifier 2: singular and plural byte counts in warnings", () => {
  const one = analyzeIpv4Header(hex("4500 0015 0000 4000 4011 0000 c0a8 0101 c0a8 0102 ff"));
  assert.ok(one.ok && one.warnings.some((w) => w.startsWith("1 byte after the header was not summed")));
  const mismatch = analyzeIpv4Header(hex("4500 0015 0000 4000 4011 0000 c0a8 0101 c0a8 0102 ff ee"));
  assert.ok(mismatch.ok && mismatch.warnings.some((w) => w.includes("2 bytes after the header were") && w.includes("payload is 1 byte.")));
  const udp1 = analyzeTransport({ source: "1.1.1.1", destination: "2.2.2.2", protocol: 17, segment: hex("0001 0002 0001 0000") });
  assert.ok(udp1.ok && udp1.warnings.some((w) => w.includes("says 1 byte,")));
});

test("verifier 2: boundary headers and dumps", () => {
  // Every byte 0xff except version/IHL: the reserved flag warns, MF and an
  // offset of 8191 are decoded, and the result still verifies once corrected.
  const allOnes = analyzeIpv4Header(hex("4fff ffff ffff ffff ffff ffff" + "ff".repeat(48)));
  assert.ok(allOnes.ok);
  if (!allOnes.ok) return;
  assert.equal(allOnes.fragmentOffset, 8191);
  assert.ok(allOnes.moreFragments && allOnes.dontFragment && allOnes.reservedFlag);
  assert.equal(allOnes.afterTtlDecrement !== null, true);
  assert.ok(verifies(allOnes.corrected));
  assert.equal(transportFromPacket(allOnes), null);
  // A 4,096-line dump with running offsets parses, and offsets are not data.
  const lines: string[] = [];
  for (let i = 0; i < 4096; i++) lines.push(`${(i * 16).toString(16).padStart(4, "0")}   ${"ab ".repeat(16).trim()}`);
  const big = parseHex(lines.join("\n"));
  // 4,096 lines of 16 bytes is 65,536 bytes, one over the cap.
  assert.ok(!big.ok && big.error.includes("65,536 bytes") && big.error.includes("65,535"));
  const fits = parseHex(lines.slice(0, 4095).join("\n"));
  assert.ok(fits.ok && fits.bytes.length === 65520 && fits.bytes.every((b) => b === 0xab));
  // tcpdump -xx style with leading tab and CRLF line ends.
  const crlf = parseHex("\t0x0000:  4500 0014 0000 0000 4006 0000\r\n\t0x000c:  0a00 0001 0a00 0002\r\n");
  assert.ok(crlf.ok && crlf.bytes.length === 20);
});

test("verifier 2: transport inputs at the limits", () => {
  // Data offset 15 (60-byte header) but only 20 bytes pasted: warning, no throw.
  const r = analyzeTransport({ source: "1.1.1.1", destination: "2.2.2.2", protocol: 6, segment: hex("0001 0002 0000 0000 0000 0000 f002 0000 0000 0000") });
  assert.ok(r.ok && r.warnings.some((w) => w.includes("60 bytes")));
  // Largest segment that fits behind a 20-byte header, all zero: sum is the
  // pseudo-header alone.
  const max = analyzeTransport({ source: "0.0.0.0", destination: "0.0.0.0", protocol: 17, segment: new Uint8Array(65515) });
  assert.ok(max.ok);
  if (!max.ok) return;
  // Pseudo-header 0000 0000 0000 0000 0011 ffeb: 0x11 + 0xffeb = 0xfffc.
  assert.equal(max.pseudoSum, 0xfffc);
  assert.equal(max.computed, 0x0003);
  assert.ok(max.warnings.some((w) => w.includes("UDP length field says 0 bytes")));
  // Addresses: whitespace, empty octet, trailing dot, plus sign, hex octet.
  for (const a of ["1..2.3", "1.2.3.4.", "+1.2.3.4", "0x1.2.3.4", "1.2.3.4 5"]) {
    const p = parseIpv4(a, "source");
    assert.ok(!p.ok, a);
  }
});


/* ---------------------------------------------------------------------------
   Third independent verifier. Reference values come from a separate Python
   implementation that uses a different algorithm: because 2^16 = 1 mod
   0xffff, the ones' complement sum of the 16-bit words is the whole byte
   string read as one big integer, mod 0xffff (RFC 1071 section 2 algebra).
   That method reproduces the widely published tutorial header checksum
   0x442e below, which anchors it.
   --------------------------------------------------------------------------- */

test("verifier 3: published tutorial header 4500 0030 4422 4000 8006 ... = 0x442e", () => {
  const r = analyzeIpv4Header(hex("4500 0030 4422 4000 8006 0000 8c7c 19ac ae24 1e2b"));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.computed, 0x442e);
  assert.equal(r.source, "140.124.25.172");
  assert.equal(r.destination, "174.36.30.43");
  assert.equal(r.protocol, 6);
  assert.equal(r.ttl, 128);
  // TTL 128 -> 127 lowers the TTL/protocol word by 0x0100, so the checksum
  // rises by 0x0100 (RFC 1624); the full recompute in Python gives 0x452e.
  assert.equal(r.afterTtlDecrement, 0x452e);
  const after = analyzeIpv4Header(hex("4500 0030 4422 4000 7f06 0000 8c7c 19ac ae24 1e2b"));
  assert.ok(after.ok && after.computed === 0x452e);
});

test("verifier 3: Record Route option header (IHL 8) and an IHL 15 header of 0xff options", () => {
  const rr = analyzeIpv4Header(hex("48000028beef000001110000c6336409cb0071c8070b04c00002010000000000"));
  assert.ok(rr.ok && rr.headerLength === 32 && rr.computed === 0x8403 && rr.words.length === 16);
  const big = analyzeIpv4Header(
    hex("4fb8003cffff4000ff060000ffffffff00000000" + "ff".repeat(40)),
  );
  assert.ok(big.ok && big.headerLength === 60 && big.computed === 0x7104 && big.dscp === 46 && big.ecn === 0);
  assert.ok(big.ok && verifies(big.corrected));
});

test("verifier 3: TCP SYN with MSS, SACK-permitted, timestamps and window scale", () => {
  const seg = "d43101bbdeadbeef00000000a002faf000000000020405b40402080a010203040000000001030307";
  const t = analyzeTransport({ source: "192.0.2.1", destination: "198.51.100.7", protocol: 6, segment: hex(seg) });
  assert.ok(t.ok);
  if (!t.ok) return;
  assert.equal(t.computed, 0xe942);
  assert.equal(t.length, 40);
  assert.equal(toHexWords(t.pseudoHeader), "c000 0201 c633 6407 0006 0028");
  assert.equal(t.warnings.length, 0);
  // Words 12 to 19 of the summed buffer are TCP options (data offset 10).
  assert.equal(t.words[6 + 10].label, "TCP options");
  assert.equal(t.words[6 + 8].role, "checksum");
});

test("verifier 3: UDP DNS query and a one-byte UDP payload", () => {
  const dns = analyzeTransport({
    source: "10.1.1.1",
    destination: "8.8.8.8",
    protocol: 17,
    segment: hex("14e90035002500001a2b01000001000000000000076578616d706c6503636f6d0000010001"),
  });
  assert.ok(dns.ok && dns.computed === 0xe5db && dns.length === 37 && dns.udpNoChecksum && dns.warnings.length === 0);
  const one = analyzeTransport({ source: "172.16.0.1", destination: "172.16.0.2", protocol: 17, segment: hex("9c400009000900007f") });
  assert.ok(one.ok && one.computed === 0x8c6e && one.detail.padded);
  // Written back with the computed checksum, both verify.
  for (const r of [dns, one]) {
    if (!r.ok) continue;
    const again = analyzeTransport({ source: r === dns ? "10.1.1.1" : "172.16.0.1", destination: r === dns ? "8.8.8.8" : "172.16.0.2", protocol: 17, segment: r.corrected });
    assert.ok(again.ok && again.valid);
  }
});

test("verifier 3: ICMP echo reply and 255 bytes 01..ff in generic mode", () => {
  assert.equal(analyzeGeneric(hex("0000 0000 0001 000a 70696e67")).detail.checksum, 0x2124);
  const seq = new Uint8Array(255);
  for (let i = 0; i < 255; i++) seq[i] = i + 1;
  const g = analyzeGeneric(seq);
  assert.equal(g.detail.checksum, 0xc03f);
  assert.ok(g.detail.padded && g.words[127].role === "pad" && g.words[127].value === 0xff00);
});

test("verifier 3: every page example matches the Python reference", () => {
  const syn = analyzeTransport({ source: "10.0.0.1", destination: "10.0.0.2", protocol: 6, segment: hex("c350 0050 0000 0001 0000 0000 6002 ffff c082 0000 0204 05b4") });
  assert.ok(syn.ok && syn.computed === 0xc082 && syn.valid);
  const udp = analyzeTransport({ source: "192.168.1.1", destination: "192.168.1.2", protocol: 17, segment: hex("1234 0035 000a 01b4 6869") });
  assert.ok(udp.ok && udp.computed === 0x01b4 && udp.valid);
  const pkt = analyzeIpv4Header(hex("4500 001e 0000 4000 4011 b77b c0a8 0101 c0a8 0102 1234 0035 000a 01b4 6869"));
  assert.ok(pkt.ok && pkt.computed === 0xb77b && pkt.valid);
  const opt = analyzeIpv4Header(hex("46c0 0020 0000 4000 0102 4200 c000 0201 e000 0016 9404 0000"));
  assert.ok(opt.ok && opt.computed === 0x4200 && opt.valid);
});

test("verifier 3: separated groups must hold whole bytes; one-digit 0x bytes are padded", () => {
  // Joining "45 0 0" into 4500 would silently lose a byte.
  for (const bad of ["45 0 0", "4 5 0 0", "450 0", "45 00 0", "4500 003 c"]) {
    const r = parseHex(bad);
    assert.ok(!r.ok && /group/.test(r.error), bad);
  }
  // C arrays and Python escapes write a zero byte as 0x0 or \x0.
  assert.deepEqual(Array.from(hex("{0x45, 0x0, 0x0, 0x3c}".replace(/[{}]/g, ""))), [0x45, 0, 0, 0x3c]);
  assert.deepEqual(Array.from(hex("\\x45\\x0\\x00\\x3c")), [0x45, 0, 0, 0x3c]);
  assert.deepEqual(Array.from(hex("0x5")), [5]);
  // An unseparated stream and 16-bit words still work.
  assert.deepEqual(Array.from(hex("4500003c")), [0x45, 0, 0, 0x3c]);
  assert.deepEqual(Array.from(hex("4500 003c")), [0x45, 0, 0, 0x3c]);
  // A single odd stream keeps the count message.
  const odd = parseHex("45000");
  assert.ok(!odd.ok && /5 hex digits, an odd count/.test(odd.error));
  const one = parseHex("4");
  assert.ok(!one.ok && /1 hex digit, an odd count/.test(one.error));
  // A very long odd group is shortened in the message.
  const longOdd = parseHex("45 " + "a".repeat(1001));
  assert.ok(!longOdd.ok && longOdd.error.includes("aaaaaaaaaaaa...") && longOdd.error.length < 300);
});

test("verifier 3: Ethernet frames are recognized whatever the first MAC nibble", () => {
  const ip = "4500 0073 0000 4000 4011 b861 c0a8 0001 c0a8 00c7";
  const err = (t: string) => {
    const r = analyzeIpv4Header(hex(t));
    assert.ok(!r.ok, t);
    return (r as { error: string }).error;
  };
  // MAC starting 6x used to be reported as IPv6.
  assert.match(err(`6000 2233 4455 6677 8899 aabb 0800 ${ip}`), /Ethernet frame/);
  // MAC starting 4c parses as IHL 12 and is truncated; the hint is appended.
  assert.match(err(`4c00 2233 4455 6677 8899 aabb 0800 ${ip}`), /48 bytes.*Ethernet frame/);
  // MAC starting 45 parses as a 20-byte header that fails; a warning names the frame.
  const r = analyzeIpv4Header(hex(`4500 2233 4455 6677 8899 aabb 0800 ${ip}`));
  assert.ok(r.ok && !r.valid && r.warnings.some((w) => w.includes("Ethernet frame")));
  // A real IPv4 header with source 8.0.64.x is not misread as a frame.
  const real = analyzeIpv4Header(hex("4500 0014 0000 4000 4006 0000 0800 4001 0a00 0002"));
  assert.ok(real.ok && !real.warnings.some((w) => w.includes("Ethernet")));
  // A real IPv6 header is still named as IPv6.
  assert.match(err("6000 0000 0014 0640 2001 0db8 0000 0000 0000 0000 0000 0001"), /IPv6/);
});

test("verifier 3: adversarial input never throws", () => {
  const inputs = [
    "0x".repeat(1000),
    "\\x".repeat(1000),
    ":".repeat(399_999),
    "0x0x0x",
    "45\u0000",
    "\ud800",
    "4500\n".repeat(20000),
    "0000   45 00\n0002   00 14\n0004 zz",
    "ff ".repeat(65535),
    "ff ".repeat(65536),
  ];
  for (const text of inputs) {
    const r = parseHex(text);
    assert.equal(typeof r.ok, "boolean");
    if (r.ok) {
      analyzeGeneric(r.bytes);
      analyzeIpv4Header(r.bytes);
      analyzeTransport({ source: "1.2.3.4", destination: "5.6.7.8", protocol: 6, segment: r.bytes });
      analyzeTransport({ source: "1.2.3.4", destination: "5.6.7.8", protocol: 17, segment: r.bytes });
    } else {
      assert.ok(r.error.length > 0);
    }
  }
  // Every length override in range and a few out of range.
  const seg = hex("0001 0002 0008 0000");
  for (const lengthOverride of [0, 1, 8, 65535, -1, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = analyzeTransport({ source: "1.2.3.4", destination: "5.6.7.8", protocol: 17, segment: seg, lengthOverride });
    assert.equal(r.ok, Number.isInteger(lengthOverride) && lengthOverride >= 0 && lengthOverride <= 65535);
  }
});

test("UDP checksums cover exactly the declared length, not trailing bytes", () => {
  // The hand example: 10-byte datagram from 192.168.1.1 to 192.168.1.2, valid as pasted.
  const exact = hex("1234 0035 000a 01b4 6869");
  const base = analyzeTransport({ source: "192.168.1.1", destination: "192.168.1.2", protocol: 17, segment: exact });
  assert.ok(base.ok && base.valid);
  // The same datagram with non-zero capture bytes after it must still verify, and the
  // extra bytes must be reported as left out rather than summed.
  const padded = hex("1234 0035 000a 01b4 6869 dead beef 0102");
  const r = analyzeTransport({ source: "192.168.1.1", destination: "192.168.1.2", protocol: 17, segment: padded });
  assert.ok(r.ok);
  if (!r.ok || !base.ok) return;
  assert.equal(r.valid, true);
  assert.equal(r.computed, base.computed);
  assert.equal(r.length, 10);
  assert.ok(r.warnings.some((w) => w.includes("6 bytes after the declared length are not part of the datagram")));
  // A datagram shorter than its length field is still reported, not trimmed.
  const short = analyzeTransport({ source: "1.2.3.4", destination: "1.2.3.4", protocol: 17, segment: hex("0001 0002 0020 0000") });
  assert.ok(short.ok && short.warnings.some((w) => w.includes("UDP length field says 32 bytes, but 8 were pasted")));
  // TCP has no length field, so nothing is trimmed.
  const tcp = analyzeTransport({ source: "1.2.3.4", destination: "1.2.3.4", protocol: 6, segment: new Uint8Array(24) });
  assert.ok(tcp.ok && tcp.length === 24);
});

console.log(`ipv4-checksum-calculator: ${passed} tests passed`);
