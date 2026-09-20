/**
 * Argument list too long, on a command line well under ARG_MAX.
 *
 * Measured on the host this was written on, kernel 6.18.44, by execing
 * /bin/true with a bisected number of arguments and reading errno. Eight
 * independent measurements, and one formula fits all of them to within a
 * single argument.
 *
 * WHAT THE SYSTEM SAYS:
 *
 *     getconf ARG_MAX      2097152
 *     RLIMIT_STACK soft    8388608   (8 MiB)
 *     page size            4096
 *
 * The first number is the second divided by four, and getconf is reporting
 * that rather than a constant. Lower the stack limit and it follows:
 *
 *     stack       stack/4     64 byte arguments that fit
 *      2 MiB       524288                          7181
 *      4 MiB      1048576                         14363
 *      8 MiB      2097152                         28727
 *     16 MiB      4194304                         57455
 *
 * WHAT THE BUDGET IS SPENT ON, which is the part that catches people. Every
 * argument costs its own bytes, plus a NUL, plus EIGHT BYTES OF POINTER. On
 * short arguments the pointer is most of the cost:
 *
 *     argument size    arguments that fit    bytes of actual text
 *                 1               208840                  417680
 *                 8               122847                 1105623
 *                64                28608                 1859520
 *               1024                 2021                 2069504
 *
 * So a limit advertised as two megabytes carries four hundred kilobytes of
 * short filenames. That is the difference between "my list is only 600 KB, it
 * should fit" and the error you actually get.
 *
 * THE ENVIRONMENT IS CHARGED TO THE SAME BUDGET, on the same terms. Measured
 * across a swing of a megabyte, with 64 byte arguments:
 *
 *     env strings        env vars    arguments that fit
 *              28               2                 28727
 *          500074              11                 21876
 *         1000144              21                 15024
 *
 * Which is why `env -i` really does let a command line through that failed a
 * moment earlier, and why the same script fails on one machine and not
 * another with no change to the script.
 *
 * ONE STRING CAN FAIL ON ITS OWN. Bisected to the byte:
 *
 *     longest single argument that execs    131071 bytes
 *     32 pages                              131072 bytes
 *
 * That is MAX_ARG_STRLEN, it is not tunable, and it applies to environment
 * variables too: a single 500 KB variable made every exec fail regardless of
 * how short the command line was.
 *
 * AND THE PROGRAM PATH IS CHARGED TWICE, which is not in any documentation I
 * could find and turned up as a discrepancy rather than as a fact. The formula
 * without it fit nineteen measurements and missed four by exactly one
 * argument, and the size of the miss tracked the length of argv[0]. execve
 * copies bprm->filename onto the new stack in its own right and then copies
 * the caller's argv, which begins with the same path, so a long path is paid
 * for twice and only one of the two copies carries a pointer.
 *
 * Pinned by holding the argument count fixed and lengthening argv[0] one byte
 * at a time, which gives a resolution of one byte rather than one argument:
 *
 *     argv[0]    arguments of 8 bytes that fit    what the formula spends
 *         100                           123348                    2097138
 *         175                           123340                    2097152
 *         250                           123331                    2097149
 *         350                           123319                    2097145
 *
 * At 175 bytes the vector lands exactly on the budget, to the byte.
 *
 * THE FORMULA:
 *
 *     budget = RLIMIT_STACK / 4
 *     cost   = sum over argv and envp of (8 + length + 1)
 *              plus the program path and its NUL, a second time
 *     E2BIG when cost > budget, or when any one string is 131072 or longer
 *
 * Twenty three measurements reproduce exactly: seven argument sizes, three
 * environment sizes spanning a megabyte, four stack limits spanning eight
 * times, four lengths of argv[0], and the per-string cap bisected to the byte.
 * In every one of them the vector that fits leaves less than one more
 * argument of room, which is the signature of a formula sitting on the wall
 * rather than near it.
 *
 * Not modeled: what execve does on architectures where a pointer is not eight
 * bytes; the kernel's own lower bound of 32 pages, which only matters on a
 * stack limit far smaller than anything here; whether the shell, xargs or the
 * kernel is the thing refusing, since the shells and xargs apply their own
 * lower limits first; and RLIMIT_STACK set to unlimited, where the kernel uses
 * a fixed ceiling instead of a quarter of infinity.
 */

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** RLIMIT_STACK soft limit, in bytes. The budget is a quarter of it. */
  stackBytes: number;
  /** Arguments on the command line, not counting the program itself. */
  argCount: number;
  /** How long each of those arguments is, in bytes. */
  argBytes: number;
  /** argv[0], which is charged exactly like every other argument. */
  programBytes: number;
  /** Environment variables, each costing a pointer. */
  envCount: number;
  /** Bytes of environment strings, counting NAME, the equals and the NUL. */
  envBytes: number;
  /** The longest single string anywhere in argv or envp. */
  longestStringBytes: number;
}

export type Claim =
  /** Whether the exec succeeds. */
  | { about: "fits"; value: boolean }
  /** Which limit refused it. */
  | { about: "refusedBy"; name: string }
  /** The whole budget, in bytes. */
  | { about: "budget"; value: number }
  /** What one argument of this length costs against it. */
  | { about: "costPerArg"; value: number }
  /** What the program path costs, which is twice what anyone expects. */
  | { about: "programCost"; value: number }
  /** How many arguments of this length would fit. */
  | { about: "maxArgs"; value: number }
  /** Bytes of actual argument text that budget carries at this length. */
  | { about: "textBytes"; value: number }
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
