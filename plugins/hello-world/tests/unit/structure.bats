#!/usr/bin/env bats
#
# Example L2 unit test using bats-core. This is what a plugin author
# would typically write to test shell hooks. The path $BATS_TEST_DIRNAME
# keeps the test independent of whatever cwd the dispatcher uses.

PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."

@test "plugin manifest exists" {
  [ -f "$PLUGIN_ROOT/.claude-plugin/plugin.json" ]
}

@test "plugin manifest declares the expected name" {
  run grep -E '"name"[[:space:]]*:[[:space:]]*"hello-world"' \
    "$PLUGIN_ROOT/.claude-plugin/plugin.json"
  [ "$status" -eq 0 ]
}

@test "greeting skill file exists" {
  [ -f "$PLUGIN_ROOT/skills/greeting/SKILL.md" ]
}

@test "hello command file exists" {
  [ -f "$PLUGIN_ROOT/commands/hello.md" ]
}
