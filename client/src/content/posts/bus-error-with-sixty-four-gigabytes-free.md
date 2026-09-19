## The error names the wrong thing

A screenshot service dies in production. The whole log entry is two words:

```
Bus error (core dumped)
```

The host has 64 GiB of RAM and 60 of them are free. There is no OOM kill.
`dmesg` is empty. The container has no memory limit set. Everything that
would normally explain a process dying says nothing happened.

What ran out is a filesystem, and it is 64 megabytes, and it is called
`/dev/shm`.

## Where 64 MiB comes from

Docker mounts `/dev/shm` as a tmpfs inside every container. The documentation
states the default plainly: "If you omit the size entirely, the system uses
`64m`."

On a host, outside a container, the same path defaults to half of physical
memory. So the same binary on the same machine has 32 GiB of shared memory in
one place and 64 MiB in the other, a factor of five hundred, decided by the
container runtime rather than by the kernel or by anything the application
can see. That gap is the entire reason this failure reads as something the
container broke.

Plenty of ordinary software uses it. Chromium puts renderer shared memory
there, which is why headless browsers hit this first and hardest.
PostgreSQL's parallel query workers allocate their segments there when
`dynamic_shared_memory_type` is `posix`, which is the default on Linux.
PyTorch DataLoader workers pass tensors back through it. None of these are
exotic, and none of them mention 64 MiB in their own documentation, because
it is not their number.

## Why it is a signal and not an error

Here is the part that makes the failure genuinely hard, measured on an 8 MiB
tmpfs with a 32 MiB mapping rather than reasoned about:

```
mmap of 33554432 bytes SUCCEEDED on a filesystem that cannot hold it
SIGBUS after 8388608 bytes touched (8 MiB)
```

Two separate surprises in three lines.

**The mmap succeeds.** Mapping a region is an address space reservation, not
an allocation. The pages behind it are found at first touch, and it is the
page fault, later, somewhere else in the program, that cannot be satisfied.
Code that carefully checks `shm_open` for a negative fd, `ftruncate` for a
non-zero return and `mmap` for `MAP_FAILED` has checked three things that all
succeeded.

**The failure arrives as SIGBUS.** Not `ENOSPC`, not `ENOMEM`, not any errno,
because a signal is not an error return. The default action is to terminate,
and the shell prints "Bus error". There is nothing at the call site to check
and nothing to handle without a signal handler, which almost nothing installs.

The same full filesystem behaves completely normally through an ordinary
write. `dd` to it gets "No space left on device" and reports zero bytes
copied, like any full disk. So the obvious test, writing a file to `/dev/shm`
to see whether it is full, reproduces the space problem and never reproduces
the crash. That is worth knowing before you spend an afternoon on it.

## The arithmetic

It is not subtle once you know which number applies. Shared memory per
concurrent unit of work, times the units that run at once, against 64 MiB.

A headless Chromium at roughly 8 MiB per renderer fills the default at eight.
The ninth renderer maps its region, touches a page, and dies. Six PostgreSQL
parallel workers across four concurrent queries is 24 segments. Eight
DataLoader workers holding a batch each is eight times the batch size, and
prefetching workers hold batches at the same time, which is the point of
them, so they do not take turns.

The tell for this class of bug is that it fails at a different step each run
when the workload is concurrent, because which unit gets there first is
timing.

## Three fixes, and what each one costs

**Size it.** `--shm-size=256m` on Docker, `shm_size: 256m` per service in a
compose file. This is the right answer most of the time. Note "per service":
a compose file where one service has the key and another does not has one
container fixed and one at the default, and the one that fails is whichever
nobody edited, in a file that visibly contains the fix.

**Move it.** Chromium's `--disable-dev-shm-usage` is the first result for this
error and it does work: the data goes under `/tmp` instead, and `/dev/shm` is
no longer involved. Whether that is a fix depends on what `/tmp` is. If it is
the container's overlay filesystem, you have turned memory traffic into disk
writes on every frame, and the service gets slower in a way nobody connects to
the ticket that was closed. Make `/tmp` a tmpfs if you go this way.

**Raise it, and the memory limit with it.** A tmpfs is memory with a
filesystem interface, and its pages are charged to the cgroup that touches
them. Setting `--shm-size=1g` inside `--memory=2g` does not buy a gigabyte
from somewhere else; it raises the ceiling on how much of that two gigabytes
can be shared. A workload that was taking SIGBUS will then be OOM killed
instead, which is at least a failure that leaves a message.

The reassuring half of that: a large tmpfs costs nothing until something is
written to it. The charge is the pages in use, not the size of the mount. So
sizing `/dev/shm` generously is safe, and sizing the memory limit to the tmpfs
ceiling is wasteful.

## Kubernetes has no field for this

There is no `shmSize` in a pod spec. The container runtime mounts the default
and nothing in the spec overrides it, so raising `resources.limits.memory` to
4 GiB changes what the cgroup permits and leaves the filesystem at 64 MiB.

The way through is a volume:

```yaml
volumes:
  - name: dshm
    emptyDir:
      medium: Memory
      sizeLimit: 256Mi
volumeMounts:
  - name: dshm
    mountPath: /dev/shm
```

`medium: Memory` makes the emptyDir a tmpfs, `sizeLimit` sizes it, and the
pages count against the pod's memory limit, so the limit usually needs raising
too. Two changes, because the volume and the limit are separate things.

## What to check, in order

1. `df -h /dev/shm` inside the container. If it says 64M, that is your number
   whatever the host has.
2. `findmnt /dev/shm` inside and outside. When a workload behaves differently
   in a container, this one command settles it.
3. Multiply: shared memory per concurrent unit, times units at peak. Compare
   against the 64M, not against the host.
4. Do not test with `dd`. A write gets ENOSPC and the crash needs a mapping,
   so the easy test comes back clean on a filesystem that is about to kill
   something.
5. If you raised `--shm-size` and the Bus error became an OOM kill, that is
   progress and not a regression. Raise the memory limit to match.
6. On Kubernetes, stop looking for the field. It is an emptyDir with
   `medium: Memory`.

## References

- [docker run reference](https://docs.docker.com/engine/containers/run/), for `--shm-size` and the sentence stating the 64m default
- [Compose file reference](https://docs.docker.com/reference/compose-file/services/), for `shm_size` as a per service key
- [Kubernetes: emptyDir](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir), for `medium: Memory`, `sizeLimit`, and that the pages count against the pod's memory limit
- [mmap(2)](https://man7.org/linux/man-pages/man2/mmap.2.html), for SIGBUS on a page that cannot be backed, and for why the mapping itself succeeds
- [tmpfs](https://docs.kernel.org/filesystems/tmpfs.html), for what a tmpfs is and how its pages are accounted
- [PostgreSQL: dynamic_shared_memory_type](https://www.postgresql.org/docs/current/runtime-config-resource.html), for the posix default that puts parallel worker segments in /dev/shm
- [Chromium: --disable-dev-shm-usage](https://chromium.googlesource.com/chromium/src/+/main/docs/), for what the flag does and where the data goes instead