/**
 * The feed-reader recommendations behind /subscribe.
 *
 * Extracted from the page component so the prerenderer renders them into the
 * static HTML rather than shipping an empty document.
 */

export interface Reader {
  name: string;
  url: string;
  platforms: string;
  note: string;
}

/**
 * Five readers, one per situation, rather than a ranked list. The right
 * answer depends far more on which devices someone owns than on features.
 */
export const READERS: Reader[] = [
  {
    name: "NetNewsWire",
    url: "https://netnewswire.com",
    platforms: "Mac · iPhone · iPad",
    note: "Free and open source, with no account and no server in the middle. The easiest starting point on Apple hardware.",
  },
  {
    name: "Feedly",
    url: "https://feedly.com",
    platforms: "Web · iOS · Android",
    note: "Runs in a browser tab, so there is nothing to install and your subscriptions follow you between devices. Free tier, paid tiers above it.",
  },
  {
    name: "Inoreader",
    url: "https://www.inoreader.com",
    platforms: "Web · iOS · Android",
    note: "The same shape as Feedly with more control over sorting and filtering. Also has a free tier.",
  },
  {
    name: "Thunderbird",
    url: "https://www.thunderbird.net",
    platforms: "Windows · macOS · Linux",
    note: "The email client has a feed reader built in. Worth knowing if you would rather not add another app to check.",
  },
  {
    name: "Miniflux",
    url: "https://miniflux.app",
    platforms: "Self-hosted",
    note: "Open source and deliberately minimal. You run it on your own machine, which means nobody else holds your reading list.",
  },
];
