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
  echo "$output" | jq -e '.reason | contains("write-unit-tests")'
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

@test "no JSON tool: jq is never invoked, and the block still lands" {
  # `git` is an intrinsic dependency of this hook — auditing the working
  # tree IS the feature. Encoding the block decision as JSON is not, so it
  # must not reach for jq. Rather than curating PATH (git and jq share a
  # directory on most CI images), shadow jq with a shim that records the
  # call and fails; if the script still produces a correct block and the
  # marker is absent, jq genuinely never ran.
  mkdir -p "$TMPROOT/src"
  echo 'export const x = 1;' >"$TMPROOT/src/logic.mjs"

  SHIM=$(mktemp -d)
  printf '#!/bin/sh\ntouch "%s/jq-was-called"\nexit 1\n' "$SHIM" >"$SHIM/jq"
  chmod +x "$SHIM/jq"

  payload=$(mktemp)
  printf '{"cwd":"%s","stop_hook_active":false}' "$TMPROOT" >"$payload"
  run env PATH="$SHIM:$PATH" bash "$SCRIPT" <"$payload"
  rm -f "$payload"

  [ "$status" -eq 0 ]
  [ ! -e "$SHIM/jq-was-called" ]
  rm -rf "$SHIM"
  echo "$output" | jq -e '.decision == "block"'
  echo "$output" | jq -e '.reason | contains("src/logic.mjs")'
}

# NOTE (pre-existing, not covered here): git quotes any path outside plain
# ASCII — `git ls-files --others` prints "src/\350\256\242....mjs" for a
# CJK filename — and the classifier sees a basename ending in `"`, so it
# matches neither is_test_file nor is_source_file and the audit stays
# silent. Verified identical on main and on this branch, so it is not a
# regression from dropping jq; fixing it means `-z` / NUL-delimited git
# output and belongs with the audit, not with this change.
