/**
 * Ten unit files and one systemctl command, ten times.
 *
 * Every case is a combination of ordering and requirement that people read as
 * one thing, and the answer is what systemd actually does with it. Nothing
 * here is exotic: all ten are shapes you find in production unit files, and
 * four of them are shapes that look correct and are not.
 *
 * The names are the real ones, because recognizing this in the wild means
 * recognizing postgresql.service rather than db.service.
 */

import type { Case } from "../types";

export const CASES: Case[] = [
  {
    slug: "after-is-not-requires",
    name: "After= on a unit nothing starts",
    brief:
      "The app declares After=postgresql.service and nothing else. Postgres is installed and not enabled. Somebody runs systemctl start app.service on a fresh box.",
    units: [
      {
        name: "app.service",
        description: "The application",
        type: "notify",
        after: ["postgresql.service"],
      },
      { name: "postgresql.service", description: "PostgreSQL database server", type: "notify" },
    ],
    start: ["app.service"],
    question: "What is running afterwards?",
    options: [
      { id: "both", claim: "Both, in order: postgres and then the app", says: { about: "active", units: ["app.service", "postgresql.service"] } },
      { id: "neither", claim: "Neither, because the dependency cannot be satisfied", says: { about: "inactive", unit: "app.service" } },
      { id: "alone", claim: "The app alone. Nothing pulls postgres into the transaction, so After= has nothing to be ordered against", says: { about: "not-pulled", unit: "postgresql.service" } },
      { id: "error", claim: "The app fails and systemctl reports a dependency error", says: { about: "nothing" } },
    ],
    why:
      "After= is ordering and only ordering. It takes effect when both units are in the same transaction and does nothing at all when the other unit is not being started. Nothing here pulls postgres in: not the app, which only orders itself against it, and not the boot, because the unit is not enabled. So the app starts on a box with no database, exactly as instructed, and the unit file looks like it says otherwise.",
    fix:
      "Add Requires=postgresql.service, or Wants= if the app can start degraded and retry. Then the directive that pulls it in and the directive that orders against it are both present, which is what people think After= is doing on its own.",
    breaks: "After= makes the other unit start",
  },
  {
    slug: "requires-without-after",
    name: "Requires= on a unit that fails, and the API came up anyway",
    brief:
      "The API declares Requires=redis.service and no ordering. Redis has a typo in its ExecStart and cannot run. Type=notify, so systemd notices.",
    units: [
      {
        name: "api.service",
        description: "The public API",
        type: "notify",
        requires: ["redis.service"],
      },
      { name: "redis.service", description: "Redis key value store", type: "notify", execWorks: false },
    ],
    start: ["api.service"],
    question: "What is running afterwards?",
    options: [
      { id: "api", claim: "The API is up and redis is not. Requires= blocks only when After= is set on the failing unit as well", says: { about: "active", units: ["api.service"] } },
      { id: "neither", claim: "Neither. Requires= means the API does not start without redis", says: { about: "inactive", unit: "api.service" } },
      { id: "ordered", claim: "Redis is started first, because Requires= implies ordering", says: { about: "ordered", before: "redis.service", after: "api.service" } },
      { id: "both", claim: "Both, because systemd retries a failed requirement", says: { about: "active", units: ["api.service", "redis.service"] } },
    ],
    why:
      "systemd.unit(5) puts a condition in the middle of the sentence: if one of the other units fails to activate, and an ordering dependency After= on the failing unit is set, this unit will not be started. Without After= the two are started at the same moment, so the API is already up by the time redis fails, and nothing goes back to reconsider it. The requirement was real and it was evaluated against a unit that had not failed yet.",
    fix:
      "Write both, always: Requires=redis.service and After=redis.service. Requires= alone is not a weaker version of the pair, it is a different behavior, and the difference only shows up on the day the dependency breaks.",
    breaks: "Requires= stops this unit when the required unit fails",
  },
  {
    slug: "both-of-them",
    name: "Both directives, and the failure stops where it should",
    brief:
      "The same shape as the last one with After= added. MariaDB cannot start: the data directory is on a volume that did not mount.",
    units: [
      {
        name: "web.service",
        description: "The web front end",
        type: "notify",
        requires: ["mariadb.service"],
        after: ["mariadb.service"],
      },
      { name: "mariadb.service", description: "MariaDB database server", type: "notify", execWorks: false },
    ],
    start: ["web.service"],
    question: "What is running afterwards?",
    options: [
      { id: "web", claim: "The web service, serving errors", says: { about: "active", units: ["web.service"] } },
      { id: "notpulled", claim: "Only the web service, because a failing unit is dropped from the transaction", says: { about: "not-pulled", unit: "mariadb.service" } },
      { id: "both", claim: "Both, with the web service retrying its connection", says: { about: "active", units: ["web.service", "mariadb.service"] } },
      { id: "neither", claim: "Neither. The database failed, the ordering held, and the web service was never tried", says: { about: "active", units: [] } },
    ],
    why:
      "This is the pair working. Requires=mariadb.service and After=mariadb.service, together: the ordering means the database's start is attempted and finished first, so its failure is known when the web service is considered, and the requirement means that failure blocks it. The reader gets one failed unit and one skipped unit rather than a running front end with nothing behind it, which is the outcome you want at three in the morning.",
    fix:
      "Nothing to fix. This is the shape to copy, and the reason to copy it is the previous case: the same file without After= starts the front end anyway.",
    breaks: "the two directives are interchangeable",
  },
  {
    slug: "wants-does-not-propagate",
    name: "Wants= and After=, and the failure is ignored on purpose",
    brief:
      "A nightly report wants the cache warm but does not need it. Wants=memcached.service and After=memcached.service. Memcached is out of memory and fails to start.",
    units: [
      {
        name: "report.service",
        description: "Nightly report generation",
        type: "oneshot",
        wants: ["memcached.service"],
        after: ["memcached.service"],
      },
      { name: "memcached.service", description: "Memcached", type: "notify", execWorks: false },
    ],
    start: ["report.service"],
    question: "What happens to the report?",
    options: [
      { id: "neither", claim: "It does not run. After= on a failed unit blocks it", says: { about: "active", units: [] } },
      { id: "runs", claim: "It runs, slowly, against the database. A failed Wants= has no effect on the transaction", says: { about: "active", units: ["report.service"] } },
      { id: "both", claim: "Both run, because After= promotes Wants= to a hard requirement", says: { about: "active", units: ["report.service", "memcached.service"] } },
      { id: "waits", claim: "It waits for memcached to come back and then runs", says: { about: "nothing" } },
    ],
    why:
      "Wants= and After= are as orthogonal as Requires= and After=. The ordering was honoured: memcached was started first, and it finished, unsuccessfully. The weak requirement then says that a listed unit failing has no impact on the validity of the transaction, so the report runs. This is the recommended shape for anything optional, and the cost is that a silent failure of the optional thing looks exactly like success.",
    fix:
      "Nothing, if the report really is fine without a cache. If it is not fine, Wants= is the wrong directive and the incident will be a slow report rather than a failed one, which is harder to notice.",
    breaks: "After= turns a weak requirement into a strong one",
  },
  {
    slug: "simple-reports-success",
    name: "systemctl start returned zero and the binary does not exist",
    brief:
      "The database unit is Type=simple, the default, and its ExecStart points at a path that was renamed in a package update. The app has Requires= and After= on it. Everything reports success.",
    units: [
      {
        name: "app.service",
        description: "The application",
        type: "notify",
        requires: ["influxdb.service"],
        after: ["influxdb.service"],
      },
      {
        name: "influxdb.service",
        description: "Time series database, ExecStart=/usr/bin/influxd (renamed to /usr/bin/influxd3)",
        type: "simple",
        execWorks: false,
      },
    ],
    start: ["app.service"],
    question: "What does systemd report, and what is actually running?",
    options: [
      { id: "blocked", claim: "The database fails and the app is not started, which is the pair working", says: { about: "inactive", unit: "app.service" } },
      { id: "unordered", claim: "The app starts before the database, because Type=simple carries no ordering", says: { about: "unordered", a: "app.service", b: "influxdb.service" } },
      { id: "reports", claim: "Both units active, and the database is not running. Type=simple calls a unit started once it has forked, before execve", says: { about: "active-not-running", unit: "influxdb.service" } },
      { id: "neither", claim: "Neither. systemd notices a missing binary and fails the unit", says: { about: "active", units: [] } },
    ],
    why:
      "systemd.service(5) is explicit that Type=simple considers the unit started immediately after the main service process has been forked off, before the new process has called execve, and that systemctl start will therefore report success even if the service's binary cannot be invoked. So the ordering held, the requirement held, both units are active, and the database was never running. Every directive in both files did exactly what it says.",
    fix:
      "Use Type=exec, which is the same as simple except that systemd waits for execve and so notices a missing binary or a User= that does not exist. Use Type=notify where the service supports it, which is the only type where active means ready to serve. simple is the default because it is the one that needs nothing from the service, not because it is the one you want.",
    breaks: "an active unit is a running service",
  },
  {
    slug: "requisite-is-not-pulled",
    name: "Requisite= on a unit nobody started",
    brief:
      "A signing service declares Requisite=vault.service and After=vault.service, on the reasoning that it should refuse to run without the vault rather than start it. Vault is not running.",
    units: [
      {
        name: "signer.service",
        description: "Artefact signing service",
        type: "notify",
        requisite: ["vault.service"],
        after: ["vault.service"],
      },
      { name: "vault.service", description: "Secret store", type: "notify" },
    ],
    start: ["signer.service"],
    question: "What happens?",
    options: [
      { id: "both", claim: "Both start. Requisite= pulls the vault in the way Requires= does", says: { about: "active", units: ["signer.service", "vault.service"] } },
      { id: "starts", claim: "The signer starts, because Requisite= is advisory", says: { about: "active", units: ["signer.service"] } },
      { id: "waits", claim: "The signer waits for the vault to appear", says: { about: "nothing" } },
      { id: "fails", claim: "The signer fails immediately and the vault is never started at all", says: { about: "not-pulled", unit: "vault.service" } },
    ],
    why:
      "Requisite= is the directive for exactly this reasoning and it does what the reasoning asks: the listed unit is not started, and if it is not already running the start fails immediately. So the intent was right and the outcome is a failed unit rather than a refusal to try, which is what refusing to try looks like. The After= is still worth having, because Requisite= does not imply ordering either, and without it the check races against a vault that is starting.",
    fix:
      "Nothing, if a hard refusal is what you want. If you want the vault brought up instead, that is Requires= with After=. The two directives encode opposite intentions and the difference is entirely in whether the dependency is pulled in.",
    breaks: "every requirement directive pulls the other unit in",
  },
  {
    slug: "bindsto-follows-it-down",
    name: "The mount went away and three units went with it",
    brief:
      "A file share is bound to the mount that holds its data, and a backup requires the share. The disk is pulled and systemd stops the mount unit.",
    units: [
      {
        name: "backup.service",
        description: "Nightly offsite backup",
        type: "oneshot",
        requires: ["share.service"],
        after: ["share.service"],
      },
      {
        name: "share.service",
        description: "SMB file share",
        type: "notify",
        bindsTo: ["mnt-data.mount"],
        after: ["mnt-data.mount"],
      },
      { name: "mnt-data.mount", description: "The data volume", type: "oneshot" },
    ],
    start: ["backup.service"],
    stop: ["mnt-data.mount"],
    question: "After the mount stops, what is left running?",
    options: [
      { id: "nothing", claim: "Nothing. The binding takes the share down and the backup's requirement takes it down too", says: { about: "active", units: [] } },
      { id: "share", claim: "The mount stops and the share keeps serving an empty directory", says: { about: "active", units: ["share.service", "backup.service"] } },
      { id: "backup", claim: "The share stops and the backup carries on, writing nothing", says: { about: "active", units: ["backup.service"] } },
      { id: "all", claim: "Everything keeps running. BindsTo= only affects starting", says: { about: "active", units: ["mnt-data.mount", "share.service", "backup.service"] } },
    ],
    why:
      "BindsTo= is Requires= plus a promise that this unit is never active without the other one, so when the mount goes the share is stopped rather than left pointing at an empty directory. Then the backup's Requires= propagates a stop, which it does with or without After=: that is the one thing a requirement does without needing an ordering. Three units down from one disk, and every step of it is a directive somebody wrote on purpose.",
    fix:
      "This is the shape to want for anything holding a filesystem open. The alternative, Requires= on a mount, leaves a service running against a directory that is no longer a mount point, quietly writing to the underlying disk. Which is a separate incident with its own article.",
    breaks: "a requirement only matters while a unit is starting",
  },
  {
    slug: "partof-is-one-way",
    name: "Stopping the worker did not stop the app, and that is the point",
    brief:
      "A worker declares PartOf=app.service so that restarting the app restarts the worker. Somebody stops the worker to debug it and expects the app to go with it.",
    units: [
      {
        name: "app.service",
        description: "The application",
        type: "notify",
        wants: ["worker.service"],
      },
      {
        name: "worker.service",
        description: "Background job worker",
        type: "notify",
        partOf: ["app.service"],
        after: ["app.service"],
      },
    ],
    start: ["app.service"],
    stop: ["worker.service"],
    question: "What is left running?",
    options: [
      { id: "nothing", claim: "Neither. PartOf= ties the two together", says: { about: "active", units: [] } },
      { id: "app", claim: "The app. PartOf= propagates downward from the app to the worker and never the other way", says: { about: "active", units: ["app.service"] } },
      { id: "restart", claim: "The worker restarts immediately, because PartOf= implies it", says: { about: "nothing" } },
      { id: "worker", claim: "The app stops and the worker keeps running", says: { about: "active", units: ["worker.service"] } },
    ],
    why:
      "PartOf= is deliberately one way: when systemd stops or restarts the listed unit the action propagates here, and changes to this unit do not affect the listed units. It is the directive for a worker that should follow its application around, and it says nothing whatsoever about what happens when you touch the worker. The other two lines here do the ordinary work: Wants=worker.service on the app is what pulls the worker in at all, and After=app.service on the worker is what keeps it from starting first. Reading it as a link between two units rather than as an arrow is how the debugging session ended with a half stopped application.",
    fix:
      "Nothing here is broken. If the two really should go down together, that is BindsTo= on the worker, which is a much stronger statement and worth making deliberately rather than by misreading PartOf=.",
    breaks: "PartOf= is a two way relationship",
  },
  {
    slug: "the-ordering-cycle",
    name: "Three units, three After= lines, and one deleted edge",
    brief:
      "The firewall goes after the network target, the network target goes after the VPN, and the VPN goes after the firewall. All three are wanted by a boot target. Nobody noticed until a reboot took a different path.",
    units: [
      {
        name: "boot-extras.target",
        description: "Local additions to the boot",
        type: "oneshot",
        wants: ["firewall.service", "network-online.target", "vpn.service"],
      },
      { name: "firewall.service", description: "nftables rules", type: "oneshot", after: ["network-online.target"] },
      { name: "network-online.target", description: "Network is up", type: "oneshot", after: ["vpn.service"] },
      { name: "vpn.service", description: "Site to site tunnel", type: "notify", after: ["firewall.service"] },
    ],
    start: ["boot-extras.target"],
    question: "What does systemd do with the ordering?",
    options: [
      { id: "refuses", claim: "It refuses the transaction and none of the three starts", says: { about: "active", units: [] } },
      { id: "target", claim: "Only the boot target starts; the three on the loop are skipped", says: { about: "active", units: ["boot-extras.target"] } },
      { id: "error", claim: "systemctl start returns non-zero and the boot fails", says: { about: "nothing" } },
      { id: "breaks", claim: "It deletes one ordering edge to break the loop, logs that it did, and starts them in whatever order that leaves", says: { about: "cycle" } },
    ],
    why:
      "The three are pulled in by Wants= on the boot target, so all of them are in one transaction, which is the precondition for any of the After= lines to mean anything. systemd then breaks ordering cycles rather than refusing them. It deletes one edge, logs 'Found ordering cycle' with the units on it and 'Job ... deleted to break ordering cycle starting with ...', and carries on. Which edge it picks is not something the unit files determine, so the boot works until the day it does not, and the failure looks like a service that started too early rather than like a configuration error.",
    fix:
      "Grep the journal for 'ordering cycle' on any machine whose boot is intermittently wrong. Then take the loop apart: network-online.target is almost always the wrong thing for a service to wait on, and the firewall wanting to be up before the network rather than after it is usually the edge to reverse.",
    breaks: "a dependency loop is refused rather than resolved arbitrarily",
  },
  {
    slug: "requirement-is-not-order",
    name: "Requires= with nothing to say about when",
    brief:
      "A queue worker declares Requires=rabbitmq.service. Both units start cleanly. The worker logs a connection refused on boot and works fine on a manual restart.",
    units: [
      {
        name: "queue-worker.service",
        description: "Job queue consumer",
        type: "notify",
        requires: ["rabbitmq.service"],
      },
      { name: "rabbitmq.service", description: "RabbitMQ broker", type: "notify" },
    ],
    start: ["queue-worker.service"],
    question: "When does the worker start, relative to the broker?",
    options: [
      { id: "together", claim: "At the same time. Requires= says whether, After= says when, and nothing in these files says when", says: { about: "unordered", a: "queue-worker.service", b: "rabbitmq.service" } },
      { id: "broker", claim: "After the broker, because Requires= implies it", says: { about: "ordered", before: "rabbitmq.service", after: "queue-worker.service" } },
      { id: "worker", claim: "Before the broker, because it was the unit named on the command line", says: { about: "ordered", before: "queue-worker.service", after: "rabbitmq.service" } },
      { id: "alone", claim: "The broker is not started at all", says: { about: "active", units: ["queue-worker.service"] } },
    ],
    why:
      "The manual says it in one line: requirement dependencies do not influence the order in which services are started or stopped. Both units go into the transaction, nothing orders them, and systemd starts them in parallel. The connection refused on boot and the clean manual restart are the same fact: on a manual restart the broker is already up, so the race is one the worker happens to win.",
    fix:
      "Add After=rabbitmq.service. And then read the broker's Type=: with notify it means the broker is ready, and with simple it means only that a process was forked, which is a different race with the same symptom.",
    breaks: "a requirement implies an order",
  },
];
