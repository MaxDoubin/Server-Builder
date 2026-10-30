/**
 * Parsing and triage logic for the access log analyzer.
 *
 * The two layouts are defined by Apache's mod_log_config:
 *
 *   common    %h %l %u %t "%r" %>s %b
 *   combined  %h %l %u %t "%r" %>s %b "%{Referer}i" "%{User-Agent}i"
 *
 * nginx's built-in "combined" format writes the same fields in the same
 * order, except that $body_bytes_sent logs 0 where Apache's %b logs "-".
 * A leading "%v:%p" virtual host field (Apache's vhost_combined) is accepted,
 * and anything after the user agent (response times, upstream fields) is
 * ignored rather than treated as an error.
 *
 * Detection is pattern matching on a normalized copy of each field: log
 * escapes undone, percent-encoding decoded up to three times, lowercased.
 * It flags what a request tried, not whether it worked. Everything here is
 * pure data in and data out, with no DOM access, so it can be unit tested.
 */

/* ------------------------------------------------------------------ limits */

/** Characters read from a paste or file. Larger input is cut at a line end. */
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
/** Non-blank lines examined. A 20 MiB log of short lines can approach this. */
export const MAX_LINES = 400_000;
/** One line longer than this is reported as unparsed instead of matched. */
export const MAX_LINE_CHARS = 32 * 1024;
/** How many unparsed lines are kept as examples. All of them are counted. */
export const UNPARSED_SAMPLE_LIMIT = 25;
/** Rows in each top list. */
export const TOP_N = 15;
/** Bars in the requests over time chart, at most. */
export const MAX_BUCKETS = 60;
/** An IP with at least this many 404s, making up at least this share, is listed. */
export const DISCOVERY_MIN_404 = 25;
export const DISCOVERY_MIN_SHARE = 0.5;

/* ------------------------------------------------------------------- rules */

export type RuleId =
  | "sqli"
  | "xss"
  | "traversal"
  | "cmdi"
  | "log4shell"
  | "shellshock"
  | "scanner"
  | "probe"
  | "proxy"
  | "malformed";

export type Severity = "high" | "medium" | "low";

export interface Rule {
  id: RuleId;
  bit: number;
  label: string;
  severity: Severity;
  summary: string;
}

export const RULES: Rule[] = [
  {
    id: "sqli",
    bit: 1 << 0,
    label: "SQL injection",
    severity: "high",
    summary: "UNION SELECT, quote-and-OR tautologies, time delays, schema enumeration or stacked queries.",
  },
  {
    id: "xss",
    bit: 1 << 1,
    label: "Cross-site scripting",
    severity: "high",
    summary: "Script or event handler markup, javascript: URLs, or alert() style probes.",
  },
  {
    id: "traversal",
    bit: 1 << 2,
    label: "Path traversal",
    severity: "high",
    summary: "Dot-dot segments after decoding, or requests naming /etc/passwd, win.ini and similar files.",
  },
  {
    id: "cmdi",
    bit: 1 << 3,
    label: "Command injection",
    severity: "high",
    summary: "Shell separators followed by commands such as wget, curl, id or sh, typical of IoT botnet droppers.",
  },
  {
    id: "log4shell",
    bit: 1 << 4,
    label: "Log4Shell lookup",
    severity: "high",
    summary: "A ${jndi:...} or nested ${...} lookup aimed at Log4j (CVE-2021-44228), in any field.",
  },
  {
    id: "shellshock",
    bit: 1 << 5,
    label: "Shellshock",
    severity: "high",
    summary: "A bash function definition, () {, in a header or URL, aimed at CGI scripts (CVE-2014-6271).",
  },
  {
    id: "scanner",
    bit: 1 << 6,
    label: "Scanner user agent",
    severity: "medium",
    summary: "The user agent names a known scanning tool. Most scanners can change it, so absence proves nothing.",
  },
  {
    id: "probe",
    bit: 1 << 7,
    label: "Sensitive path probe",
    severity: "medium",
    summary: ".env, .git, wp-login.php, phpMyAdmin, backups and other paths that bots request on every host.",
  },
  {
    id: "proxy",
    bit: 1 << 8,
    label: "Open proxy probe",
    severity: "medium",
    summary: "A CONNECT request, or an absolute http:// target, which only a forward proxy should receive.",
  },
  {
    id: "malformed",
    bit: 1 << 9,
    label: "Malformed request line",
    severity: "low",
    summary: "Not METHOD target HTTP/version. Often TLS or another protocol spoken to a plain HTTP port.",
  },
];

const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));
const BIT = Object.fromEntries(RULES.map((rule) => [rule.id, rule.bit])) as Record<RuleId, number>;

export function ruleById(id: RuleId): Rule {
  return RULE_BY_ID.get(id) as Rule;
}

export function rulesIn(flags: number): Rule[] {
  return RULES.filter((rule) => (flags & rule.bit) !== 0);
}

interface Pattern {
  re: RegExp;
  label: string;
}

/*
  Every pattern below runs on one line of at most MAX_LINE_CHARS, and none
  nests a quantifier inside another, so none can backtrack catastrophically.
  Whitespace runs are bounded ({0,10}) for the same reason.
*/

const SQLI: Pattern[] = [
  { re: /\bunion\b[\s(]{1,20}(?:all\b[\s(]{1,20}|distinct\b[\s(]{1,20})?select\b/, label: "UNION SELECT" },
  {
    re: /['"`]\s{0,10}\)?(?:\s{1,10}(?:or|and|xor)\s{1,10}|\s{0,10}(?:\|\||&&)\s{0,10})\(?['"`]?\w{0,30}['"`]?\s{0,10}(?:=|<|>|like\b)/,
    label: "quote then OR/AND comparison",
  },
  { re: /\b(?:or|and)\s{1,10}(\d{1,10})\s{0,10}=\s{0,10}\1\b/, label: "OR n=n tautology" },
  { re: /['"`]\)?\s{0,10}(?:--|#)/, label: "quote then comment" },
  { re: /\b(?:sleep|pg_sleep)\s{0,10}\(\s{0,10}\d/, label: "sleep() time delay" },
  { re: /\bbenchmark\s{0,10}\(\s{0,10}\d/, label: "benchmark() time delay" },
  { re: /\bwaitfor\s{1,10}delay\s{0,10}['"]/, label: "WAITFOR DELAY" },
  { re: /\binformation_schema\b/, label: "information_schema" },
  { re: /\b(?:sysobjects|syscolumns|sqlite_master|pg_catalog|mysql\.user)\b/, label: "system catalog" },
  { re: /\b(?:extractvalue|updatexml|load_file|group_concat)\s{0,10}\(/, label: "error-based or file function" },
  { re: /\binto\s{1,10}(?:out|dump)file\b/, label: "INTO OUTFILE" },
  { re: /@@(?:version|datadir|hostname)\b/, label: "server variable" },
  { re: /\b(?:concat|concat_ws|char)\s{0,10}\(\s{0,10}0x[0-9a-f]{2}/, label: "hex-encoded string" },
  { re: /\bxp_cmdshell\b/, label: "xp_cmdshell" },
  { re: /;\s{0,10}(?:drop|truncate)\s{1,10}table\b/, label: "stacked DROP TABLE" },
  { re: /\border\s{1,10}by\s{1,10}\d{1,3}\s{0,10}(?:--|#)/, label: "ORDER BY column count" },
];

const XSS: Pattern[] = [
  {
    re: /<\s{0,5}\/?\s{0,5}(?:script|iframe|svg|img|body|object|embed|marquee|details|video|audio|math|style|link|meta|base|form|input)\b/,
    label: "HTML tag",
  },
  {
    re: /\bon(?:error|load|mouseover|mouseenter|focus|blur|click|toggle|begin|animationstart|pointerover|pageshow|hashchange)\s{0,10}=/,
    label: "event handler attribute",
  },
  { re: /(?:java|vb)script\s{0,10}:/, label: "javascript: URL" },
  { re: /\bdata\s{0,5}:\s{0,5}text\/html/, label: "data:text/html URL" },
  { re: /\b(?:alert|prompt|confirm)\s{0,10}[(`]/, label: "alert() probe" },
  { re: /document\s{0,5}\.\s{0,5}(?:cookie|domain|write)\b/, label: "document.cookie" },
  { re: /\bstring\s{0,5}\.\s{0,5}fromcharcode\s{0,5}\(/, label: "String.fromCharCode" },
];

const TRAVERSAL: Pattern[] = [
  { re: /\.\.(?:;[^/]{0,20})?\//, label: "dot-dot segment" },
  { re: /(?:^|\/)\.\.$/, label: "trailing dot-dot" },
  { re: /\/etc\/(?:passwd|shadow|group|hosts)\b/, label: "/etc system file" },
  { re: /\/proc\/self\/(?:environ|cmdline|fd)/, label: "/proc/self" },
  { re: /(?:^|[/=])(?:win|boot|system)\.ini\b/, label: "Windows .ini file" },
  { re: /\bc:\/windows\//, label: "C:\\Windows path" },
];

const CMDI: Pattern[] = [
  {
    re: /(?:;|\|\|?|&&|`|\$\(|\n)\s{0,10}(?:wget|curl|tftp|busybox|chmod|nc|ncat|bash|sh|rm|cat|id|uname|whoami|python3?|perl|powershell|ping|echo)(?![\w=-])/,
    label: "separator then command",
  },
  { re: /\$\{ifs\}/, label: "${IFS} space substitute" },
  { re: /\/bin\/(?:ba|da|z)?sh\b/, label: "/bin/sh" },
  { re: /\bcmd(?:\.exe)?\s{0,5}\/c\b/, label: "cmd /c" },
];

const LOG4SHELL: Pattern[] = [
  {
    re: /\$\{\s{0,5}(?:jndi|lower|upper|env|sys|date|main|ctx|java|base64|::-|\$\{)/,
    label: "${...} lookup",
  },
];

const SHELLSHOCK: Pattern[] = [{ re: /\(\s{0,5}\)\s{0,5}\{/, label: "() { function definition" }];

const SCANNERS: Pattern[] = [
  { re: /sqlmap/, label: "sqlmap" },
  { re: /nikto/, label: "Nikto" },
  { re: /nmap scripting engine|\bnmap\b/, label: "Nmap" },
  { re: /masscan/, label: "masscan" },
  { re: /zgrab/, label: "ZGrab" },
  { re: /wpscan/, label: "WPScan" },
  { re: /nuclei/, label: "Nuclei" },
  { re: /gobuster/, label: "Gobuster" },
  { re: /dirbuster/, label: "DirBuster" },
  { re: /feroxbuster/, label: "feroxbuster" },
  { re: /\bffuf\b|fuzz faster u fool/, label: "ffuf" },
  { re: /wfuzz/, label: "Wfuzz" },
  { re: /acunetix/, label: "Acunetix" },
  { re: /netsparker/, label: "Netsparker" },
  { re: /openvas/, label: "OpenVAS" },
  { re: /nessus/, label: "Nessus" },
  { re: /whatweb/, label: "WhatWeb" },
  { re: /\bhydra\b/, label: "THC Hydra" },
  { re: /zmeu/, label: "ZmEu" },
  { re: /jorgee/, label: "Jorgee" },
];

/** Matched against the decoded, lowercased path with the query string removed. */
const PROBES: Pattern[] = [
  { re: /\/\.env(?:\.[a-z0-9_.-]{0,40})?(?:$|\/)/, label: ".env file" },
  { re: /\/\.git(?:\/|$)/, label: ".git metadata" },
  { re: /\/\.(?:svn|hg|bzr)(?:\/|$)/, label: "VCS metadata" },
  { re: /\/\.ds_store$/, label: ".DS_Store" },
  { re: /\/wp-login\.php$/, label: "WordPress login" },
  { re: /\/xmlrpc\.php$/, label: "WordPress XML-RPC" },
  { re: /\/wp-admin\/(?:install|setup-config)\.php$/, label: "WordPress installer" },
  { re: /\/wp-includes\/wlwmanifest\.xml$/, label: "WordPress fingerprint" },
  { re: /\/wp-config\.php(?:\.[a-z0-9]{1,10}|~)$/, label: "wp-config.php backup" },
  { re: /\/(?:phpmyadmin|pma|myadmin|mysqladmin)(?:\/|$)|\/adminer(?:-[\d.]{1,20})?\.php$/, label: "database admin panel" },
  { re: /\/server-(?:status|info)(?:\/|$)/, label: "Apache status page" },
  { re: /\/actuator(?:\/|$)/, label: "Spring Boot actuator" },
  { re: /\/manager\/html(?:\/|$)/, label: "Tomcat manager" },
  { re: /\/_ignition\/execute-solution$/, label: "Laravel Ignition (CVE-2021-3129)" },
  { re: /\/vendor\/phpunit\/[^?]{0,200}eval-stdin\.php$/, label: "PHPUnit eval-stdin (CVE-2017-9841)" },
  {
    re: /\/\.(?:aws\/credentials|ssh\/|htpasswd|htaccess|npmrc|git-credentials|docker\/config\.json)|\/id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/,
    label: "credential file",
  },
  {
    re: /\/(?:backup|backups|db|database|dump|site|www|wwwroot|web|public_html|htdocs|data)\.(?:sql|sql\.gz|tar|tar\.gz|tgz|zip|rar|7z|bak)$/,
    label: "backup archive",
  },
  {
    re: /\/(?:config|configuration|settings|database|db|local)\.(?:php|inc|yml|yaml|json|ini|xml)(?:\.bak|\.old|\.orig|\.save|\.swp|~)$/,
    label: "config file backup",
  },
];

/* ----------------------------------------------------------- normalization */

const C_ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", v: "\v" };

/**
 * Undo the escaping Apache (ap_escape_logitem) and nginx apply to quoted
 * fields: \" and \\, C style \n \r \t \b \v, and \xHH for everything else.
 */
export function unescapeLogField(s: string): string {
  if (s.indexOf("\\") === -1) return s;
  return s.replace(/\\(x[0-9a-fA-F]{2}|[\s\S])/g, (_, g: string) => {
    if (g.length === 3) return String.fromCharCode(parseInt(g.slice(1), 16));
    return C_ESCAPES[g] ?? g;
  });
}

function percentDecodeOnce(s: string): string {
  // %u0041 is the non-standard IIS form; RFC 3986 defines only %HH. Bytes are
  // mapped one to one onto code points 0 to 255, so malformed UTF-8 can never
  // throw the way decodeURIComponent does.
  return s.replace(/%(?:u([0-9a-fA-F]{4})|([0-9a-fA-F]{2}))/g, (_, u?: string, h?: string) =>
    String.fromCharCode(parseInt((u ?? h) as string, 16)),
  );
}

/**
 * The form every pattern is matched against. Percent decoding repeats up to
 * three times so %252e%252e%252f (double encoded ../) is seen. The overlong
 * UTF-8 forms C0 AE, C0 AF and C1 9C, which old IIS decoded to ., / and \,
 * are folded to those characters before lowercasing. Backslashes become
 * slashes and + becomes a space (form encoding), for matching only.
 */
export function normalizeForMatch(raw: string): string {
  let s = unescapeLogField(raw);
  for (let i = 0; i < 3 && s.indexOf("%") !== -1; i++) {
    const next = percentDecodeOnce(s);
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\xC0\xAE/g, ".").replace(/\xC0\xAF/g, "/").replace(/\xC1\x9C/g, "\\");
  return s.toLowerCase().replace(/\+/g, " ").replace(/\\/g, "/");
}

/** MySQL treats /* *\/ as whitespace and runs /*!50000 ... *\/ as code. Both become spaces. */
function sqlView(norm: string): string {
  return norm.indexOf("/*") === -1 && norm.indexOf("*/") === -1
    ? norm
    : norm.replace(/\/\*!?\d{0,6}/g, " ").replace(/\*\//g, " ");
}

function firstMatch(patterns: Pattern[], s: string): string | null {
  for (const p of patterns) if (p.re.test(s)) return p.label;
  return null;
}

/** Injection rules, which apply to the target and to the two quoted headers. */
function injectionFlags(norm: string): number {
  let flags = 0;
  if (firstMatch(SQLI, sqlView(norm))) flags |= BIT.sqli;
  if (firstMatch(XSS, norm)) flags |= BIT.xss;
  if (firstMatch(CMDI, norm)) flags |= BIT.cmdi;
  if (firstMatch(LOG4SHELL, norm)) flags |= BIT.log4shell;
  if (firstMatch(SHELLSHOCK, norm)) flags |= BIT.shellshock;
  return flags;
}

function pathOf(target: string): string {
  const q = target.search(/[?#]/);
  return q === -1 ? target : target.slice(0, q);
}

function targetFlags(target: string): number {
  if (target === "") return 0;
  const norm = normalizeForMatch(target);
  let flags = injectionFlags(norm);
  if (firstMatch(TRAVERSAL, norm)) flags |= BIT.traversal;
  if (firstMatch(PROBES, normalizeForMatch(pathOf(target)))) flags |= BIT.probe;
  return flags;
}

function agentFlags(agent: string): number {
  const norm = normalizeForMatch(agent);
  let flags = injectionFlags(norm);
  if (firstMatch(SCANNERS, norm)) flags |= BIT.scanner;
  return flags;
}

/* ----------------------------------------------------------------- parsing */

export type LogFormat = "combined" | "common";

export interface LogEntry {
  /** 1-based line number in the input. */
  line: number;
  vhost: string | null;
  ip: string;
  ident: string | null;
  user: string | null;
  /** The bracketed timestamp as written. */
  rawTime: string;
  /** Milliseconds since the Unix epoch, UTC. */
  time: number;
  /** The zone offset written in the line, in minutes east of UTC. */
  offsetMin: number;
  /** The request line as logged, escapes intact. */
  request: string;
  /** Empty when the request line did not parse. */
  method: string;
  target: string;
  protocol: string;
  status: number;
  /** Response bytes. Null for "-". */
  bytes: number | null;
  referer: string | null;
  userAgent: string | null;
  format: LogFormat;
  /** Bitmask of Rule.bit values. */
  flags: number;
}

export interface UnparsedLine {
  line: number;
  reason: string;
  text: string;
}

export interface ParseResult {
  entries: LogEntry[];
  /** Non-blank lines examined, parsed or not. */
  examined: number;
  blankLines: number;
  unparsedCount: number;
  unparsed: UnparsedLine[];
  /** True when MAX_LINES was reached and the rest of the input was not read. */
  truncated: boolean;
  formats: Record<LogFormat, number>;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function daysInMonth(year: number, month: number): number {
  if (month === 1) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}

const TIME_RE = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;

/**
 * Parses the %t timestamp, strftime's "%d/%b/%Y:%H:%M:%S %z". Returns null
 * for anything that is not a real calendar instant.
 */
export function parseClfTime(s: string): { time: number; offsetMin: number } | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  const year = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const offH = Number(m[8]);
  const offM = Number(m[9]);
  if (month === undefined) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 60 || offH > 23 || offM > 59) return null;
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0 to 99 onto 1900 to 1999.
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  d.setUTCHours(hour, minute, second, 0);
  const offsetMin = (m[7] === "-" ? -1 : 1) * (offH * 60 + offM);
  return { time: d.getTime() - offsetMin * 60_000, offsetMin };
}

const LINE_RE =
  /^(\S+(?: +\S+){2,3}) +\[([^\]]{1,40})\] +"((?:[^"\\]|\\.)*)" +(\d{3}) +(\d+|-)(.*)$/;
const TAIL_RE = /^ +"((?:[^"\\]|\\.)*)" +"((?:[^"\\]|\\.)*)"/;
const TOKEN = "[A-Za-z][A-Za-z0-9!#$%&'*+.^_`|~-]{0,31}";
// RFC 9112 section 3: request-line = method SP request-target SP HTTP-version.
// A target holding raw spaces is accepted, since servers log what arrived.
const REQ_FULL = new RegExp(`^(${TOKEN}) (.+) (HTTP/\\d+(?:\\.\\d+)?)$`);
// HTTP/0.9 sent "GET /path" with no version at all.
const REQ_SIMPLE = new RegExp(`^(${TOKEN}) (\\S+)$`);

function dash(s: string): string | null {
  return s === "-" ? null : s;
}

function clip(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

interface Caches {
  target: Map<string, number>;
  agent: Map<string, number>;
  referer: Map<string, number>;
}

const CACHE_CAP = 100_000;

function cached(map: Map<string, number>, key: string, fn: (s: string) => number): number {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const value = fn(key);
  if (map.size >= CACHE_CAP) map.clear();
  map.set(key, value);
  return value;
}

type LineOutcome = { entry: LogEntry } | { reason: string };

function parseLine(text: string, lineNo: number, caches: Caches): LineOutcome {
  const m = LINE_RE.exec(text);
  if (!m) {
    if (!/\[[^\]]*\]/.test(text)) return { reason: "no [timestamp] field" };
    if (!/"/.test(text)) return { reason: "no quoted request line" };
    return { reason: "does not match the common or combined layout" };
  }
  const when = parseClfTime(m[2]);
  if (!when) return { reason: `timestamp "${clip(m[2], 40)}" is not dd/Mon/yyyy:HH:MM:SS +hhmm` };

  const prefix = m[1].split(/ +/);
  const hasVhost = prefix.length === 4;
  const [ip, ident, user] = hasVhost ? prefix.slice(1) : prefix;

  let bytes: number | null = null;
  if (m[5] !== "-") {
    const n = Number(m[5]);
    if (!Number.isSafeInteger(n)) return { reason: "byte count is too large to be real" };
    bytes = n;
  }

  let format: LogFormat = "common";
  let referer: string | null = null;
  let userAgent: string | null = null;
  const tail = TAIL_RE.exec(m[6]);
  if (tail) {
    format = "combined";
    referer = dash(tail[1]);
    userAgent = dash(tail[2]);
  }

  const request = m[3];
  const req = REQ_FULL.exec(request) ?? REQ_SIMPLE.exec(request);
  const method = req ? req[1] : "";
  const target = req ? req[2] : "";
  const protocol = req && req[3] ? req[3] : "";

  let flags = cached(caches.target, target, targetFlags);
  if (userAgent) flags |= cached(caches.agent, userAgent, agentFlags);
  if (referer) flags |= cached(caches.referer, referer, injectionFlagsOfRaw);
  if (method.toUpperCase() === "CONNECT" || /^https?:\/\//i.test(target)) flags |= BIT.proxy;
  if (!req && request !== "-" && request !== "") flags |= BIT.malformed;

  return {
    entry: {
      line: lineNo,
      vhost: hasVhost ? prefix[0] : null,
      ip,
      ident: dash(ident),
      user: dash(user),
      rawTime: m[2],
      time: when.time,
      offsetMin: when.offsetMin,
      request,
      method,
      target,
      protocol,
      status: Number(m[4]),
      bytes,
      referer,
      userAgent,
      format,
      flags,
    },
  };
}

function injectionFlagsOfRaw(raw: string): number {
  return injectionFlags(normalizeForMatch(raw));
}

/**
 * Parses a whole log. Lines are walked with indexOf rather than split, so a
 * 20 MiB paste of blank lines does not become a 20 million element array.
 */
export function parseLog(text: string, maxLines = MAX_LINES): ParseResult {
  const entries: LogEntry[] = [];
  const unparsed: UnparsedLine[] = [];
  const formats: Record<LogFormat, number> = { combined: 0, common: 0 };
  const caches: Caches = { target: new Map(), agent: new Map(), referer: new Map() };
  let examined = 0;
  let blankLines = 0;
  let unparsedCount = 0;
  let truncated = false;
  let lineNo = 0;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const reject = (line: number, reason: string, raw: string) => {
    unparsedCount++;
    if (unparsed.length < UNPARSED_SAMPLE_LIMIT) unparsed.push({ line, reason, text: clip(raw) });
  };

  while (pos < text.length) {
    let nl = text.indexOf("\n", pos);
    if (nl === -1) nl = text.length;
    const raw = text.slice(pos, nl);
    pos = nl + 1;
    lineNo++;

    const line = raw.trim();
    if (line === "") {
      blankLines++;
      continue;
    }
    if (examined >= maxLines) {
      truncated = true;
      break;
    }
    examined++;
    if (line.length > MAX_LINE_CHARS) {
      reject(lineNo, `longer than ${MAX_LINE_CHARS.toLocaleString("en-US")} characters`, line);
      continue;
    }
    const outcome = parseLine(line, lineNo, caches);
    if ("entry" in outcome) {
      entries.push(outcome.entry);
      formats[outcome.entry.format]++;
    } else {
      reject(lineNo, outcome.reason, line);
    }
  }

  return { entries, examined, blankLines, unparsedCount, unparsed, truncated, formats };
}

/* -------------------------------------------------------------- explaining */

export interface Explanation {
  rule: Rule;
  detail: string;
}

/** Which pattern raised each flag on an entry, and in which field. Used for display only. */
export function explainEntry(entry: LogEntry): Explanation[] {
  const out: Explanation[] = [];
  const fields: { name: string; norm: string }[] = [];
  if (entry.target) fields.push({ name: "target", norm: normalizeForMatch(entry.target) });
  if (entry.userAgent) fields.push({ name: "user agent", norm: normalizeForMatch(entry.userAgent) });
  if (entry.referer) fields.push({ name: "referer", norm: normalizeForMatch(entry.referer) });

  const injection: [RuleId, Pattern[]][] = [
    ["sqli", SQLI],
    ["xss", XSS],
    ["cmdi", CMDI],
    ["log4shell", LOG4SHELL],
    ["shellshock", SHELLSHOCK],
  ];
  for (const rule of RULES) {
    if ((entry.flags & rule.bit) === 0) continue;
    let detail = "";
    const list = injection.find(([id]) => id === rule.id);
    if (list) {
      for (const f of fields) {
        const hit = firstMatch(list[1], rule.id === "sqli" ? sqlView(f.norm) : f.norm);
        if (hit) {
          detail = `${hit} in ${f.name}`;
          break;
        }
      }
    } else if (rule.id === "traversal") {
      detail = firstMatch(TRAVERSAL, normalizeForMatch(entry.target)) ?? "";
    } else if (rule.id === "probe") {
      detail = firstMatch(PROBES, normalizeForMatch(pathOf(entry.target))) ?? "";
    } else if (rule.id === "scanner") {
      detail = firstMatch(SCANNERS, normalizeForMatch(entry.userAgent ?? "")) ?? "";
    } else if (rule.id === "proxy") {
      detail = entry.method.toUpperCase() === "CONNECT" ? "CONNECT method" : "absolute-form target";
    } else if (rule.id === "malformed") {
      detail = entry.request.startsWith("\\x16\\x03") ? "TLS handshake bytes" : "unrecognized request line";
    }
    out.push({ rule, detail });
  }
  return out;
}

/* --------------------------------------------------------------- filtering */

export type FilterResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Strict dotted quad. Leading zeros are refused because some parsers read them as octal. */
export function parseIPv4(s: string): number | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/** RFC 4291 section 2.2 text forms, including :: and a trailing dotted quad. A %zone is dropped. */
export function parseIPv6(input: string): bigint | null {
  const s = input.replace(/%[\w.-]+$/, "");
  if (!/^[0-9a-fA-F:.]+$/.test(s) || s.indexOf(":") === -1) return null;
  const halves = s.split("::");
  if (halves.length > 2) return null;

  const groups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    const items = part.split(":");
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (i === items.length - 1 && item.indexOf(".") !== -1) {
        const v4 = parseIPv4(item);
        if (v4 === null) return null;
        out.push(Math.floor(v4 / 65536), v4 % 65536);
      } else if (/^[0-9a-fA-F]{1,4}$/.test(item)) {
        out.push(parseInt(item, 16));
      } else {
        return null;
      }
    }
    return out;
  };

  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return null;
  // A dotted quad may only end the address, never sit before a "::".
  if (halves.length === 2 && halves[0].indexOf(".") !== -1) return null;
  let all: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    all = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    all = head;
  }
  if (all.length !== 8) return null;
  return all.reduce((acc, g) => (acc << 16n) | BigInt(g), 0n);
}

type IpTest = (ip: string) => boolean;

/** The IPv4 value of an address, including an IPv4-mapped ::ffff:a.b.c.d. */
function v4Of(ip: string): number | null {
  const v4 = parseIPv4(ip);
  if (v4 !== null) return v4;
  const v6 = parseIPv6(ip);
  if (v6 !== null && v6 >> 32n === 0xffffn) return Number(v6 & 0xffffffffn);
  return null;
}

/**
 * Comma or space separated terms, any of which may match: an exact address,
 * an IPv4 or IPv6 CIDR block, or a prefix ending in *.
 */
export function parseIpFilter(input: string): FilterResult<IpTest | null> {
  const terms = input.split(/[\s,]+/).filter(Boolean);
  if (terms.length === 0) return { ok: true, value: null };
  const tests: IpTest[] = [];
  for (const term of terms) {
    if (term.endsWith("*")) {
      const prefix = term.slice(0, -1).toLowerCase();
      tests.push((ip) => ip.toLowerCase().startsWith(prefix));
      continue;
    }
    const slash = term.indexOf("/");
    if (slash !== -1) {
      const addr = term.slice(0, slash);
      const bitsText = term.slice(slash + 1);
      if (!/^\d{1,3}$/.test(bitsText)) {
        return { ok: false, error: `"${term}": the prefix length after / must be a number.` };
      }
      const bits = Number(bitsText);
      const v4 = parseIPv4(addr);
      if (v4 !== null) {
        if (bits > 32) return { ok: false, error: `"${term}": an IPv4 prefix is 0 to 32 bits.` };
        const size = 2 ** (32 - bits);
        const base = Math.floor(v4 / size) * size;
        tests.push((ip) => {
          const v = v4Of(ip);
          return v !== null && v >= base && v < base + size;
        });
        continue;
      }
      const v6 = parseIPv6(addr);
      if (v6 !== null) {
        if (bits > 128) return { ok: false, error: `"${term}": an IPv6 prefix is 0 to 128 bits.` };
        const shift = BigInt(128 - bits);
        const base = v6 >> shift;
        tests.push((ip) => {
          const v = parseIPv6(ip);
          return v !== null && v >> shift === base;
        });
        continue;
      }
      return { ok: false, error: `"${addr}" is not an IPv4 or IPv6 address.` };
    }
    const exactV4 = parseIPv4(term);
    if (exactV4 !== null) {
      tests.push((ip) => v4Of(ip) === exactV4);
      continue;
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(term)) {
      return {
        ok: false,
        error: `"${term}" is not a valid IPv4 address. Each part is 0 to 255, written without leading zeros.`,
      };
    }
    const v6 = term.indexOf(":") !== -1 ? parseIPv6(term) : null;
    if (term.indexOf(":") !== -1 && v6 === null) {
      return { ok: false, error: `"${term}" is not a valid IPv6 address.` };
    }
    if (v6 !== null) {
      tests.push((ip) => parseIPv6(ip) === v6);
    } else {
      const exact = term.toLowerCase();
      tests.push((ip) => ip.toLowerCase() === exact);
    }
  }
  return { ok: true, value: (ip) => tests.some((t) => t(ip)) };
}

type StatusTest = (status: number) => boolean;

/** Comma or space separated: 404, 4xx, or a range such as 500-504. */
export function parseStatusFilter(input: string): FilterResult<StatusTest | null> {
  const terms = input.split(/[\s,]+/).filter(Boolean);
  if (terms.length === 0) return { ok: true, value: null };
  const tests: StatusTest[] = [];
  for (const term of terms) {
    let m: RegExpExecArray | null;
    if (/^\d{3}$/.test(term)) {
      const code = Number(term);
      tests.push((s) => s === code);
    } else if ((m = /^([1-9])xx$/i.exec(term))) {
      const lo = Number(m[1]) * 100;
      tests.push((s) => s >= lo && s < lo + 100);
    } else if ((m = /^(\d{3})-(\d{3})$/.exec(term))) {
      const lo = Number(m[1]);
      const hi = Number(m[2]);
      if (lo > hi) return { ok: false, error: `"${term}": the range runs backward. Write the lower code first.` };
      tests.push((s) => s >= lo && s <= hi);
    } else {
      return {
        ok: false,
        error: `"${term}" is not a status filter. Use a code (404), a class (4xx) or a range (500-504).`,
      };
    }
  }
  return { ok: true, value: (s) => tests.some((t) => t(s)) };
}

export type FlagFilter = "all" | "flagged" | "clean" | RuleId;

export function filterEntries(
  entries: LogEntry[],
  ipTest: IpTest | null,
  statusTest: StatusTest | null,
  flag: FlagFilter,
): LogEntry[] {
  if (!ipTest && !statusTest && flag === "all") return entries;
  const ipCache = new Map<string, boolean>();
  const bit = flag === "all" || flag === "flagged" || flag === "clean" ? 0 : BIT[flag];
  return entries.filter((e) => {
    if (statusTest && !statusTest(e.status)) return false;
    if (flag === "flagged" && e.flags === 0) return false;
    if (flag === "clean" && e.flags !== 0) return false;
    if (bit && (e.flags & bit) === 0) return false;
    if (ipTest) {
      let ok = ipCache.get(e.ip);
      if (ok === undefined) {
        ok = ipTest(e.ip);
        ipCache.set(e.ip, ok);
      }
      if (!ok) return false;
    }
    return true;
  });
}

/* ---------------------------------------------------------------- summary */

export interface CountRow {
  key: string;
  count: number;
}

export interface IpRow {
  ip: string;
  requests: number;
  bytes: number;
  client: number;
  server: number;
  notFound: number;
  flagged: number;
}

export interface PathRow {
  path: string;
  requests: number;
  errors: number;
  flagged: number;
}

export interface StatusRow {
  status: number;
  count: number;
}

export interface Bucket {
  /** UTC milliseconds at the start of the bucket. */
  start: number;
  total: number;
  /** 1xx, 2xx and 3xx. */
  ok: number;
  client: number;
  server: number;
  /** Anything outside 100 to 599. */
  other: number;
}

export interface Timeline {
  bucketMs: number;
  offsetMin: number;
  mixedOffsets: boolean;
  buckets: Bucket[];
  peak: number;
}

export interface Summary {
  requests: number;
  bytes: number;
  uniqueIps: number;
  first: number | null;
  last: number | null;
  statuses: StatusRow[];
  methods: CountRow[];
  topIps: IpRow[];
  topPaths: PathRow[];
  topAgents: CountRow[];
  agentsLogged: boolean;
  ruleCounts: Record<RuleId, number>;
  flaggedRequests: number;
  flaggedIps: string[];
  discovery: IpRow[];
  timeline: Timeline | null;
}

function topRows<T>(map: Map<string, T>, count: (v: T) => number, n: number): [string, T][] {
  return Array.from(map.entries())
    .sort((a, b) => count(b[1]) - count(a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, n);
}

const STEPS_MS = [
  60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000,
  3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
  86_400_000, 7 * 86_400_000, 30 * 86_400_000, 365 * 86_400_000,
];

/**
 * Requests per bucket. The bucket width is the smallest step that fits the
 * span in maxBuckets bars, and buckets are aligned in the offset of the first
 * entry, so a one-day bucket starts at the server's own midnight.
 */
export function buildTimeline(entries: LogEntry[], maxBuckets = MAX_BUCKETS): Timeline | null {
  if (entries.length === 0) return null;
  const offsetMin = entries[0].offsetMin;
  const shift = offsetMin * 60_000;
  let min = Infinity;
  let max = -Infinity;
  let mixedOffsets = false;
  for (const e of entries) {
    if (e.time < min) min = e.time;
    if (e.time > max) max = e.time;
    if (e.offsetMin !== offsetMin) mixedOffsets = true;
  }
  const count = (step: number) => Math.floor((max + shift) / step) - Math.floor((min + shift) / step) + 1;
  let step = STEPS_MS.find((s) => count(s) <= maxBuckets);
  if (step === undefined) {
    step = Math.ceil((max - min) / Math.max(1, maxBuckets - 2) / 86_400_000) * 86_400_000;
  }
  const first = Math.floor((min + shift) / step);
  const n = Math.floor((max + shift) / step) - first + 1;
  const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({
    start: (first + i) * step - shift,
    total: 0,
    ok: 0,
    client: 0,
    server: 0,
    other: 0,
  }));
  for (const e of entries) {
    const b = buckets[Math.floor((e.time + shift) / step) - first];
    b.total++;
    if (e.status >= 100 && e.status < 400) b.ok++;
    else if (e.status >= 400 && e.status < 500) b.client++;
    else if (e.status >= 500 && e.status < 600) b.server++;
    else b.other++;
  }
  const peak = buckets.reduce((p, b) => Math.max(p, b.total), 0);
  return { bucketMs: step, offsetMin, mixedOffsets, buckets, peak };
}

export function summarize(entries: LogEntry[], topN = TOP_N): Summary {
  const ips = new Map<string, IpRow>();
  const paths = new Map<string, PathRow>();
  const agents = new Map<string, number>();
  const statuses = new Map<number, number>();
  const methods = new Map<string, number>();
  const ruleCounts = Object.fromEntries(RULES.map((r) => [r.id, 0])) as Record<RuleId, number>;
  let bytes = 0;
  let first: number | null = null;
  let last: number | null = null;
  let flaggedRequests = 0;
  let agentsLogged = false;

  for (const e of entries) {
    if (e.bytes !== null) bytes += e.bytes;
    if (first === null || e.time < first) first = e.time;
    if (last === null || e.time > last) last = e.time;
    statuses.set(e.status, (statuses.get(e.status) ?? 0) + 1);
    const method = e.method || "(malformed)";
    methods.set(method, (methods.get(method) ?? 0) + 1);

    const isClient = e.status >= 400 && e.status < 500;
    const isServer = e.status >= 500 && e.status < 600;
    const flagged = e.flags !== 0;
    if (flagged) {
      flaggedRequests++;
      for (const rule of RULES) if (e.flags & rule.bit) ruleCounts[rule.id]++;
    }

    let ip = ips.get(e.ip);
    if (!ip) {
      ip = { ip: e.ip, requests: 0, bytes: 0, client: 0, server: 0, notFound: 0, flagged: 0 };
      ips.set(e.ip, ip);
    }
    ip.requests++;
    if (e.bytes !== null) ip.bytes += e.bytes;
    if (isClient) ip.client++;
    if (isServer) ip.server++;
    if (e.status === 404) ip.notFound++;
    if (flagged) ip.flagged++;

    if (e.method) {
      const key = pathOf(e.target);
      let p = paths.get(key);
      if (!p) {
        p = { path: key, requests: 0, errors: 0, flagged: 0 };
        paths.set(key, p);
      }
      p.requests++;
      if (isClient || isServer) p.errors++;
      if (flagged) p.flagged++;
    }

    if (e.format === "combined") {
      agentsLogged = true;
      const ua = e.userAgent ?? "(none sent)";
      agents.set(ua, (agents.get(ua) ?? 0) + 1);
    }
  }

  const discovery = Array.from(ips.values())
    .filter((r) => r.notFound >= DISCOVERY_MIN_404 && r.notFound / r.requests >= DISCOVERY_MIN_SHARE)
    .sort((a, b) => b.notFound - a.notFound || (a.ip < b.ip ? -1 : 1))
    .slice(0, topN);

  const flaggedIps = Array.from(ips.values())
    .filter((r) => r.flagged > 0)
    .sort((a, b) => b.flagged - a.flagged || (a.ip < b.ip ? -1 : 1))
    .map((r) => r.ip);

  return {
    requests: entries.length,
    bytes,
    uniqueIps: ips.size,
    first,
    last,
    statuses: Array.from(statuses.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => a.status - b.status),
    methods: topRows(methods, (v) => v, 10).map(([key, count]) => ({ key, count })),
    topIps: topRows(ips, (v) => v.requests, topN).map(([, v]) => v),
    topPaths: topRows(paths, (v) => v.requests, topN).map(([, v]) => v),
    topAgents: topRows(agents, (v) => v, topN).map(([key, count]) => ({ key, count })),
    agentsLogged,
    ruleCounts,
    flaggedRequests,
    flaggedIps,
    discovery,
    timeline: buildTimeline(entries),
  };
}

/* -------------------------------------------------------------- formatting */

/** RFC 9110 section 15 reason phrases, plus RFC 6585, RFC 7725 and nginx's own codes. */
const REASONS: Record<number, string> = {
  100: "Continue", 101: "Switching Protocols",
  200: "OK", 201: "Created", 202: "Accepted", 203: "Non-Authoritative Information", 204: "No Content",
  205: "Reset Content", 206: "Partial Content",
  300: "Multiple Choices", 301: "Moved Permanently", 302: "Found", 303: "See Other", 304: "Not Modified",
  307: "Temporary Redirect", 308: "Permanent Redirect",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
  406: "Not Acceptable", 407: "Proxy Authentication Required", 408: "Request Timeout", 409: "Conflict",
  410: "Gone", 411: "Length Required", 412: "Precondition Failed", 413: "Content Too Large",
  414: "URI Too Long", 415: "Unsupported Media Type", 416: "Range Not Satisfiable", 417: "Expectation Failed",
  421: "Misdirected Request", 422: "Unprocessable Content", 426: "Upgrade Required", 428: "Precondition Required",
  429: "Too Many Requests", 431: "Request Header Fields Too Large", 444: "No Response (nginx)",
  451: "Unavailable For Legal Reasons", 494: "Request Header Too Large (nginx)",
  495: "SSL Certificate Error (nginx)", 496: "SSL Certificate Required (nginx)",
  497: "HTTP Request Sent to HTTPS Port (nginx)", 499: "Client Closed Request (nginx)",
  500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway", 503: "Service Unavailable",
  504: "Gateway Timeout", 505: "HTTP Version Not Supported",
};

export function reasonPhrase(status: number): string {
  return REASONS[status] ?? "";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} ${n === 1 ? "byte" : "bytes"}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  return `${(n / 1024 ** 4).toFixed(2)} TiB`;
}

/** "UTC-0700" for an offset of -420 minutes. */
export function offsetLabel(offsetMin: number): string {
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
}

/** "2024-03-09 14:05" as the wall clock read at the given offset. */
export function formatAtOffset(utcMs: number, offsetMin: number, seconds = false): string {
  const iso = new Date(utcMs + offsetMin * 60_000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, seconds ? 19 : 16)}`;
}

export function stepLabel(ms: number): string {
  if (ms % 86_400_000 === 0) {
    const d = ms / 86_400_000;
    return d === 1 ? "1 day" : `${d} days`;
  }
  if (ms % 3_600_000 === 0) {
    const h = ms / 3_600_000;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  const m = Math.round(ms / 60_000);
  return m === 1 ? "1 minute" : `${m} minutes`;
}

/* ----------------------------------------------------------------- reading */

export interface ReadOutcome {
  text: string;
  /** Bytes after decompression that were read. */
  bytesRead: number;
  gzip: boolean;
  /** True when the cap was hit and the tail of the input was not read. */
  capped: boolean;
}

/** RFC 1952 section 2.3.1: a gzip member starts with ID1 = 0x1f, ID2 = 0x8b. */
export function isGzip(head: Uint8Array): boolean {
  return head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;
}

/** Drops a partial last line, which a cut at the byte cap leaves behind. */
function cutAtLastNewline(text: string): string {
  const nl = text.lastIndexOf("\n");
  return nl === -1 ? text : text.slice(0, nl + 1);
}

/**
 * Reads a Blob as text, gunzipping it first when it starts with the gzip
 * magic bytes. Reading stops once `cap` bytes of output exist, so a small
 * compressed file that inflates to gigabytes is cut off rather than held in
 * memory. Uses the built-in DecompressionStream; nothing leaves the browser.
 */
export async function readLogBlob(blob: Blob, cap = MAX_INPUT_BYTES): Promise<ReadOutcome> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (!isGzip(head)) {
    const capped = blob.size > cap;
    const buffer = await blob.slice(0, Math.min(blob.size, cap)).arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    if (capped) text = cutAtLastNewline(text);
    return { text, bytesRead: buffer.byteLength, gzip: false, capped };
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser has no DecompressionStream, so it cannot gunzip. Decompress the file first.");
  }
  const reader = blob.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const decoder = new TextDecoder("utf-8");
  const parts: string[] = [];
  let bytesRead = 0;
  let capped = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = cap - bytesRead;
      if (value.byteLength >= room) {
        parts.push(decoder.decode(value.subarray(0, room), { stream: true }));
        bytesRead += room;
        capped = value.byteLength > room;
        if (capped) break;
        continue;
      }
      parts.push(decoder.decode(value, { stream: true }));
      bytesRead += value.byteLength;
    }
  } finally {
    if (capped) await reader.cancel().catch(() => undefined);
    else reader.releaseLock();
  }
  parts.push(decoder.decode());
  let text = parts.join("");
  if (capped) text = cutAtLastNewline(text);
  return { text, bytesRead, gzip: true, capped };
}
