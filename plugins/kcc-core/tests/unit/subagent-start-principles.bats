#!/usr/bin/env bats
#
# L2 behavioural test for kcc-core's SubagentStart hook script.
# Unconditional injection (mirror of the SessionStart script), but the
# envelope must carry hookEventName "SubagentStart" and the
# subagent-variant sentinel.

PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."
SCRIPT="$PLUGIN_ROOT/scripts/subagent-start-principles.sh"

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

@test "stdout is a JSON object with the SubagentStart envelope" {
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SubagentStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | type == "string"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | length > 0'
}

@test "additionalContext contains the human signature phrase" {
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("Principles for Subagents")'
}

@test "additionalContext contains the machine sentinel token" {
  run bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-core-subagent-principles-v")'
}

@test "graceful degrade when jq is unavailable: script still exits 0" {
  # Same degrade contract as the SessionStart script: builtins-only
  # self-location, empty additionalContext, warning on stderr.
  run --separate-stderr env -i HOME="$HOME" PATH="" /bin/bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  [[ "$stderr" == *"jq not found"* ]]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SubagentStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext == ""'
}
