/**
 * A small POSIX-shaped filesystem, in memory.
 *
 * The labs need a machine a reader can actually poke at: `ls -l` has to show
 * plausible modes and owners, `cat` on a directory has to fail the way it
 * fails on a real box, and a lab about a permissions mistake is only a lab if
 * the permission bits are real. So this models inodes rather than a map of
 * path to string.
 *
 * What it deliberately does NOT model: hard links, devices, mount points,
 * inode numbers, atime, sticky bits, ACLs, and anything else no lab here
 * turns on. Every field below exists because some command prints it or some
 * scenario checks it.
 */

export type NodeKind = "file" | "dir" | "link";

export interface FsNode {
  kind: NodeKind;
  /** Permission bits only, as an octal number: 0o644, 0o755. */
  mode: number;
  owner: string;
  group: string;
  /** Epoch millis. Fixed per scenario so `ls -l` output is reproducible. */
  mtime: number;
  /** Files only. */
  content?: string;
  /** Directories only. Insertion order is the order `ls` sorts from. */
  children?: Record<string, FsNode>;
  /** Symlinks only: the raw target, resolved relative to the link's parent. */
  target?: string;
}

export const dir = (
  children: Record<string, FsNode> = {},
  mode = 0o755,
  owner = "root",
  group = "root",
  mtime = FIXED_TIME,
): FsNode => ({ kind: "dir", mode, owner, group, mtime, children });

export const file = (
  content: string,
  mode = 0o644,
  owner = "root",
  group = "root",
  mtime = FIXED_TIME,
): FsNode => ({ kind: "file", mode, owner, group, mtime, content });

export const link = (target: string, owner = "root", group = "root"): FsNode => ({
  kind: "link",
  mode: 0o777,
  owner,
  group,
  mtime: FIXED_TIME,
  target,
});

/**
 * One timestamp for everything a scenario does not set deliberately.
 *
 * Real mtimes would make `ls -l` output drift with the calendar, which turns
 * every lab check and every screenshot into something that expires. Scenarios
 * that care about a time set it explicitly.
 */
export const FIXED_TIME = Date.UTC(2026, 8, 2, 9, 14, 0);

/** Split a path into segments, dropping "" and ".". Keeps "..". */
export function segments(path: string): string[] {
  return path.split("/").filter((part) => part !== "" && part !== ".");
}

/** Join and normalise, resolving ".." textually. Always absolute. */
export function resolvePath(cwd: string, path: string): string {
  const base = path.startsWith("/") ? [] : segments(cwd);
  for (const part of segments(path)) {
    if (part === "..") base.pop();
    else base.push(part);
  }
  return "/" + base.join("/");
}

export const parentOf = (path: string): string =>
  path === "/" ? "/" : resolvePath(path, "..");

export const baseName = (path: string): string =>
  path === "/" ? "/" : (segments(path).pop() ?? "/");

export interface LookupOk {
  ok: true;
  node: FsNode;
  /** Where the node actually lives, with symlinks resolved. */
  path: string;
}
export interface LookupErr {
  ok: false;
  /** Written the way coreutils writes it, so error text reads right. */
  error: "ENOENT" | "ENOTDIR" | "ELOOP" | "EACCES";
}
export type Lookup = LookupOk | LookupErr;

const MAX_LINK_HOPS = 16;

/**
 * Walk to a path.
 *
 * `follow` is false for the last component when the caller is `ls -l` or
 * `rm`, which want the link itself rather than what it points at. Every
 * intermediate component is always followed, as the kernel does.
 */
/**
 * Resolve a path to a node, following symlinks.
 *
 * `hops` is the number of links already traversed on this resolution, and it
 * has to be a parameter rather than a local, which took a property test to
 * notice. It was a local, so every recursive call started the count again and
 * MAX_LINK_HOPS could never be reached: a link pointing at itself recursed
 * until the stack ran out. In a browser that is a blank page, not an error
 * message.
 *
 * Counting hops across the whole resolution rather than per call is also what
 * a kernel does. Linux allows forty per pathname, total, for the same reason.
 */
export function lookup(
  root: FsNode,
  cwd: string,
  path: string,
  follow = true,
  hops = 0,
): Lookup {
  const absolute = resolvePath(cwd, path);
  const parts = segments(absolute);
  let node = root;
  let here = "";
  let used = hops;

  for (let i = 0; i < parts.length; i++) {
    if (node.kind === "link") {
      if (++used > MAX_LINK_HOPS) return { ok: false, error: "ELOOP" };
      const to = resolvePath(parentOf(here), node.target ?? "");
      const jumped = lookup(root, "/", to, true, used);
      if (!jumped.ok) return jumped;
      node = jumped.node;
      here = jumped.path;
    }
    if (node.kind !== "dir") return { ok: false, error: "ENOTDIR" };
    const next = node.children?.[parts[i]];
    if (!next) return { ok: false, error: "ENOENT" };
    node = next;
    here = here + "/" + parts[i];
  }

  if (follow && node.kind === "link") {
    if (++used > MAX_LINK_HOPS) return { ok: false, error: "ELOOP" };
    return lookup(root, parentOf(here || "/"), node.target ?? "", true, used);
  }
  return { ok: true, node, path: here === "" ? "/" : here };
}

/** The rwxrwxrwx string `ls -l` and `stat` both need. */
export function modeString(node: FsNode): string {
  const type = node.kind === "dir" ? "d" : node.kind === "link" ? "l" : "-";
  let out = type;
  for (const shift of [6, 3, 0]) {
    const bits = (node.mode >> shift) & 0o7;
    out += bits & 4 ? "r" : "-";
    out += bits & 2 ? "w" : "-";
    out += bits & 1 ? "x" : "-";
  }
  return out;
}

/**
 * Can `user` do `want` ("r" | "w" | "x") to this node?
 *
 * root bypasses read and write exactly as it does on a real system, but not
 * execute on a file with no execute bit set anywhere, which is the one place
 * root is not omnipotent and the one place a lab is likely to test.
 */
export function permitted(node: FsNode, user: string, want: "r" | "w" | "x"): boolean {
  if (user === "root") {
    if (want !== "x") return true;
    return (node.mode & 0o111) !== 0 || node.kind === "dir";
  }
  const shift = node.owner === user ? 6 : 0;
  const bits = (node.mode >> shift) & 0o7;
  if (want === "r") return (bits & 4) !== 0;
  if (want === "w") return (bits & 2) !== 0;
  return (bits & 1) !== 0;
}

/** Bytes, as `ls -l` counts them: content length for a file, 4096 for a dir. */
export function sizeOf(node: FsNode): number {
  if (node.kind === "dir") return 4096;
  if (node.kind === "link") return (node.target ?? "").length;
  return new TextEncoder().encode(node.content ?? "").length;
}

/** Deep copy, so a lab can be restarted without rebuilding the tree by hand. */
export function cloneTree(node: FsNode): FsNode {
  const copy: FsNode = { ...node };
  if (node.children) {
    copy.children = {};
    for (const [name, child] of Object.entries(node.children)) {
      copy.children[name] = cloneTree(child);
    }
  }
  return copy;
}
