import type { Case } from "../types";

/**
 * Ten creations, and what mode each one came out with.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * walking the twelve bits one at a time, deciding each on its own, rather than
 * by evaluating the same masking expression twice.
 *
 * Four of the ten are the same program at four different umasks, because the
 * thing that makes this hard to reason about in production is that the code is
 * identical on every host and the result is not.
 */
export const CASES: Case[] = [
  {
    slug: "the-file-nobody-could-read",
    name: "The file nobody could read",
    brief:
      "A service writes its output with open(path, O_CREAT | O_WRONLY, 0666) and runs under a systemd unit whose UMask is set to 0077 as a hardening measure. A second service, running as a different user, cannot read the file.",
    setup: { host: "report-01", job: "a report writer", kind: "file", asked: 0o666, um: 0o077, parentSetgid: false, parentGid: 0, processGid: 0, thenChmod: 0 },
    question: "What mode does the file have?",
    options: [
      { id: "owner", claim: "0600. The umask clears group and other, and what is left is the owner's three bits", says: { about: "mode", value: "0600" } },
      { id: "asked", claim: "0666, because that is what the program asked for and nothing refused it", says: { about: "mode", value: "0666" } },
      { id: "default", claim: "0644, the mode a file usually gets", says: { about: "mode", value: "0644" } },
      { id: "nomask", claim: "Nothing was removed, so the mode is whatever the program asked for", says: { about: "masked", value: false } },
    ],
    why:
      "The result is the mode and not the umask: 0666 with 0077 cleared leaves 0600. Measured across thirty six combinations of mode and umask with no exceptions. The hardening is doing exactly what it says, and the second service was never going to read this.",
    fix:
      "Decide the mode you need and set it explicitly with fchmod after creating, or give the unit a UMask that matches what the service is for. Do not leave it to whatever the environment happens to be.",
    breaks: "the mode argument to open is the mode you get",
  },
  {
    slug: "the-umask-that-changed-nothing",
    name: "The umask that changed nothing",
    brief:
      "The same host, and somebody proposes tightening the umask to 0077 for a second service, this one a credentials writer that already opens its file with 0600.",
    setup: { host: "report-01", job: "a credentials writer", kind: "file", asked: 0o600, um: 0o077, parentSetgid: false, parentGid: 0, processGid: 0, thenChmod: 0 },
    question: "Does the umask remove anything here?",
    options: [
      { id: "yes", claim: "Yes, the group and other bits are cleared as they are for any file", says: { about: "masked", value: true } },
      { id: "no", claim: "No. A umask can only clear bits that were asked for, and none of these were", says: { about: "masked", value: false } },
      { id: "mode", claim: "It ends up 0000, because 0077 removes six of the nine bits", says: { about: "mode", value: "0000" } },
      { id: "nothing", claim: "It depends on the order the two are applied in", says: { about: "nothing" } },
    ],
    why:
      "A umask subtracts and never adds. Measured: 0600 came out 0600 under umasks of 0022, 0002 and 0077 alike, because the bits the mask clears were not in the mode to begin with. A program that asks for exactly what it needs is immune to the setting; a program that asks for 0666 is not.",
    fix:
      "This is the arrangement to copy. Open with the mode you actually want and the umask stops being something you have to reason about.",
    breaks: "a tighter umask always makes a file tighter",
  },
  {
    slug: "the-setuid-bit-that-survived",
    name: "What a umask cannot reach",
    brief:
      "An installer creates a helper with mode 6777, meaning setuid and setgid on top of read, write and execute for everybody. The build runs under a umask of 0777, which somebody set on the reasoning that it removes every permission there is.",
    setup: { host: "build-04", job: "an installer", kind: "file", asked: 0o6777, um: 0o777, parentSetgid: false, parentGid: 0, processGid: 0, thenChmod: 0 },
    question: "What mode does the helper have?",
    options: [
      { id: "zero", claim: "0000. A umask of 0777 clears every bit there is", says: { about: "mode", value: "0000" } },
      { id: "full", claim: "06777, because the special bits protect the ones below them", says: { about: "mode", value: "06777" } },
      { id: "special", claim: "06000. A umask is nine bits and there are twelve, so setuid and setgid pass through untouched", says: { about: "mode", value: "06000" } },
      { id: "exec", claim: "Anybody can execute it, which is what makes a setuid file like this dangerous", says: { about: "executable", value: true } },
    ],
    why:
      "Measured: 6777 under a umask of 0777 came out 6000, and under 0022 it came out 6755. The umask covers the low nine bits and nothing else. A file with no permissions and a setuid bit is a strange object, and the important part is that no umask anywhere would have stopped the bit being set.",
    fix:
      "Do not rely on a umask to keep setuid and setgid off anything. If a build must not produce them, check for them afterwards, which is one find with -perm /6000.",
    breaks: "a umask of 0777 removes every bit",
  },
  {
    slug: "the-chmod-that-undid-it",
    name: "The chmod that undid it",
    brief:
      "A deploy script writes a configuration file under a umask of 0077, then runs chmod 0644 on it because a reader needs it, and a reviewer objects that the umask will stop the chmod from widening it.",
    setup: { host: "deploy-02", job: "a deploy script", kind: "file", asked: 0o666, um: 0o077, parentSetgid: false, parentGid: 0, processGid: 0, thenChmod: 0o644 },
    question: "What mode does the file have when the script finishes?",
    options: [
      { id: "created", claim: "0600, the mode it was created with, because the umask applies to the chmod too", says: { about: "mode", value: "0600" } },
      { id: "and", claim: "0604, the chmod and the created mode combined", says: { about: "mode", value: "0604" } },
      { id: "startedat", claim: "It was created 0644 in the first place, so nothing changed", says: { about: "created", value: "0644" } },
      { id: "chmod", claim: "0644. chmod does not consult the umask, so it sets exactly what it was given", says: { about: "mode", value: "0644" } },
    ],
    why:
      "Measured directly: created 0600 under a umask of 0077, then chmod 0666 gave 0666. The mask is consulted when a file is created and never again. Which is also why a script like this quietly defeats the hardening it was deployed alongside, and nothing complains.",
    fix:
      "Nothing is broken here, but be clear about which one is the policy. If the umask is the policy, the chmod is a hole in it; if the chmod is, the umask is decoration.",
    breaks: "the umask limits everything a process does to a mode",
  },
  {
    slug: "the-shared-directory",
    name: "The shared directory",
    brief:
      "A team directory is owned by group 1 and carries the setgid bit so that everything written inside belongs to the team. A process running as group 0 writes a file into it with mode 0666, under a umask of 0022.",
    setup: { host: "shared-01", job: "a member of the team", kind: "file", asked: 0o666, um: 0o022, parentSetgid: true, parentGid: 1, processGid: 0, thenChmod: 0 },
    question: "Which group owns the new file?",
    options: [
      { id: "parent", claim: "1, the directory's group, which is what the setgid bit is for", says: { about: "gid", value: 1 } },
      { id: "process", claim: "0, the group the writing process is running as", says: { about: "gid", value: 0 } },
      { id: "mode", claim: "The setgid bit changes the mode instead, to 02644", says: { about: "mode", value: "02644" } },
      { id: "both", claim: "It belongs to both, since the process is writing into the directory", says: { about: "nothing" } },
    ],
    why:
      "Measured with a parent owned by group 1 and a process in group 0: the file came out group 1 under the setgid parent and group 0 under a plain one, with a mode of 0644 in both cases. The setgid bit moves the group and leaves the mode to the umask, which is a division of labor worth remembering because people expect it to do both.",
    fix:
      "For a shared directory you usually want the setgid bit and a umask of 0002, so the group is right and the group can also write. One without the other gets you half of it.",
    breaks: "the setgid bit on a directory changes the mode of what goes in it",
  },
  {
    slug: "the-bit-that-spread",
    name: "The bit that spread",
    brief:
      "The same team directory, and this time somebody creates a subdirectory inside it with mode 0777.",
    setup: { host: "shared-01", job: "a member of the team", kind: "directory", asked: 0o777, um: 0o022, parentSetgid: true, parentGid: 1, processGid: 0, thenChmod: 0 },
    question: "What mode does the subdirectory have?",
    options: [
      { id: "plain", claim: "0755, the same as a subdirectory anywhere else", says: { about: "mode", value: "0755" } },
      { id: "sgid", claim: "02755. A directory inherits the setgid bit itself, which is how the arrangement keeps working further down", says: { about: "mode", value: "02755" } },
      { id: "full", claim: "0777, because the parent allows everything", says: { about: "mode", value: "0777" } },
      { id: "gid", claim: "It is the group that is inherited, and the group is 0", says: { about: "gid", value: 0 } },
    ],
    why:
      "Measured: a directory created under a setgid parent came out 2755 where the same call under a plain parent gave 0755. A file in the same place got 0644 with no extra bit. Only directories inherit it, and that is deliberate: it is what stops the arrangement ending one level down.",
    fix:
      "Nothing to fix. Worth knowing when auditing, because a stray setgid directory deep in a tree is usually inherited rather than deliberate.",
    breaks: "the setgid bit applies only to the directory it was set on",
  },
  {
    slug: "the-redirect-that-was-never-executable",
    name: "The redirect that was never executable",
    brief:
      "A script generates a helper by redirecting into a file, then runs it, and it fails with permission denied. The umask on the box is 0000, which the author points at as proof that permissions cannot be the problem.",
    setup: { host: "ci-runner-7", job: "a shell redirect", kind: "file", asked: 0o666, um: 0o000, parentSetgid: false, parentGid: 0, processGid: 0, thenChmod: 0 },
    question: "Can anybody execute the file?",
    options: [
      { id: "yes", claim: "Yes, at a umask of 0000 nothing is removed at all", says: { about: "executable", value: true } },
      { id: "mode", claim: "The mode is 0777, so it runs", says: { about: "mode", value: "0777" } },
      { id: "no", claim: "No. The shell asks for 0666, which has no execute bit in it for the umask to leave alone", says: { about: "executable", value: false } },
      { id: "masked", claim: "The umask removed the execute bit, which is the whole problem", says: { about: "masked", value: true } },
    ],
    why:
      "A umask cannot add a bit. The shell opens a redirect with 0666 and never 0777, so there is no execute bit anywhere in the calculation. Measured at three umasks: 0022 gave 0644, 0077 gave 0600 and 0002 gave 0664, and none of them is executable. A umask of 0000 changes nothing about that.",
    fix:
      "chmod +x the file after writing it, which is what every generator has to do. There is no umask that makes a redirect executable.",
    breaks: "a umask of 0000 means a file gets every permission",
  },
  {
    slug: "the-same-code-on-two-boxes",
    name: "The same code, the other box",
    brief:
      "The report writer from the first case, unchanged, running on a host whose umask is the distribution default rather than a hardened one.",
    setup: { host: "report-02", job: "a report writer", kind: "file", asked: 0o666, um: 0o022, parentSetgid: false, parentGid: 0, processGid: 0, thenChmod: 0 },
    question: "What mode does the file have on this host?",
    options: [
      { id: "same", claim: "0600, the same as the other host, because the program decides the mode", says: { about: "mode", value: "0600" } },
      { id: "full", claim: "0666, since 0022 clears nothing that 0666 asked for", says: { about: "mode", value: "0666" } },
      { id: "nomask", claim: "The umask takes nothing away from 0666", says: { about: "masked", value: false } },
      { id: "default", claim: "0644. The umask is 0022 here, so only the write bits for group and other go", says: { about: "mode", value: "0644" } },
    ],
    why:
      "The same binary, the same call, two different files. 0666 under 0022 leaves 0644, where under 0077 it left 0600. This is the reason a permissions bug reproduces on one host and not another, and why the answer is never in the application's source.",
    fix:
      "Set the mode explicitly, or set the umask explicitly in the unit file. Either way, pin it somewhere you can read, rather than inheriting whatever the login shell had.",
    breaks: "identical code produces identical files",
  },
  {
    slug: "the-directory-that-could-not-be-entered",
    name: "The directory nobody could enter",
    brief:
      "A job creates a spool directory with mkdir(path, 0777) under a umask of 0027, and a process in another group reports that the path does not exist.",
    setup: { host: "spool-03", job: "a spool creator", kind: "directory", asked: 0o777, um: 0o027, parentSetgid: false, parentGid: 0, processGid: 0, thenChmod: 0 },
    question: "What mode does the directory have?",
    options: [
      { id: "full", claim: "0777, because mkdir was given 0777 and the umask only applies to files", says: { about: "mode", value: "0777" } },
      { id: "common", claim: "0755, the usual mode for a directory", says: { about: "mode", value: "0755" } },
      { id: "masked", claim: "0750. Other loses everything, so a process outside the group cannot even search it", says: { about: "mode", value: "0750" } },
      { id: "created", claim: "It was created 0770 and something removed the group execute bit later", says: { about: "created", value: "0770" } },
    ],
    why:
      "mkdir goes through the umask exactly as open does, measured at six umasks. 0777 with 0027 cleared leaves 0750. The complaint is that the path does not exist, because without the execute bit a process cannot search the directory and gets the same error as for a missing one.",
    fix:
      "Give the directory the mode it needs explicitly, and remember that on a directory the execute bit is search permission. A directory readable but not searchable is a common and confusing halfway state.",
    breaks: "the umask applies to files and not directories",
  },
  {
    slug: "the-mask-that-was-already-narrower",
    name: "Narrower than the mask",
    brief:
      "An audit asks what the strictest umask on the fleet would do to a log directory that the logger creates with mode 0750.",
    setup: { host: "audit-01", job: "a logger", kind: "directory", asked: 0o750, um: 0o027, parentSetgid: false, parentGid: 0, processGid: 0, thenChmod: 0 },
    question: "What mode is it created with?",
    options: [
      { id: "same", claim: "0750. Everything 0027 would clear is already absent, so the mask has nothing to do", says: { about: "created", value: "0750" } },
      { id: "tighter", claim: "0700, because 0027 removes the group bits as well", says: { about: "created", value: "0700" } },
      { id: "and", claim: "Combining the two gives 0000, because a mask and a mode cancel where they overlap", says: { about: "created", value: "0000" } },
      { id: "masked", claim: "The mask takes the group write bit, which 0750 was carrying", says: { about: "masked", value: true } },
    ],
    why:
      "0750 has no group write bit and no other bits at all, which is exactly what 0027 clears, so the two do not overlap. Measured: 0644 under 0022 stayed 0644 and 0755 under 0002 stayed 0755, for the same reason. The way to stop worrying about the umask is to ask for less than it would take.",
    fix:
      "Nothing to change. This is the pattern the audit should be recommending everywhere else.",
    breaks: "a umask and a mode always interact",
  },
];
