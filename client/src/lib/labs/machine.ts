/**
 * The simulated host, and the small piece of network it can see.
 *
 * A lab is a machine in a particular state plus a question about it. The
 * question is nearly always answered by reading the machine rather than by
 * changing it: which interface has the address, what does the routing table
 * say about that destination, which process is holding the port, what did the
 * log record at the moment it broke. So the model here is mostly nouns, and
 * the commands in ./commands are mostly formatters over these nouns.
 *
 * Everything a command can print lives in this object. Nothing is computed
 * from the real world: no Date.now(), no Math.random() outside the seeded
 * generator, no fetch. Given the same starting state and the same commands, a
 * lab produces the same output every time, which is what lets the CI gate
 * replay each lab's solution and check the result.
 */

import { cloneTree, type FsNode } from "./vfs";

export interface Interface {
  name: string;
  /** UP, DOWN. Reported by `ip link` and used by ping's reachability rules. */
  up: boolean;
  mac: string;
  /** CIDR, e.g. "10.20.30.11/24". Absent on an interface with no address. */
  cidr?: string;
  mtu: number;
}

export interface Route {
  /** "default" or a CIDR. */
  destination: string;
  via?: string;
  dev: string;
  /** Absent on a kernel-generated connected route. */
  metric?: number;
  proto: string;
  src?: string;
}

export interface Neighbour {
  ip: string;
  dev: string;
  mac?: string;
  /** REACHABLE, STALE, FAILED, INCOMPLETE. */
  state: string;
}

export interface Socket {
  proto: "tcp" | "udp";
  /** LISTEN, ESTAB, TIME-WAIT. */
  state: string;
  local: string;
  peer: string;
  pid?: number;
  process?: string;
}

export interface Process {
  pid: number;
  user: string;
  /** Percent, as `ps aux` prints it. */
  cpu: number;
  mem: number;
  rss: number;
  stat: string;
  start: string;
  time: string;
  command: string;
}

export interface Service {
  name: string;
  /** active, failed, inactive. */
  state: string;
  /** running, exited, dead, failed. */
  sub: string;
  since: string;
  /** What `systemctl status` prints under the header. */
  detail: string[];
  enabled: boolean;
}

/**
 * The resolver's view of the world.
 *
 * `zones` is what the configured nameserver answers. `authoritative` is what
 * a different nameserver would answer, which is how a lab poses a stale-cache
 * or split-horizon question: the two disagree and the reader has to notice.
 */
export interface Dns {
  /** Nameservers in /etc/resolv.conf order. */
  servers: string[];
  /** Whether the configured servers respond at all. */
  reachable: boolean;
  zones: Record<string, DnsAnswer[]>;
  authoritative?: Record<string, DnsAnswer[]>;
}

export interface DnsAnswer {
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "PTR" | "SOA";
  ttl: number;
  value: string;
}

/** A host somewhere else that this machine may or may not be able to reach. */
export interface RemoteHost {
  ip: string;
  /** Does it answer ICMP echo? A firewall that drops echo is a classic lab. */
  pingable: boolean;
  /** Round trip in milliseconds, used to render plausible ping output. */
  rtt?: number;
  /** Ports that accept a TCP connection. Everything else is refused. */
  openPorts?: number[];
  /** Ports that hang rather than refuse, which is how a DROP rule looks. */
  filteredPorts?: number[];
  /** Hop list for traceroute, nearest first, "*" for a hop that does not reply. */
  hops?: string[];
  /** Keyed by path: what `curl` gets back. */
  http?: Record<string, HttpResponse>;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface Machine {
  hostname: string;
  /** The user the shell is running as. Labs run as a normal user by default. */
  user: string;
  uid: number;
  gid: number;
  groups: string[];
  cwd: string;
  env: Record<string, string>;
  root: FsNode;
  kernel: string;
  distro: string;
  uptime: string;
  loadavg: [number, number, number];
  memory: { totalMb: number; usedMb: number; freeMb: number; buffMb: number };
  disks: { filesystem: string; sizeMb: number; usedMb: number; mount: string }[];
  interfaces: Interface[];
  routes: Route[];
  neighbours: Neighbour[];
  sockets: Socket[];
  processes: Process[];
  services: Service[];
  dns: Dns;
  remotes: Record<string, RemoteHost>;
  /**
   * Commands the reader has run, newest last. Scenarios read this when the
   * goal is "notice the thing" rather than "change the thing": the check for
   * a diagnosis lab is an answer submitted with `answer`, but the transcript
   * is what tells a hint whether they have looked in the right place yet.
   */
  history: string[];
  /** Answers submitted with the `answer` builtin, newest last. */
  answers: string[];
}

/**
 * A defaults object, so a scenario writes only what makes it different.
 *
 * The temptation is to give every scenario a blank machine and have it fill
 * everything in. That produces scenarios that are 300 lines of plumbing with
 * the interesting three lines buried in them, and it produces machines that
 * disagree with each other about how much RAM a box has for no reason.
 */
export function baseMachine(overrides: Partial<Machine> = {}): Machine {
  const machine: Machine = {
    hostname: "lab",
    user: "student",
    uid: 1000,
    gid: 1000,
    groups: ["student", "sudo"],
    cwd: "/home/student",
    env: {
      HOME: "/home/student",
      USER: "student",
      SHELL: "/bin/bash",
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      LANG: "en_GB.UTF-8",
      TERM: "xterm-256color",
    },
    root: { kind: "dir", mode: 0o755, owner: "root", group: "root", mtime: 0, children: {} },
    kernel: "6.8.0-45-generic",
    distro: "Ubuntu 24.04.1 LTS",
    uptime: "up 6 days, 2 hours, 11 minutes",
    loadavg: [0.14, 0.09, 0.03],
    memory: { totalMb: 3924, usedMb: 812, freeMb: 2311, buffMb: 801 },
    disks: [
      { filesystem: "/dev/vda1", sizeMb: 40960, usedMb: 11264, mount: "/" },
      { filesystem: "tmpfs", sizeMb: 1962, usedMb: 2, mount: "/run" },
    ],
    interfaces: [],
    routes: [],
    neighbours: [],
    sockets: [],
    processes: [],
    services: [],
    dns: { servers: ["10.20.30.1"], reachable: true, zones: {} },
    remotes: {},
    history: [],
    answers: [],
    ...overrides,
  };
  return machine;
}

/** A fresh copy, so "restart this lab" cannot leak state from the last run. */
export function cloneMachine(machine: Machine): Machine {
  return {
    ...machine,
    groups: [...machine.groups],
    env: { ...machine.env },
    root: cloneTree(machine.root),
    loadavg: [...machine.loadavg] as [number, number, number],
    memory: { ...machine.memory },
    disks: machine.disks.map((d) => ({ ...d })),
    interfaces: machine.interfaces.map((i) => ({ ...i })),
    routes: machine.routes.map((r) => ({ ...r })),
    neighbours: machine.neighbours.map((n) => ({ ...n })),
    sockets: machine.sockets.map((s) => ({ ...s })),
    processes: machine.processes.map((p) => ({ ...p })),
    services: machine.services.map((s) => ({ ...s, detail: [...s.detail] })),
    dns: {
      ...machine.dns,
      servers: [...machine.dns.servers],
      zones: structuredClone(machine.dns.zones),
      authoritative: machine.dns.authoritative
        ? structuredClone(machine.dns.authoritative)
        : undefined,
    },
    remotes: structuredClone(machine.remotes),
    history: [...machine.history],
    answers: [...machine.answers],
  };
}

/* ---------------------------------------------------------------------------
   Address arithmetic. Shared by ip, ping and the routing lookup, so all three
   agree about what "on this subnet" means.
   ------------------------------------------------------------------------ */

export function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

export const intToIp = (value: number): string =>
  [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");

export function inNetwork(ip: string, cidr: string): boolean {
  const [network, bitsText] = cidr.split("/");
  const bits = Number(bitsText);
  const target = ipToInt(ip);
  const base = ipToInt(network);
  if (target === null || base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((target & mask) >>> 0) === ((base & mask) >>> 0);
}

/**
 * Which route would the kernel pick for this destination?
 *
 * Longest prefix wins, then lowest metric, which is the part people get wrong
 * when they read a routing table top to bottom and take the first match.
 */
export function routeFor(machine: Machine, ip: string): Route | null {
  let best: Route | null = null;
  let bestBits = -1;
  for (const route of machine.routes) {
    const cidr = route.destination === "default" ? "0.0.0.0/0" : route.destination;
    if (!inNetwork(ip, cidr)) continue;
    const bits = Number(cidr.split("/")[1] ?? 32);
    if (bits > bestBits || (bits === bestBits && (route.metric ?? 0) < (best?.metric ?? 0))) {
      best = route;
      bestBits = bits;
    }
  }
  return best;
}
