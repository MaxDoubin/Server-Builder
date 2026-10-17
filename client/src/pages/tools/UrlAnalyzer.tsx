/**
 * URL analyzer.
 *
 * Reads a URL two ways. The literal view follows the RFC 3986 grammar and
 * shows the text as typed. The parsed view is what the WHATWG URL parser
 * produces, the one browsers use: it lowercases hosts, converts IDN labels
 * to punycode, strips tabs and newlines, reads backslashes as slashes,
 * decodes percent-encoded hosts and resolves dot segments. The places where
 * the two views disagree are where most URL tricks live.
 *
 * Percent-decoding runs one layer at a time so double and triple encoding
 * show every step. Punycode labels are decoded per RFC 3492. Nothing here
 * fetches anything: the URL constructor only parses text.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

type Severity = "high" | "medium" | "low" | "info";

interface Finding {
  severity: Severity;
  text: string;
}

interface Split {
  scheme: string | null;
  authority: string | null;
  userinfo: string | null;
  host: string | null;
  port: string | null;
  path: string;
  query: string | null;
  fragment: string | null;
}

interface ParamInfo {
  id: number;
  rawKey: string;
  rawValue: string | null;
  key: string;
  value: string | null;
  keyChain: string[];
  valueChain: string[];
  flags: Finding[];
}

interface LabelInfo {
  ascii: string;
  unicode: string;
  scripts: string[];
  error: string | null;
}

type HostKind = "none" | "domain" | "ipv4" | "ipv4-numeric" | "ipv6";

interface Analysis {
  input: string;
  assumed: boolean;
  candidate: string;
  literal: Split;
  parsed: URL | null;
  parseError: string | null;
  hostKind: HostKind;
  labels: LabelInfo[];
  unicodeHost: string;
  pathChain: string[];
  pathSegments: Array<{ raw: string; decoded: string }>;
  fragmentChain: string[];
  params: ParamInfo[];
  findings: Finding[];
}

interface EditRow {
  id: number;
  key: string;
  value: string;
  hasValue: boolean;
}

interface EditState {
  source: string;
  scheme: string;
  host: string;
  port: string;
  path: string;
  fragment: string;
  rows: EditRow[];
}

const EMPTY_EDIT: EditState = {
  source: "",
  scheme: "",
  host: "",
  port: "",
  path: "",
  fragment: "",
  rows: [],
};

const EXAMPLES: Array<{ label: string; value: string }> = [
  {
    label: "Redirect",
    value:
      "https://login.example.com:8443/auth/callback?next=https%3A%2F%2Fevil.example%2Fphish%3Fu%3D1&session=abc+def#token=xyz",
  },
  {
    label: "Double encoded",
    value: "https://shop.example.org/search/%25252e%25252e%25252fetc?q=%2541%2542&cat=a%2Bb&cat=2",
  },
  { label: "IDN", value: "https://xn--pple-43d.com/account/verify?id=1" },
  { label: "Backslash", value: "https://bank.example\\@attacker.example/login" },
  { label: "Numeric IP", value: "http://0x7f.1/admin?cb=%2e%2e" },
];

const KNOWN_SCHEMES = new Set([
  "http", "https", "ftp", "ftps", "ws", "wss", "file", "mailto", "tel", "sms",
  "data", "javascript", "vbscript", "blob", "about", "ssh", "smb", "ldap", "git", "irc",
]);

const DEFAULT_PORTS: Record<string, string> = {
  http: "80",
  https: "443",
  ftp: "21",
  ws: "80",
  wss: "443",
};

const REDIRECT_KEYS =
  /^(?:url|uri|redirect(?:_?uri)?|return(?:_?to|url)?|next|dest|destination|continue|callback|goto|target|rurl|out|forward|image_?url|link)$/i;

/* RFC 3986 Appendix B, the regular expression for splitting a URI reference. */
const RFC3986 = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/;

/*
  Characters that browsers drop or treat as invisible, escaped in every
  displayed string so a decoded value cannot visually disguise itself.
*/
const INVISIBLE =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufe00-\ufe0f]|[\u{e0000}-\u{e007f}]|[\u{e0100}-\u{e01ef}]/gu;

/*
  Visually confusable characters mapped to the ASCII they imitate. A subset
  of the Unicode confusables list, covering Cyrillic, Greek, Latin variants
  and punctuation. Fullwidth forms are handled by range.
*/
const LOOKALIKE: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c",
  "\u0443": "y", "\u0445": "x", "\u0455": "s", "\u0456": "i", "\u0458": "j",
  "\u04bb": "h", "\u0501": "d", "\u04cf": "l",
  "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041a": "K", "\u041c": "M",
  "\u041d": "H", "\u041e": "O", "\u0420": "P", "\u0421": "C", "\u0422": "T",
  "\u0425": "X", "\u0405": "S", "\u0406": "I", "\u0408": "J",
  "\u03bf": "o", "\u03b1": "a", "\u03bd": "v", "\u03c1": "p", "\u03b9": "i",
  "\u03ba": "k", "\u03b5": "e", "\u03c5": "u", "\u03c7": "x",
  "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z", "\u0397": "H",
  "\u0399": "I", "\u039a": "K", "\u039c": "M", "\u039d": "N", "\u039f": "O",
  "\u03a1": "P", "\u03a4": "T", "\u03a5": "Y", "\u03a7": "X",
  "\u0131": "i", "\u017f": "s", "\u0261": "g", "\u01c0": "l", "\u2113": "l",
  "\u2134": "o", "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-",
  "\u2212": "-", "\u2044": "/", "\u2215": "/", "\u2024": ".", "\ufe52": ".",
  "\u2018": "'", "\u2019": "'", "\u02bc": "'", "\u201c": "\"", "\u201d": "\"",
  "\u037e": ";", "\u2236": ":",
};

const SCRIPTS: Array<[string, RegExp]> = [
  ["Latin", /\p{Script=Latin}/u],
  ["Greek", /\p{Script=Greek}/u],
  ["Cyrillic", /\p{Script=Cyrillic}/u],
  ["Armenian", /\p{Script=Armenian}/u],
  ["Hebrew", /\p{Script=Hebrew}/u],
  ["Arabic", /\p{Script=Arabic}/u],
  ["Devanagari", /\p{Script=Devanagari}/u],
  ["Thai", /\p{Script=Thai}/u],
  ["Han", /\p{Script=Han}/u],
  ["Hiragana", /\p{Script=Hiragana}/u],
  ["Katakana", /\p{Script=Katakana}/u],
  ["Hangul", /\p{Script=Hangul}/u],
];

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]",
  medium: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  low: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]",
  info: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]",
};

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

/* ---------- Escaping and display helpers ---------- */

function escapeVisible(s: string): string {
  return s.replace(INVISIBLE, (ch) => `\\u{${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`);
}

function codePoints(s: string): string {
  return Array.from(s)
    .map((c) => `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

function skeleton(s: string): string {
  let out = "";
  for (const ch of s) {
    const mapped = LOOKALIKE[ch] as string | undefined;
    if (mapped !== undefined) {
      out += mapped;
    } else {
      const cp = ch.codePointAt(0) ?? 0;
      out += cp >= 0xff01 && cp <= 0xff5e ? String.fromCharCode(cp - 0xfee0) : ch;
    }
  }
  return out;
}

/* ---------- Punycode (RFC 3492) decoding ---------- */

const PUNY_BASE = 36;
const PUNY_TMIN = 1;
const PUNY_TMAX = 26;
const PUNY_SKEW = 38;
const PUNY_DAMP = 700;

function punyAdapt(delta: number, points: number, first: boolean): number {
  let d = first ? Math.floor(delta / PUNY_DAMP) : Math.floor(delta / 2);
  d += Math.floor(d / points);
  let k = 0;
  while (d > Math.floor(((PUNY_BASE - PUNY_TMIN) * PUNY_TMAX) / 2)) {
    d = Math.floor(d / (PUNY_BASE - PUNY_TMIN));
    k += PUNY_BASE;
  }
  return k + Math.floor(((PUNY_BASE - PUNY_TMIN + 1) * d) / (d + PUNY_SKEW));
}

function punyDigit(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 22;
  if (c >= 0x41 && c <= 0x5a) return c - 0x41;
  if (c >= 0x61 && c <= 0x7a) return c - 0x61;
  return PUNY_BASE;
}

/** Decodes the part of a label after "xn--". Throws on malformed input. */
export function punycodeDecode(input: string): string {
  const out: number[] = [];
  const sep = input.lastIndexOf("-");
  const basicLen = sep > 0 ? sep : 0;
  for (let j = 0; j < basicLen; j++) {
    const c = input.charCodeAt(j);
    if (c >= 0x80) throw new Error("non-basic code point before delimiter");
    out.push(c);
  }
  let n = 128;
  let i = 0;
  let bias = 72;
  let p = sep >= 0 ? sep + 1 : 0;
  while (p < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = PUNY_BASE; ; k += PUNY_BASE) {
      if (p >= input.length) throw new Error("truncated punycode");
      const digit = punyDigit(input.charCodeAt(p++));
      if (digit >= PUNY_BASE) throw new Error("invalid punycode digit");
      i += digit * w;
      if (i > 0x7fffffff) throw new Error("punycode overflow");
      const t = k <= bias ? PUNY_TMIN : k >= bias + PUNY_TMAX ? PUNY_TMAX : k - bias;
      if (digit < t) break;
      w *= PUNY_BASE - t;
    }
    const len = out.length + 1;
    bias = punyAdapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    if (n > 0x10ffff) throw new Error("code point out of range");
    i %= len;
    out.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...out);
}

/* ---------- Percent-decoding, one layer at a time ---------- */

const PCT_RUN = /(?:%[0-9A-Fa-f]{2})+/g;

function decodeOnce(s: string): string {
  return s.replace(PCT_RUN, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}

/** Repeats decodeOnce until nothing changes, keeping every intermediate layer. */
function decodeFully(s: string, max = 8): { value: string; chain: string[] } {
  const chain = [s];
  let cur = s;
  for (let i = 0; i < max; i++) {
    const next = decodeOnce(cur);
    if (next === cur) break;
    chain.push(next);
    cur = next;
  }
  return { value: cur, chain };
}

function encodeLoose(s: string): string {
  try {
    return encodeURIComponent(s);
  } catch {
    return s;
  }
}

/* ---------- Parsing ---------- */

function scriptsOf(s: string): string[] {
  const found: string[] = [];
  for (const ch of s) {
    if (/[\p{Script=Common}\p{Script=Inherited}]/u.test(ch)) continue;
    const hit = SCRIPTS.find(([, re]) => re.test(ch));
    const name = hit ? hit[0] : "Other";
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

function splitLiteral(text: string): Split {
  const m = RFC3986.exec(text);
  const authority = m?.[2];
  const scheme = m?.[1] ?? null;
  const path = m?.[3] ?? "";
  const query = m?.[4] ?? null;
  const fragment = m?.[5] ?? null;
  let userinfo: string | null = null;
  let host: string | null = null;
  let port: string | null = null;
  if (authority !== undefined) {
    const at = authority.lastIndexOf("@");
    const hostport = at >= 0 ? authority.slice(at + 1) : authority;
    if (at >= 0) userinfo = authority.slice(0, at);
    if (hostport.startsWith("[")) {
      const close = hostport.indexOf("]");
      host = close >= 0 ? hostport.slice(0, close + 1) : hostport;
      const rest = close >= 0 ? hostport.slice(close + 1) : "";
      if (rest.startsWith(":")) port = rest.slice(1);
    } else {
      const colon = hostport.lastIndexOf(":");
      if (colon >= 0) {
        host = hostport.slice(0, colon);
        port = hostport.slice(colon + 1);
      } else {
        host = hostport;
      }
    }
  }
  return {
    scheme,
    authority: authority ?? null,
    userinfo,
    host,
    port,
    path,
    query,
    fragment,
  };
}

function classifyHost(raw: string, normalized: string): HostKind {
  if (raw === "" && normalized === "") return "none";
  if (raw.startsWith("[") || normalized.startsWith("[")) return "ipv6";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw) ? "ipv4" : "ipv4-numeric";
  }
  return "domain";
}

function labelsOf(ascii: string): LabelInfo[] {
  return ascii
    .split(".")
    .filter((l) => l !== "")
    .map((label) => {
      if (label.toLowerCase().startsWith("xn--")) {
        try {
          const unicode = punycodeDecode(label.slice(4));
          return { ascii: label, unicode, scripts: scriptsOf(unicode), error: null };
        } catch {
          return { ascii: label, unicode: label, scripts: [], error: "not valid punycode" };
        }
      }
      return { ascii: label, unicode: label, scripts: scriptsOf(label), error: null };
    });
}

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function nestedHost(value: string): string | null {
  try {
    const t = value.trim();
    const u = new URL(t.startsWith("//") ? `https:${t}` : t);
    return u.hostname || null;
  } catch {
    return null;
  }
}

function parseParams(query: string | null): ParamInfo[] {
  if (!query) return [];
  return query.split("&").map((seg, id) => {
    const eq = seg.indexOf("=");
    const rawKey = eq >= 0 ? seg.slice(0, eq) : seg;
    const rawValue = eq >= 0 ? seg.slice(eq + 1) : null;
    const k = decodeFully(rawKey.replace(/\+/g, " "));
    const v = rawValue === null ? null : decodeFully(rawValue.replace(/\+/g, " "));
    return {
      id,
      rawKey,
      rawValue,
      key: k.value,
      value: v ? v.value : null,
      keyChain: k.chain,
      valueChain: v ? v.chain : [],
      flags: [],
    };
  });
}

function paramFlags(p: ParamInfo, all: ParamInfo[]): Finding[] {
  const flags: Finding[] = [];
  const depth = Math.max(p.keyChain.length, p.valueChain.length) - 1;
  if (depth >= 2) flags.push({ severity: "medium", text: `Double-encoded, ${depth} layers` });
  const value = p.value ?? "";
  if (/(?:^|[a-z][a-z0-9+.-]*:)\/\//i.test(value.trim())) {
    const host = nestedHost(value);
    flags.push({
      severity: "medium",
      text: host ? `Embedded URL, host ${host}` : "Embedded URL",
    });
  }
  if (REDIRECT_KEYS.test(p.key)) {
    flags.push({ severity: "low", text: "Redirect-style parameter name" });
  }
  if (/javascript:|vbscript:/i.test(value)) {
    flags.push({ severity: "high", text: "Script URI in value" });
  } else if (/[<>"']/.test(value)) {
    flags.push({ severity: "low", text: "Markup or quote characters in value" });
  }
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value)) {
    flags.push({ severity: "medium", text: "Traversal sequence in value" });
  }
  if (all.filter((o) => o.key === p.key).length > 1) {
    flags.push({ severity: "low", text: "Duplicate key" });
  }
  if (/%(?![0-9A-Fa-f]{2})/.test(p.key) || /%(?![0-9A-Fa-f]{2})/.test(value)) {
    flags.push({ severity: "low", text: "Stray percent sign" });
  }
  if (p.rawKey.includes("+") || (p.rawValue ?? "").includes("+")) {
    flags.push({ severity: "info", text: "Plus decoded as space" });
  }
  return flags;
}

function analyze(trimmed: string): Analysis {
  const first = splitLiteral(trimmed);
  const assumed = first.scheme === null;
  const candidate = assumed
    ? trimmed.startsWith("//")
      ? `https:${trimmed}`
      : `https://${trimmed}`
    : trimmed;
  const literal = splitLiteral(candidate);

  let parsed: URL | null = null;
  let parseError: string | null = null;
  try {
    parsed = new URL(candidate);
  } catch (err) {
    parseError = err instanceof Error ? err.message : "Invalid URL";
  }

  const rawHost = literal.host ?? "";
  const hostKind = classifyHost(rawHost, parsed?.hostname ?? "");
  const labels = labelsOf(parsed ? parsed.hostname : rawHost);
  const unicodeHost = labels.map((l) => l.unicode).join(".");
  const scheme = (literal.scheme ?? "").toLowerCase();
  const pathDecoded = decodeFully(literal.path);
  const pathSegments = literal.path.split("/").map((seg) => ({
    raw: seg,
    decoded: decodeFully(seg).value,
  }));
  const fragmentChain = decodeFully(literal.fragment ?? "").chain;
  const params = parseParams(literal.query).map((p, _i, all) => ({
    ...p,
    flags: paramFlags(p, all),
  }));

  const findings: Finding[] = [];
  const add = (severity: Severity, text: string) => findings.push({ severity, text });

  if (parseError) add("high", `Parser rejected the URL: ${parseError}.`);
  if (assumed) add("low", "No scheme given. Parsed as https.");
  if (/[\t\n\r]/.test(trimmed)) {
    add("medium", "Tab or newline inside the URL. The parser strips these before reading.");
  }
  if (literal.authority !== null && literal.authority.includes("\\")) {
    add(
      "high",
      "Backslash in the authority. Browsers read it as a slash, so the host may not be the text before it.",
    );
  } else if (trimmed.includes("\\")) {
    add("medium", "Backslash in the path or query. Browsers read it as a slash.");
  }
  if (literal.userinfo !== null) {
    add(
      literal.userinfo.includes(":") ? "high" : "medium",
      literal.userinfo.includes(":")
        ? "Credentials in the URL (user:password@). Text before @ is not the host."
        : "User name in the URL. Text before @ is not the host.",
    );
  }
  if (!assumed) {
    if (scheme === "javascript" || scheme === "vbscript") {
      add("high", `${scheme}: scheme runs script when opened.`);
    } else if (scheme === "data") {
      add("medium", "data: URL embeds its own payload.");
    } else if (scheme === "file") {
      add("medium", "file: URL points at the local filesystem.");
    } else if (scheme === "http") {
      add("low", "Cleartext http. No transport encryption.");
    } else if (!KNOWN_SCHEMES.has(scheme)) {
      add("low", `Unrecognized scheme "${scheme}". If this is host:port, add a scheme.`);
    }
  }
  const port = literal.port;
  if (port !== null && port !== "") {
    if (!/^\d+$/.test(port)) add("high", `Non-numeric port "${port}".`);
    else if (Number(port) > 65535) add("high", "Port above 65535.");
    else if (DEFAULT_PORTS[scheme] !== undefined && String(Number(port)) !== DEFAULT_PORTS[scheme]) {
      add("low", `Non-default port ${port} for ${scheme}.`);
    }
  }
  if (/%[0-9A-Fa-f]{2}/.test(rawHost)) {
    add("medium", "Percent-encoded host. The parser decodes it, so the visible text is not the destination.");
  }
  if (/[^\x00-\x7f]/.test(rawHost)) add("info", "Non-ASCII host. The parser converts it to punycode.");
  if (hostKind === "ipv4-numeric") {
    add("high", `Numeric host "${rawHost}" normalizes to ${parsed?.hostname ?? "an address"}.`);
  }
  if ((hostKind === "ipv4" || hostKind === "ipv4-numeric") && isPrivateIPv4(parsed?.hostname ?? "")) {
    add("medium", "Loopback, private or link-local address.");
  }
  if (hostKind === "ipv6") add("info", "IPv6 literal host.");
  if (rawHost.endsWith(".")) add("info", "Trailing dot on the host. Same host, fully qualified.");
  if (labels.length > 5) {
    add("low", `${labels.length} host labels. Long subdomain chains are common in lookalike hosts.`);
  }
  for (const l of labels) {
    if (l.ascii.length > 63) add("medium", `Label ${l.ascii.slice(0, 16)}... is longer than 63 characters.`);
    if (l.error) add("medium", `Label ${l.ascii} is ${l.error}.`);
    if (l.ascii.toLowerCase().startsWith("xn--") && !l.error) {
      add("info", `Punycode label ${l.ascii} decodes to ${l.unicode}.`);
    }
    if (l.scripts.includes("Latin") && (l.scripts.includes("Cyrillic") || l.scripts.includes("Greek") || l.scripts.includes("Armenian"))) {
      add("high", `Label ${l.unicode} mixes Latin with ${l.scripts.filter((s) => s !== "Latin").join(", ")} (homograph pattern).`);
    } else if (l.scripts.length > 1) {
      add("medium", `Label ${l.unicode} mixes scripts: ${l.scripts.join(", ")}.`);
    }
    const sk = skeleton(l.unicode);
    if (sk !== l.unicode && /^[\x00-\x7f]+$/.test(sk)) {
      add("high", `Label ${l.ascii} imitates "${sk}" with lookalike characters.`);
    }
  }
  if (pathDecoded.chain.length > 2) {
    add("medium", `Path double-encoded, ${pathDecoded.chain.length - 1} layers.`);
  }
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(pathDecoded.value)) {
    add("medium", "Dot-dot segment after decoding. Path traversal pattern.");
  }
  if (parsed && parsed.pathname !== literal.path && literal.path !== "") {
    add("info", `Parser normalizes the path to ${escapeVisible(parsed.pathname)}.`);
  }
  if (literal.fragment !== null) {
    add("info", "Fragment stays in the browser. It is never sent to the server.");
  }
  for (const p of params) {
    for (const f of p.flags) add(f.severity, `Parameter ${escapeVisible(p.key)}: ${f.text}.`);
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    input: trimmed,
    assumed,
    candidate,
    literal,
    parsed,
    parseError,
    hostKind,
    labels,
    unicodeHost,
    pathChain: pathDecoded.chain,
    pathSegments,
    fragmentChain,
    params,
    findings,
  };
}

function baseState(a: Analysis): EditState {
  return {
    source: a.input,
    scheme: a.assumed ? "https" : (a.literal.scheme ?? ""),
    host: a.literal.host ?? "",
    port: a.literal.port ?? "",
    path: a.literal.path,
    fragment: a.literal.fragment ?? "",
    rows: a.params.map((p) => ({
      id: p.id,
      key: p.key,
      value: p.value ?? "",
      hasValue: p.value !== null,
    })),
  };
}

/*
  Rebuilds the URL from the edited parts. An untouched key or value keeps
  its original bytes, so only what the user changed is re-encoded.
*/
function rebuild(work: EditState, a: Analysis): string {
  const userinfo = a.literal.userinfo;
  let out = work.scheme ? `${work.scheme}:` : "";
  if (work.host !== "" || userinfo !== null) {
    out += "//";
    if (userinfo !== null) out += `${userinfo}@`;
    out += work.host;
    if (work.port !== "") out += `:${work.port}`;
  }
  out += work.path;
  const parts = work.rows.map((row) => {
    const info = a.params.find((p) => p.id === row.id);
    const key = info && info.key === row.key ? info.rawKey : encodeLoose(row.key);
    if (!row.hasValue) return key;
    const value =
      info && info.value === row.value ? (info.rawValue ?? "") : encodeLoose(row.value);
    return `${key}=${value}`;
  });
  if (parts.length > 0) out += `?${parts.join("&")}`;
  if (work.fragment !== "") out += `#${work.fragment}`;
  return out;
}

function checkRebuilt(url: string): { ok: boolean; text: string } {
  if (url === "") return { ok: false, text: "" };
  try {
    return { ok: true, text: new URL(url).href };
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : "Invalid URL" };
  }
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/* ---------- Presentation helpers ---------- */

const LABEL_CLASS =
  "mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]";
const KICKER_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "w-full min-h-[44px] min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";

function PartRow({ label, typed, parsed }: { label: string; typed: string; parsed: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-t border-[hsl(var(--brand-iron)/0.6)] py-2 sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
      <div className={KICKER_CLASS}>{label}</div>
      <div className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
        <span className="text-[hsl(var(--brand-ash))] sm:hidden">typed: </span>
        {typed}
      </div>
      <div className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
        <span className="text-[hsl(var(--brand-ash))] sm:hidden">parsed: </span>
        {parsed}
      </div>
    </div>
  );
}

function ChainLine({ chain }: { chain: string[] }) {
  if (chain.length < 2) return null;
  return (
    <span className="block break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
      {chain.map((step) => escapeVisible(step)).join(" \u2192 ")}
    </span>
  );
}

/* ---------- Component ---------- */

export function UrlAnalyzer() {
  const [input, setInput] = useState(EXAMPLES[0]?.value ?? "");
  const [edit, setEdit] = useState<EditState | null>(null);
  const trimmed = input.trim();

  const analysis = useMemo(() => (trimmed ? analyze(trimmed) : null), [trimmed]);
  const base = useMemo(() => (analysis ? baseState(analysis) : EMPTY_EDIT), [analysis]);
  const work = edit && edit.source === trimmed ? edit : base;
  const rebuilt = analysis ? rebuild(work, analysis) : "";
  const check = useMemo(() => checkRebuilt(rebuilt), [rebuilt]);

  const counts = analysis ? countBySeverity(analysis.findings) : null;
  const summary = !analysis
    ? "Paste a URL to analyze it."
    : `${analysis.findings.length} ${analysis.findings.length === 1 ? "finding" : "findings"}. ${counts?.high ?? 0} high, ${counts?.medium ?? 0} medium.`;

  function commit(next: EditState) {
    setEdit({ ...next, source: trimmed });
  }

  function patchRow(id: number, patch: Partial<EditRow>) {
    commit({ ...work, rows: work.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  function removeRow(id: number) {
    commit({ ...work, rows: work.rows.filter((r) => r.id !== id) });
  }

  function addRow() {
    const originals = analysis ? analysis.params.length : 0;
    const nextId = Math.max(originals, work.rows.reduce((m, r) => Math.max(m, r.id + 1), 0));
    commit({
      ...work,
      rows: [...work.rows, { id: nextId, key: "", value: "", hasValue: true }],
    });
  }

  return (
    <ToolShell slug="url-analyzer">
      <p
        role="status"
        aria-live="polite"
        data-testid="text-summary"
        className="sr-only"
      >
        {summary}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="URL">
          <label htmlFor="url-input" className={LABEL_CLASS}>
            Paste a URL
          </label>
          <textarea
            id="url-input"
            data-testid="input-url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="https://user@example.com:443/path?x=1#frag"
            className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={KICKER_CLASS}>Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setInput(ex.value);
                  setEdit(null);
                }}
                className={CHIP_CLASS}
              >
                {ex.label}
              </button>
            ))}
          </div>
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Parsing only. No request is sent.
          </p>
          {analysis?.parseError ? (
            <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-danger))]">
              WHATWG parser: {analysis.parseError}
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Findings">
          {!analysis ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              Findings appear once a URL is pasted.
            </p>
          ) : analysis.findings.length === 0 ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              No flags raised.
            </p>
          ) : (
            <>
              <p className="mb-4 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                {counts?.high ?? 0} high {"\u00b7"} {counts?.medium ?? 0} medium {"\u00b7"} {counts?.low ?? 0} low {"\u00b7"} {counts?.info ?? 0} info
              </p>
              <ul data-testid="output-findings" className="space-y-2">
                {analysis.findings.map((f, i) => (
                  <li
                    key={`${f.severity}-${i}`}
                    className="flex min-w-0 items-start gap-3 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] ${SEVERITY_STYLE[f.severity]}`}
                    >
                      {f.severity}
                    </span>
                    <span className="min-w-0 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ToolPanel>

        <ToolPanel title="Parts">
          {!analysis ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No URL.</p>
          ) : (
            <div data-testid="output-parts">
              <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)]">
                <span className={KICKER_CLASS} />
                <span className={KICKER_CLASS}>As typed (RFC 3986)</span>
                <span className={KICKER_CLASS}>Parsed (WHATWG)</span>
              </div>
              <PartRow
                label="Scheme"
                typed={
                  analysis.assumed
                    ? `none, assumed ${analysis.literal.scheme ?? "https"}`
                    : (analysis.literal.scheme ?? "none")
                }
                parsed={analysis.parsed ? analysis.parsed.protocol.replace(/:$/, "") : "invalid"}
              />
              <PartRow
                label="Userinfo"
                typed={analysis.literal.userinfo !== null ? escapeVisible(analysis.literal.userinfo) : "none"}
                parsed={
                  analysis.parsed && analysis.parsed.username
                    ? `${analysis.parsed.username}${analysis.parsed.password ? ":" + analysis.parsed.password : ""}`
                    : "none"
                }
              />
              <PartRow
                label="Host"
                typed={escapeVisible(analysis.literal.host ?? "") || "none"}
                parsed={analysis.parsed ? analysis.parsed.hostname || "none" : "invalid"}
              />
              <PartRow
                label="Port"
                typed={
                  analysis.literal.port === null
                    ? "none"
                    : analysis.literal.port === ""
                      ? "empty"
                      : analysis.literal.port
                }
                parsed={
                  analysis.parsed
                    ? analysis.parsed.port || "default or none"
                    : "invalid"
                }
              />
              <PartRow
                label="Path"
                typed={escapeVisible(analysis.literal.path) || "(empty)"}
                parsed={analysis.parsed ? escapeVisible(analysis.parsed.pathname) : "invalid"}
              />
              <PartRow
                label="Query"
                typed={analysis.literal.query !== null ? escapeVisible(analysis.literal.query) : "none"}
                parsed={analysis.parsed && analysis.parsed.search ? escapeVisible(analysis.parsed.search.slice(1)) : "none"}
              />
              <PartRow
                label="Fragment"
                typed={analysis.literal.fragment !== null ? escapeVisible(analysis.literal.fragment) : "none"}
                parsed={analysis.parsed && analysis.parsed.hash ? escapeVisible(analysis.parsed.hash.slice(1)) : "none"}
              />
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Host">
          {!analysis ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No host.</p>
          ) : (
            <div data-testid="output-host" className="space-y-4">
              <dl className="space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className={KICKER_CLASS}>Kind</dt>
                  <dd className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{analysis.hostKind}</dd>
                </div>
                <div className="flex min-w-0 flex-wrap justify-between gap-2">
                  <dt className={KICKER_CLASS}>Punycode host</dt>
                  <dd className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {analysis.parsed ? analysis.parsed.hostname || "none" : "invalid"}
                  </dd>
                </div>
                <div className="flex min-w-0 flex-wrap justify-between gap-2">
                  <dt className={KICKER_CLASS}>Unicode host</dt>
                  <dd className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-cyan))]">
                    {escapeVisible(analysis.unicodeHost) || "none"}
                  </dd>
                </div>
                {analysis.labels.length >= 2 ? (
                  <div className="flex min-w-0 flex-wrap justify-between gap-2">
                    <dt className={KICKER_CLASS}>Last two labels</dt>
                    <dd className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {analysis.labels
                        .slice(-2)
                        .map((l) => l.ascii)
                        .join(".")}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {analysis.labels.length > 0 ? (
                <ul className="space-y-2">
                  {analysis.labels.map((l, i) => (
                    <li
                      key={`${l.ascii}-${i}`}
                      className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                    >
                      <div className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                        {l.ascii}
                        {l.unicode !== l.ascii ? (
                          <span className="text-[hsl(var(--brand-cyan))]"> {"\u2192"} {escapeVisible(l.unicode)}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 break-words font-mono-tight text-[0.625rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                        scripts: {l.scripts.join(", ") || "none"}
                        {l.error ? ` | ${l.error}` : ""}
                      </p>
                      {l.unicode !== l.ascii ? (
                        <p className="mt-1 break-all font-mono-tight text-[0.625rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                          code points: {codePoints(l.unicode)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {skeleton(analysis.unicodeHost) !== analysis.unicodeHost ? (
                <p className="break-all font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                  skeleton: {skeleton(analysis.unicodeHost)}
                </p>
              ) : null}
              {analysis.hostKind === "ipv4" || analysis.hostKind === "ipv4-numeric" ? (
                <p className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  Dotted-quad form: {analysis.parsed?.hostname ?? "none"}
                </p>
              ) : null}
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Path and fragment">
          {!analysis ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No path.</p>
          ) : (
            <div data-testid="output-path" className="space-y-4">
              <div>
                <p className={KICKER_CLASS}>Decoded path</p>
                <p className="mt-1 break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {escapeVisible(analysis.pathChain[analysis.pathChain.length - 1] ?? "") || "(empty)"}
                </p>
                <div className="mt-2">
                  <ChainLine chain={analysis.pathChain} />
                </div>
              </div>
              {analysis.pathSegments.some((s) => s.raw !== s.decoded) ? (
                <ul className="space-y-1">
                  {analysis.pathSegments
                    .filter((s) => s.raw !== s.decoded)
                    .slice(0, 24)
                    .map((s, i) => (
                      <li key={`${s.raw}-${i}`} className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {escapeVisible(s.raw)} {"\u2192"} {escapeVisible(s.decoded)}
                      </li>
                    ))}
                </ul>
              ) : null}
              <div>
                <p className={KICKER_CLASS}>Fragment, decoded</p>
                <div className="mt-1">
                  <ChainLine chain={analysis.fragmentChain} />
                </div>
                <p className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {escapeVisible(analysis.fragmentChain[analysis.fragmentChain.length - 1] ?? "") || "none"}
                </p>
              </div>
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Query parameters" className="lg:col-span-2">
          {!analysis ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No parameters.</p>
          ) : (
            <div data-testid="output-params" className="space-y-4">
              <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Edit a key or value to change it. Unchanged parts keep their original encoding in the rebuilt URL.
              </p>
              {work.rows.length === 0 ? (
                <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No query parameters.</p>
              ) : (
                <ul className="space-y-3">
                  {work.rows.map((row, i) => {
                    const info = analysis.params.find((p) => p.id === row.id);
                    return (
                      <li
                        key={row.id}
                        className="min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                          <div className="min-w-0">
                            <label htmlFor={`param-key-${row.id}`} className={LABEL_CLASS}>
                              Key {i + 1}
                            </label>
                            <input
                              id={`param-key-${row.id}`}
                              type="text"
                              value={row.key}
                              spellCheck={false}
                              onChange={(e) => patchRow(row.id, { key: e.target.value })}
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div className="min-w-0">
                            <label htmlFor={`param-value-${row.id}`} className={LABEL_CLASS}>
                              Value {i + 1}
                            </label>
                            <input
                              id={`param-value-${row.id}`}
                              type="text"
                              value={row.value}
                              spellCheck={false}
                              disabled={!row.hasValue}
                              onChange={(e) => patchRow(row.id, { value: e.target.value })}
                              className={`${INPUT_CLASS} disabled:opacity-50`}
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <label className="inline-flex min-h-[44px] items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                            <input
                              type="checkbox"
                              checked={row.hasValue}
                              onChange={(e) => patchRow(row.id, { hasValue: e.target.checked })}
                              className="h-4 w-4 accent-[hsl(var(--brand-signal))]"
                            />
                            With = and value
                          </label>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className={CHIP_CLASS}
                          >
                            Remove {i + 1}
                          </button>
                        </div>
                        {info ? (
                          <div className="mt-3 space-y-2 border-t border-[hsl(var(--brand-iron)/0.6)] pt-3">
                            {info.keyChain.length > 1 ? (
                              <div className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                                key: <ChainLine chain={info.keyChain} />
                              </div>
                            ) : null}
                            {info.valueChain.length > 1 ? (
                              <div className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                                value: <ChainLine chain={info.valueChain} />
                              </div>
                            ) : null}
                            {info.flags.length > 0 ? (
                              <ul className="flex flex-wrap gap-2">
                                {info.flags.map((f, j) => (
                                  <li
                                    key={`${f.text}-${j}`}
                                    className={`inline-flex min-w-0 items-center rounded-full border px-2.5 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.12em] ${SEVERITY_STYLE[f.severity]}`}
                                  >
                                    {f.text}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                onClick={addRow}
                className={CHIP_CLASS}
              >
                Add parameter
              </button>
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Edit parts" className="lg:col-span-2">
          {!analysis ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Paste a URL to edit it.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="edit-scheme" className={LABEL_CLASS}>Scheme</label>
                <input
                  id="edit-scheme"
                  type="text"
                  value={work.scheme}
                  spellCheck={false}
                  onChange={(e) => commit({ ...work, scheme: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="edit-host" className={LABEL_CLASS}>Host</label>
                <input
                  id="edit-host"
                  type="text"
                  value={work.host}
                  spellCheck={false}
                  onChange={(e) => commit({ ...work, host: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="edit-port" className={LABEL_CLASS}>Port</label>
                <input
                  id="edit-port"
                  type="text"
                  inputMode="numeric"
                  value={work.port}
                  spellCheck={false}
                  onChange={(e) => commit({ ...work, port: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="edit-path" className={LABEL_CLASS}>Path</label>
                <input
                  id="edit-path"
                  type="text"
                  value={work.path}
                  spellCheck={false}
                  onChange={(e) => commit({ ...work, path: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <label htmlFor="edit-fragment" className={LABEL_CLASS}>Fragment</label>
                <input
                  id="edit-fragment"
                  type="text"
                  value={work.fragment}
                  spellCheck={false}
                  onChange={(e) => commit({ ...work, fragment: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              {edit && edit.source === trimmed ? (
                <div className="sm:col-span-2">
                  <button type="button" onClick={() => setEdit(null)} className={CHIP_CLASS}>
                    Reset edits
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Rebuilt URL" className="lg:col-span-2">
          {!analysis ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">No URL to rebuild.</p>
          ) : (
            <div className="space-y-3">
              <label htmlFor="rebuilt-url" className={LABEL_CLASS}>
                Rebuilt from the parts above
              </label>
              <textarea
                id="rebuilt-url"
                data-testid="output-rebuilt"
                readOnly
                rows={3}
                value={rebuilt}
                spellCheck={false}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
              <p className="break-all font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                {rebuilt === trimmed ? "Same as input." : "Differs from input."}{" "}
                {check.ok
                  ? `Parses as ${check.text}`
                  : `Does not parse: ${check.text}`}
              </p>
            </div>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
