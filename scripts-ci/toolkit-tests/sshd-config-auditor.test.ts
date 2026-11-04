import assert from "node:assert/strict";
import {
  EXAMPLES,
  MAX_FINDINGS,
  MAX_LINES,
  OPENSSH_DEFAULTS,
  auditConfig,
  classifyAlgorithm,
  effectiveAlgorithms,
  hardenedSnippet,
  parseConfig,
  parseSshdTime,
  splitArgs,
  worstTone,
} from "../../client/src/lib/toolkit/sshd-config-auditor.ts";

let count = 0;
function eq<T>(a: T, b: T, msg?: string) {
  assert.deepStrictEqual(a, b, msg);
  count += 1;
}
function ok(v: unknown, msg?: string) {
  assert.ok(v, msg);
  count += 1;
}
const row = (cfg: string, key: string) => {
  const r = auditConfig(cfg).rows.find((x) => x.key === key);
  assert.ok(r, key);
  return r;
};
const has = (cfg: string, pred: (f: ReturnType<typeof auditConfig>["findings"][number]) => boolean) =>
  auditConfig(cfg).findings.some(pred);

/* ------------------------------------------------------------- tokenizer */

eq(splitArgs("no"), { ok: true, args: ["no"], comment: false });
eq(splitArgs("  a  b\tc "), { ok: true, args: ["a", "b", "c"], comment: false });
eq(splitArgs('"/path with space/key" x'), { ok: true, args: ["/path with space/key", "x"], comment: false });
eq(splitArgs("'single quoted'"), { ok: true, args: ["single quoted"], comment: false });
eq(splitArgs("a\\ b"), { ok: true, args: ["a b"], comment: false });
eq(splitArgs("no # trailing"), { ok: true, args: ["no"], comment: true });
eq(splitArgs('"#notacomment"'), { ok: true, args: ["#notacomment"], comment: false });
eq(splitArgs("a#b"), { ok: true, args: ["a#b"], comment: false });
ok(!splitArgs('"open').ok);
eq(splitArgs(""), { ok: true, args: [], comment: false });

/* ---------------------------------------------------------------- parser */

const p1 = parseConfig("PermitRootLogin no\npermitrootlogin=yes\nPERMITROOTLOGIN = without-password\n");
eq(p1.global.length, 3);
eq(p1.global.map((d) => d.key), ["permitrootlogin", "permitrootlogin", "permitrootlogin"]);
eq(p1.global.map((d) => d.args[0]), ["no", "yes", "without-password"]);
eq(p1.global[1].written, "permitrootlogin");
eq(p1.global[0].name, "PermitRootLogin");

const p2 = parseConfig("# comment\n\n   \nPort 22\nMatch User alice,bob Address 10.0.0.0/8\n  X11Forwarding yes\nMatch all\n  LogLevel VERBOSE\n");
eq(p2.global.length, 1);
eq(p2.blocks.length, 2);
eq(p2.blocks[0].criteria, "User alice,bob Address 10.0.0.0/8");
eq(p2.blocks[0].all, false);
eq(p2.blocks[0].line, 5);
eq(p2.blocks[0].endLine, 6);
eq(p2.blocks[1].all, true);
eq(p2.blocks[0].directives[0].block, 0);
eq(p2.blocks[0].directives[0].indented, true);
eq(p2.directiveCount, 5);

// CRLF, BOM, tabs
const p3 = parseConfig("﻿PermitRootLogin\tno\r\nPasswordAuthentication no\r\n");
eq(p3.global.map((d) => d.args[0]), ["no", "no"]);
eq(p3.global[0].key, "permitrootlogin");

// aliases resolve to the new keyword
const p4 = parseConfig("ChallengeResponseAuthentication no\nPubkeyAcceptedKeyTypes +ssh-rsa\n");
eq(p4.global[0].key, "kbdinteractiveauthentication");
eq(p4.global[1].key, "pubkeyacceptedalgorithms");
ok(p4.findings.some((f) => f.title.includes("old name")));

// caps
const huge = Array.from({ length: MAX_LINES + 50 }, (_, i) => `# line ${i}`).join("\n") + "\nPermitRootLogin yes";
const ph = parseConfig(huge);
eq(ph.truncated, true);
eq(ph.lineCount, MAX_LINES);
eq(ph.global.length, 0);
ok(ph.findings.some((f) => f.title.includes("Only part")));
const big = parseConfig("x".repeat(300_000));
eq(big.truncated, true);

/* -------------------------------------------------------- first value wins */

const fv = "PasswordAuthentication yes\nPasswordAuthentication no\n";
eq(row(fv, "passwordauthentication").value, "yes");
eq(row(fv, "passwordauthentication").source, "line 1");
ok(has(fv, (f) => f.title === "PasswordAuthentication on line 2 has no effect" && f.line === 2));
// identical repeats are not reported
ok(!has("X11Forwarding no\nX11Forwarding no\n", (f) => f.title.includes("has no effect")));
// alias and new name compete for the same option
const alias = "ChallengeResponseAuthentication yes\nKbdInteractiveAuthentication no\n";
eq(row(alias, "kbdinteractiveauthentication").value, "yes");
ok(has(alias, (f) => f.title.includes("has no effect")));
// accumulating keywords are not duplicates
const acc = "AllowUsers alice\nAllowUsers bob carol\n";
eq(row(acc, "allowusers").value, "alice bob carol");
eq(row(acc, "allowusers").source, "lines 1, 2");
ok(!has(acc, (f) => f.title.includes("has no effect")));
eq(auditConfig(acc).allowUsers, ["alice", "bob", "carol"]);

/* ------------------------------------------------------------- defaults */

const empty = auditConfig("");
const d = (key: string) => empty.rows.find((r) => r.key === key)!;
eq(d("permitrootlogin").value, "prohibit-password");
eq(d("permitrootlogin").isDefault, true);
eq(d("permitrootlogin").tone, "info");
eq(d("passwordauthentication").value, "yes");
eq(d("passwordauthentication").tone, "warn");
eq(d("permitemptypasswords").tone, "ok");
eq(d("maxauthtries").value, "6");
eq(d("maxauthtries").tone, "info");
eq(d("x11forwarding").tone, "ok");
eq(d("allowtcpforwarding").tone, "info");
eq(d("ciphers").value, OPENSSH_DEFAULTS.ciphers.join(","));
eq(d("ciphers").tone, "ok");
eq(d("macs").tone, "warn"); // the compiled-in default still offers hmac-sha1
eq(d("kexalgorithms").tone, "ok");
eq(d("hostkeyalgorithms").tone, "ok");
eq(empty.rows.some((r) => r.key === "protocol"), false);
ok(empty.findings.some((f) => f.title === "No AllowUsers or AllowGroups"));
ok(!empty.findings.some((f) => f.title.includes("Terrapin")));

/* ------------------------------------------------- individual keywords */

eq(row("PermitRootLogin yes", "permitrootlogin").tone, "danger");
eq(row("PermitRootLogin YES", "permitrootlogin").tone, "danger");
eq(row("PermitRootLogin no", "permitrootlogin").tone, "ok");
eq(row("PermitRootLogin forced-commands-only", "permitrootlogin").tone, "info");
ok(row("PermitRootLogin without-password", "permitrootlogin").note.includes("old name"));
eq(row("PermitRootLogin maybe", "permitrootlogin").tone, "danger");
ok(row("PermitRootLogin maybe", "permitrootlogin").note.includes("refuses"));
eq(row("PasswordAuthentication no", "passwordauthentication").tone, "ok");
eq(row("PasswordAuthentication yes", "passwordauthentication").tone, "warn");
eq(row("PermitEmptyPasswords yes", "permitemptypasswords").tone, "danger");
ok(row("PermitEmptyPasswords yes\nPasswordAuthentication no", "permitemptypasswords").note.includes("one setting away"));
eq(row("PubkeyAuthentication no", "pubkeyauthentication").tone, "warn");
eq(row("MaxAuthTries 10", "maxauthtries").tone, "warn");
eq(row("MaxAuthTries 4", "maxauthtries").tone, "ok");
eq(row("MaxAuthTries 2", "maxauthtries").tone, "info");
eq(row("MaxAuthTries lots", "maxauthtries").tone, "danger");
eq(row("X11Forwarding yes", "x11forwarding").tone, "warn");
eq(row("X11UseLocalhost no", "x11uselocalhost").tone, "warn");
eq(row("AllowTcpForwarding no", "allowtcpforwarding").tone, "ok");
eq(row("AllowTcpForwarding local", "allowtcpforwarding").tone, "info");
eq(row("AllowTcpForwarding sometimes", "allowtcpforwarding").tone, "danger");
eq(row("GatewayPorts clientspecified", "gatewayports").tone, "warn");
eq(row("PermitTunnel point-to-point", "permittunnel").tone, "warn");
eq(row("PermitUserEnvironment LANG,LC_*", "permituserenvironment").tone, "warn");
eq(row("HostbasedAuthentication yes", "hostbasedauthentication").tone, "warn");
eq(row("IgnoreRhosts no", "ignorerhosts").tone, "warn");
eq(row("StrictModes no", "strictmodes").tone, "warn");
eq(row("LogLevel VERBOSE", "loglevel").tone, "ok");
eq(row("LogLevel quiet", "loglevel").tone, "warn");
eq(row("LogLevel DEBUG3", "loglevel").tone, "warn");
eq(row("LoginGraceTime 0", "logingracetime").tone, "warn");
eq(row("LoginGraceTime 2m", "logingracetime").tone, "info");
eq(row("LoginGraceTime 30s", "logingracetime").tone, "ok");
eq(row("LoginGraceTime soon", "logingracetime").tone, "danger");
eq(parseSshdTime("1m30s"), 90);
eq(parseSshdTime("120"), 120);
eq(parseSshdTime("1h"), 3600);
eq(parseSshdTime("2w"), 1209600);
eq(parseSshdTime("10x"), null);
eq(parseSshdTime(""), null);

// KbdInteractive and PAM interplay
const kbd = "PasswordAuthentication no\nUsePAM yes\n";
eq(row(kbd, "kbdinteractiveauthentication").tone, "warn");
ok(row(kbd, "kbdinteractiveauthentication").note.includes("does not close this path"));
eq(row(kbd + "KbdInteractiveAuthentication no\n", "kbdinteractiveauthentication").tone, "ok");
eq(row("UsePAM no\n", "kbdinteractiveauthentication").tone, "info");

// Protocol
eq(row("Protocol 2,1", "protocol").tone, "danger");
eq(row("Protocol 1", "protocol").tone, "danger");
eq(row("Protocol 2", "protocol").tone, "info");

/* ---------------------------------------------------------- algorithms */

eq(effectiveAlgorithms("ciphers", null).mode, "default");
eq(effectiveAlgorithms("ciphers", "aes256-ctr,aes128-cbc").list, ["aes256-ctr", "aes128-cbc"]);
eq(effectiveAlgorithms("ciphers", "+aes128-cbc").list, [...OPENSSH_DEFAULTS.ciphers, "aes128-cbc"]);
eq(effectiveAlgorithms("ciphers", "+aes128-ctr").list, OPENSSH_DEFAULTS.ciphers); // no duplicate
eq(effectiveAlgorithms("ciphers", "-chacha20-poly1305@openssh.com").list, OPENSSH_DEFAULTS.ciphers.slice(1));
eq(effectiveAlgorithms("macs", "-hmac-sha1*").list, OPENSSH_DEFAULTS.macs.filter((m) => !m.startsWith("hmac-sha1")));
eq(effectiveAlgorithms("macs", "-*-sha1*").list.includes("hmac-sha1-etm@openssh.com"), false);
eq(effectiveAlgorithms("ciphers", "^aes256-gcm@openssh.com").list[0], "aes256-gcm@openssh.com");
eq(effectiveAlgorithms("ciphers", "^aes256-gcm@openssh.com").list.length, OPENSSH_DEFAULTS.ciphers.length);
eq(effectiveAlgorithms("ciphers", "aes256-gcm").unknown, ["aes256-gcm"]);
ok(effectiveAlgorithms("ciphers", "aes256-ctr,,aes128-ctr").error !== null);
ok(effectiveAlgorithms("ciphers", "aes256-ctr;rm").error !== null);
ok(effectiveAlgorithms("ciphers", "aes*").error !== null); // wildcards only in - lists

eq(classifyAlgorithm("ciphers", "aes128-cbc")?.tone, "warn");
eq(classifyAlgorithm("ciphers", "3des-cbc")?.tone, "danger");
eq(classifyAlgorithm("ciphers", "blowfish-cbc")?.tone, "danger");
eq(classifyAlgorithm("ciphers", "arcfour256")?.tone, "danger");
eq(classifyAlgorithm("ciphers", "rijndael-cbc@lysator.liu.se")?.tone, "warn");
eq(classifyAlgorithm("ciphers", "aes256-gcm@openssh.com"), null);
eq(classifyAlgorithm("ciphers", "chacha20-poly1305@openssh.com"), null);
eq(classifyAlgorithm("macs", "hmac-md5")?.tone, "danger");
eq(classifyAlgorithm("macs", "hmac-md5-96-etm@openssh.com")?.tone, "danger");
eq(classifyAlgorithm("macs", "hmac-sha1")?.tone, "warn");
eq(classifyAlgorithm("macs", "hmac-sha1-etm@openssh.com")?.tone, "warn");
eq(classifyAlgorithm("macs", "hmac-sha2-256-etm@openssh.com"), null);
eq(classifyAlgorithm("macs", "umac-128-etm@openssh.com"), null);
eq(classifyAlgorithm("kexalgorithms", "diffie-hellman-group1-sha1")?.tone, "danger");
eq(classifyAlgorithm("kexalgorithms", "diffie-hellman-group14-sha1")?.tone, "warn");
eq(classifyAlgorithm("kexalgorithms", "diffie-hellman-group-exchange-sha1")?.tone, "warn");
eq(classifyAlgorithm("kexalgorithms", "diffie-hellman-group14-sha256"), null);
eq(classifyAlgorithm("kexalgorithms", "curve25519-sha256"), null);
eq(classifyAlgorithm("kexalgorithms", "mlkem768x25519-sha256"), null);
eq(classifyAlgorithm("hostkeyalgorithms", "ssh-rsa")?.tone, "warn");
eq(classifyAlgorithm("hostkeyalgorithms", "ssh-rsa-cert-v01@openssh.com")?.tone, "warn");
eq(classifyAlgorithm("hostkeyalgorithms", "ssh-dss")?.tone, "danger");
eq(classifyAlgorithm("hostkeyalgorithms", "rsa-sha2-512"), null);
eq(classifyAlgorithm("pubkeyacceptedalgorithms", "ssh-rsa")?.tone, "warn");
for (const k of Object.keys(OPENSSH_DEFAULTS) as (keyof typeof OPENSSH_DEFAULTS)[]) {
  for (const n of OPENSSH_DEFAULTS[k]) {
    const c = classifyAlgorithm(k, n);
    // the only default flagged anywhere is HMAC-SHA1 in MACs
    if (c) ok(k === "macs" && n.startsWith("hmac-sha1"), `${k} ${n}`);
  }
}

eq(row("Ciphers aes128-cbc,aes256-ctr", "ciphers").tone, "warn");
eq(row("Ciphers aes256-ctr,3des-cbc", "ciphers").tone, "danger");
eq(row("Ciphers +aes128-cbc", "ciphers").tone, "warn");
eq(row("MACs hmac-sha2-256-etm@openssh.com", "macs").tone, "ok");
eq(row("MACs -hmac-sha1*", "macs").tone, "ok");
eq(row("KexAlgorithms curve25519-sha256", "kexalgorithms").tone, "info"); // no PQ hybrid
ok(row("KexAlgorithms curve25519-sha256", "kexalgorithms").note.includes("post-quantum"));
eq(row("KexAlgorithms mlkem768x25519-sha256,curve25519-sha256", "kexalgorithms").tone, "ok");
eq(row("KexAlgorithms diffie-hellman-group1-sha1", "kexalgorithms").tone, "danger");
eq(row("HostKeyAlgorithms +ssh-rsa", "hostkeyalgorithms").tone, "warn");
eq(row("HostKeyAlgorithms +ssh-dss", "hostkeyalgorithms").tone, "danger");
eq(row("PubkeyAcceptedKeyTypes +ssh-rsa", "pubkeyacceptedalgorithms").tone, "warn");
eq(row("Ciphers aes256-gcm", "ciphers").tone, "info");
eq(row("Ciphers aes256-ctr,,x", "ciphers").tone, "danger");
ok(has("Ciphers aes128-ctr, aes256-ctr", (f) => f.tone === "danger" && f.title === "Ciphers has extra arguments"));
ok(has("Ciphers chacha20-poly1305@openssh.com,aes256-ctr", (f) => f.title.includes("Terrapin")));
ok(!has("Ciphers aes256-gcm@openssh.com", (f) => f.title.includes("Terrapin")));

/* ------------------------------------------------------------ Match blocks */

const m1 = "PasswordAuthentication no\nMatch User backup\n  PasswordAuthentication yes\n  PermitRootLogin yes\n";
const r1 = row(m1, "passwordauthentication");
eq(r1.value, "no");
eq(r1.tone, "ok");
eq(r1.overrides, [{ scope: "Match User backup (line 2)", line: 3, value: "yes" }]);
ok(has(m1, (f) => f.scope === "Match User backup (line 2)" && f.line === 3 && f.tone === "warn" && f.detail.startsWith("For connections matching User backup")));
ok(has(m1, (f) => f.scope === "Match User backup (line 2)" && f.line === 4 && f.tone === "danger"));
eq(row(m1, "permitrootlogin").isDefault, true);

// Match all overrides global for every connection
const ma = "X11Forwarding no\nMatch all\n  X11Forwarding yes\n";
eq(row(ma, "x11forwarding").value, "yes");
eq(row(ma, "x11forwarding").source, "Match all, line 3");
eq(row(ma, "x11forwarding").tone, "warn");
eq(row(ma, "x11forwarding").overrides.length, 0);

// first matching block wins among Match all blocks
const ma2 = "Match all\n  LogLevel VERBOSE\nMatch all\n  LogLevel QUIET\n";
eq(row(ma2, "loglevel").value, "VERBOSE");

// keywords not allowed in Match
ok(has("Match User x\n  Ciphers aes128-ctr\n", (f) => f.tone === "danger" && f.title === "Ciphers is not allowed in a Match block"));
ok(has("Match User x\n  Port 2222\n", (f) => f.title === "Port is not allowed in a Match block"));
ok(has("Match User x\n  UsePAM no\n", (f) => f.title === "UsePAM is not allowed in a Match block"));
ok(!has("Match User x\n  PasswordAuthentication no\n", (f) => f.title.includes("not allowed")));
ok(!has("Match User x\n  Subsystem sftp internal-sftp\n", (f) => f.title.includes("not allowed"))); // no claim made

// indentation trap
const ind = "Match User deploy\n    X11Forwarding yes\nPasswordAuthentication no\n";
ok(has(ind, (f) => f.title === "Indentation does not end a Match block" && f.line === 3));
eq(row(ind, "passwordauthentication").isDefault, true);
eq(row(ind, "passwordauthentication").overrides[0].value, "no");
ok(!has("Match User deploy\nX11Forwarding yes\n", (f) => f.title.includes("Indentation")));

// malformed Match lines
ok(has("Match\n", (f) => f.title === "Match with no criteria"));
ok(has("Match all User x\n", (f) => f.title === "Match all combined with other criteria"));

// allow lists
ok(!has("AllowGroups ssh-users\n", (f) => f.title === "No AllowUsers or AllowGroups"));
ok(has("Match User x\n  AllowUsers x\n", (f) => f.title === "No AllowUsers or AllowGroups" && f.detail.startsWith("Only some Match")));
ok(has("AllowUsers a\nAllowGroups g\n", (f) => f.title === "AllowUsers and AllowGroups are both set"));
eq(auditConfig("AllowGroups admins ops\n").allowGroups, ["admins", "ops"]);

/* ----------------------------------------------------- other line issues */

ok(has("Include /etc/ssh/sshd_config.d/*.conf\n", (f) => f.title === "Included files are not audited" && f.line === 1));
ok(has("HostKey /etc/ssh/ssh_host_dsa_key\n", (f) => f.title === "DSA host key"));
ok(!has("HostKey /etc/ssh/ssh_host_ecdsa_key\n", (f) => f.title === "DSA host key"));
ok(has("PermitRootLogin no # keep root out\n", (f) => f.title === "Comment after a value"));
eq(row("PermitRootLogin no # keep root out\n", "permitrootlogin").value, "no");
ok(has("PermitRootLogin\n", (f) => f.title === "PermitRootLogin has no value"));
ok(has("PermitRootLogin no yes\n", (f) => f.title === "PermitRootLogin has extra arguments"));
ok(has("PermitRootLogn no\n", (f) => f.title === "Unknown keyword PermitRootLogn"));
ok(has("UsePrivilegeSeparation sandbox\n", (f) => f.title === "UsePrivilegeSeparation is obsolete"));
ok(has('Banner "/etc/issue.net\n', (f) => f.title.includes("unbalanced quotes")));

/* ----------------------------------------------------------- examples */

const legacy = auditConfig(EXAMPLES.find((e) => e.id === "legacy")!.config);
ok(legacy.counts.danger >= 8, `danger ${legacy.counts.danger}`);
for (const key of ["permitrootlogin", "permitemptypasswords", "ciphers", "macs", "kexalgorithms", "hostkeyalgorithms", "protocol"]) {
  eq(legacy.rows.find((r) => r.key === key)?.tone, "danger", key);
}
eq(legacy.rows.find((r) => r.key === "passwordauthentication")?.value, "yes");
ok(legacy.findings.some((f) => f.title === "DSA host key"));
ok(legacy.findings.some((f) => f.title === "Indentation does not end a Match block"));
ok(legacy.findings.some((f) => f.title === "UsePAM is not allowed in a Match block"));
// findings sorted most severe first
const ranks = legacy.findings.map((f) => ({ danger: 3, warn: 2, info: 1, ok: 0 })[f.tone]);
ok(ranks.every((r, i) => i === 0 || ranks[i - 1] >= r));

const ubuntu = auditConfig(EXAMPLES.find((e) => e.id === "ubuntu")!.config);
eq(ubuntu.counts.danger, 0);
ok(ubuntu.findings.some((f) => f.key === "include"));
eq(ubuntu.rows.find((r) => r.key === "x11forwarding")?.tone, "warn");
eq(ubuntu.rows.find((r) => r.key === "kbdinteractiveauthentication")?.tone, "ok");

const hard = auditConfig(EXAMPLES.find((e) => e.id === "hardened")!.config);
eq(hard.counts.danger, 0);
eq(hard.counts.warn, 0, JSON.stringify(hard.findings.filter((f) => f.tone === "warn")));
eq(hard.allowGroups, ["ssh-users", "sftp-only"]);

/* ------------------------------------------------------------ snippet */

const s99 = hardenedSnippet("9.9");
ok(s99.includes("KexAlgorithms mlkem768x25519-sha256,"));
ok(s99.includes("KbdInteractiveAuthentication no"));
ok(s99.includes("# AllowGroups ssh-users"));
const s88 = hardenedSnippet("8.8", ["alice"], ["admins"]);
ok(!s88.includes("mlkem"));
ok(!s88.includes("sntrup761x25519-sha512,"));
ok(s88.includes("sntrup761x25519-sha512@openssh.com"));
ok(s88.includes("AllowUsers alice"));
ok(s88.includes("AllowGroups admins"));
ok(!s88.includes("# AllowGroups ssh-users"));
const s74 = hardenedSnippet("7.4");
ok(s74.includes("ChallengeResponseAuthentication no"));
ok(!s74.includes("KbdInteractiveAuthentication"));
ok(!s74.includes("sntrup"));
ok(!s74.includes("rsa-sha2-512-cert-v01"));
// a hostile allow list cannot inject lines
ok(!hardenedSnippet("9.9", ["a\nPermitRootLogin yes"]).includes("PermitRootLogin yes"));

// The snippet audits clean: no danger, no warn, apart from the allow list it leaves commented.
for (const t of ["9.9", "8.8", "7.4"] as const) {
  const res = auditConfig(hardenedSnippet(t, [], ["ssh-users"]));
  eq(res.counts.danger, 0, t);
  eq(res.findings.filter((f) => f.tone === "warn").map((f) => f.title), [], t);
  // every line in the snippet is a known keyword
  ok(!res.findings.some((f) => f.title.startsWith("Unknown keyword")), t);
}
// the 7.4 snippet contains no name the 9.9 classifier calls weak or unknown
const algoRows = auditConfig(hardenedSnippet("7.4")).rows.filter((r) => ["ciphers", "macs", "kexalgorithms", "hostkeyalgorithms"].includes(r.key));
for (const r of algoRows) ok(!r.note.includes("Weak") && !r.note.includes("Not in this auditor's list"), r.key);

/* ---------------------------------------------------- adversarial input */

const nasty = [
  "",
  "\u0000\u0000",
  "=".repeat(1000),
  "Match\nMatch\nMatch all\n",
  "'".repeat(500),
  "\\".repeat(500),
  "Ciphers " + "a,".repeat(10000),
  "PermitRootLogin " + "‮".repeat(50),
  "<script>alert(1)</script>",
  Array.from({ length: 2000 }, (_, i) => `Match User u${i}\n  PasswordAuthentication yes`).join("\n"),
];
for (const s of nasty) {
  const r = auditConfig(s);
  ok(Array.isArray(r.findings) && Array.isArray(r.rows));
}
/* ------------------------------------------------- later additions */

// LogLevel INFO already logs the accepted key's fingerprint; it is acceptable.
eq(row("LogLevel INFO", "loglevel").tone, "ok");
eq(row("", "loglevel").tone, "ok");
// LoginGraceTime 0 names the regreSSHion stopgap.
ok(row("LoginGraceTime 0", "logingracetime").note.includes("CVE-2024-6387"));
// Protocol wording reflects the compile-time default in 7.0 to 7.3.
ok(row("Protocol 1", "protocol").note.includes("7.4 removed it"));

// DisableForwarding overrides the individual forwarding options (sshd_config(5)).
const dfg = "DisableForwarding yes\nX11Forwarding yes\nAllowTcpForwarding yes\nAllowAgentForwarding yes\nGatewayPorts yes\nAllowGroups ssh";
for (const k of ["x11forwarding", "allowtcpforwarding", "allowagentforwarding", "gatewayports"]) {
  eq(row(dfg, k).tone, "ok", k);
  ok(row(dfg, k).note.includes("DisableForwarding"), k);
}
eq(row(dfg, "disableforwarding").value, "yes");
eq(row("", "disableforwarding").isDefault, true);
// An invalid value still reports even under DisableForwarding.
eq(row("DisableForwarding yes\nAllowTcpForwarding maybe", "allowtcpforwarding").tone, "danger");
// PermitTunnel is not covered by DisableForwarding.
eq(row("DisableForwarding yes\nPermitTunnel yes", "permittunnel").tone, "warn");
// Per-block DisableForwarding silences a Match override.
ok(!has("AllowGroups x\nMatch User a\n  DisableForwarding yes\n  GatewayPorts yes", (f) => f.key === "gatewayports"));
ok(has("AllowGroups x\nMatch User a\n  GatewayPorts yes", (f) => f.key === "gatewayports" && f.scope.startsWith("Match User a")));

// ForceCommand or ChrootDirectory with forwarding still on is flagged.
const sftp = "AllowGroups sftp\nSubsystem sftp internal-sftp\nMatch Group sftp\n  ChrootDirectory /srv/%u\n  ForceCommand internal-sftp";
ok(has(sftp, (f) => f.tone === "warn" && f.title.startsWith("Forwarding still allowed") && f.line === 4));
ok(!has(sftp + "\n  AllowTcpForwarding no", (f) => f.title.startsWith("Forwarding still allowed")));
ok(!has(sftp + "\n  DisableForwarding yes", (f) => f.title.startsWith("Forwarding still allowed")));
ok(!has("AllowTcpForwarding no\n" + sftp, (f) => f.title.startsWith("Forwarding still allowed")));
ok(has("DisableForwarding yes\n" + sftp + "\n  DisableForwarding no", (f) => f.title.startsWith("Forwarding still allowed")));
ok(has(sftp.replace("  ChrootDirectory /srv/%u\n", ""), (f) => f.title.startsWith("Forwarding still allowed") && f.detail.includes("ForceCommand")));
ok(has(sftp + "\n  AllowTcpForwarding local", (f) => f.title.startsWith("Forwarding still allowed") && f.detail.includes("local")));
// The hardened example disables forwarding globally, so it stays clean.
ok(!has(EXAMPLES.find((e) => e.id === "hardened")!.config, (f) => f.title.startsWith("Forwarding still allowed")));

// PubkeyAcceptedAlgorithms inside a Match block is judged for that block.
ok(has("AllowGroups x\nMatch User legacy\n  PubkeyAcceptedAlgorithms +ssh-rsa", (f) => f.key === "pubkeyacceptedalgorithms" && f.tone === "warn" && f.scope.includes("legacy")));

// Findings are capped for display; counts still cover everything.
const flood = Array.from({ length: 2000 }, (_, i) => `Match User u${i}\n  PasswordAuthentication yes`).join("\n");
const fr = auditConfig(flood);
eq(fr.findings.length, MAX_FINDINGS);
ok(fr.hiddenFindings > 0);
eq(fr.counts.danger + fr.counts.warn + fr.counts.info, MAX_FINDINGS + fr.hiddenFindings);
eq(auditConfig("PermitRootLogin no").hiddenFindings, 0);

// Allow lists with user@CIDR patterns survive into the snippet.
ok(hardenedSnippet("9.9", ["alice@10.0.0.0/8", "bob@[2001:db8::1]", "evil\"x"], []).includes("AllowUsers alice@10.0.0.0/8 bob@[2001:db8::1]\n"));
ok(!hardenedSnippet("9.9", ['evil"x'], []).includes("evil"));

// A leading byte order mark is ignored.
eq(row("\uFEFFPermitRootLogin yes", "permitrootlogin").value, "yes");

// Trailing comment advice no longer claims every old release refuses the file.
ok(has("PermitRootLogin no # yes", (f) => f.title === "Comment after a value" && f.detail.includes("AllowUsers")));

// PermitRootLogin yes is critical with passwords on, a warning with them off.
eq(row("PasswordAuthentication no\nPermitRootLogin yes", "permitrootlogin").tone, "warn");
eq(row("PasswordAuthentication yes\nPermitRootLogin yes", "permitrootlogin").tone, "danger");
// A Match block judges with its own PasswordAuthentication.
ok(has("AllowGroups x\nMatch User ops\n  PasswordAuthentication no\n  PermitRootLogin yes", (f) => f.key === "permitrootlogin" && f.tone === "warn" && f.scope.includes("ops")));
ok(has("AllowGroups x\nPasswordAuthentication no\nMatch User ops\n  PasswordAuthentication yes\n  PermitRootLogin yes", (f) => f.key === "permitrootlogin" && f.tone === "danger"));

// Long lists of unknown names are summarized, not echoed in full.
const wall = row("Ciphers " + Array.from({ length: 500 }, (_, i) => `bogus${i}`).join(","), "ciphers");
ok(wall.note.includes("and 490 more") && wall.note.length < 600, wall.note.length.toString());

eq(worstTone(["info", "danger", "warn"]), "danger");
eq(worstTone([]), "ok");
ok(!JSON.stringify([legacy, ubuntu, hard, s99, s88, s74]).includes("—"));


/* ===================================================================
 * Independent verifier cases (second pass). Reference behavior comes
 * from sshd_config(5), servconf.c (first value wins, Match handling,
 * SSHCFG_GLOBAL keywords), kex_assemble_names() for the + - ^ lists,
 * misc.c convtime() and the OpenSSH 9.9 default algorithm lists.
 * ================================================================= */
{
  const A = (cfg: string) => auditConfig(cfg);
  const rowOf = (cfg: string, key: string) => row(cfg, key);

  // Keywords are case-insensitive; "=" with or without spaces separates.
  for (const cfg of ["pErMiTrOoTlOgIn no", "PermitRootLogin=no", "PermitRootLogin = no", "PermitRootLogin= no", 'PermitRootLogin "no"', "\tPermitRootLogin   no   "]) {
    const r = rowOf(cfg, "permitrootlogin");
    eq(r.value, "no", cfg);
    eq(r.tone, "ok", cfg);
    eq(r.isDefault, false, cfg);
  }
  // Values like YES are compared case-insensitively.
  eq(rowOf("PermitRootLogin YES\nPasswordAuthentication yes", "permitrootlogin").tone, "danger");
  // First value wins, and the later line is reported.
  eq(rowOf("PermitRootLogin no\nPermitRootLogin yes", "permitrootlogin").value, "no");
  ok(has("PermitRootLogin no\nPermitRootLogin yes", (f) => f.title.includes("has no effect") && f.line === 2));
  // Match all replaces the global value; a conditional block only adds an override.
  const ma = rowOf("PermitRootLogin no\nMatch all\n  PermitRootLogin yes", "permitrootlogin");
  eq(ma.value, "yes");
  ok(ma.source.startsWith("Match all"));
  const mc = rowOf("PermitRootLogin no\nMatch User bob\n  PermitRootLogin yes", "permitrootlogin");
  eq(mc.value, "no");
  eq(mc.overrides.length, 1);
  ok(mc.overrides[0].scope.includes("User bob"));
  // A global line after a Match block belongs to the block.
  const after = parseConfig("Match User bob\n  X11Forwarding yes\nPermitRootLogin yes");
  eq(after.global.length, 0);
  eq(after.blocks[0].directives.length, 2);
  // Global-only keywords inside Match are fatal in sshd -t.
  for (const k of ["Ciphers aes256-ctr", "MACs hmac-sha2-256", "KexAlgorithms curve25519-sha256", "UsePAM yes", "Port 2222", "LoginGraceTime 30", "StrictModes yes", "PermitUserEnvironment no"]) {
    ok(has(`Match User x\n  ${k}`, (f) => f.tone === "danger" && f.title.includes("not allowed in a Match block")), k);
  }
  for (const k of ["PasswordAuthentication no", "PermitRootLogin no", "AllowTcpForwarding no", "X11Forwarding no", "LogLevel VERBOSE"]) {
    ok(!has(`Match User x\n  ${k}`, (f) => f.title.includes("not allowed in a Match block")), k);
  }

  // + - ^ against the 9.9 defaults (kex_assemble_names).
  eq(effectiveAlgorithms("ciphers", "-*-ctr").list, ["chacha20-poly1305@openssh.com", "aes128-gcm@openssh.com", "aes256-gcm@openssh.com"]);
  const noSha1 = effectiveAlgorithms("macs", "-hmac-sha1*").list;
  ok(!noSha1.some((m) => m.includes("sha1")) && noSha1.length === OPENSSH_DEFAULTS.macs.length - 2);
  const g1 = effectiveAlgorithms("kexalgorithms", "+diffie-hellman-group1-sha1");
  eq(g1.list.at(-1), "diffie-hellman-group1-sha1");
  eq(g1.list.length, OPENSSH_DEFAULTS.kexalgorithms.length + 1);
  eq(rowOf("KexAlgorithms +diffie-hellman-group1-sha1", "kexalgorithms").tone, "danger");
  const caret = effectiveAlgorithms("hostkeyalgorithms", "^ssh-rsa");
  eq(caret.list[0], "ssh-rsa");
  eq(caret.list.length, OPENSSH_DEFAULTS.hostkeyalgorithms.length + 1);
  eq(rowOf("HostKeyAlgorithms ^ssh-rsa", "hostkeyalgorithms").tone, "warn");
  eq(effectiveAlgorithms("ciphers", "+aes256-ctr").list, OPENSSH_DEFAULTS.ciphers);
  // Signature lists accept wildcards in every mode (sshkey_names_valid2 with allow_wildcard).
  const wild = effectiveAlgorithms("hostkeyalgorithms", "ssh-ed25519*");
  eq(wild.error, null);
  eq(wild.list, ["ssh-ed25519-cert-v01@openssh.com", "ssh-ed25519"]);
  const plusRsa = effectiveAlgorithms("pubkeyacceptedalgorithms", "+ssh-rsa*");
  eq(plusRsa.error, null);
  ok(plusRsa.list.includes("ssh-rsa") && plusRsa.list.includes("ssh-rsa-cert-v01@openssh.com"));
  eq(rowOf("PubkeyAcceptedAlgorithms +ssh-rsa*", "pubkeyacceptedalgorithms").tone, "warn");
  const nomatch = effectiveAlgorithms("pubkeyacceptedalgorithms", "zzz-*");
  eq(nomatch.error, null);
  eq(nomatch.unknown, ["zzz-*"]);
  eq(rowOf("PubkeyAcceptedAlgorithms zzz-*", "pubkeyacceptedalgorithms").tone, "info");
  // Ciphers, MACs and KexAlgorithms are checked name by name: a pattern outside a - list is fatal.
  ok(effectiveAlgorithms("ciphers", "aes*").error !== null);
  ok(effectiveAlgorithms("macs", "+hmac-sha2-*").error !== null);
  ok(effectiveAlgorithms("kexalgorithms", "curve25519-sha256,").error !== null);
  eq(rowOf("Ciphers aes256-ctr,,aes128-ctr", "ciphers").tone, "danger");
  // A space after a comma splits the list into extra arguments.
  ok(has("Ciphers aes128-ctr, aes256-ctr", (f) => f.tone === "danger" && f.title.includes("extra arguments")));
  // Weak algorithm classes from the spec.
  eq(classifyAlgorithm("ciphers", "aes128-cbc")?.tone, "warn");
  eq(classifyAlgorithm("ciphers", "3des-cbc")?.tone, "danger");
  eq(classifyAlgorithm("ciphers", "arcfour256")?.tone, "danger");
  eq(classifyAlgorithm("macs", "hmac-md5-96")?.tone, "danger");
  eq(classifyAlgorithm("macs", "hmac-sha1-etm@openssh.com")?.tone, "warn");
  eq(classifyAlgorithm("kexalgorithms", "diffie-hellman-group1-sha1")?.tone, "danger");
  eq(classifyAlgorithm("kexalgorithms", "diffie-hellman-group14-sha1")?.tone, "warn");
  eq(classifyAlgorithm("kexalgorithms", "diffie-hellman-group14-sha256"), null);
  eq(classifyAlgorithm("hostkeyalgorithms", "ssh-dss")?.tone, "danger");
  eq(classifyAlgorithm("hostkeyalgorithms", "rsa-sha2-512"), null);
  eq(classifyAlgorithm("ciphers", "aes256-gcm@openssh.com"), null);

  // Integer and time limits: strtonum and convtime stop at INT_MAX.
  eq(rowOf("MaxAuthTries 2147483647", "maxauthtries").tone, "warn");
  eq(rowOf("MaxAuthTries 2147483648", "maxauthtries").tone, "danger");
  eq(rowOf("MaxAuthTries -1", "maxauthtries").tone, "danger");
  eq(rowOf("MaxAuthTries 4", "maxauthtries").tone, "ok");
  eq(rowOf("MaxAuthTries 7", "maxauthtries").tone, "warn");
  eq(parseSshdTime("2m"), 120);
  eq(parseSshdTime("1h30m"), 5400);
  eq(parseSshdTime("1W"), 604800);
  eq(parseSshdTime("2147483647"), 2147483647);
  eq(parseSshdTime("2147483648"), null);
  eq(parseSshdTime("9999999w"), null);
  eq(parseSshdTime("1x"), null);
  eq(parseSshdTime(""), null);
  eq(rowOf("LoginGraceTime 0", "logingracetime").tone, "warn");
  eq(rowOf("LoginGraceTime 2m", "logingracetime").tone, "info");
  eq(rowOf("LoginGraceTime 30s", "logingracetime").tone, "ok");
  eq(rowOf("LoginGraceTime 99999999999", "logingracetime").tone, "danger");

  // Keyboard-interactive through PAM is a password path too.
  const pamRoot = "PasswordAuthentication no\nUsePAM yes\nPermitRootLogin yes\nAllowGroups x";
  eq(rowOf(pamRoot, "permitrootlogin").tone, "danger");
  eq(rowOf(`${pamRoot}\nKbdInteractiveAuthentication no`, "permitrootlogin").tone, "warn");
  eq(rowOf(`ChallengeResponseAuthentication no\n${pamRoot}`, "permitrootlogin").tone, "warn");
  eq(rowOf("PasswordAuthentication no\nPermitRootLogin yes", "permitrootlogin").tone, "warn");
  ok(rowOf(`${pamRoot}\nPermitEmptyPasswords yes`, "permitemptypasswords").note.includes("PAM"));
  eq(rowOf("PermitEmptyPasswords yes", "permitemptypasswords").tone, "danger");
  // ...and inside a Match block, judged with that block's own settings.
  ok(has("UsePAM yes\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nMatch User ops\n  KbdInteractiveAuthentication yes\n  PermitRootLogin yes", (f) => f.key === "permitrootlogin" && f.tone === "danger" && f.scope.includes("ops")));
  ok(has("UsePAM yes\nPasswordAuthentication no\nMatch User ops\n  KbdInteractiveAuthentication no\n  PermitRootLogin yes", (f) => f.key === "permitrootlogin" && f.tone === "warn" && f.scope.includes("ops")));

  // Malformed and hostile input never throws.
  for (const cfg of ["", " ", "\n\n\n", "# only a comment", "﻿", "=yes", "Match", 'Banner "unterminated', "PermitRootLögin yes", "\u0000\u0001", "😀 😀", "Match all User x", "a=b=c=d", "Ciphers +", "Ciphers -", "Ciphers ^"]) {
    const r = A(cfg);
    ok(Array.isArray(r.rows) && r.rows.length > 0, JSON.stringify(cfg));
  }
  ok(has("=yes", (f) => f.title === "Line with no keyword" && f.tone === "danger"));
  ok(has("Match", (f) => f.title === "Match with no criteria"));
  ok(has("Match all User x", (f) => f.title.includes("Match all combined")));
  ok(has('Banner "unterminated', (f) => f.title.includes("unbalanced quotes")));
  ok(has("PermitRootLögin yes", (f) => f.title.startsWith("Unknown keyword")));
  // A no-break space glues words together for sshd; flagged, then audited as a space.
  const nbsp = "PermitRootLogin no";
  ok(has(nbsp, (f) => f.title === "Unicode space in a line" && f.line === 1));
  eq(rowOf(nbsp, "permitrootlogin").value, "no");
  // Caps.
  const big = A("PermitRootLogin no\n" + "#".repeat(250_000));
  ok(big.parsed.truncated);
  const many = A(Array.from({ length: 6000 }, (_, i) => `AcceptEnv V${i}`).join("\n"));
  ok(many.parsed.truncated && many.parsed.lineCount === MAX_LINES);
  const noisy = A(Array.from({ length: 2000 }, (_, i) => `Bogus${i} x`).join("\n"));
  ok(noisy.findings.length === MAX_FINDINGS && noisy.hiddenFindings > 0);
  // Protocol and DSA host keys.
  eq(rowOf("Protocol 1", "protocol").tone, "danger");
  eq(rowOf("Protocol 2,1", "protocol").tone, "danger");
  eq(rowOf("Protocol 2", "protocol").tone, "info");
  ok(has("HostKey /etc/ssh/ssh_host_dsa_key", (f) => f.title === "DSA host key"));
  ok(!has("HostKey /etc/ssh/ssh_host_ecdsa_key", (f) => f.title === "DSA host key"));
  // Missing allow lists are flagged; both lists set is noted.
  ok(has("PermitRootLogin no", (f) => f.title === "No AllowUsers or AllowGroups"));
  ok(!has("AllowGroups ssh-users", (f) => f.title === "No AllowUsers or AllowGroups"));
  ok(has("AllowGroups a\nAllowUsers b", (f) => f.title.includes("both set")));
  // AllowUsers accumulates across lines.
  eq(rowOf("AllowUsers alice\nAllowUsers bob", "allowusers").value, "alice bob");

  // Snippets only use names that exist in the oldest release of each range.
  const s74 = hardenedSnippet("7.4");
  const s88 = hardenedSnippet("8.8");
  const s99 = hardenedSnippet("9.9");
  ok(!/mlkem|sntrup|rsa-sha2-\d+-cert|KbdInteractiveAuthentication/.test(s74) && s74.includes("ChallengeResponseAuthentication no"));
  ok(!/mlkem|sntrup761x25519-sha512,/.test(s88) && s88.includes("sntrup761x25519-sha512@openssh.com"));
  ok(s99.includes("mlkem768x25519-sha256") && !s99.includes("Terrapin"));
  ok(s88.includes("Terrapin") && s74.includes("Terrapin"));
  // Every algorithm in every snippet passes this auditor with no weak entry.
  for (const snip of [s74, s88, s99]) {
    const r = A(snip);
    for (const k of ["ciphers", "macs", "kexalgorithms", "hostkeyalgorithms"]) {
      const rr = r.rows.find((x) => x.key === k)!;
      ok(rr.tone === "ok" || (k === "kexalgorithms" && snip === s74 && rr.tone === "info"), `${k} ${rr.tone} ${rr.note}`);
    }
    ok(!r.findings.some((f) => f.tone === "danger"));
  }
  // The Terrapin note names the CBC condition for EtM.
  ok(A("MACs hmac-sha2-256-etm@openssh.com").findings.some((f) => f.title.startsWith("Terrapin") && f.detail.includes("CBC")));
}

console.log(`sshd-config-auditor: ${count} assertions passed`);
