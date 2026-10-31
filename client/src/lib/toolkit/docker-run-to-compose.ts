/**
 * docker run to Compose converter.
 *
 * Pipeline: the pasted text is split into words the way a POSIX shell does
 * it (XCU 2.2 quoting, 2.3 token recognition), the words are split into
 * commands at the shell operators, each `docker run` command is parsed with
 * the same option grammar the Docker CLI uses (pflag: bundled short flags,
 * `--flag=value`, options end at the image), and the result is written as a
 * Compose file (https://compose-spec.io) by a small YAML writer that quotes
 * exactly the strings YAML would otherwise misread.
 *
 * Nothing is executed and no expansion is performed. A `$VAR` the shell would
 * have expanded is passed on as Compose interpolation, which uses the same
 * syntax, and a literal `$` is written `$$` as Compose requires. Anything the
 * shell would compute (`$(date)`, backticks, `$1`) cannot be reproduced, so
 * it is escaped and reported.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/** Longest input accepted, in UTF-16 code units. */
export const MAX_INPUT = 20000;

/** Most words the tokenizer produces before it stops. */
export const MAX_WORDS = 2000;

/* ================================================================== shell */

/** A run of a word: literal text, or an expansion the shell would perform. */
export interface Part {
  t: string;
  exp: boolean;
}

export interface Word {
  parts: Part[];
  start: number;
  end: number;
}

export type Token = { kind: "word"; word: Word } | { kind: "op"; op: string; start: number };

export type TokenizeResult =
  | { ok: true; tokens: Token[]; warnings: string[] }
  | { ok: false; error: string };

/** The word as the shell would hand it over, with expansions left as typed. */
export function wordText(word: Word): string {
  return word.parts.map((p) => p.t).join("");
}

const OPERATORS = [
  "<<<",
  "<<-",
  "&&",
  "||",
  ";;",
  ">>",
  "<<",
  "<&",
  ">&",
  ">|",
  "<>",
  "|&",
  "&>",
];

const ANSI_SIMPLE = new Map<string, string>([
  ["n", "\n"],
  ["t", "\t"],
  ["r", "\r"],
  ["a", "\x07"],
  ["b", "\b"],
  ["e", "\x1b"],
  ["E", "\x1b"],
  ["f", "\f"],
  ["v", "\v"],
  ["\\", "\\"],
  ["'", "'"],
  ['"', '"'],
  ["?", "?"],
]);

/** Index just past the bracket that closes the one at `i`, or -1. Skips quoted text. */
function skipBalanced(s: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === "\\") {
      j++;
    } else if (ch === "'") {
      const k = s.indexOf("'", j + 1);
      if (k < 0) return -1;
      j = k;
    } else if (ch === '"') {
      j++;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\") j++;
        j++;
      }
      if (j >= s.length) return -1;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

function lineOf(s: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos && i < s.length; i++) if (s[i] === "\n") line++;
  return line;
}

/**
 * Split text into words and operators with POSIX quoting rules. Single quotes
 * keep everything literal, double quotes keep everything but `$`, backtick
 * and a few backslash escapes, a backslash outside quotes escapes the next
 * character, and backslash-newline disappears. `#` at the start of a word
 * begins a comment. Unquoted `~` at the start of a word becomes `${HOME}`.
 */
export function tokenize(source: string): TokenizeResult {
  const s = source.replace(/\r\n?/g, "\n");
  const n = s.length;
  const tokens: Token[] = [];
  const warnings: string[] = [];
  let parts: Part[] = [];
  let wordStart = -1;
  let quoted = false;
  let words = 0;
  let i = 0;

  const lit = (t: string) => {
    if (t === "") return;
    const last = parts[parts.length - 1];
    if (last && !last.exp) last.t += t;
    else parts.push({ t, exp: false });
  };
  const begin = () => {
    if (wordStart < 0) wordStart = i;
  };
  const reset = () => {
    parts = [];
    wordStart = -1;
    quoted = false;
  };
  const end = () => {
    if (wordStart >= 0) {
      tokens.push({ kind: "word", word: { parts, start: wordStart, end: i } });
      words++;
      reset();
    }
  };
  const warnOnce = (msg: string) => {
    if (!warnings.includes(msg)) warnings.push(msg);
  };

  /** Text of an expansion starting at the `$` at `at`, or null when the `$` is literal. */
  const expansion = (at: number): { text: string; next: number } | { error: string } | null => {
    const nx = s[at + 1];
    if (nx === "{") {
      const k = skipBalanced(s, at + 1, "{", "}");
      if (k < 0) return { error: `Unterminated \${ on line ${lineOf(s, at)}. Add the closing brace.` };
      return { text: s.slice(at, k), next: k };
    }
    if (nx === "(") {
      const k = skipBalanced(s, at + 1, "(", ")");
      if (k < 0) {
        return { error: `Unterminated $( on line ${lineOf(s, at)}. Add the closing parenthesis.` };
      }
      return { text: s.slice(at, k), next: k };
    }
    if (nx !== undefined && /[A-Za-z_]/.test(nx)) {
      let k = at + 2;
      while (k < n && /[A-Za-z0-9_]/.test(s[k])) k++;
      return { text: s.slice(at, k), next: k };
    }
    if (nx !== undefined && /[0-9?$!@*#-]/.test(nx)) {
      return { text: s.slice(at, at + 2), next: at + 2 };
    }
    return null;
  };

  /** Backtick substitution at `at`. */
  const backtick = (at: number): { text: string; next: number } | { error: string } => {
    for (let k = at + 1; k < n; k++) {
      if (s[k] === "\\") k++;
      else if (s[k] === "`") return { text: s.slice(at, k + 1), next: k + 1 };
    }
    return {
      error: `Unterminated backtick on line ${lineOf(s, at)}. If this is a PowerShell line continuation, replace the trailing backtick with a backslash.`,
    };
  };

  /** Body of a double quoted string whose first character is at `from`. Returns the index past the closing quote. */
  const readDouble = (from: number): number | { error: string } => {
    let k = from;
    while (k < n) {
      const ch = s[k];
      if (ch === '"') return k + 1;
      if (ch === "\\") {
        const nx = s[k + 1];
        if (nx === "\n") {
          k += 2;
        } else if (nx === "$" || nx === "`" || nx === '"' || nx === "\\") {
          lit(nx);
          k += 2;
        } else {
          lit("\\");
          k++;
        }
      } else if (ch === "$") {
        const e = expansion(k);
        if (e && "error" in e) return e;
        if (e) {
          parts.push({ t: e.text, exp: true });
          k = e.next;
        } else {
          lit("$");
          k++;
        }
      } else if (ch === "`") {
        const e = backtick(k);
        if ("error" in e) return e;
        parts.push({ t: e.text, exp: true });
        k = e.next;
      } else {
        lit(ch);
        k++;
      }
    }
    return { error: `Unterminated double quote starting on line ${lineOf(s, from - 1)}. Add the closing quote.` };
  };

  while (i < n) {
    if (words > MAX_WORDS) {
      return { ok: false, error: `That is more than ${MAX_WORDS} words. Paste one command at a time.` };
    }
    const c = s[i];

    if (c === " " || c === "\t") {
      end();
      i++;
      continue;
    }

    if (c === "\n") {
      // A trailing ^ is the cmd.exe line continuation. Accept it rather than
      // misread the next line as a second command.
      if (wordStart >= 0 && !quoted && parts.length === 1 && !parts[0].exp && parts[0].t === "^") {
        warnOnce("A trailing ^ is a cmd.exe line continuation. It was treated as one. In a POSIX shell, use a backslash.");
        reset();
        i++;
        continue;
      }
      end();
      tokens.push({ kind: "op", op: "\n", start: i });
      i++;
      continue;
    }

    if (c === "\\") {
      if (s[i + 1] === "\n") {
        i += 2;
        continue;
      }
      // A backslash, spaces, then a newline: a shell would read an escaped
      // space and end the command here. Nobody means that, so continue.
      let j = i + 1;
      while (s[j] === " " || s[j] === "\t") j++;
      if (j > i + 1 && s[j] === "\n") {
        warnOnce(
          `Line ${lineOf(s, i)} has spaces after the backslash. A real shell treats that as an escaped space and ends the command there. It was read as a line continuation.`,
        );
        i = j + 1;
        continue;
      }
      begin();
      if (i + 1 < n) {
        lit(s[i + 1]);
        i += 2;
      } else {
        lit("\\");
        i++;
      }
      continue;
    }

    if (c === "'") {
      begin();
      quoted = true;
      const k = s.indexOf("'", i + 1);
      if (k < 0) {
        return { ok: false, error: `Unterminated single quote on line ${lineOf(s, i)}. Add the closing quote.` };
      }
      lit(s.slice(i + 1, k));
      i = k + 1;
      continue;
    }

    if (c === '"') {
      begin();
      quoted = true;
      const r = readDouble(i + 1);
      if (typeof r !== "number") return { ok: false, error: r.error };
      i = r;
      continue;
    }

    if (c === "$") {
      if (s[i + 1] === "'") {
        // bash ANSI-C quoting: $'...'
        begin();
        quoted = true;
        let k = i + 2;
        let out = "";
        let closed = false;
        while (k < n) {
          const ch = s[k];
          if (ch === "'") {
            closed = true;
            k++;
            break;
          }
          if (ch === "\\" && k + 1 < n) {
            const nx = s[k + 1];
            const simple = ANSI_SIMPLE.get(nx);
            if (simple !== undefined) {
              out += simple;
              k += 2;
            } else if (nx === "x" || nx === "u" || nx === "U") {
              const max = nx === "x" ? 2 : nx === "u" ? 4 : 8;
              let h = "";
              let m = k + 2;
              while (m < n && h.length < max && /[0-9a-fA-F]/.test(s[m])) h += s[m++];
              if (h === "") {
                out += "\\" + nx;
                k += 2;
              } else {
                const cp = parseInt(h, 16);
                out += cp <= 0x10ffff ? String.fromCodePoint(cp) : "\ufffd";
                k = m;
              }
            } else if (/[0-7]/.test(nx)) {
              let o = "";
              let m = k + 1;
              while (m < n && o.length < 3 && /[0-7]/.test(s[m])) o += s[m++];
              out += String.fromCharCode(parseInt(o, 8) & 0xff);
              k = m;
            } else {
              out += "\\" + nx;
              k += 2;
            }
            continue;
          }
          out += ch;
          k++;
        }
        if (!closed) {
          return { ok: false, error: `Unterminated $'...' string on line ${lineOf(s, i)}. Add the closing quote.` };
        }
        lit(out);
        i = k;
        continue;
      }
      if (s[i + 1] === '"') {
        // bash locale string $"..." behaves as a double quoted string here.
        begin();
        quoted = true;
        const r = readDouble(i + 2);
        if (typeof r !== "number") return { ok: false, error: r.error };
        i = r;
        continue;
      }
      begin();
      const e = expansion(i);
      if (e && "error" in e) return { ok: false, error: e.error };
      if (e) {
        parts.push({ t: e.text, exp: true });
        i = e.next;
      } else {
        lit("$");
        i++;
      }
      continue;
    }

    if (c === "`") {
      // A backtick that ends a line is PowerShell's continuation character.
      let j = i + 1;
      while (s[j] === " " || s[j] === "\t") j++;
      if (s[j] === "\n") {
        warnOnce("A trailing backtick is a PowerShell line continuation. It was treated as one. In a POSIX shell, use a backslash.");
        i = j + 1;
        continue;
      }
      begin();
      const e = backtick(i);
      if ("error" in e) return { ok: false, error: e.error };
      parts.push({ t: e.text, exp: true });
      i = e.next;
      continue;
    }

    if (c === "#" && wordStart < 0) {
      while (i < n && s[i] !== "\n") i++;
      continue;
    }

    if (c === "|" || c === "&" || c === ";" || c === "<" || c === ">" || c === "(" || c === ")") {
      const ioNumber =
        (c === "<" || c === ">") &&
        wordStart >= 0 &&
        !quoted &&
        parts.length === 1 &&
        !parts[0].exp &&
        /^\d+$/.test(parts[0].t);
      if (ioNumber) reset();
      else end();
      let op = c;
      for (const candidate of OPERATORS) {
        if (s.startsWith(candidate, i) && candidate.length > op.length) op = candidate;
      }
      tokens.push({ kind: "op", op, start: i });
      i += op.length;
      continue;
    }

    if (c === "~" && wordStart < 0 && (i + 1 >= n || /[\s/|&;<>()]/.test(s[i + 1]))) {
      begin();
      parts.push({ t: "${HOME}", exp: true });
      i++;
      continue;
    }

    begin();
    lit(c);
    i++;
  }
  end();
  return { ok: true, tokens, warnings };
}

/* ================================================================== YAML */

/** A string that must be written in double quotes whatever it looks like. */
export interface Quoted {
  quoted: string;
}

/** A list written on one line, every element in double quotes. */
export interface Flow {
  flow: string[];
}

export type Y = string | number | boolean | null | Quoted | Flow | Y[] | Map<string, Y>;

const YAML_WORDS = /^(?:true|false|yes|no|on|off|y|n|null|~)$/i;

function hex(n: number, width: number): string {
  return n.toString(16).padStart(width, "0");
}

/** A double quoted YAML scalar. */
export function yamlDouble(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (c >= 0xd800 && c <= 0xdfff) out += "\\ufffd";
    else if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 || c === 0xfeff) {
      out += c <= 0xff ? `\\x${hex(c, 2)}` : `\\u${hex(c, 4)}`;
    } else out += ch;
  }
  return out + '"';
}

/**
 * True when writing the string bare would make a YAML parser read something
 * other than this string: a number, a boolean, a date, a mapping, a comment,
 * an anchor. The numeric rules follow YAML 1.1 as well as 1.2, because
 * Compose files are read by both kinds of parser and `22:22` is a base-60
 * integer in 1.1.
 */
export function needsQuotes(s: string): boolean {
  if (s === "") return true;
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ufeff]/.test(s)) return true;
  if (s !== s.trim()) return true;
  if (/^[,[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/^[-?:](\s|$)/.test(s)) return true;
  if (s.includes(": ") || s.includes(" #") || s.endsWith(":")) return true;
  if (YAML_WORDS.test(s)) return true;
  if (s === "=" || s === "<<") return true;
  if (/^[-+]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return true;
  if (/^[-+0-9.:_,]+$/.test(s) && /\d/.test(s)) return true;
  if (/^[-+]?0[xXoObB][0-9a-fA-F_]+$/.test(s)) return true;
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(s) || /^\.(?:nan|NaN|NAN)$/.test(s)) return true;
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true;
  return false;
}

/** A YAML scalar for a string: bare when that is safe, double quoted otherwise. */
export function yamlString(s: string): string {
  return needsQuotes(s) ? yamlDouble(s) : s;
}

function inline(v: Y): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : yamlDouble(String(v));
  if (typeof v === "string") return yamlString(v);
  if (Array.isArray(v)) return v.length === 0 ? "[]" : `[${v.map(inline).join(", ")}]`;
  if (v instanceof Map) return "{}";
  if ("quoted" in v) return yamlDouble(v.quoted);
  return `[${v.flow.map(yamlDouble).join(", ")}]`;
}

function emitMap(m: Map<string, Y>, indent: number, out: string[]): void {
  const pad = " ".repeat(indent);
  for (const [k, v] of m) {
    const key = yamlString(k);
    if (v instanceof Map && v.size > 0) {
      out.push(`${pad}${key}:`);
      emitMap(v, indent + 2, out);
    } else if (Array.isArray(v) && v.length > 0) {
      out.push(`${pad}${key}:`);
      emitSeq(v, indent + 2, out);
    } else {
      out.push(`${pad}${key}: ${inline(v)}`);
    }
  }
}

function emitSeq(a: Y[], indent: number, out: string[]): void {
  const pad = " ".repeat(indent);
  for (const item of a) {
    if (item instanceof Map && item.size > 0) {
      const sub: string[] = [];
      emitMap(item, indent + 2, sub);
      sub[0] = `${pad}- ${sub[0].slice(indent + 2)}`;
      out.push(...sub);
    } else {
      out.push(`${pad}- ${inline(item)}`);
    }
  }
}

/** Serialize a mapping as block style YAML with two space indents. */
export function toYaml(root: Map<string, Y>): string {
  const out: string[] = [];
  emitMap(root, 0, out);
  return out.join("\n") + "\n";
}

/* ============================================================== options */

type Kind = "bool" | "value";

const LONG_OPTS = new Map<string, Kind>();
for (const name of (
  "detach disable-content-trust help init interactive no-healthcheck oom-kill-disable privileged " +
  "publish-all quiet read-only rm sig-proxy tty use-api-socket"
).split(" ")) {
  LONG_OPTS.set(name, "bool");
}
for (const name of (
  "add-host annotation attach blkio-weight blkio-weight-device cap-add cap-drop cgroup-parent cgroupns " +
  "cidfile cpu-count cpu-percent cpu-period cpu-quota cpu-rt-period cpu-rt-runtime cpu-shares cpus " +
  "cpuset-cpus cpuset-mems detach-keys device device-cgroup-rule device-read-bps device-read-iops " +
  "device-write-bps device-write-iops dns dns-option dns-search domainname entrypoint env env-file " +
  "expose gpus group-add health-cmd health-interval health-retries health-start-interval " +
  "health-start-period health-timeout hostname io-maxbandwidth io-maxiops ip ip6 ipc isolation " +
  "kernel-memory label label-file link link-local-ip log-driver log-opt mac-address memory " +
  "memory-reservation memory-swap memory-swappiness mount name network network-alias oom-score-adj " +
  "pid pids-limit platform publish pull restart runtime security-opt shm-size stop-signal " +
  "stop-timeout storage-opt sysctl tmpfs ulimit user userns uts volume volume-driver volumes-from workdir"
).split(" ")) {
  LONG_OPTS.set(name, "value");
}

const LONG_ALIASES = new Map<string, string>([
  ["net", "network"],
  ["net-alias", "network-alias"],
]);

const SHORT_OPTS = new Map<string, string>([
  ["a", "attach"],
  ["c", "cpu-shares"],
  ["d", "detach"],
  ["e", "env"],
  ["h", "hostname"],
  ["i", "interactive"],
  ["l", "label"],
  ["m", "memory"],
  ["p", "publish"],
  ["P", "publish-all"],
  ["q", "quiet"],
  ["t", "tty"],
  ["u", "user"],
  ["v", "volume"],
  ["w", "workdir"],
]);

/** Docker client options that may appear before the subcommand and take a value. */
const GLOBAL_VALUE = new Set([
  "-H",
  "--host",
  "--config",
  "-c",
  "--context",
  "-l",
  "--log-level",
  "--tlscacert",
  "--tlscert",
  "--tlskey",
]);

const SUDO_VALUE = new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t"]);

/** Why a flag has no Compose key. */
const UNCONVERTED_REASON = new Map<string, string>([
  ["rm", "Compose has no auto-remove setting for a service. docker compose run --rm removes a one-off container when it exits."],
  ["attach", "Chooses which streams the client attaches to. Compose decides that when you run docker compose up."],
  ["cidfile", "Writes the container ID to a file on the client. Compose has no equivalent."],
  ["detach-keys", "A client keystroke setting, not container configuration."],
  ["disable-content-trust", "A client setting for image signature checks, not container configuration."],
  ["help", "Prints usage and does not start a container."],
  ["quiet", "Only changes how the client prints pull progress."],
  ["sig-proxy", "A client setting for forwarding signals while attached."],
  ["use-api-socket", "Mounts the Docker API socket with credentials. Compose has no equivalent."],
  ["publish-all", "Compose has no equivalent of -P. List the ports you want under ports."],
  ["label-file", "Compose has no label file. Add the labels under labels."],
  ["volume-driver", "Compose sets a volume driver on the top-level volumes entry instead."],
  ["kernel-memory", "Not part of the Compose file format."],
  ["cpuset-mems", "Not part of the Compose file format."],
  ["io-maxbandwidth", "Not part of the Compose file format."],
  ["io-maxiops", "Not part of the Compose file format."],
  ["blkio-weight", "Compose expresses block IO settings under blkio_config. Not converted here."],
  ["blkio-weight-device", "Compose expresses block IO settings under blkio_config. Not converted here."],
  ["device-read-bps", "Compose expresses block IO settings under blkio_config. Not converted here."],
  ["device-read-iops", "Compose expresses block IO settings under blkio_config. Not converted here."],
  ["device-write-bps", "Compose expresses block IO settings under blkio_config. Not converted here."],
  ["device-write-iops", "Compose expresses block IO settings under blkio_config. Not converted here."],
]);

/** Compose key order inside a service, so the output reads the way people write it. */
const KEY_ORDER = [
  "image",
  "container_name",
  "hostname",
  "domainname",
  "user",
  "working_dir",
  "entrypoint",
  "command",
  "restart",
  "init",
  "privileged",
  "read_only",
  "stdin_open",
  "tty",
  "platform",
  "pull_policy",
  "runtime",
  "ports",
  "expose",
  "volumes",
  "volumes_from",
  "tmpfs",
  "devices",
  "device_cgroup_rules",
  "environment",
  "env_file",
  "labels",
  "annotations",
  "networks",
  "network_mode",
  "mac_address",
  "dns",
  "dns_search",
  "dns_opt",
  "extra_hosts",
  "links",
  "cap_add",
  "cap_drop",
  "security_opt",
  "group_add",
  "sysctls",
  "ulimits",
  "logging",
  "healthcheck",
  "stop_signal",
  "stop_grace_period",
  "mem_limit",
  "mem_reservation",
  "memswap_limit",
  "mem_swappiness",
  "oom_kill_disable",
  "oom_score_adj",
  "cpus",
  "cpu_shares",
  "cpuset",
  "cpu_period",
  "cpu_quota",
  "cpu_rt_period",
  "cpu_rt_runtime",
  "cpu_count",
  "cpu_percent",
  "pids_limit",
  "shm_size",
  "pid",
  "ipc",
  "uts",
  "userns_mode",
  "cgroup",
  "cgroup_parent",
  "isolation",
  "storage_opt",
  "deploy",
];

/** Flags that become one string key, with how the value is typed. */
const SCALAR_KEYS = new Map<string, { key: string; type: "string" | "bytes" | "int" | "number" | "seconds" }>([
  ["hostname", { key: "hostname", type: "string" }],
  ["domainname", { key: "domainname", type: "string" }],
  ["user", { key: "user", type: "string" }],
  ["workdir", { key: "working_dir", type: "string" }],
  ["mac-address", { key: "mac_address", type: "string" }],
  ["stop-signal", { key: "stop_signal", type: "string" }],
  ["stop-timeout", { key: "stop_grace_period", type: "seconds" }],
  ["platform", { key: "platform", type: "string" }],
  ["pull", { key: "pull_policy", type: "string" }],
  ["runtime", { key: "runtime", type: "string" }],
  ["pid", { key: "pid", type: "string" }],
  ["ipc", { key: "ipc", type: "string" }],
  ["uts", { key: "uts", type: "string" }],
  ["userns", { key: "userns_mode", type: "string" }],
  ["cgroupns", { key: "cgroup", type: "string" }],
  ["cgroup-parent", { key: "cgroup_parent", type: "string" }],
  ["isolation", { key: "isolation", type: "string" }],
  ["memory", { key: "mem_limit", type: "bytes" }],
  ["memory-reservation", { key: "mem_reservation", type: "bytes" }],
  ["memory-swap", { key: "memswap_limit", type: "bytes" }],
  ["shm-size", { key: "shm_size", type: "bytes" }],
  ["memory-swappiness", { key: "mem_swappiness", type: "int" }],
  ["oom-score-adj", { key: "oom_score_adj", type: "int" }],
  ["cpus", { key: "cpus", type: "number" }],
  ["cpu-shares", { key: "cpu_shares", type: "int" }],
  ["cpuset-cpus", { key: "cpuset", type: "string" }],
  ["cpu-period", { key: "cpu_period", type: "int" }],
  ["cpu-quota", { key: "cpu_quota", type: "int" }],
  ["cpu-rt-period", { key: "cpu_rt_period", type: "int" }],
  ["cpu-rt-runtime", { key: "cpu_rt_runtime", type: "int" }],
  ["cpu-count", { key: "cpu_count", type: "int" }],
  ["cpu-percent", { key: "cpu_percent", type: "int" }],
  ["pids-limit", { key: "pids_limit", type: "int" }],
]);

/** Boolean flags that become `key: true`. */
const BOOL_KEYS = new Map<string, string>([
  ["privileged", "privileged"],
  ["read-only", "read_only"],
  ["interactive", "stdin_open"],
  ["tty", "tty"],
  ["init", "init"],
  ["oom-kill-disable", "oom_kill_disable"],
]);

/** Flags that append to a list of plain strings. */
const LIST_KEYS = new Map<string, string>([
  ["cap-add", "cap_add"],
  ["cap-drop", "cap_drop"],
  ["device", "devices"],
  ["device-cgroup-rule", "device_cgroup_rules"],
  ["dns", "dns"],
  ["dns-search", "dns_search"],
  ["dns-option", "dns_opt"],
  ["add-host", "extra_hosts"],
  ["expose", "expose"],
  ["group-add", "group_add"],
  ["security-opt", "security_opt"],
  ["tmpfs", "tmpfs"],
  ["sysctl", "sysctls"],
  ["link", "links"],
  ["label", "labels"],
  ["annotation", "annotations"],
  ["env-file", "env_file"],
  ["env", "environment"],
]);

/* ================================================================ result */

export interface Note {
  level: "warn" | "info";
  text: string;
}

export interface Unconverted {
  flag: string;
  reason: string;
}

export interface Mapping {
  flag: string;
  key: string;
}

export interface ConvertOptions {
  /** Name for the service when the input holds a single docker run command. */
  serviceName?: string;
  /** Declare named volumes `external: true` so a volume docker run created is reused. */
  externalVolumes?: boolean;
}

export type ConvertResult =
  | {
      ok: true;
      yaml: string;
      services: string[];
      notes: Note[];
      unconverted: Unconverted[];
      mappings: Mapping[];
    }
  | { ok: false; error: string };

/* ============================================================== helpers */

/** Compose variable names, and the operators Compose interpolation supports. */
const SIMPLE_VAR = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;
const BRACE_VAR = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?+])([\s\S]*))?\}$/;

interface Sink {
  note(level: "warn" | "info", text: string): void;
}

/**
 * The Compose spelling of one shell word. Literal text has its `$` doubled,
 * a variable the shell would read becomes Compose interpolation, and
 * `$(pwd)` becomes `${PWD}`. What the shell would compute cannot be
 * reproduced, so it is escaped and reported.
 */
function composeWord(word: Word, sink: Sink): string {
  let out = "";
  for (const part of word.parts) {
    if (!part.exp) {
      out += part.t.split("$").join("$$");
      continue;
    }
    const t = part.t;
    const simple = SIMPLE_VAR.exec(t);
    if (simple) {
      out += `\${${simple[1]}}`;
      continue;
    }
    const brace = BRACE_VAR.exec(t);
    if (brace && (brace[3] === undefined || !/[`'"\\]|\$\(/.test(brace[3]))) {
      out += t;
      continue;
    }
    if (/^\$\(\s*pwd\s*\)$/.test(t) || /^`\s*pwd\s*`$/.test(t)) {
      out += "${PWD}";
      continue;
    }
    if (t.startsWith("$(") || t.startsWith("`")) {
      sink.note(
        "warn",
        `${t.length > 60 ? t.slice(0, 57) + "..." : t} is a command substitution. Compose does not run commands, so it is kept as literal text. Replace it with a fixed value or a variable.`,
      );
    } else if (t.startsWith("${")) {
      sink.note(
        "warn",
        `${t.length > 60 ? t.slice(0, 57) + "..." : t} uses a shell expansion that Compose does not support, so it is kept as literal text. Compose understands only \${VAR}, \${VAR:-default}, \${VAR-default}, \${VAR:?error}, \${VAR?error}, \${VAR:+alt} and \${VAR+alt}.`,
      );
    } else {
      sink.note("warn", `${t} is a shell parameter that has no meaning in a Compose file, so it is kept as literal text.`);
    }
    out += t.split("$").join("$$");
  }
  return out;
}

/** True when the string still holds a Compose variable reference. */
function hasVariable(s: string): boolean {
  return s.split("$$").join("").includes("$");
}

function typed(v: string, type: "string" | "bytes" | "int" | "number"): Y {
  if ((type === "int" || type === "bytes") && /^-?\d+$/.test(v) && String(Number(v)) === v && Number.isSafeInteger(Number(v))) {
    return Number(v);
  }
  if (type === "number" && /^\d+(\.\d+)?$/.test(v) && String(Number(v)) === v) return Number(v);
  return v;
}

/** `name=value` split at the first `=`. */
function splitKv(s: string): [string, string | null] {
  const i = s.indexOf("=");
  return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 1)];
}

function parseBool(v: string): boolean | null {
  if (/^(?:1|t|T|TRUE|true|True)$/.test(v)) return true;
  if (/^(?:0|f|F|FALSE|false|False)$/.test(v)) return false;
  return null;
}

function csvFields(s: string): string[] | null {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuote = false;
      } else cur += ch;
    } else if (ch === '"' && cur === "") {
      inQuote = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (inQuote) return null;
  fields.push(cur);
  return fields;
}

/** Split a -v value on colons, keeping `${VAR:-x}` whole and a leading Windows drive letter intact. */
export function splitVolume(spec: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let i = 0;
  if (/^[A-Za-z]:[\\/]/.test(spec)) {
    cur = spec.slice(0, 2);
    i = 2;
  }
  for (; i < spec.length; i++) {
    const ch = spec[i];
    if (ch === "$" && spec[i + 1] === "$") {
      cur += "$$";
      i++;
    } else if (ch === "$" && spec[i + 1] === "{") {
      depth++;
      cur += "${";
      i++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      cur += ch;
    } else if (ch === ":" && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const NAMED_VOLUME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function isPathLike(s: string): boolean {
  return /^(?:[/.~]|[A-Za-z]:[\\/]|\\\\)/.test(s);
}

/** A bind mount source of the working directory becomes `.`, which Compose resolves against the Compose file. */
function relativeSource(s: string): string {
  return s.replace(/^\$\{PWD\}(?=$|[/:])/, ".");
}

const PORT_SPEC =
  /^(?:(?:\[[0-9a-fA-F:.]+\]|\d{1,3}(?:\.\d{1,3}){3}):)?(?:(?:\d+(?:-\d+)?)?:)?\d+(?:-\d+)?(?:\/(?:tcp|udp|sctp))?$/;

function portProblem(spec: string): string | null {
  if (hasVariable(spec)) return null;
  if (!PORT_SPEC.test(spec)) {
    return `The port mapping ${spec} does not look like [ip:][host-port:]container-port[/protocol].`;
  }
  const digits = spec.replace(/\/[a-z]+$/, "").match(/\d+/g) ?? [];
  for (const d of digits) {
    if (Number(d) > 65535) return `The port mapping ${spec} uses ${d}, which is above the highest port, 65535.`;
  }
  return null;
}

const DURATION = /^(?:0|(?:\d+(?:\.\d+)?(?:ns|us|\u00b5s|ms|s|m|h))+)$/;
const BYTES = /^\d+(?:\.\d+)*\s?[kKmMgGtTpP]?[iI]?[bB]?$/;

/** Last path segment of an image reference, minus tag and digest, as a service name. */
export function deriveServiceName(image: string): string {
  let ref = image.split("@")[0];
  const slash = ref.lastIndexOf("/");
  const colon = ref.lastIndexOf(":");
  if (colon > slash) ref = ref.slice(0, colon);
  const base = ref.slice(ref.lastIndexOf("/") + 1);
  return sanitizeName(base);
}

function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return /[A-Za-z0-9]/.test(cleaned) ? cleaned : "app";
}

/** Image tag, or null when the reference has none. A digest counts as pinned. */
function imageTag(image: string): string | null {
  if (image.includes("@")) return "@";
  const slash = image.lastIndexOf("/");
  const colon = image.lastIndexOf(":");
  return colon > slash ? image.slice(colon + 1) : null;
}

const SECRET_NAME = /(?:^|_)(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIALS?)(?:_|$)/i;

/* ============================================================ run parser */

interface Flag {
  name: string;
  value: string;
  raw: string;
  /** The flag as the reader typed it, for messages. */
  shown: string;
}

interface Arg {
  v: string;
  raw: string;
}

type ParsedRun =
  | { ok: true; flags: Flag[]; image: string; imageRaw: string; command: Arg[]; unknown: string[] }
  | { ok: false; error: string };

function parseRunArgs(args: Arg[]): ParsedRun {
  const flags: Flag[] = [];
  const unknown: string[] = [];
  let i = 0;

  const rawTail = (arg: Arg, cut: number): string => {
    // The flag part before the value holds no expansions, so both spellings
    // share the same offset there.
    return arg.v.slice(0, cut) === arg.raw.slice(0, cut) ? arg.raw.slice(cut) : arg.v.slice(cut);
  };

  while (i < args.length) {
    const arg = args[i];
    const a = arg.v;
    if (a === "--") {
      i++;
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const typedName = eq < 0 ? a.slice(2) : a.slice(2, eq);
      const name = LONG_ALIASES.get(typedName) ?? typedName;
      const kind = LONG_OPTS.get(name);
      if (kind === undefined) {
        unknown.push(`--${typedName}`);
        flags.push({ name: typedName, value: eq < 0 ? "" : a.slice(eq + 1), raw: eq < 0 ? "" : rawTail(arg, eq + 1), shown: eq < 0 ? `--${typedName}` : `--${typedName}=${rawTail(arg, eq + 1)}` });
        i++;
        continue;
      }
      if (kind === "bool") {
        flags.push({
          name,
          value: eq < 0 ? "true" : a.slice(eq + 1),
          raw: eq < 0 ? "true" : rawTail(arg, eq + 1),
          shown: arg.raw,
        });
        i++;
        continue;
      }
      if (eq >= 0) {
        const raw = rawTail(arg, eq + 1);
        flags.push({ name, value: a.slice(eq + 1), raw, shown: `--${typedName} ${raw}` });
        i++;
        continue;
      }
      const next = args[i + 1];
      if (!next) return { ok: false, error: `The option --${typedName} needs a value, but the command ends there.` };
      flags.push({ name, value: next.v, raw: next.raw, shown: `--${typedName} ${next.raw}` });
      i += 2;
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      // A cluster of short flags: -it, -p8080:80, -e=A=B, -itp 80:80.
      let pos = 1;
      let consumedNext = false;
      while (pos < a.length) {
        const ch = a[pos];
        const longName = SHORT_OPTS.get(ch);
        if (longName === undefined) {
          unknown.push(`-${ch}`);
          flags.push({ name: ch, value: "", raw: "", shown: `-${ch}` });
          pos++;
          continue;
        }
        const kind = LONG_OPTS.get(longName) ?? "bool";
        if (a.length - pos > 1 && a[pos + 1] === "=") {
          const raw = rawTail(arg, pos + 2);
          flags.push({
            name: longName,
            value: a.slice(pos + 2),
            raw,
            shown: kind === "bool" ? `-${ch}=${raw}` : `-${ch} ${raw}`,
          });
          pos = a.length;
          break;
        }
        if (kind === "bool") {
          flags.push({ name: longName, value: "true", raw: "true", shown: `-${ch}` });
          pos++;
          continue;
        }
        if (pos + 1 < a.length) {
          const raw = rawTail(arg, pos + 1);
          flags.push({ name: longName, value: a.slice(pos + 1), raw, shown: `-${ch} ${raw}` });
          pos = a.length;
          break;
        }
        const next = args[i + 1];
        if (!next) return { ok: false, error: `The option -${ch} needs a value, but the command ends there.` };
        flags.push({ name: longName, value: next.v, raw: next.raw, shown: `-${ch} ${next.raw}` });
        consumedNext = true;
        pos++;
      }
      i += consumedNext ? 2 : 1;
      continue;
    }
    break;
  }

  const image = args[i];
  if (!image) {
    return { ok: false, error: "No image name was found. docker run needs an image after its options." };
  }
  return { ok: true, flags, image: image.v, imageRaw: image.raw, command: args.slice(i + 1), unknown };
}

/* ========================================================== conversion */

interface Built {
  name: string;
  body: Map<string, Y>;
  namedVolumes: string[];
  networks: string[];
}

interface Context {
  sink: Sink;
  unconverted: Unconverted[];
  mappings: Mapping[];
}

interface NetAttach {
  name: string;
  aliases: string[];
  ipv4?: string;
  ipv6?: string;
  linkLocal: string[];
}

function convertRun(parsed: Extract<ParsedRun, { ok: true }>, ctx: Context, serviceName?: string): Built {
  const { sink } = ctx;
  const fields = new Map<string, Y>();
  const lists = new Map<string, Y[]>();
  const namedVolumes: string[] = [];
  const netAttach: NetAttach[] = [];
  const netModes: string[] = [];
  const pendingAliases: string[] = [];
  let ipv4: string | undefined;
  let ipv6: string | undefined;
  const linkLocal: string[] = [];
  const logOpts = new Map<string, Y>();
  let logDriver: string | undefined;
  const ulimits = new Map<string, Y>();
  const storageOpt = new Map<string, Y>();
  const health = new Map<string, Y>();
  let noHealth = false;
  let gpus: Y | null = null;
  let detached = false;
  let autoRemove = false;
  let restart: string | null = null;
  let containerName: string | null = null;
  let privileged = false;
  let hostNetwork = false;
  let hostPid = false;
  let dockerSocket = false;
  const mappingFor = (flag: string, key: string) => ctx.mappings.push({ flag, key });
  const skip = (flag: string, reason: string) => ctx.unconverted.push({ flag, reason });
  const push = (key: string, value: Y) => {
    const list = lists.get(key);
    if (list) list.push(value);
    else lists.set(key, [value]);
  };

  for (const w of parsed.unknown) {
    ctx.unconverted.push({
      flag: w,
      reason: "Not recognized by this converter, so it was assumed to take no value. Check the spelling and your Docker version.",
    });
  }

  for (const flag of parsed.flags) {
    const { name, value, shown } = flag;
    if (LONG_OPTS.get(name) === undefined) continue; // already reported as unknown

    const kind = LONG_OPTS.get(name);
    let on = true;
    if (kind === "bool") {
      const b = parseBool(value);
      if (b === null) {
        sink.note("warn", `${shown} has the value ${value}, which is not a boolean. docker run would refuse it, so it was ignored.`);
        continue;
      }
      on = b;
      if (!on) continue;
    }

    const bool = BOOL_KEYS.get(name);
    if (bool !== undefined) {
      fields.set(bool, true);
      mappingFor(shown, bool);
      if (name === "privileged") privileged = true;
      continue;
    }

    const scalar = SCALAR_KEYS.get(name);
    if (scalar !== undefined) {
      const v = value;
      if (scalar.type === "seconds") {
        fields.set(scalar.key, /^\d+$/.test(v) ? `${v}s` : v);
      } else {
        fields.set(scalar.key, typed(v, scalar.type));
      }
      mappingFor(shown, scalar.key);
      if (name === "memory" && v !== "" && !hasVariable(v) && !BYTES.test(v)) {
        sink.note("warn", `${shown}: ${v} is not a size Docker accepts. Use a number with an optional b, k, m or g suffix, such as 512m.`);
      }
      if (name === "cpus" && !hasVariable(v) && !/^\d+(\.\d+)?$/.test(v)) {
        sink.note("warn", `${shown}: ${v} is not a number of CPUs. Use a decimal such as 0.5 or 2.`);
      }
      if (name === "pid" && v === "host") hostPid = true;
      if (scalar.type === "int" && !hasVariable(v) && !/^-?\d+$/.test(v)) {
        sink.note("warn", `${shown}: ${v} is not an integer.`);
      }
      continue;
    }

    const listKey = LIST_KEYS.get(name);
    if (listKey !== undefined) {
      if (name === "env") {
        const [envName, envValue] = splitKv(value);
        if (SECRET_NAME.test(envName) && envValue && !hasVariable(envValue)) {
          sink.note(
            "warn",
            `${envName} looks like a secret and its value is written into the Compose file. Keep it out of version control with an env_file, or use Compose secrets.`,
          );
        }
      }
      push(listKey, value);
      mappingFor(shown, listKey);
      if (name === "cap-add" && /^(?:ALL|SYS_ADMIN)$/i.test(value)) {
        sink.note(
          "warn",
          `--cap-add ${value} gives the container ${/^ALL$/i.test(value) ? "every Linux capability" : "a capability that is close to root on the host"}. Add only the specific capabilities the program needs.`,
        );
      }
      if (name === "security-opt" && /^(?:seccomp|apparmor)[=:]unconfined$/i.test(value)) {
        sink.note("warn", `${value} turns off a kernel confinement profile for this container.`);
      }
      continue;
    }

    switch (name) {
      case "detach":
        detached = true;
        break;
      case "rm":
        autoRemove = true;
        skip(shown, UNCONVERTED_REASON.get("rm") ?? "");
        break;
      case "name":
        containerName = value;
        break;
      case "restart": {
        restart = value;
        fields.set("restart", value);
        mappingFor(shown, "restart");
        if (!hasVariable(value) && !/^(?:no|always|unless-stopped|on-failure(?::\d+)?)$/.test(value)) {
          sink.note("warn", `${shown}: ${value} is not a restart policy. Use no, always, unless-stopped or on-failure[:max-retries].`);
        }
        break;
      }
      case "entrypoint":
        fields.set("entrypoint", value === "" ? [] : { flow: [value] });
        mappingFor(shown, "entrypoint");
        if (value === "") {
          sink.note("info", "An empty --entrypoint clears the image's ENTRYPOINT. Compose expresses that as an empty list.");
        }
        break;
      case "publish": {
        const problem = portProblem(value);
        if (problem) sink.note("warn", problem);
        push("ports", { quoted: value });
        mappingFor(shown, "ports");
        break;
      }
      case "volume": {
        const parts = splitVolume(value);
        if (parts.length > 3) {
          sink.note("warn", `${shown} has more than three colon separated fields. It was passed through unchanged.`);
          push("volumes", value);
        } else if (parts.length === 1) {
          push("volumes", value);
        } else {
          const src = relativeSource(parts[0]);
          const rest = parts.slice(1);
          push("volumes", [src, ...rest].join(":"));
          if (parts[0] !== src) {
            sink.note("info", "A bind mount of the working directory was written as ., the directory that holds the Compose file.");
          }
          if (NAMED_VOLUME.test(src)) {
            if (!namedVolumes.includes(src)) namedVolumes.push(src);
          } else if (isPathLike(src) || src.includes("/")) {
            if (!isPathLike(src) && !hasVariable(src)) {
              sink.note(
                "warn",
                `${shown}: ${src} is neither an absolute path nor a valid volume name. docker run rejects this. Start a host path with ./ or /.`,
              );
            }
          } else if (hasVariable(src)) {
            sink.note(
              "info",
              `${shown}: whether ${src} is a named volume or a path depends on the variable. It is kept as a bind mount and not declared under volumes.`,
            );
          } else {
            sink.note("warn", `${shown}: ${src} is not a valid volume name. docker run rejects it.`);
          }
          if (/^\/var\/run\/docker\.sock$|^\/run\/docker\.sock$/.test(src)) dockerSocket = true;
        }
        mappingFor(shown, "volumes");
        break;
      }
      case "mount": {
        const mounted = convertMount(value, shown, ctx);
        if (mounted) {
          push("volumes", mounted.item);
          if (mounted.named && !namedVolumes.includes(mounted.named)) namedVolumes.push(mounted.named);
          if (mounted.dockerSocket) dockerSocket = true;
          mappingFor(shown, "volumes");
        }
        break;
      }
      case "volumes-from":
        push("volumes_from", /^container:/.test(value) ? value : `container:${value}`);
        mappingFor(shown, "volumes_from");
        break;
      case "network": {
        const attach = parseNetwork(value, shown, ctx);
        if (attach.mode) netModes.push(attach.mode);
        if (attach.attach) netAttach.push(attach.attach);
        if (attach.mode === "host") hostNetwork = true;
        if (attach.mode || attach.attach) mappingFor(shown, attach.mode ? "network_mode" : "networks");
        break;
      }
      case "network-alias":
        pendingAliases.push(value);
        mappingFor(shown, "networks");
        break;
      case "ip":
        ipv4 = value;
        mappingFor(shown, "networks");
        break;
      case "ip6":
        ipv6 = value;
        mappingFor(shown, "networks");
        break;
      case "link-local-ip":
        linkLocal.push(value);
        mappingFor(shown, "networks");
        break;
      case "log-driver":
        logDriver = value;
        mappingFor(shown, "logging");
        break;
      case "log-opt": {
        const [k, v] = splitKv(value);
        if (v === null) {
          sink.note("warn", `${shown} has no = sign. Log options are key=value pairs, so it was ignored.`);
        } else {
          logOpts.set(k, v);
          mappingFor(shown, "logging");
        }
        break;
      }
      case "ulimit": {
        const [k, v] = splitKv(value);
        if (v === null || !/^-?\d+(?::-?\d+)?$/.test(v)) {
          sink.note("warn", `${shown} is not name=soft[:hard]. It was ignored.`);
          break;
        }
        const [soft, hard] = v.split(":");
        ulimits.set(
          k,
          hard === undefined
            ? Number(soft)
            : new Map<string, Y>([
                ["soft", Number(soft)],
                ["hard", Number(hard)],
              ]),
        );
        mappingFor(shown, "ulimits");
        break;
      }
      case "storage-opt": {
        const [k, v] = splitKv(value);
        if (v === null) {
          sink.note("warn", `${shown} has no = sign. Storage options are key=value pairs, so it was ignored.`);
        } else {
          storageOpt.set(k, v);
          mappingFor(shown, "storage_opt");
        }
        break;
      }
      case "health-cmd":
        if (value !== "") {
          health.set("test", { flow: ["CMD-SHELL", value] });
          mappingFor(shown, "healthcheck.test");
        }
        break;
      case "health-interval":
      case "health-timeout":
      case "health-start-period":
      case "health-start-interval": {
        const key = name.slice("health-".length).replace(/-/g, "_");
        health.set(key, value);
        mappingFor(shown, `healthcheck.${key}`);
        if (!hasVariable(value) && !DURATION.test(value)) {
          sink.note("warn", `${shown}: ${value} is not a duration. Use a number with a unit, such as 30s or 1m30s.`);
        }
        break;
      }
      case "health-retries":
        health.set("retries", typed(value, "int"));
        mappingFor(shown, "healthcheck.retries");
        if (!hasVariable(value) && !/^\d+$/.test(value)) sink.note("warn", `${shown}: ${value} is not an integer.`);
        break;
      case "no-healthcheck":
        noHealth = true;
        mappingFor(shown, "healthcheck.disable");
        break;
      case "gpus": {
        const m = /^(?:"?device=([^"]+)"?|all|(\d+))$/.exec(value);
        if (!m) {
          skip(shown, "Only all, a count and device=ID lists are converted. Write the device reservation under deploy.resources.reservations.devices by hand.");
        } else {
          const entry = new Map<string, Y>([["driver", "nvidia"]]);
          if (m[1] !== undefined) entry.set("device_ids", m[1].split(",").map((d) => ({ quoted: d })));
          else if (m[2] !== undefined) entry.set("count", Number(m[2]));
          else entry.set("count", "all");
          entry.set("capabilities", ["gpu"]);
          gpus = entry;
          mappingFor(shown, "deploy.resources.reservations.devices");
        }
        break;
      }
      default: {
        const reason = UNCONVERTED_REASON.get(name);
        skip(shown, reason ?? "Not part of the Compose service definition this converter writes.");
      }
    }
  }

  /* ---- assemble what needed several flags ---- */

  if (containerName !== null) {
    fields.set("container_name", containerName);
    mappingFor(`--name ${containerName}`, "container_name");
  }

  if (logDriver !== undefined || logOpts.size > 0) {
    const logging = new Map<string, Y>();
    if (logDriver !== undefined) logging.set("driver", logDriver);
    if (logOpts.size > 0) logging.set("options", logOpts);
    fields.set("logging", logging);
  }
  if (ulimits.size > 0) fields.set("ulimits", ulimits);
  if (storageOpt.size > 0) fields.set("storage_opt", storageOpt);

  if (noHealth) {
    if (health.size > 0) {
      sink.note("warn", "--no-healthcheck conflicts with the other --health-* flags. docker run refuses that combination. Only the disable was kept.");
    }
    fields.set("healthcheck", new Map<string, Y>([["disable", true]]));
  } else if (health.size > 0) {
    const ordered = new Map<string, Y>();
    for (const key of ["test", "interval", "timeout", "retries", "start_period", "start_interval"]) {
      const v = health.get(key);
      if (v !== undefined) ordered.set(key, v);
    }
    fields.set("healthcheck", ordered);
  }

  if (gpus) {
    fields.set(
      "deploy",
      new Map<string, Y>([
        [
          "resources",
          new Map<string, Y>([
            ["reservations", new Map<string, Y>([["devices", [gpus]]])],
          ]),
        ],
      ]),
    );
  }

  /* networks */
  const customNets: NetAttach[] = [];
  for (const a of netAttach) {
    const existing = customNets.find((n) => n.name === a.name);
    if (existing) {
      existing.aliases.push(...a.aliases);
      existing.linkLocal.push(...a.linkLocal);
      existing.ipv4 ??= a.ipv4;
      existing.ipv6 ??= a.ipv6;
    } else customNets.push({ ...a, aliases: [...a.aliases], linkLocal: [...a.linkLocal] });
  }
  const extras = pendingAliases.length > 0 || ipv4 !== undefined || ipv6 !== undefined || linkLocal.length > 0;
  let mode: string | null = null;
  if (netModes.length > 0) {
    mode = netModes[netModes.length - 1];
    if (customNets.length > 0) {
      sink.note("warn", "A network mode such as host or none cannot be combined with named networks in Compose. Only network_mode was kept.");
      customNets.length = 0;
    }
    if (netModes.length > 1 && new Set(netModes).size > 1) {
      sink.note("warn", `More than one network mode was given. The last one, ${mode}, was kept.`);
    }
  }
  if (extras) {
    if (mode !== null) {
      ctx.unconverted.push({
        flag: "--network-alias, --ip, --ip6, --link-local-ip",
        reason: `These need a user-defined network, and this container uses network_mode ${mode}.`,
      });
    } else {
      let target = customNets[0];
      if (!target) {
        if (ipv4 !== undefined || ipv6 !== undefined || linkLocal.length > 0) {
          ctx.unconverted.push({
            flag: "--ip, --ip6, --link-local-ip",
            reason: "A fixed address needs a user-defined network, and this command uses the default one.",
          });
        }
        if (pendingAliases.length > 0) {
          target = { name: "default", aliases: [], linkLocal: [] };
          customNets.push(target);
        }
      }
      if (target) {
        target.aliases.push(...pendingAliases);
        if (target.name !== "default") {
          target.ipv4 ??= ipv4;
          target.ipv6 ??= ipv6;
          target.linkLocal.push(...linkLocal);
        }
        if (customNets.length > 1) {
          sink.note("warn", `The aliases and addresses were attached to the first network, ${target.name}. Check that is the one you meant.`);
        }
      }
    }
  }
  const usedNetworks: string[] = [];
  if (mode !== null) {
    fields.set("network_mode", mode);
  } else if (customNets.length > 0) {
    const plain = customNets.every((n) => n.aliases.length === 0 && !n.ipv4 && !n.ipv6 && n.linkLocal.length === 0);
    if (plain) {
      fields.set("networks", customNets.map((n) => n.name));
    } else {
      const m = new Map<string, Y>();
      for (const n of customNets) {
        const detail = new Map<string, Y>();
        if (n.aliases.length > 0) detail.set("aliases", n.aliases);
        if (n.ipv4) detail.set("ipv4_address", n.ipv4);
        if (n.ipv6) detail.set("ipv6_address", n.ipv6);
        if (n.linkLocal.length > 0) detail.set("link_local_ips", n.linkLocal);
        m.set(n.name, detail);
      }
      fields.set("networks", m);
    }
    for (const n of customNets) if (n.name !== "default") usedNetworks.push(n.name);
  }

  /* lists */
  for (const [key, items] of lists) fields.set(key, items);

  /* ---- image and command ---- */

  fields.set("image", parsed.image);
  if (parsed.command.length > 0) fields.set("command", { flow: parsed.command.map((c) => c.v) });

  /* ---- review notes ---- */

  if (detached) {
    sink.note("info", "-d has no Compose key. Start the stack in the background with docker compose up -d.");
  }
  if (autoRemove && restart !== null && restart !== "no") {
    sink.note("warn", "--rm and --restart conflict. docker run refuses the pair. The restart policy was kept and --rm was reported as not converted.");
  }
  if (privileged) {
    sink.note("warn", "--privileged gives the container nearly every capability and access to host devices. Prefer --cap-add for the specific capabilities and --device for the specific devices.");
  }
  if (dockerSocket) {
    sink.note("warn", "Mounting the Docker socket lets the container control the Docker daemon, which is root on the host. Treat the container as root on the machine.");
  }
  if (hostNetwork) {
    sink.note("warn", "Host networking removes the network isolation between the container and the host.");
    if (lists.has("ports")) {
      sink.note("info", "Published ports are ignored when the container uses host networking.");
    }
  }
  if (hostPid) {
    sink.note("warn", "--pid host lets the container see and signal every process on the host.");
  }
  const tag = imageTag(parsed.image);
  if (!hasVariable(parsed.image) && (tag === null || tag === "latest")) {
    sink.note(
      "info",
      tag === null
        ? `${parsed.image} has no tag, so Docker uses latest. Pin a version so a pull next month gives the same image.`
        : `${parsed.image} uses the latest tag, which moves. Pin a version so a pull next month gives the same image.`,
    );
  }

  const name = serviceName && serviceName !== "" ? sanitizeName(serviceName) : containerName !== null ? sanitizeName(containerName) : deriveServiceName(parsed.image);

  const body = new Map<string, Y>();
  for (const key of KEY_ORDER) {
    const v = fields.get(key);
    if (v !== undefined) body.set(key, v);
  }
  return { name, body, namedVolumes, networks: usedNetworks };
}

/** A docker run --mount value as a Compose long-syntax volume entry. */
function convertMount(
  value: string,
  shown: string,
  ctx: Context,
): { item: Y; named: string | null; dockerSocket: boolean } | null {
  const fieldsRaw = csvFields(value);
  if (!fieldsRaw) {
    ctx.sink.note("warn", `${shown} has an unterminated double quote, so it was ignored.`);
    return null;
  }
  const kv = new Map<string, string | true>();
  for (const f of fieldsRaw) {
    if (f === "") continue;
    const [k, v] = splitKv(f);
    kv.set(k.trim().toLowerCase(), v === null ? true : v);
  }
  const pull = (...names: string[]): string | true | undefined => {
    for (const n of names) {
      const v = kv.get(n);
      if (v !== undefined) {
        kv.delete(n);
        return v;
      }
    }
    return undefined;
  };
  const text = (v: string | true | undefined): string | undefined => (typeof v === "string" ? v : undefined);

  const type = text(pull("type")) ?? "volume";
  const source = text(pull("source", "src"));
  const target = text(pull("destination", "dst", "target"));
  const ro = pull("readonly", "ro");
  const consistency = text(pull("consistency"));
  const propagation = text(pull("bind-propagation"));
  const nonrecursive = pull("bind-nonrecursive");
  const recursive = text(pull("bind-recursive"));
  const nocopy = pull("volume-nocopy");
  const subpath = text(pull("volume-subpath"));
  const tmpfsSize = text(pull("tmpfs-size"));

  if (target === undefined || target === "") {
    ctx.sink.note("warn", `${shown} has no target. docker run refuses that, so it was ignored.`);
    return null;
  }
  if (!["volume", "bind", "tmpfs", "npipe", "image", "cluster"].includes(type)) {
    ctx.sink.note("warn", `${shown}: ${type} is not a mount type docker run knows. It was ignored.`);
    return null;
  }

  const bool = (v: string | true | undefined): boolean | null => {
    if (v === undefined) return null;
    if (v === true) return true;
    return parseBool(v);
  };

  const item = new Map<string, Y>();
  item.set("type", type);
  let named: string | null = null;
  let src = source;
  if (src !== undefined && type === "bind") src = relativeSource(src);
  if (src !== undefined) item.set("source", src);
  if (type === "volume" && src !== undefined && NAMED_VOLUME.test(src)) named = src;
  item.set("target", target);
  if (bool(ro) === true) item.set("read_only", true);
  if (consistency !== undefined) item.set("consistency", consistency);

  const bind = new Map<string, Y>();
  if (propagation !== undefined) bind.set("propagation", propagation);
  if (recursive !== undefined) bind.set("recursive", recursive);
  else if (bool(nonrecursive) === true) bind.set("recursive", "disabled");
  if (bind.size > 0) item.set("bind", bind);

  const volume = new Map<string, Y>();
  if (bool(nocopy) === true) volume.set("nocopy", true);
  if (subpath !== undefined) volume.set("subpath", subpath);
  if (volume.size > 0) item.set("volume", volume);

  if (tmpfsSize !== undefined) item.set("tmpfs", new Map<string, Y>([["size", tmpfsSize]]));

  for (const [k] of kv) {
    const reason =
      k === "tmpfs-mode"
        ? "Compose takes a tmpfs mode as an octal number. Set it under tmpfs.mode by hand."
        : "This mount field has no equivalent in the Compose long volume syntax that this converter writes.";
    ctx.unconverted.push({ flag: `${shown} (${k})`, reason });
  }

  return { item, named, dockerSocket: src === "/var/run/docker.sock" || src === "/run/docker.sock" };
}

/** A docker run --network value: a bare name or mode, or name=...,alias=...,ip=... */
function parseNetwork(
  value: string,
  shown: string,
  ctx: Context,
): { mode?: string; attach?: NetAttach } {
  if (value === "") {
    ctx.sink.note("warn", `${shown} is empty, so it was ignored.`);
    return {};
  }
  if (!value.includes("=")) {
    if (value === "default") return { mode: "bridge" };
    if (/^(?:host|none|bridge)$/.test(value) || /^(?:container|service|ns):/.test(value)) return { mode: value };
    return { attach: { name: value, aliases: [], linkLocal: [] } };
  }
  const fields = csvFields(value) ?? value.split(",");
  const attach: NetAttach = { name: "", aliases: [], linkLocal: [] };
  for (const f of fields) {
    const [k, v] = splitKv(f);
    const key = k.trim().toLowerCase();
    if (v === null) continue;
    if (key === "name" || key === "src") attach.name = v;
    else if (key === "alias") attach.aliases.push(v);
    else if (key === "ip") attach.ipv4 = v;
    else if (key === "ip6") attach.ipv6 = v;
    else if (key === "link-local-ip") attach.linkLocal.push(v);
    else ctx.unconverted.push({ flag: `${shown} (${key})`, reason: "This network attachment option has no equivalent that this converter writes." });
  }
  if (attach.name === "") {
    ctx.sink.note("warn", `${shown} has no name= field, so it was ignored.`);
    return {};
  }
  if (/^(?:host|none|bridge)$/.test(attach.name) && attach.aliases.length === 0 && !attach.ipv4 && !attach.ipv6) {
    return { mode: attach.name };
  }
  return { attach };
}

/* ======================================================= command split */

interface Command {
  words: Word[];
  start: number;
  end: number;
}

const SEPARATORS = new Set(["\n", ";", "&", "&&", "||", "|", "|&", "(", ")", ";;"]);

function splitCommands(tokens: Token[]): Command[] {
  const commands: Command[] = [];
  let words: Word[] = [];
  let skipNext = false;
  const flush = () => {
    if (words.length > 0) {
      commands.push({ words, start: words[0].start, end: words[words.length - 1].end });
      words = [];
    }
  };
  for (const t of tokens) {
    if (t.kind === "word") {
      if (skipNext) skipNext = false;
      else words.push(t.word);
    } else if (SEPARATORS.has(t.op)) {
      flush();
      skipNext = false;
    } else {
      // A redirection: its target is not an argument.
      skipNext = true;
    }
  }
  flush();
  return commands;
}

type Classified =
  | { kind: "run"; rest: number; create: boolean }
  | { kind: "network-create"; rest: number }
  | { kind: "volume-create"; rest: number }
  | { kind: "other" };

function classify(words: string[]): Classified {
  let i = 0;
  if (words[i] === "$") i++;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  if (words[i] === "sudo") {
    i++;
    while (i < words.length && words[i].startsWith("-")) i += SUDO_VALUE.has(words[i]) ? 2 : 1;
  }
  const bin = words[i]?.split("/").pop();
  if (bin !== "docker" && bin !== "podman") return { kind: "other" };
  i++;
  while (i < words.length && words[i].startsWith("-")) i += GLOBAL_VALUE.has(words[i]) ? 2 : 1;
  let sub = words[i];
  if (sub === "container") {
    i++;
    sub = words[i];
    if (sub === "run") return { kind: "run", rest: i + 1, create: false };
    if (sub === "create") return { kind: "run", rest: i + 1, create: true };
    return { kind: "other" };
  }
  if (sub === "run") return { kind: "run", rest: i + 1, create: false };
  if (sub === "create") return { kind: "run", rest: i + 1, create: true };
  if (sub === "network" && words[i + 1] === "create") return { kind: "network-create", rest: i + 2 };
  if (sub === "volume" && words[i + 1] === "create") return { kind: "volume-create", rest: i + 2 };
  return { kind: "other" };
}

const NET_CREATE_VALUE = new Set([
  "-d",
  "--driver",
  "--subnet",
  "--gateway",
  "--ip-range",
  "-o",
  "--opt",
  "--label",
  "--aux-address",
  "--ipam-driver",
  "--ipam-opt",
  "--scope",
  "--config-from",
]);
const VOL_CREATE_VALUE = new Set(["-d", "--driver", "--label", "-o", "--opt"]);

/** The name and the option words of `docker network create` or `docker volume create`. */
function createTarget(words: string[], valueFlags: Set<string>): { name: string | null; options: string[] } {
  const options: string[] = [];
  let name: string | null = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.startsWith("-") && w.length > 1) {
      options.push(w);
      if (valueFlags.has(w)) i++;
    } else name = w;
  }
  return { name, options };
}

/* ============================================================= convert */

const TYPOGRAPHIC = /[\u2018\u2019\u201c\u201d\u00a0\u2013\u2212\u200b\u200c\u200d\ufeff]/;

function clip(s: string, max = 70): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 3)}...` : one;
}

/**
 * Convert every `docker run` command in the text into one Compose file.
 * Commands that are not docker run are skipped and listed. `docker network
 * create` and `docker volume create` with no options declare the network or
 * volume so Compose creates it.
 */
export function convertDockerRun(input: string, options: ConvertOptions = {}): ConvertResult {
  if (input.length > MAX_INPUT) {
    return {
      ok: false,
      error: `That is ${input.length.toLocaleString("en-US")} characters. The limit is ${MAX_INPUT.toLocaleString("en-US")}, so paste fewer commands at once.`,
    };
  }
  if (input.trim() === "") return { ok: false, error: "Paste a docker run command." };

  const tokenized = tokenize(input);
  if (!tokenized.ok) return { ok: false, error: tokenized.error };

  const notes: Note[] = [];
  const seen = new Set<string>();
  const sink: Sink = {
    note(level, text) {
      if (seen.has(text)) return;
      seen.add(text);
      notes.push({ level, text });
    },
  };
  for (const w of tokenized.warnings) sink.note("warn", w);
  if (TYPOGRAPHIC.test(input)) {
    sink.note(
      "warn",
      "The text contains typographic quotes, dashes or non-breaking spaces, which usually arrive when a command is copied from a web page or a document. A shell treats them as ordinary characters, so docker would receive them. Retype them as plain ASCII.",
    );
  }

  const commands = splitCommands(tokenized.tokens);
  const unconverted: Unconverted[] = [];
  const mappings: Mapping[] = [];
  const built: Built[] = [];
  const createdNetworks = new Set<string>();
  const createdVolumes = new Set<string>();
  const errors: string[] = [];
  const ctx: Context = { sink, unconverted, mappings };

  const classified = commands.map((cmd) => {
    const raws = cmd.words.map(wordText);
    return { cmd, raws, cls: classify(raws) };
  });
  const runCount = classified.filter((c) => c.cls.kind === "run").length;

  for (const { cmd, raws, cls } of classified) {
    if (cls.kind === "other") {
      sink.note("info", `Skipped, not a docker run command: ${clip(input.slice(cmd.start, cmd.end))}`);
      continue;
    }
    if (cls.kind === "network-create" || cls.kind === "volume-create") {
      const target = createTarget(raws.slice(cls.rest), cls.kind === "network-create" ? NET_CREATE_VALUE : VOL_CREATE_VALUE);
      const what = cls.kind === "network-create" ? "network" : "volume";
      if (target.name === null) {
        sink.note("info", `Skipped, ${what} create with no name: ${clip(input.slice(cmd.start, cmd.end))}`);
        continue;
      }
      (cls.kind === "network-create" ? createdNetworks : createdVolumes).add(target.name);
      if (target.options.length > 0) {
        sink.note(
          "info",
          `The ${what} ${target.name} is declared so Compose creates it, but the options ${target.options.join(" ")} were not carried over. Add them under the ${what} entry by hand.`,
        );
      }
      continue;
    }
    if (cls.create) {
      sink.note("info", "docker create has the same options as docker run but does not start the container. Compose creates and starts the service.");
    }
    const args: Arg[] = cmd.words.slice(cls.rest).map((w, k) => ({ v: composeWord(w, sink), raw: raws[cls.rest + k] }));
    const parsed = parseRunArgs(args);
    if (!parsed.ok) {
      errors.push(parsed.error);
      continue;
    }
    built.push(convertRun(parsed, ctx, runCount === 1 ? options.serviceName : undefined));
  }

  if (built.length === 0) {
    if (errors.length > 0) return { ok: false, error: errors[0] };
    return {
      ok: false,
      error: "No docker run command was found. Start the command with docker run, then the options, then the image.",
    };
  }
  for (const e of errors) sink.note("warn", `A docker run command was skipped: ${e}`);

  // Service names are map keys, so make them unique.
  const used = new Set<string>();
  for (const b of built) {
    let name = b.name;
    for (let n = 2; used.has(name); n++) name = `${b.name}-${n}`;
    used.add(name);
    b.name = name;
  }

  const services = new Map<string, Y>();
  const volumeNames: string[] = [];
  const networkNames: string[] = [];
  for (const b of built) {
    services.set(b.name, b.body);
    for (const v of b.namedVolumes) if (!volumeNames.includes(v)) volumeNames.push(v);
    for (const n of b.networks) if (!networkNames.includes(n)) networkNames.push(n);
  }

  const doc = new Map<string, Y>();
  doc.set("services", services);

  if (networkNames.length > 0) {
    const m = new Map<string, Y>();
    const external: string[] = [];
    for (const n of networkNames) {
      if (createdNetworks.has(n)) m.set(n, new Map<string, Y>());
      else {
        m.set(n, new Map<string, Y>([["external", true]]));
        external.push(n);
      }
    }
    doc.set("networks", m);
    if (external.length > 0) {
      sink.note(
        "info",
        `${external.join(", ")} ${external.length === 1 ? "is" : "are"} declared external: true, because docker run never creates a network. Create ${external.length === 1 ? "it" : "them"} first with docker network create, or delete the external line to let Compose create ${external.length === 1 ? "it" : "them"}.`,
      );
    }
  }

  if (volumeNames.length > 0) {
    const m = new Map<string, Y>();
    const reuse = options.externalVolumes === true;
    for (const v of volumeNames) {
      m.set(v, reuse ? new Map<string, Y>([["external", true]]) : new Map<string, Y>());
    }
    doc.set("volumes", m);
    sink.note(
      "info",
      reuse
        ? `${volumeNames.join(", ")} ${volumeNames.length === 1 ? "is" : "are"} declared external: true, so ${volumeNames.length === 1 ? "it" : "they"} must already exist. Create with docker volume create if not.`
        : "Compose prefixes the volumes it creates with the project name, usually the directory name. A volume that docker run created earlier is therefore not reused. Tick the existing volumes option to attach to it by its exact name.",
    );
  }

  const yaml = toYaml(doc);
  const refs = [...yaml.split("$$").join("").matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
  if (refs.some((r) => r !== "PWD")) {
    sink.note(
      "info",
      "Compose fills ${VAR} from the shell environment or from a .env file next to the Compose file, the same variables the shell would have used.",
    );
  }
  if (refs.includes("PWD")) {
    sink.note(
      "info",
      "${PWD} is the directory you run docker compose from, which is not always the directory that holds the Compose file. Use a path starting with ./ to follow the file instead.",
    );
  }

  const ordered = [...notes.filter((n) => n.level === "warn"), ...notes.filter((n) => n.level === "info")];
  return {
    ok: true,
    yaml,
    services: built.map((b) => b.name),
    notes: ordered,
    unconverted,
    mappings,
  };
}
