#!/usr/bin/env bats
#
# L2 behavioural tests for the kcc-guard PreToolUse hook.
#
# The hook answers one question — "is this tool call about to modify a file
# the lockfile says kcc manages?" — and must be wrong only in the safe
# direction.
#
# The Bash matrix below is the important part. The first version of this
# guard asked "does this look like a write?" and was wrong in BOTH
# directions: `rm -rf <managed>` was allowed because the pattern required a
# leading space, while `cat <managed> | grep x > /tmp/o` was denied because
# any `>` counted. Only the redirect form was ever tested, so nothing caught
# it. Every row here is a form that must be judged correctly.

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

bash_cmd() {
  jq -nc --arg c "$TMPROOT" --arg k "$1" \
    '{tool_name:"Bash", cwd:$c, tool_input:{command:$k}}'
}

assert_denied() {
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

assert_allowed() {
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "script file exists and is executable" {
  [ -x "$SCRIPT" ]
}

# --- file-editing tools: exact, deterministic ---------------------------

@test "DENY: Write to a managed path" {
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  assert_denied
}

@test "DENY: Edit to a managed path given absolutely" {
  run_guard "$(jq -nc --arg p "$TMPROOT/$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Edit", cwd:$c, tool_input:{file_path:$p}}')"
  assert_denied
}

@test "ALLOW: Write to an unmanaged path in the same project" {
  run_guard "$(jq -nc --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:"src/app.ts"}}')"
  assert_allowed
}

@test "ALLOW: a read-shaped tool is never matched" {
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Read", cwd:$c, tool_input:{file_path:$p}}')"
  assert_allowed
}

@test "ALLOW: an absolute path outside the project" {
  run_guard "$(jq -nc --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:"/etc/hosts"}}')"
  assert_allowed
}

# --- Bash: every destructive form must be denied ------------------------

@test "DENY: rm -rf leading the command" {
  run_guard "$(bash_cmd "rm -rf $MANAGED")"
  assert_denied
}

@test "DENY: plain rm leading the command" {
  run_guard "$(bash_cmd "rm $MANAGED")"
  assert_denied
}

@test "DENY: mv onto a managed path" {
  run_guard "$(bash_cmd "mv /tmp/a $MANAGED")"
  assert_denied
}

@test "DENY: cp onto a managed path" {
  run_guard "$(bash_cmd "cp /tmp/a $MANAGED")"
  assert_denied
}

@test "DENY: git checkout restoring over a managed path" {
  run_guard "$(bash_cmd "git checkout -- $MANAGED")"
  assert_denied
}

@test "DENY: a redirect into a managed path" {
  run_guard "$(bash_cmd "echo x > $MANAGED")"
  assert_denied
}

@test "DENY: an append redirect into a managed path" {
  run_guard "$(bash_cmd "printf hi >> $MANAGED")"
  assert_denied
}

@test "DENY: sed -i on a managed path" {
  run_guard "$(bash_cmd "sed -i '' s/a/b/ $MANAGED")"
  assert_denied
}

@test "DENY: tee into a managed path" {
  run_guard "$(bash_cmd "echo x | tee $MANAGED")"
  assert_denied
}

@test "DENY: a destructive segment after a harmless one" {
  run_guard "$(bash_cmd "ls -la && rm -f $MANAGED")"
  assert_denied
}

@test "DENY: an unrecognized command touching a managed path" {
  # Unknown commands are assumed to write. The safe direction is to refuse.
  run_guard "$(bash_cmd "my-formatter --write $MANAGED")"
  assert_denied
}

@test "DENY: chmod on a managed path" {
  run_guard "$(bash_cmd "chmod 777 $MANAGED")"
  assert_denied
}

# --- Bash: reads must survive ------------------------------------------

@test "ALLOW: reading a managed file into a pipeline that redirects elsewhere" {
  run_guard "$(bash_cmd "cat $MANAGED | grep -c x > /tmp/out")"
  assert_allowed
}

@test "ALLOW: grepping a managed file" {
  run_guard "$(bash_cmd "grep -n sentinel $MANAGED")"
  assert_allowed
}

@test "ALLOW: git diff on a managed file" {
  run_guard "$(bash_cmd "git diff -- $MANAGED")"
  assert_allowed
}

@test "ALLOW: sed without -i on a managed file" {
  run_guard "$(bash_cmd "sed -n 1,5p $MANAGED")"
  assert_allowed
}

@test "ALLOW: a command that touches nothing managed" {
  run_guard "$(bash_cmd "rm -rf build/ && npm test")"
  assert_allowed
}

@test "ALLOW: env prefixes and sudo do not hide the leading command" {
  run_guard "$(bash_cmd "FOO=1 cat $MANAGED")"
  assert_allowed
}

# --- degradation --------------------------------------------------------

@test "ALLOW: no lockfile means nothing is managed yet" {
  rm -f "$TMPROOT/.claude/kcc/kcc.lock.json"
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  assert_allowed
}

@test "ALLOW: unparseable stdin degrades open, never wedges the session" {
  run_guard "not json at all"
  assert_allowed
}

@test "the deny reason names the file and points at the source" {
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecisionReason | contains("kcc-dev-core:spec")'
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecisionReason | contains("kcc source repository")'
}
