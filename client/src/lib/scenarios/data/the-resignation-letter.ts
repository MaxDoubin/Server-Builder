import type { Scenario } from "../types";

/** Insider risk, where every technical signal is also a normal working day. */
export const theResignationLetter: Scenario = {
  slug: "the-resignation-letter",
  title: "Two Weeks' Notice",
  tagline: "A senior engineer resigns on Monday. On Tuesday she downloads 41GB.",
  difficulty: "hard",
  category: "Insider risk",
  role: "You are the security lead. HR have looped you in because it is policy, and because the engineer is going to a direct competitor.",
  clockStart: "Wednesday 09:30",
  brief: [
    "She has been here six years, she is well liked, and she is one of two people who understand the pricing engine.",
    "The DLP report for Tuesday shows 41GB read from the engineering share by her account, against a personal baseline of about 300MB a day.",
  ],
  start: "the-report",
  reading: [
    { label: "Least privilege, and the access nobody removes", href: "/blog/linux-server-hardening" },
    { label: "Log analysis when you do not know what you are looking for", href: "/blog/log-analysis-methodology" },
  ],
  scenes: [
    {
      id: "the-report",
      mood: "tense",
      where: "The DLP console",
      body: [
        "41GB is a striking number and a striking number is not evidence. It could be a full checkout of a monorepo, a local build cache, a backup before a laptop refresh, or exactly what it looks like.",
        "You have not looked at what the 41GB was yet.",
      ],
      evidence: [
        {
          kind: "alert",
          title: "DLP daily summary, Tuesday",
          lines: [
            "USER          READ      WRITTEN   EXTERNAL   BASELINE(30d avg)",
            "j.reyes      41.2 GB     1.1 GB     0 bytes   312 MB read",
            "s.patel       2.4 GB     0.4 GB     0 bytes   1.9 GB read",
            "m.oduya       0.9 GB     2.1 GB    14 MB      1.1 GB read",
          ],
        },
      ],
      choices: [
        { label: "Look at what the 41GB actually was before doing anything else", to: "what-was-it", cost: 25 },
        { label: "Suspend her access now, she is leaving anyway", to: "suspended", cost: 5 },
        { label: "Put her under enhanced monitoring and say nothing", to: "monitored", cost: 15 },
        { label: "Ask her manager whether there is an innocent explanation", to: "asked-manager", cost: 20 },
      ],
    },
    {
      id: "what-was-it",
      mood: "tense",
      where: "The file access log",
      body: [
        "Thirty-eight gigabytes of it is a single directory: the CI artifact cache for the mobile app, which she was debugging on Monday and which anyone building that app pulls in full.",
        "Two point nine gigabytes is not. It is the pricing engine repository, the customer contract folder, and a directory called 'rate-cards' that she has never opened before in six years.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Reads by path, Tuesday",
          lines: [
            "PATH                                    BYTES     FIRST ACCESS EVER?",
            "/eng/ci-cache/mobile/                  38.3 GB    no  (weekly)",
            "/eng/pricing-engine/                    1.9 GB    no  (owner)",
            "/commercial/contracts/2024-2026/        0.7 GB    YES",
            "/commercial/rate-cards/                 0.3 GB    YES",
            "",
            "Access to /commercial granted 2021-04-19 via group 'eng-leads'",
            "Nobody in 'eng-leads' has opened /commercial in 14 months.",
          ],
        },
      ],
      choices: [
        { label: "Find out whether any of it left the building", to: "egress", cost: 30 },
        { label: "Suspend access to /commercial only, and keep watching", to: "narrow-suspend", cost: 20 },
        { label: "That is enough. Suspend everything and involve HR and legal", to: "suspended", cost: 10 },
      ],
    },
    {
      id: "egress",
      mood: "critical",
      where: "Every path out",
      body: [
        "Nothing to personal cloud storage, which is blocked. Nothing to webmail, which is blocked. No USB mass storage events, because the endpoint policy denies them.",
        "One thing: at 18:40 on Tuesday, 1.1GB was written to a folder that syncs to her corporate OneDrive, and her personal phone is enrolled on that OneDrive as a registered device.",
      ],
      evidence: [
        {
          kind: "log",
          title: "The path nobody had blocked",
          lines: [
            "18:40:12  WRITE  /Users/jreyes/OneDrive-Company/Notes/  1.1 GB (7 archives)",
            "18:41:55  SYNC   OneDrive -> device 'Pixel-8-JR' (personal, enrolled 2023-05-02)",
            "18:44:03  SYNC   complete, 1.1 GB",
            "",
            "Archive names: pricing-v4.zip, rate-cards.zip, contracts-2025.zip, ...",
          ],
        },
      ],
      choices: [
        { label: "Wipe the corporate data on the personal device and involve legal", to: "legal", cost: 60 },
        { label: "Suspend everything first, then involve legal", to: "suspended", cost: 15 },
        { label: "Confront her directly", to: "end-confronted", cost: 30 },
      ],
    },
    {
      id: "narrow-suspend",
      mood: "tense",
      where: "The group membership",
      body: [
        "You remove her from eng-leads, which takes away /commercial and nothing else, so her actual job still works and she has no obvious signal that anything changed.",
        "You also notice, doing it, that eng-leads has nineteen members and grants access to the commercial folder for reasons nobody can now reconstruct.",
      ],
      choices: [
        { label: "Check whether anything already left", to: "egress", cost: 30 },
        { label: "Review the other eighteen members' access while you are here", to: "group-review", cost: 45 },
      ],
    },
    {
      id: "group-review",
      mood: "calm",
      where: "Nineteen people's access",
      body: [
        "Of the nineteen, four are in commercial roles and should be there. Twelve are engineers who have never opened it. Three have left the company and their accounts are disabled but still in the group.",
        "The group was created in 2021 to give two people access to one spreadsheet.",
      ],
      choices: [
        { label: "Fix the group, then go back to the incident", to: "egress", cost: 40 },
        { label: "Fix the group and treat the download as explained", to: "end-tidied-not-investigated", cost: 0 },
      ],
    },
    {
      id: "suspended",
      mood: "critical",
      where: "Her account, disabled at 09:45",
      body: [
        "Everything stops. She finds out within four minutes, because her laptop logs her out mid-sentence in a handover document she was writing for her replacement.",
        "If she took nothing, you have just accused a six-year employee in the most public way available. If she took something, it left on Tuesday and disabling the account on Wednesday changes nothing about that.",
      ],
      choices: [
        { label: "Now find out what actually happened, with legal in the room", to: "legal", cost: 45 },
        { label: "She is leaving anyway. Let HR handle the rest", to: "end-suspended-blind", cost: 0 },
      ],
    },
    {
      id: "monitored",
      mood: "tense",
      where: "Enhanced monitoring, silently",
      body: [
        "Full endpoint capture and file audit, with nobody told. This is a reasonable step and it has a legal shape: in this jurisdiction covert monitoring of a named employee needs a documented justification and, for anything beyond ordinary logging, HR and legal sign-off.",
        "You have not got either yet. Thursday's capture shows nothing new; Tuesday's 1.1GB had already gone.",
      ],
      choices: [
        { label: "Get it authorized properly and look at Tuesday instead", to: "egress", cost: 40 },
        { label: "Keep watching for the rest of her notice period", to: "end-watched-nothing", cost: 480 },
      ],
    },
    {
      id: "asked-manager",
      mood: "tense",
      where: "Her manager's office",
      body: [
        "He explains the CI cache immediately, which accounts for 38 of the 41 gigabytes and which you would have found yourself in twenty minutes.",
        "He also, without being asked, says that she had been complaining for a year that nobody would fix the rate cards, and that he is not surprised she looked at them.",
      ],
      choices: [
        { label: "Useful context. Now look at the remaining 2.9GB", to: "what-was-it", cost: 20 },
        { label: "That explains it. Close the alert", to: "end-explained-away", cost: 0 },
      ],
    },
    {
      id: "legal",
      mood: "recovering",
      where: "A room with HR and the general counsel",
      body: [
        "The selective wipe of corporate data on the enrolled personal device is authorized and executed. It removes the OneDrive container and nothing personal, which is exactly why the device was enrolled that way in 2023.",
        "Legal ask the only question that matters commercially: can you say what was in the seven archives, and can you say it in a way that stands up.",
      ],
      choices: [
        { label: "Yes: file hashes, access log and sync log all line up", to: "end-handled-properly", cost: 90 },
        { label: "Roughly, from the folder names", to: "end-thin-evidence", cost: 20 },
      ],
    },
  ],
  endings: [
    {
      id: "end-handled-properly",
      title: "Evidence first, action second",
      grade: "best",
      body: [
        "The 38GB is explained, the 2.9GB is documented, the sync to a personal device is proved with three independent logs, and the corporate container on that device is wiped under a policy she agreed to in 2023.",
        "She works her notice. The eng-leads group is fixed, which removes the same exposure for eighteen other people, three of whom had left the company.",
      ],
      lesson: [
        "The striking number was 93 percent build cache. Acting on it before looking would have been an accusation based on a CI artifact directory.",
        "Insider cases are won or lost on whether you can show what was taken, when, and by which route. Suspending the account first feels decisive and destroys the calm in which that work gets done.",
      ],
    },
    {
      id: "end-thin-evidence",
      title: "Folder names and a strong feeling",
      grade: "mixed",
      body: [
        "The device is wiped and she leaves. Six months later the competitor launches something that looks familiar, and the case rests on seven archive filenames.",
        "The file hashes were available on Wednesday and nobody recorded them.",
      ],
      lesson: [
        "Evidence has a shelf life. The logs that would have proved contents were rotated out ninety days later.",
      ],
    },
    {
      id: "end-tidied-not-investigated",
      title: "A much better access model",
      grade: "mixed",
      body: [
        "Nineteen people's access reviewed, twelve revocations, three ghost accounts removed. Genuinely good work.",
        "Nobody looked at whether the 2.9GB left the building, and it had, on Tuesday evening, to a personal phone.",
      ],
      lesson: [
        "Fixing the access that allowed something is not the same as finding out whether it happened. Both are needed, and the second one has a deadline set by log retention.",
      ],
    },
    {
      id: "end-explained-away",
      title: "The manager explained it",
      grade: "bad",
      body: [
        "38 of 41 gigabytes were innocent, which is true and is why the explanation was so convincing.",
        "The other 2.9GB was two directories she had never opened in six years, and it was on a personal phone by Tuesday evening.",
      ],
      lesson: [
        "A partial explanation that accounts for most of the volume is the most dangerous kind, because the residual looks like rounding.",
        "Check the explanation against the data rather than instead of it.",
      ],
    },
    {
      id: "end-suspended-blind",
      title: "Access removed on Wednesday",
      grade: "bad",
      body: [
        "She is locked out, publicly, on the strength of a number that was 93 percent build cache, and the material that did leave went on Tuesday evening regardless.",
        "The company loses the handover, the goodwill, and any chance of a quiet resolution, and gains nothing.",
      ],
      lesson: [
        "Disabling an account stops future access. It has no effect on anything that already left, and it converts an investigation into a dispute.",
      ],
    },
    {
      id: "end-confronted",
      title: "You asked her directly",
      grade: "bad",
      body: [
        "She denies it, ends the conversation, and factory resets her phone that evening.",
        "The selective wipe you had available on Wednesday morning would have removed the corporate container with the archives in it. There is now nothing to wipe and nothing to examine.",
      ],
      lesson: [
        "Confronting a subject before securing the evidence gives them the one thing you cannot get back: time to destroy it.",
      ],
    },
    {
      id: "end-watched-nothing",
      title: "Two weeks of covert monitoring",
      grade: "catastrophic",
      body: [
        "Eight days of full endpoint capture on a named employee, without HR or legal authorization, producing nothing because the event had already happened.",
        "It surfaces at her employment tribunal. The monitoring, not the download, is what the company has to answer for.",
      ],
      lesson: [
        "Covert monitoring of an individual is a legal act with legal requirements, and doing it without authorization converts your investigation into their case.",
        "It also looked forwards while the evidence was behind you.",
      ],
    },
  ],
};
