/**
 * Filesystem commands.
 *
 * Output formats are copied from GNU coreutils on Ubuntu, because the point
 * of a lab is that what you learn here is what you will see on a real box.
 * Where a flag is not implemented the command says so instead of ignoring it:
 * an ignored flag teaches the reader that the flag does nothing.
 */

import {
  baseName,
  lookup,
  modeString,
  permitted,
  resolvePath,
  sizeOf,
  type FsNode,
} from "../vfs";
import { err, fail, ok, out, type Command, type Output } from "../shell";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep  2 09:14", the coreutils format for a file less than six months old. */
function stamp(mtime: number): string {
  const d = new Date(mtime);
  const day = String(d.getUTCDate()).padStart(2, " ");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${day} ${hh}:${mm}`;
}

const pad = (text: string, width: number) => text.padStart(width);
const padEnd = (text: string, width: number) => text.padEnd(width);

/** Split argv into flag letters and the rest, GNU style. */
function flags(argv: string[]): { set: Set<string>; rest: string[]; long: string[] } {
  const set = new Set<string>();
  const long: string[] = [];
  const rest: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--")) long.push(arg.slice(2));
    else if (arg.startsWith("-") && arg.length > 1) for (const ch of arg.slice(1)) set.add(ch);
    else rest.push(arg);
  }
  return { set, rest, long };
}

const ENOENT = (cmd: string, path: string) => `${cmd}: ${path}: No such file or directory`;
const EACCES = (cmd: string, path: string) => `${cmd}: ${path}: Permission denied`;

function entriesOf(node: FsNode, all: boolean): [string, FsNode][] {
  const list = Object.entries(node.children ?? {});
  return list
    .filter(([name]) => all || !name.startsWith("."))
    .sort(([a], [b]) => a.localeCompare(b, "en"));
}

export const ls: Command = {
  name: "ls",
  summary: "list directory contents",
  usage: [
    "ls [-l] [-a] [-h] [PATH...]",
    "",
    "  -l  long format: mode, links, owner, group, size, time, name",
    "  -a  include entries beginning with a dot",
    "  -h  with -l, print sizes as 1.4K rather than 1433",
    "",
    "With no PATH, lists the working directory.",
  ],
  run(argv, { machine }) {
    const { set, rest } = flags(argv);
    const targets = rest.length ? rest : ["."];
    const lines = [];
    let code = 0;

    for (const target of targets) {
      const found = lookup(machine.root, machine.cwd, target);
      if (!found.ok) {
        lines.push(err(ENOENT("ls", target)));
        code = 2;
        continue;
      }
      /*
        Read permission is needed to LIST a directory. Naming a file only
        needs traverse on its parent, which is why `ls -l /var/log/auth.log`
        works for anyone even though the file is 0640: the metadata lives in
        the directory entry, not in the file.
      */
      if (found.node.kind === "dir" && !permitted(found.node, machine.user, "r")) {
        lines.push(err(EACCES("ls", target)));
        code = 2;
        continue;
      }
      if (targets.length > 1) lines.push(out(`${target}:`));

      const items: [string, FsNode][] =
        found.node.kind === "dir"
          ? entriesOf(found.node, set.has("a"))
          : [[target, found.node]];

      if (!set.has("l")) {
        if (items.length) lines.push(out(items.map(([name]) => name).join("  ")));
        if (targets.length > 1) lines.push(out(""));
        continue;
      }

      if (found.node.kind === "dir") {
        const blocks = items.reduce((sum, [, node]) => sum + Math.ceil(sizeOf(node) / 1024), 0);
        lines.push(out(`total ${blocks}`));
      }
      const sizes = items.map(([, node]) =>
        set.has("h") ? human(sizeOf(node)) : String(sizeOf(node)),
      );
      const sizeWidth = Math.max(0, ...sizes.map((s) => s.length));
      const ownerWidth = Math.max(0, ...items.map(([, n]) => n.owner.length));
      const groupWidth = Math.max(0, ...items.map(([, n]) => n.group.length));

      items.forEach(([name, node], index) => {
        const arrow = node.kind === "link" ? ` -> ${node.target}` : "";
        const links = node.kind === "dir" ? 2 + countDirs(node) : 1;
        lines.push(
          out(
            `${modeString(node)} ${pad(String(links), 2)} ${padEnd(node.owner, ownerWidth)} ` +
              `${padEnd(node.group, groupWidth)} ${pad(sizes[index], sizeWidth)} ` +
              `${stamp(node.mtime)} ${name}${arrow}`,
          ),
        );
      });
      if (targets.length > 1) lines.push(out(""));
    }
    return { lines, code };
  },
};

const countDirs = (node: FsNode): number =>
  Object.values(node.children ?? {}).filter((child) => child.kind === "dir").length;

function human(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  const units = ["K", "M", "G", "T"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${units[unit]}`;
}

export const pwd: Command = {
  name: "pwd",
  summary: "print the working directory",
  usage: ["pwd"],
  run(_argv, { machine }) {
    return ok([out(machine.cwd)]);
  },
};

export const cd: Command = {
  name: "cd",
  summary: "change the working directory",
  usage: ["cd [PATH]", "", "With no PATH, changes to $HOME."],
  run(argv, { machine }) {
    const target = argv[0] ?? machine.env.HOME ?? "/";
    const found = lookup(machine.root, machine.cwd, target);
    if (!found.ok) return fail(`cd: ${target}: No such file or directory`);
    if (found.node.kind !== "dir") return fail(`cd: ${target}: Not a directory`);
    if (!permitted(found.node, machine.user, "x")) return fail(`cd: ${target}: Permission denied`);
    machine.cwd = found.path;
    machine.env.PWD = found.path;
    return ok();
  },
};

/** Read a file for cat, head, tail, grep and friends, with the real errors. */
export function readFile(
  machine: import("../machine").Machine,
  cmd: string,
  path: string,
): { text: string } | { error: string } {
  const found = lookup(machine.root, machine.cwd, path);
  if (!found.ok) return { error: ENOENT(cmd, path) };
  if (found.node.kind === "dir") return { error: `${cmd}: ${path}: Is a directory` };
  if (!permitted(found.node, machine.user, "r")) return { error: EACCES(cmd, path) };
  return { text: found.node.content ?? "" };
}

/** Lines of a file or of stdin, with the trailing newline already dropped. */
export function inputLines(
  argv: string[],
  context: { machine: import("../machine").Machine; stdin: string | null },
  cmd: string,
): { lines: string[] } | { error: string } {
  const paths = argv.filter((a) => !a.startsWith("-"));
  if (paths.length === 0) {
    if (context.stdin === null) return { lines: [] };
    return { lines: context.stdin.length ? context.stdin.split("\n") : [] };
  }
  const collected: string[] = [];
  for (const path of paths) {
    const read = readFile(context.machine, cmd, path);
    if ("error" in read) return read;
    const text = read.text.replace(/\n$/, "");
    if (text.length) collected.push(...text.split("\n"));
  }
  return { lines: collected };
}

export const cat: Command = {
  name: "cat",
  summary: "print files",
  usage: ["cat [-n] FILE...", "", "  -n  number every output line"],
  run(argv, context) {
    const { set, rest } = flags(argv);
    if (rest.length === 0 && context.stdin === null) {
      return fail("cat: reading from the keyboard is not supported in this lab shell");
    }
    const read = inputLines(rest, context, "cat");
    if ("error" in read) return fail(read.error);
    const lines = read.lines.map((line, index) =>
      out(set.has("n") ? `${pad(String(index + 1), 6)}\t${line}` : line),
    );
    return ok(lines);
  },
};

export const head: Command = {
  name: "head",
  summary: "print the first lines of a file",
  usage: ["head [-n COUNT] [FILE...]", "", "  -n  how many lines (default 10)"],
  run(argv, context) {
    const count = numberFlag(argv, "-n", 10);
    const read = inputLines(stripValueFlag(argv, "-n"), context, "head");
    if ("error" in read) return fail(read.error);
    return ok(read.lines.slice(0, count).map((line) => out(line)));
  },
};

export const tail: Command = {
  name: "tail",
  summary: "print the last lines of a file",
  usage: ["tail [-n COUNT] [FILE...]", "", "  -n  how many lines (default 10)"],
  run(argv, context) {
    const count = numberFlag(argv, "-n", 10);
    const read = inputLines(stripValueFlag(argv, "-n"), context, "tail");
    if ("error" in read) return fail(read.error);
    return ok(read.lines.slice(-count).map((line) => out(line)));
  },
};

export function numberFlag(argv: string[], flag: string, fallback: number): number {
  const index = argv.indexOf(flag);
  if (index !== -1 && argv[index + 1] !== undefined) {
    const value = Number(argv[index + 1]);
    if (Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  }
  const joined = argv.find((a) => a.startsWith(flag) && a.length > flag.length);
  if (joined) {
    const value = Number(joined.slice(flag.length));
    if (Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  }
  return fallback;
}

export function stripValueFlag(argv: string[], flag: string): string[] {
  const kept: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) {
      i++;
      continue;
    }
    if (argv[i].startsWith(flag) && argv[i].length > flag.length) continue;
    kept.push(argv[i]);
  }
  return kept;
}

export const wc: Command = {
  name: "wc",
  summary: "count lines, words and bytes",
  usage: ["wc [-l] [-w] [-c] [FILE...]"],
  run(argv, context) {
    const { set, rest } = flags(argv);
    const read = inputLines(rest, context, "wc");
    if ("error" in read) return fail(read.error);
    const lines = read.lines.length;
    const words = read.lines.reduce((n, l) => n + l.split(/\s+/).filter(Boolean).length, 0);
    const bytes = read.lines.reduce((n, l) => n + l.length + 1, 0);
    const only = set.has("l") || set.has("w") || set.has("c");
    const parts: string[] = [];
    if (!only || set.has("l")) parts.push(pad(String(lines), only ? 0 : 7));
    if (!only || set.has("w")) parts.push(pad(String(words), only ? 0 : 7));
    if (!only || set.has("c")) parts.push(pad(String(bytes), only ? 0 : 7));
    const name = rest.length === 1 ? ` ${rest[0]}` : "";
    return ok([out(parts.join(only ? " " : "") + name)]);
  },
};

export const statCmd: Command = {
  name: "stat",
  summary: "show a file's metadata",
  usage: ["stat FILE..."],
  run(argv, { machine }) {
    if (argv.length === 0) return fail("stat: missing operand");
    const lines = [];
    let code = 0;
    for (const path of argv) {
      const found = lookup(machine.root, machine.cwd, path, false);
      if (!found.ok) {
        lines.push(err(`stat: cannot statx '${path}': No such file or directory`));
        code = 1;
        continue;
      }
      const node = found.node;
      const kind = node.kind === "dir" ? "directory" : node.kind === "link" ? "symbolic link" : "regular file";
      lines.push(out(`  File: ${path}${node.kind === "link" ? ` -> ${node.target}` : ""}`));
      lines.push(out(`  Size: ${sizeOf(node)}\tBlocks: ${Math.ceil(sizeOf(node) / 512)}\tIO Block: 4096   ${kind}`));
      lines.push(
        out(
          `Access: (0${node.mode.toString(8).padStart(3, "0")}/${modeString(node)})  ` +
            `Uid: ( ${node.owner === "root" ? "   0" : "1000"}/${pad(node.owner, 8)})   ` +
            `Gid: ( ${node.group === "root" ? "   0" : "1000"}/${pad(node.group, 8)})`,
        ),
      );
      lines.push(out(`Modify: ${new Date(node.mtime).toISOString().replace("T", " ").replace("Z", " +0000")}`));
    }
    return { lines, code };
  },
};

export const chmod: Command = {
  name: "chmod",
  summary: "change a file's permission bits",
  usage: [
    "chmod MODE FILE...",
    "",
    "MODE is octal (640, 0755) or symbolic (u+x, go-w, a=r).",
  ],
  run(argv, { machine }) {
    if (argv.length < 2) return fail("chmod: missing operand");
    const [mode, ...paths] = argv;
    const lines = [];
    let code = 0;
    for (const path of paths) {
      const found = lookup(machine.root, machine.cwd, path, false);
      if (!found.ok) {
        lines.push(err(`chmod: cannot access '${path}': No such file or directory`));
        code = 1;
        continue;
      }
      if (machine.user !== "root" && found.node.owner !== machine.user) {
        lines.push(err(`chmod: changing permissions of '${path}': Operation not permitted`));
        code = 1;
        continue;
      }
      const next = applyMode(found.node.mode, mode);
      if (next === null) {
        lines.push(err(`chmod: invalid mode: '${mode}'`));
        code = 1;
        continue;
      }
      found.node.mode = next;
    }
    return { lines, code };
  },
};

/** Octal or symbolic. Returns null for anything it does not understand. */
export function applyMode(current: number, spec: string): number | null {
  if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec, 8) & 0o7777;
  let mode = current;
  for (const clause of spec.split(",")) {
    const match = /^([ugoa]*)([+\-=])([rwx]*)$/.exec(clause);
    if (!match) return null;
    const [, whoText, op, permText] = match;
    const who = whoText === "" || whoText.includes("a") ? "ugo" : whoText;
    let bits = 0;
    if (permText.includes("r")) bits |= 4;
    if (permText.includes("w")) bits |= 2;
    if (permText.includes("x")) bits |= 1;
    for (const target of who) {
      const shift = target === "u" ? 6 : target === "g" ? 3 : 0;
      if (op === "+") mode |= bits << shift;
      else if (op === "-") mode &= ~(bits << shift);
      else mode = (mode & ~(0o7 << shift)) | (bits << shift);
    }
  }
  return mode;
}

export const find: Command = {
  name: "find",
  summary: "walk a directory tree",
  usage: [
    "find [PATH] [-name PATTERN] [-type f|d|l] [-perm MODE] [-user NAME]",
    "",
    "  -name  shell pattern against the file name only",
    "  -perm  exact octal match, or -perm /MODE for any of these bits set",
  ],
  run(argv, { machine }) {
    const start = argv[0] && !argv[0].startsWith("-") ? argv[0] : ".";
    const value = (flag: string) => {
      const i = argv.indexOf(flag);
      return i === -1 ? undefined : argv[i + 1];
    };
    const namePattern = value("-name");
    const typeWanted = value("-type");
    const permWanted = value("-perm");
    const userWanted = value("-user");

    const found = lookup(machine.root, machine.cwd, start);
    if (!found.ok) return fail(`find: '${start}': No such file or directory`);

    const rx = namePattern
      ? new RegExp(
          "^" +
            namePattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") +
            "$",
        )
      : null;

    const hits: string[] = [];
    const walk = (node: FsNode, path: string) => {
      const kindLetter = node.kind === "dir" ? "d" : node.kind === "link" ? "l" : "f";
      const name = baseName(path);
      const permOk =
        !permWanted ||
        (permWanted.startsWith("/")
          ? (node.mode & parseInt(permWanted.slice(1), 8)) !== 0
          : node.mode === parseInt(permWanted, 8));
      if (
        (!rx || rx.test(name)) &&
        (!typeWanted || typeWanted === kindLetter) &&
        (!userWanted || node.owner === userWanted) &&
        permOk
      ) {
        hits.push(path);
      }
      if (node.kind === "dir") {
        for (const [child, childNode] of entriesOf(node, true)) {
          walk(childNode, path === "/" ? `/${child}` : `${path}/${child}`);
        }
      }
    };
    walk(found.node, start === "." ? "." : start.replace(/\/$/, ""));
    return ok(hits.map((hit) => out(hit)));
  },
};

export const echoCmd: Command = {
  name: "echo",
  summary: "print its arguments",
  usage: ["echo [TEXT...]"],
  run(argv) {
    return ok([out(argv.join(" "))]);
  },
};

export const df: Command = {
  name: "df",
  summary: "show filesystem usage",
  usage: ["df [-h]"],
  run(argv, { machine }) {
    const { set } = flags(argv);
    const size = (mb: number) => (set.has("h") ? human(mb * 1024 * 1024) : String(mb * 1024));
    const lines = [
      out(
        `${padEnd("Filesystem", 16)}${pad(set.has("h") ? "Size" : "1K-blocks", 10)}` +
          `${pad("Used", 8)}${pad("Avail", 8)} Use% Mounted on`,
      ),
    ];
    for (const disk of machine.disks) {
      const avail = disk.sizeMb - disk.usedMb;
      const pct = Math.round((disk.usedMb / disk.sizeMb) * 100);
      lines.push(
        out(
          `${padEnd(disk.filesystem, 16)}${pad(size(disk.sizeMb), 10)}${pad(size(disk.usedMb), 8)}` +
            `${pad(size(avail), 8)} ${pad(`${pct}%`, 4)} ${disk.mount}`,
        ),
      );
    }
    return ok(lines);
  },
};

export const FILE_COMMANDS: Command[] = [
  ls, pwd, cd, cat, head, tail, wc, statCmd, chmod, find, echoCmd, df,
];
