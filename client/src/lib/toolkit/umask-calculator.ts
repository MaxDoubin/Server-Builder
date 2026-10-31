/**
 * umask arithmetic.
 *
 * The kernel computes a new file's mode as (requested & ~umask): see open(2)
 * and mkdir(2). It is a bit clear, not a subtraction. umask(2) stores only
 * mask & 0777, so a umask never reaches setuid, setgid or the sticky bit.
 *
 * Symbolic umasks follow the POSIX umask utility (XCU, "umask"): the mode is
 * parsed with the chmod grammar and applied to the permissions the mask
 * ALLOWS, which is the complement of the mask. '+' and '-' are relative to the
 * current mask, so a starting value is needed to evaluate them.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/** The nine permission bits, the only bits a umask can hold. */
export const PERMISSION_BITS = 0o777;

/** What open(2) callers such as touch and shell redirection ask for. */
export const FILE_BASE = 0o666;

/** What mkdir(2) callers such as mkdir(1) ask for. */
export const DIR_BASE = 0o777;

/** The setgid bit, which a Linux directory passes to new subdirectories. */
export const SETGID = 0o2000;

/** Most systems start login shells and services with this. */
export const DEFAULT_UMASK = 0o022;

/** Longer than this is not a umask anybody typed on purpose. */
export const MAX_INPUT_LENGTH = 64;

/** bash's read_octal refuses anything above 07777, and so does this. */
export const MAX_OCTAL = 0o7777;

export type Parsed<T> =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | ({ kind: "ok" } & T);

export interface UmaskValue {
  /** The effective mask, always within 0777. */
  mask: number;
  form: "octal" | "symbolic";
  /** Whether + or - appeared, which makes the result depend on the current mask. */
  relative: boolean;
  /** Set when the input asked for bits above 0777, which the kernel drops. */
  dropped: number;
}

/* ------------------------------------------------------------- formatting */

/** Four octal digits, the way bash prints `umask` with no argument. */
export function octal4(value: number): string {
  return (value & MAX_OCTAL).toString(8).padStart(4, "0");
}

/** One rwx triple for a three-bit value. */
function triple(bits: number): string {
  return `${bits & 4 ? "r" : "-"}${bits & 2 ? "w" : "-"}${bits & 1 ? "x" : "-"}`;
}

/**
 * The nine characters ls prints, with setuid, setgid and sticky folded into
 * the execute slots as s, S, t and T.
 */
export function rwx(mode: number): string {
  const chars = (triple((mode >> 6) & 7) + triple((mode >> 3) & 7) + triple(mode & 7)).split("");
  if (mode & 0o4000) chars[2] = chars[2] === "x" ? "s" : "S";
  if (mode & 0o2000) chars[5] = chars[5] === "x" ? "s" : "S";
  if (mode & 0o1000) chars[8] = chars[8] === "x" ? "t" : "T";
  return chars.join("");
}

/** The letters a class is allowed, for `umask -S`: "rwx", "rx" or "". */
function letters(bits: number): string {
  return `${bits & 4 ? "r" : ""}${bits & 2 ? "w" : ""}${bits & 1 ? "x" : ""}`;
}

/**
 * What `umask -S` prints: the permissions the mask ALLOWS, not the bits it
 * clears. umask 022 prints u=rwx,g=rx,o=rx.
 */
export function symbolicUmask(mask: number): string {
  const allowed = ~mask & PERMISSION_BITS;
  return `u=${letters((allowed >> 6) & 7)},g=${letters((allowed >> 3) & 7)},o=${letters(allowed & 7)}`;
}

/* ------------------------------------------------------------- arithmetic */

/** requested & ~umask, with the mask limited to the nine bits it can hold. */
export function applyUmask(requested: number, mask: number): number {
  return requested & ~(mask & PERMISSION_BITS) & MAX_OCTAL;
}

/** The bits that were requested and that the mask removed. */
export function removedBits(requested: number, mask: number): number {
  return requested & mask & PERMISSION_BITS;
}

/** The bits set in the mask that the request never had, so the mask did nothing to them. */
export function idleBits(requested: number, mask: number): number {
  return mask & PERMISSION_BITS & ~requested;
}

export interface Subtraction {
  /** One result per octal digit, owner first. A digit may be negative. */
  digits: number[];
  /** The digits run together, or null when any digit went negative. */
  text: string | null;
  /** The mode the digits would mean, or null when one went negative. */
  mode: number | null;
  /** Whether this disagrees with AND NOT. */
  wrong: boolean;
}

/**
 * The tempting, wrong method: subtract the umask from the base one octal
 * digit at a time. It agrees with AND NOT only when every bit in the mask is
 * also in the base, which is always true for directories (7 has every bit)
 * and false for files whenever the mask has an execute bit.
 */
export function subtractDigits(base: number, mask: number): Subtraction {
  const digits = [6, 3, 0].map((shift) => ((base >> shift) & 7) - ((mask >> shift) & 7));
  const negative = digits.some((d) => d < 0);
  const mode = negative ? null : (digits[0] << 6) | (digits[1] << 3) | digits[2];
  return {
    digits,
    text: negative ? null : digits.join(""),
    mode,
    wrong: mode !== applyUmask(base & PERMISSION_BITS, mask),
  };
}

/* ---------------------------------------------------------------- parsing */

const WHO: Record<string, number> = { u: 0o700, g: 0o070, o: 0o007, a: 0o777 };
const PERM: Record<string, number> = { r: 0o444, w: 0o222, x: 0o111 };
const SHIFT: Record<string, number> = { u: 6, g: 3, o: 0 };

function error(message: string): { kind: "error"; message: string } {
  return { kind: "error", message };
}

/**
 * Parses a umask in octal (22, 022, 0027) or symbolic form (u=rwx,g=rx,o=).
 * A pasted `umask` or `umask -S` prefix is ignored. `current` is the mask that
 * '+' and '-' are relative to.
 */
export function parseUmask(raw: string, current: number = DEFAULT_UMASK): Parsed<UmaskValue> {
  let input = raw.trim();
  if (input === "") return { kind: "empty" };
  if (input.length > MAX_INPUT_LENGTH) {
    return error(`That is longer than ${MAX_INPUT_LENGTH} characters. A umask is a few octal digits or a short u=,g=,o= list.`);
  }

  input = input.replace(/^umask\b\s*/, "").replace(/^-S(?:\s+|$)/, "").replace(/\s+/g, "");
  if (input === "") return error("Add a value after umask, for example 022 or u=rwx,g=rx,o=.");

  if (/^\d+$/.test(input)) return parseOctal(input);
  return parseSymbolic(input, current & PERMISSION_BITS);
}

function parseOctal(input: string): Parsed<UmaskValue> {
  if (/[89]/.test(input)) {
    return error("A umask is octal, so the digits run from 0 to 7. There is no 8 or 9.");
  }
  if (input.length > 8) {
    return error("That is too many digits. A umask is three or four octal digits, such as 022 or 0027.");
  }
  const value = parseInt(input, 8);
  if (value > MAX_OCTAL) {
    return error("That is larger than 07777, the widest mode there is. A umask is usually three digits, such as 022.");
  }
  return {
    kind: "ok",
    mask: value & PERMISSION_BITS,
    form: "octal",
    relative: false,
    dropped: value & ~PERMISSION_BITS,
  };
}

/**
 * POSIX chmod grammar, as the umask utility uses it:
 *
 *   clause     : [who...] action...
 *   who        : u | g | o | a
 *   action     : op [perm... | permcopy]
 *   op         : + | - | =
 *   perm       : r | w | x        (X, s and t are rejected below)
 *   permcopy   : u | g | o
 *
 * Clauses are separated by commas. A clause with no who applies to all three
 * classes. The state is the ALLOWED permissions; the mask is its complement.
 */
function parseSymbolic(input: string, current: number): Parsed<UmaskValue> {
  let allowed = ~current & PERMISSION_BITS;
  let relative = false;

  const clauses = input.split(",");
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    const where = clauses.length > 1 ? ` in clause ${index + 1} ("${clause}")` : "";
    if (clause === "") {
      return error("There is an empty clause. Separate clauses with single commas, as in u=rwx,g=rx,o=.");
    }

    let pos = 0;
    let who = 0;
    while (pos < clause.length && clause[pos] in WHO) {
      who |= WHO[clause[pos]];
      pos += 1;
    }
    if (who === 0) who = 0o777;

    if (pos >= clause.length || !"+-=".includes(clause[pos])) {
      const found = pos < clause.length ? `"${clause[pos]}"` : "nothing";
      return error(
        `Expected an operator (=, + or -) after the classes${where}, but found ${found}. The classes are u, g, o and a.`,
      );
    }

    while (pos < clause.length) {
      const op = clause[pos];
      if (!"+-=".includes(op)) {
        return error(`Unexpected "${op}"${where}. Each action is =, + or - followed by r, w and x.`);
      }
      pos += 1;

      let perm = 0;
      const start = pos;
      // permcopy: a single u, g or o straight after the operator copies that
      // class's current permissions.
      if (pos < clause.length && clause[pos] in SHIFT) {
        const bits = (allowed >> SHIFT[clause[pos]]) & 7;
        perm = (bits << 6) | (bits << 3) | bits;
        pos += 1;
        if (pos < clause.length && /[rwxXstugoa]/.test(clause[pos])) {
          return error(
            `"${clause.slice(start, pos + 1)}" is not a valid action${where}. Copy exactly one class (g=u) or list letters (g=rx), not both.`,
          );
        }
      } else {
        while (pos < clause.length && !"+-=".includes(clause[pos])) {
          const ch = clause[pos];
          if (ch in PERM) {
            perm |= PERM[ch];
          } else if (ch === "s" || ch === "t") {
            return error(
              `"${ch}" is a special bit${where}. A umask holds only the nine permission bits, so setuid, setgid and sticky cannot be masked.`,
            );
          } else if (ch === "X") {
            return error(`"X" (execute only for directories) has no meaning in a umask${where}. Use x.`);
          } else if (ch in WHO) {
            return error(
              `"${ch}" is in the wrong place${where}. Classes come before the operator, as in go=rx, not after the letters.`,
            );
          } else {
            return error(`"${ch}" is not a permission letter${where}. Use r, w and x.`);
          }
          pos += 1;
        }
      }

      const bits = perm & who;
      if (op === "=") allowed = (allowed & ~who) | bits;
      else if (op === "+") {
        allowed |= bits;
        relative = true;
      } else {
        allowed &= ~bits;
        relative = true;
      }
    }
  }

  return { kind: "ok", mask: ~allowed & PERMISSION_BITS, form: "symbolic", relative, dropped: 0 };
}

/**
 * Parses a requested creation mode such as 0666 or 600. Only the nine
 * permission bits are accepted: what the kernel does with setuid, setgid and
 * sticky at creation depends on the call and the caller, not on the umask.
 */
export function parseRequested(raw: string): Parsed<{ mode: number }> {
  const input = raw.trim();
  if (input === "") return { kind: "empty" };
  if (/^0?[0-7]{3}$/.test(input)) return { kind: "ok", mode: parseInt(input, 8) };
  if (/^[0-7]{4}$/.test(input)) {
    return error("Enter the nine permission bits only, as three digits (0600, 666). Special bits are outside what a umask touches.");
  }
  if (/[89]/.test(input) && /^\d+$/.test(input)) {
    return error("Modes are octal, so the digits run from 0 to 7.");
  }
  return error("Enter a mode as three octal digits, optionally with a leading 0, such as 0600 or 644.");
}

/* ---------------------------------------------------------------- reading */

export type Tone = "ok" | "warn" | "danger";

export interface Finding {
  tone: Tone;
  text: string;
}

/** Plain warnings about what a mask does to new files and directories. */
export function review(mask: number): Finding[] {
  const findings: Finding[] = [];
  const file = applyUmask(FILE_BASE, mask);
  const dir = applyUmask(DIR_BASE, mask);

  if (file & 0o002) {
    findings.push({
      tone: "danger",
      text: "New files are writable by every account on the system. That is CWE-276, incorrect default permissions, and almost never intended.",
    });
  } else if (file & 0o020) {
    findings.push({
      tone: "warn",
      text: "New files are group-writable. That is the point on a shared project directory or with one private group per user, and a leak when your primary group is a broad one such as users or staff.",
    });
  }

  if (dir & 0o002) {
    findings.push({
      tone: "danger",
      text: "New directories are world-writable without the sticky bit, so any account can delete or replace anything created inside them.",
    });
  }

  if ((file & 0o004) === 0 && (file & 0o040) === 0 && (file & 0o400) !== 0) {
    findings.push({
      tone: "ok",
      text: "Nobody but the owner can read new files. Good for keys and private data, but software installed under this mask may be unreadable to the services that need it.",
    });
  }

  if ((file & 0o400) === 0) {
    findings.push({
      tone: "warn",
      text: "The owner cannot read files they just created. That is rarely what anybody wants from a default.",
    });
  }
  if ((file & 0o200) === 0 && (file & 0o400) !== 0) {
    findings.push({
      tone: "warn",
      text: "The owner cannot write files they just created, so an editor saving in place will fail until a chmod.",
    });
  }
  if ((dir & 0o100) === 0) {
    findings.push({
      tone: "warn",
      text: "New directories have no execute bit for the owner, so the owner cannot cd into them or reach anything inside.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      tone: "ok",
      text: "Nothing unusual. Other accounts can read what this mask leaves readable, and only the owner can write.",
    });
  }
  return findings;
}

export interface CommonUmask {
  mask: number;
  when: string;
}

export const COMMON_UMASKS: CommonUmask[] = [
  { mask: 0o022, when: "The usual default. Everyone can read, only the owner writes." },
  { mask: 0o002, when: "Shared group work, or one private group per user, so group-write is safe." },
  { mask: 0o027, when: "Servers and service accounts. The group reads, others get nothing." },
  { mask: 0o077, when: "Private: home directories with secrets, key material, root's own shell." },
  { mask: 0o007, when: "A team directory where the group writes and others are shut out." },
  { mask: 0o033, when: "The subtraction trap. Digit subtraction says 0633, the kernel gives 0644." },
];
