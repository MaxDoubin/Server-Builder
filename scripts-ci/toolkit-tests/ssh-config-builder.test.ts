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

console.log(`ssh-config-builder: ${count} assertions passed`);
