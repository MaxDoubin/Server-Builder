import assert from "node:assert/strict";
import {
  MATHIS_C_DELAYED_ACK,
  MATHIS_C_EVERY_SEGMENT,
  MAX_SCALED_WINDOW,
  MAX_UNSCALED_WINDOW,
  PATH_PRESETS,
  bdpBits,
  bindingCeiling,
  ceilBytes,
  decimalToNumber,
  mathisThroughputBps,
  parseBandwidth,
  parseLossPct,
  parseMss,
  parseRtt,
  parseWindow,
  requiredWindowShift,
  windowCoversBdp,
  windowFieldFor,
  windowThroughputBps,
} from "../../client/src/lib/toolkit/bandwidth-delay-product";
import type { RateUnit } from "../../client/src/lib/toolkit/transfer-time-calculator";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}
const close = (a: number, b: number, rel = 1e-12) =>
  assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} != ${b}`);

function bdp(bw: string, bwUnit: RateUnit, rtt: string, rttUnit: "us" | "ms" | "s") {
  const b = parseBandwidth(bw, bwUnit);
  const r = parseRtt(rtt, rttUnit);
  assert.ok(b.kind === "ok" && r.kind === "ok");
  if (b.kind !== "ok" || r.kind !== "ok") throw new Error("unreachable");
  const bits = bdpBits(b.exact, r.exact);
  return { bits, bitsNum: decimalToNumber(bits), bytes: ceilBytes(bits) };
}

test("constants from RFC 7323 and RFC 9293", () => {
  assert.equal(MAX_UNSCALED_WINDOW, 65535);
  assert.equal(MAX_SCALED_WINDOW, 1_073_725_440);
  assert.equal(MAX_SCALED_WINDOW, 2 ** 30 - 2 ** 14);
  close(MATHIS_C_EVERY_SEGMENT, 1.224744871391589);
  close(MATHIS_C_DELAYED_ACK, 0.8660254037844386);
});

test("BDP reference values", () => {
  // 1 Gbps x 100 ms = 10^8 bits = 12,500,000 bytes.
  const a = bdp("1", "Gbps", "100", "ms");
  assert.equal(a.bitsNum, 1e8);
  assert.equal(a.bytes, 12_500_000n);
  // 10 Gbps x 200 ms = 2 x 10^9 bits = 250,000,000 bytes.
  assert.equal(bdp("10", "Gbps", "200", "ms").bytes, 250_000_000n);
  // 100 Mbps x 1 ms = 100,000 bits = 12,500 bytes.
  assert.equal(bdp("100", "Mbps", "1", "ms").bytes, 12_500n);
  // 0.1 x 0.1 must not pick up a binary rounding error before the ceiling.
  assert.equal(bdp("0.1", "Gbps", "0.1", "s").bytes, 1_250_000n);
  // 1 bps x 1 us = 1e-6 bits: still a whole byte of window.
  assert.equal(bdp("1", "bps", "1", "us").bytes, 1n);
  // Same value through different units.
  assert.equal(bdp("1000", "Mbps", "0.07", "s").bytes, bdp("1", "Gbps", "70000", "us").bytes);
  assert.equal(bdp("1", "Gbps", "70", "ms").bytes, 8_750_000n);
});

test("ceilBytes rounds up exactly", () => {
  assert.equal(ceilBytes({ m: 8n, e: 0 }), 1n);
  assert.equal(ceilBytes({ m: 9n, e: 0 }), 2n);
  assert.equal(ceilBytes({ m: 0n, e: 0 }), 0n);
  assert.equal(ceilBytes({ m: 1n, e: 3 }), 125n);
  assert.equal(ceilBytes({ m: 1n, e: -3 }), 1n);
  assert.equal(ceilBytes({ m: 524288n, e: 0 }), 65536n);
});

test("window scale boundaries", () => {
  assert.equal(requiredWindowShift(0n), 0);
  assert.equal(requiredWindowShift(65535n), 0);
  assert.equal(requiredWindowShift(65536n), 1);
  assert.equal(requiredWindowShift(131070n), 1);
  assert.equal(requiredWindowShift(131071n), 2);
  // 12.5 MB needs 2^8: 65,535 x 128 = 8,388,480 is short, x 256 = 16,776,960 covers.
  assert.equal(requiredWindowShift(12_500_000n), 8);
  assert.equal(requiredWindowShift(250_000_000n), 12);
  assert.equal(requiredWindowShift(BigInt(MAX_SCALED_WINDOW)), 14);
  assert.equal(requiredWindowShift(BigInt(MAX_SCALED_WINDOW) + 1n), null);
  // 100 Gbps x 100 ms = 1.25 GB, larger than any TCP window.
  assert.equal(requiredWindowShift(bdp("100", "Gbps", "100", "ms").bytes), null);
  // 1 Mbps x 524.28 ms is exactly 65,535 bytes: the unscaled limit.
  assert.equal(bdp("1", "Mbps", "524.28", "ms").bytes, 65535n);
  assert.equal(bdp("1", "Mbps", "524.288", "ms").bytes, 65536n);
});

test("window field", () => {
  assert.equal(windowFieldFor(12_500_000n, 8), 48829n); // ceil(12,500,000 / 256)
  assert.equal(windowFieldFor(65535n, 0), 65535n);
  assert.equal(windowFieldFor(256n, 8), 1n);
  assert.equal(windowFieldFor(257n, 8), 2n);
});

test("window-limited throughput", () => {
  // The classic: 65,535 bytes per 100 ms = 5,242,800 bits per second.
  close(windowThroughputBps(65535, 0.1), 5_242_800);
  close(windowThroughputBps(65535, 0.07), (65535 * 8) / 0.07);
  close(windowThroughputBps(12_500_000, 0.1), 1e9);
});

test("Mathis estimate", () => {
  // MSS 1460, RTT 100 ms, p = 1e-4: 116,800 bps x sqrt(1.5) / 0.01.
  close(mathisThroughputBps(1460, 0.1, 1e-4)!, 11_680_000 * Math.sqrt(1.5));
  assert.ok(Math.abs(mathisThroughputBps(1460, 0.1, 1e-4)! - 14_305_020.1) < 1);
  close(mathisThroughputBps(1460, 0.1, 1e-4, MATHIS_C_DELAYED_ACK)!, 11_680_000 * Math.sqrt(0.75));
  // Quartering the loss doubles the estimate.
  close(mathisThroughputBps(1460, 0.05, 0.0025)! * 2, mathisThroughputBps(1460, 0.05, 0.0025 / 4)!);
  assert.equal(mathisThroughputBps(1460, 0.1, 0), null);
});

test("binding ceiling", () => {
  assert.deepEqual(bindingCeiling(1e9, 2e9, null), { ceiling: "link", bps: 1e9 });
  assert.deepEqual(bindingCeiling(1e9, 5e6, null), { ceiling: "window", bps: 5e6 });
  assert.deepEqual(bindingCeiling(1e9, 5e8, 2e7), { ceiling: "loss", bps: 2e7 });
});

test("parsers", () => {
  assert.equal(parseRtt("0", "ms").kind, "error");
  assert.equal(parseRtt("0.5", "us").kind, "error");
  assert.equal(parseRtt("61", "s").kind, "error");
  const r = parseRtt("250", "us");
  assert.ok(r.kind === "ok" && Math.abs(r.seconds - 0.00025) < 1e-15);
  assert.equal(parseBandwidth("0", "Gbps").kind, "error");
  assert.equal(parseBandwidth("2", "Pbps" as RateUnit).kind, "ok"); // unknown unit falls back, never throws

  const w = parseWindow("64", "KiB");
  assert.ok(w.kind === "ok" && w.bytes === 65536 && !w.clamped);
  const huge = parseWindow("1e30", "MiB");
  assert.ok(huge.kind === "ok" && huge.bytes === MAX_SCALED_WINDOW && huge.clamped);
  const exact = parseWindow("1073725440", "B");
  assert.ok(exact.kind === "ok" && exact.bytes === MAX_SCALED_WINDOW && !exact.clamped);
  const big = parseWindow("2", "GiB" as never);
  assert.ok(big.kind === "ok" && big.bytes === MAX_SCALED_WINDOW && big.clamped);
  const f = parseWindow("1.5", "B");
  assert.ok(f.kind === "ok" && f.bytes === 1 && f.truncated);
  assert.equal(parseWindow("0.4", "B").kind, "error");

  const m = parseMss("1460");
  assert.ok(m.kind === "ok" && m.bytes === 1460);
  for (const bad of ["0", "65496", "1460.5", "abc", "-1"]) assert.equal(parseMss(bad).kind, "error");
  assert.equal(parseMss("").kind, "empty");

  const l = parseLossPct("0.01%");
  assert.ok(l.kind === "ok" && Math.abs(l.fraction - 1e-4) < 1e-18);
  assert.equal(parseLossPct("100").kind, "error");
  assert.equal(parseLossPct("").kind, "empty");
});

test("presets parse", () => {
  for (const p of PATH_PRESETS) {
    assert.equal(parseBandwidth(p.bandwidth, p.bandwidthUnit).kind, "ok");
    assert.equal(parseRtt(p.rtt, p.rttUnit).kind, "ok");
  }
  const research = PATH_PRESETS.find((p) => p.id === "research")!;
  assert.equal(requiredWindowShift(bdp(research.bandwidth, research.bandwidthUnit, research.rtt, research.rttUnit).bytes), null);
});

/* ---------------------------------------------- verifier: independent cases */

test("verifier: preset paths, exact BDP and RFC 7323 shift", () => {
  // Each expected shift is the smallest s with 65,535 x 2^s >= BDP bytes.
  const cases: [string, RateUnit, string, "us" | "ms" | "s", bigint, number | null, bigint | null][] = [
    ["1", "Gbps", "0.5", "ms", 62_500n, 0, 62_500n],
    ["1", "Gbps", "20", "ms", 2_500_000n, 6, 39_063n], // ceil(2,500,000 / 64)
    ["1", "Gbps", "70", "ms", 8_750_000n, 8, 34_180n], // ceil(8,750,000 / 256)
    ["10", "Gbps", "75", "ms", 93_750_000n, 11, 45_777n], // ceil(93,750,000 / 2048)
    ["100", "Mbps", "600", "ms", 7_500_000n, 7, 58_594n], // ceil(7,500,000 / 128)
    ["100", "Gbps", "150", "ms", 1_875_000_000n, null, null],
    // T1 (1.544 Mbps) at 60 ms: 92,640 bits = 11,580 bytes, no scaling needed.
    ["1.544", "Mbps", "60", "ms", 11_580n, 0, 11_580n],
    // 10 Gbps at 100 ms: 125,000,000 bytes; 65,535 x 2^11 = 134,215,680 covers it.
    ["10", "Gbps", "100", "ms", 125_000_000n, 11, 61_036n],
  ];
  for (const [bw, bu, rtt, ru, bytes, shift, field] of cases) {
    const r = bdp(bw, bu, rtt, ru);
    assert.equal(r.bytes, bytes, `${bw} ${bu} x ${rtt} ${ru}`);
    assert.equal(requiredWindowShift(r.bytes), shift, `shift for ${bw} ${bu} x ${rtt} ${ru}`);
    if (shift !== null) {
      const f = windowFieldFor(r.bytes, shift);
      assert.equal(f, field);
      assert.ok(f <= 65535n && f << BigInt(shift) >= r.bytes);
      if (shift > 0) assert.ok(65535n << BigInt(shift - 1) < r.bytes, "shift is minimal");
    }
  }
});

test("verifier: 1 Gbps unscaled boundary at 524.28 us", () => {
  // 65,535 x 8 / 1e9 = 524.28 us is the longest RTT an unscaled window fills at 1 Gbps.
  assert.equal(bdp("1", "Gbps", "524.28", "us").bytes, 65_535n);
  assert.equal(requiredWindowShift(bdp("1", "Gbps", "524.28", "us").bytes), 0);
  // 524.29 us is 65,536.25 bytes, rounded up to 65,537: needs a shift of 1.
  assert.equal(bdp("1", "Gbps", "524.29", "us").bytes, 65_537n);
  assert.equal(requiredWindowShift(65_537n), 1);
  // Unscaled window over 70 ms: 65,535 x 8 / 0.07 = 7,489,714.29 bps.
  close(windowThroughputBps(65535, 0.07), 7_489_714.285714285, 1e-12);
  // Largest scaled window over 100 ms: 1,073,725,440 x 8 / 0.1 = 85,898,035,200 bps.
  close(windowThroughputBps(MAX_SCALED_WINDOW, 0.1), 85_898_035_200);
});

test("verifier: window equal to the BDP binds on the link, not the window", () => {
  // Regression: 8,750,000 x 8 / 0.07 is 999,999,999.9999999 as a double.
  const r = bdp("1", "Gbps", "70", "ms");
  const rt = parseRtt("70", "ms");
  if (rt.kind !== "ok") throw new Error("parse");
  const wbps = windowThroughputBps(Number(r.bytes), rt.seconds);
  assert.ok(windowCoversBdp(Number(r.bytes), r.bytes));
  assert.deepEqual(bindingCeiling(1e9, wbps, null, windowCoversBdp(Number(r.bytes), r.bytes)), {
    ceiling: "link",
    bps: 1e9,
  });
  // One byte short and the window binds.
  assert.equal(windowCoversBdp(Number(r.bytes) - 1, r.bytes), false);
  const short = bindingCeiling(1e9, windowThroughputBps(8_749_999, rt.seconds), null, false);
  assert.equal(short.ceiling, "window");
  assert.ok(short.bps < 1e9);
  // Every whole-ms RTT from 1 to 2000 at 1 Gbps: matching the BDP never binds on the window.
  for (let ms = 1; ms <= 2000; ms++) {
    const x = bdp("1", "Gbps", String(ms), "ms");
    const rr = parseRtt(String(ms), "ms");
    if (rr.kind !== "ok") throw new Error("parse");
    const c = bindingCeiling(1e9, windowThroughputBps(Number(x.bytes), rr.seconds), null, windowCoversBdp(Number(x.bytes), x.bytes));
    assert.equal(c.ceiling, "link", `${ms} ms`);
  }
  // Loss still wins when it is lower than the link.
  assert.equal(bindingCeiling(1e9, 1e9, 2e7, true).ceiling, "loss");
  assert.equal(windowCoversBdp(NaN, 1n), false);
  assert.equal(windowCoversBdp(-5, 0n), false);
});

test("verifier: Mathis worked examples from the notes", () => {
  // 70 ms, 0.01 percent loss, MSS 1460: (11,680 / 0.07) x 1.2247 / 0.01 = 20.44 Mbps.
  close(mathisThroughputBps(1460, 0.07, 1e-4)!, 20_435_742.99693394, 1e-12);
  // Same loss on a 0.5 ms LAN: 2.86 Gbps, above a gigabit link, so the link binds.
  const lan = mathisThroughputBps(1460, 0.0005, 1e-4)!;
  close(lan, 2_861_004_019.5707517, 1e-12);
  assert.equal(bindingCeiling(1e9, 1e12, lan, true).ceiling, "link");
  // Halving the loss gains sqrt(2), about 41 percent.
  close(mathisThroughputBps(1460, 0.07, 0.5e-4)! / mathisThroughputBps(1460, 0.07, 1e-4)!, Math.SQRT2);
  // Delayed ACKs: C ratio sqrt(3/4) / sqrt(3/2) = 1 / sqrt(2).
  close(MATHIS_C_DELAYED_ACK / MATHIS_C_EVERY_SEGMENT, Math.SQRT1_2);
  assert.equal(mathisThroughputBps(1460, 0, 1e-4), null);
});

test("verifier: parser boundaries and malformed input", () => {
  const tiny = parseBandwidth("1e-400", "Gbps");
  assert.ok(tiny.kind === "error" && tiny.message.includes("slowest"));
  const zero = parseBandwidth("0.000", "Mbps");
  assert.ok(zero.kind === "error" && zero.message.includes("greater than zero"));
  const tinyRtt = parseRtt("1e-400", "s");
  assert.ok(tinyRtt.kind === "error" && tinyRtt.message.includes("shortest"));
  assert.equal(parseRtt("60", "s").kind, "ok");
  assert.equal(parseRtt("60000.001", "ms").kind, "error");
  assert.equal(parseRtt("1", "us").kind, "ok");
  assert.equal(parseBandwidth("1", "bps").kind, "ok");
  assert.equal(parseBandwidth("1000001", "Gbps").kind, "error");
  // A lone percent sign is an error, not a silent skip.
  assert.equal(parseLossPct("%").kind, "error");
  assert.equal(parseLossPct("   ").kind, "empty");
  const z = parseLossPct("0");
  assert.ok(z.kind === "ok" && z.fraction === 0);
  assert.equal(parseLossPct("99.999").kind, "ok");
  assert.equal(parseLossPct("-1").kind, "error");
  // Window: 64 KiB is one byte more than the unscaled maximum.
  const w = parseWindow("64", "KiB");
  assert.ok(w.kind === "ok" && w.bytes === MAX_UNSCALED_WINDOW + 1);
  assert.equal(parseWindow("1e400", "B").kind, "error");
  assert.equal(parseWindow("", "B").kind, "empty");
  for (const bad of ["1\u200B", "\uFF11", "\u0661", "1e", "0x40", "64KiB"]) {
    const t = JSON.parse(`"${bad}"`) as string;
    assert.equal(parseWindow(t, "B").kind, "error", bad);
    assert.equal(parseBandwidth(t, "Mbps").kind, "error", bad);
    assert.equal(parseMss(t).kind, "error", bad);
  }
  assert.equal(parseMss("65495").kind, "ok");
  assert.equal(parseMss(" 1460 ").kind, "ok");
  assert.equal(parseMss("1460000").kind, "error");
});

test("verifier: fuzz never throws", () => {
  let seed = 987654;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const alpha = JSON.parse(`"0123456789.,eE+- _%x\u00a0abc\u0661"`) as string;
  for (let i = 0; i < 20000; i++) {
    const len = Math.floor(rnd() * 45);
    let text = "";
    for (let j = 0; j < len; j++) text += alpha[Math.floor(rnd() * alpha.length)];
    const b = parseBandwidth(text, (["bps", "kbps", "Mbps", "Gbps"] as const)[i % 4]);
    const r = parseRtt(text, (["us", "ms", "s"] as const)[i % 3]);
    const w = parseWindow(text, (["B", "KB", "KiB", "MB", "MiB"] as const)[i % 5]);
    const l = parseLossPct(text);
    const m = parseMss(text);
    for (const x of [b, r, w, l, m]) assert.ok(["ok", "error", "empty"].includes(x.kind));
    if (b.kind === "ok" && r.kind === "ok") {
      const bits = bdpBits(b.exact, r.exact);
      const need = ceilBytes(bits);
      assert.ok(need >= 1n);
      const shift = requiredWindowShift(need);
      if (shift !== null) assert.ok(windowFieldFor(need, shift) <= 65535n);
      assert.ok(Number.isFinite(decimalToNumber(bits)));
    }
  }
});

console.log(`bandwidth-delay-product: ${passed} tests passed`);
