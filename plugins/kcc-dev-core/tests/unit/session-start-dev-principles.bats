#!/usr/bin/env bats
#
# L2 behavioural test for kcc-dev-core's SessionStart hook script. The
# script conditionally injects dev principles only when the session's
# cwd looks like a software project. This file exercises the five
# decision paths:
#
#   1. sanity check (executable bit)
#   2. HIT via stdin.cwd:          tmpdir has .git/, pass cwd on stdin
#   3. MISS via stdin.cwd:         tmpdir has no signal, pass cwd on stdin
#   4. HIT via upward walk:        signal at tmpdir root, cwd deep inside
#   5. HIT via $PWD fallback:      no stdin, falls back to the bats cwd
#      which is the kccplugin repo root (has .git/)
#   6. GRACEFUL jq-missing degrade (same pattern as kcc-core's bats)

PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."
SCRIPT="$PLUGIN_ROOT/scripts/session-start-dev-principles.sh"

setup() {
  command -v jq >/dev/null 2>&1 || skip "jq not on PATH"
  TMPROOT=$(mktemp -d)
}

teardown() {
  if [[ -n "${TMPROOT:-}" && -d "$TMPROOT" ]]; then
    rm -rf "$TMPROOT"
  fi
}

@test "script file exists and is executable" {
  [ -x "$SCRIPT" ]
}

@test "HIT via stdin.cwd: .git/ in tmpdir injects principles" {
  mkdir -p "$TMPROOT/.git"
  payload=$(mktemp)
  printf '{"cwd":"%s"}' "$TMPROOT" >"$payload"
  run bash "$SCRIPT" <"$payload"
  rm -f "$payload"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SessionStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | type == "string"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | length > 0'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-principles-v")'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("Development Discipline & Craft Principles")'
}

@test "MISS via stdin.cwd: clean tmpdir injects nothing" {
  # tmpdir has no dev signals. The upward walk stops at "/" and finds
  # nothing along the way. (On platforms where /var/folders/... or /tmp
  # somehow gain a signal file, this test may flake; that has never been
  # observed on macOS or Linux in practice.)
  payload=$(mktemp)
  printf '{"cwd":"%s"}' "$TMPROOT" >"$payload"
  run bash "$SCRIPT" <"$payload"
  rm -f "$payload"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SessionStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext == ""'
}

@test "HIT via upward walk: package.json at ancestor triggers injection" {
  mkdir -p "$TMPROOT/a/b/c"
  printf '{}' >"$TMPROOT/package.json"
  deep="$TMPROOT/a/b/c"
  payload=$(mktemp)
  printf '{"cwd":"%s"}' "$deep" >"$payload"
  run bash "$SCRIPT" <"$payload"
  rm -f "$payload"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-principles-v")'
}

@test "HIT via \$PWD fallback: empty stdin, repo cwd" {
  # With no stdin the script falls back to $PWD. bats inherits the cwd
  # from the test runner (npm run test:l2), which is the repo root. The
  # repo has .git/, so we should see an injection.
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-principles-v")'
}

@test "no external dependencies: full injection with PATH stripped" {
  # Strip PATH entirely, so no external binary is reachable. Every step
  # this script takes — reading stdin, pulling .cwd out of it, walking for
  # dev signals, JSON-encoding the file — is a bash builtin, so a stripped
  # PATH must change nothing.
  #
  # This used to assert the opposite: a missing jq degraded to an empty
  # additionalContext plus a stderr warning. That degrade is gone; see the
  # rationale at the top of scripts/hook-lib.sh.
  run --separate-stderr env -i HOME="$HOME" PATH="" /bin/bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SessionStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-principles-v")'
}

@test "no external dependencies: stdin .cwd is honored with PATH stripped" {
  # The .cwd extraction used to be a `jq -r` call. Prove the builtin
  # replacement still routes a stdin-supplied cwd to the right verdict:
  # a directory with .git/ is a HIT even though $PWD (the repo) would
  # also be one — so this asserts the parse, not the fallback.
  mkdir -p "$TMPROOT/.git"
  payload=$(mktemp)
  printf '{"session_id":"abc","cwd":"%s"}' "$TMPROOT" >"$payload"
  run --separate-stderr env -i HOME="$HOME" PATH="" /bin/bash "$SCRIPT" <"$payload"
  rm -f "$payload"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-principles-v")'
}

@test "no external dependencies: stdin .cwd MISS is honored with PATH stripped" {
  # The mirror of the case above, and the one that actually proves the
  # parse happened: $PWD is the repo (a dev scene), so falling back would
  # inject. A clean tmpdir from stdin must produce an empty injection.
  payload=$(mktemp)
  printf '{"cwd":"%s"}' "$TMPROOT" >"$payload"
  run --separate-stderr env -i HOME="$HOME" PATH="" /bin/bash "$SCRIPT" <"$payload"
  rm -f "$payload"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext == ""'
}
