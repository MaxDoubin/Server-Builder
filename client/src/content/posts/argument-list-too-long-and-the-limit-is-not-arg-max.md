## The byte count says it fits

A cleanup job expands to 48,000 paths of about forty bytes each. That is 1.83
MiB of filenames. The machine reports a limit of 2 MiB. It fails before the
command runs.

```
$ getconf ARG_MAX
2097152
```

Two numbers, one smaller than the other, and the smaller one is refused. The
usual next move is to reach for `xargs` and stop thinking about it, which
works, and which leaves you unable to size a batch without guessing.

## The limit is a quarter of your stack

The first thing `getconf ARG_MAX` is not is a constant. On this host:

```
getconf ARG_MAX      2097152
RLIMIT_STACK soft    8388608   (8 MiB)
```

The first is the second divided by four. Change the stack limit and it follows.
Measured, with 64 byte arguments:

```
stack      stack/4     arguments that fit
 2 MiB      524288                   7181
 4 MiB     1048576                  14363
 8 MiB     2097152                  28727
16 MiB     4194304                  57455
```

So `ulimit -s` is a real lever, and a machine with a different stack default
has a different command line limit for reasons nothing in the error mentions.

## An argument costs more than it is long

Here is where the 1.83 MiB goes wrong. The kernel does not copy your text, it
builds a vector: every string, its NUL terminator, and a pointer to it in an
array. On a 64 bit machine that pointer is eight bytes, and it does not get
smaller when your filenames do.

```
argument size    arguments that fit    bytes of actual text
            1               208840                  417680
            8               122847                 1105623
           64                28608                 1859520
         1024                 2021                 2069504
```

Read the last column. A budget advertised as two megabytes carries **four
hundred kilobytes** of one byte arguments, and about a megabyte of eight byte
ones. Nearly half of what the kernel copies for short names is pointer.

For the 48,000 paths at forty bytes: each one costs 49, not 40. 48,000 times 49
is 2,352,000, and the budget is 2,097,152. It was never close.

## The environment is charged to the same budget

argv and envp are copied onto the same new stack against the same number.
Measured with 64 byte arguments:

```
env strings    env vars    arguments that fit
         28           2                 28727
     500074          11                 21876
    1000144          21                 15024
```

A build runner that exports a megabyte of configuration has halved the command
line for everything it runs, and nothing in the error says so. This is the
whole explanation for the oldest bug report in the world: it works on my
machine, the script is identical, the kernel is identical.

`env -i` is not a superstition. It genuinely buys back the budget.

## One string can fail on its own

There is a second limit, on each string rather than on the total. Bisected to
the byte:

```
longest single argument that execs    131071 bytes
32 pages                              131072 bytes
```

That is `MAX_ARG_STRLEN`, it is not tunable, and it applies to environment
variables too. One oversized variable makes every exec in that shell fail at
once, with an error about the argument list, on commands that have no arguments.

## And the program path is charged twice

This one I did not read anywhere. It turned up because the formula was wrong.

With the rule above, nineteen of my measurements fit exactly and four missed by
exactly one argument. One argument, four times, always in the same direction:
that is not noise, that is a missing term. The size of the miss tracked the
length of `argv[0]`.

Arguments are a coarse ruler, so I switched to a finer one: hold the argument
count fixed and lengthen `argv[0]` one byte at a time, using symlinks to
`/bin/true` with longer and longer names.

```
argv[0]    arguments of 8 bytes that fit    what the formula spends
    100                           123348                    2097138
    175                           123340                    2097152
    250                           123331                    2097149
    350                           123319                    2097145
```

At 175 bytes the vector lands on the budget **exactly**, to the byte, once the
path is counted twice. `execve` copies `bprm->filename` onto the new stack in
its own right, and then copies the caller's argv, which begins with the same
path. Both copies are charged; only one of them carries a pointer.

It is a small term, two bytes per byte of path, and it only decides anything at
the margin. It is also the reason a command that works from `PATH` can fail
when invoked by a long absolute path.

## The formula

```
budget = RLIMIT_STACK / 4
cost   = sum over argv and envp of (8 + length + 1)
         plus the program path and its NUL, a second time
E2BIG when cost > budget, or when any one string is 131072 or longer
```

Twenty three measurements reproduce exactly: seven argument sizes from one byte
to sixteen kilobytes, three environments spanning a megabyte, four stack limits
spanning eight times, four lengths of `argv[0]`, and the per-string cap
bisected to the byte. In every one of them the vector that fits leaves less
than one more argument of room, which is what tells you a formula is sitting on
the wall rather than near it.

## What to do about it

1. **Size batches on the cost, not the text.** Take the budget, subtract the
   environment, divide by the path length plus nine. That number is right.
2. **Check `env | wc -c` and `ulimit -s` before comparing anything else**
   when a command works on one machine and not another. It is two commands and
   it is almost always one of them.
3. **`env -i` when a command line is marginal,** and prune what the command
   does not need.
4. **Do not pass a blob as an argument.** Standard input or a file. No limit you
   can raise will make a single 200 KB argument work.
5. **`xargs` is still the right answer for an unbounded list,** and it works
   out the split for you. Understanding the limit is for the cases where you
   need to know whether the split is necessary at all.

## Sources

- [execve(2), on E2BIG and the limits](https://man7.org/linux/man-pages/man2/execve.2.html)
- [sysconf(3), on _SC_ARG_MAX](https://man7.org/linux/man-pages/man3/sysconf.3.html)
- [getrlimit(2), on RLIMIT_STACK](https://man7.org/linux/man-pages/man2/getrlimit.2.html)
- [xargs(1)](https://man7.org/linux/man-pages/man1/xargs.1.html)

Every measurement here was taken on Linux 6.18.44 by execing `/bin/true` with
a bisected number of arguments and reading errno.

The ten command lines on [Argument list too long](/argmax) are the same model,
one question each.
