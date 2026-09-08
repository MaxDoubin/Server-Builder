
## The sentence everybody says afterwards

"We had backups."

They did. That is the part people find hard to believe afterwards, and it is
almost always true. The job ran. It reported success. Somebody would have
been paged if it had not. The retention met the policy and there were three
copies, which is what the rule says.

And then the restore was not there.

I have started thinking about this as two separate things that share a
budget line. A backup is a job that writes data somewhere and tells you it
worked. A restore is a thing you do once, under pressure, on the worst day
of the year, using a procedure nobody has run. The first is easy to buy and
easy to monitor. The second is the one you are actually paying for, and
nothing about the first tells you whether you have it.

## Three copies is not the rule

The 3-2-1 rule is three copies, on two kinds of media, one of them offsite.
It is a good rule and it is stated in the least useful possible way, because
the three numbers are all proxies for the thing that matters and none of
them is the thing.

Here is a posture that satisfies it completely:

```
hourly snapshot        on the array
nightly replica        to a second array
nightly push           to object storage
```

Three copies. Two media if you are generous about what counts. One of them
is arguably offsite. Every audit this has ever been shown to has passed it.

Now the ransomware. The attacker has the service account, because that is
how this always goes, and the service account can write to all three. The
snapshot is on the mounted array. The replica is written by the same
credential. The object storage push uses a key sitting in the same vault.

Zero copies. Not one, not "we lost some" - zero, and the answer to "how far
back can we go" is "we cannot".

What the rule is reaching for, and what it should probably say, is **how
many independent ways are there to lose all of this at once**. Three copies
in one failure domain is one copy that costs three times as much. The number
that matters is not how many copies you have, it is how many domains they
span, and a domain is defined by what can destroy it: an array, a building,
a credential.

## The field that changes everything

Take that same posture and change one thing. Put a fourteen day object lock
on the third copy.

```
hourly snapshot        on the array           writable
nightly replica        to a second array      writable
nightly push           to object storage      immutable, 14 day hold
```

Same attacker, same credential, same access. The first two are gone exactly
as before. The third is not, because a compliance hold is precisely a
statement that no live credential can delete this, including the one that
put it there, including the root one.

That is one boolean, and it is the difference between a bad weekend and a
company that is not there in six months.

Immutability is not a fourth copy. It is the property that makes one of your
existing copies real, and it is the cheapest thing on this entire list. Most
object stores charge nothing for the lock itself. You pay in inflexibility:
you cannot delete it early, which is the point, and you have to size the
retention deliberately because storage you cannot delete is storage you are
definitely paying for.

## Recovery point is not the backup interval

Everybody knows RPO is the amount of data you can afford to lose and that
hourly backups mean an hour of exposure. That is right for the failure modes
where something obviously breaks.

It is wrong for the ones where nothing does.

A migration writes subtly wrong values. Nothing errors. The application is
fine, the monitoring is green, and five weeks later somebody notices a
reporting discrepancy. What is the recovery point?

Not one hour. The newest copy is only useful if it predates the problem, so
the real expression is:

```
data loss = backup interval + how long it went unnoticed
```

and for silent corruption that second term dominates so completely that the
first is noise. Thirty days of hourly snapshots against corruption that
started thirty-five days ago is seven hundred and twenty copies of the
problem. The frequency you were so pleased about bought you nothing.

What decides that case is retention reaching back past the start, which is a
different axis entirely and usually a different storage tier. If you take
one thing from this: the question "how often do we back up" and the question
"how far back can we go" have different answers and different costs, and
only the first one gets asked in planning.

## Recovery time is mostly not the transfer

Ask somebody how long a restore takes and they will usually estimate the
transfer. Ten terabytes at 500 MB/s, call it six hours.

The real thing has five parts:

1. **Working out what to restore.** Which systems, in which order, to which
   point in time. On the day, this is a meeting.
2. **Getting to the media.** Cold archival storage has a retrieval time
   measured in hours before the first byte is readable. Offsite tape has a
   van.
3. **Moving the bytes.** At restore speed, which is frequently a third of
   backup speed, because backup is sequential writes and restore is random
   reads plus decompression plus whatever the target can absorb.
4. **Rebuilding what sat on top.** Indexes, caches, replication, the search
   cluster that has to reingest everything.
5. **Proving it is right.** Which somebody has to sign off before you take
   traffic.

The transfer is often the smallest of the five. Here is the arithmetic that
catches people, and note the 1024:

```
10,000 GB at 90 MB/s
90 MB/s x 3600 = 324,000 MB/hour = 316.4 GB/hour
10,000 / 316.4 = 31.6 hours
```

Add fourteen hours of archival retrieval before any of that, and three hours
of rebuild after, and the cheap storage tier has turned a "few hours"
conversation into two days. That trade gets made once, quietly, at design
time, by whoever was optimising the storage bill. It gets paid once, loudly,
at the worst possible moment.

## Two more that are just definitions

**Replication is not backup.** It is an availability feature and it does
exactly what it says: changes at the primary appear at the secondary. A
deletion is a change. If somebody removes the wrong directory tree at 09:40,
it is gone at both sites by 09:40 and one second. Anything that follows the
original protects you against the original becoming unreachable, and against
nothing else.

**A snapshot on the same array is not a copy.** It is a very fast way to
undo a mistake, and it shares its fate with the disks underneath it. Useful,
cheap, and not a backup, in the same way a spare key kept in the lock is not
a spare key.

## The one that gets everybody

A backup job reports that it did what it was told. It does not report that
what it was told is what you need.

An exclusion is invisible in every direction. The run is faster. The report
is green. The size is smaller, which nobody reads as a warning. Somebody
added `/var/lib/postgresql` to an ignore list during a noisy migration
eighteen months ago and the line is still there, and it has been backing up
everything except the only thing that mattered ever since.

There is exactly one way to find that, and it is to do a restore and look at
what came back.

## What I actually do about it

Not a lot of it is clever.

I keep one copy nothing with a live credential can delete, because that is
the only property that survives the failure mode I am most worried about.

I write down what the recovery time actually is, with the retrieval and the
rebuild in it, and I make somebody who is not in infrastructure read the
number. "Two days" starts a conversation that "we have backups" does not.

I restore something on a schedule. Not a test restore into a lab that proves
the tape reads. An actual restore of an actual thing, to somewhere real,
which is how you find out that the runbook references a hostname that was
decommissioned and the credential in it expired.

And I check what is in the backup, not just that the job went green. Once a
quarter, look at the file list. It takes ten minutes and it is the only
thing that finds an exclusion.

There is an [interactive version of this](/restore) on the site: six
incidents, each with a posture that would pass an audit, and you can run the
incident and watch how many of the copies were copies. Two of them differ in
exactly one field.

## References

- [NIST SP 800-34 Rev. 1: Contingency Planning Guide for Federal Information Systems](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final)
- [NIST SP 800-209: Security Guidelines for Storage Infrastructure](https://csrc.nist.gov/pubs/sp/800/209/final)
- [NCSC: Mitigating malware and ransomware attacks](https://www.ncsc.gov.uk/guidance/mitigating-malware-and-ransomware-attacks)
- [NIST IR 8374: Ransomware Risk Management](https://csrc.nist.gov/pubs/ir/8374/final)
- [UK NCSC: Offline backups in an online world](https://www.ncsc.gov.uk/blog-post/offline-backups-in-an-online-world)
- [AWS: S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
