#!/usr/bin/env bats
#
# End-to-end installer behaviour, offline and deterministic.
#
# These live outside the pure-function suites on purpose: every case here
# pins down a defect that unit tests could not reach because it lived at the
# seam between the planner and the filesystem, or in argument parsing, or in
# the shell wrapper. Each one was a real bug found by running the installer
# against a real directory.

REPO="$BATS_TEST_DIRNAME/../.."
I=(node "$REPO/installer/install.mjs")

setup() {
  command -v git >/dev/null 2>&1 || skip "git not on PATH"
  T=$(mktemp -d)
  git -C "$T" init -q
}

teardown() {
  # `if`, not `[[ … ]] && rm`: the && form returns 1 when the condition is
  # false, which turns a legitimate `skip` in setup into a teardown failure.
  if [[ -n "${T:-}" && -d "$T" ]]; then
    rm -rf "$T"
  fi
}

@test "an empty --modules list is refused, not treated as uninstall" {
  # `--modules "$UNSET_VAR"` in CI would otherwise wipe the repo's .claude/.
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run "${I[@]}" --target "$T" --modules "" -y
  [ "$status" -ne 0 ]
  [ -f "$T/.claude/kcc/kcc.lock.json" ]
  [[ "$output" == *"--uninstall"* ]]
}

@test "a directory at a managed path is a conflict, not a mid-apply crash" {
  mkdir -p "$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh"
  run "${I[@]}" --target "$T" --all -y
  [ "$status" -eq 1 ]
  [[ "$output" == *"directory"* ]]
  [ -z "$(find "$T" -name '*.kcc-tmp-*')" ]
  [ ! -f "$T/.claude/kcc/kcc.lock.json" ]
}

@test "a symlink at a managed path is refused and left intact" {
  mkdir -p "$T/.claude/kcc/kcc-core/scripts"
  echo PRECIOUS >"$T/precious.txt"
  ln -s "$T/precious.txt" "$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh"
  run "${I[@]}" --target "$T" --all -y
  [ "$status" -eq 1 ]
  [ -L "$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh" ]
  [ "$(cat "$T/precious.txt")" = "PRECIOUS" ]
}

@test "a pre-existing settings.json is never deleted, even when we add no hooks" {
  mkdir -p "$T/.claude"
  echo '{}' >"$T/.claude/settings.json"
  "${I[@]}" --target "$T" --modules kcc-pm -y >/dev/null 2>&1
  [ -f "$T/.claude/settings.json" ]
}

@test "the project's own settings survive, and our hooks are appended" {
  mkdir -p "$T/.claude"
  cat >"$T/.claude/settings.json" <<'EOF'
{
  "model": "opus",
  "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "./mine.sh" } ] } ] }
}
EOF
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run jq -r '.model' "$T/.claude/settings.json"
  [ "$output" = "opus" ]
  run jq -r '.hooks.SessionStart[0].hooks[0].command' "$T/.claude/settings.json"
  [ "$output" = "./mine.sh" ]
}

@test "the executable bit survives installation" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  [ -x "$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh" ]
}

@test "a pre-existing file at a pulled-in dependency's path is a conflict" {
  mkdir -p "$T/.claude/kcc/kcc-core/context"
  echo "someone else's file" >"$T/.claude/kcc/kcc-core/context/thinking-principles.md"
  run "${I[@]}" --target "$T" --modules kcc-dev-core -y
  [ "$status" -ne 0 ]
  grep -q "someone else's file" "$T/.claude/kcc/kcc-core/context/thinking-principles.md"
}

@test "install is idempotent and --check passes, fails on an edit, and repairs" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run "${I[@]}" --target "$T" --all -y
  [[ "$output" == *"already up to date"* ]]

  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 0 ]

  echo tampered >>"$T/.claude/skills/kcc-dev-core:spec/SKILL.md"
  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 1 ]

  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 0 ]
}

@test "uninstall removes everything but keeps the backups" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  echo tampered >>"$T/.claude/skills/kcc-dev-core:spec/SKILL.md"
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1 # displaces the edit into a backup
  "${I[@]}" --target "$T" --uninstall -y >/dev/null 2>&1
  [ ! -e "$T/.claude/skills" ]
  [ ! -e "$T/.claude/kcc/kcc.lock.json" ]
  [ -d "$T/.claude/kcc/.backup" ]
}

@test "the installed guard denies an edit to a managed file" {
  command -v jq >/dev/null 2>&1 || skip "jq not on PATH"
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  local guard="$T/.claude/kcc/kcc-guard/scripts/guard-managed-paths.sh"
  [ -f "$guard" ]
  local payload
  payload=$(jq -nc --arg c "$T" \
    '{tool_name:"Write", cwd:$c, tool_input:{file_path:".claude/skills/kcc-dev-core:spec/SKILL.md"}}')
  run bash -c "printf '%s' '$payload' | CLAUDE_PROJECT_DIR='$T' bash '$guard'"
  echo "$output" | jq -e '.hookSpecificOutput.permissionDecision == "deny"'
}

@test "uninstall without a lockfile removes nothing it did not create" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  # Something a project happened to keep in our directory, plus a lost lock.
  echo "not ours" >"$T/.claude/kcc/notes.md"
  rm -f "$T/.claude/kcc/kcc.lock.json"
  "${I[@]}" --target "$T" --uninstall -y >/dev/null 2>&1
  [ -f "$T/.claude/kcc/notes.md" ]
}

@test "uninstall with a lockfile removes exactly the modules it claims" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  echo "not ours" >"$T/.claude/kcc/notes.md"
  "${I[@]}" --target "$T" --uninstall -y >/dev/null 2>&1
  [ ! -e "$T/.claude/kcc/kcc-core" ]
  [ ! -e "$T/.claude/skills" ]
  [ -f "$T/.claude/kcc/notes.md" ]
}

@test "the lockfile records the ref even when no file content changed" {
  "${I[@]}" --target "$T" --all --ref v-first -y >/dev/null 2>&1
  run jq -r '.source.ref' "$T/.claude/kcc/kcc.lock.json"
  [ "$output" = "v-first" ]
  # Same bytes, new ref: the lock must still become truthful.
  "${I[@]}" --target "$T" --all --ref v-second -y >/dev/null 2>&1
  run jq -r '.source.ref' "$T/.claude/kcc/kcc.lock.json"
  [ "$output" = "v-second" ]
}

@test "the CLI actually reports a pulled-in dependency" {
  # Asserted here, through the real entry point, and not in plan.test.mjs:
  # the unit test passed while this was broken for every real invocation,
  # because it called computePlan with an unresolved selection — a shape
  # install.mjs never produces.
  run "${I[@]}" --target "$T" --modules kcc-dev-core -y
  [ "$status" -eq 0 ]
  [[ "$output" == *"required by your selection"* ]]
  [[ "$output" == *"kcc-core"* ]]
}

@test "no dependency line when the user asked for the dependency too" {
  run "${I[@]}" --target "$T" --modules kcc-core,kcc-dev-core -y
  [ "$status" -eq 0 ]
  [[ "$output" != *"required by your selection"* ]]
}

@test "uninstall keeps a settings.json the project created" {
  mkdir -p "$T/.claude"
  echo '{}' >"$T/.claude/settings.json"
  "${I[@]}" --target "$T" --modules kcc-core -y >/dev/null 2>&1
  "${I[@]}" --target "$T" --uninstall -y >/dev/null 2>&1
  [ -f "$T/.claude/settings.json" ]
}

@test "uninstall removes a settings.json that only ever held our hooks" {
  "${I[@]}" --target "$T" --modules kcc-core -y >/dev/null 2>&1
  [ -f "$T/.claude/settings.json" ]
  "${I[@]}" --target "$T" --uninstall -y >/dev/null 2>&1
  [ ! -f "$T/.claude/settings.json" ]
}

@test "an empty hook event the project wrote is preserved" {
  mkdir -p "$T/.claude"
  printf '{"hooks":{"PostToolUse":[]}}\n' >"$T/.claude/settings.json"
  "${I[@]}" --target "$T" --modules kcc-core -y >/dev/null 2>&1
  run jq -e '.hooks.PostToolUse | type == "array"' "$T/.claude/settings.json"
  [ "$status" -eq 0 ]
}

@test "a module the source no longer offers is dropped, not a hard failure" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  # Forge a lock entry for a module that does not exist upstream.
  tmp=$(mktemp)
  jq '.modules["kcc-gone"] = {version:"0.0.1", description:"", files:{"gone.md":"deadbeef"}}' \
    "$T/.claude/kcc/kcc.lock.json" >"$tmp" && mv "$tmp" "$T/.claude/kcc/kcc.lock.json"
  echo x >"$T/gone.md"
  # Non-interactive re-run: the default selection comes from the lock, and a
  # stale entry there must not make the upgrade path unusable.
  run "${I[@]}" --target "$T" -y
  [ "$status" -eq 0 ]
  [[ "$output" == *"no longer offered"* ]]
  [ ! -f "$T/gone.md" ]
}

@test "--check catches a gained executable bit too" {
  # Only the losing direction was covered; a plain file that gains +x has no
  # entry in the recorded set, so a one-directional check stays green.
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  chmod 755 "$T/.claude/skills/kcc-dev-core:spec/SKILL.md"
  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 1 ]
  [[ "$output" == *"mode:"* ]]
}

@test "the lockfile records an exec flag, never umask-dependent mode bits" {
  # Raw modes come from the source checkout's umask and git does not carry
  # them, so recording them made --check red on every teammate's machine.
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  run jq -r '.modules["kcc-core"] | has("modes")' "$T/.claude/kcc/kcc.lock.json"
  [ "$output" = "false" ]
  run jq -r '.modules["kcc-core"].exec | length' "$T/.claude/kcc/kcc.lock.json"
  [ "$output" -gt 0 ]
}

@test "uninstall keeps a settings.json written after a hookless install" {
  # createdSettings must mean "we wrote it", not "none existed at the time":
  # a hookless module writes no settings file, so marking it created makes a
  # later uninstall delete one the project authored in between.
  "${I[@]}" --target "$T" --modules kcc-pm -y >/dev/null 2>&1
  [ ! -f "$T/.claude/settings.json" ]
  mkdir -p "$T/.claude"
  echo '{}' >"$T/.claude/settings.json"
  "${I[@]}" --target "$T" --modules kcc-core,kcc-pm -y >/dev/null 2>&1
  "${I[@]}" --target "$T" --uninstall -y >/dev/null 2>&1
  [ -f "$T/.claude/settings.json" ]
}

@test "an empty hooks object the project wrote is preserved" {
  mkdir -p "$T/.claude"
  printf '{"model":"opus","hooks":{}}\n' >"$T/.claude/settings.json"
  "${I[@]}" --target "$T" --modules kcc-pm -y >/dev/null 2>&1
  run jq -e 'has("hooks")' "$T/.claude/settings.json"
  [ "$status" -eq 0 ]
}

@test "--help documents --ref, which install.sh always passes" {
  run "${I[@]}" --help
  [[ "$output" == *"--ref"* ]]
}

@test "--check catches a lost executable bit, and the installer repairs it" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  local script="$T/.claude/kcc/kcc-core/scripts/session-start-principles.sh"
  chmod 644 "$script"
  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 1 ]
  [[ "$output" == *"mode:"* ]]
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  [ -x "$script" ]
  run "${I[@]}" --target "$T" --check
  [ "$status" -eq 0 ]
}

@test "backup generations are pruned so a committed directory cannot grow forever" {
  "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
  local skill="$T/.claude/skills/kcc-dev-core:spec/SKILL.md"
  # Seven overwrite cycles; only the most recent five generations survive.
  for i in 1 2 3 4 5 6 7; do
    echo "edit $i" >>"$skill"
    "${I[@]}" --target "$T" --all -y >/dev/null 2>&1
    sleep 0.01
  done
  run bash -c "ls '$T/.claude/kcc/.backup' | wc -l | tr -d ' '"
  [ "$output" = "5" ]
}
