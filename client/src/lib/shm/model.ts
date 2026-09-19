/**
 * The arithmetic of a tmpfs nobody sized.
 *
 * Deliberately small, because the surface is not about a subtle calculation.
 * It is about which number applies: the host's memory, the container's memory
 * limit, or a 64 MiB filesystem that the ticket never mentions.
 */

import type { Case, Failure, Option, Platform, Setup } from "./types";

/** docker run --shm-size, when nothing sets it. The docs: "If you omit the size entirely, the system uses 64m." */
export const DOCKER_DEFAULT_SHM_MIB = 64;

/** Whether this platform has a size knob at all, and what it is called. */
export function shmKnob(platform: Platform): string | null {
  switch (platform) {
    case "docker":
      return "--shm-size";
    case "compose":
      return "shm_size";
    case "kubernetes":
      /* There is no shm-size field. The way through is an emptyDir with medium: Memory. */
      return null;
    case "host":
      return "the tmpfs mount options in /etc/fstab";
  }
}

/** Shared memory wanted at peak, in MiB. */
export const demandMiB = (setup: Setup): number => setup.units * setup.perUnitMiB;

/** Whether the peak fits inside /dev/shm. */
export const fits = (setup: Setup): boolean => demandMiB(setup) <= setup.shmMiB;

/**
 * The unit of work that dies, counting from one, or null if none does.
 *
 * The one that dies is the first whose share does not fit, so it is however
 * many whole units fit, plus one.
 */
export function diesAtUnit(setup: Setup): number | null {
  if (fits(setup)) return null;
  return Math.floor(setup.shmMiB / setup.perUnitMiB) + 1;
}

/**
 * Total charged to the container's memory limit.
 *
 * tmpfs pages are memory, so the shared memory actually in use counts against
 * memory.max alongside everything else the process holds. Raising the tmpfs
 * without raising the limit moves the failure rather than removing it.
 */
export const chargedMiB = (setup: Setup): number => setup.residentMiB + Math.min(demandMiB(setup), setup.shmMiB);

/** Whether the cgroup limit is exceeded by what the workload actually holds. */
export const overMemoryLimit = (setup: Setup): boolean =>
  setup.memoryLimitMiB !== null && chargedMiB(setup) > setup.memoryLimitMiB;

/**
 * How this ends, derived rather than asserted.
 *
 * A workload can be heading for both endings at once: more shared memory than
 * the filesystem holds, and more memory in total than the cgroup allows. An
 * early return in either order is a guess about which the kernel reaches
 * first, and a guess is not what this file is for.
 *
 * So the units come up one at a time, as they actually do, and whichever
 * limit the next one crosses is the one that ends it. A unit that does not
 * fit in the tmpfs takes SIGBUS on its own page fault; a unit that fits there
 * but pushes the cgroup past memory.max is killed. If neither happens by the
 * last unit, nothing fails.
 */
export function failure(setup: Setup): Failure {
  let used = 0;
  for (let i = 1; i <= setup.units; i += 1) {
    const next = used + setup.perUnitMiB;
    if (next > setup.shmMiB) return "sigbus";
    if (setup.memoryLimitMiB !== null && setup.residentMiB + next > setup.memoryLimitMiB) return "oom-killed";
    used = next;
  }
  return "none";
}

/**
 * A /dev/shm that fits the peak with a quarter to spare, rounded to a
 * sensible number of MiB, because these are written by hand into a unit file
 * or a compose file and 256m is a number somebody will recognize later.
 */
export function needsShmMiB(setup: Setup): number {
  const wanted = Math.ceil(demandMiB(setup) * 1.25);
  const steps = [64, 128, 256, 512, 1024, 2048, 4096, 8192];
  for (const step of steps) if (step >= wanted) return step;
  return Math.ceil(wanted / 1024) * 1024;
}

export function holds(claim: Option["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "demand":
      return demandMiB(setup) === claim.mib;
    case "fits":
      return fits(setup) === claim.value;
    case "dies-at-unit":
      return diesAtUnit(setup) === claim.count;
    case "failure":
      return failure(setup) === claim.value;
    case "needs-shm":
      return needsShmMiB(setup) === claim.mib;
    case "nothing":
      return false;
  }
}

export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** MiB as people write it: 64m, 1g. */
export const human = (mib: number): string => (mib % 1024 === 0 ? `${mib / 1024}g` : `${mib}m`);

/** How this container was started, in the platform's own syntax. */
export function asInvocation(setup: Setup): string {
  const knob = shmKnob(setup.platform);
  const limit = setup.memoryLimitMiB;
  switch (setup.platform) {
    case "docker":
      return [
        `$ docker run \\`,
        ...(setup.shmMiB !== DOCKER_DEFAULT_SHM_MIB ? [`    --shm-size=${human(setup.shmMiB)} \\`] : []),
        ...(limit !== null ? [`    --memory=${human(limit)} \\`] : []),
        `    ${setup.workload}`,
        ...(setup.shmMiB === DOCKER_DEFAULT_SHM_MIB
          ? ["", "# no --shm-size, so /dev/shm is the 64m default"]
          : []),
      ].join("\n");
    case "compose":
      return [
        "services:",
        "  app:",
        `    image: ${setup.workload}`,
        ...(setup.shmMiB !== DOCKER_DEFAULT_SHM_MIB ? [`    shm_size: ${human(setup.shmMiB)}`] : []),
        ...(limit !== null ? ["    deploy:", "      resources:", "        limits:", `          memory: ${human(limit)}`] : []),
        ...(setup.shmMiB === DOCKER_DEFAULT_SHM_MIB ? ["", "# no shm_size key, so /dev/shm is the 64m default"] : []),
      ].join("\n");
    case "kubernetes":
      return [
        "spec:",
        "  containers:",
        "    - name: app",
        `      image: ${setup.workload}`,
        ...(limit !== null ? ["      resources:", "        limits:", `          memory: ${human(limit)}`] : []),
        "",
        `# there is no shm-size field here. /dev/shm is ${human(setup.shmMiB)}`,
        ...(knob === null && setup.shmMiB === DOCKER_DEFAULT_SHM_MIB
          ? ["# because that is what the runtime mounts when nothing overrides it"]
          : []),
      ].join("\n");
    case "host":
      return [
        `$ ${setup.workload}`,
        "",
        `$ findmnt /dev/shm`,
        `TARGET   SOURCE FSTYPE OPTIONS`,
        `/dev/shm tmpfs  tmpfs  rw,nosuid,nodev,size=${setup.shmMiB * 1024}k`,
      ].join("\n");
  }
}

/** What the operator sees, which is the part that misleads. */
export function asSymptom(setup: Setup): string {
  const mode = failure(setup);
  const died = diesAtUnit(setup);
  if (mode === "none") {
    return [
      `$ df -h /dev/shm`,
      `Filesystem      Size  Used Avail Use% Mounted on`,
      `shm             ${human(setup.shmMiB).padEnd(4)}  ${human(demandMiB(setup)).padEnd(4)}  ${human(setup.shmMiB - demandMiB(setup)).padEnd(4)}  ${Math.round((demandMiB(setup) / setup.shmMiB) * 100)}% /dev/shm`,
      "",
      "# it runs.",
    ].join("\n");
  }
  if (mode === "oom-killed") {
    return [
      "$ dmesg | tail -2",
      `[  ...] Memory cgroup out of memory: Killed process 1 (${setup.workload.split(":")[0]})`,
      `[  ...] anon-rss:${setup.residentMiB}MB, shmem-rss:${Math.min(demandMiB(setup), setup.shmMiB)}MB`,
      "",
      `# ${chargedMiB(setup)} MiB charged against a limit of ${setup.memoryLimitMiB} MiB.`,
      "# The tmpfs was big enough. Its pages are still memory.",
    ].join("\n");
  }
  return [
    `$ ${setup.workload.split(":")[0]}`,
    `Bus error (core dumped)`,
    "",
    `$ df -h /dev/shm`,
    `Filesystem      Size  Used Avail Use% Mounted on`,
    `shm             ${human(setup.shmMiB).padEnd(4)}  ${human(setup.shmMiB).padEnd(4)}  0     100% /dev/shm`,
    "",
    `$ free -g | head -2`,
    `               total        used        free`,
    `Mem:              ${Math.round(setup.hostMiB / 1024)}           ${Math.round(setup.residentMiB / 1024)}          ${Math.round((setup.hostMiB - setup.residentMiB) / 1024)}`,
    "",
    `# ${Math.round((setup.hostMiB - setup.residentMiB) / 1024)} GiB free on the host, and it died on ${unitLabel(setup, died)}.`,
    "# dmesg says nothing. There is no OOM kill and no errno.",
  ].join("\n");
}

/** "renderer 7 of 12", for the prose and the rendered symptom. */
export function unitLabel(setup: Setup, index: number | null): string {
  if (index === null) return `all ${setup.units} ${setup.unit}s`;
  return `${setup.unit} ${index} of ${setup.units}`;
}
