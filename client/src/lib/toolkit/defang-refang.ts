/**
 * Defanging, refanging, and the network indicator matcher both IOC tools share.
 *
 * Defanging rewrites a URL, domain, IP or email address so that no mail
 * client, chat app or ticket system turns it into a live link, and so that
 * nobody resolves or visits it by pasting it. Refanging reverses that.
 *
 * The matcher works on a refanged copy of the text: every common defang
 * token ([.] (.) [dot] [@] [:] hxxp and so on) is rewritten to the live
 * character first, with an index map back to the original. One set of
 * recognizers then finds live and defanged indicators alike, and every match
 * still knows exactly which characters it covered in the text as written.
 *
 * Scanning is done over maximal runs of a character class rather than with
 * open-ended regular expressions, so the work is linear in the input. A
 * pattern like /[a-z0-9-]+(\.[a-z0-9-]+)+/ retried at every offset of a long
 * run with no dot is quadratic, which is a hang on a pasted log file.
 *
 * No React or DOM in this file, so it can be tested directly.
 */

/** Input past this many characters is refused rather than read. */
export const MAX_INPUT_CHARS = 1_000_000;

/** At most this many individual changes are itemized; all of them are counted. */
export const MAX_CHANGES_LISTED = 200;

/* ------------------------------------------------------------------ TLDs */

/**
 * Every delegated top-level domain, lowercased, from the IANA list at
 * https://data.iana.org/TLD/tlds-alpha-by-domain.txt (version 2026103000).
 * A dotted name only counts as a domain when its last label is in here,
 * which is what keeps report.pdf, node.js and e.g. out of the results.
 */
export const TLD_LIST_VERSION = "2026103000";

const TLD_SOURCE = `
  aaa aarp abb abbott abbvie abc able abogado abudhabi ac academy accenture accountant accountants
  aco actor ad ads adult ae aeg aero aetna af afl africa ag agakhan agency ai aig airbus airforce
  airtel akdn al alibaba alipay allfinanz allstate ally alsace alstom am amazon americanexpress
  americanfamily amex amfam amica amsterdam analytics android anquan anz ao aol apartments app
  apple aq aquarelle ar arab aramco archi army arpa art arte as asda asia associates at athleta
  attorney au auction audi audible audio auspost author auto autos aw aws ax axa az azure ba baby
  baidu banamex band bank bar barcelona barclaycard barclays barefoot bargains baseball basketball
  bauhaus bayern bb bbc bbt bbva bcg bcn bd be beats beauty beer berlin best bestbuy bet bf bg bh
  bharti bi bible bid bike bing bingo bio biz bj black blackfriday blockbuster blog bloomberg blue
  bm bms bmw bn bnpparibas bo boats boehringer bofa bom bond boo book booking bosch bostik boston
  bot boutique box br bradesco bridgestone broadway broker brother brussels bs bt build builders
  business buy buzz bv bw by bz bzh ca cab cafe cal call calvinklein cam camera camp canon
  capetown capital capitalone car caravan cards care career careers cars casa case cash casino cat
  catering catholic cba cbn cbre cc cd center ceo cern cf cfa cfd cg ch chanel channel charity
  chase chat cheap chintai christmas chrome church ci cipriani circle cisco citadel citi citic
  city ck cl claims cleaning click clinic clinique clothing cloud club clubmed cm cn co coach
  codes coffee college cologne com commbank community company compare computer comsec condos
  construction consulting contact contractors cooking cool coop corsica country coupon coupons
  courses cpa cr credit creditcard creditunion cricket crown crs cruise cruises cu cuisinella cv
  cw cx cy cymru cyou cz dad dance data date dating datsun day dclk dds de deal dealer deals
  degree delivery dell deloitte delta democrat dental dentist desi design dev dhl diamonds diet
  digital direct directory discount discover dish diy dj dk dm dnp do docs doctor dog domains dot
  download drive dtv dubai dupont durban dvag dvr dz earth eat ec eco edeka edu education ee eg
  email emerck energy engineer engineering enterprises epson equipment er ericsson erni es esq
  estate et eu eurovision eus events exchange expert exposed express extraspace fage fail
  fairwinds faith family fan fans farm farmers fashion fast fedex feedback ferrari ferrero fi
  fidelity fido film final finance financial fire firestone firmdale fish fishing fit fitness fj
  fk flickr flights flir florist flowers fly fm fo foo food football ford forex forsale forum
  foundation fox fr free fresenius frl frogans frontier ftr fujitsu fun fund furniture futbol fyi
  ga gal gallery gallo gallup game games gap garden gay gb gbiz gd gdn ge gea gent genting george
  gf gg ggee gh gi gift gifts gives giving gl glass gle global globo gm gmail gmbh gmo gmx gn
  godaddy gold goldpoint golf goodyear goog google gop got gov gp gq gr grainger graphics gratis
  green gripe grocery group gs gt gu gucci guge guide guitars guru gw gy hair hamburg hangout haus
  hbo hdfc hdfcbank health healthcare help here hermes hiphop hisamitsu hitachi hiv hk hkt hm hn
  hockey holdings holiday homedepot homegoods homes homesense honda horse hospital host hosting
  hot hotels hotmail house how hr hsbc ht hu hughes hyatt hyundai ibm icbc ice icu id ie ieee ifm
  ikano il im imamat imdb immo immobilien in inc industries infiniti info ing ink institute
  insurance insure int international intuit investments io ipiranga iq ir irish is ismaili ist
  istanbul it itau itv jaguar java jcb je jeep jetzt jewelry jio jll jm jmp jnj jo jobs joburg jot
  joy jp jpmorgan jprs juegos kaufen kddi ke kerryhotels kerryproperties kfh kg kh ki kia kids kim
  kindle kitchen kiwi km kn koeln komatsu kosher kp kpmg kpn kr krd kred kuokgroup kw ky kyoto kz
  la lacaixa lamborghini lamer land landrover lanxess lasalle lat latino latrobe law lawyer lb lc
  lds lease leclerc lefrak legal lego lexus lgbt li lidl life lifeinsurance lifestyle lighting
  like lilly limited limo lincoln link live living lk llc llp loan loans locker locus lol london
  lotte lotto love lpl lplfinancial lr ls lt ltd ltda lu lundbeck luxe luxury lv ly ma madrid maif
  maison makeup man management mango map market marketing markets marriott marshalls mattel mba mc
  mckinsey md me med media meet melbourne meme memorial men menu merck merckmsd mg mh miami
  microsoft mil mini mint mit mitsubishi mk ml mlb mls mm mma mn mo mobi mobile moda moe moi mom
  monash money monster mormon mortgage moscow moto motorcycles mov movie mp mq mr ms msd mt mtn
  mtr mu museum music mv mw mx my mz na nab nagoya name navy nba nc ne nec net netbank netflix
  network neustar new news next nextdirect nexus nf nfl ng ngo nhk ni nico nike nikon ninja nissan
  nissay nl no nokia norton now nowruz nowtv np nr nra nrw ntt nu nyc nz obi observer office
  okinawa olayan olayangroup ollo om omega one ong onl online ooo open oracle orange org organic
  origins osaka otsuka ott ovh pa page panasonic paris pars partners parts party pay pccw pe pet
  pf pfizer pg ph pharmacy phd philips phone photo photography photos physio pics pictet pictures
  pid pin ping pink pioneer pizza pk pl place play playstation plumbing plus pm pn pnc pohl poker
  politie porn post pr praxi press prime pro prod productions prof progressive promo properties
  property protection pru prudential ps pt pub pw pwc py qa qpon quebec quest racing radio re read
  realestate realtor realty recipes red redumbrella rehab reise reisen reit reliance ren rent
  rentals repair report republican rest restaurant review reviews rexroth rich richardli ricoh ril
  rio rip ro rocks rodeo rogers room rs rsvp ru rugby ruhr run rw rwe ryukyu sa saarland safe
  safety sakura sale salon samsclub samsung sandvik sandvikcoromant sanofi sap sarl sas save saxo
  sb sbi sbs sc scb schaeffler schmidt scholarships school schule schwarz science scot sd se
  search seat secure security seek select sener services seven sew sex sexy sfr sg sh shangrila
  sharp shell shia shiksha shoes shop shopping shouji show si silk sina singles site sj sk ski
  skin sky skype sl sling sm smart smile sn sncf so soccer social softbank software sohu solar
  solutions song sony soy spa space sport spot sr srl ss st stada staples star statebank statefarm
  stc stcgroup stockholm storage store stream studio study style su sucks supplies supply support
  surf surgery suzuki sv swatch swiss sx sy sydney systems sz tab taipei talk taobao target
  tatamotors tatar tattoo tax taxi tc tci td tdk team tech technology tel temasek tennis teva tf
  tg th thd theater theatre tiaa tickets tienda tips tires tirol tj tjmaxx tjx tk tkmaxx tl tm
  tmall tn to today tokyo tools top toray toshiba total tours town toyota toys tr trade trading
  training travel travelers travelersinsurance trust trv tt tube tui tunes tushu tv tvs tw tz ua
  ubank ubs ug uk unicom university uno uol ups us uy uz va vacations vana vanguard vc ve vegas
  ventures verisign versicherung vet vg vi viajes video vig viking villas vin vip virgin visa
  vision viva vivo vlaanderen vn vodka volvo vote voting voto voyage vu wales walmart walter wang
  wanggou watch watches weather weatherchannel web webcam weber website wed wedding weibo weir wf
  whoswho wien wiki williamhill win windows wine winners wme woodside work works world wow ws wtc
  wtf xbox xerox xihuan xin xn--11b4c3d xn--1ck2e1b xn--1qqw23a xn--2scrj9c xn--30rr7y xn--3bst00m
  xn--3ds443g xn--3e0b707e xn--3hcrj9c xn--3pxu8k xn--42c2d9a xn--45br5cyl xn--45brj9c xn--45q11c
  xn--4dbrk0ce xn--4gbrim xn--54b7fta0cc xn--55qw42g xn--55qx5d xn--5su34j936bgsg xn--5tzm5g
  xn--6frz82g xn--6qq986b3xl xn--80adxhks xn--80ao21a xn--80aqecdr1a xn--80asehdb xn--80aswg
  xn--8y0a063a xn--90a3ac xn--90ae xn--90ais xn--9dbq2a xn--9et52u xn--9krt00a xn--b4w605ferd
  xn--bck1b9a5dre4c xn--c1avg xn--c2br7g xn--cck2b3b xn--cckwcxetd xn--cg4bki
  xn--clchc0ea0b2g2a9gcd xn--czr694b xn--czrs0t xn--czru2d xn--d1acj3b xn--d1alf xn--e1a4c
  xn--eckvdtc9d xn--efvy88h xn--fct429k xn--fhbei xn--fiq228c5hs xn--fiq64b xn--fiqs8s xn--fiqz9s
  xn--fjq720a xn--flw351e xn--fpcrj9c3d xn--fzc2c9e2c xn--fzys8d69uvgm xn--g2xx48c xn--gckr3f0f
  xn--gecrj9c xn--gk3at1e xn--h2breg3eve xn--h2brj9c xn--h2brj9c8c xn--hxt814e xn--i1b6b1a6a2e
  xn--imr513n xn--io0a7i xn--j1aef xn--j1amh xn--j6w193g xn--jlq480n2rg xn--jvr189m
  xn--kcrx77d1x4a xn--kprw13d xn--kpry57d xn--kput3i xn--l1acc xn--lgbbat1ad8j xn--mgb9awbf
  xn--mgba3a3ejt xn--mgba3a4f16a xn--mgba7c0bbn0a xn--mgbaam7a8h xn--mgbab2bd xn--mgbah1a3hjkrd
  xn--mgbai9azgqp6j xn--mgbayh7gpa xn--mgbbh1a xn--mgbbh1a71e xn--mgbc0a9azcg xn--mgbca7dzdo
  xn--mgbcpq6gpa1a xn--mgberp4a5d4ar xn--mgbgu82a xn--mgbi4ecexp xn--mgbpl2fh xn--mgbt3dhd
  xn--mgbtx2b xn--mgbx4cd0ab xn--mix891f xn--mk1bu44c xn--mxtq1m xn--ngbc5azd xn--ngbe9e0a
  xn--ngbrx xn--node xn--nqv7f xn--nqv7fs00ema xn--nyqy26a xn--o3cw4h xn--ogbpf8fl xn--otu796d
  xn--p1acf xn--p1ai xn--pgbs0dh xn--pssy2u xn--q7ce6a xn--q9jyb4c xn--qcka1pmc xn--qxa6a xn--qxam
  xn--rhqv96g xn--rovu88b xn--rvc1e0am3e xn--s9brj9c xn--ses554g xn--t60b56a xn--tckwe
  xn--tiq49xqyj xn--unup4y xn--vermgensberater-ctb xn--vermgensberatung-pwb xn--vhquv xn--vuq861b
  xn--w4r85el8fhu5dnra xn--w4rs40l xn--wgbh1c xn--wgbl6a xn--xhq521b xn--xkc2al3hye2a
  xn--xkc2dl3a5ee0h xn--y9a3aq xn--yfro4i67o xn--ygbi2ammx xn--zfr164b xxx xyz yachts yahoo
  yamaxun yandex ye yodobashi yoga yokohama you youtube yt yun za zappos zara zero zip zm zone
  zuerich zw
`;

export const TLDS: ReadonlySet<string> = new Set(TLD_SOURCE.split(/\s+/).filter((t) => t !== ""));

/**
 * Real TLDs that are also common file extensions. setup.py, README.md,
 * invoice.zip and notes.one are all syntactically valid domain names. A live
 * name ending in one of these is treated as a file name unless it was written
 * defanged, appears inside a URL or an email address, or the caller opts in.
 * .com is deliberately absent: it is also an old DOS executable extension,
 * but skipping it would drop far more real domains than file names.
 */
const FILE_LIKE_CANDIDATES = [
  "zip", "mov", "py", "sh", "ps", "pl", "pm", "rs", "md", "so", "one", "cab", "java", "run", "tf",
];

export const AMBIGUOUS_TLDS: ReadonlySet<string> = new Set(FILE_LIKE_CANDIDATES.filter((t) => TLDS.has(t)));

/* --------------------------------------------------------- normalization */

/**
 * The defang tokens that refanging reverses. Every token is free of
 * whitespace, so a token never straddles a line or a word. Bare words such
 * as " dot " and " at " are deliberately not reversed: they collide with
 * ordinary English ("meet at noon").
 *
 * hxxp and fxp are only reversed when a colon (live or defanged) follows,
 * so the word hxxp in a sentence about defanging is left alone.
 */
const DEFANG_TOKEN =
  /\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)|\{dot\}|\\\.|\[@\]|\(@\)|\{@\}|\[at\]|\(at\)|\{at\}|\[:\/\/\]|\[:\]|\(:\)|\{:\}|\[\/\/\]|\[\/\]|\b(h)xx(p)(s?)(?=:|\[:|\(:|\{:)|\b(f)x(p)(s?)(?=:|\[:|\(:|\{:)/gi;

/** Uppercase when the reference letter is uppercase. */
function caseLike(letter: string, reference: string): string {
  return reference === reference.toUpperCase() ? letter.toUpperCase() : letter.toLowerCase();
}

function liveFor(token: string, groups: (string | undefined)[]): string {
  const [h, hp, hs, f, fp, fs] = groups;
  if (h !== undefined && hp !== undefined) {
    // hXXp, HXXP, Hxxp: the restored t's take the case of the p beside them.
    const t = caseLike("t", hp);
    return `${h}${t}${t}${hp}${hs ?? ""}`;
  }
  if (f !== undefined && fp !== undefined) return `${f}${caseLike("t", fp)}${fp}${fs ?? ""}`;
  const lower = token.toLowerCase();
  if (lower === "\\.") return ".";
  if (lower === "[://]") return "://";
  if (lower === "[//]") return "//";
  if (lower === "[/]") return "/";
  const inner = lower.slice(1, -1);
  if (inner === "." || inner === "dot") return ".";
  if (inner === "@" || inner === "at") return "@";
  return ":";
}

export interface Normalized {
  /** The text with every defang token rewritten to its live form. */
  text: string;
  /** For each character of `text`, the original offset it came from. */
  starts: Int32Array;
  /** For each character of `text`, the original offset just past its source. */
  ends: Int32Array;
  replacements: number;
}

/** Rewrite every defang token to the live character, keeping an index map. */
export function normalizeDefanged(original: string): Normalized {
  const out: string[] = [];
  const starts = new Int32Array(original.length);
  const ends = new Int32Array(original.length);
  let n = 0;
  let last = 0;
  let replacements = 0;
  DEFANG_TOKEN.lastIndex = 0;
  for (let m = DEFANG_TOKEN.exec(original); m !== null; m = DEFANG_TOKEN.exec(original)) {
    for (let i = last; i < m.index; i++) {
      starts[n] = i;
      ends[n] = i + 1;
      n++;
    }
    out.push(original.slice(last, m.index));
    const live = liveFor(m[0], m.slice(1));
    const tokenEnd = m.index + m[0].length;
    for (let i = 0; i < live.length; i++) {
      starts[n] = m.index;
      ends[n] = tokenEnd;
      n++;
    }
    out.push(live);
    replacements++;
    last = tokenEnd;
  }
  for (let i = last; i < original.length; i++) {
    starts[n] = i;
    ends[n] = i + 1;
    n++;
  }
  out.push(original.slice(last));
  return { text: out.join(""), starts: starts.subarray(0, n), ends: ends.subarray(0, n), replacements };
}

/** Refang every defang token anywhere in the text, indicator or not. */
export function refangAll(text: string): string {
  return normalizeDefanged(text).text;
}

/* --------------------------------------------------------------- parsers */

const OCTET = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * Strict dotted quad: four decimal octets, 0 to 255, no leading zeros.
 * 010.0.0.1 is refused because parsers disagree on it (inet_aton reads the
 * leading zero as octal, others as decimal), so it names no single address.
 */
export function parseIPv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  if (!parts.every((p) => OCTET.test(p))) return null;
  return parts.map(Number);
}

/** RFC 4291 section 2.2 text forms, including :: and a trailing dotted IPv4. Returns null when invalid. */
export function parseIPv6(input: string): bigint | null {
  if (input.length < 2 || input.length > 45) return null;
  const dbl = input.indexOf("::");
  if (dbl !== -1 && input.indexOf("::", dbl + 1) !== -1) return null;
  const head = dbl === -1 ? input : input.slice(0, dbl);
  const tail = dbl === -1 ? "" : input.slice(dbl + 2);
  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === "" ? [] : tail.split(":");
  const lastList = dbl === -1 ? headParts : tailParts;

  let v4: number[] | null = null;
  if (lastList.length > 0 && lastList[lastList.length - 1].includes(".")) {
    v4 = parseIPv4(lastList[lastList.length - 1]);
    if (!v4) return null;
    lastList.pop();
  }
  const groups = [...headParts, ...tailParts];
  if (!groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return null;

  const explicit = groups.length + (v4 ? 2 : 0);
  if (dbl === -1 ? explicit !== 8 : explicit > 7) return null;

  const words: number[] = [
    ...headParts.map((g) => parseInt(g, 16)),
    ...Array.from({ length: dbl === -1 ? 0 : 8 - explicit }, () => 0),
    ...tailParts.map((g) => parseInt(g, 16)),
  ];
  if (v4) words.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
  return words.reduce((acc, w) => (acc << 16n) | BigInt(w), 0n);
}

/**
 * RFC 5952 canonical text: lowercase, no leading zeros, the longest run of
 * two or more zero groups shortened to :: (the first on a tie), and
 * IPv4-mapped addresses in the mixed form section 5 recommends.
 */
export function formatIPv6(value: bigint): string {
  const groups: number[] = [];
  for (let i = 7; i >= 0; i--) groups.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  if (value >> 32n === 0xffffn) {
    const v4 = Number(value & 0xffffffffn);
    return `::ffff:${[24, 16, 8, 0].map((s) => (v4 >>> s) & 0xff).join(".")}`;
  }
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(":");
  return `${hex.slice(0, bestStart).join(":")}::${hex.slice(bestStart + bestLen).join(":")}`;
}

const LABEL = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/;

/** A syntactically valid host name: dot separated labels of 1 to 63 characters, 253 in all. */
export function isHostname(text: string): boolean {
  const name = (text.endsWith(".") ? text.slice(0, -1) : text).toLowerCase();
  if (name === "" || name.length > 253) return false;
  return name.split(".").every((label) => LABEL.test(label)) && /[a-z0-9]/.test(name);
}

export type DomainVerdict = { ok: true; name: string; tld: string; ambiguous: boolean } | { ok: false };

/** A host name of two or more labels whose last label is a delegated TLD. */
export function checkDomain(text: string): DomainVerdict {
  const name = (text.endsWith(".") ? text.slice(0, -1) : text).toLowerCase();
  if (!isHostname(name)) return { ok: false };
  const labels = name.split(".");
  if (labels.length < 2) return { ok: false };
  const tld = labels[labels.length - 1];
  if (!TLDS.has(tld)) return { ok: false };
  return { ok: true, name, tld, ambiguous: AMBIGUOUS_TLDS.has(tld) };
}

/* ------------------------------------------------------------------ URLs */

/** Schemes recognized as URLs. tcp:// and the like are left to the IP and domain scanners. */
export const URL_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "ftp", "ftps", "sftp", "ws", "wss"]);

export type HostKind = "domain" | "ipv4" | "ipv6" | "name";

export interface UrlParts {
  scheme: string;
  /** Text before the @ in the authority, or null when there is none. */
  userinfo: string | null;
  /** The host as written, with brackets for an IPv6 literal. */
  host: string;
  hostKind: HostKind;
  /** Canonical host: lowercase domain, dotted quad, or RFC 5952 IPv6 without brackets. */
  hostValue: string;
  /** Port, path, query and fragment, exactly as written. */
  rest: string;
}

/** Split a live URL into the parts defanging touches. Null when it is not a usable URL. */
export function parseUrl(url: string): UrlParts | null {
  const sep = url.indexOf("://");
  if (sep <= 0) return null;
  const scheme = url.slice(0, sep);
  if (!URL_SCHEMES.has(scheme.toLowerCase())) return null;
  const body = url.slice(sep + 3);
  const authEnd = body.search(/[/?#]/);
  const authority = authEnd === -1 ? body : body.slice(0, authEnd);
  const afterAuthority = authEnd === -1 ? "" : body.slice(authEnd);
  const at = authority.lastIndexOf("@");
  const userinfo = at === -1 ? null : authority.slice(0, at);
  const hostPort = at === -1 ? authority : authority.slice(at + 1);

  let host: string;
  let port: string;
  let hostKind: HostKind;
  let hostValue: string;
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    if (close === -1) return null;
    host = hostPort.slice(0, close + 1);
    port = hostPort.slice(close + 1);
    // RFC 6874 writes a zone ID inside the brackets as %25eth0.
    const literal = host.slice(1, -1).replace(/%.*$/, "");
    const value = parseIPv6(literal);
    if (value === null) return null;
    hostKind = "ipv6";
    hostValue = formatIPv6(value);
  } else {
    const colon = hostPort.indexOf(":");
    host = colon === -1 ? hostPort : hostPort.slice(0, colon);
    port = colon === -1 ? "" : hostPort.slice(colon);
    if (host === "" || !/[A-Za-z0-9]/.test(host) || /[[\]\\<>"'`]/.test(host)) return null;
    const bare = host.endsWith(".") ? host.slice(0, -1) : host;
    if (parseIPv4(bare)) {
      hostKind = "ipv4";
      hostValue = bare;
    } else {
      const domain = checkDomain(bare);
      hostKind = domain.ok ? "domain" : "name";
      hostValue = domain.ok ? domain.name : bare.toLowerCase();
    }
  }
  if (port !== "" && !/^:\d{0,5}$/.test(port)) return null;
  return { scheme, userinfo, host, hostKind, hostValue, rest: port + afterAuthority };
}

/** Lowercase scheme and host; path, query and fragment are case-sensitive and kept. */
export function canonicalUrl(parts: UrlParts): string {
  const user = parts.userinfo === null ? "" : `${parts.userinfo}@`;
  return `${parts.scheme.toLowerCase()}://${user}${parts.host.toLowerCase()}${parts.rest}`;
}

/* -------------------------------------------------------------- matching */

export type NetType = "url" | "email" | "ipv6" | "ipv4" | "domain";

export interface DerivedHost {
  type: "domain" | "ipv4" | "ipv6";
  value: string;
}

export interface NetMatch {
  type: NetType;
  /** Offsets in the original text. */
  start: number;
  end: number;
  /** The characters as written. */
  raw: string;
  /** The same characters with defang tokens rewritten live. */
  fanged: string;
  /** Canonical form, used to deduplicate. */
  value: string;
  /** True when the original was written in a defanged form. */
  defanged: boolean;
  /** A URL found inside another URL's query string. */
  nested: boolean;
  /** The host of a URL, or the domain of an email address, when it is a domain or an IP. */
  host: DerivedHost | null;
}

export interface FindOptions {
  /** Report live names that end in a file extension TLD (setup.py) as domains. */
  keepAmbiguous?: boolean;
}

export interface FindResult {
  matches: NetMatch[];
  /** Distinct live names skipped as probable file names, first few only. */
  skippedFileNames: string[];
  skippedFileNameCount: number;
  normalized: Normalized;
}

/** Listed skipped file names stop at this many; all are counted. */
export const SKIPPED_LISTED = 12;

const URL_BODY_STOP = /[\s<>"'`{}|\\^\u0000-\u001f\u007f]/;
const SCHEME_CHAR = /[A-Za-z0-9+.-]/;
const LOCAL_CHAR = /[A-Za-z0-9._%+-]/;
const HOST_CHAR = /[A-Za-z0-9_.-]/;
const WORDISH = /[A-Za-z0-9_]/;

/** Drop trailing sentence punctuation and closing brackets the URL did not open. */
function trimUrlBody(body: string): string {
  let out = body;
  for (;;) {
    const last = out.charAt(out.length - 1);
    if (last === "") return out;
    if (".,;:!?*".includes(last)) {
      out = out.slice(0, -1);
      continue;
    }
    const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    const opener = pairs[last];
    if (opener) {
      const opens = out.split(opener).length - 1;
      const closes = out.split(last).length - 1;
      if (closes > opens) {
        out = out.slice(0, -1);
        continue;
      }
    }
    return out;
  }
}

export function findNetworkIndicators(original: string, options: FindOptions = {}): FindResult {
  const normalized = normalizeDefanged(original);
  const text = normalized.text;
  const mask = new Uint8Array(text.length);
  const matches: NetMatch[] = [];
  const skipped = new Set<string>();
  let skippedCount = 0;

  const make = (type: NetType, a: number, b: number, value: string, nested: boolean, host: DerivedHost | null): NetMatch => {
    const start = normalized.starts[a];
    const end = normalized.ends[b - 1];
    const raw = original.slice(start, end);
    const fanged = text.slice(a, b);
    return { type, start, end, raw, fanged, value, defanged: raw !== fanged, nested, host };
  };
  const masked = (a: number, b: number): boolean => {
    for (let i = a; i < b; i++) if (mask[i]) return true;
    return false;
  };
  const cover = (a: number, b: number) => mask.fill(1, a, b);

  // 1. URLs. Every "://" is a candidate; one inside an earlier URL is a nested URL.
  let outerEnd = -1;
  for (let k = text.indexOf("://"); k !== -1; k = text.indexOf("://", k + 3)) {
    let s = k;
    while (s > 0 && SCHEME_CHAR.test(text.charAt(s - 1))) s--;
    const scheme = text.slice(s, k);
    if (!URL_SCHEMES.has(scheme.toLowerCase())) continue;
    const nested = s < outerEnd;
    let e = k + 3;
    const limit = nested ? outerEnd : text.length;
    while (e < limit && !URL_BODY_STOP.test(text.charAt(e)) && !(nested && text.charAt(e) === "&")) e++;
    const body = trimUrlBody(text.slice(k + 3, e));
    const parts = parseUrl(`${scheme}://${body}`);
    if (!parts) continue;
    const b = k + 3 + body.length;
    const host: DerivedHost | null =
      parts.hostKind === "name" ? null : { type: parts.hostKind, value: parts.hostValue };
    matches.push(make("url", s, b, canonicalUrl(parts), nested, host));
    if (!nested) {
      cover(s, b);
      outerEnd = b;
    }
  }

  // 2. Email addresses: a dot-atom local part, an @, and a domain with a real TLD.
  // The local part allowed here is the common subset of RFC 5322, not all of it.
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    if (mask[at]) continue;
    let s = at;
    while (s > 0 && LOCAL_CHAR.test(text.charAt(s - 1))) s--;
    while (s < at && text.charAt(s) === ".") s++;
    let e = at + 1;
    while (e < text.length && HOST_CHAR.test(text.charAt(e))) e++;
    while (e > at + 1 && ".-_".includes(text.charAt(e - 1))) e--;
    const local = text.slice(s, at);
    const domainText = text.slice(at + 1, e);
    if (local === "" || local.length > 64 || local.endsWith(".") || local.includes("..")) continue;
    if (masked(s, e)) continue;
    const domain = checkDomain(domainText);
    if (!domain.ok) continue;
    matches.push(make("email", s, e, `${local}@${domain.name}`, false, { type: "domain", value: domain.name }));
    cover(s, e);
  }

  // 3. IPv6: maximal runs of hex digits, colons and dots, not glued to a word.
  const v6Run = /[0-9A-Fa-f:.]+/g;
  for (let m = v6Run.exec(text); m !== null; m = v6Run.exec(text)) {
    const a = m.index;
    let b = a + m[0].length;
    if (WORDISH.test(text.charAt(a - 1)) || WORDISH.test(text.charAt(b))) continue;
    while (b > a && text.charAt(b - 1) === ".") b--;
    // "from 2001:db8::5: refused" ends the address with a colon of punctuation.
    if (text.charAt(b - 1) === ":" && text.charAt(b - 2) !== ":") b--;
    const cand = text.slice(a, b);
    if ((cand.match(/:/g) ?? []).length < 2 || !/[0-9A-Fa-f]/.test(cand)) continue;
    if (masked(a, b)) continue;
    const value = parseIPv6(cand);
    if (value === null) continue;
    matches.push(make("ipv6", a, b, formatIPv6(value), false, null));
    cover(a, b);
  }

  // 4. IPv4 and domains: maximal runs of host characters, trimmed of edge punctuation.
  const hostRun = /[A-Za-z0-9_.-]+/g;
  for (let m = hostRun.exec(text); m !== null; m = hostRun.exec(text)) {
    let a = m.index;
    let b = a + m[0].length;
    while (a < b && ".-_".includes(text.charAt(a))) a++;
    while (b > a && ".-_".includes(text.charAt(b - 1))) b--;
    if (a >= b || !text.slice(a, b).includes(".")) continue;
    if (masked(m.index, m.index + m[0].length)) continue;
    const cand = text.slice(a, b);
    if (parseIPv4(cand)) {
      matches.push(make("ipv4", a, b, cand, false, null));
      continue;
    }
    const domain = checkDomain(cand);
    if (!domain.ok) continue;
    const match = make("domain", a, b, domain.name, false, null);
    if (domain.ambiguous && !match.defanged && !options.keepAmbiguous) {
      skippedCount++;
      if (skipped.size < SKIPPED_LISTED) skipped.add(domain.name);
      continue;
    }
    matches.push(match);
  }

  matches.sort((x, y) => x.start - y.start || Number(x.nested) - Number(y.nested));
  return { matches, skippedFileNames: [...skipped], skippedFileNameCount: skippedCount, normalized };
}

/* -------------------------------------------------------------- defanging */

export interface DefangStyle {
  /** http becomes hxxp (case kept), or hXXp, or is left alone. */
  scheme: "hxxp" | "hXXp" | "keep";
  dot: "[.]" | "(.)" | "[dot]";
  /** Every dot in a host, or only the last one. */
  dotScope: "all" | "last";
  /** :// becomes [:]// or [://], or is left alone. */
  urlColon: "keep" | "[:]" | "[://]";
  at: "[@]" | "[at]" | "keep";
  /** Write every colon of an IPv6 address as [:]. */
  ipv6Colon: boolean;
}

export const DEFAULT_STYLE: DefangStyle = {
  scheme: "hxxp",
  dot: "[.]",
  dotScope: "all",
  urlColon: "keep",
  at: "[@]",
  ipv6Colon: true,
};

const DEFANGABLE_SCHEMES = new Set(["http", "https", "ftp", "ftps"]);

function defangScheme(scheme: string, style: DefangStyle): string {
  if (style.scheme === "keep" || !DEFANGABLE_SCHEMES.has(scheme.toLowerCase())) return scheme;
  return scheme.replace(/t/gi, (c) => (style.scheme === "hXXp" || c === "T" ? "X" : "x"));
}

function colonSlashes(style: DefangStyle): string {
  if (style.urlColon === "[:]") return "[:]//";
  if (style.urlColon === "[://]") return "[://]";
  return "://";
}

function defangDots(name: string, style: DefangStyle): string {
  const trailing = name.endsWith(".") && name.length > 1;
  const body = trailing ? name.slice(0, -1) : name;
  let out: string;
  if (style.dotScope === "last") {
    const i = body.lastIndexOf(".");
    out = i === -1 ? body : `${body.slice(0, i)}${style.dot}${body.slice(i + 1)}`;
  } else {
    out = body.split(".").join(style.dot);
  }
  return trailing ? `${out}.` : out;
}

function defangIPv6(text: string, style: DefangStyle): string {
  const colons = style.ipv6Colon ? text.split(":").join("[:]") : text;
  return colons.includes(".") ? defangDots(colons, { ...style, dotScope: "all" }) : colons;
}

function atSign(style: DefangStyle): string {
  return style.at === "keep" ? "@" : style.at;
}

/**
 * Defang one live indicator. `fanged` is the indicator as written, with any
 * earlier defanging already reversed, so re-defanging is idempotent and an
 * indicator in one style comes out in the chosen one.
 */
export function defangIndicator(type: NetType, fanged: string, style: DefangStyle): string {
  switch (type) {
    case "domain":
    case "ipv4":
      return defangDots(fanged, style);
    case "ipv6":
      return defangIPv6(fanged, style);
    case "email": {
      const at = fanged.lastIndexOf("@");
      return `${fanged.slice(0, at)}${atSign(style)}${defangDots(fanged.slice(at + 1), style)}`;
    }
    case "url": {
      const parts = parseUrl(fanged);
      if (!parts) return fanged;
      const user = parts.userinfo === null ? "" : `${parts.userinfo}${atSign(style)}`;
      const host =
        parts.hostKind === "ipv6" ? `[${defangIPv6(parts.host.slice(1, -1), style)}]` : defangDots(parts.host, style);
      // A URL in the query string (?next=http://...) would still be picked up
      // by an autolinker on its own, so its scheme is broken too.
      const rest = parts.rest.replace(
        /(^|[^A-Za-z0-9+.-])(https?|ftps?):\/\//gi,
        (_m, lead: string, scheme: string) => `${lead}${defangScheme(scheme, style)}${colonSlashes(style)}`,
      );
      return `${defangScheme(parts.scheme, style)}${colonSlashes(style)}${user}${host}${rest}`;
    }
  }
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * The everything mode for one whitespace-free word: every scheme, every
 * ://, every dot between two letters or digits, and every @ inside the word.
 * It catches internal names the TLD list cannot (db01.corp), and it also
 * rewrites version numbers, file names and abbreviations, which is the
 * trade the strict mode exists to avoid.
 */
function looseDefangWord(word: string, style: DefangStyle): string {
  const schemed = word
    .replace(/(^|[^A-Za-z0-9+.-])(https?|ftps?)(?=:\/\/)/gi, (_m, lead: string, scheme: string) => `${lead}${defangScheme(scheme, style)}`)
    .split("://")
    .join(colonSlashes(style));
  const chars = Array.from(schemed);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "." && i > 0 && i < chars.length - 1 && LETTER_OR_DIGIT.test(chars[i - 1]) && LETTER_OR_DIGIT.test(chars[i + 1])) {
      out += style.dot;
    } else if (c === "@" && i > 0 && i < chars.length - 1) {
      out += atSign(style);
    } else {
      out += c;
    }
  }
  return out;
}

/* -------------------------------------------------------------- transform */

export type Direction = "defang" | "refang";
export type Scope = "strict" | "everything";

export interface TransformOptions {
  direction: Direction;
  scope: Scope;
  style: DefangStyle;
  /** Strict mode only: also treat live names like setup.py as domains. */
  keepAmbiguous?: boolean;
}

export type ChangeKind = NetType | "other";

export interface Change {
  /** 1-based line number in the input. */
  line: number;
  kind: ChangeKind;
  before: string;
  after: string;
}

export type TransformResult =
  | { ok: false; error: string }
  | {
      ok: true;
      output: string;
      lines: number;
      changes: Change[];
      changeCount: number;
      byKind: Record<ChangeKind, number>;
      skippedFileNames: string[];
      skippedFileNameCount: number;
    };

/** Offsets where each line starts, for turning an offset into a line number. */
export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) out.push(i + 1);
  return out;
}

/** 1-based line containing `offset`. */
export function lineOf(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function emptyKindCounts(): Record<ChangeKind, number> {
  return { url: 0, email: 0, ipv6: 0, ipv4: 0, domain: 0, other: 0 };
}

export function tooLongMessage(length: number): string {
  return `That is ${length.toLocaleString("en-US")} characters. This tool reads up to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters (about 1 MB) at a time, so split the text and run it in parts.`;
}

/**
 * Defang or refang a block of text, line by line, leaving everything that is
 * not an indicator exactly as written. In strict scope only recognized
 * indicators change; in everything scope every defang token (refang) or every
 * dot, @ and scheme inside a word (defang) changes as well.
 */
export function transform(input: string, options: TransformOptions): TransformResult {
  if (input.length > MAX_INPUT_CHARS) return { ok: false, error: tooLongMessage(input.length) };
  const everything = options.scope === "everything";
  // Everything mode rewrites every dot anyway, so "last dot only" would only
  // make recognized indicators look different from the words around them.
  const style: DefangStyle = everything ? { ...options.style, dotScope: "all" } : options.style;
  const found = findNetworkIndicators(input, { keepAmbiguous: everything || options.keepAmbiguous });
  const starts = lineStarts(input);
  const changes: Change[] = [];
  const byKind = emptyKindCounts();
  let changeCount = 0;
  const out: string[] = [];

  const record = (offset: number, kind: ChangeKind, before: string, after: string) => {
    changeCount++;
    byKind[kind]++;
    if (changes.length < MAX_CHANGES_LISTED) changes.push({ line: lineOf(starts, offset), kind, before, after });
  };

  const gap = (from: number, to: number) => {
    const segment = input.slice(from, to);
    if (!everything || segment === "") {
      out.push(segment);
      return;
    }
    let offset = from;
    for (const piece of segment.split(/(\s+)/)) {
      if (piece !== "" && !/^\s+$/.test(piece)) {
        const live = refangAll(piece);
        const next = options.direction === "refang" ? live : looseDefangWord(live, style);
        if (next !== piece) record(offset, "other", piece, next);
        out.push(next);
      } else {
        out.push(piece);
      }
      offset += piece.length;
    }
  };

  let cursor = 0;
  for (const m of found.matches) {
    if (m.nested || m.start < cursor) continue;
    gap(cursor, m.start);
    const next = options.direction === "refang" ? m.fanged : defangIndicator(m.type, m.fanged, style);
    if (next !== m.raw) record(m.start, m.type, m.raw, next);
    out.push(next);
    cursor = m.end;
  }
  gap(cursor, input.length);

  return {
    ok: true,
    output: out.join(""),
    lines: starts.length,
    changes,
    changeCount,
    byKind,
    skippedFileNames: everything ? [] : found.skippedFileNames,
    skippedFileNameCount: everything ? 0 : found.skippedFileNameCount,
  };
}

/**
 * The first line where two texts differ, or null when they are equal. Used to
 * prove a defang was lossless: refanging the output must give back the same
 * live text as refanging the input.
 */
export function firstDifferentLine(a: string, b: string): number | null {
  if (a === b) return null;
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) if (la[i] !== lb[i]) return i + 1;
  return null;
}
