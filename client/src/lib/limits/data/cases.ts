/**
 * Ten processes and five mechanisms.
 *
 * Every figure came from the model. CI requires exactly one option to hold,
 * and the distractors are the values you get from the specific wrong belief
 * each case is about: limits.conf applying to a service, infinity meaning
 * unlimited, one errno meaning the other.
 */

import type { Case } from "../types";

/** systemd's shipped defaults since v240: soft 1024, hard 524288. */
const SYSTEMD_DEFAULT = { soft: 1024, hard: 524288 };
/** fs.nr_open as almost every distribution ships it. */
const NR_OPEN = 1048576;
/** fs.file-max on a machine with plenty of memory, effectively unbounded. */
const FILE_MAX = 9_000_000;

export const CASES: Case[] = [
  {
    slug: "limits-conf-does-nothing",
    name: "The file was edited and nothing changed",
    brief:
      "A service is hitting 'too many open files'. Somebody put nofile 65536 in" +
      " /etc/security/limits.conf for its user, logged out and back in, confirmed ulimit -n now" +
      " reads 65536, and restarted the service. It is still failing.",
    setup: {
      origin: "systemd",
      limitsConf: { soft: 65536, hard: 65536 },
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: null,
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: false,
      wants: 20000,
    },
    question: "What soft limit does the service actually have?",
    options: [
      {
        id: "conf",
        claim: "65536, which is what limits.conf says and what the shell confirmed",
        says: { about: "soft", value: 65536 },
      },
      {
        id: "correct",
        claim: "1024, from DefaultLimitNOFILE, because a unit never goes through pam_limits",
        says: { about: "soft", value: 1024 },
      },
      {
        id: "hard",
        claim: "524288, since systemd raised the hard limit years ago",
        says: { about: "soft", value: 524288 },
      },
      {
        id: "byconf",
        claim: "limits.conf set it, and the value simply needs a reboot to take",
        says: { about: "set-by", source: "limits.conf" },
      },
    ],
    why:
      "/etc/security/limits.conf is read by pam_limits, which is a PAM module, and PAM runs when" +
      " somebody authenticates. A unit systemd starts at boot never authenticates as anybody, so" +
      " the file is not consulted and never will be. The shell that showed 65536 is a login" +
      " session and did go through PAM, which is exactly why the check appeared to pass. Two" +
      " different mechanisms, and the one that was tested is not the one in the path.",
    fix:
      "set LimitNOFILE= in the unit, or DefaultLimitNOFILE= in /etc/systemd/system.conf for every" +
      " unit on the host. And check with cat /proc/$(pidof thing)/limits rather than with a shell," +
      " because the shell is the mechanism that is not involved.",
    breaks: "that limits.conf applies to services",
  },
  {
    slug: "the-daemon-raises-itself",
    name: "The soft limit is 1024 and it opened a hundred thousand files",
    brief:
      "The same unit, nothing changed, and a colleague points out that a well written daemon" +
      " raises its own soft limit at startup. This one does.",
    setup: {
      origin: "systemd",
      limitsConf: null,
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: null,
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: true,
      wants: 100000,
    },
    question: "What soft limit is it running with?",
    options: [
      {
        id: "default",
        claim: "1024, the DefaultLimitNOFILE soft value it was started with",
        says: { about: "soft", value: 1024 },
      },
      {
        id: "nropen",
        claim: "1048576, because raising it takes it to the kernel ceiling",
        says: { about: "soft", value: 1048576 },
      },
      {
        id: "correct",
        claim: "524288, its own hard limit, which it may raise to without privilege",
        says: { about: "soft", value: 524288 },
      },
      {
        id: "fails",
        claim: "It gets EMFILE at a hundred thousand descriptors",
        says: { about: "fails-with", errno: "EMFILE" },
      },
    ],
    why:
      "The soft limit is the one enforced and the hard limit is the ceiling the process may raise" +
      " its own soft limit to, at any time, with no privilege at all. setrlimit(2) allows it and" +
      " CAP_SYS_RESOURCE is only needed to raise the hard limit. So systemd shipping a soft of" +
      " 1024 and a hard of 524288 is a deliberate arrangement: the low soft value keeps anything" +
      " still using select(2) safe, and any program that knows it does not use select can take" +
      " the whole 524288 for itself in one call. Most do not, which is the actual problem.",
    fix:
      "nothing here. Elsewhere, if a daemon does not raise itself, LimitNOFILE= with an explicit" +
      " soft value is the fix, and it is worth reading /proc/PID/limits to find out which kind of" +
      " daemon you have before changing anything.",
    breaks: "that a process is stuck with the soft limit it was given",
  },
  {
    slug: "emfile-is-not-enfile",
    name: "Too many open files, and it is not this process",
    brief:
      "A service with LimitNOFILE=65536, holding around two thousand descriptors, suddenly" +
      " logging 'too many open files'. /proc/PID/limits shows 65536 and lsof shows nowhere near" +
      " it. Something else on the host has been leaking descriptors for a week.",
    setup: {
      origin: "systemd",
      limitsConf: null,
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: { soft: 65536, hard: 65536 },
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: 900000,
      openElsewhere: 899000,
      raisesItself: false,
      wants: 2000,
    },
    question: "Which error is it getting?",
    options: [
      {
        id: "emfile",
        claim: "EMFILE, which is what 'too many open files' means",
        says: { about: "fails-with", errno: "EMFILE" },
      },
      {
        id: "none",
        claim: "Neither: two thousand is well inside 65536",
        says: { about: "fails-with", errno: null },
      },
      {
        id: "correct",
        claim: "ENFILE: the machine's fs.file-max is full and no process can have another",
        says: { about: "fails-with", errno: "ENFILE" },
      },
      {
        id: "soft",
        claim: "Its soft limit has been silently reduced to 1024",
        says: { about: "soft", value: 1024 },
      },
    ],
    why:
      "Two limits, two errnos, and the same message from most libraries. EMFILE is this process" +
      " against its own RLIMIT_NOFILE. ENFILE is the whole machine against fs.file-max, and it" +
      " arrives while the process is nowhere near its own limit, which is why raising that limit" +
      " does nothing and why the investigation goes in circles. The process reporting the error is" +
      " usually not the process that caused it: it is whichever one happened to ask next.",
    fix:
      "read the errno rather than the message. strace the failing call, or check" +
      " /proc/sys/fs/file-nr, whose first field is descriptors allocated machine wide: if that is" +
      " near fs.file-max, find the leaker with ls /proc/*/fd | wc -l per process rather than" +
      " raising anybody's limit.",
    breaks: "that too many open files always means this process's limit",
  },
  {
    slug: "infinity-is-nr-open",
    name: "LimitNOFILE=infinity",
    brief:
      "A unit sets LimitNOFILE=infinity, on the reasoning that the machine has plenty of memory" +
      " and the service should never hit a descriptor limit again. fs.nr_open is at its default.",
    setup: {
      origin: "systemd",
      limitsConf: null,
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: { soft: 4294967295, hard: 4294967295 },
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: false,
      wants: 50000,
    },
    question: "What hard limit does it get?",
    options: [
      {
        id: "correct",
        claim: "1048576, because fs.nr_open is a ceiling on any hard limit",
        says: { about: "hard", value: 1048576 },
      },
      {
        id: "infinity",
        claim: "4294967295, which is what infinity resolves to",
        says: { about: "hard", value: 4294967295 },
      },
      {
        id: "default",
        claim: "524288, since systemd refuses the setting and falls back",
        says: { about: "hard", value: 524288 },
      },
      {
        id: "byunit",
        claim: "LimitNOFILE set it, as the unit asked",
        says: { about: "set-by", source: "LimitNOFILE" },
      },
    ],
    why:
      "getrlimit(2) is explicit: raising the hard RLIMIT_NOFILE above /proc/sys/fs/nr_open is" +
      " EPERM. fs.nr_open defaults to 1048576, so infinity is a million and a bit and not" +
      " infinity. This is mostly harmless and occasionally not: a process that reads its hard" +
      " limit and allocates a table of that size gets a million entries rather than four billion," +
      " which is the difference between a large allocation and an immediate death.",
    fix:
      "write the number you mean. LimitNOFILE=1048576 says the same thing and does not depend on a" +
      " sysctl somebody may change. If you genuinely need more, fs.nr_open has to go up first, and" +
      " it is worth asking what needs a million descriptors before doing that.",
    breaks: "that infinity means unlimited",
  },
  {
    slug: "one-greater-than-the-highest",
    name: "A limit of 1024 and a descriptor numbered 1024",
    brief:
      "A program with the default soft limit is logging a failure on what it reports as file" +
      " descriptor 1024. Somebody has pointed out that the limit is 1024, so 1024 should be fine.",
    setup: {
      origin: "systemd",
      limitsConf: null,
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: null,
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: false,
      wants: 1024,
    },
    question: "What is the highest numbered descriptor it can hold?",
    options: [
      {
        id: "limit",
        claim: "1024, the same as the limit",
        says: { about: "highest-fd", value: 1024 },
      },
      {
        id: "fails",
        claim: "It fails at exactly 1024 descriptors with EMFILE",
        says: { about: "fails-with", errno: "EMFILE" },
      },
      {
        id: "correct",
        claim: "1023, because the limit is one greater than the highest number",
        says: { about: "highest-fd", value: 1023 },
      },
      {
        id: "zero",
        claim: "1022, since stdin, stdout and stderr take the first three",
        says: { about: "highest-fd", value: 1022 },
      },
    ],
    why:
      "getrlimit(2) defines RLIMIT_NOFILE as 'a value one greater than the maximum file descriptor" +
      " number that can be opened by this process'. So 1024 means descriptors 0 through 1023, and" +
      " the off by one belongs to the kernel's definition rather than to anybody's arithmetic." +
      " It also means the process can hold exactly 1024 of them, stdin, stdout and stderr" +
      " included, so wanting exactly 1024 succeeds and wanting one more does not.",
    fix:
      "nothing, but remember it when reading a program's own error message. A report of a failure" +
      " on descriptor 1024 with a limit of 1024 is consistent and not a contradiction, and the" +
      " same is true of 65536 and 1048576.",
    breaks: "that a limit of N lets you have a descriptor numbered N",
  },
  {
    slug: "the-shell-was-not-the-service",
    name: "The shell says 65536",
    brief:
      "The same host as the first case, but the question is about the interactive session. An" +
      " engineer sshes in, runs ulimit -n, and gets a number they then quote in the ticket as" +
      " proof the limit is fine.",
    setup: {
      origin: "login",
      limitsConf: { soft: 65536, hard: 65536 },
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: null,
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: false,
      wants: 20000,
    },
    question: "What decided the limit in that shell?",
    options: [
      {
        id: "systemd",
        claim: "DefaultLimitNOFILE, because systemd starts the ssh session too",
        says: { about: "set-by", source: "DefaultLimitNOFILE" },
      },
      {
        id: "correct",
        claim: "limits.conf, through pam_limits, which does run for a login",
        says: { about: "set-by", source: "limits.conf" },
      },
      {
        id: "kernel",
        claim: "The kernel default, since a shell inherits nothing",
        says: { about: "set-by", source: "the kernel default" },
      },
      {
        id: "soft",
        claim: "The soft limit in the shell is 1024, the same as the service",
        says: { about: "soft", value: 1024 },
      },
    ],
    why:
      "The shell is right and the conclusion drawn from it is wrong. An ssh login authenticates," +
      " PAM runs, pam_limits reads limits.conf, and the session genuinely has 65536. The service" +
      " on the same host, at the same moment, has 1024. Both numbers are true and they describe" +
      " different processes, so a check run in a shell can only ever tell you about shells.",
    fix:
      "check the process, not the machine. cat /proc/$(systemctl show -p MainPID --value" +
      " thing.service)/limits reads the limits of the thing that is actually failing, and it is" +
      " the only reading that settles this.",
    breaks: "that ulimit -n in a shell tells you what a service has",
  },
  {
    slug: "the-container-brought-its-own",
    name: "Inside the container",
    brief:
      "The same image, run under a container runtime configured with a nofile of 1048576. The" +
      " host's DefaultLimitNOFILE is the usual 1024 soft and the host's limits.conf says 65536.",
    setup: {
      origin: "container",
      limitsConf: { soft: 65536, hard: 65536 },
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: null,
      containerLimit: { soft: 1048576, hard: 1048576 },
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: false,
      wants: 200000,
    },
    question: "What set the limit for the process in the container?",
    options: [
      {
        id: "host",
        claim: "The host's DefaultLimitNOFILE, since a container is a process on the host",
        says: { about: "set-by", source: "DefaultLimitNOFILE" },
      },
      {
        id: "conf",
        claim: "The host's limits.conf, at 65536",
        says: { about: "set-by", source: "limits.conf" },
      },
      {
        id: "clamped",
        claim: "fs.nr_open clamped it, since 1048576 is the ceiling",
        says: { about: "set-by", source: "fs.nr_open" },
      },
      {
        id: "correct",
        claim: "The container runtime, which sets the limits for what it starts",
        says: { about: "set-by", source: "the container runtime" },
      },
    ],
    why:
      "The runtime sets rlimits on the process it starts, so its configuration is the one in" +
      " scope and the host's arrangements for its own units and its own logins are not. The" +
      " request for 1048576 is exactly fs.nr_open and therefore not clamped: a request for one" +
      " more would be. This is why the same image behaves differently under different runtimes and" +
      " different orchestrators, and why 'it works on my machine' survives containerisation.",
    fix:
      "set it explicitly per workload rather than relying on the runtime's default, which differs" +
      " between runtimes and between versions of the same one. And read /proc/1/limits inside the" +
      " container, which is the only place the answer is not a guess.",
    breaks: "that a container inherits the host's descriptor limits",
  },
  {
    slug: "nobody-set-anything",
    name: "A cron job with no limits at all",
    brief:
      "A script run from a crontab on a host where limits.conf says nothing about nofile. It" +
      " opens files in a loop and dies partway through, and the person who wrote it is certain" +
      " systemd's generous defaults apply.",
    setup: {
      origin: "login",
      limitsConf: null,
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: null,
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: false,
      wants: 3000,
    },
    question: "What hard limit does it have?",
    options: [
      {
        id: "systemd",
        claim: "524288, systemd's default hard limit",
        says: { about: "hard", value: 524288 },
      },
      {
        id: "correct",
        claim: "4096, the kernel's own default, because nothing else was in scope",
        says: { about: "hard", value: 4096 },
      },
      {
        id: "nropen",
        claim: "1048576, since with nothing set the ceiling is the only limit",
        says: { about: "hard", value: 1048576 },
      },
      {
        id: "fine",
        claim: "It succeeds: three thousand descriptors is a modest number",
        says: { about: "fails-with", errno: null },
      },
    ],
    why:
      "systemd's defaults apply to units systemd starts. A session that went through PAM with" +
      " nothing in limits.conf gets whatever it inherited, and at the bottom of that chain is the" +
      " kernel's own pair, which is a soft of 1024 and a hard of 4096. Three thousand descriptors" +
      " is over the soft limit, and even a process that raised itself to its hard limit would only" +
      " reach 4096. Nowhere near the numbers everybody quotes, because none of those numbers were" +
      " ever in scope.",
    fix:
      "run it as a systemd timer rather than from a crontab, which puts it under" +
      " DefaultLimitNOFILE and gives it a hard limit worth having. Or set the limit in the script," +
      " which for a shell script means ulimit -n and for anything else means setrlimit.",
    breaks: "that systemd's defaults apply to everything on a systemd host",
  },
  {
    slug: "the-unit-wins-over-the-default",
    name: "A unit that sets its own",
    brief:
      "A host whose /etc/systemd/system.conf sets DefaultLimitNOFILE=1024:524288, and one unit" +
      " that sets LimitNOFILE=65536 for itself. Somebody is about to raise the default because the" +
      " service looks constrained.",
    setup: {
      origin: "systemd",
      limitsConf: null,
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: { soft: 65536, hard: 65536 },
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: false,
      wants: 40000,
    },
    question: "What decided this unit's limit?",
    options: [
      {
        id: "correct",
        claim: "LimitNOFILE= in the unit, which overrides the default entirely",
        says: { about: "set-by", source: "LimitNOFILE" },
      },
      {
        id: "default",
        claim: "DefaultLimitNOFILE, with the unit's value applied on top",
        says: { about: "set-by", source: "DefaultLimitNOFILE" },
      },
      {
        id: "hard",
        claim: "Its hard limit is 524288, from the default, since the unit only set a soft value",
        says: { about: "hard", value: 524288 },
      },
      {
        id: "fails",
        claim: "It fails at forty thousand descriptors",
        says: { about: "fails-with", errno: "EMFILE" },
      },
    ],
    why:
      "A unit's LimitNOFILE= replaces the default for that unit, both halves of it. So this" +
      " service has 65536 soft and 65536 hard, not 65536 soft and 524288 hard, and raising" +
      " DefaultLimitNOFILE would change nothing for it at all. Worth noticing in the other" +
      " direction too: setting LimitNOFILE=65536 on a unit that would otherwise have had a hard" +
      " limit of 524288 has lowered its ceiling, and a daemon that raises itself now reaches a" +
      " smaller number than it would have with no setting at all.",
    fix:
      "write both halves when you mean both, as LimitNOFILE=65536:524288. And before raising a" +
      " default because one service looks short, check whether that service is even reading it:" +
      " systemctl show -p LimitNOFILE thing.service answers in one line.",
    breaks: "that DefaultLimitNOFILE is the value every unit ends up with",
  },
  {
    slug: "a-thousand-is-enough",
    name: "1024, and nothing is wrong",
    brief:
      "A small service under the default limits, holding about four hundred descriptors at peak." +
      " A standards review has flagged the 1024 soft limit as a risk and proposed raising it" +
      " everywhere.",
    setup: {
      origin: "systemd",
      limitsConf: null,
      systemdDefault: SYSTEMD_DEFAULT,
      unitLimit: null,
      containerLimit: null,
      nrOpen: NR_OPEN,
      fileMax: FILE_MAX,
      openElsewhere: 8000,
      raisesItself: false,
      wants: 400,
    },
    question: "What happens when it asks for its four hundredth descriptor?",
    options: [
      {
        id: "emfile",
        claim: "EMFILE eventually, because 1024 is too low for any real service",
        says: { about: "fails-with", errno: "EMFILE" },
      },
      {
        id: "correct",
        claim: "Nothing: it gets the descriptor, and it has 624 to spare",
        says: { about: "fails-with", errno: null },
      },
      {
        id: "raised",
        claim: "Its soft limit is really 524288, since systemd raises it at start",
        says: { about: "soft", value: 524288 },
      },
      {
        id: "enfile",
        claim: "ENFILE, because the machine already has eight thousand open",
        says: { about: "fails-with", errno: "ENFILE" },
      },
    ],
    why:
      "The default soft limit of 1024 exists because select(2) cannot handle a descriptor above" +
      " 1023, and it is fine for the large majority of processes, which never approach it. Raising" +
      " it everywhere as a policy has a real cost: anything still using select gets memory" +
      " corruption rather than an error when it is handed a descriptor above 1023, which is a" +
      " worse failure than the one being prevented. The systemd documentation says so directly.",
    fix:
      "raise it where a service needs it and leave it where one does not. The pattern the systemd" +
      " authors recommend is exactly what is shipped: a low soft limit for safety and a high hard" +
      " limit so that any program confident it does not use select can take the whole thing" +
      " itself.",
    breaks: "that a soft limit of 1024 is always too low",
  },
];
