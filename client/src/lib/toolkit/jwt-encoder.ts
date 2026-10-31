/**
 * JWT signing and verification for the JWT encoder page.
 *
 * Everything here follows the JWS Compact Serialization of RFC 7515 and the
 * algorithms of RFC 7518 section 3. Section numbers in comments refer to
 * those two documents unless another one is named. The cryptography is
 * WebCrypto's own (globalThis.crypto.subtle), which browsers expose on https
 * pages and on localhost and which Node exposes from version 19, so the unit
 * tests run the same code the page does. Nothing here touches the network.
 */

/* ------------------------------------------------------------------ limits */

/** Longest header or payload JSON accepted, in characters. */
export const MAX_JSON_CHARS = 16_384;
/** Longest token accepted for verification, in characters. */
export const MAX_TOKEN_CHARS = 65_536;
/** Longest HMAC secret accepted, in bytes after decoding. */
export const MAX_SECRET_BYTES = 4096;
/** Longest PEM block accepted, in characters. */
export const MAX_PEM_CHARS = 16_384;
/** Deepest JSON nesting walked when looking for rounded numbers. */
const MAX_WALK_DEPTH = 64;

/* -------------------------------------------------------------- algorithms */

export type JwsAlg = "HS256" | "HS384" | "HS512" | "RS256" | "ES256";
export type AlgFamily = "hmac" | "rsa" | "ecdsa";
type Hash = "SHA-256" | "SHA-384" | "SHA-512";

export interface AlgInfo {
  id: JwsAlg;
  family: AlgFamily;
  hash: Hash;
  /** Hash output length in bytes: the minimum HMAC key size of section 3.2. */
  hashBytes: number;
  label: string;
}

export const JWS_ALGS: AlgInfo[] = [
  { id: "HS256", family: "hmac", hash: "SHA-256", hashBytes: 32, label: "HMAC with SHA-256" },
  { id: "HS384", family: "hmac", hash: "SHA-384", hashBytes: 48, label: "HMAC with SHA-384" },
  { id: "HS512", family: "hmac", hash: "SHA-512", hashBytes: 64, label: "HMAC with SHA-512" },
  { id: "RS256", family: "rsa", hash: "SHA-256", hashBytes: 32, label: "RSASSA-PKCS1-v1_5 with SHA-256" },
  { id: "ES256", family: "ecdsa", hash: "SHA-256", hashBytes: 32, label: "ECDSA P-256 with SHA-256" },
];

export function algInfo(alg: JwsAlg): AlgInfo {
  return JWS_ALGS.find((a) => a.id === alg) ?? JWS_ALGS[0];
}

/** "alg" is case-sensitive (RFC 7515 section 4.1.1), so only exact matches count. */
export function asJwsAlg(value: unknown): JwsAlg | null {
  return typeof value === "string" && JWS_ALGS.some((a) => a.id === value) ? (value as JwsAlg) : null;
}

/** True for "none" in any capitalization, the Unsecured JWS of RFC 7518 section 3.6. */
export function isNoneAlg(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === "none";
}

/** Thrown when WebCrypto is missing, which happens on plain http pages. */
export class CryptoUnavailableError extends Error {
  constructor() {
    super("WebCrypto is not available here. Browsers expose crypto.subtle only on https pages and on localhost.");
    this.name = "CryptoUnavailableError";
  }
}

function subtle(): SubtleCrypto {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!s) throw new CryptoUnavailableError();
  return s;
}

/* ----------------------------------------------------------------- base64 */

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeWith(bytes: Uint8Array, alphabet: string, pad: boolean): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + alphabet[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + (pad ? "==" : "");
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63] + alphabet[(n >> 6) & 63] + (pad ? "=" : "");
  }
  return out;
}

/** base64url without padding: RFC 4648 section 5, as RFC 7515 section 2 requires. */
export function base64urlEncode(bytes: Uint8Array): string {
  return encodeWith(bytes, B64URL, false);
}

/** Standard Base64 with padding (RFC 4648 section 4), for PEM bodies and secrets. */
export function base64Encode(bytes: Uint8Array): string {
  return encodeWith(bytes, B64STD, true);
}

export type Bytes = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

function decodeAlphabet(body: string, values: (code: number) => number): Uint8Array | null {
  if (body.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((body.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < body.length; i++) {
    const v = values(body.charCodeAt(i));
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

function urlValue(c: number): number {
  if (c >= 65 && c <= 90) return c - 65;
  if (c >= 97 && c <= 122) return c - 71;
  if (c >= 48 && c <= 57) return c + 4;
  if (c === 45) return 62; // -
  if (c === 95) return 63; // _
  return -1;
}

function anyValue(c: number): number {
  if (c === 43) return 62; // +
  if (c === 47) return 63; // /
  return urlValue(c);
}

/**
 * Strict base64url for JWS segments: the URL-safe alphabet only, no padding,
 * no whitespace (section 2 and section 7.1 of RFC 7515).
 */
export function base64urlDecode(segment: string): Bytes {
  if (segment.includes("=")) {
    return { ok: false, error: "it contains = padding, which the JWS Compact Serialization leaves out" };
  }
  for (let i = 0; i < segment.length; i++) {
    if (urlValue(segment.charCodeAt(i)) < 0) {
      const ch = segment[i];
      const shown = ch === "+" || ch === "/" ? `"${ch}" (standard Base64, not base64url)` : /\s/.test(ch) ? "whitespace" : `"${ch}"`;
      return { ok: false, error: `character ${i + 1} is ${shown}` };
    }
  }
  const bytes = decodeAlphabet(segment, urlValue);
  if (!bytes) return { ok: false, error: "its length leaves a single dangling character, so part of it is missing" };
  return { ok: true, bytes };
}

/** Lenient Base64 for secrets: either alphabet, optional padding, whitespace ignored. */
export function base64DecodeLoose(text: string): Bytes {
  const compact = text.replace(/\s+/g, "");
  const body = compact.replace(/=+$/, "");
  if (compact.length - body.length > 2) return { ok: false, error: "it ends in more than two = signs" };
  for (let i = 0; i < body.length; i++) {
    if (anyValue(body.charCodeAt(i)) < 0) return { ok: false, error: `"${body[i]}" is not a Base64 character` };
  }
  const bytes = decodeAlphabet(body, anyValue);
  if (!bytes) return { ok: false, error: "its length leaves a single dangling character, so part of it is missing" };
  return { ok: true, bytes };
}

const utf8 = new TextEncoder();

export function utf8Bytes(text: string): Uint8Array {
  return utf8.encode(text);
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The ASCII bytes of a string already known to be base64url and dots. */
function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0x7f;
  return out;
}

/* ------------------------------------------------------------------- JSON */

export type JsonObject = Record<string, unknown>;
export type ParsedObject = { ok: true; value: JsonObject } | { ok: false; error: string };

/** Parse a JOSE header or a claims set, both of which must be JSON objects. */
export function parseJsonObject(text: string, label: string): ParsedObject {
  if (text.trim() === "") return { ok: false, error: `The ${label} is empty. It has to be a JSON object, at least {}.` };
  if (text.length > MAX_JSON_CHARS) {
    return { ok: false, error: `The ${label} is ${text.length.toLocaleString("en-US")} characters. This page reads up to ${MAX_JSON_CHARS.toLocaleString("en-US")}.` };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message.replace(/^JSON\.parse: /, "") : "it does not parse";
    return { ok: false, error: `The ${label} is not valid JSON: ${detail}.` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    const kind = Array.isArray(value) ? "an array" : value === null ? "null" : `a ${typeof value}`;
    return { ok: false, error: `The ${label} is ${kind}, but it has to be a JSON object in braces.` };
  }
  return { ok: true, value: value as JsonObject };
}

/** Integers past 2^53 that JSON.parse has already rounded, as written in the source. */
export function roundedIntegers(text: string, value: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > MAX_WALK_DEPTH || found.length >= 5) return;
    if (typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v)) found.push(String(v));
    else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === "object") Object.values(v as JsonObject).forEach((x) => walk(x, depth + 1));
  };
  walk(value, 0);
  if (found.length === 0) return [];
  // Report the literals the reader typed, not the rounded values.
  const literals = text.match(/-?\d{16,}/g) ?? [];
  return literals.length ? [...new Set(literals)].slice(0, 5) : found;
}

/** Set one claim to a NumericDate (RFC 7519 section 2) and pretty print the result. */
export function setNumericClaim(payloadText: string, claim: "iat" | "nbf" | "exp", seconds: number): { ok: true; text: string } | { ok: false; error: string } {
  const parsed = parseJsonObject(payloadText.trim() === "" ? "{}" : payloadText, "payload");
  if (!parsed.ok) return { ok: false, error: `${parsed.error} Fix it before adding ${claim}.` };
  const next: JsonObject = { ...parsed.value, [claim]: Math.floor(seconds) };
  return { ok: true, text: JSON.stringify(next, null, 2) };
}

/** Replace "alg" in a header, keeping the other members and their order. */
export function setHeaderAlg(headerText: string, alg: JwsAlg): string | null {
  const parsed = parseJsonObject(headerText, "header");
  if (!parsed.ok) return null;
  const next: JsonObject = "alg" in parsed.value ? {} : { alg };
  for (const [k, v] of Object.entries(parsed.value)) next[k] = k === "alg" ? alg : v;
  return JSON.stringify(next, null, 2);
}

/* ---------------------------------------------------------------- secrets */

export type SecretFormat = "text" | "base64";

export function parseSecret(text: string, format: SecretFormat): Bytes {
  if (text === "") return { ok: false, error: "Enter a secret. HMAC with an empty key is no secret at all." };
  const decoded = format === "text" ? { ok: true as const, bytes: utf8Bytes(text) } : base64DecodeLoose(text);
  if (!decoded.ok) return { ok: false, error: `The secret is not valid Base64: ${decoded.error}.` };
  if (decoded.bytes.length === 0) return { ok: false, error: "The secret decodes to zero bytes." };
  if (decoded.bytes.length > MAX_SECRET_BYTES) {
    return { ok: false, error: `The secret is ${decoded.bytes.length.toLocaleString("en-US")} bytes. This page accepts up to ${MAX_SECRET_BYTES.toLocaleString("en-US")}.` };
  }
  return decoded;
}

/** Secrets that appear in tutorials and public wordlists. Compared exactly, after trimming. */
const KNOWN_WEAK_SECRETS = new Set([
  "secret", "password", "changeme", "change-me", "changeit", "your-256-bit-secret", "your-384-bit-secret",
  "your-512-bit-secret", "jwt", "jwt_secret", "jwtsecret", "jwt-secret", "secretkey", "secret_key", "secret-key",
  "mysecret", "my_secret", "my-secret", "supersecret", "key", "test", "admin", "123456", "12345678", "qwerty",
  "shhhhh", "keyboard cat", "default", "token", "s3cr3t",
]);

export interface Note {
  tone: "danger" | "warn" | "info" | "ok";
  text: string;
}

/** Advice about an HMAC secret: length against section 3.2, wordlists, format slips. */
export function secretNotes(text: string, format: SecretFormat, bytes: Uint8Array, alg: AlgInfo): Note[] {
  const notes: Note[] = [];
  if (bytes.length < alg.hashBytes) {
    notes.push({
      tone: "danger",
      text: `This secret is ${bytes.length} ${bytes.length === 1 ? "byte" : "bytes"}. RFC 7518 section 3.2 requires at least ${alg.hashBytes} bytes (${alg.hashBytes * 8} bits) for ${alg.id}. Anyone holding one token can test guesses against it offline, with no rate limit.`,
    });
  }
  if (format === "text" && KNOWN_WEAK_SECRETS.has(text.trim().toLowerCase())) {
    notes.push({
      tone: "danger",
      text: "This secret appears in tutorials and public wordlists. Cracking tools try it first, so a token signed with it can be forged by anyone.",
    });
  } else if (format === "text" && bytes.length >= alg.hashBytes && /^[\x20-\x7e]+$/.test(text) && !/^[A-Za-z0-9+/_-]{40,}={0,2}$/.test(text.trim())) {
    notes.push({
      tone: "info",
      text: "A typed passphrase carries far fewer bits than its byte count suggests. A secret of random bytes, Base64 encoded, gives the full strength the length implies.",
    });
  }
  if (format === "text" && /^[A-Za-z0-9+/_-]{40,}={0,2}$/.test(text.trim())) {
    notes.push({
      tone: "info",
      text: "This looks like Base64 but is being used as text, so each character is one byte of key. Libraries differ on this; if the issuer decodes the secret first, switch the format to Base64 or the signatures will not match.",
    });
  }
  if (format === "text" && text !== text.trim()) {
    notes.push({ tone: "warn", text: "The secret starts or ends with whitespace, and that whitespace is part of the key." });
  }
  return notes;
}

/** Cryptographically random HMAC secret, Base64 encoded, sized to the hash output. */
export function randomSecret(alg: AlgInfo): string {
  const bytes = new Uint8Array(alg.hashBytes);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) throw new CryptoUnavailableError();
  c.getRandomValues(bytes);
  return base64Encode(bytes);
}

/* --------------------------------------------------------------------- PEM */

export type PemKind = "private" | "public";
export type Pem = { ok: true; der: Uint8Array; label: string } | { ok: false; error: string };

const CONVERT_HINTS: Record<string, string> = {
  "RSA PRIVATE KEY":
    "This is a PKCS#1 RSA private key. WebCrypto reads only PKCS#8 (BEGIN PRIVATE KEY). Convert a copy with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem",
  "EC PRIVATE KEY":
    "This is a SEC 1 EC private key. WebCrypto reads only PKCS#8 (BEGIN PRIVATE KEY). Convert a copy with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem",
  "ENCRYPTED PRIVATE KEY":
    "This private key is encrypted with a passphrase, which this page does not ask for. Decrypt a copy with: openssl pkcs8 -in key.pem -out key-plain.pem",
  "OPENSSH PRIVATE KEY":
    "This is an OpenSSH private key. Export a PKCS#8 copy with: ssh-keygen -p -m PKCS8 -f copy-of-key (it rewrites the file it is given, so use a copy).",
  "RSA PUBLIC KEY":
    "This is a PKCS#1 RSA public key. WebCrypto reads SubjectPublicKeyInfo (BEGIN PUBLIC KEY). Convert it with: openssl rsa -RSAPublicKey_in -in pub.pem -pubout",
  CERTIFICATE:
    "This is a certificate, not a bare key. Extract its public key with: openssl x509 -in cert.pem -pubkey -noout",
};

/** Read the first PEM block (RFC 7468) and return its DER bytes. */
export function pemToDer(text: string, want: PemKind): Pem {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: want === "private" ? "Paste a PKCS#8 private key (BEGIN PRIVATE KEY)." : "Paste a public key (BEGIN PUBLIC KEY)." };
  }
  if (text.length > MAX_PEM_CHARS) {
    return { ok: false, error: `That is ${text.length.toLocaleString("en-US")} characters. This page reads PEM blocks up to ${MAX_PEM_CHARS.toLocaleString("en-US")}.` };
  }
  const m = /-----BEGIN ([A-Z0-9 #]+)-----([\s\S]*?)-----END ([A-Z0-9 #]+)-----/.exec(trimmed);
  if (!m) {
    if (/^ssh-(rsa|ed25519)|^ecdsa-sha2-/.test(trimmed)) {
      return { ok: false, error: "This is an OpenSSH public key line. Convert it with: ssh-keygen -e -m PKCS8 -f key.pub" };
    }
    if (trimmed.startsWith("{")) return { ok: false, error: "This looks like a JWK. This page reads PEM; paste a key between BEGIN and END lines." };
    return { ok: false, error: "No PEM block found. A key starts with a line like -----BEGIN PUBLIC KEY----- and ends with the matching END line." };
  }
  const label = m[1];
  if (label !== m[3]) return { ok: false, error: `The block begins with ${label} but ends with ${m[3]}.` };
  const expected = want === "private" ? "PRIVATE KEY" : "PUBLIC KEY";
  if (label !== expected) {
    if (CONVERT_HINTS[label]) return { ok: false, error: CONVERT_HINTS[label] };
    if (want === "private" && label === "PUBLIC KEY") {
      return { ok: false, error: "This is a public key. Signing needs the matching private key (BEGIN PRIVATE KEY)." };
    }
    if (want === "public" && label === "PRIVATE KEY") {
      return {
        ok: false,
        error: "This is a private key. Verifying needs only the public key, and a private key should not be pasted where a public one will do. Derive it with: openssl pkey -in key.pem -pubout",
      };
    }
    return { ok: false, error: `This is a ${label} block, not a ${expected}.` };
  }
  // RFC 7468 allows whitespace inside the body; legacy headers ("Proc-Type:") only appear in other labels.
  const body = m[2].replace(/\s+/g, "");
  if (body === "") return { ok: false, error: "The PEM block has nothing between its BEGIN and END lines." };
  const decoded = base64DecodeLoose(body);
  if (!decoded.ok) return { ok: false, error: `The PEM body is not valid Base64: ${decoded.error}.` };
  if (decoded.bytes.length < 2 || decoded.bytes[0] !== 0x30) {
    return { ok: false, error: "The PEM body does not decode to a DER SEQUENCE, so it is not a key." };
  }
  return { ok: true, der: decoded.bytes, label };
}

export function derToPem(der: Uint8Array, label: string): string {
  const b64 = base64Encode(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

/* ------------------------------------------------------- key type from DER */

export type KeyType = "rsa" | "rsa-pss" | "ec-p256" | "ec-p384" | "ec-p521" | "ec-other" | "ed25519" | "ed448" | "x25519" | "unknown";

interface Tlv {
  tag: number;
  start: number;
  end: number;
}

/** One DER TLV at offset, or null if it runs past the buffer. Definite lengths only (X.690 section 10.1). */
function readTlv(der: Uint8Array, offset: number, limit: number): Tlv | null {
  if (offset + 2 > limit) return null;
  const tag = der[offset];
  let len = der[offset + 1];
  let start = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || start + n > limit) return null;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + der[start + i];
    start += n;
  }
  const end = start + len;
  if (end > limit) return null;
  return { tag, start, end };
}

const OIDS: Record<string, KeyType> = {
  "2a864886f70d010101": "rsa", // 1.2.840.113549.1.1.1 rsaEncryption
  "2a864886f70d01010a": "rsa-pss", // 1.2.840.113549.1.1.10 id-RSASSA-PSS
  "2b6570": "ed25519", // 1.3.101.112
  "2b6571": "ed448", // 1.3.101.113
  "2b656e": "x25519", // 1.3.101.110
};
const EC_PUBLIC_KEY = "2a8648ce3d0201"; // 1.2.840.10045.2.1 id-ecPublicKey
const CURVES: Record<string, KeyType> = {
  "2a8648ce3d030107": "ec-p256", // 1.2.840.10045.3.1.7 prime256v1
  "2b81040022": "ec-p384", // 1.3.132.0.34 secp384r1
  "2b81040023": "ec-p521", // 1.3.132.0.35 secp521r1
};

function hexOf(der: Uint8Array, t: Tlv): string {
  return Array.from(der.subarray(t.start, t.end), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The key algorithm named in a PKCS#8 PrivateKeyInfo (RFC 5208 section 5) or
 * a SubjectPublicKeyInfo (RFC 5280 section 4.1). Both put an
 * AlgorithmIdentifier near the front; PKCS#8 has a version INTEGER first.
 */
export function keyTypeOf(der: Uint8Array, kind: PemKind): KeyType {
  const outer = readTlv(der, 0, der.length);
  if (!outer || outer.tag !== 0x30) return "unknown";
  let pos = outer.start;
  if (kind === "private") {
    const version = readTlv(der, pos, outer.end);
    if (!version || version.tag !== 0x02) return "unknown";
    pos = version.end;
  }
  const algId = readTlv(der, pos, outer.end);
  if (!algId || algId.tag !== 0x30) return "unknown";
  const oid = readTlv(der, algId.start, algId.end);
  if (!oid || oid.tag !== 0x06) return "unknown";
  const oidHex = hexOf(der, oid);
  if (OIDS[oidHex]) return OIDS[oidHex];
  if (oidHex === EC_PUBLIC_KEY) {
    const params = readTlv(der, oid.end, algId.end);
    if (params && params.tag === 0x06) return CURVES[hexOf(der, params)] ?? "ec-other";
    return "ec-other";
  }
  return "unknown";
}

const KEY_TYPE_NAMES: Record<KeyType, string> = {
  rsa: "an RSA key",
  "rsa-pss": "an RSA-PSS key",
  "ec-p256": "an EC key on P-256",
  "ec-p384": "an EC key on P-384",
  "ec-p521": "an EC key on P-521",
  "ec-other": "an EC key on a curve this page does not know",
  ed25519: "an Ed25519 key",
  ed448: "an Ed448 key",
  x25519: "an X25519 key (key agreement, not signatures)",
  unknown: "a key of a type this page cannot identify",
};

/** Why a key cannot serve an algorithm, or null when it fits. */
export function keyMismatch(type: KeyType, alg: JwsAlg): string | null {
  const family = algInfo(alg).family;
  if (family === "rsa") {
    if (type === "rsa") return null;
    if (type === "rsa-pss") return "This is an RSA-PSS key, which is restricted to PSS signatures (PS256). RS256 needs a plain rsaEncryption key.";
    return `${alg} needs an RSA key, and this is ${KEY_TYPE_NAMES[type]}.`;
  }
  if (family === "ecdsa") {
    if (type === "ec-p256") return null;
    const hint = type === "ec-p384" ? " That curve belongs to ES384." : type === "ec-p521" ? " That curve belongs to ES512." : "";
    return `ES256 needs an EC key on P-256, and this is ${KEY_TYPE_NAMES[type]}.${hint}`;
  }
  return `${alg} uses a shared secret, not a key pair.`;
}

/* --------------------------------------------------------- WebCrypto keys */

function importParams(alg: AlgInfo): RsaHashedImportParams | EcKeyImportParams | HmacImportParams {
  if (alg.family === "rsa") return { name: "RSASSA-PKCS1-v1_5", hash: alg.hash };
  if (alg.family === "ecdsa") return { name: "ECDSA", namedCurve: "P-256" };
  return { name: "HMAC", hash: alg.hash };
}

function signParams(alg: AlgInfo): AlgorithmIdentifier | EcdsaParams {
  if (alg.family === "ecdsa") return { name: "ECDSA", hash: alg.hash };
  if (alg.family === "rsa") return { name: "RSASSA-PKCS1-v1_5" };
  return { name: "HMAC" };
}

/** Copy into a fresh ArrayBuffer-backed view, which every WebCrypto typing accepts. */
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

export async function importHmacKey(alg: AlgInfo, secret: Uint8Array, usage: "sign" | "verify"): Promise<CryptoKey> {
  return subtle().importKey("raw", buf(secret), importParams(alg), false, [usage]);
}

export type KeyResult = { ok: true; key: CryptoKey; notes: Note[] } | { ok: false; error: string };

function cryptoError(e: unknown, fallback: string): string {
  if (e instanceof CryptoUnavailableError) return e.message;
  return fallback;
}

/** Import a PKCS#8 private key for signing, after checking it suits the algorithm. */
export async function importPrivateKey(alg: AlgInfo, pemText: string, extractable = false): Promise<KeyResult> {
  const pem = pemToDer(pemText, "private");
  if (!pem.ok) return pem;
  const type = keyTypeOf(pem.der, "private");
  const mismatch = keyMismatch(type, alg.id);
  if (mismatch) return { ok: false, error: mismatch };
  try {
    const key = await subtle().importKey("pkcs8", buf(pem.der), importParams(alg), extractable, ["sign"]);
    return { ok: true, key, notes: keyNotes(key) };
  } catch (e) {
    return { ok: false, error: cryptoError(e, "The browser could not read this private key. The DER inside the PEM block is damaged or incomplete.") };
  }
}

/** Import a SubjectPublicKeyInfo public key for verification. */
export async function importPublicKey(alg: AlgInfo, pemText: string): Promise<KeyResult> {
  const pem = pemToDer(pemText, "public");
  if (!pem.ok) return pem;
  const type = keyTypeOf(pem.der, "public");
  const mismatch = keyMismatch(type, alg.id);
  if (mismatch) return { ok: false, error: mismatch };
  try {
    const key = await subtle().importKey("spki", buf(pem.der), importParams(alg), true, ["verify"]);
    return { ok: true, key, notes: keyNotes(key) };
  } catch (e) {
    return { ok: false, error: cryptoError(e, "The browser could not read this public key. The DER inside the PEM block is damaged or incomplete.") };
  }
}

function keyNotes(key: CryptoKey): Note[] {
  const a = key.algorithm as Partial<RsaHashedKeyAlgorithm>;
  if (typeof a.modulusLength === "number") {
    return a.modulusLength < 2048
      ? [{ tone: "danger", text: `This RSA key is ${a.modulusLength} bits. RFC 7518 section 3.3 requires 2048 bits or more for RS256.` }]
      : [{ tone: "info", text: `RSA key, ${a.modulusLength} bits.` }];
  }
  return [];
}

/** The SubjectPublicKeyInfo PEM for an extractable private key, so a token can be verified right away. */
export async function publicPemFromPrivate(alg: AlgInfo, privateKey: CryptoKey): Promise<string> {
  const s = subtle();
  const jwk = await s.exportKey("jwk", privateKey);
  const pub: JsonWebKey =
    alg.family === "rsa" ? { kty: "RSA", n: jwk.n, e: jwk.e } : { kty: "EC", crv: jwk.crv, x: jwk.x, y: jwk.y };
  const pubKey = await s.importKey("jwk", pub, importParams(alg), true, ["verify"]);
  return derToPem(new Uint8Array(await s.exportKey("spki", pubKey)), "PUBLIC KEY");
}

/** A fresh test key pair: RSA 2048 with exponent 65537, or P-256. Returned as PKCS#8 and SPKI PEM. */
export async function generateKeyPair(alg: AlgInfo): Promise<{ privatePem: string; publicPem: string }> {
  const s = subtle();
  const params =
    alg.family === "rsa"
      ? { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: alg.hash }
      : { name: "ECDSA", namedCurve: "P-256" };
  const pair = (await s.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await s.exportKey("pkcs8", pair.privateKey));
  const spki = new Uint8Array(await s.exportKey("spki", pair.publicKey));
  return { privatePem: derToPem(pkcs8, "PRIVATE KEY"), publicPem: derToPem(spki, "PUBLIC KEY") };
}

/* ---------------------------------------------------------------- signing */

/**
 * Sign the JWS Signing Input, ASCII(BASE64URL(header) || "." || BASE64URL(payload))
 * (section 5.1 step 7). For ES256 WebCrypto already returns the 64-byte
 * R || S form that RFC 7518 section 3.4 requires, not DER.
 */
export async function signSegments(alg: AlgInfo, key: CryptoKey, headerSeg: string, payloadSeg: string): Promise<Uint8Array> {
  const sig = await subtle().sign(signParams(alg), key, buf(asciiBytes(`${headerSeg}.${payloadSeg}`)));
  return new Uint8Array(sig);
}

export type KeyInput =
  | { kind: "secret"; text: string; format: SecretFormat }
  | { kind: "pem"; text: string };

export interface BuildInput {
  alg: JwsAlg;
  headerText: string;
  payloadText: string;
  key: KeyInput;
}

export interface Built {
  ok: true;
  token: string;
  headerSeg: string;
  payloadSeg: string;
  signatureSeg: string;
  signatureBytes: number;
  header: JsonObject;
  payload: JsonObject;
  notes: Note[];
  /** For RS256 and ES256, the public key that verifies this token. */
  publicPem: string | null;
}

export type BuildResult = Built | { ok: false; error: string; notes: Note[] };

/** Check the header and payload, then sign. Returns friendly errors, never throws. */
export async function buildToken(input: BuildInput): Promise<BuildResult> {
  const alg = algInfo(input.alg);
  const notes: Note[] = [];
  const header = parseJsonObject(input.headerText, "header");
  if (!header.ok) return { ok: false, error: header.error, notes };
  const payload = parseJsonObject(input.payloadText, "payload");
  if (!payload.ok) return { ok: false, error: payload.error, notes };

  const h = header.value;
  if (isNoneAlg(h.alg)) {
    return {
      ok: false,
      error: `The header says alg "${String(h.alg)}". That is an Unsecured JWS with an empty signature (RFC 7518 section 3.6), which verifiers must reject by default. This page does not make them. Set alg to ${alg.id}.`,
      notes,
    };
  }
  if (h.alg === undefined) return { ok: false, error: `The header has no alg. Add "alg": "${alg.id}".`, notes };
  if (h.alg !== alg.id) {
    return {
      ok: false,
      error: `The header says alg ${JSON.stringify(h.alg)}, but the signing algorithm is ${alg.id}. A verifier reads alg to choose how to check the signature, so the two have to agree. Pick ${alg.id} in the header or change the algorithm.`,
      notes,
    };
  }
  if ("crit" in h) {
    notes.push({
      tone: "warn",
      text: "The header has crit. RFC 7515 section 4.1.11 makes every verifier that does not understand the listed extensions reject the token.",
    });
  }
  if (h.typ !== undefined && h.typ !== "JWT" && h.typ !== "at+jwt" && typeof h.typ === "string" && h.typ.toUpperCase() === "JWT") {
    notes.push({ tone: "info", text: `typ is "${h.typ}". RFC 7519 section 5.1 recommends the uppercase "JWT".` });
  }
  for (const [label, text, value] of [
    ["header", input.headerText, h],
    ["payload", input.payloadText, payload.value],
  ] as const) {
    const rounded = roundedIntegers(text, value);
    if (rounded.length) {
      notes.push({
        tone: "warn",
        text: `The ${label} has ${rounded.join(", ")}, past 2^53, the largest integer JSON numbers carry exactly in JavaScript. It was rounded before signing. Send large identifiers as strings.`,
      });
    }
  }
  notes.push(...claimNotes(payload.value, Math.floor(Date.now() / 1000), "build"));

  // The signed bytes are the compact serialization of what was typed.
  const headerSeg = base64urlEncode(utf8Bytes(JSON.stringify(h)));
  const payloadSeg = base64urlEncode(utf8Bytes(JSON.stringify(payload.value)));

  let key: CryptoKey;
  let publicPem: string | null = null;
  try {
    if (alg.family === "hmac") {
      if (input.key.kind !== "secret") return { ok: false, error: `${alg.id} signs with a shared secret.`, notes };
      const secret = parseSecret(input.key.text, input.key.format);
      if (!secret.ok) return { ok: false, error: secret.error, notes };
      notes.push(...secretNotes(input.key.text, input.key.format, secret.bytes, alg));
      if (input.key.format === "text" && /-----BEGIN [A-Z ]*PUBLIC KEY-----/.test(input.key.text)) {
        notes.push({
          tone: "danger",
          text: "The secret is a PEM public key. An HMAC token signed with public key text is the shape of the RS256 to HS256 key confusion attack. A verifier that ties the algorithm to its configured key rejects it.",
        });
      }
      key = await importHmacKey(alg, secret.bytes, "sign");
    } else {
      if (input.key.kind !== "pem") return { ok: false, error: `${alg.id} signs with a private key.`, notes };
      const imported = await importPrivateKey(alg, input.key.text, true);
      if (!imported.ok) return { ok: false, error: imported.error, notes };
      notes.push(...imported.notes);
      key = imported.key;
      publicPem = await publicPemFromPrivate(alg, key);
    }
    const sig = await signSegments(alg, key, headerSeg, payloadSeg);
    const signatureSeg = base64urlEncode(sig);
    return {
      ok: true,
      token: `${headerSeg}.${payloadSeg}.${signatureSeg}`,
      headerSeg,
      payloadSeg,
      signatureSeg,
      signatureBytes: sig.length,
      header: h,
      payload: payload.value,
      notes,
      publicPem,
    };
  } catch (e) {
    return { ok: false, error: cryptoError(e, "The browser refused to sign with this key."), notes };
  }
}

/* ------------------------------------------------------------ claim times */

export function formatUtc(seconds: number): string {
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return "out of range";
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function describeDelta(seconds: number): string {
  const abs = Math.abs(seconds);
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (abs < 120) return unit(Math.round(abs), "second");
  if (abs < 7200) return unit(Math.round(abs / 60), "minute");
  if (abs < 172_800) return unit(Math.round(abs / 3600), "hour");
  if (abs < 63_072_000) return unit(Math.round(abs / 86_400), "day");
  return unit(Math.round(abs / 31_557_600), "year");
}

/** NumericDate checks of RFC 7519 sections 4.1.4 to 4.1.6, with no leeway. */
export function claimNotes(payload: JsonObject, now: number, mode: "build" | "verify"): Note[] {
  const notes: Note[] = [];
  for (const claim of ["exp", "nbf", "iat"] as const) {
    const v = payload[claim];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      notes.push({ tone: "danger", text: `${claim} is ${JSON.stringify(v)}, not a number. RFC 7519 section 2 defines a NumericDate as seconds since 1970, so most libraries reject the token.` });
      continue;
    }
    if (v > 1e11) {
      notes.push({
        tone: "warn",
        text: `${claim} is ${v}, which as seconds is ${formatUtc(v) === "out of range" ? "beyond any representable date" : `in the year ${new Date(v * 1000).getUTCFullYear()}`}. It looks like milliseconds; NumericDate is seconds (${formatUtc(v / 1000)} if divided by 1000).`,
      });
      continue;
    }
    const delta = v - now;
    if (claim === "exp") {
      if (delta <= 0) notes.push({ tone: mode === "verify" ? "danger" : "warn", text: `exp is ${formatUtc(v)}, ${describeDelta(delta)} ago. The token has expired, and section 4.1.4 says it must not be accepted.` });
      else notes.push({ tone: "info", text: `exp is ${formatUtc(v)}, in ${describeDelta(delta)}.` });
    } else if (claim === "nbf") {
      if (delta > 0) notes.push({ tone: mode === "verify" ? "danger" : "warn", text: `nbf is ${formatUtc(v)}, ${describeDelta(delta)} from now. Section 4.1.5 says the token must not be accepted before then.` });
      else notes.push({ tone: "info", text: `nbf is ${formatUtc(v)}, already passed.` });
    } else if (delta > 60) {
      notes.push({ tone: "warn", text: `iat is ${formatUtc(v)}, ${describeDelta(delta)} in the future. Either the issuer's clock is wrong or the claim was edited.` });
    } else {
      notes.push({ tone: "info", text: `iat is ${formatUtc(v)}.` });
    }
  }
  if (mode === "build" && payload.exp === undefined) {
    notes.push({ tone: "warn", text: "There is no exp. A token without one is valid until the key changes, because a stateless token cannot be revoked on its own." });
  }
  return notes;
}

/* ----------------------------------------------------------- verification */

export interface ParsedToken {
  headerSeg: string;
  payloadSeg: string;
  signatureSeg: string;
  header: JsonObject;
  payload: JsonObject | null;
  payloadText: string | null;
  signature: Uint8Array;
}

export type TokenParse = { ok: true; token: ParsedToken } | { ok: false; error: string };

/** Split and decode a JWS Compact Serialization (section 7.1). Nothing is verified here. */
export function parseToken(input: string): TokenParse {
  const text = input.trim().replace(/^Bearer\s+/i, "");
  if (text === "") return { ok: false, error: "Paste a token to verify." };
  if (text.length > MAX_TOKEN_CHARS) {
    return { ok: false, error: `The token is ${text.length.toLocaleString("en-US")} characters. This page reads up to ${MAX_TOKEN_CHARS.toLocaleString("en-US")}.` };
  }
  const parts = text.split(".");
  if (parts.length === 5) return { ok: false, error: "This has five segments, which is an encrypted JWE (RFC 7516), not a signed JWS. It cannot be verified with a signing key." };
  if (parts.length !== 3) return { ok: false, error: `A JWS has three segments separated by dots, and this has ${parts.length}.` };
  const [headerSeg, payloadSeg, signatureSeg] = parts;
  const names = ["header", "payload", "signature"];
  const decoded: Uint8Array[] = [];
  for (let i = 0; i < 3; i++) {
    const d = base64urlDecode(parts[i]);
    if (!d.ok) return { ok: false, error: `The ${names[i]} segment is not base64url: ${d.error}.` };
    decoded.push(d.bytes);
  }
  if (headerSeg === "") return { ok: false, error: "The header segment is empty." };
  const headerText = decodeUtf8(decoded[0]);
  if (headerText === null) return { ok: false, error: "The header does not decode to UTF-8 text." };
  let header: unknown;
  try {
    header = JSON.parse(headerText);
  } catch {
    return { ok: false, error: "The header decodes, but not to JSON." };
  }
  if (typeof header !== "object" || header === null || Array.isArray(header)) return { ok: false, error: "The header is JSON but not an object." };
  const payloadText = decodeUtf8(decoded[1]);
  let payload: JsonObject | null = null;
  if (payloadText !== null) {
    try {
      const p: unknown = JSON.parse(payloadText);
      if (p && typeof p === "object" && !Array.isArray(p)) payload = p as JsonObject;
    } catch {
      payload = null;
    }
  }
  return { ok: true, token: { headerSeg, payloadSeg, signatureSeg, header: header as JsonObject, payload, payloadText, signature: decoded[2] } };
}

export interface Verified {
  ok: true;
  token: ParsedToken;
  alg: string | null;
  /** True only when the signature checked out with the given key. */
  signatureValid: boolean;
  /** Signature valid and nothing else (alg, crit, exp, nbf) rules the token out. */
  accepted: boolean;
  verdict: string;
  notes: Note[];
}

export type VerifyResult = Verified | { ok: false; error: string };

const DER_ECDSA = /^30[0-9a-f]{2}02/;

/**
 * Verify a token with a key the reader chose. The algorithm comes from the
 * key kind first and the header second: a secret only ever checks HS*, a
 * public key only RS256 or ES256, which is the defense against the key
 * confusion attack (RFC 8725 section 3.1).
 */
export async function verifyToken(tokenText: string, key: KeyInput, now: number): Promise<VerifyResult> {
  const parsed = parseToken(tokenText);
  if (!parsed.ok) return parsed;
  const t = parsed.token;
  const notes: Note[] = [];
  const rawAlg = t.header.alg;
  const alg = typeof rawAlg === "string" ? rawAlg : null;
  const reject = (verdict: string): Verified => ({ ok: true, token: t, alg, signatureValid: false, accepted: false, verdict, notes });

  for (const p of ["jku", "x5u"] as const) {
    if (p in t.header) {
      notes.push({ tone: "warn", text: `The header has ${p}, a URL for fetching the key. A verifier that follows it lets the token pick its own key; use only keys from your own configuration.` });
    }
  }
  if ("jwk" in t.header) notes.push({ tone: "warn", text: "The header embeds a jwk. Anyone can embed their own public key, so a verifier must never trust it as the signing key." });
  if ("kid" in t.header) notes.push({ tone: "info", text: `kid is ${JSON.stringify(t.header.kid)}. It only selects among keys you already trust; a verifier must not use it in file paths or queries unescaped.` });
  if (t.payload === null) notes.push({ tone: "info", text: "The payload is not a JSON object, so it is not a JWT claims set. The signature can still be checked." });

  if (alg === null) return reject(rawAlg === undefined ? "Rejected: the header has no alg." : "Rejected: alg is not a string.");
  if (isNoneAlg(alg)) {
    notes.push({
      tone: "danger",
      text: `alg ${JSON.stringify(alg)} marks an Unsecured JWS${t.signature.length ? ", and this one still carries a signature segment, which section 3.6 forbids" : " with an empty signature"}. RFC 7518 section 3.6 says implementations must not accept it by default.${alg !== "none" ? " alg is case-sensitive, so this is not even the registered value; libraries that compared it case-insensitively were bypassed this way." : ""}`,
    });
    return reject("Rejected: alg none carries no signature to verify.");
  }
  const known = asJwsAlg(alg);
  if (!known) {
    const near = JWS_ALGS.find((a) => a.id.toLowerCase() === alg.toLowerCase());
    return reject(
      near
        ? `Rejected: alg "${alg}" is not "${near.id}". Algorithm names are case-sensitive (RFC 7515 section 4.1.1).`
        : `Not checked: this page verifies HS256, HS384, HS512, RS256 and ES256, and the token says ${JSON.stringify(alg)}.`,
    );
  }
  const info = algInfo(known);

  // The key decides the family. A mismatch is refused, never reinterpreted.
  if (key.kind === "pem" && info.family === "hmac") {
    notes.push({
      tone: "danger",
      text: `The token asks for ${known}, an HMAC, but the key is a public key. This is the RS256 to HS256 key confusion attack: a verifier that let alg decide would use the public key's bytes as the HMAC secret, and since the public key is public, anyone could sign such a token. A correct verifier fixes the algorithm per key, as this one does.`,
    });
    return reject(`Rejected: a public key never verifies ${known}.`);
  }
  if (key.kind === "secret" && info.family !== "hmac") {
    return reject(`Rejected: the token asks for ${known}, which needs a public key, and the key given is a shared secret.`);
  }

  if ("crit" in t.header) {
    notes.push({
      tone: "danger",
      text: `The header lists crit ${JSON.stringify(t.header.crit)}. This verifier understands no extensions, so RFC 7515 section 4.1.11 makes the token invalid whatever the signature says.`,
    });
  }

  // Length hints before the cryptographic check.
  if (info.family === "hmac" && t.signature.length !== info.hashBytes) {
    notes.push({ tone: "warn", text: `The signature is ${t.signature.length} bytes, and ${known} produces exactly ${info.hashBytes}. It cannot match.` });
  }
  if (info.family === "ecdsa" && t.signature.length !== 64) {
    const hex = Array.from(t.signature.subarray(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
    notes.push({
      tone: "warn",
      text: DER_ECDSA.test(hex) && t.signature.length >= 8 && t.signature.length <= 72
        ? `The signature is ${t.signature.length} bytes and starts like a DER SEQUENCE. JWS uses the fixed 64-byte R || S form (RFC 7518 section 3.4), so a signer that emitted DER produced a token no conforming verifier accepts.`
        : `The signature is ${t.signature.length} bytes, and ES256 signatures are exactly 64 (R || S, RFC 7518 section 3.4).`,
    });
  }

  let cryptoKey: CryptoKey;
  try {
    if (key.kind === "secret") {
      const secret = parseSecret(key.text, key.format);
      if (!secret.ok) return { ok: false, error: secret.error };
      if (key.format === "text" && /-----BEGIN [A-Z ]*PUBLIC KEY-----/.test(key.text)) {
        notes.push({
          tone: "danger",
          text: `The secret is PEM public key text. If this ${known} token verifies with it, the token was made the way an RS256 to HS256 key confusion forgery is made, and a server that verifies RS256 with that key must reject it.`,
        });
      }
      if (secret.bytes.length < info.hashBytes) {
        notes.push({ tone: "warn", text: `The secret is ${secret.bytes.length} bytes, under the ${info.hashBytes} that RFC 7518 section 3.2 requires for ${known}. If it is the real secret, tokens from this issuer can be forged by guessing it.` });
      }
      cryptoKey = await importHmacKey(info, secret.bytes, "verify");
    } else {
      const imported = await importPublicKey(info, key.text);
      if (!imported.ok) return { ok: false, error: imported.error };
      notes.push(...imported.notes);
      cryptoKey = imported.key;
      const modulus = (cryptoKey.algorithm as Partial<RsaHashedKeyAlgorithm>).modulusLength;
      if (typeof modulus === "number" && t.signature.length !== Math.ceil(modulus / 8)) {
        notes.push({ tone: "warn", text: `The signature is ${t.signature.length} bytes, and a ${modulus}-bit RSA key produces ${Math.ceil(modulus / 8)}. It cannot match.` });
      }
    }
  } catch (e) {
    return { ok: false, error: cryptoError(e, "The browser could not use this key.") };
  }

  let valid: boolean;
  try {
    // subtle.verify compares in constant time, as RFC 7518 section 3.2 asks of HMAC checks.
    valid = await subtle().verify(signParams(info), cryptoKey, buf(t.signature), buf(asciiBytes(`${t.headerSeg}.${t.payloadSeg}`)));
  } catch (e) {
    return { ok: false, error: cryptoError(e, "The browser refused to run the verification.") };
  }

  if (t.payload) notes.push(...claimNotes(t.payload, now, "verify"));
  const timeProblem = notes.some((n) => n.tone === "danger" && /^(exp|nbf) /.test(n.text));
  const critProblem = "crit" in t.header;

  let verdict: string;
  if (!valid) verdict = `Signature invalid: the ${known} signature does not match this key and these exact bytes.`;
  else if (critProblem) verdict = "Signature valid, but the token is rejected because of crit.";
  else if (timeProblem) verdict = "Signature valid, but the token is outside its validity window.";
  else verdict = `Signature valid: ${known} with this key over these exact bytes.`;
  return { ok: true, token: t, alg, signatureValid: valid, accepted: valid && !critProblem && !timeProblem, verdict, notes };
}
