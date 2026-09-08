/**
 * Eight logs, each with one line that settles it.
 *
 * The design rule for every one of these: the loud pattern is not the
 * answer. A wall of failed passwords is a bot that got nowhere. The line
 * that matters is quiet, it is usually a success rather than a failure, and
 * it is almost never near the lines somebody would grep for first.
 */

import type { Case } from "../types";

export const CASES: Case[] = [
  {
    slug: "the-one-that-worked",
    title: "Brute force on the jump host",
    facility: "auth",
    brief:
      "The monitoring caught a spike in authentication failures on the jump host overnight and raised a ticket saying a brute force attempt was blocked. Here is the window around it. Confirm or correct that.",
    epoch: "2026-08-19T02:58:00Z",
    lines: [
      { at: 0, host: "jump01", process: "sshd[8812]", message: "Failed password for invalid user admin from 45.155.205.86 port 51204 ssh2" },
      { at: 2, host: "jump01", process: "sshd[8813]", message: "Failed password for invalid user root from 45.155.205.86 port 51230 ssh2" },
      { at: 4, host: "jump01", process: "sshd[8814]", message: "Failed password for invalid user test from 45.155.205.86 port 51262 ssh2" },
      { at: 7, host: "jump01", process: "sshd[8815]", message: "Failed password for invalid user oracle from 45.155.205.86 port 51290 ssh2" },
      { at: 9, host: "jump01", process: "sshd[8816]", message: "Failed password for invalid user postgres from 45.155.205.86 port 51318 ssh2" },
      { at: 12, host: "jump01", process: "sshd[8817]", message: "Failed password for invalid user ubuntu from 45.155.205.86 port 51344 ssh2" },
      { at: 14, host: "jump01", process: "sshd[8818]", message: "Failed password for invalid user deploy from 45.155.205.86 port 51370 ssh2" },
      { at: 61, host: "jump01", process: "sshd[8901]", message: "Connection closed by authenticating user root 45.155.205.86 port 51402 [preauth]" },
      { at: 940, host: "jump01", process: "sshd[9204]", message: "Accepted publickey for backup-svc from 203.0.113.44 port 47122 ssh2: RSA SHA256:5rQd2Xd8Vp" },
      { at: 941, host: "jump01", process: "sshd[9204]", message: "pam_unix(sshd:session): session opened for user backup-svc by (uid=0)" },
      { at: 944, host: "jump01", process: "sudo", message: "backup-svc : TTY=pts/2 ; PWD=/home/backup-svc ; USER=root ; COMMAND=/usr/bin/cat /etc/shadow" },
      { at: 1002, host: "jump01", process: "sshd[9204]", message: "pam_unix(sshd:session): session closed for user backup-svc" },
    ],
    options: [
      { id: "key", claim: "A service account key was used from somewhere it should not have been, and it read the password hashes", supportedBy: [8, 10] },
      { id: "brute", claim: "A brute force attempt that failed and was blocked", supportedBy: [0, 1, 2, 3, 4, 5, 6, 7] },
      { id: "scan", claim: "A port scan with no authentication attempted", supportedBy: [7] },
      { id: "nothing", claim: "Routine noise, with the backup job running on schedule", supportedBy: [8, 9, 11] },
    ],
    answer: "key",
    deciding: 10,
    why:
      "The failures are a bot working a user list from one address and getting nowhere. The incident is sixteen minutes later and it succeeded: a key-based login for a service account, from a different address, immediately sudoing to cat /etc/shadow. A backup service reading the shadow file is not a backup service doing its job.",
    noise: "Failed password for invalid user",
  },
  {
    slug: "full-before-it-is-full",
    title: "The disk that filled without filling",
    facility: "syslog",
    brief:
      "An application started throwing write errors just after 4am. df said the filesystem was at 61 per cent the whole time and nobody could explain it. Read the log.",
    epoch: "2026-07-02T04:02:00Z",
    lines: [
      { at: 0, host: "app03", process: "kernel", message: "EXT4-fs (nvme0n1p2): mounted filesystem with ordered data mode. Opts: (null)" },
      { at: 118, host: "app03", process: "orderd[1442]", message: "write /var/lib/orderd/spool/0e41f2.tmp: no space left on device" },
      { at: 119, host: "app03", process: "orderd[1442]", message: "retrying write, attempt 2 of 5" },
      { at: 121, host: "app03", process: "orderd[1442]", message: "write /var/lib/orderd/spool/0e41f2.tmp: no space left on device" },
      { at: 140, host: "app03", process: "collectd[880]", message: "df plugin: /var free 41.2 GB of 106 GB, 61 percent used" },
      { at: 160, host: "app03", process: "orderd[1442]", message: "write /var/lib/orderd/spool/0e41f5.tmp: no space left on device" },
      { at: 181, host: "app03", process: "kernel", message: "EXT4-fs warning (device nvme0n1p2): ext4_dx_add_entry:2364: Directory index full" },
      { at: 204, host: "app03", process: "collectd[880]", message: "df plugin: /var inodes 6553600 of 6553600 used, 100 percent" },
      { at: 240, host: "app03", process: "orderd[1442]", message: "spool directory /var/lib/orderd/spool holds 6491203 entries" },
      { at: 900, host: "app03", process: "orderd[1442]", message: "write /var/lib/orderd/spool/0e4231.tmp: no space left on device" },
    ],
    options: [
      { id: "blocks", claim: "The filesystem is genuinely full and df is reporting stale figures", supportedBy: [1, 3, 5] },
      { id: "quota", claim: "A per-user disk quota is being hit rather than a filesystem limit", supportedBy: [1] },
      { id: "readonly", claim: "The filesystem remounted read-only after an error", supportedBy: [0, 6] },
      { id: "inodes", claim: "The filesystem is out of inodes, not out of space", supportedBy: [7, 8] },
    ],
    answer: "inodes",
    deciding: 7,
    why:
      "ENOSPC means the filesystem cannot complete the write, not that the blocks are gone. Inodes are a separate fixed pool set at mkfs time, and six and a half million tiny spool files exhausted them with forty gigabytes of blocks still free. df -i is the command nobody ran.",
    noise: "no space left on device",
  },
  {
    slug: "the-certificate-nobody-renewed",
    title: "Half the clients broke and half did not",
    facility: "web",
    brief:
      "From nine in the morning some clients could not reach the API and others were fine, with no pattern anybody could see by customer or region. The load balancer health checks stayed green throughout.",
    epoch: "2026-06-11T08:58:00Z",
    lines: [
      { at: 0, host: "edge01", process: "nginx[2201]", message: "10.20.4.19 - - \"GET /v2/orders HTTP/2.0\" 200 4122 \"-\" \"acme-sync/4.1\"" },
      { at: 74, host: "edge01", process: "nginx[2201]", message: "SSL_do_handshake() failed (SSL: error:0A000418:SSL routines::tlsv1 alert unknown ca) while SSL handshaking, client: 198.51.100.23" },
      { at: 96, host: "edge01", process: "nginx[2201]", message: "10.20.4.19 - - \"GET /v2/orders HTTP/2.0\" 200 3980 \"-\" \"acme-sync/4.1\"" },
      { at: 130, host: "edge01", process: "nginx[2201]", message: "SSL_do_handshake() failed (SSL: error:0A000418:SSL routines::tlsv1 alert unknown ca) while SSL handshaking, client: 198.51.100.77" },
      { at: 158, host: "edge01", process: "certbot", message: "Certificate for api.example.com renewed, issuer changed from R3 to E6, chain length 2" },
      { at: 190, host: "edge01", process: "nginx[2201]", message: "SSL_do_handshake() failed (SSL: error:0A000418:SSL routines::tlsv1 alert unknown ca) while SSL handshaking, client: 198.51.100.91" },
      { at: 240, host: "edge01", process: "haproxy[900]", message: "Health check for server api/edge01 succeeded, reason: Layer7 check passed, code: 200" },
      { at: 302, host: "edge01", process: "nginx[2201]", message: "SSL_do_handshake() failed (SSL: error:0A000418:SSL routines::tlsv1 alert unknown ca) while SSL handshaking, client: 198.51.100.14" },
    ],
    options: [
      { id: "expired", claim: "The certificate expired and the renewal ran late", supportedBy: [4] },
      { id: "issuer", claim: "The renewal changed issuer, and clients pinning the old root or shipping a stale trust store now reject the chain", supportedBy: [4, 5] },
      { id: "protocol", claim: "A TLS version mismatch with older clients", supportedBy: [1, 3] },
      { id: "lb", claim: "The load balancer is terminating TLS with the wrong certificate", supportedBy: [6] },
    ],
    answer: "issuer",
    deciding: 4,
    why:
      "unknown ca is the client rejecting the chain, not the server rejecting the client, so nothing on this host is broken. The certbot line names the cause: the issuer changed, and any client with a pinned root or a trust store older than E6 now has no path to a root it knows. The health check stayed green because it trusts the local store, which does know.",
    noise: "SSL_do_handshake() failed",
  },
  {
    slug: "two-clocks",
    title: "The event that happened before it started",
    facility: "syslog",
    brief:
      "A distributed job reported completing eleven seconds before its own start. The scheduler team say the job is fine and the observability team say the trace is fine. Both are correct.",
    epoch: "2026-05-28T22:14:00Z",
    clockSkew: true,
    lines: [
      { at: 0, host: "sched01", process: "runnerd[301]", message: "dispatching job 7741 to worker pool eu-west" },
      { at: 1, host: "sched01", process: "runnerd[301]", message: "job 7741 accepted by worker w-14" },
      { at: 2, host: "w-14", process: "workerd[6620]", message: "job 7741 starting, stage 1 of 3" },
      { at: 5, host: "w-14", process: "workerd[6620]", message: "job 7741 stage 2 of 3" },
      { at: 9, host: "w-14", process: "workerd[6620]", message: "job 7741 stage 3 of 3" },
      { at: 11, host: "w-14", process: "workerd[6620]", message: "job 7741 complete in 9.4s" },
      { at: 0, host: "sched01", process: "runnerd[301]", message: "job 7741 reported complete, wall clock -11s, flagging as anomalous" },
      { at: 3, host: "sched01", process: "chronyd[712]", message: "Selected source 10.20.0.9, offset +11.284s applied to system clock" },
      { at: 4, host: "sched01", process: "chronyd[712]", message: "System clock wrong by 11.284 seconds, adjustment started" },
    ],
    options: [
      { id: "race", claim: "A race in the scheduler between accepting and recording the job", supportedBy: [1, 6] },
      { id: "duplicate", claim: "The job ran twice and the second run's completion arrived first", supportedBy: [0, 5] },
      { id: "skew", claim: "The dispatching host's clock was out by eleven seconds and chronyd corrected it mid-job", supportedBy: [7, 8] },
      { id: "timezone", claim: "The two hosts are logging in different time zones", supportedBy: [6] },
    ],
    answer: "skew",
    deciding: 7,
    why:
      "The negative duration is not a job bug, it is arithmetic across two clocks that disagreed by almost exactly the amount reported. chronyd names the offset: 11.284 seconds, against a reported minus eleven. A duration computed from a start on one host and an end on another is only as good as the sync between them, which is why elapsed time should come from one clock or from a monotonic source.",
  },
  {
    slug: "retry-storm",
    title: "The outage that was its own cause",
    facility: "database",
    brief:
      "The database went from healthy to refusing connections in under a minute and stayed there for twenty. Nothing was deployed, the query mix did not change, and the hardware is fine.",
    epoch: "2026-04-14T13:40:00Z",
    lines: [
      { at: 0, host: "db01", process: "postgres[4401]", message: "connections 184 of 200, longest transaction 0.4s" },
      { at: 14, host: "db01", process: "postgres[4401]", message: "duration: 8412.775 ms statement: SELECT * FROM orders WHERE customer_id = $1" },
      { at: 18, host: "db01", process: "postgres[4401]", message: "connections 200 of 200, 41 waiting" },
      { at: 19, host: "api07", process: "apid[2210]", message: "database timeout after 5000ms, retrying (attempt 1 of 3)" },
      { at: 20, host: "api07", process: "apid[2210]", message: "database timeout after 5000ms, retrying (attempt 2 of 3)" },
      { at: 21, host: "api04", process: "apid[2210]", message: "database timeout after 5000ms, retrying (attempt 1 of 3)" },
      { at: 23, host: "db01", process: "postgres[4401]", message: "connections 200 of 200, 316 waiting" },
      { at: 26, host: "db01", process: "postgres[4401]", message: "FATAL: sorry, too many clients already" },
      { at: 31, host: "db01", process: "postgres[4401]", message: "autovacuum: table public.orders, dead tuples 8412031, threshold 41220, last vacuum never" },
      { at: 44, host: "db01", process: "postgres[4401]", message: "connections 200 of 200, 902 waiting" },
    ],
    options: [
      { id: "bloat", claim: "A table was never vacuumed, its queries slowed past the client timeout, and immediate retries turned that into a connection stampede", supportedBy: [1, 8] },
      { id: "clients", claim: "Too many application instances were started and exhausted the connection limit", supportedBy: [2, 7] },
      { id: "lock", claim: "A long-held lock blocked everything behind it", supportedBy: [1, 6] },
      { id: "network", claim: "Network loss between the API tier and the database caused the timeouts", supportedBy: [3, 4, 5] },
    ],
    answer: "bloat",
    deciding: 8,
    why:
      "The waiting count triples in five seconds, which is faster than real load arrives: each timeout produces a retry that takes another connection while the first is still running. What made queries slow enough to time out at all is the last line: eight million dead tuples on a table that has never been vacuumed, so a lookup that should touch one row scans the corpses of eight million. The retries are the amplifier, the bloat is the cause, and retrying without backoff is what turned a slow query into an outage.",
    noise: "database timeout after 5000ms, retrying",
  },
  {
    slug: "the-quiet-relay",
    title: "Mail is being delivered, and that is the problem",
    facility: "mail",
    brief:
      "The mail server is not on any blocklist, the queue is short, and delivery rates look normal. Someone in finance forwarded a bounce for a message nobody in the company sent.",
    epoch: "2026-03-05T01:20:00Z",
    lines: [
      { at: 0, host: "mx01", process: "postfix/smtpd[3301]", message: "connect from unknown[185.220.101.34]" },
      { at: 1, host: "mx01", process: "postfix/smtpd[3301]", message: "NOQUEUE: reject: RCPT from unknown[185.220.101.34]: 554 5.7.1 Relay access denied" },
      { at: 3, host: "mx01", process: "postfix/smtpd[3301]", message: "disconnect from unknown[185.220.101.34]" },
      { at: 40, host: "mx01", process: "postfix/smtpd[3355]", message: "connect from unknown[91.240.118.172]" },
      { at: 41, host: "mx01", process: "postfix/smtpd[3355]", message: "NOQUEUE: reject: RCPT from unknown[91.240.118.172]: 554 5.7.1 Relay access denied" },
      { at: 88, host: "mx01", process: "postfix/smtpd[3361]", message: "NOQUEUE: reject: RCPT from unknown[194.26.229.40]: 554 5.7.1 Relay access denied" },
      { at: 131, host: "mx01", process: "postfix/smtpd[3378]", message: "NOQUEUE: reject: RCPT from unknown[103.145.13.72]: 554 5.7.1 Relay access denied" },
      { at: 176, host: "mx01", process: "postfix/smtpd[3390]", message: "NOQUEUE: reject: RCPT from unknown[89.248.165.211]: 554 5.7.1 Relay access denied" },
      { at: 220, host: "mx01", process: "postfix/smtpd[3402]", message: "connect from unknown[45.9.148.201]" },
      { at: 221, host: "mx01", process: "postfix/smtpd[3402]", message: "45.9.148.201: SASL PLAIN authentication successful, sasl_username=invoices@example.com" },
      { at: 222, host: "mx01", process: "postfix/qmgr[1102]", message: "A81F2: from=<invoices@example.com>, size=41220, nrcpt=488 (queue active)" },
      { at: 402, host: "mx01", process: "postfix/qmgr[1102]", message: "B0C41: from=<invoices@example.com>, size=41220, nrcpt=492 (queue active)" },
      { at: 610, host: "mx01", process: "postfix/qmgr[1102]", message: "C1D77: from=<invoices@example.com>, size=41220, nrcpt=488 (queue active)" },
    ],
    options: [
      { id: "openrelay", claim: "The server is an open relay and is being used to send spam", supportedBy: [0, 3, 8] },
      { id: "spoof", claim: "The domain is being spoofed by an external sender with no SPF record to stop it", supportedBy: [1, 4] },
      { id: "misconfig", claim: "A misconfigured mailing list is fanning out messages", supportedBy: [10, 11, 12] },
      { id: "credentials", claim: "A mailbox password has been compromised and is being used to send authenticated bulk mail", supportedBy: [9, 10] },
    ],
    answer: "credentials",
    deciding: 9,
    why:
      "The rejections are the reassuring part: unauthenticated relay attempts are being refused exactly as they should be, which is why nothing is on a blocklist yet. The line that matters is a successful SASL authentication from a hosting range, followed by three identical messages to five hundred recipients each. This is not a relay problem and not a spoofing problem. Somebody has the password.",
    noise: "Relay access denied",
  },
  {
    slug: "the-flapping-that-was-not",
    title: "The link that keeps flapping on one side",
    facility: "kernel",
    brief:
      "A server has been logging link transitions all week. The switch port shows no flaps at all over the same period, and swapping the cable and the optic changed nothing.",
    epoch: "2026-02-17T09:00:00Z",
    lines: [
      { at: 0, host: "st02", process: "kernel", message: "ixgbe 0000:04:00.0 eno1: NIC Link is Up 10 Gbps, Flow Control: RX/TX" },
      { at: 300, host: "st02", process: "kernel", message: "ixgbe 0000:04:00.0 eno1: NIC Link is Down" },
      { at: 302, host: "st02", process: "kernel", message: "ixgbe 0000:04:00.0 eno1: NIC Link is Up 10 Gbps, Flow Control: RX/TX" },
      { at: 600, host: "st02", process: "kernel", message: "ixgbe 0000:04:00.0 eno1: NIC Link is Down" },
      { at: 602, host: "st02", process: "kernel", message: "ixgbe 0000:04:00.0 eno1: NIC Link is Up 10 Gbps, Flow Control: RX/TX" },
      { at: 640, host: "st02", process: "systemd[1]", message: "Starting Network Manager Script Dispatcher Service" },
      { at: 900, host: "st02", process: "kernel", message: "ixgbe 0000:04:00.0 eno1: NIC Link is Down" },
      { at: 901, host: "st02", process: "NetworkManager[1181]", message: "device eno1: state change (activated -> deactivating), reason 'carrier-changed'" },
      { at: 899, host: "st02", process: "irqbalance[904]", message: "Rebalancing interrupts, moved 4 IRQs, eno1 rx queues reassigned" },
      { at: 902, host: "st02", process: "kernel", message: "ixgbe 0000:04:00.0 eno1: NIC Link is Up 10 Gbps, Flow Control: RX/TX" },
    ],
    options: [
      { id: "cable", claim: "A physical fault in the cable or the optic", supportedBy: [1, 3, 6] },
      { id: "switch", claim: "The switch is bouncing the port and not logging it", supportedBy: [1, 3, 6] },
      { id: "driver", claim: "Something on the host is resetting the interface on a timer, and the link never actually left the switch", supportedBy: [5, 7, 8] },
      { id: "power", claim: "The card is dropping into a power saving state", supportedBy: [1, 2] },
    ],
    answer: "driver",
    deciding: 8,
    why:
      "Exactly five minutes apart, down for two seconds, and the switch sees nothing: a physical fault does not keep to a schedule and would show on both ends. The interrupt rebalance a second before each transition is the tell. Something on this host touches the interface on a five minute cycle, and the down is the driver resetting rather than the link failing. The cable and the optic were never involved, which is why replacing them changed nothing.",
    noise: "NIC Link is Down",
    clockSkew: true,
  },
  {
    slug: "blocked-and-still-working",
    title: "The rule is blocking it and the traffic is arriving",
    facility: "firewall",
    brief:
      "A deny rule for a management subnet was added and verified. Its counter is going up. The traffic it is supposed to be stopping is still reaching the host.",
    epoch: "2026-01-22T15:30:00Z",
    lines: [
      { at: 0, host: "fw01", process: "kernel", message: "IN=eth1 OUT=eth0 SRC=10.90.0.14 DST=10.20.4.11 PROTO=TCP SPT=51002 DPT=443 [DENY rule 44]" },
      { at: 12, host: "fw01", process: "kernel", message: "IN=eth1 OUT=eth0 SRC=10.90.0.14 DST=10.20.4.11 PROTO=TCP SPT=51008 DPT=443 [DENY rule 44]" },
      { at: 30, host: "fw01", process: "kernel", message: "IN=eth1 OUT=eth0 SRC=10.90.0.19 DST=10.20.4.11 PROTO=TCP SPT=44120 DPT=443 [DENY rule 44]" },
      { at: 44, host: "app11", process: "nginx[880]", message: "10.90.0.14 - - \"GET /admin/status HTTP/1.1\" 200 812 \"-\" \"curl/8.5.0\"" },
      { at: 60, host: "fw01", process: "kernel", message: "IN=eth1 OUT=eth0 SRC=10.90.0.19 DST=10.20.4.11 PROTO=TCP SPT=44166 DPT=443 [DENY rule 44]" },
      { at: 71, host: "app11", process: "nginx[880]", message: "10.90.0.14 - - \"GET /admin/status HTTP/1.1\" 200 804 \"-\" \"curl/8.5.0\"" },
      { at: 88, host: "app11", process: "sshd[3301]", message: "Accepted publickey for ops from 10.90.0.14 port 55120 ssh2" },
      { at: 90, host: "core-sw", process: "vrrpd[221]", message: "interface vlan90 and vlan20 both present, inter-vlan routing enabled locally" },
      { at: 120, host: "fw01", process: "kernel", message: "IN=eth1 OUT=eth0 SRC=10.90.0.14 DST=10.20.4.11 PROTO=TCP SPT=51044 DPT=443 [DENY rule 44]" },
    ],
    options: [
      { id: "order", claim: "An earlier accept rule is matching before rule 44", supportedBy: [0, 1] },
      { id: "bypass", claim: "The two subnets are routed to each other on the core switch, so the traffic never crosses the firewall", supportedBy: [3, 7] },
      { id: "state", claim: "Existing connections were established before the rule and conntrack keeps them alive", supportedBy: [3, 5] },
      { id: "wrongport", claim: "The rule covers 443 and the traffic is arriving on another port", supportedBy: [6] },
    ],
    answer: "bypass",
    deciding: 7,
    why:
      "The counter going up proves the rule works for traffic that reaches it, which is the trap: some of it does. The switch line says vlan90 and vlan20 are both local to the core and routed there, so the shortest path between the two subnets never touches the firewall at all. A rule can only drop what is presented to it, and a policy enforced at a device the traffic can go around is not a policy.",
    noise: "[DENY rule 44]",
  },
];
