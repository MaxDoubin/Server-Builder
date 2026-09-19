import type { Case } from "../types";

/**
 * Ten containers and the 64 MiB filesystem none of them were sized for.
 *
 * Every figure is in MiB, because that is the unit the runtimes accept and
 * the unit the failure happens in. The per-unit demands are order-of-magnitude
 * figures for the workloads named, chosen so the arithmetic is the lesson
 * rather than the calibration.
 */

/** docker run with no --shm-size. */
const DEFAULT_SHM = 64;

export const CASES: Case[] = [
  {
    slug: "the-headless-browser",
    name: "The headless browser",
    brief:
      "A screenshot service running headless Chromium in a Docker container on a host with 64" +
      " GiB of RAM. It works in development with two or three pages open and dies in production" +
      " with a dozen. The error in the log is one line: Bus error.",
    setup: {
      platform: "docker",
      workload: "chromium-screenshotter:latest",
      shmMiB: DEFAULT_SHM,
      perUnitMiB: 8,
      unit: "renderer",
      units: 12,
      memoryLimitMiB: null,
      residentMiB: 1200,
      hostMiB: 65_536,
    },
    question: "Which renderer is the one that dies?",
    options: [
      {
        id: "eight",
        claim: "The 9th: eight renderers of 8 MiB fill the 64 MiB tmpfs exactly, and the ninth has nowhere to put its pages",
        says: { about: "dies-at-unit", count: 9 },
      },
      {
        id: "none",
        claim: "None of them: the host has 64 GiB and the container has no memory limit, so there is nothing to run out of",
        says: { about: "dies-at-unit", count: null },
      },
      {
        id: "twelve",
        claim: "The 12th, the last one, when the total finally exceeds what is available",
        says: { about: "dies-at-unit", count: 12 },
      },
      {
        id: "first",
        claim: "The 1st: a container with no --shm-size has no /dev/shm at all, so shared memory fails immediately",
        says: { about: "dies-at-unit", count: 1 },
      },
    ],
    why:
      "Docker mounts /dev/shm as a 64 MiB tmpfs in every container unless --shm-size says" +
      " otherwise, and Chromium puts renderer shared memory there. Eight renderers at 8 MiB fill" +
      " it exactly; the ninth maps its region successfully, touches a page that cannot be backed," +
      " and takes SIGBUS. The host's 64 GiB never enters into it, which is why every graph on the" +
      " dashboard looks fine and why the ticket says the machine has plenty of memory.",
    fix:
      "--shm-size=256m for this workload, or --disable-dev-shm-usage to move Chromium's shared" +
      " memory to /tmp, which works and trades a tmpfs for disk writes.",
    breaks: "that a machine with free memory cannot run out of shared memory",
  },
  {
    slug: "the-mmap-that-succeeded",
    name: "The mmap that succeeded",
    brief:
      "The same container, and a developer adding error handling. Every call is checked: shm_open" +
      " for a negative fd, ftruncate for a non-zero return, mmap for MAP_FAILED. All three" +
      " succeed. The process still dies.",
    setup: {
      platform: "docker",
      workload: "renderer:latest",
      shmMiB: DEFAULT_SHM,
      perUnitMiB: 96,
      unit: "mapping",
      units: 1,
      memoryLimitMiB: null,
      residentMiB: 400,
      hostMiB: 65_536,
    },
    question: "How does this one fail?",
    options: [
      {
        id: "enospc",
        claim: "mmap returns MAP_FAILED and errno is ENOSPC, which the code above would have caught",
        says: { about: "nothing" },
      },
      {
        id: "enomem",
        claim: "The allocation fails with ENOMEM, the usual out-of-memory error return",
        says: { about: "nothing" },
      },
      {
        id: "sigbus",
        claim: "SIGBUS on the first page touched past 64 MiB: the mapping is created successfully and the failure is deferred to the page fault",
        says: { about: "failure", value: "sigbus" },
      },
      {
        id: "oom",
        claim: "The OOM killer takes it, and dmesg records the kill",
        says: { about: "failure", value: "oom-killed" },
      },
    ],
    why:
      "Measured rather than reasoned about: mapping a 32 MiB file on an 8 MiB tmpfs prints" +
      " \"mmap SUCCEEDED\" and then dies with SIGBUS after exactly 8388608 bytes are touched." +
      " The mapping is an address space reservation; the pages behind it are allocated lazily at" +
      " first touch, and it is the fault that cannot be satisfied. There is no return value to" +
      " check and no errno to read, because a signal is not an error. The same full filesystem" +
      " returns a perfectly ordinary ENOSPC to write(), which is why the operator's dd test" +
      " reproduces the space problem and not the crash.",
    fix:
      "you cannot check for this at the call site. Size /dev/shm for the peak, or install a" +
      " SIGBUS handler if the program genuinely must survive it, which almost none do.",
    breaks: "that an allocation which cannot be satisfied fails at the allocation",
  },
  {
    slug: "the-field-that-does-not-exist",
    name: "The field that does not exist",
    brief:
      "The same image, moved to Kubernetes. Somebody adds resources.limits.memory of 4 GiB and" +
      " goes looking for where to put the shm size. There is no such field in the pod spec, and" +
      " the container still gets 64 MiB.",
    setup: {
      platform: "kubernetes",
      workload: "chromium-screenshotter:latest",
      shmMiB: DEFAULT_SHM,
      perUnitMiB: 8,
      unit: "renderer",
      units: 12,
      memoryLimitMiB: 4096,
      residentMiB: 1200,
      hostMiB: 131_072,
    },
    question: "How much shared memory does this workload ask for at peak?",
    options: [
      {
        id: "limit",
        claim: "4096 MiB, because the memory limit is what bounds shared memory in Kubernetes",
        says: { about: "demand", mib: 4096 },
      },
      {
        id: "sixtyfour",
        claim: "64 MiB, which is what the tmpfs holds and therefore what the workload can ask for",
        says: { about: "demand", mib: 64 },
      },
      {
        id: "fits",
        claim: "It fits: Kubernetes sizes /dev/shm from the memory limit, so raising that to 4 GiB raised this too",
        says: { about: "fits", value: true },
      },      {
        id: "ninetysix",
        claim: "96 MiB: twelve renderers at 8 MiB each, against a 64 MiB tmpfs that no field in this spec can resize",
        says: { about: "demand", mib: 96 },
      },
    ],
    why:
      "Kubernetes has no shm-size. The container runtime mounts the default and the pod spec has" +
      " nowhere to say otherwise, so raising resources.limits.memory to 4 GiB changes what the" +
      " cgroup permits and leaves the filesystem at 64 MiB. The way through is an emptyDir volume" +
      " with medium: Memory mounted at /dev/shm, which is itself a tmpfs sized by sizeLimit, and" +
      " which does count against the pod's memory limit.",
    fix:
      "an emptyDir with medium: Memory and a sizeLimit, mounted at /dev/shm, and the memory limit" +
      " raised to cover it. Two changes, because the volume and the limit are separate.",
    breaks: "that a memory limit bounds a container's shared memory",
  },
  {
    slug: "the-tmpfs-was-big-enough",
    name: "The tmpfs was big enough",
    brief:
      "After the last ticket somebody sets --shm-size=1g and --memory=2g. The Bus error is gone." +
      " Now the container is killed under load instead, and this time dmesg does say something.",
    setup: {
      platform: "docker",
      workload: "chromium-screenshotter:latest",
      shmMiB: 1024,
      perUnitMiB: 8,
      unit: "renderer",
      units: 96,
      memoryLimitMiB: 2048,
      residentMiB: 1600,
      hostMiB: 65_536,
    },
    question: "What happens to this container at peak?",
    options: [
      {
        id: "fine",
        claim: "Nothing: 768 MiB of shared memory fits in a 1 GiB tmpfs with room to spare",
        says: { about: "failure", value: "none" },
      },
      {
        id: "sigbus",
        claim: "Bus error again, once the renderers exceed the tmpfs",
        says: { about: "failure", value: "sigbus" },
      },
      {
        id: "oom",
        claim: "The cgroup OOM killer takes it: tmpfs pages are memory, so 1600 MiB resident plus 768 MiB of shared memory is 2368 against a 2048 limit",
        says: { about: "failure", value: "oom-killed" },
      },
      {
        id: "swap",
        claim: "Nothing visible: the tmpfs pages are swapped out under pressure, which is what tmpfs is for",
        says: { about: "nothing" },
      },
    ],
    why:
      "A tmpfs is memory with a filesystem interface. Its pages are charged to the cgroup that" +
      " touches them, so shared memory in use counts against memory.max alongside the heap. The" +
      " 1 GiB tmpfs is a ceiling on how much of that memory can be shared, not a separate" +
      " allocation, and setting it to a gigabyte inside a two gigabyte limit leaves less room for" +
      " everything else than it looks. The Bus error was traded for an OOM kill, which is at" +
      " least a failure that leaves a message.",
    fix:
      "raise both together, and size --shm-size to the peak rather than to a round number well" +
      " above it, because the tmpfs ceiling is also a share of the memory limit.",
    breaks: "that raising the tmpfs size is free",
  },
  {
    slug: "parallel-query",
    name: "Parallel query",
    brief:
      "PostgreSQL in a container, with max_parallel_workers_per_gather raised to 6 after a" +
      " reporting query was slow. dynamic_shared_memory_type is posix, which is the default on" +
      " Linux, so each parallel worker's segment lands in /dev/shm. Four such queries can run at" +
      " once.",
    setup: {
      platform: "docker",
      workload: "postgres:17",
      shmMiB: DEFAULT_SHM,
      perUnitMiB: 4,
      unit: "parallel worker",
      units: 24,
      memoryLimitMiB: null,
      residentMiB: 2048,
      hostMiB: 32_768,
    },
    question: "What should /dev/shm be set to for this workload?",
    options: [
      {
        id: "ninetysix",
        claim: "96 MiB: the peak demand exactly, so nothing is wasted",
        says: { about: "needs-shm", mib: 96 },
      },
      {
        id: "onetwentyeight",
        claim: "128m: the peak of 96 MiB with a quarter to spare, rounded to a size somebody will recognize in the compose file later",
        says: { about: "needs-shm", mib: 128 },
      },
      {
        id: "default",
        claim: "64m is correct: PostgreSQL sizes its own segments and will not exceed the filesystem",
        says: { about: "needs-shm", mib: 64 },
      },
      {
        id: "gig",
        claim: "1g, because shared_buffers is usually set in gigabytes and lives in the same place",
        says: { about: "needs-shm", mib: 1024 },
      },
    ],
    why:
      "Six workers per gather times four concurrent queries is 24 segments, and at 4 MiB each" +
      " that is 96 MiB against a 64 MiB default. PostgreSQL does not fail gracefully here: the" +
      " backend takes SIGBUS and the connection drops, which surfaces as an intermittent" +
      " application error on exactly the reports that were made faster. shared_buffers is a" +
      " different allocation and is not what fills this filesystem.",
    fix:
      "raise shm_size to 128m, or set dynamic_shared_memory_type=sysv, which uses System V" +
      " segments with their own limits rather than /dev/shm. The first is simpler.",
    breaks: "that the database's own memory settings bound what it puts in /dev/shm",
  },
  {
    slug: "the-dataloader",
    name: "The dataloader",
    brief:
      "A PyTorch training job with num_workers=8. Each worker passes batches back to the main" +
      " process through shared memory, and the batches got larger when somebody raised the image" +
      " resolution. The job now dies a few minutes in, always at a different step.",
    setup: {
      platform: "docker",
      workload: "training:cuda",
      shmMiB: DEFAULT_SHM,
      perUnitMiB: 24,
      unit: "dataloader worker",
      units: 8,
      memoryLimitMiB: null,
      residentMiB: 8192,
      hostMiB: 262_144,
    },
    question: "Does the peak fit in /dev/shm?",
    options: [
      {
        id: "yes",
        claim: "Yes: 192 MiB of batches against 64 MiB is fine, because the workers take turns and never all hold a batch at once",
        says: { about: "fits", value: true },
      },
      {
        id: "no",
        claim: "No: eight workers holding 24 MiB each is 192 MiB against a 64 MiB tmpfs, so it fits two workers and dies on the third",
        says: { about: "fits", value: false },
      },
      {
        id: "third",
        claim: "No, and the one that dies is the 4th worker",
        says: { about: "dies-at-unit", count: 4 },
      },
      {
        id: "host",
        claim: "Yes: the host has 256 GiB and the container has no memory limit",
        says: { about: "fits", value: true },
      },
    ],
    why:
      "The whole point of prefetching workers is that they hold batches ready at the same time," +
      " so they do not take turns. 192 MiB against 64 is three times over, and the death at a" +
      " different step each run is the giveaway: it depends on which worker gets there first," +
      " which is timing. The 256 GiB on the host is in every ticket of this shape and has never" +
      " once been the answer.",
    fix:
      "--shm-size=256m at least, and check it against the batch size rather than guessing," +
      " because this scales with resolution and with num_workers at the same time.",
    breaks: "that concurrent workers share one worker's worth of memory",
  },
  {
    slug: "the-flag-that-moves-it",
    name: "The flag that moves it",
    brief:
      "Back to headless Chromium, and the fix everybody finds first: --disable-dev-shm-usage," +
      " which is in every Stack Overflow answer about this error. The container is left at the" +
      " 64 MiB default and the flag is added.",
    setup: {
      platform: "docker",
      workload: "chromium-screenshotter:latest",
      shmMiB: DEFAULT_SHM,
      perUnitMiB: 0,
      unit: "renderer",
      units: 12,
      memoryLimitMiB: null,
      residentMiB: 1200,
      hostMiB: 65_536,
    },
    question: "What does the workload now ask of /dev/shm?",
    options: [
      {
        id: "same",
        claim: "96 MiB, unchanged: the flag only suppresses the warning",
        says: { about: "demand", mib: 96 },
      },
      {
        id: "half",
        claim: "48 MiB: the flag halves the per-renderer allocation",
        says: { about: "demand", mib: 48 },
      },
      {
        id: "sixty",
        claim: "64 MiB, the size of the filesystem, which the flag makes Chromium respect",
        says: { about: "demand", mib: 64 },
      },      {
        id: "zero",
        claim: "0 MiB: the flag moves Chromium's shared memory to /tmp, so /dev/shm is no longer involved",
        says: { about: "demand", mib: 0 },
      },
    ],
    why:
      "The flag does what it says: Chromium stops using /dev/shm and puts the same data under" +
      " /tmp instead. The Bus error goes away because the failure moves to a filesystem with" +
      " room. Whether that is a fix depends on what /tmp is. On a container whose /tmp is the" +
      " overlay filesystem, this turns memory traffic into disk writes on every frame, and the" +
      " service gets slower in a way nobody connects to the ticket that was closed.",
    fix:
      "prefer sizing /dev/shm. Reach for the flag when you cannot change the runtime invocation," +
      " and then make /tmp a tmpfs so the data stays in memory.",
    breaks: "that the popular fix for this error is the right one",
  },
  {
    slug: "the-host-that-never-fails",
    name: "The host that never fails",
    brief:
      "The same screenshot service, the same twelve renderers, running directly on a host rather" +
      " than in a container. It has never once produced a Bus error, which is why nobody believed" +
      " the container version had a shared memory problem.",
    setup: {
      platform: "host",
      workload: "chromium-screenshotter",
      shmMiB: 32_768,
      perUnitMiB: 8,
      unit: "renderer",
      units: 12,
      memoryLimitMiB: null,
      residentMiB: 1200,
      hostMiB: 65_536,
    },
    question: "Why does this one never fail?",
    options: [
      {
        id: "half",
        claim: "On a host, /dev/shm defaults to half of RAM, so 32 GiB here rather than 64 MiB",
        says: { about: "fits", value: true },
      },
      {
        id: "nolimit",
        claim: "Outside a container there is no /dev/shm limit at all",
        says: { about: "nothing" },
      },
      {
        id: "swap",
        claim: "The host has swap, so shared memory that does not fit is paged out rather than refused",
        says: { about: "nothing" },
      },
      {
        id: "dies",
        claim: "It does fail, at the 9th renderer, exactly as in the container",
        says: { about: "dies-at-unit", count: 9 },
      },
    ],
    why:
      "The default tmpfs size for /dev/shm on a Linux host is half of physical memory, so the" +
      " same program on the same machine has 32 GiB of shared memory outside a container and 64" +
      " MiB inside one. That is a factor of five hundred, decided by the runtime rather than by" +
      " the kernel or the application, and it is the entire reason this failure reads as" +
      " something the container broke.",
    fix:
      "when a workload behaves differently in a container, compare findmnt /dev/shm on both" +
      " sides before anything else. It is one command and it settles this class of ticket.",
    breaks: "that a container sees the same /dev/shm the host does",
  },
  {
    slug: "the-compose-file",
    name: "The compose file",
    brief:
      "The screenshot service is deployed with docker compose, and somebody has already set" +
      " shm_size: 256m on the service. The Bus errors continue, from a second service in the same" +
      " file that also runs a browser and did not get the key.",
    setup: {
      platform: "compose",
      workload: "thumbnailer:latest",
      shmMiB: DEFAULT_SHM,
      perUnitMiB: 8,
      unit: "renderer",
      units: 20,
      memoryLimitMiB: null,
      residentMiB: 900,
      hostMiB: 65_536,
    },
    question: "Which renderer does the second service die on?",
    options: [
      {
        id: "twenty",
        claim: "None: shm_size is a top-level setting and applies to every service in the file",
        says: { about: "dies-at-unit", count: null },
      },
      {
        id: "thirtythird",
        claim: "The 33rd, once 256 MiB is exhausted",
        says: { about: "dies-at-unit", count: 33 },
      },
      {
        id: "first",
        claim: "The 1st, because a service without shm_size in a file that uses it gets no tmpfs at all",
        says: { about: "dies-at-unit", count: 1 },
      },      {
        id: "ninth",
        claim: "The 9th, the same as any other container left at the 64 MiB default: shm_size is per service",
        says: { about: "dies-at-unit", count: 9 },
      },
    ],
    why:
      "shm_size is a per-service key, like image and ports. A file where one service has it and" +
      " another does not has one container at 256 MiB and one at the default, and the one that" +
      " fails is whichever nobody edited. This is the same failure as the first case, and it is" +
      " harder to see, because the file visibly contains the fix.",
    fix:
      "grep the compose file for shm_size and compare against the list of services that run a" +
      " browser or a database. Or set it with an anchor so the two cannot drift.",
    breaks: "that a setting present in the file is applied to everything in the file",
  },
  {
    slug: "sized-for-the-peak",
    name: "Sized for the peak",
    brief:
      "The original screenshot service again, being sized properly rather than patched. Twelve" +
      " renderers at 8 MiB, and the container will be given a memory limit at the same time so" +
      " the two numbers are chosen together.",
    setup: {
      platform: "docker",
      workload: "chromium-screenshotter:latest",
      shmMiB: 256,
      perUnitMiB: 8,
      unit: "renderer",
      units: 12,
      memoryLimitMiB: 3072,
      residentMiB: 1200,
      hostMiB: 65_536,
    },
    question: "With --shm-size=256m and --memory=3g, what happens at peak?",
    options: [
      {
        id: "oom",
        claim: "OOM killed: the 256 MiB tmpfs counts against the 3 GiB limit on top of 1200 MiB resident",
        says: { about: "failure", value: "oom-killed" },
      },
      {
        id: "none",
        claim: "Nothing fails: 96 MiB of shared memory in a 256 MiB tmpfs, and 1296 MiB charged against a 3072 MiB limit",
        says: { about: "failure", value: "none" },
      },
      {
        id: "sigbus",
        claim: "Bus error still, because twelve renderers exceed what a 256 MiB tmpfs can back",
        says: { about: "failure", value: "sigbus" },
      },
      {
        id: "tight",
        claim: "Nothing fails, and the tmpfs is sized exactly at the peak with nothing spare",
        says: { about: "needs-shm", mib: 96 },
      },
    ],
    why:
      "96 MiB of demand in a 256 MiB filesystem, and the charge against the memory limit is the" +
      " resident set plus the shared memory actually in use, 1296 of 3072. Note which number goes" +
      " into that sum: the shared memory in use, not the size of the tmpfs. A large tmpfs costs" +
      " nothing until something writes to it, which is why sizing it generously is safe and" +
      " sizing the memory limit to the tmpfs ceiling is wasteful.",
    fix:
      "write both numbers down together with the reasoning, in the compose file or the unit," +
      " because the next person to change num_workers or the batch size needs to know which" +
      " limit moves with it.",
    breaks: "that a large tmpfs consumes memory before anything is written to it",
  },
];
