/**
 * Dockerfile linter.
 *
 * Parsing follows the Dockerfile reference and the BuildKit frontend:
 * parser directives only at the very top, `#` comment lines (which may sit
 * inside a continued instruction and vanish), a trailing escape character
 * plus optional blanks continues a line, blank lines inside a continuation
 * are skipped, and `RUN`, `COPY` and `ADD` may carry here-documents whose
 * body runs to a line that is exactly the delimiter.
 *
 * `RUN` bodies are then split into simple commands with a small POSIX shell
 * lexer (quotes, escapes, operators, `$(...)` kept whole) so the rules look
 * at real commands and not at substrings: `apt-get` options are read as
 * options, a `sudo` inside a quoted string is not a call to sudo, and a pipe
 * from `curl` into a shell is found by looking at the pipeline.
 *
 * Nothing here runs or fetches anything. Pure functions only, no React and
 * no DOM, so all of it can be unit tested.
 */

/** Longest input accepted, in UTF-16 code units. */
export const MAX_INPUT = 100000;

/** Most physical lines accepted. */
export const MAX_LINES = 5000;

export type Severity = "error" | "warning" | "info";

export interface RuleInfo {
  id: string;
  severity: Severity;
  title: string;
  why: string;
  fix: string;
}

function rule(id: string, severity: Severity, title: string, why: string, fix: string): [string, RuleInfo] {
  return [id, { id, severity, title, why, fix }];
}

const RULE_LIST: [string, RuleInfo][] = [
  rule(
    "from-untagged",
    "warning",
    "FROM without a tag",
    "With no tag Docker pulls latest, a name that moves. The same Dockerfile builds a different image next month, so a build that worked can break, or pick up new vulnerabilities, with no change to this file.",
    "Pin a version tag such as python:3.12-slim. For fully reproducible builds also pin the digest with @sha256:.",
  ),
  rule(
    "from-latest",
    "warning",
    "FROM with the latest tag",
    "The latest tag is only a name and it moves whenever the publisher pushes. The same Dockerfile builds a different image next month, so a build that worked can break, or pick up new vulnerabilities, with no change to this file.",
    "Pin a version tag such as python:3.12-slim. For fully reproducible builds also pin the digest with @sha256:.",
  ),
  rule(
    "apt-no-yes",
    "error",
    "apt-get without -y",
    "A build has no terminal to answer the Do you want to continue prompt, so apt reads end of input, treats it as no, and the step fails with Abort.",
    "Add -y (or --yes). Setting DEBIAN_FRONTEND=noninteractive stops package configuration questions, but it does not answer this prompt.",
  ),
  rule(
    "apt-no-recommends",
    "info",
    "apt-get install without --no-install-recommends",
    "By default apt installs the Recommends of every package as well, which adds packages nobody asked for and makes the image larger and its attack surface wider.",
    "Add --no-install-recommends and list anything you do need.",
  ),
  rule(
    "apt-lists-not-removed",
    "warning",
    "apt package lists left in the layer",
    "apt-get update writes the package index to /var/lib/apt/lists. Every RUN becomes a layer, and a file deleted by a later layer is still stored in the earlier one, so cleaning up in a different RUN does not shrink the image.",
    "End the same RUN with && rm -rf /var/lib/apt/lists/*.",
  ),
  rule(
    "apt-update-alone",
    "warning",
    "apt-get update in its own RUN",
    "Docker caches a RUN layer by its instruction text. A RUN apt-get update on its own is reused from cache on later builds, so a following RUN apt-get install works from an old index and can fail with 404 errors. The index also stays in its own layer.",
    "Run update and install in the same RUN, joined with &&.",
  ),
  rule(
    "apt-upgrade",
    "warning",
    "apt-get upgrade in a build",
    "Upgrading everything makes the image depend on the day it was built and on which mirror answered, so builds stop being reproducible, and it brings in changes nobody reviewed.",
    "Move to a newer base image tag when you want updates, and install only the packages you need.",
  ),
  rule(
    "apt-cli",
    "info",
    "apt used in a script",
    "The apt command is meant for interactive use. It prints WARNING: apt does not have a stable CLI interface when its output is not a terminal, and its output and behavior can change between releases.",
    "Use apt-get in Dockerfiles and scripts.",
  ),
  rule(
    "yum-no-yes",
    "error",
    "yum or dnf without -y",
    "yum and dnf ask for confirmation before changing packages. A build has no terminal to answer, so the step fails.",
    "Add -y (or --assumeyes).",
  ),
  rule(
    "apk-no-cache",
    "info",
    "apk add without --no-cache",
    "Without --no-cache, apk keeps the package index cache under /var/cache/apk, and it stays in the layer.",
    "Use apk add --no-cache, which also removes the need for a separate apk update.",
  ),
  rule(
    "add-for-copy",
    "warning",
    "ADD where COPY will do",
    "ADD also downloads URLs and unpacks local tar archives. When the goal is only to copy files, that extra behavior is a trap: an archive is unpacked when you meant to copy it, and a path that turns into a URL is fetched.",
    "Use COPY. Keep ADD for the case where you want a local tar archive extracted.",
  ),
  rule(
    "add-remote-url",
    "warning",
    "ADD from a remote URL",
    "ADD downloads at build time and checks nothing about the content. The file at that URL can change or be replaced between builds, and the build still succeeds.",
    "Download with curl or wget in a RUN and verify a pinned checksum, for example with sha256sum -c, or give ADD a --checksum=sha256:... flag.",
  ),
  rule(
    "no-user",
    "warning",
    "No USER, so the container runs as root",
    "Without a USER instruction the processes run as root (UID 0) unless the base image already sets another user. A bug in the application then hands an attacker root inside the container, which gives write access to everything it can reach and makes escaping to the host easier.",
    "Create an unprivileged user and switch to it near the end, for example RUN useradd --system app followed by USER app. Alpine uses addgroup and adduser instead.",
  ),
  rule(
    "user-root",
    "warning",
    "The last USER is root",
    "The final USER in the last stage is root, so the container runs as root. A bug in the application then hands an attacker root inside the container.",
    "Finish the stage with USER set to an unprivileged account.",
  ),
  rule(
    "secret-name",
    "warning",
    "A secret in ENV or ARG",
    "An ENV value is stored in the image configuration, shown by docker inspect and inherited by every container. An ARG value that a RUN uses appears in docker history. Anyone who can pull the image can read either one.",
    "Supply secrets when the container starts, from the orchestrator or a mounted file, or use a BuildKit secret mount during the build: RUN --mount=type=secret,id=name.",
  ),
  rule(
    "url-credentials",
    "error",
    "Credentials inside a URL",
    "A URL with a user name and password writes the credential into the instruction, and from there into the image history and the layer cache. Deleting it in a later step does not remove it.",
    "Use RUN --mount=type=secret with a token or netrc file, or --mount=type=ssh for Git over SSH.",
  ),
  rule(
    "copy-secret-file",
    "warning",
    "A likely secret file copied into the image",
    "A file copied into an image stays in that layer even if a later RUN deletes it, and anyone with the image can extract it.",
    "Exclude it from the build context with .dockerignore and supply it at run time or through a BuildKit secret mount.",
  ),
  rule(
    "pipe-to-shell",
    "warning",
    "Download piped into a shell",
    "Piping a download into a shell runs whatever the server sends at that moment, with no check of what it is. If the site is compromised, or the URL starts to serve something else, the image changes with no change to the Dockerfile. A shell also starts running a script before the whole of it has arrived, so a dropped connection can leave a half-run script.",
    "Download to a file, verify a pinned checksum or signature, then run it.",
  ),
  rule(
    "tls-verify-off",
    "warning",
    "Certificate verification turned off",
    "With verification off, the download or clone can be answered by anyone on the network path, and nothing detects it.",
    "Fix the trust problem instead, for example by installing the missing CA certificate, and leave verification on.",
  ),
  rule(
    "multiple-cmd",
    "warning",
    "More than one CMD in a stage",
    "Only the last CMD in a stage takes effect. The earlier ones do nothing and mislead anyone reading the file.",
    "Keep one CMD per stage.",
  ),
  rule(
    "multiple-entrypoint",
    "warning",
    "More than one ENTRYPOINT in a stage",
    "Only the last ENTRYPOINT in a stage takes effect. The earlier ones do nothing and mislead anyone reading the file.",
    "Keep one ENTRYPOINT per stage.",
  ),
  rule(
    "multiple-healthcheck",
    "warning",
    "More than one HEALTHCHECK in a stage",
    "Only the last HEALTHCHECK in a stage takes effect. The earlier ones do nothing and mislead anyone reading the file.",
    "Keep one HEALTHCHECK per stage.",
  ),
  rule(
    "shell-form",
    "warning",
    "CMD or ENTRYPOINT in shell form",
    "Shell form runs the command as /bin/sh -c, so the shell is PID 1 and the program is its child. The program may never see the SIGTERM that docker stop sends, and Docker kills it after the timeout instead. A shell form ENTRYPOINT also prevents CMD and the arguments given to docker run from being used.",
    'Use exec form, a JSON array such as CMD ["python", "app.py"]. If shell features are needed, start the command with exec so the program replaces the shell.',
  ),
  rule(
    "json-form-invalid",
    "warning",
    "Exec form that is not valid JSON",
    "This looks like exec form but is not valid JSON, usually because of single quotes or a trailing comma. Docker silently falls back to shell form and runs the whole text through /bin/sh -c.",
    "Use double quotes and valid JSON, for example CMD [\"node\", \"server.js\"].",
  ),
  rule(
    "shell-needs-json",
    "error",
    "SHELL without a JSON array",
    "The SHELL instruction accepts only exec form, a JSON array. Docker rejects anything else.",
    'Write it as SHELL ["/bin/bash", "-o", "pipefail", "-c"].',
  ),
  rule(
    "no-healthcheck",
    "info",
    "No HEALTHCHECK",
    "Without a HEALTHCHECK, Docker only knows whether the process is running, not whether it works. Anything that waits for health, such as Compose depends_on with condition service_healthy, has nothing to check. Kubernetes ignores HEALTHCHECK and uses its own probes. The base image may define one already.",
    "Add HEALTHCHECK CMD with a command that exits 0 when the service answers. A one-shot job can ignore this.",
  ),
  rule(
    "workdir-relative",
    "warning",
    "WORKDIR with a relative path",
    "A relative WORKDIR is resolved against the previous WORKDIR. When this stage has not set an absolute one, it resolves against whatever the base image chose, which can change when the base image does.",
    "Use an absolute path such as /app.",
  ),
  rule(
    "sudo",
    "warning",
    "sudo in a build step",
    "Build steps already run as root unless a USER instruction changed that, so sudo is not needed. Where USER is not root, sudo has to be installed and given a sudoers rule, which puts a setuid binary and a way back to root into the final image.",
    "Remove sudo. If a step needs root, run it before the USER instruction.",
  ),
  rule(
    "chmod-777",
    "warning",
    "Mode 777",
    "Mode 777 lets every user on the system, including a compromised unprivileged process, modify or replace the file. It usually hides an ownership problem.",
    "Set the owner with chown or COPY --chown, and use the narrowest mode that works: 755 for programs and directories, 644 for data files.",
  ),
  rule(
    "maintainer-deprecated",
    "info",
    "MAINTAINER is deprecated",
    "MAINTAINER was replaced by LABEL, which can hold any metadata and is what image tools read.",
    'Use LABEL org.opencontainers.image.authors="name <address>".',
  ),
  rule(
    "unknown-instruction",
    "error",
    "Unknown instruction",
    "This line does not start with an instruction Docker knows. A build stops here with an error. The usual causes are a typo, a continuation backslash that went missing, or text pasted in the wrong place.",
    "Fix the spelling, or join the line to the instruction above with a trailing backslash.",
  ),
  rule(
    "no-from",
    "error",
    "No FROM before the first instruction",
    "Every Dockerfile must start from a base image. Only ARG may come before the first FROM.",
    "Add a FROM line at the top.",
  ),
  rule(
    "from-malformed",
    "error",
    "FROM is missing an image",
    "FROM needs an image name, optionally followed by AS and a stage name.",
    "Write FROM image:tag or FROM image:tag AS name.",
  ),
  rule(
    "missing-arguments",
    "error",
    "Instruction without arguments",
    "Every instruction needs at least one argument, and Docker rejects the file otherwise.",
    "Add the arguments, or remove the line.",
  ),
  rule(
    "heredoc-unterminated",
    "error",
    "Here-document is never closed",
    "A here-document body runs to a line that holds exactly the delimiter. Without one, the rest of the file is swallowed into the body.",
    "Add a line with only the delimiter after the body.",
  ),
];

export const RULES = new Map<string, RuleInfo>(RULE_LIST);

export interface Finding {
  rule: string;
  severity: Severity;
  line: number;
  message: string;
  why: string;
  fix: string;
  instruction: string;
  snippet: string;
}

export interface InstructionInfo {
  line: number;
  endLine: number;
  keyword: string;
  args: string;
  stage: number;
  heredocs: number;
  onbuild: boolean;
}

export interface StageInfo {
  index: number;
  line: number;
  image: string;
  name: string | null;
  instructions: number;
}

export type LintResult =
  | {
      ok: true;
      findings: Finding[];
      instructions: InstructionInfo[];
      stages: StageInfo[];
      counts: Record<Severity, number>;
      directives: { key: string; value: string }[];
    }
  | { ok: false; error: string };

/* ================================================================= parse */

export interface Heredoc {
  delimiter: string;
  stripTabs: boolean;
  quoted: boolean;
  body: string;
  /** Physical line of the first body line. */
  line: number;
  terminated: boolean;
}

export interface Instruction {
  keyword: string;
  typed: string;
  args: string;
  line: number;
  endLine: number;
  /** Offsets into `args`, each with the physical line that starts there. */
  lineStarts: { offset: number; line: number }[];
  heredocs: Heredoc[];
  onbuild: boolean;
}

export interface ParseResult {
  instructions: Instruction[];
  directives: { key: string; value: string }[];
  lines: string[];
}

const KEYWORDS = new Set([
  "FROM",
  "RUN",
  "CMD",
  "LABEL",
  "MAINTAINER",
  "EXPOSE",
  "ENV",
  "ADD",
  "COPY",
  "ENTRYPOINT",
  "VOLUME",
  "USER",
  "WORKDIR",
  "ARG",
  "ONBUILD",
  "STOPSIGNAL",
  "HEALTHCHECK",
  "SHELL",
]);

/** Words as a Dockerfile-style lexer sees them: split on blanks, quotes kept. */
function rawWords(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && quote === '"' && i + 1 < s.length) cur += s[++i];
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "\\" && i + 1 < s.length) {
      cur += ch + s[++i];
    } else if (ch === " " || ch === "\t" || ch === "\n") {
      if (cur !== "") out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur !== "") out.push(cur);
  return out;
}

/** Words with quotes and escapes removed, as ENV, ARG and FROM read them. */
function splitWords(s: string): string[] {
  const out: string[] = [];
  let cur: string | null = null;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      if (cur !== null) out.push(cur);
      cur = null;
      i++;
    } else if (ch === "'") {
      const k = s.indexOf("'", i + 1);
      cur = (cur ?? "") + s.slice(i + 1, k < 0 ? s.length : k);
      i = k < 0 ? s.length : k + 1;
    } else if (ch === '"') {
      cur = cur ?? "";
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length && /["\\$`]/.test(s[i + 1])) i++;
        cur += s[i++];
      }
      i++;
    } else if (ch === "\\" && i + 1 < s.length) {
      cur = (cur ?? "") + s[i + 1];
      i += 2;
    } else {
      cur = (cur ?? "") + ch;
      i++;
    }
  }
  if (cur !== null) out.push(cur);
  return out;
}

function unquote(s: string): { text: string; quoted: boolean } {
  const m = /^(["'])(.*)\1$/s.exec(s);
  if (m) return { text: m[2], quoted: true };
  const stripped = s.replace(/["']/g, "");
  return { text: stripped, quoted: stripped !== s };
}

/** The here-documents a RUN, COPY or ADD line declares, in order. */
function heredocMarkers(args: string): { delimiter: string; stripTabs: boolean; quoted: boolean }[] {
  const out: { delimiter: string; stripTabs: boolean; quoted: boolean }[] = [];
  for (const word of rawWords(args)) {
    const m = /^\d*<<(-?)([^<]*)$/.exec(word);
    if (!m) continue;
    const { text, quoted } = unquote(m[2]);
    if (text === "") continue;
    out.push({ delimiter: text, stripTabs: m[1] === "-", quoted });
  }
  return out;
}

/**
 * Read the file into instructions. Never throws. Lines past MAX_LINES are the
 * caller's problem: the caller refuses the input before this runs.
 */
export function parseDockerfile(text: string): ParseResult {
  const lines = text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n");
  const instructions: Instruction[] = [];
  const directives: { key: string; value: string }[] = [];
  let escape = "\\";
  let directivesOpen = true;
  let i = 0;

  const continues = (line: string): boolean => {
    const t = line.replace(/[ \t]+$/, "");
    return t.endsWith(escape);
  };

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (directivesOpen) {
      const d = /^#\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.*?)\s*$/.exec(trimmed);
      if (d) {
        const key = d[1].toLowerCase();
        directives.push({ key, value: d[2] });
        if (key === "escape" && (d[2] === "`" || d[2] === "\\")) escape = d[2];
        i++;
        continue;
      }
    }
    if (trimmed === "") {
      directivesOpen = false;
      i++;
      continue;
    }
    if (trimmed.startsWith("#")) {
      directivesOpen = false;
      i++;
      continue;
    }
    directivesOpen = false;

    const startLine = i + 1;
    let joined = "";
    const starts: { offset: number; line: number }[] = [];
    let cur = raw;
    let physical = i;
    for (;;) {
      starts.push({ offset: joined.length, line: physical + 1 });
      if (!continues(cur)) {
        joined += cur;
        break;
      }
      const t = cur.replace(/[ \t]+$/, "");
      joined += t.slice(0, -escape.length);
      let next = physical + 1;
      while (next < lines.length && (lines[next].trim() === "" || lines[next].trim().startsWith("#"))) next++;
      if (next >= lines.length) {
        physical = Math.max(physical, next - 1);
        break;
      }
      physical = next;
      cur = lines[next];
    }
    i = physical + 1;

    const lead = /^\s*/.exec(joined)?.[0].length ?? 0;
    const kw = /^([^\s]+)/.exec(joined.slice(lead));
    const typed = kw ? kw[1] : "";
    const base = lead + typed.length;
    let args = joined.slice(base);
    const argLead = /^[ \t]*/.exec(args)?.[0].length ?? 0;
    args = args.slice(argLead).replace(/\s+$/, "");
    const argBase = base + argLead;
    const lineStarts = starts.map((s) => ({ offset: Math.max(0, s.offset - argBase), line: s.line }));

    let keyword = typed.toUpperCase();
    let onbuild = false;
    let finalArgs = args;
    let finalStarts = lineStarts;
    if (keyword === "ONBUILD") {
      const inner = /^([^\s]+)\s*([\s\S]*)$/.exec(args);
      if (inner && KEYWORDS.has(inner[1].toUpperCase()) && !["ONBUILD", "FROM", "MAINTAINER"].includes(inner[1].toUpperCase())) {
        onbuild = true;
        keyword = inner[1].toUpperCase();
        const shift = args.length - inner[2].length;
        finalArgs = inner[2];
        finalStarts = lineStarts.map((s) => ({ offset: Math.max(0, s.offset - shift), line: s.line }));
      }
    }

    const heredocs: Heredoc[] = [];
    if (keyword === "RUN" || keyword === "COPY" || keyword === "ADD") {
      for (const marker of heredocMarkers(finalArgs)) {
        const bodyStart = i + 1;
        const body: string[] = [];
        let terminated = false;
        while (i < lines.length) {
          const l = lines[i];
          const compare = marker.stripTabs ? l.replace(/^\t+/, "") : l;
          i++;
          if (compare === marker.delimiter) {
            terminated = true;
            break;
          }
          body.push(l);
        }
        heredocs.push({ ...marker, body: body.join("\n"), line: bodyStart, terminated });
        if (!terminated) break;
      }
    }

    instructions.push({
      keyword,
      typed,
      args: finalArgs,
      line: startLine,
      endLine: Math.max(physical + 1, i),
      lineStarts: finalStarts,
      heredocs,
      onbuild,
    });
  }
  return { instructions, directives, lines };
}

function lineAtOffset(starts: { offset: number; line: number }[], offset: number): number {
  let line = starts.length > 0 ? starts[0].line : 1;
  for (const s of starts) {
    if (s.offset <= offset) line = s.line;
    else break;
  }
  return line;
}

/* ============================================================ shell lexer */

export interface ShellWord {
  text: string;
  pos: number;
}

export interface ShellCmd {
  words: ShellWord[];
  /** The operator that ended this command, or "" at the end of the script. */
  sep: string;
  pos: number;
}

function skipBalancedShell(s: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === "\\") j++;
    else if (ch === "'") {
      const k = s.indexOf("'", j + 1);
      if (k < 0) return s.length;
      j = k;
    } else if (ch === '"') {
      j++;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\") j++;
        j++;
      }
    } else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return s.length;
}

const RESERVED = new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "for", "case", "esac", "in", "function", "!", "{", "}", "time"]);

/**
 * Split a shell script into simple commands. Quotes and escapes are removed
 * from words, `$(...)`, `${...}` and backticks stay inside their word, and a
 * redirection and its target are dropped. Positions are offsets into `text`.
 */
export function shellCommands(text: string): ShellCmd[] {
  const cmds: ShellCmd[] = [];
  let words: ShellWord[] = [];
  let cur: string | null = null;
  let curPos = 0;
  let skipTarget = false;
  const n = text.length;
  let i = 0;

  const begin = () => {
    if (cur === null) {
      cur = "";
      curPos = i;
    }
  };
  const endWord = () => {
    if (cur !== null) {
      if (skipTarget) skipTarget = false;
      else words.push({ text: cur, pos: curPos });
      cur = null;
    }
  };
  const endCmd = (sep: string) => {
    endWord();
    skipTarget = false;
    while (words.length > 0 && RESERVED.has(words[0].text)) words = words.slice(1);
    if (words.length > 0) cmds.push({ words, sep, pos: words[0].pos });
    words = [];
  };

  while (i < n) {
    const c = text[i];
    if (c === " " || c === "\t") {
      endWord();
      i++;
    } else if (c === "\n") {
      endCmd("\n");
      i++;
    } else if (c === "\\") {
      if (text[i + 1] === "\n") {
        i += 2;
      } else {
        begin();
        cur += text[i + 1] ?? "\\";
        i += 2;
      }
    } else if (c === "'") {
      begin();
      const k = text.indexOf("'", i + 1);
      cur += text.slice(i + 1, k < 0 ? n : k);
      i = k < 0 ? n : k + 1;
    } else if (c === '"') {
      begin();
      i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === "\\" && i + 1 < n) {
          if (text[i + 1] === "\n") {
            i += 2;
            continue;
          }
          if (/["\\$`]/.test(text[i + 1])) {
            cur += text[i + 1];
            i += 2;
            continue;
          }
        }
        if (text[i] === "$" && (text[i + 1] === "(" || text[i + 1] === "{")) {
          const k = skipBalancedShell(text, i + 1, text[i + 1], text[i + 1] === "(" ? ")" : "}");
          cur += text.slice(i, k);
          i = k;
          continue;
        }
        if (text[i] === "`") {
          let k = i + 1;
          while (k < n && text[k] !== "`") k += text[k] === "\\" ? 2 : 1;
          cur += text.slice(i, Math.min(k + 1, n));
          i = k + 1;
          continue;
        }
        cur += text[i++];
      }
      i++;
    } else if (c === "$" && (text[i + 1] === "(" || text[i + 1] === "{")) {
      begin();
      const k = skipBalancedShell(text, i + 1, text[i + 1], text[i + 1] === "(" ? ")" : "}");
      cur += text.slice(i, k);
      i = k;
    } else if (c === "`") {
      begin();
      let k = i + 1;
      while (k < n && text[k] !== "`") k += text[k] === "\\" ? 2 : 1;
      cur += text.slice(i, Math.min(k + 1, n));
      i = k + 1;
    } else if (c === "#" && cur === null) {
      while (i < n && text[i] !== "\n") i++;
    } else if (c === ">" || c === "<" || (c === "&" && text[i + 1] === ">")) {
      // A redirection. A bare number before it names the descriptor.
      if (cur !== null && /^\d+$/.test(cur)) cur = null;
      else endWord();
      let j = i;
      if (text[j] === "&") j++;
      while (text[j] === ">" || text[j] === "<") j++;
      let carriesTarget = false;
      if (text[j] === "&") {
        // >&2, <&3 and >&- name a descriptor inside the operator.
        j++;
        while (j < n && /\d/.test(text[j])) j++;
        if (text[j] === "-") j++;
        carriesTarget = true;
      } else if (text[j] === "|") j++;
      skipTarget = !carriesTarget;
      i = j;
    } else if (c === "|" || c === "&" || c === ";" || c === "(" || c === ")") {
      let op = c;
      if ((c === "&" || c === "|") && text[i + 1] === c) op = c + c;
      else if (c === "|" && text[i + 1] === "&") op = "|&";
      else if (c === ";" && text[i + 1] === ";") op = ";;";
      endCmd(op);
      i += op.length;
    } else {
      begin();
      cur += c;
      i++;
    }
  }
  endCmd("");
  return cmds;
}

interface Called {
  name: string;
  /** Words after the command name. */
  args: ShellWord[];
  sudo: boolean;
  /** Offset of the command name, for line lookup. */
  pos: number;
  /** Variable assignments written before the command. */
  assigns: string[];
}

const SUDO_VALUE = new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t"]);

/** The command a simple command actually runs, after assignments, sudo, env and friends. */
function called(cmd: ShellCmd): Called | null {
  const words = cmd.words;
  let i = 0;
  let sudo = false;
  const assigns: string[] = [];
  for (;;) {
    const w = words[i]?.text;
    if (w === undefined) return null;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
      assigns.push(w);
      i++;
    } else if (w === "sudo") {
      sudo = true;
      i++;
      while (i < words.length && words[i].text.startsWith("-")) i += SUDO_VALUE.has(words[i].text) ? 2 : 1;
    } else if (w === "env") {
      i++;
      while (i < words.length && (words[i].text.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i].text))) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i].text)) assigns.push(words[i].text);
        i += words[i].text === "-u" || words[i].text === "-C" ? 2 : 1;
      }
    } else if (w === "command" || w === "exec" || w === "nohup" || w === "time" || w === "builtin") {
      i++;
    } else if (w === "nice") {
      i++;
      if (words[i]?.text === "-n") i += 2;
    } else break;
  }
  const word = words[i];
  const name = word.text.slice(word.text.lastIndexOf("/") + 1);
  return { name, args: words.slice(i + 1), sudo, pos: word.pos, assigns };
}

/* ================================================================== rules */

interface Options {
  /** Short options that consume the next word. */
  short: string;
  /** Long options that consume the next word when written without `=`. */
  long: string[];
}

interface Parsed {
  /** Every option word, with the values of option arguments included. */
  opts: string[];
  /** Short option letters seen, with repeats. */
  letters: string;
  /** Positional words after the options. */
  positional: ShellWord[];
}

function parseOptions(args: ShellWord[], spec: Options): Parsed {
  const opts: string[] = [];
  let letters = "";
  const positional: ShellWord[] = [];
  for (let i = 0; i < args.length; i++) {
    const w = args[i].text;
    if (w === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (w.startsWith("--")) {
      opts.push(w);
      if (!w.includes("=") && spec.long.includes(w) && i + 1 < args.length) {
        opts.push(args[++i].text);
      }
    } else if (w.startsWith("-") && w.length > 1) {
      opts.push(w);
      const eq = w.indexOf("=");
      const cluster = eq < 0 ? w.slice(1) : w.slice(1, eq);
      letters += cluster;
      if (eq < 0 && spec.short.includes(cluster[cluster.length - 1]) && i + 1 < args.length) {
        opts.push(args[++i].text);
      }
    } else positional.push(args[i]);
  }
  return { opts, letters, positional };
}

const APT_OPTIONS: Options = {
  short: "octa",
  long: ["--option", "--config-file", "--target-release", "--default-release", "--host-architecture"],
};

interface AptCall {
  tool: "apt-get" | "apt";
  sub: string;
  parsed: Parsed;
  pos: number;
}

function aptCall(c: Called): AptCall | null {
  if (c.name !== "apt-get" && c.name !== "apt") return null;
  const parsed = parseOptions(c.args, APT_OPTIONS);
  const sub = parsed.positional[0]?.text ?? "";
  return { tool: c.name, sub, parsed, pos: c.pos };
}

function aptAssumesYes(a: AptCall): boolean {
  const { opts, letters } = a.parsed;
  if (letters.includes("y")) return true;
  if (opts.some((o) => o === "--yes" || o === "--assume-yes" || o === "--force-yes")) return true;
  let quiet = (letters.match(/q/g) ?? []).length + opts.filter((o) => o === "--quiet").length;
  for (const o of opts) {
    const m = /^(?:-q|--quiet)=(\d+)$/.exec(o);
    if (m) quiet = Math.max(quiet, Number(m[1]));
  }
  if (quiet >= 2) return true;
  return opts.some((o) => /^APT::Get::(?:Assume-Yes|force-yes)(?:=|\s*")?(?:true|1)/i.test(o));
}

function aptDryRun(a: AptCall): boolean {
  const { opts, letters } = a.parsed;
  return (
    letters.includes("s") ||
    opts.some((o) => ["--simulate", "--just-print", "--dry-run", "--recon", "--no-act"].includes(o))
  );
}

function aptNoRecommends(a: AptCall): boolean {
  return (
    a.parsed.opts.includes("--no-install-recommends") ||
    a.parsed.opts.some((o) => /^APT::Install-Recommends(?:=|\s*")?(?:false|0)/i.test(o))
  );
}

const APT_PROMPTS = new Set(["install", "remove", "purge", "autoremove", "upgrade", "dist-upgrade", "full-upgrade", "build-dep", "reinstall"]);
const APT_USES_INDEX = new Set(["install", "upgrade", "dist-upgrade", "full-upgrade", "build-dep", "reinstall"]);
const APT_ADDS = new Set(["install", "build-dep", "reinstall"]);

const YUM_OPTIONS: Options = {
  short: "cxR",
  long: ["--config", "--exclude", "--enablerepo", "--disablerepo", "--releasever", "--installroot", "--setopt", "--repo", "--repoid"],
};
const YUM_PROMPTS = new Set(["install", "update", "upgrade", "remove", "erase", "reinstall", "downgrade", "groupinstall", "groupremove", "distro-sync", "autoremove"]);

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh", "csh", "tcsh", "fish"]);
const INTERPRETERS = new Set(["python", "python2", "python3", "perl", "ruby", "node"]);

/** The mode forms that grant read, write and execute to everyone. */
function worldRwx(mode: string): boolean {
  if (/^0?777$/.test(mode)) return true;
  const m = /^([ugoa]*)([+=])([rwxXst]*)$/.exec(mode);
  if (!m) return false;
  const who = m[1];
  const everyone = who === "" || who.includes("a") || (who.includes("u") && who.includes("g") && who.includes("o"));
  return everyone && m[3].includes("r") && m[3].includes("w") && m[3].includes("x");
}

const SECRET_SUBSTRING = /password|passwd|secret|apikey|api_key|credential|private_?key|access_?key/i;
const SECRET_TOKEN = /(?:^|_)(?:token|key|pword|passwd|password|secret|credentials?)(?:_|$)/i;
const NOT_A_SECRET = /(?:^|_)public(?:_|$)|_(?:file|path|dir|filename)$/i;

/** True when a variable name suggests it holds a secret. */
export function looksSecret(name: string): boolean {
  if (NOT_A_SECRET.test(name)) return false;
  return SECRET_SUBSTRING.test(name) || SECRET_TOKEN.test(name);
}

const SECRET_FILES: RegExp[] = [
  /^\.env(?:\.(?!(?:example|sample|template|dist|defaults?)$)[^/]+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/i,
  /\.(?:key|p12|pfx|jks|keystore)$/i,
  /^\.(?:npmrc|netrc|pypirc|git-credentials|ssh|aws|gnupg|kube)$/i,
  /^credentials(?:\.json)?$/i,
];

const ARCHIVE = /\.(?:tar|tar\.gz|tgz|tar\.bz2|tbz2|tbz|tar\.xz|txz)$/i;
const REMOTE = /^(?:https?|ftp):\/\//i;
const GIT_SOURCE = /^(?:git:\/\/|git@|ssh:\/\/)|^https?:\/\/[^\s#]+\.git(?:[#?].*)?$/i;

/** Edit distance, for a did-you-mean on a misspelled instruction. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

interface Stage {
  index: number;
  line: number;
  image: string;
  name: string | null;
  implicit: boolean;
  instructions: number;
  users: { line: number; value: string }[];
  cmds: Instruction[];
  entrypoints: Instruction[];
  healthchecks: Instruction[];
  healthNone: boolean;
  absWorkdir: boolean;
  recommendsOff: boolean;
  windows: boolean;
}

/** Expand ${VAR}, ${VAR:-d} and $VAR against the ARGs declared before the first FROM. */
function expandVars(s: string, vars: Map<string, string | undefined>): { value: string; unresolved: boolean } {
  let unresolved = false;
  const value = s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-+])([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, braced, op, word, bare) => {
    const name = (braced ?? bare) as string;
    const has = vars.has(name);
    const v = vars.get(name);
    if (op === ":-" || op === "-") {
      if (has && v !== undefined && (op === "-" || v !== "")) return v;
      return word ?? "";
    }
    if (op === ":+" || op === "+") {
      return has && v !== undefined && (op === "+" || v !== "") ? (word ?? "") : "";
    }
    if (has && v !== undefined) return v;
    unresolved = true;
    return "";
  });
  return { value, unresolved };
}

function clip(s: string, max = 140): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 3)}...` : one;
}

/* ================================================================== lint */

/**
 * Lint a Dockerfile. Returns findings sorted by line, plus the parsed
 * instructions and stages so the page can show how the file was read.
 */
export function lintDockerfile(input: string): LintResult {
  if (input.length > MAX_INPUT) {
    return {
      ok: false,
      error: `That is ${input.length.toLocaleString("en-US")} characters. The limit is ${MAX_INPUT.toLocaleString("en-US")}. Paste one Dockerfile at a time.`,
    };
  }
  const physical = input.split("\n").length;
  if (physical > MAX_LINES) {
    return {
      ok: false,
      error: `That is ${physical.toLocaleString("en-US")} lines. The limit is ${MAX_LINES.toLocaleString("en-US")}. Paste one Dockerfile at a time.`,
    };
  }
  if (input.trim() === "") return { ok: false, error: "Paste a Dockerfile." };

  const { instructions, directives, lines } = parseDockerfile(input);
  if (instructions.length === 0) {
    return { ok: false, error: "That text has comments but no instructions. A Dockerfile starts with FROM." };
  }

  const findings: Finding[] = [];
  const seen = new Set<string>();
  const report = (id: string, line: number, message: string, instruction: string) => {
    const info = RULES.get(id);
    if (!info) return;
    const key = `${id}:${line}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({
      rule: id,
      severity: info.severity,
      line,
      message,
      why: info.why,
      fix: info.fix,
      instruction,
      snippet: clip(lines[line - 1] ?? ""),
    });
  };

  const globals = new Map<string, string | undefined>();
  const stages: Stage[] = [];
  const info: InstructionInfo[] = [];
  let seenFrom = false;
  let reportedNoFrom = false;

  const newStage = (line: number, image: string, name: string | null, implicit: boolean): Stage => {
    const stage: Stage = {
      index: stages.length,
      line,
      image,
      name,
      implicit,
      instructions: 0,
      users: [],
      cmds: [],
      entrypoints: [],
      healthchecks: [],
      healthNone: false,
      absWorkdir: false,
      recommendsOff: false,
      windows: false,
    };
    stages.push(stage);
    return stage;
  };

  for (const inst of instructions) {
    const { keyword, line } = inst;
    const argsTrim = inst.args.trim();

    if (!KEYWORDS.has(keyword)) {
      const guess = [...KEYWORDS].map((k) => ({ k, d: distance(keyword, k) })).sort((a, b) => a.d - b.d)[0];
      const hint = guess && guess.d <= 2 && inst.typed.length > 2 ? ` Did you mean ${guess.k}?` : "";
      report("unknown-instruction", line, `${clip(inst.typed, 40)} is not a Dockerfile instruction.${hint}`, inst.typed.toUpperCase());
      continue;
    }

    if (argsTrim === "" && inst.heredocs.length === 0) {
      report("missing-arguments", line, `${keyword} has no arguments.`, keyword);
      info.push({ line, endLine: inst.endLine, keyword, args: "", stage: stages.length - 1, heredocs: 0, onbuild: inst.onbuild });
      continue;
    }

    for (const h of inst.heredocs) {
      if (!h.terminated) {
        report("heredoc-unterminated", inst.line, `The here-document ${h.delimiter} has no closing line, so the rest of the file became its body.`, keyword);
      }
    }

    if (keyword === "ARG" && !seenFrom) {
      for (const w of splitWords(inst.args)) {
        const eq = w.indexOf("=");
        if (eq < 0) globals.set(w, undefined);
        else globals.set(w.slice(0, eq), w.slice(eq + 1));
      }
    }

    if (keyword === "FROM") {
      seenFrom = true;
      const words = splitWords(inst.args).filter((w) => !w.startsWith("--"));
      const image = words[0];
      if (!image) {
        report("from-malformed", line, "FROM has no image name.", "FROM");
        newStage(line, "", null, false);
        continue;
      }
      const asIdx = words.findIndex((w, k) => k > 0 && w.toLowerCase() === "as");
      const name = asIdx > 0 ? (words[asIdx + 1] ?? null) : null;
      const stage = newStage(line, image, name, false);
      stage.instructions++;
      info.push({ line, endLine: inst.endLine, keyword, args: inst.args, stage: stage.index, heredocs: 0, onbuild: false });
      checkFromImage(image, line, stages, globals, report);
      continue;
    }

    // Anything but ARG before the first FROM has no base image to act on.
    let stage = stages[stages.length - 1];
    if (!stage) {
      if (keyword === "ARG") {
        info.push({ line, endLine: inst.endLine, keyword, args: inst.args, stage: -1, heredocs: inst.heredocs.length, onbuild: inst.onbuild });
        continue;
      }
      if (!reportedNoFrom) {
        reportedNoFrom = true;
        report("no-from", line, `${keyword} comes before any FROM, so there is no base image yet.`, keyword);
      }
      stage = newStage(line, "", null, true);
    }
    stage.instructions++;
    info.push({ line, endLine: inst.endLine, keyword, args: inst.args, stage: stage.index, heredocs: inst.heredocs.length, onbuild: inst.onbuild });

    switch (keyword) {
      case "MAINTAINER":
        report("maintainer-deprecated", line, "MAINTAINER is deprecated.", keyword);
        break;
      case "RUN":
        lintRun(inst, stage, report);
        break;
      case "CMD":
      case "ENTRYPOINT":
        lintExec(inst, stage, report);
        break;
      case "SHELL": {
        const form = execForm(inst.args);
        if (form.kind !== "exec") {
          report("shell-needs-json", line, "SHELL is not a JSON array.", keyword);
        } else if (/(?:^|\/)(?:powershell|pwsh|cmd)(?:\.exe)?$/i.test(form.items[0] ?? "")) {
          stage.windows = true;
        }
        break;
      }
      case "HEALTHCHECK": {
        const words = splitWords(inst.args).filter((w) => !w.startsWith("--"));
        if (words[0]?.toUpperCase() === "NONE") stage.healthNone = true;
        if (!inst.onbuild) stage.healthchecks.push(inst);
        break;
      }
      case "USER":
        if (!inst.onbuild) stage.users.push({ line, value: argsTrim });
        break;
      case "WORKDIR": {
        const value = unquote(argsTrim).text;
        const absolute = /^(?:[/\\]|[A-Za-z]:[\\/]|\$)/.test(value);
        if (!absolute && value !== "" && !stage.absWorkdir && !inst.onbuild) {
          report("workdir-relative", line, `WORKDIR ${clip(value, 60)} is a relative path.`, keyword);
        }
        if (absolute && !inst.onbuild) stage.absWorkdir = true;
        break;
      }
      case "ENV":
      case "ARG":
        lintVars(inst, report);
        break;
      case "COPY":
      case "ADD":
        lintCopy(inst, report);
        break;
      default:
        break;
    }

    // Credentials in a URL can sit in any instruction that takes text.
    if (keyword === "RUN" || keyword === "ADD" || keyword === "ENV" || keyword === "ARG" || keyword === "LABEL") {
      const scan = (text: string, lineOf: (offset: number) => number) => {
        const re = /\b[a-z][a-z0-9+.-]*:\/\/([^/\s:@'"$]+):([^/\s@'"]+)@/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const viaVariable = m[2].includes("$");
          report(
            "url-credentials",
            lineOf(m.index),
            viaVariable
              ? `A URL carries the password ${clip(m[2], 30)} from a variable. The expanded value is stored in the layer and, for an ARG, in the history.`
              : `A URL carries the user ${clip(m[1], 30)} and a literal password.`,
            keyword,
          );
        }
      };
      scan(inst.args, (offset) => lineAtOffset(inst.lineStarts, offset));
      for (const h of inst.heredocs) {
        scan(h.body, (offset) => h.line + (h.body.slice(0, offset).match(/\n/g)?.length ?? 0));
      }
    }
  }

  // Per-stage checks that need the whole stage.
  for (const stage of stages) {
    const groups: [Instruction[], string, string][] = [
      [stage.cmds, "multiple-cmd", "CMD"],
      [stage.entrypoints, "multiple-entrypoint", "ENTRYPOINT"],
      [stage.healthchecks, "multiple-healthcheck", "HEALTHCHECK"],
    ];
    for (const [list, id, word] of groups) {
      for (let k = 0; k < list.length - 1; k++) {
        report(id, list[k].line, `This ${word} is ignored. The ${word} on line ${list[k + 1].line} replaces it.`, word);
      }
    }
  }

  const last = stages[stages.length - 1];
  if (last && !last.implicit && last.image !== "") {
    const users = last.users;
    if (users.length === 0) {
      report("no-user", last.line, "No USER instruction in the final stage, so the container runs as root unless the base image sets a user.", "FROM");
    } else {
      const v = users[users.length - 1];
      const who = unquote(v.value).text.split(":")[0];
      if (who === "root" || /^0+$/.test(who)) {
        report("user-root", v.line, `USER ${clip(v.value, 40)} makes the container run as root.`, "USER");
      }
    }
    if (last.healthchecks.length === 0 && !last.healthNone) {
      report("no-healthcheck", last.line, "The final stage has no HEALTHCHECK.", "FROM");
    }
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => a.line - b.line || rank[a.severity] - rank[b.severity] || a.rule.localeCompare(b.rule));

  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  return {
    ok: true,
    findings,
    instructions: info,
    stages: stages
      .filter((s) => !s.implicit || s.instructions > 0)
      .map((s) => ({ index: s.index, line: s.line, image: s.image, name: s.name, instructions: s.instructions })),
    counts,
    directives,
  };
}

type Reporter = (id: string, line: number, message: string, instruction: string) => void;

type Form = { kind: "exec"; items: string[] } | { kind: "shell" } | { kind: "invalid" };

/** Docker reads an argument that parses as a JSON array of strings as exec form, and anything else as shell form. */
export function execForm(args: string): Form {
  const t = args.trim();
  if (!t.startsWith("[")) return { kind: "shell" };
  try {
    const v: unknown = JSON.parse(t);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return { kind: "exec", items: v as string[] };
  } catch {
    // fall through
  }
  return { kind: "invalid" };
}

function lintExec(inst: Instruction, stage: Stage, rep: Reporter): void {
  const form = execForm(inst.args);
  if (!inst.onbuild) (inst.keyword === "CMD" ? stage.cmds : stage.entrypoints).push(inst);
  if (form.kind === "exec") return;
  if (form.kind === "invalid") {
    rep("json-form-invalid", inst.line, `${inst.keyword} ${clip(inst.args, 60)} is not valid JSON, so Docker runs it as shell form.`, inst.keyword);
    return;
  }
  if (/^exec\s/.test(inst.args.trim())) return;
  rep(
    "shell-form",
    inst.line,
    inst.keyword === "ENTRYPOINT"
      ? `ENTRYPOINT ${clip(inst.args, 60)} is in shell form, so CMD and docker run arguments are ignored.`
      : `CMD ${clip(inst.args, 60)} is in shell form.`,
    inst.keyword,
  );
}

function checkFromImage(
  ref: string,
  line: number,
  stages: Stage[],
  globals: Map<string, string | undefined>,
  report: Reporter,
): void {
  const lower = ref.toLowerCase();
  if (lower === "scratch") return;
  // A reference to an earlier stage. The stage being declared is last in the list and does not count.
  if (stages.slice(0, -1).some((s) => s.name?.toLowerCase() === lower)) return;
  const { value, unresolved } = expandVars(ref, globals);
  if (unresolved || value === "") return;
  if (value.includes("@")) return;
  const slash = value.lastIndexOf("/");
  const colon = value.lastIndexOf(":");
  const tag = colon > slash ? value.slice(colon + 1) : null;
  if (tag === null) {
    report("from-untagged", line, `FROM ${clip(value, 60)} has no tag, so it means ${clip(value, 50)}:latest.`, "FROM");
  } else if (tag === "latest") {
    report("from-latest", line, `FROM ${clip(value, 60)} uses the latest tag.`, "FROM");
  }
}

function lintVars(inst: Instruction, report: Reporter): void {
  const words = splitWords(inst.args);
  const pairs: { name: string; value: string | null }[] = [];
  if (inst.keyword === "ENV" && words.length > 0 && !words[0].includes("=")) {
    // Legacy form: ENV name value with spaces
    pairs.push({ name: words[0], value: inst.args.trim().slice(words[0].length).trim() });
  } else {
    for (const w of words) {
      const eq = w.indexOf("=");
      if (eq < 0) pairs.push({ name: w, value: null });
      else pairs.push({ name: w.slice(0, eq), value: w.slice(eq + 1) });
    }
  }
  for (const { name, value } of pairs) {
    if (!looksSecret(name)) continue;
    const literal = value !== null && value !== "" && !value.startsWith("$");
    const where = inst.keyword === "ENV" ? "stored in the image configuration and in every container" : "recorded in the image history when a RUN uses it";
    report(
      "secret-name",
      inst.line,
      `${inst.keyword} ${clip(name, 50)} looks like a secret${literal ? " and has a literal value" : ""}. The value is ${where}.`,
      inst.keyword,
    );
  }
  if (inst.keyword === "ENV") {
    for (const { name, value } of pairs) {
      if (name === "NODE_TLS_REJECT_UNAUTHORIZED" && value === "0") {
        report("tls-verify-off", inst.line, "NODE_TLS_REJECT_UNAUTHORIZED=0 turns off certificate checks for Node.js.", "ENV");
      }
      if (name === "GIT_SSL_NO_VERIFY") {
        report("tls-verify-off", inst.line, "GIT_SSL_NO_VERIFY turns off certificate checks for Git.", "ENV");
      }
    }
  }
}

interface CopyArgs {
  flags: string[];
  sources: string[];
  dest: string | null;
  heredoc: boolean;
}

function copyArgs(inst: Instruction): CopyArgs {
  const flags: string[] = [];
  let rest = inst.args.trim();
  for (;;) {
    const m = /^(--[A-Za-z-]+(?:=\S*)?)\s*/.exec(rest);
    if (!m) break;
    flags.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  if (inst.heredocs.length > 0) return { flags, sources: [], dest: null, heredoc: true };
  let items: string[];
  const form = execForm(rest);
  if (form.kind === "exec") items = form.items;
  else items = rest.split(/\s+/).filter((x) => x !== "");
  return { flags, sources: items.slice(0, -1), dest: items.length > 0 ? items[items.length - 1] : null, heredoc: false };
}

function lintCopy(inst: Instruction, report: Reporter): void {
  const { flags, sources, heredoc } = copyArgs(inst);
  const line = inst.line;
  const kw = inst.keyword;

  for (const f of flags) {
    const m = /^--chmod=(.+)$/.exec(f);
    if (m && worldRwx(m[1])) report("chmod-777", line, `${kw} ${f} gives every user read, write and execute.`, kw);
  }
  if (heredoc) return;

  const fromStage = flags.some((f) => f.startsWith("--from="));
  if (!fromStage) {
    for (const src of sources) {
      if (src.includes("$") || REMOTE.test(src)) continue;
      const base = src.replace(/\/+$/, "").split("/").pop() ?? "";
      if (SECRET_FILES.some((re) => re.test(base))) {
        report("copy-secret-file", line, `${kw} ${clip(src, 60)} looks like a secret file.`, kw);
      }
    }
  }

  if (kw !== "ADD") return;
  const hasChecksum = flags.some((f) => f.startsWith("--checksum="));
  const local = sources.filter((s) => !REMOTE.test(s) && !GIT_SOURCE.test(s));
  for (const src of sources) {
    if (REMOTE.test(src) && !GIT_SOURCE.test(src) && !hasChecksum) {
      report("add-remote-url", line, `ADD fetches ${clip(src, 70)} with no checksum.`, kw);
    }
  }
  const anyArchive = local.some((s) => ARCHIVE.test(s));
  const plain = local.filter((s) => !s.includes("$") && !ARCHIVE.test(s));
  if (plain.length > 0 && !anyArchive) {
    report("add-for-copy", line, `ADD ${clip(plain[0], 60)} copies a local path, which COPY does without the extra behavior.`, kw);
  }
}

/** The text of a RUN to analyze, and a way back from an offset in it to a physical line. */
function runScript(inst: Instruction): { text: string; lineAt: (offset: number) => number; mounts: string[] } {
  let args = inst.args;
  let shift = 0;
  const mounts: string[] = [];
  for (;;) {
    const m = /^(--[A-Za-z-]+(?:=\S*)?)\s*/.exec(args);
    if (!m) break;
    if (m[1].startsWith("--mount")) mounts.push(m[1]);
    args = args.slice(m[0].length);
    shift += m[0].length;
  }

  const form = execForm(args);
  if (form.kind === "exec") {
    const items = form.items;
    const q = (x: string) => `'${x.replace(/'/g, `'\\''`)}'`;
    const isShell = items.length >= 3 && SHELLS.has((items[0].split("/").pop() ?? "")) && /^-[a-z]*c$/.test(items[1]);
    const text = isShell ? items.slice(2).join("\n") : items.map(q).join(" ");
    return { text, lineAt: () => inst.line, mounts };
  }

  // Blank out each here-document marker so the lexer does not see a redirect,
  // and append the bodies of the ones that hold shell.
  let head = args;
  for (const h of inst.heredocs) {
    const marker = new RegExp(`\\d*<<-?\\s*["']?${h.delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?`);
    head = head.replace(marker, (m) => " ".repeat(m.length));
  }
  const entries: { offset: number; line: number }[] = inst.lineStarts.map((s) => ({
    offset: Math.max(0, s.offset - shift),
    line: s.line,
  }));
  let text = head;
  const headIsShell = /^\s*(?:(?:\/(?:usr\/)?bin\/)?(?:ba|da|a|k|z)?sh(?:\s+-[A-Za-z]+)*)?\s*$/.test(head);
  for (const h of inst.heredocs) {
    const firstLine = h.body.split("\n")[0] ?? "";
    const shebang = /^#!/.test(firstLine);
    const shShebang = /^#!\s*(?:\/usr\/bin\/env\s+)?\S*\b(?:ba|da|a|k|z)?sh\b/.test(firstLine);
    if (!(shebang ? shShebang : headIsShell)) continue;
    text += "\n";
    const bodyLines = h.body.split("\n");
    bodyLines.forEach((l, k) => {
      entries.push({ offset: text.length, line: h.line + k });
      text += l + "\n";
    });
  }
  return { text, lineAt: (offset) => lineAtOffset(entries, offset), mounts };
}

function lintRun(inst: Instruction, stage: Stage, report: Reporter): void {
  if (stage.windows) return;
  const { text, lineAt, mounts } = runScript(inst);
  const cmds = shellCommands(text);
  const kw = "RUN";
  const aptCacheMount = mounts.some((m) => /type=cache/.test(m) && /\/var\/(?:lib|cache)\/apt/.test(m));
  const lineOfPos = (pos: number) => lineAt(pos);

  if (/APT::Install-Recommends\W+(?:false|0)\b/i.test(text)) stage.recommendsOff = true;

  const apts: AptCall[] = [];
  let lastInstall = -1;
  let rmListsAt = -1;
  let hasUpdate = false;
  let usesIndex = false;

  for (let c = 0; c < cmds.length; c++) {
    const cmd = cmds[c];
    const call = called(cmd);
    if (!call) continue;
    const line = lineOfPos(call.pos);

    if (call.sudo) {
      report("sudo", line, `sudo runs ${clip(call.name, 30)} through a setuid helper that a build does not need.`, kw);
    }

    for (const a of call.assigns) {
      if (/^NODE_TLS_REJECT_UNAUTHORIZED=0$/.test(a)) {
        report("tls-verify-off", line, "NODE_TLS_REJECT_UNAUTHORIZED=0 turns off certificate checks for Node.js.", kw);
      }
      if (/^GIT_SSL_NO_VERIFY=/.test(a)) {
        report("tls-verify-off", line, "GIT_SSL_NO_VERIFY turns off certificate checks for Git.", kw);
      }
    }

    const apt = aptCall(call);
    if (apt) {
      apts.push(apt);
      const sub = apt.sub;
      if (apt.tool === "apt" && (sub === "install" || sub === "upgrade" || sub === "update" || sub === "full-upgrade")) {
        report("apt-cli", line, `apt ${sub} is meant for interactive use. Use apt-get.`, kw);
      }
      if (APT_PROMPTS.has(sub) && !aptAssumesYes(apt) && !aptDryRun(apt)) {
        report("apt-no-yes", line, `${apt.tool} ${sub} has no -y, so it waits for an answer nobody can give.`, kw);
      }
      if (sub === "install" && !aptNoRecommends(apt) && !stage.recommendsOff) {
        report("apt-no-recommends", line, `${apt.tool} install has no --no-install-recommends.`, kw);
      }
      if (sub === "upgrade" || sub === "dist-upgrade" || sub === "full-upgrade") {
        report("apt-upgrade", line, `${apt.tool} ${sub} upgrades every installed package.`, kw);
      }
      if (sub === "update") hasUpdate = true;
      if (APT_USES_INDEX.has(sub)) usesIndex = true;
      if (APT_ADDS.has(sub)) lastInstall = Math.max(lastInstall, apt.pos);
    }

    if (call.name === "yum" || call.name === "dnf") {
      const parsed = parseOptions(call.args, YUM_OPTIONS);
      const sub = parsed.positional[0]?.text ?? "";
      const yes = parsed.letters.includes("y") || parsed.opts.includes("--assumeyes") || parsed.opts.includes("--assume-yes") || parsed.opts.some((o) => /^--setopt=assumeyes=(?:1|true)$/i.test(o));
      if (YUM_PROMPTS.has(sub) && !yes && !parsed.opts.includes("--assumeno")) {
        report("yum-no-yes", line, `${call.name} ${sub} has no -y, so it waits for an answer nobody can give.`, kw);
      }
    }

    if (call.name === "apk") {
      const parsed = parseOptions(call.args, { short: "", long: [] });
      if (parsed.positional[0]?.text === "add" && !parsed.opts.includes("--no-cache")) {
        const cleans = cmds.some((other) => {
          const oc = called(other);
          return oc !== null && oc.name === "rm" && oc.args.some((w) => w.text.includes("/var/cache/apk"));
        });
        if (!cleans) report("apk-no-cache", line, "apk add has no --no-cache.", kw);
      }
    }

    if (call.name === "rm" && call.args.some((w) => w.text.includes("/var/lib/apt/lists"))) {
      rmListsAt = Math.max(rmListsAt, call.pos);
    }
    if (call.name === "find" && call.args.some((w) => w.text.includes("/var/lib/apt/lists")) && call.args.some((w) => w.text === "-delete")) {
      rmListsAt = Math.max(rmListsAt, call.pos);
    }

    if (call.name === "chmod") {
      const parsed = parseOptions(call.args, { short: "", long: [] });
      const mode = parsed.positional[0]?.text;
      if (mode !== undefined && worldRwx(mode)) {
        report("chmod-777", line, `chmod ${mode} gives every user read, write and execute.`, kw);
      }
    }

    if (call.name === "curl" || call.name === "wget") {
      const parsed = parseOptions(call.args, { short: "", long: [] });
      const insecure =
        call.name === "curl"
          ? parsed.opts.includes("--insecure") || parsed.opts.some((o) => /^-[A-Za-z]*k[A-Za-z]*$/.test(o))
          : parsed.opts.includes("--no-check-certificate");
      if (insecure) {
        report("tls-verify-off", line, `${call.name} ${call.name === "curl" ? "-k" : "--no-check-certificate"} skips certificate verification.`, kw);
      }
      // curl ... | sh, including longer pipelines.
      let j = c;
      while (cmds[j] && (cmds[j].sep === "|" || cmds[j].sep === "|&") && cmds[j + 1]) {
        const next = called(cmds[j + 1]);
        if (next && (SHELLS.has(next.name) || INTERPRETERS.has(next.name))) {
          const target = SHELLS.has(next.name) ? "a shell" : next.name;
          report("pipe-to-shell", line, `${call.name} output is piped into ${target}.`, kw);
          break;
        }
        j++;
      }
    }

    if (call.name === "git") {
      const words = call.args.map((w) => w.text.toLowerCase());
      const k = words.findIndex((w) => w === "http.sslverify" || w === "https.sslverify");
      if (k >= 0 && words[k + 1] === "false") {
        report("tls-verify-off", line, "git config http.sslVerify false skips certificate verification.", kw);
      }
    }
    if (call.name === "npm" || call.name === "yarn" || call.name === "pnpm") {
      const words = call.args.map((w) => w.text.toLowerCase());
      const k = words.indexOf("strict-ssl");
      if (k >= 0 && words[k + 1] === "false") {
        report("tls-verify-off", line, `${call.name} config strict-ssl false skips certificate verification.`, kw);
      }
    }
  }

  // Shell constructs the lexer keeps inside one word.
  const patterns: [RegExp, string][] = [
    [/(?:^|[\s;&|(])(?:source|\.|ba?sh|zsh|dash|ash|ksh)\s+<\(\s*(?:curl|wget)\b/g, "A shell runs the output of a download through process substitution."],
    [/\b(?:ba|z|da|a|k)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)\b/g, "A shell runs the output of a download passed to -c."],
    [/\beval\s+["']?\$\(\s*(?:curl|wget)\b/g, "eval runs the output of a download."],
  ];
  for (const [re, msg] of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) report("pipe-to-shell", lineOfPos(m.index), msg, kw);
  }

  // apt layer hygiene needs the whole RUN.
  if (!aptCacheMount) {
    if (lastInstall >= 0 && rmListsAt < lastInstall) {
      report("apt-lists-not-removed", lineOfPos(lastInstall), "This RUN installs packages and does not remove /var/lib/apt/lists afterwards.", kw);
    }
    if (hasUpdate && !usesIndex) {
      const u = apts.find((a) => a.sub === "update");
      report("apt-update-alone", lineOfPos(u ? u.pos : 0), "apt-get update runs in a RUN of its own, with no install after it.", kw);
    }
  }
}

/* =============================================================== samples */

export const SAMPLE_BAD = `# syntax=docker/dockerfile:1
FROM ubuntu
MAINTAINER dev@example.com
ENV DB_PASSWORD=hunter2
ARG API_TOKEN
RUN apt-get update
RUN apt-get install python3 curl
RUN apt-get -y upgrade
RUN sudo mkdir /opt/app
RUN curl -fsSL https://example.com/install.sh | sh
RUN wget --no-check-certificate -O /tmp/tool https://example.com/tool
RUN git clone https://deploy:s3cret@git.example.com/app.git /src
ADD https://example.com/app.tar.gz /opt/
ADD config/ /etc/app/
COPY .env /app/.env
WORKDIR app
RUN chmod -R 777 /opt
EXPOSE 8080
CMD python3 app.py
CMD ["python3", "app.py"]
ENTRYPOINT ./start.sh
`;

export const SAMPLE_GOOD = `# syntax=docker/dockerfile:1
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/app ./cmd/app

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \\
 && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build --chown=app:app /out/app /app/app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/app/app"]
CMD ["--port", "8080"]
`;

export const SAMPLE_HEREDOC = `FROM debian:12-slim
RUN <<EOF
set -eux
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl
rm -rf /var/lib/apt/lists/*
EOF
COPY <<EOF /etc/app.conf
listen = 8080
EOF
USER nobody
CMD ["sleep", "infinity"]
`;
