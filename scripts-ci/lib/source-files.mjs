/**
 * The one place that decides which files a gate reads.
 *
 * `git ls-files` lists TRACKED files, and that is a hole with a shape this
 * repository has now been bitten by twice.
 *
 * check-spelling's own header records the first time: while the gate was new
 * and not yet committed it was invisible to its own scan, so it ran green
 * locally and red on CI. The second time cost a CI round on a practice
 * surface. A generated post body carrying a British spelling sat untracked in
 * client/src/content/posts while the full local sweep passed twice, and the
 * first CI run after the commit made the file tracked found it immediately.
 * Nothing was wrong with the gate. It had not been shown the file.
 *
 * This comment cannot quote the word it is about, which is the third time the
 * same joke has landed: with the change in place, check-spelling read this
 * file while it was still untracked and failed the sweep on the quotation.
 * That is the fix demonstrating itself, so the sentence stays paraphrased.
 *
 * `--others` adds the files git can see but is not tracking, and
 * `--exclude-standard` keeps .gitignore honored, so dist, node_modules and
 * everything else ignored stays out. In CI this changes nothing, because the
 * checkout has everything tracked. Locally it moves the failure from a push
 * to a sweep, which is where it is cheap.
 *
 * -z rather than newlines, because a filename may legally contain one and a
 * gate that silently reads half a path is worse than a gate that reads none.
 */
import { execFileSync } from "node:child_process";

/**
 * Every source file matching the pathspecs, tracked or merely present.
 *
 * Pass pathspecs the way git takes them: a directory, or a glob like
 * `client/src/**\/*.md`. The result is sorted and deduplicated, so a caller
 * can rely on the order.
 */
export function sourceFiles(pathspecs) {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...pathspecs],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return [...new Set(out.split("\0").filter(Boolean))].sort();
}
