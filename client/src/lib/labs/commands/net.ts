/**
 * Networking commands.
 *
 * The whole reason this lab environment exists. A reader can be told that
 * longest-prefix match beats reading the routing table top to bottom, and it
 * will not stick; running `ip route get` against a table with an overlapping
 * /16 and /24 sticks.
 *
 * Reachability is decided by the machine model rather than faked per command,
 * so ping, curl and nc always agree. A host that refuses on 443 refuses to
 * all three, and a host behind a DROP rule hangs for all three.
 */

import { fail, ok, out, err, type Command, type OutLine, type Output } from "../shell";
import {
  inNetwork,
  ipToInt,
  routeFor,
  type Machine,
  type RemoteHost,
} from "../machine";

const pad = (text: string, width: number) => text.padEnd(width);

/* --------------------------------------------------------------------------
   Resolution: a name goes through the resolver, an address does not.
   ----------------------------------------------------------------------- */

export interface Resolved {
  ip?: string;
  /** Why it failed, in the wording the caller should print. */
  problem?: "nxdomain" | "no-server" | "no-a-record";
  cname?: string;
}

export function resolve(machine: Machine, name: string): Resolved {
  if (ipToInt(name) !== null) return { ip: name };
  if (!machine.dns.reachable) return { problem: "no-server" };

  const answers = machine.dns.zones[name.toLowerCase().replace(/\.$/, "")];
  if (!answers) return { problem: "nxdomain" };

  const cname = answers.find((a) => a.type === "CNAME");
  if (cname) {
    const chased = resolve(machine, cname.value);
    return { ...chased, cname: cname.value };
  }
  const a = answers.find((answer) => answer.type === "A");
  return a ? { ip: a.value } : { problem: "no-a-record" };
}

/** The remote as the machine sees it, including hosts on the local subnet. */
function remoteFor(machine: Machine, ip: string): RemoteHost | undefined {
  const known = machine.remotes[ip];
  if (known) return known;
  // An address on a connected subnet with a neighbour entry is reachable even
  // if no scenario bothered to describe it.
  const neighbour = machine.neighbours.find((n) => n.ip === ip);
  if (neighbour && neighbour.state !== "FAILED" && neighbour.state !== "INCOMPLETE") {
    return { ip, pingable: true, rtt: 0.4 };
  }
  return undefined;
}

function onLocalSubnet(machine: Machine, ip: string): boolean {
  return machine.interfaces.some((i) => i.up && i.cidr && inNetwork(ip, i.cidr));
}

/* --------------------------------------------------------------------------
   ip
   ----------------------------------------------------------------------- */

export const ip: Command = {
  name: "ip",
  summary: "show addresses, links, routes and neighbours",
  usage: [
    "ip addr            addresses on every interface",
    "ip -br addr        one line per interface",
    "ip link            interfaces and their state",
    "ip route           the routing table",
    "ip route get IP    which route the kernel would actually use",
    "ip neigh           the ARP cache",
  ],
  run(argv, { machine }) {
    const brief = argv.includes("-br") || argv.includes("-brief");
    const words = argv.filter((a) => !a.startsWith("-"));
    const object = words[0] ?? "";

    if (object.startsWith("a")) return brief ? briefAddr(machine) : fullAddr(machine);
    if (object.startsWith("l")) return links(machine, brief);
    if (object.startsWith("n")) return neighbours(machine);
    if (object.startsWith("r")) {
      if (words[1] === "get" && words[2]) return routeGet(machine, words[2]);
      return routes(machine);
    }
    return fail(`Object "${object}" is unknown, try "ip help".`);
  },
};

function fullAddr(machine: Machine): Output {
  const lines: OutLine[] = [];
  machine.interfaces.forEach((iface, index) => {
    const flags = iface.up
      ? iface.name === "lo"
        ? "<LOOPBACK,UP,LOWER_UP>"
        : "<BROADCAST,MULTICAST,UP,LOWER_UP>"
      : "<BROADCAST,MULTICAST>";
    lines.push(
      out(
        `${index + 1}: ${iface.name}: ${flags} mtu ${iface.mtu} qdisc fq_codel state ` +
          `${iface.up ? "UP" : "DOWN"} group default qlen 1000`,
      ),
    );
    lines.push(out(`    link/ether ${iface.mac} brd ff:ff:ff:ff:ff:ff`));
    if (iface.cidr) {
      lines.push(out(`    inet ${iface.cidr} brd ${broadcastOf(iface.cidr)} scope global ${iface.name}`));
      lines.push(out(`       valid_lft forever preferred_lft forever`));
    }
  });
  return ok(lines);
}

function briefAddr(machine: Machine): Output {
  return ok(
    machine.interfaces.map((iface) =>
      out(`${pad(iface.name, 12)}${pad(iface.up ? "UP" : "DOWN", 14)}${iface.cidr ?? ""}`),
    ),
  );
}

function links(machine: Machine, brief: boolean): Output {
  if (brief) {
    return ok(
      machine.interfaces.map((i) => out(`${pad(i.name, 12)}${pad(i.up ? "UP" : "DOWN", 14)}${i.mac}`)),
    );
  }
  const lines: OutLine[] = [];
  machine.interfaces.forEach((iface, index) => {
    lines.push(
      out(
        `${index + 1}: ${iface.name}: <BROADCAST,MULTICAST${iface.up ? ",UP,LOWER_UP" : ""}> ` +
          `mtu ${iface.mtu} qdisc fq_codel state ${iface.up ? "UP" : "DOWN"} mode DEFAULT group default qlen 1000`,
      ),
    );
    lines.push(out(`    link/ether ${iface.mac} brd ff:ff:ff:ff:ff:ff`));
  });
  return ok(lines);
}

function routes(machine: Machine): Output {
  return ok(
    machine.routes.map((route) =>
      out(
        [
          route.destination,
          route.via ? `via ${route.via}` : "",
          `dev ${route.dev}`,
          `proto ${route.proto}`,
          route.src ? `src ${route.src}` : "",
          route.metric !== undefined ? `metric ${route.metric}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      ),
    ),
  );
}

function routeGet(machine: Machine, target: string): Output {
  if (ipToInt(target) === null) return fail(`Error: any valid prefix is expected rather than "${target}".`);
  const route = routeFor(machine, target);
  if (!route) return fail(`RTNETLINK answers: Network is unreachable`);
  const iface = machine.interfaces.find((i) => i.name === route.dev);
  const src = route.src ?? iface?.cidr?.split("/")[0] ?? "";
  const via = route.via ? `via ${route.via} ` : "";
  return ok([out(`${target} ${via}dev ${route.dev} src ${src} uid ${machine.uid}`), out("    cache")]);
}

function neighbours(machine: Machine): Output {
  return ok(
    machine.neighbours.map((n) =>
      out(`${n.ip} dev ${n.dev}${n.mac ? ` lladdr ${n.mac}` : ""} ${n.state}`),
    ),
  );
}

function broadcastOf(cidr: string): string {
  const [address, bitsText] = cidr.split("/");
  const value = ipToInt(address);
  const bits = Number(bitsText);
  if (value === null || !Number.isInteger(bits)) return "";
  const host = bits === 0 ? 0xffffffff : (~((0xffffffff << (32 - bits)) >>> 0)) >>> 0;
  const broadcast = (value | host) >>> 0;
  return [24, 16, 8, 0].map((shift) => (broadcast >>> shift) & 255).join(".");
}

/* --------------------------------------------------------------------------
   ss
   ----------------------------------------------------------------------- */

export const ss: Command = {
  name: "ss",
  summary: "show sockets",
  usage: [
    "ss -tlnp    listening TCP sockets, numeric, with the owning process",
    "ss -tunap   every TCP and UDP socket",
    "",
    "  -t  TCP    -u  UDP    -l  listening only    -a  all",
    "  -n  numeric ports, do not look up /etc/services",
    "  -p  show the process, which needs root to see other users' sockets",
  ],
  run(argv, { machine }) {
    const set = new Set(argv.filter((a) => a.startsWith("-")).flatMap((a) => [...a.slice(1)]));
    const wantTcp = set.has("t") || (!set.has("t") && !set.has("u"));
    const wantUdp = set.has("u");
    const listeningOnly = set.has("l") && !set.has("a");

    const rows = machine.sockets.filter((socket) => {
      if (socket.proto === "tcp" && !wantTcp) return false;
      if (socket.proto === "udp" && !wantUdp) return false;
      if (listeningOnly && socket.state !== "LISTEN" && socket.state !== "UNCONN") return false;
      return true;
    });

    const header = `${pad("Netid", 6)}${pad("State", 9)}${pad("Recv-Q", 8)}${pad("Send-Q", 8)}` +
      `${pad("Local Address:Port", 24)}${pad("Peer Address:Port", 22)}${set.has("p") ? "Process" : ""}`;

    const lines = [out(header.trimEnd())];
    for (const socket of rows) {
      let process = "";
      if (set.has("p") && socket.process) {
        process =
          machine.user === "root" || socket.process.startsWith(machine.user)
            ? `users:(("${socket.process}",pid=${socket.pid},fd=6))`
            : "";
      }
      lines.push(
        out(
          (
            `${pad(socket.proto, 6)}${pad(socket.state, 9)}${pad("0", 8)}${pad("0", 8)}` +
            `${pad(socket.local, 24)}${pad(socket.peer, 22)}${process}`
          ).trimEnd(),
        ),
      );
    }
    if (set.has("p") && machine.user !== "root" && rows.some((r) => r.process)) {
      lines.push(err("ss: some processes could not be identified, non-owned process info"));
      lines.push(err(" will not be shown, you would have to be root to see it all."));
    }
    return ok(lines);
  },
};

/* --------------------------------------------------------------------------
   ping, traceroute
   ----------------------------------------------------------------------- */

export const ping: Command = {
  name: "ping",
  summary: "send ICMP echo requests",
  usage: [
    "ping [-c COUNT] HOST",
    "",
    "  -c  stop after COUNT packets (default 4 here, since nothing can Ctrl-C)",
    "",
    "A ping that fails tells you almost nothing on its own: plenty of hosts",
    "are configured to drop echo. Read it with `ip route get` and `ss`.",
  ],
  run(argv, { machine }) {
    const count = Math.min(10, Number(argv[argv.indexOf("-c") + 1]) || 4);
    const target = argv.filter((a) => !a.startsWith("-")).pop();
    if (!target) return fail("ping: usage error: Destination address required");

    const resolved = resolve(machine, target);
    if (!resolved.ip) {
      if (resolved.problem === "no-server") {
        return fail(`ping: ${target}: Temporary failure in name resolution`);
      }
      return fail(`ping: ${target}: Name or service not known`);
    }

    const route = routeFor(machine, resolved.ip);
    if (!route && !onLocalSubnet(machine, resolved.ip)) {
      return fail(`ping: connect: Network is unreachable`);
    }

    const remote = remoteFor(machine, resolved.ip);
    const lines: OutLine[] = [
      out(`PING ${target} (${resolved.ip}) 56(84) bytes of data.`),
    ];

    if (!remote || !remote.pingable) {
      for (let i = 0; i < count; i++) lines.push(out("", 700));
      lines.push(out(""));
      lines.push(out(`--- ${target} ping statistics ---`));
      lines.push(
        out(`${count} packets transmitted, 0 received, 100% packet loss, time ${count * 1000 - 1}ms`),
      );
      return { lines: lines.filter((l) => l.text !== "" || l.delay === undefined), code: 1 };
    }

    const rtt = remote.rtt ?? 1.2;
    const times: number[] = [];
    for (let i = 0; i < count; i++) {
      // Deterministic jitter: the same lab always prints the same numbers, so
      // a screenshot in an article cannot go stale.
      const time = Number((rtt + ((i * 7) % 5) / 10).toFixed(2));
      times.push(time);
      lines.push(
        out(`64 bytes from ${resolved.ip}: icmp_seq=${i + 1} ttl=64 time=${time.toFixed(2)} ms`, 400),
      );
    }
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    lines.push(out(""));
    lines.push(out(`--- ${target} ping statistics ---`));
    lines.push(out(`${count} packets transmitted, ${count} received, 0% packet loss, time ${count * 1000 - 1}ms`));
    lines.push(
      out(`rtt min/avg/max/mdev = ${min.toFixed(3)}/${avg.toFixed(3)}/${max.toFixed(3)}/0.180 ms`),
    );
    return ok(lines);
  },
};

export const traceroute: Command = {
  name: "traceroute",
  summary: "show the path to a host",
  usage: ["traceroute HOST", "", "A hop printed as * * * did not answer. That is not the same as broken."],
  run(argv, { machine }) {
    const target = argv.filter((a) => !a.startsWith("-")).pop();
    if (!target) return fail("Usage: traceroute HOST");
    const resolved = resolve(machine, target);
    if (!resolved.ip) return fail(`traceroute: unknown host ${target}`);
    const remote = remoteFor(machine, resolved.ip);
    const hops = remote?.hops ?? [];
    const lines: OutLine[] = [
      out(`traceroute to ${target} (${resolved.ip}), 30 hops max, 60 byte packets`),
    ];
    hops.forEach((hop, index) => {
      if (hop === "*") {
        lines.push(out(` ${String(index + 1).padStart(2)}  * * *`, 900));
      } else {
        const base = 0.6 + index * 2.4;
        lines.push(
          out(
            ` ${String(index + 1).padStart(2)}  ${hop}  ${base.toFixed(3)} ms  ` +
              `${(base + 0.2).toFixed(3)} ms  ${(base + 0.3).toFixed(3)} ms`,
            500,
          ),
        );
      }
    });
    if (hops.length === 0) lines.push(out(" 1  * * *", 900));
    return ok(lines);
  },
};

/* --------------------------------------------------------------------------
   dig, host
   ----------------------------------------------------------------------- */

export const dig: Command = {
  name: "dig",
  summary: "query DNS",
  usage: [
    "dig NAME [TYPE]",
    "dig @SERVER NAME [TYPE]",
    "dig +short NAME",
    "",
    "@SERVER asks that server directly, which is how you tell a stale cache",
    "from a wrong zone: ask the resolver, then ask the authority.",
  ],
  run(argv, { machine }) {
    const short = argv.includes("+short");
    const words = argv.filter((a) => !a.startsWith("+"));
    const serverArg = words.find((w) => w.startsWith("@"));
    const rest = words.filter((w) => !w.startsWith("@"));
    const name = (rest[0] ?? "").toLowerCase().replace(/\.$/, "");
    const type = (rest[1] ?? "A").toUpperCase();
    if (!name) return fail("dig: no name to look up");

    const authoritative = serverArg !== undefined && machine.dns.authoritative !== undefined;
    const zones = authoritative ? machine.dns.authoritative! : machine.dns.zones;
    const server = serverArg ? serverArg.slice(1) : (machine.dns.servers[0] ?? "");

    if (!serverArg && !machine.dns.reachable) {
      return {
        lines: [
          out(`; <<>> DiG 9.18.28 <<>> ${name} ${type}`),
          out(";; global options: +cmd"),
          out(";; connection timed out; no servers could be reached"),
        ],
        code: 9,
      };
    }

    const answers = (zones[name] ?? []).filter((a) => a.type === type || type === "ANY");
    if (short) {
      return { lines: answers.map((a) => out(a.value)), code: answers.length ? 0 : 0 };
    }

    const status = zones[name] ? "NOERROR" : "NXDOMAIN";
    const lines: OutLine[] = [
      out(`; <<>> DiG 9.18.28 <<>> ${serverArg ? `${serverArg} ` : ""}${name} ${type}`),
      out(";; global options: +cmd"),
      out(";; Got answer:"),
      out(`;; ->>HEADER<<- opcode: QUERY, status: ${status}, id: 44821`),
      out(`;; flags: qr rd ra${authoritative ? " aa" : ""}; QUERY: 1, ANSWER: ${answers.length}, AUTHORITY: 0, ADDITIONAL: 1`),
      out(""),
      out(";; QUESTION SECTION:"),
      out(`;${name}.\t\t\tIN\t${type}`),
      out(""),
    ];
    if (answers.length) {
      lines.push(out(";; ANSWER SECTION:"));
      for (const answer of answers) {
        lines.push(out(`${name}.\t\t${answer.ttl}\tIN\t${answer.type}\t${answer.value}`));
      }
      lines.push(out(""));
    }
    lines.push(out(`;; Query time: 4 msec`));
    lines.push(out(`;; SERVER: ${server}#53(${server}) (UDP)`));
    lines.push(out(`;; MSG SIZE  rcvd: ${60 + answers.length * 16}`));
    return ok(lines);
  },
};

export const hostCmd: Command = {
  name: "host",
  summary: "look up a name, briefly",
  usage: ["host NAME"],
  run(argv, { machine }) {
    const name = argv[0];
    if (!name) return fail("Usage: host NAME");
    const resolved = resolve(machine, name);
    if (resolved.problem === "no-server") return fail(`;; connection timed out; no servers could be reached`);
    if (!resolved.ip) return fail(`Host ${name} not found: 3(NXDOMAIN)`);
    const lines: OutLine[] = [];
    if (resolved.cname) lines.push(out(`${name} is an alias for ${resolved.cname}.`));
    lines.push(out(`${resolved.cname ?? name} has address ${resolved.ip}`));
    return ok(lines);
  },
};

/* --------------------------------------------------------------------------
   curl, nc
   ----------------------------------------------------------------------- */

export const curl: Command = {
  name: "curl",
  summary: "make an HTTP request",
  usage: [
    "curl [-I] [-s] [-v] URL",
    "",
    "  -I  headers only (a HEAD request)",
    "  -s  silent: no progress meter",
    "  -v  verbose: show the connection and the request",
  ],
  run(argv, { machine }) {
    const set = new Set(argv.filter((a) => a.startsWith("-")).flatMap((a) => [...a.slice(1)]));
    const url = argv.filter((a) => !a.startsWith("-")).pop();
    if (!url) return fail("curl: try 'curl --help' for more information");

    const parsed = /^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
    if (!parsed) return fail(`curl: (3) URL rejected: Bad hostname`);
    const [, scheme = "http", hostname, portText, path = "/"] = parsed;
    const port = Number(portText ?? (scheme === "https" ? 443 : 80));

    const resolved = resolve(machine, hostname);
    if (!resolved.ip) {
      return { lines: [err(`curl: (6) Could not resolve host: ${hostname}`)], code: 6 };
    }
    const remote = remoteFor(machine, resolved.ip);
    if (!remote) {
      return { lines: [err(`curl: (7) Failed to connect to ${hostname} port ${port}: No route to host`)], code: 7 };
    }
    if (remote.filteredPorts?.includes(port)) {
      return {
        lines: [err(`curl: (28) Failed to connect to ${hostname} port ${port} after 130000 ms: Timeout was reached`)],
        code: 28,
      };
    }
    if (!remote.openPorts?.includes(port)) {
      return {
        lines: [err(`curl: (7) Failed to connect to ${hostname} port ${port}: Connection refused`)],
        code: 7,
      };
    }

    const response = remote.http?.[path];
    const lines: OutLine[] = [];
    if (set.has("v")) {
      lines.push(err(`*   Trying ${resolved.ip}:${port}...`));
      lines.push(err(`* Connected to ${hostname} (${resolved.ip}) port ${port}`));
      lines.push(err(`> ${set.has("I") ? "HEAD" : "GET"} ${path} HTTP/1.1`));
      lines.push(err(`> Host: ${hostname}`));
      lines.push(err(`> User-Agent: curl/8.5.0`));
      lines.push(err(">"));
    }
    if (!response) {
      lines.push(out(`HTTP/1.1 404 Not Found`));
      lines.push(out(`Server: nginx`));
      return { lines, code: 0 };
    }
    if (set.has("I") || set.has("v")) {
      lines.push(out(`HTTP/1.1 ${response.status} ${response.statusText}`));
      for (const [key, value] of Object.entries(response.headers)) lines.push(out(`${key}: ${value}`));
      lines.push(out(""));
    }
    if (!set.has("I") && response.body) {
      for (const line of response.body.split("\n")) lines.push(out(line));
    }
    return ok(lines);
  },
};

export const nc: Command = {
  name: "nc",
  summary: "test whether a TCP port accepts a connection",
  usage: ["nc -vz HOST PORT", "", "  -z  connect and hang up    -v  say what happened"],
  run(argv, { machine }) {
    const words = argv.filter((a) => !a.startsWith("-"));
    const [hostname, portText] = words;
    const port = Number(portText);
    if (!hostname || !Number.isFinite(port)) return fail("usage: nc -vz HOST PORT");
    const resolved = resolve(machine, hostname);
    if (!resolved.ip) return fail(`nc: getaddrinfo for host "${hostname}" port ${port}: Name or service not known`);
    const remote = remoteFor(machine, resolved.ip);
    if (!remote) return fail(`nc: connect to ${hostname} port ${port} (tcp) failed: No route to host`);
    if (remote.filteredPorts?.includes(port)) {
      return { lines: [err(`nc: connect to ${hostname} port ${port} (tcp) timed out: Operation now in progress`)], code: 1 };
    }
    if (!remote.openPorts?.includes(port)) {
      return { lines: [err(`nc: connect to ${hostname} port ${port} (tcp) failed: Connection refused`)], code: 1 };
    }
    return ok([err(`Connection to ${hostname} (${resolved.ip}) ${port} port [tcp/*] succeeded!`)]);
  },
};

export const hostname: Command = {
  name: "hostname",
  summary: "print the machine's name",
  usage: ["hostname"],
  run(_argv, { machine }) {
    return ok([out(machine.hostname)]);
  },
};

export const NET_COMMANDS: Command[] = [ip, ss, ping, traceroute, dig, hostCmd, curl, nc, hostname];
