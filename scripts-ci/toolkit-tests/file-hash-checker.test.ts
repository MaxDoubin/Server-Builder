import assert from "node:assert";
import { createHash } from "node:crypto";
import {
  Md5,
  md5Hex,
  bytesToHex,
  subtleHex,
  algorithmsForLength,
  otherAlgorithmsForLength,
  parseExpected,
  parseExpectedAll,
  parseExpectedLine,
  findMatch,
  hexEquals,
  MAX_EXPECTED_LINES,
} from "../../client/src/lib/toolkit/file-hash-checker.ts";

const enc = (s: string) => new TextEncoder().encode(s);

// RFC 1321, appendix A.5, the MD5 test suite.
const MD5_VECTORS: [string, string][] = [
  ["", "d41d8cd98f00b204e9800998ecf8427e"],
  ["a", "0cc175b9c0f1b6a831c399e269772661"],
  ["abc", "900150983cd24fb0d6963f7d28e17f72"],
  ["message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
  ["abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
  [
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    "d174ab98d277d9f5a5611c2c9f419d9f",
  ],
  [
    "12345678901234567890123456789012345678901234567890123456789012345678901234567890",
    "57edf4a22be3c955ac49da2e2107b67a",
  ],
];

for (const [input, want] of MD5_VECTORS) {
  assert.strictEqual(md5Hex(enc(input)), want, `md5(${JSON.stringify(input)})`);
}

// Incremental feeding in odd chunk sizes must match the one-shot result.
{
  const data = enc("The quick brown fox jumps over the lazy dog");
  const oneShot = md5Hex(data);
  const h = new Md5();
  for (let i = 0; i < data.length; i += 7) h.update(data.subarray(i, i + 7));
  assert.strictEqual(h.hex(), oneShot, "incremental MD5 matches one-shot");
  // Known value for this classic input.
  assert.strictEqual(oneShot, "9e107d9d372bb6826bd81d3542a419d6", "md5(quick brown fox)");
}

// Padding edge cases cross-checked against Node's own MD5, an independent
// implementation: exactly one block (64 bytes), the 55/56/64 byte padding
// boundaries, and a multi-megabyte buffer where the bit length exceeds the
// low 32 bits only at much larger sizes but the chunked path is exercised.
{
  const nodeMd5 = (b: Uint8Array) => createHash("md5").update(b).digest("hex");
  for (const len of [0, 1, 55, 56, 57, 63, 64, 65, 127, 128, 1000]) {
    const buf = new Uint8Array(len);
    for (let i = 0; i < len; i++) buf[i] = (i * 31 + 7) & 0xff;
    assert.strictEqual(md5Hex(buf), nodeMd5(buf), `md5 of ${len} bytes matches node`);

    // Same bytes fed one at a time must agree.
    const inc = new Md5();
    for (const byte of buf) inc.update(Uint8Array.of(byte));
    assert.strictEqual(inc.hex(), nodeMd5(buf), `byte-at-a-time md5 of ${len} bytes`);
  }

  // A larger buffer fed in 64 KiB chunks.
  const big = new Uint8Array(3 * 1024 * 1024 + 123);
  for (let i = 0; i < big.length; i++) big[i] = (i * 1103515245 + 12345) & 0xff;
  const stream = new Md5();
  for (let i = 0; i < big.length; i += 65536) stream.update(big.subarray(i, i + 65536));
  assert.strictEqual(stream.hex(), nodeMd5(big), "chunked md5 of 3 MiB matches node");
}

// finalizing twice must throw rather than return a wrong value.
{
  const h = new Md5();
  h.update(enc("abc"));
  h.digest();
  assert.throws(() => h.digest(), /finalized/, "double digest throws");
}

// SHA family via Web Crypto. FIPS 180-4 published values.
void (async () => {
  assert.strictEqual(
    await subtleHex("SHA-1", enc("abc")),
    "a9993e364706816aba3e25717850c26c9cd0d89d",
    "sha1(abc)",
  );
  assert.strictEqual(
    await subtleHex("SHA-256", enc("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "sha256(abc)",
  );
  assert.strictEqual(
    await subtleHex("SHA-256", enc("")),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "sha256(empty)",
  );
  assert.strictEqual(
    await subtleHex("SHA-384", enc("abc")),
    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
    "sha384(abc)",
  );
  assert.strictEqual(
    await subtleHex("SHA-512", enc("abc")),
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    "sha512(abc)",
  );
  console.log("file-hash-checker: all assertions passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Length to algorithm mapping.
assert.deepStrictEqual(algorithmsForLength(40), ["SHA-1"], "40 hex is SHA-1");
assert.deepStrictEqual(algorithmsForLength(64), ["SHA-256"], "64 hex is SHA-256");
assert.deepStrictEqual(algorithmsForLength(96), ["SHA-384"], "96 hex is SHA-384");
assert.deepStrictEqual(algorithmsForLength(128), ["SHA-512"], "128 hex is SHA-512");
assert.deepStrictEqual(algorithmsForLength(32), ["MD5"], "32 hex is MD5");
assert.deepStrictEqual(algorithmsForLength(99), [], "unknown length maps to nothing");

// parseExpected: bare, GNU coreutils, BSD tag.
{
  const bare = parseExpected("900150983CD24FB0D6963F7D28E17F72");
  assert.ok(bare && bare.hex === "900150983cd24fb0d6963f7d28e17f72", "bare uppercase digest");
  assert.strictEqual(bare!.filename, null);

  const gnu = parseExpected(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  disk.iso",
  );
  assert.ok(gnu && gnu.hex.length === 64, "gnu two-space line");
  assert.strictEqual(gnu!.filename, "disk.iso");

  const gnuBinary = parseExpected(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad *disk.iso",
  );
  assert.strictEqual(gnuBinary!.filename, "disk.iso", "gnu binary-mode asterisk");

  const bsd = parseExpected("SHA256 (disk.iso) = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.ok(bsd && bsd.algorithm === "SHA-256" && bsd.filename === "disk.iso", "bsd tag line");

  assert.strictEqual(parseExpected(""), null, "empty is null");
  assert.strictEqual(parseExpected("not a hash at all"), null, "prose is null");
}

assert.ok(hexEquals("ABCD", "abcd"), "case-insensitive compare");
assert.ok(!hexEquals("abcd", "abce"), "unequal compare");


/* ---------------------------------------------- verifier's added cases */

// Additional MD5 reference values. One million "a" is the long-message
// vector widely used alongside RFC 1321 (also in NIST CAVP style suites).
{
  const million = new Uint8Array(1_000_000).fill(0x61);
  assert.strictEqual(md5Hex(million), "7707d6ae4e027c70eea2a935c2296f21", "md5(1e6 x 'a')");
  assert.strictEqual(
    md5Hex(enc("The quick brown fox jumps over the lazy dog.")),
    "e4d909c290d0fb1ca068ffaddf22cbd0",
    "md5(quick brown fox with period)",
  );
  // Same million bytes fed in uneven chunks.
  const h = new Md5();
  let i = 0;
  let step = 1;
  while (i < million.length) {
    h.update(million.subarray(i, i + step));
    i += step;
    step = (step * 7 + 3) % 9973 || 1;
  }
  assert.strictEqual(h.hex(), "7707d6ae4e027c70eea2a935c2296f21", "md5(1e6 x 'a') uneven chunks");
}

// The cap is exactly 2^29 bytes, where the bit length is 2^32 and the high
// 32-bit word of the length field becomes 1. Feed that many zero bytes in
// 8 MiB chunks, the size the page uses, and compare against Node.
{
  const chunk = new Uint8Array(8 * 1024 * 1024);
  const total = 2 ** 29;
  const ours = new Md5();
  const node = createHash("md5");
  for (let done = 0; done < total; done += chunk.length) {
    ours.update(chunk);
    node.update(chunk);
  }
  assert.strictEqual(ours.hex(), node.digest("hex"), "md5 of exactly 2^29 bytes (bit length high word = 1)");
}

// Empty update calls are no-ops.
{
  const h = new Md5();
  h.update(new Uint8Array(0));
  h.update(enc("abc"));
  h.update(new Uint8Array(0));
  assert.strictEqual(h.hex(), "900150983cd24fb0d6963f7d28e17f72", "empty updates ignored");
}

// FIPS 180-4 example messages (NIST CSRC examples), two-block 448-bit input
// and the empty string for SHA-384 and SHA-512.
void (async () => {
  const m448 = enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
  assert.strictEqual(await subtleHex("SHA-1", m448), "84983e441c3bd26ebaae4aa1f95129e5e54670f1", "sha1(448-bit)");
  assert.strictEqual(
    await subtleHex("SHA-256", m448),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    "sha256(448-bit)",
  );
  assert.strictEqual(
    await subtleHex("SHA-384", enc("")),
    "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b",
    "sha384(empty)",
  );
  assert.strictEqual(
    await subtleHex("SHA-512", enc("")),
    "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
    "sha512(empty)",
  );
  // A subarray view must hash only its own range.
  const backing = enc("xxabcxx");
  assert.strictEqual(
    await subtleHex("SHA-256", backing.subarray(2, 5)),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "subarray hashes only its range",
  );
  console.log("file-hash-checker: verifier async assertions passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

// Parser edge cases.
{
  const md5abc = "900150983cd24fb0d6963f7d28e17f72";
  const sha256abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  // Grouped bare digest: must be one digest, not a digest plus a filename.
  const grouped = parseExpected("90015098 3cd24fb0 d6963f7d 28e17f72");
  assert.strictEqual(grouped?.hex, md5abc, "space-grouped digest joins");
  assert.strictEqual(grouped?.filename, null, "space-grouped digest has no filename");
  assert.strictEqual(parseExpected("90:01:50:98:3c:d2:4f:b0:d6:96:3f:7d:28:e1:7f:72")?.hex, md5abc, "colon-grouped");

  // A coreutils line whose filename is itself hex stays a coreutils line.
  const hexName = parseExpected(`${sha256abc}  deadbeef`);
  assert.strictEqual(hexName?.hex, sha256abc, "hex filename does not join digest");
  assert.strictEqual(hexName?.filename, "deadbeef");

  // BSD tag line with parentheses in the filename.
  const paren = parseExpected(`SHA256 (setup (1).exe) = ${sha256abc}`);
  assert.strictEqual(paren?.filename, "setup (1).exe", "filename with parentheses");
  assert.strictEqual(paren?.algorithm, "SHA-256");

  // OpenSSL 3 dgst output.
  const ossl = parseExpected(`SHA2-256(disk.iso)= ${sha256abc}`);
  assert.strictEqual(ossl?.algorithm, "SHA-256", "openssl SHA2-256 tag");
  assert.strictEqual(ossl?.filename, "disk.iso");

  // Coreutils escaped line (filename contained a backslash or newline).
  const esc = parseExpected(`\\${sha256abc}  dir\\\\file.txt`);
  assert.strictEqual(esc?.hex, sha256abc, "leading backslash escape stripped");

  // Prefixed digest.
  const pref = parseExpected(`sha256:${sha256abc}`);
  assert.strictEqual(pref?.algorithm, "SHA-256", "sha256: prefix");
  assert.strictEqual(pref?.hex, sha256abc);

  // Unknown algorithm tag is kept but not normalized.
  const sha3 = parseExpectedLine(`SHA3-256 (a) = ${sha256abc}`);
  assert.strictEqual(sha3?.algorithm, null, "SHA3-256 is not normalized to SHA-256");
  assert.strictEqual(sha3?.algorithmTag, "SHA3-256");

  // Whole checksum file with a title, comments, CRLF and blank lines.
  const file = [
    "SHA256 checksums for release 1.2",
    "# generated by sha256sum",
    "",
    `${"0".repeat(64)}  other.tar.gz`,
    `${sha256abc} *wanted.iso`,
  ].join("\r\n");
  const all = parseExpectedAll(file);
  assert.strictEqual(all.entries.length, 2, "two checksum lines found");
  assert.strictEqual(all.entries[1].line, 5, "line numbers are 1-based and count every line");
  assert.strictEqual(all.truncated, false);

  const digests = { MD5: md5abc, "SHA-1": "a9993e364706816aba3e25717850c26c9cd0d89d", "SHA-256": sha256abc, "SHA-384": "x", "SHA-512": "y" };
  const m = findMatch(all.entries, digests);
  assert.deepStrictEqual(m, { index: 1, algorithm: "SHA-256" }, "match found on the second entry");

  // A labeled line only matches its own algorithm.
  const mislabeled = parseExpectedAll(`MD5 (x) = ${sha256abc}`).entries;
  assert.strictEqual(findMatch(mislabeled, digests), null, "MD5-labeled SHA-256 value does not match");
  // An unsupported tag never matches even if the hex coincides.
  assert.strictEqual(findMatch([sha3!], digests), null, "unsupported algorithm never matches");
  // Uppercase expected matches.
  assert.ok(findMatch(parseExpectedAll(md5abc.toUpperCase()).entries, digests), "uppercase match");

  // Malformed and adversarial input never throws.
  for (const bad of ["", "   ", "\n\n", "zzzz", "SHA256 () =", "()=", "\u0000\u0001", "\ud800", "a".repeat(100000)]) {
    assert.doesNotThrow(() => parseExpectedAll(bad), `no throw on ${JSON.stringify(bad.slice(0, 10))}`);
  }
  assert.strictEqual(parseExpected("zzzz"), null, "non-hex is null");

  // Line and size caps.
  const manyLines = Array.from({ length: MAX_EXPECTED_LINES + 10 }, () => md5abc).join("\n");
  const capped = parseExpectedAll(manyLines);
  assert.strictEqual(capped.entries.length, MAX_EXPECTED_LINES, "line cap applies");
  assert.strictEqual(capped.truncated, true, "truncation reported");

  // Pathological lines finish quickly (no catastrophic backtracking).
  const t0 = Date.now();
  parseExpectedAll("A(" + ")= 0".repeat(2000));
  parseExpectedAll("0 ".repeat(4000));
  parseExpectedAll("A(" + "(".repeat(8000));
  parseExpectedAll(("0".repeat(64) + " ").repeat(120));
  assert.ok(Date.now() - t0 < 1000, "pathological lines parse in under a second");
}

// Same-length hints.
assert.ok(otherAlgorithmsForLength(64).includes("SHA3-256"), "64 hex may be SHA3-256");
assert.ok(otherAlgorithmsForLength(32).includes("NT hash"), "32 hex may be an NT hash");
assert.deepStrictEqual(otherAlgorithmsForLength(7), [], "no hints for odd lengths");

console.log("file-hash-checker: verifier sync assertions passed");
