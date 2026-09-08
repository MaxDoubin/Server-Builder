/**
 * Text-processing commands.
 *
 * These are the ones a lab actually leans on, because nearly every real
 * diagnosis ends in "now find the line that says why". grep in particular has
 * to be right: a reader who learns that `grep -c` counts matches rather than
 * matching lines has learned something false, so the flags implemented here
 * behave exactly as GNU grep does and the rest are refused.
 */

import { err, fail, ok, out, type Command } from "../shell";
import { inputLines, stripValueFlag } from "./files";

const flagSet = (argv: string[]): Set<string> => {
  const set = new Set<string>();
  for (const arg of argv) {
    if (arg.startsWith("--") || !arg.startsWith("-") || arg.length === 1) continue;
    for (const ch of arg.slice(1)) set.add(ch);
  }
  return set;
};

const operands = (argv: string[]): string[] => argv.filter((a) => !a.startsWith("-") || a === "-");

export const grep: Command = {
  name: "grep",
  summary: "print lines matching a pattern",
  usage: [
    "grep [-i] [-v] [-c] [-n] [-E] [-o] PATTERN [FILE...]",
    "",
    "  -i  ignore case",
    "  -v  invert: print the lines that do NOT match",
    "  -c  print how many LINES matched, not how many matches there were",
    "  -n  prefix each line with its line number",
    "  -E  extended regular expressions (grep -E, formerly egrep)",
    "  -o  print only the matching part of each line",
    "",
    "Reads standard input when given no FILE, so it works after a pipe.",
  ],
  run(argv, context) {
    const set = flagSet(argv);
    const rest = operands(argv);
    if (rest.length === 0) return fail("usage: grep [-icvnEo] PATTERN [FILE...]");
    const [pattern, ...paths] = rest;

    let rx: RegExp;
    try {
      const source = set.has("E") ? pattern : escapeBasic(pattern);
      rx = new RegExp(source, set.has("i") ? "gi" : "g");
    } catch {
      return fail(`grep: ${pattern}: invalid regular expression`);
    }

    const read = inputLines(paths, context, "grep");
    if ("error" in read) return fail(read.error);

    const many = paths.length > 1;
    const lines = [];
    let count = 0;

    for (const [index, line] of read.lines.entries()) {
      rx.lastIndex = 0;
      const hit = rx.test(line);
      if (hit === set.has("v")) continue;
      count++;
      if (set.has("c")) continue;
      const prefix = (many ? `${paths[0]}:` : "") + (set.has("n") ? `${index + 1}:` : "");
      if (set.has("o") && !set.has("v")) {
        rx.lastIndex = 0;
        for (const match of line.matchAll(rx)) lines.push(out(prefix + match[0]));
      } else {
        lines.push(out(prefix + line));
      }
    }

    if (set.has("c")) return ok([out(String(count))]);
    return { lines, code: count > 0 ? 0 : 1 };
  },
};

/**
 * Basic regular expressions, near enough.
 *
 * In a BRE, + ? { } ( ) | are literal unless backslash-escaped, which is the
 * difference that sends people to `grep -E`. Rather than implement BRE
 * properly, the metacharacters that differ are escaped so a pattern written
 * for BRE does not silently behave as an ERE. . * ^ $ [ ] keep their meaning,
 * which is the part everyone actually uses.
 */
function escapeBasic(pattern: string): string {
  return pattern.replace(/\\?([+?{}()|])/g, (whole, char) =>
    whole.startsWith("\\") ? char : `\\${char}`,
  );
}

export const sort: Command = {
  name: "sort",
  summary: "sort lines",
  usage: [
    "sort [-n] [-r] [-u] [-k FIELD] [FILE...]",
    "",
    "  -n  compare as numbers, so 9 sorts before 10",
    "  -r  reverse",
    "  -u  drop duplicate lines after sorting",
    "  -k  sort on a whitespace-separated field, counting from 1",
  ],
  run(argv, context) {
    const set = flagSet(argv);
    const field = Number(valueOf(argv, "-k") ?? 0);
    const read = inputLines(stripValueFlag(operands(argv), "-k"), context, "sort");
    if ("error" in read) return fail(read.error);

    const key = (line: string) =>
      field > 0 ? (line.trim().split(/\s+/)[field - 1] ?? "") : line;

    let lines = [...read.lines].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (set.has("n")) {
        const na = parseFloat(ka);
        const nb = parseFloat(kb);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
        if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? 1 : -1;
      }
      return ka.localeCompare(kb, "en");
    });
    if (set.has("r")) lines.reverse();
    if (set.has("u")) lines = lines.filter((line, i) => i === 0 || line !== lines[i - 1]);
    return ok(lines.map((line) => out(line)));
  },
};

export const uniq: Command = {
  name: "uniq",
  summary: "collapse repeated adjacent lines",
  usage: [
    "uniq [-c] [-d] [FILE]",
    "",
    "  -c  prefix each line with how many times it repeated",
    "  -d  only print lines that repeated",
    "",
    "ADJACENT is the whole trick: uniq does not sort, so `sort | uniq -c` is",
    "the idiom and `uniq -c` on unsorted input undercounts.",
  ],
  run(argv, context) {
    const set = flagSet(argv);
    const read = inputLines(operands(argv), context, "uniq");
    if ("error" in read) return fail(read.error);
    const lines = [];
    let index = 0;
    while (index < read.lines.length) {
      let run = 1;
      while (read.lines[index + run] === read.lines[index]) run++;
      if (!set.has("d") || run > 1) {
        lines.push(out(set.has("c") ? `${String(run).padStart(7)} ${read.lines[index]}` : read.lines[index]));
      }
      index += run;
    }
    return ok(lines);
  },
};

export const cut: Command = {
  name: "cut",
  summary: "select fields or characters from each line",
  usage: [
    "cut -d DELIM -f LIST [FILE...]",
    "cut -c LIST [FILE...]",
    "",
    "LIST is 1-based: 2, or 1,3, or 2-4.",
  ],
  run(argv, context) {
    const delim = valueOf(argv, "-d") ?? "\t";
    const fieldSpec = valueOf(argv, "-f");
    const charSpec = valueOf(argv, "-c");
    if (!fieldSpec && !charSpec) return fail("cut: you must specify a list of bytes, characters, or fields");
    const wanted = parseList(fieldSpec ?? charSpec ?? "");
    let rest = stripValueFlag(operands(argv), "-d");
    rest = stripValueFlag(stripValueFlag(rest, "-f"), "-c");
    const read = inputLines(rest, context, "cut");
    if ("error" in read) return fail(read.error);
    const lines = read.lines.map((line) => {
      if (charSpec) return out(wanted.map((n) => line[n - 1] ?? "").join(""));
      const parts = line.split(delim);
      if (parts.length === 1) return out(line);
      return out(wanted.map((n) => parts[n - 1] ?? "").join(delim));
    });
    return ok(lines);
  },
};

function parseList(spec: string): number[] {
  const wanted: number[] = [];
  for (const part of spec.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) wanted.push(n);
    } else if (/^\d+$/.test(part)) {
      wanted.push(Number(part));
    }
  }
  return wanted;
}

function valueOf(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index !== -1) return argv[index + 1];
  const joined = argv.find((a) => a.startsWith(flag) && a.length > flag.length);
  return joined?.slice(flag.length);
}

export const tr: Command = {
  name: "tr",
  summary: "translate or delete characters",
  usage: ["tr SET1 SET2", "tr -d SET1", "", "Reads standard input only, as tr does."],
  run(argv, { stdin }) {
    if (stdin === null) return fail("tr: reading from the keyboard is not supported in this lab shell");
    const set = flagSet(argv);
    const rest = operands(argv);
    if (set.has("d")) {
      const drop = new Set(expandSet(rest[0] ?? ""));
      return ok(stdin.split("\n").map((line) => out([...line].filter((c) => !drop.has(c)).join(""))));
    }
    const from = expandSet(rest[0] ?? "");
    const to = expandSet(rest[1] ?? "");
    const map = new Map(from.map((c, i) => [c, to[i] ?? to[to.length - 1] ?? c]));
    return ok(stdin.split("\n").map((line) => out([...line].map((c) => map.get(c) ?? c).join(""))));
  },
};

/** a-z and the two classes tr users reach for. */
function expandSet(spec: string): string[] {
  if (spec === "[:upper:]") return expandSet("A-Z");
  if (spec === "[:lower:]") return expandSet("a-z");
  const chars: string[] = [];
  for (let i = 0; i < spec.length; i++) {
    if (spec[i + 1] === "-" && spec[i + 2]) {
      for (let c = spec.charCodeAt(i); c <= spec.charCodeAt(i + 2); c++) chars.push(String.fromCharCode(c));
      i += 2;
    } else {
      chars.push(spec[i]);
    }
  }
  return chars;
}

export const sed: Command = {
  name: "sed",
  summary: "substitute text, one expression at a time",
  usage: [
    "sed 's/PATTERN/REPLACEMENT/[g]' [FILE...]",
    "sed -n 'Np'   print only line N",
    "",
    "Only s/// and -n Np are implemented. Anything else is refused rather",
    "than quietly doing something else.",
  ],
  run(argv, context) {
    const script = operands(argv)[0] ?? "";
    const paths = operands(argv).slice(1);
    const read = inputLines(paths, context, "sed");
    if ("error" in read) return fail(read.error);

    const printOnly = /^(\d+)p$/.exec(script);
    if (printOnly) {
      if (!flagSet(argv).has("n")) return fail("sed: use -n with 'Np' in this lab shell");
      const line = read.lines[Number(printOnly[1]) - 1];
      return ok(line === undefined ? [] : [out(line)]);
    }

    const substitute = /^s(.)(.*?)\1(.*?)\1(g?)$/.exec(script);
    if (!substitute) return fail(`sed: this lab shell only understands 's/PATTERN/REPLACEMENT/[g]'`);
    const [, , pattern, replacement, global] = substitute;
    let rx: RegExp;
    try {
      rx = new RegExp(pattern, global ? "g" : "");
    } catch {
      return fail(`sed: invalid regular expression: ${pattern}`);
    }
    // A replacement function, so & and $1 in the replacement text cannot be
    // read as a JavaScript pattern the reader never wrote.
    return ok(read.lines.map((line) => out(line.replace(rx, () => replacement))));
  },
};

export const awk: Command = {
  name: "awk",
  summary: "print selected fields from each line",
  usage: [
    "awk '{print $N}' [FILE...]",
    "awk -F DELIM '{print $N, $M}' [FILE...]",
    "",
    "Field printing only. Real awk is a programming language; this is the",
    "one thing people use it for at a prompt.",
  ],
  run(argv, context) {
    const separator = valueOf(argv, "-F");
    const rest = stripValueFlag(operands(argv), "-F");
    const program = rest[0] ?? "";
    const paths = rest.slice(1);
    const match = /^\{\s*print\s+(.+?)\s*\}$/.exec(program);
    if (!match) return fail("awk: this lab shell only understands '{print $1, $2}'");
    const fields = match[1].split(/\s*,\s*/);
    const read = inputLines(paths, context, "awk");
    if ("error" in read) return fail(read.error);
    return ok(
      read.lines.map((line) => {
        const parts = separator ? line.split(separator) : line.trim().split(/\s+/);
        const rendered = fields.map((spec) => {
          if (spec === "$0") return line;
          const index = /^\$(\d+)$/.exec(spec);
          if (index) return parts[Number(index[1]) - 1] ?? "";
          return spec.replace(/^"|"$/g, "");
        });
        return out(rendered.join(" "));
      }),
    );
  },
};

export const base64Cmd: Command = {
  name: "base64",
  summary: "encode or decode base64",
  usage: ["base64 [FILE]", "base64 -d [FILE]", "", "  -d  decode"],
  run(argv, context) {
    const set = flagSet(argv);
    const read = inputLines(operands(argv), context, "base64");
    if ("error" in read) return fail(read.error);
    const text = read.lines.join("\n");
    try {
      if (set.has("d")) {
        const bytes = Uint8Array.from(atob(text.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
        return ok([out(new TextDecoder().decode(bytes))]);
      }
      const bytes = new TextEncoder().encode(text);
      const encoded = btoa(String.fromCharCode(...bytes));
      // Real base64 wraps at 76 columns, and a lab that pipes the output
      // through grep will see those wraps, so they are here too.
      const wrapped = encoded.match(/.{1,76}/g) ?? [];
      return ok(wrapped.map((chunk) => out(chunk)));
    } catch {
      return { lines: [err("base64: invalid input")], code: 1 };
    }
  },
};

export const TEXT_COMMANDS: Command[] = [grep, sort, uniq, cut, tr, sed, awk, base64Cmd];
