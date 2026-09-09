/**
 * Process, service and host commands.
 *
 * Mostly formatters over the machine model. The one with real behavior is
 * journalctl, because half the labs end with somebody needing to find the
 * line that says why, and a journalctl that cannot filter is not journalctl.
 */

import { fail, ok, out, type Command, type OutLine } from "../shell";

const pad = (text: string, width: number) => text.padEnd(width);
const padStart = (text: string, width: number) => text.padStart(width);

export const ps: Command = {
  name: "ps",
  summary: "list processes",
  usage: ["ps aux", "ps -ef", "", "Both spellings print the same table here."],
  run(_argv, { machine }) {
    const lines: OutLine[] = [
      out(
        `${pad("USER", 10)}${padStart("PID", 6)} ${padStart("%CPU", 5)} ${padStart("%MEM", 5)} ` +
          `${padStart("RSS", 8)} ${pad("STAT", 5)} ${pad("START", 6)} ${pad("TIME", 6)} COMMAND`,
      ),
    ];
    for (const p of machine.processes) {
      lines.push(
        out(
          `${pad(p.user, 10)}${padStart(String(p.pid), 6)} ${padStart(p.cpu.toFixed(1), 5)} ` +
            `${padStart(p.mem.toFixed(1), 5)} ${padStart(String(p.rss), 8)} ${pad(p.stat, 5)} ` +
            `${pad(p.start, 6)} ${pad(p.time, 6)} ${p.command}`,
        ),
      );
    }
    return ok(lines);
  },
};

export const whoami: Command = {
  name: "whoami",
  summary: "print the effective user",
  usage: ["whoami"],
  run(_argv, { machine }) {
    return ok([out(machine.user)]);
  },
};

export const id: Command = {
  name: "id",
  summary: "print user and group ids",
  usage: ["id"],
  run(_argv, { machine }) {
    const groups = machine.groups
      .map((g, index) => `${index === 0 ? machine.gid : 27 + index}(${g})`)
      .join(",");
    return ok([out(`uid=${machine.uid}(${machine.user}) gid=${machine.gid}(${machine.groups[0]}) groups=${groups}`)]);
  },
};

export const uname: Command = {
  name: "uname",
  summary: "print system information",
  usage: ["uname [-a] [-r]"],
  run(argv, { machine }) {
    if (argv.includes("-r")) return ok([out(machine.kernel)]);
    if (argv.includes("-a")) {
      return ok([
        out(`Linux ${machine.hostname} ${machine.kernel} #45-Ubuntu SMP x86_64 x86_64 x86_64 GNU/Linux`),
      ]);
    }
    return ok([out("Linux")]);
  },
};

export const uptime: Command = {
  name: "uptime",
  summary: "how long the machine has been up, and the load average",
  usage: ["uptime"],
  run(_argv, { machine }) {
    const [one, five, fifteen] = machine.loadavg;
    return ok([
      out(
        ` 09:41:02 ${machine.uptime},  2 users,  load average: ` +
          `${one.toFixed(2)}, ${five.toFixed(2)}, ${fifteen.toFixed(2)}`,
      ),
    ]);
  },
};

export const free: Command = {
  name: "free",
  summary: "show memory usage",
  usage: ["free [-m] [-h]"],
  run(_argv, { machine }) {
    const m = machine.memory;
    const available = m.freeMb + m.buffMb;
    return ok([
      out(`${pad("", 15)}${padStart("total", 8)}${padStart("used", 8)}${padStart("free", 8)}${padStart("buff/cache", 12)}${padStart("available", 11)}`),
      out(
        `${pad("Mem:", 15)}${padStart(String(m.totalMb), 8)}${padStart(String(m.usedMb), 8)}` +
          `${padStart(String(m.freeMb), 8)}${padStart(String(m.buffMb), 12)}${padStart(String(available), 11)}`,
      ),
      out(`${pad("Swap:", 15)}${padStart("0", 8)}${padStart("0", 8)}${padStart("0", 8)}`),
    ]);
  },
};

export const env: Command = {
  name: "env",
  summary: "print the environment",
  usage: ["env"],
  run(_argv, { machine }) {
    return ok(Object.entries(machine.env).map(([key, value]) => out(`${key}=${value}`)));
  },
};

export const systemctl: Command = {
  name: "systemctl",
  summary: "inspect services",
  usage: [
    "systemctl status NAME",
    "systemctl is-active NAME",
    "systemctl list-units --failed",
    "",
    "Read only in this lab shell: start, stop and restart are refused, because",
    "a lab that can be solved by restarting things teaches restarting things.",
  ],
  run(argv, { machine }) {
    const verb = argv[0] ?? "status";
    if (["start", "stop", "restart", "reload", "enable", "disable"].includes(verb)) {
      return fail(`systemctl: ${verb} is not available in this lab. Find out why it is broken instead.`);
    }
    if (verb === "list-units") {
      const failedOnly = argv.includes("--failed");
      const units = machine.services.filter((s) => !failedOnly || s.state === "failed");
      const lines = [out(`${pad("UNIT", 28)}${pad("LOAD", 8)}${pad("ACTIVE", 10)}${pad("SUB", 10)}DESCRIPTION`)];
      for (const s of units) {
        lines.push(out(`${pad(`${s.name}.service`, 28)}${pad("loaded", 8)}${pad(s.state, 10)}${pad(s.sub, 10)}`));
      }
      lines.push(out(""));
      lines.push(out(`${units.length} loaded units listed.`));
      return ok(lines);
    }

    const name = (argv[1] ?? "").replace(/\.service$/, "");
    const service = machine.services.find((s) => s.name === name);
    if (!service) return fail(`Unit ${name}.service could not be found.`);

    if (verb === "is-active") {
      return { lines: [out(service.state)], code: service.state === "active" ? 0 : 3 };
    }
    const dot = service.state === "failed" ? "×" : service.state === "active" ? "●" : "○";
    const lines = [
      out(`${dot} ${service.name}.service - ${service.name}`),
      out(`     Loaded: loaded (/lib/systemd/system/${service.name}.service; ${service.enabled ? "enabled" : "disabled"})`),
      out(`     Active: ${service.state} (${service.sub}) since ${service.since}`),
      out(""),
      ...service.detail.map((line) => out(line)),
    ];
    return { lines, code: service.state === "active" ? 0 : 3 };
  },
};

export const journalctl: Command = {
  name: "journalctl",
  summary: "read the system journal",
  usage: [
    "journalctl -u UNIT [-n COUNT] [--since TIME] [-p err]",
    "",
    "  -u        one unit's messages",
    "  -n        the last COUNT lines (default 20)",
    "  --since   a substring match against the timestamp, so '09:' works",
    "  -p err    error priority and above",
    "",
    "Journal lines live in /var/log/journal/<unit>.log in this lab, so grep",
    "works on them too.",
  ],
  run(argv, { machine }) {
    const value = (flag: string) => {
      const index = argv.indexOf(flag);
      return index === -1 ? undefined : argv[index + 1];
    };
    const unit = (value("-u") ?? "").replace(/\.service$/, "");
    const count = Number(value("-n") ?? 20);
    const since = value("--since");
    const errorsOnly = value("-p") === "err" || argv.includes("-perr");

    const dir = machine.root.children?.var?.children?.log?.children?.journal;
    if (!dir?.children) return fail("No journal files were found on this machine.");

    const wanted = unit ? [`${unit}.log`] : Object.keys(dir.children);
    let lines: string[] = [];
    for (const name of wanted) {
      const node = dir.children[name];
      if (!node?.content) continue;
      lines = lines.concat(node.content.replace(/\n$/, "").split("\n"));
    }
    if (lines.length === 0) {
      return { lines: [out(`-- No entries --`)], code: unit ? 1 : 0 };
    }
    if (since) lines = lines.filter((line) => line.includes(since));
    if (errorsOnly) lines = lines.filter((line) => /\b(err|error|fail|failed|critical)\b/i.test(line));
    return ok(lines.slice(-Math.max(1, count)).map((line) => out(line)));
  },
};

export const dateCmd: Command = {
  name: "date",
  summary: "print the machine's idea of the time",
  usage: ["date"],
  run(_argv, { machine }) {
    return ok([out(machine.env.LAB_DATE ?? "Wed  2 Sep 09:41:02 UTC 2026")]);
  },
};

export const SYSTEM_COMMANDS: Command[] = [
  ps, whoami, id, uname, uptime, free, env, systemctl, journalctl, dateCmd,
];
