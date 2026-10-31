/**
 * Propagation and serialization delay.
 *
 * Propagation is distance over the signal's speed in the medium. Speed is c
 * times a velocity factor; for glass that factor is 1/n, where n is the
 * group index (about 1.468 for standard single-mode fiber in the 1310 to
 * 1550 nm windows). Serialization is the time to clock the bits of one frame
 * onto the link: bits over bit rate.
 *
 * Distances between places use the haversine great-circle formula on a
 * spherical Earth of mean radius 6371.0088 km (the IUGG mean radius R1).
 * Satellite paths are computed in Earth-centered Cartesian coordinates on the
 * same sphere, so slant range and elevation come out of plain vector math.
 *
 * Pure functions only: no React, no DOM.
 */

/** Exact by definition of the meter (CGPM 1983), in m/s. */
export const SPEED_OF_LIGHT_M_S = 299_792_458;
/** IUGG mean Earth radius R1, in km. */
export const EARTH_RADIUS_KM = 6371.0088;
/** Geostationary altitude above the equator, in km. */
export const GEO_ALTITUDE_KM = 35_786;
/** A common LEO broadband shell altitude, in km. */
export const LEO_ALTITUDE_KM = 550;
/** Group index of standard single-mode fiber. */
export const FIBER_GROUP_INDEX = 1.468;

/** Inputs past these are rejected with a message, so the output stays meaningful. */
export const MAX_DISTANCE_KM = 1_000_000;
export const MAX_PACKET_BYTES = 1_000_000_000;
export const MAX_RATE_BPS = 10e12;
export const MAX_HOPS = 64;
export const MAX_STRETCH = 10;
/** Real media sit between about 0.5 and 1; this floor keeps the output finite. */
export const MIN_VELOCITY_FACTOR = 0.01;

/** Ethernet II header 14, FCS 4 (IEEE 802.3 clause 3). */
export const ETHERNET_HEADER_FCS_BYTES = 18;
/** Preamble 7 plus SFD 1, plus the 12-byte minimum inter-packet gap (IEEE 802.3 clause 4). */
export const ETHERNET_PREAMBLE_IFG_BYTES = 20;
/** Payloads shorter than this are padded, so the minimum frame is 64 bytes. */
export const ETHERNET_MIN_PAYLOAD_BYTES = 46;
/** The largest payload a standard Ethernet frame carries; above it only jumbo frames apply. */
export const ETHERNET_MAX_PAYLOAD_BYTES = 1500;
/** A common jumbo frame payload limit. Larger packets cannot be one Ethernet frame. */
export const ETHERNET_JUMBO_PAYLOAD_BYTES = 9000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type MediumId =
  | "fiber"
  | "copper"
  | "coax-solid"
  | "coax-foam"
  | "vacuum"
  | "geo"
  | "leo"
  | "custom";

export interface Medium {
  id: MediumId;
  label: string;
  /** Fraction of c. For satellites this is the vacuum leg, 1. */
  velocityFactor: number;
  detail: string;
  /** Satellite altitude in km, when the path is a bent pipe through one. */
  altitudeKm?: number;
}

export const MEDIA: Medium[] = [
  {
    id: "fiber",
    label: "Single-mode fiber",
    velocityFactor: 1 / FIBER_GROUP_INDEX,
    detail: "Group index about 1.468, so light travels at about 0.681 c.",
  },
  {
    id: "copper",
    label: "Copper twisted pair",
    velocityFactor: 0.64,
    detail: "Category cable data sheets quote a nominal velocity of propagation, commonly 0.64 to 0.70 c. This uses 0.64.",
  },
  {
    id: "coax-solid",
    label: "Coax, solid polyethylene",
    velocityFactor: 0.66,
    detail: "Solid polyethylene dielectric, as in RG-58 and RG-213.",
  },
  {
    id: "coax-foam",
    label: "Coax, foam dielectric",
    velocityFactor: 0.85,
    detail: "Foamed dielectric is mostly air, so it is faster. About 0.85 c; check the data sheet.",
  },
  {
    id: "vacuum",
    label: "Vacuum or free-space radio",
    velocityFactor: 1,
    detail: "c itself. Air slows radio and microwave by about 0.03 percent.",
  },
  {
    id: "geo",
    label: "GEO satellite hop",
    velocityFactor: 1,
    altitudeKm: GEO_ALTITUDE_KM,
    detail: "Up to a geostationary satellite 35,786 km above the equator and back down.",
  },
  {
    id: "leo",
    label: "LEO satellite hop",
    velocityFactor: 1,
    altitudeKm: LEO_ALTITUDE_KM,
    detail: "Up to one satellite at 550 km and back down, with no inter-satellite links.",
  },
  {
    id: "custom",
    label: "Custom velocity factor",
    velocityFactor: 0.7,
    detail: "Any medium, from the velocity factor on its data sheet.",
  },
];

export function mediumById(id: MediumId): Medium {
  return MEDIA.find((m) => m.id === id) ?? MEDIA[0];
}

/* ------------------------------------------------------------ parsing */

function cleanNumber(text: string): string {
  return text.trim().replace(/[\s,_]/g, "");
}

/** A finite, non-negative decimal. Exponent notation is accepted. */
export function parseNonNegative(text: string, what: string): Parsed<number> {
  const cleaned = cleanNumber(text);
  if (cleaned === "") return { ok: false, error: `Enter ${what}.` };
  if (/^-\d|^-\.\d/.test(cleaned)) return { ok: false, error: `Enter a positive number; ${what} cannot be negative.` };
  if (cleaned.length > 32 || !/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) {
    return { ok: false, error: `"${text.trim().slice(0, 24)}" is not a number. Use digits and at most one decimal point.` };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, error: `That ${what} is too large to be useful.` };
  return { ok: true, value };
}

export type DistanceUnit = "m" | "km" | "mi" | "ft";

/** International mile and foot, exact by definition (1959). */
export const KM_PER_UNIT: Record<DistanceUnit, number> = {
  m: 0.001,
  km: 1,
  mi: 1.609344,
  ft: 0.0003048,
};

export function parseDistanceKm(text: string, unit: DistanceUnit): Parsed<number> {
  const parsed = parseNonNegative(text, "a distance");
  if (!parsed.ok) return parsed;
  const km = parsed.value * KM_PER_UNIT[unit];
  if (km > MAX_DISTANCE_KM) {
    return {
      ok: false,
      error: `This tool stops at ${MAX_DISTANCE_KM.toLocaleString("en-US")} km. The Moon is about 384,400 km away.`,
    };
  }
  return { ok: true, value: km };
}

export function parseVelocityFactor(text: string): Parsed<number> {
  const parsed = parseNonNegative(text, "a velocity factor");
  if (!parsed.ok) return parsed;
  if (parsed.value < MIN_VELOCITY_FACTOR || parsed.value > 1) {
    return {
      ok: false,
      error: `A velocity factor is a fraction of c, from ${MIN_VELOCITY_FACTOR} to 1. Nothing physical goes faster than light, and real cable is above 0.5.`,
    };
  }
  return { ok: true, value: parsed.value };
}

export function parseStretch(text: string): Parsed<number> {
  const parsed = parseNonNegative(text, "a route stretch factor");
  if (!parsed.ok) return parsed;
  if (parsed.value < 1 || parsed.value > MAX_STRETCH) {
    return {
      ok: false,
      error: `Route stretch runs from 1 (the great circle itself) to ${MAX_STRETCH}. A cable cannot be shorter than the great circle.`,
    };
  }
  return { ok: true, value: parsed.value };
}

export function parsePacketBytes(text: string): Parsed<number> {
  const parsed = parseNonNegative(text, "a packet size");
  if (!parsed.ok) return parsed;
  if (!Number.isInteger(parsed.value)) return { ok: false, error: "A packet is a whole number of bytes." };
  if (parsed.value < 1) return { ok: false, error: "A packet has at least one byte." };
  if (parsed.value > MAX_PACKET_BYTES) {
    return { ok: false, error: `This tool stops at ${MAX_PACKET_BYTES.toLocaleString("en-US")} bytes (1 GB).` };
  }
  return { ok: true, value: parsed.value };
}

export type RateUnit = "bps" | "kbps" | "Mbps" | "Gbps" | "Tbps";

export const BPS_PER_UNIT: Record<RateUnit, number> = {
  bps: 1,
  kbps: 1e3,
  Mbps: 1e6,
  Gbps: 1e9,
  Tbps: 1e12,
};

export function parseRateBps(text: string, unit: RateUnit): Parsed<number> {
  const parsed = parseNonNegative(text, "a link speed");
  if (!parsed.ok) return parsed;
  const bps = parsed.value * BPS_PER_UNIT[unit];
  if (bps < 1) return { ok: false, error: "The slowest link this tool takes is 1 bit per second." };
  if (bps > MAX_RATE_BPS) return { ok: false, error: "This tool stops at 10 Tbps." };
  return { ok: true, value: bps };
}

export function parseHops(text: string): Parsed<number> {
  const cleaned = text.trim();
  if (!/^\d{1,3}$/.test(cleaned) || Number(cleaned) < 1 || Number(cleaned) > MAX_HOPS) {
    return { ok: false, error: `Hops is a whole number from 1 to ${MAX_HOPS}.` };
  }
  return { ok: true, value: Number(cleaned) };
}

/* --------------------------------------------------------- propagation */

/** Seconds for a signal to cover `km` at `velocityFactor` times c. */
export function propagationSeconds(km: number, velocityFactor: number): number {
  return (km * 1000) / (SPEED_OF_LIGHT_M_S * velocityFactor);
}

/** Microseconds per kilometer, the figure people quote for fiber (about 4.9). */
export function microsecondsPerKm(velocityFactor: number): number {
  return propagationSeconds(1, velocityFactor) * 1e6;
}

/* ------------------------------------------------------------ geodesy */

export interface LatLon {
  lat: number;
  lon: number;
}

const RAD = Math.PI / 180;

/**
 * Haversine great-circle distance (R. W. Sinnott, Sky and Telescope, 1984).
 * The argument of asin is clamped because rounding can push it a hair past 1
 * for antipodal points, and asin(1.0000000000000002) is NaN.
 */
export function haversineKm(a: LatLon, b: LatLon, radiusKm = EARTH_RADIUS_KM): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Vec = [number, number, number];

function toVec(p: LatLon, radiusKm: number): Vec {
  const lat = p.lat * RAD;
  const lon = p.lon * RAD;
  return [radiusKm * Math.cos(lat) * Math.cos(lon), radiusKm * Math.cos(lat) * Math.sin(lon), radiusKm * Math.sin(lat)];
}

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norm(a: Vec): number {
  return Math.sqrt(dot(a, a));
}

export interface Leg {
  slantKm: number;
  /** Degrees above the local horizon. Negative means the satellite is below it. */
  elevationDeg: number;
}

function leg(ground: Vec, sat: Vec): Leg {
  const d = sub(sat, ground);
  const slant = norm(d);
  const up = norm(ground);
  const sinEl = slant === 0 || up === 0 ? 1 : dot(ground, d) / (up * slant);
  return { slantKm: slant, elevationDeg: Math.asin(Math.max(-1, Math.min(1, sinEl))) / RAD };
}

export interface BentPipe {
  /** Both ends can see the satellite above the horizon. */
  visible: boolean;
  up: Leg;
  down: Leg;
  /** up + down, the one-way path length in km. */
  pathKm: number;
  /** Where the satellite was placed. */
  satellite: LatLon;
}

/**
 * One hop through one satellite: ground to satellite, satellite to ground.
 * Placed above the great-circle midpoint of the two ends, which is the
 * shortest total path among the positions both ends can see. Antipodal
 * ends have no midpoint and no satellite can see both, so the result is
 * marked not visible.
 */
export function bentPipeMidpoint(a: LatLon, b: LatLon, altitudeKm: number): BentPipe {
  const R = EARTH_RADIUS_KM;
  const ga = toVec(a, R);
  const gb = toVec(b, R);
  const mid: Vec = [ga[0] + gb[0], ga[1] + gb[1], ga[2] + gb[2]];
  const len = norm(mid);
  if (len < 1e-9 * R) {
    const sat: Vec = [0, 0, R + altitudeKm];
    const up = leg(ga, sat);
    const down = leg(gb, sat);
    return { visible: false, up, down, pathKm: up.slantKm + down.slantKm, satellite: { lat: 90, lon: 0 } };
  }
  const scale = (R + altitudeKm) / len;
  const sat: Vec = [mid[0] * scale, mid[1] * scale, mid[2] * scale];
  const up = leg(ga, sat);
  const down = leg(gb, sat);
  const satLat = Math.asin(sat[2] / (R + altitudeKm)) / RAD;
  const satLon = Math.atan2(sat[1], sat[0]) / RAD;
  return {
    visible: up.elevationDeg >= 0 && down.elevationDeg >= 0,
    up,
    down,
    pathKm: up.slantKm + down.slantKm,
    satellite: { lat: satLat, lon: satLon },
  };
}

/** Longitude folded into [-180, 180). */
export function normalizeLon(lonDeg: number): number {
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
}

function geoAt(ga: Vec, gb: Vec, lonDeg: number): BentPipe {
  const sat = toVec({ lat: 0, lon: lonDeg }, EARTH_RADIUS_KM + GEO_ALTITUDE_KM);
  const up = leg(ga, sat);
  const down = leg(gb, sat);
  return {
    visible: up.elevationDeg >= 0 && down.elevationDeg >= 0,
    up,
    down,
    pathKm: up.slantKm + down.slantKm,
    satellite: { lat: 0, lon: lonDeg },
  };
}

/**
 * One geostationary hop. The satellite has to sit over the equator, so this
 * searches the orbital longitude for the shortest path that both ends can
 * see: a 0.25 degree sweep, then a narrowing search around the best slot.
 * When no longitude is visible from both ends, the shortest path is still
 * returned, marked not visible.
 */
export function bentPipeGeo(a: LatLon, b: LatLon): BentPipe {
  const ga = toVec(a, EARTH_RADIUS_KM);
  const gb = toVec(b, EARTH_RADIUS_KM);
  let best: BentPipe | null = null;
  let bestAny: BentPipe | null = null;
  for (let i = 0; i < 1440; i++) {
    const candidate = geoAt(ga, gb, -180 + i * 0.25);
    if (!bestAny || candidate.pathKm < bestAny.pathKm) bestAny = candidate;
    if (candidate.visible && (!best || candidate.pathKm < best.pathKm)) best = candidate;
  }
  let current = (best ?? bestAny) as BentPipe;
  const wantVisible = best !== null;
  for (let step = 0.125; step > 1e-6; step /= 2) {
    for (const lon of [current.satellite.lon - step, current.satellite.lon + step]) {
      const candidate = geoAt(ga, gb, lon);
      if ((candidate.visible || !wantVisible) && candidate.pathKm < current.pathKm) current = candidate;
    }
  }
  return { ...current, satellite: { lat: 0, lon: normalizeLon(current.satellite.lon) } };
}

/**
 * Two points on the equator `groundKm` apart, for when the reader typed a
 * distance rather than picking places. Placing them on the equator also
 * puts a geostationary satellite exactly above their midpoint.
 */
export function equatorialPair(groundKm: number): [LatLon, LatLon] {
  const lonDeg = (groundKm / EARTH_RADIUS_KM) / RAD;
  return [
    { lat: 0, lon: 0 },
    { lat: 0, lon: lonDeg },
  ];
}

/** Half the circumference: no two surface points are farther apart than this. */
export const MAX_SURFACE_KM = Math.PI * EARTH_RADIUS_KM;

/* -------------------------------------------------------- serialization */

/** Bytes that occupy the wire for one packet, optionally with Ethernet framing. */
export function wireBytes(packetBytes: number, ethernet: boolean): number {
  if (!ethernet) return packetBytes;
  return Math.max(packetBytes, ETHERNET_MIN_PAYLOAD_BYTES) + ETHERNET_HEADER_FCS_BYTES + ETHERNET_PREAMBLE_IFG_BYTES;
}

export function serializationSeconds(bytes: number, rateBps: number): number {
  return (bytes * 8) / rateBps;
}

/** Bandwidth-delay product in bytes: how much data is in flight to fill one round trip. */
export function bdpBytes(rateBps: number, rttSeconds: number): number {
  return (rateBps * rttSeconds) / 8;
}

/* ----------------------------------------------------------- formatting */

function trimFixed(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** Five significant digits, trailing zeros dropped, never exponent notation. */
function sig(value: number): string {
  if (Math.abs(value) >= 1e5) return Math.round(value).toLocaleString("en-US");
  let text = value.toPrecision(5);
  if (text.includes("e")) text = String(Number(text));
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/** A duration in the unit that keeps the number between 1 and 1000 where possible. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "n/a";
  if (seconds === 0) return "0 s";
  const abs = Math.abs(seconds);
  if (abs < 1e-13) return "under 0.0001 ns";
  if (abs < 1e-6) return `${sig(seconds * 1e9)} ns`;
  if (abs < 1e-3) return `${sig(seconds * 1e6)} µs`;
  if (abs < 1) return `${sig(seconds * 1e3)} ms`;
  return `${sig(seconds)} s`;
}

export function formatKm(km: number): string {
  if (km < 1) return `${trimFixed(km * 1000, 1)} m`;
  return `${km.toLocaleString("en-US", { maximumFractionDigits: km < 100 ? 2 : 1 })} km`;
}

/** Decimal byte units, as link rates are decimal. */
export function formatBytes(bytes: number): string {
  const whole = `${Math.round(bytes).toLocaleString("en-US")} bytes`;
  const units: [number, string][] = [
    [1e12, "TB"],
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "kB"],
  ];
  for (const [size, name] of units) {
    if (bytes >= size) return `${whole} (${sig(bytes / size)} ${name})`;
  }
  return whole;
}

export function formatRate(bps: number): string {
  const units: [number, string][] = [
    [1e12, "Tbps"],
    [1e9, "Gbps"],
    [1e6, "Mbps"],
    [1e3, "kbps"],
  ];
  for (const [size, name] of units) if (bps >= size) return `${sig(bps / size)} ${name}`;
  return `${sig(bps)} bps`;
}

/* --------------------------------------------------------------- cities */

export interface City extends LatLon {
  id: string;
  name: string;
}

/** City-center coordinates, to four decimal places. */
export const CITIES: City[] = [
  { id: "las-vegas", name: "Las Vegas", lat: 36.1699, lon: -115.1398 },
  { id: "los-angeles", name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
  { id: "san-francisco", name: "San Francisco", lat: 37.7749, lon: -122.4194 },
  { id: "seattle", name: "Seattle", lat: 47.6062, lon: -122.3321 },
  { id: "denver", name: "Denver", lat: 39.7392, lon: -104.9903 },
  { id: "dallas", name: "Dallas", lat: 32.7767, lon: -96.797 },
  { id: "chicago", name: "Chicago", lat: 41.8781, lon: -87.6298 },
  { id: "ashburn", name: "Ashburn, Virginia", lat: 39.0438, lon: -77.4874 },
  { id: "new-york", name: "New York", lat: 40.7128, lon: -74.006 },
  { id: "toronto", name: "Toronto", lat: 43.6532, lon: -79.3832 },
  { id: "mexico-city", name: "Mexico City", lat: 19.4326, lon: -99.1332 },
  { id: "honolulu", name: "Honolulu", lat: 21.3069, lon: -157.8583 },
  { id: "sao-paulo", name: "São Paulo", lat: -23.5505, lon: -46.6333 },
  { id: "london", name: "London", lat: 51.5074, lon: -0.1278 },
  { id: "paris", name: "Paris", lat: 48.8566, lon: 2.3522 },
  { id: "amsterdam", name: "Amsterdam", lat: 52.3676, lon: 4.9041 },
  { id: "frankfurt", name: "Frankfurt", lat: 50.1109, lon: 8.6821 },
  { id: "stockholm", name: "Stockholm", lat: 59.3293, lon: 18.0686 },
  { id: "madrid", name: "Madrid", lat: 40.4168, lon: -3.7038 },
  { id: "lagos", name: "Lagos", lat: 6.5244, lon: 3.3792 },
  { id: "johannesburg", name: "Johannesburg", lat: -26.2041, lon: 28.0473 },
  { id: "cairo", name: "Cairo", lat: 30.0444, lon: 31.2357 },
  { id: "dubai", name: "Dubai", lat: 25.2048, lon: 55.2708 },
  { id: "mumbai", name: "Mumbai", lat: 19.076, lon: 72.8777 },
  { id: "singapore", name: "Singapore", lat: 1.3521, lon: 103.8198 },
  { id: "hong-kong", name: "Hong Kong", lat: 22.3193, lon: 114.1694 },
  { id: "seoul", name: "Seoul", lat: 37.5665, lon: 126.978 },
  { id: "tokyo", name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { id: "sydney", name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { id: "auckland", name: "Auckland", lat: -36.8485, lon: 174.7633 },
];

export function cityById(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}

/* -------------------------------------------------------------- summary */

export interface PathInput {
  /** The two ends, when known. Typed distances use an equatorial pair. */
  ends: [LatLon, LatLon];
  /** Length along the ground route: great circle times stretch, or what was typed. */
  routeKm: number;
  /** Great-circle ground separation of the two ends. */
  groundKm: number;
  /** The ends are real places, so a GEO satellite has to be searched for. */
  fromPlaces: boolean;
}

export interface DelayResult {
  medium: Medium;
  velocityFactor: number;
  /** One-way path length actually traveled, in km. */
  pathKm: number;
  oneWaySeconds: number;
  rttSeconds: number;
  satellite: BentPipe | null;
  /** A reason this medium cannot carry this path, such as a satellite below the horizon. */
  problem: string | null;
}

export function computeDelay(input: PathInput, medium: Medium, velocityFactor: number): DelayResult {
  if (medium.altitudeKm !== undefined) {
    if (input.groundKm > MAX_SURFACE_KM + 1e-6) {
      return {
        medium,
        velocityFactor: 1,
        pathKm: NaN,
        oneWaySeconds: NaN,
        rttSeconds: NaN,
        satellite: null,
        problem: `No two points on Earth are more than ${Math.round(MAX_SURFACE_KM).toLocaleString("en-US")} km apart along the surface, so a satellite hop needs a ground distance below that.`,
      };
    }
    const pipe =
      medium.id === "geo" && input.fromPlaces
        ? bentPipeGeo(input.ends[0], input.ends[1])
        : bentPipeMidpoint(input.ends[0], input.ends[1], medium.altitudeKm);
    const oneWay = propagationSeconds(pipe.pathKm, 1);
    return {
      medium,
      velocityFactor: 1,
      pathKm: pipe.pathKm,
      oneWaySeconds: oneWay,
      rttSeconds: 2 * oneWay,
      satellite: pipe,
      problem: pipe.visible
        ? null
        : "No single satellite at this altitude is above the horizon at both ends. A real path would relay through more satellites or ground stations.",
    };
  }
  const oneWay = propagationSeconds(input.routeKm, velocityFactor);
  return {
    medium,
    velocityFactor,
    pathKm: input.routeKm,
    oneWaySeconds: oneWay,
    rttSeconds: 2 * oneWay,
    satellite: null,
    problem: null,
  };
}
