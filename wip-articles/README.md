# Work in progress: new articles and the article audit

Saved on October 5, 2026 when the session had to stop. Nothing in this folder is published: the site builds only from `client/`, and the CI dash and spelling checks scan only `client/src`, `script`, `server` and `shared`. **Remove this folder before PR #252 is merged.**

## Where things stand

### PR #252 (open, do not merge yet)
Mac Pro 7,1 batch. It contains so far the covers, thumbnails and in-article photos for the four articles, plus the new `figure` / `figcaption` styles in `client/src/index.css` (the first in-article photos on the site, each credited in its caption). The four articles themselves are not written yet:

| Slug | Target query | Cover |
|---|---|---|
| linux-on-mac-pro-7-1 | mac pro 7 1 linux | done |
| windows-11-on-mac-pro-7-1 | mac pro 7 1 windows 11 | done |
| macos-tahoe-on-mac-pro-7-1 | mac pro 7 1 tahoe | done |
| mac-pro-5-1-vs-7-1 | mac pro 5 1 vs 7 1 | not yet (plan: a chart of sourced benchmark numbers) |

The research agents for these four ended without reporting back, so their research has to be redone. Verified facts to use: Apple discontinued the Mac Pro on March 26, 2026 (MacRumors); macOS 27 Golden Gate supports no Intel Mac, so Tahoe is the last macOS for the 7,1; the rack 2019 model needs 5U, is 8.67 inches tall, and Apple lists 1280W maximum continuous power for the rack model.

### Drafts ready to integrate (in `drafts/`)
Each has a `.md` body and a `.json` with title, excerpt, tags and a claims ledger.

| Draft | Status |
|---|---|
| apple-server-hardware | Written, all 50+ URLs checked, photos in `images/` |
| macos-server-versions | Written, URLs checked, chart cover in `images/` |
| dell-r730-vs-r730xd | Agent draft, 27 refs; reviewed once, reads well |
| dell-r730-quiet-fans | Agent draft, 28 refs, 116 claims |
| fortigate-homelab-license | Agent draft, 40 refs, 110 claims |
| fortigate-60e-to-60f-migration | Agent draft, 46 refs; verify the lifecycle dates (end of order December 29, 2021, end of support December 29, 2026) |
| mac-pro-4-1-to-5-1-firmware-upgrade | Gap closed (jensd.be guide ranks), do not write |

To publish a batch: move the images from `images/client/...` to the same paths under the repo root, run `tools/integrate.py <slug> ...` (copy it next to a `drafts/` folder first, or edit its paths), then `npx tsx script/generatePostIndex.ts`, `npx tsx script/addInternalLinks.ts --check`, the full CI step list, and `python3 scripts-ci/make-og-images.py` after a build for the social cards. One themed PR per batch.

### Topic queue
`kw/pipeline.md` has the full queue of open queries with Google autocomplete demand, grouped into themed batches (vintage Mac Pro, Dell storage, iDRAC, Dell comparisons, HBAs and JBODs, FortiGate, Cisco, HPE and Supermicro). `kw/cands2.txt` is the filtered sweep. `STYLE.md` is the drafting guide given to agents.

### The article audit (requested: "tell me the junk first", before deleting anything)
Not finished. Done so far, in `audit/`:
- `audit_meta.json`: per-post words, references, inline links, and whether the cover is a real photo. 171 of 316 posts have placeholder covers (a near-black number chart or the same generic rack render); only one post has an in-article image.
- `audit_sim.json`: text-similarity duplicate clusters. 28 clusters covering 71 posts, for example six MTU articles, five vector database articles, five threat modeling articles, three each on PXE, PCIe lanes, RAG, cgroups, NUMA and object storage, and two posts both titled "The Attack Surface of an LLM Application".
- `RUBRIC.md` and `slice1.txt` to `slice8.txt`: the per-post review was split into eight slices; the reviewers were stopped before writing results, so this step has to be rerun.

Next: rerun the review, combine it with the clusters, and send the owner the list (delete, merge with a 301 to the better post, retitle, needs a photo) before changing anything.

### Accuracy fixes found along the way (separate PR)
- Several posts still describe the Mac Pro as current; it was discontinued March 26, 2026 (for example "the Mac Pro is your only option" in the Xserve article).
- `dell-poweredge-r740-deep-dive` says the third-party PCIe cooling response is exposed through IPMI; Dell's iDRAC9 paper says there is no customer-facing IPMI support and the setting is per PCIe slot.
- `fortigate-firewall-homelab` groups application control with paid FortiGuard; Fortinet's docs say application control signatures come with FortiCare.

## Tools
`tools/`: `integrate.py` (insert drafts into `blogPosts.source.ts` with template-literal escaping), `makecover.py` and `retry.py` (Commons photo to 1600x900 cover plus 480x270 thumbnail, using 1920px thumbnails because Wikimedia refuses full-size downloads from bots), `inline.py` (in-article photo with credit), `check_urls.py` (status of every URL in a draft), `covers.py`, `cat.py`, `thumbs.py` (Commons search and previews). `kw/expand2.py` reruns the autocomplete sweep.
