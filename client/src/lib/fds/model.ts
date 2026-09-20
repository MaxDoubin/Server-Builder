import type { Claim, Setup } from "./types";

/**
 * setrlimit as kernel/sys.c performs it, in order.
 *
 *     if (new_rlim->rlim_cur > new_rlim->rlim_max)
 *             return -EINVAL;
 *     if (resource == RLIMIT_NOFILE &&
 *                     new_rlim->rlim_max > sysctl_nr_open)
 *             return -EPERM;
 *     ...
 *     if (new_rlim->rlim_max > old_rlim->rlim_max &&
 *                     !capable(CAP_SYS_RESOURCE))
 *             return -EPERM;
 *
 * Three refusals and no clamping anywhere. A request over fs.nr_open does not
 * come back reduced, it comes back as an error, and the process keeps the
 * limits it had. Measured: setrlimit(NOFILE, (20000, 1048577)) against an
 * fs.nr_open of 1048576 returned "not allowed to raise maximum limit" and the
 * pair stayed at 20000/20000.
 *
 * Note the second check is unconditional. CAP_SYS_RESOURCE excuses the third
 * and not the second, so fs.nr_open binds a privileged process too. That
 * branch is read from the source rather than measured, because the container
 * these numbers came from is the one that cannot hold the capability.
 */
export function afterSetrlimit(setup: Setup): { soft: number; hard: number; refused: boolean } {
  const held = { soft: setup.soft, hard: setup.hard };
  if (setup.wantSoft === null && setup.wantHard === null) return { ...held, refused: false };
  const asked = { soft: setup.wantSoft ?? held.soft, hard: setup.wantHard ?? held.hard };
  if (asked.soft > asked.hard) return { ...held, refused: true };
  if (asked.hard > setup.nrOpen) return { ...held, refused: true };
  if (asked.hard > held.hard && !setup.sysResource) return { ...held, refused: true };
  return { soft: asked.soft, hard: asked.hard, refused: false };
}

/**
 * Whether the process is stuck: not just this call refused, but every call.
 *
 * Because setrlimit carries both values, a call that only means to lower the
 * soft limit still restates the hard one, and the unconditional fs.nr_open
 * check above sees that restatement. So a held hard limit above fs.nr_open
 * freezes the process in both directions, and lowering fs.nr_open system wide
 * does that to everything already running above it.
 *
 * Measured: holding hard=20000 with fs.nr_open lowered to 4096, a call
 * setting soft to 5000 was refused with "not allowed to raise maximum limit",
 * which names the limit it was not trying to change.
 */
export function frozen(setup: Setup): boolean {
  return setup.hard > setup.nrOpen;
}

/** The hard limit the process ends up with. */
export function effectiveHard(setup: Setup): number {
  return afterSetrlimit(setup).hard;
}

/** The soft limit the process actually runs with. */
export function effectiveSoft(setup: Setup): number {
  return afterSetrlimit(setup).soft;
}

/**
 * What the workload gets when it opens its descriptors.
 *
 * EMFILE comes from the per process check in alloc_fd against the soft limit
 * and was measured here: with the soft limit at 200 the 200th descriptor
 * failed and the highest number handed out was 199.
 *
 * ENFILE comes from __alloc_file, which refuses once get_nr_files() reaches
 * files_stat.max_files. It is from the source rather than from a measurement,
 * because filling fs.file-max on the machine these numbers came from would
 * have taken the machine with it. The measured peak was 563 of 1645588, which
 * is 0.034 percent, and is the reason this branch is the rare one.
 */
export function outcome(setup: Setup): "ok" | "emfile" | "enfile" {
  if (setup.needFds > effectiveSoft(setup)) return "emfile";
  if (setup.systemOpen + setup.needFds > setup.fileMax) return "enfile";
  return "ok";
}

/**
 * Which of the four numbers is the one actually stopping you.
 *
 * This is the whole surface in one function. The answer is the soft limit far
 * more often than the reading of the error suggests, and it is fs.nr_open or
 * a missing capability in exactly the cases where raising the soft limit
 * appears to do nothing.
 */
export function binding(setup: Setup): string {
  if (frozen(setup)) return "fs.nr_open";
  if (outcome(setup) === "enfile") return "fs.file-max";
  if (outcome(setup) === "ok") return "nothing";

  /*
    The soft limit stopped it. Say what stopped the soft limit, because that
    is the number somebody has to change and it is rarely the same one.
  */
  const call = afterSetrlimit(setup);
  if (call.refused && setup.wantHard !== null) {
    if (setup.wantHard > setup.nrOpen) return "fs.nr_open";
    if (setup.wantHard > setup.hard && !setup.sysResource) return "CAP_SYS_RESOURCE";
  }
  if (setup.wantSoft !== null && setup.wantSoft > call.hard) return "RLIMIT_NOFILE hard";
  return "RLIMIT_NOFILE soft";
}

/** The four lines a reader would gather before answering. */
export function asLimits(setup: Setup): { name: string; value: string; note: string }[] {
  return [
    { name: "fs.file-max", value: String(setup.fileMax), note: "the whole machine" },
    { name: "fs.nr_open", value: String(setup.nrOpen), note: "ceiling on any hard limit" },
    { name: "RLIMIT_NOFILE soft", value: String(setup.soft), note: "what it may open now" },
    { name: "RLIMIT_NOFILE hard", value: String(setup.hard), note: "what it may raise soft to" },
    {
      name: "CAP_SYS_RESOURCE",
      value: setup.sysResource ? "held" : "not held",
      note: setup.sysResource ? "may raise the hard limit" : "uid 0 does not imply it",
    },
  ];
}

/** A count a person would say out loud. */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "soft":
      return claim.value === effectiveSoft(setup);
    case "hard":
      return claim.value === effectiveHard(setup);
    case "frozen":
      return claim.value === frozen(setup);
    case "outcome":
      return claim.is === outcome(setup);
    case "binding":
      return claim.name === binding(setup);
    case "nothing":
      return false;
  }
}

/**
 * The option the model says is right.
 *
 * The page calls this rather than reading an answer out of the data, which is
 * the property check-answer-keys exists to hold.
 */
export function correctOption(item: { setup: Setup; options: { id: string; says: Claim }[] }) {
  return item.options.find((option) => claimHolds(option.says, item.setup));
}
