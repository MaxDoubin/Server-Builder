/**
 * Nine bits, three of them apply to you, and it is not the three you expect.
 *
 * Almost every permission system a person meets before this one is additive.
 * Roles in a web application, groups in Active Directory, IAM policies, the
 * access control lists bolted on beside these very bits: in all of them you
 * accumulate rights, and being in one more group can only ever help. So the
 * mental model arrives fully formed and wrong, because POSIX mode bits pick
 * exactly one of the three sets and ignore the other two completely.
 *
 * If you are the file's owner, you get the owner bits. Not the owner bits
 * plus the group bits. The owner bits, and if they say you cannot write it
 * then you cannot write it, no matter that the group can, no matter that the
 * whole world can, and no matter that you are in the group as well. The rule
 * is first match wins, the same rule the firewall exercises are about, and
 * the surprising half is that a more permissive later class never rescues a
 * restrictive earlier one.
 *
 * Two more things behave differently from how they read. Deleting a file is
 * not a permission on the file, it is write on the directory holding it, so
 * you can delete a file you cannot open and fail to delete one you own. And
 * reaching a file at all needs the execute bit on every directory above it,
 * which is search permission wearing the same letter as run-this-program.
 *
 * Every case here is a real shape: a home directory somebody chmod'd, a
 * shared project directory that is not shared, a deploy user that cannot
 * read its own artefact.
 */

/** Which of the three sets of bits the kernel picks. It picks exactly one. */
export type Klass = "owner" | "group" | "other";

export const READ = 4;
export const WRITE = 2;
export const EXEC = 1;

/** setuid, setgid and the sticky bit, in the octal digit above the nine. */
export const SETUID = 0o4000;
export const SETGID = 0o2000;
export const STICKY = 0o1000;

export interface Node {
  /** The path component. The first node is the root of the path shown. */
  name: string;
  kind: "dir" | "file";
  owner: string;
  group: string;
  /** Octal, including the high bits: 0o2775 is setgid and rwxrwxr-x. */
  mode: number;
  /** Shown beside the row when this node is somebody's decision. */
  note?: string;
  /**
   * A script rather than a compiled program.
   *
   * Running a binary needs the execute bit and nothing else: the kernel maps
   * it. Running a script needs execute and read both, because the kernel
   * reads the shebang and then hands the path to an interpreter that opens
   * it like any other file. So mode 0711 runs a compiled tool for everybody
   * and fails for everybody on the shell script beside it, with an error
   * that names the interpreter and not the permission.
   */
  interpreted?: true;
}

export interface Actor {
  user: string;
  /**
   * Every group the user is in, primary first.
   *
   * The distinction between primary and supplementary matters for what a
   * new file's group becomes, and matters not at all for access: the kernel
   * checks membership, not which kind.
   */
  groups: string[];
}

/**
 * What is being attempted.
 *
 * `list` is reading a directory's names and `read` is reading a file's
 * contents, which are the same bit on different kinds of thing and are
 * worth separating because the failure looks different: one gives you an
 * empty ls, the other gives you a permission denied on the open.
 *
 * `create` and `delete` are here rather than being folded into `write`
 * because they are not write on the target at all. That is the point.
 */
export type Operation = "read" | "write" | "execute" | "list" | "create" | "delete";

export interface Step {
  index: number;
  /** The one set of bits the kernel consulted for this node. */
  using: Klass;
  /** What that set holds, as the low three bits. */
  has: number;
  /** What this node has to hold for the operation to proceed. */
  needs: number;
  ok: boolean;
  /**
   * Set when the check was skipped rather than passed.
   *
   * Root does not have every bit. Root has the kernel declining to look,
   * which is a different thing and shows differently: the bits are still
   * whatever they are, and the page says so rather than pretending they
   * were sufficient.
   */
  bypassed?: true;
}

export type Reason =
  /** A directory on the way has no execute bit for you, so the path stops. */
  | "search"
  /**
   * You reached the directory and cannot change what names it holds.
   *
   * Separate from "search" because the fix is different and because the
   * error message is the same: both say permission denied on the file, and
   * only one of them is about the file's directory being unsearchable.
   */
  | "directory-write"
  /** The class that applies lacks what the operation needs. */
  | "bits"
  /** The directory is sticky and the file is not yours. */
  | "sticky"
  /** Root, and the file carries no execute bit for anybody. */
  | "no-exec-bit";

export type Verdict =
  | { kind: "allowed"; steps: Step[] }
  | { kind: "denied"; steps: Step[]; at: number; reason: Reason };

export interface Option {
  id: string;
  /** What somebody might conclude. Exactly one is right. */
  claim: string;
}

export interface Case {
  slug: string;
  title: string;
  /** The situation, as somebody would describe it to you. */
  brief: string;
  /** The shell line being attempted, for the prompt. */
  command: string;
  actor: Actor;
  /** Root first, target last. Everything before the last is a directory. */
  path: Node[];
  operation: Operation;
  options: Option[];
  /** The id of the option that is right. */
  answer: string;
  /** Why, once the reader has answered. */
  why: string;
  /**
   * The belief this case is built to break.
   *
   * Named rather than implied, because a case that catches somebody out and
   * does not say what caught them is a trick. CI checks every case has one
   * and that no two cases claim the same one, which stops a set of ten from
   * being the same case ten times.
   */
  breaks: string;
}
