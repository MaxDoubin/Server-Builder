## A line with another line in it

```
2026-09-20T09:14:02Z worker-3 req=8812 status=200 lat2026-09-20T09:14:02Z worker-1 req=8813 status=500 ...
```

Two processes, one pipe, and one of them got halfway through its line before
the other one's bytes arrived. The number that decides whether this can happen
to you is **4096**, and almost everything else people believe about it is
wrong.

## The guarantee

A write of `PIPE_BUF` bytes or fewer is never interleaved with another
writer's. On Linux `PIPE_BUF` is 4096. This is a real guarantee, in POSIX, and
it does not have conditions attached.

In particular it does not care what else is on the pipe. Measured, four writers
onto one pipe, 200 records each, three runs:

```
three at 4096 with one at 5000    the 4096 writers: 200 of 200 whole, every run
two at 4096 with two at 20000     the 4096 writers: 200 of 200 whole, every run
one at 512 with three at 20000    the 512 writer:   200 of 200 whole, every run
```

The large writers in those runs were losing records constantly. It made no
difference at all to the small ones. Somebody else being unsafe does not make
you unsafe.

## Above it, nothing is gradual

The instinct is that 5000 bytes is "a bit over" and therefore a bit riskier.
It is not. Over the limit the guarantee simply stops.

```
size 4096    0, 0, 0 torn        divides 65536
size 4097    84, 81, 76
size 5000    103, 78, 72
size 8192    0, 0, 0 torn        divides 65536
size 8193    125, 125, 139
size 12288   146, 136, 132
size 16384   0, 0, 0 torn        divides 65536
size 20000   354, 311, 354
size 32768   0, 0, 0 torn        divides 65536
```

4096 tore nothing; 4097 tore about eighty of eight hundred. One byte.

## Now look at the clean rows

4096, 8192, 16384, 32768. Every one of them divides the pipe's 65536 byte
capacity exactly, and every one of them tore nothing in three runs out of
three. Every size that does not divide it tore between seventy and three
hundred and fifty.

The reason is visible once you draw one capacity of pipe with the records laid
end to end: a writer is only interrupted part way through a record if the pipe
fills part way through a record, and if the capacity is a whole number of
records, it never does.

So 8192 byte log lines are safe. Except they are not, and this is the part that
matters.

## The safety that survives nothing

```
four writers at 8192                 0, 0, 0 torn
three at 8192 and one at 5000        the 8192 writers lost 6, 6 and 14
```

The 8192 writers did not change. Not a line. A sidecar joined the pipe with a
different record size, the pipe stopped filling on record boundaries, and three
services that had been running clean for months started emitting mangled lines.

That is the real bug, and it is why it is so hard to find. It works in testing.
It works in staging. It works in production for a year. Then somebody adds a
logger and three other things break.

## The capacity may not be what you asked for

Since alignment is what is holding those writers together, it is worth knowing
you cannot set it precisely:

```
asked      granted
    1         4096
 4097         8192
40000        65536
65537       131072
1048576    1048576
2097152    refused, EPERM
```

`F_SETPIPE_SZ` rounds up to a power of two, and refuses anything over
`fs.pipe-max-size` rather than clamping to it. An operator who asks for 40000
to "get some headroom" gets 65536 and has changed the alignment for everyone on
the pipe without touching a line of application code. A program that does not
check the return value cannot tell a refused resize from a rounded one.

## A file is not a pipe

```
on a regular file, O_APPEND, two writers at 512 and two at 200000:
  every writer, 200 of 200 whole, every run
```

Nothing tore, at fifty times PIPE_BUF. Linux holds the inode lock for the
length of a buffered write, so writes to one file do not interleave.

Be careful with this one. It is a measurement of this kernel and this
filesystem, not a promise: POSIX guarantees nothing above PIPE_BUF, and it is
not true over NFS. But it does explain a difference people notice and cannot
account for:

```
myapp >> app.log            one file, and it held here
myapp 2>&1 | tee app.log    a pipe, and above 4096 it does not
```

Adding `tee` to a command turns a write with a lock around it into a write
with a 4096 byte guarantee.

## How I measured it, and two ways I got it wrong

Each writer emitted records of one repeated character, so a torn record is one
with two characters in it. The detector took three attempts and the first two
both appeared to show the POSIX guarantee being violated.

**Counting fixed-size windows** from offset zero works only while every writer
uses the same size. Mix 4096 and 5000 and the windows stop lining up with
anything.

**Splitting the stream on newlines** is worse, and it is worse in a way that
produces a confident wrong answer. When a large writer's record tears, its
fragments land either side of a small writer's intact record and swallow the
newline between them. A write that was never touched comes out of the splitter
as part of a broken line. That detector reported the 512 byte writer losing
records, which is not possible, and I nearly believed it.

**Counting maximal runs of one character in the raw bytes** is immune to both,
because nothing another writer does can shorten a run of your character. That
is the detector the numbers above come from.

If a measurement contradicts a documented guarantee, the measurement is
probably wrong. Twice, here, it was.

## What to do about it

1. **Keep log lines under 4096 bytes,** including whatever the logging library
   prepends. It is the only arrangement that survives somebody joining the pipe.
2. **Do not rely on a larger size that happens to work.** If it works because it
   divides the pipe capacity, it is one sidecar away from not working.
3. **Redirect to a file rather than piping** where you can, and know that this
   is a property of local filesystems rather than a guarantee.
4. **Check what `F_SETPIPE_SZ` actually gave you** by reading `F_GETPIPE_SZ`
   back. A refused resize and a rounded one look identical otherwise.
5. **When lines start coming out mangled, ask what joined the pipe,** not what
   changed in the service that is producing them. It is almost never that
   service.

## Sources

- [pipe(7), on PIPE_BUF and the capacity](https://man7.org/linux/man-pages/man7/pipe.7.html)
- [write(2), on atomicity](https://man7.org/linux/man-pages/man2/write.2.html)
- [fcntl(2), on F_SETPIPE_SZ and F_GETPIPE_SZ](https://man7.org/linux/man-pages/man2/fcntl.2.html)
- [proc(5), on fs.pipe-max-size](https://man7.org/linux/man-pages/man5/proc.5.html)

Every measurement here was taken on Linux 6.18.44, four writers per pipe, 200
records each, three runs per configuration.

The ten pipes on [Two writers, one line](/pipebuf) are the same model, one
question each.
