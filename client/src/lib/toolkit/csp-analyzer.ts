/**
 * Content-Security-Policy parsing and analysis.
 *
 * Written against Content Security Policy Level 3 (W3C Working Draft, the
 * editor's draft at w3c.github.io/webappsec-csp) and, where older browsers
 * behave differently, CSP Level 2 (W3C Recommendation, 2016). Algorithm
 * names in the comments are the CSP3 ones, quoted, so they can be searched
 * for in the specification.
 *
 * Pure functions only: no React, no DOM. The page, the security headers
 * analyzer and the unit tests all import from here, so the verdict a reader
 * sees is the verdict the tests check.
 */

/* ------------------------------------------------------------ severities */

export type Severity = "high" | "medium" | "low" | "info" | "pass";

export const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
  pass: 4,
};

export interface Finding {
  /** Stable key, unique within one analysis. */
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  directive?: string;
}

export function sortFindings<T extends { severity: Severity }>(findings: T[]): T[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity] || a.i - b.i)
    .map(({ f }) => f);
}

export function countBySeverity(findings: { severity: Severity }[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0, pass: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/* ---------------------------------------------------------------- limits */

/** Longest input read, in characters. A real policy is a few kilobytes. */
export const MAX_INPUT_CHARS = 100_000;
/** Policies read from one paste. Anything past this is reported and skipped. */
export const MAX_POLICIES = 16;
/** Directives read per policy. */
export const MAX_DIRECTIVES = 200;
/** Example tokens quoted inside one finding before "and N more". */
export const MAX_QUOTED = 6;

/* ----------------------------------------------------------- whitespace */

// CSP3 uses the Infra definition of ASCII whitespace: TAB, LF, FF, CR, SPACE.
const ASCII_WS_RUN = /[\t\n\f\r ]+/;
const NON_ASCII = /[^\x00-\x7f]/;

function stripAsciiWs(s: string): string {
  return s.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
}

/** ASCII lowercase only, as the specification asks. Never locale-aware. */
export function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

function quoteList(items: string[], max = MAX_QUOTED): string {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

/* ------------------------------------------------------------ directives */

export type DirectiveKind = "fetch" | "document" | "navigation" | "reporting" | "other";

export const DIRECTIVES: Record<string, { kind: DirectiveKind; summary: string }> = {
  "default-src": { kind: "fetch", summary: "Fallback for every fetch directive the policy does not name." },
  "script-src": {
    kind: "fetch",
    summary: "Scripts, inline handlers and eval. Fallback for script-src-elem, script-src-attr and worker-src.",
  },
  "script-src-elem": { kind: "fetch", summary: "Script elements and javascript: URLs." },
  "script-src-attr": { kind: "fetch", summary: "Inline event handler attributes." },
  "style-src": { kind: "fetch", summary: "Stylesheets and inline styles. Fallback for style-src-elem and style-src-attr." },
  "style-src-elem": { kind: "fetch", summary: "Style elements and linked stylesheets." },
  "style-src-attr": { kind: "fetch", summary: "Inline style attributes." },
  "img-src": { kind: "fetch", summary: "Images and favicons." },
  "font-src": { kind: "fetch", summary: "Web fonts." },
  "connect-src": { kind: "fetch", summary: "fetch, XMLHttpRequest, WebSocket, EventSource and beacons." },
  "media-src": { kind: "fetch", summary: "Audio, video and text tracks." },
  "object-src": { kind: "fetch", summary: "Plugin content in object and embed." },
  "frame-src": { kind: "fetch", summary: "Frames this page loads." },
  "child-src": { kind: "fetch", summary: "Fallback for frame-src and worker-src." },
  "worker-src": { kind: "fetch", summary: "Dedicated, shared and service workers." },
  "manifest-src": { kind: "fetch", summary: "Web app manifests." },
  "fenced-frame-src": { kind: "fetch", summary: "Fenced frames." },
  "base-uri": { kind: "document", summary: "Allowed values for a base element. No fallback." },
  sandbox: { kind: "document", summary: "Applies iframe sandbox restrictions to this document." },
  "form-action": { kind: "navigation", summary: "Where forms may submit. No fallback." },
  "frame-ancestors": { kind: "navigation", summary: "Who may embed this page in a frame. No fallback." },
  "report-uri": { kind: "reporting", summary: "Deprecated report destination URL." },
  "report-to": { kind: "reporting", summary: "Reporting API endpoint name." },
  "upgrade-insecure-requests": { kind: "other", summary: "Rewrites http: subresource URLs to https:." },
  "require-trusted-types-for": { kind: "other", summary: "Enforces Trusted Types at DOM XSS sinks." },
  "trusted-types": { kind: "other", summary: "Names the Trusted Types policies a page may create." },
  webrtc: { kind: "other", summary: "Allows or blocks WebRTC connections." },
};

/** Directives that were removed, renamed or never shipped. */
export const OBSOLETE: Record<string, { severity: Severity; detail: string }> = {
  "block-all-mixed-content": {
    severity: "info",
    detail:
      "Obsolete. The current Mixed Content specification no longer defines it, and browsers already block active mixed content and upgrade or block the rest by default. upgrade-insecure-requests is the directive still worth sending.",
  },
  "plugin-types": {
    severity: "low",
    detail:
      "Removed from the specification and from browsers. It limited plugin MIME types, which stopped mattering when browsers dropped plugins. object-src 'none' is the replacement.",
  },
  referrer: {
    severity: "low",
    detail: "Removed. Browsers ignore it; the Referrer-Policy header does this job now.",
  },
  "reflected-xss": {
    severity: "low",
    detail: "Removed. It controlled the browser XSS filter, which browsers have since deleted.",
  },
  "prefetch-src": {
    severity: "info",
    detail: "Removed from the specification. Current browsers ignore it.",
  },
  "navigate-to": {
    severity: "info",
    detail: "Removed from the specification and never shipped in a stable browser, so it restricts nothing.",
  },
  "require-sri-for": {
    severity: "info",
    detail: "Never standardized, and current browsers ignore it. Add integrity attributes to the tags themselves instead.",
  },
  "disown-opener": {
    severity: "info",
    detail: "Proposed and dropped. Browsers ignore it; Cross-Origin-Opener-Policy covers what it was for.",
  },
};

/** Directives whose value is a source list, and therefore gets source checks. */
const SOURCE_LIST_DIRECTIVES = new Set([
  ...Object.keys(DIRECTIVES).filter((name) => DIRECTIVES[name].kind === "fetch"),
  "base-uri",
  "form-action",
  "frame-ancestors",
]);

/**
 * CSP3 "Get fetch directive fallback list". Each effective directive is
 * looked up in this order, and the first one present in the policy governs.
 * fenced-frame-src comes from the Fenced Frame specification.
 */
export const FALLBACKS: Record<string, string[]> = {
  "script-src-elem": ["script-src-elem", "script-src", "default-src"],
  "script-src-attr": ["script-src-attr", "script-src", "default-src"],
  "style-src-elem": ["style-src-elem", "style-src", "default-src"],
  "style-src-attr": ["style-src-attr", "style-src", "default-src"],
  "worker-src": ["worker-src", "child-src", "script-src", "default-src"],
  "connect-src": ["connect-src", "default-src"],
  "manifest-src": ["manifest-src", "default-src"],
  "object-src": ["object-src", "default-src"],
  "frame-src": ["frame-src", "child-src", "default-src"],
  "fenced-frame-src": ["fenced-frame-src", "frame-src", "child-src", "default-src"],
  "media-src": ["media-src", "default-src"],
  "font-src": ["font-src", "default-src"],
  "img-src": ["img-src", "default-src"],
};

/* ------------------------------------------------------- source parsing */

export type SourceKind = "none" | "keyword" | "nonce" | "hash" | "wildcard" | "scheme" | "host" | "invalid";

export interface SourceInfo {
  token: string;
  kind: SourceKind;
  /** Lowercased keyword without its quotes, for kind "keyword". */
  keyword?: string;
  /** Lowercased scheme for a scheme-source, or the scheme-part of a host-source. */
  scheme?: string;
  /** Lowercased host-part, without a trailing dot. */
  host?: string;
  port?: string;
  path?: string;
  hashAlg?: "sha256" | "sha384" | "sha512";
  /** The base64 value of a nonce or hash. */
  value?: string;
  /** Why the token is invalid. */
  problem?: string;
  /** A keyword written without its quotes, which parses as a host name. */
  unquoted?: string;
}

/** CSP3 keyword-source values, plus 'inline-speculation-rules' from the speculation rules work. */
export const KEYWORDS = new Set([
  "self",
  "unsafe-inline",
  "unsafe-eval",
  "strict-dynamic",
  "unsafe-hashes",
  "report-sample",
  "unsafe-allow-redirects",
  "wasm-unsafe-eval",
  "inline-speculation-rules",
]);

// CSP3: base64-value = 1*( ALPHA / DIGIT / "+" / "/" / "-" / "_" )*2( "=" )
const BASE64_VALUE = /^[A-Za-z0-9+/\-_]+={0,2}$/;
const SCHEME_NAME = /^[A-Za-z][A-Za-z0-9+.\-]*$/;
// CSP3: host-source = [ scheme-part "://" ] host-part [ ":" port-part ] [ path-part ]
// host-part = "*" / [ "*." ] 1*host-char *( "." 1*host-char ) [ "." ], host-char = ALPHA / DIGIT / "-"
const HOST_SOURCE =
  /^(?:([A-Za-z][A-Za-z0-9+.\-]*):\/\/)?(\*|(?:\*\.)?[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.?)(?::(\d+|\*))?(\/[^\s;,]*)?$/;

/** Digest length in bytes for each CSP hash algorithm. */
export const HASH_BYTES: Record<"sha256" | "sha384" | "sha512", number> = {
  sha256: 32,
  sha384: 48,
  sha512: 64,
};

/**
 * Bytes a base64 or base64url value decodes to, or null when the length or
 * padding is impossible. Used to check that a hash is the right size and a
 * nonce is long enough.
 */
export function base64DecodedLength(value: string): number | null {
  const stripped = value.replace(/=+$/, "");
  const pad = value.length - stripped.length;
  if (stripped.length === 0 || stripped.length % 4 === 1) return null;
  if (pad > 0 && (stripped.length + pad) % 4 !== 0) return null;
  return Math.floor((stripped.length * 6) / 8);
}

export function classifySource(token: string): SourceInfo {
  const lower = asciiLower(token);
  if (lower === "'none'") return { token, kind: "none" };
  if (token === "*") return { token, kind: "wildcard", host: "*" };

  if (token.length >= 2 && token.startsWith("'") && token.endsWith("'")) {
    const inner = token.slice(1, -1);
    const innerLower = lower.slice(1, -1);
    if (KEYWORDS.has(innerLower)) return { token, kind: "keyword", keyword: innerLower };

    // The "'nonce-" and hash prefixes are case-insensitive; the value is not.
    if (innerLower.startsWith("nonce-")) {
      const value = inner.slice(6);
      if (value === "") return { token, kind: "invalid", problem: "a nonce with no value" };
      if (!BASE64_VALUE.test(value)) {
        return {
          token,
          kind: "invalid",
          problem: /[{}<>$%]/.test(value)
            ? "a template placeholder, not a nonce (braces and similar characters are outside base64)"
            : "a nonce with characters outside the base64 alphabet",
        };
      }
      return { token, kind: "nonce", value };
    }

    const hashMatch = /^(sha256|sha384|sha512)-/.exec(innerLower);
    if (hashMatch) {
      const alg = hashMatch[1] as "sha256" | "sha384" | "sha512";
      const value = inner.slice(alg.length + 1);
      if (!BASE64_VALUE.test(value)) {
        return { token, kind: "invalid", problem: "a hash whose value is not base64" };
      }
      return { token, kind: "hash", hashAlg: alg, value };
    }
    if (/^(sha-?1|md5|sha-?224|sha-256|sha-384|sha-512)-/.test(innerLower)) {
      return {
        token,
        kind: "invalid",
        problem: "an unsupported hash prefix: CSP accepts sha256, sha384 and sha512, written without a hyphen inside the name",
      };
    }
    if (innerLower === "*") return { token, kind: "invalid", problem: "a quoted wildcard; * is never quoted" };
    if (innerLower === "nonce") return { token, kind: "invalid", problem: "the word nonce with no value" };
    const near = closest(innerLower, [...KEYWORDS]);
    return {
      token,
      kind: "invalid",
      problem: near ? `not a CSP keyword (did you mean '${near}'?)` : "not a CSP keyword this tool recognizes",
    };
  }

  if (token.startsWith('"') || token.endsWith('"')) {
    return { token, kind: "invalid", problem: "double quotes; CSP keywords use single quotes" };
  }
  if (token.startsWith("'") || token.endsWith("'")) {
    return { token, kind: "invalid", problem: "an unbalanced single quote" };
  }

  if (token.endsWith(":") && SCHEME_NAME.test(token.slice(0, -1))) {
    return { token, kind: "scheme", scheme: lower.slice(0, -1) };
  }

  const m = HOST_SOURCE.exec(token);
  if (m) {
    const host = asciiLower(m[2]).replace(/\.$/, "");
    const info: SourceInfo = {
      token,
      kind: "host",
      scheme: m[1] ? asciiLower(m[1]) : undefined,
      host,
      port: m[3],
      path: m[4],
    };
    if (!m[1] && !m[3] && !m[4] && (KEYWORDS.has(lower) || lower === "none")) info.unquoted = lower;
    return info;
  }

  if (/^(nonce|sha256|sha384|sha512)-/i.test(token)) {
    return { token, kind: "invalid", problem: "a nonce or hash without its single quotes" };
  }
  return { token, kind: "invalid", problem: "not a valid source expression" };
}

/* ------------------------------------------------------------ distance */

/** Levenshtein distance, capped: inputs are short directive and keyword names. */
export function editDistance(a: string, b: string): number {
  if (a.length > 64 || b.length > 64) return Math.abs(a.length - b.length) + 64;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

function closest(word: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDistance = 3;
  for (const c of candidates) {
    const d = editDistance(word, c);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

/* ------------------------------------------------------- policy parsing */

export interface Directive {
  /** ASCII-lowercased name. */
  name: string;
  /** The name exactly as written. */
  rawName: string;
  tokens: string[];
}

export interface ParsedPolicy {
  /** Directives kept, in the order written. */
  directives: Directive[];
  /** Lookup by name. */
  byName: Map<string, Directive>;
  /** Later copies of a directive name, which the parser drops. */
  duplicates: Directive[];
  /** Directive text skipped because it held a non-ASCII character. */
  nonAscii: string[];
  /** Directives past MAX_DIRECTIVES that were not read. */
  truncated: number;
}

/**
 * CSP3 "Parse a serialized CSP". Split strictly on ";", strip ASCII
 * whitespace, skip empty and non-ASCII tokens, lowercase the name, keep the
 * first directive of each name, and split the value on ASCII whitespace.
 */
export function parseSerializedPolicy(text: string): ParsedPolicy {
  const directives: Directive[] = [];
  const byName = new Map<string, Directive>();
  const duplicates: Directive[] = [];
  const nonAscii: string[] = [];
  let truncated = 0;

  for (const piece of text.split(";")) {
    const token = stripAsciiWs(piece);
    if (token === "") continue;
    if (NON_ASCII.test(token)) {
      nonAscii.push(token);
      continue;
    }
    if (directives.length + duplicates.length >= MAX_DIRECTIVES) {
      truncated += 1;
      continue;
    }
    const rawName = /^[^\t\n\f\r ]+/.exec(token)![0];
    const name = asciiLower(rawName);
    const rest = token.slice(rawName.length);
    const tokens = rest.split(ASCII_WS_RUN).filter((t) => t !== "");
    const directive: Directive = { name, rawName, tokens };
    if (byName.has(name)) {
      duplicates.push(directive);
      continue;
    }
    byName.set(name, directive);
    directives.push(directive);
  }
  return { directives, byName, duplicates, nonAscii, truncated };
}

/**
 * Fetch "get, decode, and split": split a header value on commas that are
 * not inside a double-quoted string, then trim spaces and tabs. A CSP header
 * value is a comma-separated list of policies (CSP3 "Parse a serialized CSP
 * list"), and every one of them is enforced.
 */
export function splitHeaderValues(value: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === '"') {
      current += ch;
      i += 1;
      while (i < value.length) {
        const c = value[i];
        current += c;
        i += 1;
        if (c === "\\" && i < value.length) {
          current += value[i];
          i += 1;
        } else if (c === '"') {
          break;
        }
      }
      continue;
    }
    if (ch === ",") {
      out.push(current.replace(/^[ \t]+|[ \t]+$/g, ""));
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  out.push(current.replace(/^[ \t]+|[ \t]+$/g, ""));
  return out;
}

/* ---------------------------------------------------- input extraction */

export type PolicySource = "header" | "meta" | "value";
export type Disposition = "enforce" | "report";

export interface RawPolicy {
  text: string;
  source: PolicySource;
  disposition: Disposition;
  /** Where it came from, for display. */
  label: string;
}

export interface Extraction {
  policies: RawPolicy[];
  /** Findings about the input itself: skipped tags, obsolete headers, splits. */
  notes: Finding[];
  error: string | null;
  mode: PolicySource | null;
}

const CSP_HEADERS: Record<string, { disposition: Disposition; canonical: string }> = {
  "content-security-policy": { disposition: "enforce", canonical: "Content-Security-Policy" },
  "content-security-policy-report-only": {
    disposition: "report",
    canonical: "Content-Security-Policy-Report-Only",
  },
};
const PREFIXED_HEADERS: Record<string, string> = {
  "x-content-security-policy": "X-Content-Security-Policy",
  "x-webkit-csp": "X-WebKit-CSP",
};
const COMMON_HEADERS = new Set([
  "server",
  "date",
  "content-type",
  "content-length",
  "cache-control",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "set-cookie",
  "location",
  "vary",
  "etag",
  "last-modified",
  "connection",
  "referrer-policy",
  "permissions-policy",
  "expires",
  "age",
  "alt-svc",
  "accept-ranges",
  "content-encoding",
  "x-powered-by",
]);

// RFC 9110 field-name is a token; a curl -v line carries a "< " prefix.
const HEADER_LINE = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+)[ \t]*:[ \t]*(.*)$/;

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return "�";
      }
      return String.fromCodePoint(code);
    }
    return named[ref.toLowerCase()] ?? whole;
  });
}

function parseAttributes(tagBody: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(tagBody)) !== null && guard < 64) {
    guard += 1;
    const name = asciiLower(m[1]);
    if (!attrs.has(name)) attrs.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return attrs;
}

function tooLong(length: number): string {
  return `That is ${length.toLocaleString("en-US")} characters. This reads at most ${MAX_INPUT_CHARS.toLocaleString("en-US")}; a real policy is rarely more than a few thousand.`;
}

export function extractPolicies(input: string): Extraction {
  if (input.length > MAX_INPUT_CHARS) {
    return { policies: [], notes: [], error: tooLong(input.length), mode: null };
  }
  const text = input.replace(/^﻿/, "").trim();
  if (text === "") return { policies: [], notes: [], error: null, mode: null };

  if (/<meta\b/i.test(text)) return fromMeta(text);

  const lines = text.split(/\r\n|\r|\n/).map((line) => line.replace(/^<\s/, ""));
  const names = lines.map((line) => {
    const m = HEADER_LINE.exec(line);
    return m ? asciiLower(m[1]) : null;
  });
  if (names.some((n) => n !== null && (n in CSP_HEADERS || n in PREFIXED_HEADERS))) {
    return fromHeaders(lines);
  }
  if (lines.some((line) => /^HTTP\/\d/i.test(line)) || names.some((n) => n !== null && COMMON_HEADERS.has(n))) {
    return {
      policies: [],
      notes: [],
      error:
        "These look like HTTP response headers, but none of them is Content-Security-Policy or Content-Security-Policy-Report-Only. The response sets no policy.",
      mode: "header",
    };
  }
  return fromValue(text);
}

/** CSP3 skips a policy whose directive set comes out empty. */
function hasDirectiveText(part: string): boolean {
  return /[^\t\n\f\r ;]/.test(part);
}

function capPolicies(policies: RawPolicy[], notes: Finding[]): RawPolicy[] {
  if (policies.length <= MAX_POLICIES) return policies;
  notes.push({
    id: "too-many-policies",
    severity: "info",
    title: "Only the first policies were read",
    detail: `The input holds ${policies.length} policies. This reads the first ${MAX_POLICIES}.`,
  });
  return policies.slice(0, MAX_POLICIES);
}

function noteCommaSplit(parts: string[], notes: Finding[]): void {
  if (parts.length < 2) return;
  const suspicious = parts.slice(1).filter((part) => {
    const first = asciiLower(part.split(ASCII_WS_RUN)[0] ?? "");
    return first !== "" && !(first in DIRECTIVES) && !(first in OBSOLETE);
  });
  notes.push({
    id: "comma-split",
    severity: suspicious.length > 0 ? "medium" : "info",
    title:
      suspicious.length > 0
        ? "A comma split this into separate policies"
        : `A comma separates ${parts.length} policies`,
    detail:
      suspicious.length > 0
        ? `In an HTTP header a comma ends one policy and starts the next, so the text after it is parsed as a new policy whose first word is a directive name. Here a part begins with ${quoteList(suspicious.map((p) => `"${p.split(ASCII_WS_RUN)[0]}"`))}, which is not a directive, so the comma is probably a typo for a semicolon or a stray separator between sources.`
        : "In an HTTP header a comma separates independent policies. Every one is enforced, and a resource loads only if all of them allow it, so a second policy can only tighten things, never loosen them.",
  });
}

function fromValue(text: string): Extraction {
  const notes: Finding[] = [];
  const parts = splitHeaderValues(text).filter(hasDirectiveText);
  noteCommaSplit(parts, notes);
  const policies = parts.map<RawPolicy>((part, i) => ({
    text: part,
    source: "value",
    disposition: "enforce",
    label: parts.length === 1 ? "Policy" : `Policy ${i + 1} of ${parts.length}`,
  }));
  if (policies.length === 0) {
    return { policies, notes, error: "There is no directive here, only separators.", mode: "value" };
  }
  return { policies: capPolicies(policies, notes), notes, error: null, mode: "value" };
}

function fromHeaders(lines: string[]): Extraction {
  const notes: Finding[] = [];
  const headers: { canonical: string; disposition: Disposition; value: string; prefixed: boolean }[] = [];
  let current: (typeof headers)[number] | null = null;

  for (const line of lines) {
    // obs-fold (RFC 9112 section 5.2): a line starting with space or tab
    // continues the previous field value.
    if (/^[ \t]/.test(line) && current) {
      current.value += " " + line.trim();
      continue;
    }
    current = null;
    const m = HEADER_LINE.exec(line);
    if (!m) continue;
    const name = asciiLower(m[1]);
    if (name in CSP_HEADERS) {
      current = { ...CSP_HEADERS[name], value: m[2], prefixed: false };
      headers.push(current);
    } else if (name in PREFIXED_HEADERS) {
      current = { canonical: PREFIXED_HEADERS[name], disposition: "enforce", value: m[2], prefixed: true };
      headers.push(current);
    }
  }

  const standard = headers.filter((h) => !h.prefixed);
  const prefixed = headers.filter((h) => h.prefixed);
  if (prefixed.length > 0) {
    notes.push({
      id: "prefixed-header",
      severity: standard.length > 0 ? "info" : "medium",
      title: `${quoteList([...new Set(prefixed.map((h) => h.canonical))])} is obsolete`,
      detail:
        standard.length > 0
          ? "The prefixed CSP headers date from before the standard name existed. Current browsers ignore them, so they can be removed."
          : "The prefixed CSP headers date from before the standard name existed, and current browsers ignore them. The analysis below shows what the policy would do if it were sent as Content-Security-Policy, which is what it needs to be.",
    });
  }
  const used = standard.length > 0 ? standard : prefixed;

  const policies: RawPolicy[] = [];
  const seenByName = new Map<string, number>();
  used.forEach((header) => {
    const sameName = used.filter((h) => h.canonical === header.canonical).length;
    const ordinal = (seenByName.get(header.canonical) ?? 0) + 1;
    seenByName.set(header.canonical, ordinal);
    const parts = splitHeaderValues(header.value).filter(hasDirectiveText);
    noteCommaSplit(parts, notes);
    parts.forEach((part, partIndex) => {
      const headerTag = sameName > 1 ? ` #${ordinal}` : "";
      const partTag = parts.length > 1 ? ` (policy ${partIndex + 1} of ${parts.length})` : "";
      policies.push({
        text: part,
        source: "header",
        disposition: header.disposition,
        label: `${header.canonical}${headerTag}${partTag}`,
      });
    });
  });

  if (policies.length === 0) {
    return {
      policies,
      notes,
      error: "The Content-Security-Policy header is present but empty, so the response sets no policy.",
      mode: "header",
    };
  }
  if (policies.length > 1) {
    notes.push({
      id: "multiple-policies",
      severity: "info",
      title: `${policies.length} policies apply together`,
      detail:
        "Each policy is checked separately and a resource must satisfy every enforced one. A gap in one policy is closed if another blocks the same thing, but a loose second policy never relaxes a strict first one.",
    });
  }
  return { policies: capPolicies(policies, notes), notes, error: null, mode: "header" };
}

function fromMeta(text: string): Extraction {
  const notes: Finding[] = [];
  const policies: RawPolicy[] = [];
  const re = /<meta\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = re.exec(text)) !== null && seen < 64) {
    seen += 1;
    const attrs = parseAttributes(m[1]);
    const equiv = asciiLower(attrs.get("http-equiv") ?? "");
    if (equiv === "content-security-policy-report-only") {
      notes.push({
        id: `meta-report-only-${seen}`,
        severity: "medium",
        title: "Report-only cannot be set in a meta element",
        detail:
          "HTML defines no Content-Security-Policy-Report-Only pragma, so browsers ignore this tag completely: nothing is reported and nothing is blocked. Report-only mode needs the HTTP header.",
      });
      continue;
    }
    if (equiv !== "content-security-policy") continue;
    const content = attrs.get("content");
    if (content === undefined || !hasDirectiveText(content)) {
      notes.push({
        id: `meta-empty-${seen}`,
        severity: "low",
        title: "A CSP meta tag has no content",
        detail: "HTML ignores a Content-Security-Policy meta element whose content attribute is missing or empty.",
      });
      continue;
    }
    policies.push({ text: content, source: "meta", disposition: "enforce", label: "meta element" });
  }

  if (policies.length === 0) {
    return {
      policies,
      notes,
      error:
        notes.length > 0
          ? notes[0].detail
          : 'There is a <meta> tag here, but none with http-equiv="Content-Security-Policy" and a content attribute.',
      mode: "meta",
    };
  }
  if (policies.length > 1) {
    policies.forEach((p, i) => (p.label = `meta element ${i + 1}`));
    notes.push({
      id: "multiple-policies",
      severity: "info",
      title: `${policies.length} meta policies apply together`,
      detail:
        "Every CSP meta element in the head adds a policy, and a resource must satisfy all of them. A meta policy only applies to content after the element, so it belongs at the top of the head.",
    });
  }
  return { policies: capPolicies(policies, notes), notes, error: null, mode: "meta" };
}

/* ---------------------------------------------------- source list facts */

export interface ListFacts {
  sources: SourceInfo[];
  /** Matches nothing: empty, or nothing but 'none', invalid tokens and 'report-sample'. */
  blocksAll: boolean;
  /** 'none' sits beside other sources, so it is ignored. */
  noneMixed: boolean;
  nonce: boolean;
  hash: boolean;
  strictDynamic: boolean;
  unsafeInline: boolean;
  unsafeEval: boolean;
  wasmUnsafeEval: boolean;
  unsafeHashes: boolean;
  self: boolean;
  reportSample: boolean;
}

export function listFacts(tokens: string[]): ListFacts {
  const sources = tokens.map(classifySource);
  const has = (kw: string) => sources.some((s) => s.kind === "keyword" && s.keyword === kw);
  const effective = sources.filter(
    (s) => s.kind !== "none" && s.kind !== "invalid" && !(s.kind === "keyword" && s.keyword === "report-sample"),
  );
  return {
    sources,
    blocksAll: effective.length === 0,
    noneMixed: sources.some((s) => s.kind === "none") && sources.some((s) => s.kind !== "none" && s.kind !== "invalid"),
    nonce: sources.some((s) => s.kind === "nonce"),
    hash: sources.some((s) => s.kind === "hash"),
    strictDynamic: has("strict-dynamic"),
    unsafeInline: has("unsafe-inline"),
    unsafeEval: has("unsafe-eval"),
    wasmUnsafeEval: has("wasm-unsafe-eval"),
    unsafeHashes: has("unsafe-hashes"),
    self: has("self"),
    reportSample: has("report-sample"),
  };
}

/**
 * CSP3 "Does a source list allow all inline behavior for type?". A nonce or
 * hash anywhere in the list switches 'unsafe-inline' off, and for scripts
 * so does 'strict-dynamic'. This is the rule that lets one policy carry
 * 'unsafe-inline' as a fallback for CSP1 browsers without weakening it in
 * newer ones.
 */
export function allowsAllInline(f: ListFacts, type: "script" | "style"): boolean {
  if (f.nonce || f.hash) return false;
  if (type === "script" && f.strictDynamic) return false;
  return f.unsafeInline;
}

/* ----------------------------------------------------- risky script hosts */

/** Hosts where anyone can publish files, matched as a parent domain. */
export const USER_CONTENT_SUFFIXES = [
  "github.io",
  "googleusercontent.com",
  "appspot.com",
  "herokuapp.com",
  "azurewebsites.net",
  "cloudfront.net",
  "amazonaws.com",
  "firebaseapp.com",
  "web.app",
  "netlify.app",
  "vercel.app",
  "pages.dev",
  "workers.dev",
];

/** Single hosts with a documented history as script allowlist bypasses. */
export const GADGET_HOSTS: Record<string, string> = {
  "ajax.googleapis.com":
    "serves old AngularJS builds, which let injected HTML run template expressions without any inline script",
  "cdnjs.cloudflare.com": "serves old AngularJS builds, a documented way around host allowlists",
  "cdn.jsdelivr.net": "serves files from any npm package or GitHub repository, so anyone can publish a script there",
  "unpkg.com": "serves files from any npm package, so anyone can publish a script there",
  "www.google.com": "has hosted JSONP endpoints, which wrap an attacker-chosen callback name in executable script",
  "s3.amazonaws.com": "serves path-style bucket URLs, so anyone who creates a bucket can publish under this host",
  "storage.googleapis.com": "serves path-style bucket URLs, so anyone who creates a bucket can publish under this host",
  "raw.githack.com": "serves arbitrary GitHub files with a script content type",
};

export interface HostRisk {
  token: string;
  why: string;
  /** The source has a path, which narrows it but is not checked after a redirect. */
  pathScoped: boolean;
}

/** Which host-sources in a list cover a host where anyone can publish script. */
export function riskyHosts(sources: SourceInfo[]): HostRisk[] {
  const out: HostRisk[] = [];
  for (const s of sources) {
    if (s.kind !== "host" || !s.host || s.host === "*") continue;
    const pathScoped = !!s.path && s.path !== "/";
    if (s.host.startsWith("*.")) {
      const base = s.host.slice(2);
      const suffix = USER_CONTENT_SUFFIXES.find((sfx) => base === sfx || base.endsWith("." + sfx));
      if (suffix) {
        out.push({ token: s.token, why: `anyone can create a site under ${suffix}`, pathScoped });
        continue;
      }
      const gadget = Object.keys(GADGET_HOSTS).find((g) => g === base || g.endsWith("." + base));
      if (gadget) out.push({ token: s.token, why: `it covers ${gadget}, which ${GADGET_HOSTS[gadget]}`, pathScoped });
      continue;
    }
    if (s.host in GADGET_HOSTS) out.push({ token: s.token, why: `${s.host} ${GADGET_HOSTS[s.host]}`, pathScoped });
  }
  return out;
}

/** A wildcard host over a single label, such as *.com, which covers a whole TLD. */
function isTldWildcard(s: SourceInfo): boolean {
  return s.kind === "host" && !!s.host && s.host.startsWith("*.") && !s.host.slice(2).includes(".");
}

/** A host-source that matches every host: * itself, or scheme://*. */
function isAnyHost(s: SourceInfo): boolean {
  return s.kind === "wildcard" || (s.kind === "host" && s.host === "*");
}

/* -------------------------------------------------------- effective rows */

export interface TokenView {
  token: string;
  /** Why the token is ignored or has no effect here; null when it applies. */
  note: string | null;
}

export interface EffectiveRow {
  /** The effective directive this row stands for, or "eval". */
  key: string;
  label: string;
  covers: string;
  /** Directive that governs, or null when nothing does. */
  governedBy: string | null;
  /** Lookup order, for display ("script-src-elem, script-src, default-src"). */
  chain: string[];
  tokens: TokenView[];
  verdict: string;
  tone: Severity;
}

type RowType = "script" | "script-attr" | "style" | "style-attr" | "worker" | "plain" | "document";

const ROW_DEFS: { key: string; label: string; covers: string; type: RowType }[] = [
  { key: "script-src-elem", label: "Scripts", covers: "script elements, inline and external, and javascript: URLs", type: "script" },
  { key: "script-src-attr", label: "Event handlers", covers: "onclick and the other on* attributes", type: "script-attr" },
  { key: "eval", label: "eval", covers: "eval(), new Function(), string timers, WebAssembly compilation", type: "script" },
  { key: "style-src-elem", label: "Stylesheets", covers: "style elements and linked stylesheets", type: "style" },
  { key: "style-src-attr", label: "Style attributes", covers: "style= attributes", type: "style-attr" },
  { key: "img-src", label: "Images", covers: "img, favicons, CSS background images", type: "plain" },
  { key: "font-src", label: "Fonts", covers: "@font-face downloads", type: "plain" },
  { key: "connect-src", label: "Connections", covers: "fetch, XHR, WebSocket, EventSource, sendBeacon", type: "plain" },
  { key: "media-src", label: "Media", covers: "audio, video, track", type: "plain" },
  { key: "object-src", label: "Plugins", covers: "object and embed", type: "plain" },
  { key: "frame-src", label: "Frames", covers: "iframes this page loads", type: "plain" },
  { key: "worker-src", label: "Workers", covers: "Worker, SharedWorker, service workers", type: "worker" },
  { key: "manifest-src", label: "Manifest", covers: "the web app manifest", type: "plain" },
  { key: "base-uri", label: "Base URL", covers: "the base element", type: "document" },
  { key: "form-action", label: "Form targets", covers: "where forms submit", type: "document" },
  { key: "frame-ancestors", label: "Embedding", covers: "which sites may frame this page", type: "document" },
];

/** The directive that governs an effective directive in this policy, if any. */
export function governing(byName: Map<string, Directive>, key: string): Directive | null {
  const chain = FALLBACKS[key] ?? [key];
  for (const name of chain) {
    const d = byName.get(name);
    if (d) return d;
  }
  return null;
}

function tokenNotes(type: RowType, key: string, governedBy: string, f: ListFacts): TokenView[] {
  const where = key === "eval" ? "eval" : key;
  return f.sources.map((s) => {
    const kw = s.kind === "keyword" ? s.keyword : undefined;
    if (s.kind === "invalid") return { token: s.token, note: `invalid, ignored: ${s.problem}` };
    if (s.kind === "none") return { token: s.token, note: f.noneMixed ? "ignored: other sources are listed" : null };
    if (s.unquoted) return { token: s.token, note: `a host named "${s.unquoted}", not the keyword` };
    const hostLike = s.kind === "host" || s.kind === "scheme" || s.kind === "wildcard";

    if (type === "script" || type === "worker") {
      if (f.strictDynamic && (hostLike || kw === "self" || kw === "unsafe-inline")) {
        return { token: s.token, note: "ignored by CSP3 browsers: 'strict-dynamic'" };
      }
      if (type === "script" && kw === "unsafe-inline" && (f.nonce || f.hash)) {
        return { token: s.token, note: "ignored by CSP2+ browsers: a nonce or hash is listed" };
      }
      if (type === "worker" && kw === "unsafe-inline") return { token: s.token, note: "no effect on workers" };
      if ((kw === "unsafe-eval" || kw === "wasm-unsafe-eval") && key !== "eval") {
        return {
          token: s.token,
          note: governedBy === "script-src-elem" || governedBy === "worker-src" ? `no effect: eval follows script-src` : "applies to eval",
        };
      }
      if (kw === "unsafe-hashes") return { token: s.token, note: "applies to event handlers" };
      return { token: s.token, note: null };
    }

    if (type === "script-attr" || type === "style-attr") {
      if (s.kind === "nonce") return { token: s.token, note: "nonces never apply to attributes" };
      if (s.kind === "hash" && !f.unsafeHashes) return { token: s.token, note: "needs 'unsafe-hashes' to apply to attributes" };
      if (hostLike || kw === "self") return { token: s.token, note: "no effect on inline attributes" };
      if (kw === "unsafe-inline" && !allowsAllInline(f, type === "script-attr" ? "script" : "style")) {
        return { token: s.token, note: "ignored: a nonce, hash or 'strict-dynamic' is listed" };
      }
      if (kw === "unsafe-eval" || kw === "wasm-unsafe-eval") return { token: s.token, note: "no effect on attributes" };
      if (type === "style-attr" && kw === "strict-dynamic") return { token: s.token, note: "applies to scripts only" };
      return { token: s.token, note: null };
    }

    if (type === "style") {
      if (kw === "strict-dynamic") return { token: s.token, note: "applies to scripts only" };
      if (kw === "unsafe-eval" || kw === "wasm-unsafe-eval") return { token: s.token, note: "no effect on styles" };
      if (kw === "unsafe-inline" && (f.nonce || f.hash)) {
        return { token: s.token, note: "ignored by CSP2+ browsers: a nonce or hash is listed" };
      }
      if (kw === "unsafe-hashes") return { token: s.token, note: "applies to style attributes" };
      return { token: s.token, note: null };
    }

    // Plain fetch rows and the document directives: only hosts, schemes, *
    // and 'self' mean anything. Nonces and hashes only ever match script and
    // style elements.
    if (kw && kw !== "self") {
      return {
        token: s.token,
        note: key === "frame-ancestors" ? "not allowed in frame-ancestors" : `no effect in ${where}`,
      };
    }
    if (s.kind === "nonce" || s.kind === "hash") {
      return { token: s.token, note: key === "frame-ancestors" ? "not allowed in frame-ancestors" : `no effect in ${where}` };
    }
    return { token: s.token, note: null };
  });
}

function scriptRisk(f: ListFacts): { any: boolean; reasons: string[] } {
  if (f.strictDynamic) return { any: false, reasons: [] };
  const reasons: string[] = [];
  for (const s of f.sources) {
    if (isAnyHost(s)) reasons.push(s.token);
    else if (s.kind === "scheme" && ["http", "https", "data"].includes(s.scheme ?? "")) reasons.push(s.token);
    else if (isTldWildcard(s)) reasons.push(s.token);
  }
  return { any: reasons.length > 0, reasons };
}

function buildRow(
  def: (typeof ROW_DEFS)[number],
  byName: Map<string, Directive>,
  source: PolicySource,
  nonceBased: boolean,
): EffectiveRow {
  const chain =
    def.key === "eval" ? ["script-src", "default-src"] : def.type === "document" ? [def.key] : FALLBACKS[def.key];
  let governed: Directive | null = null;
  for (const name of chain) {
    const d = byName.get(name);
    if (d) {
      governed = d;
      break;
    }
  }

  const base = { key: def.key, label: def.label, covers: def.covers, chain };
  if (!governed) {
    if (def.key === "frame-ancestors" && source === "meta") {
      return { ...base, governedBy: null, tokens: [], verdict: "Cannot be set from a meta element", tone: "low" };
    }
    const tone: Severity =
      def.key === "script-src-elem" || def.key === "script-src-attr"
        ? "high"
        : def.key === "eval"
          ? "medium"
          : def.key === "object-src" || (def.key === "base-uri" && nonceBased)
            ? "medium"
            : def.key === "frame-ancestors" || def.key === "base-uri" || def.type === "style" || def.type === "style-attr"
              ? "low"
              : "info";
    const verdict =
      def.key === "frame-ancestors"
        ? "Any site can frame this page"
        : def.type === "document"
          ? "Not restricted (no default-src fallback)"
          : "Not restricted";
    return { ...base, governedBy: null, tokens: [], verdict, tone };
  }

  const f = listFacts(governed.tokens);
  const tokens = tokenNotes(def.type, def.key, governed.name, f);

  if (def.key === "eval") {
    const relevant = tokens.filter((t) => {
      const lower = asciiLower(t.token);
      return lower === "'unsafe-eval'" || lower === "'wasm-unsafe-eval'";
    });
    if (f.unsafeEval) {
      return { ...base, governedBy: governed.name, tokens: relevant, verdict: "eval and Function allowed", tone: "medium" };
    }
    if (f.wasmUnsafeEval) {
      return { ...base, governedBy: governed.name, tokens: relevant, verdict: "WebAssembly only; eval blocked", tone: "info" };
    }
    return { ...base, governedBy: governed.name, tokens: relevant, verdict: "Blocked", tone: "pass" };
  }

  if (f.blocksAll) return { ...base, governedBy: governed.name, tokens, verdict: "Blocked entirely", tone: "pass" };

  const row = (verdict: string, tone: Severity): EffectiveRow => ({
    ...base,
    governedBy: governed!.name,
    tokens,
    verdict,
    tone,
  });

  switch (def.type) {
    case "script": {
      if (allowsAllInline(f, "script")) return row("Any inline script runs", "high");
      const risk = scriptRisk(f);
      if (risk.any) return row(`Script from any host (${quoteList(risk.reasons, 3)})`, "high");
      if (f.strictDynamic && !(f.nonce || f.hash)) return row("Nothing can load: 'strict-dynamic' with no nonce or hash", "medium");
      if ((f.nonce || f.hash) && f.strictDynamic) return row("Nonce or hash; trust passes to loaded scripts", "pass");
      const hosts = f.sources.filter((s) => s.kind === "host" || s.kind === "scheme" || (s.kind === "keyword" && s.keyword === "self"));
      if (f.nonce || f.hash) return row(hosts.length ? "Nonce or hash, plus an allowlist" : "Nonce or hash only", hosts.length ? "info" : "pass");
      return row("Allowlist only; inline blocked", "info");
    }
    case "script-attr": {
      if (allowsAllInline(f, "script")) return row("Any handler runs", "high");
      if (f.hash && f.unsafeHashes) return row("Only handlers whose hash is listed", "low");
      return row("Blocked", "pass");
    }
    case "style":
      return allowsAllInline(f, "style") ? row("Inline styles allowed", "low") : row("Restricted", "pass");
    case "style-attr": {
      if (allowsAllInline(f, "style")) return row("Style attributes allowed", "low");
      if (f.hash && f.unsafeHashes) return row("Only attributes whose hash is listed", "info");
      return row("Blocked", "pass");
    }
    case "worker":
      return f.sources.some(isAnyHost) && !f.strictDynamic ? row("Any host", "low") : row("Restricted", "pass");
    case "plain":
    case "document": {
      const anyHost = f.sources.some(
        (s) => isAnyHost(s) || (s.kind === "scheme" && (s.scheme === "https" || s.scheme === "http")),
      );
      if (def.key === "frame-ancestors") return anyHost ? row("Any site can frame this page", "medium") : row("Restricted", "pass");
      if (def.key === "base-uri") return anyHost ? row("Any host", "medium") : row("Restricted", "pass");
      if (def.key === "object-src") return row(anyHost ? "Any host" : "Listed sources", anyHost ? "medium" : "low");
      return anyHost ? row("Any host", "info") : row("Listed sources", "pass");
    }
  }
  return row("Listed sources", "info");
}

/* ------------------------------------------------------ script verdict */

export type ScriptLevel = "unrestricted" | "bypassable" | "allowlist" | "strict" | "blocked";

export const SCRIPT_LEVEL_RANK: Record<ScriptLevel, number> = {
  unrestricted: 0,
  bypassable: 1,
  allowlist: 2,
  strict: 3,
  blocked: 4,
};

export interface ScriptVerdict {
  level: ScriptLevel;
  text: string;
}

export function scriptVerdict(byName: Map<string, Directive>): ScriptVerdict {
  const elem = governing(byName, "script-src-elem");
  const attr = governing(byName, "script-src-attr");
  if (!elem) {
    return { level: "unrestricted", text: "No script-src or default-src: scripts are not restricted at all." };
  }
  const f = listFacts(elem.tokens);
  if (f.blocksAll) {
    const fa = attr ? listFacts(attr.tokens) : null;
    if (!fa || allowsAllInline(fa, "script")) {
      return { level: "bypassable", text: "Script elements are blocked, but inline event handlers are not." };
    }
    return { level: "blocked", text: "All script is blocked." };
  }
  if (allowsAllInline(f, "script")) {
    return { level: "bypassable", text: `'unsafe-inline' in ${elem.name} lets injected inline script run.` };
  }
  if (!attr || allowsAllInline(listFacts(attr.tokens), "script")) {
    return { level: "bypassable", text: "Inline event handlers run, so an injected onerror= attribute executes." };
  }
  const risk = scriptRisk(f);
  if (risk.any) {
    return { level: "bypassable", text: `${quoteList(risk.reasons, 3)} lets an injected script tag load code from a host the attacker controls.` };
  }
  if (f.nonce || f.hash) {
    const activeHosts = f.strictDynamic
      ? []
      : f.sources.filter((s) => s.kind === "host" || s.kind === "scheme" || (s.kind === "keyword" && s.keyword === "self"));
    if (activeHosts.length === 0) {
      return {
        level: "strict",
        text: f.strictDynamic
          ? "Nonce or hash based with 'strict-dynamic': the strongest kind of script policy."
          : "Nonce or hash based: only scripts the server marked can run.",
      };
    }
    return { level: "allowlist", text: "Nonces or hashes, but the host allowlist still admits any script on those hosts." };
  }
  if (f.strictDynamic) {
    return { level: "blocked", text: "'strict-dynamic' with no nonce or hash: CSP3 browsers run no script at all." };
  }
  return { level: "allowlist", text: "Host allowlist: as strong as the weakest file on any listed host." };
}

/* ------------------------------------------------------------- analysis */

export interface PolicyAnalysis {
  label: string;
  source: PolicySource;
  disposition: Disposition;
  directives: Directive[];
  rows: EffectiveRow[];
  findings: Finding[];
  script: ScriptVerdict;
  /** The policy as the parser kept it, one directive per line. */
  normalized: string;
  /** Directives this tool would add, or an empty list. */
  added: string[];
  /** normalized with the added directives, or null when nothing is missing. */
  hardened: string | null;
}

export function analyzePolicy(raw: RawPolicy): PolicyAnalysis {
  const parsed = parseSerializedPolicy(raw.text);
  const findings: Finding[] = [];
  const ids = new Set<string>();
  const add = (id: string, severity: Severity, title: string, detail: string, directive?: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    findings.push({ id, severity, title, detail, directive });
  };

  /* ----- what the parser dropped */

  for (const text of parsed.nonAscii) {
    const name = text.split(ASCII_WS_RUN)[0];
    add(
      `non-ascii-${name}-${findings.length}`,
      "medium",
      `Directive skipped: ${name.length > 40 ? name.slice(0, 40) + "..." : name} holds non-ASCII characters`,
      "The CSP3 parser drops any directive that contains a character outside ASCII, so the whole directive is gone, not just the odd token. The usual cause is curly quotes or a non-breaking space pasted from a document editor in place of plain ' and space.",
      name,
    );
  }
  for (const dup of parsed.duplicates) {
    add(
      `duplicate-${dup.name}`,
      "medium",
      `Duplicate ${dup.name}: only the first one counts`,
      `The parser keeps the first ${dup.name} and silently drops every later one. If the second copy was meant to add sources or tighten the first, it does nothing. Merge them into one directive.`,
      dup.name,
    );
  }
  if (parsed.truncated > 0) {
    add(
      "truncated",
      "info",
      "Only the first directives were read",
      `This policy has more than ${MAX_DIRECTIVES} directives; the last ${parsed.truncated} were not analyzed.`,
    );
  }

  /* ----- meta elements cannot carry three directives */

  const byName = new Map(parsed.byName);
  if (raw.source === "meta") {
    for (const name of ["frame-ancestors", "report-uri", "sandbox"]) {
      if (!byName.has(name)) continue;
      byName.delete(name);
      add(
        `meta-ignored-${name}`,
        name === "frame-ancestors" ? "medium" : "low",
        `${name} is ignored in a meta element`,
        name === "frame-ancestors"
          ? "HTML removes frame-ancestors from a policy delivered by meta, because the tag is parsed only after the browser has already decided whether to render the page in a frame. This gives no clickjacking protection; send it as an HTTP header."
          : `HTML removes ${name} from a policy delivered by meta. Send it in the Content-Security-Policy header if it is needed.`,
        name,
      );
    }
    if (raw.text.includes(",")) {
      add(
        "meta-comma",
        "low",
        "A comma does not separate meta policies",
        "A meta element holds exactly one policy, so a comma is not a separator here. It becomes part of whichever source it touches, and that source no longer parses.",
      );
    }
  }
  const directives = parsed.directives.filter((d) => byName.has(d.name));

  /* ----- names */

  const known = [...Object.keys(DIRECTIVES), ...Object.keys(OBSOLETE)];
  for (const d of directives) {
    if (d.name in DIRECTIVES) continue;
    if (d.name in OBSOLETE) {
      const o = OBSOLETE[d.name];
      add(`obsolete-${d.name}`, o.severity, `${d.name} is obsolete`, o.detail, d.name);
      continue;
    }
    if (d.name.endsWith(":") && d.name.slice(0, -1) in DIRECTIVES) {
      add(
        `colon-${d.name}`,
        "medium",
        `"${d.rawName}" has a colon, so it is not ${d.name.slice(0, -1)}`,
        `CSP writes a directive name, a space and its sources, with no colon. With the colon the name is unknown, browsers ignore the directive, and ${d.name.slice(0, -1)} is effectively missing.`,
        d.name,
      );
      continue;
    }
    const near = closest(d.name, known);
    const valid = /^[a-z0-9-]+$/.test(d.name);
    add(
      `unknown-${d.name}`,
      near && near in DIRECTIVES && DIRECTIVES[near].kind === "fetch" ? "medium" : "low",
      valid ? `Unknown directive ${d.name}` : `"${d.rawName}" is not a valid directive name`,
      `Browsers ignore directives they do not recognize, so this one restricts nothing.${near ? ` Did you mean ${near}?` : ""}`,
      d.name,
    );
  }

  /* ----- sources, directive by directive */

  const nonceValues = new Map<string, number>();
  for (const d of directives) {
    if (!SOURCE_LIST_DIRECTIVES.has(d.name)) continue;
    const f = listFacts(d.tokens);
    const scriptish = d.name.startsWith("script-src") || d.name === "default-src";

    const invalid = f.sources.filter((s) => s.kind === "invalid");
    if (d.name === "frame-ancestors") {
      for (const s of f.sources) {
        if ((s.kind === "keyword" && s.keyword !== "self") || s.kind === "nonce" || s.kind === "hash") {
          invalid.push({ ...s, kind: "invalid", problem: "frame-ancestors accepts only hosts, schemes, 'self' and 'none'" });
        }
      }
    }
    if (invalid.length > 0) {
      add(
        `invalid-${d.name}`,
        scriptish ? "medium" : "low",
        `${invalid.length === 1 ? "A source" : `${invalid.length} sources`} in ${d.name} will be ignored`,
        `${invalid
          .slice(0, MAX_QUOTED)
          .map((s) => `${s.token} is ${s.problem}`)
          .join(". ")}.${invalid.length > MAX_QUOTED ? ` And ${invalid.length - MAX_QUOTED} more.` : ""} Browsers skip a source expression they cannot parse, so whatever it was meant to allow or restrict is not in effect.`,
        d.name,
      );
    }

    const unquoted = f.sources.filter((s) => s.unquoted);
    if (unquoted.length > 0) {
      add(
        `unquoted-${d.name}`,
        scriptish ? "medium" : "low",
        `Keyword without quotes in ${d.name}: ${quoteList(unquoted.map((s) => s.token))}`,
        `Keywords must be wrapped in single quotes. Unquoted, ${unquoted[0].token} parses as a host name, so it matches a server literally called "${unquoted[0].unquoted}" and the keyword you meant is not in effect. Write '${unquoted[0].unquoted}'.`,
        d.name,
      );
    }

    const swallowed = f.sources.filter((s) => {
      const lower = asciiLower(s.token).replace(/:$/, "");
      return lower in DIRECTIVES || lower in OBSOLETE;
    });
    if (swallowed.length > 0) {
      const names = swallowed.map((s) => asciiLower(s.token).replace(/:$/, ""));
      add(
        `swallowed-${d.name}`,
        "medium",
        `Missing semicolon: ${quoteList(names)} is read as a source of ${d.name}`,
        `Directives are separated by semicolons, not line breaks. Without one, ${names[0]} and everything after it become sources inside ${d.name}, so ${names[0]} as a directive does not exist and ${d.name} carries sources that were never meant for it.`,
        d.name,
      );
    }

    if (f.noneMixed) {
      add(
        `none-mixed-${d.name}`,
        "low",
        `'none' in ${d.name} is ignored`,
        `'none' only means "nothing" when it is the sole source. Beside other sources it has no effect, so ${d.name} allows exactly the other sources listed. If nothing should load, remove the rest.`,
        d.name,
      );
    }

    for (const s of f.sources) {
      if (s.kind === "nonce" && s.value) {
        nonceValues.set(s.value, (nonceValues.get(s.value) ?? 0) + 1);
      }
      if (s.kind === "hash" && s.hashAlg && s.value) {
        const bytes = base64DecodedLength(s.value);
        const want = HASH_BYTES[s.hashAlg];
        if (bytes !== want) {
          add(
            `hash-length-${s.token}`,
            "medium",
            `A ${s.hashAlg} hash in ${d.name} is the wrong length`,
            `${s.token.length > 60 ? s.token.slice(0, 57) + "...'" : s.token} decodes to ${bytes === null ? "an impossible base64 length" : `${bytes} bytes`}, but a ${s.hashAlg} digest is ${want} bytes (${Math.ceil(want / 3) * 4} base64 characters with padding). It can never match anything, so the script or style it was meant to allow is blocked.`,
            d.name,
          );
        }
      }
    }
  }

  for (const value of nonceValues.keys()) {
    // A nonce need not be base64 of whole bytes, so count six bits per
    // character rather than insisting on a decodable length.
    const bytes = Math.floor((value.replace(/=+$/, "").length * 6) / 8);
    if (bytes < 16) {
      add(
        `nonce-short-${value}`,
        "medium",
        "A nonce is shorter than 128 bits",
        `'nonce-${value.length > 40 ? value.slice(0, 40) + "..." : value}' carries at most ${bytes * 8} bits. CSP3 asks for at least 128 bits from a cryptographically secure generator, fresh on every response, because the nonce is the only thing an attacker needs to guess.`,
      );
    }
  }
  if (nonceValues.size > 0) {
    add(
      "nonce-present",
      "info",
      "A nonce must change on every response",
      "A nonce only works if it is unpredictable and different each time the page is served. One baked into a static file, a CDN-cached page or a framework config is a password published to every visitor. Load the page twice and compare the values.",
    );
  }

  /* ----- scripts */

  const elem = governing(byName, "script-src-elem");
  const attrDir = governing(byName, "script-src-attr");
  const hasFetchDirective = directives.some((d) => d.name in DIRECTIVES && DIRECTIVES[d.name].kind === "fetch");
  const fallbackNote = (name: string) =>
    name === "default-src" ? " There is no script-src, so default-src governs scripts." : "";

  if (!elem) {
    add(
      "script-unrestricted",
      "high",
      "Scripts are not restricted",
      hasFetchDirective
        ? "There is no script-src and no default-src, so nothing limits where scripts load from, and inline script and event handlers run freely. Against cross-site scripting this policy does nothing."
        : "The policy has no fetch directives at all. If it exists only to control framing or to report, that is expected, but it gives no protection against cross-site scripting: scripts load from anywhere and inline script runs.",
      "script-src",
    );
  } else {
    const f = listFacts(elem.tokens);
    if (f.blocksAll) {
      add("script-blocked", "pass", "Script elements are disabled", `${elem.name} matches nothing, so no script element loads or runs.`, elem.name);
    } else {
      if (f.unsafeInline) {
        if (allowsAllInline(f, "script")) {
          add(
            "script-unsafe-inline",
            "high",
            `'unsafe-inline' allows inline script`,
            `With 'unsafe-inline' in ${elem.name} and no nonce or hash beside it, every inline script block${attrDir && attrDir.name === elem.name ? ", every event handler attribute" : ""} and every javascript: URL runs. That is the form most injected cross-site scripting takes, so this alone makes the script policy easy to get around.${fallbackNote(elem.name)}`,
            elem.name,
          );
        } else {
          add(
            "script-unsafe-inline-ignored",
            "info",
            `'unsafe-inline' is ignored by modern browsers`,
            `Browsers that implement CSP Level 2 or later ignore 'unsafe-inline' in a list that also holds a nonce or a hash${f.strictDynamic ? ", and CSP3 browsers ignore it beside 'strict-dynamic' too" : ""}. It remains for CSP Level 1 browsers, which do not understand nonces and would otherwise block every inline script. Keeping it as a fallback is deliberate and recommended.`,
            elem.name,
          );
        }
      }

      const fallbackSources = f.sources.filter(
        (s) => s.kind === "host" || s.kind === "scheme" || s.kind === "wildcard" || (s.kind === "keyword" && s.keyword === "self"),
      );

      if (f.strictDynamic) {
        if (f.nonce || f.hash) {
          add(
            "script-strict-dynamic",
            "pass",
            "Nonce or hash with 'strict-dynamic'",
            `Only scripts carrying the nonce or matching a hash run, and scripts they create with document.createElement are trusted in turn, so loaders and tag managers keep working. Scripts inserted by the HTML parser, such as injected markup or document.write, still need a nonce.${fallbackSources.length ? ` CSP3 browsers ignore ${quoteList(fallbackSources.map((s) => s.token))} here; those sources only matter to older browsers that do not know 'strict-dynamic'.` : ""}`,
            elem.name,
          );
        } else {
          add(
            "script-strict-dynamic-alone",
            "medium",
            "'strict-dynamic' without a nonce or hash blocks every script",
            `'strict-dynamic' tells CSP3 browsers to ignore host sources, scheme sources and 'self', and to trust only scripts that already carry a nonce or hash, or were created by such a script. With no nonce or hash to start the chain, no script runs at all, while older browsers fall back to the allowlist. A broken policy like this usually gets loosened in a hurry; add a nonce.`,
            elem.name,
          );
        }
      } else {
        for (const s of f.sources) {
          if (isAnyHost(s)) {
            add(
              `script-wildcard-${s.token}`,
              "high",
              `${s.token} allows script from any host`,
              `${s.token} matches every host over HTTP and HTTPS. An attacker who can inject a script tag points it at a file on their own server and it runs.${fallbackNote(elem.name)}`,
              elem.name,
            );
          } else if (s.kind === "scheme") {
            const scheme = s.scheme ?? "";
            if (scheme === "https" || scheme === "http") {
              add(
                `script-scheme-${scheme}`,
                "high",
                `${s.token} allows script from any ${scheme === "https" ? "HTTPS" : "HTTP or HTTPS"} host`,
                scheme === "https"
                  ? `A scheme source matches every host on that scheme, and anyone can serve a file over HTTPS. An injected script tag loads code from the attacker's own server.${fallbackNote(elem.name)}`
                  : `A scheme source matches every host on that scheme, and in CSP3 http: also matches https: URLs, so this is at least as broad as https:. On an HTTP page the script also travels in cleartext.${fallbackNote(elem.name)}`,
                elem.name,
              );
            } else if (scheme === "data") {
              add(
                "script-scheme-data",
                "high",
                "data: lets an injected tag carry its own script",
                `An injected <script src="data:text/javascript,..."> holds its code in the URL itself, so data: in a script list is as permissive as 'unsafe-inline' for anyone who can inject a tag.${fallbackNote(elem.name)}`,
                elem.name,
              );
            } else if (scheme === "blob" || scheme === "filesystem") {
              add(
                `script-scheme-${scheme}`,
                "medium",
                `${s.token} lets page script turn data into script`,
                `${s.token} URLs are created by script already running in the page, so on its own this needs a foothold. Combined with any way to influence what that script writes into a Blob or file, it becomes code execution. Some bundlers and worker setups need it; worker-src is the narrower place to allow it.`,
                elem.name,
              );
            } else {
              add(
                `script-scheme-${scheme}`,
                "low",
                `${s.token} in a script list`,
                `This allows any script whose URL uses the ${scheme} scheme. That is unusual in a script list; check that it is intended.`,
                elem.name,
              );
            }
          } else if (isTldWildcard(s)) {
            add(
              `script-tld-${s.token}`,
              "high",
              `${s.token} covers a whole top-level domain`,
              `${s.token} matches every domain under .${s.host!.slice(2)}, so anyone who registers one can serve script this page will run.`,
              elem.name,
            );
          } else if (s.kind === "host" && (s.scheme === "http" || s.scheme === "ws")) {
            add(
              `script-cleartext-${s.token}`,
              "medium",
              `${s.token} is a cleartext script source`,
              `A script fetched over plain HTTP can be rewritten by anyone on the network path. On an HTTPS page browsers block mixed-content scripts anyway, and in CSP3 ${s.scheme}://host also matches the secure scheme, so writing https:// costs nothing and removes the doubt.`,
              elem.name,
            );
          }
        }

        for (const risk of riskyHosts(f.sources)) {
          add(
            `script-gadget-${risk.token}`,
            risk.pathScoped ? "low" : "medium",
            `${risk.token} weakens the allowlist`,
            `Allowlisting it means trusting every file it serves: ${risk.why}.${risk.pathScoped ? " The path narrows it, but CSP does not check paths after a redirect, so an open redirect on any allowed host undoes the restriction." : " Nonces with 'strict-dynamic' avoid trusting whole hosts."}`,
            elem.name,
          );
        }

        if ((f.nonce || f.hash) && fallbackSources.length > 0 && !allowsAllInline(f, "script")) {
          add(
            "script-nonce-allowlist",
            "info",
            "Nonce plus an allowlist",
            `Inline script needs the nonce or hash, but external script from ${quoteList(fallbackSources.map((s) => s.token))} still loads without one, so the allowlist is still a way in. Adding 'strict-dynamic' makes CSP3 browsers ignore the allowlist and rely on the nonce.`,
            elem.name,
          );
        } else if (!(f.nonce || f.hash) && f.self && !allowsAllInline(f, "script")) {
          add(
            "script-self",
            "info",
            "'self' trusts every script on this origin",
            "'self' allows any file served from this origin as script. An upload feature, a JSONP endpoint or an old library elsewhere on the same origin becomes a way to run attacker-chosen script. Nonces or hashes avoid trusting the whole origin.",
            elem.name,
          );
        }
      }

      if (f.reportSample) {
        add(
          "report-sample",
          "info",
          "'report-sample' is set",
          "Violation reports include the first 40 characters of the blocked inline script or style, which makes reports far easier to triage. Those characters can include whatever an attacker injected, so treat reports as untrusted input.",
          elem.name,
        );
      }
    }
  }

  // script-src-attr has its own fallback chain; report it only when it does
  // not simply repeat what the script-src-elem chain already said.
  if (elem) {
    if (!attrDir) {
      add(
        "attr-unrestricted",
        "high",
        "Inline event handlers are not restricted",
        "script-src-elem does not cover event handler attributes. They fall back to script-src-attr, then script-src, then default-src, and none is present, so an injected onerror= or onload= runs.",
        "script-src-attr",
      );
    } else if (attrDir.name !== elem.name && allowsAllInline(listFacts(attrDir.tokens), "script")) {
      add(
        "attr-unsafe-inline",
        "high",
        "Inline event handlers are allowed",
        `${attrDir.name} allows 'unsafe-inline' with no hash, so any injected on* attribute runs. An attacker does not need a script tag when <img src=x onerror=...> works.`,
        attrDir.name,
      );
    }
  }

  // CSP3 "EnsureCSPDoesNotBlockStringCompilation" reads script-src, then
  // default-src, and nothing else.
  const evalDir = byName.get("script-src") ?? byName.get("default-src") ?? null;
  if (evalDir) {
    const f = listFacts(evalDir.tokens);
    if (f.unsafeEval) {
      add(
        "eval-unsafe",
        "medium",
        "'unsafe-eval' allows eval() and new Function()",
        `Strings can be compiled into code, so a DOM XSS sink that reaches eval, setTimeout with a string, or a template engine that compiles at runtime becomes code execution.${evalDir.name === "default-src" ? " It applies through default-src because there is no script-src." : ""} Many older frameworks needed this; most current ones do not.`,
        evalDir.name,
      );
    } else if (f.wasmUnsafeEval) {
      add(
        "eval-wasm",
        "info",
        "'wasm-unsafe-eval' allows WebAssembly only",
        "WebAssembly modules can be compiled, while JavaScript eval() and new Function() stay blocked. That is the narrow keyword to use when a page needs WebAssembly.",
        evalDir.name,
      );
    }
  } else if (elem) {
    add(
      "eval-unrestricted",
      "medium",
      "eval is not restricted",
      "Only script-src and default-src govern eval() and new Function(). This policy sets script-src-elem but neither of those, so string compilation is allowed.",
      "script-src",
    );
  }

  const hashesDir = [elem, attrDir, byName.get("script-src") ?? null].find((d) => d && listFacts(d.tokens).unsafeHashes);
  if (hashesDir) {
    add(
      "unsafe-hashes",
      "low",
      "'unsafe-hashes' allows specific inline handlers",
      "Event handler and style attributes whose hash is listed are allowed. That is narrower than 'unsafe-inline', but an attacker who can inject markup can reuse an allowed handler on an element of their choosing, so keep the hashed handlers harmless.",
      hashesDir.name,
    );
  }

  /* ----- styles */

  const styleElem = governing(byName, "style-src-elem");
  if (!styleElem) {
    if (hasFetchDirective) {
      add(
        "style-unrestricted",
        "low",
        "Styles are not restricted",
        "Without style-src or default-src, injected style blocks and stylesheets from any host apply. CSS cannot run script, but it can restyle a page for phishing and leak attribute values, such as a token in a hidden input, through attribute selectors that each request a different background image.",
        "style-src",
      );
    }
  } else if (allowsAllInline(listFacts(styleElem.tokens), "style")) {
    add(
      "style-unsafe-inline",
      "low",
      "'unsafe-inline' allows inline styles",
      `Far less dangerous than inline script, but injected CSS can restyle the page and leak attribute values through selectors that request one background image per guess, where img-src lets those requests out. Many sites need it for style attributes; nonces or hashes on style blocks remove most of the need.${styleElem.name === "default-src" ? " It applies through default-src because there is no style-src." : ""}`,
      styleElem.name,
    );
  }

  /* ----- plugins */

  const obj = governing(byName, "object-src");
  if (!obj) {
    add(
      "object-missing",
      "medium",
      "object-src is missing and nothing falls back",
      "There is no object-src and no default-src, so object and embed can load content from any host. Browsers no longer run Flash, but these elements still embed whatever they point at, and object-src 'none' has been part of every strict policy recommendation because it closes the path for good.",
      "object-src",
    );
  } else {
    const f = listFacts(obj.tokens);
    if (f.blocksAll) {
      add("object-none", "pass", `object-src ${obj.name === "default-src" ? "inherits " : ""}'none'`, "Plugins and embedded objects are blocked.", obj.name);
    } else if (obj.name === "default-src") {
      add(
        "object-inherited",
        "low",
        "object-src inherits from default-src",
        `object-src is absent, so object and embed follow default-src (${quoteList(obj.tokens)}). Almost no page needs plugin content; object-src 'none' is the usual explicit setting.`,
        "object-src",
      );
    } else {
      add(
        "object-allows",
        "low",
        "object-src allows sources",
        `object-src permits ${quoteList(obj.tokens)}. Unless the page embeds plugin content on purpose, 'none' is the safer value.`,
        "object-src",
      );
    }
  }

  /* ----- base-uri */

  const elemFacts = elem ? listFacts(elem.tokens) : null;
  const nonceBased = !!elemFacts && (elemFacts.nonce || elemFacts.hash || elemFacts.strictDynamic);
  const base = byName.get("base-uri");
  if (!base) {
    add(
      "base-missing",
      nonceBased ? "medium" : "low",
      "base-uri is missing",
      `base-uri does not fall back to default-src, so an injected <base href="https://attacker.example/"> changes where every relative URL on the page points.${nonceBased ? " Against a nonce-based policy that is a direct bypass: a script tag with a valid nonce and a relative src keeps its nonce while loading from the attacker's host." : ""} base-uri 'none' closes it, or 'self' if the page uses a base element.`,
      "base-uri",
    );
  } else {
    const f = listFacts(base.tokens);
    const broad = f.sources.some((s) => isAnyHost(s) || s.kind === "scheme");
    if (broad) {
      add(
        "base-broad",
        "medium",
        "base-uri allows other hosts",
        `base-uri permits ${quoteList(base.tokens)}, so an injected base element can still repoint relative URLs off this origin. Use 'none' or 'self'.`,
        "base-uri",
      );
    } else {
      add("base-ok", "pass", "base-uri is restricted", `A base element can only point at ${f.blocksAll ? "nothing" : quoteList(base.tokens)}.`, "base-uri");
    }
  }

  /* ----- framing */

  const ancestors = byName.get("frame-ancestors");
  if (!ancestors) {
    if (raw.source === "meta") {
      if (!parsed.byName.has("frame-ancestors")) {
        add(
          "frame-ancestors-meta",
          "low",
          "Framing control needs a header",
          "frame-ancestors is ignored in a meta policy, so a page that relies on meta for CSP needs the Content-Security-Policy header or X-Frame-Options to stop other sites framing it.",
          "frame-ancestors",
        );
      }
    } else {
      add(
        "frame-ancestors-missing",
        "low",
        "frame-ancestors is missing",
        "frame-ancestors does not fall back to default-src. Without it, any site can load this page in a frame and overlay it to trick a visitor into clicking (clickjacking), unless an X-Frame-Options header covers it. Where both exist, frame-ancestors wins.",
        "frame-ancestors",
      );
    }
  } else {
    const f = listFacts(ancestors.tokens);
    const anyHost = f.sources.some((s) => isAnyHost(s) || (s.kind === "scheme" && (s.scheme === "https" || s.scheme === "http")));
    if (anyHost) {
      add(
        "frame-ancestors-broad",
        "medium",
        "frame-ancestors allows any site",
        `frame-ancestors ${ancestors.tokens.join(" ")} lets any site frame this page, which is no clickjacking protection at all.`,
        "frame-ancestors",
      );
    } else {
      add(
        "frame-ancestors-ok",
        "pass",
        f.blocksAll ? "frame-ancestors 'none': no site can frame this page" : "frame-ancestors restricts framing",
        f.blocksAll
          ? "Not even this origin can frame the page. If the site frames itself anywhere, use 'self'."
          : `Only ${quoteList(ancestors.tokens)} may frame this page.`,
        "frame-ancestors",
      );
    }
  }

  if (!byName.has("form-action")) {
    add(
      "form-action-missing",
      "info",
      "form-action is not set",
      "form-action does not fall back to default-src, so forms may submit anywhere. An injected form pointed at another host sends whatever the visitor types, and a password manager may fill it for them. form-action 'self' is a common addition.",
      "form-action",
    );
  }

  /* ----- types with no rule at all */

  if (!byName.has("default-src") && hasFetchDirective) {
    const open = ROW_DEFS.filter((r) => r.key in FALLBACKS && !governing(byName, r.key)).map((r) => r.key);
    if (open.length > 0) {
      add(
        "default-missing",
        "low",
        "No default-src",
        `Without default-src, every fetch type the policy does not name is unrestricted. Here that is ${quoteList(open, 12)}. default-src 'self' or 'none' gives every unnamed type a safe starting point.`,
        "default-src",
      );
    }
  }

  /* ----- cleartext sources outside scripts */

  for (const d of directives) {
    if (!SOURCE_LIST_DIRECTIVES.has(d.name) || d.name.startsWith("script-src") || d.name === "default-src") continue;
    const clear = listFacts(d.tokens).sources.filter(
      (s) => (s.kind === "host" && (s.scheme === "http" || s.scheme === "ws")) || (s.kind === "scheme" && (s.scheme === "http" || s.scheme === "ws")),
    );
    if (clear.length > 0) {
      add(
        `cleartext-${d.name}`,
        "low",
        `Cleartext sources in ${d.name}`,
        `${quoteList(clear.map((s) => s.token))} can be fetched over plain HTTP, where anyone on the network path can read or change it. On an HTTPS page browsers block or upgrade most mixed content anyway, and in CSP3 an http source also matches its https form, so the https spelling costs nothing.`,
        d.name,
      );
    }
  }
  if (byName.has("default-src")) {
    const d = byName.get("default-src")!;
    const clear = listFacts(d.tokens).sources.filter((s) => s.kind === "host" && (s.scheme === "http" || s.scheme === "ws"));
    if (clear.length > 0 && elem?.name !== "default-src") {
      add(
        "cleartext-default-src",
        "low",
        "Cleartext sources in default-src",
        `${quoteList(clear.map((s) => s.token))} can be fetched over plain HTTP for every type that falls back to default-src. Writing https:// matches the same secure hosts and nothing weaker.`,
        "default-src",
      );
    }
  }

  /* ----- reporting */

  const reportUri = byName.get("report-uri");
  const reportTo = byName.get("report-to");
  if (!reportUri && !reportTo && raw.disposition === "enforce") {
    add(
      "report-none",
      "info",
      "No reporting",
      "Violations are blocked silently. Without report-to or report-uri you will not hear when the policy breaks part of the site or stops an attack in progress.",
    );
  }
  if (reportTo) {
    const first = reportTo.tokens[0] ?? "";
    if (reportTo.tokens.length === 0) {
      add("report-to-empty", "low", "report-to has no endpoint name", "report-to needs the name of an endpoint, so no reports are sent.", "report-to");
    } else if (/^[a-z][a-z0-9+.\-]*:\/\//i.test(first) || first.startsWith("/")) {
      add(
        "report-to-url",
        "medium",
        "report-to takes an endpoint name, not a URL",
        `report-to ${first} will not send anything. Its value is a name defined by the Reporting-Endpoints header, for example Reporting-Endpoints: csp="${first.startsWith("/") ? "https://example.com" + first : first}" with report-to csp. URLs go in report-uri.`,
        "report-to",
      );
    } else {
      add(
        "report-to-ok",
        reportTo.tokens.length > 1 ? "low" : "pass",
        reportTo.tokens.length > 1 ? "report-to takes one endpoint name" : `Reports go to the "${first}" endpoint`,
        reportTo.tokens.length > 1
          ? `report-to is defined with a single endpoint name; ${quoteList(reportTo.tokens.slice(1))} is outside the grammar. Define one endpoint and point it wherever reports should go.`
          : `report-to names an endpoint that the Reporting-Endpoints response header must define, for example Reporting-Endpoints: ${first}="https://example.com/csp". If that header is missing or does not define ${first}, no reports are sent.`,
        "report-to",
      );
    }
  }
  if (reportUri) {
    if (reportUri.tokens.length === 0) {
      add("report-uri-empty", "low", "report-uri has no URL", "report-uri needs at least one URL, so no reports are sent.", "report-uri");
    } else if (!reportTo) {
      add(
        "report-uri-only",
        "info",
        "report-uri is deprecated",
        "report-uri is deprecated in CSP3 in favor of report-to, but it is still widely supported. Sending both is the usual practice: browsers that support report-to ignore report-uri when both are present.",
        "report-uri",
      );
    }
    if (reportUri.tokens.some((t) => /^http:\/\//i.test(t))) {
      add(
        "report-uri-http",
        "low",
        "Reports are sent over cleartext",
        "A report includes the page URL and the blocked resource, which can carry tokens or personal data in query strings. Send reports to an https:// endpoint.",
        "report-uri",
      );
    }
  }
  if (raw.disposition === "report") {
    add(
      "report-only",
      "info",
      "Report-only: nothing is blocked",
      "Content-Security-Policy-Report-Only reports violations and enforces none of them. It is the right way to trial a policy; it protects nobody until the same policy is sent as Content-Security-Policy.",
    );
    if (!reportUri && !reportTo) {
      add(
        "report-only-silent",
        "low",
        "Report-only with nowhere to report",
        "A report-only policy blocks nothing and, without report-uri or report-to, sends no reports either. Its only effect is console messages in each visitor's own browser.",
      );
    }
    if (byName.has("upgrade-insecure-requests")) {
      add(
        "uir-report-only",
        "info",
        "upgrade-insecure-requests does nothing here",
        "Browsers ignore upgrade-insecure-requests in a report-only policy; it only takes effect when enforced.",
        "upgrade-insecure-requests",
      );
    }
  }

  /* ----- the remaining non-source directives */

  const uir = byName.get("upgrade-insecure-requests");
  if (uir && uir.tokens.length > 0) {
    add("uir-value", "info", "upgrade-insecure-requests takes no value", `The value ${quoteList(uir.tokens)} is ignored.`, "upgrade-insecure-requests");
  }

  const sandbox = byName.get("sandbox");
  if (sandbox) {
    const flags = new Set([
      "allow-downloads",
      "allow-forms",
      "allow-modals",
      "allow-orientation-lock",
      "allow-pointer-lock",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-presentation",
      "allow-same-origin",
      "allow-scripts",
      "allow-storage-access-by-user-activation",
      "allow-top-navigation",
      "allow-top-navigation-by-user-activation",
      "allow-top-navigation-to-custom-protocols",
    ]);
    const lower = sandbox.tokens.map(asciiLower);
    const unknown = sandbox.tokens.filter((t) => !flags.has(asciiLower(t)));
    if (unknown.length > 0) {
      add("sandbox-unknown", "low", "Unknown sandbox flags", `${quoteList(unknown)} is not a sandbox flag this tool recognizes; browsers ignore flags they do not know.`, "sandbox");
    }
    if (lower.includes("allow-scripts") && lower.includes("allow-same-origin")) {
      add(
        "sandbox-weak",
        "low",
        "sandbox keeps both scripts and the origin",
        "allow-scripts together with allow-same-origin gives the document back script execution and its real origin, which removes most of what the sandbox is for.",
        "sandbox",
      );
    } else {
      add(
        "sandbox-on",
        "info",
        "The document is sandboxed",
        `sandbox applies iframe-style restrictions to this response itself${lower.includes("allow-same-origin") ? "" : ": it gets an opaque origin, so it cannot read this origin's cookies or storage"}${lower.includes("allow-scripts") ? "" : ", and no script runs"}.`,
        "sandbox",
      );
    }
  }

  const rtt = byName.get("require-trusted-types-for");
  if (rtt) {
    if (rtt.tokens.length === 1 && asciiLower(rtt.tokens[0]) === "'script'") {
      add(
        "trusted-types-on",
        "pass",
        "Trusted Types are enforced",
        "DOM XSS sinks such as innerHTML and eval only accept values produced by a named Trusted Types policy, so a string from an attacker cannot reach them by accident.",
        "require-trusted-types-for",
      );
    } else {
      add(
        "trusted-types-value",
        "low",
        "require-trusted-types-for takes 'script'",
        `The only defined value is 'script'. ${rtt.tokens.length ? quoteList(rtt.tokens) : "An empty value"} enforces nothing.`,
        "require-trusted-types-for",
      );
    }
  }

  /* ----- rows, normalized text, missing directives */

  const rows = ROW_DEFS.map((def) => buildRow(def, byName, raw.source, nonceBased));
  const normalized = directives.map((d) => [d.name, ...d.tokens].join(" ")).join(";\n");

  const added: string[] = [];
  if (!byName.has("object-src") && !(obj && listFacts(obj.tokens).blocksAll)) added.push("object-src 'none'");
  if (!byName.has("base-uri")) added.push("base-uri 'none'");
  if (!byName.has("frame-ancestors") && raw.source !== "meta") added.push("frame-ancestors 'self'");
  const hardened = added.length ? [normalized, ...added].filter((s) => s !== "").join(";\n") : null;

  return {
    label: raw.label,
    source: raw.source,
    disposition: raw.disposition,
    directives,
    rows,
    findings: sortFindings(findings),
    script: scriptVerdict(byName),
    normalized,
    added,
    hardened,
  };
}

/* ----------------------------------------------------------- top level */

export interface CspReport {
  extraction: Extraction;
  policies: PolicyAnalysis[];
  /**
   * Script protection across every enforced policy. A script must pass all
   * of them, so the combined level is at least the strongest single one.
   */
  combined: ScriptVerdict | null;
}

export function analyzeCsp(input: string): CspReport {
  const extraction = extractPolicies(input);
  const policies = extraction.policies.map(analyzePolicy);
  const enforced = policies.filter((p) => p.disposition === "enforce");
  let combined: ScriptVerdict | null = null;
  for (const p of enforced) {
    if (!combined || SCRIPT_LEVEL_RANK[p.script.level] > SCRIPT_LEVEL_RANK[combined.level]) combined = p.script;
  }
  return { extraction, policies, combined };
}
