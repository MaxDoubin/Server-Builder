import assert from "node:assert/strict";
import {
  convertBatch,
  describeAsn,
  parseAsn,
  splitAsnList,
  toAsdot,
  toAsdotPlus,
  wireView,
  MAX_BATCH,
} from "../../client/src/lib/toolkit/asn-converter.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
}

t("RFC 5396 notation", () => {
  assert.equal(toAsdot(65535), "65535");
  assert.equal(toAsdotPlus(65535), "0.65535");
  assert.equal(toAsdot(65536), "1.0");
  assert.equal(toAsdot(65546), "1.10");
  assert.equal(toAsdot(4294967295), "65535.65535");
  assert.equal(toAsdot(4200000000), "64086.59904");
  assert.equal(toAsdotPlus(0), "0.0");
  assert.equal(describeAsn(4200000000).hex, "FA56EA00");
});

t("classification boundaries", () => {
  const cases: [number, string][] = [
    [0, "reserved"], [1, "public"], [112, "public"], [23455, "public"], [23456, "as-trans"], [23457, "public"],
    [64495, "public"], [64496, "documentation"], [64511, "documentation"], [64512, "private"],
    [65534, "private"], [65535, "reserved"], [65536, "documentation"], [65551, "documentation"],
    [65552, "reserved"], [131071, "reserved"], [131072, "public"], [4199999999, "public"],
    [4200000000, "private"], [4294967294, "private"], [4294967295, "reserved"],
  ];
  for (const [asn, kind] of cases) assert.equal(describeAsn(asn).kind, kind, `AS${asn}`);
  assert.equal(describeAsn(65535).bits, 16);
  assert.equal(describeAsn(65536).bits, 32);
  assert.equal(describeAsn(23456).source, "RFC 6793");
  assert.equal(describeAsn(64512).source, "RFC 6996");
  assert.equal(describeAsn(64500).source, "RFC 5398");
  assert.equal(describeAsn(0).source, "RFC 7607");
  assert.equal(describeAsn(4294967295).source, "RFC 7300");
});

t("parse valid", () => {
  const ok = (s: string, v: number) => {
    const p = parseAsn(s);
    assert.ok(p.ok, `${s}: ${!p.ok ? p.error : ""}`);
    if (p.ok) assert.equal(p.value, v, s);
  };
  ok("64512", 64512);
  ok("AS64512", 64512);
  ok("as 65000", 65000);
  ok("1.10", 65546);
  ok("AS1.0", 65536);
  ok("0.65535", 65535);
  ok("65535.65535", 4294967295);
  ok("4294967295", 4294967295);
  ok("0", 0);
  ok("007", 7);
  ok("0xFA56EA01", 4200000001);
  ok("0x5ba0", 23456);
  const plus = parseAsn("0.100");
  assert.ok(plus.ok && plus.note && plus.note.includes("100"));
});

t("parse invalid, never throws", () => {
  const bad = [
    "", "   ", "4294967296", "99999999999999999999999999", "1.65536", "65536.0", "-1", "+5",
    "192.0.2.1", "1.2.3", "AS-EXAMPLE", "64496:100", "1.", ".5", "0x1FFFFFFFF", "abc", "AS",
    "x".repeat(5000), "1e5", "６４５１２", "64512\u0000",
  ];
  for (const s of bad) {
    const p = parseAsn(s);
    assert.equal(p.ok, false, `expected failure for ${JSON.stringify(s.slice(0, 20))}`);
    if (!p.ok) assert.ok(p.error.length > 5);
  }
  const p = parseAsn("192.0.2.1");
  assert.ok(!p.ok && /IPv4/.test(p.error));
});

t("wire view, RFC 6793 and RFC 5492", () => {
  const w = wireView(4200000001);
  assert.equal(w.myAsField, 23456);
  assert.equal(w.myAsHex, "5B A0");
  assert.equal(w.capabilityHex, "02 06 41 04 FA 56 EA 01");
  assert.equal(w.needsAsTrans, true);
  assert.equal(w.oldSpeakerSees, 23456);
  const s = wireView(64512);
  assert.equal(s.myAsField, 64512);
  assert.equal(s.myAsHex, "FC 00");
  assert.equal(s.capabilityHex, "02 06 41 04 00 00 FC 00");
  assert.equal(s.needsAsTrans, false);
  assert.equal(wireView(65546).regexAsdot, "1\\.10");
  assert.equal(wireView(65535).needsAsTrans, false);
  assert.equal(wireView(65536).needsAsTrans, true);
});

t("batch split", () => {
  const s = splitAsnList("64496 64497 {64498,64499} AS 65000; as4200000000\n\n[1.10]");
  assert.deepEqual(s.tokens, ["64496", "64497", "64498", "64499", "AS65000", "as4200000000", "1.10"]);
  const big = Array.from({ length: MAX_BATCH + 500 }, (_, i) => String(i)).join("\n");
  const b = convertBatch(big);
  assert.equal(b.rows.length, MAX_BATCH);
  assert.equal(b.dropped, 500);
  const huge = convertBatch("1 ".repeat(150_000));
  assert.equal(huge.clipped, true);
  assert.equal(huge.rows.length, MAX_BATCH);
  const mixed = convertBatch("64512, nope, 1.10");
  assert.equal(mixed.rows.length, 3);
  assert.equal(mixed.rows[1].info, null);
  assert.equal(mixed.rows[2].info?.asplain, "65546");
});

t("fuzz", () => {
  const alphabet = "0123456789.:xXaAsS- \t{},;[]Lf";
  for (let i = 0; i < 20000; i++) {
    let s = "";
    const len = Math.floor(Math.random() * 16);
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    const rows = convertBatch(s).rows;
    for (const r of rows) {
      if (r.parsed.ok) {
        assert.ok(r.parsed.value >= 0 && r.parsed.value <= 4294967295 && Number.isInteger(r.parsed.value), s);
        assert.equal(parseAsn(r.info!.asdot).ok, true);
        const back = parseAsn(r.info!.asdotPlus);
        assert.ok(back.ok && back.value === r.parsed.value);
      }
    }
  }
});


// ---- Independent verifier cases ----
t("verifier: RFC 5396 section 2 worked values", () => {
  // RFC 5396: 65526 is "65526" in asplain and asdot, "0.65526" in asdot+;
  // 65546 is "1.10" in asdot and asdot+.
  assert.equal(toAsdot(65526), "65526");
  assert.equal(toAsdotPlus(65526), "0.65526");
  assert.equal(toAsdot(65546), "1.10");
  assert.equal(toAsdotPlus(65546), "1.10");
  // 1.1 and 1.10 are different numbers: the spreadsheet trap.
  const a = parseAsn("1.1");
  const b = parseAsn("1.10");
  assert.ok(a.ok && a.value === 65537);
  assert.ok(b.ok && b.value === 65546);
  // 396982 = 6 * 65536 + 3766.
  assert.equal(toAsdot(396982), "6.3766");
  const back = parseAsn("6.3766");
  assert.ok(back.ok && back.value === 396982);
  // 65535.0 = 0xFFFF0000 = 4294901760, inside the 32-bit private range.
  const p = parseAsn("65535.0");
  assert.ok(p.ok && p.value === 4294901760);
  assert.equal(describeAsn(4294901760).kind, "private");
  assert.equal(describeAsn(4294901760).hex, "FFFF0000");
});

t("verifier: range edges and labels", () => {
  assert.equal(toAsdot(131072), "2.0");
  assert.equal(describeAsn(131072).kind, "public");
  assert.equal(describeAsn(131072).bits, 32);
  assert.equal(describeAsn(4294967294).asdot, "65535.65534");
  assert.equal(describeAsn(4294967294).kind, "private");
  assert.equal(describeAsn(112).label, "Public, AS112 project");
  assert.equal(describeAsn(15169).kind, "public");
  assert.equal(describeAsn(15169).bits, 16);
  assert.equal(describeAsn(65551).asdot, "1.15");
  assert.equal(describeAsn(65552).source, "IANA AS Numbers registry");
  assert.equal(describeAsn(1).range, "1 to 64495, except 23456");
  assert.equal(describeAsn(4199999999).range, "131072 to 4199999999");
});

t("verifier: hex and long-input parsing", () => {
  const f = parseAsn("0xFFFFFFFF");
  assert.ok(f.ok && f.value === 4294967295);
  const z = parseAsn("0x00000000FFFFFFFF");
  assert.ok(z.ok && z.value === 4294967295);
  assert.equal(parseAsn("0x100000000").ok, false);
  assert.equal(parseAsn("0x").ok, false);
  // The longest prefixed forms must parse, and the too-long message must
  // not understate how long a valid entry can be.
  for (const s of ["AS 4294967295", "AS 65535.65535", "AS0xFFFFFFFF"]) assert.equal(parseAsn(s).ok, true, s);
  const long = parseAsn("1".repeat(41));
  assert.ok(!long.ok && /41 characters/.test(long.error) && !/more than 12/.test(long.error));
  // Exactly 2^32 in every notation is rejected.
  assert.equal(parseAsn("4294967296").ok, false);
  assert.equal(parseAsn("65536.0").ok, false);
  assert.equal(parseAsn("65535.65536").ok, false);
});

t("verifier: wire view for AS_TRANS and the 4-byte private start", () => {
  // AS_TRANS itself fits in 2 octets, so it is carried directly.
  const w = wireView(23456);
  assert.equal(w.needsAsTrans, false);
  assert.equal(w.myAsHex, "5B A0");
  assert.equal(w.capabilityHex, "02 06 41 04 00 00 5B A0");
  const p = wireView(4200000000);
  assert.equal(p.capabilityHex, "02 06 41 04 FA 56 EA 00");
  assert.equal(p.regexAsdot, "64086\\.59904");
  const top = wireView(4294967295);
  assert.equal(top.capabilityHex, "02 06 41 04 FF FF FF FF");
  assert.equal(wireView(0).capabilityHex, "02 06 41 04 00 00 00 00");
  assert.equal(wireView(65535).regexAsdot, "65535");
});

t("verifier: batch of the page's AS path example", () => {
  const b = convertBatch("64496 64511 65536 {64500,1.15} 23456");
  assert.deepEqual(
    b.rows.map((r) => r.info?.kind),
    ["documentation", "documentation", "documentation", "documentation", "documentation", "as-trans"],
  );
  assert.equal(b.rows[4].info?.asplain, "65551");
  const edge = convertBatch("0\n23456\n65535\n65552\n4294967295\nAS-EXAMPLE\n1.65536");
  assert.deepEqual(
    edge.rows.map((r) => (r.info ? r.info.kind : "error")),
    ["reserved", "as-trans", "reserved", "reserved", "reserved", "error", "error"],
  );
  // Unicode, control and empty-ish input never throw.
  for (const s of ["", " \n\t ", " ", "\ud800", "AS​1", "١٢٣", "AS-", "AS", "x".repeat(250_000)]) {
    const r = convertBatch(s);
    assert.ok(Array.isArray(r.rows));
  }
});

console.log(`asn-converter: ${n} groups passed`);
