/**
 * The labs themselves: a machine in a particular state, and a question.
 *
 * Every lab carries a `solution`, which is a real transcript of commands that
 * solves it. The CI gate replays each one through the real shell and asserts
 * the lab reports itself solved, which does three jobs at once: it proves the
 * lab is solvable, it proves the `solved` predicate matches the intended
 * route, and it exercises every command the solution touches. A lab whose
 * solution has rotted fails the build rather than a reader's afternoon.
 *
 * Most of these are diagnosis rather than repair, because that is the shape
 * of nearly all real troubleshooting: you are not asked to fix the router,
 * you are asked to say which of six things is wrong before anyone lets you
 * near it. Those labs end with `answer`, and their predicate reads the words.
 */

import { baseMachine, type Machine } from "./machine";
import { dir, file, link } from "./vfs";

export type LabDifficulty = "easy" | "medium" | "hard";

export interface Lab {
  slug: string;
  title: string;
  tagline: string;
  difficulty: LabDifficulty;
  /** What the reader is being asked to do, in the second person. */
  brief: string[];
  /** Progressive. The reader opens them one at a time and that is recorded. */
  hints: string[];
  /** Built fresh each time, so restarting a lab is genuinely a restart. */
  build: () => Machine;
  /** True when the reader has done the thing. */
  solved: (machine: Machine) => boolean;
  /** Shown once solved. Says what the fault was and why it looked like that. */
  debrief: string[];
  /** A real transcript that solves it. Replayed by the CI gate. */
  solution: string[];
  reading?: { label: string; href: string }[];
}

/** Answer matching: every term must appear somewhere in one submitted answer. */
const answered = (machine: Machine, ...terms: string[][]): boolean =>
  machine.answers.some((raw) => {
    const text = raw.toLowerCase();
    return terms.every((alternatives) => alternatives.some((term) => text.includes(term)));
  });

/* ==========================================================================
   1. The address that is not an address
   ========================================================================== */

const linkLocal = (): Machine =>
  baseMachine({
    hostname: "ws-fin-04",
    interfaces: [
      { name: "lo", up: true, mac: "00:00:00:00:00:00", cidr: "127.0.0.1/8", mtu: 65536 },
      { name: "enp3s0", up: true, mac: "3c:58:c2:11:9f:04", cidr: "169.254.88.213/16", mtu: 1500 },
    ],
    routes: [{ destination: "169.254.0.0/16", dev: "enp3s0", proto: "kernel", metric: 1000 }],
    neighbours: [],
    dns: { servers: ["10.20.0.1"], reachable: false, zones: {} },
    remotes: {},
    root: dir({
      etc: dir({
        hostname: file("ws-fin-04\n"),
        "resolv.conf": file("nameserver 10.20.0.1\nsearch office.example\n"),
        hosts: file("127.0.0.1 localhost\n127.0.1.1 ws-fin-04\n"),
      }),
      var: dir({
        log: dir({
          journal: dir({
            "systemd-networkd.log": file(
              [
                "Sep 02 08:58:11 ws-fin-04 systemd-networkd[621]: enp3s0: Link UP",
                "Sep 02 08:58:11 ws-fin-04 systemd-networkd[621]: enp3s0: Gained carrier",
                "Sep 02 08:58:12 ws-fin-04 systemd-networkd[621]: enp3s0: DHCPv4 DISCOVER sent",
                "Sep 02 08:58:17 ws-fin-04 systemd-networkd[621]: enp3s0: DHCPv4 DISCOVER sent (retry 1)",
                "Sep 02 08:58:27 ws-fin-04 systemd-networkd[621]: enp3s0: DHCPv4 DISCOVER sent (retry 2)",
                "Sep 02 08:58:47 ws-fin-04 systemd-networkd[621]: enp3s0: DHCPv4 no reply, giving up",
                "Sep 02 08:58:47 ws-fin-04 systemd-networkd[621]: enp3s0: Configuring link-local address",
                "",
              ].join("\n"),
            ),
          }),
        }),
      }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
    }),
    processes: [
      { pid: 1, user: "root", cpu: 0.0, mem: 0.3, rss: 12408, stat: "Ss", start: "08:58", time: "0:01", command: "/sbin/init" },
      { pid: 621, user: "systemd-network", cpu: 0.0, mem: 0.1, rss: 6104, stat: "Ssl", start: "08:58", time: "0:00", command: "/lib/systemd/systemd-networkd" },
    ],
    services: [
      {
        name: "systemd-networkd",
        state: "active",
        sub: "running",
        since: "Wed 2026-09-02 08:58:11 UTC",
        enabled: true,
        detail: ["   Status: \"Processing requests...\"", "    Tasks: 1 (limit: 4657)"],
      },
    ],
  });

const lab1: Lab = {
  slug: "no-address",
  title: "The Address That Is Not an Address",
  tagline: "Full link, correct cable, and nothing works. Say why in one sentence.",
  difficulty: "easy",
  brief: [
    "A finance workstation cannot reach anything. The cable is in, the switch port light is on, and the user swears nothing changed.",
    "Look at the machine and say what is wrong. Use `answer` when you know.",
  ],
  hints: [
    "Start with the interface. What address does it have?",
    "169.254.0.0/16 is not an address anybody assigned. Which service assigns addresses?",
    "systemd-networkd logs what it tried. `journalctl -u systemd-networkd` or read /var/log/journal directly.",
  ],
  build: linkLocal,
  solved: (m) =>
    answered(m, ["dhcp"], ["no reply", "no answer", "not answer", "did not answer", "timed out", "no response", "failed", "no dhcp"]) ||
    answered(m, ["dhcp"], ["169.254", "link-local", "link local", "apipa"]),
  debrief: [
    "The interface has a 169.254.0.0/16 address, which no administrator ever assigns. It is what the operating system gives itself when a DHCP DISCOVER goes unanswered, and it is a complete diagnosis on its own.",
    "It rules out the cable (the link is up and carrier was gained), the switch port, the driver, and the DNS server, in one line. The fault is that nothing answered DHCP: an exhausted scope, a dead relay, or a port in the wrong VLAN.",
    "The journal spells it out: three DISCOVERs, no reply, then a link-local address.",
  ],
  solution: [
    "ip -br addr",
    "ip route",
    "journalctl -u systemd-networkd -n 10",
    "answer DHCP did not answer, so the host gave itself a 169.254 link-local address",
  ],
  reading: [
    { label: "DHCP snooping and dynamic ARP inspection", href: "/blog/dhcp-snooping-arp-inspection" },
    { label: "Subnetting, practically", href: "/blog/subnetting-practical-guide" },
  ],
};

/* ==========================================================================
   2. Which process is holding the port
   ========================================================================== */

const portHeld = (): Machine =>
  baseMachine({
    hostname: "app-02",
    user: "student",
    groups: ["student", "sudo"],
    interfaces: [
      { name: "lo", up: true, mac: "00:00:00:00:00:00", cidr: "127.0.0.1/8", mtu: 65536 },
      { name: "ens5", up: true, mac: "0a:44:12:9c:31:02", cidr: "10.30.2.14/24", mtu: 1500 },
    ],
    routes: [
      { destination: "default", via: "10.30.2.1", dev: "ens5", proto: "static" },
      { destination: "10.30.2.0/24", dev: "ens5", proto: "kernel", src: "10.30.2.14" },
    ],
    sockets: [
      { proto: "tcp", state: "LISTEN", local: "0.0.0.0:22", peer: "0.0.0.0:*", pid: 780, process: "sshd" },
      { proto: "tcp", state: "LISTEN", local: "127.0.0.1:5432", peer: "0.0.0.0:*", pid: 912, process: "postgres" },
      { proto: "tcp", state: "LISTEN", local: "0.0.0.0:8080", peer: "0.0.0.0:*", pid: 3341, process: "python3" },
      { proto: "tcp", state: "ESTAB", local: "10.30.2.14:22", peer: "10.30.2.9:51422", pid: 780, process: "sshd" },
    ],
    processes: [
      { pid: 780, user: "root", cpu: 0.0, mem: 0.2, rss: 9104, stat: "Ss", start: "Aug30", time: "0:02", command: "/usr/sbin/sshd -D" },
      { pid: 912, user: "postgres", cpu: 0.4, mem: 4.1, rss: 161204, stat: "Ss", start: "Aug30", time: "3:11", command: "/usr/lib/postgresql/16/bin/postgres" },
      { pid: 3341, user: "mgarcia", cpu: 0.0, mem: 0.6, rss: 24880, stat: "S", start: "14:02", time: "0:00", command: "python3 -m http.server 8080" },
      { pid: 4110, user: "deploy", cpu: 0.0, mem: 1.8, rss: 71208, stat: "S", start: "14:20", time: "0:00", command: "/usr/bin/node /srv/checkout/server.js" },
    ],
    services: [
      {
        name: "checkout",
        state: "failed",
        sub: "failed",
        since: "Wed 2026-09-02 14:20:41 UTC",
        enabled: true,
        detail: [
          "    Process: 4110 ExecStart=/usr/bin/node /srv/checkout/server.js (code=exited, status=1)",
          "   Main PID: 4110 (code=exited, status=1/FAILURE)",
        ],
      },
    ],
    root: dir({
      etc: dir({ hostname: file("app-02\n") }),
      srv: dir({ checkout: dir({ "server.js": file("// the checkout service\n") }) }),
      var: dir({
        log: dir({
          journal: dir({
            "checkout.log": file(
              [
                "Sep 02 14:20:40 app-02 systemd[1]: Starting checkout.service...",
                "Sep 02 14:20:41 app-02 node[4110]: Error: listen EADDRINUSE: address already in use 0.0.0.0:8080",
                "Sep 02 14:20:41 app-02 node[4110]:     at Server.setupListenHandle [as _listen2]",
                "Sep 02 14:20:41 app-02 systemd[1]: checkout.service: Main process exited, code=exited, status=1/FAILURE",
                "Sep 02 14:20:41 app-02 systemd[1]: checkout.service: Failed with result 'exit-code'.",
                "",
              ].join("\n"),
            ),
          }),
        }),
      }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
    }),
  });

const lab2: Lab = {
  slug: "port-already-in-use",
  title: "Address Already in Use",
  tagline: "The checkout service will not start. Something else has its port.",
  difficulty: "easy",
  brief: [
    "checkout.service failed at 14:20 and will not come back. Find out what is holding port 8080 and who owns it.",
    "Answer with the process name and the user.",
  ],
  hints: [
    "The service wrote why it failed. journalctl knows.",
    "`ss -tlnp` lists listening TCP sockets and the process on each one.",
    "Cross-reference the pid against `ps aux`. Whose process is it?",
  ],
  build: portHeld,
  solved: (m) => answered(m, ["python", "http.server", "3341"], ["mgarcia"]),
  debrief: [
    "A python3 -m http.server started by mgarcia at 14:02 is bound to 0.0.0.0:8080. checkout.service tried to bind the same port at 14:20 and exited with EADDRINUSE.",
    "`ss -tlnp` is the command worth remembering: t for TCP, l for listening, n for numeric ports, p for the owning process. The pid it prints is what you take to `ps`.",
    "Note that ss only shows you the process for sockets you own unless you are root, which is why the same command run as a normal user on a real box often shows a blank Process column.",
  ],
  solution: [
    "systemctl status checkout",
    "journalctl -u checkout -n 10",
    "ss -tlnp",
    "ps aux | grep 8080",
    "answer python3 http.server run by mgarcia, pid 3341, is holding 8080",
  ],
  reading: [{ label: "Hardening a Linux server", href: "/blog/linux-server-hardening" }],
};

/* ==========================================================================
   3. The route that looks right
   ========================================================================== */

const wrongRoute = (): Machine =>
  baseMachine({
    hostname: "branch-gw",
    interfaces: [
      { name: "lo", up: true, mac: "00:00:00:00:00:00", cidr: "127.0.0.1/8", mtu: 65536 },
      { name: "eth0", up: true, mac: "52:54:00:1a:2b:3c", cidr: "10.10.0.2/24", mtu: 1500 },
      { name: "eth1", up: true, mac: "52:54:00:1a:2b:3d", cidr: "192.168.50.1/24", mtu: 1500 },
      { name: "wg0", up: true, mac: "00:00:00:00:00:01", cidr: "172.16.9.2/30", mtu: 1420 },
    ],
    routes: [
      { destination: "default", via: "10.10.0.1", dev: "eth0", proto: "static", metric: 100 },
      { destination: "10.10.0.0/24", dev: "eth0", proto: "kernel", src: "10.10.0.2" },
      { destination: "192.168.50.0/24", dev: "eth1", proto: "kernel", src: "192.168.50.1" },
      { destination: "172.16.9.0/30", dev: "wg0", proto: "kernel", src: "172.16.9.2" },
      { destination: "10.0.0.0/8", via: "172.16.9.1", dev: "wg0", proto: "static", metric: 50 },
      { destination: "10.44.0.0/16", via: "10.10.0.1", dev: "eth0", proto: "static", metric: 50 },
    ],
    neighbours: [
      { ip: "10.10.0.1", dev: "eth0", mac: "52:54:00:aa:bb:01", state: "REACHABLE" },
      { ip: "172.16.9.1", dev: "wg0", state: "REACHABLE" },
    ],
    remotes: {
      "10.44.7.20": { ip: "10.44.7.20", pingable: false, filteredPorts: [443, 22] },
      "10.60.1.5": { ip: "10.60.1.5", pingable: true, rtt: 24.1, openPorts: [443] },
    },
    dns: {
      servers: ["10.10.0.1"],
      reachable: true,
      zones: {
        "files.hq.example": [{ type: "A", ttl: 300, value: "10.44.7.20" }],
        "wiki.hq.example": [{ type: "A", ttl: 300, value: "10.60.1.5" }],
      },
    },
    root: dir({
      etc: dir({ hostname: file("branch-gw\n") }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
      var: dir({ log: dir({ journal: dir({}) }) }),
    }),
  });

const lab3: Lab = {
  slug: "longest-prefix",
  title: "Two Routes to Head Office",
  tagline: "The wiki works over the tunnel. The file server does not. Both are at head office.",
  difficulty: "medium",
  brief: [
    "This branch gateway reaches head office over a WireGuard tunnel. wiki.hq.example works. files.hq.example does not.",
    "Both are 10-dot addresses at head office. Work out why one goes over the tunnel and the other does not, and say which route is responsible.",
  ],
  hints: [
    "Resolve both names first. What addresses are they?",
    "`ip route get ADDRESS` tells you which route the kernel would actually pick, rather than making you read the table top to bottom.",
    "Longest prefix wins, whatever the metric says. Compare the two routes that could match.",
  ],
  build: wrongRoute,
  solved: (m) =>
    answered(m, ["10.44.0.0/16", "10.44/16", "/16"], ["eth0", "10.10.0.1", "internet", "default gateway", "wan"]) ||
    answered(m, ["longest prefix", "more specific", "specific"], ["10.44"]),
  debrief: [
    "files.hq.example is 10.44.7.20. Two routes match it: 10.0.0.0/8 via the tunnel, and 10.44.0.0/16 via eth0 to the internet gateway. The /16 is longer, so it wins, and the traffic leaves over the WAN where it is dropped.",
    "wiki.hq.example is 10.60.1.5, which only the /8 matches, so it goes over the tunnel and works.",
    "Both static routes have metric 50. Metric only breaks ties between routes of the same prefix length, which is the part people expect to matter and does not. `ip route get` settles the argument in one command.",
  ],
  solution: [
    "dig +short files.hq.example",
    "dig +short wiki.hq.example",
    "ip route",
    "ip route get 10.44.7.20",
    "ip route get 10.60.1.5",
    "answer the 10.44.0.0/16 route via eth0 is more specific than 10.0.0.0/8, so longest prefix sends it out the internet gateway instead of the tunnel",
  ],
  reading: [
    { label: "Subnetting, practically", href: "/blog/subnetting-practical-guide" },
    { label: "CIDR visualiser", href: "/tools/cidr-visualizer" },
  ],
};

/* ==========================================================================
   4. Permissions
   ========================================================================== */

const permissions = (): Machine =>
  baseMachine({
    hostname: "web-01",
    user: "student",
    root: dir({
      etc: dir({ hostname: file("web-01\n") }),
      var: dir({
        www: dir({
          reports: dir(
            {
              "index.html": file("<h1>Reports</h1>\n", 0o644, "www-data", "www-data"),
              "q3.csv": file("region,total\nnorth,41022\nsouth,38110\n", 0o640, "root", "root"),
              "q4.csv": file("region,total\nnorth,44190\nsouth,39002\n", 0o644, "www-data", "www-data"),
              archive: dir({}, 0o700, "root", "root"),
            },
            0o755,
            "www-data",
            "www-data",
          ),
        }),
        log: dir({
          journal: dir({
            "nginx.log": file(
              [
                'Sep 02 10:14:02 web-01 nginx[1102]: 2026/09/02 10:14:02 [error] open() "/var/www/reports/q3.csv" failed (13: Permission denied), client: 10.30.2.9, request: "GET /reports/q3.csv HTTP/1.1"',
                'Sep 02 10:14:44 web-01 nginx[1102]: 2026/09/02 10:14:44 [error] open() "/var/www/reports/q3.csv" failed (13: Permission denied), client: 10.30.2.9',
                "",
              ].join("\n"),
            ),
          }),
        }),
      }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
    }),
    processes: [
      { pid: 1102, user: "www-data", cpu: 0.0, mem: 0.4, rss: 15220, stat: "S", start: "Aug30", time: "0:11", command: "nginx: worker process" },
    ],
  });

const lab4: Lab = {
  slug: "permission-denied",
  title: "One File Out of Four",
  tagline: "The web server serves three files and refuses the fourth. Fix it, without opening the archive.",
  difficulty: "easy",
  brief: [
    "nginx runs as www-data. It serves /var/www/reports fine except for q3.csv, which returns 403.",
    "Make q3.csv readable by the web server, and leave everything else exactly as it is. The archive directory is deliberately private and must stay that way.",
  ],
  hints: [
    "`ls -l /var/www/reports` and compare the file that works with the one that does not.",
    "Two things differ: the owner and the mode. Which one can you change from here?",
    "chmod takes symbolic modes: o+r adds read for everyone else. The file is owned by root, so you will need sudo.",
  ],
  build: permissions,
  solved: (m) => {
    const reports = m.root.children?.var?.children?.www?.children?.reports?.children;
    const q3 = reports?.["q3.csv"];
    const archive = reports?.archive;
    return Boolean(q3 && (q3.mode & 0o004) !== 0 && archive && archive.mode === 0o700);
  },
  debrief: [
    "q3.csv was mode 0640 owned by root:root. nginx runs as www-data, which is neither the owner nor in the group, so it falls to the other bits, and those were empty.",
    "q4.csv works because it is 0644 and owned by www-data. Comparing the file that works with the file that does not is nearly always faster than reasoning about permissions from first principles.",
    "The archive directory being 0700 root-owned is the control that was supposed to be there, which is why the lab asks you to leave it alone: the reflex fix of `sudo chmod -R 755` on the parent would have opened it.",
  ],
  solution: [
    "ls -l /var/www/reports",
    "journalctl -u nginx -n 5",
    "sudo chmod o+r /var/www/reports/q3.csv",
    "ls -l /var/www/reports",
  ],
  reading: [{ label: "Hardening a Linux server", href: "/blog/linux-server-hardening" }],
};

/* ==========================================================================
   5. Reading a log for the line that matters
   ========================================================================== */

const authLog = (): Machine => {
  const lines: string[] = [];
  const stamp = (h: number, m: number, s: number) =>
    `Sep  2 ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  // Ordinary noise: a cron job and a couple of real logins.
  for (let i = 0; i < 6; i++) {
    lines.push(`${stamp(1, 5 + i * 10, 1)} vps-04 CRON[${2000 + i}]: pam_unix(cron:session): session opened for user root by (uid=0)`);
  }
  // The brute force: 214 failures from one address, then one success.
  const users = ["root", "admin", "ubuntu", "test", "oracle", "postgres", "git", "deploy"];
  for (let i = 0; i < 214; i++) {
    const minute = 12 + Math.floor(i / 12);
    lines.push(
      `${stamp(3, minute % 60, (i * 7) % 60)} vps-04 sshd[${3100 + i}]: Failed password for ${
        i % 9 === 0 ? "invalid user " : ""
      }${users[i % users.length]} from 185.220.101.44 port ${40000 + i} ssh2`,
    );
  }
  lines.push(`${stamp(3, 31, 12)} vps-04 sshd[3402]: Accepted password for deploy from 185.220.101.44 port 55210 ssh2`);
  lines.push(`${stamp(3, 31, 12)} vps-04 sshd[3402]: pam_unix(sshd:session): session opened for user deploy by (uid=0)`);
  lines.push(`${stamp(3, 33, 40)} vps-04 sudo:   deploy : TTY=pts/0 ; PWD=/home/deploy ; USER=root ; COMMAND=/usr/bin/apt install -y xmrig`);
  lines.push(`${stamp(9, 2, 11)} vps-04 sshd[5120]: Accepted publickey for student from 10.30.2.9 port 51422 ssh2`);

  return baseMachine({
    hostname: "vps-04",
    root: dir({
      etc: dir({ hostname: file("vps-04\n") }),
      var: dir({
        log: dir({
          "auth.log": file(lines.join("\n") + "\n", 0o640, "syslog", "adm"),
          journal: dir({}),
        }),
      }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
    }),
  });
};

const lab5: Lab = {
  slug: "one-line-in-two-hundred",
  title: "One Line in Two Hundred",
  tagline: "A brute force against SSH. One attempt succeeded. Find which account.",
  difficulty: "medium",
  brief: [
    "/var/log/auth.log covers one night on an internet-facing VPS. There is a great deal of failed authentication in it and one success that should worry you.",
    "Find the account that was compromised and say what happened next.",
  ],
  hints: [
    "auth.log is 0640 syslog:adm, so you will need sudo to read it.",
    "grep for 'Failed password' to see the scale, then for 'Accepted' to see what got through.",
    "There is more than one Accepted line. One is a password from the same address as all the failures; one is a publickey from an internal address.",
    "Look at what that session did immediately afterwards. sudo logs its commands.",
  ],
  build: authLog,
  solved: (m) => answered(m, ["deploy"], ["xmrig", "miner", "mining", "apt install", "sudo"]),
  debrief: [
    "214 failed passwords from 185.220.101.44 across eight usernames, then one Accepted password for deploy from the same address at 03:31:12. Two minutes later that session ran sudo apt install -y xmrig.",
    "The other Accepted line is a publickey login for student from an internal address, which is what a legitimate login looks like: different auth method, different source, different time of day.",
    "The technique worth keeping: count the failures to establish the shape, then search for successes from the same source. `grep Accepted` on its own gives you every login including the real ones.",
    "Note why the field-splitting approach is fragile here. `awk '{print $11}'` gets the address on most of these lines and the wrong field on the ones that say 'invalid user', because those shift everything along by two. `grep -oE 'from [0-9.]+'` does not care about position.",
  ],
  solution: [
    "ls -l /var/log/auth.log",
    "sudo grep -c 'Failed password' /var/log/auth.log",
    "sudo grep 'Failed password' /var/log/auth.log | grep -oE 'from [0-9.]+' | sort | uniq -c | sort -rn",
    "sudo grep Accepted /var/log/auth.log",
    "sudo grep sudo /var/log/auth.log",
    "answer deploy was compromised by password brute force from 185.220.101.44 and used sudo to apt install xmrig",
  ],
  reading: [
    { label: "Log analysis when you do not know what you are looking for", href: "/blog/log-analysis-methodology" },
    { label: "SSH key based authentication", href: "/blog/ssh-key-based-authentication" },
  ],
};

/* ==========================================================================
   6. DNS that answers, wrongly
   ========================================================================== */

const staleDns = (): Machine =>
  baseMachine({
    hostname: "ws-eng-11",
    interfaces: [
      { name: "lo", up: true, mac: "00:00:00:00:00:00", cidr: "127.0.0.1/8", mtu: 65536 },
      { name: "enp1s0", up: true, mac: "3c:58:c2:aa:0b:19", cidr: "10.20.5.61/24", mtu: 1500 },
    ],
    routes: [
      { destination: "default", via: "10.20.5.1", dev: "enp1s0", proto: "dhcp" },
      { destination: "10.20.5.0/24", dev: "enp1s0", proto: "kernel", src: "10.20.5.61" },
    ],
    neighbours: [{ ip: "10.20.5.1", dev: "enp1s0", mac: "52:54:00:ab:cd:01", state: "REACHABLE" }],
    dns: {
      servers: ["10.20.0.53"],
      reachable: true,
      zones: {
        "app.northgate.example": [{ type: "A", ttl: 79204, value: "198.51.100.40" }],
        "ns1.northgate.example": [{ type: "A", ttl: 3600, value: "203.0.113.10" }],
      },
      authoritative: {
        "app.northgate.example": [{ type: "A", ttl: 300, value: "203.0.113.90" }],
        "ns1.northgate.example": [{ type: "A", ttl: 3600, value: "203.0.113.10" }],
      },
    },
    remotes: {
      "198.51.100.40": {
        ip: "198.51.100.40",
        pingable: true,
        rtt: 1.9,
        openPorts: [80, 443],
        http: {
          "/": { status: 200, statusText: "OK", headers: { Server: "nginx", "X-App-Build": "2026-08-30-a91f" }, body: "old" },
        },
      },
      "203.0.113.90": {
        ip: "203.0.113.90",
        pingable: true,
        rtt: 2.4,
        openPorts: [80, 443],
        http: {
          "/": { status: 200, statusText: "OK", headers: { Server: "nginx", "X-App-Build": "2026-09-02-4c81" }, body: "new" },
        },
      },
      "203.0.113.10": { ip: "203.0.113.10", pingable: true, rtt: 8.1, openPorts: [53] },
    },
    root: dir({
      etc: dir({
        hostname: file("ws-eng-11\n"),
        "resolv.conf": file("nameserver 10.20.0.53\nsearch office.example\n"),
        hosts: file("127.0.0.1 localhost\n127.0.1.1 ws-eng-11\n"),
      }),
      var: dir({ log: dir({ journal: dir({}) }) }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
    }),
  });

const lab6: Lab = {
  slug: "the-resolver-disagrees",
  title: "The Resolver Disagrees",
  tagline: "The app was migrated this morning. This machine is still talking to the old server.",
  difficulty: "medium",
  brief: [
    "app.northgate.example moved to a new host at 09:00. Your machine still reaches the old one, and the changes you save keep vanishing.",
    "Prove where the wrong answer is coming from, and say why it will not fix itself soon.",
  ],
  hints: [
    "Ask your configured resolver, then ask the authoritative server directly with `dig @ns`.",
    "Compare the two answers. Which one matches the new host?",
    "Look at the TTL on the answer your resolver gives you. How long is it entitled to keep it?",
  ],
  build: staleDns,
  solved: (m) =>
    answered(m, ["cache", "cached", "stale", "ttl"], ["10.20.0.53", "resolver", "local", "internal", "office"]) ||
    answered(m, ["ttl"], ["86400", "79204", "day", "24 h", "long"]),
  debrief: [
    "Your resolver at 10.20.0.53 answers 198.51.100.40 with a TTL of 79,204 seconds remaining. The authoritative server answers 203.0.113.90. The resolver cached the old record before the change, when the TTL was still 86,400.",
    "Lowering a TTL only affects answers handed out after the change. A resolver that fetched the record the day before is entitled to hold it for the full original day, which is why 'we lowered the TTL an hour before' does not work.",
    "curl -I on both addresses settles it: the X-App-Build header differs, so you can prove which host you reached without trusting the name at all.",
  ],
  solution: [
    "dig app.northgate.example",
    "dig @203.0.113.10 app.northgate.example",
    "curl -I http://198.51.100.40/",
    "curl -I http://203.0.113.90/",
    "answer the local resolver 10.20.0.53 has a stale cached A record with a TTL of about 79000 seconds left",
  ],
  reading: [
    { label: "DNS fundamentals", href: "/blog/dns-fundamentals-infrastructure" },
    { label: "Negative caching", href: "/blog/dns-negative-caching" },
    { label: "DNS record reference", href: "/tools/dns-records" },
  ],
};

export const LABS: Lab[] = [lab1, lab4, lab2, lab3, lab5, lab6];

export const getLab = (slug: string): Lab | undefined => LABS.find((lab) => lab.slug === slug);

export const LAB_ORDER: LabDifficulty[] = ["easy", "medium", "hard"];
