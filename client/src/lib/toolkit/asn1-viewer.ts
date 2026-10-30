/**
 * ASN.1 BER and DER parser for the ASN.1 viewer.
 *
 * Written from ITU-T X.690 (02/2021), the Basic and Distinguished Encoding
 * Rules. Every element is a tag, a length and contents (section 8.1). The
 * parser keeps the exact byte range of each part so the page can highlight
 * it, decodes the universal primitive types it recognizes, records every
 * place the input is valid BER but not DER (section 10 and 11), and never
 * throws on hostile input: the caps below bound the work, and every failure
 * becomes a message with the offset where it happened.
 *
 * Pure data in, data out. No DOM, no React, so it can be unit tested.
 */

/* ------------------------------------------------------------------ caps */

/** Largest decoded input the viewer parses: 256 KiB. */
export const MAX_INPUT_BYTES = 262_144;
/** Largest pasted or opened text: 1 MiB, enough for 256 KiB of hex with separators. */
export const MAX_TEXT_CHARS = 1_048_576;
/** Elements parsed before the parser stops. */
export const MAX_NODES = 20_000;
/** Nesting depth the parser descends to. */
export const MAX_DEPTH = 64;
/** INTEGER values up to this many content bytes (160 bits) are also shown in decimal. */
export const DECIMAL_MAX_BYTES = 20;
/** Decoded strings are cut to this many characters for display. */
export const MAX_TEXT_PREVIEW = 2_000;
/** Hex rows in the detail panel show at most this many bytes. */
export const MAX_FIELD_HEX_BYTES = 1_024;

/* ----------------------------------------------------------------- types */

export type TagClass = "universal" | "application" | "context" | "private";

const CLASS_BY_BITS: TagClass[] = ["universal", "application", "context", "private"];

export interface Asn1Issue {
  /** "der" is valid BER that DER forbids; "invalid" breaks BER itself. */
  level: "der" | "invalid";
  text: string;
}

export interface Asn1Field {
  label: string;
  value: string;
}

export interface Asn1Node {
  /** Position in depth-first order, assigned after parsing. */
  id: number;
  depth: number;
  /** Offset of the first identifier octet. */
  offset: number;
  /** Identifier plus length octets. */
  headerLength: number;
  tagClass: TagClass;
  constructed: boolean;
  tagNumber: number;
  lengthForm: "short" | "long" | "indefinite";
  /** Octets the length field occupies, including the initial one. */
  lengthOctets: number;
  /** Contents length. For the indefinite form, the bytes before the end-of-contents marker. */
  length: number;
  contentStart: number;
  /** End of the contents, excluding an end-of-contents marker. */
  contentEnd: number;
  /** End of the whole element, including an end-of-contents marker. */
  end: number;
  /** Display name: SEQUENCE, INTEGER, [0], [APPLICATION 3]. */
  name: string;
  /** One line value summary for the tree. */
  summary: string;
  /** Decoded value rows for the detail panel. */
  fields: Asn1Field[];
  issues: Asn1Issue[];
  children: Asn1Node[];
  /** True when the children were parsed out of an OCTET STRING or BIT STRING. */
  encapsulated: boolean;
  /** Set when parsing failed inside this element. */
  error: string | null;
  /** Informational note, for example a depth cap. */
  note: string | null;
  /** Dotted form, for OBJECT IDENTIFIER nodes. */
  oid: string | null;
}

export interface Asn1ParseError {
  offset: number;
  message: string;
}

export interface Asn1ParseResult {
  roots: Asn1Node[];
  /** Every node in depth-first order; nodes[i].id === i. */
  nodes: Asn1Node[];
  errors: Asn1ParseError[];
  nodeCapHit: boolean;
  depthCapHit: boolean;
  derIssues: number;
  invalidIssues: number;
  /** Bytes covered by the parsed top level elements. */
  consumed: number;
}

/* ------------------------------------------------------------ tag names */

/** X.680 section 8.6, Table 1: the universal class tag assignments. */
const UNIVERSAL_NAMES: Record<number, string> = {
  0: "EOC",
  1: "BOOLEAN",
  2: "INTEGER",
  3: "BIT STRING",
  4: "OCTET STRING",
  5: "NULL",
  6: "OBJECT IDENTIFIER",
  7: "ObjectDescriptor",
  8: "EXTERNAL",
  9: "REAL",
  10: "ENUMERATED",
  11: "EMBEDDED PDV",
  12: "UTF8String",
  13: "RELATIVE-OID",
  14: "TIME",
  16: "SEQUENCE",
  17: "SET",
  18: "NumericString",
  19: "PrintableString",
  20: "TeletexString",
  21: "VideotexString",
  22: "IA5String",
  23: "UTCTime",
  24: "GeneralizedTime",
  25: "GraphicString",
  26: "VisibleString",
  27: "GeneralString",
  28: "UniversalString",
  29: "CHARACTER STRING",
  30: "BMPString",
  31: "DATE",
  32: "TIME-OF-DAY",
  33: "DATE-TIME",
  34: "DURATION",
  35: "OID-IRI",
  36: "RELATIVE-OID-IRI",
};

/** X.690 8.2, 8.3, 8.4, 8.5, 8.8, 8.19, 8.20: these are always primitive. */
const ALWAYS_PRIMITIVE = new Set([1, 2, 5, 6, 9, 10, 13]);
/** X.690 8.9, 8.11, 8.18, 8.21.5: these are always constructed. */
const ALWAYS_CONSTRUCTED = new Set([8, 11, 16, 17, 29]);
/** Strings that BER may split into constructed segments and DER may not (X.690 10.2). */
const STRING_TAGS = new Set([3, 4, 7, 12, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30]);

export function tagName(tagClass: TagClass, tagNumber: number): string {
  if (tagClass === "universal") {
    return UNIVERSAL_NAMES[tagNumber] ?? `[UNIVERSAL ${tagNumber}]`;
  }
  if (tagClass === "context") return `[${tagNumber}]`;
  return `[${tagClass.toUpperCase()} ${tagNumber}]`;
}

/* -------------------------------------------------------------- OID names */

/**
 * Common object identifiers, from the RFCs that assign them: RFC 8017
 * (PKCS #1), RFC 5280 (X.509), RFC 5480 and RFC 5758 (ECC), RFC 8410
 * (Edwards and Montgomery curves), RFC 5652 (CMS), RFC 2985 (PKCS #9),
 * RFC 8018 (PKCS #5), RFC 6962 (Certificate Transparency), NIST CSOR, and
 * the CA/Browser Forum baseline requirements.
 */
export const OID_NAMES: Record<string, string> = {
  // PKCS #1 (RFC 8017)
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.113549.1.1.4": "md5WithRSAEncryption",
  "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
  "1.2.840.113549.1.1.7": "id-RSAES-OAEP",
  "1.2.840.113549.1.1.8": "id-mgf1",
  "1.2.840.113549.1.1.10": "id-RSASSA-PSS",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.113549.1.1.14": "sha224WithRSAEncryption",
  // DSA, DH, EC (RFC 3279, RFC 5480, RFC 5758)
  "1.2.840.10040.4.1": "dsa",
  "1.2.840.10040.4.3": "dsa-with-sha1",
  "1.2.840.10046.2.1": "dhpublicnumber",
  "1.2.840.113549.1.3.1": "dhKeyAgreement",
  "1.2.840.10045.2.1": "id-ecPublicKey",
  "1.2.840.10045.3.1.7": "prime256v1 (P-256)",
  "1.3.132.0.34": "secp384r1 (P-384)",
  "1.3.132.0.35": "secp521r1 (P-521)",
  "1.3.132.0.10": "secp256k1",
  "1.2.840.10045.4.1": "ecdsa-with-SHA1",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
  // RFC 8410
  "1.3.101.110": "X25519",
  "1.3.101.111": "X448",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
  // Digests and MACs
  "1.2.840.113549.2.5": "md5",
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
  "2.16.840.1.101.3.4.2.4": "sha224",
  "1.2.840.113549.2.7": "hmacWithSHA1",
  "1.2.840.113549.2.9": "hmacWithSHA256",
  // Ciphers
  "2.16.840.1.101.3.4.1.2": "aes128-CBC",
  "2.16.840.1.101.3.4.1.22": "aes192-CBC",
  "2.16.840.1.101.3.4.1.42": "aes256-CBC",
  "2.16.840.1.101.3.4.1.6": "aes128-GCM",
  "2.16.840.1.101.3.4.1.46": "aes256-GCM",
  "1.2.840.113549.3.7": "des-ede3-cbc",
  // PKCS #5 (RFC 8018)
  "1.2.840.113549.1.5.12": "PBKDF2",
  "1.2.840.113549.1.5.13": "PBES2",
  // CMS / PKCS #7 (RFC 5652)
  "1.2.840.113549.1.7.1": "data",
  "1.2.840.113549.1.7.2": "signedData",
  "1.2.840.113549.1.7.3": "envelopedData",
  "1.2.840.113549.1.7.6": "encryptedData",
  // PKCS #9 (RFC 2985) and PKCS #12 (RFC 7292)
  "1.2.840.113549.1.9.1": "emailAddress",
  "1.2.840.113549.1.9.3": "contentType",
  "1.2.840.113549.1.9.4": "messageDigest",
  "1.2.840.113549.1.9.5": "signingTime",
  "1.2.840.113549.1.9.14": "extensionRequest",
  "1.2.840.113549.1.9.20": "friendlyName",
  "1.2.840.113549.1.9.21": "localKeyID",
  "1.2.840.113549.1.9.22.1": "x509Certificate",
  "1.2.840.113549.1.12.10.1.2": "pkcs8ShroudedKeyBag",
  "1.2.840.113549.1.12.10.1.3": "certBag",
  // X.520 attribute types
  "2.5.4.3": "commonName",
  "2.5.4.4": "surname",
  "2.5.4.5": "serialNumber",
  "2.5.4.6": "countryName",
  "2.5.4.7": "localityName",
  "2.5.4.8": "stateOrProvinceName",
  "2.5.4.9": "streetAddress",
  "2.5.4.10": "organizationName",
  "2.5.4.11": "organizationalUnitName",
  "2.5.4.12": "title",
  "2.5.4.15": "businessCategory",
  "2.5.4.42": "givenName",
  "2.5.4.97": "organizationIdentifier",
  "0.9.2342.19200300.100.1.1": "userId",
  "0.9.2342.19200300.100.1.25": "domainComponent",
  // X.509 certificate extensions (RFC 5280 section 4.2)
  "2.5.29.14": "subjectKeyIdentifier",
  "2.5.29.15": "keyUsage",
  "2.5.29.17": "subjectAltName",
  "2.5.29.18": "issuerAltName",
  "2.5.29.19": "basicConstraints",
  "2.5.29.20": "cRLNumber",
  "2.5.29.21": "cRLReason",
  "2.5.29.30": "nameConstraints",
  "2.5.29.31": "cRLDistributionPoints",
  "2.5.29.32": "certificatePolicies",
  "2.5.29.32.0": "anyPolicy",
  "2.5.29.35": "authorityKeyIdentifier",
  "2.5.29.37": "extKeyUsage",
  "2.5.29.37.0": "anyExtendedKeyUsage",
  "1.3.6.1.5.5.7.1.1": "authorityInfoAccess",
  "1.3.6.1.5.5.7.1.24": "tlsFeature",
  "1.3.6.1.5.5.7.2.1": "id-qt-cps",
  "1.3.6.1.5.5.7.2.2": "id-qt-unotice",
  "1.3.6.1.5.5.7.48.1": "ocsp",
  "1.3.6.1.5.5.7.48.1.1": "id-pkix-ocsp-basic",
  "1.3.6.1.5.5.7.48.1.2": "id-pkix-ocsp-nonce",
  "1.3.6.1.5.5.7.48.2": "caIssuers",
  // Extended key usages
  "1.3.6.1.5.5.7.3.1": "serverAuth",
  "1.3.6.1.5.5.7.3.2": "clientAuth",
  "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection",
  "1.3.6.1.5.5.7.3.8": "timeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
  "1.3.6.1.5.2.3.4": "id-pkinit-KPClientAuth",
  "1.3.6.1.5.2.3.5": "id-pkinit-KPKdc",
  "1.3.6.1.4.1.311.20.2.2": "smartcardLogon (Microsoft)",
  "1.3.6.1.4.1.311.20.2.3": "userPrincipalName (Microsoft)",
  "1.3.6.1.4.1.311.21.7": "certificateTemplate (Microsoft)",
  // Certificate Transparency (RFC 6962)
  "1.3.6.1.4.1.11129.2.4.2": "signedCertificateTimestampList",
  "1.3.6.1.4.1.11129.2.4.3": "precertificatePoison",
  // CA/Browser Forum certificate policies
  "2.23.140.1.1": "extended-validation",
  "2.23.140.1.2.1": "domain-validated",
  "2.23.140.1.2.2": "organization-validated",
  "2.23.140.1.2.3": "individual-validated",
};

/** RFC 5280 section 4.2.1.3, KeyUsage named bits. */
const KEY_USAGE_BITS = [
  "digitalSignature",
  "nonRepudiation",
  "keyEncipherment",
  "dataEncipherment",
  "keyAgreement",
  "keyCertSign",
  "cRLSign",
  "encipherOnly",
  "decipherOnly",
];

/* ---------------------------------------------------------- byte helpers */

const HEX = "0123456789abcdef";

export function toHex(bytes: Uint8Array, start = 0, end = bytes.length, sep = " "): string {
  const parts: string[] = [];
  for (let i = start; i < end; i++) parts.push(HEX[bytes[i] >> 4] + HEX[bytes[i] & 15]);
  return parts.join(sep);
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** RFC 4648 Base64 with padding, for copying one element out as DER. */
export function toBase64(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let out = "";
  let i = start;
  for (; i + 2 < end; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[(n >> 12) & 63] + B64_ALPHABET[(n >> 6) & 63] + B64_ALPHABET[n & 63];
  }
  if (end - i === 1) {
    const n = bytes[i] << 16;
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[(n >> 12) & 63] + "==";
  } else if (end - i === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_ALPHABET[n >> 18] + B64_ALPHABET[(n >> 12) & 63] + B64_ALPHABET[(n >> 6) & 63] + "=";
  }
  return out;
}

/* ----------------------------------------------------------- input text */

export type InputFormat = "auto" | "pem" | "base64" | "hex";

export type BytesResult = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

export interface InputBlock {
  /** PEM label, or null for raw Base64, hex or binary. */
  label: string | null;
  bytes: Uint8Array | null;
  error: string | null;
}

export type InputResult =
  | { ok: true; format: "pem" | "base64" | "hex" | "binary"; blocks: InputBlock[] }
  | { ok: false; error: string };

function sizeError(n: number): string {
  return `The decoded input is ${formatCount(n)} bytes. The viewer stops at ${formatCount(MAX_INPUT_BYTES)} bytes (256 KiB).`;
}

/** Hex with optional whitespace, colons, commas, 0x and \x prefixes. */
export function decodeHex(text: string): BytesResult {
  const cleaned = text.replace(/0x|\\x/gi, "").replace(/[\s:,;-]+/g, "");
  if (cleaned === "") return { ok: false, error: "There are no hex digits in the input." };
  const bad = cleaned.search(/[^0-9a-fA-F]/);
  if (bad !== -1) {
    return { ok: false, error: `"${cleaned[bad]}" is not a hex digit. Hex uses 0 to 9 and a to f.` };
  }
  if (cleaned.length % 2 !== 0) {
    return {
      ok: false,
      error: `The hex has an odd number of digits (${formatCount(cleaned.length)}). Every byte is exactly two digits, so one is missing.`,
    };
  }
  const n = cleaned.length / 2;
  if (n > MAX_INPUT_BYTES) return { ok: false, error: sizeError(n) };
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  return { ok: true, bytes: out };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX: Record<string, number> = {};
for (let i = 0; i < 64; i++) B64_INDEX[B64[i]] = i;
B64_INDEX["-"] = 62;
B64_INDEX["_"] = 63;

/** RFC 4648 Base64, standard or URL safe alphabet, padding optional, whitespace ignored. */
export function decodeBase64(text: string): BytesResult {
  const compact = text.replace(/\s+/g, "");
  if (compact === "") return { ok: false, error: "There is no Base64 in the input." };
  const firstPad = compact.indexOf("=");
  const body = firstPad === -1 ? compact : compact.slice(0, firstPad);
  if (firstPad !== -1 && !/^={1,2}$/.test(compact.slice(firstPad))) {
    return { ok: false, error: "Base64 padding (=) may only appear once or twice, at the very end." };
  }
  for (let i = 0; i < body.length; i++) {
    if (B64_INDEX[body[i]] === undefined) {
      return { ok: false, error: `"${body[i]}" at position ${i + 1} is not a Base64 character.` };
    }
  }
  if (body.length % 4 === 1) {
    return { ok: false, error: "The Base64 length is impossible: one character is left over, so the text was cut off." };
  }
  const n = Math.floor((body.length * 3) / 4);
  if (n > MAX_INPUT_BYTES) return { ok: false, error: sizeError(n) };
  const out = new Uint8Array(n);
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < body.length; i++) {
    acc = (acc << 6) | B64_INDEX[body[i]];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (acc >> bits) & 0xff;
    }
  }
  return { ok: true, bytes: out.subarray(0, j) };
}

/** Labels whose body is something other than DER. */
const NOT_DER: Record<string, string> = {
  "OPENSSH PRIVATE KEY": "OpenSSH private keys use OpenSSH's own binary format, not DER, so there is no ASN.1 inside.",
  "PGP PUBLIC KEY BLOCK": "OpenPGP armor holds OpenPGP packets (RFC 9580), not DER.",
  "PGP PRIVATE KEY BLOCK": "OpenPGP armor holds OpenPGP packets (RFC 9580), not DER.",
  "PGP MESSAGE": "OpenPGP armor holds OpenPGP packets (RFC 9580), not DER.",
  "PGP SIGNATURE": "OpenPGP armor holds OpenPGP packets (RFC 9580), not DER.",
};

/** RFC 7468 textual encoding. Any label is accepted; RFC 1421 headers are skipped. */
export function parsePem(text: string): InputResult {
  const re = /-----BEGIN ([^\r\n]*?)-----([\s\S]*?)-----END ([^\r\n]*?)-----/g;
  const blocks: InputBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const label = m[1].trim();
    const endLabel = m[3].trim();
    if (label !== endLabel) {
      blocks.push({ label, bytes: null, error: `BEGIN ${label} is closed by END ${endLabel}. The labels must match.` });
      continue;
    }
    if (NOT_DER[label]) {
      blocks.push({ label, bytes: null, error: NOT_DER[label] });
      continue;
    }
    let body = m[2];
    const lines = body.split(/\r?\n/);
    const headerLines = lines.filter((line) => /^[A-Za-z][A-Za-z0-9-]*:/.test(line.trim()));
    if (headerLines.some((line) => /^Proc-Type:\s*4\s*,\s*ENCRYPTED/i.test(line.trim()))) {
      blocks.push({
        label,
        bytes: null,
        error: "This is a legacy encrypted PEM key (Proc-Type: 4,ENCRYPTED). The body is ciphertext, so it holds no readable DER until it is decrypted.",
      });
      continue;
    }
    if (headerLines.length) {
      body = lines.filter((line) => !/^[A-Za-z][A-Za-z0-9-]*:/.test(line.trim())).join("\n");
    }
    const decoded = decodeBase64(body);
    blocks.push(decoded.ok ? { label, bytes: decoded.bytes, error: null } : { label, bytes: null, error: decoded.error });
    if (blocks.length >= 64) break;
  }
  if (blocks.length === 0) {
    if (/-----BEGIN /.test(text)) {
      return { ok: false, error: "There is a BEGIN line but no matching END line, so the PEM block is incomplete." };
    }
    return { ok: false, error: "No PEM block found. A PEM block starts with a line such as -----BEGIN CERTIFICATE-----." };
  }
  return { ok: true, format: "pem", blocks };
}

function looksHex(text: string): boolean {
  const cleaned = text.replace(/0x|\\x/gi, "").replace(/[\s:,;-]+/g, "");
  return cleaned.length > 0 && /^[0-9a-fA-F]+$/.test(cleaned);
}

/** Turn pasted text into one or more byte blocks. */
export function decodeInput(text: string, format: InputFormat): InputResult {
  if (text.length > MAX_TEXT_CHARS) {
    return {
      ok: false,
      error: `The input is ${formatCount(text.length)} characters. The viewer reads at most ${formatCount(MAX_TEXT_CHARS)}.`,
    };
  }
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "Nothing to parse yet." };

  let chosen = format;
  if (chosen === "auto") {
    if (/-----BEGIN /.test(trimmed)) chosen = "pem";
    else if (looksHex(trimmed)) chosen = "hex";
    else chosen = "base64";
  }
  if (chosen === "pem") return parsePem(trimmed);
  const result = chosen === "hex" ? decodeHex(trimmed) : decodeBase64(trimmed);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, format: chosen, blocks: [{ label: null, bytes: result.bytes, error: null }] };
}

/** An opened file: DER as is, or text that is decoded like a paste. */
export function decodeFileBytes(bytes: Uint8Array): InputResult {
  let printable = bytes.length > 0;
  for (let i = 0; i < bytes.length && printable; i++) {
    const b = bytes[i];
    if (!(b === 9 || b === 10 || b === 13 || (b >= 0x20 && b < 0x7f))) printable = false;
  }
  if (printable) {
    let text = "";
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return decodeInput(text, "auto");
  }
  if (bytes.length > MAX_INPUT_BYTES) return { ok: false, error: sizeError(bytes.length) };
  return { ok: true, format: "binary", blocks: [{ label: null, bytes, error: null }] };
}

/* --------------------------------------------------------------- parser */

class ParseFailure {
  constructor(
    public offset: number,
    public message: string,
    public recorded = false,
  ) {}
}

class CapReached {}

interface Ctx {
  buf: Uint8Array;
  count: number;
  /** Strict mode rejects anything that is not clean DER; used for encapsulation probes. */
  strict: boolean;
  errors: Asn1ParseError[];
  depthCapHit: boolean;
  issues: number;
}

interface Header {
  tagClass: TagClass;
  constructed: boolean;
  tagNumber: number;
  headerLength: number;
  lengthForm: "short" | "long" | "indefinite";
  lengthOctets: number;
  length: number | null;
  issues: Asn1Issue[];
}

/** X.690 8.1.2 (identifier octets) and 8.1.3 (length octets). */
function readHeader(buf: Uint8Array, pos: number, end: number, strict: boolean): Header {
  const start = pos;
  const issues: Asn1Issue[] = [];
  if (pos >= end) throw new ParseFailure(pos, "Expected an identifier octet but the data ended.");
  const first = buf[pos++];
  const tagClass = CLASS_BY_BITS[first >> 6];
  const constructed = (first & 0x20) !== 0;
  let tagNumber = first & 0x1f;

  if (tagNumber === 0x1f) {
    // High tag number form, 8.1.2.4: base 128, bit 8 set on every octet but the last.
    tagNumber = 0;
    let octets = 0;
    for (;;) {
      if (pos >= end) throw new ParseFailure(start, "The tag number continues past the end of the data.");
      const b = buf[pos++];
      if (octets === 0 && b === 0x80) {
        issues.push({ level: "invalid", text: "The first tag number octet is 0x80, a padding octet that X.690 8.1.2.4.2 forbids." });
      }
      tagNumber = tagNumber * 128 + (b & 0x7f);
      octets++;
      if (tagNumber > 0xffffffff) {
        throw new ParseFailure(start, "The tag number is larger than 4294967295. This parser stops there.");
      }
      if ((b & 0x80) === 0) break;
    }
    if (tagNumber < 31) {
      issues.push({ level: "der", text: `Tag number ${tagNumber} uses the long tag form, but numbers below 31 must use the single octet form.` });
    }
  }

  if (pos >= end) throw new ParseFailure(start, "The element has an identifier but the data ends before its length.");
  const lenByte = buf[pos++];
  let length: number | null;
  let lengthForm: Header["lengthForm"];
  let lengthOctets = 1;

  if (lenByte < 0x80) {
    length = lenByte;
    lengthForm = "short";
  } else if (lenByte === 0x80) {
    if (!constructed) {
      throw new ParseFailure(start, "A primitive element cannot use the indefinite length form (X.690 8.1.3.2).");
    }
    if (strict) throw new ParseFailure(start, "Indefinite length is not allowed in DER.");
    length = null;
    lengthForm = "indefinite";
    issues.push({ level: "der", text: "Indefinite length form. BER allows it for constructed elements; DER requires a definite length (X.690 10.1)." });
  } else if (lenByte === 0xff) {
    throw new ParseFailure(start, "The length octet 0xff is reserved by X.690 8.1.3.5 and never valid.");
  } else {
    const n = lenByte & 0x7f;
    lengthOctets = 1 + n;
    if (pos + n > end) throw new ParseFailure(start, `The length field needs ${n} more octets but the data ends first.`);
    let value = 0;
    for (let i = 0; i < n; i++) {
      value = value * 256 + buf[pos + i];
      if (value > Number.MAX_SAFE_INTEGER / 256) {
        throw new ParseFailure(start, "The length field encodes a length far larger than any input this viewer accepts.");
      }
    }
    if (buf[pos] === 0) {
      issues.push({ level: "der", text: "The long form length starts with a zero octet. DER requires the fewest length octets (X.690 10.1)." });
    } else if (value < 0x80) {
      issues.push({ level: "der", text: `Length ${value} uses the long form, but DER requires the short form for lengths below 128 (X.690 10.1).` });
    }
    pos += n;
    length = value;
    lengthForm = "long";
  }

  return {
    tagClass,
    constructed,
    tagNumber,
    headerLength: pos - start,
    lengthForm,
    lengthOctets,
    length,
    issues,
  };
}

function newNode(offset: number, depth: number, h: Header): Asn1Node {
  return {
    id: 0,
    depth,
    offset,
    headerLength: h.headerLength,
    tagClass: h.tagClass,
    constructed: h.constructed,
    tagNumber: h.tagNumber,
    lengthForm: h.lengthForm,
    lengthOctets: h.lengthOctets,
    length: h.length ?? 0,
    contentStart: offset + h.headerLength,
    contentEnd: offset + h.headerLength + (h.length ?? 0),
    end: offset + h.headerLength + (h.length ?? 0),
    name: tagName(h.tagClass, h.tagNumber),
    summary: "",
    fields: [],
    issues: [...h.issues],
    children: [],
    encapsulated: false,
    error: null,
    note: null,
    oid: null,
  };
}

function record(ctx: Ctx, failure: ParseFailure): void {
  if (!failure.recorded) {
    ctx.errors.push({ offset: failure.offset, message: failure.message });
    failure.recorded = true;
  }
}

/**
 * Parse consecutive elements from pos. With end set, stop exactly there; with
 * end null (inside an indefinite length element), stop after the
 * end-of-contents marker and return the position after it.
 */
function parseSequence(
  ctx: Ctx,
  pos: number,
  end: number | null,
  limit: number,
  depth: number,
  out: Asn1Node[],
  limitIsInputEnd: boolean,
): number {
  const stop = end ?? limit;
  while (pos < stop || end === null) {
    if (end === null && pos >= limit) {
      throw new ParseFailure(pos, "An indefinite length element has no end-of-contents marker (00 00) before the data ends.");
    }
    if (end === null && ctx.buf[pos] === 0 && pos + 1 < limit && ctx.buf[pos + 1] === 0) {
      return parseElement(ctx, pos, limit, depth, true, out, limitIsInputEnd).end;
    }
    pos = parseElement(ctx, pos, stop, depth, false, out, end === null ? limitIsInputEnd : false).end;
  }
  return pos;
}

/**
 * Parse one element at pos and append it to out. The node is appended as
 * soon as its header is read, so when its contents fail part way the
 * children read so far are still in the tree.
 */
function parseElement(
  ctx: Ctx,
  pos: number,
  limit: number,
  depth: number,
  isEoc: boolean,
  out: Asn1Node[],
  limitIsInputEnd: boolean,
): Asn1Node {
  if (++ctx.count > MAX_NODES) throw new CapReached();
  const h = readHeader(ctx.buf, pos, limit, ctx.strict);
  const node = newNode(pos, depth, h);

  if (h.length !== null && node.contentStart + h.length > limit) {
    const left = limit - node.contentStart;
    throw new ParseFailure(
      pos,
      `${node.name} at offset ${pos} declares ${formatCount(h.length)} content bytes but only ${formatCount(left)} remain${
        limitIsInputEnd ? " in the input, which is probably truncated" : " inside the element that contains it"
      }.`,
    );
  }
  out.push(node);

  if (isEoc) {
    node.summary = "end of contents";
    return node;
  }

  if (h.tagClass === "universal" && h.tagNumber === 0) {
    node.issues.push({
      level: "invalid",
      text: "An end-of-contents marker outside an indefinite length element is not a valid element (X.690 8.1.5).",
    });
  }

  if (h.tagClass === "universal") {
    if (h.constructed && ALWAYS_PRIMITIVE.has(h.tagNumber)) {
      node.issues.push({ level: "invalid", text: `${node.name} must use the primitive form, but this one is marked constructed.` });
    }
    if (!h.constructed && ALWAYS_CONSTRUCTED.has(h.tagNumber)) {
      node.issues.push({ level: "invalid", text: `${node.name} must use the constructed form, but this one is marked primitive.` });
    }
    if (h.constructed && STRING_TAGS.has(h.tagNumber)) {
      node.issues.push({ level: "der", text: `A constructed ${node.name} is valid BER, but DER requires strings to be primitive (X.690 10.2).` });
    }
  }

  if (h.constructed) {
    if (depth >= MAX_DEPTH) {
      if (h.length === null) {
        throw new ParseFailure(pos, `Nesting is deeper than ${MAX_DEPTH} levels inside an indefinite length element, so parsing stops here.`);
      }
      ctx.depthCapHit = true;
      node.note = `Not expanded: nesting is deeper than ${MAX_DEPTH} levels.`;
      node.summary = `${formatCount(h.length)} bytes, not expanded`;
      return finishNode(ctx, node);
    }
    if (h.length !== null) {
      try {
        parseSequence(ctx, node.contentStart, node.contentEnd, node.contentEnd, depth + 1, node.children, false);
      } catch (e) {
        if (!(e instanceof ParseFailure)) throw e;
        record(ctx, e);
        node.error = e.message;
      }
    } else {
      try {
        const after = parseSequence(ctx, node.contentStart, null, limit, depth + 1, node.children, limitIsInputEnd);
        node.end = after;
        node.contentEnd = after - 2;
        node.length = node.contentEnd - node.contentStart;
      } catch (e) {
        // The end of an indefinite element is only known by finding its
        // marker, so nothing after this point can be placed. Keep what was
        // read, cover it in the highlight, and let the failure travel up to
        // the nearest ancestor whose length is definite.
        const reached = node.children.length ? node.children[node.children.length - 1].end : node.contentStart;
        node.end = node.contentEnd = reached;
        node.length = reached - node.contentStart;
        if (e instanceof ParseFailure) {
          record(ctx, e);
          node.error = e.message;
        }
        describeConstructed(ctx.buf, node);
        throw e;
      }
    }
    describeConstructed(ctx.buf, node);
  } else {
    decodePrimitive(ctx, node, depth);
  }
  return finishNode(ctx, node);
}

function finishNode(ctx: Ctx, node: Asn1Node): Asn1Node {
  ctx.issues += node.issues.length;
  if (ctx.strict && node.issues.length) {
    throw new ParseFailure(node.offset, "Not clean DER.");
  }
  return node;
}

/* ------------------------------------------------------- value decoding */

function describeConstructed(buf: Uint8Array, node: Asn1Node): void {
  const n = node.children.filter((c) => c.name !== "EOC" || c.tagClass !== "universal").length;
  node.summary = `${n} ${n === 1 ? "element" : "elements"}`;
  if (node.tagClass === "universal" && STRING_TAGS.has(node.tagNumber)) {
    node.summary = `constructed string, ${n} ${n === 1 ? "segment" : "segments"}`;
  }

  // X.690 11.6: DER orders SET OF by encoding. Children that all share one
  // tag can only be a SET OF, since a SET's components have distinct tags.
  if (node.tagClass === "universal" && node.tagNumber === 17 && node.children.length > 1 && !node.error) {
    const kids = node.children;
    const sameTag = kids.every((k) => k.tagClass === kids[0].tagClass && k.tagNumber === kids[0].tagNumber);
    if (sameTag && node.lengthForm !== "indefinite") {
      node.fields.push({ label: "Ordering", value: "SET OF (all elements share one tag)" });
      for (let i = 1; i < kids.length; i++) {
        if (compareEncodings(buf, kids[i - 1], kids[i]) > 0) {
          node.issues.push({
            level: "der",
            text: "The elements are not in ascending order of their encodings, which DER requires for SET OF (X.690 11.6).",
          });
          break;
        }
      }
    }
  }
}

function compareEncodings(buf: Uint8Array, a: Asn1Node, b: Asn1Node): number {
  const la = a.end - a.offset;
  const lb = b.end - b.offset;
  const n = Math.max(la, lb);
  for (let i = 0; i < n; i++) {
    // The shorter encoding is padded with zero octets at its end.
    const x = i < la ? buf[a.offset + i] : 0;
    const y = i < lb ? buf[b.offset + i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Two's complement, big endian (X.690 8.3). */
export function decodeIntegerBytes(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return BigInt(0);
  let value = BigInt("0x" + toHex(bytes, 0, bytes.length, ""));
  if (bytes[0] & 0x80) value -= BigInt(1) << BigInt(bytes.length * 8);
  return value;
}

/** Bit length of |value| for a two's complement byte string, without BigInt. */
export function magnitudeBits(c: Uint8Array): number {
  let mag = c;
  if (c.length && c[0] & 0x80) {
    // Negate: invert every bit and add one.
    mag = new Uint8Array(c.length);
    let carry = 1;
    for (let i = c.length - 1; i >= 0; i--) {
      const v = (~c[i] & 0xff) + carry;
      mag[i] = v & 0xff;
      carry = v >> 8;
    }
  }
  let i = 0;
  while (i < mag.length && mag[i] === 0) i++;
  if (i === mag.length) return 0;
  return (mag.length - i - 1) * 8 + (32 - Math.clz32(mag[i]));
}

/** Hex for a detail row, cut at MAX_FIELD_HEX_BYTES. */
function hexField(bytes: Uint8Array, sep = " "): string {
  if (bytes.length <= MAX_FIELD_HEX_BYTES) return toHex(bytes, 0, bytes.length, sep);
  return `${toHex(bytes, 0, MAX_FIELD_HEX_BYTES, sep)} ... (${formatCount(bytes.length)} bytes; the byte panel shows them all)`;
}

/** X.690 8.19: base 128 subidentifiers, the first one carrying two arcs. */
export function decodeOid(bytes: Uint8Array, relative = false): { ok: true; dotted: string; issues: Asn1Issue[] } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "An OBJECT IDENTIFIER needs at least one content octet (X.690 8.19.2)." };
  const issues: Asn1Issue[] = [];
  const subs: bigint[] = [];
  let value = BigInt(0);
  let fresh = true;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (fresh && b === 0x80) {
      issues.push({ level: "invalid", text: `Subidentifier at content byte ${i} starts with 0x80, a padding octet X.690 8.19.2 forbids.` });
    }
    value = (value << BigInt(7)) | BigInt(b & 0x7f);
    fresh = false;
    if ((b & 0x80) === 0) {
      subs.push(value);
      value = BigInt(0);
      fresh = true;
    }
  }
  if (!fresh) {
    return { ok: false, error: "The last subidentifier is cut off: its final octet still has bit 8 set." };
  }
  if (subs.length > 1000) return { ok: false, error: "More than 1,000 arcs. This is not a usable object identifier." };
  const arcs: string[] = [];
  if (relative) {
    for (const s of subs) arcs.push(s.toString());
  } else {
    const first = subs[0];
    if (first < BigInt(40)) arcs.push("0", first.toString());
    else if (first < BigInt(80)) arcs.push("1", (first - BigInt(40)).toString());
    else arcs.push("2", (first - BigInt(80)).toString());
    for (let i = 1; i < subs.length; i++) arcs.push(subs[i].toString());
  }
  return { ok: true, dotted: arcs.join("."), issues };
}

const PRINTABLE_STRING = /^[A-Za-z0-9 '()+,\-./:=?]*$/;

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Make control characters visible and cut long text. */
export function displayText(text: string): string {
  const cut = text.length > MAX_TEXT_PREVIEW ? text.slice(0, MAX_TEXT_PREVIEW) : text;
  // eslint-disable-next-line no-control-regex
  const shown = cut.replace(/[\u0000-\u001f\u007f-\u009f]/g, (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`);
  return text.length > MAX_TEXT_PREVIEW ? `${shown}... (${formatCount(text.length)} characters in total)` : shown;
}

function decodeString(tag: number, bytes: Uint8Array, issues: Asn1Issue[]): string {
  switch (tag) {
    case 12:
    case 31:
    case 32:
    case 33:
    case 34:
    case 35:
    case 36:
    case 14: {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        issues.push({ level: "invalid", text: "The contents are not valid UTF-8." });
        return new TextDecoder("utf-8").decode(bytes);
      }
    }
    case 30: {
      // BMPString: UCS-2, two octets per character, big endian.
      if (bytes.length % 2 !== 0) issues.push({ level: "invalid", text: "A BMPString must have an even number of octets." });
      let s = "";
      for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      return s;
    }
    case 28: {
      // UniversalString: UCS-4, four octets per character, big endian.
      if (bytes.length % 4 !== 0) issues.push({ level: "invalid", text: "A UniversalString must have a multiple of four octets." });
      let s = "";
      for (let i = 0; i + 3 < bytes.length; i += 4) {
        const cp = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
        if (cp > 0x10ffff) {
          issues.push({ level: "invalid", text: `Code point 0x${cp.toString(16)} is beyond U+10FFFF.` });
          s += "�";
        } else s += String.fromCodePoint(cp);
      }
      return s;
    }
    default: {
      const s = latin1(bytes);
      if (tag === 19 && !PRINTABLE_STRING.test(s)) {
        issues.push({ level: "invalid", text: "PrintableString allows only A to Z, a to z, 0 to 9, space and ' ( ) + , - . / : = ?" });
      } else if (tag === 22 && /[^\x00-\x7f]/.test(s)) {
        issues.push({ level: "invalid", text: "IA5String is 7-bit ASCII, but a byte above 0x7f appears." });
      } else if (tag === 18 && !/^[0-9 ]*$/.test(s)) {
        issues.push({ level: "invalid", text: "NumericString allows only digits and space." });
      } else if (tag === 26 && !/^[\x20-\x7e]*$/.test(s)) {
        issues.push({ level: "invalid", text: "VisibleString allows only printable ASCII, 0x20 to 0x7e." });
      }
      return s;
    }
  }
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function validDate(y: number, mo: number, d: number, h: number, mi: number, s: number): string | null {
  if (mo < 1 || mo > 12) return `month ${mo} is out of range`;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = mo === 2 && leap ? 29 : DAYS_IN_MONTH[mo - 1];
  if (d < 1 || d > dim) return `day ${d} does not exist in that month`;
  if (h > 23) return `hour ${h} is out of range`;
  if (mi > 59) return `minute ${mi} is out of range`;
  if (s > 60) return `second ${s} is out of range`;
  return null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** UTCTime, X.680 section 47, with the RFC 5280 4.1.2.5.1 century rule. */
export function decodeUtcTime(text: string): { ok: true; iso: string; issues: Asn1Issue[] } | { ok: false; error: string } {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})$/.exec(text);
  if (!m) return { ok: false, error: `"${text}" is not a UTCTime. Expected YYMMDDHHMM[SS] then Z or an offset such as +0100.` };
  const yy = Number(m[1]);
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  const [mo, d, h, mi] = [m[2], m[3], m[4], m[5]].map(Number);
  const s = m[6] ? Number(m[6]) : 0;
  const bad = validDate(year, mo, d, h, mi, s);
  if (bad) return { ok: false, error: `The UTCTime is not a real time: ${bad}.` };
  const issues: Asn1Issue[] = [];
  if (!m[6] || m[7] !== "Z") {
    issues.push({ level: "der", text: "DER requires UTCTime to include seconds and end in Z (X.690 11.8)." });
  }
  const zone = m[7] === "Z" ? "UTC" : `UTC${m[7].slice(0, 3)}:${m[7].slice(3)}`;
  return {
    ok: true,
    iso: `${year}-${pad2(mo)}-${pad2(d)} ${pad2(h)}:${pad2(mi)}:${pad2(s)} ${zone}`,
    issues,
  };
}

/** GeneralizedTime, X.680 section 46, with the DER rules of X.690 11.7. */
export function decodeGeneralizedTime(text: string): { ok: true; iso: string; issues: Asn1Issue[] } | { ok: false; error: string } {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?(?:([.,])(\d+))?(Z|[+-]\d{4})?$/.exec(text);
  if (!m || (m[6] && !m[5])) {
    return { ok: false, error: `"${text}" is not a GeneralizedTime. Expected YYYYMMDDHH[MM[SS[.fff]]] and optionally Z or an offset.` };
  }
  const year = Number(m[1]);
  const [mo, d, h] = [m[2], m[3], m[4]].map(Number);
  const mi = m[5] ? Number(m[5]) : 0;
  const s = m[6] ? Number(m[6]) : 0;
  const bad = validDate(year, mo, d, h, mi, s);
  if (bad) return { ok: false, error: `The GeneralizedTime is not a real time: ${bad}.` };
  const issues: Asn1Issue[] = [];
  if (m[9] !== "Z") issues.push({ level: "der", text: "DER requires GeneralizedTime to end in Z (X.690 11.7.1)." });
  if (!m[6]) issues.push({ level: "der", text: "DER requires GeneralizedTime to include minutes and seconds (X.690 11.7.2)." });
  if (m[7] === ",") issues.push({ level: "der", text: "DER requires a full stop, not a comma, before fractional seconds (X.690 11.7.4)." });
  if (m[8] && /0$/.test(m[8])) issues.push({ level: "der", text: "DER forbids trailing zeros in fractional seconds (X.690 11.7.3)." });
  // X.680 46.2 lets the fraction follow the hour or the minute too, where it
  // is a fraction of that unit rather than of a second.
  const frac = !m[8] ? "" : m[6] ? `.${m[8]}` : ` plus .${m[8]} of the last ${m[5] ? "minute" : "hour"}`;
  const zone = m[9] === undefined ? "local time (no zone given)" : m[9] === "Z" ? "UTC" : `UTC${m[9].slice(0, 3)}:${m[9].slice(3)}`;
  return {
    ok: true,
    iso: `${year}-${pad2(mo)}-${pad2(d)} ${pad2(h)}:${pad2(mi)}:${pad2(s)}${frac} ${zone}`,
    issues,
  };
}

function isPrintableAscii(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] < 0x20 || bytes[i] > 0x7e) return false;
  return true;
}

function hexPreview(buf: Uint8Array, start: number, end: number, max = 24): string {
  const n = end - start;
  if (n === 0) return "empty";
  const shown = toHex(buf, start, Math.min(end, start + max), "");
  return n > max ? `${shown}... (${formatCount(n)} bytes)` : shown;
}

const ENCAPSULATED_PRIMITIVES = new Set([1, 2, 3, 4, 6, 10, 12, 19, 22, 23, 24, 30]);

/**
 * Try to read DER nested inside an OCTET STRING or BIT STRING. X.509
 * extensions, PKCS #8 private keys and SubjectPublicKeyInfo all wrap a
 * complete DER encoding this way. To avoid reading structure into random
 * bytes, the probe runs in strict mode and accepts only one clean DER
 * element of a common universal type that fills the contents exactly.
 */
function tryEncapsulated(ctx: Ctx, start: number, end: number, depth: number): Asn1Node[] | null {
  if (end - start < 3 || depth >= MAX_DEPTH) return null;
  const sub: Ctx = { buf: ctx.buf, count: ctx.count, strict: true, errors: [], depthCapHit: false, issues: 0 };
  const out: Asn1Node[] = [];
  try {
    parseSequence(sub, start, end, end, depth, out, false);
  } catch {
    return null;
  }
  if (sub.errors.length || sub.issues || sub.depthCapHit || out.length !== 1) return null;
  const only = out[0];
  if (only.tagClass !== "universal" || only.end !== end) return null;
  if (only.constructed ? only.tagNumber !== 16 && only.tagNumber !== 17 : !ENCAPSULATED_PRIMITIVES.has(only.tagNumber)) {
    return null;
  }
  ctx.count = sub.count;
  return out;
}

function decodePrimitive(ctx: Ctx, node: Asn1Node, depth: number): void {
  const buf = ctx.buf;
  const c = buf.subarray(node.contentStart, node.contentEnd);
  const issues = node.issues;
  const fields = node.fields;

  if (node.tagClass !== "universal") {
    node.summary = hexPreview(buf, node.contentStart, node.contentEnd);
    if (c.length) fields.push({ label: "Hex", value: hexField(c) });
    if (isPrintableAscii(c)) {
      const text = displayText(latin1(c));
      fields.push({ label: "As text", value: text });
      node.summary = `"${text}"`;
    }
    return;
  }

  switch (node.tagNumber) {
    case 0:
      node.summary = "end of contents";
      return;
    case 1: {
      if (c.length !== 1) {
        issues.push({ level: "invalid", text: `A BOOLEAN has exactly one content octet; this one has ${c.length}.` });
        node.summary = hexPreview(buf, node.contentStart, node.contentEnd);
        return;
      }
      node.summary = c[0] === 0 ? "false" : "true";
      if (c[0] !== 0 && c[0] !== 0xff) {
        issues.push({ level: "der", text: `TRUE is encoded as 0x${toHex(c)}. DER requires 0xff (X.690 11.1).` });
      }
      fields.push({ label: "Value", value: node.summary });
      return;
    }
    case 2:
    case 10: {
      if (c.length === 0) {
        issues.push({ level: "invalid", text: "An INTEGER needs at least one content octet (X.690 8.3.1)." });
        node.summary = "empty";
        return;
      }
      if (c.length > 1 && ((c[0] === 0 && (c[1] & 0x80) === 0) || (c[0] === 0xff && (c[1] & 0x80) !== 0))) {
        issues.push({ level: "invalid", text: "The first nine bits are all zeros or all ones, so the integer is not in its shortest form (X.690 8.3.2)." });
      }
      const bits = magnitudeBits(c);
      const negative = (c[0] & 0x80) !== 0;
      if (c.length <= DECIMAL_MAX_BYTES) {
        const value = decodeIntegerBytes(c).toString();
        node.summary = value;
        fields.push({ label: "Decimal", value });
      } else {
        node.summary = `${negative ? "negative " : ""}${bits} bit integer`;
      }
      fields.push({ label: "Hex (contents)", value: hexField(c, "") });
      fields.push({ label: "Magnitude", value: `${bits} ${bits === 1 ? "bit" : "bits"}${negative ? ", negative" : ""}` });
      return;
    }
    case 3: {
      if (c.length === 0) {
        issues.push({ level: "invalid", text: "A BIT STRING needs at least the initial unused bits octet (X.690 8.6.2)." });
        node.summary = "empty";
        return;
      }
      const unused = c[0];
      if (unused > 7) {
        issues.push({ level: "invalid", text: `The unused bits octet is ${unused}; it must be 0 to 7 (X.690 8.6.2.2).` });
        node.summary = hexPreview(buf, node.contentStart, node.contentEnd);
        return;
      }
      if (c.length === 1 && unused !== 0) {
        issues.push({ level: "invalid", text: "An empty BIT STRING must have 0 unused bits (X.690 8.6.2.3)." });
      }
      const data = c.subarray(1);
      const bitCount = data.length * 8 - (data.length ? unused : 0);
      if (unused && data.length && (data[data.length - 1] & ((1 << unused) - 1)) !== 0) {
        issues.push({ level: "der", text: "The unused trailing bits are not zero, which DER requires (X.690 11.2.1)." });
      }
      fields.push({ label: "Unused bits", value: String(unused) });
      fields.push({ label: "Bit length", value: formatCount(bitCount) });
      if (data.length) fields.push({ label: "Hex (data)", value: hexField(data) });
      if (data.length && data.length <= 4) {
        let binary = "";
        for (let i = 0; i < bitCount; i++) binary += (data[i >> 3] >> (7 - (i & 7))) & 1;
        const set: number[] = [];
        for (let i = 0; i < bitCount; i++) if (binary[i] === "1") set.push(i);
        fields.push({ label: "Bits", value: binary });
        fields.push({ label: "Set bits", value: set.length ? set.join(", ") : "none" });
      }
      node.summary = `${formatCount(bitCount)} bits${unused ? `, ${unused} unused` : ""}: ${hexPreview(buf, node.contentStart + 1, node.contentEnd)}`;
      if (unused === 0) {
        const inner = tryEncapsulated(ctx, node.contentStart + 1, node.contentEnd, depth + 1);
        if (inner) {
          node.children = inner;
          node.encapsulated = true;
          node.summary = `${formatCount(bitCount)} bits, encapsulates ${inner[0].name}`;
        }
      }
      return;
    }
    case 4: {
      node.summary = hexPreview(buf, node.contentStart, node.contentEnd);
      if (c.length) fields.push({ label: "Hex", value: hexField(c) });
      if (isPrintableAscii(c)) {
        const text = displayText(latin1(c));
        fields.push({ label: "As text", value: text });
        node.summary = `"${text}"`;
      }
      const inner = tryEncapsulated(ctx, node.contentStart, node.contentEnd, depth + 1);
      if (inner) {
        node.children = inner;
        node.encapsulated = true;
        node.summary = `${formatCount(c.length)} bytes, encapsulates ${inner[0].name}`;
      }
      return;
    }
    case 5:
      if (c.length !== 0) issues.push({ level: "invalid", text: `NULL must have no contents; this one has ${c.length} bytes (X.690 8.8.2).` });
      node.summary = "null";
      return;
    case 6:
    case 13: {
      const r = decodeOid(c, node.tagNumber === 13);
      if (!r.ok) {
        issues.push({ level: "invalid", text: r.error });
        node.summary = hexPreview(buf, node.contentStart, node.contentEnd);
        return;
      }
      issues.push(...r.issues);
      node.oid = r.dotted;
      const known = node.tagNumber === 6 ? OID_NAMES[r.dotted] : undefined;
      node.summary = known ? `${r.dotted} (${known})` : r.dotted;
      fields.push({ label: "Dotted", value: r.dotted });
      fields.push({ label: "Name", value: known ?? "not in the built-in table" });
      return;
    }
    case 9: {
      node.summary = c.length === 0 ? "0" : hexPreview(buf, node.contentStart, node.contentEnd);
      const specials: Record<number, string> = { 0x40: "PLUS-INFINITY", 0x41: "MINUS-INFINITY", 0x42: "NOT-A-NUMBER", 0x43: "minus zero" };
      if (c.length === 1 && specials[c[0]]) node.summary = specials[c[0]];
      fields.push({ label: "Hex", value: c.length ? hexField(c) : "empty (the value 0)" });
      return;
    }
    case 23:
    case 24: {
      const text = latin1(c);
      const r = node.tagNumber === 23 ? decodeUtcTime(text) : decodeGeneralizedTime(text);
      fields.push({ label: "Raw", value: displayText(text) });
      if (!r.ok) {
        issues.push({ level: "invalid", text: r.error });
        node.summary = `"${displayText(text)}"`;
        return;
      }
      issues.push(...r.issues);
      node.summary = r.iso;
      fields.push({ label: "Reads as", value: r.iso });
      if (node.tagNumber === 23) fields.push({ label: "Century rule", value: "YY of 50 or more is 19YY, below 50 is 20YY (RFC 5280)" });
      return;
    }
    default: {
      if (STRING_TAGS.has(node.tagNumber) || [14, 31, 32, 33, 34, 35, 36].includes(node.tagNumber)) {
        const text = decodeString(node.tagNumber, c, issues);
        const shown = displayText(text);
        node.summary = `"${shown}"`;
        fields.push({ label: "Text", value: shown });
        if ([20, 21, 25, 27, 7].includes(node.tagNumber)) {
          fields.push({ label: "Character set", value: "shown as Latin-1; the real repertoire depends on escape sequences" });
        }
        return;
      }
      node.summary = hexPreview(buf, node.contentStart, node.contentEnd);
      if (c.length) fields.push({ label: "Hex", value: hexField(c) });
    }
  }
}

/* ------------------------------------------------------ context labels */

/**
 * Readable summaries that need a node's neighbors: a SEQUENCE led by a
 * known OID takes its name, an attribute pair reads "commonName = x", and an
 * X.509 keyUsage extension lists its named bits.
 */
function annotate(node: Asn1Node): void {
  for (const child of node.children) annotate(child);
  const kids = node.children;
  if (!(node.tagClass === "universal" && node.tagNumber === 16 && node.constructed) || kids.length === 0) return;
  const head = kids[0];
  if (head.oid === null || head.tagNumber !== 6 || head.tagClass !== "universal") return;
  const known = OID_NAMES[head.oid];
  const name = known ?? head.oid;

  const second = kids[1];
  if (known && kids.length === 2 && second && second.tagClass === "universal" && !second.constructed && STRING_TAGS.has(second.tagNumber) && second.summary.startsWith('"')) {
    node.summary = `${name} = ${second.summary}`;
    return;
  }

  const last = kids[kids.length - 1];
  const isExtension =
    (kids.length === 2 || (kids.length === 3 && kids[1].tagClass === "universal" && kids[1].tagNumber === 1)) &&
    last.tagClass === "universal" &&
    last.tagNumber === 4 &&
    !last.constructed;
  if (isExtension) {
    const critical = kids.length === 3 && kids[1].summary === "true";
    node.summary = `extension ${name}${critical ? ", critical" : ""}`;
    last.fields.unshift({ label: "Extension", value: `${name} (${head.oid})${critical ? ", marked critical" : ""}` });
    if (head.oid === "2.5.29.15" && last.encapsulated && last.children[0]?.tagNumber === 3) {
      const bits = last.children[0].fields.find((f) => f.label === "Set bits")?.value ?? "none";
      const names = bits === "none" ? [] : bits.split(", ").map((b) => KEY_USAGE_BITS[Number(b)] ?? `bit ${b}`);
      last.children[0].fields.push({ label: "Key usage", value: names.length ? names.join(", ") : "none set" });
      last.children[0].summary = names.length ? names.join(", ") : last.children[0].summary;
    }
    return;
  }
  // A SEQUENCE OF OBJECT IDENTIFIER (extKeyUsage, for one) lists every name;
  // naming it after the first would hide the rest.
  if (kids.every((k) => k.oid !== null && k.tagNumber === 6 && k.tagClass === "universal")) {
    if (kids.length <= 4) node.summary = kids.map((k) => OID_NAMES[k.oid as string] ?? k.oid).join(", ");
    return;
  }
  if (known && kids.length <= 3) node.summary = known;
}

/* ------------------------------------------------------------ top level */

export function parseAsn1(buf: Uint8Array): Asn1ParseResult {
  const ctx: Ctx = { buf, count: 0, strict: false, errors: [], depthCapHit: false, issues: 0 };
  const roots: Asn1Node[] = [];
  let nodeCapHit = false;
  let consumed = 0;

  if (buf.length === 0) {
    ctx.errors.push({ offset: 0, message: "The input decoded to zero bytes." });
  } else if (buf.length > MAX_INPUT_BYTES) {
    ctx.errors.push({ offset: 0, message: sizeError(buf.length) });
  } else {
    let pos = 0;
    try {
      while (pos < buf.length) {
        pos = parseElement(ctx, pos, buf.length, 0, false, roots, true).end;
        consumed = pos;
      }
    } catch (e) {
      if (e instanceof CapReached) nodeCapHit = true;
      else if (e instanceof ParseFailure) record(ctx, e);
      else throw e;
    }
  }
  for (const root of roots) annotate(root);

  const nodes: Asn1Node[] = [];
  let derIssues = 0;
  let invalidIssues = 0;
  const walk = (n: Asn1Node, depth: number) => {
    n.id = nodes.length;
    n.depth = depth;
    nodes.push(n);
    for (const issue of n.issues) {
      if (issue.level === "der") derIssues++;
      else invalidIssues++;
    }
    for (const child of n.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);

  return {
    roots,
    nodes,
    errors: ctx.errors,
    nodeCapHit,
    depthCapHit: ctx.depthCapHit,
    derIssues,
    invalidIssues,
    consumed,
  };
}
