/**
 * Linux capabilities: the bit table, the parsers and the analysis.
 *
 * Capability numbers are the kernel's, from include/uapi/linux/capability.h,
 * CAP_CHOWN (0) through CAP_CHECKPOINT_RESTORE (40). A capability set is one
 * unsigned 64 bit mask with bit N meaning capability N, which is exactly how
 * /proc/<pid>/status prints CapInh, CapPrm, CapEff, CapBnd and CapAmb: sixteen
 * hex digits, most significant first. BigInt carries the masks so bit 63 and
 * the full 64 bit range stay exact.
 *
 * The text form that capsh and getpcaps print follows cap_from_text(3) in
 * libcap: whitespace separated clauses of the shape
 *
 *     [capability list][operator flags][operator flags]...
 *
 * where an empty list or the word "all" means every capability, the
 * operators are "=", "+" and "-", and the flags are e (effective),
 * i (inheritable) and p (permitted). "=" first lowers the listed
 * capabilities in all three sets and then raises them in the sets named.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/* ----------------------------------------------------------- the table */

export type Risk = "low" | "medium" | "high" | "critical";

/** "yes" can be turned into full root on its own. "context" depends on what the process shares with the host. */
export type RootLike = "yes" | "context";

export interface Capability {
  bit: number;
  /** The kernel's name, such as CAP_SYS_ADMIN. */
  name: string;
  /** One line, after capabilities(7). */
  description: string;
  risk: Risk;
  rootLike?: RootLike;
  /** Why the rating is what it is. Written for the ratings that need a reason. */
  why?: string;
  /** First kernel release that defines it, only for the ones whose absence dates a kernel. */
  since?: string;
}

export const CAPABILITIES: Capability[] = [
  {
    bit: 0,
    name: "CAP_CHOWN",
    description: "Change the owner and group of any file.",
    risk: "high",
    why: "Owning /etc/passwd, a sudoers file or a script that root runs is enough to rewrite it.",
  },
  {
    bit: 1,
    name: "CAP_DAC_OVERRIDE",
    description: "Bypass file read, write and execute permission checks.",
    risk: "critical",
    rootLike: "yes",
    why: "It can edit /etc/passwd, /etc/shadow, sudoers and cron files. Inside a container it reaches only the files the container can see.",
  },
  {
    bit: 2,
    name: "CAP_DAC_READ_SEARCH",
    description: "Bypass file read permission and directory search checks, and call open_by_handle_at(2).",
    risk: "critical",
    rootLike: "yes",
    why: "It reads any file, including keys and password hashes. open_by_handle_at(2) opens a file by inode handle and skips path lookup, which a 2014 exploit named shocker used to read host files from a container.",
  },
  {
    bit: 3,
    name: "CAP_FOWNER",
    description: "Bypass checks that require owning the file, such as chmod and setting timestamps or ACLs.",
    risk: "high",
    why: "It can change the mode of any file, including making /etc/shadow writable.",
  },
  {
    bit: 4,
    name: "CAP_FSETID",
    description: "Keep setuid and setgid bits when a file is modified, and set setgid on a file of a group the caller is not in.",
    risk: "low",
  },
  {
    bit: 5,
    name: "CAP_KILL",
    description: "Send signals to any process, bypassing the owner check.",
    risk: "medium",
    why: "It can stop monitoring, logging and security agents, or any service.",
  },
  {
    bit: 6,
    name: "CAP_SETGID",
    description: "Set any group ID or supplementary group list, and write a group ID map in a user namespace.",
    risk: "high",
    why: "Joining group 0, shadow, disk or docker exposes whatever that group can read or control.",
  },
  {
    bit: 7,
    name: "CAP_SETUID",
    description: "Set any user ID, including root, and write a user ID map in a user namespace.",
    risk: "critical",
    rootLike: "yes",
    why: "setuid(0) makes the process root. An interpreter or shell that holds it is a root shell.",
  },
  {
    bit: 8,
    name: "CAP_SETPCAP",
    description: "Add bounding set capabilities to the inheritable set, drop bounding set capabilities and change securebits.",
    risk: "medium",
    why: "It cannot create a capability from nothing, but it can widen the inheritable set within the bounding set and change securebits.",
  },
  {
    bit: 9,
    name: "CAP_LINUX_IMMUTABLE",
    description: "Set or clear the immutable and append-only file attributes.",
    risk: "medium",
    why: "It can strip the immutable flag from files that were locked to protect them, and then change them.",
  },
  {
    bit: 10,
    name: "CAP_NET_BIND_SERVICE",
    description: "Bind a socket to a port below 1024.",
    risk: "low",
  },
  {
    bit: 11,
    name: "CAP_NET_BROADCAST",
    description: "Reserved for socket broadcasts and listening to multicasts. The kernel does not check it.",
    risk: "low",
  },
  {
    bit: 12,
    name: "CAP_NET_ADMIN",
    description: "Configure interfaces, firewall rules, routing, traffic control and other network settings.",
    risk: "high",
    rootLike: "context",
    why: "With the host's network namespace it can rewrite the host's firewall and routes and capture traffic. In a private network namespace it controls only that namespace.",
  },
  {
    bit: 13,
    name: "CAP_NET_RAW",
    description: "Open raw and packet sockets, and bind to any address for transparent proxying.",
    risk: "medium",
    why: "It allows packet capture and forged packets, including ARP and ICMP spoofing, on every network the process can reach.",
  },
  {
    bit: 14,
    name: "CAP_IPC_LOCK",
    description: "Lock memory so it cannot be swapped, past the normal limit.",
    risk: "low",
  },
  {
    bit: 15,
    name: "CAP_IPC_OWNER",
    description: "Bypass permission checks on System V IPC objects.",
    risk: "low",
  },
  {
    bit: 16,
    name: "CAP_SYS_MODULE",
    description: "Load and unload kernel modules.",
    risk: "critical",
    rootLike: "yes",
    why: "A module runs inside the kernel with no restrictions. Only enforced module signing or kernel lockdown limits it.",
  },
  {
    bit: 17,
    name: "CAP_SYS_RAWIO",
    description: "Raw I/O: I/O ports, /dev/mem, /proc/kcore and some device commands.",
    risk: "high",
    why: "It reaches physical memory and hardware through interfaces such as /dev/mem and /proc/kcore. Kernel hardening options limit what stays usable.",
  },
  {
    bit: 18,
    name: "CAP_SYS_CHROOT",
    description: "Use chroot(2) and change mount namespaces with setns(2).",
    risk: "low",
  },
  {
    bit: 19,
    name: "CAP_SYS_PTRACE",
    description: "Trace any process with ptrace(2) and read or write the memory of any process.",
    risk: "critical",
    rootLike: "yes",
    why: "It can inject code into a root-owned process or read secrets from its memory. Inside a container it reaches host processes only when the container shares the host's PID namespace.",
  },
  {
    bit: 20,
    name: "CAP_SYS_PACCT",
    description: "Turn process accounting on and off with acct(2).",
    risk: "low",
  },
  {
    bit: 21,
    name: "CAP_SYS_ADMIN",
    description: "The catch-all: mount, namespaces, swap, many ioctls and a long list of unrelated privileged operations.",
    risk: "critical",
    rootLike: "yes",
    why: "Mounting filesystems, entering namespaces and writing cgroup settings are among the operations it unlocks, and several known container escapes start from it.",
  },
  {
    bit: 22,
    name: "CAP_SYS_BOOT",
    description: "Reboot the machine and load a new kernel with kexec_load(2).",
    risk: "high",
    why: "A reboot is a denial of service, and kexec_load can replace the running kernel unless lockdown forbids it.",
  },
  {
    bit: 23,
    name: "CAP_SYS_NICE",
    description: "Raise process priority, set real-time scheduling and CPU affinity, and change the priority of other processes.",
    risk: "low",
  },
  {
    bit: 24,
    name: "CAP_SYS_RESOURCE",
    description: "Override resource limits, disk quotas and filesystem space reserved for root.",
    risk: "medium",
    why: "It can exhaust processes, memory or reserved disk space and starve the rest of the system.",
  },
  {
    bit: 25,
    name: "CAP_SYS_TIME",
    description: "Set the system clock and the hardware clock.",
    risk: "medium",
    why: "A wrong clock breaks certificate and token validity, Kerberos, one-time passwords and the ordering of log entries.",
  },
  {
    bit: 26,
    name: "CAP_SYS_TTY_CONFIG",
    description: "Configure virtual terminals and use vhangup(2).",
    risk: "low",
  },
  {
    bit: 27,
    name: "CAP_MKNOD",
    description: "Create special files such as device nodes with mknod(2).",
    risk: "medium",
    why: "A device node for a disk is a route to the raw disk, though a container's device cgroup normally blocks opening it.",
  },
  {
    bit: 28,
    name: "CAP_LEASE",
    description: "Take file leases on files the process does not own.",
    risk: "low",
  },
  {
    bit: 29,
    name: "CAP_AUDIT_WRITE",
    description: "Write records to the kernel audit log.",
    risk: "low",
  },
  {
    bit: 30,
    name: "CAP_AUDIT_CONTROL",
    description: "Enable and disable auditing, change audit rules and read audit status.",
    risk: "high",
    why: "Turning auditing off or deleting rules blinds the audit trail that incident responders depend on.",
  },
  {
    bit: 31,
    name: "CAP_SETFCAP",
    description: "Set arbitrary capabilities on a file.",
    risk: "high",
    why: "It can give a binary capabilities such as cap_setuid and then run it to escalate.",
  },
  {
    bit: 32,
    name: "CAP_MAC_OVERRIDE",
    description: "Override mandatory access control. Implemented for the Smack LSM.",
    risk: "high",
    why: "Where Smack is in use, it bypasses the policy that confines processes.",
  },
  {
    bit: 33,
    name: "CAP_MAC_ADMIN",
    description: "Change mandatory access control configuration or state. Implemented for the Smack LSM.",
    risk: "high",
    why: "It can weaken or replace the mandatory access control policy that confines other processes.",
  },
  {
    bit: 34,
    name: "CAP_SYSLOG",
    description: "Read the kernel log and see kernel addresses when dmesg_restrict or kptr_restrict apply.",
    risk: "medium",
    why: "Kernel addresses and log messages help an attacker defeat KASLR and plan a kernel exploit.",
  },
  {
    bit: 35,
    name: "CAP_WAKE_ALARM",
    description: "Set timers that wake the system from suspend.",
    risk: "low",
  },
  {
    bit: 36,
    name: "CAP_BLOCK_SUSPEND",
    description: "Use features that can prevent the system from suspending.",
    risk: "low",
  },
  {
    bit: 37,
    name: "CAP_AUDIT_READ",
    description: "Read the audit log through a multicast netlink socket.",
    risk: "medium",
    why: "Audit records can hold command lines, file paths and user activity for the whole system.",
    since: "Linux 3.16",
  },
  {
    bit: 38,
    name: "CAP_PERFMON",
    description: "Use performance monitoring such as perf_event_open(2), and BPF operations with performance impact.",
    risk: "medium",
    why: "Profiling the kernel and other processes can reveal kernel addresses and what other processes are doing.",
    since: "Linux 5.8",
  },
  {
    bit: 39,
    name: "CAP_BPF",
    description: "Load and use BPF programs and maps, the privileged operations of bpf(2).",
    risk: "high",
    why: "BPF programs run inside the kernel, and verifier bugs have repeatedly led to local privilege escalation.",
    since: "Linux 5.8",
  },
  {
    bit: 40,
    name: "CAP_CHECKPOINT_RESTORE",
    description: "Checkpoint and restore support: set ns_last_pid, use clone3(2) set_tid and read /proc/<pid>/map_files.",
    risk: "low",
    since: "Linux 5.9",
  },
];

/** How many capabilities this table names. The kernel's CAP_LAST_CAP is 40, so 41. */
export const KNOWN_COUNT = CAPABILITIES.length;
export const ALL_KNOWN_MASK = (1n << BigInt(KNOWN_COUNT)) - 1n;
const MASK64 = (1n << 64n) - 1n;

export const RISK_LABEL: Record<Risk, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const RISK_ORDER: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Docker Engine's default capability set, as documented under "Runtime privilege and Linux capabilities". */
export const DOCKER_DEFAULT_NAMES: string[] = [
  "CAP_CHOWN",
  "CAP_DAC_OVERRIDE",
  "CAP_FSETID",
  "CAP_FOWNER",
  "CAP_MKNOD",
  "CAP_NET_RAW",
  "CAP_SETGID",
  "CAP_SETUID",
  "CAP_SETFCAP",
  "CAP_SETPCAP",
  "CAP_NET_BIND_SERVICE",
  "CAP_SYS_CHROOT",
  "CAP_KILL",
  "CAP_AUDIT_WRITE",
];

const BY_NAME = new Map<string, Capability>(CAPABILITIES.map((c) => [c.name.slice(4).toLowerCase(), c]));

export function capabilityForBit(bit: number): Capability | undefined {
  return CAPABILITIES[bit];
}

/* --------------------------------------------------------------- masks */

/** Bit positions set in a mask, ascending, within 0 to 63. */
export function maskToBits(mask: bigint): number[] {
  const value = mask & MASK64;
  const out: number[] = [];
  for (let bit = 0; bit < 64; bit += 1) {
    if ((value >> BigInt(bit)) & 1n) out.push(bit);
  }
  return out;
}

export function bitsToMask(bits: Iterable<number>): bigint {
  let mask = 0n;
  for (const bit of bits) {
    if (Number.isInteger(bit) && bit >= 0 && bit < 64) mask |= 1n << BigInt(bit);
  }
  return mask;
}

/** The sixteen digit form /proc prints. */
export function hex16(mask: bigint): string {
  return (mask & MASK64).toString(16).padStart(16, "0");
}

export const DOCKER_DEFAULT_MASK = bitsToMask(
  DOCKER_DEFAULT_NAMES.map((name) => {
    const cap = BY_NAME.get(name.slice(4).toLowerCase());
    return cap ? cap.bit : -1;
  }),
);

export type HexResult = { ok: true; mask: bigint } | { ok: false; message: string };

/** One hex mask: 0x optional, one to sixteen digits, any case. */
export function parseHexMask(token: string): HexResult {
  const text = token.trim();
  const body = /^0x/i.test(text) ? text.slice(2) : text;
  if (body === "") return { ok: false, message: "The mask is empty." };
  if (!/^[0-9a-f]+$/i.test(body)) {
    return { ok: false, message: `"${truncate(text, 24)}" is not a hexadecimal mask. Use the digits 0 to 9 and a to f.` };
  }
  if (body.length > 16) {
    return {
      ok: false,
      message: `A capability mask is at most 16 hex digits (64 bits). This one has ${body.length}.`,
    };
  }
  return { ok: true, mask: BigInt(`0x${body}`) };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

/* ------------------------------------------------------------- set kinds */

export type SetKey = "effective" | "permitted" | "inheritable" | "bounding" | "ambient" | "mask";

export interface SetInfo {
  key: SetKey;
  label: string;
  /** The field name in /proc/<pid>/status. */
  field: string;
  /** The one letter used in the capability matrix header. */
  short: string;
  meaning: string;
}

export const SET_INFO: Record<SetKey, SetInfo> = {
  effective: {
    key: "effective",
    label: "Effective",
    field: "CapEff",
    short: "E",
    meaning:
      "What the kernel checks when the process attempts a privileged operation. This is the set that matters right now.",
  },
  permitted: {
    key: "permitted",
    label: "Permitted",
    field: "CapPrm",
    short: "P",
    meaning:
      "The capabilities the process may draw on. The effective set can only hold capabilities that are also permitted.",
  },
  inheritable: {
    key: "inheritable",
    label: "Inheritable",
    field: "CapInh",
    short: "I",
    meaning:
      "Capabilities that may carry across execve(2). A program receives one only if its file inheritable set names it too.",
  },
  bounding: {
    key: "bounding",
    label: "Bounding",
    field: "CapBnd",
    short: "B",
    meaning:
      "A ceiling on what execve(2) can grant to this process and its children. It can shrink but never grow.",
  },
  ambient: {
    key: "ambient",
    label: "Ambient",
    field: "CapAmb",
    short: "A",
    meaning:
      "Capabilities an unprivileged program keeps across execve(2) without file capabilities. Always a subset of permitted and inheritable.",
  },
  mask: {
    key: "mask",
    label: "Mask",
    field: "mask",
    short: "M",
    meaning: "A bare capability mask that is not tied to one of the five sets.",
  },
};

/** Display order: the set that decides access first. */
export const SET_ORDER: SetKey[] = ["effective", "permitted", "inheritable", "bounding", "ambient", "mask"];

const FIELD_TO_KEY: Record<string, SetKey> = {
  capinh: "inheritable",
  capprm: "permitted",
  capeff: "effective",
  capbnd: "bounding",
  capamb: "ambient",
};

export interface DecodedSet {
  key: SetKey;
  mask: bigint;
}

/* --------------------------------------------------------- names + text */

/** Levenshtein distance, for a "did you mean" on a mistyped name. */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

function suggest(bare: string): string | null {
  let best: { name: string; d: number } | null = null;
  for (const cap of CAPABILITIES) {
    const candidate = cap.name.slice(4).toLowerCase();
    const d = distance(bare, candidate);
    if (best === null || d < best.d) best = { name: cap.name.toLowerCase(), d };
  }
  return best && best.d <= 3 ? best.name : null;
}

type NameResult = { ok: true; bit: number } | { ok: false; message: string };

/**
 * A capability by name or number. The prefix is optional and case does not
 * matter, so cap_net_admin, CAP_NET_ADMIN and NET_ADMIN all work, as does the
 * bare number libcap prints for a capability it has no name for.
 */
export function lookupName(token: string): NameResult {
  const text = token.trim();
  const lower = text.toLowerCase();
  const bare = lower.startsWith("cap_") ? lower.slice(4) : lower;
  if (/^\d{1,3}$/.test(bare)) {
    const bit = Number(bare);
    if (bit > 63) return { ok: false, message: `Capability number ${bit} is out of range. The mask has bits 0 to 63.` };
    return { ok: true, bit };
  }
  const cap = BY_NAME.get(bare);
  if (cap) return { ok: true, bit: cap.bit };
  const guess = suggest(bare);
  return {
    ok: false,
    message: `"${truncate(text, 32)}" is not a Linux capability name.${guess ? ` Did you mean ${guess}?` : ""}`,
  };
}

/** A comma or whitespace separated list of names, or "all". */
function parseNameList(text: string): HexResult {
  let mask = 0n;
  for (const token of text.split(/[\s,]+/)) {
    if (token === "") continue;
    if (token.toLowerCase() === "all") {
      mask |= ALL_KNOWN_MASK;
      continue;
    }
    const found = lookupName(token);
    if (!found.ok) return { ok: false, message: found.message };
    mask |= 1n << BigInt(found.bit);
  }
  return { ok: true, mask };
}

export interface FlagSets {
  effective: bigint;
  permitted: bigint;
  inheritable: bigint;
}

export type TextResult =
  | { ok: true; plain: true; mask: bigint }
  | { ok: true; plain: false; sets: FlagSets }
  | { ok: false; message: string };

/**
 * libcap's text form, per cap_from_text(3). With no operator anywhere the text
 * is a plain list of names and comes back as one mask.
 */
export function parseCapText(text: string): TextResult {
  const clauses = text.trim().split(/\s+/).filter((c) => c !== "");
  if (!clauses.some((c) => /[=+-]/.test(c))) {
    const list = parseNameList(text);
    return list.ok ? { ok: true, plain: true, mask: list.mask } : list;
  }

  const sets: FlagSets = { effective: 0n, permitted: 0n, inheritable: 0n };
  for (const clause of clauses) {
    const at = clause.search(/[=+-]/);
    if (at < 0) {
      return {
        ok: false,
        message: `"${truncate(clause, 32)}" has no operator. Each clause is a capability list followed by =, + or - and the flags e, i or p, as in cap_net_raw+ep.`,
      };
    }
    const listText = clause.slice(0, at);
    const actions = clause.slice(at);

    let caps: bigint;
    if (listText === "" || listText.toLowerCase() === "all") {
      caps = ALL_KNOWN_MASK;
    } else {
      const list = parseNameList(listText);
      if (!list.ok) return list;
      caps = list.mask;
    }

    const pattern = /([=+-])([^=+-]*)/g;
    let consumed = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(actions)) !== null) {
      consumed += match[0].length;
      const op = match[1];
      const flags = match[2].toLowerCase();
      if (!/^[eip]*$/.test(flags)) {
        const bad = flags.replace(/[eip]/g, "")[0];
        return { ok: false, message: `"${bad}" is not a capability flag. The flags are e, i and p.` };
      }
      const wantE = flags.includes("e");
      const wantI = flags.includes("i");
      const wantP = flags.includes("p");
      if (op === "=") {
        sets.effective &= ~caps;
        sets.inheritable &= ~caps;
        sets.permitted &= ~caps;
      }
      if (op === "-") {
        if (wantE) sets.effective &= ~caps;
        if (wantI) sets.inheritable &= ~caps;
        if (wantP) sets.permitted &= ~caps;
      } else {
        if (wantE) sets.effective |= caps;
        if (wantI) sets.inheritable |= caps;
        if (wantP) sets.permitted |= caps;
      }
    }
    if (consumed !== actions.length) {
      return { ok: false, message: `Could not read "${truncate(clause, 32)}" as a capability clause.` };
    }
  }
  return { ok: true, plain: false, sets };
}

/* ------------------------------------------------------------ the input */

/** Longer than this is not a status block or a capsh listing. */
export const MAX_INPUT_CHARS = 20000;

export type Format = "proc-status" | "capsh" | "getpcaps" | "hex" | "names" | "text";

export const FORMAT_LABEL: Record<Format, string> = {
  "proc-status": "/proc status lines",
  capsh: "capsh --print output",
  getpcaps: "getpcaps output",
  hex: "a hex mask",
  names: "capability names",
  text: "libcap capability text",
};

export interface ProcessInfo {
  name?: string;
  pid?: number;
  noNewPrivs?: boolean;
  seccomp?: 0 | 1 | 2;
}

export type ParseOutcome =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; format: Format; sets: DecodedSet[]; process: ProcessInfo; notes: string[] };

function orderSets(sets: DecodedSet[]): DecodedSet[] {
  return [...sets].sort((a, b) => SET_ORDER.indexOf(a.key) - SET_ORDER.indexOf(b.key));
}

function fromFlagSets(flags: FlagSets): DecodedSet[] {
  return [
    { key: "effective", mask: flags.effective },
    { key: "permitted", mask: flags.permitted },
    { key: "inheritable", mask: flags.inheritable },
  ];
}

// Values are captured greedily and trimmed in code: a lazy (.*?)\s*$ backtracks quadratically on a long run of spaces.
const PROC_LINE = /^\s*(CapInh|CapPrm|CapEff|CapBnd|CapAmb)\s*:(.*)$/i;
const CAPSH_CURRENT = /^\s*Current\s*:(.*)$/;
const CAPSH_BOUNDING = /^\s*Bounding set\s*=(.*)$/;
const CAPSH_AMBIENT = /^\s*Ambient set\s*=(.*)$/;
const CAPSH_IAB = /^\s*Current IAB\s*:/;
const GETPCAPS_LONG = /^\s*Capabilities for\s+[`'"]*(\d+)[`'"]*\s*:(.*)$/;
const GETPCAPS_SHORT = /^\s*(\d+)\s*:\s+(\S.*)$/;

export function parseInput(raw: string): ParseOutcome {
  const text = raw.replace(/\r\n?/g, "\n");
  if (text.trim() === "") return { kind: "empty" };
  if (text.length > MAX_INPUT_CHARS) {
    return {
      kind: "error",
      message: `That is ${text.length.toLocaleString("en-US")} characters. This tool reads up to ${MAX_INPUT_CHARS.toLocaleString("en-US")}; the capability lines of a status block are well under 200.`,
    };
  }
  const lines = text.split("\n");
  const notes: string[] = [];

  // 1. /proc/<pid>/status, whole or cut down to the Cap lines.
  const procSets = new Map<SetKey, bigint>();
  for (const line of lines) {
    const m = PROC_LINE.exec(line);
    if (!m) continue;
    const field = m[1];
    const key = FIELD_TO_KEY[field.toLowerCase()];
    const parsed = parseHexMask(m[2]);
    if (!parsed.ok) return { kind: "error", message: `${field}: ${parsed.message}` };
    if (procSets.has(key)) {
      notes.push(`${field} appears more than once. The first one is used.`);
      continue;
    }
    procSets.set(key, parsed.mask);
  }
  if (procSets.size > 0) {
    const process: ProcessInfo = {};
    for (const line of lines) {
      let m = /^\s*Name\s*:\s*(\S.*)$/.exec(line);
      if (m && process.name === undefined) process.name = m[1].trim();
      m = /^\s*Pid\s*:\s*(\d+)\s*$/.exec(line);
      if (m && process.pid === undefined) process.pid = Number(m[1]);
      m = /^\s*NoNewPrivs\s*:\s*([01])\s*$/.exec(line);
      if (m && process.noNewPrivs === undefined) process.noNewPrivs = m[1] === "1";
      m = /^\s*Seccomp\s*:\s*([012])\s*$/.exec(line);
      if (m && process.seccomp === undefined) process.seccomp = Number(m[1]) as 0 | 1 | 2;
    }
    const sets = [...procSets.entries()].map(([key, mask]) => ({ key, mask }));
    return { kind: "ok", format: "proc-status", sets: orderSets(sets), process, notes };
  }

  // 2. capsh --print.
  let capshHit = false;
  const capshSets: DecodedSet[] = [];
  for (const line of lines) {
    let m = CAPSH_CURRENT.exec(line);
    if (m) {
      capshHit = true;
      const parsed = parseCapText(m[1]);
      if (!parsed.ok) return { kind: "error", message: `Current: ${parsed.message}` };
      if (parsed.plain) {
        return {
          kind: "error",
          message: "The Current line needs flags, as in =ep or cap_net_raw+ep, to say which sets hold each capability.",
        };
      }
      capshSets.push(...fromFlagSets(parsed.sets));
      continue;
    }
    m = CAPSH_BOUNDING.exec(line);
    if (m) {
      capshHit = true;
      const parsed = parseNameList(m[1]);
      if (!parsed.ok) return { kind: "error", message: `Bounding set: ${parsed.message}` };
      capshSets.push({ key: "bounding", mask: parsed.mask });
      continue;
    }
    m = CAPSH_AMBIENT.exec(line);
    if (m) {
      capshHit = true;
      const parsed = parseNameList(m[1]);
      if (!parsed.ok) return { kind: "error", message: `Ambient set: ${parsed.message}` };
      capshSets.push({ key: "ambient", mask: parsed.mask });
      continue;
    }
    if (CAPSH_IAB.test(line)) {
      notes.push(
        "The Current IAB line is not decoded. It restates the inheritable, ambient and bounding sets in another notation.",
      );
    }
  }
  if (capshHit) {
    const seen = new Set<SetKey>();
    const unique = capshSets.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true)));
    return { kind: "ok", format: "capsh", sets: orderSets(unique), process: {}, notes };
  }

  // 3. getpcaps: "1234: =ep" or "Capabilities for `1234': =ep".
  const pcaps: { pid: number; text: string }[] = [];
  for (const line of lines) {
    const m = GETPCAPS_LONG.exec(line) ?? GETPCAPS_SHORT.exec(line);
    if (m) pcaps.push({ pid: Number(m[1]), text: m[2].trim() });
  }
  if (pcaps.length > 0) {
    const first = pcaps[0];
    if (pcaps.length > 1) {
      notes.push(`${pcaps.length} processes were listed. Only the first, pid ${first.pid}, is decoded.`);
    }
    const parsed = parseCapText(first.text);
    if (!parsed.ok) return { kind: "error", message: `Process ${first.pid}: ${parsed.message}` };
    const sets = parsed.plain ? [{ key: "mask" as SetKey, mask: parsed.mask }] : fromFlagSets(parsed.sets);
    return { kind: "ok", format: "getpcaps", sets: orderSets(sets), process: { pid: first.pid }, notes };
  }

  // 4. One bare hex mask.
  const trimmed = text.trim();
  if (/^\S+$/.test(trimmed) && /^(0x)?[0-9a-f]+$/i.test(trimmed)) {
    const parsed = parseHexMask(trimmed);
    if (!parsed.ok) return { kind: "error", message: parsed.message };
    return { kind: "ok", format: "hex", sets: [{ key: "mask", mask: parsed.mask }], process: {}, notes };
  }
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l !== "");
  if (nonEmpty.length > 1 && nonEmpty.every((l) => /^(0x)?[0-9a-f]+$/i.test(l))) {
    return {
      kind: "error",
      message:
        "Several bare masks cannot be told apart. Paste the labeled lines (CapEff: 00000000a80425fb) so each value keeps its set name, or decode one mask at a time.",
    };
  }

  // 5. Names, or libcap text.
  const parsed = parseCapText(text);
  if (!parsed.ok) {
    return {
      kind: "error",
      message: `${parsed.message} Paste CapEff style lines from /proc/<pid>/status, a hex mask, capsh or getpcaps output, or capability names.`,
    };
  }
  if (parsed.plain) {
    return { kind: "ok", format: "names", sets: [{ key: "mask", mask: parsed.mask }], process: {}, notes };
  }
  return { kind: "ok", format: "text", sets: orderSets(fromFlagSets(parsed.sets)), process: {}, notes };
}

/* ------------------------------------------------------------- analysis */

export interface SetAnalysis {
  mask: bigint;
  count: number;
  known: Capability[];
  /** Bits above the last capability this table names. */
  unknownBits: number[];
  rootYes: Capability[];
  rootContext: Capability[];
  highest: Risk | null;
  empty: boolean;
  allKnown: boolean;
  /** Set when the mask equals the full set of an identifiable kernel generation. */
  fullSetNote: string | null;
  verdict: string;
  level: Risk | "none";
}

function listNames(caps: Capability[]): string {
  const names = caps.map((c) => c.name);
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The mask of every capability defined at three points in kernel history. */
export function fullSetNote(mask: bigint): string | null {
  const value = mask & MASK64;
  if (value === (1n << 38n) - 1n) {
    return "This is every capability defined before Linux 5.8, up to CAP_AUDIT_READ. A kernel from 5.8 on adds CAP_PERFMON and CAP_BPF to a full set.";
  }
  if (value === (1n << 40n) - 1n) {
    return "This is every capability defined in Linux 5.8, up to CAP_BPF. A kernel from 5.9 on adds CAP_CHECKPOINT_RESTORE to a full set.";
  }
  if (value === ALL_KNOWN_MASK) {
    return "This is all 41 capabilities in the table, up to CAP_CHECKPOINT_RESTORE, a full set on Linux 5.9 and later.";
  }
  return null;
}

export function analyzeMask(maskIn: bigint): SetAnalysis {
  const mask = maskIn & MASK64;
  const bits = maskToBits(mask);
  const known = bits.filter((b) => b < KNOWN_COUNT).map((b) => CAPABILITIES[b]);
  const unknownBits = bits.filter((b) => b >= KNOWN_COUNT);
  const rootYes = known.filter((c) => c.rootLike === "yes");
  const rootContext = known.filter((c) => c.rootLike === "context");
  let highest: Risk | null = null;
  for (const cap of known) {
    if (highest === null || RISK_ORDER[cap.risk] > RISK_ORDER[highest]) highest = cap.risk;
  }
  const empty = mask === 0n;
  const allKnown = (mask & ALL_KNOWN_MASK) === ALL_KNOWN_MASK;

  let verdict: string;
  let level: Risk | "none";
  if (empty) {
    verdict = "No capabilities. Every privileged operation is refused.";
    level = "none";
  } else if (allKnown) {
    verdict =
      "Every capability in the table. This is what root holds on a host, and what a privileged container is given.";
    level = "critical";
  } else if (rootYes.length > 0) {
    verdict = `${rootYes.length} ${rootYes.length === 1 ? "capability is" : "capabilities are"} effectively root: ${listNames(rootYes)}.`;
    level = "critical";
  } else if (rootContext.length > 0) {
    verdict = `${listNames(rootContext)} is root-like when the process shares the host's network namespace. Nothing here is root on its own.`;
    level = highest ?? "high";
  } else if (known.length === 0) {
    verdict = "Only bits above CAP_CHECKPOINT_RESTORE are set, which this table does not name.";
    level = "none";
  } else {
    const top = known.filter((c) => c.risk === highest);
    verdict = `Nothing here is root on its own. Highest rating is ${RISK_LABEL[highest as Risk]}: ${listNames(top)}.`;
    level = highest as Risk;
  }

  return {
    mask,
    count: bits.length,
    known,
    unknownBits,
    rootYes,
    rootContext,
    highest,
    empty,
    allKnown,
    fullSetNote: fullSetNote(mask),
    verdict,
    level,
  };
}

/* --------------------------------------------------- docker comparison */

export interface DockerComparison {
  identical: boolean;
  shared: Capability[];
  /** In the set but not in Docker's default. */
  extra: Capability[];
  extraUnknown: number[];
  /** In Docker's default but absent from the set. */
  missing: Capability[];
  summary: string;
}

export function compareToDocker(maskIn: bigint): DockerComparison {
  const mask = maskIn & MASK64;
  const bits = maskToBits(mask);
  const defaults = new Set(maskToBits(DOCKER_DEFAULT_MASK));
  const shared = bits.filter((b) => defaults.has(b)).map((b) => CAPABILITIES[b]);
  const extra = bits.filter((b) => b < KNOWN_COUNT && !defaults.has(b)).map((b) => CAPABILITIES[b]);
  const extraUnknown = bits.filter((b) => b >= KNOWN_COUNT);
  const missing = [...defaults].filter((b) => !((mask >> BigInt(b)) & 1n)).map((b) => CAPABILITIES[b]);
  const identical = mask === DOCKER_DEFAULT_MASK;

  let summary: string;
  if (identical) {
    summary = "Identical to Docker's default set.";
  } else if (mask === 0n) {
    summary = "Empty. All 14 of Docker's default capabilities are dropped.";
  } else if (extra.length === 0 && extraUnknown.length === 0) {
    summary = `A subset of Docker's default: ${missing.length} of its 14 capabilities ${missing.length === 1 ? "is" : "are"} dropped.`;
  } else if (missing.length === 0) {
    const total = extra.length + extraUnknown.length;
    summary = `Docker's default plus ${total} more ${total === 1 ? "capability" : "capabilities"}.`;
  } else {
    summary = `Differs from Docker's default: ${extra.length + extraUnknown.length} added, ${missing.length} dropped.`;
  }
  return { identical, shared, extra, extraUnknown, missing, summary };
}

/* ------------------------------------------------------------- encoding */

export interface Encoded {
  count: number;
  hex16: string;
  hexShort: string;
  decimal: string;
  names: string;
  capshDecode: string;
  dockerFlags: string;
}

/** The forms a selected set takes, for pasting into a config, a test or a command line. */
export function encodeMask(maskIn: bigint): Encoded {
  const mask = maskIn & ALL_KNOWN_MASK;
  const bits = maskToBits(mask);
  const caps = bits.map((b) => CAPABILITIES[b]);
  let dockerFlags: string;
  if (mask === 0n) dockerFlags = "--cap-drop=ALL";
  else if (mask === DOCKER_DEFAULT_MASK) dockerFlags = "(no flags needed: this is Docker's default set)";
  else if (mask === ALL_KNOWN_MASK) dockerFlags = "--cap-add=ALL";
  else dockerFlags = ["--cap-drop=ALL", ...caps.map((c) => `--cap-add=${c.name.slice(4)}`)].join(" ");
  return {
    count: bits.length,
    hex16: hex16(mask),
    hexShort: `0x${mask.toString(16)}`,
    decimal: mask.toString(10),
    names: caps.map((c) => c.name.toLowerCase()).join(","),
    capshDecode: `capsh --decode=${hex16(mask)}`,
    dockerFlags,
  };
}

/* ------------------------------------------------------- consistency */

/**
 * The kernel keeps a few relations between the sets. Lines that break them
 * came from different processes, were edited, or were copied wrongly.
 */
export function consistencyWarnings(sets: DecodedSet[]): string[] {
  const get = (key: SetKey): bigint | undefined => sets.find((s) => s.key === key)?.mask;
  const eff = get("effective");
  const prm = get("permitted");
  const inh = get("inheritable");
  const amb = get("ambient");
  const out: string[] = [];

  if (eff !== undefined && prm !== undefined && (eff & ~prm) !== 0n) {
    const names = maskToBits(eff & ~prm).map((b) => CAPABILITIES[b]?.name ?? `bit ${b}`);
    out.push(
      `Effective holds ${names.join(", ")}, which Permitted does not. The kernel never allows that, so these values probably come from different processes or were edited.`,
    );
  }
  if (amb !== undefined && ((prm !== undefined && (amb & ~prm) !== 0n) || (inh !== undefined && (amb & ~inh) !== 0n))) {
    out.push(
      "Ambient holds a capability that is missing from Permitted or Inheritable. The kernel keeps Ambient a subset of both, so these values probably come from different processes or were edited.",
    );
  }
  return out;
}

export function describeSeccomp(mode: 0 | 1 | 2): string {
  if (mode === 0) return "off";
  if (mode === 1) return "strict mode";
  return "filter mode";
}
