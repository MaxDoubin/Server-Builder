/**
 * Pure logic for the Nmap command builder.
 *
 * Flags follow the Nmap reference guide (the nmap(1) man page and
 * nmap.org/book). Scan types: -sS SYN, -sT connect, -sU UDP, -sA ACK, and
 * the -sN/-sF/-sX null, FIN and Xmas probes, plus -sn for host discovery
 * with no port scan. Port selection uses -p, --top-ports, -F and -p-.
 * Service and version detection is -sV, OS detection is -O, default scripts
 * are -sC, and named scripts are --script. Timing is -T0 through -T5, host
 * discovery control is -Pn and -PS/-PA/-PE, output is -oN/-oX/-oG/-oA, -n
 * disables reverse DNS, and --min-rate/--max-rate bound the packet rate.
 *
 * Pure functions only, so the builder, the description and the privilege
 * check can be unit tested.
 */

export type NmapScanType = "sS" | "sT" | "sU" | "sA" | "sN" | "sF" | "sX" | "sn";
export type NmapPortMode = "default" | "top" | "fast" | "all" | "list";
export type NmapOutputMode = "none" | "normal" | "xml" | "grep" | "all";

export interface NmapOptions {
  target: string;
  scanType: NmapScanType;
  portMode: NmapPortMode;
  /** Count for --top-ports. */
  topPorts: string;
  /** Value for -p, for example "22,80,443" or "1-1024". */
  portList: string;
  /** Probe open ports for service and version (-sV). */
  serviceVersion: boolean;
  /** Intensity 0 to 9 for --version-intensity. Empty leaves the default. */
  versionIntensity: string;
  /** OS detection (-O). */
  osDetection: boolean;
  /** Default script set (-sC). */
  defaultScripts: boolean;
  /** Value for --script, for example "http-title,ssl-cert". */
  scripts: string;
  /** Timing template 0 to 5, or empty for the default (T3). */
  timing: string;
  /** Skip host discovery and treat every host as up (-Pn). */
  noPing: boolean;
  /** Any of "PS", "PA", "PE" for -PS/-PA/-PE discovery probes. */
  pingTypes: string[];
  /** When false, add -n to skip reverse DNS. */
  resolveDns: boolean;
  outputMode: NmapOutputMode;
  /** Base filename for the chosen output. */
  outputFile: string;
  /** Floor packet rate for --min-rate. */
  minRate: string;
  /** Ceiling packet rate for --max-rate. */
  maxRate: string;
}

export const DEFAULT_NMAP_OPTIONS: NmapOptions = {
  target: "scanme.nmap.org",
  scanType: "sS",
  portMode: "default",
  topPorts: "100",
  portList: "22,80,443",
  serviceVersion: false,
  versionIntensity: "",
  osDetection: false,
  defaultScripts: false,
  scripts: "",
  timing: "4",
  noPing: false,
  pingTypes: [],
  resolveDns: true,
  outputMode: "none",
  outputFile: "scan",
  minRate: "",
  maxRate: "",
};

const SCAN_LABEL: Record<NmapScanType, string> = {
  sS: "TCP SYN (half open) scan. Sends a SYN and reads the reply without completing the handshake.",
  sT: "TCP connect scan. Completes the full three-way handshake through the operating system.",
  sU: "UDP scan. Slow because closed UDP ports often return nothing and are retried.",
  sA: "TCP ACK scan. Maps which ports a stateful firewall filters rather than whether they are open.",
  sN: "TCP null scan. Sends a packet with no flags set.",
  sF: "TCP FIN scan. Sends a lone FIN.",
  sX: "TCP Xmas scan. Sets the FIN, PSH and URG flags together.",
  sn: "Ping sweep. Discovers which hosts are up and runs no port scan.",
};

/** Scan types that send raw packets and need root, plus the reason. */
const RAW_SCANS: Partial<Record<NmapScanType, string>> = {
  sS: "a SYN scan (-sS) crafts raw packets",
  sU: "a UDP scan (-sU) crafts raw packets",
  sA: "an ACK scan (-sA) crafts raw packets",
  sN: "a null scan (-sN) crafts raw packets",
  sF: "a FIN scan (-sF) crafts raw packets",
  sX: "an Xmas scan (-sX) crafts raw packets",
};

function cleanToken(raw: string, pattern: RegExp): string | null {
  const value = raw.trim();
  if (value === "") return null;
  return pattern.test(value) ? value : null;
}

function cleanTarget(raw: string): string {
  const value = raw.trim();
  if (value === "") return "TARGET";
  // Accept hostnames, IPv4, CIDR, simple ranges and space separated lists.
  return /^[A-Za-z0-9 .:/_*-]+$/.test(value) ? value : "TARGET";
}

export interface NmapFlag {
  flag: string;
  explanation: string;
}

export function buildNmapParts(o: NmapOptions): { parts: string[]; flags: NmapFlag[] } {
  const parts: string[] = ["nmap"];
  const flags: NmapFlag[] = [];
  const add = (flag: string, explanation: string) => {
    parts.push(flag);
    flags.push({ flag, explanation });
  };

  add(`-${o.scanType}`, SCAN_LABEL[o.scanType]);

  // Host discovery control.
  if (o.noPing) {
    add("-Pn", "Skip host discovery and scan every target as if it were up. Useful when hosts block pings.");
  }
  for (const probe of o.pingTypes) {
    if (probe === "PS") add("-PS", "TCP SYN ping to find live hosts.");
    else if (probe === "PA") add("-PA", "TCP ACK ping to find live hosts.");
    else if (probe === "PE") add("-PE", "ICMP echo ping to find live hosts.");
  }

  if (!o.resolveDns) add("-n", "Never do reverse DNS, which makes large scans faster.");

  // Ports only make sense when a port scan runs.
  if (o.scanType !== "sn") {
    if (o.portMode === "fast") {
      add("-F", "Fast mode: scan the 100 most common ports instead of 1000.");
    } else if (o.portMode === "all") {
      add("-p-", "Scan all 65535 TCP ports.");
    } else if (o.portMode === "top") {
      const n = cleanToken(o.topPorts, /^[0-9]+$/);
      if (n) add(`--top-ports ${n}`, "Scan the most common ports by frequency.");
    } else if (o.portMode === "list") {
      const list = cleanToken(o.portList, /^[0-9,\s-]+(?:[TUS]:[0-9,\s-]+)*$/) ?? cleanToken(o.portList, /^[0-9,\s-]+$/);
      if (list) add(`-p ${list.replace(/\s+/g, "")}`, "Scan exactly these ports or ranges.");
    }
  }

  if (o.serviceVersion) {
    add("-sV", "Probe open ports to name the service and its version.");
    const intensity = cleanToken(o.versionIntensity, /^[0-9]$/);
    if (intensity) {
      add(
        `--version-intensity ${intensity}`,
        "How hard version detection tries, from 0 (light) to 9 (every probe).",
      );
    }
  }

  if (o.osDetection) add("-O", "Guess the operating system from TCP/IP stack fingerprints.");
  if (o.defaultScripts) add("-sC", "Run the default safe NSE script set, the same as --script=default.");

  const scripts = cleanToken(o.scripts, /^[A-Za-z0-9,._*-]+$/);
  if (scripts) add(`--script ${scripts}`, "Run these named NSE scripts or categories.");

  const timing = cleanToken(o.timing, /^[0-5]$/);
  if (timing && timing !== "3") {
    add(`-T${timing}`, "Timing template: higher is faster and louder, lower is slower and stealthier.");
  }

  const minRate = cleanToken(o.minRate, /^[0-9]+$/);
  if (minRate) add(`--min-rate ${minRate}`, "Send at least this many packets per second.");
  const maxRate = cleanToken(o.maxRate, /^[0-9]+$/);
  if (maxRate) add(`--max-rate ${maxRate}`, "Send no more than this many packets per second.");

  if (o.outputMode !== "none") {
    const name = cleanToken(o.outputFile, /^[A-Za-z0-9._-]+$/) ?? "scan";
    const flagByMode: Record<Exclude<NmapOutputMode, "none">, [string, string]> = {
      normal: ["-oN", "Write human readable output to a file."],
      xml: ["-oX", "Write XML output for other tools to parse."],
      grep: ["-oG", "Write greppable output, one host per line."],
      all: ["-oA", "Write normal, XML and greppable output at once, using this base name."],
    };
    const [flag, explanation] = flagByMode[o.outputMode];
    parts.push(flag, name);
    flags.push({ flag: `${flag} ${name}`, explanation });
  }

  parts.push(cleanTarget(o.target));
  return { parts, flags };
}

export function buildNmapCommand(o: NmapOptions): string {
  return buildNmapParts(o).parts.join(" ");
}

/**
 * Reasons this command needs root (or an equivalent raw-socket capability).
 * An empty list means it runs as an ordinary user. Nmap falls back to -sT
 * for an unprivileged user, so these are the options that force privilege.
 */
export function nmapRootReasons(o: NmapOptions): string[] {
  const reasons: string[] = [];
  const rawScan = RAW_SCANS[o.scanType];
  if (rawScan) reasons.push(rawScan);
  if (o.osDetection) reasons.push("OS detection (-O) sends raw probes");
  if (o.pingTypes.includes("PS") || o.pingTypes.includes("PA")) {
    // As an unprivileged user these fall back to a full connect, so only the
    // raw form needs root; -PE (ICMP) always needs raw sockets.
  }
  if (o.pingTypes.includes("PE")) reasons.push("ICMP echo ping (-PE) needs raw sockets");
  return reasons;
}

/** A plain-language, ordered description of what the command will do. */
export function describeNmapCommand(o: NmapOptions): string[] {
  const out: string[] = [];
  const target = cleanTarget(o.target);

  if (o.scanType === "sn") {
    out.push(`Discover which hosts are up on ${target} without scanning any ports.`);
  } else {
    out.push(`Scan ${target} using a ${SCAN_LABEL[o.scanType].split(".")[0].toLowerCase()}.`);
  }

  if (o.noPing) out.push("Treat every host as online and skip the usual ping step.");
  if (o.pingTypes.length > 0) {
    out.push(`Find live hosts with ${o.pingTypes.map((p) => `-${p}`).join(", ")} discovery probes.`);
  }
  if (!o.resolveDns) out.push("Skip reverse DNS lookups.");

  if (o.scanType !== "sn") {
    if (o.portMode === "fast") out.push("Check the 100 most common ports.");
    else if (o.portMode === "all") out.push("Check all 65535 TCP ports, which takes much longer.");
    else if (o.portMode === "top") {
      const n = cleanToken(o.topPorts, /^[0-9]+$/) ?? "100";
      out.push(`Check the ${n} most common ports.`);
    } else if (o.portMode === "list") {
      const list = o.portList.trim();
      out.push(list === "" ? "Check the default 1000 ports." : `Check ports ${list.replace(/\s+/g, "")}.`);
    } else {
      out.push("Check the default 1000 most common ports.");
    }
  }

  if (o.serviceVersion) out.push("Identify the service and version listening on each open port.");
  if (o.osDetection) out.push("Fingerprint the remote operating system.");
  if (o.defaultScripts) out.push("Run the default set of NSE scripts against open ports.");
  const scripts = cleanToken(o.scripts, /^[A-Za-z0-9,._*-]+$/);
  if (scripts) out.push(`Run the NSE scripts: ${scripts}.`);

  const timing = cleanToken(o.timing, /^[0-5]$/) ?? "3";
  if (timing !== "3") {
    out.push(
      Number(timing) > 3
        ? `Run fast and loud at timing -T${timing}.`
        : `Run slow and quiet at timing -T${timing}.`,
    );
  }

  const reasons = nmapRootReasons(o);
  if (reasons.length > 0) out.push(`Needs root because ${reasons.join(" and ")}.`);

  if (o.outputMode !== "none") {
    const name = cleanToken(o.outputFile, /^[A-Za-z0-9._-]+$/) ?? "scan";
    out.push(`Save results to ${name}.`);
  }

  return out;
}
