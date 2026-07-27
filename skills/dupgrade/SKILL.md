---
name: dupgrade
description: Draft an upgrade plan for this project's flagged dependencies, then implement it once approved
---

DepsCheck lives at `__DEPSCHECK_HOME__`
(its own git repo — don't touch it beyond what's below).

## 1. Gather findings

Run:
```bash
node "__DEPSCHECK_HOME__/scripts/check-project.ts" "$(pwd)"
```

Take every result where `flagged: true` and `aiSummary` is non-null (has
cached research). Skip anything with `pendingResearch: true` — there's
nothing to plan around yet.

If nothing has research yet, say so and stop. Suggest running `/dcheck`
first, or waiting for tonight's nightly job to research what's flagged.

## 2. Draft a plan — don't touch any files yet

For each researched, flagged package, decide which kind of change it needs,
based on its `aiSummary` / `suggestedAction`:

- **Replacement** — the package is deprecated and the research names a
  maintained alternative. Means: swap the dependency in `package.json`,
  update every import across the codebase, reinstall.
- **Version bump** — not deprecated, just behind. Means: bump the declared
  range (to latest, or to whatever safe stopping point the research names),
  reinstall, run any migration codemod the research mentions.

Present the plan as a numbered, package-by-package list: which kind of
change, the specific action, and why (one line pulled from the cached
research). Order it safest-first — plain version bumps before
replacements, anything the research called a drop-in bump before anything
it called a rewrite. Flag if two items likely touch the same files (e.g.
both affect the same config) and suggest doing those together.

**Then stop and wait for the user.** They may:
- say to proceed as-is
- ask to drop, reorder, or rescope specific items — revise the plan and
  present it again
- ask questions about a specific item

Only move to step 3 once they've clearly approved.

## 3. Before implementing: check the project is clean

Run `git status` in the target project. If there are uncommitted changes,
stop and say so — don't start layering upgrade changes on top of someone's
in-progress work without them knowing.

## 4. Implement

Work through the approved plan in order. For each package:

- **Replacement**: update `package.json` (swap the dependency), update
  every import site, run the project's install command (detect it from the
  lockfile present: `package-lock.json` → npm, `yarn.lock` → yarn,
  `pnpm-lock.yaml` → pnpm, `bun.lockb` → bun), then run whatever
  build/typecheck/lint scripts exist in that project's `package.json` to
  verify.
- **Version bump**: update the declared range, run the install command, run
  any codemod the research named, then the same build/typecheck/lint
  verification.

If verification fails for a package: stop on that one, show the actual
error, and ask whether to keep debugging it or leave it reverted and move
on — don't silently push through a broken build, and don't make
speculative fixes beyond what the research already told you to expect.

When a package's change verifies clean, move to the next one in the plan.

## 5. Report — don't commit

Summarize what happened per package (upgraded / replaced / skipped / needs
manual follow-up, with why). Leave everything as uncommitted working-tree
changes in the target project — don't `git add`, don't commit, don't push.
That decision belongs to the user, not to this command.
