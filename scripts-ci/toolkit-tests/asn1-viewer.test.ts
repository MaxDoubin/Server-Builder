import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  decodeBase64,
  decodeFileBytes,
  decodeGeneralizedTime,
  decodeHex,
  decodeInput,
  decodeIntegerBytes,
  decodeOid,
  decodeUtcTime,
  magnitudeBits,
  MAX_DEPTH,
  MAX_INPUT_BYTES,
  MAX_NODES,
  parseAsn1,
  parsePem,
  type Asn1Node,
} from "../../client/src/lib/toolkit/asn1-viewer.ts";

const FIX = new URL("./fixtures/asn1-fixtures", import.meta.url).pathname;
let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}
const hex = (s: string) => {
  const r = decodeHex(s);
  if (!r.ok) throw new Error(r.error);
  return r.bytes;
};
const one = (s: string): Asn1Node => {
  const r = parseAsn1(hex(s));
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  return r.roots[0];
};

/* ---------------------------------------------------- X.690 8.19 OIDs */
test("OID 1.2.840.113549 (X.690 / PKCS #1 arc)", () => {
  const r = decodeOid(hex("2a864886f70d"));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.dotted, "1.2.840.113549");
});
test("OID {2 999 3} encodes as 88 37 03 (X.690 8.19.5 example)", () => {
  const r = decodeOid(hex("883703"));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.dotted, "2.999.3");
});
test("OID {2 100 3} encodes as 81 34 03 (X.690 2002 example)", () => {
  const r = decodeOid(hex("813403"));
  assert.ok(r.ok && r.dotted === "2.100.3");
});
test("OID first arc 0 and 1", () => {
  const a = decodeOid(hex("0992268993f22c64"));
  assert.ok(a.ok && a.dotted.startsWith("0.9.2342.19200300.100"));
  const b = decodeOid(hex("2b0601050507030 1".replace(/ /g, "")));
  assert.ok(b.ok && b.dotted === "1.3.6.1.5.5.7.3.1");
});
test("OID with arc beyond 2^64 (2.25 UUID arc)", () => {
  // 2.25.329800735698586629295641978511506172918 (RFC 4122 example UUID f81d4fae-7dec-11d0-a765-00a0c91e6bf6)
  // Encode: first subid 2*40+25 = 105 = 0x69, then the big arc in base 128.
  let big = BigInt("329800735698586629295641978511506172918");
  const groups: number[] = [];
  while (big > 0n) {
    groups.unshift(Number(big & 0x7fn));
    big >>= 7n;
  }
  const bytes = [0x69, ...groups.map((g, i) => (i < groups.length - 1 ? g | 0x80 : g))];
  const r = decodeOid(Uint8Array.from(bytes));
  assert.ok(r.ok && r.dotted === "2.25.329800735698586629295641978511506172918");
});
test("OID errors: truncated subidentifier and 0x80 padding", () => {
  const t = decodeOid(hex("2a86"));
  assert.ok(!t.ok);
  const p = decodeOid(hex("2a8086"));
  // 0x80 then 0x86 continues; the subidentifier is cut off too
  assert.ok(!p.ok);
  const q = decodeOid(hex("2a800106"));
  assert.ok(q.ok && q.issues.some((i) => i.level === "invalid"));
  assert.ok(!decodeOid(new Uint8Array(0)).ok);
});

/* ----------------------------------------------------- X.690 8.3 INTEGER */
test("INTEGER two's complement values", () => {
  const cases: [string, string][] = [
    ["00", "0"],
    ["7f", "127"],
    ["0080", "128"],
    ["80", "-128"],
    ["ff7f", "-129"],
    ["0100", "256"],
    ["ff", "-1"],
    ["010001", "65537"],
  ];
  for (const [h, v] of cases) assert.equal(decodeIntegerBytes(hex(h)).toString(), v, h);
});
test("magnitudeBits matches BigInt bit length", () => {
  for (const h of ["00", "01", "7f", "80", "ff", "0080", "ff7f", "00ffffff", "8000", "010001"]) {
    const v = decodeIntegerBytes(hex(h));
    const abs = v < 0n ? -v : v;
    assert.equal(magnitudeBits(hex(h)), abs === 0n ? 0 : abs.toString(2).length, h);
  }
});
test("INTEGER nodes, shortest form check", () => {
  assert.equal(one("020100").summary, "0");
  assert.equal(one("02020080").summary, "128");
  assert.equal(one("020180").summary, "-128");
  const bad = one("0202007f");
  assert.ok(bad.issues.some((i) => i.level === "invalid" && /shortest/.test(i.text)));
  const badNeg = one("0202ff80");
  assert.ok(badNeg.issues.some((i) => /shortest/.test(i.text)));
  const empty = parseAsn1(hex("0200"));
  assert.ok(empty.roots[0].issues.some((i) => i.level === "invalid"));
});
test("Big INTEGER shown as bit count, no decimal", () => {
  const body = "00" + "c3".repeat(256);
  const n = one("02820101" + body);
  assert.equal(n.summary, "2048 bit integer");
  assert.equal(n.lengthForm, "long");
  assert.equal(n.lengthOctets, 3);
  assert.equal(n.headerLength, 4);
  assert.ok(!n.fields.some((f) => f.label === "Decimal"));
});

/* ---------------------------------------------- lengths, X.690 8.1.3 */
test("Short and long form lengths, DER minimality", () => {
  const s = one("0405" + "00".repeat(5));
  assert.equal(s.lengthForm, "short");
  assert.equal(s.issues.length, 0);
  const l = one("048180" + "00".repeat(128));
  assert.equal(l.lengthForm, "long");
  assert.equal(l.length, 128);
  assert.equal(l.issues.length, 0);
  const nonMin = one("048105" + "41".repeat(5));
  assert.ok(nonMin.issues.some((i) => i.level === "der"));
  const lead0 = one("04820005" + "41".repeat(5));
  assert.ok(lead0.issues.some((i) => i.level === "der" && /zero octet/.test(i.text)));
});
test("Length errors: reserved 0xff, overrun, truncation, primitive indefinite", () => {
  const r1 = parseAsn1(hex("04ff00"));
  assert.ok(r1.errors[0].message.includes("reserved"));
  const r2 = parseAsn1(hex("0405aabb"));
  assert.match(r2.errors[0].message, /declares 5 content bytes but only 2 remain in the input/);
  const r3 = parseAsn1(hex("3003020105ff"));
  assert.equal(r3.roots.length, 1);
  assert.ok(r3.errors.length === 1);
  const r4 = parseAsn1(hex("048000"));
  assert.match(r4.errors[0].message, /primitive element cannot use the indefinite/);
  const r5 = parseAsn1(hex("30"));
  assert.ok(r5.errors.length === 1);
  const r6 = parseAsn1(hex("30050205000000"));
  // child declares 5 bytes but parent has only 3 left
  assert.match(r6.errors[0].message, /inside the element that contains it/);
  assert.equal(r6.roots.length, 1);
  assert.ok(r6.roots[0].error);
});

/* --------------------------------------------------- high tag numbers */
test("High tag number form", () => {
  const n = one("5f1f0100");
  assert.equal(n.tagClass, "application");
  assert.equal(n.tagNumber, 31);
  assert.equal(n.name, "[APPLICATION 31]");
  const big = one("9f8148" + "0100");
  assert.equal(big.tagClass, "context");
  assert.equal(big.tagNumber, 200);
  const notMin = one("9f050100");
  assert.equal(notMin.tagNumber, 5);
  assert.ok(notMin.issues.some((i) => i.level === "invalid" && /8\.1\.2\.3/.test(i.text)));
  const pad = one("9f80050100");
  assert.ok(pad.issues.some((i) => i.level === "invalid" && /0x80/.test(i.text)));
});

/* -------------------------------------------- BIT STRING, X.690 8.6 */
test("BIT STRING example '0A3B5F291CD'H (X.690 8.6.4.2)", () => {
  const n = one("0307040a3b5f291cd0");
  assert.equal(n.fields.find((f) => f.label === "Unused bits")?.value, "4");
  assert.equal(n.fields.find((f) => f.label === "Bit length")?.value, "44");
  assert.equal(n.issues.length, 0);
});
test("BIT STRING with non-zero unused bits flagged for DER", () => {
  const n = one("030204a1");
  assert.ok(n.issues.some((i) => i.level === "der"));
  assert.ok(parseAsn1(hex("030108")).roots[0].issues.some((i) => i.level === "invalid"));
});

/* ------------------------------------------------ BOOLEAN, NULL, strings */
test("BOOLEAN and NULL", () => {
  assert.equal(one("0101ff").summary, "true");
  assert.equal(one("010100").summary, "false");
  assert.ok(one("010101").issues.some((i) => i.level === "der"));
  assert.equal(one("0500").summary, "null");
  assert.ok(one("050100").issues.some((i) => i.level === "invalid"));
});
test("Strings", () => {
  assert.equal(one("0c03e282ac").summary, '"€"');
  assert.equal(one("13024142").summary, '"AB"');
  assert.ok(one("13014041".slice(0, 6)).issues.some((i) => /PrintableString/.test(i.text)));
  assert.equal(one("1e0400410042").summary, '"AB"');
  assert.equal(one("1c080000004100000042").summary, '"AB"');
  assert.ok(one("0c02c328").issues.some((i) => /UTF-8/.test(i.text)));
  assert.equal(one("160161").summary, '"a"');
  assert.equal(one("0c0161").summary, '"a"');
  assert.equal(one("0c020a41").summary, '"\\x0aA"');
});

/* -------------------------------------------------------------- times */
test("UTCTime century rule (RFC 5280 4.1.2.5.1)", () => {
  const a = decodeUtcTime("250101000000Z");
  assert.ok(a.ok && a.iso === "2025-01-01 00:00:00 UTC");
  const b = decodeUtcTime("500101000000Z");
  assert.ok(b.ok && b.iso === "1950-01-01 00:00:00 UTC");
  const c = decodeUtcTime("491231235959Z");
  assert.ok(c.ok && c.iso.startsWith("2049-12-31"));
  const d = decodeUtcTime("9105062345+0100");
  assert.ok(d.ok && d.issues.length === 1 && d.iso === "1991-05-06 23:45:00 UTC+01:00");
  assert.ok(!decodeUtcTime("250230000000Z").ok);
  assert.ok(!decodeUtcTime("2501010000").ok);
});
test("GeneralizedTime DER rules (X.690 11.7)", () => {
  const a = decodeGeneralizedTime("20251030120000Z");
  assert.ok(a.ok && a.iso === "2025-10-30 12:00:00 UTC" && a.issues.length === 0);
  const b = decodeGeneralizedTime("20251030120000.50Z");
  assert.ok(b.ok && b.issues.some((i) => /trailing zeros/.test(i.text)));
  const c = decodeGeneralizedTime("2025103012");
  assert.ok(c.ok && c.issues.length === 2);
  const d = decodeGeneralizedTime("20240229000000Z");
  assert.ok(d.ok);
  assert.ok(!decodeGeneralizedTime("20230229000000Z").ok);
  const e = decodeGeneralizedTime("20251030120000,5Z");
  assert.ok(e.ok && e.issues.some((i) => /comma/.test(i.text)));
});

/* ------------------------------------------------- indefinite length */
test("Indefinite length SEQUENCE with EOC", () => {
  const r = parseAsn1(hex("308002010500003000"));
  assert.equal(r.errors.length, 0);
  assert.equal(r.roots.length, 2);
  const seq = r.roots[0];
  assert.equal(seq.lengthForm, "indefinite");
  assert.equal(seq.end, 7);
  assert.equal(seq.length, 3);
  assert.equal(seq.children.length, 2);
  assert.equal(seq.children[1].name, "EOC");
  assert.ok(seq.issues.some((i) => i.level === "der"));
  assert.equal(r.derIssues, 1);
});
test("Indefinite length without EOC keeps the partial tree", () => {
  const r = parseAsn1(hex("3080020105"));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /no end-of-contents/);
  assert.equal(r.roots.length, 1);
  assert.equal(r.roots[0].children.length, 1);
  assert.equal(r.roots[0].end, 5);
});
test("EOC outside indefinite is invalid", () => {
  const r = parseAsn1(hex("0000"));
  assert.ok(r.roots[0].issues.some((i) => i.level === "invalid"));
});

/* --------------------------------------------------- encapsulation */
test("OCTET STRING encapsulating DER is expanded with absolute offsets", () => {
  const n = one("0405" + "3003020105");
  assert.ok(n.encapsulated);
  assert.equal(n.children[0].offset, 2);
  assert.equal(n.children[0].children[0].offset, 4);
  assert.equal(n.children[0].children[0].summary, "5");
});
test("OCTET STRING with random bytes is not expanded", () => {
  const n = one("0414" + "11f143d7b16c8a63ae5b133f1b8f83e50398d8ea");
  assert.ok(!n.encapsulated);
  const t = one("0403" + "3081ff");
  assert.ok(!t.encapsulated);
});
test("BIT STRING with unused bits is never expanded", () => {
  const n = one("030601" + "3003020105");
  assert.ok(!n.encapsulated);
});
test("Non-DER content is not taken as encapsulated", () => {
  const n = one("0406" + "308103020105");
  assert.ok(!n.encapsulated);
});

/* ---------------------------------------------- SET OF ordering (11.6) */
test("SET OF ordering", () => {
  const ok = one("3106" + "020101" + "020102");
  assert.ok(!ok.issues.some((i) => /ascending/.test(i.text)));
  const bad = one("3106" + "020102" + "020101");
  assert.ok(bad.issues.some((i) => i.level === "der" && /ascending/.test(i.text)));
});

/* ---------------------------------------------------- caps and abuse */
test("Depth cap", () => {
  let s = "0500";
  for (let i = 0; i < 100; i++) {
    const len = s.length / 2;
    s = "30" + (len < 128 ? len.toString(16).padStart(2, "0") : "82" + len.toString(16).padStart(4, "0")) + s;
  }
  const r = parseAsn1(hex(s));
  assert.ok(r.depthCapHit);
  assert.ok(Math.max(...r.nodes.map((n) => n.depth)) <= MAX_DEPTH);
  assert.equal(r.errors.length, 0);
});
test("Indefinite depth bomb stops with a message", () => {
  const r = parseAsn1(hex("3080".repeat(200)));
  assert.ok(r.errors.length >= 1);
});
test("Node cap", () => {
  const body = "0500".repeat(MAX_NODES + 50);
  const len = body.length / 2;
  const r = parseAsn1(hex("3083" + len.toString(16).padStart(6, "0") + body));
  assert.ok(r.nodeCapHit);
  assert.ok(r.nodes.length <= MAX_NODES);
});
test("Input caps", () => {
  assert.ok(!decodeHex("00".repeat(MAX_INPUT_BYTES + 1)).ok);
  const r = parseAsn1(new Uint8Array(0));
  assert.equal(r.errors.length, 1);
});
test("Random bytes never throw", () => {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed & 0xff;
  };
  for (let t = 0; t < 3000; t++) {
    const len = 1 + (t % 64);
    const b = new Uint8Array(len);
    for (let i = 0; i < len; i++) b[i] = rand();
    if (t % 3 === 0) b[0] = 0x30;
    const r = parseAsn1(b);
    for (const n of r.nodes) {
      assert.ok(n.end <= b.length && n.offset >= 0 && n.end >= n.offset + n.headerLength, `range t=${t}`);
    }
  }
});

/* ----------------------------------------------------------- input text */
test("Hex and Base64 decoding", () => {
  assert.deepEqual([...hex("0x30, 0x03 02:01:05")], [0x30, 3, 2, 1, 5]);
  assert.ok(!decodeHex("abc").ok);
  assert.ok(!decodeHex("zz").ok);
  const b = decodeBase64("MAMCAQU=");
  assert.ok(b.ok && [...b.bytes].join(",") === "48,3,2,1,5");
  const nopad = decodeBase64("MAMCAQU");
  assert.ok(nopad.ok && nopad.bytes.length === 5);
  const url = decodeBase64("-_8");
  assert.ok(url.ok && url.bytes[0] === 0xfb && url.bytes[1] === 0xff);
  assert.ok(!decodeBase64("MAMCA").ok);
  assert.ok(!decodeBase64("MA=MC").ok);
  assert.ok(!decodeBase64("MA*M").ok);
});
test("Auto detection", () => {
  const h = decodeInput("30 03 02 01 05", "auto");
  assert.ok(h.ok && h.format === "hex");
  const b = decodeInput("MAMCAQU=", "auto");
  assert.ok(b.ok && b.format === "base64");
  const e = decodeInput("   ", "auto");
  assert.ok(!e.ok);
});
test("PEM: multiple blocks, labels, non-DER and encrypted", () => {
  const two = `-----BEGIN CERTIFICATE-----\nMAMCAQU=\n-----END CERTIFICATE-----\njunk\n-----BEGIN X509 CRL-----\nMAMCAQY=\n-----END X509 CRL-----`;
  const r = parsePem(two);
  assert.ok(r.ok && r.blocks.length === 2 && r.blocks[1].label === "X509 CRL");
  const mismatch = parsePem("-----BEGIN A-----\nMAMCAQU=\n-----END B-----");
  assert.ok(mismatch.ok && mismatch.blocks[0].error);
  const ossh = parsePem("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----");
  assert.ok(ossh.ok && /OpenSSH/.test(ossh.blocks[0].error ?? ""));
  const enc = parsePem("-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,00\n\nMAMCAQU=\n-----END RSA PRIVATE KEY-----");
  assert.ok(enc.ok && /ENCRYPTED/.test(enc.blocks[0].error ?? ""));
  const hdr = parsePem("-----BEGIN THING-----\nComment: hi\n\nMAMCAQU=\n-----END THING-----");
  assert.ok(hdr.ok && hdr.blocks[0].bytes?.length === 5);
  const open = parsePem("-----BEGIN CERTIFICATE-----\nMAMCAQU=");
  assert.ok(!open.ok);
  const hyph = parsePem("-----BEGIN NEW-STYLE KEY-----\nMAMCAQU=\n-----END NEW-STYLE KEY-----");
  assert.ok(hyph.ok && hyph.blocks[0].label === "NEW-STYLE KEY" && hyph.blocks[0].bytes);
});
test("Binary file bytes pass through, text file bytes decode", () => {
  const bin = decodeFileBytes(Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x05]));
  assert.ok(bin.ok && bin.format === "binary");
  const txt = decodeFileBytes(new TextEncoder().encode("MAMCAQU=\n"));
  assert.ok(txt.ok && txt.format === "base64");
});

/* ------------------------------------- cross check with openssl asn1parse */
const reference = JSON.parse(readFileSync(`${FIX}/openssl-asn1parse.json`, "utf8")) as Record<
  string,
  [number, number, number, number | "inf", boolean][]
>;

function flattenNoEncapsulated(roots: Asn1Node[]): Asn1Node[] {
  const out: Asn1Node[] = [];
  const walk = (n: Asn1Node) => {
    out.push(n);
    if (!n.encapsulated) n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

for (const [file, rows] of Object.entries(reference)) {
  test(`matches openssl asn1parse: ${file}`, () => {
    let bytes: Uint8Array;
    if (file.endsWith(".der")) {
      const r = decodeFileBytes(new Uint8Array(readFileSync(`${FIX}/${file}`)));
      assert.ok(r.ok);
      bytes = (r as { ok: true; blocks: { bytes: Uint8Array | null }[] }).blocks[0].bytes!;
    } else {
      const r = decodeInput(readFileSync(`${FIX}/${file}`, "utf8"), "auto");
      assert.ok(r.ok, file);
      bytes = (r as { ok: true; blocks: { bytes: Uint8Array | null }[] }).blocks[0].bytes!;
    }
    const res = parseAsn1(bytes);
    assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
    const flat = flattenNoEncapsulated(res.roots);
    assert.equal(flat.length, rows.length, `${file}: node count`);
    rows.forEach(([off, depth, hl, len, cons], i) => {
      const n = flat[i];
      assert.equal(n.offset, off, `${file} row ${i} offset`);
      assert.equal(n.depth, depth, `${file} row ${i} depth`);
      assert.equal(n.headerLength, hl, `${file} row ${i} hl`);
      assert.equal(n.constructed, cons, `${file} row ${i} cons`);
      if (len === "inf") assert.equal(n.lengthForm, "indefinite", `${file} row ${i} inf`);
      else assert.equal(n.length, len, `${file} row ${i} len`);
    });
    if (file !== "cms-ber.der") {
      assert.equal(res.derIssues, 0, `${file} der issues`);
    } else {
      assert.ok(res.derIssues > 0);
    }
    assert.equal(res.invalidIssues, 0, `${file} invalid issues`);
  });
}

test("EC certificate details", () => {
  const r = decodeInput(readFileSync(`${FIX}/ec-cert.pem`, "utf8"), "auto");
  assert.ok(r.ok);
  const res = parseAsn1((r as { ok: true; blocks: { bytes: Uint8Array | null }[] }).blocks[0].bytes!);
  const names = res.nodes.map((n) => n.summary);
  assert.ok(names.includes('commonName = "example.com"'));
  assert.ok(names.includes("extension keyUsage, critical"));
  assert.ok(names.includes("digitalSignature"));
  assert.ok(names.includes("serverAuth"));
  assert.ok(names.some((s) => s.startsWith("1.2.840.10045.3.1.7 (prime256v1")));
  // the signature BIT STRING encapsulates the ECDSA SEQUENCE { r, s }
  const sig = res.roots[0].children[2];
  assert.equal(sig.name, "BIT STRING");
  assert.ok(sig.encapsulated);
  assert.equal(sig.children[0].children.length, 2);
});
test("RSA SPKI: BIT STRING encapsulates RSAPublicKey with exponent 65537", () => {
  const r = decodeInput(readFileSync(`${FIX}/rsa-pub.pem`, "utf8"), "auto");
  const res = parseAsn1((r as { ok: true; blocks: { bytes: Uint8Array | null }[] }).blocks[0].bytes!);
  const bit = res.roots[0].children[1];
  assert.ok(bit.encapsulated);
  const [mod, exp] = bit.children[0].children;
  assert.equal(mod.summary, "2048 bit integer");
  assert.equal(exp.summary, "65537");
});
test("PKCS #8 private key: OCTET STRING encapsulates RSAPrivateKey", () => {
  const r = decodeInput(readFileSync(`${FIX}/rsa.key`, "utf8"), "auto");
  const res = parseAsn1((r as { ok: true; blocks: { bytes: Uint8Array | null }[] }).blocks[0].bytes!);
  const oct = res.roots[0].children[2];
  assert.ok(oct.encapsulated);
  assert.equal(oct.children[0].children.length, 9);
});

/* =====================================================================
 * Independent verifier cases (added by the verification pass).
 * ===================================================================== */
{
  const VFIX = new URL("./fixtures/verify-fixtures", import.meta.url).pathname;
  const parseHex = (s: string) => parseAsn1(hex(s));
  const issuesOf = (n: Asn1Node, level: "der" | "invalid") => n.issues.filter((i) => i.level === level).length;

  test("verify: X.690 8.14 tagging examples (Jones)", () => {
    const t1 = one("1A 05 4A 6F 6E 65 73");
    assert.equal(t1.name, "VisibleString");
    assert.equal(t1.summary, '"Jones"');
    const t2 = one("43 05 4A 6F 6E 65 73");
    assert.equal(t2.tagClass, "application");
    assert.equal(t2.tagNumber, 3);
    assert.equal(t2.constructed, false);
    assert.equal(t2.summary, '"Jones"');
    const t3 = one("A2 07 43 05 4A 6F 6E 65 73");
    assert.equal(t3.name, "[2]");
    assert.ok(t3.constructed);
    assert.equal(t3.children[0].name, "[APPLICATION 3]");
    const t4 = one("67 07 43 05 4A 6F 6E 65 73");
    assert.equal(t4.name, "[APPLICATION 7]");
    assert.ok(t4.constructed);
    const t5 = one("82 05 4A 6F 6E 65 73");
    assert.equal(t5.name, "[2]");
    assert.equal(t5.constructed, false);
  });

  test("verify: X.690 8.9 SEQUENCE {IA5String Smith, BOOLEAN TRUE}", () => {
    const r = parseHex("30 0A 16 05 53 6D 69 74 68 01 01 FF");
    assert.equal(r.errors.length, 0);
    assert.equal(r.derIssues + r.invalidIssues, 0);
    const [s, b] = r.roots[0].children;
    assert.equal(s.summary, '"Smith"');
    assert.equal(b.summary, "true");
  });

  test("verify: X.690 8.20.5 RELATIVE-OID {8571 3 2}", () => {
    const n = one("0D 04 C2 7B 03 02");
    assert.equal(n.name, "RELATIVE-OID");
    assert.equal(n.oid, "8571.3.2");
  });

  test("verify: OID first-arc boundaries (X.690 8.19.4)", () => {
    const cases: [string, string][] = [
      ["06 01 00", "0.0"],
      ["06 01 27", "0.39"],
      ["06 01 28", "1.0"],
      ["06 01 4F", "1.39"],
      ["06 01 50", "2.0"],
      ["06 02 88 37", "2.999"],
      ["06 09 60 86 48 01 65 03 04 02 01", "2.16.840.1.101.3.4.2.1"],
    ];
    for (const [h, want] of cases) assert.equal(one(h).oid, want, h);
  });

  test("verify: INTEGER two's complement boundaries (X.690 8.3)", () => {
    const cases: [string, string][] = [
      ["02 01 00", "0"],
      ["02 01 7F", "127"],
      ["02 02 00 80", "128"],
      ["02 02 01 00", "256"],
      ["02 01 80", "-128"],
      ["02 02 FF 7F", "-129"],
      ["02 01 FF", "-1"],
      ["02 08 7F FF FF FF FF FF FF FF", "9223372036854775807"],
      ["02 08 80 00 00 00 00 00 00 00", "-9223372036854775808"],
      ["02 09 00 FF FF FF FF FF FF FF FF", "18446744073709551615"],
    ];
    for (const [h, want] of cases) {
      const n = one(h);
      assert.equal(n.summary, want, h);
      assert.equal(n.issues.length, 0, h);
    }
    assert.equal(issuesOf(one("02 02 00 7F"), "invalid"), 1);
    assert.equal(issuesOf(one("02 02 FF 80"), "invalid"), 1);
    assert.equal(issuesOf(one("02 00"), "invalid"), 1);
    // 20 content bytes still decimal, 21 switch to a bit count.
    assert.equal(one("02 14 7F" + " FF".repeat(19)).summary, ((BigInt(1) << BigInt(159)) - BigInt(1)).toString());
    assert.equal(one("02 15 00" + " FF".repeat(20)).summary, "160 bit integer");
  });

  test("verify: length forms and DER minimality (X.690 8.1.3, 10.1)", () => {
    const long128 = parseHex("04 81 80" + " AA".repeat(128));
    assert.equal(long128.roots[0].length, 128);
    assert.equal(long128.roots[0].lengthForm, "long");
    assert.equal(long128.derIssues, 0);
    assert.equal(parseHex("04 81 05 01 02 03 04 05").derIssues, 1);
    assert.equal(parseHex("04 82 00 05 01 02 03 04 05").derIssues, 1);
    assert.ok(parseHex("04 FF").errors.length === 1);
    assert.ok(/indefinite/.test(parseHex("04 80 00 00").errors[0].message));
    assert.ok(/truncated/.test(parseHex("04 84 FF FF FF FF 00").errors[0].message));
    assert.ok(/truncated/.test(parseHex("30 05 02 01").errors[0].message));
  });

  test("verify: high tag number form (X.690 8.1.2.4)", () => {
    const a = one("5F 1F 00");
    assert.equal(a.tagClass, "application");
    assert.equal(a.tagNumber, 31);
    assert.equal(a.headerLength, 3);
    assert.equal(a.issues.length, 0);
    const c = one("9F 81 00 01 AA");
    assert.equal(c.tagClass, "context");
    assert.equal(c.tagNumber, 128);
    assert.equal(issuesOf(one("9F 1E 00"), "invalid"), 1);
    assert.equal(issuesOf(one("9F 80 01 00"), "invalid"), 2); // padding octet, and tag 1 in the long form
    assert.equal(issuesOf(one("9F 80 20 00"), "invalid"), 1); // padding octet only
  });

  test("verify: UTCTime and GeneralizedTime (X.680 46-47, X.690 11.7-11.8)", () => {
    const ascii = (s: string) => Array.from(s, (ch) => ch.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
    const len = (n: number) => (n < 128 ? n.toString(16).padStart(2, "0") : `81 ${n.toString(16).padStart(2, "0")}`);
    const tl = (tag: string, s: string) => `${tag} ${len(s.length)} ${ascii(s)}`;
    const u = one(tl("17", "910506234540Z"));
    assert.equal(u.summary, "1991-05-06 23:45:40 UTC");
    assert.equal(u.issues.length, 0);
    const noSec = one(tl("17", "8201021200Z"));
    assert.equal(noSec.summary, "1982-01-02 12:00:00 UTC");
    assert.equal(issuesOf(noSec, "der"), 1);
    assert.equal(one(tl("17", "491231235959Z")).summary, "2049-12-31 23:59:59 UTC");
    assert.equal(one(tl("17", "500101000000Z")).summary, "1950-01-01 00:00:00 UTC");
    const off = one(tl("17", "910506164540-0700"));
    assert.ok(off.summary.endsWith("UTC-07:00"));
    assert.equal(issuesOf(off, "der"), 1);
    assert.equal(one(tl("18", "19851106210627.3Z")).issues.length, 0);
    assert.equal(issuesOf(one(tl("18", "19851106210627.30Z")), "der"), 1);
    assert.equal(issuesOf(one(tl("18", "19851106210627,3Z")), "der"), 1);
    assert.equal(issuesOf(one(tl("18", "1985110621")), "der"), 2);
    assert.equal(issuesOf(one(tl("18", "20240230000000Z")), "invalid"), 1);
    assert.equal(one(tl("18", "20240229000000Z")).issues.length, 0);
    assert.equal(issuesOf(one(tl("18", "19000229000000Z")), "invalid"), 1);
    assert.equal(one(tl("18", "20000229000000Z")).issues.length, 0);
    // A 200 digit fraction is shown cut, not in full.
    const longFrac = one(tl("18", "20000229000000." + "1".repeat(200) + "Z"));
    assert.ok(longFrac.summary.length < 100, longFrac.summary);
  });

  test("verify: BIT STRING edge cases and named bits (X.690 8.6, RFC 5280 KeyUsage)", () => {
    const empty = one("03 01 00");
    assert.equal(empty.issues.length, 0);
    assert.ok(empty.summary.startsWith("0 bits"));
    assert.equal(issuesOf(one("03 01 01"), "invalid"), 1);
    assert.equal(issuesOf(one("03 02 08 00"), "invalid"), 1);
    const oneBit = one("03 02 07 80");
    assert.equal(oneBit.issues.length, 0);
    assert.equal(oneBit.fields.find((f) => f.label === "Set bits")?.value, "0");
    assert.equal(issuesOf(one("03 02 07 81"), "der"), 1);
    const nine = one("03 03 07 80 80");
    assert.equal(nine.fields.find((f) => f.label === "Set bits")?.value, "0, 8");
    // keyUsage extension, critical, 0x86 with 1 unused bit: bits 0, 5, 6.
    const ext = parseHex("30 0E 06 03 55 1D 0F 01 01 FF 04 04 03 02 01 86");
    assert.equal(ext.roots[0].summary, "extension keyUsage, critical");
    const bits = ext.roots[0].children[2].children[0];
    assert.equal(bits.summary, "digitalSignature, keyCertSign, cRLSign");
  });

  test("verify: SET OF ordering with zero padding (X.690 11.6)", () => {
    assert.equal(parseHex("31 06 02 01 02 02 01 01").derIssues, 1);
    assert.equal(parseHex("31 06 02 01 01 02 01 02").derIssues, 0);
    assert.equal(parseHex("31 07 04 01 01 04 02 01 00").derIssues, 0);
    assert.equal(parseHex("31 07 04 02 01 00 04 01 01").derIssues, 1);
  });

  test("verify: REAL special values (X.690 8.5.9)", () => {
    assert.equal(one("09 01 40").summary, "PLUS-INFINITY");
    assert.equal(one("09 01 41").summary, "MINUS-INFINITY");
    assert.equal(one("09 01 42").summary, "NOT-A-NUMBER");
    assert.equal(one("09 01 43").summary, "minus zero");
    assert.equal(one("09 00").summary, "0");
  });

  test("verify: an EC point whose second byte happens to fit is not read as DER", () => {
    // 04 || X || Y with X[0] = 0x3f: the bytes 04 3f ... form a clean OCTET STRING.
    const point = "04 3F" + " 11".repeat(63);
    const n = one("03 42 00 " + point);
    assert.equal(n.encapsulated, false);
    assert.equal(n.children.length, 0);
    // A DSA style BIT STRING holding one INTEGER is still expanded.
    const dsa = one("03 06 00 02 03 01 00 01");
    assert.ok(dsa.encapsulated);
    assert.equal(dsa.children[0].summary, "65537");
    // OCTET STRING inside OCTET STRING (subjectKeyIdentifier) is still expanded.
    const ski = one("04 06 04 04 DE AD BE EF");
    assert.ok(ski.encapsulated);
    assert.equal(ski.children[0].name, "OCTET STRING");
  });

  test("verify: OID arc and arc count caps are notes, not encoding errors, and fast", () => {
    const n = 4000;
    const bytes = new Uint8Array(n + 4);
    bytes.set([0x06, 0x82, n >> 8, n & 255]);
    bytes.fill(0xff, 4, 4 + n - 1);
    bytes[4 + n - 1] = 0x7f;
    let t = performance.now();
    const r = parseAsn1(bytes);
    assert.ok(performance.now() - t < 200);
    assert.equal(r.invalidIssues, 0);
    assert.ok(r.roots[0].note && /octets/.test(r.roots[0].note));
    const big = new Uint8Array(MAX_INPUT_BYTES);
    big.set([0x06, 0x83, (MAX_INPUT_BYTES - 5) >> 16, ((MAX_INPUT_BYTES - 5) >> 8) & 255, (MAX_INPUT_BYTES - 5) & 255]);
    big.fill(0xff, 5, MAX_INPUT_BYTES - 1);
    big[MAX_INPUT_BYTES - 1] = 0x7f;
    t = performance.now();
    parseAsn1(big);
    assert.ok(performance.now() - t < 500, "256 KiB single arc");
    const many = new Uint8Array(1003 + 4);
    many.set([0x06, 0x82, 0x03, 0xeb]);
    const m = parseAsn1(many);
    assert.equal(m.invalidIssues, 0);
    assert.ok(m.roots[0].note && /arcs/.test(m.roots[0].note));
    // A truncated huge arc is still reported as invalid.
    const cut = parseAsn1(hex("06 03 FF FF FF"));
    assert.equal(cut.invalidIssues, 1);
    // A 2.25 UUID arc (128 bits) still decodes in full.
    const r2 = decodeOid(hex("69 83 B5 D5 A1 F2 C7 E8 A9 C1 84 A7 82 9C F5 A0 E7 D9 F4 5F"));
    assert.ok(r2.ok);
  });

  test("verify: PEM scanning is linear and keeps the RFC 7468 semantics", () => {
    let t = performance.now();
    const r = decodeInput("-----BEGIN A-----\n".repeat(58_000), "auto");
    assert.ok(performance.now() - t < 300, "many BEGIN lines");
    assert.ok(!r.ok && /no matching END/.test(r.error));
    t = performance.now();
    decodeInput("-----BEGIN A-----BEGIN ".repeat(40_000), "auto");
    decodeInput("-----BEGIN X-----\n" + "-----END Y\n".repeat(50_000), "auto");
    assert.ok(performance.now() - t < 300, "dashes on one line, unclosed END lines");
    const der = "MAMCAQE=";
    const crlf = parsePem(`Certificate:\r\n    junk\r\n-----BEGIN CERTIFICATE-----\r\n${der}\r\n-----END CERTIFICATE-----\r\n`);
    assert.ok(crlf.ok && crlf.blocks.length === 1 && crlf.blocks[0].bytes?.length === 5);
    const two = parsePem(`-----BEGIN A-----\n${der}\n-----END A-----\n-----BEGIN B-----\n${der}\n-----END B-----`);
    assert.ok(two.ok && two.blocks.map((b) => b.label).join() === "A,B");
    const mismatch = parsePem(`-----BEGIN A-----\n${der}\n-----END B-----`);
    assert.ok(mismatch.ok && /must match/.test(mismatch.blocks[0].error ?? ""));
    // An END line that is not closed by dashes is skipped in favor of the next one.
    const skip = parsePem(`-----BEGIN A-----\n${der}\n-----END A\n-----END A-----`);
    assert.ok(skip.ok && skip.blocks[0].error !== null);
    const bom = decodeFileBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(`-----BEGIN A-----\n${der}\n-----END A-----\n`)]));
    assert.ok(bom.ok && bom.format === "pem");
  });

  /* Cross check against openssl asn1parse on fixtures the builder did not use. */
  const OPENSSL_NAMES: Record<string, string> = {
    rsassaPss: "1.2.840.113549.1.1.10",
    ED25519: "1.3.101.112",
    commonName: "2.5.4.3",
    countryName: "2.5.4.6",
    organizationName: "2.5.4.10",
    "ecdsa-with-SHA384": "1.2.840.10045.4.3.3",
    "ecdsa-with-SHA256": "1.2.840.10045.4.3.2",
    "X509v3 CRL Reason Code": "2.5.29.21",
    "X509v3 CRL Number": "2.5.29.20",
    "pkcs7-envelopedData": "1.2.840.113549.1.7.3",
    "pkcs7-data": "1.2.840.113549.1.7.1",
    "pkcs7-encryptedData": "1.2.840.113549.1.7.6",
    "id-ecPublicKey": "1.2.840.10045.2.1",
    "X509v3 Subject Alternative Name": "2.5.29.17",
    "X509v3 Key Usage": "2.5.29.15",
    "X509v3 Certificate Policies": "2.5.29.32",
    "X509v3 Subject Key Identifier": "2.5.29.14",
    "X509v3 Authority Key Identifier": "2.5.29.35",
    "X509v3 Basic Constraints": "2.5.29.19",
    sha256: "2.16.840.1.101.3.4.2.1",
    sha1: "1.3.14.3.2.26",
    mgf1: "1.2.840.113549.1.1.8",
    dhKeyAgreement: "1.2.840.113549.1.3.1",
    PBES2: "1.2.840.113549.1.5.13",
    PBKDF2: "1.2.840.113549.1.5.12",
    hmacWithSHA256: "1.2.840.113549.2.9",
    "aes-256-cbc": "2.16.840.1.101.3.4.1.42",
    pkcs8ShroudedKeyBag: "1.2.840.113549.1.12.10.1.2",
    certBag: "1.2.840.113549.1.12.10.1.3",
    x509Certificate: "1.2.840.113549.1.9.22.1",
    localKeyID: "1.2.840.113549.1.9.21",
    prime256v1: "1.2.840.10045.3.1.7",
    secp384r1: "1.3.132.0.34",
  };
  const vref = JSON.parse(readFileSync(`${VFIX}/asn1parse.json`, "utf8")) as Record<
    string,
    [number, number, number, number | "inf", boolean, string, string][]
  >;
  const flatten = (roots: Asn1Node[]): Asn1Node[] => {
    const out: Asn1Node[] = [];
    const walk = (n: Asn1Node) => {
      out.push(n);
      if (!n.encapsulated) n.children.forEach(walk);
    };
    roots.forEach(walk);
    return out;
  };
  for (const [file, rows] of Object.entries(vref)) {
    test(`verify: matches openssl asn1parse, values included: ${file}`, () => {
      const r = decodeFileBytes(new Uint8Array(readFileSync(`${VFIX}/${file}`)));
      assert.ok(r.ok && r.blocks[0].bytes);
      const res = parseAsn1(r.blocks[0].bytes!);
      assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
      const flat = flatten(res.roots);
      assert.equal(flat.length, rows.length, `${file}: node count`);
      let named = 0;
      rows.forEach(([off, depth, hl, len, cons, typ, val], i) => {
        const n = flat[i];
        const at = `${file} row ${i} (${typ})`;
        assert.equal(n.offset, off, `${at} offset`);
        assert.equal(n.depth, depth, `${at} depth`);
        assert.equal(n.headerLength, hl, `${at} hl`);
        assert.equal(n.constructed, cons, `${at} cons`);
        if (len === "inf") assert.equal(n.lengthForm, "indefinite", at);
        else assert.equal(n.length, len, `${at} len`);
        if (typ === "INTEGER") {
          const want = val.startsWith("-") ? -BigInt("0x" + val.slice(1)) : BigInt("0x" + val);
          const c = r.blocks[0].bytes!.subarray(n.contentStart, n.contentEnd);
          assert.equal(decodeIntegerBytes(c), want, at);
        }
        if (typ === "UTCTIME" || typ === "GENERALIZEDTIME") {
          assert.equal(n.fields.find((f) => f.label === "Raw")?.value, val, at);
          assert.equal(n.issues.length, 0, at);
        }
        if (typ === "OBJECT") {
          if (/^\d+(\.\d+)+$/.test(val)) assert.equal(n.oid, val, at);
          else if (OPENSSL_NAMES[val]) {
            assert.equal(n.oid, OPENSSL_NAMES[val], at);
            named++;
          }
        }
      });
      if (file !== "env-ber.der") assert.equal(res.derIssues, 0, `${file} der issues`);
      else assert.ok(res.derIssues > 0);
      assert.equal(res.invalidIssues, 0, `${file} invalid issues`);
      assert.ok(named > 0 || file === "dh.der", `${file}: some OIDs checked by name`);
    });
  }

  test("verify: CRL extension wrappers are expanded and labeled", () => {
    const r = decodeFileBytes(new Uint8Array(readFileSync(`${VFIX}/crl.der`)));
    const res = parseAsn1((r as { ok: true; blocks: { bytes: Uint8Array | null }[] }).blocks[0].bytes!);
    const reason = res.nodes.find((n) => n.summary === "extension cRLReason");
    assert.ok(reason);
    const oct = reason!.children[1];
    assert.ok(oct.encapsulated);
    assert.equal(oct.children[0].name, "ENUMERATED");
    assert.equal(oct.children[0].summary, "1");
    const num = res.nodes.find((n) => n.summary === "extension cRLNumber");
    assert.equal(num!.children[1].children[0].summary, "300");
  });

  test("verify: Ed25519 certificate keyUsage, SAN and policy are readable", () => {
    const r = decodeFileBytes(new Uint8Array(readFileSync(`${VFIX}/ed-cert.der`)));
    const res = parseAsn1((r as { ok: true; blocks: { bytes: Uint8Array | null }[] }).blocks[0].bytes!);
    assert.ok(res.nodes.some((n) => n.summary === "digitalSignature, keyCertSign, cRLSign"));
    assert.ok(res.nodes.some((n) => n.summary === "extension keyUsage, critical"));
    assert.ok(res.nodes.some((n) => n.oid === "2.23.140.1.2.1" && n.summary.includes("domain-validated")));
    assert.ok(res.nodes.some((n) => n.name === "[2]" && n.summary === '"ed.example"'));
    // The Ed25519 key is 32 raw bytes in the BIT STRING, not DER.
    const spki = res.nodes.find((n) => n.summary === "Ed25519");
    assert.ok(spki);
  });

  test("verify: hostile inputs never throw", () => {
    const inputs = ["", " ", "\u0000", "zz", "0x", "====", "-----BEGIN", "😀", "a".repeat(10_000), "30".repeat(100_000)];
    for (const s of inputs) {
      for (const f of ["auto", "pem", "base64", "hex"] as const) {
        const r = decodeInput(s, f);
        if (r.ok) for (const b of r.blocks) if (b.bytes) parseAsn1(b.bytes);
      }
    }
    // Deeply nested indefinite lengths stop at the depth cap with an error, not a stack overflow.
    const deep = parseAsn1(hex("30 80 ".repeat(5000)));
    assert.ok(deep.errors.length >= 1);
  });
}


/* =====================================================================
 * Second independent verifier pass (verify2). Reference values here come
 * from RFC 8017 9.2, X.690 and X.680, hand-built bytes, and fresh openssl
 * output compared row by row with `openssl asn1parse`.
 * ===================================================================== */
{
  const V2 = new URL("./fixtures/v2-fixtures", import.meta.url).pathname;
  const flat = (roots: Asn1Node[]): Asn1Node[] => {
    const out: Asn1Node[] = [];
    const walk = (n: Asn1Node) => {
      out.push(n);
      if (!n.encapsulated) n.children.forEach(walk);
    };
    roots.forEach(walk);
    return out;
  };

  test("verify2: RFC 8017 9.2 SHA-256 DigestInfo prefix parses as DER with the digest name", () => {
    const digest = "00".repeat(32);
    const r = parseAsn1(hex(`30 31 30 0d 06 09 60 86 48 01 65 03 04 02 01 05 00 04 20 ${digest}`));
    assert.equal(r.errors.length, 0);
    assert.equal(r.derIssues + r.invalidIssues, 0);
    assert.equal(r.consumed, 51);
    const root = r.roots[0];
    assert.equal(root.length, 0x31);
    const alg = root.children[0];
    assert.equal(alg.children[0].oid, "2.16.840.1.101.3.4.2.1");
    assert.ok(alg.children[0].summary.includes("sha256"));
    assert.equal(alg.children[1].name, "NULL");
    assert.equal(root.children[1].length, 32);
    assert.equal(root.children[1].end, 51);
  });

  test("verify2: an empty SEQUENCE in an OCTET STRING (basicConstraints CA:FALSE) is expanded, a NULL or a BIT STRING copy is not", () => {
    const leaf = parseAsn1(hex("30 0c 06 03 55 1d 13 01 01 ff 04 02 30 00"));
    assert.equal(leaf.errors.length, 0);
    const oct = leaf.roots[0].children[2];
    assert.ok(oct.encapsulated);
    assert.equal(oct.children[0].name, "SEQUENCE");
    assert.equal(oct.children[0].offset, 12);
    assert.equal(oct.children[0].children.length, 0);
    assert.equal(leaf.roots[0].summary, "extension basicConstraints, critical");
    assert.equal(one("04 02 05 00").encapsulated, false);
    assert.equal(one("04 02 02 00").encapsulated, false);
    assert.equal(one("04 01 30").encapsulated, false);
    assert.equal(one("03 03 00 30 00").encapsulated, false);
    assert.equal(one("04 02 31 00").encapsulated, true);
  });

  test("verify2: GeneralizedTime offsets +hh and +hhmm (X.680 section 46)", () => {
    const a = decodeGeneralizedTime("2023010112+01");
    assert.ok(a.ok && a.iso === "2023-01-01 12:00:00 UTC+01:00");
    const b = decodeGeneralizedTime("20230101120000-0530");
    assert.ok(b.ok && b.iso === "2023-01-01 12:00:00 UTC-05:30");
    const c = decodeGeneralizedTime("20230101120000.25Z");
    assert.ok(c.ok && c.iso === "2023-01-01 12:00:00.25 UTC" && c.issues.length === 0);
    for (const bad of ["20230101120000+1", "20230101120000+012", "2023010112+", "20231301120000Z", "20230101240000Z", "20230101126000Z"]) {
      assert.equal(decodeGeneralizedTime(bad).ok, false, bad);
    }
  });

  test("verify2: identifier octets with multi-octet tag numbers (X.690 8.1.2.4)", () => {
    const a = one("5f 81 49 00"); // [APPLICATION 201]: 1 * 128 + 73
    assert.equal(a.tagClass, "application");
    assert.equal(a.tagNumber, 201);
    assert.equal(a.headerLength, 4);
    assert.equal(a.name, "[APPLICATION 201]");
    const p = one("df ff 7f 00"); // [PRIVATE 16383]: 127 * 128 + 127
    assert.equal(p.tagClass, "private");
    assert.equal(p.tagNumber, 16383);
    assert.equal(p.constructed, false);
    const c = one("bf 1f 00"); // context, constructed, tag 31 is the first number that needs the long form
    assert.equal(c.tagNumber, 31);
    assert.equal(c.constructed, true);
    assert.equal(c.name, "[31]");
    // The largest tag this parser accepts is 2^32 - 1; one more is an error, not a wrong number.
    assert.equal(one("5f 8f ff ff ff 7f 00").tagNumber, 4294967295);
    const over = parseAsn1(hex("5f 90 80 80 80 00 00"));
    assert.equal(over.errors.length, 1);
  });

  test("verify2: BER indefinite length SEQUENCE (X.690 8.1.3.6) keeps exact offsets", () => {
    const r = parseAsn1(hex("30 80 02 01 05 00 00"));
    assert.equal(r.errors.length, 0);
    const seq = r.roots[0];
    assert.equal(seq.lengthForm, "indefinite");
    assert.equal(seq.length, 3);
    assert.equal(seq.contentEnd, 5);
    assert.equal(seq.end, 7);
    assert.equal(r.consumed, 7);
    assert.equal(r.derIssues, 1);
    assert.equal(r.invalidIssues, 0);
    assert.equal(seq.children[0].summary, "5");
    const eoc = seq.children[1];
    assert.equal(eoc.name, "EOC");
    assert.equal(eoc.offset, 5);
  });

  test("verify2: INTEGER summaries for values beyond 20 bytes and negative extremes", () => {
    const neg = one("02 15 80" + " 00".repeat(20)); // -2^167
    assert.equal(neg.summary, "negative 168 bit integer");
    assert.equal(neg.issues.length, 0);
    const pos = one("02 16 00 80" + " 00".repeat(20)); // 2^167
    assert.equal(pos.summary, "168 bit integer");
    assert.equal(pos.issues.length, 0);
    assert.equal(one("02 01 80").summary, "-128");
    assert.equal(one("02 02 80 00").summary, "-32768");
    assert.equal(one("02 03 00 80 00").summary, "32768");
    assert.equal(decodeIntegerBytes(hex("ff ff ff ff ff ff ff ff ff ff ff ff ff")), BigInt(-1));
    assert.equal(magnitudeBits(hex("80 00 00")), 24);
    assert.equal(magnitudeBits(hex("ff 7f")), 8);
  });

  test("verify2: OID encodings from the CA/Browser Forum and Microsoft arcs", () => {
    const ms = one("06 09 2b 06 01 04 01 82 37 15 07");
    assert.equal(ms.oid, "1.3.6.1.4.1.311.21.7");
    assert.ok(ms.summary.includes("certificateTemplate"));
    const sct = one("06 0a 2b 06 01 04 01 d6 79 02 04 02");
    assert.equal(sct.oid, "1.3.6.1.4.1.11129.2.4.2");
    assert.ok(sct.summary.includes("signedCertificateTimestampList"));
    assert.equal(one("06 08 2a 86 48 ce 3d 04 03 02").summary, "1.2.840.10045.4.3.2 (ecdsa-with-SHA256)");
    assert.equal(one("06 03 67 81 0c").oid, "2.23.140"); // first subidentifier 103 = 2.23
    assert.equal(one("06 05 2b 65 70 05 05").oid, "1.3.101.112.5.5");
  });

  test("verify2: strings, BMPString and UniversalString decoding", () => {
    assert.equal(one("1e 04 00 48 00 69").summary, '"Hi"');
    assert.equal(one("1e 03 00 48 00").issues.some((i) => i.level === "invalid"), true);
    assert.equal(one("1c 08 00 00 00 48 00 01 f6 00").summary, '"H\u{1F600}"');
    assert.equal(one("12 03 31 32 20").issues.length, 0);
    assert.ok(one("12 02 31 41").issues.some((i) => i.level === "invalid"));
    assert.equal(one("0c 05 c3 a9 e2 82 ac").summary, '"é€"');
    assert.ok(one("0c 02 c3 28").issues.some((i) => i.level === "invalid"));
    assert.equal(one("13 04 41 40 42 43").issues.length, 1); // '@' is not PrintableString
  });

  test("verify2: truncated and impossible encodings report an offset and never throw", () => {
    const cases: [string, RegExp][] = [
      ["30 03 02 01", /truncated|remain/],
      ["30 82", /length field needs/],
      ["02", /data ends before its length/],
      ["a0 80 02 01 05", /end-of-contents/],
      ["30 04 30 03 02 01 05", /inside the element that contains it/],
      ["06 80 00 00", /indefinite/],
      ["1f", /tag number continues/],
    ];
    for (const [h, re] of cases) {
      const r = parseAsn1(hex(h));
      assert.ok(r.errors.length >= 1, h);
      assert.ok(re.test(r.errors[0].message), `${h}: ${r.errors[0].message}`);
      assert.ok(Number.isInteger(r.errors[0].offset) && r.errors[0].offset >= 0);
    }
    // Trailing bytes after a complete element are parsed as the next top level element.
    const two = parseAsn1(hex("05 00 05 00"));
    assert.equal(two.roots.length, 2);
    assert.equal(two.errors.length, 0);
    const junk = parseAsn1(hex("05 00 ff"));
    assert.equal(junk.errors.length, 1);
    assert.equal(junk.consumed, 2);
  });

  test("verify2: input decoding for Base64, hex with prefixes, and text that is neither", () => {
    const b = decodeInput("MAMCAQE=", "auto");
    assert.ok(b.ok && b.format === "base64");
    assert.equal(parseAsn1((b as { ok: true; blocks: { bytes: Uint8Array }[] }).blocks[0].bytes).roots[0].children[0].summary, "1");
    const urlsafe = decodeInput("MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC-_w", "base64");
    assert.ok(urlsafe.ok);
    const h = decodeInput("0x30, 0x03, 0x02, 0x01, 0x05", "auto");
    assert.ok(h.ok && h.format === "hex");
    assert.equal(parseAsn1((h as { ok: true; blocks: { bytes: Uint8Array }[] }).blocks[0].bytes).roots[0].children[0].summary, "5");
    const colon = decodeInput("30:03:02:01:05", "auto");
    assert.ok(colon.ok && colon.format === "hex");
    for (const bad of ["é", "30 0g", "!!!!", "​", "=", "A=B="]) {
      const r = decodeInput(bad, "auto");
      if (r.ok) for (const bl of r.blocks) assert.ok(bl.bytes === null || parseAsn1(bl.bytes).errors.length >= 0);
      else assert.ok(r.error.length > 0);
    }
    assert.equal(decodeInput("   \n\t ", "auto").ok, false);
    assert.equal(decodeInput("30 0", "hex").ok, false);
    assert.equal(decodeInput("A", "base64").ok, false);
  });

  test("verify2: node cap leaves a readable summary on every ancestor", () => {
    // 21,000 NULLs inside one SEQUENCE: the cap hits partway through.
    const n = 21_000;
    const body = new Uint8Array(n * 2);
    for (let i = 0; i < n; i++) body.set([0x05, 0x00], i * 2);
    const bytes = new Uint8Array(4 + body.length);
    bytes.set([0x30, 0x82, (body.length >> 8) & 255, body.length & 255]);
    bytes.set(body, 4);
    const r = parseAsn1(bytes);
    assert.ok(r.nodeCapHit);
    assert.equal(r.nodes.length, MAX_NODES);
    assert.ok(r.roots[0].summary !== "");
  });

  for (const f of ["leaf.der", "smime.der", "cms.der", "p521.der", "ed448-pkcs8.der", "ed448-spki.der", "ts.tsq", "dsa-spki.der"]) {
    test(`verify2: matches openssl asn1parse on a fresh fixture: ${f}`, () => {
      const out = execFileSync("openssl", ["asn1parse", "-inform", "DER", "-in", `${V2}/${f}`, "-i"], { encoding: "utf8" });
      const rows = out
        .split("\n")
        .filter(Boolean)
        .map((l) => {
          const m = /^\s*(\d+):d=(\d+)\s+hl=\s*(\d+)\s+l=\s*(\S+)\s+(cons|prim):/.exec(l);
          assert.ok(m, l);
          return { off: Number(m![1]), depth: Number(m![2]), hl: Number(m![3]), len: m![4] === "inf" ? "inf" : Number(m![4]), cons: m![5] === "cons" };
        });
      const res = parseAsn1(new Uint8Array(readFileSync(`${V2}/${f}`)));
      assert.equal(res.errors.length, 0, JSON.stringify(res.errors));
      assert.equal(res.derIssues + res.invalidIssues, 0, f);
      const nodes = flat(res.roots);
      assert.equal(nodes.length, rows.length);
      rows.forEach((r, i) => {
        const n = nodes[i];
        assert.equal(n.offset, r.off, `${f} row ${i} offset`);
        assert.equal(n.depth, r.depth, `${f} row ${i} depth`);
        assert.equal(n.headerLength, r.hl, `${f} row ${i} header`);
        assert.equal(n.constructed, r.cons, `${f} row ${i} constructed`);
        if (r.len !== "inf") assert.equal(n.length, r.len, `${f} row ${i} length`);
      });
    });
  }

  test("verify2: a fresh leaf certificate reads back SAN, EKU, AIA and policies by name", () => {
    const res = parseAsn1(new Uint8Array(readFileSync(`${V2}/leaf.der`)));
    const text = res.nodes.map((n) => n.summary).join("\n");
    for (const want of [
      "extension basicConstraints, critical",
      "extension keyUsage, critical",
      "digitalSignature, keyEncipherment",
      "serverAuth, clientAuth, codeSigning",
      '"leaf.example.org"',
      '"*.example.org"',
      '"http://ocsp.example.org"',
      '"http://ca.example.org/ca.crt"',
      "domain-validated",
      '"http://example.org/cps"',
      "rsaEncryption",
      "sha256WithRSAEncryption",
    ]) {
      assert.ok(text.includes(want), want);
    }
    // The basicConstraints value is the expanded empty SEQUENCE.
    const bc = res.nodes.find((n) => n.summary === "extension basicConstraints, critical");
    assert.ok(bc!.children[2].encapsulated);
    assert.equal(bc!.children[2].children[0].children.length, 0);
    // The exponent and the 2048 bit modulus are inside the encapsulated BIT STRING.
    assert.ok(res.nodes.some((n) => n.summary === "65537"));
    assert.ok(res.nodes.some((n) => n.summary === "2048 bit integer"));
  });

  test("verify2: a PKCS #7 signed message carries signingTime as a UTCTime that passes the DER checks", () => {
    const res = parseAsn1(new Uint8Array(readFileSync(`${V2}/smime.der`)));
    const st = res.nodes.find((n) => n.oid === "1.2.840.113549.1.9.5");
    assert.ok(st);
    const set = res.nodes.find((n) => n.name === "UTCTime" && n.offset > st!.offset);
    assert.ok(set);
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(set!.summary), set!.summary);
    assert.equal(set!.issues.length, 0);
  });
}

console.log(`asn1-viewer: ${passed} tests passed`);
