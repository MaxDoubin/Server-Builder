/**
 * Resolving one access, the way the kernel does.
 *
 * The order matters and is the whole of the difficulty:
 *
 *   1. Walk the path from the top. Every directory above the target needs
 *      the execute bit, which here means search rather than run. Missing it
 *      stops the walk, and nothing below is ever consulted: a file that is
 *      world readable under a directory you cannot search is unreachable and
 *      the error says so about the file, which sends people to chmod the
 *      wrong thing.
 *   2. At each node, pick the class. Owner if you own it, else group if you
 *      are in its group, else other. One of the three, never a union, and
 *      never falling through to a more permissive one.
 *   3. Apply the operation's requirement. Read, write and execute land on
 *      the target. Create and delete land on the directory holding it and
 *      require nothing whatsoever of the target.
 *   4. If the directory is sticky and the operation is a delete, the file
 *      has to be yours, or the directory has to be.
 *
 * Root skips steps two and three by the kernel declining to check, with one
 * exception: executing a file still needs an execute bit to exist somewhere
 * in the nine, because there the kernel is asking whether the file is a
 * program rather than whether you are allowed.
 */

import {
  EXEC,
  READ,
  STICKY,
  WRITE,
  type Actor,
  type Klass,
  type Node,
  type Operation,
  type Step,
  type Verdict,
} from "./types";

/**
 * Which set of bits applies to this actor on this node.
 *
 * Three lines, and the reason the whole surface exists. Note that being in
 * the group is never even asked about once you are the owner.
 */
export const classFor = (actor: Actor, node: Node): Klass =>
  actor.user === node.owner ? "owner" : actor.groups.includes(node.group) ? "group" : "other";

/** The three bits that class holds. */
export const bitsFor = (mode: number, klass: Klass): number =>
  (mode >> (klass === "owner" ? 6 : klass === "group" ? 3 : 0)) & 7;

/** What the operation needs of the target itself. Create and delete need nothing. */
const ON_TARGET: Record<Operation, number> = {
  read: READ,
  write: WRITE,
  execute: EXEC,
  list: READ,
  create: 0,
  delete: 0,
};

/**
 * What the operation needs of the directory immediately holding the target.
 *
 * Every other ancestor needs execute and only execute. The parent needs
 * that too, plus write when the operation changes which names the directory
 * holds, which creating and deleting both do and writing to a file does not.
 */
const ON_PARENT: Record<Operation, number> = {
  read: EXEC,
  write: EXEC,
  execute: EXEC,
  list: EXEC,
  create: WRITE | EXEC,
  delete: WRITE | EXEC,
};

/**
 * What the target needs, once the kind of file is taken into account.
 *
 * The only adjustment is the one the shebang forces: an interpreted file
 * has to be readable by whoever runs it, because the interpreter opens it
 * as a file after the kernel has finished with it.
 */
export const onTarget = (node: Node, operation: Operation): number =>
  operation === "execute" && node.interpreted ? EXEC | READ : ON_TARGET[operation];

/**
 * Whether the sticky bit blocks this delete.
 *
 * A world-writable directory without it lets anybody remove anybody's
 * files, which is what /tmp would be. With it, the file has to be yours or
 * the directory has to be. It has no effect on anything but removing and
 * renaming, so a sticky directory you can write is still one you can fill.
 */
export const stickyBlocks = (parent: Node, target: Node, actor: Actor): boolean =>
  (parent.mode & STICKY) !== 0 && actor.user !== target.owner && actor.user !== parent.owner;

export function check(path: Node[], actor: Actor, operation: Operation): Verdict {
  const steps: Step[] = [];
  const last = path.length - 1;
  const root = actor.user === "root";

  for (let index = 0; index <= last; index += 1) {
    const node = path[index];
    const using = classFor(actor, node);
    const has = bitsFor(node.mode, using);
    const needs =
      index === last ? onTarget(node, operation) : index === last - 1 ? ON_PARENT[operation] : EXEC;

    if (root) {
      steps.push({ index, using, has, needs, ok: true, bypassed: true });
      continue;
    }

    const ok = (has & needs) === needs;
    steps.push({ index, using, has, needs, ok });
    if (!ok) {
      /*
        Which failure this is decides what somebody should go and change,
        and the shell reports all three identically. Missing execute on a
        directory means the path stops here and nothing below was looked
        at. Having execute but not write on the parent of a create or a
        delete means you got there and cannot alter the list of names.
      */
      const reason =
        index === last ? "bits" : (has & EXEC) === 0 ? "search" : "directory-write";
      return { kind: "denied", steps, at: index, reason };
    }
  }

  /*
    Root's one refusal. The nine bits are empty of execute, so there is no
    program here to run as far as the kernel is concerned, and being root
    does not conjure one.
  */
  if (root && operation === "execute" && (path[last].mode & 0o111) === 0) {
    return { kind: "denied", steps, at: last, reason: "no-exec-bit" };
  }

  if (!root && operation === "delete" && last >= 1 && stickyBlocks(path[last - 1], path[last], actor)) {
    return { kind: "denied", steps, at: last - 1, reason: "sticky" };
  }

  return { kind: "allowed", steps };
}

/* ------------------------------------------------------------ rendering */

/** rwx for a set of three bits, with dashes where they are absent. */
export const triad = (bits: number): string =>
  `${bits & READ ? "r" : "-"}${bits & WRITE ? "w" : "-"}${bits & EXEC ? "x" : "-"}`;

/**
 * The ten characters ls prints.
 *
 * setuid, setgid and sticky replace the execute letter of their class
 * rather than getting a column of their own, upper case when the execute
 * bit underneath is absent. That is why a sticky directory reads drwxrwxrwt
 * and a setgid one with no group execute reads drwxrwSr-x, and why the
 * capital is worth noticing: it means the bit is set on something that
 * cannot be executed, which is usually a mistake.
 */
export function symbolic(node: Node): string {
  const kind = node.kind === "dir" ? "d" : "-";
  const owner = triad(bitsFor(node.mode, "owner"));
  const group = triad(bitsFor(node.mode, "group"));
  const other = triad(bitsFor(node.mode, "other"));
  const sub = (text: string, special: boolean, lower: string, upper: string) =>
    special ? text.slice(0, 2) + (text[2] === "x" ? lower : upper) : text;
  return (
    kind +
    sub(owner, (node.mode & 0o4000) !== 0, "s", "S") +
    sub(group, (node.mode & 0o2000) !== 0, "s", "S") +
    sub(other, (node.mode & STICKY) !== 0, "t", "T")
  );
}

/** The octal ls -l does not show you, four digits when the high bits are set. */
export const octal = (mode: number): string =>
  mode > 0o777 ? mode.toString(8).padStart(4, "0") : mode.toString(8).padStart(3, "0");

/** The path as a shell would write it. */
export const pathOf = (path: Node[], upto = path.length - 1): string => {
  const parts = path.slice(1, upto + 1).map((node) => node.name);
  return `/${parts.join("/")}`;
};

/* ---------------------------------------------------------------- umask */

/** What the mask actually does: clear every bit the mask sets. */
export const applyUmask = (requested: number, umask: number): number =>
  requested & ~umask & 0o7777;

/**
 * What people compute instead, and why they get away with it.
 *
 * The mask is a mask, but everybody is taught it by watching 022 turn 666
 * into 644, which is also what subtracting gives. It keeps working for 002
 * and 022 and 077, which between them are almost every umask anybody sets,
 * so the wrong method survives for years and then produces 653 where the
 * kernel produces 664.
 *
 * Digits clamp at zero here rather than borrowing, because that is what
 * somebody doing it in their head does.
 */
export function naiveSubtract(requested: number, umask: number): number {
  let out = 0;
  for (let shift = 6; shift >= 0; shift -= 3) {
    const digit = ((requested >> shift) & 7) - ((umask >> shift) & 7);
    out |= Math.max(0, digit) << shift;
  }
  return out;
}

/** Files are born 666 and directories 777, before the mask. */
export const BORN_FILE = 0o666;
export const BORN_DIR = 0o777;

/**
 * The group a file created here ends up in.
 *
 * Normally the creator's primary group. In a setgid directory, the
 * directory's, which is the whole mechanism behind a shared project tree
 * and is invisible in ls output unless you look for the s.
 */
export const inheritedGroup = (parent: Node, actor: Actor): string =>
  (parent.mode & 0o2000) !== 0 ? parent.group : actor.groups[0];
