/**
 * Ten machines about to lose a process, and the arithmetic that picks it.
 *
 * Every case is built so that the reading somebody arrives with gives the
 * wrong answer, and every one of those readings is something experienced
 * people say out loud. There is one control: a machine where the biggest
 * process really is the one that dies, so that the set does not teach "the
 * obvious answer is always wrong", which is its own superstition.
 *
 * The numbers are MiB. None of them is rounded to look tidy, because a
 * machine with 16384 MiB of RAM and a truncating normaliser produces scores
 * that are not tidy, and a set of round numbers would let a reader guess.
 */

import type { Case } from "../types";

export const CASES: Case[] = [
  {
    slug: "the-biggest-process-lived",
    name: "The JVM was eleven gigabytes and it is still running",
    brief:
      "A 16 GiB build host with 2 GiB of swap. A CI job asks for another gigabyte and the kernel cannot find one. The JVM has been sitting at eleven and a half gigabytes all afternoon and somebody set it up carefully.",
    machine: {
      ram: 16384,
      swap: 2048,
      cgroups: [{ path: "/", max: null }],
      processes: [
        { name: "systemd", pid: 1, rss: 14, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "sshd", pid: 640, rss: 12, swap: 4, pageTables: 2, oomScoreAdj: -1000, cgroup: "/system.slice/sshd.service" },
        { name: "java", pid: 812, rss: 11800, swap: 0, pageTables: 44, oomScoreAdj: -800, cgroup: "/system.slice/buildd.service" },
        { name: "postgres", pid: 1104, rss: 3400, swap: 118, pageTables: 32, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "node", pid: 2210, rss: 902, swap: 0, pageTables: 9, oomScoreAdj: 0, cgroup: "/system.slice/agent.service" },
      ],
    },
    trigger: { kind: "system" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "postgres", claim: "postgres, at three and a half gigabytes", names: [1104] },
      { id: "none", claim: "Nothing. The allocation fails and the job reports an error", names: [] },
      { id: "java", claim: "java, at eleven and a half gigabytes it is most of the machine", names: [812] },
      { id: "node", claim: "node, it is the newest thing on the box", names: [2210] },
    ],
    why:
      "An oom_score_adj of -800 subtracts eight tenths of the machine from the score. Eight tenths of 18 GiB of RAM plus swap is over fourteen gigabytes, so the JVM scores -2.8 GiB: not merely unlikely, but below every other candidate by a distance nothing it does could close. postgres, with no adj at all, scores what it is using, and that is the highest number on the box.",
    fix:
      "Decide whether -800 was meant to mean what it means. It is not a hint that the JVM is important; it is an instruction that four fifths of the machine has to be in use by one other process before the JVM is even in the running. If the intent was 'prefer to kill something else first', -100 does that and leaves the JVM killable when it is genuinely the problem.",
    breaks: "a negative oom_score_adj is a preference rather than a proportion of the whole machine",
  },
  {
    slug: "minus-one-thousand-is-never",
    name: "mysqld is five and a half gigabytes and it is not a candidate",
    brief:
      "An 8 GiB database host, no swap. mysqld has oom_score_adj set to -1000, which the runbook describes as 'protecting the database'. Memory runs out during a nightly report.",
    machine: {
      ram: 8192,
      swap: 0,
      cgroups: [{ path: "/", max: null }],
      processes: [
        { name: "systemd", pid: 1, rss: 12, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "mysqld", pid: 1420, rss: 5600, swap: 0, pageTables: 26, oomScoreAdj: -1000, cgroup: "/system.slice/mysql.service" },
        { name: "php-fpm", pid: 3301, rss: 1204, swap: 0, pageTables: 11, oomScoreAdj: 0, cgroup: "/system.slice/php-fpm.service" },
        { name: "php-fpm", pid: 3302, rss: 1148, swap: 0, pageTables: 11, oomScoreAdj: 0, cgroup: "/system.slice/php-fpm.service" },
        { name: "redis-server", pid: 902, rss: 782, swap: 0, pageTables: 7, oomScoreAdj: 0, cgroup: "/system.slice/redis.service" },
      ],
    },
    trigger: { kind: "system" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "mysqld", claim: "mysqld, it is two thirds of the machine and the adj only weights it", names: [1420] },
      { id: "none", claim: "Nothing. With the database protected there is no victim", names: [] },
      { id: "worker", claim: "The larger php-fpm worker", names: [3301] },
      { id: "redis", claim: "redis-server, it is the smallest and least missed", names: [902] },
    ],
    why:
      "-1000 is not the bottom of a scale, it is a different answer. The kernel tests for it before it does any arithmetic and returns immediately: mysqld is not scored low, it is not scored. So the field is the two workers and redis, and the larger worker has the highest score by a few dozen megabytes. Protecting the database worked exactly as written, and what it protected the database from was ever being the thing that gets killed when the database is the problem.",
    fix:
      "Reserve -1000 for the things that must survive to fix the machine, which is sshd and the monitoring agent. Give the database a cgroup with memory.max instead, so that when it is the process eating the host it is contained rather than immortal.",
    breaks: "-1000 means the kernel will avoid it if it can",
  },
  {
    slug: "the-workers-that-share-everything",
    name: "Eight backends holding twenty gigabytes, and clamd dies",
    brief:
      "A 32 GiB database server. Eight postgres backends are each showing about 2.6 GiB resident, and almost all of it is the same shared buffer pool. clamd is running a scheduled scan.",
    machine: {
      ram: 32768,
      swap: 0,
      cgroups: [{ path: "/", max: null }],
      processes: [
        { name: "systemd", pid: 1, rss: 13, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "postgres", pid: 5001, rss: 2612, sharedOfRss: 2304, swap: 0, pageTables: 13, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "postgres", pid: 5002, rss: 2598, sharedOfRss: 2304, swap: 0, pageTables: 13, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "postgres", pid: 5003, rss: 2571, sharedOfRss: 2304, swap: 0, pageTables: 12, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "postgres", pid: 5004, rss: 2560, sharedOfRss: 2304, swap: 0, pageTables: 12, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "postgres", pid: 5005, rss: 2544, sharedOfRss: 2304, swap: 0, pageTables: 12, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "postgres", pid: 5006, rss: 2531, sharedOfRss: 2304, swap: 0, pageTables: 12, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "postgres", pid: 5007, rss: 2518, sharedOfRss: 2304, swap: 0, pageTables: 12, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "postgres", pid: 5008, rss: 2502, sharedOfRss: 2304, swap: 0, pageTables: 12, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "clamd", pid: 4100, rss: 3904, swap: 0, pageTables: 19, oomScoreAdj: 0, cgroup: "/system.slice/clamav-daemon.service" },
      ],
    },
    trigger: { kind: "system" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "backend", claim: "The largest postgres backend, the eight of them are twenty gigabytes", names: [5001] },
      { id: "all", claim: "All eight backends, since together they are the problem", names: [5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008] },
      { id: "clamd", claim: "clamd, at 3.8 GiB", names: [4100] },
      { id: "none", claim: "Nothing. The scan gets a malloc failure and gives up", names: [] },
    ],
    why:
      "The eight backends add up to twenty gigabytes in `top` and hold down about five, because 2.3 GiB of each one is the same shared pool counted eight times. The kernel makes the same mistake in the other direction: get_mm_rss counts a shared page in full in every process mapping it, so each backend scores about 2.6 GiB. Not one of them is the largest thing on the machine. clamd is, by 1.3 GiB, and clamd is what dies.",
    fix:
      "Read the shared column before deciding a fork pool is the problem. If postgres genuinely is, memory.max on its slice is what makes the kernel see the pool as one thing, because a cgroup charges a shared page once to whoever touched it first.",
    breaks: "the process holding the memory down is the process that gets killed",
  },
  {
    slug: "the-one-that-asked",
    name: "The backup script triggered it and elasticsearch died",
    brief:
      "A 4 GiB VM with 512 MiB of swap. A cron job starts a backup, the script asks for a buffer, and there is nothing left. The script is sixty megabytes.",
    machine: {
      ram: 4096,
      swap: 512,
      cgroups: [{ path: "/", max: null }],
      processes: [
        { name: "systemd", pid: 1, rss: 11, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "backup.sh", pid: 9900, rss: 62, swap: 0, pageTables: 3, oomScoreAdj: 0, cgroup: "/system.slice/backup.service" },
        { name: "java", pid: 1500, rss: 2904, swap: 298, pageTables: 27, oomScoreAdj: 0, cgroup: "/system.slice/elasticsearch.service" },
        { name: "nginx", pid: 700, rss: 42, swap: 6, pageTables: 3, oomScoreAdj: 0, cgroup: "/system.slice/nginx.service" },
      ],
    },
    trigger: { kind: "system" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "none", claim: "Nothing. malloc returns null and the script handles it", names: [] },
      { id: "script", claim: "backup.sh, it is the allocation that could not be satisfied", names: [9900] },
      { id: "nginx", claim: "nginx, it is the least important thing running", names: [700] },
      { id: "java", claim: "The elasticsearch JVM", names: [1500] },
    ],
    why:
      "The process that hit the wall is not a term in the expression. It is not weighted, penalised or preferred; the kernel scores every task in the same way and the allocator happens to be one of them, at sixty megabytes. The JVM is three gigabytes of the four, with three hundred more in swap that `top` does not show in RES, and the JVM is what dies. This is why the process that appears in the OOM log as the one that asked is so rarely the process named as the one that was killed, two lines below.",
    fix:
      "Read both lines of the log. The 'invoked oom-killer' line is a symptom of the machine being full and tells you almost nothing about what filled it; the 'Killed process' line names the biggest thing, which is usually the thing to size or cap. Neither line means the backup was at fault, and rescheduling it will not help.",
    breaks: "the process whose allocation failed is the process that gets killed",
  },
  {
    slug: "the-cgroup-cannot-see-it",
    name: "The container was killed and rsync was using twenty four gigabytes",
    brief:
      "A 64 GiB host. The app runs in a unit with memory.max set to 4 GiB. A backup rsync outside that unit is holding twenty four gigabytes of page cache and buffers. The app gets killed. The host has plenty of free memory.",
    machine: {
      ram: 65536,
      swap: 0,
      cgroups: [
        { path: "/", max: null },
        { path: "/system.slice/app.service", max: 4096 },
        { path: "/system.slice/backup.service", max: null },
      ],
      processes: [
        { name: "systemd", pid: 1, rss: 16, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "app", pid: 2400, rss: 3812, swap: 0, pageTables: 21, oomScoreAdj: 0, cgroup: "/system.slice/app.service" },
        { name: "app-worker", pid: 2401, rss: 214, swap: 0, pageTables: 5, oomScoreAdj: 0, cgroup: "/system.slice/app.service" },
        { name: "rsync", pid: 8800, rss: 24118, swap: 0, pageTables: 94, oomScoreAdj: 0, cgroup: "/system.slice/backup.service" },
      ],
    },
    trigger: { kind: "cgroup", path: "/system.slice/app.service" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "rsync", claim: "rsync, at twenty four gigabytes it is the obvious problem", names: [8800] },
      { id: "app", claim: "app, the largest task inside the cgroup that hit its limit", names: [2400] },
      { id: "none", claim: "Nothing. The host has thirty six gigabytes free", names: [] },
      { id: "worker", claim: "app-worker, the smaller of the two, to keep the service up", names: [2401] },
    ],
    why:
      "A cgroup OOM is not a machine OOM. The kernel is not out of memory; one cgroup is out of its allowance, and the only candidates are the tasks inside it. rsync is not considered, whatever it is doing, because it is in a different cgroup with no limit at all. Inside app.service the field is two tasks and the larger one dies. The host having thirty six gigabytes free is not a contradiction: it is what a limit is for.",
    fix:
      "Check which OOM you had before you go looking for a hog. A memcg kill names the cgroup in the log and a global kill does not, and they lead to completely different investigations: one is 'this limit is too low or this service leaks', the other is 'the machine is oversubscribed'. Putting the backup in a cgroup with a limit is worth doing anyway, but it would not have saved the app.",
    breaks: "the OOM killer looks at the machine when a container is killed",
  },
  {
    slug: "swap-is-still-charged",
    name: "gradle was a tenth of chrome in top and gradle is what died",
    brief:
      "A workstation with 8 GiB of RAM and 8 GiB of swap, most of it in use. `top` sorted by RES shows chrome at the top, gradle well down the list.",
    machine: {
      ram: 8192,
      swap: 8192,
      cgroups: [{ path: "/", max: null }],
      processes: [
        { name: "systemd", pid: 1, rss: 12, swap: 8, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "chrome", pid: 3000, rss: 4608, swap: 204, pageTables: 34, oomScoreAdj: 0, cgroup: "/user.slice/chrome.scope" },
        { name: "java", pid: 3100, rss: 1402, swap: 5216, pageTables: 24, oomScoreAdj: 0, cgroup: "/user.slice/gradle.scope" },
        { name: "code", pid: 3200, rss: 1108, swap: 402, pageTables: 18, oomScoreAdj: 0, cgroup: "/user.slice/code.scope" },
      ],
    },
    trigger: { kind: "system" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "gradle", claim: "The gradle JVM", names: [3100] },
      { id: "chrome", claim: "chrome, it is 4.5 GiB resident and the top of the list", names: [3000] },
      { id: "none", claim: "Nothing. There is swap left, so the allocation succeeds slowly", names: [] },
      { id: "code", claim: "code, the editor, since it is idle", names: [3200] },
    ],
    why:
      "Swapped pages are still charged to the process that owns them. gradle is 1.4 GiB resident and 5.1 GiB swapped, which is 6.5 GiB of anonymous memory that has to live somewhere, and the somewhere is nearly full. chrome, at 4.5 GiB resident with 204 MiB out, scores 1.8 GiB lower. Sorting by RES answers the question 'what is in RAM now', and the killer is asking 'who owns the most memory', which on a swapping machine is a different question with a different answer.",
    fix:
      "Sort by the column that matches the question. `smem` or the SWAP column in `top` after pressing f, or just read /proc/*/status for VmRSS plus VmSwap. On a machine that swaps, RES alone is not a ranking of anything.",
    breaks: "RES is the score, so the top of top is the next to die",
  },
  {
    slug: "a-hundred-is-not-a-nudge",
    name: "loki had oom_score_adj 200 and it cost it three gigabytes",
    brief:
      "A 16 GiB observability host, no swap. Somebody set oom_score_adj to 200 on loki months ago, reasoning that logs matter less than metrics, and expected it to break a tie.",
    machine: {
      ram: 16384,
      swap: 0,
      cgroups: [{ path: "/", max: null }],
      processes: [
        { name: "systemd", pid: 1, rss: 13, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "prometheus", pid: 6100, rss: 5204, swap: 0, pageTables: 31, oomScoreAdj: 0, cgroup: "/system.slice/prometheus.service" },
        { name: "loki", pid: 6200, rss: 3102, swap: 0, pageTables: 22, oomScoreAdj: 200, cgroup: "/system.slice/loki.service" },
        { name: "grafana", pid: 6300, rss: 806, swap: 0, pageTables: 9, oomScoreAdj: 0, cgroup: "/system.slice/grafana.service" },
      ],
    },
    trigger: { kind: "system" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "prometheus", claim: "prometheus, it is 5.1 GiB and much the largest", names: [6100] },
      { id: "none", claim: "Nothing. Two of the three are well under half the machine", names: [] },
      { id: "grafana", claim: "grafana, the smallest, because 200 only breaks ties", names: [6300] },
      { id: "loki", claim: "loki, once the adj is added in", names: [6200] },
    ],
    why:
      "The adj is a thousandth of total memory per point, counted in pages and truncated, so 200 points is a fifth of the machine: 3.2 GiB added to loki's score. loki is 3.0 GiB using and 6.3 GiB scored, and prometheus is 5.1 GiB using and 5.1 GiB scored. The setting was not a tiebreak. On this machine it was worth 3.2 GiB, and on a 256 GiB host the same 200 would be worth fifty one gigabytes.",
    fix:
      "Work out what the number costs on the machine it is set on, and set it there rather than in a template. If the intent is a genuine tiebreak between two services of similar size, the adj that does that is single digits, and the honest version of 'logs matter less' is a memory limit on the log service rather than a thumb on the scale of every future OOM.",
    breaks: "oom_score_adj is a small weighting rather than a percentage of total memory",
  },
  {
    slug: "page-tables-are-memory",
    name: "The backend with less resident memory is the one that died",
    brief:
      "A 4 GiB database VM, no swap, running postgres with a 48 GiB shared_buffers setting and no huge pages. An ETL job in python is the other big thing on the box. `top` shows the python job with more resident memory.",
    machine: {
      ram: 4096,
      swap: 0,
      cgroups: [{ path: "/", max: null }],
      processes: [
        { name: "systemd", pid: 1, rss: 11, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "postgres", pid: 7000, rss: 2102, sharedOfRss: 1680, swap: 0, pageTables: 96, oomScoreAdj: 0, cgroup: "/system.slice/postgresql.service" },
        { name: "python3", pid: 7100, rss: 2164, swap: 0, pageTables: 14, oomScoreAdj: 0, cgroup: "/system.slice/etl.service" },
        { name: "sshd", pid: 620, rss: 12, swap: 0, pageTables: 2, oomScoreAdj: -1000, cgroup: "/system.slice/sshd.service" },
      ],
    },
    trigger: { kind: "system" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "none", claim: "Nothing. Neither one is more than half the machine", names: [] },
      { id: "python", claim: "python3, it has the most resident memory", names: [7100] },
      { id: "postgres", claim: "The postgres backend", names: [7000] },
      { id: "sshd", claim: "sshd, the smallest process, since something has to go", names: [620] },
    ],
    why:
      "Page tables are in the sum, and a process mapping a forty eight gigabyte segment with four kilobyte pages pays one five hundred and twelfth of it in tables, because a page table entry is eight bytes and it covers four kilobytes: ninety six megabytes, which is more than the sixty two megabytes of resident memory that python3 is ahead by. So postgres scores 2198 and python3 scores 2178, and the process with less memory in RES is the one the kernel picks. Nothing in `top` shows this column.",
    fix:
      "Give a database with a large shared segment huge pages. The kernel documents them for TLB reach rather than for this, but the table saving comes with them: one entry per two megabytes instead of one per four kilobytes cuts the table cost by a factor of five hundred and twelve, and on a host with a hundred backends mapping the same segment it is the difference between a rounding error and gigabytes. /proc/PID/status has VmPTE if you want to see what you are paying now.",
    breaks: "the score is resident memory plus swap and nothing else",
  },
  {
    slug: "nothing-left-to-kill",
    name: "Out of memory and no killable processes",
    brief:
      "A 2 GiB appliance. Every service was hardened at build time with oom_score_adj -1000, which passed review as defense in depth. Memory runs out.",
    machine: {
      ram: 2048,
      swap: 0,
      cgroups: [{ path: "/", max: null }],
      processes: [
        { name: "systemd", pid: 1, rss: 10, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "watchdog", pid: 300, rss: 24, swap: 0, pageTables: 3, oomScoreAdj: -1000, cgroup: "/system.slice/watchdog.service" },
        { name: "agent", pid: 310, rss: 1204, swap: 0, pageTables: 12, oomScoreAdj: -1000, cgroup: "/system.slice/agent.service" },
        { name: "collector", pid: 320, rss: 702, swap: 0, pageTables: 8, oomScoreAdj: -1000, cgroup: "/system.slice/collector.service" },
      ],
    },
    trigger: { kind: "system" },
    question: "Which process does the kernel kill?",
    options: [
      { id: "agent", claim: "agent, the largest, since -1000 cannot apply to everything", names: [310] },
      { id: "collector", claim: "collector, the largest thing that is not the monitoring agent", names: [320] },
      { id: "init", claim: "systemd, as the last resort", names: [1] },
      { id: "none", claim: "Nothing. There is no candidate and the kernel panics", names: [] },
    ],
    why:
      "Every task is either init or set to -1000, so the scan finds no candidate at all. The kernel does not fall back to a least-bad choice: it logs 'Out of memory and no killable processes...' and panics, because a machine that cannot free memory and cannot kill anything is deadlocked. Hardening every unit did not make the appliance resilient, it converted a lost process into a lost machine.",
    fix:
      "Set -1000 on the things you need in order to log in and diagnose, and nothing else. Everything that can be restarted should be killable, because a service that can be killed and comes back is the mechanism that keeps the box up. If a unit really must never die, give it a memory limit so its own cgroup kills something instead of the machine going down.",
    breaks: "there is always a victim",
  },
  {
    slug: "the-whole-unit-goes",
    name: "One worker was over the limit and the unit came back empty",
    brief:
      "A render service with memory.max at 8 GiB and memory.oom.group set. Three tasks in the unit: the supervisor and two workers. One worker runs away.",
    machine: {
      ram: 32768,
      swap: 0,
      cgroups: [
        { path: "/", max: null },
        { path: "/system.slice/render.service", max: 8192, oomGroup: true },
      ],
      processes: [
        { name: "systemd", pid: 1, rss: 14, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/init.scope", unkillable: true },
        { name: "renderd", pid: 4500, rss: 904, swap: 0, pageTables: 11, oomScoreAdj: 0, cgroup: "/system.slice/render.service" },
        { name: "render-worker", pid: 4501, rss: 3608, swap: 0, pageTables: 26, oomScoreAdj: 0, cgroup: "/system.slice/render.service" },
        { name: "render-worker", pid: 4502, rss: 3402, swap: 0, pageTables: 24, oomScoreAdj: 0, cgroup: "/system.slice/render.service" },
        { name: "nginx", pid: 700, rss: 46, swap: 0, pageTables: 4, oomScoreAdj: 0, cgroup: "/system.slice/nginx.service" },
      ],
    },
    trigger: { kind: "cgroup", path: "/system.slice/render.service" },
    question: "Which processes does the kernel kill?",
    options: [
      { id: "group", claim: "Every task in the unit: the supervisor and both workers", names: [4500, 4501, 4502] },
      { id: "worst", claim: "The larger worker, pid 4501, and nothing else", names: [4501] },
      { id: "none", claim: "Nothing. The host has twenty four gigabytes free", names: [] },
      { id: "supervisor", claim: "renderd, so that systemd restarts the whole unit cleanly", names: [4500] },
    ],
    why:
      "memory.oom.group turns the kill from a task into a transaction. The kernel still scores the tasks and still picks the worst one, and then kills every task in the cgroup instead of that one, including the supervisor that was about to notice and the worker that was idle. This is usually what you want, and it is off by default, which is why the more common version of this incident is a supervisor still running with a hole where a worker used to be, serving requests into it.",
    fix:
      "Choose deliberately, per unit. Set memory.oom.group on anything whose processes are useless individually, so the unit dies and restarts as one thing. Leave it off where a worker pool genuinely tolerates losing one, and then make sure the supervisor notices, because with the group kill off nothing tells it.",
    breaks: "the OOM killer kills one process",
  },
];
