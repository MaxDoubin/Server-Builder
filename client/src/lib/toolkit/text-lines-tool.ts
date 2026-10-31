/**
 * Line tools in the spirit of coreutils.
 *
 * Each operation reproduces what the matching command prints under
 * LC_ALL=C, so the shell pipeline shown beside the result gives the same
 * lines: byte order for sort (which for UTF-8 is code point order), GNU
 * sort's numeric, human-size and version comparisons, its last-resort
 * whole-line tie break, uniq -c's "%7d " count column, and cat -n's
 * six-wide number and tab.
 *
 * runLines is deliberately self-contained: every helper is declared inside
 * it and nothing outside its body is referenced. The page stringifies it
 * into a Web Worker when a chain contains a regular expression, because a
 * pattern with catastrophic backtracking cannot be interrupted any other
 * way. Keep it that way: no module-level constants, imports or helpers.
 */

export type SortMode = "lexical" | "natural" | "numeric" | "human";
export type TrimSide = "both" | "leading" | "trailing";
export type NumberStyle = "cat" | "compact";

export type StepSpec =
  | { op: "sort"; mode: SortMode; reverse: boolean; ignoreCase: boolean }
  | { op: "uniq"; ignoreCase: boolean }
  | { op: "dedupe"; ignoreCase: boolean }
  | { op: "count"; ignoreCase: boolean }
  | { op: "dropBlank" }
  | { op: "trim"; side: TrimSide }
  | { op: "reverse" }
  | { op: "shuffle" }
  | { op: "grep"; pattern: string; invert: boolean; ignoreCase: boolean }
  | { op: "head"; count: string }
  | { op: "tail"; count: string }
  | { op: "number"; style: NumberStyle };

export type Step = StepSpec & { id: string };
export type StepOp = StepSpec["op"];

export interface RunOptions {
  /** Lines past this are not read. */
  maxLines: number;
  /** Largest count head and tail accept. */
  maxCount: number;
  /** Random 32-bit words per shuffle step id, so a shuffle is stable across re-runs. */
  pools: Record<string, ArrayLike<number>>;
  /** False when regex steps must refuse to run (no worker to bound them). */
  allowRegex: boolean;
}

export interface StepOutcome {
  /** Lines after this step, or null when the step did not run. */
  count: number | null;
  error: string | null;
  /** A non-fatal remark about this step. */
  note: string | null;
}

export interface RunResult {
  lines: string[];
  /** Lines read from the input, after the cap. */
  inputLines: number;
  /** Lines in the input before the cap. */
  totalLines: number;
  truncated: boolean;
  /** The input used CRLF line endings. */
  crlf: boolean;
  steps: StepOutcome[];
  /** Index of the step that failed, or -1. Output is the state before it. */
  stoppedAt: number;
}

export const MAX_LINES = 100000;
export const MAX_COUNT = 1000000;
export const MAX_STEPS = 20;
/** How long a chain with a regex may run in the worker before it is stopped. */
export const WORKER_BUDGET_MS = 2000;

/**
 * Run the chain. Never throws for any input: a bad step is reported in its
 * outcome and the chain stops there.
 */
export function runLines(text: string, steps: readonly Step[], options: RunOptions): RunResult {
  // Bytes C's isspace() accepts in the C locale, minus the newline that
  // already ended the line: what [[:space:]] matches under LC_ALL=C.
  var SPACE = " \t\v\f\r";

  function isSpace(ch: string): boolean {
    return ch.length === 1 && SPACE.indexOf(ch) >= 0;
  }

  function isDigitCode(c: number): boolean {
    return c >= 48 && c <= 57;
  }

  function isAlphaCode(c: number): boolean {
    return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  }

  /**
   * UTF-16 code units, adjusted so the order is code point order. Surrogates
   * (D800 to DFFF) encode code points above FFFF, so they must sort after
   * E000 to FFFF; everywhere else the two orders already agree.
   */
  function unitOrder(c: number): number {
    if (c < 0xd800) return c;
    return c >= 0xe000 ? c - 0x800 : c + 0x2000;
  }

  /** memcmp on the UTF-8 bytes, which is what sort does in the C locale. */
  function cmpRaw(a: string, b: string): number {
    var n = a.length < b.length ? a.length : b.length;
    for (var i = 0; i < n; i++) {
      var x = a.charCodeAt(i);
      var y = b.charCodeAt(i);
      if (x !== y) return unitOrder(x) < unitOrder(y) ? -1 : 1;
    }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  }

  /** sort -f and uniq -i fold with toupper(), which in the C locale is ASCII only. */
  function foldUpper(s: string): string {
    return s.replace(/[a-z]+/g, function (m) {
      return m.toUpperCase();
    });
  }

  interface NumKey {
    neg: boolean;
    int: string;
    frac: string;
    digits: boolean;
    end: number;
  }

  /**
   * The number at the start of a line as GNU sort -n reads it: leading
   * blanks, an optional minus, digits, an optional "." and more digits. No
   * plus sign, no exponent, and no thousands separator in the C locale. A
   * line with no number is zero. Kept as digit strings, so there is no
   * precision limit, matching strnumcmp.
   */
  function numKey(s: string): NumKey {
    var i = 0;
    while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
    var neg = false;
    if (s[i] === "-") {
      neg = true;
      i++;
    }
    var start = i;
    while (i < s.length && isDigitCode(s.charCodeAt(i))) i++;
    var intDigits = s.slice(start, i);
    var fracDigits = "";
    if (s[i] === ".") {
      i++;
      var fs = i;
      while (i < s.length && isDigitCode(s.charCodeAt(i))) i++;
      fracDigits = s.slice(fs, i);
    }
    var int = intDigits.replace(/^0+/, "");
    var frac = fracDigits.replace(/0+$/, "");
    return { neg: neg, int: int, frac: frac, digits: intDigits.length + fracDigits.length > 0, end: i };
  }

  function cmpNumKey(a: NumKey, b: NumKey): number {
    var aZero = a.int === "" && a.frac === "";
    var bZero = b.int === "" && b.frac === "";
    var aNeg = a.neg && !aZero;
    var bNeg = b.neg && !bZero;
    if (aNeg !== bNeg) return aNeg ? -1 : 1;
    var mag = 0;
    if (a.int.length !== b.int.length) mag = a.int.length < b.int.length ? -1 : 1;
    else if (a.int !== b.int) mag = a.int < b.int ? -1 : 1;
    else if (a.frac !== b.frac) mag = a.frac < b.frac ? -1 : 1;
    return aNeg ? -mag : mag;
  }

  /**
   * sort -h: the suffix decides first, then the number. Order follows
   * coreutils' unit_order table (k and K, M, G, T, P, E, Z, Y, R, Q), so 1M
   * sorts after 2048K whatever the values. A suffix only counts directly
   * after at least one digit, and a minus sign negates the order.
   */
  function unitRank(s: string, key: NumKey): number {
    if (!key.digits) return 0;
    var ch = s[key.end];
    var units = "KMGTPEZYRQ";
    var rank = ch === "k" ? 1 : ch !== undefined && ch.length === 1 ? units.indexOf(ch) + 1 : 0;
    return key.neg ? -rank : rank;
  }

  /**
   * gnulib filevercmp, which is sort -V: Debian's version comparison with
   * file suffixes (a trailing run of .ext parts) set aside for a first pass,
   * and special cases for empty names and names starting with a dot.
   */
  function verOrder(s: string, pos: number, len: number): number {
    if (pos === len) return -1;
    var c = s.charCodeAt(pos);
    if (isDigitCode(c)) return 0;
    if (isAlphaCode(c)) return c;
    if (c === 126) return -2; // "~" sorts before everything, even the end
    return unitOrder(c) + 256;
  }

  function verrevcmp(a: string, alen: number, b: string, blen: number): number {
    var ap = 0;
    var bp = 0;
    while (ap < alen || bp < blen) {
      var firstDiff = 0;
      while ((ap < alen && !isDigitCode(a.charCodeAt(ap))) || (bp < blen && !isDigitCode(b.charCodeAt(bp)))) {
        var ac = verOrder(a, ap, alen);
        var bc = verOrder(b, bp, blen);
        if (ac !== bc) return ac - bc;
        ap++;
        bp++;
      }
      while (ap < alen && a.charCodeAt(ap) === 48) ap++;
      while (bp < blen && b.charCodeAt(bp) === 48) bp++;
      while (ap < alen && bp < blen && isDigitCode(a.charCodeAt(ap)) && isDigitCode(b.charCodeAt(bp))) {
        if (!firstDiff) firstDiff = a.charCodeAt(ap) - b.charCodeAt(bp);
        ap++;
        bp++;
      }
      if (ap < alen && isDigitCode(a.charCodeAt(ap))) return 1;
      if (bp < blen && isDigitCode(b.charCodeAt(bp))) return -1;
      if (firstDiff) return firstDiff;
    }
    return 0;
  }

  /** Length of S without its suffix, the longest match of (\.[A-Za-z~][A-Za-z0-9~]*)*$. */
  function filePrefixLen(s: string): number {
    var n = s.length;
    var prefix = 0;
    var i = 0;
    while (i < n) {
      i++;
      prefix = i;
      while (i + 1 < n && s[i] === "." && (isAlphaCode(s.charCodeAt(i + 1)) || s[i + 1] === "~")) {
        i += 2;
        while (i < n && (isAlphaCode(s.charCodeAt(i)) || isDigitCode(s.charCodeAt(i)) || s[i] === "~")) i++;
      }
    }
    return prefix;
  }

  function filevercmp(a: string, b: string): number {
    if (a === "") return b === "" ? 0 : -1;
    if (b === "") return 1;
    if (a[0] === ".") {
      if (b[0] !== ".") return -1;
      if (a === ".") return b === "." ? 0 : -1;
      if (b === ".") return 1;
      if (a === "..") return b === ".." ? 0 : -1;
      if (b === "..") return 1;
    } else if (b[0] === ".") {
      return 1;
    }
    var ap = filePrefixLen(a);
    var bp = filePrefixLen(b);
    var onePass = ap === a.length && bp === b.length;
    var result = verrevcmp(a, ap, b, bp);
    return result || onePass ? result : verrevcmp(a, a.length, b, b.length);
  }

  /**
   * GNU sort without -s: compare by the key, and when the keys tie, by the
   * whole line in byte order. -r reverses the entire comparison, tie break
   * included, so the reversed output is exactly the ascending output backward.
   */
  function sortLines(input: string[], mode: string, reverse: boolean, ignoreCase: boolean): string[] {
    var items = input.map(function (line) {
      var view = ignoreCase ? foldUpper(line) : line;
      var key: NumKey | null = null;
      var rank = 0;
      if (mode === "numeric" || mode === "human") {
        key = numKey(view);
        if (mode === "human") rank = unitRank(view, key);
      }
      return { line: line, view: view, key: key, rank: rank };
    });
    items.sort(function (x, y) {
      var d = 0;
      if (mode === "numeric") d = cmpNumKey(x.key as NumKey, y.key as NumKey);
      else if (mode === "human") d = x.rank !== y.rank ? x.rank - y.rank : cmpNumKey(x.key as NumKey, y.key as NumKey);
      else if (mode === "natural") d = filevercmp(x.view, y.view);
      else d = ignoreCase ? cmpRaw(x.view, y.view) : 0;
      if (d === 0) d = cmpRaw(x.line, y.line);
      return reverse ? -d : d;
    });
    return items.map(function (item) {
      return item.line;
    });
  }

  function parseCount(raw: string, name: string): { n: number } | { error: string } {
    var t = String(raw).trim();
    if (t === "") return { error: "Enter how many lines " + name + " should keep." };
    if (!/^[0-9]+$/.test(t)) return { error: "The line count must be a whole number of 0 or more, such as 10." };
    var n = Number(t);
    if (!(n <= options.maxCount)) {
      return { error: "Keep the line count at " + options.maxCount.toLocaleString("en-US") + " or below." };
    }
    return { n: n };
  }

  /** Uniform integer in [0, bound) from 32-bit words, by rejection so no value is favored. */
  function makeRandom(pool: ArrayLike<number> | undefined): (bound: number) => number {
    var idx = 0;
    var extra: Uint32Array | null = null;
    var extraIdx = 0;
    function word(): number {
      if (pool && idx < pool.length) return pool[idx++] >>> 0;
      if (!extra || extraIdx >= extra.length) {
        extra = new Uint32Array(1024);
        globalThis.crypto.getRandomValues(extra);
        extraIdx = 0;
      }
      return extra[extraIdx++];
    }
    return function (bound: number): number {
      var limit = 4294967296 - (4294967296 % bound);
      for (;;) {
        var r = word();
        if (r < limit) return r % bound;
      }
    };
  }

  // Lines end at LF. A CR right before it belongs to a CRLF ending and is
  // dropped. The final newline ends the last line rather than starting an
  // empty one, which is how wc -l, sort and the rest count.
  var crlf = text.indexOf("\r\n") >= 0;
  var all: string[] = text === "" ? [] : text.split("\n");
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  var totalLines = all.length;
  var truncated = totalLines > options.maxLines;
  var lines = truncated ? all.slice(0, options.maxLines) : all;
  if (crlf) {
    lines = lines.map(function (line) {
      return line.charCodeAt(line.length - 1) === 13 ? line.slice(0, -1) : line;
    });
  }
  var inputLines = lines.length;

  var outcomes: StepOutcome[] = [];
  var stoppedAt = -1;

  for (var si = 0; si < steps.length; si++) {
    var step = steps[si];
    if (stoppedAt >= 0) {
      outcomes.push({ count: null, error: null, note: null });
      continue;
    }
    var error: string | null = null;
    var note: string | null = null;
    var next: string[] = lines;
    try {
      switch (step.op) {
        case "sort":
          next = sortLines(lines, step.mode, step.reverse, step.ignoreCase);
          break;
        case "uniq": {
          next = [];
          var prev: string | null = null;
          for (var i = 0; i < lines.length; i++) {
            var cmp = step.ignoreCase ? foldUpper(lines[i]) : lines[i];
            if (cmp !== prev) next.push(lines[i]);
            prev = cmp;
          }
          if (next.length === lines.length && lines.length > 1) {
            var keys = new Set<string>();
            var dupes = false;
            for (var k = 0; k < lines.length && !dupes; k++) {
              var uk = step.ignoreCase ? foldUpper(lines[k]) : lines[k];
              if (keys.has(uk)) dupes = true;
              keys.add(uk);
            }
            if (dupes) {
              note =
                "Nothing removed: uniq only collapses adjacent repeats, and these duplicates are not next to each other. Sort first, or use the dedupe step.";
            }
          }
          break;
        }
        case "dedupe": {
          var seen = new Set<string>();
          next = [];
          for (var j = 0; j < lines.length; j++) {
            var dk = step.ignoreCase ? foldUpper(lines[j]) : lines[j];
            if (!seen.has(dk)) {
              seen.add(dk);
              next.push(lines[j]);
            }
          }
          break;
        }
        case "count": {
          // sort | uniq -c | sort -rn. With -f and -i, the line printed for a
          // group is the first one sort -f puts there: the byte-smallest
          // spelling, since ties are broken on the raw line.
          var groups = new Map<string, { rep: string; n: number }>();
          for (var c = 0; c < lines.length; c++) {
            var gk = step.ignoreCase ? foldUpper(lines[c]) : lines[c];
            var g = groups.get(gk);
            if (g) {
              g.n++;
              if (step.ignoreCase && cmpRaw(lines[c], g.rep) < 0) g.rep = lines[c];
            } else {
              groups.set(gk, { rep: lines[c], n: 1 });
            }
          }
          var counted: string[] = [];
          groups.forEach(function (v) {
            var num = String(v.n);
            counted.push((num.length < 7 ? "       ".slice(num.length) + num : num) + " " + v.rep);
          });
          next = sortLines(counted, "numeric", true, false);
          break;
        }
        case "dropBlank":
          next = lines.filter(function (line) {
            for (var b = 0; b < line.length; b++) if (!isSpace(line[b])) return true;
            return false;
          });
          break;
        case "trim": {
          var side = step.side;
          next = lines.map(function (line) {
            var s = 0;
            var e = line.length;
            if (side !== "trailing") while (s < e && isSpace(line[s])) s++;
            if (side !== "leading") while (e > s && isSpace(line[e - 1])) e--;
            return s === 0 && e === line.length ? line : line.slice(s, e);
          });
          break;
        }
        case "reverse":
          next = lines.slice().reverse();
          break;
        case "shuffle": {
          // Fisher and Yates, drawing from crypto randomness.
          next = lines.slice();
          var rand = makeRandom(options.pools[step.id]);
          for (var x = next.length - 1; x > 0; x--) {
            var y = rand(x + 1);
            var tmp = next[x];
            next[x] = next[y];
            next[y] = tmp;
          }
          break;
        }
        case "grep": {
          if (!options.allowRegex) {
            error =
              "This browser would not start a Web Worker, which is needed to stop a runaway regular expression, so regex steps are off.";
            break;
          }
          if (step.pattern === "") note = "An empty pattern matches every line.";
          var re: RegExp;
          try {
            re = new RegExp(step.pattern, step.ignoreCase ? "iu" : "u");
          } catch (err) {
            var msg = err instanceof Error ? err.message : String(err);
            error = "Not a valid JavaScript regular expression: " + msg.replace(/^Invalid regular expression: /, "");
            break;
          }
          var invert = step.invert;
          next = lines.filter(function (line) {
            return re.test(line) !== invert;
          });
          break;
        }
        case "head":
        case "tail": {
          var parsed = parseCount(step.count, step.op);
          if ("error" in parsed) {
            error = parsed.error;
            break;
          }
          if (step.op === "head") next = lines.slice(0, parsed.n);
          else next = parsed.n === 0 ? [] : lines.slice(-parsed.n);
          break;
        }
        case "number": {
          var compact = step.style === "compact";
          next = lines.map(function (line, idx) {
            var num = String(idx + 1);
            if (compact) return num + ": " + line;
            return (num.length < 6 ? "      ".slice(num.length) + num : num) + "\t" + line;
          });
          break;
        }
        default:
          error = "Unknown operation.";
      }
    } catch (err) {
      error = "This step failed: " + (err instanceof Error ? err.message : String(err));
    }
    if (error !== null) {
      stoppedAt = si;
      outcomes.push({ count: null, error: error, note: null });
    } else {
      lines = next;
      outcomes.push({ count: lines.length, error: null, note: note });
    }
  }

  return {
    lines: lines,
    inputLines: inputLines,
    totalLines: totalLines,
    truncated: truncated,
    crlf: crlf,
    steps: outcomes,
    stoppedAt: stoppedAt,
  };
}

/** POSIX shell single quoting: close, escaped quote, reopen. */
export function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** The commands one step becomes. A file name is appended to the first command of the pipeline. */
export function stepCommands(step: StepSpec): string[] {
  switch (step.op) {
    case "sort": {
      const mode = { lexical: "", natural: "V", numeric: "n", human: "h" }[step.mode];
      const flags = (step.ignoreCase ? "f" : "") + (step.reverse ? "r" : "") + mode;
      return [flags ? `sort -${flags}` : "sort"];
    }
    case "uniq":
      return [step.ignoreCase ? "uniq -i" : "uniq"];
    case "dedupe":
      return [step.ignoreCase ? "awk '!seen[toupper($0)]++'" : "awk '!seen[$0]++'"];
    case "count":
      return step.ignoreCase ? ["sort -f", "uniq -ci", "sort -rn"] : ["sort", "uniq -c", "sort -rn"];
    case "dropBlank":
      return ["grep -v '^[[:space:]]*$'"];
    case "trim":
      if (step.side === "leading") return ["sed 's/^[[:space:]]*//'"];
      if (step.side === "trailing") return ["sed 's/[[:space:]]*$//'"];
      return ["sed 's/^[[:space:]]*//; s/[[:space:]]*$//'"];
    case "reverse":
      return ["tac"];
    case "shuffle":
      return ["shuf"];
    case "grep": {
      const flags = (step.invert ? "v" : "") + (step.ignoreCase ? "i" : "") + "P";
      const pattern = "'" + step.pattern.replace(/'/g, "'\\''") + "'";
      return [`grep -${flags} ${step.pattern.startsWith("-") ? "-e " : ""}${pattern}`];
    }
    case "head":
    case "tail": {
      const n = String(step.count).trim();
      return [`${step.op} -n ${/^[0-9]+$/.test(n) ? n : "N"}`];
    }
    case "number":
      return [step.style === "compact" ? `awk '{print NR": "$0}'` : "cat -n"];
    default:
      return [];
  }
}

/**
 * The equivalent shell pipeline. LC_ALL=C is exported first because sort,
 * uniq -i, grep -i and awk's toupper all depend on the locale, and the C
 * locale is the one whose order this page reproduces.
 */
export function shellPipeline(steps: readonly StepSpec[], options: { crlf: boolean; file?: string }): string {
  const file = shellQuote(options.file ?? "input.txt");
  const commands: string[] = [];
  if (options.crlf) commands.push("sed 's/\\r$//'");
  for (const step of steps) commands.push(...stepCommands(step));
  if (commands.length === 0) commands.push("cat");
  commands[0] = `${commands[0]} ${file}`;
  return `export LC_ALL=C\n${commands.join(" |\n  ")}`;
}

/** The words the step list shows for each operation. */
export const OP_LABELS: Record<StepOp, string> = {
  sort: "Sort",
  uniq: "Uniq (adjacent)",
  dedupe: "Dedupe (any position)",
  count: "Count and rank",
  dropBlank: "Drop blank lines",
  trim: "Trim whitespace",
  reverse: "Reverse order",
  shuffle: "Shuffle",
  grep: "Filter by regex",
  head: "First N lines",
  tail: "Last N lines",
  number: "Number lines",
};

/** A new step of the given kind with sensible defaults. */
export function defaultStep(op: StepOp): StepSpec {
  switch (op) {
    case "sort":
      return { op, mode: "lexical", reverse: false, ignoreCase: false };
    case "uniq":
    case "dedupe":
    case "count":
      return { op, ignoreCase: false };
    case "trim":
      return { op, side: "both" };
    case "grep":
      return { op, pattern: "", invert: false, ignoreCase: false };
    case "head":
    case "tail":
      return { op, count: "10" };
    case "number":
      return { op, style: "cat" };
    default:
      return { op } as StepSpec;
  }
}

/** Fill a pool of random words for a shuffle step. getRandomValues takes at most 65,536 bytes per call. */
export function randomWords(count: number): Uint32Array {
  const out = new Uint32Array(Math.max(0, count));
  for (let i = 0; i < out.length; i += 16384) {
    globalThis.crypto.getRandomValues(out.subarray(i, Math.min(out.length, i + 16384)));
  }
  return out;
}

/** Number of lines the text holds, by the same rule runLines uses, capped for pool sizing. */
export function countLines(text: string): number {
  if (text === "") return 0;
  let n = 0;
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) n++;
  return text.endsWith("\n") ? n : n + 1;
}
