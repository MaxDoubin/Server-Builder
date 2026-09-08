/**
 * The command registry, plus the shell's own builtins.
 *
 * `help` and `man` matter more here than they would on a real machine: the
 * reader cannot install anything, cannot read the source, and has no manual
 * page to fall back on, so anything this shell refuses has to say so and say
 * what it does support instead. A lab shell that answers "command not found"
 * to a reasonable command is a lab that has failed.
 */

import { ok, out, err, fail, type Command, type Registry } from "../shell";
import { FILE_COMMANDS } from "./files";
import { TEXT_COMMANDS } from "./text";
import { NET_COMMANDS } from "./net";
import { SYSTEM_COMMANDS } from "./system";

const ALL: Command[] = [...FILE_COMMANDS, ...TEXT_COMMANDS, ...NET_COMMANDS, ...SYSTEM_COMMANDS];

/** Groups exist only so `help` reads like something a person wrote. */
const GROUPS: [string, string[]][] = [
  ["Files", ["ls", "cd", "pwd", "cat", "head", "tail", "wc", "stat", "find", "chmod", "df", "echo"]],
  ["Text", ["grep", "sort", "uniq", "cut", "tr", "sed", "awk", "base64"]],
  ["Network", ["ip", "ss", "ping", "traceroute", "dig", "host", "curl", "nc", "hostname"]],
  ["System", ["ps", "id", "whoami", "uname", "uptime", "free", "env", "systemctl", "journalctl", "date"]],
  ["Shell", ["help", "man", "history", "clear", "answer", "sudo"]],
];

const help: Command = {
  name: "help",
  summary: "list the commands this shell knows",
  usage: ["help", "help COMMAND", "", "`man COMMAND` is the longer version."],
  run(argv, context) {
    if (argv[0]) return man.run(argv, context);
    const lines = [
      out("This is a simulated shell. It knows the commands below and refuses"),
      out("everything else rather than pretending. `man NAME` explains one."),
      out(""),
    ];
    for (const [group, names] of GROUPS) {
      lines.push(out(`${group}`));
      lines.push(out(`  ${names.join("  ")}`));
      lines.push(out(""));
    }
    lines.push(out("Pipes, > and >>, && and || and ; all work. Tab completes."));
    lines.push(out("`answer <your answer>` submits a diagnosis when a lab asks for one."));
    return ok(lines);
  },
};

const man: Command = {
  name: "man",
  summary: "explain one command",
  usage: ["man COMMAND"],
  run(argv) {
    const name = argv[0];
    if (!name) return fail("What manual page do you want?");
    const command = REGISTRY.get(name);
    if (!command) return fail(`No manual entry for ${name}`);
    return ok([
      out(`${command.name} - ${command.summary}`),
      out(""),
      ...command.usage.map((line) => out(line)),
    ]);
  },
};

const history: Command = {
  name: "history",
  summary: "the commands run so far",
  usage: ["history"],
  run(_argv, { machine }) {
    return ok(
      machine.history.map((line, index) => out(`${String(index + 1).padStart(5)}  ${line}`)),
    );
  },
};

const clear: Command = {
  name: "clear",
  summary: "clear the screen",
  usage: ["clear", "", "The terminal handles this one; it prints nothing."],
  run() {
    return ok();
  },
};

const answer: Command = {
  name: "answer",
  summary: "submit a diagnosis",
  usage: [
    "answer YOUR ANSWER HERE",
    "",
    "Several labs ask what is wrong rather than asking you to change",
    "anything, because that is the shape of most real troubleshooting. This",
    "is how you say it.",
  ],
  run(argv, { machine }) {
    const text = argv.join(" ").trim();
    if (!text) return fail("answer: say what you think is wrong, in your own words.");
    machine.answers.push(text);
    return ok([out(`Recorded: ${text}`), out("Use the Check button to see whether the lab agrees.")]);
  },
};

/**
 * sudo, which exists because a lab about permissions is not a lab if the
 * reader cannot change any.
 *
 * It runs the rest of the line as root by swapping machine.user for the
 * duration and putting it back in a finally, so a command that throws cannot
 * leave the session rooted. Membership of the sudo group is checked, because
 * "you are not in the sudoers file" is a real answer a reader should meet
 * here rather than for the first time on a production box.
 */
const sudo: Command = {
  name: "sudo",
  summary: "run one command as root",
  usage: [
    "sudo COMMAND [ARGS...]",
    "",
    "No password prompt in this lab shell. Membership of the sudo group is",
    "still checked, and `sudo -i` and `sudo su` are refused: every lab here",
    "is solvable one command at a time, and a root shell hides which step",
    "actually needed the privilege.",
  ],
  run(argv, context) {
    const { machine } = context;
    if (!machine.groups.includes("sudo") && !machine.groups.includes("wheel")) {
      return fail(`${machine.user} is not in the sudoers file. This incident will be reported.`);
    }
    if (argv.length === 0) return fail("usage: sudo COMMAND [ARGS...]");
    if (argv[0] === "-i" || argv[0] === "su" || argv[0] === "-s") {
      return fail("sudo: an interactive root shell is not available in this lab shell.");
    }
    const target = REGISTRY.get(argv[0]);
    if (!target) {
      return fail(`sudo: ${argv[0]}: command not found`);
    }
    const was = machine.user;
    machine.user = "root";
    try {
      return target.run(argv.slice(1), context);
    } finally {
      machine.user = was;
    }
  },
};

const BUILTINS = [help, man, history, clear, answer, sudo];

const byName = new Map<string, Command>();
for (const command of [...ALL, ...BUILTINS]) byName.set(command.name, command);

/** Spellings people reach for that this shell answers with something else. */
const ALIASES: Record<string, string> = {
  ll: "ls",
  netstat: "ss",
  nslookup: "dig",
  ifconfig: "ip",
  route: "ip",
  more: "cat",
  less: "cat",
  egrep: "grep",
  fgrep: "grep",
  vim: "cat",
  nano: "cat",
  top: "ps",
  htop: "ps",
};

export const REGISTRY: Registry = {
  get(name: string) {
    const direct = byName.get(name);
    if (direct) return direct;
    const alias = ALIASES[name];
    if (!alias) return undefined;
    const target = byName.get(alias);
    if (!target) return undefined;
    /*
      Answer the alias, and say so once.

      Silently treating `netstat` as `ss` teaches that they are the same
      command. Refusing it teaches nothing at all. Answering it with a note
      is the only option that leaves the reader better informed.
    */
    return {
      ...target,
      run(argv, context) {
        const result = target.run(argv, context);
        return {
          ...result,
          lines: [err(`(${name} is not in this lab shell; showing ${alias} instead)`), ...result.lines],
        };
      },
    };
  },
  names() {
    return [...byName.keys(), ...Object.keys(ALIASES)].sort();
  },
};

export const COMMAND_NAMES = [...byName.keys()].sort();
