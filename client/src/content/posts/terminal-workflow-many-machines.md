
## The problem with many small boxes

Once you are past about five machines, ad hoc administration stops scaling. You
start typing addresses from memory, you get the wrong host, you lose a long
running job to a dropped connection, and you cannot remember which of three
similar boxes you made a change on. None of that is a hard problem. It is a tool
configuration problem, and about an hour of setup fixes it permanently.

This is my setup. It is deliberately boring and made of things that exist
everywhere, because a workflow that only works on my machine is not a workflow.

## SSH config is the highest leverage file you own

Almost nobody uses `~/.ssh/config` to its potential. It handles naming, jump
hosts, per host keys and users, and connection reuse.

```
# ~/.ssh/config

Host *
    ServerAliveInterval 30
    ServerAliveCountMax 3
    ControlMaster auto
    ControlPath ~/.ssh/cm/%r@%h:%p
    ControlPersist 10m
    HashKnownHosts yes
    AddKeysToAgent yes
    IdentitiesOnly yes

Host bastion
    HostName bastion.lab.internal
    User admin
    IdentityFile ~/.ssh/id_ed25519_bastion
    Port 2222

Host lab-*
    User ops
    IdentityFile ~/.ssh/id_ed25519_lab
    ProxyJump bastion
    StrictHostKeyChecking yes

Host lab-web01
    HostName 10.30.10.11
Host lab-db01
    HostName 10.30.20.11
Host lab-mon01
    HostName 10.30.30.11
```

```bash
mkdir -p ~/.ssh/cm && chmod 700 ~/.ssh/cm
```

What each block buys:

**ControlMaster and ControlPersist** multiplex additional sessions over one
existing TCP connection. The first connection does the full handshake; every
subsequent one to the same host is effectively instant. If you run a lot of
short commands or use tools that open many SSH sessions, this is the single
biggest speedup available.

**ProxyJump** replaces the old two hop dance. `ssh lab-db01` transparently goes
through the bastion, and file copies work the same way with no special syntax.

**Host patterns** mean the `lab-*` settings apply to every lab host, and adding
a machine is two lines.

**IdentitiesOnly yes** stops the agent from offering every key you have to every
server, which matters if you have more keys than a server's `MaxAuthTries`
allows attempts.

Tab completion over host names comes free in most shells once the config exists,
which is most of the ergonomic win by itself.

## tmux as a place to leave work

The rule I follow: anything that might take more than a minute runs inside tmux
on the remote host. Not for the split panes, for the fact that my connection
dropping does not kill the job.

```bash
# ~/.tmux.conf
set -g mouse on
set -g history-limit 50000
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
set -sg escape-time 10
set -g status-left-length 30
set -g status-left '#[bold]#S #[default]| '
set -g status-right '%H:%M %d-%b'
bind r source-file ~/.tmux.conf \; display "reloaded"
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
```

```bash
# attach to a named session or create it, the only invocation I use
ssh lab-db01 -t 'tmux new-session -A -s main'
```

`new-session -A -s main` attaches if `main` exists and creates it otherwise, so
one command always does the right thing. Naming sessions by task rather than
leaving them as `0` and `1` is worth doing the moment you have more than one.

## Fanning out, carefully

For running the same read only command across a group, a loop is enough:

```bash
hosts=(lab-web01 lab-db01 lab-mon01)
for h in "${hosts[@]}"; do
  printf '=== %s ===\n' "$h"
  ssh -o BatchMode=yes "$h" 'uptime; df -h / | tail -1' 2>&1
done
```

With connection multiplexing already warm, that is fast. `BatchMode=yes` makes
it fail rather than hang waiting for a password prompt, which matters in a loop.

I keep a firm line here though: fan out is for reading, not for changing. The
moment a command modifies state, it goes in Ansible or an equivalent, because I
want it idempotent, reviewable, and recorded. A for loop with a `sed -i` in it
is how you make the same mistake on twelve machines simultaneously and have no
record of what you did.

## Keeping it reproducible

The whole setup is worthless if it lives only on one laptop. Mine is a git
repository with the dotfiles and a small install script that symlinks them into
place. New machine, clone, run, done.

Two rules for that repo. Never commit private keys or anything with a real
secret in it; the config references key paths, it does not contain keys. And
keep host inventory that identifies internal addressing out of anything public.
The structure of the config is generic and shareable. The contents of the host
list are not.

None of this is clever. It is just the difference between administration as a
series of remembered incantations and administration as something with a shape
you can hand to somebody else.

## References

- [ssh_config(5)](https://man7.org/linux/man-pages/man5/ssh_config.5.html)
- [OpenSSH manual pages](https://www.openssh.com/manual.html)
- [tmux(1)](https://man7.org/linux/man-pages/man1/tmux.1.html)
- [tmux wiki](https://github.com/tmux/tmux/wiki)
- [Ansible documentation](https://docs.ansible.com/ansible/latest/index.html)
