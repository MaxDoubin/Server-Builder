/**
 * Palette thumbnails for the rack builder, rendered from the models.
 *
 * A builder whose palette is a list of names is a list of names. These are
 * the actual devices, so the thing you pick is the thing you get, and a
 * render can never disagree with the model the way a marketing photograph
 * can: it is the same file the page will load.
 *
 * Rendered through the same preview viewer the modelling loop uses, so the
 * framing rules that took several attempts to get right (clearing the
 * footprint diagonal, in particular) are not reimplemented here.
 *
 * Usage: node script/models/preview/thumbs.mjs <outDir> <slug...>
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [outDir, ...slugs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });

for (const slug of slugs) {
  const url =
    `http://127.0.0.1:4310/view.html?f=${encodeURIComponent(`ub/${slug}.glb`)}` +
    `&view=angle&zoom=0.94&x=0&up=y&yaw=0`;
  try {
    await p.goto(url, { waitUntil: "load", timeout: 45000 });
    await p.waitForFunction(() => document.title === "ready", { timeout: 40000 });
    await p.waitForTimeout(250);
    await p.locator("canvas").screenshot({ path: path.join(outDir, `${slug}.png`) });
    console.log(`ok   ${slug}`);
  } catch (e) {
    console.log(`FAIL ${slug}: ${String(e).slice(0, 90)}`);
  }
}
await b.close();
