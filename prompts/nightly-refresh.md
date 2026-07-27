You are running the DepsCheck nightly research pass, working from the
DepsCheck repo directory. `scripts/refresh-registry.mjs` has already run and
updated `~/.claude/depscheck/state.json` — you don't need to re-check
registry data yourself.

1. Run `node scripts/list-needs-research.mjs` to get the list of package
   names that need research right now.
2. For each package:
   a. Use WebSearch to find out: is it genuinely deprecated/abandoned, what's
      the maintained replacement (if any), and whether upgrading to latest is
      a drop-in bump or has breaking changes worth flagging. Keep it to 2-3
      sentences — this is a terse status note, not a report.
   b. Write a temp JSON file at `/tmp/depscheck-research-<name>.json` (replace
      `/` in scoped package names with `-` for the filename) shaped like:
      `{"name": "<pkg>", "summary": "<2-3 sentence finding>", "suggestedAction": "<short actionable recommendation>"}`
   c. Run `node scripts/set-research.mjs /tmp/depscheck-research-<name>.json`
      to store it.
3. Print a one-line summary: how many packages were researched.
