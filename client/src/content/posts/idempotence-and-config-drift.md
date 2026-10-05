
## Drift Is What Happens Between Deploys

Configuration drift is the gap between what you believe a machine is running
and what it is actually running. It accumulates from ordinary things: someone
fixes an outage by editing a file directly, a package upgrade rewrites a config
with its own defaults, a service writes state into its own config directory, a
box was built before you added a setting and nothing ever went back for it.

Drift is not a moral failure. It is the default state of any system that humans
can touch. The question is not how to prevent it but how to detect it and
converge back, repeatedly, cheaply, without fear. Every property people want
from configuration management is downstream of one idea, and the idea is
idempotence.

## Idempotent Means Safe To Run Again

An operation is idempotent if applying it more than once has the same effect as
applying it once. `x = 5` is idempotent. `x = x + 1` is not. HTTP borrowed the
same word for the same reason: PUT is defined as idempotent, POST is not, and
that is precisely why a client may safely retry one and not the other.

For configuration this translates to writing declarations of desired state
rather than sequences of actions. Not "append this line to the file" but "this
file has these contents." Not "create this user" but "this user exists with
this shell and these groups."

The effect that has to repeat is the state of the machine, not the exit code of
a command. `useradd` fails on its second run and leaves the machine correct; an
append succeeds on every run and leaves the file worse.

The payoff is that a run becomes safe. If a run is safe, you can run it
constantly, and if you run it constantly, drift has a maximum lifetime equal to
your run interval. You also get a genuinely useful signal for free: a run that
reports zero changes means the machine matches your model of it. A run that
reports changes on a box nobody touched is telling you something.

## The Shell Script Trap

Almost everyone starts with a provisioning script, and almost every such script
is not idempotent. Here is the pattern, and it is worth looking at closely
because the broken version looks completely reasonable.

```bash
#!/usr/bin/env bash
# NOT idempotent. Run it twice and you get two entries, and the
# second install fails the whole script under set -e.
set -euo pipefail

apt-get install -y nginx
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
useradd -m deploy
systemctl restart nginx
```

The fixed version states desired conditions and only acts when reality differs.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Idempotent: dpkg-query tells us whether the goal is already met.
if ! dpkg-query -W -f='${Status}' nginx 2>/dev/null | grep -q "^install ok installed$"; then
    apt-get install -y nginx
fi

# Idempotent: own a whole file in a drop-in directory instead of
# appending to a shared one. Only reload if the content changed.
desired=/etc/sysctl.d/90-forwarding.conf
if ! printf 'net.ipv4.ip_forward=1\n' | cmp -s - "$desired"; then
    printf 'net.ipv4.ip_forward=1\n' > "$desired"
    sysctl --system >/dev/null
fi

# Idempotent: check before create.
id -u deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy

# Only restart when something actually changed; blind restarts are
# how a config run turns into an outage.
```

Three habits do most of the work. Check before you act. Own whole files rather
than appending to files someone else owns, which is what drop-in directories
exist for. And make restarts conditional on an actual change, because a
configuration run that bounces every service every fifteen minutes is worse
than the drift it was fixing.

A declarative tool does not end the trap. It gives you idempotent building
blocks, not an idempotent playbook, and the moment you drop to a shell task the
property is yours to maintain again. The classic sequence: `ip route add` fails
on the second run because the route already exists, which fails the play, which
makes someone add `ignore_errors: true`, which hides the next real failure.

## Test It By Running It Twice

Idempotence is a testable property, so test it. Run the automation, run it
again, and assert that the second run changed nothing.

```bash
#!/usr/bin/env bash
# idempotence-check.sh: fail if a second converge run reports changes
set -euo pipefail

log="$(mktemp)"
trap 'rm -f "$log"' EXIT

echo "== first run =="
ansible-playbook -i inventory site.yml

echo "== second run (must be a no-op) =="
ansible-playbook -i inventory site.yml | tee "$log"

if grep -qE 'changed=[1-9]' "$log"; then
  echo "FAIL: second run reported changes"
  grep -E '^changed:' "$log" || true
  exit 1
fi

echo "PASS: converged and stable"
```

Put that in CI against a throwaway VM or container and it catches this whole
class of bug at the moment it is introduced, which is the only time it is cheap
to fix.

The tasks that fail this check are almost always shell tasks. The fixes, in
order of preference:

```yaml
# Bad: fails the second time, then someone silences the failure
- name: Add the lab route
  ansible.builtin.shell: ip route add 10.20.0.0/16 via 192.0.2.1

# Better: a naturally idempotent command. changed_when: false keeps
# the second run quiet, but it also hides a real change.
- name: Ensure the lab route exists
  ansible.builtin.command:
    cmd: ip route replace 10.20.0.0/16 via 192.0.2.1
  changed_when: false

# Best: describe state, let the module decide
- name: Ensure the lab route exists
  ansible.builtin.template:
    src: 10-lab-route.network.j2
    dest: /etc/systemd/network/10-lab-route.network
    owner: root
    group: root
    mode: "0644"
  notify: Reload network configuration
```

Where a command task is unavoidable, give it `creates:` or `removes:` so it
skips itself when its work is already done, and set `changed_when` to something
meaningful instead of letting every command report a change. A play that always
reports changes makes the test above useless.

## Converge, Then Verify

Once operations are idempotent, two capabilities become available, and they are
the reason to bother.

**Check mode.** Run the whole thing and report what *would* change without
changing it. That report is a drift report. Schedule it, alert on non empty
output, and you have continuous verification that costs nothing and requires no
separate tooling.

**Diff.** Because the tool knows the desired content, it can show you the exact
lines that differ. That is far more actionable than "this resource changed."

In Ansible, both are flags on an ordinary run:

```bash
# Report what would change, without changing it
ansible-playbook -i inventory site.yml --check --diff
```

One catch: command and shell tasks are skipped in check mode unless they
declare `creates:` or `removes:`, so the report is blind to whatever they
manage.

I run enforcement on a slow cadence and verification on a fast one. The
verification job is the interesting one. When it reports a change on a host
nobody deployed to, one of four things is true: somebody logged in and edited
something, a package upgrade overwrote your file, a service is rewriting its
own configuration at runtime, or somebody changed the repository and never
applied it. All four are worth knowing about, and none of them would ever
surface without a report that is normally empty.

Empty by default is what makes a signal useful. If your drift report is always
noisy, you will stop reading it within a week, and then you have the cost of
the tooling and none of the benefit.

## Convergent Is Not Congruent

An empty report proves less than it seems, because two different goals get
called the same thing.

Convergence means repeated application moves the system toward a desired state
from wherever it started. Most configuration tooling is convergent: it manages
the things you described and ignores everything else.

Congruence means the machine matches a known baseline completely, including
things you never described. Reimaging is congruent. Container images are
congruent. A playbook is not.

Drift lives in the gap between the two. Every file nobody manages, every
package installed by hand during an incident, and every sysctl someone set at
2am is invisible to a convergent tool, because the tool only checks what it was
told about. That is why "the playbook ran clean" and "the machine is correct"
are different statements, and why long lived hosts diverge from each other even
under automation.

My rule: prefer rebuilding over converging where the workload allows it, and
where it does not, treat the list of unmanaged things as a known risk rather
than pretending it is empty.

## The Things That Refuse To Cooperate

Honesty about the edges. Some things genuinely resist this model.

Appliances with a web interface and no real API. Software that rewrites its own
config on shutdown. Databases where the running configuration and the on disk
configuration can diverge and only one of them is authoritative. Anything with
a licensing dance. For these, the realistic goal is not enforcement but
detection: pull the current state on a schedule, store it in version control,
and let the commit history be your drift log. You will not converge it
automatically, but you will know when it changed and roughly when. A commit
that appears with no planned change behind it is drift, and you find it the
same day instead of during the next outage.

The other edge is ordering. Some sequences are inherently stateful, such as
database migrations, where "run it again" is exactly wrong. Those belong in a
different mechanism with its own applied-migrations ledger, and mixing them
into your convergence run is how you get a very bad afternoon. Keep the
idempotent layer idempotent, and keep the one way operations somewhere they can
be tracked properly.

The last edge is human, and it decides whether any of this holds. Emergency
changes at the console are legitimate, and they will happen. The rule I hold
myself to is that the fix gets encoded back into the repository in the same
session, before the incident is closed. A repository that does not match
reality is not documentation, it is fiction with syntax highlighting.

## References

- [Idempotence](https://en.wikipedia.org/wiki/Idempotence)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [Infrastructure as code](https://en.wikipedia.org/wiki/Infrastructure_as_code)
- [Ansible documentation](https://docs.ansible.com/)
- [Terraform documentation](https://developer.hashicorp.com/terraform/docs)
- [git-diff documentation](https://git-scm.com/docs/git-diff)
- [diff(1) manual page](https://man7.org/linux/man-pages/man1/diff.1.html)
- [Google SRE Book](https://sre.google/sre-book/table-of-contents/)
