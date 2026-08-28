#!/usr/bin/env bats
#
# L2 behavioural tests for the kcc-guard PreToolUse hook.
#
# The hook's whole job is to answer one question — "is this tool call about
# to edit a file the lockfile says kcc manages?" — and to be wrong in the
# safe direction (allow) whenever it cannot tell.
#
#   1. sanity (executable)
#   2. DENY: Write to a managed path
#   3. DENY: Edit to a managed path, given as an absolute path
#   4. ALLOW: Write to an unmanaged path in the same project
#   5. ALLOW: Read-shaped tools are never matched
#   6. DENY: Bash that redirects into a managed path
#   7. ALLOW: Bash that only reads a managed path
#   8. ALLOW: no lockfile (nothing is managed yet)
#   9. ALLOW: unparseable stdin
#  10. ALLOW: a path outside the project entirely
#  11. the deny reason names the file and points at the source repo

PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."
SCRIPT="$PLUGIN_ROOT/scripts/guard-managed-paths.sh"

MANAGED=".claude/skills/kcc-dev-core:spec/SKILL.md"

setup() {
  command -v jq >/dev/null 2>&1 || skip "jq not on PATH"
  TMPROOT=$(mktemp -d)
  mkdir -p "$TMPROOT/.claude/kcc"
  cat >"$TMPROOT/.claude/kcc/kcc.lock.json" <<EOF
{
  "lockVersion": 1,
  "modules": {
    "kcc-dev-core": {
      "version": "0.12.0",
      "files": {
        "$MANAGED": "abc123",
        ".claude/kcc/kcc-core/scripts/session-start-principles.sh": "def456"
      }
    }
  }
}
EOF
}

teardown() {
  [[ -n "${TMPROOT:-}" && -d "$TMPROOT" ]] && rm -rf "$TMPROOT"
}

run_guard() {
  local payload
  payload=$(mktemp)
  printf '%s' "$1" >"$payload"
  CLAUDE_PROJECT_DIR="$TMPROOT" run bash "$SCRIPT" <"$payload"
  rm -f "$payload"
}

@test "script file exists and is executable" {
  [ -x "$SCRIPT" ]
}

@test "DENY: Write to a managed path" {
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "DENY: Edit to a managed path given absolutely" {
  run_guard "$(jq -nc --arg p "$TMPROOT/$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Edit", cwd:$c, tool_input:{file_path:$p}}')"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "ALLOW: Write to an unmanaged path in the same project" {
  run_guard "$(jq -nc --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:"src/app.ts"}}')"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: a read-shaped tool is never matched" {
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Read", cwd:$c, tool_input:{file_path:$p}}')"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "DENY: Bash redirecting into a managed path" {
  run_guard "$(jq -nc --arg c "$TMPROOT" --arg m "$MANAGED" \
    '{tool_name:"Bash", cwd:$c, tool_input:{command:("echo x > " + $m)}}')"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "ALLOW: Bash that only reads a managed path" {
  run_guard "$(jq -nc --arg c "$TMPROOT" --arg m "$MANAGED" \
    '{tool_name:"Bash", cwd:$c, tool_input:{command:("cat " + $m)}}')"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: no lockfile means nothing is managed yet" {
  rm -f "$TMPROOT/.claude/kcc/kcc.lock.json"
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: unparseable stdin degrades open, never wedges the session" {
  run_guard "not json at all"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "ALLOW: an absolute path outside the project" {
  run_guard "$(jq -nc --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:"/etc/hosts"}}')"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "the deny reason names the file and points at the source" {
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecisionReason | contains("kcc-dev-core:spec")'
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecisionReason | contains("kcc source repository")'
}
