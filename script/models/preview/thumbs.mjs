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
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [outDir, ...slugs] = process.argv.slice(2);
/*
  Which model directory, and which up axis.

  Vendor exports are Y up and live under glb/ub; our own generators emit Z
  up and live under glb/own. The path is relative to the preview server's
  root, which is this directory, and it used to be written without the glb
  prefix because whoever ran it last was running it from a scratch folder
  with a symlink in it. That worked exactly once. Off a clean checkout every
  model 404s and the page simply never signals ready, so the whole job times
  out one slug at a time with nothing saying why.
*/
const DIR = process.env.THUMBDIR || "glb/ub";
const UP = process.env.THUMBUP || "y";
/*
  Cut the background out rather than shoot against one. Ubiquiti's hardware
  is mostly white, so on the studio's near white ground thirty eight models
  photographed as a blank card. A transparent PNG composites onto whatever
  the card behind it is, which on this site is dark, and the white products
  finally read.
*/
const ALPHA = process.env.THUMBALPHA === "1";
mkdirSync(outDir, { recursive: true });

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const p = await b.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });

for (const slug of slugs) {
  const url =
    `http://127.0.0.1:4310/view.html?f=${encodeURIComponent(`${DIR}/${slug}.glb`)}` +
    `&view=angle&zoom=0.94&x=0&up=${UP}&yaw=0${ALPHA ? "&alpha=1" : ""}`;
  try {
    await p.goto(url, { waitUntil: "load", timeout: 45000 });
    await p.waitForFunction(() => document.title === "ready", { timeout: 40000 });
    await p.waitForTimeout(250);
    /*
      Read the PNG out of the canvas rather than screenshotting the element.

      A transparent WebGL canvas screenshots as an empty image: the frame is
      composited and gone before the capture, and what comes back is not a
      bad picture but no picture at all, with nothing raised. Asking the
      canvas for its own data works because the drawing buffer is preserved
      in this mode, and it is the same pixels either way.
    */
    if (ALPHA) {
      const data = await p.evaluate(() =>
        document.querySelector("canvas").toDataURL("image/png").split(",")[1],
      );
      writeFileSync(path.join(outDir, `${slug}.png`), Buffer.from(data, "base64"));
    } else {
      await p.locator("canvas").screenshot({ path: path.join(outDir, `${slug}.png`) });
    }
    console.log(`ok   ${slug}`);
  } catch (e) {
    console.log(`FAIL ${slug}: ${String(e).slice(0, 90)}`);
  }
}
await b.close();
