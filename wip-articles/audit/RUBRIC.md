# Article review rubric (maxdoubin.com)

You are reviewing existing articles on maxdoubin.com, the personal site of Max Doubin, a high school student who runs a homelab (rack Mac Pro, Dell PowerEdge R740, FortiGate, Cisco) and competes in the National Cyber League. The owner says some articles "don't have a point" and that titles must be good enough to show up in search. Your job is to judge each article honestly and strictly. Do not edit any file under /home/user/Server-Builder.

Article bodies are in /home/user/Server-Builder/client/src/content/posts/<slug>.md. The index of all posts (slug, title, date, words, reference count, photo cover yes/no, text-similar posts) is in /tmp/claude-0/-home-user-Server-Builder/d152a891-7ad7-5dce-892c-5a4e43c79e21/scratchpad/audit/all_posts.tsv. Read every article in your slice in full before judging it. For any article whose index row lists similar posts, also skim those similar posts so you can judge overlap.

For each article, decide:

1. **point**: one sentence naming the concrete problem a reader arrives with and what the article lets them do. If you cannot write that sentence without being vague ("explains X", "discusses Y"), say so: that is the main sign of a pointless article.
2. **usefulness** (1 to 5):
   - 5: specific and actionable. Real commands, configs, numbers, measurements, or a worked case; a reader leaves able to do or decide something they could not before; content not easily found elsewhere.
   - 4: solid and specific, some generic stretches.
   - 3: correct but generic; mostly restates what any overview says; few specifics.
   - 2: vague filler, listicle-ish, platitudes, or so broad it answers nothing.
   - 1: no discernible point, or misleading.
3. **search_title** (1 to 5): would a real person type the words in this title into Google when they have this problem? 5 = the title contains the exact terms people search (product names, error messages, commands, "X vs Y"). 1 = poetic or cryptic, contains no searchable term (e.g. "Even Is Not Stable", "Forty, and Nothing Was Running").
4. **proposed_title**: if search_title is 3 or lower, propose a replacement that a searcher would match. Rules: 40 to 65 characters; lead with the searchable terms (the error message, command, setting or product); keep the article's actual claim; no em dashes or en dashes; American spelling; title case like the site (capitalize major words). Do not promise anything the article does not deliver.
5. **duplicate_of**: if the article substantially covers the same question as another post (same reader problem, same advice), give the slug of the better one of the pair (the more specific, better sourced, more useful), else empty. Two posts on one broad topic that answer genuinely different questions are not duplicates.
6. **verdict**, one of:
   - KEEP: useful and the title is searchable.
   - RETITLE: useful content, weak title.
   - MERGE: overlaps another post; the useful parts belong in duplicate_of, and this URL should redirect there.
   - DELETE: no real point, generic filler, or off-topic for this site with nothing to salvage.
   Be strict but fair. Long, detailed, specific articles with cryptic titles are RETITLE, not DELETE.
7. **reason**: one or two sentences explaining the verdict, specific to the article (cite something in it).
8. **photo**: two to five Wikimedia Commons search words for a relevant real photograph that could illustrate the article (hardware, a place, a device), or "chart" if a figure of the article's own numbers would serve better than any photo.

Output: write one JSON object per line (JSONL) to the output file named in your task, with keys: slug, title, point, usefulness, search_title, proposed_title, duplicate_of, verdict, reason, photo. Then finish with a short summary: counts per verdict and the five weakest articles in your slice.
