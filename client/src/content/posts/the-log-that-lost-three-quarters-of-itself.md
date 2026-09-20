## Four writers, and one writer's worth

Four worker processes write to one log file. Each opens it for writing on
startup and writes two hundred sixty four byte records. That is 51200 bytes
into `write()`, every call returning 64, no errors anywhere.

```
how the file was opened                      bytes written   file is
each writer opens it with O_APPEND                   51200     51200
each writer opens it without O_APPEND                51200     12800
the parent opens it once and forks                   51200     51200
each writer pwrites at its own tiled offset          51200     51200
```

The second row is three quarters of the log gone. 12800 is 200 times 64:
exactly one writer's worth.

And that figure does not depend on the number of writers, which is the part
that makes it hard to see. Eight writers at fifty records of four kilobytes
handed over 1638400 bytes and left 204800 behind, which is again one writer's
worth. Adding load adds loss and leaves the file the same size.

## The offset does not belong to the file

Here is the thing that decides all four rows, and it is not a property of the
file, the filesystem, or the process.

A file offset belongs to an **open file description**. That is the kernel
object one `open()` call creates. A file descriptor is just a number in your
process that points at one.

- Two `open()` calls on the same path make **two** descriptions and two
  offsets. Neither knows the other exists.
- `fork` and `dup` make a second *descriptor* onto the **one** description.
  The offset is shared, and every write advances it for everybody.

So four workers that each open the log start at offset zero, four times over,
and walk forward independently. They are not appending. They are each writing
their own file, on top of each other, and the result is as long as the
furthest any one of them got.

Move the `open()` to the other side of the `fork` and the same four
processes, writing the same bytes with the same calls, lose nothing. `strace`
shows the same writes. The descriptor number can be the same. Nothing in the
write path differs.

## O_APPEND is not a seek and a write

The other fix is the flag, and it is worth being precise about what it does,
because "seek to the end, then write" is how people describe it and that is
the broken version.

`O_APPEND` makes the seek and the write **one operation**, performed under
the inode lock. There is no moment between them for another writer to use.
That is the entire reason it works for processes that have never heard of each
other and share nothing at all.

If you write the two steps yourself, you have written row two:

```c
lseek(fd, 0, SEEK_END);   /* another writer can extend the file here */
write(fd, record, n);     /* and now you are writing over them */
```

## pwrite is safe because of your arithmetic

The fourth row is the other way to be safe, and it has nothing to do with
appending. If the writers agree in advance who owns which bytes, they need no
shared offset and no flag:

```c
pwrite(fd, record, n, (record_number * writers + me) * n);
```

Drop the stride in a refactor so every worker computes `record_number * n`,
and the file goes back to 12800 bytes. Every write landed exactly where it was
told to; three quarters of them were told the same thing. `pwrite` moves the
correctness into your layout, which is an improvement only if the layout is
right.

## And O_APPEND throws pwrite's offset away

Somebody who has read this far might reasonably open with `O_APPEND` for
safety and use `pwrite` for control. On Linux, that does not do what it looks
like. On a ten byte file:

```
plain fd,     pwrite "XX" at 0    size 10   0123456789 becomes XX23456789
O_APPEND fd,  pwrite "XX" at 0    size 12   0123456789XX
O_APPEND fd,  lseek 0 then write  size 12   0123456789YY
```

`pwrite` exists precisely to write at an offset without disturbing the file
offset, and `pwrite(2)` documents the deviation in as many words: POSIX
requires `O_APPEND` to have no effect on where `pwrite` puts its data, and on
Linux it appends regardless of the offset.

So the offset argument is discarded. A program written that way reads as
placing records deliberately and is in fact appending them in whatever order
the processes get scheduled.

## What to do

If more than one descriptor is open on a file for writing, it needs
`O_APPEND`, or it needs a layout where no two writers own the same bytes.
There is no third option and there is no amount of low traffic that makes the
problem go away: a second writer starts overwriting from its very first
record, not when it happens to collide.

Two writers is enough. A cron job and a daemon is enough. A daemon and a
logrotate that reopens is enough.

And when you are reconciling, count what the writers think they sent and
compare it against the file, because neither end will tell you on its own. The
writers are right that they wrote 1638400 bytes. The file is right that it is
204800 long. Nothing in between logged a thing.

## Sources

- [open(2), on O_APPEND and on what an open file description is](https://man7.org/linux/man-pages/man2/open.2.html)
- [write(2), on the atomicity O_APPEND gives you](https://man7.org/linux/man-pages/man2/write.2.html)
- [pwrite(2), which documents the O_APPEND deviation from POSIX](https://man7.org/linux/man-pages/man2/pwrite.2.html)
- [fork(2), on the descriptors a child inherits and what they share](https://man7.org/linux/man-pages/man2/fork.2.html)
- [dup(2), on two descriptors onto one description](https://man7.org/linux/man-pages/man2/dup.2.html)
- [lseek(2), and why it is not half of an append](https://man7.org/linux/man-pages/man2/lseek.2.html)

Every measurement here was taken on Linux 6.18.44, on ext4, by forking writers
onto one file, giving each its own repeated character, and reading the size
back with stat. NFS is a different answer: the client has to do the seek
itself, so O_APPEND is not atomic there and the first table does not hold.

The ten logs on [Two writers, one offset](/append) are the same model, one
question each.
