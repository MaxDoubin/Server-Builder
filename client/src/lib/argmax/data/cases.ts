import type { Case } from "../types";

const MiB = 1024 * 1024;
/** The inherited environment on the host these were measured on. */
const ENV_COUNT = 140;
const ENV_BYTES = 7598;
/** argv[0] for the usual suspects. */
const RM = 12;

/**
 * Ten command lines, one exec each.
 *
 * Every number in an option comes from the model, and the gate recomputes each
 * of them by laying the vector out string by string rather than by multiplying.
 */
export const CASES: Case[] = [
  {
    slug: "under-the-limit-and-over-the-budget",
    name: "One point eight megabytes against two",
    brief:
      "A cleanup job expands to 48,000 paths of about forty bytes each. That is 1.83 MiB of filenames, against a limit the machine reports as 2 MiB, and it fails before the command runs.",
    setup: {
      host: "batch-04",
      stackBytes: 8 * MiB,
      argCount: 48_000,
      argBytes: 40,
      programBytes: RM,
      envCount: ENV_COUNT,
      envBytes: ENV_BYTES,
      longestStringBytes: 40,
    },
    question: "The names are under the limit. Why is this E2BIG?",
    options: [
      { id: "pointers", claim: "Each argument also costs an eight byte pointer and a terminator, so forty bytes of filename costs forty nine", says: { about: "costPerArg", value: 49 } },
      { id: "fits", claim: "It is not. 1.83 MiB is under 2 MiB and the exec succeeds", says: { about: "fits", value: true } },
      { id: "count", claim: "The limit is on the number of arguments, and 48,000 is past it", says: { about: "nothing" } },
      { id: "strlen", claim: "One of the paths is over MAX_ARG_STRLEN", says: { about: "refusedBy", name: "MAX_ARG_STRLEN, one string of 32 pages or more" } },
    ],
    why:
      "The budget pays for the vector, not the text. Every string costs its own bytes, a NUL, and a pointer in the array, so a forty byte path costs forty nine. 48,000 of them is 2.35 MB against a 2 MiB budget. Measured across seven argument sizes on one host, and the same arithmetic fits all of them.",
    fix:
      "Split the list, or pass it on standard input. xargs exists for this and works out the split for you.",
    breaks: "ARG_MAX is the number of bytes of arguments you can pass",
  },
  {
    slug: "how-many-actually-fit",
    name: "Forty two thousand six hundred and twenty",
    brief:
      "Same machine, same forty byte paths, same inherited environment of 140 variables. Somebody wants to know where the wall actually is so they can size the batches.",
    setup: {
      host: "batch-04",
      stackBytes: 8 * MiB,
      argCount: 1,
      argBytes: 40,
      programBytes: RM,
      envCount: ENV_COUNT,
      envBytes: ENV_BYTES,
      longestStringBytes: 40,
    },
    question: "How many forty byte paths fit?",
    options: [
      { id: "naive", claim: "52428, which is two mebibytes divided by forty", says: { about: "maxArgs", value: 52_428 } },
      { id: "count", claim: "There is no count: the limit is on bytes, so it depends only on the total", says: { about: "nothing" } },
      { id: "real", claim: "42620. The budget less the environment and the program, divided by forty nine", says: { about: "maxArgs", value: 42_620 } },
      { id: "arg-max", claim: "131072, the per-string cap, since that is the only hard number here", says: { about: "maxArgs", value: 131_072 } },
    ],
    why:
      "2,097,152 of budget, less 8,718 for the 140 environment variables and their pointers, less 34 for the program path, leaves 2,088,400 for arguments at 49 bytes each. Measured: the bisected wall on this host was 42,620, and the vector that fits leaves 20 bytes spare, which is less than one more argument.",
    fix:
      "Size batches on the cost, not the text. A rule of thumb that works: take the budget, subtract the environment, and divide by the path length plus nine.",
    breaks: "the limit is a count of arguments",
  },
  {
    slug: "the-text-you-actually-get",
    name: "Half the budget is pointers",
    brief:
      "The same host, but the paths are short: eight byte names in a flat directory. The operator reasons that short names mean many more of them, which is true, and that the two megabyte budget is now mostly filenames, which is not.",
    setup: {
      host: "batch-04",
      stackBytes: 8 * MiB,
      argCount: 1,
      argBytes: 8,
      programBytes: RM,
      envCount: ENV_COUNT,
      envBytes: ENV_BYTES,
      longestStringBytes: 8,
    },
    question: "How many bytes of actual filename does the budget carry here?",
    options: [
      { id: "all", claim: "2088400, the whole budget less the environment and the program", says: { about: "textBytes", value: 2_088_400 } },
      { id: "real", claim: "982776. Each name costs 17 bytes to carry 8, so nearly half the budget is pointers and terminators", says: { about: "textBytes", value: 982_776 } },
      { id: "half-exact", claim: "1044200, exactly half, since a pointer is eight bytes and a name is eight bytes", says: { about: "textBytes", value: 1_044_200 } },
      { id: "fits", claim: "It cannot be worked out: the budget is in bytes and the answer is in bytes, so they are the same", says: { about: "nothing" } },
    ],
    why:
      "122,847 names at 17 bytes each. The pointer is 8 of those 17, so 47 percent of what the kernel copies is the array rather than anything you typed. This is why the shorter the names, the further the real limit is from the advertised one. Measured at 122,847 on this host.",
    fix:
      "Nothing to fix here, but stop estimating from the byte count of the text. The overhead is nine bytes an argument and it does not scale down.",
    breaks: "a two megabyte budget carries two megabytes of text",
  },
  {
    slug: "the-environment-is-charged-too",
    name: "A megabyte of environment",
    brief:
      "A build runner sets a lot of variables. The environment comes to a megabyte across 21 of them. The same command that runs by hand fails in the job, and the script is identical.",
    setup: {
      host: "runner-09",
      stackBytes: 8 * MiB,
      argCount: 30_000,
      argBytes: 40,
      programBytes: RM,
      envCount: 21,
      envBytes: 1_000_144,
      longestStringBytes: 40,
    },
    question: "Does this exec succeed?",
    options: [
      { id: "yes", claim: "Yes. The command line is 1.4 MB and the budget is 2 MiB", says: { about: "fits", value: true } },
      { id: "strlen", claim: "No, because one environment variable is over the per-string cap", says: { about: "refusedBy", name: "MAX_ARG_STRLEN, one string of 32 pages or more" } },
      { id: "envmax", claim: "No, and the environment has its own separate limit that this exceeds", says: { about: "nothing" } },
      { id: "no", claim: "No. The environment is charged to the same budget, so a megabyte of it leaves a megabyte for arguments", says: { about: "refusedBy", name: "the budget, a quarter of RLIMIT_STACK" } },
    ],
    why:
      "argv and envp are copied onto the same new stack and charged against the same number. A megabyte of environment halves what the command line can be. Measured with 64 byte arguments: 28,727 of them fit with a two variable environment, 21,876 with 500 KB of it, and 15,024 with a megabyte.",
    fix:
      "env -i, or prune the variables the command does not need. It is the one fix that costs nothing and is never the one people try.",
    breaks: "the environment has nothing to do with the command line",
  },
  {
    slug: "one-enormous-argument",
    name: "One argument, two hundred kilobytes",
    brief:
      "A tool is handed a single argument holding a serialized blob of two hundred kilobytes. Everything else about the command line is tiny, and it still will not run.",
    setup: {
      host: "api-02",
      stackBytes: 8 * MiB,
      argCount: 1,
      argBytes: 204_800,
      programBytes: RM,
      envCount: ENV_COUNT,
      envBytes: ENV_BYTES,
      longestStringBytes: 204_800,
    },
    question: "The total is 213 KB against a 2 MiB budget. What refuses it?",
    options: [
      { id: "budget", claim: "The budget, a quarter of RLIMIT_STACK", says: { about: "refusedBy", name: "the budget, a quarter of RLIMIT_STACK" } },
      { id: "strlen", claim: "MAX_ARG_STRLEN: no single string may reach 32 pages, whatever the total is", says: { about: "refusedBy", name: "MAX_ARG_STRLEN, one string of 32 pages or more" } },
      { id: "fits", claim: "Nothing. It is well under the budget and the exec succeeds", says: { about: "fits", value: true } },
      { id: "pipe", claim: "Nothing in the kernel: the shell refuses it before execve is reached", says: { about: "nothing" } },
    ],
    why:
      "There is a second limit, on each string rather than on the total, and it is 32 pages. Bisected to the byte on this host: an argument of 131,071 bytes execs and 131,072 does not. It is not tunable and it applies to environment variables as well, which is why one oversized variable makes every exec in a shell fail at once.",
    fix:
      "Pass the blob on standard input or in a file. Nothing you can set will make a single 200 KB argument work.",
    breaks: "a command line fails only when there is too much of it",
  },
  {
    slug: "raise-the-stack-limit",
    name: "ulimit -s and the budget",
    brief:
      "The batch has to go through in one exec. Somebody suggests raising a limit, and the argument is about which one, since the message says nothing about stacks.",
    setup: {
      host: "batch-04",
      stackBytes: 64 * MiB,
      argCount: 1,
      argBytes: 40,
      programBytes: RM,
      envCount: ENV_COUNT,
      envBytes: ENV_BYTES,
      longestStringBytes: 40,
    },
    question: "The stack limit is raised to 64 MiB. What is the budget now?",
    options: [
      { id: "same", claim: "2097152. ARG_MAX is a constant and the stack has nothing to do with it", says: { about: "budget", value: 2_097_152 } },
      { id: "all", claim: "67108864, the whole stack limit", says: { about: "budget", value: 67_108_864 } },
      { id: "quarter", claim: "16777216, a quarter of the stack limit, and getconf ARG_MAX will now say so too", says: { about: "budget", value: 16_777_216 } },
      { id: "capped", claim: "131072, because MAX_ARG_STRLEN caps the whole vector as well as each string", says: { about: "budget", value: 131_072 } },
    ],
    why:
      "getconf ARG_MAX is not reporting a constant, it is reporting a quarter of RLIMIT_STACK. Measured across four stack limits on one host: 2 MiB of stack gave 7,181 arguments of 64 bytes, 4 MiB gave 14,363, 8 MiB gave 28,727 and 16 MiB gave 57,455. Each is within one argument of a quarter of the stack.",
    fix:
      "ulimit -s raises it for that shell and its children. It is a real fix and it is also a sign the command should be batched.",
    breaks: "ARG_MAX is a constant you cannot change",
  },
  {
    slug: "the-program-path-is-charged-twice",
    name: "The path, twice",
    brief:
      "The same command, invoked through a three hundred byte absolute path from a deeply nested tool directory rather than from PATH.",
    setup: {
      host: "batch-04",
      stackBytes: 8 * MiB,
      argCount: 1,
      argBytes: 40,
      programBytes: 300,
      envCount: ENV_COUNT,
      envBytes: ENV_BYTES,
      longestStringBytes: 300,
    },
    question: "What does that three hundred byte path cost the budget?",
    options: [
      { id: "nothing", claim: "Nothing. argv[0] is the program, not an argument, and is not charged", says: { about: "nothing" } },
      { id: "once", claim: "309, the path plus a NUL plus its pointer", says: { about: "nothing" } },
      { id: "twice", claim: "610. execve copies the path onto the new stack in its own right and then copies argv, which begins with the same path", says: { about: "programCost", value: 610 } },
      { id: "pathmax", claim: "4096, because the kernel reserves PATH_MAX for it", says: { about: "nothing" } },
    ],
    why:
      "This one is not documented anywhere I could find, and it turned up as a discrepancy: a formula that fit nine measurements missed four by exactly one argument, and the size of the miss tracked the length of argv[0]. Pinned by holding the argument count fixed and lengthening argv[0] a byte at a time. At 175 bytes the vector landed exactly on the budget and every byte beyond it was E2BIG.",
    fix:
      "It costs two bytes per byte of path, so it only matters at the margin. Worth knowing when a command works from PATH and fails by absolute path.",
    breaks: "the program is not one of the arguments",
  },
  {
    slug: "it-actually-fits",
    name: "Twenty thousand, and fine",
    brief:
      "The same cleanup, batched down to twenty thousand paths. Somebody has been burned by this before and wants to know whether the batch size is safe or merely lucky.",
    setup: {
      host: "batch-04",
      stackBytes: 8 * MiB,
      argCount: 20_000,
      argBytes: 40,
      programBytes: RM,
      envCount: ENV_COUNT,
      envBytes: ENV_BYTES,
      longestStringBytes: 40,
    },
    question: "Does this one go through?",
    options: [
      { id: "yes", claim: "Yes. It spends 988752 of 2097152 and has more than half the budget spare", says: { about: "fits", value: true } },
      { id: "no", claim: "No: twenty thousand arguments is past what any exec takes", says: { about: "fits", value: false } },
      { id: "xargs", claim: "Only through xargs. A direct exec of twenty thousand arguments always fails", says: { about: "nothing" } },
      { id: "maybe", claim: "It depends on the filesystem, which this does not describe", says: { about: "nothing" } },
    ],
    why:
      "Twenty thousand at 49 bytes is 980,000, plus 8,718 of environment and 34 for the program, against 2,097,152. It is not close. The value of doing the arithmetic is knowing that, rather than reaching for xargs because a previous list once failed.",
    fix:
      "Nothing. Keep the batch size, and recompute it if the environment grows or the paths get longer.",
    breaks: "a long list always needs xargs",
  },
  {
    slug: "long-paths-and-the-overhead",
    name: "Kilobyte paths",
    brief:
      "A media pipeline passes full paths that run to about a kilobyte each, out of a deeply nested tree with long descriptive directory names.",
    setup: {
      host: "media-01",
      stackBytes: 8 * MiB,
      argCount: 1,
      argBytes: 1024,
      programBytes: RM,
      envCount: ENV_COUNT,
      envBytes: ENV_BYTES,
      longestStringBytes: 1024,
    },
    question: "What does one of these paths cost against the budget?",
    options: [
      { id: "exact", claim: "1024, the length of the path", says: { about: "costPerArg", value: 1024 } },
      { id: "rounded", claim: "4096, because the kernel copies whole pages", says: { about: "costPerArg", value: 4096 } },
      { id: "real", claim: "1033: the path, a NUL, and eight bytes of pointer, which is under one percent of it here", says: { about: "costPerArg", value: 1033 } },
      { id: "twice", claim: "2048, since every string is copied twice", says: { about: "costPerArg", value: 2048 } },
    ],
    why:
      "The overhead is nine bytes whatever the argument is, so it dominates short arguments and disappears into long ones: 47 percent of the cost at eight byte names, one percent at a kilobyte. Measured at 2,021 paths of 1024 bytes on this host, against 122,847 of 8 bytes.",
    fix:
      "Nothing. The useful consequence is that long paths waste less of the budget proportionally, so a pipeline with deep paths hits this later than one with short names.",
    breaks: "the per-argument overhead is negligible",
  },
  {
    slug: "works-here-fails-there",
    name: "It works on my machine",
    brief:
      "The identical script, the identical kernel, the identical list of twenty six thousand paths. It runs on the developer's laptop and fails in the job runner, and the diff between the two is empty.",
    setup: {
      host: "runner-12",
      stackBytes: 8 * MiB,
      argCount: 26_000,
      argBytes: 40,
      programBytes: RM,
      envCount: 25,
      envBytes: 1_048_000,
      longestStringBytes: 40,
    },
    question: "Nothing about the command differs. What does?",
    options: [
      { id: "env", claim: "The environment. A megabyte of variables on the runner is a megabyte the command line does not get", says: { about: "fits", value: false } },
      { id: "kernel", claim: "The kernel version, since ARG_MAX changed between releases", says: { about: "nothing" } },
      { id: "fs", claim: "The filesystem the paths are on", says: { about: "nothing" } },
      { id: "shell", claim: "The shell, which applies its own limit before the kernel sees anything", says: { about: "nothing" } },
    ],
    why:
      "Two things in the budget come from the machine rather than the command: RLIMIT_STACK and the environment. A runner that exports a megabyte of configuration has halved the command line for everything it runs, and nothing in the error says so. Measured: 28,727 arguments with a two variable environment against 15,024 with a megabyte of one.",
    fix:
      "Compare env | wc -c and ulimit -s between the two machines before comparing anything else. It is two commands and it is almost always one of them.",
    breaks: "the same command behaves the same way on two machines with the same kernel",
  },
];
