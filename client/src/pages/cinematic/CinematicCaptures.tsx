/** The capture index. */
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { CAPTURES } from "@/lib/capture/index";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

export function CinematicCaptures() {
  useSEO({
    title: "Packet captures | Max Doubin",
    description:
      "Read a packet capture in the browser, with a real Wireshark display filter bar. Find the password sent in the clear, and the beacon that checks in every sixty seconds.",
    canonical: `${SITE_URL}/capture`,
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Practise · Packet analysis
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Captures.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A packet list, a detail tree and a display filter bar that takes real Wireshark
              syntax. Type a filter, narrow a hundred packets to four, and answer the question.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The filter bar supports ==, !=, &gt;, &lt;, contains, field existence, and &amp;&amp;
              || ! with brackets, on any field the packets carry. It refuses what it cannot do
              rather than quietly ignoring half your expression, because a filter that works only
              here is worse than no filter at all.
            </p>
          </header>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[hsl(var(--brand-iron))] py-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
            <span>
              {CAPTURES.length} {pluralise(CAPTURES.length, "capture")}
            </span>
            <span>
              {CAPTURES.reduce((sum, c) => sum + c.packets.length, 0)} packets
            </span>
            <span>
              {CAPTURES.reduce((sum, c) => sum + c.questions.length, 0)} questions
            </span>
          </div>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {CAPTURES.map((capture) => (
              <li key={capture.slug}>
                <Link
                  href={`/capture/${capture.slug}`}
                  data-testid={`card-capture-${capture.slug}`}
                  className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  <span className="font-techno text-[9px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                    {capture.difficulty}
                  </span>
                  <span className="mt-2 font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
                    {capture.title}
                  </span>
                  <span className="mt-2 flex-1 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {capture.tagline}
                  </span>
                  <span className="mt-4 flex gap-4 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                    <span>{capture.packets.length} packets</span>
                    <span>{capture.questions.length} questions</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-14 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            For a prompt rather than a packet list, the{" "}
            <Link href="/labs" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
              hands-on labs
            </Link>{" "}
            give you a simulated host with a fault in it, and the{" "}
            <Link href="/scenarios" className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
              incident scenarios
            </Link>{" "}
            put you in the first fifteen minutes of one.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
