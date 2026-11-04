/**
 * ~/.ssh/config builder.
 *
 * Each Host block is edited as a small form and the config text, the warnings,
 * and the equivalent one-off ssh command all derive from the pure functions in
 * lib/toolkit/ssh-config-builder. Nothing is stored or sent anywhere; the form
 * lives in component state in this tab only.
 */

import { useMemo, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_BLOCKS,
  MAX_FORWARDS,
  type ControlMaster,
  type Forward,
  type ForwardKind,
  type HostBlock,
  type StrictHostKey,
  type Tone,
  configWarnings,
  emptyBlock,
  emptyForward,
  exampleBlocks,
  renderConfig,
  sshCommand,
  validateBlock,
} from "@/lib/toolkit/ssh-config-builder";
import { ToolPanel, ToolShell } from "./ToolShell";

const LABEL = "mb-1.5 block font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]";
const INPUT =
  "w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2.5 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHECK =
  "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]";
const ICON_BTN =
  "flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:opacity-40";
const ACTION =
  "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] px-4 font-mono-tight text-xs uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:opacity-40";
const PRE =
  "min-w-0 overflow-x-auto whitespace-pre rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-signal))]";
const ERR = "mt-1 font-mono-tight text-[0.625rem] leading-relaxed text-[hsl(var(--brand-danger))]";

const TONE_BOX: Record<Tone, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)]",
  info: "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)]",
  warn: "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)]",
  danger: "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)]",
};
const TONE_TEXT: Record<Tone, string> = {
  ok: "text-[hsl(var(--brand-signal))]",
  info: "text-[hsl(var(--brand-cyan))]",
  warn: "text-[hsl(var(--brand-amber))]",
  danger: "text-[hsl(var(--brand-danger))]",
};

const CONTROL_MASTER: ControlMaster[] = ["", "no", "yes", "ask", "auto", "autoask"];
const STRICT: StrictHostKey[] = ["", "yes", "accept-new", "ask", "no", "off"];
const FORWARD_KINDS: { value: ForwardKind; label: string }[] = [
  { value: "local", label: "Local (-L)" },
  { value: "remote", label: "Remote (-R)" },
  { value: "dynamic", label: "Dynamic (-D)" },
];

export function SshConfigBuilder() {
  const [blocks, setBlocks] = useState<HostBlock[]>(() => exampleBlocks());

  const config = useMemo(() => renderConfig(blocks), [blocks]);
  const warnings = useMemo(() => configWarnings(blocks), [blocks]);

  function patch(id: string, change: Partial<HostBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...change } : b)));
  }
  function patchForward(id: string, index: number, change: Partial<Forward>) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, forwards: b.forwards.map((f, i) => (i === index ? { ...f, ...change } : f)) }
          : b,
      ),
    );
  }
  function addForward(id: string) {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id && b.forwards.length < MAX_FORWARDS ? { ...b, forwards: [...b.forwards, emptyForward()] } : b,
      ),
    );
  }
  function removeForward(id: string, index: number) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, forwards: b.forwards.filter((_, i) => i !== index) } : b)),
    );
  }
  function addBlock() {
    setBlocks((prev) => (prev.length < MAX_BLOCKS ? [...prev, emptyBlock()] : prev));
  }
  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }
  function move(id: string, delta: number) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <ToolShell slug="ssh-config-builder">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ACTION} onClick={addBlock} disabled={blocks.length >= MAX_BLOCKS} data-testid="button-add-block">
            <Plus size={14} aria-hidden /> Add host block
          </button>
          <button type="button" className={ACTION} onClick={() => setBlocks(exampleBlocks())} data-testid="button-example">
            Load example
          </button>
          <button type="button" className={ACTION} onClick={() => setBlocks([emptyBlock()])} data-testid="button-clear">
            Clear all
          </button>
        </div>

        {blocks.map((block, index) => {
          const errors = validateBlock(block);
          const err = (field: string) => errors.find((e) => e.field === field)?.message ?? null;
          const command = sshCommand(block);
          return (
            <ToolPanel key={block.id}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                  Host block {index + 1}
                </h3>
                <div className="flex gap-1.5">
                  <button type="button" className={ICON_BTN} onClick={() => move(block.id, -1)} disabled={index === 0} aria-label={`Move host block ${index + 1} up`} data-testid={`button-up-${index}`}>
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button type="button" className={ICON_BTN} onClick={() => move(block.id, 1)} disabled={index === blocks.length - 1} aria-label={`Move host block ${index + 1} down`} data-testid={`button-down-${index}`}>
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button type="button" className={ICON_BTN} onClick={() => removeBlock(block.id)} disabled={blocks.length <= 1} aria-label={`Remove host block ${index + 1}`} data-testid={`button-remove-${index}`}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={LABEL} htmlFor={`${block.id}-host`}>Host pattern(s)</label>
                  <input id={`${block.id}-host`} className={INPUT} value={block.host} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="app, web*, or *" onChange={(e) => patch(block.id, { host: e.target.value })} data-testid={`input-host-${index}`} aria-invalid={err("host") !== null} />
                  {err("host") ? <p className={ERR} role="alert">{err("host")}</p> : null}
                </div>

                <div>
                  <label className={LABEL} htmlFor={`${block.id}-hostname`}>HostName</label>
                  <input id={`${block.id}-hostname`} className={INPUT} value={block.hostName} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="10.0.4.12 or host.example.com" onChange={(e) => patch(block.id, { hostName: e.target.value })} />
                </div>
                <div>
                  <label className={LABEL} htmlFor={`${block.id}-user`}>User</label>
                  <input id={`${block.id}-user`} className={INPUT} value={block.user} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="deploy" onChange={(e) => patch(block.id, { user: e.target.value })} />
                </div>
                <div>
                  <label className={LABEL} htmlFor={`${block.id}-port`}>Port</label>
                  <input id={`${block.id}-port`} className={INPUT} inputMode="numeric" value={block.port} spellCheck={false} placeholder="22" onChange={(e) => patch(block.id, { port: e.target.value })} aria-invalid={err("port") !== null} />
                  {err("port") ? <p className={ERR} role="alert">{err("port")}</p> : null}
                </div>
                <div>
                  <label className={LABEL} htmlFor={`${block.id}-proxyjump`}>ProxyJump</label>
                  <input id={`${block.id}-proxyjump`} className={INPUT} value={block.proxyJump} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="bastion or b1,b2" onChange={(e) => patch(block.id, { proxyJump: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL} htmlFor={`${block.id}-identity`}>IdentityFile</label>
                  <input id={`${block.id}-identity`} className={INPUT} value={block.identityFile} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="~/.ssh/id_ed25519" onChange={(e) => patch(block.id, { identityFile: e.target.value })} />
                </div>

                <label className={CHECK}>
                  <input type="checkbox" checked={block.identitiesOnly} onChange={(e) => patch(block.id, { identitiesOnly: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--brand-signal))]" />
                  IdentitiesOnly
                </label>
                <label className={CHECK}>
                  <input type="checkbox" checked={block.forwardAgent} onChange={(e) => patch(block.id, { forwardAgent: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--brand-signal))]" />
                  ForwardAgent
                </label>

                <div>
                  <label className={LABEL} htmlFor={`${block.id}-sai`}>ServerAliveInterval (s)</label>
                  <input id={`${block.id}-sai`} className={INPUT} inputMode="numeric" value={block.serverAliveInterval} spellCheck={false} placeholder="60" onChange={(e) => patch(block.id, { serverAliveInterval: e.target.value })} aria-invalid={err("serverAliveInterval") !== null} />
                  {err("serverAliveInterval") ? <p className={ERR} role="alert">{err("serverAliveInterval")}</p> : null}
                </div>
                <div>
                  <label className={LABEL} htmlFor={`${block.id}-strict`}>StrictHostKeyChecking</label>
                  <select id={`${block.id}-strict`} className={SELECT} value={block.strictHostKeyChecking} onChange={(e) => patch(block.id, { strictHostKeyChecking: e.target.value as StrictHostKey })}>
                    {STRICT.map((v) => <option key={v} value={v}>{v === "" ? "(default)" : v}</option>)}
                  </select>
                </div>

                <div>
                  <label className={LABEL} htmlFor={`${block.id}-cm`}>ControlMaster</label>
                  <select id={`${block.id}-cm`} className={SELECT} value={block.controlMaster} onChange={(e) => patch(block.id, { controlMaster: e.target.value as ControlMaster })}>
                    {CONTROL_MASTER.map((v) => <option key={v} value={v}>{v === "" ? "(default)" : v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL} htmlFor={`${block.id}-cp`}>ControlPersist</label>
                  <input id={`${block.id}-cp`} className={INPUT} value={block.controlPersist} spellCheck={false} placeholder="10m or yes" onChange={(e) => patch(block.id, { controlPersist: e.target.value })} aria-invalid={err("controlPersist") !== null} />
                  {err("controlPersist") ? <p className={ERR} role="alert">{err("controlPersist")}</p> : null}
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL} htmlFor={`${block.id}-cpath`}>ControlPath</label>
                  <input id={`${block.id}-cpath`} className={INPUT} value={block.controlPath} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="~/.ssh/cm-%r@%h:%p" onChange={(e) => patch(block.id, { controlPath: e.target.value })} />
                </div>
              </div>

              {/* Port forwards */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">Port forwards</h4>
                  <button type="button" className={ACTION} onClick={() => addForward(block.id)} disabled={block.forwards.length >= MAX_FORWARDS} data-testid={`button-add-forward-${index}`}>
                    <Plus size={14} aria-hidden /> Add forward
                  </button>
                </div>
                {block.forwards.length === 0 ? (
                  <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">No forwards. Add one to tunnel a port through this host.</p>
                ) : (
                  <ul className="space-y-2">
                    {block.forwards.map((f, fi) => (
                      <li key={fi} className="rounded-lg border border-[hsl(var(--brand-iron)/0.7)] bg-[hsl(var(--brand-obsidian)/0.3)] p-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
                          <select aria-label={`Forward ${fi + 1} type`} className={`${SELECT} sm:col-span-2`} value={f.kind} onChange={(e) => patchForward(block.id, fi, { kind: e.target.value as ForwardKind })}>
                            {FORWARD_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                          </select>
                          <input aria-label={`Forward ${fi + 1} bind address`} className={INPUT} value={f.bindAddress} spellCheck={false} placeholder="bind (optional)" onChange={(e) => patchForward(block.id, fi, { bindAddress: e.target.value })} />
                          <input aria-label={`Forward ${fi + 1} listen port`} className={INPUT} inputMode="numeric" value={f.listenPort} spellCheck={false} placeholder="port" onChange={(e) => patchForward(block.id, fi, { listenPort: e.target.value })} aria-invalid={err(`forward-${fi}-listen`) !== null} />
                          {f.kind !== "dynamic" ? (
                            <>
                              <input aria-label={`Forward ${fi + 1} destination host`} className={INPUT} value={f.destHost} spellCheck={false} placeholder="dest host" onChange={(e) => patchForward(block.id, fi, { destHost: e.target.value })} aria-invalid={err(`forward-${fi}-host`) !== null} />
                              <div className="flex gap-2">
                                <input aria-label={`Forward ${fi + 1} destination port`} className={INPUT} inputMode="numeric" value={f.destPort} spellCheck={false} placeholder="dest port" onChange={(e) => patchForward(block.id, fi, { destPort: e.target.value })} aria-invalid={err(`forward-${fi}-destport`) !== null} />
                                <button type="button" className={ICON_BTN} onClick={() => removeForward(block.id, fi)} aria-label={`Remove forward ${fi + 1}`}>
                                  <Trash2 size={14} aria-hidden />
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="flex gap-2 sm:col-span-3">
                              <span className="flex-1 self-center font-mono-tight text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]">SOCKS proxy, no destination</span>
                              <button type="button" className={ICON_BTN} onClick={() => removeForward(block.id, fi)} aria-label={`Remove forward ${fi + 1}`}>
                                <Trash2 size={14} aria-hidden />
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Equivalent one-off command */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">Equivalent one-off command</span>
                  <CopyButton value={command} label={`Copy ssh command for host block ${index + 1}`} testId={`button-copy-command-${index}`} />
                </div>
                <pre className={`${PRE} whitespace-pre-wrap break-words`} data-testid={`text-command-${index}`}>{command}</pre>
              </div>
            </ToolPanel>
          );
        })}

        {warnings.length ? (
          <ToolPanel title="Notes on this set">
            <ul className="space-y-2" data-testid="list-warnings">
              {warnings.map((w, i) => (
                <li key={i} className={`rounded-lg border p-3 ${TONE_BOX[w.tone]}`}>
                  <span className={`block font-mono-tight text-sm ${TONE_TEXT[w.tone]}`}>{w.title}</span>
                  <p className="mt-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">{w.detail}</p>
                </li>
              ))}
            </ul>
          </ToolPanel>
        ) : null}

        <ToolPanel title="Config file">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">Place this in ~/.ssh/config (mode 600).</span>
            <CopyButton value={config} label="Copy the whole config file" testId="button-copy-config" />
          </div>
          <pre className={PRE} data-testid="text-config">{config || "# add a Host block above"}</pre>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
