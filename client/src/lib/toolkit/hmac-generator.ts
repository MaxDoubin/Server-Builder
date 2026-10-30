/**
 * HMAC (RFC 2104, FIPS 198-1) over WebCrypto, with the byte parsing, the
 * constant-time comparison and the mismatch diagnosis the HMAC tool needs.
 *
 * Pure logic: no React and no DOM. The only platform dependency is
 * globalThis.crypto.subtle, which browsers expose on secure origins and
 * Node exposes from version 19, so the same file runs in the page and in
 * the unit tests.
 */

export type HmacAlg = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export interface HmacAlgInfo {
  id: HmacAlg;
  /** B in RFC 2104: the hash's internal block size in bytes. */
  blockBytes: number;
  /** L in RFC 2104: the hash's output size in bytes. */
  outBytes: number;
}

export const HMAC_ALGS: HmacAlgInfo[] = [
  { id: "SHA-1", blockBytes: 64, outBytes: 20 },
  { id: "SHA-256", blockBytes: 64, outBytes: 32 },
  { id: "SHA-384", blockBytes: 128, outBytes: 48 },
  { id: "SHA-512", blockBytes: 128, outBytes: 64 },
];

export function algInfo(alg: HmacAlg): HmacAlgInfo {
  return HMAC_ALGS.find((a) => a.id === alg) ?? HMAC_ALGS[1];
}

export type ByteFormat = "text" | "hex" | "base64";

/** Largest message hashed, after decoding. WebCrypto would take more; a textarea would not. */
export const MAX_MESSAGE_BYTES = 1_048_576;
/** Largest key accepted, after decoding. Anything over the block size is hashed down anyway. */
export const MAX_KEY_BYTES = 65_536;
/** The mismatch diagnosis recomputes the MAC a dozen times, so it only runs on messages up to this size. */
export const MAX_DIAGNOSE_BYTES = 65_536;

export type BytesResult = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

/* ----------------------------------------------------------- text, hex, b64 */

/**
 * UTF-8, as TextEncoder produces it. A lone surrogate (half of an emoji
 * pasted badly) becomes U+FFFD, the same substitution every browser and
 * Node make, so the bytes match what a server would hash for the same text.
 */
export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const HEX_DIGITS = "0123456789abcdef";

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += HEX_DIGITS[bytes[i] >> 4] + HEX_DIGITS[bytes[i] & 15];
  }
  return out;
}

function describeChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp < 0x20 || cp === 0x7f) return `control character U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  return `"${ch}"`;
}

/** Character code to value, or -1. Built once so the parsers do not run a regex per character. */
const HEX_VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < 16; i++) {
  HEX_VALUE[HEX_DIGITS.charCodeAt(i)] = i;
  HEX_VALUE[HEX_DIGITS.toUpperCase().charCodeAt(i)] = i;
}

/** Space, tab, CR, LF, vertical tab, form feed. */
function isSpace(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

/**
 * Hex with the separators people paste: spaces, newlines, colons (as in
 * openssl and Wireshark output) and a single leading 0x.
 */
export function parseHex(input: string): BytesResult {
  let start = 0;
  while (start < input.length && isSpace(input.charCodeAt(start))) start++;
  if (input[start] === "0" && (input[start + 1] === "x" || input[start + 1] === "X")) start += 2;
  const digits = new Uint8Array(input.length);
  let count = 0;
  for (let i = start; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (isSpace(code) || code === 0x3a) continue;
    const v = code < 128 ? HEX_VALUE[code] : -1;
    if (v === -1) {
      return {
        ok: false,
        error: `Hex uses 0 to 9 and a to f. Found ${describeChar(String.fromCodePoint(input.codePointAt(i) ?? code))} at position ${i + 1}.`,
      };
    }
    digits[count++] = v;
  }
  if (count % 2 !== 0) {
    return {
      ok: false,
      error: `Hex needs two digits per byte. This has ${count} digits, so one is missing or extra.`,
    };
  }
  const bytes = new Uint8Array(count / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (digits[2 * i] << 4) | digits[2 * i + 1];
  return { ok: true, bytes };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64_VALUE[B64.charCodeAt(i)] = i;
B64_VALUE[0x2d] = 62; // "-" in the URL-safe alphabet
B64_VALUE[0x5f] = 63; // "_"

/**
 * Base64 per RFC 4648 section 4, also accepting the URL-safe alphabet of
 * section 5, embedded whitespace, and missing padding. Decoded by hand so
 * an error can say which character and where, which atob cannot.
 */
export function parseBase64(input: string): BytesResult {
  const values = new Uint8Array(input.length);
  let count = 0;
  let padding = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (isSpace(code)) continue;
    if (code === 0x3d) {
      padding += 1;
      continue;
    }
    const ch = String.fromCodePoint(input.codePointAt(i) ?? code);
    if (padding > 0) {
      return {
        ok: false,
        error: `Padding (=) can only come at the end, but ${describeChar(ch)} follows it at position ${i + 1}.`,
      };
    }
    const v = code < 128 ? B64_VALUE[code] : -1;
    if (v === -1) {
      return {
        ok: false,
        error: `Base64 uses A to Z, a to z, 0 to 9, + and / (or - and _). Found ${describeChar(ch)} at position ${i + 1}.`,
      };
    }
    values[count++] = v;
  }
  if (padding > 2) {
    return { ok: false, error: `Base64 never needs more than two = signs. This has ${padding}.` };
  }
  if (count % 4 === 1) {
    return {
      ok: false,
      error: `${count} Base64 characters cannot be whole bytes: a final group of one character is impossible, so a character is missing or extra.`,
    };
  }
  if (padding > 0 && (count + padding) % 4 !== 0) {
    return {
      ok: false,
      error: "The = padding does not match the length. Either remove it or check for a missing character.",
    };
  }
  const bytes = new Uint8Array(Math.floor((count * 6) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < count; i++) {
    acc = ((acc << 6) | values[i]) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[j++] = (acc >> bits) & 0xff;
    }
  }
  return { ok: true, bytes };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

/** RFC 4648 section 5, unpadded, as JWS signatures use it (RFC 7515 section 2). */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode an input field in its chosen format, refusing anything over the cap. */
export function parseBytes(input: string, format: ByteFormat, maxBytes: number, what: string): BytesResult {
  // A cheap upper bound first, so a pasted novel is refused before it is walked.
  // Generous enough for separators and line breaks; the exact cap is applied after decoding.
  const limitChars = format === "hex" ? maxBytes * 4 + 16 : Math.ceil(maxBytes / 3) * 8 + 16;
  if (format !== "text" && input.length > limitChars) {
    return { ok: false, error: `The ${what} is longer than the ${formatBytes(maxBytes)} this tool will hash.` };
  }
  let result: BytesResult;
  if (format === "text") result = { ok: true, bytes: utf8Encode(input) };
  else if (format === "hex") result = parseHex(input);
  else result = parseBase64(input);
  if (result.ok && result.bytes.length > maxBytes) {
    return {
      ok: false,
      error: `The ${what} is ${formatBytes(result.bytes.length)}, over the ${formatBytes(maxBytes)} this tool will hash.`,
    };
  }
  return result;
}

export function formatBytes(n: number): string {
  if (n >= 1_048_576 && n % 1_048_576 === 0) return `${n / 1_048_576} MiB`;
  if (n >= 1024 && n % 1024 === 0) return `${n / 1024} KiB`;
  return `${n.toLocaleString("en-US")} ${n === 1 ? "byte" : "bytes"}`;
}

/* ------------------------------------------------------------ comparison */

/**
 * Compare two MACs without returning early.
 *
 * Every byte pair is XORed into one accumulator and the answer is read only
 * at the end, so the loop takes the same number of steps whether the first
 * byte differs or the last one does. Length is treated as public, the same
 * choice Node's crypto.timingSafeEqual and Go's subtle.ConstantTimeCompare
 * make: the length of a MAC is fixed by the algorithm and is no secret.
 *
 * In JavaScript this is best effort, since a JIT gives no timing guarantee.
 * The point it illustrates is the server-side one.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export type ExpectedFormat = "auto" | "hex" | "base64";

export type ExpectedResult =
  | { ok: true; bytes: Uint8Array; format: "hex" | "base64"; prefix: string | null }
  | { ok: false; error: string };

/**
 * Read a MAC someone else produced. GitHub sends webhook signatures as
 * "sha256=<hex>" (and the older "sha1=<hex>"), so a leading algorithm label
 * is stripped and reported rather than treated as bad input.
 */
export function parseExpectedMac(input: string, format: ExpectedFormat): ExpectedResult {
  let text = input.trim();
  let prefix: string | null = null;
  const labelled = /^(sha(?:-?1|-?256|-?384|-?512))\s*[=:]\s*/i.exec(text);
  if (labelled) {
    prefix = labelled[1].toLowerCase();
    text = text.slice(labelled[0].length);
  }
  if (text === "") return { ok: false, error: "There is nothing after the label to compare." };
  let chosen: "hex" | "base64";
  if (format === "auto") {
    const hexDigits = text.replace(/^0x/i, "").replace(/[\s:]/g, "");
    chosen = /^[0-9a-f]+$/i.test(hexDigits) && hexDigits.length % 2 === 0 ? "hex" : "base64";
  } else {
    chosen = format;
  }
  const parsed = chosen === "hex" ? parseHex(text) : parseBase64(text);
  if (!parsed.ok) return parsed;
  if (parsed.bytes.length === 0) return { ok: false, error: "The MAC decoded to zero bytes." };
  if (parsed.bytes.length > 64) {
    return {
      ok: false,
      error: `That is ${parsed.bytes.length} bytes. The longest MAC here is HMAC-SHA-512 at 64 bytes.`,
    };
  }
  return { ok: true, bytes: parsed.bytes, format: chosen, prefix };
}

export type VerifyOutcome =
  | { kind: "match" }
  | { kind: "mismatch" }
  | { kind: "truncated-match"; bytes: number }
  | { kind: "length"; provided: number; computed: number; prefixChecked: boolean };

/**
 * RFC 2104 section 5 allows sending only the leftmost t bits of a MAC, with
 * t at least half the output and at least 80 bits. A shorter MAC that equals
 * the start of the computed one is reported as that, not as a failure.
 */
export function verifyMac(computed: Uint8Array, provided: Uint8Array): VerifyOutcome {
  if (provided.length === computed.length) {
    return timingSafeEqual(computed, provided) ? { kind: "match" } : { kind: "mismatch" };
  }
  const minTruncated = Math.max(Math.ceil(computed.length / 2), 10);
  if (provided.length < computed.length && provided.length >= minTruncated) {
    if (timingSafeEqual(computed.subarray(0, provided.length), provided)) {
      return { kind: "truncated-match", bytes: provided.length };
    }
    return { kind: "length", provided: provided.length, computed: computed.length, prefixChecked: true };
  }
  return { kind: "length", provided: provided.length, computed: computed.length, prefixChecked: false };
}

/* --------------------------------------------------------------- hashing */

export class CryptoUnavailableError extends Error {
  constructor() {
    super(
      "WebCrypto is not available here. Browsers expose crypto.subtle only on https pages and on localhost.",
    );
    this.name = "CryptoUnavailableError";
  }
}

function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!s) throw new CryptoUnavailableError();
  return s;
}

/**
 * HMAC through WebCrypto's own implementation.
 *
 * WebCrypto refuses to import a zero-length raw HMAC key (it throws a
 * DataError), but RFC 2104 section 2 pads any key shorter than B with zero
 * bytes. The empty key and the one byte key 0x00 therefore produce the same
 * K0, the same block of B zero bytes, and the same MAC, so the one byte key
 * stands in for the empty one.
 */
export async function computeHmac(alg: HmacAlg, key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const s = subtle();
  const k = key.length === 0 ? new Uint8Array(1) : key;
  const cryptoKey = await s.importKey("raw", k, { name: "HMAC", hash: alg }, false, ["sign"]);
  return new Uint8Array(await s.sign("HMAC", cryptoKey, message));
}

async function digest(alg: HmacAlg, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest(alg, data));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export interface HmacSteps {
  alg: HmacAlg;
  blockBytes: number;
  keyBytes: number;
  /** True when the key was longer than B and was replaced by its hash. */
  keyHashed: boolean;
  /** K0: the key, hashed if needed, then zero padded to B bytes. */
  k0: Uint8Array;
  /** H((K0 xor ipad) || message). */
  inner: Uint8Array;
  /** H((K0 xor opad) || inner), which is the MAC. */
  mac: Uint8Array;
}

/**
 * The same MAC built step by step from the bare hash, following FIPS 198-1
 * section 4 (which restates RFC 2104 section 2):
 *
 *   K0    = K padded with zeros to B bytes, after H(K) if K is longer than B
 *   inner = H((K0 xor 0x36...) || text)
 *   MAC   = H((K0 xor 0x5c...) || inner)
 *
 * The tool computes both this and computeHmac and shows an error if they
 * ever disagree, which makes each one a check on the other.
 */
export async function hmacSteps(alg: HmacAlg, key: Uint8Array, message: Uint8Array): Promise<HmacSteps> {
  const { blockBytes } = algInfo(alg);
  const keyHashed = key.length > blockBytes;
  const shortened = keyHashed ? await digest(alg, key) : key;
  const k0 = new Uint8Array(blockBytes);
  k0.set(shortened, 0);
  const ipadKey = new Uint8Array(blockBytes);
  const opadKey = new Uint8Array(blockBytes);
  for (let i = 0; i < blockBytes; i++) {
    ipadKey[i] = k0[i] ^ 0x36;
    opadKey[i] = k0[i] ^ 0x5c;
  }
  const inner = await digest(alg, concat(ipadKey, message));
  const mac = await digest(alg, concat(opadKey, inner));
  return { alg, blockBytes, keyBytes: key.length, keyHashed, k0, inner, mac };
}

/* ------------------------------------------------------------- diagnosis */

export interface Diagnosis {
  alg: HmacAlg;
  /** Plain description of what had to change for the MAC to match. */
  changes: string[];
}

interface Variant {
  bytes: Uint8Array;
  note: string | null;
}

function keyVariants(raw: string, format: ByteFormat): Variant[] {
  const out: Variant[] = [];
  const original = parseBytes(raw, format, MAX_KEY_BYTES, "key");
  if (original.ok) out.push({ bytes: original.bytes, note: null });
  const others: ByteFormat[] = format === "text" ? ["hex", "base64"] : ["text"];
  const label: Record<ByteFormat, string> = { text: "UTF-8 text", hex: "hex", base64: "Base64" };
  for (const other of others) {
    if (raw.trim() === "") continue;
    const parsed = parseBytes(raw, other, MAX_KEY_BYTES, "key");
    if (!parsed.ok) continue;
    if (out.some((v) => bytesToHex(v.bytes) === bytesToHex(parsed.bytes))) continue;
    out.push({ bytes: parsed.bytes, note: `the key read as ${label[other]} instead of ${label[format]}` });
  }
  return out;
}

function messageVariants(raw: string, format: ByteFormat): Variant[] {
  const out: Variant[] = [];
  const original = parseBytes(raw, format, MAX_DIAGNOSE_BYTES, "message");
  if (original.ok) out.push({ bytes: original.bytes, note: null });
  if (format === "text") {
    if (raw.endsWith("\r\n")) {
      out.push({ bytes: utf8Encode(raw.slice(0, -2)), note: "the message without its trailing CRLF" });
    } else if (raw.endsWith("\n")) {
      out.push({ bytes: utf8Encode(raw.slice(0, -1)), note: "the message without its trailing newline" });
    } else {
      out.push({
        bytes: utf8Encode(raw + "\n"),
        note: "the message with a trailing newline, which is what echo adds without -n",
      });
      out.push({ bytes: utf8Encode(raw + "\r\n"), note: "the message with a trailing CRLF" });
    }
  } else if (utf8Encode(raw).length <= MAX_DIAGNOSE_BYTES) {
    out.push({
      bytes: utf8Encode(raw),
      note: `the message hashed as the literal text typed rather than decoded from ${format === "hex" ? "hex" : "Base64"}`,
    });
  }
  return out;
}

/**
 * When a provided MAC does not match, try the mistakes that cause most
 * mismatches in practice: the wrong algorithm, a key used as text when it
 * was meant as hex or the other way round, and a trailing newline. Only
 * algorithms whose output length fits the provided MAC are tried, and only
 * on messages up to MAX_DIAGNOSE_BYTES, so this is at most a dozen HMACs.
 */
export async function diagnoseMismatch(
  provided: Uint8Array,
  rawKey: string,
  keyFormat: ByteFormat,
  rawMessage: string,
  messageFormat: ByteFormat,
  selected: HmacAlg,
): Promise<Diagnosis | null> {
  const algs = HMAC_ALGS.filter((a) => {
    if (a.outBytes === provided.length) return true;
    const minTruncated = Math.max(Math.ceil(a.outBytes / 2), 10);
    return provided.length < a.outBytes && provided.length >= minTruncated;
  });
  if (algs.length === 0) return null;
  const keys = keyVariants(rawKey, keyFormat);
  const messages = messageVariants(rawMessage, messageFormat);
  for (const k of keys) {
    for (const m of messages) {
      for (const a of algs) {
        if (k.note === null && m.note === null && a.id === selected) continue;
        const mac = await computeHmac(a.id, k.bytes, m.bytes);
        const outcome = verifyMac(mac, provided);
        if (outcome.kind === "match" || outcome.kind === "truncated-match") {
          const changes: string[] = [];
          if (a.id !== selected) changes.push(`HMAC-${a.id} instead of HMAC-${selected}`);
          if (k.note) changes.push(k.note);
          if (m.note) changes.push(m.note);
          if (outcome.kind === "truncated-match") changes.push(`the MAC truncated to its first ${outcome.bytes} bytes`);
          return { alg: a.id, changes };
        }
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------- examples */

export interface HmacExample {
  id: string;
  label: string;
  source: string;
  key: string;
  keyFormat: ByteFormat;
  message: string;
  messageFormat: ByteFormat;
  /** Published values. SHA-1 comes from RFC 2202, which uses the same inputs for cases 1 and 2. */
  expected: Partial<Record<HmacAlg, string>>;
}

/** RFC 4231 section 4 test cases 1, 2 and 6, with RFC 2202 section 3 for HMAC-SHA-1. */
export const HMAC_EXAMPLES: HmacExample[] = [
  {
    id: "rfc4231-1",
    label: "RFC 4231 case 1",
    source: "RFC 4231 test case 1 (RFC 2202 test case 1 for SHA-1)",
    key: "0b".repeat(20),
    keyFormat: "hex",
    message: "Hi There",
    messageFormat: "text",
    expected: {
      "SHA-1": "b617318655057264e28bc0b6fb378c8ef146be00",
      "SHA-256": "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
      "SHA-384":
        "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6",
      "SHA-512":
        "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
    },
  },
  {
    id: "rfc4231-2",
    label: "RFC 4231 case 2",
    source: "RFC 4231 test case 2 (RFC 2202 test case 2 for SHA-1)",
    key: "Jefe",
    keyFormat: "text",
    message: "what do ya want for nothing?",
    messageFormat: "text",
    expected: {
      "SHA-1": "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79",
      "SHA-256": "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
      "SHA-384":
        "af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649",
      "SHA-512":
        "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737",
    },
  },
  {
    id: "rfc4231-6",
    label: "RFC 4231 case 6",
    source: "RFC 4231 test case 6: a 131 byte key, longer than any block size, so it is hashed first",
    key: "aa".repeat(131),
    keyFormat: "hex",
    message: "Test Using Larger Than Block-Size Key - Hash Key First",
    messageFormat: "text",
    expected: {
      "SHA-256": "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54",
      "SHA-384":
        "4ece084485813e9088d2c63a041bc5b44f9ef1012a2b588f3cd11f05033ac4c60c2ef6ab4030fe8296248df163f44952",
      "SHA-512":
        "80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598",
    },
  },
];

/** The example whose key and message bytes equal the given ones, if any. */
export function matchExample(key: Uint8Array, message: Uint8Array): HmacExample | null {
  const k = bytesToHex(key);
  const m = bytesToHex(message);
  for (const ex of HMAC_EXAMPLES) {
    const ek = parseBytes(ex.key, ex.keyFormat, MAX_KEY_BYTES, "key");
    const em = parseBytes(ex.message, ex.messageFormat, MAX_MESSAGE_BYTES, "message");
    if (ek.ok && em.ok && bytesToHex(ek.bytes) === k && bytesToHex(em.bytes) === m) return ex;
  }
  return null;
}
