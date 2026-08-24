/**
 * The site's own roadmap.
 *
 * One entry per planned improvement, with an honest status. This is public
 * at /roadmap: a portfolio that shows its own backlog, including the parts
 * that are not done, is more convincing than one that only shows finished
 * work.
 *
 * Statuses mean exactly what they say. "done" requires the thing to be
 * live and verified, not merely written. "blocked" means it needs an
 * account, a credential, or a decision that only Max can make, and the
 * reason is stated. Nothing is marked done to make the list look better.
 */

export type RoadmapStatus = "done" | "in-progress" | "planned" | "blocked";

export interface RoadmapItem {
  /** Stable number, matching the original 100-item plan. */
  id: number;
  title: string;
  status: RoadmapStatus;
  /** Why it matters, or for blocked items, what it is waiting on. */
  note?: string;
}

export interface RoadmapGroup {
  key: string;
  title: string;
  blurb: string;
  items: RoadmapItem[];
}

export const ROADMAP_UPDATED = "2026-08-24";

export const ROADMAP: RoadmapGroup[] = [
  {
    key: "tools",
    title: "Tools",
    blurb:
      "Free browser utilities for networking and security work. Everything runs locally; nothing is uploaded.",
    items: [
      { id: 1, title: "Subnet calculator", status: "planned" },
      { id: 2, title: "VLSM practice generator", status: "planned" },
      { id: 3, title: "CIDR block visualizer", status: "planned" },
      { id: 4, title: "Interactive packet header diagrams", status: "planned" },
      { id: 5, title: "Port number reference", status: "planned" },
      { id: 6, title: "Wireshark display filter recipes", status: "planned" },
      { id: 7, title: "Unix permissions calculator", status: "planned" },
      { id: 8, title: "Cron expression explainer", status: "planned" },
      { id: 9, title: "Encoder and decoder", status: "planned" },
      { id: 10, title: "Classical cipher workbench", status: "planned" },
      { id: 11, title: "Hash identifier", status: "planned" },
      { id: 12, title: "MAC address vendor lookup", status: "planned" },
      { id: 13, title: "DNS record reference", status: "planned" },
      { id: 14, title: "Regex tester", status: "planned" },
      { id: 15, title: "Base and two's complement converter", status: "planned" },
      { id: 16, title: "HTTP status code reference", status: "planned" },
    ],
  },
  {
    key: "ncl",
    title: "Competition and study",
    blurb:
      "Preparation material for the National Cyber League and the certification track.",
    items: [
      { id: 17, title: "NCL prep guide per category", status: "planned" },
      {
        id: 18,
        title: "Retired CTF challenge write-ups",
        status: "planned",
        note: "Only retired, publicly released challenges. Live competition questions are under an honour code.",
      },
      { id: 19, title: "How competitive cyber scoring works", status: "planned" },
      { id: 20, title: "Competition-day checklist", status: "planned" },
      { id: 21, title: "Downloadable practice log dataset", status: "planned" },
      { id: 22, title: "Mistakes from my first season", status: "planned" },
      { id: 23, title: "Spaced-repetition flashcards", status: "planned" },
      {
        id: 24,
        title: "Anki deck exports",
        status: "blocked",
        note: "Needs the genanki library, which is not installed. The in-browser flashcards cover the same ground for now.",
      },
      { id: 25, title: "Self-check quizzes on guides", status: "planned" },
      { id: 26, title: "Certification progress board", status: "planned" },
    ],
  },
  {
    key: "archive",
    title: "The archive",
    blurb: "Making 236 posts navigable rather than merely present.",
    items: [
      { id: 27, title: "Client-side search", status: "planned" },
      { id: 28, title: "Curated reading paths", status: "planned" },
      { id: 29, title: "Series index pages", status: "planned" },
      { id: 30, title: "Tag landing pages", status: "planned" },
      { id: 31, title: "Difficulty labels and filter", status: "planned" },
      { id: 32, title: "Table of contents on posts", status: "planned" },
      { id: 33, title: "Copy buttons on code blocks", status: "planned" },
      { id: 34, title: "Last-reviewed dates", status: "planned" },
      { id: 35, title: "Footnote previews on references", status: "planned" },
      { id: 36, title: "Hover previews on post links", status: "planned" },
      { id: 37, title: "Random post", status: "planned" },
      { id: 38, title: "Continue reading", status: "planned" },
      { id: 39, title: "Time remaining while scrolling", status: "planned" },
      { id: 40, title: "Print stylesheet for posts", status: "planned" },
      { id: 41, title: "Full chronological archive page", status: "planned" },
      { id: 42, title: "Monthly site changelog", status: "planned" },
    ],
  },
  {
    key: "simulator",
    title: "The simulator",
    blurb:
      "Turning the datacenter scene from something you look at into something you play.",
    items: [
      { id: 43, title: "Incident scenario mode", status: "planned" },
      { id: 44, title: "Power and cooling budgets", status: "planned" },
      { id: 45, title: "Build cost estimator", status: "planned" },
      { id: 46, title: "Named save slots", status: "planned" },
      { id: 47, title: "Share a layout by URL", status: "planned" },
      { id: 48, title: "First-run guided tour", status: "planned" },
      { id: 49, title: "Achievements", status: "planned" },
      { id: 50, title: "Photo mode", status: "planned" },
      { id: 51, title: "Heatmap driven by real density", status: "planned" },
      { id: 52, title: "Camera flythrough", status: "planned" },
      { id: 53, title: "Keyboard shortcut overlay", status: "planned" },
      { id: 54, title: "Day and night lighting", status: "planned" },
      { id: 55, title: "Touch controls for tablets", status: "planned" },
      { id: 56, title: "Ambient audio with mute", status: "planned" },
      { id: 57, title: "Build time trial", status: "planned" },
      { id: 58, title: "Incident postmortem screen", status: "planned" },
    ],
  },
  {
    key: "pages",
    title: "Pages",
    blurb: "The parts of a portfolio that are not the blog.",
    items: [
      { id: 59, title: "Now page", status: "planned" },
      { id: 60, title: "Uses page, software only", status: "planned" },
      { id: 61, title: "Printable resume", status: "planned" },
      { id: 62, title: "Competition timeline", status: "planned" },
      { id: 63, title: "Cyber Club recruiting page", status: "planned" },
      { id: 64, title: "Coding camps page for parents", status: "planned" },
      {
        id: 65,
        title: "Testimonials",
        status: "blocked",
        note: "Needs real quotes from real people. Inventing these would be dishonest, so the page waits until Max has permission to publish two or three.",
      },
      { id: 66, title: "Speaking and press", status: "planned" },
      { id: 67, title: "Colophon", status: "planned" },
      { id: 68, title: "FAQ with FAQPage schema", status: "planned" },
      { id: 69, title: "Recommended links", status: "planned" },
      { id: 70, title: "Terminal-themed 404", status: "planned" },
    ],
  },
  {
    key: "seo",
    title: "Discoverability",
    blurb: "Being findable, and being represented accurately when found.",
    items: [
      { id: 71, title: "Breadcrumb schema", status: "planned" },
      { id: 72, title: "Branded social preview images", status: "planned" },
      { id: 73, title: "HowTo schema on tutorials", status: "planned" },
      {
        id: 74,
        title: "Search Console and Bing Webmaster",
        status: "blocked",
        note: "Needs Max to verify ownership from his own Google and Microsoft accounts. Fifteen minutes, and nobody else can do it.",
      },
      { id: 75, title: "Subscribe page explaining RSS", status: "planned" },
      {
        id: 76,
        title: "Email newsletter",
        status: "blocked",
        note: "Needs an account with a newsletter provider. The RSS feed already exists and covers most of the need.",
      },
      { id: 77, title: "security.txt", status: "planned" },
      { id: 78, title: "humans.txt", status: "planned" },
      {
        id: 79,
        title: "Cross-post with canonical links",
        status: "blocked",
        note: "Needs a dev.to account. Canonical tags are already in place, so the posts are ready to syndicate whenever he wants.",
      },
      { id: 80, title: "Scope description on the blog index", status: "planned" },
    ],
  },
  {
    key: "engineering",
    title: "Engineering",
    blurb: "Keeping the site fast, and keeping it that way.",
    items: [
      {
        id: 81,
        title: "Real contact form",
        status: "planned",
        note: "A Cloudflare Pages Function, replacing the mailto handoff.",
      },
      { id: 82, title: "Browser tests in CI", status: "planned" },
      { id: 83, title: "Bundle size budget", status: "planned" },
      { id: 84, title: "Broken link checker", status: "planned" },
      { id: 85, title: "Lighthouse thresholds", status: "planned" },
      {
        id: 86,
        title: "AVIF and WebP covers",
        status: "blocked",
        note: "Needs an image encoder that is not available in this environment. The covers are already progressive JPEGs at sane sizes.",
      },
      { id: 87, title: "Responsive image srcset", status: "planned" },
      { id: 88, title: "Prefetch routes on hover", status: "planned" },
      { id: 89, title: "Offline reading", status: "planned" },
      { id: 90, title: "Security headers", status: "planned" },
      { id: 91, title: "Trim the entry bundle further", status: "planned" },
      { id: 92, title: "View transitions", status: "planned" },
    ],
  },
  {
    key: "community",
    title: "Community",
    blurb: "Making the site a two-way thing.",
    items: [
      {
        id: 93,
        title: "Comments via GitHub Discussions",
        status: "blocked",
        note: "Needs Discussions enabled on the repo and the giscus app installed, both of which require Max's GitHub account.",
      },
      { id: 94, title: "Suggest an edit on every post", status: "planned" },
      {
        id: 95,
        title: "Was this useful poll",
        status: "blocked",
        note: "Needs a Cloudflare KV namespace to store results.",
      },
      { id: 96, title: "Study timer", status: "planned" },
      { id: 97, title: "Ask me anything", status: "planned" },
      {
        id: 98,
        title: "Webmentions",
        status: "blocked",
        note: "Needs a webmention.io account and a receiving endpoint.",
      },
      { id: 99, title: "Monthly digest post", status: "planned" },
      { id: 100, title: "This roadmap", status: "done" },
    ],
  },
];

export const ROADMAP_ITEMS: RoadmapItem[] = ROADMAP.flatMap((g) => g.items);

export function roadmapCounts() {
  const counts: Record<RoadmapStatus, number> = {
    done: 0,
    "in-progress": 0,
    planned: 0,
    blocked: 0,
  };
  for (const item of ROADMAP_ITEMS) counts[item.status] += 1;
  return counts;
}
