import assert from "node:assert/strict";
import {
  DRIVE_LABELS,
  exactDecimal,
  explorerFigure,
  lsblkFigure,
  fixed,
  formatRational,
  idemaSectors,
  inUnit,
  largestUnit,
  parseQuantity,
  percent,
  plainDecimal,
  powerOfTwoBytes,
  prefixGaps,
  LINK_SPEEDS,
  TCP_PAYLOAD_PER_PACKET,
  TOOL_UNITS,
  WIRE_BYTES_PER_PACKET,
  tcpPayloadRate,
  truncatedFixed,
  unitBySymbol,
  UNITS,
  type Rational,
} from "../../client/src/lib/toolkit/byte-unit-converter";

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

function q(raw: string) {
  const r = parseQuantity(raw);
  assert.equal(r.kind, "ok", `${raw}: ${r.kind === "error" ? r.message : r.kind}`);
  if (r.kind !== "ok") throw new Error();
  return r;
}
function bad(raw: string) {
  const r = parseQuantity(raw);
  assert.equal(r.kind, "error", `${raw} should fail`);
  if (r.kind !== "error") throw new Error();
  return r.message;
}
const U = (s: string) => {
  const u = unitBySymbol(s);
  assert.ok(u, s);
  return u!;
};
const exact = (r: Rational, sym: string) => plainDecimal(inUnit(r, U(sym)));

t("unit table sizes (IEC 80000-13)", () => {
  assert.equal(UNITS.length, 2 + 6 * 4);
  assert.equal(U("b").bits, 1n);
  assert.equal(U("B").bits, 8n);
  assert.equal(U("kB").bits, 8000n);
  assert.equal(U("KiB").bits, 8192n);
  assert.equal(U("GB").bits, 8n * 10n ** 9n);
  assert.equal(U("GiB").bits, 8n * 1073741824n);
  assert.equal(U("PiB").bits, 8n * 2n ** 50n);
  assert.equal(U("EiB").bits, 8n * 2n ** 60n);
  assert.equal(U("Mbit").bits, 10n ** 6n);
  assert.equal(U("Gibit").bits, 2n ** 30n);
});

t("1 TB = 931.322574615478515625 GiB exactly", () => {
  const r = q("1 TB");
  assert.equal(r.unit.symbol, "TB");
  assert.equal(exact(r.bits, "B"), "1000000000000");
  assert.equal(exact(r.bits, "b"), "8000000000000");
  assert.equal(exact(r.bits, "GiB"), "931.322574615478515625");
  assert.equal(exact(r.bits, "TiB"), "0.9094947017729282379150390625");
  assert.equal(exact(r.bits, "MiB"), "953674.31640625");
  assert.equal(exact(r.bits, "KiB"), "976562500");
  assert.equal(exact(r.bits, "PB"), "0.001");
  // cross-check with a float for sanity on a few digits
  assert.ok(Math.abs(1e12 / 2 ** 30 - 931.3225746154785) < 1e-9);
});

t("1.5 GiB and 500GB", () => {
  const a = q("1.5 GiB");
  assert.equal(exact(a.bits, "B"), "1610612736");
  assert.equal(exact(a.bits, "MiB"), "1536");
  assert.equal(exact(a.bits, "GB"), "1.610612736");
  const b = q("500GB");
  assert.equal(exact(b.bits, "B"), "500000000000");
  assert.equal(exact(b.bits, "GiB"), "465.6612873077392578125");
});

t("bits vs bytes, and rates", () => {
  const r = q("100 Mbps");
  assert.equal(r.perSecond, true);
  assert.equal(r.unit.symbol, "Mbit");
  assert.equal(exact(r.bits, "MB"), "12.5");
  assert.equal(exact(r.bits, "MiB"), "11.920928955078125");
  const g = q("1 Gbps");
  assert.equal(exact(g.bits, "MB"), "125");
  assert.equal(q("12.5 MB/s").perSecond, true);
  assert.equal(exact(q("12.5 MB/s").bits, "Mbit"), "100");
  assert.equal(q("1 Gbit/s").unit.symbol, "Gbit");
  assert.equal(q("10 mbps").unit.symbol, "Mbit");
  assert.equal(q("10 kbps").unit.symbol, "kbit");
  assert.equal(q("10 Kibps").unit.symbol, "Kibit");
  assert.equal(q("10 MBps").unit.symbol, "MB");
  assert.equal(q("1 Gb").unit.symbol, "Gbit");
  assert.equal(q("1 kb").unit.symbol, "kbit");
  assert.equal(q("8 b").unit.symbol, "b");
  assert.equal(exact(q("8 b").bits, "B"), "1");
  assert.equal(q("1 megabit per second").perSecond, true);
});

t("spelled and odd-case forms", () => {
  assert.equal(q("2 gigabytes").unit.symbol, "GB");
  assert.equal(q("2 Gibibytes").unit.symbol, "GiB");
  assert.equal(q("3 megabits").unit.symbol, "Mbit");
  assert.equal(q("4 bytes").unit.symbol, "B");
  assert.equal(q("4 octets").unit.symbol, "B");
  assert.equal(q("1 GIB").unit.symbol, "GiB");
  assert.equal(q("1 MBytes").unit.symbol, "MB");
  assert.equal(q("1 Mbits").unit.symbol, "Mbit");
  assert.equal(q("1 KB").unit.symbol, "kB");
  assert.ok(q("1 KB").notes.some((x) => /1024/.test(x)));
  assert.equal(q("1 kiB").unit.symbol, "KiB");
  assert.equal(q("1 Gib").unit.symbol, "Gibit");
  assert.equal(q("1024").unit.symbol, "B");
  assert.ok(q("1024").notes.some((x) => /bytes/.test(x)));
});

t("ambiguous and invalid units are refused with a reason", () => {
  assert.match(bad("1 gb"), /ambiguous/);
  assert.match(bad("1 mb"), /milli/);
  assert.match(bad("1 tb"), /TB/);
  assert.match(bad("1 gib"), /ambiguous/);
  assert.match(bad("1 iB"), /no prefix/);
  assert.match(bad("1 furlongs"), /not a unit/);
  assert.match(bad("1 ZB"), /above exa/);
  assert.match(bad("1 YiB"), /above exa/);
  assert.match(bad("-1 GB"), /negative/);
  assert.match(bad("GB"), /Start with a number/);
  assert.match(bad("1,5 GB"), /thousands/);
  assert.match(bad("1e99 B"), /exponent/);
  assert.match(bad("9".repeat(65)), /longer than/);
  assert.match(bad("1048577 EiB"), /cap/);
  assert.equal(parseQuantity("").kind, "empty");
});

t("number forms", () => {
  assert.equal(exact(q("1,500 MB").bits, "B"), "1500000000");
  assert.equal(exact(q("1_000 B").bits, "B"), "1000");
  assert.equal(exact(q(".5 KiB").bits, "B"), "512");
  assert.equal(exact(q("5. KiB").bits, "B"), "5120");
  assert.equal(exact(q("1e9 B").bits, "GB"), "1");
  assert.equal(exact(q("1E3MB").bits, "GB"), "1");
  assert.equal(exact(q("1 EB").bits, "PB"), "1000");
  assert.equal(exact(q("2.5e-3 GB").bits, "MB"), "2.5");
  assert.equal(exact(q("+3 B").bits, "b"), "24");
  assert.equal(exact(q("0 GiB").bits, "B"), "0");
  assert.equal(exact(q("1 EiB").bits, "B"), (2n ** 60n).toString());
  // exactly at the cap: 1,048,576 EiB = 2^80 bytes is allowed, one byte more is not
  assert.equal(exact(q("1048576 EiB").bits, "B"), (2n ** 80n).toString());
  assert.match(bad("1208925819614629174706177 B"), /cap/);
  assert.equal(exact(q("1208925819614629174706176 B").bits, "B"), (2n ** 80n).toString());
});

t("no float drift on large integers past 2^53", () => {
  const r = q("9007199254740993 B");
  assert.equal(exact(r.bits, "B"), "9007199254740993");
  assert.equal(exact(r.bits, "b"), "72057594037927944");
  const big = q("123456789012345678901 B");
  assert.equal(exact(big.bits, "B"), "123456789012345678901");
});

t("sub-bit values are exact and flagged", () => {
  const r = q("1 b");
  assert.equal(exact(r.bits, "B"), "0.125");
  assert.equal(exact(r.bits, "EiB"), (() => {
    // 1/2^63 exactly
    const d = exactDecimal({ num: 1n, den: 2n ** 63n });
    return `0.${d.frac}`;
  })());
  assert.equal(exactDecimal({ num: 1n, den: 2n ** 63n }).frac.length, 63);
  assert.ok(q("0.5 b").notes.some((x) => /less than one bit/.test(x)));
});

t("formatting with significant digits", () => {
  const tb = q("1 TB").bits;
  const gib = inUnit(tb, U("GiB"));
  assert.deepEqual(
    [formatRational(gib, 6).text, formatRational(gib, 6).exact],
    ["931.323", false],
  );
  assert.equal(formatRational(gib, 9).text, "931.322575");
  assert.equal(formatRational(gib, "exact").text, "931.322574615478515625");
  assert.equal(formatRational(gib, 30).exact, true);
  assert.equal(formatRational(inUnit(tb, U("B")), 3).text, "1,000,000,000,000");
  assert.equal(formatRational(inUnit(tb, U("B")), 3).exact, true);
  assert.equal(formatRational(inUnit(tb, U("PiB")), 6).text, "0.000888178");
  assert.equal(formatRational(inUnit(tb, U("TiB")), 3).text, "0.909");
  assert.equal(formatRational({ num: 9999995n, den: 10000000n }, 6).text, "1");
  assert.equal(formatRational({ num: 0n, den: 1n }, 6).text, "0");
  assert.equal(formatRational({ num: 5n, den: 10n }, 6).exact, true);
  assert.equal(formatRational({ num: 1n, den: 2n ** 63n }, 3).text, "0.000000000000000000108");
  // half up
  assert.equal(formatRational({ num: 125n, den: 1000n }, 2).text, "0.13");
});

t("fixed and percent", () => {
  assert.equal(fixed({ num: 931322574615478515625n, den: 10n ** 18n }, 2), "931.32");
  assert.equal(fixed({ num: 5n, den: 1000n }, 2), "0.01");
  assert.equal(fixed({ num: 1234567n, den: 1n }, 0), "1,234,567");
  assert.equal(percent({ num: 3n, den: 128n }), "2.34");
});

t("prefix gaps", () => {
  const g = prefixGaps();
  assert.equal(g.length, 6);
  assert.equal(plainDecimal(g[0].ratio), "1.024");
  assert.equal(plainDecimal(g[2].ratio), "1.073741824");
  assert.equal(plainDecimal(g[3].ratio), "1.099511627776");
  assert.deepEqual(g.map((x) => percent(x.shortfall)), ["2.34", "4.63", "6.87", "9.05", "11.18", "13.26"]);
  assert.deepEqual(
    g.map((x) => percent({ num: x.ratio.num - x.ratio.den, den: x.ratio.den })),
    ["2.40", "4.86", "7.37", "9.95", "12.59", "15.29"],
  );
  assert.equal(g[2].si, "GB");
  assert.equal(g[2].iec, "GiB");
});

t("IDEMA LBA1-03 and the lsblk 931.5G figure", () => {
  assert.equal(idemaSectors(1000n), 1953525168n);
  const bytes = idemaSectors(1000n) * 512n;
  assert.equal(bytes, 1000204886016n);
  const gib = inUnit({ num: bytes * 8n, den: 1n }, U("GiB"));
  assert.equal(fixed(gib, 1), "931.5");
  // the detail string in the tools table must match the computed bytes
  assert.ok(TOOL_UNITS.some((r) => r.detail.includes("1,000,204,886,016") && r.detail.includes("931.5G")));
});

t("Kubernetes 1Gi vs 1G gap", () => {
  const diff = 2n ** 30n - 10n ** 9n;
  assert.equal(diff, 73741824n);
  assert.equal(fixed({ num: diff, den: 2n ** 20n }, 2), "70.33");
});

t("largest unit and power of two", () => {
  const tb = q("1 TB").bits;
  assert.equal(largestUnit(tb, "iec").symbol, "GiB");
  assert.equal(largestUnit(tb, "si").symbol, "TB");
  assert.equal(largestUnit(q("100 B").bits, "si").symbol, "B");
  assert.equal(largestUnit(q("1 b").bits, "iec").symbol, "B");
  assert.equal(powerOfTwoBytes(q("1 GiB").bits), 30);
  assert.equal(powerOfTwoBytes(q("1 B").bits), 0);
  assert.equal(powerOfTwoBytes(q("1 GB").bits), null);
  assert.equal(powerOfTwoBytes(q("1 b").bits), null);
  assert.equal(powerOfTwoBytes(q("0 B").bits), null);
});

t("drive labels", () => {
  const one = DRIVE_LABELS.find((d) => d.label === "1 TB")!;
  assert.equal(one.bytes, 10n ** 12n);
  const two = DRIVE_LABELS.find((d) => d.label === "2 TB")!;
  assert.equal(fixed(inUnit({ num: two.bytes * 8n, den: 1n }, U("TiB")), 2), "1.82");
});

t("adversarial inputs never throw", () => {
  const samples = ["\u0000", "1 \u2014", ".", "e5", "1e", "1e+", "0x10", "NaN", "Infinity", "1..2 GB", "1 G B", "🙂", "1/s", "1 ps", "1 bps/s", "1,,000", ",100", "1.2.3"];
  for (const s of samples) parseQuantity(s);
  const chars = "0123456789.,_eE+-kKMGTPEibBsp/ ";
  for (let i = 0; i < 5000; i += 1) {
    let s = "";
    const len = (i * 13) % 24;
    for (let j = 0; j < len; j += 1) s += chars[(i * 37 + j * 11 + j * j) % chars.length];
    const r = parseQuantity(s);
    if (r.kind === "ok") {
      for (const u of UNITS) formatRational(inUnit(r.bits, u), 9);
    }
  }
});

t("drive labels follow IDEMA LBA1-03 known sector counts", () => {
  const known: Record<string, bigint> = {
    "256 GB": 500118192n,
    "500 GB": 976773168n,
    "1 TB": 1953525168n,
    "2 TB": 3907029168n,
    "4 TB": 7814037168n,
    "8 TB": 15628053168n,
  };
  assert.equal(DRIVE_LABELS.length, Object.keys(known).length);
  for (const d of DRIVE_LABELS) {
    assert.equal(idemaSectors(d.bytes / 10n ** 9n), known[d.label], d.label);
  }
});

t("link speeds and TCP payload over Ethernet", () => {
  assert.equal(WIRE_BYTES_PER_PACKET, 1538n);
  assert.equal(TCP_PAYLOAD_PER_PACKET, 1460n);
  const g = LINK_SPEEDS.find((l) => l.label === "1 Gbit/s")!;
  const bits: Rational = { num: g.bitsPerSecond, den: 1n };
  assert.equal(plainDecimal(inUnit(bits, U("MB"))), "125");
  assert.equal(fixed(inUnit(bits, U("MiB")), 2), "119.21");
  const payload = tcpPayloadRate(bits);
  assert.equal(fixed(inUnit(payload, U("MB")), 2), "118.66");
  assert.equal(fixed(inUnit(payload, U("Mbit")), 1), "949.3");
  const fast = LINK_SPEEDS.find((l) => l.label === "100 Mbit/s")!;
  assert.equal(plainDecimal(inUnit({ num: fast.bitsPerSecond, den: 1n }, U("MB"))), "12.5");
  const ten = LINK_SPEEDS.find((l) => l.label === "10 Gbit/s")!;
  assert.equal(plainDecimal(inUnit({ num: ten.bitsPerSecond, den: 1n }, U("GB"))), "1.25");
});

t("Windows-style truncation of drive sizes", () => {
  const show = (label: string) => {
    const d = DRIVE_LABELS.find((x) => x.label === label)!;
    const bits = { num: d.bytes * 8n, den: 1n };
    const u = largestUnit(bits, "iec");
    return `${truncatedFixed(inUnit(bits, u), u.symbol === "GiB" ? 0 : 2)} ${u.symbol}`;
  };
  assert.equal(show("256 GB"), "238 GiB");
  assert.equal(show("500 GB"), "465 GiB");
  assert.equal(show("1 TB"), "931 GiB");
  assert.equal(show("2 TB"), "1.81 TiB");
  assert.equal(show("4 TB"), "3.63 TiB");
  assert.equal(show("8 TB"), "7.27 TiB");
  assert.equal(truncatedFixed({ num: 1999n, den: 1000n }, 2), "1.99");
  assert.equal(truncatedFixed({ num: 0n, den: 1n }, 2), "0.00");
});

t("lsblk one-decimal figures for IDEMA sizes", () => {
  const lsblk = (label: string) => {
    const d = DRIVE_LABELS.find((x) => x.label === label)!;
    const bytes = idemaSectors(d.bytes / 10n ** 9n) * 512n;
    const bits = { num: bytes * 8n, den: 1n };
    const u = largestUnit(bits, "iec");
    return `${fixed(inUnit(bits, u), 1)}${u.symbol.charAt(0)}`;
  };
  assert.equal(lsblk("1 TB"), "931.5G");
  assert.equal(lsblk("2 TB"), "1.8T");
  assert.equal(lsblk("4 TB"), "3.6T");
  assert.equal(lsblk("8 TB"), "7.3T");
  assert.equal(lsblk("500 GB"), "465.8G");
});


/* ---------------------------------------------------------------------------
 * Independent verifier cases. Reference values computed separately with
 * Python's fractions/decimal, from IEC 80000-13 (binary prefixes), the SI
 * Brochure (decimal prefixes), IDEMA LBA1-03, util-linux size_to_human_string
 * and IEEE 802.3 framing.
 * ------------------------------------------------------------------------- */

t("verifier: exact cross-system conversions", () => {
  assert.equal(exact(q("1 PB").bits, "PiB"), "0.88817841970012523233890533447265625");
  assert.equal(exact(q("1 MiB").bits, "kB"), "1048.576");
  assert.equal(exact(q("1 KiB").bits, "b"), "8192");
  assert.equal(exact(q("1 kbit").bits, "b"), "1000");
  assert.equal(exact(q("1 Gibit").bits, "B"), "134217728");
  assert.equal(exact(q("1 Gbit").bits, "B"), "125000000");
  assert.equal(exact(q("1 EiB").bits, "B"), "1152921504606846976");
  assert.equal(exact(q("9007199254740993 B").bits, "KiB"), "8796093022208.0009765625");
  assert.equal(exact(q("1 TiB").bits, "GB"), "1099.511627776");
  assert.equal(exact(q("1 B").bits, "EiB"), "0.000000000000000000867361737988403547205962240695953369140625");
});

t("verifier: parser edge forms", () => {
  assert.match(bad("1 K"), /no B or bit/);
  assert.match(bad("1 G"), /ambiguous/);
  assert.match(bad("1 Gi"), /GiB/);
  assert.match(bad("1e"), /no B or bit/);
  assert.match(bad("\u22125 GB"), /negative/);
  assert.match(bad("\uFF11GB"), /Start with a number/);
  assert.equal(q("1 kb").unit.symbol, "kbit");
  assert.equal(q("1\u00a0GiB").unit.symbol, "GiB");
  const r = q("100 Mbps");
  assert.equal(r.perSecond, true);
  assert.equal(exact(r.bits, "MB"), "12.5");
  assert.equal(exact(q("1 Gbit/s").bits, "MiB"), "119.20928955078125");
});

t("verifier: lsblk figures follow util-linux rounding", () => {
  assert.equal(lsblkFigure(1_000_204_886_016n), "931.5G");
  assert.equal(lsblkFigure(500_107_862_016n), "465.8G");
  assert.equal(lsblkFigure(256_060_514_304n), "238.5G");
  assert.equal(lsblkFigure(2_000_398_934_016n), "1.8T");
  assert.equal(lsblkFigure(8_001_563_222_016n), "7.3T");
  assert.equal(lsblkFigure(0n), "0B");
  assert.equal(lsblkFigure(1023n), "1023B");
  assert.equal(lsblkFigure(1024n), "1K");
  assert.equal(lsblkFigure(1_073_741_824n), "1G");
  // .04 GiB truncates to 39 thousandths and rounds to nothing: no ".0".
  assert.equal(lsblkFigure(1_116_691_496n), "1G");
  // 1023.96 GiB rounds up past the unit: util-linux prints 1024G.
  assert.equal(lsblkFigure(1_099_468_678_103n), "1024G");
  assert.equal(lsblkFigure(2n ** 60n), "1E");
  assert.equal(lsblkFigure(-5n), "0B");
});

t("verifier: Windows Explorer three significant digits, truncated", () => {
  const r = (n: bigint, d: bigint): Rational => ({ num: n, den: d });
  assert.equal(explorerFigure(r(10n ** 12n, 2n ** 30n)), "931");
  assert.equal(explorerFigure(r(2n * 10n ** 12n, 2n ** 40n)), "1.81");
  assert.equal(explorerFigure(r(4n * 10n ** 12n, 2n ** 40n)), "3.63");
  assert.equal(explorerFigure(r(16n * 10n ** 12n, 2n ** 40n)), "14.5");
  assert.equal(explorerFigure(r(1n, 2n)), "0.50");
  assert.equal(explorerFigure(r(999n, 1n)), "999");
  for (const d of DRIVE_LABELS) {
    const bits = { num: d.bytes * 8n, den: 1n };
    const u = largestUnit(bits, "iec");
    assert.ok(/^\d+(\.\d+)?$/.test(explorerFigure(inUnit(bits, u))));
  }
});

t("verifier: IDEMA LBA1-03 and gaps", () => {
  assert.equal(idemaSectors(1000n), 1_953_525_168n);
  assert.equal(idemaSectors(500n), 976_773_168n);
  assert.equal(idemaSectors(2000n), 3_907_029_168n);
  assert.equal(idemaSectors(4000n), 7_814_037_168n);
  assert.equal(idemaSectors(1000n) * 512n, 1_000_204_886_016n);
  const gaps = prefixGaps();
  assert.equal(percent(gaps[0].shortfall), "2.34");
  assert.equal(percent(gaps[2].shortfall), "6.87");
  assert.equal(percent(gaps[3].shortfall), "9.05");
  assert.equal(plainDecimal(gaps[3].ratio), "1.099511627776");
  assert.equal(fixed(inUnit(tcpPayloadRate({ num: 10n ** 9n, den: 1n }), unitBySymbol("MB")!), 1), "118.7");
});

t("verifier: tool table facts", () => {
  const si = TOOL_UNITS.find((row) => row.tool.startsWith("df -H"))!;
  assert.match(si.detail, /k for kilo/);
  const dd = TOOL_UNITS.find((row) => row.tool.startsWith("dd"))!;
  assert.match(dd.detail, /1M and 1MiB are 1,048,576/);
});

t("verifier: hostile input never throws", () => {
  const samples = [
    "\u0000", "\uD800", "🙂 GB", "1 🙂", "1".repeat(64), "1e-30 EiB", "0.".padEnd(64, "0") , "1,000,000,000,000,000,000,000 b",
    "constructor", "1 __proto__", "1 toString", "1 B".padStart(64, " "), "1e+30 b", "1e-30", "1 per second",
    "1 /s", "/s", "ps", "1 ps", "1 bps/s", "1.2.3 GB", "١ GB",
  ];
  for (const s of samples) {
    const r = parseQuantity(s);
    if (r.kind === "ok") {
      for (const u of UNITS) formatRational(inUnit(r.bits, u), "exact");
    } else if (r.kind === "error") {
      assert.ok(r.message.length > 0 && r.message.length < 400);
    }
  }
  let seed = 99;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const alphabet = "0123456789.,_eE+- kKmMgGtTpPeEiIbBytsoct/per";
  for (let i = 0; i < 5000; i += 1) {
    let s = "";
    const len = Math.floor(rand() * 24);
    for (let j = 0; j < len; j += 1) s += alphabet[Math.floor(rand() * alphabet.length)];
    const r = parseQuantity(s);
    if (r.kind === "ok") {
      assert.ok(r.bits.num >= 0n && r.bits.den > 0n);
      formatRational(inUnit(r.bits, UNITS[UNITS.length - 1]), 6);
    }
  }
});

console.log(`byte-unit-converter: ${n} tests passed`);
