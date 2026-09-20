## Four numbers and a capability

`EMFILE`, "too many open files", sends everyone to the same place:

```
$ ulimit -n
1048576
```

which looks fine, so the next stop is `fs.file-max`, which also looks fine,
and by then the theory is that something is wrong with the kernel. Nothing is.
There are four limits, they are checked in different places by different code
with different permissions, and above them sits a capability that decides
whether two of them can move at all.

```
RLIMIT_NOFILE soft   what this process may open now      (alloc_fd)
RLIMIT_NOFILE hard   what it may raise the soft limit to
fs.nr_open           what ANY process may raise its hard limit to
fs.file-max          open files across the whole machine  (__alloc_file)
```

## Root is not one thing

Raising a hard limit needs `CAP_SYS_RESOURCE`. Running as uid 0 does not imply
holding it, and containers routinely drop exactly that one.

The container I wrote this on is a good specimen:

```
$ grep -E '^(Uid|CapEff):' /proc/self/status
Uid:    0  0  0  0
CapEff: 000001fffeffffff
```

Forty of the forty one capabilities. The single zero is bit 24,
`CAP_SYS_RESOURCE`. This process can write sysctls, create network namespaces
and load nftables rules. It cannot raise its own hard limit by one:

```python
>>> resource.setrlimit(resource.RLIMIT_NOFILE, (20000, 1048577))
ValueError: not allowed to raise maximum limit
```

`fs.nr_open` on that host is 1048576, so 1048577 is one over. Note what
happened, though: the call was **refused**, not reduced. From `kernel/sys.c`:

```c
	if (new_rlim->rlim_cur > new_rlim->rlim_max)
		return -EINVAL;
	if (resource == RLIMIT_NOFILE &&
			new_rlim->rlim_max > sysctl_nr_open)
		return -EPERM;
	...
	if (new_rlim->rlim_max > old_rlim->rlim_max &&
			!capable(CAP_SYS_RESOURCE))
		return -EPERM;
```

Three refusals and no clamping anywhere. A program that asks for more than
`fs.nr_open` does not quietly get `fs.nr_open`, it gets an error and keeps
what it had. And the `fs.nr_open` test comes first and consults no
credentials, so it binds a privileged process too.

## Lowering fs.nr_open freezes everything above it

This is the one that surprised me, and I found it by breaking my own test
script with it.

`setrlimit` carries both values. A program that means only to lower its soft
limit still restates the hard one, and the kernel checks that restatement.
So:

```python
# process is holding soft=20000 hard=20000
>>> open("/proc/sys/fs/nr_open", "w").write("4096")
>>> resource.setrlimit(resource.RLIMIT_NOFILE, (5000, 20000))
ValueError: not allowed to raise maximum limit
```

That call was *reducing* the soft limit. It failed, and the error names the
hard limit, which it was not trying to change.

The consequence is worth saying plainly: lowering `fs.nr_open` on a running
machine freezes the limits of every process already above it, in both
directions, including the ones that would have reduced usage. Nothing logs
it. The processes carry on at whatever they had until they restart.

## The soft limit is the one you hit

The per process check in `alloc_fd` is against the **soft** limit. The hard
limit is only the ceiling the soft one may be raised to, and nothing raises it
for you. A large hard limit next to a small soft one is the normal shape of
this failure, not evidence against it.

```
$ grep 'open files' /proc/PID/limits
Max open files            1024                 524288               files
```

A process that never calls `setrlimit` runs at 1024 there, however generous
the second column looks. Reading the wrong column of that line is, in my
experience, the single most common wrong turn in this whole diagnosis.

The good news is that raising the soft limit needs nothing at all. Any process
may set it to anything up to its own hard limit, no capability, no root:

```c
struct rlimit rl;
getrlimit(RLIMIT_NOFILE, &rl);
rl.rlim_cur = rl.rlim_max;
setrlimit(RLIMIT_NOFILE, &rl);
```

Three lines, at startup, and a whole class of incident stops happening. It is
the hard limit that is privileged, and most programs never needed to touch it.

## Lowering a hard limit is a one way door

Anyone can lower their hard limit. Almost nobody can raise it, and the kernel
keeps no memory of what it used to be. Lowering is inherited across `exec`, so
a supervisor that tidily drops its own hard limit before launching children
has permanently capped everything it launches, and the children cannot undo
it.

If you want a sandbox, that is the tool. If you did not want a sandbox, lower
the *soft* limit instead, which the child can raise again itself.

## The machine wide number is almost never it

`fs.file-max` is a ceiling over the sum of every process. Here is what it
looked like at the moment a process died of `EMFILE`, with its soft limit at
200:

```
$ cat /proc/sys/fs/file-nr
563	0	1645588
```

563 of 1,645,588. Nought point nought three four percent. `fs.file-max` was
never in it, and raising it would have changed a number nothing was checking
against.

The two errors do tell you which limit you hit, and it is worth learning the
pair. `EMFILE` is the per process soft limit. `ENFILE` is `fs.file-max`. The
fix for one does nothing for the other, so read the errno before touching any
sysctl.

## And that middle column is a constant

Look at `file-nr` again. `proc(5)` documents the second field as the number of
free file handles. Across a run that opened and released nearly two hundred
descriptors, it read:

```
before   367  0  1645588
peak     563  0  1645588
after    367  0  1645588
```

Zero throughout. The kernel stopped keeping a free list a very long time ago
and the field was left in place at zero for compatibility. A monitor alerting
on free file handles is reading a constant: it fires either never or always,
and in both cases it is telling you nothing.

Monitor the first column against the third, and monitor per process counts
from `/proc/PID/fd`, which is where the answer actually lives.

## Working it in order

When something says too many open files, go down the chain and stop at the
first number smaller than what you need:

1. **The soft limit** of the process that is failing. `/proc/PID/limits`,
   first column. Not your shell's, not the unit file's idea of it, that
   process's.
2. **The hard limit**, second column. If the soft limit is already there, the
   program needs `CAP_SYS_RESOURCE` or a bigger limit from whoever started it.
3. **`fs.nr_open`**, if you are trying to set a hard limit and being refused
   with EPERM while holding the capability.
4. **`fs.file-max`**, only if the errno was `ENFILE`.

It is almost always the first one, and the reason that feels surprising is
that the first one is also the only one that is invisible from outside the
process.

## Sources

- [getrlimit(2), on RLIMIT_NOFILE and which changes are privileged](https://man7.org/linux/man-pages/man2/getrlimit.2.html)
- [capabilities(7), on CAP_SYS_RESOURCE](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [proc(5), on /proc/sys/fs/file-nr and /proc/PID/limits](https://man7.org/linux/man-pages/man5/proc.5.html)
- [Documentation/admin-guide/sysctl/fs.rst, on file-max and nr_open](https://docs.kernel.org/admin-guide/sysctl/fs.html)
- [kernel/sys.c, do_prlimit and the order of its checks](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/kernel/sys.c)

Every measurement here was taken on Linux 6.18.44 in a container running as
uid 0 without `CAP_SYS_RESOURCE`, and every limit was restored afterward. The
one claim I did not measure is `ENFILE`: filling `fs.file-max` on that machine
would have taken the machine with it, so that branch comes from
`__alloc_file` in the source.
