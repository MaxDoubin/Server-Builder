/**
 * Modified EUI-64 generator.
 *
 * Shows each step of RFC 4291 Appendix A on the reader's own MAC: split,
 * insert FF:FE, invert the universal/local bit. Then the addresses that
 * come out of it, and the reverse direction, recovering a MAC from an
 * address. All arithmetic is in lib/toolkit/eui64-generator so the steps
 * shown here and the ones unit tested are the same code.
 */

import { useMemo, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  UL_BIT,
  addressString,
  bin8,
  hex2,
  iidString,
  linkLocal,
  macFromInterfaceId,
  macString,
  parseMac,
  parseReverseInput,
  parseSlaacPrefix,
  slaacAddress,
  toModifiedEui64,
} from "@/lib/toolkit/eui64-generator";
import { expand, solicitedNode } from "@/lib/toolkit/ipv6-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const EXAMPLES: { label: string; value: string }[] = [
  { label: "RFC 2464", value: "34-56-78-9A-BC-DE" },
  { label: "Colons", value: "00:1a:2b:3c:4d:5e" },
  { label: "Cisco dots", value: "0050.56c0.0001" },
  { label: "QEMU, local", value: "52:54:00:12:34:56" },
  { label: "Docker, local", value: "02:42:ac:11:00:02" },
];

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CAUTION_CLASS =
  "rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const BODY_CLASS = "break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]";

type Tone = "oui" | "nic" | "insert" | "flip" | "plain";

const TONE: Record<Tone, string> = {
  oui: "border-[hsl(var(--brand-signal)/0.5)] text-[hsl(var(--brand-signal))]",
  nic: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]",
  insert: "border-[hsl(var(--brand-amber)/0.6)] bg-[hsl(var(--brand-amber)/0.1)] text-[hsl(var(--brand-amber))]",
  flip: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  plain: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone))]",
};

/** A row of octets as small boxes, so the eye can follow them between steps. */
function Octets({ bytes, tones, label }: { bytes: number[]; tones: Tone[]; label: string }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex w-max items-center gap-1 font-mono-tight text-sm" aria-label={label} role="img">
        {bytes.map((b, i) => (
          <span
            key={i}
            className={`inline-flex min-h-[32px] min-w-[2.5rem] items-center justify-center rounded-md border px-2 ${TONE[tones[i] ?? "plain"]}`}
          >
            {hex2(b)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** One octet in binary with a single bit picked out. */
function BitByte({ value, mark, caption }: { value: number; mark: number; caption: string }) {
  const bits = bin8(value).split("");
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max items-end gap-1 font-mono-tight" aria-hidden="true">
          {bits.map((bit, i) => {
            const mask = 0x80 >> i;
            const marked = mask === mark;
            return (
              <span key={i} className="flex flex-col items-center gap-1">
                <span
                  className={`inline-flex h-8 w-7 items-center justify-center rounded-md border text-sm ${
                    marked
                      ? "border-[hsl(var(--brand-amber))] bg-[hsl(var(--brand-amber)/0.14)] text-[hsl(var(--brand-amber))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]"
                  }`}
                >
                  {bit}
                </span>
                <span
                  className={`text-[0.625rem] ${marked ? "text-[hsl(var(--brand-amber))]" : "text-[hsl(var(--brand-ash))]"}`}
                >
                  {i + 1}
                </span>
              </span>
            );
          })}
          <span className="ml-2 self-center text-sm text-[hsl(var(--brand-bone))]">= 0x{hex2(value)}</span>
        </div>
      </div>
      <p className="sr-only">{caption}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-b border-[hsl(var(--brand-iron)/0.5)] py-5 first:pt-0 last:border-b-0 last:pb-0">
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--brand-signal)/0.6)] font-mono-tight text-xs text-[hsl(var(--brand-signal))]"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))]">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
        <div className="mt-3 space-y-3">{children}</div>
      </div>
    </li>
  );
}

const PRIVACY_ROWS: { label: string; eui: string; stable: string; temp: string }[] = [
  {
    label: "Built from",
    eui: "The MAC address",
    stable: "A keyed hash of the prefix, the interface, a counter and a secret held by the host",
    temp: "Random bits",
  },
  { label: "Same ID on every network", eui: "Yes", stable: "No", temp: "No" },
  { label: "Changes on one network", eui: "No", stable: "No", temp: "Yes, regenerated on a timer" },
  { label: "Reveals the vendor", eui: "Yes, through the OUI", stable: "No", temp: "No" },
  {
    label: "Typical role",
    eui: "Older hosts and many router interfaces",
    stable: "The address a host keeps and is reached on",
    temp: "Source address for outgoing connections",
  },
];

export function Eui64Generator() {
  const [macRaw, setMacRaw] = useState("00:1a:2b:3c:4d:5e");
  const [prefixRaw, setPrefixRaw] = useState("2001:db8:1:2::/64");
  const [reverseRaw, setReverseRaw] = useState("2001:db8:1:2:21a:2bff:fe3c:4d5e");

  const mac = useMemo(() => parseMac(macRaw), [macRaw]);
  const result = mac.kind === "ok" ? toModifiedEui64(mac.bytes) : null;
  const prefix = useMemo(() => parseSlaacPrefix(prefixRaw), [prefixRaw]);
  const reverse = useMemo(() => parseReverseInput(reverseRaw), [reverseRaw]);
  const recovery = reverse.kind === "ok" ? macFromInterfaceId(reverse.iid) : null;

  const ll = result ? linkLocal(result.iid) : null;
  const slaac = result && prefix.kind === "ok" ? slaacAddress(prefix.network, result.iid) : null;

  const allZero = result ? result.input.every((b) => b === 0) : false;

  const macMsgId = "eui64-mac-message";
  const prefixMsgId = "eui64-prefix-message";
  const reverseMsgId = "eui64-reverse-message";

  return (
    <ToolShell slug="eui64-generator">
      <div className="space-y-6">
        <ToolPanel title="MAC address">
          <label htmlFor="eui64-mac" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            48-bit MAC address, in any common notation
          </label>
          <input
            id="eui64-mac"
            type="text"
            value={macRaw}
            onChange={(event) => setMacRaw(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={mac.kind === "error"}
            aria-describedby={macMsgId}
            placeholder="00:1a:2b:3c:4d:5e"
            data-testid="input-mac"
            className={INPUT_CLASS}
          />
          {mac.kind === "error" ? (
            <p
              id={macMsgId}
              role="alert"
              data-testid="text-mac-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{mac.message}</span>
            </p>
          ) : (
            <p id={macMsgId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {mac.kind === "hint"
                ? mac.message
                : "Colons, hyphens, spaces, Cisco dots (001a.2b3c.4d5e) or bare hex. A 64-bit EUI-64 works too."}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setMacRaw(example.value)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>
        </ToolPanel>

        {result && ll !== null ? (
          <div className="space-y-6" data-testid="output-eui64">
            {result.group || !result.universal || allZero ? (
              <div className="space-y-2">
                {result.group ? (
                  <p className={CAUTION_CLASS}>
                    The individual/group bit (0x01) is set, so this is a multicast MAC. It names a group of
                    receivers, not a network card, and no interface would derive an address from it. The
                    conversion is shown anyway.
                  </p>
                ) : null}
                {!result.universal ? (
                  <p className={CAUTION_CLASS}>
                    The universal/local bit (0x02) is already 1, so this MAC is locally administered: chosen by
                    software (a hypervisor, a container runtime, or MAC randomization) rather than burned in by
                    a vendor. Inverting the bit makes it 0 in the interface ID, which says "not globally unique".
                  </p>
                ) : null}
                {allZero ? (
                  <p className={CAUTION_CLASS}>
                    An all-zeros MAC is normally a placeholder that software reports when it has no address, not
                    the address of a working interface.
                  </p>
                ) : null}
              </div>
            ) : null}

            <ToolPanel title="Step by step">
              <ol>
                {result.source === "mac48" ? (
                  <>
                    <Step n={1} title="Split the MAC in half">
                      <Octets
                        bytes={result.input}
                        tones={["oui", "oui", "oui", "nic", "nic", "nic"]}
                        label={`MAC ${macString(result.input)}: company ID ${macString(result.input.slice(0, 3))}, extension ${macString(result.input.slice(3))}`}
                      />
                      {result.universal && !result.group ? (
                        <p className={BODY_CLASS}>
                          <span className="text-[hsl(var(--brand-signal))]">{macString(result.input.slice(0, 3))}</span>{" "}
                          is the 24-bit company ID (the OUI the IEEE assigned to the vendor).{" "}
                          <span className="text-[hsl(var(--brand-cyan))]">{macString(result.input.slice(3))}</span> is
                          the 24 bits the vendor assigned to this card.
                        </p>
                      ) : (
                        <p className={BODY_CLASS}>
                          <span className="text-[hsl(var(--brand-signal))]">{macString(result.input.slice(0, 3))}</span>{" "}
                          is the first half and{" "}
                          <span className="text-[hsl(var(--brand-cyan))]">{macString(result.input.slice(3))}</span> the
                          second.{" "}
                          {result.universal
                            ? "With the group bit set, this is a multicast address rather than one assigned to a card."
                            : "With the universal/local bit set, the first half is not an IEEE company ID: whatever software created the address chose it."}{" "}
                          The procedure splits the bytes in the same place either way.
                        </p>
                      )}
                    </Step>
                    <Step n={2} title="Insert ff:fe in the middle">
                      <Octets
                        bytes={result.inserted}
                        tones={["oui", "oui", "oui", "insert", "insert", "nic", "nic", "nic"]}
                        label={`With ff:fe inserted: ${macString(result.inserted)}`}
                      />
                      <p className={BODY_CLASS}>
                        Two fixed octets, <span className="text-[hsl(var(--brand-amber))]">ff:fe</span>, stretch 48
                        bits to the 64 an interface ID needs. They are also how you recognize this kind of
                        address later.
                      </p>
                    </Step>
                  </>
                ) : (
                  <Step n={1} title="Already 64 bits">
                    <Octets
                      bytes={result.input}
                      tones={["oui", "oui", "oui", "nic", "nic", "nic", "nic", "nic"]}
                      label={`EUI-64 ${macString(result.input)}`}
                    />
                    <p className={BODY_CLASS}>
                      An IEEE EUI-64 is already the right length, so nothing is inserted. RFC 4291 Appendix A says
                      the only change needed is the bit inversion in the next step.
                    </p>
                  </Step>
                )}
                <Step n={result.source === "mac48" ? 3 : 2} title="Invert the universal/local bit">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className={LABEL_CLASS}>First octet before</div>
                      <div className="mt-2">
                        <BitByte
                          value={result.firstBefore}
                          mark={UL_BIT}
                          caption={`Before: ${bin8(result.firstBefore)}, bit 7 is ${(result.firstBefore & UL_BIT) >> 1}`}
                        />
                      </div>
                    </div>
                    <div>
                      <div className={LABEL_CLASS}>First octet after</div>
                      <div className="mt-2">
                        <BitByte
                          value={result.firstAfter}
                          mark={UL_BIT}
                          caption={`After: ${bin8(result.firstAfter)}, bit 7 is ${(result.firstAfter & UL_BIT) >> 1}`}
                        />
                      </div>
                    </div>
                  </div>
                  <p className={BODY_CLASS}>
                    Bit 7, counting from the most significant end (mask 0x02), is the universal/local bit. It
                    was {(result.firstBefore & UL_BIT) >> 1}, which in a MAC means{" "}
                    {result.universal ? "universally administered, assigned by the vendor" : "locally administered"}.
                    It is inverted to {(result.firstAfter & UL_BIT) >> 1}, so 0x{hex2(result.firstBefore)} becomes 0x
                    {hex2(result.firstAfter)}. Bit 8 (mask 0x01), the individual/group bit, is left alone.
                  </p>
                </Step>
                <Step n={result.source === "mac48" ? 4 : 3} title="The interface identifier">
                  <Octets
                    bytes={result.iidBytes}
                    tones={
                      result.source === "mac48"
                        ? ["flip", "oui", "oui", "insert", "insert", "nic", "nic", "nic"]
                        : ["flip", "oui", "oui", "nic", "nic", "nic", "nic", "nic"]
                    }
                    label={`Interface ID ${iidString(result.iid)}`}
                  />
                  <p className="break-all font-mono-tight text-base text-[hsl(var(--brand-bone))]">
                    {iidString(result.iid)}
                  </p>
                </Step>
              </ol>
            </ToolPanel>

            <ToolPanel title="Addresses">
              <ToolResult label="Interface ID" value={iidString(result.iid)} testId="text-iid" />
              <ToolResult label="Link-local" value={addressString(ll)} testId="text-link-local" />
              <ToolResult label="Link-local, expanded" value={expand(ll)} />
              <ToolResult label="Solicited-node group" value={addressString(solicitedNode(ll))} />
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton value={addressString(ll)} label="Copy link-local address" testId="button-copy-link-local">
                  <span>Copy link-local</span>
                </CopyButton>
              </div>

              <div className="mt-6">
                <label htmlFor="eui64-prefix" className={LABEL_CLASS}>
                  Router-advertised /64 prefix
                </label>
                <input
                  id="eui64-prefix"
                  type="text"
                  value={prefixRaw}
                  onChange={(event) => setPrefixRaw(event.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={prefix.kind === "error"}
                  aria-describedby={prefixMsgId}
                  placeholder="2001:db8:1:2::/64"
                  data-testid="input-prefix"
                  className={INPUT_CLASS}
                />
                {prefix.kind === "error" ? (
                  <p
                    id={prefixMsgId}
                    role="alert"
                    data-testid="text-prefix-error"
                    className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                  >
                    <span aria-hidden="true">✕</span>
                    <span className="min-w-0 break-words">{prefix.message}</span>
                  </p>
                ) : (
                  <p id={prefixMsgId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    {prefix.kind === "ok" && prefix.notes.length
                      ? prefix.notes.join(" ")
                      : "The prefix from the router advertisement. SLAAC puts the interface ID in its last 64 bits."}
                  </p>
                )}
              </div>
              {slaac !== null ? (
                <div className="mt-3">
                  <ToolResult label="SLAAC address" value={addressString(slaac)} testId="text-slaac" />
                  <ToolResult label="SLAAC, expanded" value={expand(slaac)} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CopyButton value={addressString(slaac)} label="Copy SLAAC address" testId="button-copy-slaac">
                      <span>Copy SLAAC address</span>
                    </CopyButton>
                  </div>
                </div>
              ) : null}
            </ToolPanel>
          </div>
        ) : null}

        <ToolPanel title="Address to MAC">
          <label htmlFor="eui64-reverse" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
            IPv6 address, or a bare 64-bit interface ID
          </label>
          <input
            id="eui64-reverse"
            type="text"
            value={reverseRaw}
            onChange={(event) => setReverseRaw(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={reverse.kind === "error"}
            aria-describedby={reverseMsgId}
            placeholder="fe80::21a:2bff:fe3c:4d5e"
            data-testid="input-reverse"
            className={INPUT_CLASS}
          />
          {reverse.kind === "error" ? (
            <p
              id={reverseMsgId}
              role="alert"
              data-testid="text-reverse-error"
              className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{reverse.message}</span>
            </p>
          ) : (
            <p id={reverseMsgId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Only the last 64 bits matter. A prefix length or a zone such as %eth0 is accepted and ignored.
            </p>
          )}

          {recovery ? (
            <div className="mt-5" data-testid="output-reverse">
              <ToolResult label="Interface ID octets" value={macString(recovery.iidBytes)} />
              <ToolResult
                label="Octets 4 and 5"
                value={`${hex2(recovery.iidBytes[3])}:${hex2(recovery.iidBytes[4])}${recovery.eui64 ? " · ff:fe, modified EUI-64" : " · not ff:fe"}`}
              />
              {recovery.eui64 && recovery.mac ? (
                <>
                  <ToolResult
                    label="First octet"
                    value={`0x${hex2(recovery.iidBytes[0])} xor 0x02 = 0x${hex2(recovery.mac[0])}`}
                  />
                  <ToolResult label="Recovered MAC" value={macString(recovery.mac)} testId="text-recovered-mac" />
                  <ToolResult
                    label="Administration"
                    value={recovery.universal ? "Universal, vendor assigned" : "Local, set by software"}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CopyButton value={macString(recovery.mac)} label="Copy recovered MAC" testId="button-copy-mac">
                      <span>Copy MAC</span>
                    </CopyButton>
                  </div>
                  <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                    ff:fe in the middle is strong evidence, not proof. An administrator can type any interface
                    ID by hand, and the MAC itself may have been set by a hypervisor or changed on purpose.
                  </p>
                </>
              ) : (
                <p className={`mt-4 ${BODY_CLASS}`} data-testid="text-not-eui64">
                  This interface ID does not have ff:fe in octets 4 and 5, so it was not formed from a 48-bit MAC
                  by modified EUI-64 and no MAC can be recovered from it. It is most likely a stable opaque ID (RFC
                  7217), a temporary address (RFC 8981), assigned by DHCPv6, or configured by hand.
                </p>
              )}
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Why privacy addresses exist">
          <p className={BODY_CLASS}>
            An EUI-64 interface ID is the same on every network a device joins, so the last 64 bits of its
            source address follow it from home to school to a coffee shop, and the OUI names its vendor.
            RFC 7217 replaces that with a stable ID that differs per network, and RFC 8981 adds short-lived
            random addresses for outgoing traffic.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-privacy">
              <thead>
                <tr className="border-b border-[hsl(var(--brand-iron))]">
                  {["", "Modified EUI-64", "Stable opaque, RFC 7217", "Temporary, RFC 8981"].map((h, i) => (
                    <th
                      key={i}
                      scope="col"
                      className="py-2 pr-4 align-bottom font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                    >
                      {h === "" ? <span className="sr-only">Property</span> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRIVACY_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                    <th
                      scope="row"
                      className="py-3 pr-4 font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]"
                    >
                      {row.label}
                    </th>
                    {[row.eui, row.stable, row.temp].map((cell, i) => (
                      <td
                        key={i}
                        className="py-3 pr-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
