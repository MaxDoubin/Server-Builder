/**
 * Fourteen accesses, each one a belief somebody arrives with.
 *
 * The set is built so that no two cases break the same belief, which CI
 * enforces: a surface with ten cases that are all "you forgot the execute
 * bit on a parent" is one case shown ten times. Five of the fourteen
 * succeed, because a page where the answer is always denied teaches a reader
 * to answer denied.
 *
 * The verdicts are not written down. Each case declares which option is
 * right and the model works out what actually happens, so a case whose
 * options disagree with the rules fails the build rather than teaching
 * somebody the wrong thing.
 */

import type { Case, Node } from "../types";

const dir = (name: string, owner: string, group: string, mode: number, note?: string): Node => ({
  name,
  kind: "dir",
  owner,
  group,
  mode,
  ...(note ? { note } : {}),
});

const file = (
  name: string,
  owner: string,
  group: string,
  mode: number,
  extra: { note?: string; interpreted?: true } = {},
): Node => ({ name, kind: "file", owner, group, mode, ...extra });

/** Every path starts here, and it is 0755 on every system anybody has seen. */
const ROOT = dir("/", "root", "root", 0o755);

/** The stale lock two of the cases are about, from two directions. */
const TMP = dir("tmp", "root", "root", 0o1777, "the sticky bit, which is the t on the end of drwxrwxrwt");
const QUEUE = file(
  "queue.state",
  "jenkins",
  "jenkins",
  0o666,
  { note: "written with umask 000 by a service that wanted every build to be able to update it" },
);

export const CASES: Case[] = [
  {
    slug: "owner-loses-to-group",
    title: "The deploy user cannot write its own artefact",
    brief:
      "A release tarball owned by the deploy user, in a directory the whole deploy group can write, and the deploy user is in the deploy group. The post-install step rewrites the tarball in place and gets permission denied.",
    command: "truncate -s 0 /srv/deploy/release.tar.gz",
    actor: { user: "alina", groups: ["alina", "deploy"] },
    path: [
      ROOT,
      dir("srv", "root", "root", 0o755),
      dir("deploy", "root", "deploy", 0o775),
      file("release.tar.gz", "alina", "deploy", 0o464, {
        note: "chmod 464, from a hardening pass that meant to make it read-only and succeeded",
      }),
    ],
    operation: "write",
    options: [
      { id: "a", claim: "It works. The deploy group has write on the file and alina is in the deploy group." },
      { id: "b", claim: "It fails. alina owns the file, so the owner bits are the only ones consulted, and they are r--." },
      { id: "c", claim: "It fails. /srv/deploy is owned by root, so alina cannot modify anything inside it." },
      { id: "d", claim: "It works. The directory is group writable, and directory write is what governs the files in it." },
    ],
    answer: "b",
    why: "The kernel picks one class and stops. alina is the owner, so the owner bits decide, and r-- has no write in it. The rw- sitting in the group column belongs to everybody in deploy who is not alina, which is everybody the file was not written for. Being in the group as well is worse than useless here: it is the thing that makes the ls output look correct.",
    breaks: "that being in the group as well adds the group's rights to the owner's",
  },
  {
    slug: "delete-needs-the-directory",
    title: "You own the file and cannot remove it",
    brief:
      "A certificate you generated yourself, sitting in a bundle directory that the configuration management tool owns. You wrote the file. rm says permission denied, and chmod on the file changes nothing.",
    command: "rm /opt/bundle/client.pem",
    actor: { user: "alina", groups: ["alina"] },
    path: [
      ROOT,
      dir("opt", "root", "root", 0o755),
      dir("bundle", "root", "root", 0o755, "managed, and set back to 0755 on every run"),
      file("client.pem", "alina", "alina", 0o600),
    ],
    operation: "delete",
    options: [
      { id: "a", claim: "It works. You own the file, and 0600 gives the owner everything there is to give." },
      { id: "b", claim: "It fails. 0600 has no execute bit, and unlinking a file needs execute on it." },
      { id: "c", claim: "It fails. Removing a name is a write to the directory holding it, and /opt/bundle is r-x for you." },
      { id: "d", claim: "It fails. The file is outside your home directory, so rm needs sudo." },
    ],
    answer: "c",
    why: "A file's name lives in its directory, not in the file. Deleting is editing that list, so it needs write and search on the directory and nothing at all on the file. This is why chmod 777 on the file you cannot delete never helps, and why the fix is somewhere you were not looking.",
    breaks: "that owning a file is what lets you delete it",
  },
  {
    slug: "delete-what-you-cannot-open",
    title: "A core dump nobody can read, in a directory you own",
    brief:
      "A crashed service left a core file in your home directory. It is owned by root and its mode is 000: not one bit set, for anybody, including root's own group. You would like it gone.",
    command: "rm /home/alina/core.4412",
    actor: { user: "alina", groups: ["alina"] },
    path: [
      ROOT,
      dir("home", "root", "root", 0o755),
      dir("alina", "alina", "alina", 0o755),
      file("core.4412", "root", "root", 0o000, {
        note: "written by the kernel as root, with every bit clear",
      }),
    ],
    operation: "delete",
    options: [
      { id: "a", claim: "It works. A delete does not consult the file's bits at all, and you own the directory." },
      { id: "b", claim: "It fails. Mode 000 means nobody can touch it, which is what mode 000 is for." },
      { id: "c", claim: "It fails. The file is owned by root and you are not." },
      { id: "d", claim: "It works, but only because rm prompts on a write-protected file and you can say yes." },
    ],
    answer: "a",
    why: "The same rule as the case before it, pointing the other way. Nothing on the file is consulted, so a file owned by root with every bit clear is still yours to remove if the directory is yours. rm does stop and ask before removing a file you cannot write, which is where the last option comes from, but that prompt is a courtesy from rm and not a permission check: unlink would have succeeded without it.",
    breaks: "that a file with no bits set is protected from the owner of the directory it sits in",
  },
  {
    slug: "the-parent-you-forgot",
    title: "The file is world readable and you still cannot read it",
    brief:
      "A report generated nightly, mode 644, readable by anybody. Your script has failed on it every night for a week, and ls on the file itself looks exactly right.",
    command: "cat /var/spool/analytics/daily.csv",
    actor: { user: "alina", groups: ["alina", "staff"] },
    path: [
      ROOT,
      dir("var", "root", "root", 0o755),
      dir("spool", "root", "root", 0o755),
      dir("analytics", "root", "analytics", 0o750, "chmod 750 by whoever set the job up"),
      file("daily.csv", "root", "analytics", 0o644),
    ],
    operation: "read",
    options: [
      { id: "a", claim: "It fails. The file is owned by root, and root's files need root to read." },
      { id: "b", claim: "It works. 644 is world readable and the file is the thing you are reading." },
      { id: "c", claim: "It fails. You would have to be in the analytics group to read a file that group owns." },
      { id: "d", claim: "It fails at /var/spool/analytics, which is 750 and gives you nothing. Nothing below it is ever consulted." },
    ],
    answer: "d",
    why: "The walk stops at the first directory that will not let you through, and everything under it becomes unreachable regardless of what it says about itself. The error names daily.csv, because that is what you asked for, which sends people to chmod the file. The file was never the problem and 644 was already enough.",
    breaks: "that the permissions on the file are the permissions that decide",
  },
  {
    slug: "mode-711",
    title: "A home directory set to 711 is not private",
    brief:
      "A colleague set their home directory to 711 so nobody could go poking through it. ls on it gives permission denied, which looked like proof that it had worked. You happen to know the name of one file inside.",
    command: "cat /home/mikhail/deploy-notes.md",
    actor: { user: "alina", groups: ["alina"] },
    path: [
      ROOT,
      dir("home", "root", "root", 0o755),
      dir("mikhail", "mikhail", "mikhail", 0o711, "chmod 711, so that ls gives permission denied"),
      file("deploy-notes.md", "mikhail", "mikhail", 0o644),
    ],
    operation: "read",
    options: [
      { id: "a", claim: "It fails. 711 gives other no read, so nothing inside can be read." },
      { id: "b", claim: "It fails. You cannot list the directory, and you cannot read out of what you cannot list." },
      { id: "c", claim: "It works. Execute on a directory is search, and search is all you need once you know the name." },
      { id: "d", claim: "It works, and ls would work too. The permission denied was about something else." },
    ],
    answer: "c",
    why: "Read and execute on a directory are two separate powers and 711 hands out the second without the first. You cannot enumerate what is in there, so you cannot find anything by looking, and every file whose name you can guess or has been mentioned in a ticket is as readable as its own bits say. It is obscurity, and it is worth exactly what obscurity is worth.",
    breaks: "that a directory you cannot list is a directory you cannot read out of",
  },
  {
    slug: "read-the-names-not-the-file",
    title: "ls shows the file and cat does not",
    brief:
      "A backups directory somebody chmod'd to 644, by pasting a command meant for a file. ls prints the filenames exactly as expected, which is why nobody thought to look at the directory.",
    command: "cat /srv/backups/manifest.txt",
    actor: { user: "bruno", groups: ["bruno", "backups"] },
    path: [
      ROOT,
      dir("srv", "root", "root", 0o755),
      dir("backups", "root", "backups", 0o644, "chmod 644 on a directory: the names are readable and none of them is reachable"),
      file("manifest.txt", "root", "backups", 0o644),
    ],
    operation: "read",
    options: [
      { id: "a", claim: "It fails at the directory. Read gives you the names and execute is what reaches them, so ls works and everything under it does not." },
      { id: "b", claim: "It works. Both the directory and the file are readable by the backups group." },
      { id: "c", claim: "It fails. manifest.txt is 644 and gives the group read, but its group is root rather than backups." },
      { id: "d", claim: "It fails because ls was showing a cached listing; the directory is not readable either." },
    ],
    answer: "a",
    why: "The exact inverse of the 711 case, and the pair is the whole distinction. 711 is search without listing: you cannot find anything and you can open what you already know. 644 on a directory is listing without search: you can see every name and open none of them. ls -l gives itself away here, because the long form has to stat each entry and every line comes back as a question mark.",
    breaks: "that a directory whose listing you can read is one you can read out of",
  },
  {
    slug: "sticky-stops-the-rm",
    title: "Anybody can write /tmp and not anybody can empty it",
    brief:
      "A stale lock file in /tmp from a build that died three days ago, owned by the CI user. Your build will not start until it is gone. /tmp is 1777, which is as writable as a directory gets.",
    command: "rm /tmp/queue.state",
    actor: { user: "alina", groups: ["alina"] },
    path: [ROOT, TMP, QUEUE],
    operation: "delete",
    options: [
      { id: "a", claim: "It works. 1777 gives everybody write on the directory, and a delete is a directory write." },
      { id: "b", claim: "It fails. The file is 666 but you are not in the jenkins group." },
      { id: "c", claim: "It works, and this is why nothing you care about belongs in /tmp." },
      { id: "d", claim: "It fails. The sticky bit limits removal in a writable directory to the file's owner and the directory's." },
    ],
    answer: "d",
    why: "Without the sticky bit, 1777 would mean anybody could delete anybody's files, and /tmp would be unusable by the second week. The t at the end of drwxrwxrwt is the exception: write on the directory still lets you add names, and removing or renaming one now needs you to own either the file or the directory.",
    breaks: "that a directory anybody can write is a directory anybody can empty",
  },
  {
    slug: "sticky-does-not-stop-the-write",
    title: "The same lock file, emptied instead of removed",
    brief:
      "You cannot delete the stale lock. It turns out you can do something considerably worse to it, and the sticky bit has nothing to say about that.",
    command: ": > /tmp/queue.state",
    actor: { user: "alina", groups: ["alina"] },
    path: [ROOT, TMP, QUEUE],
    operation: "write",
    options: [
      { id: "a", claim: "It fails. The sticky bit protects other people's files in a shared directory, which is what it is for." },
      { id: "b", claim: "It works. Sticky governs removing and renaming a name. The contents are governed by the file's own bits, and they are rw- for other." },
      { id: "c", claim: "It fails. You would need write on the directory too, and sticky takes that away for files that are not yours." },
      { id: "d", claim: "It works, and it would work the same way if the file were 0644." },
    ],
    answer: "b",
    why: "Sticky protects the name and not the bytes. You cannot unlink jenkins's file and you can truncate it to nothing, overwrite it, or fill it, because 666 says every user on the machine may write it and the directory has no opinion about that. If the file were 644 the last option would be wrong: other would have r-- and the write would fail on the file's own bits, with the directory still uninvolved.",
    breaks: "that the sticky bit protects the contents of other people's files",
  },
  {
    slug: "setgid-is-not-write",
    title: "The shared project directory that is not shared",
    brief:
      "A directory set up so the engineering group can collaborate: group engineering, and setgid so that new files stay in the group rather than landing in whoever's primary group. You are in engineering. You cannot create anything in it.",
    command: "touch /srv/project/notes.md",
    actor: { user: "alina", groups: ["alina", "engineering"] },
    path: [
      ROOT,
      dir("srv", "root", "root", 0o755),
      dir("project", "lead", "engineering", 0o2755, "chmod 2755: the g+s everybody remembers, and not the g+w they do not"),
      file("notes.md", "alina", "engineering", 0o644, { note: "the file that would be created" }),
    ],
    operation: "create",
    options: [
      { id: "a", claim: "It works. setgid on a directory is what makes it a shared directory." },
      { id: "b", claim: "It works. You are in engineering and the directory is group engineering." },
      { id: "c", claim: "It fails. setgid decides the group of new files and grants nothing. The group bits are r-x, and creating a name needs w." },
      { id: "d", claim: "It fails. lead owns the directory, so only lead can create in it." },
    ],
    answer: "c",
    why: "setgid and group write are two independent decisions that the phrase shared directory runs together. 2755 says new files inherit the group and nobody outside the owner may add any, so the inheritance rule is set up perfectly and never fires. What was wanted is 2775. The mode reads as though it is working, which is why this survives review.",
    breaks: "that setgid on a directory is what makes it writable by its group",
  },
  {
    slug: "root-and-the-missing-x",
    title: "The one thing root cannot do",
    brief:
      "A deployment script, mode 644, invoked directly by a root cron job. Every other permission problem you have had went away the moment you became root. This one does not.",
    command: "/usr/local/bin/deploy.sh",
    actor: { user: "root", groups: ["root"] },
    path: [
      ROOT,
      dir("usr", "root", "root", 0o755),
      dir("local", "root", "root", 0o755),
      dir("bin", "root", "root", 0o755),
      file("deploy.sh", "root", "root", 0o644, {
        interpreted: true,
        note: "no execute bit for anybody, which is what a fresh checkout does to a file nobody chmod'd",
      }),
    ],
    operation: "execute",
    options: [
      { id: "a", claim: "It fails. Root skips the permission check, but executing first asks whether this is a program, and a file with no execute bit anywhere is not one." },
      { id: "b", claim: "It works. Root ignores the mode bits, which is what being root is." },
      { id: "c", claim: "It fails because the script has no shebang line." },
      { id: "d", claim: "It works, because root matches the owner and root owns the file." },
    ],
    answer: "a",
    why: "Root's power is the kernel declining to check whether you are allowed. It is not the kernel deciding the bits say something else. Execute asks a question that is not about you at all: is there an execute bit set for anyone here? With 644 there is not, so there is nothing to run and root gets the same refusal as everybody. bash deploy.sh works immediately, because then the file is data being read rather than a program being run.",
    breaks: "that root can do anything the bits describe",
  },
  {
    slug: "the-owner-gets-less-than-everybody",
    title: "Everyone can read it except the person who owns it",
    brief:
      "A hardening script walked a tree and set every file it did not recognise to 004. You own this one. You are now the only account on the machine that cannot read it.",
    command: "cat /home/alina/keys/recovery.txt",
    actor: { user: "alina", groups: ["alina", "staff"] },
    path: [
      ROOT,
      dir("home", "root", "root", 0o755),
      dir("alina", "alina", "alina", 0o755),
      dir("keys", "alina", "alina", 0o755),
      file("recovery.txt", "alina", "staff", 0o004, {
        note: "chmod 004: nothing for the owner, nothing for the group, read for the world",
      }),
    ],
    operation: "read",
    options: [
      { id: "a", claim: "It works. You own the file, and an owner can always read their own file." },
      { id: "b", claim: "It works. The file is world readable and you are part of the world." },
      { id: "c", claim: "It fails. The group is staff and you are in staff, so the group bits apply and they are ---." },
      { id: "d", claim: "It fails. You are the owner, so the owner bits are the only ones consulted. Group and other are never reached." },
    ],
    answer: "d",
    why: "The third option reaches the right verdict by the wrong route, which is the more dangerous kind of wrong: it would give you the opposite answer on a file where the group column was not also empty. Being the owner ends the search. staff and the world are never asked. You can fix it in one command, because chmod is governed by ownership rather than by the bits, and that is the only reason this is recoverable rather than permanent.",
    breaks: "that the owner is floored by whatever everybody else gets",
  },
  {
    slug: "x-is-not-enough-for-a-script",
    title: "Mode 711 runs the binary and not the script beside it",
    brief:
      "Two tools in the same directory with the same mode. One is a compiled binary and one is a shell script. The binary runs for everybody. The script gives a permission denied that names the interpreter rather than the file.",
    command: "/opt/tools/rotate.sh",
    actor: { user: "alina", groups: ["alina"] },
    path: [
      ROOT,
      dir("opt", "root", "root", 0o755),
      dir("tools", "root", "root", 0o755),
      file("rotate.sh", "root", "root", 0o711, {
        interpreted: true,
        note: "a shell script, so something has to open and read it after the kernel is finished",
      }),
    ],
    operation: "execute",
    options: [
      { id: "a", claim: "It works. The execute bit is set for other, and executing is what you are doing." },
      { id: "b", claim: "It fails. A script is run by an interpreter that opens it as an ordinary file, so it needs read as well as execute, and 711 gives other only execute." },
      { id: "c", claim: "It fails. Execute on a file only means anything for directories." },
      { id: "d", claim: "It fails. Scripts owned by root cannot be run by anybody else." },
    ],
    answer: "b",
    why: "The kernel reads the first two bytes, finds a shebang, and hands the path to the interpreter named after it. From that point it is an ordinary open of an ordinary file by a process running as you, and 711 gives other no read. A compiled binary in the same directory with the same mode runs, because there the kernel maps the image itself and never opens the file on your behalf. It is the only place where what a file is written in changes what its mode means.",
    breaks: "that the execute bit is what runs a shell script",
  },
  {
    slug: "the-group-that-is-not-primary",
    title: "A service reading a key that is not its group",
    brief:
      "The web server runs as its own user with its own primary group. The private key is group ssl-cert, mode 640, in a directory that is 710. Somebody wants to know whether the reload will work before they do it in front of an audience.",
    command: "cat /etc/ssl/private/site.key",
    actor: { user: "nginx", groups: ["nginx", "ssl-cert"] },
    path: [
      ROOT,
      dir("etc", "root", "root", 0o755),
      dir("ssl", "root", "root", 0o755),
      dir("private", "root", "ssl-cert", 0o710, "nothing at all for other, which is the entire point of the directory"),
      file("site.key", "root", "ssl-cert", 0o640),
    ],
    operation: "read",
    options: [
      { id: "a", claim: "It works. The kernel asks whether ssl-cert is anywhere in the process's group list, and does not care that nginx is the primary one." },
      { id: "b", claim: "It fails. The primary group is nginx, so the group bits do not apply and other gets nothing." },
      { id: "c", claim: "It fails. The directory is 710, which gives other nothing, so the walk stops there." },
      { id: "d", claim: "It works, and it would work the same way if the directory were 700." },
    ],
    answer: "a",
    why: "A process carries a primary group and a list of supplementary ones, and access asks only whether the file's group appears in either. The distinction between them decides what group a new file gets, not what an existing one grants. This layout is why the directory is 710: nothing for other, so nobody outside can even reach the names, and --x for the group so a service that is in it can open the one file it knows about without being able to enumerate the rest.",
    breaks: "that the primary group is the one the kernel checks",
  },
  {
    slug: "changing-is-not-creating",
    title: "You cannot make a file here and you can change this one",
    brief:
      "A configuration file in /etc, group staff, group writable. You are in staff. Nobody but root can create a file in /etc, which made everybody assume nobody but root could edit this one.",
    command: "echo 'log_level = info' >> /etc/app.conf",
    actor: { user: "bruno", groups: ["bruno", "staff"] },
    path: [
      ROOT,
      dir("etc", "root", "root", 0o755, "0755, so you cannot add or remove a name in here"),
      file("app.conf", "root", "staff", 0o664),
    ],
    operation: "write",
    options: [
      { id: "a", claim: "It fails. /etc is not writable by you, and you cannot change anything inside a directory you cannot write." },
      { id: "b", claim: "It fails. Appending writes a new version of the file, which is a create in the directory." },
      { id: "c", claim: "It works. Writing to a file needs write on the file and search on the directories above it. Directory write is for adding and removing names." },
      { id: "d", claim: "It works, and renaming it would work too, since both are writes to the same file." },
    ],
    answer: "c",
    why: "Adding a name, removing a name and renaming a name are directory operations. Changing the bytes behind an existing name is not. The second option is wrong about the shell and right about something else worth knowing: an editor that writes a temporary file and renames it over the original is doing two directory operations, which is why vim can fail to save a file that a plain append writes without complaint. The fourth is wrong for the same reason, in the other direction: a rename needs write on the directory, which you do not have.",
    breaks: "that changing a file needs the same access as creating one",
  },
];
