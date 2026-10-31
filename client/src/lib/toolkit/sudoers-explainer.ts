/**
 * sudoers explainer.
 *
 * Parses the lines of a sudoers policy and describes each one in plain
 * language, following the grammar in sudoers(5): alias definitions, Defaults
 * lines, include directives, and user specifications of the shape
 *
 *     who   host = (runas_user:runas_group) TAG: command, command
 *
 * Lists are comma separated and may carry spaces around the commas, a command
 * spec list carries its runas and its tags forward until the next one changes
 * them, and a leading ! negates an item. The parser is deliberately lenient:
 * adversarial or malformed input produces a line level error rather than a
 * throw, so the UI never crashes. No React or DOM, so it unit tests cleanly.
 */

export type Tone = "ok" | "info" | "warn" | "danger";

export const MAX_LINES = 400;
export const MAX_INPUT_CHARS = 60000;

export type AliasType = "User_Alias" | "Runas_Alias" | "Host_Alias" | "Cmnd_Alias";

export interface AliasDef {
  type: "alias";
  line: number;
  aliasType: AliasType;
  name: string;
  members: string[];
  raw: string;
}

export interface DefaultsLine {
  type: "defaults";
  line: number;
  /** The binding sigil, one of "", ":", "@", ">", "!". */
  bind: string;
  /** What the binding applies to, empty for a global Defaults line. */
  target: string;
  settings: string;
  raw: string;
}

export interface IncludeLine {
  type: "include";
  line: number;
  directory: boolean;
  path: string;
  raw: string;
}

export interface RunAs {
  user: string;
  group: string | null;
}

export interface CommandSpec {
  runAs: RunAs | null;
  tags: string[];
  /** The command text, possibly ALL, a path, or a path with arguments. */
  command: string;
  negated: boolean;
}

export interface UserSpec {
  type: "userspec";
  line: number;
  users: string[];
  hosts: string[];
  commands: CommandSpec[];
  raw: string;
}

export interface ParseError {
  type: "error";
  line: number;
  message: string;
  raw: string;
}

export type ParsedLine = AliasDef | DefaultsLine | IncludeLine | UserSpec | ParseError;

export interface Finding {
  tone: Tone;
  title: string;
  detail: string;
}

export interface Explained {
  entry: ParsedLine;
  /** One or more plain sentences describing the line. */
  summary: string[];
  findings: Finding[];
}

export interface ParseResult {
  entries: Explained[];
  lineCount: number;
  truncated: boolean;
  counts: { danger: number; warn: number; info: number };
}

/* ----------------------------------------------------------------- lists */

/**
 * Split a run of tokens into comma separated lists. A list keeps growing while
 * the current token ends with a comma or the next one begins with one, so
 * "root, %wheel ALL" becomes ["root, %wheel", "ALL"]. This is how a user list
 * and a host list are told apart when only whitespace sits between them.
 */
function splitLists(text: string): string[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const lists: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    current.push(token);
    const next = tokens[i + 1];
    const continues = token.endsWith(",") || (next !== undefined && next.startsWith(","));
    if (!continues) {
      lists.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) lists.push(current.join(" "));
  return lists;
}

/** Split a comma separated list into trimmed members, keeping a leading !. */
function listMembers(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Split on commas that are not inside parentheses, for a command spec list. */
function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

/* ----------------------------------------------------------------- tags */

const KNOWN_TAGS = new Set([
  "NOPASSWD",
  "PASSWD",
  "NOEXEC",
  "EXEC",
  "SETENV",
  "NOSETENV",
  "LOG_INPUT",
  "NOLOG_INPUT",
  "LOG_OUTPUT",
  "NOLOG_OUTPUT",
  "MAIL",
  "NOMAIL",
  "FOLLOW",
  "NOFOLLOW",
  "INTERCEPT",
  "NOINTERCEPT",
]);

/**
 * A tag overrides its opposite for the command it sits on and every command
 * after it in the same spec list (sudoers(5)). So "NOPASSWD: a, PASSWD: b"
 * requires a password for b. Setting a tag removes its opposite from the set
 * carried forward.
 */
const OPPOSITE_TAG: Record<string, string> = {
  NOPASSWD: "PASSWD",
  PASSWD: "NOPASSWD",
  NOEXEC: "EXEC",
  EXEC: "NOEXEC",
  SETENV: "NOSETENV",
  NOSETENV: "SETENV",
  LOG_INPUT: "NOLOG_INPUT",
  NOLOG_INPUT: "LOG_INPUT",
  LOG_OUTPUT: "NOLOG_OUTPUT",
  NOLOG_OUTPUT: "LOG_OUTPUT",
  MAIL: "NOMAIL",
  NOMAIL: "MAIL",
  FOLLOW: "NOFOLLOW",
  NOFOLLOW: "FOLLOW",
  INTERCEPT: "NOINTERCEPT",
  NOINTERCEPT: "INTERCEPT",
};

/* ----------------------------------------------------------------- parse */

/** Parse the runas clause (user:group) sitting at the front of a command spec. */
function parseRunAs(text: string): RunAs {
  const inner = text.slice(1, -1).trim();
  if (inner === "") return { user: "", group: null };
  const colon = inner.indexOf(":");
  if (colon === -1) return { user: inner.trim(), group: null };
  return { user: inner.slice(0, colon).trim(), group: inner.slice(colon + 1).trim() };
}

/**
 * Parse one command spec list. Runas and tags set on an earlier element carry
 * forward to the elements after it, which is exactly how sudo reads them.
 */
function parseCommandSpecs(text: string): CommandSpec[] {
  const specs: CommandSpec[] = [];
  let carriedRunAs: RunAs | null = null;
  let carriedTags: string[] = [];

  for (const element of splitTopLevel(text)) {
    let rest = element.trim();

    const runAsMatch = rest.match(/^\(([^)]*)\)\s*/);
    if (runAsMatch) {
      carriedRunAs = parseRunAs(runAsMatch[0].trim());
      rest = rest.slice(runAsMatch[0].length).trim();
    }

    const tags = [...carriedTags];
    // Tags are uppercase words followed by a colon. A tag removes its opposite
    // from the set (PASSWD cancels an earlier NOPASSWD, and so on).
    for (;;) {
      const tagMatch = rest.match(/^([A-Z_]+)\s*:\s*/);
      if (!tagMatch || !KNOWN_TAGS.has(tagMatch[1])) break;
      const tag = tagMatch[1];
      const opposite = OPPOSITE_TAG[tag];
      for (let k = tags.length - 1; k >= 0; k -= 1) {
        if (tags[k] === tag || tags[k] === opposite) tags.splice(k, 1);
      }
      tags.push(tag);
      rest = rest.slice(tagMatch[0].length).trim();
    }
    carriedTags = tags;

    let negated = false;
    while (rest.startsWith("!")) {
      negated = !negated;
      rest = rest.slice(1).trim();
    }

    specs.push({ runAs: carriedRunAs, tags, command: rest, negated });
  }
  return specs;
}

function parseLine(raw: string, line: number): ParsedLine | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("#") && !/^#include(dir)?\b/i.test(trimmed)) return null;

  // Include directives, in both the historic #include and current @include form.
  const include = trimmed.match(/^(?:#|@)\s*include(dir)?\s+(.+)$/i);
  if (include) {
    return {
      type: "include",
      line,
      directory: Boolean(include[1]),
      path: include[2].trim().replace(/^"|"$/g, ""),
      raw: trimmed,
    };
  }

  // Alias definitions.
  const alias = trimmed.match(/^(User_Alias|Runas_Alias|Host_Alias|Cmnd_Alias)\s+(.+)$/);
  if (alias) {
    const body = alias[2];
    const eq = body.indexOf("=");
    if (eq === -1) {
      return { type: "error", line, message: "An alias definition needs an = sign.", raw: trimmed };
    }
    return {
      type: "alias",
      line,
      aliasType: alias[1] as AliasType,
      name: body.slice(0, eq).trim(),
      members: listMembers(body.slice(eq + 1)),
      raw: trimmed,
    };
  }

  // Defaults lines. The binding operator must immediately follow the keyword
  // with no space (sudoers(5)): Defaults:user, Defaults@host, Defaults>runas,
  // Defaults!cmnd. With a space after Defaults the line is global, and a
  // leading ! in the parameter list negates a boolean flag, as in
  // "Defaults !authenticate". Both forms were checked against visudo -c.
  if (/^Defaults(?![A-Za-z0-9_])/.test(trimmed)) {
    const op = trimmed.charAt(8);
    if (op === ":" || op === "@" || op === ">" || op === "!") {
      const after = trimmed.slice(9).trim();
      const m = after.match(/^(\S+)\s*(.*)$/);
      return {
        type: "defaults",
        line,
        bind: op,
        target: m ? m[1] : "",
        settings: m ? m[2].trim() : "",
        raw: trimmed,
      };
    }
    return {
      type: "defaults",
      line,
      bind: "",
      target: "",
      settings: trimmed.replace(/^Defaults\s*/, "").trim(),
      raw: trimmed,
    };
  }

  // Otherwise a user specification: users hosts = command spec list.
  const eq = findSpecEquals(trimmed);
  if (eq === -1) {
    return {
      type: "error",
      line,
      message: "This is not an alias, a Defaults line, an include, or a user rule with an = sign.",
      raw: trimmed,
    };
  }
  const head = trimmed.slice(0, eq);
  const tail = trimmed.slice(eq + 1);
  const lists = splitLists(head);
  if (lists.length < 2) {
    return {
      type: "error",
      line,
      message: "A user rule needs a user list and a host list before the = sign.",
      raw: trimmed,
    };
  }
  const users = listMembers(lists[0]);
  const hosts = listMembers(lists.slice(1).join(" "));
  return { type: "userspec", line, users, hosts, commands: parseCommandSpecs(tail), raw: trimmed };
}

/** The = that separates host list from commands, skipping any inside parens. */
function findSpecEquals(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "=" && depth === 0) return i;
  }
  return -1;
}

/**
 * Join lines that end with a backslash, the sudoers line continuation, so a
 * rule split across several physical lines is read as one. The line number
 * recorded is where the logical line began.
 */
function foldContinuations(lines: string[]): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let buffer = "";
  let start = 0;
  lines.forEach((line, i) => {
    if (buffer === "") start = i + 1;
    if (line.endsWith("\\")) {
      buffer += line.slice(0, -1) + " ";
    } else {
      out.push({ text: buffer + line, line: start });
      buffer = "";
    }
  });
  if (buffer !== "") out.push({ text: buffer.trim(), line: start });
  return out;
}

/* --------------------------------------------------------------- explain */

const ALIAS_WORDS: Record<AliasType, string> = {
  User_Alias: "users",
  Runas_Alias: "run-as identities",
  Host_Alias: "hosts",
  Cmnd_Alias: "commands",
};

/** Describe who an item refers to: a group, a netgroup, an alias, or a user. */
function describeUser(item: string, aliases: Map<string, AliasDef>): string {
  let s = item.trim();
  let prefix = "";
  if (s.startsWith("!")) {
    prefix = "everyone except ";
    s = s.replace(/^!+/, "").trim();
  }
  if (s === "ALL") return `${prefix}every user`;
  if (s.startsWith("%#")) return `${prefix}members of the group with GID ${s.slice(2)}`;
  if (s.startsWith("%:")) return `${prefix}members of the non-Unix group ${s.slice(2)}`;
  if (s.startsWith("%")) return `${prefix}members of group ${s.slice(1)}`;
  if (s.startsWith("+")) return `${prefix}members of netgroup ${s.slice(1)}`;
  if (s.startsWith("#")) return `${prefix}the user with UID ${s.slice(1)}`;
  if (aliases.has(s)) return `${prefix}the alias ${s}`;
  return `${prefix}${s}`;
}

function describeHost(item: string, aliases: Map<string, AliasDef>): string {
  let s = item.trim();
  let prefix = "";
  if (s.startsWith("!")) {
    prefix = "every host except ";
    s = s.replace(/^!+/, "").trim();
  }
  if (s === "ALL") return `${prefix}any host`;
  if (aliases.has(s)) return `${prefix}the alias ${s}`;
  return `${prefix}${s}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function describeRunAs(runAs: RunAs | null): string {
  if (runAs === null) return "root";
  const hasGroup = runAs.group !== null && runAs.group !== "";
  let user: string;
  if (runAs.user === "") {
    // (:group) keeps the invoking user's identity but changes the group; an
    // empty () or an absent clause runs as root.
    user = hasGroup ? "the invoking user" : "root";
  } else if (runAs.user === "ALL") {
    user = "any user";
  } else if (runAs.user.startsWith("#")) {
    user = `the user with UID ${runAs.user.slice(1)}`;
  } else {
    user = runAs.user;
  }
  if (!hasGroup) return user;
  const g = runAs.group as string;
  const group =
    g === "ALL" ? "any group" : g.startsWith("#") ? `the group with GID ${g.slice(1)}` : `group ${g}`;
  return `${user}, ${group}`;
}

/** Commands whose interactive mode or a documented switch spawns a shell. */
const SHELL_ESCAPES: Record<string, string> = {
  vi: "its :!command and :shell let the editor run any command as the target user",
  vim: "its :!command and :shell let the editor run any command as the target user",
  view: "it is vim in read mode and still runs :!command",
  nano: "with the right build options it can read and write any file as the target user",
  emacs: "M-x shell and M-! run commands from inside the editor",
  less: "pressing !command runs a shell from the pager",
  more: "pressing !command runs a shell from the pager",
  man: "it pages with less, so !command reaches a shell",
  find: "-exec runs any program, so find /etc -exec sh ; is a root shell",
  awk: "its system() and 'BEGIN{system(...)}' run shell commands",
  gawk: "its system() runs shell commands",
  nmap: "the interactive mode and --script let it run commands",
  python: "the -c switch and the interpreter run arbitrary code as the target user",
  python3: "the -c switch and the interpreter run arbitrary code as the target user",
  perl: "the -e switch runs arbitrary code as the target user",
  ruby: "the -e switch runs arbitrary code as the target user",
  env: "env runs any program you name, bypassing the path restriction entirely",
  tar: "its --checkpoint-action=exec runs a command during extraction",
  git: "pager and hook settings let git run a shell",
  ed: "its ! command runs a shell",
  ex: "it is vi in line mode and runs :!command",
  sed: "its e command runs shell commands on GNU sed",
  ftp: "its ! command runs a shell",
  gdb: "it runs arbitrary code in the inferior and with its own shell command",
  make: "a target can run any recipe, so make runs commands",
  cpulimit: "its -l flag runs a program under the limit as the target user",
};

/** The last path component of a command, without arguments. */
function commandBasename(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? "";
  const path = first.replace(/^!+/, "");
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function describeCommand(spec: CommandSpec, aliases: Map<string, AliasDef>): string {
  const c = spec.command.trim();
  if (c === "ALL") return "any command";
  if (c === "") return "nothing";
  if (aliases.has(c)) return `the commands in alias ${c}`;
  return c;
}

function findCommandFindings(spec: CommandSpec): Finding[] {
  const findings: Finding[] = [];
  const command = spec.command.trim();
  const base = commandBasename(command);
  const hasNoPasswd = spec.tags.includes("NOPASSWD");

  if (command === "ALL") {
    findings.push({
      tone: "danger",
      title: hasNoPasswd ? "ALL with NOPASSWD" : "ALL commands",
      detail: hasNoPasswd
        ? "This grants every command as the target user with no password, which is unrestricted root equivalent access. One leaked session or shell is a full takeover. Narrow it to the exact commands the user needs."
        : "This grants every command as the target user. It is full administrative access, which is rarely what a specific task needs. Narrow it to the exact commands the user needs.",
    });
    return findings;
  }

  if (hasNoPasswd && command !== "") {
    findings.push({
      tone: "warn",
      title: "NOPASSWD",
      detail:
        "No password is required, so anyone who reaches an authenticated shell as this user gets the grant for free. Reserve NOPASSWD for narrow, non-interactive commands, and never pair it with a command that can start a shell.",
    });
  }

  if (/[*?]/.test(command.replace(/^\S+/, ""))) {
    findings.push({
      tone: "warn",
      title: "Wildcard in arguments",
      detail:
        "A * in the arguments matches more than it looks like it does, including spaces and extra options, so a rule meant for one file can be steered to another target or to added flags. Match the exact arguments, or drop the arguments and trust the command.",
    });
  }

  if (command.endsWith("/") || command === "/" ) {
    findings.push({
      tone: "warn",
      title: "Directory of commands",
      detail:
        "A path ending in a slash permits any file in that directory, but not its subdirectories. A writable file dropped there, or an existing tool in it that spawns a shell, widens the grant.",
    });
  }

  if (base && SHELL_ESCAPES[base] && !spec.tags.includes("NOEXEC")) {
    findings.push({
      tone: "danger",
      title: `Shell escape: ${base}`,
      detail: `${base} can run other commands as the target user because ${SHELL_ESCAPES[base]}. Allowing it is close to allowing a root shell. The NOEXEC tag blocks the common case by refusing further exec calls, where the platform supports it.`,
    });
  }

  if (/^(\/bin\/|\/usr\/bin\/)?(sh|bash|zsh|ksh|dash|fish|csh|tcsh)$/.test(base === "" ? command : base)) {
    findings.push({
      tone: "danger",
      title: "A shell",
      detail: "Granting a shell is granting every command that shell can run as the target user. It is equivalent to ALL.",
    });
  }

  if (spec.runAs && spec.runAs.user === "ALL") {
    findings.push({
      tone: "warn",
      title: "Run as any user",
      detail: "(ALL) lets the command run as any account, including root. If root is not intended, name the exact run-as user.",
    });
  }

  if (!command.startsWith("/") && command !== "ALL" && !/^[A-Z_]+$/.test(command) && !spec.negated) {
    findings.push({
      tone: "info",
      title: "Command is not an absolute path",
      detail:
        "sudo matches a bare command name against the policy, but writing the full path, such as /usr/bin/systemctl, removes any doubt about which binary is meant.",
    });
  }

  return findings;
}

function explainUserSpec(spec: UserSpec, aliases: Map<string, AliasDef>): Explained {
  const who = joinList(spec.users.map((u) => describeUser(u, aliases)));
  const where = joinList(spec.hosts.map((h) => describeHost(h, aliases)));
  const summary: string[] = [];
  const findings: Finding[] = [];

  spec.commands.forEach((cmd) => {
    const runAs = describeRunAs(cmd.runAs);
    const cmdText = describeCommand(cmd, aliases);
    const tagNote = cmd.tags.includes("NOPASSWD")
      ? " without a password"
      : cmd.tags.includes("PASSWD")
        ? " after entering their password"
        : "";
    const extra = cmd.tags.filter((t) => t !== "NOPASSWD" && t !== "PASSWD");
    const extraNote = extra.length ? ` Tags in effect: ${extra.join(", ")}.` : "";
    const verb = cmd.negated ? "may not run" : "may run";
    summary.push(
      `${who.charAt(0).toUpperCase()}${who.slice(1)} ${verb} ${cmdText} as ${runAs} on ${where}${tagNote}.${extraNote}`,
    );
    findings.push(...findCommandFindings(cmd));
  });

  if (spec.commands.length === 0) {
    summary.push(`${who} is named on ${where}, but no command follows the = sign.`);
  }

  return { entry: spec, summary, findings };
}

function explainAlias(alias: AliasDef): Explained {
  const word = ALIAS_WORDS[alias.aliasType];
  const summary = [
    `Defines the alias ${alias.name} as a set of ${word}: ${alias.members.join(", ") || "nothing"}. The name can stand in for that set in later rules.`,
  ];
  return { entry: alias, summary, findings: [] };
}

function explainDefaults(def: DefaultsLine): Explained {
  const scope =
    def.bind === ""
      ? "every user, host, and command"
      : def.bind === ":"
        ? `sessions run by ${def.target}`
        : def.bind === "@"
          ? `commands run from host ${def.target}`
          : def.bind === ">"
            ? `commands run as ${def.target}`
            : `the command ${def.target}`;
  const summary = [`Sets options for ${scope}: ${def.settings || "(none given)"}.`];
  const findings: Finding[] = [];
  if (/!\s*authenticate\b/i.test(def.settings)) {
    findings.push({
      tone: "danger",
      title: "authenticate turned off",
      detail: "Defaults !authenticate drops the password prompt for the lines it covers, the same risk as NOPASSWD but wider.",
    });
  }
  if (/\bsetenv\b/i.test(def.settings) && !/!\s*setenv/i.test(def.settings)) {
    findings.push({
      tone: "warn",
      title: "setenv allowed",
      detail: "Letting the caller keep environment variables can feed a command values such as PATH or LD_PRELOAD that change what it runs.",
    });
  }
  if (/!\s*env_reset\b/i.test(def.settings)) {
    findings.push({
      tone: "warn",
      title: "env_reset turned off",
      detail: "env_reset is what strips the caller's environment before the command runs. Turning it off passes that environment straight through.",
    });
  }
  return { entry: def, summary, findings };
}

function explainInclude(inc: IncludeLine): Explained {
  const summary = inc.directory
    ? [`Reads every file in ${inc.path} as more sudoers rules, in sorted order, skipping names with a dot or a backup suffix.`]
    : [`Reads ${inc.path} as more sudoers rules at this point.`];
  return { entry: inc, summary, findings: [] };
}

/* ------------------------------------------------------------------ main */

export function parseSudoers(input: string): ParseResult {
  const safe = input.length > MAX_INPUT_CHARS ? input.slice(0, MAX_INPUT_CHARS) : input;
  const physical = safe.split(/\r?\n/);
  const truncated = physical.length > MAX_LINES || input.length > MAX_INPUT_CHARS;
  const logical = foldContinuations(physical.slice(0, MAX_LINES));

  const aliases = new Map<string, AliasDef>();
  const parsed: ParsedLine[] = [];

  // First pass: collect alias names so later rules can resolve references.
  for (const { text, line } of logical) {
    let entry: ParsedLine | null = null;
    try {
      entry = parseLine(text, line);
    } catch {
      entry = { type: "error", line, message: "This line could not be parsed.", raw: text.trim() };
    }
    if (entry === null) continue;
    if (entry.type === "alias") aliases.set(entry.name, entry);
    parsed.push(entry);
  }

  const entries: Explained[] = parsed.map((entry) => {
    switch (entry.type) {
      case "userspec":
        return explainUserSpec(entry, aliases);
      case "alias":
        return explainAlias(entry);
      case "defaults":
        return explainDefaults(entry);
      case "include":
        return explainInclude(entry);
      default:
        return { entry, summary: [entry.message], findings: [] };
    }
  });

  const counts = { danger: 0, warn: 0, info: 0 };
  for (const e of entries) {
    for (const f of e.findings) {
      if (f.tone === "danger") counts.danger += 1;
      else if (f.tone === "warn") counts.warn += 1;
      else if (f.tone === "info") counts.info += 1;
    }
  }

  return { entries, lineCount: logical.length, truncated, counts };
}

export interface Example {
  id: string;
  label: string;
  config: string;
}

export const EXAMPLES: Example[] = [
  {
    id: "typical",
    label: "Typical",
    config: [
      "# Members of the admin group may run any command.",
      "%admin ALL=(ALL:ALL) ALL",
      "",
      "# One operator may restart a service without a password.",
      "ops ALL=(root) NOPASSWD: /usr/bin/systemctl restart nginx",
    ].join("\n"),
  },
  {
    id: "aliases",
    label: "With aliases",
    config: [
      "User_Alias DEVS = alice, bob",
      "Cmnd_Alias SERVICES = /usr/bin/systemctl start *, /usr/bin/systemctl stop *",
      "Runas_Alias DEPLOY = deploy",
      "",
      "DEVS ALL=(DEPLOY) NOPASSWD: SERVICES",
    ].join("\n"),
  },
  {
    id: "risky",
    label: "Risky grants",
    config: [
      "# Each of these looks narrow but opens a root shell.",
      "intern ALL=(root) NOPASSWD: /usr/bin/vim",
      "intern ALL=(root) /usr/bin/find /var/log -name *.gz",
      "intern ALL=(ALL) /bin/less /var/log/syslog",
    ].join("\n"),
  },
];
