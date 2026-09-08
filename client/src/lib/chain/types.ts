/**
 * Certificate chain validation, shown as the sequence of checks it is.
 *
 * A browser reduces every one of these failures to a full-page interstitial
 * with one of about five error codes, and `openssl s_client` gives you a
 * verify code and a chain dump and leaves the joining up to you. Both hide
 * the thing that actually matters: which link failed, and which of the two
 * parties can fix it.
 *
 * That last part is the reason this exists. A missing intermediate is the
 * server operator's problem and shows up on some clients and not others. An
 * expired root is nobody's problem except the client's, and no amount of
 * reissuing the leaf will help. A name mismatch is a certificate request that
 * was wrong before it was ever signed. Same padlock, three different people.
 */

export type SigAlg = "sha256WithRSA" | "sha384WithECDSA" | "sha1WithRSA" | "md5WithRSA";

export interface Certificate {
  /** Short handle used in the data and the trace. */
  id: string;
  subject: string;
  issuer: string;
  /** Subject Alternative Names. A cert with none is a cert modern clients reject. */
  sans: string[];
  notBefore: string;
  notAfter: string;
  sigAlg: SigAlg;
  isCa: boolean;
  /**
   * Path length constraint on a CA certificate, or undefined for no limit.
   * A leaf that is not a CA cannot sign anything, which is the check that
   * stops a valid certificate for one host being used to mint others.
   */
  pathLen?: number;
  /** Set on a certificate the CA has revoked. */
  revoked?: boolean;
}

export interface TrustStore {
  name: string;
  /** Subjects of the roots this client trusts. */
  roots: string[];
  /** Clients that have not been updated in years still trust expired roots. */
  note?: string;
}

export type ChainFault =
  | "ok"
  | "not-yet-valid"
  | "expired"
  | "name-mismatch"
  | "missing-intermediate"
  | "untrusted-root"
  | "expired-in-chain"
  | "not-a-ca"
  | "revoked"
  | "weak-signature"
  | "out-of-order"
  | "self-signed";

export interface CheckStep {
  label: string;
  pass: boolean;
  detail: string;
  /** Who can fix it, when it fails. */
  owner?: "server" | "client" | "ca" | "requester";
}

export interface Validation {
  hostname: string;
  at: string;
  store: string;
  steps: CheckStep[];
  fault: ChainFault;
  /** One sentence for the ticket. */
  summary: string;
  /** Who has to act. */
  owner: "server" | "client" | "ca" | "requester" | "nobody";
}

/** Parse an ISO date to a comparable number. */
export const at = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

/**
 * Does a name match a certificate name, with one level of wildcard?
 *
 * `*.example.com` matches `www.example.com` and does NOT match
 * `example.com` or `a.b.example.com`. Both of those surprise people, and
 * both are in RFC 6125 for good reasons: a wildcard covers exactly one label.
 */
export function nameMatches(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const name = pattern.toLowerCase();
  if (!name.startsWith("*.")) return host === name;
  const suffix = name.slice(1); // ".example.com"
  if (!host.endsWith(suffix)) return false;
  const label = host.slice(0, host.length - suffix.length);
  return label.length > 0 && !label.includes(".");
}
