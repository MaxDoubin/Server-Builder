import type { Scenario } from "../types";

/**
 * Ransomware, from the on-call pager.
 *
 * The traps in here are the ones that cost real organisations real money:
 * pulling power on an encrypting host (which destroys the keys in memory and
 * can trip a boot locker), restoring from backups nobody checked was offline,
 * treating encryption as the whole incident when exfiltration happened first,
 * and starting the regulatory clock late because nobody wanted to be the one
 * to say the word "breach".
 */
export const ransomware0214: Scenario = {
  slug: "ransomware-0214",
  title: "The 02:14 Page",
  tagline: "A file server stops answering. Then the backup server stops answering.",
  difficulty: "hard",
  category: "Ransomware",
  role: "You are the on-call infrastructure engineer for a 400-person logistics company. There is no security team. There is you, a runbook nobody has read since March, and a director who is asleep.",
  clockStart: "Tuesday 02:14",
  brief: [
    "Your phone goes off at 02:14. It is the monitoring system, not a person, which is either good news or very bad news depending on the next ten minutes.",
    "Three alerts fired in ninety seconds: FS01 stopped responding to SMB health checks, the nightly backup job on BKP01 failed with an I/O error, and disk write throughput on the storage array went from a flat overnight baseline to saturated.",
    "You have a laptop, a VPN, and no idea yet whether this is a failing disk shelf or the worst night of your career.",
  ],
  start: "wake",
  reading: [
    { label: "The 3-2-1 rule, and the copy that has to be offline", href: "/blog/backup-strategy-321-rule" },
    { label: "Incident response, as a method rather than a panic", href: "/blog/incident-response-methodology" },
    { label: "Segmentation with VLANs", href: "/blog/vlan-segmentation-guide" },
    { label: "Log analysis when you do not know what you are looking for", href: "/blog/log-analysis-methodology" },
  ],
  scenes: [
    {
      id: "wake",
      where: "On the VPN, still in bed",
      body: [
        "You are on the VPN. FS01 does not answer SMB but it does answer ping, and RDP gets you a session after an unusually long wait.",
        "The desktop is there. The disk light on the console graph is pinned. Something is writing very hard to a machine that should be idle at two in the morning.",
      ],
      evidence: [
        {
          kind: "alert",
          title: "Monitoring, 02:12 to 02:14",
          lines: [
            "CRIT  FS01     SMB health check    no response after 3 attempts",
            "CRIT  BKP01    veeam-nightly       job failed: I/O error writing to repository",
            "WARN  SAN-01   volume vol-files    write throughput 1.9 GB/s (baseline 40 MB/s)",
          ],
        },
      ],
      choices: [
        {
          label: "Pull FS01's network cable from the switch, right now",
          detail: "Stop whatever it is talking to before you understand what it is.",
          to: "isolated-fast",
          cost: 2,
        },
        {
          label: "Hold the power button on FS01",
          detail: "Nothing can encrypt what is not running.",
          to: "power-pulled",
          cost: 1,
        },
        {
          label: "Look at what is actually writing before touching anything",
          detail: "Two minutes of evidence now is worth two days of guessing later.",
          to: "look-first",
          cost: 3,
        },
        {
          label: "Check BKP01 first, since a backup failure is the thing you cannot undo",
          to: "backup-first",
          cost: 4,
        },
      ],
    },

    {
      id: "look-first",
      where: "RDP session on FS01",
      body: [
        "Task Manager sorted by disk. One process, running as a service account you recognise from the print server migration, is writing at more than a gigabyte a second.",
        "You open the directory it is working in. Every file has picked up a new extension, and there is a text file in each folder that was not there yesterday.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "FS01, Get-Process sorted by IO",
          lines: [
            "Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  ProcessName",
            "-------  ------    -----      -----     ------     --  -----------",
            "    412      31   118204      92116     441.19   7728  svchost",
            "     98      12    18440       9204      12.03   1140  sqlservr",
            "",
            "PS> Get-Counter '\\Process(svchost#4)\\IO Write Bytes/sec'",
            "     1,942,110,208",
            "",
            "PS> (Get-Process -Id 7728).Path",
            "C:\\ProgramData\\WinSvcHost\\svchost.exe",
          ],
        },
        {
          kind: "note",
          title: "RESTORE-FILES.txt, in every folder",
          lines: [
            "Your network has been encrypted. We also have 1.4 TB of your data.",
            "Contact within 72 hours or the data is published.",
            "Do not attempt recovery. Files are unrecoverable without our key.",
          ],
        },
      ],
      choices: [
        {
          label: "Isolate FS01 at the switch, leave it powered on",
          detail: "Cut the network, keep the memory.",
          to: "isolated-clean",
          cost: 2,
        },
        {
          label: "Kill the process, then isolate",
          detail: "Stop the encryption first, network second.",
          to: "killed-process",
          cost: 1,
        },
        {
          label: "Power off FS01 immediately now that you know it is ransomware",
          to: "power-pulled",
          cost: 1,
        },
        {
          label: "Leave FS01 alone and go straight to the rest of the estate",
          detail: "One server is lost. Find out how many others are not yet.",
          to: "estate-sweep",
          cost: 5,
        },
      ],
    },

    {
      id: "isolated-clean",
      where: "At the rack, crash cart on FS01",
      body: [
        "You shut the switch port. FS01 drops off the network. It carries on encrypting its own local disk, which is annoying but is now the whole of the damage it can do.",
        "You get a crash cart on it. The machine is up, the process is running, and everything the operator loaded into that machine's memory is still sitting there.",
      ],
      choices: [
        {
          label: "Kill the process now that it cannot reach anything else",
          to: "killed-process",
          cost: 2,
        },
        {
          label: "Leave it running and sweep the rest of the estate first",
          detail: "Every minute here is a minute another host is not being checked.",
          to: "estate-sweep",
          cost: 4,
        },
        {
          label: "Image its memory while it is still live and still encrypting",
          to: "memory-image",
          cost: 12,
        },
      ],
    },

    {
      id: "isolated-fast",
      where: "At the rack, crash cart on FS01",
      body: [
        "You shut the switch port. FS01 drops off the network mid-write. It is still running, still encrypting its own local disk, and now you cannot see it.",
        "You walk to the rack and put a crash cart on it. The ransom note is on the desktop. The process is still going.",
      ],
      choices: [
        {
          label: "Kill the process from the console, keep the machine up",
          to: "killed-process",
          cost: 2,
        },
        { label: "Power it off now", to: "power-pulled", cost: 1 },
        {
          label: "Leave it running and isolated, and go check the rest of the estate",
          detail: "It can only hurt itself now.",
          to: "estate-sweep",
          cost: 4,
        },
      ],
    },

    {
      id: "killed-process",
      where: "FS01 console",
      body: [
        "The process dies. Disk write drops to nothing. About sixty percent of the share is encrypted; the rest is intact.",
        "The machine is still running, which means whatever was in memory is still in memory. That will matter later, or it will not, depending on what you do in the next few minutes.",
      ],
      choices: [
        {
          label: "Take a memory image before anything else",
          detail: "Keys, the operator's tooling, the account it used. All of it is in RAM right now.",
          to: "memory-image",
          cost: 12,
        },
        {
          label: "Sweep the estate for the same process",
          to: "estate-sweep",
          cost: 5,
        },
        {
          label: "Start restoring the encrypted share from last night's backup",
          to: "restore-attempt",
          cost: 10,
        },
      ],
    },

    {
      id: "power-pulled",
      where: "FS01 console, twenty minutes later",
      body: [
        "FS01 goes dark. The write storm stops, which feels like winning.",
        "Twenty minutes later, when you try to bring it back up to see the damage, it does not boot. The bootloader has been replaced with a red screen and a wallet address.",
        "Everything that was in that machine's memory is gone: the key material the encryptor was holding, the parent process, the account it authenticated as, the command and control address. The disk is encrypted and now so is the boot path.",
      ],
      evidence: [
        {
          kind: "note",
          title: "FS01 console after power cycle",
          lines: [
            "  Your files are encrypted.",
            "  Do not shut down or restart this computer.",
            "  ID: 8fb2-40e1-c7a9",
          ],
        },
      ],
      choices: [
        {
          label: "Move on: sweep the estate before more machines go the same way",
          to: "estate-sweep",
          cost: 4,
        },
        {
          label: "Restore FS01 from backup and hope BKP01 is fine",
          to: "restore-attempt",
          cost: 12,
        },
        { label: "Wake the director now", to: "escalate", cost: 3 },
      ],
    },

    {
      id: "backup-first",
      where: "The backup console",
      body: [
        "BKP01 answers. The Veeam console opens. The nightly job failed at 01:57 with an I/O error, and the repository volume is mounted, writable, and visible to the whole file server VLAN.",
        "You look at the repository directory. The last four restore points have the same new extension you have not seen before. The oldest two, from the tape rotation, do not.",
      ],
      evidence: [
        {
          kind: "log",
          title: "BKP01, repository listing",
          lines: [
            "vol-backups/",
            "  2026-09-01-full.vbk.wcry7    412 GB   01:58",
            "  2026-08-31-inc.vib.wcry7      18 GB   01:58",
            "  2026-08-30-inc.vib.wcry7      21 GB   01:57",
            "  2026-08-29-inc.vib.wcry7      19 GB   01:57",
            "  2026-08-24-full.vbk          408 GB   Aug 24 02:04   (tape copy exists)",
            "  2026-08-17-full.vbk          401 GB   Aug 17 02:03   (tape copy exists)",
          ],
        },
      ],
      choices: [
        {
          label: "Disconnect the repository volume and get the tapes out of rotation",
          detail: "Protect what is left before anything else.",
          to: "tapes-secured",
          cost: 6,
        },
        {
          label: "Go back to FS01, it is still writing",
          to: "look-first",
          cost: 2,
        },
        {
          label: "Shut down every server in the estate",
          detail: "Total stop. Sort it out in the morning.",
          to: "mass-shutdown",
          cost: 8,
        },
      ],
    },

    {
      id: "tapes-secured",
      where: "The tape library",
      body: [
        "The repository volume is offline and the two tape copies are physically out of the library and on the desk. Whatever else happens tonight, there is a restorable copy of the estate from nine days ago.",
        "Nine days is a lot of invoices.",
      ],
      choices: [
        {
          label: "Sweep the estate for other infected hosts",
          to: "estate-sweep",
          cost: 5,
        },
        {
          label: "Go back to FS01 and preserve its memory before anyone reboots it",
          to: "memory-image",
          cost: 12,
        },
        { label: "Wake the director", to: "escalate", cost: 3 },
      ],
    },

    {
      id: "mass-shutdown",
      where: "The hypervisor console",
      body: [
        "You shut everything down: file servers, application servers, the domain controllers, the hypervisors. The estate is dark inside eight minutes.",
        "The encryption stops, because nothing is running. So does the business. Warehouse scanners, the transport management system, the phones, and the door badges all depend on something you just turned off.",
        "Two of the three hosts that were mid-encryption do not come back up cleanly. Neither does one that was not infected at all, because it had a disk that was going to fail on the next boot anyway and tonight was that boot.",
      ],
      choices: [
        {
          label: "Bring the domain controllers back first and rebuild outward from them",
          to: "cold-rebuild",
          cost: 60,
        },
        {
          label: "Wake the director and the leadership team now",
          to: "escalate",
          cost: 4,
        },
      ],
    },

    {
      id: "estate-sweep",
      where: "Your laptop, scripting it",
      body: [
        "You script it: every host, look for the process name, the directory under ProgramData, and the ransom note filename.",
        "Four hits. FS01, which you know about. APP02, which is writing right now. And two workstations in the finance office, one of which belongs to the accounts payable clerk whose credentials are on the service account you saw earlier.",
        "That last detail is the one that matters. This did not start with a file server.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Sweep results",
          lines: [
            "HOST     PROCESS   NOTE PRESENT   FIRST WRITE",
            "FS01     yes       yes            02:11:44",
            "APP02    yes       yes            02:12:02",
            "WS-FIN-4 no        yes            01:47:19",
            "WS-FIN-9 no        yes            01:52:03",
            "",
            "Earliest note on the estate: WS-FIN-4 at 01:47:19",
            "WS-FIN-4 last interactive logon: svc_print (01:31:06)",
          ],
        },
      ],
      choices: [
        {
          label: "Isolate all four at the switch and disable svc_print in AD",
          detail: "Cut the account and the hosts together.",
          to: "account-killed",
          cost: 6,
        },
        {
          label: "Isolate the hosts, leave the account alone for now",
          detail: "Disabling it might tip them off.",
          to: "hosts-only",
          cost: 4,
        },
        {
          label: "Wake the director before you touch production accounts",
          to: "escalate",
          cost: 5,
        },
      ],
    },

    {
      id: "account-killed",
      where: "Active Directory Users and Computers",
      body: [
        "Four ports shut. svc_print disabled, and while you are in there you notice it is a member of Domain Admins, which it has no business being, and which explains the speed of all this.",
        "Encryption stops estate-wide. You have maybe two hundred gigabytes encrypted across four machines and a domain you now have to assume is fully compromised.",
      ],
      choices: [
        {
          label: "Preserve memory and disk images from FS01 and WS-FIN-4 before anything else",
          to: "memory-image",
          cost: 20,
        },
        {
          label: "Wake the director and start the notification clock",
          to: "escalate",
          cost: 4,
        },
        {
          label: "Start restoring from backup immediately",
          to: "restore-attempt",
          cost: 15,
        },
      ],
    },

    {
      id: "hosts-only",
      where: "Watching the sweep re-run",
      body: [
        "The four hosts are off the network. Encryption stops on those four.",
        "Eleven minutes later it starts on three others, from the same account, which is still enabled and still a member of Domain Admins.",
      ],
      choices: [
        {
          label: "Disable svc_print now and re-sweep",
          to: "account-killed",
          cost: 6,
        },
        {
          label: "Shut down the whole estate, this is getting away from you",
          to: "mass-shutdown",
          cost: 8,
        },
        {
          label: "Watch for another ten minutes before touching a production account",
          detail: "Isolation may have been enough, and svc_print runs the print queues.",
          to: "end-cascade",
          cost: 11,
        },
      ],
    },

    {
      id: "memory-image",
      where: "At the rack with the incident kit",
      body: [
        "You take a memory image off FS01 with a USB tool from the incident kit that you are quietly amazed is where the runbook says it is.",
        "It takes eleven minutes and produces a 32 GB file that you will not be able to analyse tonight, and that a specialist will be very glad of on Thursday.",
        "Then you image the disks. Then, and only then, you wake the director.",
      ],
      choices: [
        {
          label: "Wake the director and start the notification clock",
          to: "escalate",
          cost: 4,
        },
      ],
    },

    {
      id: "escalate",
      where: "On the phone to the director",
      body: [
        "The director answers on the fourth ring. You give them the short version: ransomware, at least four hosts, backups partly encrypted, data theft claimed in the note.",
        "They ask the question everyone asks. Do we pay?",
        "They also ask a better one, twenty seconds later: who do we have to tell, and by when?",
      ],
      evidence: [
        {
          kind: "note",
          title: "What you know at this point",
          lines: [
            "Claimed exfiltration: 1.4 TB. Unverified.",
            "Personal data in scope: employee HR share, customer contact records.",
            "UK GDPR Article 33: notify the ICO within 72 hours of becoming aware,",
            "unless the breach is unlikely to result in a risk to individuals.",
            "Cyber insurance policy: notify within 24 hours or cover may be refused.",
          ],
        },
      ],
      choices: [
        {
          label: "Notify insurer and regulator now, engage the incident response retainer",
          detail: "Start every clock before anyone has time to talk you out of it.",
          to: "notified",
          cost: 20,
        },
        {
          label: "Wait until the morning to notify, so you can report something coherent",
          to: "notify-late",
          cost: 300,
        },
        {
          label: "Open negotiation with the operators to buy time and find out what they took",
          to: "negotiate",
          cost: 60,
        },
      ],
    },

    {
      id: "notified",
      where: "On a bridge call with the insurer",
      body: [
        "The insurer's hotline answers at three in the morning, which is what the premium is for. They appoint a response firm who are on a call with you inside forty minutes and take over the forensics.",
        "The regulator notification goes in as a preliminary report before lunch. Legal advises against contact with the operators until the response firm has scoped the exfiltration.",
        "Now the only question left is the one that was decided weeks ago, by whoever last checked whether the backups were offline.",
      ],
      choices: [
        {
          label: "Restore from the tape copies",
          to: "restore-tape",
          cost: 480,
        },
        {
          label: "Restore from the disk repository, it might be partly intact",
          to: "restore-attempt",
          cost: 240,
        },
      ],
    },

    {
      id: "restore-attempt",
      where: "The restore wizard",
      body: [
        "You mount the repository and start a restore of the file share.",
        "The four most recent restore points are encrypted, because the repository was a writable SMB share visible from the same VLAN as the thing that encrypted everything else. The job that ran at 01:57 wrote its increment into a directory that was being encrypted while it wrote.",
        "What is left is what was written to tape, nine days ago, and whatever the operators are willing to sell you.",
      ],
      choices: [
        { label: "Restore from the tapes and accept nine days of loss", to: "restore-tape", cost: 600 },
        { label: "Pay", to: "paid", cost: 2880 },
      ],
    },

    {
      id: "restore-tape",
      where: "Two days at the tape library",
      body: [
        "The tapes restore. It takes twenty-six hours across two of them and one retry, and the finance team spends the following fortnight re-keying nine days of invoices from PDFs in mailboxes.",
        "Nobody pays anybody. The response firm confirms the exfiltration was real but smaller than claimed: 40 GB, mostly the HR share.",
      ],
      choices: [
        {
          label: "Publish an internal post-incident review with the timeline and the mistakes",
          to: "end-recovered-clean",
          cost: 0,
        },
        {
          label: "Close the ticket, restore service, move on",
          to: "end-recovered-quiet",
          cost: 0,
        },
      ],
    },

    {
      id: "notify-late",
      where: "Thursday afternoon, the insurer's loss adjuster",
      body: [
        "You spend Tuesday and Wednesday restoring and do not notify anyone outside the company until Thursday afternoon, by which point you have a clean story to tell.",
        "The insurer refuses the claim: the policy required notification within 24 hours and you were 61 hours late. The regulator's first question is when you became aware, and your own monitoring system timestamps the answer at 02:12 on Tuesday.",
        "The restoration itself went fine.",
      ],
      choices: [{ label: "Continue", to: "end-late-notification", cost: 0 }],
    },

    {
      id: "negotiate",
      where: "The operator's chat portal",
      body: [
        "You open the chat portal in the note. The operator is polite, professional and immediately produces a file tree of the HR share as proof, along with three sample documents.",
        "They want 480,000 dollars in Bitcoin. They will take 310,000 if you pay in 48 hours. They offer a decryptor and a 'deletion certificate' for the stolen data.",
        "Your director asks you whether the decryptor will work and whether they will really delete it.",
      ],
      choices: [
        {
          label: "Advise against paying and go to the tapes",
          to: "restore-tape",
          cost: 600,
        },
        {
          label: "Pay, on the grounds that nine days of lost invoices costs more",
          to: "paid",
          cost: 2880,
        },
        {
          label: "Stall, and check the wallet against sanctions listings first",
          detail: "Paying a sanctioned entity is a separate offence from being robbed.",
          to: "sanctions-check",
          cost: 240,
        },
      ],
    },

    {
      id: "sanctions-check",
      where: "Legal's office",
      body: [
        "Legal runs the wallet and the group's known aliases past the sanctions lists. It comes back clean, which is not the same as safe, and they put the advice in writing either way.",
        "The response firm, meanwhile, has finished with the memory image, if you took one.",
      ],
      choices: [
        {
          label: "Ask the response firm whether the memory image gave them anything",
          to: "key-recovered",
          cost: 60,
        },
        { label: "Pay", to: "paid", cost: 2880 },
        { label: "Go to the tapes", to: "restore-tape", cost: 600 },
      ],
    },

    {
      id: "key-recovered",
      where: "A call from the response firm",
      body: [
        "The response firm calls. The encryptor on FS01 was still resident when you imaged it, and this family holds its per-host symmetric key in memory until the process exits.",
        "They pull the key. It decrypts FS01 and, because the operator reused the campaign key across the estate that night, APP02 as well. The two finance workstations were encrypted with a different key and are a rebuild.",
        "You lose nothing but the two workstations and three days.",
      ],
      choices: [{ label: "Continue", to: "end-key-in-memory", cost: 0 }],
    },

    {
      id: "paid",
      where: "The finance director's office",
      body: [
        "The transfer goes out. The decryptor arrives nine hours later.",
        "It works on about eighty percent of the files. It is single-threaded, it crashes on paths longer than 260 characters, and it silently corrupts files it has already partially written when it restarts. The response firm ends up writing a wrapper around it.",
        "Six weeks later the HR share appears on a leak site anyway.",
      ],
      choices: [{ label: "Continue", to: "end-paid", cost: 0 }],
    },

    {
      id: "cold-rebuild",
      where: "Four days in the server room",
      body: [
        "Rebuilding a domain from cold, with two hosts that will not boot and no memory evidence from any of them, takes four days.",
        "Nobody ever establishes how the intruder got in, because everything that would have said so was powered off before it was recorded. The same service account is recreated during the rebuild, with the same membership, because the rebuild is done from the same documentation.",
      ],
      choices: [{ label: "Continue", to: "end-blind-rebuild", cost: 0 }],
    },
  ],

  endings: [
    {
      id: "end-key-in-memory",
      title: "The key was in the memory you kept",
      grade: "best",
      body: [
        "Two workstations rebuilt, three days of disruption, no payment, no lost data beyond what was already on tape, and a forensic record good enough to find the initial access: a print service account with Domain Admins and a password that had not changed since 2021.",
        "This outcome existed because you killed the process instead of the machine, and imaged memory before anyone rebooted it.",
      ],
      lesson: [
        "Powering off a host mid-encryption is the instinct and it is usually wrong. Volatile memory holds the key material, the parent process, the account, and the command and control address. All of it is gone the moment the power is.",
        "Isolate at the network, not at the power button. The machine can only hurt itself once its port is shut.",
      ],
    },
    {
      id: "end-recovered-clean",
      title: "Nine days back, and a review nobody enjoyed",
      grade: "good",
      body: [
        "Restored from tape, no payment, notifications on time, insurance paid out. Nine days of invoices re-keyed by hand and a fortnight of bad temper in finance.",
        "The review says the things reviews say, and this one is published internally with names removed and decisions left in. The backup repository is offline the following week. svc_print is out of Domain Admins by Friday.",
      ],
      lesson: [
        "The outcome was decided before the incident started: two tape copies existed and were not reachable from the network that got encrypted. That is the whole of the 3-2-1 rule doing its job.",
        "A post-incident review that is not written down is a review that did not happen.",
      ],
    },
    {
      id: "end-recovered-quiet",
      title: "Service restored, lessons unrecorded",
      grade: "mixed",
      body: [
        "Everything comes back. The ticket closes. The estate looks the same on Friday as it did on Monday, which is the problem.",
        "Eight months later a different service account with the same excessive membership is used the same way, and this time the tapes have been decommissioned because the restore in September proved the disk repository was fine.",
      ],
      lesson: [
        "Restoring service ends the outage. It does not end the incident. The intrusion path, the over-privileged account and the writable backup repository all survived this night intact.",
        "If nothing in the estate is different afterwards, you have bought yourself a rerun.",
      ],
    },
    {
      id: "end-late-notification",
      title: "A clean recovery and a refused claim",
      grade: "bad",
      body: [
        "Technically this went well. Commercially it did not: the insurance claim is refused for late notification, and the regulator's response to a three-day delay by an organisation whose own monitoring timestamped the event is not sympathetic.",
        "The recovery cost is now entirely the company's, and it is larger than the ransom was.",
      ],
      lesson: [
        "Notification clocks start when you become aware, and your monitoring system is a witness to exactly when that was. Waiting until you have a tidy story costs you the cover that pays for the tidy story.",
        "A preliminary notification with 'investigation ongoing' is a normal, expected thing to file. Nobody requires you to know everything on day one.",
      ],
    },
    {
      id: "end-paid",
      title: "Paid, decrypted, published anyway",
      grade: "bad",
      body: [
        "310,000 dollars for a decryptor that recovered four fifths of the files and needed a wrapper written around it to do that.",
        "The data was published six weeks later regardless. The deletion certificate was a PDF.",
      ],
      lesson: [
        "Paying buys a decryptor, when it works. It does not buy deletion, because there is nothing to enforce and no reason for them to comply.",
        "Decryptors written by criminals are usually bad software: single threaded, fragile on long paths, and unsafe to restart. Budget days, not hours.",
      ],
    },
    {
      id: "end-blind-rebuild",
      title: "Four days dark, and no idea how",
      grade: "catastrophic",
      body: [
        "The estate comes back on Saturday. Nothing is known about the intrusion: no memory, no timeline, no initial access vector, because everything that held that evidence was powered off inside twelve minutes.",
        "The rebuild restores the same service account with the same membership from the same documentation. Nobody knows to change it, because nobody knows it was the way in.",
      ],
      lesson: [
        "A total shutdown feels decisive and destroys the only evidence that would stop it happening again. It also takes the business down harder than the attack had managed on its own.",
        "The scoping question is not 'how do I stop everything' but 'what is the smallest thing I can isolate that stops the spread', and the answer is almost always a switch port and an account.",
      ],
    },
    {
      id: "end-cascade",
      title: "It kept spreading while you watched",
      grade: "catastrophic",
      body: [
        "The four hosts you isolated were the four you knew about. The account that owned them was left enabled for another eleven minutes, and eleven minutes is three more servers.",
        "By the time the account is disabled, the encrypted footprint has tripled and the tape copies are the only thing left.",
      ],
      lesson: [
        "Containment means the identity as well as the host. An account with Domain Admins does not care which machines you unplugged.",
        "The worry about 'tipping them off' assumes the operator is not already watching their own encryption progress. They are.",
      ],
    },
  ],
};
