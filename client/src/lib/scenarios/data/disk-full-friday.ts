import type { Scenario } from "../types";

/**
 * A full disk, which is the most boring outage there is and one of the most
 * commonly mishandled.
 *
 * The traps are all the same shape: doing the thing that frees space fastest
 * rather than the thing that is safe. Deleting a log a process still has open
 * frees nothing. Truncating the wrong file loses the evidence of why it grew.
 * Extending the volume without finding the cause buys a week. And the actual
 * cause here is a rotation rule that has been silently failing since a
 * package upgrade in June.
 */
export const diskFullFriday: Scenario = {
  slug: "disk-full-friday",
  title: "No Space Left on Device",
  tagline: "The application stops writing at 16:52 on a Friday. The disk is 100 percent full.",
  difficulty: "easy",
  category: "Availability",
  role: "You are the only systems person at a small e-commerce company. There are 90 minutes of trading left today and the weekend is the busiest period of the week.",
  clockStart: "Friday 16:52",
  brief: [
    "Orders stopped being written eight minutes ago. The web front end still loads, customers can still add to a basket, and checkout returns a 500.",
    "The application log has one line in it, repeated: No space left on device.",
  ],
  start: "first-look",
  reading: [
    { label: "Centralised logging, and the rotation that has to happen anyway", href: "/blog/syslog-centralized-logging" },
    { label: "Disk I/O troubleshooting on Linux", href: "/blog/linux-disk-io-troubleshooting" },
  ],
  scenes: [
    {
      id: "first-look",
      mood: "critical",
      where: "SSH on the application server",
      body: [
        "You are in. The prompt still works, which means there is enough space for your shell but not for the application's next write.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "df -h",
          lines: [
            "Filesystem      Size  Used Avail Use% Mounted on",
            "/dev/vda1        40G   40G     0 100% /",
            "tmpfs           2.0G  1.2M  2.0G   1% /run",
            "/dev/vdb1       200G   61G  139G  31% /var/lib/postgresql",
          ],
        },
      ],
      choices: [
        {
          label: "Find what is actually taking the space",
          detail: "du before rm, every time.",
          to: "found-the-size",
          cost: 3,
        },
        {
          label: "Delete the biggest log you can find and get trading again",
          to: "deleted-blind",
          cost: 2,
        },
        {
          label: "Extend the root volume, it is only 40G",
          to: "extended",
          cost: 12,
        },
        {
          label: "Reboot it, that usually clears things",
          to: "end-rebooted",
          cost: 6,
        },
      ],
    },

    {
      id: "found-the-size",
      mood: "tense",
      where: "Walking the tree",
      body: [
        "Thirty-one gigabytes of it is in one directory, and nearly all of that is one file that nothing has rotated since June.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "du -xh / | sort -h | tail",
          lines: [
            "1.1G    /usr",
            "1.4G    /home",
            "2.2G    /var/lib/docker",
            "31G     /var/log/shopfront",
            "37G     /var",
            "40G     /",
            "",
            "$ ls -lh /var/log/shopfront/",
            "-rw-r--r-- 1 shopfront shopfront  31G Sep  8 16:52 debug.log",
            "-rw-r--r-- 1 shopfront shopfront 118M Jun 14 03:10 debug.log.1.gz",
          ],
        },
      ],
      choices: [
        {
          label: "rm the 31G debug.log",
          detail: "It is a debug log. Delete it and move on.",
          to: "removed-open-file",
          cost: 1,
        },
        {
          label: "Truncate it in place, so the process keeps its file handle",
          to: "truncated",
          cost: 2,
        },
        {
          label: "Read the end of it first to find out why it is 31 gigabytes",
          to: "read-the-tail",
          cost: 4,
        },
      ],
    },

    {
      id: "removed-open-file",
      mood: "critical",
      where: "Back at df",
      body: [
        "The file is gone from the listing. df still says 100 percent.",
        "The application still has the file open, so the kernel keeps the blocks allocated until the last handle closes. You have deleted the only copy of the evidence and freed nothing at all.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "After the rm",
          lines: [
            "$ df -h /",
            "/dev/vda1        40G   40G     0 100% /",
            "",
            "$ lsof +L1 | head -3",
            "COMMAND    PID      USER   FD   TYPE DEVICE  SIZE/OFF NLINK  NODE NAME",
            "shopfront 1188 shopfront   7w   REG  253,1 33285996544     0 26237 /var/log/shopfront/debug.log (deleted)",
          ],
        },
      ],
      choices: [
        {
          label: "Restart the application so the handle closes",
          to: "restarted-after-rm",
          cost: 3,
        },
        {
          label: "Extend the volume instead, the file is gone anyway",
          to: "extended",
          cost: 12,
        },
      ],
    },

    {
      id: "truncated",
      mood: "recovering",
      where: "Back at df",
      body: [
        "You run `: > /var/log/shopfront/debug.log`. Space is freed immediately, the file handle stays valid, and the application starts writing orders again without a restart.",
        "Trading resumes at 17:04. You have twelve minutes of lost orders and a disk that is going to do this again.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "df -h, after",
          lines: [
            "Filesystem      Size  Used Avail Use% Mounted on",
            "/dev/vda1        40G  8.9G   29G  24% /",
          ],
        },
      ],
      choices: [
        {
          label: "Find out why it grew before you go home",
          to: "read-the-tail",
          cost: 5,
        },
        {
          label: "Trading is back. Deal with it on Monday",
          to: "end-monday-problem",
          cost: 0,
        },
        {
          label: "Add monitoring for disk usage and deal with the cause on Monday",
          to: "end-monitored-not-fixed",
          cost: 15,
        },
      ],
    },

    {
      id: "read-the-tail",
      mood: "tense",
      where: "Reading the log",
      body: [
        "The last two million lines are the same line. A third-party address validation call started timing out on 14 June, and the retry loop logs the whole request and response body at debug level on every attempt.",
        "14 June is also the date of the last successful rotation.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "tail and count",
          lines: [
            "$ tail -2 /var/log/shopfront/debug.log",
            "2026-09-08T16:52:03 DEBUG addr.validate retry 41/60 upstream timeout {...4KB...}",
            "2026-09-08T16:52:03 DEBUG addr.validate retry 42/60 upstream timeout {...4KB...}",
            "",
            "$ grep -c 'upstream timeout' /var/log/shopfront/debug.log",
            "7412886",
            "",
            "$ ls /etc/logrotate.d/",
            "apt  dpkg  nginx  postgresql-common  rsyslog",
            "",
            "$ zgrep -c . /var/log/shopfront/debug.log.1.gz",
            "882014",
          ],
        },
      ],
      choices: [
        {
          label: "There is no logrotate rule for shopfront at all. Write one",
          to: "wrote-rotation",
          cost: 15,
        },
        {
          label: "Turn the debug logging off in the app config",
          to: "end-turned-off-logging",
          cost: 8,
        },
        {
          label: "It is 17:10 on a Friday. Note it and go home",
          to: "end-monday-problem",
          cost: 0,
        },
      ],
    },

    {
      id: "wrote-rotation",
      mood: "recovering",
      where: "/etc/logrotate.d/shopfront",
      body: [
        "You write the rule: daily, keep 14, compress, and copytruncate because the application holds its handle open and does not respond to a signal.",
        "Then you check the other thing, which is why the rule was missing in the first place. The application's Debian package used to ship one. The 3.4 upgrade in June moved it to /usr/lib/logrotate.d, which this host's logrotate is not configured to read, and the upgrade removed the old file.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The rule, and the reason it went missing",
          lines: [
            "$ cat /etc/logrotate.d/shopfront",
            "/var/log/shopfront/*.log {",
            "    daily",
            "    rotate 14",
            "    compress",
            "    delaycompress",
            "    missingok",
            "    notifempty",
            "    copytruncate",
            "}",
            "",
            "$ logrotate -d /etc/logrotate.d/shopfront 2>&1 | tail -3",
            "rotating log /var/log/shopfront/debug.log, log->rotateCount is 14",
            "renaming /var/log/shopfront/debug.log to .1",
            "truncating /var/log/shopfront/debug.log",
          ],
        },
      ],
      choices: [
        {
          label: "Also raise the address validation timeout issue with the vendor",
          to: "end-fixed-properly",
          cost: 20,
        },
        {
          label: "Rotation is fixed. That is the outage dealt with",
          to: "end-rotation-only",
          cost: 0,
        },
      ],
    },

    {
      id: "restarted-after-rm",
      mood: "recovering",
      where: "systemctl restart shopfront",
      body: [
        "The handle closes, 31 gigabytes come back, and the application starts writing orders again.",
        "You now have no idea why the file grew, because you deleted it. The only clue left is an 118 megabyte gzip from June.",
      ],
      choices: [
        {
          label: "Read the June archive and work backwards from that",
          to: "read-the-tail",
          cost: 8,
        },
        {
          label: "Extend the volume so it cannot happen again this weekend",
          to: "extended",
          cost: 12,
        },
        {
          label: "Trading is back. Deal with it on Monday",
          to: "end-monday-problem",
          cost: 0,
        },
      ],
    },

    {
      id: "extended",
      mood: "tense",
      where: "The hypervisor console, then growpart",
      body: [
        "You grow the volume to 100 gigabytes and resize the filesystem. Space is available, the application recovers, trading resumes at 17:16.",
        "The file is still growing at roughly four gigabytes an hour.",
      ],
      choices: [
        {
          label: "Work out what is writing four gigabytes an hour",
          to: "read-the-tail",
          cost: 6,
        },
        {
          label: "60 gigabytes at 4 an hour is fifteen hours. That is not enough for a weekend",
          to: "read-the-tail",
          cost: 2,
        },
        {
          label: "Go home. There is plenty of space now",
          to: "end-filled-again",
          cost: 0,
        },
      ],
    },

    {
      id: "deleted-blind",
      mood: "critical",
      where: "Guessing",
      body: [
        "You delete the biggest thing in /var/log that looks disposable, which turns out to be the nginx access log for the last four months.",
        "It frees 2.1 gigabytes. The disk is 95 percent full and the application starts writing again, briefly.",
        "It fills again in thirty-one minutes, during which you have also destroyed the only record of the traffic that hit the site this afternoon.",
      ],
      choices: [
        {
          label: "Stop guessing and find what is actually growing",
          to: "found-the-size",
          cost: 3,
        },
        {
          label: "Extend the volume",
          to: "extended",
          cost: 12,
        },
      ],
    },
  ],

  endings: [
    {
      id: "end-fixed-properly",
      title: "Rotation, and the reason for the noise",
      grade: "best",
      body: [
        "Twelve minutes of lost trading, rotation restored, and the actual cause raised with the address validation vendor, who acknowledge a regional endpoint failure that has been timing out intermittently since June.",
        "The retry loop is capped and the debug body logging is moved behind a flag. The disk will not do this again, and neither will the log.",
      ],
      lesson: [
        "The full disk was the symptom. The missing rotation rule was the cause of the outage. The timing-out upstream was the cause of the volume, and it had been broken for twelve weeks without anyone noticing, because the only thing it produced was log lines.",
        "A packaging change that moves a config file is a classic way for a working rule to disappear: the upgrade removes the old path, and nothing on the system reports that it is no longer rotating anything.",
      ],
    },
    {
      id: "end-rotation-only",
      title: "It will not fill again",
      grade: "good",
      body: [
        "Rotation is in place with a 14 day retention, so the disk is safe.",
        "The application still writes four gigabytes an hour of the same retried error, which now rotates and compresses neatly. The address validation failures continue, and about one checkout in forty still takes eleven seconds because of the retry loop.",
      ],
      lesson: [
        "Fixing rotation fixed the outage and left the fault that produced it. That is a legitimate place to stop on a Friday, as long as somebody writes down that a third-party call has been failing since June.",
        "A log that grows four gigabytes an hour is a monitoring signal in its own right.",
      ],
    },
    {
      id: "end-monitored-not-fixed",
      title: "You will know sooner next time",
      grade: "mixed",
      body: [
        "A disk usage alert at 80 percent is worth having and you should have had one already.",
        "It fires at 04:40 on Sunday morning. You get up, truncate the file again, and go back to bed. It fires again on Tuesday.",
      ],
      lesson: [
        "Monitoring tells you when something is going wrong. It is not a fix, and an alert that fires for a known unfixed cause trains everyone to ignore it.",
        "The rule of thumb: if you can predict when an alert will next fire, you have not finished.",
      ],
    },
    {
      id: "end-turned-off-logging",
      title: "Quieter, and blinder",
      grade: "mixed",
      body: [
        "Debug logging goes off, the growth stops, and trading is fine all weekend.",
        "It also means that when checkout starts failing for a different reason in October, the log has nothing in it, and the first thing anyone does is turn debug logging back on and wait for it to happen again.",
      ],
      lesson: [
        "Turning the noise off is not the same as fixing what is making it. Here the noise was the only evidence that a supplier had been failing for three months.",
        "There was still no rotation rule. The next thing that logs verbosely will fill the disk in exactly the same way.",
      ],
    },
    {
      id: "end-filled-again",
      title: "Sixty gigabytes at four an hour",
      grade: "bad",
      body: [
        "The volume filled again at 08:20 on Saturday, fifteen hours later, in the middle of the weekend's heaviest trading.",
        "Nobody was watching, and checkout was down for two hours and forty minutes before a customer complaint reached someone with a laptop.",
      ],
      lesson: [
        "Adding space to something that is filling at a known rate does not fix it, it schedules it. The arithmetic takes ten seconds and is worth doing before you close the laptop.",
        "The question after any capacity fix is: at the current rate, when does this happen again?",
      ],
    },
    {
      id: "end-rebooted",
      title: "You rebooted a full disk",
      grade: "bad",
      body: [
        "The reboot takes eleven minutes, because a full root filesystem makes several things time out on shutdown.",
        "It comes back up with exactly as much free space as it had before, because nothing was holding deleted files open: the space was really in use. Trading is down for those eleven minutes for no benefit at all.",
      ],
      lesson: [
        "A reboot frees space only when the space was held by deleted-but-open files. `df` disagreeing with `du` is the signature of that; here they agreed, so there was nothing to release.",
        "Restarting is a reasonable move when you know why it will help. It is an expensive one when it is a substitute for looking.",
      ],
    },
    {
      id: "end-monday-problem",
      title: "It is Friday",
      grade: "bad",
      body: [
        "Trading came back, which is the thing that mattered at 17:00.",
        "The file resumed growing at four gigabytes an hour. It filled the disk again at 04:10 on Sunday and checkout was down for six hours through the busiest morning of the week.",
      ],
      lesson: [
        "Restoring service and resolving an incident are different things, and the gap between them is where weekends go.",
        "Five minutes of `tail` and `grep` would have told you the growth rate, and the growth rate would have told you this could not be left.",
      ],
    },
  ],
};
