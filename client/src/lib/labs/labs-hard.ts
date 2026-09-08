/**
 * The harder labs.
 *
 * The distinguishing feature of a hard lab here is not more commands, it is
 * that the obvious measurement says everything is fine. Each of these has a
 * signal that looks healthy and a second measurement that does not, and the
 * skill being practised is knowing the second one exists.
 */

import { baseMachine, type Machine } from "./machine";
import { dir, file } from "./vfs";
import type { Lab } from "./labs";

const answered = (machine: Machine, ...terms: string[][]): boolean =>
  machine.answers.some((raw) => {
    const text = raw.toLowerCase();
    return terms.every((alternatives) => alternatives.some((term) => text.includes(term)));
  });

/* ==========================================================================
   Inodes: df says there is space, and there is not
   ========================================================================== */

const inodes = (): Machine => {
  const cache: Record<string, ReturnType<typeof file>> = {};
  for (let i = 0; i < 40; i++) {
    cache[`sess_${i.toString(16).padStart(26, "0")}`] = file("", 0o600, "www-data", "www-data");
  }
  return baseMachine({
    hostname: "web-03",
    disks: [
      { filesystem: "/dev/vda1", sizeMb: 80000, usedMb: 24000, mount: "/" },
      { filesystem: "tmpfs", sizeMb: 1962, usedMb: 2, mount: "/run" },
    ],
    root: dir({
      etc: dir({ hostname: file("web-03\n") }),
      var: dir({
        lib: dir({ php: dir({ sessions: dir(cache, 0o733, "root", "root") }) }),
        log: dir({
          journal: dir({
            "php-fpm.log": file(
              [
                "Sep 02 11:02:41 web-03 php-fpm[1204]: WARNING: failed to open session file: No space left on device",
                "Sep 02 11:02:41 web-03 php-fpm[1204]: WARNING: session_start(): Failed to write session data",
                "Sep 02 11:03:02 web-03 php-fpm[1204]: WARNING: failed to open session file: No space left on device",
                "",
              ].join("\n"),
            ),
            "cron.log": file(
              [
                "Sep 02 03:00:01 web-03 CRON[900]: (root) CMD (/usr/local/bin/clean-sessions.sh)",
                "Sep 02 03:00:01 web-03 CRON[900]: (root) MAIL (mailed 1 byte of output)",
                "Sep 02 03:00:01 web-03 clean-sessions[901]: find: '/var/lib/php/session': No such file or directory",
                "",
              ].join("\n"),
            ),
          }),
        }),
      }),
      usr: dir({
        local: dir({
          bin: dir({
            "clean-sessions.sh": file(
              "#!/bin/sh\n# nightly session cleanup\nfind /var/lib/php/session -type f -mmin +120 -delete\n",
              0o755,
            ),
          }),
        }),
      }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
    }),
    processes: [
      { pid: 1204, user: "www-data", cpu: 1.1, mem: 2.2, rss: 88104, stat: "S", start: "Aug30", time: "1:44", command: "php-fpm: pool www" },
    ],
    services: [
      {
        name: "php8.3-fpm",
        state: "active",
        sub: "running",
        since: "Sat 2026-08-30 04:11:02 UTC",
        enabled: true,
        detail: ["   Status: \"Processes active: 4, idle: 6, Requests: 91204\""],
      },
    ],
  });
};

export const inodeLab: Lab = {
  slug: "space-that-is-not-space",
  title: "No Space Left on a Disk That Is Two Thirds Empty",
  tagline: "df says 30 percent used. The application says the disk is full. Both are right.",
  difficulty: "hard",
  brief: [
    "web-03 cannot write PHP sessions. The error is 'No space left on device' and df shows 24GB of 80GB used.",
    "Work out what has actually run out, and why the nightly job that was supposed to prevent it has not been doing anything since it was written. Say both.",
  ],
  hints: [
    "df measures blocks. There is a second thing a filesystem can run out of, and df has a flag for it.",
    "Something is creating a great many very small files. Look for the directory with an implausible number of entries. It is mode 0733, so you will need sudo to list it.",
    "There is a cleanup script and a cron log. Read the cron log rather than the script: it says what happened, not what was intended.",
  ],
  build: inodes,
  solved: (m) =>
    answered(m, ["inode"], ["path", "wrong", "session", "typo", "does not exist", "no such", "/var/lib/php/session", "singular", "plural"]),
  debrief: [
    "The filesystem has run out of inodes, not blocks. Every file consumes one inode regardless of size, and forty thousand empty session files consume forty thousand of them while consuming almost no space. `df -i` is the second measurement.",
    "The cleanup script points at /var/lib/php/session. The sessions actually live in /var/lib/php/sessions. The script has been logging 'No such file or directory' at three in the morning every night since it was written, and cron mailed that output to a local mailbox nobody reads.",
    "Both halves matter. Deleting the files buys a night; fixing the path stops it. A monitor on inode usage would have caught it either way, which is why `df -i` belongs on the same dashboard as `df`.",
  ],
  solution: [
    "df -h",
    "journalctl -u php8.3-fpm -n 5",
    "sudo ls /var/lib/php/sessions | wc -l",
    "cat /usr/local/bin/clean-sessions.sh",
    "cat /var/log/journal/cron.log",
    "answer inodes are exhausted, and the cleanup script uses /var/lib/php/session which does not exist, the sessions are in /var/lib/php/sessions",
  ],
  reading: [
    { label: "Disk I/O troubleshooting on Linux", href: "/blog/linux-disk-io-troubleshooting" },
    { label: "Filesystem journals, explained", href: "/blog/filesystem-journal-explained" },
  ],
};

/* ==========================================================================
   MTU: the connection that works until it carries data
   ========================================================================== */

const mtu = (): Machine =>
  baseMachine({
    hostname: "branch-01",
    interfaces: [
      { name: "lo", up: true, mac: "00:00:00:00:00:00", cidr: "127.0.0.1/8", mtu: 65536 },
      { name: "ens3", up: true, mac: "52:54:00:6b:1e:02", cidr: "10.90.1.20/24", mtu: 1500 },
      { name: "wg0", up: true, mac: "00:00:00:00:00:01", cidr: "172.31.0.2/30", mtu: 1500 },
    ],
    routes: [
      { destination: "default", via: "10.90.1.1", dev: "ens3", proto: "static" },
      { destination: "10.90.1.0/24", dev: "ens3", proto: "kernel", src: "10.90.1.20" },
      { destination: "172.31.0.0/30", dev: "wg0", proto: "kernel", src: "172.31.0.2" },
      { destination: "10.200.0.0/16", via: "172.31.0.1", dev: "wg0", proto: "static" },
    ],
    neighbours: [
      { ip: "10.90.1.1", dev: "ens3", mac: "52:54:00:aa:11:01", state: "REACHABLE" },
      { ip: "172.31.0.1", dev: "wg0", state: "REACHABLE" },
    ],
    dns: {
      servers: ["10.200.0.53"],
      reachable: true,
      zones: {
        "erp.hq.example": [{ type: "A", ttl: 300, value: "10.200.4.10" }],
      },
    },
    remotes: {
      "10.200.4.10": {
        ip: "10.200.4.10",
        pingable: true,
        rtt: 14.2,
        openPorts: [443, 22],
        http: {
          "/health": {
            status: 200,
            statusText: "OK",
            headers: { Server: "nginx", "Content-Length": "2" },
            body: "ok",
          },
        },
      },
      "172.31.0.1": { ip: "172.31.0.1", pingable: true, rtt: 13.9 },
    },
    root: dir({
      etc: dir({
        hostname: file("branch-01\n"),
        wireguard: dir(
          {
            "wg0.conf": file(
              [
                "[Interface]",
                "Address = 172.31.0.2/30",
                "PrivateKey = <redacted>",
                "# MTU not set",
                "",
                "[Peer]",
                "PublicKey = <redacted>",
                "Endpoint = 203.0.113.8:51820",
                "AllowedIPs = 10.200.0.0/16, 172.31.0.0/30",
                "PersistentKeepalive = 25",
                "",
              ].join("\n"),
              0o600,
              "root",
              "root",
            ),
          },
          0o700,
          "root",
          "root",
        ),
      }),
      var: dir({
        log: dir({
          journal: dir({
            "erp-client.log": file(
              [
                "Sep 02 09:14:02 branch-01 erp-client[2210]: GET /health 200 in 29ms",
                "Sep 02 09:14:11 branch-01 erp-client[2210]: GET /api/orders?page=1 ... connection timed out after 30s",
                "Sep 02 09:15:44 branch-01 erp-client[2210]: GET /health 200 in 28ms",
                "Sep 02 09:16:02 branch-01 erp-client[2210]: POST /api/orders ... connection timed out after 30s",
                "Sep 02 09:18:30 branch-01 erp-client[2210]: GET /api/orders?page=1&limit=1 200 in 41ms",
                "",
              ].join("\n"),
            ),
          }),
        }),
      }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
    }),
  });

export const mtuLab: Lab = {
  slug: "works-until-it-carries-data",
  title: "Works Until It Carries Data",
  tagline: "Ping is fine. The health check is fine. Any response over about 1400 bytes hangs.",
  difficulty: "hard",
  brief: [
    "The branch office reaches the ERP system over a WireGuard tunnel. Small requests work perfectly. Anything that returns a real page hangs for thirty seconds and times out.",
    "Every obvious test passes. Work out what is wrong and say which setting is missing.",
  ],
  hints: [
    "Notice which requests succeed. /health returns two bytes. /api/orders?limit=1 works. The full page does not.",
    "The tunnel adds a header to every packet. What does that do to the largest payload that still fits?",
    "Look at the MTU on wg0 against the MTU on the interface it runs over, and then at the config file.",
  ],
  build: mtu,
  solved: (m) =>
    answered(m, ["mtu"], ["wg0", "tunnel", "wireguard"]) ||
    answered(m, ["mtu", "fragment", "1420", "1500"], ["overhead", "encapsulat", "header", "too big", "same as", "1500"]),
  debrief: [
    "wg0 has an MTU of 1500, the same as the physical interface it runs over. WireGuard adds 60 bytes of its own headers to every packet, so a full-size 1500 byte packet becomes 1560 on the wire and has to be fragmented or dropped.",
    "Small responses fit inside the reduced payload and work. Anything that fills a packet does not, which is why ping, the health check and a one-row query all pass while the actual application hangs. This is the classic MTU black hole and it is designed to look like a working link.",
    "The fix is one line: MTU = 1420 in the [Interface] section, which is the usual figure for WireGuard over IPv4 with a 1500 byte path. The comment in the config even says it is not set.",
  ],
  solution: [
    "ping -c 2 erp.hq.example",
    "curl -s http://10.200.4.10/health",
    "journalctl -u erp-client -n 6",
    "ip link",
    "sudo cat /etc/wireguard/wg0.conf",
    "answer wg0 has MTU 1500, the same as the underlying link, so WireGuard's own header overhead makes full size packets too big. MTU should be 1420",
  ],
  reading: [
    { label: "Subnetting, practically", href: "/blog/subnetting-practical-guide" },
    { label: "Packet header reference", href: "/tools/packet-headers" },
  ],
};

/* ==========================================================================
   Clock skew
   ========================================================================== */

const clockSkew = (): Machine =>
  baseMachine({
    hostname: "app-07",
    env: {
      HOME: "/home/student",
      USER: "student",
      SHELL: "/bin/bash",
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      LANG: "en_GB.UTF-8",
      TERM: "xterm-256color",
      LAB_DATE: "Wed  2 Sep 06:53:41 UTC 2026",
    },
    interfaces: [
      { name: "lo", up: true, mac: "00:00:00:00:00:00", cidr: "127.0.0.1/8", mtu: 65536 },
      { name: "ens5", up: true, mac: "0a:11:04:9c:31:44", cidr: "10.30.9.7/24", mtu: 1500 },
    ],
    routes: [
      { destination: "default", via: "10.30.9.1", dev: "ens5", proto: "dhcp" },
      { destination: "10.30.9.0/24", dev: "ens5", proto: "kernel", src: "10.30.9.7" },
    ],
    sockets: [
      { proto: "udp", state: "UNCONN", local: "0.0.0.0:68", peer: "0.0.0.0:*", pid: 610, process: "dhclient" },
    ],
    services: [
      {
        name: "chrony",
        state: "failed",
        sub: "failed",
        since: "Mon 2026-08-24 02:14:08 UTC",
        enabled: true,
        detail: [
          "    Process: 702 ExecStart=/usr/sbin/chronyd (code=exited, status=1/FAILURE)",
          "   Main PID: 702 (code=exited, status=1/FAILURE)",
        ],
      },
      {
        name: "app",
        state: "active",
        sub: "running",
        since: "Wed 2026-09-02 06:02:11 UTC",
        enabled: true,
        detail: ["   Status: \"serving\""],
      },
    ],
    root: dir({
      etc: dir({
        hostname: file("app-07\n"),
        "chrony.conf": file("pool ntp.internal.example iburst\nmakestep 1.0 3\nrtcsync\n"),
      }),
      var: dir({
        log: dir({
          journal: dir({
            "chrony.log": file(
              [
                "Aug 24 02:14:08 app-07 chronyd[702]: chronyd version 4.5 starting",
                "Aug 24 02:14:08 app-07 chronyd[702]: Could not resolve pool ntp.internal.example",
                "Aug 24 02:14:08 app-07 chronyd[702]: Fatal error : No suitable time source",
                "Aug 24 02:14:08 app-07 systemd[1]: chrony.service: Failed with result 'exit-code'.",
                "",
              ].join("\n"),
            ),
            "app.log": file(
              [
                "Sep 02 06:02:11 app-07 app[3110]: starting, oidc discovery ok",
                "Sep 02 06:04:40 app-07 app[3110]: oidc: token validation failed: token used before issued (iat 2026-09-02T09:04:38Z, now 2026-09-02T06:04:40Z)",
                "Sep 02 06:11:02 app-07 app[3110]: oidc: token validation failed: token used before issued",
                "Sep 02 06:44:19 app-07 app[3110]: oidc: token validation failed: token used before issued",
                "",
              ].join("\n"),
            ),
          }),
        }),
      }),
      home: dir({ student: dir({}, 0o755, "student", "student") }),
    }),
  });

export const clockLab: Lab = {
  slug: "used-before-issued",
  title: "Token Used Before Issued",
  tagline: "Nobody can log in. The tokens are valid. The server disagrees about what time it is.",
  difficulty: "medium",
  brief: [
    "Single sign-on stopped working on app-07 this morning. The identity provider is fine and every other application using it is fine.",
    "The error says tokens are being used before they were issued. Work out why, and say what has to be fixed.",
  ],
  hints: [
    "Read the error carefully. It quotes two timestamps. Compare them.",
    "What does this machine think the time is? What service is supposed to keep it right?",
    "That service has a status. Look at why it exited, in its own log.",
  ],
  build: clockSkew,
  solved: (m) =>
    answered(m, ["clock", "time", "ntp", "chrony", "skew"], ["chrony", "ntp", "resolve", "dns", "failed", "not running", "time source", "behind"]),
  debrief: [
    "The machine's clock is roughly three hours behind. A token issued at 09:04 by the identity provider looks, to this host, like a token from the future, and every OIDC implementation rejects that because accepting it would break replay protection.",
    "chrony has been failed since 24 August. It could not resolve ntp.internal.example at startup and exited fatally rather than retrying, so the clock has been drifting free for nine days.",
    "Two things are wrong and both matter: the immediate cause is that chronyd is not running, and the underlying one is that it was pointed at a name that does not resolve. Starting it again without fixing the pool address just fails again at the next boot.",
  ],
  solution: [
    "date",
    "journalctl -u app -n 5",
    "systemctl status chrony",
    "cat /var/log/journal/chrony.log",
    "cat /etc/chrony.conf",
    "answer the clock is about three hours behind because chrony has been failed since 24 August, it could not resolve the ntp pool name and exited",
  ],
  reading: [
    { label: "NTP in enterprise networks", href: "/blog/ntp-enterprise-networks" },
    { label: "DNS fundamentals", href: "/blog/dns-fundamentals-infrastructure" },
  ],
};

export const HARD_LABS: Lab[] = [clockLab, inodeLab, mtuLab];
