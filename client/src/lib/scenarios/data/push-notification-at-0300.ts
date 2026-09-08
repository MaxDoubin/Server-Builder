import type { Scenario } from "../types";

/** MFA fatigue: the second factor works perfectly and the human is the flaw. */
export const pushNotificationAt0300: Scenario = {
  slug: "push-notification-at-0300",
  title: "Approve? Approve? Approve?",
  tagline: "Forty-one push prompts between 03:02 and 03:19. One of them was approved.",
  difficulty: "medium",
  category: "Identity",
  role: "You run identity for a 2,000-seat university. The account is a research administrator with access to the grants system and, through an old group, the HR share.",
  clockStart: "Thursday 08:40",
  brief: [
    "A user emails at 08:35: 'My phone was going mad at 3am, sorry if I approved something, I was asleep.'",
    "Your MFA provider's log shows forty-one push requests to her device in seventeen minutes. Number thirty-eight was approved.",
  ],
  start: "the-report",
  reading: [
    { label: "SSH keys, and why possession beats a prompt", href: "/blog/ssh-key-based-authentication" },
    { label: "Hardening the accounts nobody rotates", href: "/blog/linux-server-hardening" },
  ],
  scenes: [
    {
      id: "the-report",
      mood: "tense",
      where: "The identity provider's sign-in log",
      body: [
        "The password was correct on the first attempt, which means it was known before any of this started.",
        "The pushes came from a datacentre range in another country. The approval came from her phone, on the campus network, at 03:14.",
      ],
      evidence: [
        {
          kind: "log",
          title: "Sign-in log, r.okafor",
          lines: [
            "03:02:11  MFA push sent    198.18.44.7   FAILED   user did not respond",
            "03:02:41  MFA push sent    198.18.44.7   FAILED   user denied",
            "03:03:12  MFA push sent    198.18.44.7   FAILED   user did not respond",
            "  ... 34 more, 25 to 40 seconds apart ...",
            "03:14:52  MFA push sent    198.18.44.7   SUCCESS  approved",
            "03:14:53  Sign-in SUCCESS  198.18.44.7   session token issued",
            "03:15:40  New MFA method registered: authenticator app (device: unknown)",
            "03:16:02  Mailbox rule created: 'move messages containing security to RSS'",
          ],
        },
      ],
      choices: [
        { label: "Revoke every session and reset the password immediately", to: "revoked", cost: 3 },
        { label: "Disable the account outright", to: "disabled", cost: 2 },
        { label: "Read what the session did before you close it", to: "watch-first", cost: 25 },
        { label: "Ask her whether she definitely approved it", to: "asked-user", cost: 15 },
      ],
    },
    {
      id: "revoked",
      mood: "recovering",
      where: "Sessions, tokens and enrolled devices",
      body: [
        "Sessions killed, password reset, and, crucially, the authenticator app registered at 03:15 removed. Skipping that last step leaves them a permanent second factor of their own.",
        "The mailbox rule created at 03:16 is still there, and its whole purpose is to hide the notification emails you are about to send.",
      ],
      choices: [
        { label: "Remove the rule and audit what the session touched", to: "audit", cost: 40 },
        { label: "That is the account secured. Move on", to: "end-secured-not-scoped", cost: 0 },
      ],
    },
    {
      id: "disabled",
      mood: "recovering",
      where: "The directory",
      body: [
        "The account is disabled, which stops everything, including her ability to work and your ability to see what happens next.",
        "It does not remove the authenticator app they enrolled. Re-enable the account in a week without checking, and they walk straight back in with a factor of their own.",
      ],
      choices: [
        { label: "Remove the enrolled device, then audit", to: "audit", cost: 35 },
        { label: "Leave it disabled until she is back on Monday", to: "end-left-disabled", cost: 0 },
      ],
    },
    {
      id: "watch-first",
      mood: "critical",
      where: "The audit stream, live",
      body: [
        "Watching a live intruder is a legitimate technique and it needs a decision made in advance about when you stop. You did not make one.",
        "In the twenty-five minutes you watch, they download the grants pipeline, enumerate the HR share, and forward 1,100 messages to an external address.",
      ],
      choices: [
        { label: "Cut it now", to: "revoked", cost: 3 },
        { label: "Keep watching, you are learning a lot", to: "end-watched-too-long", cost: 90 },
      ],
    },
    {
      id: "asked-user",
      mood: "tense",
      where: "On the phone to a tired administrator",
      body: [
        "She says she pressed something to make it stop. She is embarrassed, which is worth heading off: this is a design failure, not a discipline failure.",
        "Fifteen minutes have passed. The session is still live.",
      ],
      choices: [
        { label: "Revoke now, apologise later", to: "revoked", cost: 3 },
        { label: "Ask her to change her own password when she gets in", to: "end-user-handled", cost: 120 },
      ],
    },
    {
      id: "audit",
      mood: "tense",
      where: "The activity log for that session",
      body: [
        "Eleven minutes of activity. A mailbox rule, an OAuth grant to an app called 'Mail Backup Pro', 340 files read from the grants share, and a directory query listing every account with the same group membership.",
        "The OAuth grant is the one that matters: it survives a password reset and a session revoke, because it is not either of those things.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Consented application",
          lines: [
            "App:        Mail Backup Pro",
            "Publisher:  unverified",
            "Consented:  03:17:44 by r.okafor",
            "Scopes:     Mail.ReadWrite, Mail.Send, offline_access, Files.Read.All",
            "Refresh token issued: yes  (valid 90 days, survives password reset)",
          ],
        },
      ],
      choices: [
        { label: "Revoke the grant, then look at the remembered device too", to: "remembered-device", cost: 20 },
        { label: "Revoke the grant, then look for the same app across the tenant", to: "tenant-sweep", cost: 45 },
        { label: "Revoke the grant for this user", to: "end-grant-revoked", cost: 10 },
      ],
    },
    {
      id: "remembered-device",
      mood: "tense",
      where: "The enrolled factors on the account",
      body: [
        "The sign-in log says MFA was satisfied by a remembered device enrolled in February 2024, which means the forty-one pushes were not the only route in: they were the noisy one.",
        "A remembered device is a cookie with a long lifetime. Nothing about resetting a password touches it.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Enrolled factors, r.okafor",
          lines: [
            "FACTOR                     ENROLLED      LAST USED",
            "Push (iOS, personal)       2023-09-11    2026-09-10 03:14",
            "Remembered device          2024-02-03    2026-09-12 04:40",
            "Authenticator app          2026-09-10 03:15   never   <-- theirs",
            "",
            "Tenant setting: remember MFA on trusted devices = 90 days",
          ],
        },
      ],
      choices: [
        { label: "Revoke every remembered device on the account and sweep the tenant", to: "tenant-sweep", cost: 30 },
        { label: "Revoke this one and carry on", to: "end-grant-revoked", cost: 8 },
      ],
    },

    {
      id: "tenant-sweep",
      mood: "tense",
      where: "Enterprise applications",
      body: [
        "Nine other accounts have consented to the same unverified app over the past five months. None of them reported anything, because for them nothing went wrong: they were phished once, consented, and their mail has been readable ever since.",
        "User consent for unverified apps is on by default in this tenant.",
      ],
      choices: [
        { label: "Revoke all ten, turn off user consent, and move to number matching", to: "end-fixed-the-class", cost: 180 },
        { label: "Revoke all ten and leave the settings", to: "end-revoked-ten", cost: 60 },
      ],
    },
  ],
  endings: [
    {
      id: "end-fixed-the-class",
      title: "One account, ten grants, and the setting behind them",
      grade: "best",
      body: [
        "Session and password dealt with in three minutes. The enrolled authenticator removed, the mailbox rule deleted, the OAuth grant revoked, and nine other accounts found carrying the same grant.",
        "User consent for unverified publishers is turned off, and push approval is replaced with number matching, so a sleeping person cannot approve anything by pressing the thing that makes it stop.",
      ],
      lesson: [
        "MFA worked exactly as designed. It asked, and a human asleep at three in the morning said yes on the thirty-eighth ask. Number matching removes the failure mode by requiring information from the screen you are actually looking at.",
        "A password reset does not revoke an OAuth refresh token, and neither does killing sessions. It is a separate object with a separate lifetime, and it is the one attackers reach for precisely because remediation forgets it.",
      ],
    },
    {
      id: "end-revoked-ten",
      title: "Ten grants gone, the door still open",
      grade: "good",
      body: [
        "Every instance of the malicious app is revoked and the compromised account is clean.",
        "Any user can still consent to any unverified application, and push approval is still a single button at three in the morning. The eleventh consent happens in November.",
      ],
      lesson: [
        "Revoking the instances you found is necessary and does nothing about the mechanism. Two settings changes prevent the entire class.",
      ],
    },
    {
      id: "end-grant-revoked",
      title: "This user is clean",
      grade: "mixed",
      body: [
        "The account is fully remediated: sessions, password, enrolled factor, mailbox rule and OAuth grant.",
        "Nine other people in the same tenant have the same app installed, from the same campaign, and nobody has looked.",
      ],
      lesson: [
        "The question after any consent-phishing finding is 'who else consented to this app', and it is one query.",
      ],
    },
    {
      id: "end-secured-not-scoped",
      title: "Password changed, tokens live",
      grade: "bad",
      body: [
        "Sessions revoked and the password reset, which feels complete and is not.",
        "The OAuth refresh token granted at 03:17 keeps working for ninety days. Mail continues to be read for eleven weeks, and the mailbox rule keeps hiding the alerts that would have said so.",
      ],
      lesson: [
        "The three things that survive a password reset are OAuth grants, application passwords, and enrolled second factors. All three were used here and none of them are visible on the account's main page.",
      ],
    },
    {
      id: "end-left-disabled",
      title: "Disabled until Monday",
      grade: "bad",
      body: [
        "The account is off, so nothing more happens through it, and a research administrator loses four working days at a grant deadline.",
        "The enrolled authenticator is still registered when it is re-enabled, and the OAuth grant never stopped working at all.",
      ],
      lesson: [
        "Disabling stops interactive sign-in and nothing else. Tokens already issued keep working, because that is what tokens are for.",
      ],
    },
    {
      id: "end-user-handled",
      title: "She will change it when she gets in",
      grade: "catastrophic",
      body: [
        "The session stayed live for another two hours. In that time the grants pipeline, the HR share and 1,100 forwarded messages left the tenant.",
        "The mailbox rule meant she never saw the security notifications, so nobody escalated until the following week.",
      ],
      lesson: [
        "Containment is never the compromised user's job. They are asleep, embarrassed, or in a meeting, and the account is still signed in the whole time.",
      ],
    },
    {
      id: "end-watched-too-long",
      title: "You learned a great deal",
      grade: "catastrophic",
      body: [
        "Ninety minutes of high quality observation, a complete picture of the tooling, and the entire grants pipeline plus the HR share exfiltrated while you took notes.",
        "Watching an intruder is a real technique. It requires a stop condition agreed before you start, and an owner who can say 'cut it now'. Neither existed here.",
      ],
      lesson: [
        "Observation without a pre-agreed stop condition is not intelligence gathering, it is an outage you are watching happen.",
        "The condition is usually simple: cut on any access to a named sensitive system, or after N minutes, whichever comes first.",
      ],
    },
  ],
};
