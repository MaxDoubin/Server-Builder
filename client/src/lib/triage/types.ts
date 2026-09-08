/**
 * A triage inbox: messages with their real headers, and a verdict to give.
 *
 * WHY THIS IS TWO LISTS AND NOT ONE. Every message carries `tells`, the hard
 * signals that settle it, and `redHerrings`, the things that look alarming
 * and prove nothing. That split is the whole exercise. Anyone can learn to
 * flinch at the word "urgent"; the skill that matters is knowing that a
 * mismatched envelope sender is how nearly all bulk mail works, that a
 * Reply-To pointing somewhere else is how every ticketing system works, and
 * that a supplier really does sometimes change their bank details.
 *
 * A triage exercise that only contains obvious phish trains people to raise
 * tickets on their own newsletters. So four of these are genuine mail wearing
 * two or three red herrings, and calling one of those a phish costs you the
 * same as missing a real one.
 *
 * HOW THE DATA IS KEPT HONEST. Both lists are derived mechanically from the
 * headers by `detectSignals` in ./signals, and CI asserts that what is written
 * down equals what the detector finds, in both directions. A hand-written
 * analysis that drifts from its own artefact is the failure mode here, and it
 * is invisible in review: the message still renders, the verdict still shows,
 * and the reader is quietly taught something untrue.
 */

export type AuthResult = "pass" | "fail" | "softfail" | "none";

/** The hard signals. Any one of these settles a message on its own. */
export type TellId =
  | "spf-fail"
  | "dkim-fail"
  | "dmarc-fail"
  | "display-name-spoof"
  | "lookalike-domain"
  | "link-host-mismatch"
  | "dangerous-attachment";

/** The soft ones. Present in plenty of legitimate mail; proof of nothing. */
export type RedHerringId =
  | "envelope-mismatch"
  | "reply-to-elsewhere"
  | "payment-change-language"
  | "urgency-language"
  | "external-sender"
  | "shortened-link"
  | "auth-partial";

export interface MailLink {
  /** What the reader sees in the body. */
  text: string;
  /** Where it actually goes. */
  href: string;
}

export interface Attachment {
  filename: string;
  contentType: string;
  sizeKb: number;
}

export interface Message {
  id: string;
  subject: string;
  /** The From display name, which anyone can set to anything. */
  displayName: string;
  /** The From address, which is also just a header. */
  fromAddress: string;
  /** The envelope sender, which is what SPF is actually checked against. */
  returnPath: string;
  replyTo?: string;
  to: string;
  /** Rendered in the list and the header pane. Not parsed. */
  date: string;
  spf: AuthResult;
  dkim: AuthResult;
  dmarc: AuthResult;
  /** Outermost hop first, the way a mail client shows it. */
  received: string[];
  body: string[];
  links: MailLink[];
  attachments: Attachment[];
  verdict: "phish" | "legitimate";
  tells: TellId[];
  redHerrings: RedHerringId[];
  /** What a competent analyst would write in the ticket. */
  analysis: string[];
}

export const TELL_LABEL: Record<TellId, string> = {
  "spf-fail": "SPF did not pass",
  "dkim-fail": "DKIM did not verify",
  "dmarc-fail": "DMARC failed",
  "display-name-spoof": "Display name claims a different sender",
  "lookalike-domain": "Sending domain imitates a real one",
  "link-host-mismatch": "A link goes somewhere other than it says",
  "dangerous-attachment": "Attachment type is a delivery mechanism",
};

export const TELL_NOTE: Record<TellId, string> = {
  "spf-fail":
    "The envelope sender's domain does not authorise the host that sent this. On its own that is sometimes a forwarding artefact, which is why DMARC exists to say what to do about it.",
  "dkim-fail":
    "The signature does not verify against the domain's published key. Either the message was altered after signing or it was never signed by that domain.",
  "dmarc-fail":
    "The domain published a policy and this message does not satisfy it. This is the one authentication result the domain owner has explicitly asked you to act on.",
  "display-name-spoof":
    "The name in the From line asserts an identity the address does not. Most clients show the name and hide the address, which is exactly why this works.",
  "lookalike-domain":
    "The registrable domain is not the brand's, whether by a character substitution or by hanging the brand off a domain someone else owns.",
  "link-host-mismatch":
    "The visible text names one host and the href points at another. In a text-only reading of the message this is invisible.",
  "dangerous-attachment":
    "The extension is one that executes, mounts, or renders a credential form locally. The content does not matter; the type is the finding.",
};

export const HERRING_LABEL: Record<RedHerringId, string> = {
  "envelope-mismatch": "Envelope sender differs from the From address",
  "reply-to-elsewhere": "Reply-To points at a different domain",
  "payment-change-language": "Asks to change payment details",
  "urgency-language": "Presses for speed",
  "external-sender": "Arrived from outside the organisation",
  "shortened-link": "Uses a link shortener",
  "auth-partial": "One authentication check failed, DMARC still passed",
};

export const HERRING_NOTE: Record<RedHerringId, string> = {
  "envelope-mismatch":
    "This is how nearly all bulk and third-party mail works. Your payroll provider sends as your company and bounces to themselves. Treat it as a fact about the plumbing, not a finding.",
  "reply-to-elsewhere":
    "Every ticketing system does this, and so does every mailing list. It is worth reading, never worth acting on alone.",
  "payment-change-language":
    "Suppliers do change banks. The control is calling a number you already had, not refusing the category of request.",
  "urgency-language":
    "Real work is often urgent. Urgency raises the value of checking; it is not evidence of anything.",
  "external-sender":
    "The banner means the message came from outside. On a normal day most of your mail did.",
  "shortened-link":
    "Marketing tooling shortens links by default. It hides the destination, which is a reason to expand it, not a verdict.",
  "auth-partial":
    "SPF breaks on forwarding and DKIM breaks on mailing lists, every day, in mail nobody forged. DMARC exists precisely so that one of the two failing is survivable: if the other one passed and aligned, the domain owner's own policy is satisfied and there is nothing here to act on.",
};

/** Split a mail address into its domain, lowercased. Empty string if there is none. */
export const domainOf = (address: string): string => {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).trim().toLowerCase().replace(/>$/, "");
};

/**
 * The registrable domain, taken as the last two labels.
 *
 * That is wrong for `example.co.uk` and every other multi-label suffix, and
 * getting it right needs the public suffix list, which is a 200KB download to
 * decide something this page could simply avoid. Every domain in the inbox is
 * a two-label one, and CI checks that, so the simple rule is exact here.
 */
export const registrableOf = (host: string): string => {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  return labels.slice(-2).join(".");
};

/** The host part of a URL, without a scheme, port, path or credentials. */
export const hostOf = (url: string): string => {
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const withoutCreds = withoutScheme.slice(withoutScheme.indexOf("@") + 1);
  return withoutCreds.split(/[/?#:]/)[0].toLowerCase();
};
