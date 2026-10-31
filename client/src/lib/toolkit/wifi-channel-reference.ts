/**
 * Wi-Fi channel plan data and arithmetic for 2.4, 5 and 6 GHz.
 *
 * Channel to frequency follows IEEE 802.11 (the same mapping the Linux
 * kernel's ieee80211_channel_to_freq_khz implements):
 *   2.4 GHz: 2407 + 5n MHz for n = 1 to 13, and 2484 MHz for channel 14
 *   5 GHz:   5000 + 5n MHz
 *   6 GHz:   5950 + 5n MHz (channel 2 at 5935 MHz is a separate case)
 *
 * A bonded channel is named by the channel number at its center, so its
 * center frequency comes from the same formula. The 20 MHz members of a
 * bonded channel of width W are W / 20 channels, four channel numbers
 * apart, centered on that number.
 *
 * Which channels exist and what they require is US FCC (Part 15 subpart E
 * for 5 and 6 GHz). Other regions are summarized in the notes, never
 * encoded as allow lists, because they vary country by country.
 *
 * Pure data and functions, no React and no DOM.
 */

export type Band = "2.4" | "5" | "6";
export type Width = 20 | 40 | 80 | 160 | 320;
export type UsStatus = "allowed" | "low-power" | "not-allowed";
export type Mask = 20 | 22;

export interface Channel20 {
  band: Band;
  channel: number;
  centerMHz: number;
  lowMHz: number;
  highMHz: number;
  subband: string;
  dfs: boolean;
  /** 6 GHz preferred scanning channel. */
  psc: boolean;
  us: UsStatus;
  unii4: boolean;
}

export interface Bonded {
  band: Band;
  width: Width;
  /** Center channel number. */
  channel: number;
  centerMHz: number;
  lowMHz: number;
  highMHz: number;
  members: number[];
  subbands: string[];
  dfs: boolean;
  dfsMembers: number[];
  pscMembers: number[];
  unii4: boolean;
  /** 6 GHz only: every member is in UNII-5 or UNII-7. */
  standardPower: boolean;
  /** 320 MHz only: which of the two overlapping sets. */
  set: "320-1" | "320-2" | null;
}

export interface SubBand {
  name: string;
  lowMHz: number;
  highMHz: number;
  summary: string;
  available: boolean;
}

export const BANDS: Band[] = ["2.4", "5", "6"];

export const BAND_LABEL: Record<Band, string> = { "2.4": "2.4 GHz", "5": "5 GHz", "6": "6 GHz" };

export const BAND_WIDTHS: Record<Band, Width[]> = {
  "2.4": [20, 40],
  "5": [20, 40, 80, 160],
  "6": [20, 40, 80, 160, 320],
};

/* ------------------------------------------------------------ frequencies */

const CH24 = Array.from({ length: 14 }, (_, i) => i + 1);
const CH5 = [
  36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165,
  169, 173, 177,
];
const CH6 = Array.from({ length: 59 }, (_, i) => 1 + 4 * i);

/** The 6 GHz preferred scanning channels: 5 and every sixteenth channel after it. */
export const PSC = Array.from({ length: 15 }, (_, i) => 5 + 16 * i);

/** Center frequency of any channel number in a band, bonded centers included; null if the formula does not apply. */
export function centerFrequency(band: Band, channel: number): number | null {
  if (!Number.isInteger(channel)) return null;
  if (band === "2.4") {
    if (channel === 14) return 2484;
    return channel >= 1 && channel <= 13 ? 2407 + 5 * channel : null;
  }
  // 5 GHz numbers above 177 include the 4.9 GHz channels (4000 + 5n), so stop here.
  if (band === "5") return channel >= 1 && channel <= 177 ? 5000 + 5 * channel : null;
  // 802.11ax: 6 GHz channel 2 is the one exception, at 5935 MHz (as in ieee80211_channel_to_freq_khz).
  if (channel === 2) return 5935;
  return channel >= 1 && channel <= 233 ? 5950 + 5 * channel : null;
}

export function formulaText(band: Band, channel: number): string {
  if (band === "2.4") return channel === 14 ? "special case: 2484" : `2407 + 5 × ${channel}`;
  if (band === "5") return `5000 + 5 × ${channel}`;
  return channel === 2 ? "special case: 5935" : `5950 + 5 × ${channel}`;
}

/* --------------------------------------------------------------- channels */

function subband5(ch: number): string {
  if (ch <= 48) return "UNII-1";
  if (ch <= 64) return "UNII-2A";
  if (ch <= 144) return "UNII-2C";
  if (ch <= 165) return "UNII-3";
  return "UNII-4";
}

function subband6(ch: number): string {
  if (ch <= 93) return "UNII-5";
  if (ch <= 113) return "UNII-6";
  if (ch <= 181) return "UNII-7";
  if (ch === 185) return "UNII-7/8";
  return "UNII-8";
}

function build(band: Band, ch: number): Channel20 {
  const centerMHz = centerFrequency(band, ch) as number;
  if (band === "2.4") {
    return {
      band,
      channel: ch,
      centerMHz,
      lowMHz: centerMHz - 10,
      highMHz: centerMHz + 10,
      subband: "ISM",
      dfs: false,
      psc: false,
      us: ch <= 11 ? "allowed" : ch <= 13 ? "low-power" : "not-allowed",
      unii4: false,
    };
  }
  const subband = band === "5" ? subband5(ch) : subband6(ch);
  return {
    band,
    channel: ch,
    centerMHz,
    lowMHz: centerMHz - 10,
    highMHz: centerMHz + 10,
    subband,
    dfs: band === "5" && ((ch >= 52 && ch <= 64) || (ch >= 100 && ch <= 144)),
    psc: band === "6" && PSC.includes(ch),
    us: "allowed",
    unii4: subband === "UNII-4",
  };
}

const CHANNELS: Record<Band, Channel20[]> = {
  "2.4": CH24.map((c) => build("2.4", c)),
  "5": CH5.map((c) => build("5", c)),
  "6": CH6.map((c) => build("6", c)),
};

export function channels(band: Band): Channel20[] {
  return CHANNELS[band];
}

export function getChannel(band: Band, channel: number): Channel20 | null {
  return CHANNELS[band].find((c) => c.channel === channel) ?? null;
}

/* ---------------------------------------------------------------- bonding */

/** US bonded center channels, from the 802.11 channel tables. */
const BONDED_CENTERS: Record<"5" | "6", Partial<Record<Width, number[]>>> = {
  "5": {
    40: [38, 46, 54, 62, 102, 110, 118, 126, 134, 142, 151, 159, 167, 175],
    80: [42, 58, 106, 122, 138, 155, 171],
    160: [50, 114, 163],
  },
  "6": {
    40: Array.from({ length: 29 }, (_, i) => 3 + 8 * i),
    80: Array.from({ length: 14 }, (_, i) => 7 + 16 * i),
    160: Array.from({ length: 7 }, (_, i) => 15 + 32 * i),
    320: [31, 63, 95, 127, 159, 191],
  },
};

export function membersOf(center: number, width: Width): number[] {
  const n = width / 20;
  const first = center - 2 * (n - 1);
  return Array.from({ length: n }, (_, i) => first + 4 * i);
}

function makeBonded(band: "5" | "6", width: Width, center: number): Bonded {
  const members = membersOf(center, width);
  const chans = members.map((m) => getChannel(band, m)).filter((c): c is Channel20 => c !== null);
  const centerMHz = centerFrequency(band, center) as number;
  const subbands = Array.from(new Set(chans.map((c) => c.subband)));
  return {
    band,
    width,
    channel: center,
    centerMHz,
    lowMHz: centerMHz - width / 2,
    highMHz: centerMHz + width / 2,
    members,
    subbands,
    dfs: chans.some((c) => c.dfs),
    dfsMembers: chans.filter((c) => c.dfs).map((c) => c.channel),
    pscMembers: chans.filter((c) => c.psc).map((c) => c.channel),
    unii4: chans.some((c) => c.unii4),
    standardPower: band === "6" && chans.every((c) => c.subband === "UNII-5" || c.subband === "UNII-7"),
    set: width === 320 ? ((center - 31) % 64 === 0 ? "320-1" : "320-2") : null,
  };
}

export function bondedChannels(band: Band, width: Width): Bonded[] {
  if (band === "2.4" || width === 20) return [];
  return (BONDED_CENTERS[band][width] ?? []).map((c) => makeBonded(band, width, c));
}

export function findBonded(band: Band, width: Width, center: number): Bonded | null {
  return bondedChannels(band, width).find((b) => b.channel === center) ?? null;
}

/** Every bonded channel, at every width, that contains this 20 MHz channel. */
export function containing(band: Band, channel: number): Bonded[] {
  const out: Bonded[] = [];
  for (const width of BAND_WIDTHS[band]) {
    for (const b of bondedChannels(band, width)) if (b.members.includes(channel)) out.push(b);
  }
  return out;
}

/* -------------------------------------------------------- 2.4 GHz overlap */

/**
 * Two transmissions of width W overlap when their centers are less than W
 * apart. 20 MHz is the OFDM width (802.11g and later); 22 MHz is the
 * 802.11b DSSS width that the 1, 6, 11 plan was built around.
 */
export function overlapping24(channel: number, mask: Mask): number[] {
  const fc = centerFrequency("2.4", channel);
  if (fc === null) return [];
  return CH24.filter((m) => m !== channel && Math.abs((centerFrequency("2.4", m) as number) - fc) < mask);
}

/** Channels whose span overlaps an arbitrary [low, high] range, given each channel's mask. */
export function overlappingRange24(lowMHz: number, highMHz: number, mask: Mask): number[] {
  const half = mask / 2;
  return CH24.filter((m) => {
    const fc = centerFrequency("2.4", m) as number;
    return fc - half < highMHz && fc + half > lowMHz;
  });
}

export interface Ht40Option {
  direction: "above" | "below";
  primary: number;
  secondary: number;
  centerChannel: number;
  centerMHz: number;
  lowMHz: number;
  highMHz: number;
  /** Primary and secondary both within US channels 1 to 11. */
  us: boolean;
  /** Primary and secondary both within channels 1 to 13. */
  etsi: boolean;
}

/** 802.11n HT40 in 2.4 GHz: the secondary channel sits four channel numbers above (HT40+) or below (HT40-). */
export function ht40Options(primary: number): Ht40Option[] {
  if (!Number.isInteger(primary) || primary < 1 || primary > 13) return [];
  const fc = centerFrequency("2.4", primary) as number;
  const out: Ht40Option[] = [];
  for (const direction of ["above", "below"] as const) {
    const secondary = direction === "above" ? primary + 4 : primary - 4;
    if (secondary < 1 || secondary > 13) continue;
    const centerMHz = direction === "above" ? fc + 10 : fc - 10;
    out.push({
      direction,
      primary,
      secondary,
      centerChannel: direction === "above" ? primary + 2 : primary - 2,
      centerMHz,
      lowMHz: centerMHz - 20,
      highMHz: centerMHz + 20,
      us: primary <= 11 && secondary <= 11,
      etsi: true,
    });
  }
  return out;
}

/* -------------------------------------------------------------- sub-bands */

export const SUBBANDS: Record<Band, SubBand[]> = {
  "2.4": [
    {
      name: "ISM",
      lowMHz: 2400,
      highMHz: 2483.5,
      summary: "Unlicensed ISM band shared with Bluetooth, Zigbee, microwave ovens and more.",
      available: true,
    },
  ],
  "5": [
    { name: "UNII-1", lowMHz: 5150, highMHz: 5250, summary: "No DFS.", available: true },
    { name: "UNII-2A", lowMHz: 5250, highMHz: 5350, summary: "DFS required.", available: true },
    { name: "UNII-2B", lowMHz: 5350, highMHz: 5470, summary: "Not available for Wi-Fi in the US.", available: false },
    { name: "UNII-2C", lowMHz: 5470, highMHz: 5725, summary: "DFS required. Also called UNII-2 Extended.", available: true },
    { name: "UNII-3", lowMHz: 5725, highMHz: 5850, summary: "No DFS.", available: true },
    { name: "UNII-4", lowMHz: 5850, highMHz: 5895, summary: "Indoor use, opened by the FCC in 2020.", available: true },
  ],
  "6": [
    { name: "UNII-5", lowMHz: 5925, highMHz: 6425, summary: "Low power indoor and standard power (AFC).", available: true },
    { name: "UNII-6", lowMHz: 6425, highMHz: 6525, summary: "Low power indoor. No standard power.", available: true },
    { name: "UNII-7", lowMHz: 6525, highMHz: 6875, summary: "Low power indoor and standard power (AFC).", available: true },
    { name: "UNII-8", lowMHz: 6875, highMHz: 7125, summary: "Low power indoor. No standard power.", available: true },
  ],
};

/* ------------------------------------------------------- regulatory notes */

export interface RegNotes {
  us: string[];
  elsewhere: string[];
}

const DFS_US =
  "DFS required. Under FCC rules the access point listens for radar for 60 seconds before transmitting, leaves within 10 seconds of detecting it, and stays off the channel for 30 minutes.";

const US_5: Record<string, string[]> = {
  "UNII-1": ["No DFS.", "Indoor and outdoor use have both been allowed in the US since the FCC's 2014 rule changes."],
  "UNII-2A": [DFS_US],
  "UNII-2C": [DFS_US],
  "UNII-3": [
    "No DFS.",
    "Point to point links here may use high gain antennas without reducing transmit power, which makes this sub-band common for outdoor bridges.",
  ],
  "UNII-4": [
    "Opened by the FCC for unlicensed indoor use in 2020.",
    "Not every access point or client supports it, and a client without support will not see a network here.",
  ],
};

const ELSEWHERE_5: Record<string, string[]> = {
  "UNII-1": [
    "Europe (ETSI): indoor use, up to 200 mW EIRP, no DFS.",
    "Nearly every region allows these four channels, which makes them the safe choice for clients without DFS support.",
  ],
  "UNII-2A": ["Europe: indoor use, 200 mW EIRP, with DFS and transmit power control (TPC)."],
  "UNII-2C": ["Europe: indoor and outdoor, up to 1 W EIRP, with DFS and TPC."],
  "UNII-3": [
    "Europe: not part of the harmonized Wi-Fi allocation. Some countries allow it at low power or under national rules, so check the local regulator.",
  ],
  "UNII-4": ["Few regulators outside the US allow Wi-Fi here."],
};

const SP_US =
  "Standard power is allowed when an Automated Frequency Coordination (AFC) system clears the channel for the access point's location: up to 23 dBm/MHz and 36 dBm EIRP.";
const LPI_US =
  "Low power indoor (LPI): up to 5 dBm/MHz EIRP for access points, which must be indoor units with integrated antennas, not weatherized and not battery powered.";

const VLP_US =
  "Very low power (VLP) devices, which the FCC authorized in 2023, may also use UNII-5 and UNII-7 indoors or outdoors without AFC, at far lower power.";

const US_6: Record<string, string[]> = {
  "UNII-5": [LPI_US, SP_US, VLP_US],
  "UNII-6": [LPI_US, "Standard power is not allowed in UNII-6."],
  "UNII-7": [LPI_US, SP_US, VLP_US],
  "UNII-8": [LPI_US, "Standard power is not allowed in UNII-8."],
  "UNII-7/8": [
    LPI_US,
    "This channel straddles 6875 MHz, the UNII-7 and UNII-8 boundary. Standard power is limited to UNII-5 and UNII-7, so it does not apply here.",
  ],
};

const LOWER_6_ELSEWHERE =
  "Inside the lower part of the band that Europe (5945 to 6425 MHz), the UK and Japan opened for low power indoor and very low power devices.";
const UPPER_6_ELSEWHERE =
  "Above 6425 MHz: Canada, South Korea and Brazil opened the full band to Wi-Fi, as the US did. Europe, the UK and Japan first opened only the lower part, and decisions on the upper part vary by country.";

function uniq(list: string[]): string[] {
  return Array.from(new Set(list));
}

export function channelNotes(band: Band, channel: number): RegNotes {
  const c = getChannel(band, channel);
  if (!c) return { us: [], elsewhere: [] };

  if (band === "2.4") {
    const us: string[] = [];
    const elsewhere: string[] = [];
    if (c.us === "allowed") us.push("Allowed.");
    if ([1, 6, 11].includes(channel)) {
      us.push("One of the three channels in the US 1 to 11 range that do not overlap each other.");
    }
    if (c.us === "low-power") {
      us.push(
        "Allowed only at reduced power, to keep emissions out of the restricted band above 2483.5 MHz. Most US equipment does not offer it.",
      );
    }
    if (c.us === "not-allowed") us.push("Not allowed.");
    if (channel <= 13) {
      elsewhere.push("Allowed in Europe (ETSI), Japan and most other regions.");
      if ([1, 5, 9, 13].includes(channel)) {
        elsewhere.push("Part of the 1, 5, 9, 13 plan that fits four 20 MHz OFDM networks where channel 13 is allowed.");
      }
    } else {
      elsewhere.push("Japan only, and only for 802.11b (DSSS and CCK). 802.11g and later never use it.");
    }
    return { us, elsewhere };
  }

  if (band === "5") {
    const us = [...(US_5[c.subband] ?? [])];
    const elsewhere = [...(ELSEWHERE_5[c.subband] ?? [])];
    if (channel >= 120 && channel <= 128) {
      us.push(
        "5600 to 5650 MHz overlaps Terminal Doppler Weather Radar at airports. US devices were required to avoid it for years; current rules allow it with stricter radar detection, but some equipment still leaves these channels out.",
      );
      elsewhere.push("Europe: weather radar band, where the channel availability check lasts 10 minutes instead of 1.");
    }
    if (channel === 144) {
      us.push(
        "Straddles 5725 MHz, the UNII-2C and UNII-3 boundary, and reached US equipment later than its neighbors, to complete the 132 to 144 group. Older clients often cannot use it.",
      );
      elsewhere.push("Europe: not allowed, because the channel extends past 5725 MHz.");
    }
    if (channel === 169) {
      us.push("Straddles 5850 MHz, the UNII-3 and UNII-4 boundary, so it needs UNII-4 support even though half of it is in UNII-3.");
    }
    if (channel === 165) {
      us.push("Its 40 MHz partner, 169, is in UNII-4, so without UNII-4 support channel 165 is 20 MHz only.");
    }
    return { us, elsewhere };
  }

  const us = [...(US_6[c.subband] ?? [])];
  if (c.psc) {
    us.push(
      "Preferred scanning channel. Access points are encouraged to put their primary 20 MHz channel on one of the 15 PSCs, so a client searching 6 GHz without other information can scan those instead of all 59.",
    );
  }
  const elsewhere = [c.channel <= 93 ? LOWER_6_ELSEWHERE : UPPER_6_ELSEWHERE];
  return { us, elsewhere };
}

export function bondedNotes(b: Bonded): RegNotes {
  const us: string[] = [];
  const elsewhere: string[] = [];
  for (const m of b.members) {
    const n = channelNotes(b.band, m);
    us.push(...n.us);
    elsewhere.push(...n.elsewhere);
  }
  const extra: string[] = [];
  if (b.unii4) extra.push("Needs UNII-4 support on both the access point and the client.");
  if (b.dfs && b.dfsMembers.length < b.members.length) {
    extra.push(
      `Mixes DFS and non-DFS channels: radar on any of ${b.dfsMembers.join(", ")} forces the whole ${b.width} MHz channel to move or narrow.`,
    );
  } else if (b.dfs) {
    extra.push(`Every member is a DFS channel, so radar anywhere in the ${b.width} MHz span forces a move.`);
  }
  if (b.band === "6" && !b.standardPower) {
    extra.push("Not every member is in UNII-5 or UNII-7, so standard power under AFC is not available on this channel.");
  }
  return { us: uniq([...extra, ...us]), elsewhere: uniq(elsewhere) };
}

export function ht40Notes(o: Ht40Option): RegNotes {
  const us = [
    o.us
      ? "Allowed: both halves are within channels 1 to 11."
      : "Not usable on most US equipment: one half falls on channel 12 or 13.",
    "Under the 802.11n 20/40 coexistence rules, a 2.4 GHz access point scans for neighboring networks before using 40 MHz and falls back to 20 MHz when their channels conflict or when any station reports itself Forty MHz Intolerant.",
  ];
  const elsewhere = ["Allowed in Europe and most regions with channels 1 to 13."];
  return { us, elsewhere };
}

/* ---------------------------------------------------------------- lookup */

export type Lookup =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "found"; band: Band; width: Width; channel: number; note: string | null };

export const MAX_LOOKUP_LENGTH = 40;

interface Match {
  band: Band;
  width: Width;
  channel: number;
}

function matchesForNumber(n: number): Match[] {
  const out: Match[] = [];
  for (const band of BANDS) {
    if (getChannel(band, n)) out.push({ band, width: 20, channel: n });
    for (const width of BAND_WIDTHS[band]) {
      if (findBonded(band, width, n)) out.push({ band, width, channel: n });
    }
  }
  return out;
}

function describe(m: Match): string {
  return m.width === 20
    ? `${BAND_LABEL[m.band]} channel ${m.channel}`
    : `${BAND_LABEL[m.band]} ${m.width} MHz channel ${m.channel}`;
}

function byFrequency(mhz: number): Lookup {
  // Exact 20 MHz centers first, then bonded centers, then the channel whose span contains it.
  for (const band of BANDS) {
    const c = CHANNELS[band].find((x) => x.centerMHz === mhz);
    if (c) return { kind: "found", band, width: 20, channel: c.channel, note: null };
  }
  for (const band of ["5", "6"] as const) {
    for (const width of BAND_WIDTHS[band]) {
      const b = bondedChannels(band, width).find((x) => x.centerMHz === mhz);
      if (b) {
        return {
          kind: "found",
          band,
          width,
          channel: b.channel,
          note: `${mhz} MHz is the center of a ${width} MHz channel, not of a 20 MHz one.`,
        };
      }
    }
  }
  let best: Channel20 | null = null;
  for (const band of BANDS) {
    for (const c of CHANNELS[band]) {
      if (mhz >= c.lowMHz && mhz <= c.highMHz) {
        if (!best || Math.abs(c.centerMHz - mhz) < Math.abs(best.centerMHz - mhz)) best = c;
      }
    }
  }
  if (best) {
    return {
      kind: "found",
      band: best.band,
      width: 20,
      channel: best.channel,
      note: `${mhz} MHz is not a channel center. The nearest center is channel ${best.channel} at ${best.centerMHz} MHz.`,
    };
  }
  if (mhz > 5730 && mhz < 5735) {
    return {
      kind: "error",
      message: `${mhz} MHz falls in the 5 MHz between channel 144 (which ends at 5730 MHz) and channel 149 (which starts at 5735 MHz), inside no 20 MHz channel.`,
    };
  }
  if (mhz > 5330 && mhz < 5490) {
    return {
      kind: "error",
      message: `${mhz} MHz falls between channel 64 (which ends at 5330 MHz) and channel 100 (which starts at 5490 MHz). The gap includes UNII-2B, 5350 to 5470 MHz, which has no Wi-Fi channels in the US.`,
    };
  }
  if (mhz > 5895 && mhz < 5925) {
    return {
      kind: "error",
      message: `${mhz} MHz is in 5895 to 5925 MHz, which the FCC assigned to vehicle-to-everything (C-V2X) communications, not Wi-Fi.`,
    };
  }
  if (mhz >= 5925 && mhz < 5945) {
    return {
      kind: "error",
      message: `${mhz} MHz is below 6 GHz channel 1. The only channel there is channel 2 at 5935 MHz, a lone 20 MHz channel that 802.11ax defines separately and that this chart leaves out.`,
    };
  }
  return {
    kind: "error",
    message: `${mhz} MHz is outside the Wi-Fi channels listed here: 2402 to 2494, 5170 to 5330, 5490 to 5895 and 5945 to 7125 MHz.`,
  };
}

/**
 * Accepts a channel number ("36", "ch 36", "channel 36") or a frequency
 * ("5180", "5180 MHz", "5.18 GHz", "2.437").
 */
export function parseLookup(raw: string, current: Band): Lookup {
  const text = raw.trim().toLowerCase();
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_LOOKUP_LENGTH) {
    return { kind: "error", message: `Too long. Lookups are capped at ${MAX_LOOKUP_LENGTH} characters.` };
  }
  const m = /^(ch(?:annel)?\.?\s*)?(\d{1,5}(?:\.\d{1,4})?)\s*(mhz|ghz|m|g)?$/.exec(text);
  if (!m) {
    return {
      kind: "error",
      message: "Enter a channel number such as 36, or a frequency such as 5180 MHz or 5.18 GHz.",
    };
  }
  const prefixed = m[1] !== undefined;
  const value = Number(m[2]);
  const unit = m[3] ?? null;
  const hasDecimal = m[2].includes(".");

  if (prefixed && (unit !== null || hasDecimal)) {
    return { kind: "error", message: "After \"ch\", enter a whole channel number such as 36, with no unit." };
  }
  if (unit === "ghz" || unit === "g" || (!prefixed && unit === null && hasDecimal && value < 10)) {
    // Up to four decimals in GHz, so check for a fraction of a megahertz on integers, not floats.
    const [whole, frac = ""] = m[2].split(".");
    const mhzText = whole + frac.padEnd(3, "0");
    if (mhzText.length > whole.length + 3 && /[1-9]/.test(mhzText.slice(whole.length + 3))) {
      return { kind: "error", message: "Channel centers are whole megahertz. Enter at most three decimals in GHz." };
    }
    return byFrequency(Number(mhzText.slice(0, whole.length + 3)));
  }
  if (!prefixed && (unit === "mhz" || unit === "m" || value >= 1000)) {
    if (hasDecimal && !Number.isInteger(value)) {
      return { kind: "error", message: "Channel centers are whole megahertz. Enter the frequency without a fraction." };
    }
    return byFrequency(value);
  }
  if (hasDecimal) return { kind: "error", message: "Channel numbers are whole numbers." };
  if (value < 1 || value > 233) {
    return {
      kind: "error",
      message: `No Wi-Fi band uses channel ${value}. 2.4 GHz has 1 to 14, 5 GHz has 36 to 177 and 6 GHz has 1 to 233.`,
    };
  }

  const matches = matchesForNumber(value);
  if (matches.length === 0) {
    const where = current === "2.4" ? "1 to 14" : current === "5" ? "36 to 64, 100 to 144 and 149 to 177" : "1 to 233 in steps of 4";
    return {
      kind: "error",
      message: `${value} is not a channel or a bonded center in any band. ${BAND_LABEL[current]} 20 MHz channels are ${where}.`,
    };
  }
  const inCurrent = matches.filter((x) => x.band === current);
  const pick = inCurrent[0] ?? matches.find((x) => x.width === 20) ?? matches[0];
  const others = matches.filter((x) => x !== pick);
  const notes: string[] = [];
  if (pick.band !== current) notes.push(`${value} is not a ${BAND_LABEL[current]} channel.`);
  if (pick.width !== 20) notes.push(`${value} is the center number of a ${pick.width} MHz channel.`);
  if (others.length) notes.push(`Also: ${others.map(describe).join(", ")}.`);
  return { kind: "found", band: pick.band, width: pick.width, channel: pick.channel, note: notes.length ? notes.join(" ") : null };
}
