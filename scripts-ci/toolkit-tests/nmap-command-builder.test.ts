import assert from "node:assert";
import {
  DEFAULT_NMAP_OPTIONS,
  buildNmapCommand,
  describeNmapCommand,
  nmapRootReasons,
  type NmapOptions,
} from "../../client/src/lib/toolkit/nmap-command-builder.ts";

function opts(patch: Partial<NmapOptions>): NmapOptions {
  return { ...DEFAULT_NMAP_OPTIONS, ...patch };
}

// Default-ish SYN scan with a port list and T4.
assert.strictEqual(
  buildNmapCommand(opts({ target: "10.0.0.5", scanType: "sS", portMode: "list", portList: "22,80,443", timing: "4" })),
  "nmap -sS -p 22,80,443 -T4 10.0.0.5",
);

// T3 is the default and is not emitted.
assert.strictEqual(
  buildNmapCommand(opts({ target: "host", scanType: "sT", portMode: "default", timing: "3" })),
  "nmap -sT host",
);

// Fast scan, no DNS, version detection with intensity.
assert.strictEqual(
  buildNmapCommand(
    opts({
      target: "host",
      scanType: "sT",
      portMode: "fast",
      resolveDns: false,
      serviceVersion: true,
      versionIntensity: "2",
      timing: "3",
    }),
  ),
  "nmap -sT -n -F -sV --version-intensity 2 host",
);

// All ports, OS detection, default scripts, named scripts.
assert.strictEqual(
  buildNmapCommand(
    opts({
      target: "10.0.0.0/24",
      scanType: "sS",
      portMode: "all",
      osDetection: true,
      defaultScripts: true,
      scripts: "http-title,ssl-cert",
      timing: "4",
    }),
  ),
  "nmap -sS -p- -O -sC --script http-title,ssl-cert -T4 10.0.0.0/24",
);

// Ping sweep ignores port selection entirely.
assert.strictEqual(
  buildNmapCommand(opts({ target: "10.0.0.0/24", scanType: "sn", portMode: "all", timing: "4" })),
  "nmap -sn -T4 10.0.0.0/24",
);

// top-ports and output file.
assert.strictEqual(
  buildNmapCommand(
    opts({ target: "host", scanType: "sS", portMode: "top", topPorts: "1000", outputMode: "all", outputFile: "run1", timing: "4" }),
  ),
  "nmap -sS --top-ports 1000 -T4 -oA run1 host",
);

// -Pn plus discovery probes.
assert.strictEqual(
  buildNmapCommand(
    opts({ target: "host", scanType: "sS", portMode: "default", noPing: true, pingTypes: ["PS", "PE"], timing: "4" }),
  ),
  "nmap -sS -Pn -PS -PE -T4 host",
);

// Rate limits.
assert.strictEqual(
  buildNmapCommand(opts({ target: "host", scanType: "sS", portMode: "default", minRate: "100", maxRate: "500", timing: "4" })),
  "nmap -sS -T4 --min-rate 100 --max-rate 500 host",
);

// Empty target is replaced with a placeholder, never dropped.
assert.ok(buildNmapCommand(opts({ target: "", scanType: "sT", portMode: "default", timing: "3" })).endsWith(" TARGET"));

// --- Privilege requirements. ---
assert.deepStrictEqual(nmapRootReasons(opts({ scanType: "sT", osDetection: false, pingTypes: [] })), []);
assert.strictEqual(nmapRootReasons(opts({ scanType: "sS" })).length, 1);
assert.strictEqual(nmapRootReasons(opts({ scanType: "sU" })).length, 1);
assert.strictEqual(nmapRootReasons(opts({ scanType: "sT", osDetection: true })).length, 1);
assert.strictEqual(nmapRootReasons(opts({ scanType: "sS", osDetection: true, pingTypes: ["PE"] })).length, 3);
// A connect scan with only -PS/-PA probes does not force root (they fall back to connect).
assert.deepStrictEqual(nmapRootReasons(opts({ scanType: "sT", pingTypes: ["PS", "PA"] })), []);

// --- Description is human readable and mentions the target and root. ---
const desc = describeNmapCommand(
  opts({ target: "10.0.0.5", scanType: "sS", portMode: "fast", serviceVersion: true, timing: "4" }),
);
assert.ok(desc.some((s) => s.includes("10.0.0.5")));
assert.ok(desc.some((s) => s.toLowerCase().includes("root")));
assert.ok(desc.some((s) => s.includes("100 most common ports")));

const snDesc = describeNmapCommand(opts({ target: "10.0.0.0/24", scanType: "sn", timing: "3" }));
assert.ok(snDesc.some((s) => s.toLowerCase().includes("without scanning any ports")));
// A ping sweep lists no port line.
assert.ok(!snDesc.some((s) => s.includes("most common ports")));

console.log("nmap-command-builder: all assertions passed");

// ============================================================
// Independent verifier reference cases (added during review).
// ============================================================

// V1. UDP scan forces root; description names it and flags root.
const vUdp = opts({ target: "10.0.0.9", scanType: "sU", portMode: "top", topPorts: "50", timing: "4" });
assert.strictEqual(buildNmapCommand(vUdp), "nmap -sU --top-ports 50 -T4 10.0.0.9");
assert.strictEqual(nmapRootReasons(vUdp).length, 1);
assert.ok(describeNmapCommand(vUdp).some((s) => s.toLowerCase().includes("root")));
assert.ok(describeNmapCommand(vUdp).some((s) => s.includes("50 most common ports")));

// V2. -sV without an intensity emits just -sV (no --version-intensity), and -sV alone needs NO root.
assert.strictEqual(
  buildNmapCommand(opts({ target: "h", scanType: "sT", portMode: "default", serviceVersion: true, versionIntensity: "", timing: "3" })),
  "nmap -sT -sV h",
);
assert.deepStrictEqual(nmapRootReasons(opts({ scanType: "sT", serviceVersion: true })), []);

// V3. Out-of-range version intensity ("12") is rejected, not clamped or passed through.
assert.strictEqual(
  buildNmapCommand(opts({ target: "h", scanType: "sT", portMode: "default", serviceVersion: true, versionIntensity: "12", timing: "3" })),
  "nmap -sT -sV h",
);
// Boundary values 0 and 9 are accepted.
assert.ok(buildNmapCommand(opts({ target: "h", scanType: "sT", serviceVersion: true, versionIntensity: "0", timing: "3" })).includes("--version-intensity 0"));
assert.ok(buildNmapCommand(opts({ target: "h", scanType: "sT", serviceVersion: true, versionIntensity: "9", timing: "3" })).includes("--version-intensity 9"));

// V4. Script argument with shell metacharacters is dropped (no injection into the command).
assert.strictEqual(
  buildNmapCommand(opts({ target: "h", scanType: "sT", portMode: "default", scripts: "http-title; rm -rf /", timing: "3" })),
  "nmap -sT h",
);
// A legitimate category plus wildcard survives.
assert.ok(buildNmapCommand(opts({ target: "h", scanType: "sT", scripts: "vuln,http-*", timing: "3" })).includes("--script 'vuln,http-*'"));
// ...and the wildcard is quoted so a shell cannot expand it against filenames in the current directory.
assert.ok(!buildNmapCommand(opts({ target: "h", scanType: "sT", scripts: "http-*", timing: "3" })).includes(" http-*"));

// V5. Output filename with path traversal is replaced by the safe default "scan".
assert.strictEqual(
  buildNmapCommand(opts({ target: "h", scanType: "sT", portMode: "default", outputMode: "xml", outputFile: "../../etc/passwd", timing: "3" })),
  "nmap -sT -oX scan h",
);

// V6. Target with shell metacharacters is replaced by the TARGET placeholder, never dropped.
assert.ok(buildNmapCommand(opts({ target: "h && reboot", scanType: "sT", portMode: "default", timing: "3" })).endsWith(" TARGET"));
// A legitimate CIDR plus a list of hosts survives.
assert.ok(buildNmapCommand(opts({ target: "10.0.0.0/24 192.168.1.1", scanType: "sT", timing: "3" })).includes("10.0.0.0/24 192.168.1.1"));

// V7. Invalid timing ("9") is dropped and the default T3 is assumed in the description.
assert.ok(!buildNmapCommand(opts({ target: "h", scanType: "sT", timing: "9" })).includes("-T"));

// V8. Xmas/null/FIN each need root exactly once; OS + UDP + ICMP echo stack to three reasons.
assert.strictEqual(nmapRootReasons(opts({ scanType: "sX" })).length, 1);
assert.strictEqual(nmapRootReasons(opts({ scanType: "sN" })).length, 1);
assert.strictEqual(nmapRootReasons(opts({ scanType: "sF" })).length, 1);
assert.strictEqual(nmapRootReasons(opts({ scanType: "sU", osDetection: true, pingTypes: ["PE"] })).length, 3);

// V9. -O (OS detection) with an unprivileged connect scan still needs root.
assert.strictEqual(nmapRootReasons(opts({ scanType: "sT", osDetection: true })).length, 1);
assert.ok(describeNmapCommand(opts({ target: "h", scanType: "sT", osDetection: true, timing: "3" })).some((s) => s.toLowerCase().includes("root")));

// V10. Empty / whitespace / unicode inputs never throw.
assert.doesNotThrow(() => buildNmapCommand(opts({ target: "   ", scanType: "sS", portList: "   ", topPorts: "   ", timing: "   " })));
assert.doesNotThrow(() => describeNmapCommand(opts({ target: "☃\u{1F4A9}", scanType: "sU", timing: "x" })));
assert.doesNotThrow(() => buildNmapCommand(opts({ target: "a".repeat(100000), scanType: "sS" })));
// Garbage timing/topPorts leave those flags off rather than emitting broken tokens.
assert.ok(!buildNmapCommand(opts({ target: "h", scanType: "sS", portMode: "top", topPorts: "abc", timing: "3" })).includes("--top-ports"));

// A target is names and addresses. A token that starts with a hyphen would be read as an option, so it falls back to the placeholder.
for (const hostile of [
  "127.0.0.1 -oN /tmp/result",
  "127.0.0.1 --script vuln",
  "-iL /etc/hosts",
  "host -sV",
  "a  -b",
  "-oX x",
  "host; id",
  "$(id)",
]) {
  const cmd = buildNmapCommand(opts({ target: hostile, scanType: "sS", portMode: "default", timing: "3" }));
  assert.ok(cmd.includes(" TARGET"), `target ${JSON.stringify(hostile)} becomes TARGET: ${cmd}`);
  assert.ok(!cmd.includes("/tmp/result") && !cmd.includes("vuln") && !cmd.includes("/etc/hosts"), `no smuggled option in ${cmd}`);
}
// Ranges, lists, CIDR and wildcards that really are targets still pass, a hyphen inside a token included.
for (const good of ["192.168.1.1-50", "10.0.0.0/24", "scanme.nmap.org example.com", "192.168.0.*", "fe80::1", "a-b.example.com", "10.0.1-3.1"]) {
  const cmd = buildNmapCommand(opts({ target: good, scanType: "sS", portMode: "default", timing: "3" }));
  const expected = good.split(/\s+/).map((t) => (t.includes("*") ? `'${t}'` : t)).join(" ");
  assert.ok(cmd.endsWith(` ${expected}`), `target ${good} kept: ${cmd}`);
}
// A wildcard target is single quoted so the shell leaves it for nmap; a list keeps one argument per token.
assert.ok(buildNmapCommand(opts({ target: "192.168.0.*", scanType: "sS", portMode: "default", timing: "3" })).endsWith(" '192.168.0.*'"));
assert.ok(buildNmapCommand(opts({ target: "10.0.0.* host.example", scanType: "sS", portMode: "default", timing: "3" })).endsWith(" '10.0.0.*' host.example"));
// The plain-language description shows the target without quotes.
assert.ok(describeNmapCommand(opts({ target: "192.168.0.*", scanType: "sS", portMode: "default", timing: "3" }))[0].includes("192.168.0.*"));

console.log("nmap-command-builder: verifier reference cases passed");
