/**
 * HTTP response security header audit.
 *
 * Each check follows the document that defines the header:
 *   Strict-Transport-Security   RFC 6797, plus the hstspreload.org rules
 *   Content-Security-Policy     CSP Level 3, through ./csp-analyzer
 *   X-Frame-Options             HTML Standard, "check a navigation response's
 *                               adherence to X-Frame-Options"
 *   X-Content-Type-Options      Fetch Standard, "determine nosniff"
 *   Referrer-Policy             W3C Referrer Policy, "parse a referrer policy
 *                               from a Referrer-Policy header"
 *   Permissions-Policy          W3C Permissions Policy, an RFC 8941
 *                               structured field dictionary
 *   Cross-Origin-*-Policy       HTML Standard (COOP, COEP), Fetch (CORP)
 *   Set-Cookie                  RFC 6265bis (cookie prefixes, SameSite)
 *
 * Pure functions only: no React, no DOM. Nothing is fetched; the input is
 * text the reader pasted.
 */

import {
  analyzeCsp,
  asciiLower,
  countBySeverity,
  sortFindings,
  splitHeaderValues,
  type CspReport,
  type Severity,
} from "./csp-analyzer";

export { countBySeverity, sortFindings, type Severity };

/* ---------------------------------------------------------------- limits */

/** Longest paste read, in characters. */
export const MAX_INPUT_CHARS = 200_000;
/** Lines read from the paste. */
export const MAX_LINES = 4_000;
/** Header fields kept from the analyzed response. */
export const MAX_HEADERS = 500;
/** Names quoted in one finding before "and N more". */
const MAX_NAMES = 6;

function list(items: string[], max = MAX_NAMES): string {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
}

/* --------------------------------------------------------------- parsing */

export interface HeaderLine {
  /** Field name as written. */
  name: string;
  /** ASCII-lowercased field name. */
  lower: string;
  value: string;
}

export interface ParsedResponse {
  /** The status line of the analyzed response, when one was pasted. */
  status: string | null;
  statusCode: number | null;
  headers: HeaderLine[];
  /** Lines that were neither headers, status lines nor blank. */
  skipped: number;
  /** Earlier responses in the paste (redirects, 100 Continue) that were not analyzed. */
  earlierResponses: number;
  /** Headers dropped past MAX_HEADERS. */
  truncated: number;
}

export type ParseResult = { ok: true; response: ParsedResponse } | { ok: false; error: string | null };

// RFC 9110 field-name = token
const FIELD_LINE = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+)[ \t]*:[ \t]*(.*?)[ \t]*$/;
const STATUS_LINE = /^HTTP\/\d(?:\.\d)?[ \t]+(\d{3})\b.*$/i;

/**
 * Reads curl -I, curl -v and copied DevTools output. A paste that holds a
 * redirect chain (curl -IL) is split at each status line and the last
 * response is the one analyzed, since that is the page the browser shows.
 */
export function parseRawHeaders(input: string): ParseResult {
  if (input.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      error: `That is ${input.length.toLocaleString("en-US")} characters. This reads at most ${MAX_INPUT_CHARS.toLocaleString("en-US")}; a full set of response headers is rarely more than a few kilobytes.`,
    };
  }
  const text = input.replace(/^\ufeff/, "");
  if (text.trim() === "") return { ok: false, error: null };

  let lines = text.split(/\r\n|\r|\n/);
  if (lines.length > MAX_LINES) lines = lines.slice(0, MAX_LINES);

  // curl -v marks response lines with "< " and request lines with "> ".
  if (lines.some((line) => /^< /.test(line))) {
    lines = lines.filter((line) => line.startsWith("<")).map((line) => line.replace(/^<[ ]?/, ""));
  }

  interface Block {
    status: string | null;
    code: number | null;
    headers: HeaderLine[];
    skipped: number;
  }
  const blocks: Block[] = [{ status: null, code: null, headers: [], skipped: 0 }];
  let last: HeaderLine | null = null;

  for (const line of lines) {
    const block = blocks[blocks.length - 1];
    const status = STATUS_LINE.exec(line.trim());
    if (status) {
      blocks.push({ status: line.trim(), code: Number(status[1]), headers: [], skipped: 0 });
      last = null;
      continue;
    }
    if (line.trim() === "") {
      last = null;
      continue;
    }
    // obs-fold (RFC 9112 section 5.2): continuation of the previous value.
    if (/^[ \t]/.test(line) && last) {
      last.value = `${last.value} ${line.trim()}`.trim();
      continue;
    }
    // HTTP/2 pseudo-headers copied from DevTools (":status: 200").
    if (line.startsWith(":")) continue;
    const m = FIELD_LINE.exec(line);
    if (!m) {
      block.skipped += 1;
      last = null;
      continue;
    }
    last = { name: m[1], lower: asciiLower(m[1]), value: m[2] };
    block.headers.push(last);
  }

  let index = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].headers.length > 0) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    return {
      ok: false,
      error: "No header lines found. Paste lines of the form Name: value, as printed by curl -I https://example.com.",
    };
  }
  const chosen = blocks[index];
  const earlier = blocks.slice(0, index).filter((b) => b.status !== null || b.headers.length > 0).length;
  return {
    ok: true,
    response: {
      status: chosen.status,
      statusCode: chosen.code,
      headers: chosen.headers.slice(0, MAX_HEADERS),
      skipped: blocks.reduce((n, b) => n + b.skipped, 0),
      earlierResponses: earlier,
      truncated: Math.max(0, chosen.headers.length - MAX_HEADERS),
    },
  };
}

function fields(r: ParsedResponse, lower: string): HeaderLine[] {
  return r.headers.filter((h) => h.lower === lower);
}

/** RFC 9110 section 5.3: repeated fields combine with a comma, in order. */
function combined(r: ParsedResponse, lower: string): string | null {
  const found = fields(r, lower);
  return found.length ? found.map((h) => h.value).join(", ") : null;
}

/* ------------------------------------------------------------- findings */

export interface HeaderFinding {
  id: string;
  severity: Severity;
  /** The header the finding is about, canonically capitalized. */
  header: string;
  title: string;
  detail: string;
}

/* ------------------------------------------------------------ durations */

const DAY = 86_400n;
const YEAR = 31_536_000n; // 365 days, the hstspreload.org minimum
const SIX_MONTHS = 15_768_000n; // 182.5 days, the common six-month floor

export function describeSeconds(seconds: bigint): string {
  if (seconds === 0n) return "0 seconds";
  if (seconds < 60n) return `${seconds} ${seconds === 1n ? "second" : "seconds"}`;
  if (seconds < 3_600n) {
    const m = Number(seconds) / 60;
    return `${trim1(m)} ${m === 1 ? "minute" : "minutes"}`;
  }
  if (seconds < DAY) {
    const h = Number(seconds) / 3600;
    return `${trim1(h)} ${h === 1 ? "hour" : "hours"}`;
  }
  if (seconds < YEAR) {
    const d = Number(seconds) / 86_400;
    return `${trim1(d)} ${d === 1 ? "day" : "days"}`;
  }
  const y = Number(seconds) / 31_536_000;
  if (!Number.isFinite(y)) return "an effectively unlimited time";
  return `${trim1(y)} ${y === 1 ? "year" : "years"}`;
}

function trim1(n: number): string {
  if (!Number.isFinite(n)) return "a very long time";
  return n >= 1e6 ? n.toExponential(2) : String(Math.round(n * 10) / 10);
}

/* ------------------------------------------------------------------ HSTS */

export interface HstsParse {
  ok: boolean;
  /** Why browsers would ignore the header. */
  errors: string[];
  maxAge: bigint | null;
  includeSubDomains: boolean;
  preload: boolean;
  unknown: string[];
  /** includeSubDomains or preload written with a value. */
  valued: string[];
}

const TCHAR = /[!#$%&'*+\-.^_`|~0-9A-Za-z]/;

/**
 * RFC 6797 section 6.1: directives separated by ";", each a token with an
 * optional "=" token or quoted-string. A header with a repeated directive,
 * a missing or non-numeric max-age, or anything else off-grammar is
 * ignored by the user agent in its entirety.
 */
export function parseHsts(value: string): HstsParse {
  const out: HstsParse = {
    ok: true,
    errors: [],
    maxAge: null,
    includeSubDomains: false,
    preload: false,
    unknown: [],
    valued: [],
  };
  const seen = new Set<string>();
  let i = 0;
  const ws = () => {
    while (i < value.length && (value[i] === " " || value[i] === "\t")) i++;
  };
  const token = () => {
    const start = i;
    while (i < value.length && TCHAR.test(value[i])) i++;
    return value.slice(start, i);
  };

  while (i <= value.length) {
    ws();
    if (i >= value.length) break;
    if (value[i] === ";") {
      i++;
      continue;
    }
    const name = token();
    if (name === "") {
      out.errors.push(`unexpected character "${value[i]}" at position ${i + 1}`);
      break;
    }
    const lower = asciiLower(name);
    ws();
    let directiveValue: string | null = null;
    if (value[i] === "=") {
      i++;
      ws();
      if (value[i] === '"') {
        i++;
        let s = "";
        let closed = false;
        while (i < value.length) {
          const c = value[i];
          if (c === "\\" && i + 1 < value.length) {
            s += value[i + 1];
            i += 2;
            continue;
          }
          if (c === '"') {
            closed = true;
            i++;
            break;
          }
          s += c;
          i++;
        }
        if (!closed) {
          out.errors.push(`the quoted value of ${name} is never closed`);
          break;
        }
        directiveValue = s;
      } else {
        directiveValue = token();
        if (directiveValue === "") {
          out.errors.push(`${name}= has no value`);
          break;
        }
      }
      ws();
    }
    if (i < value.length && value[i] !== ";") {
      out.errors.push(`unexpected "${value[i]}" after ${name}`);
      break;
    }
    if (seen.has(lower)) {
      out.errors.push(`${name} appears more than once, which RFC 6797 forbids`);
      continue;
    }
    seen.add(lower);
    if (lower === "max-age") {
      if (directiveValue === null || !/^[0-9]+$/.test(directiveValue)) {
        out.errors.push(`max-age must be a whole number of seconds, not ${directiveValue === null ? "empty" : `"${directiveValue}"`}`);
      } else {
        out.maxAge = BigInt(directiveValue);
      }
    } else if (lower === "includesubdomains") {
      out.includeSubDomains = true;
      if (directiveValue !== null) out.valued.push(name);
    } else if (lower === "preload") {
      out.preload = true;
      if (directiveValue !== null) out.valued.push(name);
    } else {
      out.unknown.push(name);
    }
  }
  if (out.maxAge === null && !out.errors.some((e) => e.startsWith("max-age"))) {
    out.errors.push("there is no max-age directive, and it is required");
  }
  out.ok = out.errors.length === 0;
  return out;
}

function checkHsts(r: ParsedResponse, add: Adder): HstsParse | null {
  const all = fields(r, "strict-transport-security");
  const H = "Strict-Transport-Security";
  if (all.length === 0) {
    add(
      "hsts-missing",
      "medium",
      H,
      "No Strict-Transport-Security",
      "Without HSTS, a visitor who types the bare domain or follows an http:// link makes one cleartext request first, and an attacker on the network path can answer it and keep the visitor on HTTP (SSL stripping). Browsers ignore the header on plain HTTP responses, so it has to be sent over HTTPS.",
    );
    return null;
  }
  if (all.length > 1) {
    add(
      "hsts-multiple",
      "low",
      H,
      "More than one Strict-Transport-Security header",
      "RFC 6797 section 8.1 says a browser processes only the first one, so the others are dead weight at best and a source of confusion when they disagree.",
    );
  }
  const p = parseHsts(all[0].value);
  if (!p.ok) {
    add(
      "hsts-invalid",
      "high",
      H,
      "Strict-Transport-Security is malformed, so browsers ignore it",
      `RFC 6797 tells the browser to ignore a header that does not follow the grammar: ${p.errors.join("; ")}. As sent, it gives no protection.`,
    );
    return p;
  }
  const maxAge = p.maxAge!;
  if (maxAge === 0n) {
    add(
      "hsts-zero",
      "medium",
      H,
      "max-age=0 switches HSTS off",
      "A max-age of zero tells the browser to delete its HSTS entry for this host. That is the documented way to turn HSTS off; if it was not meant, the site is unprotected.",
    );
  } else if (maxAge < SIX_MONTHS) {
    add(
      "hsts-short",
      "medium",
      H,
      `max-age is only ${describeSeconds(maxAge)}`,
      `The protection lapses ${describeSeconds(maxAge)} after the visitor's last HTTPS response, after which the next http:// request is exposed again. Six months (15768000) is the usual floor and a year (31536000) the usual target. Short values are fine while testing a rollout, as long as they are raised afterward.`,
    );
  } else if (maxAge < YEAR) {
    add(
      "hsts-under-year",
      "low",
      H,
      `max-age is ${describeSeconds(maxAge)}`,
      "That is long enough to protect returning visitors, but under the one year (31536000 seconds) that the HSTS preload list requires and most guidance recommends.",
    );
  } else {
    add("hsts-ok", "pass", H, `HSTS for ${describeSeconds(maxAge)}`, `max-age=${maxAge} keeps browsers on HTTPS for this host for ${describeSeconds(maxAge)} after each visit.`);
  }
  if (!p.includeSubDomains && maxAge > 0n) {
    add(
      "hsts-subdomains",
      "low",
      H,
      "includeSubDomains is not set",
      "Subdomains are not covered. An attacker on the network can then use a made-up http://anything.example.com to set or overwrite cookies scoped to the parent domain. Add includeSubDomains once every subdomain serves HTTPS.",
    );
  }
  if (p.valued.length > 0) {
    add("hsts-valued", "low", H, `${list(p.valued)} takes no value`, "includeSubDomains and preload are valueless directives. Write them bare; a value is outside the grammar and browsers may not honor it.");
  }
  if (p.unknown.length > 0) {
    add("hsts-unknown", "info", H, `Unknown directive ${list(p.unknown)}`, "RFC 6797 tells browsers to ignore directives they do not recognize, so this has no effect.");
  }
  if (p.preload) {
    const missing: string[] = [];
    if (maxAge < YEAR) missing.push("max-age of at least 31536000");
    if (!p.includeSubDomains) missing.push("includeSubDomains");
    if (missing.length) {
      add(
        "hsts-preload-unmet",
        "medium",
        H,
        "preload is set but the header does not qualify",
        `hstspreload.org rejects a header without ${list(missing)}. The preload token alone does nothing; browsers only apply what is compiled into their preload list.`,
      );
    } else {
      add(
        "hsts-preload",
        "info",
        H,
        "Eligible for the HSTS preload list",
        "The header meets the list's header rules. Preloading protects even the first visit, but removal takes months to reach users, so every subdomain must be ready to serve HTTPS for good before submitting.",
      );
    }
  }
  return p;
}

/* ------------------------------------------------------------------- CSP */

export interface CspSummary {
  report: CspReport;
  enforced: number;
  reportOnly: number;
  frameAncestors: boolean;
  frameAncestorsBroad: boolean;
}

function checkCsp(r: ParsedResponse, add: Adder): CspSummary | null {
  const lines = r.headers.filter(
    (h) => h.lower === "content-security-policy" || h.lower === "content-security-policy-report-only",
  );
  const H = "Content-Security-Policy";
  if (lines.length === 0) {
    add(
      "csp-missing",
      "medium",
      H,
      "No Content-Security-Policy",
      "Nothing tells the browser which scripts this page may run, so any cross-site scripting flaw executes with no second line of defense. A policy that blocks inline script and limits script sources is the main mitigation browsers offer.",
    );
    return null;
  }
  const report = analyzeCsp(lines.map((h) => `${h.name}: ${h.value}`).join("\n"));
  if (report.policies.length === 0) {
    // The header is there but yields no policy: every copy is empty, or the
    // value is longer than the CSP analyzer reads.
    const tooLong = report.extraction.error !== null && /at most/.test(report.extraction.error);
    add(
      tooLong ? "csp-too-long" : "csp-empty",
      tooLong ? "info" : "medium",
      H,
      tooLong ? "The CSP is too long to analyze" : "Content-Security-Policy is empty",
      tooLong
        ? `${report.extraction.error} Its directives, including any frame-ancestors, were not checked.`
        : "The header is present but carries no directives, so the browser has no policy to enforce and any cross-site scripting flaw executes unhindered.",
    );
    return null;
  }
  const enforcedPolicies = report.policies.filter((p) => p.disposition === "enforce");
  const reportOnly = report.policies.length - enforcedPolicies.length;
  // Every enforced policy must allow a load, so framing is open only when
  // each policy that sets frame-ancestors is itself permissive.
  const withAncestors = enforcedPolicies.filter((p) => p.directives.some((d) => d.name === "frame-ancestors"));
  const frameAncestors = withAncestors.length > 0;
  const frameAncestorsBroad =
    frameAncestors && withAncestors.every((p) => p.findings.some((f) => f.id === "frame-ancestors-broad"));
  const serious = report.policies.flatMap((p) => p.findings).filter((f) => f.severity === "high" || f.severity === "medium");

  if (enforcedPolicies.length === 0) {
    add(
      "csp-report-only",
      "low",
      H,
      "The CSP is report-only",
      "Content-Security-Policy-Report-Only reports violations and blocks none of them. It is the right way to trial a policy, but it protects nobody until it is sent as Content-Security-Policy.",
    );
  } else {
    const level = report.combined!.level;
    const tail = serious.length
      ? ` The CSP analyzer lists ${serious.length} high or medium ${serious.length === 1 ? "finding" : "findings"} for it.`
      : "";
    if (level === "unrestricted" || level === "bypassable") {
      add(
        "csp-weak",
        "medium",
        H,
        level === "unrestricted" ? "The CSP does not restrict scripts" : "The CSP is easy to bypass",
        `${report.combined!.text}${tail}`,
      );
    } else if (level === "allowlist") {
      add("csp-allowlist", "low", H, "The CSP relies on a host allowlist", `${report.combined!.text}${tail}`);
    } else {
      add("csp-strong", "pass", H, "The CSP restricts scripts well", `${report.combined!.text}${tail}`);
    }
  }
  // report-to names an endpoint that the Reporting-Endpoints header must
  // define (Reporting API). A name with no endpoint sends nothing.
  const names = [
    ...new Set(
      report.policies
        .map((p) => p.directives.find((d) => d.name === "report-to")?.tokens[0])
        .filter((n): n is string => !!n && !/^[a-z][a-z0-9+.\-]*:\/\//i.test(n) && !n.startsWith("/")),
    ),
  ];
  if (names.length > 0 && fields(r, "report-to").length === 0) {
    const endpointsRaw = combined(r, "reporting-endpoints");
    const parsed = endpointsRaw === null ? null : parseSfDictionary(endpointsRaw);
    // An endpoint URL must be a string item; a bare token is ignored.
    const entries = parsed && parsed.ok ? [...parsed.entries] : [];
    const defined = entries.filter(([, m]) => m.item?.type === "string").map(([k]) => k);
    const unquoted = entries.filter(([k, m]) => m.item?.type !== "string" && names.includes(k)).map(([k]) => k);
    const missing = names.filter((n) => !defined.includes(n) && !unquoted.includes(n));
    if (unquoted.length > 0) {
      add(
        "reporting-endpoint-unquoted",
        "low",
        "Reporting-Endpoints",
        `The URL for ${list(unquoted.map((n) => `"${n}"`))} is not a quoted string`,
        `Reporting-Endpoints is a structured field, and each endpoint URL must be in double quotes: ${unquoted[0]}="https://example.com/csp-reports". Unquoted, the entry is skipped and those reports go nowhere.`,
      );
    }
    if (endpointsRaw === null) {
      add(
        "csp-no-endpoints",
        "low",
        H,
        "report-to names an endpoint the response never defines",
        `The policy sends reports to ${list(names.map((n) => `"${n}"`))}, but there is no Reporting-Endpoints header, so no reports are sent. Add Reporting-Endpoints: ${names[0]}="https://example.com/csp-reports".`,
      );
    } else if (parsed && !parsed.ok) {
      add("reporting-endpoints-invalid", "low", "Reporting-Endpoints", "Reporting-Endpoints is malformed", `It does not parse as a structured field dictionary (${parsed.error}), so browsers ignore it and no reports are sent. The form is name="https://...".`);
    } else if (missing.length > 0) {
      add(
        "csp-endpoint-missing",
        "low",
        H,
        `Endpoint ${list(missing.map((n) => `"${n}"`))} is not defined`,
        `Reporting-Endpoints defines ${defined.length ? list(defined.map((n) => `"${n}"`)) : "nothing"}, but the policy reports to ${list(missing.map((n) => `"${n}"`))}. Names must match exactly, so those reports go nowhere.`,
      );
    }
  }

  return {
    report,
    enforced: enforcedPolicies.length,
    reportOnly,
    frameAncestors,
    frameAncestorsBroad,
  };
}

/* ------------------------------------------------------- X-Frame-Options */

function checkFraming(r: ParsedResponse, csp: CspSummary | null, add: Adder): string | null {
  const raw = combined(r, "x-frame-options");
  const H = "X-Frame-Options";
  // HTML Standard: an enforced CSP with frame-ancestors makes the browser
  // skip X-Frame-Options entirely.
  if (csp?.frameAncestors) {
    if (csp.frameAncestorsBroad) {
      add(
        "framing-broad",
        "medium",
        "Content-Security-Policy",
        "frame-ancestors allows any site to frame this page",
        `frame-ancestors overrides X-Frame-Options in every current browser, so its permissive value is what applies${raw ? `, whatever X-Frame-Options: ${raw} says` : ""}.`,
      );
    } else {
      add(
        "framing-csp",
        "pass",
        "Content-Security-Policy",
        "frame-ancestors controls framing",
        raw
          ? `Browsers that understand frame-ancestors ignore X-Frame-Options: ${raw}. Keeping both is harmless and covers very old browsers.`
          : "frame-ancestors decides which sites may frame the page. X-Frame-Options is only needed for very old browsers.",
      );
    }
    return raw;
  }

  if (raw === null) {
    add(
      "framing-missing",
      "medium",
      H,
      "No protection against framing",
      "Neither X-Frame-Options nor a CSP frame-ancestors directive is set, so any site can load this page in an invisible frame and trick a visitor into clicking its buttons (clickjacking). frame-ancestors 'self' in the CSP, or X-Frame-Options: SAMEORIGIN, prevents it.",
    );
    return raw;
  }

  // HTML: "getting, decoding, and splitting", then ASCII lowercase into a set.
  // Empty members count, so "SAMEORIGIN," is two values and a conflict.
  const values = new Set(splitHeaderValues(raw).map((v) => asciiLower(v)));
  const first = [...values][0] ?? "";
  if (values.size > 1) {
    const meaningful = ["deny", "allowall", "sameorigin"].some((v) => values.has(v));
    add(
      "xfo-conflict",
      meaningful ? "low" : "medium",
      H,
      meaningful ? "Conflicting X-Frame-Options values" : "X-Frame-Options has several unrecognized values",
      meaningful
        ? `The header carries ${list([...values].map((v) => (v === "" ? "an empty value" : v)))}. The HTML Standard treats more than one distinct value as a conflict and blocks framing entirely, even from this origin. Send one value.`
        : `The header carries ${list([...values].map((v) => (v === "" ? "an empty value" : v)))}, none of which the browser acts on, so it is ignored and any site can frame the page.`,
    );
  } else if (first === "deny" || first === "sameorigin") {
    add(
      "xfo-ok",
      "pass",
      H,
      `X-Frame-Options: ${first.toUpperCase()}`,
      `${first === "deny" ? "No site, including this one, can frame the page." : "Only pages on this origin can frame it."} frame-ancestors in a CSP is the modern equivalent and takes precedence where both are sent.`,
    );
  } else if (first.startsWith("allow-from")) {
    add(
      "xfo-allow-from",
      "medium",
      H,
      "ALLOW-FROM is not supported",
      "Current browsers do not implement ALLOW-FROM. They treat the header as invalid and ignore it, which leaves the page frameable by any site. Use frame-ancestors with the allowed origin instead.",
    );
  } else if (first === "allowall") {
    add("xfo-allowall", "medium", H, "ALLOWALL permits framing", "ALLOWALL is not a standard value; browsers that know it treat it as no restriction, so any site can frame the page.");
  } else {
    add("xfo-invalid", "medium", H, `Unrecognized value "${raw}"`, "Browsers ignore an X-Frame-Options value they do not recognize, so the page can be framed by any site. The valid values are DENY and SAMEORIGIN.");
  }
  return raw;
}

/* ------------------------------------------------ X-Content-Type-Options */

function checkNosniff(r: ParsedResponse, add: Adder): boolean {
  const raw = combined(r, "x-content-type-options");
  const H = "X-Content-Type-Options";
  if (raw === null) {
    add(
      "nosniff-missing",
      "low",
      H,
      "No X-Content-Type-Options",
      "Without nosniff, a browser may guess a type from the content when the declared one is missing or generic, and it will still run a script served as text/plain. With nosniff, a script must carry a JavaScript MIME type and a stylesheet text/css, which stops an uploaded file or a JSON response from being loaded as script.",
    );
    return false;
  }
  // Fetch "determine nosniff": only the first value counts.
  const first = asciiLower(splitHeaderValues(raw)[0] ?? "");
  if (first !== "nosniff") {
    add("nosniff-invalid", "low", H, "X-Content-Type-Options is not nosniff", `The first value is "${splitHeaderValues(raw)[0]}". Browsers act only when the first value is nosniff, so this does nothing.`);
    return false;
  }
  add("nosniff-ok", "pass", H, "nosniff is set", "Browsers use the declared Content-Type and will not run a script or stylesheet served under the wrong one.");
  return true;
}

/* ------------------------------------------------------- Referrer-Policy */

export const REFERRER_POLICIES: Record<string, { severity: Severity; text: string }> = {
  "no-referrer": { severity: "pass", text: "Sends no Referer header at all." },
  "same-origin": { severity: "pass", text: "Sends the full URL to this origin and nothing to any other." },
  "strict-origin": { severity: "pass", text: "Sends only the origin, and nothing when going from HTTPS to HTTP." },
  "strict-origin-when-cross-origin": {
    severity: "pass",
    text: "Sends the full URL within this origin, only the origin to other sites, and nothing on an HTTPS to HTTP step. It is also the browser default.",
  },
  origin: { severity: "low", text: "Sends only the origin, but sends it even from an HTTPS page to an HTTP one." },
  "origin-when-cross-origin": {
    severity: "low",
    text: "Sends the full URL within this origin and the origin elsewhere, including on an HTTPS to HTTP step.",
  },
  "no-referrer-when-downgrade": {
    severity: "low",
    text: "Sends the full URL, path and query included, to every other HTTPS site. This was the old default, replaced because URLs carry tokens and personal data.",
  },
  "unsafe-url": {
    severity: "medium",
    text: "Sends the full URL, path and query included, to every site, even over plain HTTP.",
  },
};

/** The policy a browser ends up with: the last recognized token (W3C Referrer Policy section 8.1). */
export function effectiveReferrerPolicy(raw: string): { policy: string | null; ignored: string[] } {
  let policy: string | null = null;
  const ignored: string[] = [];
  for (const token of splitHeaderValues(raw)) {
    const t = asciiLower(token.trim());
    if (t === "") continue;
    if (t in REFERRER_POLICIES) policy = t;
    else ignored.push(token.trim());
  }
  return { policy, ignored };
}

function checkReferrer(r: ParsedResponse, add: Adder): string | null {
  const raw = combined(r, "referrer-policy");
  const H = "Referrer-Policy";
  if (raw === null) {
    add(
      "referrer-missing",
      "info",
      H,
      "No Referrer-Policy",
      "Current browsers default to strict-origin-when-cross-origin, which sends only the origin to other sites. Setting it explicitly documents the intent and covers older browsers that defaulted to sending the full URL.",
    );
    return null;
  }
  const { policy, ignored } = effectiveReferrerPolicy(raw);
  if (policy === null && ignored.length === 0) {
    add("referrer-empty", "low", H, "Referrer-Policy is empty", "An empty value is ignored and the browser default, strict-origin-when-cross-origin, applies. Set a value or drop the header.");
  }
  if (ignored.length > 0) {
    add(
      "referrer-ignored",
      "low",
      H,
      `Unrecognized ${ignored.length === 1 ? "value" : "values"}: ${list(ignored)}`,
      policy
        ? `Browsers skip values they do not know and use the last one they do, here ${policy}.`
        : "No value is recognized, so the browser default applies as if the header were absent.",
    );
  }
  if (policy) {
    const info = REFERRER_POLICIES[policy];
    add(`referrer-${policy}`, info.severity, H, `Referrer-Policy: ${policy}`, info.text);
  }
  return policy;
}

/* ---------------------------------------------- RFC 8941 structured fields */

export type SfBare = { type: "token" | "string" | "number" | "boolean" | "bytes"; value: string };
export interface SfMember {
  /** A bare item, or an inner list of bare items. */
  item: SfBare | null;
  inner: SfBare[] | null;
  params: Record<string, SfBare>;
}

export type SfDictionary = { ok: true; entries: Map<string, SfMember> } | { ok: false; error: string };

/**
 * RFC 8941 section 4.2.2, "Parsing a Dictionary". Any failure discards the
 * whole field, which is what browsers do with a malformed Permissions-Policy.
 */
export function parseSfDictionary(input: string): SfDictionary {
  let i = 0;
  const s = input;
  const fail = (why: string): SfDictionary => ({ ok: false, error: `${why} at position ${Math.min(i, s.length) + 1}` });
  const sp = () => {
    while (s[i] === " ") i++;
  };
  const ows = () => {
    while (s[i] === " " || s[i] === "\t") i++;
  };

  const parseKey = (): string | null => {
    if (!/[a-z*]/.test(s[i] ?? "")) return null;
    const start = i;
    while (i < s.length && /[a-z0-9_\-.*]/.test(s[i])) i++;
    return s.slice(start, i);
  };

  const parseBare = (): SfBare | string => {
    const c = s[i] ?? "";
    if (c === "-" || /[0-9]/.test(c)) {
      const m = /^-?[0-9]{1,15}(?:\.[0-9]{1,3})?/.exec(s.slice(i));
      if (!m || (m[0].includes(".") && m[0].split(".")[0].replace("-", "").length > 12)) return "a malformed number";
      i += m[0].length;
      return { type: "number", value: m[0] };
    }
    if (c === '"') {
      i++;
      let out = "";
      while (i < s.length) {
        const ch = s[i++];
        if (ch === "\\") {
          const next = s[i++];
          if (next !== '"' && next !== "\\") return "a bad escape in a string";
          out += next;
        } else if (ch === '"') {
          return { type: "string", value: out };
        } else {
          const code = ch.charCodeAt(0);
          if (code < 0x20 || code > 0x7e) return "a character not allowed in a string";
          out += ch;
        }
      }
      return "a string that is never closed";
    }
    if (/[A-Za-z*]/.test(c)) {
      const start = i;
      i++;
      while (i < s.length && /[!#$%&'*+\-.^_`|~0-9A-Za-z:/]/.test(s[i])) i++;
      return { type: "token", value: s.slice(start, i) };
    }
    if (c === ":") {
      const end = s.indexOf(":", i + 1);
      if (end === -1) return "a byte sequence that is never closed";
      const body = s.slice(i + 1, end);
      if (!/^[A-Za-z0-9+/=]*$/.test(body)) return "a bad byte sequence";
      i = end + 1;
      return { type: "bytes", value: body };
    }
    if (c === "?") {
      if (s[i + 1] === "0" || s[i + 1] === "1") {
        i += 2;
        return { type: "boolean", value: s[i - 1] };
      }
      return "a bad boolean";
    }
    return c === "'" ? "a single quote, which structured fields do not use" : `an unexpected "${c || "end of input"}"`;
  };

  const parseParams = (): Record<string, SfBare> | string => {
    const params: Record<string, SfBare> = {};
    while (s[i] === ";") {
      i++;
      sp();
      const key = parseKey();
      if (key === null) return "a bad parameter name";
      let value: SfBare = { type: "boolean", value: "1" };
      if (s[i] === "=") {
        i++;
        const v = parseBare();
        if (typeof v === "string") return v;
        value = v;
      }
      params[key] = value;
    }
    return params;
  };

  const entries = new Map<string, SfMember>();
  let guard = 0;
  sp();
  while (i < s.length) {
    if (++guard > 1000) return fail("too many members");
    const key = parseKey();
    if (key === null) {
      return fail(
        /[A-Z]/.test(s[i] ?? "") ? "an uppercase feature name (keys must be lowercase)" : `an unexpected "${s[i]}" where a feature name should start`,
      );
    }
    let member: SfMember;
    if (s[i] === "=") {
      i++;
      if (s[i] === "(") {
        i++;
        const inner: SfBare[] = [];
        let closed = false;
        while (i < s.length) {
          sp();
          if (s[i] === ")") {
            i++;
            closed = true;
            break;
          }
          const item = parseBare();
          if (typeof item === "string") return fail(item);
          const ip = parseParams();
          if (typeof ip === "string") return fail(ip);
          inner.push(item);
          if (s[i] !== " " && s[i] !== ")") return fail("a missing space or closing parenthesis in a list");
        }
        if (!closed) return fail("a list that is never closed");
        const params = parseParams();
        if (typeof params === "string") return fail(params);
        member = { item: null, inner, params };
      } else {
        const item = parseBare();
        if (typeof item === "string") return fail(item);
        const params = parseParams();
        if (typeof params === "string") return fail(params);
        member = { item, inner: null, params };
      }
    } else {
      const params = parseParams();
      if (typeof params === "string") return fail(params);
      member = { item: { type: "boolean", value: "1" }, inner: null, params };
    }
    entries.set(key, member);
    ows();
    if (i >= s.length) break;
    if (s[i] !== ",") return fail(`an unexpected "${s[i]}" where a comma should be`);
    i++;
    ows();
    if (i >= s.length) return fail("a trailing comma");
  }
  return { ok: true, entries };
}

/* ---------------------------------------------------- Permissions-Policy */

/** Features defined in the Permissions Policy registry and related specifications. */
export const KNOWN_FEATURES = new Set([
  "accelerometer",
  "ambient-light-sensor",
  "attribution-reporting",
  "autoplay",
  "battery",
  "bluetooth",
  "browsing-topics",
  "camera",
  "captured-surface-control",
  "ch-ua",
  "clipboard-read",
  "clipboard-write",
  "compute-pressure",
  "cross-origin-isolated",
  "deferred-fetch",
  "digital-credentials-get",
  "display-capture",
  "document-domain",
  "encrypted-media",
  "execution-while-not-rendered",
  "execution-while-out-of-viewport",
  "fullscreen",
  "gamepad",
  "geolocation",
  "gyroscope",
  "hid",
  "identity-credentials-get",
  "idle-detection",
  "join-ad-interest-group",
  "keyboard-map",
  "language-detector",
  "local-fonts",
  "magnetometer",
  "microphone",
  "midi",
  "otp-credentials",
  "payment",
  "picture-in-picture",
  "private-state-token-issuance",
  "private-state-token-redemption",
  "publickey-credentials-create",
  "publickey-credentials-get",
  "run-ad-auction",
  "screen-wake-lock",
  "serial",
  "shared-storage",
  "shared-storage-select-url",
  "speaker-selection",
  "storage-access",
  "summarizer",
  "sync-xhr",
  "translator",
  "unload",
  "usb",
  "web-share",
  "window-management",
  "xr-spatial-tracking",
]);

export interface FeatureRule {
  feature: string;
  /** "none" for (), "all" for *, otherwise the listed members. */
  allow: "none" | "all" | string[];
  known: boolean;
}

/** Turns a parsed dictionary into one allowlist per feature. */
export function permissionRules(entries: Map<string, SfMember>): { rules: FeatureRule[]; problems: string[] } {
  const rules: FeatureRule[] = [];
  const problems: string[] = [];
  for (const [feature, member] of entries) {
    const items = member.inner ?? (member.item ? [member.item] : []);
    if (member.item && member.item.type === "boolean") {
      problems.push(`${feature} is written without =() or =(...)`);
      continue;
    }
    const bad = items.filter((it) => !(it.type === "token" || it.type === "string"));
    if (bad.length) {
      problems.push(`${feature} holds a ${bad[0].type}, which is not an allowlist member`);
      continue;
    }
    // Permissions Policy "parse policy directive": tokens other than *,
    // self and src are skipped, which can leave an empty allowlist.
    const odd = items.filter((it) => it.type === "token" && !["*", "self", "src"].includes(it.value));
    if (odd.length) {
      problems.push(`${feature} lists ${odd.map((it) => it.value).join(" ")}, which is not an allowlist keyword (use (), self, src, * or a quoted origin)`);
    }
    const members = items
      .filter((it) => !odd.includes(it))
      .map((it) => (it.type === "string" ? `"${it.value}"` : it.value));
    rules.push({
      feature,
      allow: members.length === 0 ? "none" : items.some((it) => it.type === "token" && it.value === "*") ? "all" : members,
      // Client hint features (ch-ua-platform, ch-dpr and so on) share a prefix.
      known: KNOWN_FEATURES.has(feature) || feature.startsWith("ch-"),
    });
  }
  return { rules, problems };
}

const SENSITIVE_FEATURES = ["camera", "microphone", "geolocation", "payment", "usb", "serial", "hid", "bluetooth", "display-capture"];

function checkPermissions(r: ParsedResponse, add: Adder): FeatureRule[] | null {
  const raw = combined(r, "permissions-policy");
  const H = "Permissions-Policy";
  if (fields(r, "feature-policy").length > 0) {
    add(
      "feature-policy",
      "info",
      "Feature-Policy",
      "Feature-Policy is the old name",
      "Feature-Policy was replaced by Permissions-Policy, which uses structured field syntax (camera=()) instead of the old one (camera 'none'). Send Permissions-Policy; keep Feature-Policy only for browsers that predate it.",
    );
  }
  if (raw === null) {
    add(
      "permissions-missing",
      "info",
      H,
      "No Permissions-Policy",
      "Powerful features such as the camera, microphone and geolocation still need a permission prompt, and cross-origin frames need an allow attribute, so this header is defense in depth: it lets a page give up features it never uses, so that injected or third-party code cannot request them.",
    );
    return null;
  }
  const parsed = parseSfDictionary(raw);
  if (!parsed.ok) {
    const legacy = /'(none|self|src)'|\s'|;/.test(raw);
    add(
      "permissions-invalid",
      "medium",
      H,
      "Permissions-Policy is malformed, so browsers ignore all of it",
      `It does not parse as an RFC 8941 dictionary: ${parsed.error}.${legacy ? " It looks like the old Feature-Policy syntax; the new form is camera=(), geolocation=(self \"https://maps.example\")." : ""} A structured field that fails to parse is discarded whole.`,
    );
    return null;
  }
  const { rules, problems } = permissionRules(parsed.entries);
  if (problems.length) {
    add(
      "permissions-problems",
      "low",
      H,
      "Some entries are not valid allowlists",
      `${list(problems, 4)}. Browsers drop allowlist members they cannot read, which can leave a feature switched off or allowed differently than intended. Write feature=() to disable a feature or feature=(self) to keep it for this origin.`,
    );
  }
  const unknown = rules.filter((rule) => !rule.known).map((rule) => rule.feature);
  if (unknown.includes("interest-cohort")) {
    add(
      "permissions-floc",
      "info",
      H,
      "interest-cohort is no longer needed",
      "It opted out of FLoC, a Chrome advertising experiment that was dropped and replaced by the Topics API. Browsers now log it as an unrecognized feature; it is harmless but can go.",
    );
  }
  const otherUnknown = unknown.filter((f) => f !== "interest-cohort");
  if (otherUnknown.length) {
    add("permissions-unknown", "info", H, `Unrecognized ${otherUnknown.length === 1 ? "feature" : "features"}: ${list(otherUnknown)}`, "These are not features this tool recognizes. Browsers ignore feature names they do not support, so check the spelling.");
  }
  const wide = rules.filter((rule) => rule.allow === "all" && SENSITIVE_FEATURES.includes(rule.feature)).map((r) => r.feature);
  if (wide.length) {
    add(
      "permissions-wide",
      "info",
      H,
      `${list(wide)} allowed for every origin`,
      "An allowlist of * restricts nothing beyond the browser's defaults: the page can use the feature and delegate it to any frame through an allow attribute. If the page does not need it, () disables it.",
    );
  }
  const disabled = rules.filter((rule) => rule.allow === "none").map((rule) => rule.feature);
  add(
    "permissions-ok",
    "pass",
    H,
    "Permissions-Policy parses",
    disabled.length
      ? `${disabled.length} ${disabled.length === 1 ? "feature is" : "features are"} switched off for this page and every frame in it: ${list(disabled, 10)}.`
      : "No feature is switched off outright; the header only narrows who may use some of them.",
  );
  return rules;
}

/* ------------------------------------------------------- cross-origin */

function sfToken(raw: string): { token: string | null; error: string | null } {
  const value = raw.trim();
  // RFC 8941: an item is a bare item followed directly by ";key=value"
  // parameters; whitespace before the ";" fails the parse.
  const m = /^([A-Za-z*][!#$%&'*+\-.^_`|~0-9A-Za-z:/]*)(;.*)?$/.exec(value);
  if (!m) return { token: null, error: `"${value}" is not a single token` };
  return { token: m[1], error: null };
}

function checkCrossOrigin(r: ParsedResponse, add: Adder): { coop: string | null; coep: string | null; corp: string | null } {
  const coopRaw = combined(r, "cross-origin-opener-policy");
  const coepRaw = combined(r, "cross-origin-embedder-policy");
  const corpRaw = combined(r, "cross-origin-resource-policy");
  let coop: string | null = null;
  let coep: string | null = null;
  let corp: string | null = null;

  const COOP = "Cross-Origin-Opener-Policy";
  const coopValues = ["unsafe-none", "same-origin-allow-popups", "same-origin", "noopener-allow-popups"];
  if (coopRaw === null || coopRaw.trim() === "") {
    add(
      "coop-missing",
      "low",
      COOP,
      fields(r, "cross-origin-opener-policy-report-only").length ? "COOP is report-only" : "No Cross-Origin-Opener-Policy",
      "The page shares a browsing context group with any cross-origin window that opens it or that it opens, so each keeps a handle on the other. That handle allows cross-site leaks, such as counting frames or watching navigation, and lets an opener redirect this tab. same-origin isolates the page; same-origin-allow-popups keeps the popups it opens, which OAuth and payment flows need.",
    );
  } else {
    const t = sfToken(coopRaw);
    coop = t.token;
    if (!t.token || !coopValues.includes(t.token)) {
      add("coop-invalid", "low", COOP, "Unrecognized COOP value", `${t.error ?? `"${t.token}" is not a COOP value`}. Browsers fall back to unsafe-none, which isolates nothing. The values are ${coopValues.join(", ")}.`);
      coop = null;
    } else if (t.token === "unsafe-none") {
      add("coop-unsafe-none", "low", COOP, "COOP is unsafe-none", "unsafe-none is the default and isolates nothing. same-origin, or same-origin-allow-popups for pages that open OAuth or payment popups, puts the page in its own browsing context group.");
    } else {
      add("coop-ok", "pass", COOP, `COOP: ${t.token}`, t.token === "same-origin" ? "Cross-origin windows lose their handle on this page, which shuts out window-reference leaks and opener tricks." : "Cross-origin openers lose their handle on this page, while popups it opens keep working.");
    }
  }

  const COEP = "Cross-Origin-Embedder-Policy";
  const coepValues = ["unsafe-none", "require-corp", "credentialless"];
  if (coepRaw !== null && coepRaw.trim() !== "") {
    const t = sfToken(coepRaw);
    if (!t.token || !coepValues.includes(t.token)) {
      add("coep-invalid", "low", COEP, "Unrecognized COEP value", `${t.error ?? `"${t.token}" is not a COEP value`}. The values are ${coepValues.join(", ")}; anything else is treated as unsafe-none.`);
    } else {
      coep = t.token;
    }
  }
  if (coop === "same-origin" && (coep === "require-corp" || coep === "credentialless")) {
    add("isolated", "pass", COEP, "The page is cross-origin isolated", `COOP same-origin with COEP ${coep} unlocks SharedArrayBuffer and finer-grained timers. ${coep === "require-corp" ? "Cross-origin resources load only if they opt in with CORP or CORS." : "Cross-origin resources that do not opt in load without credentials."}`);
  } else if (coep === null) {
    add("coep-missing", "info", COEP, "No Cross-Origin-Embedder-Policy", "COEP is only needed for cross-origin isolation, which pages use for SharedArrayBuffer and precise timers. Most sites can leave it out.");
  }

  const CORP = "Cross-Origin-Resource-Policy";
  if (corpRaw === null || corpRaw.trim() === "") {
    add("corp-missing", "info", CORP, "No Cross-Origin-Resource-Policy", "CORP lets a response refuse to be embedded by other sites through no-cors requests such as img and script tags, which limits Spectre-style reads and cross-site leaks. It matters most on API responses and private resources rather than on public pages.");
  } else {
    // Fetch compares the value byte for byte, so case matters.
    const value = corpRaw.trim();
    if (value === "same-origin" || value === "same-site") {
      corp = value;
      add("corp-ok", "pass", CORP, `CORP: ${value}`, `Other ${value === "same-origin" ? "origins" : "sites"} cannot embed this response with a no-cors request.`);
    } else if (value === "cross-origin") {
      corp = value;
      add("corp-cross", "info", CORP, "CORP: cross-origin", "Any site may embed this response. That is right for public assets and CDNs, and it is what lets cross-origin isolated pages load them.");
    } else {
      add(
        "corp-invalid",
        "low",
        CORP,
        "Unrecognized CORP value",
        `"${value}" is not same-origin, same-site or cross-origin, written in lowercase exactly once, so browsers ignore it.`,
      );
    }
  }
  return { coop, coep, corp };
}

/* --------------------------------------------------------------- cookies */

export interface CookieRow {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  /** The SameSite value as written, or null when absent. */
  sameSite: string | null;
  domain: string | null;
  path: string | null;
  prefix: "__Host-" | "__Secure-" | null;
  persistent: boolean;
  partitioned: boolean;
  /** Reasons a browser rejects the cookie outright. */
  rejected: string[];
}

const SESSIONISH = /sess|sid|auth|token|jwt|login|remember/i;

/** RFC 6265bis section 5.6, "the set-cookie string", reduced to what the audit needs. */
export function parseSetCookie(value: string): CookieRow {
  const [pair, ...attrs] = value.split(";");
  const eq = pair.indexOf("=");
  const name = (eq === -1 ? "" : pair.slice(0, eq)).trim();
  const row: CookieRow = {
    name,
    secure: false,
    httpOnly: false,
    sameSite: null,
    domain: null,
    path: null,
    prefix: null,
    persistent: false,
    partitioned: false,
    rejected: [],
  };
  for (const attr of attrs) {
    const i = attr.indexOf("=");
    const key = asciiLower((i === -1 ? attr : attr.slice(0, i)).trim());
    const v = (i === -1 ? "" : attr.slice(i + 1)).trim();
    if (key === "secure") row.secure = true;
    else if (key === "httponly") row.httpOnly = true;
    else if (key === "samesite") row.sameSite = v;
    else if (key === "domain") row.domain = v === "" ? null : v;
    else if (key === "path") row.path = v;
    else if (key === "expires" || key === "max-age") row.persistent = true;
    else if (key === "partitioned") row.partitioned = true;
  }
  // 6265bis compares the prefixes case-insensitively.
  const lowerName = asciiLower(name);
  if (lowerName.startsWith("__host-")) row.prefix = "__Host-";
  else if (lowerName.startsWith("__secure-")) row.prefix = "__Secure-";

  if (row.prefix && !row.secure) row.rejected.push(`a ${row.prefix} cookie must be Secure`);
  if (row.prefix === "__Host-" && row.domain !== null) row.rejected.push("a __Host- cookie may not set Domain");
  if (row.prefix === "__Host-" && row.path !== "/") row.rejected.push("a __Host- cookie must set Path=/");
  if (row.sameSite !== null && asciiLower(row.sameSite) === "none" && !row.secure) {
    row.rejected.push("SameSite=None requires Secure");
  }
  if (row.partitioned && !row.secure) row.rejected.push("Partitioned requires Secure");
  return row;
}

function checkCookies(r: ParsedResponse, add: Adder): CookieRow[] {
  // Set-Cookie is the one field that may not be combined with commas.
  const cookies = fields(r, "set-cookie").map((h) => parseSetCookie(h.value));
  const H = "Set-Cookie";
  if (cookies.length === 0) return cookies;
  const label = (c: CookieRow) => c.name || "(unnamed)";

  const rejected = cookies.filter((c) => c.rejected.length > 0);
  if (rejected.length) {
    add(
      "cookie-rejected",
      "medium",
      H,
      `${rejected.length === 1 ? "A cookie is" : `${rejected.length} cookies are`} rejected by browsers`,
      `${rejected.map((c) => `${label(c)}: ${c.rejected.join(", ")}`).slice(0, MAX_NAMES).join(". ")}${rejected.length > MAX_NAMES ? `. And ${rejected.length - MAX_NAMES} more` : ""}. Current browsers drop such a cookie entirely (RFC 6265bis for the prefixes and SameSite=None, CHIPS for Partitioned), so whatever depends on it fails.`,
    );
  }
  const live = cookies.filter((c) => c.rejected.length === 0);
  const noSecure = live.filter((c) => !c.secure);
  if (noSecure.length) {
    add(
      "cookie-secure",
      "medium",
      H,
      `${noSecure.length === 1 ? "A cookie lacks" : `${noSecure.length} cookies lack`} Secure: ${list(noSecure.map(label))}`,
      "Without Secure the browser also sends the cookie over plain HTTP, where anyone on the network path can read it. A single http:// request, even to a page that only redirects, is enough.",
    );
  }
  const noHttpOnly = live.filter((c) => !c.httpOnly);
  if (noHttpOnly.length) {
    const sessionish = noHttpOnly.some((c) => SESSIONISH.test(c.name));
    add(
      "cookie-httponly",
      sessionish ? "medium" : "low",
      H,
      `${noHttpOnly.length === 1 ? "A cookie lacks" : `${noHttpOnly.length} cookies lack`} HttpOnly: ${list(noHttpOnly.map(label))}`,
      `Script on the page can read ${noHttpOnly.length === 1 ? "it" : "them"} through document.cookie, so one cross-site scripting flaw can copy the value out.${sessionish ? " At least one name looks like a session or auth cookie, which is exactly the kind that needs HttpOnly." : " That is fine for a value script must read, such as a double-submit CSRF token."}`,
    );
  }
  const noSameSite = live.filter((c) => c.sameSite === null);
  if (noSameSite.length) {
    add(
      "cookie-samesite",
      "low",
      H,
      `${noSameSite.length === 1 ? "A cookie has" : `${noSameSite.length} cookies have`} no SameSite: ${list(noSameSite.map(label))}`,
      "Chrome treats a cookie without SameSite as Lax, but not every browser does, so the cookie may ride along on cross-site requests and help a CSRF attack. Set Lax, or Strict for cookies only same-site pages need.",
    );
  }
  const badSameSite = live.filter((c) => c.sameSite !== null && !["strict", "lax", "none"].includes(asciiLower(c.sameSite)));
  if (badSameSite.length) {
    add("cookie-samesite-invalid", "low", H, `Unrecognized SameSite value on ${list(badSameSite.map(label))}`, "The values are Strict, Lax and None. RFC 6265bis treats anything else as if SameSite were absent.");
  }
  const none = live.filter((c) => c.sameSite !== null && asciiLower(c.sameSite) === "none");
  if (none.length) {
    add("cookie-samesite-none", "info", H, `SameSite=None on ${list(none.map(label))}`, "These cookies go with every cross-site request. That is required for embedded and third-party use, and it means CSRF protection has to come from somewhere else, such as tokens.");
  }
  if (!rejected.length && !noSecure.length && !noHttpOnly.length && !noSameSite.length) {
    add("cookie-ok", "pass", H, `${cookies.length === 1 ? "The cookie sets" : `All ${cookies.length} cookies set`} Secure, HttpOnly and SameSite`, "Each cookie stays off plain HTTP, out of reach of page script, and off at least some cross-site requests.");
  }
  return cookies;
}

/* -------------------------------------------- deprecated and leaky headers */

const PRIVATE_V4 = /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/;

function checkLegacyAndLeaks(r: ParsedResponse, add: Adder): void {
  const xss = combined(r, "x-xss-protection");
  if (xss !== null) {
    if (xss.trim() === "0") {
      add("xxss-zero", "pass", "X-XSS-Protection", "X-XSS-Protection: 0", "The legacy XSS filter is explicitly off, which is the current recommendation. The header can also simply be removed.");
    } else {
      add(
        "xxss-on",
        "low",
        "X-XSS-Protection",
        `X-XSS-Protection: ${xss.trim()} should be 0 or absent`,
        "The XSS filter it controls was removed from Chrome in version 78 and from Edge, and Firefox never had one. Where it was implemented, the filter itself became a source of cross-site leaks and could be tricked into disabling legitimate scripts. Send 0 or nothing, and rely on CSP.",
      );
    }
  }
  if (fields(r, "expect-ct").length) {
    add(
      "expect-ct",
      "info",
      "Expect-CT",
      "Expect-CT is obsolete",
      "It asked browsers to enforce Certificate Transparency. Chrome, the browser that implemented it, has removed it, and Chrome and Safari require CT for publicly trusted certificates anyway. Remove it.",
    );
  }
  const hpkp = r.headers.filter((h) => h.lower === "public-key-pins" || h.lower === "public-key-pins-report-only");
  if (hpkp.length) {
    add(
      "hpkp",
      "low",
      hpkp[0].name,
      "HTTP Public Key Pinning is obsolete",
      "Chrome and Firefox removed HPKP because a wrong pin, or an attacker who set one, could lock visitors out of a site for the whole max-age. No current browser enforces it. Remove the header.",
    );
  }
  const prefixed = r.headers.filter((h) => h.lower === "x-content-security-policy" || h.lower === "x-webkit-csp");
  if (prefixed.length) {
    add("csp-prefixed", "info", prefixed[0].name, `${prefixed[0].name} is obsolete`, "The prefixed CSP headers predate the standard name, and current browsers ignore them. Remove them and rely on Content-Security-Policy.");
  }
  if (fields(r, "p3p").length) {
    add("p3p", "info", "P3P", "P3P is obsolete", "Only Internet Explorer acted on P3P compact policies. The header does nothing in any current browser.");
  }

  const server = combined(r, "server");
  if (server !== null) {
    if (/\d+\.\d+/.test(server) || /\/\s*\d/.test(server)) {
      add("server-version", "low", "Server", `Server reveals a version: ${server}`, "An exact version lets anyone match the server to published CVEs without probing. It is not a vulnerability in itself, but it saves an attacker a step; most servers can be told to send the product name only (server_tokens off in nginx, ServerTokens Prod in Apache).");
    } else {
      add("server-name", "info", "Server", `Server: ${server}`, "Naming the product without a version is common and gives little away.");
    }
  }
  const powered = fields(r, "x-powered-by");
  if (powered.length) {
    add("powered-by", "low", "X-Powered-By", `X-Powered-By: ${powered.map((h) => h.value).join(", ")}`, "This names the framework or language, often with a version, and no browser uses it. Turn it off at the source (expose_php = Off in PHP, app.disable('x-powered-by') in Express).");
  }
  for (const [lower, label] of [
    ["x-aspnet-version", "X-AspNet-Version"],
    ["x-aspnetmvc-version", "X-AspNetMvc-Version"],
    ["x-generator", "X-Generator"],
  ] as const) {
    const h = fields(r, lower);
    if (h.length) {
      add(`leak-${lower}`, "low", label, `${label}: ${h[0].value}`, "This header advertises the exact platform version and serves no purpose for browsers. Remove it in the server or framework configuration.");
    }
  }
  const debug = r.headers.filter((h) => h.lower === "x-debug-token" || h.lower === "x-debug-token-link");
  if (debug.length) {
    add("debug-token", "medium", debug[0].name, "A debug profiler is enabled", "X-Debug-Token comes from the Symfony profiler, which exposes request data, configuration and sometimes credentials through its web interface. It must not run in production.");
  }
  if (fields(r, "x-runtime").length) {
    add("x-runtime", "info", "X-Runtime", "X-Runtime reveals processing time", "Per-request timing makes timing side channels, such as telling valid usernames from invalid ones, easier to measure. It is usually safe to drop.");
  }
  const internal = r.headers.filter((h) => h.lower !== "set-cookie" && PRIVATE_V4.test(h.value));
  if (internal.length) {
    add(
      "private-ip",
      "low",
      internal[0].name,
      `Internal address in ${list([...new Set(internal.map((h) => h.name))])}`,
      `${internal[0].name} carries ${PRIVATE_V4.exec(internal[0].value)![0]}, a private RFC 1918 address. It maps out the network behind the proxy for anyone who looks.`,
    );
  }

  const acao = combined(r, "access-control-allow-origin");
  if (acao !== null) {
    const credentials = asciiLower(combined(r, "access-control-allow-credentials") ?? "") === "true";
    const v = acao.trim();
    if (asciiLower(v) === "null") {
      add("cors-null", "medium", "Access-Control-Allow-Origin", "CORS allows the null origin", "Sandboxed iframes and data: URLs send Origin: null, so any site can produce it. Allowing null lets any site read this response" + (credentials ? ", with the visitor's cookies." : "."));
    } else if (v === "*") {
      add(
        "cors-star",
        "info",
        "Access-Control-Allow-Origin",
        credentials ? "CORS wildcard with credentials does not work" : "Any site may read this response",
        credentials
          ? "Browsers refuse credentialed requests when the allowed origin is *, so this combination fails. If the server switches to echoing the request's Origin to make it work, it must check that origin against an allowlist."
          : "Reads are allowed without cookies. That is right for public data and wrong for anything protected only by network location, such as an intranet service.",
      );
    } else if (credentials) {
      add("cors-credentials", "info", "Access-Control-Allow-Origin", `Credentialed reads allowed for ${v}`, "If this value is copied from the request's Origin header rather than checked against a fixed list, every site gets credentialed access. Test with a different Origin and see whether it is echoed.");
    }
  }
}

/* -------------------------------------------------------------- suggestion */

export interface SuggestedLine {
  text: string;
  status: "keep" | "change" | "add";
  why: string;
}

export interface Suggestion {
  lines: SuggestedLine[];
  remove: { name: string; why: string }[];
}

const STARTER_CSP = "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'";

function suggest(
  r: ParsedResponse,
  ctx: {
    hsts: HstsParse | null;
    csp: CspSummary | null;
    xfo: string | null;
    nosniff: boolean;
    referrer: string | null;
    permissions: FeatureRule[] | null;
    coop: string | null;
  },
  findings: HeaderFinding[],
): Suggestion {
  const lines: SuggestedLine[] = [];
  const has = (id: string) => findings.some((f) => f.id === id);
  const original = (lower: string) => fields(r, lower)[0];

  // HSTS
  const hstsHeader = original("strict-transport-security");
  if (ctx.hsts && ctx.hsts.ok && ctx.hsts.maxAge! >= YEAR && ctx.hsts.includeSubDomains && ctx.hsts.valued.length === 0) {
    lines.push({ text: `Strict-Transport-Security: ${hstsHeader!.value}`, status: "keep", why: "Already a year or more with includeSubDomains." });
  } else {
    const preload = ctx.hsts?.ok && ctx.hsts.preload ? "; preload" : "";
    lines.push({
      text: `Strict-Transport-Security: max-age=31536000; includeSubDomains${preload}`,
      status: hstsHeader ? "change" : "add",
      why: "One year, covering subdomains. Confirm every subdomain serves HTTPS before adding includeSubDomains.",
    });
  }

  // CSP
  const policies = ctx.csp?.report.policies ?? [];
  const enforced = policies.find((p) => p.disposition === "enforce");
  const trial = policies.find((p) => p.disposition === "report");
  const oneLine = (s: string) => s.replace(/;\n/g, "; ");
  if (enforced) {
    const strong = enforced.script.level === "strict" || enforced.script.level === "blocked";
    const broadFraming = enforced.findings.some((f) => f.id === "frame-ancestors-broad");
    const framingNote = broadFraming ? " Its frame-ancestors still lets any site frame the page; narrow it to 'self'." : "";
    lines.push({
      text: `Content-Security-Policy: ${oneLine(enforced.hardened ?? enforced.normalized)}`,
      status: enforced.hardened || !strong || broadFraming ? "change" : "keep",
      why: enforced.hardened
        ? `Adds ${enforced.added.join(", ")}.${strong ? "" : " The script rules still need work; see the CSP analyzer."}${framingNote}`
        : strong
          ? `${broadFraming ? "Restricts scripts well." : "Already restricts scripts well."}${framingNote}`
          : `Nothing to add mechanically, but the script rules need work; see the CSP analyzer.${framingNote}`,
    });
  } else if (trial) {
    lines.push({
      text: `Content-Security-Policy: ${oneLine(trial.hardened ?? trial.normalized)}`,
      status: "add",
      why: "The report-only policy, enforced, once its reports are clean.",
    });
  } else {
    lines.push({
      text: `Content-Security-Policy: ${STARTER_CSP}`,
      status: "add",
      why: "A starting point. Trial it as Content-Security-Policy-Report-Only first, since it blocks inline script and third-party resources.",
    });
  }

  // Framing: only when nothing valid covers it.
  if (!ctx.csp?.frameAncestors) {
    const ok = has("xfo-ok");
    lines.push({
      text: ok ? `X-Frame-Options: ${(splitHeaderValues(ctx.xfo ?? "")[0] ?? "").trim().toUpperCase()}` : "X-Frame-Options: SAMEORIGIN",
      status: ok ? "keep" : ctx.xfo ? "change" : "add",
      why: ok ? "Valid. frame-ancestors in the CSP above supersedes it in current browsers." : "Stops other sites framing the page in browsers without frame-ancestors.",
    });
  }

  lines.push(
    ctx.nosniff
      ? { text: `X-Content-Type-Options: ${original("x-content-type-options")!.value}`, status: "keep", why: "Already nosniff." }
      : { text: "X-Content-Type-Options: nosniff", status: original("x-content-type-options") ? "change" : "add", why: "Stops content sniffing and wrong-type scripts." },
  );

  const goodReferrer = ctx.referrer !== null && REFERRER_POLICIES[ctx.referrer].severity === "pass" && !has("referrer-ignored");
  lines.push(
    goodReferrer
      ? { text: `Referrer-Policy: ${ctx.referrer}`, status: "keep", why: "Already a safe policy." }
      : {
          text: "Referrer-Policy: strict-origin-when-cross-origin",
          status: original("referrer-policy") ? "change" : "add",
          why: "Full URL on this origin, only the origin elsewhere, nothing over a downgrade.",
        },
  );

  lines.push(
    ctx.permissions
      ? { text: `Permissions-Policy: ${combined(r, "permissions-policy")}`, status: "keep", why: "Parses; review the feature list against what the page uses." }
      : {
          text: "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          status: original("permissions-policy") ? "change" : "add",
          why: "Switches off features most pages never use. Keep any the page does need.",
        },
  );

  const goodCoop = ctx.coop !== null && ctx.coop !== "unsafe-none";
  lines.push(
    goodCoop
      ? { text: `Cross-Origin-Opener-Policy: ${ctx.coop}`, status: "keep", why: "Already isolates the page from cross-origin windows." }
      : {
          text: "Cross-Origin-Opener-Policy: same-origin",
          status: original("cross-origin-opener-policy") ? "change" : "add",
          why: "Use same-origin-allow-popups instead if the page opens OAuth or payment popups.",
        },
  );

  const xss = combined(r, "x-xss-protection");
  if (xss !== null && xss.trim() !== "0") {
    lines.push({ text: "X-XSS-Protection: 0", status: "change", why: "Turns the legacy filter off, or remove the header entirely." });
  }
  const server = combined(r, "server");
  if (server !== null && has("server-version")) {
    const product = server.trim().split(/[\s/]/)[0];
    if (product !== "" && !/\d/.test(product)) {
      lines.push({ text: `Server: ${product}`, status: "change", why: "The product name without the version." });
    }
  }
  const serverIsVersion = server !== null && has("server-version") && /\d/.test(server.trim().split(/[\s/]/)[0] ?? "");

  const remove: Suggestion["remove"] = [];
  const removable: [string, string][] = [
    ["x-powered-by", "Names the framework; no browser uses it."],
    ["x-aspnet-version", "Advertises the platform version."],
    ["x-aspnetmvc-version", "Advertises the platform version."],
    ["x-generator", "Advertises the platform version."],
    ["x-debug-token", "Debug profiler; must not run in production."],
    ["x-debug-token-link", "Debug profiler; must not run in production."],
    ["x-runtime", "Timing data a browser does not need."],
    ["expect-ct", "Obsolete."],
    ["public-key-pins", "Obsolete and dangerous."],
    ["public-key-pins-report-only", "Obsolete."],
    ["x-content-security-policy", "Obsolete prefixed CSP."],
    ["x-webkit-csp", "Obsolete prefixed CSP."],
    ["p3p", "Obsolete."],
  ];
  if (serverIsVersion) remove.push({ name: original("server")!.name, why: "Carries a version number and no product name worth keeping." });
  for (const [lower, why] of removable) {
    const h = original(lower);
    if (h) remove.push({ name: h.name, why });
  }
  return { lines, remove };
}

/* ------------------------------------------------------------- top level */

type Adder = (id: string, severity: Severity, header: string, title: string, detail: string) => void;

export type HeaderCategory = "security" | "deprecated" | "leak" | "cookie" | "other";

const SECURITY_HEADERS = new Set([
  "strict-transport-security",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-opener-policy-report-only",
  "cross-origin-embedder-policy",
  "cross-origin-embedder-policy-report-only",
  "cross-origin-resource-policy",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "reporting-endpoints",
  "report-to",
  "nel",
  "clear-site-data",
]);
const DEPRECATED_HEADERS = new Set([
  "x-xss-protection",
  "expect-ct",
  "public-key-pins",
  "public-key-pins-report-only",
  "feature-policy",
  "x-content-security-policy",
  "x-webkit-csp",
  "p3p",
]);
const LEAK_HEADERS = new Set([
  "server",
  "x-powered-by",
  "x-aspnet-version",
  "x-aspnetmvc-version",
  "x-generator",
  "x-debug-token",
  "x-debug-token-link",
  "x-runtime",
  "via",
  "x-backend-server",
]);

export function categorize(lower: string): HeaderCategory {
  if (lower === "set-cookie") return "cookie";
  if (SECURITY_HEADERS.has(lower)) return "security";
  if (DEPRECATED_HEADERS.has(lower)) return "deprecated";
  if (LEAK_HEADERS.has(lower)) return "leak";
  return "other";
}

/** A Set-Cookie value with the cookie's value masked, for display. */
export function maskCookie(value: string): string {
  const semi = value.indexOf(";");
  const pair = semi === -1 ? value : value.slice(0, semi);
  const eq = pair.indexOf("=");
  if (eq === -1) return value;
  const v = pair.slice(eq + 1).trim();
  return `${pair.slice(0, eq + 1)}${v === "" ? "" : `[${v.length} chars hidden]`}${semi === -1 ? "" : value.slice(semi)}`;
}

export interface HeaderAudit {
  response: ParsedResponse;
  findings: HeaderFinding[];
  cookies: CookieRow[];
  csp: CspSummary | null;
  suggestion: Suggestion;
}

export type AuditResult = { ok: true; audit: HeaderAudit } | { ok: false; error: string | null };

export function auditHeaders(input: string): AuditResult {
  const parsed = parseRawHeaders(input);
  if (!parsed.ok) return parsed;
  const r = parsed.response;
  const findings: HeaderFinding[] = [];
  const ids = new Set<string>();
  const add: Adder = (id, severity, header, title, detail) => {
    if (ids.has(id)) return;
    ids.add(id);
    findings.push({ id, severity, header, title, detail });
  };

  if (r.earlierResponses > 0) {
    add(
      "earlier-responses",
      "info",
      "Input",
      `${r.earlierResponses} earlier ${r.earlierResponses === 1 ? "response was" : "responses were"} skipped`,
      `The paste holds more than one response, as curl -L prints for a redirect chain. Only the last one${r.status ? `, ${r.status},` : ""} is analyzed, since that is the page the browser ends up on. HSTS on the redirect itself matters too: paste that response on its own to check it.`,
    );
  }
  if (r.skipped > 0) {
    add("skipped-lines", "info", "Input", `${r.skipped} ${r.skipped === 1 ? "line was" : "lines were"} not headers`, "Lines that are not of the form Name: value, a status line or blank were skipped. If a header wrapped onto a new line without leading whitespace, rejoin it.");
  }
  if (r.truncated > 0) {
    add("truncated", "info", "Input", "Only the first headers were read", `The response has more than ${MAX_HEADERS} header lines; the last ${r.truncated} were not analyzed.`);
  }
  if (r.statusCode !== null && r.statusCode >= 300 && r.statusCode < 400) {
    add("redirect", "info", "Input", "This is a redirect", "A redirect is rarely rendered, so page-level headers like CSP matter less here than on the destination. HSTS on the redirect still counts. Run curl -IL to see the whole chain.");
  }

  const hsts = checkHsts(r, add);
  const csp = checkCsp(r, add);
  const xfo = checkFraming(r, csp, add);
  const nosniff = checkNosniff(r, add);
  const referrer = checkReferrer(r, add);
  const permissions = checkPermissions(r, add);
  const { coop } = checkCrossOrigin(r, add);
  const cookies = checkCookies(r, add);
  checkLegacyAndLeaks(r, add);

  const suggestion = suggest(r, { hsts, csp, xfo, nosniff, referrer, permissions, coop }, findings);
  return { ok: true, audit: { response: r, findings: sortFindings(findings), cookies, csp, suggestion } };
}
