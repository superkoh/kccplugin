#!/usr/bin/env bats
#
# L2 behavioural tests for the kcc-guard PreToolUse hook.
#
# What this guard is for: stopping an agent from modifying a managed file
# *without realising it is managed*, during ordinary work. It is not a
# security boundary. Someone who wants to get past it can, and that is fine —
# `--check` reports the drift and the next install restores the file exactly.
#
# That makes the error costs asymmetric, and in the opposite direction from
# what a security mindset assumes:
#
#   a miss          → the edit survives until the next upgrade overwrites it,
#                     with a backup. Cheap.
#   a false denial  → an agent is blocked mid-task on a legitimate command,
#                     during the daily use this feature exists to protect.
#                     Expensive, and confusing.
#
# So: the DENY list is small and unambiguous, and everything else is allowed,
# including commands the guard does not recognise. The ALLOW half of this
# matrix is therefore the more important half — it is the part that keeps the
# guard from being worse than not having one.

PLUGIN_ROOT="$BATS_TEST_DIRNAME/../.."
SCRIPT="$PLUGIN_ROOT/scripts/guard-managed-paths.sh"

MANAGED=".claude/skills/kcc-dev-core.spec/SKILL.md"

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
  # `if`, not `[[ … ]] && rm`: the && form returns 1 when the condition is
  # false, which turns a legitimate `skip` in setup into a teardown failure.
  if [[ -n "${TMPROOT:-}" && -d "$TMPROOT" ]]; then
    rm -rf "$TMPROOT"
  fi
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

write_to() {
  jq -nc --arg c "${2:-$TMPROOT}" --arg p "$1" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}'
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

# --- the file-editing tools: exact, and the main path an agent takes -----

@test "DENY: Write to a managed path" {
  run_guard "$(write_to "$MANAGED")"
  assert_denied
}

@test "DENY: Edit to a managed path given absolutely" {
  run_guard "$(jq -nc --arg p "$TMPROOT/$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Edit", cwd:$c, tool_input:{file_path:$p}}')"
  assert_denied
}

@test "DENY: an edit issued from a subdirectory with a relative path" {
  run_guard "$(write_to "SKILL.md" "$TMPROOT/.claude/skills/kcc-dev-core.spec")"
  assert_denied
}

@test "DENY: a managed path spelled with a leading ./" {
  run_guard "$(write_to "./$MANAGED")"
  assert_denied
}

@test "DENY: writing the lockfile, which is wholly ours" {
  run_guard "$(write_to ".claude/kcc/kcc.lock.json")"
  assert_denied
}

@test "ALLOW: settings.json is the project's file, not ours" {
  run_guard "$(write_to ".claude/settings.json")"
  assert_allowed
}

@test "ALLOW: Write to an unmanaged path in the same project" {
  run_guard "$(write_to "src/app.ts")"
  assert_allowed
}

@test "ALLOW: a read-shaped tool is never matched" {
  run_guard "$(jq -nc --arg p "$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Read", cwd:$c, tool_input:{file_path:$p}}')"
  assert_allowed
}

@test "ALLOW: an absolute path outside the project" {
  run_guard "$(write_to "/etc/hosts")"
  assert_allowed
}

# --- Bash: the shapes an agent actually writes a file with by accident ---

@test "DENY: rm on a managed path" {
  run_guard "$(bash_cmd "rm -rf $MANAGED")"
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

@test "DENY: sed -i, the bulk-edit-across-the-repo shape" {
  run_guard "$(bash_cmd "sed -i '' s/a/b/ $MANAGED")"
  assert_denied
}

@test "DENY: sed --in-place and clustered perl -pi spellings" {
  run_guard "$(bash_cmd "sed --in-place s/a/b/ $MANAGED")"
  assert_denied
  run_guard "$(bash_cmd "perl -pi -e s/a/b/ $MANAGED")"
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

@test "DENY: tee into a managed path" {
  run_guard "$(bash_cmd "echo x | tee $MANAGED")"
  assert_denied
}

@test "DENY: git checkout restoring over a managed path" {
  run_guard "$(bash_cmd "git checkout -- $MANAGED")"
  assert_denied
}

@test "DENY: chmod on a managed path" {
  run_guard "$(bash_cmd "chmod 777 $MANAGED")"
  assert_denied
}

@test "DENY: a write in a later segment of a compound command" {
  run_guard "$(bash_cmd "npm test && rm -f $MANAGED")"
  assert_denied
}

# --- Bash: everything else, which is the half that matters most ----------
#
# Each of these was denied by the previous deny-by-default design. Every one
# of them is something an agent does in ordinary work.

@test "ALLOW: git add, which the installer itself tells the user to run" {
  run_guard "$(bash_cmd "git add $MANAGED")"
  assert_allowed
}

@test "ALLOW: git status and git diff on a managed path" {
  run_guard "$(bash_cmd "git status --short $MANAGED")"
  assert_allowed
  run_guard "$(bash_cmd "git diff -- $MANAGED")"
  assert_allowed
}

@test "ALLOW: the shell test builtins" {
  run_guard "$(bash_cmd "[ -f $MANAGED ] && echo yes")"
  assert_allowed
}

@test "ALLOW: reading with an interpreter" {
  run_guard "$(bash_cmd "python3 -c \"print(open('$MANAGED').read())\"")"
  assert_allowed
}

@test "ALLOW: an unrecognized command that merely names a managed path" {
  # "Unknown therefore dangerous" is what produced the false denials. A miss
  # here costs an overwrite at the next upgrade; a denial costs the user a
  # blocked task today.
  run_guard "$(bash_cmd "npm test -- --filter=$MANAGED")"
  assert_allowed
}

@test "ALLOW: reading a managed file into a pipeline that redirects elsewhere" {
  run_guard "$(bash_cmd "cat $MANAGED | grep -c x > /tmp/out")"
  assert_allowed
}

@test "ALLOW: sed and perl when they are not editing in place" {
  run_guard "$(bash_cmd "sed -n 1,5p $MANAGED")"
  assert_allowed
}

@test "ALLOW: an input redirect from a managed file" {
  run_guard "$(bash_cmd "xargs ls < $MANAGED")"
  assert_allowed
}

@test "ALLOW: a destructive command in a different segment than the path" {
  # `rm` is present, but it operates on build/ — denying this would block a
  # perfectly ordinary two-part command.
  run_guard "$(bash_cmd "rm -rf build/ && cat $MANAGED")"
  assert_allowed
}

@test "ALLOW: a command that touches nothing managed" {
  run_guard "$(bash_cmd "rm -rf build/ && npm test")"
  assert_allowed
}

@test "ALLOW: a managed path named only in a trailing comment" {
  run_guard "$(bash_cmd "npm test  # touches $MANAGED")"
  assert_allowed
}

# --- degradation: a broken guard must never wedge a session --------------

@test "ALLOW: no lockfile means nothing is managed yet" {
  rm -f "$TMPROOT/.claude/kcc/kcc.lock.json"
  run_guard "$(write_to "$MANAGED")"
  assert_allowed
}

@test "ALLOW: unparseable stdin" {
  run_guard "not json at all"
  assert_allowed
}

@test "a Bash call with no file_path still guards the command" {
  # The fields arrive as one record; a tab separator collapsed the empty
  # file_path and shifted the command out of its variable, which disabled
  # Bash guarding entirely while every Write test stayed green.
  run_guard "$(bash_cmd "rm -rf $MANAGED")"
  assert_denied
}

@test "no stderr noise on a degenerate path" {
  local payload
  payload=$(write_to "..")
  run bash -c "printf '%s' '$payload' | CLAUDE_PROJECT_DIR='$TMPROOT' bash '$SCRIPT' 2>&1 1>/dev/null"
  [ -z "$output" ]
}

@test "the deny reason names the file and points at the source" {
  run_guard "$(write_to "$MANAGED")"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecisionReason | contains("kcc-dev-core.spec")'
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecisionReason | contains("kcc source repository")'
}
