/**
 * Pure logic for the iperf3 command builder.
 *
 * iperf3 is documented in its man page (iperf3(1)) and the project's user
 * docs. The flags here follow that reference: -s for a server, -c for a
 * client, -u for UDP, -b for a target bitrate, -t for duration, -P for
 * parallel streams, -R to reverse, --bidir for a bidirectional test, -w for
 * the socket buffer (window), -M for the TCP MSS, -i for the report
 * interval, -J for JSON, -4/-6 to pin the address family, -B to bind a
 * local address, and -p for the port.
 *
 * Everything here is a pure function with no React or DOM dependency so it
 * can be unit tested against known command strings and real iperf3 output.
 */

export type Iperf3Role = "server" | "client";
export type Iperf3Protocol = "tcp" | "udp";
export type IpVersion = "auto" | "4" | "6";

export interface Iperf3Options {
  role: Iperf3Role;
  /** Server host or address for a client run. Ignored for a server. */
  host: string;
  /** Listening or target port. Empty means the iperf3 default, 5201. */
  port: string;
  protocol: Iperf3Protocol;
  /** Target bitrate for -b, for example 100M or 1G. UDP only in practice. */
  bandwidth: string;
  /** Test length in seconds for -t. */
  duration: string;
  /** Parallel client streams for -P. */
  parallel: string;
  /** Reverse the direction so the server sends (-R). */
  reverse: boolean;
  /** Test both directions at once (--bidir). */
  bidir: boolean;
  /** Socket buffer / window size for -w, for example 256K. */
  window: string;
  /** TCP maximum segment size for -M. */
  mss: string;
  /** Report interval in seconds for -i. */
  interval: string;
  /** Emit machine readable JSON (-J). */
  json: boolean;
  ipVersion: IpVersion;
  /** Local address to bind with -B. */
  bind: string;
}

export const DEFAULT_IPERF3_OPTIONS: Iperf3Options = {
  role: "client",
  host: "10.0.0.1",
  port: "",
  protocol: "tcp",
  bandwidth: "",
  duration: "10",
  parallel: "1",
  reverse: false,
  bidir: false,
  window: "",
  mss: "",
  interval: "1",
  json: false,
  ipVersion: "auto",
  bind: "",
};

/**
 * The limits iperf3 itself enforces (src/iperf.h and iperf_error.c in the
 * esnet/iperf source): a port is 1 to 65535, a test lasts 0 to 86400 seconds,
 * there are 1 to 128 parallel streams, the MSS is at most 32767 bytes, and a
 * report interval is 0 (reports off) or 0.1 to 60 seconds. A value outside its
 * range makes iperf3 refuse to run, so the builder leaves it out and says so.
 */
const LIMITS = {
  port: { min: 1, max: 65535 },
  duration: { min: 1, max: 86400 },
  parallel: { min: 1, max: 128 },
  mss: { min: 1, max: 32767 },
  interval: { min: 0.1, max: 60 },
} as const;

/** A whole number inside [min, max], or null. Leading zeros are dropped. */
function wholeInRange(raw: string, min: number, max: number): string | null {
  const value = raw.trim();
  if (!/^[0-9]+$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return String(n);
}

/** The report interval: 0 turns reports off, otherwise 0.1 to 60 seconds. */
function intervalValue(raw: string): string | null {
  const value = raw.trim();
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return null;
  const n = Number(value);
  if (n === 0) return "0";
  if (!Number.isFinite(n) || n < LIMITS.interval.min || n > LIMITS.interval.max) return null;
  return String(n);
}

/** A size field (-b, -w, -M) accepts a plain number or a number with a K/M/G/T suffix. */
function sizeToken(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (!/^[0-9]+(?:\.[0-9]+)?[KMGTkmgt]?$/.test(value)) return null;
  return value;
}

/**
 * The server field, kept only when it could be a host name or an address.
 *
 * The command is meant to be pasted into a terminal, so a value that carries
 * a semicolon, a quote, a space or a substitution would run as more than an
 * argument. Letters, digits and the few characters names and addresses use
 * (including the colons of IPv6 and a zone after a percent sign) are
 * accepted. Anything else is replaced by a placeholder, the way the bind
 * address is dropped and the way the nmap builder falls back to TARGET.
 */
function cleanHost(raw: string): { host: string; rejected: boolean } {
  const value = raw.trim();
  if (value === "") return { host: "HOST", rejected: false };
  if (/^[A-Za-z0-9:._%-]+$/.test(value)) return { host: value, rejected: false };
  return { host: "HOST", rejected: true };
}

/** One flag the command may carry, with a short reason it is there. */
export interface Iperf3Flag {
  flag: string;
  explanation: string;
}

/**
 * Build the argument pieces and a parallel list of flag explanations, so the
 * command string and the per-flag table never disagree.
 */
export function buildIperf3Parts(o: Iperf3Options): { parts: string[]; flags: Iperf3Flag[]; ignored: string[] } {
  const parts: string[] = ["iperf3"];
  const flags: Iperf3Flag[] = [];
  const add = (flag: string, explanation: string) => {
    parts.push(flag);
    flags.push({ flag, explanation });
  };
  const ignored: string[] = [];
  /** A typed number that is not usable: say which field was left out and why. */
  const skip = (label: string, raw: string, rule: string) => {
    ignored.push(`${label} "${raw.trim().slice(0, 24)}" was left out. ${rule}`);
  };
  /** A whole-number field with iperf3's own limits. Empty means "use the default". */
  const whole = (raw: string, limit: { min: number; max: number }, label: string): string | null => {
    if (raw.trim() === "") return null;
    const v = wholeInRange(raw, limit.min, limit.max);
    if (v === null) skip(label, raw, `iperf3 accepts a whole number from ${limit.min} to ${limit.max}.`);
    return v;
  };

  if (o.role === "server") {
    add("-s", "Run as a server and wait for an incoming test.");
  } else {
    const { host, rejected } = cleanHost(o.host);
    parts.push("-c", host);
    flags.push({
      flag: `-c ${host}`,
      explanation: rejected
        ? "The server field holds characters that are not part of a host name or address, so HOST is shown instead. Type a name such as iperf.example.com or an address."
        : "Run as a client and connect to this server.",
    });

    if (o.protocol === "udp") {
      add("-u", "Use UDP instead of TCP. UDP reports loss and jitter and never retransmits.");
      const bw = sizeToken(o.bandwidth);
      if (bw) {
        add(
          `-b ${bw}`,
          "Target bitrate. With UDP this is the send rate, which is why UDP without -b defaults to only 1 Mbit/s.",
        );
      }
    } else {
      const bw = sizeToken(o.bandwidth);
      if (bw) {
        add(`-b ${bw}`, "Rate limit for TCP. Without it TCP sends as fast as congestion control allows.");
      }
    }

    const dur = whole(o.duration, LIMITS.duration, "Duration");
    if (dur && dur !== "10") add(`-t ${dur}`, "Run for this many seconds (the default is 10).");

    const streams = whole(o.parallel, LIMITS.parallel, "Parallel streams");
    if (streams && streams !== "1") {
      add(
        `-P ${streams}`,
        "Open this many parallel streams. Several streams together can fill a high bandwidth-delay-product link that one stream cannot.",
      );
    }

    /*
      iperf3 refuses the two together ("cannot be both reverse and
      bidirectional"), and bidirectional already covers the reverse
      direction, so when both are set it is the one that stays.
    */
    if (o.reverse && !o.bidir) add("-R", "Reverse the test so the server sends and the client receives.");
    if (o.bidir) {
      add(
        "--bidir",
        o.reverse
          ? "Test both directions at the same time. iperf3 refuses -R together with --bidir, so -R is left out."
          : "Test both directions at the same time.",
      );
    }

    const win = sizeToken(o.window);
    if (win) {
      add(
        `-w ${win}`,
        "Set the socket buffer, which bounds the TCP window. The window must be at least the bandwidth-delay product to fill the link.",
      );
    }

    const mss = whole(o.mss, LIMITS.mss, "MSS");
    if (mss) add(`-M ${mss}`, "Set the TCP maximum segment size, the largest payload per segment.");

    if (o.interval.trim() !== "") {
      const interval = intervalValue(o.interval);
      if (interval === null) {
        skip("Report interval", o.interval, "iperf3 accepts 0 to turn reports off, or 0.1 to 60 seconds.");
      } else if (interval === "0") {
        add("-i 0", "Turn off the periodic reports. Only the final summary is printed.");
      } else if (interval !== "1") {
        add(`-i ${interval}`, "Print a report every this many seconds.");
      }
    }
  }

  const port = whole(o.port, LIMITS.port, "Port");
  if (port && port !== "5201") add(`-p ${port}`, "Use this port instead of the default 5201.");

  if (o.ipVersion === "4") add("-4", "Use IPv4 only.");
  else if (o.ipVersion === "6") add("-6", "Use IPv6 only.");

  const bind = o.bind.trim();
  if (bind !== "" && /^[A-Za-z0-9:._%-]+$/.test(bind)) {
    parts.push("-B", bind);
    flags.push({ flag: `-B ${bind}`, explanation: "Bind to this local address or interface." });
  }

  if (o.json) add("-J", "Emit JSON output for scripts instead of the human readable table.");

  return { parts, flags, ignored };
}

/** The command as a single shell line. */
export function buildIperf3Command(o: Iperf3Options): string {
  return buildIperf3Parts(o).parts.join(" ");
}

/* ----------------------------------------------------- summary parsing */

/** The decimal SI factor to turn an iperf3 rate into Mbit/s. */
function rateToMbps(value: number, prefix: string): number {
  switch (prefix) {
    case "K":
    case "k":
      return value / 1000;
    case "M":
    case "m":
      return value;
    case "G":
    case "g":
      return value * 1000;
    case "T":
    case "t":
      return value * 1_000_000;
    default:
      // No prefix means plain bits per second.
      return value / 1_000_000;
  }
}

export interface Iperf3Row {
  role: "sender" | "receiver";
  /** True for a [SUM] line that totals parallel streams. */
  isSum: boolean;
  /** Raw transfer text, for example "1.09 GBytes". */
  transfer: string;
  /** Raw bitrate text, for example "938 Mbits/sec". */
  bitrate: string;
  /** Bitrate normalized to Mbit/s. */
  bitrateMbps: number;
  /** TCP retransmits on a sender line, or null when the column is absent. */
  retransmits: number | null;
  /** UDP jitter in milliseconds, or null for a TCP row. */
  jitterMs: number | null;
  lostDatagrams: number | null;
  totalDatagrams: number | null;
  lossPercent: number | null;
}

export interface Iperf3Summary {
  rows: Iperf3Row[];
  /** Preferred sender row: the [SUM] line when present, otherwise the single stream. */
  sender: Iperf3Row | null;
  receiver: Iperf3Row | null;
  protocol: "tcp" | "udp" | "unknown";
}

const BITRATE = /([0-9]+(?:\.[0-9]+)?)\s*([KMGTkmgt]?)bits\/sec/;
const TRANSFER = /([0-9]+(?:\.[0-9]+)?)\s*([KMGTkmgt]?)Bytes/;
const UDP_TAIL = /([0-9]+(?:\.[0-9]+)?)\s*ms\s+([0-9]+)\/([0-9]+)\s*\(([0-9]+(?:\.[0-9]+)?)%\)/;
const TCP_SENDER_RETR = /bits\/sec\s+([0-9]+)\s+sender/;

/**
 * Read a pasted iperf3 text summary and pull out the sender and receiver
 * rows. Only the lines ending in "sender" or "receiver" are summaries; the
 * per-interval lines in between are ignored. The function never throws: an
 * input with no summary lines returns empty results.
 */
/**
 * A real iperf3 run prints two summary lines, or a handful with parallel
 * streams. Stop collecting well before any adversarial paste can grow the
 * array without bound; the picked sender and receiver rows are still correct
 * because they appear at the top of a normal run.
 */
export const IPERF3_MAX_ROWS = 2000;

export function parseIperf3Summary(text: string): Iperf3Summary {
  const rows: Iperf3Row[] = [];
  let sawUdp = false;
  let sawTcp = false;

  for (const line of text.split(/\r?\n/)) {
    if (rows.length >= IPERF3_MAX_ROWS) break;
    const roleMatch = /\b(sender|receiver)\s*$/.exec(line.trim());
    if (!roleMatch) continue;
    const role = roleMatch[1] as "sender" | "receiver";

    const bitrateMatch = BITRATE.exec(line);
    if (!bitrateMatch) continue;
    const bitrateMbps = rateToMbps(Number(bitrateMatch[1]), bitrateMatch[2]);

    const transferMatch = TRANSFER.exec(line);
    const udpMatch = UDP_TAIL.exec(line);

    let retransmits: number | null = null;
    let jitterMs: number | null = null;
    let lostDatagrams: number | null = null;
    let totalDatagrams: number | null = null;
    let lossPercent: number | null = null;

    if (udpMatch) {
      sawUdp = true;
      jitterMs = Number(udpMatch[1]);
      lostDatagrams = Number(udpMatch[2]);
      totalDatagrams = Number(udpMatch[3]);
      lossPercent = Number(udpMatch[4]);
    } else {
      sawTcp = true;
      const retrMatch = TCP_SENDER_RETR.exec(line);
      if (retrMatch) retransmits = Number(retrMatch[1]);
    }

    rows.push({
      role,
      isSum: /\[\s*SUM\s*\]/.test(line),
      transfer: transferMatch ? `${transferMatch[1]} ${transferMatch[2]}Bytes` : "",
      bitrate: `${bitrateMatch[1]} ${bitrateMatch[2]}bits/sec`,
      bitrateMbps,
      retransmits,
      jitterMs,
      lostDatagrams,
      totalDatagrams,
      lossPercent,
    });
  }

  const pick = (role: "sender" | "receiver"): Iperf3Row | null => {
    const matching = rows.filter((r) => r.role === role);
    if (matching.length === 0) return null;
    return matching.find((r) => r.isSum) ?? matching[matching.length - 1];
  };

  return {
    rows,
    sender: pick("sender"),
    receiver: pick("receiver"),
    protocol: sawUdp ? "udp" : sawTcp ? "tcp" : "unknown",
  };
}
