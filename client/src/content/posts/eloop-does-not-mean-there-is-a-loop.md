## The path has no loop in it

```
open("/srv/app/current/data/config.yaml"): Too many levels of symbolic links
```

You check it. Every symlink on the path points somewhere further along; nothing
points back. There is no cycle. The error says there is.

The error is wrong, or rather the error is named after a shape the kernel never
looked for. Here is what it actually checked.

## Forty, for the whole path

The kernel allows forty symlink traversals per path resolution. Not per chain.
Not per component. **Per resolution.** Every symlink anywhere on the path draws
on one counter.

Measured, with three symlinked components in a single path, each with its own
chain:

```
13 + 13 + 13 = 39   opens
14 + 13 + 13 = 40   opens
14 + 14 + 13 = 41   ELOOP
20 + 10 + 10 = 40   opens
20 + 11 + 10 = 41   ELOOP
38 +  1 +  1 = 40   opens
38 +  2 +  1 = 41   ELOOP
```

Three different splits, three different shapes, and every one of them flips
between exactly forty and forty one. Where the traversals come from does not
matter at all; only how many there are.

This is the practical part. A release path that walks a symlinked mount point,
then a symlinked data directory inside it, then the usual `current` pointer,
can be three or four deep in each of those places and nowhere near forty in any
one of them, and still be over the line. Nothing warns. The path just stops
resolving one day, after somebody added an ordinary layer of indirection
somewhere else entirely.

And errno 40 for a limit of 40 is a coincidence, but a convenient one: remember
either and you have both.

## There is no cycle detection

```
cycA -> cycB -> cycA        errno 40, ELOOP
a chain of 41, no cycle     errno 40, ELOOP
```

Identical. Not similar: identical, and there is nothing from userspace that
distinguishes them.

Linux does not look for cycles during path resolution, and it does not need to.
A cycle makes the walk go round; going round spends traversals; the counter runs
out; the walk stops. The counter catches a cycle for exactly the same reason it
catches a long chain, and the kernel never learns which one it was looking at.

So "ELOOP, but there is no loop" is not a contradiction and not a bug. It is
the ordinary case. Most ELOOPs in production are depth, not cycles.

## The walk stops at the wall

A small thing that changes how you read the numbers: the kernel does not walk
the whole path, discover it needed forty four traversals, and then complain. It
stops the moment the counter is spent. A path that asks for forty four
traversals performs forty one and gives up.

So there is no way to ask the kernel how deep a path actually is. It will tell
you it ran out, and nothing more.

## O_NOFOLLOW reports it too

```
one link, plain open                opens
the same link with O_NOFOLLOW       errno 40, ELOOP
```

One traversal. A budget of forty. Still ELOOP, for a third reason entirely: you
asked not to follow the final component and it was a symlink.

That gives one errno three distinct meanings:

1. the budget ran out on a deep path
2. the budget ran out going round a cycle
3. you set `O_NOFOLLOW` and the last component is a link

A service that opens its config with `O_NOFOLLOW`, which is the right thing to
do for a file in a directory other people can write to, will log ELOOP the first
time someone replaces that config with a symlink. The log line looks like a
depth problem and is not one.

## What still works past the wall

```
at a chain of 45:
  open()       ELOOP
  stat()       ELOOP
  readlink()   returns the next link
  lstat()      reports a symlink
```

`readlink` and `lstat` are about the link, not the thing it points at, so they
stop at the final component instead of following it. That is why `ls -l` happily
lists a path that a monitoring agent reports as missing: `ls -l` uses `lstat`
and the agent uses `stat`. Both are telling the truth.

**The exemption is one component wide.** `lstat` does not follow the *last*
component; it still resolves every symlink in the directories leading up to it,
because it has to find the directory the name is in. Reaching for `lstat` as a
workaround fixes a path whose depth is in the final chain and does nothing at
all for one whose depth is in the directories.

## How to actually see it

`namei -l` prints the whole walk, component by component, and is the only tool
that shows you where the traversals went:

```
namei -l /srv/app/current/data/config.yaml
```

It resolves the path itself rather than asking the kernel to, so it works past
forty, and it shows you which layer you did not know was there.

## What to do about it

1. **Stop looking for the cycle.** Most of the time there isn't one, and the
   error will never tell you either way.
2. **Count the whole path, not the worst component.** Depth adds across
   components and the budget does not care where it came from.
3. **`namei -l` in the deploy check** for the paths that matter. It is the only
   thing that sees the full walk.
4. **Treat a path with no headroom as already broken.** At exactly forty it
   works, and the next person who adds one indirection anywhere breaks it, with
   nothing to tell them they did.
5. **Handle ELOOP as three things,** especially if you set `O_NOFOLLOW`. In that
   code path it usually means "someone replaced this file with a symlink",
   which is precisely what you asked to be told.
6. **`openat` from a directory descriptor** starts the walk part way along and
   is the real workaround when a path genuinely has to be deep.

## Sources

- [path_resolution(7), on the limit and on what each call follows](https://man7.org/linux/man-pages/man7/path_resolution.html)
- [symlink(7)](https://man7.org/linux/man-pages/man7/symlink.7.html)
- [open(2), on O_NOFOLLOW and its ELOOP](https://man7.org/linux/man-pages/man2/open.2.html)
- [readlink(2)](https://man7.org/linux/man-pages/man2/readlink.2.html)
- [namei(1)](https://man7.org/linux/man-pages/man1/namei.1.html)

Every measurement here was taken on Linux 6.18.44 by building chains of
symlinks and opening them.

The ten paths on [There is no loop](/eloop) are the same model, one question
each.
