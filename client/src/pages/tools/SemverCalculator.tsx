/**
 * Semantic versioning calculator.
 *
 * Four views over the same rules: one version parsed and bumped, two
 * versions compared with the rule that decided it, an npm range desugared
 * into plain comparators, and a list of versions sorted and tested against
 * that range. The parsing, precedence and range logic live in
 * lib/toolkit/semver-calculator and are checked against npm's own semver
 * package, so what this page says is what npm does.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_LIST,
  RELEASE_TYPES,
  bump,
  comparatorLabel,
  compare,
  explainCompare,
  parseList,
  parseRange,
  parseVersion,
  preidError,
  satisfies,
  sortVersions,
  type ReleaseType,
  type SemVer,
} from "@/lib/toolkit/semver-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CODE_CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const ERROR_CLASS =
  "mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_CLASS = "mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";

const VERSION_EXAMPLES = [
  "1.4.2",
  "2.0.0-rc.1",
  "1.0.0-alpha.beta+exp.sha.5114f85",
  "0.3.7",
  "v3.1.0",
];

const RANGE_EXAMPLES = [
  "^1.2.3",
  "~1.2.3",
  "^0.2.3",
  "^0.0.3",
  "1.2.x",
  "1.2.3 - 2.3",
  ">1.2.3-alpha.3",
  "<1.2.0 || >=2.0.0",
];

const DEFAULT_LIST = [
  "2.0.0",
  "1.2.3-beta.11",
  "1.3.0",
  "1.2.3-alpha.7",
  "2.0.0-rc.1",
  "1.2.4-alpha",
  "1.2.3",
  "1.2.2",
  "1.9.9",
  "1.2.3-beta.2",
].join("\n");

const RELEASE_NOTES: Record<ReleaseType, string> = {
  major: "Incompatible API change",
  minor: "New, backward compatible functionality",
  patch: "Backward compatible bug fix",
  premajor: "First prerelease of the next major",
  preminor: "First prerelease of the next minor",
  prepatch: "First prerelease of the next patch",
  prerelease: "Next prerelease, or a prepatch if this is a release",
};

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stability(v: SemVer): string {
  if (v.prerelease.length) {
    return "Prerelease. Section 9: it may be unstable and might not meet the compatibility its version number implies.";
  }
  if (v.major === 0n) {
    return "Initial development. Section 4: with major version zero anything may change at any time, so the public API should not be considered stable.";
  }
  return "Release. Section 8: the major version goes up only for changes that break backward compatibility.";
}

function Identifiers({ ids, kind }: { ids: string[]; kind: "prerelease" | "build" }) {
  if (ids.length === 0) return <span className="text-[hsl(var(--brand-ash))]">none</span>;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5">
      {ids.map((id, i) => {
        const numeric = /^[0-9]+$/.test(id);
        return (
          <span
            key={i}
            className="inline-flex items-baseline gap-1.5 rounded border border-[hsl(var(--brand-iron))] px-2 py-0.5"
          >
            <span className="break-all text-[hsl(var(--brand-bone))]">{id}</span>
            {kind === "prerelease" ? (
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                {numeric ? "num" : "alnum"}
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function ErrorLine({ id, message, testId }: { id: string; message: string; testId?: string }) {
  return (
    <p id={id} role="alert" data-testid={testId} className={ERROR_CLASS}>
      <span aria-hidden="true">✕</span>
      <span className="min-w-0 break-words">{message}</span>
    </p>
  );
}

export function SemverCalculator() {
  const [raw, setRaw] = useState("1.0.0-alpha.beta+exp.sha.5114f85");
  const [preid, setPreid] = useState("beta");
  const [left, setLeft] = useState("1.0.0-beta.11");
  const [right, setRight] = useState("1.0.0-beta.2");
  const [rangeRaw, setRangeRaw] = useState("^1.2.3-beta.2");
  const [includePre, setIncludePre] = useState(false);
  const [listRaw, setListRaw] = useState(DEFAULT_LIST);

  const parsed = useMemo(() => (raw.trim() === "" ? null : parseVersion(raw)), [raw]);
  const version = parsed && parsed.ok ? parsed.value : null;
  const preidProblem = preidError(preid.trim());
  const bumps = useMemo(
    () =>
      version && !preidProblem
        ? RELEASE_TYPES.map((release) => ({ release, result: bump(version, release, preid.trim()) }))
        : [],
    [version, preid, preidProblem],
  );

  const a = useMemo(() => (left.trim() === "" ? null : parseVersion(left)), [left]);
  const b = useMemo(() => (right.trim() === "" ? null : parseVersion(right)), [right]);
  const comparison = a && a.ok && b && b.ok ? explainCompare(a.value, b.value) : null;
  const symbol = comparison ? (comparison.order < 0 ? "<" : comparison.order > 0 ? ">" : "=") : "";

  const range = useMemo(() => parseRange(rangeRaw, includePre), [rangeRaw, includePre]);
  const list = useMemo(() => parseList(listRaw), [listRaw]);
  const validVersions = useMemo(
    () => list.entries.flatMap((e) => (e.result.ok ? [e.result.value] : [])),
    [list],
  );
  const invalid = list.entries.filter((e) => !e.result.ok);
  const sorted = useMemo(() => sortVersions(validVersions), [validVersions]);
  const rows = useMemo(
    () =>
      sorted.map((v) => ({
        v,
        verdict: range.ok ? satisfies(range, v) : null,
      })),
    [sorted, range],
  );
  const matching = rows.filter((r) => r.verdict?.match).map((r) => r.v);
  const maxSatisfying = matching.reduce<SemVer | null>((best, v) => (!best || compare(best, v) < 0 ? v : best), null);
  const minSatisfying = matching.reduce<SemVer | null>((best, v) => (!best || compare(v, best) < 0 ? v : best), null);

  const versionMsgId = "semver-version-message";
  const rangeMsgId = "semver-range-message";

  return (
    <ToolShell slug="semver-calculator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Version">
            <label htmlFor="semver-version" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              A semantic version
            </label>
            <input
              id="semver-version"
              type="text"
              value={raw}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => setRaw(event.target.value)}
              aria-invalid={parsed !== null && !parsed.ok}
              aria-describedby={versionMsgId}
              placeholder="1.4.2-rc.1+build.7"
              data-testid="input-version"
              className={INPUT_CLASS}
            />
            {parsed && !parsed.ok ? (
              <ErrorLine id={versionMsgId} message={parsed.message} testId="text-version-error" />
            ) : (
              <p id={versionMsgId} className={HINT_CLASS}>
                {parsed && parsed.ok && parsed.notes.length
                  ? parsed.notes.join(" ")
                  : "major.minor.patch, then an optional -prerelease and +build. Numbers have no leading zeros."}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {VERSION_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setRaw(example)}
                  data-testid={`button-version-${slug(example)}`}
                  className={CODE_CHIP_CLASS}
                >
                  {example}
                </button>
              ))}
            </div>
          </ToolPanel>

          <ToolPanel title="Parsed">
            {version ? (
              <div data-testid="output-semver">
                <ToolResult label="Major" value={version.major.toString()} testId="text-major" />
                <ToolResult label="Minor" value={version.minor.toString()} testId="text-minor" />
                <ToolResult label="Patch" value={version.patch.toString()} testId="text-patch" />
                <ToolResult label="Prerelease" value={<Identifiers ids={version.prerelease} kind="prerelease" />} />
                <ToolResult label="Build metadata" value={<Identifiers ids={version.build} kind="build" />} />
                <ToolResult label="Compared as" value={version.version} testId="text-precedence-form" />
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {stability(version)}
                  {version.build.length
                    ? " Build metadata is ignored for precedence (section 10), so it never changes which version is newer."
                    : ""}
                </p>
              </div>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]" data-testid="output-semver">
                {parsed ? "Fix the version to see its parts." : "Enter a version to see its parts."}
              </p>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="Bump">
          <div className="max-w-sm">
            <label htmlFor="semver-preid" className={LABEL_CLASS}>
              Prerelease identifier (optional)
            </label>
            <input
              id="semver-preid"
              type="text"
              value={preid}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => setPreid(event.target.value)}
              aria-invalid={preidProblem !== null}
              aria-describedby="semver-preid-message"
              placeholder="beta"
              data-testid="input-preid"
              className={INPUT_CLASS}
            />
            {preidProblem ? (
              <ErrorLine id="semver-preid-message" message={preidProblem} />
            ) : (
              <p id="semver-preid-message" className={HINT_CLASS}>
                Used by the pre* bumps, like npm&apos;s --preid. Leave it blank for a bare counter such as 1.2.4-0.
              </p>
            )}
          </div>
          {version && bumps.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left" data-testid="table-bumps">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      Bump
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Result
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Meaning
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bumps.map(({ release, result }) => (
                    <tr key={release} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                      <td className="py-2 pr-4 align-top font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                        {release}
                      </td>
                      <td
                        className="break-all py-2 pr-4 align-top font-mono-tight text-sm text-[hsl(var(--brand-signal))]"
                        data-testid={`text-bump-${release}`}
                      >
                        {result}
                      </td>
                      <td className="py-2 align-top font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        {RELEASE_NOTES[release]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              {version ? "Fix the prerelease identifier to see the bumps." : "Enter a valid version above to see the bumps."}
            </p>
          )}
          {version && version.prerelease.length && bumps.length ? (
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A prerelease already points at its release, so a major, minor or patch bump that lands on that same
              version just drops the prerelease: {version.version} becomes {bump(version, "patch")} on a patch bump.
            </p>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Compare two versions">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="min-w-0">
              <label htmlFor="semver-left" className={LABEL_CLASS}>
                First version
              </label>
              <input
                id="semver-left"
                type="text"
                value={left}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setLeft(event.target.value)}
                aria-invalid={a !== null && !a.ok}
                aria-describedby="semver-left-message"
                data-testid="input-compare-a"
                className={INPUT_CLASS}
              />
              {a && !a.ok ? <ErrorLine id="semver-left-message" message={a.message} /> : <span id="semver-left-message" />}
            </div>
            <div
              className="self-center pt-2 text-center font-display text-4xl font-medium text-[hsl(var(--brand-signal))] sm:pt-6"
              data-testid="text-compare-symbol"
              aria-hidden="true"
            >
              {symbol || "?"}
            </div>
            <div className="min-w-0">
              <label htmlFor="semver-right" className={LABEL_CLASS}>
                Second version
              </label>
              <input
                id="semver-right"
                type="text"
                value={right}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(event) => setRight(event.target.value)}
                aria-invalid={b !== null && !b.ok}
                aria-describedby="semver-right-message"
                data-testid="input-compare-b"
                className={INPUT_CLASS}
              />
              {b && !b.ok ? <ErrorLine id="semver-right-message" message={b.message} /> : <span id="semver-right-message" />}
            </div>
          </div>
          {comparison && a && a.ok && b && b.ok ? (
            <div className="mt-5" data-testid="text-compare-result" aria-live="polite">
              <p className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                {a.value.full} {symbol === "=" ? "has the same precedence as" : symbol === "<" ? "is lower than" : "is higher than"}{" "}
                {b.value.full}
              </p>
              <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {comparison.reason}
              </p>
            </div>
          ) : (
            <p className="mt-5 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Enter two valid versions to compare them.</p>
          )}
        </ToolPanel>

        <ToolPanel title="Range">
          <label htmlFor="semver-range" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            An npm range
          </label>
          <input
            id="semver-range"
            type="text"
            value={rangeRaw}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => setRangeRaw(event.target.value)}
            aria-invalid={!range.ok}
            aria-describedby={rangeMsgId}
            placeholder="^1.2.3 || >=2.0.0 <3"
            data-testid="input-range"
            className={INPUT_CLASS}
          />
          {!range.ok ? (
            <ErrorLine id={rangeMsgId} message={range.message} testId="text-range-error" />
          ) : (
            <p id={rangeMsgId} className={HINT_CLASS}>
              A space means and, || means or. An empty range is the same as *.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {RANGE_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setRangeRaw(example)}
                data-testid={`button-range-${slug(example)}`}
                className={CODE_CHIP_CLASS}
              >
                {example}
              </button>
            ))}
          </div>
          <label className="mt-5 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]">
            <input
              type="checkbox"
              checked={includePre}
              onChange={(event) => setIncludePre(event.target.checked)}
              data-testid="checkbox-include-prerelease"
              className="h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]"
            />
            Include prereleases everywhere (npm&apos;s includePrerelease option)
          </label>

          {range.ok ? (
            <div className="mt-6" data-testid="output-range-desugared">
              <div className={LABEL_CLASS}>npm reads this as</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                  {range.normalized}
                </pre>
                <CopyButton value={range.normalized} label="Copy the desugared range" testId="button-copy-range" />
              </div>
              <div className="mt-5 space-y-4">
                {range.sets.map((set, i) => (
                  <div key={i}>
                    {range.sets.length > 1 ? (
                      <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        Alternative {i + 1}
                      </div>
                    ) : null}
                    {set.steps.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {set.steps.map((step, k) => (
                          <li key={k} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono-tight text-xs">
                            <code className="break-all text-[hsl(var(--brand-bone))]">{step.source}</code>
                            <span aria-hidden="true" className="text-[hsl(var(--brand-ash))]">
                              →
                            </span>
                            <span className="sr-only">becomes</span>
                            <code className="break-all text-[hsl(var(--brand-cyan))]">{step.result || "*"}</code>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {set.comparators.length === 1 && !set.comparators[0].semver
                        ? "Any version. Prereleases still need a comparator that names one, unless they are included."
                        : `A version must pass all of: ${set.comparators.map(comparatorLabel).join(", ")}.`}
                    </p>
                  </div>
                ))}
              </div>
              {/-0(?![0-9A-Za-z.-])/.test(range.normalized) ? (
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  -0 is the lowest possible prerelease, so an upper bound such as &lt;2.0.0-0 keeps out 2.0.0 and every
                  2.0.0 prerelease too.
                </p>
              ) : null}
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Sort and test versions">
          <label htmlFor="semver-list" className={LABEL_CLASS}>
            Versions, separated by spaces, commas or new lines
          </label>
          <textarea
            id="semver-list"
            value={listRaw}
            onChange={(event) => setListRaw(event.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="semver-list-message"
            data-testid="input-versions"
            className={`${INPUT_CLASS} resize-y text-xs leading-relaxed`}
          />
          <p id="semver-list-message" className={HINT_CLASS}>
            {list.truncated
              ? `Only the first ${MAX_LIST} of ${list.total} entries are read.`
              : `${list.entries.length} ${list.entries.length === 1 ? "entry" : "entries"}, sorted lowest to highest precedence. Ties in precedence are ordered by build metadata, as npm's sort does.`}
          </p>

          {range.ok && matching.length ? (
            <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <ToolResult label="Highest match" value={maxSatisfying?.full ?? ""} testId="text-max-satisfying" />
              <ToolResult label="Lowest match" value={minSatisfying?.full ?? ""} testId="text-min-satisfying" />
            </div>
          ) : null}

          {rows.length ? (
            <div className="mt-4 overflow-x-auto" data-testid="output-range">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      #
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Version
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      In range
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Why
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ v, verdict }, i) => {
                    const tie = i > 0 && compare(rows[i - 1].v, v) === 0;
                    return (
                      <tr key={`${v.full}-${i}`} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                        <td className="py-2 pr-4 align-top font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                          {tie ? "=" : i + 1}
                        </td>
                        <td className="break-all py-2 pr-4 align-top font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {v.full}
                        </td>
                        <td className="py-2 pr-4 align-top font-mono-tight text-xs">
                          {verdict ? (
                            verdict.match ? (
                              <span className="text-[hsl(var(--brand-signal))]">
                                <span aria-hidden="true">✓ </span>yes
                              </span>
                            ) : (
                              <span className="text-[hsl(var(--brand-ash))]">
                                <span aria-hidden="true">✕ </span>no
                              </span>
                            )
                          ) : (
                            <span className="text-[hsl(var(--brand-ash))]">n/a</span>
                          )}
                        </td>
                        <td className="py-2 align-top font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                          {verdict ? verdict.reason : "Fix the range to test this version."}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-ash))]" data-testid="output-range">
              No valid versions to sort yet.
            </p>
          )}

          {invalid.length ? (
            <div className="mt-5 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3">
              <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-danger))]">
                Not valid semver ({invalid.length})
              </div>
              <ul className="mt-2 space-y-1.5" data-testid="list-invalid-versions">
                {invalid.slice(0, 20).map((entry, i) => (
                  <li key={i} className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    <code className="break-all text-[hsl(var(--brand-bone))]">{entry.text.slice(0, 80)}</code>:{" "}
                    {entry.result.ok ? "" : entry.result.message}
                  </li>
                ))}
                {invalid.length > 20 ? (
                  <li className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    {invalid.length - 20} more not shown.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
