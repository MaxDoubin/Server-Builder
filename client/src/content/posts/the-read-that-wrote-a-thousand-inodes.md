## A backup that only reads, and a disk that only writes

A nightly backup opens 1059 files under a documentation tree. Every one of
them read-only. It writes nothing anywhere, and the volume shows write traffic
the whole time it runs.

Here is that pass, measured. Before and after, from `stat`:

```
files read                        1059
inodes dirtied by the first pass  1059
inodes dirtied by the second pass    0
```

One inode write per file, and then nothing at all when the same pass runs
again twenty minutes later. That is the access time, and the rule that decides
when it gets written is more interesting than the folklore about it.

## Three comparisons, in this order

Since 2009 the default mount option on Linux has been `relatime`, and this is
what it does when something reads a file. From `fs/inode.c`, in the order the
kernel asks:

```
mtime is at least as new as atime      the file changed since it was last read
ctime is at least as new as atime      the inode changed since it was last read
the stored atime is a day old or more  once a day, whatever else is true
```

If none of those is true, the read is free. It touches nothing on disk.
Measured on a fresh file:

```
first read of a fresh file   atime moved
second read, moments later   atime did not move
third read                   atime did not move
```

That is not an optimization the filesystem is doing behind your back. It is
the documented behavior of the mount option every distribution ships.

One aside worth having, because it takes the measurement out of the way:
`stat` does not move an access time. Fifty `stat` calls in a row left it
exactly where it was. So you can watch this happen without disturbing it.

## The second rule swallows the first

The middle test is about the inode, not the contents, and that makes it much
broader than it looks. `chmod`, `chown`, a rename, a new hard link: all of
them move ctime, and each of them arms the next read to write.

```
before:  atime 2 h ago   mtime 25 h ago   ctime 30 s ago
read:    atime moved
```

Nothing about the file's contents changed. A deployment that runs `chmod`
across a directory of static assets has queued one inode write for every file
in it, payable on first request.

It also means the first test can never fire on its own. Nothing moves mtime
without also moving ctime, and `utimes`, which sets mtime to whatever you
like, sets ctime to now. So on a real inode ctime is never older than mtime,
and wherever the mtime test is true the ctime test is true as well. The kernel
keeps both because the first is cheaper to reason about; in practice the
second is the one doing the work.

## The day rule, on its own

To see the third test by itself you need a file whose atime is newer than both
mtime and ctime and is still more than a day old. Those are everywhere on a
machine that has been up for a while. Scanning 35,111 files under `/usr` and
`/etc` found 1,114 of them.

```
/usr/lib/file/magic.mgc
  atime   494.23 h ago
  mtime 21671.60 h ago
  ctime 21671.60 h ago

one read              atime moved 494 hours forward
one more read at once atime did not move
```

Same file, same reader, two reads seconds apart. The only thing that differed
between them was how old the stored access time was. That is the whole of the
third rule: a floor of one update per file per day, so that atime stays
roughly meaningful without costing a write on every read.

The day is 24 hours exactly and it is not tunable. It is a constant in the
kernel.

## What that costs, and who pays it

Per file, per day, and it lands on whichever pass gets there first. That makes
the cost of a read-only workload lumpy in a way that is easy to misattribute:

```
1059 files, first pass of the day    1059 inodes dirtied
the same 1059, twenty minutes later     0
```

Directories are charged the same way and counted separately, because listing a
directory is a read of the directory. Measured on subdirectories that had not
been listed that day, against some that had:

```
/usr/src                    1 subdirectory    1 moved
/var/cache                  8 subdirectories  8 moved
/usr/libexec                6 subdirectories  6 moved
/usr/lib/x86_64-linux-gnu  33 subdirectories  0 moved   (listed an hour before)
```

A crawler that walks a share is mostly doing listings, but the writes it causes
are mostly files, because there are more of them.

Worth knowing about that last line: the first attempt at this measurement got
zero everywhere, because `os.walk` lists each directory in order to enumerate
it, so the snapshot was taken after the thing being measured had already
happened. The fix is to `scandir` the parent, which lists the parent and stats
the children without listing them, and only then do the listing being measured.

## Four things that stop it dead

The three rules are not the whole decision. Four other things override them,
and the kernel checks three of them before it asks the rules at all:

```
the A flag on the inode     chattr +A; lsattr prints it
noatime on the mount        nothing under it records a read
nodiratime on the mount     directories only; files still record
a read-only mount           the decision is made, and then refused
```

The per-inode flag, measured both ways:

```
chattr +A, atime backdated 26 h, read   atime did not move
the flag cleared, the same read         atime moved
```

`nodiratime` is not a longer word for `noatime`. It is scoped to directories
and files under it are still on relatime's terms, which is usually what you
want for a tree that gets crawled.

The read-only mount is the odd one out, and it is the clearest illustration of
where the check actually lives. `/opt/claude-code/bin/claude`, on an ext4 image
mounted `ro,relatime`:

```
atime  1999-12-31    (the image's fixed build date)
mtime  1999-12-31
ctime  yesterday

mtime at least as new as atime   yes
ctime at least as new as atime   yes
atime a day old or more          yes

the read moved nothing
```

All three rules said update. `atime_needs_update()` returned true, and then
`touch_atime()` asked the mount for write access and was refused. So access
times on a read-only image are the image's, not yours, and they say nothing at
all about what is being used.

None of this is ext4-specific either. On `/dev/shm`, a tmpfs mounted
`rw,relatime`, a backdated file updated on the next read and did not update on
the one after it. The decision is made by the VFS.

## The part that deletes your data

Everything above is a performance question, and performance questions are
usually the boring end. Here is the other end.

A cache directory gets mounted `noatime`, years ago, for throughput. A nightly
job removes anything not accessed in 30 days. Both of those are reasonable in
isolation and together they are a deletion bug.

```
file backdated 40 days, per-inode A flag set
read 200 times in a row
atime afterwards: 40.0 days old
```

A frozen access time does not read as missing. There is no flag on the inode
saying "this number is meaningless now". It reads as **old**, and every tool
that selects on age, `find -atime`, `tmpwatch`, `tmpreaper`,
`systemd-tmpfiles`, agrees that it is old, and selects a file that is being
read two hundred times a minute.

The same trap catches monitoring: "these files have not been accessed in
months, we can archive them" is a claim about the mount options at least as
much as it is a claim about the files.

## What to do about it

1. **Do not mount `noatime` reflexively.** relatime already removed most of
   the cost the advice was written for. One write per file per day is not what
   it was in 2006.
2. **If you do mount `noatime`, grep for anything that selects on access
   age** first: cleanup jobs, archival scripts, capacity reports, anything
   using `find -atime` or `-amin`.
3. **For a tree that is crawled but whose files matter, use `nodiratime`.**
   It removes the listings and keeps the files honest.
4. **If a read-only workload is showing write traffic, count the files it
   touches before blaming the application.** One inode per file per day is a
   number you can check.
5. **Treat an access time from a read-only mount or a container image as
   decoration.** It is the builder's timestamp.
6. **When an access time will not move, run `lsattr` as well as `mount`.**
   A single inode can opt out.

## Sources

- [mount(8), on relatime, noatime, nodiratime, strictatime and lazytime](https://man7.org/linux/man-pages/man8/mount.8.html)
- [stat(2), on the three timestamps and what changes each](https://man7.org/linux/man-pages/man2/stat.2.html)
- [inode(7), on ctime against mtime](https://man7.org/linux/man-pages/man7/inode.7.html)
- [chattr(1), on the per-inode A flag](https://man7.org/linux/man-pages/man1/chattr.1.html)
- [open(2), on O_NOATIME](https://man7.org/linux/man-pages/man2/open.2.html)
- [utimensat(2), on setting mtime and what it does to ctime](https://man7.org/linux/man-pages/man2/utimensat.2.html)

Every measurement here was taken on Linux 6.18.44, root on ext4 mounted
`rw,relatime`, by stating a file, reading it, and stating it again.

The ten filesystems on [The read that wrote](/atime) are the same model, one
question each.
