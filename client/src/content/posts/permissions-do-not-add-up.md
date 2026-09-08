## The rule everybody knows and nobody has seen fail

```
$ id -un
alina
$ id -Gn
alina deploy
$ ls -l release.tar.gz
-r--rw-r-- 1 alina deploy 41M Sep  8 09:14 release.tar.gz
$ truncate -s 0 release.tar.gz
truncate: failed to truncate 'release.tar.gz': Permission denied
```

alina owns the file. alina is in the deploy group. The deploy group has write.
alina has no write.

Every explanation of Unix permissions says that the kernel picks one of the
three sets of bits and uses only that one. Owner if you own it, group if you
are in its group, other otherwise. First match wins, no combining, no falling
through to something more permissive. People read that sentence, nod, and keep
a completely different model in their heads, in which rights accumulate and
being in one more group can only help.

That is not carelessness. It is the model that every other permission system
they have ever met actually uses. Roles in an application accumulate. Groups
in a directory service accumulate. IAM policies accumulate, with an explicit
deny as the override. POSIX access control lists, bolted on right beside these
nine bits and read out of the same `ls`, accumulate. Nine bits are the odd one
out, and they are the ones with the shortest documentation.

## Why nothing ever corrects you

Here is the part I did not expect. I took the additive model, applied it to
every one of the 512 possible nine-bit modes as the file's owner, and compared
it against what the kernel would actually decide. It gives the wrong answer for
387 of them, which is 76%.

Then I ran the same comparison against the modes that exist. Every file and
directory under `/usr`, `/etc`, `/var` and `/opt` on a stock Ubuntu 24.04 install:
132,720 of them, using 20 distinct modes between them.

The additive model gets every single one right.

```
$ find /usr /etc /var /opt -xdev \( -type f -o -type d \) -printf '%m\n' \
    | sort | uniq -c | sort -rn
110748  644
 20902  755
   971  600
     38  700
     14  640
     13  444
     10  4755
      6  2755
      3  750
      3  2775
      2  664
      2  440
      1  710
      1  660
      1  4754
      1  2770
      1  2750
      1  1777
      1  1775
      1  1733
```

That is the whole distribution. Twenty modes, and 99% of the files are one of
the first two.

Look at why. The wrong model only diverges when a lower-priority class holds a
bit that a higher-priority one lacks: when the group can do something the owner
cannot, or the world can do something the group cannot. Nobody writes modes
like that. `644` descends. `755` descends. `640`, `600`, `750`, `710`: all
descend. Permissions on a real system are monotonically decreasing across the
three columns, because that is the only arrangement that means anything a
person intended to say.

So the belief survives for an entire career, not because it is never used but
because it is never contradicted. It produces the right answer 132,720 times
and then one afternoon a hardening script walks a tree, writes `464` over
something, and the model fails on the first file that was ever capable of
failing it.

`464` is `r--rw-r--`. That is the file at the top of this article.

## The same shape, in the umask

A umask clears bits. It is a mask, in the name, and what it does is
`mode & ~umask`. Ask around and most people will tell you it subtracts, because
everyone learns it by watching `umask 022` turn `666` into `644`, and `666`
minus `022` is `644`.

Subtracting is wrong for 387 of the 512 possible masks. It is right for `002`,
`022`, `077`, `007`, `027`, `066` and `000`, which is essentially every umask
anybody sets. Of the common ones I could think of, `037` is the only one where
it breaks, and I had to go looking for it.

Take `umask 013`, which nobody sets:

```
$ umask 013
$ touch f && ls -l f
-rw-rw-r-- 1 alina alina 0 Sep  8 09:20 f
```

`664`. Subtracting gives `666 - 013 = 653`, and `653` is not even close: it has
taken execute away from a file that never had it and left write where the mask
said to clear it. Masking never touches a bit the mask does not name, and never
borrows across a digit, which is exactly what subtraction does.

There is one more layer of camouflage here, and it is my favourite detail in
the whole subject. `mkdir` never reveals the bug. Directories are born `777`,
and for a minuend of 7, `7 - d` and `7 & ~d` are the same number for every
octal digit d. So subtraction and masking agree on all 512 masks for a
directory. Only `touch` can show you, and `touch` is not the command you reach
for when you are testing a umask.

## Two more rules that read backwards

The class rule is the big one. Two smaller ones catch people just as often and
for the same reason: the sentence in the manual is clear and the intuition it
has to overwrite is stronger.

**Deleting is not a permission on the file.** A name lives in its directory, so
removing one is a write to the directory and needs nothing at all from the
file. You can delete a file owned by root with mode `000` out of a directory
you own, and you cannot delete a file you own with mode `600` out of a
directory that is `r-x` for you. This is why `chmod 777` on the file you cannot
delete never helps, and why people conclude the system is broken rather than
that they were changing the wrong thing.

**Reaching a file needs execute on every directory above it.** Execute on a
directory is search, not run, and it is a separate power from read. A directory
at `711` gives you search without listing: you cannot enumerate what is in
there, and every file whose name you know or can guess is as readable as its
own bits say. A directory at `644` gives you the opposite, listing without
search, so `ls` prints the filenames perfectly and nothing under it can be
opened. `ls -l` gives that one away, because the long form has to `stat` each
entry and every line comes back as a question mark.

Then the error message names the file. Not the directory four levels up that
refused the search, and not the fact that the kernel never looked at the file
at all. You get `cat: /var/spool/analytics/daily.csv: Permission denied` for a
file that is `644` and readable by everybody, and the obvious next move is to
go and look at the file.

## What this is actually about

I wrote a page for practising these, fourteen accesses to call, and behind it a
model of the rules. Then I wrote property tests for the model: that owning a
file ends the search, that a delete never consults the file, that an
unsearchable directory stops everything below it. Generate a few thousand
random paths, run each property, fail the build on a disagreement.

They all passed. They passed because the generator was broken.

It picked every choice with `next() % n` off a linear congruential generator
masked to 31 bits, and the low bits of an LCG with a power-of-two modulus have
a period of two, four, eight. `% 6` locked onto a subset of the operations. In
four thousand rounds it produced zero deletes and zero successful accesses.
Every property was being checked against paths that died at the first directory,
which is to say checked against nothing, and it would have gone on reporting OK
through any bug I could have written.

That is the same failure as the one this article is about, which is why the
article exists. A belief is only ever corrected by an input that can
contradict it, and the inputs any of us meet are not a random sample. They are
the ones somebody sensible chose. `644` and `755` are sensible, so the additive
model never gets tested. `umask 022` is sensible, so subtraction never gets
tested. A generator that never reaches the end of a path is not sensible, but
it is quiet, and quiet passes.

The fix in both cases is the same and it is not "be more careful". It is to go
and find out whether the thing that would have caught you was ever in a
position to. The gate now measures its own corpus before it trusts its
properties: if the generated paths do not include successes, and deletes, and
walks that reach the last node, it fails on that instead of reporting OK. And
the page puts `464` in front of you on the first case, because the only way to
correct a model is to hand it the input it cannot survive.

You can [call the fourteen accesses yourself](/permissions). The tree stays
unmarked until you have answered, because which of the three sets applies to
you is most of the question.

## References

- [POSIX: file access permissions, in the Base Definitions](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html)
- [man 7 inode: the mode bits, including set-user-ID, set-group-ID and sticky](https://man7.org/linux/man-pages/man7/inode.7.html)
- [man 7 path_resolution: why every directory in a path needs execute](https://man7.org/linux/man-pages/man7/path_resolution.7.html)
- [man 2 unlink: removal is governed by the containing directory](https://man7.org/linux/man-pages/man2/unlink.2.html)
- [man 2 umask: the mask is applied as mode AND NOT umask](https://man7.org/linux/man-pages/man2/umask.2.html)
- [man 2 execve: why an interpreted script needs read as well as execute](https://man7.org/linux/man-pages/man2/execve.2.html)
