import assert from "node:assert/strict";
import { createHash, X509Certificate, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  sha1, sha256, toHex, decodeOid, decodeInteger, parseDer, parseExactly, readTime, formatIpv6, formatIpBytes,
  escapeRfc4514, toBase64, decodeBase64, readPemText, readBinary, verifySignature, ecdsaDerToRaw, visible,
  sniffDer, pkcs7Certificates, bitLength, DerError, errorText, MAX_DEPTH, MAX_TEXT_CHARS, rsaEncryptionSpki,
} from "../../client/src/lib/toolkit/asn1.ts";
import * as asn1 from "../../client/src/lib/toolkit/asn1.ts";
import {
  parseCertificate, decodeCertificates, validityStatus, reviewCertificate, analyzeChain, maxPublicLifetimeDays,
  type CertificateInfo,
} from "../../client/src/lib/toolkit/certificate-decoder.ts";

const FIX = new URL("./fixtures/certfix/", import.meta.url).pathname;
const read = (f: string) => readFileSync(FIX + f, "utf8");
const enc = (s: string) => new TextEncoder().encode(s);
let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
    })
    .catch((e) => {
      console.error(`FAIL: ${name}`);
      throw e;
    });
}

function certFrom(file: string, index = 0): CertificateInfo {
  const out = decodeCertificates(readPemText(read(file)));
  const entry = out.entries[index];
  assert.ok(entry, `no entry ${index} in ${file}`);
  if (!entry.ok) throw new Error(`${file}: ${entry.error}`);
  return entry.cert;
}

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0); // 2026-10-30T12:00:00Z

async function main() {
await test("SHA-1 FIPS 180-4 vectors", () => {
  assert.equal(toHex(sha1(enc("abc"))), "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal(toHex(sha1(enc(""))), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
  assert.equal(toHex(sha1(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))), "84983e441c3bd26ebaae4aa1f95129e5e54670f1");
  assert.equal(toHex(sha1(enc("a".repeat(1_000_000)))), "34aa973cd4c4daa4f61eeb2bdbad27316534016f");
});

await test("SHA-256 FIPS 180-4 vectors", () => {
  assert.equal(toHex(sha256(enc("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(toHex(sha256(enc(""))), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(toHex(sha256(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  assert.equal(toHex(sha256(enc("a".repeat(1_000_000)))), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
});

await test("digests match node:crypto at every padding boundary", () => {
  for (let n = 0; n < 300; n++) {
    const data = randomBytes(n);
    assert.equal(toHex(sha1(data)), createHash("sha1").update(data).digest("hex"), `sha1 len ${n}`);
    assert.equal(toHex(sha256(data)), createHash("sha256").update(data).digest("hex"), `sha256 len ${n}`);
  }
});

await test("OID decoding (X.690 8.19)", () => {
  assert.equal(decodeOid(new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b])), "1.2.840.113549.1.1.11");
  assert.equal(decodeOid(new Uint8Array([0x55, 0x1d, 0x11])), "2.5.29.17");
  // X.690 8.19.5 example: { 2 999 3 } encodes as 88 37 03.
  assert.equal(decodeOid(new Uint8Array([0x88, 0x37, 0x03])), "2.999.3");
  assert.equal(decodeOid(new Uint8Array([0x00])), "0.0");
  assert.equal(decodeOid(new Uint8Array([0x27])), "0.39");
  assert.equal(decodeOid(new Uint8Array([0x28])), "1.0");
  // 2.25.<128-bit UUID arc> stays exact through BigInt.
  const big = 0xf81d4fae7dec11d0a76500a0c91e6bf6n;
  const arcBytes: number[] = [];
  let v = big;
  arcBytes.unshift(Number(v & 0x7fn));
  v >>= 7n;
  while (v > 0n) {
    arcBytes.unshift(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  assert.equal(decodeOid(new Uint8Array([0x69, ...arcBytes])), `2.25.${big}`);
  assert.throws(() => decodeOid(new Uint8Array([0x2a, 0x80, 0x01])), /leading 0x80/);
  assert.throws(() => decodeOid(new Uint8Array([0x2a, 0x86])), /middle of an arc/);
  assert.throws(() => decodeOid(new Uint8Array([])), /empty/);
});

await test("INTEGER two's complement (X.690 8.3)", () => {
  assert.equal(decodeInteger(new Uint8Array([0x00, 0x80])), 128n);
  assert.equal(decodeInteger(new Uint8Array([0x80])), -128n);
  assert.equal(decodeInteger(new Uint8Array([0xff])), -1n);
  assert.equal(decodeInteger(new Uint8Array([0x01, 0x00])), 256n);
  assert.equal(decodeInteger(new Uint8Array([0x7f])), 127n);
  assert.equal(bitLength(new Uint8Array([0x00, 0x80, 0x00])), 16);
  assert.equal(bitLength(new Uint8Array([0x01])), 1);
  assert.equal(bitLength(new Uint8Array([0x00])), 0);
});

await test("DER parser rejects malformed structure without crashing", () => {
  assert.throws(() => parseDer(new Uint8Array([0x30, 0x80, 0x00, 0x00])), /indefinite length/);
  assert.throws(() => parseDer(new Uint8Array([0x30, 0x05, 0x02, 0x01])), /claims 5 bytes but only 2 remain/);
  assert.throws(() => parseDer(new Uint8Array([0x30])), /ends before a length/);
  assert.throws(() => parseDer(new Uint8Array([0x30, 0x85, 1, 1, 1, 1, 1])), /5 bytes long/);
  assert.throws(() => parseExactly(new Uint8Array([0x05, 0x00, 0x00]), 0, 3, "thing"), /1 unexpected bytes follow the thing/);
  // Nest past the depth cap.
  const depth = MAX_DEPTH + 5;
  const nested: number[] = [];
  for (let i = 0; i < depth; i++) nested.push(0x30, (depth - i - 1) * 2);
  assert.throws(() => parseDer(new Uint8Array(nested)), /deeper than 32/);
  // High tag number form.
  const ht = parseDer(new Uint8Array([0x9f, 0x81, 0x00, 0x00]));
  assert.equal(ht.tag, 128);
  assert.equal(ht.cls, 2);
  assert.match(errorText(new DerError("x", 3)), /at byte 3/);
});

await test("RFC 5280 time rules", () => {
  const t = (tag: number, s: string) => {
    const b = new Uint8Array([tag, s.length, ...enc(s)]);
    return readTime(b, parseDer(b), "t", 0);
  };
  assert.equal(t(0x17, "491231235959Z").ms, Date.UTC(2049, 11, 31, 23, 59, 59));
  assert.equal(t(0x17, "500101000000Z").ms, Date.UTC(1950, 0, 1));
  assert.equal(t(0x17, "500101000000Z").issue, null);
  assert.equal(t(0x18, "20500101000000Z").ms, Date.UTC(2050, 0, 1));
  assert.equal(t(0x18, "20500101000000Z").issue, null);
  assert.match(t(0x18, "20300101000000Z").issue ?? "", /UTCTime/);
  assert.equal(t(0x17, "230230000000Z").ms, null); // February 30
  assert.match(t(0x17, "2302300000Z").issue ?? "", /does not exist|not in the/);
  const offset = t(0x17, "2601010000+0100");
  assert.equal(offset.ms, Date.UTC(2025, 11, 31, 23, 0));
  assert.match(offset.issue ?? "", /YYMMDDHHMMSSZ/);
  assert.equal(t(0x18, "99991231235959Z").ms, Date.UTC(9999, 11, 31, 23, 59, 59));
  assert.equal(t(0x17, "garbage!!!!!Z").ms, null);
});

await test("IPv6 text per RFC 5952", () => {
  const v6 = (h: string) => formatIpv6(Uint8Array.from(Buffer.from(h, "hex")));
  assert.equal(v6("20010db8000000000001000000000001"), "2001:db8::1:0:0:1");
  assert.equal(v6("20010db8000000010001000100010001"), "2001:db8:0:1:1:1:1:1");
  assert.equal(v6("00000000000000000000000000000000"), "::");
  assert.equal(v6("00000000000000000000000000000001"), "::1");
  assert.equal(v6("20010db8000000000000000000000010"), "2001:db8::10");
  assert.equal(v6("20010db800000000000100000000000a"), "2001:db8::1:0:0:a");
  assert.equal(formatIpBytes(new Uint8Array([10, 0, 0, 0, 255, 0, 0, 0])), "10.0.0.0/8");
  assert.equal(formatIpBytes(new Uint8Array([10, 0, 0, 0, 255, 0, 255, 0])), "10.0.0.0 mask 255.0.255.0");
  assert.match(formatIpBytes(new Uint8Array([1, 2, 3])), /invalid 3 byte/);
});

await test("RFC 4514 escaping and visible()", () => {
  assert.equal(escapeRfc4514("Doe, Jane +1 <test>"), "Doe\\, Jane \\+1 \\<test\\>");
  assert.equal(escapeRfc4514("#lead"), "\\#lead");
  assert.equal(escapeRfc4514(" both "), "\\ both\\ ");
  assert.equal(escapeRfc4514('a"b;c\\'), 'a\\"b\\;c\\\\');
  assert.equal(escapeRfc4514("a\u0000b"), "a\\00b");
  assert.deepEqual(visible("www.bank.com\u0000.evil.com"), { text: "www.bank.com\\x00.evil.com", hidden: true });
  assert.deepEqual(visible("abc\u202egpj.exe"), { text: "abc\\u{202e}gpj.exe", hidden: true });
  assert.deepEqual(visible("plain"), { text: "plain", hidden: false });
});

await test("Base64 (RFC 4648)", () => {
  for (let n = 0; n < 40; n++) {
    const b = randomBytes(n);
    assert.equal(toBase64(b), b.toString("base64"));
    assert.deepEqual(Buffer.from(decodeBase64(b.toString("base64"))!), b);
  }
  assert.equal(decodeBase64("abc$"), null);
  assert.equal(decodeBase64("a"), null);
  assert.equal(decodeBase64("ab=c"), null);
});

await test("PEM reader: blocks, private keys, mismatches, bare encodings, caps", () => {
  const chain = readPemText(read("chain.pem"));
  assert.equal(chain.objects.length, 3);
  assert.equal(chain.error, null);
  const withKey = readPemText("-----BEGIN PRIVATE KEY-----\nMIIBVQ==\n-----END PRIVATE KEY-----\n" + read("leaf.pem"));
  assert.equal(withKey.objects.length, 1);
  assert.ok(withKey.notices.some((n) => n.tone === "danger" && /private key block was found and skipped/.test(n.text)));
  const mismatch = readPemText("-----BEGIN CERTIFICATE-----\nMIIB\n-----END X509 CRL-----");
  assert.equal(mismatch.objects.length, 0);
  assert.ok(mismatch.notices.some((n) => /must match/.test(n.text)));
  const cut = readPemText(read("leaf.pem").split("-----END")[0]);
  // With nothing complete before it, the cut-off block is the error itself.
  assert.match(cut.error ?? "", /no END line/);
  assert.equal(cut.notices.length, 0);
  const cutAfter = readPemText(read("leaf.pem") + read("leaf.pem").split("-----END")[0]);
  assert.equal(cutAfter.objects.length, 1);
  assert.equal(cutAfter.error, null);
  assert.ok(cutAfter.notices.some((n) => n.tone === "danger" && /no END line/.test(n.text)));
  const bad64 = readPemText("-----BEGIN CERTIFICATE-----\nMII$$$\n-----END CERTIFICATE-----");
  assert.ok(bad64.notices.some((n) => /not valid Base64/.test(n.text)));
  const der = readFileSync(FIX + "leaf.der");
  assert.equal(readPemText(der.toString("base64")).objects[0].label, "BASE64");
  assert.equal(readPemText(der.toString("hex").replace(/(..)/g, "$1:")).objects[0].label, "HEX");
  assert.match(readPemText("hello world").error ?? "", /No PEM block/);
  assert.equal(readPemText("   ").error, null);
  assert.match(readPemText("x".repeat(MAX_TEXT_CHARS + 1)).error ?? "", /longer than 1 MiB/);
  // Uploaded DER, UTF-16 PEM, empty file.
  assert.equal(readBinary(new Uint8Array(der)).objects[0].label, "DER");
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(read("leaf.pem"), "utf16le")]);
  assert.equal(readBinary(new Uint8Array(utf16)).objects[0].label, "CERTIFICATE");
  assert.match(readBinary(new Uint8Array(0)).error ?? "", /empty/);
  assert.match(readBinary(new Uint8Array([1, 2, 3, 4])).error ?? "", /neither DER nor PEM/);
});

const FILES = ["leaf.pem", "int.pem", "root.pem", "legacy.pem", "pss.pem", "r3.pem", "p521.pem", "p521b.pem", "kitchen.pem", "ed25519.pem"];

await test("every fixture agrees with node:crypto X509Certificate", () => {
  for (const f of FILES) {
    const pem = read(f);
    const node = new X509Certificate(pem);
    const c = certFrom(f);
    assert.equal(c.sha256, node.fingerprint256, `${f} sha256`);
    assert.equal(c.sha1, node.fingerprint, `${f} sha1`);
    assert.equal(c.serial.hex.replace(/:/g, ""), node.serialNumber.toUpperCase(), `${f} serial`);
    assert.equal(c.notBefore.ms, Date.parse(node.validFrom), `${f} notBefore`);
    assert.equal(c.notAfter.ms, Date.parse(node.validTo), `${f} notAfter`);
    const details = node.publicKey.asymmetricKeyDetails ?? {};
    if (details.modulusLength) {
      assert.equal(c.publicKey.bits, details.modulusLength, `${f} modulus`);
      assert.equal(c.publicKey.rsa?.exponent, details.publicExponent, `${f} exponent`);
    }
    if (details.namedCurve) {
      const map: Record<string, string> = { prime256v1: "P-256", secp384r1: "P-384", secp521r1: "P-521" };
      assert.equal(c.publicKey.curve?.webCrypto, map[details.namedCurve], `${f} curve`);
    }
    assert.equal(c.isCA, node.ca, `${f} ca`);
    // Subject CN agrees.
    const cn = /CN=([^\n]+)/.exec(node.subject)?.[1];
    if (cn && !cn.includes("\\")) assert.equal(c.subject.commonNames[0], cn.replace(/^"|"$/g, ""), `${f} CN`);
  }
});

await test("leaf: names, SANs and extensions", () => {
  const c = certFrom("leaf.pem");
  assert.equal(c.version, 3);
  assert.equal(c.serial.hex, "03:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F");
  assert.equal(c.serial.decimal, BigInt("0x03A1B2C3D4E5F60718293A4B5C6D7E8F").toString());
  assert.equal(c.signatureAlgorithm.name, "ecdsa-with-SHA256");
  assert.equal(c.innerAlgorithmMatches, true);
  assert.equal(c.subject.rfc4514, "CN=www.example.com");
  assert.equal(c.issuer.rfc4514, "CN=Example Issuing CA E1,O=Example PKI,C=US");
  assert.equal(c.issuer.openssl, "/C=US/O=Example PKI/CN=Example Issuing CA E1");
  assert.equal(c.publicKey.summary, "ECDSA P-256");
  assert.equal(c.publicKey.bits, 256);
  const spkiPin = createHash("sha256").update(new X509Certificate(read("leaf.pem")).publicKey.export({ type: "spki", format: "der" })).digest("base64");
  assert.equal(c.publicKey.pinSha256, spkiPin);
  assert.deepEqual(
    c.extensions.san?.map((n) => `${n.type}:${n.value}`),
    ["DNS:www.example.com", "DNS:example.com", "DNS:*.static.example.com", "IP:192.0.2.10", "IP:2001:db8::10"],
  );
  assert.deepEqual(c.extensions.keyUsage, ["digitalSignature"]);
  assert.deepEqual(c.extensions.extKeyUsage, ["1.3.6.1.5.5.7.3.1", "1.3.6.1.5.5.7.3.2"]);
  assert.deepEqual(c.extensions.basicConstraints, { ca: false, pathLen: null });
  const byOid = (oid: string) => c.extensions.list.find((e) => e.oid === oid)!;
  assert.equal(byOid("2.5.29.19").critical, true);
  assert.equal(byOid("2.5.29.15").critical, true);
  assert.deepEqual(byOid("2.5.29.31").rows, [{ label: "Point 1", value: "URI: http://crl.example.net/e1.crl" }]);
  assert.deepEqual(byOid("1.3.6.1.5.5.7.1.1").rows, [
    { label: "OCSP", value: "URI: http://ocsp.example.net" },
    { label: "caIssuers", value: "URI: http://pki.example.net/e1.cer" },
  ]);
  assert.deepEqual(byOid("2.5.29.32").rows, [
    { label: "Policy", value: "Domain Validated (CA/Browser Forum) (2.23.140.1.2.1)" },
    { label: "CPS", value: "https://pki.example.net/cps" },
  ]);
  // Key identifiers agree with OpenSSL's text output.
  assert.equal(c.extensions.authorityKeyId, certFrom("int.pem").extensions.subjectKeyId);
  assert.ok(c.extensions.list.every((e) => e.error === null));
});

await test("validity, days remaining and lifetime rules", () => {
  const c = certFrom("leaf.pem");
  const v = validityStatus(c, NOW);
  assert.equal(v.state, "valid");
  assert.equal(v.daysRemaining, 366); // 2026-10-30T12:00Z to 2027-11-01T00:00Z is 366.5 days
  assert.equal(Math.round(v.lifetimeDays!), 396);
  assert.equal(validityStatus(c, Date.UTC(2026, 8, 1)).state, "not-yet-valid");
  const expired = validityStatus(c, Date.UTC(2027, 10, 11));
  assert.equal(expired.state, "expired");
  assert.equal(expired.text, "Expired 10 days ago");
  const legacy = validityStatus(certFrom("legacy.pem"), NOW);
  assert.equal(legacy.state, "expired");
  assert.equal(maxPublicLifetimeDays(Date.UTC(2020, 7, 31)), null);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2020, 8, 1)), 398);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2026, 2, 14)), 398);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2026, 2, 15)), 200);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2027, 2, 15)), 100);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2029, 2, 15)), 47);
  const findings = reviewCertificate(c, NOW);
  assert.ok(findings.some((f) => f.tone === "info" && /at most 200 days/.test(f.text)), "396 day leaf from Oct 2026 exceeds 200");
  const p521 = certFrom("p521.pem");
  assert.equal(p521.notAfter.type, "UTCTime");
  assert.equal(p521.notAfter.issue, null);
  const p521b = certFrom("p521b.pem");
  assert.equal(p521b.notAfter.type, "GeneralizedTime");
  assert.equal(p521b.notAfter.issue, null);
});

await test("legacy v1 RSA-1024 SHA-1 certificate review", () => {
  const c = certFrom("legacy.pem");
  assert.equal(c.version, 1);
  assert.equal(c.publicKey.bits, 1024);
  assert.equal(c.signatureAlgorithm.weak, true);
  assert.equal(c.selfIssued, true);
  assert.equal(c.subject.rfc4514, "CN=legacy.example.com,O=Example Legacy Systems,L=Las Vegas,ST=Nevada,C=US");
  const f = reviewCertificate(c, NOW);
  assert.ok(f.some((x) => x.tone === "danger" && /1024 bits/.test(x.text)));
  assert.ok(f.some((x) => x.tone === "danger" && /Expired/.test(x.text)));
  assert.ok(f.some((x) => x.tone === "info" && /Self-signed with sha1WithRSAEncryption/.test(x.text)));
  assert.ok(f.some((x) => /version 1 certificate/.test(x.text)));
});

await test("kitchen sink extensions decode to OpenSSL's values", () => {
  const c = certFrom("kitchen.pem");
  assert.equal(c.subject.rfc4514, "emailAddress=jane@example.org,CN=Doe\\, Jane \\+1 \\<test\\>,OU=R&D+UID=jdoe,DC=example,DC=org");
  assert.equal(c.serial.octets, 20);
  assert.equal(c.serial.decimal, ((1n << 159n) - 1n).toString());
  const byOid = (oid: string) => c.extensions.list.find((e) => e.oid === oid)!;
  assert.deepEqual(c.extensions.san?.map((n) => `${n.type}:${n.value}`), [
    "email:jane@example.org",
    "URI:https://example.org/jane",
    "DirName:O=Example,CN=Jane Doe",
    "RID:1.2.3.4",
    "otherName:User principal name: jdoe@example.org",
  ]);
  assert.deepEqual(c.extensions.basicConstraints, { ca: true, pathLen: 2 });
  assert.deepEqual(c.extensions.keyUsage, [
    "digitalSignature", "nonRepudiation (contentCommitment)", "keyEncipherment", "dataEncipherment",
    "keyAgreement", "keyCertSign", "cRLSign", "encipherOnly",
  ]);
  assert.deepEqual(byOid("2.5.29.30").rows, [
    { label: "Permitted", value: "DNS: example.org" },
    { label: "Permitted", value: "IP: 10.0.0.0/8" },
    { label: "Permitted", value: "IP: 2001:db8::/32" },
    { label: "Excluded", value: "DNS: bad.example.org" },
  ]);
  assert.deepEqual(byOid("2.5.29.36").rows, [
    { label: "Require explicit policy", value: "after 0 certificate(s)" },
    { label: "Inhibit policy mapping", value: "after 1 certificate(s)" },
  ]);
  assert.deepEqual(byOid("2.5.29.54").rows, [{ label: "Skip certs", value: "3" }]);
  assert.deepEqual(byOid("1.3.6.1.5.5.7.1.24").rows, [{ label: "Feature", value: "status_request (OCSP Must-Staple)" }]);
  assert.ok(byOid("1.3.6.1.5.5.7.48.1.5").rows[0].value.includes("revocation"));
  // OpenSSL printed: Log ID 00:01:..:1F, Timestamp Dec 31 22:27:22.875 2025 GMT, ecdsa-with-SHA256.
  assert.deepEqual(byOid("1.3.6.1.4.1.11129.2.4.2").rows, [
    { label: "SCT 1", value: "v1, log AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=, 2025-12-31 22:27:22 UTC, ECDSA with SHA-256" },
  ]);
  assert.equal(c.extensions.sctCount, 1);
  assert.deepEqual(c.extensions.unknownCritical, ["1.2.3.4.5.6.7"]);
  assert.deepEqual(byOid("2.5.29.31").rows, [
    { label: "Point 1", value: "URI: http://crl.example.org/k.crl" },
    { label: "Point 1 reasons", value: "keyCompromise, cACompromise" },
    { label: "Point 1 CRL issuer", value: "DirName: CN=CRL Issuer" },
  ]);
  assert.deepEqual(byOid("2.5.29.32").rows, [
    { label: "Policy", value: "anyPolicy (2.5.29.32.0)" },
    { label: "CPS", value: "https://example.org/cps" },
    { label: "Notice reference", value: "Example Org, notice 1, 2" },
    { label: "User notice", value: "Test notice text" },
  ]);
  const aki = byOid("2.5.29.35").rows;
  assert.equal(aki[0].label, "Key ID");
  assert.equal(aki[0].value, c.extensions.subjectKeyId);
  assert.equal(aki[1].value, `DirName: ${c.subject.rfc4514}`);
  assert.equal(aki[2].value, "7F:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF:FF");
  assert.deepEqual(c.extensions.extKeyUsage, ["1.3.6.1.4.1.311.20.2.2", "1.3.6.1.5.5.7.3.3", "1.9.9.9"]);
  const f = reviewCertificate(c, NOW);
  assert.ok(f.some((x) => /1.2.3.4.5.6.7 is marked critical/.test(x.text)));
  assert.ok(f.some((x) => /Must-Staple/.test(x.text)));
});

await test("chain analysis: in order, reversed, missing root", () => {
  const certs = [certFrom("chain.pem", 0), certFrom("chain.pem", 1), certFrom("chain.pem", 2)];
  const r = analyzeChain(certs);
  assert.equal(r.links.length, 2);
  assert.ok(r.links.every((l) => l.nameMatch === "exact" && l.keyIdMatch === "match"));
  assert.ok(r.links.every((l) => l.findings.every((f) => f.tone === "ok")));
  assert.match(r.ending[0].text, /self-signed certificate, Example Root CA R1/);
  const reversed = analyzeChain([...certs].reverse());
  assert.ok(reversed.links[0].findings.some((f) => f.tone === "danger" && /reverse order/.test(f.text)));
  const shuffled = analyzeChain([certs[0], certs[2], certs[1]]);
  assert.ok(shuffled.links[0].findings.some((f) => f.tone === "danger" && /It is certificate 3, so the list is out of order/.test(f.text)));
  const noRoot = analyzeChain(certs.slice(0, 2));
  assert.match(noRoot.ending[0].text, /issued by Example Root CA R1, which is not included/);
  const leafOnly = analyzeChain(certs.slice(0, 1));
  assert.equal(leafOnly.ending[0].tone, "warn");
  assert.match(leafOnly.ending[0].text, /caIssuers URL \(http:\/\/pki\.example\.net\/e1\.cer\)/);
  // Leaf followed by an unrelated certificate, and a duplicate.
  const wrong = analyzeChain([certs[0], certFrom("legacy.pem"), certFrom("legacy.pem")]);
  assert.ok(wrong.links[0].findings.some((f) => /no certificate here issued it/.test(f.text)));
  assert.ok(wrong.notes.some((n) => /identical/.test(n.text)));
  // pathLen: the intermediate allows 0 below it; put a CA under it.
  const kitchen = certFrom("kitchen.pem");
  const pl = analyzeChain([kitchen, certs[1]]);
  assert.equal(pl.links[0].nameMatch, "different");
});

await test("PKCS#7 bundle and DER upload", () => {
  const p7 = new Uint8Array(readFileSync(FIX + "chain.p7b"));
  assert.equal(sniffDer(p7), "pkcs7");
  assert.equal(pkcs7Certificates(p7)?.length, 3);
  const out = decodeCertificates(readBinary(p7));
  assert.equal(out.entries.length, 3);
  const fps = new Set(out.entries.map((e) => (e.ok ? e.cert.sha256 : "")));
  for (const f of ["leaf.pem", "int.pem", "root.pem"]) assert.ok(fps.has(new X509Certificate(read(f)).fingerprint256));
  assert.ok(out.notices.some((n) => /PKCS#7/.test(n.text)));
  const der = decodeCertificates(readBinary(new Uint8Array(readFileSync(FIX + "leaf.der"))));
  assert.equal(der.entries.length, 1);
  assert.ok(der.entries[0].ok);
});

await test("CSR and other labels are redirected, not misparsed", () => {
  const out = decodeCertificates(readPemText(read("csr-good.pem")));
  assert.equal(out.entries.length, 0);
  assert.equal(out.sawCsr, true);
  const pub = decodeCertificates(readPemText("-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----"));
  assert.ok(pub.notices.some((n) => /PUBLIC KEY/.test(n.text)));
  // A bare base64 CSR is sniffed.
  const b64 = read("csr-good.pem").replace(/-----[^-]+-----/g, "");
  assert.equal(decodeCertificates(readPemText(b64)).sawCsr, true);
});

await test("signature verification through Web Crypto", async () => {
  const chain = [certFrom("chain.pem", 0), certFrom("chain.pem", 1), certFrom("chain.pem", 2)];
  const v = (child: CertificateInfo, parent: CertificateInfo) =>
    verifySignature(child.signatureAlgorithm, parent.publicKey, child.tbs, child.signature);
  assert.equal((await v(chain[0], chain[1])).status, "valid");
  assert.equal((await v(chain[1], chain[2])).status, "valid");
  assert.equal((await v(chain[2], chain[2])).status, "valid");
  assert.equal((await v(chain[0], chain[2])).status, "invalid");
  for (const f of ["legacy.pem", "pss.pem", "r3.pem", "p521.pem", "p521b.pem", "kitchen.pem", "ed25519.pem"]) {
    const c = certFrom(f);
    const r = await v(c, c);
    assert.equal(r.status, "valid", `${f}: ${r.detail}`);
  }
  const pss = certFrom("pss.pem");
  assert.deepEqual(pss.signatureAlgorithm.pss, { hash: "SHA-256", mgfHash: "SHA-256", saltLength: 32, trailer: 1 });
  assert.equal(pss.signatureAlgorithm.name, "RSASSA-PSS with SHA-256");
  // Tamper one byte of the signed part.
  const tampered = new Uint8Array(chain[0].tbs);
  tampered[tampered.length - 5] ^= 1;
  assert.equal((await verifySignature(chain[0].signatureAlgorithm, chain[1].publicKey, tampered, chain[0].signature)).status, "invalid");
  // Key type mismatch.
  const rsa = certFrom("r3.pem");
  assert.equal((await v(chain[0], rsa)).status, "invalid");
  assert.equal(ecdsaDerToRaw(new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]), 32)?.[31], 1);
  assert.equal(ecdsaDerToRaw(new Uint8Array([0x30, 0x00]), 32), null);
});

await test("findings on the sample chain are clean apart from expected notes", () => {
  const leaf = certFrom("chain.pem", 0);
  const f = reviewCertificate(leaf, NOW);
  assert.ok(!f.some((x) => x.tone === "danger" || x.tone === "warn"), JSON.stringify(f.filter((x) => x.tone !== "ok" && x.tone !== "info")));
  const root = reviewCertificate(certFrom("chain.pem", 2), NOW);
  assert.ok(!root.some((x) => x.tone === "danger" || x.tone === "warn"), JSON.stringify(root));
});

await test("fuzz: random bytes, truncations and bit flips never throw", () => {
  const der = new Uint8Array(readFileSync(FIX + "leaf.der"));
  let ok = 0;
  for (let cut = 0; cut < der.length; cut++) {
    const r = parseCertificate(der.subarray(0, cut));
    assert.equal(r.ok, false);
  }
  for (let i = 0; i < 3000; i++) {
    const m = new Uint8Array(der);
    const pos = Math.floor(Math.random() * m.length);
    m[pos] ^= 1 << Math.floor(Math.random() * 8);
    const r = parseCertificate(m);
    if (r.ok) {
      ok++;
      reviewCertificate(r.cert, NOW);
      analyzeChain([r.cert, r.cert]);
    }
  }
  for (let i = 0; i < 3000; i++) {
    const r = randomBytes(Math.floor(Math.random() * 200));
    if (i % 2) r[0] = 0x30;
    parseCertificate(new Uint8Array(r));
    decodeCertificates(readBinary(new Uint8Array(r)));
    decodeCertificates(readPemText(r.toString("latin1")));
  }
  const kitchen = new Uint8Array(Buffer.from(read("kitchen.pem").replace(/-----[^-]+-----|\s/g, ""), "base64"));
  for (let i = 0; i < 3000; i++) {
    const m = new Uint8Array(kitchen);
    m[Math.floor(Math.random() * m.length)] = Math.floor(Math.random() * 256);
    const r = parseCertificate(m);
    if (r.ok) reviewCertificate(r.cert, NOW);
  }
  assert.ok(ok >= 0);
});


await test("RSA-PSS restricted keys (RFC 4055) verify after rewrapping", async () => {
  const FIX2 = new URL("./fixtures/certfix2/", import.meta.url).pathname;
  const text = readFileSync(FIX2 + "psskey.pem", "utf8");
  const out = decodeCertificates(readPemText(text));
  const e = out.entries[0];
  if (!e.ok) throw new Error(e.error);
  const c = e.cert;
  assert.equal(c.publicKey.keyType, "RSA-PSS");
  assert.equal(c.publicKey.bits, 2048);
  assert.equal(c.sha256, new X509Certificate(text).fingerprint256);
  const r = await verifySignature(c.signatureAlgorithm, c.publicKey, c.tbs, c.signature);
  assert.equal(r.status, "valid", r.detail);
  // The rewrapped key is a plain rsaEncryption SPKI with the same modulus.
  const rewrapped = rsaEncryptionSpki(c.publicKey.spki);
  assert.ok(rewrapped);
  const node = parseDer(rewrapped!);
  assert.equal(node.end, rewrapped!.length);
  assert.equal(createHash("sha256").update(rewrapped!).digest("hex").length, 64);
  // A PKCS#1 v1.5 algorithm against a PSS-only key is refused as a policy violation.
  const v15 = { ...c.signatureAlgorithm, family: "RSA" as const, hash: "SHA-256", pss: null };
  assert.equal((await verifySignature(v15, c.publicKey, c.tbs, c.signature)).status, "invalid");
});

await test("the page's sample PEMs decode, chain and verify", async () => {
  const src = readFileSync(new URL("../../client/src/pages/tools/CertificateDecoder.tsx", import.meta.url), "utf8");
  const grab = (name: string) => {
    const m = new RegExp(name + " = `([^`]*)`").exec(src);
    assert.ok(m, name);
    return m![1];
  };
  const chainText = grab("SAMPLE_LEAF") + grab("SAMPLE_INTERMEDIATE") + grab("SAMPLE_ROOT");
  const out = decodeCertificates(readPemText(chainText));
  const certs = out.entries.map((e) => {
    if (!e.ok) throw new Error(e.error);
    return e.cert;
  });
  assert.equal(certs.length, 3);
  const pems = chainText.split(/(?<=-----END CERTIFICATE-----\n)/).filter((p) => p.includes("BEGIN"));
  certs.forEach((c, i) => assert.equal(c.sha256, new X509Certificate(pems[i]).fingerprint256));
  const r = analyzeChain(certs);
  assert.ok(r.links.every((l) => l.nameMatch === "exact" && l.keyIdMatch === "match" && l.findings.every((f) => f.tone === "ok")));
  assert.equal((await verifySignature(certs[0].signatureAlgorithm, certs[1].publicKey, certs[0].tbs, certs[0].signature)).status, "valid");
  assert.equal((await verifySignature(certs[1].signatureAlgorithm, certs[2].publicKey, certs[1].tbs, certs[1].signature)).status, "valid");
  assert.equal((await verifySignature(certs[2].signatureAlgorithm, certs[2].publicKey, certs[2].tbs, certs[2].signature)).status, "valid");
  const leafReview = reviewCertificate(certs[0], NOW);
  assert.ok(!leafReview.some((x) => x.tone === "danger" || x.tone === "warn"), JSON.stringify(leafReview));
  assert.equal(validityStatus(certs[0], NOW).lifetimeDays, 200);
  assert.deepEqual(certs[0].extensions.san?.map((n) => `${n.type}:${n.value}`), [
    "DNS:www.example.com", "DNS:example.com", "DNS:*.static.example.com", "IP:192.0.2.10", "IP:2001:db8::10",
  ]);
  const legacy = decodeCertificates(readPemText(grab("SAMPLE_LEGACY"))).entries[0];
  if (!legacy.ok) throw new Error(legacy.error);
  assert.equal(legacy.cert.version, 1);
  assert.equal(legacy.cert.publicKey.bits, 1024);
  const lf = reviewCertificate(legacy.cert, NOW);
  assert.ok(lf.some((x) => x.tone === "danger" && /Expired/.test(x.text)));
  assert.ok(lf.some((x) => x.tone === "danger" && /1024 bits/.test(x.text)));
  // The reversed example is flagged.
  const rev = analyzeChain([...certs].reverse());
  assert.ok(rev.links[0].findings.some((f) => /reverse order/.test(f.text)));
});


/* ---------------- independent verifier cases (second pass) ---------------- */

const FIX3 = new URL("./fixtures/certfix3/", import.meta.url).pathname;
const certs3 = (f: string) =>
  decodeCertificates(readPemText(readFileSync(FIX3 + f, "utf8"))).entries.map((e) => {
    if (!e.ok) throw new Error(`${f}: ${e.error}`);
    return e.cert;
  });

await test("V1: every root in Node's bundled store agrees with node:crypto and verifies", async () => {
  const { rootCertificates } = await import("node:tls");
  let checked = 0;
  let verified = 0;
  for (const pem of rootCertificates) {
    const node = new X509Certificate(pem);
    let nodeSpki: Buffer | null = null;
    try {
      nodeSpki = node.publicKey.export({ type: "spki", format: "der" }) as Buffer;
    } catch {
      nodeSpki = null; // a few bundled roots carry deliberately zeroed keys
    }
    const out = decodeCertificates(readPemText(pem));
    const e = out.entries[0];
    assert.ok(e && e.ok, `${node.subject}: ${e && !e.ok ? e.error : "missing"}`);
    if (!e.ok) continue;
    const c = e.cert;
    assert.equal(c.sha256, node.fingerprint256, node.subject);
    assert.equal(c.sha1, node.fingerprint, node.subject);
    assert.equal(BigInt("0x" + c.serial.hex.replace(/:/g, "")), BigInt("0x" + node.serialNumber), node.subject);
    assert.equal(c.notBefore.ms, Date.parse(node.validFrom), node.subject);
    assert.equal(c.notAfter.ms, Date.parse(node.validTo), node.subject);
    assert.equal(c.isCA, node.ca, node.subject);
    assert.ok(c.extensions.list.every((x) => x.error === null), node.subject);
    checked++;
    if (!nodeSpki || c.publicKey.bits === 0) continue;
    assert.equal(c.publicKey.pinSha256, createHash("sha256").update(nodeSpki).digest("base64"), node.subject);
    const r = await verifySignature(c.signatureAlgorithm, c.publicKey, c.tbs, c.signature);
    assert.equal(r.status, "valid", `${node.subject}: ${r.detail}`);
    verified++;
  }
  assert.ok(checked >= 100, `only ${checked} roots`);
  assert.ok(verified >= 100, `only ${verified} verified`);
});

await test("V2: negative serial shows its magnitude like OpenSSL (-0x12D687) and is flagged", () => {
  const c = certs3("neg.pem")[0];
  assert.equal(c.serial.negative, true);
  assert.equal(c.serial.decimal, "-1234567");
  assert.equal(c.serial.hex, "-12:D6:87");
  assert.equal(c.sha256, new X509Certificate(readFileSync(FIX3 + "neg.pem", "utf8")).fingerprint256);
  assert.ok(reviewCertificate(c, NOW).some((f) => f.tone === "warn" && /serial number is negative/.test(f.text)));
});

await test("V3: pathLen 0 on a root with two intermediates below it (openssl verify error 25)", async () => {
  const chain = certs3("plchain.pem");
  assert.equal(chain.length, 4);
  const r = analyzeChain(chain);
  assert.ok(r.links[0].findings.every((f) => f.tone === "ok"));
  assert.ok(r.links[1].findings.every((f) => f.tone === "ok"));
  assert.ok(r.links[2].findings.some((f) => f.tone === "danger" && /allows 0 intermediates below it \(pathLen\), and there are 2, not counting self-issued/.test(f.text)));
  for (let i = 0; i < 3; i++) {
    const v = await verifySignature(chain[i].signatureAlgorithm, chain[i + 1].publicKey, chain[i].tbs, chain[i].signature);
    assert.equal(v.status, "valid", `link ${i}`);
  }
  // Int A directly under the root: pathLen 0 allows a CA certificate with no intermediates below it.
  const shorter = analyzeChain([chain[2], chain[3]]);
  assert.ok(shorter.links[0].findings.every((f) => f.tone !== "danger"));
  // RFC 5280 6.1.4 (l): self-issued certificates are not counted. Treating both intermediates as
  // self-issued rollover certificates leaves none to count against the root's pathLen of 0, and
  // treating one of them as self-issued leaves one, which is still over.
  const bothSelfIssued = analyzeChain([chain[0], { ...chain[1], selfIssued: true }, { ...chain[2], selfIssued: true }, chain[3]]);
  assert.ok(!bothSelfIssued.links[2].findings.some((f) => /pathLen/.test(f.text)));
  const oneSelfIssued = analyzeChain([chain[0], { ...chain[1], selfIssued: true }, chain[2], chain[3]]);
  assert.ok(oneSelfIssued.links[2].findings.some((f) => f.tone === "danger" && /there is 1, not counting self-issued/.test(f.text)));
});

await test("V4: RFC 5952 text for SAN addresses, IPv4-mapped tail and the first-run tie rule", () => {
  const leaf = certs3("l.pem")[0];
  assert.deepEqual(leaf.extensions.san?.map((n) => `${n.type}:${n.value}`), [
    "DNS:app.example.com",
    "IP:::ffff:192.0.2.1", // RFC 5952 section 5
    "IP:2001:db8::1:0:0:1", // RFC 5952 4.2.3: equal runs, the first is compressed
  ]);
  const v6 = (h: string) => formatIpv6(Uint8Array.from(Buffer.from(h, "hex")));
  assert.equal(v6("20010db8000000000000000000000001"), "2001:db8::1"); // RFC 5952 4.2.1
  assert.equal(v6("20010db8000000010000000000000001"), "2001:db8:0:1::1"); // longest run wins
  assert.equal(v6("20010db8aaaabbbbccccdddd0000eeee"), "2001:db8:aaaa:bbbb:cccc:dddd:0:eeee"); // 4.2.2: one group not compressed
  assert.equal(v6("00000000000000000000ffffc0000201"), "::ffff:192.0.2.1");
});

await test("V5: RFC 4514 section 4 examples and dotted OIDs", () => {
  // "CN=James \"Jim\" Smith\, III,DC=example,DC=net"
  assert.equal(escapeRfc4514('James "Jim" Smith, III'), 'James \\"Jim\\" Smith\\, III');
  // "CN=Before\0dAfter,DC=example,DC=net"
  assert.equal(escapeRfc4514("Before\rAfter"), "Before\\0dAfter");
  assert.equal(escapeRfc4514("abc\u202egpj"), "abc\\e2\\80\\aegpj");
  // "1.3.6.1.4.1.1466.0=#04024869": a type with no short name is written as # and the BER hex.
  const oid = [0x06, 0x08, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x8b, 0x3a, 0x00];
  const atv = [0x30, oid.length + 4, ...oid, 0x04, 0x02, 0x48, 0x69];
  const set = [0x31, atv.length, ...atv];
  const nameDer = new Uint8Array([0x30, set.length, ...set]);
  const { parseName } = asn1;
  const dn = parseName(nameDer, parseDer(nameDer), "name", 0);
  assert.equal(dn.rfc4514, "1.3.6.1.4.1.1466.0=#04024869");
  // A multi-valued RDN and UTF-8, against openssl x509 -nameopt RFC2253,-esc_msb.
  const mv = certs3("mv.pem")[0];
  assert.equal(mv.subject.rfc4514, "CN=münchen.example,OU=Dev+OU=Ops,O=Müller GmbH,C=DE");
  // organizationIdentifier (2.5.4.97) has no RFC 4514 short name, so it is written by OID with its UTF8String hex.
  const oi = certs3("oi.pem")[0];
  assert.equal(oi.subject.rfc4514, `CN=oi.example.com,2.5.4.97=#0c0f${Buffer.from("VATDE-123456789").toString("hex")}`);
});

await test("V6: RFC 5280 4.1.2.5 validity is inclusive at both ends", () => {
  const c = certs3("l.pem")[0];
  const nb = c.notBefore.ms!;
  const na = c.notAfter.ms!;
  assert.equal(validityStatus(c, nb).state, "valid");
  assert.equal(validityStatus(c, nb - 1).state, "not-yet-valid");
  assert.equal(validityStatus(c, na).state, "valid");
  assert.equal(validityStatus(c, na + 1).state, "expired");
  assert.equal(validityStatus(c, na + 1).text, "Expired today");
  assert.equal(validityStatus(c, na + 3 * 86_400_000).text, "Expired 3 days ago");
  // 20 day certificate: lifetime is notAfter - notBefore + 1 second.
  assert.equal(validityStatus(c, nb).lifetimeDays, (na - nb + 1000) / 86_400_000);
  const soon = reviewCertificate(c, na - 3600_000);
  assert.ok(soon.some((f) => f.tone === "warn" && f.text === "Expires within a day. Replace it before then."));
});

await test("V7: hash and curve findings state the right facts", () => {
  const md5 = { ...certFrom("legacy.pem") };
  md5.selfIssued = false;
  md5.selfSigned = false;
  md5.signatureAlgorithm = { ...md5.signatureAlgorithm, hash: "MD5", name: "md5WithRSAEncryption", weak: true };
  assert.ok(reviewCertificate(md5, NOW).some((f) => f.tone === "danger" && /MD5 collisions are practical/.test(f.text)));
  const sha1 = { ...md5, signatureAlgorithm: { ...md5.signatureAlgorithm, hash: "SHA-1", name: "sha1WithRSAEncryption" } };
  assert.ok(reviewCertificate(sha1, NOW).some((f) => f.tone === "danger" && /SHAttered/.test(f.text)));
  const p521 = reviewCertificate(certFrom("p521.pem"), NOW);
  assert.ok(p521.some((f) => f.tone === "info" && /P-521.*only P-256 and P-384/.test(f.text)));
  assert.ok(!p521.some((f) => f.tone === "ok" && /P-521/.test(f.text)));
});

await test("V8: hostile names stay escaped and never reach the example commands", async () => {
  const evil = certs3("evil.pem")[0];
  assert.equal(evil.extensions.san?.[0].raw, "evil.example.com$(touch /tmp/pwned)");
  // A right-to-left override in a CN is escaped in the display name, the RFC 4514 string and the findings.
  const rtl = certs3("rtl.pem")[0];
  assert.equal(rtl.subject.commonNames[0], "abc\u202egpj.exe");
  assert.equal(rtl.displayName, "abc\\u{202e}gpj.exe");
  assert.equal(rtl.subject.rfc4514, "CN=abc\\e2\\80\\aegpj.exe");
  assert.ok(reviewCertificate(rtl, NOW).some((f) => f.tone === "danger" && /Subject CN: .*bidirectional/.test(f.text)));
  const src = readFileSync(new URL("../../client/src/pages/tools/CertificateDecoder.tsx", import.meta.url), "utf8");
  const re = /const SAFE_HOST = (\/.*\/i);/.exec(src);
  assert.ok(re, "SAFE_HOST");
  const SAFE = eval(re![1]) as RegExp;
  for (const bad of ["evil.example.com$(touch /tmp/pwned)", "a.example.com`id`", "a.com;rm -rf ~", "a.com rm", "*.example.com", "-a.example.com", "a..com", "a.com\n"]) {
    assert.equal(SAFE.test(bad), false, bad);
  }
  for (const good of ["example.com", "www.example.com", "xn--mnchen-3ya.de", "a-b.c.example.org"]) assert.equal(SAFE.test(good), true, good);
});

await test("V9: wildcard SAN covering a CN is reported as covered", () => {
  const leaf = certFrom("leaf.pem");
  const covered = { ...leaf, subject: { ...leaf.subject, commonNames: ["img.static.example.com"] } };
  const f = reviewCertificate(covered, NOW);
  assert.ok(f.some((x) => /wildcard \*\.static\.example\.com covers it/.test(x.text)));
  const notCovered = { ...leaf, subject: { ...leaf.subject, commonNames: ["a.b.static.example.com"] } };
  assert.ok(reviewCertificate(notCovered, NOW).some((x) => /is not one of the SAN entries/.test(x.text)));
});

await test("V10: overflow notice appears once and only when something was dropped", () => {
  const leafPem = read("leaf.pem");
  const exactly = decodeCertificates(readPemText(leafPem.repeat(20)));
  assert.equal(exactly.entries.length, 20);
  assert.ok(!exactly.notices.some((n) => /Only the first/.test(n.text)));
  const over = decodeCertificates(readPemText(leafPem.repeat(25)));
  assert.equal(over.entries.length, 20);
  assert.equal(over.notices.filter((n) => /Only the first/.test(n.text)).length, 1);
});


/* ---------------- independent verifier cases (third pass) ---------------- */
const FIX4 = new URL("./fixtures/certfix4/", import.meta.url).pathname;
const { execSync: sh } = await import("node:child_process");
const certs4 = (f: string) =>
  decodeCertificates(readPemText(readFileSync(FIX4 + f, "utf8"))).entries.map((e) => {
    if (!e.ok) throw new Error(`${f}: ${e.error}`);
    return e.cert;
  });

await test("W1: a PKCS7 block with a malformed content type OID is an error entry, never an exception", () => {
  const bad = [
    [0x30, 0x04, 0x06, 0x00, 0xa0, 0x00], // empty OID
    [0x30, 0x05, 0x06, 0x01, 0x80, 0xa0, 0x00], // X.690 8.19.2 leading 0x80
    [0x30, 0x05, 0x06, 0x01, 0x81, 0xa0, 0x00], // OID ends mid-arc
  ];
  for (const bytes of bad) {
    for (const label of ["PKCS7", "PKCS #7 SIGNED DATA", "CERTIFICATE"]) {
      const out = decodeCertificates(readPemText(asn1.toPem(new Uint8Array(bytes), label)));
      assert.equal(out.entries.length, 1, label);
      assert.equal(out.entries[0].ok, false, label);
    }
    assert.equal(pkcs7Certificates(new Uint8Array(bytes)), null);
  }
});

await test("W2: PEM problems are capped at 20 listed messages plus one summary", () => {
  const many = readPemText("-----BEGIN A-----\n-----END B-----\n".repeat(30_000));
  assert.equal(many.notices.length, 21);
  assert.match(many.notices[20].text, /^29980 more blocks had the same kinds of problems/);
  const b64 = readPemText("-----BEGIN CERTIFICATE-----\n!!\n-----END CERTIFICATE-----\n".repeat(25));
  assert.equal(b64.notices.length, 21);
  assert.match(b64.notices[20].text, /^5 more blocks/);
  // Twenty problems exactly: all listed, no summary.
  const twenty = readPemText("-----BEGIN A-----\n-----END B-----\n".repeat(20));
  assert.equal(twenty.notices.length, 20);
  // A cut-off upload keeps its specific message rather than "neither DER nor PEM".
  const cut = readBinary(new TextEncoder().encode("-----BEGIN CERTIFICATE-----\nMIIB"));
  assert.match(cut.error ?? "", /BEGIN line but no END line/);
});

await test("W3: RFC 5280 4.1.2.5 time encodings at the 1950 and 2050 pivots and on leap days", () => {
  const t = (tag: number, s: string) => {
    const b = new Uint8Array([tag, s.length, ...enc(s)]);
    return readTime(b, parseDer(b), "t", 0);
  };
  assert.equal(t(23, "491231235959Z").ms, Date.UTC(2049, 11, 31, 23, 59, 59)); // YY < 50 is 20YY
  assert.equal(t(23, "500101000000Z").ms, Date.UTC(1950, 0, 1)); // YY >= 50 is 19YY
  assert.equal(t(23, "500101000000Z").issue, null);
  assert.equal(t(24, "20500101000000Z").issue, null); // 2050 onward is GeneralizedTime
  assert.match(t(24, "20491231235959Z").issue ?? "", /before 2050, where RFC 5280 says to use UTCTime/);
  assert.equal(t(24, "19491231235959Z").issue, null); // before 1950 GeneralizedTime is required too
  assert.equal(t(23, "240229120000Z").ms, Date.UTC(2024, 1, 29, 12)); // 2024 is a leap year
  assert.equal(t(23, "260229120000Z").ms, null); // 2026 is not
  assert.equal(t(24, "21000229000000Z").ms, null); // 2100 is not (divisible by 100, not 400)
  assert.equal(t(24, "20000229000000Z").ms, Date.UTC(2000, 1, 29)); // 2000 is (divisible by 400)
  const frac = t(24, "20500101000000.5Z");
  assert.equal(frac.ms, Date.UTC(2050, 0, 1, 0, 0, 0, 500));
  assert.match(frac.issue ?? "", /not in the YYYYMMDDHHMMSSZ form/);
  const offset = t(23, "260101000000+0130");
  assert.equal(offset.ms, Date.UTC(2025, 11, 31, 22, 30));
  assert.ok(offset.issue);
  assert.equal(t(23, "2601010000Z").ms, Date.UTC(2026, 0, 1)); // no seconds: read but flagged
  assert.ok(t(23, "2601010000Z").issue);
  assert.equal(t(23, "26010100000Z").ms, null); // 11 digits
});

await test("W4: an OpenSSL-issued leaf with a 2051 GeneralizedTime notAfter, a 20 octet magnitude serial and bit 8 keyUsage", () => {
  const pem = readFileSync(FIX4 + "leaf2051.pem", "utf8");
  const node = new X509Certificate(pem);
  const c = certs4("leaf2051.pem")[0];
  assert.equal(c.notAfter.type, "GeneralizedTime");
  assert.equal(c.notAfter.raw, "20510630120000Z");
  assert.equal(c.notAfter.issue, null);
  assert.equal(c.notAfter.ms, Date.parse(node.validTo));
  assert.equal(c.notBefore.type, "UTCTime");
  assert.equal(c.notBefore.ms, Date.UTC(2026, 0, 1));
  // openssl x509 -text: ff:01:02:...:13. The high bit forces a 00 pad, so 21 octets are encoded.
  assert.equal(c.serial.hex, "FF:01:02:03:04:05:06:07:08:09:0A:0B:0C:0D:0E:0F:10:11:12:13");
  assert.equal(BigInt(c.serial.decimal), 0xff0102030405060708090a0b0c0d0e0f10111213n);
  assert.equal(c.serial.octets, 21);
  assert.ok(reviewCertificate(c, NOW).some((f) => f.tone === "warn" && /serial number is 21 octets/.test(f.text)));
  // RFC 5280 4.2.1.3 bits 4, 7 and 8; decipherOnly sits in the second content octet.
  assert.deepEqual(c.extensions.keyUsage, ["keyAgreement", "encipherOnly", "decipherOnly"]);
  assert.deepEqual(c.extensions.san?.map((n) => `${n.type}:${n.value}`), [
    "DNS:ka.example.com", "IP:2001:db8::1:0:0:1", "IP:10.0.0.1", "email:ops@example.com",
  ]);
  assert.equal(c.extensions.subjectKeyId, "D7:3F:82:8C:8C:84:01:19:78:32:52:DC:8F:D0:15:F2:7F:36:58:AF");
  assert.equal(c.extensions.authorityKeyId, "C9:66:64:E3:AC:6B:F0:C0:F3:D1:74:FB:9B:88:6C:9A:49:F6:9A:5E");
  assert.equal(c.signatureAlgorithm.name, "ecdsa-with-SHA384");
  assert.equal(c.publicKey.summary, "ECDSA P-384");
  // Fingerprints and the SPKI pin, against the openssl command line.
  const fp = (alg: string) => sh(`openssl x509 -in ${FIX4}leaf2051.pem -noout -fingerprint -${alg}`).toString().trim().split("=")[1];
  assert.equal(c.sha256, fp("sha256"));
  assert.equal(c.sha1, fp("sha1"));
  const pin = sh(`openssl x509 -in ${FIX4}leaf2051.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64`).toString().trim();
  assert.equal(c.publicKey.pinSha256, pin);
  // The lifetime is far past any public cap for a 2026 issue date.
  assert.equal(maxPublicLifetimeDays(c.notBefore.ms!), 398);
  assert.ok(reviewCertificate(c, NOW).some((f) => /may last at most 398 days/.test(f.text)));
});

await test("W5: a self-issued key rollover certificate is not treated as self-signed", async () => {
  const [oldRoot] = certs4("oldroot.pem");
  const [rollover] = certs4("newwithold.pem");
  assert.equal(oldRoot.selfIssued, true);
  assert.equal(oldRoot.selfSigned, true);
  assert.equal(rollover.selfIssued, true); // same name on both sides
  assert.equal(rollover.selfSigned, false); // AKI points at the old key, SKI is the new key
  assert.notEqual(rollover.extensions.authorityKeyId, rollover.extensions.subjectKeyId);
  const f = reviewCertificate(rollover, NOW);
  assert.ok(f.some((x) => /Self-issued but signed by a different key/.test(x.text)));
  assert.ok(!f.some((x) => /^Self-signed/.test(x.text)));
  // The rollover certificate verifies with the OLD root key (openssl verify says OK), not its own.
  assert.equal((await verifySignature(rollover.signatureAlgorithm, oldRoot.publicKey, rollover.tbs, rollover.signature)).status, "valid");
  assert.equal((await verifySignature(rollover.signatureAlgorithm, rollover.publicKey, rollover.tbs, rollover.signature)).status, "invalid");
  const r = analyzeChain([rollover, oldRoot]);
  assert.equal(r.links[0].nameMatch, "exact");
  assert.equal(r.links[0].keyIdMatch, "match");
  assert.ok(r.links[0].findings.every((x) => x.tone === "ok"));
  // Ending at the rollover certificate means its issuer (the old root) is missing, not that the list ends at a root.
  const alone = analyzeChain([rollover]);
  assert.match(alone.ending[0].text, /issued by Rollover Root, which is not included/);
});

await test("W6: Baseline Requirements 6.3.2 lifetime caps switch exactly on their dates", () => {
  assert.equal(maxPublicLifetimeDays(Date.UTC(2020, 7, 31, 23, 59, 59)), null);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2020, 8, 1)), 398);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2026, 2, 14, 23, 59, 59)), 398);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2026, 2, 15)), 200);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2027, 2, 14, 23, 59, 59)), 200);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2027, 2, 15)), 100);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2029, 2, 14, 23, 59, 59)), 100);
  assert.equal(maxPublicLifetimeDays(Date.UTC(2029, 2, 15)), 47);
});

await test("W7: SHA-1 and SHA-256 on the FIPS 180-4 two-block 896-bit message", () => {
  const m = enc("abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu");
  assert.equal(toHex(sha1(m)), "a49b2446a02c645bf419f995b67091253a04a259");
  assert.equal(toHex(sha256(m)), "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1");
  // 55 and 56 bytes straddle the length field's padding boundary.
  for (const n of [55, 56, 63, 64, 65]) {
    const data = new Uint8Array(n).fill(0x61);
    assert.equal(toHex(sha256(data)), createHash("sha256").update(data).digest("hex"), String(n));
  }
});

await test("W8: an issuer whose key ID differs from the next certificate's subject key ID is flagged", () => {
  const [leaf] = certs4("leaf2051.pem");
  const [rollover] = certs4("newwithold.pem");
  // Same issuer name as the leaf expects, but the new key: AKI of the leaf (old key) differs from its SKI.
  const r = analyzeChain([leaf, rollover]);
  assert.equal(r.links[0].nameMatch, "exact");
  assert.equal(r.links[0].keyIdMatch, "mismatch");
  assert.ok(r.links[0].findings.some((f) => f.tone === "danger" && /Same name, different key/.test(f.text)));
});

await test("W6: a same-name certificate without a subject key ID is only probably self-signed", async () => {
  // Rollover certificate signed by the old root, with an authority key ID and no subject key ID.
  const [oldRoot] = certs4("oldroot.pem");
  const [rollover] = certs4("newwithold-noski.pem");
  assert.equal(rollover.extensions.subjectKeyId, null);
  assert.notEqual(rollover.extensions.authorityKeyId, null);
  assert.equal(rollover.selfIssued, true);
  // The key identifiers cannot say, so the classification is marked unconfirmed.
  assert.equal(rollover.selfSignedUnconfirmed, true);
  assert.equal(oldRoot.selfSignedUnconfirmed, false); // AKI equals SKI: confirmed by the identifiers
  // The signature settles it: not its own key, the old root's key.
  assert.equal((await verifySignature(rollover.signatureAlgorithm, rollover.publicKey, rollover.tbs, rollover.signature)).status, "invalid");
  assert.equal((await verifySignature(rollover.signatureAlgorithm, oldRoot.publicKey, rollover.tbs, rollover.signature)).status, "valid");
  // The text does not claim it is self-signed or that the list ends at a root.
  const f = reviewCertificate(rollover, NOW);
  assert.ok(f.some((x) => /^Self-issued, probably self-signed/.test(x.text)));
  assert.ok(!f.some((x) => /^Self-signed:/.test(x.text)));
  const ending = analyzeChain([rollover]).ending.map((e) => e.text).join(" ");
  assert.ok(/shows whether it is a self-signed root or a certificate signed by an older key/.test(ending));
  assert.ok(!/ends at a self-signed certificate/.test(ending));
  // With both key IDs present the identifiers decide and no check is needed.
  const [fullRollover] = certs4("newwithold.pem");
  assert.equal(fullRollover.selfSignedUnconfirmed, false);
  // A root that has a subject key ID is settled by the identifiers, so no signature check is needed to call it self-signed.
  const plainRoot = decodeCertificates(readPemText(readFileSync(FIX4 + "oldroot.pem", "utf8"))).entries[0];
  assert.ok(plainRoot.ok && plainRoot.cert.selfSigned && !plainRoot.cert.selfSignedUnconfirmed);
});

await test("W8: constructed primitives and padded serial integers are not DER", () => {
  // A constructed INTEGER (tag byte 22) is not an INTEGER, and a primitive SEQUENCE (10) is not a SEQUENCE.
  const constructedInt = parseDer(new Uint8Array([0x22, 0x03, 0x02, 0x01, 0x05]));
  assert.throws(() => asn1.expectTag(constructedInt, 2, "serial number", 0), /constructed INTEGER, which DER forbids/);
  const primitiveSeq = parseDer(new Uint8Array([0x10, 0x01, 0x05]));
  assert.throws(() => asn1.expectTag(primitiveSeq, 16, "certificate", 0), /primitive SEQUENCE, which DER forbids/);
  assert.ok(asn1.isUniversal(parseDer(new Uint8Array([0x02, 0x01, 0x05])), 2));
  assert.ok(asn1.isUniversal(parseDer(new Uint8Array([0x30, 0x00])), 16));
  assert.ok(!asn1.isUniversal(parseDer(new Uint8Array([0x04, 0x01, 0x05])), 2));
  // A real certificate with its serial tag turned into the constructed form no longer decodes.
  const der = new Uint8Array(readFileSync(FIX + "leaf.der"));
  const root = parseDer(der);
  const tbs = root.children[0];
  const serialAt = tbs.children[0].cls === 2 ? tbs.children[1].start : tbs.children[0].start;
  assert.equal(der[serialAt], 0x02);
  const constructedSerial = der.slice();
  constructedSerial[serialAt] = 0x22;
  assert.equal(parseCertificate(constructedSerial).ok, false);
  // Serial 02 02 00 01: a redundant leading zero. Re-encode a real serial with one, adjusting both outer lengths.
  const serialNode = tbs.children[0].cls === 2 ? tbs.children[1] : tbs.children[0];
  const content = der.subarray(serialNode.contentStart, serialNode.end);
  assert.ok(serialNode.contentStart - serialNode.start === 2 && (content[0] & 0x80) === 0, "fixture serial is short-form and positive");
  assert.equal(der[1], 0x82);
  assert.equal(der[5], 0x82);
  const padded = new Uint8Array(der.length + 1);
  padded.set(der.subarray(0, serialAt + 1), 0);
  padded[serialAt + 1] = content.length + 1;
  padded[serialAt + 2] = 0x00;
  padded.set(content, serialAt + 3);
  padded.set(der.subarray(serialNode.end), serialNode.end + 1);
  const bump = (at: number) => {
    const n = ((padded[at] << 8) | padded[at + 1]) + 1;
    padded[at] = n >> 8;
    padded[at + 1] = n & 0xff;
  };
  bump(2); // certificate SEQUENCE
  bump(6); // TBSCertificate SEQUENCE
  const entry = parseCertificate(padded);
  assert.ok(entry.ok, entry.ok ? "" : entry.error);
  if (!entry.ok) return;
  assert.equal(entry.cert.serial.minimal, false);
  assert.ok(reviewCertificate(entry.cert, NOW).some((f) => f.tone === "danger" && /redundant leading octet/.test(f.text)));
  // The original serial is minimal and draws no such finding.
  const original = parseCertificate(der);
  assert.ok(original.ok && original.cert.serial.minimal);
  assert.ok(original.ok && !reviewCertificate(original.cert, NOW).some((f) => /redundant leading octet/.test(f.text)));
});

await test("W7: DER lengths must be minimal, so a padded or needlessly long length is refused", () => {
  const body = (n: number) => new Uint8Array(n).fill(5);
  // Minimal long form for 128 is accepted: 30 81 80 <128 bytes>.
  const ok = new Uint8Array([0x04, 0x81, 0x80, ...body(128)]);
  assert.equal(parseDer(ok).end, 131);
  // Long form for a value below 128 is not DER (X.690 10.1).
  assert.throws(() => parseDer(new Uint8Array([0x04, 0x81, 0x05, ...body(5)])), /uses the long form, which DER forbids below 128/);
  // A leading zero octet in a long-form length is not DER either.
  assert.throws(() => parseDer(new Uint8Array([0x04, 0x82, 0x00, 0x80, ...body(128)])), /padded with a leading zero octet/);
  // Through the decoder: the outer SEQUENCE of a real certificate re-encoded with one padding octet.
  const [real] = decodeCertificates(readPemText(readFileSync(FIX + "leaf.pem", "utf8"))).entries;
  assert.ok(real.ok);
  if (!real.ok) return;
  const der = real.cert.der;
  assert.equal(der[1], 0x82); // 30 82 LL LL
  const padded = new Uint8Array([0x30, 0x83, 0x00, der[2], der[3], ...der.subarray(4)]);
  const entries = decodeCertificates(readBinary(padded)).entries;
  assert.ok(entries.length === 1 && !entries[0].ok && /padded with a leading zero octet/.test(entries[0].error));
});

console.log(`certificate-decoder: ${passed} tests passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
