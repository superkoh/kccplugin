#!/usr/bin/env bats
#
# End-to-end installer behaviour, offline and deterministic.
#
# These live outside the pure-function suites on purpose: every case here
# pins down a defect that unit tests could not reach because it lived at the
# seam between the planner and the filesystem, or in argument parsing, or in
# the shell wrapper. Each one was a real bug found by running the installer
# against a real directory.

REPO="$BATS_TEST_DIRNAME/../.."
I=(node "$REPO/installer/install.mjs")

setup() {
  command -v git >/dev/null 2>&1 || skip "git not on PATH"
  T=$(mktemp -d)
  git -C "$T" init -q
}

teardown() {
  [[ -n "${T:-}" && -d "$T" ]] && rm -rf "$T"
}

@test "an empty --modules list is refused, not treated as uninstall" {
  # `--modules "$UNSET_VAR"` in CI would otherwise wipe the repo's .claude/.
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run "${I[@]}" --target "$T" --modules "" -y
  [ "$status" -ne 0 ]
  [ -f "$T/.claude/kcc/kcc.lock.json" ]
  [[ "$output" == *"--uninstall"* ]]
}

@test "a directory at a managed path is a conflict, not a mid-apply crash" {
  mkdir -p "$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh"
  run "${I[@]}" --target "$T" --all -y
  [ "$status" -eq 1 ]
  [[ "$output" == *"directory"* ]]
  [ -z "$(find "$T" -name '*.kcc-tmp-*')" ]
  [ ! -f "$T/.claude/kcc/kcc.lock.json" ]
}

@test "a symlink at a managed path is refused and left intact" {
  mkdir -p "$T/.claude/kcc/kcc-core/scripts"
  echo PRECIOUS >"$T/precious.txt"
  ln -s "$T/precious.txt" "$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh"
  run "${I[@]}" --target "$T" --all -y
  [ "$status" -eq 1 ]
  [ -L "$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh" ]
  [ "$(cat "$T/precious.txt")" = "PRECIOUS" ]
}

@test "a pre-existing settings.json is never deleted, even when we add no hooks" {
  mkdir -p "$T/.claude"
  echo '{}' >"$T/.claude/settings.json"
  "${I[@]}" --target "$T" --modules kcc-pm -y >/dev/null 2>&1
  [ -f "$T/.claude/settings.json" ]
}

@test "the project's own settings survive, and our hooks are appended" {
  mkdir -p "$T/.claude"
  cat >"$T/.claude/settings.json" <<'EOF'
{
  "model": "opus",
  "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "./mine.sh" } ] } ] }
}
EOF
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run jq -r '.model' "$T/.claude/settings.json"
  [ "$output" = "opus" ]
  run jq -r '.hooks.SessionStart[0].hooks[0].command' "$T/.claude/settings.json"
  [ "$output" = "./mine.sh" ]
}

@test "the executable bit survives installation" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  [ -x "$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh" ]
}

@test "a pre-existing file at a pulled-in dependency's path is a conflict" {
  mkdir -p "$T/.claude/kcc/kcc-core/context"
  echo "someone else's file" >"$T/.claude/kcc/kcc-core/context/thinking-principles.md"
  run "${I[@]}" --target "$T" --modules kcc-dev-core -y
  [ "$status" -ne 0 ]
  grep -q "someone else's file" "$T/.claude/kcc/kcc-core/context/thinking-principles.md"
}

@test "install is idempotent and --check passes, fails on an edit, and repairs" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run "${I[@]}" --target "$T" --all -y
  [[ "$output" == *"already up to date"* ]]

  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 0 ]

  echo tampered >>"$T/.claude/skills/kcc-dev-core:spec/SKILL.md"
  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 1 ]

  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 0 ]
}

@test "uninstall removes everything but keeps the backups" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  echo tampered >>"$T/.claude/skills/kcc-dev-core:spec/SKILL.md"
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1 # displaces the edit into a backup
  "${I[@]}" --target "$T" --uninstall -y >/dev/null 2>&1
  [ ! -e "$T/.claude/skills" ]
  [ ! -e "$T/.claude/kcc/kcc.lock.json" ]
  [ -d "$T/.claude/kcc/.backup" ]
}

@test "the installed guard denies an edit to a managed file" {
  command -v jq >/dev/null 2>&1 || skip "jq not on PATH"
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  local guard="$T/.claude/kcc/kcc-guard/scripts/guard-managed-paths.sh"
  [ -f "$guard" ]
  local payload
  payload=$(jq -nc --arg c "$T" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:".claude/skills/kcc-dev-core:spec/SKILL.md"}}')
  run bash -c "printf '%s' '$payload' | CLAUDE_PROJECT_DIR='$T' bash '$guard'"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}
