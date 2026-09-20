import type { Case } from "../types";

/**
 * Ten endings, and what each one leaves behind.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * packing and unpacking the status word the way wait.h does, with the macros
 * transcribed rather than the model's conditions read twice.
 *
 * Six of the ten turn on the same collision, deliberately. The whole difficulty
 * is that one byte is being asked to carry two different kinds of news.
 */
export const CASES: Case[] = [
  {
    slug: "the-count-that-looked-like-success",
    name: "Two hundred and fifty six errors",
    brief:
      "A validator returns the number of problems it found as its exit code, so that a wrapper can act on the count. A bad import produces exactly 256 problems.",
    setup: { host: "ci-runner-3", job: "a validator returning its error count", ending: "exited", code: 256, sig: 0, coreAllowed: false, place: "alone", nextCode: 0 },
    question: "What does the wrapper see in $??",
    options: [
      { id: "zero", claim: "0. A status is one byte, so 256 truncates to nothing and the run reads as clean", says: { about: "shellStatus", value: 0 } },
      { id: "full", claim: "256, because exit takes an int and the shell reads an int", says: { about: "shellStatus", value: 256 } },
      { id: "clamp", claim: "255, clamped to the largest value a status can hold", says: { about: "shellStatus", value: 255 } },
      { id: "one", claim: "1, because any nonzero count is reported as a generic failure", says: { about: "shellStatus", value: 1 } },
    ],
    why:
      "The status is the code and 0xff. Measured: 256, 512 and 768 all came back 0, 300 came back 44 and 1000 came back 232. There is no error and no warning at either end, because exit() does not return and the parent sees a perfectly clean WIFEXITED.",
    fix:
      "Never put a count in an exit code. Print it and exit 0 or 1. If the wrapper needs the number it can read the output, which has no ceiling.",
    breaks: "an exit code is a number",
  },
  {
    slug: "the-negative-one",
    name: "Minus one",
    brief:
      "A daemon written by somebody used to returning negative numbers on failure calls exit(-1) on a configuration error.",
    setup: { host: "edge-02", job: "a daemon failing to parse its configuration", ending: "exited", code: -1, sig: 0, coreAllowed: false, place: "alone", nextCode: 0 },
    question: "What does WEXITSTATUS give the parent?",
    options: [
      { id: "neg", claim: "It gives -1, which the parent can test for as a negative", says: { about: "nothing" } },
      { id: "one", claim: "1, because the shell normalizes any failure to 1", says: { about: "exitStatus", value: 1 } },
      { id: "ff", claim: "255. The byte is two's complement, so -1 is 0xff and the status is 255", says: { about: "exitStatus", value: 255 } },
      { id: "cored", claim: "It depends on the core limit, which decides the low bits", says: { about: "cored", value: true } },
    ],
    why:
      "Measured: exit(-1) gave a raw status of 0xff00 and WEXITSTATUS 255, and exit(-2) gave 254. There is no signed exit status anywhere in the interface. Anyone matching on -1 is matching on something that never arrives.",
    fix:
      "Use a small positive number. Reserve 1 for a general failure and give anything else a documented meaning, staying well under 126 so it cannot be read as one of the shell's own.",
    breaks: "exit takes an int, so it can carry a negative",
  },
  {
    slug: "the-hundred-and-thirty-seven",
    name: "A hundred and thirty seven",
    brief:
      "A batch job reports $? = 137 and the on-call engineer writes it up as an out of memory kill, because 137 is 128 plus 9 and 9 is SIGKILL. The job's own source turns out to end with exit(137).",
    setup: { host: "batch-11", job: "a batch job that exits 137 on a full disk", ending: "exited", code: 137, sig: 0, coreAllowed: false, place: "alone", nextCode: 0 },
    question: "Can $? alone tell these two apart?",
    options: [
      { id: "yes", claim: "Yes. A death sets a flag alongside the number, and the shell exposes it", says: { about: "distinguishable", value: true } },
      { id: "no", claim: "No. Both readings give 137, and $? has no room to say which happened", says: { about: "distinguishable", value: false } },
      { id: "raw", claim: "Yes, and the raw status is the same either way", says: { about: "rawStatus", value: 137 } },
      { id: "shell", claim: "Not relevant here: the shell reports 9 for a signal, so there is no overlap", says: { about: "shellStatus", value: 9 } },
    ],
    why:
      "Measured both ways: ( exit 137 ) gave 137, and sh -c 'kill -9 $$' gave 137. The kernel is not confused at all, it puts an exit in the high byte and a signal in the low seven bits, so the raw statuses are 0x8900 and 0x0009. The shell's one byte cannot carry both facts, so it adds 128 to a signal and hopes.",
    fix:
      "Read the raw status, not $?. In a supervisor use waitpid and WIFSIGNALED; from a shell, check dmesg or the cgroup's memory events before calling it an out of memory kill.",
    breaks: "a status in the 130s means the process was killed",
  },
  {
    slug: "the-one-that-really-was-killed",
    name: "The one that really was killed",
    brief:
      "The same host the next night, and the same $? = 137, except this time the job did not choose it.",
    setup: { host: "batch-11", job: "a batch job the out of memory killer ended", ending: "signaled", code: 0, sig: 9, coreAllowed: false, place: "alone", nextCode: 0 },
    question: "What is the raw status the parent reads?",
    options: [
      { id: "shifted", claim: "The high byte carries it, so the word is 0x8900, the same as an exit of 137", says: { about: "rawStatus", value: 0x8900 } },
      { id: "base", claim: "The word is 0x0089, the shell's 137 written into the low byte", says: { about: "rawStatus", value: 0x89 } },
      { id: "same", claim: "There is no way to tell from the raw status either", says: { about: "distinguishable", value: true } },
      { id: "sig", claim: "The word is 0x0009. A signal goes in the low seven bits, where no exit code can reach", says: { about: "rawStatus", value: 9 } },
    ],
    why:
      "Measured: killed by SIGKILL gave a raw status of 0x0009, with WIFEXITED 0, WIFSIGNALED 1 and WTERMSIG 9. The previous case, exiting 137, gave 0x8900. A parent using waitpid can always tell. The information is thrown away one layer up, in the shell.",
    fix:
      "Nothing to fix here, but note the asymmetry: the supervisor above this process can tell what happened and the shell script beside it cannot. Put the decision in the supervisor.",
    breaks: "the shell and the kernel are reporting the same thing",
  },
  {
    slug: "the-core-that-was-not-written",
    name: "The core that was not written",
    brief:
      "A service dies on SIGSEGV. The runbook says to collect the core file. RLIMIT_CORE on this host is 0.",
    setup: { host: "api-04", job: "a service taking a segmentation fault", ending: "signaled", code: 0, sig: 11, coreAllowed: false, place: "alone", nextCode: 0 },
    question: "Was a core written?",
    options: [
      { id: "yes", claim: "Yes. SIGSEGV is a core dumping signal and that is a property of the signal", says: { about: "cored", value: true } },
      { id: "no", claim: "No. The flag is set only when the limit allows it, and the limit here is 0", says: { about: "cored", value: false } },
      { id: "raw", claim: "Yes, and the raw status says so: it reads 0x008b", says: { about: "rawStatus", value: 0x8b } },
      { id: "status", claim: "The status would be 139 either way, so the question cannot be answered", says: { about: "nothing" } },
    ],
    why:
      "Measured both ways on the same host. With RLIMIT_CORE at 0, SIGSEGV gave a raw status of 0x000b and WCOREDUMP unset. With the limit raised, the same signal gave 0x008b and WCOREDUMP set. SIGQUIT behaved the same way, 0x0003 against 0x0083. $? is 139 in all four.",
    fix:
      "Raise RLIMIT_CORE before you need it, and check core_pattern, which decides where the file goes or which handler it is piped to. Neither is visible in the exit status.",
    breaks: "a core dumping signal dumps core",
  },
  {
    slug: "the-core-that-was",
    name: "The same fault, with the limit raised",
    brief:
      "The same service and the same fault, on a host where RLIMIT_CORE has been raised.",
    setup: { host: "api-05", job: "a service taking a segmentation fault", ending: "signaled", code: 0, sig: 11, coreAllowed: true, place: "alone", nextCode: 0 },
    question: "What is the raw status now?",
    options: [
      { id: "plain", claim: "The word is 0x000b, the same as before, because the signal has not changed", says: { about: "rawStatus", value: 0xb } },
      { id: "high", claim: "The word is 0x0b80, with the flag moved into the high byte", says: { about: "rawStatus", value: 0x0b80 } },
      { id: "shell", claim: "It does not matter, because $? changes to 267", says: { about: "shellStatus", value: 267 } },
      { id: "flag", claim: "The word is 0x008b. Bit 0x80 of the low byte is the core flag and it is now set", says: { about: "rawStatus", value: 0x8b } },
    ],
    why:
      "Measured: 0x008b with the limit raised against 0x000b with it at 0. The signal number is unchanged in the low seven bits and the eighth bit is the core flag. $? is 139 in both cases, so a script cannot tell whether it has a core to go and look for.",
    fix:
      "If the supervisor needs to know, have it call waitpid and read WCOREDUMP. A shell wrapper cannot find out and should not try.",
    breaks: "the exit status tells you whether there is a core to collect",
  },
  {
    slug: "the-command-that-was-not-there",
    name: "The command that was not there",
    brief:
      "A deploy script runs a helper that is not on the PATH of the container it now runs in. The script checks for a specific exit code from the helper and carries on.",
    setup: { host: "deploy-01", job: "a helper binary that is not installed", ending: "exited", code: 127, sig: 0, coreAllowed: false, place: "alone", nextCode: 0 },
    question: "What does $? hold?",
    options: [
      { id: "notfound", claim: "127, which bash uses for a command it could not find and which the helper never chose", says: { about: "shellStatus", value: 127 } },
      { id: "noexec", claim: "126, which is what a missing command gives", says: { about: "shellStatus", value: 126 } },
      { id: "enoent", claim: "2, the value of ENOENT, passed up from the failed exec", says: { about: "shellStatus", value: 2 } },
      { id: "signal", claim: "It is reported as a death, because exec failing kills the subshell", says: { about: "distinguishable", value: false } },
    ],
    why:
      "127 for a command that was not found and 126 for one found but not executable are bash's own conventions, measured here, and the kernel produces neither on its own. Nothing exited with them. Which means a program that genuinely exits 127 is indistinguishable from a missing binary to everybody reading the log afterwards.",
    fix:
      "Keep your own exit codes well under 126. Test for the helper with command -v before running it, so a missing binary is a message rather than a number.",
    breaks: "every exit code came from the program that exited",
  },
  {
    slug: "the-pipeline-that-swallowed-it",
    name: "The pipeline that swallowed it",
    brief:
      "An extract is piped into a formatter: the extract is killed by the out of memory killer part way through, the formatter reads the truncated input happily and exits 0, and the script checks $? and moves on.",
    setup: { host: "etl-02", job: "an extract the out of memory killer ended", ending: "signaled", code: 0, sig: 9, coreAllowed: false, place: "first in a pipeline", nextCode: 0 },
    question: "What does $? hold after the pipeline?",
    options: [
      { id: "killed", claim: "137, because a death anywhere in a pipeline fails the pipeline", says: { about: "shellStatus", value: 137 } },
      { id: "worst", claim: "9, the signal number, which the shell surfaces from the worst member", says: { about: "shellStatus", value: 9 } },
      { id: "clean", claim: "0. A pipeline reports its last command, and the formatter succeeded", says: { about: "shellStatus", value: 0 } },
      { id: "cored", claim: "It reports 139, and there is a core to look at", says: { about: "cored", value: true } },
    ],
    why:
      "Measured: a child killed by SIGKILL piped into true left $? at 0, with PIPESTATUS reading 137 0. The status of everything but the last command is discarded unless you ask for it. This is the shape of a pipeline that silently processes half a dataset every night.",
    fix:
      "Set -o pipefail, or read PIPESTATUS. pipefail is one line at the top of the script and turns this from silent into loud.",
    breaks: "a pipeline fails if anything in it fails",
  },
  {
    slug: "the-signal-that-fits-in-the-gap",
    name: "The gap between the halves",
    brief:
      "A wrapper wants to pass a subprocess's fate up to its own caller, so when the subprocess is killed by SIGTERM it calls exit(143) to match what the shell would have shown.",
    setup: { host: "wrap-01", job: "a wrapper exiting 143 to mirror a SIGTERM", ending: "exited", code: 143, sig: 0, coreAllowed: false, place: "alone", nextCode: 0 },
    question: "Can a parent calling waitpid tell this apart from a real SIGTERM?",
    options: [
      { id: "no", claim: "No, which is the point of choosing 143", says: { about: "distinguishable", value: false } },
      { id: "yes", claim: "Yes. WIFEXITED is 1 here and 0 for a real death, whatever the numbers look like", says: { about: "distinguishable", value: true } },
      { id: "raw", claim: "Yes, and the raw status is 0x000f, the same as a real SIGTERM", says: { about: "rawStatus", value: 0xf } },
      { id: "shell", claim: "Only in $?, which shows 15 for the real one", says: { about: "shellStatus", value: 15 } },
    ],
    why:
      "The wrapper's status word is 0x8f00 and a real SIGTERM is 0x000f, so waitpid is not fooled for a moment. It is $? that cannot tell, and $? is what the wrapper was imitating. The trick works on exactly the layer it was aimed at and nowhere else, which is worth knowing before relying on it.",
    fix:
      "It is a reasonable convention for shell callers and it should be written down, because a supervisor reading WIFSIGNALED will disagree with the shell about what happened to this process.",
    breaks: "mirroring 128 plus the signal makes a wrapper transparent",
  },
  {
    slug: "the-ordinary-failure",
    name: "An ordinary failure",
    brief:
      "For contrast, a job that simply fails: it exits 1, on its own, not in a pipeline.",
    setup: { host: "cron-06", job: "a job that failed and said so", ending: "exited", code: 1, sig: 0, coreAllowed: false, place: "alone", nextCode: 0 },
    question: "Can $? alone say what happened?",
    options: [
      { id: "no", claim: "No, because any status could also have come from a signal", says: { about: "distinguishable", value: false } },
      { id: "raw", claim: "Yes, and the raw status is 1", says: { about: "rawStatus", value: 1 } },
      { id: "yes", claim: "Yes. Only 129 to 192 are ambiguous, and 1 is nowhere near them", says: { about: "distinguishable", value: true } },
      { id: "status", claim: "It shows 129, the lowest value that is unambiguous", says: { about: "shellStatus", value: 129 } },
    ],
    why:
      "The collision is a range, not a property of every status. A death by signal shows as 128 plus the number, and the highest signal here is 64, so 129 through 192 are the values that could be either. Below 129 there is no ambiguity at all, which is the argument for keeping your own codes small.",
    fix:
      "Keep exit codes between 1 and 125. Everything above that is spoken for by the shell or collides with a signal, and a small number is the only kind that means what it says.",
    breaks: "every exit status is ambiguous",
  },
];
