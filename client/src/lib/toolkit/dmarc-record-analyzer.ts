/**
 * DMARC record analysis and construction, RFC 7489.
 *
 * Parsing follows the grammar in section 6.4 and the tag definitions in
 * section 6.3. Policy discovery (section 6.6.3) decides whether a receiver
 * would use the record at all, and external report destinations are checked
 * as section 7.1 describes. The np tag comes from RFC 9091; t and psd are
 * recognized as tags of the DMARCbis revision and otherwise left alone.
 *
 * Organizational domains are approximated. RFC 7489 section 3.2 derives
 * them from a public suffix list, which is far too large to ship here, so a
 * short list of common multi-label suffixes stands in for it. The UI says so
 * wherever the approximation affects an answer.
 */

import {
  chunkFindings,
  clip,
  describeChar,
  extractTxtRecords,
  normalizeDomain,
  sortFindings,
  type Finding,
  type TxtRecord,
} from "./spf-record-analyzer";

export type { Finding, Tone } from "./spf-record-analyzer";

export type PolicyValue = "none" | "quarantine" | "reject";
export type AlignMode = "r" | "s";

export const POLICY_VALUES: PolicyValue[] = ["none", "quarantine", "reject"];
const POLICY_RANK: Record<PolicyValue, number> = { none: 0, quarantine: 1, reject: 2 };

/** Section 6.3 defaults. */
export const DEFAULT_PCT = 100;
export const DEFAULT_RI = 86400;
/** ri is a 32-bit unsigned integer (section 6.3). */
export const RI_MAX = 4294967295n;
/** The numeric part of a size limit must fit an unsigned 64-bit integer (section 6.4). */
export const SIZE_LIMIT_MAX = (1n << 64n) - 1n;
/** Receivers must support at least this many URIs per report tag (section 6.2). */
export const MIN_SUPPORTED_URIS = 2;

const FO_VALUES = ["0", "1", "d", "s"];

/* --------------------------------------------------- organizational domain */

/**
 * Multi-label public suffixes common enough to matter, standing in for the
 * public suffix list. Anything not listed is treated as a one-label suffix.
 */
const MULTI_LABEL_SUFFIXES = new Set(
  (
    "co.uk org.uk ac.uk gov.uk me.uk ltd.uk plc.uk net.uk sch.uk nhs.uk " +
    "com.au net.au org.au edu.au gov.au asn.au id.au " +
    "co.nz org.nz net.nz govt.nz ac.nz school.nz " +
    "co.jp ne.jp or.jp ac.jp go.jp ad.jp ed.jp " +
    "co.kr or.kr ne.kr ac.kr go.kr " +
    "com.br net.br org.br gov.br edu.br " +
    "com.cn net.cn org.cn gov.cn edu.cn " +
    "com.mx org.mx gob.mx edu.mx net.mx " +
    "co.in net.in org.in gov.in ac.in edu.in " +
    "co.za org.za gov.za ac.za net.za " +
    "com.sg edu.sg gov.sg net.sg org.sg " +
    "com.tw org.tw gov.tw edu.tw net.tw " +
    "com.hk org.hk gov.hk edu.hk net.hk " +
    "com.tr gov.tr edu.tr org.tr net.tr " +
    "co.il org.il ac.il gov.il net.il " +
    "com.ar gob.ar com.co gov.co com.pe gob.pe " +
    "co.id or.id ac.id go.id com.my gov.my edu.my com.ph gov.ph " +
    "com.vn gov.vn com.ua gov.ua co.th ac.th go.th in.th " +
    "com.pl net.pl org.pl com.es org.es com.pt " +
    "com.sa gov.sa com.eg gov.eg com.ng gov.ng co.ke or.ke"
  ).split(/\s+/),
);

/** The domain one label below its public suffix, using the short list above. */
export function organizationalDomain(name: string): string {
  const labels = normalizeDomain(name).split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const last2 = labels.slice(-2).join(".");
  return MULTI_LABEL_SUFFIXES.has(last2) ? labels.slice(-3).join(".") : last2;
}

const HOSTNAME = /^(?=.{1,253}$)(?:[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?\.)+[A-Za-z0-9-]*[A-Za-z][A-Za-z0-9-]*$/;

/** A plausible DNS name for the forms on this page: dotted, valid labels, letters in the last one. */
export function isDomainName(name: string): boolean {
  const n = name.trim().replace(/\.$/, "");
  return HOSTNAME.test(n) && n.split(".").every((l) => l.length <= 63 && !l.startsWith("-") && !l.endsWith("-"));
}

export interface AlignmentCheck {
  aligned: boolean;
  reason: string;
}

/**
 * Section 3.1: strict needs the exact domain; relaxed needs the same
 * organizational domain.
 */
export function checkAlignment(mode: AlignMode, fromDomain: string, authDomain: string): AlignmentCheck {
  const from = normalizeDomain(fromDomain);
  const auth = normalizeDomain(authDomain);
  if (mode === "s") {
    return from === auth
      ? { aligned: true, reason: `${auth} is exactly ${from}.` }
      : { aligned: false, reason: `Strict needs exactly ${from}; ${auth} is a different name.` };
  }
  const a = organizationalDomain(from);
  const b = organizationalDomain(auth);
  return a === b
    ? { aligned: true, reason: `Both reduce to the organizational domain ${a}.` }
    : { aligned: false, reason: `${from} belongs to ${a} and ${auth} to ${b}.` };
}

/* -------------------------------------------------------------- report URIs */

export interface ReportUri {
  raw: string;
  /** The URI without its size suffix. */
  uri: string;
  scheme: string | null;
  /** The destination host: the domain of a mailto address, or a URL's host. */
  host: string | null;
  limitBytes: bigint | null;
  limitText: string | null;
  error: string | null;
  warning: string | null;
}

const UNIT_SHIFT: Record<string, bigint> = { "": 0n, k: 10n, m: 20n, g: 30n, t: 40n };
const UNIT_NAME: Record<string, string> = { "": "bytes", k: "KiB", m: "MiB", g: "GiB", t: "TiB" };

/** dmarc-uri = URI [ "!" 1*DIGIT [ "k" / "m" / "g" / "t" ] ] (section 6.4). */
export function parseReportUri(raw: string): ReportUri {
  const out: ReportUri = { raw, uri: raw, scheme: null, host: null, limitBytes: null, limitText: null, error: null, warning: null };
  if (raw === "") {
    out.error = "An empty entry between commas.";
    return out;
  }
  const bad = [...raw].find((c) => c.charCodeAt(0) <= 0x20 || c.charCodeAt(0) >= 0x7f);
  if (bad) {
    out.error = `"${clip(raw)}" contains ${describeChar(bad)}. A URI has no spaces, and anything outside ASCII has to be percent-encoded.`;
    return out;
  }

  let uri = raw;
  const bang = raw.lastIndexOf("!");
  if (bang >= 0) {
    const m = /^(\d+)([kmgtKMGT]?)$/.exec(raw.slice(bang + 1));
    if (!m) {
      out.error = `"${clip(raw)}" has an exclamation point that does not start a size limit such as !10m. Inside the URI it has to be written %21.`;
      return out;
    }
    const n = BigInt(m[1]);
    if (n > SIZE_LIMIT_MAX) {
      out.error = `The size limit in "${clip(raw)}" does not fit in an unsigned 64-bit integer, which section 6.4 requires.`;
      return out;
    }
    const unit = m[2].toLowerCase();
    out.limitBytes = n << UNIT_SHIFT[unit];
    out.limitText = `${n.toString()} ${UNIT_NAME[unit]}`;
    uri = raw.slice(0, bang);
    if (uri.includes("!")) {
      out.error = `"${clip(raw)}" has more than one exclamation point. Only the size limit may use one; write %21 inside the URI.`;
      return out;
    }
  }
  out.uri = uri;

  const sm = /^([A-Za-z][A-Za-z0-9+.-]*):([\s\S]*)$/.exec(uri);
  if (!sm) {
    out.error = /^[^@]+@[^@]+$/.test(uri)
      ? `"${clip(uri)}" is an email address, not a URI. Write mailto:${clip(uri)}; receivers ignore the bare address.`
      : `"${clip(uri)}" is not a URI. A report destination needs a scheme, which is almost always mailto:.`;
    return out;
  }
  const scheme = sm[1].toLowerCase();
  const rest = sm[2];
  out.scheme = scheme;

  if (scheme === "mailto") {
    let addr = rest.split("?")[0];
    try {
      addr = decodeURIComponent(addr);
    } catch {
      out.error = `"${clip(uri)}" has a broken percent-encoding.`;
      return out;
    }
    const at = addr.lastIndexOf("@");
    const local = at > 0 ? addr.slice(0, at) : "";
    const domain = at > 0 ? addr.slice(at + 1) : "";
    if (!local || !isDomainName(domain)) {
      out.error = `"${clip(uri)}" does not hold a usable address. It should look like mailto:dmarc-reports@example.com.`;
      return out;
    }
    if (addr.includes(",")) {
      out.error = `"${clip(uri)}" contains a comma, which has to be written %2C so it is not read as the next URI.`;
      return out;
    }
    out.host = normalizeDomain(domain);
    return out;
  }

  if (scheme === "https" || scheme === "http") {
    const hm = /^\/\/(?:[^/?#@]*@)?(\[[^\]]+\]|[^/?#:]+)/.exec(rest);
    if (!hm) {
      out.error = `"${clip(uri)}" has no host after ${scheme}://.`;
      return out;
    }
    out.host = normalizeDomain(hm[1]);
  }
  out.warning = `"${clip(uri)}" uses ${scheme}:. Receivers are only required to support mailto: (section 6.3), so many will skip it.`;
  return out;
}

/* ------------------------------------------------------------------- tags */

export interface DmarcTag {
  position: number;
  /** The tag name as written. */
  name: string;
  key: string;
  value: string;
  known: boolean;
  error: string | null;
  meaning: string;
}

/** Plain-language meaning and default for each tag (section 6.3, RFC 9091, DMARCbis). */
export const TAG_INFO: Record<string, { label: string; meaning: string }> = {
  v: { label: "Version", meaning: "Identifies the record as DMARC. Must be first, and exactly DMARC1." },
  p: { label: "Policy", meaning: "What to do with mail that fails DMARC: none, quarantine or reject. Required." },
  sp: { label: "Subdomain policy", meaning: "Policy for subdomains. Defaults to p. Only read from the organizational domain's record." },
  np: { label: "Non-existent subdomain policy", meaning: "RFC 9091: policy for subdomains with no A, AAAA or MX records. Defaults to sp, then p." },
  pct: { label: "Percentage", meaning: "Share of failing mail the policy applies to, 0 to 100. Default 100." },
  rua: { label: "Aggregate reports", meaning: "Where to send daily XML summaries of who sent mail as this domain." },
  ruf: { label: "Failure reports", meaning: "Where to send reports about individual failing messages. Many receivers never send them." },
  adkim: { label: "DKIM alignment", meaning: "r (relaxed, default): same organizational domain. s (strict): exact match." },
  aspf: { label: "SPF alignment", meaning: "r (relaxed, default): same organizational domain. s (strict): exact match." },
  fo: { label: "Failure options", meaning: "When to generate a failure report: 0 (default), 1, d, s. Ignored without ruf." },
  rf: { label: "Report format", meaning: "Format of failure reports. Only afrf is registered, and it is the default." },
  ri: { label: "Report interval", meaning: "Requested seconds between aggregate reports. Default 86400, one day." },
  t: { label: "Test mode", meaning: "DMARCbis: y asks receivers to apply one level less than p. Not part of RFC 7489." },
  psd: { label: "Public suffix", meaning: "DMARCbis: y, n or u, whether this is a public suffix domain. Not part of RFC 7489." },
};

export interface PolicyOutcome {
  scope: string;
  policy: PolicyValue | null;
  source: string;
  effect: string;
}

export interface Strength {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
}

export interface ExternalDestination {
  tag: "rua" | "ruf";
  host: string;
  /** The TXT name that has to exist, or null when the policy domain is unknown. */
  recordName: string | null;
}

export interface DmarcAnalysis {
  record: string;
  /** Whether a receiver would apply this record at all. */
  applies: boolean;
  ignoredReason: string | null;
  tags: DmarcTag[];
  p: PolicyValue | null;
  sp: PolicyValue | null;
  np: PolicyValue | null;
  /** p as a receiver applies it: p=none when p is invalid but rua is usable (section 6.6.3). */
  effectiveP: PolicyValue | null;
  pct: number;
  adkim: AlignMode;
  aspf: AlignMode;
  fo: string[];
  rf: string[];
  ri: number;
  rua: ReportUri[];
  ruf: ReportUri[];
  errors: string[];
  findings: Finding[];
  outcomes: PolicyOutcome[];
  strength: Strength;
  external: ExternalDestination[];
}

function policyOf(value: string): PolicyValue | null {
  const v = value.toLowerCase();
  return (POLICY_VALUES as string[]).includes(v) ? (v as PolicyValue) : null;
}

/** What happens to failing mail under a policy and pct, per section 6.6.4. */
export function policyEffect(p: PolicyValue, pct: number): string {
  if (p === "none") return "delivered as normal; reported only";
  if (pct >= 100) return p === "reject" ? "rejected" : "quarantined";
  if (pct <= 0) return p === "reject" ? "quarantined (pct=0 samples nothing for reject)" : "normal handling (pct=0 samples nothing)";
  return p === "reject"
    ? `rejected for ${pct}%, quarantined for the rest`
    : `quarantined for ${pct}%, normal handling for the rest`;
}

/** How hard failing mail is treated at worst: 1 monitor, 2 partial quarantine, 3 at least quarantined, 4 reject. */
export function policyStrength(p: PolicyValue | null, pct: number, applies: boolean): Strength {
  if (!applies || p === null) return { level: 0, label: "Not applied" };
  if (p === "none") return { level: 1, label: "Monitor only" };
  if (p === "quarantine") {
    if (pct <= 0) return { level: 1, label: "Monitor only (pct=0)" };
    if (pct < 100) return { level: 2, label: "Partial quarantine" };
    return { level: 3, label: "Quarantine" };
  }
  if (pct < 100) return { level: 3, label: "Reject, sampled" };
  return { level: 4, label: "Reject" };
}

function splitUris(value: string): string[] {
  return value.split(/[ \t]*,[ \t]*/);
}

/**
 * Analyze one DMARC record. `policyDomain` is the domain the record was
 * published for (without _dmarc.), used for external destination checks.
 */
export function analyzeDmarc(record: string, policyDomain = ""): DmarcAnalysis {
  const errors: string[] = [];
  const findings: Finding[] = [];
  const tags: DmarcTag[] = [];
  const domain = normalizeDomain(policyDomain);
  let ignoredReason: string | null = null;

  // Whitespace the grammar does not know (WSP is space and tab only).
  const odd = [...record].find((c) => /\s/.test(c) && c !== " " && c !== "\t");
  if (odd) {
    errors.push(`The record contains ${describeChar(odd)}. Only spaces and tabs may sit around the separators, and receivers read anything else as part of a value.`);
  }

  const pieces = record.split(";");
  let emptyTags = 0;
  pieces.forEach((piece, i) => {
    const trimmed = piece.replace(/^[ \t]+|[ \t]+$/g, "");
    if (trimmed === "") {
      // One trailing semicolon is allowed; any other empty piece is not.
      if (i < pieces.length - 1) emptyTags += 1;
      return;
    }
    const m = /^([A-Za-z][A-Za-z0-9_]*)[ \t]*=[ \t]*([\s\S]*)$/.exec(trimmed);
    if (!m) {
      errors.push(`"${clip(trimmed)}" is not a tag=value pair. Tags are separated by semicolons and each one needs an equals sign.`);
      return;
    }
    const key = m[1].toLowerCase();
    tags.push({
      position: tags.length + 1,
      name: m[1],
      key,
      value: m[2],
      known: key in TAG_INFO,
      error: null,
      meaning: TAG_INFO[key]?.meaning ?? "Not a DMARC tag. Receivers ignore tags they do not recognize (section 6.3).",
    });
  });
  if (emptyTags) {
    findings.push({
      tone: "warn",
      text: `${emptyTags === 1 ? "There is an empty tag" : `There are ${emptyTags} empty tags`}, two semicolons with nothing between them. Most receivers skip it, but the grammar only allows one trailing semicolon.`,
    });
  }

  /* ---------- version: first, and exactly DMARC1 (section 6.3, 6.6.3) */
  const first = tags[0];
  if (!first || first.key !== "v") {
    ignoredReason = "The record does not start with v=DMARC1, so receivers discard it (section 6.6.3).";
    errors.push(ignoredReason);
  } else if (first.value !== "DMARC1") {
    first.error = `The version is "${clip(first.value, 16)}". It must be exactly DMARC1, in capitals; the grammar spells it as case-sensitive octets.`;
    ignoredReason = `The version is "${clip(first.value, 16)}", not exactly DMARC1, so receivers discard the record (section 6.3).`;
    errors.push(first.error);
  } else if (first.name !== "v") {
    findings.push({
      tone: "info",
      text: 'The version tag is written "V". DMARC uses DKIM\'s tag syntax, where tag names are case-sensitive, so write it in lowercase.',
    });
  }

  /* ---------- a missing semicolon shows up as a second "=" inside a value */
  for (const tag of tags) {
    const next = /[ \t]([A-Za-z][A-Za-z0-9_]*)[ \t]*=/.exec(tag.value);
    if (next) {
      findings.push({
        tone: "warn",
        text: `The value of ${tag.name} runs on into "${clip(next[1], 12)}=", so a semicolon is probably missing between the two tags.`,
      });
    }
  }

  /* ---------- duplicates */
  const byKey = new Map<string, DmarcTag>();
  for (const tag of tags) {
    if (byKey.has(tag.key)) {
      tag.error = `${tag.name} appears more than once. The grammar allows each tag once, and receivers disagree on which copy wins; this page reads the first.`;
      findings.push({ tone: "warn", text: tag.error });
      continue;
    }
    byKey.set(tag.key, tag);
  }
  const get = (key: string) => byKey.get(key) ?? null;

  /* ---------- case of tag names and keyword values */
  const upper = tags.filter((t) => t.key !== "v" && (t.name !== t.key || (["p", "sp", "np", "adkim", "aspf"].includes(t.key) && t.value !== t.value.toLowerCase())));
  if (upper.length) {
    findings.push({
      tone: "info",
      text: `${upper.map((t) => `${t.name}=${clip(t.value, 16)}`).join(", ")} ${upper.length === 1 ? "uses" : "use"} capitals. The grammar's literals are case-insensitive, but DMARC inherits DKIM's case-sensitive tag names, so lowercase is the spelling every receiver accepts.`,
    });
  }

  /* ---------- p, sp, np */
  const pTag = get("p");
  const spTag = get("sp");
  const npTag = get("np");
  let p: PolicyValue | null = null;
  let sp: PolicyValue | null = null;
  let np: PolicyValue | null = null;
  if (pTag) {
    p = policyOf(pTag.value);
    if (!p) pTag.error = `p=${clip(pTag.value, 16)} is not a policy. It must be none, quarantine or reject.`;
    if (pTag.position !== 2 && first?.key === "v") {
      findings.push({
        tone: "warn",
        text: "p is not the second tag. RFC 7489's grammar puts it immediately after v=DMARC1; most receivers accept it anywhere, but second is the only position the grammar allows.",
      });
    }
  }
  if (spTag) {
    sp = policyOf(spTag.value);
    if (!sp) spTag.error = `sp=${clip(spTag.value, 16)} is not a policy. It must be none, quarantine or reject.`;
  }
  if (npTag) {
    np = policyOf(npTag.value);
    if (!np) npTag.error = `np=${clip(npTag.value, 16)} is not a policy. It must be none, quarantine or reject.`;
  }

  /* ---------- pct */
  let pct = DEFAULT_PCT;
  const pctTag = get("pct");
  if (pctTag) {
    if (!/^\d{1,3}$/.test(pctTag.value)) pctTag.error = `pct=${clip(pctTag.value, 16)} is not a whole number from 0 to 100.`;
    else if (Number(pctTag.value) > 100) pctTag.error = `pct=${pctTag.value} is over 100. It is a percentage, 0 to 100 inclusive.`;
    else pct = Number(pctTag.value);
  }

  /* ---------- alignment */
  const align = (key: "adkim" | "aspf"): AlignMode => {
    const tag = get(key);
    if (!tag) return "r";
    const v = tag.value.toLowerCase();
    if (v === "r" || v === "s") return v;
    tag.error = `${key}=${clip(tag.value, 16)} is not valid. It must be r (relaxed) or s (strict); receivers fall back to relaxed.`;
    return "r";
  };
  const adkim = align("adkim");
  const aspf = align("aspf");

  /* ---------- fo, rf, ri */
  let fo = ["0"];
  const foTag = get("fo");
  if (foTag) {
    const parts = foTag.value.split(/[ \t]*:[ \t]*/);
    const badFo = parts.filter((x) => !FO_VALUES.includes(x.toLowerCase()));
    if (badFo.length) foTag.error = `fo=${clip(foTag.value, 16)} holds ${badFo.map((x) => `"${clip(x, 8)}"`).join(", ")}. The options are 0, 1, d and s, separated by colons.`;
    else fo = parts.map((x) => x.toLowerCase());
  }
  let rf = ["afrf"];
  const rfTag = get("rf");
  if (rfTag) {
    const parts = rfTag.value.split(/[ \t]*:[ \t]*/);
    if (parts.some((x) => !/^[A-Za-z0-9-]+$/.test(x))) {
      rfTag.error = `rf=${clip(rfTag.value, 16)} is not a colon-separated list of format names.`;
    } else {
      rf = parts.map((x) => x.toLowerCase());
      const unknown = rf.filter((x) => x !== "afrf");
      if (unknown.length) {
        findings.push({
          tone: "warn",
          text: `rf lists ${unknown.join(", ")}. The only registered failure report format is afrf (RFC 6591), so receivers will not use ${unknown.length === 1 ? "it" : "them"}.`,
        });
      }
    }
  }
  let ri = DEFAULT_RI;
  const riTag = get("ri");
  if (riTag) {
    if (!/^\d+$/.test(riTag.value)) riTag.error = `ri=${clip(riTag.value, 16)} is not a whole number of seconds.`;
    else if (BigInt(riTag.value) > RI_MAX) riTag.error = `ri=${clip(riTag.value, 16)} does not fit in the 32-bit unsigned integer section 6.3 defines.`;
    else ri = Number(riTag.value);
  }

  /* ---------- rua, ruf */
  const reportList = (key: "rua" | "ruf"): ReportUri[] => {
    const tag = get(key);
    if (!tag) return [];
    if (tag.value === "") {
      tag.error = `${key}= is empty. Give at least one URI, such as mailto:dmarc@example.com, or remove the tag.`;
      return [];
    }
    const uris = splitUris(tag.value).map(parseReportUri);
    const bad = uris.filter((u) => u.error);
    if (bad.length) tag.error = bad.map((u) => u.error).join(" ");
    return uris;
  };
  const rua = reportList("rua");
  const ruf = reportList("ruf");
  const validRua = rua.filter((u) => !u.error);
  const validRuf = ruf.filter((u) => !u.error);

  /* ---------- DMARCbis tags */
  const tTag = get("t");
  if (tTag && !/^[yn]$/i.test(tTag.value)) tTag.error = `t=${clip(tTag.value, 8)} is not valid. DMARCbis defines y or n.`;
  const psdTag = get("psd");
  if (psdTag && !/^[ynu]$/i.test(psdTag.value)) psdTag.error = `psd=${clip(psdTag.value, 8)} is not valid. DMARCbis defines y, n or u.`;
  const bis = [tTag, psdTag].filter((t): t is DmarcTag => t !== null && !t.error);
  if (bis.length) {
    findings.push({
      tone: "info",
      text: `${bis.map((t) => `${t.name}=${t.value}`).join(" and ")} ${bis.length === 1 ? "comes" : "come"} from the DMARCbis revision, not RFC 7489. Receivers that implement only RFC 7489 ignore ${bis.length === 1 ? "it" : "them"}.`,
    });
  }

  for (const tag of tags) if (tag.error && !errors.includes(tag.error) && !/appears more than once/.test(tag.error)) errors.push(tag.error);

  const unknownTags = tags.filter((t) => !t.known);
  if (unknownTags.length) {
    findings.push({
      tone: "info",
      text: `${unknownTags.map((t) => t.name).join(", ")} ${unknownTags.length === 1 ? "is not a DMARC tag" : "are not DMARC tags"}, so receivers ignore ${unknownTags.length === 1 ? "it" : "them"} (section 6.3).`,
    });
  }

  /* ---------- does a receiver apply it? (section 6.6.3) */
  let effectiveP: PolicyValue | null = p;
  let applies = ignoredReason === null;
  if (applies && (p === null || (spTag !== null && sp === null))) {
    const why = p === null ? (pTag ? "p is not valid" : "there is no p tag") : "sp is not valid";
    if (validRua.length) {
      effectiveP = "none";
      findings.push({
        tone: "danger",
        text: `${why[0].toUpperCase()}${why.slice(1)}. Because rua holds a usable address, section 6.6.3 has receivers act as if the record said p=none: reports are sent, nothing is enforced.`,
      });
    } else {
      applies = false;
      effectiveP = null;
      ignoredReason = `${why[0].toUpperCase()}${why.slice(1)} and there is no usable rua address, so receivers apply no DMARC processing at all (section 6.6.3).`;
      findings.push({ tone: "danger", text: ignoredReason });
    }
  }

  /* ---------- outcomes by scope */
  const outcomes: PolicyOutcome[] = [];
  if (applies && effectiveP) {
    const spEff = sp ?? effectiveP;
    const npEff = np ?? sp ?? effectiveP;
    outcomes.push({ scope: "This domain", policy: effectiveP, source: p ? "p" : "p (treated as none)", effect: policyEffect(effectiveP, pct) });
    outcomes.push({ scope: "Subdomains", policy: spEff, source: sp ? "sp" : "inherits p", effect: policyEffect(spEff, pct) });
    outcomes.push({
      scope: "Non-existent subdomains",
      policy: npEff,
      source: np ? "np (RFC 9091)" : sp ? "inherits sp" : "inherits p",
      effect: policyEffect(npEff, pct),
    });
  }
  const strength = policyStrength(effectiveP, pct, applies);

  /* ---------- policy findings */
  if (applies && effectiveP) {
    if (p === "none") {
      findings.push({
        tone: "warn",
        text: "p=none is monitor-only. Receivers deliver failing mail exactly as they would without DMARC and only send reports. It is the right first step, and protects nobody if it is left there.",
      });
    } else if (p === "reject" && pct === 100) {
      findings.push({ tone: "ok", text: "p=reject at 100%: receivers are asked to refuse every message that fails DMARC, the strongest policy." });
    } else if (p === "quarantine" && pct === 100) {
      findings.push({ tone: "ok", text: "p=quarantine at 100%: failing mail is treated as suspicious, usually the spam folder. The next step is reject." });
    }
    if (pctTag && pct < 100 && p !== "none") {
      findings.push({
        tone: "warn",
        text:
          pct === 0
            ? `pct=0 applies the policy to no messages. Under ${p}, the rest get ${p === "reject" ? "quarantine instead" : "normal handling"} (section 6.6.4), so this record enforces ${p === "reject" ? "only quarantine" : "nothing"}.`
            : `pct=${pct} applies ${p} to ${pct}% of failing mail; the rest get ${p === "reject" ? "quarantine" : "normal handling"} (section 6.6.4). Useful during rollout, then raise it to 100.`,
      });
    }
    if (sp && POLICY_RANK[sp] < POLICY_RANK[effectiveP]) {
      findings.push({
        tone: "warn",
        text: `sp=${sp} is weaker than p=${effectiveP}. A spoofer only has to invent a subdomain, anything.${domain || "example.com"}, to get the weaker treatment.`,
      });
    }
    const parent = sp ?? effectiveP;
    if (np && POLICY_RANK[np] < POLICY_RANK[parent]) {
      findings.push({
        tone: "warn",
        text: `np=${np} is weaker than the ${sp ? "sp" : "p"} policy it overrides. Subdomains that do not exist are the names a spoofer is most likely to invent.`,
      });
    }
    if (spTag && sp) {
      findings.push({
        tone: "info",
        text: "sp only takes effect when this record sits at the organizational domain. A receiver asks for _dmarc at the exact From domain first, so a subdomain's own record is used as is, and its sp is ignored (section 6.3).",
      });
    }
  }

  /* ---------- reporting */
  if (applies) {
    if (validRua.length === 0) {
      findings.push({
        tone: "warn",
        text: "No usable rua address, so nobody receives aggregate reports. Without them there is no way to see which services send as this domain before tightening the policy.",
      });
    } else {
      findings.push({ tone: "ok", text: `Aggregate reports go to ${validRua.map((u) => u.uri).join(", ")}.` });
    }
    if (validRuf.length) {
      findings.push({
        tone: "info",
        text: "ruf asks for reports on individual failing messages. Many large mailbox providers never send them, and the ones that arrive can carry personal data from the message, so handle that mailbox accordingly.",
      });
    }
    if (foTag && !foTag.error && ruf.length === 0) {
      findings.push({ tone: "info", text: "fo is set, but there is no ruf tag, so section 6.3 has receivers ignore it." });
    }
    for (const [key, list] of [["rua", rua], ["ruf", ruf]] as const) {
      if (list.length > MIN_SUPPORTED_URIS) {
        findings.push({
          tone: "info",
          text: `${key} lists ${list.length} destinations. Receivers must support at least ${MIN_SUPPORTED_URIS} and may ignore the rest (section 6.2), so put the important ones first.`,
        });
      }
      for (const u of list) if (u.warning) findings.push({ tone: "warn", text: u.warning });
    }
    if (riTag && !riTag.error && ri !== DEFAULT_RI) {
      findings.push({
        tone: "info",
        text: `ri=${ri} asks for a report every ${ri.toLocaleString("en-US")} seconds. Receivers must manage daily and should manage hourly; anything else is best effort (section 6.3), and most send once a day regardless.`,
      });
    }
    if (adkim === "s" || aspf === "s") {
      findings.push({
        tone: "info",
        text: `Strict ${[adkim === "s" ? "DKIM" : null, aspf === "s" ? "SPF" : null].filter(Boolean).join(" and ")} alignment needs the exact From domain. Mail signed or bounced from a subdomain such as mail.${domain || "example.com"} stops aligning.`,
      });
    }
  }

  /* ---------- external destinations (section 7.1) */
  const external: ExternalDestination[] = [];
  const orgSelf = domain ? organizationalDomain(domain) : "";
  for (const [tag, list] of [["rua", validRua], ["ruf", validRuf]] as const) {
    for (const u of list) {
      if (!u.host) continue;
      if (domain && organizationalDomain(u.host) === orgSelf) continue;
      if (external.some((e) => e.host === u.host && e.tag === tag)) continue;
      external.push({ tag, host: u.host, recordName: domain ? `${domain}._report._dmarc.${u.host}` : null });
    }
  }
  if (applies && external.length) {
    if (domain) {
      findings.push({
        tone: "warn",
        text: `${external.length === 1 ? "One report destination is" : `${external.length} report destinations are`} outside ${orgSelf}. Section 7.1 has receivers send reports there only if the destination publishes a TXT record starting with v=DMARC1 at ${external[0].recordName}${external.length > 1 ? " (and the equivalents listed below)" : ""}.`,
      });
    } else {
      findings.push({
        tone: "info",
        text: "Enter the domain this record is for to check whether any report destination is external. Section 7.1 has receivers send reports to another organization's domain only if that domain publishes an authorization record.",
      });
    }
  }

  if (ignoredReason && !findings.some((f) => f.text === ignoredReason)) {
    findings.push({ tone: "danger", text: ignoredReason });
  }

  return {
    record,
    applies,
    ignoredReason,
    tags,
    p,
    sp,
    np,
    effectiveP,
    pct,
    adkim,
    aspf,
    fo,
    rf,
    ri,
    rua,
    ruf,
    errors,
    findings: sortFindings(findings),
    outcomes,
    strength,
    external,
  };
}

/* ------------------------------------------------------------ input level */

export interface DmarcInputResult {
  kind: "empty" | "error" | "ok";
  message: string | null;
  txt: TxtRecord[];
  analysis: DmarcAnalysis | null;
  findings: Finding[];
  /** Domain read from a pasted owner name such as _dmarc.example.com. */
  ownerDomain: string | null;
}

/** Owner names arrive as _dmarc.example.com.; the policy domain is what follows _dmarc. */
function domainFromOwner(owner: string | null): string | null {
  if (!owner) return null;
  const n = normalizeDomain(owner);
  return n.startsWith("_dmarc.") ? n.slice("_dmarc.".length) : null;
}

export function analyzeDmarcInput(input: string, domain = ""): DmarcInputResult {
  const base: DmarcInputResult = { kind: "empty", message: null, txt: [], analysis: null, findings: [], ownerDomain: null };
  if (input.trim() === "") return base;
  const extraction = extractTxtRecords(input);
  if (extraction.error) return { ...base, kind: "error", message: extraction.error };
  const txt = extraction.records;

  // Section 6.6.3: keep records that start with a v= tag naming DMARC1.
  const candidates = txt.filter((r) => /^v[ \t]*=[ \t]*dmarc1[ \t]*(;|$)/i.test(r.text));
  // DMARC1 is case-sensitive (section 6.4 spells it as %x44 %x4d %x41 %x52 %x43 %x31).
  const exact = candidates.filter((r) => /^[vV][ \t]*=[ \t]*DMARC1[ \t]*(;|$)/.test(r.text));
  const findings: Finding[] = [];

  let chosen: TxtRecord | null = exact[0] ?? candidates[0] ?? null;
  if (!chosen) {
    if (txt.some((r) => /^v=spf1/i.test(r.text))) {
      return { ...base, kind: "error", txt, message: "That is an SPF record. DMARC is a separate TXT record at _dmarc.<domain>, starting with v=DMARC1." };
    }
    const tagLike = txt.find((r) => /^[A-Za-z][A-Za-z0-9_]*[ \t]*=/.test(r.text));
    if (!tagLike) {
      const quotedErr = txt.find((r) => r.error);
      return {
        ...base,
        kind: "error",
        txt,
        message: quotedErr
          ? `Line ${quotedErr.line} ${quotedErr.error}.`
          : "Nothing here looks like a DMARC record. Paste the TXT record from _dmarc.<domain>, for example the output of dig +short TXT _dmarc.example.com.",
      };
    }
    chosen = tagLike;
  }

  if (exact.length > 1) {
    findings.push({
      tone: "danger",
      text: `${exact.length} records start with v=DMARC1. With more than one, policy discovery stops and receivers apply no DMARC at all (section 6.6.3). Keep exactly one.`,
    });
  }
  const others = txt.length - candidates.length - (candidates.includes(chosen) ? 0 : 1);
  if (others > 0) {
    findings.push({
      tone: "info",
      text: `${others === 1 ? "One other TXT line was" : `${others} other TXT lines were`} ignored. Receivers discard TXT records at _dmarc that do not start with v=DMARC1.`,
    });
  }

  const ownerDomain = domainFromOwner(chosen.owner);
  const effectiveDomain = domain.trim() !== "" ? domain : ownerDomain ?? "";
  const analysis = analyzeDmarc(chosen.text, effectiveDomain);
  if (exact.length > 1) {
    analysis.applies = false;
    analysis.ignoredReason = "There is more than one DMARC record, so receivers apply none of them.";
    analysis.strength = { level: 0, label: "Not applied" };
    analysis.outcomes = [];
  }
  analysis.findings = sortFindings([...chunkFindings(chosen), ...findings, ...analysis.findings]);
  return { kind: "ok", message: null, txt, analysis, findings, ownerDomain };
}

/* ---------------------------------------------------------------- builder */

export interface DmarcBuilderInput {
  domain: string;
  p: PolicyValue;
  /** Empty means inherit. */
  sp: PolicyValue | "";
  np: PolicyValue | "";
  pct: string;
  rua: string;
  ruf: string;
  adkim: AlignMode;
  aspf: AlignMode;
  fo: string[];
  ri: string;
}

export interface DmarcBuildResult {
  record: string;
  errors: string[];
  ruaUris: string[];
  rufUris: string[];
  /** Zone-file line for _dmarc.<domain>, split into 255-octet strings. */
  zoneLine: string | null;
  /** Authorization records the destinations must publish (section 7.1). */
  authorizations: string[];
}

export const BUILDER_DEFAULTS: DmarcBuilderInput = {
  domain: "example.com",
  p: "none",
  sp: "",
  np: "",
  pct: "100",
  rua: "dmarc-reports@example.com",
  ruf: "",
  adkim: "r",
  aspf: "r",
  fo: ["0"],
  ri: "",
};

/** Turn a list of addresses or mailto URIs into dmarc-uri values, refusing anything that would break the record. */
export function normalizeReportAddresses(text: string, label: string): { uris: string[]; errors: string[] } {
  const uris: string[] = [];
  const errors: string[] = [];
  const items = text.split(/[\s,;]+/).filter(Boolean);
  for (const item of items.slice(0, 10)) {
    const m = /^(?:mailto:)?([^!]+)(![0-9]+[kmgtKMGT]?)?$/i.exec(item);
    const addr = m?.[1] ?? "";
    const at = addr.lastIndexOf("@");
    const local = at > 0 ? addr.slice(0, at) : "";
    const host = at > 0 ? addr.slice(at + 1) : "";
    if (!m || !local || !/^[A-Za-z0-9.$&'*+/=^_`{|}~-]+$/.test(local) || !isDomainName(host)) {
      errors.push(`${label}: "${clip(item, 40)}" is not an email address such as dmarc@example.com.`);
      continue;
    }
    const uri = `mailto:${local}@${host.toLowerCase()}${m[2] ?? ""}`;
    if (!uris.includes(uri)) uris.push(uri);
  }
  if (items.length > 10) errors.push(`${label}: only the first 10 addresses are used.`);
  return { uris, errors };
}

/** Quote record text for a zone file, splitting into strings of at most 255 octets. */
export function toTxtPresentation(text: string): string {
  const escaped: string[] = [];
  let current = "";
  for (const ch of text) {
    const piece = ch === '"' || ch === "\\" ? `\\${ch}` : ch;
    if (current.replace(/\\(.)/g, "$1").length + 1 > 255) {
      escaped.push(current);
      current = "";
    }
    current += piece;
  }
  if (current !== "" || escaped.length === 0) escaped.push(current);
  return escaped.map((s) => `"${s}"`).join(" ");
}

export function buildDmarcRecord(input: DmarcBuilderInput): DmarcBuildResult {
  const errors: string[] = [];
  const parts = ["v=DMARC1", `p=${input.p}`];
  if (input.sp) parts.push(`sp=${input.sp}`);
  if (input.np) parts.push(`np=${input.np}`);

  const pctText = input.pct.trim();
  if (pctText !== "") {
    if (!/^\d{1,3}$/.test(pctText) || Number(pctText) > 100) errors.push("pct must be a whole number from 0 to 100.");
    else if (Number(pctText) !== 100) parts.push(`pct=${Number(pctText)}`);
  }

  const rua = normalizeReportAddresses(input.rua, "rua");
  const ruf = normalizeReportAddresses(input.ruf, "ruf");
  errors.push(...rua.errors, ...ruf.errors);
  if (rua.uris.length) parts.push(`rua=${rua.uris.join(",")}`);
  if (ruf.uris.length) parts.push(`ruf=${ruf.uris.join(",")}`);
  if (input.adkim === "s") parts.push("adkim=s");
  if (input.aspf === "s") parts.push("aspf=s");

  if (ruf.uris.length) {
    const fo = FO_VALUES.filter((v) => input.fo.includes(v));
    if (fo.length && !(fo.length === 1 && fo[0] === "0")) parts.push(`fo=${fo.join(":")}`);
  }

  const riText = input.ri.trim();
  if (riText !== "") {
    if (!/^\d{1,10}$/.test(riText) || BigInt(riText) > RI_MAX) errors.push(`ri must be a whole number of seconds up to ${RI_MAX.toString()}.`);
    else if (Number(riText) !== DEFAULT_RI) parts.push(`ri=${Number(riText)}`);
  }

  const record = parts.join("; ");
  const domainText = input.domain.trim();
  const domain = isDomainName(domainText) ? normalizeDomain(domainText) : "";
  if (domainText !== "" && !domain) errors.push(`"${clip(domainText, 40)}" is not a domain name such as example.com.`);

  const authorizations: string[] = [];
  if (domain) {
    const org = organizationalDomain(domain);
    const hosts = new Set<string>();
    for (const uri of [...rua.uris, ...ruf.uris]) {
      const host = uri.replace(/![0-9]+[kmgt]?$/i, "").split("@").pop() ?? "";
      if (host && organizationalDomain(host) !== org) hosts.add(host);
    }
    for (const host of hosts) authorizations.push(`${domain}._report._dmarc.${host}. IN TXT "v=DMARC1"`);
  }

  return {
    record,
    errors,
    ruaUris: rua.uris,
    rufUris: ruf.uris,
    zoneLine: domain ? `_dmarc.${domain}. IN TXT ${toTxtPresentation(record)}` : null,
    authorizations,
  };
}
