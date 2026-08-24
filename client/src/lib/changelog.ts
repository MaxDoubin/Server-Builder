/**
 * What has actually changed on this site, in plain language.
 *
 * Every release below maps to real commits on the repository. The entries
 * are rewritten for a reader who does not work in software: they say what
 * changed for the person using the site, not which module was touched. The
 * dates are the dates the work landed, so several releases can share one.
 *
 * Adding a release: put it at the top. Keep entries honest. If something
 * shipped half-finished, say so rather than rounding it up to done.
 */

export interface ChangelogRelease {
  /** ISO date the work landed, YYYY-MM-DD. */
  date: string;
  /** Short human title for the batch. */
  title: string;
  /** One plain-language line per change. */
  entries: string[];
}

/** Newest first. The page groups these by month. */
export const CHANGELOG: ChangelogRelease[] = [
  {
    date: "2026-08-24",
    title: "Tools, a roadmap, and share cards",
    entries: [
      "Started a section of small browser tools for networking and security work, beginning with a subnet calculator and a file permissions calculator.",
      "Published the site's own roadmap so the list of what is planned, in progress, blocked and finished is visible to anyone, not just to me.",
      "Generated a branded preview image for every page, so links shared in a message or on social media show a proper card instead of a blank rectangle.",
    ],
  },
  {
    date: "2026-08-24",
    title: "A much lighter site",
    entries: [
      "Cut the amount of code the first page loads from about 1.5 MB down to roughly 324 KB, which is the single biggest speed change so far.",
      "Stopped every page quietly downloading the 3D graphics code. It now loads only on the pages that actually draw something in 3D.",
      "The blog used to load all 236 articles to show you one. Now it fetches only the article you opened.",
      "The blog index shows small 480 pixel thumbnails instead of the full-size cover photos, which were over three times wider than the space they were displayed in.",
      "Deleted 123 MB of images nothing on the site referenced any more, and shrank the two oversized ones that were still in use.",
    ],
  },
  {
    date: "2026-08-24",
    title: "The writing archive",
    entries: [
      "Filled in every remaining date so there is a post for every single day from 10 April to 23 August 2026.",
      "Added 34 posts covering mid-May to mid-June, and another 76 before that.",
      "Gave all 236 posts a distinct cover photo, each one licensed and credited to its photographer.",
      "Split the blog index into pages instead of rendering the entire archive at once.",
      "Trimmed the tag filter to the fourteen most used tags, because the full list was longer than the posts it was filtering.",
      "Every post now ends with links to related reading, so there is always somewhere to go next.",
      "Renamed two posts about systemd that had ended up with nearly identical titles.",
    ],
  },
  {
    date: "2026-08-24",
    title: "Search engines and syndication",
    entries: [
      "Published an RSS feed at /feed.xml, so the site can be followed in a reader without an account or an email address.",
      "Generated a sitemap and filled out the structured data that search engines read.",
      "Took the 404 page and the simulated operations dashboards out of the search index. They are interactive views with nothing to read, and they were competing with the writing.",
      "The related-post links are now written into the page's HTML rather than added afterwards by the browser, so search engines and readers with scripts disabled can see them.",
    ],
  },
  {
    date: "2026-08-24",
    title: "Phones and accessibility",
    entries: [
      "Stopped the operations dashboards scrolling sideways on a phone screen.",
      "Made the dashboard tabs reachable on a phone. They previously ran off the edge of the screen with no way to reach the last ones.",
      "Fixed four accessibility problems on the simulator pages and eight more found in a full pass over the site.",
      "Enlarged tap targets that were too small to hit reliably with a thumb.",
      "Removed a personal social handle from the site copy, along with some hardware detail that did not need to be public.",
    ],
  },
  {
    date: "2026-08-24",
    title: "The simulator and the dashboards",
    entries: [
      "Connected five finished dashboards that had been built but had no address you could reach them at.",
      "The operations dashboards now read from the simulation instead of showing invented numbers.",
      "The simulator's own controls stay inside the simulator rather than leaking onto the rest of the site.",
      "Removed six navigation buttons in the simulator that all led to the 404 page.",
      "Fixed a crash on the simulator page and the blank screen that appeared on every page that loads on demand.",
      "Rebuilt the server teardown animation and fixed five other faults in the 3D scene, including a pinned scrolling section that froze the page.",
    ],
  },
  {
    date: "2026-08-24",
    title: "Corrections and content",
    entries: [
      "Refilled the projects page and derived its filter buttons from the project data, so a new project cannot go missing from the filters.",
      "Fixed headline text that was rendering as a washed-out ghost of itself.",
      "Linked the Las Vegas Weekly feature from the site.",
      "Gave the older profile page its own page title and description instead of inheriting the site defaults.",
    ],
  },
  {
    date: "2026-08-23",
    title: "Running with no server",
    entries: [
      "Moved the small data layer the simulator uses into the browser itself, so the whole site can be published as static files with nothing running behind it. Each visitor gets their own private sandbox.",
      "That data layer now loads on the first request that needs it rather than on every page view.",
    ],
  },
  {
    date: "2026-04-26",
    title: "The cinematic rebuild",
    entries: [
      "Rebuilt the site around a continuous 3D server rack that the page scrolls through, replacing the older static layout.",
      "Rewrote the copy across every page in a plainer, more formal voice.",
      "Added render quality profiles that detect what the device can handle, so the 3D scene degrades gracefully instead of failing on a modest laptop or phone.",
      "Added a recovery panel that explains what went wrong when the 3D scene cannot start, rather than leaving a black screen.",
      "Reworked the loading screen and the scroll pacing so the rack stays the focus of the opening sequence.",
    ],
  },
  {
    date: "2026-03-02",
    title: "First version",
    entries: [
      "Published the first version of the site, with the portfolio pages and the 3D data center simulator.",
      "Made equipment placeable anywhere in the rack, with overlap checks and space validation.",
      "Added live status indicators to the rack so it reflects what is installed and running.",
    ],
  },
];

/** The most recent release date, for the "last updated" line. */
export const CHANGELOG_UPDATED = CHANGELOG[0].date;
