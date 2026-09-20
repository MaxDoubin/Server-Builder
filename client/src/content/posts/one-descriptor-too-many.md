## A week of uptime, and then a function pointer

A proxy has been running for a week. Connections have come and gone. The
process is holding a few hundred at a time and has opened, by now, a few
hundred thousand descriptors over its life. Then it segfaults somewhere with
no obvious relationship to anything, in a call through a function pointer that
was fine the whole time.

Here is the entire cause:

```c
#define __FD_SET(d, set)   ((set)->fds_bits[__FDELT(d)] |= __FDMASK(d))
```

An index and a shift. There is nothing else in it. No bound, no return value,
nowhere for a check to go.

## The arithmetic does not change at 1024

`FD_SET(fd, &set)` sets bit `fd % 8` of byte `fd / 8`, counting from the
start of the fd_set. An `fd_set` is 128 bytes, which is 1024 bits, one per
descriptor from 0 to 1023.

So descriptor 1024 is byte 128. Not an error, not a wrap, not a truncation:
byte 128, the same way descriptor 1016 is byte 127. Measured, with the bytes
after the set filled with zeros so anything landing there shows up:

```
FD_SET(1022)   inside the set
FD_SET(1023)   inside the set, byte 127, bit 7
FD_SET(1024)   0x01 at byte 128, one past the end
FD_SET(1031)   0x80 at byte 128, the same byte
FD_SET(1088)   0x01 at byte 136
FD_SET(1500)   0x10 at byte 187
FD_SET(5119)   0x80 at byte 639
```

Eight descriptors to a byte, walking off the end of the object at exactly the
rate the program accepts connections.

*A note on measuring this.* The first version of that table filled the bytes
after the set with 0xAA rather than zero, to make the writes visible. 0xAA is
0b10101010, which already has every odd bit set, so `FD_SET` of an odd
descriptor left the byte unchanged and read as clean. Half the rows were wrong
and the wrong half looked like a pattern: 1024 clobbered, 1025 fine, 1026
clobbered. Fill with zero.

## Which of your fields gets the bit

This is the part worth carrying around, because it is not a property of
`select` at all. The byte past the set belongs to whatever the compiler put
there, so the same bug corrupts a different thing in every program.

```c
struct conn_table {
  fd_set readable;   /*   0, 128 bytes */
  int    live;       /* 128,   4 */
  char   name[16];   /* 132,  16 */
  long   deadline;   /* 152,   8 */
  void  *handler;    /* 160,   8 */
  char   tail[512];  /* 168, 512 */
};
```

```
FD_SET(1024)   byte 128   live
FD_SET(1050)   byte 131   live
FD_SET(1100)   byte 137   name
FD_SET(1180)   byte 147   name
FD_SET(1200)   byte 150   padding, between name and deadline
FD_SET(1300)   byte 162   handler
FD_SET(2000)   byte 250   tail
```

Three of those are worth dwelling on.

**1300 lands in `handler`**, which is a function pointer. The bit is set, the
store returns, and nothing happens. The crash comes later, from a call site
that has nothing to do with descriptors, and the backtrace points at the
victim rather than at the loop.

**1200 lands in padding**, in the four bytes the compiler left between a
sixteen byte array and an eight byte aligned `long`. The program is corrupt
and every test passes. Add a field, build for a different target, change the
order of two members, and the same descriptor lands on something real.

**And the arrangement almost every select loop actually has** is two sets in a
row:

```c
struct { fd_set readable; fd_set writable; int count; } s;
```

Now descriptor 1024 of the read set is descriptor 0 of the write set.
`FD_SET(1040, &s.readable)` is `FD_SET(16, &s.writable)`. A read on a high
descriptor becomes a write on a low one, and descriptor 16 belongs to some
connection that has been open since startup and is about to be written to for
no reason at all. That is the version of this that never gets diagnosed,
because it does not look like corruption. It looks like an event on a
different connection.

## FD_ISSET reads the same byte

The write side gets the attention, and the read side is arguably worse,
because it manufactures work out of unrelated data. Same struct, `live` set
to 3, `name` set to `worker-7`, and not one bit ever set in the fd_set:

```
FD_ISSET(1024)        ready, from bit 0 of live
FD_ISSET(1025)        ready, from bit 1 of live
FD_ISSET(1056..1117)  39 of them ready, from the ASCII of "worker-7"
```

Thirty nine descriptors reported as readable, all of them spelled out by the
name of the worker. The loop dispatches on them, calls `read()`, gets EBADF,
and does it again next time round because nothing cleared anything.

If a select loop starts reporting readiness on descriptors that were never
accepted, read the numbers as byte offsets into the struct. They will spell
something.

## glibc has a check and it is off

This is the most actionable paragraph here:

```
-D_FORTIFY_SOURCE=0   FD_SET(1024) returns normally
-D_FORTIFY_SOURCE=1   *** bit out of range 0 - FD_SETSIZE on fd_set ***: terminated
-D_FORTIFY_SOURCE=2   the same
-D_FORTIFY_SOURCE=3   the same
```

glibc's `__fdelt_chk` exists precisely for this, and it is compiled in from
fortify level 1, the lowest there is: `bits/select2.h` redefines `__FD_ELT`
whenever `__USE_FORTIFY_LEVEL` is greater than zero. With no flag at all, on
this toolchain, it is not there.
Whether a program corrupts itself in silence or stops with a message naming
the problem is a build flag, and it is almost never a build flag anybody chose
with `select` in mind.

## 1024 is not the kernel's number

Worth knowing, if only so you stop looking for a kernel setting to raise:

```
a readable pipe end at descriptor 2000

poll(fd 2000)                        returns 1, POLLIN
select(nfds 2001, 512 byte bitmap)   returns 1, bit 2000 set on return
select(nfds 2001, a real fd_set)     returns -1 EBADF
select(nfds 1024, bit 2000 set)      returns 0
select(nfds -1)                      returns -1 EINVAL
```

The syscall takes `nfds` and a pointer, and reads ceil(nfds / 8) bytes from
it. It has never heard of FD_SETSIZE. Hand it a bitmap that is big enough and
it will watch descriptor 2000 quite happily. 1024 is a number in
`<sys/select.h>`, and the type it sizes is the only reason your program
cannot go past it.

Two consequences fall out of that last table.

`select(nfds 2001, a real fd_set)` returned **EBADF**, because the kernel read
251 bytes from a 128 byte object and found bits in the 123 bytes of stack after
it. Raising nfds without growing the buffer hands your own stack to the kernel
as a descriptor list.

And `nfds` is not a hint. It is how much of your buffer gets read. A bit above
it is a descriptor that is silently never polled, which from the outside looks
exactly like a peer that went quiet. Pass the highest descriptor plus one,
recomputed every time round the loop, never a constant.

One more thing, for anyone who tries to reproduce the EBADF row and cannot.
How far past your buffer the kernel reads is not up to you either: it clamps
nfds to the size of the process's descriptor table, and that table grows as
descriptors are allocated. The same call, with the same bit set past the same
fd_set, returned 0 in a process with a handful of descriptors open and EBADF in
one with 1598 of them. Which is another way of saying this reproduces on a busy
server and not on your test.

## What to do about it

- **Use `poll` or `epoll`.** They name descriptors instead of indexing bits,
  and the number 1024 does not appear anywhere in either. This is the fix;
  everything below is for code you cannot replace this week.
- **Build with `-D_FORTIFY_SOURCE=3 -O2`.** It costs nothing at runtime and
  turns this specific silent corruption into a message that names it.
- **Guard every call**, if you are stuck: `if (fd >= FD_SETSIZE) { close(fd);
  continue; }` at least fails a connection rather than the process. Do it at
  `accept()`, not at `FD_SET`, or you will miss one.
- **Do not put anything after the fd_set** in a struct. It does not fix the
  bug, and it stops the damage landing in something you are also reading.
- **Never two fd_sets in a row.**

And if you are reading a backtrace right now: take the descriptor numbers the
process was handling, divide by eight, and look up the offsets in the struct
the fd_set lives in. The answer is a field name.

## Sources

- [select(2), which documents the FD_SETSIZE limit and recommends poll](https://man7.org/linux/man-pages/man2/select.2.html)
- [select_tut(2), on nfds and on what the bitmaps mean](https://man7.org/linux/man-pages/man2/select_tut.2.html)
- [poll(2), which has no such limit](https://man7.org/linux/man-pages/man2/poll.2.html)
- [epoll(7), for the same job at scale](https://man7.org/linux/man-pages/man7/epoll.7.html)
- [getrlimit(2), on RLIMIT_NOFILE and where the descriptor numbers come from](https://man7.org/linux/man-pages/man2/getrlimit.2.html)

Every measurement here was taken on Linux 6.18.44 with glibc on x86-64, by
putting an fd_set inside a struct with known offsets, calling the macros, and
reading the whole object back a byte at a time. Thirty two bit builds, where
the word size and therefore the padding differ, pselect, epoll, and any libc
other than glibc were not measured.

The ten calls on [One descriptor too many](/fdset) are the same model, one
question each.
