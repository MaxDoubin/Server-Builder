/**
 * ~/.ssh/config builder.
 *
 * Pure logic for turning a set of Host blocks into a config file, producing
 * the equivalent one-off ssh command for each, and flagging the choices that
 * surprise people. The rules follow ssh_config(5): a keyword is applied from
 * the first Host block whose pattern matches, so the first value for a given
 * keyword wins and a broad pattern placed early shadows the specific blocks
 * below it. Nothing here touches React or the DOM, so it unit tests cleanly.
 */

export type Tone = "ok" | "info" | "warn" | "danger";

export type ForwardKind = "local" | "remote" | "dynamic";

export interface Forward {
  kind: ForwardKind;
  /** Optional bind address on the listening side. Empty means the default. */
  bindAddress: string;
  /** Port opened on the listening side. */
  listenPort: string;
  /** Destination host, for local and remote forwards only. */
  destHost: string;
  /** Destination port, for local and remote forwards only. */
  destPort: string;
}

export type ControlMaster = "" | "no" | "yes" | "ask" | "auto" | "autoask";
export type StrictHostKey = "" | "yes" | "accept-new" | "no" | "off" | "ask";

export interface HostBlock {
  /** Stable id for React list keys. Not part of the output. */
  id: string;
  /** One or more patterns, space separated, as they follow the Host keyword. */
  host: string;
  hostName: string;
  user: string;
  port: string;
  identityFile: string;
  identitiesOnly: boolean;
  /** A comma separated jump chain, for example bastion1,bastion2. */
  proxyJump: string;
  forwardAgent: boolean;
  forwards: Forward[];
  serverAliveInterval: string;
  controlMaster: ControlMaster;
  controlPath: string;
  controlPersist: string;
  strictHostKeyChecking: StrictHostKey;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface Warning {
  tone: Tone;
  title: string;
  detail: string;
}

export const MAX_BLOCKS = 24;
export const MAX_FORWARDS = 12;

let counter = 0;
/** A non cryptographic id for list keys. Order of creation only. */
export function nextId(): string {
  counter += 1;
  return `h${counter}`;
}

export function emptyForward(kind: ForwardKind = "local"): Forward {
  return { kind, bindAddress: "", listenPort: "", destHost: "", destPort: "" };
}

export function emptyBlock(): HostBlock {
  return {
    id: nextId(),
    host: "",
    hostName: "",
    user: "",
    port: "",
    identityFile: "",
    identitiesOnly: false,
    proxyJump: "",
    forwardAgent: false,
    forwards: [],
    serverAliveInterval: "",
    controlMaster: "",
    controlPath: "",
    controlPersist: "",
    strictHostKeyChecking: "",
  };
}

/** A TCP port is an integer from 1 to 65535. Port 0 is not a usable endpoint. */
export function parsePort(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (n < 1 || n > 65535) return null;
  return n;
}

/** OpenSSH reads a time with convtime(), which rejects anything above INT_MAX seconds (misc.c). */
const SSH_MAX_SECONDS = 2147483647;

/** A non negative integer count of seconds, no larger than OpenSSH accepts. */
function parseSeconds(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n <= SSH_MAX_SECONDS ? n : null;
}

/** ControlPersist is yes, no, or a time in seconds with an optional s, m or h, inside the same limit. */
function validControlPersist(raw: string): boolean {
  const s = raw.trim();
  if (/^(yes|no)$/i.test(s)) return true;
  const match = /^(\d+)([smh])?$/i.exec(s);
  if (!match) return false;
  const unit = (match[2] ?? "s").toLowerCase();
  const total = Number(match[1]) * (unit === "h" ? 3600 : unit === "m" ? 60 : 1);
  return Number.isSafeInteger(total) && total <= SSH_MAX_SECONDS;
}

/** A line break or other control character ends the config line, so what follows would read as a new keyword. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * A value as ssh_config reads it. OpenSSH splits a line into tokens at spaces
 * (argv_split in misc.c), so a path with a space is several arguments and the
 * whole file is refused ("extra arguments at end of line"). Inside double
 * quotes a space is ordinary, and a backslash or a quote needs a backslash in
 * front of it. A value with whitespace, a quote, a backslash or a hash is
 * therefore written in double quotes; null means the value cannot be written
 * on one line at all.
 */
function configValue(raw: string): string | null {
  const value = raw.trim();
  if (value === "" || CONTROL_CHARS.test(value)) return null;
  return /[\s"'\\#]/.test(value) ? `"${value.replace(/["\\]/g, "\\$&")}"` : value;
}

/** Quote a value for an ssh -o option or a shell argument when it has spaces. */
function shellQuote(value: string): string {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/*
  What may go into the copyable one-off command. It is pasted into a terminal,
  so a field is kept only when it could be what it says it is. Quoting alone
  would not be enough for the destination: ssh reads an argument that starts
  with a hyphen as an option, so "-oProxyCommand=..." in HostName would still
  run, and a name or login that really starts with a hyphen does not exist.
*/
/** A host name or address: letters, digits and . : _ % -, not starting with a hyphen. */
const NAME_OK = /^[A-Za-z0-9_][A-Za-z0-9._:%-]*$/;
/** A login name. */
const USER_OK = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
/** A forward's host: a name, an IPv4 address, or an IPv6 address in brackets. */
const FORWARD_HOST_OK = /^(?:[A-Za-z0-9_][A-Za-z0-9._-]*|\[[0-9A-Fa-f:.]+\])$/;
/** A forward's bind address: as a forward host, or * for every interface. */
const BIND_OK = /^(?:[A-Za-z0-9_][A-Za-z0-9._-]*|\*|\[[0-9A-Fa-f:.]+\])$/;

/** The listen side of a forward, as bind:port or just port. */
function forwardListen(f: Forward): string {
  const port = f.listenPort.trim();
  const bind = f.bindAddress.trim();
  return bind ? `${bind}:${port}` : port;
}

export function validateBlock(block: HostBlock): FieldError[] {
  const errors: FieldError[] = [];
  if (block.host.trim() === "") {
    errors.push({ field: "host", message: "A Host block needs at least one pattern, such as a short alias." });
  }
  if (block.host.trim() !== "" && CONTROL_CHARS.test(block.host)) {
    errors.push({ field: "host", message: "A Host pattern is one line: it cannot contain line breaks or control characters." });
  }
  for (const [field, label, value] of [
    ["proxyJump", "ProxyJump", block.proxyJump],
    ["identityFile", "IdentityFile", block.identityFile],
    ["controlPath", "ControlPath", block.controlPath],
  ] as const) {
    if (CONTROL_CHARS.test(value)) {
      errors.push({ field, message: `${label} is one line: it cannot contain line breaks or control characters.` });
    }
  }
  if (block.port.trim() !== "" && parsePort(block.port) === null) {
    errors.push({ field: "port", message: "Port must be a whole number from 1 to 65535." });
  }
  if (block.hostName.trim() !== "" && !NAME_OK.test(block.hostName.trim())) {
    errors.push({
      field: "hostName",
      message: "HostName is a host name or an address: letters, digits and . : _ % -, and it cannot start with a hyphen.",
    });
  }
  if (block.user.trim() !== "" && !USER_OK.test(block.user.trim())) {
    errors.push({
      field: "user",
      message: "User is a login name: letters, digits and . _ -, and it cannot start with a hyphen.",
    });
  }
  if (block.serverAliveInterval.trim() !== "" && parseSeconds(block.serverAliveInterval) === null) {
    errors.push({
      field: "serverAliveInterval",
      message: "ServerAliveInterval is a count of seconds, so a whole number from 0 to 2147483647.",
    });
  }
  if (block.controlPersist.trim() !== "" && !validControlPersist(block.controlPersist)) {
    errors.push({
      field: "controlPersist",
      message: "ControlPersist is yes, no, or a time such as 600 or 10m, up to 2147483647 seconds.",
    });
  }
  block.forwards.forEach((f, i) => {
    if (parsePort(f.listenPort) === null) {
      errors.push({ field: `forward-${i}-listen`, message: "The listening port must be 1 to 65535." });
    }
    if (f.bindAddress.trim() !== "" && !BIND_OK.test(f.bindAddress.trim())) {
      errors.push({
        field: `forward-${i}-bind`,
        message: "The bind address is a name, an address, or * for every interface.",
      });
    }
    if (f.kind !== "dynamic") {
      if (f.destHost.trim() === "") {
        errors.push({ field: `forward-${i}-host`, message: "This forward needs a destination host." });
      } else if (!FORWARD_HOST_OK.test(f.destHost.trim())) {
        errors.push({
          field: `forward-${i}-host`,
          message: "The destination host is a name or an address, with an IPv6 address in brackets.",
        });
      }
      if (parsePort(f.destPort) === null) {
        errors.push({ field: `forward-${i}-destport`, message: "The destination port must be 1 to 65535." });
      }
    }
  });
  return errors;
}

/** The config text for one Host block. Only keywords with a value are emitted. */
export function renderBlock(block: HostBlock): string {
  const typedHost = block.host.trim();
  const host = typedHost === "" || CONTROL_CHARS.test(typedHost) ? "unnamed" : typedHost;
  const lines: string[] = [`Host ${host}`];
  const add = (keyword: string, value: string) => {
    const v = configValue(value);
    if (v !== null) lines.push(`    ${keyword} ${v}`);
  };

  add("HostName", block.hostName);
  add("User", block.user);
  add("Port", block.port);
  add("IdentityFile", block.identityFile);
  if (block.identitiesOnly) lines.push("    IdentitiesOnly yes");
  add("ProxyJump", block.proxyJump);
  if (block.forwardAgent) lines.push("    ForwardAgent yes");

  for (const f of block.forwards) {
    if (f.kind === "dynamic") {
      if (f.listenPort.trim() !== "") lines.push(`    DynamicForward ${forwardListen(f)}`);
    } else {
      const keyword = f.kind === "local" ? "LocalForward" : "RemoteForward";
      if (f.listenPort.trim() !== "" && f.destHost.trim() !== "" && f.destPort.trim() !== "") {
        lines.push(`    ${keyword} ${forwardListen(f)} ${f.destHost.trim()}:${f.destPort.trim()}`);
      }
    }
  }

  add("ServerAliveInterval", block.serverAliveInterval);
  if (block.controlMaster) lines.push(`    ControlMaster ${block.controlMaster}`);
  add("ControlPath", block.controlPath);
  if (block.controlPersist.trim() !== "") lines.push(`    ControlPersist ${block.controlPersist.trim()}`);
  if (block.strictHostKeyChecking) lines.push(`    StrictHostKeyChecking ${block.strictHostKeyChecking}`);

  return lines.join("\n");
}

export function renderConfig(blocks: HostBlock[]): string {
  return blocks.map(renderBlock).join("\n\n");
}

/** Does a pattern contain a wildcard, so it cannot be used as a literal target. */
function isWildcard(pattern: string): boolean {
  return /[*?!]/.test(pattern);
}

/**
 * The one-off ssh command that reproduces this block without the config file.
 * HostName is the destination; a pattern with a wildcard has no literal target,
 * so a placeholder is shown and the reader is expected to substitute a name.
 */
export function sshCommand(block: HostBlock): string {
  const args: string[] = [];
  const first = block.host.trim().split(/\s+/)[0] || "host";
  const target = block.hostName.trim() || (isWildcard(first) ? "HOST" : first);

  if (block.port.trim() !== "" && parsePort(block.port) !== null) {
    args.push("-p", block.port.trim());
  }
  if (block.identityFile.trim() !== "" && !CONTROL_CHARS.test(block.identityFile)) {
    args.push("-i", shellQuote(block.identityFile.trim()));
  }
  if (block.identitiesOnly) args.push("-o", "IdentitiesOnly=yes");
  if (block.proxyJump.trim() !== "" && !CONTROL_CHARS.test(block.proxyJump)) args.push("-J", shellQuote(block.proxyJump.trim()));
  if (block.forwardAgent) args.push("-A");

  for (const f of block.forwards) {
    if (f.kind === "dynamic") {
      if (f.listenPort.trim() !== "") args.push("-D", shellQuote(forwardListen(f)));
    } else {
      const flag = f.kind === "local" ? "-L" : "-R";
      if (f.listenPort.trim() !== "" && f.destHost.trim() !== "" && f.destPort.trim() !== "") {
        args.push(flag, shellQuote(`${forwardListen(f)}:${f.destHost.trim()}:${f.destPort.trim()}`));
      }
    }
  }

  if (block.serverAliveInterval.trim() !== "" && parseSeconds(block.serverAliveInterval) !== null) {
    args.push("-o", `ServerAliveInterval=${block.serverAliveInterval.trim()}`);
  }
  if (block.controlMaster) args.push("-o", shellQuote(`ControlMaster=${block.controlMaster}`));
  // ssh reads a -o value with the same tokenizer as the config file, so the value is
  // quoted for ssh first and the whole option is then quoted for the shell.
  const controlPath = configValue(block.controlPath);
  if (controlPath !== null) args.push("-o", shellQuote(`ControlPath=${controlPath}`));
  if (block.controlPersist.trim() !== "" && validControlPersist(block.controlPersist)) {
    args.push("-o", shellQuote(`ControlPersist=${block.controlPersist.trim()}`));
  }
  if (block.strictHostKeyChecking) {
    args.push("-o", shellQuote(`StrictHostKeyChecking=${block.strictHostKeyChecking}`));
  }

  /* A destination that could not be a name, or a login that could not be one, is shown as a placeholder. */
  const safeTarget = NAME_OK.test(target) ? target : "HOST";
  const login = block.user.trim();
  const safeLogin = login === "" ? "" : USER_OK.test(login) ? login : "USER";
  const dest = safeLogin !== "" ? `${safeLogin}@${safeTarget}` : safeTarget;
  return ["ssh", ...args, dest].join(" ");
}

/** Observations about the set as a whole, including precedence and risk. */
export function configWarnings(blocks: HostBlock[]): Warning[] {
  const out: Warning[] = [];

  blocks.forEach((block, i) => {
    const patterns = block.host.trim().split(/\s+/).filter(Boolean);
    const isCatchAll = patterns.some((p) => p === "*");
    if (isCatchAll && i !== blocks.length - 1) {
      out.push({
        tone: "warn",
        title: `Host * is not last (block ${i + 1})`,
        detail:
          "A keyword takes its value from the first matching block, so defaults under Host * win for every keyword a later block has not already set. Put specific hosts above Host * so their values are read first.",
      });
    }
    if (block.forwardAgent) {
      out.push({
        tone: "warn",
        title: `ForwardAgent is on for ${patterns[0] ?? "a host"}`,
        detail:
          "Agent forwarding lets anyone with root on that host use the socket to authenticate as you to anything your keys reach. Enable it only for hosts you fully trust, and prefer ProxyJump, which never exposes the agent to the middle host.",
      });
    }
    if (block.strictHostKeyChecking === "no" || block.strictHostKeyChecking === "off") {
      out.push({
        tone: "danger",
        title: `StrictHostKeyChecking is off for ${patterns[0] ?? "a host"}`,
        detail:
          "Turning host key checking off accepts any key the server presents, which is exactly what a machine in the middle needs. Use accept-new to trust a key on first sight while still refusing a changed one.",
      });
    }
  });

  return out;
}

/** A starting set that shows a bastion jump and a shared default. */
export function exampleBlocks(): HostBlock[] {
  const app: HostBlock = {
    ...emptyBlock(),
    host: "app",
    hostName: "10.0.4.12",
    user: "deploy",
    port: "22",
    identityFile: "~/.ssh/id_ed25519",
    identitiesOnly: true,
    proxyJump: "bastion",
    forwards: [{ kind: "local", bindAddress: "", listenPort: "5432", destHost: "db.internal", destPort: "5432" }],
    serverAliveInterval: "60",
  };
  const bastion: HostBlock = {
    ...emptyBlock(),
    host: "bastion",
    hostName: "bastion.example.com",
    user: "jump",
    identityFile: "~/.ssh/id_ed25519",
    identitiesOnly: true,
  };
  const star: HostBlock = {
    ...emptyBlock(),
    host: "*",
    serverAliveInterval: "30",
    controlMaster: "auto",
    controlPath: "~/.ssh/cm-%r@%h:%p",
    controlPersist: "10m",
  };
  return [app, bastion, star];
}
