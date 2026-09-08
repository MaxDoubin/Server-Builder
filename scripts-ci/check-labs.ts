/**
 * Every lab must be solvable by its own recorded solution.
 *
 * A lab is a simulated machine plus a predicate that says when the reader has
 * finished. Both drift: a command's output format changes, a scene's file
 * moves, a predicate is tightened. When they drift apart the lab becomes
 * unsolvable, and the only way anyone finds out is a reader spending an hour
 * on something that cannot be done.
 *
 * So each lab ships a transcript that solves it, and this replays it through
 * the real shell against a real build of the machine. That proves three
 * things at once: the lab is solvable, the predicate matches the intended
 * route, and every command the solution uses still works.
 *
 * It also checks the negative: an empty session must NOT report solved. A
 * predicate that is true before the reader types anything is the other way
 * this breaks, and it is invisible from the inside.
 *
 * Usage: npx tsx scripts-ci/check-labs.ts
 */

import { LABS, getLab } from "../client/src/lib/labs/labs";
import { fail, ok, out, parse, runLine } from "../client/src/lib/labs/shell";
import { baseMachine, cloneMachine, inNetwork, intToIp, ipToInt, routeFor } from "../client/src/lib/labs/machine";
import {
  baseName,
  cloneTree,
  dir,
  file,
  lookup,
  modeString,
  parentOf,
  resolvePath,
  segments,
  sizeOf,
} from "../client/src/lib/labs/vfs";
/* The other two IPv4 implementations on this site, for the cross-check below. */
import { parseAddress, toDotted } from "../client/src/lib/allocate/cidr";
import { inCidr, parseIPv4 } from "../client/src/lib/firewall/parse";
import { REGISTRY } from "../client/src/lib/labs/commands/index";

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

for (const lab of LABS) {
  if (lab.solution.length === 0) {
    note(lab.slug, "has no recorded solution");
    continue;
  }
  if (lab.hints.length === 0) note(lab.slug, "has no hints");
  if (lab.debrief.length === 0) note(lab.slug, "has no debrief");

  /* The negative: nothing typed, nothing solved. */
  if (lab.solved(lab.build())) {
    note(lab.slug, "reports solved before the reader has typed anything");
  }

  /* The positive: the recorded transcript solves it. */
  const machine = lab.build();
  const transcript: string[] = [];
  for (const line of lab.solution) {
    machine.history.push(line);
    const result = runLine(line, machine, REGISTRY);
    const text = result.lines.map((l) => `${l.stream === "err" ? "! " : "  "}${l.text}`).join("\n");
    transcript.push(`$ ${line}\n${text}`);

    /*
      A solution step that errors is a bug, even when the lab still passes.

      The permissions lab and the log-reading lab both shipped solutions in
      which every real command failed (Operation not permitted, Permission
      denied) and the final `answer` still satisfied the predicate, so the
      gate was green and neither lab was solvable. Checking only the
      predicate checks the last line of the transcript.

      Matched on failure shapes rather than on exit status, because plenty of
      legitimate steps exit non-zero: grep with no match is 1, and
      `systemctl is-active` on a failed unit is 3.
    */
    const BROKEN = [
      /: command not found$/,
      /Permission denied/,
      /Operation not permitted/,
      /No such file or directory/,
      /only understands/,
      /is not supported/,
      /not available in this lab/,
      /could not be found/,
      /invalid regular expression/,
      /unterminated quote/,
    ];
    for (const line of result.lines) {
      if (line.stream !== "err") continue;
      if (BROKEN.some((pattern) => pattern.test(line.text))) {
        note(lab.slug, `a solution step errored: ${line.text}`);
      }
    }
  }

  if (!lab.solved(machine)) {
    note(lab.slug, "its own recorded solution does not solve it");
    if (process.env.LAB_DEBUG) console.error(transcript.join("\n\n"));
  }
}

/* Reading links must resolve, same rule as the branching scenarios. */
const { postIndex } = await import("../client/src/lib/postIndex");
const { TOOLS } = await import("../client/src/lib/toolsRegistry");
const known = new Set([
  ...postIndex.map((post) => `/blog/${post.slug}`),
  ...TOOLS.map((tool) => `/tools/${tool.slug}`),
  "/labs", "/blog", "/tools", "/study", "/ncl", "/scenarios",
]);
for (const lab of LABS) {
  for (const link of lab.reading ?? []) {
    if (!known.has(link.href.split("#")[0].replace(/\/$/, ""))) {
      note(lab.slug, `reading link "${link.href}" does not resolve`);
    }
  }
}

if (LABS.length === 0) {
  console.error("FAIL  no labs are registered, so this check proved nothing.");
  process.exit(1);
}

/* ------------------------------------------------------ the address arithmetic */

/*
  Fifteen functions across labs.ts, machine.ts, shell.ts and vfs.ts were
  exported and named by nothing in this file until a check over every logic
  file found them. Three of them are a third IPv4 implementation: /allocate
  parses with shifts, /firewall parses with multiplication, and this parses
  with multiplication again but masks differently. Nothing compared any of
  them, and three implementations that disagree mean at least one of three
  surfaces teaches something wrong.
*/
let labSeed = 0x3c9d1b;
const nextLab = () => {
  labSeed ^= labSeed << 13;
  labSeed >>>= 0;
  labSeed ^= labSeed >>> 17;
  labSeed ^= labSeed << 5;
  labSeed >>>= 0;
  return labSeed;
};

let threeWay = 0;
for (let round = 0; round < 2000; round += 1) {
  const value = nextLab();
  const dotted = intToIp(value);

  /* All three parsers, and both renderers, on the same address. */
  if (dotted !== toDotted(value)) problems.push(`intToIp and /allocate's toDotted disagree on ${value}`);
  if (ipToInt(dotted) !== value) problems.push(`ipToInt(intToIp(${value})) is ${ipToInt(dotted)}`);
  if (ipToInt(dotted) !== parseAddress(dotted)) {
    problems.push(`ipToInt and /allocate's parseAddress disagree on ${dotted}`);
  }
  if (ipToInt(dotted) !== parseIPv4(dotted)) {
    problems.push(`ipToInt and /firewall's parseIPv4 disagree on ${dotted}`);
  }
  threeWay += 1;

  /* And the containment test, against /firewall's. */
  for (const bits of [0, 8, 16, 24, 30, 32]) {
    const cidr = `${dotted}/${bits}`;
    const probe = intToIp(nextLab());
    if (inNetwork(probe, cidr) !== inCidr(probe, cidr)) {
      problems.push(`inNetwork and /firewall's inCidr disagree on ${probe} in ${cidr}`);
    }
    if (!inNetwork(dotted, cidr)) problems.push(`${dotted} is not in its own ${cidr}`);
  }
  if (!inNetwork(dotted, "0.0.0.0/0")) problems.push(`${dotted} is not inside 0.0.0.0/0`);
}
if (threeWay < 2000) problems.push(`only ${threeWay} addresses were compared across the three implementations`);

for (const bad of ["", "10.0.0", "10.0.0.256", "ten.0.0.1"]) {
  if (ipToInt(bad) !== null) problems.push(`ipToInt("${bad}") returned ${ipToInt(bad)} rather than refusing`);
}
for (const bad of ["10.0.0.0/33", "10.0.0.0/-1", "10.0.0.0/x"]) {
  if (inNetwork("10.0.0.1", bad)) problems.push(`inNetwork accepted the malformed block "${bad}"`);
}

/*
  routeFor is longest prefix wins, which is the rule the whole lab depends on.
  Checked by construction: a more specific route that also contains the address
  has to take over from a less specific one.
*/
{
  const machine = baseMachine({
    routes: [
      { destination: "default", via: "10.0.0.1", dev: "eth0" },
      { destination: "10.0.0.0/8", dev: "eth0" },
      { destination: "10.1.2.0/24", dev: "eth1" },
    ],
  });
  const chosen = routeFor(machine, "10.1.2.5");
  if (chosen?.destination !== "10.1.2.0/24") {
    problems.push(`routeFor picked ${chosen?.destination} for 10.1.2.5 rather than the /24`);
  }
  if (routeFor(machine, "10.9.9.9")?.destination !== "10.0.0.0/8") {
    problems.push("routeFor did not fall back to the /8");
  }
  if (routeFor(machine, "8.8.8.8")?.destination !== "default") {
    problems.push("routeFor did not fall back to the default route");
  }
  /* With no default, an address outside every route has none. */
  const narrow = baseMachine({ routes: [{ destination: "10.0.0.0/8", dev: "eth0" }] });
  if (routeFor(narrow, "8.8.8.8") !== null) problems.push("routeFor invented a route");
  /* And whatever it picks must actually contain the address. */
  for (let round = 0; round < 500; round += 1) {
    const ip = intToIp(nextLab());
    const route = routeFor(machine, ip);
    if (route === null) continue;
    const cidr = route.destination === "default" ? "0.0.0.0/0" : route.destination;
    if (!inNetwork(ip, cidr)) problems.push(`routeFor gave ${ip} a route to ${cidr}, which does not contain it`);
  }
}

/* ------------------------------------------------------------ the machine */

/*
  baseMachine has to be independent between calls and cloneMachine has to be
  deep, or one lab's state leaks into the next and a reader sees a filesystem
  somebody else edited.
*/
{
  const first = baseMachine();
  first.hostname = "changed";
  first.groups.push("wheel");
  first.env.HOME = "/tmp";
  if (baseMachine().hostname === "changed") problems.push("baseMachine shares its hostname between calls");
  if (baseMachine().groups.includes("wheel")) problems.push("baseMachine shares its group list between calls");
  if (baseMachine().env.HOME === "/tmp") problems.push("baseMachine shares its environment between calls");

  const original = baseMachine();
  const copy = cloneMachine(original);
  copy.hostname = "other";
  copy.groups.push("wheel");
  copy.env.PATH = "/nowhere";
  copy.loadavg[0] = 99;
  copy.memory.total = 1;
  if (copy.disks[0]) copy.disks[0].used = 1;
  if (copy.routes[0]) copy.routes[0].dev = "eth9";
  if (copy.root.children) copy.root.children.injected = file("hello");
  if (original.hostname === "other") problems.push("cloneMachine shares the hostname");
  if (original.groups.includes("wheel")) problems.push("cloneMachine shares the group list");
  if (original.env.PATH === "/nowhere") problems.push("cloneMachine shares the environment");
  if (original.loadavg[0] === 99) problems.push("cloneMachine shares the load average");
  if (original.memory.total === 1) problems.push("cloneMachine shares the memory figures");
  if (original.disks[0]?.used === 1) problems.push("cloneMachine shares the disk list");
  if (original.routes[0]?.dev === "eth9") problems.push("cloneMachine shares the route list");
  if (original.root.children?.injected) problems.push("cloneMachine shares the filesystem");
}

/* getLab finds every lab by its slug and nothing else. */
for (const lab of LABS) {
  if (getLab(lab.slug)?.slug !== lab.slug) problems.push(`getLab("${lab.slug}") did not find it`);
}
if (getLab("no-such-lab") !== undefined) problems.push("getLab invented a lab");

/* --------------------------------------------------------- the filesystem */

/*
  resolvePath is the one with a security shape: `..` must never climb above
  the root, whatever it is given. Everything else here follows from it, and a
  lab shell whose path resolution can escape / would let a reader learn that
  it can.
*/
const PARTS = ["a", "b", "..", ".", "", "c", "..", "..", "d"];
let pathSeed = 0x6f1a3d;
const nextPath = () => {
  pathSeed ^= pathSeed << 13;
  pathSeed >>>= 0;
  pathSeed ^= pathSeed >>> 17;
  pathSeed ^= pathSeed << 5;
  pathSeed >>>= 0;
  return pathSeed;
};
const somePath = (absolute: boolean) => {
  const count = nextPath() % 8;
  const parts = [];
  for (let index = 0; index < count; index += 1) parts.push(PARTS[nextPath() % PARTS.length]);
  return (absolute ? "/" : "") + parts.join("/");
};

let escapes = 0;
let climbs = 0;
for (let round = 0; round < 4000; round += 1) {
  const cwd = resolvePath("/", somePath(true));
  const path = somePath(nextPath() % 2 === 0);
  const resolved = resolvePath(cwd, path);

  /* Always absolute, and never carrying a . or .. through. */
  if (!resolved.startsWith("/")) problems.push(`resolvePath("${cwd}", "${path}") is "${resolved}"`);
  if (segments(resolved).some((part) => part === "." || part === "..")) {
    problems.push(`resolvePath("${cwd}", "${path}") left "${resolved}" unresolved`);
  }
  if (/\/\//.test(resolved)) problems.push(`resolvePath("${cwd}", "${path}") doubled a slash: "${resolved}"`);

  /* Idempotent: resolving a resolved path changes nothing. */
  if (resolvePath(cwd, resolved) !== resolved) {
    problems.push(`resolving "${resolved}" again gave "${resolvePath(cwd, resolved)}"`);
  }

  /* An absolute path ignores the working directory entirely. */
  if (path.startsWith("/") && resolvePath("/somewhere/else", path) !== resolved) {
    problems.push(`the absolute path "${path}" depended on the working directory`);
  }

  /* And the one that matters: .. cannot climb out. */
  if (path.includes("..")) climbs += 1;
  const dots = "../".repeat(1 + (nextPath() % 12));
  const climbed = resolvePath(cwd, dots);
  if (climbed !== "/" && !climbed.startsWith("/")) escapes += 1;
  if (resolvePath("/", "../../../etc/passwd") !== "/etc/passwd") {
    problems.push(`.. climbed out of the root: ${resolvePath("/", "../../../etc/passwd")}`);
  }

  /* segments never yields an empty or a dot, whatever it is given. */
  for (const part of segments(path)) {
    if (part === "" || part === ".") problems.push(`segments("${path}") yielded "${part}"`);
  }

  /* parentOf shortens, except at the root, where it is its own parent. */
  const parent = parentOf(resolved);
  if (resolved === "/") {
    if (parent !== "/") problems.push(`parentOf("/") is "${parent}"`);
  } else if (segments(parent).length !== segments(resolved).length - 1) {
    problems.push(`parentOf("${resolved}") is "${parent}", which is not one level up`);
  }

  /* And baseName plus parentOf reconstruct the path they came from. */
  if (resolved !== "/") {
    const base = baseName(resolved);
    if (base !== segments(resolved)[segments(resolved).length - 1]) {
      problems.push(`baseName("${resolved}") is "${base}"`);
    }
    if (resolvePath(parent, base) !== resolved) {
      problems.push(`parentOf and baseName do not rebuild "${resolved}"`);
    }
  }
}
if (climbs < 500) problems.push(`only ${climbs} of 4000 generated paths contained a ..`);
if (escapes > 0) problems.push(`${escapes} paths resolved to something outside the root`);
if (baseName("/") !== "/") problems.push(`baseName("/") is "${baseName("/")}"`);

/* dir() and its defaults, since every lab filesystem is built out of it. */
{
  const empty = dir();
  if (empty.kind !== "dir") problems.push(`dir() made a ${empty.kind}`);
  if (empty.mode !== 0o755) problems.push(`dir() defaults to ${empty.mode.toString(8)} rather than 755`);
  if (Object.keys(empty.children ?? {}).length !== 0) problems.push("dir() invented a child");
  const owned = dir({ x: file("hi") }, 0o700, "student", "student");
  if (owned.mode !== 0o700 || owned.owner !== "student") problems.push("dir() ignored its arguments");
  if (!owned.children?.x) problems.push("dir() dropped its children");
}

/* modeString round-trips the nine permission bits and names the kind. */
for (let mode = 0; mode <= 0o777; mode += 1) {
  const rendered = modeString(file("", mode));
  if (rendered.length !== 10) problems.push(`modeString for ${mode.toString(8)} is "${rendered}"`);
  let back = 0;
  for (const [index, shift] of [[1, 6], [4, 3], [7, 0]] as [number, number][]) {
    const triad = rendered.slice(index, index + 3);
    back |= ((triad[0] === "r" ? 4 : 0) | (triad[1] === "w" ? 2 : 0) | (triad[2] === "x" ? 1 : 0)) << shift;
  }
  if (back !== mode) problems.push(`modeString(${mode.toString(8)}) reads back as ${back.toString(8)}`);
}
if (modeString(dir())[0] !== "d") problems.push("modeString does not mark a directory with d");
if (modeString(file(""))[0] !== "-") problems.push("modeString does not mark a file with -");

/* sizeOf: a directory is a block, a link is its target, a file is its bytes. */
if (sizeOf(dir()) !== 4096) problems.push(`sizeOf(dir()) is ${sizeOf(dir())}`);
if (sizeOf(file("hello")) !== 5) problems.push(`sizeOf a five byte file is ${sizeOf(file("hello"))}`);
if (sizeOf(file("")) !== 0) problems.push("an empty file is not zero bytes");
/* Bytes rather than characters, which is the one worth pinning. */
if (sizeOf(file("\u00e9")) !== 2) problems.push(`sizeOf counted characters rather than bytes: ${sizeOf(file("\u00e9"))}`);

/* cloneTree is deep, all the way down. */
{
  const tree = dir({ home: dir({ student: dir({ notes: file("original") }) }) });
  const copy = cloneTree(tree);
  const deep = copy.children?.home?.children?.student?.children?.notes;
  if (!deep) problems.push("cloneTree lost a nested file");
  else deep.content = "edited";
  if (copy.children?.home?.children?.student?.children) {
    copy.children.home.children.student.children.extra = file("new");
  }
  const source = tree.children?.home?.children?.student;
  if (source?.children?.notes?.content !== "original") problems.push("cloneTree shares a nested file");
  if (source?.children?.extra) problems.push("cloneTree shares a nested directory");
  if (JSON.stringify(cloneTree(tree)) !== JSON.stringify(tree)) problems.push("cloneTree changed the tree");
}

/* lookup, on a tree with a link in it, including the loop it has to refuse. */
{
  const root = dir({
    etc: dir({ hosts: file("127.0.0.1 localhost") }),
    link: { kind: "link", mode: 0o777, owner: "root", group: "root", mtime: 0, target: "/etc" },
    loop: { kind: "link", mode: 0o777, owner: "root", group: "root", mtime: 0, target: "/loop" },
  });
  const found = lookup(root, "/", "/etc/hosts");
  if (!found.ok) problems.push(`lookup could not find /etc/hosts: ${found.error}`);
  const viaLink = lookup(root, "/", "/link/hosts");
  if (!viaLink.ok) problems.push(`lookup did not follow the link: ${viaLink.error}`);
  else if (viaLink.path !== "/etc/hosts") problems.push(`lookup reported the link path "${viaLink.path}"`);
  const missing = lookup(root, "/", "/etc/nothing");
  if (missing.ok || missing.error !== "ENOENT") problems.push("lookup did not report ENOENT");
  const throughFile = lookup(root, "/", "/etc/hosts/more");
  if (throughFile.ok || throughFile.error !== "ENOTDIR") problems.push("lookup did not report ENOTDIR");
  /*
    A link pointing at itself. Wrapped, because the failure this catches is a
    stack overflow rather than a wrong answer: the hop budget used to be a
    local, so every recursive call started it again and MAX_LINK_HOPS could
    never be reached. An uncaught RangeError does fail the build, but it fails
    it without saying what broke, and the next person to see it deserves the
    sentence rather than the stack.
  */
  try {
    const looped = lookup(root, "/", "/loop/x");
    if (looped.ok || looped.error !== "ELOOP") {
      problems.push(`a symlink loop gave ${looped.ok ? "a node" : looped.error} rather than ELOOP`);
    }
  } catch (thrown) {
    problems.push(
      `a symlink pointing at itself threw ${thrown instanceof RangeError ? "a stack overflow" : String(thrown).slice(0, 60)}` +
        ` instead of returning ELOOP, so the hop budget is not surviving the recursion`,
    );
  }
  /* And a chain longer than the budget, which is the bounded version. */
  try {
    const chain: Record<string, { kind: "link"; mode: number; owner: string; group: string; mtime: number; target: string }> = {};
    for (let index = 0; index < 40; index += 1) {
      chain[`l${index}`] = { kind: "link", mode: 0o777, owner: "root", group: "root", mtime: 0, target: `/l${index + 1}` };
    }
    const deep = lookup(dir(chain), "/", "/l0");
    if (deep.ok || deep.error !== "ELOOP") {
      problems.push(`a forty link chain gave ${deep.ok ? "a node" : deep.error} rather than ELOOP`);
    }
  } catch (thrown) {
    problems.push(`a long symlink chain threw ${String(thrown).slice(0, 60)} instead of returning ELOOP`);
  }
  /* And a relative lookup uses the working directory it is given. */
  const relative = lookup(root, "/etc", "hosts");
  if (!relative.ok || relative.path !== "/etc/hosts") problems.push("a relative lookup ignored the working directory");
}

/* ---------------------------------------------------------- shell output */

/*
  out, ok and fail are how every command answers, so a wrong stream or a wrong
  exit code is a lab that marks a correct answer wrong.
*/
{
  if (out("text").stream !== "out") problems.push("out() did not write to stdout");
  if (out("text").text !== "text") problems.push("out() changed the text");
  if (out("text", 40).delay !== 40) problems.push("out() dropped its delay");
  if (out("text").delay !== undefined) problems.push("out() invented a delay");
  if (ok().code !== 0) problems.push(`ok() exits ${ok().code}`);
  if (ok().lines.length !== 0) problems.push("ok() invented a line");
  if (ok([out("a")]).lines.length !== 1) problems.push("ok() dropped its lines");
  const failed = fail("no such file");
  if (failed.code !== 1) problems.push(`fail() exits ${failed.code} rather than 1`);
  if (failed.lines.length !== 1 || failed.lines[0].stream !== "err") {
    problems.push("fail() did not write one line to stderr");
  }
  if (failed.lines[0].text !== "no such file") problems.push("fail() changed the message");
  if (fail("gone", 2).code !== 2) problems.push("fail() ignored its exit code");
}

/* parse: quoting, pipes, and the constructs the lab shell refuses by name. */
{
  const simple = parse("ls -la /etc");
  if ("error" in simple) problems.push(`parse rejected a plain command: ${simple.error}`);
  else if (simple[0].stages[0].argv.join(",") !== "ls,-la,/etc") {
    problems.push(`parse split "ls -la /etc" as ${JSON.stringify(simple[0].stages[0].argv)}`);
  }
  const quoted = parse('grep "two words" file');
  if ("error" in quoted) problems.push(`parse rejected a quoted argument: ${quoted.error}`);
  else if (quoted[0].stages[0].argv[1] !== "two words") {
    problems.push(`parse split the quoted argument as ${JSON.stringify(quoted[0].stages[0].argv)}`);
  }
  const piped = parse("cat file | grep x | wc -l");
  if ("error" in piped) problems.push(`parse rejected a pipeline: ${piped.error}`);
  else if (piped[0].stages.length !== 3) problems.push(`parse found ${piped[0].stages.length} stages in a three stage pipeline`);
  const expanded = parse("echo $HOME", { HOME: "/home/student" });
  if ("error" in expanded) problems.push(`parse rejected a variable: ${expanded.error}`);
  else if (expanded[0].stages[0].argv[1] !== "/home/student") {
    problems.push(`parse expanded $HOME to ${JSON.stringify(expanded[0].stages[0].argv[1])}`);
  }
  /* An empty line is not an error and is not a command either. */
  const blank = parse("   ");
  if ("error" in blank) problems.push(`parse rejected an empty line: ${blank.error}`);
  else if (blank.length !== 0) problems.push("parse made a command out of whitespace");
  /*
    Output redirection is a feature, not a refusal, which I had backwards
    until this failed: `>` and `>>` are parsed into a redirect the commands
    honour. Asserted so a change that quietly drops it is noticed.
  */
  const redirected = parse("echo hi > /tmp/note");
  if ("error" in redirected) problems.push(`parse rejected output redirection: ${redirected.error}`);
  else if (redirected[0].stages[0].redirect?.op !== ">") {
    problems.push(`parse did not carry the redirect: ${JSON.stringify(redirected[0].stages[0].redirect)}`);
  }
  const appended = parse("echo hi >> /tmp/note");
  if (!("error" in appended) && appended[0].stages[0].redirect?.op !== ">>") {
    problems.push("parse did not tell >> from >");
  }

  /*
    And the refusals, which are the constructs the lab shell says it does not
    support: process and command substitution, here-documents, background jobs
    and control flow. Each has to be named rather than crashing or being
    silently treated as an argument.
  */
  for (const line of [
    "cat <(ls)",
    "ls $(pwd)",
    "ls `pwd`",
    "cat << EOF",
    "sleep 30 &",
    "for i in 1 2; do echo $i; done",
    "while true; do echo; done",
    "if true; then echo; fi",
  ]) {
    const refused = parse(line);
    if (!("error" in refused)) problems.push(`parse accepted "${line}", which the lab shell does not support`);
    else if (!/lab shell:/.test(refused.error)) problems.push(`parse refused "${line}" without saying so clearly`);
  }
  /* And && is supported, so it must not be caught by the background-job rule. */
  const chained = parse("true && echo yes");
  if ("error" in chained) problems.push(`parse rejected &&: ${chained.error}`);
}

if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s) in the hands-on labs:\n`);
  for (const problem of problems) console.error(`        ${problem}`);
  console.error("\n      Re-run with LAB_DEBUG=1 to see the failing transcript.");
  process.exit(1);
}

const steps = LABS.reduce((sum, lab) => sum + lab.solution.length, 0);
console.log(
  `OK  ${LABS.length} labs, ${steps} solution steps replayed through the real shell, all solvable.`,
);
