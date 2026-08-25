/**
 * How to follow the site.
 *
 * The feed has existed since the archive got big enough to be worth
 * following, but RSS has been out of fashion for long enough that most
 * readers have never used one. So this page is mostly an explainer: what a
 * feed is, why it is worth the two minutes, and which reader to install.
 */

import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { CopyButton } from "@/components/ui/copy-button";
import { siteConfig } from "@/lib/siteConfig";
import { useSEO } from "@/lib/useSEO";

const SITE_URL = "https://maxdoubin.com";
const FEED_URL = `${SITE_URL}/feed.xml`;
const REPO_URL = "https://github.com/MaxDoubin/Server-Builder";

interface Reader {
  name: string;
  url: string;
  platforms: string;
  note: string;
}

/**
 * Five readers, one per situation, rather than a ranked list. The right
 * answer depends far more on which devices someone owns than on features.
 */
const READERS: Reader[] = [
  {
    name: "NetNewsWire",
    url: "https://netnewswire.com",
    platforms: "Mac · iPhone · iPad",
    note: "Free and open source, with no account and no server in the middle. The easiest starting point on Apple hardware.",
  },
  {
    name: "Feedly",
    url: "https://feedly.com",
    platforms: "Web · iOS · Android",
    note: "Runs in a browser tab, so there is nothing to install and your subscriptions follow you between devices. Free tier, paid tiers above it.",
  },
  {
    name: "Inoreader",
    url: "https://www.inoreader.com",
    platforms: "Web · iOS · Android",
    note: "The same shape as Feedly with more control over sorting and filtering. Also has a free tier.",
  },
  {
    name: "Thunderbird",
    url: "https://www.thunderbird.net",
    platforms: "Windows · macOS · Linux",
    note: "The email client has a feed reader built in. Worth knowing if you would rather not add another app to check.",
  },
  {
    name: "Miniflux",
    url: "https://miniflux.app",
    platforms: "Self-hosted",
    note: "Open source and deliberately minimal. You run it on your own machine, which means nobody else holds your reading list.",
  },
];

export function CinematicSubscribe() {
  useSEO({
    title: "Subscribe | Max Doubin",
    description:
      "Follow the field notes by RSS. What a feed actually is, why it beats an algorithm, five readers worth trying, and the feed URL for maxdoubin.com.",
    canonical: `${SITE_URL}/subscribe`,
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[860px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Channel · Subscribe
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Follow without an account.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              There is a post here most days. The way to keep up with it is
              RSS, which is a thirty-year-old idea that quietly still works.
              No sign-up, no email address, no algorithm deciding what you
              see. If you have never used one, the section below is for you.
            </p>
          </header>

          {/* ---- The feed itself, first, for anyone who already knows ---- */}
          <section
            aria-labelledby="feed-url"
            className="mt-14 rounded-2xl border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="feed-url"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              The feed URL
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                {FEED_URL}
              </code>
              <CopyButton
                value={FEED_URL}
                label="Copy the feed URL"
                testId="button-copy-feed"
                className="min-h-[44px] px-4"
              />
            </div>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Copy that, paste it into a reader, done. Many readers accept{" "}
              <span className="text-[hsl(var(--brand-bone-dim))]">maxdoubin.com</span>{" "}
              on its own and find the feed themselves. Opening the link in a
              browser shows a wall of tags rather than a page: that is the raw
              file, and it is what your reader wants, so do not worry about it.
            </p>
            <p className="mt-3">
              <a
                href={FEED_URL}
                data-testid="link-raw-feed"
                className="inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-signal))]"
              >
                View the raw feed
                <span aria-hidden>↗</span>
              </a>
            </p>
          </section>

          {/* ---- The explainer ---- */}
          <section aria-labelledby="what-is-rss" className="mt-20">
            <h2
              id="what-is-rss"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              What RSS is, if you have never used it
            </h2>

            <div className="mt-6 space-y-5 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                A feed is a plain file that a site publishes alongside its
                pages. It lists the recent posts: title, date, link, and a
                summary. Nothing else. It is written for software to read, not
                for you.
              </p>
              <p>
                A feed reader is an app that holds a list of those files and
                re-checks them on a schedule. When a site posts something new,
                the new item shows up in the app. That is the entire mechanism.
                It works like an inbox, except the sites are the senders and
                you can throw one out permanently in a single click.
              </p>
              <p>
                Nobody is in the middle. There is no company deciding which of
                the sites you asked for you get to see today, no ranking, and
                no way for a site to slip in something you did not subscribe
                to. Your reading list lives in your reader, not in an account
                on someone else's platform, and most readers will export it as
                a file you can carry to a different app.
              </p>
              <p>
                For this site specifically: subscribing does not tell me who
                you are. There is no subscriber list here to sign up to, no
                confirmation email, and nothing to unsubscribe from. You are
                just fetching a file.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm">
              <h3 className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                Start to finish
              </h3>
              <ol className="mt-4 space-y-3">
                {[
                  "Pick a reader from the list below and install it, or open it in a browser tab.",
                  "Copy the feed URL from the top of this page.",
                  "Find the add or plus button in the reader and paste the URL in.",
                  "That is it. New posts appear there from now on, and you never have to come back here to check.",
                ].map((step, index) => (
                  <li key={step} className="flex gap-4">
                    <span
                      aria-hidden
                      className="mt-0.5 shrink-0 font-mono-tight text-[11px] tabular-nums text-[hsl(var(--brand-signal))]"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ---- Readers ---- */}
          <section aria-labelledby="readers" className="mt-20">
            <h2
              id="readers"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Readers worth trying
            </h2>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              All five read the same feed, so this is a question of which
              devices you use rather than which app is best. None of them are
              affiliated with this site and none of these are paid placements.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {READERS.map((reader) => (
                <li key={reader.name}>
                  <a
                    href={reader.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`link-reader-${reader.name.toLowerCase()}`}
                    className="group flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.4)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                        {reader.name}
                      </span>
                      <span aria-hidden className="text-[hsl(var(--brand-ash))]">
                        ↗
                      </span>
                    </div>
                    <span className="mt-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      {reader.platforms}
                    </span>
                    <span className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {reader.note}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* ---- GitHub ---- */}
          <section aria-labelledby="github" className="mt-20">
            <h2
              id="github"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Following on GitHub
            </h2>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The writing goes out over the feed. The work behind the site goes
              through GitHub, so that is the place to watch if you care about
              the code more than the posts. Following a profile there puts new
              repositories and activity in your GitHub feed; watching a
              repository notifies you about that project specifically.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <a
                href={siteConfig.social.github.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-github-profile"
                className="group rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.4)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Profile
                  </span>
                  <span aria-hidden className="text-[hsl(var(--brand-ash))]">
                    ↗
                  </span>
                </div>
                <div className="mt-3 break-all font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                  {siteConfig.social.github.handle}
                </div>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Everything public, in one place.
                </p>
              </a>

              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-github-repo"
                className="group rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-5 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/0.4)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    This site
                  </span>
                  <span aria-hidden className="text-[hsl(var(--brand-ash))]">
                    ↗
                  </span>
                </div>
                <div className="mt-3 break-all font-display text-lg font-medium tracking-tight text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                  Server-Builder
                </div>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  The source for this site and the data center simulator on it.
                  Corrections by pull request are welcome.
                </p>
              </a>
            </div>
          </section>

          {/* ---- The honest bit ---- */}
          <section aria-labelledby="no-newsletter" className="mt-20">
            <h2
              id="no-newsletter"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              There is no email newsletter
            </h2>
            <div className="mt-4 max-w-2xl space-y-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                Not yet, and there is no hidden form to find. Sending email
                reliably means holding a list of addresses, and a list of
                addresses is something that can be lost. Until that is worth
                doing properly, the feed does the same job better.
              </p>
              <p>
                If a newsletter ever exists it will be announced here and on
                the front page, and it will never be opt-out. In the meantime,
                if you would rather just get a message when something is worth
                reading,{" "}
                <a
                  href={`mailto:${siteConfig.email}`}
                  data-testid="link-subscribe-email"
                  className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                >
                  {siteConfig.email}
                </a>{" "}
                reaches me directly.
              </p>
            </div>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
