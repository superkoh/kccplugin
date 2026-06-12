#!/usr/bin/env bats
#
# L2 behavioural test for the SessionStart hook script. Runs the real
# script with synthetic stdin and asserts on its stdout / exit status.
# This is where shell-quoting and JSON-escaping regressions would show up.

PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."
SCRIPT="$PLUGIN_ROOT/scripts/session-start-principles.sh"

setup() {
  command -v jq >/dev/null 2>&1 || skip "jq not on PATH"
}

@test "script file exists and is executable" {
  [ -x "$SCRIPT" ]
}

@test "script exits 0 with empty stdin" {
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
}

@test "stdout is a JSON object with the SessionStart envelope" {
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SessionStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | type == "string"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | length > 0'
}

@test "additionalContext contains the human signature phrase" {
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("First-Principles Visibility")'
}

@test "additionalContext contains the machine sentinel token" {
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-core-thinking-principles-v6")'
}

@test "graceful degrade when jq is unavailable: script still exits 0" {
  # Strip PATH entirely so the `command -v jq` check inside the script
  # returns non-zero. Invoke bash via an absolute path (/bin/bash) so we
  # don't need a working PATH to locate the shell itself. The script is
  # written to use only bash builtins for self-location, so it reaches
  # the jq check and takes the graceful-degrade path instead of crashing.
  #
  # `run --separate-stderr` keeps $output as stdout-only, so the
  # "jq not found" warning the script emits on stderr doesn't pollute
  # the JSON we feed to jq below. We also assert that the warning did
  # appear on stderr, confirming we really took the degrade branch.
  run --separate-stderr env -i HOME="$HOME" PATH="" /bin/bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  [[ "$stderr" == *"jq not found"* ]]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SessionStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext == ""'
}
