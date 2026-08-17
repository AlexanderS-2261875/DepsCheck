---
name: dcheck
description: Check this project's dependencies against the local DepsCheck cache and report anything deprecated or outdated
---

DepsCheck lives at `__DEPSCHECK_HOME__`
(its own git repo — don't touch it beyond what's below).

1. Run:
   ```
   node "__DEPSCHECK_HOME__/scripts/check-project.ts" "$(pwd)"
   ```
   This finds the nearest `package.json` from the current directory upward,
   diffs its dependencies against the local cache
   (`~/.claude/depscheck/state.json`), and prints a JSON report. Anything
   never seen before gets a one-off baseline registry check (fast, no AI);
   everything else is answered straight from the cache — no network call.

2. Turn that JSON into a short chat summary, grouped:
   - **Needs attention now** — `status: "flagged"` items that already have
     `aiSummary` filled in (cached research from a previous nightly run). Show
     the summary and suggested action.
   - **Flagged, research pending** — flagged items with `pendingResearch:
     true`. These will get researched by tonight's nightly job automatically
     (no action needed from you or me right now) — just list the package
     names so the user knows what's queued.
   - **Couldn't check** — `status: "unknown"` items. These are *not* known to
     be fine; the lookup failed. List them with their `registryError` (usually
     an unpublished/private/renamed package, or a network problem).
   - **Up to date** — `status: "ok"`, a one-line count, don't list every
     package.

   If a result has `aliasOf`, it's declared via `npm:` and points at a
   different package — show it as `name → aliasOf` so the mismatch is visible.

3. If `newlyAdded > 0`, mention it briefly ("N new packages added to the
   watchlist") so the user understands why some things are pending research
   for the first time.

4. If `removed` is non-empty, mention it too ("N package(s) no longer in
   this project's package.json, dropped from tracking here: ...") — this
   means DepsCheck noticed the project stopped depending on them since the
   last check.

5. If `skipped` is non-empty, add one line noting those deps aren't checked
   against the registry and why (local paths, workspace protocol, git and URL
   deps — the registry has nothing to say about them). Don't list more than a
   few names; a count and the reasons is enough.

6. If at least one flagged item has cached research (`aiSummary` non-null),
   mention that `/dupgrade` can draft an upgrade plan for it — don't launch
   into that here, just point it out.

Don't run `npm install`, don't modify the project's `package.json` — this is
read-only reporting.
