/**
 * Everything /accomplishments shows, derived from the site's other records.
 *
 * Nothing here states a fact. Every title, count, date and score comes from
 * siteConfig (achievements, leadership, projects, the Academics list and the
 * press story), timelineConfig (the year-by-year record) or certConfig (exam
 * certifications and training credentials), so a new certification, role or
 * result appears on this page the day it is added to its own record and no
 * count on it can drift. This file only decides which section an entry
 * belongs to, and the rules it uses are written next to each one.
 *
 * Lives in lib/ rather than in the page because the prerenderer renders the
 * same sections into the static HTML. It must stay out of the entry chunk:
 * the page that reads it is lazy, and nothing eager may import it.
 */
import { siteConfig, PRESS } from "./siteConfig";
import { TIMELINE_GROUPS } from "./timelineConfig";
import {
  CERTS_EARNED,
  CERTS_IN_PROGRESS,
  CREDENTIAL_GROUPS,
  type Cert,
  type CredentialGroup,
} from "./certConfig";

export { PRESS };

export type Achievement = (typeof siteConfig.achievements)[number];
export type Leadership = (typeof siteConfig.leadership)[number];
export type Project = (typeof siteConfig.projects)[number];

/* ------------------------------------------------------- certifications */

export const EARNED_CERTS: Cert[] = CERTS_EARNED;
export const IN_PROGRESS_CERTS: Cert[] = CERTS_IN_PROGRESS;

/* ------------------------------------------------- training credentials */

/**
 * Credential groups that are results rather than training from an issuer:
 * the competition placements and the AP scores. They have their own sections
 * here, so counting them as issuers would put them in two places.
 */
const NOT_AN_ISSUER = new Set(["competition", "academic"]);

/** Training credentials and badges, one group per issuer, as the certifications page orders them. */
export const ISSUER_GROUPS: CredentialGroup[] = CREDENTIAL_GROUPS.filter(
  (group) => !NOT_AN_ISSUER.has(group.id),
);

export const TRAINING_COUNT = ISSUER_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

export const BADGE_COUNT = ISSUER_GROUPS.reduce(
  (sum, group) => sum + group.items.filter((item) => group.badges?.[item]).length,
  0,
);

/* -------------------------------------------------------- achievements */

/**
 * The words that identify an issuer already covered by the certification data:
 * the first word of each exam's name and vendor, and of each credential
 * group's heading. An achievement that names one of them is the same fact as
 * a certification or a training credential, which have sections of their own
 * with the badge, so it is not listed a second time as an achievement.
 */
const ISSUER_WORDS = [
  ...new Set(
    [
      ...[...CERTS_EARNED, ...CERTS_IN_PROGRESS].flatMap((cert) => [cert.name, cert.vendor]),
      ...ISSUER_GROUPS.map((group) => group.heading),
    ]
      .map((text) => text.split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, ""))
      .filter((word) => word.length >= 4),
  ),
];

const ISSUER_PATTERN = new RegExp(`\\b(${ISSUER_WORDS.join("|")})\\b`, "i");

/*
 * Section rules, tried in order against an achievement's title. An
 * achievement none of them claims is recognition, which is the right place
 * for a new one to land until somebody gives it a more specific home.
 */
const MUSIC_PATTERN = /percussion|\bbands?\b|conservatory/i;
const COMPETITION_PATTERN = /\bplace\b|top 1 percent|high schools|risk assessment/i;

type Topic = "credential" | "music" | "competition" | "recognition";

function topicOf(achievement: Achievement): Topic {
  const text = `${achievement.title} ${achievement.description}`;
  if (ISSUER_PATTERN.test(text)) return "credential";
  if (MUSIC_PATTERN.test(achievement.title)) return "music";
  if (COMPETITION_PATTERN.test(achievement.title)) return "competition";
  return "recognition";
}

const byTopic = (topic: Topic): Achievement[] =>
  siteConfig.achievements.filter((achievement) => topicOf(achievement) === topic);

export const COMPETITION: Achievement[] = byTopic("competition");
export const MUSIC: Achievement[] = byTopic("music");
export const RECOGNITION: Achievement[] = byTopic("recognition");
/** Achievements that restate a certification or training credential, listed in those sections instead. */
export const COVERED_BY_CREDENTIALS: Achievement[] = byTopic("credential");

/* -------------------------------------------------- the other sections */

export const LEADERSHIP: Leadership[] = siteConfig.leadership;
export const PROJECTS: Project[] = siteConfig.projects;

/** The Academics list from siteConfig's "currently" groups: class, AP results, courses. */
export const ACADEMICS: string[] =
  siteConfig.currently.find((group) => /^academics/i.test(group.category))?.items ?? [];

/** Milestones on the timeline page, by year, newest first. */
export const YEARS = TIMELINE_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  count: group.entries.length,
}));
export const MILESTONE_COUNT = YEARS.reduce((sum, year) => sum + year.count, 0);

/* ---------------------------------------------------------------- stats */

export interface Stat {
  id: string;
  value: number;
  label: string;
  /** The section the figure counts, so each stat doubles as a jump link. */
  href: string;
}

export const STATS: Stat[] = [
  { id: "certs", value: EARNED_CERTS.length, label: "exam certifications earned", href: "#certifications" },
  { id: "training", value: TRAINING_COUNT, label: "training credentials and badges", href: "#training" },
  { id: "competition", value: COMPETITION.length, label: "competition and cybersecurity results", href: "#competition" },
  { id: "leadership", value: LEADERSHIP.length, label: "leadership and community roles", href: "#leadership" },
  { id: "recognition", value: RECOGNITION.length + MUSIC.length, label: "honors and recognitions", href: "#recognition" },
  { id: "projects", value: PROJECTS.length, label: "projects built", href: "#projects" },
];

/* ----------------------------------------------------------------- meta */

export const ACCOMPLISHMENTS_TITLE = "Accomplishments | Max Doubin";

/** Page description with its figures computed, shared by the page and the prerenderer. */
export function accomplishmentsDescription(): string {
  return (
    `Everything Max Doubin has accomplished: ${EARNED_CERTS.length} exam certifications, ` +
    `${TRAINING_COUNT} training credentials and badges, ${COMPETITION.length} competition and cybersecurity results, ` +
    `${LEADERSHIP.length} leadership roles, music honors, press and ${PROJECTS.length} projects.`
  );
}

export const ACCOMPLISHMENTS_PATH = "/accomplishments";
