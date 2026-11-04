/**
 * CRC calculator: the Rocksoft parameter model, a catalog, and parsing.
 *
 * The model is Ross Williams, "A Painless Guide to CRC Error Detection
 * Algorithms" (1993). A CRC is fully described by six parameters: width,
 * poly, init, refin, refout and xorout. The catalog values and the check
 * value of each entry (the CRC of the nine ASCII bytes "123456789") follow
 * Greg Cook's CRC RevEng catalog, the de facto reference, and every entry
 * is verified against its check value by selfTest().
 *
 * Reference algorithm, which the fast paths below must equal bit for bit:
 *   reg = init
 *   for each byte: if refin, reverse its bits; then for each bit from the
 *     top: feed it in, shifting the register left and XORing poly when the
 *     bit leaving the top differs from the bit entering
 *   if refout, reverse the register; then XOR with xorout.
 *
 * Fast paths: when refin is set, the register is kept bit reversed so the
 * byte can be combined at the low end and the table driven loop needs no
 * per byte reversal. Up to 32 bits the register is a Number. From 33 to 64
 * bits it is a pair of 32 bit halves, because a BigInt loop allocates on
 * every operation and measured about 2 MB/s against well over 100 MB/s for
 * halves. Parameters, table construction and results are BigInt throughout;
 * only the per byte loop uses halves, and the tests hold it equal to a plain
 * BigInt transcription of the model at every width. Under 8 bits there is no
 * room for a byte wide table, so the bitwise loop is used.
 *
 * Pure functions and one class, no React and no DOM.
 */

export interface CrcParams {
  /** Register width in bits, 1 to 64. */
  width: number;
  /** Generator polynomial in normal form: MSB first, the x^width term implied. */
  poly: bigint;
  init: bigint;
  /** Reverse the bits of each input byte before processing. */
  refin: boolean;
  /** Reverse the register before the final XOR. */
  refout: boolean;
  xorout: bigint;
}

export const MIN_WIDTH = 1;
export const MAX_WIDTH = 64;

/** Longest input accepted from the text and hex boxes, in bytes. */
export const MAX_MANUAL_BYTES = 1024 * 1024;
/** Largest file read. It is streamed in chunks, so memory use stays flat. */
export const MAX_FILE_BYTES = 512 * 1024 * 1024;

export const CHECK_INPUT = "123456789";
export const CHECK_BYTES = new TextEncoder().encode(CHECK_INPUT);

/* ------------------------------------------------------------------ bits */

export function widthMask(width: number): bigint {
  return (1n << BigInt(width)) - 1n;
}

/** Reverses the low `width` bits of a value. */
export function reflect(value: bigint, width: number): bigint {
  let out = 0n;
  let rest = value;
  for (let i = 0; i < width; i++) {
    out = (out << 1n) | (rest & 1n);
    rest >>= 1n;
  }
  return out;
}

const REV8 = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let r = 0;
  for (let k = 0; k < 8; k++) if (i & (1 << k)) r |= 0x80 >> k;
  REV8[i] = r;
}

/* ------------------------------------------------------------- computing */

/**
 * A CRC in progress. Feed it any number of chunks with update(), read the
 * value with digest() (which does not disturb the state, so more data can
 * follow). Parameters are assumed valid: width 1 to 64, values within it.
 */
export class Crc {
  private readonly p: CrcParams;
  private readonly mode: "bit" | "num" | "wide";
  // bit and num paths: the register.
  private n = 0;
  private readonly maskN: number;
  private readonly polyN: number;
  private readonly tableN: Uint32Array | null = null;
  // wide path: the register as two 32 bit halves, and a table per half.
  // With refin the register is right aligned (bit 0 is the register's low
  // bit). Without it the register is left aligned in 64 bits, so the top
  // byte is always the top byte of hi whatever the width, and digest()
  // shifts it back down.
  private hi = 0;
  private lo = 0;
  private readonly tableHi: Uint32Array | null = null;
  private readonly tableLo: Uint32Array | null = null;

  constructor(params: CrcParams) {
    this.p = params;
    const w = params.width;
    this.mode = w < 8 ? "bit" : w <= 32 ? "num" : "wide";
    const mask = widthMask(w);
    this.maskN = w >= 32 ? 0xffffffff : 2 ** w - 1;
    this.polyN = Number(params.poly & mask);

    if (this.mode === "bit") {
      this.n = Number(params.init);
      return;
    }

    if (this.mode === "num") {
      const table = new Uint32Array(256);
      if (params.refin) {
        const rpoly = Number(reflect(params.poly, w));
        for (let i = 0; i < 256; i++) {
          let r = i;
          for (let k = 0; k < 8; k++) r = r & 1 ? (r >>> 1) ^ rpoly : r >>> 1;
          table[i] = r >>> 0;
        }
        this.n = Number(reflect(params.init, w));
      } else {
        for (let i = 0; i < 256; i++) {
          let r = (i << (w - 8)) >>> 0;
          for (let k = 0; k < 8; k++) {
            const top = (r >>> (w - 1)) & 1;
            r = (r << 1) & this.maskN;
            if (top) r ^= this.polyN;
          }
          table[i] = r >>> 0;
        }
        this.n = Number(params.init);
      }
      this.tableN = table;
      return;
    }

    const m64 = widthMask(64);
    const tableHi = new Uint32Array(256);
    const tableLo = new Uint32Array(256);
    let start: bigint;
    if (params.refin) {
      const rpoly = reflect(params.poly, w);
      for (let i = 0; i < 256; i++) {
        let r = BigInt(i);
        for (let k = 0; k < 8; k++) r = r & 1n ? (r >> 1n) ^ rpoly : r >> 1n;
        tableHi[i] = Number(r >> 32n);
        tableLo[i] = Number(r & 0xffffffffn);
      }
      start = reflect(params.init, w);
    } else {
      const align = BigInt(64 - w);
      const polyAligned = params.poly << align;
      const top = 1n << 63n;
      for (let i = 0; i < 256; i++) {
        let r = BigInt(i) << 56n;
        for (let k = 0; k < 8; k++) r = r & top ? ((r << 1n) & m64) ^ polyAligned : (r << 1n) & m64;
        tableHi[i] = Number(r >> 32n);
        tableLo[i] = Number(r & 0xffffffffn);
      }
      start = (params.init << align) & m64;
    }
    this.tableHi = tableHi;
    this.tableLo = tableLo;
    this.hi = Number(start >> 32n);
    this.lo = Number(start & 0xffffffffn);
  }

  update(data: Uint8Array): void {
    const { width: w, refin } = this.p;
    const len = data.length;

    if (this.mode === "bit") {
      let reg = this.n;
      const mask = this.maskN;
      const poly = this.polyN;
      const topShift = w - 1;
      for (let i = 0; i < len; i++) {
        const byte = refin ? REV8[data[i]] : data[i];
        for (let k = 7; k >= 0; k--) {
          const top = (reg >>> topShift) & 1;
          reg = (reg << 1) & mask;
          if (top ^ ((byte >>> k) & 1)) reg ^= poly;
        }
      }
      this.n = reg;
      return;
    }

    if (this.mode === "num") {
      const table = this.tableN as Uint32Array;
      let reg = this.n;
      if (refin) {
        for (let i = 0; i < len; i++) reg = ((reg >>> 8) ^ table[(reg ^ data[i]) & 0xff]) >>> 0;
      } else {
        const mask = this.maskN;
        const shift = w - 8;
        for (let i = 0; i < len; i++) {
          reg = (((reg << 8) & mask) ^ table[((reg >>> shift) ^ data[i]) & 0xff]) >>> 0;
        }
      }
      this.n = reg;
      return;
    }

    const tableHi = this.tableHi as Uint32Array;
    const tableLo = this.tableLo as Uint32Array;
    let hi = this.hi;
    let lo = this.lo;
    if (refin) {
      for (let i = 0; i < len; i++) {
        const idx = (lo ^ data[i]) & 0xff;
        lo = (((lo >>> 8) | (hi << 24)) ^ tableLo[idx]) >>> 0;
        hi = ((hi >>> 8) ^ tableHi[idx]) >>> 0;
      }
    } else {
      for (let i = 0; i < len; i++) {
        const idx = ((hi >>> 24) ^ data[i]) & 0xff;
        hi = (((hi << 8) | (lo >>> 24)) ^ tableHi[idx]) >>> 0;
        lo = ((lo << 8) ^ tableLo[idx]) >>> 0;
      }
    }
    this.hi = hi;
    this.lo = lo;
  }

  digest(): bigint {
    const { width: w, refin, refout, xorout } = this.p;
    let value: bigint;
    if (this.mode === "wide") {
      value = (BigInt(this.hi) << 32n) | BigInt(this.lo);
      if (!refin) value >>= BigInt(64 - w);
    } else {
      value = BigInt(this.n);
    }
    // With refin the register is already in the reversed domain, so a
    // reversal is needed exactly when refin and refout disagree. In the
    // bitwise path the register is never reversed, so refout alone decides.
    const flip = this.mode === "bit" ? refout : refin !== refout;
    if (flip) value = reflect(value, w);
    return (value ^ xorout) & widthMask(w);
  }
}

export function crc(params: CrcParams, data: Uint8Array): bigint {
  const state = new Crc(params);
  state.update(data);
  return state.digest();
}

export function checkValue(params: CrcParams): bigint {
  return crc(params, CHECK_BYTES);
}

/* ------------------------------------------------------------- catalog */

export interface CatalogEntry extends CrcParams {
  id: string;
  name: string;
  /** Other names the same parameters go by. */
  aliases: string[];
  /** CRC of "123456789", as published. */
  check: bigint;
  group: "common" | "more";
  /** A short note: where it is used when that is well established, or how it differs from a close relative. */
  usedBy: string;
}

function entry(
  group: CatalogEntry["group"],
  id: string,
  name: string,
  aliases: string[],
  width: number,
  poly: bigint,
  init: bigint,
  refin: boolean,
  refout: boolean,
  xorout: bigint,
  check: bigint,
  usedBy = "",
): CatalogEntry {
  return { id, name, aliases, width, poly, init, refin, refout, xorout, check, group, usedBy };
}

const F16 = 0xffffn;
const F32 = 0xffffffffn;
const F64 = 0xffffffffffffffffn;

export const CATALOG: CatalogEntry[] = [
  entry("common", "crc-8", "CRC-8", ["CRC-8/SMBUS"], 8, 0x07n, 0n, false, false, 0n, 0xf4n, "SMBus packet error checking."),
  entry("common", "crc-8-maxim", "CRC-8/MAXIM", ["CRC-8/MAXIM-DOW", "DOW-CRC"], 8, 0x31n, 0n, true, true, 0n, 0xa1n, "Maxim and Dallas 1-Wire devices."),
  entry("common", "crc-16-arc", "CRC-16/ARC", ["CRC-16", "CRC-16/LHA", "CRC-IBM"], 16, 0x8005n, 0n, true, true, 0n, 0xbb3dn, "The ARC and LHA archivers."),
  entry("common", "crc-16-ccitt-false", "CRC-16/CCITT-FALSE", ["CRC-16/IBM-3740", "CRC-16/AUTOSAR"], 16, 0x1021n, F16, false, false, 0n, 0x29b1n, "The XMODEM polynomial started from 0xFFFF instead of 0."),
  entry("common", "crc-16-xmodem", "CRC-16/XMODEM", ["CRC-16/ACORN", "CRC-16/LTE", "CRC-16/V-41-MSB", "XMODEM", "ZMODEM"], 16, 0x1021n, 0n, false, false, 0n, 0x31c3n, "XMODEM file transfer."),
  entry("common", "crc-16-modbus", "CRC-16/MODBUS", ["MODBUS"], 16, 0x8005n, F16, true, true, 0n, 0x4b37n, "Modbus RTU frames, which send the low byte first."),
  entry("common", "crc-32", "CRC-32 (ISO-HDLC)", ["CRC-32", "CRC-32/ADCCP", "CRC-32/V-42", "PKZIP"], 32, 0x04c11db7n, F32, true, true, F32, 0xcbf43926n, "Ethernet frame check sequence, gzip, ZIP and PNG."),
  entry("common", "crc-32c", "CRC-32C (Castagnoli)", ["CRC-32/ISCSI", "CRC-32/CASTAGNOLI"], 32, 0x1edc6f41n, F32, true, true, F32, 0xe3069283n, "iSCSI (RFC 3720), SCTP (RFC 4960), and ext4 and Btrfs metadata."),
  entry("common", "crc-32-bzip2", "CRC-32/BZIP2", ["CRC-32/AAL5", "CRC-32/DECT-B", "B-CRC-32"], 32, 0x04c11db7n, F32, false, false, F32, 0xfc891918n, "bzip2. The CRC-32 polynomial processed most significant bit first."),
  entry("common", "crc-64-ecma-182", "CRC-64/ECMA-182", ["CRC-64"], 64, 0x42f0e1eba9ea3693n, 0n, false, false, 0n, 0x6c40df5f0b497347n, "The polynomial standardized in ECMA-182."),
  entry("common", "crc-64-xz", "CRC-64/XZ", ["CRC-64/GO-ECMA"], 64, 0x42f0e1eba9ea3693n, F64, true, true, F64, 0x995dc9bbdf1939fan, "The xz file format and the ECMA table in Go's hash/crc64."),

  entry("more", "crc-3-gsm", "CRC-3/GSM", [], 3, 0x3n, 0n, false, false, 0x7n, 0x4n),
  entry("more", "crc-5-usb", "CRC-5/USB", [], 5, 0x05n, 0x1fn, true, true, 0x1fn, 0x19n, "USB token packets."),
  entry("more", "crc-7-mmc", "CRC-7/MMC", [], 7, 0x09n, 0n, false, false, 0n, 0x75n, "SD and MMC card commands."),
  entry("more", "crc-8-rohc", "CRC-8/ROHC", [], 8, 0x07n, 0xffn, true, true, 0n, 0xd0n, "RObust Header Compression (RFC 3095)."),
  entry("more", "crc-8-sae-j1850", "CRC-8/SAE-J1850", [], 8, 0x1dn, 0xffn, false, false, 0xffn, 0x4bn, "SAE J1850 vehicle networks."),
  entry("more", "crc-12-umts", "CRC-12/UMTS", ["CRC-12/3GPP"], 12, 0x80fn, 0n, false, true, 0n, 0xdafn, "Mixed bit order: input is not reflected and the output is."),
  entry("more", "crc-16-dnp", "CRC-16/DNP", [], 16, 0x3d65n, 0n, true, true, F16, 0xea82n, "DNP3."),
  entry("more", "crc-16-genibus", "CRC-16/GENIBUS", ["CRC-16/DARC", "CRC-16/EPC", "CRC-16/I-CODE"], 16, 0x1021n, F16, false, false, F16, 0xd64en),
  entry("more", "crc-16-kermit", "CRC-16/KERMIT", ["CRC-16/CCITT", "CRC-16/CCITT-TRUE", "CRC-16/V-41-LSB", "KERMIT"], 16, 0x1021n, 0n, true, true, 0n, 0x2189n, "Kermit. The bit reflected counterpart of XMODEM."),
  entry("more", "crc-16-mcrf4xx", "CRC-16/MCRF4XX", [], 16, 0x1021n, F16, true, true, 0n, 0x6f91n),
  entry("more", "crc-16-usb", "CRC-16/USB", [], 16, 0x8005n, F16, true, true, F16, 0xb4c8n, "USB data packets."),
  entry("more", "crc-16-x-25", "CRC-16/X-25", ["CRC-16/IBM-SDLC", "CRC-16/ISO-HDLC"], 16, 0x1021n, F16, true, true, F16, 0x906en, "HDLC, X.25 and the PPP frame check sequence (RFC 1662)."),
  entry("more", "crc-24-openpgp", "CRC-24/OPENPGP", [], 24, 0x864cfbn, 0xb704cen, false, false, 0n, 0x21cf02n, "The ASCII armor checksum in OpenPGP (RFC 4880)."),
  entry("more", "crc-32-jamcrc", "CRC-32/JAMCRC", [], 32, 0x04c11db7n, F32, true, true, 0n, 0x340bc6d9n, "CRC-32 without the final inversion."),
  entry("more", "crc-32-mpeg-2", "CRC-32/MPEG-2", [], 32, 0x04c11db7n, F32, false, false, 0n, 0x0376e6e7n, "MPEG-2 transport stream sections."),
  entry("more", "crc-40-gsm", "CRC-40/GSM", [], 40, 0x0004820009n, 0n, false, false, 0xffffffffffn, 0xd4164fc646n),
  entry("more", "crc-64-we", "CRC-64/WE", [], 64, 0x42f0e1eba9ea3693n, F64, false, false, F64, 0x62ec59e3f1a4f00an),
];

export function findEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((candidate) => candidate.id === id);
}

/** The catalog entry whose six parameters equal these, if any. */
export function matchEntry(params: CrcParams): CatalogEntry | undefined {
  return CATALOG.find(
    (e) =>
      e.width === params.width &&
      e.poly === params.poly &&
      e.init === params.init &&
      e.xorout === params.xorout &&
      e.refin === params.refin &&
      e.refout === params.refout,
  );
}

export interface SelfTestRow {
  entry: CatalogEntry;
  got: bigint;
  ok: boolean;
}

/** Computes every entry over "123456789" and compares with its published check value. */
export function selfTest(): SelfTestRow[] {
  return CATALOG.map((e) => {
    const got = checkValue(e);
    return { entry: e, got, ok: got === e.check };
  });
}

/* ------------------------------------------------------------- parameters */

export interface ParamFields {
  width: string;
  poly: string;
  init: string;
  xorout: string;
  refin: boolean;
  refout: boolean;
}

export type FieldName = "width" | "poly" | "init" | "xorout";

export type ParamsParse =
  | { ok: true; params: CrcParams; warnings: string[] }
  | { ok: false; errors: Partial<Record<FieldName, string>> };

export function hexDigitsFor(width: number): number {
  return Math.ceil(width / 4);
}

export function formatHex(value: bigint, width: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(hexDigitsFor(width), "0")}`;
}

/** Fields as the text the parameter boxes show for an entry or a set of parameters. */
export function fieldsFor(params: CrcParams): ParamFields {
  return {
    width: String(params.width),
    poly: formatHex(params.poly, params.width),
    init: formatHex(params.init, params.width),
    xorout: formatHex(params.xorout, params.width),
    refin: params.refin,
    refout: params.refout,
  };
}

type HexResult = { ok: true; value: bigint } | { ok: false; message: string };

function parseHexField(raw: string, width: number | null, what: string): HexResult {
  let text = raw.trim().replace(/[\s_]/g, "");
  if (text === "") return { ok: false, message: `Enter the ${what} in hex. 0 is a valid value.` };
  if (/^0x/i.test(text)) text = text.slice(2);
  if (text === "") return { ok: false, message: `There are no digits after 0x in the ${what}.` };
  if (!/^[0-9a-fA-F]+$/.test(text)) {
    const bad = [...text].find((ch) => !/[0-9a-fA-F]/.test(ch)) ?? text[0];
    return { ok: false, message: `"${bad}" is not a hex digit. The ${what} is written in hex, such as 0x1021.` };
  }
  const significant = text.replace(/^0+(?=.)/, "");
  if (significant.length > 16) {
    return { ok: false, message: `The ${what} has more than 16 hex digits, which is wider than the largest supported width of ${MAX_WIDTH} bits.` };
  }
  const value = BigInt(`0x${text}`);
  if (width !== null && value > widthMask(width)) {
    const needed = value.toString(2).length;
    return {
      ok: false,
      message: `The ${what} needs ${needed} bits but the width is ${width}. At this width the largest value is ${formatHex(widthMask(width), width)}.`,
    };
  }
  return { ok: true, value };
}

/** Validates the parameter boxes. Every bad field reports its own message. */
export function parseParams(fields: ParamFields): ParamsParse {
  const errors: Partial<Record<FieldName, string>> = {};

  let width: number | null = null;
  const widthText = fields.width.trim();
  if (widthText === "") {
    errors.width = `Enter a width from ${MIN_WIDTH} to ${MAX_WIDTH}.`;
  } else if (!/^[0-9]+$/.test(widthText)) {
    errors.width = `The width is a whole number of bits from ${MIN_WIDTH} to ${MAX_WIDTH}.`;
  } else {
    const parsed = Number(widthText);
    if (parsed < MIN_WIDTH || parsed > MAX_WIDTH) {
      errors.width = `The width must be from ${MIN_WIDTH} to ${MAX_WIDTH} bits. ${parsed} is outside that range.`;
    } else {
      width = parsed;
    }
  }

  const poly = parseHexField(fields.poly, width, "polynomial");
  const init = parseHexField(fields.init, width, "initial value");
  const xorout = parseHexField(fields.xorout, width, "final XOR value");
  if (!poly.ok) errors.poly = poly.message;
  else if (poly.value === 0n) errors.poly = "The polynomial cannot be 0.";
  if (!init.ok) errors.init = init.message;
  if (!xorout.ok) errors.xorout = xorout.message;

  if (width === null || !poly.ok || !init.ok || !xorout.ok || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const warnings: string[] = [];
  if ((poly.value & 1n) === 0n) {
    warnings.push(
      "The polynomial is even, so it has no x^0 term, and the x^0 bit of the register is always 0 once a byte has been processed. That wastes a bit of the CRC and weakens error detection. Real CRC polynomials are odd. It is accepted here anyway.",
    );
  }
  return {
    ok: true,
    params: {
      width,
      poly: poly.value,
      init: init.value,
      xorout: xorout.value,
      refin: fields.refin,
      refout: fields.refout,
    },
    warnings,
  };
}

/* ----------------------------------------------------------------- input */

export type BytesParse =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; bytes: Uint8Array };

/**
 * Hex bytes in the forms people paste: DEADBEEF, DE AD BE EF, de:ad:be:ef,
 * 0xDE, 0xAD, \xde\xad. Each token must hold whole bytes, because a lone
 * odd digit could mean a missing nibble at either end and guessing would
 * produce a CRC of data the reader never had.
 */
export function parseHexBytes(raw: string): BytesParse {
  if (raw.trim() === "") return { kind: "empty" };
  if (raw.length > MAX_MANUAL_BYTES * 4) {
    return { kind: "error", message: `That is too long. The hex box takes up to ${MAX_MANUAL_BYTES.toLocaleString("en-US")} bytes. Use a file for more.` };
  }
  const tokens = raw
    .replace(/\\x/gi, " ")
    .split(/[\s,:;.\-_]+/)
    .filter(Boolean)
    .map((token) => token.replace(/^0x/i, ""));
  const bytes: number[] = [];
  let total = 0;
  for (const token of tokens) {
    if (token === "") continue;
    if (!/^[0-9a-fA-F]+$/.test(token)) {
      const bad = [...token].find((ch) => !/[0-9a-fA-F]/.test(ch)) ?? token[0];
      return { kind: "error", message: `"${bad}" is not a hex digit. Use 0 to 9 and A to F, separated by spaces, colons or commas if you like.` };
    }
    if (token.length % 2 !== 0) {
      return {
        kind: "error",
        message: `"${token.length > 12 ? `${token.slice(0, 12)}...` : token}" has ${token.length} hex digits. A byte is two digits, so a digit is missing or extra.`,
      };
    }
    total += token.length / 2;
    if (total > MAX_MANUAL_BYTES) {
      return { kind: "error", message: `That is more than ${MAX_MANUAL_BYTES.toLocaleString("en-US")} bytes. Use a file for more.` };
    }
    for (let i = 0; i < token.length; i += 2) bytes.push(parseInt(token.slice(i, i + 2), 16));
  }
  if (bytes.length === 0) return { kind: "empty" };
  return { kind: "ok", bytes: Uint8Array.from(bytes) };
}

/** UTF-8 bytes of typed text, or a message when it is over the cap. */
export function textBytes(text: string): BytesParse {
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_MANUAL_BYTES) {
    return { kind: "error", message: `That is more than ${MAX_MANUAL_BYTES.toLocaleString("en-US")} characters. Use a file for more.` };
  }
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_MANUAL_BYTES) {
    return { kind: "error", message: `That is ${bytes.length.toLocaleString("en-US")} bytes as UTF-8. The text box takes up to ${MAX_MANUAL_BYTES.toLocaleString("en-US")}. Use a file for more.` };
  }
  return { kind: "ok", bytes };
}

/** The expected CRC a reader pasted, as a value, or a message. */
export function parseExpected(raw: string, width: number): { kind: "empty" } | { kind: "error"; message: string } | { kind: "ok"; value: bigint } {
  if (raw.trim() === "") return { kind: "empty" };
  const parsed = parseHexField(raw, width, "expected value");
  return parsed.ok ? { kind: "ok", value: parsed.value } : { kind: "error", message: parsed.message };
}

/* ---------------------------------------------------------------- output */

export function formatBinary(value: bigint, width: number): string {
  return value.toString(2).padStart(width, "0");
}

/** The value as whole bytes, most significant first or last, as hex pairs. */
export function byteString(value: bigint, width: number, order: "big" | "little"): string {
  const count = Math.ceil(width / 8);
  const bytes: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    bytes.push(((value >> BigInt(i * 8)) & 0xffn).toString(16).toUpperCase().padStart(2, "0"));
  }
  if (order === "little") bytes.reverse();
  return bytes.join(" ");
}

/** The polynomial written out: x^32 + x^26 + ... + x + 1. */
export function polynomialText(poly: bigint, width: number): string {
  const terms = [width === 1 ? "x" : `x^${width}`];
  for (let i = width - 1; i >= 0; i--) {
    if (!((poly >> BigInt(i)) & 1n)) continue;
    terms.push(i === 0 ? "1" : i === 1 ? "x" : `x^${i}`);
  }
  return terms.join(" + ");
}

/** The value with its bytes in the opposite order. Only meaningful for whole bytes. */
export function byteSwap(value: bigint, width: number): bigint {
  let out = 0n;
  for (let i = 0; i < Math.ceil(width / 8); i++) out = (out << 8n) | ((value >> BigInt(i * 8)) & 0xffn);
  return out;
}

/**
 * When a computed CRC and an expected one disagree, the three commonest
 * causes each leave a recognizable fingerprint: the same bytes read the other
 * way round, every bit inverted (a different final XOR), or the bits in
 * reverse order (a different output reflection). Returns a sentence for the
 * first fingerprint that fits, or null.
 */
export function diagnoseMismatch(value: bigint, expected: bigint, width: number): string | null {
  if (width > 8 && width % 8 === 0 && byteSwap(value, width) === expected) {
    return "The expected value is the computed CRC with its bytes in the opposite order. It was probably written or read with the other byte order. CRC-16/MODBUS, for example, is sent low byte first.";
  }
  if ((value ^ widthMask(width)) === expected) {
    return "The expected value is the computed CRC with every bit inverted, so the final XOR value probably differs. Many parameter sets differ only in that.";
  }
  if (reflect(value, width) === expected) {
    return "The expected value is the computed CRC with its bits in reverse order, so the output reflection setting probably differs.";
  }
  return null;
}
