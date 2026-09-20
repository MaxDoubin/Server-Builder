/**
 * The exit status is eight bits, and the shell spends the top half twice.
 *
 * Measured on the host this was written on, kernel 6.18.44, by forking a child,
 * having it exit or die, and reading the raw wait status in C beside what bash
 * puts in $? for the same thing.
 *
 * FIRST, an exit code is truncated to a byte, silently:
 *
 *     _exit(0)      raw 0x0000   $? = 0
 *     _exit(1)      raw 0x0100   $? = 1
 *     _exit(42)     raw 0x2a00   $? = 42
 *     _exit(255)    raw 0xff00   $? = 255
 *     _exit(256)    raw 0x0000   $? = 0
 *     _exit(300)    raw 0x2c00   $? = 44
 *     _exit(1000)   raw 0xe800   $? = 232
 *     _exit(-1)     raw 0xff00   $? = 255
 *     _exit(-2)     raw 0xfe00   $? = 254
 *     _exit(512)    raw 0x0000   $? = 0
 *     _exit(768)    raw 0x0000   $? = 0
 *
 * The status is code & 0xff and nothing warns you. A program that returns a
 * count, or an errno, or a negative number, is returning that number modulo
 * 256, and 256 itself is indistinguishable from success. Both ends report
 * nothing wrong: exit() has no return value and the parent sees a clean
 * WIFEXITED.
 *
 * SECOND, the kernel puts an exit and a death in different halves of the word:
 *
 *     exited with 137     raw 0x8900   WIFEXITED 1  WEXITSTATUS 137  WIFSIGNALED 0
 *     killed by SIGKILL   raw 0x0009   WIFEXITED 0  WEXITSTATUS 0    WIFSIGNALED 1  WTERMSIG 9
 *
 * An exit code sits in the high byte. A terminating signal sits in the low
 * seven bits. They cannot be confused and a parent calling waitpid can always
 * tell which happened.
 *
 * THIRD, the shell throws that away. $? is one byte, so it reports a death as
 * 128 plus the signal number:
 *
 *     killed by SIGINT    2    $? = 130
 *     killed by SIGKILL   9    $? = 137
 *     killed by SIGSEGV  11    $? = 139
 *     killed by SIGTERM  15    $? = 143
 *     killed by SIGRTMIN 34    $? = 162
 *     killed by SIGRTMAX 64    $? = 192
 *
 * And measured directly:
 *
 *     ( exit 137 )              $? = 137
 *     sh -c 'kill -9 $$'        $? = 137
 *
 * The same number for two entirely different events. Every exit code from 129
 * to 192 collides with a signal death, which is the whole range a program
 * reaches by returning a negative number or by adding to 128 deliberately. The
 * kernel knew the difference and $? cannot express it.
 *
 * FOURTH, 126 and 127 are the shell's own and the kernel never produces them:
 *
 *     a command that does not exist        $? = 127
 *     a file that exists and is not executable  $? = 126
 *
 * Nothing exited with those. bash chose them, which is why a 127 from a program
 * that really did exit with 127 reads as a missing binary to everyone who looks.
 *
 * FIFTH, the core dump flag is bit 0x80 of the low byte, and it is a property
 * of the limit rather than of the signal:
 *
 *     with RLIMIT_CORE at 0, SIGSEGV     raw 0x000b   WCOREDUMP 0
 *     with RLIMIT_CORE raised, SIGSEGV   raw 0x008b   WCOREDUMP set
 *     with RLIMIT_CORE at 0, SIGQUIT     raw 0x0003   WCOREDUMP 0
 *     with RLIMIT_CORE raised, SIGQUIT   raw 0x0083   WCOREDUMP set
 *
 * $? is 139 in both cases. Whether a core was written is not in it.
 *
 * SIXTH, a pipeline reports its last command and nothing else:
 *
 *     false | true                 $? = 0    PIPESTATUS 1 0
 *     ( exit 42 ) | ( exit 7 )     $? = 7    PIPESTATUS 42 7
 *     killed by SIGKILL | true     $? = 0    PIPESTATUS 137 0
 *
 * The last row is the one that costs people a night: a process killed by the
 * out of memory killer, inside a pipeline, reports success.
 *
 * Not modeled: WIFSTOPPED and WIFCONTINUED, which need WUNTRACED and are about
 * a process that has not ended; the 124 that timeout(1) uses and the other
 * conventions particular commands have adopted; set -e and set -o pipefail,
 * which change what the shell does with these numbers rather than what the
 * numbers are; and what a language runtime does to the code on the way out,
 * which for several of them is its own truncation.
 */

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What the process was doing. */
  job: string;
  /** Whether it called exit, or was killed. */
  ending: "exited" | "signaled";
  /** The number passed to exit(). Ignored when it was killed. */
  code: number;
  /** The signal that killed it. Ignored when it exited. */
  sig: number;
  /** Whether the core limit allowed a dump. Only meaningful for a death. */
  coreAllowed: boolean;
  /** Whether it ran as the last command of a pipeline, the middle, or alone. */
  place: "alone" | "first in a pipeline" | "last in a pipeline";
  /** The exit code of the command after it, when it is not the last. */
  nextCode: number;
}

export type Claim =
  /** What the shell puts in $?. */
  | { about: "shellStatus"; value: number }
  /** The raw word waitpid fills in. */
  | { about: "rawStatus"; value: number }
  /** What WEXITSTATUS would give, which is only meaningful for an exit. */
  | { about: "exitStatus"; value: number }
  /** Whether a parent calling waitpid can tell an exit from a death. */
  | { about: "distinguishable"; value: boolean }
  /** Whether a core was written. */
  | { about: "cored"; value: boolean }
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
