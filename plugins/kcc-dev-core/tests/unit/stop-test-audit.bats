#!/usr/bin/env bats
#
# L2 behavioural test for kcc-dev-core's Stop hook test audit. The
# script blocks a stop (once) when the repo holds uncommitted source
# changes with no touched test file. Decision paths exercised:
#
#   1. sanity check (executable bit)
#   2. BLOCK: untracked source file, no test file
#   3. ALLOW: source change accompanied by a test change
#   4. ALLOW: docs/config-only change
#   5. ALLOW: loop guard — stop_hook_active true
#   6. ALLOW: clean tree
#   7. ALLOW: not a git repo
#   8. ALLOW: an already-audited source set on the next stop
#   9. BLOCK: a source file that appeared after the last audit
#  10. marker pruning — a committed file re-audits when changed again

PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."
SCRIPT="$PLUGIN_ROOT/scripts/stop-test-audit.sh"

setup() {
  command -v jq >/dev/null 2>&1 || skip "jq not on PATH"
  command -v git >/dev/null 2>&1 || skip "git not on PATH"
  TMPROOT=$(mktemp -d)
  git -C "$TMPROOT" init -q
  git -C "$TMPROOT" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
}

teardown() {
  if [[ -n "${TMPROOT:-}" && -d "$TMPROOT" ]]; then
    rm -rf "$TMPROOT"
  fi
}

run_hook() {
  local payload
  payload=$(mktemp)
  printf '{"cwd":"%s","stop_hook_active":%s}' "$TMPROOT" "${1:-false}" >"$payload"
  run bash "$SCRIPT" <"$payload"
  rm -f "$payload"
}

@test "script file exists and is executable" {
  [ -x "$SCRIPT" ]
}

@test "BLOCK: untracked source file with no test change" {
  mkdir -p "$TMPROOT/src"
  echo 'export const x = 1;' >"$TMPROOT/src/logic.mjs"
  run_hook
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason | contains("kcc-dev-core.unit-tests")'
  echo "$output" | jq -e '.reason | contains("src/logic.mjs")'
}

@test "ALLOW: source change accompanied by a test change" {
  mkdir -p "$TMPROOT/src" "$TMPROOT/tests"
  echo 'export const x = 1;' >"$TMPROOT/src/logic.mjs"
  echo 'test' >"$TMPROOT/tests/logic.test.mjs"
  run_hook
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: docs/config-only change" {
  echo '# notes' >"$TMPROOT/README.md"
  echo '{}' >"$TMPROOT/config.json"
  run_hook
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: a freshly installed .claude/ payload is config, not source" {
  # Installing kcc into a project drops dozens of untracked .sh/.mjs files
  # under .claude/. They are Claude Code configuration, not product code, and
  # blocking on them would fire on the very first turn after an install.
  mkdir -p "$TMPROOT/.claude/kcc/kcc-core/scripts" "$TMPROOT/.claude/skills/kcc-ablation.ablate/scripts"
  echo '#!/usr/bin/env bash' >"$TMPROOT/.claude/kcc/kcc-core/scripts/session-start.sh"
  echo 'export const x = 1;' >"$TMPROOT/.claude/skills/kcc-ablation.ablate/scripts/score.mjs"
  run_hook
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "BLOCK: real source still fires when a .claude/ payload is also present" {
  mkdir -p "$TMPROOT/.claude/kcc/kcc-core/scripts" "$TMPROOT/src"
  echo '#!/usr/bin/env bash' >"$TMPROOT/.claude/kcc/kcc-core/scripts/session-start.sh"
  echo 'export const x = 1;' >"$TMPROOT/src/logic.mjs"
  run_hook
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason | contains("src/logic.mjs")'
  echo "$output" | jq -e '.reason | contains(".claude/") | not'
}

@test "ALLOW: loop guard on stop_hook_active" {
  mkdir -p "$TMPROOT/src"
  echo 'export const x = 1;' >"$TMPROOT/src/logic.mjs"
  run_hook true
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: clean tree" {
  run_hook
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: not a git repo" {
  rm -rf "$TMPROOT/.git"
  echo 'export const x = 1;' >"$TMPROOT/logic.mjs"
  run_hook
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: an already-audited source set on the next stop" {
  mkdir -p "$TMPROOT/src"
  echo 'export const x = 1;' >"$TMPROOT/src/logic.mjs"
  run_hook
  echo "$output" | jq -e '.decision == "block"'
  run_hook
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "BLOCK: a source file that appeared after the last audit" {
  mkdir -p "$TMPROOT/src"
  echo 'export const x = 1;' >"$TMPROOT/src/logic.mjs"
  run_hook
  echo "$output" | jq -e '.decision == "block"'
  echo 'export const y = 2;' >"$TMPROOT/src/other.mjs"
  run_hook
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason | contains("src/other.mjs")'
  # already-audited files must not be re-listed — the reason names only
  # what appeared since the last audit.
  ! echo "$output" | jq -e '.reason | contains("src/logic.mjs")'
}

@test "marker prunes committed files so they re-audit when changed again" {
  mkdir -p "$TMPROOT/src"
  echo 'export const x = 1;' >"$TMPROOT/src/logic.mjs"
  run_hook
  echo "$output" | jq -e '.decision == "block"'

  git -C "$TMPROOT" add src/logic.mjs
  git -C "$TMPROOT" -c user.email=t@t -c user.name=t commit -q -m feat
  run_hook
  [ -z "$output" ]

  echo 'export const x = 2;' >"$TMPROOT/src/logic.mjs"
  run_hook
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.decision == "block"'
}
