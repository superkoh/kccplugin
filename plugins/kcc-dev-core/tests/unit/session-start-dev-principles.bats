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
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-principles-v5")'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("Investigate Before Editing")'
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
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-principles-v5")'
}

@test "HIT via \$PWD fallback: empty stdin, repo cwd" {
  # With no stdin the script falls back to $PWD. bats inherits the cwd
  # from the test runner (npm run test:l2), which is the repo root. The
  # repo has .git/, so we should see an injection.
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-principles-v5")'
}

@test "graceful degrade when jq is unavailable: script still exits 0" {
  # Strip PATH entirely so the `command -v jq` checks inside the script
  # return non-zero. Invoke bash via an absolute path (/bin/bash) so we
  # don't need a working PATH to locate the shell itself. The script is
  # written to use only bash builtins for self-location, so it reaches
  # the second jq check at the injection step and takes the
  # graceful-degrade path instead of crashing.
  #
  # Before that second check the script has already resolved $cwd via
  # the $PWD fallback (the first jq check fails silently, skipping
  # stdin parsing), and is_dev_scene runs fine without jq. On a repo
  # cwd is_dev_scene returns 0, and then the jq-missing injection check
  # kicks in and emits an empty additionalContext plus a stderr
  # warning.
  #
  # `run --separate-stderr` keeps $output as stdout-only, so the
  # stderr warning doesn't pollute the JSON we feed to jq below. We
  # also assert the warning appeared on stderr, confirming we really
  # took the degrade branch.
  run --separate-stderr env -i HOME="$HOME" PATH="" /bin/bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  [[ "$stderr" == *"jq not found"* ]]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SessionStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext == ""'
}
