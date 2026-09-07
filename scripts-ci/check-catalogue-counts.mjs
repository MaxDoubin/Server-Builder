/**
 * Numbers written into page prose must match the data the page serves.
 *
 * The rack builder's palette is two catalogues merged and filtered to the
 * hardware that mounts in a frame. Both pages that advertise it wrote the
 * size of that palette into a sentence, and both said "fifty one rack
 * mountable UniFi devices" for as long as the palette was fifty one
 * Ubiquiti devices. Then twenty four devices from five other vendors were
 * added to it, nobody re-read the sentence, and the site spent a while
 * telling visitors it offered a third less hardware than it had, from one
 * vendor instead of six.
 *
 * The racks gallery's own header comment already promised this could not
 * happen: "the counts on their cards are read from the same data the pages
 * render, so a device added to the wired rack or a part added to the
 * teardown shows up here without anybody remembering to update a number".
 * That was true of every card except the builder's, which is the one that
 * drifted.
 *
 * Deriving these two at runtime would mean the gallery fetching two
 * catalogues to print one number, and the builder's own paragraph changing
 * shape under the reader while the fetch lands. So the numbers stay
 * written out, where they read properly, and this fails the build if they
 * stop being true.
 */
import { readFileSync } from "fs";
import path from "path";

const problems = [];
const fail = (m) => problems.push(m);

const read = (p) => JSON.parse(readFileSync(path.resolve(p), "utf8"));
const ubiquiti = read("dist/public/data/ubiquiti-catalogue.json");
const own = read("dist/public/data/own-catalogue.json");

/*
  The same filter the builder applies: `mount === "rack"` over both
  catalogues merged. Anything else in them is a desk or a ceiling device and
  the palette never shows it.
*/
const mountable = [...ubiquiti.devices, ...own.devices].filter((d) => d.mount === "rack");
const vendors = new Set(mountable.map((d) => d.vendor ?? "Ubiquiti"));
const ubiquitiOwnGeometry = ubiquiti.devices.filter((d) => d.mount === "rack").length;

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Spell a number the way the prose on these pages spells one. */
function spell(n) {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t} ${ONES[n % 10]}` : t;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Every claim, with the file it is written in and the text it must contain. */
const claims = [
  {
    file: "client/src/pages/cinematic/CinematicRackBuilder.tsx",
    what: "the size of the palette",
    text: `${cap(spell(mountable.length))} rack mountable devices from ${spell(vendors.size)} vendors`,
  },
  {
    file: "client/src/pages/cinematic/CinematicRackBuilder.tsx",
    what: "how many of the palette are vendor exports",
    text: `${cap(spell(ubiquitiOwnGeometry))}\n              are Ubiquiti's own published geometry`,
  },
  {
    file: "client/src/pages/cinematic/CinematicRacks.tsx",
    what: "the size of the palette",
    text: `${cap(spell(mountable.length))} rack mountable devices from ${spell(vendors.size)} vendors`,
  },
  {
    file: "client/src/pages/cinematic/CinematicRacks.tsx",
    what: "the builder card's device count",
    text: `"${mountable.length} devices"`,
  },
  /*
    The prerenderer says it too, and it was missed the first time round.
    /racks/build is mostly a WebGL canvas, so the prose a crawler is given is
    hand written here rather than rendered from the component, and it still
    claimed fifty one UniFi devices long after the palette became seventy
    five across six vendors. The meta description is the copy a search result
    shows, so that number was the site's public claim about itself.
  */
  {
    file: "script/prerender.ts",
    what: "the rack builder's meta description",
    text: `${mountable.length} real rack mountable devices across ${spell(vendors.size)} vendors`,
  },
  {
    file: "script/prerender.ts",
    what: "the prose the crawler gets for the rack builder",
    text: `${cap(spell(mountable.length))} rack mountable devices from ${spell(vendors.size)} vendors`,
  },
  {
    file: "script/prerender.ts",
    what: "how many of the prerendered palette are vendor exports",
    text: `${spell(ubiquitiOwnGeometry)} of them in\n  Ubiquiti's own published geometry`,
  },
];

for (const claim of claims) {
  const src = readFileSync(path.resolve(claim.file), "utf8");
  if (!src.includes(claim.text)) {
    fail(
      `${path.basename(claim.file)}: ${claim.what} does not match the catalogue.` +
        ` Expected to find ${JSON.stringify(claim.text.replace(/\n\s+/g, " "))}.`,
    );
  }
}

if (problems.length) {
  console.error("\nPage prose disagrees with the published catalogue:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\nThe palette is currently ${mountable.length} rack mountable devices from` +
      ` ${vendors.size} vendors (${[...vendors].sort().join(", ")}),` +
      ` of which ${ubiquitiOwnGeometry} are Ubiquiti's own exports.` +
      `\nUpdate the sentences to say so.\n`,
  );
  process.exit(1);
}
console.log(
  `OK  the builder palette is ${mountable.length} devices from ${vendors.size} vendors,` +
    ` and the ${new Set(claims.map((c) => c.file)).size} files that advertise it agree.`,
);
