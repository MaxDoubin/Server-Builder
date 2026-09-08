## One message, six faults, five of them not about space

I built six filesystems that all answer the same thing:

```
write: No space left on device
```

Two of them are not out of space. One of them is the filesystem working
exactly as designed. And only one is what everybody assumes when they read
that string, which is that the volume is too small for the data on it.

The error is a statement about one write. It is not a statement about the
disk, and the instinct to go and look at `df` is the instinct to answer a
different question from the one you asked.

## df's Available column is not free space

Start here, because it is the smallest and most surprising of the six.

```
$ df /var/lib/prometheus
Filesystem  Size  Used  Avail  Use%
/var/lib/prometheus  200G  199G  0K  100%
```

Zero available. Now the same filesystem, asked what root can actually write:

```
1G
```

There is a gigabyte of free space on a filesystem reporting nothing
available, because `df` subtracts the reserve from what it offers and ext4
holds back 5% for root by default. Across the six cases here, at the moment
`df` printed 100%:

```
volume    reserve still there
 50G                     2.5G
 40G                       2G
100G                       5G
200G                      10G
```

A 200G volume that is "full" has ten gigabytes in it. That is not a rounding
artifact or a safety margin against corruption; it is a deliberate guarantee
that a full filesystem can still be administered and that root-owned daemons
keep running while somebody fixes it.

The consequence is the thing to remember: **a full filesystem behaves
differently depending on who asks.** Which means testing it from a root shell
tests the one case that works. `sudo -u postgres touch /var/lib/postgresql/x`,
not `touch /var/lib/postgresql/x`.

## The worst version: df over-reports by 380x

One of the six is a 4T archive volume at 2% used. Here is what `df` offers,
and what the user doing the writing may actually consume:

```
df Available            3.7T
available to archiver    10G
```

A factor of 380. The limit is a quota, `df` knows nothing about quotas, and
the write fails with `EDQUOT` rather than `ENOSPC`, which prints as "Disk
quota exceeded" and is the one hint the message itself gives you. Most tooling
logs `strerror` and most people read "disk" and go to `df`, which reports 3.7T
free and is telling the truth about the wrong thing.

Four terabytes of volume against a hundred gigabytes of allowance is not a
configuration anybody writes down on purpose. It is what happens when a quota
set on the old volume survives a migration to one forty times the size.

## The diagnosis is a disagreement, not a number

Here is the whole method, and it is why I built the page as three bars rather
than a percentage.

`df` counts blocks allocated to the filesystem. `du` walks names. Those are
different questions, and the gap between the answers is diagnostic:

| what disagrees | what it is |
|---|---|
| `df` full, `du` agrees | the data is there and the volume is too small |
| `df` full, `du` much smaller | blocks nothing can reach |
| `df` fine, `df -i` at 100% | out of inodes, with space to spare |
| root writes, the service cannot | the reserve |
| `df` fine, one user refused | a quota |

Of the six cases, four are settled by `df` and `du` alone. Two are not, and
that is worth being honest about rather than pretending the arithmetic
finishes the job. I will come back to it.

## Deleting things does not always free space

Two of the six have most of the volume invisible to anything that walks the
tree:

```
case                     volume   invisible to du    as a fraction
a deleted log held open     50G               41G              82%
data under a mount point    40G             27.9G              70%
```

On the first, somebody was paged at four in the morning, found a 41G access
log, deleted it, and went back to bed. The alert cleared for no time at all
and came back. Unlinking a file removes the name and not the allocation, and
the kernel will not release the blocks while any process holds a descriptor on
it, which is exactly what a logging process that has not been signalled does.

So `df` still counts the 41G, and `du` and `ls` and every tidy-up script
anybody writes cannot see it. Here is the number that makes the point:

```
deleting every named file on that volume frees 9G
and leaves 41G still spent
```

Which is the correct read on the second case too. Mounting a filesystem over a
directory hides whatever was in it. The files are not deleted, their blocks
are not freed, they belong to the underlying filesystem, and there is no path
that reaches them, so `du` starting at `/` cannot count them and `rm` cannot
remove them. It is the standard way for a service's data directory to fill a
root volume: the service ran before the volume was mounted, wrote to the plain
directory, and the mount arrived afterwards and covered it. Both copies exist
and one is invisible.

## The inode threshold, which is a number you can carry

`df -i` costs nothing and rules out a cause nobody thinks of. One of the six
is a build cache at 36% of blocks and 100% of inodes, refusing to unpack
anything.

An inode is allocated when a file is created, and a filesystem is formatted
with a fixed number of them. ext4's default is one inode per 16,384 bytes of
capacity. So the crossover is exact and easy to remember:

**If your average file is smaller than 16K, you will run out of inodes before
you run out of blocks.**

A volume of documents or images never gets close. A dependency cache made of
hundreds of thousands of tiny files gets there at a third full, and the error
is the same `ENOSPC`, which is why nobody looks. The durable fix is
reformatting with `-i 8192`, and it cannot be done in place, which is really
an argument for not putting a cache on a filesystem sized for large files.

## Where two numbers are not enough

This is the part I would have got wrong if I had only written the prose.

Blocks held by an unlinked open file and blocks behind a mount point are
identical from outside. `df` counts them. `du` cannot reach them. Nothing
about those two figures separates the two causes, and the fixes have nothing
in common: one is a signal to a process, the other is a bind mount and an
`rm`.

So the page says so, on those two cases, and names the observation that does
separate them:

```
lsof +L1 lists files with no name.
If it finds nothing, bind mount the filesystem root elsewhere
and walk underneath the mount point.
```

I nearly shipped a version where the model decided between them from the
figures, which would have taught a reader that four commands always settle it.
They settle four of six.

## The gate found two bugs by passing

The cases carry no cause. Each declares a filesystem in the terms the kernel
holds it in, plus one write, and the model works out which of the six refused
it; the correct option is whichever names that. Then the model is checked
against the rules over four thousand generated filesystems.

I blinded that gate eighteen ways. Two of the blindings passed, and both
pointed at something real.

**A function with no test at all.** `availableTo()` computes what a given user
may write, and I broke it so it ignored quotas entirely. Every property still
passed, because nothing tested that function. Adding one, that a write of
exactly `availableTo()` blocks succeeds and one block more fails, immediately
failed against unmodified code:

```
round 463: a write of exactly availableTo() blocks failed with reserve
```

Fifty-one rounds of it. Once a filesystem is inside its reserve, `free -
reserved` is negative, and a write of nothing is greater than a negative
number, so a zero-block write was being refused for want of space. A real bug,
found by a property added only because a blinding revealed there were none.

**A generator that could not produce the interesting case.** I broke the quota
lookup so it read the first quota row rather than the writer's own. Four
thousand rounds passed. The generator was giving every quota to the user doing
the writing, so the two are the same row and reading the wrong one is
invisible.

A limit belonging to somebody else is the commonest arrangement on a real host
and precisely the mistake the code shape invites. It now appears in a measured
fraction of rounds, with a property saying somebody else's quota never changes
this write's verdict, and the blinding fails 560 ways.

Both are the same failure, and it is the one I keep finding: a check that does
not exercise the thing it is named after. Neither would have been caught by
looking at the gate. Both were caught by breaking the code and watching the
gate not notice.

## And one gate that reads prose

Because of a bug on a different page. The clock skew surface carried a
sentence claiming its tolerances spanned two orders of magnitude, in five
places, for a set that spans one. That surface has one gate with a few dozen
assertions in it, blinded fourteen ways to prove each one caught what it was
for, and not one of them reads prose.

So this gate checks that any percentage a case states in its brief is one the
model computes, and it caught a brief saying 34% for a filesystem the model
puts at 36%. The better fix, where it is available, is to render the figure
from the data instead of writing it down twice. Where a sentence has to state
a number, something should check it.

## The four commands, in order

```
df -h and df -i together, always
du -sx on the mount point
lsof +L1
repquota -a
```

The `-x` on `du` matters: without it, `du` crosses into anything mounted below
and counts a different filesystem. And if `df` and `du` disagree while `lsof`
finds nothing, bind mount the filesystem root somewhere else and walk
underneath the mount points.

You can work through the six cases at [no space left on
device](/space).

## References

- [df(1)](https://man7.org/linux/man-pages/man1/df.1.html)
- [du(1)](https://man7.org/linux/man-pages/man1/du.1.html)
- [statvfs(3), on the difference between free and available blocks](https://man7.org/linux/man-pages/man3/statvfs.3.html)
- [mke2fs(8), on bytes-per-inode and the reserved-blocks percentage](https://man7.org/linux/man-pages/man8/mke2fs.8.html)
- [tune2fs(8)](https://man7.org/linux/man-pages/man8/tune2fs.8.html)
- [lsof(8)](https://man7.org/linux/man-pages/man8/lsof.8.html)
- [unlink(2), on when blocks are actually released](https://man7.org/linux/man-pages/man2/unlink.2.html)
- [quotactl(2)](https://man7.org/linux/man-pages/man2/quotactl.2.html)
