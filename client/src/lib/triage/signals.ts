/**
 * The detectors.
 *
 * These exist so the inbox data cannot lie about itself. Each message is
 * written with a `tells` list and a `redHerrings` list, and CI runs these
 * functions over the headers and asserts the two agree exactly, both ways: a
 * tell that is claimed but not present fails, and a tell that is present but
 * not claimed fails too. The second direction is the one that matters. It is
 * easy to write a legitimate message and accidentally give it a lookalike
 * domain, and nothing else in the build would notice.
 *
 * They are deliberately mechanical. Nothing here reads the message and forms
 * an opinion; every rule is a comparison between two fields a mail client
 * would show you. That is also what makes them teachable: the page shows the
 * reader the same comparison it used.
 */

import {
  domainOf,
  hostOf,
  registrableOf,
  type Message,
  type RedHerringId,
  type TellId,
} from "./types";

/**
 * Brands worth imitating, and the domains they actually send from.
 *
 * A short list on purpose. This is not a blocklist and it does not need to be
 * complete: it only needs to cover the brands the inbox impersonates, and CI
 * checks that every impersonation in the data is one this list can catch.
 */
export const KNOWN_BRANDS = [
  "microsoft.com",
  "office365.com",
  "paypal.com",
  "github.com",
  "okta.com",
  "docusign.net",
  "dropbox.com",
  "linkedin.com",
  "ups.com",
  "adobe.com",
  "northbay.edu",
  "orionsupply.com",
  "hartline.com",
];

/** Extensions that are the finding regardless of what is inside them. */
export const DANGEROUS_EXTENSIONS = [
  "iso",
  "img",
  "vhd",
  "htm",
  "html",
  "js",
  "vbs",
  "lnk",
  "scr",
  "exe",
  "bat",
  "cmd",
  "ps1",
  "docm",
  "xlsm",
  "xlam",
  "jar",
];

const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "ow.ly", "buff.ly", "rebrand.ly", "is.gd"];

const PAYMENT_PHRASES = [
  "bank details",
  "banking details",
  "account details have changed",
  "remittance",
  "wire the",
  "new account number",
  "updated our bank",
  "payment instructions",
  "sort code",
  "routing number",
  "invoice attached for payment",
];

const URGENCY_PHRASES = [
  "immediately",
  "within the hour",
  "before end of day",
  "as soon as you can",
  "urgent",
  "right away",
  "today or",
  "will be suspended",
  "will be closed",
  "final notice",
];

/** Levenshtein distance, iterative, two rows. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Is this hostname imitating one of the known brands?
 *
 * Two shapes, which are the two that actually turn up. A near miss on the
 * registrable domain catches `paypa1.com` and `rnicrosoft.com`. A brand label
 * appearing anywhere in a hostname whose registrable domain belongs to someone
 * else catches `microsoft-support.com` and `login.microsoft.com.verify-id.net`,
 * which are far more common and read as legitimate to almost everybody.
 */
export function lookalikeOf(host: string): string | null {
  const registrable = registrableOf(host);
  if (KNOWN_BRANDS.includes(registrable)) return null;
  for (const brand of KNOWN_BRANDS) {
    const brandLabel = brand.split(".")[0];
    if (editDistance(registrable, brand) <= 2) return brand;
    // The brand's name as its own label, or glued to another word with a
    // separator. `northbayschools.com` should not fire against `northbay.edu`
    // on a bare substring, so a boundary is required on both sides.
    const pattern = new RegExp(`(^|[.\\-_])${brandLabel}([.\\-_]|$)`, "i");
    if (pattern.test(host)) return brand;
  }
  return null;
}

const bodyText = (message: Message): string =>
  [message.subject, ...message.body].join(" ").toLowerCase();

const hasPhrase = (haystack: string, phrases: string[]): boolean =>
  phrases.some((phrase) => haystack.includes(phrase));

/**
 * True when the visible text of a link names a host at all.
 *
 * Only link text that claims a destination can contradict one. "Review
 * Document" makes no claim and cannot be a mismatch; "www.paypal.com/resolve"
 * makes a very specific one. The test is whether the text, read as a URL,
 * yields something shaped like a hostname.
 */
const textNamesAHost = (text: string): boolean => {
  const candidate = hostOf(text.trim());
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(candidate);
};

export function detectTells(message: Message): TellId[] {
  const found = new Set<TellId>();

  /*
    An authentication failure is only a finding when DMARC agrees it is one.

    SPF breaks whenever a message is forwarded and DKIM breaks whenever a
    mailing list rewrites a subject, and both happen constantly in mail nobody
    forged. DMARC is the domain owner saying which failures they stand behind:
    if either mechanism aligned and passed, DMARC passes and the other one
    failing is plumbing. Treating a bare SPF softfail as proof is how a triage
    queue fills up with forwarded newsletters.
  */
  const dmarcHeld = message.dmarc === "pass";
  if (!dmarcHeld && (message.spf === "fail" || message.spf === "softfail")) found.add("spf-fail");
  if (!dmarcHeld && message.dkim === "fail") found.add("dkim-fail");
  if (message.dmarc === "fail") found.add("dmarc-fail");

  const fromDomain = domainOf(message.fromAddress);

  /*
    A display name is a spoof when it asserts a sender the address does not
    support: an address inside it that does not match From, or a brand name
    whose domain is not the one this came from. A person's name is never a
    spoof on its own, because a display name being a person's name is the
    normal case.
  */
  const nameAddress = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.exec(message.displayName);
  if (nameAddress && domainOf(nameAddress[0]) !== fromDomain) found.add("display-name-spoof");
  for (const brand of KNOWN_BRANDS) {
    const label = brand.split(".")[0];
    const named = new RegExp(`(^|[^a-z])${label}([^a-z]|$)`, "i").test(message.displayName);
    if (named && registrableOf(fromDomain) !== brand) found.add("display-name-spoof");
  }

  if (lookalikeOf(fromDomain)) found.add("lookalike-domain");

  for (const link of message.links) {
    if (!textNamesAHost(link.text)) continue;
    const claimed = hostOf(link.text);
    const actual = hostOf(link.href);
    if (claimed && actual && registrableOf(claimed) !== registrableOf(actual)) {
      found.add("link-host-mismatch");
    }
  }

  for (const attachment of message.attachments) {
    const extension = attachment.filename.split(".").pop()?.toLowerCase() ?? "";
    if (DANGEROUS_EXTENSIONS.includes(extension)) found.add("dangerous-attachment");
  }

  return [...found].sort();
}

export function detectRedHerrings(message: Message): RedHerringId[] {
  const found = new Set<RedHerringId>();
  const fromDomain = registrableOf(domainOf(message.fromAddress));

  if (registrableOf(domainOf(message.returnPath)) !== fromDomain) found.add("envelope-mismatch");
  if (message.replyTo && registrableOf(domainOf(message.replyTo)) !== fromDomain) {
    found.add("reply-to-elsewhere");
  }
  if (registrableOf(domainOf(message.to)) !== fromDomain) found.add("external-sender");

  const text = bodyText(message);
  if (hasPhrase(text, PAYMENT_PHRASES)) found.add("payment-change-language");
  if (hasPhrase(text, URGENCY_PHRASES)) found.add("urgency-language");

  for (const link of message.links) {
    if (SHORTENERS.includes(hostOf(link.href))) found.add("shortened-link");
  }

  const partial =
    message.spf === "fail" || message.spf === "softfail" || message.dkim === "fail";
  if (message.dmarc === "pass" && partial) found.add("auth-partial");

  return [...found].sort();
}

export function detectSignals(message: Message): { tells: TellId[]; redHerrings: RedHerringId[] } {
  return { tells: detectTells(message), redHerrings: detectRedHerrings(message) };
}
