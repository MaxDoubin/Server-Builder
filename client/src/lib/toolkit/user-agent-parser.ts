/**
 * Rules-based User-Agent parsing.
 *
 * Pure functions, no React or DOM. There is no device database here and no
 * attempt at one: the rules below read what the string says, in the order a
 * browser's string has to be read, because nearly every token in a modern UA
 * is borrowed from another browser for compatibility. Chrome says Safari,
 * Edge says Chrome, everything says Mozilla. The first rule that matches the
 * most specific token wins.
 *
 * The grammar is RFC 9110 section 10.1.5:
 *
 *   User-Agent = product *( RWS ( product / comment ) )
 *   product    = token [ "/" product-version ]
 *
 * with comments from section 5.6.5: parenthesized, nestable, and allowing a
 * backslash quoted-pair. Real strings break the grammar often (spaces inside
 * product names, unbalanced parentheses), so the tokenizer is lenient and
 * reports what it had to forgive.
 *
 * Client Hints headers are RFC 8941 structured fields; Sec-CH-UA is a list
 * of strings with a v parameter.
 */

/* --------------------------------------------------------------- limits */

/** Most entries read from one paste. */
export const MAX_ENTRIES = 500;
/**
 * Longest single UA analyzed. Apache's default LimitRequestFieldSize is 8190
 * bytes, so a longer header would not reach most servers' logs intact.
 */
export const MAX_UA_LENGTH = 8190;
/** Whole paste cap, in characters. */
export const MAX_INPUT_CHARS = 2_000_000;
/** Tokens kept for display from one string. */
const MAX_TOKENS = 200;
/** Comment nesting followed before further parentheses are treated as text. */
const MAX_DEPTH = 16;

/* ---------------------------------------------------------------- types */

export type Tone = "ok" | "info" | "warn" | "danger";
export interface Finding {
  tone: Tone;
  text: string;
}

export type DeviceType = "desktop" | "mobile" | "tablet" | "tv" | "console" | "bot" | "unknown";

export type ClientKind =
  | "search crawler"
  | "AI crawler"
  | "crawler"
  | "SEO crawler"
  | "social preview"
  | "archiver"
  | "uptime monitor"
  | "security scanner"
  | "internet scanner"
  | "automation"
  | "command-line tool"
  | "HTTP library"
  | "API client";

export interface Named {
  name: string;
  version: string | null;
}

export interface OsInfo extends Named {
  note: string | null;
}

export interface BotInfo extends Named {
  kind: ClientKind;
  operator: string;
  verify: string | null;
}

export interface Token {
  kind: "product" | "comment" | "word";
  text: string;
  name: string | null;
  version: string | null;
  /** Semicolon-separated parts of a comment. */
  parts: string[];
  note: string | null;
}

export interface UaAnalysis {
  ua: string;
  tokens: Token[];
  tokenizerNote: string | null;
  browser: Named | null;
  engine: Named | null;
  os: OsInfo | null;
  arch: string | null;
  device: { type: DeviceType; model: string | null };
  bot: BotInfo | null;
  /** Chrome User-Agent Reduction effects visible in this string. */
  reduced: string[];
  findings: Finding[];
}

/* --------------------------------------------------------------- helpers */

/** First capture group of the first match, "" when the group did not take part, null on no match. */
function m1(re: RegExp, s: string): string | null {
  const m = re.exec(s);
  return m ? (m[1] ?? "") : null;
}

function clip(s: string | null, n = 40): string | null {
  if (s === null) return null;
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

/* ------------------------------------------------------------- tokenizer */

const PRODUCT_NOTES: Record<string, string> = {
  Mozilla:
    "Compatibility prefix. Netscape's own token, copied by every major browser so that servers sniffing for it would send the full site. It says nothing about the browser.",
  AppleWebKit:
    "WebKit build number. Chromium browsers report 537.36 permanently and Safari has reported 605.1.15 for years, so it no longer tracks a real build.",
  Chrome: "Chromium version. From Chrome 101 the three numbers after the major version read 0.0.0.",
  Chromium: "Chromium version, sent by some Linux builds instead of Chrome.",
  HeadlessChrome: "Chrome running in headless mode, the usual way automation drives it.",
  Safari:
    "Compatibility token. Chrome and other Blink browsers send it too, mirroring the WebKit number; in real Safari the browser version is the Version token.",
  Version: "The browser's own version in Safari, old Android browsers, Android WebView and Presto Opera.",
  Gecko: "Gecko marker. Desktop Firefox sends the fixed placeholder date 20100101 here rather than a build date.",
  Firefox: "Firefox version.",
  Edg: "Chromium-based Microsoft Edge and its real version.",
  EdgA: "Microsoft Edge for Android.",
  EdgiOS: "Microsoft Edge for iOS, which runs on WebKit.",
  Edge: "Legacy Microsoft Edge (EdgeHTML engine, retired in 2021).",
  OPR: "Chromium-based Opera.",
  CriOS: "Chrome for iOS, which runs on WebKit like every iOS browser.",
  FxiOS: "Firefox for iOS, which runs on WebKit.",
  Mobile: "An iOS build token or a mobile marker. Modern Safari sends a fixed value here.",
  Trident: "Internet Explorer's rendering engine.",
  Presto: "Opera's own engine before it moved to Blink in 2013.",
  SamsungBrowser: "Samsung Internet, a Chromium browser.",
  YaBrowser: "Yandex Browser, a Chromium browser.",
  Vivaldi: "Vivaldi, a Chromium browser.",
  Electron: "An Electron desktop app: Chromium embedded in an application.",
};

/**
 * Splits a UA into products, comments and stray words. Linear in the input;
 * nesting deeper than MAX_DEPTH is kept as comment text.
 */
export function tokenize(ua: string): { tokens: Token[]; note: string | null } {
  const tokens: Token[] = [];
  const notes: string[] = [];
  let i = 0;
  const n = ua.length;
  let firstComment = true;

  while (i < n && tokens.length < MAX_TOKENS) {
    const c = ua[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "(") {
      let depth = 0;
      let j = i;
      let body = "";
      for (; j < n; j++) {
        const ch = ua[j];
        if (ch === "\\" && j + 1 < n) {
          body += ua[j + 1];
          j++;
          continue;
        }
        if (ch === "(") {
          depth++;
          if (depth > 1) body += ch;
          if (depth > MAX_DEPTH) depth--; // stop counting; treat as text
          continue;
        }
        if (ch === ")") {
          depth--;
          if (depth === 0) break;
          body += ch;
          continue;
        }
        body += ch;
      }
      if (j >= n) notes.push("A comment opened with ( is never closed, so everything after it was read as one comment.");
      const text = ua.slice(i, Math.min(j + 1, n));
      const parts = body.split(";").map((p) => p.trim()).filter(Boolean);
      let note: string | null = null;
      if (/KHTML, like Gecko/i.test(body)) {
        note = "WebKit grew out of KDE's KHTML engine. \"like Gecko\" asks servers that sniff for Firefox's engine to treat it the same way.";
      } else if (/^compatible\b/i.test(parts[0] ?? "")) {
        note = "\"compatible\" is the 1990s convention for a client claiming Mozilla compatibility without being Netscape. Crawlers and old Internet Explorer use it.";
      } else if (firstComment) {
        note = "Platform: operating system, architecture, device and sometimes locale.";
      }
      firstComment = false;
      tokens.push({ kind: "comment", text, name: null, version: null, parts, note });
      i = j + 1;
      continue;
    }
    if (c === ")") {
      notes.push("A closing parenthesis has no matching opening one.");
      i++;
      continue;
    }
    let j = i;
    while (j < n && ua[j] !== " " && ua[j] !== "\t" && ua[j] !== "(") j++;
    const word = ua.slice(i, j);
    const slash = word.indexOf("/");
    if (slash > 0) {
      const name = word.slice(0, slash);
      tokens.push({
        kind: "product",
        text: word,
        name,
        version: word.slice(slash + 1),
        parts: [],
        note: PRODUCT_NOTES[name] ?? null,
      });
    } else {
      tokens.push({ kind: "word", text: word, name: null, version: null, parts: [], note: null });
    }
    i = j;
  }
  if (i < n && tokens.length >= MAX_TOKENS) notes.push(`Only the first ${MAX_TOKENS} tokens are listed.`);
  return { tokens, note: notes.length ? [...new Set(notes)].join(" ") : null };
}

/* ----------------------------------------------------------- bots, tools */

const GOOGLE_VERIFY =
  "Reverse DNS on the source IP must end in googlebot.com, google.com or googleusercontent.com, and a forward lookup of that name must return the same IP. Google also publishes its crawler IP ranges.";
const BING_VERIFY =
  "Reverse DNS on the source IP must end in search.msn.com, confirmed by a forward lookup. Microsoft also publishes Bingbot's IP ranges.";
const APPLE_VERIFY = "Reverse DNS on the source IP must end in applebot.apple.com, confirmed by a forward lookup.";
const YANDEX_VERIFY = "Reverse DNS on the source IP must end in yandex.ru, yandex.net or yandex.com, confirmed by a forward lookup.";
const BAIDU_VERIFY = "Reverse DNS on the source IP must end in baidu.com or baidu.jp, confirmed by a forward lookup.";

interface BotRule {
  /** At most one capture group, holding the version. */
  re: RegExp;
  name: string;
  kind: ClientKind;
  operator: string;
  verify?: string;
}

/**
 * Ordered: the scanners and automation first, because they sometimes wrap a
 * browser-looking string; then crawlers, because several of them embed an
 * HTTP library's name (LinkedInBot says Apache-HttpClient); then libraries.
 */
const BOT_RULES: BotRule[] = [
  // Security scanners and attack tools.
  { re: /sqlmap(?:\/([\w.#-]+))?/i, name: "sqlmap", kind: "security scanner", operator: "sqlmap, the automatic SQL injection tool" },
  { re: /Nikto(?:\/([\d.]+))?/i, name: "Nikto", kind: "security scanner", operator: "Nikto web server scanner" },
  { re: /Nmap Scripting Engine/i, name: "Nmap NSE", kind: "security scanner", operator: "Nmap's scripting engine (the http-* scripts)" },
  { re: /\bNuclei\b(?:\/v?([\d.]+))?/i, name: "Nuclei", kind: "security scanner", operator: "ProjectDiscovery Nuclei, a template-based scanner" },
  { re: /WPScan(?: v([\d.]+))?/i, name: "WPScan", kind: "security scanner", operator: "WPScan WordPress scanner" },
  { re: /gobuster(?:\/([\d.]+))?/i, name: "gobuster", kind: "security scanner", operator: "gobuster, directory and DNS brute forcing" },
  { re: /feroxbuster(?:\/([\d.]+))?/i, name: "feroxbuster", kind: "security scanner", operator: "feroxbuster, recursive content discovery" },
  { re: /Fuzz Faster U Fool(?: v([\w.-]+))?/i, name: "ffuf", kind: "security scanner", operator: "ffuf web fuzzer" },
  { re: /DirBuster(?:-([\w.-]+))?/i, name: "DirBuster", kind: "security scanner", operator: "OWASP DirBuster" },
  { re: /\(Hydra\)/i, name: "THC Hydra", kind: "security scanner", operator: "Hydra login brute forcer" },
  { re: /Wfuzz(?:\/([\d.]+))?/i, name: "Wfuzz", kind: "security scanner", operator: "Wfuzz web fuzzer" },
  { re: /WhatWeb(?:\/([\d.]+))?/i, name: "WhatWeb", kind: "security scanner", operator: "WhatWeb technology fingerprinting" },
  { re: /Arachni(?:\/v?([\d.]+))?/i, name: "Arachni", kind: "security scanner", operator: "Arachni web scanner" },
  { re: /w3af\.org/i, name: "w3af", kind: "security scanner", operator: "w3af web scanner" },
  { re: /\bNessus\b/i, name: "Nessus", kind: "security scanner", operator: "Tenable Nessus" },
  { re: /OpenVAS/i, name: "OpenVAS", kind: "security scanner", operator: "Greenbone OpenVAS" },
  { re: /Acunetix/i, name: "Acunetix", kind: "security scanner", operator: "Acunetix web scanner" },
  // Internet-wide scanners and measurement.
  { re: /masscan(?:\/([\d.]+))?/i, name: "masscan", kind: "internet scanner", operator: "masscan, banner grabbing at internet scale" },
  { re: /zgrab(?:\/([\w.]+))?/i, name: "ZGrab", kind: "internet scanner", operator: "ZGrab, the ZMap project's application-layer scanner" },
  { re: /CensysInspect(?:\/([\d.]+))?/i, name: "CensysInspect", kind: "internet scanner", operator: "Censys internet-wide scanning" },
  { re: /Expanse,? a Palo Alto Networks company/i, name: "Expanse", kind: "internet scanner", operator: "Palo Alto Networks Cortex Xpanse" },
  // Automation.
  { re: /HeadlessChrome(?:\/([\d.]+))?/, name: "Headless Chrome", kind: "automation", operator: "Chrome in headless mode, how Puppeteer and Playwright usually run it" },
  { re: /PhantomJS(?:\/([\d.]+))?/i, name: "PhantomJS", kind: "automation", operator: "PhantomJS headless WebKit (no longer developed)" },
  { re: /Chrome-Lighthouse/i, name: "Lighthouse", kind: "automation", operator: "Google Lighthouse audit, as run by PageSpeed Insights" },
  // Google, most specific first.
  { re: /Google-InspectionTool(?:\/([\d.]+))?/i, name: "Google-InspectionTool", kind: "search crawler", operator: "Google Search Console URL inspection and the Rich Results Test", verify: GOOGLE_VERIFY },
  { re: /AdsBot-Google(?:-Mobile)?/i, name: "AdsBot-Google", kind: "search crawler", operator: "Google Ads landing page checks", verify: GOOGLE_VERIFY },
  { re: /Mediapartners-Google/i, name: "Mediapartners-Google", kind: "search crawler", operator: "Google AdSense", verify: GOOGLE_VERIFY },
  { re: /Storebot-Google(?:\/([\d.]+))?/i, name: "Storebot-Google", kind: "search crawler", operator: "Google Shopping", verify: GOOGLE_VERIFY },
  { re: /GoogleOther(?:-Image|-Video)?(?:\/([\d.]+))?/i, name: "GoogleOther", kind: "crawler", operator: "Google, for crawls outside Search", verify: GOOGLE_VERIFY },
  { re: /Googlebot-Image(?:\/([\d.]+))?/i, name: "Googlebot-Image", kind: "search crawler", operator: "Google Images", verify: GOOGLE_VERIFY },
  { re: /Googlebot-Video(?:\/([\d.]+))?/i, name: "Googlebot-Video", kind: "search crawler", operator: "Google video search", verify: GOOGLE_VERIFY },
  { re: /Googlebot-News/i, name: "Googlebot-News", kind: "search crawler", operator: "Google News", verify: GOOGLE_VERIFY },
  { re: /Googlebot(?:\/([\d.]+))?/i, name: "Googlebot", kind: "search crawler", operator: "Google Search", verify: GOOGLE_VERIFY },
  // Other search engines.
  { re: /BingPreview(?:\/([\d.]+))?/i, name: "BingPreview", kind: "search crawler", operator: "Microsoft Bing page snapshots", verify: BING_VERIFY },
  { re: /bingbot(?:\/([\d.]+))?/i, name: "Bingbot", kind: "search crawler", operator: "Microsoft Bing", verify: BING_VERIFY },
  { re: /DuckDuckBot(?:-Https)?(?:\/([\d.]+))?/i, name: "DuckDuckBot", kind: "search crawler", operator: "DuckDuckGo" },
  { re: /YandexBot(?:\/([\d.]+))?/i, name: "YandexBot", kind: "search crawler", operator: "Yandex", verify: YANDEX_VERIFY },
  { re: /Baiduspider(?:-render)?(?:\/([\d.]+))?/i, name: "Baiduspider", kind: "search crawler", operator: "Baidu", verify: BAIDU_VERIFY },
  { re: /Applebot(?:\/([\d.]+))?/i, name: "Applebot", kind: "search crawler", operator: "Apple (Siri and Spotlight suggestions)", verify: APPLE_VERIFY },
  { re: /PetalBot/i, name: "PetalBot", kind: "search crawler", operator: "Huawei Petal Search" },
  // AI crawlers and fetchers.
  { re: /GPTBot(?:\/([\d.]+))?/i, name: "GPTBot", kind: "AI crawler", operator: "OpenAI, collecting training data" },
  { re: /OAI-SearchBot(?:\/([\d.]+))?/i, name: "OAI-SearchBot", kind: "AI crawler", operator: "OpenAI, for ChatGPT search" },
  { re: /ChatGPT-User(?:\/([\d.]+))?/i, name: "ChatGPT-User", kind: "AI crawler", operator: "OpenAI, fetching a page a ChatGPT user asked for" },
  { re: /ClaudeBot(?:\/([\d.]+))?/i, name: "ClaudeBot", kind: "AI crawler", operator: "Anthropic" },
  { re: /Claude-User(?:\/([\d.]+))?/i, name: "Claude-User", kind: "AI crawler", operator: "Anthropic, fetching a page a Claude user asked for" },
  { re: /Claude-SearchBot(?:\/([\d.]+))?/i, name: "Claude-SearchBot", kind: "AI crawler", operator: "Anthropic, for search" },
  { re: /PerplexityBot(?:\/([\d.]+))?/i, name: "PerplexityBot", kind: "AI crawler", operator: "Perplexity" },
  { re: /Perplexity-User(?:\/([\d.]+))?/i, name: "Perplexity-User", kind: "AI crawler", operator: "Perplexity, fetching a page a user asked for" },
  { re: /meta-externalagent(?:\/([\d.]+))?/i, name: "meta-externalagent", kind: "AI crawler", operator: "Meta, for AI training and indexing" },
  { re: /Bytespider/i, name: "Bytespider", kind: "AI crawler", operator: "ByteDance" },
  { re: /Amazonbot(?:\/([\d.]+))?/i, name: "Amazonbot", kind: "crawler", operator: "Amazon" },
  { re: /CCBot(?:\/([\d.]+))?/i, name: "CCBot", kind: "archiver", operator: "Common Crawl, an open web corpus widely used to train language models" },
  // Link previews.
  { re: /facebookexternalhit(?:\/([\d.]+))?/i, name: "facebookexternalhit", kind: "social preview", operator: "Meta link previews (Facebook, Instagram, Messenger)" },
  { re: /TelegramBot/i, name: "TelegramBot", kind: "social preview", operator: "Telegram link previews" },
  { re: /Twitterbot(?:\/([\d.]+))?/i, name: "Twitterbot", kind: "social preview", operator: "X (Twitter) card previews" },
  { re: /LinkedInBot(?:\/([\d.]+))?/i, name: "LinkedInBot", kind: "social preview", operator: "LinkedIn link previews" },
  { re: /Slackbot(?:-LinkExpanding)?(?:[ /]([\d.]+))?/i, name: "Slackbot", kind: "social preview", operator: "Slack link unfurling" },
  { re: /Discordbot(?:\/([\d.]+))?/i, name: "Discordbot", kind: "social preview", operator: "Discord link previews" },
  { re: /WhatsApp(?:\/([\d.]+))?/i, name: "WhatsApp", kind: "social preview", operator: "WhatsApp link previews" },
  // SEO, archives, monitors.
  { re: /AhrefsBot(?:\/([\d.]+))?/i, name: "AhrefsBot", kind: "SEO crawler", operator: "Ahrefs" },
  { re: /SemrushBot(?:\/([\w.~]+))?/i, name: "SemrushBot", kind: "SEO crawler", operator: "Semrush" },
  { re: /MJ12bot(?:\/v?([\d.]+))?/i, name: "MJ12bot", kind: "SEO crawler", operator: "Majestic" },
  { re: /DotBot(?:\/([\d.]+))?/i, name: "DotBot", kind: "SEO crawler", operator: "Moz" },
  { re: /archive\.org_bot/i, name: "archive.org_bot", kind: "archiver", operator: "Internet Archive (Wayback Machine)" },
  { re: /UptimeRobot(?:\/([\d.]+))?/i, name: "UptimeRobot", kind: "uptime monitor", operator: "UptimeRobot" },
  { re: /Pingdom\.com_bot_version_([\d.]+)/i, name: "Pingdom", kind: "uptime monitor", operator: "Pingdom" },
  // Command-line tools, API clients, HTTP libraries.
  { re: /\bcurl\/([\w.-]+)/i, name: "curl", kind: "command-line tool", operator: "the curl command-line tool" },
  { re: /\bWget\/([\w.-]+)/i, name: "Wget", kind: "command-line tool", operator: "GNU Wget" },
  { re: /\bHTTPie\/([\w.-]+)/i, name: "HTTPie", kind: "command-line tool", operator: "HTTPie" },
  { re: /(?:Windows)?PowerShell\/([\d.]+)/i, name: "PowerShell", kind: "command-line tool", operator: "PowerShell Invoke-WebRequest or Invoke-RestMethod" },
  { re: /PostmanRuntime\/([\w.-]+)/i, name: "Postman", kind: "API client", operator: "Postman" },
  { re: /\binsomnia\/([\w.-]+)/i, name: "Insomnia", kind: "API client", operator: "Insomnia" },
  { re: /python-requests\/([\w.-]+)/i, name: "python-requests", kind: "HTTP library", operator: "the Python requests library" },
  { re: /python-httpx\/([\w.-]+)/i, name: "httpx", kind: "HTTP library", operator: "the Python httpx library" },
  { re: /aiohttp\/([\w.-]+)/i, name: "aiohttp", kind: "HTTP library", operator: "the Python aiohttp library" },
  { re: /Python-urllib\/([\d.]+)/i, name: "urllib", kind: "HTTP library", operator: "Python's standard library urllib" },
  { re: /Scrapy\/([\w.-]+)/i, name: "Scrapy", kind: "crawler", operator: "Scrapy, a Python scraping framework" },
  { re: /Go-http-client\/([\d.]+)/i, name: "Go-http-client", kind: "HTTP library", operator: "Go's net/http with its default User-Agent" },
  { re: /okhttp\/([\w.-]+)/i, name: "OkHttp", kind: "HTTP library", operator: "OkHttp (Android and the JVM)" },
  { re: /Apache-HttpClient\/([\w.-]+)/i, name: "Apache HttpClient", kind: "HTTP library", operator: "Apache HttpComponents (Java)" },
  { re: /Java-http-client\/([\w.-]+)/i, name: "Java HttpClient", kind: "HTTP library", operator: "java.net.http.HttpClient (Java 11 and later)" },
  { re: /^Java\/([\w.-]+)/i, name: "Java", kind: "HTTP library", operator: "Java's HttpURLConnection default" },
  { re: /\baxios\/([\w.-]+)/i, name: "axios", kind: "HTTP library", operator: "axios (JavaScript)" },
  { re: /node-fetch(?:\/([\w.-]+))?/i, name: "node-fetch", kind: "HTTP library", operator: "node-fetch (JavaScript)" },
  { re: /\bundici\b/i, name: "undici", kind: "HTTP library", operator: "undici, the HTTP client under Node.js fetch" },
  { re: /libwww-perl\/([\w.-]+)/i, name: "libwww-perl", kind: "HTTP library", operator: "Perl LWP" },
  { re: /GuzzleHttp\/([\w.-]+)/i, name: "Guzzle", kind: "HTTP library", operator: "Guzzle (PHP)" },
  { re: /^Dart\/([\d.]+)/i, name: "Dart", kind: "HTTP library", operator: "Dart's dart:io HttpClient" },
];

const GENERIC_BOT_NAME = /\b([A-Za-z][\w.-]{0,40}?(?:bot|crawler|spider|scraper|fetcher))\b(?:\/([\w.]+))?/i;

export function detectBot(ua: string): BotInfo | null {
  for (const rule of BOT_RULES) {
    const m = rule.re.exec(ua);
    if (m) {
      return {
        name: rule.name,
        version: clip(m[1] ?? null),
        kind: rule.kind,
        operator: rule.operator,
        verify: rule.verify ?? null,
      };
    }
  }
  // A contact URL is the convention for a well-behaved bot ("+http://...").
  // A bare word ending in "bot" is not enough on its own: phone models such
  // as CUBOT end in it too.
  const contact = /\+https?:\/\//i.test(ua);
  const compatible = /\(compatible;/i.test(ua);
  const named = GENERIC_BOT_NAME.exec(ua);
  if (named && (contact || compatible)) {
    return { name: named[1], version: clip(named[2] ?? null), kind: "crawler", operator: "not in this tool's list", verify: null };
  }
  if (contact) {
    const first = /^([^\s/(]+)(?:\/(\S+))?/.exec(ua);
    const name = first && first[1] !== "Mozilla" ? first[1] : "unnamed client";
    return { name, version: first && first[1] !== "Mozilla" ? clip(first[2] ?? null) : null, kind: "crawler", operator: "not in this tool's list", verify: null };
  }
  return null;
}

/* ------------------------------------------------------- browser, engine */

function isIOS(ua: string): boolean {
  if (/Windows Phone/i.test(ua)) return false;
  return /\b(?:iPhone|iPad|iPod)\b/.test(ua) || /\b(?:CriOS|FxiOS|EdgiOS)\//.test(ua);
}

export function detectBrowser(ua: string): Named | null {
  let v: string | null;
  const android = /Android/.test(ua);
  const ios = isIOS(ua);
  // In-app browsers wrap a WebView and add their own token, so they go first.
  if ((v = m1(/\bInstagram ([\d.]+)/, ua)) !== null) return { name: "Instagram in-app browser", version: v };
  if ((v = m1(/\bFBAV\/([\d.]+)/, ua)) !== null) return { name: "Facebook in-app browser", version: v };
  if ((v = m1(/\bEdgA\/([\d.]+)/, ua)) !== null) return { name: "Microsoft Edge for Android", version: v };
  if ((v = m1(/\bEdgiOS\/([\d.]+)/, ua)) !== null) return { name: "Microsoft Edge for iOS", version: v };
  if ((v = m1(/\bEdg\/([\d.]+)/, ua)) !== null) return { name: "Microsoft Edge", version: v };
  if ((v = m1(/\bEdge\/([\d.]+)/, ua)) !== null) return { name: "Microsoft Edge Legacy", version: v };
  if ((v = m1(/\bOPR\/([\d.]+)/, ua)) !== null) return { name: "Opera", version: v };
  if ((v = m1(/\bOpera Mini\/([\d.]+)/, ua)) !== null) return { name: "Opera Mini", version: v };
  if (/\bOpera\b/.test(ua)) return { name: "Opera (Presto)", version: m1(/\bVersion\/([\d.]+)/, ua) ?? m1(/\bOpera[/ ]([\d.]+)/, ua) };
  if ((v = m1(/\bSamsungBrowser\/([\d.]+)/, ua)) !== null) return { name: "Samsung Internet", version: v };
  if ((v = m1(/\bYaBrowser\/([\d.]+)/, ua)) !== null) return { name: "Yandex Browser", version: v };
  if ((v = m1(/\bVivaldi\/([\d.]+)/, ua)) !== null) return { name: "Vivaldi", version: v };
  if ((v = m1(/\bUCBrowser\/([\d.]+)/, ua)) !== null) return { name: "UC Browser", version: v };
  if ((v = m1(/\bElectron\/([\d.]+)/, ua)) !== null) return { name: "Electron app", version: v };
  if ((v = m1(/\bHeadlessChrome\/([\d.]+)/, ua)) !== null) return { name: "Headless Chrome", version: v };
  if ((v = m1(/\bFxiOS\/([\d.]+)/, ua)) !== null) return { name: "Firefox for iOS", version: v };
  if ((v = m1(/\bCriOS\/([\d.]+)/, ua)) !== null) return { name: "Chrome for iOS", version: v };
  if ((v = m1(/\bFirefox\/([\d.]+)/, ua)) !== null) return { name: android ? "Firefox for Android" : "Firefox", version: v };
  if ((v = m1(/\bMSIE ([\d.]+)/, ua)) !== null) return { name: "Internet Explorer", version: v };
  if (/Trident\/7\.0/.test(ua) && (v = m1(/\brv:([\d.]+)/, ua)) !== null) return { name: "Internet Explorer", version: v };
  if (/; wv\)/.test(ua) && (v = m1(/\bChrome\/([\d.]+)/, ua)) !== null) return { name: "Android WebView", version: v };
  if ((v = m1(/\bChromium\/([\d.]+)/, ua)) !== null) return { name: "Chromium", version: v };
  if ((v = m1(/\bChrome\/([\d.]+)/, ua)) !== null) return { name: android ? "Chrome for Android" : "Chrome", version: v };
  if ((v = m1(/^Dalvik\/([\d.]+)/, ua)) !== null) return { name: "Android app (system HTTP client)", version: v };
  if (android && /\bVersion\/[\d.]+/.test(ua) && /\bSafari\//.test(ua)) return { name: "Android Browser (stock)", version: m1(/\bVersion\/([\d.]+)/, ua) };
  if ((v = m1(/\bVersion\/([\d.]+).*\bSafari\//, ua)) !== null) return { name: ios ? "Mobile Safari" : "Safari", version: v };
  if (ios && /AppleWebKit/.test(ua) && !/\bSafari\//.test(ua)) return { name: "iOS WebView (in-app)", version: null };
  if (/\bSafari\//.test(ua) && /AppleWebKit/.test(ua)) return { name: "Safari", version: null };
  return null;
}

export function detectEngine(ua: string, browser: Named | null): Named | null {
  let v: string | null;
  // Every browser on iOS is built on WebKit; Apple's rules required it
  // everywhere until iOS 17.4 opened other engines in the EU only.
  if (isIOS(ua)) return { name: "WebKit", version: m1(/AppleWebKit\/([\d.]+)/, ua) };
  if (browser?.name === "Microsoft Edge Legacy") return { name: "EdgeHTML", version: m1(/\bEdge\/([\d.]+)/, ua) };
  if ((v = m1(/Trident\/([\d.]+)/, ua)) !== null) return { name: "Trident", version: v };
  if (/\bMSIE\b/.test(ua)) return { name: "Trident", version: null };
  if ((v = m1(/Presto\/([\d.]+)/, ua)) !== null) return { name: "Presto", version: v };
  const chrome = m1(/\b(?:Chrome|Chromium|HeadlessChrome)\/(\d+)/, ua);
  if (chrome !== null && chrome !== "") {
    // Chrome 28 is where Blink forked from WebKit.
    if (parseInt(chrome, 10) >= 28) return { name: "Blink", version: chrome };
    return { name: "WebKit", version: m1(/AppleWebKit\/([\d.]+)/, ua) };
  }
  if (/\bGecko\/\d/.test(ua) || /\bFirefox\//.test(ua)) {
    return { name: "Gecko", version: m1(/\bFirefox\/([\d.]+)/, ua) ?? m1(/\brv:([\d.]+)/, ua) };
  }
  if ((v = m1(/AppleWebKit\/([\d.]+)/, ua)) !== null) return { name: "WebKit", version: v };
  if ((v = m1(/KHTML\/([\d.]+)/, ua)) !== null) return { name: "KHTML", version: v };
  return null;
}

/* ---------------------------------------------------------------- the OS */

const WINDOWS_NT: Record<string, string> = {
  "10.0": "Windows 10 or 11",
  "6.3": "Windows 8.1",
  "6.2": "Windows 8",
  "6.1": "Windows 7",
  "6.0": "Windows Vista",
  "5.2": "Windows XP x64 or Server 2003",
  "5.1": "Windows XP",
  "5.01": "Windows 2000 SP1",
  "5.0": "Windows 2000",
  "4.0": "Windows NT 4.0",
};

const MACOS_NAMES: Record<string, string> = {
  "10.9": "Mavericks",
  "10.10": "Yosemite",
  "10.11": "El Capitan",
  "10.12": "Sierra",
  "10.13": "High Sierra",
  "10.14": "Mojave",
  "10.15": "Catalina",
  "11": "Big Sur",
  "12": "Monterey",
  "13": "Ventura",
  "14": "Sonoma",
  "15": "Sequoia",
  "26": "Tahoe",
};

export function detectOs(ua: string): OsInfo | null {
  let v: string | null;
  const os = (name: string, version: string | null, note: string | null = null): OsInfo => ({ name, version: clip(version), note });

  if ((v = m1(/Windows Phone(?: OS)? ([\d.]+)/, ua)) !== null) return os("Windows Phone", v);
  if (/\bXbox\b/.test(ua)) return os("Xbox system software", null);
  if ((v = m1(/Windows NT ([\d.]+)/, ua)) !== null) {
    const name = WINDOWS_NT[v] ?? "Windows";
    const note =
      v === "10.0"
        ? "Windows 11 still reports NT 10.0, and Chrome's reduced string sends NT 10.0 from every Windows version. Only the Sec-CH-UA-Platform-Version hint tells them apart."
        : null;
    return os(name, `NT ${v}`, note);
  }
  if (/Windows 98|Win98/.test(ua)) return os("Windows 98", null);
  if (/Win 9x 4\.90|Windows ME/.test(ua)) return os("Windows ME", null);
  if (/Windows 95|Win95/.test(ua)) return os("Windows 95", null);

  const iosDevice = /\b(iPhone|iPad|iPod)\b/.exec(ua);
  if (iosDevice && !/Windows Phone/i.test(ua)) {
    const ver = m1(/\bOS (\d+(?:_\d+){0,2}) like Mac OS X/, ua)?.replace(/_/g, ".") ?? null;
    const major = ver ? parseInt(ver, 10) : NaN;
    // iPadOS split from iOS at version 13.
    return os(iosDevice[1] === "iPad" && major >= 13 ? "iPadOS" : "iOS", ver);
  }

  if ((v = m1(/Mac OS X (\d+(?:[_.]\d+){0,2})/, ua)) !== null) {
    const ver = v.replace(/_/g, ".");
    const [maj, min] = ver.split(".").map((x) => parseInt(x, 10));
    const name = maj === 10 && min < 8 ? "Mac OS X" : maj === 10 && min < 12 ? "OS X" : "macOS";
    const key = maj === 10 ? `10.${min}` : String(maj);
    const codename = MACOS_NAMES[key];
    let note: string | null = null;
    if (ver === "10.15.7" || ver === "10.15") {
      note = "Safari, Chrome and Firefox all stop at 10.15 here, so the Mac may be running anything from Catalina onward. Apple silicon Macs still say Intel. An iPad asking for the desktop site sends this same string.";
    } else if (/Intel Mac OS X/.test(ua)) {
      note = "Apple silicon Macs report Intel here too, so the word says nothing about the processor.";
    }
    return os(codename ? `${name} ${codename}` : name, ver, note);
  }
  if (/Macintosh|Mac_PowerPC/.test(ua)) return os("macOS", null);
  if (/HarmonyOS/.test(ua)) return os("HarmonyOS", m1(/HarmonyOS[ /]?([\d.]+)/, ua));
  if ((v = m1(/Android[ /]?([\d.]*)/, ua)) !== null) {
    const note = /Android 10; K\)/.test(ua)
      ? "Chrome's reduced string. Every Android device running Chrome 110 or later says Android 10 and model K."
      : null;
    return os("Android", v || null, note);
  }
  if ((v = m1(/\bCrOS \S+ ([\d.]+)/, ua)) !== null) {
    return os("ChromeOS", v, v === "14541.0.0" ? "Frozen: Chrome 107 and later send 14541.0.0 whatever the real platform version." : null);
  }
  if ((v = m1(/KAIOS\/([\d.]+)/i, ua)) !== null) return os("KaiOS", v);
  if (/Tizen/.test(ua)) return os("Tizen", m1(/Tizen[ /]?([\d.]+)/, ua));
  if (/Web0S|webOS/.test(ua)) return os("webOS", null);
  if ((v = m1(/PlayStation (\d+|Vita|Portable)/, ua)) !== null) return os(`PlayStation ${v} system software`, m1(/PlayStation \S+ ([\d.]+)/, ua));
  if ((v = m1(/Nintendo (Switch|WiiU|Wii|3DS)/, ua)) !== null) return os(`Nintendo ${v} system software`, null);
  if ((v = m1(/\b(FreeBSD|OpenBSD|NetBSD)\b/, ua)) !== null) return os(v, null);
  if (/SunOS/.test(ua)) return os("Solaris", null);
  if (/Ubuntu/.test(ua)) return os("Linux (Ubuntu)", null);
  if (/Fedora/.test(ua)) return os("Linux (Fedora)", null);
  if (/Linux/.test(ua)) return os("Linux", null);
  if ((v = m1(/Darwin\/([\d.]+)/, ua)) !== null) {
    return os("Darwin (an Apple OS)", v, "Darwin is the kernel under macOS, iOS and the other Apple systems; apps using Apple's CFNetwork report it.");
  }
  if (/CFNetwork/.test(ua)) return os("An Apple OS (CFNetwork)", null);
  return null;
}

export function detectArch(ua: string): string | null {
  if (/WOW64/.test(ua)) return "x86-64 (a 32-bit browser on 64-bit Windows)";
  if (/\b(?:Win64; x64|x64|x86_64|amd64|x86-64)\b/i.test(ua)) return "x86-64";
  if (/\b(?:aarch64|arm64)\b/i.test(ua)) return "ARM64";
  if (/\barmv\d+l?\b|\bARM\b/i.test(ua)) return "ARM (32-bit)";
  if (/\b(?:i[3-6]86)\b/.test(ua)) return "x86 (32-bit)";
  if (/\bPPC\b|PowerPC/.test(ua)) return "PowerPC";
  return null;
}

const DESKTOP_OS = /^(?:Windows(?! Phone)|macOS|Mac OS X|OS X|Linux|ChromeOS|FreeBSD|OpenBSD|NetBSD|Solaris)/;

function androidModel(ua: string): string | null {
  const comment = /\(([^()]*Android[^()]*)\)/.exec(ua);
  if (!comment) return null;
  const parts = comment[1].split(";").map((p) => p.trim());
  const idx = parts.findIndex((p) => /Android/.test(p));
  for (const p of parts.slice(idx + 1)) {
    if (p === "" || p === "U" || p === "wv" || p === "Mobile" || p === "Tablet" || /^rv:/.test(p)) continue;
    if (/^[a-z]{2}(?:[-_][a-z]{2,4})?$/i.test(p)) continue; // locale such as en-us
    return clip(p.replace(/\s*Build\/.*$/, "").trim() || null);
  }
  return null;
}

export function detectDevice(ua: string, os: OsInfo | null, bot: BotInfo | null): { type: DeviceType; model: string | null } {
  let model: string | null = null;
  const apple = /\b(iPhone|iPad|iPod)\b/.exec(ua);
  if (apple && !/Windows Phone/i.test(ua)) model = apple[1] === "iPod" ? "iPod touch" : apple[1];
  else if (/Android/.test(ua)) model = androidModel(ua);
  const xbox = /Xbox (?:One|Series [XS])/.exec(ua) ?? /\bXbox\b/.exec(ua);
  if (xbox) model = xbox[0];
  const ps = /PlayStation (?:\d+|Vita|Portable)/.exec(ua);
  if (ps) model = ps[0];

  if (bot) return { type: "bot", model };
  if (/PlayStation|\bXbox\b|Nintendo/.test(ua)) return { type: "console", model };
  if (/SMART-?TV|SmartTV|\bWeb0S\b|HbbTV|AppleTV|\bCrKey\b|GoogleTV|Android TV|BRAVIA/i.test(ua)) return { type: "tv", model };
  if (/^Dalvik\//.test(ua)) return { type: "unknown", model };
  const androidTablet = /Android/.test(ua) && !/Mobile/.test(ua) && !/Windows Phone/i.test(ua);
  if (/iPad/.test(ua) || (/\bTablet\b/.test(ua) && !/Tablet PC/.test(ua)) || /Kindle|\bSilk\//.test(ua) || androidTablet) {
    return { type: "tablet", model };
  }
  if (/iPhone|iPod|Windows Phone|\bMobi|BlackBerry|BB10|KAIOS|Opera Mini|IEMobile/i.test(ua)) return { type: "mobile", model };
  if (os && DESKTOP_OS.test(os.name)) return { type: "desktop", model };
  return { type: "unknown", model };
}

/* ---------------------------------------------------------- the findings */

function reductionNotes(ua: string): string[] {
  const out: string[] = [];
  if (isIOS(ua)) return out;
  const chrome = m1(/\b(?:Chrome|HeadlessChrome)\/([\d.]+)/, ua);
  if (!chrome) return out;
  if (/^\d+\.0\.0\.0$/.test(chrome)) {
    out.push(
      "Reduced version: from Chrome 101 only the major version is real and the rest reads 0.0.0. Sec-CH-UA-Full-Version-List carries the full number.",
    );
  }
  const major = parseInt(chrome, 10);
  if (
    major >= 107 &&
    /\((?:Windows NT 10\.0; Win64; x64|Macintosh; Intel Mac OS X 10_15_7|X11; Linux x86_64|X11; CrOS x86_64 14541\.0\.0)\)/.test(ua)
  ) {
    out.push(
      "Frozen platform: from Chrome 107 the desktop platform section is one of four fixed strings, whatever the real OS version or CPU. Sec-CH-UA-Platform-Version and Sec-CH-UA-Arch carry the real values.",
    );
  }
  if (/\(Linux; Android 10; K\)/.test(ua)) {
    out.push(
      "Frozen Android: from Chrome 110 the platform reads Android 10 and the model K on every device. Sec-CH-UA-Platform-Version and Sec-CH-UA-Model carry the real values.",
    );
  }
  return out;
}

/** Payloads that turn up in User-Agent headers because servers log and process them. */
export function payloadFindings(ua: string): Finding[] {
  const out: Finding[] = [];
  if (/\$\{/.test(ua)) {
    const lookup = /\$\{[^}]{0,256}?(?:jndi|lower:|upper:|::-|env:|sys:|date:|java:|base64:|\$\{)/i.test(ua);
    out.push({
      tone: lookup ? "danger" : "warn",
      text: lookup
        ? "Contains a ${...} lookup, the shape of a Log4Shell probe (CVE-2021-44228). Log4j 2 up to 2.14.1 expanded lookups inside logged strings, so ${jndi:ldap://...} in a logged header made the server fetch and run remote code. Seeing it means someone tested you, not that it worked; check what the host contacted next."
        : "Contains a ${...} expression. In a User-Agent that is usually template or Log4Shell-style injection testing.",
    });
  }
  if (/\(\)\s*\{[^}]*\}\s*;/.test(ua)) {
    out.push({
      tone: "danger",
      text: "Contains a Shellshock probe (CVE-2014-6271): a Bash function definition followed by a command. CGI copies the User-Agent into the HTTP_USER_AGENT environment variable, and unpatched Bash ran whatever followed the function body.",
    });
  }
  if (
    /(?:'|%27)\s*(?:or|and)\s*(?:'|\d|true)|union(?:\s|\/\*[^*]*\*\/|%20|\+)+(?:all(?:\s|%20|\+)+)?select|\bsleep\s*\(\s*\d|benchmark\s*\(|waitfor\s+delay|pg_sleep|xp_cmdshell|information_schema/i.test(
      ua,
    )
  ) {
    out.push({
      tone: "warn",
      text: "Contains SQL injection syntax. Scanners test headers as well as parameters (sqlmap tries the User-Agent from --level 3), because applications that log or count visitors often write this header to a database.",
    });
  }
  if (/<\s*\/?\s*(?:script|svg|img|iframe|body)\b|javascript:|\bon(?:error|load)\s*=/i.test(ua)) {
    out.push({
      tone: "warn",
      text: "Contains HTML or script. The target is whatever later displays this header: a log viewer, analytics dashboard or admin panel that renders it unescaped.",
    });
  }
  if (/\.\.[/\\]|\/etc\/passwd|\bcmd\.exe\b|\|\s*(?:sh|bash)\b|;\s*(?:wget|curl)\s|\$\([^)]*\)/i.test(ua)) {
    out.push({ tone: "warn", text: "Contains path traversal or shell command syntax, a probe for code that passes the header to a file path or a shell." });
  }
  if (/%0d%0a|%0a|%0d/i.test(ua)) {
    out.push({ tone: "warn", text: "Contains an encoded line break, a header injection (CRLF) probe." });
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(ua)) {
    out.push({ tone: "warn", text: "Contains control characters. No browser sends them; they target log parsers and terminals." });
  }
  return out;
}

/** Full analysis of one User-Agent string. Never throws. */
export function analyzeUa(raw: string): UaAnalysis {
  const ua = raw.trim();
  const { tokens, note } = tokenize(ua);
  const findings: Finding[] = [];

  if (ua === "" || ua === "-") {
    findings.push({
      tone: "warn",
      text: "No User-Agent (a log writes - for a missing header). Browsers always send one, so an empty value is a script, a scanner or a client configured to hide.",
    });
    return {
      ua,
      tokens,
      tokenizerNote: null,
      browser: null,
      engine: null,
      os: null,
      arch: null,
      device: { type: "unknown", model: null },
      bot: null,
      reduced: [],
      findings,
    };
  }

  const bot = detectBot(ua);
  const browser = detectBrowser(ua);
  const engine = detectEngine(ua, browser);
  const os = detectOs(ua);
  const arch = detectArch(ua);
  const device = detectDevice(ua, os, bot);
  const reduced = reductionNotes(ua);

  findings.push(...payloadFindings(ua));

  if (bot) {
    const verify = bot.verify ?? "Treat it as unverified until the source address matches the operator's published IP ranges or reverse DNS.";
    if (bot.kind === "security scanner") {
      findings.push({
        tone: "danger",
        text: `Identifies as ${bot.name}, ${bot.operator}. This is either an attacker who did not change the default or a sanctioned assessment. Check whether it was expected and what the requests targeted.`,
      });
    } else if (bot.kind === "internet scanner") {
      findings.push({
        tone: "warn",
        text: `Identifies as ${bot.name}, ${bot.operator}. Internet-wide scanners touch every reachable address; the request says the service is visible, not that you were singled out.`,
      });
    } else if (bot.kind === "automation") {
      findings.push({ tone: "warn", text: `Identifies as ${bot.name}: ${bot.operator}. Real visitors do not send this.` });
    } else if (bot.kind === "command-line tool" || bot.kind === "HTTP library" || bot.kind === "API client") {
      findings.push({
        tone: "info",
        text: `A ${bot.kind}: ${bot.operator}. A script or developer sent this, not a browser.${bot.name === "Go-http-client" ? " The 1.1 or 2.0 is the HTTP version in use, not the Go version." : ""}`,
      });
    } else {
      findings.push({ tone: "info", text: `Claims to be ${bot.name} (${bot.operator}). Anyone can send this string. ${verify}` });
    }
  }

  if (browser?.name === "Internet Explorer" && browser.version && parseFloat(browser.version) <= 10) {
    findings.push({
      tone: "warn",
      text: `Internet Explorer ${browser.version} has been out of support for years. A current request claiming it is far more likely a script reusing an old string than a person.`,
    });
  } else if (os?.name.startsWith("Windows XP") || os?.name === "Windows 2000" || os?.name === "Windows 98") {
    findings.push({
      tone: "warn",
      text: `${os.name} is long out of support. A current request claiming it is more likely a script or scanner reusing an old string than a real machine.`,
    });
  }

  if (/\b(?:iPhone|iPad)\b/.test(ua) && /\bChrome\//.test(ua) && !/CriOS|Windows Phone/.test(ua)) {
    findings.push({
      tone: "warn",
      text: "Claims an iPhone or iPad but carries a Chrome/ token. Chrome on iOS says CriOS/, so this string was probably edited by hand.",
    });
  }
  if (/Windows NT/.test(ua) && /Mac OS X/.test(ua)) {
    findings.push({ tone: "warn", text: "Names both Windows and macOS, which no real browser does. The string was assembled or edited." });
  }
  if (ua.length > 1024) {
    findings.push({ tone: "info", text: `${ua.length} characters. Mainstream browsers send roughly 100 to 300.` });
  }
  if (/[^\u0000-\u007f]/.test(ua)) {
    findings.push({ tone: "info", text: "Contains non-ASCII characters. Browsers send plain ASCII in this header." });
  }
  if (!bot && !browser && !findings.some((f) => f.tone === "danger" || f.tone === "warn")) {
    findings.push({ tone: "info", text: "No browser or known client recognized. It may be an app with its own name, or a string made up for the occasion." });
  }

  return { ua, tokens, tokenizerNote: note, browser, engine, os, arch, device, bot, reduced, findings };
}

/* --------------------------------------------------------- client hints */

export interface Brand {
  brand: string;
  version: string | null;
  grease: boolean;
}

/** Chromium's GREASE brands: "Not", a punctuation mark, "A", another, "Brand". */
export function isGreaseBrand(brand: string): boolean {
  return /^\s*Not[^A-Za-z0-9]?A[^A-Za-z0-9]?Brand\s*$/i.test(brand);
}

type BrandParse = { ok: true; brands: Brand[] } | { ok: false; error: string };

/** RFC 8941 section 4.2.1 list of sf-string items, each with parameters. */
export function parseBrandList(value: string): BrandParse {
  const s = value;
  let i = 0;
  const brands: Brand[] = [];
  const ws = () => {
    while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  };
  const fail = (what: string): BrandParse => ({ ok: false, error: `${what} at character ${i + 1}.` });
  const readString = (): string | null => {
    if (s[i] !== '"') return null;
    i++;
    let out = "";
    while (i < s.length && s[i] !== '"') {
      if (s[i] === "\\") {
        i++;
        if (s[i] !== '"' && s[i] !== "\\") return null;
      }
      out += s[i];
      i++;
    }
    if (s[i] !== '"') return null;
    i++;
    return out;
  };

  ws();
  if (i >= s.length) return { ok: false, error: "The brand list is empty." };
  while (i < s.length) {
    if (brands.length >= 32) return { ok: false, error: "More than 32 brands; no browser sends that many." };
    const brand = readString();
    if (brand === null) return fail("Expected a quoted brand name");
    let version: string | null = null;
    while (s[i] === ";") {
      i++;
      ws();
      const key = /^[a-z*][a-z0-9_.*-]*/.exec(s.slice(i, i + 64));
      if (!key) return fail("Expected a parameter name");
      i += key[0].length;
      let val: string | null = "true";
      if (s[i] === "=") {
        i++;
        if (s[i] === '"') {
          val = readString();
          if (val === null) return fail("Unterminated parameter string");
        } else {
          const bare = /^[^\s,;]+/.exec(s.slice(i, i + 64));
          val = bare ? bare[0] : "";
          i += val.length;
        }
      }
      if (key[0] === "v") version = val;
    }
    brands.push({ brand, version, grease: isGreaseBrand(brand) });
    ws();
    if (i >= s.length) break;
    if (s[i] !== ",") return fail("Expected a comma between brands");
    i++;
    ws();
  }
  return { ok: true, brands };
}

function sfString(value: string): string | null {
  const m = /^\s*"((?:[^"\\]|\\["\\])*)"\s*$/.exec(value);
  return m ? m[1].replace(/\\(["\\])/g, "$1") : null;
}

function sfBoolean(value: string): boolean | null {
  const v = value.trim();
  if (v === "?1") return true;
  if (v === "?0") return false;
  return null;
}

export interface ClientHints {
  brands: Brand[] | null;
  fullVersionList: Brand[] | null;
  mobile: boolean | null;
  platform: string | null;
  platformVersion: string | null;
  model: string | null;
  arch: string | null;
  bitness: string | null;
  wow64: boolean | null;
  headers: { name: string; value: string }[];
  errors: string[];
  findings: Finding[];
}

function emptyHints(): ClientHints {
  return {
    brands: null,
    fullVersionList: null,
    mobile: null,
    platform: null,
    platformVersion: null,
    model: null,
    arch: null,
    bitness: null,
    wow64: null,
    headers: [],
    errors: [],
    findings: [],
  };
}

function addHint(h: ClientHints, rawName: string, value: string): void {
  const name = rawName.toLowerCase();
  if (h.headers.length >= 40) return;
  h.headers.push({ name: rawName, value: value.slice(0, 1000) });
  const str = (label: string) => {
    const v = sfString(value);
    if (v === null) h.errors.push(`${label} should be a quoted string, such as "value".`);
    return v;
  };
  const bool = (label: string) => {
    const v = sfBoolean(value);
    if (v === null) h.errors.push(`${label} should be ?0 or ?1.`);
    return v;
  };
  switch (name) {
    case "sec-ch-ua":
    case "sec-ch-ua-full-version-list": {
      const parsed = parseBrandList(value);
      if (!parsed.ok) h.errors.push(`${rawName}: ${parsed.error}`);
      else if (name === "sec-ch-ua") h.brands = parsed.brands;
      else h.fullVersionList = parsed.brands;
      break;
    }
    case "sec-ch-ua-mobile":
      h.mobile = bool(rawName);
      break;
    case "sec-ch-ua-platform":
      h.platform = str(rawName);
      break;
    case "sec-ch-ua-platform-version":
      h.platformVersion = str(rawName);
      break;
    case "sec-ch-ua-model":
      h.model = str(rawName);
      break;
    case "sec-ch-ua-arch":
      h.arch = str(rawName);
      break;
    case "sec-ch-ua-bitness":
      h.bitness = str(rawName);
      break;
    case "sec-ch-ua-wow64":
      h.wow64 = bool(rawName);
      break;
    default:
      break;
  }
}

/** Interprets the gathered hints, and compares them with a UA when there is exactly one. */
export function interpretHints(h: ClientHints, ua: UaAnalysis | null): void {
  const f = h.findings;
  const list = h.fullVersionList ?? h.brands;
  if (list?.some((b) => b.grease)) {
    f.push({
      tone: "info",
      text: "The \"Not A Brand\" entry is GREASE: a deliberately fake brand whose punctuation and position change between versions, so servers have to parse the list properly instead of matching one exact string.",
    });
  }
  if (h.platform === "Windows" && h.platformVersion) {
    const major = parseInt(h.platformVersion, 10);
    if (major >= 13) f.push({ tone: "ok", text: `Platform version ${h.platformVersion} means Windows 11 (13 and above), something the User-Agent string cannot say.` });
    else if (major >= 1) f.push({ tone: "ok", text: `Platform version ${h.platformVersion} means Windows 10 (1 to 10).` });
    else if (major === 0) f.push({ tone: "ok", text: `Platform version ${h.platformVersion} means a Windows release older than Windows 10.` });
  } else if (h.platform && h.platformVersion) {
    f.push({ tone: "ok", text: `Real platform: ${h.platform} ${h.platformVersion}.` });
  }
  if (h.model) f.push({ tone: "ok", text: `Real device model: ${h.model}.` });
  if (h.wow64) f.push({ tone: "info", text: "A 32-bit browser running on 64-bit Windows." });

  if (!ua || !list) return;
  const chromium = list.find((b) => /^(?:Chromium|Google Chrome)$/.test(b.brand));
  const uaChrome = m1(/\bChrome\/(\d+)/, ua.ua);
  if (chromium?.version && uaChrome && parseInt(chromium.version, 10) !== parseInt(uaChrome, 10)) {
    f.push({
      tone: "warn",
      text: `The User-Agent says Chrome ${uaChrome} but Sec-CH-UA says ${chromium.brand} ${parseInt(chromium.version, 10)}. One of them was changed; UA spoofing extensions usually rewrite only the User-Agent header.`,
    });
  }
  if (h.platform && ua.os) {
    const pairs: [RegExp, RegExp][] = [
      [/^Windows$/, /^Windows(?! Phone)/],
      [/^macOS$/, /^(?:macOS|OS X|Mac OS X)/],
      [/^Android$/, /^Android/],
      [/^Linux$/, /^Linux/],
      [/^Chrome OS$/, /^ChromeOS/],
      [/^iOS$/, /^(?:iOS|iPadOS)/],
    ];
    const pair = pairs.find(([hint]) => hint.test(h.platform ?? ""));
    if (pair && !pair[1].test(ua.os.name)) {
      f.push({
        tone: "warn",
        text: `Sec-CH-UA-Platform says ${h.platform} but the User-Agent says ${ua.os.name}. A real browser keeps the two consistent, so one was edited.`,
      });
    }
  }
  if (h.mobile !== null && (ua.device.type === "mobile" || ua.device.type === "desktop")) {
    if (h.mobile !== (ua.device.type === "mobile")) {
      f.push({ tone: "warn", text: `Sec-CH-UA-Mobile says ${h.mobile ? "mobile" : "not mobile"} but the User-Agent looks ${ua.device.type}.` });
    }
  }
}

/* ------------------------------------------------------------ the input */

export type EntrySource = "line" | "header" | "log";

export type Entry =
  | { line: number; source: EntrySource; kind: "ua"; analysis: UaAnalysis }
  | { line: number; source: EntrySource; kind: "error"; input: string; message: string };

export interface ParseOutput {
  entries: Entry[];
  hints: ClientHints | null;
  ignored: number;
  truncated: number;
  error: string | null;
}

/** Common and combined log format timestamps look like [10/Oct/2000:13:55:36 -0700]. */
const CLF_TIME = /\[\d{1,2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}/;

/**
 * The User-Agent is the last quoted field of a combined format log line.
 * Apache escapes " as \" and nginx as \x22; both are undone here.
 */
export function extractLogUa(line: string): string | null {
  const t = line.trimEnd();
  if (!t.endsWith('"') || t.length < 2) return null;
  let i = t.length - 2;
  for (; i >= 0; i--) {
    if (t[i] !== '"') continue;
    let slashes = 0;
    for (let k = i - 1; k >= 0 && t[k] === "\\"; k--) slashes++;
    if (slashes % 2 === 0) break;
  }
  if (i < 0) return null;
  return t
    .slice(i + 1, t.length - 1)
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(["\\])/g, "$1");
}

/**
 * One UA per line. Also accepted: header lines (User-Agent: and Sec-CH-UA*
 * are read, other headers are skipped), HTTP request lines (skipped), bare
 * Sec-CH-UA brand lists, and combined format access log lines.
 */
export function parseInput(text: string): ParseOutput {
  const out: ParseOutput = { entries: [], hints: null, ignored: 0, truncated: 0, error: null };
  if (text.length > MAX_INPUT_CHARS) {
    out.error = `That is ${text.length.toLocaleString("en-US")} characters. The limit here is ${MAX_INPUT_CHARS.toLocaleString("en-US")}; split the log and paste it in parts.`;
    return out;
  }
  const hints = emptyHints();
  const lines = text.split(/\r?\n/);

  const push = (line: number, source: EntrySource, ua: string) => {
    if (out.entries.length >= MAX_ENTRIES) {
      out.truncated++;
      return;
    }
    if (ua.length > MAX_UA_LENGTH) {
      out.entries.push({
        line,
        source,
        kind: "error",
        input: ua.slice(0, 80),
        message: `${ua.length.toLocaleString("en-US")} characters, more than the ${MAX_UA_LENGTH} a default Apache will accept in one header, so it is not analyzed.`,
      });
      return;
    }
    out.entries.push({ line, source, kind: "ua", analysis: analyzeUa(ua) });
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const n = idx + 1;
    if (line === "") return;

    if (CLF_TIME.test(line) && line.endsWith('"')) {
      const ua = extractLogUa(line);
      if (ua !== null) {
        push(n, "log", ua);
        return;
      }
    }
    const header = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/.exec(line);
    if (header && !/^[0-9a-fA-F]+$/.test(header[1])) {
      const name = header[1].toLowerCase();
      if (name === "user-agent") push(n, "header", header[2]);
      else if (name.startsWith("sec-ch-ua")) addHint(hints, header[1], header[2]);
      else out.ignored++;
      return;
    }
    if (/^(?:GET|POST|HEAD|PUT|DELETE|OPTIONS|PATCH|CONNECT|TRACE) \S+ HTTP\/[\d.]+$/.test(line)) {
      out.ignored++;
      return;
    }
    if (/^"[^"]*"\s*;\s*v\s*=/.test(line)) {
      addHint(hints, "Sec-CH-UA", line);
      return;
    }
    // A UA pasted out of JSON or a CSV cell keeps its quotes.
    const quoted = /^"([^"]*)"$/.exec(line);
    push(n, "line", quoted ? quoted[1] : line);
  });

  if (hints.headers.length) {
    const uas = out.entries.filter((e): e is Extract<Entry, { kind: "ua" }> => e.kind === "ua");
    interpretHints(hints, uas.length === 1 ? uas[0].analysis : null);
    out.hints = hints;
  }
  return out;
}

/** Counts by device type, for the summary line. */
export function deviceCounts(entries: Entry[]): Record<DeviceType, number> {
  const counts: Record<DeviceType, number> = { desktop: 0, mobile: 0, tablet: 0, tv: 0, console: 0, bot: 0, unknown: 0 };
  for (const e of entries) if (e.kind === "ua") counts[e.analysis.device.type]++;
  return counts;
}

/** Serializes a brand list as a Sec-CH-UA value (RFC 8941 sf-strings). */
export function brandListValue(brands: { brand: string; version: string }[]): string {
  const q = (s: string) => `"${s.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
  return brands.map((b) => `${q(b.brand)};v=${q(b.version)}`).join(", ");
}
