/**
 * The mode you pass to open() is a maximum, not a request.
 *
 * Measured on the host this was written on, kernel 6.18.44, by creating files
 * and directories in C at a grid of modes and umasks and reading the result
 * back with stat.
 *
 * FIRST, the arithmetic, which is exactly mode AND NOT umask. Thirty six rows
 * for open() and six for mkdir(), and not one of them differed:
 *
 *     asked   umask   got        asked   umask   got
 *      0666    0000   0666        0777    0000   0777
 *      0666    0022   0644        0777    0022   0755
 *      0666    0002   0664        0777    0002   0775
 *      0666    0077   0600        0777    0077   0700
 *      0666    0027   0640        0777    0027   0750
 *      0666    0777   0000        0777    0777   0000
 *
 * SECOND, and this is the part the word "mask" hides: it only ever CLEARS.
 * There is no umask that gives you a bit you did not ask for.
 *
 *     asked   umask   got
 *      0600    0022   0600     the umask clears bits that were not set
 *      0600    0002   0600
 *      0600    0077   0600
 *      0644    0022   0644     already narrower than the mask
 *      0755    0002   0755
 *
 * So a program that opens with 0600 is 0600 under every umask on the machine,
 * and a program that opens with 0666 is at the mercy of one. The mode argument
 * is a ceiling and the umask lowers it; neither can raise the other.
 *
 * THIRD, umask is nine bits and there are twelve. The setuid, setgid and sticky
 * bits pass through untouched:
 *
 *     asked   umask   got
 *      6777    0000   6777
 *      6777    0022   6755
 *      6777    0077   6700
 *      6777    0777   6000
 *
 * A umask of 0777, which removes every ordinary permission, leaves a setuid
 * setgid file behind. Nothing about umask is a defense against those bits.
 *
 * FOURTH, chmod does not go through the umask at all:
 *
 *     umask 0077, open with 0666   ->  0600
 *     then chmod 0666              ->  0666
 *
 * The mask applies when a file is created and never again, which is why a
 * script that chmods after writing undoes whatever the umask was for.
 *
 * FIFTH, a setgid parent directory changes the GROUP of what is created, and
 * not the mode. Two directories owned by group 1, with the process in group 0:
 *
 *     parent plain  0777 gid 1     file created inside   0644  gid 0
 *     parent setgid 2777 gid 1     file created inside   0644  gid 1
 *     parent plain  0777 gid 1     dir  created inside   0755  gid 0
 *     parent setgid 2777 gid 1     dir  created inside   2755  gid 1
 *
 * The mode is 0644 in both, so umask did the same work either way. What moved
 * is the group. And a directory inherits the setgid bit itself, which is how
 * the arrangement survives further down the tree.
 *
 * SIXTH, the shell asks for 0666 and never 0777, so a redirect cannot produce
 * an executable file whatever the umask is:
 *
 *     umask 0022, : > f   ->  0644
 *     umask 0077, : > f   ->  0600
 *     umask 0002, : > f   ->  0664
 *
 * The default umask in this shell is 0022.
 *
 * Not modeled: default POSIX access control lists, which a directory can carry
 * and which replace the umask for anything created under it; the mount options
 * that force a mode, as fat and ntfs do; process capabilities, which decide
 * whether the setuid bits mean anything; and O_TMPFILE and mkstemp, which have
 * their own rules about the mode they take.
 */

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What is being created, and by what. */
  job: string;
  /** A file or a directory. */
  kind: "file" | "directory";
  /** The mode argument, as a program passes it. */
  asked: number;
  /** The process umask at the moment of creation. */
  um: number;
  /** Whether the containing directory carries the setgid bit. */
  parentSetgid: boolean;
  /** The group that owns the containing directory. */
  parentGid: number;
  /** The group the creating process is running as. */
  processGid: number;
  /** A chmod applied afterwards, or 0 for none. */
  thenChmod: number;
}

export type Claim =
  /** The mode it ends up with, written as a program would. */
  | { about: "mode"; value: string }
  /** The mode at the moment of creation, before any chmod. */
  | { about: "created"; value: string }
  /** The group that owns it. */
  | { about: "gid"; value: number }
  /** Whether the umask actually removed anything that was asked for. */
  | { about: "masked"; value: boolean }
  /** Whether anybody at all can execute it. */
  | { about: "executable"; value: boolean }
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
