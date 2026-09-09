import type { Scenario } from "../types";

/**
 * A live credential pushed to a public repository.
 *
 * The whole scenario turns on one fact people reliably get wrong: deleting
 * the commit does not delete the secret. It is in the reflog, in every clone,
 * in forks, and in the GitHub events API, and automated scrapers read that
 * API within seconds. Rotation is the only fix, and everything else is
 * housekeeping done afterwards.
 */
export const keyInTheRepo: Scenario = {
  slug: "key-in-the-repo",
  title: "It Is Only a Test Key",
  tagline: "A live cloud credential goes to a public repository at 11:04.",
  difficulty: "easy",
  category: "Secrets",
  role: "You are a second-year apprentice developer. You pushed a branch fifteen minutes ago and a bot has just opened an issue on your own repository.",
  clockStart: "Wednesday 11:19",
  brief: [
    "You pushed a small fix to the public repository the team uses for its deployment examples.",
    "GitHub's secret scanning has opened an alert. The file you added, config.example.yml, contains a real AWS access key, not a placeholder, because you copied it out of your working config and forgot to blank it.",
  ],
  start: "the-alert",
  reading: [
    { label: "Keeping secrets when the team has no vault", href: "/blog/secrets-without-a-vault-team" },
    { label: "Hardening a Linux server, including the accounts nobody rotates", href: "/blog/linux-server-hardening" },
  ],
  scenes: [
    {
      id: "the-alert",
      mood: "critical",
      where: "The repository, on your phone",
      body: [
        "The alert names the file, the line and the key prefix. The commit is fifteen minutes old and the repository has 340 stars.",
      ],
      evidence: [
        {
          kind: "alert",
          title: "Secret scanning alert",
          lines: [
            "Secret type:  Amazon AWS Access Key ID and Secret Access Key",
            "Location:     config.example.yml:14",
            "Commit:       a91f3c2  \"add deployment example config\"",
            "Pushed:       11:04 (15 minutes ago)",
            "Validity:     ACTIVE (verified against the provider)",
          ],
        },
      ],
      choices: [
        {
          label: "Revoke the key in AWS, right now, before anything else",
          to: "revoked",
          cost: 2,
        },
        {
          label: "Delete the commit and force push, so the key is not there any more",
          to: "force-pushed",
          cost: 3,
        },
        {
          label: "Make the repository private while you think",
          to: "made-private",
          cost: 2,
        },
        {
          label: "It is a test account with nothing in it. Fix the file in the next commit",
          to: "end-left-it-live",
          cost: 5,
        },
      ],
    },

    {
      id: "revoked",
      mood: "recovering",
      where: "The AWS console",
      body: [
        "The key is deactivated and then deleted. Anything holding it now gets an InvalidClientTokenId, which includes your own laptop and, it turns out, a scheduled job.",
        "The exposure window was fifteen minutes and twenty seconds.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "CloudTrail, filtered to that access key",
          lines: [
            "TIME      EVENT                SOURCE IP        RESULT",
            "11:04:41  GetCallerIdentity    45.153.160.132   Success",
            "11:04:43  ListBuckets          45.153.160.132   Success",
            "11:04:44  ListUsers            45.153.160.132   AccessDenied",
            "11:04:46  DescribeInstances    45.153.160.132   AccessDenied",
            "11:05:02  ListObjectsV2        45.153.160.132   Success  (bucket: acme-deploy-artifacts)",
            "11:05:19  GetObject            45.153.160.132   Success  (14 objects)",
            "11:19:38  GetCallerIdentity    45.153.160.132   InvalidClientTokenId",
          ],
        },
      ],
      choices: [
        {
          label: "Work out exactly what they read in those fourteen minutes",
          to: "scoped-it",
          cost: 20,
        },
        {
          label: "Clean the git history so the key is not in the repo any more",
          to: "history-cleaned",
          cost: 25,
        },
        {
          label: "Find out what the key was doing for the rest of the estate",
          to: "the-nightly-job",
          cost: 10,
        },
        {
          label: "Key is dead, job done",
          to: "end-revoked-only",
          cost: 0,
        },
      ],
    },

    {
      id: "the-nightly-job",
      mood: "tense",
      where: "The CI logs, and your own laptop",
      body: [
        "Revoking it broke two things: your laptop, which you expected, and the nightly artifact upload, which you did not, because nobody knew it was using a human's personal access key rather than a role.",
        "That is the more interesting fact. A key that belongs to a person and is used by a machine is a key nobody rotates, because rotating it breaks something at 02:00 and the person who would notice is asleep.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Where that key was in use",
          lines: [
            "$ grep -rl AKIAI4Q7 --include='*.yml' --include='*.env' .",
            "ci/nightly-upload.yml",
            "ops/backup-to-s3.sh",
            "",
            "$ aws iam get-access-key-last-used --access-key-id AKIAI4Q7XXXXXXXXXXXX",
            "  LastUsedDate:  2026-09-08T02:00:11Z",
            "  ServiceName:   s3",
            "  Region:        eu-west-2",
            "",
            "  Key created:   2024-03-19   (903 days ago)",
          ],
        },
      ],
      choices: [
        {
          label: "Replace both with a scoped role, not another long-lived key",
          to: "escalated",
          cost: 60,
        },
        {
          label: "Issue a new access key and paste it into the same two places",
          to: "end-new-key-same-place",
          cost: 15,
        },
        {
          label: "Now look at what the exposed key was used for while it was live",
          to: "scoped-it",
          cost: 20,
        },
      ],
    },

    {
      id: "scoped-it",
      mood: "critical",
      where: "CloudTrail and the bucket inventory",
      body: [
        "Thirty-seven seconds after the push, someone in a hosting range you do not recognize used the key. They tried to list users and describe instances, were refused both, and then listed and downloaded fourteen objects from the deployment artifacts bucket.",
        "The fourteen objects are build tarballs. Two of them contain a .env file that was baked in by a Dockerfile step nobody reviewed.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "What was in the two artifacts",
          lines: [
            "$ tar tzf acme-web-2026.08.31.tar.gz | grep -i env",
            "app/.env",
            "",
            "$ tar xzf acme-web-2026.08.31.tar.gz -O app/.env",
            "DATABASE_URL=postgres://acme_app:REDACTED@db-prod-1.internal:5432/acme",
            "STRIPE_SECRET_KEY=sk_live_REDACTED",
            "SESSION_SECRET=REDACTED",
          ],
        },
      ],
      choices: [
        {
          label: "Rotate everything in those files too, and tell the team lead now",
          to: "escalated",
          cost: 30,
        },
        {
          label: "The database is not reachable from the internet, so only rotate Stripe",
          to: "end-partial-rotation",
          cost: 20,
        },
      ],
    },

    {
      id: "escalated",
      mood: "tense",
      where: "A call with the team lead",
      body: [
        "Stripe key rolled, database password changed, session secret rotated (which logs everybody out, which is noticed, which is fine).",
        "The team lead asks the question that turns this from an incident into a fix: why was a .env file inside a build artifact at all, and how many other artifacts have one?",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Scanning the bucket",
          lines: [
            "$ aws s3 ls s3://acme-deploy-artifacts/ --recursive | wc -l",
            "1184",
            "",
            "$ ./scan-artifacts.sh | grep -c 'contains .env'",
            "612",
          ],
        },
      ],
      choices: [
        {
          label: "Fix the Dockerfile, purge the bucket, and add a pre-commit secret scanner",
          to: "end-fixed-the-class",
          cost: 240,
        },
        {
          label: "Purge the affected artifacts and move on",
          to: "end-cleaned-artifacts",
          cost: 90,
        },
      ],
    },

    {
      id: "force-pushed",
      mood: "critical",
      where: "git push --force",
      body: [
        "The commit is gone from the branch. The alert stays open, because GitHub still has the object.",
        "So does every clone made in the last fifteen minutes, every fork, and the events API, which is what the scrapers read. The key was used thirty-seven seconds after the original push and is still working now.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The commit is still there",
          lines: [
            "$ git log --oneline -1",
            "7d41e08 add deployment example config",
            "",
            "$ curl -s https://api.github.com/repos/acme/deploy-examples/commits/a91f3c2 | head -3",
            "{",
            '  "sha": "a91f3c2f...",',
            '  "commit": {',
          ],
        },
      ],
      choices: [
        {
          label: "Revoke the key. The history was never the problem",
          to: "revoked",
          cost: 2,
        },
        {
          label: "Ask GitHub support to purge the object",
          to: "end-asked-support",
          cost: 45,
        },
        {
          label: "Make the repository private as well",
          to: "made-private",
          cost: 2,
        },
      ],
    },

    {
      id: "made-private",
      mood: "critical",
      where: "Repository settings",
      body: [
        "The repository is private. Nobody new can read it.",
        "Everyone who cloned it in the last fifteen minutes still has it, and the key is still active. Making it private also breaks the CI of four downstream projects that pulled the examples, which is how the rest of the team finds out.",
      ],
      choices: [
        {
          label: "Revoke the key, which is the only thing that actually helps",
          to: "revoked",
          cost: 2,
        },
        {
          label: "Wait to see whether the key gets used before revoking",
          detail: "It might be fine. Revoking will break the nightly job.",
          to: "end-waited",
          cost: 60,
        },
      ],
    },

    {
      id: "history-cleaned",
      mood: "recovering",
      where: "git filter-repo",
      body: [
        "The history is rewritten and the repository is force pushed. Everyone with a clone has to re-clone, which annoys four people for an afternoon.",
        "This is worth doing, and it is worth being clear that it did nothing about the exposure: the key was dead before you started.",
      ],
      choices: [
        {
          label: "Now look at what was accessed while the key was live",
          to: "scoped-it",
          cost: 20,
        },
        {
          label: "Add a pre-commit hook and a CI secret scan so the next one never lands",
          to: "end-prevented-next",
          cost: 60,
        },
      ],
    },
  ],

  endings: [
    {
      id: "end-fixed-the-class",
      title: "The key, the blast radius, and the reason",
      grade: "best",
      body: [
        "Key revoked in under a minute of noticing. The fourteen downloaded artifacts scoped from CloudTrail, the three secrets inside them rotated, and 612 artifacts with a baked-in .env purged from the bucket.",
        "The Dockerfile COPY that pulled .env into the image is fixed, the bucket gets a lifecycle rule, and a pre-commit hook plus a CI scan means the next person who does this is stopped before the push leaves their laptop.",
      ],
      lesson: [
        "Revocation is the only action that reduces exposure. Everything else, history rewriting, going private, deleting the branch, is housekeeping done afterwards.",
        "A leaked credential is a question, not an answer: what could it reach, and what did it reach. CloudTrail answered both in twenty minutes, and the answer was much worse than the key itself.",
      ],
    },
    {
      id: "end-prevented-next",
      title: "Revoked, cleaned, and gated",
      grade: "good",
      body: [
        "Key dead, history rewritten, pre-commit hook and CI scan in place. This will not happen again from this repository.",
        "Nobody looked at what the key was used for in the fourteen minutes it was live, so the fourteen artifacts that were downloaded, and the three live secrets inside two of them, are still valid.",
      ],
      lesson: [
        "Stopping the bleeding and preventing the next one are both right, and neither of them answers what happened while it was open.",
        "For any credential exposure the third question is always: what did it do. The provider's audit log is right there and it takes minutes.",
      ],
    },
    {
      id: "end-cleaned-artifacts",
      title: "Rotated and purged, cause left standing",
      grade: "mixed",
      body: [
        "Everything exposed is rotated and the affected artifacts are gone.",
        "The build still copies .env into the image, so the bucket has 40 new artifacts with live secrets in them by the end of the following week.",
      ],
      lesson: [
        "Cleaning up the instances of a problem while leaving the mechanism that creates them means doing the cleanup again, on a schedule you do not control.",
        "The fix here is one line in a Dockerfile and a .dockerignore.",
      ],
    },
    {
      id: "end-new-key-same-place",
      title: "A new key, in the same two files",
      grade: "mixed",
      body: [
        "The nightly job runs again and the laptop works. Everything is back to how it was, which is the problem: a personal long-lived key, in two files, used by a machine, that nobody will rotate until the next time it is published.",
        "The new key is 903 days younger than the old one and will be exactly as awkward to rotate in 2029.",
      ],
      lesson: [
        "Replacing a leaked long-lived credential with another long-lived credential in the same place fixes the leak and preserves the reason it was leakable.",
        "A machine should not hold a human's key. A scoped role with short-lived credentials removes the whole class: there is nothing to paste into a file, so there is nothing to commit.",
      ],
    },
    {
      id: "end-revoked-only",
      title: "Fast on the thing that mattered",
      grade: "good",
      body: [
        "Fifteen minutes and twenty seconds of exposure, then the key is gone. That is a good response time and it is the action that counts.",
        "The key was used at 11:04:41, thirty-seven seconds after the push, and nobody ever looked at what it did.",
      ],
      lesson: [
        "Revoking first is right. Stopping there assumes nothing happened in the window, and the window here was long enough for an automated scraper to find it, test it and use it three times.",
        "Public repositories are scraped continuously. Assume any secret pushed to one is used within a minute, and check.",
      ],
    },
    {
      id: "end-partial-rotation",
      title: "The database is not reachable from the internet",
      grade: "bad",
      body: [
        "Stripe rotated, database password left, because db-prod-1.internal is on a private subnet.",
        "Eleven days later the same credential is used from an EC2 instance in your own account, launched with a different set of stolen keys, and the reachability argument stops being true the moment the attacker is inside.",
      ],
      lesson: [
        "Network position is a control, not a reason to leave a known-exposed credential live. It is one layer, and it fails the moment anything else does.",
        "A credential that has been published is burned. Rotate all of them, including the boring one.",
      ],
    },
    {
      id: "end-asked-support",
      title: "Waiting for the object to be purged",
      grade: "bad",
      body: [
        "GitHub support reply within the hour and do remove the dangling object, which is a real and useful thing.",
        "It took an hour. The key was live for that hour, and it had already been used four times in the first two minutes. The key is the exposure; the object is a copy of a fact that is already out.",
      ],
      lesson: [
        "You cannot un-publish a secret. The instant a credential reaches a public place it should be treated as compromised, permanently, no matter what happens to the copy you can see.",
        "Every second spent trying to unsee it is a second the credential is still valid.",
      ],
    },
    {
      id: "end-waited",
      title: "It might be fine",
      grade: "catastrophic",
      body: [
        "By the time someone else notices, at 12:24, the key has listed and emptied the artifacts bucket, created two IAM users, and launched eleven GPU instances in four regions.",
        "The bill is nineteen thousand dollars and the two IAM users are still there.",
      ],
      lesson: [
        "The reason not to revoke is always the same: it will break something. It will. Breaking your own nightly job is a smaller problem than every problem on the other side of that decision.",
        "Automated scrapers monitor the public events feed continuously and test keys within seconds. There is no window in which waiting is the cautious option.",
      ],
    },
    {
      id: "end-left-it-live",
      title: "It is only a test account",
      grade: "catastrophic",
      body: [
        "The test account shared a VPC peering with production and had an IAM role it could assume for the artifacts bucket, which is where the deployment tarballs with .env files in them live.",
        "Nobody in the team could have told you that from memory, which is exactly the problem with the sentence 'it is only a test account'.",
      ],
      lesson: [
        "Nobody knows what a credential can reach until they check. 'It is only test' is a belief about a permissions graph nobody has looked at, and permissions graphs grow sideways.",
        "The check takes one command. Revoking takes one click. Neither is a reason to leave a verified-active key published.",
      ],
    },
  ],
};
