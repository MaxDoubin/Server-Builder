## The file is gone and the disk is still filling

Two in the morning, a log filesystem at 100%, and somebody does the obvious
thing:

```
$ sudo rm /var/log/app/app.log
```

Six hours later:

```
$ df -h /var/log
Filesystem           Size  Used Avail Use% Mounted on
/dev/mapper/vg0-log   99G   93G     0 100% /var/log

$ du -shx /var/log
2.6G	/var/log
```

Ninety gigabytes are allocated on that filesystem and nothing on it has a name,
and the number is still climbing. The file was deleted six hours ago and it is
getting bigger.

This is not corruption and `fsck` will not find anything. `du` walks names; `df`
asks the filesystem how many blocks are allocated. A file can have blocks and no
name, and `rm` is exactly the thing that produces one.

## The name and the file are two different objects

A directory is a list of pairs: a name, and an inode number. The inode is the
file. It holds the mode, the owner, the timestamps, the block pointers and a
link count, which is how many directory entries point at it. The name holds none
of that, which is why `rm` on one of two hard links leaves the data intact.

`rm` calls `unlink(2)`, and the man page is unusually direct about what that
does and does not do:

> unlink() deletes a name from the filesystem. If that name was the last link
> to a file and no processes have the file open, the file is deleted and the
> space it was using is made available for reuse.

Two conditions, joined by **and**. The second one gets its own sentence:

> If the name was the last link to a file but any processes still have the file
> open, the file will remain in existence until the last file descriptor
> referring to it is closed.

So there are two reference counts, not one: the link count on disk, and the
count of open file descriptions in the kernel. The blocks come back when both
reach zero, and `rm` only drives the first one down.

The misconception is that deleting a file frees its space. Deleting a **name**
frees its space only if it was the last name and nothing has it open, and on a
log a daemon opened at boot neither is true. From the writer's side nothing has
happened: `rm` on a file you have open is an event you are not told about and
cannot observe, and it keeps appending to an inode that no longer appears
anywhere in the directory tree.

## lsof +L1, and what the link count tells you

There is a flag for exactly this case:

> When **+L** is followed by a number, only files having a link count less than
> that number will be listed. (No number may follow **-L**.) A specification of
> the form ``**+L1**'' will select open files that have been unlinked. A
> specification of the form ``**+aL1** `<file_system>`'' will select unlinked open
> files on the specified file system.

Link count less than one means zero: no directory entry anywhere points at this
inode:

```
$ sudo lsof +aL1 /var/log
COMMAND    PID USER   FD   TYPE DEVICE    SIZE/OFF NLINK    NODE NAME
java     14811  app    3w   REG  253,2 96636764160     0  262145 /var/log/app/app.log (deleted)
```

One line with everything: the process, the descriptor, ninety gibibytes in
`SIZE/OFF`, `NLINK` at zero, the inode in `NODE`. The `a` is not optional.
`lsof` ORs its selections by default, so `+L1 /var/log` without it lists every
unlinked file on the box alongside everything open under `/var/log`.

## /proc/PID/fd, and where "(deleted)" comes from

`lsof` is reading `/proc`, and so can you:

> This is a subdirectory containing one entry for each file which the process
> has open, named by its file descriptor, and which is a symbolic link to the
> actual file.

```
$ sudo ls -l /proc/14811/fd/ | grep deleted
l-wx------ 1 app app 64 Sep 19 08:14 3 -> /var/log/app/app.log (deleted)
```

That suffix is not part of the filename and it is not `lsof` being helpful. It
comes from `d_path()` in `fs/d_path.c`, whose comment reads "If the entry has
been deleted the string " (deleted)" is appended" and whose code is two lines:

```c
if (unlikely(d_unlinked(path->dentry)))
	prepend(&b, " (deleted)", 11);
```

`proc_pid_maps(5)` documents the same marker, because it is a property of
rendering an unlinked dentry, not of this directory. It is appended text rather
than structure, so a file genuinely named `app.log (deleted)` renders the same
way: the link count is the fact, the suffix is a hint.

`fdinfo` gives you the numbers the symlink cannot:

```
$ sudo cat /proc/14811/fdinfo/3
pos:	96636764160
flags:	02102001
mnt_id:	29
ino:	262145
```

`pos` is the file offset in decimal. `flags` is "an octal number that displays
the file access mode and file status flags". Decompose it: `1` is `O_WRONLY`,
`2000` is `O_APPEND`, `100000` is `O_LARGEFILE`, `2000000` is `O_CLOEXEC`. The
bit that matters below is `O_APPEND`, and this process has it.

## Why create needs a signal and copytruncate does not

These files come from rotation, so be precise about what each does to the inode.
The usual setup is rename plus create: `logrotate` renames `app.log` to
`app.log.1` and then, per the man page, "Immediately after rotation (before the
postrotate script is run) the log file is created (with the same name as the log
file just rotated)."

`rename(2)` changes a directory entry. It does not touch the inode, and it
certainly does not touch anybody's open file description, so the daemon is still
writing to the same inode, now named `app.log.1`. The freshly created `app.log`
is a different inode with nothing writing to it, and it stays at zero bytes
forever.

That is what `postrotate` is for, and the signal is the only thing that makes
the process `close()` and `open()` again. nginx documents its half. `USR1` means
"re-opening log files", and the procedure is "In order to rotate log files, they
need to be renamed first. After that USR1 signal should be sent to the master
process."

```
/var/log/nginx/*.log {
        daily
        rotate 14
        missingok
        compress
        delaycompress
        create 0640 www-data adm
        sharedscripts
        postrotate
                kill -USR1 $(cat /run/nginx.pid)
        endscript
}
```

Get that block wrong, or point it at a stale pid file, and you get fourteen
rotated files, one still growing, and an `app.log` of zero bytes that looks fine
in every listing. Then `rotate 14` comes around, the growing one ages out,
`logrotate` unlinks it, and it is deleted and still growing.

`copytruncate` exists for the process that cannot be signaled:

> Truncate the original log file to zero size in place after creating a copy,
> instead of moving the old log file and optionally creating a new one. It can
> be used when some program cannot be told to close its logfile and thus might
> continue writing (appending) to the previous log file forever.

The inode never changes, so there is nothing to reopen and no signal to send.
The descriptor was always pointing at the right inode and keeps working.

## The race, and the hole it leaves

The same paragraph is candid about the cost:

> Note that there is a very small time slice between copying the file and
> truncating it, so some logging data might be lost.

The window is the gap between the copy reading its last byte and `truncate()`
landing. Anything written in between is discarded, because truncation is
unconditional: `ftruncate(2)` says "If the file previously was larger than this
size, the extra data is lost." It does not know which bytes were copied.

The window scales with the file. A 200 MB log on a device doing 400 MB/s is
sub-second and negligible. A 12 GB log on the same device is roughly half a
minute of copying, and the tail of that half minute is gone. How much you lose
is a function of how badly you needed rotation, which is the wrong way round.

The second failure is quieter, and comes from a sentence further down the same
man page: "The file offset is not changed."

With `O_APPEND` this never bites, because `open(2)` promises that "Before each
write(2), the file offset is positioned at the end of the file, as if with
lseek(2)." Truncate to zero and the next write goes to zero.

Without it, the offset stays where it was. The file was 12 GB, it is now empty,
and the next write lands at byte 12,884,901,888. The kernel fills the gap with a
hole, so `ls -l` reports 12 GB again and `du` reports a few kilobytes. The first
time I did this by hand I spent ten minutes convinced the truncate had failed,
because `ls -l` was back where it started. It had not: `df` stayed down and I
was reading apparent size. It matters later though: `cp` defaults to
`--sparse=auto` and keeps the hole, but `cat`, `tar` and most log shippers will
reconstitute those twelve gigabytes of null bytes somewhere else.

So check the `O_APPEND` bit in `fdinfo` before assuming `copytruncate` is safe
for a given writer.

## Truncating through the descriptor

An inode with no name, ninety gibibytes of blocks, and a process you would
rather not restart. Reach it the only way left, through the descriptor keeping
it alive:

```
$ sudo truncate -s 0 /proc/14811/fd/3
$ df -h /var/log
Filesystem           Size  Used Avail Use% Mounted on
/dev/mapper/vg0-log   99G  2.7G   91G   3% /var/log
```

Opening the magic symlink resolves to the inode, `ftruncate` frees the blocks,
and `df` moves before the command returns. No restart, no signal, no cooperation
from the process. `: > /proc/14811/fd/3` does the same.

Three things that do not work, in the order people try them. `rm` again: there
is no name left to unlink. `echo > /var/log/app/app.log`: that makes a new inode
and truncates it, freeing nothing. `kill -HUP`: only if the process implements
reopen on HUP, which you want to know in advance.

You are discarding the log: the blocks and the content are the same thing. If
any of it matters, read it out of `/proc/14811/fd/3` first.

## The questions, in order

1. Do `df` and `du -shx` on the same mount point disagree? Then the space is
   real and it is not under any name.
2. Does `lsof +aL1 <mountpoint>` return anything with `NLINK` at 0? That names
   the process and the descriptor, and that is the whole diagnosis.
3. Is the writer's descriptor `O_APPEND`? `grep flags /proc/PID/fdinfo/N` and
   look for the `2000` bit. It decides whether truncation leaves a hole.
4. Why was it deleted rather than rotated? A hand written `rm` on a live log is
   almost always a rotation config that was never wired to a signal.

The first three take thirty seconds. The fourth is the one that stops it
happening again, and it is the one nobody does, because by then `df` looks fine.

If `lsof +aL1` comes back empty and the numbers still do not add up, the rest of
the map is in [the disk was not full](/blog/the-disk-was-not-full), and you can
work through it at [no space left on device](/space).

## References

- [unlink(2), on when the space is released](https://man7.org/linux/man-pages/man2/unlink.2.html)
- [lsof(8), on +L and link counts](https://man7.org/linux/man-pages/man8/lsof.8.html)
- [proc_pid_fd(5), on the descriptor symlinks](https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html)
- [proc_pid_fdinfo(5), on the octal flags field](https://man7.org/linux/man-pages/man5/proc_pid_fdinfo.5.html)
- [proc_pid_maps(5), which documents the " (deleted)" suffix](https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html)
- [fs/d_path.c, where the kernel appends it](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/fs/d_path.c)
- [ftruncate(2), on lost data and the file offset](https://man7.org/linux/man-pages/man2/ftruncate.2.html)
- [open(2), on O_APPEND](https://man7.org/linux/man-pages/man2/open.2.html)
- [cp(1), on --sparse=auto and holes](https://www.gnu.org/software/coreutils/manual/html_node/cp-invocation.html)
- [logrotate(8), on create, copytruncate and postrotate](https://man7.org/linux/man-pages/man8/logrotate.8.html)
- [nginx, on USR1 and rotating log files](https://nginx.org/en/docs/control.html)