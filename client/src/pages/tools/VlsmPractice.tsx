/**
 * Subnetting drill.
 *
 * Questions are generated, not stored, so the same shape can be practised
 * indefinitely. Every answer is computed with the same unsigned 32-bit
 * arithmetic a router would use, and the worked solution is derived from the
 * same numbers rather than written by hand, so the explanation cannot drift
 * away from the answer it is explaining.
 */

import { useCallback, useMemo, useState } from "react";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------- uint32 kit */

function prefixToMask(prefix: number): number {
  // The shift count is taken modulo 32 in JS, so /0 cannot use the shift.
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function ipToString(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

function parseLooseIpv4(text: string): number | null {
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = ((value << 8) | n) >>> 0;
  }
  return value >>> 0;
}

/** Smallest b such that 2^b >= n. */
function bitsToCover(n: number): number {
  let bits = 0;
  while (Math.pow(2, bits) < n) bits += 1;
  return bits;
}

/** Smallest host-bit count h such that 2^h - 2 >= hosts. */
function hostBitsFor(hosts: number): number {
  let bits = 2;
  while (Math.pow(2, bits) - 2 < hosts) bits += 1;
  return bits;
}

function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/**
 * Which octet the subnet boundary lands in, and how far apart consecutive
 * networks are inside it. This is the "magic number" trick taught for the
 * CCNA, and it is just 256 divided by the number of subnets per octet.
 */
function magicNumber(prefix: number): { octet: number; step: number } {
  const remainder = prefix % 8;
  const octet = remainder === 0 ? prefix / 8 - 1 : Math.floor(prefix / 8);
  const step = Math.pow(2, 8 - (remainder === 0 ? 8 : remainder));
  return { octet: octet + 1, step };
}

function commas(value: number): string {
  return value.toLocaleString("en-US");
}

/* --------------------------------------------------------------- question */

type Difficulty = "easy" | "medium" | "hard";
type FieldKind = "prefix" | "address" | "count";

interface Field {
  id: string;
  label: string;
  placeholder: string;
  kind: FieldKind;
  /** Canonical answer, shown when grading. */
  display: string;
  /** Numeric form used for comparison. */
  value: number;
}

interface Question {
  key: number;
  prompt: string;
  fields: Field[];
  working: string[];
}

interface Block {
  cidr: string;
  base: number;
  prefix: number;
}

function block(cidr: string): Block {
  const [addr, len] = cidr.split("/");
  const prefix = Number(len);
  const base = (parseLooseIpv4(addr)! & prefixToMask(prefix)) >>> 0;
  return { cidr, base, prefix };
}

const ALIGNED = ["10.0.0.0/8", "172.16.0.0/16", "192.168.0.0/16", "192.168.10.0/24", "10.120.0.0/16"].map(
  block,
);

const AWKWARD = [
  "172.16.0.0/18",
  "10.20.0.0/14",
  "192.168.16.0/20",
  "172.20.64.0/19",
  "10.55.128.0/17",
  "192.168.96.0/21",
].map(block);

const SUBNET_COUNTS = [3, 5, 6, 9, 12, 14, 20, 25, 30, 40, 60];
const HOST_COUNTS = [2, 6, 12, 25, 50, 100, 200, 400, 500, 1000, 2000];

/**
 * Valid parent/requirement pairs are enumerated up front rather than
 * rejection-sampled, so a generator can never emit a question that asks for
 * the 12th subnet of a block that only splits into four.
 */
function pairsBySubnets(bases: Block[]): { base: Block; needed: number }[] {
  const out: { base: Block; needed: number }[] = [];
  for (const base of bases) {
    for (const needed of SUBNET_COUNTS) {
      const newPrefix = base.prefix + bitsToCover(needed);
      if (newPrefix <= 30) out.push({ base, needed });
    }
  }
  return out;
}

function pairsByHosts(bases: Block[]): { base: Block; hosts: number }[] {
  const out: { base: Block; hosts: number }[] = [];
  for (const base of bases) {
    for (const hosts of HOST_COUNTS) {
      const newPrefix = 32 - hostBitsFor(hosts);
      // At least two borrowed bits, so "the 3rd subnet" always exists.
      if (newPrefix >= base.prefix + 2 && newPrefix <= 30) out.push({ base, hosts });
    }
  }
  return out;
}

const EASY_PAIRS = pairsBySubnets(ALIGNED);
const MEDIUM_PAIRS = pairsByHosts(ALIGNED);
const HARD_PAIRS = pairsByHosts(AWKWARD);

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

let questionCounter = 0;

function makeQuestion(difficulty: Difficulty): Question {
  questionCounter += 1;
  const key = questionCounter;

  if (difficulty === "easy") {
    // Subnet-count question: borrow bits until 2^b covers the requirement.
    const { base, needed } = pick(EASY_PAIRS);
    const borrow = bitsToCover(needed);
    const newPrefix = base.prefix + borrow;
    const size = Math.pow(2, 32 - newPrefix);
    const available = Math.pow(2, borrow);
    const which = randomInt(2, Math.min(available, 12));
    const network = (base.base + (which - 1) * size) >>> 0;
    const magic = magicNumber(newPrefix);

    return {
      key,
      prompt: `You are given ${base.cidr} and you need at least ${needed} equal-sized subnets. Work out the new prefix length, then the network address of the ${ordinal(which)} subnet.`,
      fields: [
        {
          id: "prefix",
          label: "New prefix length",
          placeholder: "/26",
          kind: "prefix",
          display: `/${newPrefix}`,
          value: newPrefix,
        },
        {
          id: "network",
          label: `Network address of the ${ordinal(which)} subnet`,
          placeholder: "192.168.10.64",
          kind: "address",
          display: ipToString(network),
          value: network,
        },
      ],
      working: [
        `You need ${needed} subnets. Borrowing b bits gives 2^b subnets, so find the smallest b with 2^b >= ${needed}. 2^${borrow - 1} = ${commas(Math.pow(2, borrow - 1))} is not enough and 2^${borrow} = ${commas(available)} is, so borrow ${borrow} ${borrow === 1 ? "bit" : "bits"}.`,
        `Add the borrowed bits to the original prefix: /${base.prefix} + ${borrow} = /${newPrefix}. That leaves ${32 - newPrefix} host bits.`,
        `A /${newPrefix} block holds 2^${32 - newPrefix} = ${commas(size)} addresses, so consecutive subnets start ${commas(size)} addresses apart. In dotted form that is a step of ${magic.step} in octet ${magic.octet}.`,
        `Subnet 1 starts at ${ipToString(base.base)}. Subnet ${which} starts ${which - 1} steps later: ${ipToString(base.base)} + ${which - 1} x ${commas(size)} = ${ipToString(network)}.`,
        `Check: ${available} subnets of /${newPrefix} fit inside ${base.cidr}, and you only needed ${needed}, so ${available - needed} ${available - needed === 1 ? "block is" : "blocks are"} spare.`,
      ],
    };
  }

  if (difficulty === "medium") {
    // Host-count question: size the host field first, then read the prefix off it.
    const { base, hosts } = pick(MEDIUM_PAIRS);
    const hostBits = hostBitsFor(hosts);
    const newPrefix = 32 - hostBits;
    const size = Math.pow(2, hostBits);
    const usable = size - 2;
    const available = Math.pow(2, newPrefix - base.prefix);
    const which = randomInt(2, Math.min(available, 16));
    const network = (base.base + (which - 1) * size) >>> 0;
    const magic = magicNumber(newPrefix);

    return {
      key,
      prompt: `Starting from ${base.cidr}, every subnet must support at least ${commas(hosts)} usable hosts. Give the largest prefix length that still fits, the usable hosts it actually provides, and the network address of the ${ordinal(which)} subnet.`,
      fields: [
        {
          id: "prefix",
          label: "Prefix length",
          placeholder: "/26",
          kind: "prefix",
          display: `/${newPrefix}`,
          value: newPrefix,
        },
        {
          id: "usable",
          label: "Usable hosts per subnet",
          placeholder: "62",
          kind: "count",
          display: commas(usable),
          value: usable,
        },
        {
          id: "network",
          label: `Network address of the ${ordinal(which)} subnet`,
          placeholder: "10.0.0.64",
          kind: "address",
          display: ipToString(network),
          value: network,
        },
      ],
      working: [
        `Size the host field first. With h host bits a subnet holds 2^h addresses, two of which go to the network and broadcast addresses, so you need 2^h - 2 >= ${commas(hosts)}. 2^${hostBits - 1} - 2 = ${commas(Math.pow(2, hostBits - 1) - 2)} is short and 2^${hostBits} - 2 = ${commas(usable)} clears it, so h = ${hostBits}.`,
        `The prefix is whatever is left: 32 - ${hostBits} = /${newPrefix}.`,
        `Each /${newPrefix} covers ${commas(size)} addresses, ${commas(usable)} of them usable. Networks therefore step by ${magic.step} in octet ${magic.octet}.`,
        `Subnet 1 is ${ipToString(base.base)}, so subnet ${which} is ${ipToString(base.base)} + ${which - 1} x ${commas(size)} = ${ipToString(network)}.`,
        `${base.cidr} splits into ${commas(available)} subnets of /${newPrefix}, which is how many networks of this size you have to work with.`,
      ],
    };
  }

  // Hard: an unaligned parent block, and the answer includes the usable range.
  const { base, hosts } = pick(HARD_PAIRS);
  const hostBits = hostBitsFor(hosts);
  const newPrefix = 32 - hostBits;
  const size = Math.pow(2, hostBits);
  const usable = size - 2;
  const available = Math.pow(2, newPrefix - base.prefix);
  const which = randomInt(3, Math.min(available, 24));
  const network = (base.base + (which - 1) * size) >>> 0;
  const broadcast = (network | ((~prefixToMask(newPrefix)) >>> 0)) >>> 0;
  const lastHost = (broadcast - 1) >>> 0;
  const magic = magicNumber(newPrefix);

  return {
    key,
    prompt: `A campus block of ${base.cidr} is being carved into equal subnets of at least ${commas(hosts)} usable hosts each. For the ${ordinal(which)} subnet, give the prefix length, the network address, and the last usable host address.`,
    fields: [
      {
        id: "prefix",
        label: "Prefix length",
        placeholder: "/26",
        kind: "prefix",
        display: `/${newPrefix}`,
        value: newPrefix,
      },
      {
        id: "network",
        label: `Network address of the ${ordinal(which)} subnet`,
        placeholder: "172.20.65.128",
        kind: "address",
        display: ipToString(network),
        value: network,
      },
      {
        id: "last",
        label: "Last usable host in that subnet",
        placeholder: "172.20.65.190",
        kind: "address",
        display: ipToString(lastHost),
        value: lastHost,
      },
    ],
    working: [
      `${commas(hosts)} usable hosts needs h host bits with 2^h - 2 >= ${commas(hosts)}. h = ${hostBits} gives ${commas(usable)} usable, so the prefix is 32 - ${hostBits} = /${newPrefix}.`,
      `Each subnet spans ${commas(size)} addresses. Because the parent is /${base.prefix}, the first subnet inherits the parent's own network address, ${ipToString(base.base)}, and the rest step by ${magic.step} in octet ${magic.octet}.`,
      `Subnet ${which} starts ${which - 1} steps in: ${ipToString(base.base)} + ${which - 1} x ${commas(size)} = ${ipToString(network)}.`,
      `The broadcast address is the network address with every host bit set: ${ipToString(network)} + ${commas(size)} - 1 = ${ipToString(broadcast)}.`,
      `The last usable host is one below the broadcast address: ${ipToString(lastHost)}. The usable range is ${ipToString((network + 1) >>> 0)} to ${ipToString(lastHost)}.`,
      `Sanity check: ${base.cidr} holds ${commas(available)} subnets of /${newPrefix}, and subnet ${which} is inside that count.`,
    ],
  };
}

/* --------------------------------------------------------------- grading */

function gradeField(field: Field, raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (field.kind === "prefix") {
    const cleaned = text.replace(/^\//, "").trim();
    return /^\d{1,2}$/.test(cleaned) && Number(cleaned) === field.value;
  }
  if (field.kind === "count") {
    const cleaned = text.replace(/[,\s_]/g, "");
    return /^\d+$/.test(cleaned) && Number(cleaned) === field.value;
  }
  const parsed = parseLooseIpv4(text);
  return parsed !== null && parsed === field.value;
}

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Octet-aligned parent, subnet-count requirement." },
  { id: "medium", label: "Medium", blurb: "Host-count requirement, sized from the host bits up." },
  { id: "hard", label: "Hard", blurb: "Unaligned parent block, plus the usable range." },
];

/* ------------------------------------------------------------------ view */

export function VlsmPractice() {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [question, setQuestion] = useState<Question>(() => makeQuestion("easy"));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Record<string, boolean> | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ asked: 0, correct: 0 });

  const newQuestion = useCallback((level: Difficulty) => {
    setQuestion(makeQuestion(level));
    setAnswers({});
    setGraded(null);
    setRevealed(false);
  }, []);

  const allCorrect = useMemo(
    () => (graded ? question.fields.every((field) => graded[field.id]) : false),
    [graded, question.fields],
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (graded) return;
    const marks: Record<string, boolean> = {};
    for (const field of question.fields) marks[field.id] = gradeField(field, answers[field.id] ?? "");
    setGraded(marks);
    setRevealed(true);
    const everyOne = question.fields.every((field) => marks[field.id]);
    setScore((prev) => ({ asked: prev.asked + 1, correct: prev.correct + (everyOne ? 1 : 0) }));
  };

  const percent = score.asked === 0 ? 0 : Math.round((score.correct / score.asked) * 100);

  return (
    <ToolShell
      slug="vlsm-practice"
      notes={
        <>
          <p>
            Subnetting questions come in two flavours and it is worth spotting which one you are
            looking at before you start. If the requirement is a number of <em>subnets</em>, you
            borrow bits from the host field until 2 to the power of the borrowed bits covers the
            count. If the requirement is a number of <em>hosts</em>, you size the host field first,
            because 2 to the power of the host bits minus 2 has to cover the count, and the prefix is
            whatever 32 minus that leaves. Working the wrong way round is the most common way to lose
            marks on these.
          </p>
          <p>
            The minus 2 is the network address and the broadcast address, which no host can use on a
            /30 or shorter. It does not apply to a /31, where RFC 3021 makes both addresses usable on
            a point-to-point link, or to a /32, which is a single host route. This drill never
            generates prefixes longer than /30, so minus 2 is always the right rule here, but the
            exception is worth carrying into the exam room.
          </p>
          <p>
            The fast way to find the Nth subnet by hand is the block size, sometimes taught as the
            magic number. Take 256 minus the value of the interesting octet in the mask: a /26 has
            192 in the fourth octet, 256 minus 192 is 64, so networks appear at .0, .64, .128 and
            .192. Real VLSM then allocates largest requirement first, so that the big blocks land on
            their natural boundaries and the small ones fill in behind them without overlapping.
          </p>
          <p>
            The worked solution under each question is generated from the same numbers as the answer
            key, so it always matches. Read it even when you got the question right, because the
            useful thing to check is whether your method matches, not just your answer.
          </p>
        </>
      }
    >
      <div className="space-y-6">
        <ToolPanel title="Difficulty">
          <div className="flex flex-wrap gap-2">
            {DIFFICULTIES.map((level) => {
              const active = level.id === difficulty;
              return (
                <button
                  key={level.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`button-difficulty-${level.id}`}
                  onClick={() => {
                    setDifficulty(level.id);
                    newQuestion(level.id);
                  }}
                  className={`inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[11px] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                    active
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal))] text-[hsl(var(--brand-obsidian))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))] hover:border-[hsl(var(--brand-signal)/0.6)]"
                  }`}
                >
                  {level.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            {DIFFICULTIES.find((level) => level.id === difficulty)?.blurb}
          </p>
        </ToolPanel>

        <ToolPanel title="Question">
          <p
            key={question.key}
            data-testid="text-question"
            className="font-mono-tight text-base leading-relaxed text-[hsl(var(--brand-bone))]"
          >
            {question.prompt}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {question.fields.map((field) => {
              const mark = graded ? graded[field.id] : null;
              return (
                <div key={`${question.key}-${field.id}`}>
                  <label
                    htmlFor={`answer-${field.id}`}
                    className="block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
                  >
                    {field.label}
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <input
                      id={`answer-${field.id}`}
                      type="text"
                      inputMode="text"
                      spellCheck={false}
                      autoComplete="off"
                      readOnly={graded !== null}
                      value={answers[field.id] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setAnswers((prev) => ({ ...prev, [field.id]: event.target.value }))
                      }
                      className={`min-w-0 flex-1 rounded-lg border bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:outline-none ${
                        mark === null
                          ? "border-[hsl(var(--brand-iron))] focus:border-[hsl(var(--brand-signal))]"
                          : mark
                            ? "border-[hsl(var(--brand-signal))]"
                            : "border-[hsl(var(--brand-danger))]"
                      }`}
                    />
                    {mark !== null ? (
                      <span
                        className={`font-mono-tight text-xs ${
                          mark ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-danger))]"
                        }`}
                      >
                        <span aria-hidden="true">{mark ? "✓" : "✕"}</span>{" "}
                        {mark ? "Correct" : `Correct answer: ${field.display}`}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap gap-3 pt-2">
              {graded === null ? (
                <button
                  type="submit"
                  data-testid="button-check"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  Check answer
                </button>
              ) : null}
              <button
                type="button"
                data-testid="button-new-question"
                onClick={() => newQuestion(difficulty)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                New question
              </button>
              {graded === null ? (
                <button
                  type="button"
                  onClick={() => setRevealed((prev) => !prev)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-transparent px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  {revealed ? "Hide working" : "Show working"}
                </button>
              ) : null}
            </div>
          </form>

          {graded ? (
            <p
              role="status"
              className={`mt-5 font-mono-tight text-sm ${
                allCorrect ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-amber))]"
              }`}
            >
              <span aria-hidden="true">{allCorrect ? "✓" : "!"}</span>{" "}
              {allCorrect
                ? "All parts correct."
                : `${question.fields.filter((field) => graded[field.id]).length} of ${question.fields.length} parts correct.`}
            </p>
          ) : null}
        </ToolPanel>

        {revealed ? (
          <ToolPanel title="Working">
            <ol className="space-y-3">
              {question.working.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="mt-[2px] shrink-0 font-mono-tight text-[10px] tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </ToolPanel>
        ) : null}

        <ToolPanel title="Session score">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]" data-testid="text-score">
              <span className="text-2xl text-[hsl(var(--brand-signal))]">{score.correct}</span>
              <span className="text-[hsl(var(--brand-ash))]"> / {score.asked} fully correct</span>
              {score.asked > 0 ? (
                <span className="text-[hsl(var(--brand-ash))]"> · {percent}%</span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => setScore({ asked: 0, correct: 0 })}
              className="inline-flex min-h-[28px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Reset score
            </button>
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            A question counts as correct only when every part of it is. The score lives in this tab
            and resets when you reload.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
