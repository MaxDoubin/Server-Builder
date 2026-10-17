/**
 * File identifier.
 *
 * Identifies a file from its leading bytes, the way file(1) does, using a
 * built-in table of magic-byte signatures. The extension is treated as a
 * claim and checked against the bytes. Refinements read the header fields
 * that separate close relatives (PE32 from PE32+, a Java class from a Mach-O
 * universal binary, OOXML from plain ZIP). Carving scans every offset for the
 * same signatures, so a format appended to or concatenated with another one
 * shows up even when the outer container is not recognized.
 *
 * Short signatures are common in arbitrary data, so carved hits of three
 * bytes are marked weak. A match is evidence, not proof.
 */

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";

const MAX_BYTES = 25 * 1024 * 1024;
const HEADER_BYTES = 128;
const HIT_PAGE = 300;
const STORED_HITS = 5000;

type Family =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "markup"
  | "archive"
  | "compressed"
  | "executable"
  | "database"
  | "forensic"
  | "filesystem"
  | "key"
  | "script";

type Level = "ok" | "warn" | "info";

interface Check {
  level: Level;
  text: string;
}

interface Refinement {
  /** Replaces the signature name when the header identifies a subtype. */
  label?: string;
  /** Extension the subtype normally carries, used for the mismatch check. */
  ext?: string;
  /** Full list of expected extensions; an empty list means none is recorded. */
  exts?: string[];
  details: [string, string][];
}

type Refiner = (b: Uint8Array) => Refinement | null;

interface MagicSig {
  name: string;
  family: Family;
  exts: string[];
  mime: string;
  /** [offset, hex bytes]. A signature matches when every part matches. */
  parts: [number, string][];
  refine?: Refiner;
}

interface FileMeta {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

/* ---------- byte helpers ---------- */

const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, "0");
const hexOffset = (n: number): string => `0x${n.toString(16).toUpperCase()}`;
const offsetColumn = (n: number): string => n.toString(16).toUpperCase().padStart(4, "0");
const printable = (c: number): boolean => c >= 0x20 && c < 0x7f;
const bytesOf = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

function hexOf(b: Uint8Array, from: number, to: number): string {
  const out: string[] = [];
  for (let i = from; i < Math.min(to, b.length); i++) out.push(hex2(b[i]));
  return out.join(" ");
}

function ascii(b: Uint8Array, from: number, length: number): string {
  let out = "";
  const end = Math.min(b.length, from + length);
  for (let i = from; i < end; i++) out += printable(b[i]) ? String.fromCharCode(b[i]) : ".";
  return out;
}

/** Latin-1 view of the first bytes, for searching text markers. */
function windowText(b: Uint8Array, max: number): string {
  const end = Math.min(b.length, max);
  let out = "";
  for (let i = 0; i < end; i += 4096) {
    out += String.fromCharCode(...Array.from(b.subarray(i, Math.min(end, i + 4096))));
  }
  return out;
}

const u16le = (b: Uint8Array, o: number): number =>
  o >= 0 && o + 2 <= b.length ? b[o] | (b[o + 1] << 8) : NaN;
const u16be = (b: Uint8Array, o: number): number =>
  o >= 0 && o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : NaN;
const u32le = (b: Uint8Array, o: number): number =>
  o >= 0 && o + 4 <= b.length ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : NaN;
const u32be = (b: Uint8Array, o: number): number =>
  o >= 0 && o + 4 <= b.length ? b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) : NaN;
const i32le = (b: Uint8Array, o: number): number => {
  const v = u32le(b, o);
  return v >= 0x80000000 ? v - 0x100000000 : v;
};

function isoFromMs(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "unexpected error";
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

function toBase64(b: Uint8Array): string {
  let s = "";
  for (const v of b) s += String.fromCharCode(v);
  return btoa(s);
}

/* ---------- refinements ---------- */

const COLOR_TYPES: Record<number, string> = {
  0: "grayscale",
  2: "RGB",
  3: "indexed",
  4: "grayscale and alpha",
  6: "RGBA",
};

const refinePng: Refiner = (b) => {
  if (b.length < 26 || ascii(b, 12, 4) !== "IHDR") {
    return { details: [["Header chunk", "IHDR missing at offset 0xC"]] };
  }
  const ct = b[25];
  return {
    details: [
      ["Dimensions", `${u32be(b, 16)} x ${u32be(b, 20)} px`],
      ["Bit depth", String(b[24])],
      ["Color type", `${ct} (${COLOR_TYPES[ct] ?? "unknown"})`],
    ],
  };
};

const SOF_KINDS: Record<number, string> = {
  0xc0: "baseline",
  0xc1: "extended sequential",
  0xc2: "progressive",
  0xc3: "lossless",
};

const refineJpeg: Refiner = (b) => {
  const details: [string, string][] = [];
  let i = 2;
  let found = false;
  let exif = false;
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xe1 && ascii(b, i + 4, 4) === "Exif") exif = true;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && i + 9 <= b.length) {
      details.push(["Dimensions", `${u16be(b, i + 7)} x ${u16be(b, i + 5)} px`]);
      details.push(["Precision", `${b[i + 4]}-bit`]);
      details.push(["Process", SOF_KINDS[marker] ?? `SOF marker 0x${hex2(marker)}`]);
      found = true;
      break;
    }
    const len = u16be(b, i + 2);
    if (!(len >= 2)) break;
    i += 2 + len;
  }
  if (!found) details.push(["Dimensions", "not found in header segments"]);
  details.unshift(["EXIF segment", exif ? "present" : "absent"]);
  return { details };
};

const refineGif: Refiner = (b) => {
  if (b.length < 10) return null;
  return {
    details: [
      ["Version", ascii(b, 3, 3)],
      ["Logical screen", `${u16le(b, 6)} x ${u16le(b, 8)} px`],
    ],
  };
};

const refineBmp: Refiner = (b) => {
  if (b.length < 30) return null;
  return {
    details: [
      ["Dimensions", `${Math.abs(i32le(b, 18))} x ${Math.abs(i32le(b, 22))} px`],
      ["Bits per pixel", String(u16le(b, 28))],
      ["Pixel data offset", hexOffset(u32le(b, 10))],
    ],
  };
};

const FTYP_BRANDS: Record<string, string> = {
  heic: "HEIC image",
  heix: "HEIC image",
  mif1: "HEIF image",
  msf1: "HEIF image sequence",
  avif: "AVIF image",
  "qt  ": "QuickTime movie",
  "M4A ": "MPEG-4 audio",
  "M4V ": "MPEG-4 video",
  isom: "MP4 (ISO base media)",
  mp41: "MP4 (version 1)",
  mp42: "MP4 (version 2)",
  "3gp4": "3GPP video",
  "3gp5": "3GPP video",
};

const refineFtyp: Refiner = (b) => {
  const brand = ascii(b, 8, 4);
  return {
    label: FTYP_BRANDS[brand],
    details: [
      ["Major brand", `"${brand}"`],
      ["Box size", String(u32be(b, 0))],
    ],
  };
};

const refinePdf: Refiner = (b) => {
  const ver = ascii(b, 5, 3);
  return {
    details: [["Version", /^\d\.\d$/.test(ver) ? `PDF ${ver}` : `unrecognized (${ver})`]],
  };
};

const ZIP_KINDS: { needle: string; label: string; ext: string }[] = [
  { needle: "word/document.xml", label: "Office Open XML (Word .docx)", ext: "docx" },
  { needle: "xl/workbook.xml", label: "Office Open XML (Excel .xlsx)", ext: "xlsx" },
  { needle: "ppt/presentation.xml", label: "Office Open XML (PowerPoint .pptx)", ext: "pptx" },
  { needle: "AndroidManifest.xml", label: "Android package (APK)", ext: "apk" },
  { needle: "META-INF/MANIFEST.MF", label: "Java archive (JAR)", ext: "jar" },
  { needle: "application/epub+zip", label: "EPUB e-book", ext: "epub" },
  {
    needle: "application/vnd.oasis.opendocument.text",
    label: "OpenDocument text (ODT)",
    ext: "odt",
  },
  {
    needle: "application/vnd.oasis.opendocument.spreadsheet",
    label: "OpenDocument spreadsheet (ODS)",
    ext: "ods",
  },
  { needle: "[Content_Types].xml", label: "Office Open XML (generic)", ext: "" },
];

const refineZip: Refiner = (b) => {
  const details: [string, string][] = [];
  const nameLen = u16le(b, 26);
  if (!Number.isNaN(nameLen) && b.length >= 30 + nameLen) {
    details.push(["First entry", ascii(b, 30, nameLen) || "(empty)"]);
  }
  const kind = ZIP_KINDS.find((k) => windowText(b, 4 * 1024 * 1024).includes(k.needle));
  let central = 0;
  for (let i = 0; i + 4 <= b.length; i++) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x01 && b[i + 3] === 0x02) central++;
  }
  details.push(["Central directory records", `${central} (PK 01 02 signatures)`]);
  return { label: kind?.label, ext: kind?.ext || undefined, details };
};

const GZIP_OS: Record<number, string> = {
  0: "FAT",
  1: "Amiga",
  2: "VMS",
  3: "Unix",
  4: "VM/CMS",
  5: "Atari",
  6: "HPFS",
  7: "Macintosh",
  8: "Z-System",
  9: "CP/M",
  10: "TOPS-20",
  11: "NTFS",
  12: "QDOS",
  13: "Acorn RISCOS",
  255: "unknown",
};

const refineGzip: Refiner = (b) => {
  const mtime = u32le(b, 4);
  const details: [string, string][] = [
    ["Method", b[2] === 8 ? "deflate" : `code ${b[2]}`],
    ["Source OS", GZIP_OS[b[9]] ?? `code ${b[9]}`],
    ["Modified", isoFromMs(mtime * 1000) ?? "not recorded"],
  ];
  if (b.length > 3 && (b[3] & 0x08) !== 0) {
    let end = 10;
    while (end < b.length && b[end] !== 0) end++;
    details.push(["Original name", ascii(b, 10, end - 10) || "(empty)"]);
  }
  if (b.length >= 18) {
    details.push(["Uncompressed size (mod 2^32)", String(u32le(b, b.length - 4))]);
  }
  return { details };
};

const PE_MACHINES: Record<number, string> = {
  0x014c: "x86",
  0x8664: "x64",
  0x01c0: "ARM",
  0x01c4: "ARMv7 Thumb-2",
  0xaa64: "ARM64",
  0x0200: "IA-64",
};

const refinePe: Refiner = (b) => {
  const e = u32le(b, 0x3c);
  if (Number.isNaN(e) || e < 0x40 || e + 26 > b.length) {
    return { details: [["PE header", "absent or e_lfanew out of range"]] };
  }
  if (b[e] !== 0x50 || b[e + 1] !== 0x45 || b[e + 2] !== 0 || b[e + 3] !== 0) {
    return { details: [["PE header", "absent (DOS MZ only)"]] };
  }
  const machine = u16le(b, e + 4);
  const chars = u16le(b, e + 22);
  const opt = u16le(b, e + 24);
  const format =
    opt === 0x20b ? "PE32+ (64-bit)" : opt === 0x10b ? "PE32 (32-bit)" : `optional header 0x${opt.toString(16)}`;
  const kind = chars & 0x2000 ? "DLL" : "executable";
  const arch = PE_MACHINES[machine] ?? `machine 0x${machine.toString(16)}`;
  return {
    label: `Windows ${kind}, ${format}, ${arch}`,
    details: [
      ["PE header offset", hexOffset(e)],
      ["Machine", arch],
      ["Format", format],
      ["Characteristics", chars & 0x2000 ? "DLL" : chars & 0x0002 ? "executable image" : "other"],
    ],
  };
};

const ELF_TYPES: Record<number, string> = {
  1: "relocatable",
  2: "executable",
  3: "shared object",
  4: "core dump",
};

const ELF_MACHINES: Record<number, string> = {
  3: "x86",
  8: "MIPS",
  20: "PowerPC",
  40: "ARM",
  62: "x86-64",
  183: "AArch64",
  243: "RISC-V",
};

const refineElf: Refiner = (b) => {
  if (b.length < 20) return null;
  const is64 = b[4] === 2;
  const le = b[5] !== 2;
  const rd16 = (o: number): number => (le ? u16le(b, o) : u16be(b, o));
  const etype = ELF_TYPES[rd16(16)] ?? `type ${rd16(16)}`;
  const arch = ELF_MACHINES[rd16(18)] ?? `machine ${rd16(18)}`;
  return {
    label: `ELF ${is64 ? "64" : "32"}-bit ${etype} (${arch})`,
    details: [
      ["Class", b[4] === 1 ? "32-bit" : b[4] === 2 ? "64-bit" : `invalid (${b[4]})`],
      ["Byte order", le ? "little-endian" : "big-endian"],
      ["Type", etype],
      ["Machine", arch],
    ],
  };
};

const refineJavaOrFat: Refiner = (b) => {
  if (b.length < 8) return null;
  const minor = u16be(b, 4);
  const major = u16be(b, 6);
  if (minor === 0 && major >= 45 && major <= 99) {
    return {
      label: `Java class file (major ${major}, Java ${major - 44})`,
      details: [
        ["Major version", String(major)],
        ["Minor version", String(minor)],
      ],
    };
  }
  return {
    label: "Mach-O universal (fat) binary",
    exts: [],
    details: [["Architectures", String(major)]],
  };
};

const refineShebang: Refiner = (b) => {
  const line = windowText(b, 512).split("\n")[0].replace(/[^\x20-\x7e]/g, "?").trim();
  return { details: [["Interpreter line", line.slice(0, 160) || "(empty)"]] };
};

const refinePem: Refiner = (b) => {
  const m = /-----BEGIN ([A-Z0-9 ]+)-----/.exec(windowText(b, 256));
  if (!m) return null;
  return { label: `PEM block (${m[1]})`, details: [["Block type", m[1]]] };
};

const refineSqlite: Refiner = (b) => {
  const page = u16be(b, 16);
  return { details: [["Page size", page === 1 ? "65536 bytes" : `${page} bytes`]] };
};

const refineWav: Refiner = (b) => {
  if (b.length < 36 || ascii(b, 12, 4) !== "fmt ") return null;
  const tag = u16le(b, 20);
  return {
    details: [
      ["Format tag", tag === 1 ? "PCM" : String(tag)],
      ["Channels", String(u16le(b, 22))],
      ["Sample rate", `${u32le(b, 24)} Hz`],
      ["Bits per sample", String(u16le(b, 34))],
    ],
  };
};

/* ---------- signature table ---------- */

const SIGNATURES: MagicSig[] = [
  // Images
  { name: "PNG image", family: "image", exts: ["png"], mime: "image/png", parts: [[0, "89 50 4E 47 0D 0A 1A 0A"]], refine: refinePng },
  { name: "JPEG image", family: "image", exts: ["jpg", "jpeg", "jpe", "jfif"], mime: "image/jpeg", parts: [[0, "FF D8 FF"]], refine: refineJpeg },
  { name: "GIF image (87a)", family: "image", exts: ["gif"], mime: "image/gif", parts: [[0, "47 49 46 38 37 61"]], refine: refineGif },
  { name: "GIF image (89a)", family: "image", exts: ["gif"], mime: "image/gif", parts: [[0, "47 49 46 38 39 61"]], refine: refineGif },
  { name: "BMP bitmap", family: "image", exts: ["bmp", "dib"], mime: "image/bmp", parts: [[0, "42 4D"], [6, "00 00 00 00"]], refine: refineBmp },
  { name: "WebP image", family: "image", exts: ["webp"], mime: "image/webp", parts: [[0, "52 49 46 46"], [8, "57 45 42 50"]] },
  { name: "TIFF image (little-endian)", family: "image", exts: ["tif", "tiff"], mime: "image/tiff", parts: [[0, "49 49 2A 00"]] },
  { name: "TIFF image (big-endian)", family: "image", exts: ["tif", "tiff"], mime: "image/tiff", parts: [[0, "4D 4D 00 2A"]] },
  { name: "Windows icon (ICO)", family: "image", exts: ["ico"], mime: "image/x-icon", parts: [[0, "00 00 01 00"]] },
  { name: "Windows cursor (CUR)", family: "image", exts: ["cur"], mime: "image/x-icon", parts: [[0, "00 00 02 00"]] },
  { name: "Photoshop document (PSD)", family: "image", exts: ["psd"], mime: "image/vnd.adobe.photoshop", parts: [[0, "38 42 50 53"]] },
  { name: "JPEG 2000 image", family: "image", exts: ["jp2", "j2k", "jpx"], mime: "image/jp2", parts: [[0, "00 00 00 0C 6A 50 20 20 0D 0A 87 0A"]] },
  { name: "FITS astronomical image", family: "image", exts: ["fits", "fit"], mime: "image/fits", parts: [[0, "53 49 4D 50 4C 45 20 20 3D"]] },

  // Video, audio and ISO base media
  { name: "ISO base media (MP4, MOV, HEIF, AVIF)", family: "video", exts: ["mp4", "m4v", "mov", "3gp", "m4a", "heic", "heif", "avif"], mime: "video/mp4", parts: [[4, "66 74 79 70"]], refine: refineFtyp },
  { name: "WAVE audio (RIFF)", family: "audio", exts: ["wav", "wave"], mime: "audio/wav", parts: [[0, "52 49 46 46"], [8, "57 41 56 45"]], refine: refineWav },
  { name: "AVI video (RIFF)", family: "video", exts: ["avi"], mime: "video/x-msvideo", parts: [[0, "52 49 46 46"], [8, "41 56 49 20"]] },
  { name: "AIFF audio", family: "audio", exts: ["aif", "aiff"], mime: "audio/aiff", parts: [[0, "46 4F 52 4D"], [8, "41 49 46 46"]] },
  { name: "MP3 audio (ID3 tag)", family: "audio", exts: ["mp3"], mime: "audio/mpeg", parts: [[0, "49 44 33"]] },
  { name: "FLAC audio", family: "audio", exts: ["flac"], mime: "audio/flac", parts: [[0, "66 4C 61 43"]] },
  { name: "Ogg container", family: "audio", exts: ["ogg", "oga", "ogv", "opus"], mime: "audio/ogg", parts: [[0, "4F 67 67 53"]] },
  { name: "MIDI audio", family: "audio", exts: ["mid", "midi"], mime: "audio/midi", parts: [[0, "4D 54 68 64"]] },
  { name: "Sun/NeXT audio (au)", family: "audio", exts: ["au", "snd"], mime: "audio/basic", parts: [[0, "2E 73 6E 64"]] },
  { name: "Matroska or WebM video", family: "video", exts: ["mkv", "webm"], mime: "video/x-matroska", parts: [[0, "1A 45 DF A3"]] },
  { name: "Flash video (FLV)", family: "video", exts: ["flv"], mime: "video/x-flv", parts: [[0, "46 4C 56 01"]] },

  // Documents and markup
  { name: "PDF document", family: "document", exts: ["pdf"], mime: "application/pdf", parts: [[0, "25 50 44 46 2D"]], refine: refinePdf },
  { name: "PostScript document", family: "document", exts: ["ps", "eps"], mime: "application/postscript", parts: [[0, "25 21 50 53"]] },
  { name: "Rich Text Format", family: "document", exts: ["rtf"], mime: "application/rtf", parts: [[0, "7B 5C 72 74 66 31"]] },
  { name: "OLE2 compound file (legacy Office, MSI)", family: "document", exts: ["doc", "xls", "ppt", "msi", "msg", "vsd"], mime: "application/x-ole-storage", parts: [[0, "D0 CF 11 E0 A1 B1 1A E1"]] },
  { name: "Outlook data file (PST or OST)", family: "document", exts: ["pst", "ost"], mime: "application/vnd.ms-outlook", parts: [[0, "21 42 44 4E"]] },
  { name: "XML document", family: "markup", exts: ["xml", "xsd", "xsl", "svg"], mime: "application/xml", parts: [[0, "3C 3F 78 6D 6C"]] },
  { name: "HTML document (<!DOCTYPE>)", family: "markup", exts: ["html", "htm"], mime: "text/html", parts: [[0, "3C 21 44 4F 43 54 59 50 45"]] },
  { name: "HTML document (<!doctype>)", family: "markup", exts: ["html", "htm"], mime: "text/html", parts: [[0, "3C 21 64 6F 63 74 79 70 65"]] },
  { name: "HTML document (<html>)", family: "markup", exts: ["html", "htm"], mime: "text/html", parts: [[0, "3C 68 74 6D 6C"]] },
  { name: "Apple binary property list", family: "markup", exts: ["plist"], mime: "application/x-plist", parts: [[0, "62 70 6C 69 73 74"]] },

  // Archives and compression
  { name: "ZIP archive", family: "archive", exts: ["zip", "jar", "apk", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub", "whl", "xpi", "vsix"], mime: "application/zip", parts: [[0, "50 4B 03 04"]], refine: refineZip },
  { name: "ZIP archive (empty)", family: "archive", exts: ["zip"], mime: "application/zip", parts: [[0, "50 4B 05 06"]] },
  { name: "ZIP archive (spanned)", family: "archive", exts: ["zip"], mime: "application/zip", parts: [[0, "50 4B 07 08"]] },
  { name: "7-Zip archive", family: "archive", exts: ["7z"], mime: "application/x-7z-compressed", parts: [[0, "37 7A BC AF 27 1C"]] },
  { name: "RAR archive (v4)", family: "archive", exts: ["rar"], mime: "application/vnd.rar", parts: [[0, "52 61 72 21 1A 07 00"]] },
  { name: "RAR archive (v5)", family: "archive", exts: ["rar"], mime: "application/vnd.rar", parts: [[0, "52 61 72 21 1A 07 01 00"]] },
  { name: "CAB archive (Microsoft cabinet)", family: "archive", exts: ["cab"], mime: "application/vnd.ms-cab-compressed", parts: [[0, "4D 53 43 46"]] },
  { name: "ar archive (static library or .deb)", family: "archive", exts: ["a", "lib", "deb"], mime: "application/x-archive", parts: [[0, "21 3C 61 72 63 68 3E 0A"]] },
  { name: "tar archive (ustar)", family: "archive", exts: ["tar"], mime: "application/x-tar", parts: [[257, "75 73 74 61 72"]] },
  { name: "cpio archive (newc)", family: "archive", exts: ["cpio"], mime: "application/x-cpio", parts: [[0, "30 37 30 37 30 31"]] },
  { name: "Windows imaging (WIM)", family: "archive", exts: ["wim"], mime: "application/x-ms-wim", parts: [[0, "4D 53 57 49 4D 00 00 00"]] },
  { name: "GZIP stream", family: "compressed", exts: ["gz", "tgz", "gzip"], mime: "application/gzip", parts: [[0, "1F 8B 08"]], refine: refineGzip },
  { name: "BZip2 stream", family: "compressed", exts: ["bz2", "tbz2"], mime: "application/x-bzip2", parts: [[0, "42 5A 68"]] },
  { name: "XZ stream", family: "compressed", exts: ["xz", "txz"], mime: "application/x-xz", parts: [[0, "FD 37 7A 58 5A 00"]] },
  { name: "Lzip stream", family: "compressed", exts: ["lz"], mime: "application/x-lzip", parts: [[0, "4C 5A 49 50"]] },
  { name: "Zstandard stream", family: "compressed", exts: ["zst"], mime: "application/zstd", parts: [[0, "28 B5 2F FD"]] },
  { name: "LZ4 frame", family: "compressed", exts: ["lz4"], mime: "application/x-lz4", parts: [[0, "04 22 4D 18"]] },
  { name: "Unix compress (LZW)", family: "compressed", exts: ["z"], mime: "application/x-compress", parts: [[0, "1F 9D"]] },
  { name: "zlib stream (default compression)", family: "compressed", exts: [], mime: "application/zlib", parts: [[0, "78 9C"]] },
  { name: "zlib stream (best compression)", family: "compressed", exts: [], mime: "application/zlib", parts: [[0, "78 DA"]] },
  { name: "zlib stream (low compression)", family: "compressed", exts: [], mime: "application/zlib", parts: [[0, "78 01"]] },
  { name: "SquashFS filesystem", family: "filesystem", exts: ["squashfs", "sqfs"], mime: "application/octet-stream", parts: [[0, "68 73 71 73"]] },

  // Executables and bytecode
  { name: "ELF executable or shared object", family: "executable", exts: ["elf", "so", "o", "ko", "bin", "axf"], mime: "application/x-elf", parts: [[0, "7F 45 4C 46"]], refine: refineElf },
  { name: "DOS MZ executable", family: "executable", exts: ["exe", "dll", "sys", "scr", "efi", "ocx", "cpl", "drv"], mime: "application/x-msdownload", parts: [[0, "4D 5A"]], refine: refinePe },
  { name: "Mach-O executable (32-bit, little-endian)", family: "executable", exts: ["macho", "dylib"], mime: "application/x-mach-binary", parts: [[0, "CE FA ED FE"]] },
  { name: "Mach-O executable (64-bit, little-endian)", family: "executable", exts: ["macho", "dylib"], mime: "application/x-mach-binary", parts: [[0, "CF FA ED FE"]] },
  { name: "Mach-O executable (32-bit, big-endian)", family: "executable", exts: ["macho", "dylib"], mime: "application/x-mach-binary", parts: [[0, "FE ED FA CE"]] },
  { name: "Mach-O executable (64-bit, big-endian)", family: "executable", exts: ["macho", "dylib"], mime: "application/x-mach-binary", parts: [[0, "FE ED FA CF"]] },
  { name: "Java class file or Mach-O universal", family: "executable", exts: ["class"], mime: "application/java-vm", parts: [[0, "CA FE BA BE"]], refine: refineJavaOrFat },
  { name: "WebAssembly module", family: "executable", exts: ["wasm"], mime: "application/wasm", parts: [[0, "00 61 73 6D"]] },
  { name: "Android Dalvik DEX", family: "executable", exts: ["dex"], mime: "application/octet-stream", parts: [[0, "64 65 78 0A"]] },
  { name: "Lua bytecode", family: "executable", exts: ["luac"], mime: "application/x-lua-bytecode", parts: [[0, "1B 4C 75 61"]] },
  { name: "Erlang BEAM module", family: "executable", exts: ["beam"], mime: "application/octet-stream", parts: [[0, "46 4F 52 31"]] },
  { name: "Windows shortcut (LNK)", family: "executable", exts: ["lnk"], mime: "application/x-ms-shortcut", parts: [[0, "4C 00 00 00 01 14 02 00"]] },
  { name: "Adobe Flash SWF (uncompressed)", family: "document", exts: ["swf"], mime: "application/x-shockwave-flash", parts: [[0, "46 57 53"]] },
  { name: "Adobe Flash SWF (zlib)", family: "document", exts: ["swf"], mime: "application/x-shockwave-flash", parts: [[0, "43 57 53"]] },
  { name: "Adobe Flash SWF (LZMA)", family: "document", exts: ["swf"], mime: "application/x-shockwave-flash", parts: [[0, "5A 57 53"]] },

  // Disks, databases and forensic artifacts
  { name: "SQLite 3 database", family: "database", exts: ["sqlite", "sqlite3", "db", "db3", "s3db"], mime: "application/vnd.sqlite3", parts: [[0, "53 51 4C 69 74 65 20 66 6F 72 6D 61 74 20 33 00"]], refine: refineSqlite },
  { name: "Microsoft Access database (Jet or ACE)", family: "database", exts: ["mdb", "accdb"], mime: "application/x-msaccess", parts: [[0, "00 01 00 00 53 74 61 6E 64 61 72 64"]] },
  { name: "KeePass 2 database", family: "database", exts: ["kdbx"], mime: "application/octet-stream", parts: [[0, "03 D9 A2 9A 67 FB 4B B5"]] },
  { name: "Windows event log (EVTX)", family: "forensic", exts: ["evtx"], mime: "application/octet-stream", parts: [[0, "45 6C 66 46 69 6C 65 00"]] },
  { name: "Windows registry hive (REGF)", family: "forensic", exts: ["dat", "hve", "hiv"], mime: "application/octet-stream", parts: [[0, "72 65 67 66"]] },
  { name: "Windows prefetch (compressed)", family: "forensic", exts: ["pf"], mime: "application/octet-stream", parts: [[0, "4D 41 4D 04"]] },
  { name: "Windows minidump", family: "forensic", exts: ["dmp"], mime: "application/octet-stream", parts: [[0, "4D 44 4D 50"]] },
  { name: "PCAP capture (little-endian)", family: "forensic", exts: ["pcap", "cap"], mime: "application/vnd.tcpdump.pcap", parts: [[0, "D4 C3 B2 A1"]] },
  { name: "PCAP capture (big-endian)", family: "forensic", exts: ["pcap", "cap"], mime: "application/vnd.tcpdump.pcap", parts: [[0, "A1 B2 C3 D4"]] },
  { name: "PCAPNG capture", family: "forensic", exts: ["pcapng"], mime: "application/x-pcapng", parts: [[0, "0A 0D 0D 0A"]] },
  { name: "Java serialized object", family: "forensic", exts: ["ser"], mime: "application/x-java-serialized-object", parts: [[0, "AC ED 00 05"]] },
  { name: "Git pack file", family: "forensic", exts: ["pack"], mime: "application/x-git-packed-objects", parts: [[0, "50 41 43 4B"]] },
  { name: "QEMU copy-on-write disk (QCOW2)", family: "filesystem", exts: ["qcow2"], mime: "application/octet-stream", parts: [[0, "51 46 49 FB"]] },
  { name: "VMware disk (sparse)", family: "filesystem", exts: ["vmdk"], mime: "application/x-vmdk", parts: [[0, "4B 44 4D 56"]] },
  { name: "VHD disk (Microsoft)", family: "filesystem", exts: ["vhd"], mime: "application/octet-stream", parts: [[0, "63 6F 6E 65 63 74 69 78"]] },
  { name: "ISO 9660 disc image", family: "filesystem", exts: ["iso"], mime: "application/x-iso9660-image", parts: [[32769, "43 44 30 30 31"]] },

  // Keys, certificates and scripts
  { name: "PEM-encoded block", family: "key", exts: ["pem", "crt", "cer", "key", "csr", "pub"], mime: "application/x-pem-file", parts: [[0, "2D 2D 2D 2D 2D 42 45 47 49 4E"]], refine: refinePem },
  { name: "OpenSSH private key", family: "key", exts: [], mime: "application/octet-stream", parts: [[0, "2D 2D 2D 2D 2D 42 45 47 49 4E 20 4F 50 45 4E 53 53 48"]] },
  { name: "ASN.1 DER SEQUENCE (certificate, key or PKCS#12)", family: "key", exts: ["der", "cer", "crt", "p12", "pfx"], mime: "application/pkix-cert", parts: [[0, "30 82"]] },
  { name: "Script with shebang", family: "script", exts: ["sh", "py", "pl", "rb"], mime: "text/x-script", parts: [[0, "23 21"]], refine: refineShebang },
  { name: "PHP script (open tag)", family: "script", exts: ["php"], mime: "application/x-httpd-php", parts: [[0, "3C 3F 70 68 70"]] },
];

interface CompiledSig {
  sig: MagicSig;
  parts: { at: number; bytes: number[] }[];
  /** Total fixed bytes across all parts. */
  fixed: number;
  /** First byte of the longest part, used as the carving key. */
  key: number;
  /** Offset of that part inside the signature. */
  delta: number;
}

function compile(sig: MagicSig): CompiledSig {
  const parts = sig.parts.map(([at, hex]) => ({
    at,
    bytes: hex.trim().split(/\s+/).map((t) => parseInt(t, 16)),
  }));
  let anchor = parts[0];
  for (const p of parts) if (p.bytes.length > anchor.bytes.length) anchor = p;
  return {
    sig,
    parts,
    fixed: parts.reduce((n, p) => n + p.bytes.length, 0),
    key: anchor.bytes[0],
    delta: anchor.at,
  };
}

const COMPILED: CompiledSig[] = SIGNATURES.map(compile);

const CARVE_INDEX: CompiledSig[][] = Array.from({ length: 256 }, () => []);
for (const c of COMPILED) {
  if (c.fixed >= 3) CARVE_INDEX[c.key].push(c);
}

const KNOWN_EXTS = new Set(SIGNATURES.flatMap((s) => s.exts));

/** Extensions shared by many unrelated formats, so a miss is not a warning. */
const GENERIC_EXTS = new Set([
  "a", "bin", "cap", "cer", "crt", "csr", "dat", "db", "der", "dmp", "hiv", "hve",
  "index", "key", "ko", "lib", "o", "pack", "pem", "pf", "pub", "ser",
]);

/* ---------- analysis ---------- */

function matchesAt(b: Uint8Array, start: number, c: CompiledSig): boolean {
  if (start < 0) return false;
  for (const p of c.parts) {
    const base = start + p.at;
    if (base + p.bytes.length > b.length) return false;
    for (let j = 0; j < p.bytes.length; j++) {
      if (b[base + j] !== p.bytes[j]) return false;
    }
  }
  return true;
}

interface Hit {
  offset: number;
  c: CompiledSig;
}

interface Carved {
  hits: Hit[];
  total: number;
  byName: { name: string; count: number; weak: boolean }[];
}

/** Every signature match at an offset above zero, scanned in a single pass. */
function carve(b: Uint8Array): Carved {
  const hits: Hit[] = [];
  const counts = new Map<string, { count: number; weak: boolean }>();
  let total = 0;
  for (let i = 0; i < b.length; i++) {
    const bucket = CARVE_INDEX[b[i]];
    if (bucket.length === 0) continue;
    for (const c of bucket) {
      const start = i - c.delta;
      if (start <= 0 || !matchesAt(b, start, c)) continue;
      total++;
      const entry = counts.get(c.sig.name) ?? { count: 0, weak: c.fixed < 4 };
      entry.count++;
      counts.set(c.sig.name, entry);
      if (hits.length < STORED_HITS) hits.push({ offset: start, c });
    }
  }
  hits.sort((x, y) => x.offset - y.offset);
  const byName = Array.from(counts.entries())
    .map(([name, v]) => ({ name, count: v.count, weak: v.weak }))
    .sort((x, y) => y.count - x.count);
  return { hits, total, byName };
}

function entropyOf(b: Uint8Array): number {
  if (b.length === 0) return 0;
  const counts = new Array<number>(256).fill(0);
  for (let i = 0; i < b.length; i++) counts[b[i]]++;
  let h = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / b.length;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

function entropyLabel(h: number): string {
  if (h < 1) return "very low, repetitive or sparse";
  if (h < 5) return "low, text or structured data";
  if (h < 7) return "moderate, mixed binary";
  if (h < 7.5) return "high, compressed or packed likely";
  return "very high, compressed, encrypted or random";
}

function contentClass(b: Uint8Array): string {
  if (b.length === 0) return "Empty file";
  const sample = b.subarray(0, Math.min(b.length, 4096));
  if (sample.every((v) => v === 0)) return "Zero-filled";
  if (sample[0] === 0xff && sample[1] === 0xfe) return "UTF-16LE text (byte order mark)";
  if (sample[0] === 0xfe && sample[1] === 0xff) return "UTF-16BE text (byte order mark)";
  let plain = 0;
  let control = 0;
  for (const v of sample) {
    if (printable(v) || v === 0x09 || v === 0x0a || v === 0x0d) plain++;
    else if (v < 0x20 || v === 0x7f) control++;
  }
  if (plain / sample.length >= 0.97) return "ASCII text";
  // NUL and other control bytes are valid UTF-8 but mean binary data.
  if (control / sample.length > 0.02) return "Binary, no text encoding";
  // A multi-byte sequence cut at the sample edge is not an error, so trim it.
  const checked = b.length > sample.length ? sample.subarray(0, sample.length - 3) : sample;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(checked);
    return "UTF-8 text (valid sequences)";
  } catch {
    return "Binary, no text encoding";
  }
}

function findLast(b: Uint8Array, pattern: number[], floor = 0): number {
  for (let i = b.length - pattern.length; i >= floor; i--) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (b[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function tailCheck(extra: number, endLabel: string): Check {
  return extra > 0
    ? { level: "warn", text: `${extra} bytes after ${endLabel}.` }
    : { level: "ok", text: `Nothing after ${endLabel}.` };
}

function trailerChecks(b: Uint8Array, primary: CompiledSig | null): Check[] {
  if (!primary) return [];
  const n = b.length;
  switch (primary.sig.name) {
    case "PNG image": {
      const at = findLast(b, bytesOf("IEND"));
      if (at < 8) return [{ level: "warn", text: "No IEND chunk. The PNG is truncated or damaged." }];
      return [tailCheck(n - (at + 8), "the PNG IEND chunk")];
    }
    case "JPEG image": {
      const at = findLast(b, [0xff, 0xd9]);
      if (at < 0) return [{ level: "warn", text: "No end-of-image marker (FF D9). The JPEG is truncated." }];
      return [tailCheck(n - (at + 2), "the JPEG end-of-image marker")];
    }
    case "GIF image (87a)":
    case "GIF image (89a)":
      return [
        b[n - 1] === 0x3b
          ? { level: "ok", text: "Trailer byte 0x3B is the final byte." }
          : { level: "warn", text: "Final byte is not the GIF trailer (0x3B). Truncated or has appended data." },
      ];
    case "PDF document": {
      const at = findLast(b, bytesOf("%%EOF"));
      if (at < 0) return [{ level: "warn", text: "No %%EOF marker." }];
      let junk = 0;
      for (let i = at + 5; i < n; i++) {
        if (b[i] !== 0x0a && b[i] !== 0x0d && b[i] !== 0x20 && b[i] !== 0x09) junk++;
      }
      return [
        junk > 0
          ? { level: "warn", text: `${junk} non-whitespace bytes after the last %%EOF. Likely an appended or incremental update.` }
          : { level: "ok", text: "Nothing but whitespace after the last %%EOF." },
      ];
    }
    case "ZIP archive": {
      const at = findLast(b, [0x50, 0x4b, 0x05, 0x06], Math.max(0, n - 65557));
      if (at < 0) return [{ level: "warn", text: "No end-of-central-directory record in the last 64 KiB." }];
      if (at + 22 > n) return [{ level: "warn", text: "End-of-central-directory record is truncated." }];
      const comment = u16le(b, at + 20);
      const end = at + 22 + comment;
      return [
        tailCheck(n - end, "the ZIP end record"),
        { level: "info", text: `ZIP comment field is ${comment} bytes.` },
      ];
    }
    default:
      return [];
  }
}

function checkExtension(
  ext: string,
  primary: CompiledSig | null,
  expected: string[],
  label: string,
): Check {
  if (!primary) {
    if (!ext) return { level: "info", text: "No extension and no signature match." };
    if (KNOWN_EXTS.has(ext) && !GENERIC_EXTS.has(ext)) {
      const first = SIGNATURES.find((s) => s.exts.includes(ext));
      return {
        level: "warn",
        text: `.${ext} normally holds ${first?.name ?? "a known format"}, but no signature matches the first bytes.`,
      };
    }
    return { level: "info", text: `No signature matches. .${ext} is not a signature extension.` };
  }
  if (expected.length === 0) return { level: "info", text: `${label} records no extension to compare.` };
  const list = expected.map((e) => `.${e}`).join(", ");
  if (!ext) return { level: "info", text: `No extension. ${label} normally uses ${list}.` };
  if (expected.includes(ext)) return { level: "ok", text: `.${ext} matches ${label}.` };
  return { level: "warn", text: `.${ext} does not match ${label}. Expected ${list}.` };
}

interface Identification {
  meta: FileMeta;
  bytes: Uint8Array;
  ext: string;
  primary: CompiledSig | null;
  others: MagicSig[];
  refinement: Refinement | null;
  extCheck: Check;
  entropy: number;
  content: string;
  trailer: Check[];
  carved: Carved;
  marked: Set<number>;
}

function labelOf(r: Identification): string {
  return r.refinement?.label ?? r.primary?.sig.name ?? "No signature match";
}

function identify(b: Uint8Array, meta: FileMeta): Identification {
  const ext = extensionOf(meta.name);
  const matched = COMPILED.filter((c) => matchesAt(b, 0, c)).sort((x, y) => y.fixed - x.fixed);
  const primary = matched[0] ?? null;
  const refiner = primary?.sig.refine;
  const refinement = primary && refiner ? refiner(b) : null;
  const expected =
    refinement?.exts ?? (refinement?.ext ? [refinement.ext] : (primary?.sig.exts ?? []));
  const label = refinement?.label ?? primary?.sig.name ?? "";
  const marked = new Set<number>();
  if (primary) {
    for (const p of primary.parts) {
      for (let j = 0; j < p.bytes.length; j++) marked.add(p.at + j);
    }
  }
  return {
    meta,
    bytes: b,
    ext,
    primary,
    others: matched.slice(1).map((c) => c.sig),
    refinement,
    extCheck: checkExtension(ext, primary, expected, label),
    entropy: entropyOf(b),
    content: contentClass(b),
    trailer: trailerChecks(b, primary),
    carved: carve(b),
    marked,
  };
}

/** Built-in sample: PNG with appended text, a ZIP header and a gzip member. */
function sampleBytes(): Uint8Array {
  const out: number[] = [];
  const put = (...values: number[]): void => {
    out.push(...values);
  };
  const text = (s: string): void => {
    out.push(...bytesOf(s));
  };
  put(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  put(0, 0, 0, 13);
  text("IHDR");
  put(0, 0, 0, 16, 0, 0, 0, 16, 8, 6, 0, 0, 0, 0, 0, 0, 0);
  put(0, 0, 0, 0);
  text("IEND");
  put(0xae, 0x42, 0x60, 0x82);
  text("hidden:");
  put(
    0x50, 0x4b, 0x03, 0x04,
    0x14, 0x00,
    0x00, 0x00,
    0x00, 0x00,
    0x00, 0x00,
    0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x09, 0x00,
    0x00, 0x00,
  );
  text("notes.txt");
  text("flag{carved_from_tail}");
  put(
    0x1f, 0x8b, 0x08, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x03,
    0x03, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  );
  return Uint8Array.from(out);
}

/* ---------- presentation ---------- */

const LEVEL_STYLE: Record<Level, string> = {
  ok: "border-[hsl(var(--brand-signal)/0.5)] text-[hsl(var(--brand-signal))]",
  warn: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  info: "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))]",
};

const LEVEL_WORD: Record<Level, string> = { ok: "ok", warn: "warning", info: "note" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-[hsl(var(--brand-iron)/0.6)] py-2.5 first:border-t-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
        {label}
      </dt>
      <dd className="min-w-0 break-words font-mono-tight text-sm text-[hsl(var(--brand-bone))] sm:text-right">
        {children}
      </dd>
    </div>
  );
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((c, i) => (
        <li
          key={i}
          className="flex flex-col gap-1.5 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3 sm:flex-row sm:items-start sm:gap-3"
        >
          <span
            className={`inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-0.5 font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] ${LEVEL_STYLE[c.level]}`}
          >
            {LEVEL_WORD[c.level]}
          </span>
          <span className="min-w-0 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))]">
            {c.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HexDump({ bytes, marked }: { bytes: Uint8Array; marked: Set<number> }) {
  const shown = Math.min(bytes.length, HEADER_BYTES);
  const rows: ReactNode[] = [];
  for (let row = 0; row < shown; row += 8) {
    const end = Math.min(shown, row + 8);
    const cells: ReactNode[] = [];
    for (let i = row; i < end; i++) {
      cells.push(
        <span
          key={i}
          className={marked.has(i) ? "text-[hsl(var(--brand-signal))]" : "text-[hsl(var(--brand-bone))]"}
        >
          {hex2(bytes[i])}
          {i < end - 1 ? " " : ""}
        </span>,
      );
    }
    rows.push(
      <div key={row} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 font-mono-tight text-xs">
        <span className="text-[hsl(var(--brand-ash))]">{offsetColumn(row)}</span>
        <span className="break-words">{cells}</span>
        <span className="break-all text-[hsl(var(--brand-cyan))]">{ascii(bytes, row, 8)}</span>
      </div>,
    );
  }
  return (
    <div data-testid="hex-dump" className="space-y-1.5 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3">
      {rows}
    </div>
  );
}

export function FileIdentifier() {
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sigQuery, setSigQuery] = useState("");
  const [hitLimit, setHitLimit] = useState(HIT_PAGE);
  const runRef = useRef(0);

  const analysis = useMemo<{ result: Identification | null; failure: string | null }>(() => {
    if (!meta || !bytes) return { result: null, failure: null };
    try {
      return { result: identify(bytes, meta), failure: null };
    } catch (err) {
      return { result: null, failure: `Analysis failed: ${errorText(err)}` };
    }
  }, [meta, bytes]);

  const r = analysis.result;

  async function loadFile(f: File): Promise<void> {
    const run = ++runRef.current;
    setBusy(false);
    setError(null);
    setMeta(null);
    setBytes(null);
    setHitLimit(HIT_PAGE);
    if (f.size > MAX_BYTES) {
      setError(`File is ${formatBytes(f.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    setBusy(true);
    try {
      const buffer = await f.arrayBuffer();
      if (run !== runRef.current) return;
      setMeta({ name: f.name, size: f.size, type: f.type, lastModified: f.lastModified });
      setBytes(new Uint8Array(buffer));
    } catch (err) {
      if (run === runRef.current) setError(`Could not read the file: ${errorText(err)}`);
    } finally {
      if (run === runRef.current) setBusy(false);
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>): void {
    const input = e.currentTarget;
    const f = input.files?.[0];
    input.value = "";
    if (f) void loadFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void loadFile(f);
  }

  function loadSample(): void {
    void loadFile(new File([sampleBytes()], "mislabeled.txt", { type: "text/plain" }));
  }

  const q = sigQuery.trim().toLowerCase();
  const qHex = q.replace(/\s+/g, "");
  const filteredSigs = SIGNATURES.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.exts.includes(q.replace(/^\./, "")) ||
      s.parts.some(([, hexText]) => hexText.replace(/ /g, "").toLowerCase().includes(qHex)),
  );

  const summary = error
    ? error
    : !meta
      ? "Choose a file to identify."
      : busy
        ? "Reading file."
        : analysis.failure
          ? analysis.failure
          : r
            ? `${labelOf(r)}.${r.extCheck.level === "warn" ? " Extension does not match the content." : ""}`
            : "";

  return (
    <ToolShell slug="file-identifier">
      <p role="status" aria-live="polite" data-testid="text-summary" className="sr-only">
        {summary}
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <ToolPanel title="Input" className="lg:col-span-2">
          <label htmlFor="file-input" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            Choose a file (25 MiB limit)
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-testid="dropzone"
            className={`rounded-xl border border-dashed p-4 transition-colors ${
              dragging
                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.06)]"
                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]"
            }`}
          >
            <input
              id="file-input"
              type="file"
              onChange={onFileChosen}
              data-testid="file-input"
              className="block w-full min-h-[44px] cursor-pointer font-mono-tight text-sm text-[hsl(var(--brand-bone))] file:mr-4 file:min-h-[44px] file:cursor-pointer file:rounded-lg file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-xs file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
            />
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Any file type works. Detection reads the leading bytes, then carves the whole file for embedded signatures.
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadSample}
              className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
            >
              Load sample
            </button>
            {busy ? (
              <span className="font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">Reading file</span>
            ) : null}
          </div>

          {error ? (
            <p role="alert" data-testid="text-error" className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-danger))]">
              {error}
            </p>
          ) : null}

          {meta ? (
            <dl className="mt-5 border-t border-[hsl(var(--brand-iron)/0.6)] pt-1">
              <Field label="Name">
                <span className="break-all">{meta.name || "(no name)"}</span>
              </Field>
              <Field label="Size">{`${meta.size.toLocaleString("en-US")} bytes`}</Field>
              <Field label="Browser MIME type">{meta.type || "not reported"}</Field>
              <Field label="Extension">{extensionOf(meta.name) ? `.${extensionOf(meta.name)}` : "none"}</Field>
              <Field label="Last modified">{isoFromMs(meta.lastModified) ?? "not recorded"}</Field>
            </dl>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Identification">
          {!meta ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Choose a file to see its type.</p>
          ) : !r ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
              {analysis.failure ?? "Reading file."}
            </p>
          ) : (
            <div data-testid="identification">
              <p className="font-display text-xl text-[hsl(var(--brand-bone))]">{labelOf(r)}</p>
              {r.primary ? (
                <p className="mt-1 font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                  {r.primary.sig.family}
                </p>
              ) : null}
              <dl className="mt-4">
                {r.primary ? (
                  <>
                    <Field label="MIME (signature)">{r.primary.sig.mime}</Field>
                    <Field label="Expected extensions">
                      {r.primary.sig.exts.length ? r.primary.sig.exts.map((e) => `.${e}`).join(" ") : "none recorded"}
                    </Field>
                    {r.primary.parts.map((p) => (
                      <Field key={p.at} label={`Matched at ${hexOffset(p.at)}`}>
                        <span className="text-[hsl(var(--brand-signal))]">
                          {hexOf(r.bytes, p.at, p.at + p.bytes.length)}
                        </span>
                      </Field>
                    ))}
                    <Field label="Other matches at 0">
                      {r.others.length ? r.others.map((s) => s.name).join(", ") : "none"}
                    </Field>
                  </>
                ) : (
                  <Field label="Signature">No signature matched the leading bytes.</Field>
                )}
                {r.refinement?.details.map(([k, v]) => (
                  <Field key={k} label={k}>
                    {v}
                  </Field>
                ))}
                <Field label="Content">{r.content}</Field>
                <Field label="Entropy">
                  {r.bytes.length ? `${r.entropy.toFixed(3)} bits/byte, ${entropyLabel(r.entropy)}` : "n/a, empty file"}
                </Field>
              </dl>
              <div className="mt-4">
                <CheckList checks={[r.extCheck]} />
              </div>
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Trailer and integrity">
          {!r ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Waiting for a file.</p>
          ) : (
            <div data-testid="trailer">
              {r.trailer.length ? (
                <CheckList checks={r.trailer} />
              ) : (
                <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {r.primary
                    ? "No trailer check is defined for this format."
                    : "No signature matched, so there is no end marker to check."}
                </p>
              )}
              <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                Appended data sits after a format's end marker. Concatenated formats appear under embedded signatures.
              </p>
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Header" className="lg:col-span-2">
          {!r ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Waiting for a file.</p>
          ) : r.bytes.length === 0 ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">The file has no bytes.</p>
          ) : (
            <>
              <HexDump bytes={r.bytes} marked={r.marked} />
              <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                First {Math.min(r.bytes.length, HEADER_BYTES)} of {r.bytes.length.toLocaleString("en-US")} bytes. Signature bytes are highlighted.
              </p>
              <dl className="mt-4 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <Field label="Base64 (first 96)">
                  <span className="break-all">{toBase64(r.bytes.subarray(0, 96))}</span>
                </Field>
                <Field label="Decimal (first 16)">
                  <span className="break-words">{Array.from(r.bytes.subarray(0, 16)).join(" ")}</span>
                </Field>
                <Field label="Octal (first 8)">
                  {Array.from(r.bytes.subarray(0, 8), (v) => v.toString(8).padStart(3, "0")).join(" ")}
                </Field>
                <Field label="Binary (first 4)">
                  <span className="break-all">
                    {Array.from(r.bytes.subarray(0, 4), (v) => v.toString(2).padStart(8, "0")).join(" ")}
                  </span>
                </Field>
              </dl>
            </>
          )}
        </ToolPanel>

        <ToolPanel title="Embedded signatures" className="lg:col-span-2">
          {!r ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Waiting for a file.</p>
          ) : (
            <div data-testid="embedded-hits">
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                {r.carved.total.toLocaleString("en-US")} signature hits at offsets above zero, across{" "}
                {r.carved.byName.length} signatures. Scanned {r.bytes.length.toLocaleString("en-US")} bytes at every offset.
              </p>
              {r.carved.total === 0 ? (
                <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  No embedded signatures found.
                </p>
              ) : (
                <>
                  <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {r.carved.byName.map((n) => (
                      <li
                        key={n.name}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                      >
                        <span className="min-w-0 break-words font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                          {n.name}
                        </span>
                        <span className="shrink-0 font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                          {n.count.toLocaleString("en-US")}
                          {n.weak ? " (weak)" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <ol className="mt-4 space-y-2">
                    {r.carved.hits.slice(0, hitLimit).map((hit, i) => (
                      <li
                        key={`${hit.offset}:${i}`}
                        className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-mono-tight text-xs text-[hsl(var(--brand-signal))]">
                            {hit.offset.toLocaleString("en-US")} ({hexOffset(hit.offset)})
                          </span>
                          <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                            {hit.c.sig.family}
                            {hit.c.fixed < 4 ? " / short signature" : ""}
                          </span>
                        </div>
                        <p className="mt-1 break-words font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                          {hit.c.sig.name}
                        </p>
                        <p className="mt-1 break-words font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                          {hexOf(r.bytes, hit.offset, hit.offset + 8)}
                        </p>
                      </li>
                    ))}
                  </ol>
                  {r.carved.hits.length > hitLimit ? (
                    <button
                      type="button"
                      onClick={() => setHitLimit((n) => n + HIT_PAGE)}
                      className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                    >
                      Show {Math.min(HIT_PAGE, r.carved.hits.length - hitLimit)} more
                    </button>
                  ) : null}
                  {r.carved.total > r.carved.hits.length ? (
                    <p className="mt-3 font-mono-tight text-xs text-[hsl(var(--brand-amber))]">
                      Stored the first {r.carved.hits.length.toLocaleString("en-US")} of {r.carved.total.toLocaleString("en-US")} hits.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}
        </ToolPanel>

        <ToolPanel title="Signature database" className="lg:col-span-2">
          <label htmlFor="sig-search" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            Filter by name, extension or hex
          </label>
          <input
            id="sig-search"
            type="search"
            value={sigQuery}
            onChange={(e) => setSigQuery(e.target.value)}
            placeholder="png, pdf, 89 50, 50 4B"
            spellCheck={false}
            data-testid="sig-search"
            className="w-full min-h-[44px] rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            {filteredSigs.length} of {SIGNATURES.length} signatures
          </p>
          <ul data-testid="sig-list" className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {filteredSigs.map((s) => (
              <li
                key={`${s.name}|${s.parts[0][1]}`}
                className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{s.name}</span>
                  <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                    {s.family}
                  </span>
                </div>
                <p className="mt-1 break-words font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">
                  {s.exts.length ? s.exts.map((e) => `.${e}`).join(" ") : "no extension"}
                </p>
                {s.parts.map(([at, hex]) => (
                  <p key={`${at}:${hex}`} className="mt-1 break-words font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                    @{hexOffset(at)} {hex}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
