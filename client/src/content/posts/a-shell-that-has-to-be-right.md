## A shell that has to be right

I built a simulated Linux shell for the labs on this site. You get a prompt, a
filesystem with real permission bits, a routing table, sockets, processes and
logs, and something is wrong with the machine. Type commands, work out what.

The whole value of that depends on one property: what you learn here has to be
what you would see on a real box. A lab shell that accepts a flag and ignores it
teaches that the flag does nothing. A lab shell where `grep -c` counts matches
rather than matching lines teaches something false, and the reader carries it to
an interview.

So the rule I set was: anything this shell accepts must behave the way bash
behaves, and anything it does not implement must be refused out loud.

```
$ sudo -i
sudo: an interactive root shell is not available in this lab shell.

$ sed 's/a/b/' file.txt | sed -e 'y/x/y/'
sed: this lab shell only understands 's/PATTERN/REPLACEMENT/[g]'

$ netstat -tlnp
(netstat is not in this lab shell; showing ss instead)
```

That last one is a compromise I thought about for a while. Silently treating
`netstat` as `ss` teaches that they are the same command. Refusing it teaches
nothing at all. Answering it with a note is the only option that leaves the
reader better informed than they arrived.

## Every lab ships a transcript that solves it

Here is the mechanism that made all of this survivable. Each lab carries a
`solution`: an ordered list of commands that solves it, written by me as I built
it. CI replays every one of them through the real shell against a real build of
the machine, and asserts the lab then reports itself solved.

```
OK  9 labs, 48 solution steps replayed through the real shell, all solvable.
```

That proves three things at once. The lab is solvable. The predicate that
decides "solved" matches the route I intended. And every command the solution
touches still works, which makes the solutions a test suite for the shell as a
side effect of being documentation.

It also checks the negative, which turned out to matter more: an empty session
must **not** report solved. A predicate that is already true before the reader
types anything is the other way this breaks, and it is completely invisible from
the inside.

## Four bugs it found, in order of how embarrassing they are

**One. The permissions lab was unsolvable.**

The lab asks you to make a root-owned file readable by the web server. The
shell had no `sudo`. `chmod` correctly refused, every time, and the lab could
not be completed by anybody.

I had written the lab, written the solution, and never run the solution, because
running it meant clicking through the UI and I was confident. The gate ran it on
the first invocation and printed the transcript.

**Two. `ls -l` on a file required read permission on the file.**

```
$ ls -l /var/log/auth.log
ls: /var/log/auth.log: Permission denied
```

Wrong. `auth.log` is mode 0640 owned by `syslog:adm`, and any user can
`ls -l` it perfectly well, because the metadata lives in the *directory entry*,
not in the file. Read permission is what you need to **list a directory**;
naming a file only needs traverse on its parent.

My implementation checked read on whatever node it landed on. The fix is one
condition:

```js
if (found.node.kind === "dir" && !permitted(found.node, machine.user, "r")) {
```

This is the kind of thing you know and still get wrong when writing the code,
because "can I read this" is one question in English and two in POSIX.

**Three. Single quotes did not mean literal.**

```
$ awk '{print $11}' file
awk: this lab shell only understands '{print $1, $2}'
```

The program had arrived as `{print }`. My parser stripped quotes into tokens
first and expanded `$NAME` over the finished tokens afterwards, by which point
nothing remembered which quotes anything had been inside. `$11` is not a
variable, unset variables expand to nothing, and the field reference vanished.

The fix is architectural rather than a patch: expansion moved into the
tokeniser, which is the only place that still knows. Single quotes take the
characters literally, double quotes expand, exactly as bash does.

**Four. The gate itself had a hole, and it was hiding the first two.**

This is the one worth the article. Two labs were shipping solutions in which
*every real command failed* with Permission denied, and the gate was green.

The reason is that those labs ask for a diagnosis rather than a repair, so the
predicate reads a submitted `answer`. The last line of the transcript was
`answer DHCP did not reply...`, which succeeded, so the lab reported itself
solved. The gate checked the outcome and never looked at the journey.

A gate that only checks the final state will pass a solution that is entirely
broken as long as the last step happens to work.

The fix is not to fail on non-zero exit status, because plenty of legitimate
steps exit non-zero: `grep` with no match is 1, `systemctl is-active` on a
failed unit is 3. It is to fail on failure *shapes* in stderr:

```js
const BROKEN = [
  /: command not found$/,
  /Permission denied/,
  /Operation not permitted/,
  /No such file or directory/,
  /only understands/,
  /not available in this lab/,
];
```

Targeted, and it caught both labs immediately.

## The apostrophe

One more, which is not a bug in the shell so much as a bug in applying a rule
too evenly.

Several labs end with the reader typing a diagnosis:

```
$ answer it's the MTU on the tunnel
lab shell: unterminated quote
```

That is correct bash behavior. It is also a hostile thing to do to somebody who
has just spent ten minutes working out the answer and is typing it in English,
and English is full of apostrophes.

So `answer` is now exempt: it takes the rest of the line verbatim, before any
parsing happens. Every other command still follows the real rules. The
justification is that `answer` is a lab builtin, not a simulation of anything,
and its argument is prose rather than a command line.

That is the kind of exception worth writing down in the code, because the next
person to read the tokeniser will otherwise wonder why one command jumps the
queue.

## What I would tell myself

**Write the solution, then make a machine run it.** The gap between "I know how
to solve this" and "this can be solved" is where the permissions lab lived, and
it is invisible from the author's chair.

**A gate that checks only the outcome will pass a broken journey.** If your test
asserts the final state, ask what happens when every intermediate step fails and
the last one succeeds anyway. For two of my nine labs, the answer was: it passes.

**Refuse loudly.** Every unimplemented thing in this shell prints what it does
support instead. That costs a line of code each and turns the most frustrating
possible experience, a tool that silently does the wrong thing, into a
signpost.

## References

- [POSIX: file permission bits, and what execute means on a directory](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap04.html#tag_04_05)
- [Bash reference: quoting](https://www.gnu.org/software/bash/manual/html_node/Quoting.html)
- [Bash reference: shell expansions and their order](https://www.gnu.org/software/bash/manual/html_node/Shell-Expansions.html)
- [GNU grep manual, including what -c actually counts](https://www.gnu.org/software/grep/manual/grep.html)
- [systemctl exit status conventions](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html#Exit%20status)
