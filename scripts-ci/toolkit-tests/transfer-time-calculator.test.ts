import assert from "node:assert/strict";
import {
  ETHERNET_FRAMING_BYTES,
  LINK_PRESETS,
  OVERHEAD_CHOICES,
  ethernetOverheadPct,
  formatBitRate,
  formatByteRateIEC,
  formatByteRateSI,
  formatBytesIEC,
  formatBytesSI,
  formatDuration,
  formatRational,
  groupDigits,
  parseDecimal,
  parseDuration,
  parseOverhead,
  parseRate,
  parseSize,
  requiredLineBps,
  transferSeconds,
} from "../../client/src/lib/toolkit/transfer-time-calculator";

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

/* parseDecimal */
test("decimal basics", () => {
  const p = parseDecimal("1.5");
  assert.equal(p.kind, "ok");
  if (p.kind === "ok") {
    assert.equal(p.value.m, 15n);
    assert.equal(p.value.e, -1);
    assert.equal(p.num, 1.5);
  }
  const q = parseDecimal("1e3");
  assert.ok(q.kind === "ok" && q.value.m === 1n && q.value.e === 3 && q.num === 1000);
  const g = parseDecimal("1,500.25");
  assert.ok(g.kind === "ok" && g.num === 1500.25);
  const dot = parseDecimal(".5");
  assert.ok(dot.kind === "ok" && dot.num === 0.5);
  const trail = parseDecimal("5.");
  assert.ok(trail.kind === "ok" && trail.num === 5);
  const zeros = parseDecimal("000.000");
  assert.ok(zeros.kind === "ok" && zeros.value.m === 0n && zeros.num === 0);
  const spaced = parseDecimal(" 1 000 000 ");
  assert.ok(spaced.kind === "ok" && spaced.num === 1e6);
  const plus = parseDecimal("+2");
  assert.ok(plus.kind === "ok" && plus.num === 2);
});

test("decimal rejects", () => {
  assert.equal(parseDecimal("").kind, "empty");
  assert.equal(parseDecimal("   ").kind, "empty");
  for (const bad of ["-1", "abc", "1,5", "1,50", "1.2.3", "0x10", "Infinity", "NaN", ".", "e5", "1e", "1e9999", "1".repeat(41)]) {
    const r = parseDecimal(bad);
    assert.equal(r.kind, "error", `expected error for ${JSON.stringify(bad)}`);
    if (r.kind === "error") assert.ok(!r.message.includes(String.fromCharCode(0x2014)));
  }
});

/* sizes, exact */
test("size units exact", () => {
  const gib = parseSize("1", "GiB");
  assert.ok(gib.kind === "ok" && gib.bytesNum === 1073741824);
  const gb = parseSize("1", "GB");
  assert.ok(gb.kind === "ok" && gb.bytesNum === 1e9);
  const kib = parseSize("1.5", "KiB");
  assert.ok(kib.kind === "ok" && kib.bytesNum === 1536);
  const frac = parseSize("0.1", "KiB");
  assert.ok(frac.kind === "ok");
  if (frac.kind === "ok") assert.equal(formatRational(frac.bytes).text, "102.4");
  const tib = parseSize("1.1", "TiB");
  assert.ok(tib.kind === "ok");
  if (tib.kind === "ok") assert.equal(formatRational(tib.bytes).text, "1,209,462,790,553.6");
  const tb = parseSize("1", "TiB");
  assert.ok(tb.kind === "ok" && tb.bytesNum === 2 ** 40);
});

test("size caps", () => {
  const cap = parseSize("1048576", "TiB"); // exactly 2^60
  assert.equal(cap.kind, "ok");
  const over = parseSize("1048577", "TiB");
  assert.equal(over.kind, "error");
  assert.equal(parseSize("1e-30", "B").kind, "error");
  assert.equal(parseSize("0.5", "B").kind, "error");
  // Zero is refused: a zero-byte transfer has no time and no rate to compare.
  assert.equal(parseSize("0", "GB").kind, "error");
  assert.equal(parseSize("0.000", "B").kind, "error");
  const oneByte = parseSize("0.001", "KB");
  assert.ok(oneByte.kind === "ok" && oneByte.bytesNum === 1);
  const cut = formatRational({ num: 1n, den: 10n ** 30n });
  assert.equal(cut.exact, false);
  assert.equal(cut.text, "0");
  assert.deepEqual(formatRational({ num: 1234567n, den: 1000n }), { text: "1,234.567", exact: true });
});

test("groupDigits", () => {
  assert.equal(groupDigits(0n), "0");
  assert.equal(groupDigits(999n), "999");
  assert.equal(groupDigits(1000n), "1,000");
  assert.equal(groupDigits(1073741824n), "1,073,741,824");
});

/* rates and durations */
test("rate parsing", () => {
  const r = parseRate("1", "Gbps");
  assert.ok(r.kind === "ok" && r.bps === 1e9);
  assert.equal(parseRate("0", "Mbps").kind, "error");
  assert.equal(parseRate("0.5", "bps").kind, "error");
  assert.equal(parseRate("1000001", "Gbps").kind, "error");
  const k = parseRate("56", "kbps");
  assert.ok(k.kind === "ok" && k.bps === 56000);
});

test("overhead parsing", () => {
  const empty = parseOverhead("");
  assert.ok(empty.kind === "ok" && empty.pct === 0);
  const pct = parseOverhead("5.07%");
  assert.ok(pct.kind === "ok" && pct.pct === 5.07);
  assert.equal(parseOverhead("100").kind, "error");
  assert.equal(parseOverhead("-1").kind, "error");
});

test("duration parsing", () => {
  const h = parseDuration("1", "h");
  assert.ok(h.kind === "ok" && h.seconds === 3600);
  const d = parseDuration("2", "d");
  assert.ok(d.kind === "ok" && d.seconds === 172800);
  assert.equal(parseDuration("0", "s").kind, "error");
  assert.equal(parseDuration("1e11", "s").kind, "error");
});

/* transfer math */
test("transfer reference values", () => {
  // 1 GB at 1 Gbps with no overhead: 8e9 bits / 1e9 = 8 s.
  close(transferSeconds(1e9, 1e9, 0), 8);
  // 1 GiB at 1 Gbps: 8 * 2^30 / 1e9.
  close(transferSeconds(2 ** 30, 1e9, 0), 8.589934592);
  // 1 TB at 100 Mbps: 8e12 / 1e8 = 80,000 s = 22 h 13 min 20 s.
  close(transferSeconds(1e12, 1e8, 0), 80000);
  assert.equal(formatDuration(80000), "22 h 13 min 20 s");
  // 50% overhead doubles the time.
  close(transferSeconds(1e9, 1e9, 50), 16);
  // Reverse: 1 TB in one hour needs 8e12 / 3600 bits per second.
  close(requiredLineBps(1e12, 3600, 0), 8e12 / 3600);
  close(requiredLineBps(1e12, 3600, 20), 8e12 / 3600 / 0.8);
  // Forward and reverse are inverses.
  const t = transferSeconds(4.7e9, 1e9, 5.07);
  close(requiredLineBps(4.7e9, t, 5.07), 1e9);
});

test("ethernet overhead", () => {
  assert.equal(ETHERNET_FRAMING_BYTES, 38);
  close(ethernetOverheadPct(1500, 40), (1 - 1460 / 1538) * 100);
  close(ethernetOverheadPct(1500, 52), (1 - 1448 / 1538) * 100);
  close(ethernetOverheadPct(9000, 40), (1 - 8960 / 9038) * 100);
  // 1 Gbps with timestamps lands near the 941 Mbps every speed test shows.
  const goodput = 1e9 * (1 - ethernetOverheadPct(1500, 52) / 100);
  assert.ok(goodput > 941e6 && goodput < 942e6);
  assert.deepEqual(
    OVERHEAD_CHOICES.map((c) => c.pct),
    ["0", "5.07", "5.85", "6.37", "0.86"],
  );
  assert.equal(LINK_PRESETS.length, 5);
  for (const p of LINK_PRESETS) {
    assert.equal(parseRate(p.value, p.unit).kind, "ok");
    assert.equal(parseOverhead(p.overhead).kind, "ok");
  }
});

/* formatting */
test("rate formatting", () => {
  assert.equal(formatBitRate(1e9), "1 Gbps");
  assert.equal(formatBitRate(949_285_000), "949.3 Mbps");
  assert.equal(formatBitRate(999_960), "1 Mbps");
  assert.equal(formatBitRate(0), "0 bps");
  assert.equal(formatByteRateSI(1e9), "125 MB/s");
  assert.equal(formatByteRateIEC(1e9), "119.2 MiB/s");
  assert.equal(formatBytesSI(1e12), "1 TB");
  assert.equal(formatBytesIEC(1e12), "931.3 GiB");
  assert.equal(formatBytesIEC(2 ** 30), "1 GiB");
  assert.equal(formatBitRate(Infinity), "too large to show");
});

test("duration formatting", () => {
  assert.equal(formatDuration(0), "0 s");
  assert.equal(formatDuration(8.589934592), "8.59 s");
  assert.equal(formatDuration(59.999), "1 min 0 s");
  assert.equal(formatDuration(125.3), "2 min 5 s");
  assert.equal(formatDuration(0.0123), "12.3 ms");
  assert.equal(formatDuration(0.9999), "1 s");
  assert.equal(formatDuration(2.5e-5), "25 µs");
  assert.equal(formatDuration(3e-9), "3 ns");
  assert.equal(formatDuration(3e-12), "under 1 ns");
  assert.equal(formatDuration(86399.6), "1 d 0 h 0 min");
  assert.equal(formatDuration(3 * 86400 + 4 * 3600), "3 d 4 h 0 min");
  assert.equal(formatDuration(365.25 * 86400 * 12.5), "12.5 years");
  assert.equal(formatDuration(Infinity), "longer than can be shown");
  assert.equal(formatDuration(NaN), "longer than can be shown");
});

/* ---------------------------------------------- verifier: independent cases */

test("verifier: worked examples", () => {
  // A 4.7 GB DVD image over 1 Gbps at the raw line rate: 4.7e9 x 8 / 1e9 = 37.6 s.
  const dvd = parseSize("4.7", "GB");
  assert.ok(dvd.kind === "ok");
  if (dvd.kind === "ok") {
    close(transferSeconds(dvd.bytesNum, 1e9, 0), 37.6);
    assert.equal(formatDuration(transferSeconds(dvd.bytesNum, 1e9, 0)), "37.6 s");
    // The gigabit fiber preset (940 Mbps of payload): exactly 40 s.
    close(transferSeconds(dvd.bytesNum, 940e6, 0), 40);
  }
  // 1 MB over a 56 kbps modem: 8e6 / 56,000 = 142.857 s = 2 min 23 s.
  close(transferSeconds(1e6, 56e3, 0), 8e6 / 56e3);
  assert.equal(formatDuration(transferSeconds(1e6, 56e3, 0)), "2 min 23 s");
  // 1 TiB over 10 GbE raw: 2^40 x 8 / 1e10 = 879.609 s = 14 min 40 s.
  close(transferSeconds(2 ** 40, 1e10, 0), 879.6093022208);
  assert.equal(formatDuration(879.6093022208), "14 min 40 s");
  // The notes' investigation example: 3 GB in five minutes is 80 Mbps of payload.
  close(requiredLineBps(3e9, 300, 0), 80e6);
  assert.equal(formatBitRate(requiredLineBps(3e9, 300, 0)), "80 Mbps");
});

test("verifier: units and prefixes", () => {
  // A 1 TB drive is 931.32 GiB (10^12 / 2^30).
  assert.equal(formatBytesIEC(1e12, 5), "931.32 GiB");
  // The SI/IEC gap per prefix: 2.4, 4.86, 7.37, 9.95 percent.
  const gap = (u: "KiB" | "MiB" | "GiB" | "TiB", si: "KB" | "MB" | "GB" | "TB") => {
    const a = parseSize("1", u);
    const b = parseSize("1", si);
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("parse");
    return (a.bytesNum / b.bytesNum - 1) * 100;
  };
  close(gap("KiB", "KB"), 2.4);
  close(gap("MiB", "MB"), 4.8576);
  close(gap("GiB", "GB"), 7.3741824);
  close(gap("TiB", "TB"), 9.9511627776);
  // USB 3.2 Gen 1: 5 Gbit/s less 20 percent for 8b/10b is 4 Gbit/s, 500 MB/s.
  const usb = LINK_PRESETS.find((p) => p.id === "usb3")!;
  assert.equal(usb.overhead, "20");
  assert.equal(formatByteRateSI(5e9 * 0.8), "500 MB/s");
  // Fast Ethernet with IPv4/TCP framing: 100 Mbps x 1460 / 1538 = 94.93 Mbps.
  const fe = LINK_PRESETS.find((p) => p.id === "fast-ethernet")!;
  close(1e8 * (1 - Number(fe.overhead) / 100), 94.93e6, 1e-12);
  assert.equal(formatBitRate(1e8 * (1460 / 1538)), "94.93 Mbps");
  // 10 GbE at 1500 MTU, overhead 5.07 percent; jumbo frames 0.86.
  close(ethernetOverheadPct(1500, 60), (1 - 1440 / 1538) * 100);
});

test("verifier: boundaries and malformed input", () => {
  // Underflowing exponents are not zero: they get the minimum message.
  const tiny = parseRate("1e-400", "Gbps");
  assert.ok(tiny.kind === "error" && tiny.message.includes("slowest"));
  const zr = parseRate("0.0", "Gbps");
  assert.ok(zr.kind === "error" && zr.message.includes("greater than zero"));
  const td = parseDuration("1e-400", "s");
  assert.ok(td.kind === "error" && td.message.includes("shortest"));
  assert.equal(parseSize("1e-400", "TiB").kind, "error");
  // A lone percent sign is an error, not a silent blank.
  assert.equal(parseOverhead("%").kind, "error");
  assert.equal(parseOverhead(" % ").kind, "error");
  const sp = parseOverhead("5 %");
  assert.ok(sp.kind === "ok" && sp.pct === 5);
  assert.equal(parseOverhead("99.9").kind, "ok");
  assert.equal(parseOverhead("99.91").kind, "error");
  // Non-ASCII digits, zero-width characters and other junk are refused.
  for (const bad of ["\u0661\u0662", "\uFF11", "1\u200B0", "1e+", "--1", "1..2", "0b101", "1,2345", "1 e", "\u{1F600}", "1/2", "1%"]) {
    const r = parseDecimal(JSON.parse(`"${bad}"`));
    assert.equal(r.kind, "error", `expected error for ${bad}`);
  }
  // Exactly at the rate caps.
  assert.equal(parseRate("1", "bps").kind, "ok");
  assert.equal(parseRate("1000000", "Gbps").kind, "ok");
  assert.equal(parseRate("1000000.001", "Gbps").kind, "error");
  assert.equal(parseDuration("1", "us" as never).kind, "ok"); // unknown unit falls back to seconds
  assert.equal(parseDuration("1e10", "s").kind, "ok");
  assert.equal(parseDuration("0.000001", "s").kind, "ok");
  assert.equal(parseDuration("0.0000009", "s").kind, "error");
});

test("verifier: duration rounding edges", () => {
  assert.equal(formatDuration(0.0009997), "1 ms");
  assert.equal(formatDuration(9.997e-7), "1 µs");
  assert.equal(formatDuration(9.994e-7), "999 ns");
  assert.equal(formatDuration(365.25 * 86400), "1 year");
  assert.equal(formatDuration(365.25 * 86400 * 2), "2 years");
  assert.equal(formatDuration(3600), "1 h 0 min 0 s");
  // The largest possible answer: 2^60 bytes at 1 bps with 99.9 percent overhead.
  const worst = transferSeconds(2 ** 60, 1, 99.9);
  assert.ok(Number.isFinite(worst));
  assert.ok(formatDuration(worst).endsWith("years"));
  const fastest = requiredLineBps(2 ** 60, 1e-6, 99.9);
  assert.ok(!formatBitRate(fastest).includes("NaN"));
});

test("verifier: fuzz never throws", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const alphabet = "0123456789.,eE+- _%x\u00a0\u2009abc\u0661";
  const alpha = JSON.parse(`"${alphabet}"`) as string;
  const units = ["B", "KB", "KiB", "MB", "MiB", "GB", "GiB", "TB", "TiB"] as const;
  for (let i = 0; i < 20000; i++) {
    const len = Math.floor(rnd() * 45);
    let text = "";
    for (let j = 0; j < len; j++) text += alpha[Math.floor(rnd() * alpha.length)];
    const size = parseSize(text, units[i % units.length]);
    const rate = parseRate(text, (["bps", "kbps", "Mbps", "Gbps"] as const)[i % 4]);
    const over = parseOverhead(text);
    const dur = parseDuration(text, (["s", "min", "h", "d"] as const)[i % 4]);
    for (const r of [size, rate, over, dur]) {
      assert.ok(["ok", "error", "empty"].includes(r.kind));
      if (r.kind === "error") assert.ok(r.message.length > 0 && !r.message.includes("\u2014"));
    }
    if (size.kind === "ok" && rate.kind === "ok") {
      const t = transferSeconds(size.bytesNum, rate.bps, over.kind === "ok" ? over.pct : 0);
      assert.ok(Number.isFinite(t) && t > 0, `bad time for ${JSON.stringify(text)}`);
      const shown = formatDuration(t);
      assert.ok(!/NaN|undefined|Infinity/.test(shown));
      assert.ok(!/NaN|undefined/.test(formatRational(size.bytes).text));
    }
  }
});

console.log(`transfer-time-calculator: ${passed} tests passed`);
