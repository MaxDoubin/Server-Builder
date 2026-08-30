/**
 * Password entropy calculator.
 *
 * Two different numbers get called entropy and only one of them is about
 * guessing. Search space entropy is length times log2 of the pool the
 * characters were drawn from, and it is a statement about the process that
 * generated the password. Shannon entropy is computed from the characters
 * actually present, and it measures how varied this one string is. Both are
 * shown, side by side, because quoting either on its own is how a password
 * that a wordlist cracks in seconds ends up described as strong.
 *
 * Nothing typed here leaves the tab: no request, no storage, no history.
 */

import { useMemo, useState } from "react";
import { FAST_HASH_GUESSES_PER_SECOND, SLOW_HASH_GUESSES_PER_SECOND } from "@/lib/toolLimits";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------ characters */

interface CharClass {
  id: string;
  label: string;
  /** How many characters an attacker adds to the pool for this class. */
  size: number;
  /** Hashcat mask token, which is also how the pattern row is drawn. */
  mask: string;
  test: (char: string) => boolean;
}

const CLASSES: CharClass[] = [
  { id: "lower", label: "Lowercase", size: 26, mask: "?l", test: (c) => c >= "a" && c <= "z" },
  { id: "upper", label: "Uppercase", size: 26, mask: "?u", test: (c) => c >= "A" && c <= "Z" },
  { id: "digit", label: "Digits", size: 10, mask: "?d", test: (c) => c >= "0" && c <= "9" },
  {
    id: "symbol",
    label: "ASCII symbols",
    size: 32,
    mask: "?s",
    test: (c) => /[!-/:-@[-`{-~]/.test(c),
  },
  { id: "space", label: "Space", size: 1, mask: "?s", test: (c) => c === " " },
];

interface Analysis {
  /** Code points, not UTF-16 units, so an emoji counts once. */
  chars: string[];
  length: number;
  used: CharClass[];
  /** Distinct code points outside printable ASCII. */
  exotic: string[];
  pool: number;
  searchBits: number;
  shannonPerChar: number;
  shannonTotal: number;
  distinct: number;
  mask: string;
  maskBits: number;
}

function analyse(password: string): Analysis {
  const chars = [...password];
  const used = CLASSES.filter((cls) => chars.some(cls.test));
  const exotic = [...new Set(chars.filter((c) => !CLASSES.some((cls) => cls.test(c))))];

  // An unknown code point contributes only itself. Guessing what alphabet a
  // non-ASCII character was drawn from would inflate the number on nothing
  // but optimism, so the count is the conservative floor instead.
  const pool = used.reduce((sum, cls) => sum + cls.size, 0) + exotic.length;

  const counts = new Map<string, number>();
  for (const char of chars) counts.set(char, (counts.get(char) ?? 0) + 1);
  let perChar = 0;
  for (const count of counts.values()) {
    const p = count / chars.length;
    perChar -= p * Math.log2(p);
  }

  // Anything outside the known classes becomes a custom charset slot, the
  // ?1 hashcat reserves for one, and it is worth exactly what it contributes
  // to the pool above so the two figures cannot contradict each other.
  const exoticSize = Math.max(exotic.length, 1);
  const maskTokens = chars.map((char) => CLASSES.find((cls) => cls.test(char))?.mask ?? "?1");
  const maskBits = chars.reduce((sum, char) => {
    const cls = CLASSES.find((entry) => entry.test(char));
    return sum + Math.log2(cls ? cls.size : exoticSize);
  }, 0);

  return {
    chars,
    length: chars.length,
    used,
    exotic,
    pool,
    searchBits: chars.length === 0 ? 0 : chars.length * Math.log2(pool),
    shannonPerChar: chars.length === 0 ? 0 : perChar,
    shannonTotal: chars.length === 0 ? 0 : perChar * chars.length,
    distinct: counts.size,
    mask: maskTokens.join(""),
    maskBits,
  };
}

/* ----------------------------------------------------------------- scales */

const LOG10_2 = Math.log10(2);
const SECONDS_PER_YEAR = 31_557_600;
const LOG10_YEAR = Math.log10(SECONDS_PER_YEAR);

/** 1.4 × 10^21, from a base 10 logarithm, so nothing ever overflows to Infinity. */
function scientific(log10Value: number): string {
  let exponent = Math.floor(log10Value);
  let mantissa = Math.pow(10, log10Value - exponent);
  if (mantissa >= 9.95) {
    mantissa = 1;
    exponent += 1;
  }
  return `${mantissa.toFixed(1)} × 10^${exponent}`;
}

function formatGuesses(bits: number): string {
  const log10 = bits * LOG10_2;
  if (log10 < 15) return Math.round(Math.pow(10, log10)).toLocaleString("en-US");
  return scientific(log10);
}

/**
 * Time as a phrase, from the base 10 logarithm of a number of seconds. The
 * exponent can reach the hundreds, so the arithmetic has to stay in log space
 * until the value is small enough for a double to hold it.
 */
function humanTime(log10Seconds: number): string {
  if (log10Seconds < 0) return "instantly";
  if (log10Seconds < 12) {
    const seconds = Math.pow(10, log10Seconds);
    if (seconds < 1) return "instantly";
    if (seconds < 90) return `${Math.round(seconds)} seconds`;
    if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 172_800) return `${Math.round(seconds / 3600)} hours`;
    if (seconds < SECONDS_PER_YEAR) return `${Math.round(seconds / 86_400)} days`;
    return `${Math.round(seconds / SECONDS_PER_YEAR).toLocaleString("en-US")} years`;
  }
  return `${scientific(log10Seconds - LOG10_YEAR)} years`;
}

interface Attack {
  label: string;
  /** Guesses per second. */
  rate: number;
  rateLabel: string;
  note: string;
}

const ATTACKS: Attack[] = [
  {
    label: "Online, throttled",
    rate: 100 / 3600,
    rateLabel: "100 per hour",
    note: "100 an hour. A login that rate limits, backs off and locks out.",
  },
  {
    label: "Online, no limit",
    rate: 10,
    rateLabel: "10 per second",
    note: "10 a second. Credential stuffing against an endpoint nobody put a limit on.",
  },
  {
    label: "Offline, bcrypt cost 12",
    rate: SLOW_HASH_GUESSES_PER_SECOND,
    rateLabel: `10^${Math.log10(SLOW_HASH_GUESSES_PER_SECOND)} per second`,
    note: "A deliberately slow hash on a GPU rig. This is what a stolen database should cost.",
  },
  {
    label: "Offline, SHA-256",
    rate: 1e11,
    rateLabel: "10^11 per second",
    note: "A fast general purpose hash, eight current GPUs. Fine for integrity, wrong for passwords.",
  },
  {
    label: "Offline, MD5 or NTLM",
    rate: FAST_HASH_GUESSES_PER_SECOND,
    rateLabel: `10^${Math.log10(FAST_HASH_GUESSES_PER_SECOND)} per second`,
    note: "Small and fast. A domain controller dump against a rig clears a trillion a second.",
  },
];

/** Average case is half the keyspace, which is one bit cheaper than the whole. */
function log10SecondsToCrack(bits: number, rate: number): number {
  return Math.max(bits - 1, 0) * LOG10_2 - Math.log10(rate);
}

/* --------------------------------------------------------------- patterns */

/** Bases that show up at the top of every leaked credential dump. */
const COMMON_BASES = [
  "password", "passwd", "qwerty", "azerty", "letmein", "welcome", "monkey", "dragon",
  "iloveyou", "sunshine", "princess", "football", "baseball", "superman", "batman",
  "trustno", "master", "shadow", "michael", "jordan", "hunter", "ninja", "hello",
  "freedom", "whatever", "computer", "starwars", "cheese", "secret", "summer",
  "winter", "spring", "autumn", "changeme", "default", "guest", "admin", "root",
  "toor", "test", "abc", "login", "access",
];

const KEYBOARD_RUNS = [
  "qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "qazwsx", "1qaz2wsx", "!@#$%^&*()",
];

/** Leet substitutions, undone before the wordlist check because a cracker undoes them too. */
function deleet(text: string): string {
  return text
    .toLowerCase()
    .replace(/[4@]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t");
}

function longestRun(chars: string[], step: number): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < chars.length; i += 1) {
    const previous = chars[i - 1].charCodeAt(0);
    if (chars[i].charCodeAt(0) - previous === step) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return chars.length === 0 ? 0 : best;
}

function findWarnings(password: string, analysis: Analysis): string[] {
  const warnings: string[] = [];
  const lower = password.toLowerCase();
  const plain = deleet(password);

  if (analysis.length > 0 && analysis.length < 12) {
    warnings.push(
      "Under 12 characters. Length buys more than any other single change, because every extra character multiplies the space rather than adding to it.",
    );
  }
  if (analysis.used.length === 1 && analysis.exotic.length === 0 && analysis.length > 0) {
    warnings.push(
      "One character class only. An attacker who spots that runs a mask over that class alone and skips the rest of the keyspace entirely.",
    );
  }

  const hit = COMMON_BASES.find((base) => plain.includes(base));
  if (hit) {
    warnings.push(
      `Contains "${hit}", which sits near the top of every credential dump. A wordlist plus rules finds it long before any brute force starts, so the bit count above does not apply to it.`,
    );
  }

  if (/(.)\1\1/.test(password)) {
    warnings.push("Three or more of the same character in a row. Rule based cracking generates those first.");
  }
  if (longestRun(analysis.chars, 1) >= 4 || longestRun(analysis.chars, -1) >= 4) {
    warnings.push("A run of four or more sequential characters, such as 1234 or wxyz. Sequences are the second thing a rule set tries.");
  }
  const run = KEYBOARD_RUNS.find((row) => {
    for (let i = 0; i + 4 <= row.length; i += 1) {
      if (lower.includes(row.slice(i, i + 4))) return true;
    }
    return false;
  });
  if (run) {
    warnings.push("Four or more keys in a row off the keyboard. Keyboard walks are a standard generator in hashcat and John.");
  }
  if (/^[A-Z][a-z]+\d{1,4}[!@#$%^&*.?]?$/.test(password)) {
    warnings.push(
      "Capital, word, digits, one symbol: this is exactly the shape a complexity policy produces, so it is exactly the shape crackers target. The policy narrowed the space rather than widening it.",
    );
  }
  if (/(19|20)\d{2}$/.test(password)) {
    warnings.push("Ends in something that looks like a year. Roughly a hundred candidates, appended by a rule in one pass.");
  }
  if (analysis.length > 0 && analysis.distinct <= Math.ceil(analysis.length / 3)) {
    warnings.push("Very few distinct characters for the length, so the Shannon figure is far below the search space figure.");
  }
  return warnings;
}

/* ----------------------------------------------------------------- bands */

interface Band {
  label: string;
  tone: string;
  bar: string;
}

function band(bits: number): Band {
  if (bits < 28) {
    return {
      label: "Very weak",
      tone: "text-[hsl(var(--brand-danger))]",
      bar: "bg-[hsl(var(--brand-danger))]",
    };
  }
  if (bits < 40) {
    return {
      label: "Weak",
      tone: "text-[hsl(var(--brand-danger))]",
      bar: "bg-[hsl(var(--brand-danger))]",
    };
  }
  if (bits < 60) {
    return {
      label: "Fair",
      tone: "text-[hsl(var(--brand-amber))]",
      bar: "bg-[hsl(var(--brand-amber))]",
    };
  }
  if (bits < 80) {
    return {
      label: "Strong",
      tone: "text-[hsl(var(--brand-signal))]",
      bar: "bg-[hsl(var(--brand-signal))]",
    };
  }
  return {
    label: "Very strong",
    tone: "text-[hsl(var(--brand-signal))]",
    bar: "bg-[hsl(var(--brand-signal))]",
  };
}

/** What the same number of bits costs to generate honestly, by method. */
const EQUIVALENTS: { label: string; bitsEach: number }[] = [
  { label: "Diceware words (7,776 word list)", bitsEach: Math.log2(7776) },
  { label: "Random lowercase letters", bitsEach: Math.log2(26) },
  { label: "Random alphanumerics", bitsEach: Math.log2(62) },
  { label: "Random hex characters", bitsEach: 4 },
];

const EXAMPLES: { label: string; value: string }[] = [
  { label: "Password1!", value: "Password1!" },
  { label: "Tr0ub4dor&3", value: "Tr0ub4dor&3" },
  { label: "Four words", value: "correct horse battery staple" },
  { label: "Generated", value: "x7Qv-2mLd9RtZa" },
];

/* ------------------------------------------------------------------ view */

export function PasswordEntropy() {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);

  const analysis = useMemo(() => analyse(password), [password]);
  const warnings = useMemo(() => findWarnings(password, analysis), [password, analysis]);
  const strength = band(analysis.searchBits);
  const meter = Math.min(100, (analysis.searchBits / 128) * 100);

  const summary =
    analysis.length === 0
      ? "Type a candidate password to see its numbers."
      : `${analysis.length} characters, pool of ${analysis.pool}, ${analysis.searchBits.toFixed(1)} bits of search space. ${strength.label}.`;

  return (
    <ToolShell slug="password-entropy">
      <div className="space-y-6">
        <ToolPanel title="Candidate">
          <label
            htmlFor="password-input"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            A password to measure. Use a candidate, not one you already rely on.
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              id="password-input"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              aria-describedby="password-hint"
              placeholder="type or paste"
              data-testid="input-password"
              className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setVisible((current) => !current)}
              aria-pressed={visible}
              data-testid="button-visibility"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-[hsl(var(--brand-iron))] px-5 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              {visible ? "Hide" : "Show"}
            </button>
          </div>
          <p id="password-hint" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            Measured in this tab. Nothing is sent, logged or stored, and reloading the page clears it.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setPassword(example.value);
                  setVisible(true);
                }}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                {example.label}
              </button>
            ))}
            {password ? (
              <button
                type="button"
                onClick={() => setPassword("")}
                data-testid="button-clear"
                className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <div
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              Search space
            </span>
            <span className={`font-display text-2xl ${strength.tone}`} data-testid="text-bits">
              {analysis.searchBits.toFixed(1)} bits · {strength.label}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--brand-obsidian))]">
            <div
              className={`h-full rounded-full transition-all ${strength.bar}`}
              style={{ width: `${meter}%` }}
            />
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {summary} The bar fills at 128 bits, the point past which the arithmetic stops being the
            weakest link.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ToolPanel title="Numbers">
            <ToolResult label="Length" value={`${analysis.length} characters`} testId="text-length" />
            <ToolResult label="Distinct characters" value={`${analysis.distinct}`} />
            <ToolResult label="Pool size" value={`${analysis.pool} symbols`} testId="text-pool" />
            <ToolResult
              label="Search space bits"
              value={`${analysis.searchBits.toFixed(2)} bits`}
            />
            <ToolResult
              label="Average guesses"
              value={analysis.length === 0 ? "0" : formatGuesses(Math.max(analysis.searchBits - 1, 0))}
              testId="text-guesses"
            />
            <ToolResult
              label="Shannon, per character"
              value={`${analysis.shannonPerChar.toFixed(2)} bits`}
              testId="text-shannon"
            />
            <ToolResult
              label="Shannon, whole string"
              value={`${analysis.shannonTotal.toFixed(2)} bits`}
            />
            <ToolResult label="Pattern mask" value={analysis.mask || "none"} testId="text-mask" />
            <ToolResult
              label="Bits if the mask is known"
              value={`${analysis.maskBits.toFixed(2)} bits`}
              testId="text-mask-bits"
            />
          </ToolPanel>

          <ToolPanel title="Character classes">
            <ul className="space-y-2">
              {CLASSES.map((cls) => {
                const on = analysis.used.some((used) => used.id === cls.id);
                return (
                  <li
                    key={cls.id}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 font-mono-tight text-xs ${
                      on
                        ? "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    <span className="uppercase tracking-[0.2em]">
                      <span aria-hidden>{on ? "[x] " : "[ ] "}</span>
                      {cls.label}
                    </span>
                    <span>{on ? `+${cls.size}` : `${cls.size} unused`}</span>
                  </li>
                );
              })}
              {analysis.exotic.length > 0 ? (
                <li className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--brand-cyan)/0.5)] bg-[hsl(var(--brand-cyan)/0.08)] px-4 py-3 font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
                  <span className="uppercase tracking-[0.2em]">Outside printable ASCII</span>
                  <span>+{analysis.exotic.length}</span>
                </li>
              ) : null}
            </ul>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The pool is the sum of every class that appears at least once, which is what an
              attacker configures a mask with. Adding a class you use only once costs you one
              character of length and hands the attacker a whole extra alphabet, so it is usually a
              worse trade than simply being longer.
            </p>
          </ToolPanel>
        </div>

        <ToolPanel title="Time to exhaust the space">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  <th
                    scope="col"
                    className="py-2 pr-4 font-mono-tight text-[10px] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                  >
                    Attack
                  </th>
                  <th
                    scope="col"
                    className="py-2 pr-4 font-mono-tight text-[10px] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                  >
                    Rate
                  </th>
                  <th
                    scope="col"
                    className="py-2 font-mono-tight text-[10px] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
                  >
                    Average time
                  </th>
                </tr>
              </thead>
              <tbody data-testid="table-attacks">
                {ATTACKS.map((attack) => (
                  <tr key={attack.label} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]"
                    >
                      {attack.label}
                      <span className="mt-1 block font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        {attack.note}
                      </span>
                    </th>
                    <td className="py-3 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      {attack.rateLabel}
                    </td>
                    <td className="py-3 font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                      {analysis.length === 0
                        ? "-"
                        : humanTime(log10SecondsToCrack(analysis.searchBits, attack.rate))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Half the keyspace on average, since the answer is found halfway through a search that
            covers all of it. Rates are order of magnitude figures for current hardware, and the
            only one under your control is the hash: the same password moves five orders of
            magnitude between the bcrypt row and the NTLM row without changing a character.
          </p>
        </ToolPanel>

        <div className="grid gap-6 md:grid-cols-2">
          <ToolPanel title="What the caveats are">
            {analysis.length === 0 ? (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                Nothing to check yet.
              </p>
            ) : warnings.length === 0 ? (
              <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-signal))]">
                No obvious pattern found here. That is a weak statement: this page checks a short
                list of shapes, and a real cracking rig checks billions of them.
              </p>
            ) : (
              <ul className="space-y-2" data-testid="list-warnings">
                {warnings.map((warning) => (
                  <li
                    key={warning}
                    className="rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                  >
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </ToolPanel>

          <ToolPanel title="Same strength, honestly generated">
            <ul className="space-y-2">
              {EQUIVALENTS.map((item) => (
                <li
                  key={item.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5 last:border-b-0"
                >
                  <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    {item.label}
                  </span>
                  <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                    {analysis.length === 0
                      ? "-"
                      : `${Math.ceil(analysis.searchBits / item.bitsEach)} of them`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Each row is how many independently random picks it takes to reach the same number of
              bits. The word list row is the useful one: five Diceware words is about 64 bits and it
              is memorable, which is the pair of properties a complexity policy never manages to
              produce at once.
            </p>
          </ToolPanel>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-5">
          <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
            Entropy is not resistance
          </div>
          <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Every number on this page assumes the characters were chosen uniformly at random. Yours
            were not, unless a generator produced them. A human password carries the structure of a
            language, a keyboard and a habit, and a cracking rule set is written to walk exactly
            that structure, so a wordlist can find a 60 bit password in seconds while brute force
            would take centuries. Read the figures as a ceiling on difficulty, never as a floor, and
            treat a match in the caveat list as evidence that the ceiling does not apply.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}
