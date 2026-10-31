/**
 * systemd service unit builder.
 *
 * Pure logic: options in, unit file text, install commands and a list of
 * findings out. Nothing here touches React or the DOM, so it unit tests
 * cleanly. The directive names and values follow systemd.unit(5),
 * systemd.service(5), systemd.exec(5), systemd.kill(5) and systemd.time(7).
 *
 * One rule runs through the whole file: anything that fails validation is
 * left out of the unit text and reported, so the output never contains a line
 * the tool already knows is wrong.
 */

export type Level = "error" | "warn" | "info";

export interface Finding {
  level: Level;
  /** The option key the finding belongs to, or null when it spans several. */
  field: string | null;
  message: string;
}

/** Longest list the builder reads, and longest single line. Both are reported when hit. */
export const MAX_LINES = 50;
export const MAX_LINE_LENGTH = 4000;

export type ServiceType = "simple" | "exec" | "forking" | "oneshot" | "notify";
export type RestartPolicy =
  | "no"
  | "on-success"
  | "on-failure"
  | "on-abnormal"
  | "on-abort"
  | "on-watchdog"
  | "always";
export type ProtectSystemMode = "" | "yes" | "full" | "strict";
export type ProtectHomeMode = "" | "yes" | "read-only" | "tmpfs";
/** unset: no line. none: an empty set. allow: only these. deny: all but these. */
export type CapabilityMode = "unset" | "none" | "allow" | "deny";
export type SyscallMode = "off" | "system-service" | "system-service-strict";

export interface HardeningOptions {
  noNewPrivileges: boolean;
  protectSystem: ProtectSystemMode;
  protectHome: ProtectHomeMode;
  privateTmp: boolean;
  privateDevices: boolean;
  protectKernelTunables: boolean;
  protectKernelModules: boolean;
  protectControlGroups: boolean;
  restrictAddressFamilies: string;
  capabilityMode: CapabilityMode;
  capabilityBoundingSet: string;
  ambientCapabilities: string;
  readWritePaths: string;
  systemCallFilter: SyscallMode;
  systemCallArchitectures: boolean;
  lockPersonality: boolean;
  restrictRealtime: boolean;
  restrictSuidSgid: boolean;
  restrictNamespaces: boolean;
  protectHostname: boolean;
  memoryDenyWriteExecute: boolean;
}

export interface UnitOptions {
  name: string;
  description: string;
  after: string;
  wants: string;
  type: ServiceType;
  execStart: string;
  execStartPre: string;
  execReload: string;
  pidFile: string;
  remainAfterExit: boolean;
  user: string;
  group: string;
  workingDirectory: string;
  environment: string;
  environmentFile: string;
  restart: RestartPolicy;
  restartSec: string;
  startLimitIntervalSec: string;
  startLimitBurst: string;
  wantedBy: string;
  hardening: HardeningOptions;
}

export interface UnitBuild {
  /** The unit file name, such as myapp.service. Empty when the name is invalid. */
  fileName: string;
  unit: string;
  /** The install and verify commands, without the unit text. */
  commands: string;
  /** The unit text as a heredoc followed by the commands, for one paste. */
  script: string;
  findings: Finding[];
  errors: number;
  warnings: number;
  notes: number;
  /** How many sandboxing directives made it into the unit. */
  hardeningCount: number;
}

/* ------------------------------------------------------------ option data */

export const SERVICE_TYPES: { value: ServiceType; label: string; detail: string }[] = [
  {
    value: "simple",
    label: "simple",
    detail:
      "The unit counts as started as soon as the process is forked. Use it for a program that stays in the foreground. systemd cannot tell when it is actually ready.",
  },
  {
    value: "exec",
    label: "exec",
    detail:
      "Like simple, but the unit counts as started only after the binary has been executed, so a missing file or a bad User= fails the start instead of passing silently.",
  },
  {
    value: "forking",
    label: "forking",
    detail:
      "For a classic daemon that forks and lets the parent exit. The unit counts as started when the parent exits. Set PIDFile= so systemd knows which process is the main one.",
  },
  {
    value: "oneshot",
    label: "oneshot",
    detail:
      "For a command that runs and exits. Units ordered after it wait until it finishes. Several ExecStart= lines run in sequence. Pair it with RemainAfterExit= for setup work.",
  },
  {
    value: "notify",
    label: "notify",
    detail:
      "The program reports readiness itself by sending READY=1 through sd_notify(3). The unit stays activating until it does, or until the start timeout expires.",
  },
];

export const RESTART_POLICIES: { value: RestartPolicy; detail: string }[] = [
  { value: "no", detail: "Never restart. This is the default." },
  { value: "on-failure", detail: "Restart after a non-zero exit, a signal, a timeout or a watchdog failure. A clean exit stays stopped." },
  { value: "always", detail: "Restart whatever the reason, including a clean exit. An explicit systemctl stop still stops it." },
  { value: "on-success", detail: "Restart only after a clean exit." },
  { value: "on-abnormal", detail: "Restart after a signal, a timeout or a watchdog failure, but not after a non-zero exit code." },
  { value: "on-abort", detail: "Restart only after an uncaught signal." },
  { value: "on-watchdog", detail: "Restart only when the watchdog timeout expires." },
];

export interface HardeningInfo {
  /** Key in HardeningOptions. */
  key: keyof HardeningOptions;
  directive: string;
  summary: string;
  breaks: string;
}

/** Plain explanations shown beside each switch. Wording follows systemd.exec(5). */
export const HARDENING_INFO: HardeningInfo[] = [
  {
    key: "noNewPrivileges",
    directive: "NoNewPrivileges=yes",
    summary:
      "The service and everything it starts can never gain privileges through execve(), so a setuid binary or a file with capabilities cannot raise them.",
    breaks: "Anything that depends on a setuid helper such as sudo or su, or on file capabilities set with setcap.",
  },
  {
    key: "protectSystem",
    directive: "ProtectSystem=",
    summary:
      "Mounts parts of the file system read-only for this service. yes covers /usr and the boot loader directories, full adds /etc, and strict makes everything read-only except /dev, /proc and /sys.",
    breaks:
      "With strict, every path the service writes must be listed in ReadWritePaths= or come from StateDirectory=, CacheDirectory=, LogsDirectory= or RuntimeDirectory=. Other writes fail with Read-only file system.",
  },
  {
    key: "protectHome",
    directive: "ProtectHome=",
    summary:
      "yes makes /home, /root and /run/user empty and inaccessible. read-only leaves them visible but unwritable. tmpfs puts empty temporary file systems over them.",
    breaks: "A program, working directory or config file under /home stops working with yes or tmpfs.",
  },
  {
    key: "privateTmp",
    directive: "PrivateTmp=yes",
    summary: "Gives the service its own /tmp and /var/tmp that no other process can see. They are deleted when the service stops.",
    breaks: "Two services that pass files or sockets to each other through /tmp no longer see the same files.",
  },
  {
    key: "privateDevices",
    directive: "PrivateDevices=yes",
    summary:
      "Replaces /dev with a minimal one holding only pseudo devices such as /dev/null, /dev/zero and /dev/urandom. Physical devices, /dev/mem and /dev/port are absent, and CAP_MKNOD and CAP_SYS_RAWIO are dropped.",
    breaks: "Anything that opens a real device node: a serial port, a USB device, a GPU or a disk.",
  },
  {
    key: "protectKernelTunables",
    directive: "ProtectKernelTunables=yes",
    summary: "Makes /proc/sys, /sys and the other kernel tunable interfaces read-only, so the service cannot change sysctl values or hardware settings.",
    breaks: "Tuning daemons and any tool that writes sysctl values or files under /sys.",
  },
  {
    key: "protectKernelModules",
    directive: "ProtectKernelModules=yes",
    summary: "Denies loading and unloading kernel modules from inside the service, and hides /usr/lib/modules.",
    breaks: "Programs that run modprobe themselves, such as some firewall and VPN helpers.",
  },
  {
    key: "protectControlGroups",
    directive: "ProtectControlGroups=yes",
    summary: "Makes the cgroup hierarchy under /sys/fs/cgroup read-only for the service.",
    breaks: "Anything that manages cgroups itself, including container runtimes.",
  },
  {
    key: "restrictAddressFamilies",
    directive: "RestrictAddressFamilies=",
    summary:
      "Lets the service create sockets only in the listed families, for example AF_UNIX AF_INET AF_INET6. A leading ~ turns the list into a deny list.",
    breaks:
      "Leaving out AF_UNIX breaks local IPC such as syslog. Programs that list network interfaces need AF_NETLINK. Packet capture needs AF_PACKET.",
  },
  {
    key: "capabilityBoundingSet",
    directive: "CapabilityBoundingSet=",
    summary:
      "Sets the most capabilities the process can ever hold. The usual choice is an allow list of the few it needs, or an empty value, which drops every capability. A leading ~ removes only the listed ones.",
    breaks: "A capability the program needs but you left out makes the call fail with EPERM. Binding a port below 1024 as a non-root user needs CAP_NET_BIND_SERVICE.",
  },
  {
    key: "ambientCapabilities",
    directive: "AmbientCapabilities=",
    summary:
      "Gives a non-root service the listed capabilities even though it is not root. The usual use is CAP_NET_BIND_SERVICE, so a service can listen on port 80 or 443.",
    breaks: "A capability must also be inside CapabilityBoundingSet= when one is set. For a root service the line adds nothing, since root already holds whatever the bounding set allows.",
  },
  {
    key: "readWritePaths",
    directive: "ReadWritePaths=",
    summary: "Paths that stay writable after ProtectSystem= or ProtectHome= made them read-only. A leading - ignores a path that does not exist.",
    breaks: "A listed path that does not exist, without the leading -, makes the unit fail at start with status 226/NAMESPACE.",
  },
  {
    key: "systemCallFilter",
    directive: "SystemCallFilter=",
    summary:
      "Allows only the system calls in the @system-service group, which covers what ordinary daemons use. A call outside the set kills the process with SIGSYS by default. The stricter choice also subtracts @privileged and @resources.",
    breaks:
      "A program that needs an unusual call, such as mount, a debugger call or an unusual scheduler call, is killed. The status shows the process was killed by SYS. Subtracting @privileged breaks a program that changes user itself, so use that choice with User= set.",
  },
  {
    key: "systemCallArchitectures",
    directive: "SystemCallArchitectures=native",
    summary:
      "Allows system calls of the native architecture only. Without it, a filter written for x86-64 can be sidestepped through the 32-bit i386 or x32 system call tables.",
    breaks: "Programs that deliberately run 32-bit code on a 64-bit kernel.",
  },
  {
    key: "lockPersonality",
    directive: "LockPersonality=yes",
    summary: "Locks the personality(2) system call, so the process cannot switch its kernel execution domain.",
    breaks: "Very little. Some emulation layers use personality to mimic another system.",
  },
  {
    key: "restrictRealtime",
    directive: "RestrictRealtime=yes",
    summary: "Refuses any attempt to enable realtime scheduling for the unit's processes.",
    breaks: "Audio and other latency-sensitive services that request realtime priority.",
  },
  {
    key: "restrictSuidSgid",
    directive: "RestrictSUIDSGID=yes",
    summary: "Refuses attempts to set the setuid or setgid bit on files or directories.",
    breaks: "Installers and tools that create setuid files.",
  },
  {
    key: "restrictNamespaces",
    directive: "RestrictNamespaces=yes",
    summary: "Prohibits creating any kind of Linux namespace from inside the service.",
    breaks: "Services that sandbox themselves or run containers, which includes browsers and container runtimes.",
  },
  {
    key: "protectHostname",
    directive: "ProtectHostname=yes",
    summary: "Gives the service its own UTS namespace and prevents it from changing the hostname or domain name.",
    breaks: "Services whose job is to set the hostname.",
  },
  {
    key: "memoryDenyWriteExecute",
    directive: "MemoryDenyWriteExecute=yes",
    summary:
      "Refuses memory mappings that are writable and executable at once, and refuses changing a mapping to executable after the fact. It stops a common way for injected code to run.",
    breaks: "Anything with a JIT compiler: Node.js, the JVM, .NET, LuaJIT and similar runtimes fail to start or crash.",
  },
];

/** The 41 capabilities listed in capabilities(7). */
export const CAPABILITIES: readonly string[] = [
  "CAP_AUDIT_CONTROL",
  "CAP_AUDIT_READ",
  "CAP_AUDIT_WRITE",
  "CAP_BLOCK_SUSPEND",
  "CAP_BPF",
  "CAP_CHECKPOINT_RESTORE",
  "CAP_CHOWN",
  "CAP_DAC_OVERRIDE",
  "CAP_DAC_READ_SEARCH",
  "CAP_FOWNER",
  "CAP_FSETID",
  "CAP_IPC_LOCK",
  "CAP_IPC_OWNER",
  "CAP_KILL",
  "CAP_LEASE",
  "CAP_LINUX_IMMUTABLE",
  "CAP_MAC_ADMIN",
  "CAP_MAC_OVERRIDE",
  "CAP_MKNOD",
  "CAP_NET_ADMIN",
  "CAP_NET_BIND_SERVICE",
  "CAP_NET_BROADCAST",
  "CAP_NET_RAW",
  "CAP_PERFMON",
  "CAP_SETFCAP",
  "CAP_SETGID",
  "CAP_SETPCAP",
  "CAP_SETUID",
  "CAP_SYSLOG",
  "CAP_SYS_ADMIN",
  "CAP_SYS_BOOT",
  "CAP_SYS_CHROOT",
  "CAP_SYS_MODULE",
  "CAP_SYS_NICE",
  "CAP_SYS_PACCT",
  "CAP_SYS_PTRACE",
  "CAP_SYS_RAWIO",
  "CAP_SYS_RESOURCE",
  "CAP_SYS_TIME",
  "CAP_SYS_TTY_CONFIG",
  "CAP_WAKE_ALARM",
];

const CAPABILITY_SET = new Set(CAPABILITIES);

/** Address family names from the kernel's socket.h, in the spelling systemd uses. */
export const ADDRESS_FAMILIES: readonly string[] = [
  "AF_UNIX",
  "AF_LOCAL",
  "AF_INET",
  "AF_INET6",
  "AF_NETLINK",
  "AF_PACKET",
  "AF_AX25",
  "AF_IPX",
  "AF_APPLETALK",
  "AF_NETROM",
  "AF_BRIDGE",
  "AF_ATMPVC",
  "AF_X25",
  "AF_ROSE",
  "AF_DECnet",
  "AF_NETBEUI",
  "AF_SECURITY",
  "AF_KEY",
  "AF_ASH",
  "AF_ECONET",
  "AF_ATMSVC",
  "AF_RDS",
  "AF_SNA",
  "AF_IRDA",
  "AF_PPPOX",
  "AF_WANPIPE",
  "AF_LLC",
  "AF_IB",
  "AF_MPLS",
  "AF_CAN",
  "AF_TIPC",
  "AF_BLUETOOTH",
  "AF_IUCV",
  "AF_RXRPC",
  "AF_ISDN",
  "AF_PHONET",
  "AF_IEEE802154",
  "AF_CAIF",
  "AF_ALG",
  "AF_NFC",
  "AF_VSOCK",
  "AF_KCM",
  "AF_QIPCRTR",
  "AF_SMC",
  "AF_XDP",
  "AF_MCTP",
];

const FAMILY_BY_LOWER = new Map(ADDRESS_FAMILIES.map((f) => [f.toLowerCase(), f]));

/* ------------------------------------------------------------- defaults */

export function noHardening(): HardeningOptions {
  return {
    noNewPrivileges: false,
    protectSystem: "",
    protectHome: "",
    privateTmp: false,
    privateDevices: false,
    protectKernelTunables: false,
    protectKernelModules: false,
    protectControlGroups: false,
    restrictAddressFamilies: "",
    capabilityMode: "unset",
    capabilityBoundingSet: "",
    ambientCapabilities: "",
    readWritePaths: "",
    systemCallFilter: "off",
    systemCallArchitectures: false,
    lockPersonality: false,
    restrictRealtime: false,
    restrictSuidSgid: false,
    restrictNamespaces: false,
    protectHostname: false,
    memoryDenyWriteExecute: false,
  };
}

/** The baseline most network daemons can run under. Memory W^X is left off because JIT runtimes break. */
export function standardHardening(): HardeningOptions {
  return {
    ...noHardening(),
    noNewPrivileges: true,
    protectSystem: "strict",
    protectHome: "yes",
    privateTmp: true,
    privateDevices: true,
    protectKernelTunables: true,
    protectKernelModules: true,
    protectControlGroups: true,
    restrictAddressFamilies: "AF_UNIX AF_INET AF_INET6",
    capabilityMode: "none",
    systemCallFilter: "system-service",
    systemCallArchitectures: true,
    lockPersonality: true,
    restrictRealtime: true,
    restrictSuidSgid: true,
    restrictNamespaces: true,
    protectHostname: true,
  };
}

export function defaultOptions(): UnitOptions {
  return {
    name: "myapp",
    description: "My application server",
    after: "network-online.target",
    wants: "network-online.target",
    type: "simple",
    execStart: "/usr/local/bin/myapp --config /etc/myapp/config.toml",
    execStartPre: "",
    execReload: "/bin/kill -HUP $MAINPID",
    pidFile: "",
    remainAfterExit: false,
    user: "myapp",
    group: "myapp",
    workingDirectory: "/var/lib/myapp",
    environment: "NODE_ENV=production",
    environmentFile: "-/etc/default/myapp",
    restart: "on-failure",
    restartSec: "5s",
    startLimitIntervalSec: "60s",
    startLimitBurst: "5",
    wantedBy: "multi-user.target",
    hardening: { ...standardHardening(), readWritePaths: "/var/lib/myapp" },
  };
}

export interface UnitExample {
  id: string;
  label: string;
  options: () => UnitOptions;
}

export const EXAMPLES: UnitExample[] = [
  {
    id: "web",
    label: "Web app on port 80",
    options: () => ({
      ...defaultOptions(),
      name: "webapp",
      description: "Web application on port 80",
      execStart: "/opt/webapp/bin/webapp --listen :80",
      execReload: "",
      user: "webapp",
      group: "webapp",
      workingDirectory: "/opt/webapp",
      environment: "",
      environmentFile: "-/etc/default/webapp",
      hardening: {
        ...standardHardening(),
        capabilityMode: "allow",
        capabilityBoundingSet: "CAP_NET_BIND_SERVICE",
        ambientCapabilities: "CAP_NET_BIND_SERVICE",
        readWritePaths: "",
      },
    }),
  },
  {
    id: "nightly",
    label: "Nightly job",
    options: () => ({
      ...defaultOptions(),
      name: "nightly-backup",
      description: "Nightly backup job",
      after: "network-online.target",
      wants: "network-online.target",
      type: "oneshot",
      execStart: "/usr/local/bin/backup.sh",
      execReload: "",
      user: "backup",
      group: "backup",
      workingDirectory: "/var/backups",
      environment: "",
      environmentFile: "",
      restart: "no",
      restartSec: "",
      startLimitIntervalSec: "",
      startLimitBurst: "",
      wantedBy: "",
      hardening: {
        ...standardHardening(),
        restrictNamespaces: true,
        readWritePaths: "/var/backups",
      },
    }),
  },
  {
    id: "daemon",
    label: "Classic daemon",
    options: () => ({
      ...defaultOptions(),
      name: "legacyd",
      description: "Legacy forking daemon",
      type: "forking",
      execStart: "/usr/sbin/legacyd --daemon --pidfile /run/legacyd.pid",
      execReload: "/bin/kill -HUP $MAINPID",
      pidFile: "/run/legacyd.pid",
      user: "",
      group: "",
      workingDirectory: "",
      environment: "",
      environmentFile: "",
      restart: "on-failure",
      hardening: {
        ...noHardening(),
        noNewPrivileges: true,
        protectSystem: "full",
        privateTmp: true,
        protectKernelTunables: true,
        protectKernelModules: true,
        protectControlGroups: true,
      },
    }),
  },
  {
    id: "notify",
    label: "Notify service",
    options: () => ({
      ...defaultOptions(),
      name: "ingest",
      description: "Ingest worker that signals readiness",
      type: "notify",
      execStart: "/usr/local/bin/ingest --workers 4",
      execReload: "",
      user: "ingest",
      group: "ingest",
      workingDirectory: "/var/lib/ingest",
      environment: "RUST_LOG=info",
      environmentFile: "",
      hardening: { ...standardHardening(), readWritePaths: "/var/lib/ingest" },
    }),
  },
];

/* ---------------------------------------------------------------- helpers */

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const UNIT_NAME_CHARS = /^[A-Za-z0-9:_.\\-]+$/;
const UNIT_REF_CHARS = /^[A-Za-z0-9:_.\\@-]+$/;
const UNIT_SUFFIXES = [
  "service",
  "socket",
  "device",
  "mount",
  "automount",
  "swap",
  "target",
  "path",
  "timer",
  "slice",
  "scope",
];

type Add = (level: Level, field: string | null, message: string) => void;

/** Collapses a single-line field. Newlines cannot arrive from an input, but a script can set one. */
function oneLine(raw: string): string {
  return raw.replace(/[\r\n]+/g, " ").trim();
}

function words(raw: string): string[] {
  return oneLine(raw).split(/\s+/).filter(Boolean);
}

/** Every `%` in a unit file starts a specifier, so a literal percent sign is written %%. */
function escapePercent(text: string): string {
  return text.replace(/%/g, "%%");
}

function hasControl(text: string): boolean {
  return CONTROL.test(text);
}

/**
 * Splits a multi-line field into trimmed lines. Blank lines and comment lines
 * are dropped. Enforces the line count and length caps, naming the field.
 */
function readLines(raw: string, field: string, label: string, add: Add): string[] {
  const out: string[] = [];
  const physical = raw.split(/\r\n|\r|\n/);
  let capped = false;
  for (const piece of physical) {
    const line = piece.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    if (out.length >= MAX_LINES) {
      capped = true;
      break;
    }
    if (line.length > MAX_LINE_LENGTH) {
      add("error", field, `A line in ${label} is ${line.length} characters long. The limit is ${MAX_LINE_LENGTH}, so it was skipped.`);
      continue;
    }
    if (hasControl(line)) {
      add("error", field, `A line in ${label} contains a control character, so it was skipped.`);
      continue;
    }
    out.push(line);
  }
  if (capped) add("error", field, `${label} has more than ${MAX_LINES} lines. Only the first ${MAX_LINES} are read.`);
  return out;
}

/** Applies systemd's rule that a trailing backslash joins a line to the next one. */
function joinContinuations(lines: string[]): string[] {
  const out: string[] = [];
  let acc: string | null = null;
  for (const line of lines) {
    const trailing = /\\+$/.exec(line);
    const continued = trailing !== null && trailing[0].length % 2 === 1;
    const body = continued ? line.slice(0, -1).trim() : line;
    acc = acc === null ? body : `${acc} ${body}`.trim();
    if (!continued) {
      out.push(acc);
      acc = null;
    }
  }
  if (acc !== null && acc !== "") out.push(acc);
  return out;
}

/** Strips systemd.service(5) command prefixes: @ - : + ! and !!. */
export function splitExecPrefix(command: string): { prefix: string; rest: string } {
  const m = /^[@\-:+!]+/.exec(command);
  const prefix = m ? m[0] : "";
  return { prefix, rest: command.slice(prefix.length).trimStart() };
}

function firstWord(rest: string): string {
  const quote = rest[0];
  if (quote === '"' || quote === "'") {
    const end = rest.indexOf(quote, 1);
    return end === -1 ? rest.slice(1) : rest.slice(1, end);
  }
  const m = /^\S+/.exec(rest);
  return m ? m[0] : "";
}

/** The command with quoted spans removed, so an operator inside quotes is not mistaken for one. */
function unquoted(text: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\" && quote === '"') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else out += ch;
  }
  return out;
}

const SHELL_OPERATOR = /\|\||&&|[|<>`]|\$\(/;

/** True when a quote opened in the text is never closed. A backslash escapes the next character. */
function hasUnbalancedQuote(text: string): boolean {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") i += 1;
    else if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
  }
  return quote !== null;
}

/** Checks one command line. Returns false when the line is unusable and must be left out. */
function checkCommand(command: string, field: string, directive: string, add: Add): boolean {
  const { rest } = splitExecPrefix(command);
  if (rest === "") {
    add("error", field, `${directive}= has only a prefix and no command.`);
    return false;
  }
  if (hasUnbalancedQuote(rest)) {
    add("error", field, `A quote in the ${directive}= command is never closed, and systemd ignores a line like that. Close it or escape it with a backslash.`);
    return false;
  }
  let usable = true;
  const word = firstWord(rest);
  if (!word.startsWith("/")) {
    if (word.includes("/")) {
      usable = false;
      add(
        "error",
        field,
        `${directive}= needs an absolute path, and "${word}" is not one. Unit files do not expand ~ and do not search the current directory.`,
      );
    } else {
      add(
        "warn",
        field,
        `"${word}" has no directory. systemd looks it up in a fixed built-in search path, so give the full path to be certain which binary runs.`,
      );
    }
  }
  const op = SHELL_OPERATOR.exec(unquoted(rest));
  if (op) {
    add(
      "warn",
      field,
      `${directive}= contains "${op[0]}", but systemd does not run a shell, so it is passed to the program as plain text. For pipes, redirects or && start a shell explicitly: /bin/sh -c '...'.`,
    );
  }
  const stripped = rest.replace(/%%/g, "");
  if (stripped.includes("%")) {
    const found = Array.from(new Set(Array.from(stripped.matchAll(/%(.?)/g), (m) => `%${m[1]}`))).slice(0, 4);
    add(
      "warn",
      field,
      `${directive}= contains ${found.join(", ")}. systemd reads % as the start of a specifier such as %n or %H, and refuses a command with a specifier it does not know. Write %% for a literal percent sign, as in date +%%F.`,
    );
  }
  const vars = Array.from(rest.matchAll(/\$(?!\$)(\{?)([A-Za-z_][A-Za-z0-9_]*)\}?/g)).filter(
    (m) => m[2] !== "MAINPID",
  );
  if (vars.length > 0) {
    add(
      "info",
      field,
      `${directive}= refers to $${vars[0][2]}. systemd substitutes variables from Environment= and EnvironmentFile=, not from a shell, and $NAME works only as a whole word. Use \${NAME} inside a longer word and $$ for a literal dollar sign.`,
    );
  }
  return usable;
}

/** One systemd.time(7) time span in seconds, or null. Accepts "5", "5s", "1min 30s", "250ms". */
export function parseTimespan(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  const unitSeconds: Record<string, number> = {
    us: 1e-6,
    usec: 1e-6,
    "μs": 1e-6,
    ms: 1e-3,
    msec: 1e-3,
    s: 1,
    sec: 1,
    second: 1,
    seconds: 1,
    m: 60,
    min: 60,
    minute: 60,
    minutes: 60,
    h: 3600,
    hr: 3600,
    hour: 3600,
    hours: 3600,
    d: 86400,
    day: 86400,
    days: 86400,
    w: 604800,
    week: 604800,
    weeks: 604800,
    M: 2629800,
    month: 2629800,
    months: 2629800,
    y: 31557600,
    year: 31557600,
    years: 31557600,
  };
  let total = 0;
  let pos = 0;
  const token = /\s*(\d+(?:\.\d+)?)\s*([A-Za-zμ]*)\s*/y;
  while (pos < text.length) {
    token.lastIndex = pos;
    const m = token.exec(text);
    if (!m || m[0].length === 0) return null;
    const unit = m[2] === "" ? "s" : m[2];
    const factor = unitSeconds[unit];
    if (factor === undefined) return null;
    total += Number(m[1]) * factor;
    pos = token.lastIndex;
  }
  return Number.isFinite(total) ? total : null;
}

/** A unit name without its suffix, validated per systemd.unit(5). */
export function normalizeUnitName(raw: string): { name: string; error: string | null } {
  let name = oneLine(raw);
  if (name.endsWith(".service")) name = name.slice(0, -".service".length);
  if (name === "") return { name, error: "Give the service a name, for example myapp." };
  if (name.length + ".service".length > 255) {
    return { name, error: "A unit file name is at most 255 characters including .service." };
  }
  if (name.includes("@")) {
    return {
      name,
      error: "A name with @ is a template, which needs an instance to start. This builder writes a plain service.",
    };
  }
  if (name.includes("/")) return { name, error: "A unit name cannot contain a slash." };
  if (!UNIT_NAME_CHARS.test(name)) {
    const bad = Array.from(name).find((c) => !/[A-Za-z0-9:_.\\-]/.test(c));
    return {
      name,
      error: `A unit name may use letters, digits and : _ . - only, and "${bad ?? ""}" is not allowed.`,
    };
  }
  return { name, error: null };
}

/** Validates a space separated list of unit names. Returns the accepted ones. */
function readUnitRefs(raw: string, field: string, label: string, add: Add): string[] {
  const text = oneLine(raw);
  if (text === "") return [];
  if (hasControl(text)) {
    add("error", field, `${label} contains a control character.`);
    return [];
  }
  if (text.includes(",")) {
    add("error", field, `${label} is separated by spaces, not commas.`);
    return [];
  }
  const out: string[] = [];
  for (const token of text.split(/\s+/)) {
    if (token.length > 255) add("error", field, `A unit name in ${label} is longer than 255 characters.`);
    else if (!UNIT_REF_CHARS.test(token)) add("error", field, `"${token}" in ${label} is not a valid unit name.`);
    else out.push(token);
  }
  return out;
}

function hasSuffix(token: string): boolean {
  const dot = token.lastIndexOf(".");
  return dot > 0 && UNIT_SUFFIXES.includes(token.slice(dot + 1));
}

function readCapabilities(raw: string, field: string, add: Add): string[] {
  const out: string[] = [];
  for (const token of words(raw)) {
    const name = token.toUpperCase();
    if (CAPABILITY_SET.has(name)) {
      if (!out.includes(name)) out.push(name);
    } else if (CAPABILITY_SET.has(`CAP_${name}`)) {
      add("error", field, `"${token}" needs its prefix: write CAP_${name}.`);
    } else {
      add("error", field, `"${token}" is not a Linux capability name. They look like CAP_NET_BIND_SERVICE; capabilities(7) lists them.`);
    }
  }
  return out;
}

/** A user or group name systemd accepts: a conventional name, or a numeric ID. */
export function isValidAccountName(v: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/.test(v) || /^\d{1,10}$/.test(v);
}

function underHome(path: string): boolean {
  return /^-?(\/home(\/|$)|\/root(\/|$)|\/run\/user(\/|$))/.test(path);
}

/** A heredoc terminator that does not appear as a line of the text. */
export function heredocTag(text: string): string {
  const lines = new Set(text.split("\n"));
  let tag = "UNIT_EOF";
  while (lines.has(tag)) tag += "_";
  return tag;
}

/** Shell-safe single quoting for the commands block. */
function shellQuote(text: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

/* ------------------------------------------------------------- the build */

export function buildUnit(o: UnitOptions): UnitBuild {
  const findings: Finding[] = [];
  const add: Add = (level, field, message) => findings.push({ level, field, message });
  const h = o.hardening;

  const nameCheck = normalizeUnitName(o.name);
  if (nameCheck.error) add("error", "name", nameCheck.error);
  const fileName = nameCheck.error ? "" : `${nameCheck.name}.service`;

  /* [Unit] */
  const unitLines: string[] = [];
  const description = oneLine(o.description);
  if (hasControl(description)) add("error", "description", "The description contains a control character.");
  else if (description === "") {
    add("info", "description", "Without Description=, systemctl lists the unit by its file name.");
  } else if (description.length > MAX_LINE_LENGTH) {
    add("error", "description", `The description is longer than ${MAX_LINE_LENGTH} characters.`);
  } else unitLines.push(`Description=${escapePercent(description)}`);

  const wants = readUnitRefs(o.wants, "wants", "Wants=", add);
  const after = readUnitRefs(o.after, "after", "After=", add);
  if (wants.length) unitLines.push(`Wants=${wants.join(" ")}`);
  if (after.length) unitLines.push(`After=${after.join(" ")}`);

  if (after.includes("network.target") && !after.includes("network-online.target")) {
    add(
      "info",
      "after",
      "network.target is only about shutdown ordering and does not mean the network is up. A service that connects out when it starts wants network-online.target in both Wants= and After=, and that works only if a wait-online service such as systemd-networkd-wait-online or NetworkManager-wait-online is enabled.",
    );
  }
  if (wants.includes("network-online.target") && !after.includes("network-online.target")) {
    add("warn", "after", "Wants=network-online.target starts that target, but without After=network-online.target this service does not wait for it.");
  }
  if (after.includes("network-online.target") && !wants.includes("network-online.target")) {
    add("warn", "wants", "After=network-online.target only orders units when something else pulls the target in. Add Wants=network-online.target so it is started.");
  }

  /* Rate limits, written in [Unit]. */
  const intervalRaw = oneLine(o.startLimitIntervalSec);
  const burstRaw = oneLine(o.startLimitBurst);
  let interval: number | null = null;
  let burst: number | null = null;
  if (intervalRaw !== "") {
    interval = parseTimespan(intervalRaw);
    if (interval === null) {
      add("error", "startLimitIntervalSec", `"${intervalRaw}" is not a time span. Use a number of seconds or a value such as 60s or 5min.`);
    } else unitLines.push(`StartLimitIntervalSec=${intervalRaw}`);
  }
  if (burstRaw !== "") {
    if (!/^\d+$/.test(burstRaw) || Number(burstRaw) < 1 || Number(burstRaw) > 1_000_000) {
      add("error", "startLimitBurst", "StartLimitBurst= is a whole number of starts, 1 or more.");
    } else {
      burst = Number(burstRaw);
      unitLines.push(`StartLimitBurst=${burst}`);
    }
  }
  if (interval === 0 && burst !== null) {
    add("info", "startLimitIntervalSec", "An interval of 0 turns start rate limiting off, so StartLimitBurst= has no effect.");
  }

  /* [Service] */
  const service: string[] = [];
  service.push(`Type=${o.type}`);

  if (o.type === "oneshot" && o.remainAfterExit) service.push("RemainAfterExit=yes");

  if (o.type === "forking") {
    const pid = oneLine(o.pidFile);
    if (pid === "") {
      add("warn", "pidFile", "Without PIDFile=, systemd has to guess the main process of a forking service. Name the file the daemon writes.");
    } else if (hasControl(pid) || !pid.startsWith("/")) {
      add("error", "pidFile", "PIDFile= must be an absolute path, normally under /run.");
    } else {
      if (pid.startsWith("/var/run/")) {
        add("warn", "pidFile", "/var/run is a legacy alias for /run. systemd rewrites the path and logs a message about it, so write it as /run/....");
      }
      service.push(`PIDFile=${pid}`);
    }
  }

  const preLines = joinContinuations(readLines(o.execStartPre, "execStartPre", "ExecStartPre=", add));
  const startLines = joinContinuations(readLines(o.execStart, "execStart", "ExecStart=", add));
  const reloadLines = joinContinuations(readLines(o.execReload, "execReload", "ExecReload=", add));

  for (const cmd of preLines) {
    if (checkCommand(cmd, "execStartPre", "ExecStartPre", add)) service.push(`ExecStartPre=${cmd}`);
  }
  if (startLines.length === 0) {
    add("error", "execStart", "ExecStart= is required. Give the command that runs the service.");
  } else if (startLines.length > 1 && o.type !== "oneshot") {
    add(
      "error",
      "execStart",
      `Type=${o.type} allows exactly one ExecStart= command, and there are ${startLines.length}. Use Type=oneshot to run a sequence, or move the setup commands into ExecStartPre=.`,
    );
  }
  const startToWrite = o.type === "oneshot" ? startLines : startLines.slice(0, 1);
  const startWritten: string[] = [];
  for (const cmd of startToWrite) {
    if (checkCommand(cmd, "execStart", "ExecStart", add)) {
      service.push(`ExecStart=${cmd}`);
      startWritten.push(cmd);
    }
  }
  for (const cmd of reloadLines) {
    if (checkCommand(cmd, "execReload", "ExecReload", add)) service.push(`ExecReload=${cmd}`);
  }

  if (o.type === "notify") {
    add(
      "info",
      "type",
      "Type=notify needs a program that calls sd_notify with READY=1, directly or through libsystemd. Otherwise the unit stays activating until the 90 second default start timeout fails it.",
    );
  }
  if (o.type === "simple" || o.type === "exec") {
    const flagged = startWritten.find(
      (c) => /(^|\s)(--daemon|--daemonize|--fork|--background)(\s|=|$)/.test(c) && !/--daemonize[\s=](no|false|0)(\s|$)/.test(c),
    );
    if (flagged) {
      add(
        "warn",
        "type",
        `This command looks like it forks into the background. With Type=${o.type} the unit would see the foreground process exit and stop the service. Run it in the foreground, or use Type=forking with PIDFile=.`,
      );
    }
  }

  /* Restart policy. */
  if (o.restart !== "no") service.push(`Restart=${o.restart}`);
  const restartRaw = oneLine(o.restartSec);
  let restartSeconds: number | null = null;
  if (restartRaw !== "") {
    restartSeconds = parseTimespan(restartRaw);
    if (restartSeconds === null) {
      add("error", "restartSec", `"${restartRaw}" is not a time span. Use a number of seconds or a value such as 5s or 1min.`);
    } else service.push(`RestartSec=${restartRaw}`);
  }
  if (o.type === "oneshot" && (o.restart === "always" || o.restart === "on-success")) {
    add(
      "error",
      "restart",
      `systemd refuses Restart=${o.restart} for Type=oneshot. Use no or on-failure, or run the job from a timer.`,
    );
  } else if (o.type === "oneshot" && o.restart !== "no") {
    add("warn", "restart", "Older systemd versions refuse any Restart= other than no for a oneshot service. Recent ones accept on-failure.");
  }
  if (o.restart !== "no") {
    const effRestart = restartSeconds ?? 0.1;
    const effInterval = interval ?? 10;
    const effBurst = burst ?? 5;
    const span = effBurst * effRestart;
    if (effInterval > 0 && span < effInterval) {
      const took = span < 1 ? "under a second" : `about ${Math.round(span)} seconds`;
      add(
        "info",
        "restartSec",
        `If the program exits immediately, the restarts use up the ${effBurst} starts allowed in ${effInterval} seconds within ${took}. systemd then refuses further starts and the unit shows start-limit-hit until you run systemctl reset-failed. Raise RestartSec= if you want it to keep retrying.`,
      );
    }
  }

  /* Identity and location. */
  const user = oneLine(o.user);
  const group = oneLine(o.group);
  const validAccount = isValidAccountName;
  if (user !== "") {
    if (!validAccount(user)) {
      add("error", "user", `"${user}" is not a valid account name. Use letters, digits, _ . and -, starting with a letter or underscore, or a numeric UID.`);
    } else service.push(`User=${user}`);
  }
  if (group !== "") {
    if (!validAccount(group)) {
      add("error", "group", `"${group}" is not a valid group name. Use letters, digits, _ . and -, starting with a letter or underscore, or a numeric GID.`);
    } else service.push(`Group=${group}`);
  }
  const userIsRoot = user === "" || user === "root" || user === "0";
  if (userIsRoot) {
    add(
      "warn",
      "user",
      "No User= means the service runs as root, which also means a bug in it has root's reach. A dedicated unprivileged account limits that.",
    );
  }

  const workdir = oneLine(o.workingDirectory);
  if (workdir !== "") {
    if (hasControl(workdir)) add("error", "workingDirectory", "WorkingDirectory= contains a control character.");
    else if (!/^-?(\/|~)/.test(workdir)) add("error", "workingDirectory", "WorkingDirectory= must be an absolute path, or ~ for the service user's home directory.");
    else {
      if (/\s/.test(workdir)) add("warn", "workingDirectory", "The path contains a space. Paths in unit files are safest without spaces.");
      service.push(`WorkingDirectory=${workdir}`);
    }
  }

  const envFiles = readLines(o.environmentFile, "environmentFile", "EnvironmentFile=", add);
  for (const file of envFiles) {
    if (!/^-?\//.test(file)) {
      add("error", "environmentFile", `EnvironmentFile= needs an absolute path, optionally with a leading - to ignore a missing file. "${file}" is neither.`);
    } else {
      if (/\s/.test(file)) add("warn", "environmentFile", `"${file}" contains a space. Paths in unit files are safest without spaces.`);
      service.push(`EnvironmentFile=${file}`);
    }
  }

  const envLines = readLines(o.environment, "environment", "Environment=", add);
  const seenKeys = new Set<string>();
  for (const line of envLines) {
    const eq = line.indexOf("=");
    if (eq <= 0) {
      add("error", "environment", `"${line}" is not KEY=value.`);
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      add("error", "environment", `"${key}" is not a valid variable name. Use letters, digits and underscores, not starting with a digit.`);
      continue;
    }
    if (seenKeys.has(key)) add("warn", "environment", `${key} is set twice. The later line wins.`);
    seenKeys.add(key);
    if (/(PASS(WORD|PHRASE)?|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIAL)/i.test(key)) {
      add(
        "warn",
        "environment",
        `${key} looks like a secret. A value in Environment= sits in a unit file that anyone on the machine can read, and systemctl show prints it. Put it in an EnvironmentFile= with mode 0600 instead.`,
      );
    }
    if (/^(["']).*\1$/.test(value) && value.length >= 2) {
      add("info", "environment", `The value of ${key} is wrapped in quotes. They are passed to the program as part of the value.`);
    }
    // The whole assignment is double quoted, so a value may hold spaces. Inside
    // quotes systemd reads C-style escapes, so backslash and quote are escaped,
    // and % is doubled because specifiers are expanded in this setting.
    const body = `${key}=${value}`.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "%%");
    service.push(`Environment="${body}"`);
  }

  /* Hardening. */
  const sandbox: string[] = [];
  const protectHomeActive = h.protectHome === "yes" || h.protectHome === "tmpfs";

  if (h.noNewPrivileges) sandbox.push("NoNewPrivileges=yes");
  if (h.protectSystem !== "") sandbox.push(`ProtectSystem=${h.protectSystem}`);
  if (h.protectHome !== "") sandbox.push(`ProtectHome=${h.protectHome}`);
  if (h.privateTmp) sandbox.push("PrivateTmp=yes");
  if (h.privateDevices) sandbox.push("PrivateDevices=yes");
  if (h.protectKernelTunables) sandbox.push("ProtectKernelTunables=yes");
  if (h.protectKernelModules) sandbox.push("ProtectKernelModules=yes");
  if (h.protectControlGroups) sandbox.push("ProtectControlGroups=yes");
  if (h.protectHostname) sandbox.push("ProtectHostname=yes");

  const familyText = oneLine(h.restrictAddressFamilies);
  if (familyText !== "") {
    const tokens = familyText.split(/\s+/);
    const deny = tokens[0].startsWith("~");
    const typed = tokens.map((t, i) => (i === 0 && deny ? t.slice(1) : t)).filter((t) => t !== "");
    const bad = typed.find((n) => !/^AF_[A-Za-z0-9_]+$/i.test(n));
    if (bad !== undefined) {
      add("error", "restrictAddressFamilies", `"${bad}" is not an address family name. They look like AF_UNIX, AF_INET and AF_INET6.`);
    } else if (typed.length === 0) {
      add("error", "restrictAddressFamilies", "Name at least one address family after the ~.");
    } else {
      const names = typed.map((n) => FAMILY_BY_LOWER.get(n.toLowerCase()) ?? n.toUpperCase());
      const unknown = typed.filter((n) => !FAMILY_BY_LOWER.has(n.toLowerCase()));
      if (unknown.length > 0) {
        add(
          "warn",
          "restrictAddressFamilies",
          `${unknown.join(", ")} ${unknown.length === 1 ? "is" : "are"} not in the kernel's address family list, and systemd ignores a name it does not know. Check the spelling.`,
        );
      }
      sandbox.push(`RestrictAddressFamilies=${deny ? "~" : ""}${names.join(" ")}`);
      if (!deny && !names.includes("AF_UNIX")) {
        add(
          "info",
          "restrictAddressFamilies",
          "AF_UNIX is not in the list. Most daemons need it for syslog, D-Bus and name resolution through a local resolver.",
        );
      }
    }
  }

  let bounding: string[] | null = null;
  if (h.capabilityMode === "none") {
    sandbox.push("CapabilityBoundingSet=");
    bounding = [];
  } else if (h.capabilityMode === "allow" || h.capabilityMode === "deny") {
    const caps = readCapabilities(h.capabilityBoundingSet, "capabilityBoundingSet", add);
    if (caps.length === 0) {
      add(
        "error",
        "capabilityBoundingSet",
        h.capabilityMode === "allow"
          ? "Name at least one capability, or choose the option that drops all of them."
          : "Name at least one capability to remove.",
      );
    } else {
      sandbox.push(`CapabilityBoundingSet=${h.capabilityMode === "deny" ? "~" : ""}${caps.join(" ")}`);
      bounding = h.capabilityMode === "allow" ? caps : CAPABILITIES.filter((c) => !caps.includes(c));
    }
  }

  const ambientText = oneLine(h.ambientCapabilities);
  if (ambientText !== "") {
    const ambient = readCapabilities(ambientText, "ambientCapabilities", add);
    if (ambient.length > 0) {
      sandbox.push(`AmbientCapabilities=${ambient.join(" ")}`);
      if (userIsRoot) {
        add("info", "ambientCapabilities", "The service runs as root, which already holds every capability the bounding set allows. Ambient capabilities matter for a non-root User=.");
      }
      if (bounding !== null) {
        const missing = ambient.filter((c) => !(bounding as string[]).includes(c));
        if (missing.length > 0) {
          add(
            "warn",
            "ambientCapabilities",
            `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} outside CapabilityBoundingSet=. A capability has to be in the bounding set before it can be made ambient.`,
          );
        }
      }
    }
  }

  const rwText = oneLine(h.readWritePaths);
  if (rwText !== "") {
    const accepted: string[] = [];
    for (const path of rwText.split(/\s+/)) {
      if (hasControl(path) || !/^-?\//.test(path)) {
        add("error", "readWritePaths", `"${path}" must be an absolute path, optionally with a leading - to ignore it when missing.`);
      } else {
        accepted.push(path);
        if (path === "/" || path === "-/") {
          add("warn", "readWritePaths", "ReadWritePaths=/ makes the whole file system writable again, which cancels ProtectSystem=.");
        }
      }
    }
    if (accepted.length > 0) sandbox.push(`ReadWritePaths=${accepted.join(" ")}`);
    if (h.protectSystem === "" && h.protectHome === "") {
      add("info", "readWritePaths", "ReadWritePaths= changes nothing until ProtectSystem= or ProtectHome= makes something read-only.");
    }
  } else if (h.protectSystem === "strict") {
    add(
      "info",
      "readWritePaths",
      "ProtectSystem=strict leaves nothing writable except /dev, /proc and /sys. If the service writes files, list the directories in ReadWritePaths=, or use StateDirectory=, CacheDirectory= or LogsDirectory=, which systemd creates and keeps writable.",
    );
  }

  if (h.systemCallFilter === "system-service") sandbox.push("SystemCallFilter=@system-service");
  if (h.systemCallFilter === "system-service-strict") {
    sandbox.push("SystemCallFilter=@system-service");
    sandbox.push("SystemCallFilter=~@privileged @resources");
    if (userIsRoot) {
      add("warn", "systemCallFilter", "Subtracting @privileged is meant for a service that runs as a non-root User=. A root service that changes identity or limits itself will be killed.");
    }
  }
  if (h.systemCallArchitectures) sandbox.push("SystemCallArchitectures=native");
  if (h.lockPersonality) sandbox.push("LockPersonality=yes");
  if (h.restrictRealtime) sandbox.push("RestrictRealtime=yes");
  if (h.restrictSuidSgid) sandbox.push("RestrictSUIDSGID=yes");
  if (h.restrictNamespaces) sandbox.push("RestrictNamespaces=yes");
  if (h.memoryDenyWriteExecute) {
    sandbox.push("MemoryDenyWriteExecute=yes");
    const runtime = startWritten
      .map((c) => firstWord(splitExecPrefix(c).rest).split("/").pop() ?? "")
      .find((b) => /^(node|nodejs|bun|deno|java|dotnet|mono|luajit)(\d|\.|-|$)/i.test(b));
    if (runtime) {
      add("warn", "memoryDenyWriteExecute", `${runtime} uses a JIT compiler, which needs memory that is writable and executable. With this setting it will fail to start or crash.`);
    }
  }

  /* Cross checks between hardening and paths. */
  if (protectHomeActive) {
    const homePaths: string[] = [];
    if (underHome(workdir)) homePaths.push("WorkingDirectory=");
    if (startWritten.some((c) => underHome(firstWord(splitExecPrefix(c).rest)))) homePaths.push("ExecStart=");
    if (envFiles.some((f) => underHome(f) && !f.startsWith("-"))) homePaths.push("EnvironmentFile=");
    if (homePaths.length > 0) {
      add(
        "warn",
        "protectHome",
        `${homePaths.join(" and ")} points under /home, /root or /run/user, which ProtectHome=${h.protectHome} hides. The unit would fail to start. Use read-only, or move the files.`,
      );
    }
  }

  if (userIsRoot && sandbox.length === 0) {
    add("info", "hardening", "Nothing is restricted yet. Even a few switches, such as NoNewPrivileges, PrivateTmp and ProtectSystem, cut what a compromised service can reach.");
  }

  /* [Install] */
  const wantedBy = readUnitRefs(o.wantedBy, "wantedBy", "WantedBy=", add);
  const installLines: string[] = [];
  if (wantedBy.length > 0) {
    installLines.push(`WantedBy=${wantedBy.join(" ")}`);
    const odd = wantedBy.find((t) => !hasSuffix(t));
    if (odd) add("warn", "wantedBy", `"${odd}" has no unit suffix, so systemd reads it as ${odd}.service. WantedBy= normally names a target such as multi-user.target.`);
  } else if (oneLine(o.wantedBy) === "") {
    add("info", "wantedBy", "With no WantedBy=, systemctl enable has nothing to link and the service will not start at boot. It can still be started by hand or by another unit.");
  }

  /* Assemble the text. */
  const sections: string[] = [];
  sections.push(["[Unit]", ...unitLines].join("\n"));
  sections.push(["[Service]", ...service, ...(sandbox.length > 0 ? ["", "# Sandboxing", ...sandbox] : [])].join("\n"));
  if (installLines.length > 0) sections.push(["[Install]", ...installLines].join("\n"));
  const unit = `${sections.join("\n\n")}\n`;

  /* Install commands. */
  let commands = "";
  let script = "";
  if (fileName !== "") {
    const path = `/etc/systemd/system/${fileName}`;
    const prep: string[] = [];
    if (user !== "" && !userIsRoot && !/^\d+$/.test(user) && validAccount(user)) {
      prep.push(
        "# Create the service account if it does not exist yet",
        `id -u ${user} >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin ${user}`,
      );
    }
    const envPaths = envFiles.filter((f) => /^-?\//.test(f) && !/\s/.test(f)).map((f) => (f.startsWith("-") ? f.slice(1) : f));
    if (envPaths.length > 0) {
      prep.push("# systemd reads EnvironmentFile as root, so mode 0600 owned by root is enough");
      for (const file of envPaths.slice(0, 5)) {
        const dir = file.slice(0, file.lastIndexOf("/")) || "/";
        prep.push(`sudo mkdir -p ${shellQuote(dir)}`, `sudo touch ${shellQuote(file)}`, `sudo chmod 0600 ${shellQuote(file)}`);
      }
    }
    const install = [
      "# Check the file, then load it and start it now and at every boot",
      `systemd-analyze verify ${shellQuote(path)}`,
      "sudo systemctl daemon-reload",
      `sudo systemctl enable --now ${shellQuote(fileName)}`,
      "",
      "# Confirm it is running, read its log, and score its sandboxing",
      `systemctl status ${shellQuote(fileName)} --no-pager`,
      `journalctl -u ${shellQuote(fileName)} -n 30 --no-pager`,
      `systemd-analyze security ${shellQuote(fileName)}`,
    ];
    const head = [
      `# Save the unit file as ./${fileName}, then install it`,
      `sudo install -m 0644 -o root -g root ${shellQuote(`./${fileName}`)} ${shellQuote(path)}`,
    ];
    commands = [...prep, ...(prep.length ? [""] : []), ...head, ...install].join("\n");

    const tag = heredocTag(unit);
    const writeStep = [`sudo tee ${shellQuote(path)} >/dev/null <<'${tag}'`, unit.replace(/\n$/, ""), tag];
    script = [...prep, ...(prep.length ? [""] : []), ...writeStep, "", ...install].join("\n");
  }

  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.filter((f) => f.level === "warn").length;
  return {
    fileName,
    unit,
    commands,
    script,
    findings,
    errors,
    warnings,
    notes: findings.length - errors - warnings,
    hardeningCount: sandbox.length,
  };
}
