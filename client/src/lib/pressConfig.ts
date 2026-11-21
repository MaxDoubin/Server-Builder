/**
 * Press coverage, verified against the published article.
 *
 * Lives in its own module because the footer and the home page (both in the
 * entry chunk) need it, and everything else in siteConfig does not. While
 * PRESS sat inside siteConfig.ts, importing it from the entry kept that whole
 * module in the entry chunk, with every property a lazy page happened to read:
 * the leadership roles, the projects, the skill lists and, the moment any lazy
 * page read them, the achievements. Here the entry carries these few lines
 * and nothing else, and siteConfig loads with the pages that use it.
 *
 * siteConfig re-exports PRESS, so every other importer is unchanged.
 */
export const PRESS = {
  outlet: "Las Vegas Weekly",
  headline:
    "CCSD magnet programs and schools help prepare students for careers",
  author: "Shannon Miller",
  isoDate: "2026-07-30",
  displayDate: "July 30, 2026",
  url: "https://lasvegasweekly.com/news/2026/jul/30/ccsd-magnet-programs-and-schools-prepare-students/",
} as const;
