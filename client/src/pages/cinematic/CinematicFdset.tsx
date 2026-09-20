/**
 * The struct, drawn as bytes, with the bit where it actually landed.
 *
 * Every question here is answered by one division and then by a struct
 * layout, so the drawing is the struct: one bar per member, to scale, with
 * the fd_set at the front and a mark on the byte the macro touched. A reader
 * who can see which member the mark is in has the answer.
 *
 * Nothing is drawn before an answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  CASES,
  asFdset,
  asFortify,
  asHex,
  bitFor,
  bitValue,
  byteFor,
  checked,
  correctOption,
  fieldAt,
  inTheSet,
  landsIn,
  loadSolvedFdset,
  outcome,
  recordSolvedFdset,
  reported,
  setBytes,
  watched,
  whyNot,
  type Case,
  type Setup,
} from "@/lib/fdset/index";

const SITE_URL = "https://maxdoubin.com";

function severity(item: Case): StageAccent {
  if (inTheSet(item.setup)) return "signal";
  /* Loud is better than quiet here, so the fortified build is the mild one. */
  return checked(item.setup) ? "amber" : "danger";
}

/** The members, to scale, with the byte the macro touched marked on one. */
function bars(setup: Setup) {
  const span = setup.fields.reduce((end, field) => Math.max(end, field.at + field.size), 0);
  const hit = byteFor(setup);
  return {
    span,
    hit,
    members: setup.fields.map((field) => ({
      ...field,
      /* Where along this member the byte falls, as a fraction of it. */
      mark: hit >= field.at && hit < field.at + field.size ? (hit - field.at) / field.size : null,
    })),
  };
}

export function CinematicFdset() {
  useSEO({
    title: "One Descriptor Too Many: FD_SETSIZE And select | Max Doubin",
    description:
      "FD_SET(1024) sets bit 0 of byte 128, which is one past the end of a 128 byte fd_set, and the byte after it belongs to something else in your struct. No error, no return value, and glibc's check is off unless the build asked for it. Ten measured calls.",
    canonical: `${SITE_URL}/fdset`,
    ogImage: `${SITE_URL}/images/og/fdset.jpg`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedFdset());
    setMounted(true);
  }, []);

  const answered = picked !== null;
  const right = useMemo(() => correctOption(active), [active]);
  const correct = answered && picked === right?.id;

  const open = useCallback((item: Case) => {
    setActive(item);
    setPicked(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (picked !== null) return;
      setPicked(id);
      if (id === correctOption(active)?.id) {
        recordSolvedFdset(active.slug);
        setSolved(loadSolvedFdset());
      }
    },
    [active, picked],
  );

  const setup = active.setup;
  const drawn = useMemo(() => bars(setup), [setup]);
  const owner = fieldAt(setup.fields, byteFor(setup));

  return (
    <CinematicLayout>
      <PracticeStage
        accent={answered ? severity(active) : "signal"}
        mood={!answered ? "calm" : correct ? "recovering" : "tense"}
        flashKey={0}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} calls, one descriptor each
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              One descriptor too many.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Ten calls, one question each. Work out where the bit goes, which member of the
              program&apos;s own struct it lands in, and whether anything at all says so.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              <code>FD_SET(fd, &amp;set)</code> sets bit <code>fd % 8</code> of byte{" "}
              <code>fd / 8</code>. That is the whole of it, and it is the same arithmetic on both
              sides of 1024, which is why nothing notices 1024. An <code>fd_set</code> is 128
              bytes, the descriptor comes from <code>accept()</code>, and the byte after the 128th
              belongs to whatever the compiler put next.
            </p>
          </header>

          <ul className="mt-11 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="fdset-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`fdset-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-cyan))]">
                      {item.setup.call}({item.setup.fd})
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[0.625rem] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]">
                        done
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[0.78125rem] leading-snug text-[hsl(var(--brand-bone))]">
                    {item.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
              {active.name}
            </h2>
            <p
              className="mt-3 font-mono-tight text-[0.84375rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="fdset-brief"
            >
              {active.brief}
            </p>

            <div
              className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4"
              data-testid="fdset-setup"
            >
              <pre className="whitespace-pre font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{asFdset(setup)
  .map((line) => `${line.name.padEnd(16)} ${line.value.padStart(22)}  # ${line.unit}`)
  .join("\n")}
              </pre>
            </div>

            <h3 className="mt-7 font-techno text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · {active.question}
            </h3>
            <div className="mt-3 space-y-2">
              {active.options.map((option) => {
                const chose = picked === option.id;
                const isRight = option.id === right?.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => pick(option.id)}
                    disabled={answered}
                    data-testid={`fdset-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[0.8125rem] leading-relaxed transition-colors disabled:cursor-default ${
                      !answered
                        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                        : isRight
                          ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                          : chose
                            ? "border-[hsl(var(--brand-danger)/0.8)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-bone))]"
                            : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    {option.claim}
                  </button>
                );
              })}
            </div>

            {answered ? (
              <div className="mt-6 space-y-5" data-testid="fdset-verdict">
                <p className="font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {correct ? "Yes." : "No."} {setup.fd} over 8 is byte {byteFor(setup)}, and{" "}
                  {setup.fd} mod 8 is bit {bitFor(setup)}, so the macro touches {asHex(bitValue(setup))} at byte{" "}
                  {byteFor(setup)}, which is {owner ? `inside ${owner.name}` : landsIn(setup)}.{" "}
                  {inTheSet(setup)
                    ? "That is inside the set, so nothing is wrong with this one."
                    : reported(setup)
                      ? "The build has the check compiled in, so the process is terminated there."
                      : "Nothing reports it."}
                </p>

                {/* ── the struct, to scale, with the byte marked ── */}
                <div data-testid="fdset-struct">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 font-mono-tight text-[0.71875rem]">
                    <span className="text-[hsl(var(--brand-bone-dim))]">
                      {drawn.span} bytes, the first {setBytes(setup.setSize)} of them the set
                    </span>
                    <span className="text-[hsl(var(--brand-bone))]">byte {drawn.hit}</span>
                  </div>
                  <div className="mt-2.5 space-y-1">
                    {drawn.members.map((member) => (
                      <div key={member.name} className="flex items-center gap-2">
                        <span className="w-[76px] shrink-0 truncate text-right font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                          {member.name}
                        </span>
                        <span
                          className="relative h-4 min-w-[3px] rounded-[2px] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))]"
                          style={{ width: `${Math.max(1.2, (member.size / drawn.span) * 100)}%` }}
                        >
                          {member.mark !== null ? (
                            <span
                              className="absolute top-0 h-4 w-[3px] rounded-[1px] bg-[hsl(var(--brand-danger))]"
                              style={{ left: `calc(${member.mark * 100}% - 1px)` }}
                            />
                          ) : null}
                        </span>
                        <span className="shrink-0 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash)/0.8)]">
                          {member.at} to {member.at + member.size - 1}
                          {member.mark !== null ? " · here" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 font-mono-tight text-[0.65625rem] leading-relaxed text-[hsl(var(--brand-ash)/0.85)]">
                    {inTheSet(setup)
                      ? "The byte is one of the ones the set owns, which is the only arrangement where the macro does what it reads as doing."
                      : owner
                        ? `The byte is past the set and inside ${owner.name}, so the descriptor number picked a member of the program's own struct to ${setup.call === "FD_ISSET" ? "read" : "write"}.`
                        : landsIn(setup) === "padding"
                          ? "The byte is past the set and in padding the compiler left for alignment, which is the version of this that survives every test and moves the moment the struct does."
                          : "The byte is past the whole struct, so what it belongs to is not visible from this declaration at all."}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
                  <pre
                    className="whitespace-pre font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    data-testid="fdset-ledger"
                  >
{`the macro

  called                      ${`${setup.call}(${setup.fd}, &set)`.padEnd(24)}
  byte                        ${String(byteFor(setup)).padEnd(24)} ${setup.fd} over 8
  bit                         ${String(bitFor(setup)).padEnd(24)} ${setup.fd} mod 8
  the byte becomes            ${asHex(bitValue(setup)).padEnd(24)} in a byte that was zero

the object

  the set owns                ${`bytes 0 to ${setBytes(setup.setSize) - 1}`.padEnd(24)} FD_SETSIZE is ${setup.setSize}
  the whole struct            ${`${drawn.span} bytes`.padEnd(24)} ${setup.fields.length} members
  byte ${String(byteFor(setup)).padEnd(4)}                  ${landsIn(setup).padEnd(24)} ${inTheSet(setup) ? "inside the set" : "past the end of it"}

what happens

  the build                   ${asFortify(setup.fortify).padEnd(24)} ${checked(setup) ? "the check is compiled in" : "the check is not compiled in"}
  the call                    ${outcome(setup)}
  anything says so            ${reported(setup) ? "yes, and the process stops there" : "no"}
  select watches ${String(setup.fd).padEnd(13)}${watched(setup) ? "yes" : `no, ${whyNot(setup)}`}`}
                  </pre>
                </div>

                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p
                  className="border-l-2 border-[hsl(var(--brand-cyan)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                  data-testid="fdset-fix"
                >
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-cyan))]">
                    What to do ·{" "}
                  </span>
                  {active.fix}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The belief this breaks ·{" "}
                  </span>
                  {active.breaks}
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="fdset-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[0.71875rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything the answer needs is above. Divide the descriptor by eight to get the
                byte, and then read the byte off the list of members and their offsets, which is
                the part the macro cannot do for you. Do not stop at whether the descriptor is
                past 1023: the useful answer is which of the program&apos;s own fields is on the
                other side of the set. The struct is drawn once you have committed to an answer.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[0.75rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="fdset-progress"
          >
            {mounted ? `${solved.length} of ${CASES.length} called right` : `${CASES.length} calls`}
          </p>

          <p className="mt-6 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            The model reproduces the host it was written on, Linux 6.18.44 with glibc on x86-64,
            measured by putting an fd_set inside a struct with known offsets, calling the macros,
            and reading the whole object back a byte at a time. FD_SETSIZE is 1024 and an fd_set is
            128 bytes. FD_SET(1024) leaves 0x01 at offset 128, FD_SET(1031) leaves 0x80 at the same
            byte, FD_SET(1500) leaves 0x10 at offset 187, and FD_SET(5119) leaves 0x80 at offset
            639. A first attempt at that measurement filled the bytes after the set with 0xAA,
            which already has every odd bit set, so half the descriptors read as clean and the
            wrong half looked like a pattern. Against the measured struct the landing places are
            live, name, the four bytes of padding before deadline, handler and the tail buffer,
            picked by nothing but the descriptor number. FD_ISSET reads the same byte: with live
            set to 3 and name set to worker-7 and the set empty throughout, it reported descriptors
            1024 and 1025 ready from the counter and 39 more between 1056 and 1117 from the ASCII
            of the name. glibc ships a bounds check and it is off unless the build asks: at
            -D_FORTIFY_SOURCE=0, and with no flag at all on this toolchain, FD_SET(1024) returns
            normally, and at 1, 2 and 3 the process prints bit out of range and terminates. The
            threshold is the lowest level there is rather than 2, which this model had wrong until
            all four were measured, because glibc guards this one on __USE_FORTIFY_LEVEL being
            greater than zero. The kernel
            has no such number: a readable pipe end at descriptor 2000, a hand rolled 512 byte
            bitmap and nfds of 2001 gave select a return of 1 with the bit set on the way back,
            while the same descriptor with nfds left at 1024 gave 0, because the syscall reads
            ceil(nfds / 8) bytes and stops. CI recomputes every answer by painting the object one
            byte at a time and handing descriptors out eight to a byte from zero, across 2268
            combinations of layout, set size, descriptor, nfds, macro and build flag. Thirty two
            bit builds, pselect, epoll and any libc other than glibc are not modeled, and neither
            is what the clobbered bit does afterwards, which is the point and is not a property of
            select.
          </p>
          <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            For where the descriptors come from in the first place,{" "}
            <Link
              href="/fds"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              too many open files
            </Link>{" "}
            is which of the four limits is the binding one, and{" "}
            <Link
              href="/locks"
              className="tap-target text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              three locks, one file
            </Link>{" "}
            is what else an open file description carries.
          </p>

          <ReadAboutThis href="/fdset" />

          <p className="mt-10 font-mono-tight text-[0.78125rem] text-[hsl(var(--brand-ash))]">
            <Link href="/practice" className="underline decoration-dotted hover:text-[hsl(var(--brand-bone))]">
              All practice material
            </Link>
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
