/**
 * The shell: parse a line, run the pipeline, hand back what to print.
 *
 * Scope is set by what the labs ask for, and the rule is that anything this
 * accepts must behave the way bash behaves, because a reader who learns a
 * wrong lesson here has been actively harmed. So single and double quotes,
 * pipes, output redirection, `&&`, `||` and `;` are real; process
 * substitution, subshells, job control, variables beyond $NAME and ${NAME},
 * and here-documents are not accepted at all rather than half accepted.
 * Refusing a construct with "not supported in this lab shell" is honest.
 * Silently doing something different from bash is not.
 *
 * Commands are pure functions of (argv, stdin, machine) -> Output. They may
 * mutate the machine, and several do, but they never touch the DOM, the
 * clock, or the network, so the CI gate can replay a whole lab in Node and
 * get exactly what the browser would show.
 */

import { lookup, resolvePath, type FsNode } from "./vfs";
import type { Machine } from "./machine";

export interface OutLine {
  text: string;
  stream: "out" | "err";
  /**
   * Milliseconds to wait before showing this line. Only the terminal honours
   * it; the gate concatenates and ignores it. ping and traceroute set it so
   * they feel like themselves rather than dumping five lines at once.
   */
  delay?: number;
}

export interface Output {
  lines: OutLine[];
  code: number;
}

export const out = (text: string, delay?: number): OutLine => ({ text, stream: "out", delay });
export const err = (text: string): OutLine => ({ text, stream: "err" });
export const ok = (lines: OutLine[] = []): Output => ({ lines, code: 0 });
export const fail = (message: string, code = 1): Output => ({ lines: [err(message)], code });

export interface CommandContext {
  machine: Machine;
  /** Text piped in, or null when this command is first in the pipeline. */
  stdin: string | null;
  /** The whole line, for commands that want their arguments unsplit. */
  raw: string;
}

export interface Command {
  name: string;
  /** One line, shown by `help`. */
  summary: string;
  /** Shown by `man <name>`. Written as a reader would want to read it. */
  usage: string[];
  run(argv: string[], context: CommandContext): Output;
}

/* ---------------------------------------------------------------------------
   Parsing
   ------------------------------------------------------------------------ */

export interface ParseError {
  error: string;
}

interface Redirect {
  /** ">" truncates, ">>" appends. */
  op: ">" | ">>";
  path: string;
}

interface Simple {
  argv: string[];
  redirect?: Redirect;
}

interface Pipeline {
  stages: Simple[];
  /** How this pipeline joins to the one before it. */
  join: "first" | "&&" | "||" | ";";
}

const UNSUPPORTED: [RegExp, string][] = [
  [/<\(/, "process substitution"],
  [/\$\(/, "command substitution"],
  [/`/, "backtick command substitution"],
  [/<</, "here-documents"],
  [/(^|[^&])&($|[^&])/, "background jobs"],
  [/^\s*(for|while|until|if|case|function)\b/, "shell control flow"],
];

/**
 * Split a line into pipelines of simple commands.
 *
 * Returns a ParseError rather than throwing, because every caller wants to
 * print the message rather than handle an exception, and because a parse
 * error is an ordinary thing for a reader to produce.
 */
export function parse(line: string, env: Record<string, string> = {}): Pipeline[] | ParseError {
  for (const [pattern, what] of UNSUPPORTED) {
    if (pattern.test(line)) {
      return { error: `lab shell: ${what} is not supported here` };
    }
  }

  const pipelines: Pipeline[] = [];
  let stages: Simple[] = [];
  let tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  let join: Pipeline["join"] = "first";

  const pushToken = () => {
    if (started) tokens.push(current);
    current = "";
    started = false;
  };
  const pushStage = () => {
    pushToken();
    if (tokens.length) stages.push(toSimple(tokens));
    tokens = [];
  };
  const pushPipeline = (nextJoin: Pipeline["join"]) => {
    pushStage();
    if (stages.length) pipelines.push({ stages, join });
    stages = [];
    join = nextJoin;
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (quote === "'") {
      if (ch === "'") quote = null;
      else {
        current += ch;
        started = true;
      }
      continue;
    }
    if (quote === '"') {
      if (ch === '"') {
        quote = null;
        continue;
      }
      if (ch === "$") {
        const rest = line.slice(i + 1);
        const match = /^\{(\w+)\}|^(\w+)/.exec(rest);
        if (match) {
          current += env[match[1] ?? match[2]] ?? "";
          i += match[0].length;
          started = true;
          continue;
        }
      }
      current += ch;
      started = true;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (ch === "$") {
      /*
        Expansion happens here, in the tokenizer, rather than over finished
        tokens, because that is the only place that still knows whether the
        dollar was inside single quotes. Expanding afterwards turned
        awk '{print $11}' into awk '{print }', since $11 is not a variable
        and an unset variable expands to nothing.
      */
      const rest = line.slice(i + 1);
      const match = /^\{(\w+)\}|^(\w+)/.exec(rest);
      if (match) {
        current += env[match[1] ?? match[2]] ?? "";
        i += match[0].length;
        started = true;
        continue;
      }
      current += ch;
      started = true;
      continue;
    }
    if (ch === "\\" && i + 1 < line.length) {
      current += line[++i];
      started = true;
      continue;
    }
    if (ch === " " || ch === "\t") {
      pushToken();
      continue;
    }
    if (ch === "|" && line[i + 1] === "|") {
      i++;
      pushPipeline("||");
      continue;
    }
    if (ch === "|") {
      pushStage();
      continue;
    }
    if (ch === "&" && line[i + 1] === "&") {
      i++;
      pushPipeline("&&");
      continue;
    }
    if (ch === ";") {
      pushPipeline(";");
      continue;
    }
    if (ch === ">") {
      pushToken();
      tokens.push(line[i + 1] === ">" ? (i++, ">>") : ">");
      continue;
    }
    current += ch;
    started = true;
  }

  if (quote) return { error: "lab shell: unterminated quote" };
  pushPipeline(";");
  return pipelines;
}

function toSimple(tokens: string[]): Simple {
  const argv: string[] = [];
  let redirect: Redirect | undefined;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === ">" || tokens[i] === ">>") {
      const path = tokens[i + 1];
      if (path !== undefined) {
        redirect = { op: tokens[i] as ">" | ">>", path };
        i++;
      }
      continue;
    }
    argv.push(tokens[i]);
  }
  return { argv, redirect };
}

/**
 * Glob a token against the filesystem.
 *
 * Only * and ? and only in the final path component, which covers `ls *.log`
 * and `cat /var/log/auth*` and stops well short of extglob. A pattern that
 * matches nothing is left alone, exactly as bash does with nullglob off, so
 * the command gets the literal pattern and reports its own "No such file".
 */
function expandGlob(token: string, machine: Machine): string[] {
  if (!/[*?]/.test(token)) return [token];
  const slash = token.lastIndexOf("/");
  const dirPart = slash === -1 ? "." : token.slice(0, slash) || "/";
  const pattern = token.slice(slash + 1);
  if (/[*?]/.test(dirPart)) return [token];

  const found = lookup(machine.root, machine.cwd, dirPart);
  if (!found.ok || found.node.kind !== "dir") return [token];

  const rx = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
  );
  const names = Object.keys(found.node.children ?? {})
    .filter((name) => !name.startsWith(".") || pattern.startsWith("."))
    .filter((name) => rx.test(name))
    .sort();
  if (names.length === 0) return [token];
  return names.map((name) => (slash === -1 ? name : `${dirPart.replace(/\/$/, "")}/${name}`));
}

/* ---------------------------------------------------------------------------
   Execution
   ------------------------------------------------------------------------ */

export interface Registry {
  get(name: string): Command | undefined;
  names(): string[];
}

/** Write a pipeline's output to a file, creating it if the parent exists. */
function writeFile(machine: Machine, path: string, text: string, append: boolean): string | null {
  const absolute = resolvePath(machine.cwd, path);
  const parentPath = absolute.slice(0, absolute.lastIndexOf("/")) || "/";
  const name = absolute.slice(absolute.lastIndexOf("/") + 1);
  const parent = lookup(machine.root, "/", parentPath);
  if (!parent.ok) return `bash: ${path}: No such file or directory`;
  if (parent.node.kind !== "dir") return `bash: ${path}: Not a directory`;
  const children = (parent.node.children ??= {});
  const existing = children[name];
  if (existing && existing.kind === "dir") return `bash: ${path}: Is a directory`;
  const before = append && existing?.content ? existing.content : "";
  const node: FsNode = existing ?? {
    kind: "file",
    mode: 0o644,
    owner: machine.user,
    group: machine.user,
    mtime: Date.UTC(2026, 8, 2, 9, 14, 0),
    content: "",
  };
  node.content = before + text;
  children[name] = node;
  return null;
}

const textOf = (lines: OutLine[], stream: "out" | "err"): string =>
  lines
    .filter((line) => line.stream === stream)
    .map((line) => line.text)
    .join("\n");

/**
 * Run one input line.
 *
 * Exit status drives `&&` and `||`, and the last pipeline's status is the
 * line's status, which is what a lab checking "did that command succeed"
 * relies on.
 */
export function runLine(line: string, machine: Machine, registry: Registry): Output {
  const parsed = parse(line, machine.env);
  if ("error" in parsed) return fail(parsed.error, 2);

  const collected: OutLine[] = [];
  let status = 0;

  for (const pipeline of parsed) {
    if (pipeline.join === "&&" && status !== 0) continue;
    if (pipeline.join === "||" && status === 0) continue;

    let stdin: string | null = null;
    let stageOut: OutLine[] = [];

    for (let i = 0; i < pipeline.stages.length; i++) {
      const stage = pipeline.stages[i];
      const argv = stage.argv.flatMap((token) => expandGlob(token, machine));
      if (argv.length === 0) continue;

      const command = registry.get(argv[0]);
      if (!command) {
        collected.push(err(`${argv[0]}: command not found`));
        collected.push(err(`Try 'help' for the commands this lab shell knows.`));
        status = 127;
        stageOut = [];
        break;
      }

      const result = command.run(argv.slice(1), { machine, stdin, raw: line });
      status = result.code;
      const last = i === pipeline.stages.length - 1;

      // Errors always reach the reader, even mid-pipeline, as on a terminal
      // where stderr is not redirected.
      collected.push(...result.lines.filter((l) => l.stream === "err"));

      if (last) {
        stageOut = result.lines.filter((l) => l.stream === "out");
      } else {
        stdin = textOf(result.lines, "out");
      }
    }

    if (pipeline.stages.length) {
      const redirect = pipeline.stages[pipeline.stages.length - 1].redirect;
      if (redirect) {
        const text = stageOut.map((l) => l.text).join("\n");
        const problem = writeFile(
          machine,
          redirect.path,
          text.length ? text + "\n" : "",
          redirect.op === ">>",
        );
        if (problem) {
          collected.push(err(problem));
          status = 1;
        }
      } else {
        collected.push(...stageOut);
      }
    }
  }

  return { lines: collected, code: status };
}
