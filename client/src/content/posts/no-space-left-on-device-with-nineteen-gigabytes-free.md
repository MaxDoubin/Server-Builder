## Nineteen gigabytes free, and no space left

A file watcher dies at startup:

```
Error: ENOSPC: System limit for number of file watchers reached
```

or, if the program is less helpful about it, just this:

```
inotify_add_watch: No space left on device
```

The first three people to look check `df`. `df` is fine. Somebody checks
`df -i` for inodes. Also fine. On the host I measured this on there were 19.7
GiB free at the moment of the failure.

Nothing about the disk is involved. `inotify_add_watch` returns `ENOSPC` when
the user's watch budget is spent, and `strerror` prints errno 28 the way it
prints it everywhere else, because errno has no idea it came from inotify.

## Three limits, and their scope is the point

```
fs.inotify.max_user_watches    130082    per real UID, across every process
fs.inotify.max_user_instances     128    per real UID, across every process
fs.inotify.max_queued_events    16384    per instance
```

Two of those are per **user**. Not per process, not per inotify instance. That
single fact explains most of the confusion, because it means the budget a
program is working against is already partly spent before it starts, by
programs it has never heard of.

I lowered `max_user_watches` to 200 and had a fresh instance add watches until
it failed:

```
watches added before failure: 19
errno 28 = ENOSPC = No space left on device
```

Nineteen, against a limit of two hundred. Counting `inotify wd:` lines across
every `/proc/*/fdinfo/*` found the rest:

```
inotify watches held right now across all processes: 181
     181 watches   pid 103    (an unrelated process, same user)
```

181 plus 19 is 200. The program that gets the error is whichever one asked
last, and it is very often the innocent one.

## The other message is also wrong

Exhaust `max_user_instances` instead and `inotify_init` fails:

```
instances created before failure: 19
errno 24 = EMFILE = Too many open files
RLIMIT_NOFILE soft limit at the time: 20000
```

Six descriptors open, a ulimit of twenty thousand, and the kernel says there
are too many open files. Again the errno is generic and the message belongs to
it rather than to inotify.

The ordering matters more than it looks. `inotify_init` runs before
`inotify_add_watch`, so when both budgets are short the **instance** limit is
the one that reports. This is how a host ends up with
`max_user_watches` raised to a million and exactly the same error in the log.

## What a watch actually costs

A watch is one directory. There is no recursive mode in the kernel interface,
so "watch this project" is a library walking the tree and calling
`inotify_add_watch` once per directory in it. A project with 41,000
directories under it, most of them in `node_modules`, costs 41,000 watches.

Within one instance the kernel keys the watch on the inode, which I checked:

```
same instance, same directory twice     wd 1, then wd 1 again
same instance, same inode, other path   wd 1
a second instance, same directory       wd 1 of its own
watches charged to the user by those    2
```

So asking twice inside one program is free, and the rescan that re-adds
everything on SIGHUP is not leaking. But **two instances watching the same
directory pay in full**, and since the budget is per user, so do two programs.

That is how a developer machine runs out. An editor, a bundler, a test runner
and a file syncer all watching the same tree is four times the cost of one,
and no single one of them looks unreasonable.

## The failure that is not an error at all

`max_queued_events` is the one limit that is per instance, and overflowing it
does not produce an error. I lowered it to 64 and created 256 files without
reading the queue:

```
created 256 files without reading the queue once
  IN_Q_OVERFLOW at event 65: wd=-1
events actually read back: 65   of 256 created
events lost: 192
```

Every read returned success. The reader gets the queue's worth plus one
`IN_Q_OVERFLOW` marker, and the other 192 events are simply gone.

A watcher that "sometimes misses changes under load" is usually this, and not
a race in the program. The marker is the only thing that says so, and it is
easy to skip: it has `wd` set to -1, so code that looks up the watch
descriptor in a map and moves on when it finds nothing will drop it silently.

## What to actually do

1. **Read the errno, not the message.** `ENOSPC` means watches, `EMFILE`
   means instances, and neither string mentions either.
2. **Find the holder before raising anything.** Counting `inotify wd:` in
   `/proc/*/fdinfo/*` names the process in one command, and it is frequently
   not the one that failed.
3. **Exclude what does not need watching.** A bundler that ignores
   `node_modules` drops its watch count by an order of magnitude and loses
   nothing.
4. **Then raise the sysctl,** in `/etc/sysctl.d` so it survives a reboot.
   `max_user_watches` at 524288 is a common and reasonable setting.
5. **Handle `IN_Q_OVERFLOW`** by rescanning, because after it your picture of
   the tree is wrong and nothing else will tell you.

## Sources

- [inotify(7), on the limits and IN_Q_OVERFLOW](https://man7.org/linux/man-pages/man7/inotify.7.html)
- [inotify_add_watch(2), on ENOSPC](https://man7.org/linux/man-pages/man2/inotify_add_watch.2.html)
- [inotify_init(2), on EMFILE](https://man7.org/linux/man-pages/man2/inotify_init.2.html)
- [Documentation/filesystems/inotify.rst](https://docs.kernel.org/filesystems/inotify.html)
- [proc(5), on the fdinfo entries that show held watches](https://man7.org/linux/man-pages/man5/proc.5.html)

Every measurement here was taken on Linux 6.18.44, driving inotify through
ctypes and reading errno directly. Each sysctl was lowered for its experiment
and restored afterwards.

The ten watchers on [No space left](/inotify) are the same model, one question
each.
