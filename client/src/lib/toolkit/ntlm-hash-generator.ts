/**
 * NT hash logic.
 *
 * The NT hash (sometimes written NTLM hash) is MD4 of the password encoded
 * as UTF-16LE, with no salt. MD4 is implemented here from RFC 1320 because
 * Web Crypto does not expose it. Everything is pure: a string in, bytes and
 * hex out, so it can be unit tested against the RFC test vectors.
 */

const HEX = "0123456789abcdef";

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
  }
  return out;
}

/** 32-bit left rotation. MD4 is defined entirely in 32-bit words. */
function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

/* --------------------------------------------------------------------- MD4 */

/*
  RFC 1320 section 3.4. Round 2 adds the constant 0x5a827999 (the square root
  of 2 scaled) and round 3 adds 0x6ed9eba1 (the square root of 3 scaled).
  The per-round shift amounts and the word access order are taken straight
  from the reference in the RFC.
*/
const ROUND2 = 0x5a827999;
const ROUND3 = 0x6ed9eba1;

export function md4(data: Uint8Array): Uint8Array {
  // Padding is identical in shape to MD5: 0x80, zeros to 56 mod 64, then the
  // 64-bit little-endian bit length.
  const byteCount = data.length;
  let padLen = 56 - (byteCount % 64);
  if (padLen <= 0) padLen += 64;
  const msg = new Uint8Array(byteCount + padLen + 8);
  msg.set(data, 0);
  msg[byteCount] = 0x80;

  const bits = byteCount * 8;
  const lo = bits >>> 0;
  const hi = Math.floor(bits / 0x100000000) >>> 0;
  const end = msg.length - 8;
  msg[end] = lo & 0xff;
  msg[end + 1] = (lo >>> 8) & 0xff;
  msg[end + 2] = (lo >>> 16) & 0xff;
  msg[end + 3] = (lo >>> 24) & 0xff;
  msg[end + 4] = hi & 0xff;
  msg[end + 5] = (hi >>> 8) & 0xff;
  msg[end + 6] = (hi >>> 16) & 0xff;
  msg[end + 7] = (hi >>> 24) & 0xff;

  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;

  const m = new Int32Array(16);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      m[i] = msg[j] | (msg[j + 1] << 8) | (msg[j + 2] << 16) | (msg[j + 3] << 24);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    // Round 1: F(x, y, z) = (x AND y) OR (NOT x AND z), shifts 3, 7, 11, 19.
    const r1 = [3, 7, 11, 19];
    for (let i = 0; i < 16; i++) {
      const f = (b & c) | (~b & d);
      const sum = (a + f + m[i]) | 0;
      a = d;
      d = c;
      c = b;
      b = rotl(sum, r1[i % 4]);
    }

    // Round 2: G(x, y, z) = (x AND y) OR (x AND z) OR (y AND z), shifts
    // 3, 5, 9, 13, word order 0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15.
    const r2order = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
    const r2 = [3, 5, 9, 13];
    for (let i = 0; i < 16; i++) {
      const g = (b & c) | (b & d) | (c & d);
      const sum = (a + g + m[r2order[i]] + ROUND2) | 0;
      a = d;
      d = c;
      c = b;
      b = rotl(sum, r2[i % 4]);
    }

    // Round 3: H(x, y, z) = x XOR y XOR z, shifts 3, 9, 11, 15, word order
    // 0,8,4,12,2,10,6,14,1,9,5,13,3,11,7,15.
    const r3order = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
    const r3 = [3, 9, 11, 15];
    for (let i = 0; i < 16; i++) {
      const h = b ^ c ^ d;
      const sum = (a + h + m[r3order[i]] + ROUND3) | 0;
      a = d;
      d = c;
      c = b;
      b = rotl(sum, r3[i % 4]);
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const out = new Uint8Array(16);
  const words = [a0, b0, c0, d0];
  for (let i = 0; i < 4; i++) {
    out[i * 4] = words[i] & 0xff;
    out[i * 4 + 1] = (words[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (words[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (words[i] >>> 24) & 0xff;
  }
  return out;
}

export function md4Hex(data: Uint8Array): string {
  return bytesToHex(md4(data));
}

/* ----------------------------------------------------------- NT hashing */

/**
 * UTF-16LE bytes of a string, which is what the NT hash takes as input. Each
 * JavaScript code unit becomes two little-endian bytes. Surrogate pairs stay
 * as their two separate code units, which is the correct encoding for a code
 * point above the basic multilingual plane. There is no trailing null.
 */
export function utf16leBytes(password: string): Uint8Array {
  const out = new Uint8Array(password.length * 2);
  for (let i = 0; i < password.length; i++) {
    const code = password.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = (code >>> 8) & 0xff;
  }
  return out;
}

/** The NT hash: MD4 over the UTF-16LE encoding of the password. */
export function ntHash(password: string): string {
  return md4Hex(utf16leBytes(password));
}

export { bytesToHex };
