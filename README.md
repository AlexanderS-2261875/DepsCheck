# DepsCheck

[![CI](https://github.com/AlexanderS-2261875/DepsCheck/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexanderS-2261875/DepsCheck/actions/workflows/ci.yml)

Offline dependency-health checker for npm projects. `/dcheck` tells you what's
deprecated or outdated and what to do about it. `/dupgrade` plans and applies
the fix. Everything runs on your machine.

```
you@laptop some-project % /dcheck

Needs attention now
  lucide-react (^0.475.0 → 1.27.0, 1 major behind)
    v1 is a full rewrite with a new import style — not a drop-in bump.
    → Suggested: read the v1 migration guide first.

Flagged, research pending (ready after tonight's refresh)
  @types/node, tailwindcss, typescript

Up to date: 16 packages
```

## How it works

- `/dcheck` reads a local cache (`~/.claude/depscheck/state.json`). No network
  call unless it sees a package for the first time — then it's one GET to the
  npm registry.
- A nightly job re-checks every known project, refreshes registry data, and
  runs Claude with WebSearch on anything newly flagged. Research happens once,
  in the background, not while you wait.
- Packages enter the system the first time you run `/dcheck` in a project that
  uses them. Drop a dependency and the nightly job stops watching it.
- `/dupgrade` only plans packages that have actually been researched. It stops
  on the first broken build and never commits or pushes.

## Install

Needs Node ≥23.6 (native TypeScript, no build step) and the
[Claude Code CLI](https://github.com/anthropics/claude-code) on `PATH`.

```bash
git clone <this-repo> DepsCheck
cd DepsCheck
./setup.sh
```

`setup.sh` installs `/dcheck` and `/dupgrade` to `~/.claude/commands/` and
`~/.gemini/config/skills/`, and writes the launchd plist — but does not load
it. Load it yourself:

```bash
launchctl load ~/Library/LaunchAgents/com.depscheck.nightly.plist
```

Nightly runs at 07:00. Edit `Hour`/`Minute` in
`launchd/com.depscheck.nightly.plist` before running `setup.sh` to change it.

Re-run `setup.sh` if you move the clone — the command files and the plist have
the install path baked in.

## Usage

```bash
/dcheck      # read-only status report
/dupgrade    # draft an upgrade plan, then implement it once you approve
```

No "add project" step — the first `/dcheck` in a project adds it.

Scriptable directly:

```bash
node scripts/check-project.ts /path/to/project   # what /dcheck runs
node scripts/refresh-registry.ts                 # nightly step 1
node scripts/list-needs-research.ts              # what's queued
bash scripts/nightly.sh                          # run the nightly job now
```

## Config

| What | Where |
|---|---|
| Nightly run time | `Hour`/`Minute` in the launchd plist |
| Cache location | `STATE_DIR` in `scripts/lib/state.ts` |
| What counts as "flagged" | `check-project.ts` — currently deprecated, or ≥1 major behind |
| Research prompt | `prompts/nightly-refresh.md` |

## Limitations

- Only runs while your Mac is awake. launchd won't wake it or catch up on
  missed runs.
- No cross-machine sync. Each machine builds its own watchlist.
- `majorsBehind` is a regex heuristic, not semver. It can misfire on unusual
  versioning schemes.

## Tests

```bash
npm install
npm run typecheck
npm test
```

Both tests run against `test/fixtures/sample-project` with
`DEPSCHECK_STATE_DIR` pointed at a temp dir, so they can't touch your real
cache. `smoke-test.sh` checks that a deprecated package gets flagged;
`prune-test.sh` checks that a removed dependency gets unwatched.

CI runs the same commands on every push and PR — run them before opening a PR.

## License

[MIT](LICENSE)
