## Four kilobytes, and then a gigabyte

A database preallocates its data file by seeking to the end and writing one
byte, so the file exists at full size before any rows go in. On ext4 with a
4096 byte block:

```
$ ls -l data
-rw-r--r-- 1 root root 1073741824 Sep 20 13:07 data
$ du -k data
4	data
```

A gigabyte long, four kilobytes on disk. Both numbers are right. They answer
different questions.

`ls` reports the apparent size, which is the offset of the last byte written
plus one. `du` reports the blocks the filesystem actually handed out. Nothing
in the design makes those agree, and on a file written this way they differ by
a factor of two hundred and sixty thousand.

Then the overnight backup runs `cat data > /backup/data`, and the backup
volume, which has half a gigabyte free, fills up.

## What costs a block is touching it

The allocation is in whole blocks, and the boundary is where people's
intuition goes:

```
what was written              apparent size    du
1 byte at offset 0                        1    4K
1 byte at offset 4095                  4096    4K
1 byte at offset 4096                  4097    4K
1 byte at 0 and 1 at 4096              4097    8K
```

Rows two and three are the same cost for a file twice as long. Row four is
twice the cost for one more byte, because that byte is the first one in a
second block. Writing four more bytes into a block that is already there is
free: the 1 byte file stayed at 4K when four more went in at offset 2.

Count blocks touched, not bytes written. A record format that puts a byte in
each of a thousand blocks costs four megabytes.

## Zeros written are zeros stored

The provisioning script that reserves space by writing zeros is not being
clever:

```
10 MiB from /dev/zero      du 10240K
fallocate -l 10M           du 10240K
```

The filesystem does not read the buffer you handed it and is not going to. A
hole is made by not writing, not by writing nothing. Both of those rows are
ten mebibytes of real blocks, and both are exactly what was asked for.

## Which tool keeps the hole

This is the part that costs people disks. The same gigabyte file with its one
byte, copied six ways:

```
cp                            4K
cp --sparse=never       1048580K
cat src > dst           1048580K
tar cf then tar xf      1048580K
tar cSf then tar xf           4K
dd conv=sparse bs=1M       1024K
```

Only `cp` on its own and `tar` with `-S` came through intact. Everything
else read the holes, got the zeros a hole returns, and wrote them out. There
is nothing subtle about it: a read of a hole is a successful read that yields
zeros, and a tool that does not go looking for holes has no way to tell those
zeros from any others.

`tar` is the one that catches people, because taking a tar archive is what
the runbook says and the archive is a gigabyte either way.

## dd gives holes back one buffer at a time

`dd conv=sparse` skips writing a buffer that is entirely zero. That means the
narrowest hole it can produce is one buffer wide, and the buffer is dd's, not
the filesystem's:

```
bs=4096        4K
bs=65536      64K
bs=1M       1024K
bs=8M       8192K
```

The convenient big block size everybody uses for throughput is the one that
loses you the most. It is still a great deal better than 1048580K, but if you
want the holes back exactly, `bs` has to be the filesystem block size, and
then you have given up the throughput you chose dd for.

## Holes can be made as well as lost

Sixty four mebibytes of real zeros, copied two ways:

```
cp                      65536K
cp --sparse=always          0K
```

`cp` has three modes and the default is `auto`, which **preserves** the holes
in the source. It does not **detect** anything. "cp is sparse aware" is true
and is not the same claim, and the two get conflated constantly.

`--sparse=always` reads every byte and punches out the runs of zeros it
finds, which is how a file that was written solid becomes a file that is not.
`fallocate --dig-holes` does the same thing in place without a second copy.
Both read the whole file, so neither is free.

An `fallocate`d extent behaves the same way under it: 8 MiB reserved came out
of `cp --sparse=always` at 0K, because an unwritten extent reads back as
zeros exactly as written zeros do.

## Punching frees whole blocks and nothing else

A log trimmer punching out the front of a file:

```
4 blocks, punch bytes 100 to 8100      du 16K    unchanged
4 blocks, punch bytes 4096 to 12288    du  8K
```

The first one freed nothing. Block 0 starts before 100 and block 1 runs to
8191, past the end of the range, so neither lies entirely inside it and
neither can go. A block is allocated or it is not; there is no half.

A punch also never changes the length. Punching bytes 0 to 100000 of a one
byte file left it one byte long and freed its only block, because that block
runs to 4095 and is inside the range even though the file is not.

Align a punch to the block size, or it is a no-op that returns success.

## Truncate is not a reservation

```
8 blocks written                  du 32K   apparent 32768
truncate -s 8192                  du  8K   apparent 8192
truncate -s 1000000               du  8K   apparent 1000000
```

Growing a file with `truncate` costs nothing and reserves nothing. The 992
kilobytes on the end is a hole, and the first write into it can still fail
with ENOSPC. If the writer needs the blocks to exist, that is what
`fallocate` is for.

## What to do

Read the two numbers as the different things they are. `du` for capacity,
`ls -l` for what the application believes, and `du --apparent-size` when you
want the second one in the first one's units.

Copy images, database files and anything else preallocated with something that
understands holes: `cp`, `tar -S`, `rsync -S`, or `dd conv=sparse` with a
small block size. Size the destination from `du` on the source and not from
`ls`, and find out what your backup tool does before the disk finds out for
you.

And if you want to know where the holes in a file actually are rather than
inferring it from two numbers, the kernel will tell you. `lseek` with
`SEEK_DATA` and `SEEK_HOLE` walks the map directly, which is how `cp` has
done it since coreutils 8.10:

```
data from 1073737728 to 1073741824  (4096 bytes)
apparent size 1073741824
```

## Sources

- [lseek(2), on SEEK_HOLE and SEEK_DATA](https://man7.org/linux/man-pages/man2/lseek.2.html)
- [fallocate(2), on punching holes and on KEEP_SIZE](https://man7.org/linux/man-pages/man2/fallocate.2.html)
- [truncate(2), which says the extended part reads as zeros](https://man7.org/linux/man-pages/man2/truncate.2.html)
- [stat(2), on st_blocks, which is in 512 byte units whatever the block size is](https://man7.org/linux/man-pages/man2/stat.2.html)
- [The coreutils manual on cp and its three sparse modes](https://www.gnu.org/software/coreutils/manual/html_node/cp-invocation.html)
- [The GNU tar manual on sparse files and -S](https://www.gnu.org/software/tar/manual/html_node/sparse.html)
- [dd(1), on conv=sparse](https://man7.org/linux/man-pages/man1/dd.1.html)

Every measurement here was taken on Linux 6.18.44, on ext4 with a 4096 byte
block, after a sync. The four kilobytes over a round gigabyte in those figures
is the extent tree index block: four extents fit in an ext4 inode and the
fifth costs one block, which showed as no overhead up to 384 MiB written and
4 KiB from 512 MiB up.

The ten files on [A gigabyte in one block](/sparse) are the same model, one
question each.
