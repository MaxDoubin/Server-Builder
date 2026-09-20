import type { Case } from "../types";

/**
 * Ten paths, one resolution each.
 *
 * Every number in an option comes from the model, and the gate recomputes each
 * of them by walking the path component by component rather than by adding
 * two fields together.
 */
export const CASES: Case[] = [
  {
    slug: "the-chain-of-forty-one",
    name: "Forty one",
    brief:
      "A generated tree of symlinks, each pointing at the next, ending at a real file. Nothing points backwards. Forty of them opened fine yesterday and one more was added this morning.",
    setup: {
      host: "build-07",
      path: "link1 -> link2 -> ... -> link41 -> data",
      leadingHops: 0,
      finalHops: 41,
      cyclicFinal: false,
      noFollow: false,
      call: "open",
    },
    question: "There is no loop anywhere in this. Why ELOOP?",
    options: [
      { id: "budget", claim: "The budget: forty traversals for the whole resolution, and this is forty one", says: { about: "reason", name: "the budget, forty traversals for the whole path" } },
      { id: "cycle", claim: "There must be a loop. ELOOP is only returned for a cycle", says: { about: "reason", name: "the budget, spent going round a cycle" } },
      { id: "opens", claim: "It does not fail. Forty one is inside the limit", says: { about: "succeeds", value: true } },
      { id: "nofollow", claim: "O_NOFOLLOW is set somewhere in the toolchain", says: { about: "reason", name: "O_NOFOLLOW, and the last component is a link" } },
    ],
    why:
      "The kernel counts traversals and stops at forty. It does not look for a cycle and it has no idea whether one exists. Measured: a chain of 40 opens and a chain of 41 gives errno 40, ELOOP, on a chain that is a straight line.",
    fix:
      "Collapse the chain. Nothing needs forty indirections, and the limit is not raisable from userspace.",
    breaks: "ELOOP means there is a loop",
  },
  {
    slug: "three-components-that-add-up",
    name: "Fourteen, fourteen, thirteen",
    brief:
      "A release path walks three symlinked components: a symlinked mount point, a symlinked data directory inside it, and the usual current pointer. None of them is deep. The deployment worked for months and now it does not.",
    setup: {
      host: "app-11",
      path: "/srv/mnt -> ... /data -> ... /current -> releases/482",
      leadingHops: 28,
      finalHops: 13,
      cyclicFinal: false,
      noFollow: false,
      call: "open",
    },
    question: "No component is more than fourteen deep. Does this resolve?",
    options: [
      { id: "yes", claim: "Yes. The limit is per chain and the deepest chain here is fourteen", says: { about: "succeeds", value: true } },
      { id: "spent", claim: "It resolves, having spent 28 traversals: only the directory part counts", says: { about: "spent", value: 28 } },
      { id: "no", claim: "No. One budget covers the whole path, and 28 plus 13 is 41", says: { about: "succeeds", value: false } },
      { id: "perpart", claim: "It depends which component is walked first", says: { about: "nothing" } },
    ],
    why:
      "The counter is per resolution. Measured at three different splits, each flipping between exactly 40 and 41: 14+13+13 opens and 14+14+13 does not; 20+10+10 opens and 20+11+10 does not; 38+1+1 opens and 38+2+1 does not. What each component costs on its own is not the question.",
    fix:
      "Count the whole path, not the worst component. One more level anywhere is one more level everywhere.",
    breaks: "the limit applies to each chain separately",
  },
  {
    slug: "the-two-link-cycle",
    name: "A to B to A",
    brief:
      "A migration script rewrote two symlinks and each now points at the other. Somebody reading the error is looking for a very long chain.",
    setup: {
      host: "app-11",
      path: "cycA -> cycB -> cycA",
      leadingHops: 0,
      finalHops: 2,
      cyclicFinal: true,
      noFollow: false,
      call: "open",
    },
    question: "How many traversals does this spend before it fails?",
    options: [
      { id: "two", claim: "2. The kernel sees it has come back to where it started and stops", says: { about: "spent", value: 2 } },
      { id: "whole", claim: "41. There is no cycle detection: it walks until the budget is gone, which takes the whole of it and one more", says: { about: "spent", value: 41 } },
      { id: "never", claim: "It never returns. A cycle is an infinite loop in the kernel", says: { about: "nothing" } },
      { id: "one", claim: "1, because the first traversal already revisits the start", says: { about: "spent", value: 1 } },
    ],
    why:
      "Linux has no cycle detection in path resolution, and it does not need any: the counter catches a cycle for the same reason it catches a long chain. Measured: a two link cycle and a forty one link acyclic chain return the identical errno, and nothing distinguishes them from userspace.",
    fix:
      "The error will not tell you whether it is a cycle. readlink each link in turn, which works at any depth, and look at where they point.",
    breaks: "the kernel notices when a path goes round in a circle",
  },
  {
    slug: "o-nofollow-on-a-single-link",
    name: "One link, and refused",
    brief:
      "A service opens its config with O_NOFOLLOW, which is the right thing to do for a file in a directory other people can write to. Somebody has replaced the config with a symlink to the real one, one level deep.",
    setup: {
      host: "edge-03",
      path: "/etc/svc/config -> ../shared/config",
      leadingHops: 0,
      finalHops: 1,
      cyclicFinal: false,
      noFollow: true,
      call: "open",
    },
    question: "One traversal, a budget of forty. What does the open return?",
    options: [
      { id: "opens", claim: "It opens. One is comfortably inside forty", says: { about: "succeeds", value: true } },
      { id: "budget", claim: "ELOOP, because the budget ran out", says: { about: "reason", name: "the budget, forty traversals for the whole path" } },
      { id: "perm", claim: "It fails, but with a permission error rather than ELOOP", says: { about: "nothing" } },
      { id: "eloop", claim: "ELOOP, for a third reason: O_NOFOLLOW refuses a final component that is a link, and reports ELOOP for it", says: { about: "reason", name: "O_NOFOLLOW, and the last component is a link" } },
    ],
    why:
      "One errno covers three situations: the budget ran out, the walk went round, and you asked not to follow and it was a link. Measured: the same single symlink opens plainly and returns errno 40 with O_NOFOLLOW. So ELOOP in a log says nothing at all about depth on its own.",
    fix:
      "Keep O_NOFOLLOW, and handle ELOOP as what it is here: the file is a symlink and the program declined it. Resolve it deliberately if that is what you want.",
    breaks: "ELOOP is about how deep the path is",
  },
  {
    slug: "readlink-past-the-wall",
    name: "Readlink still answers",
    brief:
      "A chain forty five deep. An operator wants to see where it goes and every tool they reach for returns the same error.",
    setup: {
      host: "build-07",
      path: "link1 -> ... -> link45 -> data",
      leadingHops: 0,
      finalHops: 45,
      cyclicFinal: false,
      noFollow: false,
      call: "readlink",
    },
    question: "open and stat both give ELOOP here. What does readlink do?",
    options: [
      { id: "same", claim: "The same. Anything touching the path walks it", says: { about: "succeeds", value: false } },
      { id: "works", claim: "It returns. readlink does not follow the last component, so it never spends the budget on the chain at all", says: { about: "succeeds", value: true } },
      { id: "spent", claim: "It returns, having spent 45 traversals getting there", says: { about: "spent", value: 45 } },
      { id: "partial", claim: "It returns the fortieth link, which is as far as the budget reaches", says: { about: "nothing" } },
    ],
    why:
      "readlink and lstat are about the link, not the thing it points at, so they stop at the final component instead of following it. Measured at a chain of 45: open and stat give ELOOP, readlink returns the next link, and lstat reports a symlink. It spends zero here because the whole chain IS the final component.",
    fix:
      "readlink in a loop, or realpath, to see the shape. namei -l prints the whole walk in one command and is the right tool for this.",
    breaks: "every call that touches a path pays the same traversals",
  },
  {
    slug: "lstat-still-pays-for-the-directories",
    name: "The part lstat still pays",
    brief:
      "Having learned that lstat does not follow the last component, somebody reaches for it on a path whose directory part is itself forty one traversals deep.",
    setup: {
      host: "build-07",
      path: "deep/.../dir (41 traversals) / name",
      leadingHops: 41,
      finalHops: 1,
      cyclicFinal: false,
      noFollow: false,
      call: "lstat",
    },
    question: "lstat does not follow the last component. Does it work here?",
    options: [
      { id: "works", claim: "Yes. lstat never follows anything, so the budget does not apply to it", says: { about: "succeeds", value: true } },
      { id: "one", claim: "It works, having spent 1 traversal on the final link", says: { about: "spent", value: 1 } },
      { id: "fails", claim: "No. Not following the LAST component does not mean not resolving the directories before it, and those are 41", says: { about: "succeeds", value: false } },
      { id: "nofollow", claim: "It fails, and the reason is O_NOFOLLOW", says: { about: "reason", name: "O_NOFOLLOW, and the last component is a link" } },
    ],
    why:
      "Every call has to find the directory the name is in, and finding it means resolving every component on the way, symlinks included. The exemption is one component wide. This is the part that gets missed when lstat is reached for as a workaround.",
    fix:
      "Nothing here helps except shortening the path. openat from a directory descriptor starts the walk part way along, which is the real workaround and is not modeled here.",
    breaks: "lstat does not resolve symlinks",
  },
  {
    slug: "exactly-forty",
    name: "Exactly forty",
    brief:
      "A path that walks a twenty deep chain to a directory, then a twenty deep chain to the file inside it. Someone wants to know whether this is fine or one change away from not being fine.",
    setup: {
      host: "app-11",
      path: "twenty/.../dir/twenty/.../file",
      leadingHops: 20,
      finalHops: 20,
      cyclicFinal: false,
      noFollow: false,
      call: "open",
    },
    question: "How much room is left after this resolves?",
    options: [
      { id: "twenty", claim: "20. Only one of the two chains is charged", says: { about: "headroom", value: 20 } },
      { id: "none", claim: "0. It spends the budget exactly, and any single link added anywhere in this path breaks it", says: { about: "headroom", value: 0 } },
      { id: "fails", claim: "It does not resolve: forty is already over the limit", says: { about: "succeeds", value: false } },
      { id: "half", claim: "It depends on the order the two chains are walked in", says: { about: "nothing" } },
    ],
    why:
      "Forty opens and forty one does not, so this path is at the wall with nothing to spare. Measured at 20+10+10 opening and 20+11+10 failing, which is the same boundary reached from a different split.",
    fix:
      "Treat it as already broken. A path with no headroom fails on the next person who adds an indirection, and nothing warns them.",
    breaks: "a path that works has room in it",
  },
  {
    slug: "the-ordinary-deployment",
    name: "Current points at a release",
    brief:
      "The usual arrangement: /srv/app/current is a symlink to a release directory, and the binary inside it is opened by absolute path. One symlink, nothing clever.",
    setup: {
      host: "app-11",
      path: "/srv/app/current -> releases/482/bin/server",
      leadingHops: 1,
      finalHops: 0,
      cyclicFinal: false,
      noFollow: false,
      call: "open",
    },
    question: "What does this cost?",
    options: [
      { id: "one", claim: "1 traversal, leaving 39. This is what the budget is for and it is nowhere near it", says: { about: "spent", value: 1 } },
      { id: "zero", claim: "0. A single symlink to a directory is resolved by the shell, not the kernel", says: { about: "spent", value: 0 } },
      { id: "three", claim: "3, one for each path component after the symlink", says: { about: "spent", value: 3 } },
      { id: "fails", claim: "It fails: opening a binary through a symlink needs the real path", says: { about: "succeeds", value: false } },
    ],
    why:
      "Worth having a case that is fine, because the point of the budget is that forty is a lot for anything a person arranged by hand. Paths that hit this were generated, or are three schemes layered on each other, and the arithmetic is how you tell which.",
    fix:
      "Nothing. Count the whole path when adding a second or third layer of indirection, not when adding the first.",
    breaks: "symlinks in a path are something to avoid",
  },
  {
    slug: "stat-follows-and-lstat-does-not",
    name: "Two calls, one path",
    brief:
      "A monitoring agent stats a path and reports it missing. The operator runs ls -l on the same path and sees it listed. Both are telling the truth.",
    setup: {
      host: "edge-03",
      path: "reported/.../name (2 leading, 42 on the last component)",
      leadingHops: 2,
      finalHops: 42,
      cyclicFinal: false,
      noFollow: false,
      call: "stat",
    },
    question: "stat is being called here. How many traversals does it actually perform?",
    options: [
      { id: "two", claim: "2. stat is metadata, so it stops at the link like ls does", says: { about: "spent", value: 2 } },
      { id: "all", claim: "44: two for the directories and forty two for the chain on the name", says: { about: "spent", value: 44 } },
      { id: "works", claim: "It succeeds either way: 42 is under the limit on its own", says: { about: "succeeds", value: true } },
      { id: "stops", claim: "41. It does follow the last component, but the walk stops the moment the budget is gone rather than finishing the chain and then complaining", says: { about: "spent", value: 41 } },
    ],
    why:
      "Two things at once. stat follows the final component and lstat does not, which is why one tool says the path is not there while another lists it: ls -l uses lstat, so it reports the link. And the walk stops at the wall rather than running to the end, so the path asks for 44 and the kernel performs 41. Measured at a chain of 45: stat gives ELOOP and lstat reports a symlink.",
    fix:
      "When two tools disagree about whether a path exists, check which one follows. namei -l shows the walk and settles it.",
    breaks: "a path either exists or it does not",
  },
  {
    slug: "one-more-link",
    name: "One more link",
    brief:
      "A path currently at thirty nine traversals, in a system where somebody is about to introduce one more layer of indirection in the shared part. Two links, not one, because the new layer is itself behind a pointer.",
    setup: {
      host: "app-11",
      path: "thirty nine now, plus two from the new layer",
      leadingHops: 41,
      finalHops: 0,
      cyclicFinal: false,
      noFollow: false,
      call: "open",
    },
    question: "The change adds two traversals to a path that had thirty nine. What happens?",
    options: [
      { id: "fine", claim: "Fine. Forty one is one over a limit that is not enforced strictly", says: { about: "succeeds", value: true } },
      { id: "broken", claim: "It stops resolving, and the error will name a loop that does not exist", says: { about: "reason", name: "the budget, forty traversals for the whole path" } },
      { id: "spare", claim: "It resolves with 1 traversal to spare", says: { about: "headroom", value: 1 } },
      { id: "warn", claim: "It resolves, and the kernel logs a warning about the depth", says: { about: "nothing" } },
    ],
    why:
      "This is the shape of the real failure: not a loop, not a generated tree, but a path that quietly crossed the line when somebody added an ordinary layer somewhere else entirely. Nothing warns, nothing logs, and the error names a loop.",
    fix:
      "namei -l on the paths that matter, in the deploy check, and count. It is the only thing that sees the whole walk.",
    breaks: "a limit this large is not something a real system reaches",
  },
];
