/**
 * The packet workbench: a packet list, a detail tree, and a filter bar.
 *
 * Laid out the way Wireshark is, because the point is that what you learn
 * here transfers. The filter bar takes real display filter syntax and refuses
 * what it cannot do rather than silently ignoring half an expression, which
 * would teach a filter that works nowhere else.
 *
 * The list is a table with real rows rather than a virtualised canvas: these
 * captures are around a hundred packets, and a real table can be read by a
 * screen reader, searched with the browser's own find, and copied out.
 */

import { useEffect, useCallback, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getCapture } from "@/lib/capture/index";
import { compileFilter } from "@/lib/capture/filter";
import { isCorrect, type Capture, type Packet } from "@/lib/capture/types";
import { CinematicNotFound } from "@/pages/cinematic/CinematicNotFound";
import { recordSolvedCaptures } from "@/lib/capture/progress";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

export function CinematicCapture() {
  const [, params] = useRoute("/capture/:slug");
  const capture = params?.slug ? getCapture(params.slug) : undefined;

  useSEO({
    title: capture ? `${capture.title} | Packet capture | Max Doubin` : "Capture not found",
    description: capture ? capture.tagline : "",
    canonical: capture ? `${SITE_URL}/capture/${capture.slug}` : `${SITE_URL}/capture`,
    noindex: !capture,
  });

  if (!capture) return <CinematicNotFound />;
  return <Workbench key={capture.slug} capture={capture} />;
}

function Workbench({ capture }: { capture: Capture }) {
  const [filterText, setFilterText] = useState("");
  const [applied, setApplied] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [hintsOpen, setHintsOpen] = useState<Record<string, boolean>>({});

  const compiled = useMemo(() => compileFilter(applied), [applied]);
  const shown = useMemo(() => {
    // A filter that does not compile shows everything rather than nothing: the
    // error message is already on screen, and emptying the list on a typo is
    // the behaviour that makes people stop using a filter bar.
    if (compiled.error !== undefined) return capture.packets;
    const test = compiled.test;
    return capture.packets.filter((row) => test(row));
  }, [capture, compiled]);
  const packet = useMemo(
    () => capture.packets.find((p) => p.no === selected) ?? null,
    [capture, selected],
  );

  const apply = useCallback(() => setApplied(filterText), [filterText]);
  const useFilter = useCallback((text: string) => {
    setFilterText(text);
    setApplied(text);
  }, []);

  const solvedCount = capture.questions.filter((q) => marked[q.id]).length;

  /*
    A capture counts as read once every question in it is answered right.
    Recorded here rather than at each answer, because part-way through is
    not a state the progress panel has a word for, and a capture with one
    question left is not a capture you have read.
  */
  useEffect(() => {
    if (capture.questions.length > 0 && solvedCount === capture.questions.length) {
      recordSolvedCaptures(capture.slug);
    }
  }, [capture.questions.length, capture.slug, solvedCount]);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1100px]">
          <Link
            href="/capture"
            className="inline-flex min-h-[36px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
          >
            ← All captures
          </Link>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Capture · {capture.difficulty}
            </div>
            <h1 className="mt-4 font-display text-[clamp(1.8rem,4.5vw,3rem)] font-medium leading-[1.02] tracking-[-0.035em] text-[hsl(var(--brand-bone))]">
              {capture.title}
            </h1>
            {capture.brief.map((paragraph, index) => (
              <p
                key={index}
                className="mt-4 max-w-3xl font-mono-tight text-[14px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
              >
                {paragraph}
              </p>
            ))}
          </header>

          {/* Filter bar */}
          <div className="mt-8">
            <label htmlFor="capture-filter" className="sr-only">
              Display filter
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="capture-filter"
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    apply();
                  }
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                data-testid="capture-filter"
                placeholder="http.request.method == POST"
                className={`min-w-0 flex-1 rounded-lg border bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2.5 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none placeholder:text-[hsl(var(--brand-ash))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  compiled.error
                    ? "border-[hsl(var(--brand-danger)/0.7)]"
                    : applied
                      ? "border-[hsl(var(--brand-signal)/0.6)]"
                      : "border-[hsl(var(--brand-iron))]"
                }`}
              />
              <button
                type="button"
                onClick={apply}
                data-testid="capture-apply"
                className="min-h-[42px] rounded-lg bg-[hsl(var(--brand-signal))] px-5 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => useFilter("")}
                className="min-h-[42px] rounded-lg border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)]"
              >
                Clear
              </button>
            </div>
            <p className="mt-2 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]" aria-live="polite">
              {compiled.error ? (
                <span className="text-[hsl(var(--brand-danger))]" data-testid="capture-filter-error">
                  {compiled.error}
                </span>
              ) : (
                <span data-testid="capture-count">
                  {shown.length} of {capture.packets.length} packets shown
                  {applied ? ` · filter: ${applied}` : ""}
                </span>
              )}
            </p>
          </div>

          {/* Packet list */}
          <div className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))]">
            <table className="w-full min-w-[720px] border-collapse font-mono-tight text-[12px]">
              <caption className="sr-only">
                Packets in this capture, filtered to {shown.length} of {capture.packets.length}
              </caption>
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.8)] text-left text-[hsl(var(--brand-ash))]">
                  <th scope="col" className="px-3 py-2 font-normal">No.</th>
                  <th scope="col" className="px-3 py-2 font-normal">Time</th>
                  <th scope="col" className="px-3 py-2 font-normal">Source</th>
                  <th scope="col" className="px-3 py-2 font-normal">Destination</th>
                  <th scope="col" className="px-3 py-2 font-normal">Proto</th>
                  <th scope="col" className="px-3 py-2 font-normal">Len</th>
                  <th scope="col" className="px-3 py-2 font-normal">Info</th>
                </tr>
              </thead>
              <tbody className="max-h-[24rem]">
                {shown.map((row) => (
                  <tr
                    key={row.no}
                    onClick={() => setSelected(row.no)}
                    aria-selected={selected === row.no}
                    className={`cursor-pointer border-b border-[hsl(var(--brand-iron)/0.5)] transition-colors ${
                      selected === row.no
                        ? "bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-bone))]"
                        : "text-[hsl(var(--brand-bone-dim))] hover:bg-[hsl(var(--brand-graphite)/0.7)]"
                    }`}
                    data-testid={`packet-row-${row.no}`}
                  >
                    <td className="px-3 py-1.5 tabular-nums">{row.no}</td>
                    <td className="px-3 py-1.5 tabular-nums">{row.time.toFixed(3)}</td>
                    <td className="px-3 py-1.5">{row.source}</td>
                    <td className="px-3 py-1.5">{row.destination}</td>
                    <td className="px-3 py-1.5">{row.protocol}</td>
                    <td className="px-3 py-1.5 tabular-nums">{row.length}</td>
                    <td className="px-3 py-1.5">{row.info}</td>
                  </tr>
                ))}
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-[hsl(var(--brand-ash))]">
                      No packets match that filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Detail pane */}
          {packet ? <Detail packet={packet} onFilter={useFilter} /> : null}

          {/* Questions */}
          <section className="mt-12">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Questions, {solvedCount} of {capture.questions.length} answered
            </h2>
            <ol className="mt-5 space-y-5">
              {capture.questions.map((question, index) => {
                const value = answers[question.id] ?? "";
                const right = marked[question.id];
                return (
                  <li
                    key={question.id}
                    className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5"
                  >
                    <p className="font-mono-tight text-[14px] leading-relaxed text-[hsl(var(--brand-bone))]">
                      {index + 1}. {question.prompt}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label htmlFor={`answer-${question.id}`} className="sr-only">
                        Your answer to question {index + 1}
                      </label>
                      <input
                        id={`answer-${question.id}`}
                        value={value}
                        onChange={(event) =>
                          setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            setMarked((previous) => ({
                              ...previous,
                              [question.id]: isCorrect(question, value),
                            }));
                          }
                        }}
                        spellCheck={false}
                        data-testid={`answer-${question.id}`}
                        className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.7)] px-3 py-2 font-mono-tight text-[13px] text-[hsl(var(--brand-bone))] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[hsl(var(--brand-signal))]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setMarked((previous) => ({
                            ...previous,
                            [question.id]: isCorrect(question, value),
                          }))
                        }
                        data-testid={`check-${question.id}`}
                        className="min-h-[40px] rounded-lg border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                      >
                        Check
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setHintsOpen((previous) => ({ ...previous, [question.id]: true }))
                        }
                        className="min-h-[40px] px-2 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                      >
                        Hint
                      </button>
                    </div>

                    <div aria-live="polite">
                      {hintsOpen[question.id] && !right ? (
                        <p className="mt-3 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
                          {question.hint}
                          {question.hintFilter ? (
                            <>
                              {" "}
                              <button
                                type="button"
                                onClick={() => useFilter(question.hintFilter!)}
                                className="text-[hsl(var(--brand-signal))] underline underline-offset-4"
                              >
                                Try {question.hintFilter}
                              </button>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      {question.id in marked && !right ? (
                        <p className="mt-3 font-mono-tight text-[12px] text-[hsl(var(--brand-amber))]">
                          Not that. Nothing is scored, so keep looking.
                        </p>
                      ) : null}
                      {right ? (
                        <div
                          className="mt-4 border-t border-[hsl(var(--brand-signal)/0.35)] pt-4"
                          data-testid={`explain-${question.id}`}
                        >
                          {question.explain.map((paragraph, i) => (
                            <p
                              key={i}
                              className="mt-2 font-mono-tight text-[13px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
                            >
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {capture.reading?.length ? (
            <section className="mt-12">
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · The written version
              </h2>
              <ul className="mt-4 space-y-2">
                {capture.reading.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone-dim))] underline decoration-[hsl(var(--brand-iron))] underline-offset-4 transition-colors hover:text-[hsl(var(--brand-bone))] hover:decoration-[hsl(var(--brand-signal))]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <ReadAboutThis href="/capture" />

      </div>
    </CinematicLayout>
  );
}

function Detail({ packet, onFilter }: { packet: Packet; onFilter: (text: string) => void }) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
        <h2 className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
          · Packet {packet.no}
        </h2>
        <div className="mt-3 space-y-3">
          {packet.layers.map((layer) => (
            <details key={layer.name} open className="group">
              <summary className="cursor-pointer font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone))]">
                {layer.name}
              </summary>
              <dl className="mt-1.5 space-y-0.5 pl-4">
                {layer.fields.map((field) => (
                  <div key={field.name} className="flex flex-wrap gap-x-2">
                    <dt className="font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))]">
                      <button
                        type="button"
                        onClick={() => onFilter(`${field.name} == ${field.value}`)}
                        title={`Filter on ${field.name}`}
                        className="underline decoration-dotted underline-offset-2 hover:text-[hsl(var(--brand-signal))]"
                      >
                        {field.label}
                      </button>
                      :
                    </dt>
                    <dd className="font-mono-tight text-[11.5px] text-[hsl(var(--brand-bone-dim))]">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
        <h2 className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
          · Bytes
        </h2>
        {packet.payload ? (
          <div className="mt-3 overflow-x-auto">
            <pre className="whitespace-pre-wrap break-words font-mono-tight text-[11.5px] leading-[1.7] text-[hsl(var(--brand-bone-dim))]">
              {packet.payload}
            </pre>
          </div>
        ) : (
          <p className="mt-3 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            No readable payload. This packet is either encrypted, or it carries no application data
            at all, which is what a handshake or an acknowledgement looks like.
          </p>
        )}
      </div>
    </div>
  );
}
