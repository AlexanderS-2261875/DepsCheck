# DepsCheck

A local, cache-backed dependency-health checker for any npm project. Not
tied to Schmitt Software's clients specifically — works on whatever
`package.json` is nearest to your current directory.

## How it works

There's a shared local cache at `~/.claude/depscheck/state.json`, keyed by
package name (not per-project — the same `react` entry is shared across
every project that uses it).

- **`/dcheck`** (Claude Code slash command, see `~/.claude/commands/dcheck.md`)
  — run it from inside any project. It finds the nearest `package.json`,
  diffs its dependencies against the cache, and reports:
  - packages already known to be deprecated/outdated, with cached AI research
    if available
  - packages flagged but not yet researched (queued for tonight)
  - brand new packages never seen before get a one-off registry check (fast,
    no AI) and get added to the watchlist
  This is read-only and does no AI/web calls itself in the common case —
  it's just reading the cache. That's what makes it feel instant/offline.

- **Nightly job** (`scripts/nightly.sh`, run via a local launchd job — see
  below) does the actual work every morning:
  1. `scripts/refresh-registry.mjs` — cheap, no AI: re-checks every watched
     package's latest version and deprecation status.
  2. Only if something is newly flagged and unresearched, spins up
     `claude -p` headless with WebSearch to figure out: is it really
     deprecated/abandoned, what's the maintained replacement, is upgrading a
     drop-in bump or does it have breaking changes.
  3. Findings get written back into the cache via `scripts/set-research.mjs`.

So the watchlist grows organically as you `/dcheck` different projects over
time, and every project you've ever checked gets its dependencies re-verified
every night, whether you open that project again or not.

## Files

- `scripts/check-project.mjs` — the `/dcheck` engine.
- `scripts/refresh-registry.mjs` — nightly step 1 (registry refresh).
- `scripts/list-needs-research.mjs` — nightly step 2 helper (what to research).
- `scripts/set-research.mjs` — safely merges one package's research into the cache.
- `scripts/nightly.sh` — orchestrates the above, entry point for launchd.
- `prompts/nightly-refresh.md` — the brief handed to headless Claude.
- `launchd/com.schmittsoftware.depscheck.plist` — the scheduled job definition.

## One-time setup: enabling the nightly job

The plist isn't loaded yet — nothing runs automatically until you do this:

```bash
launchctl load ~/Library/LaunchAgents/com.schmittsoftware.depscheck.plist
```

(first copy the plist there: `cp launchd/com.schmittsoftware.depscheck.plist ~/Library/LaunchAgents/`)

It's set to run daily at 07:00 local time. To change that, edit the `Hour`/
`Minute` values in the plist before loading it (or `launchctl unload` +
edit + `launchctl load` again to change it later).

To test it without waiting for 7am:

```bash
bash scripts/nightly.sh
tail -f ~/.claude/depscheck/nightly.log
```

Only runs while your Mac is on; it won't wake the machine or catch up on
missed days. If that ever matters, `StartCalendarInterval` can be swapped
for a `RunAtLoad`-on-wake approach, but that's not set up by default.

## Known limitation

`majorsBehind` is a regex-based heuristic (grabs the first number out of a
version range/latest version), not full semver comparison. It's a signal to
look closer, not a guarantee.
