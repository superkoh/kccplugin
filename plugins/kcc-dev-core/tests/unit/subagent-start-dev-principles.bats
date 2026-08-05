#!/usr/bin/env bats
#
# L2 behavioural test for kcc-dev-core's SubagentStart hook script.
# Same conditional dev-scene contract as the SessionStart script, but
# the envelope must carry hookEventName "SubagentStart" and the
# subagent-variant sentinel.

PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."
SCRIPT="$PLUGIN_ROOT/scripts/subagent-start-dev-principles.sh"

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

@test "HIT via stdin.cwd: .git/ in tmpdir injects subagent principles" {
  mkdir -p "$TMPROOT/.git"
  payload=$(mktemp)
  printf '{"cwd":"%s"}' "$TMPROOT" >"$payload"
  run bash "$SCRIPT" <"$payload"
  rm -f "$payload"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SubagentStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | length > 0'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-subagent-principles-v")'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("Development Discipline for Subagents")'
}

@test "MISS via stdin.cwd: clean tmpdir injects nothing" {
  payload=$(mktemp)
  printf '{"cwd":"%s"}' "$TMPROOT" >"$payload"
  run bash "$SCRIPT" <"$payload"
  rm -f "$payload"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SubagentStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext == ""'
}

@test "HIT via \$PWD fallback: empty stdin, repo cwd" {
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-subagent-principles-v")'
}

@test "no external dependencies: full injection with PATH stripped" {
  # Same contract as the SessionStart script: builtins only, so a stripped
  # PATH changes nothing — full injection, silent stderr.
  run --separate-stderr env -i HOME="$HOME" PATH="" /bin/bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SubagentStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-dev-core-subagent-principles-v")'
}
