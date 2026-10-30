/**
 * Cisco wildcard mask calculator.
 *
 * The pattern is held as two unsigned 32-bit numbers, a reference address
 * and a wildcard, and every view (subnet mask, prefix, ACL entry, OSPF
 * statement, bit comparison) is derived from them. The subnet mask and
 * wildcard fields are two ways of editing the same wildcard value, so typing
 * into either updates the other and the two can never disagree. All the
 * arithmetic lives in lib/toolkit/wildcard-mask-calculator so it can be
 * tested without a browser.
 */

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  aclLines,
  compareBits,
  formatCount,
  highestMatch,
  invert,
  ipToString,
  looksLikeSubnetMask,
  lowestMatch,
  matchCount,
  matches,
  matchingBlocks,
  maskToPrefix,
  normalize,
  ospfLines,
  parseAclNumber,
  parseIpv4,
  parseMaskOrPrefix,
  parseOspfArea,
  parseOspfProcess,
  parseWildcard,
  popcount,
  prefixToMask,
  toDottedBinary,
  wildcardToPrefix,
  type AclAction,
} from "@/lib/toolkit/wildcard-mask-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/** How many matching blocks are listed before the rest are summarized. */
const LISTED_BLOCKS = 16;
/** How many differing bits are spelled out in the verdict. */
const LISTED_MISMATCHES = 8;

interface Preset {
  label: string;
  address: string;
  wildcard: string;
  test: string;
  note: string;
}

const PRESETS: Preset[] = [
  {
    label: "One /24",
    address: "192.0.2.0",
    wildcard: "0.0.0.255",
    test: "192.0.2.77",
    note: "Every address in 192.0.2.0/24. The wildcard is the subnet mask inverted.",
  },
  {
    label: "Single host",
    address: "192.0.2.10",
    wildcard: "0.0.0.0",
    test: "192.0.2.10",
    note: "Exactly one address. IOS also accepts the host keyword for this.",
  },
  {
    label: "Odd third octet",
    address: "10.0.1.0",
    wildcard: "0.0.254.255",
    test: "10.0.7.20",
    note: "Non-contiguous: the 128 /24s inside 10.0.0.0/16 whose third octet is odd.",
  },
  {
    label: "Even third octet",
    address: "10.0.0.0",
    wildcard: "0.0.254.255",
    test: "10.0.7.20",
    note: "The same wildcard with the checked bit set to 0, so only even third octets match.",
  },
  {
    label: "Host .1 in every /24",
    address: "10.20.0.1",
    wildcard: "0.0.255.0",
    test: "10.20.33.1",
    note: "One address per /24 across 10.20.0.0/16, such as every gateway at .1.",
  },
  {
    label: "A /20 summary",
    address: "172.16.16.0",
    wildcard: "0.0.15.255",
    test: "172.16.31.255",
    note: "Sixteen /24s, 172.16.16.0 to 172.16.31.255, in one entry.",
  },
  {
    label: "Any address",
    address: "0.0.0.0",
    wildcard: "255.255.255.255",
    test: "203.0.113.9",
    note: "Every IPv4 address. IOS also accepts the any keyword for this.",
  },
  {
    label: "Mask in the wrong place",
    address: "192.0.2.0",
    wildcard: "255.255.255.0",
    test: "198.51.100.0",
    note: "The classic slip: a subnet mask used as a wildcard matches every address ending in .0.",
  },
];

const FIELD_LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_INPUT =
  "mt-2 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
    >
      {message}
    </p>
  );
}

function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
      {children}
    </p>
  );
}

function CommandBlock({ value, label, testId }: { value: string; label: string; testId?: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-start gap-2">
      <pre
        data-testid={testId}
        className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]"
      >
        {value}
      </pre>
      <CopyButton value={value} label={label} />
    </div>
  );
}

/* ------------------------------------------------------------- bit table */

const CELL_BASE = "w-5 py-1.5 text-center";

function BitTable({ reference, wildcard, test }: { reference: number; wildcard: number; test: number }) {
  // The pattern row shows the address with ignored bits cleared, the same
  // form the generated configuration uses, so the bits and the label agree.
  const bits = useMemo(
    () => compareBits(normalize(reference, wildcard), wildcard, test),
    [reference, wildcard, test],
  );
  const rows: { key: "reference" | "wildcard" | "test"; label: string; value: number }[] = [
    { key: "reference", label: "Pattern", value: normalize(reference, wildcard) },
    { key: "wildcard", label: "Wildcard", value: wildcard },
    { key: "test", label: "Test", value: test },
  ];

  function cellTone(key: "reference" | "wildcard" | "test", i: number): string {
    const b = bits[i];
    if (key === "wildcard") {
      return b.wildcard === 1 ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-signal))]";
    }
    if (b.status === "ignored") return "text-[hsl(var(--brand-ash))]";
    if (b.status === "mismatch") {
      return "bg-[hsl(var(--brand-danger)/0.14)] text-[hsl(var(--brand-danger))]";
    }
    return "text-[hsl(var(--brand-bone))]";
  }

  const sep = (i: number) => (i % 8 === 0 ? "border-l border-[hsl(var(--brand-iron))]" : "");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse font-mono-tight text-xs">
        <caption className="sr-only">
          Bit by bit comparison of the pattern address, the wildcard and the test address. A wildcard
          bit of 1 means the bit is ignored; a 0 means the test bit must equal the pattern bit.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="pb-2 pr-3 text-left">
              <span className="sr-only">Row</span>
            </th>
            {[1, 2, 3, 4].map((octet) => (
              <th
                key={octet}
                scope="colgroup"
                colSpan={8}
                className="border-l border-[hsl(var(--brand-iron))] pb-2 text-center font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
              >
                Octet {octet}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[hsl(var(--brand-iron)/0.5)]">
              <th
                scope="row"
                className="whitespace-nowrap py-1.5 pr-3 text-left font-mono-tight text-[0.6875rem] font-normal text-[hsl(var(--brand-bone-dim))]"
              >
                <span className="block uppercase tracking-[0.18em]">{row.label}</span>
                <span className="block text-[hsl(var(--brand-ash))]">{ipToString(row.value)}</span>
              </th>
              {bits.map((b) => (
                <td key={b.index} className={`${CELL_BASE} ${sep(b.index)} ${cellTone(row.key, b.index)}`}>
                  {b[row.key]}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-[hsl(var(--brand-iron))]">
            <th
              scope="row"
              className="whitespace-nowrap py-1.5 pr-3 text-left font-mono-tight text-[0.6875rem] font-normal uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))]"
            >
              Result
            </th>
            {bits.map((b) => (
              <td
                key={b.index}
                className={`${CELL_BASE} ${sep(b.index)} ${
                  b.status === "mismatch"
                    ? "bg-[hsl(var(--brand-danger)/0.14)] text-[hsl(var(--brand-danger))]"
                    : b.status === "match"
                      ? "text-[hsl(var(--brand-signal))]"
                      : "text-[hsl(var(--brand-ash))]"
                }`}
              >
                <span aria-hidden>{b.status === "mismatch" ? "✗" : b.status === "match" ? "=" : "·"}</span>
                <span className="sr-only">{b.status}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- component */

export function WildcardMaskCalculator() {
  const [addressDraft, setAddressDraft] = useState("192.0.2.0");
  const [wildcard, setWildcard] = useState(0x000000ff);
  const [maskDraft, setMaskDraft] = useState("255.255.255.0");
  const [wildDraft, setWildDraft] = useState("0.0.0.255");
  const [testDraft, setTestDraft] = useState("192.0.2.77");
  const [aclDraft, setAclDraft] = useState("10");
  const [action, setAction] = useState<AclAction>("permit");
  const [pidDraft, setPidDraft] = useState("1");
  const [areaDraft, setAreaDraft] = useState("0");

  const address = useMemo(() => parseIpv4(addressDraft, "address"), [addressDraft]);
  const testAddr = useMemo(() => parseIpv4(testDraft, "address to test"), [testDraft]);
  const acl = useMemo(() => parseAclNumber(aclDraft), [aclDraft]);
  const pid = useMemo(() => parseOspfProcess(pidDraft), [pidDraft]);
  const area = useMemo(() => parseOspfArea(areaDraft), [areaDraft]);

  const prefix = wildcardToPrefix(wildcard);
  const contiguous = prefix !== null;
  const count = matchCount(wildcard);
  const ignored = popcount(wildcard);

  // The mask field is left empty on purpose when the wildcard has no subnet
  // mask equivalent, so an empty field is only an error when one exists.
  const maskStatus = useMemo(() => {
    if (maskDraft.trim() === "") {
      return contiguous
        ? { kind: "error" as const, message: "Enter a prefix length such as /24 or a subnet mask such as 255.255.255.0." }
        : { kind: "none" as const };
    }
    const parsed = parseMaskOrPrefix(maskDraft);
    return parsed.ok ? { kind: "ok" as const } : { kind: "error" as const, message: parsed.error };
  }, [maskDraft, contiguous]);

  const wildStatus = useMemo(() => parseWildcard(wildDraft), [wildDraft]);

  function onMaskType(value: string) {
    setMaskDraft(value);
    const parsed = parseMaskOrPrefix(value);
    if (parsed.ok) {
      const next = invert(parsed.value.mask);
      setWildcard(next);
      setWildDraft(ipToString(next));
    }
  }

  function onWildType(value: string) {
    setWildDraft(value);
    const parsed = parseWildcard(value);
    if (parsed.ok) {
      setWildcard(parsed.value);
      const p = wildcardToPrefix(parsed.value);
      setMaskDraft(p === null ? "" : ipToString(prefixToMask(p)));
    }
  }

  function applyPreset(preset: Preset) {
    setAddressDraft(preset.address);
    setTestDraft(preset.test);
    onWildType(preset.wildcard);
  }

  const ref = address.ok ? address.value : null;
  const base = ref === null ? null : normalize(ref, wildcard);
  const hostBitsIgnored = ref !== null && base !== null && base !== ref;

  const blocks = useMemo(
    () => (ref === null ? null : matchingBlocks(ref, wildcard, LISTED_BLOCKS)),
    [ref, wildcard],
  );

  const bitView = useMemo(() => {
    if (ref === null || !testAddr.ok) return null;
    const rows = compareBits(ref, wildcard, testAddr.value);
    return {
      matched: matches(ref, wildcard, testAddr.value),
      mismatches: rows.filter((r) => r.status === "mismatch"),
      checked: 32 - ignored,
    };
  }, [ref, wildcard, testAddr, ignored]);

  const aclOut = ref !== null && acl.ok ? aclLines(acl.value.number, acl.value.kind, action, ref, wildcard) : null;
  const ospfOut = ref !== null && pid.ok && area.ok ? ospfLines(pid.value, area.value, ref, wildcard) : null;
  const suspiciousMask = looksLikeSubnetMask(wildcard);
  const shapePrefix = maskToPrefix(wildcard) ?? 0;
  const maskShapeNote = `${ipToString(wildcard)} has the shape of a subnet mask. As a wildcard it ignores the first ${shapePrefix} ${pluralise(
    shapePrefix,
    "bit",
  )} and checks only the last ${32 - shapePrefix}, so it matches ${formatCount(count)} addresses spread across the whole address space. If you meant /${shapePrefix}, the wildcard is ${ipToString(invert(wildcard))}.`;
  const presetActive = (p: Preset) =>
    p.address === addressDraft.trim() && p.wildcard === ipToString(wildcard) && wildStatus.ok;

  return (
    <ToolShell slug="wildcard-mask-calculator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Pattern">
            <label htmlFor="wc-address" className={FIELD_LABEL}>
              Address
            </label>
            <input
              id="wc-address"
              value={addressDraft}
              onChange={(e) => setAddressDraft(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="decimal"
              aria-invalid={!address.ok}
              aria-describedby={!address.ok ? "wc-address-error" : "wc-address-hint"}
              placeholder="192.0.2.0"
              data-testid="input-address"
              className={FIELD_INPUT}
            />
            {!address.ok ? (
              <FieldError id="wc-address-error" message={address.error} />
            ) : (
              <FieldHint id="wc-address-hint">The reference address the wildcard is applied to.</FieldHint>
            )}

            <div className="mt-5">
              <label htmlFor="wc-mask" className={FIELD_LABEL}>
                Subnet mask or prefix
              </label>
              <input
                id="wc-mask"
                value={maskDraft}
                onChange={(e) => onMaskType(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-invalid={maskStatus.kind === "error"}
                aria-describedby={maskStatus.kind === "error" ? "wc-mask-error" : "wc-mask-hint"}
                placeholder={contiguous ? "/24 or 255.255.255.0" : "no subnet mask equivalent"}
                data-testid="input-mask"
                className={FIELD_INPUT}
              />
              {maskStatus.kind === "error" ? (
                <FieldError id="wc-mask-error" message={maskStatus.message} />
              ) : maskStatus.kind === "none" ? (
                <FieldHint id="wc-mask-hint">
                  No subnet mask equals {ipToString(wildcard)}: its 1 bits are not one unbroken run at the
                  right-hand end, so no prefix length describes it.
                </FieldHint>
              ) : (
                <FieldHint id="wc-mask-hint">
                  /24, 24 or 255.255.255.0. Typing here rewrites the wildcard.
                </FieldHint>
              )}
            </div>

            <div className="mt-5">
              <label htmlFor="wc-wildcard" className={FIELD_LABEL}>
                Wildcard mask
              </label>
              <input
                id="wc-wildcard"
                value={wildDraft}
                onChange={(e) => onWildType(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="decimal"
                aria-invalid={!wildStatus.ok}
                aria-describedby={!wildStatus.ok ? "wc-wildcard-error" : "wc-wildcard-hint"}
                placeholder="0.0.0.255"
                data-testid="input-wildcard"
                className={FIELD_INPUT}
              />
              {!wildStatus.ok ? (
                <FieldError id="wc-wildcard-error" message={wildStatus.error} />
              ) : (
                <FieldHint id="wc-wildcard-hint">
                  Any four octets. A 0 bit is checked, a 1 bit is ignored, and the 1 bits do not have to be
                  contiguous.
                </FieldHint>
              )}
            </div>

            {suspiciousMask ? (
              <p
                data-testid="text-mask-warning"
                className="mt-5 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
              >
                <strong className="font-normal uppercase tracking-[0.2em]">Caution: </strong>
                {maskShapeNote}
              </p>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Conversion">
            <ToolResult label="Wildcard mask" value={ipToString(wildcard)} testId="text-wildcard" />
            <ToolResult
              label="Subnet mask"
              value={contiguous ? ipToString(invert(wildcard)) : "none (not contiguous)"}
              testId="text-mask"
            />
            <ToolResult label="Prefix length" value={contiguous ? `/${prefix}` : "none"} testId="text-prefix" />
            <ToolResult label="Wildcard in binary" value={toDottedBinary(wildcard)} />
            <ToolResult
              label="Bits checked / ignored"
              value={`${32 - ignored} checked, ${ignored} ignored`}
            />
            <ToolResult
              label="Addresses matched"
              value={`${formatCount(count)} (2^${ignored})`}
              testId="text-count"
            />
            <ToolResult
              label="As CIDR"
              value={
                base === null
                  ? "needs a valid address"
                  : contiguous
                    ? `${ipToString(base)}/${prefix}`
                    : "none (not one block)"
              }
              testId="text-cidr"
            />
            {ref !== null ? (
              <>
                <ToolResult label="Lowest match" value={ipToString(lowestMatch(ref, wildcard))} />
                <ToolResult label="Highest match" value={ipToString(highestMatch(ref, wildcard))} />
              </>
            ) : null}
            {hostBitsIgnored && ref !== null && base !== null ? (
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {ipToString(ref)} has bits set where the wildcard says ignore. They play no part in the match,
                so the pattern is written below with those bits cleared, as {ipToString(base)}.
              </p>
            ) : null}
          </ToolPanel>
        </div>

        <ToolPanel title="Patterns to try">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                data-testid={`button-preset-${preset.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  presetActive(preset)
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                }`}
              >
                <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{preset.label}</span>
                <span className="break-all font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                  {preset.address} {preset.wildcard}
                </span>
                <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {preset.note}
                </span>
              </button>
            ))}
          </div>
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Access list entry">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="wc-acl" className={FIELD_LABEL}>
                  List number
                </label>
                <input
                  id="wc-acl"
                  value={aclDraft}
                  onChange={(e) => setAclDraft(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={!acl.ok}
                  aria-describedby={!acl.ok ? "wc-acl-error" : undefined}
                  data-testid="input-acl-number"
                  className={FIELD_INPUT}
                />
              </div>
              <fieldset>
                <legend className={FIELD_LABEL}>Action</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["permit", "deny"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAction(a)}
                      aria-pressed={action === a}
                      data-testid={`button-action-${a}`}
                      className={`flex min-h-[44px] items-center justify-center rounded-lg border font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                        action === a
                          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                          : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            {!acl.ok ? <FieldError id="wc-acl-error" message={acl.error} /> : null}

            {aclOut ? (
              <>
                <CommandBlock value={aclOut.explicit} label="Copy access list entry" testId="text-acl" />
                {aclOut.shorthand ? (
                  <>
                    <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      The same entry with the {wildcard === 0 ? "host" : "any"} keyword:
                    </p>
                    <CommandBlock value={aclOut.shorthand} label="Copy shorthand entry" />
                  </>
                ) : null}
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {acl.ok && acl.value.kind === "standard"
                    ? "A standard list (1 to 99, 1300 to 1999) matches the source address only."
                    : "An extended list (100 to 199, 2000 to 2699) matches protocol, source and destination; this entry matches any IP packet from the pattern to any destination."}{" "}
                  Every access list ends with an implicit deny, so a list holding only deny entries blocks
                  everything.
                </p>
              </>
            ) : ref === null ? (
              <FieldHint id="wc-acl-wait">Enter a valid address to build the entry.</FieldHint>
            ) : null}
          </ToolPanel>

          <ToolPanel title="OSPF network statement">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="wc-pid" className={FIELD_LABEL}>
                  Process ID
                </label>
                <input
                  id="wc-pid"
                  value={pidDraft}
                  onChange={(e) => setPidDraft(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={!pid.ok}
                  aria-describedby={!pid.ok ? "wc-pid-error" : undefined}
                  data-testid="input-ospf-process"
                  className={FIELD_INPUT}
                />
                {!pid.ok ? <FieldError id="wc-pid-error" message={pid.error} /> : null}
              </div>
              <div>
                <label htmlFor="wc-area" className={FIELD_LABEL}>
                  Area
                </label>
                <input
                  id="wc-area"
                  value={areaDraft}
                  onChange={(e) => setAreaDraft(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={!area.ok}
                  aria-describedby={!area.ok ? "wc-area-error" : undefined}
                  data-testid="input-ospf-area"
                  className={FIELD_INPUT}
                />
                {!area.ok ? <FieldError id="wc-area-error" message={area.error} /> : null}
              </div>
            </div>

            {ospfOut ? (
              <>
                <CommandBlock value={ospfOut} label="Copy OSPF configuration" testId="text-ospf" />
                <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  The network command does not advertise this pattern. It turns OSPF on for every interface
                  whose address falls inside it, and the router then advertises those interfaces' own
                  subnets.
                </p>
                {!contiguous ? (
                  <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                    This wildcard is not contiguous. Confirm your platform accepts that in a network statement
                    before relying on it; a contiguous wildcard, or one line per interface address with
                    0.0.0.0, is easier to audit.
                  </p>
                ) : null}
              </>
            ) : ref === null ? (
              <FieldHint id="wc-ospf-wait">Enter a valid address to build the statement.</FieldHint>
            ) : null}
          </ToolPanel>
        </div>

        <ToolPanel title="Test an address">
          <label htmlFor="wc-test" className={FIELD_LABEL}>
            Address to test
          </label>
          <input
            id="wc-test"
            value={testDraft}
            onChange={(e) => setTestDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            inputMode="decimal"
            aria-invalid={!testAddr.ok}
            aria-describedby={!testAddr.ok ? "wc-test-error" : undefined}
            placeholder="192.0.2.77"
            data-testid="input-test"
            className={`${FIELD_INPUT} max-w-md`}
          />
          {!testAddr.ok ? (
            testDraft.trim() === "" ? (
              <FieldHint id="wc-test-error">Enter an address to compare against the pattern.</FieldHint>
            ) : (
              <FieldError id="wc-test-error" message={testAddr.error} />
            )
          ) : null}

          {bitView && ref !== null && testAddr.ok ? (
            <>
              <div
                role="status"
                aria-live="polite"
                data-testid="text-verdict"
                className={`mt-5 rounded-lg border p-4 font-mono-tight text-sm leading-relaxed ${
                  bitView.matched
                    ? "border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-bone))]"
                }`}
              >
                <span
                  className={`mr-2 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] ${
                    bitView.matched ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-danger))]"
                  }`}
                >
                  {bitView.matched ? "Match" : "No match"}
                </span>
                {bitView.matched
                  ? `${ipToString(testAddr.value)} agrees with the pattern on all ${bitView.checked} checked ${pluralise(
                      bitView.checked,
                      "bit",
                    )}. The ${ignored} ignored ${pluralise(ignored, "bit")} can be anything.`
                  : `${ipToString(testAddr.value)} differs from the pattern in ${bitView.mismatches.length} of the ${
                      bitView.checked
                    } checked ${pluralise(bitView.checked, "bit")}.`}
              </div>

              {!bitView.matched ? (
                <ul className="mt-3 space-y-1" data-testid="list-mismatches">
                  {bitView.mismatches.slice(0, LISTED_MISMATCHES).map((m) => (
                    <li
                      key={m.index}
                      className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                    >
                      Octet {m.octet}, bit value {m.weight}: the pattern requires {m.reference}, the test address
                      has {m.test}.
                    </li>
                  ))}
                  {bitView.mismatches.length > LISTED_MISMATCHES ? (
                    <li className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                      and {bitView.mismatches.length - LISTED_MISMATCHES} more, marked in the table.
                    </li>
                  ) : null}
                </ul>
              ) : null}

              <div className="mt-5">
                <BitTable reference={ref} wildcard={wildcard} test={testAddr.value} />
              </div>
              <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                <span className="text-[hsl(var(--brand-signal))]">=</span> checked and equal,{" "}
                <span className="text-[hsl(var(--brand-danger))]">✗</span> checked and different,{" "}
                <span>·</span> ignored. The rule is (test XOR pattern) AND NOT wildcard = 0.
              </p>
            </>
          ) : ref === null ? (
            <FieldHint id="wc-test-wait">Enter a valid pattern address above to test against it.</FieldHint>
          ) : null}
        </ToolPanel>

        {blocks && base !== null ? (
          <ToolPanel title="What the pattern matches">
            <p
              data-testid="text-blocks-summary"
              className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
            >
              {blocks.total === 1
                ? `One contiguous block of ${formatCount(blocks.blockSize)} ${pluralise(
                    blocks.blockSize,
                    "address",
                  )}.`
                : blocks.blockSize === 1
                  ? `${formatCount(count)} separate addresses, no two of them adjacent, lowest first.`
                  : `${formatCount(count)} addresses in ${formatCount(blocks.total)} separate blocks of ${formatCount(
                      blocks.blockSize,
                    )} (/${blocks.blockPrefix} each), lowest first.`}
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="list-blocks">
              {blocks.blocks.map((b) => {
                const size = 2 ** (32 - b.prefix);
                const last = b.base + size - 1;
                return (
                  <li
                    key={b.base}
                    className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3"
                  >
                    <span className="block break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      {size === 1 ? ipToString(b.base) : `${ipToString(b.base)}/${b.prefix}`}
                    </span>
                    {size > 1 ? (
                      <span className="mt-1 block break-all font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                        {ipToString(b.base)} to {ipToString(last)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {blocks.total > blocks.blocks.length ? (
              <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                Showing the first {blocks.blocks.length} of {formatCount(blocks.total)}. The last one ends at{" "}
                {ipToString(highestMatch(base, wildcard))}.
              </p>
            ) : null}
          </ToolPanel>
        ) : null}
      </div>
    </ToolShell>
  );
}
