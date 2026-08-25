
## The definition people skip past

An operation is idempotent when applying it twice produces the same result as
applying it once. In configuration management the operation is "make the
system match this description", and the result is the state of the machine, not
the exit code of a command.

That distinction matters because a lot of automation is written as a list of
commands, and commands are mostly not idempotent. `useradd alice` succeeds
once and fails afterwards. `echo "x" >> /etc/hosts` succeeds every time and
makes the file worse each run. `ip route add` fails on the second run with the
route already present, which then fails the play, which then makes someone add
`ignore_errors: true`, which then hides the next real failure.

Declarative tools give you idempotent building blocks. They do not give you an
idempotent playbook. The moment you drop to a shell task, the property is yours
to maintain.

## Convergent, congruent, and the gap where drift lives

Two different goals get called the same thing.

Convergence means repeated application moves the system toward a desired state
from wherever it started. Most tooling is convergent: it manages the things you
described and ignores everything else.

Congruence means the machine matches a known baseline completely, including
things you never described. Reimaging is congruent. Container images are
congruent. A playbook is not.

Drift lives in the gap between the two. Every file nobody manages, every
package installed by hand during an incident, and every sysctl someone set at
2am is invisible to a convergent tool, because the tool only checks what it was
told about. This is why "the playbook ran clean" and "the machine is correct"
are different statements, and why long lived hosts diverge from each other even
under automation.

My rule: prefer rebuilding over converging where the workload allows it, and
where it does not, treat the list of unmanaged things as a known risk rather
than pretending it is empty.

## Test it by running it twice

Idempotence is a testable property, so test it. The check is cheap: run the
automation, run it again, and assert the second run changed nothing.

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

Put that in CI against a throwaway VM or container and it will catch the whole
class of bugs at the moment they are introduced, which is the only time they
are cheap to fix.

The tasks that fail this check are almost always shell tasks. The fixes, in
order of preference:

```yaml
# Bad: fails the second time, then someone silences the failure
- name: Add the lab route
  ansible.builtin.shell: ip route add 10.20.0.0/16 via 192.0.2.1

# Better: use a command that is naturally idempotent, and be honest
# about when it counts as a change
- name: Ensure the lab route exists
  ansible.builtin.command:
    cmd: ip route replace 10.20.0.0/16 via 192.0.2.1
  register: route
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

Three habits cover most of the rest. Use `creates:` or `removes:` so a command
task skips itself when its work is already done. Set `changed_when` to
something meaningful instead of letting every command report a change, because
a play that always reports changes makes the test above useless. And never
append to a file from automation: manage the whole file, or manage a drop in
fragment in a directory you own.

## Detecting drift instead of hoping

Once the automation is genuinely idempotent, a no-op run becomes a measurement.
Schedule it in check mode and alert on the changed count.

```bash
# Report what would change, without changing it
ansible-playbook -i inventory site.yml --check --diff
```

A nonzero changed count on a check run means one of two things: someone touched
the machine outside the process, or someone changed the repository and never
applied it. Both are worth knowing, and both are invisible otherwise.

For network gear where there is no agent, the same idea works with plain text:
pull the running configuration on a schedule, store it in a repository, and
diff. A commit that appears with no corresponding change ticket is drift, and
you find it the same day instead of during the next outage.

The last piece is human and it is the one that decides whether any of this
holds. Emergency changes at the console are legitimate, and they will happen.
The rule I hold myself to is that the fix gets encoded back into the repository
in the same session, before the incident is closed. A repository that does not
match reality is not documentation, it is fiction with syntax highlighting, and
the second time someone runs it against a live machine they find out the hard
way.

## References

- [Idempotence](https://en.wikipedia.org/wiki/Idempotence)
- [Infrastructure as code](https://en.wikipedia.org/wiki/Infrastructure_as_code)
- [Ansible documentation](https://docs.ansible.com/)
- [git-diff documentation](https://git-scm.com/docs/git-diff)
- [diff(1) manual page](https://man7.org/linux/man-pages/man1/diff.1.html)
