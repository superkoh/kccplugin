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
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-core-thinking-principles-v")'
}

@test "no external dependencies: full injection with PATH stripped" {
  # Strip PATH entirely, so no external binary — jq, sed, cat, anything —
  # is reachable. Invoke bash via an absolute path (/bin/bash) since we no
  # longer have a PATH to locate the shell itself.
  #
  # This used to assert the opposite: that a missing jq degraded to an
  # empty additionalContext plus a stderr warning. That degrade is gone.
  # A vendored copy of this plugin (see install.sh) runs on machines that
  # never installed anything for it, and "injects nothing, quietly" is
  # indistinguishable there from "the plugin isn't installed" — the worst
  # possible failure for a hook whose whole job is injecting context.
  #
  # `run --separate-stderr` keeps $output as stdout-only; we assert stderr
  # is empty, which is what proves nothing external was even attempted.
  run --separate-stderr env -i HOME="$HOME" PATH="" /bin/bash "$SCRIPT" </dev/null
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  echo "$output" | jq -e '.hookSpecificOutput.hookEventName == "SessionStart"'
  echo "$output" | jq -e '.hookSpecificOutput.additionalContext | contains("kcc-core-thinking-principles-v")'
}
