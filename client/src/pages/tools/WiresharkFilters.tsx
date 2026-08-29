/**
 * Wireshark display-filter recipes.
 *
 * Grouped by the question you are trying to answer rather than by protocol,
 * because that is how the need actually arrives: "which host is retransmitting"
 * comes first, and the field name comes second.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolShell } from "./ToolShell";

interface Recipe {
  filter: string;
  what: string;
}

interface Group {
  id: string;
  label: string;
  blurb: string;
  recipes: Recipe[];
}

const GROUPS: Group[] = [
  {
    id: "find",
    label: "Find something",
    blurb: "Narrowing a capture down to the traffic you actually care about.",
    recipes: [
      { filter: "ip.addr == 10.0.0.5", what: "Every packet to or from one host, in both directions." },
      {
        filter: "ip.src == 10.0.0.5 && ip.dst == 10.0.0.9",
        what: "One direction of one conversation, which is how you separate request from response.",
      },
      { filter: "ip.addr == 192.168.1.0/24", what: "Anything touching a whole subnet." },
      {
        filter: "!(ip.addr == 10.0.0.5)",
        what: "Everything except one host. Written this way deliberately: ip.addr != 10.0.0.5 does not mean this.",
      },
      {
        filter: "eth.addr == 00:1a:2b:3c:4d:5e",
        what: "Follow a device by MAC, which survives a DHCP lease change.",
      },
      { filter: "tcp.port == 443 || udp.port == 443", what: "One port number across both transports." },
      { filter: 'frame contains "password"', what: "A raw byte-string search anywhere in the frame." },
      {
        filter: 'frame matches "(?i)authorization"',
        what: "Case-insensitive regular expression across the whole frame.",
      },
      { filter: "frame.len > 1400", what: "Large frames, close to a typical Ethernet MTU." },
      { filter: "vlan.id == 20", what: "A single VLAN out of a trunk capture." },
      {
        filter: "frame.time_relative >= 10 && frame.time_relative <= 20",
        what: "A ten-second window measured from the first packet in the capture.",
      },
    ],
  },
  {
    id: "protocol",
    label: "By protocol",
    blurb: "Isolating one protocol, or muting the ones you do not want.",
    recipes: [
      { filter: "dns", what: "Every DNS query and response." },
      { filter: 'dns.qry.name contains "example"', what: "Lookups for names containing a string." },
      { filter: "dns.flags.rcode != 0", what: "DNS answers that came back as an error rather than data." },
      { filter: "arp.opcode == 2", what: "ARP replies only, which is where poisoning shows up." },
      { filter: "icmp.type == 3", what: "Destination unreachable of any code." },
      {
        filter: "dhcp",
        what: "The whole DHCP exchange. Wireshark called this filter bootp before version 3.0.",
      },
      {
        filter: "tls.handshake.type == 1",
        what: "TLS Client Hello, which carries the SNI and the offered cipher suites.",
      },
      {
        filter: "tls.handshake.extensions_server_name",
        what: "Packets that name the host being connected to, even though the session is encrypted.",
      },
      { filter: "quic", what: "HTTP/3 and anything else riding on QUIC." },
      { filter: "smb2", what: "Modern Windows file sharing." },
      {
        filter: "!(arp or icmp or dns or mdns)",
        what: "Mute the background chatter on a LAN capture so the real traffic is visible.",
      },
    ],
  },
  {
    id: "http",
    label: "HTTP",
    blurb: "Web traffic, when it is not wrapped in TLS.",
    recipes: [
      { filter: "http.request", what: "Requests only: one row per URL fetched." },
      { filter: "http.response.code >= 400", what: "Every error the server returned." },
      { filter: 'http.request.method == "POST"', what: "Form submissions and API writes." },
      { filter: 'http.host contains "example.com"', what: "Requests aimed at one site." },
      { filter: 'http.request.uri contains "login"', what: "Authentication endpoints." },
      { filter: 'http.user_agent contains "curl"', what: "Clients that are not browsers." },
      { filter: "http.cookie", what: "Requests carrying a session cookie." },
      { filter: "http.authorization", what: "Basic or Bearer credentials sitting in a header." },
      { filter: 'http.content_type contains "json"', what: "API traffic rather than page loads." },
      {
        filter: "http.time > 1",
        what: "Responses that took over a second, measured from the matching request.",
      },
      {
        filter: 'http.file_data contains "password"',
        what: "A string inside a reassembled HTTP body rather than a header.",
      },
    ],
  },
  {
    id: "tcp",
    label: "TCP analysis",
    blurb: "Wireshark's expert fields, which do the sequence-number bookkeeping for you.",
    recipes: [
      {
        filter: "tcp.flags.syn == 1 && tcp.flags.ack == 0",
        what: "Connection attempts: the first packet of every handshake.",
      },
      { filter: "tcp.flags.reset == 1", what: "Resets: refusals, timeouts, and abrupt teardowns." },
      { filter: "tcp.analysis.flags", what: "Everything the expert system flagged as unusual." },
      { filter: "tcp.analysis.retransmission", what: "Segments the sender had to send again." },
      { filter: "tcp.analysis.duplicate_ack", what: "The receiver repeatedly asking for a missing segment." },
      { filter: "tcp.analysis.zero_window", what: "A receiver whose buffer is completely full." },
      { filter: "tcp.analysis.lost_segment", what: "A gap in the sequence space that never got filled." },
      {
        filter: "tcp.stream eq 3",
        what: "One entire conversation. This is the filter Follow TCP Stream writes for you.",
      },
      { filter: "tcp.len > 0", what: "Segments carrying data, which hides the pure acknowledgements." },
      {
        filter: "tcp.options.mss_val < 1460",
        what: "Handshakes negotiating a smaller maximum segment size than the Ethernet default.",
      },
      { filter: "tcp.analysis.ack_rtt > 0.2", what: "Acknowledgements that took more than 200 milliseconds." },
    ],
  },
  {
    id: "security",
    label: "Security",
    blurb: "Scan fingerprints, cleartext credentials, and the protocols attackers abuse.",
    recipes: [
      {
        filter: "tcp.flags.syn == 1 && tcp.flags.ack == 0 && tcp.window_size <= 1024",
        what: "The SYN-scan fingerprint: a handshake attempt with a small fixed window and no payload.",
      },
      {
        filter: "tcp.flags.fin == 1 && tcp.flags.syn == 0 && tcp.flags.ack == 0",
        what: "FIN scan: a FIN arriving with no connection behind it.",
      },
      {
        filter: "tcp.flags.fin == 1 && tcp.flags.push == 1 && tcp.flags.urg == 1",
        what: "XMAS scan: three flags no real stack sets together.",
      },
      { filter: "tcp.flags == 0", what: "NULL scan: a TCP segment with every flag clear." },
      {
        filter: "dns.qry.name.len > 50 && !mdns",
        what: "Unusually long DNS names, which is the shape of data being tunnelled out over DNS.",
      },
      {
        filter: "dns.flags.rcode == 3",
        what: "NXDOMAIN storms, the signature of malware working through a domain generation algorithm.",
      },
      { filter: 'ftp.request.command == "PASS"', what: "FTP passwords crossing the wire in the clear." },
      { filter: "telnet", what: "Any Telnet session, which is cleartext by definition." },
      {
        filter: "ntlmssp.messagetype == 3",
        what: "NTLM authenticate messages, the ones a relay or a hash capture is after.",
      },
      {
        filter: "llmnr || nbns",
        what: "The name-resolution fallbacks Responder poisons to harvest credentials.",
      },
      {
        filter: "ip.flags.mf == 1 || ip.frag_offset > 0",
        what: "Fragmented IP traffic, a long-standing way of slipping past an inspection device.",
      },
      { filter: "eapol", what: "802.1X exchanges, including the WPA four-way handshake." },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    blurb: "Where the time is going when something is slow rather than broken.",
    recipes: [
      { filter: "tcp.analysis.rto", what: "Retransmission timeouts, which cost far more than a fast retransmit." },
      { filter: "tcp.analysis.window_full", what: "The sender has filled everything the receiver advertised." },
      { filter: "tcp.analysis.out_of_order", what: "Segments arriving in the wrong sequence." },
      {
        filter: "tcp.analysis.spurious_retransmission",
        what: "Data resent after the peer had already acknowledged it.",
      },
      { filter: "tcp.analysis.keep_alive", what: "Idle connections being held open." },
      { filter: "tcp.analysis.bytes_in_flight > 100000", what: "Large amounts of unacknowledged data outstanding." },
      {
        filter: "tcp.time_delta > 1",
        what: "A gap of over a second inside one stream. Needs Calculate conversation timestamps enabled in the TCP preferences.",
      },
      {
        filter: "icmp.type == 3 && icmp.code == 4",
        what: "Fragmentation needed but DF set: the classic path MTU black hole.",
      },
      { filter: "dns.time > 0.5", what: "DNS answers that took longer than half a second." },
      {
        filter: "tcp.window_size == 0 && tcp.flags.reset == 0",
        what: "Zero-window advertisements that are not just a connection being torn down.",
      },
      {
        filter: "frame.time_delta_displayed > 1",
        what: "Gaps between the packets currently on screen, rather than in the whole capture.",
      },
    ],
  },
];

const CAPTURE_FILTERS: Recipe[] = [
  { filter: "host 10.0.0.5", what: "Only traffic to or from one address." },
  { filter: "net 192.168.1.0/24", what: "Only traffic touching one subnet." },
  { filter: "tcp port 443", what: "Only TCP on one port." },
  { filter: "port 53 and not port 22", what: "DNS, but never your own SSH session to the capture host." },
  { filter: "not arp and not stp", what: "Drop the switch chatter before it reaches disk." },
  { filter: "ether host 00:1a:2b:3c:4d:5e", what: "One device by MAC, regardless of its IP." },
  {
    filter: "tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0",
    what: "Bare SYNs only, expressed as a byte offset because BPF has no named flag fields.",
  },
];

const TOTAL_RECIPES = GROUPS.reduce((sum, group) => sum + group.recipes.length, 0);

function RecipeRow({ recipe }: { recipe: Recipe }) {
  return (
    <li className="border-b border-[hsl(var(--brand-iron)/0.5)] py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <code className="min-w-0 break-all font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
          {recipe.filter}
        </code>
        <CopyButton value={recipe.filter} label={`Copy filter ${recipe.filter}`} />
      </div>
      <p className="mt-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {recipe.what}
      </p>
    </li>
  );
}

export function WiresharkFilters() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return GROUPS;
    return GROUPS.map((group) => ({
      ...group,
      recipes: group.recipes.filter((recipe) =>
        `${recipe.filter} ${recipe.what} ${group.label}`.toLowerCase().includes(needle),
      ),
    })).filter((group) => group.recipes.length > 0);
  }, [query]);

  const shown = filtered.reduce((sum, group) => sum + group.recipes.length, 0);

  return (
    <ToolShell
      slug="wireshark-filters"
    >
      <div className="space-y-6">
        <ToolPanel title="Search">
          <label
            htmlFor="filter-search"
            className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
          >
            Search {TOTAL_RECIPES} recipes by filter text or by what it finds
          </label>
          <input
            id="filter-search"
            type="search"
            value={query}
            spellCheck={false}
            autoComplete="off"
            data-testid="input-filter-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="retransmission, scan, dns"
            className="mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p role="status" className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            {shown} of {TOTAL_RECIPES} recipes
          </p>
        </ToolPanel>

        {filtered.length === 0 ? (
          <ToolPanel>
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              Nothing matches that search.
            </p>
          </ToolPanel>
        ) : null}

        {filtered.map((group) => (
          <ToolPanel key={group.id} title={group.label}>
            <p className="-mt-2 mb-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              {group.blurb}
            </p>
            <ul>
              {group.recipes.map((recipe) => (
                <RecipeRow key={recipe.filter} recipe={recipe} />
              ))}
            </ul>
          </ToolPanel>
        ))}

        <ToolPanel title="Capture filters are not display filters">
          <div className="space-y-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            <p>
              A capture filter is BPF, evaluated by libpcap in the kernel before a packet is ever
              written down. A display filter is Wireshark's own language, evaluated over packets you
              have already got. The practical difference is that a capture filter is destructive: what
              it rejects is gone, and no amount of clicking afterwards will bring it back. A display
              filter only changes what you are looking at, so you can change your mind as often as you
              like.
            </p>
            <p>
              The syntaxes are unrelated, which is the usual source of confusion.{" "}
              <code className="text-[hsl(var(--brand-signal))]">tcp port 80</code> is a capture filter
              and <code className="text-[hsl(var(--brand-signal))]">tcp.port == 80</code> is a display
              filter, and each one is a syntax error in the other box. BPF has no dotted field names,
              no double equals, and no dissector knowledge at all: it matches on byte offsets, which is
              why the SYN example below has to index into the TCP header by hand.
            </p>
            <p>
              Use a capture filter when the volume would otherwise be unmanageable, or when you must
              not record traffic you have no authority to record. Use a display filter for everything
              else. On a busy link the sensible pattern is a broad capture filter that keeps the whole
              conversation, then display filters to work through it.
            </p>
          </div>

          <h3 className="mt-6 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
            Capture filter examples (BPF)
          </h3>
          <ul className="mt-2">
            {CAPTURE_FILTERS.map((recipe) => (
              <RecipeRow key={recipe.filter} recipe={recipe} />
            ))}
          </ul>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
