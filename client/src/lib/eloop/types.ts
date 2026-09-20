/**
 * Too many levels of symbolic links, on a path with no loop in it.
 *
 * Measured on the host this was written on, kernel 6.18.44, by building chains
 * of symlinks and opening them.
 *
 * FIRST, the number. One chain of 40 opens; 41 gives errno 40, ELOOP, "Too
 * many levels of symbolic links". The errno and the limit happening to both be
 * forty is a coincidence and a useful one for remembering it.
 *
 * SECOND, and this is the part that decides how to think about it: the forty
 * is a budget for the WHOLE PATH RESOLUTION, not for a chain and not for a
 * component. A path can walk three symlinked components, each with its own
 * chain, and they all draw on one counter. Measured at three different splits,
 * every one of which flips between exactly 40 and 41:
 *
 *     13 + 13 + 13 = 39   opens
 *     14 + 13 + 13 = 40   opens
 *     14 + 14 + 13 = 41   ELOOP
 *     20 + 10 + 10 = 40   opens
 *     20 + 11 + 10 = 41   ELOOP
 *     38 +  1 +  1 = 40   opens
 *     38 +  2 +  1 = 41   ELOOP
 *
 * So a deployment scheme that is nowhere near forty in any one place can still
 * be over it: current -> releases/N, inside a symlinked data directory, under
 * a symlinked mount point, each two or three deep, adds up.
 *
 * THIRD, there is no loop detection. The kernel does not notice it is going
 * round; it counts, and the count runs out. A two link cycle and a forty one
 * link acyclic chain produce the identical error:
 *
 *     cycA -> cycB -> cycA        errno 40, ELOOP
 *     a chain of 41, no cycle     errno 40, ELOOP
 *
 * The name of the error is about the shape it was originally written for, and
 * it is not what the kernel checked. "ELOOP" on a path you are sure has no
 * loop in it is not a contradiction; it is the ordinary case.
 *
 * FOURTH, O_NOFOLLOW reports ELOOP as well, for a third reason again. Opening
 * a single symlink, one level deep, with O_NOFOLLOW:
 *
 *     plain open                  opens
 *     the same link, O_NOFOLLOW   errno 40, ELOOP
 *
 * So one errno means three different things: the budget ran out, the walk went
 * round, or you asked not to follow and it was a link.
 *
 * FIFTH, what still works past the wall. At a chain of 45, where open and stat
 * both give ELOOP:
 *
 *     readlink()   works, returns the next link in the chain
 *     lstat()      works, reports a symlink
 *     stat()       ELOOP
 *     open()       ELOOP
 *
 * Because the calls that do not follow the final component never spend the
 * budget on it. They still spend it on the directories leading up to it, which
 * is the part people miss when they reach for lstat to work around this.
 *
 * Not modeled: the per-call budget of a path opened with openat and a
 * directory file descriptor, which starts the walk part way along; procfs
 * magic links, which are not symlinks in the ordinary sense; and what a mount
 * point in the middle of a chain costs, which was not measured here.
 */

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** The path being resolved, written out. */
  path: string;
  /** Symlink traversals the directory part of the path costs. */
  leadingHops: number;
  /** The chain on the final component, which only a following call walks. */
  finalHops: number;
  /** Whether that final chain closes on itself and would never terminate. */
  cyclicFinal: boolean;
  /** O_NOFOLLOW, which refuses a final symlink rather than walking it. */
  noFollow: boolean;
  /** The call being made. */
  call: "open" | "stat" | "lstat" | "readlink";
}

export type Claim =
  /** Whether the call returns rather than failing. */
  | { about: "succeeds"; value: boolean }
  /** Which of the three things ELOOP is reporting here. */
  | { about: "reason"; name: string }
  /** Traversals this call actually spends. */
  | { about: "spent"; value: number }
  /** Traversals left in the budget afterwards. */
  | { about: "headroom"; value: number }
  /** A claim about something this model does not decide. It never holds. */
  | { about: "nothing" };

export interface Option {
  id: string;
  claim: string;
  says: Claim;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  setup: Setup;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
