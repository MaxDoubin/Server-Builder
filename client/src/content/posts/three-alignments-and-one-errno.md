## Invalid argument

```c
fd = open(path, O_RDWR | O_DIRECT);
n  = pwrite(fd, buf, len, off);
/* n == -1, errno == EINVAL */
```

Three things have to be aligned for that call to work, and all three report
the same errno when they are not. There is nothing in the return value, in
`errno`, or anywhere in `/proc` that says which. When two of them are wrong
at once, fixing one changes nothing visible.

That is why this is usually debugged by deleting `O_DIRECT`, which makes it
work and teaches nothing.

## The three

1. **The file offset** must be a multiple of the device's logical block size.
2. **The transfer length** must be too.
3. **The address of the buffer** must be as well, with an exception that is the
   whole second half of this article.

Measured on ext4, on a device whose blocks are 512 bytes:

```
length 1, 100, 255, 256, 511, 513, 4095, 4097    EINVAL
length 512, 1024, 4096                           wrote it
offset 1, 100, 255, 256, 511, 513                EINVAL
offset 0, 512, 1024, 4096                        wrote it
```

No short write and no padding. A 4095 byte record is not seven blocks and a
bit; it is a refusal.

## The number almost everybody uses is the wrong one

```
statx STATX_DIOALIGN
  stx_dio_mem_align      512
  stx_dio_offset_align   512
st_blksize               4096
```

`st_blksize` is what code reaches for, because it is in `struct stat` and has
been for decades. It is 4096 here and the alignment is 512.

Which means using it **works**. 4096 is a multiple of 512, so every write such
code makes is aligned, every test passes, and nobody learns the rule. Then the
code meets a device whose logical block size is 4096, or somebody puts a 100
byte header at the front of the file, and it starts returning EINVAL on a path
that has been fine for years.

Ask `statx` for `STATX_DIOALIGN` and use the two figures it gives you. They
have been there since Linux 6.1 and they answer the question exactly.

## The buffer rule is not the rule you think

Here is where it stops being arithmetic. From a buffer one byte into a page:

```
length  512   wrote it
length 1024   wrote it
length 2048   wrote it
length 4096   EINVAL
```

A misaligned buffer is not always refused. It is tolerated **exactly while the
whole transfer stays inside the page it started in**. Ten misalignments, and
the rule holds on every one:

```
buffer at    largest length that works    rest of the page
    +1                  3584                   4095
    +7                  3584                   4089
   +64                  3584                   4032
  +100                  3584                   3996
  +511                  3584                   3585
  +513                  3072                   3583
 +1000                  3072                   3096
 +2000                  2048                   2096
 +3000                  1024                   1096
 +4000              nothing works                96
```

The largest length from N bytes into a page is 4096 minus N, rounded down to a
whole block. Two rules apply at once and the smaller wins. From +4000 there
are 96 bytes left of the page and a block is 512, so nothing fits at all and
every write from that buffer fails.

At the boundary, from +1: a length of 3584 ends at byte 3585 of the page and is
accepted; 4096 ends one byte into the next page and is not.

**This is the worst of the three.** A `malloc` buffer writes 512 bytes happily
in your test and refuses 64 KiB in production. The code is wrong the whole
time and the size of the write decides whether you find out.

Note also what the page rule is *not*. A buffer that is block aligned but not
page aligned is completely unbounded: a 64 KiB write from 512 bytes into a
page, crossing sixteen pages, went through without complaint. The page only
enters into it when the buffer does not start where a block starts.

## It really is direct

Worth confirming, since the rest of the article is about the cost:

```
a 64 KiB write, then mincore on the file

  buffer aligned to 4096   wrote it, 0 of the file's pages resident
  buffer at +512           wrote it, 0 resident
  buffer at +1, +7, +64    EINVAL
  the same write buffered  wrote it, 16 resident
```

The kernel is not bounce-buffering your awkward pointer and it is not quietly
falling back to buffered I/O behind the flag. It either does it directly or
refuses. The alignment rules are the price and the bypass is what you get.

## Three mistakes I made measuring this

Worth writing down, because two of the three produced confident wrong answers
rather than obvious failures.

**Reading errno in the argument list.** The first probe was

```c
row(what, pwrite(fd, buf, len, at), errno);
```

and it printed `Success (errno 0)` for every failing call. The order in which
a function's arguments are evaluated is unspecified, and `errno` was read
before `pwrite` ran. Capture the return value, then `errno`, on their own
lines.

**Testing misalignments that were not misaligned.** The second probe walked
buffer offsets of +512, +1024, +2048, +3072 and +3584 and concluded that
memory alignment was not enforced at all. Every one of those is a multiple of
512.

**Testing the page rule with those same offsets.** Which printed "the rule does
not hold" on every row, and is what sent me back to look at them.

## What to do

- **Ask statx.** `STATX_DIOALIGN`, and use `stx_dio_offset_align` and
  `stx_dio_mem_align`. Not `st_blksize`.
- **Allocate with `posix_memalign` or `aligned_alloc`**, never `malloc`, for
  anything you will hand to a direct write, however carefully you size it.
- **Align the slices, not just the arena.** An allocator that packs records
  tightly will hand out some buffers that work and some that cannot be used at
  all, and the difference is invisible in the code.
- **Pad your headers to a whole block**, so the offsets of everything after
  them are aligned by construction.
- **Check all three yourself before the call** and fail with a message that
  names the one that is wrong. It is six lines, and it turns an afternoon into
  a log line.

## Sources

- [open(2), on O_DIRECT and what it requires](https://man7.org/linux/man-pages/man2/open.2.html)
- [statx(2), on STATX_DIOALIGN and the two figures it reports](https://man7.org/linux/man-pages/man2/statx.2.html)
- [posix_memalign(3)](https://man7.org/linux/man-pages/man3/posix_memalign.3.html)
- [mincore(2), which is how the last table was taken](https://man7.org/linux/man-pages/man2/mincore.2.html)
- [The kernel documentation on direct I/O in the VFS](https://docs.kernel.org/filesystems/vfs.html)

Every measurement here was taken on Linux 6.18.44, on ext4, on a device whose
logical block size is 512, with 4 kB pages. A device with 4096 byte blocks
changes every figure above. Other filesystems have their own answers, reads
were not measured, and neither was what happens at the end of a file, where a
direct write may be shortened.

The ten writes on [Three alignments, one errno](/odirect) are the same model,
one question each.
