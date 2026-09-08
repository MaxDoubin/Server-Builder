/**
 * Configurations worth starting from, with what is actually wrong with each.
 *
 * Every one of these is a build somebody has posted asking for opinions, and
 * the honest answer to most of them is not "wrong" but "here is what you have
 * bought and here is what you have not".
 */

import type { Array as DiskArray } from "../types";

export interface Config {
  id: string;
  label: string;
  array: DiskArray;
  notes: string[];
}

export const CONFIGS: Config[] = [
  {
    id: "four-bay-nas",
    label: "A four bay NAS, RAID 5, 4TB disks",
    array: { level: "raid5", disks: 4, diskTb: 4, rebuildMbs: 100, ureExponent: 14 },
    notes: [
      "The configuration most home NAS boxes ship with, and at this size it is fine. Three disks read during a rebuild, thirty three hours of exposure, and a URE probability the spec sheet puts at about 60 per cent and observed rates put nearer half a per cent.",
      "The important number here is not the URE risk, it is that a rebuild takes a day and a half. During that day and a half you have no redundancy at all.",
    ],
  },
  {
    id: "the-argument",
    label: "Eight 16TB disks in RAID 5",
    array: { level: "raid5", disks: 8, diskTb: 16, rebuildMbs: 80, ureExponent: 14 },
    notes: [
      "This is the configuration the phrase RAID 5 is dead was invented for, and the arithmetic does support the headline: sixteen days of rebuild, 112TB read, and a spec-sheet URE probability that rounds to certainty.",
      "It also overstates the case. The spec figure is a warranty bound, not a measurement, and with observed rates the same rebuild is under ten per cent. And on Linux md or ZFS a URE during rebuild costs a stripe rather than the array.",
      "The real objection is the sixteen days. Two and a bit weeks with no redundancy, at full read load, on disks that are the same age and from the same batch as the one that just died.",
    ],
  },
  {
    id: "the-answer",
    label: "The same eight disks in RAID 6",
    array: { level: "raid6", disks: 8, diskTb: 16, rebuildMbs: 80, ureExponent: 14 },
    notes: [
      "One disk of capacity buys a second parity, and that changes the failure mode rather than the odds. The rebuild still reads 112TB and still takes sixteen days, and a URE during it is now corrected from the second parity instead of losing a stripe.",
      "That is the whole argument for double parity at this size, and it is a better argument than the URE probability, because it holds however optimistic you are about the spec sheet.",
    ],
  },
  {
    id: "mirrors",
    label: "The same eight disks as striped mirrors",
    array: { level: "raid10", disks: 8, diskTb: 16, rebuildMbs: 80, ureExponent: 14 },
    notes: [
      "Half the capacity, and a rebuild that reads one disk instead of seven: two and a bit days rather than sixteen, with a fraction of the exposure.",
      "The guaranteed tolerance is still one. It survives up to four failures if they land in different mirrors and dies on the second if it lands on the partner of the first, and the guarantee is what you plan around.",
      "Rebuild speed is the reason this layout persists for anything with a write load on it. Resilvering one mirror leaves the rest of the array almost alone.",
    ],
  },
  {
    id: "wide-raidz2",
    label: "Twelve 20TB disks, RAIDZ2, on enterprise disks",
    array: { level: "raidz2", disks: 12, diskTb: 20, rebuildMbs: 120, ureExponent: 15 },
    notes: [
      "200TB usable at 83 per cent efficiency, which is the case for a wide parity array. The rebuild is three weeks.",
      "ZFS resilvers only the blocks that are in use, so a half-full pool resilvers in roughly half the time. That is a real advantage over a block-level rebuild, which reads every sector whether anything was written to it or not.",
      "The disks are rated one in 10^15 rather than 10^14, which is the difference between an enterprise and a consumer specification and which moves this calculation by a factor of ten.",
    ],
  },
  {
    id: "stripe-of-nothing",
    label: "Six disks in RAID 0",
    array: { level: "raid0", disks: 6, diskTb: 8, rebuildMbs: 200, ureExponent: 14 },
    notes: [
      "Every disk of capacity, no redundancy, and six times the chance of a failure that loses everything compared with one disk.",
      "There are real uses for this: scratch space, a rendering cache, anything that is reproducible from somewhere else. It is only a mistake when it is holding the only copy of something.",
    ],
  },
];
