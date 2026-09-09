/**
 * Ten readings of one number.
 *
 * Every figure in the options was taken from the model rather than typed,
 * and CI requires exactly one of them to hold, so a distractor that happens
 * to be right fails the build instead of the reader.
 *
 * The distractors are not random. Each set contains the number somebody gets
 * by making the assumption the case is about: the steady state instead of
 * the damped reading, the total instead of the per core figure, the count
 * of runnable tasks instead of the count the kernel folds.
 */

import type { Case } from "../types";

export const CASES: Case[] = [
  {
    slug: "the-mount-stopped-answering",
    name: "Forty, on an idle machine",
    brief:
      "A sixteen core application server. One NFS mount is served by a filer that has stopped" +
      " responding, and forty worker threads have gone into uninterruptible sleep waiting on it." +
      " top shows the processors at two percent.",
    setup: {
      cores: 16,
      start: [0.2, 0.3, 0.4],
      phases: [
        { seconds: 60, running: 1, blocked: 0, label: "a normal minute" },
        { seconds: 900, running: 1, blocked: 40, label: "the filer stops answering" },
      ],
    },
    question: "Fifteen minutes in, what does the one minute figure read?",
    options: [
      {
        id: "cpu-only",
        claim: "1.00, because only the one runnable thread is on a processor",
        says: { about: "reads", which: "one", at: 900, value: 1 },
      },
      {
        id: "per-core",
        claim: "2.56, because forty one tasks across sixteen cores is the load per core",
        says: { about: "reads", which: "one", at: 900, value: 2.56 },
      },
      {
        id: "steady",
        claim: "41.00, because the kernel counts uninterruptible sleep as load",
        says: { about: "reads", which: "one", at: 900, value: 41 },
      },
      {
        id: "capped",
        claim: "16.00, because the load average cannot exceed the number of cores",
        says: { about: "reads", which: "one", at: 900, value: 16 },
      },
    ],
    why:
      "calc_load_fold_active adds nr_running and nr_uninterruptible together before folding, so a" +
      " task blocked on a device that will never answer counts exactly as much as a task burning a" +
      " core. Forty blocked plus one running is forty one, and the processors are idle the whole" +
      " time. There is no cap: the figure is a count of tasks, and a count has no ceiling at the" +
      " core count or anywhere else.",
    fix:
      "read /proc/loadavg next to the runnable count in the same file. It prints running/total as" +
      " its fourth field, and a load of 41 beside a running count of 2 is the whole diagnosis. Or" +
      " ps -eo state= | grep -c D, which counts the half top does not show you.",
    breaks: "that a high load average means the processors are busy",
  },
  {
    slug: "one-minute-is-not-one-minute",
    name: "Reading it too early",
    brief:
      "Eight cores, idle, and then eight compile jobs start at once and keep running. You watch" +
      " uptime and read it at exactly sixty seconds.",
    setup: {
      cores: 8,
      start: [0, 0, 0],
      phases: [{ seconds: 600, running: 8, blocked: 0, label: "eight compiles, steady" }],
    },
    question: "At sixty seconds, what does the one minute figure read?",
    options: [
      {
        id: "true",
        claim: "8.00, because eight tasks have been runnable for the whole minute",
        says: { about: "reads", which: "one", at: 60, value: 8 },
      },
      {
        id: "damped",
        claim: "4.81, because it is a damped average and it has folded eleven samples",
        says: { about: "reads", which: "one", at: 60, value: 4.81 },
      },
      {
        id: "textbook",
        claim: "5.06, which is eight times one minus one over e",
        says: { about: "reads", which: "one", at: 60, value: 5.06 },
      },
      {
        id: "half",
        claim: "4.00, because a one minute average is half way there after thirty seconds",
        says: { about: "reads", which: "one", at: 60, value: 4 },
      },
    ],
    why:
      "The figure is an exponentially damped moving average, so after one time constant it has" +
      " covered 1 - 1/e of the step, which is 63 percent and not 100. That would be 5.06. It reads" +
      " 4.81 instead, because the sample period is LOAD_FREQ, which is 5*HZ+1 ticks rather than" +
      " 5*HZ: 5.004 seconds. Eleven of those fit in a minute, not twelve. The twelfth lands at" +
      " 60.05 seconds and takes it to 5.06.",
    fix:
      "wait, or read the count instead of the average. The extra tick in LOAD_FREQ is deliberate:" +
      " a period that divides evenly into a second aliases against anything running on a round" +
      " schedule, so the kernel makes sure it does not.",
    breaks: "that the one minute average reflects the last minute",
  },
  {
    slug: "eight-on-thirty-two",
    name: "Eight is not eight hundred percent",
    brief:
      "A thirty two core build machine running eight parallel workers, steadily, for ten minutes." +
      " An alert fires because the load average went over 5.",
    setup: {
      cores: 32,
      start: [8, 8, 8],
      phases: [{ seconds: 600, running: 8, blocked: 0, label: "eight workers, steady" }],
    },
    question: "How loaded is the machine, per core?",
    options: [
      {
        id: "raw",
        claim: "8.00, which is eight times oversubscribed",
        says: { about: "per-core", at: 600, value: 8 },
      },
      {
        id: "quarter-inverted",
        claim: "4.00, because thirty two cores divided by eight workers is four",
        says: { about: "per-core", at: 600, value: 4 },
      },
      {
        id: "not-decided",
        claim: "It cannot be worked out without knowing how much CPU each worker uses",
        says: { about: "nothing" },
      },
      {
        id: "quarter",
        claim: "0.25, so three quarters of the machine is doing nothing",
        says: { about: "per-core", at: 600, value: 0.25 },
      },
    ],
    why:
      "The load average is not normalised by the core count and never has been. Eight runnable" +
      " tasks on thirty two cores is eight, the same number a two core laptop would print with" +
      " eight tasks queued, and on the laptop that is four deep and here it is a quarter busy." +
      " The threshold that fires at 5 is a threshold on the wrong quantity: it means something" +
      " different on every machine it is copied to.",
    fix:
      "divide by nproc before comparing to anything, or alert on a saturation metric instead:" +
      " pressure stall information in /proc/pressure/cpu measures the time tasks spent waiting" +
      " rather than the number of them, and it is already normalised.",
    breaks: "that a load average can be compared between machines",
  },
  {
    slug: "it-is-still-high-and-it-is-over",
    name: "Reading it too late",
    brief:
      "Eight cores. A batch job runs twenty four tasks for two minutes and then finishes cleanly." +
      " You are paged, you log in one minute after it ended, and you run uptime.",
    setup: {
      cores: 8,
      start: [0, 0, 0],
      phases: [
        { seconds: 120, running: 24, blocked: 0, label: "the batch runs" },
        { seconds: 600, running: 0, blocked: 0, label: "it has finished" },
      ],
    },
    question: "One minute after the job ended, at three minutes, what does the one minute figure read?",
    options: [
      {
        id: "decayed",
        claim: "7.52, still falling from a peak of 20.48",
        says: { about: "reads", which: "one", at: 180, value: 7.52 },
      },
      {
        id: "zero",
        claim: "0.00, because nothing has been runnable for a full minute",
        says: { about: "reads", which: "one", at: 180, value: 0 },
      },
      {
        id: "peak",
        claim: "20.48, the highest it reached",
        says: { about: "reads", which: "one", at: 180, value: 20.48 },
      },
      {
        id: "true-peak",
        claim: "24.00, because twenty four tasks were runnable",
        says: { about: "reads", which: "one", at: 180, value: 24 },
      },
    ],
    why:
      "Damping cuts both ways. The rise never reached 24, because two minutes is only two time" +
      " constants and it topped out at 20.48; and the fall is just as slow, so a minute after the" +
      " last task exited it still reads 7.52 on a machine where nothing at all is running. Every" +
      " incident where the load was high when you looked and there was nothing to find is this.",
    fix:
      "read it twice, a minute apart, and compare. One reading gives you a number; two give you a" +
      " direction, and the direction is the only part that tells you whether you are looking at" +
      " something happening or something that already stopped.",
    breaks: "that a load average tells you about now",
  },
  {
    slug: "fifteen-never-noticed",
    name: "Thirty seconds of it",
    brief:
      "Four cores. Something spawns sixteen tasks, they run for thirty seconds, and they exit." +
      " The monitoring system records the fifteen minute figure once a minute, because that is" +
      " the stable one.",
    setup: {
      cores: 4,
      start: [0, 0, 0],
      phases: [
        { seconds: 30, running: 16, blocked: 0, label: "sixteen tasks arrive" },
        { seconds: 570, running: 0, blocked: 0, label: "and are gone" },
      ],
    },
    question: "What is the highest the fifteen minute figure ever reaches?",
    options: [
      {
        id: "one-peak",
        claim: "5.46, the same peak the one minute figure reached",
        says: { about: "peaks", which: "fifteen", value: 5.46 },
      },
      {
        id: "sixteen",
        claim: "16.00, because sixteen tasks were runnable",
        says: { about: "peaks", which: "fifteen", value: 16 },
      },
      {
        id: "tiny",
        claim: "0.43, which no threshold on that figure would catch",
        says: { about: "peaks", which: "fifteen", value: 0.43 },
      },
      {
        id: "averaged",
        claim: "0.53, being sixteen tasks for thirty of the nine hundred seconds",
        says: { about: "peaks", which: "fifteen", value: 0.53 },
      },
    ],
    why:
      "The fifteen minute figure has a time constant of fifteen minutes, so thirty seconds of" +
      " anything barely registers: it peaks at 0.43 while the one minute figure is showing 5.46." +
      " Sampling the stable figure once a minute is sampling the one that was built not to move." +
      " It is the right figure for a capacity trend and the wrong one for anything you would page" +
      " somebody about.",
    fix:
      "graph all three. The gap between them is the information: one high and fifteen low means it" +
      " started recently, the reverse means it is ending, and all three together means it has been" +
      " going on longer than fifteen minutes.",
    breaks: "that the fifteen minute figure is the one to alert on",
  },
  {
    slug: "queued-and-blocked",
    name: "Thirty two, and both halves matter",
    brief:
      "Eight cores. A database host with twelve queries executing and twenty sessions in" +
      " uninterruptible sleep on a storage array that has lost a path and is failing over.",
    setup: {
      cores: 8,
      start: [0, 0, 0],
      phases: [{ seconds: 900, running: 12, blocked: 20, label: "twelve running, twenty blocked" }],
    },
    question: "What is the load average telling you?",
    options: [
      {
        id: "io",
        claim: "Storage only, because twenty is larger than twelve",
        says: { about: "blames", cause: "io" },
      },
      {
        id: "cpu",
        claim: "CPU only, because uninterruptible sleep is not work",
        says: { about: "blames", cause: "cpu" },
      },
      {
        id: "neither",
        claim: "Nothing is contended; thirty two is just a large number",
        says: { about: "blames", cause: "neither" },
      },
      {
        id: "both",
        claim: "Both: more runnable tasks than cores, and tasks blocked on a device",
        says: { about: "blames", cause: "both" },
      },
    ],
    why:
      "Twelve runnable on eight cores is a genuine run queue four deep, and twenty tasks in D" +
      " state is a genuine storage problem, and the load average adds them into one 32 that" +
      " describes neither. Fixing the storage would leave a machine that is still oversubscribed;" +
      " adding cores would leave one that is still blocked. The single number cannot tell you" +
      " that there are two problems, which is the main thing wrong with it.",
    fix:
      "take the sum apart before you act on it. vmstat 1 prints r and b as separate columns, and" +
      " the two of them answer the question the load average blends away.",
    breaks: "that one number can name one cause",
  },
  {
    slug: "eight-on-eight",
    name: "Exactly full",
    brief:
      "Eight cores, eight runnable tasks, nothing blocked, steady for ten minutes. The load" +
      " average reads 8.00 and somebody wants to add capacity.",
    setup: {
      cores: 8,
      start: [8, 8, 8],
      phases: [{ seconds: 600, running: 8, blocked: 0, label: "eight on eight" }],
    },
    question: "What is the load average telling you?",
    options: [
      {
        id: "cpu",
        claim: "The processors are oversubscribed",
        says: { about: "blames", cause: "cpu" },
      },
      {
        id: "neither",
        claim: "Nothing is contended: every task has a core and none is waiting",
        says: { about: "blames", cause: "neither" },
      },
      {
        id: "io",
        claim: "Tasks are blocked on a device",
        says: { about: "blames", cause: "io" },
      },
      {
        id: "both",
        claim: "Queued for a core and blocked on a device",
        says: { about: "blames", cause: "both" },
      },
    ],
    why:
      "A load equal to the core count is the machine being used, not the machine being short." +
      " Eight runnable tasks on eight cores means each one has somewhere to be and nothing is" +
      " queued behind anything. It is the point at which the next task would start waiting, which" +
      " is worth knowing, and it is not the point at which anything is already wrong.",
    fix:
      "if you want to know whether tasks are actually waiting, measure the waiting:" +
      " /proc/pressure/cpu gives the share of time runnable tasks spent not running, and it is" +
      " zero here and rises the moment the ninth task arrives.",
    breaks: "that a load equal to the core count means the machine is out of capacity",
  },
  {
    slug: "one-hung-df",
    name: "One, on a sixty four core machine",
    brief:
      "Sixty four cores, essentially idle. Somebody ran df an hour ago, it touched a mount whose" +
      " server is gone, and the process is still there in D state. It cannot be killed.",
    setup: {
      cores: 64,
      start: [0, 0, 0],
      phases: [{ seconds: 3600, running: 0, blocked: 1, label: "one df, hung, forever" }],
    },
    question: "What does the fifteen minute figure read after an hour?",
    options: [
      {
        id: "one",
        claim: "1.00, held there by a single unkillable process",
        says: { about: "reads", which: "fifteen", at: 3600, value: 1 },
      },
      {
        id: "zero",
        claim: "0.00, because nothing is using a processor",
        says: { about: "reads", which: "fifteen", at: 3600, value: 0 },
      },
      {
        id: "tiny",
        claim: "0.02, being one task across sixty four cores",
        says: { about: "reads", which: "fifteen", at: 3600, value: 0.02 },
      },
      {
        id: "decayed",
        claim: "0.37, because the process has not been runnable and the figure has decayed",
        says: { about: "reads", which: "fifteen", at: 3600, value: 0.37 },
      },
    ],
    why:
      "One task in uninterruptible sleep is one unit of load for as long as it stays there, and a" +
      " process blocked in the kernel on a mount that will never answer stays there through" +
      " SIGKILL and until the machine reboots or the mount is force unmounted. A permanent 1.00 on" +
      " an idle host is close to diagnostic on its own, and it will still be there next month.",
    fix:
      "find it with ps -eo pid,state,wchan:32,cmd | awk '$2 == \"D\"'. The wchan column names the" +
      " kernel function it is stuck in, which is usually enough to say which mount. umount -f, or" +
      " umount -l if something still holds it open.",
    breaks: "that a load of 1.00 on a many core machine is nothing",
  },
  {
    slug: "the-burst-between-samples",
    name: "It never happened",
    brief:
      "Four cores. A hook forks sixty four processes, they run for two seconds, and they exit." +
      " It happens once, two seconds into the window. The load average is sampled every 5.004" +
      " seconds.",
    setup: {
      cores: 4,
      start: [0, 0, 0],
      phases: [
        { seconds: 2, running: 0, blocked: 0, label: "idle" },
        { seconds: 2, running: 64, blocked: 0, label: "sixty four processes, two seconds" },
        { seconds: 596, running: 0, blocked: 0, label: "idle again" },
      ],
    },
    question: "What is the highest the one minute figure reaches?",
    options: [
      {
        id: "some",
        claim: "5.13, being sixty four tasks folded in once",
        says: { about: "peaks", which: "one", value: 5.13 },
      },
      {
        id: "averaged",
        claim: "0.21, being sixty four tasks for two of the six hundred seconds",
        says: { about: "peaks", which: "one", value: 0.21 },
      },
      {
        id: "nothing",
        claim: "0.00: the burst began and ended between two samples and was never counted",
        says: { about: "peaks", which: "one", value: 0 },
      },
      {
        id: "full",
        claim: "64.00, because sixty four processes were runnable",
        says: { about: "peaks", which: "one", value: 64 },
      },
    ],
    why:
      "The kernel samples the instantaneous count at the tick and folds that one number in. It" +
      " does not integrate over the interval. The first sample lands at 5.004 seconds, by which" +
      " time the processes have been gone for a second, so the count it sees is zero and the load" +
      " average has no record that anything happened. Sixteen times oversubscribed, and the" +
      " graph is flat.",
    fix:
      "do not use the load average to find short bursts. Process accounting, an eBPF exec trace," +
      " or pressure stall information all see them, because they count events rather than" +
      " sampling a level.",
    breaks: "that the load average sees everything that ran",
  },
  {
    slug: "which-way-is-it-going",
    name: "Thirty, and falling",
    brief:
      "Sixteen cores. You arrive at an incident that has already been dealt with: the load" +
      " averages read 30.00 across all three, and there are now four runnable tasks and nothing" +
      " blocked. Five minutes later somebody asks whether it is recovering.",
    setup: {
      cores: 16,
      start: [30, 30, 30],
      phases: [{ seconds: 300, running: 4, blocked: 0, label: "four tasks, the incident over" }],
    },
    question: "Five minutes in, what do the one and fifteen minute figures read?",
    options: [
      {
        id: "fifteen-recovered",
        claim: "The fifteen minute figure reads 4.19 too, since they see the same tasks",
        says: { about: "reads", which: "fifteen", at: 300, value: 4.19 },
      },
      {
        id: "one-stuck",
        claim: "The one minute figure still reads 22.91",
        says: { about: "reads", which: "one", at: 300, value: 22.91 },
      },
      {
        id: "both-30",
        claim: "Both still read 30.00, because a load average only falls when the machine idles",
        says: { about: "reads", which: "one", at: 300, value: 30 },
      },
      {
        id: "one-recovered",
        claim: "The one minute figure reads 4.19, having reached the real count",
        says: { about: "reads", which: "one", at: 300, value: 4.19 },
      },
    ],
    why:
      "Three time constants means three different answers about the same instant. Five minutes" +
      " after the load dropped to four, the one minute figure has essentially arrived at 4.19 and" +
      " the fifteen minute figure is still at 22.91, because five minutes is a third of its time" +
      " constant. Neither is wrong. They are answering questions about different windows, and a" +
      " dashboard that plots one of them is answering a question nobody asked.",
    fix:
      "read them as a shape rather than as three numbers. One below five, five below fifteen means" +
      " recovering; the reverse means it is getting worse; all three equal means it has been like" +
      " this for a while.",
    breaks: "that the three figures should agree",
  },
];
