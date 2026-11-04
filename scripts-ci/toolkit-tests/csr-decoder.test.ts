import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { readPemText, readBinary, verifySignature } from "../../client/src/lib/toolkit/asn1.ts";
import {
  parseCsr, decodeCsrs, reviewCsr, csrSans, parseSanList, parseIpv4, parseIpv6, isReservedIp, isInternalName,
  wildcardVerdict, shellQuote, buildTemplate, templateFromCsr, fileStem, isHostName, type CsrInfo,
} from "../../client/src/lib/toolkit/csr-decoder.ts";

import { tmpdir } from "node:os";
const SCRATCH = tmpdir() + "/";
const FIXROOT = new URL("./fixtures/", import.meta.url).pathname;
const FIX = FIXROOT + "certfix/";
const read = (f: string) => readFileSync(FIX + f, "utf8");
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}

function csrFrom(text: string): CsrInfo {
  const out = decodeCsrs(readPemText(text));
  const e = out.entries[0];
  assert.ok(e, "no CSR entry");
  if (!e.ok) throw new Error(e.error);
  return e.csr;
}
const sanText = (c: CsrInfo) => csrSans(c).map((n) => `${n.type}:${n.value}`);
const has = (c: CsrInfo, tone: string, re: RegExp) => reviewCsr(c).some((f) => f.tone === tone && re.test(f.text));

async function main() {
  await test("good EC P-256 request", async () => {
    const c = csrFrom(read("csr-good.pem"));
    assert.equal(c.version, 0);
    assert.equal(c.subject.rfc4514, "CN=www.example.com,O=Example Org,C=US");
    assert.equal(c.publicKey.summary, "ECDSA P-256");
    assert.equal(c.signatureAlgorithm.name, "ecdsa-with-SHA256");
    assert.deepEqual(sanText(c), ["DNS:www.example.com", "DNS:example.com"]);
    assert.deepEqual(c.extensions?.keyUsage, ["digitalSignature"]);
    assert.deepEqual(c.extensions?.extKeyUsage, ["1.3.6.1.5.5.7.3.1"]);
    assert.equal(c.extensions?.list.find((e) => e.oid === "2.5.29.15")?.critical, true);
    assert.equal(c.challengePassword, null);
    const f = reviewCsr(c);
    assert.ok(!f.some((x) => x.tone === "danger" || x.tone === "warn"), JSON.stringify(f));
    assert.equal((await verifySignature(c.signatureAlgorithm, c.publicKey, c.signed, c.signature)).status, "valid");
  });

  await test("weak request: RSA 1024, SHA-1, CN not in SANs, wildcard, internal name, challengePassword", async () => {
    const c = csrFrom(read("csr-weak.pem"));
    assert.equal(c.publicKey.bits, 1024);
    assert.equal(c.signatureAlgorithm.name, "sha1WithRSAEncryption");
    assert.deepEqual(sanText(c), ["DNS:*.example.com", "DNS:intranet"]);
    assert.equal(c.challengePassword, "hunter2");
    assert.ok(c.attributes.some((a) => a.name === "challengePassword" && a.values[0] === "hunter2"));
    assert.ok(has(c, "danger", /RSA key is 1024 bits/));
    assert.ok(has(c, "warn", /signed with sha1WithRSAEncryption/));
    assert.ok(has(c, "warn", /portal\.example\.com is not in the SAN list\. \*\.example\.com would match it/));
    assert.ok(has(c, "info", /\*\.example\.com covers exactly one label.*Add example\.com as its own SAN/));
    assert.ok(has(c, "info", /intranet is not a public domain name/));
    assert.ok(has(c, "info", /challengePassword attribute is present/));
    assert.equal((await verifySignature(c.signatureAlgorithm, c.publicKey, c.signed, c.signature)).status, "valid");
  });

  await test("CN-only request", () => {
    const c = csrFrom(read("csr-cnonly.pem"));
    assert.equal(c.extensions, null);
    assert.equal(c.publicKey.bits, 2048);
    assert.ok(has(c, "warn", /No subjectAltName is requested/));
    assert.ok(has(c, "ok", /RSA 2048 bit key/));
  });

  await test("Ed25519, odd RSA size, PSS", async () => {
    const ed = csrFrom(read("csr-ed25519.pem"));
    assert.equal(ed.publicKey.keyType, "Ed25519");
    assert.ok(has(ed, "info", /public CAs will not certify it/));
    assert.equal((await verifySignature(ed.signatureAlgorithm, ed.publicKey, ed.signed, ed.signature)).status, "valid");
    const odd = csrFrom(read("csr-odd.pem"));
    assert.equal(odd.publicKey.bits, 2047);
    assert.ok(has(odd, "danger", /2047 bits/));
    assert.ok(has(odd, "warn", /not a multiple of 8/));
    const pss = csrFrom(read("csr-pss.pem"));
    assert.equal(pss.signatureAlgorithm.name, "RSASSA-PSS with SHA-256");
    assert.equal((await verifySignature(pss.signatureAlgorithm, pss.publicKey, pss.signed, pss.signature)).status, "valid");
  });

  await test("wildcard rules and reserved addresses", () => {
    const c = csrFrom(read("csr-wild.pem"));
    assert.equal(c.publicKey.summary, "ECDSA P-384");
    assert.deepEqual(sanText(c), ["DNS:*.example.com", "DNS:w*.example.net", "DNS:a.*.example.org", "DNS:*.com", "IP:10.1.2.3"]);
    assert.ok(has(c, "danger", /w\*\.example\.net is a partial wildcard/));
    assert.ok(has(c, "danger", /a\.\*\.example\.org puts the wildcard below the leftmost label/));
    assert.ok(has(c, "danger", /\*\.com is a wildcard directly under a top-level domain/));
    assert.ok(has(c, "info", /10\.1\.2\.3 is a private or reserved address/));
    assert.equal(wildcardVerdict("*.example.com"), "ok");
    assert.equal(wildcardVerdict("*.*.example.com"), "multiple");
    assert.equal(wildcardVerdict("example.com"), "none");
  });

  await test("tampered request fails verification", async () => {
    const c = csrFrom(read("csr-good.pem"));
    const t = new Uint8Array(c.signed);
    t[t.length - 3] ^= 0x01;
    assert.equal((await verifySignature(c.signatureAlgorithm, c.publicKey, t, c.signature)).status, "invalid");
  });

  await test("certificates are redirected; malformed input never throws", () => {
    const out = decodeCsrs(readPemText(read("leaf.pem")));
    assert.equal(out.entries.length, 0);
    assert.equal(out.sawCertificate, true);
    const der = new Uint8Array(Buffer.from(read("csr-good.pem").replace(/-----[^-]+-----|\s/g, ""), "base64"));
    assert.ok(decodeCsrs(readBinary(der)).entries[0].ok);
    for (let cut = 0; cut < der.length; cut++) assert.equal(parseCsr(der.subarray(0, cut)).ok, false);
    for (let i = 0; i < 4000; i++) {
      const m = new Uint8Array(der);
      m[Math.floor(Math.random() * m.length)] = Math.floor(Math.random() * 256);
      const r = parseCsr(m);
      if (r.ok) {
        reviewCsr(r.csr);
        templateFromCsr(r.csr);
      }
    }
    for (let i = 0; i < 2000; i++) {
      const r = randomBytes(Math.floor(Math.random() * 300));
      if (i % 2) r[0] = 0x30;
      decodeCsrs(readBinary(new Uint8Array(r)));
      parseCsr(new Uint8Array(r));
    }
  });

  await test("address and host name helpers", () => {
    assert.deepEqual(parseIpv4("192.0.2.10"), [192, 0, 2, 10]);
    assert.equal(parseIpv4("256.1.1.1"), null);
    assert.equal(parseIpv4("01.2.3.4"), null);
    assert.deepEqual(parseIpv6("2001:db8::10")?.slice(0, 4), [0x20, 0x01, 0x0d, 0xb8]);
    assert.equal(parseIpv6("2001:db8::10")?.[15], 0x10);
    assert.equal(parseIpv6("::")?.length, 16);
    assert.deepEqual(parseIpv6("::ffff:192.0.2.1")?.slice(10), [0xff, 0xff, 192, 0, 2, 1]);
    assert.equal(parseIpv6("1::2::3"), null);
    assert.equal(parseIpv6("1:2:3:4:5:6:7:8:9"), null);
    assert.equal(parseIpv6("12345::"), null);
    for (const ip of ["10.0.0.1", "172.16.5.4", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "192.0.2.10", "::1", "fd00::1", "fe80::1", "2001:db8::1", "224.0.0.1"]) {
      assert.equal(isReservedIp(ip), true, ip);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111", "1.1.1.1"]) assert.equal(isReservedIp(ip), false, ip);
    assert.equal(isInternalName("intranet"), true);
    assert.equal(isInternalName("nas.local"), true);
    assert.equal(isInternalName("git.corp"), true);
    assert.equal(isInternalName("www.example.com"), false);
    assert.equal(isHostName("a-b.example.com"), true);
    assert.equal(isHostName("-bad.example.com"), false);
    assert.equal(isHostName("a".repeat(64) + ".com"), false);
    assert.equal(fileStem("*.example.com"), "wildcard.example.com");
    assert.equal(fileStem("../etc/passwd"), "etc_passwd");
    assert.equal(shellQuote("it's"), `'it'\\''s'`);
  });

  await test("SAN list parsing", () => {
    const r = parseSanList("www.example.com, example.com\n192.0.2.10 2001:db8::1 admin@example.com https://example.com/x DNS:Foo.Example.com IP:10.0.0.1 bad_name! w*.example.com www.example.com");
    assert.deepEqual(r.entries, [
      { type: "DNS", value: "www.example.com" },
      { type: "DNS", value: "example.com" },
      { type: "IP", value: "192.0.2.10" },
      { type: "IP", value: "2001:db8::1" },
      { type: "email", value: "admin@example.com" },
      { type: "URI", value: "https://example.com/x" },
      { type: "DNS", value: "foo.example.com" },
      { type: "IP", value: "10.0.0.1" },
    ]);
    assert.equal(r.errors.length, 2);
    assert.match(r.errors[0], /bad_name!/);
    assert.match(r.errors[1], /w\*\.example\.com/);
  });

  await test("template text is exact", () => {
    const t = buildTemplate({ commonName: "www.example.com", organization: "Example Org", country: "us", sans: "www.example.com example.com 192.0.2.10", key: "p256" });
    assert.deepEqual(t.errors, []);
    assert.deepEqual(t.warnings, []);
    assert.equal(
      t.oneLiner,
      [
        "openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \\",
        "  -keyout 'www.example.com.key' -out 'www.example.com.csr' \\",
        "  -subj '/C=US/O=Example Org/CN=www.example.com' \\",
        "  -addext 'subjectAltName=DNS:www.example.com,DNS:example.com,IP:192.0.2.10'",
      ].join("\n"),
    );
    assert.equal(
      t.config,
      [
        "[req]", "prompt = no", "distinguished_name = dn", "req_extensions = req_ext", "",
        "[dn]", "C = US", "O = Example Org", "CN = www.example.com", "",
        "[req_ext]", "subjectAltName = @alt_names", "",
        "[alt_names]", "DNS.1 = www.example.com", "DNS.2 = example.com", "IP.1 = 192.0.2.10", "",
      ].join("\n"),
    );
    const bad = buildTemplate({ commonName: "x".repeat(70), organization: "", country: "USA", sans: "", key: "rsa2048" });
    assert.ok(bad.errors.some((e) => /70 characters/.test(e)));
    assert.ok(bad.errors.some((e) => /two-letter/.test(e)));
    const warn = buildTemplate({ commonName: "a.example.com", organization: "", country: "", sans: "b.example.com", key: "rsa2048" });
    assert.ok(warn.warnings.some((w) => /not in the SAN list/.test(w)));
    const back = templateFromCsr(csrFrom(read("csr-weak.pem")));
    assert.deepEqual(back, { commonName: "portal.example.com", organization: "", country: "", sans: "*.example.com\nintranet", key: "rsa2048" });
  });

  await test("generated OpenSSL commands run and produce the request they describe", () => {
    const dir = mkdtempSync(SCRATCH + "tmpl-");
    try {
      const input = {
        commonName: "shop.example.com",
        organization: "Example / Org's #1 $HOME",
        country: "US",
        sans: "shop.example.com\nwww.shop.example.com\n192.0.2.44\n2001:db8::44",
        key: "p384" as const,
      };
      const t = buildTemplate(input);
      assert.deepEqual(t.errors, []);
      execSync(t.oneLiner, { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
      const one = csrFrom(readFileSync(`${dir}/shop.example.com.csr`, "utf8"));
      assert.deepEqual(sanText(one), ["DNS:shop.example.com", "DNS:www.shop.example.com", "IP:192.0.2.44", "IP:2001:db8::44"]);
      assert.equal(one.subject.rdns.flat().find((a) => a.short === "O")?.value, "Example / Org's #1 $HOME");
      assert.equal(one.subject.commonNames[0], "shop.example.com");
      assert.equal(one.publicKey.summary, "ECDSA P-384");
      rmSync(`${dir}/shop.example.com.csr`);
      writeFileSync(`${dir}/csr.cnf`, t.config);
      execSync(t.configCommand, { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
      const two = csrFrom(readFileSync(`${dir}/shop.example.com.csr`, "utf8"));
      assert.deepEqual(sanText(two), sanText(one));
      assert.equal(two.subject.rdns.flat().find((a) => a.short === "O")?.value, "Example / Org's #1 $HOME");
      const rsa = buildTemplate({ ...input, key: "rsa2048", organization: "" });
      rmSync(`${dir}/shop.example.com.csr`);
      execSync(rsa.oneLiner, { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
      assert.equal(csrFrom(readFileSync(`${dir}/shop.example.com.csr`, "utf8")).publicKey.summary, "RSA 2048 bit");
      // The inspect command verifies the signature.
      const out = execSync(rsa.inspect + " 2>&1", { cwd: dir, shell: "/bin/sh" }).toString();
      assert.match(out, /verify OK|Certificate request self-signature verify OK/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });


  await test("plus signs, truncation and too-broad wildcards in the template", () => {
    const dir = mkdtempSync(SCRATCH + "tmpl2-");
    try {
      const t = buildTemplate({ commonName: "a+b.example.com", organization: "Smith + Jones", country: "", sans: "a+b.example.com", key: "p256" });
      // a+b is not a valid host name label, so it is refused as a SAN.
      assert.ok(t.errors.some((e) => /a\+b\.example\.com/.test(e)));
      const ok = buildTemplate({ commonName: "ab.example.com", organization: "Smith + Jones", country: "", sans: "ab.example.com", key: "p256" });
      assert.deepEqual(ok.errors, []);
      assert.match(ok.oneLiner, /-subj '\/O=Smith \\\+ Jones\/CN=ab\.example\.com'/);
      execSync(ok.oneLiner, { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
      const c = csrFrom(readFileSync(`${dir}/ab.example.com.csr`, "utf8"));
      assert.equal(c.subject.rdns.length, 2);
      assert.equal(c.subject.rdns[0][0].value, "Smith + Jones");
      assert.equal(c.subject.commonNames[0], "ab.example.com");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const many = Array.from({ length: 130 }, (_, i) => `h${i}.example.com`).join("\n");
    const t2 = buildTemplate({ commonName: "h0.example.com", organization: "", country: "", sans: many, key: "rsa2048" });
    assert.deepEqual(t2.errors, []);
    assert.equal(t2.sans.length, 100);
    assert.ok(t2.warnings.some((w) => /first 100/.test(w)));
    const broad = buildTemplate({ commonName: "", organization: "", country: "", sans: "*.com", key: "p256" });
    assert.ok(broad.warnings.some((w) => /\*\.com is a wildcard directly under a top-level domain/.test(w)));
    const junk = parseSanList(Array.from({ length: 50 }, (_, i) => `bad_${i}!`).join(" "));
    assert.equal(junk.errors.length, 21);
  });

  await test("RSA-PSS restricted key request verifies", async () => {
    const c = csrFrom(readFileSync(FIXROOT + "certfix2/csr-psskey.pem", "utf8"));
    assert.equal(c.publicKey.keyType, "RSA-PSS");
    assert.equal(c.publicKey.summary, "RSA 2048 bit");
    const r = await verifySignature(c.signatureAlgorithm, c.publicKey, c.signed, c.signature);
    assert.equal(r.status, "valid", r.detail);
    assert.equal(templateFromCsr(c).key, "rsa2048");
  });

  await test("the page's sample requests decode with the findings the labels promise", async () => {
    const src = readFileSync(new URL("../../client/src/pages/tools/CsrDecoder.tsx", import.meta.url), "utf8");
    const grab = (name: string) => {
      const m = new RegExp(name + " = `([^`]*)`").exec(src);
      assert.ok(m, name);
      return m![1];
    };
    const good = csrFrom(grab("SAMPLE_GOOD"));
    assert.ok(!reviewCsr(good).some((f) => f.tone === "danger" || f.tone === "warn"));
    const weak = csrFrom(grab("SAMPLE_WEAK"));
    assert.ok(has(weak, "danger", /1024 bits/));
    assert.ok(has(weak, "warn", /sha1WithRSAEncryption/));
    assert.ok(has(weak, "warn", /portal\.example\.com is not in the SAN list\. \*\.example\.com would match it/));
    assert.ok(has(weak, "info", /\*\.example\.com covers exactly one label/));
    assert.ok(has(weak, "info", /intranet is not a public domain name/));
    assert.ok(has(weak, "info", /challengePassword/));
    const cnOnly = csrFrom(grab("SAMPLE_CN_ONLY"));
    assert.ok(has(cnOnly, "warn", /No subjectAltName is requested/));
    const wild = csrFrom(grab("SAMPLE_WILDCARDS"));
    assert.ok(has(wild, "danger", /w\*\.example\.net is a partial wildcard/));
    assert.ok(has(wild, "danger", /a\.\*\.example\.org puts the wildcard below the leftmost label/));
    assert.ok(has(wild, "danger", /\*\.com is a wildcard directly under a top-level domain/));
    assert.ok(has(wild, "info", /10\.1\.2\.3 is a private or reserved address/));
    for (const c of [good, weak, cnOnly, wild]) {
      assert.equal((await verifySignature(c.signatureAlgorithm, c.publicKey, c.signed, c.signature)).status, "valid");
    }
  });


  /* ---------------- independent verifier cases (second pass) ---------------- */
  const FIX3 = FIXROOT + "certfix3/";
  const csr3 = (f: string) => csrFrom(readFileSync(FIX3 + f, "utf8"));

  await test("V1: secp256k1 and explicit-parameter EC keys", async () => {
    const k1 = csr3("k1.csr");
    assert.equal(k1.publicKey.summary, "ECDSA secp256k1");
    assert.ok(has(k1, "warn", /secp256k1\. Public CAs issue only on P-256, P-384 and P-521/));
    assert.equal((await verifySignature(k1.signatureAlgorithm, k1.publicKey, k1.signed, k1.signature)).status, "unsupported");
    const exp = csr3("exp.csr");
    assert.equal(exp.publicKey.summary, "ECDSA with explicit curve parameters");
    assert.ok(has(exp, "warn", /explicit parameters.*CVE-2020-0601/));
  });

  await test("V2: Ed448 (RFC 8410: 57 byte key) and DSA 2048 requests", async () => {
    const ed = csr3("ed448.csr");
    assert.equal(ed.publicKey.keyType, "Ed448");
    assert.ok(ed.publicKey.rows.some((r) => r.label === "Key" && r.value === "57 bytes"));
    assert.ok(has(ed, "info", /Ed448 is a sound algorithm/));
    assert.equal((await verifySignature(ed.signatureAlgorithm, ed.publicKey, ed.signed, ed.signature)).status, "unsupported");
    const dsa = csr3("dsa.csr");
    assert.equal(dsa.publicKey.summary, "DSA 2048 bit");
    assert.equal(dsa.signatureAlgorithm.name, "dsa-with-SHA256");
    assert.ok(has(dsa, "danger", /FIPS 186-5/));
  });

  await test("V3: attributes, emailAddress, underscore, CA request and reserved IP match openssl req -text", async () => {
    const c = csr3("att.csr");
    const attrs = Object.fromEntries(c.attributes.map((a) => [a.name, a.values.join(",")]));
    assert.equal(attrs.unstructuredName, "Unit 7");
    assert.equal(attrs.challengePassword, "s3cret");
    assert.equal(c.challengePassword, "s3cret");
    assert.equal(c.subject.rfc4514, "emailAddress=admin@example.com,CN=very.example.com");
    assert.deepEqual(sanText(c), [
      "DNS:a_b.example.com", "DNS:xn--mnchen-3ya.example", "DNS:*.co.uk", "IP:fe80::1", "email:a@example.com", "URI:https://example.com/x",
    ]);
    assert.deepEqual(c.extensions?.basicConstraints, { ca: true, pathLen: null });
    assert.deepEqual(c.extensions?.keyUsage, ["keyCertSign"]);
    assert.ok(has(c, "danger", /a_b\.example\.com contains an underscore/));
    assert.ok(has(c, "info", /fe80::1 is a private or reserved address/));
    assert.ok(has(c, "info", /emailAddress attribute/));
    assert.ok(has(c, "warn", /CA:TRUE/));
    assert.ok(has(c, "warn", /keyCertSign/));
    assert.ok(has(c, "warn", /very\.example\.com is not in the SAN list/));
    assert.equal((await verifySignature(c.signatureAlgorithm, c.publicKey, c.signed, c.signature)).status, "valid");
  });

  await test("V4: a request built by hand from RFC 2986 and signed with node:crypto", async () => {
    const { generateKeyPairSync, sign } = await import("node:crypto");
    const tlv = (tag: number, ...parts: Uint8Array[]): Uint8Array => {
      const body = Buffer.concat(parts);
      const len = body.length < 0x80 ? [body.length] : body.length < 0x100 ? [0x81, body.length] : [0x82, body.length >> 8, body.length & 0xff];
      return new Uint8Array(Buffer.concat([Buffer.from([tag, ...len]), body]));
    };
    const b = (...x: number[]) => new Uint8Array(x);
    const name = tlv(0x30, tlv(0x31, tlv(0x30, b(0x06, 0x03, 0x55, 0x04, 0x03), tlv(0x0c, new TextEncoder().encode("hand.example.com")))));
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const spki = new Uint8Array(publicKey.export({ type: "spki", format: "der" }));
    const ecdsaSha256 = b(0x30, 0x0a, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02);
    const build = (version: number, withAttrs: boolean) => {
      const cri = tlv(0x30, b(0x02, 0x01, version), name, spki, ...(withAttrs ? [b(0xa0, 0x00)] : []));
      const sig = new Uint8Array(sign("sha256", cri, privateKey));
      return tlv(0x30, cri, ecdsaSha256, tlv(0x03, b(0), sig));
    };
    const good = parseCsr(build(0, true));
    if (!good.ok) throw new Error(good.error);
    assert.equal(good.csr.subject.commonNames[0], "hand.example.com");
    assert.equal(good.csr.attributes.length, 0);
    assert.equal(good.csr.extensions, null);
    assert.equal((await verifySignature(good.csr.signatureAlgorithm, good.csr.publicKey, good.csr.signed, good.csr.signature)).status, "valid");
    const v2 = parseCsr(build(1, true));
    if (!v2.ok) throw new Error(v2.error);
    assert.ok(reviewCsr(v2.csr).some((f) => f.tone === "warn" && /version field is 1/.test(f.text)));
    // Flip one byte of the signed part: the proof of possession must fail.
    const der = build(0, true);
    der[Buffer.from(der).indexOf("hand.example.com")] ^= 0x01; // "hand" becomes "iand"
    const bad = parseCsr(der);
    assert.ok(bad.ok, "the tampered request still parses");
    if (bad.ok) assert.equal((await verifySignature(bad.csr.signatureAlgorithm, bad.csr.publicKey, bad.csr.signed, bad.csr.signature)).status, "invalid");
  });

  await test("V5: RFC 4291 text forms and reserved address blocks", () => {
    assert.equal(parseIpv6("1.2.3.4::"), null); // the dotted tail must be last
    assert.equal(parseIpv6("1.2.3.4::1"), null);
    assert.deepEqual(parseIpv6("::1.2.3.4")?.slice(12), [1, 2, 3, 4]);
    assert.deepEqual(parseIpv6("0:0:0:0:0:ffff:1.2.3.4")?.slice(10), [0xff, 0xff, 1, 2, 3, 4]);
    assert.equal(parseIpv6("::ffff:1.2.3"), null);
    assert.equal(parseIpv6("2001:db8:::1"), null);
    assert.equal(isReservedIp("::ffff:10.0.0.1"), true); // mapped private address
    assert.equal(isReservedIp("::ffff:8.8.8.8"), false);
    assert.equal(isReservedIp("192.0.0.8"), true); // RFC 6890 IETF protocol assignments
    assert.equal(isReservedIp("198.18.0.1"), true); // RFC 2544 benchmarking
    assert.equal(isReservedIp("240.0.0.1"), true);
    assert.equal(isReservedIp("192.0.3.1"), false);
  });

  await test("V6: non-ASCII subject fields get -utf8 and utf8 = yes, and OpenSSL then stores them correctly", () => {
    const dir = mkdtempSync(SCRATCH + "tmpl3-");
    try {
      const t = buildTemplate({ commonName: "shop.example.com", organization: "Müller GmbH", country: "DE", sans: "shop.example.com", key: "p256" });
      assert.deepEqual(t.errors, []);
      assert.match(t.oneLiner, /-nodes -utf8 \\/);
      assert.match(t.config, /^\[req\]\nprompt = no\nutf8 = yes\n/);
      execSync(t.oneLiner, { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
      const one = csrFrom(readFileSync(`${dir}/shop.example.com.csr`, "utf8"));
      assert.equal(one.subject.rdns.flat().find((a) => a.short === "O")?.value, "Müller GmbH");
      rmSync(`${dir}/shop.example.com.csr`);
      writeFileSync(`${dir}/csr.cnf`, t.config);
      execSync(t.configCommand, { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
      const two = csrFrom(readFileSync(`${dir}/shop.example.com.csr`, "utf8"));
      assert.equal(two.subject.rdns.flat().find((a) => a.short === "O")?.value, "Müller GmbH");
      const ascii = buildTemplate({ commonName: "a.example.com", organization: "Plain", country: "", sans: "a.example.com", key: "p256" });
      assert.ok(!ascii.oneLiner.includes("-utf8") && !ascii.config.includes("utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("V7: hidden characters in names stay escaped in findings", () => {
    const base = csrFrom(read("csr-weak.pem"));
    const rtl = { ...base, subject: { ...base.subject, commonNames: ["portal‮.example.com"] } };
    const texts = reviewCsr(rtl).map((f) => f.text).join("\n");
    assert.ok(!texts.includes("‮"));
    assert.ok(texts.includes("portal\\u{202e}.example.com"));
  });

  await test("V8: the generator refuses hidden characters and non-ASCII IA5 values", () => {
    const hidden = buildTemplate({ commonName: "www.example.com", organization: "Example\u202e Org", country: "", sans: "www.example.com", key: "p256" });
    assert.ok(hidden.errors.some((e) => /bidirectional/.test(e)));
    assert.equal(hidden.errors.length, 1);
    const r = parseSanList("j\u00fcrgen@example.com https://example.com/\u00e9 email:ok@example.com URI:https://example.com/a?b=c&d=e");
    assert.deepEqual(r.entries, [
      { type: "email", value: "ok@example.com" },
      { type: "URI", value: "https://example.com/a?b=c&d=e" },
    ]);
    assert.equal(r.errors.length, 2);
  });


  /* ---------------- independent verifier cases (third pass) ---------------- */
  const FIX4 = FIXROOT + "certfix4/";
  const csr4 = (f: string) => csrFrom(readFileSync(FIX4 + f, "utf8"));
  const { wildcardCovers } = await import("../../client/src/lib/toolkit/csr-decoder.ts");

  await test("W1: an RSA 2047 bit, SHA-1 signed request (openssl genrsa 2047, req -sha1)", async () => {
    const c = csr4("r2047sha1.csr");
    assert.equal(c.publicKey.bits, 2047); // openssl req -text: Public-Key: (2047 bit)
    assert.equal(c.signatureAlgorithm.name, "sha1WithRSAEncryption");
    assert.ok(has(c, "danger", /The RSA key is 2047 bits/));
    assert.ok(has(c, "warn", /2047 bits, not a multiple of 8/));
    assert.ok(has(c, "warn", /signed with sha1WithRSAEncryption.*Regenerate with SHA-256/));
    // The CN is a private address that the SAN list does not repeat.
    assert.ok(has(c, "warn", /common name 10\.1\.2\.3 is not in the SAN list/));
    assert.ok(has(c, "info", /^10\.1\.2\.3 is a private or reserved address/));
    assert.ok(has(c, "info", /^2001:db8::1 is a private or reserved address/)); // RFC 3849 documentation prefix
    assert.deepEqual(sanText(c), ["DNS:odd.example.com", "IP:2001:db8::1"]);
    assert.equal(c.publicKey.pinSha256, "xgEWQNSAWHNvOLxRGWeVyPxCu/1LHyH3KiVctijMq6k="); // openssl req -pubkey | pkey | dgst
    assert.equal((await verifySignature(c.signatureAlgorithm, c.publicKey, c.signed, c.signature)).status, "valid");
    // Regenerating moves it to a sound key.
    assert.equal(templateFromCsr(c).key, "rsa2048");
  });

  await test("W2: a P-521 ECDSA-with-SHA512 request verifies and regenerates on P-384", async () => {
    const c = csr4("p521.csr");
    assert.equal(c.publicKey.summary, "ECDSA P-521");
    assert.equal(c.publicKey.bits, 521);
    assert.equal(c.signatureAlgorithm.name, "ecdsa-with-SHA512");
    assert.equal(c.publicKey.pinSha256, "K3vtbnvI8TvcX1BlVU78uvNMp99zNdXcCholVQhxzqg=");
    assert.equal(c.subject.rfc4514, "CN=big.example.com,O=Example Org,C=US");
    assert.equal(c.subject.openssl, "/C=US/O=Example Org/CN=big.example.com");
    assert.ok(has(c, "info", /P-521.*Mozilla/));
    assert.equal((await verifySignature(c.signatureAlgorithm, c.publicKey, c.signed, c.signature)).status, "valid");
    const t = templateFromCsr(c);
    assert.equal(t.key, "p384");
    assert.deepEqual([t.commonName, t.organization, t.country, t.sans], ["big.example.com", "Example Org", "US", "big.example.com"]);
  });

  await test("W3: RFC 9525 6.3 wildcard coverage, including the empty-label edge", () => {
    assert.equal(wildcardCovers("*.example.com", "a.example.com"), true);
    assert.equal(wildcardCovers("*.example.com", "WWW.Example.COM"), true);
    assert.equal(wildcardCovers("*.example.com.", "a.example.com"), true);
    assert.equal(wildcardCovers("*.example.com", "example.com"), false);
    assert.equal(wildcardCovers("*.example.com", ".example.com"), false);
    assert.equal(wildcardCovers("*.example.com", "a.b.example.com"), false);
    assert.equal(wildcardCovers("*.example.com", "aexample.com"), false);
    assert.equal(wildcardCovers("f*.example.com", "foo.example.com"), false); // partial wildcards never match
    assert.equal(wildcardCovers("*.com", "example.com"), false); // too broad
    const base = csrFrom(read("csr-weak.pem")); // SANs *.example.com and intranet
    const dotted = { ...base, subject: { ...base.subject, commonNames: [".example.com"] } };
    assert.ok(reviewCsr(dotted).some((f) => /common name \.example\.com is not in the SAN list\. The Baseline Requirements require/.test(f.text)));
    assert.ok(!reviewCsr(dotted).some((f) => /would match it in a browser/.test(f.text)));
    const covered = { ...base, subject: { ...base.subject, commonNames: ["Portal.Example.com"] } };
    assert.ok(reviewCsr(covered).some((f) => /\*\.example\.com would match it in a browser/.test(f.text)));
  });

  await test("W4: ub-common-name (RFC 5280 Appendix A) counts characters, not UTF-16 code units", () => {
    const base = csrFrom(read("csr-good.pem"));
    const astral = "\u{1F512}".repeat(40); // 40 characters, 80 UTF-16 code units
    const ok = { ...base, subject: { ...base.subject, commonNames: [astral] } };
    assert.ok(!reviewCsr(ok).some((f) => /X\.520 caps it at 64/.test(f.text)));
    const long = { ...base, subject: { ...base.subject, commonNames: ["a".repeat(65)] } };
    assert.ok(reviewCsr(long).some((f) => f.tone === "danger" && /common name is 65 characters/.test(f.text)));
    const edge = { ...base, subject: { ...base.subject, commonNames: ["a".repeat(64)] } };
    assert.ok(!reviewCsr(edge).some((f) => /X\.520 caps it at 64/.test(f.text)));
  });

  await test("W5: an empty subject still produces runnable commands (OpenSSL rejects an empty [dn] section)", () => {
    const dir = mkdtempSync(SCRATCH + "tmpl4-");
    try {
      const t = buildTemplate({ commonName: "", organization: "", country: "", sans: "only.example.com 192.0.2.7", key: "p256" });
      assert.deepEqual(t.errors, []);
      assert.match(t.oneLiner, /-subj '\/'/);
      assert.match(t.configCommand, / -config csr\.cnf -subj '\/'$/);
      execSync(t.oneLiner, { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
      const one = csrFrom(readFileSync(`${dir}/only.example.com.csr`, "utf8"));
      assert.equal(one.subject.rdns.length, 0);
      assert.deepEqual(sanText(one), ["DNS:only.example.com", "IP:192.0.2.7"]);
      rmSync(`${dir}/only.example.com.csr`);
      writeFileSync(`${dir}/csr.cnf`, t.config);
      execSync(t.configCommand, { cwd: dir, stdio: "pipe", shell: "/bin/sh" });
      const two = csrFrom(readFileSync(`${dir}/only.example.com.csr`, "utf8"));
      assert.equal(two.subject.rdns.length, 0);
      assert.deepEqual(sanText(two), ["DNS:only.example.com", "IP:192.0.2.7"]);
      // With a subject, the config command carries no -subj.
      const named = buildTemplate({ commonName: "n.example.com", organization: "", country: "", sans: "n.example.com", key: "p256" });
      assert.ok(!named.configCommand.includes("-subj"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("W6: shell quoting survives every hostile byte the subject can hold (POSIX sh round trip)", () => {
    for (const v of ["it's", "a'b'c", "$(id)", "`id`", "a\\b", "\"q\"", "x;y|z&", "'"]) {
      const out = execSync(`printf %s ${shellQuote(v)}`, { shell: "/bin/sh" }).toString();
      assert.equal(out, v);
    }
  });

  console.log(`csr-decoder: ${passed} tests passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
