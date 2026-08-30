import { chromium } from 'playwright';
const [file, out, view, zoom, panX, up, yaw] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const url = `http://127.0.0.1:4310/view.html?f=${encodeURIComponent(file)}`
  + `&view=${view || 'face'}&zoom=${zoom || 1}&x=${panX || 0}&up=${up || 'z'}&yaw=${yaw || 0}`;
await p.goto(url, { waitUntil: 'load', timeout: 60000 });
try { await p.waitForFunction(() => document.title === 'ready', { timeout: 45000 }); }
catch { console.log('MODEL DID NOT LOAD'); }
await p.waitForTimeout(600);
await p.locator('canvas').screenshot({ path: out });
console.log(errs.slice(0, 4).join(' | ') || 'clean');
await b.close();
