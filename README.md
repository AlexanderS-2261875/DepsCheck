# DepsCheck

Scans Schmitt Software's client projects for outdated/deprecated npm
dependencies, then has an AI agent research fixes and alternatives.

Two ways to run it:

- **Locally, on demand** — the `/dcheck` slash command in Claude Code (see
  `~/.claude/commands/dcheck.md`). Scans `../../clients` directly on disk,
  no cloning needed. Reports go to `reports/` but nothing is committed or
  pushed without asking first.
- **Automatically, every morning** — `.github/workflows/daily-deps-check.yml`
  runs on a cron schedule once this repo is pushed to GitHub. Since GitHub
  Actions runners can't see your local `../clients` folder, this mode clones
  every repo in the `schmittsoftware` org instead (see `scripts/clone-clients.sh`).

## How the scan works

`scripts/scan-deps.mjs <rootDir>` walks every `package.json` under `rootDir`
(skipping `node_modules`, `dist`, etc.), and for each dependency queries the
public npm registry to check:

- is the latest published version marked `deprecated`?
- how many majors behind latest is the declared range? (a regex-based
  heuristic, not full semver — treat `majorsBehind` as a signal, not gospel)

Anything flagged gets written to a JSON report. `prompts/research.md` is the
prompt handed to Claude (interactively via `/dcheck`, or headless via
`claude -p` in CI) to turn that JSON into an actual markdown report with
researched recommendations.

## One-time setup for the automated (GitHub Actions) mode

This repo needs to actually live on GitHub for the cron schedule to fire —
nothing runs while it only exists on your Mac. Once pushed:

1. **Add two repo secrets** (Settings → Secrets and variables → Actions):
   - `ANTHROPIC_API_KEY` — used to run Claude Code headless in the
     "Research fixes with Claude" step. I can't set this for you — API keys
     are a credential and setting them isn't something I'll do automatically.
   - `CROSS_REPO_PAT` — a GitHub Personal Access Token (classic, `repo`
     scope, or fine-grained with read access to all client repos) used to
     clone the private client repos. The default `GITHUB_TOKEN` Actions
     provides is scoped only to this repo, so it can't see sibling repos in
     the org even though they're the same owner.
2. Confirm `config/exclude.txt` still matches which repos in the org are
   *not* client sites (Schmitt Software's own tooling repos, this repo
   itself, etc.) — it's a flat list of repo names, one per line.
3. Trigger a manual run first (Actions tab → "Daily Dependency Check" →
   "Run workflow") to confirm the whole chain works before trusting the
   cron schedule.

## Known caveats (unverified — check on first real run)

- Whether Claude Code's `WebSearch` tool works the same way under a plain
  `ANTHROPIC_API_KEY` in headless/CI mode as it does in an interactive
  session hasn't been confirmed here — worth checking the first Actions run.
- `--dangerously-skip-permissions` is required in CI since there's no
  terminal to approve tool calls interactively; it's safe here because the
  runner is an ephemeral, disposable VM.
