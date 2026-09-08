## Sixty-five files that nothing imported

There were 343 TypeScript files under `client/src` on this site. Sixty-five of
them could not run. Not "were rarely used", not "were behind a feature flag":
there was no path from the entry point to any of them, so the bundler never
saw them and no browser could ever have loaded one.

They were not junk either. Among them: eighteen shadcn/ui primitives that came
with the project template, four components for a hero animation the site
stopped using, five NOC and network panels, three complete dashboard pages, a
second implementation of the 3D rack scene, and a 404 page that a newer 404
page had replaced. Real code, written on purpose, orphaned one refactor at a
time.

## Why nothing complained

A module that nothing imports is not part of the module graph. Rollup, which
Vite builds on, starts at the entry point and follows imports; anything it
never reaches is not "tree shaken", it is simply never considered. So the build
is silent, and the silence is not a bug in the build. It is what a correct
bundler does.

Everything *else*, though, sees these files:

- `tsc --noEmit` compiles them, on every push.
- Every source-scanning check in this repository scans them. Several ask
  questions like "does every `position: fixed` element carry
  `data-print-hide`?", and a dead component with a fixed element makes that
  check fail, or worse, makes someone annotate a file that cannot render.
- `npm ci` installs their dependencies. This is the one that hurt. Twenty-seven
  packages were in `package.json` solely because an unreachable file imported
  them: eighteen Radix primitives, plus `cmdk`, `date-fns`,
  `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-hook-form`,
  `react-resizable-panels`, `vaul` and `@hookform/resolvers`. Every install,
  every CI run, every audit, for code that could not execute.

Nothing shipped to a reader. Everything else paid.

## The measurement was wrong the first time

The obvious way to find this is to build the import graph and subtract. I wrote
that, ran it against a set of pages I was fairly sure were dead, and got:

```
reachable from the live app: 288 files
reachable ONLY from legacy:  0 files
```

Zero. Which would have meant those pages shared every one of their imports with
the live app, and I nearly believed it, because zero is a boring number and
boring numbers do not look like bugs.

Here is what the script did:

```js
const live = reach(["client/src/main.tsx", ...liveFromApp]);
const legacyOnly = [...reach(LEGACY)].filter((f) => !live.has(f));
```

`liveFromApp` was `App.tsx`'s imports with the legacy pages filtered out. That
filtering was the whole idea, and it accomplished nothing, because the root list
also contained `main.tsx`, and `main.tsx` imports `App.tsx`, and `App.tsx` still
imported all six legacy pages. The walk entered them one hop later through the
front door. Everything they reached landed in `live`, so the difference could
not be anything but empty. The script was not measuring dead code; it was
measuring whether `main.tsx` reaches `App.tsx`.

The fix is one parameter:

```js
const reach = (roots, blocked = new Set()) => {
  const seen = new Set(), stack = [...roots];
  while (stack.length) {
    const f = stack.pop();
    if (!f || seen.has(f) || blocked.has(f)) continue;
    seen.add(f);
    for (const d of imports.get(f) ?? []) stack.push(d);
  }
  return seen;
};
```

**A file is either a root or it is entered. Filtering the root list proves
nothing about a graph that has other ways in.** With the walk refusing to enter
those six files, the same question answered 278 and 10.

That is the general shape of the mistake and it is not specific to import
graphs. Any reachability question ("which config keys are unused", "which
database rows are orphaned", "which permissions does nobody hold") has this trap
in it, and it always produces the same tell: a suspiciously clean zero.

## Two files were reachable, just not by an import

Having fixed the walk, I ran it without any notion of "legacy" at all: which
files does nothing reach? It returned 67. Sixty-five of them were genuinely
dead. The other two would have been a bad afternoon.

`client/src/lib/blogPosts.source.ts` is the source of truth for every article
here. The app does not import it; a build script reads it, splits it into
markdown, and the app imports the result. An import graph over `client/src`
cannot see that, because the reference lives in `script/stampUpdated.ts`.

`client/src/lib/crypto-shim.ts` is worse, because the reference is not in any
file that looks like source at all. It is in the bundler config:

```js
resolve: {
  alias: {
    crypto: path.resolve(import.meta.dirname, "client", "src", "lib", "crypto-shim.ts"),
  },
},
```

Nothing names that file by path. Something imports the bare specifier
`"crypto"`, and Vite rewrites it. Delete the file and the graph is still
complete; the build breaks.

So an import-graph dead-code check has to be told about the ways in that are not
imports, and it has to be told them one file at a time, with a reason written
down. A blanket "ignore `lib/`" would have hidden four genuinely dead files in
the same directory.

## The check

It runs on every push now, and it fails in both directions:

```
FAIL  1 file(s) under client/src that no import reaches:

        client/src/lib/__probe.ts

      Delete them, or import them from something the app reaches.
      If one is loaded by a build script or a bundler alias, add it
      to REACHED_ANOTHER_WAY in this file with the reason.
```

and, if an allowlisted file becomes ordinarily reachable, or stops existing:

```
FAIL  1 allowlisted file(s) no longer need the exemption:
        client/src/lib/queryClient.ts is reachable by import now
```

The second half matters more than it looks. An allowlist with two entries and no
expiry is how the third entry gets added without anyone thinking about it, and
how a note that was true in 2026 is still sitting there being wrong in 2028. If
the exemption is not needed, the check says so.

There is one more guard worth copying. The script refuses to pass if it reaches
implausibly few files:

```js
if (live.length < 100) {
  console.error(`FAIL  only ${live.length} files under ${ROOT} are reachable`);
  console.error("      The import syntax this script parses probably changed; fix it.");
  process.exit(1);
}
```

The check parses imports with regular expressions. The day somebody adds a syntax
those expressions do not match, the honest failure is "I could not measure this",
not "everything is dead". A checker that cannot fail loudly when it stops working
will eventually pass loudly while measuring nothing, which is exactly what the
first version of the graph did.

## What actually came out

| | |
|---|---|
| Files deleted | 65 |
| Lines deleted | 7,847 |
| npm dependencies removed | 27 |
| Lockfile lines removed | 791 |
| Bundle size change | none |

That last row is the point. Not one byte of this was ever sent to a reader,
which is precisely why it survived so long. The cost was in install time, CI
time, typecheck time, dependency audit surface, and the attention of anyone
grepping the codebase and finding two files with the same name, one of which
does nothing.

Deleting a shadcn primitive costs nothing permanent, incidentally:
`components.json` is still in the repo, so `npx shadcn add dialog` puts it back
in a second when something actually needs it. Vendored UI code is worth keeping
*when it is used*. Keeping forty copies of it against a future that may not
arrive is just carrying the template's furniture around.

## What I would tell myself

**Dead code is quiet by construction.** Every other class of defect has
something that notices: a failing test, a red build, a user. Unreachable code has
nothing, because the mechanism that would notice is the same mechanism that
ignores it. It has to be looked for on purpose, and once you have looked for it
once, it is cheap to keep looking.

**Distrust the clean zero.** "No problems found" from a checker you wrote ten
minutes ago is a claim about your checker, not about your codebase. Prove it can
fail: I only trusted this one after planting a file nothing imports and watching
it go red, then breaking the allowlist and watching it go red the other way.

**Unused dependencies are a security surface, not just weight.** Twenty-seven
packages, with their own transitive trees, installed on every CI runner, for
files that could not run. The right number of dependencies for code that cannot
execute is zero.

## References

- [Rollup: tree shaking and the module graph](https://rollupjs.org/introduction/#tree-shaking)
- [Vite: dependency resolution and `resolve.alias`](https://vite.dev/config/shared-options.html#resolve-alias)
- [esbuild's notes on what tree shaking can and cannot remove](https://esbuild.github.io/api/#tree-shaking)
- [shadcn/ui: components are copied into your project, not installed](https://ui.shadcn.com/docs/cli)
- [npm docs: `npm ci` installs exactly what the lockfile says](https://docs.npmjs.com/cli/v10/commands/npm-ci)
- [OpenSSF Scorecard: the checks, including dependency surface](https://github.com/ossf/scorecard/blob/main/docs/checks.md)
