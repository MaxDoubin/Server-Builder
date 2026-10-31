/**
 * Shell quoting in both directions.
 *
 * Forward: quote one string so that it reaches a program as exactly one
 * argument, for a POSIX shell, for bash's $'...' form, for PowerShell, and
 * for a Windows program launched through cmd.exe.
 *
 * Reverse: split a command line the way a POSIX shell does before it runs
 * anything, following XCU 2.3 (token recognition), 2.2 (quoting) and 2.6.7
 * (quote removal). Expansions are recognized and marked but never performed,
 * because performing them would need the reader's environment and file
 * system. Where bash goes beyond POSIX ($'...', brace expansion, process
 * substitution, &> and friends) the result says so.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/** Longest input either direction processes, in UTF-16 code units. */
export const MAX_INPUT = 20000;

/** Most words the splitter returns before it stops. */
export const MAX_WORDS = 2000;

/* ================================================================ forward */

/**
 * Characters that never need quoting in a POSIX shell argument. This is the
 * set Python's shlex.quote uses, ASCII only. A word that starts with = is
 * still quoted, because zsh expands =name to a command path.
 */
const POSIX_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** True when the string would change meaning, or split, if written bare. */
export function needsPosixQuoting(s: string): boolean {
  return s === "" || !POSIX_SAFE.test(s) || s.startsWith("=");
}

/**
 * POSIX single quotes. Inside '...' every character is literal (XCU 2.2.2),
 * including newlines, so the only character that needs handling is the
 * single quote itself: close the quote, emit an escaped quote, reopen.
 */
export function quotePosix(s: string, onlyWhenNeeded = false): string {
  if (onlyWhenNeeded && !needsPosixQuoting(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Code points that render as nothing, or reorder the text around them. */
export function isInvisible(cp: number): boolean {
  return (
    (cp >= 0x80 && cp <= 0x9f) || // C1 controls
    cp === 0xad || // soft hyphen
    cp === 0x061c || // Arabic letter mark
    cp === 0x180e || // Mongolian vowel separator
    (cp >= 0x200b && cp <= 0x200f) || // zero-width space, joiners, LRM, RLM
    (cp >= 0x2028 && cp <= 0x202e) || // line and paragraph separators, bidi embeddings
    (cp >= 0x2060 && cp <= 0x2064) || // word joiner, invisible operators
    (cp >= 0x2066 && cp <= 0x2069) || // bidi isolates
    cp === 0xfeff // byte order mark, zero-width no-break space
  );
}

function isControl(cp: number): boolean {
  return cp < 0x20 || cp === 0x7f;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

/** UTF-8 bytes of one code point. */
function utf8(cp: number): number[] {
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
}

const ANSI_NAMED: Record<number, string> = {
  0x07: "\\a",
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0b: "\\v",
  0x0c: "\\f",
  0x0d: "\\r",
  0x1b: "\\E",
};

/**
 * bash ANSI-C quoting, $'...'. Backslash and single quote are escaped,
 * control characters use their C names or \xHH, and invisible or
 * reordering characters are written as their UTF-8 bytes in \xHH form, which
 * gives the same bytes in every locale (\u would depend on the locale).
 * \xHH always uses two digits, because bash reads at most two, so a hex
 * letter that follows cannot be swallowed into the escape.
 */
export function quoteAnsiC(s: string): string {
  let out = "$'";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "\\") out += "\\\\";
    else if (ch === "'") out += "\\'";
    else if (ANSI_NAMED[cp]) out += ANSI_NAMED[cp];
    else if (isControl(cp)) out += `\\x${hex2(cp)}`;
    else if (isInvisible(cp) || (cp >= 0xd800 && cp <= 0xdfff)) {
      // A lone surrogate cannot be encoded; U+FFFD is what TextEncoder sends.
      const bytes = cp >= 0xd800 && cp <= 0xdfff ? utf8(0xfffd) : utf8(cp);
      out += bytes.map((b) => `\\x${hex2(b)}`).join("");
    } else out += ch;
  }
  return `${out}'`;
}

/** Characters PowerShell's tokenizer treats as a single quote. */
const PS_SINGLE = /['\u2018\u2019\u201a\u201b]/g;
/** Characters PowerShell's tokenizer treats as a double quote. */
const PS_DOUBLE = new Set(['"', "\u201c", "\u201d", "\u201e"]);

/**
 * PowerShell verbatim string. Inside '...' nothing expands; a single quote
 * is written by doubling it. PowerShell also accepts the typographic quotes
 * U+2018 to U+201B as single quotes, so those are doubled too, or a pasted
 * curly apostrophe would end the string early.
 */
export function quotePowerShell(s: string): string {
  return `'${s.replace(PS_SINGLE, "$&$&")}'`;
}

const PS_NAMED: Record<number, string> = {
  0x00: "`0",
  0x07: "`a",
  0x08: "`b",
  0x09: "`t",
  0x0a: "`n",
  0x0b: "`v",
  0x0c: "`f",
  0x0d: "`r",
  0x1b: "`e",
};

/**
 * PowerShell expandable string with backtick escapes, for strings that hold
 * control characters. `e and `u{...} need PowerShell 6 or later.
 */
export function quotePowerShellEscaped(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "`") out += "``";
    else if (ch === "$") out += "`$";
    else if (PS_DOUBLE.has(ch)) out += `\`${ch}`;
    else if (PS_NAMED[cp]) out += PS_NAMED[cp];
    else if (isControl(cp) || isInvisible(cp)) out += `\`u{${cp.toString(16).toUpperCase()}}`;
    else out += ch;
  }
  return `${out}"`;
}

/**
 * One argument for a Windows program that splits its command line with the
 * Microsoft C runtime rules (also CommandLineToArgvW). Backslashes are
 * literal except before a double quote, where 2n backslashes give n and
 * start or end a quoted region, and 2n+1 give n plus a literal quote. So
 * each run of backslashes before a quote, or before the closing quote, is
 * doubled. Reference: Microsoft, "Parsing C++ command-line arguments".
 */
export function quoteMsvc(s: string): string {
  if (s !== "" && !/[ \t\n\v"]/.test(s)) return s;
  let out = '"';
  let i = 0;
  while (true) {
    let slashes = 0;
    while (i < s.length && s[i] === "\\") {
      slashes++;
      i++;
    }
    if (i === s.length) {
      out += "\\".repeat(slashes * 2);
      break;
    }
    if (s[i] === '"') out += `${"\\".repeat(slashes * 2 + 1)}"`;
    else out += "\\".repeat(slashes) + s[i];
    i++;
  }
  return `${out}"`;
}

/** Characters cmd.exe acts on before the program ever sees its command line. */
const CMD_META = /[()%!^"<>&|]/g;

/**
 * cmd.exe has no quoting that works for every string. What does work for
 * an external program is to caret-escape every cmd metacharacter, double
 * quotes included, so cmd never enters its own quoted state and hands the
 * C runtime quoting through unchanged. At a prompt an undefined %name% is
 * left alone, so ^% survives; in a batch file the percent sign has to be
 * doubled instead. With delayed expansion on, ! needs more than this.
 */
export function escapeForCmd(msvcQuoted: string, where: "prompt" | "batch"): string {
  return msvcQuoted.replace(CMD_META, (c) => (where === "batch" && c === "%" ? "%%" : `^${c}`));
}

export interface QuoteIssue {
  level: "info" | "warn" | "danger";
  text: string;
}

export interface QuoteReport {
  posix: string;
  posixMinimal: string;
  needsQuoting: boolean;
  ansiC: string;
  powershell: string;
  /** Present only when the input holds control or invisible characters. */
  powershellEscaped: string | null;
  msvc: string;
  /** Null when cmd cannot carry the string at all (newline, CR, NUL). */
  cmdPrompt: string | null;
  cmdBatch: string | null;
  issues: QuoteIssue[];
  controlCount: number;
  invisibleCount: number;
  hasNul: boolean;
}

export function quoteAll(s: string): QuoteReport {
  const issues: QuoteIssue[] = [];
  let controlCount = 0;
  let invisibleCount = 0;
  let loneSurrogate = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isControl(cp)) controlCount++;
    else if (isInvisible(cp)) invisibleCount++;
    else if (cp >= 0xd800 && cp <= 0xdfff) loneSurrogate = true;
  }
  const hasNul = s.includes("\u0000");
  const cmdImpossible = /[\r\n\u0000]/.test(s);

  if (hasNul) {
    issues.push({
      level: "danger",
      text: "The string contains a NUL byte. An argument is a C string, so no quoting in any shell can pass it: execve stops each argument at the first NUL, and bash drops everything after \\0 in $'...'.",
    });
  }
  if (s.startsWith("-")) {
    issues.push({
      level: "danger",
      text: "It starts with a dash. Quoting does not help here: the program still sees an option. Put -- before it (rm -- '-rf') or prefix a path with ./ so it cannot be read as a flag.",
    });
  }
  if (controlCount > 0) {
    issues.push({
      level: "warn",
      text: `${controlCount} control ${controlCount === 1 ? "character" : "characters"}. Single quotes pass them through, but they are invisible on screen and a terminal may act on escape sequences when the command is displayed. The $'...' form spells them out.`,
    });
  }
  if (invisibleCount > 0) {
    issues.push({
      level: "warn",
      text: `${invisibleCount} invisible or bidirectional ${invisibleCount === 1 ? "character" : "characters"} (zero-width, joiner or direction override). These make the text on screen differ from the bytes that run. The $'...' form writes them as escapes.`,
    });
  }
  if (loneSurrogate) {
    issues.push({
      level: "warn",
      text: "The string holds an unpaired UTF-16 surrogate, which has no UTF-8 encoding. A browser sends U+FFFD in its place.",
    });
  }
  if (cmdImpossible) {
    issues.push({
      level: "info",
      text: "cmd.exe cannot carry a newline, carriage return or NUL inside an argument: a line break ends the command. Only the C runtime form is shown for a program started directly with CreateProcess.",
    });
  }
  if (/^~/.test(s)) {
    issues.push({
      level: "info",
      text: "Quoted, a leading ~ stays a literal tilde. Bare, the shell would replace it with a home directory.",
    });
  }

  const msvc = quoteMsvc(s);
  return {
    posix: quotePosix(s),
    posixMinimal: quotePosix(s, true),
    needsQuoting: needsPosixQuoting(s),
    ansiC: quoteAnsiC(s),
    powershell: quotePowerShell(s),
    powershellEscaped: controlCount + invisibleCount > 0 ? quotePowerShellEscaped(s) : null,
    msvc,
    cmdPrompt: cmdImpossible ? null : escapeForCmd(msvc, "prompt"),
    cmdBatch: cmdImpossible ? null : escapeForCmd(msvc, "batch"),
    issues,
    controlCount,
    invisibleCount,
    hasNul,
  };
}

/**
 * Reads C-style escapes typed into the input box, so control characters can
 * be entered: \n \t \r \0 \e \\ \xHH and \u{H...}. Anything else after a
 * backslash is kept as typed.
 */
export function decodeTypedEscapes(s: string): { value: string; error: string | null } {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\" || i + 1 >= s.length) {
      out += c;
      continue;
    }
    const n = s[i + 1];
    const simple: Record<string, string> = {
      n: "\n",
      t: "\t",
      r: "\r",
      "0": "\u0000",
      e: "\u001b",
      a: "\u0007",
      b: "\b",
      f: "\f",
      v: "\v",
      "\\": "\\",
    };
    if (n in simple) {
      out += simple[n];
      i++;
    } else if (n === "x") {
      const m = /^[0-9a-fA-F]{2}/.exec(s.slice(i + 2));
      if (!m) return { value: out, error: `\\x at character ${i + 1} needs exactly two hex digits, as in \\x1b.` };
      out += String.fromCharCode(parseInt(m[0], 16));
      i += 3;
    } else if (n === "u" && s[i + 2] === "{") {
      const close = s.indexOf("}", i + 3);
      const body = close < 0 ? "" : s.slice(i + 3, close);
      if (!/^[0-9a-fA-F]{1,6}$/.test(body)) {
        return { value: out, error: `\\u{...} at character ${i + 1} needs 1 to 6 hex digits inside the braces, as in \\u{200b}.` };
      }
      const cp = parseInt(body, 16);
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        return { value: out, error: `U+${body.toUpperCase()} is not a Unicode scalar value.` };
      }
      out += String.fromCodePoint(cp);
      i = close;
    } else {
      out += c;
    }
  }
  return { value: out, error: null };
}

/* ========================================================= visible text */

export interface VisiblePart {
  text: string;
  /** True for a stand-in such as \n, shown in a different color. */
  escape: boolean;
}

/** Makes control, invisible and space characters visible, for display only. */
export function visibleParts(s: string, showSpaces = true): VisiblePart[] {
  const parts: VisiblePart[] = [];
  const push = (text: string, escape: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.escape === escape && !escape) last.text += text;
    else parts.push({ text, escape });
  };
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === " " && showSpaces) push("\u00b7", true);
    else if (ANSI_NAMED[cp]) push(ANSI_NAMED[cp], true);
    else if (cp === 0) push("\\0", true);
    else if (isControl(cp)) push(`\\x${hex2(cp)}`, true);
    else if (isInvisible(cp)) push(`<U+${cp.toString(16).toUpperCase().padStart(4, "0")}>`, true);
    else push(ch, false);
  }
  return parts;
}

/* ================================================================ reverse */

export type SegmentKind =
  | "literal" // unquoted ordinary characters
  | "single" // '...'
  | "double" // literal text inside "..."
  | "ansi" // $'...' (bash, POSIX.1-2024)
  | "locale" // $"..." (bash)
  | "escape" // backslash outside quotes
  | "param" // $name, ${...}
  | "command" // $(...) or `...`
  | "arith" // $((...))
  | "procsub" // <(...) or >(...) (bash)
  | "glob" // unquoted * ? [...]
  | "tilde" // unquoted leading ~ or ~user
  | "brace"; // unquoted {a,b} or {1..3} (bash)

export interface Segment {
  kind: SegmentKind;
  /** Source text of this piece, quotes included. */
  source: string;
  /** Text after quote removal. For expansions, the expansion as written. */
  value: string;
  /** For expansions: inside double quotes, so no field splitting or globbing. */
  quoted?: boolean;
}

export interface Word {
  start: number;
  end: number;
  source: string;
  segments: Segment[];
  /** Quote-removed value with expansions left as written. */
  value: string;
  quoted: boolean;
  expansions: Segment[];
  /** An unquoted $..., $(...) or `...`, whose result is split on IFS and globbed. */
  splits: boolean;
  glob: boolean;
  tilde: boolean;
  brace: boolean;
  procsub: boolean;
  /** "$@" or "${name[@]}", which becomes one argument per element. */
  atExpansion: boolean;
  /** Bytes from $'\x..' escapes that are not valid UTF-8. */
  invalidUtf8: boolean;
  /** $'...' held \0, so bash dropped the rest of that quoted string. */
  truncatedAtNul: boolean;
}

export interface Redirect {
  fd: string | null;
  op: string;
  target: Word | null;
  heredoc?: { body: string; expands: boolean; terminated: boolean };
}

export type ItemRole = "keyword" | "assign" | "arg" | "redirect";

export interface CommandItem {
  role: ItemRole;
  word?: Word;
  redirect?: Redirect;
  /** argv index, for role "arg". */
  index?: number;
}

export interface ParsedCommand {
  items: CommandItem[];
  argv: Word[];
  /** The operator or newline that ended this command, or null at the end. */
  terminator: string | null;
  /** "header" for for/case/select/function lines whose words are not argv. */
  kind: "simple" | "header" | "conditional";
}

export interface SplitOk {
  ok: true;
  commands: ParsedCommand[];
  warnings: string[];
  comments: string[];
  truncated: boolean;
  /** True when anything was left for the shell to expand at run time. */
  dynamic: boolean;
}

export interface SplitError {
  ok: false;
  message: string;
  /** Zero-based index into the input (CRLF read as LF) where the problem starts. */
  position: number;
  /** One-based line and column of that position, and the text of the line. */
  line?: number;
  column?: number;
  lineText?: string;
}

export type SplitResult = SplitOk | SplitError;

/** Longest first, so >> is not read as two >. */
const OPERATORS = [
  ";;&",
  "<<<",
  "<<-",
  "&>>",
  "<<",
  ">>",
  "<&",
  ">&",
  "<>",
  ">|",
  "&&",
  "||",
  ";;",
  ";&",
  "|&",
  "&>",
  "<",
  ">",
  "|",
  "&",
  ";",
  "(",
  ")",
];

const REDIRECT_OPS = new Set(["<", ">", ">>", "<&", ">&", "<>", ">|", "<<", "<<-", "<<<", "&>", "&>>"]);
const BASH_ONLY_OPS = new Set(["<<<", "&>", "&>>", "|&", ";;&", ";&"]);
const OP_START = new Set(["|", "&", ";", "<", ">", "(", ")"]);

/** Reserved words that come before a command, peeled off so argv[0] is right. */
const LEADING_KEYWORDS = new Set(["!", "{", "if", "then", "else", "elif", "do", "while", "until", "time"]);
const CLOSING_KEYWORDS = new Set(["fi", "done", "esac", "}"]);
const HEADER_KEYWORDS = new Set(["for", "case", "select", "function"]);

function isBlank(c: string): boolean {
  return c === " " || c === "\t";
}

/* ---- scanners for nested constructs. Each returns the index of the
   closing character, or -1 when the input ends first. */

function skipSingle(src: string, i: number): number {
  return src.indexOf("'", i);
}

/** i is just past the opening backquote. A backslash escapes the next character. */
function skipBacktick(src: string, i: number): number {
  for (; i < src.length; i++) {
    if (src[i] === "\\") i++;
    else if (src[i] === "`") return i;
  }
  return -1;
}

/** i is just past the opening double quote. */
function skipDouble(src: string, i: number): number {
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") i++;
    else if (c === '"') return i;
    else if (c === "`") {
      const j = skipBacktick(src, i + 1);
      if (j < 0) return -1;
      i = j;
    } else if (c === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      const j = findClose(src, i + 2, src[i + 1] === "(" ? ")" : "}", true);
      if (j < 0) return -1;
      i = j;
    }
  }
  return -1;
}

/**
 * Finds the ) or } that closes a $( or ${ whose body starts at i, stepping
 * over quotes and nested substitutions. Inside a double-quoted ${...} a
 * single quote is an ordinary character, which is how bash reads
 * "${x:-it's}". A ) inside an unquoted case pattern within $(...) can still
 * fool this; the shell's own parser is the only complete answer there.
 */
function findClose(src: string, i: number, close: ")" | "}", inDouble = false): number {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "'" && !(close === "}" && inDouble)) {
      const j = skipSingle(src, i + 1);
      if (j < 0) return -1;
      i = j;
      continue;
    }
    if (c === '"') {
      const j = skipDouble(src, i + 1);
      if (j < 0) return -1;
      i = j;
      continue;
    }
    if (c === "`") {
      const j = skipBacktick(src, i + 1);
      if (j < 0) return -1;
      i = j;
      continue;
    }
    if (c === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      const j = findClose(src, i + 2, src[i + 1] === "(" ? ")" : "}", false);
      if (j < 0) return -1;
      i = j;
      continue;
    }
    const open = close === ")" ? "(" : "{";
    if (c === open) depth++;
    else if (c === close) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/**
 * bash's $'...' decoding (ansicstr in bash's strtrans.c): named escapes,
 * \nnn with one to three octal digits, \xHH with one or two hex digits,
 * \u and \U with up to four or eight, \cX for a control character. An
 * unknown escape keeps its backslash. A \0 ends the string, because bash
 * strings are C strings. The result is built as bytes so \xHH can produce
 * bytes that are not UTF-8, which is then reported.
 */
export function decodeAnsiC(body: string): { value: string; invalidUtf8: boolean; truncatedAtNul: boolean } {
  const bytes: number[] = [];
  const pushText = (t: string) => {
    for (const ch of t) bytes.push(...utf8(ch.codePointAt(0) ?? 0xfffd));
  };
  let truncatedAtNul = false;
  let i = 0;
  outer: while (i < body.length) {
    const c = body[i];
    if (c !== "\\" || i + 1 >= body.length) {
      const cp = body.codePointAt(i) ?? 0;
      pushText(String.fromCodePoint(cp));
      i += cp > 0xffff ? 2 : 1;
      continue;
    }
    const n = body[i + 1];
    i += 2;
    switch (n) {
      case "a":
        bytes.push(7);
        break;
      case "b":
        bytes.push(8);
        break;
      case "e":
      case "E":
        bytes.push(27);
        break;
      case "f":
        bytes.push(12);
        break;
      case "n":
        bytes.push(10);
        break;
      case "r":
        bytes.push(13);
        break;
      case "t":
        bytes.push(9);
        break;
      case "v":
        bytes.push(11);
        break;
      case "\\":
      case "'":
      case '"':
      case "?":
        bytes.push(n.charCodeAt(0));
        break;
      case "x": {
        const m = /^[0-9a-fA-F]{1,2}/.exec(body.slice(i));
        if (!m) {
          pushText("\\x");
          break;
        }
        const v = parseInt(m[0], 16);
        i += m[0].length;
        if (v === 0) {
          truncatedAtNul = true;
          break outer;
        }
        bytes.push(v);
        break;
      }
      case "u":
      case "U": {
        const m = (n === "u" ? /^[0-9a-fA-F]{1,4}/ : /^[0-9a-fA-F]{1,8}/).exec(body.slice(i));
        if (!m) {
          pushText(`\\${n}`);
          break;
        }
        const cp = parseInt(m[0], 16);
        i += m[0].length;
        if (cp === 0) {
          truncatedAtNul = true;
          break outer;
        }
        if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) pushText(`\\${n}${m[0]}`);
        else bytes.push(...utf8(cp));
        break;
      }
      case "c": {
        if (i >= body.length) {
          pushText("\\c");
          break;
        }
        const x = body[i];
        i++;
        const v = x === "?" ? 0x7f : x.toUpperCase().charCodeAt(0) & 0x1f;
        if (v === 0) {
          truncatedAtNul = true;
          break outer;
        }
        bytes.push(v);
        break;
      }
      default:
        if (n >= "0" && n <= "7") {
          let v = n.charCodeAt(0) - 48;
          let more = 2;
          while (more > 0 && i < body.length && body[i] >= "0" && body[i] <= "7") {
            v = v * 8 + (body.charCodeAt(i) - 48);
            i++;
            more--;
          }
          v &= 0xff;
          if (v === 0) {
            truncatedAtNul = true;
            break outer;
          }
          bytes.push(v);
        } else {
          pushText(`\\${n}`);
        }
    }
  }
  const arr = Uint8Array.from(bytes);
  let invalidUtf8 = false;
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(arr);
  } catch {
    invalidUtf8 = true;
    value = new TextDecoder("utf-8").decode(arr);
  }
  return { value, invalidUtf8, truncatedAtNul };
}

/** Reads a tilde prefix at i, or returns null if the ~ is literal there. */
function tildeAt(src: string, i: number, assignment: boolean): string | null {
  const m = /^~(?:[+-]|[A-Za-z0-9._][A-Za-z0-9._-]*)?/.exec(src.slice(i));
  if (!m) return null;
  const next = src[i + m[0].length];
  if (next === undefined || next === "/" || next === "\n" || isBlank(next) || OP_START.has(next)) return m[0];
  if (assignment && next === ":") return m[0];
  return null;
}

/** Unquoted [ starts a bracket expression only if a ] closes it within the word. */
function bracketAt(src: string, i: number): string | null {
  let j = i + 1;
  if (src[j] === "!" || src[j] === "^") j++;
  if (src[j] === "]") j++;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === "]") return src.slice(i, j + 1);
    if (isBlank(c) || c === "\n" || OP_START.has(c) || c === "'" || c === '"' || c === "\\" || c === "$" || c === "`") {
      return null;
    }
  }
  return null;
}

/** Unquoted { starts brace expansion if it closes in the word and has a , or a .. sequence. */
function braceAt(src: string, i: number): string | null {
  let depth = 0;
  let comma = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "'") {
      const k = skipSingle(src, j + 1);
      if (k < 0) return null;
      j = k;
      continue;
    }
    if (c === '"') {
      const k = skipDouble(src, j + 1);
      if (k < 0) return null;
      j = k;
      continue;
    }
    if (isBlank(c) || c === "\n" || OP_START.has(c)) return null;
    if (c === "$" && src[j + 1] === "{") {
      const k = findClose(src, j + 2, "}");
      if (k < 0) return null;
      j = k;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const body = src.slice(i + 1, j);
        const seq = /^(?:-?\d+\.\.-?\d+(?:\.\.-?\d+)?|[A-Za-z]\.\.[A-Za-z](?:\.\.-?\d+)?)$/.test(body);
        return comma || seq ? src.slice(i, j + 1) : null;
      }
    } else if (c === "," && depth === 1) comma = true;
  }
  return null;
}

interface RawWord {
  start: number;
  segments: Segment[];
  heredoc?: Redirect["heredoc"];
}

type Token =
  | { type: "word"; word: Word }
  | { type: "op"; op: string; fd: string | null; start: number }
  | { type: "newline"; start: number };

function finishWord(src: string, raw: RawWord, end: number): Word {
  const segments = raw.segments;
  const expansions = segments.filter((s) => s.kind === "param" || s.kind === "command" || s.kind === "arith");
  return {
    start: raw.start,
    end,
    source: src.slice(raw.start, end),
    segments,
    value: segments.map((s) => s.value).join(""),
    quoted: segments.some((s) => ["single", "double", "ansi", "locale", "escape"].includes(s.kind) || s.quoted),
    expansions,
    splits: expansions.some((s) => !s.quoted),
    glob: segments.some((s) => s.kind === "glob"),
    tilde: segments.some((s) => s.kind === "tilde"),
    brace: segments.some((s) => s.kind === "brace"),
    procsub: segments.some((s) => s.kind === "procsub"),
    atExpansion: expansions.some((s) => s.quoted && /^\$(?:@|\{@\}|\{[A-Za-z_][A-Za-z0-9_]*\[@\]\})$/.test(s.value)),
    invalidUtf8: false,
    truncatedAtNul: false,
  };
}

/**
 * Reads a $ expansion at i (src[i] === "$"). Returns the segment and the
 * index just past it, or an error, or null when the $ is a literal.
 */
function dollarAt(
  src: string,
  i: number,
  quoted: boolean,
): { seg: Segment; next: number } | { error: string } | null {
  const n = src[i + 1];
  if (n === "(") {
    const j = findClose(src, i + 2, ")");
    if (j < 0) return { error: `Unterminated $( starting at character ${i + 1}. A command substitution ends at its matching ).` };
    const source = src.slice(i, j + 1);
    const arith = src[i + 2] === "(" && src[j - 1] === ")" && j - 1 > i + 2;
    return { seg: { kind: arith ? "arith" : "command", source, value: source, quoted }, next: j + 1 };
  }
  if (n === "{") {
    const j = findClose(src, i + 2, "}", quoted);
    if (j < 0) return { error: `Unterminated \${ starting at character ${i + 1}. A parameter expansion ends at its matching }.` };
    const source = src.slice(i, j + 1);
    return { seg: { kind: "param", source, value: source, quoted }, next: j + 1 };
  }
  const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i + 1));
  if (name) {
    const source = `$${name[0]}`;
    return { seg: { kind: "param", source, value: source, quoted }, next: i + 1 + name[0].length };
  }
  if (n !== undefined && /[0-9@*#?$!-]/.test(n)) {
    const source = `$${n}`;
    return { seg: { kind: "param", source, value: source, quoted }, next: i + 2 };
  }
  return null;
}

/**
 * Splits a command line into commands and words, per XCU 2.3. Never throws:
 * any problem comes back as { ok: false } with the position it starts at.
 */
export function splitCommandLine(input: string): SplitResult {
  if (input.length > MAX_INPUT) {
    return {
      ok: false,
      message: `The input is ${input.length.toLocaleString("en-US")} characters. This splits at most ${MAX_INPUT.toLocaleString("en-US")}.`,
      position: 0,
    };
  }
  const src = input.replace(/\r\n/g, "\n");
  const result = splitInner(src);
  if (result.ok) return result;
  const pos = Math.max(0, Math.min(result.position, src.length));
  const lineStart = src.lastIndexOf("\n", pos - 1) + 1;
  const nl = src.indexOf("\n", pos);
  return {
    ...result,
    position: pos,
    line: src.slice(0, lineStart).split("\n").length,
    column: pos - lineStart + 1,
    lineText: src.slice(lineStart, nl < 0 ? src.length : nl),
  };
}

function splitInner(src: string): SplitResult {
  const tokens: Token[] = [];
  const warnings = new Set<string>();
  const comments: string[] = [];
  let word: RawWord | null = null;
  let truncated = false;
  let wordCount = 0;
  let heredocDelimNext: { strip: boolean } | null = null;
  const pendingHeredocs: { word: Word; strip: boolean }[] = [];

  const ensure = (pos: number): RawWord => {
    if (!word) word = { start: pos, segments: [] };
    return word;
  };
  const add = (pos: number, seg: Segment) => {
    const w = ensure(pos);
    const last = w.segments[w.segments.length - 1];
    if (last && last.kind === seg.kind && ["literal", "single", "double", "escape"].includes(seg.kind)) {
      last.source += seg.source;
      last.value += seg.value;
    } else w.segments.push(seg);
  };
  /** True while the word so far is NAME= or NAME+=, unquoted, for assignment tilde rules. */
  const assignmentShaped = (): boolean => {
    const w = word as RawWord | null;
    if (!w || w.segments.length === 0 || w.segments[0].kind !== "literal") return false;
    return /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(w.segments[0].value);
  };
  const delimit = (pos: number) => {
    const w = word as RawWord | null;
    if (!w) return;
    const done = finishWord(src, w, pos);
    for (const seg of w.segments) {
      const flags = (seg as Segment & { _flags?: { invalidUtf8: boolean; truncatedAtNul: boolean } })._flags;
      if (flags) {
        done.invalidUtf8 ||= flags.invalidUtf8;
        done.truncatedAtNul ||= flags.truncatedAtNul;
        delete (seg as Segment & { _flags?: unknown })._flags;
      }
    }
    word = null;
    wordCount++;
    if (wordCount > MAX_WORDS) {
      truncated = true;
      return;
    }
    tokens.push({ type: "word", word: done });
    if (heredocDelimNext) {
      pendingHeredocs.push({ word: done, strip: heredocDelimNext.strip });
      heredocDelimNext = null;
    }
  };

  /** Reads here-document bodies that start on the line after i. Returns the new index. */
  const readHeredocs = (i: number): number => {
    let pos = i + 1;
    for (const h of pendingHeredocs) {
      const delim = h.word.value;
      const lines: string[] = [];
      let terminated = false;
      while (pos <= src.length) {
        const nl = src.indexOf("\n", pos);
        const lineEnd = nl < 0 ? src.length : nl;
        let line = src.slice(pos, lineEnd);
        if (h.strip) line = line.replace(/^\t+/, "");
        pos = lineEnd + 1;
        if (line === delim) {
          terminated = true;
          break;
        }
        lines.push(line);
        if (nl < 0) break;
      }
      if (!terminated) warnings.add(`The here-document ended by ${delim} reaches the end of the input without its delimiter line. bash warns and uses what it has.`);
      const heredoc = { body: lines.join("\n"), expands: !h.word.quoted, terminated };
      (h.word as Word & { heredoc?: Redirect["heredoc"] }).heredoc = heredoc;
    }
    pendingHeredocs.length = 0;
    return pos - 1;
  };

  let i = 0;
  while (i < src.length && !truncated) {
    const c = src[i];

    if (c === "\\") {
      const n = src[i + 1];
      if (n === "\n") {
        i += 2; // line continuation: removed entirely, does not delimit
        continue;
      }
      if (n === undefined) {
        add(i, { kind: "literal", source: "\\", value: "\\" });
        warnings.add("The input ends with a backslash. With nothing after it to escape, bash keeps it as a literal backslash.");
        i++;
        continue;
      }
      const cp = src.codePointAt(i + 1) ?? 0;
      const ch = String.fromCodePoint(cp);
      add(i, { kind: "escape", source: `\\${ch}`, value: ch });
      i += 1 + ch.length;
      continue;
    }

    if (c === "'") {
      const j = skipSingle(src, i + 1);
      if (j < 0) {
        return {
          ok: false,
          message: `Unterminated single quote at character ${i + 1}. A single-quoted string ends only at the next ', and a backslash cannot escape a quote inside one.`,
          position: i,
        };
      }
      add(i, { kind: "single", source: src.slice(i, j + 1), value: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }

    if (c === "$" && src[i + 1] === "'") {
      let j = i + 2;
      for (; j < src.length; j++) {
        if (src[j] === "\\") j++;
        else if (src[j] === "'") break;
      }
      if (j >= src.length) {
        return { ok: false, message: `Unterminated $' at character ${i + 1}. It ends at the next ' that is not escaped with a backslash.`, position: i };
      }
      const decoded = decodeAnsiC(src.slice(i + 2, j));
      const seg: Segment & { _flags?: { invalidUtf8: boolean; truncatedAtNul: boolean } } = {
        kind: "ansi",
        source: src.slice(i, j + 1),
        value: decoded.value,
      };
      if (decoded.invalidUtf8 || decoded.truncatedAtNul) {
        seg._flags = { invalidUtf8: decoded.invalidUtf8, truncatedAtNul: decoded.truncatedAtNul };
      }
      add(i, seg);
      i = j + 1;
      continue;
    }

    if (c === '"' || (c === "$" && src[i + 1] === '"')) {
      const locale = c === "$";
      const open = locale ? i + 1 : i;
      const j = skipDouble(src, open + 1);
      if (j < 0) {
        return {
          ok: false,
          message: `Unterminated double quote at character ${open + 1}. Inside double quotes a backslash escapes only $, \`, ", \\ and newline.`,
          position: open,
        };
      }
      ensure(i);
      if (locale) warnings.add('$"..." is bash locale translation. With no message catalog it behaves like "...".');
      // Walk the inside: backslash rules of XCU 2.2.3 and the expansions.
      let k = open + 1;
      let text = "";
      let textSource = locale ? '$"' : '"';
      const flush = () => {
        if (textSource) add(i, { kind: locale ? "locale" : "double", source: textSource, value: text });
        text = "";
        textSource = "";
      };
      while (k < j) {
        const d = src[k];
        if (d === "\\" && k + 1 < j && "$`\"\\\n".includes(src[k + 1])) {
          if (src[k + 1] !== "\n") text += src[k + 1];
          textSource += src.slice(k, k + 2);
          k += 2;
        } else if (d === "\\" && k + 1 < j) {
          text += `\\${src[k + 1]}`;
          textSource += src.slice(k, k + 2);
          k += 2;
        } else if (d === "`") {
          const e = skipBacktick(src, k + 1);
          flush();
          add(i, { kind: "command", source: src.slice(k, e + 1), value: src.slice(k, e + 1), quoted: true });
          k = e + 1;
        } else if (d === "$") {
          const r = dollarAt(src, k, true);
          if (r && "error" in r) return { ok: false, message: r.error, position: k };
          if (r) {
            flush();
            add(i, r.seg);
            k = r.next;
          } else {
            text += "$";
            textSource += "$";
            k++;
          }
        } else {
          text += d;
          textSource += d;
          k++;
        }
      }
      textSource += '"';
      flush();
      // Empty "" still makes an argument, so the word must exist.
      const w = ensure(i);
      if (w.segments.length === 0) w.segments.push({ kind: locale ? "locale" : "double", source: src.slice(i, j + 1), value: "" });
      i = j + 1;
      continue;
    }

    if (c === "`") {
      const j = skipBacktick(src, i + 1);
      if (j < 0) return { ok: false, message: `Unterminated backquote at character ${i + 1}. A \`...\` command substitution needs its closing backquote.`, position: i };
      add(i, { kind: "command", source: src.slice(i, j + 1), value: src.slice(i, j + 1), quoted: false });
      i = j + 1;
      continue;
    }

    if (c === "$") {
      const r = dollarAt(src, i, false);
      if (r && "error" in r) return { ok: false, message: r.error, position: i };
      if (r) {
        add(i, r.seg);
        i = r.next;
      } else {
        add(i, { kind: "literal", source: "$", value: "$" });
        i++;
      }
      continue;
    }

    if ((c === "<" || c === ">") && src[i + 1] === "(" && !word) {
      const j = findClose(src, i + 2, ")");
      if (j < 0) return { ok: false, message: `Unterminated ${c}( at character ${i + 1}. A process substitution ends at its matching ).`, position: i };
      const source = src.slice(i, j + 1);
      add(i, { kind: "procsub", source, value: source });
      i = j + 1;
      continue;
    }

    if (OP_START.has(c)) {
      const op = OPERATORS.find((o) => src.startsWith(o, i)) ?? c;
      let fd: string | null = null;
      const w = word as RawWord | null;
      if (
        (op[0] === "<" || op[0] === ">") &&
        w &&
        w.segments.length === 1 &&
        w.segments[0].kind === "literal" &&
        /^\d+$/.test(w.segments[0].value)
      ) {
        fd = w.segments[0].value; // IO_NUMBER, XCU 2.10.1 rule 2
        word = null;
      } else delimit(i);
      if (BASH_ONLY_OPS.has(op)) warnings.add(`${op} is a bash operator, not POSIX sh.`);
      if (op === "<<" || op === "<<-") heredocDelimNext = { strip: op === "<<-" };
      tokens.push({ type: "op", op, fd, start: i });
      i += op.length;
      continue;
    }

    if (c === "\n") {
      delimit(i);
      tokens.push({ type: "newline", start: i });
      if (pendingHeredocs.length) i = readHeredocs(i);
      i++;
      continue;
    }

    if (isBlank(c)) {
      delimit(i);
      i++;
      continue;
    }

    if (c === "#" && !word) {
      const nl = src.indexOf("\n", i);
      const end = nl < 0 ? src.length : nl;
      comments.push(src.slice(i, end));
      i = end;
      continue;
    }

    // Unquoted pattern and expansion characters.
    const atStart = !word;
    if (c === "~") {
      const assign = assignmentShaped();
      const prev = src[i - 1];
      const t = atStart ? tildeAt(src, i, false) : assign && (prev === "=" || prev === ":") ? tildeAt(src, i, true) : null;
      if (t) {
        add(i, { kind: "tilde", source: t, value: t });
        i += t.length;
        continue;
      }
    }
    if (c === "*" || c === "?") {
      add(i, { kind: "glob", source: c, value: c });
      i++;
      continue;
    }
    if (c === "[") {
      const b = bracketAt(src, i);
      if (b) {
        add(i, { kind: "glob", source: b, value: b });
        i += b.length;
        continue;
      }
    }
    if (c === "{") {
      const b = braceAt(src, i);
      if (b) {
        add(i, { kind: "brace", source: b, value: b });
        i += b.length;
        continue;
      }
    }

    const cp = src.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    add(i, { kind: "literal", source: ch, value: ch });
    i += ch.length;
  }
  delimit(src.length);
  if (heredocDelimNext) {
    return { ok: false, message: "A << here-document operator has no delimiter word after it.", position: src.length };
  }
  if (pendingHeredocs.length) {
    for (const h of pendingHeredocs) {
      warnings.add(`The here-document ended by ${h.word.value} has no body: the input ends on the same line.`);
      (h.word as Word & { heredoc?: Redirect["heredoc"] }).heredoc = { body: "", expands: !h.word.quoted, terminated: false };
    }
  }
  if (truncated) warnings.add(`Stopped after ${MAX_WORDS.toLocaleString("en-US")} words. The rest of the input was not split.`);

  return assemble(tokens, [...warnings], comments, truncated);
}

function assemble(tokens: Token[], warnings: string[], comments: string[], truncated: boolean): SplitResult {
  const commands: ParsedCommand[] = [];
  let current: ParsedCommand = { items: [], argv: [], terminator: null, kind: "simple" };
  let pending: Redirect | null = null;
  let pendingAt = 0;
  let seenCommandWord = false;
  const extra = new Set<string>(warnings);

  const finish = (terminator: string | null) => {
    if (current.items.length) {
      current.terminator = terminator;
      commands.push(current);
    }
    current = { items: [], argv: [], terminator: null, kind: "simple" };
    seenCommandWord = false;
  };
  let prevOp: string | null = null;

  for (const t of tokens) {
    if (t.type === "word") {
      const w = t.word;
      if (pending) {
        pending.target = w;
        const hd = (w as Word & { heredoc?: Redirect["heredoc"] }).heredoc;
        if (hd) pending.heredoc = hd;
        pending = null;
        continue;
      }
      const bare = !w.quoted && w.segments.every((s) => s.kind === "literal");
      if (!seenCommandWord && current.kind === "simple") {
        if (bare && LEADING_KEYWORDS.has(w.value) && !current.items.some((x) => x.role === "assign")) {
          current.items.push({ role: "keyword", word: w });
          continue;
        }
        if (bare && CLOSING_KEYWORDS.has(w.value)) {
          current.items.push({ role: "keyword", word: w });
          continue;
        }
        if (bare && HEADER_KEYWORDS.has(w.value)) {
          current.kind = "header";
          current.items.push({ role: "keyword", word: w });
          seenCommandWord = true;
          continue;
        }
        if (bare && w.value === "[[") {
          current.kind = "conditional";
          current.items.push({ role: "keyword", word: w });
          seenCommandWord = true;
          continue;
        }
        const first = w.segments[0];
        if (first && first.kind === "literal" && /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(first.value)) {
          current.items.push({ role: "assign", word: w });
          continue;
        }
      }
      if (current.kind === "simple") {
        seenCommandWord = true;
        current.items.push({ role: "arg", word: w, index: current.argv.length });
        current.argv.push(w);
      } else {
        const closing = current.kind === "conditional" && bare && w.value === "]]";
        current.items.push({ role: closing ? "keyword" : "arg", word: w });
      }
      continue;
    }
    if (t.type === "op" && REDIRECT_OPS.has(t.op)) {
      if (pending) {
        return { ok: false, message: `${pending.op} at character ${pendingAt + 1} needs a file name before the next operator.`, position: pendingAt };
      }
      pending = { fd: t.fd, op: t.op, target: null };
      pendingAt = t.start;
      current.items.push({ role: "redirect", redirect: pending });
      continue;
    }
    if (pending) {
      const at = t.type === "op" ? t.op : "newline";
      return {
        ok: false,
        message: `${(pending as Redirect).op} at character ${pendingAt + 1} has no file name after it, only ${at === "newline" ? "the end of the line" : at}. bash reports a syntax error here.`,
        position: pendingAt,
      };
    }
    const op = t.type === "op" ? t.op : "\n";
    if (op === "(") extra.add("Parentheses group commands into a subshell. Each command inside is still split as shown.");
    if (op !== "\n" && op !== "(" && op !== ")" && current.items.length === 0 && prevOp !== ")") {
      extra.add(`${op} has no command before it, which bash rejects as a syntax error.`);
    }
    finish(op);
    prevOp = op;
    continue;
  }
  if (pending) {
    return { ok: false, message: `${(pending as Redirect).op} at character ${pendingAt + 1} has no file name after it. bash reports a syntax error here.`, position: pendingAt };
  }
  finish(null);

  // Drop empty commands that only carried a newline terminator.
  const list = commands.filter((cmd) => cmd.items.length > 0 || (cmd.terminator !== null && cmd.terminator !== "\n"));
  if (list.some((cmd) => cmd.kind !== "simple" || cmd.items.some((it) => it.role === "keyword"))) {
    extra.add("Reserved words such as if, for, do and done are shown as keywords. Words are split correctly, but each simple command is shown on its own, without following the control flow.");
  }
  const allWords = list.flatMap((cmd) =>
    cmd.items.flatMap((it) => (it.word ? [it.word] : it.redirect?.target ? [it.redirect.target] : [])),
  );
  const dynamic = allWords.some((w) => w.expansions.length > 0 || w.glob || w.tilde || w.brace || w.procsub);
  if (allWords.some((w) => w.brace)) extra.add("Brace expansion ({a,b}, {1..3}) is bash, zsh and ksh. POSIX sh passes the braces through literally.");
  if (allWords.some((w) => w.procsub)) extra.add("Process substitution <(...) is bash, zsh and ksh. The program receives a path such as /dev/fd/63.");
  if (allWords.some((w) => w.segments.some((s) => s.kind === "ansi"))) {
    extra.add("$'...' is supported by bash, zsh, ksh93 and mksh and was added to POSIX in the 2024 edition; older sh implementations do not have it.");
  }
  if (allWords.some((w) => w.truncatedAtNul)) extra.add("A $'...' string contains \\0. bash ends the string there and drops the rest of that quoted part.");
  if (allWords.some((w) => w.invalidUtf8)) extra.add("A $'\\x..' escape produced bytes that are not valid UTF-8. They are shown as U+FFFD here; the program receives the raw bytes.");

  return { ok: true, commands: list, warnings: [...extra], comments, truncated, dynamic };
}

/** Quotes every argv word back into one canonical POSIX command line. */
export function canonicalCommand(argv: Word[]): string {
  return argv.map((w) => quotePosix(w.value, true)).join(" ");
}

/** Puts a value into a template at every {}, or at the end if there is none. */
export function fillTemplate(template: string, value: string): string {
  if (!template.includes("{}")) return `${template} ${value}`;
  // split/join, not replace: replace() would read $& and $1 in the value.
  return template.split("{}").join(value);
}
