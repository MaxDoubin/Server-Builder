/**
 * OpenSSH public key and authorized_keys inspection.
 *
 * Sources, so each rule can be checked against the text it came from:
 *   RFC 4251 section 5   the wire types: uint32, uint64, string, mpint
 *   RFC 4253 section 6.6 ssh-rsa and ssh-dss public key blobs
 *   RFC 5656 section 3.1 ecdsa-sha2-* blobs
 *   RFC 8709 section 4   ssh-ed25519 and ssh-ed448 blobs
 *   OpenSSH PROTOCOL.u2f sk-ecdsa and sk-ed25519 (FIDO security key) blobs
 *   OpenSSH PROTOCOL.certkeys  certificate blobs
 *   sshd(8), AUTHORIZED_KEYS FILE FORMAT  the line format and every option
 *   RFC 4716             the SSH2 public key file format some tools export
 *   FIPS 180-4           SHA-256, for the fingerprint ssh-keygen -l prints
 *   RFC 1321             MD5, for the legacy colon separated fingerprint
 *
 * Pure functions with no DOM access, so the whole module can be unit tested.
 */

/* ------------------------------------------------------------------ caps */

/** Characters of pasted text read. */
export const MAX_INPUT_CHARS = 524_288;
/** Key lines inspected before the rest are skipped. */
export const MAX_LINES = 1_000;
/** Largest decoded key blob accepted. A 16384 bit RSA certificate fits easily. */
export const MAX_BLOB_BYTES = 16_384;
/** OpenSSH refuses RSA moduli above this (SSHBUF_MAX_BIGNUM is 16384 / 8 bytes). */
export const OPENSSH_MAX_RSA_BITS = 16_384;
/** OpenSSH's default RequiredRSASize: smaller RSA keys are refused. */
export const OPENSSH_MIN_RSA_BITS = 1_024;
/** NIST SP 800-131A floor for RSA. */
export const RECOMMENDED_RSA_BITS = 2_048;
/** Options read from one line. Real lines carry a handful; this bounds hostile ones. */
export const MAX_OPTIONS = 100;

/* ------------------------------------------------------------- SHA-256 */

// FIPS 180-4 section 4.2.2: first 32 bits of the fractional parts of the
// cube roots of the first 64 primes.
// prettier-ignore
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(data: Uint8Array): Uint8Array {
  const len = data.length;
  // Section 5.1.1: a 1 bit, zeros, then the bit length as a 64 bit big endian integer.
  const padded = new Uint8Array((((len + 9 + 63) / 64) | 0) * 64);
  padded.set(data);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len << 3) >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = w[t - 16] + s0 + w[t - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

/* ------------------------------------------------------------------ MD5 */

// RFC 1321 section 3.4: floor(abs(sin(i + 1)) * 2^32), written out so the
// values cannot drift with a platform's floating point.
// prettier-ignore
const K_MD5 = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);
// prettier-ignore
const S_MD5 = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

export function md5(data: Uint8Array): Uint8Array {
  const len = data.length;
  const padded = new Uint8Array((((len + 9 + 63) / 64) | 0) * 64);
  padded.set(data);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  // Section 3.2: the bit length, 64 bits, low order word first.
  view.setUint32(padded.length - 8, (len << 3) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(len / 0x20000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const m = new Uint32Array(16);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(off + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const sum = (f + a + K_MD5[i] + m[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((sum << S_MD5[i]) | (sum >>> (32 - S_MD5[i])))) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

/* ------------------------------------------------------- encode helpers */

const HEX = "0123456789abcdef";
export function toHex(bytes: Uint8Array, sep = ""): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) parts.push(HEX[bytes[i] >> 4] + HEX[bytes[i] & 15]);
  return parts.join(sep);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[n >> 18] + B64[(n >> 12) & 63] + "==";
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=";
  }
  return out;
}

export type B64Result = { ok: true; bytes: Uint8Array; padded: boolean } | { ok: false; error: string };

/** Strict standard alphabet Base64, the form ssh-keygen writes. */
export function fromBase64(text: string): B64Result {
  if (text.length === 0) return { ok: false, error: "The key data field is empty." };
  const firstPad = text.indexOf("=");
  const body = firstPad === -1 ? text : text.slice(0, firstPad);
  if (firstPad !== -1 && !/^={1,2}$/.test(text.slice(firstPad))) {
    return { ok: false, error: "Base64 padding (=) can only appear once or twice, at the very end of the key data." };
  }
  for (let i = 0; i < body.length; i++) {
    if (B64.indexOf(body[i]) === -1) {
      return {
        ok: false,
        error: `"${body[i]}" at position ${i + 1} of the key data is not a Base64 character. A line break or a stray character was probably pasted into the middle of the key.`,
      };
    }
  }
  if (body.length % 4 === 1) {
    return { ok: false, error: "The key data has an impossible Base64 length, so part of it is missing." };
  }
  if (firstPad !== -1 && text.length % 4 !== 0) {
    return { ok: false, error: "The key data has the wrong amount of = padding for its length." };
  }
  const padded = firstPad !== -1 || body.length % 4 === 0;
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < body.length; i++) {
    acc = ((acc << 6) | B64.indexOf(body[i])) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return { ok: true, bytes: out.subarray(0, j), padded };
}

/** ssh-keygen -l: "SHA256:" and the digest in Base64 with the padding removed. */
export function fingerprintSha256(blob: Uint8Array): string {
  return `SHA256:${toBase64(sha256(blob)).replace(/=+$/, "")}`;
}

/** ssh-keygen -l -E md5: lowercase hex pairs joined by colons. */
export function fingerprintMd5(blob: Uint8Array): string {
  return `MD5:${toHex(md5(blob), ":")}`;
}

/* -------------------------------------------------------- wire reader */

class WireError extends Error {}

/** RFC 4251 section 5 data types, read with bounds checks. */
class Reader {
  pos = 0;
  constructor(public buf: Uint8Array) {}
  get remaining(): number {
    return this.buf.length - this.pos;
  }
  uint32(what: string): number {
    if (this.remaining < 4) throw new WireError(`${what} needs 4 bytes but only ${this.remaining} remain.`);
    const b = this.buf;
    const p = this.pos;
    this.pos += 4;
    return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  }
  uint64(what: string): bigint {
    const hi = this.uint32(what);
    const lo = this.uint32(what);
    return (BigInt(hi) << BigInt(32)) | BigInt(lo);
  }
  string(what: string): Uint8Array {
    const n = this.uint32(`The length of ${what}`);
    if (n > this.remaining) {
      throw new WireError(`${capitalize(what)} claims ${n} bytes but only ${this.remaining} remain, so the key is truncated.`);
    }
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  text(what: string): string {
    return latin1(this.string(what));
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function utf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return latin1(bytes);
  }
}

/** Bit length of an mpint's magnitude. */
function mpintBits(bytes: Uint8Array): number {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  if (i === bytes.length) return 0;
  return (bytes.length - i - 1) * 8 + (32 - Math.clz32(bytes[i]));
}

/** RFC 4251 mpint: two's complement, big endian, no superfluous leading bytes. */
function checkMpint(bytes: Uint8Array, what: string, problems: string[]): void {
  if (bytes.length && bytes[0] & 0x80) problems.push(`${capitalize(what)} is negative, which is never valid for a public key.`);
  if (bytes.length > 1 && bytes[0] === 0 && (bytes[1] & 0x80) === 0) {
    problems.push(`${capitalize(what)} has a superfluous leading zero byte, which RFC 4251 forbids.`);
  }
}

function mpintValue(bytes: Uint8Array): bigint {
  return bytes.length ? BigInt("0x" + toHex(bytes)) : BigInt(0);
}

/* --------------------------------------------------------- key types */

export type KeyFamily = "rsa" | "dsa" | "ecdsa" | "ed25519" | "ed448" | "ecdsa-sk" | "ed25519-sk";

interface TypeInfo {
  family: KeyFamily;
  /** ssh-keygen's short name, as printed in parentheses by ssh-keygen -l. */
  label: string;
  cert: boolean;
  /** The plain key type a certificate wraps, or the type itself. */
  plain: string;
  curve?: "nistp256" | "nistp384" | "nistp521";
}

const PLAIN_TYPES: Record<string, Omit<TypeInfo, "cert" | "plain">> = {
  "ssh-rsa": { family: "rsa", label: "RSA" },
  "ssh-dss": { family: "dsa", label: "DSA" },
  "ecdsa-sha2-nistp256": { family: "ecdsa", label: "ECDSA", curve: "nistp256" },
  "ecdsa-sha2-nistp384": { family: "ecdsa", label: "ECDSA", curve: "nistp384" },
  "ecdsa-sha2-nistp521": { family: "ecdsa", label: "ECDSA", curve: "nistp521" },
  "ssh-ed25519": { family: "ed25519", label: "ED25519" },
  "ssh-ed448": { family: "ed448", label: "ED448" },
  "sk-ecdsa-sha2-nistp256@openssh.com": { family: "ecdsa-sk", label: "ECDSA-SK", curve: "nistp256" },
  "sk-ssh-ed25519@openssh.com": { family: "ed25519-sk", label: "ED25519-SK" },
};

/** PROTOCOL.certkeys names each certificate type after the key it wraps. */
const CERT_TYPES: Record<string, string> = {
  "ssh-rsa-cert-v01@openssh.com": "ssh-rsa",
  "ssh-dss-cert-v01@openssh.com": "ssh-dss",
  "ecdsa-sha2-nistp256-cert-v01@openssh.com": "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384-cert-v01@openssh.com": "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521-cert-v01@openssh.com": "ecdsa-sha2-nistp521",
  "ssh-ed25519-cert-v01@openssh.com": "ssh-ed25519",
  "sk-ecdsa-sha2-nistp256-cert-v01@openssh.com": "sk-ecdsa-sha2-nistp256@openssh.com",
  "sk-ssh-ed25519-cert-v01@openssh.com": "sk-ssh-ed25519@openssh.com",
};

export function typeInfo(type: string): TypeInfo | null {
  const plain = PLAIN_TYPES[type];
  if (plain) return { ...plain, cert: false, plain: type };
  const wrapped = CERT_TYPES[type];
  if (wrapped) {
    const base = PLAIN_TYPES[wrapped];
    return { ...base, label: `${base.label}-CERT`, cert: true, plain: wrapped };
  }
  return null;
}

export function isKeyType(token: string): boolean {
  return typeInfo(token) !== null;
}

const CURVE_BITS: Record<string, number> = { nistp256: 256, nistp384: 384, nistp521: 521 };
/** Field size in bytes, for checking the SEC1 point length. */
const CURVE_BYTES: Record<string, number> = { nistp256: 32, nistp384: 48, nistp521: 66 };

/* ------------------------------------------------------ decoded keys */

export interface Detail {
  label: string;
  value: string;
}

export interface CertInfo {
  serial: string;
  certType: string;
  keyId: string;
  principals: string[];
  validAfter: bigint;
  validBefore: bigint;
  validity: string;
  criticalOptions: Detail[];
  extensions: Detail[];
  caType: string;
  caFingerprint: string;
  signatureAlgorithm: string;
}

export interface DecodedKey {
  /** Type string inside the blob. */
  type: string;
  family: KeyFamily;
  label: string;
  /** Size as ssh-keygen -l reports it, or null when OpenSSH has no notion of it. */
  bits: number | null;
  details: Detail[];
  /** RSA modulus bits, for the size findings. */
  rsaBits: number | null;
  rsaExponent: bigint | null;
  /** FIDO application string, for sk- keys. */
  application: string | null;
  certificate: CertInfo | null;
  /** What the fingerprint covers: the blob, or for a certificate the plain key inside it. */
  plainBlob: Uint8Array;
  /** Structural problems that make OpenSSH reject the key. */
  problems: string[];
}

function sshString(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length);
  out.set(bytes, 4);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

interface KeyFields {
  bits: number | null;
  details: Detail[];
  rsaBits: number | null;
  rsaExponent: bigint | null;
  application: string | null;
}

/** Read the public key fields that follow the type (and, in a certificate, the nonce). */
function readKeyFields(r: Reader, info: TypeInfo, problems: string[]): KeyFields {
  const details: Detail[] = [];
  const out: KeyFields = { bits: null, details, rsaBits: null, rsaExponent: null, application: null };
  switch (info.family) {
    case "rsa": {
      // RFC 4253 6.6 orders e before n; PROTOCOL.certkeys keeps that order.
      const e = r.string("the RSA public exponent");
      const n = r.string("the RSA modulus");
      checkMpint(e, "the RSA public exponent", problems);
      checkMpint(n, "the RSA modulus", problems);
      const bits = mpintBits(n);
      const exponent = e.length <= 64 ? mpintValue(e) : null;
      out.bits = bits;
      out.rsaBits = bits;
      out.rsaExponent = exponent;
      details.push({ label: "Modulus", value: `${bits} bits` });
      details.push({ label: "Public exponent", value: exponent !== null ? exponent.toString() : `${mpintBits(e)} bit value` });
      if (n.length && (n[n.length - 1] & 1) === 0) problems.push("The RSA modulus is even, so it cannot be a product of two odd primes.");
      if (exponent !== null && (exponent < BigInt(3) || exponent % BigInt(2) === BigInt(0))) {
        problems.push(`The RSA public exponent ${exponent} is not a valid exponent: it must be odd and at least 3.`);
      }
      if (bits > OPENSSH_MAX_RSA_BITS) problems.push(`OpenSSH refuses RSA moduli larger than ${OPENSSH_MAX_RSA_BITS} bits.`);
      break;
    }
    case "dsa": {
      const p = r.string("the DSA prime p");
      const q = r.string("the DSA subprime q");
      const g = r.string("the DSA generator g");
      const y = r.string("the DSA public value y");
      for (const [v, name] of [
        [p, "the DSA prime p"],
        [q, "the DSA subprime q"],
        [g, "the DSA generator g"],
        [y, "the DSA public value y"],
      ] as const) {
        checkMpint(v, name, problems);
      }
      out.bits = mpintBits(p);
      details.push({ label: "Prime p", value: `${mpintBits(p)} bits` });
      details.push({ label: "Subprime q", value: `${mpintBits(q)} bits` });
      break;
    }
    case "ecdsa":
    case "ecdsa-sk": {
      const curve = r.text("the curve name");
      const point = r.string("the public point");
      const want = info.curve as string;
      if (curve !== want) problems.push(`The blob names curve "${curve}" but the key type requires "${want}" (RFC 5656 3.1).`);
      out.bits = CURVE_BITS[want];
      details.push({ label: "Curve", value: `${want} (NIST P-${want.slice(5)})` });
      const fb = CURVE_BYTES[want];
      if (point[0] === 0x04 && point.length === 1 + 2 * fb) {
        details.push({ label: "Point", value: `uncompressed, ${point.length} bytes` });
      } else if ((point[0] === 0x02 || point[0] === 0x03) && point.length === 1 + fb) {
        details.push({ label: "Point", value: `compressed, ${point.length} bytes` });
      } else {
        problems.push(`The public point is ${point.length} bytes starting 0x${toHex(point.subarray(0, 1)) || "(empty)"}, which is not a valid SEC1 encoding for ${want}.`);
      }
      if (info.family === "ecdsa-sk") {
        out.application = utf8(r.string("the FIDO application string"));
        details.push({ label: "Application", value: out.application || "(empty)" });
      }
      break;
    }
    case "ed25519":
    case "ed25519-sk": {
      const pk = r.string("the Ed25519 public key");
      if (pk.length !== 32) problems.push(`An Ed25519 public key is exactly 32 bytes; this one is ${pk.length} (RFC 8709).`);
      out.bits = 256;
      details.push({ label: "Public key", value: toHex(pk) });
      if (info.family === "ed25519-sk") {
        out.application = utf8(r.string("the FIDO application string"));
        details.push({ label: "Application", value: out.application || "(empty)" });
      }
      break;
    }
    case "ed448": {
      const pk = r.string("the Ed448 public key");
      if (pk.length !== 57) problems.push(`An Ed448 public key is exactly 57 bytes; this one is ${pk.length} (RFC 8709).`);
      out.bits = null;
      details.push({ label: "Public key", value: toHex(pk) });
      break;
    }
  }
  return out;
}

/** Packed name/data pairs in a certificate's critical options or extensions. */
function readOptionList(bytes: Uint8Array, what: string): Detail[] {
  const r = new Reader(bytes);
  const out: Detail[] = [];
  while (r.remaining > 0 && out.length < 64) {
    const name = r.text(`a ${what} name`);
    const data = r.string(`the data for ${what} ${name}`);
    let value = "";
    if (data.length) {
      // The data is itself a string for options that carry a value.
      try {
        const inner = new Reader(data);
        value = utf8(inner.string("the option value"));
        if (inner.remaining) value = toHex(data);
      } catch {
        value = toHex(data);
      }
    }
    out.push({ label: name, value });
  }
  return out;
}

const UINT64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

export function formatCertTime(t: bigint): string {
  if (t === UINT64_MAX) return "forever";
  if (t > BigInt(253402300799)) return `${t} (beyond year 9999)`;
  return new Date(Number(t) * 1000).toISOString().replace(".000Z", "Z").replace("T", " ");
}

function readCertificate(r: Reader, info: TypeInfo, blob: Uint8Array, problems: string[]): { fields: KeyFields; cert: CertInfo; plainBlob: Uint8Array } {
  r.string("the certificate nonce");
  const keyStart = r.pos;
  const fields = readKeyFields(r, info, problems);
  const keyEnd = r.pos;
  const serial = r.uint64("the certificate serial");
  const certTypeNum = r.uint32("the certificate type");
  const keyId = utf8(r.string("the key id"));
  const principalBytes = r.string("the valid principals");
  const validAfter = r.uint64("valid after");
  const validBefore = r.uint64("valid before");
  const critical = r.string("the critical options");
  const extensions = r.string("the extensions");
  r.string("the reserved field");
  const signatureKey = r.string("the signature key");
  const signature = r.string("the signature");

  const principals: string[] = [];
  const pr = new Reader(principalBytes);
  while (pr.remaining > 0 && principals.length < 256) principals.push(utf8(pr.string("a principal")));

  let caType = "unreadable";
  let caFingerprint = fingerprintSha256(signatureKey);
  try {
    caType = new Reader(signatureKey).text("the CA key type");
  } catch {
    caFingerprint = "unreadable";
  }
  let signatureAlgorithm = "unreadable";
  try {
    signatureAlgorithm = new Reader(signature).text("the signature algorithm");
  } catch {
    /* keep the placeholder */
  }

  const certType = certTypeNum === 1 ? "user" : certTypeNum === 2 ? "host" : `unknown (${certTypeNum})`;
  if (certTypeNum !== 1 && certTypeNum !== 2) problems.push(`Certificate type ${certTypeNum} is neither 1 (user) nor 2 (host).`);

  const after = validAfter === BigInt(0) ? "the beginning of time" : formatCertTime(validAfter);
  const before = formatCertTime(validBefore);
  const cert: CertInfo = {
    serial: serial.toString(),
    certType,
    keyId,
    principals,
    validAfter,
    validBefore,
    validity: `from ${after} to ${before}`,
    criticalOptions: readOptionList(critical, "critical option"),
    extensions: readOptionList(extensions, "extension"),
    caType,
    caFingerprint,
    signatureAlgorithm,
  };
  // ssh-keygen fingerprints a certificate by the plain key inside it, so the
  // plain blob is rebuilt: the plain type name, then the key fields verbatim.
  const plainBlob = concat(sshString(new TextEncoder().encode(info.plain)), blob.subarray(keyStart, keyEnd));
  return { fields, cert, plainBlob };
}

export type DecodeResult = { ok: true; key: DecodedKey } | { ok: false; error: string };

/** Decode an OpenSSH public key blob (the bytes behind the Base64 field). */
export function decodeKeyBlob(blob: Uint8Array): DecodeResult {
  if (blob.length > MAX_BLOB_BYTES) {
    return { ok: false, error: `The key blob is ${blob.length} bytes. This inspector stops at ${MAX_BLOB_BYTES}.` };
  }
  const r = new Reader(blob);
  try {
    const typeBytes = r.string("the key type");
    if (typeBytes.length > 128) return { ok: false, error: "The type name inside the blob is implausibly long, so this is not a key blob." };
    const type = latin1(typeBytes);
    const info = typeInfo(type);
    if (!info) {
      const shown = /^[\x20-\x7e]*$/.test(type) ? `"${type}"` : "an unreadable name";
      return { ok: false, error: `The blob starts with key type ${shown}, which is not an SSH public key type this inspector knows.` };
    }
    const problems: string[] = [];
    let fields: KeyFields;
    let cert: CertInfo | null = null;
    let plainBlob = blob;
    if (info.cert) {
      const c = readCertificate(r, info, blob, problems);
      fields = c.fields;
      cert = c.cert;
      plainBlob = c.plainBlob;
    } else {
      fields = readKeyFields(r, info, problems);
    }
    if (r.remaining > 0) problems.push(`${r.remaining} unexpected bytes follow the key fields. OpenSSH rejects a blob with trailing data.`);
    return {
      ok: true,
      key: {
        type,
        family: info.family,
        label: info.label,
        bits: fields.bits,
        details: fields.details,
        rsaBits: fields.rsaBits,
        rsaExponent: fields.rsaExponent,
        application: fields.application,
        certificate: cert,
        plainBlob,
        problems,
      },
    };
  } catch (e) {
    if (e instanceof WireError) return { ok: false, error: e.message };
    throw e;
  }
}

/* ------------------------------------------------------------ options */

export type Tone = "ok" | "info" | "warn" | "danger";

export interface Finding {
  tone: Tone;
  text: string;
}

export interface AuthOption {
  /** As written, before any value. */
  name: string;
  /** Canonical spelling from sshd(8), or null when unknown. */
  canonical: string | null;
  value: string | null;
  explanation: string;
  /** Extra, value specific reading: the parsed time, the pattern list. */
  detail: string | null;
  error: string | null;
  /** For expiry-time: true once the time has certainly passed. */
  expired: boolean;
}

interface OptionSpec {
  canonical: string;
  takesValue: boolean;
  explanation: string;
}

/** sshd(8), AUTHORIZED_KEYS FILE FORMAT. Names are matched case insensitively, as sshd does. */
const OPTION_SPECS: OptionSpec[] = [
  { canonical: "agent-forwarding", takesValue: false, explanation: "Re-enables SSH agent forwarding after restrict turned it off." },
  {
    canonical: "cert-authority",
    takesValue: false,
    explanation: "The key on this line is a certificate authority. Any user certificate it signed is accepted for this account, subject to the certificate's own principals and restrictions.",
  },
  {
    canonical: "command",
    takesValue: true,
    explanation: "Runs this command whenever the key is used, whatever the client asked for. The client's requested command is available to it in SSH_ORIGINAL_COMMAND. On its own it does not stop port, agent or X11 forwarding.",
  },
  {
    canonical: "environment",
    takesValue: true,
    explanation: "Adds NAME=value to the session's environment. sshd ignores it unless PermitUserEnvironment is enabled in sshd_config, which is off by default.",
  },
  {
    canonical: "expiry-time",
    takesValue: true,
    explanation: "The key is refused after this time. YYYYMMDD or YYYYMMDDHHMM[SS], read in the server's time zone unless it ends in Z for UTC.",
  },
  {
    canonical: "from",
    takesValue: true,
    explanation: "The connection must also come from a matching address or host name. Patterns may use * and ?, ! to negate, and CIDR blocks such as 10.0.0.0/8.",
  },
  { canonical: "no-agent-forwarding", takesValue: false, explanation: "Refuses SSH agent forwarding for sessions using this key." },
  { canonical: "no-port-forwarding", takesValue: false, explanation: "Refuses TCP port forwarding (ssh -L, -R and -D) for this key." },
  { canonical: "no-pty", takesValue: false, explanation: "Refuses terminal allocation, so interactive shells get no tty." },
  { canonical: "no-user-rc", takesValue: false, explanation: "Stops sshd from running ~/.ssh/rc at login." },
  { canonical: "no-X11-forwarding", takesValue: false, explanation: "Refuses X11 forwarding for this key." },
  {
    canonical: "permitlisten",
    takesValue: true,
    explanation: "Limits remote forwarding (ssh -R) to listening on this [host:]port. Repeat the option to allow more than one.",
  },
  {
    canonical: "permitopen",
    takesValue: true,
    explanation: "Limits local forwarding (ssh -L) to connecting to this host:port. Host names are matched literally, with no DNS lookup or patterns.",
  },
  { canonical: "port-forwarding", takesValue: false, explanation: "Re-enables port forwarding after restrict turned it off." },
  {
    canonical: "principals",
    takesValue: true,
    explanation: "On a cert-authority line, a certificate must list at least one of these principals to be accepted. Ignored on any other line.",
  },
  { canonical: "pty", takesValue: false, explanation: "Re-enables terminal allocation after restrict turned it off." },
  {
    canonical: "restrict",
    takesValue: false,
    explanation: "Turns off port, agent and X11 forwarding, terminal allocation and ~/.ssh/rc in one word, and any restriction added to OpenSSH later. Options after it can re-enable single features.",
  },
  { canonical: "tunnel", takesValue: true, explanation: "Forces the tun device number sshd uses when the client asks for a tunnel (ssh -w)." },
  { canonical: "user-rc", takesValue: false, explanation: "Re-enables ~/.ssh/rc after restrict turned it off." },
  { canonical: "X11-forwarding", takesValue: false, explanation: "Re-enables X11 forwarding after restrict turned it off." },
  {
    canonical: "no-touch-required",
    takesValue: false,
    explanation: "For FIDO security keys only: accepts signatures made without a touch on the authenticator.",
  },
  {
    canonical: "touch-required",
    takesValue: false,
    explanation: "For FIDO security keys only: requires a touch on the authenticator for every signature, which is already the default.",
  },
  {
    canonical: "verify-required",
    takesValue: false,
    explanation: "For FIDO security keys only: requires that the authenticator verified the user, for example with a PIN, for every signature.",
  },
];

const SPEC_BY_NAME = new Map(OPTION_SPECS.map((s) => [s.canonical.toLowerCase(), s]));

export function optionSpec(name: string): OptionSpec | undefined {
  return SPEC_BY_NAME.get(name.toLowerCase());
}

export type OptionsParse = { ok: true; options: AuthOption[] } | { ok: false; error: string; options: AuthOption[] };

/**
 * Split an options field on commas outside double quotes. Inside quotes a
 * backslash escapes a double quote, as in sshd's auth-options.c.
 */
export function parseOptions(field: string, nowMs: number): OptionsParse {
  const options: AuthOption[] = [];
  const NAME = /[A-Za-z0-9-]+/y;
  let i = 0;
  while (i < field.length) {
    if (options.length >= MAX_OPTIONS) {
      return { ok: false, error: `More than ${MAX_OPTIONS} options on one line. This inspector stops reading there.`, options };
    }
    NAME.lastIndex = i;
    const nameMatch = NAME.exec(field);
    if (!nameMatch) {
      return { ok: false, error: `Unexpected "${field[i]}" at character ${i + 1} of the options.`, options };
    }
    const name = nameMatch[0];
    i += name.length;
    let value: string | null = null;
    if (field[i] === "=") {
      i++;
      if (field[i] !== '"') {
        return { ok: false, error: `The value of ${name} must be in double quotes, as in ${name}="...".`, options };
      }
      i++;
      let v = "";
      let closed = false;
      while (i < field.length) {
        if (field[i] === "\\" && field[i + 1] === '"') {
          v += '"';
          i += 2;
        } else if (field[i] === '"') {
          closed = true;
          i++;
          break;
        } else {
          v += field[i++];
        }
      }
      if (!closed) return { ok: false, error: `The value of ${name} has no closing double quote.`, options };
      value = v;
    }
    options.push(describeOption(name, value, nowMs));
    if (i < field.length) {
      if (field[i] !== ",") {
        return { ok: false, error: `Expected a comma after ${name} but found "${field[i]}".`, options };
      }
      i++;
      if (i === field.length) return { ok: false, error: "The options end with a comma and nothing after it.", options };
    }
  }
  return { ok: true, options };
}

/** sshd(8) timespec: YYYYMMDD[Z] or YYYYMMDDHHMM[SS][Z]. */
export function parseExpiry(value: string): { ok: true; ms: number; utc: boolean; text: string } | { ok: false; error: string } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?(Z?)$/.exec(value);
  if (!m) return { ok: false, error: `"${value}" is not a valid expiry-time. Use YYYYMMDD or YYYYMMDDHHMM[SS], with an optional Z for UTC.` };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hh = m[4] ? Number(m[4]) : 0;
  const mm = m[5] ? Number(m[5]) : 0;
  const ss = m[6] ? Number(m[6]) : 0;
  const ms = Date.UTC(y, mo - 1, d, hh, mm, ss);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || hh > 23 || mm > 59 || ss > 59) {
    return { ok: false, error: `"${value}" is not a real date and time.` };
  }
  const p2 = (n: number) => String(n).padStart(2, "0");
  const text = `${m[1]}-${m[2]}-${m[3]} ${p2(hh)}:${p2(mm)}:${p2(ss)} ${m[7] ? "UTC" : "server local time"}`;
  return { ok: true, ms, utc: m[7] === "Z", text };
}

const PORT = /^(?:\*|[0-9]{1,5})$/;

function validPort(p: string): boolean {
  if (p === "*") return true;
  const n = Number(p);
  return PORT.test(p) && n >= 0 && n <= 65535;
}

/** host:port with an IPv6 host in brackets. */
function splitHostPort(value: string): { host: string | null; port: string } | null {
  const v6 = /^\[([^\]]+)\]:(.+)$/.exec(value);
  if (v6) return { host: v6[1], port: v6[2] };
  const idx = value.lastIndexOf(":");
  if (idx === -1) return { host: null, port: value };
  const host = value.slice(0, idx);
  if (host.includes(":")) return null;
  return { host, port: value.slice(idx + 1) };
}

function describeOption(name: string, value: string | null, nowMs: number): AuthOption {
  const spec = optionSpec(name);
  if (!spec) {
    return {
      name,
      canonical: null,
      value,
      explanation: "Not an option sshd knows. sshd logs \"bad options\" and ignores this whole line, so the key cannot log in.",
      detail: null,
      error: `Unknown option "${name}".`,
      expired: false,
    };
  }
  const opt: AuthOption = { name, canonical: spec.canonical, value, explanation: spec.explanation, detail: null, error: null, expired: false };
  if (spec.takesValue && value === null) {
    opt.error = `${spec.canonical} needs a value, as in ${spec.canonical}="...".`;
    return opt;
  }
  if (!spec.takesValue && value !== null) {
    opt.error = `${spec.canonical} is a flag and takes no value.`;
    return opt;
  }
  if (value === null) return opt;

  switch (spec.canonical) {
    case "expiry-time": {
      const r = parseExpiry(value);
      if (!r.ok) opt.error = r.error;
      else {
        // Without Z the server's zone applies, which can be up to 14 hours
        // either side of UTC, so only call it expired when that cannot matter.
        const slack = r.utc ? 0 : 14 * 3600_000;
        opt.expired = r.ms + slack < nowMs;
        const state = opt.expired ? "expired" : r.ms - slack > nowMs ? "not yet expired" : "expires within a day of now, depending on the server's time zone";
        opt.detail = `${r.text}, ${state}.`;
      }
      break;
    }
    case "from": {
      const patterns = value.split(",").map((p) => p.trim()).filter(Boolean);
      if (patterns.length === 0) opt.error = "from= needs at least one pattern.";
      else {
        const names = patterns.filter((p) => /[a-zA-Z]/.test(p.replace(/^!/, "")) && !p.includes(":") && !/^[0-9a-fA-F.:/*?!]+$/.test(p));
        opt.detail = `Patterns: ${patterns.join("  ")}.${
          names.length
            ? " Host name patterns only match when sshd_config has UseDNS yes; with the default (no), sshd compares addresses only."
            : ""
        }`;
      }
      break;
    }
    case "permitopen": {
      const hp = splitHostPort(value);
      if (!hp || hp.host === null || hp.host === "" || !validPort(hp.port)) {
        opt.error = `permitopen="${value}" must be host:port, with IPv6 hosts in brackets and a port of 0 to 65535 or *.`;
      } else opt.detail = `Allows ssh -L to ${hp.host} port ${hp.port}.`;
      break;
    }
    case "permitlisten": {
      const hp = splitHostPort(value);
      if (!hp || !validPort(hp.port) || hp.host === "") {
        opt.error = `permitlisten="${value}" must be [host:]port, with a port of 0 to 65535 or *.`;
      } else opt.detail = `Allows ssh -R to listen on ${hp.host ?? "the default address"} port ${hp.port}.`;
      break;
    }
    case "environment": {
      const eq = value.indexOf("=");
      if (eq <= 0 || !/^[A-Za-z0-9_]+$/.test(value.slice(0, eq))) {
        opt.error = `environment="${value}" must be NAME=value, where NAME uses only letters, digits and underscores.`;
      } else opt.detail = `Sets ${value.slice(0, eq)} to "${value.slice(eq + 1)}".`;
      break;
    }
    case "tunnel": {
      if (!/^(?:\d+|any)$/i.test(value)) opt.error = `tunnel="${value}" must be a device number.`;
      break;
    }
    case "principals": {
      const list = value.split(",").map((p) => p.trim()).filter(Boolean);
      if (!list.length) opt.error = "principals= needs at least one name.";
      else opt.detail = `Principals: ${list.join(", ")}.`;
      break;
    }
    case "command": {
      opt.detail = value === "" ? "An empty command." : `Forced command: ${value}`;
      break;
    }
  }
  return opt;
}

export interface Effective {
  pty: boolean;
  portForwarding: boolean;
  agentForwarding: boolean;
  x11Forwarding: boolean;
  userRc: boolean;
}

/** Apply the flags in order, as sshd does: restrict clears all, later flags re-enable. */
export function effectivePermissions(options: AuthOption[]): Effective {
  const e: Effective = { pty: true, portForwarding: true, agentForwarding: true, x11Forwarding: true, userRc: true };
  for (const o of options) {
    switch (o.canonical) {
      case "restrict":
        e.pty = e.portForwarding = e.agentForwarding = e.x11Forwarding = e.userRc = false;
        break;
      case "pty":
        e.pty = true;
        break;
      case "no-pty":
        e.pty = false;
        break;
      case "port-forwarding":
        e.portForwarding = true;
        break;
      case "no-port-forwarding":
        e.portForwarding = false;
        break;
      case "agent-forwarding":
        e.agentForwarding = true;
        break;
      case "no-agent-forwarding":
        e.agentForwarding = false;
        break;
      case "X11-forwarding":
        e.x11Forwarding = true;
        break;
      case "no-X11-forwarding":
        e.x11Forwarding = false;
        break;
      case "user-rc":
        e.userRc = true;
        break;
      case "no-user-rc":
        e.userRc = false;
        break;
    }
  }
  return e;
}

/* -------------------------------------------------------------- lines */

export interface KeyLine {
  lineNumber: number;
  /** The line as pasted, trimmed. */
  raw: string;
  /** "authorized_keys", "known_hosts" or "rfc4716" (an SSH2 PUBLIC KEY block). */
  source: "authorized_keys" | "known_hosts" | "rfc4716";
  optionsField: string | null;
  options: AuthOption[];
  /** known_hosts host patterns, when the line is a known_hosts entry. */
  hosts: string | null;
  marker: string | null;
  typeField: string | null;
  comment: string;
  key: DecodedKey | null;
  sha256: string | null;
  md5: string | null;
  /** What ssh-keygen -lf prints for this line. */
  keygen: string | null;
  keygenMd5: string | null;
  effective: Effective | null;
  findings: Finding[];
  /** Set when the line could not be used at all. */
  error: string | null;
}

export interface InspectResult {
  lines: KeyLine[];
  commentLines: number;
  blankLines: number;
  /** A message when the input was cut, or null. */
  capNote: string | null;
}

const PRIVATE_HINT =
  "This is a private key. Paste the public half instead (the .pub file, or the output of ssh-keygen -y -f keyfile), and treat a private key that has been pasted anywhere as exposed.";

function newLine(lineNumber: number, raw: string, source: KeyLine["source"]): KeyLine {
  return {
    lineNumber,
    raw,
    source,
    optionsField: null,
    options: [],
    hosts: null,
    marker: null,
    typeField: null,
    comment: "",
    key: null,
    sha256: null,
    md5: null,
    keygen: null,
    keygenMd5: null,
    effective: null,
    findings: [],
    error: null,
  };
}

/** Scan an options field the way sshd skips it: up to whitespace outside quotes. */
function scanOptions(line: string): { field: string; rest: string } | { error: string } {
  let quoted = false;
  let i = 0;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (!quoted && (ch === " " || ch === "\t")) break;
    if (ch === "\\" && line[i + 1] === '"') i++;
    else if (ch === '"') quoted = !quoted;
  }
  if (quoted) return { error: "An option value opens a double quote that never closes." };
  return { field: line.slice(0, i), rest: line.slice(i).replace(/^[ \t]+/, "") };
}

function looksLikeHosts(field: string): boolean {
  if (field.startsWith("|1|")) return true;
  if (field.includes("=") || field.includes('"')) return false;
  return field.split(",").every((h) => /^!?(\[[^\]]+\](:\d+)?|[A-Za-z0-9.*?_:-]+)$/.test(h) && /[.:*?\[]/.test(h));
}

function finishKey(line: KeyLine, typeField: string, data: string, nowMs: number): void {
  line.typeField = typeField;
  const typeKnown = isKeyType(typeField);
  if (!typeKnown) {
    if (/^rsa-sha2-(256|512)$/.test(typeField)) {
      line.error = `${typeField} is a signature algorithm name, not a key type. An RSA public key line starts with ssh-rsa, whichever hash it signs with.`;
    } else {
      line.error = `"${typeField}" is not an SSH public key type. Expected ssh-ed25519, ssh-rsa, ecdsa-sha2-nistp256 and the like.`;
    }
  }
  if (!data) {
    line.error ??= "The key type is not followed by any key data.";
    return;
  }
  const b64 = fromBase64(data);
  if (!b64.ok) {
    line.error ??= b64.error;
    return;
  }
  const decoded = decodeKeyBlob(b64.bytes);
  if (!decoded.ok) {
    line.error ??= decoded.error;
    return;
  }
  const key = decoded.key;
  line.key = key;
  if (!typeKnown && !/^rsa-sha2-(256|512)$/.test(typeField)) {
    line.error = `"${typeField}" is not an SSH public key type. The key data is ${key.type}, so the line should read "${key.type} ${data.slice(0, 12)}...".`;
  }
  if (typeKnown && key.type !== typeField) {
    line.error = `The line says ${typeField} but the key data inside is ${key.type}. OpenSSH rejects the mismatch, so the line was probably edited by hand.`;
  }
  if (!b64.padded) {
    line.findings.push({
      tone: "warn",
      text: "The key data is missing its trailing = padding. ssh-keygen always writes it and OpenSSH's Base64 decoder expects it, so restore it before using this line.",
    });
  }
  line.sha256 = fingerprintSha256(key.plainBlob);
  line.md5 = fingerprintMd5(key.plainBlob);
  if (key.bits !== null && key.family !== "ed448") {
    const comment = line.comment || "no comment";
    line.keygen = `${key.bits} ${line.sha256} ${comment} (${key.label})`;
    line.keygenMd5 = `${key.bits} ${line.md5} ${comment} (${key.label})`;
  }
  for (const p of key.problems) line.findings.push({ tone: "danger", text: p });
  keyFindings(line, key, nowMs);
}

function keyFindings(line: KeyLine, key: DecodedKey, nowMs: number): void {
  const f = line.findings;
  switch (key.family) {
    case "dsa":
      f.push({
        tone: "danger",
        text: "DSA (ssh-dss) has been disabled by default since OpenSSH 7.0, and OpenSSH 10.0 removed it entirely. ssh-keygen limited DSA keys to 1024 bits. Replace this key.",
      });
      break;
    case "rsa": {
      const bits = key.rsaBits ?? 0;
      if (bits < OPENSSH_MIN_RSA_BITS) {
        f.push({
          tone: "danger",
          text: `A ${bits} bit RSA key is below OpenSSH's default RequiredRSASize of ${OPENSSH_MIN_RSA_BITS}, so current servers and clients refuse it. The public factoring record is already an 829 bit modulus (RSA-250, 2020).`,
        });
      } else if (bits < RECOMMENDED_RSA_BITS) {
        f.push({
          tone: "danger",
          text: `A ${bits} bit RSA key is below the ${RECOMMENDED_RSA_BITS} bit minimum NIST has required since 2014 (SP 800-131A). Replace it with Ed25519 or RSA of at least 3072 bits.`,
        });
      } else {
        f.push({ tone: "ok", text: `RSA with a ${bits} bit modulus meets the ${RECOMMENDED_RSA_BITS} bit minimum.` });
      }
      f.push({
        tone: "info",
        text: "The ssh-rsa type name is fine. What OpenSSH 8.8 disabled by default is the ssh-rsa signature algorithm, RSA with SHA-1. The same key still works with rsa-sha2-256 and rsa-sha2-512 signatures.",
      });
      break;
    }
    case "ecdsa":
      f.push({ tone: "ok", text: `ECDSA on ${key.details[0]?.value ?? "a NIST curve"}. Sound, though Ed25519 is the usual choice for new keys.` });
      break;
    case "ed25519":
      f.push({ tone: "ok", text: "Ed25519: a fixed 256 bit key with deterministic signatures, the default ssh-keygen choice for new keys." });
      break;
    case "ed448":
      f.push({ tone: "warn", text: "ssh-ed448 is defined in RFC 8709, but OpenSSH does not implement it, so sshd will not accept this line." });
      break;
    case "ecdsa-sk":
    case "ed25519-sk":
      f.push({
        tone: "ok",
        text: `A FIDO security key (${key.label}). The private key never leaves the authenticator, and each signature needs a touch unless no-touch-required is set. Application: ${key.application || "(empty)"}.`,
      });
      break;
  }
  const cert = key.certificate;
  if (cert) {
    const nowS = BigInt(Math.floor(nowMs / 1000));
    if (cert.validBefore !== UINT64_MAX && cert.validBefore <= nowS) {
      f.push({ tone: "danger", text: `This certificate expired (valid before ${formatCertTime(cert.validBefore)}).` });
    } else if (cert.validAfter > nowS) {
      f.push({ tone: "warn", text: `This certificate is not valid yet (valid after ${formatCertTime(cert.validAfter)}).` });
    }
    if (cert.signatureAlgorithm === "ssh-rsa") {
      f.push({
        tone: "danger",
        text: "The CA signed this certificate with ssh-rsa, RSA with SHA-1. Current OpenSSH leaves ssh-rsa out of its default CASignatureAlgorithms and rejects the certificate.",
      });
    }
    if (cert.principals.length === 0) {
      f.push({ tone: "warn", text: `The certificate lists no principals, which PROTOCOL.certkeys defines as valid for any ${cert.certType} principal.` });
    }
  }
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function optionFindings(line: KeyLine): void {
  const f = line.findings;
  const opts = line.options;
  const key = line.key;
  for (const o of opts) {
    if (o.error) f.push({ tone: "danger", text: `${o.error} sshd refuses the whole line when an option is invalid.` });
    if (o.canonical === "expiry-time" && o.expired) {
      f.push({ tone: "danger", text: `expiry-time="${o.value}" has passed, so sshd refuses this key.` });
    }
  }
  const has = (name: string) => opts.some((o) => o.canonical === name);
  if (opts.filter((o) => o.canonical === "command").length > 1) {
    f.push({ tone: "danger", text: "More than one command= option. sshd refuses a line with multiple command clauses." });
  }
  const eff = line.effective;
  if (has("command") && eff && (eff.portForwarding || eff.agentForwarding || eff.x11Forwarding)) {
    const open = [eff.portForwarding && "port forwarding", eff.agentForwarding && "agent forwarding", eff.x11Forwarding && "X11 forwarding"].filter(Boolean);
    f.push({
      tone: "warn",
      text: `command= is set but ${joinList(open as string[])} ${open.length === 1 ? "is" : "are"} still allowed. A forced command does not stop forwarding, so a key meant for one job can still open tunnels. Add restrict.`,
    });
  }
  if (has("principals") && !has("cert-authority")) {
    f.push({ tone: "warn", text: "principals= only has an effect on a cert-authority line, so here it is ignored." });
  }
  if ((has("no-touch-required") || has("verify-required") || has("touch-required")) && key && key.family !== "ecdsa-sk" && key.family !== "ed25519-sk") {
    f.push({ tone: "warn", text: "Touch and verification options only apply to FIDO security keys (sk- types). On this key they do nothing." });
  }
  if (has("no-touch-required") && key && (key.family === "ecdsa-sk" || key.family === "ed25519-sk")) {
    f.push({ tone: "warn", text: "no-touch-required lets this security key sign without a touch, so malware on the client can use it silently while it is plugged in." });
  }
  if (has("cert-authority") && key?.certificate) {
    f.push({ tone: "warn", text: "A cert-authority line should hold the CA's plain public key, but this line holds a certificate." });
  }
  if (opts.length > 0 && opts.every((o) => o.canonical === null && o.value === null)) {
    f.push({
      tone: "info",
      text: "If this line comes from a known_hosts file, the first field is a list of host names rather than options.",
    });
  }
  if (line.source === "authorized_keys" && opts.length === 0 && line.key && !line.error) {
    f.push({
      tone: "info",
      text: "No options: this key gets whatever sshd_config allows, normally a full shell with port, agent and X11 forwarding available.",
    });
  }
}

/** RFC 4716 section 3: BEGIN and END lines, headers with \ continuation, then Base64. */
function parseRfc4716(block: string[], startLine: number, nowMs: number): KeyLine {
  const line = newLine(startLine, block.join("\n"), "rfc4716");
  const body: string[] = [];
  let comment = "";
  let i = 1;
  for (; i < block.length - 1; i++) {
    const l = block[i].trim();
    const header = /^([\x21-\x39\x3b-\x7e]{1,64}):\s?(.*)$/.exec(l);
    if (header && body.length === 0) {
      let value = header[2];
      while (value.endsWith("\\") && i + 1 < block.length - 1) value = value.slice(0, -1) + block[++i].trim();
      if (header[1].toLowerCase() === "comment") comment = value.replace(/^"(.*)"$/, "$1");
    } else if (l) body.push(l);
  }
  line.comment = comment;
  const data = body.join("");
  const b64 = fromBase64(data);
  if (!b64.ok) {
    line.error = b64.error;
    return line;
  }
  const decoded = decodeKeyBlob(b64.bytes);
  if (!decoded.ok) {
    line.error = decoded.error;
    return line;
  }
  finishKey(line, decoded.key.type, toBase64(b64.bytes), nowMs);
  // ssh-keygen -l reads the one line form, so there is no direct equivalent to show.
  line.keygen = null;
  line.keygenMd5 = null;
  line.findings.unshift({
    tone: "info",
    text: `An RFC 4716 SSH2 public key block. sshd does not read this format; ssh-keygen -i -f file converts it to the one line form: ${decoded.key.type} ${data.slice(0, 16)}...`,
  });
  return line;
}

/** Parse authorized_keys style text: one key per line, with optional options. */
export function inspectKeys(text: string, nowMs: number): InspectResult {
  let capNote: string | null = null;
  let input = text;
  if (input.length > MAX_INPUT_CHARS) {
    input = input.slice(0, MAX_INPUT_CHARS);
    capNote = `Only the first ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters were read.`;
  }
  const rows = input.split(/\r?\n/);
  const lines: KeyLine[] = [];
  let commentLines = 0;
  let blankLines = 0;

  for (let n = 0; n < rows.length; n++) {
    if (lines.length >= MAX_LINES) {
      capNote = `Only the first ${MAX_LINES.toLocaleString("en-US")} key lines were inspected.`;
      break;
    }
    const raw = rows[n].replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
    if (raw === "") {
      blankLines++;
      continue;
    }
    if (raw.startsWith("#")) {
      commentLines++;
      continue;
    }
    if (/^---- BEGIN SSH2 PUBLIC KEY ----$/.test(raw)) {
      const block = [raw];
      let m = n + 1;
      for (; m < rows.length && m - n < 400; m++) {
        block.push(rows[m]);
        if (/^---- END SSH2 PUBLIC KEY ----$/.test(rows[m].trim())) break;
      }
      if (m >= rows.length || !/^---- END SSH2 PUBLIC KEY ----$/.test(rows[m].trim())) {
        const l = newLine(n + 1, raw, "rfc4716");
        l.error = "The SSH2 PUBLIC KEY block has no END line.";
        lines.push(l);
        break;
      }
      lines.push(parseRfc4716(block, n + 1, nowMs));
      n = m;
      continue;
    }
    if (/^-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(raw)) {
      const l = newLine(n + 1, raw, "authorized_keys");
      l.error = PRIVATE_HINT;
      lines.push(l);
      while (n + 1 < rows.length && !/^-----END /.test(rows[n].trim())) n++;
      continue;
    }
    if (/^-----BEGIN (RSA )?PUBLIC KEY-----/.test(raw)) {
      const l = newLine(n + 1, raw, "authorized_keys");
      l.error =
        "This is a PEM public key, not OpenSSH's one line format. ssh-keygen -i -m PKCS8 -f key.pem (or -m PEM for BEGIN RSA PUBLIC KEY) converts it.";
      lines.push(l);
      while (n + 1 < rows.length && !/^-----END /.test(rows[n].trim())) n++;
      continue;
    }
    lines.push(parseLine(raw, n + 1, nowMs));
  }

  // The same key on two lines: sshd reads in order and stops at the first
  // line whose key matches and whose options accept the connection.
  const seen = new Map<string, number>();
  for (const l of lines) {
    if (!l.sha256 || l.source !== "authorized_keys") continue;
    const first = seen.get(l.sha256);
    if (first !== undefined) {
      l.findings.push({
        tone: "warn",
        text: `The same key is on line ${first}. sshd reads lines in order and uses the first one whose key matches and whose options accept the connection, so which line's options apply can depend on where the connection comes from.`,
      });
    } else seen.set(l.sha256, l.lineNumber);
  }

  return { lines, commentLines, blankLines, capNote };
}

function splitKeyAndComment(rest: string): { type: string; data: string; comment: string } {
  const m = /^(\S+)(?:[ \t]+(\S+))?(?:[ \t]+(.*))?$/.exec(rest);
  if (!m) return { type: "", data: "", comment: "" };
  return { type: m[1], data: m[2] ?? "", comment: (m[3] ?? "").trim() };
}

export function parseLine(raw: string, lineNumber: number, nowMs: number): KeyLine {
  const line = newLine(lineNumber, raw, "authorized_keys");
  let rest = raw;

  // known_hosts markers, sshd(8) SSH_KNOWN_HOSTS FILE FORMAT.
  const marker = /^(@cert-authority|@revoked)[ \t]+/.exec(rest);
  if (marker) {
    line.marker = marker[1];
    line.source = "known_hosts";
    rest = rest.slice(marker[0].length);
  }

  const first = /^\S+/.exec(rest)?.[0] ?? "";
  const second = /^\S+[ \t]+(\S+)/.exec(rest)?.[1] ?? "";
  if (!isKeyType(first) && line.source === "authorized_keys" && /^AAAA[A-Za-z0-9+/]/.test(second) && !/[="]/.test(first)) {
    // Options are always followed by a key type, so a first field followed
    // directly by key data is a key type that is wrong or misspelled.
    const parts = splitKeyAndComment(rest);
    line.comment = parts.comment;
    finishKey(line, parts.type, parts.data, nowMs);
    return line;
  }
  if (!isKeyType(first)) {
    // Not a key type, so it is an options field (authorized_keys) or a host
    // list (known_hosts). sshd skips options the same way: to the first
    // whitespace outside double quotes.
    if (/^AAAA[A-Za-z0-9+/]/.test(first)) {
      const b64 = fromBase64(first);
      const decoded = b64.ok ? decodeKeyBlob(b64.bytes) : null;
      line.error =
        decoded && decoded.ok
          ? `The key type field is missing. The data is a ${decoded.key.type} key, so the line should start with "${decoded.key.type} ".`
          : "This line starts with Base64 but no key type.";
      return line;
    }
    const scanned = scanOptions(rest);
    if ("error" in scanned) {
      line.error = scanned.error;
      return line;
    }
    const after = splitKeyAndComment(scanned.rest);
    if (line.source === "known_hosts" || (looksLikeHosts(scanned.field) && isKeyType(after.type))) {
      line.source = "known_hosts";
      line.hosts = scanned.field;
      line.comment = after.comment;
      finishKey(line, after.type, after.data, nowMs);
      // ssh-keygen -lf prints the host field where a comment would go.
      if (line.key && line.keygen) {
        line.keygen = `${line.key.bits} ${line.sha256} ${line.hosts} (${line.key.label})`;
        line.keygenMd5 = `${line.key.bits} ${line.md5} ${line.hosts} (${line.key.label})`;
      }
      line.findings.unshift({
        tone: "info",
        text: line.hosts.startsWith("|1|")
          ? "A known_hosts entry with a hashed host name (HashKnownHosts), so the host it belongs to cannot be read back."
          : `A known_hosts entry for ${line.hosts}${line.marker ? `, marked ${line.marker}` : ""}. It tells the client which host key to expect, not who may log in.`,
      });
      return line;
    }
    line.optionsField = scanned.field;
    const parsed = parseOptions(scanned.field, nowMs);
    line.options = parsed.options;
    if (!parsed.ok) line.error = `The options field could not be read: ${parsed.error}`;
    line.comment = after.comment;
    if (!after.type) {
      line.error ??= "There is an options field but no key after it.";
      return line;
    }
    line.effective = effectivePermissions(line.options);
    finishKey(line, after.type, after.data, nowMs);
    optionFindings(line);
    return line;
  }

  const parts = splitKeyAndComment(rest);
  line.comment = parts.comment;
  if (line.source === "authorized_keys") line.effective = effectivePermissions([]);
  finishKey(line, parts.type, parts.data, nowMs);
  if (line.source === "authorized_keys") optionFindings(line);
  return line;
}
