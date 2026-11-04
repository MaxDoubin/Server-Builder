import assert from "node:assert/strict";
import { createHmac, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const FIXTURES = new URL("./fixtures/jwt-fixtures", import.meta.url).pathname;
import {
  algInfo,
  base64DecodeLoose,
  base64urlDecode,
  base64urlEncode,
  buildToken,
  checkClaims,
  derToPem,
  generateKeyPair,
  importHmacKey,
  importPrivateKey,
  importPublicKey,
  keyTypeOf,
  MAX_TOKEN_CHARS,
  parseJsonObject,
  parseSecret,
  parseToken,
  pemToDer,
  publicPemFromPrivate,
  randomSecret,
  roundedIntegers,
  secretNotes,
  setHeaderAlg,
  setNumericClaim,
  signSegments,
  utf8Bytes,
  verifyToken,
  jsonDepth,
  integerRewrites,
  MAX_JSON_DEPTH,
  prettyJson,
} from "../../client/src/lib/toolkit/jwt-encoder.ts";

let passed = 0;
const tests: [string, () => Promise<void> | void][] = [];
const t = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);
const subtle = globalThis.crypto.subtle;
const NOW = 1793448000; // 2026-10-31 12:00:00 UTC

/* ---------------- RFC 7515 Appendix A material */
const A_PAYLOAD = "eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ";
const A1_HEADER = "eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9";
const A1_KEY = "AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow";
const A1_SIG = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const A2_HEADER = "eyJhbGciOiJSUzI1NiJ9";
const A2_JWK: JsonWebKey = {
  kty: "RSA",
  n: "ofgWCuLjybRlzo0tZWJjNiuSfb4p4fAkd_wWJcyQoTbji9k0l8W26mPddxHmfHQp-Vaw-4qPCJrcS2mJPMEzP1Pt0Bm4d4QlL-yRT-SFd2lZS-pCgNMsD1W_YpRPEwOWvG6b32690r2jZ47soMZo9wGzjb_7OMg0LOL-bSf63kpaSHSXndS5z5rexMdbBYUsLA9e-KXBdQOS-UTo7WTBEMa2R2CapHg665xsmtdVMTBQY4uDZlxvb3qCo5ZwKh9kG4LT6_I5IhlJH7aGhyxXFvUK-DWNmoudF8NAco9_h9iaGNj8q2ethFkMLs91kzk2PAcDTW9gb54h4FRWyuXpoQ",
  e: "AQAB",
  d: "Eq5xpGnNCivDflJsRQBXHx1hdR1k6Ulwe2JZD50LpXyWPEAeP88vLNO97IjlA7_GQ5sLKMgvfTeXZx9SE-7YwVol2NXOoAJe46sui395IW_GO-pWJ1O0BkTGoVEn2bKVRUCgu-GjBVaYLU6f3l9kJfFNS3E0QbVdxzubSu3Mkqzjkn439X0M_V51gfpRLI9JYanrC4D4qAdGcopV_0ZHHzQlBjudU2QvXt4ehNYTCBr6XCLQUShb1juUO1ZdiYoFaFQT5Tw8bGUl_x_jTj3ccPDVZFD9pIuhLhBOneufuBiB4cS98l2SR_RQyGWSeWjnczT0QU91p1DhOVRuOopznQ",
  p: "4BzEEOtIpmVdVEZNCqS7baC4crd0pqnRH_5IB3jw3bcxGn6QLvnEtfdUdiYrqBdss1l58BQ3KhooKeQTa9AB0Hw_Py5PJdTJNPY8cQn7ouZ2KKDcmnPGBY5t7yLc1QlQ5xHdwW1VhvKn-nXqhJTBgIPgtldC-KDV5z-y2XDwGUc",
  q: "uQPEfgmVtjL0Uyyx88GZFF1fOunH3-7cepKmtH4pxhtCoHqpWmT8YAmZxaewHgHAjLYsp1ZSe7zFYHj7C6ul7TjeLQeZD_YwD66t62wDmpe_HlB-TnBA-njbglfIsRLtXlnDzQkv5dTltRJ11BKBBypeeF6689rjcJIDEz9RWdc",
  dp: "BwKfV3Akq5_MFZDFZCnW-wzl-CCo83WoZvnLQwCTeDv8uzluRSnm71I3QCLdhrqE2e9YkxvuxdBfpT_PI7Yz-FOKnu1R6HsJeDCjn12Sk3vmAktV2zb34MCdy7cpdTh_YVr7tss2u6vneTwrA86rZtu5Mbr1C1XsmvkxHQAdYo0",
  dq: "h_96-mK1R_7glhsum81dZxjTnYynPbZpHziZjeeHcXYsXaaMwkOlODsWa7I9xXDoRwbKgB719rrmI2oKr6N3Do9U0ajaHF-NKJnwgjMd2w9cjz3_-kyNlxAr2v4IKhGNpmM5iIgOS1VZnOZ68m6_pbLBSp3nssTdlqvd0tIiTHU",
  qi: "IYd7DHOhrWvxkwPQsRM2tOgrjbcrfvtQJipd-DlcxyVuuM9sQLdgjVk2oy26F0EmpScGLq2MowX7fhd_QJQ3ydy5cY7YIBi87w93IKLEdfnbJtoOPLUW0ITrJReOgo1cq9SbsxYawBgfp_gh6A5603k2-ZQwVK0JKSHuLFkuQ3U",
};
const A2_SIG =
  "cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw";
const A3_HEADER = "eyJhbGciOiJFUzI1NiJ9";
const A3_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
  y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
  d: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI",
};
const A3_SIG = "DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q";

async function rsaPems() {
  const priv = await subtle.importKey("jwk", A2_JWK, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["sign"]);
  const pub = await subtle.importKey("jwk", { kty: "RSA", n: A2_JWK.n, e: A2_JWK.e }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["verify"]);
  return {
    privatePem: derToPem(new Uint8Array(await subtle.exportKey("pkcs8", priv)), "PRIVATE KEY"),
    publicPem: derToPem(new Uint8Array(await subtle.exportKey("spki", pub)), "PUBLIC KEY"),
  };
}
async function ecPems() {
  const priv = await subtle.importKey("jwk", A3_JWK, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const pub = await subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: A3_JWK.x, y: A3_JWK.y }, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  return {
    privatePem: derToPem(new Uint8Array(await subtle.exportKey("pkcs8", priv)), "PRIVATE KEY"),
    publicPem: derToPem(new Uint8Array(await subtle.exportKey("spki", pub)), "PUBLIC KEY"),
  };
}

/* ---------------- base64url */
t("RFC 4648 section 10 vectors, base64url without padding", () => {
  const v: [string, string][] = [["", ""], ["f", "Zg"], ["fo", "Zm8"], ["foo", "Zm9v"], ["foob", "Zm9vYg"], ["fooba", "Zm9vYmE"], ["foobar", "Zm9vYmFy"]];
  for (const [plain, enc] of v) {
    assert.equal(base64urlEncode(utf8Bytes(plain)), enc);
    const d = base64urlDecode(enc);
    assert.ok(d.ok && new TextDecoder().decode(d.bytes) === plain);
  }
  // 0xfb 0xff uses both URL-safe characters.
  assert.equal(base64urlEncode(new Uint8Array([0xfb, 0xff])), "-_8");
  assert.equal(base64urlEncode(new Uint8Array([0xfb, 0xef, 0xff])), "--__");
});
t("strict segment decoding rejects padding, standard alphabet, whitespace, dangling characters", () => {
  assert.ok(!base64urlDecode("Zg==").ok);
  assert.ok(!base64urlDecode("a+b/").ok);
  assert.ok(!base64urlDecode("Zm 9v").ok);
  assert.ok(!base64urlDecode("Zm9vY").ok);
  const plus = base64urlDecode("ab+c");
  assert.ok(!plus.ok && plus.error.includes("standard Base64"));
});
t("loose Base64 for secrets accepts both alphabets, padding and whitespace", () => {
  const k = base64DecodeLoose(A1_KEY);
  assert.ok(k.ok && k.bytes.length === 64);
  const std = base64DecodeLoose("Zm9v\nYmE=");
  assert.ok(std.ok && new TextDecoder().decode(std.bytes) === "fooba");
  assert.ok(!base64DecodeLoose("Zm9v===").ok);
  assert.ok(!base64DecodeLoose("Zm9v!").ok);
});

/* ---------------- HMAC */
t("RFC 4231 test case 2 through importHmacKey (SHA-256, 384, 512)", async () => {
  const data = utf8Bytes("what do ya want for nothing?");
  const expected: Record<string, string> = {
    HS256: "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    HS384: "af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649",
    HS512: "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737",
  };
  for (const alg of ["HS256", "HS384", "HS512"] as const) {
    const key = await importHmacKey(algInfo(alg), utf8Bytes("Jefe"), "sign");
    const mac = new Uint8Array(await subtle.sign("HMAC", key, data));
    assert.equal(Buffer.from(mac).toString("hex"), expected[alg], alg);
  }
});
t("RFC 7515 A.1: HS256 signature over the exact segments", async () => {
  const secret = parseSecret(A1_KEY, "base64");
  assert.ok(secret.ok);
  const key = await importHmacKey(algInfo("HS256"), secret.bytes, "sign");
  const sig = await signSegments(algInfo("HS256"), key, A1_HEADER, A_PAYLOAD);
  assert.equal(base64urlEncode(sig), A1_SIG);
});
t("RFC 7515 A.1: the complete token verifies, and its 2011 exp is reported", async () => {
  const r = await verifyToken(`${A1_HEADER}.${A_PAYLOAD}.${A1_SIG}`, { kind: "secret", text: A1_KEY, format: "base64" }, NOW);
  assert.ok(r.ok);
  assert.equal(r.signatureValid, true);
  assert.equal(r.accepted, false);
  assert.ok(r.verdict.includes("expired"));
  const bad = await verifyToken(`${A1_HEADER}.${A_PAYLOAD}.${A1_SIG.slice(0, -1)}Y`, { kind: "secret", text: A1_KEY, format: "base64" }, NOW);
  assert.ok(bad.ok && !bad.signatureValid);
});
t("jwt.io's published HS256 example token is reproduced exactly", async () => {
  const r = await buildToken({
    alg: "HS256",
    headerText: '{"alg":"HS256","typ":"JWT"}',
    payloadText: '{"sub":"1234567890","name":"John Doe","iat":1516239022}',
    key: { kind: "secret", text: "your-256-bit-secret", format: "text" },
  });
  assert.ok(r.ok);
  assert.equal(
    r.token,
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  );
  // 19 bytes, under 32, and a tutorial secret.
  assert.ok(r.notes.some((n) => n.tone === "danger" && n.text.includes("19 bytes")));
  assert.ok(r.notes.some((n) => n.text.includes("wordlists")));
  assert.ok(r.notes.some((n) => n.text.includes("no exp")));
});
t("HS384 and HS512 match node:crypto HMAC over the same signing input", async () => {
  for (const alg of ["HS384", "HS512"] as const) {
    const secret = "k".repeat(80);
    const r = await buildToken({
      alg,
      headerText: `{"alg":"${alg}"}`,
      payloadText: '{"sub":"a","exp":2000000000}',
      key: { kind: "secret", text: secret, format: "text" },
    });
    assert.ok(r.ok);
    const expected = createHmac(alg === "HS384" ? "sha384" : "sha512", secret).update(`${r.headerSeg}.${r.payloadSeg}`).digest("base64url");
    assert.equal(r.signatureSeg, expected);
    assert.equal(r.signatureBytes, algInfo(alg).hashBytes);
  }
});

/* ---------------- RSA and ECDSA */
t("RFC 7515 A.2: RS256 signature from a PKCS#8 PEM is byte-identical (PKCS1 v1.5 is deterministic)", async () => {
  const { privatePem } = await rsaPems();
  const imported = await importPrivateKey(algInfo("RS256"), privatePem);
  assert.ok(imported.ok);
  const sig = await signSegments(algInfo("RS256"), imported.key, A2_HEADER, A_PAYLOAD);
  assert.equal(base64urlEncode(sig), A2_SIG);
  assert.ok(imported.notes.some((n) => n.text.includes("2048 bits")));
});
t("RFC 7515 A.2: the token verifies with the SPKI public key", async () => {
  const { publicPem } = await rsaPems();
  const r = await verifyToken(`${A2_HEADER}.${A_PAYLOAD}.${A2_SIG}`, { kind: "pem", text: publicPem }, 1300819000);
  assert.ok(r.ok && r.signatureValid && r.accepted, r.ok ? r.verdict : r.error);
});
t("RFC 7515 A.3: the ES256 token verifies with the SPKI public key", async () => {
  const { publicPem } = await ecPems();
  const r = await verifyToken(`${A3_HEADER}.${A_PAYLOAD}.${A3_SIG}`, { kind: "pem", text: publicPem }, 1300819000);
  assert.ok(r.ok && r.signatureValid && r.accepted, r.ok ? r.verdict : r.error);
  // One flipped bit in R fails.
  const flipped = `${A3_HEADER}.${A_PAYLOAD}.E${A3_SIG.slice(1)}`;
  const f = await verifyToken(flipped, { kind: "pem", text: publicPem }, 1300819000);
  assert.ok(f.ok && !f.signatureValid);
});
t("ES256 sign then verify: 64-byte R || S, and the derived public key is the RFC's", async () => {
  const { privatePem, publicPem } = await ecPems();
  const r = await buildToken({ alg: "ES256", headerText: '{"alg":"ES256","typ":"JWT"}', payloadText: '{"exp":2000000000}', key: { kind: "pem", text: privatePem } });
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.equal(r.signatureBytes, 64);
  assert.equal(r.publicPem, publicPem);
  const v = await verifyToken(r.token, { kind: "pem", text: publicPem }, NOW);
  assert.ok(v.ok && v.accepted);
});
t("RS256 build: derived public key equals the RFC key, and the token verifies", async () => {
  const { privatePem, publicPem } = await rsaPems();
  const r = await buildToken({ alg: "RS256", headerText: '{"alg":"RS256"}', payloadText: '{"exp":2000000000}', key: { kind: "pem", text: privatePem } });
  assert.ok(r.ok);
  assert.equal(r.publicPem, publicPem);
  assert.equal(r.signatureBytes, 256);
  const v = await verifyToken(r.token, { kind: "pem", text: publicPem }, NOW);
  assert.ok(v.ok && v.accepted);
});
t("generated key pairs work end to end", async () => {
  for (const alg of ["RS256", "ES256"] as const) {
    const pair = await generateKeyPair(algInfo(alg));
    assert.ok(pair.privatePem.startsWith("-----BEGIN PRIVATE KEY-----"));
    const r = await buildToken({ alg, headerText: `{"alg":"${alg}"}`, payloadText: "{}", key: { kind: "pem", text: pair.privatePem } });
    assert.ok(r.ok);
    const v = await verifyToken(r.token, { kind: "pem", text: pair.publicPem }, NOW);
    assert.ok(v.ok && v.signatureValid);
  }
  const s = randomSecret(algInfo("HS512"));
  const d = base64DecodeLoose(s);
  assert.ok(d.ok && d.bytes.length === 64);
});
t("a 1024-bit RSA key is flagged (RFC 7518 section 3.3)", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const r = await importPrivateKey(algInfo("RS256"), privateKey);
  assert.ok(r.ok && r.notes.some((n) => n.tone === "danger" && n.text.includes("1024 bits")));
});

/* ---------------- PEM and key types */
t("PEM labels: friendly errors with the conversion command", async () => {
  const pkcs1 = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "pkcs1", format: "pem" } });
  const p1 = pemToDer(pkcs1.privateKey, "private");
  assert.ok(!p1.ok && p1.error.includes("openssl pkcs8 -topk8"));
  const p1pub = pemToDer(pkcs1.publicKey, "public");
  assert.ok(!p1pub.ok && p1pub.error.includes("RSAPublicKey_in"));
  const sec1 = generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "sec1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const s1 = pemToDer(sec1.privateKey, "private");
  assert.ok(!s1.ok && s1.error.includes("SEC 1"));
  const wrongWay = pemToDer(sec1.publicKey, "private");
  assert.ok(!wrongWay.ok && wrongWay.error.includes("public key"));
  const cert = pemToDer("-----BEGIN CERTIFICATE-----\nMAA=\n-----END CERTIFICATE-----", "public");
  assert.ok(!cert.ok && cert.error.includes("openssl x509"));
  assert.ok(!pemToDer("", "public").ok);
  assert.ok(!pemToDer("hello", "public").ok);
  assert.ok(!pemToDer("ssh-ed25519 AAAAC3Nz test", "public").ok);
  assert.ok(!pemToDer("-----BEGIN PUBLIC KEY-----\n!!!!\n-----END PUBLIC KEY-----", "public").ok);
  assert.ok(!pemToDer("-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----", "public").ok, "not a SEQUENCE");
  assert.ok(!pemToDer("-----BEGIN PUBLIC KEY-----\nMAA=\n-----END PRIVATE KEY-----", "public").ok);
});
t("key type from DER: RSA, P-256, P-384, Ed25519, and mismatches", async () => {
  const kp = (type: "rsa" | "ec" | "ed25519", opts: object) =>
    generateKeyPairSync(type as "rsa", { ...opts, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } } as never) as unknown as { privateKey: string; publicKey: string };
  const der = (pem: string, kind: "private" | "public") => {
    const r = pemToDer(pem, kind);
    if (!r.ok) throw new Error(r.error);
    return r.der;
  };
  const rsa = kp("rsa", { modulusLength: 2048 });
  const p256 = kp("ec", { namedCurve: "P-256" });
  const p384 = kp("ec", { namedCurve: "P-384" });
  const ed = kp("ed25519", {});
  assert.equal(keyTypeOf(der(rsa.privateKey, "private"), "private"), "rsa");
  assert.equal(keyTypeOf(der(rsa.publicKey, "public"), "public"), "rsa");
  assert.equal(keyTypeOf(der(p256.privateKey, "private"), "private"), "ec-p256");
  assert.equal(keyTypeOf(der(p384.publicKey, "public"), "public"), "ec-p384");
  assert.equal(keyTypeOf(der(ed.privateKey, "private"), "private"), "ed25519");
  assert.equal(keyTypeOf(new Uint8Array([0x30, 0x82, 0xff]), "public"), "unknown");
  const ecForRsa = await importPrivateKey(algInfo("RS256"), p256.privateKey);
  assert.ok(!ecForRsa.ok && ecForRsa.error.includes("needs an RSA key"));
  const p384ForEs = await importPublicKey(algInfo("ES256"), p384.publicKey);
  assert.ok(!p384ForEs.ok && p384ForEs.error.includes("ES384"));
});

/* ---------------- verification policy */
t("RFC 7515 Appendix E: alg none with an unknown crit is rejected", async () => {
  const tok = "eyJhbGciOiJub25lIiwNCiAiY3JpdCI6WyJodHRwOi8vZXhhbXBsZS5jb20vVU5ERUZJTkVEIl0sDQogImh0dHA6Ly9leGFtcGxlLmNvbS9VTkRFRklORUQiOnRydWUNCn0.RkFJTA.";
  const r = await verifyToken(tok, { kind: "secret", text: "x".repeat(32), format: "text" }, NOW);
  assert.ok(r.ok && !r.accepted && !r.signatureValid);
  assert.ok(r.verdict.includes("alg none"));
});
t("alg none in any capitalization is refused, and the builder will not make one", async () => {
  const seg = (o: object) => base64urlEncode(utf8Bytes(JSON.stringify(o)));
  for (const alg of ["none", "None", "NONE", "nOnE"]) {
    const r = await verifyToken(`${seg({ alg })}.${seg({ sub: "a" })}.`, { kind: "secret", text: "x".repeat(32), format: "text" }, NOW);
    assert.ok(r.ok && !r.accepted, alg);
    if (alg !== "none") assert.ok(r.notes.some((n) => n.text.includes("case-sensitive")));
  }
  const b = await buildToken({ alg: "HS256", headerText: '{"alg":"none"}', payloadText: "{}", key: { kind: "secret", text: "x".repeat(32), format: "text" } });
  assert.ok(!b.ok && b.error.includes("Unsecured JWS"));
});
t("key confusion: an HS256 token is never checked with a public key", async () => {
  const { publicPem } = await rsaPems();
  // The forgery: HMAC keyed with the public key's PEM text.
  const forged = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: '{"sub":"admin","exp":2000000000}', key: { kind: "secret", text: publicPem, format: "text" } });
  assert.ok(forged.ok);
  assert.ok(forged.notes.some((n) => n.text.includes("key confusion")));
  const asPublic = await verifyToken(forged.token, { kind: "pem", text: publicPem }, NOW);
  assert.ok(asPublic.ok && !asPublic.accepted && !asPublic.signatureValid);
  assert.ok(asPublic.notes.some((n) => n.tone === "danger" && n.text.includes("key confusion")));
  // Verifying with the PEM text as a secret shows the warning alongside the result.
  const asSecret = await verifyToken(forged.token, { kind: "secret", text: publicPem, format: "text" }, NOW);
  assert.ok(asSecret.ok && asSecret.signatureValid && asSecret.notes.some((n) => n.text.includes("key confusion forgery")));
});
t("an RS256 token is not checked with a shared secret", async () => {
  const r = await verifyToken(`${A2_HEADER}.${A_PAYLOAD}.${A2_SIG}`, { kind: "secret", text: "x".repeat(32), format: "text" }, NOW);
  assert.ok(r.ok && !r.accepted && r.verdict.includes("shared secret"));
});
t("alg names are case-sensitive and unsupported ones are named", async () => {
  const seg = (o: object) => base64urlEncode(utf8Bytes(JSON.stringify(o)));
  const lower = await verifyToken(`${seg({ alg: "hs256" })}.${seg({})}.AAAA`, { kind: "secret", text: "x".repeat(32), format: "text" }, NOW);
  assert.ok(lower.ok && lower.verdict.includes("case-sensitive"));
  const ps = await verifyToken(`${seg({ alg: "PS256" })}.${seg({})}.AAAA`, { kind: "secret", text: "x".repeat(32), format: "text" }, NOW);
  assert.ok(ps.ok && ps.verdict.includes("PS256"));
  const missing = await verifyToken(`${seg({ typ: "JWT" })}.${seg({})}.AAAA`, { kind: "secret", text: "x".repeat(32), format: "text" }, NOW);
  assert.ok(missing.ok && missing.verdict.includes("no alg"));
});
t("a DER-encoded ES256 signature is explained", async () => {
  const { publicPem } = await ecPems();
  const raw = base64urlDecode(A3_SIG);
  assert.ok(raw.ok);
  const r = raw.bytes.subarray(0, 32);
  const s = raw.bytes.subarray(32);
  const int = (b: Uint8Array) => (b[0] & 0x80 ? [0x02, b.length + 1, 0, ...b] : [0x02, b.length, ...b]);
  const body = [...int(r), ...int(s)];
  const der = new Uint8Array([0x30, body.length, ...body]);
  const v = await verifyToken(`${A3_HEADER}.${A_PAYLOAD}.${base64urlEncode(der)}`, { kind: "pem", text: publicPem }, 1300819000);
  assert.ok(v.ok && !v.signatureValid);
  assert.ok(v.notes.some((n) => n.text.includes("DER SEQUENCE")));
});
t("header parameters that point outward are flagged", async () => {
  const seg = (o: object) => base64urlEncode(utf8Bytes(JSON.stringify(o)));
  const r = await verifyToken(`${seg({ alg: "HS256", jku: "https://evil.example/k", jwk: {}, kid: "../../dev/null" })}.${seg({})}.AAAA`, { kind: "secret", text: "x".repeat(32), format: "text" }, NOW);
  assert.ok(r.ok);
  assert.ok(r.notes.some((n) => n.text.includes("jku")));
  assert.ok(r.notes.some((n) => n.text.includes("embeds a jwk")));
  assert.ok(r.notes.some((n) => n.text.includes("kid")));
});

/* ---------------- claims */
t("exp and nbf boundaries follow RFC 7519 4.1.4 and 4.1.5 exactly", () => {
  assert.ok(checkClaims({ exp: NOW }, NOW, "verify").blocking, "exp equal to now has expired");
  assert.equal(checkClaims({ exp: NOW + 1 }, NOW, "verify").blocking, null);
  assert.equal(checkClaims({ nbf: NOW }, NOW, "verify").blocking, null, "nbf equal to now is valid");
  assert.ok(checkClaims({ nbf: NOW + 1 }, NOW, "verify").blocking);
  assert.ok(checkClaims({ exp: "tomorrow" }, NOW, "verify").blocking);
  assert.equal(checkClaims({ iat: "x" }, NOW, "verify").blocking, null);
  const ms = checkClaims({ exp: NOW * 1000 }, NOW, "verify");
  assert.equal(ms.blocking, null);
  assert.ok(ms.notes.some((n) => n.text.includes("milliseconds")));
  assert.ok(checkClaims({ iat: NOW + 3600 }, NOW, "verify").notes.some((n) => n.text.includes("future")));
  assert.equal(checkClaims({ exp: 1e300 }, NOW, "verify").blocking, null);
});
t("claim helpers and header alg rewrite", () => {
  const r = setNumericClaim('{"sub":"a"}', "exp", NOW + 900.7);
  assert.ok(r.ok && JSON.parse(r.text).exp === NOW + 900 && JSON.parse(r.text).sub === "a");
  assert.ok(setNumericClaim("", "iat", NOW).ok);
  assert.ok(!setNumericClaim("[1]", "iat", NOW).ok);
  assert.ok(!setNumericClaim("{bad", "iat", NOW).ok);
  assert.equal(setHeaderAlg('{"typ":"JWT","alg":"HS256","kid":"1"}', "ES256"), JSON.stringify({ typ: "JWT", alg: "ES256", kid: "1" }, null, 2));
  assert.equal(setHeaderAlg('{"typ":"JWT"}', "RS256"), JSON.stringify({ alg: "RS256", typ: "JWT" }, null, 2));
  assert.equal(setHeaderAlg("{oops", "RS256"), null);
});
t("integers past 2^53 are reported as typed, strings are not", () => {
  assert.deepEqual(roundedIntegers('{"id": 12345678901234567890, "s": "12345678901234567890"}'), ["12345678901234567890"]);
  assert.deepEqual(roundedIntegers('{"a": 9007199254740993}'), ["9007199254740993"]);
  assert.deepEqual(roundedIntegers('{"a": 9007199254740991, "b": -9007199254740991, "c": 1.5}'), []);
  // -2^53 is exactly representable, so JSON.parse does not change it; -2^53 - 1 is rounded.
  assert.deepEqual(roundedIntegers('{"a": "\\"12345678901234567890", "b": -9007199254740992}'), []);
  assert.deepEqual(roundedIntegers('{"a": "\\"12345678901234567890", "b": -9007199254740993}'), ["-9007199254740993"]);
});
t("builder: header and payload must be JSON objects, alg must agree", async () => {
  const k = { kind: "secret" as const, text: "x".repeat(32), format: "text" as const };
  for (const [h, p, frag] of [
    ["", "{}", "empty"],
    ["{", "{}", "not valid JSON"],
    ["[]", "{}", "an array"],
    ['{"alg":"HS256"}', "null", "null"],
    ['{"alg":"HS256"}', '"str"', "a string"],
    ['{"typ":"JWT"}', "{}", "no alg"],
    ['{"alg":"RS256"}', "{}", "agree"],
    ['{"alg":"HS256"}', "x".repeat(20000), "characters"],
  ]) {
    const r = await buildToken({ alg: "HS256", headerText: h, payloadText: p, key: k });
    assert.ok(!r.ok && r.error.includes(frag), `${h} ${p.slice(0, 20)}: ${r.ok ? "ok" : r.error}`);
  }
  const noKey = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: "{}", key: { kind: "secret", text: "", format: "text" } });
  assert.ok(!noKey.ok && noKey.error.includes("Enter a secret"));
  const badB64 = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: "{}", key: { kind: "secret", text: "abc$", format: "base64" } });
  assert.ok(!badB64.ok && badB64.error.includes("Base64"));
  const noPem = await buildToken({ alg: "RS256", headerText: '{"alg":"RS256"}', payloadText: "{}", key: { kind: "pem", text: "" } });
  assert.ok(!noPem.ok);
  const unicode = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: '{"name":"é☃😀"}', key: k });
  assert.ok(unicode.ok);
  const back = parseToken(unicode.token);
  assert.ok(back.ok && back.token.payload?.name === "é☃😀");
});
t("secret notes: length rule, Base64-looking text, whitespace", () => {
  const hs512 = algInfo("HS512");
  assert.ok(secretNotes("a".repeat(63), "text", utf8Bytes("a".repeat(63)), hs512).some((n) => n.text.includes("at least 64 bytes")));
  assert.ok(!secretNotes("a".repeat(64), "text", utf8Bytes("a".repeat(64)), hs512).some((n) => n.text.includes("at least 64")));
  assert.ok(secretNotes(A1_KEY, "text", utf8Bytes(A1_KEY), algInfo("HS256")).some((n) => n.text.includes("looks like Base64")));
  assert.ok(secretNotes(" pad ", "text", utf8Bytes(" pad "), algInfo("HS256")).some((n) => n.text.includes("whitespace")));
});

/* ---------------- malformed tokens */
t("malformed tokens give precise errors and never throw", async () => {
  const cases: [string, string][] = [
    ["", "Paste a token"],
    ["abc", "three segments"],
    ["a.b", "has 2"],
    ["a.b.c.d", "has 4"],
    ["eyJhbGciOiJSU0EtT0FFUCJ9.a.b.c.d", "JWE"],
    ["eyJhbGciOiJIUzI1NiJ9=.e30.AAAA", "padding"],
    ["eyJhbGciOiJIUzI1NiJ9.e30+.AAAA", "standard Base64"],
    ["e.e30.AAAA", "dangling"],
    [".e30.AAAA", "empty"],
    ["bm90IGpzb24.e30.AAAA", "not to JSON"],
    ["WzFd.e30.AAAA", "not an object"],
    ["_w.e30.AAAA", "UTF-8"],
    ["x".repeat(MAX_TOKEN_CHARS + 1), "characters"],
  ];
  for (const [tok, frag] of cases) {
    const p = parseToken(tok);
    assert.ok(!p.ok && p.error.includes(frag), `${tok.slice(0, 30)}: ${p.ok ? "ok" : p.error}`);
    const v = await verifyToken(tok, { kind: "secret", text: "x".repeat(32), format: "text" }, NOW);
    assert.ok(!v.ok);
  }
  const bearer = parseToken(`Bearer ${A1_HEADER}.${A_PAYLOAD}.${A1_SIG}`);
  assert.ok(bearer.ok);
  const notJson = parseToken(`${A1_HEADER}.${base64urlEncode(utf8Bytes("hello"))}.${A1_SIG}`);
  assert.ok(notJson.ok && notJson.token.payload === null && notJson.token.payloadText === "hello");
  assert.ok(parseJsonObject("{}", "header").ok);
});


/* ---------------- second verifier: independent reference cases */
// RFC 7520 (JOSE Cookbook) section 3.4 key, section 3.5 key, and the shared payload of Figure 8.
const C_PAYLOAD =
  "SXTigJlzIGEgZGFuZ2Vyb3VzIGJ1c2luZXNzLCBGcm9kbywgZ29pbmcgb3V0IHlvdXIgZG9vci4gWW91IHN0ZXAgb250byB0aGUgcm9hZCwgYW5kIGlmIHlvdSBkb24ndCBrZWVwIHlvdXIgZmVldCwgdGhlcmXigJlzIG5vIGtub3dpbmcgd2hlcmUgeW91IG1pZ2h0IGJlIHN3ZXB0IG9mZiB0by4";
const C44_HEADER = "eyJhbGciOiJIUzI1NiIsImtpZCI6IjAxOGMwYWU1LTRkOWItNDcxYi1iZmQ2LWVlZjMxNGJjNzAzNyJ9";
const C44_KEY = "hJtXIZ2uSN5kbQfbtTNWbpdmhkV8FJG-Onbc6mxCcYg";
const C44_SIG = "s0h6KThzkfBBBkLspW1h84VsJZFTsPPqMDA7g1Md7p0";
const C41_HEADER = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImJpbGJvLmJhZ2dpbnNAaG9iYml0b24uZXhhbXBsZSJ9";
const C41_SIG =
  "MRjdkly7_-oTPTS3AXP41iQIGKa80A0ZmTuV5MEaHoxnW2e5CZ5NlKtainoFmKZopdHM1O2U4mwzJdQx996ivp83xuglII7PNDi84wnB-BDkoBwA78185hX-Es4JIwmDLJK3lfWRa-XtL0RnltuYv746iYTh_qHRD68BNt1uSNCrUCTJDt5aAE6x8wW1Kt9eRo4QPocSadnHXFxnt8Is9UzpERV0ePPQdLuW3IS_de3xyIrDaLGdjluPxUAhb6L2aXic1U12podGU0KLUQSE_oI-ZnmKJ3F4uOZDnd6QZWJushZ41Axf_fcIe8u9ipH84ogoree7vjbU5y18kDquDg";
const C34_JWK = {
  kty: "RSA",
  n: "n4EPtAOCc9AlkeQHPzHStgAbgs7bTZLwUBZdR8_KuKPEHLd4rHVTeT-O-XV2jRojdNhxJWTDvNd7nqQ0VEiZQHz_AJmSCpMaJMRBSFKrKb2wqVwGU_NsYOYL-QtiWN2lbzcEe6XC0dApr5ydQLrHqkHHig3RBordaZ6Aj-oBHqFEHYpPe7Tpe-OfVfHd1E6cS6M1FZcD1NNLYD5lFHpPI9bTwJlsde3uhGqC0ZCuEHg8lhzwOHrtIQbS0FVbb9k3-tVTU4fg_3L_vniUFAKwuCLqKnS2BYwdq_mzSnbLY7h_qixoR7jig3__kRhuaxwUkRz5iaiQkqgc5gHdrNP5zw",
  e: "AQAB",
  d: "bWUC9B-EFRIo8kpGfh0ZuyGPvMNKvYWNtB_ikiH9k20eT-O1q_I78eiZkpXxXQ0UTEs2LsNRS-8uJbvQ-A1irkwMSMkK1J3XTGgdrhCku9gRldY7sNA_AKZGh-Q661_42rINLRCe8W-nZ34ui_qOfkLnK9QWDDqpaIsA-bMwWWSDFu2MUBYwkHTMEzLYGqOe04noqeq1hExBTHBOBdkMXiuFhUq1BU6l-DqEiWxqg82sXt2h-LMnT3046AOYJoRioz75tSUQfGCshWTBnP5uDjd18kKhyv07lhfSJdrPdM5Plyl21hsFf4L_mHCuoFau7gdsPfHPxxjVOcOpBrQzwQ",
  p: "3Slxg_DwTXJcb6095RoXygQCAZ5RnAvZlno1yhHtnUex_fp7AZ_9nRaO7HX_-SFfGQeutao2TDjDAWU4Vupk8rw9JR0AzZ0N2fvuIAmr_WCsmGpeNqQnev1T7IyEsnh8UMt-n5CafhkikzhEsrmndH6LxOrvRJlsPp6Zv8bUq0k",
  q: "uKE2dh-cTf6ERF4k4e_jy78GfPYUIaUyoSSJuBzp3Cubk3OCqs6grT8bR_cu0Dm1MZwWmtdqDyI95HrUeq3MP15vMMON8lHTeZu2lmKvwqW7anV5UzhM1iZ7z4yMkuUwFWoBvyY898EXvRD-hdqRxHlSqAZ192zB3pVFJ0s7pFc",
  dp: "B8PVvXkvJrj2L-GYQ7v3y9r6Kw5g9SahXBwsWUzp19TVlgI-YV85q1NIb1rxQtD-IsXXR3-TanevuRPRt5OBOdiMGQp8pbt26gljYfKU_E9xn-RULHz0-ed9E9gXLKD4VGngpz-PfQ_q29pk5xWHoJp009Qf1HvChixRX59ehik",
  dq: "CLDmDGduhylc9o7r84rEUVn7pzQ6PF83Y-iBZx5NT-TpnOZKF1pErAMVeKzFEl41DlHHqqBLSM0W1sOFbwTxYWZDm6sI6og5iTbwQGIC3gnJKbi_7k_vJgGHwHxgPaX2PnvP-zyEkDERuf-ry4c_Z11Cq9AqC2yeL6kdKT1cYF8",
  qi: "3PiqvXQN0zwMeE-sBvZgi289XP9XCQF3VWqPzMKnIgQp7_Tugo6-NZBKCQsMf3HaEGBjTVJs_jcK8-TRXvaKe-7ZMaQj8VfBdYkssbu0NKDDhjJ-GtiseaDVWt7dcH0cfwxgFUHpQh7FoCrjFJ6h6ZEpMF6xmujs4qMpPz8aaI4",
};

t("V2: RFC 7520 4.4 HS256 signature is byte-identical, and the non-JSON payload still verifies", async () => {
  const secret = parseSecret(C44_KEY, "base64");
  assert.ok(secret.ok && secret.bytes.length === 32);
  const key = await importHmacKey(algInfo("HS256"), secret.ok ? secret.bytes : new Uint8Array(), "sign");
  assert.equal(base64urlEncode(await signSegments(algInfo("HS256"), key, C44_HEADER, C_PAYLOAD)), C44_SIG);
  const v = await verifyToken(`${C44_HEADER}.${C_PAYLOAD}.${C44_SIG}`, { kind: "secret", text: C44_KEY, format: "base64" }, NOW);
  assert.ok(v.ok && v.signatureValid && v.accepted, v.ok ? v.verdict : v.error);
  assert.ok(v.ok && v.token.payload === null && v.token.payloadText?.startsWith("It’s a dangerous business, Frodo"));
  // One flipped character in the payload breaks it.
  const tampered = `${C44_HEADER}.${C_PAYLOAD.replace("SXTi", "SXTj")}.${C44_SIG}`;
  const tv = await verifyToken(tampered, { kind: "secret", text: C44_KEY, format: "base64" }, NOW);
  assert.ok(tv.ok && !tv.signatureValid && !tv.accepted);
});

t("V2: RFC 7520 4.1 RS256 signature is byte-identical from a PKCS#8 PEM, and verifies with the SPKI PEM", async () => {
  const privatePem = createPrivateKey({ key: C34_JWK, format: "jwk" }).export({ type: "pkcs8", format: "pem" }).toString();
  const publicPem = createPublicKey({ key: { kty: "RSA", n: C34_JWK.n, e: C34_JWK.e }, format: "jwk" }).export({ type: "spki", format: "pem" }).toString();
  const imported = await importPrivateKey(algInfo("RS256"), privatePem);
  assert.ok(imported.ok, imported.ok ? "" : imported.error);
  if (!imported.ok) return;
  assert.equal(base64urlEncode(await signSegments(algInfo("RS256"), imported.key, C41_HEADER, C_PAYLOAD)), C41_SIG);
  const v = await verifyToken(`${C41_HEADER}.${C_PAYLOAD}.${C41_SIG}`, { kind: "pem", text: publicPem }, NOW);
  assert.ok(v.ok && v.signatureValid && v.accepted, v.ok ? v.verdict : v.error);
  assert.ok(v.ok && v.notes.some((n) => n.text.includes("kid is \"bilbo.baggins@hobbiton.example\"")));
  // The same token checked as if the public key were an HMAC secret is the key confusion shape: refused outright.
  const forged = await verifyToken(`${C44_HEADER}.${C_PAYLOAD}.${C44_SIG}`, { kind: "pem", text: publicPem }, NOW);
  assert.ok(forged.ok && !forged.signatureValid && !forged.accepted && forged.verdict.includes("never verifies HS256"));
});

t("V2: RFC 4648 base64url boundary bytes and RFC 4231 case 6 (key longer than the block)", async () => {
  assert.equal(base64urlEncode(new Uint8Array([0xfb, 0xff])), "-_8");
  assert.equal(base64urlEncode(new Uint8Array([0xff])), "_w");
  assert.equal(base64urlEncode(new Uint8Array([0xfb, 0xef, 0xbe])), "----");
  const back = base64urlDecode("-_8");
  assert.ok(back.ok && back.bytes.length === 2 && back.bytes[0] === 0xfb && back.bytes[1] === 0xff);
  const key = new Uint8Array(131).fill(0xaa);
  const data = utf8Bytes("Test Using Larger Than Block-Size Key - Hash Key First");
  const expected: Record<string, string> = {
    HS256: "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
    HS512: "80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598",
  };
  for (const id of ["HS256", "HS512"] as const) {
    const k = await importHmacKey(algInfo(id), key, "sign");
    const mac = new Uint8Array(await subtle.sign("HMAC", k, data));
    assert.equal(Buffer.from(mac).toString("hex"), expected[id], id);
  }
});

t("V2: exp and nbf through the full verifier: exp == now rejected, nbf == now accepted", async () => {
  const secret = "k".repeat(32);
  const make = async (claims: object) => {
    const r = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: JSON.stringify(claims), key: { kind: "secret", text: secret, format: "text" } });
    assert.ok(r.ok);
    return r.ok ? r.token : "";
  };
  const check = async (claims: object) => verifyToken(await make(claims), { kind: "secret", text: secret, format: "text" }, NOW);
  const atExp = await check({ exp: NOW });
  assert.ok(atExp.ok && atExp.signatureValid && !atExp.accepted);
  const beforeExp = await check({ exp: NOW + 1 });
  assert.ok(beforeExp.ok && beforeExp.accepted);
  const atNbf = await check({ nbf: NOW, exp: NOW + 60 });
  assert.ok(atNbf.ok && atNbf.accepted);
  const beforeNbf = await check({ nbf: NOW + 1, exp: NOW + 60 });
  assert.ok(beforeNbf.ok && !beforeNbf.accepted);
  const stringExp = await check({ exp: String(NOW + 60) });
  assert.ok(stringExp.ok && !stringExp.accepted);
});

t("V2: deep nesting is refused or kept as text, and never overflows the stack", async () => {
  const deep = (n: number) => `${"[".repeat(n)}${"]".repeat(n)}`;
  assert.equal(jsonDepth(`{"a":"[[[[","b":${deep(3)}}`), 4);
  const h = parseJsonObject(`{"alg":"HS256","x":${deep(MAX_JSON_DEPTH + 1)}}`, "header");
  assert.ok(!h.ok && h.error.includes(String(MAX_JSON_DEPTH)));
  assert.ok(parseJsonObject(`{"alg":"HS256","x":${deep(MAX_JSON_DEPTH - 1)}}`, "header").ok);
  const built = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: `{"x":${deep(8000)}}`, key: { kind: "secret", text: "k".repeat(32), format: "text" } });
  assert.ok(!built.ok);
  const deepHeader = base64urlEncode(utf8Bytes(`{"alg":"HS256","x":${deep(20000)}}`));
  const p = parseToken(`${deepHeader}.e30.${A1_SIG}`);
  assert.ok(!p.ok && p.error.includes("levels deep"));
  const deepPayload = base64urlEncode(utf8Bytes(`{"x":${deep(20000)}}`));
  const v = await verifyToken(`${A1_HEADER}.${deepPayload}.${A1_SIG}`, { kind: "secret", text: A1_KEY, format: "base64" }, NOW);
  assert.ok(v.ok && v.token.payload === null && !v.signatureValid);
  assert.ok(v.ok && v.notes.some((n) => n.text.includes("levels deep")));
  assert.equal(prettyJson({ a: 1 }), '{\n  "a": 1\n}');
});

t("V2: integers are reported exactly when JSON.parse plus JSON.stringify changes them, and the claim helper refuses to", () => {
  // 1e20 and 2^53 come back as the same integer; 2^60 comes back as 1152921504606847000, a different integer.
  assert.deepEqual(roundedIntegers('{"a":1e20,"b":9007199254740992,"c":-9007199254740992,"d":2.5e3}'), []);
  assert.deepEqual(integerRewrites('{"a":1152921504606846976}'), [{ typed: "1152921504606846976", written: "1152921504606847000" }]);
  assert.deepEqual(integerRewrites('{"a":9007199254740993}'), [{ typed: "9007199254740993", written: "9007199254740992" }]);
  assert.deepEqual(roundedIntegers('{"a":9007199254740993,"b":-9007199254740993,"c":"9007199254740993"}'), ["9007199254740993", "-9007199254740993"]);
  // Integer value written with a fraction or exponent is compared exactly too.
  assert.deepEqual(roundedIntegers('{"a":9007199254740993.0,"b":9.007199254740993e15}'), ["9007199254740993.0", "9.007199254740993e15"]);
  // Too large for a double: JSON.stringify writes null.
  const huge = "9".repeat(400);
  assert.deepEqual(integerRewrites(`{"a":${huge}}`), [{ typed: `${"9".repeat(40)}...`, written: "null" }]);
  assert.equal(JSON.stringify(JSON.parse(`{"a":${huge}}`)), '{"a":null}');
  const r = setNumericClaim('{"id": 9007199254740993}', "exp", NOW);
  assert.ok(!r.ok && r.error.includes("9007199254740993 (would become 9007199254740992)"));
  const ok = setNumericClaim('{"id": 9007199254740992}', "exp", NOW);
  assert.ok(ok.ok && ok.text.includes("9007199254740992"));
});

t("V2: malformed and adversarial tokens give errors, never throws", async () => {
  const key = { kind: "secret" as const, text: "k".repeat(32), format: "text" as const };
  const bad = [
    "",
    "   ",
    "a.b",
    "a.b.c.d",
    "a.b.c.d.e",
    "..",
    `${A1_HEADER}.${A_PAYLOAD}.${A1_SIG}=`,
    `${A1_HEADER}.${A_PAYLOAD}.abé`,
    `${A1_HEADER}\n.${A_PAYLOAD}.${A1_SIG}`,
    "W10.e30.",
    "bnVsbA.e30.",
    "e30.e30.",
    "x".repeat(70_000),
    "\ud800.\udfff.\u0000",
  ];
  for (const tok of bad) {
    const v = await verifyToken(tok, key, NOW);
    assert.ok(!v.ok || !v.accepted, JSON.stringify(tok.slice(0, 20)));
  }
  // ES256 with a truncated or empty signature is invalid, not an exception.
  const { publicPem } = await ecPems();
  for (const sig of ["", A3_SIG.slice(0, 40)]) {
    const v = await verifyToken(`${A3_HEADER}.${A_PAYLOAD}.${sig}`, { kind: "pem", text: publicPem }, NOW);
    assert.ok(v.ok && !v.signatureValid);
  }
});


/* ---------------- V3: independent verifier. Fixtures from Python's hmac and json and the openssl CLI (gen_jwt_fixtures.py) */
const F3 = JSON.parse(readFileSync(`${FIXTURES}/jwt-encoder-v3.json`, "utf8"));

t("V3: HS256, HS384 and HS512 tokens are byte-identical to Python hmac over a UTF-8 payload", async () => {
  for (const alg of ["HS256", "HS384", "HS512"] as const) {
    const f = F3[`hmac_${alg}`];
    const b = await buildToken({ alg, headerText: JSON.stringify(f.header, null, 2), payloadText: JSON.stringify(F3.hmac_payload, null, 4), key: { kind: "secret", text: f.secret_b64, format: "base64" } });
    assert.ok(b.ok, alg);
    assert.equal(b.ok && b.token, f.token, alg);
    // Exactly hash-length secrets meet RFC 7518 section 3.2, so no length warning.
    assert.ok(b.ok && !b.notes.some((n) => n.text.includes("requires at least")), alg);
    const v = await verifyToken(f.token, { kind: "secret", text: f.secret_b64, format: "base64" }, NOW);
    assert.ok(v.ok && v.accepted && v.checked, alg);
  }
});

t("V3: RS256 from an openssl-generated PKCS#8 key matches openssl dgst -sign byte for byte", async () => {
  const f = F3.rs256;
  const b = await buildToken({ alg: "RS256", headerText: JSON.stringify(f.header), payloadText: JSON.stringify(f.payload), key: { kind: "pem", text: f.private_pem } });
  assert.ok(b.ok, b.ok ? "" : b.error);
  assert.equal(b.ok && b.token, f.token);
  assert.equal(b.ok && b.signatureBytes, 256);
  // The derived SPKI is the same key openssl wrote.
  assert.deepEqual(b.ok && pemToDer(b.publicPem ?? "", "public"), pemToDer(f.public_pem, "public"));
  const v = await verifyToken(f.token, { kind: "pem", text: f.public_pem }, NOW);
  assert.ok(v.ok && v.accepted, v.ok ? v.verdict : v.error);
  // One flipped signature bit fails.
  const sig = base64urlDecode(f.token.split(".")[2]);
  assert.ok(sig.ok);
  const bytes = sig.ok ? sig.bytes : new Uint8Array();
  bytes[17] ^= 1;
  const tampered = `${f.token.split(".").slice(0, 2).join(".")}.${base64urlEncode(bytes)}`;
  const bad = await verifyToken(tampered, { kind: "pem", text: f.public_pem }, NOW);
  assert.ok(bad.ok && !bad.signatureValid && !bad.accepted);
});

t("V3: ES256 interop with openssl in both directions; DER signatures are refused", async () => {
  const f = F3.es256;
  const v = await verifyToken(f.token, { kind: "pem", text: f.public_pem }, NOW);
  assert.ok(v.ok && v.accepted, "openssl-signed token, converted to R || S, verifies");
  const der = await verifyToken(f.der_token, { kind: "pem", text: f.public_pem }, NOW);
  assert.ok(der.ok && !der.signatureValid && der.notes.some((n) => n.text.includes("DER SEQUENCE")));
  // The page's own ES256 signature, converted to DER, verifies under openssl dgst -verify.
  const b = await buildToken({ alg: "ES256", headerText: '{"alg":"ES256"}', payloadText: '{"sub":"es"}', key: { kind: "pem", text: f.private_pem } });
  assert.ok(b.ok && b.signatureBytes === 64);
  if (!b.ok) return;
  const rs = base64urlDecode(b.signatureSeg);
  assert.ok(rs.ok);
  const intDer = (x: Uint8Array) => {
    let i = 0;
    while (i < x.length - 1 && x[i] === 0) i++;
    const v2 = x.subarray(i);
    const body = v2[0] & 0x80 ? Uint8Array.from([0, ...v2]) : v2;
    return Uint8Array.from([0x02, body.length, ...body]);
  };
  const r = intDer(rs.ok ? rs.bytes.subarray(0, 32) : new Uint8Array()), s2 = intDer(rs.ok ? rs.bytes.subarray(32) : new Uint8Array());
  const seq = Uint8Array.from([0x30, r.length + s2.length, ...r, ...s2]);
  const dir = mkdtempSync(`${FIXTURES}/es-`);
  try {
    writeFileSync(`${dir}/pub.pem`, f.public_pem);
    writeFileSync(`${dir}/sig.der`, seq);
    writeFileSync(`${dir}/in.txt`, `${b.headerSeg}.${b.payloadSeg}`);
    const outText = execFileSync("openssl", ["dgst", "-sha256", "-verify", `${dir}/pub.pem`, "-signature", `${dir}/sig.der`, `${dir}/in.txt`]).toString();
    assert.match(outText, /Verified OK/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

t("V3: an HS256 token keyed with the RSA public key PEM (made in Python) is never accepted", async () => {
  const asPem = await verifyToken(F3.confusion_token, { kind: "pem", text: F3.rs256.public_pem }, NOW);
  assert.ok(asPem.ok && !asPem.accepted && asPem.verdict.includes("never verifies HS256"));
  assert.ok(asPem.ok && asPem.notes.some((n) => n.tone === "danger" && n.text.includes("key confusion")));
  const asSecret = await verifyToken(F3.confusion_token, { kind: "secret", text: F3.rs256.public_pem, format: "text" }, NOW);
  assert.ok(asSecret.ok && asSecret.signatureValid, "the HMAC itself matches");
  assert.ok(asSecret.ok && !asSecret.accepted && /public key text/.test(asSecret.verdict), "but public text authenticates nothing");
  const built = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: "{}", key: { kind: "secret", text: F3.rs256.public_pem, format: "text" } });
  assert.ok(built.ok && built.notes.some((n) => n.tone === "danger" && n.text.includes("key confusion")));
});

t("V3: RFC 7797 b64:false listed in crit is rejected even with a matching HMAC (RFC 7515 4.1.11)", async () => {
  const v = await verifyToken(F3.crit_token, { kind: "secret", text: "k".repeat(32), format: "text" }, NOW);
  assert.ok(v.ok && v.signatureValid && !v.accepted && v.verdict.includes("crit"));
});

t("V3: secret length boundaries of RFC 7518 section 3.2 (32, 48 and 64 bytes)", () => {
  for (const [alg, n] of [["HS256", 32], ["HS384", 48], ["HS512", 64]] as const) {
    const info = algInfo(alg);
    const short = secretNotes("x".repeat(n - 1), "text", utf8Bytes("x".repeat(n - 1)), info);
    const exact = secretNotes("x".repeat(n), "text", utf8Bytes("x".repeat(n)), info);
    assert.ok(short.some((m) => m.tone === "danger" && m.text.includes(`at least ${n} bytes (${n * 8} bits)`)), alg);
    assert.ok(!exact.some((m) => m.text.includes("requires at least")), alg);
  }
  // A multi-byte character counts as its UTF-8 length: 11 x 3 bytes = 33.
  const utf = "日".repeat(11);
  assert.equal(utf8Bytes(utf).length, 33);
  assert.ok(!secretNotes(utf, "text", utf8Bytes(utf), algInfo("HS256")).some((m) => m.text.includes("requires at least")));
});

t("V3: hex and Base64 secrets used as text are described as what they are", () => {
  const hex = "0123456789abcdef".repeat(4);
  const hn = secretNotes(hex, "text", utf8Bytes(hex), algInfo("HS512"));
  assert.ok(hn.some((m) => m.text.includes("looks like hex") && m.text.includes("at most 256 bits")));
  assert.ok(!hn.some((m) => m.text.includes("looks like Base64")));
  const b64 = F3.hmac_HS256.secret_b64;
  const bn = secretNotes(b64, "text", utf8Bytes(b64), algInfo("HS256"));
  assert.ok(bn.some((m) => m.text.includes("looks like Base64")) && !bn.some((m) => m.text.includes("looks like hex")));
});

t("V3: a format slip on verification gets a hint, not just 'invalid'", async () => {
  const f = F3.hmac_HS256;
  const v = await verifyToken(f.token, { kind: "secret", text: f.secret_b64, format: "text" }, NOW);
  assert.ok(v.ok && !v.signatureValid && v.notes.some((n) => n.text.includes("switch the format to Base64")));
  const w = await verifyToken(F3.crit_token, { kind: "secret", text: btoa("k".repeat(32)), format: "base64" }, NOW);
  assert.ok(w.ok && w.signatureValid, "Base64 of the same bytes is the same key");
  const x = await verifyToken(F3.crit_token, { kind: "secret", text: "a2tr", format: "base64" }, NOW);
  assert.ok(x.ok && !x.signatureValid && x.notes.some((n) => n.text.includes("switch the format to Text")));
});

t("V3: PEM bundles and foreign key formats (RFC 7468) pick the right block or name the fix", async () => {
  const bundle = pemToDer(F3.ecparam_bundle, "private");
  assert.ok(!bundle.ok && bundle.error.includes("SEC 1"), JSON.stringify(bundle));
  const certKey = pemToDer(F3.cert_then_key, "private");
  assert.ok(certKey.ok && certKey.label === "PRIVATE KEY");
  const certOnly = pemToDer(F3.cert_then_key, "public");
  assert.ok(!certOnly.ok && certOnly.error.includes("openssl x509"));
  const pkcs1 = pemToDer(F3.rs256.pkcs1_pem, "private");
  assert.ok(!pkcs1.ok && pkcs1.error.includes("openssl pkcs8 -topk8"));
  const sec1 = pemToDer(F3.es256.sec1_pem, "private");
  assert.ok(!sec1.ok && sec1.error.includes("SEC 1"));
  const p384 = await importPrivateKey(algInfo("ES256"), F3.p384_private_pem);
  assert.ok(!p384.ok && p384.error.includes("ES384"));
  const ed = await importPublicKey(algInfo("RS256"), F3.ed25519_public_pem);
  assert.ok(!ed.ok && ed.error.includes("Ed25519"));
  // CRLF line endings and text around the block are tolerated.
  const crlf = `Bag Attributes\r\n${F3.es256.public_pem.replace(/\n/g, "\r\n")}trailing words`;
  const v = await verifyToken(F3.es256.token, { kind: "pem", text: crlf }, NOW);
  assert.ok(v.ok && v.accepted);
  const odd = pemToDer("-----BEGIN X509 CRL-----\nMAA=\n-----END X509 CRL-----", "public");
  assert.ok(!odd.ok && odd.error === "This block is labeled X509 CRL, and a PUBLIC KEY block is needed.");
});

t("V3: NumericDate extremes never print NaN and only call milliseconds what could be milliseconds", () => {
  const texts = (exp: number) => checkClaims({ exp }, NOW, "verify").notes.map((n) => n.text).join(" ");
  assert.match(texts(1793448000000), /year 58802.*2026-10-31 12:00:00 UTC if divided by 1000/); // 1970 + 1793448000000 / 31556952
  assert.match(texts(9e12), /past the last date JavaScript can represent.*if divided by 1000/);
  assert.match(texts(1e300), /far beyond any real date/);
  for (const v of [1e11 + 1, 8.64e12, 8.64e12 + 1, 1e14, 1e14 - 1, Number.MAX_VALUE, -Number.MAX_VALUE, -1, 0, 0.5]) {
    const out = texts(v);
    assert.ok(!out.includes("NaN") && !out.includes("undefined"), `${v}: ${out}`);
  }
  // exp == now is expired, now + 1 is not (RFC 7519 4.1.4).
  assert.equal(checkClaims({ exp: NOW }, NOW, "verify").blocking, "the token has expired");
  assert.equal(checkClaims({ exp: NOW + 1 }, NOW, "verify").blocking, null);
});

t("V3: unsupported algorithms are reported as not checked, near misses as rejected", async () => {
  const hdr = (alg: string) => base64urlEncode(utf8Bytes(JSON.stringify({ alg })));
  const key = { kind: "secret" as const, text: "k".repeat(32), format: "text" as const };
  const ps = await verifyToken(`${hdr("PS256")}.e30.AAAA`, key, NOW);
  assert.ok(ps.ok && !ps.checked && !ps.accepted && ps.verdict.startsWith("Not checked"));
  const lower = await verifyToken(`${hdr("hs256")}.e30.AAAA`, key, NOW);
  assert.ok(lower.ok && lower.checked && !lower.accepted && lower.verdict.includes("case-sensitive"));
  const none = await verifyToken(`${hdr("nOnE")}.e30.`, key, NOW);
  assert.ok(none.ok && none.checked && !none.accepted);
});

/* ---------------- V4: independent verifier cases */
const A1_TOKEN = `${A1_HEADER}.${A_PAYLOAD}.${A1_SIG}`;
const A1_SECRET = { kind: "secret" as const, text: A1_KEY, format: "base64" as const };
const hsTok = (headerJson: string, payloadText: string, keyBytes: Uint8Array, hash = "sha256") => {
  const h = base64urlEncode(utf8Bytes(headerJson));
  const p = base64urlEncode(utf8Bytes(payloadText));
  const s = createHmac(hash, Buffer.from(keyBytes)).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
};

t("V4: RFC 7515 A.1 with one payload character changed, or the signature truncated, is invalid", async () => {
  const flipped = `${A1_HEADER}.${A_PAYLOAD.slice(0, 10)}${A_PAYLOAD[10] === "A" ? "B" : "A"}${A_PAYLOAD.slice(11)}.${A1_SIG}`;
  const r1 = await verifyToken(flipped, A1_SECRET, 1300819000);
  assert.ok(r1.ok && r1.checked && !r1.signatureValid && !r1.accepted);
  const r2 = await verifyToken(`${A1_HEADER}.${A_PAYLOAD}.${A1_SIG.slice(0, -4)}`, A1_SECRET, 1300819000);
  assert.ok(r2.ok && !r2.signatureValid);
  assert.ok(r2.notes.some((n) => /produces exactly 32/.test(n.text)));
  const r3 = await verifyToken(`${A1_HEADER}.${A_PAYLOAD}.`, A1_SECRET, 1300819000);
  assert.ok(r3.ok && !r3.signatureValid);
});

t("V4: RFC 7515 A.1 accepted one second before exp (1300819380), rejected at exp; Bearer prefix and surrounding whitespace allowed", async () => {
  const before = await verifyToken(`  Bearer ${A1_TOKEN}\n`, A1_SECRET, 1300819379);
  assert.ok(before.ok && before.signatureValid && before.accepted, JSON.stringify(before));
  const at = await verifyToken(A1_TOKEN, A1_SECRET, 1300819380);
  assert.ok(at.ok && at.signatureValid && !at.accepted);
  // A line break inside the token is not base64url.
  const broken = await verifyToken(`${A1_TOKEN.slice(0, 20)}\n${A1_TOKEN.slice(20)}`, A1_SECRET, 1300819379);
  assert.ok(!broken.ok && /whitespace/.test(broken.error));
});

t("V4: empty JWS payload (RFC 7515 allows it) verifies, but is not a claims set", async () => {
  const key = new Uint8Array(32).fill(7);
  const tok = hsTok('{"alg":"HS256"}', "", key);
  assert.equal(tok.split(".")[1], "");
  const r = await verifyToken(tok, { kind: "secret", text: Buffer.from(key).toString("base64"), format: "base64" }, NOW);
  assert.ok(r.ok && r.signatureValid && r.accepted);
  assert.ok(r.notes.some((n) => /not a JSON object/.test(n.text)));
});

t("V4: HS512 secret boundary 63 vs 64 bytes (RFC 7518 3.2) and HS512 matches node:crypto with a non-ASCII payload", async () => {
  const hs512 = algInfo("HS512");
  assert.ok(secretNotes("x", "base64", new Uint8Array(63), hs512).some((n) => n.tone === "danger" && /at least 64 bytes/.test(n.text)));
  assert.ok(!secretNotes("x", "base64", new Uint8Array(64), hs512).some((n) => /at least 64/.test(n.text)));
  const keyBytes = new Uint8Array(64).map((_, i) => (i * 37 + 11) & 0xff);
  const b64 = Buffer.from(keyBytes).toString("base64");
  const built = await buildToken({
    alg: "HS512",
    headerText: '{"alg":"HS512","typ":"JWT"}',
    payloadText: '{"name":"Zoë 日本 \u{1F600}","exp":9999999999}',
    key: { kind: "secret", text: b64, format: "base64" },
  });
  assert.ok(built.ok);
  const expected = hsTok('{"alg":"HS512","typ":"JWT"}', '{"name":"Zoë 日本 \u{1F600}","exp":9999999999}', keyBytes, "sha512");
  assert.equal(built.token, expected);
  assert.equal(built.signatureBytes, 64);
});

t("V4: adversarial inputs never throw (lone surrogate, NUL, unicode token, oversize, empty secret, = only)", async () => {
  const lone = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: '{"x":"\\ud800"}', key: { kind: "secret", text: "k".repeat(32), format: "text" } });
  assert.ok(lone.ok);
  const nul = await buildToken({ alg: "HS256", headerText: '{"alg":"HS256"}', payloadText: '{"x":"\\u0000"}', key: { kind: "secret", text: "k".repeat(32), format: "text" } });
  assert.ok(nul.ok);
  const uni = await verifyToken("ëyJ.e30.abc", A1_SECRET, NOW);
  assert.ok(!uni.ok && /character 1/.test(uni.error));
  const big = await verifyToken("a".repeat(MAX_TOKEN_CHARS + 1), A1_SECRET, NOW);
  assert.ok(!big.ok && /65,536/.test(big.error));
  const emptySecret = await verifyToken(A1_TOKEN, { kind: "secret", text: "", format: "text" }, NOW);
  assert.ok(!emptySecret.ok && /Enter a secret/.test(emptySecret.error));
  const padOnly = parseSecret("==", "base64");
  assert.ok(!padOnly.ok);
  const tooMany = parseSecret("QQ===", "base64");
  assert.ok(!tooMany.ok);
  const emptyHeader = await verifyToken(".e30.", A1_SECRET, NOW);
  assert.ok(!emptyHeader.ok);
  const garbagePem = await buildToken({ alg: "RS256", headerText: '{"alg":"RS256"}', payloadText: "{}", key: { kind: "pem", text: "-----BEGIN PRIVATE KEY-----\nMAA=\n-----END PRIVATE KEY-----" } });
  assert.ok(!garbagePem.ok);
});

t("V4: exp as a numeric string blocks acceptance, iat as a string does not", async () => {
  const key = new Uint8Array(32).fill(1);
  const ks = { kind: "secret" as const, text: Buffer.from(key).toString("base64"), format: "base64" as const };
  const r1 = await verifyToken(hsTok('{"alg":"HS256"}', '{"exp":"9999999999"}', key), ks, NOW);
  assert.ok(r1.ok && r1.signatureValid && !r1.accepted);
  const r2 = await verifyToken(hsTok('{"alg":"HS256"}', '{"iat":"1"}', key), ks, NOW);
  assert.ok(r2.ok && r2.signatureValid && r2.accepted);
});

t("V4: RFC 7515 A.4 (ES512) is reported as not checked rather than rejected", async () => {
  const r = await verifyToken("eyJhbGciOiJFUzUxMiJ9.UGF5bG9hZA.AdwMgeerwtHoh-l192l60hp9wAHZFVJbLfD_UxMi70cwnZOYaRI1bKPWROc-mZZqwqT2SI-KGDKB34XO0aw_7XdtAG8GaSwFKdCAPZgoXD2YBJZCPEX3xKpRwcdOO8KpEHwJjyqOgzDO7iKvU8vcnwNrmxYbSW9ERBXukOXolLzeO_Jn", { kind: "pem", text: "x" }, NOW);
  assert.ok(r.ok && !r.checked && !r.accepted && /ES512/.test(r.verdict));
});

async function main() {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
    } catch (e) {
      console.error("FAIL", name);
      throw e;
    }
  }
  console.log(`jwt-encoder: ${passed} tests passed`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
