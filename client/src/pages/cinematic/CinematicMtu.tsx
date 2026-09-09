/**
 * Ping works and the transfer hangs.
 *
 * The page is one control and one diagram. Drag the packet size, toggle
 * Don't Fragment, and watch the packet walk the path: green while it fits,
 * and stopping at the hop that cannot take it. When the ICMP that should
 * come back is swallowed, the return arrow stops at the firewall that ate
 * it and the whole room goes quiet rather than red, because silence is what
 * the fault actually produces.
 *
 * The three markers under the slider are the point. A default ping sits at
 * 84 bytes, well inside every path here, so the reassuring test crosses a
 * path that real traffic cannot. Watching the ping marker stay green while
 * the full-size marker turns black is the lesson.
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { useSEO } from "@/lib/useSEO";
import {
  IP_HEADER,
  PATHS,
  PING_DEFAULT,
  mssFor,
  pathMtu,
  pingLies,
  send,
  type Fate,
  type Path,
} from "@/lib/mtu/index";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

/** The room follows what became of the packet, not what the path is called. */
function accentFor(fate: Fate): StageAccent {
  if (fate.kind === "delivered") return "signal";
  if (fate.kind === "fragmented") return "cyan";
  if (fate.kind === "rejected") return "amber";
  return "danger";
}

const HEADLINE: Record<Fate["kind"], string> = {
  delivered: "Arrives",
  fragmented: "Fragmented and arrives",
  rejected: "Rejected, and the sender is told",
  blackholed: "Gone, and nothing says so",
};

export function CinematicMtu() {
  useSEO({
    title: "Ping Works and the Transfer Hangs | Max Doubin",
    description:
      "A default ping is 84 bytes and crosses almost anything. The fault that only breaks big packets survives every test somebody thinks to run. Walk a packet down six real paths and watch where it dies, and which firewall swallowed the message that would have explained it.",
    canonical: `${SITE_URL}/mtu`,
  });

  const [path, setPath] = useState<Path>(PATHS[3]);
  const [size, setSize] = useState(1500);
  const [df, setDf] = useState(true);

  const choose = useCallback((next: Path) => {
    setPath(next);
    setSize(next.senderMtu);
    setDf(true);
  }, []);

  const fate = useMemo(() => send(path, { size, df }), [path, size, df]);
  const pmtu = useMemo(() => pathMtu(path), [path]);
  const lies = useMemo(() => pingLies(path), [path]);

  /** How far down the path the packet got, for the diagram. */
  const reached = fate.kind === "delivered" ? path.hops.length : fate.kind === "fragmented" ? path.hops.length : fate.at;
  const swallowed = fate.kind === "blackholed" ? fate.swallowedAt : -1;

  const marks: [string, number][] = [
    ["ping", PING_DEFAULT],
    ["path MTU", pmtu],
    ["full size", path.senderMtu],
  ];

  return (
    <CinematicLayout>
      <PracticeStage accent={accentFor(fate)} mood={fate.kind === "blackholed" ? "critical" : "calm"} flashKey={0} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[940px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {PATHS.length} paths
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Ping works and the transfer hangs.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              A default ping is {PING_DEFAULT} bytes on the wire. It crosses a path with a 1400
              byte link in it without noticing, DNS is fine, SSH connects, and then the first large
              response stops dead and never comes back. Every test somebody thinks to run sends
              small packets.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              A router that cannot forward an oversized packet with Don't Fragment set must drop it
              and send back an ICMP saying what size it could have taken. When something in between
              drops that ICMP, the sender never hears it, keeps sending the same packet, and the
              connection hangs rather than fails. There is no error, and nothing logs anything.
            </p>
          </header>

          <div className="mt-11 flex flex-wrap gap-2">
            {PATHS.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => choose(item)}
                aria-pressed={path.slug === item.slug}
                data-testid={`path-${item.slug}`}
                className={`rounded-full border px-4 py-2 font-mono-tight text-[11.5px] transition-colors ${
                  path.slug === item.slug
                    ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>

          {/* ── the control ── */}
          <section className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <label className="flex-1 basis-[260px]">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                    Packet size
                  </span>
                  <span className="font-mono-tight text-[13px] tabular-nums text-[hsl(var(--brand-bone))]" data-testid="size-value">
                    {size} bytes
                  </span>
                </span>
                <input
                  type="range"
                  min={IP_HEADER + 8}
                  max={path.senderMtu}
                  step={1}
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value))}
                  data-testid="size"
                  aria-label="Packet size in bytes"
                  className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--brand-iron))] accent-[hsl(var(--brand-signal))]"
                />
              </label>
              <button
                type="button"
                onClick={() => setDf((value) => !value)}
                aria-pressed={df}
                data-testid="df"
                className={`rounded-full border px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] transition-colors ${
                  df
                    ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                }`}
              >
                Don't Fragment {df ? "set" : "clear"}
              </button>
            </div>

            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              {marks.map(([label, value]) => {
                const outcome = send(path, { size: value, df: true });
                return (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => setSize(Math.min(value, path.senderMtu))}
                      data-testid={`mark-${label.replace(/\s+/g, "-")}`}
                      className="font-mono-tight text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                    >
                      <span
                        aria-hidden="true"
                        className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                          outcome.kind === "delivered"
                            ? "bg-[hsl(var(--brand-signal))]"
                            : outcome.kind === "blackholed"
                              ? "bg-[hsl(var(--brand-danger))]"
                              : "bg-[hsl(var(--brand-amber))]"
                        }`}
                      />
                      {label} · {value}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* ── the path ── */}
            <ol className="mt-7 space-y-1.5" data-testid="hops">
              {path.hops.map((hop, index) => {
                const crossed = index < reached;
                const stopped = fate.kind !== "delivered" && fate.kind !== "fragmented" && index === fate.at;
                const ate = index === swallowed;
                return (
                  <li
                    key={hop.name}
                    data-testid={`hop-${index}`}
                    className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-3.5 py-2 transition-colors ${
                      stopped
                        ? "border-[hsl(var(--brand-danger)/0.7)] bg-[hsl(var(--brand-danger)/0.08)]"
                        : ate
                          ? "border-[hsl(var(--brand-amber)/0.7)] bg-[hsl(var(--brand-amber)/0.08)]"
                          : crossed
                            ? "border-[hsl(var(--brand-signal)/0.4)] bg-[hsl(var(--brand-signal)/0.04)]"
                            : "border-[hsl(var(--brand-iron))] opacity-55"
                    }`}
                  >
                    <span className="w-6 font-mono-tight text-[11px] tabular-nums text-[hsl(var(--brand-ash))]">
                      {index + 1}
                    </span>
                    <span className="min-w-[120px] font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone))]">
                      {hop.name}
                    </span>
                    <span className="font-mono-tight text-[11.5px] tabular-nums text-[hsl(var(--brand-ash))]">
                      MTU {hop.mtu}
                    </span>
                    {hop.blocksIcmp ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-amber))]">
                        drops ICMP
                      </span>
                    ) : null}
                    {stopped ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-danger))]">
                        packet dies here
                      </span>
                    ) : null}
                    {ate ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-amber))]">
                        and the explanation dies here
                      </span>
                    ) : null}
                    {hop.note ? (
                      <span className="w-full font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
                        {hop.note}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {/* ── the verdict ── */}
            <div
              className="mt-6 border-l-2 pl-4"
              style={{ borderColor: `hsl(var(--brand-${accentFor(fate)}))` }}
              data-testid="verdict"
            >
              <p className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                · {HEADLINE[fate.kind]}
              </p>
              <p className="mt-2 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {fate.kind === "delivered"
                  ? `${size} bytes fits every link on this path. The path MTU is ${pmtu}, so a TCP stack here should settle on an MSS of ${mssFor(pmtu)}.`
                  : fate.kind === "fragmented"
                    ? `${path.hops[fate.at].name} could not forward ${size} bytes, and with Don't Fragment clear it split the packet into ${fate.into} fragments and forwarded them. It arrives, at the cost of the receiver having to reassemble it, and of one lost fragment costing the whole packet.`
                    : fate.kind === "rejected"
                      ? `${path.hops[fate.at].name} cannot forward ${size} bytes and Don't Fragment is set, so it dropped the packet and sent back an ICMP offering ${fate.needs}. The sender hears it, lowers its path MTU, and retries. This is the system working: it looks like a stall for one round trip and then recovers.`
                      : `${path.hops[fate.at].name} cannot forward ${size} bytes and dropped it, correctly, with an ICMP offering ${fate.needs}. That message never reached the sender: ${path.hops[fate.swallowedAt].name} drops ICMP, and it is on the way back. The sender learns nothing, retransmits the same oversized packet, and the connection hangs. Nothing here logs an error, because from every device's point of view nothing went wrong.`}
              </p>
            </div>

            {lies ? (
              <p
                className="mt-4 border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                data-testid="ping-lies"
              >
                <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                  And ping says it is fine ·{" "}
                </span>
                A default ping is {PING_DEFAULT} bytes and crosses this path without touching the
                narrow link. So does the TCP handshake, and so does every DNS lookup. The first
                thing to break is the first full-size packet, which is usually a response body
                rather than a request, which is why it looks like the far end is broken.
              </p>
            ) : null}
          </section>

          <section className="mt-12">
            <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Finding it for real
            </h2>
            <p className="mt-3 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Send the packet the application would send, with Don't Fragment set, and walk the
              size down until something arrives. The number you find is the path MTU, and the
              difference between it and 1500 tells you what is in the way.
            </p>
            <pre className="mt-4 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
{`# Linux: -M do sets DF, -s is payload, so add 28 for the headers
ping -M do -s 1472 app.example.com    # 1500 on the wire
ping -M do -s 1412 app.example.com    # 1440, an IPsec-shaped answer
ping -M do -s 1372 app.example.com    # 1400, a GRE-shaped answer

# macOS and BSD
ping -D -s 1472 app.example.com

# Windows
ping -f -l 1472 app.example.com

# Or ask the kernel what it has already worked out
ip route get 203.0.113.10
tracepath app.example.com`}</pre>
            <p className="mt-4 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
              The fix is usually one of three. Let the ICMP through, which is the correct one and
              costs nothing: type 3 code 4 is not an attack surface, it is the protocol working.
              Clamp the MSS on the tunnel interface, which makes TCP negotiate a size that fits and
              does nothing for UDP. Or lower the MTU on the hosts, which works and is the one that
              gets forgotten when the tunnel changes.
            </p>
          </section>


          <ReadAboutThis href="/mtu" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The written version of this, with the capture that finally showed it, is at{" "}
            <Link
              href="/blog/mtu-mismatch-troubleshooting"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the MTU bug that only breaks big transfers
            </Link>
            . The rest of the practice material is at the{" "}
            <Link
              href="/practice"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              practice hub
            </Link>
            .
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
