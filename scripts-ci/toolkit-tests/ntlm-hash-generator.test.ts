import assert from "node:assert";
import {
  md4,
  md4Hex,
  utf16leBytes,
  ntHash,
  bytesToHex,
} from "../../client/src/lib/toolkit/ntlm-hash-generator.ts";

const enc = (s: string) => new TextEncoder().encode(s);

// RFC 1320, appendix A.5, the MD4 test suite.
const MD4_VECTORS: [string, string][] = [
  ["", "31d6cfe0d16ae931b73c59d7e0c089c0"],
  ["a", "bde52cb31de33e46245e05fbdbd6fb24"],
  ["abc", "a448017aaf21d8525fc10ae87aa6729d"],
  ["message digest", "d9130a8164549fe818874806e1c7014b"],
  ["abcdefghijklmnopqrstuvwxyz", "d79e1c308aa5bbcdeea8ed63df412da9"],
  [
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    "043f8582f241db351ce627e153e7f0e4",
  ],
  [
    "12345678901234567890123456789012345678901234567890123456789012345678901234567890",
    "e33b4ddc9c38f2199c3e7b164fcc0536",
  ],
];

for (const [input, want] of MD4_VECTORS) {
  assert.strictEqual(md4Hex(enc(input)), want, `md4(${JSON.stringify(input)})`);
}

// UTF-16LE encoding: ASCII becomes byte then 0x00.
assert.strictEqual(bytesToHex(utf16leBytes("A")), "4100", "utf16le of 'A'");
assert.strictEqual(bytesToHex(utf16leBytes("ab")), "61006200", "utf16le of 'ab'");
// A character above U+00FF keeps both bytes, little-endian. U+00E9 is e-acute.
assert.strictEqual(bytesToHex(utf16leBytes("é")), "e900", "utf16le of e-acute");
// A code point above the BMP becomes a surrogate pair, four bytes.
assert.strictEqual(utf16leBytes("\u{1f600}").length, 4, "astral char is two code units");

// The canonical NT hash reference value.
assert.strictEqual(ntHash("password"), "8846f7eaee8fb117ad06bdd830b7586c", "NT hash of password");
// The empty password has a well-known NT hash (MD4 of zero bytes).
assert.strictEqual(ntHash(""), "31d6cfe0d16ae931b73c59d7e0c089c0", "NT hash of empty");

// md4 returns 16 bytes.
assert.strictEqual(md4(enc("abc")).length, 16, "md4 output is 16 bytes");



/* ---------------------------------------------- verifier's added cases */
import { readFileSync } from "node:fs";

// Vectors produced independently by OpenSSL's MD4 (legacy provider) over
// byte strings of every length 0..129 plus larger sizes, which covers all
// padding boundaries (55, 56, 63, 64, 119, 120, 128).
const fixture = JSON.parse(
  readFileSync(
    "scripts-ci/toolkit-tests/md4-openssl.json",
    "utf8",
  ),
) as { lengths: [number, string][]; nt: [string, string, string][] };

for (const [n, want] of fixture.lengths) {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = ((i * 131 + 17) ^ (i >> 3)) & 0xff;
  assert.strictEqual(md4Hex(b), want, `md4 of ${n} bytes matches OpenSSL`);
}

// NT hashes and UTF-16LE encodings, checked against OpenSSL MD4 over
// Python's utf-16-le encoder. Includes accented Latin, CJK, an astral
// character, surrounding spaces and 127/128 character passwords.
for (const [pw, utf16hex, want] of fixture.nt) {
  assert.strictEqual(bytesToHex(utf16leBytes(pw)), utf16hex, `utf16le of ${JSON.stringify(pw.slice(0, 12))}`);
  assert.strictEqual(ntHash(pw), want, `NT hash of ${JSON.stringify(pw.slice(0, 12))}`);
}

// Published reference values (hashcat example hash for mode 1000 is the NT
// hash of "hashcat").
assert.strictEqual(ntHash("hashcat"), "b4b9b02e6f09a9bd760f388b67351e2b", "hashcat example hash");
assert.strictEqual(ntHash("Password"), "a4f49c406510bdcab6824ee7c30fd852", "NT hash is case sensitive");

// The NT hash differs from plain MD4 of the ASCII bytes.
assert.notStrictEqual(ntHash("password"), md4Hex(enc("password")), "NT hash is not MD4 of ASCII");

// A lone surrogate is encoded as its raw code unit, the way Windows would.
assert.strictEqual(bytesToHex(utf16leBytes("\ud800")), "00d8", "lone surrogate code unit");

// Large input does not throw and is deterministic.
{
  const long = "x".repeat(100000);
  assert.strictEqual(ntHash(long), ntHash(long), "deterministic on long input");
  assert.strictEqual(ntHash(long).length, 32, "32 hex output");
}

console.log("ntlm-hash-generator: all assertions passed");
