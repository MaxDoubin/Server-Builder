import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  decodeKeyBlob,
  effectivePermissions,
  fingerprintMd5,
  fingerprintSha256,
  fromBase64,
  inspectKeys,
  MAX_LINES,
  MAX_OPTIONS,
  md5,
  parseExpiry,
  parseLine,
  parseOptions,
  sha256,
  toBase64,
  toHex,
} from "../../client/src/lib/toolkit/ssh-key-inspector.ts";

const FIX = new URL("./fixtures/ssh-fixtures", import.meta.url).pathname;
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
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
const enc = (s: string) => new TextEncoder().encode(s);

/* ------------------------------------------------- FIPS 180-4 SHA-256 */
test("SHA-256 FIPS 180-2 appendix vectors", () => {
  assert.equal(toHex(sha256(enc("abc"))), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(toHex(sha256(enc(""))), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(
    toHex(sha256(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
  assert.equal(toHex(sha256(enc("a".repeat(1_000_000)))), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
});

/* ------------------------------------------------------- RFC 1321 MD5 */
test("MD5 RFC 1321 appendix A.5 test suite", () => {
  const suite: [string, string][] = [
    ["", "d41d8cd98f00b204e9800998ecf8427e"],
    ["a", "0cc175b9c0f1b6a831c399e269772661"],
    ["abc", "900150983cd24fb0d6963f7d28e17f72"],
    ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
    ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
    ["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", "d174ab98d277d9f5a5611c2c9f419d9f"],
    ["1234567890".repeat(8), "57edf4a22be3c955ac49da2e2107b67a"],
  ];
  for (const [input, want] of suite) assert.equal(toHex(md5(enc(input))), want, input);
});

test("SHA-256 and MD5 agree with node:crypto at every padding boundary", () => {
  let seed = 7;
  for (let len = 0; len < 300; len++) {
    const b = new Uint8Array(len);
    for (let i = 0; i < len; i++) b[i] = (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff;
    assert.equal(toHex(sha256(b)), createHash("sha256").update(b).digest("hex"), `sha256 len ${len}`);
    assert.equal(toHex(md5(b)), createHash("md5").update(b).digest("hex"), `md5 len ${len}`);
  }
});

test("Base64 round trip and strictness", () => {
  for (const s of ["", "f", "fo", "foo", "foob", "fooba", "foobar"]) {
    // RFC 4648 section 10 test vectors
    const want = { "": "", f: "Zg==", fo: "Zm8=", foo: "Zm9v", foob: "Zm9vYg==", fooba: "Zm9vYmE=", foobar: "Zm9vYmFy" }[s];
    assert.equal(toBase64(enc(s)), want);
    if (s) {
      const r = fromBase64(want as string);
      assert.ok(r.ok && new TextDecoder().decode(r.bytes) === s && r.padded);
    }
  }
  const nopad = fromBase64("Zm9vYg");
  assert.ok(nopad.ok && !nopad.padded);
  assert.ok(!fromBase64("Zm9v-g==").ok);
  assert.ok(!fromBase64("Zm9vY").ok);
  assert.ok(!fromBase64("Zm9vYg=").ok);
  assert.ok(!fromBase64("Zm=9v").ok);
});

/* ------------------------------------- GitHub's published fingerprints */
test("GitHub host keys match the fingerprints GitHub publishes", () => {
  const cases: [string, string, number, string][] = [
    [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
      "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU",
      256,
      "ED25519",
    ],
    [
      "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=",
      "SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM",
      256,
      "ECDSA",
    ],
    [
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=",
      "SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s",
      3072,
      "RSA",
    ],
  ];
  for (const [line, fp, bits, label] of cases) {
    const l = parseLine(line, 1, NOW);
    assert.equal(l.error, null, l.error ?? "");
    assert.equal(l.sha256, fp);
    assert.equal(l.key?.bits, bits);
    assert.equal(l.keygen, `${bits} ${fp} no comment (${label})`);
  }
  // github.com as a known_hosts line prints the host where the comment goes.
  const kh = parseLine("github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl", 1, NOW);
  assert.equal(kh.source, "known_hosts");
  assert.equal(kh.hosts, "github.com");
  assert.equal(kh.keygen, "256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)");
});

/* --------------------------------------------- generated key vectors */
const vectors = JSON.parse(readFileSync(`${FIX}/vectors.json`, "utf8")) as Record<
  string,
  { line: string; type: string; sha256: string; md5: string; bits: number; ca_sha256?: string }
>;

const LABELS: Record<string, string> = {
  rsa2048: "RSA",
  rsa1024: "RSA",
  rsa3072_e3: "RSA",
  dsa1024: "DSA",
  p256: "ECDSA",
  p384: "ECDSA",
  p521: "ECDSA",
  ed25519: "ED25519",
  sk_ecdsa: "ECDSA-SK",
  sk_ed25519: "ED25519-SK",
  cert_ed25519: "ED25519-CERT",
  cert_rsa_host: "RSA-CERT",
};

for (const [name, v] of Object.entries(vectors)) {
  test(`vector ${name}: type, bits, SHA256 and MD5 fingerprints`, () => {
    const l = parseLine(v.line, 1, NOW);
    assert.equal(l.error, null, l.error ?? "");
    assert.equal(l.key?.type, v.type);
    assert.equal(l.key?.bits, v.bits);
    assert.equal(l.sha256, v.sha256);
    assert.equal(l.md5, v.md5);
    assert.equal(l.key?.label, LABELS[name]);
    const comment = v.line.split(" ").slice(2).join(" ") || "no comment";
    assert.equal(l.keygen, `${v.bits} ${v.sha256} ${comment} (${LABELS[name]})`);
    assert.equal(l.keygenMd5, `${v.bits} ${v.md5} ${comment} (${LABELS[name]})`);
    assert.equal(l.key?.problems.length, 0, JSON.stringify(l.key?.problems));
  });
}

test("RSA exponent and size findings", () => {
  const big = parseLine(vectors.rsa2048.line, 1, NOW);
  assert.equal(big.key?.rsaExponent, 65537n);
  assert.ok(big.findings.some((f) => f.tone === "ok" && /2048 bit/.test(f.text)));
  const small = parseLine(vectors.rsa1024.line, 1, NOW);
  assert.ok(small.findings.some((f) => f.tone === "danger" && /1024 bit RSA key is below the 2048/.test(f.text)));
  const e3 = parseLine(vectors.rsa3072_e3.line, 1, NOW);
  assert.equal(e3.key?.rsaExponent, 3n);
});
test("DSA is flagged", () => {
  const l = parseLine(vectors.dsa1024.line, 1, NOW);
  assert.ok(l.findings.some((f) => f.tone === "danger" && /DSA/.test(f.text)));
});
test("ECDSA curve details", () => {
  const l = parseLine(vectors.p521.line, 1, NOW);
  assert.equal(l.key?.details.find((d) => d.label === "Curve")?.value, "nistp521 (NIST P-521)");
  assert.equal(l.key?.details.find((d) => d.label === "Point")?.value, "uncompressed, 133 bytes");
});
test("Security key application string", () => {
  const l = parseLine(vectors.sk_ed25519.line, 1, NOW);
  assert.equal(l.key?.application, "ssh:");
  assert.equal(l.comment, "yubikey@laptop");
});

/* --------------------------------------------------- certificates */
test("Ed25519 user certificate fields", () => {
  const l = parseLine(vectors.cert_ed25519.line, 1, NOW);
  const c = l.key?.certificate;
  assert.ok(c);
  if (!c) return;
  assert.equal(c.serial, "12345");
  assert.equal(c.certType, "user");
  assert.equal(c.keyId, "alice@example");
  assert.deepEqual(c.principals, ["alice", "deploy"]);
  assert.equal(c.validAfter, 1700000000n);
  assert.equal(c.validBefore, 1900000000n);
  assert.deepEqual(c.criticalOptions, [{ label: "force-command", value: "/usr/bin/rsync --server" }]);
  assert.deepEqual(c.extensions, [{ label: "permit-pty", value: "" }]);
  assert.equal(c.caType, "ssh-ed25519");
  assert.equal(c.caFingerprint, vectors.cert_ed25519.ca_sha256);
  assert.equal(c.signatureAlgorithm, "ssh-ed25519");
  // fingerprint is the plain key's, as ssh-keygen -l prints for a certificate
  assert.equal(l.sha256, vectors.ed25519.sha256);
});
test("RSA host certificate valid forever, signed with rsa-sha2-512", () => {
  const l = parseLine(vectors.cert_rsa_host.line, 1, NOW);
  const c = l.key?.certificate;
  assert.ok(c);
  assert.equal(c?.certType, "host");
  assert.equal(c?.validity, "from the beginning of time to forever");
  assert.equal(c?.signatureAlgorithm, "rsa-sha2-512");
  assert.equal(l.sha256, vectors.rsa2048.sha256);
});
test("Expired certificate is flagged", () => {
  const later = Date.UTC(2031, 0, 1);
  const l = parseLine(vectors.cert_ed25519.line, 1, later);
  assert.ok(l.findings.some((f) => f.tone === "danger" && /expired/.test(f.text)));
});

/* ------------------------------------------------------------ options */
test("Options with quoted commas, escaped quotes and case", () => {
  const r = parseOptions('command="echo \\"a,b\\"",FROM="10.0.0.0/8,!10.0.0.5",No-Pty,restrict', NOW);
  assert.ok(r.ok);
  assert.equal(r.options.length, 4);
  assert.equal(r.options[0].canonical, "command");
  assert.equal(r.options[0].value, 'echo "a,b"');
  assert.equal(r.options[1].canonical, "from");
  assert.equal(r.options[1].value, "10.0.0.0/8,!10.0.0.5");
  assert.equal(r.options[2].canonical, "no-pty");
  assert.equal(r.options[3].canonical, "restrict");
});
test("Option syntax errors", () => {
  assert.ok(!parseOptions("command=echo", NOW).ok);
  assert.ok(!parseOptions('command="echo', NOW).ok);
  assert.ok(!parseOptions('no-pty,', NOW).ok);
  assert.ok(!parseOptions('command="a"x', NOW).ok);
  const unknown = parseOptions("no-ptty", NOW);
  assert.ok(unknown.ok && unknown.options[0].error);
  const flagValue = parseOptions('no-pty="1"', NOW);
  assert.ok(flagValue.ok && flagValue.options[0].error);
  const needs = parseOptions("from", NOW);
  assert.ok(needs.ok && needs.options[0].error);
});
test("Option value validation", () => {
  const ok = parseOptions('permitopen="db.internal:5432",permitopen="[2001:db8::1]:443",permitlisten="8080",permitlisten="localhost:2222"', NOW);
  assert.ok(ok.ok && ok.options.every((o) => o.error === null));
  const bad = parseOptions('permitopen="db.internal",permitopen="h:99999",environment="A-B=x",environment="FOO",tunnel="x"', NOW);
  assert.ok(bad.ok && bad.options.every((o) => o.error !== null));
  const env = parseOptions('environment="PATH=/usr/bin"', NOW);
  assert.ok(env.ok && env.options[0].error === null);
  const dns = parseOptions('from="*.example.com,192.0.2.0/24"', NOW);
  assert.ok(dns.ok && /UseDNS/.test(dns.options[0].detail ?? ""));
  const ips = parseOptions('from="192.0.2.0/24,2001:db8::/32"', NOW);
  assert.ok(ips.ok && !/UseDNS/.test(ips.options[0].detail ?? ""));
});
test("expiry-time timespec (sshd(8))", () => {
  const a = parseExpiry("20251231Z");
  assert.ok(a.ok && a.ms === Date.UTC(2025, 11, 31) && a.utc);
  const b = parseExpiry("202512311530");
  assert.ok(b.ok && !b.utc && b.text === "2025-12-31 15:30:00 server local time");
  const c = parseExpiry("20251231153045Z");
  assert.ok(c.ok && c.ms === Date.UTC(2025, 11, 31, 15, 30, 45));
  assert.ok(!parseExpiry("20250230").ok);
  assert.ok(!parseExpiry("2025123").ok);
  const expired = parseOptions('expiry-time="20200101"', NOW);
  assert.ok(expired.ok && expired.options[0].expired);
  const future = parseOptions('expiry-time="20300101Z"', NOW);
  assert.ok(future.ok && !future.options[0].expired);
  const edge = parseOptions('expiry-time="20261030"', NOW);
  assert.ok(edge.ok && !edge.options[0].expired && /within a day/.test(edge.options[0].detail ?? ""));
});
test("Effective permissions are applied in order", () => {
  const r = parseOptions("restrict,pty", NOW);
  assert.ok(r.ok);
  const e = effectivePermissions(r.options);
  assert.deepEqual(e, { pty: true, portForwarding: false, agentForwarding: false, x11Forwarding: false, userRc: false });
  const r2 = parseOptions("pty,restrict", NOW);
  assert.ok(r2.ok);
  assert.equal(effectivePermissions(r2.options).pty, false);
  const r3 = parseOptions("no-port-forwarding,no-X11-forwarding", NOW);
  assert.ok(r3.ok);
  assert.deepEqual(effectivePermissions(r3.options), { pty: true, portForwarding: false, agentForwarding: true, x11Forwarding: false, userRc: true });
});
test("authorized_keys line with options", () => {
  const ed = vectors.ed25519.line;
  const l = parseLine(`from="10.1.2.0/24",command="/usr/local/bin/backup",no-pty ${ed} backup@host`, 3, NOW);
  assert.equal(l.error, null);
  assert.equal(l.options.length, 3);
  assert.equal(l.comment, "backup@host");
  assert.equal(l.sha256, vectors.ed25519.sha256);
  assert.ok(l.findings.some((f) => f.tone === "warn" && /forwarding/.test(f.text) && /restrict/.test(f.text)));
  assert.equal(l.lineNumber, 3);
  const quoted = parseLine(`command="echo hello world" ${ed}`, 1, NOW);
  assert.equal(quoted.error, null);
  assert.equal(quoted.options[0].value, "echo hello world");
  const restricted = parseLine(`restrict,command="rrsync /srv" ${ed}`, 1, NOW);
  assert.ok(!restricted.findings.some((f) => /still allowed/.test(f.text)));
});
test("Line level errors", () => {
  const ed = vectors.ed25519.line.split(" ")[1];
  const mismatch = parseLine(`ssh-rsa ${ed}`, 1, NOW);
  assert.match(mismatch.error ?? "", /says ssh-rsa but the key data inside is ssh-ed25519/);
  const sigName = parseLine(`rsa-sha2-512 ${vectors.rsa2048.line.split(" ")[1]}`, 1, NOW);
  // sshkey_type_from_name() accepts rsa-sha2-512 as a name for KEY_RSA, so OpenSSH reads the line.
  assert.equal(sigName.error, null);
  assert.ok(sigName.findings.some((f) => /signature algorithm name that OpenSSH also accepts/.test(f.text)));
  const noType = parseLine(ed, 1, NOW);
  assert.match(noType.error ?? "", /key type field is missing/);
  const truncated = parseLine(`ssh-ed25519 ${ed.slice(0, 40)}`, 1, NOW);
  assert.ok(truncated.error);
  const noData = parseLine("ssh-ed25519", 1, NOW);
  assert.ok(noData.error);
  const dup = parseLine(`command="a",command="b" ${vectors.ed25519.line}`, 1, NOW);
  assert.ok(dup.findings.some((f) => f.tone === "danger" && /multiple command/.test(f.text)));
  const unterminated = parseLine(`command="echo ${vectors.ed25519.line}`, 1, NOW);
  assert.ok(unterminated.error);
});
test("Trailing data and missing padding", () => {
  const blob = fromBase64(vectors.ed25519.line.split(" ")[1]);
  assert.ok(blob.ok);
  if (!blob.ok) return;
  const extra = new Uint8Array(blob.bytes.length + 3);
  extra.set(blob.bytes);
  const d = decodeKeyBlob(extra);
  assert.ok(d.ok && d.key.problems.some((p) => /trailing/.test(p)));
  // An ecdsa-sha2-nistp256 blob is 104 bytes, so its Base64 ends in one =.
  // (Ed25519 blobs are 51 bytes, a multiple of 3, so they carry no padding.)
  const p256data = vectors.p256.line.split(" ")[1];
  assert.ok(p256data.endsWith("=") && !vectors.ed25519.line.split(" ")[1].includes("="));
  const unpadded = parseLine(`ecdsa-sha2-nistp256 ${p256data.replace(/=+$/, "")}`, 1, NOW);
  assert.ok(unpadded.findings.some((f) => /padding/.test(f.text)));
  assert.equal(unpadded.sha256, vectors.p256.sha256);
  const padded = parseLine(vectors.ed25519.line, 1, NOW);
  assert.ok(!padded.findings.some((f) => /padding/.test(f.text)));
});
test("Hostile blobs never throw", () => {
  let seed = 99;
  for (let t = 0; t < 3000; t++) {
    const n = t % 80;
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff;
    if (t % 2 === 0 && n > 15) {
      b.set([0, 0, 0, 11], 0);
      b.set(enc("ssh-ed25519"), 4);
    }
    decodeKeyBlob(b);
  }
  const huge = new Uint8Array(20000);
  assert.ok(!decodeKeyBlob(huge).ok);
});

/* ----------------------------------------------------- whole input */
test("inspectKeys: comments, blanks, duplicates, known_hosts, private keys", () => {
  const text = [
    "# deploy keys",
    "",
    vectors.ed25519.line + " first",
    `restrict ${vectors.ed25519.line} again`,
    "|1|F1E1KeoE/eEWhi10WpGv4OdiO6Y=|3988QV0VE8wmZL7suNrYQLITLCg= " + vectors.p256.line.split(" ").slice(0, 2).join(" "),
    "@cert-authority *.example.com " + vectors.ed25519.line,
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    "b3BlbnNzaC1rZXktdjEAAAAABG5vbmU=",
    "-----END OPENSSH PRIVATE KEY-----",
    vectors.rsa2048.line,
  ].join("\n");
  const r = inspectKeys(text, NOW);
  assert.equal(r.commentLines, 1);
  assert.equal(r.blankLines, 1);
  assert.equal(r.lines.length, 6);
  assert.ok(r.lines[1].findings.some((f) => /same key is on line 3/.test(f.text)));
  assert.equal(r.lines[2].source, "known_hosts");
  assert.ok(r.lines[2].findings.some((f) => /hashed/.test(f.text)));
  assert.equal(r.lines[3].marker, "@cert-authority");
  assert.equal(r.lines[3].hosts, "*.example.com");
  assert.match(r.lines[4].error ?? "", /private key/);
  assert.equal(r.lines[5].key?.type, "ssh-rsa");
  assert.equal(r.lines[5].lineNumber, 10);
});
test("RFC 4716 block", () => {
  const body = vectors.ed25519.line.split(" ")[1];
  const text = [
    "---- BEGIN SSH2 PUBLIC KEY ----",
    'Comment: "my key \\',
    'continued"',
    body.slice(0, 40),
    body.slice(40),
    "---- END SSH2 PUBLIC KEY ----",
  ].join("\n");
  const r = inspectKeys(text, NOW);
  assert.equal(r.lines.length, 1);
  const l = r.lines[0];
  assert.equal(l.source, "rfc4716");
  assert.equal(l.error, null);
  assert.equal(l.comment, "my key continued");
  assert.equal(l.sha256, vectors.ed25519.sha256);
});
test("PEM public key gets a conversion hint", () => {
  const r = inspectKeys("-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----", NOW);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0].error ?? "", /ssh-keygen -i -m PKCS8/);
});
test("Line cap and empty input", () => {
  const many = Array.from({ length: MAX_LINES + 5 }, () => vectors.ed25519.line).join("\n");
  const r = inspectKeys(many, NOW);
  assert.equal(r.lines.length, MAX_LINES);
  assert.ok(r.capNote);
  const e = inspectKeys("   \n\n", NOW);
  assert.equal(e.lines.length, 0);
});
test("Fingerprint helpers format", () => {
  const blob = enc("x");
  assert.match(fingerprintSha256(blob), /^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.match(fingerprintMd5(blob), /^MD5:([0-9a-f]{2}:){15}[0-9a-f]{2}$/);
});

test("Option count cap", () => {
  const r = parseOptions("no-pty,".repeat(MAX_OPTIONS + 5) + "restrict", NOW);
  assert.ok(!r.ok && r.options.length === MAX_OPTIONS);
  const l = parseLine("no-pty,".repeat(MAX_OPTIONS + 5) + "restrict " + vectors.ed25519.line, 1, NOW);
  assert.ok(l.error && /More than/.test(l.error));
});

/* =====================================================================
 * Independent verifier cases (added by the verification pass). Vectors
 * come from verify-fixtures/ssh.json, generated with python cryptography
 * and hashlib by a separate script.
 * ===================================================================== */
{
  const V = JSON.parse(
    readFileSync(new URL("./fixtures/verify-fixtures/ssh.json", import.meta.url).pathname, "utf8"),
  );
  const ED = V.keys.ed25519.line.split(" ").slice(0, 2).join(" ");
  const tones = (l: { findings: { tone: string; text: string }[] }, tone: string) => l.findings.filter((f) => f.tone === tone).map((f) => f.text);

  test("verify: SHA-256 and MD5 extra published vectors", () => {
    assert.equal(
      toHex(sha256(enc("abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu"))),
      "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
    );
    assert.equal(toHex(md5(enc("The quick brown fox jumps over the lazy dog"))), "9e107d9d372bb6826bd81d3542a419d6");
    // Every Ed25519 key line starts with the Base64 of uint32 11 and "ssh-ed25519".
    assert.equal(toBase64(new Uint8Array([0, 0, 0, 11, ...enc("ssh-ed25519")])), "AAAAC3NzaC1lZDI1NTE5");
  });

  test("verify: independently generated keys give the hashlib fingerprints and ssh-keygen lines", () => {
    for (const [name, k] of Object.entries(V.keys) as [string, { line: string; type: string; bits: number; label: string; sha256: string; md5: string }][]) {
      const l = parseLine(k.line, 1, NOW);
      assert.equal(l.error, null, name);
      assert.equal(l.key?.type, k.type, name);
      assert.equal(l.key?.bits, k.bits, name);
      assert.equal(l.sha256, k.sha256, name);
      assert.equal(l.md5, k.md5, name);
      assert.equal(l.keygen, `${k.bits} ${k.sha256} no comment (${k.label})`, name);
      assert.equal(l.keygenMd5, `${k.bits} ${k.md5} no comment (${k.label})`, name);
    }
    const weak = parseLine(V.keys.rsa1536.line, 1, NOW);
    assert.ok(tones(weak, "danger").some((t) => /2048/.test(t)));
    const ok = parseLine(V.keys.rsa4096.line, 1, NOW);
    assert.equal(tones(ok, "danger").length, 0);
  });

  test("verify: Ed25519 user certificate decodes and fingerprints as its plain key", () => {
    const c = V.certs.ed25519_user;
    const l = parseLine(c.line, 1, NOW);
    assert.equal(l.error, null);
    assert.equal(l.sha256, c.plain_sha256);
    assert.equal(l.md5, c.plain_md5);
    assert.equal(l.keygen, `256 ${c.plain_sha256} alice-cert (ED25519-CERT)`);
    const cert = l.key!.certificate!;
    assert.equal(cert.serial, c.serial);
    assert.equal(cert.keyId, c.key_id);
    assert.deepEqual(cert.principals, c.principals);
    assert.equal(cert.validAfter, BigInt(c.valid_after));
    assert.equal(cert.validBefore, BigInt(c.valid_before));
    assert.equal(cert.validity, "from 2026-01-01 00:00:00Z to 2027-01-01 00:00:00Z");
    assert.equal(cert.certType, "user");
    assert.equal(cert.caType, c.ca_type);
    assert.equal(cert.caFingerprint, c.ca_sha256);
    assert.equal(cert.signatureAlgorithm, c.sig_alg);
    assert.deepEqual(cert.criticalOptions, [{ label: "force-command", value: "/usr/bin/true" }]);
    assert.deepEqual(cert.extensions.map((e) => e.label), c.extensions);
    assert.equal(tones(l, "danger").length, 0);
  });

  test("verify: ECDSA host certificate with a max serial, no principals and an RSA CA", () => {
    const c = V.certs.p256_host;
    const l = parseLine(c.line, 1, NOW);
    assert.equal(l.error, null);
    assert.equal(l.sha256, c.plain_sha256);
    const cert = l.key!.certificate!;
    assert.equal(cert.serial, "18446744073709551615");
    assert.equal(cert.certType, "host");
    assert.equal(cert.validity, "from the beginning of time to forever");
    assert.equal(cert.caType, "ssh-rsa");
    assert.equal(cert.caFingerprint, c.ca_sha256);
    assert.equal(cert.signatureAlgorithm, "rsa-sha2-512");
    assert.equal(l.key!.label, "ECDSA-CERT");
    assert.ok(tones(l, "warn").some((t) => /no principals/.test(t)));
    assert.ok(!l.findings.some((f) => /signed this certificate with ssh-rsa/.test(f.text)));
  });

  test("verify: compressed ECDSA point is flagged, since OpenSSH reads only uncompressed points", () => {
    const l = parseLine(V.hand.p256_compressed.line, 1, NOW);
    assert.equal(l.sha256, V.hand.p256_compressed.sha256);
    assert.ok(tones(l, "danger").some((t) => /uncompressed/.test(t)));
    const empty = decodeKeyBlob(new Uint8Array([0, 0, 0, 19, ...enc("ecdsa-sha2-nistp256"), 0, 0, 0, 8, ...enc("nistp256"), 0, 0, 0, 0]));
    assert.ok(empty.ok && empty.key.problems.some((p) => /0 bytes and empty/.test(p)));
  });

  test("verify: superfluous mpint zero is flagged and the fingerprint covers the re-encoded key", () => {
    // sshbuf_get_bignum2 strips leading zeros and sshkey_fingerprint_raw hashes
    // to_blob(), which writes the minimal mpint, so the hash differs from the raw blob.
    const l = parseLine(V.hand.rsa_e_leading_zero.line, 1, NOW);
    assert.notEqual(l.sha256, V.hand.rsa_e_leading_zero.sha256);
    assert.ok(tones(l, "danger").some((t) => /superfluous leading zero/.test(t)));
    assert.equal(l.key!.rsaExponent, BigInt(65537));
  });

  test("verify: RFC 4716 block with a continued Comment header", () => {
    const r = inspectKeys(V.hand.rfc4716.text, NOW);
    assert.equal(r.lines.length, 1);
    const l = r.lines[0];
    assert.equal(l.source, "rfc4716");
    assert.equal(l.sha256, V.hand.rfc4716.sha256);
    assert.equal(l.comment, V.hand.rfc4716.comment);
    assert.equal(l.keygen, null);
  });

  test("verify: permitopen and permitlisten ports follow auth-options.c (1 to 65535 or *)", () => {
    const p = (f: string) => parseOptions(f, NOW).options[0];
    assert.ok(p('permitopen="db.internal:0"').error);
    assert.equal(p('permitopen="db.internal:1"').error, null);
    assert.equal(p('permitopen="[2001:db8::1]:5432"').error, null);
    assert.equal(p('permitopen="db.internal:*"').error, null);
    assert.ok(p('permitopen="db.internal:65536"').error);
    assert.ok(p('permitopen="5432"').error);
    assert.ok(p('permitlisten="0"').error);
    assert.equal(p('permitlisten="8080"').detail, "Allows ssh -R to listen on any address port 8080.");
    assert.equal(p('permitlisten="localhost:8080"').error, null);
  });

  test("verify: sshd option spellings and repeat rules", () => {
    const nv = parseOptions("no-verify-required", NOW);
    assert.ok(nv.ok && nv.options[0].canonical === "no-verify-required" && nv.options[0].error === null);
    const upper = parseOptions("NO-PTY,Restrict", NOW);
    assert.ok(upper.ok && upper.options.every((o) => o.canonical !== null));
    assert.equal(parseOptions('tunnel="any"', NOW).options[0].error, null);
    assert.equal(parseOptions('tunnel="2147483645"', NOW).options[0].error, null);
    assert.ok(parseOptions('tunnel="2147483646"', NOW).options[0].error);
    assert.ok(parseOptions('tunnel="tun0"', NOW).options[0].error);
    const z = parseExpiry("20300101z");
    assert.ok(z.ok && z.utc);
    const twoFrom = parseLine(`from="10.0.0.1",from="10.0.0.2" ${ED}`, 1, NOW);
    assert.ok(tones(twoFrom, "danger").some((t) => /More than one from=/.test(t)));
    const twoPrincipals = parseLine(`cert-authority,principals="a",principals="b" ${ED}`, 1, NOW);
    assert.ok(tones(twoPrincipals, "danger").some((t) => /More than one principals=/.test(t)));
    const twoOpen = parseLine(`permitopen="a:1",permitopen="b:2" ${ED}`, 1, NOW);
    assert.equal(tones(twoOpen, "danger").length, 0);
    const unknown = parseOptions("no-restrict", NOW).options[0];
    assert.ok(unknown.error && /bad key options/.test(unknown.explanation));
  });

  test("verify: the ssh-keygen -lf comment follows do_fingerprint()", () => {
    const fp = V.keys.ed25519.sha256;
    // Options with no trailing comment: the options field stands in for it.
    assert.equal(parseLine(`from="10.0.0.1" ${ED}`, 1, NOW).keygen, `256 ${fp} from="10.0.0.1" (ED25519)`);
    // A trailing comment replaces it, unless it starts with #.
    assert.equal(parseLine(`restrict ${ED} ops key`, 1, NOW).keygen, `256 ${fp} ops key (ED25519)`);
    assert.equal(parseLine(`restrict ${ED} #note`, 1, NOW).keygen, `256 ${fp} restrict (ED25519)`);
    assert.equal(parseLine(`${ED} #note`, 1, NOW).keygen, `256 ${fp} no comment (ED25519)`);
    // known_hosts: host list, or the trailing comment when there is one.
    assert.equal(parseLine(`host.example.com ${ED}`, 1, NOW).keygen, `256 ${fp} host.example.com (ED25519)`);
    assert.equal(parseLine(`host.example.com ${ED} added 2026`, 1, NOW).keygen, `256 ${fp} added 2026 (ED25519)`);
    // Marker lines are skipped by ssh-keygen -lf, so no line is claimed for them.
    const ca = parseLine(`@cert-authority *.example.com ${ED}`, 1, NOW);
    assert.equal(ca.source, "known_hosts");
    assert.equal(ca.sha256, fp);
    assert.equal(ca.keygen, null);
    assert.ok(parseLine("@revoked *.example.com", 1, NOW).error?.includes("no key"));
  });

  test("verify: Base64 that OpenSSH's b64_pton refuses gives a danger finding and no ssh-keygen line", () => {
    // The P-256 blob is 104 bytes, so its Base64 ends in one = and the last
    // character before it carries 2 spare bits.
    const [type, data] = V.keys.p256.line.split(" ");
    assert.ok(data.endsWith("=") && !data.endsWith("=="));
    const unpadded = parseLine(`${type} ${data.replace(/=+$/, "")}`, 1, NOW);
    assert.equal(unpadded.sha256, V.keys.p256.sha256);
    assert.ok(tones(unpadded, "danger").some((t) => /padding/.test(t)));
    assert.equal(unpadded.keygen, null);
    const B = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const last = data[data.length - 2];
    const bent = data.slice(0, -2) + B[B.indexOf(last) | 1] + "=";
    assert.notEqual(bent, data);
    const r = fromBase64(bent);
    assert.ok(r.ok && !r.canonical);
    const nc = parseLine(`${type} ${bent}`, 1, NOW);
    assert.equal(nc.sha256, V.keys.p256.sha256);
    assert.ok(tones(nc, "danger").some((t) => /bits that are not zero/.test(t)));
    assert.equal(nc.keygen, null);
    const good = fromBase64(data);
    assert.ok(good.ok && good.canonical && good.padded);
    // A blob whose length is a multiple of 3 has no padding and needs none.
    const ed = fromBase64(ED.split(" ")[1]);
    assert.ok(ed.ok && ed.padded && ed.canonical);
  });

  test("verify: comments with line separator characters still parse", () => {
    const l = parseLine(`${ED} alice laptop\rx`, 1, NOW);
    assert.equal(l.error, null);
    assert.equal(l.sha256, V.keys.ed25519.sha256);
    assert.equal(l.comment, "alice laptop\rx");
  });

  test("verify: hostile whitespace and length stay fast", () => {
    let t = performance.now();
    inspectKeys("a" + " ".repeat(500_000) + "b", NOW);
    inspectKeys("a" + " \t".repeat(250_000) + "b", NOW);
    inspectKeys('command="' + "x".repeat(500_000) + '" ' + ED, NOW);
    assert.ok(performance.now() - t < 1500, `took ${performance.now() - t} ms`);
    t = performance.now();
    const many = inspectKeys((ED + "\n").repeat(1200), NOW);
    assert.equal(many.lines.length, MAX_LINES);
    assert.ok(many.capNote);
    assert.equal(many.lines.filter((l) => l.findings.some((f) => /same key is on line 1/.test(f.text))).length, MAX_LINES - 1);
  });
}

/* ------------------------------------------ independent verifier cases */
{
  const V = JSON.parse(readFileSync(`${FIX}/vectors.json`, "utf8"));
  const b64of = (line: string) => line.split(/\s+/)[1];
  const nodeSha = (buf: Uint8Array) => "SHA256:" + createHash("sha256").update(buf).digest("base64").replace(/=+$/, "");
  const nodeMd5 = (buf: Uint8Array) => "MD5:" + (createHash("md5").update(buf).digest("hex").match(/../g) as string[]).join(":");
  const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
  const cat = (...xs: Uint8Array[]) => { const o = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of xs) { o.set(x, i); i += x.length; } return o; };
  const sstr = (b: Uint8Array) => cat(u32(b.length), b);
  /** Split a plain blob into its top level strings. */
  const fieldsOf = (blob: Uint8Array) => { const out: Uint8Array[] = []; let p = 0; while (p < blob.length) { const n = new DataView(blob.buffer, blob.byteOffset + p).getUint32(0); out.push(blob.subarray(p + 4, p + 4 + n)); p += 4 + n; } return out; };

  test("Verifier: fingerprints of plain keys equal node:crypto over the decoded blob", () => {
    for (const k of ["rsa2048", "rsa1024", "rsa3072_e3", "dsa1024", "p256", "p384", "p521", "ed25519", "sk_ecdsa", "sk_ed25519"]) {
      const blob = new Uint8Array(Buffer.from(b64of(V[k].line), "base64"));
      const l = parseLine(V[k].line, 1, NOW);
      assert.equal(l.sha256, nodeSha(blob), k);
      assert.equal(l.md5, nodeMd5(blob), k);
      assert.equal(l.sha256, V[k].sha256, k);
    }
  });

  test("Verifier: GitHub's published host key fingerprints", () => {
    // https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
    const r = inspectKeys(
      [
        "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
        "github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=",
      ].join("\n"),
      NOW,
    );
    assert.equal(r.lines[0].sha256, "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU");
    assert.equal(r.lines[1].sha256, "SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM");
    assert.equal(r.lines[0].keygen, "256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)");
    assert.equal(r.lines[0].source, "known_hosts");
  });

  test("Verifier: rsa-sha2-256 type name inside the blob is fingerprinted as ssh-rsa (to_blob force_plain)", () => {
    const blob = new Uint8Array(Buffer.from(b64of(V.rsa2048.line), "base64"));
    const f = fieldsOf(blob);
    const alias = cat(sstr(enc("rsa-sha2-256")), sstr(f[1]), sstr(f[2]));
    const d = decodeKeyBlob(alias);
    assert.ok(d.ok);
    if (d.ok) {
      assert.equal(d.key.type, "rsa-sha2-256");
      assert.equal(fingerprintSha256(d.key.plainBlob), V.rsa2048.sha256);
    }
    const l = parseLine(`ssh-rsa ${toBase64(alias)} c`, 1, NOW);
    assert.equal(l.error, null);
    assert.equal(l.sha256, V.rsa2048.sha256);
  });

  test("Verifier: an overlong mpint is flagged and the fingerprint uses the minimal form", () => {
    const blob = new Uint8Array(Buffer.from(b64of(V.rsa2048.line), "base64"));
    const f = fieldsOf(blob);
    assert.equal(toHex(f[1]), "010001");
    const padded = cat(sstr(enc("ssh-rsa")), sstr(new Uint8Array([0, 1, 0, 1])), sstr(f[2]));
    const l = parseLine(`ssh-rsa ${toBase64(padded)}`, 1, NOW);
    assert.equal(l.sha256, V.rsa2048.sha256);
    assert.ok(l.findings.some((x) => /superfluous leading zero/.test(x.text)));
    assert.equal(l.key?.rsaExponent, BigInt(65537));
  });

  test("Verifier: certificate fingerprints equal the hash of the rebuilt plain key", () => {
    for (const k of ["cert_ed25519", "cert_rsa_host"]) {
      const blob = new Uint8Array(Buffer.from(b64of(V[k].line), "base64"));
      const l = parseLine(V[k].line, 1, NOW);
      assert.notEqual(l.sha256, nodeSha(blob), k);
      assert.equal(l.sha256, V[k].sha256, k);
    }
  });

  test("Verifier: ECDSA curve mismatch between the line and the blob", () => {
    const l = parseLine(`ecdsa-sha2-nistp384 ${b64of(V.p256.line)}`, 1, NOW);
    assert.match(l.error ?? "", /says ecdsa-sha2-nistp384 but the key data inside is ecdsa-sha2-nistp256/);
    assert.equal(l.keygen, null);
  });

  test("Verifier: option grammar from auth-options.c", () => {
    const ed = b64of(V.ed25519.line);
    const upper = parseLine(`RESTRICT,PTY ssh-ed25519 ${ed}`, 1, NOW);
    assert.equal(upper.error, null);
    assert.equal(upper.effective?.pty, true);
    assert.equal(upper.effective?.portForwarding, false);
    const trailing = parseLine(`no-pty, ssh-ed25519 ${ed}`, 1, NOW);
    assert.ok(trailing.error);
    const esc = parseOptions('command="echo \\"hi\\""', NOW);
    assert.ok(esc.ok);
    assert.equal(esc.options[0].value, 'echo "hi"');
    assert.equal(parseOptions('permitlisten="8080"', NOW).options[0].error, null);
    assert.equal(parseOptions('permitopen="[::1]:22"', NOW).options[0].error, null);
    assert.ok(parseOptions('permitopen="host:0"', NOW).options[0].error);
    assert.ok(parseOptions('permitopen="host:65536"', NOW).options[0].error);
    assert.equal(parseOptions('tunnel="2147483645"', NOW).options[0].error, null);
    assert.ok(parseOptions('tunnel="2147483646"', NOW).options[0].error);
    assert.equal(parseOptions("no-pty=\"x\"", NOW).options[0].error, "no-pty is a flag and takes no value.");
    assert.ok(!parseExpiry("20250229").ok);
    assert.ok(parseExpiry("20240229").ok);
    assert.ok(!parseExpiry("202401011").ok);
    const e = parseExpiry("20240101120000Z");
    assert.ok(e.ok && e.ms === Date.UTC(2024, 0, 1, 12, 0, 0));
  });

  test("Verifier: hostile input never throws", () => {
    const inputs = [
      "", " ", "\t\t", "\n\n\n", "ssh-ed25519", "ssh-ed25519 ", "ssh-ed25519 AAAA", "ssh-ed25519 ====", "ssh-ed25519 A",
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ", "\u{1F510} ssh-ed25519 AAAA", "from=\"é\" ssh-ed25519 AAAA",
      "command=\"unterminated ssh-ed25519 AAAA", "@revoked", "@cert-authority * ", "|1|abc|def ssh-rsa",
      "ssh-ed25519 " + "A".repeat(200_000), "x".repeat(600_000), ",".repeat(5000) + " ssh-ed25519 AAAA",
      "a=\"\"".repeat(1000) + " k", "---- BEGIN SSH2 PUBLIC KEY ----", "---- BEGIN SSH2 PUBLIC KEY ----\nComment: \\\n---- END SSH2 PUBLIC KEY ----",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----", "  \r\r",
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP////////////////////////////////////////8=",
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAAQ==", "ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB/////w==",
    ];
    for (const t of inputs) {
      const r = inspectKeys(t, NOW);
      for (const l of r.lines) assert.ok(l.error !== null || l.key !== null || l.findings.length >= 0);
    }
    assert.equal(inspectKeys("", NOW).lines.length, 0);
    const big = inspectKeys("x".repeat(600_000), NOW);
    assert.ok(big.capNote);
    const neg = parseLine("ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB/////w==", 1, NOW);
    assert.ok(neg.error);
  });
}


/* =====================================================================
 * Second independent verifier pass (verify2). Vectors come from
 * v2-fixtures/v2-ssh.json: keys generated by openssl, wire blobs built by a
 * separate python script that parses the DER by hand, fingerprints from
 * hashlib. Boundary cases use node:crypto.
 * ===================================================================== */
{
  const V2 = JSON.parse(
    readFileSync(new URL("./fixtures/v2-fixtures/v2-ssh.json", import.meta.url).pathname, "utf8"),
  ) as Record<string, { line: string; bits: number; e?: number; sha256: string; md5: string; label: string }>;
  const NOW2 = Date.UTC(2026, 10, 4, 12, 0, 0);
  const ed = V2.ed.line.split(" ").slice(0, 2).join(" ");
  const tones2 = (l: { findings: { tone: string; text: string }[] }, tone: string) => l.findings.filter((f) => f.tone === tone).map((f) => f.text);
  const u32b = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
  const catb = (...xs: Uint8Array[]) => { const o = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of xs) { o.set(x, i); i += x.length; } return o; };
  const sstr2 = (b: Uint8Array) => catb(u32b(b.length), b);
  const nodeSha2 = (buf: Uint8Array) => "SHA256:" + createHash("sha256").update(buf).digest("base64").replace(/=+$/, "");
  const bigToBytes = (v: bigint) => { let h = v.toString(16); if (h.length % 2) h = "0" + h; return Uint8Array.from(h.match(/../g) as string[], (x) => parseInt(x, 16)); };
  const mp = (v: bigint) => { const b = bigToBytes(v); return sstr2(b[0] & 0x80 ? catb(new Uint8Array([0]), b) : b); };
  const rsaLine = (bits: number, e = BigInt(65537)) => {
    const n = (BigInt(1) << BigInt(bits - 1)) | BigInt(1);
    const blob = catb(sstr2(enc("ssh-rsa")), mp(e), mp(n));
    return { line: `ssh-rsa ${toBase64(blob)} t${bits}`, blob };
  };

  test("verify2: openssl generated keys match hashlib fingerprints and the ssh-keygen -l lines", () => {
    for (const [name, k] of Object.entries(V2)) {
      const l = parseLine(k.line, 1, NOW2);
      assert.equal(l.error, null, name);
      assert.equal(l.key?.bits, k.bits, name);
      assert.equal(l.sha256, k.sha256, name);
      assert.equal(l.md5, k.md5, name);
      assert.equal(l.keygen, `${k.bits} ${k.sha256} ${name} (${k.label})`, name);
      assert.equal(l.keygenMd5, `${k.bits} ${k.md5} ${name} (${k.label})`, name);
    }
    const e3 = parseLine(V2.rsa2048e3.line, 1, NOW2);
    assert.equal(e3.key?.rsaExponent, BigInt(3));
    assert.equal(tones2(e3, "danger").length, 0);
    const dsa = parseLine(V2.dsa.line, 1, NOW2);
    assert.equal(dsa.key?.family, "dsa");
    assert.ok(tones2(dsa, "danger").some((t) => /DSA/.test(t)));
    assert.equal(tones2(parseLine(V2.rsa3072.line, 1, NOW2), "danger").length, 0);
  });

  test("verify2: RSA size boundaries around 1024, 2048 and the OpenSSH 16384 bit ceiling", () => {
    const want: [number, "refused" | "weak" | "ok" | "toolarge"][] = [
      [1023, "refused"],
      [1024, "weak"],
      [2047, "weak"],
      [2048, "ok"],
      [4096, "ok"],
      [16384, "ok"],
      [16385, "toolarge"],
    ];
    for (const [bits, kind] of want) {
      const { line, blob } = rsaLine(bits);
      const l = parseLine(line, 1, NOW2);
      assert.equal(l.key?.bits, bits, String(bits));
      assert.equal(l.sha256, nodeSha2(blob), String(bits));
      const danger = tones2(l, "danger").join("\n");
      if (kind === "refused") assert.ok(/RequiredRSASize of 1024/.test(danger), String(bits));
      else if (kind === "weak") assert.ok(/2048 bit minimum/.test(danger) && !/RequiredRSASize/.test(danger), String(bits));
      else if (kind === "ok") assert.equal(danger, "", String(bits));
      else assert.ok(/larger than 16384/.test(danger), String(bits));
    }
    // Exponents that cannot work are flagged, 3 and 65537 are not.
    for (const [e, bad] of [[BigInt(1), true], [BigInt(2), true], [BigInt(3), false], [BigInt(65537), false], [BigInt(65538), true]] as const) {
      const l = parseLine(rsaLine(2048, e).line, 1, NOW2);
      assert.equal(tones2(l, "danger").some((t) => /exponent/.test(t)), bad, `e=${e}`);
    }
  });

  test("verify2: look-alike spaces and a byte order mark give a precise error and the cleaned key's details", () => {
    const data = ed.split(" ")[1];
    const fp = V2.ed.sha256;
    const cases: [string, string, RegExp][] = [
      [`ssh-ed25519 ${data} me`, "U+00A0 (no-break space)", /character 12\b/],
      [`﻿ssh-ed25519 ${data} me`, "U+FEFF (byte order mark)", /character 1\b/],
      [`ssh-ed25519　${data}`, "U+3000 (ideographic space)", /character 12\b/],
      [`ssh-ed25519​ ${data}`, "U+200B (zero width space)", /character 12\b/],
      [`ssh-ed25519 ${data} me`, "U+00A0 (no-break space)", /character 81\b/],
      [`restrict, no-pty ${ed}`, "U+00A0", /character 10\b/],
    ];
    for (const [text, name, where] of cases) {
      const l = parseLine(text, 1, NOW2);
      assert.ok(l.error && l.error.includes(name), `${JSON.stringify(text)}: ${l.error}`);
      assert.ok(where.test(l.error!), l.error!);
      assert.equal(l.sha256, fp, JSON.stringify(text));
      assert.equal(l.keygen, null);
      assert.equal(l.keygenMd5, null);
    }
    // A look-alike space inside a comment, or inside a quoted option value, does not stop sshd and is not flagged.
    assert.equal(parseLine(`${ed} my laptop`, 1, NOW2).error, null);
    assert.equal(parseLine(`command="echo hi" ${ed}`, 1, NOW2).error, null);
    // When something else is also wrong, the original message stands.
    const other = parseLine(`ssh-ed25519 ${data.slice(0, 20)} me`, 1, NOW2);
    assert.ok(other.error && !/U\+00A0/.test(other.error));
    // A BOM before a comment or a blank line is not a key line, and an unusable line is not a duplicate.
    const r = inspectKeys(`﻿# my keys\n﻿\n﻿${ed} first\n${ed} second\n`, NOW2);
    assert.equal(r.commentLines, 1);
    assert.equal(r.blankLines, 2); // the BOM only row, and the empty row after the final newline
    assert.equal(r.lines.length, 2);
    assert.ok(r.lines[0].error);
    assert.equal(r.lines[1].error, null);
    assert.equal(r.lines[1].findings.some((f) => /same key/.test(f.text)), false);
    // Plain spaces and tabs between fields are what sshd accepts.
    assert.equal(parseLine(`ssh-ed25519\t${data}\tme`, 1, NOW2).error, null);
    assert.equal(parseLine(`ssh-ed25519  ${data}   me  `.trim(), 1, NOW2).comment, "me");
  });

  test("verify2: restrict is order dependent, as sshd applies the options in sequence", () => {
    const eff = (f: string) => effectivePermissions(parseOptions(f, NOW2).options);
    assert.deepEqual(eff("restrict,pty"), { pty: true, portForwarding: false, agentForwarding: false, x11Forwarding: false, userRc: false });
    assert.equal(eff("pty,restrict").pty, false);
    assert.equal(eff("restrict,pty,no-pty").pty, false);
    assert.equal(eff("no-pty,pty").pty, true);
    assert.deepEqual(eff("restrict,port-forwarding,X11-forwarding,agent-forwarding,user-rc"), { pty: false, portForwarding: true, agentForwarding: true, x11Forwarding: true, userRc: true });
    assert.deepEqual(eff("command=\"x\""), { pty: true, portForwarding: true, agentForwarding: true, x11Forwarding: true, userRc: true });
    assert.equal(eff("NO-X11-FORWARDING").x11Forwarding, false);
  });

  test("verify2: from= host name patterns are told apart from addresses", () => {
    const detail = (v: string) => parseOptions(`from="${v}"`, NOW2).options[0].detail ?? "";
    for (const v of ["10.0.0.0/8", "10.0.0.0/8,!10.1.0.0/16", "192.168.*", "2001:db8::/32", "*", "!203.0.113.7", "fe80::1"]) assert.ok(!/UseDNS/.test(detail(v)), v);
    for (const v of ["*.example.com", "bastion", "a.b.c", "dead.beef", "!evil.example.com", "10.0.0.0/8,host.example.org"]) assert.ok(/UseDNS yes/.test(detail(v)), v);
    assert.ok(parseOptions('from=""', NOW2).options[0].error);
  });

  test("verify2: expiry-time follows sshd timespec", () => {
    for (const v of ["20301231", "203012312359", "20301231235959", "20301231Z", "203012312359z", "20301231235959Z"]) assert.equal(parseExpiry(v).ok, true, v);
    for (const v of ["2030123", "2030-12-31", "20301231235", "203012312359590", "20300230", "20301301", "203012312460", "20301231236000", "Z", "", "20301231ZZ"]) assert.equal(parseExpiry(v).ok, false, v);
    const utc = parseExpiry("20301231235959Z");
    assert.ok(utc.ok && utc.ms === Date.UTC(2030, 11, 31, 23, 59, 59) && utc.utc);
    const local = parseExpiry("20301231");
    assert.ok(local.ok && !local.utc && /server local time/.test(local.text));
    const o = parseOptions('expiry-time="20301231"', NOW2).options[0];
    assert.equal(o.expired, false);
    assert.equal(parseOptions('expiry-time="20260101"', NOW2).options[0].expired, true);
    // Within 14 hours of the boundary the server's zone decides, so it is neither called expired nor safe.
    const edge = parseOptions('expiry-time="20261104"', NOW2).options[0];
    assert.equal(edge.expired, false);
    assert.ok(/within a day/.test(edge.detail ?? ""));
  });

  test("verify2: curve and type mismatches, aliases, and a certificate blob under a plain type", () => {
    const rsa = V2.rsa3072.line.split(" ");
    const alias = parseLine(`rsa-sha2-512 ${rsa[1]} x`, 1, NOW2);
    assert.equal(alias.error, null);
    assert.equal(alias.sha256, V2.rsa3072.sha256);
    assert.ok(alias.findings.some((f) => f.tone === "info" && /rsa-sha2-512/.test(f.text)));
    assert.equal(alias.keygen, `3072 ${V2.rsa3072.sha256} x (RSA)`);
    const mismatch = parseLine(`ssh-ed25519 ${rsa[1]}`, 1, NOW2);
    assert.ok(mismatch.error && /ssh-ed25519/.test(mismatch.error) && /ssh-rsa/.test(mismatch.error));
    assert.equal(mismatch.keygen, null);
    // ecdsa-sha2-nistp256 type with a nistp384 curve string and a 65 byte point.
    const point = catb(new Uint8Array([4]), new Uint8Array(64).fill(7));
    const wrongCurve = catb(sstr2(enc("ecdsa-sha2-nistp256")), sstr2(enc("nistp384")), sstr2(point));
    const l = parseLine(`ecdsa-sha2-nistp256 ${toBase64(wrongCurve)}`, 1, NOW2);
    assert.ok(tones2(l, "danger").some((t) => /nistp384/.test(t) && /nistp256/.test(t)));
    // 66 byte coordinates for P-521.
    const p521 = catb(sstr2(enc("ecdsa-sha2-nistp521")), sstr2(enc("nistp521")), sstr2(catb(new Uint8Array([4]), new Uint8Array(132).fill(9))));
    const l521 = parseLine(`ecdsa-sha2-nistp521 ${toBase64(p521)}`, 1, NOW2);
    assert.equal(l521.error, null);
    assert.equal(l521.key?.bits, 521);
    assert.equal(l521.sha256, nodeSha2(p521));
    assert.equal(tones2(l521, "danger").length, 0);
    // An Ed25519 key of 31 bytes is flagged.
    const short = catb(sstr2(enc("ssh-ed25519")), sstr2(new Uint8Array(31)));
    assert.ok(tones2(parseLine(`ssh-ed25519 ${toBase64(short)}`, 1, NOW2), "danger").some((t) => /exactly 32 bytes/.test(t)));
  });

  test("verify2: authorized_keys with a mix of lines reports per line and counts", () => {
    const text = [
      "# comment",
      "",
      V2.p256.line,
      `no-pty,command="/bin/true" ${V2.p384.line}`,
      `from="10.0.0.0/8",bogus-option ${ed}`,
      V2.dsa.line,
      "ssh-rsa AAAA",
      `${ed} dup`,
      `${ed} dup2`,
    ].join("\r\n");
    const r = inspectKeys(text, NOW2);
    assert.equal(r.commentLines, 1);
    assert.equal(r.blankLines, 1);
    assert.equal(r.lines.length, 7);
    assert.deepEqual(r.lines.map((l) => l.lineNumber), [3, 4, 5, 6, 7, 8, 9]);
    assert.equal(r.lines[0].error, null);
    assert.ok(r.lines[1].findings.some((f) => /command= is set but port forwarding/.test(f.text)));
    assert.ok(r.lines[2].error || r.lines[2].findings.some((f) => f.tone === "danger" && /Unknown option/.test(f.text)));
    assert.ok(r.lines[3].findings.some((f) => /DSA/.test(f.text)));
    assert.ok(r.lines[4].error);
    assert.equal(r.lines[6].findings.some((f) => /same key is on line 8/.test(f.text)), true);
  });

  test("verify2: odd input never throws and stays quick", () => {
    const junk = [
      "\u0000", "‮", "ssh-ed25519 \u0000", "😀 😀", "\ud800", "ssh-rsa " + " ".repeat(5000), "﻿".repeat(5000),
      "ssh-ed25519 ".repeat(2000), "　".repeat(20000) + ed, "restrict,".repeat(30) + " " + ed,
    ];
    const t = performance.now();
    for (const j of junk) {
      const r = inspectKeys(j, NOW2);
      for (const l of r.lines) assert.ok(l.error !== null || l.key !== null);
    }
    assert.ok(performance.now() - t < 1500, `took ${performance.now() - t} ms`);
  });
}

console.log(`ssh-key-inspector: ${passed} tests passed`);
