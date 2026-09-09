/**
 * The triage inbox.
 *
 * A list, a reading pane, and a header pane, because that is the interface
 * the skill actually lives in. The scoring is deliberately two numbers: how
 * many you called right, and how many you called right for a reason that is
 * really in the headers. The second one is the one that transfers. Calling a
 * phish because the tone felt off works until the day the tone is fine.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { MESSAGES } from "@/lib/triage/index";
import {
  HERRING_LABEL,
  HERRING_NOTE,
  TELL_LABEL,
  TELL_NOTE,
  hostOf,
  type Message,
  type TellId,
} from "@/lib/triage/types";
import {
  clearJudgements,
  loadJudgements,
  saveJudgements,
  type Judgements,
} from "@/lib/triage/progress";
import { pluralise } from "@/lib/plural";
import { PracticeStage } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

const ALL_TELLS: TellId[] = [
  "spf-fail",
  "dkim-fail",
  "dmarc-fail",
  "display-name-spoof",
  "lookalike-domain",
  "link-host-mismatch",
  "dangerous-attachment",
];

const AUTH_TONE: Record<string, string> = {
  pass: "hsl(var(--brand-signal))",
  fail: "hsl(var(--brand-danger))",
  softfail: "hsl(var(--brand-amber))",
  none: "hsl(var(--brand-ash))",
};

export function CinematicTriage() {
  useSEO({
    title: "Phishing triage | Max Doubin",
    description:
      "Fourteen messages with their real headers, nine of them hostile. Call each one, then say which signal settles it. Five are genuine mail wearing the things people are taught to fear.",
    canonical: `${SITE_URL}/triage`,
  });

  const [judgements, setJudgements] = useState<Judgements>({});
  const [mounted, setMounted] = useState(false);
  const [openId, setOpenId] = useState<string>(MESSAGES[0]?.id ?? "");
  const [headersOpen, setHeadersOpen] = useState(false);

  useEffect(() => {
    setJudgements(loadJudgements());
    setMounted(true);
  }, []);

  const record = useCallback((id: string, next: Judgements[string]) => {
    setJudgements((current) => {
      const updated = { ...current, [id]: next };
      saveJudgements(updated);
      return updated;
    });
  }, []);

  const open = MESSAGES.find((message) => message.id === openId) ?? MESSAGES[0];

  const score = useMemo(() => {
    const judged = MESSAGES.filter((m) => judgements[m.id]);
    const right = judged.filter((m) => judgements[m.id].right).length;
    const cited = judged.filter((m) => judgements[m.id].cited);
    const citedRight = cited.filter((m) => judgements[m.id].citedRight).length;
    const missed = judged.filter((m) => m.verdict === "phish" && !judgements[m.id].right).length;
    const falseAlarms = judged.filter(
      (m) => m.verdict === "legitimate" && !judgements[m.id].right,
    ).length;
    return { judged: judged.length, right, cited: cited.length, citedRight, missed, falseAlarms };
  }, [judgements]);

  const reset = () => {
    clearJudgements();
    setJudgements({});
    setHeadersOpen(false);
  };

  /*
    The room answers the call on the open message. A missed phish and a
    reported newsletter are both wrong and they are not the same wrongness, so
    the first turns the screen red and the second only warms it.
  */
  const current = open ? judgements[open.id] : undefined;
  const missed = Boolean(current && !current.right && open?.verdict === "phish");
  const stageAccent = missed ? "danger" : current && !current.right ? "amber" : "cyan";
  const stageMood = !current ? "tense" : current.right ? "recovering" : missed ? "critical" : "tense";

  return (
    <CinematicLayout>
      <PracticeStage
        accent={stageAccent}
        mood={stageMood}
        ending={score.judged === MESSAGES.length && score.right === MESSAGES.length ? "best" : undefined}
        flashKey={score.judged}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1080px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practice · Read the headers
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Triage.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              One morning of mail for a school district technician. Fourteen messages, nine of them
              hostile, every header the real thing. Call each one, then say which signal settles it.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Five are genuine, and they are the reason this is worth doing. They arrive wearing the
              things people are taught to fear: a mismatched envelope sender, a Reply-To somewhere
              else, a shortened link, a request to change bank details, a broken DKIM signature.
              Reporting one of those costs an afternoon and a little of the credibility the next
              real report will need.
            </p>
          </header>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[hsl(var(--brand-iron))] py-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            <span>
              {MESSAGES.length} {pluralise(MESSAGES.length, "message")}
            </span>
            <span aria-live="polite" data-testid="triage-score">
              {mounted ? `${score.judged} judged, ${score.right} right` : " "}
            </span>
            {mounted && score.cited > 0 ? (
              <span>
                {score.citedRight} of {score.cited} for a signal that is there
              </span>
            ) : null}
            {mounted && score.judged > 0 ? (
              <button
                type="button"
                onClick={reset}
                data-testid="triage-reset"
                className="uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] underline-offset-4 hover:text-[hsl(var(--brand-bone))] hover:underline"
              >
                Start over
              </button>
            ) : null}
          </div>

          {mounted && score.judged === MESSAGES.length ? (
            <div
              className="mt-6 rounded-2xl border border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.05)] p-5"
              data-testid="triage-summary"
            >
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · The whole inbox
              </h2>
              <p className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {score.right} of {MESSAGES.length} called correctly. {score.missed}{" "}
                {pluralise(score.missed, "hostile message")} waved through, {score.falseAlarms}{" "}
                {pluralise(score.falseAlarms, "genuine message")} reported.
              </p>
              <p className="mt-3 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
                {score.citedRight} of {score.cited} of your calls cited a signal that is actually in
                the headers. That number is the one worth improving. A verdict you cannot point at a
                header for is a guess that happened to land, and it will not land on the message
                that is written properly.
              </p>
            </div>
          ) : null}

          <div className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <ol className="space-y-2" data-testid="triage-list">
              {MESSAGES.map((message) => {
                const judged = mounted ? judgements[message.id] : undefined;
                const active = message.id === open?.id;
                return (
                  <li key={message.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(message.id);
                        setHeadersOpen(false);
                      }}
                      aria-current={active ? "true" : undefined}
                      data-testid={`triage-item-${message.id}`}
                      className={`flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.06)]"
                          : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone))]">
                          {message.displayName}
                        </span>
                        <span className="shrink-0 font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]">
                          {message.date}
                        </span>
                      </span>
                      <span className="line-clamp-2 font-mono-tight text-[12px] leading-snug text-[hsl(var(--brand-bone-dim))]">
                        {message.subject}
                      </span>
                      {judged ? (
                        <span
                          className={`font-mono-tight text-[10px] uppercase tracking-[0.2em] ${
                            judged.right
                              ? "text-[hsl(var(--brand-signal))]"
                              : "text-[hsl(var(--brand-danger))]"
                          }`}
                        >
                          {judged.right ? "Called right" : "Called wrong"}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>

            {open ? (
              <Reader
                key={open.id}
                message={open}
                judged={mounted ? judgements[open.id] : undefined}
                headersOpen={headersOpen}
                onToggleHeaders={() => setHeadersOpen((v) => !v)}
                onCall={(called) =>
                  record(open.id, { called, right: called === open.verdict })
                }
                onCite={(cited) => {
                  const existing = judgements[open.id];
                  if (!existing) return;
                  record(open.id, {
                    ...existing,
                    cited,
                    citedRight: open.tells.includes(cited),
                  });
                }}
              />
            ) : null}
          </div>

          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Every address and host in this inbox is invented, and the ones that imitate a brand sit
            under reserved names that resolve to nothing. CI derives each message's signals from its
            own headers and refuses the build if the written analysis and the artefact disagree,
            which is the failure mode that would otherwise teach you something untrue without ever
            looking broken.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the rest of the practice material, the{" "}
            <Link
              href="/practice"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              hub
            </Link>{" "}
            collects the scenarios, labs, captures and challenges in one place.
          </p>
        </div>
        <ReadAboutThis href="/triage" />

      </div>
    </CinematicLayout>
  );
}

function Reader({
  message,
  judged,
  headersOpen,
  onToggleHeaders,
  onCall,
  onCite,
}: {
  message: Message;
  judged: { called: "phish" | "legitimate"; cited?: TellId; right: boolean; citedRight?: boolean } | undefined;
  headersOpen: boolean;
  onToggleHeaders: () => void;
  onCall: (called: "phish" | "legitimate") => void;
  onCite: (cited: TellId) => void;
}) {
  return (
    <div className="min-w-0">
      <article className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
        <h2 className="font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
          {message.subject}
        </h2>
        <dl className="mt-4 grid gap-x-4 gap-y-1 font-mono-tight text-[12px] sm:grid-cols-[auto_minmax(0,1fr)]">
          <Row label="From">
            <span className="text-[hsl(var(--brand-bone))]">{message.displayName}</span>{" "}
            <span className="break-all text-[hsl(var(--brand-ash))]">
              &lt;{message.fromAddress}&gt;
            </span>
          </Row>
          <Row label="To">{message.to}</Row>
          {message.replyTo ? <Row label="Reply-To">{message.replyTo}</Row> : null}
          <Row label="Return-Path">{message.returnPath}</Row>
        </dl>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono-tight text-[11px] uppercase tracking-[0.16em]">
          {(["spf", "dkim", "dmarc"] as const).map((name) => (
            <span key={name} className="text-[hsl(var(--brand-ash))]">
              {name}={" "}
              <span style={{ color: AUTH_TONE[message[name]] }} data-testid={`auth-${name}`}>
                {message[name]}
              </span>
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={onToggleHeaders}
          aria-expanded={headersOpen}
          data-testid="triage-headers-toggle"
          className="mt-4 min-h-[36px] font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
        >
          {headersOpen ? "Hide the Received chain" : "Show the Received chain"}
        </button>
        {headersOpen ? (
          <div className="mt-2 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] p-3">
            <pre className="font-mono-tight text-[11.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {message.received.map((hop) => `Received: ${hop}`).join("\n")}
            </pre>
          </div>
        ) : null}

        <div className="mt-5 border-t border-[hsl(var(--brand-iron))] pt-4">
          {message.body.map((paragraph, index) => (
            <p
              key={index}
              className="mt-3 font-mono-tight text-[13.5px] leading-[1.75] text-[hsl(var(--brand-bone-dim))] first:mt-0"
            >
              {paragraph}
            </p>
          ))}
        </div>

        {message.links.length > 0 ? (
          <div className="mt-5">
            <h3 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Links, with where they go
            </h3>
            <ul className="mt-2 space-y-1.5">
              {message.links.map((link, index) => (
                <li key={index} className="font-mono-tight text-[12px] leading-snug">
                  <span className="text-[hsl(var(--brand-cyan))]">{link.text}</span>
                  <span className="text-[hsl(var(--brand-ash))]"> → </span>
                  <span className="break-all text-[hsl(var(--brand-bone-dim))]">{link.href}</span>
                  <span className="text-[hsl(var(--brand-ash))]"> ({hostOf(link.href)})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {message.attachments.length > 0 ? (
          <div className="mt-5">
            <h3 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-ash))]">
              · Attachments
            </h3>
            <ul className="mt-2 space-y-1.5">
              {message.attachments.map((attachment, index) => (
                <li
                  key={index}
                  className="font-mono-tight text-[12px] leading-snug text-[hsl(var(--brand-bone-dim))]"
                >
                  <span className="break-all text-[hsl(var(--brand-bone))]">
                    {attachment.filename}
                  </span>{" "}
                  <span className="text-[hsl(var(--brand-ash))]">
                    {attachment.contentType}, {attachment.sizeKb}KB
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCall("phish")}
          aria-pressed={judged?.called === "phish"}
          data-testid="triage-call-phish"
          className={`min-h-[44px] rounded-lg border px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors ${
            judged?.called === "phish"
              ? "border-[hsl(var(--brand-danger))] bg-[hsl(var(--brand-danger)/0.12)] text-[hsl(var(--brand-danger))]"
              : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-danger)/0.6)]"
          }`}
        >
          Report as phish
        </button>
        <button
          type="button"
          onClick={() => onCall("legitimate")}
          aria-pressed={judged?.called === "legitimate"}
          data-testid="triage-call-legitimate"
          className={`min-h-[44px] rounded-lg border px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors ${
            judged?.called === "legitimate"
              ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-signal))]"
              : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)]"
          }`}
        >
          Leave it, it is real
        </button>
      </div>

      {judged ? (
        <>
          {judged.called === "phish" && !judged.cited ? (
            <section className="mt-4 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] p-5">
              <h3 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · Which signal settles it?
              </h3>
              <p className="mt-2 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
                Pick the one you would put in the ticket. This is scored separately, because a
                verdict you cannot point at a header for will not survive a better forgery.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ALL_TELLS.map((tell) => (
                  <button
                    key={tell}
                    type="button"
                    onClick={() => onCite(tell)}
                    data-testid={`triage-cite-${tell}`}
                    className="rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1.5 font-mono-tight text-[11px] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                  >
                    {TELL_LABEL[tell]}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <Verdict message={message} judged={judged} />
          )}
        </>
      ) : null}
    </div>
  );
}

function Verdict({
  message,
  judged,
}: {
  message: Message;
  judged: { called: "phish" | "legitimate"; cited?: TellId; right: boolean; citedRight?: boolean };
}) {
  /*
    Written out rather than interpolated. Tailwind finds class names by reading
    the source as text, so `border-[hsl(var(--brand-${tone}))]` produces no CSS
    at all: the class lands in the DOM and matches nothing. Every variant has to
    appear literally somewhere it can be read.
  */
  const shell = judged.right
    ? "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.05)]"
    : "border-[hsl(var(--brand-danger)/0.45)] bg-[hsl(var(--brand-danger)/0.05)]";
  const heading = judged.right
    ? "text-[hsl(var(--brand-signal))]"
    : "text-[hsl(var(--brand-danger))]";
  return (
    <section className={`mt-4 rounded-2xl border p-5 ${shell}`} data-testid="triage-verdict">
      <h3 className={`font-techno text-[10px] uppercase tracking-[0.4em] ${heading}`}>
        ·{" "}
        {judged.right
          ? message.verdict === "phish"
            ? "Correct, this one is hostile"
            : "Correct, this one is real"
          : message.verdict === "phish"
            ? "Missed, this one is hostile"
            : "False alarm, this one is real"}
      </h3>

      {judged.cited ? (
        <p className="mt-3 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          You cited {TELL_LABEL[judged.cited].toLowerCase()}.{" "}
          {judged.citedRight
            ? "That is in the headers."
            : "That one is not present here, so the call did not rest on it."}
        </p>
      ) : null}

      {message.tells.length > 0 ? (
        <div className="mt-4">
          <h4 className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-danger))]">
            · What settles it
          </h4>
          <ul className="mt-2 space-y-2">
            {message.tells.map((tell) => (
              <li key={tell} className="font-mono-tight text-[12.5px] leading-relaxed">
                <span className="text-[hsl(var(--brand-bone))]">{TELL_LABEL[tell]}.</span>{" "}
                <span className="text-[hsl(var(--brand-ash))]">{TELL_NOTE[tell]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {message.redHerrings.length > 0 ? (
        <div className="mt-4">
          <h4 className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-amber))]">
            · Present, and proves nothing
          </h4>
          <ul className="mt-2 space-y-2">
            {message.redHerrings.map((herring) => (
              <li key={herring} className="font-mono-tight text-[12.5px] leading-relaxed">
                <span className="text-[hsl(var(--brand-bone))]">{HERRING_LABEL[herring]}.</span>{" "}
                <span className="text-[hsl(var(--brand-ash))]">{HERRING_NOTE[herring]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 border-t border-[hsl(var(--brand-iron))] pt-4">
        {message.analysis.map((paragraph, index) => (
          <p
            key={index}
            className="mt-3 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))] first:mt-0"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[hsl(var(--brand-ash))]">{label}</dt>
      <dd className="min-w-0 break-all text-[hsl(var(--brand-bone-dim))]">{children}</dd>
    </>
  );
}
