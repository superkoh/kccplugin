#!/usr/bin/env bats
# L2 test for kcc-backlog's SessionStart hook script.

setup() {
  PLUGIN_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$PLUGIN_ROOT/scripts/session-start.sh"
  VALIDATOR="$(cd "$PLUGIN_ROOT/../.." && pwd)/test/lib/hook-output.mjs"
}

@test "script exists and is executable" {
  [ -x "$SCRIPT" ]
}

@test "emits a SessionStart envelope carrying the awareness sentinel" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  # Validate against Claude Code's real hook-output schema.
  node -e "import('$VALIDATOR').then(m => m.assertHookOutput('SessionStart', process.argv[1]))" "$output"
  [[ "$output" == *"kcc-backlog-awareness-v1"* ]]
}

@test "degrades to empty additionalContext when the text file is missing" {
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/scripts" "$tmp/context"
  cp "$SCRIPT" "$tmp/scripts/session-start.sh"
  # context dir exists but the awareness file is absent
  run bash "$tmp/scripts/session-start.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"additionalContext":""'* ]]
  rm -rf "$tmp"
}
