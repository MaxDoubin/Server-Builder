/**
 * DKIM key records and DKIM-Signature header fields, read offline.
 *
 * The tag-list grammar is RFC 6376 section 3.2, the key record tags are
 * section 3.6.1 and the signature tags section 3.5. RFC 8301 sets the RSA
 * key size floor and retires SHA-1, and RFC 8463 adds Ed25519. The p= value
 * of an RSA key is DER (ITU-T X.690), read by the small parser below: it
 * handles definite lengths only, which is all DER allows, and it stops at a
 * fixed depth and element count so hostile input cannot run away with it.
 *
 * Nothing here touches the DOM or the network. Every function is pure.
 */

export type Tone = "ok" | "info" | "warn" | "danger";

export interface Finding {
  tone: Tone;
  text: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type Outcome<T> =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; value: T };

/** Longest paste accepted in either box, in characters. */
export const MAX_INPUT_LENGTH = 20_000;
/** Largest decoded key accepted. 4096 bytes is roughly a 32768 bit RSA key. */
export const MAX_KEY_BYTES = 4096;
/** DER nesting and element caps. A public key needs depth 3 and about 8 elements. */
export const DER_MAX_DEPTH = 12;
export const DER_MAX_NODES = 256;
/** RFC 1035 section 3.3: one TXT character-string is at most 255 octets. */
export const TXT_STRING_LIMIT = 255;
/** RFC 8301 section 3.2 thresholds. */
export const RSA_MIN_BITS = 1024;
export const RSA_RECOMMENDED_BITS = 2048;
export const RSA_VERIFIER_MAX_BITS = 4096;

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

function clip(text: string, max = 32): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** A character as a reader can see it, even when it is a control code. */
function visible(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (code < 0x20 || code === 0x7f || (code >= 0x80 && code < 0xa0)) {
    return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return ch;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/* ------------------------------------------------------------ base64 */

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) table[B64_ALPHABET.charCodeAt(i)] = i;
  return table;
})();

export interface Base64Decoded {
  bytes: Uint8Array;
  /** False when the trailing = padding was left off. */
  padded: boolean;
}

/**
 * Standard base64 (RFC 4648 section 4). Whitespace is folding inside a DKIM
 * tag value and carries no data (RFC 6376 section 2.4), so it is dropped.
 * Missing padding is tolerated and reported; a stray character is not.
 */
export function decodeBase64(text: string): Result<Base64Decoded> {
  const clean = text.replace(/\s+/g, "");
  if (clean === "") return ok({ bytes: new Uint8Array(0), padded: true });
  const body = clean.replace(/={1,2}$/, "");
  const padCount = clean.length - body.length;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const code = ch.charCodeAt(0);
    if (code < 128 && B64_INDEX[code] >= 0) continue;
    if (ch === "=") {
      return fail(`An = sign sits at position ${i + 1}, inside the data. Padding may only come at the very end.`);
    }
    if (ch === "-" || ch === "_") {
      return fail(
        `The character "${ch}" at position ${i + 1} belongs to Base64URL. DKIM uses standard base64, which has + and / in those places.`,
      );
    }
    return fail(`The character "${visible(ch)}" at position ${i + 1} is not part of the base64 alphabet.`);
  }

  if (body.length % 4 === 1) {
    return fail(
      `${body.length} base64 characters cannot encode a whole number of bytes, so at least one character was lost, usually at a line break or a string boundary.`,
    );
  }
  if (padCount > 0 && clean.length % 4 !== 0) {
    return fail("The = padding does not bring the length to a multiple of 4, so the value was cut short or edited.");
  }

  const out = new Uint8Array(Math.floor((body.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < body.length; i++) {
    acc = (acc << 6) | B64_INDEX[body.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
    acc &= (1 << bits) - 1;
  }
  return ok({ bytes: out, padded: clean.length % 4 === 0 });
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64_ALPHABET[(n >> 18) & 63] + B64_ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64_ALPHABET[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64_ALPHABET[n & 63] : "=";
  }
  return out;
}

/* ------------------------------------------------------- TXT record */

export interface TxtRecord {
  /** The record, its strings joined with nothing between them (RFC 6376 section 3.6.2.2). */
  text: string;
  /** The character-strings as pasted, or null when the paste had no quotes. */
  strings: string[] | null;
  /** UTF-8 length of the longest single string, or of the whole text when unquoted. */
  longest: number;
}

/** At most this many quoted strings are read from one paste. */
export const MAX_TXT_STRINGS = 64;

/**
 * Accepts the bare record text, a zone file line, or dig output. Quoted
 * strings are collected and joined; outside quotes a semicolon starts a
 * zone file comment, which is what opendkim-genkey writes after the record.
 */
export function extractTxt(input: string): Result<TxtRecord> {
  if (!input.includes('"')) {
    let text = input.trim();
    const firstEq = text.indexOf("=");
    const txt = /(?:^|\s)TXT\s+/i.exec(text);
    if (txt && (firstEq < 0 || txt.index < firstEq)) text = text.slice(txt.index + txt[0].length);
    text = text.replace(/^\(\s*/, "").replace(/\s*\)\s*$/, "").trim();
    return ok({ text, strings: null, longest: utf8Length(text) });
  }

  const strings: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ";") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (ch !== '"') {
      i++;
      continue;
    }
    i++;
    let out = "";
    let closed = false;
    while (i < input.length) {
      const c = input[i];
      if (c === "\\") {
        // RFC 1035 section 5.1: \DDD is a decimal octet, \X is X itself.
        const dec = /^\d{3}/.exec(input.slice(i + 1, i + 4));
        if (dec) {
          const v = Number(dec[0]);
          if (v > 255) return fail(`The escape \\${dec[0]} is not a byte. Decimal escapes run from \\000 to \\255.`);
          out += String.fromCharCode(v);
          i += 4;
          continue;
        }
        if (i + 1 < input.length) out += input[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') {
        closed = true;
        i++;
        break;
      }
      out += c;
      i++;
    }
    if (!closed) return fail("A quoted string opens and never closes. Check that the final quote made it into the paste.");
    strings.push(out);
    if (strings.length > MAX_TXT_STRINGS) {
      return fail(`More than ${MAX_TXT_STRINGS} quoted strings. A DKIM record needs a handful at most.`);
    }
  }
  const text = strings.join("");
  const longest = strings.reduce((max, s) => Math.max(max, utf8Length(s)), 0);
  return ok({ text, strings, longest });
}

/**
 * Splits a record into quoted strings of at most 255 bytes, ready for a
 * zone file. Verifiers join them again with nothing in between.
 */
export function toZoneStrings(text: string, limit = TXT_STRING_LIMIT): string {
  const chunks: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of text) {
    const n = utf8Length(ch);
    if (size + n > limit) {
      chunks.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  if (current !== "" || chunks.length === 0) chunks.push(current);
  const quoted = chunks.map((c) => `"${c.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return quoted.length === 1 ? quoted[0] : `( ${quoted.join("\n  ")} )`;
}

/* --------------------------------------------------------- tag-list */

export interface Tag {
  name: string;
  value: string;
}

export interface TagList {
  tags: Tag[];
  /** Grammar violations other than repeats. */
  problems: string[];
  /** Tag names that occur more than once. */
  duplicates: string[];
}

/**
 * RFC 6376 section 3.2. Tags are separated by semicolons, a trailing one is
 * allowed, names are case sensitive, and whitespace around a value is
 * folding. Inner whitespace is kept; base64 and list readers drop it.
 */
export function parseTagList(text: string): TagList {
  const tags: Tag[] = [];
  const problems: string[] = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();
  const parts = text.split(";");

  parts.forEach((part, idx) => {
    const trimmed = part.trim();
    if (trimmed === "") {
      const trailing = idx === parts.length - 1;
      if (!trailing && parts.length > 1) {
        problems.push(
          idx === 0
            ? "The record starts with a semicolon, so its first tag is empty."
            : `There is an empty tag between two semicolons (after tag ${idx}).`,
        );
      }
      return;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      problems.push(`"${clip(trimmed)}" has no = sign, so it is not a tag.`);
      return;
    }
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      problems.push(
        `"${clip(name)}" is not a valid tag name. A name is a letter followed by letters, digits or underscores.`,
      );
      return;
    }
    if (/[^\x20-\x7e\t\r\n]/.test(value)) {
      problems.push(`The value of ${name}= contains characters outside printable ASCII, which a tag value cannot hold.`);
    }
    if (seen.has(name)) {
      if (!duplicates.includes(name)) duplicates.push(name);
    } else {
      seen.add(name);
    }
    tags.push({ name, value });
  });

  return { tags, problems, duplicates };
}

function tagValue(tags: Tag[], name: string): string | null {
  const found = tags.find((t) => t.name === name);
  return found ? found.value : null;
}

/** A colon separated list, as h=, s= and t= use. Whitespace around items is folding. */
export function colonList(value: string): string[] {
  return value
    .split(":")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/* -------------------------------------------------- quoted-printable */

function bytesToText(bytes: number[]): string {
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function decodeQp(value: string, dropWhitespace: boolean): string {
  const src = dropWhitespace ? value.replace(/\s+/g, "") : value;
  const bytes: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    for (const b of new TextEncoder().encode(ch)) bytes.push(b);
  }
  return bytesToText(bytes);
}

/** n= is a quoted-printable section: =XX is a byte and spaces are literal. */
export function decodeQpSection(value: string): string {
  return decodeQp(value, false);
}

/**
 * z= uses DKIM-Quoted-Printable (RFC 6376 section 2.11), where whitespace
 * is folding and carries nothing; a real space is written =20.
 */
export function decodeDkimQp(value: string): string {
  return decodeQp(value, true);
}

/* ----------------------------------------------------------------- DER */

export interface DerNode {
  /** 0 universal, 1 application, 2 context-specific, 3 private. */
  cls: number;
  constructed: boolean;
  tag: number;
  /** Offset of the identifier octet. */
  offset: number;
  /** Identifier plus length octets. */
  header: number;
  /** Content octets. */
  length: number;
  children: DerNode[];
}

export interface DerDocument {
  root: DerNode;
  /** Departures from DER that a lenient parser would accept. */
  issues: string[];
}

interface DerContext {
  bytes: Uint8Array;
  nodes: number;
  issues: string[];
}

const UNIVERSAL_NAMES: Record<number, string> = {
  1: "BOOLEAN",
  2: "INTEGER",
  3: "BIT STRING",
  4: "OCTET STRING",
  5: "NULL",
  6: "OBJECT IDENTIFIER",
  12: "UTF8String",
  16: "SEQUENCE",
  17: "SET",
  19: "PrintableString",
  23: "UTCTime",
  24: "GeneralizedTime",
};

export function derTagName(node: DerNode): string {
  if (node.cls === 0) return UNIVERSAL_NAMES[node.tag] ?? `universal tag ${node.tag}`;
  const cls = ["universal", "application", "context-specific", "private"][node.cls];
  return `[${cls} ${node.tag}]`;
}

function readNode(ctx: DerContext, offset: number, limit: number, depth: number): Result<DerNode> {
  const b = ctx.bytes;
  if (depth > DER_MAX_DEPTH) {
    return fail(`The structure nests deeper than ${DER_MAX_DEPTH} levels, which no public key needs. Parsing stopped.`);
  }
  ctx.nodes += 1;
  if (ctx.nodes > DER_MAX_NODES) return fail(`More than ${DER_MAX_NODES} DER elements. Parsing stopped.`);
  if (offset >= limit) return fail(`Expected a DER element at byte ${offset}, but the data ended.`);

  const id = b[offset];
  const cls = id >> 6;
  const constructed = (id & 0x20) !== 0;
  let tag = id & 0x1f;
  let p = offset + 1;

  // X.690 section 8.1.2.4: tag numbers of 31 and up continue in base 128.
  if (tag === 0x1f) {
    tag = 0;
    let count = 0;
    for (;;) {
      if (p >= limit) return fail(`The multi-byte tag at byte ${offset} runs past the end of the data.`);
      const t = b[p++];
      count += 1;
      if (count === 1 && t === 0x80) ctx.issues.push(`The tag at byte ${offset} has a padding byte, which DER forbids.`);
      if (count > 4) return fail(`The tag at byte ${offset} is longer than 4 bytes. Parsing stopped.`);
      tag = tag * 128 + (t & 0x7f);
      if ((t & 0x80) === 0) break;
    }
    if (tag < 31) {
      ctx.issues.push(`Tag ${tag} at byte ${offset} uses the long form, which X.690 reserves for tags of 31 and up.`);
    }
  }

  if (p >= limit) return fail(`The element at byte ${offset} has no length byte.`);
  const first = b[p++];
  let length: number;
  if (first < 0x80) {
    length = first;
  } else if (first === 0x80) {
    return fail(`The element at byte ${offset} uses the indefinite length form, which is BER and never DER (X.690 section 10.1).`);
  } else if (first === 0xff) {
    return fail(`Length byte 0xFF at byte ${p - 1} is reserved (X.690 section 8.1.3.5).`);
  } else {
    const n = first & 0x7f;
    if (n > 4) return fail(`The element at byte ${offset} declares a ${n} byte length field. Nothing that long belongs in a public key.`);
    if (p + n > limit) return fail(`The length field of the element at byte ${offset} runs past the end of the data.`);
    length = 0;
    for (let k = 0; k < n; k++) length = length * 256 + b[p + k];
    if (b[p] === 0) {
      ctx.issues.push(`The length at byte ${p - 1} has a leading zero byte, which DER forbids (X.690 section 10.1).`);
    } else if (length < 0x80) {
      ctx.issues.push(`The length at byte ${p - 1} uses the long form for a value under 128, which DER forbids (X.690 section 10.1).`);
    }
    p += n;
  }

  const end = p + length;
  if (end > limit) {
    return fail(
      `The element at byte ${offset} claims ${length} content bytes, but only ${limit - p} remain. The key was cut short.`,
    );
  }

  const node: DerNode = { cls, constructed, tag, offset, header: p - offset, length, children: [] };
  if (constructed) {
    let q = p;
    while (q < end) {
      const child = readNode(ctx, q, end, depth + 1);
      if (!child.ok) return child;
      node.children.push(child.value);
      q = child.value.offset + child.value.header + child.value.length;
    }
  }
  return ok(node);
}

/** Parses one DER element and everything inside it. */
export function parseDer(bytes: Uint8Array): Result<DerDocument> {
  if (bytes.length === 0) return fail("There are no bytes to parse.");
  if (bytes.length > MAX_KEY_BYTES) {
    return fail(`The data is ${bytes.length} bytes. Anything over ${MAX_KEY_BYTES} bytes is refused here.`);
  }
  const ctx: DerContext = { bytes, nodes: 0, issues: [] };
  const root = readNode(ctx, 0, bytes.length, 0);
  if (!root.ok) return root;
  const used = root.value.offset + root.value.header + root.value.length;
  if (used < bytes.length) {
    ctx.issues.push(`${bytes.length - used} bytes follow the end of the outer structure. Strict parsers reject that.`);
  }
  return ok({ root: root.value, issues: ctx.issues });
}

export function derContent(bytes: Uint8Array, node: DerNode): Uint8Array {
  const start = node.offset + node.header;
  return bytes.subarray(start, start + node.length);
}

function isUniversal(node: DerNode | undefined, tag: number): node is DerNode {
  return node !== undefined && node.cls === 0 && node.tag === tag;
}

/** An INTEGER's content octets as a two's complement BigInt (X.690 section 8.3). */
export function derInteger(content: Uint8Array): bigint {
  let v = 0n;
  for (const byte of content) v = (v << 8n) | BigInt(byte);
  if (content.length > 0 && (content[0] & 0x80) !== 0) v -= 1n << BigInt(content.length * 8);
  return v;
}

/** X.690 section 8.19: arcs in base 128, the first two folded into one. */
export function decodeOid(content: Uint8Array): Result<string> {
  if (content.length === 0) return fail("The OBJECT IDENTIFIER is empty.");
  if (content.length > 64) return fail("The OBJECT IDENTIFIER is longer than 64 bytes. Parsing stopped.");
  const arcs: bigint[] = [];
  let value = 0n;
  let fresh = true;
  for (const byte of content) {
    if (fresh && byte === 0x80) {
      return fail("An OBJECT IDENTIFIER arc starts with a 0x80 padding byte, which X.690 section 8.19.2 forbids.");
    }
    fresh = false;
    value = (value << 7n) | BigInt(byte & 0x7f);
    if ((byte & 0x80) === 0) {
      arcs.push(value);
      value = 0n;
      fresh = true;
    }
  }
  if (!fresh) return fail("The OBJECT IDENTIFIER ends in the middle of an arc.");
  const head = arcs[0];
  const x = head < 40n ? 0n : head < 80n ? 1n : 2n;
  return ok([x, head - 40n * x, ...arcs.slice(1)].map((a) => a.toString()).join("."));
}

export function bitLength(n: bigint): number {
  return n <= 0n ? 0 : n.toString(2).length;
}

/* ---------------------------------------------------------- public keys */

export const OID_RSA = "1.2.840.113549.1.1.1";
export const OID_ED25519 = "1.3.101.112";

const OID_NAMES: Record<string, string> = {
  [OID_RSA]: "rsaEncryption",
  "1.2.840.113549.1.1.10": "RSASSA-PSS",
  [OID_ED25519]: "Ed25519",
  "1.3.101.113": "Ed448",
  "1.3.101.110": "X25519",
  "1.2.840.10045.2.1": "id-ecPublicKey (elliptic curve)",
  "1.2.840.10040.4.1": "DSA",
};

export type KeyAlgorithm = "rsa" | "ed25519" | "other";
/** spki: SubjectPublicKeyInfo. pkcs1: a bare RSAPublicKey. raw: 32 Ed25519 bytes. */
export type KeyEncoding = "spki" | "pkcs1" | "raw";

export interface PublicKeyInfo {
  algorithm: KeyAlgorithm;
  algorithmName: string;
  encoding: KeyEncoding;
  oid: string | null;
  /** RSA modulus length in bits, or 256 for Ed25519. */
  bits: number | null;
  modulus: bigint | null;
  exponent: bigint | null;
  /** The 32 Ed25519 key bytes as hex. */
  keyHex: string | null;
  /** Decoded length of the whole p= value. */
  byteLength: number;
  issues: string[];
}

function checkMinimalInteger(content: Uint8Array, label: string, issues: string[]) {
  if (content.length < 2) return;
  const [a, b] = content;
  if ((a === 0x00 && b < 0x80) || (a === 0xff && b >= 0x80)) {
    issues.push(`The ${label} INTEGER has a redundant leading byte, which DER forbids (X.690 section 8.3.2).`);
  }
}

function readRsa(
  src: Uint8Array,
  seq: DerNode,
  encoding: KeyEncoding,
  oid: string | null,
  byteLength: number,
  issues: string[],
): Result<PublicKeyInfo> {
  const nBytes = derContent(src, seq.children[0]);
  const eBytes = derContent(src, seq.children[1]);
  if (nBytes.length === 0 || eBytes.length === 0) return fail("An INTEGER in the RSA key has no content bytes.");
  checkMinimalInteger(nBytes, "modulus", issues);
  checkMinimalInteger(eBytes, "exponent", issues);
  const modulus = derInteger(nBytes);
  const exponent = derInteger(eBytes);
  if (modulus <= 0n) {
    return fail(
      "The RSA modulus decodes as zero or negative. A positive INTEGER whose top bit is set needs a leading 0x00 byte, and this one lacks it.",
    );
  }
  if (exponent <= 0n) return fail("The RSA public exponent is zero or negative.");
  if ((modulus & 1n) === 0n) {
    issues.push("The modulus is even. A real RSA modulus is the product of two odd primes, so it is always odd.");
  }
  return ok({
    algorithm: "rsa",
    algorithmName: "RSA",
    encoding,
    oid,
    bits: bitLength(modulus),
    modulus,
    exponent,
    keyHex: null,
    byteLength,
    issues,
  });
}

/**
 * Reads the decoded p= bytes. RFC 6376 section 3.6.1 names an RSAPublicKey,
 * but the key generators in common use (and the RFC's own appendix C)
 * publish a SubjectPublicKeyInfo, and verifiers accept both, so both are
 * read here. An Ed25519 key is the bare 32 byte value (RFC 8463).
 */
export function decodePublicKey(bytes: Uint8Array, keyType: string): Result<PublicKeyInfo> {
  if (bytes.length === 0) return fail("The key is empty.");
  if (bytes.length > MAX_KEY_BYTES) {
    return fail(`The key is ${bytes.length} bytes. Anything over ${MAX_KEY_BYTES} bytes is refused here.`);
  }
  if (keyType === "ed25519" && bytes.length === 32) {
    return ok({
      algorithm: "ed25519",
      algorithmName: "Ed25519",
      encoding: "raw",
      oid: null,
      bits: 256,
      modulus: null,
      exponent: null,
      keyHex: toHex(bytes),
      byteLength: 32,
      issues: [],
    });
  }

  const doc = parseDer(bytes);
  if (!doc.ok) {
    if (keyType === "ed25519") {
      return fail(
        `An ed25519 key is exactly 32 raw bytes. This one is ${bytes.length} bytes, and it is not DER either: ${doc.error}`,
      );
    }
    if (bytes.length === 32) {
      return fail(
        `It is not DER (${doc.error}). At exactly 32 bytes it is the size of a raw Ed25519 key; if that is what it is, the record needs k=ed25519, because k= defaults to rsa.`,
      );
    }
    return fail(`The key is not valid DER: ${doc.error}`);
  }

  const issues = [...doc.value.issues];
  const root = doc.value.root;
  if (!isUniversal(root, 16)) {
    return fail(`A key should start with a SEQUENCE, but this one starts with ${derTagName(root)}.`);
  }
  const [first, second] = root.children;

  // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER } (RFC 8017 appendix A.1.1)
  if (root.children.length === 2 && isUniversal(first, 2) && isUniversal(second, 2)) {
    return readRsa(bytes, root, "pkcs1", null, bytes.length, issues);
  }

  // SubjectPublicKeyInfo ::= SEQUENCE { algorithm AlgorithmIdentifier, subjectPublicKey BIT STRING } (RFC 5280 section 4.1)
  if (root.children.length !== 2 || !isUniversal(first, 16) || !isUniversal(second, 3)) {
    return fail(
      "The structure is neither a SubjectPublicKeyInfo (an algorithm SEQUENCE, then a BIT STRING) nor a bare RSAPublicKey (two INTEGERs).",
    );
  }
  const algId = first.children;
  if (!isUniversal(algId[0], 6)) return fail("The algorithm identifier does not start with an OBJECT IDENTIFIER.");
  const oidResult = decodeOid(derContent(bytes, algId[0]));
  if (!oidResult.ok) return oidResult;
  const oid = oidResult.value;

  const bitString = derContent(bytes, second);
  if (bitString.length === 0) return fail("The BIT STRING that should hold the key is empty.");
  if (bitString[0] > 7) return fail(`The BIT STRING declares ${bitString[0]} unused bits; the most it can declare is 7.`);
  if (bitString[0] !== 0) {
    issues.push(`The key BIT STRING declares ${bitString[0]} unused bits. A key is whole bytes, so it should be 0.`);
  }
  const keyBytes = bitString.subarray(1);

  if (oid === OID_RSA) {
    const params = algId[1];
    if (!params) {
      issues.push("The rsaEncryption algorithm identifier has no parameters. RFC 3279 section 2.3.1 requires an explicit NULL.");
    } else if (!isUniversal(params, 5) || params.length !== 0) {
      issues.push("The rsaEncryption parameters should be NULL (RFC 3279 section 2.3.1).");
    }
    const inner = parseDer(keyBytes);
    if (!inner.ok) return fail(`The RSA key inside the BIT STRING is not valid DER: ${inner.error}`);
    issues.push(...inner.value.issues);
    const r = inner.value.root;
    if (!isUniversal(r, 16) || r.children.length !== 2 || !isUniversal(r.children[0], 2) || !isUniversal(r.children[1], 2)) {
      return fail(
        "The RSA key inside the BIT STRING should be a SEQUENCE of two INTEGERs, the modulus and the exponent (RFC 8017 appendix A.1.1).",
      );
    }
    return readRsa(keyBytes, r, "spki", oid, bytes.length, issues);
  }

  if (oid === OID_ED25519) {
    if (algId.length > 1) issues.push("The Ed25519 algorithm identifier carries parameters. RFC 8410 section 3 says they must be absent.");
    if (keyBytes.length !== 32) return fail(`An Ed25519 public key is 32 bytes, but this BIT STRING holds ${keyBytes.length}.`);
    return ok({
      algorithm: "ed25519",
      algorithmName: "Ed25519",
      encoding: "spki",
      oid,
      bits: 256,
      modulus: null,
      exponent: null,
      keyHex: toHex(keyBytes),
      byteLength: bytes.length,
      issues,
    });
  }

  return ok({
    algorithm: "other",
    algorithmName: OID_NAMES[oid] ?? `unrecognized algorithm ${oid}`,
    encoding: "spki",
    oid,
    bits: null,
    modulus: null,
    exponent: null,
    keyHex: null,
    byteLength: bytes.length,
    issues,
  });
}

/* --------------------------------------------------------- shared bits */

export interface TagRow {
  name: string;
  value: string;
  meaning: string;
  known: boolean;
}

const SEVERITY: Record<Tone, number> = { danger: 0, warn: 1, info: 2, ok: 3 };

export function sortFindings(findings: Finding[]): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY[a.f.tone] - SEVERITY[b.f.tone] || a.i - b.i)
    .map(({ f }) => f);
}

function caseFindings(tags: Tag[], known: Record<string, string>, findings: Finding[]) {
  for (const t of tags) {
    const lower = t.name.toLowerCase();
    if (t.name !== lower && known[lower] && !tags.some((o) => o.name === lower)) {
      findings.push({
        tone: "warn",
        text: `${t.name}= is not ${lower}=. Tag names are case sensitive (RFC 6376 section 3.2), so verifiers skip ${t.name}= as an unknown tag.`,
      });
    }
  }
}

/* ---------------------------------------------------------- key record */

export const KEY_TAGS: Record<string, string> = {
  v: "Version. Must be DKIM1, and must be the first tag.",
  h: "Hash algorithms this key may be used with. Default: any.",
  k: "Key type: rsa (the default) or ed25519.",
  n: "Notes for people. Verifiers ignore it.",
  p: "The public key, base64. Empty means revoked.",
  s: "Service types: * (the default) or email.",
  t: "Flags: y is testing mode, s forbids subdomains in i=.",
  g: "Key granularity, from RFC 4871. Not part of RFC 6376.",
};

export interface Verdict {
  tone: Tone;
  label: string;
}

export interface KeyRecord {
  txt: TxtRecord;
  tags: TagRow[];
  version: string | null;
  /** Effective key type, lowercased, defaulting to rsa. */
  keyType: string;
  keyTypeStated: boolean;
  /** Allowed hashes, or null when h= is absent and any is allowed. */
  hashes: string[] | null;
  services: string[];
  flags: string[];
  testing: boolean;
  strict: boolean;
  notes: string | null;
  revoked: boolean;
  key: PublicKeyInfo | null;
  keyError: string | null;
  findings: Finding[];
  verdict: Verdict;
}

/** Analyzes a DKIM key record as published at selector._domainkey.domain. */
export function analyzeKeyRecord(input: string): Outcome<KeyRecord> {
  if (input.trim() === "") return { kind: "empty" };
  if (input.length > MAX_INPUT_LENGTH) {
    return {
      kind: "error",
      message: `That is ${input.length.toLocaleString("en-US")} characters. A DKIM record runs to a few thousand at most, so anything over ${MAX_INPUT_LENGTH.toLocaleString("en-US")} is refused.`,
    };
  }
  const txt = extractTxt(input);
  if (!txt.ok) return { kind: "error", message: txt.error };
  const text = txt.value.text;
  if (text.trim() === "") {
    return { kind: "error", message: "The record is empty. A DKIM key record needs at least a p= tag." };
  }

  const list = parseTagList(text);
  if (list.tags.length === 0) {
    return {
      kind: "error",
      message: `No tag=value pairs were found. A key record looks like v=DKIM1; k=rsa; p=MIIBIjAN... ${list.problems[0] ?? ""}`.trim(),
    };
  }
  const names = new Set(list.tags.map((t) => t.name));
  if (names.has("bh") || (names.has("b") && names.has("d") && names.has("s"))) {
    return {
      kind: "error",
      message: "This has bh=, b= and d= tags, so it is a DKIM-Signature header field rather than a key record. Paste it into the signature box.",
    };
  }

  const findings: Finding[] = [];
  let broken = false;
  const danger = (text: string) => {
    findings.push({ tone: "danger", text });
    broken = true;
  };

  if (list.duplicates.length) {
    danger(
      `The ${list.duplicates.map((d) => `${d}=`).join(", ")} tag appears more than once. RFC 6376 section 3.2 makes the whole record invalid when any tag repeats, so verifiers ignore this key.`,
    );
  }
  for (const problem of list.problems) {
    findings.push({
      tone: "warn",
      text: `${problem} Strict verifiers reject a record that breaks the tag-list grammar (RFC 6376 section 3.2).`,
    });
  }
  caseFindings(list.tags, KEY_TAGS, findings);

  const tags = list.tags;
  const version = tagValue(tags, "v");
  if (version !== null) {
    if (version !== "DKIM1") {
      danger(`v=${clip(version)} is not DKIM1. RFC 6376 section 3.6.1 says a record that starts with any other version must be discarded.`);
    }
    if (tags[0].name !== "v") {
      findings.push({
        tone: "warn",
        text: "v= is present but not first. RFC 6376 section 3.6.1 requires it to be the first tag, and verifiers differ in how strictly they enforce that, so move it to the front.",
      });
    }
  } else {
    findings.push({
      tone: "info",
      text: "No v= tag. It is optional and defaults to DKIM1; when present it must come first.",
    });
  }

  const kRaw = tagValue(tags, "k");
  const keyType = (kRaw ?? "rsa").trim().toLowerCase();
  if (keyType !== "rsa" && keyType !== "ed25519") {
    danger(
      `k=${clip(keyType)} is not a key type verifiers know. RFC 6376 defines rsa and RFC 8463 adds ed25519; a verifier that does not recognize the type cannot use the key.`,
    );
  }

  let hashes: string[] | null = null;
  const hRaw = tagValue(tags, "h");
  if (hRaw !== null) {
    hashes = colonList(hRaw.toLowerCase());
    const unknown = hashes.filter((h) => h !== "sha1" && h !== "sha256");
    if (!hashes.includes("sha256")) {
      danger(
        hashes.includes("sha1")
          ? "h= allows only sha1. RFC 8301 forbids rsa-sha1 for both signing and verifying, so no signature can be accepted under this key."
          : "h= lists no hash algorithm DKIM defines. Without sha256 the key cannot verify anything.",
      );
    } else if (hashes.includes("sha1")) {
      findings.push({
        tone: "info",
        text: "h= still lists sha1, which RFC 8301 retired. Verifiers that follow RFC 8301 refuse rsa-sha1 regardless, so removing it only makes the record say what is true.",
      });
    }
    if (unknown.length) {
      findings.push({
        tone: "info",
        text: `h= names ${unknown.join(", ")}, which DKIM does not define. Verifiers ignore unrecognized algorithms.`,
      });
    }
  }

  const sRaw = tagValue(tags, "s");
  const services = sRaw === null ? ["*"] : colonList(sRaw.toLowerCase());
  if (!services.includes("*") && !services.includes("email")) {
    danger("s= includes neither email nor *, so verifiers must ignore this key for email (RFC 6376 section 3.6.1).");
  }

  const tRaw = tagValue(tags, "t");
  const flags = tRaw === null ? [] : colonList(tRaw.toLowerCase());
  const testing = flags.includes("y");
  const strict = flags.includes("s");
  if (testing) {
    findings.push({
      tone: "warn",
      text: "t=y marks the domain as testing DKIM. RFC 6376 section 3.6.1 tells verifiers to treat its mail no worse than unsigned mail even when the signature fails. That is right during rollout and a gap afterward, so remove the flag once signing is stable.",
    });
  }
  if (strict) {
    findings.push({
      tone: "info",
      text: "t=s requires the i= domain in a signature to equal d= exactly, with no subdomains. It only matters when signatures set i= to a subdomain.",
    });
  }
  const unknownFlags = flags.filter((f) => f !== "y" && f !== "s");
  if (unknownFlags.length) {
    findings.push({ tone: "info", text: `t= contains ${unknownFlags.join(", ")}, which no RFC defines. Verifiers ignore unknown flags.` });
  }

  const nRaw = tagValue(tags, "n");
  const notes = nRaw === null ? null : decodeQpSection(nRaw);

  if (names.has("g")) {
    findings.push({
      tone: "info",
      text: "g= (key granularity) was defined in RFC 4871 and is not part of RFC 6376, so current verifiers treat it as an unknown tag.",
    });
  }
  const unknownTags = tags.filter((t) => !KEY_TAGS[t.name] && !KEY_TAGS[t.name.toLowerCase()]);
  if (unknownTags.length) {
    findings.push({
      tone: "info",
      text: `Unknown ${unknownTags.length === 1 ? "tag" : "tags"} ${unknownTags.map((t) => `${t.name}=`).join(", ")}. RFC 6376 section 3.2 tells verifiers to ignore tags they do not recognize.`,
    });
  }

  // The key itself.
  const pRaw = tagValue(tags, "p");
  let revoked = false;
  let key: PublicKeyInfo | null = null;
  let keyError: string | null = null;
  if (pRaw === null) {
    danger("There is no p= tag. It is the one required tag in a key record (RFC 6376 section 3.6.1), so verifiers treat this as a key syntax error.");
  } else if (pRaw.replace(/\s+/g, "") === "") {
    revoked = true;
    findings.push({
      tone: "warn",
      text: "p= is empty, which means this key has been revoked (RFC 6376 section 3.6.1). Every signature that names this selector now fails. That is correct for a retired selector and an outage for a live one.",
    });
  } else {
    const decoded = decodeBase64(pRaw);
    if (!decoded.ok) {
      keyError = `p= is not valid base64. ${decoded.error}`;
      danger(keyError);
    } else {
      if (!decoded.value.padded) {
        findings.push({ tone: "info", text: "p= has no base64 padding. Most verifiers accept that, but the = signs cost nothing to add." });
      }
      const read = decodePublicKey(decoded.value.bytes, keyType);
      if (!read.ok) {
        keyError = read.error;
        danger(`The key in p= could not be read. ${read.error}`);
      } else {
        key = read.value;
        for (const issue of key.issues) {
          findings.push({ tone: "warn", text: `${issue} Lenient verifiers accept this; strict ones reject the key.` });
        }
        if (key.algorithm === "other") {
          danger(`p= holds a ${key.algorithmName} key, which DKIM does not use. Only RSA and Ed25519 keys are defined.`);
        } else if (keyType === "rsa" && key.algorithm === "ed25519") {
          danger(
            `${kRaw === null ? "k= is absent, so it defaults to rsa," : "k= says rsa,"} but p= holds an Ed25519 key. Set k=ed25519 and publish the bare 32 byte key.`,
          );
        } else if (keyType === "ed25519" && key.algorithm === "rsa") {
          danger("k= says ed25519, but p= holds an RSA key. Either the key or the k= tag is wrong.");
        }

        if (key.algorithm === "ed25519" && key.encoding === "spki" && key.keyHex) {
          const raw = new Uint8Array(key.keyHex.match(/../g)!.map((h) => parseInt(h, 16)));
          danger(
            `This Ed25519 key is wrapped in a SubjectPublicKeyInfo structure. RFC 8463 publishes the bare 32 byte key, so a verifier that follows it reads 44 bytes and fails. Publish p=${encodeBase64(raw)} instead.`,
          );
        }

        if (key.algorithm === "rsa" && key.bits !== null) {
          const bits = key.bits;
          if (bits < RSA_MIN_BITS) {
            danger(
              `A ${bits} bit RSA key. RFC 8301 section 3.2 says verifiers must not accept signatures from RSA keys under ${RSA_MIN_BITS} bits, so mail signed with it fails DKIM. A key this small can also be factored on rented hardware, which would let anyone sign mail as this domain.`,
            );
          } else if (bits < RSA_RECOMMENDED_BITS) {
            findings.push({
              tone: "warn",
              text: `A ${bits} bit RSA key. It clears the ${RSA_MIN_BITS} bit floor in RFC 8301 section 3.2, but the same section says signers should use at least ${RSA_RECOMMENDED_BITS} bits. Plan a rotation to a new selector.`,
            });
          } else if (bits <= RSA_VERIFIER_MAX_BITS) {
            findings.push({ tone: "ok", text: `A ${bits} bit RSA key, at or above the ${RSA_RECOMMENDED_BITS} bits RFC 8301 recommends.` });
          } else {
            findings.push({
              tone: "warn",
              text: `A ${bits} bit RSA key. RFC 8301 section 3.2 only requires verifiers to handle keys up to ${RSA_VERIFIER_MAX_BITS} bits, so some will not validate it.`,
            });
          }
          const e = key.exponent ?? 0n;
          if (e === 1n || e % 2n === 0n) {
            danger(`The public exponent is ${e}. An RSA exponent must be odd and greater than 1, so this key cannot verify anything.`);
          } else if (e !== 65537n) {
            findings.push({ tone: "info", text: `The public exponent is ${e}. That is valid, but 65537 is the near universal choice.` });
          }
        }
        if (key.algorithm === "ed25519" && key.encoding === "raw") {
          findings.push({
            tone: "ok",
            text: "A 32 byte Ed25519 key (RFC 8463). Receivers that do not support ed25519-sha256 ignore it, so domains usually publish an RSA selector alongside it and sign twice.",
          });
        }
      }
    }
  }

  // How the record sits in DNS.
  const strings = txt.value.strings;
  if (strings) {
    strings.forEach((s, i) => {
      const size = utf8Length(s);
      if (size > TXT_STRING_LIMIT) {
        danger(
          `String ${i + 1} is ${size} bytes, but one TXT character-string holds at most ${TXT_STRING_LIMIT} (RFC 1035 section 3.3). No DNS server can publish it as written; split it into several quoted strings.`,
        );
      }
    });
    if (strings.length > 1) {
      findings.push({
        tone: "info",
        text: `Published as ${strings.length} strings. Verifiers join them with nothing in between (RFC 6376 section 3.6.2.2), so a space added at a boundary is harmless inside p= but corrupts any other tag it lands in.`,
      });
    }
  } else if (utf8Length(text) > TXT_STRING_LIMIT) {
    findings.push({
      tone: "info",
      text: `At ${utf8Length(text)} bytes the record is longer than one TXT string can hold (${TXT_STRING_LIMIT}). It has to be published as several quoted strings, which verifiers join without spaces. Many DNS panels split it automatically; the zone file form shown here is already split.`,
    });
  }
  if (utf8Length(text) > 512) {
    findings.push({
      tone: "info",
      text: "The record alone is over 512 bytes, the classic DNS over UDP limit. Resolvers cope with EDNS0 or a retry over TCP, but a firewall that drops large UDP replies or TCP port 53 makes the lookup fail.",
    });
  }

  const rows: TagRow[] = tags.map((t) => ({
    name: t.name,
    value: t.value,
    meaning: KEY_TAGS[t.name] ?? "Not a key record tag. Ignored.",
    known: KEY_TAGS[t.name] !== undefined,
  }));

  let verdict: Verdict;
  if (broken) verdict = { tone: "danger", label: "Unusable" };
  else if (revoked) verdict = { tone: "warn", label: "Revoked" };
  else if (key?.algorithm === "rsa" && (key.bits ?? 0) < RSA_RECOMMENDED_BITS) verdict = { tone: "warn", label: "Weak" };
  else if (testing) verdict = { tone: "warn", label: "Usable, testing mode" };
  else verdict = { tone: "ok", label: "Usable" };

  return {
    kind: "ok",
    value: {
      txt: txt.value,
      tags: rows,
      version,
      keyType,
      keyTypeStated: kRaw !== null,
      hashes,
      services,
      flags,
      testing,
      strict,
      notes,
      revoked,
      key,
      keyError,
      findings: sortFindings(findings),
      verdict,
    },
  };
}

/* ----------------------------------------------------------- signature */

export const SIGNATURE_TAGS: Record<string, string> = {
  v: "Version. Must be 1.",
  a: "Signing algorithm.",
  b: "The signature itself, base64.",
  bh: "Hash of the canonicalized body, base64.",
  c: "Canonicalization, header/body. Default simple/simple.",
  d: "Signing domain (SDID). The key is fetched under it.",
  h: "Header fields covered by the signature, in order.",
  i: "Agent or user identifier (AUID). Must sit in d= or below it.",
  l: "Body length limit. Only that many body bytes are signed.",
  q: "Key query method. dns/txt is the only one defined.",
  s: "Selector. Picks which key under d= to fetch.",
  t: "Signing time, Unix seconds.",
  x: "Expiry time, Unix seconds.",
  z: "Copies of the signed header fields, for diagnosis.",
};

const REQUIRED_SIGNATURE_TAGS = ["v", "a", "b", "bh", "d", "h", "s"];
/** RFC 6376 section 5.4.1, the fields most worth covering after From. */
const RECOMMENDED_SIGNED = ["subject", "date", "to"];

export interface DomainCheck {
  ok: boolean;
  reason: string | null;
}

/** Checks a DNS name's labels: 1 to 63 octets each, 253 characters in all (RFC 1035 section 2.3.4). */
export function checkDnsName(name: string, allowUnderscore = false): DomainCheck {
  if (name === "") return { ok: false, reason: "it is empty" };
  if (name.length > 253) return { ok: false, reason: `it is ${name.length} characters, over the 253 a DNS name allows` };
  const label = allowUnderscore
    ? /^[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?$/
    : /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  for (const part of name.split(".")) {
    if (part === "") return { ok: false, reason: "it has an empty label (two dots in a row, or a dot at the start)" };
    if (part.length > 63) return { ok: false, reason: `the label "${clip(part, 16)}" is ${part.length} characters, over the 63 allowed` };
    if (!label.test(part)) return { ok: false, reason: `the label "${clip(part, 16)}" holds characters a host name cannot` };
  }
  return { ok: true, reason: null };
}

/** The name to query for the key: selector._domainkey.domain (RFC 6376 section 3.6.2.1). */
export function keyQueryName(selector: string, domain: string): string {
  return `${selector.trim().replace(/\.$/, "")}._domainkey.${domain.trim().replace(/\.$/, "")}`.toLowerCase();
}

export interface SignatureInfo {
  tags: TagRow[];
  version: string | null;
  algorithm: string | null;
  keyAlgorithm: "rsa" | "ed25519" | null;
  hash: "sha256" | "sha1" | null;
  canonHeader: string | null;
  canonBody: string | null;
  domain: string | null;
  selector: string | null;
  dnsName: string | null;
  auid: string | null;
  auidDomain: string | null;
  signedHeaders: string[];
  bodyLength: number | null;
  query: string;
  timestamp: number | null;
  expiration: number | null;
  bodyHashBytes: number | null;
  signatureBytes: number | null;
  copied: { name: string; value: string }[];
  findings: Finding[];
}

function unixSeconds(value: string, tag: string, findings: Finding[]): number | null {
  const v = value.replace(/\s+/g, "");
  if (!/^\d{1,12}$/.test(v)) {
    findings.push({ tone: "danger", text: `${tag}= must be 1 to 12 decimal digits of Unix time (RFC 6376 section 3.5), not "${clip(value)}".` });
    return null;
  }
  return Number(v);
}

function isoSeconds(seconds: number): string {
  const ms = seconds * 1000;
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return `${seconds}`;
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

/** Strips a leading field name and joins folded lines. */
export function unfoldSignature(input: string): string {
  return input.replace(/^\s*DKIM-Signature\s*:/i, "").replace(/\r\n|\r|\n/g, "");
}

/** Analyzes a DKIM-Signature header field. `nowMs` is the clock x= is compared with. */
export function analyzeSignature(input: string, nowMs: number): Outcome<SignatureInfo> {
  if (input.trim() === "") return { kind: "empty" };
  if (input.length > MAX_INPUT_LENGTH) {
    return {
      kind: "error",
      message: `That is ${input.length.toLocaleString("en-US")} characters, over the ${MAX_INPUT_LENGTH.toLocaleString("en-US")} accepted. Paste only the DKIM-Signature field.`,
    };
  }
  const text = unfoldSignature(input);
  const list = parseTagList(text);
  if (list.tags.length === 0) {
    return { kind: "error", message: "No tag=value pairs were found. A signature looks like v=1; a=rsa-sha256; d=example.com; s=selector; ..." };
  }
  const names = new Set(list.tags.map((t) => t.name));
  if (names.has("p") && !names.has("b") && !names.has("bh")) {
    return {
      kind: "error",
      message: "This has a p= tag and no b= or bh=, so it is a key record rather than a signature. Paste it into the key record box.",
    };
  }

  const findings: Finding[] = [];
  const tags = list.tags;

  if (list.duplicates.length) {
    findings.push({
      tone: "danger",
      text: `The ${list.duplicates.map((d) => `${d}=`).join(", ")} tag appears more than once, which makes the whole signature invalid (RFC 6376 section 3.2).`,
    });
  }
  for (const problem of list.problems) {
    findings.push({ tone: "warn", text: `${problem} That breaks the tag-list grammar (RFC 6376 section 3.2).` });
  }
  caseFindings(tags, SIGNATURE_TAGS, findings);

  const missing = REQUIRED_SIGNATURE_TAGS.filter((n) => !names.has(n));
  if (missing.length) {
    findings.push({
      tone: "danger",
      text: `Missing required ${missing.length === 1 ? "tag" : "tags"}: ${missing.map((m) => `${m}=`).join(", ")}. RFC 6376 section 6.1.1 says a verifier ignores such a signature and returns PERMFAIL.`,
    });
  }

  const version = tagValue(tags, "v");
  if (version !== null && version !== "1") {
    findings.push({ tone: "danger", text: `v=${clip(version)} is not 1, the only signature version defined (RFC 6376 section 3.5).` });
  }

  const aRaw = tagValue(tags, "a");
  const algorithm = aRaw === null ? null : aRaw.trim().toLowerCase();
  let keyAlgorithm: "rsa" | "ed25519" | null = null;
  let hash: "sha256" | "sha1" | null = null;
  if (algorithm === "rsa-sha256") {
    keyAlgorithm = "rsa";
    hash = "sha256";
  } else if (algorithm === "rsa-sha1") {
    keyAlgorithm = "rsa";
    hash = "sha1";
    findings.push({
      tone: "danger",
      text: "a=rsa-sha1. RFC 8301 section 3.1 says rsa-sha1 must not be used for signing or verifying, so compliant receivers treat this signature as failed.",
    });
  } else if (algorithm === "ed25519-sha256") {
    keyAlgorithm = "ed25519";
    hash = "sha256";
    findings.push({
      tone: "info",
      text: "a=ed25519-sha256 (RFC 8463). A receiver that does not support it treats this one signature as failed, which is why senders usually add an RSA signature beside it.",
    });
  } else if (algorithm !== null) {
    findings.push({ tone: "danger", text: `a=${clip(algorithm)} is not an algorithm DKIM defines, so no verifier can check it.` });
  }

  const cRaw = tagValue(tags, "c");
  let canonHeader: string | null = "simple";
  let canonBody: string | null = "simple";
  if (cRaw !== null) {
    const parts = cRaw.trim().toLowerCase().split("/");
    const valid = (s: string | undefined) => s === "simple" || s === "relaxed";
    if (parts.length > 2 || !valid(parts[0]) || (parts.length === 2 && !valid(parts[1]))) {
      findings.push({ tone: "danger", text: `c=${clip(cRaw)} is not valid. Each half must be simple or relaxed, as in c=relaxed/relaxed.` });
      canonHeader = null;
      canonBody = null;
    } else {
      canonHeader = parts[0];
      // RFC 6376 section 3.5: a lone value names the header algorithm; the body stays simple.
      canonBody = parts[1] ?? "simple";
    }
  }
  if (canonHeader === "simple") {
    findings.push({
      tone: "info",
      text: "Header canonicalization is simple, so any change to header case, spacing or folding in transit breaks the signature. relaxed/relaxed survives more relays.",
    });
  }

  const dRaw = tagValue(tags, "d");
  const domain = dRaw === null ? null : dRaw.trim().replace(/\.$/, "").toLowerCase();
  if (domain !== null) {
    const check = checkDnsName(domain);
    if (!check.ok) findings.push({ tone: "danger", text: `d=${clip(domain)} is not a valid domain: ${check.reason}.` });
  }
  const sRaw = tagValue(tags, "s");
  const selector = sRaw === null ? null : sRaw.trim().replace(/\.$/, "").toLowerCase();
  if (selector !== null) {
    const check = checkDnsName(selector, true);
    if (!check.ok) findings.push({ tone: "danger", text: `s=${clip(selector)} is not a valid selector: ${check.reason}.` });
    else if (selector.includes("_")) {
      findings.push({ tone: "info", text: "The selector contains an underscore. DNS allows it, but the RFC 6376 selector grammar does not." });
    }
  }
  let dnsName: string | null = null;
  if (domain && selector) {
    dnsName = keyQueryName(selector, domain);
    const check = checkDnsName(dnsName, true);
    if (!check.ok) {
      findings.push({ tone: "danger", text: `The key name ${clip(dnsName, 48)} cannot exist in DNS: ${check.reason}.` });
    }
  }

  const hRaw = tagValue(tags, "h");
  const signedHeaders = hRaw === null ? [] : colonList(hRaw);
  if (hRaw !== null) {
    if (hRaw.split(":").some((s) => s.trim() === "")) {
      findings.push({ tone: "warn", text: "h= has an empty entry, from a doubled or trailing colon. That breaks its grammar." });
    }
    const lower = signedHeaders.map((h) => h.toLowerCase());
    const fromCount = lower.filter((h) => h === "from").length;
    if (fromCount === 0) {
      findings.push({
        tone: "danger",
        text: "h= does not include From. RFC 6376 section 5.4 requires From to be signed, and section 6.1.1 tells verifiers to ignore a signature that does not cover it.",
      });
    } else if (fromCount > 1) {
      findings.push({
        tone: "ok",
        text: `From is listed ${fromCount} times. Naming a field more often than it appears (over-signing) means a second From added later breaks the signature (RFC 6376 section 5.4.2).`,
      });
    }
    const unsigned = RECOMMENDED_SIGNED.filter((h) => !lower.includes(h));
    if (unsigned.length) {
      findings.push({
        tone: "info",
        text: `Not signed: ${unsigned.join(", ")}. RFC 6376 section 5.4.1 recommends covering them; an unsigned field can be changed in transit without breaking the signature.`,
      });
    }
    const discouraged = ["return-path", "received", "comments", "keywords"].filter((h) => lower.includes(h));
    if (discouraged.length) {
      findings.push({
        tone: "info",
        text: `h= covers ${discouraged.join(", ")}. RFC 6376 section 5.4.1 lists Return-Path, Received, Comments and Keywords as fields that should not be signed.`,
      });
    }
  }

  const iRaw = tagValue(tags, "i");
  let auid: string | null = null;
  let auidDomain: string | null = null;
  if (iRaw !== null) {
    auid = iRaw.trim();
    const at = auid.lastIndexOf("@");
    if (at < 0) {
      findings.push({ tone: "danger", text: `i=${clip(auid)} has no @. The AUID is an optional local part, an @, then a domain.` });
    } else {
      auidDomain = decodeDkimQp(auid.slice(at + 1)).replace(/\.$/, "").toLowerCase();
      if (domain && auidDomain !== domain && !auidDomain.endsWith(`.${domain}`)) {
        findings.push({
          tone: "danger",
          text: `The i= domain ${auidDomain} is neither ${domain} nor a subdomain of it. RFC 6376 section 6.1.1 tells verifiers to ignore the signature.`,
        });
      }
    }
  }

  const lRaw = tagValue(tags, "l");
  let bodyLength: number | null = null;
  if (lRaw !== null) {
    const v = lRaw.replace(/\s+/g, "");
    if (!/^\d{1,76}$/.test(v)) {
      findings.push({ tone: "danger", text: `l=${clip(lRaw)} must be a decimal byte count.` });
    } else {
      bodyLength = Number(v);
      findings.push({
        tone: "warn",
        text: `l=${v} signs only the first ${v} bytes of the body. Anyone can append content after that point and the signature still verifies, a risk RFC 6376 spells out in its security considerations.`,
      });
    }
  }

  const qRaw = tagValue(tags, "q");
  const query = qRaw === null ? "dns/txt" : qRaw.trim();
  if (qRaw !== null && !colonList(qRaw.toLowerCase()).includes("dns/txt")) {
    findings.push({ tone: "warn", text: `q=${clip(qRaw)} names no query method verifiers support. dns/txt is the only one defined.` });
  }

  const timestamp = tagValue(tags, "t") === null ? null : unixSeconds(tagValue(tags, "t")!, "t", findings);
  const expiration = tagValue(tags, "x") === null ? null : unixSeconds(tagValue(tags, "x")!, "x", findings);
  if (timestamp !== null && expiration !== null && expiration <= timestamp) {
    findings.push({ tone: "danger", text: "x= is not later than t=. RFC 6376 section 3.5 requires the expiry to come after the signing time." });
  }
  if (expiration !== null && expiration * 1000 < nowMs) {
    findings.push({
      tone: "warn",
      text: `The signature expired at ${isoSeconds(expiration)}. RFC 6376 section 3.5 lets verifiers treat it as invalid after that.`,
    });
  }
  if (timestamp !== null && timestamp * 1000 > nowMs + 5 * 60_000) {
    findings.push({ tone: "info", text: `t= is ${isoSeconds(timestamp)}, in the future by this device's clock. One of the two clocks is wrong.` });
  }

  let bodyHashBytes: number | null = null;
  const bhRaw = tagValue(tags, "bh");
  if (bhRaw !== null) {
    const bh = decodeBase64(bhRaw);
    if (!bh.ok) {
      findings.push({ tone: "danger", text: `bh= is not valid base64. ${bh.error}` });
    } else {
      bodyHashBytes = bh.value.bytes.length;
      const want = hash === "sha1" ? 20 : hash === "sha256" ? 32 : null;
      if (want !== null && bodyHashBytes !== want) {
        findings.push({
          tone: "warn",
          text: `bh= decodes to ${bodyHashBytes} bytes, but a ${hash === "sha1" ? "SHA-1" : "SHA-256"} hash is ${want}. The value was cut short or belongs to another algorithm.`,
        });
      }
    }
  }

  let signatureBytes: number | null = null;
  const bRaw = tagValue(tags, "b");
  if (bRaw !== null) {
    const b = decodeBase64(bRaw);
    if (!b.ok) {
      findings.push({ tone: "danger", text: `b= is not valid base64. ${b.error}` });
    } else if (b.value.bytes.length === 0) {
      findings.push({ tone: "danger", text: "b= is empty, so there is no signature to verify." });
    } else {
      signatureBytes = b.value.bytes.length;
      if (keyAlgorithm === "ed25519" && signatureBytes !== 64) {
        findings.push({ tone: "warn", text: `b= decodes to ${signatureBytes} bytes, but an Ed25519 signature is always 64 (RFC 8032).` });
      } else if (keyAlgorithm === "rsa") {
        const bits = signatureBytes * 8;
        const lead = `An RSA signature is exactly as long as the key's modulus (RFC 8017 section 8.2.1), so ${signatureBytes} bytes means a ${bits} bit key`;
        if (bits < RSA_MIN_BITS) {
          findings.push({ tone: "danger", text: `${lead}, under the ${RSA_MIN_BITS} bit floor RFC 8301 sets. Compliant verifiers reject it.` });
        } else if (bits < RSA_RECOMMENDED_BITS) {
          findings.push({ tone: "warn", text: `${lead}. That passes, but RFC 8301 recommends ${RSA_RECOMMENDED_BITS} bits.` });
        } else {
          findings.push({ tone: "ok", text: `${lead}.` });
        }
      }
    }
  }

  const zRaw = tagValue(tags, "z");
  const copied: { name: string; value: string }[] = [];
  if (zRaw !== null) {
    for (const item of zRaw.split("|").slice(0, 64)) {
      const colon = item.indexOf(":");
      if (colon < 0) continue;
      copied.push({ name: item.slice(0, colon).trim(), value: decodeDkimQp(item.slice(colon + 1)) });
    }
  }

  const unknownTags = tags.filter((t) => !SIGNATURE_TAGS[t.name] && !SIGNATURE_TAGS[t.name.toLowerCase()]);
  if (unknownTags.length) {
    findings.push({
      tone: "info",
      text: `Unknown ${unknownTags.length === 1 ? "tag" : "tags"} ${unknownTags.map((t) => `${t.name}=`).join(", ")}. Verifiers ignore tags they do not recognize.`,
    });
  }

  return {
    kind: "ok",
    value: {
      tags: tags.map((t) => ({
        name: t.name,
        value: t.value,
        meaning: SIGNATURE_TAGS[t.name] ?? "Not a signature tag. Ignored.",
        known: SIGNATURE_TAGS[t.name] !== undefined,
      })),
      version,
      algorithm,
      keyAlgorithm,
      hash,
      canonHeader,
      canonBody,
      domain,
      selector,
      dnsName,
      auid,
      auidDomain,
      signedHeaders,
      bodyLength,
      query,
      timestamp,
      expiration,
      bodyHashBytes,
      signatureBytes,
      copied,
      findings: sortFindings(findings),
    },
  };
}

/* ----------------------------------------------------------- together */

/**
 * What can be said about a key and a signature side by side without the
 * message: whether this key could possibly have produced this signature.
 */
export function crossCheck(key: KeyRecord, sig: SignatureInfo): Finding[] {
  const findings: Finding[] = [];
  if (key.revoked) {
    findings.push({ tone: "danger", text: "The key is revoked (empty p=), so this signature fails no matter what else is true." });
    return findings;
  }
  if (sig.keyAlgorithm && key.keyType !== sig.keyAlgorithm) {
    findings.push({
      tone: "danger",
      text: `The signature uses ${sig.algorithm} but the key record is k=${key.keyType}. A verifier refuses the pairing.`,
    });
  }
  if (sig.hash && key.hashes && !key.hashes.includes(sig.hash)) {
    findings.push({
      tone: "danger",
      text: `The key's h= allows ${key.hashes.join(", ")}, which does not include ${sig.hash}, so the key may not verify this signature.`,
    });
  }
  if (!key.services.includes("*") && !key.services.includes("email")) {
    findings.push({ tone: "danger", text: "The key's s= excludes email, so it cannot verify a mail signature." });
  }
  if (key.strict && sig.auidDomain && sig.domain && sig.auidDomain !== sig.domain) {
    findings.push({
      tone: "danger",
      text: `The key carries t=s, but the signature's i= domain ${sig.auidDomain} is a subdomain of ${sig.domain}. t=s forbids that.`,
    });
  }
  const k = key.key;
  if (k && k.algorithm === "rsa" && k.bits !== null && sig.keyAlgorithm === "rsa" && sig.signatureBytes !== null) {
    const expected = Math.ceil(k.bits / 8);
    if (expected === sig.signatureBytes) {
      findings.push({
        tone: "ok",
        text: `The signature is ${sig.signatureBytes} bytes and the key's modulus is ${expected}, so this key could have made it. Only verification over the message itself can say that it did.`,
      });
    } else {
      findings.push({
        tone: "danger",
        text: `The signature is ${sig.signatureBytes} bytes but this ${k.bits} bit key produces ${expected} byte signatures. It was not made with this key: check that the record came from ${sig.dnsName ?? "the selector the signature names"}.`,
      });
    }
  }
  if (key.testing) {
    findings.push({ tone: "info", text: "The key is in testing mode (t=y), so a failure here should not make a receiver treat the message worse than unsigned mail." });
  }
  return sortFindings(findings);
}
