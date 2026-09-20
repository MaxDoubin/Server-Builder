## The call succeeded and the process died

A config loader maps a file. The length it passes is 8192, because that is the
size it expects. `mmap` returns an address. The file on disk is 100 bytes,
because a deploy truncated it, and nothing anywhere has said so yet.

```
byte      what happens
  99      reads the last byte of the file
 100      reads zero
4095      reads zero
4096      SIGBUS
```

Three things in that table are worth arguing with. The signal is not at 100.
The bytes before it read as zero rather than failing. And the signal is
SIGBUS, which most people have met once, rather than the one they have met a
thousand times.

## mmap does not check the length

It cannot usefully, and it does not try. The file can be any size a moment
after the call returns, so a check at `mmap` time would guarantee nothing.
What you get back is a range of address space with a promise about where the
pages will come from, and the promise is kept, or not kept, at the moment a
page is touched. By then the only thing that can report a missing page is a
signal.

This is the whole shape of the difficulty. `read()` tells you it came up
short by returning a smaller number. A mapping has no return value to be short
in.

## Two edges, and they are rarely in the same place

There are two boundaries and both are rounded up to a page, which is why they
are so easy to conflate:

- **The end of the mapping.** The length you passed, rounded up to a whole
  page. Past it there is no mapping, and the kernel reports that the way it
  reports any address with nothing at it: **SIGSEGV**.
- **The end of the file's pages.** The file's current size, rounded up to a
  whole page. Inside the mapping but past this, there is a mapping and nothing
  to put in it: **SIGBUS**.

On the 100 byte file mapped for 8192, the first edge is at 8192 and the second
is at 4096, so bytes 4096 through 8191 are the SIGBUS range. Turn it around
and you get the other signal:

```
a 16384 byte file, mmap called with a length of 100

  99      reads the byte in the file
4095      reads zero
4096      SIGSEGV
```

Here the file is long enough and it does not help at all, because the question
at byte 4096 is not whether the file has a page there. It is whether the
process has a mapping there, and it does not: a length of 100 rounds up to one
page and stops.

So the two signals are two different mistakes. **SIGBUS is a mapping longer
than its file. SIGSEGV is an access longer than its mapping**, and no amount
of file will fix it.

That second table took two attempts. The first reported byte 4096 as fine,
because the kernel had put some other mapping at that address and the read
found it. Measuring the end of an address range means owning what is on the
other side of it, so the numbers above come from a program that reserves eight
pages with `PROT_NONE` first and maps the file into the front of them with
`MAP_FIXED`.

## The stretch that reads as zero

Between the end of the file and the end of the page the file stops in, there
is real memory. The kernel zeroed it, because handing you a page means handing
you a whole one and it is not going to leak whatever was in it before. Reads
there succeed and return zero.

Which means a mapping cannot tell you where the data ends. What it gives you
past the end of the file is indistinguishable from data that happens to be
zero, and there is no count, no signal and no flag to consult. Carry the
length separately and stop at it.

Stores into that stretch are worse, because they look like they worked:

```
write 'A' at offset 50 and 'Z' at offset 200 of a 100 byte file, then msync

  read offset 50 through the descriptor     A
  file size                                 100
  grow the file to 4096, read offset 200    zero
```

The A is in the file, because offset 50 is inside it. The Z is not. Both
stores completed, neither raised a signal, `msync` reported success for the
range that contained both of them, and the file is still 100 bytes long. A
store through a mapping never makes a file longer, and growing the file
afterwards does not go back and collect the byte.

If you want to write past the end, `ftruncate` the file first and then store.
The bytes between the old end and the new one are the only ones a store can
land in.

## The file can change size under you

The second edge is not fixed when the mapping is made. It follows the file:

```
grow 100 to 4106       byte 4096 becomes readable
shrink 4106 to 100     byte 4096 is SIGBUS again
```

The process holding the mapping makes no call in either row. It did not remap
anything and was not told anything. A mapping refers to the file, not to a
copy of the file, so the set of pages behind it moves when the file does.

Note where the grow left the safe edge. The file is 4106 bytes, so its last
page is page one, so the mapping is backed through byte **8191** and not
through 4105. The last page of a file exists in full however little of the
file is in it, which is the same rule that put the first table's SIGBUS at
4096 rather than at 100.

## MAP_PRIVATE is not protection

This is the row worth carrying away. Map the file `MAP_PRIVATE`, store to the
second page so that the process owns a copy on write copy of it that nothing
else can see, and then have something truncate the file:

```
MAP_PRIVATE, store to page 1 first, then truncate to 100    SIGBUS
```

The copy is gone. `ftruncate` unmaps the range it removes from every mapping
of that inode before it returns, and a private copy is one of those. Owning
the page privately bought nothing.

That is worth knowing because MAP_PRIVATE is the flag people reach for when
what they want is to be insulated from everyone else. It insulates the file
from your stores. It does not insulate your process from the file.

## What to do about it

- **Size the mapping from `fstat` on the descriptor you are about to map**,
  in the same breath, and treat a file shorter than you expected as an error
  there rather than as a signal later.
- **Never shorten a file that is mapped**, including from the process that
  mapped it. Write a new file and `rename` it over the old one, which leaves
  every existing mapping pointing at the inode it was made from.
- **Round to pages yourself** before you reason about any of this. The kernel
  is working in pages and a boundary you computed in bytes is not the boundary
  it is using.
- **Read the two signals as two different bugs.** SIGBUS on a mapped file
  means the file is shorter than the mapping, so go and find out who shortened
  it. SIGSEGV means the access is outside the mapping, and the file is not
  involved.

A SIGBUS handler that resumes is possible and is almost never what you want:
by the time it fires, the data the program was reading does not exist, and
there is nothing for the handler to do except decide how to fail.

## Sources

- [mmap(2), on the rounding and on both signals](https://man7.org/linux/man-pages/man2/mmap.2.html)
- [ftruncate(2), on what happens to mappings of a file you shorten](https://man7.org/linux/man-pages/man2/ftruncate.2.html)
- [msync(2), and what it does and does not promise](https://man7.org/linux/man-pages/man2/msync.2.html)
- [sigaction(2), for catching SIGBUS long enough to print something useful](https://man7.org/linux/man-pages/man2/sigaction.2.html)
- [The Linux kernel documentation on the page cache](https://docs.kernel.org/filesystems/vfs.html)

Every measurement here was taken on Linux 6.18.44, on ext4 with 4096 byte
pages, by mapping files in C, installing handlers for both signals and
touching one byte at a time. Network filesystems, huge pages, MAP_POPULATE and
mlock are all capable of changing one or another of these answers and none of
them were measured.

The ten accesses on [Three boundaries, three outcomes](/mapped) are the same
model, one question each.
