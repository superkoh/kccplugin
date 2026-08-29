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

# --- forms a "does this look like a write?" heuristic misses -------------

@test "DENY: find -delete on a managed path" {
  run_guard "$(bash_cmd "find $MANAGED -delete")"
  assert_denied
}

@test "DENY: sort -o writing back over a managed path" {
  run_guard "$(bash_cmd "sort -o $MANAGED /etc/hosts")"
  assert_denied
}

@test "DENY: sed --in-place (long form) on a managed path" {
  run_guard "$(bash_cmd "sed --in-place s/a/b/ $MANAGED")"
  assert_denied
}

@test "DENY: perl -pi with clustered short flags" {
  run_guard "$(bash_cmd "perl -pi -e s/a/b/ $MANAGED")"
  assert_denied
}

@test "DENY: sed -i.bak on a managed path" {
  run_guard "$(bash_cmd "sed -i.bak s/a/b/ $MANAGED")"
  assert_denied
}

# --- non-canonical spellings of the same path ---------------------------

@test "DENY: Write to a managed path spelled with a leading ./" {
  run_guard "$(jq -nc --arg p "./$MANAGED" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  assert_denied
}

@test "DENY: Write to a managed path with an interior /./" {
  run_guard "$(jq -nc --arg p ".claude/./skills/kcc-dev-core:spec/SKILL.md" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  assert_denied
}

@test "DENY: Write to a managed path reached through .." {
  run_guard "$(jq -nc --arg p ".claude/kcc/../skills/kcc-dev-core:spec/SKILL.md" --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  assert_denied
}

# --- the guard's own arming files ---------------------------------------

@test "DENY: deleting the lockfile, which would disarm the guard entirely" {
  run_guard "$(bash_cmd "rm .claude/kcc/kcc.lock.json")"
  assert_denied
}

@test "ALLOW: settings.json is the project's file, not ours" {
  # The installer owns only the hook entries inside it. Guarding the whole
  # file would permanently block the team from adding their own hooks,
  # permissions or env — drift in our entries there is `--check`'s job.
  run_guard "$(jq -nc --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:".claude/settings.json"}}')"
  assert_allowed
}

@test "DENY: an Edit issued from a subdirectory, with a relative path" {
  # file_path is relative to the tool call's cwd, not the project root.
  run_guard "$(jq -nc --arg c "$TMPROOT/.claude/skills/kcc-dev-core:spec" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:"SKILL.md"}}')"
  assert_denied
}

@test "DENY: a path that walks out of the project and back in" {
  local base
  base=$(basename "$TMPROOT")
  run_guard "$(jq -nc --arg c "$TMPROOT" --arg p "../$base/$MANAGED" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:$p}}')"
  assert_denied
}

@test "DENY: a write hidden inside a command substitution" {
  run_guard "$(bash_cmd "echo \$(rm $MANAGED)")"
  assert_denied
}

@test "DENY: a write hidden inside backticks" {
  run_guard "$(bash_cmd "echo \`rm $MANAGED\`")"
  assert_denied
}

@test "ALLOW: git add, which the installer itself tells the user to run" {
  run_guard "$(bash_cmd "git add $MANAGED")"
  assert_allowed
}

@test "ALLOW: a managed path named only in a trailing comment" {
  run_guard "$(bash_cmd "npm test  # touches $MANAGED")"
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
  payload=$(jq -nc --arg c "$TMPROOT" '{tool_name:"Write", cwd:$c, tool_input:{file_path:".."}}')
  run bash -c "printf '%s' '$payload' | CLAUDE_PROJECT_DIR='$TMPROOT' bash '$SCRIPT' 2>&1 1>/dev/null"
  [ -z "$output" ]
}

@test "a path segment containing a glob is not expanded" {
  # `for seg in $p` word-splits with globbing on unless it is disabled, which
  # turned a `*` segment into a directory listing.
  run_guard "$(jq -nc --arg c "$TMPROOT" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:"a/*/b"}}')"
  assert_allowed
}
