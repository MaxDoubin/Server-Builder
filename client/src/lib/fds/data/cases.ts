import type { Case } from "../types";

/**
 * Ten processes, ten sets of limits, one question each.
 *
 * Every number in an option is produced by the model, and the gate recomputes
 * each of them by walking the four limits in a different order before the set
 * ships.
 */
export const CASES: Case[] = [
  {
    slug: "root-is-not-one-thing",
    name: "The container that is root and cannot",
    brief: "uid 0, forty of the forty one capabilities, and a startup script that raises the limit before exec.",
    setup: {
      host: "worker-01",
      fileMax: 1645588,
      nrOpen: 1048576,
      soft: 1024,
      hard: 1024,
      sysResource: false,
      wantSoft: 65536,
      wantHard: 65536,
      needFds: 4000,
      systemOpen: 4000,
    },
    question: "What hard limit does the process end up with?",
    options: [
      { id: "stuck", claim: "1024: raising a hard limit needs CAP_SYS_RESOURCE, and uid 0 does not carry it", says: { about: "hard", value: 1024 } },
      { id: "asked", claim: "65536, because it is running as root", says: { about: "hard", value: 65536 } },
      { id: "nr-open", claim: "1048576, the fs.nr_open ceiling", says: { about: "hard", value: 1048576 } },
      { id: "half", claim: "32768, because the kernel halves a request it cannot fully grant", says: { about: "nothing" } },
    ],
    why:
      "Raising RLIMIT_NOFILE's hard limit is gated on CAP_SYS_RESOURCE, not on the uid. Containers commonly drop that one capability and keep the rest, so the process can write sysctls and create namespaces and still cannot move its own limit by one. Measured on a host with CapEff 000001fffeffffff, where the single missing bit is 24: setrlimit came back with not allowed to raise maximum limit.",
    fix:
      "Set the limit outside the process, where the capability lives: LimitNOFILE in the unit file, or the runtime's --ulimit. Then check /proc/PID/limits rather than trusting the call to have worked, because setrlimit failing is a return value most startup scripts discard.",
    breaks: "uid 0 is enough to raise any limit",
  },
  {
    slug: "lowering-nr-open-freezes-everyone",
    name: "The hardening change that froze the fleet",
    brief: "fs.nr_open was lowered to 4096 to cap memory. Every long running process already held a hard limit of 20000.",
    setup: {
      host: "api-02",
      fileMax: 1645588,
      nrOpen: 4096,
      soft: 20000,
      hard: 20000,
      sysResource: false,
      wantSoft: 5000,
      wantHard: null,
      needFds: 3000,
      systemOpen: 9000,
    },
    question: "The process now tries to LOWER its soft limit to 5000. What happens?",
    options: [
      { id: "works", claim: "It works: lowering a limit never needs permission", says: { about: "frozen", value: false } },
      { id: "clamped", claim: "It is clamped to 4096, the new fs.nr_open", says: { about: "soft", value: 4096 } },
      { id: "frozen", claim: "It is refused, and both limits are now stuck where they were", says: { about: "frozen", value: true } },
      { id: "kills", claim: "The kernel lowers the process's limits for it at the next open", says: { about: "nothing" } },
    ],
    why:
      "setrlimit carries both values, so a call that only means to lower the soft limit still restates the hard one, and the kernel checks that restatement against fs.nr_open. With a held hard limit above it and no CAP_SYS_RESOURCE, every call is refused, including the ones that would reduce usage. Measured: holding hard=20000 with fs.nr_open at 4096, a call setting soft to 5000 failed with not allowed to raise maximum limit, which names the limit it was not trying to change.",
    fix:
      "Lower fs.nr_open only alongside restarting what runs above it, or not at all. A process that predates the change is frozen in both directions and nothing logs it.",
    breaks: "fs.nr_open only constrains raising a limit",
  },
  {
    slug: "the-hard-limit-is-not-the-limit",
    name: "The pool that stopped at a thousand",
    brief: "A connection pool sized for 4000, on a service whose unit file sets no LimitNOFILE.",
    setup: {
      host: "gateway-03",
      fileMax: 1645588,
      nrOpen: 1048576,
      soft: 1024,
      hard: 524288,
      sysResource: false,
      wantSoft: null,
      wantHard: null,
      needFds: 4000,
      systemOpen: 6000,
    },
    question: "What does the 1025th open return?",
    options: [
      { id: "ok", claim: "Nothing: the hard limit is 524288 and there is room", says: { about: "outcome", is: "ok" } },
      { id: "enfile", claim: "ENFILE, because the machine is out of file handles", says: { about: "outcome", is: "enfile" } },
      { id: "emfile", claim: "EMFILE, at the soft limit of 1024, with the hard limit untouched", says: { about: "outcome", is: "emfile" } },
      { id: "blocks", claim: "It blocks until another descriptor is closed", says: { about: "nothing" } },
    ],
    why:
      "alloc_fd checks the soft limit. The hard limit is only the ceiling the process may raise the soft one to, and nothing raises it automatically: a program that never calls setrlimit runs at whatever soft limit it inherited, however generous the hard limit beside it looks.",
    fix:
      "Read the first column of Max open files in /proc/PID/limits, not the second. A large hard limit next to a small soft one is the normal shape of this failure, not evidence against it.",
    breaks: "a generous hard limit means the process can open that many",
  },
  {
    slug: "raise-it-yourself-no-root-needed",
    name: "The three lines nobody adds",
    brief: "The same gateway, with setrlimit called at startup this time. Still no capabilities.",
    setup: {
      host: "gateway-04",
      fileMax: 1645588,
      nrOpen: 1048576,
      soft: 1024,
      hard: 524288,
      sysResource: false,
      wantSoft: 100000,
      wantHard: null,
      needFds: 4000,
      systemOpen: 6000,
    },
    question: "What soft limit does it run with?",
    options: [
      { id: "unchanged", claim: "1024: raising a limit needs root", says: { about: "soft", value: 1024 } },
      { id: "raised", claim: "100000, because the soft limit moves freely up to the hard one", says: { about: "soft", value: 100000 } },
      { id: "hard", claim: "524288, the hard limit, since it asked to go up", says: { about: "soft", value: 524288 } },
      { id: "refused", claim: "The call is refused and the process exits", says: { about: "frozen", value: true } },
    ],
    why:
      "Any process may set its soft limit to anything up to its own hard limit, with no capability at all. It is the hard limit that is privileged. Measured: a process with no CAP_SYS_RESOURCE raised its soft limit from 20000 to its full hard limit of 20000 without complaint.",
    fix:
      "If you control the program, raise the soft limit to the hard one at startup and stop asking operators to do it. It is three lines, it needs nothing, and it removes the most common cause of this failure.",
    breaks: "raising an open file limit always needs privilege",
  },
  {
    slug: "the-machine-was-never-the-problem",
    name: "The alert that read the wrong number",
    brief: "An operator checks fs.file-nr, sees 0 in the middle column, and concludes the machine is out of handles.",
    setup: {
      host: "batch-05",
      fileMax: 1645588,
      nrOpen: 1048576,
      soft: 65536,
      hard: 1048576,
      sysResource: false,
      wantSoft: null,
      wantHard: null,
      needFds: 100000,
      systemOpen: 563,
    },
    question: "Which of the four numbers is actually stopping this workload?",
    options: [
      { id: "file-max", claim: "fs.file-max, the machine wide limit", says: { about: "binding", name: "fs.file-max" } },
      { id: "nr-open", claim: "fs.nr_open", says: { about: "binding", name: "fs.nr_open" } },
      { id: "cap", claim: "The missing CAP_SYS_RESOURCE", says: { about: "binding", name: "CAP_SYS_RESOURCE" } },
      { id: "soft", claim: "The soft limit, at 65536, with the machine 0.03 percent used", says: { about: "binding", name: "RLIMIT_NOFILE soft" } },
    ],
    why:
      "The machine holds 563 of 1645588. The second column of fs.file-nr is documented as the number of free file handles and has been hardcoded to zero since the kernel stopped keeping a free list, so it reads 0 on an idle machine and 0 on a dying one. Measured across a run that opened and released nearly two hundred descriptors: 0 before, 0 at the peak and 0 after.",
    fix:
      "Monitor the first and third columns, allocated against max, and monitor per process counts from /proc/PID/fd. The middle column is a constant and an alert on it fires either never or always.",
    breaks: "the free column of fs.file-nr reports remaining capacity",
  },
  {
    slug: "the-capability-is-not-a-blank-cheque",
    name: "The privileged sidecar",
    brief: "A container granted CAP_SYS_RESOURCE, asking for two million descriptors.",
    setup: {
      host: "sidecar-06",
      fileMax: 1645588,
      nrOpen: 1048576,
      soft: 1024,
      hard: 1024,
      sysResource: true,
      wantSoft: 2000000,
      wantHard: 2000000,
      needFds: 900000,
      systemOpen: 20000,
    },
    question: "What hard limit does it get?",
    options: [
      { id: "nr-open", claim: "1048576: the request is clamped to fs.nr_open", says: { about: "hard", value: 1048576 } },
      { id: "asked", claim: "2000000, since it holds the capability", says: { about: "hard", value: 2000000 } },
      { id: "unchanged", claim: "1024, unchanged: over fs.nr_open the call is refused, not reduced", says: { about: "hard", value: 1024 } },
      { id: "file-max", claim: "1645588, the machine wide fs.file-max", says: { about: "hard", value: 1645588 } },
    ],
    why:
      "CAP_SYS_RESOURCE excuses the capability check and not the fs.nr_open one. In kernel/sys.c the ceiling test comes first and is unconditional, and it returns EPERM rather than reducing the request, so a privileged process asking for more than fs.nr_open keeps exactly the limit it already had. Nothing is granted and nothing is logged, and a startup script that ignores the return value carries on at 1024.",
    fix:
      "Ask for min(what you want, fs.nr_open), and check the return value. If you genuinely need more, raise fs.nr_open first, and know what you are asking for: a descriptor table is memory the kernel has to find.",
    breaks: "a request over the ceiling comes back reduced rather than refused",
  },
  {
    slug: "lowering-is-a-one-way-door",
    name: "The wrapper that tidied up",
    brief: "A supervisor drops its own hard limit to 1024 before exec, to be careful. The child needs more.",
    setup: {
      host: "runner-07",
      fileMax: 1645588,
      nrOpen: 1048576,
      soft: 1024,
      hard: 1024,
      sysResource: false,
      wantSoft: 16384,
      wantHard: 16384,
      needFds: 12000,
      systemOpen: 7000,
    },
    question: "Can the child get back to 16384?",
    options: [
      { id: "yes-own", claim: "Yes: it is raising a limit it lowered itself", says: { about: "hard", value: 16384 } },
      { id: "yes-nr", claim: "Yes, up to fs.nr_open at 1048576", says: { about: "hard", value: 1048576 } },
      { id: "no", claim: "No: the hard limit is 1024 now, and going back up needs the capability", says: { about: "hard", value: 1024 } },
      { id: "restart", claim: "Only after the descriptor table is flushed by an exec", says: { about: "nothing" } },
    ],
    why:
      "A hard limit can be lowered by anyone and raised by almost nobody, and the kernel keeps no memory of what it used to be. Lowering it is inherited across exec, so a careful wrapper permanently caps everything it launches.",
    fix:
      "Do not lower a hard limit in a supervisor unless that is exactly the sandbox you meant. Lower the soft limit instead, which the child can raise again on its own.",
    breaks: "a process can restore a hard limit it lowered itself",
  },
  {
    slug: "the-unit-file-not-the-shell",
    name: "The limit that looked fine from the terminal",
    brief: "ulimit -n in an SSH session prints 1048576. The service keeps failing at a thousand and change.",
    setup: {
      host: "app-08",
      fileMax: 1645588,
      nrOpen: 1048576,
      soft: 1024,
      hard: 1048576,
      sysResource: false,
      wantSoft: null,
      wantHard: null,
      needFds: 5000,
      systemOpen: 8000,
    },
    question: "What soft limit is the service actually running with?",
    options: [
      { id: "shell", claim: "1048576, the same as the shell reports", says: { about: "soft", value: 1048576 } },
      { id: "service", claim: "1024, whatever its own unit gave it, which the shell knows nothing about", says: { about: "soft", value: 1024 } },
      { id: "file-max", claim: "1645588", says: { about: "soft", value: 1645588 } },
      { id: "nothing", claim: "There is no way to tell from outside the process", says: { about: "nothing" } },
    ],
    why:
      "Limits are per process and inherited from whoever started you. A login shell inherits from the SSH daemon and its PAM limits; a service inherits from the manager and its unit. They are two different lineages, and reading one tells you nothing about the other.",
    fix:
      "Read /proc/PID/limits for the process that is actually failing. It is the only answer that is about that process, and it takes one command.",
    breaks: "ulimit -n in a shell reports what a service on the same host got",
  },
  {
    slug: "the-one-time-the-machine-is-the-problem",
    name: "The host that really did run out",
    brief: "Thousands of processes, each modest, on a host whose fs.file-max was turned down years ago.",
    setup: {
      host: "legacy-09",
      fileMax: 98304,
      nrOpen: 1048576,
      soft: 65536,
      hard: 65536,
      sysResource: false,
      wantSoft: null,
      wantHard: null,
      needFds: 20000,
      systemOpen: 90000,
    },
    question: "What does this process get when it opens its descriptors?",
    options: [
      { id: "enfile", claim: "ENFILE: the machine wide total would pass fs.file-max", says: { about: "outcome", is: "enfile" } },
      { id: "emfile", claim: "EMFILE, at its own soft limit", says: { about: "outcome", is: "emfile" } },
      { id: "ok", claim: "Nothing: 20000 is well inside its soft limit of 65536", says: { about: "outcome", is: "ok" } },
      { id: "oom", claim: "The allocator fails and the process is killed", says: { about: "nothing" } },
    ],
    why:
      "The per process check passes, because 20000 is inside 65536. The machine wide one does not: 90000 already open plus 20000 more is past a fs.file-max of 98304, so __alloc_file refuses and the errno is ENFILE rather than EMFILE. The two errors name which limit was hit, and telling them apart is most of the diagnosis.",
    fix:
      "ENFILE means raise fs.file-max or find what is holding ninety thousand descriptors. EMFILE means the process. Read the errno before touching anything, because the fix for one does nothing for the other.",
    breaks: "too many open files is always the per process limit",
  },
  {
    slug: "the-ceiling-above-the-ceiling",
    name: "The sysctl that was raised and did nothing",
    brief: "fs.file-max raised to four million after an outage. The soft limit was never touched.",
    setup: {
      host: "queue-10",
      fileMax: 4000000,
      nrOpen: 1048576,
      soft: 8192,
      hard: 1048576,
      sysResource: false,
      wantSoft: null,
      wantHard: null,
      needFds: 40000,
      systemOpen: 15000,
    },
    question: "Which number is stopping it now?",
    options: [
      { id: "file-max", claim: "fs.file-max, which is why it was raised", says: { about: "binding", name: "fs.file-max" } },
      { id: "soft", claim: "The soft limit at 8192, which nothing in the change touched", says: { about: "binding", name: "RLIMIT_NOFILE soft" } },
      { id: "nr-open", claim: "fs.nr_open, at 1048576", says: { about: "binding", name: "fs.nr_open" } },
      { id: "none", claim: "Nothing: four million is plenty", says: { about: "binding", name: "nothing" } },
    ],
    why:
      "fs.file-max is a ceiling over the sum of every process, and it was never the binding one here. Raising it changed a number nothing was checking against. The process still stops at its own soft limit, and the outage report says the sysctl was increased, which is true and beside the point.",
    fix:
      "Work down the chain in order: the soft limit, then the hard limit, then fs.nr_open, then fs.file-max. The first one that is smaller than what you need is the answer, and it is usually the first.",
    breaks: "raising fs.file-max raises what a process can open",
  },
];
