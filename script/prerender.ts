/**
 * Static pre-renderer for maxdoubin.com
 *
 * Runs after `vite build` and writes per-page HTML files into dist/public.
 * Each file contains correct <title>, <meta>, <link rel="canonical">, JSON-LD
 * schema, and the full rendered blog content inside the <div id="root"> so
 * Google can read everything without executing JavaScript.
 *
 * React's createRoot will take over the root div when JS loads. The page
 * content is identical, so there is no visible flash for users.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { Marked } from "marked";

// ─── import blog data (tsx handles .ts extensions at runtime) ────────────────
// postIndex is plain data with no Vite-only syntax in it, so it imports
// cleanly here. lib/blogPosts.ts cannot: it reaches for the bodies through
// import.meta.glob, which only exists inside a Vite build.
const { postIndex } = await import("../client/src/lib/postIndex.ts");
const { getTagPage } = await import("../client/src/lib/tagPages.ts");
const { EXAMS } = await import("../client/src/lib/examObjectives.ts");
const { TAG_PAGES } = await import("../client/src/lib/tagPages.ts");
const { TOOLS } = await import("../client/src/lib/toolsRegistry.ts");
const { formatPostDate } = await import("../client/src/lib/formatDate.ts");
const POSTS_DIR = path.resolve("client/src/content/posts");

/** One post's markdown, straight off disk. */
async function readBody(slug: string): Promise<string> {
  return readFile(path.join(POSTS_DIR, `${slug}.md`), "utf-8");
}

// ─── constants ───────────────────────────────────────────────────────────────
const SITE_URL = "https://maxdoubin.com";
const DIST = path.resolve("dist/public");
const BATCH = 10; // blog posts per parallel batch

const marked = new Marked({ gfm: true, breaks: true });

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Replace a meta tag's attribute value in raw HTML using a regex. */
function replaceMeta(
  html: string,
  selector: string,
  attrName: string,
  value: string,
): string {
  // Match e.g. <meta property="og:title" content="...">
  // The selector here is something like: meta[property="og:title"]
  // We convert it into a regex that matches the attribute value.
  const escaped = selector.replace(/[\[\]"]/g, (c) =>
    ({ "[": "\\[", "]": "\\]", '"': '"' })[c] ?? c,
  );
  const re = new RegExp(
    `(<${escaped}[^>]*\\s${attrName}=")([^"]*)(")`,
    "i",
  );
  return html.replace(re, `$1${esc(value)}$3`);
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
}

function replaceCanonical(html: string, url: string): string {
  return html.replace(
    /(<link rel="canonical" href=")[^"]*(")/,
    `$1${url}$2`,
  );
}

function injectBeforeHead(html: string, injection: string): string {
  return html.replace("</head>", `${injection}\n</head>`);
}

function injectRootContent(html: string, content: string): string {
  // Replace the spinner placeholder with pre-rendered content.
  // React's createRoot overwrites this on hydration. Purely for crawlers.
  return html.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<style>/,
    `<div id="root">${content}</div>\n    <style>`,
  );
}

// ─── page injection ───────────────────────────────────────────────────────────

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  schema?: string;
  rootContent?: string;
  /** Keep a page out of the index. For interactive pages with little prose. */
  noindex?: boolean;
}

function buildPageHtml(base: string, meta: PageMeta): string {
  let html = base;
  const {
    title,
    description,
    canonical,
    ogType = "website",
    ogImage = `${SITE_URL}/images/og-image.jpg`,
    ogImageAlt = "Max Doubin",
    schema,
    rootContent,
    noindex = false,
  } = meta;

  html = replaceTitle(html, title);
  html = replaceCanonical(html, canonical);

  // <meta name="description">
  html = html.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${esc(description)}$2`,
  );

  // Open Graph
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/,   `$1${esc(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/,`$1${esc(description)}$2`);
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/,     `$1${canonical}$2`);
  html = html.replace(/(<meta property="og:type" content=")[^"]*(")/,    `$1${ogType}$2`);
  html = html.replace(/(<meta property="og:image" content=")[^"]*(")/,   `$1${ogImage}$2`);
  html = html.replace(/(<meta property="og:image:alt" content=")[^"]*(")/,`$1${esc(ogImageAlt)}$2`);

  // Twitter
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/,      `$1${esc(title)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/,`$1${esc(description)}$2`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*(")/,      `$1${ogImage}$2`);
  html = html.replace(/(<meta name="twitter:image:alt" content=")[^"]*(")/,  `$1${esc(ogImageAlt)}$2`);
  html = html.replace(/(<meta name="twitter:url" content=")[^"]*(")/,        `$1${canonical}$2`);

  if (noindex) {
    html = html.replace(
      /(<meta name="robots" content=")[^"]*(")/,
      "$1noindex, follow$2",
    );
  }

  if (schema) html = injectBeforeHead(html, schema);
  if (rootContent) html = injectRootContent(html, rootContent);

  return html;
}

// ─── write helpers ────────────────────────────────────────────────────────────

async function writePage(
  relDir: string,
  base: string,
  meta: PageMeta,
): Promise<void> {
  const dir = path.join(DIST, relDir);
  await mkdir(dir, { recursive: true });
  const html = buildPageHtml(base, meta);
  await writeFile(path.join(dir, "index.html"), html, "utf-8");
}

// ─── blog post pre-render ─────────────────────────────────────────────────────

async function prerenderPost(
  base: string,
  post: (typeof postIndex)[number],
  all: (typeof postIndex)[number][] = [],
): Promise<void> {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const body = await readBody(post.slug);
  /*
    Social preview uses the branded card, not the raw cover.

    A shared link used to show the bare photo, so every post looked alike in
    a feed and none of them said what they were. The cards in images/og
    carry the title and tags baked in at 1200x630, generated by
    scripts-ci/make-og-images.py. Scrapers do not run JavaScript, so setting
    this here in the static HTML is what actually reaches them.

    Falls back to the cover if a card is missing, which is better than
    emitting a URL that 404s.
  */
  const cardPath = `/images/og/${post.slug}.jpg`;
  const hasCard = existsSync(path.join(DIST, cardPath.slice(1)));
  const ogImage = `${SITE_URL}${hasCard ? cardPath : post.coverImage}`;
  const coverImage = `${SITE_URL}${post.coverImage}`;

  const schema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "@id": url,
  headline: post.title,
  description: post.excerpt,
  datePublished: post.date,
  dateModified: post.date,
  url,
  image: { "@type": "ImageObject", url: coverImage, contentUrl: coverImage },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin", url: SITE_URL },
  publisher: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin", url: SITE_URL },
  isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
  keywords: post.tags.join(", "),
  inLanguage: "en-US",
  wordCount: post.wordCount,
  mainEntityOfPage: { "@type": "WebPage", "@id": url },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Field Notes", item: `${SITE_URL}/blog` },
    { "@type": "ListItem", position: 3, name: post.title, item: url },
  ],
})}
</script>`;

  // Full article HTML. Google reads this on the first HTML crawl
  const contentHtml = await Promise.resolve(marked.parse(body));
  /*
    Formatted from the string parts, not through a Date.

    `new Date("2026-05-09")` is UTC midnight, and toLocaleDateString then
    renders it in whatever zone the machine is in. On a build runner set to
    anything west of Greenwich that prints the day before, so the static
    HTML would disagree with what the browser shows. A post date is a
    calendar date, not an instant, and should never touch a timezone.
  */
  const dateStr = formatPostDate(post.date);
  const readMins = Math.max(1, Math.ceil(post.wordCount / 200));
  // Point each tag at its topic hub where one exists. Every tag on every
  // post used to link to /blog, so roughly 700 crawler-visible links pointed
  // at the index and the 26 hubs had almost no inbound links from the
  // archive they summarise. Tags without a hub still go to the index.
  const tagLinks = post.tags
    .map((t) => {
      const href = getTagPage(t) ? `${SITE_URL}/topics/${t}` : `${SITE_URL}/blog`;
      return `<a href="${href}">${esc(t)}</a>`;
    })
    .join(" ");

  /*
    Onward links in the static HTML.

    The React page renders neighbours and related posts, but a crawler that
    does not execute JavaScript only ever saw a link back to the index, so
    every one of 236 posts was a dead end on the first pass. These mirror
    what the page shows.
  */
  const idx = all.findIndex((p) => p.slug === post.slug);
  const newer = idx > 0 ? all[idx - 1] : undefined;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : undefined;

  const tagCounts = new Map<string, number>();
  all.forEach((p) => p.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));
  const related = all
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      p,
      score: p.tags
        .filter((t) => post.tags.includes(t))
        .reduce((sum, t) => sum + 1 / (tagCounts.get(t) ?? 1), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.p.date < b.p.date ? 1 : -1))
    .slice(0, 3)
    .map((x) => x.p);

  const link = (p: (typeof postIndex)[number]) =>
    `<a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a>`;

  const neighbourNav =
    older || newer
      ? `<nav aria-label="Adjacent posts">${
          older ? `<span>Previous: ${link(older)}</span>` : ""
        }${newer ? `<span>Next: ${link(newer)}</span>` : ""}</nav>`
      : "";

  const relatedNav = related.length
    ? `<aside aria-label="Related posts"><h2>Related</h2><ul>${related
        .map((r) => `<li>${link(r)}</li>`)
        .join("")}</ul></aside>`
    : "";

  const rootContent = `
<main>
  <a href="${SITE_URL}/blog">← Back to Blog</a>
  <img src="${coverImage}" alt="${esc(post.title)}" width="800" height="320" />
  <article>
    <time datetime="${post.date}">${dateStr}</time> · ${readMins} min read
    <h1>${esc(post.title)}</h1>
    <p>${esc(post.excerpt)}</p>
    <nav>${tagLinks}</nav>
    ${contentHtml}
  </article>
  ${neighbourNav}
  ${relatedNav}
</main>`;

  await writePage(`blog/${post.slug}`, base, {
    title: `${post.title} | Max Doubin`,
    description: post.excerpt,
    canonical: url,
    ogType: "article",
    ogImage,
    ogImageAlt: post.title,
    schema,
    rootContent,
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!existsSync(DIST)) {
    console.log("⚠  dist/public not found, skipping prerender");
    return;
  }

  const base = await readFile(path.join(DIST, "index.html"), "utf-8");
  const posts = postIndex.filter((p) => !p.draft);

  // ── blog posts ──
  console.log(`Prerendering ${posts.length} blog posts...`);
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    await Promise.all(batch.map((p) => prerenderPost(base, p, posts)));
    process.stdout.write(`  ${Math.min(i + BATCH, posts.length)}/${posts.length}\r`);
  }
  console.log(`  ${posts.length}/${posts.length} done          `);

  // ── blog list ──
  const blogListSchema = `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Blog",
  "@id": `${SITE_URL}/blog`,
  name: "Max Doubin's Blog",
  url: `${SITE_URL}/blog`,
  description: "Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering.",
  author: { "@id": `${SITE_URL}/#person` },
  inLanguage: "en-US",
  blogPost: posts.slice(0, 20).map((p) => ({
    "@type": "BlogPosting",
    "@id": `${SITE_URL}/blog/${p.slug}`,
    headline: p.title,
    url: `${SITE_URL}/blog/${p.slug}`,
    datePublished: p.date,
    description: p.excerpt,
  })),
})}
</script>`;

  const blogRootContent = `
<main>
  <h1>Blog | Max Doubin</h1>
  <p>Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering.</p>
  <ul>
    ${posts
      .map(
        (p) =>
          `<li><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a>: <span>${esc(p.excerpt)}</span></li>`,
      )
      .join("\n    ")}
  </ul>
</main>`;

  await writePage("blog", base, {
    title: "Blog | Max Doubin",
    description:
      "Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering by Max Doubin.",
    canonical: `${SITE_URL}/blog`,
    schema: blogListSchema,
    rootContent: blogRootContent,
  });

  // ── projects ──
  await writePage("projects", base, {
    title: "Projects | Max Doubin",
    description:
      "Projects by Max Doubin in cybersecurity, enterprise networking, 3D datacenter simulation, and web development.",
    canonical: `${SITE_URL}/projects`,
  });

  // ── contact ──
  await writePage("contact", base, {
    title: "Contact | Max Doubin",
    description:
      "Get in touch with Max Doubin, cybersecurity specialist and enterprise networking expert based in Las Vegas, Nevada.",
    canonical: `${SITE_URL}/contact`,
  });

  /*
    Standalone pages.

    Every one of these is a real page in the router, so every one needs a
    static document. Without it a crawler following a link gets the SPA
    fallback: the home page's title, the home page's canonical, and no
    indication the target exists. Descriptions are per page and unique,
    which check-meta enforces.
  */
  const STANDALONE: Array<PageMeta & { dir: string }> = [
    {
      dir: "archive",
      title: "Archive | Max Doubin",
      description:
        "Every field note on maxdoubin.com in one chronological list, grouped by year and month, with tags and read times.",
      canonical: `${SITE_URL}/archive`,
    },
    {
      dir: "paths",
      title: "Reading paths | Max Doubin",
      description:
        "Four curated routes through the archive: networking from scratch, security fundamentals, AI meets infrastructure, and homelab operations.",
      canonical: `${SITE_URL}/paths`,
    },
    {
      dir: "now",
      title: "Now | Max Doubin",
      description:
        "What Max Doubin is focused on this month: certification study, what he is building, what he is reading, and what the South CTA Cyber Club is working on.",
      canonical: `${SITE_URL}/now`,
    },
    {
      dir: "uses",
      title: "Uses | Max Doubin",
      description:
        "The software Max Doubin actually uses: terminal and analysis tools, languages, virtualization, monitoring, and this site's own stack, with why for each.",
      canonical: `${SITE_URL}/uses`,
    },
    {
      dir: "resume",
      title: "Resume | Max Doubin",
      description:
        "Resume for Max Doubin: cybersecurity study at South Career Technical Academy, National Cyber League results, leadership roles, projects, and skills.",
      canonical: `${SITE_URL}/resume`,
    },
    {
      dir: "timeline",
      title: "Timeline | Max Doubin",
      description:
        "Competitions, awards, and milestones for Max Doubin, from National Cyber League results and certifications to leadership roles and press coverage.",
      canonical: `${SITE_URL}/timeline`,
    },
    {
      dir: "cyber-club",
      title: "South CTA Cyber Club | Max Doubin",
      description:
        "Join the Cyber Club at South Career Technical Academy in Las Vegas: capture the flag practice, a lab built to be broken, and no experience required.",
      canonical: `${SITE_URL}/cyber-club`,
    },
    {
      dir: "coding-camps",
      title: "Youth Coding Camps | Max Doubin",
      description:
        "Youth coding camps across the Las Vegas Valley taught by Max Doubin: what they cover, what a session looks like, and what a beginner takes home.",
      canonical: `${SITE_URL}/coding-camps`,
    },
    {
      dir: "colophon",
      title: "Colophon | Max Doubin",
      description:
        "How maxdoubin.com is built: React and TypeScript, Vite with manual chunk splitting, static prerendering so crawlers read full articles, no backend.",
      canonical: `${SITE_URL}/colophon`,
    },
    {
      dir: "faq",
      title: "Frequently Asked Questions | Max Doubin",
      description:
        "Answers about Max Doubin: what he studies, his National Cyber League placement, the South CTA Cyber Club, what he builds and teaches, and how to reach him.",
      canonical: `${SITE_URL}/faq`,
    },
    {
      dir: "links",
      title: "Links | Max Doubin",
      description:
        "Free and freemium resources Max Doubin recommends for learning networking and security: fundamentals, capture the flag practice, and certification prep.",
      canonical: `${SITE_URL}/links`,
    },
    {
      dir: "subscribe",
      title: "Subscribe | Max Doubin",
      description:
        "Follow the field notes by RSS. What a feed actually is, why it beats an algorithm, five readers worth trying, and the feed URL for maxdoubin.com.",
      canonical: `${SITE_URL}/subscribe`,
    },
    {
      dir: "study-timer",
      title: "Study timer | Max Doubin",
      description:
        "A pomodoro study timer that keeps correct time in a background tab, with configurable work and break lengths, a session counter and an optional chime.",
      canonical: `${SITE_URL}/study-timer`,
    },
    {
      dir: "ask",
      title: "Ask | Max Doubin",
      description:
        "Ask about networking, security, homelabs or competition. The page composes your question for email or GitHub and shows the text before anything is sent.",
      canonical: `${SITE_URL}/ask`,
    },
    {
      dir: "changelog",
      title: "Changelog | Max Doubin",
      description:
        "A plain-language history of what has changed on maxdoubin.com: speed work, accessibility fixes, new writing and new tools, dated and grouped by month.",
      canonical: `${SITE_URL}/changelog`,
    },
    {
      dir: "ncl",
      title: "National Cyber League Study Guide | Max Doubin",
      description:
        "What the National Cyber League is, how scoring works, how to prepare, and guides to all seven challenge categories, from a top 1 percent competitor.",
      canonical: `${SITE_URL}/ncl`,
    },
    {
      dir: "certifications",
      title: "Certifications | Max Doubin",
      description:
        "An honest status board: CompTIA Tech+ earned, with Security+, Network+, and CCNA in progress, plus each exam's official domains and resources.",
      canonical: `${SITE_URL}/certifications`,
    },
    {
      // A trainer, not an article. Indexing it would put a page of controls
      // into results alongside the writing.
      dir: "flashcards",
      title: "Flashcards | Max Doubin",
      description:
        "A spaced-repetition flashcard trainer for networking, ports, security, Linux, and cryptography, with an SM-2 scheduler that plans each card's next review.",
      canonical: `${SITE_URL}/flashcards`,
      noindex: true,
    },
  ];

  for (const page of STANDALONE) {
    const { dir, ...meta } = page;
    await writePage(dir, base, meta);
  }

  // ── National Cyber League category guides ──
  const NCL_GUIDES: Array<[string, string, string]> = [
    ["open-source-intelligence", "Open Source Intelligence", "How the NCL Open Source Intelligence category works: pivoting from a clue, metadata and GPS extraction, DNS and certificate recon, and a worked example."],
    ["cryptography", "Cryptography", "How the NCL Cryptography category works: telling encodings from ciphers, classical cipher methods, RSA weaknesses, and a worked example."],
    ["password-cracking", "Password Cracking", "How the NCL Password Cracking category works: identifying hash types, hashcat and John modes, wordlists, rules and masks, plus a worked MD5 example."],
    ["log-analysis", "Log Analysis", "How the NCL Log Analysis category works: reading web and auth log formats, grep and awk aggregation, spotting brute force, and a worked example."],
    ["network-traffic-analysis", "Network Traffic Analysis", "How the NCL Network Traffic Analysis category works: reading pcaps in Wireshark, display versus capture filters, following streams, and an example."],
    ["forensics", "Forensics", "How the NCL Forensics category works: file signatures and magic bytes, strings and binwalk, steganography, metadata, memory analysis, and a worked example."],
    ["web-application-exploitation", "Web Application Exploitation", "How the NCL Web Application Exploitation category works: recon and enumeration, SQL injection, XSS, OWASP references, and a worked example."],
  ];
  for (const [slug, name, description] of NCL_GUIDES) {
    const url = `${SITE_URL}/ncl/${slug}`;
    await writePage(`ncl/${slug}`, base, {
      title: `${name} | NCL Guide | Max Doubin`,
      description,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "National Cyber League", item: `${SITE_URL}/ncl` },
    { "@type": "ListItem", position: 3, name, item: url },
  ],
})}
</script>`,
    });
  }

  // ── tools ──
  await writePage("tools", base, {
    title: "Tools | Max Doubin",
    description:
      "Free browser-based tools for networking and security study: subnetting, packet headers, cron, regex, encoding, and classical ciphers.",
    canonical: `${SITE_URL}/tools`,
    rootContent: `
<main>
  <h1>Tools</h1>
  <ul>
${TOOLS.map(
  (t) =>
    `    <li><a href="${SITE_URL}/tools/${t.slug}">${esc(t.name)}</a> <span>${esc(t.blurb)}</span></li>`,
).join("\n")}
  </ul>
</main>`,
  });

  for (const tool of TOOLS) {
    const url = `${SITE_URL}/tools/${tool.slug}`;
    await writePage(`tools/${tool.slug}`, base, {
      title: `${tool.name} | Max Doubin`,
      description: tool.blurb,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: tool.name,
  description: tool.blurb,
  url,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
    { "@type": "ListItem", position: 3, name: tool.name, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <nav><a href="${SITE_URL}/">Home</a> / <a href="${SITE_URL}/tools">Tools</a></nav>
  <h1>${esc(tool.name)}</h1>
  <p>${esc(tool.blurb)}</p>
  <p>Runs in your browser. Nothing is uploaded.</p>
</main>`,
    });
  }

  // ── topic hubs ──
  /*
    One page per subject, with real editorial copy and the full post list
    rendered into the static HTML. These exist so a crawler has a route
    into the archive by subject as well as by date, and so a reader can
    land on "networking" rather than on post 214 of 236.

    Only tags in lib/tagPages get a page. A tag with two posts stays a
    filter on the index: a page for it would be thin, would compete with
    the index, and would add nothing.
  */
  for (const topic of TAG_PAGES) {
    const tagged = posts.filter((p) => p.tags.includes(topic.tag));
    if (tagged.length === 0) continue;
    const url = `${SITE_URL}/topics/${topic.tag}`;
    const list = tagged
      .map(
        (p) =>
          `      <li><a href="${SITE_URL}/blog/${p.slug}">${esc(p.title)}</a> ` +
          `<time datetime="${p.date}">${p.date}</time> <span>${esc(p.excerpt)}</span></li>`,
      )
      .join("\n");
    await writePage(`topics/${topic.tag}`, base, {
      title: `${topic.title} | Max Doubin`,
      description: topic.description,
      canonical: url,
      schema: `<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: topic.title,
  description: topic.description,
  url,
  isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: tagged.length,
    itemListElement: tagged.slice(0, 25).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/blog/${p.slug}`,
      name: p.title,
    })),
  },
})}
</script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Topics", item: `${SITE_URL}/topics` },
    { "@type": "ListItem", position: 3, name: topic.title, item: url },
  ],
})}
</script>`,
      rootContent: `
<main>
  <nav><a href="${SITE_URL}/">Home</a> / <a href="${SITE_URL}/topics">Topics</a></nav>
  <article>
    <h1>${esc(topic.title)}</h1>
    <p>${esc(topic.intro)}</p>
    <p>${tagged.length} posts.</p>
    <ul>
${list}
    </ul>
  </article>
</main>`,
    });
  }

  // ── topics index ──
  await writePage("topics", base, {
    title: "Topics | Max Doubin",
    description:
      "Browse writing on networking, servers, security, Linux, storage, AI infrastructure and more, organised by subject rather than by date.",
    canonical: `${SITE_URL}/topics`,
    rootContent: `
<main>
  <h1>Topics</h1>
  <ul>
${TAG_PAGES.map(
  (t) =>
    `    <li><a href="${SITE_URL}/topics/${t.tag}">${esc(t.title)}</a> <span>${esc(t.description)}</span></li>`,
).join("\n")}
  </ul>
</main>`,
  });

  // ── open dataset ──
  await writePage("data", base, {
    title: "Open rack hardware dataset | Max Doubin",
    description:
      "An openly licensed table of 28 rack-mount devices with power draw, heat output, rack units, port count and indicative cost, as JSON and CSV under CC BY 4.0.",
    canonical: `${SITE_URL}/data`,
    rootContent: `
<main>
  <h1>Rack hardware dataset</h1>
  <p>28 rack-mount devices with power draw, heat output, rack units, port count and indicative cost, licensed CC BY 4.0.</p>
  <p>These are modelling figures, not vendor specifications and not measurements. powerDraw is representative for the class of hardware named. heatOutput is derived as watts multiplied by 3.412142. price is order of magnitude. Do not cite them as manufacturer data.</p>
  <ul>
    <li><a href="${SITE_URL}/data/equipment-catalog.json">equipment-catalog.json</a></li>
    <li><a href="${SITE_URL}/data/equipment-catalog.csv">equipment-catalog.csv</a></li>
  </ul>
</main>`,
  });

  // ── certification study index and one page per exam domain ──
  // These answer high-intent objective queries, so they have to exist as
  // static HTML rather than only after hydration.
  await writePage("study", base, {
    title: "Certification study by exam objective | Max Doubin",
    description:
      "Security+ SY0-701, Network+ N10-009 and CCNA 200-301 exam domains mapped to the posts and free tools on this site that cover each one.",
    canonical: `${SITE_URL}/study`,
    rootContent: `
<main>
  <h1>Study by exam objective</h1>
${EXAMS.map(
  (e) =>
    `  <section>\n    <h2>${esc(e.name)} (${esc(e.code)})</h2>\n    <p>${esc(e.intro)}</p>\n    <ul>\n` +
    e.domains
      .map(
        (d) =>
          `      <li><a href="${SITE_URL}/study/${e.slug}/${d.slug}">${esc(d.name)}</a>` +
          `${d.weight === null ? "" : ` <span>${d.weight}% of exam</span>`}` +
          ` <span>${esc(d.summary)}</span></li>`,
      )
      .join("\n") +
    `\n    </ul>\n    <p><a href="${e.officialUrl}">Official ${esc(e.code)} objectives</a></p>\n  </section>`,
).join("\n")}
</main>`,
  });

  for (const exam of EXAMS) {
    for (const domain of exam.domains) {
      const matched = posts.filter((post) => {
        const title = post.title.toLowerCase();
        const tags = post.tags.map((t) => t.toLowerCase());
        return domain.keywords.some(
          (k) => title.includes(k.toLowerCase()) || tags.includes(k.toLowerCase()),
        );
      });
      await writePage(`study/${exam.slug}/${domain.slug}`, base, {
        title: `${domain.name} | ${exam.name} ${exam.code} | Max Doubin`,
        description: `${domain.summary} Mapped to ${matched.length} posts and free tools covering ${exam.name} ${exam.code}.`,
        canonical: `${SITE_URL}/study/${exam.slug}/${domain.slug}`,
        rootContent: `
<main>
  <nav><a href="${SITE_URL}/study">All exam domains</a></nav>
  <h1>${esc(domain.name)}</h1>
  <p>${esc(exam.name)} ${esc(exam.code)}${domain.weight === null ? "" : `, ${domain.weight}% of the exam`}</p>
  <p>${esc(domain.summary)}</p>
  <h2>Posts covering this domain</h2>
  <ul>
${matched
  .map(
    (post) =>
      `    <li><a href="${SITE_URL}/blog/${post.slug}">${esc(post.title)}</a> <span>${esc(post.excerpt)}</span></li>`,
  )
  .join("\n")}
  </ul>
  <p><a href="${exam.officialUrl}">Official ${esc(exam.code)} objectives</a></p>
</main>`,
      });
    }
  }

  // ── roadmap ──
  await writePage("roadmap", base, {
    title: "Roadmap | Max Doubin",
    description:
      "What is planned, in progress, done and blocked on maxdoubin.com, tracked in public across 100 improvements.",
    canonical: `${SITE_URL}/roadmap`,
  });

  // ── sitemap ──
  // Generated here rather than hand-maintained. The checked-in sitemap had
  // gone stale, listing 105 URLs with a lastmod months behind the newest
  // post, so anything published since was invisible to crawlers.
  await writeSitemap(posts);
  await writeFeed(posts);

  console.log("Prerender complete.");
}

/**
 * Emit sitemap.xml covering every route and every published post.
 *
 * lastmod comes from each post's own date, so a crawler can tell what
 * actually changed instead of re-reading the whole archive.
 */
async function writeSitemap(
  posts: Array<{ slug: string; date: string; tags: string[]; draft?: boolean }>,
) {
  const live = posts.filter((p) => !p.draft);
  const newest = live.reduce((a, p) => (p.date > a ? p.date : a), "1970-01-01");
  const today = newest;

  const urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = [
    { loc: `${SITE_URL}/`, lastmod: today, changefreq: "weekly", priority: "1.0" },
    { loc: `${SITE_URL}/blog`, lastmod: today, changefreq: "daily", priority: "0.9" },
    { loc: `${SITE_URL}/projects`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/contact`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/game`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/study`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/data`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/topics`, lastmod: today, changefreq: "weekly", priority: "0.8" },
    { loc: `${SITE_URL}/archive`, lastmod: today, changefreq: "weekly", priority: "0.8" },
    { loc: `${SITE_URL}/paths`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/tools`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/ncl`, lastmod: today, changefreq: "monthly", priority: "0.9" },
    { loc: `${SITE_URL}/faq`, lastmod: today, changefreq: "monthly", priority: "0.8" },
    { loc: `${SITE_URL}/resume`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/now`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/uses`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/timeline`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/cyber-club`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/coding-camps`, lastmod: today, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/certifications`, lastmod: today, changefreq: "monthly", priority: "0.6" },
    { loc: `${SITE_URL}/links`, lastmod: today, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/colophon`, lastmod: today, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/subscribe`, lastmod: today, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/changelog`, lastmod: today, changefreq: "weekly", priority: "0.4" },
    { loc: `${SITE_URL}/ask`, lastmod: today, changefreq: "monthly", priority: "0.4" },
    { loc: `${SITE_URL}/study-timer`, lastmod: today, changefreq: "monthly", priority: "0.4" },
    { loc: `${SITE_URL}/roadmap`, lastmod: today, changefreq: "weekly", priority: "0.4" },
  ];

  // Tools and the competition guides. /flashcards is deliberately absent:
  // it is noindex, and a sitemap should never advertise a page that tells
  // crawlers to go away.
  for (const tool of TOOLS) {
    urls.push({
      loc: `${SITE_URL}/tools/${tool.slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }
  for (const slug of [
    "open-source-intelligence",
    "cryptography",
    "password-cracking",
    "log-analysis",
    "network-traffic-analysis",
    "forensics",
    "web-application-exploitation",
  ]) {
    urls.push({
      loc: `${SITE_URL}/ncl/${slug}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  // Topic hubs. Only those that actually have posts, so the sitemap never
  // advertises a page the prerenderer skipped.
  for (const topic of TAG_PAGES) {
    const newestTagged = live
      .filter((p) => p.tags.includes(topic.tag))
      .reduce((a, p) => (p.date > a ? p.date : a), "");
    if (!newestTagged) continue;
    urls.push({
      loc: `${SITE_URL}/topics/${topic.tag}`,
      lastmod: newestTagged,
      changefreq: "weekly",
      priority: "0.7",
    });
  }
  for (const exam of EXAMS) {
    for (const domain of exam.domains) {
      urls.push({
        loc: `${SITE_URL}/study/${exam.slug}/${domain.slug}`,
        lastmod: today,
        changefreq: "monthly",
        priority: "0.7",
      });
    }
  }
  for (const post of live) {
    urls.push({
      loc: `${SITE_URL}/blog/${post.slug}`,
      lastmod: post.date,
      changefreq: "monthly",
      priority: "0.7",
    });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${u.loc}</loc>\n` +
          `    <lastmod>${u.lastmod}</lastmod>\n` +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  await writeFile(path.join(DIST, "sitemap.xml"), xml, "utf8");
  console.log(`sitemap.xml: ${urls.length} urls`);
}

main().catch((err) => {
  console.error("Prerender failed:", err);
  process.exit(1);
});

/**
 * Emit an RSS 2.0 feed of the most recent posts.
 *
 * A daily archive with no feed is only reachable by people who think to
 * revisit. Readers, aggregators and several crawlers all consume this.
 */
async function writeFeed(
  posts: Array<{ slug: string; title: string; date: string; excerpt: string; draft?: boolean }>,
) {
  // Newest first. The source array is in insertion order, not date order,
  // so slicing it directly published a feed headed by an arbitrary post.
  const live = posts
    .filter((p) => !p.draft)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 50);
  const rfc822 = (iso: string) => new Date(`${iso}T12:00:00Z`).toUTCString();
  const items = live
    .map(
      (p) =>
        `    <item>\n` +
        `      <title>${esc(p.title)}</title>\n` +
        `      <link>${SITE_URL}/blog/${p.slug}</link>\n` +
        `      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>\n` +
        `      <pubDate>${rfc822(p.date)}</pubDate>\n` +
        `      <description>${esc(p.excerpt)}</description>\n` +
        `    </item>`,
    )
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>Max Doubin</title>\n` +
    `    <link>${SITE_URL}/blog</link>\n` +
    `    <description>Writing on cybersecurity, enterprise networking, and systems infrastructure.</description>\n` +
    `    <language>en-us</language>\n` +
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />\n` +
    (live[0] ? `    <lastBuildDate>${rfc822(live[0].date)}</lastBuildDate>\n` : "") +
    `${items}\n` +
    `  </channel>\n` +
    `</rss>\n`;

  await writeFile(path.join(DIST, "feed.xml"), xml, "utf8");
  console.log(`feed.xml: ${live.length} items`);
}
