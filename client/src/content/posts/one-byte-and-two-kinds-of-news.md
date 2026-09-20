## Two hundred and fifty six problems, and a clean run

A validator returns the number of problems it found as its exit code, so a
wrapper can act on the count. Then a bad import produces exactly 256 problems
and the run reports success.

```
_exit(0)      raw 0x0000   $? = 0
_exit(1)      raw 0x0100   $? = 1
_exit(42)     raw 0x2a00   $? = 42
_exit(255)    raw 0xff00   $? = 255
_exit(256)    raw 0x0000   $? = 0
_exit(300)    raw 0x2c00   $? = 44
_exit(512)    raw 0x0000   $? = 0
_exit(768)    raw 0x0000   $? = 0
_exit(1000)   raw 0xe800   $? = 232
_exit(-1)     raw 0xff00   $? = 255
```

The status is the code and `0xff`. `exit()` takes an `int` and throws away all
but the low byte of it, and there is no error anywhere: `exit()` does not
return, and the parent reads a perfectly clean `WIFEXITED`. Three different
counts in that table are indistinguishable from success.

## The kernel has room for two facts

A wait status is one 16 bit word with two halves that never overlap:

```
exited with 137     raw 0x8900   WIFEXITED 1  WEXITSTATUS 137  WIFSIGNALED 0
killed by SIGKILL   raw 0x0009   WIFEXITED 0  WEXITSTATUS 0    WIFSIGNALED 1  WTERMSIG 9
```

An exit code goes in the high byte. A terminating signal goes in the low seven
bits. `WIFEXITED` is nothing cleverer than a test that the low bits are empty:

```c
#define __WEXITSTATUS(status)  (((status) & 0xff00) >> 8)
#define __WTERMSIG(status)     ((status) & 0x7f)
#define __WIFEXITED(status)    (__WTERMSIG(status) == 0)
```

A parent calling `waitpid` is never in any doubt about which happened.

## Then the shell flattens it

`$?` is one byte. It reports a death as 128 plus the signal number:

```
killed by SIGINT    2   $? = 130
killed by SIGKILL   9   $? = 137
killed by SIGSEGV  11   $? = 139
killed by SIGTERM  15   $? = 143
killed by SIGRTMIN 34   $? = 162
killed by SIGRTMAX 64   $? = 192
```

And so:

```
( exit 137 )              $? = 137
sh -c 'kill -9 $$'        $? = 137
```

The same number for two entirely different events. Every value from **129 to
192** is both an exit code and a death by the signal 128 below it. That is
exactly the range a program lands in by returning a negative number, or by
adding to 128 deliberately to imitate a signal, so it is not a hypothetical
range: it is where the interesting failures live.

The information was not lost by the kernel. It was lost at the boundary, by a
variable that has room for the answer and not for the question.

## The core flag is about the limit, not the signal

```
RLIMIT_CORE 0        SIGSEGV 0x000b   SIGQUIT 0x0003   SIGABRT 0x0006
RLIMIT_CORE raised   SIGSEGV 0x008b   SIGQUIT 0x0083   SIGABRT 0x0086
```

Bit `0x80` of the low byte, set only when a core was actually written. `$?` is
139, 131 and 134 in all six of those, so a runbook step that says "collect the
core" has no way to find out from the status whether there is one.

## 126 and 127 were never yours

```
a command that does not exist             $? = 127
a file that exists and is not executable  $? = 126
```

Nothing exited with those. bash chose them, and the kernel produces neither on
its own. A program that genuinely exits 127 will read as a missing binary to
everyone who looks at the log afterwards, which is a good reason to keep your
own codes small.

## And a pipeline reports only its last command

```
false | true                 $? = 0    PIPESTATUS 1 0
( exit 42 ) | ( exit 7 )     $? = 7    PIPESTATUS 42 7
killed by SIGKILL | true     $? = 0    PIPESTATUS 137 0
```

The last row is the one that costs a night. An extract killed by the out of
memory killer, piped into a formatter that reads the truncated input happily
and exits 0, gives you a pipeline that reports success and half a dataset.

## What to do about it

1. **Keep exit codes between 1 and 125.** Above that you are in the shell's
   conventions or in the signal collision, and a small number is the only kind
   that means what it says.
2. **Never put a count, an errno, or a negative number in an exit code.** Print
   it. The status has eight bits and no way to tell you it ran out.
3. **In a supervisor, read the raw status.** `WIFSIGNALED` answers the question
   `$?` cannot, and it is one macro.
4. **Do not conclude "killed" from a status in the 130s.** Check `dmesg` or the
   cgroup's memory events. The number alone is not evidence.
5. **Put `set -o pipefail` at the top of the script,** or read `PIPESTATUS`. One
   line turns a silent half-run into a loud failure.
6. **If a wrapper mirrors 128 plus the signal, write that down.** It is a
   reasonable convention for shell callers, and a supervisor reading
   `WIFSIGNALED` will disagree with the shell about what happened.

## Sources

- [wait(2), on the status macros and what each one tests](https://man7.org/linux/man-pages/man2/wait.2.html)
- [exit(3), on the low eight bits being what the parent sees](https://man7.org/linux/man-pages/man3/exit.3.html)
- [_exit(2), on the status passed to the parent](https://man7.org/linux/man-pages/man2/_exit.2.html)
- [core(5), on RLIMIT_CORE and core_pattern deciding whether a dump happens](https://man7.org/linux/man-pages/man5/core.5.html)
- [bash(1), on 126, 127 and the status of a pipeline](https://man7.org/linux/man-pages/man1/bash.1.html)
- [signal(7), for the signal numbers the 128 is added to](https://man7.org/linux/man-pages/man7/signal.7.html)

Every measurement here was taken on Linux 6.18.44, forking a child and reading
the raw status in C beside what bash put in `$?` for the same ending.

The ten endings on [One byte, two kinds of news](/exit) are the same model, one
question each.
