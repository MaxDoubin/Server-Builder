/**
 * Hash identifier.
 *
 * Identification here is structural, not magic: a hash is just bytes, and
 * two algorithms with the same digest length are indistinguishable from
 * the value alone. So this ranks candidates by length, alphabet and
 * prefix, and says plainly when several algorithms are tied. Anything that
 * claims to know for certain which algorithm produced a bare 32-character
 * hex string is guessing.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";

type Confidence = "high" | "medium" | "low";

interface Candidate {
  name: string;
  confidence: Confidence;
  note: string;
  /** Typical hashcat mode, where there is an unambiguous one. */
  hashcat?: string;
  john?: string;
}

interface Signature {
  /** Prefixed formats are identifiable outright. */
  prefix?: RegExp;
  /** Otherwise match on exact length plus alphabet. */
  length?: number;
  charset?: "hex" | "base64ish" | "any";
  candidates: Candidate[];
}

const HEX = /^[0-9a-fA-F]+$/;
const BASE64ISH = /^[A-Za-z0-9+/._$-]+={0,2}$/;

/*
  Prefixed formats first. These carry their own identifier, so they are
  the only cases where the answer is genuinely certain.
*/
const PREFIXED: Signature[] = [
  {
    prefix: /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/,
    candidates: [
      {
        name: "bcrypt",
        confidence: "high",
        note: "The cost factor is the two digits after the second dollar sign. Higher means slower, which is the point.",
        hashcat: "3200",
        john: "bcrypt",
      },
    ],
  },
  {
    prefix: /^\$argon2(id|i|d)\$/,
    candidates: [
      {
        name: "Argon2",
        confidence: "high",
        note: "Memory-hard by design. The parameters for memory, iterations and parallelism are encoded in the string itself.",
        hashcat: "34000 (argon2id)",
      },
    ],
  },
  {
    prefix: /^\$6\$/,
    candidates: [
      {
        name: "sha512crypt",
        confidence: "high",
        note: "The default on most modern Linux systems. Found in /etc/shadow.",
        hashcat: "1800",
        john: "sha512crypt",
      },
    ],
  },
  {
    prefix: /^\$5\$/,
    candidates: [
      {
        name: "sha256crypt",
        confidence: "high",
        note: "Found in /etc/shadow on systems configured for SHA-256.",
        hashcat: "7400",
        john: "sha256crypt",
      },
    ],
  },
  {
    prefix: /^\$1\$/,
    candidates: [
      {
        name: "md5crypt",
        confidence: "high",
        note: "Old Unix scheme. Still turns up on legacy systems and in older capture-the-flag material.",
        hashcat: "500",
        john: "md5crypt",
      },
    ],
  },
  {
    prefix: /^\$y\$|^\$7\$/,
    candidates: [
      {
        name: "yescrypt or scrypt",
        confidence: "high",
        note: "yescrypt ($y$) is the default on current Debian and Fedora. scrypt ($7$) is memory-hard in the same family.",
      },
    ],
  },
  {
    prefix: /^\{SSHA\}/,
    candidates: [
      {
        name: "Salted SHA-1 (LDAP)",
        confidence: "high",
        note: "An LDAP directory format. The salt is appended to the digest inside the Base64 blob.",
        hashcat: "111",
      },
    ],
  },
  {
    prefix: /^\$pbkdf2-sha\d+\$|^pbkdf2_sha\d+\$/,
    candidates: [
      {
        name: "PBKDF2",
        confidence: "high",
        note: "Iteration count is in the string. Django uses the pbkdf2_sha256$ form.",
      },
    ],
  },
];

/* Bare digests, identified by length and alphabet only. */
const BY_LENGTH: Signature[] = [
  {
    length: 32,
    charset: "hex",
    candidates: [
      {
        name: "MD5",
        confidence: "medium",
        note: "By far the most common 32-character hex hash. Broken for collision resistance since 2004, so it should never protect anything new.",
        hashcat: "0",
        john: "raw-md5",
      },
      {
        name: "NTLM",
        confidence: "medium",
        note: "Windows password hash. Identical in shape to MD5, so context decides: if it came out of a domain controller or a secretsdump, assume NTLM.",
        hashcat: "1000",
        john: "nt",
      },
      {
        name: "MD4",
        confidence: "low",
        note: "Rare on its own, but NTLM is MD4 underneath.",
        hashcat: "900",
      },
      {
        name: "LM",
        confidence: "low",
        note: "Legacy Windows. Usually appears as two 16-character halves and is case-insensitive, which is why it fell so easily.",
        hashcat: "3000",
      },
    ],
  },
  {
    length: 40,
    charset: "hex",
    candidates: [
      {
        name: "SHA-1",
        confidence: "medium",
        note: "Collision-broken in practice since 2017. Also what git uses for object IDs, so a 40-hex string in a repository context is probably a commit, not a password.",
        hashcat: "100",
        john: "raw-sha1",
      },
      {
        name: "RIPEMD-160",
        confidence: "low",
        note: "Same length as SHA-1. Turns up in Bitcoin address derivation.",
        hashcat: "6000",
      },
    ],
  },
  {
    length: 56,
    charset: "hex",
    candidates: [
      {
        name: "SHA-224",
        confidence: "medium",
        note: "A truncated SHA-256. Uncommon in the wild.",
        hashcat: "1300",
      },
      { name: "SHA3-224", confidence: "low", note: "Same length, different construction (Keccak)." },
    ],
  },
  {
    length: 64,
    charset: "hex",
    candidates: [
      {
        name: "SHA-256",
        confidence: "medium",
        note: "The current default for general-purpose hashing. Fast, which makes it a poor choice for passwords without a slow KDF around it.",
        hashcat: "1400",
        john: "raw-sha256",
      },
      { name: "SHA3-256", confidence: "low", note: "Keccak family, same digest length." },
      { name: "BLAKE2s-256", confidence: "low", note: "Faster than SHA-256 and same length." },
    ],
  },
  {
    length: 96,
    charset: "hex",
    candidates: [
      { name: "SHA-384", confidence: "medium", note: "A truncated SHA-512.", hashcat: "10800" },
      { name: "SHA3-384", confidence: "low", note: "Keccak family." },
    ],
  },
  {
    length: 128,
    charset: "hex",
    candidates: [
      {
        name: "SHA-512",
        confidence: "medium",
        note: "Common where a long digest is wanted. Note this is the bare digest, not the $6$ shadow format.",
        hashcat: "1700",
        john: "raw-sha512",
      },
      { name: "SHA3-512", confidence: "low", note: "Keccak family." },
      { name: "Whirlpool", confidence: "low", note: "Same length, rarely seen now.", hashcat: "6100" },
      { name: "BLAKE2b-512", confidence: "low", note: "Same length, different family." },
    ],
  },
  {
    length: 16,
    charset: "hex",
    candidates: [
      { name: "CRC-64 or an LM half", confidence: "low", note: "Too short to be a cryptographic digest. Often a checksum rather than a hash." },
    ],
  },
  {
    length: 8,
    charset: "hex",
    candidates: [
      {
        name: "CRC-32",
        confidence: "medium",
        note: "A checksum, not a hash. It detects accidental corruption and nothing else. Trivially forgeable.",
      },
    ],
  },
];

function classify(raw: string): { candidates: Candidate[]; reason: string } {
  const value = raw.trim();
  if (!value) return { candidates: [], reason: "" };

  for (const sig of PREFIXED) {
    if (sig.prefix && sig.prefix.test(value)) {
      return {
        candidates: sig.candidates,
        reason: "The format carries its own identifier, so this one is certain.",
      };
    }
  }

  // A dollar-delimited string we did not recognise is still clearly a
  // modular crypt format, which is worth saying rather than falling
  // through to a length guess that cannot apply.
  if (value.startsWith("$")) {
    return {
      candidates: [
        {
          name: "Unrecognised modular crypt format",
          confidence: "low",
          note: "The leading dollar sign means this is a structured hash string, but the identifier between the first two dollar signs is not one this tool knows.",
        },
      ],
      reason: "Structured format, unknown identifier.",
    };
  }

  const isHex = HEX.test(value);
  const match = BY_LENGTH.find(
    (sig) => sig.length === value.length && (sig.charset !== "hex" || isHex),
  );
  if (match) {
    return {
      candidates: match.candidates,
      reason: `${value.length} hexadecimal characters, so ${value.length * 4} bits. Several algorithms share that length, so these are ranked by how often each turns up.`,
    };
  }

  if (BASE64ISH.test(value) && value.length % 4 === 0) {
    return {
      candidates: [
        {
          name: "Base64-encoded digest",
          confidence: "low",
          note: `Decodes to about ${Math.floor((value.length * 3) / 4)} bytes. Decode it first, then identify the underlying digest by its byte length.`,
        },
      ],
      reason: "Base64 alphabet and a length divisible by four.",
    };
  }

  return {
    candidates: [],
    reason: isHex
      ? `${value.length} hex characters does not match any common digest length. It may be truncated, concatenated with a salt, or not a hash at all.`
      : "The character set does not look like hex or Base64, so this is probably not a bare digest.",
  };
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "border-[hsl(var(--brand-signal)/0.5)] text-[hsl(var(--brand-signal))]",
  medium: "border-[hsl(var(--brand-cyan)/0.5)] text-[hsl(var(--brand-cyan))]",
  low: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]",
};

const EXAMPLES = [
  { label: "MD5", value: "5f4dcc3b5aa765d61d8327deb882cf99" },
  { label: "SHA-1", value: "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8" },
  { label: "SHA-256", value: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8" },
  { label: "bcrypt", value: "$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy" },
  { label: "sha512crypt", value: "$6$rounds=5000$usesomesillystri$D4IrlXatmP7rx3P3InaxBeoomnAihCKRVQP22JZ6EY47Wc6BkroIuUUBOov1i.S5KPgErtP/EN5mcO.ChWQW21" },
];

export function HashIdentifier() {
  const [value, setValue] = useState("");
  const result = useMemo(() => classify(value), [value]);
  const trimmed = value.trim();

  return (
    <ToolShell
      slug="hash-identifier"
      notes={
        <>
          <p>
            Identifying a hash from the value alone is a matter of shape, not
            content. A digest is a fixed number of bytes with no header and
            no metadata, so two algorithms that produce the same length are
            genuinely indistinguishable. MD5 and NTLM are both 32
            hexadecimal characters, and nothing in the string itself will
            ever tell you which one you are holding.
          </p>
          <p>
            That is why context usually decides. A 32-character hex string
            pulled out of a Windows domain controller is almost certainly
            NTLM. The same string in a web application database is almost
            certainly MD5. A 40-character hex string inside a git repository
            is a commit identifier rather than a password. The value tells
            you the length; where you found it tells you the algorithm.
          </p>
          <p>
            The exception is the modular crypt formats, the ones beginning
            with a dollar sign. Those were designed to be self-describing:
            <code> $2y$</code> is bcrypt, <code> $6$</code> is sha512crypt,
            <code> $argon2id$</code> is Argon2. They also carry their
            parameters, so you can read the bcrypt cost factor or the PBKDF2
            iteration count straight out of the string. Those are the only
            cases where identification is certain rather than probable.
          </p>
          <p>
            One thing worth internalising while studying for competitions:
            fast hashes are the wrong tool for passwords. MD5, SHA-1 and
            SHA-256 are designed to be quick, and a modern GPU computes
            billions of them per second. bcrypt, scrypt, yescrypt and Argon2
            are deliberately slow and, in the later ones, deliberately
            memory-hungry, which is what makes large-scale guessing
            expensive rather than merely tedious.
          </p>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <ToolPanel title="Hash">
          <label
            htmlFor="hash-input"
            className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]"
          >
            Paste a hash
          </label>
          <textarea
            id="hash-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="5f4dcc3b5aa765d61d8327deb882cf99"
            className="w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setValue(ex.value)}
                className="inline-flex min-h-[28px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
              >
                {ex.label}
              </button>
            ))}
          </div>

          {trimmed ? (
            <dl className="mt-5 border-t border-[hsl(var(--brand-iron)/0.6)] pt-4">
              <div className="flex justify-between gap-4 py-1">
                <dt className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  Length
                </dt>
                <dd className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {trimmed.length} chars
                  {HEX.test(trimmed) ? ` · ${trimmed.length * 4} bits` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  Alphabet
                </dt>
                <dd className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {HEX.test(trimmed)
                    ? "hexadecimal"
                    : BASE64ISH.test(trimmed)
                      ? "base64-like"
                      : "mixed"}
                </dd>
              </div>
            </dl>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Candidates">
          {!trimmed ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              Paste a hash to see what could have produced it.
            </p>
          ) : (
            <>
              {result.reason ? (
                <p className="mb-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {result.reason}
                </p>
              ) : null}

              {result.candidates.length === 0 ? (
                <p
                  role="status"
                  className="font-mono-tight text-sm text-[hsl(var(--brand-amber))]"
                >
                  No confident match.
                </p>
              ) : (
                <ul className="space-y-3">
                  {result.candidates.map((c) => (
                    <li
                      key={c.name}
                      className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-display text-base text-[hsl(var(--brand-bone))]">
                          {c.name}
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-mono-tight text-[9px] uppercase tracking-[0.2em] ${CONFIDENCE_STYLE[c.confidence]}`}
                        >
                          {c.confidence} confidence
                        </span>
                      </div>
                      <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {c.note}
                      </p>
                      {c.hashcat || c.john ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {c.hashcat ? (
                            <>
                              <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                                hashcat -m {c.hashcat}
                              </span>
                              <CopyButton
                                value={`hashcat -m ${c.hashcat.split(" ")[0]} hash.txt wordlist.txt`}
                                label={`Copy hashcat command for ${c.name}`}
                              />
                            </>
                          ) : null}
                          {c.john ? (
                            <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                              john --format={c.john}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
