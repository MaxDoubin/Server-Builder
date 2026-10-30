/**
 * Set-Cookie analysis, following the user agent algorithms of RFC 6265bis
 * (draft-ietf-httpbis-rfc6265bis-22, December 2025) rather than the server
 * grammar, because the question a reader has is what a browser will do with
 * the line, not whether the line is pretty. Section numbers in comments refer
 * to that draft. The Partitioned attribute comes from the CHIPS draft
 * (draft-cutler-httpbis-partitioned-cookies-01).
 *
 * Pure logic: no React and no DOM. TextEncoder, TextDecoder and URL are the
 * only platform objects used, and Node provides all three, so the unit tests
 * run the same code the page does.
 */

/* ------------------------------------------------------------------ limits */

/** Largest paste read, in characters. */
export const MAX_INPUT_CHARS = 65_536;
/** Most Set-Cookie lines analyzed from one paste. */
export const MAX_COOKIES = 50;
/** Section 5.6 step 5: name plus value longer than this is ignored. */
export const MAX_NAME_VALUE_BYTES = 4096;
/** Section 5.6, attribute step 6: an attribute value longer than this is ignored. */
export const MAX_ATTRIBUTE_VALUE_BYTES = 1024;
/** Section 5.5: the RECOMMENDED cap on a cookie's lifetime, 400 days. */
export const AGE_LIMIT_SECONDS = 34_560_000;
/** Longest decoded preview shown for a value. */
export const MAX_PREVIEW_CHARS = 1200;

const DAY = 86_400;

/* ------------------------------------------------------------------ shared */

export type Tone = "danger" | "warn" | "info" | "ok";

export interface Finding {
  tone: Tone;
  text: string;
}

const encoder = new TextEncoder();

export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

/** WSP is SP or HTAB (RFC 5234). String.prototype.trim removes far more. */
export function trimWsp(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && (text[start] === " " || text[start] === "\t")) start++;
  while (end > start && (text[end - 1] === " " || text[end - 1] === "\t")) end--;
  return text.slice(start, end);
}

function hex2(code: number): string {
  return code.toString(16).toUpperCase().padStart(2, "0");
}

/** The first %x00-08 / %x0A-1F / %x7F character, the CTLs section 5.6 step 1 rejects. */
export function findForbiddenControl(text: string): { index: number; code: number } | null {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c <= 0x08) || (c >= 0x0a && c <= 0x1f) || c === 0x7f) return { index: i, code: c };
  }
  return null;
}

/* ------------------------------------------------------------------- dates */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** delimiter = %x09 / %x20-2F / %x3B-40 / %x5B-60 / %x7B-7E (section 5.1.1). */
function isDateDelimiter(code: number): boolean {
  return (
    code === 0x09 ||
    (code >= 0x20 && code <= 0x2f) ||
    (code >= 0x3b && code <= 0x40) ||
    (code >= 0x5b && code <= 0x60) ||
    (code >= 0x7b && code <= 0x7e)
  );
}

/*
  The productions of section 5.1.1, each anchored to the whole date-token.
  [0-9] rather than \d keeps them to ASCII digits, and the optional tail is
  "non-digit *OCTET": a non-digit, then anything at all.
*/
const TIME_RE = /^([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})(?:[^0-9][\s\S]*)?$/;
const DAY_RE = /^([0-9]{1,2})(?:[^0-9][\s\S]*)?$/;
const MONTH_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const YEAR_RE = /^([0-9]{2,4})(?:[^0-9][\s\S]*)?$/;

export type CookieDate = { ok: true; ms: number } | { ok: false; reason: string };

/** The cookie-date algorithm of section 5.1.1, step by step. */
export function parseCookieDate(input: string): CookieDate {
  const tokens: string[] = [];
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (isDateDelimiter(ch.charCodeAt(0))) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);

  let time: [number, number, number] | null = null;
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  for (const token of tokens) {
    let m: RegExpExecArray | null;
    if (time === null && (m = TIME_RE.exec(token))) {
      time = [Number(m[1]), Number(m[2]), Number(m[3])];
      continue;
    }
    if (day === null && (m = DAY_RE.exec(token))) {
      day = Number(m[1]);
      continue;
    }
    if (month === null && (m = MONTH_RE.exec(token))) {
      month = MONTHS.indexOf(m[1].toLowerCase());
      continue;
    }
    if (year === null && (m = YEAR_RE.exec(token))) {
      year = Number(m[1]);
      continue;
    }
  }

  // Steps 3 and 4: two digit years.
  if (year !== null && year >= 70 && year <= 99) year += 1900;
  else if (year !== null && year >= 0 && year <= 69) year += 2000;

  // Step 5.
  if (time === null) return { ok: false, reason: "no time of day in hh:mm:ss form" };
  if (day === null) return { ok: false, reason: "no day of the month" };
  if (month === null) return { ok: false, reason: "no month name" };
  if (year === null) return { ok: false, reason: "no year" };
  if (day < 1 || day > 31) return { ok: false, reason: `day ${day} is outside 1 to 31` };
  if (year < 1601) return { ok: false, reason: `year ${year} is before 1601` };
  if (time[0] > 23) return { ok: false, reason: `hour ${time[0]} is over 23` };
  if (time[1] > 59) return { ok: false, reason: `minute ${time[1]} is over 59` };
  if (time[2] > 59) return { ok: false, reason: `second ${time[2]} is over 59 (leap seconds are not allowed)` };

  // Step 6: the date has to exist.
  const ms = Date.UTC(year, month, day, time[0], time[1], time[2]);
  const check = new Date(ms);
  if (check.getUTCDate() !== day || check.getUTCMonth() !== month) {
    return { ok: false, reason: `${MONTH_NAMES[month]} ${day}, ${year} does not exist` };
  }
  return { ok: true, ms };
}

const IMF_FIXDATE =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/;

/** RFC 9110 section 5.6.7, the only date format a server should send. */
export function isImfFixdate(text: string): boolean {
  return IMF_FIXDATE.test(text);
}

/** The IMF-fixdate spelling of an instant, as a server should write Expires. */
export function toImfFixdate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${DAY_NAMES[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTH_NAMES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).padStart(4, "0")} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`;
}

/* ----------------------------------------------------------------- Max-Age */

export type MaxAge =
  | { ok: true; requested: bigint; seconds: number; capped: boolean }
  | { ok: false; reason: string };

/** Section 5.6.2. BigInt, because nothing stops a server sending forty digits. */
export function parseMaxAge(value: string): MaxAge {
  if (value === "") return { ok: false, reason: "it is empty" };
  const first = value[0];
  const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
  if (!isDigit(first) && !(first === "-" && isDigit(value[1]))) {
    return { ok: false, reason: `it starts with "${first}" rather than a digit or a minus sign followed by a digit` };
  }
  for (let i = 1; i < value.length; i++) {
    if (!isDigit(value[i])) {
      return { ok: false, reason: `"${value[i]}" at position ${i + 1} is not a digit` };
    }
  }
  const requested = BigInt(value);
  const limit = BigInt(AGE_LIMIT_SECONDS);
  const capped = requested > limit;
  return { ok: true, requested, seconds: Number(capped ? limit : requested), capped };
}

/* ------------------------------------------------------------ hosts, paths */

export interface RequestUrl {
  href: string;
  scheme: string;
  host: string;
  isIp: boolean;
  /** https, or a loopback host that browsers treat as potentially trustworthy. */
  secure: boolean;
  loopback: boolean;
  path: string;
  assumedScheme: boolean;
}

export type UrlResult = { ok: true; url: RequestUrl } | { ok: false; error: string };

const IPV4_RE = /^(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

export function isIpAddress(host: string): boolean {
  return IPV4_RE.test(host) || (host.startsWith("[") && host.endsWith("]")) || host.includes(":");
}

/** Parse the URL a response came from. The WHATWG parser lowercases and punycodes the host. */
export function parseRequestUrl(input: string): UrlResult {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "Enter the URL of the response that sent these headers." };
  if (raw.length > 2048) return { ok: false, error: "That URL is over 2,048 characters." };
  const assumedScheme = !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  let parsed: URL;
  try {
    parsed = new URL(assumedScheme ? `https://${raw}` : raw);
  } catch {
    return { ok: false, error: "That is not a URL the browser can parse." };
  }
  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return { ok: false, error: `Cookies arrive over http or https, not ${scheme}.` };
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "") return { ok: false, error: "That URL has no host." };
  const loopback =
    host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host) || host === "[::1]";
  return {
    ok: true,
    url: {
      href: parsed.href,
      scheme,
      host,
      isIp: isIpAddress(host),
      secure: scheme === "https" || loopback,
      loopback,
      path: parsed.pathname || "/",
      assumedScheme,
    },
  };
}

/** Section 5.1.4: the "directory" of the request path. */
export function defaultPath(uriPath: string): string {
  if (uriPath === "" || uriPath[0] !== "/") return "/";
  const last = uriPath.lastIndexOf("/");
  if (last === 0) return "/";
  return uriPath.slice(0, last);
}

/** Section 5.1.3. Both inputs are expected to be lower case already. */
export function domainMatch(host: string, domain: string): boolean {
  if (host === domain) return true;
  if (isIpAddress(host)) return false;
  return host.endsWith(domain) && host.length > domain.length && host[host.length - domain.length - 1] === ".";
}

/*
  A subset of the Public Suffix List (publicsuffix.org): the multi-label
  suffixes met most often, ICANN and private. The list's default rule makes
  every single label (com, io, uk) a public suffix as well, which is applied
  in code rather than listed. The real list has thousands of entries, so a
  domain missing from here is not proof that it is registrable.
*/
const PUBLIC_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.nz", "org.nz",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "co.kr", "com.br", "com.cn", "com.mx",
  "co.in", "co.za", "com.tr", "com.sg", "com.hk", "com.tw", "co.il",
  "github.io", "gitlab.io", "herokuapp.com", "vercel.app", "netlify.app",
  "pages.dev", "workers.dev", "web.app", "firebaseapp.com", "appspot.com",
  "blogspot.com", "azurewebsites.net", "cloudfront.net", "onrender.com",
  "fly.dev", "glitch.me", "s3.amazonaws.com",
]);

export const PUBLIC_SUFFIX_SAMPLE_SIZE = PUBLIC_SUFFIXES.size;

export function isPublicSuffix(domain: string): boolean {
  if (domain === "" || isIpAddress(domain)) return false;
  return !domain.includes(".") || PUBLIC_SUFFIXES.has(domain);
}

/** The registrable domain (eTLD+1) by the subset above, or null for a suffix or an IP. */
export function registrableDomain(domain: string): string | null {
  if (domain === "" || isIpAddress(domain)) return null;
  const labels = domain.split(".");
  let suffixLabels = 1;
  for (let i = 0; i < labels.length - 1; i++) {
    if (PUBLIC_SUFFIXES.has(labels.slice(i).join("."))) {
      suffixLabels = labels.length - i;
      break;
    }
  }
  if (labels.length <= suffixLabels) return null;
  return labels.slice(labels.length - suffixLabels - 1).join(".");
}

/* --------------------------------------------------------- value insights */

export interface ValueInsight {
  kind: "jwt" | "jwe" | "base64-json" | "base64-text" | "base64-binary" | "hex" | "percent" | "quoted";
  title: string;
  detail: string;
  preview?: string;
}

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_VALUES = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64_VALUES[B64_ALPHABET.charCodeAt(i)] = i;
B64_VALUES[0x2d] = 62; // "-" (RFC 4648 section 5)
B64_VALUES[0x5f] = 63; // "_"

/** Base64 in either alphabet, padding optional. Null when it is not Base64 at all. */
export function decodeBase64Loose(text: string): Uint8Array | null {
  const body = text.replace(/=+$/, "");
  if (text.length - body.length > 2) return null;
  if (body.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((body.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    const v = code < 128 ? B64_VALUES[code] : -1;
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

/** UTF-8 text with no control characters other than tab, CR and LF, or null. */
export function printableUtf8(bytes: Uint8Array): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f) return null;
  }
  return text;
}

function clip(text: string): string {
  return text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n(preview cut at ${MAX_PREVIEW_CHARS} characters)` : text;
}

function hexPreview(bytes: Uint8Array, max = 24): string {
  const shown = Array.from(bytes.subarray(0, max), (b) => b.toString(16).padStart(2, "0")).join(" ");
  return bytes.length > max ? `${shown} ...` : shown;
}

function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface JwtPeek {
  header: Record<string, unknown>;
  payload: Record<string, unknown> | null;
  alg: string | null;
}

/** Read the header and payload of a compact JWS. Decoding only; nothing is verified. */
export function peekJwt(text: string): JwtPeek | null {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(text)) return null;
  const [h, p] = text.split(".");
  const hb = decodeBase64Loose(h);
  const headerText = hb ? printableUtf8(hb) : null;
  const header = headerText ? jsonObject(headerText) : null;
  if (!header) return null;
  const pb = decodeBase64Loose(p);
  const payloadText = pb ? printableUtf8(pb) : null;
  const payload = payloadText ? jsonObject(payloadText) : null;
  return { header, payload, alg: typeof header.alg === "string" ? header.alg : null };
}

/** What the value looks like, decoded locally. Nothing here is a statement about trust. */
export function inspectValue(rawValue: string): { insights: ValueInsight[]; jwt: JwtPeek | null } {
  const insights: ValueInsight[] = [];
  let value = rawValue;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    insights.push({
      kind: "quoted",
      title: "Quoted value",
      detail: "The double quotes are part of the value. Browsers store and send them back exactly as written.",
    });
    value = value.slice(1, -1);
  }
  if (/%[0-9A-Fa-f]{2}/.test(value)) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded !== value) {
        insights.push({
          kind: "percent",
          title: "Percent encoded",
          detail: "Browsers do not decode this. The application that set it decodes it itself.",
          preview: clip(decoded),
        });
        value = decoded;
      }
    } catch {
      // A stray % that is not a valid escape. Leave the value as it is.
    }
  }

  const jwt = peekJwt(value);
  if (jwt) {
    const payloadText = jwt.payload ? JSON.stringify(jwt.payload, null, 2) : "(payload is not a JSON object)";
    insights.push({
      kind: "jwt",
      title: `JWT, alg ${jwt.alg ?? "missing"}`,
      detail: "Header and payload decoded locally. Anyone holding the cookie can read these; only the signature, checked with the key, says whether they are genuine.",
      preview: clip(`${JSON.stringify(jwt.header, null, 2)}\n${payloadText}`),
    });
    return { insights, jwt };
  }
  if (/^eyJ[A-Za-z0-9_-]*(\.[A-Za-z0-9_-]*){4}$/.test(value)) {
    insights.push({
      kind: "jwe",
      title: "Encrypted JWT (JWE)",
      detail: "Five segments starting with eyJ is a JWE. The payload is encrypted and cannot be read without the key.",
    });
    return { insights, jwt: null };
  }

  if (value.length >= 16 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value) && /[a-f]/i.test(value)) {
    insights.push({
      kind: "hex",
      title: "Hex string",
      detail: `${value.length / 2} bytes written as hex, ${value.length * 4} bits if they came from a secure random generator. OWASP asks for at least 64 bits of entropy in a session identifier.`,
    });
    return { insights, jwt: null };
  }

  if (value.length >= 8 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(value) && !/^[0-9]+$/.test(value)) {
    const bytes = decodeBase64Loose(value);
    if (bytes && bytes.length > 0) {
      const text = printableUtf8(bytes);
      const obj = text ? jsonObject(text) : null;
      if (obj) {
        insights.push({
          kind: "base64-json",
          title: "Base64 encoded JSON",
          detail: "Encoding is not encryption. If the application trusts these fields without a signature, a user can edit them.",
          preview: clip(JSON.stringify(obj, null, 2)),
        });
      } else if (text && /[A-Za-z]{3}/.test(text)) {
        insights.push({
          kind: "base64-text",
          title: "Base64 encoded text",
          detail: "Decoded locally. Encoding hides nothing from anyone who has the cookie.",
          preview: clip(text),
        });
      } else if (!text && value.length >= 16 && /[0-9]/.test(value) && /[A-Z]/.test(value) && /[a-z]/.test(value)) {
        insights.push({
          kind: "base64-binary",
          title: "Base64 of binary data",
          detail: `Decodes to ${bytes.length} bytes that are not text: consistent with a random identifier, a MAC, or ciphertext. ${bytes.length * 8} bits if it is random.`,
          preview: hexPreview(bytes),
        });
      }
    }
  }
  return { insights, jwt: null };
}

/* ------------------------------------------------------------- the parser */

export type AttributeKind =
  | "expires" | "max-age" | "domain" | "path" | "secure" | "httponly" | "samesite" | "partitioned" | "unknown";

export interface AttributeRecord {
  /** Attribute name as written, trimmed. */
  name: string;
  value: string;
  hasEquals: boolean;
  kind: AttributeKind;
  /** applied: in force. overridden: a later one of the same kind wins. ignored: the browser drops it. */
  status: "applied" | "overridden" | "ignored";
  note: string;
}

export type SameSite = "Strict" | "Lax" | "None" | "Default";

export type Lifetime =
  | { kind: "session" }
  | { kind: "persistent"; source: "Max-Age" | "Expires"; expiresMs: number; seconds: number; capped: boolean }
  | { kind: "delete"; source: "Max-Age" | "Expires" };

export interface Effective {
  lifetime: Lifetime;
  hostOnly: boolean;
  /** The Domain the cookie is scoped to, or null for the request host. */
  domain: string | null;
  /** The cookie's path, or null when it is the default path of a URL that was not given. */
  path: string | null;
  pathFromAttribute: boolean;
  secure: boolean;
  httpOnly: boolean;
  sameSite: SameSite;
  partitioned: boolean;
}

export interface CookieReport {
  line: number;
  source: string;
  name: string;
  value: string;
  attributes: AttributeRecord[];
  /** Why a browser following RFC 6265bis drops the cookie. Empty when it is stored. */
  rejections: string[];
  findings: Finding[];
  effective: Effective;
  insights: ValueInsight[];
  authLike: boolean;
}

export interface Context {
  nowMs: number;
  url: RequestUrl | null;
}

const KNOWN_ATTRIBUTES: Record<string, AttributeKind> = {
  expires: "expires",
  "max-age": "max-age",
  domain: "domain",
  path: "path",
  secure: "secure",
  httponly: "httponly",
  samesite: "samesite",
  partitioned: "partitioned",
};

const LEGACY_ATTRIBUTES: Record<string, string> = {
  comment: "Comment is from RFC 2109 and RFC 2965, both obsolete. Browsers ignore it.",
  commenturl: "CommentURL is from RFC 2965, which is obsolete. Browsers ignore it.",
  version: "Version is from RFC 2109 and RFC 2965, both obsolete. Browsers ignore it.",
  discard: "Discard is from RFC 2965, which is obsolete. Browsers ignore it.",
  port: "Port is from RFC 2965, which is obsolete. Browsers ignore it.",
  priority: "Priority is a Chrome extension that decides which cookies are evicted first. Other browsers ignore it.",
  sameparty: "SameParty belonged to Chrome's First-Party Sets trial, which ended. Browsers ignore it.",
};

/** RFC 9110 section 5.6.2 tchar. */
const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Section 4.1.1 cookie-octet: printable ASCII minus space, DQUOTE, comma, semicolon and backslash. */
function badValueChars(value: string): string[] {
  const inner = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  const found = new Set<string>();
  for (const ch of inner) {
    const c = ch.codePointAt(0) ?? 0;
    const ok = c === 0x21 || (c >= 0x23 && c <= 0x2b) || (c >= 0x2d && c <= 0x3a) || (c >= 0x3c && c <= 0x5b) || (c >= 0x5d && c <= 0x7e);
    if (!ok) {
      if (ch === " ") found.add("space");
      else if (ch === "\t") found.add("tab");
      else if (ch === ",") found.add("comma");
      else if (ch === '"') found.add("double quote");
      else if (ch === "\\") found.add("backslash");
      else if (c > 0x7e) found.add("non-ASCII");
      else found.add(`U+${c.toString(16).toUpperCase().padStart(4, "0")}`);
    }
  }
  return [...found];
}

export function looksLikeAuthName(name: string): boolean {
  const n = name.replace(/^__(host|secure)-/i, "").toLowerCase();
  if (/csrf|xsrf/.test(n)) return false;
  return (
    /sess|auth|token|jwt|login|remember|refresh|identity|saml|oidc|sso/.test(n) ||
    /(^|[^a-z])sid([^a-z]|$)/.test(n) ||
    /^sid|sid$/.test(n)
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function describeSeconds(seconds: number): string {
  if (seconds < 120) return plural(seconds, "second");
  if (seconds < 7200) return plural(Math.round(seconds / 60), "minute");
  if (seconds < 2 * DAY) return plural(Math.round(seconds / 3600), "hour");
  if (seconds < 90 * DAY) return plural(Math.round(seconds / DAY), "day");
  if (seconds < 730 * DAY) return plural(Math.round(seconds / (30.44 * DAY)), "month");
  return plural(Math.round(seconds / (365.25 * DAY)), "year");
}

/**
 * Analyze one set-cookie-string: section 5.6 parsing, then the storage model
 * of section 5.7 as far as it can be judged from the line and, when given,
 * the URL of the response.
 */
export function analyzeSetCookie(source: string, line: number, ctx: Context): CookieReport {
  const rejections: string[] = [];
  const findings: Finding[] = [];
  const attributes: AttributeRecord[] = [];

  const empty: Effective = {
    lifetime: { kind: "session" },
    hostOnly: true,
    domain: null,
    path: ctx.url ? defaultPath(ctx.url.path) : null,
    pathFromAttribute: false,
    secure: false,
    httpOnly: false,
    sameSite: "Default",
    partitioned: false,
  };

  // Section 5.6 step 1.
  const ctl = findForbiddenControl(source);
  if (ctl) {
    rejections.push(
      `It contains the control character 0x${hex2(ctl.code)} at position ${ctl.index + 1}. Section 5.6 step 1 ignores the whole line.`,
    );
    return { line, source, name: "", value: "", attributes, rejections, findings, effective: empty, insights: [], authLike: false };
  }

  // Steps 2 to 6: the name-value pair.
  const semi = source.indexOf(";");
  const pair = semi === -1 ? source : source.slice(0, semi);
  let unparsed = semi === -1 ? "" : source.slice(semi);
  const eq = pair.indexOf("=");
  const name = trimWsp(eq === -1 ? "" : pair.slice(0, eq));
  const value = trimWsp(eq === -1 ? pair : pair.slice(eq + 1));

  const pairBytes = utf8Length(name) + utf8Length(value);
  if (pairBytes > MAX_NAME_VALUE_BYTES) {
    rejections.push(
      `The name and value together are ${pairBytes.toLocaleString("en-US")} bytes, over the ${MAX_NAME_VALUE_BYTES.toLocaleString("en-US")} byte limit of section 5.6 step 5.`,
    );
  }
  if (name === "" && value === "") {
    rejections.push("Both the name and the value are empty, which section 5.7 step 2 ignores.");
  }

  // The attribute loop.
  while (unparsed !== "") {
    unparsed = unparsed.slice(1);
    const next = unparsed.indexOf(";");
    const av = next === -1 ? unparsed : unparsed.slice(0, next);
    unparsed = next === -1 ? "" : unparsed.slice(next);
    const avEq = av.indexOf("=");
    const attrName = trimWsp(avEq === -1 ? av : av.slice(0, avEq));
    const attrValue = trimWsp(avEq === -1 ? "" : av.slice(avEq + 1));
    if (attrName === "" && attrValue === "") continue; // a stray or trailing semicolon
    const kind = KNOWN_ATTRIBUTES[attrName.toLowerCase()] ?? "unknown";
    const record: AttributeRecord = { name: attrName, value: attrValue, hasEquals: avEq !== -1, kind, status: "applied", note: "" };
    attributes.push(record);
    if (utf8Length(attrValue) > MAX_ATTRIBUTE_VALUE_BYTES) {
      record.status = "ignored";
      record.note = `Value is over ${MAX_ATTRIBUTE_VALUE_BYTES} bytes, so the attribute is dropped.`;
      continue;
    }
    if (kind === "unknown") {
      record.status = "ignored";
      record.note = LEGACY_ATTRIBUTES[attrName.toLowerCase()] ?? "Not an attribute browsers recognize, so it is ignored.";
    }
  }

  /* ---- section 5.6.1 to 5.6.7, then 5.7 picks the last of each */
  let lastMaxAge: { rec: AttributeRecord; parsed: Extract<MaxAge, { ok: true }> } | null = null;
  let lastExpires: { rec: AttributeRecord; ms: number } | null = null;
  let lastDomain: { rec: AttributeRecord; domain: string } | null = null;
  let lastPath: { rec: AttributeRecord; path: string | null } | null = null;
  let lastSameSite: { rec: AttributeRecord; mode: SameSite } | null = null;
  let secure = false;
  let httpOnly = false;
  let partitioned = false;
  const counts: Record<string, number> = {};

  for (const rec of attributes) {
    if (rec.status === "ignored") continue;
    counts[rec.kind] = (counts[rec.kind] ?? 0) + 1;
    switch (rec.kind) {
      case "expires": {
        const parsed = parseCookieDate(rec.value);
        if (!parsed.ok) {
          rec.status = "ignored";
          rec.note = `Not a date a browser can read (${parsed.reason}), so it is ignored.`;
          findings.push({
            tone: "warn",
            text: `Expires=${rec.value || "(empty)"} does not parse as a cookie date: ${parsed.reason}. Browsers ignore the attribute, so it sets no lifetime.`,
          });
          counts.expires -= 1;
          break;
        }
        if (lastExpires) {
          lastExpires.rec.status = "overridden";
          lastExpires.rec.note = "A later Expires replaces this one.";
        }
        lastExpires = { rec, ms: parsed.ms };
        rec.note = `${toImfFixdate(parsed.ms)}.`;
        if (!isImfFixdate(rec.value)) {
          findings.push({
            tone: "info",
            text: `Expires is not in the IMF-fixdate form servers are meant to send (RFC 9110 section 5.6.7). Browsers read it as ${toImfFixdate(parsed.ms)}, but other parsers may not. Write it as "${toImfFixdate(parsed.ms)}".`,
          });
        } else {
          const stated = rec.value.slice(0, 3);
          const actual = DAY_NAMES[new Date(parsed.ms).getUTCDay()];
          if (stated !== actual) {
            findings.push({
              tone: "info",
              text: `Expires names the day as ${stated}, but that date was a ${actual}. Browsers ignore the day name, so this is cosmetic, but it suggests the date was built by hand.`,
            });
          }
        }
        break;
      }
      case "max-age": {
        const parsed = parseMaxAge(rec.value);
        if (!parsed.ok) {
          rec.status = "ignored";
          rec.note = `Not a valid Max-Age (${parsed.reason}), so it is ignored.`;
          findings.push({
            tone: "warn",
            text: `Max-Age=${rec.value || "(empty)"} is ignored because ${parsed.reason}. Section 5.6.2 takes only an optional minus sign and digits: no units, no plus sign, no decimals.`,
          });
          counts["max-age"] -= 1;
          break;
        }
        if (lastMaxAge) {
          lastMaxAge.rec.status = "overridden";
          lastMaxAge.rec.note = "A later Max-Age replaces this one.";
        }
        lastMaxAge = { rec, parsed };
        rec.note =
          parsed.seconds <= 0
            ? "Zero or negative: the cookie expires immediately."
            : `${describeSeconds(parsed.seconds)}${parsed.capped ? ", after the 400 day cap" : ""}.`;
        break;
      }
      case "domain": {
        // Section 5.6.3: drop one leading dot, then lower case.
        let domain = rec.value.startsWith(".") ? rec.value.slice(1) : rec.value;
        domain = domain.toLowerCase();
        if (lastDomain) {
          lastDomain.rec.status = "overridden";
          lastDomain.rec.note = "A later Domain replaces this one.";
        }
        lastDomain = { rec, domain };
        rec.note = domain === "" ? "Empty, which leaves the cookie host-only." : `Sent to ${domain} and every subdomain of it.`;
        if (rec.value.startsWith(".") && domain !== "") {
          findings.push({
            tone: "info",
            text: `The leading dot in Domain=${rec.value} is dropped (section 5.6.3). Domain=${domain} means the same thing: the dot has not changed the scope since RFC 6265.`,
          });
        }
        break;
      }
      case "path": {
        const usesDefault = rec.value === "" || rec.value[0] !== "/";
        if (lastPath) {
          lastPath.rec.status = "overridden";
          lastPath.rec.note = "A later Path replaces this one.";
        }
        lastPath = { rec, path: usesDefault ? (ctx.url ? defaultPath(ctx.url.path) : null) : rec.value };
        rec.note = usesDefault
          ? `Does not start with /, so the default path of the request URL is used${ctx.url ? ` (${defaultPath(ctx.url.path)})` : ""}.`
          : `Sent on requests to ${rec.value} and below it.`;
        break;
      }
      case "secure":
      case "httponly":
      case "partitioned": {
        if (rec.kind === "secure") secure = true;
        if (rec.kind === "httponly") httpOnly = true;
        if (rec.kind === "partitioned") partitioned = true;
        const label = rec.kind === "secure" ? "Secure" : rec.kind === "httponly" ? "HttpOnly" : "Partitioned";
        if (rec.hasEquals) {
          rec.note = `The value is ignored: ${label} is set by its name alone.`;
          findings.push({
            tone: "warn",
            text: `${rec.name}=${rec.value} still turns ${label} on. The attribute is a flag and its value is never read, so ${label}=false means the same as ${label}.`,
          });
        } else {
          rec.note =
            rec.kind === "secure"
              ? "Sent only over https."
              : rec.kind === "httponly"
                ? "Hidden from document.cookie."
                : "Stored separately for each top-level site (CHIPS).";
        }
        if (counts[rec.kind] > 1) {
          rec.status = "overridden";
          rec.note = `${label} appears more than once. Harmless, but redundant.`;
        }
        break;
      }
      case "samesite": {
        const v = rec.value.toLowerCase();
        const mode: SameSite = v === "none" ? "None" : v === "strict" ? "Strict" : v === "lax" ? "Lax" : "Default";
        if (lastSameSite) {
          lastSameSite.rec.status = "overridden";
          lastSameSite.rec.note = "A later SameSite replaces this one.";
        }
        lastSameSite = { rec, mode };
        if (mode === "Default") {
          rec.note = "Not Strict, Lax or None, so it counts as if SameSite were absent.";
          findings.push({
            tone: "warn",
            text: `SameSite=${rec.value || "(empty)"} is not one of Strict, Lax or None, so section 5.6.7 treats it as if no SameSite were given at all.`,
          });
        } else {
          rec.note =
            mode === "Strict"
              ? "Never sent on cross-site requests, not even top-level links."
              : mode === "Lax"
                ? "Sent cross-site only on top-level navigations with a safe method such as GET."
                : "Sent on every request, cross-site included. Requires Secure.";
        }
        break;
      }
      default:
        break;
    }
  }

  for (const kind of ["expires", "max-age", "domain", "path", "samesite"] as const) {
    if ((counts[kind] ?? 0) > 1) {
      const label = { expires: "Expires", "max-age": "Max-Age", domain: "Domain", path: "Path", samesite: "SameSite" }[kind];
      findings.push({
        tone: "warn",
        text: `${label} appears ${counts[kind]} times. Section 5.7 uses the last one, but other parsers (frameworks, proxies, WAFs) may take the first, so the two can disagree about this cookie's scope.`,
      });
    }
  }

  /* ---- section 5.7: lifetime */
  let lifetime: Lifetime = { kind: "session" };
  if (lastMaxAge) {
    const s = lastMaxAge.parsed.seconds;
    lifetime = s <= 0 ? { kind: "delete", source: "Max-Age" } : { kind: "persistent", source: "Max-Age", expiresMs: ctx.nowMs + s * 1000, seconds: s, capped: lastMaxAge.parsed.capped };
    if (lastExpires) {
      lastExpires.rec.status = "overridden";
      lastExpires.rec.note = "Max-Age is also present and takes precedence.";
      findings.push({
        tone: "info",
        text: "Both Max-Age and Expires are present. Max-Age wins (section 5.7 step 6); Expires only matters to clients too old to understand Max-Age.",
      });
    }
  } else if (lastExpires) {
    const seconds = Math.floor((lastExpires.ms - ctx.nowMs) / 1000);
    if (lastExpires.ms <= ctx.nowMs) lifetime = { kind: "delete", source: "Expires" };
    else {
      const capped = seconds > AGE_LIMIT_SECONDS;
      const kept = capped ? AGE_LIMIT_SECONDS : seconds;
      lifetime = { kind: "persistent", source: "Expires", expiresMs: capped ? ctx.nowMs + AGE_LIMIT_SECONDS * 1000 : lastExpires.ms, seconds: kept, capped };
    }
  }

  /* ---- section 5.7 steps 7 to 10: domain */
  const domainAttr = lastDomain ? lastDomain.domain : "";
  let hostOnly = true;
  let effectiveDomain: string | null = null;
  if (domainAttr !== "") {
    hostOnly = false;
    effectiveDomain = domainAttr;
    if (/[^\x01-\x7f]/.test(domainAttr)) {
      rejections.push(
        `Domain=${domainAttr} contains a non-ASCII character, which section 5.7 step 8 rejects. Write the punycode form (xn--...).`,
      );
    } else if (isPublicSuffix(domainAttr)) {
      if (!ctx.url && !domainAttr.includes(".")) {
        findings.push({
          tone: "warn",
          text: `Domain=${domainAttr} is a single label, which browsers treat like a top-level domain. It is refused unless the response came from exactly ${domainAttr}, in which case the cookie is stored as host-only (section 5.7 step 9).`,
        });
      } else if (ctx.url && ctx.url.host === domainAttr) {
        hostOnly = true;
        effectiveDomain = null;
        findings.push({
          tone: "info",
          text: `${domainAttr} is a public suffix and also the response host, so section 5.7 step 9 drops the Domain and stores a host-only cookie.`,
        });
      } else {
        rejections.push(
          `Domain=${domainAttr} is a public suffix. Browsers refuse it (section 5.7 step 9), because it would share the cookie with every site registered under ${domainAttr}. The one exception is a response from ${domainAttr} itself, which gets a host-only cookie.`,
        );
      }
    } else if (ctx.url && !domainMatch(ctx.url.host, domainAttr)) {
      rejections.push(
        ctx.url.isIp
          ? `The response came from the IP address ${ctx.url.host}, and an IP address only domain-matches a Domain identical to it. Domain=${domainAttr} is refused (section 5.7 step 10).`
          : `The response came from ${ctx.url.host}, which is not ${domainAttr} or a subdomain of it, so the cookie is refused (section 5.7 step 10). A site can only set cookies for itself and its parent domains.`,
      );
    }
  }

  /* ---- steps 11 to 13: path, Secure, secure origin */
  const pathFromAttribute = lastPath !== null;
  const path = lastPath ? lastPath.path : ctx.url ? defaultPath(ctx.url.path) : null;
  if (secure && ctx.url && !ctx.url.secure) {
    rejections.push(
      `The response came over plain http (${ctx.url.host}), and section 5.7 step 13 ignores a Secure cookie from a non-secure origin.`,
    );
  }

  const sameSite: SameSite = lastSameSite ? lastSameSite.mode : "Default";

  /* ---- step 19: SameSite=None requires Secure */
  if (sameSite === "None" && !secure) {
    rejections.push("SameSite=None without Secure is refused (section 5.7 step 19). Add Secure.");
  }

  /* ---- steps 20 and 21: prefixes, matched case-insensitively (section 5.4) */
  const lower = name.toLowerCase();
  if (lower.startsWith("__secure-")) {
    if (!secure) rejections.push(`A name starting with ${name.slice(0, 9)} requires Secure (section 5.7 step 20), and it is missing.`);
    if (!name.startsWith("__Secure-")) {
      findings.push({
        tone: "info",
        text: `The prefix is spelled ${name.slice(0, 9)}. Section 5.4 makes browsers match it case-insensitively, so the __Secure- rules apply anyway. Older browsers matched case-sensitively and would treat this as an ordinary name.`,
      });
    }
  }
  if (lower.startsWith("__host-")) {
    const prefix = name.slice(0, 7);
    if (!secure) rejections.push(`${prefix} requires Secure, and it is missing (section 5.7 step 21).`);
    if (!hostOnly) {
      rejections.push(
        `${prefix} requires a host-only cookie, so there must be no Domain attribute, not even one naming this exact host (section 5.7 step 21).`,
      );
    }
    if (!pathFromAttribute) {
      rejections.push(`${prefix} requires an explicit Path=/ attribute, and there is none (section 5.7 step 21).`);
    } else if (path === null) {
      findings.push({
        tone: "warn",
        text: `Path=${lastPath?.rec.value || "(empty)"} does not start with /, so the path falls back to the default path of the request URL. ${prefix} is accepted only if that works out to /. Write Path=/ explicitly.`,
      });
    } else if (path !== "/") {
      rejections.push(`${prefix} requires the path to be exactly /, and it is ${path} (section 5.7 step 21).`);
    }
    if (!name.startsWith("__Host-")) {
      findings.push({
        tone: "info",
        text: `The prefix is spelled ${prefix}. Section 5.4 makes browsers match it case-insensitively, so the __Host- rules apply anyway.`,
      });
    }
  }

  /* ---- step 22: a nameless cookie must not look prefixed */
  if (name === "" && value !== "") {
    const lv = value.toLowerCase();
    if (lv.startsWith("__secure-") || lv.startsWith("__host-")) {
      rejections.push(
        "The cookie has no name and its value begins with a prefix, which section 5.7 step 22 refuses: some servers would read it back as a prefixed name.",
      );
    } else {
      findings.push({
        tone: "warn",
        text: eq === -1
          ? "There is no = sign, so this is a nameless cookie whose value is the whole pair. Section 4.1.1 forbids servers from sending nameless cookies, because browsers serialize them unpredictably."
          : "The name is empty. Section 4.1.1 forbids servers from sending nameless cookies, because browsers serialize them unpredictably.",
      });
    }
  }

  /* ---- CHIPS: Partitioned requires Secure */
  if (partitioned && !secure) {
    rejections.push("Partitioned without Secure is refused. The CHIPS draft makes Secure mandatory for partitioned cookies.");
  }

  /* ---- syntax a server should not send, even where browsers cope */
  if (name !== "" && !TOKEN_RE.test(name)) {
    findings.push({
      tone: "warn",
      text: `The name "${name}" is not an HTTP token (RFC 9110 section 5.6.2), which section 4.1.1 requires. Browsers accept it, but servers, proxies and frameworks may parse it differently.`,
    });
  }
  const bad = badValueChars(value);
  if (bad.length) {
    findings.push({
      tone: "warn",
      text: `The value contains ${bad.join(", ")}, outside the cookie-octet set of section 4.1.1. Browsers keep it, but servers split and unescape such values inconsistently. Encode the value (Base64url or percent encoding) before setting it.`,
    });
  }

  /* ---- judgment calls */
  const { insights, jwt } = inspectValue(value);
  const authLike = looksLikeAuthName(name) || jwt !== null;

  if (jwt && jwt.alg !== null && jwt.alg.toLowerCase() === "none") {
    findings.push({
      tone: "danger",
      text: "The value is a JWT with alg none: it carries no signature at all. If the server accepts it, anyone can write their own.",
    });
  }
  if (jwt && !httpOnly) {
    findings.push({
      tone: "danger",
      text: "A bearer token in a cookie without HttpOnly can be read by any script on the page, so one XSS bug hands it to an attacker, who can then replay it from anywhere.",
    });
  } else if (authLike && !httpOnly) {
    findings.push({
      tone: "danger",
      text: "This looks like a session or sign-in cookie, but HttpOnly is missing. Any script on the page, including script injected through an XSS bug, can read it from document.cookie.",
    });
  }
  if (authLike && !secure) {
    findings.push({
      tone: "danger",
      text: "This looks like a session or sign-in cookie, but Secure is missing, so the browser will also send it over plain http, where anyone on the network path can read it.",
    });
  } else if (!secure) {
    findings.push({
      tone: "info",
      text: "No Secure attribute: the cookie is also sent over plain http. A network attacker can read it there, and can also overwrite it from an http response.",
    });
  }

  if (!hostOnly && effectiveDomain && isIpAddress(effectiveDomain)) {
    findings.push({
      tone: "info",
      text: `Domain=${effectiveDomain} is an IP address, which domain-matches only that exact address, so no other host receives the cookie.`,
    });
  } else if (!hostOnly && effectiveDomain && !(isPublicSuffix(effectiveDomain) && !effectiveDomain.includes("."))) {
    const reg = registrableDomain(effectiveDomain);
    if (ctx.url && ctx.url.host === effectiveDomain) {
      findings.push({
        tone: "warn",
        text: `Domain=${effectiveDomain} names the response host itself, but that still makes it a domain cookie: every subdomain of ${effectiveDomain} receives it too. Omit Domain entirely to keep it on this host alone.`,
      });
    } else if (reg && reg === effectiveDomain) {
      findings.push({
        tone: authLike ? "danger" : "warn",
        text: `Domain=${effectiveDomain} is the whole registrable domain, so every host under it receives the cookie: marketing sites, staging boxes, and any subdomain left pointing at a deleted cloud resource that someone else can claim. Each of those can read it, and can set a cookie of the same name to shadow it.`,
      });
    } else {
      findings.push({
        tone: "info",
        text: `Domain=${effectiveDomain} shares the cookie with every subdomain of ${effectiveDomain}. Without Domain it would stay on the one host that set it.`,
      });
    }
  }

  if (lifetime.kind === "delete") {
    findings.push({
      tone: "info",
      text: `This deletes the cookie: ${lifetime.source === "Max-Age" ? "Max-Age is zero or negative" : "Expires is in the past"}, so the browser drops any stored cookie with the same name, Domain and Path. If Domain or Path differ from the ones used to set it, the original survives.`,
    });
  } else if (lifetime.kind === "persistent") {
    if (lifetime.capped) {
      findings.push({
        tone: "info",
        text: `The requested lifetime is over 400 days. Section 5.5 caps it at 400 days (34,560,000 seconds), so the cookie expires ${toImfFixdate(lifetime.expiresMs)} at the latest, in browsers that implement the cap.`,
      });
    }
    if (authLike && lifetime.seconds > 30 * DAY) {
      findings.push({
        tone: "warn",
        text: `A session or sign-in cookie that lives ${describeSeconds(lifetime.seconds)} keeps a stolen copy useful for just as long. Keep the cookie short and renew it, or tie it to a server-side session you can revoke.`,
      });
    }
  }

  if (!lastSameSite) {
    findings.push({
      tone: "info",
      text: "No SameSite attribute. Chromium-based browsers treat the cookie as Lax, and RFC 6265bis section 5.6.7.2 lets a browser still send a recently set cookie of this kind on cross-site top-level POST requests. Other browsers may send it on every cross-site request. Set it explicitly.",
    });
  } else if (sameSite === "None" && secure) {
    findings.push({
      tone: authLike ? "warn" : "info",
      text: "SameSite=None sends the cookie on cross-site requests, including form posts from other sites. That is what embedded widgets need, and it means CSRF protection has to come from somewhere else, such as an anti-forgery token. Browsers that block third-party cookies may drop it in a cross-site context anyway.",
    });
  }

  if (pathFromAttribute && path !== null && path !== "/") {
    findings.push({
      tone: "info",
      text: `Path=${path} narrows where the cookie is sent, but it is not a security boundary: any page on the same origin can still read it, for example by loading a ${path} URL in a frame (section 8.5).`,
    });
  }

  if (secure && httpOnly && (sameSite === "Lax" || sameSite === "Strict") && rejections.length === 0 && authLike) {
    findings.push({ tone: "ok", text: "Secure, HttpOnly and SameSite are all set, which is the baseline for a session cookie." });
  }
  if (partitioned && secure) {
    findings.push({
      tone: "info",
      text: "Partitioned (CHIPS) stores a separate copy of this cookie for each top-level site that embeds it, so it cannot be used to follow a user from one site to another.",
    });
  }

  return {
    line,
    source,
    name,
    value,
    attributes,
    rejections,
    findings,
    effective: {
      lifetime,
      hostOnly,
      domain: effectiveDomain,
      path,
      pathFromAttribute,
      secure,
      httpOnly,
      sameSite,
      partitioned,
    },
    insights,
    authLike,
  };
}

/* ------------------------------------------------------------- the paste */

export interface Skipped {
  line: number;
  text: string;
  reason: string;
}

export interface Analysis {
  reports: CookieReport[];
  skipped: Skipped[];
  notes: Finding[];
  error: string | null;
}

const HEADER_RE = /^(?:<\s*)?set-cookie\s*:\s*/i;
const OTHER_HEADER_RE = /^(?:<\s*)?[A-Za-z][A-Za-z0-9-]*\s*:\s*/;

/**
 * Split a paste into set-cookie-strings. Accepts bare values, "Set-Cookie:"
 * header lines, and curl -v output. When any line carries the header name,
 * lines without it are treated as other headers and skipped.
 */
export function analyzePaste(input: string, ctx: Context): Analysis {
  const notes: Finding[] = [];
  if (input.length > MAX_INPUT_CHARS) {
    return {
      reports: [],
      skipped: [],
      notes,
      error: `The paste is ${input.length.toLocaleString("en-US")} characters. This tool reads up to ${MAX_INPUT_CHARS.toLocaleString("en-US")}.`,
    };
  }
  const lines = input.split(/\r\n|\n|\r/);
  const anyHeader = lines.some((l) => HEADER_RE.test(l.trim()));
  const reports: CookieReport[] = [];
  const skipped: Skipped[] = [];
  let over = 0;

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    // Only SP and HTAB are trimmed, so a control character at either end is
    // still seen by the section 5.6 step 1 check.
    const text = trimWsp(rawLine);
    if (text === "") return;
    if (/^(?:<\s*)?set-cookie2\s*:/i.test(text)) {
      skipped.push({ line: lineNo, text, reason: "Set-Cookie2 is from RFC 2965, which is obsolete. Browsers ignore the header." });
      return;
    }
    if (/^(?:>\s*)?cookie\s*:/i.test(text)) {
      skipped.push({
        line: lineNo,
        text,
        reason: "This is a Cookie request header. It carries only names and values; the attributes live in the Set-Cookie response headers.",
      });
      return;
    }
    let body = text;
    if (HEADER_RE.test(text)) body = trimWsp(text.replace(HEADER_RE, ""));
    else if (anyHeader) {
      if (OTHER_HEADER_RE.test(text) || /^(?:<\s*)?HTTP\//i.test(text)) {
        skipped.push({ line: lineNo, text, reason: "Not a Set-Cookie header." });
        return;
      }
    }
    if (body === "") {
      skipped.push({ line: lineNo, text, reason: "The header is empty." });
      return;
    }
    if (reports.length >= MAX_COOKIES) {
      over += 1;
      return;
    }
    reports.push(analyzeSetCookie(body, lineNo, ctx));
  });

  if (over > 0) {
    notes.push({
      tone: "warn",
      text: `Only the first ${MAX_COOKIES} cookies are analyzed. ${plural(over, "more line")} ${over === 1 ? "was" : "were"} left out.`,
    });
  }

  // The same name twice in one response: the later line can replace the earlier.
  const seen = new Map<string, number>();
  for (const r of reports) {
    if (r.rejections.length) continue;
    const key = `${r.name}\u0000${r.effective.domain ?? ""}\u0000${r.effective.path ?? ""}`;
    const prior = seen.get(key);
    if (prior !== undefined) {
      notes.push({
        tone: "warn",
        text: `Line ${r.line} sets ${r.name || "a nameless cookie"} again with the same Domain and Path as line ${prior}. The later one replaces the earlier (section 5.7 step 23), so only line ${r.line} survives.`,
      });
    }
    seen.set(key, r.line);
  }

  return { reports, skipped, notes, error: null };
}
