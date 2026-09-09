import type { Scenario } from "../types";

/** A schema migration that reported success and destroyed data quietly. */
export const theMigrationThatSucceeded: Scenario = {
  slug: "the-migration-that-succeeded",
  title: "The Migration That Succeeded",
  tagline: "It ran in 4.1 seconds, reported success, and set 380,000 rows to null.",
  difficulty: "hard",
  category: "Data",
  role: "You are the on-call engineer for a booking platform. The migration was reviewed by two people and ran in last night's release.",
  clockStart: "Thursday 10:12",
  brief: [
    "Support have four tickets from customers whose booking notes have vanished. The bookings themselves are intact.",
    "Last night's release included a migration that renamed a column. It reported success.",
  ],
  start: "the-tickets",
  reading: [
    { label: "Point in time recovery with the write-ahead log", href: "/blog/wal-point-in-time-recovery" },
    { label: "Read replicas and replication lag", href: "/blog/read-replicas-replication-lag" },
    { label: "The 3-2-1 rule", href: "/blog/backup-strategy-321-rule" },
  ],
  scenes: [
    {
      id: "the-tickets",
      mood: "critical",
      where: "psql on the primary",
      body: [
        "The migration added a new column, copied data into it with a transform, and dropped the old one. The transform used a regex that matched nothing for any note that did not start with a capital letter.",
        "Those rows got null, the copy reported success because it was a valid UPDATE, and the old column was dropped in the same transaction.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The damage, and the migration",
          lines: [
            "SELECT count(*) FROM bookings WHERE notes IS NULL;",
            " 380412",
            "SELECT count(*) FROM bookings;",
            " 1204889",
            "",
            "-- migration 0141_rename_notes.sql",
            "ALTER TABLE bookings ADD COLUMN notes text;",
            "UPDATE bookings SET notes = substring(note_text from '^[A-Z].*');",
            "ALTER TABLE bookings DROP COLUMN note_text;",
            "",
            "Ran 03:14:07, completed 03:14:11. Exit 0.",
          ],
        },
      ],
      choices: [
        { label: "Stop writes to the table before anything else", to: "froze", cost: 4 },
        { label: "Restore the whole database from last night's backup", to: "full-restore", cost: 20 },
        { label: "Work out what recovery options exist before touching anything", to: "options", cost: 12 },
        { label: "Write a reverse migration to put the data back", to: "end-reverse-migration", cost: 25 },
      ],
    },
    {
      id: "froze",
      mood: "tense",
      where: "Application in read-only mode",
      body: [
        "Writes to bookings are stopped at the application. Seven hours of new bookings since the migration are preserved and no further edits can complicate the recovery.",
        "The site is degraded rather than down, which buys you the time to do this properly.",
      ],
      choices: [
        { label: "Now work out the recovery options", to: "options", cost: 12 },
        { label: "Restore the full database from backup", to: "full-restore", cost: 20 },
      ],
    },
    {
      id: "options",
      mood: "tense",
      where: "Counting what exists",
      body: [
        "Three things could hold the old column: last night's logical backup at 02:00, the WAL archive, and the read replica, which is 40 seconds behind and therefore also has the drop.",
        "The backup is twelve minutes before the migration. The WAL archive goes back nine days, which means point in time recovery to 03:14:06 is available.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "What you have",
          lines: [
            "pg_basebackup  2026-09-17 02:00:04   (12 min before the migration)",
            "WAL archive    continuous, 9 days retained, verified restorable weekly",
            "replica-1      streaming, lag 40s, has the drop",
            "",
            "New bookings since 03:14: 4,118 rows",
            "Edits to existing bookings since 03:14: 902 rows",
          ],
        },
      ],
      choices: [
        { label: "PITR into a scratch instance, extract the column, merge it back", to: "pitr", cost: 90 },
        { label: "Restore the primary to 03:14:06 and lose seven hours", to: "full-restore", cost: 40 },
        { label: "Take the 02:00 backup, extract the column from that", to: "backup-extract", cost: 60 },
      ],
    },
    {
      id: "pitr",
      mood: "tense",
      where: "A scratch instance at 03:14:06",
      body: [
        "The scratch instance restores and replays WAL to one second before the migration. note_text is there, complete, for all 1.2 million rows.",
        "Now the merge: copy note_text into notes only where notes is null, so nothing written since the migration is overwritten.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "The merge, and the check first",
          lines: [
            "-- on the scratch instance",
            "SELECT count(*) FROM bookings WHERE note_text IS NOT NULL;  -- 1198004",
            "",
            "-- dump just what is needed",
            "\\copy (SELECT id, note_text FROM bookings) TO 'notes.csv' CSV",
            "",
            "-- on the primary, into a staging table first",
            "UPDATE bookings b SET notes = s.note_text",
            "  FROM notes_staging s",
            " WHERE b.id = s.id AND b.notes IS NULL;",
            "-- 380412 rows",
          ],
        },
      ],
      choices: [
        { label: "Run the merge, verify counts, then unfreeze", to: "verified", cost: 40 },
        { label: "Run the merge without the IS NULL guard, it is simpler", to: "end-overwrote-new", cost: 20 },
      ],
    },
    {
      id: "backup-extract",
      mood: "tense",
      where: "The 02:00 logical backup",
      body: [
        "The backup restores and has note_text. It is twelve minutes older than the migration, so it is missing any note written between 02:00 and 03:14.",
        "That window contains 41 bookings, all of them overnight bookings from one large corporate customer.",
      ],
      choices: [
        { label: "Use PITR instead so the gap is one second, not twelve minutes", to: "pitr", cost: 60 },
        { label: "Merge from the backup and accept the 41", to: "end-lost-41", cost: 40 },
      ],
    },
    {
      id: "verified",
      mood: "recovering",
      where: "The counts",
      body: [
        "Nulls down from 380,412 to 6,885, which matches the number of bookings that genuinely had no note before the migration. The 4,118 new bookings and 902 edits since 03:14 are untouched.",
        "Writes are re-enabled at 12:40. Total impact: notes missing for two and a half hours, no data lost.",
      ],
      choices: [
        { label: "Work out why review and CI both passed this", to: "root-cause", cost: 60 },
        { label: "Recovered. Write the incident up and move on", to: "end-recovered-only", cost: 0 },
      ],
    },
    {
      id: "root-cause",
      mood: "calm",
      where: "The pipeline that let it through",
      body: [
        "CI ran the migration against a seeded test database of 40 rows, all of which had notes starting with a capital letter, because the seed data was written by hand by someone being tidy.",
        "The review looked at the SQL and both reviewers read the regex as 'the whole string'. Neither read it as a filter, because in a substring call it does not look like one.",
      ],
      choices: [
        { label: "Make CI run migrations against a production-shaped dataset, and forbid drop in the same migration as a copy", to: "end-fixed-the-class", cost: 240 },
        { label: "Add a review checklist item about regexes", to: "end-checklist", cost: 30 },
      ],
    },
    {
      id: "full-restore",
      mood: "critical",
      where: "Restoring the whole database",
      body: [
        "A full restore to 03:14:06 puts note_text back for everyone and removes the 4,118 bookings taken since, along with 902 edits.",
        "Those bookings exist in the real world. People are turning up for them.",
      ],
      choices: [
        { label: "Stop, and recover just the column from a point in time copy", to: "pitr", cost: 25 },
        { label: "Restore, and rebuild the seven hours from the application logs", to: "end-full-restore", cost: 300 },
      ],
    },
  ],
  endings: [
    {
      id: "end-fixed-the-class",
      title: "Every note back, and the pipeline that missed it",
      grade: "best",
      body: [
        "Writes frozen at 10:16, recovery plan chosen from the evidence, PITR to one second before the migration, guarded merge, verified counts, unfrozen at 12:40. Nothing lost.",
        "CI now runs migrations against an anonymised production-shaped dataset, and a destructive statement in the same migration as a data copy fails the build.",
      ],
      lesson: [
        "The migration reported success because it did exactly what it said. An UPDATE that matches nothing is not an error, and a regex in a substring call silently returns null rather than complaining.",
        "Freezing writes first is what made the rest cheap: without it every minute of recovery work is a minute of new data you have to reconcile.",
      ],
    },
    {
      id: "end-checklist",
      title: "A new line on the checklist",
      grade: "good",
      body: [
        "Full recovery and a review checklist item about regular expressions in migrations.",
        "CI still validates migrations against forty tidy rows, so the next migration whose behavior depends on the shape of real data passes exactly the same way.",
      ],
      lesson: [
        "Checklists catch what people remember to look for. The test data was the actual gap, and it is the one thing that would have failed the build automatically.",
      ],
    },
    {
      id: "end-recovered-only",
      title: "Everything back by lunchtime",
      grade: "good",
      body: [
        "A clean, well-executed recovery with no data lost and two and a half hours of degraded service.",
        "Nobody looked at why two reviewers and a green CI run let it through, so the next migration is reviewed the same way against the same forty rows.",
      ],
      lesson: [
        "Recovering the data ends the incident. The pipeline that shipped it is unchanged.",
      ],
    },
    {
      id: "end-lost-41",
      title: "Forty-one notes, gone",
      grade: "mixed",
      body: [
        "1.2 million notes recovered from the 02:00 backup, and the 41 written between 02:00 and 03:14 are gone permanently.",
        "The WAL archive that would have closed that twelve minute gap was there the whole time, verified restorable, and never used.",
      ],
      lesson: [
        "A backup gives you a point. Continuous archiving gives you any point, which for a mistake with a known timestamp means losing one second instead of twelve minutes.",
      ],
    },
    {
      id: "end-overwrote-new",
      title: "The merge without the guard",
      grade: "bad",
      body: [
        "380,412 rows restored, and 902 notes edited since the migration overwritten with their pre-migration text.",
        "Those 902 are invisible: the rows have notes, they are just the wrong ones, and nobody will notice until a customer disputes something months from now.",
      ],
      lesson: [
        "A recovery UPDATE without a guard clause is a second data loss wearing the first one's clothes.",
        "Restore into a staging table, verify the row counts you expect, then merge with an explicit condition.",
      ],
    },
    {
      id: "end-full-restore",
      title: "Seven hours rolled back",
      grade: "bad",
      body: [
        "Every note is back and 4,118 bookings have ceased to exist, along with 902 edits.",
        "Rebuilding them from application logs takes two people three days and is about 94 percent accurate, which for bookings means roughly 250 people arriving for something the system does not know about.",
      ],
      lesson: [
        "Restoring the whole database to fix one column trades a known small loss for a large one. The column was recoverable on its own from the same backup.",
      ],
    },
    {
      id: "end-reverse-migration",
      title: "A reverse migration",
      grade: "catastrophic",
      body: [
        "You write a migration that re-adds note_text and copies notes back into it, which restores the column and leaves 380,412 of them null, because the data was never in notes to begin with.",
        "It also runs on the primary against live traffic, and the twenty minutes spent writing it are twenty minutes of further edits on top of the damage.",
      ],
      lesson: [
        "A reverse migration reverses the schema. It cannot reverse a transform that discarded the input, and here the input was dropped in the same transaction.",
        "Dropped data comes back from a backup or a WAL archive. There is no third option.",
      ],
    },
  ],
};
