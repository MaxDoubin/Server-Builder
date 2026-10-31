/**
 * ls -l line explainer.
 *
 * Reads the long listing format of GNU coreutils ls (the POSIX ls -l
 * format, XCU "ls", STDOUT section), plus the variants people actually
 * paste: BSD and macOS ls, busybox, -i and -s prefix columns, -n, -g, -o,
 * --author, -h and --si sizes, and the --time-style forms. Each line is
 * split into fields with their offsets, so the page can point at the exact
 * characters it is explaining.
 *
 * The permission string maps back to the 12 mode bits the way GNU
 * filemode.c and BSD strmode(3) print them: s/S and t/T fold setuid,
 * setgid and sticky into the execute slots, lowercase when the execute bit
 * under them is also set.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

import { decodeAnsiC, quoteAnsiC, quotePosix } from "./shell-quote-tool";

/** Lines read before stopping. */
export const MAX_LINES = 1000;

/** Characters read before stopping. */
export const MAX_CHARS = 200000;

/**
 * GNU ls shows a time instead of a year when the timestamp is newer than
 * this many seconds and not in the future: half of an average Gregorian
 * year (31556952 / 2), from coreutils ls.c. BSD ls uses 182 days.
 */
export const SIX_MONTHS_SECONDS = 31556952 / 2;

const SETUID = 0o4000;
const SETGID = 0o2000;
const STICKY = 0o1000;

export type FieldKind =
  | "inode"
  | "blocks"
  | "type"
  | "perms"
  | "attr"
  | "links"
  | "owner"
  | "group"
  | "author"
  | "size"
  | "date"
  | "name"
  | "arrow"
  | "target";

export interface Field {
  kind: FieldKind;
  label: string;
  /** The characters of the line this field covers. */
  text: string;
  meaning: string;
  /** Offsets into the raw line, end exclusive. */
  start: number;
  end: number;
}

export interface Note {
  level: "info" | "warn" | "danger";
  text: string;
}

export interface Triplet {
  who: "Owner" | "Group" | "Others";
  chars: string;
  digit: number;
  /** One sentence per character, in order. */
  bits: { char: string; text: string }[];
}

export interface LsEntry {
  kind: "entry";
  lineNo: number;
  raw: string;
  fields: Field[];
  typeChar: string;
  typeName: string;
  /** The nine permission characters. */
  perms: string;
  attr: string;
  /** All 12 permission bits, or null when ls printed ? for them. */
  mode: number | null;
  octal: string | null;
  triplets: Triplet[] | null;
  links: number | null;
  owner: string | null;
  group: string | null;
  sizeText: string;
  name: string;
  target: string | null;
  /** The name as ls printed it, when that differs from the decoded name. */
  nameAsPrinted: string | null;
  chmod: string | null;
  chmodSymbolic: string | null;
  chmodNote: string | null;
  notes: Note[];
}

export interface LsTotal {
  kind: "total";
  lineNo: number;
  raw: string;
  value: string;
  meaning: string;
}

export interface LsHeader {
  kind: "header";
  lineNo: number;
  raw: string;
  dir: string;
}

export interface LsSkipped {
  kind: "skipped";
  lineNo: number;
  raw: string;
  reason: string;
}

export type LsLine = LsEntry | LsTotal | LsHeader | LsSkipped;

export interface LsParse {
  lines: LsLine[];
  entries: LsEntry[];
  /** True when the input was longer than MAX_LINES or MAX_CHARS. */
  truncated: boolean;
  /** Number of non-blank lines in the input. */
  lineCount: number;
}

/* ------------------------------------------------------------- the mode */

export const TYPE_NAMES: Record<string, { name: string; detail: string }> = {
  "-": { name: "Regular file", detail: "Ordinary data: text, a binary, an image, anything stored as bytes." },
  d: { name: "Directory", detail: "A table of names, each pointing at an inode." },
  l: {
    name: "Symbolic link",
    detail: "A small file whose content is a path. Opening it opens whatever that path names, if anything.",
  },
  c: {
    name: "Character device",
    detail: "A device read and written as a stream of bytes, such as a terminal, /dev/null or /dev/urandom.",
  },
  b: { name: "Block device", detail: "A device read and written in blocks, usually a disk or a partition." },
  p: {
    name: "Named pipe (FIFO)",
    detail: "Bytes written by one process are read by another, first in first out. Nothing is stored on disk.",
  },
  s: {
    name: "Unix domain socket",
    detail: "An endpoint a local service listens on, such as /run/docker.sock. Clients connect to it by path.",
  },
  D: { name: "Door", detail: "A Solaris and illumos interprocess call endpoint." },
  w: { name: "Whiteout", detail: "A BSD union mount marker that hides a file in a lower layer." },
  "?": { name: "Unknown type", detail: "ls could not determine what kind of file this is." },
};

const MODE_RE = /^([-dlcbpsDw?])([-r?][-w?][-xsS?][-r?][-w?][-xsSl?][-r?][-w?][-xtT?])([.+@]?)$/;

/** Mode bits from the nine permission characters, or null if any is ?. */
export function modeFromPerms(perms: string): number | null {
  if (perms.length !== 9 || perms.includes("?")) return null;
  let mode = 0;
  const shifts = [6, 3, 0];
  const specials = [SETUID, SETGID, STICKY];
  for (let k = 0; k < 3; k++) {
    const [r, w, x] = perms.slice(k * 3, k * 3 + 3);
    if (r === "r") mode |= 4 << shifts[k];
    if (w === "w") mode |= 2 << shifts[k];
    if (x === "x") mode |= 1 << shifts[k];
    else if (x === "s" || x === "t") mode |= (1 << shifts[k]) | specials[k];
    else if (x === "S" || x === "T" || x === "l") mode |= specials[k];
  }
  return mode;
}

/** The nine characters for a mode, as GNU ls prints them. */
export function permsFromMode(mode: number): string {
  let out = "";
  const shifts = [6, 3, 0];
  const specials = [SETUID, SETGID, STICKY];
  const letters = ["s", "s", "t"];
  for (let k = 0; k < 3; k++) {
    const trio = (mode >> shifts[k]) & 7;
    out += trio & 4 ? "r" : "-";
    out += trio & 2 ? "w" : "-";
    const x = (trio & 1) !== 0;
    if (mode & specials[k]) out += x ? letters[k] : letters[k].toUpperCase();
    else out += x ? "x" : "-";
  }
  return out;
}

export function octal4(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(4, "0");
}

/** chmod's symbolic form, for example u=rwx,g=rxs,o=rx,+t. */
export function symbolicMode(mode: number): string {
  const part = (who: string, shift: number, special: number, letter: string) => {
    const trio = (mode >> shift) & 7;
    let s = `${who}=`;
    if (trio & 4) s += "r";
    if (trio & 2) s += "w";
    if (trio & 1) s += "x";
    if (letter && mode & special) s += letter;
    return s;
  };
  // Sticky goes last as +t: BSD chmod ignores t when it is given with o alone.
  const sticky = mode & STICKY ? ",+t" : "";
  return `${part("u", 6, SETUID, "s")},${part("g", 3, SETGID, "s")},${part("o", 0, 0, "")}${sticky}`;
}

function bitText(typeChar: string, who: number, pos: number, ch: string, owner: string | null, group: string | null): string {
  const dir = typeChar === "d";
  const link = typeChar === "l";
  const whoName = ["the owner", "members of the group", "everyone else"][who];
  if (ch === "?") return "Unknown: ls could not read this file's attributes.";
  if (link) {
    return "Symlink permissions are not used on Linux, which always shows rwxrwxrwx. Access is decided by the target's mode.";
  }
  const device = typeChar === "c" || typeChar === "b";
  if (pos === 0) {
    if (ch === "-") return `No read for ${whoName}.`;
    if (dir) return `${cap(whoName)} can list the names in it.`;
    if (device) return `${cap(whoName)} can read from the device.`;
    if (typeChar === "p") return `${cap(whoName)} can open the pipe for reading.`;
    if (typeChar === "s") return `${cap(whoName)} have read set, which Linux does not check for connecting to a socket.`;
    return `${cap(whoName)} can read the contents.`;
  }
  if (pos === 1) {
    if (ch === "-") return `No write for ${whoName}.`;
    if (dir) return `${cap(whoName)} can create, delete and rename entries in it (search permission is needed too).`;
    if (device) return `${cap(whoName)} can write to the device.`;
    if (typeChar === "p") return `${cap(whoName)} can open the pipe for writing.`;
    if (typeChar === "s") return `${cap(whoName)} can connect to the socket, which on Linux needs write permission.`;
    return who === 0
      ? `${cap(whoName)} can change the contents. Deleting or renaming the file is decided by the directory, not by this bit.`
      : `${cap(whoName)} can change the contents.`;
  }
  const execText = dir
    ? `${cap(whoName)} can enter it and reach the entries inside by name.`
    : typeChar === "-"
      ? `${cap(whoName)} can run it as a program.${who === 0 ? " A script also needs read, because the interpreter has to open it." : ""}`
      : `${cap(whoName)} have execute set, which means nothing for this file type.`;
  const noExec = dir
    ? `${cap(whoName)} cannot enter it or reach anything inside, even by exact path.`
    : `No execute for ${whoName}.`;
  if (ch === "x") return execText;
  if (ch === "-") return noExec;
  if (who === 0) {
    const runAs = owner ? (owner === "root" || owner === "0" ? "root" : owner) : "the owner";
    if (ch === "s") {
      if (dir) return `${execText} setuid is also set, which Linux ignores on directories.`;
      return `${execText} setuid is also set: the program runs with the file owner's user ID (${runAs}), whoever starts it. Linux ignores setuid on #! scripts.`;
    }
    return dir
      ? `setuid is set but the owner has no search permission. Linux ignores setuid on directories.`
      : `setuid is set but the owner execute bit is not. If the group or others can execute the file it still runs as ${runAs} for them; if nobody can, the bit does nothing.`;
  }
  if (who === 1) {
    const grp = group ?? "the file's group";
    if (ch === "s") {
      return dir
        ? `${execText} setgid is also set: new files created inside get group ${grp} instead of the creator's primary group, and new subdirectories inherit setgid.`
        : `${execText} setgid is also set: the program runs with group ID ${grp}.`;
    }
    if (dir) {
      return `setgid is set (new files inherit group ${grp}) but the group has no search permission, so members cannot enter it.`;
    }
    return `setgid is set without group execute. On System V, and on Linux with the mand mount option before kernel 5.15, this marked a file for mandatory locking. Today it is usually a stray bit.${ch === "l" ? " Solaris prints this combination as l." : ""}`;
  }
  if (ch === "t") {
    return dir
      ? `${execText} The sticky bit is also set: only a file's owner, the directory's owner or root can delete or rename entries, as in /tmp.`
      : `${execText} The sticky bit is also set, which Linux ignores on files.`;
  }
  return dir
    ? `The sticky bit is set (only owners can delete their own entries) but others have no search permission.`
    : `The sticky bit is set without execute for others. Linux ignores it on files.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function triplets(typeChar: string, perms: string, owner: string | null, group: string | null): Triplet[] | null {
  const mode = modeFromPerms(perms);
  return (["Owner", "Group", "Others"] as const).map((who, k) => {
    const chars = perms.slice(k * 3, k * 3 + 3);
    return {
      who,
      chars,
      digit: mode === null ? -1 : (mode >> (6 - 3 * k)) & 7,
      bits: chars.split("").map((ch, pos) => ({ char: ch, text: bitText(typeChar, k, pos, ch, owner, group) })),
    };
  });
}

/* ------------------------------------------------------------ the fields */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthIndex(tok: string): number {
  return MONTHS.indexOf(tok.toLowerCase().replace(/\.$/, ""));
}

interface Tok {
  text: string;
  start: number;
  end: number;
}

interface DateMatch {
  count: number;
  style: "recent" | "old" | "bsd-full" | "long-iso" | "full-iso" | "iso-recent" | "iso-old" | "unknown";
  year: number | null;
  month: number | null; // 0-based
  day: number | null;
  hour: number | null;
  minute: number | null;
}

const DAY_RE = /^(?:[1-9]|[12]\d|3[01]|0[1-9])$/;
const HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const HMS_RE = /^([01]?\d|2[0-3]):([0-5]\d):([0-5]\d|60)(?:\.\d+)?$/;
const YEAR_RE = /^\d{4}$/;
const ISO_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_MD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ZONE_RE = /^[+-]\d{4}$/;

/** Tries every supported timestamp layout at token k. */
function matchDate(t: Tok[], k: number): DateMatch | null {
  const a = t[k]?.text;
  const b = t[k + 1]?.text;
  const c = t[k + 2]?.text;
  const d = t[k + 3]?.text;
  if (a === undefined) return null;
  const iso = ISO_DATE_RE.exec(a);
  if (iso && b !== undefined) {
    const hms = HMS_RE.exec(b);
    if (hms && c !== undefined && ZONE_RE.test(c) && d !== undefined) {
      return { count: 3, style: "full-iso", year: +iso[1], month: +iso[2] - 1, day: +iso[3], hour: +hms[1], minute: +hms[2] };
    }
    const hm = HM_RE.exec(b);
    if (hm && c !== undefined) {
      return { count: 2, style: "long-iso", year: +iso[1], month: +iso[2] - 1, day: +iso[3], hour: +hm[1], minute: +hm[2] };
    }
    return { count: 1, style: "iso-old", year: +iso[1], month: +iso[2] - 1, day: +iso[3], hour: null, minute: null };
  }
  const md = ISO_MD_RE.exec(a);
  if (md && b !== undefined && c !== undefined) {
    const hm = HM_RE.exec(b);
    if (hm) return { count: 2, style: "iso-recent", year: null, month: +md[1] - 1, day: +md[2], hour: +hm[1], minute: +hm[2] };
  }
  // Month and day, in either order.
  let month = -1;
  let day = "";
  if (monthIndex(a) >= 0 && b !== undefined && DAY_RE.test(b)) {
    month = monthIndex(a);
    day = b;
  } else if (DAY_RE.test(a) && b !== undefined && monthIndex(b) >= 0) {
    month = monthIndex(b);
    day = a;
  }
  if (month >= 0 && c !== undefined) {
    const hms = HMS_RE.exec(c);
    if (hms && d !== undefined && YEAR_RE.test(d) && t[k + 4]) {
      return { count: 4, style: "bsd-full", year: +d, month, day: +day, hour: +hms[1], minute: +hms[2] };
    }
    const hm = HM_RE.exec(c);
    if (hm && t[k + 3]) return { count: 3, style: "recent", year: null, month, day: +day, hour: +hm[1], minute: +hm[2] };
    if (YEAR_RE.test(c) && t[k + 3]) return { count: 3, style: "old", year: +c, month, day: +day, hour: null, minute: null };
  }
  if (a === "?" && b !== undefined && b !== "?") return { count: 1, style: "unknown", year: null, month: null, day: null, hour: null, minute: null };
  return null;
}

const SIZE_PLAIN = /^\d+$/;
const SIZE_HUMAN = /^\d+(?:[.,]\d+)?(?:[KMGTPEZYRQ](?:i?B)?|kB?|B)$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function bytesHuman(n: number): string {
  if (n < 1024) return "";
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
  let v = n;
  let u = -1;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return ` (${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[u]})`;
}

/** Linux device numbers from Documentation/admin-guide/devices.txt that are fixed, not dynamic. */
function linuxDevice(typeChar: string, major: number, minor: number): string | null {
  if (typeChar === "c") {
    if (major === 1) {
      const mem: Record<number, string> = {
        1: "/dev/mem, physical memory",
        2: "/dev/kmem, kernel virtual memory",
        3: "/dev/null, which discards writes and reads as end of file",
        4: "/dev/port, I/O port access",
        5: "/dev/zero, an endless source of zero bytes",
        7: "/dev/full, which fails every write with ENOSPC",
        8: "/dev/random, the kernel random number generator",
        9: "/dev/urandom, the kernel random number generator",
        11: "/dev/kmsg, the kernel log",
      };
      return mem[minor] ? `On Linux, character 1,${minor} is ${mem[minor]}.` : "On Linux, character major 1 is the memory devices.";
    }
    if (major === 4) {
      if (minor === 0) return "On Linux, character 4,0 is /dev/tty0, the current virtual console.";
      if (minor < 64) return `On Linux, character 4,${minor} is /dev/tty${minor}, a virtual console.`;
      return `On Linux, character 4,${minor} is /dev/ttyS${minor - 64}, a serial port.`;
    }
    if (major === 5) {
      const alt: Record<number, string> = { 0: "/dev/tty, the calling process's controlling terminal", 1: "/dev/console", 2: "/dev/ptmx, the pseudo-terminal multiplexer" };
      if (alt[minor]) return `On Linux, character 5,${minor} is ${alt[minor]}.`;
    }
    if (major === 10) return "On Linux, character major 10 is the misc driver; the minor selects one small device, such as fuse or tun.";
    if (major >= 136 && major <= 143) return `On Linux, character majors 136 to 143 are pseudo-terminal replicas: this is /dev/pts/${(major - 136) * 256 + minor}.`;
    return null;
  }
  if (typeChar === "b") {
    if (major === 7) return `On Linux, block major 7 is the loop driver: this is /dev/loop${minor}.`;
    if (major === 8 && minor < 256) {
      const disk = Math.floor(minor / 16);
      const part = minor % 16;
      const letter = String.fromCharCode(97 + disk);
      return `On Linux, block major 8 is SCSI, SATA and USB disks, 16 minors per disk: this is /dev/sd${letter}${part ? part : ""}${part ? `, partition ${part}` : ", the whole disk"}.`;
    }
    if (major === 11) return `On Linux, block major 11 is SCSI CD-ROM drives: this is /dev/sr${minor}.`;
    if (major === 259) return "On Linux, block major 259 is the extended block range, used by NVMe namespaces and partitions.";
    return null;
  }
  return null;
}

/* ------------------------------------------------------------ the name */

/** End index of one shell word starting at i, honoring quotes; -1 if a quote is open. */
function shellWordEnd(s: string, i: number): number {
  while (i < s.length && s[i] !== " " && s[i] !== "\t") {
    if (s[i] === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) return -1;
      i = j + 1;
    } else if (s[i] === "$" && s[i + 1] === "'") {
      let j = i + 2;
      while (j < s.length && s[j] !== "'") j += s[j] === "\\" ? 2 : 1;
      if (j >= s.length) return -1;
      i = j + 1;
    } else if (s[i] === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
      if (j >= s.length) return -1;
      i = j + 1;
    } else if (s[i] === "\\") {
      i += 2;
    } else i++;
  }
  return Math.min(i, s.length);
}

/**
 * Removes the quoting GNU ls adds in its shell and shell-escape styles (the
 * default on a terminal since coreutils 8.25): '...', "..." and $'...'.
 * Returns null if the text is not exactly one such quoted word.
 */
export function unquoteLsName(s: string): string | null {
  if (!/^(?:'|"|\$')/.test(s)) return null;
  if (shellWordEnd(s, 0) !== s.length) return null;
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "'") {
      const j = s.indexOf("'", i + 1);
      out += s.slice(i + 1, j);
      i = j + 1;
    } else if (s[i] === "$" && s[i + 1] === "'") {
      let j = i + 2;
      while (s[j] !== "'") j += s[j] === "\\" ? 2 : 1;
      out += decodeAnsiC(s.slice(i + 2, j)).value;
      i = j + 1;
    } else if (s[i] === '"') {
      let j = i + 1;
      let part = "";
      while (s[j] !== '"') {
        if (s[j] === "\\" && "$`\"\\".includes(s[j + 1])) {
          part += s[j + 1];
          j += 2;
        } else {
          part += s[j];
          j++;
        }
      }
      out += part;
      i = j + 1;
    } else if (s[i] === "\\") {
      out += s[i + 1] ?? "";
      i += 2;
    } else {
      out += s[i];
      i++;
    }
  }
  return out;
}

interface NameParts {
  name: string;
  nameRaw: string;
  nameStart: number;
  nameEnd: number;
  target: string | null;
  targetRaw: string | null;
  targetStart: number;
  arrowStart: number;
  ambiguousArrow: boolean;
}

function splitName(line: string, start: number, isLink: boolean): NameParts {
  const rest = line.slice(start);
  const base: NameParts = {
    name: rest,
    nameRaw: rest,
    nameStart: start,
    nameEnd: line.length,
    target: null,
    targetRaw: null,
    targetStart: -1,
    arrowStart: -1,
    ambiguousArrow: false,
  };
  // Quoted by ls: read exactly one shell word for the name.
  if (/^(?:'|"|\$')/.test(rest)) {
    const end = shellWordEnd(rest, 0);
    if (end > 0) {
      const nameRaw = rest.slice(0, end);
      const name = unquoteLsName(nameRaw);
      if (name !== null) {
        if (end === rest.length) return { ...base, name, nameRaw, nameEnd: start + end };
        if (isLink && rest.startsWith(" -> ", end)) {
          const targetRaw = rest.slice(end + 4);
          const target = unquoteLsName(targetRaw) ?? targetRaw;
          return {
            ...base,
            name,
            nameRaw,
            nameEnd: start + end,
            arrowStart: start + end + 1,
            target,
            targetRaw,
            targetStart: start + end + 4,
          };
        }
      }
    }
  }
  if (isLink) {
    const at = rest.indexOf(" -> ");
    if (at >= 0) {
      const targetRaw = rest.slice(at + 4);
      const quotedTarget = unquoteLsName(targetRaw);
      return {
        ...base,
        name: rest.slice(0, at),
        nameRaw: rest.slice(0, at),
        nameEnd: start + at,
        arrowStart: start + at + 1,
        target: quotedTarget ?? targetRaw,
        targetRaw,
        targetStart: start + at + 4,
        ambiguousArrow: rest.indexOf(" -> ", at + 4) >= 0,
      };
    }
  }
  return base;
}

/* ------------------------------------------------------------- one line */

function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

function quoteForCommand(name: string): string {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(name) ? quoteAnsiC(name) : quotePosix(name, true);
}

const SAFE_WORLD_WRITABLE_CHAR = new Set(["null", "zero", "full", "random", "urandom", "tty", "ptmx"]);

function wallClock(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
}

function describeDate(m: DateMatch, now: Date | null): string {
  const which =
    " It is the modification time unless the listing used -c (status change time), -u (access time) or --time=birth.";
  const hm = m.hour !== null && m.minute !== null ? `${pad2(m.hour)}:${pad2(m.minute)}` : "";
  const dayText = m.month !== null && m.day !== null ? `${MONTH_NAMES[m.month]} ${m.day}` : "";
  switch (m.style) {
    case "recent":
    case "iso-recent": {
      let text = `${dayText} at ${hm}, with no year. ls prints the time instead of the year when a timestamp is less than about six months old and not in the future (GNU uses half of 365.2425 days, BSD 182 days).`;
      if (now && m.month !== null && m.day !== null && m.hour !== null && m.minute !== null) {
        const nowWall = wallClock(now);
        let year = now.getFullYear();
        let when = Date.UTC(year, m.month, m.day, m.hour, m.minute);
        if (when > nowWall + 86400000) {
          year -= 1;
          when = Date.UTC(year, m.month, m.day, m.hour, m.minute);
        }
        if ((nowWall - when) / 1000 > SIX_MONTHS_SECONDS + 86400) {
          text += ` Read against today's date that would be ${year}, more than six months ago, so this listing was made on an earlier day.`;
        } else {
          text += ` If the listing was made today, that means ${year}.`;
        }
      }
      return text + which;
    }
    case "old": {
      let text = `${dayText}, ${m.year}, with no time of day. ls prints the year instead of the time when a timestamp is more than about six months old, or when it is in the future.`;
      if (now && m.year !== null && m.month !== null && m.day !== null && Date.UTC(m.year, m.month, m.day) > wallClock(now)) {
        text +=
          " This one is ahead of today's date, which usually means a wrong clock when the file was written, an archive that restored its stored times, or touch -d.";
      }
      return text + which;
    }
    case "bsd-full":
      return `${dayText}, ${m.year} at ${hm} with seconds, the full form BSD and macOS ls print with -T.${which}`;
    case "long-iso":
      return `${m.year}-${pad2((m.month ?? 0) + 1)}-${pad2(m.day ?? 0)} ${hm}, from --time-style=long-iso, which always shows the year.${which}`;
    case "full-iso":
      return `Full timestamp with nanoseconds and the UTC offset, from --full-time or --time-style=full-iso. Many file systems store nanoseconds; the zeros at the end on some mean they do not.${which}`;
    case "iso-old":
      return `${dayText}, ${m.year}, from --time-style=iso, which shows only the date for timestamps older than about six months.${which}`;
    default:
      return "ls printed ? because it could not read this entry's attributes.";
  }
}

function explainEntry(line: string, lineNo: number, t: Tok[], m: number, now: Date | null): LsEntry | LsSkipped {
  const skip = (reason: string): LsSkipped => ({ kind: "skipped", lineNo, raw: line, reason });
  const modeTok = t[m];
  const mm = MODE_RE.exec(modeTok.text);
  if (!mm) return skip("Not an ls -l entry.");
  const [, typeChar, perms, attr] = mm;
  const fields: Field[] = [];
  const notes: Note[] = [];

  // Prefix columns from -i and -s.
  const prefix = t.slice(0, m);
  prefix.forEach((p, k) => {
    const both = prefix.length === 2;
    const isInode = both ? k === 0 : false;
    if (both) {
      fields.push(
        isInode
          ? {
              kind: "inode",
              label: "Inode",
              text: p.text,
              meaning: "Inode number, from ls -i. Two names with the same inode number on the same file system are hard links to one file.",
              start: p.start,
              end: p.end,
            }
          : {
              kind: "blocks",
              label: "Blocks",
              text: p.text,
              meaning: "Space allocated on disk, from ls -s, in 1 KiB units on GNU (512-byte units on BSD) unless a block size was set. It can be less than the size for a sparse file and more for a small one.",
              start: p.start,
              end: p.end,
            },
      );
    } else {
      fields.push({
        kind: SIZE_PLAIN.test(p.text) ? "inode" : "blocks",
        label: SIZE_PLAIN.test(p.text) ? "Inode or blocks" : "Blocks",
        text: p.text,
        meaning: SIZE_PLAIN.test(p.text)
          ? "A column ls adds in front with -i (the inode number) or -s (allocated blocks). A large number is usually an inode; a small one that tracks file size is usually blocks."
          : "Space allocated on disk, from ls -s with -h.",
        start: p.start,
        end: p.end,
      });
    }
  });

  const typeInfo = TYPE_NAMES[typeChar] ?? TYPE_NAMES["?"];
  fields.push({
    kind: "type",
    label: "File type",
    text: typeChar,
    meaning: `${typeInfo.name}. ${typeInfo.detail}`,
    start: modeTok.start,
    end: modeTok.start + 1,
  });
  fields.push({
    kind: "perms",
    label: "Permissions",
    text: perms,
    meaning: "Three groups of three: owner, group, others. Each is read, write, execute, with s, S, t or T in the execute slot when setuid, setgid or sticky is set.",
    start: modeTok.start + 1,
    end: modeTok.start + 10,
  });
  if (attr) {
    const attrText: Record<string, string> = {
      "+": "The file has an access control list or another extra access method (GNU, and macOS for an ACL). The rwx shown are not the whole story: getfacl lists the entries. With an ACL, the group triplet shows the ACL mask, the most any named user or group entry can grant, not the owning group's own entry.",
      ".": "GNU ls: the file has an SELinux security context and no other extra access method. ls -Z shows the context.",
      "@": "macOS: the file has extended attributes, such as com.apple.quarantine on a download. ls -l@ or xattr -l lists them.",
    };
    fields.push({
      kind: "attr",
      label: attr === "@" ? "Extended attributes" : attr === "+" ? "ACL" : "Security context",
      text: attr,
      meaning: attrText[attr],
      start: modeTok.start + 10,
      end: modeTok.end,
    });
  }

  const linksTok = t[m + 1];
  if (!linksTok || !/^(?:\d+|\?)$/.test(linksTok.text)) {
    return skip(`Found the mode ${modeTok.text}, but the next field should be the hard link count, a number.`);
  }

  // Find the timestamp, and with it the owner, group and size before it.
  let dateAt = -1;
  let date: DateMatch | null = null;
  let sizeStart = -1;
  for (let k = m + 3; k <= Math.min(t.length - 1, m + 8); k++) {
    const dm = matchDate(t, k);
    if (!dm) continue;
    const prev = t[k - 1].text;
    const prev2 = k - 2 > m + 1 ? t[k - 2].text : "";
    const device = typeChar === "c" || typeChar === "b";
    let s = -1;
    if (device && /^\d+,$/.test(prev2) && /^(?:\d+|0x[0-9a-fA-F]+)$/.test(prev)) s = k - 2;
    else if (device && /^\d+,(?:\d+|0x[0-9a-fA-F]+)$/.test(prev)) s = k - 1;
    else if (SIZE_PLAIN.test(prev) || SIZE_HUMAN.test(prev) || prev === "?") s = k - 1;
    if (s < 0) continue;
    const names = s - (m + 2);
    if (names < 0 || names > 3) continue;
    dateAt = k;
    date = dm;
    sizeStart = s;
    break;
  }
  if (!date || dateAt < 0) {
    return skip(
      "Found the mode and link count but no timestamp in a layout this reads: Oct 31 14:22, Oct 31 2024, 2024-10-31 14:22 (long-iso), full-iso, iso, and the macOS -T form, in English month names.",
    );
  }

  const links = linksTok.text === "?" ? null : Number(linksTok.text);
  let linksMeaning: string;
  if (links === null) linksMeaning = "Unknown: ls could not read the entry.";
  else if (typeChar === "d") {
    linksMeaning =
      links >= 2
        ? `Hard links to this directory: its name in the parent, its own . entry, and the .. inside each subdirectory. ${links} - 2 = ${links - 2} ${links - 2 === 1 ? "subdirectory" : "subdirectories"}, on file systems such as ext4 and XFS that keep this count.`
        : "A directory showing 1 means the file system does not track the count: Btrfs always reports 1, and ext4 switches to 1 once a directory holds more than 65,000 subdirectories.";
  } else if (typeChar === "l") {
    linksMeaning = "Hard links to the symlink itself, not to its target. Almost always 1.";
  } else if (links > 1) {
    linksMeaning =
      typeChar === "-"
        ? `${links} names point at this one inode. They are the same file: a change through any name shows through all of them, and the data is freed only when the last name is removed. find / -xdev -samefile on one name lists the others.`
        : `${links} names point at this one inode, and all of them are the same object.`;
  } else {
    linksMeaning =
      typeChar === "-"
        ? "One name points at this inode. Removing it frees the data once no process has the file open."
        : "One name points at this inode.";
  }
  fields.push({ kind: "links", label: "Hard links", text: linksTok.text, meaning: linksMeaning, start: linksTok.start, end: linksTok.end });

  const nameToks = t.slice(m + 2, sizeStart);
  let owner: string | null = null;
  let group: string | null = null;
  const numericNote = (v: string, what: "user" | "group") =>
    /^\d+$/.test(v)
      ? ` A number here means ls -n was used, or no ${what} with ID ${v} exists in ${what === "user" ? "/etc/passwd" : "/etc/group"} or the directory service: a deleted account, or files unpacked from another machine. A new ${what} created later with ID ${v} would own these files.`
      : "";
  nameToks.forEach((tok, k) => {
    if (nameToks.length === 1) {
      owner = tok.text;
      fields.push({
        kind: "owner",
        label: "Owner (or group)",
        text: tok.text,
        meaning: `Only one name column: ls -o hides the group and leaves the owner, ls -g hides the owner and leaves the group.${numericNote(tok.text, "user")}`,
        start: tok.start,
        end: tok.end,
      });
    } else if (k === 0) {
      owner = tok.text;
      fields.push({
        kind: "owner",
        label: "Owner",
        text: tok.text,
        meaning: `The user who owns the file. The first permission triplet applies to this user.${tok.text === "root" ? " Owned by root." : ""}${numericNote(tok.text, "user")}`,
        start: tok.start,
        end: tok.end,
      });
    } else if (k === 1) {
      group = tok.text;
      fields.push({
        kind: "group",
        label: "Group",
        text: tok.text,
        meaning: `The file's group. The second triplet applies to members of it who are not the owner.${numericNote(tok.text, "group")}`,
        start: tok.start,
        end: tok.end,
      });
    } else {
      fields.push({
        kind: "author",
        label: "Author",
        text: tok.text,
        meaning: "From GNU ls --author. Only the GNU Hurd records a separate author; elsewhere this repeats the owner.",
        start: tok.start,
        end: tok.end,
      });
    }
  });

  const sizeToks = t.slice(sizeStart, dateAt);
  const sizeText = sizeToks.map((x) => x.text).join(" ");
  const sizeSpan = { start: sizeToks[0].start, end: sizeToks[sizeToks.length - 1].end };
  const lastDateTok = t[dateAt + date.count - 1];
  const name = splitName(line, line.slice(lastDateTok.end).search(/\S/) + lastDateTok.end, typeChar === "l");
  if (name.nameRaw.trim() === "") return skip("The line ends after the timestamp, with no file name.");

  let sizeMeaning: string;
  if (typeChar === "c" || typeChar === "b") {
    const nums = sizeText.replace(/\s+/g, "").split(",");
    const major = Number(nums[0]);
    const minor = /^0x/i.test(nums[1] ?? "") ? parseInt(nums[1], 16) : Number(nums[1]);
    const known = Number.isFinite(major) && Number.isFinite(minor) ? linuxDevice(typeChar, major, minor) : null;
    sizeMeaning = `A device has no size here. ls prints its major and minor numbers instead: major ${nums[0]} picks the driver, minor ${nums[1] ?? "?"} picks the device that driver handles.${known ? ` ${known}` : ""}`;
  } else if (sizeText === "?") {
    sizeMeaning = "Unknown: ls could not read the entry.";
  } else if (SIZE_PLAIN.test(sizeText)) {
    const bytes = Number(sizeText);
    if (typeChar === "d") {
      sizeMeaning = `${plural(bytes, "byte", "bytes")}: the size of the directory's own table of names, not of what is in it. On ext4 a small directory is one 4,096-byte block. du -sh measures the contents.`;
    } else if (typeChar === "l") {
      const len = name.target !== null ? utf8Length(name.target) : null;
      sizeMeaning = `${plural(bytes, "byte", "bytes")}: the length of the target path stored in the link.${
        len === null ? "" : len === bytes ? ` The target shown is exactly ${plural(len, "byte", "bytes")}, which matches.` : ` The target as shown is ${plural(len, "byte", "bytes")}; a mismatch usually means ls escaped or replaced characters in it.`
      }`;
    } else if (typeChar === "p" || typeChar === "s") {
      sizeMeaning = `${plural(bytes, "byte", "bytes")}. Pipes and sockets hold nothing on disk; data passes through kernel buffers, so 0 is normal.`;
    } else {
      sizeMeaning = `${plural(bytes, "byte", "bytes")}${bytesHuman(bytes)}. This is the logical length. Allocated space can differ: ls -s or du shows it.`;
    }
  } else {
    const si = /^\d+(?:[.,]\d+)?k/.test(sizeText);
    sizeMeaning = si
      ? "A --si size: powers of 1000, with a lowercase k for kilo. ls rounds up, so the exact size is at most this."
      : "A human readable size from ls -h: K, M and G are powers of 1024 (KiB, MiB, GiB). ls rounds up, so the exact size is at most this. Without -h the column is exact bytes.";
  }
  fields.push({
    kind: "size",
    label: typeChar === "c" || typeChar === "b" ? "Major, minor" : "Size",
    text: sizeText,
    meaning: sizeMeaning,
    start: sizeSpan.start,
    end: sizeSpan.end,
  });

  const dateToks = t.slice(dateAt, dateAt + date.count);
  fields.push({
    kind: "date",
    label: "Timestamp",
    text: line.slice(dateToks[0].start, lastDateTok.end),
    meaning: describeDate(date, now),
    start: dateToks[0].start,
    end: lastDateTok.end,
  });

  const printedDiffers = name.nameRaw !== name.name;
  let nameMeaning =
    name.name === "."
      ? "The directory itself. Shown with ls -a."
      : name.name === ".."
        ? "The parent directory. Shown with ls -a; its mode and owner are the parent's."
        : name.name.startsWith(".")
          ? "A hidden name: it starts with a dot, so plain ls skips it and -a or -A shows it."
          : "The file's name in this directory. The name lives in the directory, not in the inode, which is how one file can have several names.";
  if (printedDiffers) {
    nameMeaning += ` ls quoted it for the terminal (the shell-escape style, the default on a terminal since coreutils 8.25); the real name is ${JSON.stringify(name.name)}.`;
  }
  if (/[\u0000-\u001f\u007f]/.test(name.name)) {
    nameMeaning += " The name contains control characters, which can hide or rewrite text on a terminal.";
  }
  fields.push({ kind: "name", label: "Name", text: name.nameRaw, meaning: nameMeaning, start: name.nameStart, end: name.nameEnd });
  if (name.target !== null && name.targetRaw !== null) {
    fields.push({
      kind: "arrow",
      label: "Arrow",
      text: "->",
      meaning: "ls -l prints the link's stored path after an arrow.",
      start: name.arrowStart,
      end: name.arrowStart + 2,
    });
    const abs = name.target.startsWith("/");
    fields.push({
      kind: "target",
      label: "Target",
      text: name.targetRaw,
      meaning: `${abs ? "An absolute path" : "A relative path, resolved from the directory that holds the link, not from your current directory"}. The target need not exist: a dangling link is listed the same way, and ls -L or stat -L follows it.${name.ambiguousArrow ? " The text contains more than one ' -> ', so where the name ends and the target starts is a guess." : ""}`,
      start: name.targetStart,
      end: line.length,
    });
  }

  // The mode, the octal and the chmod that would reproduce it.
  const mode = modeFromPerms(perms);
  const octal = mode === null ? null : octal4(mode);
  const quoted = quoteForCommand(name.name);
  let chmod: string | null = null;
  let chmodSymbolic: string | null = null;
  let chmodNote: string | null = null;
  if (mode !== null && typeChar === "l") {
    chmodNote =
      "chmod follows a symlink and changes its target. Linux has no way to change a link's own mode and never uses it; macOS chmod -h changes the link itself.";
  } else if (mode !== null) {
    chmod = `chmod ${octal} ${quoted}`;
    chmodSymbolic = `chmod ${symbolicMode(mode)} ${quoted}`;
    if (typeChar === "d" && (mode & (SETUID | SETGID)) === 0) {
      chmodNote =
        "GNU chmod keeps a directory's existing setuid and setgid bits when given a numeric mode, so this will not clear a setgid bit already on it. chmod 0" +
        octal +
        " or chmod g-s does.";
    } else if (typeChar !== "d" && mode & (SETUID | SETGID)) {
      chmodNote =
        "On Linux, chown clears setuid and setgid, and a write by a process without CAP_FSETID clears setuid, so apply this mode after the last chown or edit.";
    }
  }

  // Notes worth raising.
  if (mode !== null && typeChar !== "l") {
    const o = (mode >> 6) & 7;
    const g = (mode >> 3) & 7;
    const w = mode & 7;
    if (typeChar === "-" && mode & 0o002) {
      notes.push({ level: "danger", text: "World-writable: every account on the system, and every service running as one, can change this file." });
    }
    if (typeChar === "d" && mode & 0o002) {
      notes.push(
        mode & STICKY
          ? { level: "info", text: "World-writable with the sticky bit, the /tmp pattern: anyone can create files, only owners can delete theirs." }
          : { level: "danger", text: "World-writable without the sticky bit: anyone can delete or rename anyone else's files in it, and replace them with their own." },
      );
    }
    if (typeChar === "-" && mode & (SETUID | SETGID)) {
      const writable = (mode & 0o022) !== 0;
      notes.push(
        writable
          ? { level: "danger", text: "A setuid or setgid file that the group or others can write: whoever can edit it chooses what runs with its owner's privileges." }
          : { level: "warn", text: `A ${mode & SETUID ? "setuid" : "setgid"} program. Each one is a path to the ${mode & SETUID ? "owner's" : "group's"} privileges and worth an audit: find / -xdev -perm /6000 -type f lists them.` },
      );
    }
    if (typeChar === "b" && (w & 6 || g & 6)) {
      const cls = w & 6 ? w : g;
      const verbs = [cls & 4 ? "read" : "", cls & 2 ? "write" : ""].filter(Boolean).join(" and ");
      notes.push({
        level: w & 6 ? "danger" : "warn",
        text: `${w & 6 ? "Everyone" : `Members of group ${group ?? "this group"}`} can ${verbs} the raw device. That goes around file permissions entirely: reading a disk directly reads every file on it, /etc/shadow included, and writing it can change any of them.${w & 6 ? "" : " Membership in that group is close to root."}`,
      });
    }
    if (typeChar === "c" && mode & 0o002) {
      const base = name.name.split("/").pop() ?? name.name;
      notes.push(
        SAFE_WORLD_WRITABLE_CHAR.has(base)
          ? { level: "info", text: `World-writable is the normal mode for ${base}.` }
          : { level: "warn", text: "A world-writable character device. Normal for /dev/null, /dev/zero, /dev/tty and similar; worth checking for anything else." },
      );
    }
    if (typeChar === "s" && mode & 0o022) {
      notes.push({
        level: "warn",
        text: `Connecting to a Unix socket needs write permission on it, so this mode decides who can talk to the service behind it.${/docker\.sock$/.test(name.name) ? " Access to docker.sock is equivalent to root on the host." : ""}`,
      });
    }
    if ((g & ~o) !== 0 || (w & ~o) !== 0 || (w & ~g) !== 0) {
      notes.push({
        level: "info",
        text: "A later class has a permission an earlier one lacks. The kernel checks only the first class that matches (owner, then group, then others), so the owner does not get the others bits, and a group member does not get them either.",
      });
    }
    if (typeChar === "-" && /(^|\/)(id_(rsa|dsa|ecdsa|ed25519)(_sk)?|[^/]+\.key)$/.test(name.name) && (mode & 0o077) !== 0) {
      notes.push({
        level: "warn",
        text: "This looks like a private key that the group or others can access. OpenSSH refuses to use a private key file with any group or other bits set; chmod 600 fixes it.",
      });
    }
  }
  if (perms.includes("?")) {
    notes.push({
      level: "info",
      text: "Question marks mean ls read the name from the directory but could not stat the entry. That happens when you have read permission on a directory but not search (x): you can list the names but not look at what they point to.",
    });
  }
  if (typeChar === "l" && perms !== "rwxrwxrwx") {
    notes.push({ level: "info", text: "Linux always shows rwxrwxrwx for a symlink. Other modes come from BSD or macOS, where a link has its own mode." });
  }

  return {
    kind: "entry",
    lineNo,
    raw: line,
    fields,
    typeChar,
    typeName: typeInfo.name,
    perms,
    attr,
    mode,
    octal,
    triplets: triplets(typeChar, perms, owner, group),
    links,
    owner,
    group,
    sizeText,
    name: name.name,
    target: name.target,
    nameAsPrinted: printedDiffers ? name.nameRaw : null,
    chmod,
    chmodSymbolic,
    chmodNote,
    notes,
  };
}

function explainTotal(line: string, lineNo: number, value: string, blocksSum: number | null): LsTotal {
  const human = !/^\d+$/.test(value);
  let meaning =
    "The disk space allocated to the entries listed below, counted from each file's block count, not added up from the sizes. GNU ls counts in 1 KiB units (512-byte units with POSIXLY_CORRECT, or whatever --block-size says); BSD and macOS count 512-byte blocks. A small file still takes a whole file system block, usually 4 KiB, and a sparse file can take less than its size. With -a it includes . and ..; listing files by name instead of a directory prints no total.";
  if (human) meaning += ` ${value} is a human readable figure from -h.`;
  if (blocksSum !== null) {
    meaning +=
      blocksSum === Number(value)
        ? ` The -s column adds up to ${blocksSum}, which matches.`
        : ` The -s column adds up to ${blocksSum}, not ${value}, so the block columns were probably printed in different units or some lines are missing.`;
  }
  return { kind: "total", lineNo, raw: line, value, meaning };
}

/** Parses a pasted listing. `now` is used only to say what year a recent date means. */
export function parseListing(text: string, now: Date | null = null): LsParse {
  let src = text;
  let truncated = false;
  if (src.length > MAX_CHARS) {
    src = src.slice(0, MAX_CHARS);
    truncated = true;
  }
  const rawLines = src.replace(/\r\n?/g, "\n").split("\n");
  const lines: LsLine[] = [];
  let lineCount = 0;
  const totals: { line: string; lineNo: number; value: string; at: number }[] = [];

  for (let idx = 0; idx < rawLines.length; idx++) {
    const line = rawLines[idx].replace(/\s+$/, "");
    if (line.trim() === "") continue;
    lineCount++;
    if (lineCount > MAX_LINES) {
      truncated = true;
      break;
    }
    const lineNo = idx + 1;
    const total = /^\s*total\s+(\d+(?:[.,]\d+)?[KMGTPEZYkB]?)\s*$/.exec(line);
    if (total) {
      totals.push({ line, lineNo, value: total[1], at: lines.length });
      lines.push(explainTotal(line, lineNo, total[1], null));
      continue;
    }
    const toks: Tok[] = [];
    for (const mt of line.matchAll(/\S+/g)) toks.push({ text: mt[0], start: mt.index ?? 0, end: (mt.index ?? 0) + mt[0].length });
    let m = -1;
    for (let k = 0; k < Math.min(3, toks.length); k++) {
      if (MODE_RE.test(toks[k].text)) {
        m = k;
        break;
      }
      if (!SIZE_PLAIN.test(toks[k].text) && !SIZE_HUMAN.test(toks[k].text)) break;
    }
    if (m >= 0) {
      lines.push(explainEntry(line, lineNo, toks, m, now));
      continue;
    }
    if (/:$/.test(line) && !/^\s/.test(line)) {
      lines.push({ kind: "header", lineNo, raw: line, dir: line.slice(0, -1) });
      continue;
    }
    let reason = "Not an ls -l entry, so it was skipped.";
    if (/^[.][-r][-w][-xsS]/.test(toks[0]?.text ?? "")) {
      reason = "This looks like eza or exa output, which marks a regular file with . and uses a different column layout. Run plain ls -l for this page.";
    } else if (/^\$|^#|^ls\b/.test(line.trim())) {
      reason = "This looks like the command itself rather than its output.";
    } else if (toks.length <= 2 && lines.length && lines[lines.length - 1].kind === "entry") {
      reason = "Not an ls -l entry. If the previous file name contains a newline, ls prints the rest of it here when its output is not a terminal; on a terminal it would show $'\\n' instead.";
    } else if (/^[-dlcbps][-rwxsStT]{8,10}\S*$/.test(toks[0]?.text ?? "")) {
      reason = `The first field, ${toks[0].text}, is close to a mode string but not one: it should be a type character followed by exactly nine of r, w, x, s, S, t, T or -.`;
    }
    lines.push({ kind: "skipped", lineNo, raw: line, reason });
  }

  const entries = lines.filter((l): l is LsEntry => l.kind === "entry");

  // With -s, the blocks column should add up to the total line. When there
  // is a single prefix column, a matching sum also settles that it is -s.
  for (const pendingTotal of totals) {
    const start = pendingTotal.lineNo;
    const next = lines.find((l) => l.lineNo > start && l.kind === "total");
    const after = entries.filter((e) => e.lineNo > start && (!next || e.lineNo < next.lineNo));
    const blockField = (e: LsEntry) =>
      e.fields.find((f) => f.kind === "blocks") ?? e.fields.find((f) => f.kind === "inode" && f.label === "Inode or blocks");
    if (after.length > 0 && after.every((e) => /^\d+$/.test(blockField(e)?.text ?? ""))) {
      const sum = after.reduce((acc, e) => acc + Number(blockField(e)!.text), 0);
      const value = Number(pendingTotal.value);
      if (sum === value) {
        for (const e of after) {
          const f = blockField(e)!;
          if (f.kind === "inode") {
            f.kind = "blocks";
            f.label = "Blocks";
            f.meaning =
              "Space allocated on disk, from ls -s: this column adds up to the total line, so it is blocks rather than inode numbers. GNU counts 1 KiB units, BSD 512-byte units, unless a block size was set.";
          }
        }
      }
      if (sum === value || after.every((e) => e.fields.some((f) => f.kind === "blocks"))) {
        lines[pendingTotal.at] = explainTotal(pendingTotal.line, pendingTotal.lineNo, pendingTotal.value, sum);
      }
    }
  }

  return { lines, entries, truncated, lineCount: Math.min(lineCount, MAX_LINES) };
}

/** A listing that shows most of what ls -l can print. */
export const EXAMPLE_LISTING = [
  "total 64",
  "drwxr-xr-x   6 max  staff   4096 Oct 30 14:22 .",
  "drwxr-xr-x  22 root root    4096 Jan  3  2025 ..",
  "-rw-r--r--.  1 max  staff    220 Mar  5  2024 .bash_logout",
  "-rwxr-x---+  1 max  devs    8432 Oct 12 09:05 deploy.sh",
  "lrwxrwxrwx   1 max  staff     11 Sep 28 18:40 current -> releases/v3",
  "drwxrwsr-x   2 max  devs    4096 Oct 29 11:17 shared",
  "drwxrwxrwt  12 root root    4096 Oct 31 08:01 tmp",
  "-rwsr-xr-x   1 root root   59976 Feb  6  2024 passwd",
  "-rw-r--r--   2 max  staff   1532 Aug 14 16:20 notes.txt",
  "-rw-rw-rw-   1 1003 1003     512 Jul  2 10:45 orphan.log",
  "crw-rw-rw-   1 root root   1,   3 Oct 31 07:58 null",
  "brw-rw----   1 root disk   8,   1 Oct 31 07:58 sda1",
  "prw-r--r--   1 max  staff      0 Oct 31 10:12 jobs.fifo",
  "srw-rw----   1 root docker     0 Oct 31 07:59 docker.sock",
  "-rw-r--r--   1 max  staff      0 Oct 31 10:30 'quarterly report.txt'",
].join("\n");
