#!/usr/bin/env bash
# One-time install: fills in this repo's actual location in the two files
# that need an absolute path (the slash command and the launchd plist),
# then installs the slash command. Does NOT load the launchd job — enabling
# the nightly run is a separate, explicit step (see README).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

DEPSCHECK_HOME="$(pwd)"
CLAUDE_COMMANDS_DIR="$HOME/.claude/commands"
ANTIGRAVITY_SKILLS_DIR="$HOME/.gemini/config/skills/dcheck"
ANTIGRAVITY_UPGRADE_SKILLS_DIR="$HOME/.gemini/config/skills/dupgrade"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"

mkdir -p "$CLAUDE_COMMANDS_DIR"
sed "s|__DEPSCHECK_HOME__|$DEPSCHECK_HOME|g" commands/dcheck.md > "$CLAUDE_COMMANDS_DIR/dcheck.md"
echo "Installed Claude command /dcheck -> $CLAUDE_COMMANDS_DIR/dcheck.md"
sed "s|__DEPSCHECK_HOME__|$DEPSCHECK_HOME|g" commands/dupgrade.md > "$CLAUDE_COMMANDS_DIR/dupgrade.md"
echo "Installed Claude command /dupgrade -> $CLAUDE_COMMANDS_DIR/dupgrade.md"

mkdir -p "$ANTIGRAVITY_SKILLS_DIR"
sed "s|__DEPSCHECK_HOME__|$DEPSCHECK_HOME|g" skills/dcheck/SKILL.md > "$ANTIGRAVITY_SKILLS_DIR/SKILL.md"
echo "Installed Antigravity skill /dcheck -> $ANTIGRAVITY_SKILLS_DIR/SKILL.md"

mkdir -p "$ANTIGRAVITY_UPGRADE_SKILLS_DIR"
sed "s|__DEPSCHECK_HOME__|$DEPSCHECK_HOME|g" skills/dupgrade/SKILL.md > "$ANTIGRAVITY_UPGRADE_SKILLS_DIR/SKILL.md"
echo "Installed Antigravity skill /dupgrade -> $ANTIGRAVITY_UPGRADE_SKILLS_DIR/SKILL.md"

mkdir -p "$LAUNCH_AGENTS_DIR"
sed -e "s|__DEPSCHECK_HOME__|$DEPSCHECK_HOME|g" -e "s|__HOME__|$HOME|g" \
  launchd/com.depscheck.nightly.plist > "$LAUNCH_AGENTS_DIR/com.depscheck.nightly.plist"
echo "Wrote $LAUNCH_AGENTS_DIR/com.depscheck.nightly.plist (not loaded yet)"

echo ""
echo "To enable the nightly job:"
echo "  launchctl load \"$LAUNCH_AGENTS_DIR/com.depscheck.nightly.plist\""

