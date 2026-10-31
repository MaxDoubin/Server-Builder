/**
 * Pluggable transceiver reference data and filtering.
 *
 * Every IEEE row cites the 802.3 amendment that introduced the PMD, and the
 * reach figures are the operating ranges those clauses specify:
 *   802.3z  1000BASE-SX/LX        802.3ab 1000BASE-T
 *   802.3ah 1000BASE-LX10/BX10    802.3ae 10GBASE-SR/LR/ER
 *   802.3an 10GBASE-T             802.3by 25GBASE-SR/CR
 *   802.3cc 25GBASE-LR            802.3ba 40GBASE-SR4/LR4/CR4, 100GBASE-LR4
 *   802.3bj 100GBASE-CR4          802.3bm 100GBASE-SR4
 *   802.3cd 100GBASE-DR, 200GBASE-SR4/CR4
 *   802.3bs 200GBASE-DR4/FR4, 400GBASE-DR4/LR8
 *   802.3cm 400GBASE-SR8/SR4.2    802.3cu 100GBASE-FR1/LR1, 400GBASE-FR4
 *   802.3cp 10GBASE-BR (bidirectional 10G, standardized after the vendor parts)
 *
 * Multimode reach depends on the fiber grade, so those rows carry one figure
 * per OM grade. Where a standard lists no OM5 figure the OM4 one applies,
 * because OM5 has the same 4700 MHz·km effective modal bandwidth at 850 nm.
 * Rows that are vendor conventions (ZX, ZR, DAC and AOC lengths, 40G BiDi)
 * say so in definedBy, because their reach is a vendor rating, not a spec.
 *
 * Pure data and functions, no React and no DOM.
 */

export type Media = "mmf" | "smf" | "tp" | "dac" | "aoc";
export type FormFactor = "SFP" | "SFP+" | "SFP28" | "QSFP+" | "QSFP28" | "QSFP56" | "QSFP-DD" | "OSFP";
export type Grade = "OM1" | "OM2" | "OM3" | "OM4" | "OM5";

export const GRADES: Grade[] = ["OM1", "OM2", "OM3", "OM4", "OM5"];
export const SPEEDS: number[] = [1, 10, 25, 40, 100, 200, 400];
export const FORM_FACTOR_ORDER: FormFactor[] = ["SFP", "SFP+", "SFP28", "QSFP+", "QSFP28", "QSFP56", "QSFP-DD", "OSFP"];

export const MEDIA_LABEL: Record<Media, string> = {
  mmf: "Multimode fiber",
  smf: "Single-mode fiber",
  tp: "Twisted pair",
  dac: "Direct attach copper",
  aoc: "Active optical cable",
};

export const MEDIA_SHORT: Record<Media, string> = {
  mmf: "MMF",
  smf: "SMF",
  tp: "Copper TP",
  dac: "DAC",
  aoc: "AOC",
};

export interface Module {
  id: string;
  name: string;
  formFactors: FormFactor[];
  speedGbps: number;
  media: Media;
  wavelength: string;
  /** Best-case reach in meters (for multimode, the best grade). */
  reachM: number;
  /** Multimode only: reach per fiber grade. A missing grade is not specified. */
  mmfReach?: Partial<Record<Grade, number>>;
  reachText: string;
  connector: string;
  lanes: string;
  definedBy: string;
  notes: string;
  /** Extra search terms. */
  tags: string[];
}

const AOC_NOTE =
  "Optics and fiber sealed into one assembly at a fixed length. Thinner and lighter than a DAC at length, but the fiber cannot be re-terminated or swapped.";

export const MODULES: Module[] = [
  /* ------------------------------------------------------------ 1G */
  {
    id: "1000base-t",
    name: "1000BASE-T",
    formFactors: ["SFP"],
    speedGbps: 1,
    media: "tp",
    wavelength: "Electrical",
    reachM: 100,
    reachText: "100 m on Cat5e or better",
    connector: "RJ45",
    lanes: "4 pairs, PAM-5",
    definedBy: "IEEE 802.3ab",
    notes:
      "Draws more power than a 1G optic. Whether 10 and 100 Mb/s work depends on the module and on the host running SGMII.",
    tags: ["copper", "rj45", "cat5e", "gigabit"],
  },
  {
    id: "1000base-sx",
    name: "1000BASE-SX",
    formFactors: ["SFP"],
    speedGbps: 1,
    media: "mmf",
    wavelength: "850 nm",
    reachM: 550,
    mmfReach: { OM1: 275, OM2: 550, OM3: 550, OM4: 550, OM5: 550 },
    reachText: "275 m OM1, 550 m OM2 and better",
    connector: "LC duplex",
    lanes: "1 x 1G (1.25 GBd, 8b/10b)",
    definedBy: "IEEE 802.3z",
    notes: "Also 220 m on older 160 MHz·km 62.5 µm fiber. OM3 and OM4 are not listed in the standard; 550 m is the figure it guarantees.",
    tags: ["short", "gigabit", "om1", "om2"],
  },
  {
    id: "1000base-lx",
    name: "1000BASE-LX",
    formFactors: ["SFP"],
    speedGbps: 1,
    media: "smf",
    wavelength: "1310 nm",
    reachM: 5000,
    reachText: "5 km SMF; 550 m MMF with a mode-conditioning patch cord",
    connector: "LC duplex",
    lanes: "1 x 1G (1.25 GBd, 8b/10b)",
    definedBy: "IEEE 802.3z",
    notes: "Most modules are sold as LX/LH and rated 10 km, the reach IEEE later named 1000BASE-LX10.",
    tags: ["long", "lh", "gigabit", "mcp"],
  },
  {
    id: "1000base-lx10",
    name: "1000BASE-LX10",
    formFactors: ["SFP"],
    speedGbps: 1,
    media: "smf",
    wavelength: "1310 nm",
    reachM: 10000,
    reachText: "10 km SMF",
    connector: "LC duplex",
    lanes: "1 x 1G (1.25 GBd, 8b/10b)",
    definedBy: "IEEE 802.3ah",
    notes: "The standardized 10 km version of LX, matching what LX/LH modules advertise.",
    tags: ["long", "lh", "gigabit"],
  },
  {
    id: "1000base-bx10",
    name: "1000BASE-BX10",
    formFactors: ["SFP"],
    speedGbps: 1,
    media: "smf",
    wavelength: "1310 nm up, 1490 nm down",
    reachM: 10000,
    reachText: "10 km on one SMF strand",
    connector: "LC simplex",
    lanes: "1 x 1G, one wavelength each way",
    definedBy: "IEEE 802.3ah",
    notes:
      "BiDi: one strand carries both directions on two wavelengths. Sold as a matched pair: BX10-U transmits 1310 nm, BX10-D transmits 1490 nm. Two of the same half will not link.",
    tags: ["bidi", "single strand", "simplex", "gigabit", "wdm"],
  },
  {
    id: "1000base-zx",
    name: "1000BASE-ZX",
    formFactors: ["SFP"],
    speedGbps: 1,
    media: "smf",
    wavelength: "1550 nm",
    reachM: 70000,
    reachText: "About 70 km (vendor rating, some 80 km)",
    connector: "LC duplex",
    lanes: "1 x 1G (1.25 GBd, 8b/10b)",
    definedBy: "Vendor convention, not IEEE",
    notes:
      "No IEEE definition, so power budget and reach vary by vendor. On a short link the receiver can overload; check receive power and add an attenuator if needed.",
    tags: ["extended", "long haul", "gigabit", "attenuator"],
  },

  /* ----------------------------------------------------------- 10G */
  {
    id: "10gbase-t",
    name: "10GBASE-T",
    formFactors: ["SFP+"],
    speedGbps: 10,
    media: "tp",
    wavelength: "Electrical",
    reachM: 30,
    reachText: "SFP+ modules usually 30 m; the standard allows 100 m on Cat6A and 55 m on Cat6",
    connector: "RJ45",
    lanes: "4 pairs, PAM-16 (DSQ128)",
    definedBy: "IEEE 802.3an",
    notes:
      "The SFP+ power and heat budget is what limits module reach. Check that the switch allows the module's power draw. Some also run at 1, 2.5 or 5 Gb/s.",
    tags: ["copper", "rj45", "cat6a", "cat6"],
  },
  {
    id: "10gbase-sr",
    name: "10GBASE-SR",
    formFactors: ["SFP+"],
    speedGbps: 10,
    media: "mmf",
    wavelength: "850 nm",
    reachM: 400,
    mmfReach: { OM1: 33, OM2: 82, OM3: 300, OM4: 400, OM5: 400 },
    reachText: "33 m OM1, 82 m OM2, 300 m OM3, 400 m OM4",
    connector: "LC duplex",
    lanes: "1 x 10G NRZ (10.3125 GBd, 64b/66b)",
    definedBy: "IEEE 802.3ae",
    notes: "The common data center 10G optic. Also 26 m on 160 MHz·km 62.5 µm fiber.",
    tags: ["short", "om3", "om4", "vcsel"],
  },
  {
    id: "10gbase-lr",
    name: "10GBASE-LR",
    formFactors: ["SFP+"],
    speedGbps: 10,
    media: "smf",
    wavelength: "1310 nm",
    reachM: 10000,
    reachText: "10 km",
    connector: "LC duplex",
    lanes: "1 x 10G NRZ (10.3125 GBd, 64b/66b)",
    definedBy: "IEEE 802.3ae",
    notes: "The default single-mode 10G optic between buildings and floors.",
    tags: ["long", "os2"],
  },
  {
    id: "10gbase-er",
    name: "10GBASE-ER",
    formFactors: ["SFP+"],
    speedGbps: 10,
    media: "smf",
    wavelength: "1550 nm",
    reachM: 40000,
    reachText: "30 km, or 40 km on an engineered link",
    connector: "LC duplex",
    lanes: "1 x 10G NRZ (10.3125 GBd, 64b/66b)",
    definedBy: "IEEE 802.3ae",
    notes: "On a short link check receive power against the module's maximum; an attenuator may be needed.",
    tags: ["extended", "attenuator"],
  },
  {
    id: "10gbase-zr",
    name: "10GBASE-ZR",
    formFactors: ["SFP+"],
    speedGbps: 10,
    media: "smf",
    wavelength: "1550 nm",
    reachM: 80000,
    reachText: "About 80 km (vendor rating)",
    connector: "LC duplex",
    lanes: "1 x 10G NRZ",
    definedBy: "Vendor convention, not IEEE",
    notes: "Not an IEEE PMD, so power budget varies by vendor. Needs attenuation on short links.",
    tags: ["extended", "long haul", "attenuator"],
  },
  {
    id: "10g-bidi",
    name: "10G BiDi (10GBASE-BR)",
    formFactors: ["SFP+"],
    speedGbps: 10,
    media: "smf",
    wavelength: "1270 nm and 1330 nm, one each way",
    reachM: 10000,
    reachText: "10 km on one SMF strand (20 and 40 km versions exist)",
    connector: "LC simplex",
    lanes: "1 x 10G, one wavelength each way",
    definedBy: "Vendor parts; IEEE 802.3cp later defined 10GBASE-BR",
    notes:
      "Sold in matched U and D halves that transmit on opposite wavelengths. Halves from different vendors may not interoperate.",
    tags: ["bidi", "single strand", "simplex", "bx", "wdm"],
  },
  {
    id: "10g-dac",
    name: "10G SFP+ DAC",
    formFactors: ["SFP+"],
    speedGbps: 10,
    media: "dac",
    wavelength: "Electrical",
    reachM: 7,
    reachText: "Passive typically up to 7 m; active versions reach farther",
    connector: "Fixed twinax cable",
    lanes: "1 x 10G",
    definedBy: "SFF-8431 (SFP+ direct attach)",
    notes: "Lower power and latency than 10GBASE-T inside a rack. Some switches accept only DACs coded for their vendor.",
    tags: ["twinax", "copper", "direct attach", "10gsfp+cu", "passive", "active"],
  },
  {
    id: "10g-aoc",
    name: "10G SFP+ AOC",
    formFactors: ["SFP+"],
    speedGbps: 10,
    media: "aoc",
    wavelength: "850 nm, inside the cable",
    reachM: 100,
    reachText: "Fixed length, sold up to about 100 m",
    connector: "Fixed fiber cable",
    lanes: "1 x 10G",
    definedBy: "Vendor assembly on the SFP+ interface",
    notes: AOC_NOTE,
    tags: ["active optical cable", "fixed length"],
  },

  /* ----------------------------------------------------------- 25G */
  {
    id: "25gbase-sr",
    name: "25GBASE-SR",
    formFactors: ["SFP28"],
    speedGbps: 25,
    media: "mmf",
    wavelength: "850 nm",
    reachM: 100,
    mmfReach: { OM3: 70, OM4: 100, OM5: 100 },
    reachText: "70 m OM3, 100 m OM4",
    connector: "LC duplex",
    lanes: "1 x 25G NRZ (25.78125 GBd)",
    definedBy: "IEEE 802.3by",
    notes:
      "Requires RS-FEC on both ends; a FEC mismatch is a common reason a 25G link stays down. Many SFP28 ports also accept 10G SFP+ optics.",
    tags: ["short", "om3", "om4", "fec", "rs-fec"],
  },
  {
    id: "25gbase-lr",
    name: "25GBASE-LR",
    formFactors: ["SFP28"],
    speedGbps: 25,
    media: "smf",
    wavelength: "1310 nm",
    reachM: 10000,
    reachText: "10 km",
    connector: "LC duplex",
    lanes: "1 x 25G NRZ (25.78125 GBd)",
    definedBy: "IEEE 802.3cc",
    notes: "Single-mode 25G for server and campus links.",
    tags: ["long", "os2"],
  },
  {
    id: "25gbase-cr",
    name: "25GBASE-CR",
    formFactors: ["SFP28"],
    speedGbps: 25,
    media: "dac",
    wavelength: "Electrical",
    reachM: 5,
    reachText: "Up to 5 m; 3 m for CA-25G-S and CA-25G-N cables",
    connector: "Fixed twinax cable",
    lanes: "1 x 25G",
    definedBy: "IEEE 802.3by",
    notes: "The cable class sets the FEC: CA-25G-L needs RS-FEC, CA-25G-S works with BASE-R FEC, CA-25G-N needs none.",
    tags: ["twinax", "copper", "direct attach", "fec", "ca-25g-l"],
  },

  /* ----------------------------------------------------------- 40G */
  {
    id: "40gbase-sr4",
    name: "40GBASE-SR4",
    formFactors: ["QSFP+"],
    speedGbps: 40,
    media: "mmf",
    wavelength: "850 nm",
    reachM: 150,
    mmfReach: { OM3: 100, OM4: 150, OM5: 150 },
    reachText: "100 m OM3, 150 m OM4",
    connector: "MPO-12 (8 fibers used)",
    lanes: "4 x 10G NRZ, parallel fibers",
    definedBy: "IEEE 802.3ba",
    notes:
      "Parallel optics: four transmit and four receive fibers. Breaks out to four 10GBASE-SR ports through an MPO to LC harness where the switch supports it.",
    tags: ["parallel", "breakout", "mpo", "mtp", "om3", "om4"],
  },
  {
    id: "40gbase-lr4",
    name: "40GBASE-LR4",
    formFactors: ["QSFP+"],
    speedGbps: 40,
    media: "smf",
    wavelength: "1271, 1291, 1311, 1331 nm (CWDM)",
    reachM: 10000,
    reachText: "10 km",
    connector: "LC duplex",
    lanes: "4 x 10G NRZ on 4 wavelengths",
    definedBy: "IEEE 802.3ba",
    notes: "Four wavelengths share one fiber pair, so it cannot break out into separate 10G links.",
    tags: ["cwdm", "wdm", "long"],
  },
  {
    id: "40g-sr-bidi",
    name: "40G SR BiDi",
    formFactors: ["QSFP+"],
    speedGbps: 40,
    media: "mmf",
    wavelength: "About 850 and 900 nm on each fiber",
    reachM: 150,
    mmfReach: { OM3: 100, OM4: 150, OM5: 150 },
    reachText: "100 m OM3, 150 m OM4",
    connector: "LC duplex",
    lanes: "2 x 20G each way",
    definedBy: "Vendor (not IEEE)",
    notes: "Runs 40G over an existing duplex LC multimode pair instead of MPO trunks. Both ends must be the same BiDi type.",
    tags: ["bidi", "duplex", "wdm", "sr-bd"],
  },
  {
    id: "40gbase-cr4",
    name: "40GBASE-CR4",
    formFactors: ["QSFP+"],
    speedGbps: 40,
    media: "dac",
    wavelength: "Electrical",
    reachM: 7,
    reachText: "Up to 7 m",
    connector: "Fixed twinax cable",
    lanes: "4 x 10G",
    definedBy: "IEEE 802.3ba",
    notes: "Breakout versions split one QSFP+ into four SFP+ ends.",
    tags: ["twinax", "copper", "direct attach", "breakout"],
  },

  /* ---------------------------------------------------------- 100G */
  {
    id: "100gbase-sr4",
    name: "100GBASE-SR4",
    formFactors: ["QSFP28"],
    speedGbps: 100,
    media: "mmf",
    wavelength: "850 nm",
    reachM: 100,
    mmfReach: { OM3: 70, OM4: 100, OM5: 100 },
    reachText: "70 m OM3, 100 m OM4",
    connector: "MPO-12 (8 fibers used)",
    lanes: "4 x 25G NRZ, parallel fibers",
    definedBy: "IEEE 802.3bm",
    notes: "Requires RS-FEC. Breaks out to four 25GBASE-SR links where the switch supports it.",
    tags: ["parallel", "breakout", "mpo", "mtp", "om3", "om4", "fec", "rs-fec"],
  },
  {
    id: "100gbase-lr4",
    name: "100GBASE-LR4",
    formFactors: ["QSFP28"],
    speedGbps: 100,
    media: "smf",
    wavelength: "1295.56, 1300.05, 1304.58, 1309.14 nm (LAN-WDM)",
    reachM: 10000,
    reachText: "10 km",
    connector: "LC duplex",
    lanes: "4 x 25G NRZ on 4 wavelengths",
    definedBy: "IEEE 802.3ba",
    notes:
      "No FEC required. LAN-WDM spacing of about 4.5 nm needs temperature-controlled lasers, which is part of why the cheaper 20 nm CWDM4 grid exists.",
    tags: ["lan-wdm", "wdm", "long"],
  },
  {
    id: "100g-cwdm4",
    name: "100G CWDM4",
    formFactors: ["QSFP28"],
    speedGbps: 100,
    media: "smf",
    wavelength: "1271, 1291, 1311, 1331 nm (CWDM)",
    reachM: 2000,
    reachText: "2 km",
    connector: "LC duplex",
    lanes: "4 x 25G NRZ on 4 wavelengths",
    definedBy: "100G CWDM4 MSA",
    notes: "Requires RS-FEC. Does not interoperate with 100GBASE-LR4 although both use a duplex LC single-mode pair.",
    tags: ["cwdm", "wdm", "msa", "fec", "rs-fec"],
  },
  {
    id: "100gbase-dr",
    name: "100GBASE-DR",
    formFactors: ["QSFP28"],
    speedGbps: 100,
    media: "smf",
    wavelength: "1311 nm",
    reachM: 500,
    reachText: "500 m",
    connector: "LC duplex",
    lanes: "1 x 100G PAM4 (53.125 GBd)",
    definedBy: "IEEE 802.3cd",
    notes: "One 100G wavelength. Four of these are what a 400GBASE-DR4 breaks out into.",
    tags: ["single lambda", "pam4", "breakout", "fec"],
  },
  {
    id: "100gbase-fr1",
    name: "100GBASE-FR1",
    formFactors: ["QSFP28"],
    speedGbps: 100,
    media: "smf",
    wavelength: "1311 nm",
    reachM: 2000,
    reachText: "2 km",
    connector: "LC duplex",
    lanes: "1 x 100G PAM4 (53.125 GBd)",
    definedBy: "IEEE 802.3cu",
    notes: "The single-wavelength design of DR at 2 km, called 100G-FR in the 100G Lambda MSA.",
    tags: ["single lambda", "pam4", "lambda msa", "fec"],
  },
  {
    id: "100gbase-lr1",
    name: "100GBASE-LR1",
    formFactors: ["QSFP28"],
    speedGbps: 100,
    media: "smf",
    wavelength: "1311 nm",
    reachM: 10000,
    reachText: "10 km",
    connector: "LC duplex",
    lanes: "1 x 100G PAM4 (53.125 GBd)",
    definedBy: "IEEE 802.3cu",
    notes: "A single-wavelength alternative to LR4 at the same 10 km.",
    tags: ["single lambda", "pam4", "lambda msa", "fec", "long"],
  },
  {
    id: "100gbase-cr4",
    name: "100GBASE-CR4",
    formFactors: ["QSFP28"],
    speedGbps: 100,
    media: "dac",
    wavelength: "Electrical",
    reachM: 5,
    reachText: "Up to 5 m",
    connector: "Fixed twinax cable",
    lanes: "4 x 25G",
    definedBy: "IEEE 802.3bj",
    notes: "Requires RS-FEC. Breakout versions split one QSFP28 into four SFP28 ends.",
    tags: ["twinax", "copper", "direct attach", "breakout", "fec", "rs-fec"],
  },
  {
    id: "100g-aoc",
    name: "100G QSFP28 AOC",
    formFactors: ["QSFP28"],
    speedGbps: 100,
    media: "aoc",
    wavelength: "850 nm, inside the cable",
    reachM: 100,
    reachText: "Fixed length, sold up to about 100 m",
    connector: "Fixed fiber cable",
    lanes: "4 x 25G",
    definedBy: "Vendor assembly on the QSFP28 interface",
    notes: AOC_NOTE,
    tags: ["active optical cable", "fixed length"],
  },

  /* ---------------------------------------------------------- 200G */
  {
    id: "200gbase-sr4",
    name: "200GBASE-SR4",
    formFactors: ["QSFP56"],
    speedGbps: 200,
    media: "mmf",
    wavelength: "850 nm",
    reachM: 100,
    mmfReach: { OM3: 70, OM4: 100, OM5: 100 },
    reachText: "70 m OM3, 100 m OM4",
    connector: "MPO-12 (8 fibers used)",
    lanes: "4 x 50G PAM4, parallel fibers",
    definedBy: "IEEE 802.3cd",
    notes: "The fiber plant and reach of 100GBASE-SR4 at twice the lane rate.",
    tags: ["parallel", "pam4", "mpo", "mtp", "om3", "om4", "fec"],
  },
  {
    id: "200gbase-dr4",
    name: "200GBASE-DR4",
    formFactors: ["QSFP56"],
    speedGbps: 200,
    media: "smf",
    wavelength: "1311 nm",
    reachM: 500,
    reachText: "500 m",
    connector: "MPO-12 APC (8 fibers used)",
    lanes: "4 x 50G PAM4, parallel fibers",
    definedBy: "IEEE 802.3bs",
    notes: "Parallel single-mode with an angled (APC) MPO.",
    tags: ["parallel", "pam4", "mpo", "apc", "fec"],
  },
  {
    id: "200gbase-fr4",
    name: "200GBASE-FR4",
    formFactors: ["QSFP56"],
    speedGbps: 200,
    media: "smf",
    wavelength: "1271, 1291, 1311, 1331 nm (CWDM)",
    reachM: 2000,
    reachText: "2 km",
    connector: "LC duplex",
    lanes: "4 x 50G PAM4 on 4 wavelengths",
    definedBy: "IEEE 802.3bs",
    notes: "Four wavelengths on one duplex pair.",
    tags: ["cwdm", "wdm", "pam4", "fec"],
  },
  {
    id: "200gbase-cr4",
    name: "200GBASE-CR4",
    formFactors: ["QSFP56"],
    speedGbps: 200,
    media: "dac",
    wavelength: "Electrical",
    reachM: 3,
    reachText: "Up to 3 m",
    connector: "Fixed twinax cable",
    lanes: "4 x 50G PAM4",
    definedBy: "IEEE 802.3cd",
    notes: "Reach shrinks as the lane rate rises: 7 m at 10G per lane, 5 m at 25G, 3 m at 50G.",
    tags: ["twinax", "copper", "direct attach", "pam4"],
  },

  /* ---------------------------------------------------------- 400G */
  {
    id: "400gbase-sr8",
    name: "400GBASE-SR8",
    formFactors: ["QSFP-DD", "OSFP"],
    speedGbps: 400,
    media: "mmf",
    wavelength: "850 nm",
    reachM: 100,
    mmfReach: { OM3: 70, OM4: 100, OM5: 100 },
    reachText: "70 m OM3, 100 m OM4 and OM5",
    connector: "MPO-16 (16 fibers used)",
    lanes: "8 x 50G PAM4, parallel fibers",
    definedBy: "IEEE 802.3cm",
    notes: "Can break out to eight 50GBASE-SR links. MPO-16 is keyed differently from MPO-12, so trunks and cassettes must match.",
    tags: ["parallel", "pam4", "mpo", "mtp", "breakout", "om4", "fec"],
  },
  {
    id: "400gbase-sr4.2",
    name: "400GBASE-SR4.2",
    formFactors: ["QSFP-DD", "OSFP"],
    speedGbps: 400,
    media: "mmf",
    wavelength: "850 and 910 nm, opposite directions",
    reachM: 150,
    mmfReach: { OM3: 70, OM4: 100, OM5: 150 },
    reachText: "70 m OM3, 100 m OM4, 150 m OM5",
    connector: "MPO-12 (8 fibers used)",
    lanes: "8 x 50G PAM4 over 4 fiber pairs",
    definedBy: "IEEE 802.3cm",
    notes:
      "Multimode BiDi: each of the 8 fibers carries two lanes in opposite directions on different wavelengths. The longer OM5 reach comes from OM5's extra bandwidth near 910 nm.",
    tags: ["bidi", "parallel", "pam4", "mpo", "om5", "swdm", "fec"],
  },
  {
    id: "400gbase-dr4",
    name: "400GBASE-DR4",
    formFactors: ["QSFP-DD", "OSFP"],
    speedGbps: 400,
    media: "smf",
    wavelength: "1311 nm",
    reachM: 500,
    reachText: "500 m",
    connector: "MPO-12 APC (8 fibers used)",
    lanes: "4 x 100G PAM4, parallel fibers",
    definedBy: "IEEE 802.3bs",
    notes:
      "Breaks out to four 100GBASE-DR ports. The angled (APC) MPO, usually green, does not mate correctly with a flat (UPC) MPO.",
    tags: ["parallel", "pam4", "mpo", "apc", "breakout", "fec"],
  },
  {
    id: "400gbase-fr4",
    name: "400GBASE-FR4",
    formFactors: ["QSFP-DD", "OSFP"],
    speedGbps: 400,
    media: "smf",
    wavelength: "1271, 1291, 1311, 1331 nm (CWDM)",
    reachM: 2000,
    reachText: "2 km",
    connector: "LC duplex",
    lanes: "4 x 100G PAM4 on 4 wavelengths",
    definedBy: "IEEE 802.3cu",
    notes: "Four 100G wavelengths on one duplex pair, so no breakout. Began as the 100G Lambda MSA's 400G-FR4.",
    tags: ["cwdm", "wdm", "pam4", "lambda msa", "fec"],
  },
  {
    id: "400gbase-lr8",
    name: "400GBASE-LR8",
    formFactors: ["QSFP-DD", "OSFP"],
    speedGbps: 400,
    media: "smf",
    wavelength: "8 LAN-WDM wavelengths, 1273.54 to 1309.14 nm",
    reachM: 10000,
    reachText: "10 km",
    connector: "LC duplex",
    lanes: "8 x 50G PAM4 on 8 wavelengths",
    definedBy: "IEEE 802.3bs",
    notes: "The 100G Lambda MSA's 400G-LR4-10 reaches the same 10 km with four 100G wavelengths instead.",
    tags: ["lan-wdm", "wdm", "pam4", "long", "fec"],
  },
];

/* ---------------------------------------------------------- form factors */

export interface FormFactorInfo {
  name: FormFactor;
  lanes: string;
  speeds: string;
  spec: string;
  accepts: string;
}

export const FORM_FACTORS: FormFactorInfo[] = [
  { name: "SFP", lanes: "1 lane", speeds: "1G", spec: "SFP MSA (INF-8074i)", accepts: "None" },
  { name: "SFP+", lanes: "1 x 10G", speeds: "10G", spec: "SFF-8431", accepts: "SFP at 1G in most ports" },
  { name: "SFP28", lanes: "1 x 25G", speeds: "25G", spec: "SFF-8402", accepts: "SFP+ at 10G in most ports" },
  { name: "QSFP+", lanes: "4 x 10G", speeds: "40G", spec: "SFF-8436", accepts: "None" },
  { name: "QSFP28", lanes: "4 x 25G", speeds: "100G", spec: "SFF-8665", accepts: "QSFP+ at 40G in most ports" },
  { name: "QSFP56", lanes: "4 x 50G PAM4", speeds: "200G", spec: "QSFP family", accepts: "QSFP28 and QSFP+ in most ports" },
  {
    name: "QSFP-DD",
    lanes: "8 x 50G or 8 x 100G",
    speeds: "400G, 800G",
    spec: "QSFP-DD MSA",
    accepts: "QSFP+, QSFP28 and QSFP56 modules",
  },
  { name: "OSFP", lanes: "8 x 50G or 8 x 100G", speeds: "400G, 800G", spec: "OSFP MSA", accepts: "No QSFP modules without an adapter" },
];

/* ------------------------------------------------------------ fiber types */

export interface FiberType {
  name: string;
  core: string;
  bandwidth: string;
  jacket: string;
}

export const FIBER_TYPES: FiberType[] = [
  { name: "OM1", core: "62.5/125 µm", bandwidth: "200 MHz·km at 850 nm", jacket: "Orange" },
  { name: "OM2", core: "50/125 µm", bandwidth: "500 MHz·km at 850 nm", jacket: "Orange" },
  { name: "OM3", core: "50/125 µm, laser optimized", bandwidth: "2000 MHz·km (EMB) at 850 nm", jacket: "Aqua" },
  { name: "OM4", core: "50/125 µm, laser optimized", bandwidth: "4700 MHz·km (EMB) at 850 nm", jacket: "Aqua, or violet in parts of Europe" },
  { name: "OM5", core: "50/125 µm, wideband", bandwidth: "4700 at 850 nm, 2470 MHz·km at 953 nm", jacket: "Lime green" },
  { name: "OS2", core: "9/125 µm single-mode", bandwidth: "Not modal; 0.4 dB/km cabled", jacket: "Yellow" },
];

/* ------------------------------------------------------------- lengths */

export const MAX_LENGTH_M = 1_000_000;
export const MAX_INPUT_CHARS = 40;

export type LengthResult = { ok: true; meters: number } | { ok: false; message: string };

/**
 * Parse a link length: "300", "300 m", "2 km", "2.5km", "1,000 m", "500 ft".
 * A bare number is meters. Returns null for blank input.
 */
export function parseLength(raw: string): LengthResult | null {
  const input = raw.trim();
  if (input === "") return null;
  if (input.length > MAX_INPUT_CHARS) {
    return { ok: false, message: `That is longer than ${MAX_INPUT_CHARS} characters. Enter a length such as 300 m or 2 km.` };
  }
  const m = /^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|\.\d+)\s*(m|meters?|metres?|km|kilometers?|kilometres?|ft|feet|foot|')?$/i.exec(input);
  if (!m) {
    if (/^-/.test(input)) return { ok: false, message: "A length cannot be negative." };
    return { ok: false, message: "Enter a length such as 300 m, 2 km or 150 ft." };
  }
  const value = Number(m[1].replace(/,/g, ""));
  const unit = (m[2] ?? "m").toLowerCase();
  let meters = value;
  if (unit.startsWith("k")) meters = value * 1000;
  else if (unit === "ft" || unit === "feet" || unit === "foot" || unit === "'") meters = value * 0.3048;
  if (!Number.isFinite(meters)) return { ok: false, message: "Enter a length such as 300 m, 2 km or 150 ft." };
  if (meters <= 0) return { ok: false, message: "Enter a length greater than zero." };
  if (meters > MAX_LENGTH_M) return { ok: false, message: "Enter 1000 km or less." };
  return { ok: true, meters };
}

/** "550 m", "10 km", "2.5 km", "7 m", "0.3 m". */
export function formatMeters(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : Number(km.toFixed(km < 10 ? 2 : 1))} km`;
  }
  if (meters >= 10) return `${Math.round(meters)} m`;
  return `${Number(meters.toFixed(1))} m`;
}

/**
 * Reach of a module on the chosen multimode grade. Non-multimode rows ignore
 * the grade. Null means the standard gives no figure for that grade.
 */
export function reachFor(module: Module, grade: Grade): number | null {
  if (module.media !== "mmf") return module.reachM;
  const r = module.mmfReach?.[grade];
  return typeof r === "number" ? r : null;
}

/* ------------------------------------------------------------- filtering */

export type SortKey = "speed" | "reach";

export interface Filter {
  query: string;
  /** Gb/s, or null for any. */
  speed: number | null;
  media: Media | null;
  formFactor: FormFactor | null;
  /** Required link length in meters, or null for none. */
  lengthM: number | null;
  grade: Grade;
  sort: SortKey;
}

export interface FilterOutcome {
  rows: Module[];
  /** Rows that matched every filter except length. */
  matchedBeforeLength: number;
  /** Rows dropped only because they fall short of the length. */
  tooShort: number;
}

function haystack(m: Module): string {
  return [
    m.name,
    m.formFactors.join(" "),
    `${m.speedGbps}g`,
    `${m.speedGbps} gb/s`,
    MEDIA_LABEL[m.media],
    MEDIA_SHORT[m.media],
    m.wavelength,
    m.reachText,
    m.connector,
    m.lanes,
    m.definedBy,
    m.notes,
    m.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

const HAYSTACKS = new Map<string, string>(MODULES.map((m) => [m.id, haystack(m)]));

/** Every whitespace-separated term must appear somewhere in the row. */
export function matchesQuery(m: Module, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
  if (terms.length === 0) return true;
  const hay = HAYSTACKS.get(m.id) ?? haystack(m);
  return terms.every((t) => hay.includes(t));
}

export function filterModules(modules: Module[], f: Filter): FilterOutcome {
  const base = modules.filter(
    (m) =>
      (f.speed === null || m.speedGbps === f.speed) &&
      (f.media === null || m.media === f.media) &&
      (f.formFactor === null || m.formFactors.includes(f.formFactor)) &&
      matchesQuery(m, f.query.slice(0, 200)),
  );
  const rows =
    f.lengthM === null
      ? base
      : base.filter((m) => {
          const r = reachFor(m, f.grade);
          return r !== null && r >= f.lengthM!;
        });
  const order = new Map(modules.map((m, i) => [m.id, i]));
  const sorted = [...rows].sort((a, b) => {
    if (f.sort === "reach") {
      const ra = reachFor(a, f.grade) ?? -1;
      const rb = reachFor(b, f.grade) ?? -1;
      if (ra !== rb) return rb - ra;
    } else if (a.speedGbps !== b.speedGbps) {
      return a.speedGbps - b.speedGbps;
    }
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
  return { rows: sorted, matchedBeforeLength: base.length, tooShort: base.length - rows.length };
}

export function speedLabel(gbps: number): string {
  return `${gbps}G`;
}
