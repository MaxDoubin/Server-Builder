/**
 * The labs index.
 *
 * Every lab is a simulated machine with a fault in it and a question. Nothing
 * here reaches a real host, which is the point: a reader can run `chmod` on a
 * production-shaped filesystem, get it wrong, and restart.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { LABS, LAB_ORDER, type Lab } from "@/lib/labs/labs";
import { loadSolved } from "@/lib/labs/progress";
import { pluralise } from "@/lib/plural";
import { ReadAboutThis } from "@/components/practise/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

export function CinematicLabs() {
  useSEO({
    title: "Hands-on labs | Max Doubin",
    description:
      "A simulated Linux host in the browser, with a fault in it. Read the interface, the routing table, the sockets and the logs, and say what is wrong. Nothing here touches a real machine.",
    canonical: `${SITE_URL}/labs`,
  });

  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setSolved(loadSolved());
    setMounted(true);
  }, []);

  const groups = LAB_ORDER.map((difficulty) => ({
    difficulty,
    items: LABS.filter((lab) => lab.difficulty === difficulty),
  })).filter((group) => group.items.length > 0);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practise · Hands on
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Labs.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A Linux host, simulated in this browser, with something wrong with it. Real command
              output, real permission bits, a real routing table, real logs. Read it, work out what
              is broken, and say so.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Nothing here reaches a real machine, and nothing you type leaves the page. Most of
              these ask for a diagnosis rather than a repair, because that is the shape of nearly
              all troubleshooting: you are not asked to fix the router, you are asked to say which
              of six things is wrong before anyone lets you near it.
            </p>
          </header>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[hsl(var(--brand-iron))] py-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            <span>
              {LABS.length} {pluralise(LABS.length, "lab")}
            </span>
            <span aria-live="polite">{mounted ? `${solved.length} solved here` : " "}</span>
          </div>

          {groups.map((group) => (
            <section key={group.difficulty} className="mt-11">
              <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · {group.difficulty}
              </h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {group.items.map((lab) => (
                  <LabCard key={lab.slug} lab={lab} solved={mounted && solved.includes(lab.slug)} />
                ))}
              </ul>
            </section>
          ))}

          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Every lab ships a recorded solution that CI replays through the same shell on every
            push, so a lab that has stopped being solvable fails the build rather than your
            afternoon.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For the decisions rather than the commands, the{" "}
            <Link
              href="/scenarios"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              incident scenarios
            </Link>{" "}
            put you in the first fifteen minutes of a ransomware call, a cooling failure or a BGP
            hijack, with many endings and no score.
          </p>
        </div>
        <ReadAboutThis href="/labs" />

      </div>
    </CinematicLayout>
  );
}

function LabCard({ lab, solved }: { lab: Lab; solved: boolean }) {
  return (
    <li>
      <Link
        href={`/labs/${lab.slug}`}
        data-testid={`card-lab-${lab.slug}`}
        className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
      >
        <span className="font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
          {lab.title}
        </span>
        <span className="mt-2 flex-1 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          {lab.tagline}
        </span>
        <span className="mt-4 flex items-center gap-4 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          <span>{lab.hints.length} hints</span>
          {solved ? <span className="text-[hsl(var(--brand-signal))]">Solved</span> : null}
        </span>
      </Link>
    </li>
  );
}
