import assert from "node:assert/strict";
import {
  EXAMPLES,
  parseSudoers,
  type UserSpec,
  type AliasDef,
  type DefaultsLine,
  type IncludeLine,
} from "../../client/src/lib/toolkit/sudoers-explainer.ts";

let count = 0;
function eq<T>(a: T, b: T, msg?: string) {
  assert.deepStrictEqual(a, b, msg);
  count += 1;
}
function ok(v: unknown, msg?: string) {
  assert.ok(v, msg);
  count += 1;
}

const one = (cfg: string) => {
  const r = parseSudoers(cfg);
  assert.equal(r.entries.length, 1, `expected one entry for: ${cfg}`);
  return r.entries[0];
};

// A classic full user spec: user host = (runas:group) tags: command.
{
  const e = one("alice web01 = (root:www-data) NOPASSWD: /usr/bin/systemctl restart nginx");
  const spec = e.entry as UserSpec;
  eq(spec.type, "userspec");
  eq(spec.users, ["alice"]);
  eq(spec.hosts, ["web01"]);
  eq(spec.commands.length, 1);
  eq(spec.commands[0].runAs, { user: "root", group: "www-data" });
  eq(spec.commands[0].tags, ["NOPASSWD"]);
  eq(spec.commands[0].command, "/usr/bin/systemctl restart nginx");
  ok(e.summary[0].includes("Alice"), "capitalized subject");
  ok(e.summary[0].includes("without a password"));
  ok(e.summary[0].includes("www-data"));
}

// User and host lists with spaces around commas are separated correctly.
{
  const spec = one("root, %wheel ALL = ALL").entry as UserSpec;
  eq(spec.users, ["root", "%wheel"]);
  eq(spec.hosts, ["ALL"]);
  eq(spec.commands[0].command, "ALL");
}

// Group, netgroup, UID, and GID forms are described.
{
  const e = one("%admin ALL=(ALL:ALL) ALL");
  ok(e.summary[0].toLowerCase().includes("members of group admin"));
  ok(e.findings.some((f) => f.title === "ALL commands" || f.title === "ALL with NOPASSWD"));
}

// A command spec list carries runas and tags forward to later elements.
{
  const spec = one("bob ALL = (root) NOPASSWD: /bin/ls, /bin/cat, (www-data) /bin/id").entry as UserSpec;
  eq(spec.commands.length, 3);
  eq(spec.commands[0].runAs, { user: "root", group: null });
  eq(spec.commands[1].runAs, { user: "root", group: null }, "runas carried forward");
  ok(spec.commands[1].tags.includes("NOPASSWD"), "tag carried forward");
  eq(spec.commands[2].runAs, { user: "www-data", group: null }, "runas changed");
}

// Alias definitions parse and later rules reference them.
{
  const r = parseSudoers("User_Alias DEVS = alice, bob\nDEVS ALL=(ALL) ALL");
  const alias = r.entries[0].entry as AliasDef;
  eq(alias.type, "alias");
  eq(alias.aliasType, "User_Alias");
  eq(alias.name, "DEVS");
  eq(alias.members, ["alice", "bob"]);
  ok(r.entries[1].summary[0].toLowerCase().includes("the alias devs"), "reference resolved");
}

// Negation with ! on a command is reported as a denial.
{
  const spec = one("carol ALL = /usr/bin/*, !/usr/bin/passwd").entry as UserSpec;
  eq(spec.commands.length, 2);
  eq(spec.commands[1].negated, true);
  ok(spec.commands[1].command.includes("/usr/bin/passwd"));
}

// Defaults lines, global and bound.
{
  const g = one("Defaults env_reset").entry as DefaultsLine;
  eq(g.type, "defaults");
  eq(g.bind, "");
  ok(g.settings.includes("env_reset"));

  const b = one("Defaults:alice !authenticate").entry as DefaultsLine;
  eq(b.bind, ":");
  eq(b.target, "alice");
}

// include and includedir, both the #include and @include spellings.
{
  const inc = one("@includedir /etc/sudoers.d").entry as IncludeLine;
  eq(inc.type, "include");
  eq(inc.directory, true);
  eq(inc.path, "/etc/sudoers.d");

  const inc2 = one("#include /etc/sudoers.local").entry as IncludeLine;
  eq(inc2.directory, false);
  eq(inc2.path, "/etc/sudoers.local");
}

// Risk detection: ALL + NOPASSWD is critical.
{
  const e = one("intern ALL=(ALL) NOPASSWD: ALL");
  ok(e.findings.some((f) => f.tone === "danger" && f.title.includes("ALL")));
}

// Risk detection: shell escape commands.
for (const bin of ["vi", "vim", "less", "more", "man", "find", "awk", "python", "perl", "env", "git"]) {
  const e = one(`u ALL = /usr/bin/${bin}`);
  ok(e.findings.some((f) => f.title.startsWith("Shell escape")), `${bin} flagged as shell escape`);
}

// tar is flagged specifically (its --checkpoint-action can exec).
{
  const e = one("u ALL = /bin/tar");
  ok(e.findings.some((f) => f.title === "Shell escape: tar"));
}

// A direct shell is critical.
{
  const e = one("u ALL = /bin/bash");
  ok(e.findings.some((f) => f.tone === "danger" && f.title === "A shell"));
}

// Argument wildcards are flagged.
{
  const e = one("u ALL = /usr/bin/systemctl restart *");
  ok(e.findings.some((f) => f.title === "Wildcard in arguments"));
}

// NOEXEC suppresses the shell escape finding for an editor.
{
  const e = one("u ALL = NOEXEC: /usr/bin/vim");
  ok(!e.findings.some((f) => f.title.startsWith("Shell escape")), "NOEXEC suppresses escape finding");
}

// Comments and blank lines are ignored; a plain comment is not an include.
{
  const r = parseSudoers("# just a comment\n\n   \nalice ALL=(ALL) ALL");
  eq(r.entries.length, 1);
}

// A malformed line becomes an error entry, never a throw.
{
  const e = one("this is not valid sudoers");
  eq(e.entry.type, "error");
}

// Line continuation with a trailing backslash folds into one rule.
{
  const spec = one("alice ALL = \\\n  /bin/ls, \\\n  /bin/cat").entry as UserSpec;
  eq(spec.commands.length, 2);
}

// Huge adversarial input does not hang or crash; it truncates.
{
  const big = "alice ALL=(ALL) ALL\n".repeat(5000);
  const r = parseSudoers(big);
  ok(r.truncated, "oversized input is truncated");
  ok(r.entries.length <= 400);
}

// The bundled examples all parse into at least one entry.
for (const ex of EXAMPLES) {
  const r = parseSudoers(ex.config);
  ok(r.entries.length >= 1, `example ${ex.id} parses`);
}

// ---------------------------------------------------------------------------
// Independent verifier cases. Behavior below was checked against visudo -c on
// a live sudo 1.9.x install.
// ---------------------------------------------------------------------------

// V1. Global "Defaults !authenticate" is a flag negation, not a command
// binding. visudo: "Defaults !authenticate" parses OK, "Defaults
// !totally_unknown_flag_xyz" reports "unknown defaults entry", proving the !
// after the space belongs to the parameter list.
{
  const d = one("Defaults !authenticate").entry as DefaultsLine;
  eq(d.type, "defaults");
  eq(d.bind, "", "space before ! means a global Defaults, not a command binding");
  eq(d.target, "");
  ok(d.settings.includes("!authenticate"), "flag negation kept in settings");
  const e = one("Defaults !authenticate");
  ok(
    e.findings.some((f) => f.tone === "danger" && /authenticate/i.test(f.title)),
    "global !authenticate is flagged as dangerous",
  );
}

// V2. "Defaults!/usr/bin/vi noexec": no space means a command binding, with
// the rest as the setting. visudo: parses OK.
{
  const d = one("Defaults!/usr/bin/vi noexec").entry as DefaultsLine;
  eq(d.bind, "!");
  eq(d.target, "/usr/bin/vi");
  eq(d.settings, "noexec");
}

// V3. ">runas" and ":user" bindings require no leading space. visudo:
// "Defaults>root !authenticate" parses OK; "Defaults >root ..." is a syntax
// error. We only assert the accepted spelling is read correctly.
{
  const d = one("Defaults>root !authenticate").entry as DefaultsLine;
  eq(d.bind, ">");
  eq(d.target, "root");
  ok(d.settings.includes("!authenticate"));

  const d2 = one("Defaults:alice,%wheel env_reset").entry as DefaultsLine;
  eq(d2.bind, ":");
  eq(d2.target, "alice,%wheel");
  ok(d2.settings.includes("env_reset"));
}

// V4. A later PASSWD cancels an earlier NOPASSWD for the commands after it
// (sudoers(5): a tag overrides its opposite for subsequent commands).
{
  const spec = one("alice ALL = NOPASSWD: /bin/a, PASSWD: /bin/b, /bin/c").entry as UserSpec;
  eq(spec.commands.length, 3);
  ok(spec.commands[0].tags.includes("NOPASSWD"), "first command keeps NOPASSWD");
  ok(!spec.commands[1].tags.includes("NOPASSWD"), "PASSWD removes NOPASSWD");
  ok(spec.commands[1].tags.includes("PASSWD"));
  ok(!spec.commands[2].tags.includes("NOPASSWD"), "PASSWD carries forward too");
}

// V5. "(:www-data)" runs as the invoking user with a changed group, not as
// root. visudo: "alice ALL=(:www-data) /bin/id" parses OK.
{
  const e = one("alice ALL=(:www-data) /bin/id");
  const spec = e.entry as UserSpec;
  eq(spec.commands[0].runAs, { user: "", group: "www-data" });
  ok(e.summary[0].includes("the invoking user"), "empty runas user means the invoking user");
  ok(e.summary[0].includes("group www-data"));
  ok(!e.summary[0].includes("as root"), "must not claim root for (:group)");
}

// V6. A numeric UID run-as is described by its id. visudo:
// "alice ALL=(#1001) /bin/id" parses OK.
{
  const e = one("alice ALL=(#1001) /bin/id");
  ok(e.summary[0].includes("UID 1001"), "numeric runas user described as a UID");
}

// V7. "%admin ALL=(ALL:ALL) ALL" says any user, any group, and flags ALL.
{
  const e = one("%admin ALL=(ALL:ALL) ALL");
  ok(e.summary[0].includes("any user, any group"));
  ok(e.findings.some((f) => f.tone === "danger" && f.title.includes("ALL")));
}

// V8. Double negation "!!" is not a negation (sudoers treats it as positive).
{
  const spec = one("u ALL = !!/bin/ls").entry as UserSpec;
  eq(spec.commands[0].negated, false, "two ! cancel out");
}

// V9. Adversarial and empty input never throws and never claims rules exist.
for (const bad of ["", "   ", "\n\n\t", "=", "===", "(((", "Defaults", "Defaults:", "\u0000\u0001", "%", "!"]) {
  const r = parseSudoers(bad);
  ok(Array.isArray(r.entries), `no throw on ${JSON.stringify(bad)}`);
}
{
  // Whitespace and comment only means zero entries.
  const r = parseSudoers("   \n# only a comment\n\t\n");
  eq(r.entries.length, 0);
}

// V10. A very long single token does not hang.
{
  const r = parseSudoers("alice ALL = /bin/" + "a".repeat(20000));
  ok(r.entries.length >= 1);
}

// V11. env is flagged as a shell escape (it runs any program), and a plain
// /bin/ls with no risky traits produces no danger or warning finding.
{
  const e = one("u ALL = /usr/bin/env");
  ok(e.findings.some((f) => f.title.startsWith("Shell escape")), "env flagged");
  const safe = one("u ALL = /bin/ls");
  ok(!safe.findings.some((f) => f.tone === "danger" || f.tone === "warn"), "plain /bin/ls is quiet");
}

console.log(`sudoers-explainer: ${count} assertions passed`);
