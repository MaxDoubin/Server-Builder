
## The question

Every few weeks another student asks me some version of this. Should I grind a certification, or should I build a lab and put projects on my resume?

The framing is wrong, because they teach genuinely different skills and neither substitutes for the other. Here is what each one actually gave me.

## What the certification gave me

I hold CompTIA Tech+, and studying for it did three things that building alone would not have.

**Vocabulary.** Before, I knew how things worked in the specific way I had encountered them. After, I knew what those things were called. That sounds trivial and it is not: the correct term is the key that unlocks documentation, error message searches, and conversations with people who know more than you. You cannot look up a concept you cannot name.

**Coverage of things I would have skipped.** Left alone, I build what interests me. An exam objectives list does not care what interests me. It made me learn areas I had been quietly routing around, and a few of those turned out to matter a lot. I would never have gone looking for spanning tree behavior or subnet math on my own.

**A deadline.** Self directed learning has no forcing function. A scheduled exam does. That is a boring benefit and it is real.

What it did not give me: any ability to fix something that is broken in a way the exam did not anticipate. Exam knowledge is shaped like exam questions. Knowing the seven layers and the port numbers tells you nothing about what to do when packets are being silently dropped and every layer looks fine. Multiple choice questions have a correct answer that exists. Broken infrastructure often does not, at least not until you go find it.

## What the lab gave me

Running actual infrastructure taught me the thing no exam tests: what to do when it does not work and nobody has written down why.

Nothing in a study guide prepares you for a service that works fine for a week and fails every Tuesday. Nothing teaches you to check physical layer before protocol layer except having wasted three hours on a routing config when the real problem was a cable. Nothing teaches you to change one variable at a time except having changed four and lost the thread completely.

The lab also taught me the operational habits that separate a hobby from a practice. Document as you go, because you will not remember in six months. Change one thing at a time. Have a rollback before you have a change. Monitor the thing before you need the monitoring. Every one of those I learned by getting burned.

And it taught me that most of the job is not the interesting part. It is labeling, backups, patching, and writing down what you did. Certifications do not test that because you cannot test it in ninety minutes.

## What competition gave me

Competing in the National Cyber League has been the third leg, and it teaches something both of the others miss: speed under pressure with incomplete information.

Placing in the top 1 percent individually, and helping my school finish seventh among U.S. high schools in the Cyber Power Rankings, was not about knowing more than everyone else. It was about tool fluency, reading a problem quickly enough to decide whether it is worth your remaining time, and not rabbit holing. In a timed event, recognizing "I cannot solve this in the time I have" and moving on is worth more than any single technique.

That skill transfers directly to incident response, which is also a timed event with incomplete information and a cost to going down the wrong path.

## What each one proves, and to whom

Skills are one axis. The other is evidence: each of these proves something different, to a different audience.

A certification proves you covered a syllabus and passed a standardized test on a known date. It is legible to people who cannot evaluate your technical work directly: HR filters, application forms, scholarship committees, the first screen of a hiring pipeline. That legibility is the entire product. Nobody believes a certificate means you can do the job. They believe it means you worked through a defined body of material and finished.

A project proves you can make something work when nobody has given you the answer key, and that you kept going after the first thing broke. It is legible to engineers, a smaller audience but a much more decisive one. Holding Tech+ and running a home data center do completely different work when someone is deciding whether to take me seriously.

The same applies to competition. Placing well in the National Cyber League is a number, and the number opens the door. What I can say about how the team worked through a category we were weak in is what makes the conversation go somewhere.

## The sequence I would recommend

If I were starting over, I would interleave rather than pick.

Start with a small project, something that works end to end, however basic. You need something concrete to attach vocabulary to, or the terms stay abstract and slide out of your head.

Then take a foundational certification. Now the terminology has hooks to hang on, and studying goes several times faster because you are naming things you have already touched.

Then build something harder, deliberately using the areas the exam covered that you had been avoiding. This is where the coverage benefit pays off. Let this phase run long, and make sure it includes at least one project that takes longer than you expected and makes you want to quit, because that is where the actual skill accumulates.

Then compete, or contribute, or teach. Something with an external standard, where you find out whether you actually know it or only think you do.

Then repeat with a deeper certification.

The order matters because each stage makes the next one cheaper. Studying a routing protocol after you have watched adjacencies fail to form is a completely different experience from studying it cold. Certifications before any hands on work is the expensive path: you memorize terms with nothing underneath them and forget most of it.

One rule keeps the loop honest: I do not start a new certification while a project is half finished. Half finished projects are the real tax. They consume the mental space of a commitment while producing none of the evidence. Certification study gets a defined block of time when there is a specific exam I have decided is worth it, and building and competing get most of the rest.

## Teaching and writing are the accelerators

Running the Cyber Club and teaching youth coding camps has taught me more per hour than anything else on this list.

Explaining subnetting to someone who has never seen it forces you to discover which parts you understood and which parts you had memorized. Every gap in your model becomes visible the instant a beginner asks the obvious question you had never thought to ask. I have rebuilt my understanding of several fundamentals purely because a middle schooler asked why.

You do not need a club. Write a post, answer a question in a forum, walk a friend through something. The mechanism is the same.

The written form of the same habit is the highest return thing I do: write down what I built and why, while I am building it.

It compounds in three directions. It makes the work reusable, because six months later I can rebuild it without re-deriving everything. It makes the work legible, because a hiring manager or a teacher can see what you did rather than taking your word for it. And the act of writing it forces you to find the parts you cannot explain, which are exactly the parts you did not really understand.

An undocumented lab is a hobby. A documented one is a portfolio, and the difference is a few hours of writing.

The format barely matters as long as it is consistent. I keep one small record per project, in the repo, in a shape I can grep later:

```yaml
# projects/vlan-segmentation/record.yml
project: lab network segmentation
started: 2026-02-03
status: running

goal: >
  Separate management, storage, and untrusted client traffic so a
  compromised client device cannot reach a hypervisor management port.

skills_practiced:
  - vlan design and trunk configuration
  - firewall policy between zones
  - documenting a working state before changing it

what_broke:
  - description: management access lost after tagging the uplink
    cause: native vlan mismatch between switch and firewall
    fix: set the native vlan explicitly on both ends, then re-test
    lesson: always keep one out-of-band path before touching a trunk

verify:
  - command: ping -c1 10.20.0.1
    expect: reachable only from the management vlan
  - command: nmap -Pn -p 22,443 10.30.0.10
    expect: filtered from the client vlan

next: add 802.1X so port assignment is identity driven, not static
```

The `what_broke` section is the one I reread. It is a record of my own mistakes, and it is worth more than the rest of the file combined. It is also the part that proves to anyone else that you were actually there, since anyone can describe a working system. Fill it in while you still remember the details, because a week later it compresses to "there were some issues" and the evidence is gone.

That record is shaped for grep, not for a reader. When someone else is going to read about a project, "I have a homelab" communicates almost nothing: it sounds the same coming from someone with a spare laptop and from someone running real infrastructure. State the problem, not the equipment. "I segmented the network so lab systems cannot reach household devices" beats a parts list, because the parts list is a purchase and the segmentation is a decision.

Then show a decision with a tradeoff. Every real engineering choice gives something up, and being able to say what you gave up and why is the difference between having built something and having followed a tutorial. The skeleton I use for every project writeup has five headings: Problem, Constraints, Design (including the two alternatives I rejected, and why), What broke, and Result (what is measurably different now, and what I would do differently).

To sum it up: certifications teach you the map. Projects teach you the terrain. Competition teaches you to move fast on unfamiliar ground. Teaching shows you which parts of the map you were only pretending to read.

Do all four, in that order, on a loop.

## References

- [CompTIA](https://www.comptia.org/)
- [CompTIA certifications](https://www.comptia.org/certifications)
- [National Cyber League](https://nationalcyberleague.org/)
- [NIST NICE Workforce Framework for Cybersecurity](https://www.nist.gov/nice/framework)
- [CyberSeek career pathway](https://www.cyberseek.org/)
- [CYBER.ORG, the CISA-funded K-12 cybersecurity curriculum provider](https://www.cyber.org/)
