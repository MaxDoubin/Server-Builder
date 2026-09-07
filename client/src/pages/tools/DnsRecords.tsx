/**
 * DNS resource record reference.
 *
 * Zone-file examples use the RFC 5737 and RFC 3849 documentation ranges
 * (203.0.113.0/24 and 2001:db8::/32) so that nothing here resolves to a real
 * host if someone copies it into a live zone by accident.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolShell } from "./ToolShell";

interface RecordType {
  type: string;
  anchor: string;
  name: string;
  purpose: string;
  zone: string;
  dig: string;
  gotcha?: string;
}

const RECORDS: RecordType[] = [
  {
    type: "A",
    anchor: "rr-a",
    name: "IPv4 address",
    purpose:
      "Maps a name to a single 32-bit IPv4 address. It is the record almost every lookup ends at, because a CNAME chain and an MX target both have to resolve to an A or AAAA eventually. Several A records at the same name give crude round-robin load sharing, with no health checking of any kind.",
    zone: "www.example.com.        300     IN  A       203.0.113.10\nwww.example.com.        300     IN  A       203.0.113.11",
    dig: "dig +short A www.example.com",
  },
  {
    type: "AAAA",
    anchor: "rr-aaaa",
    name: "IPv6 address",
    purpose:
      "The IPv6 equivalent of an A record, holding a 128-bit address. The name is four As because the address is four times the size. Publishing both A and AAAA for a name is what makes a host dual-stack from a client's point of view, and a client with working IPv6 will generally try the AAAA first.",
    zone: "www.example.com.        300     IN  AAAA    2001:db8::10",
    dig: "dig +short AAAA www.example.com",
  },
  {
    type: "CNAME",
    anchor: "rr-cname",
    name: "Canonical name",
    purpose:
      "Says that this name is an alias for another name, and that the resolver should start again at the target. It aliases the whole name, not one record type, which is why the rules around it are so strict.",
    zone: "shop.example.com.       300     IN  CNAME   storefront.example-cdn.net.",
    dig: "dig +short CNAME shop.example.com",
    gotcha:
      "A name that has a CNAME may hold no other records at all (RFC 1034). That is what makes a CNAME at a zone apex illegal, and it is also why an MX or NS record must never point at a CNAME (RFC 2181).",
  },
  {
    type: "MX",
    anchor: "rr-mx",
    name: "Mail exchange",
    purpose:
      "Names the hosts that accept mail for a domain, each with a preference value. Lower numbers are tried first, and equal numbers are load shared. The absence of any MX record means senders fall back to the domain's A record, which is rarely what anyone intends.",
    zone: "example.com.            3600    IN  MX      10 mail1.example.com.\nexample.com.            3600    IN  MX      20 mail2.example.com.",
    dig: "dig +short MX example.com",
    gotcha:
      "The target must be a hostname with an address record. An IP address in an MX record is invalid, and so is pointing one at a CNAME.",
  },
  {
    type: "TXT",
    anchor: "rr-txt",
    name: "Text",
    purpose:
      "Arbitrary strings attached to a name. It was meant for human-readable notes and became the carrier for most of email authentication: SPF at the domain apex, DKIM under a selector, and DMARC under _dmarc. Domain ownership verification for cloud services also lands here.",
    zone: 'example.com.            3600    IN  TXT     "v=spf1 include:_spf.example.net -all"\n_dmarc.example.com.     3600    IN  TXT     "v=DMARC1; p=reject; rua=mailto:dmarc@example.com"',
    dig: "dig +short TXT example.com",
    gotcha:
      "A single character string caps at 255 bytes. Longer values, such as a 2048-bit DKIM key, are split into several quoted strings that the reader concatenates.",
  },
  {
    type: "NS",
    anchor: "rr-ns",
    name: "Name server",
    purpose:
      "Delegates a zone to a set of authoritative servers. NS records appear twice, once in the parent zone as the delegation and once in the child zone as authoritative data, and the two sets are supposed to agree. The parent's copy is what a resolver actually follows.",
    zone: "example.com.            86400   IN  NS      ns1.example.net.\nexample.com.            86400   IN  NS      ns2.example.net.",
    dig: "dig +short NS example.com",
    gotcha:
      "A delegation whose parent and child NS sets disagree is a lame delegation. It often works right up until the one server both sets happen to list goes away.",
  },
  {
    type: "SOA",
    anchor: "rr-soa",
    name: "Start of authority",
    purpose:
      "Exactly one per zone, holding the zone's administrative parameters: the primary server, the administrator's address, and the timers secondaries use to decide when to refresh. The serial number is what tells a secondary that the zone changed.",
    zone: "example.com.    3600    IN  SOA     ns1.example.net. hostmaster.example.com. (\n                        2026012001  ; serial\n                        7200        ; refresh\n                        3600        ; retry\n                        1209600     ; expire\n                        3600 )      ; minimum, used as the negative TTL",
    dig: "dig +noall +answer SOA example.com",
    gotcha:
      "The administrator field is an email address with the first dot standing in for the @ sign. The final number is the negative caching TTL from RFC 2308, not a default TTL for the zone.",
  },
  {
    type: "PTR",
    anchor: "rr-ptr",
    name: "Pointer",
    purpose:
      "Maps an address back to a name. IPv4 reverse lookups live under in-addr.arpa with the octets written backwards, so 203.0.113.34 becomes 34.113.0.203.in-addr.arpa. Mail servers check it, and log analysis is far easier when it is right.",
    zone: "34.113.0.203.in-addr.arpa.  3600  IN  PTR  www.example.com.",
    dig: "dig +short -x 203.0.113.34",
    gotcha:
      "Forward and reverse are separate zones, usually run by different people, and nothing keeps them in sync. IPv6 reverse uses ip6.arpa with every nibble reversed, which makes for very long names.",
  },
  {
    type: "SRV",
    anchor: "rr-srv",
    name: "Service locator",
    purpose:
      "Publishes the host and port for a named service, so a client can find it without a hardcoded port. The owner name encodes the service and protocol as underscore labels. Active Directory clients find domain controllers entirely through SRV records, which is why a broken _msdcs zone breaks a whole domain.",
    zone: "_sip._tcp.example.com.  3600    IN  SRV     10 60 5060 sipserver.example.com.",
    dig: "dig +short SRV _sip._tcp.example.com",
    gotcha:
      "The four fields are priority, weight, port, and target. Priority works like MX preference, lowest first; weight distributes load between equal priorities.",
  },
  {
    type: "CAA",
    anchor: "rr-caa",
    name: "Certification authority authorization",
    purpose:
      "Lists which certificate authorities are permitted to issue for a domain. Since 2017 CAs are required to check it before issuing, so a CAA record is a cheap way to stop a certificate being issued by a CA you do not use.",
    zone: 'example.com.            3600    IN  CAA     0 issue "letsencrypt.org"\nexample.com.            3600    IN  CAA     0 iodef "mailto:security@example.com"',
    dig: "dig +short CAA example.com",
    gotcha:
      "It constrains issuance, not trust. A browser never looks at CAA, so a certificate issued in violation of it still validates. Checking is done at issuance time by the CA.",
  },
  {
    type: "DNSKEY",
    anchor: "rr-dnskey",
    name: "DNSSEC public key",
    purpose:
      "Publishes the public half of a key the zone signs with. Zones normally hold two: a key signing key, which signs only the DNSKEY set, and a zone signing key, which signs everything else. Splitting them means the zone signing key can be rolled often without touching the parent.",
    zone: "example.com.    3600    IN  DNSKEY  257 3 13 (\n                        mdsswUyr3DPW132mOi8V9xESWE8jTo0d... )",
    dig: "dig +dnssec +noall +answer DNSKEY example.com",
    gotcha:
      "Flags 257 marks a key signing key and 256 a zone signing key. The protocol field is always 3. Algorithm 13 is ECDSA P-256 with SHA-256 and 8 is RSA with SHA-256.",
  },
  {
    type: "DS",
    anchor: "rr-ds",
    name: "Delegation signer",
    purpose:
      "A hash of a child zone's key signing key, published in the parent zone. It is the single link in the DNSSEC chain of trust that crosses a zone boundary: the root vouches for .com, .com vouches for example.com, and each step is a DS record.",
    zone: "example.com.    86400   IN  DS      12345 13 2 (\n                        49FD46E6C4B45C55D4AC... )",
    dig: "dig +noall +answer DS example.com",
    gotcha:
      "The DS lives in the parent, so publishing it means giving it to your registrar. A DS that no longer matches the child's DNSKEY takes the whole domain down with SERVFAIL, which is the classic way a key rollover goes wrong.",
  },
  {
    type: "RRSIG",
    anchor: "rr-rrsig",
    name: "Resource record signature",
    purpose:
      "A signature over one complete record set. Every signed RRset gets one RRSIG per signing key, and validating resolvers check it against the DNSKEY before trusting the answer.",
    zone: "www.example.com.  300  IN  RRSIG  A 13 3 300 (\n                        20260401000000 20260301000000 12345 example.com.\n                        oJB1W6WNGv+ldvQ3WDG0MQkg5IEhjRip8WT... )",
    dig: "dig +dnssec +noall +answer A www.example.com",
    gotcha:
      "The two timestamps are signature expiration then inception, in that order. Signatures expire on a schedule, so a zone whose resigning job has stopped fails suddenly rather than gradually.",
  },
  {
    type: "ALIAS",
    anchor: "rr-alias",
    name: "Apex alias (also ANAME, or CNAME flattening)",
    purpose:
      "A provider-side workaround for the fact that a CNAME cannot sit at a zone apex. You configure it like a CNAME, but the authoritative server resolves the target itself and answers with the resulting A and AAAA records. Nothing named ALIAS ever appears on the wire.",
    zone: "example.com.            300     IN  ALIAS   target.cdn.example.net.",
    dig: "dig +short A example.com",
    gotcha:
      "It is not a standard record type, so it is not portable. Providers call it ALIAS, ANAME, CNAME flattening, or an alias record, and the resolution happens at their nameservers, which means their view of the target is the one your visitors get.",
  },
  {
    type: "HTTPS",
    anchor: "rr-https",
    name: "Service binding (HTTPS and SVCB)",
    purpose:
      "The standards-track answer, defined in RFC 9460. In AliasMode, priority zero, it redirects a name to another target and is legal at an apex, which is what ALIAS was invented to fake. In ServiceMode it also advertises connection parameters, so a client can learn that a host speaks HTTP/3 and get address hints in the same lookup rather than a round trip later.",
    zone: 'example.com.            300     IN  HTTPS   0 target.cdn.example.net.\nwww.example.com.        300     IN  HTTPS   1 . alpn="h3,h2" ipv4hint=203.0.113.10',
    dig: "dig +short HTTPS example.com",
    gotcha:
      "Support is good in browsers and improving in authoritative servers, but it is not universal. Publish A and AAAA alongside it, not instead of it.",
  },
];

const DIG_RECIPES: { command: string; what: string }[] = [
  { command: "dig +short example.com", what: "Just the answer data, nothing else." },
  { command: "dig +noall +answer example.com", what: "The answer section with TTLs and types intact." },
  {
    command: "dig +trace example.com",
    what: "Walk the delegation yourself, from the root down, one referral at a time.",
  },
  { command: "dig @9.9.9.9 example.com", what: "Ask one specific resolver instead of the system one." },
  {
    command: "dig +norecurse @ns1.example.net example.com",
    what: "Ask an authoritative server directly and refuse to let it recurse for you.",
  },
  {
    command: "dig +dnssec +multi example.com",
    what: "Request DNSSEC records and pretty-print them. Look for the ad flag in the response.",
  },
  {
    command: "dig axfr @ns1.example.net example.com",
    what: "Attempt a zone transfer. On a correctly configured server this should be refused.",
  },
  {
    command: "dig +nssearch example.com",
    what: "Query every authoritative server for the SOA, which is how you spot one that is out of sync.",
  },
];

function CommandLine({ command }: { command: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] px-3 py-2">
      <code className="min-w-0 break-all font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
        {command}
      </code>
      <CopyButton value={command} label={`Copy command ${command}`} />
    </div>
  );
}

/**
 * Match against everything a reader might have in mind, not just the type.
 *
 * Somebody arriving here rarely knows they want a CAA record. They know they
 * want "the one that says which CA may issue", or they have a zone file in
 * front of them with a token they do not recognise. So the purpose text, the
 * example zone line and the gotcha are all searched, and every term has to
 * match somewhere, which makes two words narrow rather than widen.
 */
function matches(record: RecordType, query: string): boolean {
  const haystack =
    `${record.type} ${record.name} ${record.purpose} ${record.zone} ${record.dig} ${record.gotcha ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function DnsRecords() {
  /*
    The other three reference tables here, ports, HTTP status codes and
    Wireshark filters, all filter as you type, and this one did not. It is the
    longest of the four.
  */
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => (query.trim() === "" ? RECORDS : RECORDS.filter((r) => matches(r, query.trim()))),
    [query],
  );

  return (
    <ToolShell
      slug="dns-records"
    >
      <div className="space-y-6">
        <ToolPanel title="Find a record type">
          <label htmlFor="dns-search" className="sr-only">
            Search record types, purposes and zone file examples
          </label>
          <input
            id="dns-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="caa, mail, permitted to issue, reverse lookup..."
            data-testid="input-dns-search"
            className="w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p
            role="status"
            data-testid="text-dns-count"
            className="mt-3 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]"
          >
            {shown.length} of {RECORDS.length} record types
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {shown.map((record) => (
              <li key={record.anchor}>
                <a
                  href={`#${record.anchor}`}
                  className="inline-flex min-h-[32px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-[11px] tracking-[0.14em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  {record.type}
                </a>
              </li>
            ))}
          </ul>
        </ToolPanel>

        <ToolPanel title="The CNAME at the apex">
          <div className="space-y-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            <p>
              RFC 1034 says that if a name owns a CNAME, it may own nothing else. The apex of a zone,
              example.com itself, is required to own an SOA record and a set of NS records. Those two
              rules cannot both hold, so a CNAME at the apex is illegal, and a nameserver that lets
              you configure one will produce answers that some resolvers reject and others silently
              mangle.
            </p>
            <p>
              This collides with how modern hosting works, because a CDN or a load balancer wants to
              hand you a hostname rather than a fixed address. There are four ways out. Redirect the
              apex to www at the HTTP layer and put the CNAME on www, which is free and always works.
              Use your provider's ALIAS or ANAME record, where their nameserver resolves the target
              and answers with the addresses. Use a provider-native alias, such as a Route 53 alias
              record, which is the same idea wired into their own infrastructure. Or publish an HTTPS
              record in AliasMode, which is the standards-track version of exactly this and is legal
              at an apex by design.
            </p>
            <p>
              The tradeoff with ALIAS and ANAME is that the resolution happens at your DNS provider,
              from wherever their servers are. If the target uses geographic load balancing, your
              visitors get whatever answer your provider's resolver saw, not whatever they would have
              got themselves.
            </p>
          </div>
        </ToolPanel>

        {shown.length === 0 ? (
          <div
            data-testid="text-no-dns"
            className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-8 text-center backdrop-blur-sm"
          >
            <p className="font-display text-xl text-[hsl(var(--brand-bone))]">
              No record type matches that.
            </p>
            <p className="mt-2 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Try what the record does rather than what it is called: "mail", "which CA may
              issue", "reverse lookup".
            </p>
          </div>
        ) : null}

        {shown.map((record) => (
          <section
            key={record.anchor}
            id={record.anchor}
            className="scroll-mt-28 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.6)] p-6 backdrop-blur-sm"
          >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="font-display text-2xl font-medium text-[hsl(var(--brand-signal))]">
                {record.type}
              </h2>
              <p className="font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                {record.name}
              </p>
            </div>

            <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {record.purpose}
            </p>

            <h3 className="mt-5 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
              Zone file
            </h3>
            <div className="mt-2 flex items-start gap-3">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]">
                {record.zone}
              </pre>
              <CopyButton value={record.zone} label={`Copy ${record.type} zone example`} />
            </div>

            <h3 className="mt-5 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
              Query it
            </h3>
            <CommandLine command={record.dig} />

            {record.gotcha ? (
              <p className="mt-4 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                <span aria-hidden="true">!</span>
                <span>{record.gotcha}</span>
              </p>
            ) : null}
          </section>
        ))}

        <ToolPanel title="dig, generally">
          <ul className="space-y-3">
            {DIG_RECIPES.map((recipe) => (
              <li key={recipe.command}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <code className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-cyan))]">
                    {recipe.command}
                  </code>
                  <CopyButton value={recipe.command} label={`Copy command ${recipe.command}`} />
                </div>
                <p className="mt-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {recipe.what}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            One command that is no longer useful is dig ANY. RFC 8482 lets a server answer it with a
            minimal reply instead of the whole record set, partly because ANY queries were a
            convenient amplification lever, so what comes back is rarely everything.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
