import assert from "node:assert/strict";
import {
  COMBOS,
  FLAGS,
  binary12,
  binary8,
  comboName,
  explain,
  flagBit,
  hex2,
  hex3,
  parseFlagsInput,
  setFlags,
  tcpdumpFilters,
  tcpdumpNotation,
  wiresharkFilters,
} from "../../client/src/lib/toolkit/tcp-flags-calculator.ts";

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

function value(text: string): number {
  const r = parseFlagsInput(text);
  if (!r || !r.ok) throw new Error(`expected ok for ${text}: ${r && !r.ok ? r.error : "null"}`);
  return r.value;
}

function error(text: string): string {
  const r = parseFlagsInput(text);
  if (!r || r.ok) throw new Error(`expected error for ${text}`);
  return r.error;
}

/* RFC 9293 section 3.1 and RFC 3168 section 6.1: byte 13 is
   CWR ECE URG ACK PSH RST SYN FIN, most significant first; AE (formerly NS,
   RFC 3540) is the low bit of byte 12, so 0x100 in the 12-bit field. */
test("bit positions", () => {
  assert.deepEqual(
    FLAGS.map((f) => [f.name, f.bit]),
    [
      ["AE", 0x100],
      ["CWR", 0x80],
      ["ECE", 0x40],
      ["URG", 0x20],
      ["ACK", 0x10],
      ["PSH", 0x08],
      ["RST", 0x04],
      ["SYN", 0x02],
      ["FIN", 0x01],
    ],
  );
  assert.equal(flagBit("syn") | flagBit("ack"), 0x12);
});

test("SYN-ACK in every base", () => {
  const v = 0x12;
  assert.equal(hex2(v), "0x12");
  assert.equal(hex3(v), "0x012");
  assert.equal(v, 18);
  assert.equal(binary8(v), "0001 0010");
  assert.equal(binary12(v), "000 0 0001 0010");
  assert.equal(binary12(0x1c2), "000 1 1100 0010");
  assert.deepEqual(setFlags(v).map((f) => f.name), ["ACK", "SYN"]);
});

/* tcpdump prints flags in the order F S R P . U E W, and [none] for zero. */
test("tcpdump notation", () => {
  assert.equal(tcpdumpNotation(0x02), "[S]");
  assert.equal(tcpdumpNotation(0x12), "[S.]");
  assert.equal(tcpdumpNotation(0x18), "[P.]");
  assert.equal(tcpdumpNotation(0x11), "[F.]");
  assert.equal(tcpdumpNotation(0x19), "[FP.]");
  assert.equal(tcpdumpNotation(0x14), "[R.]");
  assert.equal(tcpdumpNotation(0x04), "[R]");
  assert.equal(tcpdumpNotation(0xc2), "[SEW]");
  assert.equal(tcpdumpNotation(0x29), "[FPU]");
  assert.equal(tcpdumpNotation(0x00), "[none]");
  assert.equal(tcpdumpNotation(0xff), "[FSRP.UEW]");
});

test("combination names", () => {
  assert.equal(comboName(0x12), "SYN-ACK");
  assert.equal(comboName(0x29), "FIN-PSH-URG");
  assert.equal(comboName(0x14), "RST-ACK");
  assert.equal(comboName(0x00), "no flags");
  assert.equal(comboName(0x210), "ACK-reserved");
});

test("parse numbers", () => {
  assert.equal(value("0x12"), 0x12);
  assert.equal(value("0X012"), 0x12);
  assert.equal(value("18"), 0x12);
  assert.equal(value("0b00010010"), 0x12);
  assert.equal(value("0b0001_0010"), 0x12);
  assert.equal(value("00010010"), 0x12);
  assert.equal(value("0001 0010"), 0x12);
  assert.equal(value("100010010"), 0x112);
  assert.equal(value("0"), 0);
  assert.equal(value("0xfff"), 0xfff);
  assert.equal(value("4095"), 0xfff);
});

test("parse bytes 12 and 13 together", () => {
  const r = parseFlagsInput("0x5012");
  assert.ok(r && r.ok);
  if (!r || !r.ok) return;
  assert.equal(r.value, 0x012);
  assert.equal(r.dataOffset, 5);
  const opts = parseFlagsInput("0xa002");
  assert.ok(opts && opts.ok && opts.value === 0x002 && opts.dataOffset === 10);
  const withAe = parseFlagsInput("0x81c2");
  assert.ok(withAe && withAe.ok && withAe.value === 0x1c2 && withAe.dataOffset === 8);
});

test("parse tcpdump notation", () => {
  assert.equal(value("[S.]"), 0x12);
  assert.equal(value("S."), 0x12);
  assert.equal(value("[S]"), 0x02);
  assert.equal(value("[none]"), 0);
  assert.equal(value("[SEW]"), 0xc2);
  assert.equal(value("[FPU]"), 0x29);
  assert.equal(value("."), 0x10);
  assert.equal(value("[s.]"), 0x12);
  assert.equal(
    value("12:00:01.123456 IP 10.0.0.1.50000 > 10.0.0.2.80: Flags [S.], seq 1, ack 2, win 65535"),
    0x12,
  );
  assert.match(error("[SX]"), /"X" is not a tcpdump flag letter/);
});

test("parse names", () => {
  assert.equal(value("SYN ACK"), 0x12);
  assert.equal(value("syn-ack"), 0x12);
  assert.equal(value("SYN+ACK"), 0x12);
  assert.equal(value("synack"), 0x12);
  assert.equal(value("FIN, PSH, URG"), 0x29);
  assert.equal(value("xmas"), 0x29);
  assert.equal(value("null"), 0);
  assert.equal(value("RST|ACK"), 0x14);
  assert.equal(value("reset push"), 0x0c);
  assert.equal(value("ns syn"), 0x102);
  assert.equal(value("AE CWR ECE SYN"), 0x1c2);
  assert.equal(value("ECN-Echo ACK"), 0x50);
});

test("parse errors are specific", () => {
  assert.equal(parseFlagsInput(""), null);
  assert.equal(parseFlagsInput("   "), null);
  assert.match(error("fe"), /looks like hex.*0xfe/);
  assert.match(error("1a"), /0x1a/);
  assert.match(error("SYN BOGUS"), /"bogus" is not a flag name/);
  assert.match(error("0x10000"), /larger than 16 bits/);
  assert.match(error("65536"), /larger than 16 bits/);
  assert.match(error("99999999999999999999"), /larger than 16 bits/);
  assert.match(error("0x" + "f".repeat(50)), /larger than 16 bits/);
  assert.match(error("x".repeat(500)), /too long/);
  assert.ok(parseFlagsInput("<img src=x onerror=alert(1)>")?.ok === false);
  assert.match(error("-1"), /never negative/);
  assert.ok(parseFlagsInput("1.5")?.ok === false);
});

test("every named combination is unique and round-trips", () => {
  const seen = new Set<number>();
  for (const combo of COMBOS) {
    assert.ok(!seen.has(combo.value), `duplicate ${combo.name}`);
    seen.add(combo.value);
    assert.equal(explain(combo.value).combo?.name, combo.name);
    assert.equal(explain(combo.value).name, combo.name);
  }
  assert.equal(explain(0x002).name, "SYN");
  assert.equal(explain(0x012).name, "SYN-ACK");
  assert.equal(explain(0x011).name, "FIN-ACK");
  assert.equal(explain(0x014).name, "RST-ACK");
  assert.equal(explain(0x029).name, "Xmas scan");
  assert.equal(explain(0x000).name, "NULL scan");
  assert.equal(explain(0x003).name, "SYN-FIN");
});

test("warnings", () => {
  assert.deepEqual(explain(0x012).warnings, []);
  assert.deepEqual(explain(0x010).warnings, []);
  assert.deepEqual(explain(0x002).warnings, []);
  assert.ok(explain(0x006).warnings.some((w) => w.includes("SYN and RST")));
  assert.ok(explain(0x0c3).warnings.some((w) => w.includes("SYN and FIN")));
  // The SYN-FIN entry already explains itself; no duplicate warning.
  assert.ok(!explain(0x003).warnings.some((w) => w.includes("SYN and FIN")));
  assert.ok(explain(0x001).warnings.some((w) => w.includes("No ACK")));
  assert.ok(explain(0x008).warnings.some((w) => w.includes("No ACK")));
  assert.ok(explain(0x030).warnings.some((w) => w.includes("RFC 6093")));
  assert.ok(!explain(0x029).warnings.some((w) => w.includes("RFC 6093")));
  const reserved = explain(0x212);
  assert.ok(reserved.warnings.some((w) => w.includes("Reserved bits")));
  assert.equal(reserved.combo, null);
});

test("AE with a known eight-bit combination", () => {
  const e = explain(0x112);
  assert.equal(e.combo, null);
  assert.equal(e.nearCombo?.name, "SYN-ACK");
  assert.equal(explain(0x1c2).combo?.name, "AccECN SYN");
  assert.equal(explain(0x1c2).nearCombo, null);
});

/* pcap-filter(7): tcp[tcpflags] is byte 13; named constants tcp-fin through tcp-cwr. */
test("tcpdump filters", () => {
  assert.deepEqual(tcpdumpFilters(0x12), [
    { label: "Exactly these flags in byte 13", filter: "tcp[tcpflags] == 0x12" },
    { label: "At least these set", filter: "tcp[tcpflags] & (tcp-syn|tcp-ack) == (tcp-syn|tcp-ack)" },
    { label: "Any of these set", filter: "tcp[tcpflags] & (tcp-syn|tcp-ack) != 0" },
  ]);
  assert.deepEqual(tcpdumpFilters(0x02), [
    { label: "Exactly these flags in byte 13", filter: "tcp[tcpflags] == 0x02" },
    { label: "At least these set", filter: "tcp[tcpflags] & tcp-syn != 0" },
  ]);
  assert.deepEqual(tcpdumpFilters(0x00), [{ label: "Exactly these flags in byte 13", filter: "tcp[tcpflags] == 0x00" }]);
  assert.equal(tcpdumpFilters(0x29)[1].filter, "tcp[tcpflags] & (tcp-fin|tcp-push|tcp-urg) == (tcp-fin|tcp-push|tcp-urg)");
  assert.equal(tcpdumpFilters(0xc2)[1].filter, "tcp[tcpflags] & (tcp-syn|tcp-ece|tcp-cwr) == (tcp-syn|tcp-ece|tcp-cwr)");
  const ae = tcpdumpFilters(0x1c2);
  assert.equal(ae[0].filter, "tcp[12:2] & 0x0fff == 0x1c2");
  assert.equal(ae[1].filter, "tcp[tcpflags] & (tcp-syn|tcp-ece|tcp-cwr) == (tcp-syn|tcp-ece|tcp-cwr) and tcp[12] & 0x01 != 0");
  assert.equal(ae[2].filter, "(tcp[tcpflags] & (tcp-syn|tcp-ece|tcp-cwr) != 0 or tcp[12] & 0x01 != 0)");
  const aeOnly = tcpdumpFilters(0x100);
  assert.deepEqual(aeOnly.map((f) => f.filter), ["tcp[12:2] & 0x0fff == 0x100", "tcp[12] & 0x01 != 0"]);
  const reserved = tcpdumpFilters(0xe00);
  assert.equal(reserved[1].filter, "tcp[12] & 0x0e == 0x0e");
});

/* Wireshark: tcp.flags is the 12-bit field, so SYN-ACK is 0x012. */
test("Wireshark filters", () => {
  assert.deepEqual(wiresharkFilters(0x12), [
    { label: "Exactly these flags", filter: "tcp.flags == 0x012" },
    { label: "At least these set", filter: "tcp.flags.ack == 1 && tcp.flags.syn == 1" },
    { label: "Any of these set", filter: "tcp.flags & 0x012" },
  ]);
  assert.deepEqual(wiresharkFilters(0x00), [{ label: "Exactly these flags", filter: "tcp.flags == 0x000" }]);
  assert.equal(wiresharkFilters(0x04)[1].filter, "tcp.flags.reset == 1");
  assert.equal(wiresharkFilters(0x29)[1].filter, "tcp.flags.urg == 1 && tcp.flags.push == 1 && tcp.flags.fin == 1");
  assert.equal(wiresharkFilters(0x1c2)[1].filter, "tcp.flags & 0x100 && tcp.flags.cwr == 1 && tcp.flags & 0x040 && tcp.flags.syn == 1");
  assert.equal(wiresharkFilters(0x1c2)[0].filter, "tcp.flags == 0x1c2");
  assert.equal(wiresharkFilters(0x812)[1].filter, "tcp.flags.ack == 1 && tcp.flags.syn == 1 && tcp.flags & 0x800");
});

test("exhaustive: every 12-bit value formats and filters without throwing", () => {
  for (let v = 0; v <= 0xfff; v++) {
    const e = explain(v);
    assert.ok(e.name.length > 0);
    const td = tcpdumpFilters(v);
    const ws = wiresharkFilters(v);
    assert.ok(td.length >= 1 && ws.length >= 1);
    assert.equal(ws[0].filter, `tcp.flags == 0x${v.toString(16).padStart(3, "0")}`);
    // Round trip through the hex parser.
    assert.equal(value(hex3(v)), v);
    for (const f of [...td, ...ws]) assert.ok(!f.filter.includes("undefined"));
    // Round trip through tcpdump notation: byte 13 plus AE (tcpdump 4.99.7 prints AE as e).
    assert.equal(value(tcpdumpNotation(v)), v & 0x1ff);
  }
});


/* ---------------------------------------------------------------------------
   Independent verifier cases. References: RFC 9293 section 3.1 (header
   layout), RFC 3168 section 6.1.1 (ECN-setup SYN and SYN-ACK), tcpdump
   print-tcp.c tcp_flag_values (F S R P . U E W, and e for AE since 4.99.7),
   Wireshark packet-tcp.h (TH_MASK 0x0FFF), pcap-filter(7).
   --------------------------------------------------------------------------- */

test("verifier: RFC 3168 ECN-setup values in every base", () => {
  // ECN-setup SYN: SYN + ECE + CWR = 0x02 + 0x40 + 0x80 = 0xc2 = 194.
  assert.equal(value("SYN ECE CWR"), 0xc2);
  assert.equal(hex2(0xc2), "0xc2");
  assert.equal(binary8(0xc2), "1100 0010");
  assert.equal(explain(0xc2).combo?.name, "ECN-setup SYN");
  // ECN-setup SYN-ACK: SYN + ACK + ECE, CWR clear = 0x52 = 82.
  assert.equal(value("82"), 0x52);
  assert.equal(explain(0x52).combo?.name, "ECN-setup SYN-ACK");
  assert.equal(tcpdumpNotation(0x52), "[S.E]");
});

test("verifier: tcpdump 4.99.7 prints AE as a lowercase e, after W", () => {
  assert.equal(tcpdumpNotation(0x1c2), "[SEWe]");
  assert.equal(tcpdumpNotation(0x100), "[e]");
  assert.equal(tcpdumpNotation(0x1ff), "[FSRP.UEWe]");
  // Reserved bits have no letter.
  assert.equal(tcpdumpNotation(0xe00), "[none]");
  assert.equal(value("[SEWe]"), 0x1c2);
  assert.equal(value("SEWe"), 0x1c2);
  assert.equal(value("Flags [S.e], seq 1, ack 2"), 0x112);
  // Uppercase E stays ECE; lowercase e is AE, never ECE.
  assert.equal(value("[E]"), 0x040);
  assert.equal(value("[e]"), 0x100);
  // Lowercase letters with no other meaning are still accepted.
  assert.equal(value("[s.]"), 0x012);
  assert.match(error("[]"), /tcpdump prints \[none\]/);
  // A bare "fe" is still read as forgotten hex, not FIN plus AE.
  assert.match(error("fe"), /looks like hex/);
});

test("verifier: numbers with leading zeros and at the 16-bit limit", () => {
  assert.equal(value("0x00000012"), 0x012);
  assert.equal(value("0000018"), 0x012);
  assert.equal(value("0b0000000000010010"), 0x012);
  const full = parseFlagsInput("0xffff");
  assert.ok(full && full.ok && full.value === 0xfff && full.dataOffset === 15);
  const decFull = parseFlagsInput("65535");
  assert.ok(decFull && decFull.ok && decFull.value === 0xfff && decFull.dataOffset === 15);
  assert.match(error("65536"), /larger than 16 bits/);
  assert.match(error("0x10000"), /larger than 16 bits/);
  assert.match(error("99999999999999999999999"), /larger than 16 bits/);
  assert.match(error("-0x12"), /never negative/);
  assert.match(error("-18"), /never negative/);
  // 0x5000: data offset 5 with no flags is a NULL segment, not an error.
  const nul = parseFlagsInput("0x5000");
  assert.ok(nul && nul.ok && nul.value === 0 && nul.dataOffset === 5);
});

test("verifier: names, separators and malformed input", () => {
  assert.equal(value("xmas scan"), 0x029);
  assert.equal(value("NULL scan"), 0x000);
  assert.equal(value("FIN scan"), 0x001);
  assert.match(error("scan"), /not a flag name/);
  // Separators alone are not a NULL value.
  for (const junk of ["-", "+", ",", "|", "/ &"]) assert.ok(!parseFlagsInput(junk)?.ok, junk);
  assert.equal(parseFlagsInput("   "), null);
  // Unicode and control characters give an error, never a throw.
  for (const junk of ["ＳＹＮ", "SYN\u0000", "​SYN", "😀", "[S😀]", "Flags [\u0007]", "0x１２", "syn".repeat(66)]) {
    const r = parseFlagsInput(junk);
    assert.ok(r && !r.ok, junk);
  }
  assert.match(error("[S​]"), /U\+200B/);
  assert.match(error("[S😀]"), /"😀"/);
  // Long garbage is truncated in the message.
  const long = error("abcdefghijklmnopqrstuvwxyzabcdefghij");
  assert.ok(long.length < 220 && long.includes("..."));
});

test("verifier: exact filters and RFC 9293 bit positions", () => {
  // SYN-ACK: byte 13 = 0x12; Wireshark's 12-bit field = 0x012.
  assert.deepEqual(tcpdumpFilters(0x012)[0], { label: "Exactly these flags in byte 13", filter: "tcp[tcpflags] == 0x12" });
  assert.equal(wiresharkFilters(0x012)[0].filter, "tcp.flags == 0x012");
  // RST-ACK = 0x14.
  assert.equal(tcpdumpFilters(0x014)[0].filter, "tcp[tcpflags] == 0x14");
  assert.equal(tcpdumpFilters(0x014)[1].filter, "tcp[tcpflags] & (tcp-rst|tcp-ack) == (tcp-rst|tcp-ack)");
  // Xmas = FIN + PSH + URG = 0x29.
  assert.equal(wiresharkFilters(0x029)[0].filter, "tcp.flags == 0x029");
  // AE set: tcp[tcpflags] alone would miss it, so the exact test uses both bytes.
  assert.deepEqual(tcpdumpFilters(0x112)[0], { label: "Exactly these flags, all 12 bits", filter: "tcp[12:2] & 0x0fff == 0x112" });
  // Reserved bit 0x800 is bit 3 of byte 12's low nibble: tcp[12] & 0x08.
  assert.equal(tcpdumpFilters(0x800)[1].filter, "tcp[12] & 0x08 != 0");
});

test("verifier: near combinations with AE or reserved bits", () => {
  const r = explain(0x202);
  assert.equal(r.combo, null);
  assert.equal(r.nearCombo?.name, "SYN");
  assert.equal(r.nearExtra, "reserved");
  const a = explain(0x112);
  assert.equal(a.nearExtra, "ae");
  const both = explain(0x312);
  assert.equal(both.nearCombo?.name, "SYN-ACK");
  assert.equal(both.nearExtra, "ae+reserved");
  const accRes = explain(0x9c2);
  assert.equal(accRes.nearCombo?.name, "AccECN SYN");
  assert.equal(accRes.nearExtra, "reserved");
  assert.equal(explain(0x012).nearExtra, null);
});


/* ---------------------------------------------------------------------------
   Second independent verifier. The generated filters are evaluated, not just
   compared as strings: a small evaluator follows the libpcap grammar
   (grammar.y: '&' binds tighter than a relop; "and"/"or" join tests) and
   Wireshark's (BITWISE_AND above comparisons, a bare "x & m" is true when
   nonzero, a bare field tests existence). Every filter is run against all
   4,096 values of the 12-bit field. Letter order and AE come from tcpdump
   4.99 print-tcp.c (tcp_flag_values, tcp_get_flags reads byte 12 & 0x0f).
   --------------------------------------------------------------------------- */

const PCAP_CONST: Record<string, number> = {
  "tcp-fin": 0x01, "tcp-syn": 0x02, "tcp-rst": 0x04, "tcp-push": 0x08,
  "tcp-ack": 0x10, "tcp-urg": 0x20, "tcp-ece": 0x40, "tcp-cwr": 0x80,
};

type Bytes = { b12: number; b13: number };

/** Compiles one libpcap arithmetic operand into a function of bytes 12 and 13. */
function pcapOperand(expr: string): (b: Bytes) => number {
  const e = expr.trim().replace(/^\((.*)\)$/, "$1");
  if (e.includes("|")) {
    const parts = e.split("|").map(pcapOperand);
    return (b) => parts.reduce((acc, f) => acc | f(b), 0);
  }
  if (e === "tcp[tcpflags]" || e === "tcp[13]") return (b) => b.b13;
  if (e === "tcp[12]") return (b) => b.b12;
  if (e === "tcp[12:2]") return (b) => (b.b12 << 8) | b.b13;
  if (e in PCAP_CONST) {
    const k = PCAP_CONST[e];
    return () => k;
  }
  if (/^0x[0-9a-f]+$/i.test(e) || /^\d+$/.test(e)) {
    const k = Number(e);
    return () => k;
  }
  throw new Error(`pcap operand ${e}`);
}

function pcapTerm(term: string): (b: Bytes) => boolean {
  const m = /^(.+?) (==|!=) (.+)$/.exec(term.trim());
  if (!m) throw new Error(`pcap term ${term}`);
  // '&' binds tighter than the relop, so the left side is "x & mask".
  const [lhs, mask] = m[1].split(" & ");
  const l = pcapOperand(lhs);
  const k = mask === undefined ? null : pcapOperand(mask);
  const r = pcapOperand(m[3]);
  const eq = m[2] === "==";
  return (b) => {
    const left = k ? l(b) & k(b) : l(b);
    return eq ? left === r(b) : left !== r(b);
  };
}

/** Compiles a whole generated tcpdump filter: terms joined by "and", or a parenthesized "or". */
function pcapCompile(filter: string): (flags: number, dataOffset?: number) => boolean {
  const body = /^\((tcp\[.*)\)$/.test(filter) ? filter.slice(1, -1) : filter;
  const isOr = body.includes(" or ");
  assert.ok(!(isOr && body.includes(" and ")), `mixed and/or needs explicit grouping: ${filter}`);
  const terms = body.split(isOr ? " or " : " and ").map(pcapTerm);
  return (flags, dataOffset = 5) => {
    const b = { b12: (dataOffset << 4) | ((flags >> 8) & 0x0f), b13: flags & 0xff };
    return isOr ? terms.some((t) => t(b)) : terms.every((t) => t(b));
  };
}

const WS_FIELD: Record<string, number> = {
  "tcp.flags.res": 0xe00, "tcp.flags.ae": 0x100, "tcp.flags.cwr": 0x080, "tcp.flags.ece": 0x040,
  "tcp.flags.urg": 0x020, "tcp.flags.ack": 0x010, "tcp.flags.push": 0x008, "tcp.flags.reset": 0x004,
  "tcp.flags.syn": 0x002, "tcp.flags.fin": 0x001,
};

function wsCompile(filter: string): (flags: number) => boolean {
  const terms = filter.split(" && ").map((term): ((x: number) => boolean) => {
    let m = /^tcp\.flags == (0x[0-9a-f]+)$/.exec(term);
    if (m) {
      const k = Number(m[1]);
      return (x) => x === k;
    }
    m = /^tcp\.flags & (0x[0-9a-f]+)$/.exec(term);
    if (m) {
      const k = Number(m[1]);
      return (x) => (x & k) !== 0;
    }
    m = /^(tcp\.flags\.[a-z]+) == 1$/.exec(term);
    if (m) {
      assert.ok(m[1] in WS_FIELD, `unknown Wireshark field ${m[1]}`);
      const k = WS_FIELD[m[1]];
      return (x) => (x & k) !== 0;
    }
    throw new Error(`Wireshark term ${term}`);
  });
  return (x) => terms.every((t) => t(x));
}

test("verifier 2: every generated filter selects exactly the right values", () => {
  for (let v = 0; v <= 0xfff; v++) {
    const td = tcpdumpFilters(v);
    const ws = wiresharkFilters(v);
    const tdc = td.map((f) => pcapCompile(f.filter));
    const wsc = ws.map((f) => wsCompile(f.filter));
    const byte13Only = (v & 0xf00) === 0;
    for (let x = 0; x <= 0xfff; x++) {
      // Exact: the tcp[tcpflags] form compares byte 13 only; the 12-bit form
      // compares all 12 and must ignore the data offset nibble.
      const exactWant = byte13Only ? (x & 0xff) === v : x === v;
      if (tdc[0](x, 5 + (x % 11)) !== exactWant) assert.fail(`tcpdump exact ${hex3(v)} on ${hex3(x)}: ${td[0].filter}`);
      if (wsc[0](x) !== (x === v)) assert.fail(`wireshark exact ${hex3(v)} on ${hex3(x)}`);
      if (v === 0) continue;
      const atLeast = (x & v) === v;
      if (tdc[1](x, 15) !== atLeast) assert.fail(`tcpdump at-least ${hex3(v)} on ${hex3(x)}: ${td[1].filter}`);
      if (wsc[1](x) !== atLeast) assert.fail(`wireshark at-least ${hex3(v)} on ${hex3(x)}: ${ws[1].filter}`);
      const any = (x & v) !== 0;
      if (tdc[2] && tdc[2](x, 8) !== any) assert.fail(`tcpdump any ${hex3(v)} on ${hex3(x)}: ${td[2].filter}`);
      if (wsc[2] && wsc[2](x) !== any) assert.fail(`wireshark any ${hex3(v)} on ${hex3(x)}`);
    }
    // "Any of these" is offered exactly when more than one bit is set.
    let bits = 0;
    for (let b = v; b; b &= b - 1) bits++;
    assert.equal(td.length, v === 0 ? 1 : bits > 1 ? 3 : 2);
    assert.equal(ws.length, v === 0 ? 1 : bits > 1 ? 3 : 2);
  }
});

test("verifier 2: Object.prototype names are not flag names", () => {
  for (const junk of ["constructor", "__proto__", "SYN constructor", "hasownproperty", "toString", "valueOf"]) {
    const r = parseFlagsInput(junk);
    assert.ok(r && !r.ok, junk);
  }
  assert.match(error("constructor"), /"constructor" is not a flag name/);
});

test("verifier 2: bare or broken prefixes get a specific message", () => {
  assert.match(error("0x"), /After 0x, use only hex digits/);
  assert.match(error("0xg1"), /After 0x/);
  assert.match(error("0x12 SYN"), /After 0x/);
  assert.match(error("0b"), /After 0b, use only binary digits/);
  assert.match(error("0b102"), /After 0b/);
  assert.match(error("0b 0001 0010"), /After 0b/);
  // Still fine: real binary and hex.
  assert.equal(value("0B00010010"), 0x12);
  assert.equal(value("0xFFF"), 0xfff);
});

test("verifier 2: tcpdump constants and Wireshark field names as input", () => {
  assert.equal(value("tcp-syn|tcp-ack"), 0x012);
  assert.equal(value("(tcp-syn|tcp-ack)"), 0x012);
  assert.equal(value("tcp-push tcp-ack"), 0x018);
  assert.equal(value("tcp-ece tcp-cwr tcp-syn"), 0x0c2);
  assert.equal(value("tcp.flags.reset"), 0x004);
  assert.equal(value("tcp.flags.syn tcp.flags.ack"), 0x012);
  assert.equal(value("tcp.flags.ae"), 0x100);
  assert.match(error("tcp-bogus"), /"bogus" is not a flag name/);
});

/* Lines in the format of the tcpdump(1) man page and of tcpdump 4.99 output. */
test("verifier 2: real tcpdump lines", () => {
  assert.equal(value("IP rtsg.1023 > csam.login: Flags [S], seq 768512:768512, win 4096, opts [mss 1024]"), 0x002);
  assert.equal(value("IP csam.login > rtsg.1023: Flags [S.], seq, 947648:947648, ack 768513, win 4096, opts [mss 1024]"), 0x012);
  assert.equal(value("IP rtsg.1023 > csam.login: Flags [.], ack 1, win 4096"), 0x010);
  assert.equal(value("IP rtsg.1023 > csam.login: Flags [P.], seq 1:2, ack 1, win 4096, length 1"), 0x018);
  assert.equal(value("10:00:00.000000 IP 10.0.0.1.443 > 10.0.0.2.51000: Flags [F.], seq 9, ack 7, win 501, length 0"), 0x011);
  assert.equal(value("IP 10.0.0.2.80 > 10.0.0.1.4444: Flags [R.], seq 0, ack 1, win 0, length 0"), 0x014);
  assert.equal(value("IP 10.0.0.1.4444 > 10.0.0.2.80: Flags [FPU], seq 1, win 1024, urg 0, length 0"), 0x029);
  assert.equal(value("IP 10.0.0.1.4444 > 10.0.0.2.80: Flags [none], win 1024, length 0"), 0x000);
  assert.equal(value("IP 10.0.0.1.4444 > 10.0.0.2.80: Flags [SEW], seq 1, win 64240"), 0x0c2);
});

test("verifier 2: hex, decimal and 16-bit binary agree for every 16-bit value", () => {
  for (let x = 0; x <= 0xffff; x += 7) {
    const want = x & 0xfff;
    const wantOffset = x > 0xfff ? x >> 12 : null;
    for (const text of [`0x${x.toString(16)}`, String(x), `0b${x.toString(2).padStart(16, "0")}`]) {
      const r = parseFlagsInput(text);
      assert.ok(r && r.ok && r.value === want && r.dataOffset === wantOffset, text);
    }
  }
});

test("verifier 2: random input never throws", () => {
  const alphabet = "0123456789abcdefxbSFRPUEWe.[]()|&+-,/ \t_ACKSYNFINRSTPSHURGECECWRAEnulé​😀\u0000";
  let seed = 7;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  for (let i = 0; i < 20000; i++) {
    let text = "";
    const len = 1 + rand(30);
    for (let j = 0; j < len; j++) text += alphabet[rand(alphabet.length)];
    const r = parseFlagsInput(text);
    if (r === null) continue;
    if (r.ok) {
      assert.ok(Number.isInteger(r.value) && r.value >= 0 && r.value <= 0xfff, text);
      assert.ok(r.dataOffset === null || (r.dataOffset >= 0 && r.dataOffset <= 15), text);
    } else {
      assert.ok(r.error.length > 0 && !r.error.includes("undefined"), text);
    }
  }
});

test("verifier 2: tcpdump prints [none] when only reserved bits are set", () => {
  // bittok2str_nosep prints its "none" format when no token matched.
  for (const v of [0x200, 0x400, 0x800, 0xe00]) assert.equal(tcpdumpNotation(v), "[none]");
  assert.equal(tcpdumpNotation(0xa12), "[S.]");
  assert.equal(tcpdumpNotation(0x1ff), "[FSRP.UEWe]");
});


/* ---------------------------------------------------------------------------
   Third independent verifier. Sources: RFC 9293 section 3.1 (header layout),
   RFC 9293 section 3.5.2 (reset generation: RST-ACK for a SYN to a closed
   port, bare RST for an unexpected ACK), RFC 3168 section 6.1.1 (ECN setup),
   tcpdump 4.99.7 print-tcp.c tcp_flag_values (F S R P . U E W e, "none"),
   wireshark-filter(4) (bitwise AND, bare field tests existence).
   --------------------------------------------------------------------------- */

test("verifier 3: well-known combinations in hex, decimal and binary", () => {
  // name, byte 13, decimal, binary, tcpdump letters
  const table: [string, number, number, string, string][] = [
    ["SYN", 0x02, 2, "0000 0010", "[S]"],
    ["SYN-ACK", 0x12, 18, "0001 0010", "[S.]"],
    ["ACK", 0x10, 16, "0001 0000", "[.]"],
    ["PSH-ACK", 0x18, 24, "0001 1000", "[P.]"],
    ["FIN-ACK", 0x11, 17, "0001 0001", "[F.]"],
    ["RST", 0x04, 4, "0000 0100", "[R]"],
    ["RST-ACK", 0x14, 20, "0001 0100", "[R.]"],
    ["Xmas scan", 0x29, 41, "0010 1001", "[FPU]"],
    ["NULL scan", 0x00, 0, "0000 0000", "[none]"],
    ["SYN-FIN", 0x03, 3, "0000 0011", "[FS]"],
    ["ECN-setup SYN", 0xc2, 194, "1100 0010", "[SEW]"],
  ];
  for (const [name, byte, dec, bin, letters] of table) {
    assert.equal(explain(byte).combo?.name, name, name);
    assert.equal(hex2(byte), `0x${byte.toString(16).padStart(2, "0")}`);
    assert.equal(byte, dec);
    assert.equal(binary8(byte), bin, name);
    assert.equal(tcpdumpNotation(byte), letters, name);
    assert.equal(value(String(dec)), byte, name);
    assert.equal(value(letters), byte, name);
    assert.equal(value(`0b${bin.replace(" ", "")}`), byte, name);
  }
});

test("verifier 3: real tcpdump output lines", () => {
  assert.equal(value("12:00:00.000001 IP 10.0.0.1.443 > 10.0.0.2.51000: Flags [S.], seq 1, ack 2, win 65160, length 0"), 0x012);
  assert.equal(value("IP 10.0.0.2.51000 > 10.0.0.1.443: Flags [P.], seq 1:518, ack 1, win 502, length 517"), 0x018);
  assert.equal(value("IP 10.0.0.2.51000 > 10.0.0.1.443: Flags [F.], seq 518, ack 4000, win 501, length 0"), 0x011);
  assert.equal(value("IP 10.0.0.1.81 > 10.0.0.2.40000: Flags [R.], seq 0, ack 12345, win 0, length 0"), 0x014);
  assert.equal(value("IP 10.0.0.2.40000 > 10.0.0.1.80: Flags [SEW], seq 9, win 64240, length 0"), 0x0c2);
  assert.equal(value("IP 10.0.0.1.80 > 10.0.0.2.40000: Flags [S.E], seq 7, ack 10, win 65160, length 0"), 0x052);
});

test("verifier 3: 16-bit values carry the data offset (bytes 12 and 13)", () => {
  // 0x8018: data offset 8 (32-byte header, typical with timestamps), PSH-ACK.
  const r = parseFlagsInput("0x8018");
  assert.ok(r && r.ok && r.value === 0x018 && r.dataOffset === 8);
  // 0x5002 = 20482: data offset 5, SYN.
  const d = parseFlagsInput("20482");
  assert.ok(d && d.ok && d.value === 0x002 && d.dataOffset === 5);
  // 0xa1c2: data offset 10, AccECN SYN.
  const a = parseFlagsInput("0b1010000111000010");
  assert.ok(a && a.ok && a.value === 0x1c2 && a.dataOffset === 10);
  assert.equal(explain(0x1c2).combo?.name, "AccECN SYN");
});

test("verifier 3: hex-looking letters are not silently read as tcpdump flags", () => {
  // "FF" used to read as FIN and "FE" as FIN+ECE.
  assert.match(error("FF"), /looks like hex.*0xFF/);
  assert.match(error("EE"), /looks like hex/);
  assert.match(error("FE"), /could be hex or tcpdump letters/);
  assert.match(error("F"), /could be hex or tcpdump letters.*\[F\]/);
  assert.match(error("e"), /could be hex or tcpdump letters/);
  // In brackets, or with a letter that is not a hex digit, there is no ambiguity.
  assert.equal(value("[FE]"), 0x041);
  assert.equal(value("[F]"), 0x001);
  assert.equal(value("FPU"), 0x029);
  assert.equal(value("SE"), 0x042);
  assert.equal(value("0xFE"), 0x0fe);
  // Repeated letters are a typo, not a flag.
  assert.match(error("SS"), /appears twice/);
  assert.match(error("[S.S]"), /appears twice/);
  assert.match(error(".."), /appears twice/);
});

test("verifier 3: numbers mixed with names get an accurate message", () => {
  assert.match(error("+18"), /number mixed with names/);
  assert.match(error("SYN 18"), /number mixed with names/);
  assert.match(error("1 0010"), /number mixed with names/);
  // Hex letters inside a name list still get the hex hint.
  assert.match(error("syn fe"), /looks like hex/);
  // Prototype names in brackets are not letters.
  assert.match(error("[constructor]"), /not a tcpdump flag letter/);
});

test("verifier 3: filters for RST-ACK, Xmas and the NULL scan", () => {
  assert.deepEqual(
    tcpdumpFilters(0x029).map((f) => f.filter),
    [
      "tcp[tcpflags] == 0x29",
      "tcp[tcpflags] & (tcp-fin|tcp-push|tcp-urg) == (tcp-fin|tcp-push|tcp-urg)",
      "tcp[tcpflags] & (tcp-fin|tcp-push|tcp-urg) != 0",
    ],
  );
  assert.deepEqual(
    wiresharkFilters(0x029).map((f) => f.filter),
    ["tcp.flags == 0x029", "tcp.flags.urg == 1 && tcp.flags.push == 1 && tcp.flags.fin == 1", "tcp.flags & 0x029"],
  );
  assert.deepEqual(tcpdumpFilters(0x000).map((f) => f.filter), ["tcp[tcpflags] == 0x00"]);
  assert.deepEqual(wiresharkFilters(0x000).map((f) => f.filter), ["tcp.flags == 0x000"]);
  assert.deepEqual(
    wiresharkFilters(0x002).map((f) => f.filter),
    ["tcp.flags == 0x002", "tcp.flags.syn == 1"],
  );
  assert.deepEqual(
    tcpdumpFilters(0x002).map((f) => f.filter),
    ["tcp[tcpflags] == 0x02", "tcp[tcpflags] & tcp-syn != 0"],
  );
  // ECE uses a mask in Wireshark (its field name changed across versions).
  assert.deepEqual(wiresharkFilters(0x052).map((f) => f.filter)[1], "tcp.flags & 0x040 && tcp.flags.ack == 1 && tcp.flags.syn == 1");
});

test("verifier 3: warnings follow RFC 9293", () => {
  assert.ok(explain(0x003).warnings.length === 0 || explain(0x003).warnings.every((w) => !w.startsWith("SYN and FIN")));
  assert.ok(explain(0x013).warnings.some((w) => w.startsWith("SYN and FIN")));
  assert.ok(explain(0x006).warnings.some((w) => w.startsWith("SYN and RST")));
  assert.ok(explain(0x029).warnings.some((w) => w.startsWith("No ACK")));
  assert.ok(!explain(0x029).warnings.some((w) => w.startsWith("URG")));
  assert.ok(explain(0x030).warnings.some((w) => w.startsWith("URG")));
  assert.equal(explain(0x012).warnings.length, 0);
  assert.equal(explain(0x004).warnings.length, 0);
  assert.equal(explain(0x014).warnings.length, 0);
});

console.log(`tcp-flags-calculator: ${passed} tests passed`);
