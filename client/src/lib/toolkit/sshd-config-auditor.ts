/**
 * sshd_config auditor, as pure functions.
 *
 * The parsing rules follow sshd_config(5) and the OpenSSH parser in
 * servconf.c:
 *
 *   - Keywords are case-insensitive; arguments are case-sensitive, except
 *     that yes/no style values are compared case-insensitively.
 *   - A keyword and its arguments are separated by whitespace or by optional
 *     whitespace and one "=". Arguments may be quoted.
 *   - "Unless noted otherwise, for each keyword, the first obtained value
 *     will be used." The noted exceptions (AllowUsers, HostKey, Port and a
 *     few others) accumulate instead.
 *   - A Match line starts a conditional block that runs until the next Match
 *     line or the end of the file. Indentation means nothing. For a
 *     connection that satisfies the criteria, values in the block override
 *     the global ones, and among several matching blocks the first value
 *     wins again. Only some keywords are allowed inside a Match block.
 *
 * Algorithm lists accept the +, - and ^ prefixes, which append to, remove
 * from, or move to the front of the compiled-in default list. The defaults
 * used for that are the OpenSSH 9.9 lists, stated in each constant below.
 */

export type Tone = "ok" | "info" | "warn" | "danger";

export const MAX_INPUT_CHARS = 200_000;
export const MAX_LINES = 5_000;
/** Findings returned for display; the counts still cover every finding. */
export const MAX_FINDINGS = 300;

const TONE_RANK: Record<Tone, number> = { danger: 3, warn: 2, info: 1, ok: 0 };

/** Echo at most 40 characters of user input back in a message. */
function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}...` : text;
}

export function worstTone(tones: Tone[]): Tone {
  return tones.reduce<Tone>((a, b) => (TONE_RANK[b] > TONE_RANK[a] ? b : a), "ok");
}

/* --------------------------------------------------------------- keywords */

interface KeywordInfo {
  /** Canonical spelling from sshd_config(5). */
  name: string;
  /**
   * true when sshd_config(5) lists it as allowed in a Match block, false
   * when servconf.c marks it global only, null when this table makes no claim.
   */
  match: boolean | null;
  /** Repeated lines add to the value instead of the first one winning. */
  multi?: boolean;
  /** Takes exactly one argument; more is a parse error in sshd. */
  single?: boolean;
  /** Set when sshd no longer uses the keyword. */
  deprecated?: string;
}

const K = (name: string, match: boolean | null, extra: Partial<KeywordInfo> = {}): KeywordInfo => ({ name, match, ...extra });

const KEYWORDS: Record<string, KeywordInfo> = {};
for (const info of [
  K("AcceptEnv", true, { multi: true }),
  K("AddressFamily", false, { single: true }),
  K("AllowAgentForwarding", true, { single: true }),
  K("AllowGroups", true, { multi: true }),
  K("AllowStreamLocalForwarding", true, { single: true }),
  K("AllowTcpForwarding", true, { single: true }),
  K("AllowUsers", true, { multi: true }),
  K("AuthenticationMethods", true),
  K("AuthorizedKeysCommand", true),
  K("AuthorizedKeysCommandUser", true),
  K("AuthorizedKeysFile", true),
  K("AuthorizedPrincipalsCommand", true),
  K("AuthorizedPrincipalsCommandUser", true),
  K("AuthorizedPrincipalsFile", true),
  K("Banner", true),
  K("CASignatureAlgorithms", true, { single: true }),
  K("ChannelTimeout", true),
  K("ChrootDirectory", true),
  K("Ciphers", false, { single: true }),
  K("ClientAliveCountMax", true),
  K("ClientAliveInterval", true),
  K("Compression", false, { single: true }),
  K("DenyGroups", true, { multi: true }),
  K("DenyUsers", true, { multi: true }),
  K("DisableForwarding", true, { single: true }),
  K("ExposeAuthInfo", true),
  K("FingerprintHash", false),
  K("ForceCommand", true),
  K("GatewayPorts", true, { single: true }),
  K("GSSAPIAuthentication", true),
  K("GSSAPICleanupCredentials", false),
  K("GSSAPIKexAlgorithms", null),
  K("GSSAPIKeyExchange", null),
  K("GSSAPIStrictAcceptorCheck", null),
  K("HostbasedAcceptedAlgorithms", true, { single: true }),
  K("HostbasedAuthentication", true, { single: true }),
  K("HostbasedUsesNameFromPacketOnly", true),
  K("HostCertificate", false, { multi: true }),
  K("HostKey", false, { multi: true, single: true }),
  K("HostKeyAgent", false),
  K("HostKeyAlgorithms", false, { single: true }),
  K("IgnoreRhosts", true, { single: true }),
  K("IgnoreUserKnownHosts", null),
  K("Include", true, { multi: true }),
  K("IPQoS", true),
  K("KbdInteractiveAuthentication", true, { single: true }),
  K("KerberosAuthentication", true),
  K("KerberosGetAFSToken", null),
  K("KerberosOrLocalPasswd", null),
  K("KerberosTicketCleanup", null),
  K("KexAlgorithms", false, { single: true }),
  K("ListenAddress", false, { multi: true }),
  K("LoginGraceTime", false, { single: true }),
  K("LogLevel", true, { single: true }),
  K("LogVerbose", null),
  K("MACs", false, { single: true }),
  K("Match", true),
  K("MaxAuthTries", true, { single: true }),
  K("MaxSessions", true),
  K("MaxStartups", false),
  K("ModuliFile", null),
  K("PAMServiceName", null),
  K("PasswordAuthentication", true, { single: true }),
  K("PerSourceMaxStartups", null),
  K("PerSourceNetBlockSize", null),
  K("PerSourcePenalties", null),
  K("PerSourcePenaltyExemptList", null),
  K("PermitEmptyPasswords", true, { single: true }),
  K("PermitListen", true),
  K("PermitOpen", true),
  K("PermitRootLogin", true, { single: true }),
  K("PermitTTY", true),
  K("PermitTunnel", true, { single: true }),
  K("PermitUserEnvironment", false, { single: true }),
  K("PermitUserRC", true),
  K("PidFile", false),
  K("Port", false, { multi: true }),
  K("PrintLastLog", false),
  K("PrintMotd", false),
  K("PubkeyAcceptedAlgorithms", true, { single: true }),
  K("PubkeyAuthOptions", true),
  K("PubkeyAuthentication", true, { single: true }),
  K("RDomain", true),
  K("RefuseConnection", null),
  K("RekeyLimit", true),
  K("RequiredRSASize", null),
  K("RevokedKeys", true),
  K("SecurityKeyProvider", null),
  K("SetEnv", true),
  K("SshdAuthPath", null),
  K("SshdSessionPath", null),
  K("StreamLocalBindMask", true),
  K("StreamLocalBindUnlink", true),
  K("StrictModes", false, { single: true }),
  K("Subsystem", null, { multi: true }),
  K("SyslogFacility", false),
  K("TCPKeepAlive", false),
  K("TrustedUserCAKeys", true),
  K("UnusedConnectionTimeout", true),
  K("UseDNS", false),
  K("UsePAM", false, { single: true }),
  K("VersionAddendum", null),
  K("X11DisplayOffset", true),
  K("X11Forwarding", true, { single: true }),
  K("X11UseLocalhost", true, { single: true }),
  K("XAuthLocation", null),
  K("Protocol", null, {
    single: true,
    deprecated: "OpenSSH 7.4 removed SSH protocol 1 from the server, and current releases ignore this keyword.",
  }),
  K("UsePrivilegeSeparation", null, { deprecated: "Privilege separation has been mandatory since OpenSSH 7.5; the keyword is ignored." }),
  K("RSAAuthentication", null, { deprecated: "An SSH protocol 1 option, ignored by current OpenSSH." }),
  K("RhostsRSAAuthentication", null, { deprecated: "An SSH protocol 1 option, ignored by current OpenSSH." }),
  K("ServerKeyBits", null, { deprecated: "An SSH protocol 1 option, ignored by current OpenSSH." }),
  K("KeyRegenerationInterval", null, { deprecated: "An SSH protocol 1 option, ignored by current OpenSSH." }),
  K("UseLogin", null, { deprecated: "Removed in OpenSSH 7.4." }),
]) {
  KEYWORDS[info.name.toLowerCase()] = info;
}

/** Old names that still parse as the newer keyword. */
const ALIASES: Record<string, string> = {
  challengeresponseauthentication: "kbdinteractiveauthentication",
  pubkeyacceptedkeytypes: "pubkeyacceptedalgorithms",
  hostbasedacceptedkeytypes: "hostbasedacceptedalgorithms",
};

/* ----------------------------------------------------------------- parse */

export interface Directive {
  /** Canonical lowercase keyword, with aliases resolved. */
  key: string;
  /** Canonical display name. */
  name: string;
  /** The keyword as it was written. */
  written: string;
  args: string[];
  line: number;
  /** -1 for the global section, otherwise the Match block index. */
  block: number;
  indented: boolean;
}

export interface MatchBlock {
  index: number;
  line: number;
  endLine: number;
  criteria: string;
  /** "Match all": applies to every connection. */
  all: boolean;
  directives: Directive[];
}

export interface Finding {
  tone: Tone;
  title: string;
  detail: string;
  line: number | null;
  /** Where the finding applies: "global" or a Match block description. */
  scope: string;
  key: string | null;
}

export interface ParsedConfig {
  global: Directive[];
  blocks: MatchBlock[];
  findings: Finding[];
  lineCount: number;
  truncated: boolean;
  directiveCount: number;
}

type Split = { ok: true; args: string[]; comment: boolean } | { ok: false; error: string };

/**
 * Splits arguments the way OpenSSH's argv_split does: whitespace separated,
 * single or double quotes group, a backslash escapes the next quote,
 * backslash or space, and an unquoted word starting with # ends the line.
 */
export function splitArgs(text: string): Split {
  const args: string[] = [];
  let i = 0;
  let comment = false;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (i >= text.length) break;
    if (text[i] === "#") {
      comment = true;
      break;
    }
    let word = "";
    let quote: string | null = null;
    while (i < text.length) {
      const c = text[i];
      if (quote === null && /\s/.test(c)) break;
      if (c === "\\" && i + 1 < text.length && /["'\\ ]/.test(text[i + 1])) {
        word += text[i + 1];
        i += 2;
        continue;
      }
      if (quote === null && (c === '"' || c === "'")) {
        quote = c;
        i += 1;
        continue;
      }
      if (quote !== null && c === quote) {
        quote = null;
        i += 1;
        continue;
      }
      word += c;
      i += 1;
    }
    if (quote !== null) return { ok: false, error: "A quote is opened and never closed." };
    args.push(word);
  }
  return { ok: true, args, comment };
}

function scopeLabel(block: MatchBlock | null): string {
  return block ? `Match ${block.criteria} (line ${block.line})` : "global";
}

export function parseConfig(input: string): ParsedConfig {
  const findings: Finding[] = [];
  let text = input.startsWith("\uFEFF") ? input.slice(1) : input;
  let truncated = false;
  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS);
    truncated = true;
  }
  let lines = text.split(/\r?\n/);
  if (lines.length > MAX_LINES) {
    lines = lines.slice(0, MAX_LINES);
    truncated = true;
  }
  if (truncated) {
    findings.push({
      tone: "info",
      title: "Only part of the input was read",
      detail: `The auditor reads the first ${MAX_LINES.toLocaleString("en-US")} lines or ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters. A real sshd_config is a few hundred lines at most.`,
      line: null,
      scope: "global",
      key: null,
    });
  }

  const global: Directive[] = [];
  const blocks: MatchBlock[] = [];
  let current: MatchBlock | null = null;
  let sawIndentedInBlock = false;
  let warnedIndent = false;
  let warnedTrailingComment = false;
  let directiveCount = 0;

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.replace(/\s+$/, "");
    const trimmed = line.trimStart();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const indented = trimmed.length !== line.length;

    // Keyword, then whitespace or optional whitespace and one "=".
    const m = /^([^\s=]+)\s*(?:=\s*)?([\s\S]*)$/.exec(trimmed);
    if (!m) return;
    const written = m[1];
    const lower = written.toLowerCase();
    const key = ALIASES[lower] ?? lower;
    const split = splitArgs(m[2]);
    const scope = scopeLabel(current);

    if (!split.ok) {
      findings.push({ tone: "danger", title: `${clip(written)}: unbalanced quotes`, detail: `${split.error} sshd -t rejects this line.`, line: lineNo, scope, key });
      return;
    }
    if (split.comment && split.args.length > 0 && !warnedTrailingComment) {
      warnedTrailingComment = true;
      findings.push({
        tone: "info",
        title: "Comment after a value",
        detail:
          "Current OpenSSH ignores text after an unquoted #. Older releases read it as more arguments, which breaks a single-value line and adds the words to a list such as AllowUsers. Keep comments on their own lines.",
        line: lineNo,
        scope,
        key,
      });
    }
    directiveCount += 1;

    if (key === "match") {
      const all = split.args.length === 1 && split.args[0].toLowerCase() === "all";
      if (split.args.length === 0) {
        findings.push({ tone: "danger", title: "Match with no criteria", detail: "A Match line needs at least one criterion, such as User, Group, Address or all. sshd -t rejects it.", line: lineNo, scope, key });
      } else if (!all && split.args.some((a) => a.toLowerCase() === "all")) {
        findings.push({ tone: "danger", title: "Match all combined with other criteria", detail: "all must stand alone on its Match line. sshd -t rejects it.", line: lineNo, scope, key });
      }
      if (current) current.endLine = lineNo - 1;
      current = { index: blocks.length, line: lineNo, endLine: lines.length, criteria: split.args.join(" ") || "(none)", all, directives: [] };
      blocks.push(current);
      sawIndentedInBlock = false;
      warnedIndent = false;
      return;
    }

    const info = KEYWORDS[key];
    const directive: Directive = {
      key,
      name: info?.name ?? written,
      written,
      args: split.args,
      line: lineNo,
      block: current ? current.index : -1,
      indented,
    };

    if (current) {
      if (indented) sawIndentedInBlock = true;
      else if (sawIndentedInBlock && !warnedIndent) {
        warnedIndent = true;
        findings.push({
          tone: "warn",
          title: "Indentation does not end a Match block",
          detail: `Line ${lineNo} is not indented, but it still belongs to the Match block on line ${current.line}, so it only applies to connections matching ${current.criteria}. Only another Match line ends a block. Move global settings above the first Match.`,
          line: lineNo,
          scope,
          key,
        });
      }
    }

    if (split.args.length === 0) {
      findings.push({ tone: "danger", title: `${directive.name} has no value`, detail: "sshd refuses to start when a keyword has no argument.", line: lineNo, scope, key });
      return;
    }

    if (!info) {
      findings.push({
        tone: "info",
        title: `Unknown keyword ${clip(written)}`,
        detail: "Not a keyword this auditor knows. If it is a typo, sshd refuses to start with Bad configuration option; run sshd -t to check.",
        line: lineNo,
        scope,
        key,
      });
    } else {
      if (ALIASES[lower]) {
        findings.push({
          tone: "info",
          title: `${clip(written)} is an old name`,
          detail: `It still works as ${info.name}, which is the name current documentation uses.`,
          line: lineNo,
          scope,
          key,
        });
      }
      if (info.deprecated && key !== "protocol") {
        findings.push({ tone: "info", title: `${info.name} is obsolete`, detail: info.deprecated, line: lineNo, scope, key });
      }
      if (current && info.match === false) {
        findings.push({
          tone: "danger",
          title: `${info.name} is not allowed in a Match block`,
          detail: `sshd -t fails with "Directive '${info.name}' is not allowed within a Match block". It is a global setting: move it above the first Match line.`,
          line: lineNo,
          scope,
          key,
        });
      }
      if (info.single && split.args.length > 1) {
        findings.push({
          tone: "danger",
          title: `${info.name} has extra arguments`,
          detail:
            key === "ciphers" || key === "macs" || key.endsWith("algorithms")
              ? "The list must be one comma separated word. A space after a comma starts a new argument, and sshd refuses the line."
              : `${info.name} takes one value. sshd refuses a line with more.`,
          line: lineNo,
          scope,
          key,
        });
      }
    }

    if (current) current.directives.push(directive);
    else global.push(directive);
  });

  return { global, blocks, findings, lineCount: lines.length, truncated, directiveCount };
}

/* ------------------------------------------------------------ algorithms */

export type AlgoKey = "ciphers" | "macs" | "kexalgorithms" | "hostkeyalgorithms" | "pubkeyacceptedalgorithms";

const HOSTKEY_DEFAULT = [
  "ssh-ed25519-cert-v01@openssh.com",
  "ecdsa-sha2-nistp256-cert-v01@openssh.com",
  "ecdsa-sha2-nistp384-cert-v01@openssh.com",
  "ecdsa-sha2-nistp521-cert-v01@openssh.com",
  "sk-ssh-ed25519-cert-v01@openssh.com",
  "sk-ecdsa-sha2-nistp256-cert-v01@openssh.com",
  "rsa-sha2-512-cert-v01@openssh.com",
  "rsa-sha2-256-cert-v01@openssh.com",
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
  "rsa-sha2-512",
  "rsa-sha2-256",
];

/** Compiled-in defaults from the OpenSSH 9.9 sshd_config(5). */
export const OPENSSH_DEFAULTS: Record<AlgoKey, string[]> = {
  ciphers: [
    "chacha20-poly1305@openssh.com",
    "aes128-ctr",
    "aes192-ctr",
    "aes256-ctr",
    "aes128-gcm@openssh.com",
    "aes256-gcm@openssh.com",
  ],
  macs: [
    "umac-64-etm@openssh.com",
    "umac-128-etm@openssh.com",
    "hmac-sha2-256-etm@openssh.com",
    "hmac-sha2-512-etm@openssh.com",
    "hmac-sha1-etm@openssh.com",
    "umac-64@openssh.com",
    "umac-128@openssh.com",
    "hmac-sha2-256",
    "hmac-sha2-512",
    "hmac-sha1",
  ],
  kexalgorithms: [
    "sntrup761x25519-sha512",
    "sntrup761x25519-sha512@openssh.com",
    "mlkem768x25519-sha256",
    "curve25519-sha256",
    "curve25519-sha256@libssh.org",
    "ecdh-sha2-nistp256",
    "ecdh-sha2-nistp384",
    "ecdh-sha2-nistp521",
    "diffie-hellman-group-exchange-sha256",
    "diffie-hellman-group16-sha512",
    "diffie-hellman-group18-sha512",
    "diffie-hellman-group14-sha256",
  ],
  hostkeyalgorithms: HOSTKEY_DEFAULT,
  pubkeyacceptedalgorithms: HOSTKEY_DEFAULT,
};

const KNOWN_GOOD: Record<AlgoKey, Set<string>> = {
  ciphers: new Set(OPENSSH_DEFAULTS.ciphers),
  macs: new Set(OPENSSH_DEFAULTS.macs),
  kexalgorithms: new Set(OPENSSH_DEFAULTS.kexalgorithms),
  hostkeyalgorithms: new Set(HOSTKEY_DEFAULT),
  pubkeyacceptedalgorithms: new Set(HOSTKEY_DEFAULT),
};

export interface Weakness {
  tone: Tone;
  why: string;
}

/** Why a specific algorithm name is weak, or null when it is not flagged. */
export function classifyAlgorithm(key: AlgoKey, name: string): Weakness | null {
  const n = name.toLowerCase();
  if (key === "ciphers") {
    if (n === "none") return { tone: "danger", why: "no encryption at all" };
    if (n.startsWith("arcfour")) return { tone: "danger", why: "RC4, whose keystream biases are practically exploitable" };
    if (n === "3des-cbc" || n === "blowfish-cbc" || n === "cast128-cbc") {
      return { tone: "danger", why: "a 64-bit block cipher in CBC mode, open to Sweet32 style birthday attacks on long sessions" };
    }
    if (n.endsWith("-cbc") || n === "rijndael-cbc@lysator.liu.se") {
      return { tone: "warn", why: "CBC mode, which in SSH is open to the 2009 plaintext recovery attack by Albrecht, Paterson and Watson" };
    }
    return null;
  }
  if (key === "macs") {
    if (n.includes("md5")) {
      return {
        tone: "danger",
        why: "HMAC-MD5. MD5 is broken as a hash, OpenSSH no longer offers it by default, and the -96 variants cut the tag to 96 bits",
      };
    }
    if (n.startsWith("hmac-sha1")) {
      return { tone: "warn", why: "HMAC-SHA1. Not broken as a MAC, but retired by policy, and nothing current needs it" };
    }
    if (n.includes("ripemd160")) return { tone: "warn", why: "HMAC-RIPEMD160, removed from OpenSSH in 7.6" };
    return null;
  }
  if (key === "kexalgorithms") {
    if (n === "diffie-hellman-group1-sha1" || n.startsWith("gss-group1-sha1")) {
      return { tone: "danger", why: "a 1024-bit Diffie-Hellman group, within reach of the precomputation described in the 2015 Logjam paper, with SHA-1" };
    }
    if (n === "rsa1024-sha1") return { tone: "danger", why: "1024-bit RSA key exchange with SHA-1" };
    if (n.includes("sha1")) return { tone: "warn", why: "a key exchange whose hash is SHA-1" };
    return null;
  }
  // Host key and public key signature algorithms.
  if (n === "ssh-dss" || n.startsWith("ssh-dss-cert")) {
    return { tone: "danger", why: "DSA: 1024-bit keys and SHA-1, disabled by default since OpenSSH 7.0 and removed in 10.0" };
  }
  if (n === "ssh-rsa" || n.startsWith("ssh-rsa-cert")) {
    return {
      tone: "warn",
      why: "RSA signatures over SHA-1, disabled by default since OpenSSH 8.8. RSA keys keep working through rsa-sha2-256 and rsa-sha2-512",
    };
  }
  return null;
}

export interface AlgoResult {
  list: string[];
  mode: "default" | "explicit" | "append" | "remove" | "prepend";
  unknown: string[];
  error: string | null;
}

function globToRegExp(pattern: string): RegExp {
  const body = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`, "i");
}

/** The list sshd ends up offering, after applying any +, - or ^ prefix to the default. */
export function effectiveAlgorithms(key: AlgoKey, value: string | null): AlgoResult {
  const defaults = OPENSSH_DEFAULTS[key];
  if (value === null) return { list: [...defaults], mode: "default", unknown: [], error: null };
  const first = value[0];
  const mode = first === "+" ? "append" : first === "-" ? "remove" : first === "^" ? "prepend" : "explicit";
  const body = mode === "explicit" ? value : value.slice(1);
  const names = body.split(",").map((s) => s.trim());
  if (names.some((s) => s === "")) {
    return { list: [], mode, unknown: [], error: "The list has an empty entry, from a doubled or trailing comma." };
  }
  const pattern = mode === "remove" ? /^[A-Za-z0-9@._*?+-]+$/ : /^[A-Za-z0-9@._+-]+$/;
  const bad = names.find((s) => !pattern.test(s));
  if (bad) return { list: [], mode, unknown: [], error: `"${clip(bad)}" is not a valid algorithm name.` };

  let list: string[];
  if (mode === "explicit") list = names;
  else if (mode === "append") list = [...defaults, ...names.filter((n) => !defaults.includes(n))];
  else if (mode === "prepend") list = [...names, ...defaults.filter((d) => !names.includes(d))];
  else {
    const res = names.map(globToRegExp);
    list = defaults.filter((d) => !res.some((re) => re.test(d)));
  }
  const unique = [...new Set(list)];
  const unknown = unique.filter((n) => !KNOWN_GOOD[key].has(n) && classifyAlgorithm(key, n) === null);
  return { list: unique, mode, unknown, error: null };
}

/* ------------------------------------------------------------- effective */

export interface Override {
  scope: string;
  line: number;
  value: string;
}

export interface EffectiveRow {
  key: string;
  name: string;
  /** Value for a connection that matches none of the conditional Match blocks. */
  value: string;
  source: string;
  isDefault: boolean;
  tone: Tone;
  note: string;
  overrides: Override[];
}

export interface AuditResult {
  parsed: ParsedConfig;
  findings: Finding[];
  rows: EffectiveRow[];
  counts: Record<Tone, number>;
  /** Findings past MAX_FINDINGS, counted but not returned. */
  hiddenFindings: number;
  /** Users and groups from the effective allow lists, carried into the snippet. */
  allowUsers: string[];
  allowGroups: string[];
}

interface Resolved {
  args: string[] | null;
  line: number | null;
  source: string;
}

function firstDirective(dirs: Directive[], key: string): Directive | undefined {
  return dirs.find((d) => d.key === key && d.args.length > 0);
}

/** Global first value, overridden by the first value in any Match all block. */
function resolveBaseline(parsed: ParsedConfig, key: string): Resolved {
  const multi = KEYWORDS[key]?.multi === true;
  for (const block of parsed.blocks) {
    if (!block.all) continue;
    if (multi) {
      const lines = block.directives.filter((d) => d.key === key && d.args.length > 0);
      if (lines.length) return { args: lines.flatMap((d) => d.args), line: lines[0].line, source: `Match all, line ${lines[0].line}` };
    } else {
      const d = firstDirective(block.directives, key);
      if (d) return { args: d.args, line: d.line, source: `Match all, line ${d.line}` };
    }
  }
  if (multi) {
    const lines = parsed.global.filter((d) => d.key === key && d.args.length > 0);
    if (lines.length) {
      return {
        args: lines.flatMap((d) => d.args),
        line: lines[0].line,
        source: lines.length === 1 ? `line ${lines[0].line}` : `lines ${lines.map((d) => d.line).join(", ")}`,
      };
    }
    return { args: null, line: null, source: "default" };
  }
  const d = firstDirective(parsed.global, key);
  return d ? { args: d.args, line: d.line, source: `line ${d.line}` } : { args: null, line: null, source: "default" };
}

function overridesFor(parsed: ParsedConfig, key: string): Override[] {
  const out: Override[] = [];
  for (const block of parsed.blocks) {
    if (block.all) continue;
    const lines = block.directives.filter((d) => d.key === key && d.args.length > 0);
    if (!lines.length) continue;
    const value = KEYWORDS[key]?.multi ? lines.flatMap((d) => d.args).join(" ") : lines[0].args.join(" ");
    out.push({ scope: scopeLabel(block), line: lines[0].line, value });
  }
  return out;
}

/* ---------------------------------------------------------------- checks */

interface Verdict {
  tone: Tone;
  note: string;
}

interface CheckContext {
  isDefault: boolean;
  /** Effective UsePAM and PasswordAuthentication, for the checks that depend on them. */
  usePam: boolean;
  passwordAuth: boolean;
}

const YES_NO = new Set(["yes", "no"]);

function invalid(name: string, value: string, allowed: string[]): Verdict {
  return { tone: "danger", note: `"${clip(value)}" is not a value ${name} accepts (${allowed.join(", ")}). sshd refuses to start.` };
}

function flag(name: string, value: string): boolean | Verdict {
  const v = value.toLowerCase();
  if (!YES_NO.has(v)) return invalid(name, value, ["yes", "no"]);
  return v === "yes";
}

/** sshd time format: a bare number of seconds, or units s, m, h, d, w combined (1m30s). */
export function parseSshdTime(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (/^\d+$/.test(v)) return Number(v);
  if (!/^(\d+[smhdw])+$/.test(v)) return null;
  const unit: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  let total = 0;
  for (const [, n, u] of v.matchAll(/(\d+)([smhdw])/g)) total += Number(n) * unit[u];
  return total;
}

type Check = (value: string, ctx: CheckContext) => Verdict;

const CHECKS: Record<string, { name: string; def: string; check: Check }> = {
  permitrootlogin: {
    name: "PermitRootLogin",
    def: "prohibit-password",
    check: (value, ctx) => {
      const v = value.toLowerCase();
      if (v === "yes") {
        return ctx.passwordAuth
          ? { tone: "danger", note: "root may log in with a password, so every guess goes straight at the one account that owns the machine." }
          : {
              tone: "warn",
              note: "root may log in by any enabled method. Password logins are off, so this needs root's key, but logins should still go through named accounts and sudo so every action traces to a person.",
            };
      }
      if (v === "prohibit-password" || v === "without-password") {
        return {
          tone: "info",
          note: `root may log in with a key${v === "without-password" ? " (without-password is the old name for prohibit-password)" : ""}. Prefer no, and sudo from named accounts, so every action traces to a person.`,
        };
      }
      if (v === "forced-commands-only") return { tone: "info", note: "root may log in only with keys restricted by a command= option." };
      if (v === "no") return { tone: "ok", note: "root cannot log in over SSH." };
      return invalid("PermitRootLogin", value, ["yes", "prohibit-password", "forced-commands-only", "no"]);
    },
  },
  passwordauthentication: {
    name: "PasswordAuthentication",
    def: "yes",
    check: (value, ctx) => {
      const f = flag("PasswordAuthentication", value);
      if (typeof f !== "boolean") return f;
      return f
        ? {
            tone: "warn",
            note: `${ctx.isDefault ? "Not set, and the default is yes. " : ""}Passwords are accepted, so each account is only as strong as its password and open to guessing. Use keys.`,
          }
        : { tone: "ok", note: "Password logins are off." };
    },
  },
  kbdinteractiveauthentication: {
    name: "KbdInteractiveAuthentication",
    def: "yes",
    check: (value, ctx) => {
      const f = flag("KbdInteractiveAuthentication", value);
      if (typeof f !== "boolean") return f;
      if (!f) return { tone: "ok", note: "Keyboard-interactive is off." };
      if (ctx.usePam) {
        return {
          tone: ctx.passwordAuth ? "info" : "warn",
          note: `${ctx.isDefault ? "Not set, and the default is yes. " : ""}With UsePAM yes, keyboard-interactive hands the prompt to PAM, which usually asks for the password.${ctx.passwordAuth ? "" : " PasswordAuthentication no does not close this path."}`,
        };
      }
      return { tone: "info", note: "On, but with UsePAM no there is usually nothing behind it on Linux." };
    },
  },
  permitemptypasswords: {
    name: "PermitEmptyPasswords",
    def: "no",
    check: (value, ctx) => {
      const f = flag("PermitEmptyPasswords", value);
      if (typeof f !== "boolean") return f;
      if (!f) return { tone: "ok", note: "Accounts with an empty password cannot log in." };
      return {
        tone: "danger",
        note: ctx.passwordAuth
          ? "Any account with an empty password logs in with no password at all."
          : "Password logins are off for now, but this is one setting away from letting empty passwords in.",
      };
    },
  },
  pubkeyauthentication: {
    name: "PubkeyAuthentication",
    def: "yes",
    check: (value) => {
      const f = flag("PubkeyAuthentication", value);
      if (typeof f !== "boolean") return f;
      return f ? { tone: "ok", note: "Key logins are on." } : { tone: "warn", note: "Key logins are off, which leaves passwords or nothing." };
    },
  },
  usepam: {
    name: "UsePAM",
    def: "no",
    check: (value) => {
      const f = flag("UsePAM", value);
      if (typeof f !== "boolean") return f;
      return { tone: "ok", note: f ? "PAM handles account and session setup, and keyboard-interactive prompts." : "PAM is not used. Debian, Ubuntu and RHEL ship yes." };
    },
  },
  maxauthtries: {
    name: "MaxAuthTries",
    def: "6",
    check: (value) => {
      if (!/^\d+$/.test(value)) return { tone: "danger", note: `"${clip(value)}" is not a whole number. sshd refuses to start.` };
      const n = Number(value);
      if (n > 6) return { tone: "warn", note: `${n} attempts per connection, more than the default of 6. Each connection gets that many guesses.` };
      if (n > 4) return { tone: "info", note: `${n} attempts per connection. CIS benchmarks ask for 4 or fewer.` };
      if (n < 3) {
        return {
          tone: "info",
          note: "Every key an agent offers counts as an attempt, so a client with several keys loaded fails with Too many authentication failures. IdentitiesOnly on the client avoids it.",
        };
      }
      return { tone: "ok", note: `${n} attempts per connection. Failures are logged once half of them are used.` };
    },
  },
  disableforwarding: {
    name: "DisableForwarding",
    def: "no",
    check: (value) => {
      const f = flag("DisableForwarding", value);
      if (typeof f !== "boolean") return f;
      return f
        ? { tone: "ok", note: "All forwarding is off: X11, agent, TCP and StreamLocal, whatever the individual options say." }
        : { tone: "ok", note: "The individual forwarding options below decide." };
    },
  },
  x11forwarding: {
    name: "X11Forwarding",
    def: "no",
    check: (value) => {
      const f = flag("X11Forwarding", value);
      if (typeof f !== "boolean") return f;
      return f
        ? {
            tone: "warn",
            note: "A user who requests it exposes their own X display to anyone with root on this host. Few servers need it; enable it per user in a Match block.",
          }
        : { tone: "ok", note: "X11 forwarding is off." };
    },
  },
  x11uselocalhost: {
    name: "X11UseLocalhost",
    def: "yes",
    check: (value) => {
      const f = flag("X11UseLocalhost", value);
      if (typeof f !== "boolean") return f;
      return f
        ? { tone: "ok", note: "Forwarded X11 displays listen on loopback only." }
        : { tone: "warn", note: "Forwarded X11 displays listen on every address, reachable from the network." };
    },
  },
  allowtcpforwarding: {
    name: "AllowTcpForwarding",
    def: "yes",
    check: (value, ctx) => {
      const v = value.toLowerCase();
      if (v === "no") return { tone: "ok", note: "TCP forwarding is off." };
      if (v === "yes" || v === "all") {
        return {
          tone: "info",
          note: `${ctx.isDefault ? "Not set, and the default is yes. " : ""}Users can tunnel through this host to whatever it can reach. sshd_config(5) notes that turning it off only helps if users also lack a shell, since they could run their own forwarder.`,
        };
      }
      if (v === "local" || v === "remote") return { tone: "info", note: `Only ${v} forwarding is allowed.` };
      return invalid("AllowTcpForwarding", value, ["yes", "all", "local", "remote", "no"]);
    },
  },
  allowagentforwarding: {
    name: "AllowAgentForwarding",
    def: "yes",
    check: (value) => {
      const f = flag("AllowAgentForwarding", value);
      if (typeof f !== "boolean") return f;
      return f
        ? { tone: "info", note: "A forwarded agent lets root on this host sign with the connecting user's keys for as long as the session lasts." }
        : { tone: "ok", note: "Agent forwarding is off." };
    },
  },
  gatewayports: {
    name: "GatewayPorts",
    def: "no",
    check: (value) => {
      const v = value.toLowerCase();
      if (v === "no") return { tone: "ok", note: "Remote forwards bind to loopback only." };
      if (v === "yes" || v === "clientspecified") {
        return { tone: "warn", note: "Remote port forwards can bind to every address, publishing a user's tunnel to the whole network." };
      }
      return invalid("GatewayPorts", value, ["yes", "clientspecified", "no"]);
    },
  },
  permittunnel: {
    name: "PermitTunnel",
    def: "no",
    check: (value) => {
      const v = value.toLowerCase();
      if (v === "no") return { tone: "ok", note: "tun/tap tunneling is off." };
      if (v === "yes" || v === "point-to-point" || v === "ethernet") {
        return { tone: "warn", note: "Users can open tun or tap devices: a full layer 3 or layer 2 path into whatever this host can reach." };
      }
      return invalid("PermitTunnel", value, ["yes", "point-to-point", "ethernet", "no"]);
    },
  },
  permituserenvironment: {
    name: "PermitUserEnvironment",
    def: "no",
    check: (value) => {
      if (value.toLowerCase() === "no") return { tone: "ok", note: "~/.ssh/environment is ignored." };
      return {
        tone: "warn",
        note: "Users can set environment variables at login. sshd_config(5) warns this can bypass access restrictions through mechanisms such as LD_PRELOAD.",
      };
    },
  },
  hostbasedauthentication: {
    name: "HostbasedAuthentication",
    def: "no",
    check: (value) => {
      const f = flag("HostbasedAuthentication", value);
      if (typeof f !== "boolean") return f;
      return f
        ? { tone: "warn", note: "Trusts the client host's key and that host's word about who the user is. One compromised client speaks for all its users." }
        : { tone: "ok", note: "Host-based authentication is off." };
    },
  },
  ignorerhosts: {
    name: "IgnoreRhosts",
    def: "yes",
    check: (value) => {
      const v = value.toLowerCase();
      if (v === "yes") return { tone: "ok", note: ".rhosts and .shosts files are ignored." };
      if (v === "no" || v === "shosts-only") return { tone: "warn", note: "Per-user trust files are honored for host-based authentication." };
      return invalid("IgnoreRhosts", value, ["yes", "shosts-only", "no"]);
    },
  },
  strictmodes: {
    name: "StrictModes",
    def: "yes",
    check: (value) => {
      const f = flag("StrictModes", value);
      if (typeof f !== "boolean") return f;
      return f
        ? { tone: "ok", note: "sshd checks ownership and modes of the home directory and key files." }
        : { tone: "warn", note: "sshd skips the ownership and mode checks, so an authorized_keys file another user can write is still trusted." };
    },
  },
  loglevel: {
    name: "LogLevel",
    def: "INFO",
    check: (value) => {
      const v = value.toUpperCase();
      if (v === "VERBOSE") return { tone: "ok", note: "Logs each login with its key fingerprint, plus keys that were offered and refused." };
      if (v === "INFO") {
        return { tone: "ok", note: "Logs each login with the fingerprint of the key it used. VERBOSE adds keys that were offered and refused." };
      }
      if (v === "QUIET" || v === "FATAL" || v === "ERROR") return { tone: "warn", note: "Failed and successful logins are not logged." };
      if (/^DEBUG[123]?$/.test(v)) return { tone: "warn", note: "sshd_config(5): logging at a DEBUG level violates the privacy of users and is not recommended." };
      return invalid("LogLevel", value, ["QUIET", "FATAL", "ERROR", "INFO", "VERBOSE", "DEBUG", "DEBUG1", "DEBUG2", "DEBUG3"]);
    },
  },
  logingracetime: {
    name: "LoginGraceTime",
    def: "120",
    check: (value) => {
      const s = parseSshdTime(value);
      if (s === null) return { tone: "danger", note: `"${clip(value)}" is not an sshd time value such as 30, 30s or 1m. sshd refuses to start.` };
      if (s === 0) {
        return {
          tone: "warn",
          note: "No limit, so an unauthenticated connection can hold one of the MaxStartups slots indefinitely. This was the stopgap for CVE-2024-6387 (regreSSHion) on OpenSSH 8.5p1 to 9.7p1; the fix is 9.8p1 or a patched distribution package.",
        };
      }
      if (s > 60) return { tone: "info", note: `${s} seconds to authenticate. 30 to 60 is plenty for a person and shortens how long half-open logins hold a slot.` };
      return { tone: "ok", note: `${s} seconds to authenticate.` };
    },
  },
};

/** Rows shown in the effective value table, in this order. */
const ROW_ORDER = [
  "permitrootlogin",
  "passwordauthentication",
  "kbdinteractiveauthentication",
  "permitemptypasswords",
  "pubkeyauthentication",
  "usepam",
  "maxauthtries",
  "allowusers",
  "allowgroups",
  "denyusers",
  "denygroups",
  "disableforwarding",
  "x11forwarding",
  "x11uselocalhost",
  "allowtcpforwarding",
  "allowagentforwarding",
  "gatewayports",
  "permittunnel",
  "permituserenvironment",
  "hostbasedauthentication",
  "ignorerhosts",
  "strictmodes",
  "logingracetime",
  "loglevel",
  "ciphers",
  "macs",
  "kexalgorithms",
  "hostkeyalgorithms",
  "pubkeyacceptedalgorithms",
  "protocol",
];

/** Options that DisableForwarding yes switches off (sshd_config(5)). */
const FORWARDING_KEYS = new Set(["x11forwarding", "allowtcpforwarding", "allowagentforwarding", "gatewayports"]);

/** Applies DisableForwarding yes on top of a forwarding option's own verdict. */
function withDisable(key: string, verdict: Verdict, disabled: boolean): Verdict {
  if (!disabled || !FORWARDING_KEYS.has(key) || verdict.tone === "danger") return verdict;
  return { tone: "ok", note: "DisableForwarding yes overrides this, so it has no effect." };
}

const ALGO_KEYS: AlgoKey[] = ["ciphers", "macs", "kexalgorithms", "hostkeyalgorithms", "pubkeyacceptedalgorithms"];
const ALGO_NAMES: Record<AlgoKey, string> = {
  ciphers: "Ciphers",
  macs: "MACs",
  kexalgorithms: "KexAlgorithms",
  hostkeyalgorithms: "HostKeyAlgorithms",
  pubkeyacceptedalgorithms: "PubkeyAcceptedAlgorithms",
};

/** At most ten names, each clipped, so a pasted wall of text stays readable. */
function nameList(names: string[]): string {
  const shown = names.slice(0, 10).map(clip).join(", ");
  return names.length > 10 ? `${shown} and ${names.length - 10} more` : shown;
}

function algoVerdict(key: AlgoKey, value: string | null): { verdict: Verdict; list: string[]; weak: { name: string; w: Weakness }[] } {
  const res = effectiveAlgorithms(key, value);
  if (res.error) return { verdict: { tone: "danger", note: `${res.error} sshd refuses to start.` }, list: [], weak: [] };
  const weak = res.list.map((name) => ({ name, w: classifyAlgorithm(key, name) })).filter((x): x is { name: string; w: Weakness } => x.w !== null);
  const parts: string[] = [];
  if (res.mode === "default") parts.push("Not set: the compiled-in default list (OpenSSH 9.9 shown).");
  else if (res.mode === "append") parts.push("Appended to the default list with +.");
  else if (res.mode === "remove") parts.push("Removed from the default list with -.");
  else if (res.mode === "prepend") parts.push("Moved to the front of the default list with ^.");
  if (weak.length) parts.push(`Weak: ${nameList(weak.map((x) => x.name))}.`);
  if (res.unknown.length) {
    parts.push(`Not in this auditor's list: ${nameList(res.unknown)}. Check the spelling, since sshd refuses to start on a name it does not support.`);
  }
  let tone = worstTone(weak.map((x) => x.w.tone));
  if (tone === "ok" && res.unknown.length) tone = "info";
  if (!weak.length && !res.unknown.length) parts.push("Nothing weak in the list.");
  if (key === "kexalgorithms" && !res.list.some((n) => n.startsWith("mlkem") || n.startsWith("sntrup"))) {
    parts.push("No post-quantum hybrid, so recorded sessions could be decrypted later by a quantum computer.");
    if (tone === "ok") tone = "info";
  }
  return { verdict: { tone, note: parts.join(" ") }, list: res.list, weak };
}

function protocolVerdict(value: string): Verdict {
  const versions = value.split(",").map((s) => s.trim());
  if (versions.includes("1")) {
    return {
      tone: "danger",
      note: "Asks for SSH protocol 1, whose CRC-32 integrity check can be forged and which has known session attacks. Releases before 7.0 enable it when asked, 7.0 to 7.3 only when built with SSH1 support, and 7.4 removed it from the server.",
    };
  }
  return { tone: "info", note: "Current OpenSSH only speaks protocol 2 and ignores this keyword. It can be removed." };
}

export function auditConfig(input: string): AuditResult {
  const parsed = parseConfig(input);
  const findings: Finding[] = [...parsed.findings];

  // First value wins: report later lines in the same scope that change nothing.
  const scopes: { label: string; dirs: Directive[] }[] = [
    { label: "global", dirs: parsed.global },
    ...parsed.blocks.map((b) => ({ label: scopeLabel(b), dirs: b.directives })),
  ];
  for (const { label, dirs } of scopes) {
    const first = new Map<string, Directive>();
    for (const d of dirs) {
      const info = KEYWORDS[d.key];
      if (!info || info.multi || d.args.length === 0) continue;
      const prev = first.get(d.key);
      if (!prev) {
        first.set(d.key, d);
        continue;
      }
      if (prev.args.join(" ") !== d.args.join(" ")) {
        findings.push({
          tone: "warn",
          title: `${info.name} on line ${d.line} has no effect`,
          detail: `Line ${prev.line} already set ${prev.written} ${clip(prev.args.join(" "))}, and sshd keeps the first value it reads. Line ${d.line} (${clip(d.args.join(" "))}) is ignored.`,
          line: d.line,
          scope: label,
          key: d.key,
        });
      }
    }
  }

  // Include: the files are invisible here, and they are read where the line is.
  for (const d of [...parsed.global, ...parsed.blocks.flatMap((b) => b.directives)]) {
    if (d.key !== "include") continue;
    findings.push({
      tone: "warn",
      title: "Included files are not audited",
      detail: `${clip(d.args.join(" "))} is read at line ${d.line}. Because the first value wins, anything those files set overrides every later line here. On Debian and Ubuntu this line comes first, so a drop-in such as a cloud-init file with PasswordAuthentication yes beats a later no. Paste the files in at this position, or check the result with sshd -T.`,
      line: d.line,
      scope: d.block === -1 ? "global" : scopeLabel(parsed.blocks[d.block]),
      key: "include",
    });
  }

  // HostKey files: a DSA key is a DSA host key algorithm whether or not it is listed.
  for (const d of [...parsed.global, ...parsed.blocks.flatMap((b) => b.directives)]) {
    if (d.key !== "hostkey") continue;
    const path = d.args[0] ?? "";
    if (/dsa_key/i.test(path) && !/ecdsa/i.test(path)) {
      findings.push({
        tone: "danger",
        title: "DSA host key",
        detail: `${clip(path)} is a DSA key: 1024 bits with SHA-1 signatures. Remove the line and the key; OpenSSH 10.0 no longer supports DSA at all.`,
        line: d.line,
        scope: "global",
        key: "hostkey",
      });
    }
  }

  const resolved = (key: string) => resolveBaseline(parsed, key);
  const pamRes = resolved("usepam");
  const pwRes = resolved("passwordauthentication");
  const usePam = (pamRes.args?.[0] ?? CHECKS.usepam.def).toLowerCase() === "yes";
  const passwordAuth = (pwRes.args?.[0] ?? CHECKS.passwordauthentication.def).toLowerCase() === "yes";
  const disableForwarding = (resolved("disableforwarding").args?.[0] ?? "no").toLowerCase() === "yes";

  const rows: EffectiveRow[] = [];
  const algoWeak: Partial<Record<AlgoKey, { name: string; w: Weakness }[]>> = {};

  for (const key of ROW_ORDER) {
    const r = resolved(key);
    const overrides = overridesFor(parsed, key);
    const isDefault = r.args === null;
    let value: string;
    let verdict: Verdict;
    let name: string;

    if ((ALGO_KEYS as string[]).includes(key)) {
      const ak = key as AlgoKey;
      name = ALGO_NAMES[ak];
      const av = algoVerdict(ak, r.args ? r.args[0] : null);
      algoWeak[ak] = av.weak;
      value = av.list.join(",");
      verdict = av.verdict;
    } else if (key === "protocol") {
      name = "Protocol";
      if (isDefault) continue;
      value = r.args!.join(" ");
      verdict = protocolVerdict(r.args![0]);
    } else if (key === "allowusers" || key === "allowgroups" || key === "denyusers" || key === "denygroups") {
      name = KEYWORDS[key].name;
      value = r.args ? r.args.join(" ") : "(none)";
      verdict = r.args
        ? { tone: "ok", note: key.startsWith("allow") ? "Only matching accounts may log in." : "Matching accounts are refused." }
        : { tone: "ok", note: "Not set." };
    } else {
      const c = CHECKS[key];
      name = c.name;
      value = r.args ? r.args[0] : c.def;
      verdict = withDisable(key, c.check(value, { isDefault, usePam, passwordAuth }), disableForwarding);
    }

    rows.push({
      key,
      name,
      value,
      source: r.source,
      isDefault,
      tone: verdict.tone,
      note: verdict.note,
      overrides,
    });

    if (verdict.tone !== "ok" && key !== "allowusers" && key !== "allowgroups") {
      findings.push({
        tone: verdict.tone,
        title: `${name} ${isDefault ? "(default)" : value.length > 60 ? "" : value}`.trim(),
        detail: verdict.note,
        line: r.line,
        scope: r.source.startsWith("Match all") ? "Match all" : "global",
        key,
      });
    }

    // Values set inside conditional Match blocks, judged for those connections.
    for (const block of parsed.blocks) {
      if (block.all) continue;
      const d = firstDirective(block.directives, key);
      if (!d) continue;
      let v: Verdict;
      if (key === "protocol") v = protocolVerdict(d.args[0]);
      else if ((ALGO_KEYS as string[]).includes(key)) v = algoVerdict(key as AlgoKey, d.args[0]).verdict;
      else if (key in CHECKS) {
        const blockDisable = firstDirective(block.directives, "disableforwarding");
        const disabled = blockDisable ? blockDisable.args[0].toLowerCase() === "yes" : disableForwarding;
        const blockPw = firstDirective(block.directives, "passwordauthentication");
        const pw = blockPw ? blockPw.args[0].toLowerCase() === "yes" : passwordAuth;
        v = withDisable(key, CHECKS[key].check(d.args[0], { isDefault: false, usePam, passwordAuth: pw }), disabled);
      } else continue;
      if (v.tone === "ok") continue;
      findings.push({
        tone: v.tone,
        title: `${name} ${clip(d.args[0])}`,
        detail: `For connections matching ${block.criteria}: ${v.note}`,
        line: d.line,
        scope: scopeLabel(block),
        key,
      });
    }
  }

  // ForceCommand restricts session requests, not channels, and a chroot does
  // not stop outbound sockets: ssh -N opens no session, so port forwarding
  // still works for these accounts unless it is switched off.
  const baseTcp = (resolved("allowtcpforwarding").args?.[0] ?? CHECKS.allowtcpforwarding.def).toLowerCase();
  for (const block of parsed.blocks) {
    if (block.all) continue;
    const limits = [firstDirective(block.directives, "chrootdirectory"), firstDirective(block.directives, "forcecommand")]
      .filter((d): d is Directive => d !== undefined)
      .sort((a, b) => a.line - b.line);
    if (!limits.length) continue;
    const restrict = { name: limits.map((d) => d.name).join(" and "), line: limits[0].line };
    const ownDisable = firstDirective(block.directives, "disableforwarding");
    const disabled = ownDisable ? ownDisable.args[0].toLowerCase() === "yes" : disableForwarding;
    const ownTcp = firstDirective(block.directives, "allowtcpforwarding");
    const tcp = ownTcp ? ownTcp.args[0].toLowerCase() : baseTcp;
    if (disabled || tcp === "no") continue;
    const why = limits
      .map((d) =>
        d.key === "forcecommand"
          ? "ForceCommand applies only to shell, command and subsystem requests"
          : "A chroot limits the file system, not network sockets",
      )
      .join(", and ")
      .replace(", and A chroot", ", and a chroot");
    findings.push({
      tone: "warn",
      title: `Forwarding still allowed for Match ${clip(block.criteria)}`,
      detail: `This block restricts sessions with ${restrict.name}, but AllowTcpForwarding is ${tcp}${ownTcp ? ` (line ${ownTcp.line})` : " for it"}. ${why}, so these accounts can still open tunnels with ssh -N -L or -D. Add AllowTcpForwarding no, or DisableForwarding yes, inside the block.`,
      line: restrict.line,
      scope: scopeLabel(block),
      key: "allowtcpforwarding",
    });
  }

  // Allow lists: missing everywhere is the finding; per-block lists are noted.
  const allowUsersRes = resolved("allowusers");
  const allowGroupsRes = resolved("allowgroups");
  if (!allowUsersRes.args && !allowGroupsRes.args) {
    const scoped = parsed.blocks.some((b) => !b.all && b.directives.some((d) => d.key === "allowusers" || d.key === "allowgroups"));
    findings.push({
      tone: "warn",
      title: "No AllowUsers or AllowGroups",
      detail: `${scoped ? "Only some Match blocks set an allow list. " : ""}Every account with a valid login shell and credentials can log in, including a service account that was given a shell by mistake. AllowGroups with a dedicated group is the easiest to maintain.`,
      line: null,
      scope: "global",
      key: "allowusers",
    });
  } else if (allowUsersRes.args && allowGroupsRes.args) {
    findings.push({
      tone: "info",
      title: "AllowUsers and AllowGroups are both set",
      detail: "A login must pass both lists, not either one. A user in the allowed group who is missing from AllowUsers is refused.",
      line: allowUsersRes.line,
      scope: "global",
      key: "allowusers",
    });
  }

  // Terrapin (CVE-2023-48795) only for lists someone chose explicitly.
  const explicitCiphers = resolved("ciphers").args !== null;
  const explicitMacs = resolved("macs").args !== null;
  const cipherList = effectiveAlgorithms("ciphers", resolved("ciphers").args?.[0] ?? null).list;
  const macList = effectiveAlgorithms("macs", resolved("macs").args?.[0] ?? null).list;
  if ((explicitCiphers && cipherList.includes("chacha20-poly1305@openssh.com")) || (explicitMacs && macList.some((m) => m.endsWith("-etm@openssh.com")))) {
    findings.push({
      tone: "info",
      title: "Terrapin (CVE-2023-48795)",
      detail: "chacha20-poly1305 and the -etm MACs were exposed to the Terrapin prefix truncation attack until strict key exchange, added in OpenSSH 9.6, which works when both ends support it. Keep sshd patched rather than removing them.",
      line: null,
      scope: "global",
      key: "ciphers",
    });
  }

  findings.sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone] || (a.line ?? 0) - (b.line ?? 0));
  const counts: Record<Tone, number> = { danger: 0, warn: 0, info: 0, ok: 0 };
  for (const f of findings) counts[f.tone] += 1;
  const hiddenFindings = Math.max(0, findings.length - MAX_FINDINGS);

  return {
    parsed,
    findings: hiddenFindings ? findings.slice(0, MAX_FINDINGS) : findings,
    rows,
    counts,
    hiddenFindings,
    allowUsers: allowUsersRes.args ?? [],
    allowGroups: allowGroupsRes.args ?? [],
  };
}

/* -------------------------------------------------------------- snippet */

export type SnippetTarget = "9.9" | "8.8" | "7.4";

export const SNIPPET_TARGETS: { id: SnippetTarget; label: string }[] = [
  { id: "9.9", label: "OpenSSH 9.9 or newer" },
  { id: "8.8", label: "OpenSSH 8.8 to 9.8" },
  { id: "7.4", label: "OpenSSH 7.4 to 8.7" },
];

/** User and group patterns, including user@host and user@10.0.0.0/8 forms. */
const SAFE_NAME = /^[A-Za-z0-9._@*?!,%:/[\]-]+$/;

/**
 * A hardened block for the chosen OpenSSH range. Every algorithm name in it
 * exists in the oldest release of that range, because sshd refuses to start
 * on a name it does not know.
 */
export function hardenedSnippet(target: SnippetTarget, allowUsers: string[] = [], allowGroups: string[] = []): string {
  const kex =
    target === "9.9"
      ? "mlkem768x25519-sha256,sntrup761x25519-sha512,sntrup761x25519-sha512@openssh.com,curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,diffie-hellman-group-exchange-sha256"
      : target === "8.8"
        ? "sntrup761x25519-sha512@openssh.com,curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,diffie-hellman-group-exchange-sha256"
        : "curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,diffie-hellman-group-exchange-sha256";
  const hostKeyAlgs = [
    "ssh-ed25519-cert-v01@openssh.com",
    "ecdsa-sha2-nistp256-cert-v01@openssh.com",
    "ecdsa-sha2-nistp384-cert-v01@openssh.com",
    "ecdsa-sha2-nistp521-cert-v01@openssh.com",
    ...(target === "7.4" ? [] : ["rsa-sha2-512-cert-v01@openssh.com", "rsa-sha2-256-cert-v01@openssh.com"]),
    "ssh-ed25519",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
    "rsa-sha2-512",
    "rsa-sha2-256",
  ].join(",");

  const users = allowUsers.filter((u) => SAFE_NAME.test(u));
  const groups = allowGroups.filter((g) => SAFE_NAME.test(g));
  const label = SNIPPET_TARGETS.find((t) => t.id === target)?.label ?? "OpenSSH";

  const lines = [
    `# Hardened sshd settings for ${label}.`,
    "# sshd keeps the first value it reads, so this must come before any",
    "# Include that sets the same keywords and before the first Match line.",
    "# With Include /etc/ssh/sshd_config.d/*.conf at the top of sshd_config,",
    "# save it as /etc/ssh/sshd_config.d/00-hardening.conf so it sorts first.",
    "",
    "PermitRootLogin no",
    "PasswordAuthentication no",
    target === "7.4" ? "ChallengeResponseAuthentication no" : "KbdInteractiveAuthentication no",
    "PermitEmptyPasswords no",
    "PubkeyAuthentication yes",
    "HostbasedAuthentication no",
    "IgnoreRhosts yes",
    "MaxAuthTries 4",
    "LoginGraceTime 30",
    "X11Forwarding no",
    "AllowAgentForwarding no",
    "AllowTcpForwarding no",
    "GatewayPorts no",
    "PermitTunnel no",
    "PermitUserEnvironment no",
    "LogLevel VERBOSE",
    "",
    `KexAlgorithms ${kex}`,
    "Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr",
    "MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com",
    `HostKeyAlgorithms ${hostKeyAlgs}`,
  ];
  if (target === "7.4") {
    lines.push(
      "# Releases before 8.8 still accept ssh-rsa (SHA-1) signatures from",
      "# clients by default. Upgrading is the clean fix.",
    );
  }
  lines.push("");
  if (users.length) lines.push(`AllowUsers ${users.join(" ")}`);
  if (groups.length) lines.push(`AllowGroups ${groups.join(" ")}`);
  if (!users.length && !groups.length) {
    lines.push(
      "# Limit who may log in. Create the group and add your own account",
      "# to it before uncommenting, or this locks everyone out:",
      "# AllowGroups ssh-users",
    );
  }
  lines.push(
    "",
    "# Need forwarding for one account? Re-enable it at the end of the file:",
    "# Match User deploy",
    "#     AllowTcpForwarding local",
    "",
  );
  return lines.join("\n");
}

/* ------------------------------------------------------------- examples */

export const EXAMPLES: { id: string; label: string; config: string }[] = [
  {
    id: "legacy",
    label: "Legacy server",
    config: [
      "# Inherited from an old image",
      "Port 22",
      "Protocol 2,1",
      "HostKey /etc/ssh/ssh_host_rsa_key",
      "HostKey /etc/ssh/ssh_host_dsa_key",
      "PermitRootLogin yes",
      "PasswordAuthentication yes",
      "PermitEmptyPasswords yes",
      "X11Forwarding yes",
      "MaxAuthTries 10",
      "Ciphers aes128-cbc,3des-cbc,aes256-ctr,arcfour",
      "MACs hmac-md5,hmac-sha1,hmac-sha2-256",
      "KexAlgorithms diffie-hellman-group1-sha1,diffie-hellman-group14-sha1,curve25519-sha256",
      "HostKeyAlgorithms +ssh-rsa,ssh-dss",
      "",
      "Match User deploy",
      "    PasswordAuthentication no",
      "    AllowTcpForwarding yes",
      "PasswordAuthentication no",
      "UsePAM yes",
    ].join("\n"),
  },
  {
    id: "ubuntu",
    label: "Stock Ubuntu",
    config: [
      "Include /etc/ssh/sshd_config.d/*.conf",
      "",
      "KbdInteractiveAuthentication no",
      "UsePAM yes",
      "X11Forwarding yes",
      "PrintMotd no",
      "AcceptEnv LANG LC_*",
      "Subsystem sftp /usr/lib/openssh/sftp-server",
    ].join("\n"),
  },
  {
    id: "hardened",
    label: "Hardened",
    config: [
      "PermitRootLogin no",
      "PasswordAuthentication no",
      "KbdInteractiveAuthentication no",
      "PubkeyAuthentication yes",
      "MaxAuthTries 4",
      "LoginGraceTime 30",
      "X11Forwarding no",
      "AllowTcpForwarding no",
      "AllowAgentForwarding no",
      "LogLevel VERBOSE",
      "AllowGroups ssh-users sftp-only",
      "KexAlgorithms mlkem768x25519-sha256,sntrup761x25519-sha512@openssh.com,curve25519-sha256",
      "Ciphers aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr",
      "MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com",
      "UsePAM yes",
      "Subsystem sftp internal-sftp",
      "",
      "Match Group sftp-only",
      "    ChrootDirectory /srv/sftp/%u",
      "    ForceCommand internal-sftp",
      "    PermitTTY no",
    ].join("\n"),
  },
];
