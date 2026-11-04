import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  analyzeKeyRecord,
  analyzeSignature,
  crossCheck,
  decodeBase64,
  encodeBase64,
  decodeOid,
  decodePublicKey,
  derInteger,
  extractTxt,
  parseDer,
  parseTagList,
  toZoneStrings,
  keyQueryName,
  decodeQpSection,
  decodeDkimQp,
  checkDnsName,
  type KeyRecord,
  type SignatureInfo,
} from "../../client/src/lib/toolkit/dkim-record-analyzer.ts";

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}
const hex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));
function key(input: string): KeyRecord {
  const r = analyzeKeyRecord(input);
  if (r.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.value;
}
function sig(input: string, now = Date.UTC(2026, 9, 30)): SignatureInfo {
  const r = analyzeSignature(input, now);
  if (r.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r.value;
}
const has = (findings: { tone: string; text: string }[], tone: string, re: RegExp) =>
  findings.some((f) => f.tone === tone && re.test(f.text));

/* ---------------------------------------------------------------- base64 */
t("base64 RFC 4648 section 10 vectors", () => {
  const vectors: [string, string][] = [
    ["", ""],
    ["Zg==", "f"],
    ["Zm8=", "fo"],
    ["Zm9v", "foo"],
    ["Zm9vYg==", "foob"],
    ["Zm9vYmE=", "fooba"],
    ["Zm9vYmFy", "foobar"],
  ];
  for (const [enc, dec] of vectors) {
    const r = decodeBase64(enc);
    assert.ok(r.ok);
    assert.equal(new TextDecoder().decode(r.value.bytes), dec);
    assert.equal(encodeBase64(new TextEncoder().encode(dec)), enc);
  }
});
t("base64 strictness", () => {
  assert.equal(decodeBase64("Zm9v YmFy\r\n\t").ok, true);
  const unpadded = decodeBase64("Zm8");
  assert.ok(unpadded.ok && !unpadded.value.padded && unpadded.value.bytes.length === 2);
  const bad = decodeBase64("Zm9v-mFy");
  assert.ok(!bad.ok && /Base64URL/.test(bad.error));
  const lost = decodeBase64("Zm9vY");
  assert.ok(!lost.ok && /lost/.test(lost.error));
  const mid = decodeBase64("Zm=9v");
  assert.ok(!mid.ok && /inside the data/.test(mid.error));
  assert.equal(decodeBase64("Zm8==").ok, false);
});

/* ------------------------------------------------------------------- DER */
t("OID decoding, X.690 section 8.19", () => {
  const rsa = decodeOid(hex("2a864886f70d010101"));
  assert.ok(rsa.ok && rsa.value === "1.2.840.113549.1.1.1");
  const ed = decodeOid(hex("2b6570"));
  assert.ok(ed.ok && ed.value === "1.3.101.112");
  // X.690 example: 2.999.3 encodes as 88 37 03.
  const big = decodeOid(hex("883703"));
  assert.ok(big.ok && big.value === "2.999.3");
  assert.equal(decodeOid(hex("2a80")).ok, false); // ends mid arc
  assert.equal(decodeOid(hex("2a8001")).ok, false); // 0x80 padding
});
t("INTEGER two's complement", () => {
  assert.equal(derInteger(hex("00ff")), 255n);
  assert.equal(derInteger(hex("ff")), -1n);
  assert.equal(derInteger(hex("80")), -128n);
  assert.equal(derInteger(hex("010001")), 65537n);
});
t("DER length forms", () => {
  // Long form length 0x82 0x01 0x0A = 266.
  const long = new Uint8Array(4 + 266);
  long.set([0x04, 0x82, 0x01, 0x0a]);
  const r = parseDer(long);
  assert.ok(r.ok && r.value.root.length === 266 && r.value.issues.length === 0);
  const indefinite = parseDer(hex("308000000000"));
  assert.ok(!indefinite.ok && /indefinite/.test(indefinite.error));
  const truncated = parseDer(hex("300a0201"));
  assert.ok(!truncated.ok && /claims 10 content bytes/.test(truncated.error));
  const nonMinimal = parseDer(hex("0481050102030405"));
  assert.ok(nonMinimal.ok && nonMinimal.value.issues.some((i) => /long form/.test(i)));
  const trailing = parseDer(hex("05000000"));
  assert.ok(trailing.ok && trailing.value.issues.some((i) => /follow the end/.test(i)));
  assert.equal(parseDer(new Uint8Array(0)).ok, false);
});
t("DER depth cap", () => {
  // 40 nested SEQUENCEs: 30 2*n ... deep. Must fail cleanly rather than recurse forever.
  const depth = 40;
  const bytes: number[] = [];
  for (let i = 0; i < depth; i++) bytes.push(0x30, 2 * (depth - i - 1));
  const r = parseDer(new Uint8Array(bytes));
  assert.ok(!r.ok && /deeper than/.test(r.error));
});
t("RSA keys against node crypto as oracle", () => {
  for (const bits of [512, 1000, 1024, 2048, 3072]) {
    const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: bits });
    const details = publicKey.asymmetricKeyDetails!;
    const spki = new Uint8Array(publicKey.export({ type: "spki", format: "der" }));
    const pkcs1 = new Uint8Array(publicKey.export({ type: "pkcs1", format: "der" }));
    const jwk = publicKey.export({ format: "jwk" }) as { n: string };
    const n = BigInt("0x" + Buffer.from(jwk.n, "base64url").toString("hex"));
    for (const [bytes, enc] of [[spki, "spki"], [pkcs1, "pkcs1"]] as const) {
      const r = decodePublicKey(bytes, "rsa");
      assert.ok(r.ok, `${bits} ${enc}`);
      assert.equal(r.value.bits, details.modulusLength);
      assert.equal(r.value.exponent, details.publicExponent);
      assert.equal(r.value.modulus, n);
      assert.equal(r.value.encoding, enc);
      assert.deepEqual(r.value.issues, []);
    }
  }
});
t("Ed25519 raw key from RFC 8463 appendix A is RFC 8032 test 1", () => {
  const r = key("v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=");
  assert.equal(r.key?.algorithm, "ed25519");
  assert.equal(r.key?.encoding, "raw");
  assert.equal(r.key?.keyHex, "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
  assert.equal(r.verdict.label, "Usable");
});
t("Ed25519 wrapped in SPKI is flagged with the fix", () => {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  const raw = spki.subarray(12).toString("base64");
  const r = key(`v=DKIM1; k=ed25519; p=${spki.toString("base64")}`);
  assert.equal(r.verdict.tone, "danger");
  assert.ok(r.findings.some((f) => f.text.includes(`p=${raw}`)));
});
t("Ed25519 key with k absent defaults to rsa and says so", () => {
  const r = key("v=DKIM1; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=");
  assert.equal(r.verdict.tone, "danger");
  assert.ok(has(r.findings, "danger", /k=ed25519/));
});

/* --------------------------------------------------------------- records */
const { publicKey: pk2048 } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const P2048 = pk2048.export({ type: "spki", format: "der" }).toString("base64");
const { publicKey: pk1024 } = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
const P1024 = pk1024.export({ type: "spki", format: "der" }).toString("base64");
const { publicKey: pk512 } = crypto.generateKeyPairSync("rsa", { modulusLength: 512 });
const P512 = pk512.export({ type: "spki", format: "der" }).toString("base64");

t("tag-list grammar, RFC 6376 section 3.2", () => {
  const a = parseTagList("v=DKIM1; k=rsa; p=abc;");
  assert.deepEqual(a.tags.map((x) => x.name), ["v", "k", "p"]);
  assert.deepEqual(a.problems, []);
  const b = parseTagList("  v = DKIM1 ;\r\n\tp=ab cd ");
  assert.equal(b.tags[0].value, "DKIM1");
  assert.equal(b.tags[1].value, "ab cd");
  const c = parseTagList("v=1;;p=x");
  assert.equal(c.problems.length, 1);
  const d = parseTagList("p=x; p=y");
  assert.deepEqual(d.duplicates, ["p"]);
  const e = parseTagList("v=1; junk; 9x=2");
  assert.equal(e.problems.length, 2);
});
t("2048 bit record is usable", () => {
  const r = key(`v=DKIM1; k=rsa; p=${P2048}`);
  assert.equal(r.key?.bits, 2048);
  assert.equal(r.verdict.label, "Usable");
  assert.ok(has(r.findings, "ok", /2048 bit RSA key/));
});
t("1024 bit record is weak, testing flagged", () => {
  const r = key(`v=DKIM1; k=rsa; t=y; p=${P1024}`);
  assert.equal(r.key?.bits, 1024);
  assert.equal(r.verdict.label, "Weak");
  assert.ok(has(r.findings, "warn", /1024 bit RSA key/));
  assert.ok(has(r.findings, "warn", /t=y/));
  assert.equal(r.testing, true);
});
t("512 bit record is broken", () => {
  const r = key(`p=${P512}`);
  assert.equal(r.key?.bits, 512);
  assert.equal(r.verdict.label, "Unusable");
  assert.ok(has(r.findings, "danger", /must not accept/));
  assert.ok(has(r.findings, "info", /No v= tag/));
});
t("empty p= is revoked", () => {
  const r = key("v=DKIM1; k=rsa; p=");
  assert.equal(r.revoked, true);
  assert.equal(r.verdict.label, "Revoked");
});
t("missing p, bad version, duplicates, v not first, sha1 only, s excludes email", () => {
  assert.equal(key("v=DKIM1; k=rsa").verdict.tone, "danger");
  assert.ok(has(key(`v=DKIM2; p=${P2048}`).findings, "danger", /not DKIM1/));
  assert.ok(has(key(`v=DKIM1; p=${P2048}; p=${P2048}`).findings, "danger", /more than once/));
  assert.ok(has(key(`k=rsa; v=DKIM1; p=${P2048}`).findings, "warn", /not first/));
  assert.ok(has(key(`v=DKIM1; h=sha1; p=${P2048}`).findings, "danger", /only sha1/));
  assert.ok(has(key(`v=DKIM1; h=sha1:sha256; p=${P2048}`).findings, "info", /still lists sha1/));
  assert.ok(has(key(`v=DKIM1; s=tlsrpt; p=${P2048}`).findings, "danger", /neither email/));
  assert.ok(has(key(`v=DKIM1; k=dsa; p=${P2048}`).findings, "danger", /not a key type/));
  assert.ok(has(key(`V=DKIM1; p=${P2048}`).findings, "warn", /case sensitive/));
  assert.ok(has(key(`v=DKIM1; p=${P2048}; g=*`).findings, "info", /RFC 4871/));
});
t("signature pasted into the key box is redirected", () => {
  const r = analyzeKeyRecord("v=1; a=rsa-sha256; d=example.com; s=x; bh=abc=; b=abc=");
  assert.ok(r.kind === "error" && /signature box/.test(r.message));
});
t("quoted TXT strings joined, zone comments skipped, dig output accepted", () => {
  const half = Math.floor(P2048.length / 2);
  const zone = `s1._domainkey IN TXT ( "v=DKIM1; k=rsa; "\n  "p=${P2048.slice(0, half)}"\n  "${P2048.slice(half)}" )  ; ----- DKIM key s1 for example.com`;
  const r = key(zone);
  assert.equal(r.txt.strings?.length, 3);
  assert.equal(r.key?.bits, 2048);
  const dig = `;; ANSWER SECTION:\ns1._domainkey.example.com. 3600 IN TXT "v=DKIM1; k=rsa; p=${P1024}"`;
  assert.equal(key(dig).key?.bits, 1024);
  const escaped = extractTxt('"a\\"b\\059c"');
  assert.ok(escaped.ok && escaped.value.text === 'a"b;c');
  assert.equal(extractTxt('"open').ok, false);
  const unquoted = extractTxt("sel._domainkey.example.com. 300 IN TXT v=DKIM1; p=abc");
  assert.ok(unquoted.ok && unquoted.value.text === "v=DKIM1; p=abc");
});
t("over-long single string is caught; zone splitting round-trips", () => {
  const record = `v=DKIM1; k=rsa; p=${P2048}`;
  const r = key(`"${record}"`);
  assert.ok(has(r.findings, "danger", /at most 255/));
  const zone = toZoneStrings(record);
  const back = extractTxt(zone);
  assert.ok(back.ok && back.value.text === record);
  assert.ok(back.value.strings!.every((s) => s.length <= 255));
  assert.equal(toZoneStrings("short"), '"short"');
});
t("hostile inputs do not throw", () => {
  const junk = [
    "p=" + "A".repeat(19000),
    "p=////",
    "p=MAA=",
    "p=MIA=",
    "v=DKIM1; p=" + encodeBase64(new Uint8Array([0x30, 0x84, 0xff, 0xff, 0xff, 0xff])),
    "=;=;=",
    ";;;;",
    "\u0000\u0001",
    "x".repeat(25000),
  ];
  for (const j of junk) analyzeKeyRecord(j);
  for (const j of junk) analyzeSignature(j, 0);
});
t("long whitespace runs stay linear", () => {
  for (const input of ["v" + " ".repeat(19000) + "x", "p=" + " ".repeat(19000) + "x", "( " + " ".repeat(19000) + "p=)"]) {
    const start = Date.now();
    analyzeKeyRecord(input);
    analyzeSignature(input, 0);
    assert.ok(Date.now() - start < 300, JSON.stringify(input.slice(0, 10)));
  }
  const parens = extractTxt("sel._domainkey IN TXT ( v=DKIM1; p= )");
  assert.ok(parens.ok && parens.value.text === "v=DKIM1; p=");
});
t("qp decoders", () => {
  assert.equal(decodeQpSection("Rotated=20in 2026=2E"), "Rotated in 2026.");
  assert.equal(decodeDkimQp("Subject:Hello=20 there"), "Subject:Hello there");
});

/* ------------------------------------------------------------- signature */
const RFC6376_A2 = `DKIM-Signature: v=1; a=rsa-sha256; s=brisbane; d=example.com;
      c=simple/simple; q=dns/txt; i=joe@football.example.com;
      h=Received : From : To : Subject : Date : Message-ID;
      bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;
      b=AuUoFEfDxTDkHlLXSZEpZj79LICEps6eda7W3deTVFOk4yAUoqOB
        4nujc7YopdG5dWLSdNg6xNAZpOPr+kHxt1IrE+NahM6L/LbvaHut
        KVdkLLkpVaVVQPzeRDI009SO2Il5Lu7rDNH6mZckBdrIx0orEtZV
        4bmp/YzhwvcubU4=;`;
t("RFC 6376 appendix A.2 style signature", () => {
  // bh is SHA-256 of the appendix A body under simple canonicalization.
  const body = "Hi.\r\n\r\nWe lost the game. Are you hungry yet?\r\n\r\nJoe.\r\n";
  assert.equal(crypto.createHash("sha256").update(body).digest("base64"), "2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=");
  const s = sig(RFC6376_A2);
  assert.equal(s.dnsName, "brisbane._domainkey.example.com");
  assert.equal(s.domain, "example.com");
  assert.equal(s.auidDomain, "football.example.com");
  assert.deepEqual(s.signedHeaders, ["Received", "From", "To", "Subject", "Date", "Message-ID"]);
  assert.equal(s.canonHeader, "simple");
  assert.equal(s.canonBody, "simple");
  assert.equal(s.bodyHashBytes, 32);
  assert.equal(s.signatureBytes, 128);
  assert.ok(has(s.findings, "warn", /1024 bit key/));
  assert.ok(has(s.findings, "info", /received/));
  assert.ok(!s.findings.some((f) => /subdomain of it/.test(f.text)));
});
t("RFC 8463 style ed25519 signature with spaced h=", () => {
  const s = sig(
    "v=1; a=ed25519-sha256; c=relaxed/relaxed; d=football.example.com; i=@football.example.com; q=dns/txt; s=brisbane; t=1528637909; h=from : to : subject : date : message-id : from : subject : date; bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=; b=/gCrinpcQOoIfuHNQIbq4pgh9kyIK3AQUdt9OdqQehSwhEIug4D11BusFa3bT3FY5OsU7ZbnKELq+eXdp1Q1Dw==",
  );
  assert.equal(s.keyAlgorithm, "ed25519");
  assert.equal(s.signatureBytes, 64);
  assert.equal(s.dnsName, "brisbane._domainkey.football.example.com");
  assert.equal(s.signedHeaders.length, 8);
  assert.ok(has(s.findings, "ok", /listed 2 times/));
});
t("broken signature collects every problem", () => {
  const s = sig(
    "v=1; a=rsa-sha1; c=simple; d=example.net; s=old; i=@evil.example; h=to:subject; l=120; t=1700000000; x=1690000000; bh=" +
      encodeBase64(new Uint8Array(20)) +
      "; b=" +
      encodeBase64(new Uint8Array(128)),
  );
  assert.ok(has(s.findings, "danger", /rsa-sha1/));
  assert.ok(has(s.findings, "danger", /does not include From/));
  assert.ok(has(s.findings, "danger", /neither example.net/));
  assert.ok(has(s.findings, "warn", /l=120/));
  assert.ok(has(s.findings, "danger", /x= is not later/));
  assert.ok(has(s.findings, "warn", /expired/));
  assert.equal(s.canonHeader, "simple");
  assert.equal(s.canonBody, "simple");
  const missing = sig("v=1; a=rsa-sha256; d=example.com");
  assert.ok(has(missing.findings, "danger", /b=, bh=, h=, s=/));
});
t("c=relaxed alone means relaxed/simple", () => {
  const s = sig("v=1; a=rsa-sha256; c=relaxed; d=e.com; s=a; h=from; bh=x; b=x");
  assert.equal(s.canonHeader, "relaxed");
  assert.equal(s.canonBody, "simple");
});
t("key name and DNS name checks", () => {
  assert.equal(keyQueryName("Sel.Sub", "Example.COM."), "sel.sub._domainkey.example.com");
  assert.equal(checkDnsName("a".repeat(64) + ".com").ok, false);
  assert.equal(checkDnsName("ex..com").ok, false);
  assert.equal(checkDnsName("_dmarc.example.com", true).ok, true);
});

/* ------------------------------------------------------- the real example */
t("generated example: key and signature agree", () => {
  const P = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlqjYkvom4uwD7lpHN+9jE0tQW/fCfwb5fXVREkC7ZHG4FWanUohljsCiJbJ0tjxkHVO5JdVBrrf3C4QIx5TJOyQ80ZUf0MKRsf63bidQEJByHMocCxSrGEVkUfj/G+r+9jal1B8TGJTnli5ByCurD/lWx79B/2L5hYLH/jZNGPsd615euBpIPQaNnhGOVKv2QS1C9huJvroY1Df97AzlEHa1fjf/PLSJWFN9/ZZ6gNRRTWheismOEm7e/XAbFASgilfvAqCzHnfoth+NEkU+GBnlFkj7sHziUw6TZo6PA9T70IUuwh4rZuyBJhW/EpUH6mHLFfP96j9Ajp2fFeBeMQIDAQAB";
  const k = key(`v=DKIM1; k=rsa; p=${P}`);
  const s = sig(
    "v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=s2026; t=1791908043; h=from:to:subject:date:message-id:from; bh=SoxCEfhuTtVzZJ1GLYaoau2VLtGWqggh/mlmLvF2LRc=; b=N8KqlcKdbMRosuDErJnhP3GglQSW6VBART89quJcTmlzXrquIoCiEAKlBXcqwNbvk327J+AQvgZsOIzWHjFvgzSOk92h+uqS0Pn8NCkXHwHjSHGYccZ0cXt01mnp0OExnRcBvmV8JcOLl3n0d4XRg+wyE+hUniBfaty9muX4jnyx8KbobwgmhOvn25vPFWWpL07qSEladUAqilBPmhlZzl6RuniNZbnm44VJRJgHnzVtSlCPjKf1T9OAC4zQXVVK9YsxB+3gnWGWINI2Lw9JeoVblleNjy10zNZpyJuOytcpGH1/GCjH4uBxH6IvMdpGgBKgOuZ/cP86u5Cb9BC2tQ==",
  );
  const c = crossCheck(k, s);
  assert.ok(has(c, "ok", /could have made it/));
  const k1024 = key(`v=DKIM1; p=${P1024}`);
  assert.ok(has(crossCheck(k1024, s), "danger", /not made with this key/));
  assert.ok(has(crossCheck(key("v=DKIM1; p="), s), "danger", /revoked/));
  assert.ok(has(crossCheck(key("v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="), s), "danger", /k=ed25519/));
});

console.log(`dkim-record-analyzer: ${passed} tests passed`);

import { EXAMPLE_KEY_RECORDS, EXAMPLE_SIGNATURES } from "../../client/src/lib/toolkit/dkim-record-analyzer.ts";
t("shipped examples behave as labeled", () => {
  const labels = EXAMPLE_KEY_RECORDS.map((e) => key(e.text).verdict.label);
  assert.deepEqual(labels, ["Usable", "Weak", "Unusable", "Usable", "Revoked"]);
  const k2048 = key(EXAMPLE_KEY_RECORDS[0].text);
  assert.equal(k2048.txt.strings?.length, 2);
  assert.equal(k2048.key?.bits, 2048);
  const good = sig(EXAMPLE_SIGNATURES[0].text);
  assert.equal(good.dnsName, "s2026._domainkey.example.com");
  assert.equal(good.signatureBytes, 256);
  assert.ok(!good.findings.some((f) => f.tone === "danger" || f.tone === "warn"), JSON.stringify(good.findings));
  assert.ok(has(crossCheck(k2048, good), "ok", /could have made it/));
  const bad = sig(EXAMPLE_SIGNATURES[1].text);
  assert.ok(has(bad.findings, "danger", /rsa-sha1/));
  assert.ok(has(bad.findings, "danger", /mail.example.org is neither example.net/));
  assert.equal(bad.bodyHashBytes, 20);
  assert.equal(bad.signatureBytes, 128);
  console.log(`dkim-record-analyzer examples: ok (${passed} total)`);
});

/* ===================== independent verification (second agent) ===================== */
{
  const nodeModulus = (spkiB64: string) => {
    const k = crypto.createPublicKey({ key: Buffer.from(spkiB64, "base64"), format: "der", type: "spki" });
    const jwk = k.export({ format: "jwk" }) as { n: string; e: string };
    return { n: BigInt("0x" + Buffer.from(jwk.n, "base64url").toString("hex")), e: BigInt("0x" + Buffer.from(jwk.e, "base64url").toString("hex")) };
  };

  t("V1 RFC 6376 appendix C key: 1024 bit SPKI, modulus matches node", () => {
    const p = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDwIRP/UC3SBsEmGqZ9ZJW3/DkMoGeLnQg1fWn7/zYtIxN2SnFCjxOCKG9v3b4jYfcTNh5ijSsq631uBItLa7od+v/RtdC2UzJ1lWT947qR+Rcac2gbto/NMqJ0fzfVjH4OuKhitdY9tf6mcwGjaNBcWToIMmPSPDdQPNUYckcQ2QIDAQAB";
    const k = key(`brisbane._domainkey IN TXT ("v=DKIM1; p=${p.slice(0, 100)}" "${p.slice(100)}")`);
    assert.equal(k.key?.bits, 1024);
    assert.equal(k.key?.encoding, "spki");
    assert.equal(k.key?.oid, "1.2.840.113549.1.1.1");
    const oracle = nodeModulus(p);
    assert.equal(k.key?.modulus, oracle.n);
    assert.equal(k.key?.exponent, 65537n);
    assert.equal(k.verdict.label, "Weak");
    assert.equal(k.keyTypeStated, false);
    assert.equal(k.keyType, "rsa");
  });

  t("V2 RFC 8463 appendix A.2 RSA key for test._domainkey.football.example.com", () => {
    const p = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB";
    const k = key(`v=DKIM1; k=rsa; p=${p}`);
    assert.equal(k.key?.bits, 1024);
    assert.equal(k.key?.modulus, nodeModulus(p).n);
    const ed = key("v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=");
    assert.equal(ed.key?.keyHex, "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
    assert.equal(ed.verdict.label, "Usable");
  });

  t("V3 boundary key sizes from node keygen, SPKI and bare RSAPublicKey", () => {
    const expect: [number, number, string, string][] = [
      [1023, 65537, "Unusable", "danger"],
      [1024, 65537, "Weak", "warn"],
      [1025, 65537, "Weak", "warn"],
      [2047, 3, "Weak", "warn"],
      [2048, 65537, "Usable", "ok"],
      [4096, 65537, "Usable", "ok"],
      [4104, 65537, "Usable", "warn"],
    ];
    for (const [bits, e, verdict, tone] of expect) {
      const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: bits, publicExponent: e });
      const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
      const pkcs1 = publicKey.export({ type: "pkcs1", format: "der" }).toString("base64");
      const a = key(`v=DKIM1; k=rsa; p=${spki}`);
      assert.equal(a.key?.bits, bits, `bits ${bits}`);
      assert.equal(a.key?.modulus, nodeModulus(spki).n);
      assert.equal(a.key?.exponent, BigInt(e));
      assert.equal(a.verdict.label, verdict, `verdict ${bits}`);
      assert.ok(a.findings.some((f) => f.tone === tone && new RegExp(`A ${bits} bit RSA key`).test(f.text)), `tone ${bits}`);
      assert.ok(!has(a.findings, "warn", /bare RSAPublicKey/));
      const b = key(`v=DKIM1; k=rsa; p=${pkcs1}`);
      assert.equal(b.key?.encoding, "pkcs1");
      assert.equal(b.key?.bits, bits);
      assert.ok(has(b.findings, "warn", /bare RSAPublicKey/));
      if (e === 3) assert.ok(has(a.findings, "info", /exponent is 3/));
    }
  });

  t("V4 DER strictness per X.690", () => {
    // Constructed INTEGER (0x22) and primitive SEQUENCE (0x10) are not DER.
    const constructedInt = parseDer(hex("3006220402020101"));
    assert.equal(constructedInt.ok, false);
    assert.ok(!constructedInt.ok && /constructed form/.test(constructedInt.error));
    const primitiveSeq = parseDer(hex("1003020101"));
    assert.equal(primitiveSeq.ok, false);
    // Long form length for a value under 128 is accepted with an issue.
    const longForm = parseDer(hex("308103020101"));
    assert.ok(longForm.ok && longForm.value.issues.some((i) => /long form/.test(i)));
    // Trailing bytes after the outer element.
    const trailing = parseDer(hex("3003020101ff"));
    assert.ok(trailing.ok && trailing.value.issues.some((i) => /1 bytes follow/.test(i)));
    // Indefinite length is BER only.
    assert.equal(parseDer(hex("30800201010000")).ok, false);
    // OID arcs: 2.999.3 and 1.2.840.113549 (X.690 section 8.19.5 example and RSA arc).
    assert.deepEqual(decodeOid(hex("883703")), { ok: true, value: "2.999.3" });
    assert.deepEqual(decodeOid(hex("2a864886f70d")), { ok: true, value: "1.2.840.113549" });
    // INTEGER encodings from X.690 section 8.3: 0x80 is -128, 0x0080 is 128, 0xff7f is -129.
    assert.equal(derInteger(hex("80")), -128n);
    assert.equal(derInteger(hex("0080")), 128n);
    assert.equal(derInteger(hex("ff7f")), -129n);
    // A key whose BIT STRING is constructed is refused, not misread.
    const bad = key("v=DKIM1; p=" + Buffer.from(hex("300d300b06092a864886f70d0101012300")).toString("base64"));
    assert.equal(bad.verdict.label, "Unusable");
  });

  t("V5 RFC 8463 appendix A.3 signatures: lengths, DNS names, spaced h=", () => {
    const ed = sig(`DKIM-Signature: v=1; a=ed25519-sha256; c=relaxed/relaxed;
 d=football.example.com; i=@football.example.com;
 q=dns/txt; s=brisbane; t=1528637909; h=from : to :
 subject : date : message-id : from : subject : date;
 bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;
 b=/gCrinpcQOoIfuHNQIbq4pgh9kyIK3AQUdt9OdqQehSwhEIug4D11BusFa3bT3FY5OsU7ZbnKELq+eXdp1Q1Dw==`);
    assert.equal(ed.dnsName, "brisbane._domainkey.football.example.com");
    assert.equal(ed.keyAlgorithm, "ed25519");
    assert.equal(ed.signatureBytes, 64);
    assert.equal(ed.bodyHashBytes, 32);
    assert.deepEqual(ed.signedHeaders, ["from", "to", "subject", "date", "message-id", "from", "subject", "date"]);
    assert.equal(ed.timestamp, 1528637909);
    assert.equal(ed.auidDomain, "football.example.com");
    assert.ok(!ed.findings.some((f) => f.tone === "danger"));
    const rsa = sig(`DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
 d=football.example.com; i=@football.example.com;
 q=dns/txt; s=test; t=1528637909; h=from : to : subject :
 date : message-id : from : subject : date;
 bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;
 b=F45dVWDfMbQDGHJFlXUNB2HKfbCeLRyhDXgFpEL8GwpsRe0IeIixNTe3
 DhCVlUrSjV4BwcVcOF6+FF3Zo9Rpo1tFOeS9mPYQTnGdaSGsgeefOsk2Jz
 dA+L10TeYt9BgDfQNZtKdN1WO//KgIqXP7OdEFE4LjFYNcUxZQ4FADY+8=`);
    assert.equal(rsa.dnsName, "test._domainkey.football.example.com");
    assert.equal(rsa.signatureBytes, 128);
    assert.ok(has(rsa.findings, "warn", /128 bytes means a 1024 bit key/));
    // Pair the 1024 bit RFC 8463 key with this signature: lengths agree.
    const k1024 = key("v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB");
    assert.ok(has(crossCheck(k1024, rsa), "ok", /128 bytes and the key's modulus is 128/));
    // The ed25519 key against the RSA signature is refused.
    const kEd = key("v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=");
    assert.ok(has(crossCheck(kEd, rsa), "danger", /k=ed25519/));
  });

  t("V6 tag boundaries from the RFC 6376 section 3.5 ABNF", () => {
    const base = "v=1; a=rsa-sha256; d=example.com; s=sel; h=from:to:subject:date; bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=; b=" + Buffer.alloc(256, 7).toString("base64");
    assert.equal(sig(`${base}; t=999999999999`).timestamp, 999999999999);
    assert.ok(has(sig(`${base}; t=1000000000000`).findings, "danger", /1 to 12 decimal digits/));
    assert.equal(sig(`${base}; l=${"1".repeat(76)}`).bodyLength !== null, true);
    assert.ok(has(sig(`${base}; l=${"1".repeat(77)}`).findings, "danger", /decimal byte count/));
    assert.ok(has(sig(`${base}; t=100; x=100`).findings, "danger", /x= is not later than t=/));
    assert.ok(!sig(`${base}; t=100; x=101`).findings.some((f) => /x= is not later/.test(f.text)));
    // c=relaxed means relaxed/simple; c=simple/relaxed is valid; three parts are not.
    const c1 = sig(`${base}; c=relaxed`);
    assert.equal(`${c1.canonHeader}/${c1.canonBody}`, "relaxed/simple");
    const c2 = sig(`${base}; c=simple/relaxed`);
    assert.equal(`${c2.canonHeader}/${c2.canonBody}`, "simple/relaxed");
    assert.equal(sig(`${base}; c=relaxed/relaxed/relaxed`).canonHeader, null);
    // i= must be d= or a subdomain; a shared suffix is not enough.
    assert.ok(!has(sig(`${base}; i=joe@mail.example.com`).findings, "danger", /i= domain/));
    assert.ok(has(sig(`${base}; i=@badexample.com`).findings, "danger", /i= domain badexample.com/));
    assert.ok(has(sig(`${base}; i=@example.com; d=mail.example.com`.replace("d=example.com; ", "")).findings, "danger", /i= domain example.com/));
    // One unsigned recommended field reads in the singular.
    assert.ok(has(sig(base.replace("h=from:to:subject:date", "h=from:to:subject")).findings, "info", /Not signed: date\. .*covering it when present/));
  });

  t("V7 cross-check t=s only fires for a real subdomain", () => {
    const strictKey = key("v=DKIM1; t=s; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB");
    const base = "v=1; a=rsa-sha256; d=example.com; s=sel; h=from; bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=; b=" + Buffer.alloc(128, 7).toString("base64");
    assert.ok(has(crossCheck(strictKey, sig(`${base}; i=@mail.example.com`)), "danger", /t=s forbids/));
    assert.ok(!crossCheck(strictKey, sig(`${base}; i=@example.com`)).some((f) => /t=s/.test(f.text)));
    assert.ok(!crossCheck(strictKey, sig(`${base}; i=@other.org`)).some((f) => /t=s/.test(f.text)));
    // RFC 6376 section 3.6.2.1: s=foo.bar, d=example.com queries foo.bar._domainkey.example.com.
    assert.equal(keyQueryName("foo.bar", "example.com"), "foo.bar._domainkey.example.com");
  });

  t("V8 TXT presentation format escapes and malformed base64", () => {
    // RFC 1035 section 5.1: \059 is ";" and \" is a quote.
    const r = extractTxt('"v=DKIM1\\059 n=say \\"hi\\"\\059 p="');
    assert.ok(r.ok && r.value.text === 'v=DKIM1; n=say "hi"; p=');
    assert.equal(decodeBase64("Zg=").ok, false);
    assert.equal(decodeBase64("Zm9v=").ok, false);
    assert.equal(decodeBase64("Zm9vY").ok, false);
    const ws = decodeBase64(" Zm 9v\r\n Ym Fy ");
    assert.ok(ws.ok && Buffer.from(ws.value.bytes).toString() === "foobar");
    const noPad = decodeBase64("Zm9vYg");
    assert.ok(noPad.ok && noPad.value.padded === false && Buffer.from(noPad.value.bytes).toString() === "foob");
  });

  t("V9 adversarial inputs never throw", () => {
    const inputs = [
      "", " ", "\u0000", "=;=;=", "p=" + "=".repeat(5000), "v=DKIM1; p=" + "\u{1F600}".repeat(3000),
      '"' + "\\".repeat(10000) + '"', "TXT ".repeat(4000), "(".repeat(19000), "p=" + "A".repeat(19998),
      "a".repeat(20001), "v=DKIM1; k=ed25519; p=" + Buffer.alloc(31).toString("base64"),
      "v=DKIM1; p=" + Buffer.from(hex("3082ffff")).toString("base64"),
    ];
    for (const input of inputs) {
      analyzeKeyRecord(input);
      analyzeSignature(input, Date.now());
      analyzeSignature(input, Number.NaN);
    }
  });
  console.log(`dkim-record-analyzer independent verification: ok (${passed} total)`);
}

/* ===================== third verifier: additional reference cases ===================== */
import * as V3 from "../../client/src/lib/toolkit/dkim-record-analyzer.ts";
import * as v3crypto from "node:crypto";
{
  let n3 = 0;
  const c3 = (name: string, fn: () => void) => {
    try { fn(); n3++; } catch (e) { console.error(`FAIL v3 ${name}`); throw e; }
  };
  const okv = <T,>(o: V3.Outcome<T>): T => { if (o.kind !== "ok") throw new Error(`not ok: ${JSON.stringify(o)}`); return o.value; };
  const spkiB64 = (bits: number) => v3crypto.generateKeyPairSync("rsa", { modulusLength: bits }).publicKey.export({ type: "spki", format: "der" }).toString("base64");

  c3("RFC 6376 appendix C example key is 1024 bit RSA, e=65537, weak", () => {
    const p = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDwIRP/UC3SBsEmGqZ9ZJW3/DkMoGeLnQg1fWn7/zYtIxN2SnFCjxOCKG9v3b4jYfcTNh5ijSsq631uBItLa7od+v/RtdC2UzJ1lWT947qR+Rcac2gbto/NMqJ0fzfVjH4OuKhitdY9tf6mcwGjaNBcWToIMmPSPDdQPNUYckcQ2QIDAQAB";
    const r = okv(V3.analyzeKeyRecord(`v=DKIM1; p=${p}`));
    const jwk = v3crypto.createPublicKey({ key: Buffer.from(p, "base64"), format: "der", type: "spki" }).export({ format: "jwk" }) as { n: string };
    assert.equal(r.key?.modulus, BigInt("0x" + Buffer.from(jwk.n, "base64url").toString("hex")));
    assert.equal(r.key?.bits, 1024);
    assert.equal(r.key?.exponent, 65537n);
    assert.equal(r.verdict.label, "Weak");
  });

  c3("RSA size boundaries 1023 / 1024 / 2047 / 2048 / 4097", () => {
    const want: [number, string][] = [[1023, "Unusable"], [1024, "Weak"], [2047, "Weak"], [2048, "Usable"], [4097, "Usable"]];
    for (const [bits, label] of want) {
      let b64 = spkiB64(bits);
      const oracleBits = (x: string) => { const jwk = v3crypto.createPublicKey({ key: Buffer.from(x, "base64"), format: "der", type: "spki" }).export({ format: "jwk" }) as { n: string }; return BigInt("0x" + Buffer.from(jwk.n, "base64url").toString("hex")).toString(2).length; };
      // OpenSSL sometimes returns one bit fewer for odd sizes; regenerate until the oracle agrees.
      for (let tries = 0; tries < 20 && oracleBits(b64) !== bits; tries++) b64 = spkiB64(bits);
      const r = okv(V3.analyzeKeyRecord(`v=DKIM1; k=rsa; p=${b64}`));
      assert.equal(r.key?.bits, oracleBits(b64), `bits ${bits}`);
      if (oracleBits(b64) !== bits) continue;
      assert.equal(r.verdict.label, label, `verdict ${bits}`);
      if (bits === 4097) assert.ok(r.findings.some((f) => f.tone === "warn" && /4096/.test(f.text)));
    }
  });

  c3("Ed25519 SPKI from node is flagged and the bare key offered", () => {
    const pub = v3crypto.generateKeyPairSync("ed25519").publicKey;
    const der = pub.export({ type: "spki", format: "der" });
    const raw = der.subarray(der.length - 32).toString("base64");
    const r = okv(V3.analyzeKeyRecord(`v=DKIM1; k=ed25519; p=${der.toString("base64")}`));
    assert.equal(r.verdict.label, "Unusable");
    assert.ok(r.findings.some((f) => f.tone === "danger" && f.text.includes(`p=${raw}`)));
    const bare = okv(V3.analyzeKeyRecord(`v=DKIM1; k=ed25519; p=${raw}`));
    assert.equal(bare.verdict.label, "Usable");
    assert.equal(bare.key?.keyHex, Buffer.from(raw, "base64").toString("hex"));
    // Raw 32 bytes without k=ed25519: k defaults to rsa, so it must not be called usable.
    const noK = okv(V3.analyzeKeyRecord(`v=DKIM1; p=${raw}`));
    assert.equal(noK.verdict.label, "Unusable");
  });

  c3("OID decoding (X.690 8.19)", () => {
    const h = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
    assert.deepEqual(V3.decodeOid(h("2a864886f70d010101")), { ok: true, value: "1.2.840.113549.1.1.1" });
    assert.deepEqual(V3.decodeOid(h("2b6570")), { ok: true, value: "1.3.101.112" });
    assert.deepEqual(V3.decodeOid(h("8837")), { ok: true, value: "2.999" });
    assert.equal(V3.decodeOid(h("2a86")).ok, false);
    assert.equal(V3.decodeOid(h("2a8001")).ok, false);
  });

  c3("DER strictness", () => {
    const h = (s: string) => new Uint8Array(Buffer.from(s, "hex"));
    assert.equal(V3.parseDer(h("3080020101 0000".replace(/ /g, ""))).ok, false);
    const longForm = V3.parseDer(h("30 81 03 02 01 05".replace(/ /g, "")));
    assert.ok(longForm.ok && longForm.value.issues.some((i) => /long form/.test(i)));
    assert.equal(V3.parseDer(h("3005020101")).ok, false); // claims 5, has 3
    assert.equal(V3.derInteger(h("00ff")), 255n);
    assert.equal(V3.derInteger(h("ff")), -1n);
    assert.equal(V3.derInteger(h("8000")), -32768n);
    // RSAPublicKey with negative modulus (no 0x00 pad) is refused.
    assert.equal(V3.decodePublicKey(h("3006020181020103"), "rsa").ok, false);
    // Deep nesting stops at the cap instead of recursing forever.
    let deep = "0500";
    for (let i = 0; i < 40; i++) { const len = deep.length / 2; deep = "30" + len.toString(16).padStart(2, "0") + deep; if (len > 120) break; }
    assert.equal(V3.parseDer(h(deep)).ok, false);
  });

  c3("TXT string joining and RFC 1035 escapes", () => {
    const t1 = V3.extractTxt(`"v=DKIM1; p=ab" "cd"`);
    assert.ok(t1.ok && t1.value.text === "v=DKIM1; p=abcd");
    const t2 = V3.extractTxt(`"v=DKIM1\\059 p=" "x\\"y"`);
    assert.ok(t2.ok && t2.value.text === 'v=DKIM1; p=x"y', JSON.stringify(t2));
    assert.equal(V3.extractTxt(`"v=DKIM1\\256"`).ok, false);
    assert.equal(V3.extractTxt(`"unterminated`).ok, false);
    assert.equal(V3.toZoneStrings("a".repeat(300)), `( "${"a".repeat(255)}"\n  "${"a".repeat(45)}" )`);
  });

  c3("RFC 6376 section 3.6.2.1 query name example", () => {
    assert.equal(V3.keyQueryName("brisbane", "example.com"), "brisbane._domainkey.example.com");
    const s = okv(V3.analyzeSignature("DKIM-Signature: v=1; a=rsa-sha256; s=Brisbane; d=Example.COM.;\r\n c=simple/simple; q=dns/txt; i=joe@football.example.com;\r\n h=Received : From : To : Subject : Date : Message-ID;\r\n bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;\r\n b=AuUoFEfDxTDkHlLXSZEpZj79LICEps6eda7W3deTVFOk4yAUoqOB\r\n 4nujc7YopdG5dWLSdNg6xNAZpOPr+kHxt1IrE+NahM6L/LbvaHut\r\n KVdkLLkpVaVVQPzeRDI009SO2Il5Lu7rDNH6mZckBdrIx0orEtZV\r\n 4bmp/YzhwvcubU4=;", Date.UTC(2026, 0, 1)));
    assert.equal(s.dnsName, "brisbane._domainkey.example.com");
    assert.equal(s.domain, "example.com");
    assert.equal(s.auidDomain, "football.example.com");
    assert.equal(s.bodyHashBytes, 32);
    assert.equal(s.signatureBytes, 128);
    assert.deepEqual(s.signedHeaders, ["Received", "From", "To", "Subject", "Date", "Message-ID"]);
    assert.ok(!s.findings.some((f) => /neither .* nor a subdomain/.test(f.text)));
    assert.ok(s.findings.some((f) => /Received/.test(f.text) && /should not be signed/.test(f.text)));
  });

  c3("signature rule checks", () => {
    const base = "v=1; a=rsa-sha256; d=example.com; s=sel; bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=; b=AAAA;";
    const now = Date.UTC(2026, 10, 4);
    const lone = okv(V3.analyzeSignature(base + " h=from; c=relaxed", now));
    assert.equal(lone.canonHeader, "relaxed");
    assert.equal(lone.canonBody, "simple");
    const noFrom = okv(V3.analyzeSignature(base + " h=to:subject", now));
    assert.ok(noFrom.findings.some((f) => f.tone === "danger" && /does not include From/.test(f.text)));
    const badI = okv(V3.analyzeSignature(base + " h=from; i=user@example.org", now));
    assert.ok(badI.findings.some((f) => f.tone === "danger" && /i= domain/.test(f.text)));
    const lookalike = okv(V3.analyzeSignature(base + " h=from; i=user@badexample.com", now));
    assert.ok(lookalike.findings.some((f) => f.tone === "danger" && /i= domain/.test(f.text)));
    const times = okv(V3.analyzeSignature(base + " h=from; t=200; x=100", now));
    assert.ok(times.findings.some((f) => /x= is not later than t=/.test(f.text)));
    assert.ok(times.findings.some((f) => /expired/.test(f.text)));
    const missing = okv(V3.analyzeSignature("v=1; a=rsa-sha256; d=example.com; h=from", now));
    assert.ok(missing.findings.some((f) => f.tone === "danger" && /b=, bh=, s=/.test(f.text)));
    const sha1 = okv(V3.analyzeSignature(base.replace("rsa-sha256", "rsa-sha1") + " h=from", now));
    assert.ok(sha1.findings.some((f) => f.tone === "danger" && /RFC 8301/.test(f.text)));
    assert.ok(sha1.findings.some((f) => /20/.test(f.text) && /bh=/.test(f.text)));
  });

  c3("cross-check catches a signature too short for the key", () => {
    const key = okv(V3.analyzeKeyRecord(`v=DKIM1; p=${spkiB64(2048)}`));
    const sig = okv(V3.analyzeSignature(`v=1; a=rsa-sha256; d=example.com; s=x; h=from; bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=; b=${Buffer.alloc(128, 7).toString("base64")}`, 0));
    assert.ok(V3.crossCheck(key, sig).some((f) => f.tone === "danger" && /256 byte/.test(f.text)));
    const ed = okv(V3.analyzeKeyRecord("v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="));
    assert.ok(V3.crossCheck(ed, sig).some((f) => f.tone === "danger" && /k=ed25519/.test(f.text)));
  });

  c3("malformed and hostile input never throws", () => {
    const inputs = ["", "   ", ";", "=", "p", "p=", "p= = =", "v=DKIM1; p=\u{1F600}", "p=" + "A".repeat(19990), "x".repeat(25000),
      "p=====", "p=A", "p=AA=", "\u0000p=AAAA", '"' + "a".repeat(5000), "v=DKIM1;;;;;; p=MIIB", "k=RSA; p=MA==", "p=MIIBIjAN" + "/".repeat(5000)];
    for (const i of inputs) {
      V3.analyzeKeyRecord(i);
      const s = V3.analyzeSignature(i, Date.now());
      if (s.kind === "ok") for (const k of [V3.analyzeKeyRecord("v=DKIM1; p=")]) if (k.kind === "ok") V3.crossCheck(k.value, s.value);
    }
    for (let n = 0; n < 2000; n++) {
      const len = Math.floor(Math.random() * 64);
      const bytes = new Uint8Array(len).map(() => Math.floor(Math.random() * 256));
      if (Math.random() < 0.5 && len > 2) { bytes[0] = 0x30; bytes[1] = len - 2; }
      V3.decodePublicKey(bytes, Math.random() < 0.5 ? "rsa" : "ed25519");
    }
    assert.equal(V3.analyzeKeyRecord("x".repeat(25000)).kind, "error");
    assert.equal(V3.analyzeKeyRecord("p=MIIB-").kind, "ok");
  });

  console.log(`dkim-record-analyzer third verifier: ${n3} tests passed`);
}

/* ===================== fourth verifier (independent) ===================== */
import * as V4 from "../../client/src/lib/toolkit/dkim-record-analyzer.ts";
{
  let n4 = 0;
  const t4 = (name: string, fn: () => void) => {
    try {
      fn();
      n4++;
    } catch (e) {
      console.error(`FAIL ${name}`);
      throw e;
    }
  };
  const okv4 = <T,>(o: V4.Outcome<T>): T => {
    if (o.kind !== "ok") throw new Error(`not ok: ${JSON.stringify(o)}`);
    return o.value;
  };
  // A DER encoder written for these tests, independent of the library's reader.
  const lenBytes = (n: number) => (n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff]);
  const tlv = (tag: number, body: number[]) => [tag, ...lenBytes(body.length), ...body];
  const intDer = (v: bigint) => {
    let h = v.toString(16);
    if (h.length % 2) h = "0" + h;
    const b = [...Buffer.from(h, "hex")];
    if (b[0] & 0x80) b.unshift(0);
    return tlv(0x02, b);
  };
  const rsaPub = (n: bigint, e: bigint) => tlv(0x30, [...intDer(n), ...intDer(e)]);
  const rsaOid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const spkiDer = (n: bigint, e: bigint) => tlv(0x30, [...tlv(0x30, rsaOid), ...tlv(0x03, [0x00, ...rsaPub(n, e)])]);
  const b64of = (a: number[]) => Buffer.from(a).toString("base64");

  t4("hand-built SPKI: bit length at every boundary, DER leading zero handled", () => {
    const cases: [number, string][] = [
      [511, "Unusable"],
      [512, "Unusable"],
      [1023, "Unusable"],
      [1024, "Weak"],
      [1025, "Weak"],
      [2047, "Weak"],
      [2048, "Usable"],
      [3072, "Usable"],
      [4096, "Usable"],
      [4097, "Usable"],
    ];
    for (const [bits, verdict] of cases) {
      for (const n of [(1n << BigInt(bits - 1)) | 1n, (1n << BigInt(bits)) - 1n]) {
        const k = okv4(V4.analyzeKeyRecord(`v=DKIM1; k=rsa; p=${b64of(spkiDer(n, 65537n))}`));
        assert.equal(k.key?.bits, bits, `bits ${bits}`);
        assert.equal(k.key?.modulus, n, `modulus ${bits}`);
        assert.equal(k.verdict.label, verdict, `verdict ${bits}`);
        assert.equal(k.key?.encoding, "spki");
        // The same modulus as a bare RSAPublicKey.
        const bare = okv4(V4.analyzeKeyRecord(`k=rsa; p=${b64of(rsaPub(n, 65537n))}`));
        assert.equal(bare.key?.bits, bits);
        assert.equal(bare.key?.encoding, "pkcs1");
      }
    }
    // Over 4096 bits is allowed but flagged, because RFC 8301 only obliges verifiers up to 4096.
    const big = okv4(V4.analyzeKeyRecord(`p=${b64of(spkiDer((1n << 4096n) | 1n, 65537n))}`));
    assert.ok(big.findings.some((f) => f.tone === "warn" && /up to 4096 bits/.test(f.text)));
  });

  t4("modulus INTEGER without its 0x00 pad decodes as negative and is refused", () => {
    // 0x80 leading byte with no pad: a negative INTEGER, not a 8 bit modulus of 128.
    const n = tlv(0x02, [0x80, 0x01]);
    const e = intDer(3n);
    const der = tlv(0x30, [...tlv(0x30, rsaOid), ...tlv(0x03, [0x00, ...tlv(0x30, [...n, ...e])])]);
    const k = okv4(V4.analyzeKeyRecord(`p=${b64of(der)}`));
    assert.equal(k.verdict.label, "Unusable");
    assert.ok(k.findings.some((f) => f.tone === "danger" && /zero or negative/.test(f.text)));
  });

  t4("Ed25519 against node crypto: raw 32 bytes is right, SPKI wrapper is flagged with the fix", () => {
    const { publicKey } = crypto.generateKeyPairSync("ed25519");
    const jwk = publicKey.export({ format: "jwk" }) as { x: string };
    const raw = Buffer.from(jwk.x, "base64url");
    assert.equal(raw.length, 32);
    const good = okv4(V4.analyzeKeyRecord(`v=DKIM1; k=ed25519; p=${raw.toString("base64")}`));
    assert.equal(good.key?.algorithm, "ed25519");
    assert.equal(good.key?.encoding, "raw");
    assert.equal(good.key?.keyHex, raw.toString("hex"));
    assert.equal(good.key?.bits, 256);
    assert.equal(good.verdict.label, "Usable");
    const spki = publicKey.export({ type: "spki", format: "der" });
    assert.equal(spki.length, 44);
    const wrapped = okv4(V4.analyzeKeyRecord(`v=DKIM1; k=ed25519; p=${spki.toString("base64")}`));
    assert.equal(wrapped.key?.encoding, "spki");
    assert.equal(wrapped.key?.keyHex, raw.toString("hex"));
    assert.equal(wrapped.verdict.label, "Unusable");
    assert.ok(wrapped.findings.some((f) => f.tone === "danger" && f.text.includes(`p=${raw.toString("base64")}`)));
    // 31 and 33 raw bytes are neither a key nor DER.
    for (const len of [31, 33]) {
      const bad = okv4(V4.analyzeKeyRecord(`k=ed25519; p=${Buffer.alloc(len, 0x55).toString("base64")}`));
      assert.equal(bad.verdict.label, "Unusable");
      assert.ok(bad.keyError && /32/.test(bad.keyError));
    }
  });

  t4("TXT strings: 255 bytes is the limit, joined with nothing between (RFC 1035 3.3, RFC 6376 3.6.2.2)", () => {
    const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const p = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const text = `v=DKIM1; k=rsa; p=${p}`;
    const split = (at: number) => `"${text.slice(0, at)}" "${text.slice(at)}"`;
    const at255 = okv4(V4.analyzeKeyRecord(split(255)));
    assert.equal(at255.txt.text, text);
    assert.deepEqual(at255.txt.strings?.map((s) => s.length), [255, text.length - 255]);
    assert.ok(!at255.findings.some((f) => f.tone === "danger"));
    assert.equal(at255.verdict.label, "Usable");
    const at256 = okv4(V4.analyzeKeyRecord(split(256)));
    assert.ok(at256.findings.some((f) => f.tone === "danger" && /String 1 is 256 bytes/.test(f.text)));
    // A line break and a comment between strings change nothing.
    const zone = okv4(V4.analyzeKeyRecord(`sel._domainkey 3600 IN TXT ( "${text.slice(0, 200)}"\n  "${text.slice(200)}" ) ; made by hand`));
    assert.equal(zone.txt.text, text);
    // The zone form this tool prints round-trips.
    const printed = V4.toZoneStrings(text);
    assert.equal(okv4(V4.analyzeKeyRecord(printed)).txt.text, text);
    assert.ok(!okv4(V4.analyzeKeyRecord(printed)).findings.some((f) => f.tone === "danger"));
  });

  t4("tag-list grammar of RFC 6376 section 3.2 on key records", () => {
    const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const p = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const spaced = ` v = DKIM1 ;  k = rsa ; p = ${p.slice(0, 60)} ${p.slice(60)} ; `;
    const a = okv4(V4.analyzeKeyRecord(spaced));
    assert.equal(a.verdict.label, "Usable");
    assert.equal(a.key?.bits, 2048);
    const dup = okv4(V4.analyzeKeyRecord(`v=DKIM1; t=y; t=s; p=${p}`));
    assert.equal(dup.verdict.label, "Unusable");
    assert.ok(dup.findings.some((f) => f.tone === "danger" && /t= tag appears more than once/.test(f.text)));
    assert.equal(okv4(V4.analyzeKeyRecord(`v=DKIM2; p=${p}`)).verdict.label, "Unusable");
    assert.equal(okv4(V4.analyzeKeyRecord(`v=dkim1; p=${p}`)).verdict.label, "Unusable"); // RFC 6376: a string comparison
    assert.equal(okv4(V4.analyzeKeyRecord(`k=rsa; v=DKIM1; p=${p}`)).findings.filter((f) => /not first/.test(f.text)).length, 1);
    assert.equal(okv4(V4.analyzeKeyRecord(`h=sha1; p=${p}`)).verdict.label, "Unusable");
    const both = okv4(V4.analyzeKeyRecord(`h=sha1:sha256; p=${p}`));
    assert.equal(both.verdict.label, "Usable");
    assert.ok(both.findings.some((f) => f.tone === "info" && /sha1/.test(f.text)));
    assert.equal(okv4(V4.analyzeKeyRecord(`s=other; p=${p}`)).verdict.label, "Unusable");
    assert.equal(okv4(V4.analyzeKeyRecord(`s=other:email; p=${p}`)).verdict.label, "Usable");
    const flags = okv4(V4.analyzeKeyRecord(`t=y:s; p=${p}`));
    assert.deepEqual(flags.flags, ["y", "s"]);
    assert.equal(flags.testing, true);
    assert.equal(flags.strict, true);
    assert.equal(flags.verdict.label, "Usable, testing mode");
    // A trailing semicolon is legal, a doubled one is not.
    assert.ok(!okv4(V4.analyzeKeyRecord(`p=${p};`)).findings.some((f) => /empty tag/.test(f.text)));
    assert.ok(okv4(V4.analyzeKeyRecord(`p=${p};;`)).findings.some((f) => /empty tag/.test(f.text)));
    // n= is a qp-section: =20 is a space, and a space is also kept.
    assert.equal(okv4(V4.analyzeKeyRecord(`n=Contact=20us here; p=${p}`)).notes, "Contact us here");
    // An empty p= is revocation even with spaces, and wins over a key type mismatch.
    assert.equal(okv4(V4.analyzeKeyRecord("v=DKIM1; k=ed25519; p=  ")).revoked, true);
  });

  t4("signature DNS name: RFC 6376 section 3.6.2.1 selector with a dot, case, trailing dot", () => {
    const base = "v=1; a=rsa-sha256; bh=AAAA; b=AAAA; h=from;";
    const dotted = okv4(V4.analyzeSignature(`${base} s=foo.bar; d=example.com`, 0));
    assert.equal(dotted.dnsName, "foo.bar._domainkey.example.com");
    assert.equal(dotted.dnsNameValid, true);
    const cased = okv4(V4.analyzeSignature(`${base} s=Sel1; d=Example.COM.`, 0));
    assert.equal(cased.dnsName, "sel1._domainkey.example.com");
    assert.equal(cased.domain, "example.com");
    assert.equal(cased.selector, "sel1");
    assert.equal(okv4(V4.analyzeSignature(`${base} s=s_1-2; d=a-b.example`, 0)).dnsNameValid, true);
    assert.equal(okv4(V4.analyzeSignature(`${base} d=example.com`, 0)).dnsName, null);
  });

  t4("a hostile selector or domain is never offered as a shell command", () => {
    const base = "v=1; a=rsa-sha256; bh=AAAA; b=AAAA; h=from;";
    const hostile = ["$(id)", "`id`", "a b", "x|y", "a&b", "-x", "a'b", 'a"b', "a>b", "a\\b", "a(b)", "a*", "..", "a..b", "é", "x".repeat(64)];
    for (const bad of hostile) {
      for (const field of ["s", "d"]) {
        const text = field === "s" ? `${base} s=${bad}; d=example.com` : `${base} s=sel; d=${bad}.example.com`;
        const r = okv4(V4.analyzeSignature(text, 0));
        assert.equal(r.dnsNameValid, false, `${field}=${bad}`);
        assert.ok(r.findings.some((f) => f.tone === "danger"), `${field}=${bad} flagged`);
      }
    }
    // Everything accepted is made of letters, digits, hyphen, underscore and dots only.
    for (const good of ["a", "a-b", "s_1", "x.y", "A1"]) {
      const r = okv4(V4.analyzeSignature(`${base} s=${good}; d=example.com`, 0));
      assert.equal(r.dnsNameValid, true, good);
      assert.match(r.dnsName ?? "", /^[a-z0-9_.-]+$/);
    }
  });

  t4("numeric tags: l= is up to 76 digits and t= and x= up to 12 (RFC 6376 section 3.5)", () => {
    const base = "v=1; a=rsa-sha256; d=example.com; s=s; bh=AAAA; b=AAAA; h=from;";
    const l76 = okv4(V4.analyzeSignature(`${base} l=${"9".repeat(76)}`, 0));
    assert.ok(l76.findings.some((f) => f.tone === "warn" && /signs only the first/.test(f.text)));
    const l77 = okv4(V4.analyzeSignature(`${base} l=${"9".repeat(77)}`, 0));
    assert.ok(l77.findings.some((f) => f.tone === "danger" && /decimal byte count/.test(f.text)));
    assert.ok(okv4(V4.analyzeSignature(`${base} t=${"9".repeat(12)}`, 0)).findings.every((f) => !/t= must be/.test(f.text)));
    assert.ok(okv4(V4.analyzeSignature(`${base} t=${"9".repeat(13)}`, 0)).findings.some((f) => /t= must be 1 to 12/.test(f.text)));
    assert.ok(okv4(V4.analyzeSignature(`${base} x=-1`, 0)).findings.some((f) => /x= must be 1 to 12/.test(f.text)));
    // x= judged against the supplied clock: expired one second ago, and exactly now is not yet expired.
    const now = Date.UTC(2026, 10, 4, 12, 0, 0);
    const exp = Math.floor(now / 1000);
    assert.ok(okv4(V4.analyzeSignature(`${base} t=1; x=${exp - 1}`, now)).findings.some((f) => /expired/.test(f.text)));
    assert.ok(!okv4(V4.analyzeSignature(`${base} t=1; x=${exp}`, now)).findings.some((f) => /expired/.test(f.text)));
    assert.ok(okv4(V4.analyzeSignature(`${base} t=${exp + 3600}`, now)).findings.some((f) => /in the future/.test(f.text)));
  });

  t4("a pasted signature stops at the next header or the blank line before the body", () => {
    const sample = V4.EXAMPLE_SIGNATURES[0].text;
    const alone = okv4(V4.analyzeSignature(sample, Date.UTC(2026, 10, 4)));
    assert.equal(alone.signatureBytes, 256);
    for (const tail of ["\nFrom: Alice <alice@example.com>\nTo: Bob <bob@example.net>", "\r\nSubject: Quarterly report\r\n", "\n\nHello Bob,\nthe figures are attached.\n"]) {
      const withTail = okv4(V4.analyzeSignature(sample + tail, Date.UTC(2026, 10, 4)));
      assert.equal(withTail.signatureBytes, 256, JSON.stringify(tail));
      assert.deepEqual(withTail.findings, alone.findings);
    }
    // Fold indent lost in a copy: lines flush left still join.
    const flat = sample.split("\n").map((l) => l.trimStart()).join("\n");
    const lost = okv4(V4.analyzeSignature(flat, Date.UTC(2026, 10, 4)));
    assert.equal(lost.signatureBytes, 256);
    assert.deepEqual(lost.signedHeaders, alone.signedHeaders);
    // An h= list wrapped at a colon is not mistaken for a header field.
    const wrapped = okv4(V4.analyzeSignature("v=1; a=rsa-sha256; d=a.example; s=s; bh=AAAA; b=AAAA; h=from:to:\nsubject:date;", 0));
    assert.deepEqual(wrapped.signedHeaders, ["from", "to", "subject", "date"]);
    assert.equal(V4.unfoldSignature("DKIM-Signature: v=1;\n\td=a.example;\n s=x\nFrom: a@b.c"), " v=1;\td=a.example; s=x");
  });

  t4("curly quotes from a word processor are read as straight quotes and reported", () => {
    const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const p = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const k = okv4(V4.analyzeKeyRecord(`“v=DKIM1; k=rsa; ” “p=${p}”`));
    assert.equal(k.key?.bits, 2048);
    assert.equal(k.txt.strings?.length, 2);
    assert.equal(k.txt.curlyQuotes, true);
    assert.ok(k.findings.some((f) => f.tone === "info" && /curly quotation marks/.test(f.text)));
    const plain = okv4(V4.analyzeKeyRecord(`"v=DKIM1; k=rsa; " "p=${p}"`));
    assert.equal(plain.txt.curlyQuotes, false);
    assert.ok(!plain.findings.some((f) => /curly/.test(f.text)));
  });

  t4("no input makes any entry point throw", () => {
    const junk = ["", "\0", "“", "\ud800", "p=😀", "=".repeat(3), "TXT", "( )", ";".repeat(50), "\\".repeat(30), "\n".repeat(10) + "v=1", "DKIM-Signature:", "DKIM-Signature: \nFrom: a@b.c"];
    for (const j of junk) {
      V4.analyzeKeyRecord(j);
      V4.analyzeSignature(j, 0);
      V4.unfoldSignature(j);
      V4.extractTxt(j);
    }
  });

  console.log(`dkim-record-analyzer fourth verifier: ${n4} tests passed`);
}
