import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import {
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  computeHmac,
  diagnoseMismatch,
  HMAC_ALGS,
  HMAC_EXAMPLES,
  hmacSteps,
  matchExample,
  MAX_KEY_BYTES,
  MAX_MESSAGE_BYTES,
  parseBase64,
  parseBytes,
  parseExpectedMac,
  parseHex,
  timingSafeEqual,
  utf8Encode,
  verifyMac,
  labelAlg,
  MAX_EXPECTED_CHARS,
  type HmacAlg,
} from "../../client/src/lib/toolkit/hmac-generator.ts";

const nodeName: Record<HmacAlg, string> = { "SHA-1": "sha1", "SHA-256": "sha256", "SHA-384": "sha384", "SHA-512": "sha512" };
const node = (alg: HmacAlg, key: Uint8Array, msg: Uint8Array) => createHmac(nodeName[alg], key).update(msg).digest("hex");
const hex = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));
const concatBytes = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

async function main() {
  /* ---------------- RFC 4231 section 4 (and RFC 2202 for SHA-1) */
  const vectors: { key: Uint8Array; data: Uint8Array; exp: Partial<Record<HmacAlg, string>>; truncate?: number }[] = [
    // case 1
    {
      key: hex("0b".repeat(20)),
      data: utf8Encode("Hi There"),
      exp: {
        "SHA-1": "b617318655057264e28bc0b6fb378c8ef146be00",
        "SHA-256": "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
        "SHA-384": "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6",
        "SHA-512": "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
      },
    },
    // case 2
    {
      key: utf8Encode("Jefe"),
      data: utf8Encode("what do ya want for nothing?"),
      exp: {
        "SHA-1": "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79",
        "SHA-256": "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
        "SHA-384": "af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649",
        "SHA-512": "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737",
      },
    },
    // case 3
    {
      key: hex("aa".repeat(20)),
      data: hex("dd".repeat(50)),
      exp: {
        "SHA-1": "125d7342b9ac11cd91a39af48aa17b4f63f175d3",
        "SHA-256": "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe",
        "SHA-512": "fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb",
      },
    },
    // case 6 (key longer than block size)
    {
      key: hex("aa".repeat(131)),
      data: utf8Encode("Test Using Larger Than Block-Size Key - Hash Key First"),
      exp: {
        "SHA-256": "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
        "SHA-384": "4ece084485813e9088d2c63a041bc5b44f9ef1012a2b588f3cd11f05033ac4c60c2ef6ab4030fe8296248df163f44952",
        "SHA-512": "80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598",
      },
    },
    // case 7
    {
      key: hex("aa".repeat(131)),
      data: utf8Encode(
        "This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.",
      ),
      exp: {
        "SHA-256": "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2",
        "SHA-512": "e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58",
      },
    },
  ];
  for (const v of vectors) {
    for (const [alg, want] of Object.entries(v.exp) as [HmacAlg, string][]) {
      const mac = bytesToHex(await computeHmac(alg, v.key, v.data));
      assert.equal(mac, want, `WebCrypto ${alg}`);
      assert.equal(node(alg, v.key, v.data), want, `node cross-check ${alg}`);
      const steps = await hmacSteps(alg, v.key, v.data);
      assert.equal(bytesToHex(steps.mac), want, `manual construction ${alg}`);
      assert.equal(steps.keyHashed, v.key.length > steps.blockBytes);
    }
  }
  // RFC 4231 case 5: truncation to 128 bits.
  {
    const key = hex("0c".repeat(20));
    const data = utf8Encode("Test With Truncation");
    const mac = await computeHmac("SHA-256", key, data);
    assert.equal(bytesToHex(mac.subarray(0, 16)), "a3b6167473100ee06e0c796c2955552b");
    const provided = hex("a3b6167473100ee06e0c796c2955552b");
    assert.deepEqual(verifyMac(mac, provided), { kind: "truncated-match", bytes: 16 });
  }

  /* ---------------- examples table agrees with the computation */
  for (const ex of HMAC_EXAMPLES) {
    const k = parseBytes(ex.key, ex.keyFormat, MAX_KEY_BYTES, "key");
    const m = parseBytes(ex.message, ex.messageFormat, MAX_MESSAGE_BYTES, "message");
    assert.ok(k.ok && m.ok);
    if (!k.ok || !m.ok) continue;
    for (const [alg, want] of Object.entries(ex.expected) as [HmacAlg, string][]) {
      assert.equal(bytesToHex(await computeHmac(alg, k.bytes, m.bytes)), want, `${ex.id} ${alg}`);
    }
    assert.equal(matchExample(k.bytes, m.bytes)?.id, ex.id);
  }
  assert.equal(matchExample(utf8Encode("x"), utf8Encode("y")), null);

  /* ---------------- empty key and empty message */
  {
    const empty = new Uint8Array(0);
    for (const a of HMAC_ALGS) {
      const want = node(a.id, empty, empty);
      assert.equal(bytesToHex(await computeHmac(a.id, empty, empty)), want, `empty ${a.id}`);
      assert.equal(bytesToHex((await hmacSteps(a.id, empty, empty)).mac), want);
    }
    assert.equal(
      bytesToHex(await computeHmac("SHA-256", empty, empty)),
      "b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad",
    );
  }

  /* ---------------- random fuzz against node, including keys at and around the block size */
  for (let i = 0; i < 200; i++) {
    const a = HMAC_ALGS[i % 4];
    const keyLen = [0, 1, 63, 64, 65, 127, 128, 129, 300][i % 9];
    const key = randomBytes(keyLen);
    const msg = randomBytes(i * 7);
    const want = node(a.id, key, msg);
    assert.equal(bytesToHex(await computeHmac(a.id, key, msg)), want);
    assert.equal(bytesToHex((await hmacSteps(a.id, key, msg)).mac), want);
  }

  /* ---------------- hex parsing */
  {
    const h = parseHex("0x DE:AD be ef\n00");
    assert.ok(h.ok && bytesToHex(h.bytes) === "deadbeef00");
    const odd = parseHex("abc");
    assert.ok(!odd.ok && /3 digits/.test(odd.error));
    const bad = parseHex("abzz");
    assert.ok(!bad.ok && /"z" at position 3/.test(bad.error));
    const ctrl = parseHex("ab\u0000c");
    assert.ok(!ctrl.ok && /U\+0000/.test(ctrl.error));
    const emoji = parseHex("ab\u{1F600}");
    assert.ok(!emoji.ok);
    assert.ok(parseHex("").ok);
  }

  /* ---------------- base64 parsing, RFC 4648 section 10 vectors */
  {
    const vecs: [string, string][] = [["", ""], ["f", "Zg=="], ["fo", "Zm8="], ["foo", "Zm9v"], ["foob", "Zm9vYg=="], ["fooba", "Zm9vYmE="], ["foobar", "Zm9vYmFy"]];
    for (const [plain, coded] of vecs) {
      assert.equal(bytesToBase64(utf8Encode(plain)), coded);
      const d = parseBase64(coded);
      assert.ok(d.ok && new TextDecoder().decode(d.bytes) === plain);
      const d2 = parseBase64(coded.replace(/=/g, ""));
      assert.ok(d2.ok && new TextDecoder().decode(d2.bytes) === plain);
    }
    for (let i = 0; i < 100; i++) {
      const b = randomBytes(i);
      assert.equal(bytesToBase64(b), Buffer.from(b).toString("base64"));
      assert.equal(bytesToBase64Url(b), Buffer.from(b).toString("base64url"));
      const back = parseBase64(Buffer.from(b).toString("base64url"));
      assert.ok(back.ok && Buffer.from(back.bytes).equals(b));
    }
    assert.ok(!parseBase64("Zg=a").ok);
    assert.ok(!parseBase64("Zg===").ok);
    assert.ok(!parseBase64("Z").ok);
    assert.ok(!parseBase64("Zm9v!").ok);
    assert.ok(!parseBase64("Zm8==").ok, "wrong padding count");
    assert.ok(parseBase64("Zm9v\nYmFy").ok);
  }

  /* ---------------- caps */
  {
    const big = parseBytes("a".repeat(MAX_MESSAGE_BYTES + 1), "text", MAX_MESSAGE_BYTES, "message");
    assert.ok(!big.ok && /over the 1 MiB/.test(big.error));
    const bigHex = parseBytes("ab".repeat(MAX_KEY_BYTES + 1), "hex", MAX_KEY_BYTES, "key");
    assert.ok(!bigHex.ok && /64 KiB/.test(bigHex.error));
    const hugeHex = parseBytes("ab".repeat(4_000_000), "hex", MAX_KEY_BYTES, "key");
    assert.ok(!hugeHex.ok);
    const fits = parseBytes("ab".repeat(MAX_KEY_BYTES), "hex", MAX_KEY_BYTES, "key");
    assert.ok(fits.ok);
  }

  /* ---------------- constant-time compare and verify */
  {
    const a = hex("00112233");
    assert.equal(timingSafeEqual(a, hex("00112233")), true);
    assert.equal(timingSafeEqual(a, hex("00112234")), false);
    assert.equal(timingSafeEqual(a, hex("001122")), false);
    assert.equal(timingSafeEqual(new Uint8Array(0), new Uint8Array(0)), true);
    const mac = await computeHmac("SHA-256", utf8Encode("Jefe"), utf8Encode("what do ya want for nothing?"));
    assert.deepEqual(verifyMac(mac, mac.slice()), { kind: "match" });
    const flipped = mac.slice();
    flipped[31] ^= 1;
    assert.deepEqual(verifyMac(mac, flipped), { kind: "mismatch" });
    assert.deepEqual(verifyMac(mac, mac.slice(0, 8)), { kind: "length", provided: 8, computed: 32, prefixChecked: false });
    assert.deepEqual(verifyMac(mac, mac.slice(0, 16)), { kind: "truncated-match", bytes: 16 });
    const wrongPrefix = mac.slice(0, 16);
    wrongPrefix[0] ^= 1;
    assert.deepEqual(verifyMac(mac, wrongPrefix), { kind: "length", provided: 16, computed: 32, prefixChecked: true });
    // SHA-1 truncation floor is 80 bits (10 bytes), not half of 20.
    const sha1 = await computeHmac("SHA-1", utf8Encode("k"), utf8Encode("m"));
    assert.deepEqual(verifyMac(sha1, sha1.slice(0, 10)), { kind: "truncated-match", bytes: 10 });
    assert.deepEqual(verifyMac(sha1, sha1.slice(0, 9)), { kind: "length", provided: 9, computed: 20, prefixChecked: false });
    // A longer MAC than the output is a plain length mismatch.
    assert.deepEqual(verifyMac(sha1, mac), { kind: "length", provided: 32, computed: 20, prefixChecked: false });
  }

  /* ---------------- expected MAC parsing */
  {
    const gh = parseExpectedMac("sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843", "auto");
    assert.ok(gh.ok && gh.prefix === "sha256" && gh.format === "hex" && gh.bytes.length === 32);
    const b64 = parseExpectedMac("W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM=", "auto");
    assert.ok(b64.ok && b64.format === "base64" && bytesToHex(b64.bytes) === "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    assert.ok(!parseExpectedMac("sha256=", "auto").ok);
    assert.ok(!parseExpectedMac("zz", "hex").ok);
    assert.ok(!parseExpectedMac("ab".repeat(65), "hex").ok);
    const forced = parseExpectedMac("abcd", "base64");
    assert.ok(forced.ok && forced.format === "base64" && forced.bytes.length === 3);
  }

  /* ---------------- diagnosis */
  {
    const key = "Jefe";
    const msg = "what do ya want for nothing?";
    // Provided is SHA-1 while SHA-256 is selected.
    const sha1 = await computeHmac("SHA-1", utf8Encode(key), utf8Encode(msg));
    const d1 = await diagnoseMismatch(sha1, key, "text", msg, "text", "SHA-256");
    assert.ok(d1 && d1.alg === "SHA-1" && d1.changes.length === 1);
    // Provided was made with a trailing newline.
    const nl = await computeHmac("SHA-256", utf8Encode(key), utf8Encode(msg + "\n"));
    const d2 = await diagnoseMismatch(nl, key, "text", msg, "text", "SHA-256");
    assert.ok(d2 && d2.changes.some((c) => /trailing newline/.test(c)));
    // Key meant as hex but typed in text mode.
    const hk = "0b".repeat(20);
    const hexKeyMac = await computeHmac("SHA-256", hex(hk), utf8Encode("Hi There"));
    const d3 = await diagnoseMismatch(hexKeyMac, hk, "text", "Hi There", "text", "SHA-256");
    assert.ok(d3 && d3.changes.some((c) => /read as hex/.test(c)));
    // Nothing explains a random MAC.
    const d4 = await diagnoseMismatch(randomBytes(32), key, "text", msg, "text", "SHA-256");
    assert.equal(d4, null);
    // Impossible length: no algorithm fits.
    assert.equal(await diagnoseMismatch(randomBytes(5), key, "text", msg, "text", "SHA-256"), null);
  }


  /* ================= Independent verifier additions ================= */
  {
    const check = async (alg: HmacAlg, key: Uint8Array, data: Uint8Array, want: string, label: string) => {
      assert.equal(node(alg, key, data), want, `node agrees with the published value: ${label}`);
      assert.equal(bytesToHex(await computeHmac(alg, key, data)), want, `WebCrypto: ${label}`);
      assert.equal(bytesToHex((await hmacSteps(alg, key, data)).mac), want, `manual construction: ${label}`);
    };
    // 1. RFC 4231 test case 4: a 25 byte key 0x01..0x19 and 50 bytes of 0xcd.
    const k4 = Uint8Array.from({ length: 25 }, (_, i) => i + 1);
    const d4 = hex("cd".repeat(50));
    await check("SHA-256", k4, d4, "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b", "4231 case 4 SHA-256");
    await check("SHA-384", k4, d4, "3e8a69b7783c25851933ab6290af6ca77a9981480850009cc5577c6e1f573b4e6801dd23c4a7d679ccf8a386c674cffb", "4231 case 4 SHA-384");
    await check("SHA-512", k4, d4, "b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3dba91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd", "4231 case 4 SHA-512");
    // RFC 2202 test case 4 for SHA-1 uses the same inputs.
    await check("SHA-1", k4, d4, "4c9007f4026250c6bc8414f9bf50c86c2d7235da", "2202 case 4");
    // 2. RFC 4231 case 3 and case 7 with SHA-384, which the earlier tests skipped.
    await check("SHA-384", hex("aa".repeat(20)), hex("dd".repeat(50)), "88062608d3e6ad8a0aa2ace014c8a86f0aa635d947ac9febe83ef4e55966144b2a5ab39dc13814b94e3ab6e101a34f27", "4231 case 3 SHA-384");
    await check(
      "SHA-384",
      hex("aa".repeat(131)),
      utf8Encode("This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm."),
      "6617178e941f020d351e2f254e8fd32c602420feb0b8fb9adccebb82461e99c5a678cc31e799176d3860e6110c46523e",
      "4231 case 7 SHA-384",
    );
    // 3. RFC 2202 SHA-1 cases 5, 6 and 7 (80 byte key, longer than SHA-1's 64 byte block).
    const k5 = hex("0c".repeat(20));
    const sha1c5 = await computeHmac("SHA-1", k5, utf8Encode("Test With Truncation"));
    assert.equal(bytesToHex(sha1c5), "4c1a03424b55e07fe7f27be1d58bb9324a9a5a04");
    // HMAC-SHA-1-96, the truncated value RFC 2202 lists, verifies as a truncated MAC (96 >= 80 bits).
    assert.deepEqual(verifyMac(sha1c5, hex("4c1a03424b55e07fe7f27be1")), { kind: "truncated-match", bytes: 12 });
    await check("SHA-1", hex("aa".repeat(80)), utf8Encode("Test Using Larger Than Block-Size Key - Hash Key First"), "aa4ae5e15272d00e95705637ce8a3b55ed402112", "2202 case 6");
    await check(
      "SHA-1",
      hex("aa".repeat(80)),
      utf8Encode("Test Using Larger Than Block-Size Key and Larger Than One Block-Size Data"),
      "e8e99d0f45237d786d6bbaa7965c7808bbff1a91",
      "2202 case 7",
    );
    // 4. The widely published "key" / quick brown fox values.
    const fox = utf8Encode("The quick brown fox jumps over the lazy dog");
    await check("SHA-1", utf8Encode("key"), fox, "de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9", "fox SHA-1");
    await check("SHA-256", utf8Encode("key"), fox, "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8", "fox SHA-256");
    await check(
      "SHA-512",
      utf8Encode("key"),
      fox,
      "b42af09057bac1e2d41708e48a902e09b5ff7f12ab428a4fe86653c73dd248fb82f948a549f7b791a5b41915ee4d1ec3935357e4e2317250d0372afa2ebeeb3a",
      "fox SHA-512",
    );
    // 5. Empty key and message with SHA-1, and the RFC 2104 quirks the notes describe:
    // trailing zero bytes on a short key change nothing, and a long key equals its hash.
    await check("SHA-1", new Uint8Array(0), new Uint8Array(0), "fbdb1d1b18aa6c08324b7d64b71fb76370690e1d", "empty SHA-1");
    {
      const m = utf8Encode("msg");
      const a = await computeHmac("SHA-256", utf8Encode("Jefe"), m);
      const b = await computeHmac("SHA-256", concatBytes(utf8Encode("Jefe"), new Uint8Array(10)), m);
      assert.equal(bytesToHex(a), bytesToHex(b), "zero padded key gives the same MAC");
      const long = randomBytes(100);
      const hashed = new Uint8Array(await crypto.subtle.digest("SHA-256", long));
      assert.equal(bytesToHex(await computeHmac("SHA-256", long, m)), bytesToHex(await computeHmac("SHA-256", hashed, m)), "long key equals its hash");
      const steps = await hmacSteps("SHA-256", long, m);
      assert.equal(bytesToHex(steps.k0.subarray(0, 32)), bytesToHex(hashed));
      assert.ok(steps.k0.subarray(32).every((x) => x === 0));
    }
    // 6. UTF-8: non-ASCII text is hashed as UTF-8 bytes, and a lone surrogate becomes U+FFFD (ef bf bd).
    assert.equal(bytesToHex(utf8Encode("é\u{1F600}")), "c3a9f09f9880");
    assert.equal(bytesToHex(utf8Encode("a\uD800b")), "61efbfbd62");
    await check("SHA-256", utf8Encode("clé"), utf8Encode("\u{1F600}"), node("SHA-256", Buffer.from("clé", "utf8"), Buffer.from("\u{1F600}", "utf8")), "utf8");
    // 7. Malformed and adversarial input never throws.
    {
      const r0x = parseExpectedMac("0x", "auto");
      assert.ok(!r0x.ok, "a bare 0x is not a MAC");
      const rsp = parseExpectedMac("   ", "auto");
      assert.ok(!rsp.ok);
      const rlabel = parseExpectedMac("sha256=0x", "auto");
      assert.ok(!rlabel.ok);
      assert.ok(!parseHex("0x0x00").ok);
      assert.ok(!parseHex("ßß").ok);
      assert.ok(!parseBase64("Zm9v​YmFy").ok, "zero width space is not Base64");
      const huge = "x".repeat(MAX_MESSAGE_BYTES * 3);
      const t0 = Date.now();
      const hr = parseBytes(huge, "text", MAX_MESSAGE_BYTES, "message");
      assert.ok(!hr.ok && /1 MiB/.test(hr.error));
      assert.ok(Date.now() - t0 < 2000);
      const exact = parseBytes("x".repeat(MAX_MESSAGE_BYTES), "text", MAX_MESSAGE_BYTES, "message");
      assert.ok(exact.ok && exact.bytes.length === MAX_MESSAGE_BYTES, "exactly the cap is accepted");
      const multi = parseBytes("€".repeat(349526), "text", MAX_MESSAGE_BYTES, "message");
      assert.ok(!multi.ok, "3 byte characters over the cap after encoding");
      assert.ok(!parseBytes("ab".repeat(MAX_MESSAGE_BYTES * 3), "base64", MAX_MESSAGE_BYTES, "message").ok);
    }
    // 8. The diagnosis search is bounded: count the HMACs it can run in the worst case.
    {
      let calls = 0;
      const realSign = crypto.subtle.sign.bind(crypto.subtle);
      (crypto.subtle as { sign: typeof crypto.subtle.sign }).sign = ((...args: Parameters<typeof crypto.subtle.sign>) => {
        calls++;
        return realSign(...args);
      }) as typeof crypto.subtle.sign;
      // A Base64-looking text key ("abcd") and a text message: three key readings,
      // three message variants, and a 32 byte MAC fits SHA-256, -384 and -512.
      const r = await diagnoseMismatch(randomBytes(32), "abcd", "text", "hello", "text", "SHA-256");
      (crypto.subtle as { sign: typeof crypto.subtle.sign }).sign = realSign;
      assert.equal(r, null);
      assert.ok(calls <= 27, `diagnosis ran ${calls} HMACs`);
      assert.ok(calls > 12, `the worst case is more than a dozen (${calls}); the comments must not claim a dozen`);
    }
    // 9. Labels name the algorithm; labelAlg maps them for the mismatch note.
    {
      assert.equal(labelAlg("sha1"), "SHA-1");
      assert.equal(labelAlg("sha-256"), "SHA-256");
      assert.equal(labelAlg("SHA384"), "SHA-384");
      assert.equal(labelAlg("sha-512"), "SHA-512");
      assert.equal(labelAlg(null), null);
    }
  }

  /* ================= Second independent verifier (published values, and Python's hmac for the rest) ================= */
  {
    const both = async (alg: HmacAlg, key: Uint8Array, data: Uint8Array, want: string, label: string) => {
      assert.equal(bytesToHex(await computeHmac(alg, key, data)), want, `WebCrypto: ${label}`);
      assert.equal(bytesToHex((await hmacSteps(alg, key, data)).mac), want, `construction: ${label}`);
    };
    // A. GitHub's documented webhook example: secret "It's a Secret to Everybody",
    // payload "Hello, World!", X-Hub-Signature-256 sha256=757107ea...
    const gh = "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
    await both("SHA-256", utf8Encode("It's a Secret to Everybody"), utf8Encode("Hello, World!"), gh, "GitHub docs");
    {
      const parsed = parseExpectedMac(`sha256=${gh}`, "auto");
      assert.ok(parsed.ok && parsed.prefix === "sha256" && parsed.format === "hex");
      if (parsed.ok) {
        const mac = await computeHmac("SHA-256", utf8Encode("It's a Secret to Everybody"), utf8Encode("Hello, World!"));
        assert.deepEqual(verifyMac(mac, parsed.bytes), { kind: "match" });
        assert.equal(labelAlg(parsed.prefix), "SHA-256");
      }
    }

    // B. RFC 4231 test case 5 truncations (128 bits) for SHA-384 and SHA-512, checked through verifyMac.
    {
      const k5 = hex("0c".repeat(20));
      const d5 = utf8Encode("Test With Truncation");
      const m384 = await computeHmac("SHA-384", k5, d5);
      const m512 = await computeHmac("SHA-512", k5, d5);
      assert.equal(bytesToHex(m384.subarray(0, 16)), "3abf34c3503b2a23a46efc619baef897");
      assert.equal(bytesToHex(m512.subarray(0, 16)), "415fad6271580a531d4179bc891d87a6");
      // 16 bytes is under half of SHA-384 (24) and SHA-512 (32), so RFC 2104 section 5 would not
      // recommend it; the tool reports a length mismatch with the prefix checked, not a match.
      assert.deepEqual(verifyMac(m384, hex("3abf34c3503b2a23a46efc619baef897")), { kind: "length", provided: 16, computed: 48, prefixChecked: false });
      assert.deepEqual(verifyMac(m512.subarray(0, 64), hex("415fad6271580a531d4179bc891d87a6")).kind, "length");
      // At exactly half it is a truncated match, one byte less is not.
      assert.deepEqual(verifyMac(m512, m512.slice(0, 32)), { kind: "truncated-match", bytes: 32 });
      assert.equal(verifyMac(m512, m512.slice(0, 31)).kind, "length");
      assert.deepEqual(verifyMac(m384, m384.slice(0, 24)), { kind: "truncated-match", bytes: 24 });
      // SHA-1: 80 bits (10 bytes) is the floor, 72 bits is under it.
      const s1 = await computeHmac("SHA-1", k5, d5);
      assert.deepEqual(verifyMac(s1, s1.slice(0, 10)), { kind: "truncated-match", bytes: 10 });
      assert.equal(verifyMac(s1, s1.slice(0, 9)).kind, "length");
      // A wrong byte in a truncated MAC is a mismatch of the prefix.
      const bad = s1.slice(0, 12);
      bad[11] ^= 1;
      assert.deepEqual(verifyMac(s1, bad), { kind: "length", provided: 12, computed: 20, prefixChecked: true });
      // One flipped bit at either end of a full MAC.
      const f0 = s1.slice(); f0[0] ^= 0x80;
      const f19 = s1.slice(); f19[19] ^= 0x01;
      assert.deepEqual(verifyMac(s1, f0), { kind: "mismatch" });
      assert.deepEqual(verifyMac(s1, f19), { kind: "mismatch" });
    }

    // C. Keys at the block size boundaries, values from Python hmac.
    await both("SHA-256", Uint8Array.from({ length: 64 }, (_, i) => i), utf8Encode("block"), "0c4195064dd4ca79599d2b8508c3f4c5f3805080dd6b451ca30e7d2da73a2c3d", "64 byte key, exactly B");
    await both("SHA-256", Uint8Array.from({ length: 65 }, (_, i) => i), utf8Encode("block"), "14f952ab1b86c57b32f958d5d1eff16dcf0b87097624748296dc953e05da894b", "65 byte key, hashed");
    await both("SHA-512", Uint8Array.from({ length: 128 }, (_, i) => i), utf8Encode("block"), "fe3b51aa0cdee6724c5031b730053a4ddce3d88787fb8c09c61c1ec0b74db91edf89bf7e2a3dce311856e3927b7f8060741a43b3de68faaf15909d65948d946a", "128 byte key, exactly B");
    await both("SHA-384", Uint8Array.from({ length: 129 }, (_, i) => i % 256), utf8Encode("block"), "157fdb8543a06d10df6e1d7a5833cae15cbe8376ec280e772be745378022c943a436e104363a01b649ded8f5dc203ab4", "129 byte key, hashed");
    {
      const st64 = await hmacSteps("SHA-256", new Uint8Array(64), utf8Encode("x"));
      assert.equal(st64.keyHashed, false);
      const st65 = await hmacSteps("SHA-256", new Uint8Array(65), utf8Encode("x"));
      assert.equal(st65.keyHashed, true);
      const st128 = await hmacSteps("SHA-384", new Uint8Array(128), utf8Encode("x"));
      assert.equal(st128.keyHashed, false, "SHA-384 has a 128 byte block");
      assert.equal(st128.k0.length, 128);
    }

    // D. Empty key and message for SHA-384 and SHA-512 (Python hmac), through the 0x00 stand-in.
    await both("SHA-384", new Uint8Array(0), new Uint8Array(0), "6c1f2ee938fad2e24bd91298474382ca218c75db3d83e114b3d4367776d14d3551289e75e8209cd4b792302840234adc", "empty SHA-384");
    await both("SHA-512", new Uint8Array(0), new Uint8Array(0), "b936cee86c9f87aa5d3c6f2e84cb5a4239a5fe50480a6ec66b70ab5b1f4ac6730c6c515421b327ec1d69402e53dfb49ad7381eb067b338fd7b0cb22247225d47", "empty SHA-512");

    // E. UTF-8 text and a CRLF message (Python hmac).
    await both("SHA-256", utf8Encode("clé"), utf8Encode("naïve \u2603 \u{1F600}"), "bc04f440473f579254bf0ae04158164b54e80ef8aeba1ab43ff0f30daf202e05", "UTF-8");
    await both("SHA-1", utf8Encode("secret"), utf8Encode("payload\r\n"), "8027c4aca2118f177d0292dfc58e193e3b4a80ef", "CRLF");
    {
      // The diagnosis names a missing CRLF.
      const d = await diagnoseMismatch(hex("8027c4aca2118f177d0292dfc58e193e3b4a80ef"), "secret", "text", "payload", "text", "SHA-1");
      assert.ok(d && d.changes.some((c) => /CRLF/.test(c)), JSON.stringify(d));
      // And a key meant as hex but typed as text is found the other way round too.
      const k = "0b".repeat(20);
      const d2 = await diagnoseMismatch(hex("b617318655057264e28bc0b6fb378c8ef146be00"), k, "text", "Hi There", "text", "SHA-1");
      assert.ok(d2 && d2.changes.some((c) => /read as hex instead of UTF-8 text/.test(c)), JSON.stringify(d2));
      // A MAC that matches nothing gives null rather than a guess.
      assert.equal(await diagnoseMismatch(new Uint8Array(20), "secret", "text", "payload", "text", "SHA-1"), null);
      // A length no algorithm produces skips the search.
      assert.equal(await diagnoseMismatch(new Uint8Array(5), "secret", "text", "payload", "text", "SHA-1"), null);
    }

    // F. Parsing the formats people paste.
    {
      const colon = parseHex("0B:0B:0b");
      assert.ok(colon.ok && bytesToHex(colon.bytes) === "0b0b0b");
      const upperX = parseHex("  0X0b0b\n0b ");
      assert.ok(upperX.ok && bytesToHex(upperX.bytes) === "0b0b0b");
      const odd = parseHex("0b0");
      assert.ok(!odd.ok && /3 digits/.test(odd.error));
      const nb = parseHex("0b\u00a00b");
      assert.ok(!nb.ok && /position 3/.test(nb.error), "a no-break space is not a separator here");
      const url = parseBase64("-_-_");
      assert.ok(url.ok && bytesToHex(url.bytes) === "fbffbf", "RFC 4648 section 5: - is 62 and _ is 63");
      assert.equal(bytesToHex(url.ok ? url.bytes : new Uint8Array()), Buffer.from("+/+/", "base64").toString("hex"));
      const wrapped = parseBase64("SGkg\nVGhl\r\ncmU=");
      assert.ok(wrapped.ok && new TextDecoder().decode(wrapped.bytes) === "Hi There");
      const unpadded = parseBase64("SGkgVGhlcmU");
      assert.ok(unpadded.ok && new TextDecoder().decode(unpadded.bytes) === "Hi There");
      const badPad = parseBase64("SGkgVGhlcmU==");
      assert.ok(!badPad.ok && /padding does not match/.test(badPad.error));
      assert.equal(bytesToBase64Url(hex("fbff")), "-_8");
      // Labels with spaces or a colon, and the Base64 a signature header might carry.
      const sp = parseExpectedMac("SHA-256 : " + gh, "auto");
      assert.ok(sp.ok && sp.prefix === "sha-256" && sp.bytes.length === 32);
      const b64 = parseExpectedMac(Buffer.from(gh, "hex").toString("base64"), "auto");
      assert.ok(b64.ok && b64.format === "base64" && bytesToHex(b64.bytes) === gh);
      const forcedHexOnB64 = parseExpectedMac(Buffer.from(gh, "hex").toString("base64"), "hex");
      assert.ok(!forcedHexOnB64.ok);
      const tooLong = parseExpectedMac("a".repeat(MAX_EXPECTED_CHARS + 1), "auto");
      assert.ok(!tooLong.ok && /128 hex digits/.test(tooLong.error));
      const t0 = Date.now();
      assert.ok(!parseExpectedMac("ab".repeat(5_000_000), "hex").ok);
      assert.ok(Date.now() - t0 < 200, "a pasted megabyte is refused before it is walked");
      const over = parseExpectedMac("00".repeat(65), "hex");
      assert.ok(!over.ok && /65 bytes/.test(over.error));
    }

    // G. matchExample short-circuits on length and still finds the examples.
    {
      const t0 = Date.now();
      for (let i = 0; i < 20; i++) assert.equal(matchExample(utf8Encode("Jefe"), new Uint8Array(MAX_MESSAGE_BYTES)), null);
      assert.ok(Date.now() - t0 < 500, `matchExample on 1 MiB took ${Date.now() - t0} ms for 20 calls`);
      assert.equal(matchExample(utf8Encode("Jefe"), utf8Encode("what do ya want for nothing?"))?.id, "rfc4231-2");
      assert.equal(matchExample(hex("0b".repeat(20)), utf8Encode("Hi There"))?.id, "rfc4231-1");
      assert.equal(matchExample(hex("aa".repeat(131)), utf8Encode("Test Using Larger Than Block-Size Key - Hash Key First"))?.id, "rfc4231-6");
      assert.equal(matchExample(utf8Encode("Jefe"), utf8Encode("what do ya want for nothing")), null);
    }
  }

  console.log("hmac-generator: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
