/**
 * Ask me anything.
 *
 * The site is static files on a CDN with nothing running behind it, so a
 * form cannot post anywhere. Instead this page composes the message and
 * hands it to something that can actually deliver it: a mail client, or
 * GitHub. The composed text is shown in full first, because a page that
 * quietly builds a message and fires it off is worse than no form at all.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { CopyButton } from "@/components/ui/copy-button";
import { siteConfig } from "@/lib/siteConfig";
import { useSEO } from "@/lib/useSEO";

const SITE_URL = "https://maxdoubin.com";
const DISCUSSIONS_NEW =
  "https://github.com/MaxDoubin/Server-Builder/discussions/new";

/**
 * Mail clients and the operating systems that hand mailto: links to them
 * have historically truncated long URLs, and the limit is not consistent
 * enough to state. Past this length the page suggests the other route
 * rather than letting a question get silently cut in half.
 */
const LONG_MESSAGE = 1500;

interface Answered {
  question: string;
  /** Internal path. These all go through the router. */
  href: string;
  answer: string;
}

const ANSWERED: Answered[] = [
  {
    question: "How do I get started with a homelab?",
    href: "/blog/why-homelabs-matter",
    answer: "Why homelabs matter for learning networking",
  },
  {
    question: "Should I chase certifications or build projects?",
    href: "/blog/certifications-versus-projects",
    answer: "Certifications versus projects, and how I split my time",
  },
  {
    question: "What is the National Cyber League actually like?",
    href: "/blog/ncl-competition-lessons",
    answer: "Lessons from competing in the National Cyber League",
  },
  {
    question: "How should I segment a network with VLANs?",
    href: "/blog/vlan-segmentation-guide",
    answer: "Network segmentation with VLANs, a practical guide",
  },
  {
    question: "What have you actually built?",
    href: "/projects",
    answer: "The projects page, with the lab, the club, and the simulator",
  },
];

/** First line of the question, trimmed to something a subject line can hold. */
function subjectFrom(question: string): string {
  const firstLine = question.trim().split("\n")[0].trim();
  if (firstLine.length <= 72) return firstLine;
  const cut = firstLine.slice(0, 72);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

export function CinematicAsk() {
  useSEO({
    title: "Ask | Max Doubin",
    description:
      "Ask about networking, security, homelabs or competition. The page composes your question for email or GitHub and shows the text before anything is sent.",
    canonical: `${SITE_URL}/ask`,
  });

  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");

  const trimmedQuestion = question.trim();
  const trimmedName = name.trim();
  const ready = trimmedQuestion.length > 0;

  const composed = useMemo(() => {
    const subject = ready ? `Ask: ${subjectFrom(trimmedQuestion)}` : "";
    const signature = trimmedName
      ? `\n\n---\nAsked by ${trimmedName} via ${SITE_URL}/ask`
      : `\n\n---\nAsked via ${SITE_URL}/ask`;
    const body = ready ? `${trimmedQuestion}${signature}` : "";
    return { subject, body };
  }, [ready, trimmedQuestion, trimmedName]);

  const mailtoHref = `mailto:${siteConfig.email}?subject=${encodeURIComponent(
    composed.subject,
  )}&body=${encodeURIComponent(composed.body)}`;

  const discussionHref = `${DISCUSSIONS_NEW}?category=q-a&title=${encodeURIComponent(
    composed.subject,
  )}&body=${encodeURIComponent(composed.body)}`;

  const plainText = ready
    ? `Subject: ${composed.subject}\n\n${composed.body}`
    : "";
  const isLong = composed.body.length > LONG_MESSAGE;

  const actionClasses =
    "inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full px-6 text-center font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[860px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Channel · Ask
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Ask me anything.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Networking, security, homelab hardware, competition, running a
              club, or what any of this is actually like from inside a high
              school programme. If the answer is long enough to be useful to
              other people it usually turns into a post.
            </p>
          </header>

          {/* ---- How this works, before the form, not after ---- */}
          <section
            aria-labelledby="how-it-works"
            className="mt-12 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <h2
              id="how-it-works"
              className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              How this works
            </h2>
            <div className="mt-4 space-y-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <p>
                This site is a set of static files. There is no server here to
                receive a form, which means nothing you type below is sent
                anywhere by this page, and nothing is stored. Not in a
                database, not in the browser, not anywhere.
              </p>
              <p>
                What the page does instead is write your question out as text
                and hand it to something that can deliver it. The email button
                opens your own mail client with the message already filled in,
                and you press send. The GitHub button opens a new public
                discussion with the same text in it, and you press post.
                Either way the last click is yours, and you can see the exact
                text first.
              </p>
              <p>
                Email is private. GitHub is public and needs a GitHub account,
                but the answer stays visible for the next person with the same
                question, which is usually the better outcome.
              </p>
            </div>
          </section>

          {/* ---- The composer ---- */}
          <section aria-labelledby="compose" className="mt-16">
            <h2
              id="compose"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Write the question
            </h2>

            <div className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="ask-name"
                  className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
                >
                  Name{" "}
                  <span className="text-[hsl(var(--brand-ash)/0.7)]">
                    (optional)
                  </span>
                </label>
                <input
                  id="ask-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Who is asking"
                  autoComplete="name"
                  data-testid="input-ask-name"
                  className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="ask-question"
                  className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
                >
                  Question
                </label>
                <textarea
                  id="ask-question"
                  rows={6}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What do you want to know?"
                  aria-describedby="ask-question-help"
                  data-testid="input-ask-question"
                  className="mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                />
                <p
                  id="ask-question-help"
                  className="mt-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                >
                  {trimmedQuestion.length} characters · nothing is sent until
                  you choose a route below
                </p>
              </div>
            </div>
          </section>

          {/* ---- The preview ---- */}
          <section aria-labelledby="preview" className="mt-14">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="preview"
                className="font-display text-xl font-medium tracking-tight text-[hsl(var(--brand-bone))]"
              >
                What will be sent
              </h2>
              {ready ? (
                <CopyButton
                  value={plainText}
                  label="Copy the composed message"
                  testId="button-copy-composed"
                  className="min-h-[36px]"
                />
              ) : null}
            </div>

            <div
              className="mt-4 overflow-hidden rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))]"
              aria-live="polite"
              aria-atomic="true"
            >
              {ready ? (
                <>
                  <div className="border-b border-[hsl(var(--brand-iron))] px-4 py-3">
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      Subject
                    </span>
                    <p
                      data-testid="text-composed-subject"
                      className="mt-1 break-words font-mono-tight text-sm text-[hsl(var(--brand-signal))]"
                    >
                      {composed.subject}
                    </p>
                  </div>
                  <pre
                    data-testid="text-composed-body"
                    className="overflow-x-auto whitespace-pre-wrap break-words p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  >
                    {composed.body}
                  </pre>
                </>
              ) : (
                <p className="p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  Nothing composed yet. Type a question above and the exact
                  message appears here.
                </p>
              )}
            </div>

            {isLong ? (
              <p
                role="status"
                data-testid="text-long-warning"
                className="mt-3 flex items-start gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
              >
                <span aria-hidden>▲</span>
                <span>
                  That is a long message. Some mail clients cut off long
                  pre-filled emails, so check nothing is missing before you
                  send, or use the GitHub route, which has no such limit.
                </span>
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {ready ? (
                <a
                  href={mailtoHref}
                  data-testid="button-ask-email"
                  className={`${actionClasses} bg-[hsl(var(--brand-signal))] text-[hsl(var(--brand-obsidian))] hover:opacity-90`}
                >
                  Open in email
                  <span aria-hidden>→</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  data-testid="button-ask-email"
                  className={`${actionClasses} cursor-not-allowed border border-[hsl(var(--brand-iron))] bg-transparent text-[hsl(var(--brand-ash))]`}
                >
                  Open in email
                </button>
              )}

              {ready ? (
                <a
                  href={discussionHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="button-ask-github"
                  className={`${actionClasses} border border-[hsl(var(--brand-iron))] bg-transparent text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal)/0.6)]`}
                >
                  Post on GitHub
                  <span aria-hidden>↗</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  data-testid="button-ask-github"
                  className={`${actionClasses} cursor-not-allowed border border-[hsl(var(--brand-iron))] bg-transparent text-[hsl(var(--brand-ash))]`}
                >
                  Post on GitHub
                </button>
              )}
            </div>

            {!ready ? (
              <p className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Both routes unlock once there is a question to send
              </p>
            ) : null}

            <p className="mt-6 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              If the email button does nothing, this device has no mail client
              configured for links. Copy the text above and send it to{" "}
              <a
                href={`mailto:${siteConfig.email}`}
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                {siteConfig.email}
              </a>{" "}
              by hand. The GitHub route needs discussions to be open on the
              repository; if that link lands on a not-found page, email is the
              way through.
            </p>
          </section>

          {/* ---- Already answered ---- */}
          <section aria-labelledby="answered" className="mt-20">
            <h2
              id="answered"
              className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
            >
              Already answered
            </h2>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              These come up often enough that there is already a full answer
              written down. Worth a look before you type.
            </p>

            <ul className="mt-8 space-y-px overflow-hidden rounded-2xl border border-[hsl(var(--brand-iron))]">
              {ANSWERED.map((item) => (
                <li key={item.href} className="bg-[hsl(var(--brand-graphite)/0.4)]">
                  <Link
                    href={item.href}
                    data-testid={`link-answered-${item.href.split("/").filter(Boolean).join("-")}`}
                    className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-[hsl(var(--brand-graphite)/0.8)]"
                  >
                    <span className="min-w-0 font-mono-tight text-sm text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                      {item.question}
                    </span>
                    <span className="min-w-0 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      {item.answer}{" "}
                      <span aria-hidden className="inline-block">
                        →
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <p className="mt-6 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Nothing close?{" "}
              <Link
                href="/blog"
                className="inline-flex min-h-[24px] items-center py-1 text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                The archive
              </Link>{" "}
              holds 236 posts, and there is a new one most days.
            </p>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
