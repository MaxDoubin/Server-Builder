/**
 * Three ways to lock a file, and they do not all mean the same thing.
 *
 * Measured on the host this was written on, kernel 6.18.44, by taking a lock in
 * one process and then having a second party try for it, across every
 * combination of the three interfaces Linux offers: fcntl record locks (what
 * POSIX specifies and what lockf and flock(1) with -x do not both use), flock,
 * and open file description locks, which arrived in Linux 3.15.
 *
 * FIRST, and it is the one that costs the most, they do not all see each other.
 * A second process asking for the file, with the holder already locked:
 *
 *     holder used    fcntl asks    flock asks    OFD asks
 *     fcntl             blocked       GRANTED     blocked
 *     flock             GRANTED       blocked     GRANTED
 *     OFD               blocked       GRANTED     blocked
 *
 * flock keeps its own list. fcntl and OFD share one. So two programs guarding
 * the same file, one written against flock and one against fcntl, will both
 * take the lock, both succeed, and both believe they have it alone. There is no
 * error, no warning and no counter anywhere that says this happened.
 *
 * SECOND, an fcntl lock is owned by the PROCESS and the other two are owned by
 * the OPEN FILE DESCRIPTION. Every remaining difference follows from that one
 * sentence, and each of them was measured rather than reasoned about.
 *
 * A second descriptor in the same process asking for the same file:
 *
 *     holder used    fcntl asks    flock asks    OFD asks
 *     fcntl             GRANTED       GRANTED     blocked
 *     flock             GRANTED       blocked     GRANTED
 *     OFD               blocked       GRANTED     blocked
 *
 * One cell moved: fcntl against fcntl. Two components of one process, each
 * carefully taking the lock before touching the file, get it at the same time
 * and neither is told. That is the whole of fcntl's mutual exclusion inside a
 * process: there is none.
 *
 * THIRD, the quirk with no rationale left. Closing ANY descriptor to a file
 * drops all of that process's fcntl locks on it, including ones taken through a
 * different descriptor:
 *
 *     lock fd a, then open fd b to the same file, then close fd b
 *       fcntl    the lock is gone, an outsider took it
 *       flock    still held
 *       OFD      still held
 *
 * Nothing in the program touched the lock. A library that opens the file to
 * read one line and closes it again is enough, and this is the failure people
 * spend a day on: the lock works in every test and disappears in production
 * when some unrelated code reads the same path.
 *
 * FOURTH, fork. The child inherits the descriptor, which means it inherits the
 * open file description, which means for two of the three it inherits the lock:
 *
 *     the forked child, using the inherited descriptor
 *       takes the same lock      fcntl blocked    flock GRANTED    OFD GRANTED
 *       calls the unlock         fcntl no effect  flock RELEASED   OFD RELEASED
 *
 * So flock gives you mutual exclusion between processes and then lets a child
 * you forgot you forked release it, while fcntl refuses to let your own child
 * touch the file it was forked to work on. Both behaviors are correct and both
 * surprise people, in opposite directions.
 *
 * FIFTH, granularity. fcntl and OFD lock byte ranges, flock locks the file:
 *
 *     holder locks bytes 0 to 99 with fcntl
 *       an outsider asking for 0 to 99       blocked
 *       an outsider asking for 200 to 299    granted
 *     holder locks with flock
 *       an outsider asking for 200 to 299    blocked
 *
 * SIXTH, the parts that behave the way everybody expects, measured so they are
 * not assumed: a shared lock does not conflict with another shared lock and
 * does conflict with an exclusive one, for both fcntl and flock; and a lock
 * survives execve, because the descriptor does.
 *
 * Not modeled: blocking acquisition and the deadlock detection fcntl does for
 * F_SETLKW; mandatory locking, which fcntl(2) calls unreliable and which has
 * been behind an optional config since Linux 4.5; leases; the upgrade from
 * shared to exclusive, which flock performs by releasing first and is therefore
 * not atomic; and network filesystems, where the first result above is simply
 * false. Over NFS since Linux 2.6.12 and over SMB since 5.5, flock is emulated
 * as an fcntl byte-range lock covering the whole file, so the two lists become
 * one and the interfaces do conflict. That was not measured here, because there
 * was nothing to mount. Everything above is a local filesystem.
 */

/** Which of the three interfaces took or is asking for the lock. */
export type Kind = "fcntl" | "flock" | "ofd";

/** Who is asking, and through which descriptor. */
export type Party =
  /** A different process, with its own open of the file. */
  | "another process"
  /** The holder's own process, through a second descriptor it opened. */
  | "the same process, a second descriptor"
  /** A child of the holder, using the descriptor it inherited. */
  | "the forked child";

/** What happened to the holder between taking the lock and being asked. */
export type Event =
  /** It opened a second descriptor to the same file and closed it again. */
  | "closed another descriptor"
  /** It forked, and that child called the unlock on the inherited descriptor. */
  | "the child unlocked";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** The file everybody is contending for. */
  path: string;
  /** Which interface the holder used. */
  held: Kind;
  /** First byte the holder locked. */
  holderStart: number;
  /** Bytes locked, where 0 means to the end of the file. Ignored for flock. */
  holderLength: number;
  /** Whether the holder took it exclusive. */
  holderExclusive: boolean;
  /** Which interface the second party is using. */
  asking: Kind;
  /** Who that second party is. */
  asker: Party;
  /** First byte it wants. */
  askerStart: number;
  /** Bytes it wants, where 0 means to the end of the file. */
  askerLength: number;
  /** Whether it is asking exclusive. */
  askerExclusive: boolean;
  /** What happened in between, in order. */
  events: Event[];
}

export type Claim =
  /** Whether the second party gets the lock. */
  | { about: "granted"; value: boolean }
  /** Whether the holder still has it by the time it is asked. */
  | { about: "stillHeld"; value: boolean }
  /** What the holder's lock belongs to. */
  | { about: "owner"; name: string }
  /** The reason for the outcome. */
  | { about: "why"; name: string }
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
