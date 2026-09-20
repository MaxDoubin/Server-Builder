## Both of them had it

Two copies of a collector on one host, guarding the same path. The first was
written years ago:

```c
fd = open("/var/run/collect.lock", O_RDWR | O_CREAT, 0644);
flock(fd, LOCK_EX);
```

The second, shipped by a different team, does the obviously equivalent thing:

```c
fd = open("/var/run/collect.lock", O_RDWR | O_CREAT, 0644);
struct flock fl = { .l_type = F_WRLCK, .l_whence = SEEK_SET };
fcntl(fd, F_SETLK, &fl);
```

Both calls return success. Both processes proceed. There is no error, no
warning, and no counter anywhere that records it.

## There are two lists

Taking a lock in one process and having a second process ask for the same file,
both exclusive, both the whole file, every combination of the three interfaces
Linux offers:

```
holder used    fcntl asks    flock asks    OFD asks
fcntl             blocked       GRANTED     blocked
flock             GRANTED       blocked     GRANTED
OFD               blocked       GRANTED     blocked
```

`flock` keeps its own list of locks. `fcntl` record locks and open file
description locks, `F_OFD_SETLK`, share the other one. A request is only ever
compared against records on its own list, so the flock row and the flock column
are granted everywhere they meet something that is not a flock.

This is not an obscure corner. It is the single most likely reason a file that
two programs both lock gets written by two programs at once, and the only way
to find it from the outside is to read both programs.

## A lock belongs to one of two things

Run the same nine cells again, except the second party is a second descriptor
in the holder's own process:

```
holder used    fcntl asks    flock asks    OFD asks
fcntl             GRANTED       GRANTED     blocked
flock             GRANTED       blocked     GRANTED
OFD               blocked       GRANTED     blocked
```

Exactly one cell moved, and that cell is the rest of this article.

An `fcntl` lock is owned by the **process**. A `flock` and an open file
description lock are owned by the **open file description**, which is the thing
an `open()` creates and a `dup()` or a `fork()` shares. Two locks whose owners
agree do not conflict, so a second request from the same process is the owner
adjusting its own lock and is granted.

Which means `fcntl` gives you no mutual exclusion inside one program at all.
Two components that each open the ledger and each take the lock before writing
will both be holding it, and both were reviewed, and both look right.

## The close that had nothing to do with you

```
lock fd a, then open fd b to the same file, then close fd b
  fcntl    the lock is gone, an outsider took it
  flock    still held
  OFD      still held
```

The manual page does not hedge about this. Record locks, it says, are
associated with the process, and "this has some unfortunate consequences":

> If a process closes *any* file descriptor referring to a file, then all of the
> process's locks on that file are released, regardless of the file
> descriptor(s) on which the locks were obtained. This is bad: it means that a
> process can lose its locks on a file such as /etc/passwd or /etc/mtab when for
> some reason a library function decides to open, read, and close the same file.

The second consequence it lists is the one the matrix above measured: "a
multithreaded program can't use record locking to ensure that threads don't
simultaneously access the same region of a file."

Nothing in the locking code is involved. A metrics library that opens the state
file to read one line and closes it again is enough. This is the failure that
costs a day, because the lock works in every test, works under load, and
disappears the week somebody adds a dependency that happens to touch the same
path.

## Fork cuts both ways, and neither way is the one you want

```
the forked child, using the descriptor it inherited
  takes the same lock     fcntl blocked    flock GRANTED    OFD GRANTED
  calls the unlock        fcntl no effect  flock RELEASED   OFD RELEASED
```

Locks are not inherited across `fork`. The child gets the descriptor, and
therefore the description, but not the process. So:

- A supervisor that takes an `fcntl` lock and forks a worker to do the write has
  built a worker that cannot lock the file it was forked to write.
- A daemon that holds a `flock` on its pid file so a second copy cannot start,
  and then forks a helper whose cleanup path unlocks everything it can see, has
  a helper that can let the second copy start. The daemon is still running and
  still believes it holds the lock.

Both behaviors follow from the one sentence about ownership. Neither is a bug.

## Ranges, and the one thing flock cannot do

```
holder locks bytes 0 to 99 with fcntl
  an outsider asking for 0 to 99       blocked
  an outsider asking for 200 to 299    granted
holder locks with flock
  an outsider asking for 200 to 299    blocked
```

`fcntl` and `F_OFD_SETLK` are record locks: they cover a byte range, and two
ranges that do not touch do not conflict. `flock` is always the whole file. A
store that locks per record cannot be moved onto flock, which is usually the
reason a codebase has both and therefore the reason it has this bug.

## Except over NFS, where the two lists become one

Everything above is a local filesystem. `flock(2)` is explicit that the
separation is a property of the Linux system call, and that it goes away
exactly where you are most likely to be sharing a file:

- Over **NFS**, since Linux 2.6.12, `flock` is emulated as an `fcntl`
  byte-range lock over the whole file, so the two do interact.
- Over **SMB**, since Linux 5.5, the same, and with a sting: the locks stop
  being advisory, and any IO on a locked file from a separate descriptor fails
  with `EACCES`.
- On the **modern BSDs** they interact as well.

So the bug in the first section of this article quietly fixes itself on a
network filesystem, and a program that came to depend on the two not
interacting breaks when somebody moves the directory onto one. Neither
behavior is something to build on.

## What to use

1. **Pick one interface per file and write it down.** Most of this article
   only happens when two programs disagree, and nothing in the system will tell
   you they do.
2. **Prefer `F_OFD_SETLK`.** It is the same record lock as `fcntl`, conflicts
   with `fcntl` in both directions, and moves the ownership from the process to
   the descriptor. It survives an unrelated close, it excludes a second
   component of your own program, and a forked child inherits it. It has been in
   Linux since 3.15 and it is the one whose rules match what people assume.
3. **Never use plain `fcntl` locks in a process that loads code you did not
   write.** You cannot audit every library for an `open` and a `close` on your
   path, and one is enough.
4. **Close the inherited descriptor in a child, or set `FD_CLOEXEC`.** A helper
   that cannot see the descriptor cannot unlock it.
5. **Do not reach for mandatory locking.** `fcntl(2)` warns that the Linux
   implementation is unreliable, and it has been behind an optional config
   since Linux 4.5 as a first step toward removing it. Everything here is
   advisory: it stops the programs that ask, and nothing else.
6. **Assume nothing carries over to a network filesystem.** The separation you
   measured locally is not there over NFS or SMB.

## Sources

- [flock(2), on the lock being associated with the open file description](https://man7.org/linux/man-pages/man2/flock.2.html)
- [fcntl(2), on record locks, F_OFD_SETLK and the unfortunate close semantics](https://man7.org/linux/man-pages/man2/fcntl.2.html)
- [open(2), on what an open file description is and what shares one](https://man7.org/linux/man-pages/man2/open.2.html)
- [lockf(3), which is fcntl record locking with a different signature](https://man7.org/linux/man-pages/man3/lockf.3.html)
- [mount(8), on the -o mand option mandatory locking needed](https://man7.org/linux/man-pages/man8/mount.8.html)

Every measurement here was taken on Linux 6.18.44, on a local filesystem: all
nine combinations of the three interfaces, twice, once between two processes and
once inside one, plus fork, the unrelated close, byte ranges, shared locks and
execve. The NFS and SMB behavior above is from `flock(2)` and was not measured
here, because there was nothing to mount.

The ten files on [Three locks, one file](/locks) are the same model, one
question each.
