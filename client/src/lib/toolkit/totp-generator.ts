/**
 * HOTP (RFC 4226) and TOTP (RFC 6238) over WebCrypto, with the Base32
 * secret decoding (RFC 4648 section 6) and the otpauth:// key URI parsing
 * that enrollment QR codes use.
 *
 * Pure logic: no React and no DOM. Counters and times are BigInt throughout
 * because RFC 4226 defines the counter as 8 bytes and RFC 6238 section 4.2
 * requires T to keep working past 2038, when seconds since 1970 no longer
 * fit a signed 32 bit integer.
 */

export type OtpAlg = "SHA-1" | "SHA-256" | "SHA-512";

/** The three hashes RFC 6238 section 1.2 names, with their otpauth spelling. */
export const OTP_ALGS: { id: OtpAlg; uri: string; outBytes: number }[] = [
  { id: "SHA-1", uri: "SHA1", outBytes: 20 },
  { id: "SHA-256", uri: "SHA256", outBytes: 32 },
  { id: "SHA-512", uri: "SHA512", outBytes: 64 },
];

/** RFC 4226 section 5.3: at least 6 digits, and possibly 7 or 8. */
export const MIN_DIGITS = 6;
export const MAX_DIGITS = 8;
export const DEFAULT_PERIOD = 30;
/** Longest time step accepted, one day. Real deployments use 30 or 60 seconds. */
export const MAX_PERIOD = 86_400;
/** Longest secret or URI read, in characters. 1024 Base32 characters is 640 bytes of key. */
export const MAX_INPUT_CHARS = 4096;
export const MAX_SECRET_CHARS = 1024;
/** Most time steps checked either side of now when verifying a TOTP code. */
export const MAX_TOTP_WINDOW = 10;
/** Most counters checked ahead when verifying an HOTP code (the look-ahead s of RFC 4226 section 7.4). */
export const MAX_HOTP_LOOKAHEAD = 100;
/** RFC 4226 section 4, requirement R6: the shared secret is at least 128 bits. */
export const MIN_SECRET_BYTES = 16;
/** And 160 bits is the recommended length. */
export const RECOMMENDED_SECRET_BYTES = 20;

export const UINT64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

/* ----------------------------------------------------------------- base32 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type Base32Result =
  | { ok: true; bytes: Uint8Array; normalized: string }
  | { ok: false; error: string };

const MISREAD: Record<string, string> = {
  "0": "0 is not in the Base32 alphabet; it is usually a misread O",
  "1": "1 is not in the Base32 alphabet; it is usually a misread I or L",
  "8": "8 is not in the Base32 alphabet; it is usually a misread B",
  "9": "9 is not in the Base32 alphabet",
};

/**
 * Decode Base32 as RFC 4648 section 6 defines it, tolerating the ways a
 * secret arrives in practice: lowercase, grouped with spaces or hyphens,
 * and without its = padding (the key URI format says to omit it).
 */
export function decodeBase32(input: string): Base32Result {
  if (input.length > MAX_SECRET_CHARS * 2) {
    return { ok: false, error: `The secret is longer than ${MAX_SECRET_CHARS} characters, which is far past any real key.` };
  }
  const cleaned = input.replace(/[\s-]/g, "").toUpperCase();
  const firstPad = cleaned.indexOf("=");
  const body = firstPad === -1 ? cleaned : cleaned.slice(0, firstPad);
  if (firstPad !== -1 && !/^=+$/.test(cleaned.slice(firstPad))) {
    return { ok: false, error: "Padding (=) can only come at the end of a Base32 secret." };
  }
  if (firstPad !== -1 && cleaned.length - firstPad > 6) {
    return { ok: false, error: "Base32 never needs more than six = signs of padding." };
  }
  if (body.length > MAX_SECRET_CHARS) {
    return { ok: false, error: `The secret is ${body.length} characters. This tool reads up to ${MAX_SECRET_CHARS}.` };
  }
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (B32.indexOf(ch) === -1) {
      const hint = MISREAD[ch] ?? `Base32 uses only A to Z and 2 to 7, so "${ch}" cannot appear`;
      return { ok: false, error: `Character ${i + 1} of the secret: ${hint}.` };
    }
  }
  // 8 characters carry 5 bytes. A trailing group of 1, 3 or 6 characters
  // would hold a fractional byte, so no encoder ever emits one.
  const rem = body.length % 8;
  if (rem === 1 || rem === 3 || rem === 6) {
    return {
      ok: false,
      error: `${body.length} characters cannot be whole bytes. Base32 packs 5 bytes into 8 characters, and a final group of ${rem} is impossible, so a character is missing or extra.`,
    };
  }
  const bytes = new Uint8Array(Math.floor((body.length * 5) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < body.length; i++) {
    acc = ((acc << 5) | B32.indexOf(body[i])) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[j++] = (acc >> bits) & 0xff;
    }
  }
  return { ok: true, bytes, normalized: body };
}

/** RFC 4648 section 6 encoding, unpadded unless asked. */
export function encodeBase32(bytes: Uint8Array, pad = false): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    acc = ((acc << 8) | bytes[i]) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(acc >> bits) & 31];
    }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  if (pad) while (out.length % 8 !== 0) out += "=";
  return out;
}

/** Groups of four, the way authenticator apps print a secret for manual entry. */
export function groupBase32(normalized: string): string {
  return normalized.replace(/(.{4})(?=.)/g, "$1 ");
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/* --------------------------------------------------------- counters, time */

export type UintResult = { ok: true; value: bigint } | { ok: false; error: string };

/** A non-negative decimal integer that fits in 64 bits. */
export function parseUint64(input: string, what: string): UintResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: `Enter a ${what}.` };
  if (!/^\d+$/.test(text)) return { ok: false, error: `The ${what} must be a whole number of zero or more, digits only.` };
  if (text.replace(/^0+(?=\d)/, "").length > 20) {
    return { ok: false, error: `The ${what} does not fit in 64 bits.` };
  }
  const value = BigInt(text);
  if (value > UINT64_MAX) return { ok: false, error: `The ${what} does not fit in 64 bits (the most is ${UINT64_MAX}).` };
  return { ok: true, value };
}

export type PeriodResult = { ok: true; value: number } | { ok: false; error: string };

export function parsePeriod(input: string): PeriodResult {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: "The period is a whole number of seconds, such as 30." };
  const value = Number(text);
  if (value < 1 || value > MAX_PERIOD) {
    return { ok: false, error: `The period must be between 1 and ${MAX_PERIOD.toLocaleString("en-US")} seconds.` };
  }
  return { ok: true, value };
}

/** RFC 4226 section 5.1: the counter C is an 8 byte big-endian value. */
export function counterBytes(counter: bigint): Uint8Array {
  if (counter < BigInt(0) || counter > UINT64_MAX) throw new RangeError("counter outside 0 to 2^64 - 1");
  const out = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(c & BigInt(0xff));
    c >>= BigInt(8);
  }
  return out;
}

/**
 * RFC 6238 section 4.2: T = floor((Current Unix time - T0) / X).
 * The caller guarantees unixSeconds >= t0, so BigInt's truncating division
 * is the floor.
 */
export function timeStep(unixSeconds: bigint, period: number, t0: bigint = BigInt(0)): bigint {
  return (unixSeconds - t0) / BigInt(period);
}

/** Seconds left in the current step, from 1 to period. */
export function secondsRemaining(unixSeconds: bigint, period: number, t0: bigint = BigInt(0)): number {
  const into = Number((unixSeconds - t0) % BigInt(period));
  return period - into;
}

/* -------------------------------------------------------------- truncation */

export interface Truncation {
  /** Low four bits of the last HMAC byte (RFC 4226 section 5.3). */
  offset: number;
  /** The last HMAC byte, whose low nibble is the offset. */
  lastByte: number;
  /** The four bytes starting at offset. */
  selected: Uint8Array;
  /** Those four bytes as an unsigned 32 bit integer, before masking. */
  word: number;
  /** word & 0x7fffffff: the 31 bit Snum. */
  binCode: number;
  digits: number;
  /** The decimal code, left padded with zeros to `digits`. */
  code: string;
}

/**
 * Dynamic truncation, RFC 4226 section 5.3. The top bit is cleared so the
 * result reads the same on machines that treat 32 bit values as signed and
 * as unsigned. RFC 6238 applies the same offset rule to the longer SHA-256
 * and SHA-512 outputs: the offset is at most 15, so offset + 3 always falls
 * inside even a 20 byte SHA-1 result.
 */
export function dynamicTruncate(hmac: Uint8Array, digits: number): Truncation {
  const lastByte = hmac[hmac.length - 1];
  const offset = lastByte & 0x0f;
  const selected = hmac.slice(offset, offset + 4);
  const word = ((selected[0] << 24) >>> 0) + (selected[1] << 16) + (selected[2] << 8) + selected[3];
  const binCode = word & 0x7fffffff;
  const code = String(binCode % 10 ** digits).padStart(digits, "0");
  return { offset, lastByte, selected, word, binCode, digits, code };
}

/* ----------------------------------------------------------------- hashing */

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

/** Import once per secret and algorithm, then sign as many counters as needed. */
export async function importOtpKey(secret: Uint8Array, alg: OtpAlg): Promise<CryptoKey> {
  if (secret.length === 0) throw new RangeError("empty secret");
  return subtle().importKey("raw", secret, { name: "HMAC", hash: alg }, false, ["sign"]);
}

export interface OtpResult {
  counter: bigint;
  counterBytes: Uint8Array;
  hmac: Uint8Array;
  truncation: Truncation;
  code: string;
}

/** HOTP(K, C) = Truncate(HMAC(K, C)), RFC 4226 section 5.3. */
export async function otpWithKey(key: CryptoKey, counter: bigint, digits: number): Promise<OtpResult> {
  const c = counterBytes(counter);
  const hmac = new Uint8Array(await subtle().sign("HMAC", key, c));
  const truncation = dynamicTruncate(hmac, digits);
  return { counter, counterBytes: c, hmac, truncation, code: truncation.code };
}

export async function generateOtp(secret: Uint8Array, counter: bigint, alg: OtpAlg, digits: number): Promise<OtpResult> {
  return otpWithKey(await importOtpKey(secret, alg), counter, digits);
}

/**
 * Every counter in [center - behind, center + ahead], clamped to 0 and
 * 2^64 - 1, whose code equals `code`. A verifier accepting a window is
 * what RFC 6238 section 5.2 (clock drift) and RFC 4226 section 7.4
 * (resynchronization) describe; the caps keep the work bounded.
 */
export async function findMatches(
  secret: Uint8Array,
  alg: OtpAlg,
  digits: number,
  code: string,
  center: bigint,
  behind: number,
  ahead: number,
): Promise<bigint[]> {
  const key = await importOtpKey(secret, alg);
  const zero = BigInt(0);
  const lo = center - BigInt(behind) < zero ? zero : center - BigInt(behind);
  const hi = center + BigInt(ahead) > UINT64_MAX ? UINT64_MAX : center + BigInt(ahead);
  const out: bigint[] = [];
  for (let c = lo; c <= hi; c += BigInt(1)) {
    const r = await otpWithKey(key, c, digits);
    if (r.code === code) out.push(c);
  }
  return out;
}

/* ---------------------------------------------------------------- key URI */

export interface OtpauthUri {
  type: "totp" | "hotp";
  /** The decoded label, issuer prefix included. */
  label: string;
  /** The issuer parameter, or the label prefix when the parameter is absent. */
  issuer: string | null;
  account: string;
  secret: Uint8Array;
  secretBase32: string;
  algorithm: OtpAlg;
  digits: number;
  period: number;
  counter: bigint | null;
  warnings: string[];
}

export type OtpauthResult = { ok: true; value: OtpauthUri } | { ok: false; error: string };

function safeDecode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/**
 * Parse an otpauth:// URI as the Key Uri Format (published by Google for
 * Google Authenticator, and followed by most other apps) describes it:
 *
 *   otpauth://TYPE/LABEL?secret=...&issuer=...&algorithm=...&digits=...&period=...&counter=...
 *
 * It is a de facto format rather than an RFC, so the defaults applied here
 * are that document's: SHA1, 6 digits, 30 seconds.
 */
export function parseOtpauthUri(input: string): OtpauthResult {
  const text = input.trim();
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, error: `The URI is longer than ${MAX_INPUT_CHARS} characters, which is far past any real one.` };
  }
  const m = /^otpauth:\/\/([^/?#]*)\/([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i.exec(text);
  if (!m) {
    return {
      ok: false,
      error: "An otpauth URI looks like otpauth://totp/Issuer:account?secret=BASE32SECRET&issuer=Issuer.",
    };
  }
  const type = m[1].toLowerCase();
  if (type !== "totp" && type !== "hotp") {
    return { ok: false, error: `The URI type must be totp or hotp, not "${m[1]}".` };
  }
  const label = safeDecode(m[2]);
  if (label === null) return { ok: false, error: "The label has a malformed percent escape." };

  const params = new URLSearchParams(m[3] ?? "");
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const k of params.keys()) {
    const lower = k.toLowerCase();
    if (seen.has(lower)) warnings.push(`The ${lower} parameter appears more than once; the first one is used.`);
    seen.add(lower);
  }
  const get = (name: string): string | null => {
    for (const [k, v] of params) if (k.toLowerCase() === name) return v;
    return null;
  };

  const rawSecret = get("secret");
  if (rawSecret === null || rawSecret.trim() === "") {
    return { ok: false, error: "The URI has no secret parameter, so there is no key to compute codes from." };
  }
  const secret = decodeBase32(rawSecret);
  if (!secret.ok) return { ok: false, error: `The secret parameter is not valid Base32. ${secret.error}` };
  if (secret.bytes.length === 0) return { ok: false, error: "The secret parameter decodes to zero bytes." };

  let algorithm: OtpAlg = "SHA-1";
  const rawAlg = get("algorithm");
  if (rawAlg !== null) {
    const norm = rawAlg.trim().toUpperCase().replace(/-/g, "");
    const found = OTP_ALGS.find((a) => a.uri === norm);
    if (!found) return { ok: false, error: `The algorithm must be SHA1, SHA256 or SHA512, not "${rawAlg}".` };
    algorithm = found.id;
  }

  let digits = 6;
  const rawDigits = get("digits");
  if (rawDigits !== null) {
    const d = rawDigits.trim();
    if (!/^\d+$/.test(d) || Number(d) < MIN_DIGITS || Number(d) > MAX_DIGITS) {
      return { ok: false, error: `The digits parameter must be ${MIN_DIGITS}, 7 or ${MAX_DIGITS}, not "${rawDigits}".` };
    }
    digits = Number(d);
  }

  let period = DEFAULT_PERIOD;
  const rawPeriod = get("period");
  if (rawPeriod !== null) {
    const p = parsePeriod(rawPeriod);
    if (!p.ok) return { ok: false, error: `The period parameter is invalid. ${p.error}` };
    period = p.value;
    if (type === "hotp") warnings.push("The period parameter has no meaning for HOTP and is ignored.");
  }

  let counter: bigint | null = null;
  const rawCounter = get("counter");
  if (type === "hotp") {
    if (rawCounter === null) {
      warnings.push("The key URI format requires a counter parameter for HOTP and this URI has none, so counting starts at 0.");
      counter = BigInt(0);
    } else {
      const c = parseUint64(rawCounter, "counter");
      if (!c.ok) return { ok: false, error: `The counter parameter is invalid. ${c.error}` };
      counter = c.value;
    }
  } else if (rawCounter !== null) {
    warnings.push("The counter parameter has no meaning for TOTP and is ignored.");
  }

  const colon = label.indexOf(":");
  const labelIssuer = colon === -1 ? null : label.slice(0, colon).trim();
  const account = (colon === -1 ? label : label.slice(colon + 1)).trim();
  const issuerParam = get("issuer");
  const issuer = issuerParam !== null && issuerParam.trim() !== "" ? issuerParam.trim() : labelIssuer || null;
  if (issuerParam !== null && labelIssuer && issuerParam.trim() !== labelIssuer) {
    warnings.push(
      `The label says the issuer is "${labelIssuer}" but the issuer parameter says "${issuerParam.trim()}". Apps differ on which one they show.`,
    );
  }
  if (issuerParam === null) {
    warnings.push("There is no issuer parameter. The format strongly recommends one, so the entry can be told apart from others.");
  }
  if (secret.bytes.length < MIN_SECRET_BYTES) {
    warnings.push(
      `The secret is ${secret.bytes.length * 8} bits. RFC 4226 requires at least 128 and recommends 160.`,
    );
  }

  return {
    ok: true,
    value: {
      type,
      label,
      issuer,
      account,
      secret: secret.bytes,
      secretBase32: secret.normalized,
      algorithm,
      digits,
      period,
      counter,
      warnings,
    },
  };
}

export interface BuildUriInput {
  type: "totp" | "hotp";
  issuer: string;
  account: string;
  secretBase32: string;
  algorithm: OtpAlg;
  digits: number;
  period: number;
  counter: bigint;
}

/** The inverse of parseOtpauthUri, with the issuer both in the label and as a parameter, as the format advises. */
export function buildOtpauthUri(input: BuildUriInput): string {
  const issuer = input.issuer.trim();
  const account = input.account.trim() || "account";
  const label = issuer ? `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` : encodeURIComponent(account);
  const params = [`secret=${input.secretBase32}`];
  if (issuer) params.push(`issuer=${encodeURIComponent(issuer)}`);
  const algUri = OTP_ALGS.find((a) => a.id === input.algorithm)?.uri ?? "SHA1";
  params.push(`algorithm=${algUri}`, `digits=${input.digits}`);
  if (input.type === "totp") params.push(`period=${input.period}`);
  else params.push(`counter=${input.counter.toString()}`);
  return `otpauth://${input.type}/${label}?${params.join("&")}`;
}
