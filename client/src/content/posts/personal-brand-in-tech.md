## The problem

You have done real work, and nobody outside the room where you did it knows about it. The advice you find is either "post every day" or "just be authentic", and neither tells you what to actually do on a Tuesday evening. This is what has worked for me, and the parts that are mechanical rather than mystical, including the ones that are literally a command you run.

## What a personal brand actually is

A personal brand is your reputation, made visible. It is what people think of when they see your name in a professional context. It is built on consistent, genuine output over time, not on clever marketing or posting a lot.

The foundation is expertise. You cannot fake technical depth to an audience of technical people. Every post, project, and contribution either builds or undermines that foundation.

The word "brand" puts a lot of technical people off, and I understand why. Think of it as the answer to a question someone asks about you when you are not in the room. Somebody is deciding whether to invite you to a project, a team, or an interview, and they type your name into a search box. Whatever comes back is the brand, whether you curated it or not.

## Building through output

The most durable personal brands in tech are built by people who share what they learn. Writing blog posts, creating tools, contributing to open source, answering questions in forums, and teaching others all create a record of thinking and problem-solving that is hard to fake and hard to misrepresent.

This site is part of that for me. Writing about what I actually do in the lab, what competitions have taught me, and what I think about infrastructure and security creates a record that is honest and specific. That specificity is what makes it valuable.

The useful reframe is that you are not producing content, you are producing artifacts of work you were doing anyway. I do not write a post and then go find something to say about it. I fix something in the lab, notice that the fix was not obvious, and write down what I learned while it is still fresh. The writing costs an extra hour on top of work that already happened. That ratio is what makes it sustainable.

## Own the canonical copy

Publish where you control the URL. Post on other platforms as much as you like, but the version that other things link to should live on a domain that is yours, because platforms change their rules, their layout, and occasionally their existence, and every link into them goes with them.

Two mechanics make that work. When you republish something elsewhere, the copy should carry a `rel="canonical"` link pointing back at the original, which tells search engines which version is authoritative and stops the copies competing with the source. And your site should publish a feed, RSS or Atom, so that people who want to follow the work can do so without an account anywhere.

Check nothing is quietly telling crawlers to stay away:

```bash
curl -sI https://yourdomain.example/ | grep -i 'x-robots-tag'
curl -s  https://yourdomain.example/robots.txt
```

The first command should print nothing at all. An `X-Robots-Tag: noindex` header is invisible in a browser and will keep your work out of search results entirely, and it gets left behind on production more often than you would think. The second should show your intended rules; a bare `Disallow: /` under `User-agent: *` means you have unpublished yourself.

## Make the work attributable

Here is the most common way people lose credit for work they actually did, and it takes thirty seconds to check.

Git records the author of a commit from whatever `user.email` was configured on the machine at the time. Hosting platforms match commits to profiles by that address. Commit from a lab box that has no identity configured, or from an old address you no longer have on your account, and the commit exists, the code ships, and it is attributed to nobody.

```bash
git log --format='%an <%ae>' | sort | uniq -c | sort -rn
```

```
    214 Max Doubin <me@example.com>
      9 root <root@lab-01.localdomain>
      2 Max <max@old-address.example>
```

Two hundred and fourteen commits attributed correctly, eleven that are not. The nine from `root` will never appear on any profile. Fix the identity before the next commit:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --get user.email
```

```
you@example.com
```

Then add every address you have ever committed from to your account on the hosting platform, so the historical commits get matched retroactively. That alone has recovered visible contribution history for people I have shown it to.

## The long game

The mistake most people make is expecting fast results. Personal brands compound slowly. A blog post written today might be discovered by someone a year from now. A project that gets 50 GitHub stars this year might get 500 next year. The timeline is long and the feedback loop is delayed.

This means consistency matters more than any individual piece of output. Write regularly, build regularly, contribute regularly. Over months and years, the accumulation becomes significant.

The delay has a practical implication: judge the process, not the reaction. A post's readership in the first week tells you almost nothing, because most of the traffic a durable piece gets arrives from search months later. If you measure by the first week, you will conclude the good posts failed and rewrite yourself into whatever gets an immediate reaction, which is usually the least useful thing you produce.

## Being specific

Generic content does not build reputation. "Networking is important" is not valuable. "Here is exactly how I debugged a spanning tree loop that was causing packet loss on a specific VLAN" is valuable. Specificity demonstrates that you have actually done the thing.

Specificity is testable, which is the real reason it works. A reader can take "set the native VLAN on the trunk to an unused VLAN" and try it. They cannot do anything with "follow security best practices". Anything a reader can act on and verify builds trust, because it is a claim you have exposed to being wrong in public.

That also means being willing to publish the failure. The post about the thing that took you four hours because you misread one line of output is more useful, and more credible, than the one where everything worked.

## Teaching youth as a brand builder

Teaching coding camps in the Las Vegas Valley has been one of the most meaningful ways I have built reputation in the local tech community. It is genuinely valuable work that directly demonstrates technical knowledge, communication skills, and commitment to the community. Those things travel.

It is also the fastest way I know to find the gaps in your own understanding. Explaining subnetting to someone who has never seen an IP address forces you to know which parts are essential and which are trivia you happen to have memorised. If you cannot explain it to a beginner, you know the shape of the thing and not the thing.

## Common mistakes

**Posting volume instead of substance.** Five thin posts a week teach nobody anything and train your audience to skim past your name. One substantial thing a month, that a person can actually use, does more. Volume is the easiest metric to move and the least correlated with reputation.

**Building only on someone else's platform.** Every follower on a platform is a relationship the platform owns and can change the terms of. Use platforms for reach, keep the artifact on your own domain, and make sure the feed exists so people can follow you without one.

**Losing attribution on the work itself.** The git identity problem above, plus its cousins: contributing under a handle nobody connects to your name, or letting a shared account own the commits. If a hiring manager cannot connect the work to you in under a minute, the work is not doing the job you hoped it would.

**Talking about work you have not done.** Technical audiences detect this quickly, and the correction is permanent in a way the original claim never was. It is entirely fine to write "here is what I understand so far and here is where I am unsure". It is not fine to imply experience you do not have.

**Treating it as separate from the work.** The people whose reputations I respect did not run a content strategy. They did serious work and wrote it down. If the writing starts driving what you build rather than recording it, you have inverted the thing that made it credible.

## References

- https://en.wikipedia.org/wiki/Personal_branding
- https://en.wikipedia.org/wiki/Canonical_link_element
- https://git-scm.com/docs/git-config
- https://www.rfc-editor.org/rfc/rfc9309
- https://www.rfc-editor.org/rfc/rfc4287
- https://en.wikipedia.org/wiki/Web_syndication
