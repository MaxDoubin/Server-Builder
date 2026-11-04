import assert from "node:assert/strict";
import {
  buildOtpauthUri,
  bytesToHex,
  counterBytes,
  decodeBase32,
  dynamicTruncate,
  encodeBase32,
  findMatches,
  generateOtp,
  groupBase32,
  parseOtpauthUri,
  parsePeriod,
  parseUint64,
  secondsRemaining,
  timeStep,
  UINT64_MAX,
  type OtpAlg,
  wellFormed,
} from "../../client/src/lib/toolkit/totp-generator.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const B = (n: number | string) => BigInt(n);
let passed = 0;
const ok = (label: string) => {
  passed++;
  void label;
};

/* ---------------- Base32, RFC 4648 section 10 test vectors */
const b32Vectors: [string, string][] = [
  ["", ""],
  ["f", "MY======"],
  ["fo", "MZXQ===="],
  ["foo", "MZXW6==="],
  ["foob", "MZXW6YQ="],
  ["fooba", "MZXW6YTB"],
  ["foobar", "MZXW6YTBOI======"],
];
for (const [plain, coded] of b32Vectors) {
  assert.equal(encodeBase32(enc(plain), true), coded, `encode ${plain}`);
  const d = decodeBase32(coded);
  assert.ok(d.ok, `decode ${coded}`);
  if (d.ok) assert.equal(new TextDecoder().decode(d.bytes), plain);
  // Unpadded and lowercase must decode the same.
  const d2 = decodeBase32(coded.replace(/=/g, "").toLowerCase());
  assert.ok(d2.ok);
  if (d2.ok) assert.equal(new TextDecoder().decode(d2.bytes), plain);
  ok("b32 " + plain);
}
// The RFC 6238 seed in Base32.
assert.equal(encodeBase32(enc("12345678901234567890")), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
// Spaces and hyphens tolerated.
{
  const d = decodeBase32("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq");
  assert.ok(d.ok);
  if (d.ok) assert.equal(new TextDecoder().decode(d.bytes), "12345678901234567890");
}
// Errors: misread digits, impossible lengths, pad in middle.
{
  const r0 = decodeBase32("JBSWY3DPEHPK3PX0");
  assert.ok(!r0.ok && /misread O/.test(r0.error));
  const r1 = decodeBase32("ABC");
  assert.ok(!r1.ok && /cannot be whole bytes/.test(r1.error), "3 chars impossible");
  const r2 = decodeBase32("A");
  assert.ok(!r2.ok);
  const r6 = decodeBase32("ABCDEF");
  assert.ok(!r6.ok);
  const rp = decodeBase32("MY==MY==");
  assert.ok(!rp.ok && /end/.test(rp.error));
  const rx = decodeBase32("MZXW6!TB");
  assert.ok(!rx.ok);
  const huge = decodeBase32("A".repeat(5000));
  assert.ok(!huge.ok);
  assert.equal(groupBase32("GEZDGNBVGY"), "GEZD GNBV GY");
  ok("b32 errors");
}

/* ---------------- counter bytes */
assert.equal(bytesToHex(counterBytes(B(1))), "0000000000000001");
assert.equal(bytesToHex(counterBytes(UINT64_MAX)), "ffffffffffffffff");
assert.equal(bytesToHex(counterBytes(B("0x27BC86AA"))), "0000000027bc86aa");
assert.throws(() => counterBytes(B(-1)));
assert.throws(() => counterBytes(UINT64_MAX + B(1)));

/* ---------------- RFC 4226 section 5.4 truncation example */
{
  const hmac = Uint8Array.from(Buffer.from("1f8698690e02ca16618550ef7f19da8e945b555a", "hex"));
  const t = dynamicTruncate(hmac, 6);
  assert.equal(t.offset, 10);
  assert.equal(bytesToHex(t.selected), "50ef7f19");
  assert.equal(t.binCode, 0x50ef7f19);
  assert.equal(t.binCode, 1357872921);
  assert.equal(t.code, "872921");
  ok("4226 5.4");
}
// Top bit must be masked: a word with the high bit set.
{
  const h = new Uint8Array(20);
  h[0] = 0xff; h[1] = 0xff; h[2] = 0xff; h[3] = 0xff; h[19] = 0x00;
  const t = dynamicTruncate(h, 8);
  assert.equal(t.word, 0xffffffff);
  assert.equal(t.binCode, 0x7fffffff);
  assert.equal(t.code, String(0x7fffffff % 1e8).padStart(8, "0"));
  // Offset 15 reads bytes 15..18.
  const h2 = new Uint8Array(20);
  h2[19] = 0x0f; h2[15] = 0x00; h2[16] = 0x00; h2[17] = 0x00; h2[18] = 0x07;
  const t2 = dynamicTruncate(h2, 6);
  assert.equal(t2.offset, 15);
  assert.equal(t2.code, "000007", "leading zeros kept");
}

/* ---------------- RFC 4226 Appendix D */
async function main() {
  const seed = enc("12345678901234567890");
  const hotp = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
  const hmacs = [
    "cc93cf18508d94934c64b65d8ba7667fb7cde4b0",
    "75a48a19d4cbe100644e8ac1397eea747a2d33ab",
    "0bacb7fa082fef30782211938bc1c5e70416ff44",
    "66c28227d03a2d5529262ff016a1e6ef76557ece",
    "a904c900a64b35909874b33e61c5938a8e15ed1c",
    "a37e783d7b7233c083d4f62926c7a25f238d0316",
    "bc9cd28561042c83f219324d3c607256c03272ae",
    "a4fb960c0bc06e1eabb804e5b397cdc4b45596fa",
    "1b3c89f65e6c9e883012052823443f048b4332db",
    "1637409809a679dc698207310c8c7fc07290d9e5",
  ];
  const truncHex = ["4c93cf18", "41397eea", "082fef30", "66ef7655", "61c5938a", "33c083d4", "7256c032", "04e5b397", "2823443f", "2679dc69"];
  for (let i = 0; i < 10; i++) {
    const r = await generateOtp(seed, B(i), "SHA-1", 6);
    assert.equal(r.code, hotp[i], `HOTP count ${i}`);
    assert.equal(bytesToHex(r.hmac), hmacs[i], `HMAC count ${i}`);
    assert.equal(r.truncation.binCode.toString(16).padStart(8, "0"), truncHex[i], `trunc ${i}`);
  }
  ok("4226 D");

  /* ---------------- RFC 6238 Appendix B (seeds per the reference implementation) */
  const seeds: Record<OtpAlg, Uint8Array> = {
    "SHA-1": enc("12345678901234567890"),
    "SHA-256": enc("12345678901234567890123456789012"),
    "SHA-512": enc("1234567890123456789012345678901234567890123456789012345678901234"),
  };
  const table: [string, string, string, string, string][] = [
    ["59", "0000000000000001", "94287082", "46119246", "90693936"],
    ["1111111109", "00000000023523EC", "07081804", "68084774", "25091201"],
    ["1111111111", "00000000023523ED", "14050471", "67062674", "99943326"],
    ["1234567890", "000000000273EF07", "89005924", "91819424", "93441116"],
    ["2000000000", "0000000003F940AA", "69279037", "90698825", "38618901"],
    ["20000000000", "0000000027BC86AA", "65353130", "77737706", "47863826"],
  ];
  for (const [time, tHex, s1, s256, s512] of table) {
    const T = timeStep(B(time), 30);
    assert.equal(T.toString(16).toUpperCase().padStart(16, "0"), tHex, `T at ${time}`);
    assert.equal((await generateOtp(seeds["SHA-1"], T, "SHA-1", 8)).code, s1, `SHA1 ${time}`);
    assert.equal((await generateOtp(seeds["SHA-256"], T, "SHA-256", 8)).code, s256, `SHA256 ${time}`);
    assert.equal((await generateOtp(seeds["SHA-512"], T, "SHA-512", 8)).code, s512, `SHA512 ${time}`);
  }
  ok("6238 B");
  // The headline vector from the task spec.
  assert.equal((await generateOtp(enc("12345678901234567890"), timeStep(B(59), 30), "SHA-1", 8)).code, "94287082");
  // 6 digits is the last 6 of the 31 bit value: 94287082 -> 287082 (and equals HOTP count 1).
  assert.equal((await generateOtp(seed, B(1), "SHA-1", 6)).code, "287082");

  /* ---------------- time helpers */
  assert.equal(secondsRemaining(B(59), 30), 1);
  assert.equal(secondsRemaining(B(60), 30), 30);
  assert.equal(secondsRemaining(B(0), 30), 30);
  assert.equal(timeStep(B(100), 30, B(10)), B(3));

  /* ---------------- findMatches window */
  {
    const T = timeStep(B(1111111111), 30);
    const prev = (await generateOtp(seed, T - B(1), "SHA-1", 6)).code;
    const m = await findMatches(seed, "SHA-1", 6, prev, T, 1, 1);
    assert.deepEqual(m, [T - B(1)]);
    const none = await findMatches(seed, "SHA-1", 6, prev, T, 0, 0);
    assert.deepEqual(none, []);
    // Clamped at 0.
    const m0 = await findMatches(seed, "SHA-1", 6, "755224", B(0), 5, 0);
    assert.deepEqual(m0, [B(0)]);
    // Clamped at UINT64_MAX without throwing.
    const mx = await findMatches(seed, "SHA-1", 6, "000000", UINT64_MAX, 0, 3);
    assert.ok(Array.isArray(mx));
    // HOTP look-ahead: code for counter 7 found from counter 2.
    const la = await findMatches(seed, "SHA-1", 6, "162583", B(2), 0, 10);
    assert.deepEqual(la, [B(7)]);
  }

  /* ---------------- integer parsing */
  {
    assert.deepEqual(parseUint64("18446744073709551615", "counter"), { ok: true, value: UINT64_MAX });
    assert.ok(!parseUint64("18446744073709551616", "counter").ok);
    assert.ok(!parseUint64("-1", "counter").ok);
    assert.ok(!parseUint64("1.5", "counter").ok);
    assert.ok(!parseUint64("", "counter").ok);
    assert.ok(!parseUint64("9".repeat(500), "counter").ok);
    assert.deepEqual(parseUint64("000000000000000000000000007", "counter"), { ok: true, value: B(7) });
    assert.deepEqual(parsePeriod("30"), { ok: true, value: 30 });
    assert.ok(!parsePeriod("0").ok);
    assert.ok(!parsePeriod("86401").ok);
    assert.ok(!parsePeriod("abc").ok);
    assert.ok(!parsePeriod("-5").ok);
  }

  /* ---------------- otpauth URIs */
  {
    const r = parseOtpauthUri("otpauth://totp/Example:alice@google.com?secret=JBSWY3DPEHPK3PXP&issuer=Example");
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.value.type, "totp");
      assert.equal(r.value.issuer, "Example");
      assert.equal(r.value.account, "alice@google.com");
      assert.equal(r.value.algorithm, "SHA-1");
      assert.equal(r.value.digits, 6);
      assert.equal(r.value.period, 30);
      assert.equal(r.value.counter, null);
      assert.equal(bytesToHex(r.value.secret), "48656c6c6f21deadbeef");
    }
    const r2 = parseOtpauthUri(
      "OTPAUTH://TOTP/ACME%20Co:john.doe%40email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=sha256&digits=8&period=60",
    );
    assert.ok(r2.ok);
    if (r2.ok) {
      assert.equal(r2.value.issuer, "ACME Co");
      assert.equal(r2.value.account, "john.doe@email.com");
      assert.equal(r2.value.algorithm, "SHA-256");
      assert.equal(r2.value.digits, 8);
      assert.equal(r2.value.period, 60);
      assert.equal(r2.value.warnings.length, 0);
    }
    const h = parseOtpauthUri("otpauth://hotp/Svc:bob?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Svc&counter=5");
    assert.ok(h.ok && h.value.type === "hotp" && h.value.counter === B(5));
    const hNoCounter = parseOtpauthUri("otpauth://hotp/bob?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    assert.ok(hNoCounter.ok && hNoCounter.value.counter === B(0) && hNoCounter.value.warnings.some((w) => /counter/.test(w)));
    const mismatch = parseOtpauthUri("otpauth://totp/A:bob?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=B");
    assert.ok(mismatch.ok && mismatch.value.warnings.some((w) => /label says/.test(w)) && mismatch.value.issuer === "B");
    const short = parseOtpauthUri("otpauth://totp/A:bob?secret=JBSWY3DPEHPK3PXP&issuer=A");
    assert.ok(short.ok && short.value.warnings.some((w) => /RFC 4226/.test(w)));
    // Errors
    for (const bad of [
      "otpauth://totp/A:bob",
      "otpauth://totp/A:bob?secret=",
      "otpauth://totp/A:bob?secret=0000",
      "otpauth://sotp/A:bob?secret=JBSWY3DPEHPK3PXP",
      "otpauth://totp/A:bob?secret=JBSWY3DPEHPK3PXP&algorithm=MD5",
      "otpauth://totp/A:bob?secret=JBSWY3DPEHPK3PXP&digits=10",
      "otpauth://totp/A:bob?secret=JBSWY3DPEHPK3PXP&digits=6x",
      "otpauth://totp/A:bob?secret=JBSWY3DPEHPK3PXP&period=0",
      "otpauth://hotp/A:bob?secret=JBSWY3DPEHPK3PXP&counter=-1",
      "otpauth://hotp/A:bob?secret=JBSWY3DPEHPK3PXP&counter=99999999999999999999999",
      "otpauth://totp/A%ZZ:bob?secret=JBSWY3DPEHPK3PXP",
      "http://example.com",
      "otpauth://totp",
      "otpauth://totp/x?secret=" + "A".repeat(5000),
    ]) {
      const res = parseOtpauthUri(bad);
      assert.ok(!res.ok, `should reject ${bad.slice(0, 60)}`);
      if (!res.ok) assert.ok(res.error.length > 10 && !res.error.includes("—"));
    }
    // Round trip
    const uri = buildOtpauthUri({
      type: "totp",
      issuer: "ACME Co",
      account: "john.doe@email.com",
      secretBase32: "HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ",
      algorithm: "SHA-512",
      digits: 8,
      period: 60,
      counter: B(0),
    });
    assert.equal(
      uri,
      "otpauth://totp/ACME%20Co:john.doe%40email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA512&digits=8&period=60",
    );
    const back = parseOtpauthUri(uri);
    assert.ok(back.ok && back.value.algorithm === "SHA-512" && back.value.issuer === "ACME Co" && back.value.digits === 8);
    const hUri = buildOtpauthUri({ type: "hotp", issuer: "", account: "", secretBase32: "GEZDGNBVGY3TQOJQ", algorithm: "SHA-1", digits: 6, period: 30, counter: B(42) });
    assert.equal(hUri, "otpauth://hotp/account?secret=GEZDGNBVGY3TQOJQ&algorithm=SHA1&digits=6&counter=42");
  }
  ok("uri");


  /* ================= Independent verifier additions ================= */
  {
    const { createHmac, randomBytes } = await import("node:crypto");
    // Independent HOTP straight from RFC 4226 section 5.3, using node:crypto.
    const nodeAlg: Record<OtpAlg, string> = { "SHA-1": "sha1", "SHA-256": "sha256", "SHA-512": "sha512" };
    const refHotp = (key: Uint8Array, c: bigint, alg: OtpAlg, digits: number): string => {
      const buf = Buffer.alloc(8);
      buf.writeBigUInt64BE(c);
      const h = createHmac(nodeAlg[alg], key).update(buf).digest();
      const off = h[h.length - 1] & 0xf;
      const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
      return String(bin % 10 ** digits).padStart(digits, "0");
    };
    // Independent RFC 4648 Base32 decoder for cross-checking.
    const refB32 = (s: string): Buffer => {
      const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let bits = "";
      for (const ch of s) bits += A.indexOf(ch).toString(2).padStart(5, "0");
      const out: number[] = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
      return Buffer.from(out);
    };

    // 1. RFC 4226 Appendix D truncated decimal values give the 7 and 8 digit codes.
    const truncDec = [1284755224, 1094287082, 137359152, 1726969429, 1640338314, 868254676, 1918287922, 82162583, 673399871, 645520489];
    for (let i = 0; i < 10; i++) {
      for (const d of [6, 7, 8]) {
        const want = String(truncDec[i] % 10 ** d).padStart(d, "0");
        assert.equal((await generateOtp(seed, B(i), "SHA-1", d)).code, want, `4226 count ${i} digits ${d}`);
      }
    }
    assert.equal((await generateOtp(seed, B(0), "SHA-1", 8)).code, "84755224");
    assert.equal((await generateOtp(seed, B(7), "SHA-1", 8)).code, "82162583");
    assert.equal((await generateOtp(seed, B(2), "SHA-1", 7)).code, "7359152");

    // 2. Step boundaries with T0 = 0, X = 30: 29 -> 0, 30 -> 1, 59 -> 1, 60 -> 2.
    assert.equal(timeStep(B(29), 30), B(0));
    assert.equal(timeStep(B(30), 30), B(1));
    assert.equal(timeStep(B(59), 30), B(1));
    assert.equal(timeStep(B(60), 30), B(2));
    assert.equal((await generateOtp(seed, timeStep(B(29), 30), "SHA-1", 8)).code, "84755224");
    assert.equal((await generateOtp(seed, timeStep(B(60), 30), "SHA-1", 8)).code, "37359152");
    // Period 60: time 119 is still T = 1.
    assert.equal((await generateOtp(seed, timeStep(B(119), 60), "SHA-1", 8)).code, "94287082");
    assert.equal(secondsRemaining(B(119), 60), 1);
    // Past 2038 and the 2^32 second mark: T keeps going.
    assert.equal(timeStep(B(2) ** B(32), 30), B(143165576));
    assert.equal(timeStep(UINT64_MAX, 1), UINT64_MAX);

    // 3. Random cross-check against node:crypto, including counters near 2^63 and 2^64.
    const counters = [B(0), B(1), B(2) ** B(31), B(2) ** B(32), B(2) ** B(63) - B(1), B(2) ** B(63), UINT64_MAX - B(1), UINT64_MAX];
    for (let i = 0; i < 120; i++) {
      const alg = (["SHA-1", "SHA-256", "SHA-512"] as OtpAlg[])[i % 3];
      const key = randomBytes([1, 10, 16, 20, 32, 64, 65, 129, 200][i % 9]);
      const c = i < counters.length ? counters[i] : BigInt.asUintN(64, randomBytes(8).readBigUInt64BE());
      const d = 6 + (i % 3);
      assert.equal((await generateOtp(key, c, alg, d)).code, refHotp(key, c, alg, d), `fuzz ${i}`);
    }

    // 4. Base32 cross-check on random keys, grouped, lowercased and unpadded.
    for (let i = 0; i < 60; i++) {
      const k = randomBytes(i);
      const e = encodeBase32(k);
      assert.ok(refB32(e).equals(k));
      const messy = groupBase32(e).toLowerCase();
      const d = decodeBase32(messy);
      assert.ok(d.ok && Buffer.from(d.bytes).equals(k), `b32 round trip ${i}`);
    }

    // 5. Malformed and adversarial secrets: non-ASCII letters that uppercase to
    // ASCII (sharp s, dotless i, the ff ligature) must be rejected, not silently
    // turned into Base32 letters.
    for (const bad of ["ßAAAAAA", "ıIIIIIII", "ﬀAAAAAA", "GEZDGNBVK", "AB\u{1F600}CD", "GEZD!GNBV", "GE\u0000ZD"]) {
      const r = decodeBase32(bad);
      assert.ok(!r.ok, `reject ${JSON.stringify(bad)}`);
      if (!r.ok) {
        assert.ok(!/[\uD800-\uDFFF]/.test(r.error.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")), "no lone surrogate in error");
        assert.ok(!r.error.includes("\u0000"), "control characters are described, not echoed");
      }
    }
    // Error positions count what was typed, spaces included.
    {
      const r = decodeBase32("GEZD GNB0");
      assert.ok(!r.ok && /Character 9\b/.test(r.error), !r.ok ? r.error : "");
    }
    // Only padding is zero bytes, not an error, and never a crash.
    {
      const r = decodeBase32("======");
      assert.ok(r.ok && r.bytes.length === 0);
      assert.ok(!decodeBase32("=======").ok);
      assert.ok(decodeBase32("").ok);
      assert.ok(!decodeBase32(" ".repeat(100000)).ok || decodeBase32(" ".repeat(100000)).ok);
    }

    // 6. Key URI edge cases.
    {
      const dup = parseOtpauthUri("otpauth://totp/A:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&secret=AAAA&secret=BBBB&issuer=A");
      assert.ok(dup.ok);
      if (dup.ok) {
        assert.equal(new Set(dup.value.warnings).size, dup.value.warnings.length, "warnings are unique (they are React keys)");
        assert.equal(bytesToHex(dup.value.secret), bytesToHex(enc("12345678901234567890")), "first secret wins");
      }
      const emptyIssuer = parseOtpauthUri("otpauth://totp/A:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=");
      assert.ok(emptyIssuer.ok && emptyIssuer.value.issuer === "A");
      if (emptyIssuer.ok) assert.ok(!emptyIssuer.value.warnings.some((w) => /label says/.test(w)), "an empty issuer is not a conflicting issuer");
      const encColon = parseOtpauthUri("otpauth://totp/ACME%3Abob?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ACME");
      assert.ok(encColon.ok && encColon.value.issuer === "ACME" && encColon.value.account === "bob");
      const spaced = parseOtpauthUri("otpauth://totp/A:b?secret=gezd%20gnbv%20gy3t%20qojq%20gezd%20gnbv%20gy3t%20qojq&issuer=A");
      assert.ok(spaced.ok && bytesToHex(spaced.value.secret) === bytesToHex(enc("12345678901234567890")));
      const sha512 = parseOtpauthUri("otpauth://totp/A:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=A&algorithm=SHA-512&digits=7");
      assert.ok(sha512.ok && sha512.value.algorithm === "SHA-512" && sha512.value.digits === 7);
      const big = parseOtpauthUri("otpauth://hotp/A:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=A&counter=18446744073709551615");
      assert.ok(big.ok && big.value.counter === UINT64_MAX);
      const unicode = parseOtpauthUri("otpauth://totp/%E2%9C%93:%F0%9F%98%80?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=%E2%9C%93");
      assert.ok(unicode.ok && unicode.value.issuer === "✓" && unicode.value.account === "\u{1F600}");
      assert.ok(!parseOtpauthUri("otpauth://totp/A:b?secret=%C3%9FAAAAAA&issuer=A").ok, "sharp s in a URI secret");
    }
  }

  /* ================= Second independent verifier (reference values from Python's hmac and base64) ================= */
  {
    // A. RFC 4648 Base32 of the RFC 6238 SHA-256 and SHA-512 seeds (Python base64.b32encode).
    const b32_32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA====";
    const b32_64 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA=";
    assert.equal(encodeBase32(enc("12345678901234567890123456789012"), true), b32_32);
    assert.equal(encodeBase32(enc("1234567890123456789012345678901234567890123456789012345678901234"), true), b32_64);
    for (const [b32, plain] of [[b32_32, "12345678901234567890123456789012"], [b32_64, "1234567890123456789012345678901234567890123456789012345678901234"]]) {
      const d = decodeBase32(b32.toLowerCase().replace(/=/g, ""));
      assert.ok(d.ok && new TextDecoder().decode(d.bytes) === plain);
    }
    // 7 characters (remainder 7) is a legal final group: "foob".
    {
      const d = decodeBase32("mzxw6yq");
      assert.ok(d.ok && new TextDecoder().decode(d.bytes) === "foob");
    }

    // B. RFC 6238 Appendix B at 6 digits: Snum mod 10^6 is the last six digits of the 8 digit value.
    const s32 = enc("12345678901234567890123456789012");
    const s64 = enc("1234567890123456789012345678901234567890123456789012345678901234");
    assert.equal((await generateOtp(s32, B(1), "SHA-256", 6)).code, "119246");
    assert.equal((await generateOtp(s64, B(1), "SHA-512", 6)).code, "693936");
    assert.equal((await generateOtp(seed, B("0x23523EC"), "SHA-1", 6)).code, "081804", "leading zero kept (07081804)");
    assert.equal((await generateOtp(seed, B("0x23523EC"), "SHA-1", 7)).code, "7081804");

    // C. Values computed independently with Python hmac + struct.pack(">Q").
    const gk = decodeBase32("JBSWY3DPEHPK3PXP");
    assert.ok(gk.ok);
    if (gk.ok) {
      assert.equal((await generateOtp(gk.bytes, timeStep(B(1700000000), 30), "SHA-1", 6)).code, "324550");
      assert.equal((await generateOtp(gk.bytes, timeStep(B(0), 30), "SHA-1", 6)).code, "282760");
      assert.equal((await generateOtp(gk.bytes, timeStep(B(2147483648), 30), "SHA-1", 6)).code, "583145", "the 2038 boundary");
      assert.equal((await generateOtp(gk.bytes, timeStep(B(4102444800), 30), "SHA-1", 6)).code, "573258", "year 2100");
    }
    assert.equal(timeStep(B(1111111109), 60), B(18518518));
    assert.equal((await generateOtp(seed, timeStep(B(1111111109), 60), "SHA-1", 8)).code, "19360094", "period 60");
    assert.equal((await generateOtp(s32, B(2) ** B(32), "SHA-256", 7)).code, "6351443", "counter 2^32");
    assert.equal((await generateOtp(s64, UINT64_MAX, "SHA-512", 6)).code, "226760", "counter 2^64 - 1");
    assert.equal((await generateOtp(seed, B(2) ** B(63), "SHA-1", 8)).code, "17959616", "counter 2^63 (top bit of C set)");

    // D. Lone surrogates: encodeURIComponent throws on them, so the URI builder must not.
    assert.equal(wellFormed("a\uD800b"), "a\uFFFDb");
    assert.equal(wellFormed("\uDC00"), "\uFFFD");
    assert.equal(wellFormed("x\uD83D"), "x\uFFFD");
    assert.equal(wellFormed("\u{1F600}\u00e9"), "\u{1F600}\u00e9", "valid pairs are untouched");
    const lone = buildOtpauthUri({ type: "totp", issuer: "A\uD800", account: "b\uDC00", secretBase32: "GEZDGNBVGY3TQOJQ", algorithm: "SHA-1", digits: 6, period: 30, counter: B(0) });
    assert.ok(lone.startsWith("otpauth://totp/A%EF%BF%BD:b%EF%BF%BD?"), lone);
    // A raw lone surrogate inside a pasted URI label survives decodeURIComponent; building from it must not throw either.
    const pasted = parseOtpauthUri("otpauth://totp/Acme:bo\uD800b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Acme");
    assert.ok(pasted.ok);
    if (pasted.ok) {
      assert.doesNotThrow(() => buildOtpauthUri({ type: "totp", issuer: pasted.value.issuer ?? "", account: pasted.value.account, secretBase32: pasted.value.secretBase32, algorithm: "SHA-1", digits: 6, period: 30, counter: B(0) }));
    }

    // E. Key URI details: "+" in a query value is a space, a trailing fragment is ignored, and a period on a TOTP URI is honored.
    {
      const plus = parseOtpauthUri("otpauth://totp/ACME%20Co:bob?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=ACME+Co");
      assert.ok(plus.ok && plus.value.issuer === "ACME Co" && !plus.value.warnings.some((w) => /label says/.test(w)));
      const frag = parseOtpauthUri("otpauth://totp/A:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=A#ignored");
      assert.ok(frag.ok && frag.value.issuer === "A");
      const p15 = parseOtpauthUri("otpauth://totp/A:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=A&period=15");
      assert.ok(p15.ok && p15.value.period === 15);
      const hp = parseOtpauthUri("otpauth://hotp/A:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=A&counter=3&period=60");
      assert.ok(hp.ok && hp.value.warnings.some((w) => /no meaning for HOTP/.test(w)));
      const tc = parseOtpauthUri("otpauth://totp/A:b?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=A&counter=3");
      assert.ok(tc.ok && tc.value.counter === null && tc.value.warnings.some((w) => /no meaning for TOTP/.test(w)));
      // 128 bits exactly is not warned about; 120 bits is.
      const k128 = encodeBase32(new Uint8Array(16).fill(7));
      const k120 = encodeBase32(new Uint8Array(15).fill(7));
      const w128 = parseOtpauthUri(`otpauth://totp/A:b?secret=${k128}&issuer=A`);
      const w120 = parseOtpauthUri(`otpauth://totp/A:b?secret=${k120}&issuer=A`);
      assert.ok(w128.ok && w128.value.warnings.length === 0);
      assert.ok(w120.ok && w120.value.warnings.some((w) => /120 bits/.test(w)));
    }

    // F. Malformed input: exact messages, never a throw.
    {
      const long = decodeBase32("A ".repeat(1100));
      assert.ok(!long.ok && /2200 characters/.test(long.error) && /2048/.test(long.error), !long.ok ? long.error : "");
      const mid = decodeBase32("MZXW6===YTBO");
      assert.ok(!mid.ok && /end/.test(mid.error));
      const eight = decodeBase32("GEZD8NBV");
      assert.ok(!eight.ok && /misread B/.test(eight.error) && /Character 5\b/.test(eight.error));
      const one = decodeBase32("GEZD1NBV");
      assert.ok(!one.ok && /misread I or L/.test(one.error));
      const ctl = decodeBase32("GEZD\u007fNBV");
      assert.ok(!ctl.ok && /U\+007F/.test(ctl.error));
      assert.ok(!parsePeriod("").ok);
      assert.ok(!parsePeriod("1e3").ok, "exponent notation is not a whole number of seconds");
      assert.ok(!parsePeriod("\u0663\u0660").ok, "Arabic-Indic digits are rejected");
      assert.deepEqual(parsePeriod(" 86400 "), { ok: true, value: 86400 });
      assert.ok(!parseUint64("0x10", "counter").ok);
      assert.ok(!parseUint64("+5", "counter").ok);
      assert.ok(!parseUint64("\uFF15", "counter").ok, "fullwidth digit five");
    }
  }

  console.log(`totp-generator: all assertions passed (${passed} groups)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
