/**
 * NT hash generator.
 *
 * The NT hash is MD4 of the password encoded as UTF-16LE, with no salt. MD4
 * is not in Web Crypto, so it is computed here from RFC 1320. The page shows
 * the intermediate UTF-16LE bytes, the digest, and the line formats that
 * hashcat, John the Ripper and SAM dump tools use, which helps when checking
 * a lab exercise or a password audit. Everything is computed in this tab.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";
import { ntHash, utf16leBytes, bytesToHex } from "@/lib/toolkit/ntlm-hash-generator";

/** The LM hash of an empty password. Dump tools print it in the LM column
 * when no LM hash is stored, which is the default since Windows Vista. */
const EMPTY_LM = "aad3b435b51404eeaad3b435b51404ee";

const MAX_LEN = 256;

const EXAMPLES = ["password", "P@ssw0rd", "Spring2024!", "correct horse battery staple"];

/** Space the hex of the UTF-16LE bytes into readable pairs. */
function spacedHex(hex: string): string {
  return hex.replace(/(.{2})/g, "$1 ").trim();
}

export function NtlmHashGenerator() {
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("user");

  const tooLong = password.length > MAX_LEN;

  const computed = useMemo(() => {
    if (password === "" || tooLong) return null;
    const bytes = utf16leBytes(password);
    return { bytes, hex: bytesToHex(bytes), nt: ntHash(password) };
  }, [password, tooLong]);

  const nt = computed?.nt ?? "";
  // Colons separate the fields of the John and pwdump lines, and whitespace
  // would split the line for many parsers, so both are removed here.
  const userRaw = username.trim();
  const userClean = userRaw.replace(/[:\s]+/g, "");
  const userChanged = userClean !== userRaw;
  const user = userClean === "" ? "user" : userClean;
  const hashcat = nt;
  const john = `${user}:$NT$${nt}`;
  const pwdump = `${user}:1001:${EMPTY_LM}:${nt}:::`;

  const summary = tooLong
    ? `Password is longer than the ${MAX_LEN} character cap.`
    : computed
      ? "NT hash computed in this tab."
      : "Type a password to compute its NT hash.";

  return (
    <ToolShell slug="ntlm-hash-generator">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>

      <div className="space-y-6">
        <ToolPanel title="Password">
          <label
            htmlFor="password-input"
            className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
          >
            Password to hash
          </label>
          <input
            id="password-input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            maxLength={MAX_LEN + 1}
            aria-invalid={tooLong}
            aria-describedby={tooLong ? "password-error" : "password-hint"}
            placeholder="Spring2024!"
            data-testid="input-password"
            className="w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {tooLong ? (
            <p
              id="password-error"
              role="alert"
              className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              That is {password.length} UTF-16 code units. This tool caps input at {MAX_LEN}. MD4 itself accepts input of any length.
            </p>
          ) : (
            <p id="password-hint" className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The value is hashed as you type and is never stored or sent anywhere. Spaces and Unicode are kept exactly.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPassword(ex)}
                data-testid={`button-example-${ex.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                {ex}
              </button>
            ))}
            {password ? (
              <button
                type="button"
                onClick={() => setPassword("")}
                data-testid="button-clear"
                className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Clear
              </button>
            ) : null}
          </div>
        </ToolPanel>

        <ToolPanel title="Result">
          {computed ? (
            <div data-testid="output-nt">
              <ToolResult label="NT hash (hex)" value={computed.nt} testId="text-nt-hash" />
              <ToolResult label="UTF-16LE bytes" value={`${computed.bytes.length} bytes`} />
              <div className="mt-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    UTF-16LE encoding
                  </span>
                  <CopyButton value={computed.hex} label="Copy the UTF-16LE bytes" />
                </div>
                <div className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian))] p-3">
                  <p className="break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-cyan))]">
                    {spacedHex(computed.hex)}
                  </p>
                </div>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Each UTF-16 code unit becomes two little-endian bytes, so an ASCII letter is followed by a zero byte, and a character outside the Basic Multilingual Plane, such as an emoji, takes four bytes as a surrogate pair. MD4 runs over exactly these bytes with no trailing null.
                </p>
              </div>
            </div>
          ) : (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              {tooLong ? "Shorten the password to see its hash." : "Type a password to see its NT hash."}
            </p>
          )}
        </ToolPanel>

        {computed ? (
          <ToolPanel title="Cracking formats">
            <div className="mb-5">
              <label
                htmlFor="username-input"
                className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
              >
                Account name, used in the John and pwdump lines
              </label>
              <input
                id="username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                maxLength={128}
                placeholder="user"
                data-testid="input-username"
                aria-describedby={userChanged ? "username-note" : undefined}
                className="w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
              {userChanged ? (
                <p
                  id="username-note"
                  className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]"
                >
                  Colons and spaces were removed from the account name, because they would break the colon-separated lines below.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              {[
                { name: "hashcat (-m 1000)", value: hashcat, note: "The bare NT hash, 32 hex characters. Hash mode 1000 is NTLM." },
                { name: "John the Ripper (nt)", value: john, note: "Account name, a colon, then the hash with the $NT$ tag that marks John's nt format." },
                { name: "pwdump / secretsdump", value: pwdump, note: "Account name, RID (1001 here as a placeholder), the LM column holding the empty-password LM hash, then the NT hash. This is the layout SAM and NTDS dump tools print." },
              ].map((fmt) => (
                <div
                  key={fmt.name}
                  className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      {fmt.name}
                    </span>
                    <CopyButton value={fmt.value} label={`Copy the ${fmt.name} line`} />
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <code className="block whitespace-pre break-normal font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                      {fmt.value}
                    </code>
                  </div>
                  <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {fmt.note}
                  </p>
                </div>
              ))}
            </div>
          </ToolPanel>
        ) : null}

        <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] p-5">
          <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
            The hash is the credential
          </div>
          <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            NTLM authentication proves knowledge of the NT hash, not of the password, so a stolen NT hash works in place of the password against services that accept NTLM. That is pass-the-hash. The NetNTLMv2 response sent during a network logon is a different value: it is derived from this hash, the account name and fresh challenges, so it changes on every logon and is not the string shown here.
          </p>
        </div>
      </div>
    </ToolShell>
  );
}
