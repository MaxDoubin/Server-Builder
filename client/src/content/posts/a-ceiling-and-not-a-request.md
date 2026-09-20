## The same binary, two different files

A service writes its output with `open(path, O_CREAT | O_WRONLY, 0666)`. On one
host the file comes out 0644 and a second service reads it. On another it comes
out 0600 and the second service cannot. Nothing in the source differs.

```
asked  0000  0022  0002  0077  0027  0777
 0666  0666  0644  0664  0600  0640  0000
 0777  0777  0755  0775  0700  0750  0000
 0600  0600  0600  0600  0600  0600  0000
 0644  0644  0644  0644  0600  0640  0000
 0755  0755  0755  0755  0700  0750  0000
 0640  0640  0640  0640  0600  0640  0000
```

Thirty six rows, and every one of them is mode AND NOT umask. `mkdir` behaves
identically; the 0777 row is exactly what six umasks did to a directory.

## It can only ever subtract

Look at the 0600 row. It is 0600 at every umask but 0777, because the bits a
mask clears were never in the mode to begin with. There is no umask that gives
you a permission you did not ask for.

That is the whole practical lesson. A program that opens with 0600 is immune to
the setting on the box. A program that opens with 0666 has outsourced the
decision to whoever configured the login shell, the systemd unit, or the
container image, and none of them know what the file is for.

## A umask is nine bits and a mode is twelve

```
asked  0000  0022  0002  0077  0027  0777
 6777  6777  6755  6775  6700  6750  6000
```

A umask of 0777 removes every ordinary permission there is and leaves a setuid
setgid file behind. The mask covers owner, group and other. The three bits above
them are outside it entirely, so a umask is not, and has never been, a defense
against a build that sets them.

## chmod does not go through it

```
umask 0077, open with 0666   ->  0600
then chmod 0666              ->  0666
```

The mask applies at creation and never again. Which means a deploy script that
writes a file under a hardened umask and then chmods it for a reader has quietly
undone the hardening, and nothing anywhere will say so. Both of those lines can
be correct on their own and wrong together.

## A setgid parent moves the group, not the mode

A directory owned by group 1 with the setgid bit, and a process running as
group 0:

```
parent plain  0777 gid 1    file inside 0644 gid 0    dir inside 0755 gid 0
parent setgid 2777 gid 1    file inside 0644 gid 1    dir inside 2755 gid 1
```

The mode is 0644 either way, so the umask did identical work. What moved is the
group. People expect the bit to do both and it does one.

Note the directory rows. A subdirectory inherits the setgid bit itself, which is
what keeps a shared tree working all the way down. A file does not, which is why
you find setgid directories deep in a tree that nobody set deliberately.

For a shared directory you almost always want both halves: the setgid bit so the
group is right, and a umask of 0002 so the group can write. One without the other
gets you half of what you were after.

## And a redirect is never executable

```
umask 0022, : > f   ->  0644
umask 0077, : > f   ->  0600
umask 0002, : > f   ->  0664
```

The shell asks for 0666 and never 0777. There is no execute bit anywhere in the
calculation, so no umask can leave one behind, including 0000. A generator that
writes a script has to chmod it; there is no setting that does it for you.

## What to do about it

1. **Pass the mode you actually want, and stop thinking about the umask.** This
   is the whole fix. A program that opens with 0600 behaves the same everywhere.
2. **If the mode has to be wide, set it explicitly after creating,** with
   `fchmod` on the descriptor you already have. Do not create wide and hope.
3. **Set `UMask=` in the unit file** rather than inheriting whatever a login
   shell had. A service's umask should be written down somewhere you can read.
4. **Never treat a umask as protection against setuid or setgid.** Check for
   them instead, which is one `find` with `-perm /6000`.
5. **Pick one of the umask and the chmod to be the policy.** If the umask is,
   a later chmod is a hole in it. If the chmod is, the umask is decoration.
6. **On a shared directory, set the setgid bit and a umask of 0002 together.**

## Sources

- [umask(2), on the mask applying to creation and on the nine bits](https://man7.org/linux/man-pages/man2/umask.2.html)
- [open(2), on the mode argument and how it combines with the umask](https://man7.org/linux/man-pages/man2/open.2.html)
- [mkdir(2), on the same rule for directories](https://man7.org/linux/man-pages/man2/mkdir.2.html)
- [inode(7), on the twelve mode bits and what setgid does to a directory](https://man7.org/linux/man-pages/man7/inode.7.html)
- [chmod(2), which takes the mode as given](https://man7.org/linux/man-pages/man2/chmod.2.html)
- [acl(5), on default access control lists, which replace the umask where they exist](https://man7.org/linux/man-pages/man5/acl.5.html)

Every measurement here was taken on Linux 6.18.44, creating files and
directories in C at a grid of modes and umasks and reading the result back with
stat. Default access control lists were not in play; a directory carrying one
replaces this arithmetic entirely.

The ten creations on [A ceiling, not a request](/umask) are the same model, one
question each.
