/**
 * Guard against reveal thresholds that can never be met.
 *
 * IntersectionObserver's threshold, which framer-motion exposes as `amount`,
 * is a fraction OF THE OBSERVED ELEMENT. An element taller than the viewport
 * can therefore never exceed `viewportHeight / elementHeight`, and any
 * threshold above that ceiling means the observer never fires. Whatever the
 * observer was gating keeps its hidden variant: invisible content that still
 * occupies its full scroll height, so the page looks empty but scrolls
 * forever.
 *
 * That shipped. The blog index wrapped all 24 post cards in one StaggerGroup
 * at `amount: 0.15`. On a 390x844 phone the container is 11,940px tall, so
 * the ratio topped out at 0.07 and the entire archive rendered at opacity 0.
 * Desktop escaped only because shorter cards put its ceiling at 0.168.
 *
 * `useClampedInView` in framer-animations.tsx measures the element and clamps
 * the threshold to what is reachable. This gate keeps new code from going
 * around it.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve("client/src");
// The one place a raw useInView is correct: inside the clamping hook itself.
const ALLOWED = new Set([path.join(ROOT, "lib", "framer-animations.tsx")]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const failures = [];

for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("useInView")) continue;

  const lines = src.split("\n");
  lines.forEach((line, i) => {
    // A framer-motion useInView call that pins a fixed `amount`.
    const m = line.match(/useInView\s*\([^)]*amount\s*:\s*([\d.]+)/);
    if (!m) return;
    if (ALLOWED.has(file)) return;
    failures.push(
      `${path.relative(process.cwd(), file)}:${i + 1}  useInView({ amount: ${m[1]} })\n` +
        `    An element taller than the viewport can never reach this threshold.\n` +
        `    Use useClampedInView(ref, ${m[1]}, once) from @/lib/framer-animations.`,
    );
  });

  // The standalone hook takes a bare threshold; it clamps internally, so a
  // direct IntersectionObserver is what to catch here.
  lines.forEach((line, i) => {
    if (!/new IntersectionObserver/.test(line)) return;
    if (file.endsWith(path.join("lib", "useInView.ts"))) return;
    const window = lines.slice(i, i + 12).join("\n");
    const t = window.match(/threshold\s*:\s*([\d.]+)/);
    if (!t || Number(t[1]) === 0) return;
    failures.push(
      `${path.relative(process.cwd(), file)}:${i + 1}  IntersectionObserver({ threshold: ${t[1]} })\n` +
        `    Same trap: threshold is a fraction of the element, not the viewport.\n` +
        `    Use useInView from @/lib/useInView, which clamps to a reachable value.`,
    );
  });
}

if (failures.length) {
  console.error("Unreachable reveal thresholds:\n");
  for (const f of failures) console.error(f + "\n");
  console.error(
    `${failures.length} call site(s) can leave content permanently invisible.`,
  );
  process.exit(1);
}

console.log("reveal thresholds: all in-view gating goes through a clamped hook");
